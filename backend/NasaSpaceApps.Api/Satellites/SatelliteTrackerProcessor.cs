using System.Text.Json.Serialization;

namespace NasaSpaceApps.Api.Satellites;

public sealed record GeoBounds(double West, double South, double East, double North)
{
    public static GeoBounds World { get; } = new(-179.9, -85.0, 179.9, 85.0);

    public bool IsValid =>
        double.IsFinite(West) &&
        double.IsFinite(South) &&
        double.IsFinite(East) &&
        double.IsFinite(North) &&
        South >= -90.0 &&
        North <= 90.0 &&
        West >= -180.0 &&
        East <= 180.0 &&
        North > South &&
        Math.Abs(East - West) > 1e-6;

    public double HeightDegrees => Math.Max(0.0, North - South);

    public double WidthDegrees =>
        East >= West
            ? East - West
            : (360.0 - (West - East));

    public double CenterLatitude => (South + North) * 0.5;

    public double CenterLongitude
    {
        get
        {
            if (East >= West)
            {
                return (West + East) * 0.5;
            }

            var wrapped = West + WidthDegrees * 0.5;
            return wrapped > 180.0 ? wrapped - 360.0 : wrapped;
        }
    }
}

public sealed record SatelliteTrajectoryVertex(
    double Longitude,
    double Latitude,
    double ElevationMeters,
    long TimestampSeconds);

public sealed record SatelliteGroundTrackVertex(
    double Longitude,
    double Latitude,
    double ElevationMeters);

public sealed record LiveSatelliteFeature(
    string Id,
    int NoradId,
    string Name,
    double HeadingDegrees,
    double AltitudeKm,
    double GroundSpeedKmS,
    double NadirSwathKm,
    double? WideSwathKm,
    int IngestionLagMinutes,
    IReadOnlyList<string> LayerVariantIds,
    IReadOnlyList<SatelliteTrajectoryVertex> Coordinates,
    IReadOnlyList<SatelliteGroundTrackVertex>? GroundTrack = null);

public sealed record LiveSatelliteSwathFeature(
    string SatelliteId,
    string SwathRole,
    IReadOnlyList<SwathVertex> PolygonRing,
    IReadOnlyList<SwathVertex> EndPolygonRing);

public sealed record SatelliteHudFreshnessEntry(
    [property: JsonPropertyName("noradId")] int NoradId,
    [property: JsonPropertyName("name")] string SatelliteName,
    [property: JsonPropertyName("minutesSincePass")] int MinutesSincePass,
    [property: JsonPropertyName("ingestionLagMinutes")] int IngestionLagMinutes,
    [property: JsonPropertyName("isIngested")] bool IsIngested,
    [property: JsonPropertyName("isNadir")] bool IsNadirPass,
    [property: JsonPropertyName("nextPassMinutes")] int? NextPassMinutes,
    [property: JsonPropertyName("layerVariantIds")] IReadOnlyList<string> LayerVariantIds);

