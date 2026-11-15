using NasaSpaceApps.Api.Satellites;

namespace NasaSpaceApps.Api.Firms;

public sealed record HotspotGeometry(
    DateTimeOffset EstimatedObservationUtc,
    HotspotOrbitGeometry? Orbit,
    HotspotLightGeometry Sun,
    HotspotLightGeometry Moon,
    double MoonPhaseAngleDeg,
    double MoonIlluminatedFraction,
    double MoonDistanceKm);

public sealed record HotspotOrbitGeometry(
    double SlantRangeKm,
    double OffNadirDeg,
    double ViewZenithDeg,
    double? ViewAzimuthDeg,
    DateTimeOffset TleEpochUtc,
    string TleSource);

public sealed record HotspotLightGeometry(
    double ElevationDeg,
    double? AzimuthDeg,
    double? RelativeAzimuthDeg,
    double? SensorLookSeparationDeg,
    double? GlintAngleDeg);

internal sealed class HotspotGeometryCalculator(IReadOnlyDictionary<int, ResolvedTleEntry> fleet)
{
    private const int TrackStepSeconds = 15;
    private const int TrackLeadSeconds = 60;
    private const int TrackLagSeconds = 420;
    private static readonly TimeSpan MaxTleAge = TimeSpan.FromDays(5);
    private static readonly Dictionary<string, SatelliteMetadata> SatellitesByName =
        SatelliteCatalog.Default.ToDictionary(satellite => satellite.Name);

    private readonly Dictionary<(int, long), VectorKm> _track = [];
    private readonly Dictionary<long, SunMoonPositions> _sky = [];

    public HotspotGeometry Calculate(FirmsHotspot spot)
    {
        var frame = new HotspotLocalFrame(spot.Latitude, spot.Longitude);
        var observation = spot.AcquiredAtUtc;
        HotspotOrbitGeometry? orbit = null;
        VectorKm? satellitePosition = null;
        var name = FirmsSensorCatalog.NormalizeSatelliteLabel(spot.Satellite, spot.SourceDataset);

        if (SatellitesByName.TryGetValue(name, out var meta) &&
            fleet.TryGetValue(meta.NoradId, out var resolved) &&
            (observation.UtcDateTime - resolved.Tle.EpochUtc).Duration() <= MaxTleAge)
        {
            var match = FindTrackMatch(resolved.Tle, observation, frame.Position);
            if (match is { } candidate)
            {
                var sightline = candidate.Position - frame.Position;
                var view = frame.GetDirection(sightline);
                // Allow some margin at the edge of the nominal swath for TLE/model error.
                var maxViewZenith = meta.Instrument == "modis" ? 68.0 : 75.0;
                if (view.ElevationDeg >= 90.0 - maxViewZenith)
                {
                    satellitePosition = candidate.Position;
                    observation = candidate.Time;
                    orbit = new HotspotOrbitGeometry(
                        Math.Round(sightline.Length),
                        Math.Round(VectorKm.AngleDeg(sightline, candidate.Position), 1),
                        Math.Round(90.0 - view.ElevationDeg, 1),
                        RoundAzimuth(view.AzimuthDeg),
                        new DateTimeOffset(resolved.Tle.EpochUtc, TimeSpan.Zero),
                        resolved.Source);
                }
            }
        }

        // Positions vary slowly enough to reuse the sky calculation across nearby scans.
        var skySeconds = ((observation.ToUnixTimeSeconds() + 5) / 10) * 10;
        if (!_sky.TryGetValue(skySeconds, out var sky))
        {
            sky = SunMoonPositions.At(DateTimeOffset.FromUnixTimeSeconds(skySeconds).UtcDateTime);
            _sky.Add(skySeconds, sky);
        }

        var moonPhase = VectorKm.AngleDeg(sky.Sun - sky.Moon, frame.Position - sky.Moon);
        return new HotspotGeometry(
            observation,
            orbit,
            DescribeLight(frame, sky.Sun, satellitePosition),
            DescribeLight(frame, sky.Moon, satellitePosition),
            Math.Round(moonPhase, 1),
            Math.Round((1.0 + Math.Cos(moonPhase * VectorKm.DegToRad)) * 0.5, 4),
            Math.Round((sky.Moon - frame.Position).Length));
    }

    private (DateTimeOffset Time, VectorKm Position)? FindTrackMatch(
        SatelliteTle tle, DateTimeOffset acquisition, VectorKm target)
    {
        // HHMM is not a pixel scan timestamp. Search around it for the closest point
        // on the ground-relative orbit of this cross-track scanning instrument.
        var acquisitionSeconds = acquisition.ToUnixTimeSeconds();
        var start = acquisitionSeconds - TrackLeadSeconds;
        var end = acquisitionSeconds + TrackLagSeconds;
        var previous = GetTrackPoint(tle, start);
        var bestDistance2 = double.PositiveInfinity;
        var bestTime = (double)start;
        var bestPosition = previous;
        for (var t = start + TrackStepSeconds; t <= end; t += TrackStepSeconds)
        {
            var next = GetTrackPoint(tle, t);
            var segment = next - previous;
            var fraction = Math.Clamp((target - previous).Dot(segment) / segment.LengthSquared, 0.0, 1.0);
            var position = previous + segment * fraction;
            var distance2 = (target - position).LengthSquared;
            if (distance2 < bestDistance2)
            {
                bestDistance2 = distance2;
                bestTime = t - TrackStepSeconds + fraction * TrackStepSeconds;
                bestPosition = position;
            }
            previous = next;
        }

        // A match pinned to a search boundary does not establish a local closest approach.
        return bestTime <= start || bestTime >= end
            ? null
            : (DateTimeOffset.FromUnixTimeSeconds((long)Math.Round(bestTime)), bestPosition);
    }

