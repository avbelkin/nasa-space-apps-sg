using NasaSpaceApps.Api.Firms;

namespace NasaSpaceApps.Harmonization.Export;

internal sealed record PairTemplate(
    string Direction,
    string SatellitePair,
    int AnchorSpotId,
    double Latitude,
    double Longitude,
    long FirstTimestampMs,
    DateTimeOffset FirstAcquiredAtUtc,
    string FirstSatellite,
    string FirstInstrument,
    string FirstDayNight,
    double Frp1,
    double Brightness1,
    double? SecondaryBrightness1,
    int Confidence1,
    double? Scan1,
    double? Track1,
    int? LandCoverCode,
    double? LandCoverShare,
    SpotGeometryFeatures Geometry1,
    long Pass2TimestampMs,
    DateTimeOffset Pass2Utc,
    string SecondSatellite,
    string SecondInstrument,
    string SecondDayNight,
    double ElapsedMinutes,
    double SecondTrackDistanceKm,
    bool SecondNadirSwath,
    SpotGeometryFeatures Geometry2,
    int Hit500m,
    int Hit1km,
    int PrimaryHit,
    int PrimaryMiss,
    double? Frp2,
    double? Brightness2,
    int? Confidence2,
    double? LogFrpChange);

internal static class HarmonizationPairBuilder
{
    private const double EarthRadiusKm = 6371.0;
    private const double DegToRad = Math.PI / 180.0;
    private const double CellDeg = 0.02; // ~2.22 km at equator
    private const long MatchToleranceMs = 25 * 60_000;
    private const long SixHoursMs = 6 * 3600 * 1000;
    private const long MinFollowupElapsedMs = MatchToleranceMs;
    private const long MaxFollowupElapsedMs = SixHoursMs - MatchToleranceMs;

    private static readonly IReadOnlyDictionary<string, long> LagMsByInstrument =
        new Dictionary<string, long>(StringComparer.OrdinalIgnoreCase)
        {
            ["modis"] = 120 * 60_000,
            ["viirs"] = 90 * 60_000,
        };

