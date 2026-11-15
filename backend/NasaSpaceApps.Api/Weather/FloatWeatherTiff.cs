using System.Buffers.Binary;

namespace NasaSpaceApps.Api.Weather;

// The weather feeds use classic little-endian, uncompressed, single-band float TIFFs.
internal static class FloatWeatherTiff
{
    internal static float[] ReadValues(ReadOnlySpan<byte> tiff, int width, int height)
    {
        var tags = ReadDirectory(tiff);
        if (Scalar(tiff, tags, 256) != width || Scalar(tiff, tags, 257) != height ||
            Scalar(tiff, tags, 258) != 32 || Scalar(tiff, tags, 259, 1) != 1 ||
            Scalar(tiff, tags, 277, 1) != 1 || Scalar(tiff, tags, 339) != 3)
            throw new InvalidDataException("Unexpected weather TIFF dimensions or pixel format.");

        var rows = Scalar(tiff, tags, 278);
        if (rows <= 0) throw new InvalidDataException("Missing weather TIFF strip height.");
        rows = Math.Min(rows, height);
        var strips = (height + rows - 1) / rows;
        var offsets = tags.GetValueOrDefault(273);
        var lengths = tags.GetValueOrDefault(279);
        if (offsets.Count != strips || lengths.Count != strips)
            throw new InvalidDataException("Unexpected weather TIFF strip count.");

        var pixels = new float[width * height];
        var position = 0;
        for (var i = 0; i < strips; i++)
        {
            var offset = Integer(tiff, offsets, i);
            var length = Math.Min(rows, height - i * rows) * width * sizeof(float);
            if (offset < 8 || Integer(tiff, lengths, i) != length || offset > tiff.Length - length)
                throw new InvalidDataException("Invalid weather TIFF strip.");
            for (var end = offset + length; offset < end; offset += sizeof(float))
                pixels[position++] = BinaryPrimitives.ReadSingleLittleEndian(tiff[offset..]);
        }
        return pixels;
    }

    internal static (double West, double North, double Step) ReadWgs84Grid(ReadOnlySpan<byte> tiff)
    {
        var tags = ReadDirectory(tiff);
        var keys = tags.GetValueOrDefault(34735);
        if (keys.Type != 3 || keys.Count < 4 || keys.Count != 4 + 4 * Integer(tiff, keys, 3))
            throw new InvalidDataException("Invalid weather TIFF geospatial keys.");
        var required = new Dictionary<int, int> { [1024] = 2, [1025] = 1, [2048] = 4326 };
        for (var i = 4; i < keys.Count; i += 4)
            if (Integer(tiff, keys, i + 1) == 0 && Integer(tiff, keys, i + 2) == 1 &&
                required.TryGetValue(Integer(tiff, keys, i), out var value) && value == Integer(tiff, keys, i + 3))
                required.Remove(Integer(tiff, keys, i));
        if (required.Count != 0 || tags.ContainsKey(34264))
            throw new InvalidDataException("Expected an unrotated WGS84 pixel-area grid.");

        var scale = tags.GetValueOrDefault(33550);
        var origin = tags.GetValueOrDefault(33922);
        if (scale.Type != 12 || scale.Count != 3 || origin.Type != 12 || origin.Count != 6)
            throw new InvalidDataException("Missing weather TIFF georeferencing.");
        var step = Real(tiff, scale, 0);
        var stepY = Real(tiff, scale, 1);
        if (!double.IsFinite(step) || !double.IsFinite(stepY) || step is <= 0 or > 1 || Math.Abs(step - stepY) > 1e-9 ||
            Real(tiff, origin, 0) != 0 || Real(tiff, origin, 1) != 0)
            throw new InvalidDataException("Unexpected weather TIFF geographic spacing or anchor.");
        var west = Real(tiff, origin, 3);
        var north = Real(tiff, origin, 4);
        if (!double.IsFinite(west) || !double.IsFinite(north) || Math.Abs(west) > 180 || Math.Abs(north) > 90)
            throw new InvalidDataException("Invalid weather TIFF geographic origin.");
        return (west, north, step);
    }

    private static Dictionary<int, Tag> ReadDirectory(ReadOnlySpan<byte> tiff)
    {
        if (BinaryPrimitives.ReadUInt32LittleEndian(tiff) != 0x002A4949)
            throw new InvalidDataException("Expected a classic little-endian weather TIFF.");
        var directory = checked((int)BinaryPrimitives.ReadUInt32LittleEndian(tiff[4..]));
        var entries = BinaryPrimitives.ReadUInt16LittleEndian(tiff[directory..]);
        var tags = new Dictionary<int, Tag>();
        for (var i = 0; i < entries; i++)
        {
            var entry = tiff.Slice(checked(directory + 2 + i * 12), 12);
            var type = BinaryPrimitives.ReadUInt16LittleEndian(entry[2..]);
            var size = type switch { 3 => 2, 4 => 4, 12 => 8, _ => 0 };
            if (size == 0) continue;
            var count = checked((int)BinaryPrimitives.ReadUInt32LittleEndian(entry[4..]));
            var offset = checked(count * size) <= 4 ? directory + 10 + i * 12 :
                checked((int)BinaryPrimitives.ReadUInt32LittleEndian(entry[8..]));
            _ = tiff.Slice(offset, checked(count * size));
            tags[BinaryPrimitives.ReadUInt16LittleEndian(entry)] = new Tag(type, count, offset);
        }
        return tags;
    }

    private static int Scalar(ReadOnlySpan<byte> tiff, Dictionary<int, Tag> tags, int key, int fallback = 0) =>
        tags.TryGetValue(key, out var tag) && tag.Count == 1 ? Integer(tiff, tag, 0) : fallback;

    private static int Integer(ReadOnlySpan<byte> tiff, Tag tag, int index) => tag.Type switch
    {
        3 => BinaryPrimitives.ReadUInt16LittleEndian(tiff[(tag.Offset + index * 2)..]),
        4 => checked((int)BinaryPrimitives.ReadUInt32LittleEndian(tiff[(tag.Offset + index * 4)..])),
        _ => throw new InvalidDataException("Expected an integer weather TIFF tag."),
    };

    private static double Real(ReadOnlySpan<byte> tiff, Tag tag, int index) =>
        BinaryPrimitives.ReadDoubleLittleEndian(tiff[(tag.Offset + index * 8)..]);

    private readonly record struct Tag(int Type, int Count, int Offset);
}