public sealed record GeoJsonFeatureDto(
    [property: JsonPropertyName("type")] string Type,
    [property: JsonPropertyName("id")] [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Id,
    [property: JsonPropertyName("properties")] IReadOnlyDictionary<string, object?> Properties,
    [property: JsonPropertyName("geometry")] GeoJsonGeometryDto Geometry);

public sealed record GeoJsonGeometryDto(
    [property: JsonPropertyName("type")] string Type,
    [property: JsonPropertyName("coordinates")] object Coordinates);

public sealed record SatelliteGeoJsonResponse(
    [property: JsonPropertyName("type")] string Type,
    [property: JsonPropertyName("features")] IReadOnlyList<GeoJsonFeatureDto> Features,
    [property: JsonPropertyName("satelliteHud")] IReadOnlyList<SatelliteHudFreshnessEntry> SatelliteHud);

public sealed record SatelliteViewportSnapshot(
    IReadOnlyList<LiveSatelliteFeature> Satellites,
    IReadOnlyList<LiveSatelliteSwathFeature> Swaths,
    IReadOnlyList<SatelliteHudFreshnessEntry> HudFreshness)
{
    public static SatelliteViewportSnapshot Empty { get; } = new([], [], []);

    /// <summary>
    /// Converts the snapshot into the GeoJSON FeatureCollection payload expected by the UI overlay.
    /// </summary>
    public SatelliteGeoJsonResponse ToGeoJson()
    {
        var swathFeatures = Swaths.Select(s => new GeoJsonFeatureDto(
            Type: "Feature",
            Id: null,
            Properties: new Dictionary<string, object?>
            {
                ["satelliteId"] = s.SatelliteId,
                ["swathRole"] = s.SwathRole,
                ["type"] = "satellite-swath",
                ["endRing"] = s.EndPolygonRing
                    .Select(v => new[] { Math.Round(v.Longitude, 5), Math.Round(v.Latitude, 5) })
                    .ToArray()
            },
            Geometry: new GeoJsonGeometryDto(
                Type: "Polygon",
                Coordinates: new[]
                {
                    s.PolygonRing
                        .Select(v => new[] { Math.Round(v.Longitude, 5), Math.Round(v.Latitude, 5) })
                        .ToArray()
                })));

        var satelliteFeatures = Satellites.Select(s => new GeoJsonFeatureDto(
            Type: "Feature",
            Id: s.Id,
            Properties: new Dictionary<string, object?>
            {
                ["id"] = s.Id,
                ["noradId"] = s.NoradId,
                ["name"] = s.Name,
                ["angle"] = s.HeadingDegrees,
                ["altitudeKm"] = s.AltitudeKm,
                ["speedKmS"] = s.GroundSpeedKmS,
                ["nadirSwathKm"] = s.NadirSwathKm,
                ["wideSwathKm"] = s.WideSwathKm,
                ["ingestionLagMinutes"] = s.IngestionLagMinutes,
                ["layerVariantIds"] = s.LayerVariantIds,
                ["type"] = "satellite"
            },
            Geometry: new GeoJsonGeometryDto(
                Type: "LineString",
                Coordinates: s.Coordinates
                    .Select(v => new[]
                    {
                        Math.Round(v.Longitude, 5),
                        Math.Round(v.Latitude, 5),
                        Math.Round(v.ElevationMeters, 0),
                        v.TimestampSeconds
                    })
                    .ToArray())));

        return new SatelliteGeoJsonResponse(
            Type: "FeatureCollection",
            Features: swathFeatures.Concat(satelliteFeatures).ToList(),
            SatelliteHud: HudFreshness);
    }
}

/// <summary>
/// Computes live satellite viewport trajectories, dual nadir/wide swath polygons,
/// and viewport overpass freshness metrics for MODIS and VIIRS spacecraft.
/// </summary>
public sealed class SatelliteTrackerProcessor
{
    private static readonly TimeSpan ProjectionHorizon = TimeSpan.FromSeconds(5);
    private static readonly TimeSpan GroundTrackRetentionWindow = TimeSpan.FromMinutes(20);
    private static readonly TimeSpan GroundTrackStep = TimeSpan.FromMinutes(2);
    private static readonly TimeSpan OverpassLookbackWindow = TimeSpan.FromDays(10);
    private static readonly TimeSpan OverpassLookaheadWindow = TimeSpan.FromHours(24);
    private static readonly TimeSpan OverpassCoarseStep = TimeSpan.FromMinutes(2);
    private const double DefaultNadirAlongTrackKm = 180.0;
    private const double DefaultWideAlongTrackKm = 280.0;
    private const double KmPerDegreeLatitude = 111.0;
    private const double LatitudePrefilterMarginDegrees = 4.0;
    private const double EarthRadiusKm = 6371.0;
    private const double DegToRad = Math.PI / 180.0;

    private readonly IReadOnlyList<SatelliteMetadata> _catalog;
    private readonly CelesTrakTleDownloader? _downloader;
    private readonly IReadOnlyDictionary<int, SatelliteTle>? _staticTles;

    public SatelliteTrackerProcessor(CelesTrakTleDownloader downloader)
    {
        _catalog = SatelliteCatalog.Default;
        _downloader = downloader;
    }

    public SatelliteTrackerProcessor(
        IReadOnlyList<SatelliteMetadata> catalog,
        IReadOnlyList<SatelliteTle> staticTles)
    {
        _catalog = catalog;
        _staticTles = staticTles.ToDictionary(t => t.NoradId);
    }

    public async Task<SatelliteViewportSnapshot> GetViewportSnapshotAsync(
        GeoBounds? bounds,
        DateTime? nowUtc = null,
        CancellationToken cancellationToken = default)
    {
        if (bounds is null || !bounds.IsValid)
        {
            return SatelliteViewportSnapshot.Empty;
        }

        IReadOnlyDictionary<int, SatelliteTle> activeTles;
        if (_staticTles is not null)
        {
            activeTles = _staticTles;
        }
        else if (_downloader is not null)
        {
            var resolved = await _downloader.GetFleetTlesAsync(cancellationToken).ConfigureAwait(false);
            activeTles = resolved.ToDictionary(kvp => kvp.Key, kvp => kvp.Value.Tle);
        }
        else
        {
            activeTles = new Dictionary<int, SatelliteTle>();
        }

        return BuildViewportSnapshot(bounds, activeTles, nowUtc);
    }

    public SatelliteViewportSnapshot GetViewportSnapshot(
        GeoBounds? bounds,
        DateTime? nowUtc = null)
    {
        if (bounds is null || !bounds.IsValid)
        {
            return SatelliteViewportSnapshot.Empty;
        }

        var activeTles = _staticTles ?? new Dictionary<int, SatelliteTle>();
        return BuildViewportSnapshot(bounds, activeTles, nowUtc);
    }

    private SatelliteViewportSnapshot BuildViewportSnapshot(
        GeoBounds bounds,
        IReadOnlyDictionary<int, SatelliteTle> activeTles,
        DateTime? nowUtc)
    {
        var utc = DateTime.SpecifyKind(nowUtc ?? DateTime.UtcNow, DateTimeKind.Utc);
        var nowUnix = new DateTimeOffset(utc).ToUnixTimeSeconds();
        var startUtc = DateTimeOffset.FromUnixTimeSeconds(nowUnix).UtcDateTime;
        var endUtc = startUtc.Add(ProjectionHorizon);
        var endUnix = new DateTimeOffset(endUtc).ToUnixTimeSeconds();

        var satellites = new List<LiveSatelliteFeature>();
        var swaths = new List<LiveSatelliteSwathFeature>();
        var freshnessCandidates = new List<SatelliteHudFreshnessEntry>();
        var centerLat = bounds.CenterLatitude;
        var centerLon = bounds.CenterLongitude;

        foreach (var meta in _catalog)
        {
            if (!activeTles.TryGetValue(meta.NoradId, out var tle))
            {
                var fallback = SatelliteTleParser.ParseSingle(meta.Name, meta.DefaultTleLine1, meta.DefaultTleLine2);
                if (fallback is null)
                {
                    continue;
                }

                tle = fallback;
            }

            var stateNow = SatelliteOrbitPropagator.Propagate(tle, startUtc);
            var stateEnd = SatelliteOrbitPropagator.Propagate(tle, endUtc);
            // Lock the projected end polygon heading to the start heading so start->end interpolation
            // translates smoothly without rotational corner shear between sub-second ticks.
            var endSwathAnchorState = stateEnd with { HeadingDegrees = stateNow.HeadingDegrees };

            var maxHalfSwathKm = Math.Max(300.0, (meta.WideSwathKm ?? meta.NadirSwathKm) * 0.75);
            var centerDistanceKm = CalculateGreatCircleKm(stateNow.Latitude, stateNow.Longitude, centerLat, centerLon);
            var viewportRadiusKm = Math.Max(300.0, Math.Max(bounds.WidthDegrees, bounds.HeightDegrees) * KmPerDegreeLatitude);

            if (centerDistanceKm <= maxHalfSwathKm + viewportRadiusKm)
            {
                var satId = $"sat_{meta.NoradId}";
                var elevationMeters = Math.Round(stateNow.AltitudeKm * 1000.0, 0);
                var groundTrack = SatelliteOrbitPropagator
                    .ComputeGroundTrack(
                        tle,
                        startUtc.Subtract(GroundTrackRetentionWindow),
                        startUtc.Add(GroundTrackRetentionWindow),
                        GroundTrackStep)
                    .Select(pt => new SatelliteGroundTrackVertex(pt.Longitude, pt.Latitude, pt.AltitudeKm * 1000.0))
                    .ToList();

                satellites.Add(new LiveSatelliteFeature(
                    satId,
                    meta.NoradId,
                    meta.Name,
                    Math.Round(stateNow.HeadingDegrees, 0),
                    Math.Round(stateNow.AltitudeKm, 1),
                    Math.Round(stateNow.GroundSpeedKmS, 2),
                    meta.NadirSwathKm,
                    meta.WideSwathKm,
                    meta.TypicalIngestionLagMinutes,
                    meta.LayerVariantIds,
                    [
                        new SatelliteTrajectoryVertex(stateNow.Longitude, stateNow.Latitude, elevationMeters, nowUnix),
                        new SatelliteTrajectoryVertex(stateEnd.Longitude, stateEnd.Latitude, elevationMeters, endUnix)
                    ],
                    groundTrack));

                var nadirStartRing = SatelliteSwathBuilder.BuildInstantaneousSwathPolygon(
                    stateNow,
                    endSwathAnchorState,
                    meta.NadirSwathKm,
                    DefaultNadirAlongTrackKm);
                var nadirEndRing = SatelliteSwathBuilder.BuildInstantaneousSwathPolygon(
                    endSwathAnchorState,
                    endSwathAnchorState,
                    meta.NadirSwathKm,
                    DefaultNadirAlongTrackKm);

                swaths.Add(new LiveSatelliteSwathFeature(satId, "nadir", nadirStartRing, nadirEndRing));

                if (meta.WideSwathKm.HasValue && meta.WideSwathKm.Value > meta.NadirSwathKm)
                {
                    var wideStartRing = SatelliteSwathBuilder.BuildInstantaneousSwathPolygon(
                        stateNow,
                        endSwathAnchorState,
                        meta.WideSwathKm.Value,
                        DefaultWideAlongTrackKm);
                    var wideEndRing = SatelliteSwathBuilder.BuildInstantaneousSwathPolygon(
                        endSwathAnchorState,
                        endSwathAnchorState,
                        meta.WideSwathKm.Value,
                        DefaultWideAlongTrackKm);

                    swaths.Add(new LiveSatelliteSwathFeature(satId, "wide", wideStartRing, wideEndRing));
                }
            }

            var freshnessEntries = EvaluateOverpassFreshness(meta, tle, centerLat, centerLon, utc);
            if (freshnessEntries.Count > 0)
            {
                freshnessCandidates.AddRange(freshnessEntries);
            }
        }

        var sortedFreshness = freshnessCandidates
            .OrderBy(f => f.MinutesSincePass)
            .ToList();

        return new SatelliteViewportSnapshot(satellites, swaths, sortedFreshness);
    }

    private static IReadOnlyList<SatelliteHudFreshnessEntry> EvaluateOverpassFreshness(
        SatelliteMetadata meta,
        SatelliteTle tle,
        double targetLat,
        double targetLon,
        DateTime nowUtc)
    {
        var maxSwathHalfWidthKm = (meta.WideSwathKm ?? meta.NadirSwathKm) * 0.5;
        var nadirHalfWidthKm = meta.NadirSwathKm * 0.5;
        var latThresholdDeg = (maxSwathHalfWidthKm / KmPerDegreeLatitude) + LatitudePrefilterMarginDegrees;

        DateTime? latestPassTime = null;
        var latestDistanceKm = double.MaxValue;
        DateTime? readyPassTime = null;
        var readyDistanceKm = double.MaxValue;
        DateTime? closestFallbackTime = null;
        var closestFallbackDistanceKm = double.MaxValue;
        DateTime? closestReadyFallbackTime = null;
        var closestReadyFallbackDistanceKm = double.MaxValue;

        var readyCutoffUtc = nowUtc.Subtract(TimeSpan.FromMinutes(meta.TypicalIngestionLagMinutes));

        for (var t = nowUtc; t >= nowUtc.Subtract(OverpassLookbackWindow); t = t.Subtract(OverpassCoarseStep))
        {
            var state = SatelliteOrbitPropagator.Propagate(tle, t);
            if (Math.Abs(state.Latitude - targetLat) > latThresholdDeg)
            {
                continue;
            }

            var distKm = CalculateGreatCircleKm(state.Latitude, state.Longitude, targetLat, targetLon);
            if (distKm < closestFallbackDistanceKm)
            {
                closestFallbackDistanceKm = distKm;
                closestFallbackTime = t;
            }

            if (t <= readyCutoffUtc && distKm < closestReadyFallbackDistanceKm)
            {
                closestReadyFallbackDistanceKm = distKm;
                closestReadyFallbackTime = t;
            }

            if (distKm <= maxSwathHalfWidthKm)
            {
                if (!latestPassTime.HasValue)
                {
                    latestPassTime = t;
                    latestDistanceKm = distKm;
                    if (t <= readyCutoffUtc)
                    {
                        readyPassTime = t;
                        readyDistanceKm = distKm;
                        break;
                    }
                }
                else if (t <= readyCutoffUtc)
                {
                    readyPassTime = t;
                    readyDistanceKm = distKm;
                    break;
                }
            }
        }

        if (!latestPassTime.HasValue)
        {
            if (!closestFallbackTime.HasValue)
            {
                return [];
            }

            latestPassTime = closestFallbackTime;
            latestDistanceKm = closestFallbackDistanceKm;
        }

        if (!readyPassTime.HasValue && latestPassTime.Value > readyCutoffUtc && closestReadyFallbackTime.HasValue)
        {
            readyPassTime = closestReadyFallbackTime;
            readyDistanceKm = closestReadyFallbackDistanceKm;
        }

        int? nextPassMinutes = null;
        for (var t = nowUtc.Add(OverpassCoarseStep); t <= nowUtc.Add(OverpassLookaheadWindow); t = t.Add(OverpassCoarseStep))
        {
            var state = SatelliteOrbitPropagator.Propagate(tle, t);
            if (Math.Abs(state.Latitude - targetLat) > latThresholdDeg)
            {
                continue;
            }

            var distKm = CalculateGreatCircleKm(state.Latitude, state.Longitude, targetLat, targetLon);
            if (distKm <= maxSwathHalfWidthKm)
            {
                nextPassMinutes = (int)Math.Max(1, Math.Round((t - nowUtc).TotalMinutes));
                break;
            }
        }

        var results = new List<SatelliteHudFreshnessEntry>(2);
        var latestMinutes = (int)Math.Max(0, Math.Round((nowUtc - latestPassTime.Value).TotalMinutes));
        var latestIsIngested = latestMinutes >= meta.TypicalIngestionLagMinutes;

        results.Add(new SatelliteHudFreshnessEntry(
            meta.NoradId,
            meta.Name,
            latestMinutes,
            meta.TypicalIngestionLagMinutes,
            latestIsIngested,
            latestDistanceKm <= nadirHalfWidthKm,
            nextPassMinutes,
            meta.LayerVariantIds));

        if (!latestIsIngested && readyPassTime.HasValue)
        {
            var readyMinutes = (int)Math.Max(
                meta.TypicalIngestionLagMinutes,
                Math.Round((nowUtc - readyPassTime.Value).TotalMinutes));
            results.Add(new SatelliteHudFreshnessEntry(
                meta.NoradId,
                meta.Name,
                readyMinutes,
                meta.TypicalIngestionLagMinutes,
                IsIngested: true,
                readyDistanceKm <= nadirHalfWidthKm,
                nextPassMinutes,
                meta.LayerVariantIds));
        }

        return results;
    }

    private static double CalculateGreatCircleKm(double lat1Deg, double lon1Deg, double lat2Deg, double lon2Deg)
    {
        var dLat = (lat2Deg - lat1Deg) * DegToRad;
        var dLon = (lon2Deg - lon1Deg) * DegToRad;
        var lat1Rad = lat1Deg * DegToRad;
        var lat2Rad = lat2Deg * DegToRad;

        var sinLat = Math.Sin(dLat * 0.5);
        var sinLon = Math.Sin(dLon * 0.5);
        var a = sinLat * sinLat + Math.Cos(lat1Rad) * Math.Cos(lat2Rad) * sinLon * sinLon;
        var c = 2.0 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(Math.Max(0.0, 1.0 - a)));
        return EarthRadiusKm * c;
    }
}
