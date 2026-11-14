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

        var cacheKey = BuildCacheKey(z, x, y);
        if (cache.TryGetValue(cacheKey, out CloudTileResult? cached) && cached is not null)
        {
            return cached;
        }

        var sharedFetch = _inFlightFetches.GetOrAdd(
            cacheKey,
            key => new Lazy<Task<CloudTileResult>>(
                () => FetchAndCleanupAsync(key, z, x, y),
                LazyThreadSafetyMode.ExecutionAndPublication));

        return await sharedFetch.Value.WaitAsync(cancellationToken).ConfigureAwait(false);
    }

    private async Task<CloudTileResult> FetchAndCleanupAsync(string cacheKey, int z, int x, int y)
    {
        try
        {
            return await FetchFromUpstreamAsync(cacheKey, z, x, y).ConfigureAwait(false);
        }
        finally
        {
            _inFlightFetches.TryRemove(cacheKey, out _);
        }
    }

    private async Task<CloudTileResult> FetchFromUpstreamAsync(string cacheKey, int z, int x, int y)
    {
        if (cache.TryGetValue(cacheKey, out CloudTileResult? cached) && cached is not null)
        {
            return cached;
        }

        using var timeoutCts = new CancellationTokenSource(options.UpstreamTimeout);
        using var client = httpClientFactory.CreateClient(ExtremumCloudOptions.HttpClientName);
        using var request = new HttpRequestMessage(HttpMethod.Get, $"v3/weather/satellite/{z}/{x}/{y}.png");

        // Use TryAddWithoutValidation so exact header values (no trailing slash rewrite or extra UA comments) are preserved.
        request.Headers.TryAddWithoutValidation("Referer", options.Referer);
        request.Headers.TryAddWithoutValidation("User-Agent", options.UserAgent);
        request.Headers.TryAddWithoutValidation("Cookie", $"gis-uuid={identity.GisUuid}");

        using var response = await client
            .SendAsync(request, HttpCompletionOption.ResponseHeadersRead, timeoutCts.Token)
            .ConfigureAwait(false);

        if (response.StatusCode == HttpStatusCode.NoContent)
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
            "Upstream satellite cloud request v3/weather/satellite/{Z}/{X}/{Y}.png returned HTTP {StatusCode}.",
            z,
            x,
            y,
            (int)response.StatusCode);

        throw new HttpRequestException(
            $"Upstream layers.extremum.org returned {(int)response.StatusCode} ({response.StatusCode}).",
            null,
            response.StatusCode);
    }

    private static string BuildCacheKey(int z, int x, int y) => $"extremum-cloud:{z}:{x}:{y}";
}
