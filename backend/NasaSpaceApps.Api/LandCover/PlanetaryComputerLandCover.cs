using System.Collections.Concurrent;
using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Microsoft.Extensions.Caching.Memory;
using NasaSpaceApps.Api.Firms;

namespace NasaSpaceApps.Api.LandCover;

public sealed record LandCoverResult(IReadOnlyList<FirmsHotspot> Spots, bool Pending);

public interface ILandCoverEnricher
{
    Task<LandCoverResult> EnrichAsync(
        IReadOnlyList<FirmsHotspot> spots, bool fetchMissing, CancellationToken cancellationToken, bool world = false);
}

public sealed class PlanetaryComputerLandCover(
    IHttpClientFactory clients,
    ILogger<PlanetaryComputerLandCover> logger) : ILandCoverEnricher, IDisposable
{
    public const string HttpClientName = "LandCover";
    private const string TokenUrl = "https://planetarycomputer.microsoft.com/api/sas/v1/token/landcoverdata/esa-cci-lc";
    private const string AssetBase = "https://landcoverdata.blob.core.windows.net/esa-cci-lc/cog/v2.1.1";
    private const int Parallelism = 4;
    private const int MaxSourceRequests = 160;
    private const int MaxSpotsPerPass = 100_000;
    private const int AssetColumns = 8;
    private const int AssetCount = 32;
    private const int BlocksPerAsset = LandCoverCog.BlocksPerSide * LandCoverCog.BlocksPerSide;
    private static readonly TimeSpan PassTimeout = TimeSpan.FromSeconds(42);
    private static readonly TimeSpan RetryDelay = TimeSpan.FromMinutes(2);

    private readonly MemoryCache cache = new(new MemoryCacheOptions { SizeLimit = 64 * 1024 * 1024 });
    private readonly MemoryCache summaries = new(new MemoryCacheOptions { SizeLimit = 32 * 1024 * 1024 });
    private readonly SemaphoreSlim deferredPass = new(1);
    private readonly TokenBucketRateLimiter sourceRate = new(new TokenBucketRateLimiterOptions
    {
        TokenLimit = Parallelism,
        TokensPerPeriod = Parallelism,
        ReplenishmentPeriod = TimeSpan.FromSeconds(1),
        QueueLimit = Parallelism,
        QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
        AutoReplenishment = true,
    });
    private readonly SemaphoreSlim tokenLock = new(1);
    private readonly SemaphoreSlim[] headerLocks = Enumerable.Range(0, AssetCount).Select(_ => new SemaphoreSlim(1)).ToArray();
    private readonly byte[]?[] headers = new byte[]?[AssetCount];
    private readonly LandCoverCog?[] directories = new LandCoverCog?[2 * AssetCount];
    private TokenResponse? token;
    private DateTimeOffset tokenRetryAfter;
    private int remainingSourceRequests;
    private string? offlineBlockCacheDir;
    private bool offlineMode;
    private ConcurrentDictionary<FootprintKey, LandCoverSummary?>? offlineSummaries;
    private TimeSpan offlinePassTimeout = PassTimeout;

    private sealed record TokenResponse(string Token, [property: JsonPropertyName("msft:expiry")] DateTimeOffset Expires);
    private readonly record struct WeightedPixel(int Spot, int Pixel, ushort Weight);
    private readonly record struct FootprintKey(double Latitude, double Longitude, double Radius, bool World)
    {
        public static FootprintKey From(FirmsHotspot spot, bool world) =>
            new(spot.Latitude, spot.Longitude, LandCoverFootprint.RadiusMeters(spot), world);
    }

    public async Task<LandCoverResult> EnrichAsync(
        IReadOnlyList<FirmsHotspot> spots, bool fetchMissing, CancellationToken cancellationToken, bool world = false)
    {
        if (fetchMissing && deferredPass.Wait(0, cancellationToken))
        {
            try
            {
                var missing = spots.Where(spot => HasValidCoordinates(spot) &&
                        !summaries.TryGetValue(FootprintKey.From(spot, world), out _))
                    .DistinctBy(spot => FootprintKey.From(spot, world))
                    .Take(MaxSpotsPerPass)
                    .ToArray();
                if (missing.Length > 0)
                {
                    remainingSourceRequests = MaxSourceRequests;
                    await FillCacheAsync(missing, world, cancellationToken);
                }
            }
            finally
            {
                deferredPass.Release();
            }
        }

        var result = new FirmsHotspot[spots.Count];
        var pending = false;
        for (var i = 0; i < spots.Count; i++)
        {
            var spot = spots[i];
            if (summaries.TryGetValue(FootprintKey.From(spot, world), out LandCoverSummary? summary))
                result[i] = summary is null ? spot : spot with { LandCover = summary };
            else
            {
                pending |= HasValidCoordinates(spot);
                result[i] = spot;
            }
        }

        return new LandCoverResult(result, pending);
    }

    internal async Task<IReadOnlyList<FirmsHotspot>> EnrichOfflineCompleteAsync(
        IReadOnlyList<FirmsHotspot> spots,
        bool world,
        string? blockCacheDir,
        CancellationToken cancellationToken)
    {
        offlineBlockCacheDir = blockCacheDir;
        if (!string.IsNullOrEmpty(blockCacheDir))
            Directory.CreateDirectory(blockCacheDir);
        offlinePassTimeout = TimeSpan.FromMinutes(20);
        offlineMode = true;
        var collected = new ConcurrentDictionary<FootprintKey, LandCoverSummary?>();
        offlineSummaries = collected;
        await deferredPass.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var missing = spots.Where(HasValidCoordinates)
                .DistinctBy(spot => FootprintKey.From(spot, world))
                .ToArray();
            if (missing.Length > 0)
            {
                remainingSourceRequests = int.MaxValue;
                await FillCacheAsync(missing, world, cancellationToken).ConfigureAwait(false);
            }
        }
        finally
        {
            offlineMode = false;
            offlineSummaries = null;
            offlinePassTimeout = PassTimeout;
            offlineBlockCacheDir = null;
            deferredPass.Release();
        }

        var result = new FirmsHotspot[spots.Count];
        for (var i = 0; i < spots.Count; i++)
        {
            var spot = spots[i];
            if (collected.TryGetValue(FootprintKey.From(spot, world), out var summary) && summary is not null)
                result[i] = spot with { LandCover = summary };
            else
                result[i] = spot;
        }
        return result;
    }

    private async Task FillCacheAsync(FirmsHotspot[] spots, bool world, CancellationToken cancellationToken)
    {
        var work = GroupSamples(spots, world, cancellationToken);
        var counts = new ushort[spots.Length][];
        var failedBlocks = 0;
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        deadline.CancelAfter(offlinePassTimeout);
        using var client = clients.CreateClient(HttpClientName);
        try
        {
            // A cold pass should classify the most spots possible before it reaches the request cap.
            var busiestBlocksFirst = work.OrderByDescending(group => group.Value.Count);
            await Parallel.ForEachAsync(busiestBlocksFirst, new ParallelOptions
            {
                CancellationToken = deadline.Token,
                MaxDegreeOfParallelism = offlineMode ? 16 : Parallelism,
            }, async (group, ct) =>
            {
                var pixels = await GetAvailablePixelsAsync(client, group.Key, ct);
                if (pixels is null)
                {
                    Interlocked.Increment(ref failedBlocks);
                    return;
                }

                lock (counts)
                {
                    foreach (var sample in group.Value)
                    {
                        var code = pixels[sample.Pixel];
                        var histogram = counts[sample.Spot] ??= new ushort[256];
                        histogram[code] += sample.Weight;
                    }
                }
            });
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            // Publish complete footprints even if this pass reached its time budget.
        }

        cancellationToken.ThrowIfCancellationRequested();
        if (failedBlocks > 0)
            logger.LogDebug("Land cover left {Blocks} raster blocks pending during this pass.", failedBlocks);

        for (var i = 0; i < spots.Length; i++)
        {
            var histogram = counts[i];
            // Class zero contributes to completion but represents raster NoData.
            if (histogram is null || SampleTotal(histogram) != LandCoverFootprint.SampleCount) continue;

            var summary = LandCoverFootprint.Summarize(histogram);
            var key = FootprintKey.From(spots[i], world);
            if (offlineSummaries is not null)
                offlineSummaries[key] = summary;
            else
                summaries.Set(key, summary, new MemoryCacheEntryOptions { Size = 128 + (summary?.Classes.Count ?? 0) * 32 });
        }
    }

    private async Task<byte[]?> GetAvailablePixelsAsync(HttpClient client, int id, CancellationToken ct)
    {
        if (cache.TryGetValue(id, out byte[]? compressed))
            return compressed is null ? null : LandCoverCog.Decode(compressed);

        var diskPath = !string.IsNullOrEmpty(offlineBlockCacheDir)
            ? Path.Combine(offlineBlockCacheDir, $"{id}.zlib")
            : null;
        if (diskPath is not null && File.Exists(diskPath))
        {
            var cachedBytes = await File.ReadAllBytesAsync(diskPath, ct).ConfigureAwait(false);
            cache.Set(id, cachedBytes, new MemoryCacheEntryOptions { Size = cachedBytes.Length + 128 });
            return LandCoverCog.Decode(cachedBytes);
        }

        try
        {
            var pixels = await FetchPixelsAsync(client, id, ct);
            if (diskPath is not null && cache.TryGetValue(id, out byte[]? newlyCompressed) && newlyCompressed is not null)
                await File.WriteAllBytesAsync(diskPath, newlyCompressed, ct).ConfigureAwait(false);
            return pixels;
        }
        catch (SourceBudgetReachedException)
        {
            return null;
        }
        catch (Exception ex) when (ex is HttpRequestException or IOException or InvalidDataException
            or System.Text.Json.JsonException or OverflowException || ex is OperationCanceledException && !ct.IsCancellationRequested)
        {
            // Retry failed blocks on a later pass and keep signed URLs out of logs.
            cache.Set<byte[]?>(id, null, new MemoryCacheEntryOptions { Size = 128, AbsoluteExpirationRelativeToNow = RetryDelay });
            return null;
        }
    }

    private static bool HasValidCoordinates(FirmsHotspot spot) =>
        spot.Latitude is >= -90 and <= 90 && spot.Longitude is >= -180 and <= 180;

    private sealed class SourceBudgetReachedException : Exception;
    private static int SampleTotal(ushort[] counts)
    {
        var total = 0;
        foreach (var count in counts) total += count;
        return total;
    }

    private static Dictionary<int, List<WeightedPixel>> GroupSamples(
        IReadOnlyList<FirmsHotspot> spots, bool world, CancellationToken cancellationToken)
    {
        var work = new Dictionary<int, List<WeightedPixel>>();
        var scale = world ? LandCoverCog.WorldOverviewScale : 1;
        var assetSize = LandCoverCog.AssetSize / scale;
        var width = LandCoverFootprint.Width / scale;
        var blocksPerSide = LandCoverCog.BlocksPerSideAt(scale);
        var levelOffset = world ? AssetCount : 0;
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
                cells[s] = (long)(y[s] / scale) * width + x[s] / scale;
            cells.Sort();

            for (var start = 0; start < cells.Length;)
            {
                var end = start + 1;
                while (end < cells.Length && cells[end] == cells[start]) end++;
                var row = (int)(cells[start] / width);
                var col = (int)(cells[start] % width);
                var asset = levelOffset + row / assetSize * AssetColumns + col / assetSize;
                var localY = row % assetSize;
                var localX = col % assetSize;
                var block = localY / LandCoverCog.BlockSize * blocksPerSide + localX / LandCoverCog.BlockSize;
                var id = asset * BlocksPerAsset + block;
                if (!work.TryGetValue(id, out var samples)) work[id] = samples = [];
                var pixel = localY % LandCoverCog.BlockSize * LandCoverCog.BlockSize + localX % LandCoverCog.BlockSize;
                samples.Add(new WeightedPixel(i, pixel, (ushort)(end - start)));
                start = end;
            }
        }

        return work;
    }

    private async Task<byte[]> FetchPixelsAsync(HttpClient client, int id, CancellationToken ct)
    {
        var directoryId = id / BlocksPerAsset;
        var asset = directoryId % AssetCount;
        var scale = directoryId >= AssetCount ? LandCoverCog.WorldOverviewScale : 1;
        var path = AssetPath(asset);
        var directory = Volatile.Read(ref directories[directoryId]);
        if (directory is null)
        {
            await headerLocks[asset].WaitAsync(ct);
            try
            {
                directory = directories[directoryId];
                if (directory is null)
                {
                    if (headers[asset] is null)
                    {
                        var headerCachePath = !string.IsNullOrEmpty(offlineBlockCacheDir)
                            ? Path.Combine(offlineBlockCacheDir, $"header_{asset}.bin")
                            : null;
                        if (headerCachePath is not null && File.Exists(headerCachePath))
                            headers[asset] = await File.ReadAllBytesAsync(headerCachePath, ct).ConfigureAwait(false);
                        else
                        {
                            var loaded = await ReadRangeAsync(client, path, 0, LandCoverCog.HeaderBytes, ct);
                            headers[asset] = loaded;
                            if (headerCachePath is not null)
                                await File.WriteAllBytesAsync(headerCachePath, loaded, ct).ConfigureAwait(false);
                        }
                    }
                    directory = LandCoverCog.Read(headers[asset]!, scale);
                    Volatile.Write(ref directories[directoryId], directory);
                }
            }
            finally
            {
                headerLocks[asset].Release();
            }
        }

        var (offset, length) = directory.GetBlock(id % BlocksPerAsset);
        var compressed = await ReadRangeAsync(client, path, offset, length, ct);
        var pixels = LandCoverCog.Decode(compressed);
        cache.Set(id, compressed, new MemoryCacheEntryOptions { Size = compressed.Length + 128 });
        return pixels;
    }

    private async Task<byte[]> ReadRangeAsync(HttpClient client, string path, uint offset, int length, CancellationToken ct)
    {
        if (Volatile.Read(ref remainingSourceRequests) <= 0) throw new SourceBudgetReachedException();

        var signed = await GetTokenAsync(client, ct);
        await AcquireSourceRequestAsync(ct);
        using var requestTimeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        requestTimeout.CancelAfter(TimeSpan.FromSeconds(offlineMode ? 20 : 5));
        var end = (long)offset + length - 1;
        using var request = new HttpRequestMessage(HttpMethod.Get, path + "?" + signed);
        request.Headers.Range = new RangeHeaderValue(offset, end);
        using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, requestTimeout.Token);
        var range = response.Content.Headers.ContentRange;
        if (response.StatusCode != HttpStatusCode.PartialContent || range?.Unit != "bytes" ||
            range.From != offset || range.To != end || response.Content.Headers.ContentLength != length)
            throw new InvalidDataException("Land cover source did not return the requested byte range.");

        var bytes = new byte[length];
        await using var stream = await response.Content.ReadAsStreamAsync(requestTimeout.Token);
        await stream.ReadExactlyAsync(bytes, requestTimeout.Token);
        return bytes;
    }

    private async Task AcquireSourceRequestAsync(CancellationToken ct)
    {
        if (offlineMode) return;
        if (Interlocked.Decrement(ref remainingSourceRequests) < 0) throw new SourceBudgetReachedException();
        using var permit = await sourceRate.AcquireAsync(1, ct);
        if (!permit.IsAcquired) throw new SourceBudgetReachedException();
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
                    await AcquireSourceRequestAsync(ct);
                    signed = await client.GetFromJsonAsync<TokenResponse>(TokenUrl, ct);
                    if (!IsFresh(signed)) throw new InvalidDataException("No valid public land cover token.");
                    Volatile.Write(ref token, signed);
                }
                catch (Exception ex) when (ex is not SourceBudgetReachedException && !ct.IsCancellationRequested)
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
        summaries.Dispose();
        sourceRate.Dispose();
        deferredPass.Dispose();
        tokenLock.Dispose();
        foreach (var gate in headerLocks) gate.Dispose();
    }
}
