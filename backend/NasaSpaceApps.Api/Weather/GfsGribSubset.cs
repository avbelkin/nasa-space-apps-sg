using System.Buffers.Binary;
using System.Collections.Concurrent;

namespace NasaSpaceApps.Api.Weather;

// The NOMADS regional subset service repacks GFS fields with GRIB2 simple packing.
// Support the two grids used here and reject unrecognized encoding explicitly.
internal static class GfsGribSubset
{
    private static readonly ConcurrentDictionary<int, double[]> GaussianLatitudes = new();

    internal readonly record struct Parameter(int Discipline, int Category, int Number, int Surface, int Bottom, int Top);
    internal sealed record UnpackedField(
        Parameter Parameter,
        DateTimeOffset Run,
        DateTimeOffset Start,
        DateTimeOffset End,
        Grid Grid,
        byte[] Section1,
        byte[] Section3,
        byte[] Section4,
        int DecimalScaleFactor,
        double[] Values);

    internal sealed record Frame(DateTimeOffset Run, DateTimeOffset Start, DateTimeOffset End, Grid Grid, double?[] Data)
    {
        public double? Sample(double lat, double lon) => Data[Grid.Nearest(lat, lon)];

        public double? Interpolate(double lat, double lon)
        {
            var x = Math.Clamp(Math.IEEERemainder(lon - Grid.FirstLongitude, 360) / Grid.LongitudeStep, 0, Grid.Columns - 1);
            var left = (int)x;
            var right = Math.Min(left + 1, Grid.Columns - 1);
            var first = 0;
            var northward = Grid.Latitudes[^1] > Grid.Latitudes[0];
            while (first + 1 < Grid.Latitudes.Length && (northward ? Grid.Latitudes[first + 1] < lat : Grid.Latitudes[first + 1] > lat))
                first++;
            var second = Math.Min(first + 1, Grid.Latitudes.Length - 1);
            var rise = Grid.Latitudes[second] - Grid.Latitudes[first];
            var y = rise == 0 ? 0 : Math.Clamp((lat - Grid.Latitudes[first]) / rise, 0, 1);
            var u = x - left;
            var sum = 0d;
            var weight = 0d;
            Accumulate(first, left, (1 - y) * (1 - u));
            Accumulate(first, right, (1 - y) * u);
            Accumulate(second, left, y * (1 - u));
            Accumulate(second, right, y * u);
            return weight > 0 ? sum / weight : null;

            void Accumulate(int row, int column, double factor)
            {
                if (factor <= 0 || Data[row * Grid.Columns + column] is not { } sample) return;
                sum += factor * sample;
                weight += factor;
            }
        }
    }

    internal sealed record Grid(double FirstLongitude, double LongitudeStep, double[] Latitudes, int Columns)
    {
        public int Nearest(double lat, double lon)
        {
            var offset = Math.IEEERemainder(lon - FirstLongitude, 360);
            var column = Math.Clamp((int)Math.Round(offset / LongitudeStep), 0, Columns - 1);
            var row = 0;
            for (var i = 1; i < Latitudes.Length; i++)
                if (Math.Abs(Latitudes[i] - lat) < Math.Abs(Latitudes[row] - lat)) row = i;
            return row * Columns + column;
        }
    }

    internal static Dictionary<Parameter, Frame> Parse(ReadOnlySpan<byte> data)
    {
        var result = new Dictionary<Parameter, Frame>();
        while (!data.IsEmpty)
        {
            if (data.Length < 20 || !data[..4].SequenceEqual("GRIB"u8) || data[7] != 2)
                throw new InvalidDataException("Expected GRIB2 data from NOMADS.");
            var length = checked((int)BinaryPrimitives.ReadUInt64BigEndian(data[8..]));
            if (length < 20 || length > data.Length || !data.Slice(length - 4, 4).SequenceEqual("7777"u8))
                throw new InvalidDataException("Incomplete GRIB2 message.");
            ReadMessage(data[..length], result);
            data = data[length..];
        }
        return result;
    }

