using System.Text.Json;
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
            Assert.True(meta.WideSwathKm.HasValue && meta.WideSwathKm.Value > meta.NadirSwathKm);
            Assert.Contains("harmonized", meta.LayerVariantIds);
        });
    }

    [Fact]
    public void SatelliteSwathBuilder_Creates49VertexNadirAndWideSwathPolygonsAroundSubSatelliteTrajectory()
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
            meta.WideSwathKm!.Value,
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
    public void SatelliteSwathBuilder_SubdividesEdgesKeepsSatelliteInsideAtHighLatitudeAndCutsPolarShapes()
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
            Longitude = 29.5
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
            HeadingDegrees = 288.0
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
    public void SatelliteTrackerProcessor_SnapsTrajectoryTimestampsToWholeSecondsAvoidingBackwardJumps()
    {
        var tle = SatelliteTleParser.ParseSingle("NOAA-20", Noaa20TleLine1, Noaa20TleLine2)!;
        var baseTime = new DateTime(
            tle.EpochUtc.Year,
            tle.EpochUtc.Month,
            tle.EpochUtc.Day,
            tle.EpochUtc.Hour,
            tle.EpochUtc.Minute,
            tle.EpochUtc.Second,
            DateTimeKind.Utc);
        var baseUnix = new DateTimeOffset(baseTime).ToUnixTimeSeconds();
        var t1 = baseTime.AddMilliseconds(900);
        var t2 = baseTime.AddMilliseconds(1050);

        var stateAtBase = SatelliteOrbitPropagator.Propagate(tle, baseTime);
        var bounds = new GeoBounds(
            Math.Clamp(stateAtBase.Longitude - 5.0, -179.9, 179.9),
            Math.Clamp(stateAtBase.Latitude - 5.0, -85.0, 85.0),
            Math.Clamp(stateAtBase.Longitude + 5.0, -179.9, 179.9),
            Math.Clamp(stateAtBase.Latitude + 5.0, -85.0, 85.0));

        var processor = new SatelliteTrackerProcessor(SatelliteCatalog.Default, [tle]);
        var snap1 = processor.GetViewportSnapshot(bounds, t1);
        var snap2 = processor.GetViewportSnapshot(bounds, t2);

        var sat1 = Assert.Single(snap1.Satellites, s => s.NoradId == 43013);
        var sat2 = Assert.Single(snap2.Satellites, s => s.NoradId == 43013);

        Assert.Equal(baseUnix, sat1.Coordinates[0].TimestampSeconds);
        Assert.Equal(baseUnix + 5, sat1.Coordinates[1].TimestampSeconds);
        Assert.Equal(baseUnix + 1, sat2.Coordinates[0].TimestampSeconds);
        Assert.Equal(baseUnix + 6, sat2.Coordinates[1].TimestampSeconds);

        static (double Lon, double Lat) InterpolateAt(LiveSatelliteFeature sat, DateTime queryUtc)
        {
            var querySeconds = (queryUtc - DateTime.UnixEpoch).TotalSeconds;
            var c0 = sat.Coordinates[0];
            var c1 = sat.Coordinates[1];
            var ratio = Math.Clamp((querySeconds - c0.TimestampSeconds) / (double)(c1.TimestampSeconds - c0.TimestampSeconds), 0.0, 1.0);
            return (
                c0.Longitude + (c1.Longitude - c0.Longitude) * ratio,
                c0.Latitude + (c1.Latitude - c0.Latitude) * ratio);
        }

        var posAtT1FromSnap1 = InterpolateAt(sat1, t1);
        var posAtT2FromSnap2 = InterpolateAt(sat2, t2);
        var posAtT2FromSnap1 = InterpolateAt(sat1, t2);

        Assert.Equal(posAtT2FromSnap1.Lat, posAtT2FromSnap2.Lat, tolerance: 0.0005);
        Assert.Equal(posAtT2FromSnap1.Lon, posAtT2FromSnap2.Lon, tolerance: 0.0005);

        var stepVectorLat = sat1.Coordinates[1].Latitude - sat1.Coordinates[0].Latitude;
        var stepVectorLon = sat1.Coordinates[1].Longitude - sat1.Coordinates[0].Longitude;
        var deltaLat = posAtT2FromSnap2.Lat - posAtT1FromSnap1.Lat;
        var deltaLon = posAtT2FromSnap2.Lon - posAtT1FromSnap1.Lon;
        var forwardDotProduct = deltaLat * stepVectorLat + deltaLon * stepVectorLon;
        Assert.True(forwardDotProduct > 0.0, "Satellite position must move forward across sub-second updates.");
    }

    [Fact]
    public void SatelliteTrackerProcessor_EmitsLiveSatelliteDualSwathsHudFreshnessAndGeoJson()
    {
        var tle = SatelliteTleParser.ParseSingle("NOAA-20", Noaa20TleLine1, Noaa20TleLine2)!;
        var state = SatelliteOrbitPropagator.Propagate(tle, tle.EpochUtc);

        var bounds = new GeoBounds(
            Math.Clamp(state.Longitude - 2.0, -179.9, 179.9),
            Math.Clamp(state.Latitude - 2.0, -85.0, 85.0),
            Math.Clamp(state.Longitude + 2.0, -179.9, 179.9),
            Math.Clamp(state.Latitude + 2.0, -85.0, 85.0));

        var processor = new SatelliteTrackerProcessor(SatelliteCatalog.Default, [tle]);
        var snapshot = processor.GetViewportSnapshot(bounds, tle.EpochUtc);

        var noaa20 = Assert.Single(snapshot.Satellites, s => s.NoradId == 43013);
        Assert.Equal("NOAA-20", noaa20.Name);
        Assert.Equal(2, noaa20.Coordinates.Count);
        Assert.InRange(noaa20.AltitudeKm, 800.0, 860.0);
        Assert.InRange(noaa20.GroundSpeedKmS, 6.0, 7.8);

        var nadir = Assert.Single(snapshot.Swaths, s => s.SatelliteId == noaa20.Id && s.SwathRole == "nadir");
        var wide = Assert.Single(snapshot.Swaths, s => s.SatelliteId == noaa20.Id && s.SwathRole == "wide");
        Assert.Equal(49, nadir.PolygonRing.Count);
        Assert.Equal(49, nadir.EndPolygonRing.Count);
        Assert.Equal(49, wide.PolygonRing.Count);
        Assert.Equal(49, wide.EndPolygonRing.Count);

        // Heading-locked endRing preserves front edge width without rotational shear
        var startFrontSpan = double.Hypot(
            wide.PolygonRing[12].Longitude - wide.PolygonRing[0].Longitude,
            wide.PolygonRing[12].Latitude - wide.PolygonRing[0].Latitude);
        var endFrontSpan = double.Hypot(
            wide.EndPolygonRing[12].Longitude - wide.EndPolygonRing[0].Longitude,
            wide.EndPolygonRing[12].Latitude - wide.EndPolygonRing[0].Latitude);
        Assert.Equal(startFrontSpan, endFrontSpan, 2);

        Assert.NotEmpty(snapshot.HudFreshness);
        Assert.Contains(snapshot.HudFreshness, f => f.SatelliteName == "Terra");
        Assert.Contains(snapshot.HudFreshness, f => f.SatelliteName == "Aqua");
        var noaa20Entries = snapshot.HudFreshness.Where(f => f.NoradId == 43013).ToList();
        Assert.Contains(noaa20Entries, f => !f.IsIngested);
        Assert.Contains(noaa20Entries, f => f.IsIngested);

        var geoJson = snapshot.ToGeoJson();
        Assert.Equal("FeatureCollection", geoJson.Type);
        Assert.NotEmpty(geoJson.SatelliteHud);

        var serialized = JsonSerializer.Serialize(geoJson);
        using var doc = JsonDocument.Parse(serialized);
        var root = doc.RootElement;
        Assert.Equal("FeatureCollection", root.GetProperty("type").GetString());
        Assert.True(root.TryGetProperty("features", out var features));
        Assert.True(root.TryGetProperty("satelliteHud", out var hud));
        Assert.True(features.GetArrayLength() >= 3);
        Assert.True(hud.GetArrayLength() >= 4);
    }

    [Fact]
    public void SatelliteTrackerProcessor_ReturnsEmptyWhenBoundsNullOrInvalid()
    {
        var processor = new SatelliteTrackerProcessor(SatelliteCatalog.Default, []);
        Assert.Same(SatelliteViewportSnapshot.Empty, processor.GetViewportSnapshot(null));
        Assert.Same(SatelliteViewportSnapshot.Empty, processor.GetViewportSnapshot(new GeoBounds(10, 20, 10, 10)));
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
