using Microsoft.Extensions.Caching.Memory;
using NasaSpaceApps.Api.Firms;
using GridSources = NasaSpaceApps.Api.Weather.DeferredHotspotWeather.GridSources;

namespace NasaSpaceApps.Api.Weather;

internal readonly record struct WeatherSpotKey(double Latitude, double Longitude, DateTimeOffset Acquired)
{
    internal static WeatherSpotKey From(FirmsHotspot spot) => new(spot.Latitude, spot.Longitude, spot.AcquiredAtUtc.ToUniversalTime());
    internal DateTimeOffset ExpiresAt => Acquired.AddHours(24);
}

internal sealed record WeatherCacheEntry(GridSources Sources, DateTimeOffset? RetryAt)
{
    internal bool ShouldRetry(DateTimeOffset now) => RetryAt is { } retry && retry <= now;

    internal static WeatherCacheEntry FromSample(GridSources sample, DateTimeOffset now) =>
        new(sample, sample.All.Any(NeedsRetry) ? now.AddMinutes(2) : null);

    internal static WeatherCacheEntry Merge(WeatherCacheEntry? previous, WeatherCacheEntry candidate)
    {
        if (previous is null) return candidate;
        if (previous.RetryAt is null) return previous;
        var old = previous.Sources;
        var current = candidate.Sources;
        var combined = new GridSources(current.Forecast.Select((source, index) =>
            index < old.Forecast.Length ? Prefer(old.Forecast[index], source) : source).ToArray(),
            Prefer(old.Danger, current.Danger), Prefer(old.SoilAnomaly, current.SoilAnomaly), Prefer(old.Fuel, current.Fuel));
        var retryAt = candidate.RetryAt > previous.RetryAt ? candidate.RetryAt : previous.RetryAt;
        return new WeatherCacheEntry(combined, combined.All.Any(NeedsRetry) ? retryAt : null);
    }

    private static bool NeedsRetry(HotspotWeatherSource source) =>
        source.Status is "source_unavailable" or "no_matching_frame" ||
        source.Values.Values.Any(value => value.MissingReason == "source_unavailable");

    private static HotspotWeatherSource Prefer(HotspotWeatherSource previous, HotspotWeatherSource current)
    {
        if (!NeedsRetry(previous)) return previous;
        // Field values can be combined when they describe the same source frame and sampling location.
        if (previous with { Values = current.Values, Status = current.Status } == current)
        {
            var values = new Dictionary<string, HotspotWeatherValue>(current.Values);
            foreach (var (field, value) in previous.Values)
            {
                if (value.Value.HasValue && (!values.TryGetValue(field, out var next) || !next.Value.HasValue))
                    values[field] = value;
            }
            return current with { Values = values, Status = values.Values.Any(value => value.Value.HasValue) ? "available" : current.Status };
        }
        var available = current.Values.Values.Count(value => value.Value.HasValue);
        var previouslyAvailable = previous.Values.Values.Count(value => value.Value.HasValue);
        return available >= previouslyAvailable ? current : previous;
    }
}

internal sealed class WeatherSampleCache(FirestoreWeatherGridStore grids, TimeProvider clock, ILogger<WeatherSampleCache> logger) : IDisposable
{
    private readonly MemoryCache local = new(new MemoryCacheOptions { SizeLimit = 4096 });
    private readonly SemaphoreSlim coverageGate = new(1);
    private readonly object localGate = new();
    private long coverageRefreshAt;
    private HotspotWeatherCoverage? coverage;

    internal WeatherCacheEntry? Read(WeatherSpotKey key) =>
        key.ExpiresAt > clock.GetUtcNow() ? local.Get<WeatherCacheEntry>(key) : null;

    internal void Save(IReadOnlyDictionary<WeatherSpotKey, WeatherCacheEntry> entries)
    {
        lock (localGate)
        {
            var now = clock.GetUtcNow();
            foreach (var (key, entry) in entries)
            {
                var lifetime = key.ExpiresAt - now;
                if (lifetime <= TimeSpan.Zero) continue;
                local.Set(key, WeatherCacheEntry.Merge(local.Get<WeatherCacheEntry>(key), entry),
                    new MemoryCacheEntryOptions { Size = 1, AbsoluteExpirationRelativeToNow = lifetime });
            }
        }
    }

    internal async Task<HotspotWeatherCoverage?> GetCoverageAsync(CancellationToken token)
    {
        var now = clock.GetUtcNow();
        if (Volatile.Read(ref coverageRefreshAt) > now.UtcTicks ||
            !await coverageGate.WaitAsync(0, token).ConfigureAwait(false)) return Volatile.Read(ref coverage);
        try
        {
            Volatile.Write(ref coverageRefreshAt, now.AddMinutes(2).UtcTicks);
            Volatile.Write(ref coverage, await grids.CountAsync(now, token).ConfigureAwait(false));
        }
        catch (Exception error) when (!token.IsCancellationRequested && EncodedWeatherGridCache.IsStoreError(error))
        {
            Volatile.Write(ref coverageRefreshAt, now.AddSeconds(20).UtcTicks);
            logger.LogWarning("Shared weather grid count is unavailable: {Message}", error.Message);
        }
        finally { coverageGate.Release(); }
        return Volatile.Read(ref coverage);
    }

    public void Dispose()
    {
        local.Dispose();
        coverageGate.Dispose();
    }
}
