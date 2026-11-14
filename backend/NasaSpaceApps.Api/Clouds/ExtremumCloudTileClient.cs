using System.Collections.Concurrent;
using System.Net;
using Microsoft.Extensions.Caching.Memory;

namespace NasaSpaceApps.Api.Clouds;

public enum CloudTileStatus
{
    Png = 0,
    NoContent = 1,
}

public sealed record CloudTileResult(CloudTileStatus Status, byte[]? PngBytes)
{
    public static CloudTileResult Empty { get; } = new(CloudTileStatus.NoContent, null);

    public static CloudTileResult Png(byte[] bytes) => new(CloudTileStatus.Png, bytes);
}

/// <summary>
/// Fetches and caches VIS/IR 258x258 satellite cloud PNG tiles from layers.extremum.org
/// using per-instance gis-uuid cookie and required Referer and User-Agent headers.
/// </summary>
public sealed class ExtremumCloudTileClient(
    IHttpClientFactory httpClientFactory,
    IMemoryCache cache,
    ExtremumCloudOptions options,
    ExtremumCloudInstanceIdentity identity,
    ILogger<ExtremumCloudTileClient> logger)
{
    public const int MinZoom = 1;
    public const int MaxZoom = 7;

    private readonly ConcurrentDictionary<string, Lazy<Task<CloudTileResult>>> _inFlightFetches = new(StringComparer.Ordinal);

    public static bool IsValidZoom(int z) => z is >= MinZoom and <= MaxZoom;

    public static bool IsValidCoords(int z, int x, int y) =>
        IsValidZoom(z) && x >= 0 && y >= 0 && x < (1 << z) && y < (1 << z);

    public static bool TryNormalizePole(string? pole, out string normalizedPole)
    {
        if (string.Equals(pole, "north", StringComparison.OrdinalIgnoreCase))
        {
            normalizedPole = "north";
            return true;
        }
        if (string.Equals(pole, "south", StringComparison.OrdinalIgnoreCase))
        {
            normalizedPole = "south";
            return true;
        }
        normalizedPole = string.Empty;
        return false;
    }

    public async Task<CloudTileResult> GetTileAsync(
        int z,
        int x,
        int y,
        CancellationToken cancellationToken = default)
    {
        if (!IsValidCoords(z, x, y))
        {
            throw new ArgumentOutOfRangeException(
                nameof(z),
                $"Satellite cloud tile coordinates z={z}, x={x}, y={y} are outside valid bounds.");
        }

        return await GetOrFetchAsync(
            BuildCacheKey(z, x, y),
            $"v3/weather/satellite/{z}/{x}/{y}.png",
            treatNotFoundAsEmpty: false,
            cancellationToken).ConfigureAwait(false);
    }

    public async Task<CloudTileResult> GetPolarCapAsync(
        string pole,
        CancellationToken cancellationToken = default)
    {
        if (!TryNormalizePole(pole, out var normalizedPole))
        {
            throw new ArgumentOutOfRangeException(
                nameof(pole),
                $"Polar cap hemisphere '{pole}' must be 'north' or 'south'.");
        }

        return await GetOrFetchAsync(
            BuildPolarCacheKey(normalizedPole),
            $"v3/weather/satellite/polar/{normalizedPole}.png",
            treatNotFoundAsEmpty: true,
            cancellationToken).ConfigureAwait(false);
    }

    private Task<CloudTileResult> GetOrFetchAsync(
        string cacheKey,
        string relativePath,
        bool treatNotFoundAsEmpty,
        CancellationToken cancellationToken)
    {
        if (cache.TryGetValue(cacheKey, out CloudTileResult? cached) && cached is not null)
        {
            return Task.FromResult(cached);
        }

        var sharedFetch = _inFlightFetches.GetOrAdd(
            cacheKey,
            key => new Lazy<Task<CloudTileResult>>(
                () => FetchAndCleanupAsync(key, relativePath, treatNotFoundAsEmpty),
                LazyThreadSafetyMode.ExecutionAndPublication));

        return sharedFetch.Value.WaitAsync(cancellationToken);
    }

    private async Task<CloudTileResult> FetchAndCleanupAsync(
        string cacheKey,
        string relativePath,
        bool treatNotFoundAsEmpty)
    {
        try
        {
            return await FetchFromUpstreamAsync(cacheKey, relativePath, treatNotFoundAsEmpty).ConfigureAwait(false);
        }
        finally
        {
            _inFlightFetches.TryRemove(cacheKey, out _);
        }
    }

    private async Task<CloudTileResult> FetchFromUpstreamAsync(
        string cacheKey,
        string relativePath,
        bool treatNotFoundAsEmpty)
    {
        if (cache.TryGetValue(cacheKey, out CloudTileResult? cached) && cached is not null)
        {
            return cached;
        }

        using var timeoutCts = new CancellationTokenSource(options.UpstreamTimeout);
        using var client = httpClientFactory.CreateClient(ExtremumCloudOptions.HttpClientName);
        using var request = new HttpRequestMessage(HttpMethod.Get, relativePath);

        // Use TryAddWithoutValidation so exact header values (no trailing slash rewrite or extra UA comments) are preserved.
        request.Headers.TryAddWithoutValidation("Referer", options.Referer);
        request.Headers.TryAddWithoutValidation("User-Agent", options.UserAgent);
        request.Headers.TryAddWithoutValidation("Cookie", $"gis-uuid={identity.GisUuid}");

        using var response = await client
            .SendAsync(request, HttpCompletionOption.ResponseHeadersRead, timeoutCts.Token)
            .ConfigureAwait(false);

        if (response.StatusCode == HttpStatusCode.NoContent ||
            (treatNotFoundAsEmpty && response.StatusCode == HttpStatusCode.NotFound))
        {
            cache.Set(cacheKey, CloudTileResult.Empty, options.EmptyTileCacheDuration);
            return CloudTileResult.Empty;
        }

        if (response.StatusCode == HttpStatusCode.OK)
        {
            var bytes = await response.Content.ReadAsByteArrayAsync(timeoutCts.Token).ConfigureAwait(false);
            if (bytes.Length == 0)
            {
                cache.Set(cacheKey, CloudTileResult.Empty, options.EmptyTileCacheDuration);
                return CloudTileResult.Empty;
            }

            var result = CloudTileResult.Png(bytes);
            cache.Set(cacheKey, result, options.TileCacheDuration);
            return result;
        }

        logger.LogWarning(
            "Upstream satellite cloud request {RelativePath} returned HTTP {StatusCode}.",
            relativePath,
            (int)response.StatusCode);

        throw new HttpRequestException(
            $"Upstream layers.extremum.org returned {(int)response.StatusCode} ({response.StatusCode}).",
            null,
            response.StatusCode);
    }

    private static string BuildCacheKey(int z, int x, int y) => $"extremum-cloud:{z}:{x}:{y}";

    private static string BuildPolarCacheKey(string normalizedPole) => $"extremum-cloud:polar:{normalizedPole}";
}
