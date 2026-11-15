using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Caching.Memory;
using NasaSpaceApps.Api.Firms;

namespace NasaSpaceApps.Api.LandCover;

public interface ILandCoverEnricher
{
    Task<IReadOnlyList<FirmsHotspot>> EnrichAsync(IReadOnlyList<FirmsHotspot> spots, CancellationToken cancellationToken);
}

public sealed class PlanetaryComputerLandCover(
    IHttpClientFactory clients,
    ILogger<PlanetaryComputerLandCover> logger) : ILandCoverEnricher, IDisposable
{
    public const string HttpClientName = "LandCover";
    private const string TokenUrl = "https://planetarycomputer.microsoft.com/api/sas/v1/token/landcoverdata/esa-cci-lc";
    private const string AssetBase = "https://landcoverdata.blob.core.windows.net/esa-cci-lc/cog/v2.1.1";
    private const int Parallelism = 32;
    private const int AssetColumns = 8;
    private const int BlocksPerAsset = LandCoverCog.BlocksPerSide * LandCoverCog.BlocksPerSide;
    private static readonly TimeSpan BatchTimeout = TimeSpan.FromSeconds(12);
    private readonly MemoryCache cache = new(new MemoryCacheOptions { SizeLimit = 64 * 1024 * 1024 });
    private readonly SemaphoreSlim tokenLock = new(1);
    private readonly SemaphoreSlim rangeGate = new(Parallelism);
    private readonly SemaphoreSlim[] headerLocks = Enumerable.Range(0, 32).Select(_ => new SemaphoreSlim(1)).ToArray();
    private readonly LandCoverCog?[] headers = new LandCoverCog?[32];
    private TokenResponse? token;
    private DateTimeOffset tokenRetryAfter;

    private sealed record TokenResponse(string Token, [property: JsonPropertyName("msft:expiry")] DateTimeOffset Expires);
    private readonly record struct WeightedPixel(int Spot, int Pixel, ushort Weight);

    public async Task<IReadOnlyList<FirmsHotspot>> EnrichAsync(
        IReadOnlyList<FirmsHotspot> spots, CancellationToken cancellationToken)
    {
        if (spots.Count == 0) return spots;

        var work = GroupSamples(spots, cancellationToken);
        var counts = new ushort[spots.Count][];
        var incomplete = new bool[spots.Count];
        var failures = 0;
        var processed = 0;
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        deadline.CancelAfter(BatchTimeout);
        using var client = clients.CreateClient(HttpClientName);
        try
        {
            await Parallel.ForEachAsync(work, new ParallelOptions
            {
                CancellationToken = deadline.Token,
                MaxDegreeOfParallelism = Parallelism,
            }, async (group, ct) =>
            {
                byte[]? pixels = null;
                try
                {
                    pixels = await GetPixelsAsync(client, group.Key, ct);
                }
                catch (Exception ex) when (ex is HttpRequestException or IOException or InvalidDataException
                    or System.Text.Json.JsonException or OverflowException or OperationCanceledException)
                {
                    // Never log signed Azure URLs. Missing blocks leave affected footprints unknown.
                    Interlocked.Increment(ref failures);
                }

                lock (counts)
                {
                    processed++;
                    foreach (var sample in group.Value)
                    {
                        if (pixels is null)
                        {
                            incomplete[sample.Spot] = true;
                            continue;
                        }

                        var code = pixels[sample.Pixel];
                        var histogram = counts[sample.Spot] ??= new ushort[256];
                        histogram[code] += sample.Weight;
                    }
                }
            });
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            // The source has a fixed latency budget; FIRMS spots still reach the client.
        }

        cancellationToken.ThrowIfCancellationRequested();
        if (failures > 0 || processed != work.Count)
            logger.LogWarning("Land cover could not read {MissingBlocks} of {TotalBlocks} requested blocks.",
                failures + work.Count - processed, work.Count);

        var enriched = new FirmsHotspot[spots.Count];
        for (var i = 0; i < enriched.Length; i++)
        {
            var histogram = counts[i];
            // Since code zero counts toward the sample total, we can distinguish raster NoData from a missing block.
            var summary = !incomplete[i] && histogram is not null && SampleTotal(histogram) == LandCoverFootprint.SampleCount
                ? LandCoverFootprint.Summarize(histogram)
                : null;
            enriched[i] = summary is null ? spots[i] : spots[i] with { LandCover = summary };
        }

        return enriched;
    }

    private static int SampleTotal(ushort[] counts)
    {
        var total = 0;
        foreach (var count in counts) total += count;
        return total;
    }

    private static Dictionary<int, List<WeightedPixel>> GroupSamples(
        IReadOnlyList<FirmsHotspot> spots, CancellationToken cancellationToken)
    {
        var work = new Dictionary<int, List<WeightedPixel>>();
        Span<int> x = stackalloc int[LandCoverFootprint.SampleCount];
        Span<int> y = stackalloc int[LandCoverFootprint.SampleCount];
        Span<long> cells = stackalloc long[LandCoverFootprint.SampleCount];
        for (var i = 0; i < spots.Count; i++)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var spot = spots[i];
            if (!double.IsFinite(spot.Latitude) || Math.Abs(spot.Latitude) > 90 ||
                !double.IsFinite(spot.Longitude) || Math.Abs(spot.Longitude) > 180)
                continue;

            LandCoverFootprint.Sample(spot, x, y);
            for (var s = 0; s < cells.Length; s++)
                cells[s] = (long)y[s] * LandCoverFootprint.Width + x[s];
            cells.Sort();

            for (var start = 0; start < cells.Length;)
            {
                var end = start + 1;
                while (end < cells.Length && cells[end] == cells[start]) end++;
                var row = (int)(cells[start] / LandCoverFootprint.Width);
                var col = (int)(cells[start] % LandCoverFootprint.Width);
                var asset = row / LandCoverCog.AssetSize * AssetColumns + col / LandCoverCog.AssetSize;
                var localY = row % LandCoverCog.AssetSize;
                var localX = col % LandCoverCog.AssetSize;
                var block = localY / LandCoverCog.BlockSize * LandCoverCog.BlocksPerSide + localX / LandCoverCog.BlockSize;
                var id = asset * BlocksPerAsset + block;
                if (!work.TryGetValue(id, out var samples)) work[id] = samples = [];
                var pixel = localY % LandCoverCog.BlockSize * LandCoverCog.BlockSize + localX % LandCoverCog.BlockSize;
                samples.Add(new WeightedPixel(i, pixel, (ushort)(end - start)));
                start = end;
            }
        }

        return work;
    }

    private async Task<byte[]> GetPixelsAsync(HttpClient client, int id, CancellationToken ct)
    {
        if (cache.TryGetValue(id, out byte[]? compressed) && compressed is not null)
            return LandCoverCog.Decode(compressed);

        var asset = id / BlocksPerAsset;
        var path = AssetPath(asset);
        var header = Volatile.Read(ref headers[asset]);
        if (header is null)
        {
            await headerLocks[asset].WaitAsync(ct);
            try
            {
                header = headers[asset];
                if (header is null)
                {
                    var bytes = await ReadRangeAsync(client, path, 0, LandCoverCog.HeaderBytes, ct);
                    header = LandCoverCog.Read(bytes);
                    Volatile.Write(ref headers[asset], header);
                }
            }
            finally
            {
                headerLocks[asset].Release();
            }
        }

        var (offset, length) = header.GetBlock(id % BlocksPerAsset);
        compressed = await ReadRangeAsync(client, path, offset, length, ct);
        var pixels = LandCoverCog.Decode(compressed);
        cache.Set(id, compressed, new MemoryCacheEntryOptions { Size = compressed.Length + 128 });
        return pixels;
    }

    private async Task<byte[]> ReadRangeAsync(HttpClient client, string path, uint offset, int length, CancellationToken ct)
    {
        var signed = await GetTokenAsync(client, ct);
        await rangeGate.WaitAsync(ct);
        try
        {
            var end = (long)offset + length - 1;
            using var request = new HttpRequestMessage(HttpMethod.Get, path + "?" + signed);
            request.Headers.Range = new RangeHeaderValue(offset, end);
            using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
            var range = response.Content.Headers.ContentRange;
            if (response.StatusCode != HttpStatusCode.PartialContent || range?.Unit != "bytes" ||
                range.From != offset || range.To != end || response.Content.Headers.ContentLength != length)
                throw new InvalidDataException("Land cover source did not return the requested byte range.");

            var bytes = new byte[length];
            await using var stream = await response.Content.ReadAsStreamAsync(ct);
            await stream.ReadExactlyAsync(bytes, ct);
            return bytes;
        }
        finally
        {
            rangeGate.Release();
        }
    }

    private async Task<string> GetTokenAsync(HttpClient client, CancellationToken ct)
    {
        static bool IsFresh(TokenResponse? candidate) =>
            candidate is { Token.Length: > 0 } && candidate.Expires > DateTimeOffset.UtcNow.AddMinutes(2);

        var signed = Volatile.Read(ref token);
        if (IsFresh(signed)) return signed!.Token;

        await tokenLock.WaitAsync(ct);
        try
        {
            signed = token;
            if (!IsFresh(signed))
            {
                if (DateTimeOffset.UtcNow < tokenRetryAfter)
                    throw new InvalidDataException("Public land cover signing is temporarily unavailable.");

                try
                {
                    signed = await client.GetFromJsonAsync<TokenResponse>(TokenUrl, ct);
                    if (!IsFresh(signed)) throw new InvalidDataException("No valid public land cover token.");
                    Volatile.Write(ref token, signed);
                }
                catch when (!ct.IsCancellationRequested)
                {
                    // All blocks share the same token. Do not retry once per block during a signing outage.
                    tokenRetryAfter = DateTimeOffset.UtcNow.AddMinutes(1);
                    throw;
                }
            }

            return signed!.Token;
        }
        finally
        {
            tokenLock.Release();
        }
    }

    private static string AssetPath(int asset)
    {
        var south = 45 - asset / AssetColumns * 45;
        var west = -180 + asset % AssetColumns * 45;
        var tile = string.Create(CultureInfo.InvariantCulture,
            $"{(south < 0 ? 'S' : 'N')}{Math.Abs(south):00}{(west < 0 ? 'W' : 'E')}{Math.Abs(west):000}");
        return $"{AssetBase}/{tile}/2019/C3S-LC-L4-LCCS-Map-300m-P1Y-2019-v2.1.1-{tile}-lccs_class.tif";
    }

    public void Dispose()
    {
        cache.Dispose();
        rangeGate.Dispose();
        tokenLock.Dispose();
        foreach (var gate in headerLocks) gate.Dispose();
    }
}
