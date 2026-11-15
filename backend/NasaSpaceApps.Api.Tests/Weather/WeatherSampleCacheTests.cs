using Microsoft.Extensions.Configuration;
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
    public void SampleRemainsLocalAndExpiresFromAcquisition()
    {
        var clock = new TestClock(Acquisition.AddHours(2));
        var unusedStore = new FirestoreWeatherGridStore(null!, new ConfigurationBuilder().Build(), clock);
        using var first = new WeatherSampleCache(unusedStore, clock, NullLogger<WeatherSampleCache>.Instance);
        using var second = new WeatherSampleCache(unusedStore, clock, NullLogger<WeatherSampleCache>.Instance);
        var entry = Sample(clock, Source("available", 4), Source("available", 7));
        first.Save(new Dictionary<WeatherSpotKey, WeatherCacheEntry> { [Key] = entry });
        clock.Now = Acquisition.AddHours(24).AddSeconds(-1);
        Assert.Equal(4, first.Read(Key)?.Sources.Danger.Values["sample"].Value);
        Assert.Null(second.Read(Key));
        clock.Now = Acquisition.AddHours(24);
        Assert.Null(first.Read(Key));
    }

    [Fact]
    public void PartialResultsRetryAndRecoveredSourcesKeepTheirProvenance()
    {
        var clock = new TestClock(Acquisition);
        var danger = Source("available", 4) with { PublishedAtUtc = Acquisition.AddHours(-1) };
        var firstPass = Sample(clock, danger, Source("source_unavailable", null));
        clock.Now = Acquisition.AddSeconds(119);
        Assert.False(firstPass.ShouldRetry(clock.Now));
        clock.Now = Acquisition.AddMinutes(2);
        Assert.True(firstPass.ShouldRetry(clock.Now));
        var retry = Sample(clock, Source("source_unavailable", null), Source("available", 7));
        var saved = WeatherCacheEntry.Merge(firstPass, retry);
        Assert.Null(saved.RetryAt);
        Assert.Equal(danger.PublishedAtUtc, saved.Sources.Danger.PublishedAtUtc);
        Assert.Equal(4, saved.Sources.Danger.Values["sample"].Value);
        Assert.Equal(7, saved.Sources.Fuel.Values["sample"].Value);
    }

    private static WeatherCacheEntry Sample(TimeProvider clock, HotspotWeatherSource danger, HotspotWeatherSource fuel) =>
        WeatherCacheEntry.FromSample(new GridSources([], danger, Source("available", 1), fuel), clock.GetUtcNow());

    private static HotspotWeatherSource Source(string status, double? value) =>
        new("Provider", "Model", "forecast", 45, 7, 0.25, Acquisition.AddHours(-6), "bilinear", status, null,
            new Dictionary<string, HotspotWeatherValue>
            {
                ["sample"] = new(value, "K", Acquisition, Acquisition.AddHours(1), 0,
                    value.HasValue ? null : "source_unavailable"),
            });

    private sealed class TestClock(DateTimeOffset now) : TimeProvider
    {
        internal DateTimeOffset Now { get; set; } = now;
        public override DateTimeOffset GetUtcNow() => Now;
    }
}