    /// <summary>Unpacks a global GRIB2 message encoded with simple (5.0), complex (5.2), or spatial-difference complex (5.3) packing.</summary>
    internal static IReadOnlyList<UnpackedField> UnpackGlobalMessage(ReadOnlySpan<byte> data)
    {
        var results = new List<UnpackedField>();
        while (!data.IsEmpty)
        {
            if (data.Length < 20 || !data[..4].SequenceEqual("GRIB"u8) || data[7] != 2)
                throw new InvalidDataException("Expected GRIB2 data from NOAA cloud archive.");
            var length = checked((int)BinaryPrimitives.ReadUInt64BigEndian(data[8..]));
            if (length < 20 || length > data.Length || !data.Slice(length - 4, 4).SequenceEqual("7777"u8))
                throw new InvalidDataException("Incomplete GRIB2 message.");
            UnpackMessage(data[..length], results);
            data = data[length..];
        }
        return results;
    }

    private static void UnpackMessage(ReadOnlySpan<byte> data, List<UnpackedField> results)
    {
        var run = default(DateTimeOffset);
        var grid = default(Grid);
        ReadOnlySpan<byte> identification = default, gridHeader = default, product = default,
            packing = default, bitmap = default, prevBitmap = default;
        for (var offset = 16; offset < data.Length - 4;)
        {
            var length = checked((int)U32(data, offset));
            if (length < 5 || length > data.Length - 4 - offset)
                throw new InvalidDataException("Invalid GRIB2 section.");
            var section = data.Slice(offset, length);
            switch (section[4])
            {
                case 1:
                    identification = section;
                    run = Date(section, 12);
                    break;
                case 3:
                    gridHeader = section;
                    grid = ReadGrid(section, allowGlobal: true);
                    break;
                case 4: product = section; break;
                case 5: packing = section; break;
                case 6:
                    bitmap = section;
                    if (section.Length >= 6 && section[5] is 0 or 255) prevBitmap = section;
                    break;
                case 7 when grid is not null && run != default && identification.Length >= 21 &&
                            gridHeader.Length >= 72 && product.Length >= 34 && packing.Length >= 21:
                    var activeBitmap = bitmap.Length >= 6 && bitmap[5] == 254 ? prevBitmap : bitmap;
                    if (TryExtractProduct(data[6], run, product, out var parameter, out var start, out var end))
                    {
                        var values = UnpackGlobalValues(packing, activeBitmap, section[5..],
                            grid.Columns * grid.Latitudes.Length);
                        results.Add(new UnpackedField(parameter, run, start, end, grid,
                            identification.ToArray(), gridHeader[..72].ToArray(), product.ToArray(),
                            SignMagnitude(U16(packing, 17), 16), values));
                    }
                    break;
            }
            offset += length;
        }
    }

