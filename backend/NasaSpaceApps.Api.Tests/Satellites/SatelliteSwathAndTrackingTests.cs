using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;
using NasaSpaceApps.Api.Satellites;
using Xunit;

namespace NasaSpaceApps.Api.Tests.Satellites;

public sealed class SatelliteSwathAndTrackingTests
{
    private const string Noaa20TleLine1 =
        "1 43013U 17073A   26317.92457274  .00000075  00000+0  56363-4 0  9996";
    private const string Noaa20TleLine2 =
        "2 43013  98.7926 256.1370 0001164 130.8784 229.2493 14.19536900465713";

    [Fact]
    public void SatelliteCatalog_ContainsModisAndViirsFleetWithLayerVariantIds()
    {
        Assert.Equal(4, SatelliteCatalog.Default.Count);
        Assert.Contains(SatelliteCatalog.Default, s => s.NoradId == 25994 && s.Name == "Terra" && s.LayerVariantIds.Contains("modis"));
        Assert.Contains(SatelliteCatalog.Default, s => s.NoradId == 27424 && s.Name == "Aqua" && s.LayerVariantIds.Contains("modis"));
        Assert.Contains(SatelliteCatalog.Default, s => s.NoradId == 43013 && s.Name == "NOAA-20" && s.LayerVariantIds.Contains("viirs"));
        Assert.Contains(SatelliteCatalog.Default, s => s.NoradId == 54234 && s.Name == "NOAA-21" && s.LayerVariantIds.Contains("viirs"));

        Assert.All(SatelliteCatalog.Default, meta =>
        {
            Assert.True(meta.NadirSwathKm > 0);
            Assert.True(meta.WideSwathKm > meta.NadirSwathKm);
            Assert.Contains("harmonized", meta.LayerVariantIds);
        });
    }

    [Fact]
    public void SatelliteSwathBuilder_Creates49VertexNadirAndWideSwathPolygons()
    {
        var meta = SatelliteCatalog.GetByNoradId(43013)!;
        var tle = SatelliteTleParser.ParseSingle(meta.Name, Noaa20TleLine1, Noaa20TleLine2)!;

        var startState = SatelliteOrbitPropagator.Propagate(tle, tle.EpochUtc);
        var endState = SatelliteOrbitPropagator.Propagate(tle, tle.EpochUtc.AddSeconds(5));

        var nadirPolygon = SatelliteSwathBuilder.BuildInstantaneousSwathPolygon(
            startState,
            endState,
            meta.NadirSwathKm,
            alongTrackKm: 180.0);
        var widePolygon = SatelliteSwathBuilder.BuildInstantaneousSwathPolygon(
            startState,
            endState,
            meta.WideSwathKm,
            alongTrackKm: 280.0);

        Assert.Equal(49, nadirPolygon.Count);
        Assert.Equal(nadirPolygon[0].Longitude, nadirPolygon[^1].Longitude, 5);
        Assert.Equal(nadirPolygon[0].Latitude, nadirPolygon[^1].Latitude, 5);

        Assert.Equal(49, widePolygon.Count);
        var nadirLonSpan = nadirPolygon.Max(p => p.Longitude) - nadirPolygon.Min(p => p.Longitude);
        var wideLonSpan = widePolygon.Max(p => p.Longitude) - widePolygon.Min(p => p.Longitude);
        Assert.True(wideLonSpan > nadirLonSpan);
    }

    [Fact]
    public void SatelliteSwathBuilder_KeepsSatelliteInsideAtHighLatitudeAndClampsPolarShapes()
    {
        var nowUtc = new DateTime(2026, 10, 21, 12, 0, 0, DateTimeKind.Utc);
        var highLatStart = new SatelliteOrbitalState(
            TimestampUtc: nowUtc,
            Latitude: 65.0,
            Longitude: 30.0,
            AltitudeKm: 830.0,
            GroundSpeedKmS: 7.4,
            HeadingDegrees: 215.0,
            IsAscending: false);
        var highLatEnd = highLatStart with
        {
            TimestampUtc = nowUtc.AddSeconds(5),
            Latitude = 64.7,
            Longitude = 29.5,
        };

        var highLatWide = SatelliteSwathBuilder.BuildInstantaneousSwathPolygon(
            highLatStart,
            highLatEnd,
            swathWidthKm: 3040.0,
            alongTrackKm: 280.0);

        Assert.Equal(49, highLatWide.Count);
        Assert.True(IsPointInPolygon(highLatStart.Longitude, highLatStart.Latitude, highLatWide));

        var polarStart = new SatelliteOrbitalState(
            TimestampUtc: nowUtc,
            Latitude: 76.0,
            Longitude: 170.0,
            AltitudeKm: 830.0,
            GroundSpeedKmS: 7.4,
            HeadingDegrees: 290.0,
            IsAscending: true);
        var polarEnd = polarStart with
        {
            TimestampUtc = nowUtc.AddSeconds(5),
            Latitude = 76.1,
            Longitude = 169.0,
            HeadingDegrees = 288.0,
        };

        var polarWide = SatelliteSwathBuilder.BuildInstantaneousSwathPolygon(
            polarStart,
            polarEnd,
            swathWidthKm: 3040.0,
            alongTrackKm: 280.0);

        Assert.All(polarWide, pt =>
        {
            Assert.InRange(pt.Latitude, -78.0, 78.0);
            Assert.InRange(pt.Longitude, 130.0, 180.0);
        });
    }

