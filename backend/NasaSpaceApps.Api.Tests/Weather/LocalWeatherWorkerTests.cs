using NasaSpaceApps.Api.Firms;
using NasaSpaceApps.Api.Weather;
using Xunit;

namespace NasaSpaceApps.Api.Tests.Weather;

public sealed class LocalWeatherWorkerTests
{
    [Fact]
    public void ScanDeduplicatesInputsByGridAndAcquisitionAndSkipsCoolingDownSelections()
    {
        var now = new DateTimeOffset(2026, 1, 12, 9, 30, 0, TimeSpan.Zero);
        var spots = Enumerable.Range(0, 600).Select(i => new FirmsHotspot(45, 7 + i / 10000.0, 350, null, null, null,
            now.AddHours(-(i / 25)).AddMinutes(-(i % 25)), "NOAA-20", "VIIRS", "VIIRS_NOAA20_NRT", "n", 60, "", 10, "D")).ToArray();
        var known = new Dictionary<LocalWeatherWorker.GridWorkKey, DateTimeOffset>
        {
            [LocalWeatherWorker.GridWorkKey.From(spots[0])] = now.AddMinutes(15),
            [LocalWeatherWorker.GridWorkKey.From(spots[1])] = now.AddSeconds(1),
            [LocalWeatherWorker.GridWorkKey.From(spots[2])] = now,
        };

        var duplicate = spots[3] with { Latitude = 45.1 };
        var batches = LocalWeatherWorker.PlanBatches([.. spots, duplicate], known, now).ToArray();
        var scheduled = batches.SelectMany(batch => batch).ToArray();
        Assert.Equal(598, scheduled.Length);
        Assert.All(batches, batch => Assert.InRange(batch.Length, 1, 64));
        Assert.DoesNotContain(spots[0], scheduled);
        Assert.DoesNotContain(spots[1], scheduled);
        Assert.DoesNotContain(duplicate, scheduled);
        Assert.Equal(spots[2], scheduled[^1]);
    }
}
