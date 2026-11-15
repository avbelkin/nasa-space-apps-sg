using NasaSpaceApps.Api.Firms;

namespace NasaSpaceApps.Api.LandCover;

public sealed record LandCoverShare(int Code, double Fraction);
public sealed record LandCoverSummary(int DominantCode, double Coverage, IReadOnlyList<LandCoverShare> Classes);

internal static class LandCoverFootprint
{
    public const int PixelsPerDegree = 360;
    public const int Width = 360 * PixelsPerDegree;
    public const int Height = 180 * PixelsPerDegree;
    private const double EarthRadiusMeters = 6_371_008.8;
    private const int Rings = 12;
    private const int Bearings = 32;
    public const int SampleCount = Rings * Bearings;
    private const double Radians = Math.PI / 180;
    private static readonly (double East, double North, double Radius)[] Offsets = BuildOffsets();

    public static void Sample(FirmsHotspot spot, Span<int> cellsX, Span<int> cellsY)
    {
        var radius = RadiusMeters(spot) / EarthRadiusMeters;
        var phi = spot.Latitude * Radians;
        var sinLat = Math.Sin(phi);
        var cosLat = Math.Cos(phi);

        // Equal-area annuli and bearing sectors on the sphere. Resolve each sector's midpoint
        // to a native raster cell; duplicate cells retain their weight in the footprint.
        var edge = Math.Sin(radius / 2);
        for (var i = 0; i < Offsets.Length; i++)
        {
            var (east, north, distance) = Offsets[i];
            var angular = 2 * Math.Asin(edge * distance);
            var (sin, cos) = Math.SinCos(angular);
            var latitude = Math.Asin(Math.Clamp(sinLat * cos + cosLat * sin * north, -1, 1)) / Radians;
            var longitude = spot.Longitude + Math.Atan2(sin * east, cosLat * cos - sinLat * sin * north) / Radians;
            cellsX[i] = ((int)Math.Floor((longitude + 180) * PixelsPerDegree) % Width + Width) % Width;
            cellsY[i] = Math.Clamp((int)Math.Floor((90 - latitude) * PixelsPerDegree), 0, Height - 1);
        }
    }

    public static double RadiusMeters(FirmsHotspot spot)
    {
        // FIRMS scan/track are full pixel dimensions. In the absence of pixel orientation,
        // use a circle with the same area, or the API's nominal radius if dimensions are missing.
        return spot is { ScanKm: > 0 and <= 20, TrackKm: > 0 and <= 20 }
            ? Math.Sqrt(spot.ScanKm.Value * spot.TrackKm.Value / Math.PI) * 1000
            : FirmsSensorCatalog.Resolve(spot.SourceDataset).RadiusMeters;
    }

    public static LandCoverSummary? Summarize(ReadOnlySpan<ushort> counts)
    {
        var valid = 0;
        var shares = new List<(int Code, int Count)>();
        for (var code = 1; code < counts.Length; code++)
        {
            if (counts[code] == 0) continue;
            valid += counts[code];
            shares.Add((code, counts[code]));
        }

        if (valid == 0) return null;

        shares.Sort((a, b) => a.Count != b.Count ? b.Count.CompareTo(a.Count) : a.Code.CompareTo(b.Code));
        return new LandCoverSummary(
            shares[0].Code,
            Math.Round((double)valid / SampleCount, 3),
            shares.Select(s => new LandCoverShare(s.Code, Math.Round((double)s.Count / valid, 3))).ToArray());
    }

    private static (double, double, double)[] BuildOffsets()
    {
        var offsets = new (double, double, double)[SampleCount];
        for (var ring = 0; ring < Rings; ring++)
        for (var bearing = 0; bearing < Bearings; bearing++)
        {
            var azimuth = 2 * Math.PI * (bearing + (ring % 2 == 0 ? 0.25 : 0.75)) / Bearings;
            var (east, north) = Math.SinCos(azimuth);
            offsets[ring * Bearings + bearing] = (east, north, Math.Sqrt((ring + 0.5) / Rings));
        }

        return offsets;
    }
}
