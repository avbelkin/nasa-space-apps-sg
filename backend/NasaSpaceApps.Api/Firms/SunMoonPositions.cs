using NasaSpaceApps.Api.Satellites;

namespace NasaSpaceApps.Api.Firms;

internal readonly record struct SunMoonPositions(VectorKm Sun, VectorKm Moon)
{
    private const double AstronomicalUnitKm = 149_597_870.7;

    public static SunMoonPositions At(DateTime utc)
    {
        var days = (utc - new DateTime(2000, 1, 1, 12, 0, 0, DateTimeKind.Utc)).TotalDays;
        var obliquity = (23.439 - 0.00000036 * days) * VectorKm.DegToRad;
        var sidereal = SatelliteOrbitPropagator.ComputeGreenwichMeanSiderealTimeRadians(utc);

        // US Naval Observatory, Computing Approximate Solar Coordinates.
        var solarAnomaly = (357.529 + 0.98560028 * days) % 360.0;
        var sunLongitude = 280.459 + 0.98564736 * days + 1.915 * Sin(solarAnomaly) + 0.020 * Sin(2 * solarAnomaly);
        var sunDistance = AstronomicalUnitKm * (1.00014 - 0.01671 * Cos(solarAnomaly) - 0.00014 * Cos(2 * solarAnomaly));

        // Leading terms of the lunar ecliptic series in Van Flandern & Pulkkinen
        // (1979). The published fundamental arguments are based on JD 2415020.
        var centuries = 1 + days / 36525.0;
        var meanMoon = (270.435378 + 481267.880862 * centuries) % 360.0;
        var m = (296.095334 + 477198.867586 * centuries) % 360.0;
        var f = (11.254070 + 483202.018685 * centuries) % 360.0;
        var d = (350.738975 + 445267.111345 * centuries) % 360.0;
        var moonLongitude = meanMoon + (22640 * Sin(m) - 4586 * Sin(m - 2 * d) + 2370 * Sin(2 * d)
            + 769 * Sin(2 * m) - 668 * Sin(solarAnomaly) - 412 * Sin(2 * f)) / 3600.0;
        var moonLatitude = (18461 * Sin(f) + 1010 * Sin(m + f) + 1000 * Sin(m - f) - 624 * Sin(f - 2 * d)
            - 199 * Sin(m - f - 2 * d) - 167 * Sin(m + f - 2 * d) + 117 * Sin(f + 2 * d)
            + 62 * Sin(2 * m + f)) / 3600.0;
        var moonDistance = VectorKm.EarthRadiusKm * (60.36298 - 3.27746 * Cos(m) - 0.57994 * Cos(m - 2 * d)
            - 0.46357 * Cos(2 * d) - 0.08904 * Cos(2 * m));

        return new SunMoonPositions(
            ToEarthFixed(sunLongitude, 0.0, sunDistance, obliquity, sidereal),
            ToEarthFixed(moonLongitude, moonLatitude, moonDistance, obliquity, sidereal));
    }

    private static VectorKm ToEarthFixed(double longitude, double latitude, double distance, double obliquity, double sidereal)
    {
        var (sinLng, cosLng) = Math.SinCos(longitude % 360.0 * VectorKm.DegToRad);
        var (sinLat, cosLat) = Math.SinCos(latitude * VectorKm.DegToRad);
        var (sinObliquity, cosObliquity) = Math.SinCos(obliquity);
        var (sinSidereal, cosSidereal) = Math.SinCos(sidereal);

        var x = cosLat * cosLng;
        var y = cosLat * sinLng * cosObliquity - sinLat * sinObliquity;
        var z = cosLat * sinLng * sinObliquity + sinLat * cosObliquity;
        return new VectorKm(cosSidereal * x + sinSidereal * y, -sinSidereal * x + cosSidereal * y, z) * distance;
    }

    private static double Sin(double degrees) => Math.Sin(degrees * VectorKm.DegToRad);
    private static double Cos(double degrees) => Math.Cos(degrees * VectorKm.DegToRad);
}