    /// <summary>Slices unpacked global fields to a regional square tile and encodes them using GRIB2 simple packing (template 5.0).</summary>
    internal static byte[] SliceToSimpleGrib2(IReadOnlyList<UnpackedField> fields, int west, int south, int tileDegrees = 4)
    {
        using var stream = new MemoryStream(Math.Max(4096, fields.Count * 768));
        Span<byte> sec0 = stackalloc byte[16];
        Span<byte> sec5 = stackalloc byte[21];
        foreach (var field in fields)
        {
            var cols = field.Grid.Columns;
            var lats = field.Grid.Latitudes;
            var globalStepLon = Math.Abs(cols * Math.Abs(field.Grid.LongitudeStep) - 360d) < 0.05
                ? 360d / cols
                : Math.Abs(field.Grid.LongitudeStep);
            var deltaWest = (((west - field.Grid.FirstLongitude) % 360d) + 360d) % 360d;
            var firstCol = (int)Math.Ceiling(deltaWest / globalStepLon - 1e-9);
            var lastCol = (int)Math.Floor((deltaWest + tileDegrees) / globalStepLon + 1e-9);
            var subWidth = lastCol - firstCol + 1;

            var rows = new List<int>();
            for (var r = 0; r < lats.Length; r++)
                if (lats[r] >= south - 1e-6 && lats[r] <= south + tileDegrees + 1e-6) rows.Add(r);
            rows.Sort((a, b) => lats[a].CompareTo(lats[b]));
            var subHeight = rows.Count;
            if (subWidth is < 1 or > 256 || subHeight is < 1 or > 256)
                throw new InvalidDataException($"Unsupported sliced tile dimensions {subWidth}x{subHeight}.");

            var subCount = subWidth * subHeight;
            var subValues = new double[subCount];
            var validCount = 0;
            var decimalScaleFactor = field.DecimalScaleFactor;
            var decimalPow = Math.Pow(10, decimalScaleFactor);
            var yMin = double.PositiveInfinity;
            var yMax = double.NegativeInfinity;

            for (var r = 0; r < subHeight; r++)
            {
                var srcRow = rows[r] * cols;
                for (var c = 0; c < subWidth; c++)
                {
                    var wrappedCol = ((firstCol + c) % cols + cols) % cols;
                    var raw = field.Values[srcRow + wrappedCol];
                    if (double.IsNaN(raw) || !double.IsFinite(raw))
                    {
                        subValues[r * subWidth + c] = double.NaN;
                        continue;
                    }
                    var scaled = raw * decimalPow;
                    subValues[r * subWidth + c] = scaled;
                    if (scaled < yMin) yMin = scaled;
                    if (scaled > yMax) yMax = scaled;
                    validCount++;
                }
            }

            var hasBitmap = validCount < subCount;
            var reference = 0f;
            var binaryScaleFactor = 0;
            var bits = 0;
            if (validCount > 0)
            {
                reference = (float)yMin;
                if ((double)reference > yMin) reference = MathF.BitDecrement(reference);
                var span = yMax - (double)reference;
                if (span > 0)
                {
                    bits = 16;
                    binaryScaleFactor = (int)Math.Ceiling(Math.Log2(span / 65535d));
                    if (Math.Round(span / Math.ScaleB(1, binaryScaleFactor)) > 65535d) binaryScaleFactor++;
                }
            }
            else
            {
                decimalScaleFactor = 0;
            }

            var sec3 = (byte[])field.Section3.Clone();
            BinaryPrimitives.WriteUInt32BigEndian(sec3.AsSpan(0, 4), (uint)sec3.Length);
            BinaryPrimitives.WriteUInt32BigEndian(sec3.AsSpan(6, 4), (uint)subCount);
            BinaryPrimitives.WriteUInt32BigEndian(sec3.AsSpan(30, 4), (uint)subWidth);
            BinaryPrimitives.WriteUInt32BigEndian(sec3.AsSpan(34, 4), (uint)subHeight);
            var firstLonDeg = (((field.Grid.FirstLongitude + firstCol * globalStepLon) % 360d) + 360d) % 360d;
            var lastLonDeg = (((field.Grid.FirstLongitude + lastCol * globalStepLon) % 360d) + 360d) % 360d;
            WriteSignMagnitude32(sec3.AsSpan(46, 4), (long)Math.Round(lats[rows[0]] * 1_000_000d));
            WriteSignMagnitude32(sec3.AsSpan(50, 4), (long)Math.Round(firstLonDeg * 1_000_000d));
            WriteSignMagnitude32(sec3.AsSpan(55, 4), (long)Math.Round(lats[rows[^1]] * 1_000_000d));
            WriteSignMagnitude32(sec3.AsSpan(59, 4), (long)Math.Round(lastLonDeg * 1_000_000d));
            sec3[71] = 64; // South-to-north ascending latitude scan, matching regional subsets.

            sec5.Clear();
            BinaryPrimitives.WriteUInt32BigEndian(sec5[..4], 21u);
            sec5[4] = 5;
            BinaryPrimitives.WriteUInt32BigEndian(sec5[5..9], (uint)validCount);
            BinaryPrimitives.WriteUInt16BigEndian(sec5[9..11], 0);
            BinaryPrimitives.WriteSingleBigEndian(sec5[11..15], reference);
            WriteSignMagnitude16(sec5[15..17], binaryScaleFactor);
            WriteSignMagnitude16(sec5[17..19], decimalScaleFactor);
            sec5[19] = (byte)bits;
            sec5[20] = 0;

            var sec6Length = hasBitmap ? 6 + (subCount + 7) / 8 : 6;
            var sec6 = new byte[sec6Length];
            BinaryPrimitives.WriteUInt32BigEndian(sec6.AsSpan(0, 4), (uint)sec6Length);
            sec6[4] = 6;
            sec6[5] = hasBitmap ? (byte)0 : (byte)255;

            var dataBytes = (validCount * bits + 7) / 8;
            var sec7Length = 5 + dataBytes;
            var sec7 = new byte[sec7Length];
            BinaryPrimitives.WriteUInt32BigEndian(sec7.AsSpan(0, 4), (uint)sec7Length);
            sec7[4] = 7;

            if (hasBitmap || bits > 0)
            {
                var invBinaryScale = bits > 0 ? Math.ScaleB(1, -binaryScaleFactor) : 0d;
                var maxPacked = bits > 0 ? (1UL << bits) - 1UL : 0UL;
                var bitCursor = 0;
                for (var cell = 0; cell < subCount; cell++)
                {
                    var scaled = subValues[cell];
                    if (double.IsNaN(scaled)) continue;
                    if (hasBitmap) sec6[6 + (cell >> 3)] |= (byte)(1 << (7 - (cell & 7)));
                    if (bits > 0)
                    {
                        var quantized = Math.Round((scaled - (double)reference) * invBinaryScale);
                        var packed = quantized <= 0d ? 0UL
                            : quantized >= maxPacked ? maxPacked
                            : (ulong)quantized;
                        WriteBits(sec7.AsSpan(5), ref bitCursor, bits, packed);
                    }
                }
            }

            var messageLength = 16 + field.Section1.Length + sec3.Length + field.Section4.Length +
                                sec5.Length + sec6.Length + sec7.Length + 4;
            sec0.Clear();
            "GRIB"u8.CopyTo(sec0);
            sec0[6] = (byte)field.Parameter.Discipline;
            sec0[7] = 2;
            BinaryPrimitives.WriteUInt64BigEndian(sec0[8..16], (ulong)messageLength);

            stream.Write(sec0);
            stream.Write(field.Section1);
            stream.Write(sec3);
            stream.Write(field.Section4);
            stream.Write(sec5);
            stream.Write(sec6);
            stream.Write(sec7);
            stream.Write("7777"u8);
        }
        return stream.ToArray();
    }