    private VectorKm GetTrackPoint(SatelliteTle tle, long unixSeconds)
    {
        var key = (tle.NoradId, unixSeconds);
        if (!_track.TryGetValue(key, out var position))
        {
            var (x, y, z) = SatelliteOrbitPropagator.ComputeEarthFixedPosition(
                tle, DateTimeOffset.FromUnixTimeSeconds(unixSeconds).UtcDateTime);
            position = new VectorKm(x, y, z);
            _track.Add(key, position);
        }
        return position;
    }

    internal static HotspotLightGeometry DescribeLight(
        HotspotLocalFrame frame, VectorKm body, VectorKm? satellite)
    {
        var groundToBody = body - frame.Position;
        var light = frame.GetDirection(groundToBody);
        double? relativeAzimuth = null;
        double? lookSeparation = null;
        double? glint = null;
        if (satellite is { } position)
        {
            var groundToSensor = position - frame.Position;
            var view = frame.GetDirection(groundToSensor);
            if (view.AzimuthDeg is { } viewAzimuth && light.AzimuthDeg is { } lightAzimuth)
            {
                var separation = Math.Abs(viewAzimuth - lightAzimuth);
                relativeAzimuth = Math.Round(Math.Min(separation, 360.0 - separation), 1);
            }

            lookSeparation = Math.Round(VectorKm.AngleDeg(-groundToSensor, body - position), 1);
            if (light.ElevationDeg > 0)
            {
                // Reflect the incoming ray about the ellipsoid normal. This is the
                // VIIRS ATBD glint-angle equation in vector form.
                var reflected = frame.Up * (2.0 * frame.Up.Dot(groundToBody)) - groundToBody;
                glint = Math.Round(VectorKm.AngleDeg(groundToSensor, reflected), 1);
            }
        }

        return new HotspotLightGeometry(
            Math.Round(light.ElevationDeg, 1), RoundAzimuth(light.AzimuthDeg), relativeAzimuth, lookSeparation, glint);
    }

    private static double? RoundAzimuth(double? azimuth) =>
        azimuth is { } value ? Math.Round(value, 1) % 360.0 : null;
}

internal readonly record struct VectorKm(double X, double Y, double Z)
{
    public const double DegToRad = Math.PI / 180.0;
    public const double EarthRadiusKm = 6378.135; // Match the orbit propagator's WGS-72 ellipsoid.
    public double LengthSquared => Dot(this);
    public double Length => Math.Sqrt(LengthSquared);
    public double Dot(VectorKm other) => X * other.X + Y * other.Y + Z * other.Z;
    public static VectorKm operator +(VectorKm a, VectorKm b) => new(a.X + b.X, a.Y + b.Y, a.Z + b.Z);
    public static VectorKm operator -(VectorKm a, VectorKm b) => a + -b;
    public static VectorKm operator -(VectorKm a) => a * -1.0;
    public static VectorKm operator *(VectorKm a, double factor) => new(a.X * factor, a.Y * factor, a.Z * factor);
    public static double AngleDeg(VectorKm a, VectorKm b) =>
        Math.Acos(Math.Clamp(a.Dot(b) / (a.Length * b.Length), -1.0, 1.0)) / DegToRad;
}

internal readonly struct HotspotLocalFrame
{
    private readonly VectorKm _east;
    private readonly VectorKm _north;
    internal VectorKm Up { get; }
    internal VectorKm Position { get; }

    internal HotspotLocalFrame(double lat, double lng)
    {
        var (sinLat, cosLat) = Math.SinCos(lat * VectorKm.DegToRad);
        var (sinLng, cosLng) = Math.SinCos(lng * VectorKm.DegToRad);
        const double flattening = 1.0 / 298.26;
        const double e2 = flattening * (2.0 - flattening);
        var primeVertical = VectorKm.EarthRadiusKm / Math.Sqrt(1 - e2 * sinLat * sinLat);
        Up = new(cosLat * cosLng, cosLat * sinLng, sinLat);
        _east = new(-sinLng, cosLng, 0);
        _north = new(-sinLat * cosLng, -sinLat * sinLng, cosLat);
        Position = new(primeVertical * Up.X, primeVertical * Up.Y, primeVertical * (1.0 - e2) * Up.Z);
    }

    internal (double ElevationDeg, double? AzimuthDeg) GetDirection(VectorKm direction)
    {
        var east = _east.Dot(direction);
        var north = _north.Dot(direction);
        var horizontal = Math.Sqrt(east * east + north * north);
        return (Math.Atan2(Up.Dot(direction), horizontal) / VectorKm.DegToRad,
            horizontal < direction.Length * 1e-9
                ? null
                : (Math.Atan2(east, north) / VectorKm.DegToRad + 360.0) % 360.0);
    }
}
