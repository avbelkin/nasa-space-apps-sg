using NasaSpaceApps.Api.Firms;
using NasaSpaceApps.Api.Satellites;
using Xunit;

namespace NasaSpaceApps.Api.Tests.Firms;

public sealed class HotspotGeometryTests
{
    [Fact]
    public void FitsANadirDetectionAfterTheReportedMinute()
    {
        var terra = SatelliteCatalog.Default.Single(satellite => satellite.Id == "terra");
        var tle = SatelliteTleParser.ParseSingle(terra.Name, terra.DefaultTleLine1, terra.DefaultTleLine2)!;
        var minute = new DateTimeOffset(tle.EpochUtc).ToUnixTimeSeconds() / 60 * 60;
        var acquired = DateTimeOffset.FromUnixTimeSeconds(minute);
        var scanTime = acquired.AddSeconds(249);
        var state = SatelliteOrbitPropagator.Propagate(tle, scanTime.UtcDateTime);
        var calculator = new HotspotGeometryCalculator(new Dictionary<int, ResolvedTleEntry>
        {
            [terra.NoradId] = new(tle, "test"),
        });
        var spot = Hotspot(state.Latitude, state.Longitude, acquired);

        var geometry = calculator.Calculate(spot);
        var orbit = Assert.IsType<HotspotOrbitGeometry>(geometry.Orbit);
        Assert.InRange((geometry.EstimatedObservationUtc - scanTime).TotalSeconds, -4, 4);
        Assert.InRange(orbit.SlantRangeKm, state.AltitudeKm - 2, state.AltitudeKm + 2);
        Assert.InRange(orbit.ViewZenithDeg, 0, 2);
        Assert.InRange(orbit.OffNadirDeg, 0, 2);
        Assert.NotNull(geometry.Sun.SensorLookSeparationDeg);

        var tooOld = calculator.Calculate(spot with { AcquiredAtUtc = acquired.AddDays(-6) });
        Assert.Null(tooOld.Orbit);
        Assert.Null(tooOld.Sun.SensorLookSeparationDeg);
        Assert.InRange(tooOld.Moon.ElevationDeg, -90, 90);

        var oppositeSide = calculator.Calculate(spot with
        {
            Latitude = -spot.Latitude,
            Longitude = spot.Longitude > 0 ? spot.Longitude - 180 : spot.Longitude + 180,
        });
        Assert.Null(oppositeSide.Orbit);
    }

    [Fact]
    public void NearSpecularLightHasSmallGlintAngleEvenWhenItIsFarFromTheDirectLookDirection()
    {
        var frame = new HotspotLocalFrame(0, 0);
        var sensor = frame.Position + new VectorKm(500, -500, 0);
        var light = frame.Position + new VectorKm(100_000, 100_000, 0);

        var geometry = HotspotGeometryCalculator.DescribeLight(frame, light, sensor);
        Assert.Equal(45, geometry.ElevationDeg);
        Assert.Equal(90, geometry.AzimuthDeg);
        Assert.Equal(180, geometry.RelativeAzimuthDeg);
        Assert.Equal(0, geometry.GlintAngleDeg);
        Assert.InRange(geometry.SensorLookSeparationDeg!.Value, 89, 91);

        var belowHorizon = HotspotGeometryCalculator.DescribeLight(
            frame, frame.Position + new VectorKm(-100_000, 100_000, 0), sensor);
        Assert.Equal(-45, belowHorizon.ElevationDeg);
        Assert.Null(belowHorizon.GlintAngleDeg);
    }

    [Fact]
    public void SolarEclipseMatchesThePublishedAltitudeAndHasANearlyNewMoon()
    {
        // USNO: https://aa.usno.navy.mil/calculated/eclipse/solar?eclipse=12024&height=156&lat=32.976292&lon=-96.582335
        var time = new DateTimeOffset(2024, 4, 8, 18, 43, 12, TimeSpan.Zero);
        var calculator = new HotspotGeometryCalculator(new Dictionary<int, ResolvedTleEntry>());
        var geometry = calculator.Calculate(Hotspot(32.976292, -96.582335, time));

        Assert.InRange(geometry.Sun.ElevationDeg, 64.1, 64.7);
        Assert.InRange(geometry.Sun.AzimuthDeg!.Value, 188.5, 189.1);
        Assert.InRange(geometry.Moon.ElevationDeg - geometry.Sun.ElevationDeg, -0.4, 0.4);
        Assert.InRange(geometry.MoonIlluminatedFraction, 0, 0.001);
        Assert.InRange(geometry.MoonDistanceKm, 352_000, 356_000);

        var fullMoon = calculator.Calculate(Hotspot(32.976292, -96.582335, time.AddDays(-14)));
        Assert.InRange(fullMoon.MoonIlluminatedFraction, 0.99, 1);
    }

    private static FirmsHotspot Hotspot(double lat, double lng, DateTimeOffset acquired) =>
        new(lat, lng, 350, null, null, null, acquired, "T", "MODIS", "MODIS_NRT", "80", 80, "6.1NRT", 35, "D");
}