    private static void ReadMessage(ReadOnlySpan<byte> data, Dictionary<Parameter, Frame> fields)
    {
        var run = default(DateTimeOffset);
        var grid = default(Grid);
        ReadOnlySpan<byte> product = default, packing = default, bitmap = default;
        for (var offset = 16; offset < data.Length - 4;)
        {
            var length = checked((int)U32(data, offset));
            if (length < 5 || length > data.Length - 4 - offset)
                throw new InvalidDataException("Invalid GRIB2 section.");
            var section = data.Slice(offset, length);
            switch (section[4])
            {
                case 1: run = Date(section, 12); break;
                case 3: grid = ReadGrid(section); break;
                case 4: product = section; break;
                case 5: packing = section; break;
                case 6: bitmap = section; break;
                case 7 when grid is not null && run != default && product.Length >= 34:
                    ReadField(data[6], grid, run, product, packing, bitmap, section[5..], fields);
                    break;
            }
            offset += length;
        }
    }

    private static void ReadField(int discipline, Grid grid, DateTimeOffset run, ReadOnlySpan<byte> product,
        ReadOnlySpan<byte> packing, ReadOnlySpan<byte> bitmap, ReadOnlySpan<byte> bytes, Dictionary<Parameter, Frame> fields)
    {
        if (packing.Length < 21 || bitmap.Length < 6 ||
            !TryExtractProduct(discipline, run, product, out var parameter, out var start, out var end))
            return;
        if (fields.TryGetValue(parameter, out var existing) && existing.End == end && existing.Start >= start)
            return; // Prefer an instantaneous field, or the shortest statistic, for the same endpoint.
        var count = grid.Columns * grid.Latitudes.Length;
        fields[parameter] = new Frame(run, start, end, grid, ReadValues(packing, bitmap, bytes, count));
    }