    public static (
        SpotGeometryFeatures[] SpotGeometries,
        List<PairTemplate> PairTemplates,
        Dictionary<(double Lat, double Lon, long TsMs), int> WeatherQueryIndex,
        List<WeatherSamplePoint> UniqueWeatherQueries,
        SpotOutcomeStats[] SpotOutcomes)
        BuildStructure(
            IReadOnlyList<FirmsHotspot> orderedSpots,
            FirmsDatasetBundle firms,
            OverpassIndexBuilder overpassIndex,
            HotspotGeometryCalculator geomCalc)
    {
        var n = orderedSpots.Count;
        var spotTimestamps = new long[n];
        var spatialBuckets = new Dictionary<(int LatCell, int LonCell), List<int>>(n / 2);
        var spotGeoms = new SpotGeometryFeatures[n];

        Console.WriteLine($"[Geometry] Computing 1st-pass geometry and spatial index for {n:N0} spots...");
        for (var i = 0; i < n; i++)
        {
            var s = orderedSpots[i];
            spotTimestamps[i] = s.AcquiredAtUtc.ToUnixTimeMilliseconds();
            var cell = ToCell(s.Latitude, s.Longitude);
            if (!spatialBuckets.TryGetValue(cell, out var list))
                spatialBuckets[cell] = list = new List<int>(4);
            list.Add(i);

            var g = geomCalc.Calculate(s);
            spotGeoms[i] = new SpotGeometryFeatures(
                g.Orbit?.OffNadirDeg,
                g.Orbit?.ViewZenithDeg,
                g.Orbit?.ViewAzimuthDeg,
                g.Orbit?.SlantRangeKm,
                g.Sun.ElevationDeg,
                g.Sun.AzimuthDeg,
                g.Sun.RelativeAzimuthDeg,
                g.Sun.SensorLookSeparationDeg,
                g.Sun.GlintAngleDeg,
                g.Moon.ElevationDeg,
                g.Moon.RelativeAzimuthDeg,
                g.Moon.GlintAngleDeg,
                g.MoonPhaseAngleDeg,
                g.MoonIlluminatedFraction,
                g.MoonDistanceKm);
        }

        var availableThroughByInst = new Dictionary<string, long>(StringComparer.OrdinalIgnoreCase);
        var windowStartByInst = new Dictionary<string, long>(StringComparer.OrdinalIgnoreCase);
        var fetchedMs = firms.FetchedAtUtc.ToUnixTimeMilliseconds();
        foreach (var (inst, win) in firms.InstrumentWindows)
        {
            windowStartByInst[inst] = win.MinUtc.ToUnixTimeMilliseconds();
            availableThroughByInst[inst] = Math.Min(fetchedMs, win.MaxUtc.ToUnixTimeMilliseconds());
        }

        // Compute spot-level settled overpass outcomes (6h forward & 12h symmetric).
        Console.WriteLine("[Outcomes] Evaluating settled forward 6h and symmetric 12h overpasses per spot...");
        var outcomes = new SpotOutcomeStats[n];
        for (var i = 0; i < n; i++)
        {
            var s = orderedSpots[i];
            var ts1 = spotTimestamps[i];
            var passes = overpassIndex.EvaluateAt(s.Latitude, s.Longitude);
            var minAvailEnd = availableThroughByInst.Values.Min();
            var maxStart = windowStartByInst.Values.Max();

            var settled6hAll = ts1 + SixHoursMs + LagMsByInstrument["modis"] <= minAvailEnd
                && ts1 >= maxStart;
            var settled12h = ts1 - SixHoursMs >= maxStart
                && ts1 + SixHoursMs + LagMsByInstrument["modis"] <= minAvailEnd;

            int ss = 0, ps = 0, ns = 0, sc = 0, pc = 0, nc = 0;
            int st12 = 0, pt12 = 0, nt12 = 0;
            double? minDist = null;
            double sumDist = 0;
            var nadirCount = 0;

            foreach (var p in passes)
            {
                if (!availableThroughByInst.TryGetValue(p.Instrument, out var availEnd) ||
                    !windowStartByInst.TryGetValue(p.Instrument, out var winStart))
                    continue;

                var lagMs = LagMsByInstrument[p.Instrument];
                var passSettled = p.TimestampMs - MatchToleranceMs >= winStart &&
                                  p.TimestampMs + MatchToleranceMs + lagMs <= availEnd;
                if (!passSettled) continue;

                var dt = p.TimestampMs - ts1;
                var inForward6h = p.Satellite != s.Satellite &&
                                  dt > MinFollowupElapsedMs &&
                                  dt <= MaxFollowupElapsedMs;
                var inSymmetric12h = Math.Abs(dt) <= SixHoursMs &&
                                     !(p.Satellite == s.Satellite && Math.Abs(dt) <= MatchToleranceMs);

                if (!inForward6h && !inSymmetric12h) continue;

                var radiusKm = p.Instrument == s.Instrument && p.Instrument == "viirs" ? 0.5 : 1.0;
                var matched = HasMatch(orderedSpots, spotTimestamps, spatialBuckets, s.Latitude, s.Longitude,
                    p.Satellite, p.TimestampMs, radiusKm);

                if (inForward6h)
                {
                    if (p.Instrument == s.Instrument)
                    {
                        ss++;
                        if (matched) ps++; else ns++;
                    }
                    else
                    {
                        sc++;
                        if (matched) pc++; else nc++;
                    }
                    minDist = minDist is { } d ? Math.Min(d, p.DistanceKm) : p.DistanceKm;
                    sumDist += p.DistanceKm;
                    if (p.IsNadir) nadirCount++;
                }

                if (inSymmetric12h)
                {
                    st12++;
                    if (matched) pt12++; else nt12++;
                }
            }

            var st6 = ss + sc;
            outcomes[i] = new SpotOutcomeStats(
                settled6hAll, ss, ps, ns, sc, pc, nc,
                st6, ps + pc, ns + nc,
                minDist, st6 > 0 ? Math.Round(sumDist / st6, 1) : null,
                nadirCount > 0 ? 1 : 0,
                settled12h, st12, pt12, nt12);
        }

        // Chronological per-family episode clustering matching baseline (<=6h, <=1.0km MODIS / <=0.5km VIIRS).
        Console.WriteLine("[Episodes] Grouping chronological episodes per instrument family & extracting 4-direction pairs...");
        var episodesByFamily = new Dictionary<string, List<int>>(StringComparer.OrdinalIgnoreCase)
        {
            ["modis"] = [],
            ["viirs"] = [],
        };
        var activeBucketByFamily = new Dictionary<string, Dictionary<(int, int), List<int>>>(StringComparer.OrdinalIgnoreCase)
        {
            ["modis"] = new(),
            ["viirs"] = new(),
        };

        for (var i = 0; i < n; i++)
        {
            var s = orderedSpots[i];
            var ts = spotTimestamps[i];
            var fam = s.Instrument;
            var epList = episodesByFamily[fam];
            var activeBuckets = activeBucketByFamily[fam];
            var clusterRadiusKm = fam == "viirs" ? 0.5 : 1.0;
            var cell = ToCell(s.Latitude, s.Longitude);
            var lonSpan = LonBucketRadius(s.Latitude);

            var attached = false;
            for (var dLat = -1; dLat <= 1 && !attached; dLat++)
            {
                for (var dLon = -lonSpan; dLon <= lonSpan && !attached; dLon++)
                {
                    if (!activeBuckets.TryGetValue((cell.LatCell + dLat, cell.LonCell + dLon), out var candidates))
                        continue;
                    for (var cIdx = candidates.Count - 1; cIdx >= 0; cIdx--)
                    {
                        var anchorIdx = candidates[cIdx];
                        if (ts - spotTimestamps[anchorIdx] > SixHoursMs)
                        {
                            // Prune expired episode anchors from the tail or skip
                            continue;
                        }
                        if (HaversineKm(s.Latitude, s.Longitude, orderedSpots[anchorIdx].Latitude, orderedSpots[anchorIdx].Longitude) <= clusterRadiusKm)
                        {
                            attached = true;
                            break;
                        }
                    }
                }
            }

            if (!attached)
            {
                epList.Add(i);
                if (!activeBuckets.TryGetValue(cell, out var list))
                    activeBuckets[cell] = list = new List<int>(2);
                list.Add(i);
            }
        }

        Console.WriteLine($"[Episodes] MODIS anchors: {episodesByFamily["modis"].Count:N0}, VIIRS anchors: {episodesByFamily["viirs"].Count:N0}");

        var pairTemplates = new List<PairTemplate>(200_000);
        foreach (var (sourceFamily, anchors) in episodesByFamily)
        {
            foreach (var anchorIdx in anchors)
            {
                var anchor = orderedSpots[anchorIdx];
                var ts1 = spotTimestamps[anchorIdx];
                var g1 = spotGeoms[anchorIdx];
                var passes = overpassIndex.EvaluateAt(anchor.Latitude, anchor.Longitude);

                foreach (var pass2 in passes)
                {
                    if (pass2.Satellite == anchor.Satellite) continue;
                    var elapsedMs = pass2.TimestampMs - ts1;
                    if (elapsedMs <= MinFollowupElapsedMs || elapsedMs > MaxFollowupElapsedMs) continue;

                    if (!availableThroughByInst.TryGetValue(pass2.Instrument, out var availEnd) ||
                        !windowStartByInst.TryGetValue(pass2.Instrument, out var winStart))
                        continue;

                    var lagMs = LagMsByInstrument[pass2.Instrument];
                    if (pass2.TimestampMs - MatchToleranceMs < winStart ||
                        pass2.TimestampMs + MatchToleranceMs + lagMs > availEnd)
                        continue;

                    var direction = $"{sourceFamily}-{pass2.Instrument}";
                    var satPair = $"{anchor.Satellite} to {pass2.Satellite}";

                    var pass2Utc = DateTimeOffset.FromUnixTimeMilliseconds(pass2.TimestampMs);
                    var g2 = OverpassIndexBuilder.ComputeSpotGeometry(
                        geomCalc, anchor.Latitude, anchor.Longitude, pass2Utc, pass2.Satellite, pass2.Instrument);

                    var best500 = FindBestMatch(orderedSpots, spotTimestamps, spatialBuckets,
                        anchor.Latitude, anchor.Longitude, pass2.Satellite, pass2.TimestampMs, 0.5);
                    var best1k = best500 ?? FindBestMatch(orderedSpots, spotTimestamps, spatialBuckets,
                        anchor.Latitude, anchor.Longitude, pass2.Satellite, pass2.TimestampMs, 1.0);

                    var hit500 = best500.HasValue ? 1 : 0;
                    var hit1k = best1k.HasValue ? 1 : 0;
                    var primaryMatch = direction == "viirs-viirs" ? best500 : best1k;
                    var primaryHit = primaryMatch.HasValue ? 1 : 0;
                    var primaryMiss = 1 - primaryHit;

                    double? frp2 = null, br2 = null, logChange = null;
                    int? conf2 = null;
                    var secondDn = g2.SunElevationDeg >= 0 ? "D" : "N";
                    if (primaryMatch is { } matchIdx)
                    {
                        var m = orderedSpots[matchIdx];
                        frp2 = m.FrpMw;
                        br2 = m.BrightnessKelvin;
                        conf2 = m.ConfidenceScore;
                        secondDn = m.DayNight;
                        logChange = Math.Log(1.0 + m.FrpMw) - Math.Log(1.0 + anchor.FrpMw);
                    }

                    pairTemplates.Add(new PairTemplate(
                        direction,
                        satPair,
                        anchorIdx,
                        anchor.Latitude,
                        anchor.Longitude,
                        ts1,
                        anchor.AcquiredAtUtc,
                        anchor.Satellite,
                        anchor.Instrument,
                        anchor.DayNight,
                        anchor.FrpMw,
                        anchor.BrightnessKelvin,
                        anchor.SecondaryBrightnessKelvin,
                        anchor.ConfidenceScore,
                        anchor.ScanKm,
                        anchor.TrackKm,
                        anchor.LandCover?.DominantCode,
                        anchor.LandCover?.Coverage,
                        g1,
                        pass2.TimestampMs,
                        pass2Utc,
                        pass2.Satellite,
                        pass2.Instrument,
                        secondDn,
                        elapsedMs / 60_000.0,
                        pass2.DistanceKm,
                        pass2.IsNadir,
                        g2,
                        hit500,
                        hit1k,
                        primaryHit,
                        primaryMiss,
                        frp2,
                        br2,
                        conf2,
                        logChange));
                }
            }
        }

        // Collect unique weather sample queries across all t1 (spots) and t2 (pass2).
        var weatherQueryIndex = new Dictionary<(double, double, long), int>(n + pairTemplates.Count);
        var uniqueQueries = new List<WeatherSamplePoint>(n + pairTemplates.Count);

        void RegisterQuery(double lat, double lon, DateTimeOffset ts)
        {
            var rLat = Math.Round(lat, 4);
            var rLon = Math.Round(lon, 4);
            var ms = ts.ToUnixTimeMilliseconds();
            var key = (rLat, rLon, ms);
            if (!weatherQueryIndex.ContainsKey(key))
            {
                weatherQueryIndex[key] = uniqueQueries.Count;
                uniqueQueries.Add(new WeatherSamplePoint(rLat, rLon, ts));
            }
        }

        for (var i = 0; i < n; i++)
            RegisterQuery(orderedSpots[i].Latitude, orderedSpots[i].Longitude, orderedSpots[i].AcquiredAtUtc);
        foreach (var p in pairTemplates)
            RegisterQuery(p.Latitude, p.Longitude, p.Pass2Utc);

        return (spotGeoms, pairTemplates, weatherQueryIndex, uniqueQueries, outcomes);
    }

