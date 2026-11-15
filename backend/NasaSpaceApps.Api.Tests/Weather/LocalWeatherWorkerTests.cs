using NasaSpaceApps.Api.Firms;
using NasaSpaceApps.Api.Weather;
using Xunit;

namespace NasaSpaceApps.Api.Tests.Weather;

public sealed class LocalWeatherWorkerTests
{
    [Fact]
    public void ScanIncludesSpotsBeyondTheCloudCapAndSkipsCompletedOrCoolingDownEntries()
    {
        var now = new DateTimeOffset(2026, 1, 12, 9, 30, 0, TimeSpan.Zero);
        var spots = Enumerable.Range(0, 600).Select(i => new FirmsHotspot(45, 7 + i / 10000.0, 350, null, null, null,
            now.AddMinutes(-10), "NOAA-20", "VIIRS", "VIIRS_NOAA20_NRT", "n", 60, "", 10, "D")).ToArray();
        var known = new Dictionary<WeatherSpotKey, DateTimeOffset?>
        {
            [WeatherSpotKey.From(spots[0])] = null,
            [WeatherSpotKey.From(spots[1])] = now.AddSeconds(1),
            [WeatherSpotKey.From(spots[2])] = now,
        };

        var batches = LocalWeatherWorker.PlanBatches(spots, known, now).ToArray();
        var scheduled = batches.SelectMany(batch => batch).ToArray();
        Assert.Equal(598, scheduled.Length);
        Assert.All(batches, batch => Assert.InRange(batch.Length, 1, 64));
        Assert.DoesNotContain(spots[0], scheduled);
        Assert.DoesNotContain(spots[1], scheduled);
        Assert.Equal(spots[2], scheduled[^1]);
    }
}