    private static bool TryExtractProduct(int discipline, DateTimeOffset run, ReadOnlySpan<byte> product,
        out Parameter parameter, out DateTimeOffset start, out DateTimeOffset end)
    {
        var template = U16(product, 7);
        if (template is not (0 or 8) || product[17] != 1)
        {
            parameter = default;
            start = default;
            end = default;
            return false;
        }
        start = run.AddHours(U32(product, 18));
        end = template == 8 ? Date(product, 34) : start;
        var surface = product[22];
        // Normalize pressure levels to Pa and soil layers to cm. Surface values
        // have no level coordinate in the fields we consume.
        var bottom = surface switch
        {
            100 or 103 => Level(product, 23, 1),
            106 => Level(product, 23, 100),
            _ => 0,
        };
        var top = surface == 106 ? Level(product, 29, 100) : 0;
        parameter = new Parameter(discipline, product[9], product[10], surface, bottom, top);
        return true;
    }

    private static int Level(ReadOnlySpan<byte> bytes, int offset, int units) =>
        checked((int)Math.Round(SignMagnitude(U32(bytes, offset + 1), 32) * Math.Pow(10, -SignMagnitude(bytes[offset], 8)) * units));

    private static Grid ReadGrid(ReadOnlySpan<byte> header, bool allowGlobal = false)
    {
        var template = U16(header, 12);
        var width = checked((int)U32(header, 30));
        var height = checked((int)U32(header, 34));
        var maxExtent = allowGlobal ? 4096 : 256;
        if (template is not (0 or 40) || width < 1 || width > maxExtent || height < 1 || height > maxExtent ||
            U32(header, 38) != 0 || (header[71] & 63) != 0)
            throw new InvalidDataException("Unsupported NOAA subset grid.");
        var scan = header[71];
        var firstLat = SignMagnitude(U32(header, 46), 32) / 1_000_000d;
        var firstLon = SignMagnitude(U32(header, 50), 32) / 1_000_000d;
        var lonStep = U32(header, 63) / 1_000_000d * ((scan & 128) == 0 ? 1 : -1);
        var direction = (scan & 64) == 0 ? -1 : 1;
        if (lonStep == 0)
            throw new InvalidDataException("Missing NOAA longitude spacing.");

        double[] latitudes;
        if (template == 40)
        {
            var parallelCount = checked((int)U32(header, 67) * 2);
            if (parallelCount is < 2 or > 4096)
                throw new InvalidDataException("Unsupported NOAA Gaussian grid.");
            var all = GaussianLatitudes.GetOrAdd(parallelCount, CalculateGaussianLatitudes);
            var origin = Array.BinarySearch(all, firstLat);
            if (origin < 0)
            {
                var next = ~origin;
                origin = next > 0 && (next == all.Length || firstLat - all[next - 1] < all[next] - firstLat) ? next - 1 : next;
            }
            if (origin + (height - 1) * direction < 0 || origin + (height - 1) * direction >= all.Length ||
                Math.Abs(all[origin] - firstLat) > 0.00001)
                throw new InvalidDataException("NOAA subset does not align with its Gaussian grid.");
            latitudes = Enumerable.Range(0, height).Select(index => all[origin + index * direction]).ToArray();
        }
        else
        {
            var latStep = U32(header, 67) / 1_000_000d * direction;
            latitudes = Enumerable.Range(0, height).Select(index => firstLat + index * latStep).ToArray();
        }
        return new Grid(firstLon, lonStep, latitudes, width);
    }

    private static double[] CalculateGaussianLatitudes(int count)
    {
        // Gaussian latitude sines are the roots of the Legendre polynomial.
        var rows = new double[count];
        for (var i = 0; i < count / 2; i++)
        {
            var root = Math.Cos(Math.PI * (i + 0.75) / (count + 0.5));
            for (var iteration = 0; iteration < 10; iteration++)
            {
                var previous = 0d;
                var current = 1d;
                for (var degree = 1; degree <= count; degree++)
                    (previous, current) = (current, ((2 * degree - 1) * root * current - (degree - 1) * previous) / degree);
                var delta = current / (count * (root * current - previous) / (root * root - 1));
                root -= delta;
                if (Math.Abs(delta) < 1e-14) break;
            }
            var latitude = Math.Asin(root) * 180 / Math.PI;
            rows[i] = -latitude;
            rows[count - 1 - i] = latitude;
        }
        return rows;
    }

