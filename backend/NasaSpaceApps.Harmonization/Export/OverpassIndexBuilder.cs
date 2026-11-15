using System.Collections.Concurrent;
using System.Text.Json;
using NasaSpaceApps.Api.Firms;
using NasaSpaceApps.Api.Satellites;

namespace NasaSpaceApps.Harmonization.Export;

internal sealed record OverpassEvent(
    string Satellite,
    string Instrument,
    long TimestampMs,
    double DistanceKm,
    bool IsNadir,
    int IngestionLagMinutes);

/// <summary>Loads/caches live CelesTrak TLEs and evaluates J2 satellite overpasses matching the UI index.</summary>
internal sealed class OverpassIndexBuilder
{
    private const double EarthMeanRadiusKm = 6371.0;
    private const double DegToRad = Math.PI / 180.0;
    private const long SampleStepMs = 60_000;
    private const long RefineHalfWindowMs = 50_000;
    private const long RefineStepMs = 10_000;

    private sealed record CachedTleEntry(int NoradId, string Name, string Line1, string Line2, string Source);
    private sealed record IndexedTrack(
        SatelliteMetadata Meta,
        SatelliteTle Tle,
        double NadirHalfKm,
        double WideHalfKm,
        double CosWideHalfAngle,
        double[] Ux,
        double[] Uy,
        double[] Uz);

    private readonly long _startMs;
    private readonly long _endMs;
    private readonly int _sampleCount;
    private readonly IndexedTrack[] _tracks;
    private readonly ConcurrentDictionary<(int Lat20, int Lng20), OverpassEvent[]> _cellCache = new();

    public IReadOnlyDictionary<int, ResolvedTleEntry> FleetTles { get; }

    private OverpassIndexBuilder(
        IReadOnlyDictionary<int, ResolvedTleEntry> fleetTles,
        long startMs,
        long endMs,
        int sampleCount,
        IndexedTrack[] tracks)
    {
        FleetTles = fleetTles;
        _startMs = startMs;
        _endMs = endMs;
        _sampleCount = sampleCount;
        _tracks = tracks;
    }

    public static async Task<IReadOnlyDictionary<int, ResolvedTleEntry>> LoadOrFetchTlesAsync(
        HttpClient httpClient, string cacheDir, bool refresh, CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(cacheDir);
        var cachePath = Path.Combine(cacheDir, "fleet_tles.json");
        if (!refresh && File.Exists(cachePath))
        {
            var json = await File.ReadAllTextAsync(cachePath, cancellationToken).ConfigureAwait(false);
            var cached = JsonSerializer.Deserialize<List<CachedTleEntry>>(json);
            if (cached is { Count: >= 4 })
            {
                var dict = new Dictionary<int, ResolvedTleEntry>();
                foreach (var entry in cached)
                {
                    var parsed = SatelliteTleParser.ParseSingle(entry.Name, entry.Line1, entry.Line2);
                    if (parsed is not null)
                        dict[entry.NoradId] = new ResolvedTleEntry(parsed, entry.Source);
                }
                if (dict.Count >= 4)
                    return dict;
            }
        }

        var result = new Dictionary<int, ResolvedTleEntry>();
        var serialized = new List<CachedTleEntry>();
        foreach (var meta in SatelliteCatalog.Default)
        {
            SatelliteTle? tle = null;
            var source = "embedded-fallback";
            try
            {
                var url = $"https://celestrak.org/NORAD/elements/gp.php?CATNR={meta.NoradId}&FORMAT=TLE";
                var payload = await httpClient.GetStringAsync(url, cancellationToken).ConfigureAwait(false);
                var lines = payload.Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries);
                for (var i = 0; i + 1 < lines.Length; i++)
                {
                    if (lines[i].StartsWith("1 ", StringComparison.Ordinal) &&
                        lines[i + 1].StartsWith("2 ", StringComparison.Ordinal))
                    {
                        var candidate = SatelliteTleParser.ParseSingle(meta.Name, lines[i], lines[i + 1]);
                        if (candidate is not null)
                        {
                            tle = candidate;
                            source = "celestrak";
                            serialized.Add(new CachedTleEntry(meta.NoradId, meta.Name, lines[i].Trim(), lines[i + 1].Trim(), source));
                            break;
                        }
                    }
                }
            }
            catch (Exception ex) when (!cancellationToken.IsCancellationRequested)
            {
                Console.WriteLine($"[TLE warning] Failed CelesTrak fetch for {meta.Name}: {ex.Message}");
            }

            if (tle is null)
            {
                tle = SatelliteTleParser.ParseSingle(meta.Name, meta.DefaultTleLine1, meta.DefaultTleLine2)
                    ?? throw new InvalidOperationException($"Missing fallback TLE for {meta.Name}");
                serialized.Add(new CachedTleEntry(meta.NoradId, meta.Name, meta.DefaultTleLine1, meta.DefaultTleLine2, source));
            }

            result[meta.NoradId] = new ResolvedTleEntry(tle, source);
        }

