using System.Buffers.Binary;
using System.Collections.Concurrent;

namespace NasaSpaceApps.Api.Weather;

// The NOMADS regional subset service repacks GFS fields with GRIB2 simple packing.
// Support the two grids used here and reject unrecognized encoding explicitly.
internal static class GfsGribSubset
{
    private static readonly ConcurrentDictionary<int, double[]> GaussianLatitudes = new();

    internal readonly record struct Parameter(int Discipline, int Category, int Number, int Surface, int Bottom, int Top);
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
        var template = U16(product, 7);
        if (template is not (0 or 8) || product[17] != 1 || packing.Length < 21 || bitmap.Length < 6)
            return;
        var start = run.AddHours(U32(product, 18));
        var end = template == 8 ? Date(product, 34) : start;
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
        var parameter = new Parameter(discipline, product[9], product[10], surface, bottom, top);
        if (fields.TryGetValue(parameter, out var existing) && existing.End == end && existing.Start >= start)
            return; // Prefer an instantaneous field, or the shortest statistic, for the same endpoint.
        var count = grid.Columns * grid.Latitudes.Length;
        fields[parameter] = new Frame(run, start, end, grid, ReadValues(packing, bitmap, bytes, count));
    }

    private static int Level(ReadOnlySpan<byte> bytes, int offset, int units) =>
        checked((int)Math.Round(SignMagnitude(U32(bytes, offset + 1), 32) * Math.Pow(10, -SignMagnitude(bytes[offset], 8)) * units));

    private static Grid ReadGrid(ReadOnlySpan<byte> header)
    {
        var template = U16(header, 12);
        var width = checked((int)U32(header, 30));
        var height = checked((int)U32(header, 34));
        if (template is not (0 or 40) || width is < 1 or > 256 || height is < 1 or > 256 ||
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