    private static double?[] ReadValues(ReadOnlySpan<byte> packing, ReadOnlySpan<byte> bitmap,
        ReadOnlySpan<byte> data, int gridCount)
    {
        var count = U32(packing, 5);
        var bits = packing[19];
        var hasBitmap = bitmap[5] == 0;
        if (U16(packing, 9) != 0 || bits > 32 || bitmap[5] is not (0 or 255) || count > gridCount ||
            data.Length * 8L < count * bits || (hasBitmap && (bitmap.Length - 6) * 8 < gridCount))
            throw new InvalidDataException("Unsupported NOAA simple-packing payload.");

        var reference = BinaryPrimitives.ReadSingleBigEndian(packing[11..]);
        var binaryScale = Math.ScaleB(1, SignMagnitude(U16(packing, 15), 16));
        var decimalScale = Math.Pow(10, -SignMagnitude(U16(packing, 17), 16));
        var result = new double?[gridCount];
        var cursor = 0;
        var decodedCount = 0;
        for (var cell = 0; cell < gridCount; cell++)
        {
            if (hasBitmap && Bit(bitmap[6..], cell) == 0) continue;
            if (decodedCount >= count)
                throw new InvalidDataException("Mismatch between NOAA bitmap and value count.");
            var packed = 0u;
            for (var bit = 0; bit < bits; bit++) packed = (packed << 1) | Bit(data, cursor++);
            var value = (reference + packed * binaryScale) * decimalScale;
            result[cell] = double.IsFinite(value) ? value : null;
            decodedCount++;
        }
        if (decodedCount != count)
            throw new InvalidDataException("Mismatch between NOAA bitmap and value count.");
        return result;
    }

    private static double[] UnpackGlobalValues(ReadOnlySpan<byte> packing, ReadOnlySpan<byte> bitmap,
        ReadOnlySpan<byte> data, int gridCount)
    {
        var count = checked((int)U32(packing, 5));
        var template = U16(packing, 9);
        var bits = packing[19];
        if (bitmap.Length < 6 || bitmap[5] is not (0 or 255))
            throw new InvalidDataException("Unsupported NOAA bitmap section.");
        var hasBitmap = bitmap[5] == 0;
        if (count < 0 || count > gridCount || (hasBitmap && (bitmap.Length - 6) * 8L < gridCount))
            throw new InvalidDataException("Unsupported NOAA GRIB2 value count.");

        var result = new double[gridCount];
        if (count == 0)
        {
            if (!hasBitmap)
                throw new InvalidDataException("Unexpected zero value count without bitmap.");
            for (var cell = 0; cell < gridCount; cell++)
            {
                if (Bit(bitmap[6..], cell) != 0)
                    throw new InvalidDataException("Mismatch between NOAA bitmap and zero value count.");
            }
            Array.Fill(result, double.NaN);
            return result;
        }

        var reference = BinaryPrimitives.ReadSingleBigEndian(packing[11..]);
        var binaryScale = Math.ScaleB(1, SignMagnitude(U16(packing, 15), 16));
        var decimalScale = Math.Pow(10, -SignMagnitude(U16(packing, 17), 16));

        if (template == 0)
        {
            if (bits > 32 || data.Length * 8L < (long)count * bits)
                throw new InvalidDataException("Unsupported NOAA simple-packing payload.");
            var cursor = 0;
            var decodedCount = 0;
            for (var cell = 0; cell < gridCount; cell++)
            {
                if (hasBitmap && Bit(bitmap[6..], cell) == 0)
                {
                    result[cell] = double.NaN;
                    continue;
                }
                if (decodedCount >= count)
                    throw new InvalidDataException("Mismatch between NOAA bitmap and value count.");
                var packed = ReadBits(data, ref cursor, bits);
                var value = (reference + packed * binaryScale) * decimalScale;
                result[cell] = double.IsFinite(value) ? value : double.NaN;
                decodedCount++;
            }
            if (decodedCount != count)
                throw new InvalidDataException("Mismatch between NOAA bitmap and value count.");
            return result;
        }

        if (template is not (2 or 3))
            throw new InvalidDataException($"Unsupported GRIB2 data representation template {template}.");

        ReadComplexValues(packing, template, bits, data, count, out var unpacked, out var missing);
        var idx = 0;
        for (var cell = 0; cell < gridCount; cell++)
        {
            if (hasBitmap && Bit(bitmap[6..], cell) == 0)
            {
                result[cell] = double.NaN;
                continue;
            }
            if (idx >= count)
                throw new InvalidDataException("Mismatch between NOAA bitmap and complex value count.");
            if (missing?[idx] == 1)
            {
                result[cell] = double.NaN;
            }
            else
            {
                var value = (reference + unpacked[idx] * binaryScale) * decimalScale;
                result[cell] = double.IsFinite(value) ? value : double.NaN;
            }
            idx++;
        }
        if (idx != count)
            throw new InvalidDataException("Mismatch between NOAA bitmap and complex value count.");
        return result;
    }

