using System.Buffers.Binary;
using System.IO.Compression;

namespace NasaSpaceApps.Api.Weather;

// The fire-weather WMS serves uncompressed, single-band float TIFFs, and
// matching transparent RGBA PNGs that mask sea and unavailable data.
internal static class FireWeatherRaster
{
    public static float[] ReadValues(ReadOnlySpan<byte> tiff, int size) =>
        FloatWeatherTiff.ReadValues(tiff, size, size);

    public static float[] ReadValues(ReadOnlySpan<byte> tiff, int width, int height) =>
        FloatWeatherTiff.ReadValues(tiff, width, height);

    public static byte[] ReadCoverage(ReadOnlySpan<byte> png, int size) =>
        ReadCoverage(png, size, size);

    public static byte[] ReadCoverage(ReadOnlySpan<byte> png, int width, int height)
    {
        if (png.Length < 33 || !png[..8].SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }) ||
            !png.Slice(12, 4).SequenceEqual("IHDR"u8) || BinaryPrimitives.ReadUInt32BigEndian(png[16..]) != width ||
            BinaryPrimitives.ReadUInt32BigEndian(png[20..]) != height || png[24] != 8 || png[25] != 6 ||
            png[26] != 0 || png[27] != 0 || png[28] != 0)
        {
            throw new InvalidDataException("Unexpected fire-weather mask format.");
        }

        using var compressed = new MemoryStream();
        for (var start = 8; start <= png.Length - 12;)
        {
            var length = checked((int)BinaryPrimitives.ReadUInt32BigEndian(png[start..]));
            if (length > png.Length - start - 12)
                throw new InvalidDataException("Truncated fire-weather PNG chunk.");
            var type = png.Slice(start + 4, 4);
            if (type.SequenceEqual("IDAT"u8))
                compressed.Write(png.Slice(start + 8, length));
            if (type.SequenceEqual("IEND"u8))
                break;
            start += length + 12;
        }

        compressed.Position = 0;
        using var image = new ZLibStream(compressed, CompressionMode.Decompress);
        const int channels = 4;
        var alpha = new byte[width * height];
        var previous = new byte[width * channels];
        var row = new byte[previous.Length];
        for (var y = 0; y < height; y++)
        {
            var filter = image.ReadByte();
            image.ReadExactly(row);
            for (var x = 0; x < row.Length; x++)
            {
                var left = x >= channels ? row[x - channels] : 0;
                var upperLeft = x >= channels ? previous[x - channels] : 0;
                row[x] = unchecked((byte)(row[x] + (filter switch
                {
                    0 => 0,
                    1 => left,
                    2 => previous[x],
                    3 => (left + previous[x]) / 2,
                    4 => Paeth(left, previous[x], upperLeft),
                    _ => throw new InvalidDataException("Invalid fire-weather PNG filter."),
                })));
            }

            for (var x = 0; x < width; x++)
                alpha[y * width + x] = row[x * channels + 3];
            (previous, row) = (row, previous);
        }

        if (image.ReadByte() != -1)
            throw new InvalidDataException("Fire-weather PNG exceeded its declared dimensions.");
        return alpha;
    }

    private static int Paeth(int left, int up, int diagonal)
    {
        var prediction = left + up - diagonal;
        var a = Math.Abs(prediction - left);
        var b = Math.Abs(prediction - up);
        var c = Math.Abs(prediction - diagonal);
        return a <= b && a <= c ? left : b <= c ? up : diagonal;
    }
}