    [Fact]
    public void SatelliteOverpassEvaluator_ComputesReadyAndProcessingHudFreshness()
    {
        var tle = SatelliteTleParser.ParseSingle("NOAA-20", Noaa20TleLine1, Noaa20TleLine2)!;
        var state = SatelliteOrbitPropagator.Propagate(tle, tle.EpochUtc);

        var entries = SatelliteOverpassEvaluator.EvaluateFleetFreshness(
            SatelliteCatalog.Default,
            new Dictionary<int, SatelliteTle> { [43013] = tle },
            state.Latitude,
            state.Longitude,
            tle.EpochUtc);

        Assert.Equal(4, entries.Count);
        Assert.Equal(entries.Count, entries.Select(e => e.NoradId).Distinct().Count());
        Assert.Contains(entries, f => f.SatelliteName == "Terra");
        Assert.Contains(entries, f => f.SatelliteName == "Aqua");

        var noaa20Entry = Assert.Single(entries, f => f.NoradId == 43013);
        Assert.Equal(0, noaa20Entry.MinutesSincePass);
        Assert.False(noaa20Entry.IsIngested);
        Assert.True(noaa20Entry.IsNadirPass);
        Assert.True(noaa20Entry.NextPassMinutes > 30);

        for (var i = 1; i < entries.Count; i++)
        {
            Assert.True(entries[i].MinutesSincePass >= entries[i - 1].MinutesSincePass);
        }

        // Straddling NOAA-20's 90-minute ingestion lag must still yield one unique entry per satellite.
        var straddleEntries = SatelliteOverpassEvaluator.EvaluateFleetFreshness(
            SatelliteCatalog.Default,
            new Dictionary<int, SatelliteTle> { [43013] = tle },
            state.Latitude,
            state.Longitude,
            tle.EpochUtc.AddMinutes(90));

        Assert.Equal(4, straddleEntries.Count);
        Assert.Equal(1, straddleEntries.Count(e => e.NoradId == 43013));
    }

    [Fact]
    public async Task SatelliteOrbitService_PreservesAndExposesTleLinesOnDtos()
    {
        var parsed = SatelliteTleParser.ParseSingle("NOAA-20", $"  {Noaa20TleLine1}  ", $"  {Noaa20TleLine2}  ");
        Assert.NotNull(parsed);
        Assert.Equal(Noaa20TleLine1, parsed.Line1);
        Assert.Equal(Noaa20TleLine2, parsed.Line2);

        using var memoryCache = new MemoryCache(new MemoryCacheOptions());
        var downloader = new CelesTrakTleDownloader(
            new FailingHttpClientFactory(),
            memoryCache,
            NullLogger<CelesTrakTleDownloader>.Instance);
        var service = new SatelliteOrbitService(downloader);

        var response = await service.GetOrbitsAsync(pastMinutes: 10, futureMinutes: 20, stepSeconds: 60);

        Assert.Equal(SatelliteCatalog.Default.Count, response.Satellites.Count);
        Assert.All(response.Satellites, sat =>
        {
            Assert.Equal(69, sat.TleLine1.Length);
            Assert.Equal(69, sat.TleLine2.Length);
            Assert.StartsWith($"1 {sat.NoradId}", sat.TleLine1, StringComparison.Ordinal);
            Assert.StartsWith($"2 {sat.NoradId}", sat.TleLine2, StringComparison.Ordinal);
        });
    }

    [Fact]
    public async Task SatelliteOrbitService_DefaultWindowCoversProcessingLagPlusReadyTail()
    {
        Assert.Equal(180, SatelliteOrbitService.DefaultPastMinutes);
        Assert.Equal(30, SatelliteOrbitService.DefaultFutureMinutes);
        Assert.Equal(360, SatelliteOrbitService.MaxPastMinutes);

        using var memoryCache = new MemoryCache(new MemoryCacheOptions());
        var downloader = new CelesTrakTleDownloader(
            new FailingHttpClientFactory(),
            memoryCache,
            NullLogger<CelesTrakTleDownloader>.Instance);
        var service = new SatelliteOrbitService(downloader);

        var response = await service.GetOrbitsAsync();

        Assert.Equal(
            (SatelliteOrbitService.DefaultPastMinutes + SatelliteOrbitService.DefaultFutureMinutes) * 60_000L,
            response.WindowEndUnixMs - response.WindowStartUnixMs);

        Assert.All(response.Satellites, sat =>
        {
            var nowMs = sat.CurrentPosition.TimestampUnixMs;
            var cutoffMs = nowMs - sat.TypicalIngestionLagMinutes * 60_000L;

            Assert.Contains(sat.Track, pt => pt.TimestampUnixMs <= cutoffMs - 55 * 60_000L);
            Assert.Contains(sat.Track, pt => pt.TimestampUnixMs > cutoffMs && pt.TimestampUnixMs < nowMs);
            Assert.Contains(sat.Track, pt => pt.TimestampUnixMs > nowMs);
        });
    }

    private sealed class FailingHttpClientFactory : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) =>
            new(new ThrowingHandler())
            {
                BaseAddress = new Uri("https://celestrak.org/"),
            };
    }

    private sealed class ThrowingHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            throw new HttpRequestException("Simulated offline test");
    }

    private static bool IsPointInPolygon(double lon, double lat, IReadOnlyList<SwathVertex> ring)
    {
        var inside = false;
        for (int i = 0, j = ring.Count - 1; i < ring.Count; j = i++)
        {
            var xi = ring[i].Longitude;
            var yi = ring[i].Latitude;
            var xj = ring[j].Longitude;
            var yj = ring[j].Latitude;

            var intersect = ((yi > lat) != (yj > lat))
                && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi);
            if (intersect)
            {
                inside = !inside;
            }
        }

        return inside;
    }
}
