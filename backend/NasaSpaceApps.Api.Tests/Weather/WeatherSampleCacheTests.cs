using Microsoft.Extensions.Logging.Abstractions;
using NasaSpaceApps.Api.Weather;
using Xunit;
using GridSources = NasaSpaceApps.Api.Weather.DeferredHotspotWeather.GridSources;

namespace NasaSpaceApps.Api.Tests.Weather;

public sealed class WeatherSampleCacheTests
{
    private static readonly DateTimeOffset Acquisition = new(2026, 1, 12, 9, 17, 0, TimeSpan.Zero);
    private static readonly WeatherSpotKey Key = new(45, 7, Acquisition);

    [Fact]
    public async Task AnotherInstanceFindsValuesUntilExactly24HoursAfterAcquisition()
    {
        var clock = new TestClock(Acquisition.AddHours(2));
        var shared = new TestStore();
        using var first = CreateCache(shared, clock);
        var entry = Sample(clock, Source("available", 4), Source("available", 7));
        await first.SaveAsync(new Dictionary<WeatherSpotKey, WeatherCacheEntry> { [Key] = entry }, default);
        clock.Now = Key.ExpiresAt.AddSeconds(-1);
        using var second = CreateCache(shared, clock);
        await second.HydrateAsync([Key, Key with { Acquired = Key.Acquired.AddMinutes(-1) }], default);
        Assert.Equal(4, second.Read(Key)?.Sources.Danger.Values["sample"].Value);
        Assert.Equal(DateTimeOffset.Parse("2026-01-13T09:17:00Z"), Key.ExpiresAt);
        clock.Now = Key.ExpiresAt;
        Assert.Null(second.Read(Key));
        Assert.Single(shared.Entries);
        using var third = CreateCache(shared, clock);
        await third.HydrateAsync([Key], default);
        Assert.Null(third.Read(Key));
        Assert.Equal(1, shared.Reads);
    }

    [Fact]
    public async Task PartialResultsAreSharedDuringBackoffAndRecoveredSourcesKeepTheirProvenance()
    {
        var clock = new TestClock(Acquisition);
        var shared = new TestStore();
        using var first = CreateCache(shared, clock);
        var danger = Source("available", 4) with { PublishedAtUtc = Acquisition.AddHours(-1) };
        var firstPass = Sample(clock, danger, Source("source_unavailable", null));
        await first.SaveAsync(new Dictionary<WeatherSpotKey, WeatherCacheEntry> { [Key] = firstPass }, default);
        using var second = CreateCache(shared, clock);
        clock.Now = Acquisition.AddSeconds(119);
        await second.HydrateAsync([Key], default);
        Assert.False(second.Read(Key)?.ShouldRetry(clock.Now));
        Assert.Equal(4, second.Read(Key)?.Sources.Danger.Values["sample"].Value);
        clock.Now = Acquisition.AddMinutes(2);
        Assert.True(second.Read(Key)?.ShouldRetry(clock.Now));
        var retry = Sample(clock, Source("source_unavailable", null), Source("available", 7));
        await second.SaveAsync(new Dictionary<WeatherSpotKey, WeatherCacheEntry> { [Key] = retry }, default);
        var saved = shared.Entries[Key];
        Assert.Null(saved.RetryAt);
        Assert.Equal(danger.PublishedAtUtc, saved.Sources.Danger.PublishedAtUtc);
        Assert.Equal(4, saved.Sources.Danger.Values["sample"].Value);
        Assert.Equal(7, saved.Sources.Fuel.Values["sample"].Value);
        await first.SaveAsync(new Dictionary<WeatherSpotKey, WeatherCacheEntry> { [Key] = firstPass }, default);
        Assert.Null(first.Read(Key)?.RetryAt);
    }

    [Fact]
    public async Task CacheRetriesFailedWritesWithoutResamplingTheSpot()
    {
        var clock = new TestClock(Acquisition);
        var shared = new TestStore { Offline = true };
        using var first = CreateCache(shared, clock);
        var entry = Sample(clock, Source("available", 4), Source("available", 7));
        await first.SaveAsync(new Dictionary<WeatherSpotKey, WeatherCacheEntry> { [Key] = entry }, default);
        Assert.Empty(shared.Entries);
        Assert.Equal(entry, first.Read(Key));
        shared.Offline = false;
        await first.HydrateAsync([Key], default);
        Assert.Empty(shared.Entries);
        clock.Now = Acquisition.AddSeconds(20);
        await first.HydrateAsync([Key], default);
        Assert.Equal(entry, shared.Entries[Key]);
    }