    private static bool HasMatch(
        IReadOnlyList<FirmsHotspot> spots,
        long[] timestamps,
        Dictionary<(int, int), List<int>> buckets,
        double lat,
        double lon,
        string satellite,
        long passTimestampMs,
        double radiusKm) =>
        FindBestMatch(spots, timestamps, buckets, lat, lon, satellite, passTimestampMs, radiusKm).HasValue;

    private static int? FindBestMatch(
        IReadOnlyList<FirmsHotspot> spots,
        long[] timestamps,
        Dictionary<(int, int), List<int>> buckets,
        double lat,
        double lon,
        string satellite,
        long passTimestampMs,
        double radiusKm)
    {
        var cell = ToCell(lat, lon);
        var lonSpan = LonBucketRadius(lat);
        int? bestIdx = null;
        var bestDistKm = double.PositiveInfinity;
        var bestDtMs = long.MaxValue;

        for (var dLat = -1; dLat <= 1; dLat++)
        {
            for (var dLon = -lonSpan; dLon <= lonSpan; dLon++)
            {
                if (!buckets.TryGetValue((cell.LatCell + dLat, cell.LonCell + dLon), out var list))
                    continue;
                foreach (var idx in list)
                {
                    var dt = Math.Abs(timestamps[idx] - passTimestampMs);
                    if (dt > MatchToleranceMs) continue;
                    var candidate = spots[idx];
                    if (candidate.Satellite != satellite) continue;
                    var dist = HaversineKm(lat, lon, candidate.Latitude, candidate.Longitude);
                    if (dist <= radiusKm && (dist < bestDistKm - 1e-6 || (Math.Abs(dist - bestDistKm) <= 1e-6 && dt < bestDtMs)))
                    {
                        bestDistKm = dist;
                        bestDtMs = dt;
                        bestIdx = idx;
                    }
                }
            }
        }
        return bestIdx;
    }