    private static void ReadComplexValues(ReadOnlySpan<byte> packing, int template, int bits,
        ReadOnlySpan<byte> data, int count, out long[] unpacked, out byte[]? missing)
    {
        if ((template == 2 && packing.Length < 47) || (template == 3 && packing.Length < 49) || bits > 32)
            throw new InvalidDataException("Unsupported GRIB2 complex-packing section.");
        var miss = packing[22];
        if (miss > 2)
            throw new InvalidDataException($"Unsupported GRIB2 missing value mode {miss}.");
        var ng = checked((int)U32(packing, 31));
        if (ng < 1 || ng > count)
            throw new InvalidDataException("Invalid GRIB2 complex group count.");
        var refWidth = packing[35];
        var bitsWidth = packing[36];
        var refLen = U32(packing, 37);
        var lenInc = packing[41];
        var lastLen = U32(packing, 42);
        var bitsLen = packing[46];
        if (bitsWidth > 32 || bitsLen > 32)
            throw new InvalidDataException("Unsupported GRIB2 complex group metadata width.");

        var order = template == 3 ? packing[47] : 0;
        var extraOctets = template == 3 ? packing[48] : 0;
        long ival1 = 0, ival2 = 0, minsd = 0;
        var cursor = 0;
        if (template == 3 && extraOctets > 0)
        {
            if (order is not (1 or 2) || extraOctets > 8)
                throw new InvalidDataException("Unsupported GRIB2 spatial differencing header.");
            var extraBits = extraOctets * 8;
            ival1 = SignMagnitude64(ReadBits(data, ref cursor, extraBits), extraBits);
            if (order == 2) ival2 = SignMagnitude64(ReadBits(data, ref cursor, extraBits), extraBits);
            minsd = SignMagnitude64(ReadBits(data, ref cursor, extraBits), extraBits);
        }

        var x1 = new ulong[ng];
        for (var g = 0; g < ng; g++) x1[g] = ReadBits(data, ref cursor, bits);
        cursor = (cursor + 7) & ~7;

        var gw = new int[ng];
        for (var g = 0; g < ng; g++) gw[g] = checked((int)(refWidth + ReadBits(data, ref cursor, bitsWidth)));
        cursor = (cursor + 7) & ~7;

        var gl = new int[ng];
        for (var g = 0; g < ng; g++) gl[g] = checked((int)(refLen + lenInc * ReadBits(data, ref cursor, bitsLen)));
        gl[ng - 1] = checked((int)lastLen);
        cursor = (cursor + 7) & ~7;

        long total = 0;
        foreach (var len in gl) total += len;
        if (total != count)
            throw new InvalidDataException("Mismatch between GRIB2 complex group lengths and value count.");

        unpacked = new long[count];
        missing = miss != 0 ? new byte[count] : null;
        var x1Miss1 = bits > 0 ? (1UL << bits) - 1UL : ulong.MaxValue;
        var x1Miss2 = miss == 2 && bits >= 2 ? (1UL << bits) - 2UL : ulong.MaxValue;
        var idx = 0;
        for (var g = 0; g < ng; g++)
        {
            var w = gw[g];
            var len = gl[g];
            if (w > 32) throw new InvalidDataException("Unsupported GRIB2 complex packed value width.");
            if (w == 0)
            {
                var isGroupMissing = miss != 0 && (x1[g] == x1Miss1 || x1[g] == x1Miss2);
                for (var k = 0; k < len; k++)
                {
                    if (isGroupMissing) missing![idx++] = 1;
                    else unpacked[idx++] = (long)x1[g];
                }
                continue;
            }
            var wMiss1 = (1UL << w) - 1UL;
            var wMiss2 = miss == 2 && w >= 2 ? (1UL << w) - 2UL : ulong.MaxValue;
            for (var k = 0; k < len; k++)
            {
                var raw = ReadBits(data, ref cursor, w);
                if (miss != 0 && (raw == wMiss1 || raw == wMiss2)) missing![idx++] = 1;
                else unpacked[idx++] = (long)(x1[g] + raw);
            }
        }

        if (template == 3 && extraOctets > 0)
        {
            long last1 = 0, last2 = 0;
            var nonMissing = 0;
            for (var i = 0; i < count; i++)
            {
                if (missing?[i] == 1) continue;
                if (nonMissing == 0)
                {
                    unpacked[i] = ival1;
                    last1 = ival1;
                }
                else if (order == 2 && nonMissing == 1)
                {
                    unpacked[i] = ival2;
                    last2 = last1;
                    last1 = ival2;
                }
                else if (order == 1)
                {
                    last1 = unpacked[i] + minsd + last1;
                    unpacked[i] = last1;
                }
                else
                {
                    var current = unpacked[i] + minsd + 2 * last1 - last2;
                    last2 = last1;
                    last1 = current;
                    unpacked[i] = current;
                }
                nonMissing++;
            }
        }
    }

