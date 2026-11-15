using System.Buffers.Binary;
using System.IO.Compression;
using System.Net;
using System.Net.Http.Headers;
using Microsoft.Extensions.Logging.Abstractions;
using NasaSpaceApps.Api.Firms;
using NasaSpaceApps.Api.LandCover;
using Xunit;

namespace NasaSpaceApps.Api.Tests.LandCover;

public sealed class LandCoverEnrichmentTests
{
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task EnrichesAcrossFourTilesOrReturnsUnknownIfABlockIsUnavailable(bool missingBlock)
    {
        var factory = new TileSource(missingBlock);
        using var service = new PlanetaryComputerLandCover(factory, NullLogger<PlanetaryComputerLandCover>.Instance);
        var spot = new FirmsHotspot(0, -180, 350, null, 0.4, 0.4,
            DateTimeOffset.UtcNow, "NOAA-20", "viirs", "VIIRS_NOAA20_NRT", "n", 65, "2", 25, "D");

        var pending = await service.EnrichAsync([spot], fetchMissing: false, CancellationToken.None);
        Assert.True(pending.Pending);
        Assert.Null(Assert.Single(pending.Spots).LandCover);
        Assert.Equal(0, factory.SourceRequests);

        var results = await service.EnrichAsync([spot], fetchMissing: true, CancellationToken.None);
        var enrichment = Assert.Single(results.Spots).LandCover;
        if (missingBlock)
        {
            Assert.Null(enrichment);
            return;
        }

        Assert.False(results.Pending);
        var firstPassRequests = factory.SourceRequests;
        var nearby = spot with { Latitude = 0.00001 };
        var nextPass = await service.EnrichAsync([nearby], fetchMissing: true, CancellationToken.None);
        Assert.NotNull(Assert.Single(nextPass.Spots).LandCover);
        Assert.Equal(firstPassRequests, factory.SourceRequests);

        Assert.NotNull(enrichment);
        Assert.Equal(50, enrichment.DominantCode);
        Assert.Equal(0.75, enrichment.Coverage);
        Assert.Equal(new LandCoverShare[] { new(50, 0.667), new(210, 0.333) }, enrichment.Classes);
    }

    private sealed class TileSource(bool missingBlock) : IHttpClientFactory
    {
        public int SourceRequests => Volatile.Read(ref sourceRequests);
        private int sourceRequests;

        public HttpClient CreateClient(string name) =>
            new(new Handler(missingBlock, () => Interlocked.Increment(ref sourceRequests)));
    }

    private sealed class Handler(bool missingBlock, Action countRequest) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            countRequest();
            var uri = request.RequestUri!;
            if (uri.Host == "planetarycomputer.microsoft.com")
            {
                return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent(
                        $$"""{"token":"test=true","msft:expiry":"{{DateTimeOffset.UtcNow.AddHours(1):O}}"}"""),
                });
            }

            var path = uri.AbsolutePath;
            var value = path.Contains("S45W180", StringComparison.Ordinal) ? (byte)0 :
                path.Contains("N00E135", StringComparison.Ordinal) ? (byte)210 : (byte)50;
            var block = CompressBlock(value);
            var requested = Assert.Single(request.Headers.Range!.Ranges);
            var start = requested.From!.Value;
            if (start != 0 && missingBlock && path.Contains("N00E135", StringComparison.Ordinal))
                return Task.FromResult(new HttpResponseMessage(HttpStatusCode.ServiceUnavailable));

            var bytes = start == 0 ? BuildHeader(block.Length) : block;
            Assert.Equal(start + bytes.Length - 1, requested.To!.Value);
            var content = new ByteArrayContent(bytes);
            content.Headers.ContentRange = new ContentRangeHeaderValue(start, requested.To.Value, 40_000);
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.PartialContent) { Content = content });
        }

        private static byte[] CompressBlock(byte code)
        {
            var pixels = new byte[512 * 512];
            Array.Fill(pixels, code);
            using var output = new MemoryStream();
            using (var compressor = new ZLibStream(output, CompressionLevel.Fastest, leaveOpen: true))
                compressor.Write(pixels);
            return output.ToArray();
        }

        private static byte[] BuildHeader(int blockLength)
        {
            var bytes = new byte[32 * 1024];
            var entries = new (ushort Tag, ushort Type, uint Count, uint Value)[]
            {
                (256, 3, 1, 16200), (257, 3, 1, 16200), (258, 3, 1, 8), (259, 3, 1, 8),
                (277, 3, 1, 1), (317, 3, 1, 1), (322, 3, 1, 512), (323, 3, 1, 512),
                (324, 4, 1024, 4096), (325, 4, 1024, 8192),
            };
            BinaryPrimitives.WriteUInt32LittleEndian(bytes, 0x002A4949);
            BinaryPrimitives.WriteUInt32LittleEndian(bytes.AsSpan(4), 8);
            BinaryPrimitives.WriteUInt16LittleEndian(bytes.AsSpan(8), (ushort)entries.Length);
            for (var i = 0; i < entries.Length; i++)
            {
                var (tag, type, count, value) = entries[i];
                var entry = bytes.AsSpan(10 + i * 12);
                BinaryPrimitives.WriteUInt16LittleEndian(entry, tag);
                BinaryPrimitives.WriteUInt16LittleEndian(entry[2..], type);
                BinaryPrimitives.WriteUInt32LittleEndian(entry[4..], count);
                BinaryPrimitives.WriteUInt32LittleEndian(entry[8..], value);
            }

            for (var i = 0; i < 1024; i++)
            {
                BinaryPrimitives.WriteUInt32LittleEndian(bytes.AsSpan(4096 + i * 4), (uint)bytes.Length);
                BinaryPrimitives.WriteUInt32LittleEndian(bytes.AsSpan(8192 + i * 4), (uint)blockLength);
            }

            return bytes;
        }
    }
}
