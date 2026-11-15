using System.Collections.Concurrent;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Caching.Memory;
using NasaSpaceApps.Api.Firms;
using GridSources = NasaSpaceApps.Api.Weather.DeferredHotspotWeather.GridSources;

namespace NasaSpaceApps.Api.Weather;

internal readonly record struct WeatherSpotKey(double Latitude, double Longitude, DateTimeOffset Acquired)
{
    internal static WeatherSpotKey From(FirmsHotspot spot) => new(spot.Latitude, spot.Longitude, spot.AcquiredAtUtc.ToUniversalTime());
    internal DateTimeOffset ExpiresAt => Acquired.AddHours(24);
    internal string Id => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(string.Create(
        CultureInfo.InvariantCulture, $"{Latitude + 0d:R},{Longitude + 0d:R},{Acquired.UtcTicks}"))));
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

internal interface ISharedWeatherSampleStore
{
    Task<IReadOnlyDictionary<WeatherSpotKey, WeatherCacheEntry>> ReadAsync(WeatherSpotKey[] keys, CancellationToken token);
    Task<IReadOnlyDictionary<WeatherSpotKey, WeatherCacheEntry>> WriteAsync(
        IReadOnlyDictionary<WeatherSpotKey, WeatherCacheEntry> entries, CancellationToken token);
}

internal sealed class WeatherSampleCache(ISharedWeatherSampleStore shared, TimeProvider clock, ILogger<WeatherSampleCache> logger) : IDisposable
{
    private const int Capacity = 4096;
    private readonly MemoryCache local = new(new MemoryCacheOptions { SizeLimit = Capacity });
    private readonly ConcurrentDictionary<WeatherSpotKey, WeatherCacheEntry> pendingWrites = new();
    private readonly SemaphoreSlim writeGate = new(1);
    private readonly object localGate = new();
    private long sharedBackoffUntil;

    internal WeatherCacheEntry? Read(WeatherSpotKey key) => key.ExpiresAt > clock.GetUtcNow() ? local.Get<WeatherCacheEntry>(key) : null;

    internal async Task HydrateAsync(IEnumerable<WeatherSpotKey> keys, CancellationToken token)
    {
        var now = clock.GetUtcNow();
        var requested = keys.Distinct().Where(key => key.ExpiresAt > now).ToArray();
        await FlushAsync(requested, token).ConfigureAwait(false);
        var missing = requested.Where(key => !local.TryGetValue(key, out _)).ToArray();
        if (missing.Length == 0 || Volatile.Read(ref sharedBackoffUntil) > now.UtcTicks) return;
        try
        {
            var entries = await shared.ReadAsync(missing, token).ConfigureAwait(false);
            foreach (var key in missing)
            {
                if (entries.TryGetValue(key, out var entry)) Set(key, entry);
                else SetMiss(key);
            }
        }
        catch (Exception error) when (!token.IsCancellationRequested && IsStoreError(error)) { BackOff(error); }
    }

    internal async Task SaveAsync(IReadOnlyDictionary<WeatherSpotKey, WeatherCacheEntry> entries, CancellationToken token)
    {
        var now = clock.GetUtcNow();
        foreach (var expired in pendingWrites.Where(item => item.Key.ExpiresAt <= now))
            pendingWrites.TryRemove(expired);
        foreach (var (key, entry) in entries)
        {
            if (key.ExpiresAt <= now) continue;
            var merged = Set(key, entry);
            if (pendingWrites.Count < Capacity || pendingWrites.ContainsKey(key))
                pendingWrites.AddOrUpdate(key, merged, (_, existing) => WeatherCacheEntry.Merge(existing, merged));
        }
        await FlushAsync(entries.Keys, token).ConfigureAwait(false);
    }

    private async Task FlushAsync(IEnumerable<WeatherSpotKey> keys, CancellationToken token)
    {
        var now = clock.GetUtcNow();
        if (pendingWrites.IsEmpty || Volatile.Read(ref sharedBackoffUntil) > now.UtcTicks ||
            !await writeGate.WaitAsync(0, token).ConfigureAwait(false)) return;
        try
        {
            var batch = new Dictionary<WeatherSpotKey, WeatherCacheEntry>();
            foreach (var key in keys)
            {
                if (key.ExpiresAt > now && pendingWrites.TryGetValue(key, out var entry))
                    batch[key] = entry;
            }
            if (batch.Count == 0) return;
            var stored = await shared.WriteAsync(batch, token).ConfigureAwait(false);
            foreach (var (key, entry) in stored)
            {
                Set(key, entry);
                pendingWrites.TryRemove(new KeyValuePair<WeatherSpotKey, WeatherCacheEntry>(key, batch[key]));
            }
        }
        catch (Exception error) when (!token.IsCancellationRequested && IsStoreError(error)) { BackOff(error); }
        finally { writeGate.Release(); }
    }

    private WeatherCacheEntry Set(WeatherSpotKey key, WeatherCacheEntry entry)
    {
        lock (localGate)
        {
            var lifetime = key.ExpiresAt - clock.GetUtcNow();
            if (lifetime <= TimeSpan.Zero) return entry;
            var merged = WeatherCacheEntry.Merge(local.Get<WeatherCacheEntry>(key), entry);
            local.Set(key, merged, new MemoryCacheEntryOptions { Size = 1, AbsoluteExpirationRelativeToNow = lifetime });
            return merged;
        }
    }

    private void SetMiss(WeatherSpotKey key)
    {
        lock (localGate)
        {
            if (!local.TryGetValue(key, out _))
                local.Set<WeatherCacheEntry?>(key, null, new MemoryCacheEntryOptions { Size = 1, AbsoluteExpirationRelativeToNow = TimeSpan.FromSeconds(10) });
        }
    }

    private void BackOff(Exception error)
    {
        var now = clock.GetUtcNow();
        if (Interlocked.Exchange(ref sharedBackoffUntil, now.AddSeconds(20).UtcTicks) <= now.UtcTicks)
            logger.LogWarning("Shared hotspot weather cache is unavailable: {Message}", error.Message);
    }

    private static bool IsStoreError(Exception error) => error is HttpRequestException or IOException or
        System.Text.Json.JsonException or FormatException or OperationCanceledException or InvalidDataException or KeyNotFoundException;

    public void Dispose()
    {
        local.Dispose();
        writeGate.Dispose();
    }
}