    [Fact]
    public void FirestoreEncodingRoundTripsSampleValuesAndValidity()
    {
        var source = Source("available", 4) with { PublishedAtUtc = Acquisition.AddHours(-1) };
        var unavailable = Source("available", null);
        var entry = Sample(new TestClock(Acquisition), source, unavailable);
        var stored = FirestoreWeatherSampleStore.Decode(Convert.FromBase64String(FirestoreWeatherSampleStore.Encode(entry)));
        Assert.Equal(Acquisition.AddMinutes(2), stored.RetryAt);
        Assert.Equal(source.PublishedAtUtc, stored.Sources.Danger.PublishedAtUtc);
        Assert.Equal(source.Values["sample"], stored.Sources.Danger.Values["sample"]);
        Assert.Equal("source_unavailable", stored.Sources.Fuel.Values["sample"].MissingReason);
        Assert.Null(Sample(new TestClock(Acquisition), source, Source("no_source_coverage", null)).RetryAt);
    }

    private static WeatherSampleCache CreateCache(TestStore store, TimeProvider clock) =>
        new(store, clock, NullLogger<WeatherSampleCache>.Instance);

    private static WeatherCacheEntry Sample(TimeProvider clock, HotspotWeatherSource danger, HotspotWeatherSource fuel) =>
        WeatherCacheEntry.FromSample(new GridSources([], danger, Source("available", 1), fuel), clock.GetUtcNow());

    private static HotspotWeatherSource Source(string status, double? value) =>
        new("Provider", "Model", "forecast", 45, 7, 0.25, Acquisition.AddHours(-6), "bilinear", status, null,
            new Dictionary<string, HotspotWeatherValue>
            {
                ["sample"] = new(value, "K", Acquisition, Acquisition.AddHours(1), 0,
                    value.HasValue || status == "no_source_coverage" ? null : "source_unavailable")
                {
                    ValidDateUtc = DateOnly.FromDateTime(Acquisition.UtcDateTime),
                },
            });

    private sealed class TestClock(DateTimeOffset now) : TimeProvider
    {
        internal DateTimeOffset Now { get; set; } = now;
        public override DateTimeOffset GetUtcNow() => Now;
    }

    private sealed class TestStore : ISharedWeatherSampleStore
    {
        internal Dictionary<WeatherSpotKey, WeatherCacheEntry> Entries { get; } = [];
        internal bool Offline { get; set; }
        internal int Reads { get; private set; }

        public Task<HotspotWeatherCoverage?> CountAsync(DateTimeOffset now, CancellationToken token) =>
            Task.FromResult<HotspotWeatherCoverage?>(new(Entries.Count(entry => entry.Key.ExpiresAt > now), now));

        public Task<IReadOnlyDictionary<WeatherSpotKey, WeatherCacheEntry>> ReadAsync(WeatherSpotKey[] keys, CancellationToken token)
        {
            Reads++;
            return Task.FromResult<IReadOnlyDictionary<WeatherSpotKey, WeatherCacheEntry>>(
                keys.Where(Entries.ContainsKey).ToDictionary(key => key, key => Entries[key]));
        }

        public Task<IReadOnlyDictionary<WeatherSpotKey, WeatherCacheEntry>> WriteAsync(
            IReadOnlyDictionary<WeatherSpotKey, WeatherCacheEntry> entries, CancellationToken token)
        {
            if (Offline) throw new HttpRequestException("Test outage");
            var merged = new Dictionary<WeatherSpotKey, WeatherCacheEntry>();
            foreach (var (key, entry) in entries)
                merged[key] = Entries[key] = WeatherCacheEntry.Merge(Entries.GetValueOrDefault(key), entry);
            return Task.FromResult<IReadOnlyDictionary<WeatherSpotKey, WeatherCacheEntry>>(merged);
        }
    }
}
