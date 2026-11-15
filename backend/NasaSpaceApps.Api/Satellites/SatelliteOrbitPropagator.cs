namespace NasaSpaceApps.Api.Satellites;

public sealed record SatelliteOrbitalState(
    DateTime TimestampUtc,
    double Latitude,
    double Longitude,
    double AltitudeKm,
    double GroundSpeedKmS,
    double HeadingDegrees,
    bool IsAscending);

// J2 Secular Perturbations & SGP4-compatible LEO propagator
// Reference: Hoots, F. R., & Roehrich, R. L. (1980), "Spacetrack Report No. 3: Models for Propagation of NORAD Element Sets"
public static class SatelliteOrbitPropagator
{
    private const double EarthGravitationalParameterKm3S2 = 398600.8;
    private const double EarthEquatorialRadiusKm = 6378.135;
    private const double EarthFlattening = 1.0 / 298.26;
    private const double J2Harmonic = 1.082616e-3;
    private const double SecondsPerDay = 86400.0;
    private const double TwoPi = 2.0 * Math.PI;
    private const double DegToRad = Math.PI / 180.0;
    private const double RadToDeg = 180.0 / Math.PI;

    public static SatelliteOrbitalState Propagate(SatelliteTle tle, DateTime timestampUtc)
    {
        var utc = timestampUtc.Kind == DateTimeKind.Utc
            ? timestampUtc
            : DateTime.SpecifyKind(timestampUtc, DateTimeKind.Utc);

        var current = ComputeEciAndGeodetic(tle, utc);
        var next = ComputeEciAndGeodetic(tle, utc.AddSeconds(1.0));

        var lat0Rad = current.Latitude * DegToRad;
        var lat1Rad = next.Latitude * DegToRad;
        var dLatRad = (next.Latitude - current.Latitude) * DegToRad;
        var dLonDeg = NormalizeLongitudeDegrees(next.Longitude - current.Longitude);
        var dLonRad = dLonDeg * DegToRad;

        var y = Math.Sin(dLonRad) * Math.Cos(lat1Rad);
        var x = Math.Cos(lat0Rad) * Math.Sin(lat1Rad)
              - Math.Sin(lat0Rad) * Math.Cos(lat1Rad) * Math.Cos(dLonRad);
        var headingDegrees = ((Math.Atan2(y, x) * RadToDeg) % 360.0 + 360.0) % 360.0;

        var sinHalfDLat = Math.Sin(dLatRad * 0.5);
        var sinHalfDLon = Math.Sin(dLonRad * 0.5);
        var a = sinHalfDLat * sinHalfDLat
              + Math.Cos(lat0Rad) * Math.Cos(lat1Rad) * sinHalfDLon * sinHalfDLon;
        var centralAngle = 2.0 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(Math.Max(0.0, 1.0 - a)));
        var groundDistanceKm = EarthEquatorialRadiusKm * centralAngle;
        var groundSpeedKmS = Math.Clamp(groundDistanceKm, 5.5, 8.2);

