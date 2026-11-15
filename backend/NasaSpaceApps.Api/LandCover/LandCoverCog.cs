using System.Buffers.Binary;
using System.IO.Compression;

namespace NasaSpaceApps.Api.LandCover;

// Reads the base image directory of the pinned Planetary Computer product.
// Its 2019 class assets are classic little-endian, tiled, 8-bit, Deflate GeoTIFFs.
internal sealed class LandCoverCog
{
    public const int AssetSize = 16_200;
    public const int BlockSize = 512;
    public const int BlocksPerSide = (AssetSize + BlockSize - 1) / BlockSize;
    public const int HeaderBytes = 32 * 1024;
    private const int BlockCount = BlocksPerSide * BlocksPerSide;

    private readonly (uint Offset, int Length)[] blocks;

    private LandCoverCog((uint, int)[] blocks) => this.blocks = blocks;

    public (uint Offset, int Length) GetBlock(int block) => blocks[block];

    public static LandCoverCog Read(ReadOnlySpan<byte> header)
    {
        if (U32(header, 0) != 0x002A4949)
            throw new InvalidDataException("The land cover asset is not a little-endian classic TIFF.");

        var directory = checked((int)U32(header, 4));
        var entryCount = U16(header, directory);
        var tags = new Dictionary<ushort, (ushort Type, uint Count, int ValueOffset)>();

        for (var i = 0; i < entryCount; i++)
        {
            var entry = directory + 2 + 12 * i;
            tags.Add(U16(header, entry), (U16(header, entry + 2), U32(header, entry + 4), entry + 8));
        }

        if (Scalar(header, tags, 256) != AssetSize || Scalar(header, tags, 257) != AssetSize ||
            Scalar(header, tags, 258) != 8 || Scalar(header, tags, 259) != 8 ||
            Scalar(header, tags, 277) != 1 || Scalar(header, tags, 317) != 1 ||
            Scalar(header, tags, 322) != BlockSize || Scalar(header, tags, 323) != BlockSize)
            throw new InvalidDataException("Unexpected layout in the land cover asset.");

        var offsets = BlockTable(header, tags, 324);
        var lengths = BlockTable(header, tags, 325);
        var blocks = new (uint, int)[BlockCount];
        for (var i = 0; i < blocks.Length; i++)
        {
            var offset = U32(header, offsets + i * 4);
            var length = U32(header, lengths + i * 4);
            if (offset < 8 || length is 0 or > BlockSize * BlockSize + 4096)
                throw new InvalidDataException("Invalid land cover block location.");
            blocks[i] = (offset, (int)length);
        }

        return new LandCoverCog(blocks);
    }

    public static byte[] Decode(byte[] compressed)
    {
        using var source = new MemoryStream(compressed, writable: false);
        using var zlib = new ZLibStream(source, CompressionMode.Decompress);
        var pixels = new byte[BlockSize * BlockSize];
        zlib.ReadExactly(pixels);
        if (zlib.ReadByte() != -1)
            throw new InvalidDataException("Land cover block exceeded its declared size.");
        return pixels;
    }

    private static uint Scalar(ReadOnlySpan<byte> header,
        Dictionary<ushort, (ushort Type, uint Count, int ValueOffset)> tags, ushort tag)
    {
        if (!tags.TryGetValue(tag, out var value) || value.Count != 1 || value.Type is not (3 or 4))
            throw new InvalidDataException($"Missing or invalid TIFF tag {tag}.");
        return value.Type == 3 ? U16(header, value.ValueOffset) : U32(header, value.ValueOffset);
    }

    private static int BlockTable(ReadOnlySpan<byte> header,
        Dictionary<ushort, (ushort Type, uint Count, int ValueOffset)> tags, ushort tag)
    {
        if (!tags.TryGetValue(tag, out var value) || value.Type != 4 || value.Count != BlockCount)
            throw new InvalidDataException($"Missing or invalid TIFF block table {tag}.");
        return checked((int)U32(header, value.ValueOffset));
    }

    private static ushort U16(ReadOnlySpan<byte> bytes, int offset)
    {
        if ((uint)offset > bytes.Length - 2)
            throw new InvalidDataException("Land cover TIFF header is truncated.");
        return BinaryPrimitives.ReadUInt16LittleEndian(bytes[offset..]);
    }

    private static uint U32(ReadOnlySpan<byte> bytes, int offset)
    {
        if ((uint)offset > bytes.Length - 4)
            throw new InvalidDataException("Land cover TIFF header is truncated.");
        return BinaryPrimitives.ReadUInt32LittleEndian(bytes[offset..]);
    }
}
