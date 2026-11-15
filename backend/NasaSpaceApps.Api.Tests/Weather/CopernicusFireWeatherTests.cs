using System.Buffers.Binary;
using System.IO.Compression;
using System.Net;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;
using NasaSpaceApps.Api.Firms;
using NasaSpaceApps.Api.Weather;
using Xunit;

namespace NasaSpaceApps.Api.Tests.Weather;

public sealed class CopernicusFireWeatherTests
{
    private const int Size = 64;

    [Fact]
    public async Task DailyWeatherUsesEachAcquisitionDateAndPreservesCoveredZero()
    {
        using var handler = new RasterHandler();
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var weather = new CopernicusFireWeather(new ClientFactory(handler), cache, NullLogger<CopernicusFireWeather>.Instance);
        var utc = new DateTimeOffset(2026, 11, 15, 0, 0, 0, TimeSpan.Zero);

        var result = await weather.EnrichAsync([
            Spot(utc.AddMinutes(-1).ToOffset(TimeSpan.FromHours(8))), Spot(utc.AddMinutes(1)),
            Spot(utc.AddMinutes(2)), null,
        ], CancellationToken.None);

        var earlier = Assert.IsType<HotspotWeatherSource>(result[0]);
        var later = Assert.IsType<HotspotWeatherSource>(result[1]);
        Assert.Null(result[3]);
        Assert.Equal(4, handler.RasterReads); // Four layers for the covered date, shared by both spots.
        Assert.Equal(new DateOnly(2026, 11, 14), earlier.Values["fire_weather_index"].ValidDateUtc);
        Assert.Equal("no_source_coverage", earlier.Values["fire_weather_index"].MissingReason);
        Assert.Null(earlier.Values["fire_weather_index"].Value);
        Assert.Equal(new DateOnly(2026, 11, 15), later.Values["fire_weather_index"].ValidDateUtc);
        Assert.Null(later.Values["fire_weather_index"].ValidThroughUtc);
        Assert.Equal(0d, later.Values["fire_weather_index"].Value);
        Assert.Equal(1d, later.Values["gwis_fire_danger_class"].Value);
    }

    [Theory]
    [InlineData(5.2f, 2)]
    [InlineData(11.2f, 3)]
    [InlineData(21.3f, 4)]
    [InlineData(38f, 5)]
    [InlineData(50f, 6)]
    [InlineData(70f, 7)]
    public void UsesPublishedDangerThresholds(float index, int expected) =>
        Assert.Equal(expected, CopernicusFireWeather.DangerClass(index));

    private static FirmsHotspot Spot(DateTimeOffset utc) =>
        new(45, 7, 350, null, null, null, utc, "T", "MODIS", "MODIS_NRT", "80", 80, "6.1NRT", 35, "D");

    private sealed class ClientFactory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, disposeHandler: false);
    }

    private sealed class RasterHandler : HttpMessageHandler
    {
        private int rasterReads;
        public int RasterReads => rasterReads;

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var query = request.RequestUri!.Query;
            var tif = query.Contains("image/tiff", StringComparison.Ordinal);
            if (tif)
                Interlocked.Increment(ref rasterReads);
            var payload = tif ? FloatTiff() : PngMask(query.Contains("TIME=2026-11-15", StringComparison.Ordinal));
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent(payload) });
        }
    }

    private static byte[] FloatTiff()
    {
        const int pixelOffset = 128;
        const int pixelBytes = Size * Size * sizeof(float);
        using var stream = new MemoryStream();
        using var writer = new BinaryWriter(stream);
        writer.Write(0x002A4949u);
        writer.Write(8u);
        (ushort Tag, uint Value)[] tags = [(256, Size), (257, Size), (258, 32), (273, pixelOffset),
            (278, Size), (279, pixelBytes), (339, 3)];
        writer.Write((ushort)tags.Length);
        foreach (var (tag, value) in tags)
        {
            writer.Write(tag);
            writer.Write((ushort)4);
            writer.Write(1u);
            writer.Write(value);
        }
        stream.SetLength(pixelOffset + pixelBytes);
        return stream.ToArray();
    }

    private static byte[] PngMask(bool covered)
    {
        var header = new byte[13];
        BinaryPrimitives.WriteInt32BigEndian(header, Size);
        BinaryPrimitives.WriteInt32BigEndian(header.AsSpan(4), Size);
        header[8] = 8;
        header[9] = 6;
        using var png = new MemoryStream();
        png.Write(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 });
        WriteChunk("IHDR"u8, header);
        using var compressed = new MemoryStream();
        using (var zlib = new ZLibStream(compressed, CompressionMode.Compress, leaveOpen: true))
        {
            var row = new byte[1 + Size * 4];
            for (var x = 0; x < Size; x++)
                row[x * 4 + 4] = covered ? byte.MaxValue : (byte)0;
            for (var y = 0; y < Size; y++)
                zlib.Write(row);
        }
        WriteChunk("IDAT"u8, compressed.ToArray());
        WriteChunk("IEND"u8, []);
        return png.ToArray();

        void WriteChunk(ReadOnlySpan<byte> name, ReadOnlySpan<byte> content)
        {
            Span<byte> length = stackalloc byte[4];
            BinaryPrimitives.WriteInt32BigEndian(length, content.Length);
            png.Write(length);
            png.Write(name);
            png.Write(content);
            png.Write(new byte[4]); // Chunk checksums are outside the sampler's format contract.
        }
    }
}
