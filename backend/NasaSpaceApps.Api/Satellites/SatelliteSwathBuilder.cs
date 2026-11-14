namespace NasaSpaceApps.Api.Satellites;

public sealed record SwathVertex(double Longitude, double Latitude);

/// <summary>
/// Builds closed 49-vertex instantaneous satellite sensor swath footprint polygons
/// aligned with the spacecraft ground-track heading.
/// </summary>
public static class SatelliteSwathBuilder
{
    private const int EdgeSubdivisionSegments = 12;
    private const double MetersPerDegreeLatitude = 111_194.9266;
    private const double MinEffectiveCosLatitude = 0.35;
    private const double MaxPolarCosReferenceLatitude = 75.0;
    private const double MaxSwathLatitude = 78.0;
    private const double MaxCrossTrackLongitudeHalfSpanDegrees = 25.0;
    private const double MaxTotalLongitudeHalfSpanDegrees = 35.0;
    private const double AntimeridianClampDegrees = 179.99;
    private const double DegToRad = Math.PI / 180.0;
    private const double MinHalfWidthMeters = 1000.0;
    private const double MinHalfLengthMeters = 5000.0;
    private const double HalfKmToMetersFactor = 500.0;

    /// <summary>
    /// Builds a closed perimeter polygon centered at <paramref name="startState"/> using its heading.
    /// </summary>
    public static IReadOnlyList<SwathVertex> BuildInstantaneousSwathPolygon(
        SatelliteOrbitalState startState,
        SatelliteOrbitalState endState,
        double swathWidthKm,
        double alongTrackKm = 180.0)
    {
        _ = endState;

        var centerLat = Math.Clamp(startState.Latitude, -MaxSwathLatitude, MaxSwathLatitude);
        var centerLon = Math.Clamp(startState.Longitude, -AntimeridianClampDegrees, AntimeridianClampDegrees);

        var halfWidthMeters = Math.Max(MinHalfWidthMeters, swathWidthKm * HalfKmToMetersFactor);
        var halfLengthMeters = Math.Max(MinHalfLengthMeters, alongTrackKm * HalfKmToMetersFactor);

        var cosRefLat = Math.Cos(
            Math.Clamp(centerLat, -MaxPolarCosReferenceLatitude, MaxPolarCosReferenceLatitude) * DegToRad);
        var effectiveCosLat = Math.Max(MinEffectiveCosLatitude, cosRefLat);

        var maxAllowedHalfWidthMeters =
            MaxCrossTrackLongitudeHalfSpanDegrees * MetersPerDegreeLatitude * effectiveCosLat;
        var clampedHalfWidthMeters = Math.Min(halfWidthMeters, maxAllowedHalfWidthMeters);

        var headingRad = startState.HeadingDegrees * DegToRad;
        var alongNorthUnit = Math.Cos(headingRad);
        var alongEastUnit = Math.Sin(headingRad);
        var rightNorthUnit = -Math.Sin(headingRad);
        var rightEastUnit = Math.Cos(headingRad);

        var vertices = new List<SwathVertex>(EdgeSubdivisionSegments * 4 + 1);

        SwathVertex ComputePerimeterVertex(double alongFactor, double rightFactor)
        {
            var northMeters = alongFactor * halfLengthMeters * alongNorthUnit
                            + rightFactor * clampedHalfWidthMeters * rightNorthUnit;
            var eastMeters = alongFactor * halfLengthMeters * alongEastUnit
                           + rightFactor * clampedHalfWidthMeters * rightEastUnit;

            var deltaLat = northMeters / MetersPerDegreeLatitude;
            var deltaLon = Math.Clamp(
                eastMeters / (MetersPerDegreeLatitude * effectiveCosLat),
                -MaxTotalLongitudeHalfSpanDegrees,
                MaxTotalLongitudeHalfSpanDegrees);

            var lat = Math.Clamp(centerLat + deltaLat, -MaxSwathLatitude, MaxSwathLatitude);
            var lon = Math.Clamp(centerLon + deltaLon, -AntimeridianClampDegrees, AntimeridianClampDegrees);
            return new SwathVertex(Math.Round(lon, 5), Math.Round(lat, 5));
        }

        // Front edge: frontLeft (along = +1, right = -1) -> frontRight (along = +1, right = +1)
        for (var i = 0; i < EdgeSubdivisionSegments; i++)
        {
            var t = -1.0 + 2.0 * i / EdgeSubdivisionSegments;
            vertices.Add(ComputePerimeterVertex(1.0, t));
        }

        // Right edge: frontRight (along = +1, right = +1) -> backRight (along = -1, right = +1)
        for (var i = 0; i < EdgeSubdivisionSegments; i++)
        {
            var t = 1.0 - 2.0 * i / EdgeSubdivisionSegments;
            vertices.Add(ComputePerimeterVertex(t, 1.0));
        }

        // Back edge: backRight (along = -1, right = +1) -> backLeft (along = -1, right = -1)
        for (var i = 0; i < EdgeSubdivisionSegments; i++)
        {
            var t = 1.0 - 2.0 * i / EdgeSubdivisionSegments;
            vertices.Add(ComputePerimeterVertex(-1.0, t));
        }

        // Left edge: backLeft (along = -1, right = -1) -> frontLeft (along = +1, right = -1)
        for (var i = 0; i < EdgeSubdivisionSegments; i++)
        {
            var t = -1.0 + 2.0 * i / EdgeSubdivisionSegments;
            vertices.Add(ComputePerimeterVertex(t, -1.0));
        }

        vertices.Add(vertices[0]);
        return vertices;
    }
}
