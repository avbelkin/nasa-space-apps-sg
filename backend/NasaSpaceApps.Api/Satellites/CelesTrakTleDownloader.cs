using Microsoft.Extensions.Caching.Memory;

namespace NasaSpaceApps.Api.Satellites;

public sealed record ResolvedTleEntry(SatelliteTle Tle, string Source);

public sealed class CelesTrakTleDownloader(
    IHttpClientFactory httpClientFactory,
    IMemoryCache cache,
    ILogger<CelesTrakTleDownloader> logger)
{
    public const string ResourceGroupTleUrl = "NORAD/elements/gp.php?GROUP=resource&FORMAT=tle";
    public const string WeatherGroupTleUrl = "NORAD/elements/gp.php?GROUP=weather&FORMAT=tle";

    private const string CacheKey = "satellites:celestrak:fleet-tles";
    private static readonly TimeSpan CacheDuration = TimeSpan.FromHours(12);
    private static readonly TimeSpan FailureBackoffDuration = TimeSpan.FromMinutes(15);

    private readonly SemaphoreSlim _refreshLock = new(1, 1);
    private volatile IReadOnlyDictionary<int, ResolvedTleEntry> _cachedTles = BuildDefaultFallbackTles();

    public async Task<IReadOnlyDictionary<int, ResolvedTleEntry>> GetFleetTlesAsync(
        CancellationToken cancellationToken = default)
    {
        if (cache.TryGetValue(CacheKey, out IReadOnlyDictionary<int, ResolvedTleEntry>? cached) && cached is not null)
        {
            return cached;
        }

        await _refreshLock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            if (cache.TryGetValue(CacheKey, out cached) && cached is not null)
            {
                return cached;
            }

            var (resourceTles, resourceOk) = await FetchGroupAsync(ResourceGroupTleUrl, cancellationToken).ConfigureAwait(false);
            var (weatherTles, weatherOk) = await FetchGroupAsync(WeatherGroupTleUrl, cancellationToken).ConfigureAwait(false);

            var merged = new Dictionary<int, ResolvedTleEntry>(_cachedTles.Count);
            foreach (var (noradId, existing) in _cachedTles)
            {
                var degradedSource = existing.Source == "celestrak" ? "celestrak-stale" : existing.Source;
                merged[noradId] = existing with { Source = degradedSource };
            }

            var updatedCount = 0;
            foreach (var catalogEntry in SatelliteCatalog.Default)
            {
                if (resourceTles.TryGetValue(catalogEntry.NoradId, out var resTle))
                {
                    merged[catalogEntry.NoradId] = new ResolvedTleEntry(resTle, "celestrak");
                    updatedCount++;
                }
                else if (weatherTles.TryGetValue(catalogEntry.NoradId, out var wxTle))
                {
                    merged[catalogEntry.NoradId] = new ResolvedTleEntry(wxTle, "celestrak");
                    updatedCount++;
                }
            }

            _cachedTles = merged;
            var ttl = resourceOk && weatherOk && updatedCount > 0
                ? CacheDuration
                : FailureBackoffDuration;

            cache.Set(CacheKey, (IReadOnlyDictionary<int, ResolvedTleEntry>)merged, ttl);
            return merged;
        }
        finally
        {
            _refreshLock.Release();
        }
    }

    private async Task<(IReadOnlyDictionary<int, SatelliteTle> Tles, bool Succeeded)> FetchGroupAsync(
        string relativeUrl,
        CancellationToken cancellationToken)
    {
        try
        {
            using var client = httpClientFactory.CreateClient("CelesTrak");
            var payload = await client.GetStringAsync(relativeUrl, cancellationToken).ConfigureAwait(false);
            var parsed = SatelliteTleParser.ParseCatalog(payload);
            return (parsed, parsed.Count > 0);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to fetch CelesTrak group {Url}; using fallback or stale TLEs.", relativeUrl);
            return (new Dictionary<int, SatelliteTle>(), false);
        }
    }

    private static IReadOnlyDictionary<int, ResolvedTleEntry> BuildDefaultFallbackTles()
    {
        var dict = new Dictionary<int, ResolvedTleEntry>();
        foreach (var meta in SatelliteCatalog.Default)
        {
            var tle = SatelliteTleParser.ParseSingle(meta.Name, meta.DefaultTleLine1, meta.DefaultTleLine2);
            if (tle is not null)
            {
                dict[meta.NoradId] = new ResolvedTleEntry(tle, "embedded-fallback");
            }
        }

        return dict;
    }
}