    private static (int LatCell, int LonCell) ToCell(double lat, double lon) =>
        ((int)Math.Floor(lat / CellDeg), (int)Math.Floor(lon / CellDeg));

    private static int LonBucketRadius(double lat)
    {
        var cosLat = Math.Max(0.05, Math.Cos(lat * DegToRad));
        return Math.Max(1, (int)Math.Ceiling(1.5 / (cosLat * 2.22)));
    }

    private static double HaversineKm(double lat1, double lon1, double lat2, double lon2)
    {
        var dLat = (lat2 - lat1) * DegToRad;
        var dLon = (lon2 - lon1) * DegToRad;
        var s1 = Math.Sin(dLat * 0.5);
        var s2 = Math.Sin(dLon * 0.5);
        var a = s1 * s1 + Math.Cos(lat1 * DegToRad) * Math.Cos(lat2 * DegToRad) * s2 * s2;
        return 2.0 * EarthRadiusKm * Math.Atan2(Math.Sqrt(a), Math.Sqrt(Math.Max(0.0, 1.0 - a)));
    }
}

internal readonly record struct SpotOutcomeStats(
    bool Settled6hAll,
    int SettledSameFamilyPasses6h,
    int PositiveSameFamilyPasses6h,
    int NegativeSameFamilyPasses6h,
    int SettledCrossFamilyPasses6h,
    int PositiveCrossFamilyPasses6h,
    int NegativeCrossFamilyPasses6h,
    int SettledTotalPasses6h,
    int PositiveTotalPasses6h,
    int NegativeTotalPasses6h,
    double? MinCandidateTrackDistKm6h,
    double? MeanCandidateTrackDistKm6h,
    int HasNadirCandidate6h,
    bool Settled12hSymmetric,
    int SettledTotalPasses12h,
    int PositiveTotalPasses12h,
    int NegativeTotalPasses12h);
