using System.Text.Json.Serialization;

namespace NasaSpaceApps.Api.Satellites;

public sealed record SatelliteHudFreshnessEntry(
    [property: JsonPropertyName("noradId")] int NoradId,
    [property: JsonPropertyName("name")] string SatelliteName,
    [property: JsonPropertyName("minutesSincePass")] int MinutesSincePass,
    [property: JsonPropertyName("ingestionLagMinutes")] int IngestionLagMinutes,
    [property: JsonPropertyName("isIngested")] bool IsIngested,
    [property: JsonPropertyName("isNadir")] bool IsNadirPass,
    [property: JsonPropertyName("nextPassMinutes")] int? NextPassMinutes,
    [property: JsonPropertyName("layerVariantIds")] IReadOnlyList<string> LayerVariantIds);

/// <summary>
/// Evaluates recent and upcoming satellite overpass freshness around a target coordinate
/// for the map HUD.
/// </summary>
public static class SatelliteOverpassEvaluator
{
    private static readonly TimeSpan OverpassLookbackWindow = TimeSpan.FromDays(10);
    private static readonly TimeSpan OverpassLookaheadWindow = TimeSpan.FromHours(24);
    private static readonly TimeSpan OverpassCoarseStep = TimeSpan.FromMinutes(2);
    private const double KmPerDegreeLatitude = 111.0;
    private const double LatitudePrefilterMarginDegrees = 4.0;
    private const double EarthRadiusKm = 6371.0;
    private const double DegToRad = Math.PI / 180.0;

    public static IReadOnlyList<SatelliteHudFreshnessEntry> EvaluateFleetFreshness(
        IReadOnlyList<SatelliteMetadata> catalog,
        IReadOnlyDictionary<int, SatelliteTle> activeTles,
        double targetLat,
        double targetLon,
        DateTime nowUtc)
    {
        var utc = DateTime.SpecifyKind(nowUtc, DateTimeKind.Utc);
        var entries = new List<SatelliteHudFreshnessEntry>(catalog.Count);

        foreach (var meta in catalog)
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

            var entry = EvaluateSatelliteFreshness(meta, tle, targetLat, targetLon, utc);
            if (entry is not null)
            {
                entries.Add(entry);
            }
        }

        return entries.OrderBy(e => e.MinutesSincePass).ToList();
    }

    private static SatelliteHudFreshnessEntry? EvaluateSatelliteFreshness(
        SatelliteMetadata meta,
        SatelliteTle tle,
        double targetLat,
        double targetLon,
        DateTime nowUtc)
    {
        var maxSwathHalfWidthKm = Math.Max(meta.NadirSwathKm, meta.WideSwathKm) * 0.5;
        var nadirHalfWidthKm = meta.NadirSwathKm * 0.5;
        var latThresholdDeg = (maxSwathHalfWidthKm / KmPerDegreeLatitude) + LatitudePrefilterMarginDegrees;

        var inLatestPass = false;
        DateTime? latestPassTime = null;
        var latestDistanceKm = double.MaxValue;
        DateTime? closestFallbackTime = null;
        var closestFallbackDistanceKm = double.MaxValue;

        for (var t = nowUtc; t >= nowUtc.Subtract(OverpassLookbackWindow); t = t.Subtract(OverpassCoarseStep))
        {
            var state = SatelliteOrbitPropagator.Propagate(tle, t);
            if (Math.Abs(state.Latitude - targetLat) > latThresholdDeg)
            {
                if (inLatestPass)
                {
                    break;
                }

                continue;
            }

            var distKm = CalculateGreatCircleKm(state.Latitude, state.Longitude, targetLat, targetLon);
            if (distKm < closestFallbackDistanceKm)
            {
                closestFallbackDistanceKm = distKm;
                closestFallbackTime = t;
            }

            if (distKm <= maxSwathHalfWidthKm)
            {
                inLatestPass = true;
                if (distKm < latestDistanceKm)
                {
                    latestDistanceKm = distKm;
                    latestPassTime = t;
                }
            }
            else if (inLatestPass)
            {
                break;
            }
        }

        if (!latestPassTime.HasValue)
        {
            if (!closestFallbackTime.HasValue)
            {
                return null;
            }

            latestPassTime = closestFallbackTime;
            latestDistanceKm = closestFallbackDistanceKm;
        }

        var stateNow = SatelliteOrbitPropagator.Propagate(tle, nowUtc);
        var skipCurrentPass = CalculateGreatCircleKm(stateNow.Latitude, stateNow.Longitude, targetLat, targetLon) <= maxSwathHalfWidthKm;

        var inNextPass = false;
        DateTime? nextPassTime = null;
        var nextPassDistanceKm = double.MaxValue;

        for (var t = nowUtc.Add(OverpassCoarseStep); t <= nowUtc.Add(OverpassLookaheadWindow); t = t.Add(OverpassCoarseStep))
        {
            var state = SatelliteOrbitPropagator.Propagate(tle, t);
            if (Math.Abs(state.Latitude - targetLat) > latThresholdDeg)
            {
                skipCurrentPass = false;
                if (inNextPass)
                {
                    break;
                }

                continue;
            }

            var distKm = CalculateGreatCircleKm(state.Latitude, state.Longitude, targetLat, targetLon);
            if (skipCurrentPass)
            {
                if (distKm > maxSwathHalfWidthKm)
                {
                    skipCurrentPass = false;
                }

                continue;
            }

            if (distKm <= maxSwathHalfWidthKm)
            {
                inNextPass = true;
                if (distKm < nextPassDistanceKm)
                {
                    nextPassDistanceKm = distKm;
                    nextPassTime = t;
                }
            }
            else if (inNextPass)
            {
                break;
            }
        }

        int? nextPassMinutes = nextPassTime.HasValue
            ? (int)Math.Max(1, Math.Round((nextPassTime.Value - nowUtc).TotalMinutes))
            : null;

        var latestMinutes = (int)Math.Max(0, Math.Round((nowUtc - latestPassTime.Value).TotalMinutes));
        var latestIsIngested = latestMinutes >= meta.TypicalIngestionLagMinutes;

        return new SatelliteHudFreshnessEntry(
            meta.NoradId,
            meta.Name,
            latestMinutes,
            meta.TypicalIngestionLagMinutes,
            latestIsIngested,
            latestDistanceKm <= nadirHalfWidthKm,
            nextPassMinutes,
            meta.LayerVariantIds);
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