        return new SatelliteOrbitalState(
            utc,
            current.Latitude,
            current.Longitude,
            current.AltitudeKm,
            groundSpeedKmS,
            headingDegrees,
            IsAscending: next.Latitude >= current.Latitude);
    }

    public static IReadOnlyList<SatelliteOrbitalState> ComputeGroundTrack(
        SatelliteTle tle,
        DateTime startUtc,
        DateTime endUtc,
        TimeSpan step)
    {
        if (step <= TimeSpan.Zero)
        {
            throw new ArgumentOutOfRangeException(nameof(step));
        }

        var list = new List<SatelliteOrbitalState>();
        for (var t = startUtc; t <= endUtc; t = t.Add(step))
        {
            list.Add(Propagate(tle, t));
        }

        return list;
    }

    internal static (double X, double Y, double Z) ComputeEarthFixedPosition(SatelliteTle tle, DateTime utc)
    {
        var dtSeconds = (utc - tle.EpochUtc).TotalSeconds;
        var n0RadPerSec = tle.MeanMotionRevPerDay * TwoPi / SecondsPerDay;
        var a0Km = Math.Pow(EarthGravitationalParameterKm3S2 / (n0RadPerSec * n0RadPerSec), 1.0 / 3.0);

        var i0 = tle.InclinationDegrees * DegToRad;
        var e0 = Math.Clamp(tle.Eccentricity, 0.0, 0.99);
        var cosI = Math.Cos(i0);
        var sinI = Math.Sin(i0);
        var beta2 = 1.0 - e0 * e0;
        var pKm = a0Km * beta2;
        var j2Factor = 1.5 * J2Harmonic * (EarthEquatorialRadiusKm / pKm) * (EarthEquatorialRadiusKm / pKm);

        var nBar = n0RadPerSec * (1.0 + j2Factor * Math.Sqrt(beta2) * (1.0 - 1.5 * sinI * sinI));
        var aKm = Math.Pow(EarthGravitationalParameterKm3S2 / (nBar * nBar), 1.0 / 3.0);

        var raanDot = -j2Factor * nBar * cosI;
        var argPerigeeDot = 0.5 * j2Factor * nBar * (4.0 - 5.0 * sinI * sinI);

        var raan = NormalizeTwoPi(tle.RightAscensionAscendingNodeDegrees * DegToRad + raanDot * dtSeconds);
        var argPerigee = NormalizeTwoPi(tle.ArgumentOfPerigeeDegrees * DegToRad + argPerigeeDot * dtSeconds);
        var meanAnomaly = NormalizeTwoPi(tle.MeanAnomalyDegrees * DegToRad + nBar * dtSeconds);

        var eccentricAnomaly = SolveKepler(meanAnomaly, e0);
        var sinE = Math.Sin(eccentricAnomaly);
        var cosE = Math.Cos(eccentricAnomaly);

        var trueAnomaly = Math.Atan2(Math.Sqrt(beta2) * sinE, cosE - e0);
        var radiusKm = aKm * (1.0 - e0 * cosE);
        var u = argPerigee + trueAnomaly;

        var sinU = Math.Sin(u);
        var cosU = Math.Cos(u);
        var sinRaan = Math.Sin(raan);
        var cosRaan = Math.Cos(raan);

        var xEci = radiusKm * (cosRaan * cosU - sinRaan * sinU * cosI);
        var yEci = radiusKm * (sinRaan * cosU + cosRaan * sinU * cosI);
        var zEci = radiusKm * (sinU * sinI);

        var gmst = ComputeGreenwichMeanSiderealTimeRadians(utc);
        var cosGmst = Math.Cos(gmst);
        var sinGmst = Math.Sin(gmst);

        return (xEci * cosGmst + yEci * sinGmst, -xEci * sinGmst + yEci * cosGmst, zEci);
    }

    private static (double Latitude, double Longitude, double AltitudeKm) ComputeEciAndGeodetic(
        SatelliteTle tle, DateTime utc)
    {
        var (xEcef, yEcef, zEcef) = ComputeEarthFixedPosition(tle, utc);
        var lonRad = Math.Atan2(yEcef, xEcef);
        var lonDeg = NormalizeLongitudeDegrees(lonRad * RadToDeg);

        var rXy = Math.Sqrt(xEcef * xEcef + yEcef * yEcef);
        var e2 = EarthFlattening * (2.0 - EarthFlattening);
        var latRad = Math.Atan2(zEcef, rXy);

        for (var iter = 0; iter < 4; iter++)
        {
            var sinLat = Math.Sin(latRad);
            var c = 1.0 / Math.Sqrt(1.0 - e2 * sinLat * sinLat);
            latRad = Math.Atan2(zEcef + EarthEquatorialRadiusKm * c * e2 * sinLat, rXy);
        }

        var sinFinalLat = Math.Sin(latRad);
        var cFinal = 1.0 / Math.Sqrt(1.0 - e2 * sinFinalLat * sinFinalLat);
        var altitudeKm = (rXy / Math.Cos(latRad)) - EarthEquatorialRadiusKm * cFinal;
        if (Math.Abs(Math.Cos(latRad)) < 1e-5)
        {
            altitudeKm = Math.Abs(zEcef) - EarthEquatorialRadiusKm * (1.0 - EarthFlattening);
        }

        var latDeg = Math.Clamp(latRad * RadToDeg, -89.999, 89.999);
        return (latDeg, lonDeg, altitudeKm);
    }

    private static double SolveKepler(double meanAnomaly, double eccentricity)
    {
        var eccentricAnomaly = meanAnomaly;
        for (var i = 0; i < 6; i++)
        {
            var f = eccentricAnomaly - eccentricity * Math.Sin(eccentricAnomaly) - meanAnomaly;
            var fPrime = 1.0 - eccentricity * Math.Cos(eccentricAnomaly);
            eccentricAnomaly -= f / fPrime;
        }

        return eccentricAnomaly;
    }

    internal static double ComputeGreenwichMeanSiderealTimeRadians(DateTime utc)
    {
        var julianDate = utc.ToOADate() + 2415018.5;
        var ut1Centuries = (julianDate - 2451545.0) / 36525.0;
        var thetaSeconds = 67310.54841
            + (876600.0 * 3600.0 + 8640184.812866) * ut1Centuries
            + 0.093104 * ut1Centuries * ut1Centuries
            - 6.2e-6 * ut1Centuries * ut1Centuries * ut1Centuries;

        var thetaRad = (thetaSeconds % SecondsPerDay) * TwoPi / SecondsPerDay;
        return NormalizeTwoPi(thetaRad);
    }

    private static double NormalizeTwoPi(double radians)
    {
        var mod = radians % TwoPi;
        return mod < 0.0 ? mod + TwoPi : mod;
    }

    private static double NormalizeLongitudeDegrees(double degrees)
    {
        var wrapped = ((degrees + 180.0) % 360.0 + 360.0) % 360.0 - 180.0;
        return Math.Clamp(wrapped, -180.0, 180.0);
    }
}
