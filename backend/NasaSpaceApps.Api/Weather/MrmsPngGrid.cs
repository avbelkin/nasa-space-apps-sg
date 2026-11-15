using System.Buffers.Binary;
using System.IO.Compression;
using NasaSpaceApps.Api.Firms;

namespace NasaSpaceApps.Api.Weather;

internal static class MrmsPngGrid
{
    internal readonly record struct Sample(double? Value, string? MissingReason);

    internal static Sample[] Read(ReadOnlySpan<byte> grib, DateTimeOffset frame,
        IReadOnlyList<FirmsHotspot> spots, CancellationToken token)
    {
        if (grib.Length < 20 || !grib[..4].SequenceEqual("GRIB"u8) || grib[6] != 209 || grib[7] != 2 ||
            BinaryPrimitives.ReadUInt64BigEndian(grib[8..]) != (ulong)grib.Length ||
            !grib[^4..].SequenceEqual("7777"u8))
            throw new InvalidDataException("Expected one MRMS Level 2 GRIB2 message.");
        ReadOnlySpan<byte> grid = default, product = default, packing = default, png = default;
        for (var at = 16; at < grib.Length - 4;)
        {
            var length = checked((int)U32(grib, at));
            if (length < 5 || length > grib.Length - 4 - at)
                throw new InvalidDataException("Truncated MRMS GRIB2 section.");
            var section = grib.Slice(at, length);
            switch (section[4])
            {
                case 1:
                    if (section.Length < 21 || frame != new DateTimeOffset(U16(section, 12), section[14], section[15],
                        section[16], section[17], section[18], TimeSpan.Zero))
                        throw new InvalidDataException("MRMS frame date disagrees with its file name.");
                    break;
                case 3: grid = section; break;
                case 4: product = section; break;
                case 5: packing = section; break;
                case 6:
                    if (section.Length != 6 || section[5] != 255)
                        throw new InvalidDataException("Unsupported MRMS raster bitmap.");
                    break;
                case 7: png = section[5..]; break;
            }
            at += length;
        }
        if (grid.Length != 72 || U16(grid, 12) != 0 || grid[71] != 0 ||
            product.Length != 34 || product[9] != 11 || product[10] != 0 ||
            packing.Length != 21 || U16(packing, 9) != 41 || packing[19] != 16)
            throw new InvalidDataException("Unexpected MRMS base reflectivity grid or packing.");

        var width = checked((int)U32(grid, 30));
        var height = checked((int)U32(grid, 34));
        if (width is < 1 or > 7200 || height is < 1 or > 3600 || U32(packing, 5) != (uint)(width * height))
            throw new InvalidDataException("Invalid MRMS raster dimensions.");
        var north = Coordinate(grid, 46);
        var west = Coordinate(grid, 50);
        var dx = U32(grid, 63) / 1_000_000d;
        var dy = U32(grid, 67) / 1_000_000d;
        if (dx is <= 0 or > 1 || dy is <= 0 or > 1) throw new InvalidDataException("Invalid MRMS grid spacing.");
        var reference = BinaryPrimitives.ReadSingleBigEndian(packing[11..]);
        var binary = Math.Pow(2, Signed(U16(packing, 15), 0x8000));
        var decimalScale = Math.Pow(10, -Signed(U16(packing, 17), 0x8000));
        if (!float.IsFinite(reference) || !double.IsFinite(binary) || !double.IsFinite(decimalScale))
            throw new InvalidDataException("Invalid MRMS value scaling.");

        var samples = Enumerable.Repeat(new Sample(null, "outside_coverage"), spots.Count).ToArray();
        var rows = spots.Select((spot, index) => (Index: index, Row: (int)Math.Round((north - spot.Latitude) / dy),
            Column: (int)Math.Round(Math.IEEERemainder(spot.Longitude - west, 360) / dx)))
            .Where(point => point.Row >= 0 && point.Row < height && point.Column >= 0 && point.Column < width)
            .ToLookup(point => point.Row);
        if (rows.Count == 0) return samples;

        using var compressed = ReadImage(png, width, height);
        using var pixels = new ZLibStream(compressed, CompressionMode.Decompress);
        var previous = new byte[width * 2];
        var row = new byte[previous.Length];
        var lastRow = rows.Max(group => group.Key);
        for (var y = 0; y <= lastRow; y++)
        {
            token.ThrowIfCancellationRequested();
            var filter = pixels.ReadByte();
            if (filter is < 0 or > 4) throw new InvalidDataException("Invalid MRMS PNG filter.");
            pixels.ReadExactly(row);
            if (filter != 0)
            {
                for (var x = 0; x < row.Length; x++)
                {
                    var left = x >= 2 ? row[x - 2] : 0;
                    var up = previous[x];
                    var upperLeft = x >= 2 ? previous[x - 2] : 0;
                    row[x] = unchecked((byte)(row[x] + (filter switch
                    {
                        1 => left, 2 => up, 3 => (left + up) / 2, _ => FireWeatherRaster.Paeth(left, up, upperLeft),
                    })));
                }
            }
            foreach (var point in rows[y])
            {
                var packed = U16(row, point.Column * 2);
                var dbz = (reference + packed * binary) * decimalScale;
                samples[point.Index] = dbz switch
                {
                    >= -40 and <= 100 => new Sample(dbz, null),
                    >= -99.01 and <= -98.99 => new Sample(null, "no_radar_echo"),
                    _ => new Sample(null, "no_source_coverage"),
                };
            }
            (row, previous) = (previous, row);
        }
        return samples;
    }

    private static MemoryStream ReadImage(ReadOnlySpan<byte> png, int width, int height)
    {
        if (png.Length < 33 || !png[..8].SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }) ||
            !png.Slice(12, 4).SequenceEqual("IHDR"u8) || U32(png, 16) != width || U32(png, 20) != height ||
            png[24] != 16 || png[25] != 0 || png[26] != 0 || png[27] != 0 || png[28] != 0)
            throw new InvalidDataException("Expected a non-interlaced 16-bit grayscale MRMS PNG.");
        var result = new MemoryStream();
        try
        {
            for (var at = 8; at <= png.Length - 12;)
            {
                var length = checked((int)U32(png, at));
                if (length > png.Length - at - 12) throw new InvalidDataException("Truncated MRMS PNG chunk.");
                var type = png.Slice(at + 4, 4);
                if (type.SequenceEqual("IDAT"u8)) result.Write(png.Slice(at + 8, length));
                if (type.SequenceEqual("IEND"u8)) break;
                at += length + 12;
            }
            result.Position = 0;
            return result;
        }
        catch
        {
            result.Dispose();
            throw;
        }
    }

    private static double Coordinate(ReadOnlySpan<byte> bytes, int offset) => Signed(U32(bytes, offset), 0x80000000) / 1_000_000d;
    private static long Signed(uint value, uint sign) => (value & sign) == 0 ? value : -(long)(value & ~sign);
    private static ushort U16(ReadOnlySpan<byte> bytes, int offset) => BinaryPrimitives.ReadUInt16BigEndian(bytes[offset..]);
    private static uint U32(ReadOnlySpan<byte> bytes, int offset) => BinaryPrimitives.ReadUInt32BigEndian(bytes[offset..]);
}