    private static ulong ReadBits(ReadOnlySpan<byte> data, ref int bitPos, int bitCount)
    {
        if (bitCount == 0) return 0UL;
        if ((uint)bitCount > 64 || (long)bitPos + bitCount > data.Length * 8L)
            throw new InvalidDataException("Unexpected end of GRIB2 bit stream.");
        var value = 0UL;
        var remaining = bitCount;
        while (remaining > 0)
        {
            var byteIndex = bitPos >> 3;
            var bitOffset = bitPos & 7;
            var take = Math.Min(remaining, 8 - bitOffset);
            var shift = 8 - bitOffset - take;
            var mask = (1u << take) - 1u;
            var chunk = ((uint)data[byteIndex] >> shift) & mask;
            value = (value << take) | chunk;
            bitPos += take;
            remaining -= take;
        }
        return value;
    }

    private static void WriteBits(Span<byte> data, ref int bitPos, int bitCount, ulong value)
    {
        for (var shift = bitCount - 1; shift >= 0; shift--)
        {
            if (((value >> shift) & 1UL) != 0)
                data[bitPos >> 3] |= (byte)(1 << (7 - (bitPos & 7)));
            bitPos++;
        }
    }

    private static long SignMagnitude64(ulong raw, int bits)
    {
        if (bits == 0) return 0;
        var sign = 1UL << (bits - 1);
        return (raw & sign) == 0 ? (long)raw : -(long)(raw & ~sign);
    }

    private static void WriteSignMagnitude32(Span<byte> dest, long value)
    {
        var encoded = value < 0 ? 0x8000_0000u | checked((uint)(-value)) : checked((uint)value);
        BinaryPrimitives.WriteUInt32BigEndian(dest, encoded);
    }

    private static void WriteSignMagnitude16(Span<byte> dest, int value)
    {
        var encoded = value < 0 ? (ushort)(0x8000 | checked((ushort)(-value))) : checked((ushort)value);
        BinaryPrimitives.WriteUInt16BigEndian(dest, encoded);
    }

    private static uint Bit(ReadOnlySpan<byte> bytes, int index) => (uint)(bytes[index / 8] >> (7 - index % 8)) & 1u;

    private static int SignMagnitude(uint value, int bits)
    {
        var sign = 1u << (bits - 1);
        return (value & sign) == 0 ? (int)value : -(int)(value & ~sign);
    }

    private static DateTimeOffset Date(ReadOnlySpan<byte> bytes, int start) => new(U16(bytes, start), bytes[start + 2],
        bytes[start + 3], bytes[start + 4], bytes[start + 5], bytes[start + 6], TimeSpan.Zero);

    private static ushort U16(ReadOnlySpan<byte> data, int start) => BinaryPrimitives.ReadUInt16BigEndian(data[start..]);
    private static uint U32(ReadOnlySpan<byte> data, int start) => BinaryPrimitives.ReadUInt32BigEndian(data[start..]);
}
