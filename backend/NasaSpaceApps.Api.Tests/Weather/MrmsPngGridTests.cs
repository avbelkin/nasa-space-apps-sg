using System.Buffers.Binary;
using System.IO.Compression;
using NasaSpaceApps.Api.Firms;
using NasaSpaceApps.Api.Weather;
using Xunit;

namespace NasaSpaceApps.Api.Tests.Weather;

public sealed class MrmsPngGridTests
{
    private static readonly DateTimeOffset Frame = new(2026, 11, 15, 8, 41, 42, TimeSpan.Zero);

    [Fact]
    public void SamplesMultipleLocationsFromOnePngAndKeepsRadarSentinelsDistinct()
    {
        var sample = MrmsPngGrid.Read(BuildRaster(), Frame,
            [Spot(55, -130), Spot(55, -129.99), Spot(54.99, -130), Spot(54.99, -129.99), Spot(52, -130)],
            CancellationToken.None);
        Assert.Equal(0, sample[0].Value);
        Assert.Equal("no_radar_echo", sample[1].MissingReason);
        Assert.Equal("no_source_coverage", sample[2].MissingReason);
        Assert.Equal(27.5, sample[3].Value);
        Assert.Equal("outside_coverage", sample[4].MissingReason);
        Assert.Throws<InvalidDataException>(() => MrmsPngGrid.Read(BuildRaster(), Frame.AddSeconds(1), [], CancellationToken.None));
    }

    private static FirmsHotspot Spot(double latitude, double longitude) =>
        new(latitude, longitude, 350, null, null, null, Frame, "T", "MODIS", "MODIS_NRT", "80", 80, "6.1NRT", 35, "D");

    private static byte[] BuildRaster()
    {
        using var image = new MemoryStream();
        image.Write(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 });
        var dimensions = new byte[13];
        Set32(dimensions, 0, 2);
        Set32(dimensions, 4, 2);
        dimensions[8] = 16;
        Chunk("IHDR"u8, dimensions);
        using var compressed = new MemoryStream();
        using (var zlib = new ZLibStream(compressed, CompressionLevel.Fastest, leaveOpen: true))
        {
            var rows = new byte[10];
            BinaryPrimitives.WriteUInt16BigEndian(rows.AsSpan(1), 9990);
            BinaryPrimitives.WriteUInt16BigEndian(rows.AsSpan(3), 9000);
            BinaryPrimitives.WriteUInt16BigEndian(rows.AsSpan(8), 10265);
            zlib.Write(rows);
        }
        Chunk("IDAT"u8, compressed.ToArray());
        Chunk("IEND"u8, []);

        using var grib = new MemoryStream();
        grib.Write("GRIB"u8);
        grib.Write(new byte[] { 0, 0, 209, 2, 0, 0, 0, 0, 0, 0, 0, 0 });
        var identification = Section(1, 21);
        BinaryPrimitives.WriteUInt16BigEndian(identification.AsSpan(12), 2026);
        new byte[] { 11, 15, 8, 41, 42 }.CopyTo(identification, 14);
        grib.Write(identification);
        var grid = Section(3, 72);
        Set32(grid, 30, 2);
        Set32(grid, 34, 2);
        Set32(grid, 46, 55_000_000);
        Set32(grid, 50, 230_000_000);
        Set32(grid, 63, 10_000);
        Set32(grid, 67, 10_000);
        grib.Write(grid);
        var product = Section(4, 34);
        product[9] = 11;
        grib.Write(product);
        var packing = Section(5, 21);
        Set32(packing, 5, 4);
        packing[10] = 41;
        BinaryPrimitives.WriteSingleBigEndian(packing.AsSpan(11), -9990);
        packing[18] = 1;
        packing[19] = 16;
        grib.Write(packing);
        var bitmap = Section(6, 6);
        bitmap[5] = 255;
        grib.Write(bitmap);
        var values = Section(7, checked((int)image.Length + 5));
        image.ToArray().CopyTo(values, 5);
        grib.Write(values);
        grib.Write("7777"u8);
        var file = grib.ToArray();
        BinaryPrimitives.WriteUInt64BigEndian(file.AsSpan(8), (ulong)file.Length);
        return file;

        void Chunk(ReadOnlySpan<byte> name, ReadOnlySpan<byte> data)
        {
            Span<byte> length = stackalloc byte[4];
            BinaryPrimitives.WriteUInt32BigEndian(length, (uint)data.Length);
            image.Write(length);
            image.Write(name);
            image.Write(data);
            image.Write(new byte[4]);
        }

        static byte[] Section(byte type, int length)
        {
            var bytes = new byte[length];
            Set32(bytes, 0, (uint)length);
            bytes[4] = type;
            return bytes;
        }

        static void Set32(byte[] bytes, int offset, uint value) =>
            BinaryPrimitives.WriteUInt32BigEndian(bytes.AsSpan(offset), value);
    }
}