        await File.WriteAllTextAsync(cachePath, JsonSerializer.Serialize(serialized), cancellationToken).ConfigureAwait(false);
        return result;
    }

    public static OverpassIndexBuilder Build(
        IReadOnlyDictionary<int, ResolvedTleEntry> fleetTles,
        DateTimeOffset windowStartUtc,
        DateTimeOffset windowEndUtc)
    {
        var startMs = (long)Math.Floor((windowStartUtc.AddHours(-14).ToUnixTimeMilliseconds()) / (double)SampleStepMs) * SampleStepMs;
        var endMs = (long)Math.Ceiling((windowEndUtc.AddHours(14).ToUnixTimeMilliseconds()) / (double)SampleStepMs) * SampleStepMs;
        var sampleCount = Math.Max(2, (int)((endMs - startMs) / SampleStepMs) + 1);

        var tracks = new List<IndexedTrack>(SatelliteCatalog.Default.Count);
        foreach (var meta in SatelliteCatalog.Default)
        {
            var tle = fleetTles[meta.NoradId].Tle;
            var nadirHalfKm = meta.NadirSwathKm * 0.5;
            var wideHalfKm = Math.Max(meta.NadirSwathKm, meta.WideSwathKm) * 0.5;
            var cosWideHalfAngle = Math.Cos(wideHalfKm / EarthMeanRadiusKm);

            var ux = new double[sampleCount];
            var uy = new double[sampleCount];
            var uz = new double[sampleCount];

            for (var i = 0; i < sampleCount; i++)
            {
                var tUtc = DateTimeOffset.FromUnixTimeMilliseconds(startMs + i * SampleStepMs).UtcDateTime;
                var state = SatelliteOrbitPropagator.Propagate(tle, tUtc);
                (ux[i], uy[i], uz[i]) = LatLonToUnit(state.Latitude, state.Longitude);
            }

            tracks.Add(new IndexedTrack(meta, tle, nadirHalfKm, wideHalfKm, cosWideHalfAngle, ux, uy, uz));
        }

        return new OverpassIndexBuilder(fleetTles, startMs, endMs, sampleCount, [.. tracks]);
    }

    public OverpassEvent[] EvaluateAt(double latDeg, double lngDeg)
    {
        var qLat = Math.Clamp(Math.Round(latDeg * 20.0) / 20.0, -89.999, 89.999);
        var qLng = NormalizeLng(Math.Round(lngDeg * 20.0) / 20.0);
        var key = ((int)Math.Round(qLat * 20.0), (int)Math.Round(qLng * 20.0));
        if (_cellCache.TryGetValue(key, out var cached))
            return cached;

        var (px, py, pz) = LatLonToUnit(qLat, qLng);
        var passes = new List<OverpassEvent>(32);

        foreach (var track in _tracks)
        {
            var inRun = false;
            var peakDot = -1.0;
            var peakIdx = -1;

            void FinalizeRun()
            {
                if (!inRun || peakIdx < 0) return;
                var tPeak = _startMs + peakIdx * SampleStepMs;
                var refineStart = Math.Max(_startMs, tPeak - RefineHalfWindowMs);
                var refineEnd = Math.Min(_endMs, tPeak + RefineHalfWindowMs);
                var bestTs = tPeak;
                var bestDot = peakDot;

                for (var t = refineStart; t <= refineEnd; t += RefineStepMs)
                {
                    var state = SatelliteOrbitPropagator.Propagate(track.Tle, DateTimeOffset.FromUnixTimeMilliseconds(t).UtcDateTime);
                    var (tx, ty, tz) = LatLonToUnit(state.Latitude, state.Longitude);
                    var dot = tx * px + ty * py + tz * pz;
                    if (dot > bestDot)
                    {
                        bestDot = dot;
                        bestTs = t;
                    }
                }

                var distKm = EarthMeanRadiusKm * Math.Acos(Math.Clamp(bestDot, -1.0, 1.0));
                if (distKm <= track.WideHalfKm)
                {
                    passes.Add(new OverpassEvent(
                        track.Meta.Name,
                        track.Meta.Instrument,
                        bestTs,
                        Math.Round(distKm * 10.0) / 10.0,
                        distKm <= track.NadirHalfKm,
                        track.Meta.TypicalIngestionLagMinutes));
                }

                inRun = false;
                peakDot = -1.0;
                peakIdx = -1;
            }

            for (var i = 0; i < _sampleCount; i++)
            {
                var d = track.Ux[i] * px + track.Uy[i] * py + track.Uz[i] * pz;
                if (d >= track.CosWideHalfAngle)
                {
                    if (!inRun || d > peakDot)
                    {
                        peakDot = d;
                        peakIdx = i;
                    }
                    inRun = true;
                }
                else if (inRun)
                {
                    FinalizeRun();
                }
            }
            FinalizeRun();
        }

        passes.Sort((a, b) => a.TimestampMs.CompareTo(b.TimestampMs));
        var arr = passes.ToArray();
        _cellCache.TryAdd(key, arr);
        return arr;
    }

    public static SpotGeometryFeatures ComputeSpotGeometry(
        HotspotGeometryCalculator calculator,
        double lat,
        double lon,
        DateTimeOffset timestampUtc,
        string satellite,
        string instrument)
    {
        var sourceDataset = (satellite, instrument) switch
        {
            (_, "modis") => "MODIS_NRT",
            ("NOAA-21", _) => "VIIRS_NOAA21_NRT",
            _ => "VIIRS_NOAA20_NRT",
        };
        var synthetic = new FirmsHotspot(
            lat, lon, 320.0, null, null, null,
            timestampUtc, satellite, instrument, sourceDataset,
            "n", 65, "NRT", 1.0, "D");
        var geom = calculator.Calculate(synthetic);
        return new SpotGeometryFeatures(
            geom.Orbit?.OffNadirDeg,
            geom.Orbit?.ViewZenithDeg,
            geom.Orbit?.ViewAzimuthDeg,
            geom.Orbit?.SlantRangeKm,
            geom.Sun.ElevationDeg,
            geom.Sun.AzimuthDeg,
            geom.Sun.RelativeAzimuthDeg,
            geom.Sun.SensorLookSeparationDeg,
            geom.Sun.GlintAngleDeg,
            geom.Moon.ElevationDeg,
            geom.Moon.RelativeAzimuthDeg,
            geom.Moon.GlintAngleDeg,
            geom.MoonPhaseAngleDeg,
            geom.MoonIlluminatedFraction,
            geom.MoonDistanceKm);
    }

    private static (double X, double Y, double Z) LatLonToUnit(double latDeg, double lngDeg)
    {
        var latRad = Math.Clamp(latDeg, -90.0, 90.0) * DegToRad;
        var lngRad = lngDeg * DegToRad;
        var cosLat = Math.Cos(latRad);
        return (cosLat * Math.Cos(lngRad), cosLat * Math.Sin(lngRad), Math.Sin(latRad));
    }

    private static double NormalizeLng(double deg)
    {
        var wrapped = ((((deg + 180.0) % 360.0) + 360.0) % 360.0) - 180.0;
        return Math.Clamp(wrapped, -180.0, 180.0);
    }
}
