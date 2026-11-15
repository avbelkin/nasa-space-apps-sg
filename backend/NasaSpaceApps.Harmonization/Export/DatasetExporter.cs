using System.Text.Json;
using NasaSpaceApps.Api.Firms;
using NasaSpaceApps.Api.Satellites;

namespace NasaSpaceApps.Harmonization.Export;

internal static class DatasetExporter
{
    public static async Task RunAsync(
        string outputDir,
        int days,
        bool refreshFirms,
        bool refreshTles,
        CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(outputDir);
        var cacheDir = Path.Combine(outputDir, "cache");
        Directory.CreateDirectory(cacheDir);

        using var httpFactory = new OfflineHttpClientFactory();
        using var firmsHttp = httpFactory.CreateClient("FirmsDownload");
        firmsHttp.Timeout = TimeSpan.FromMinutes(3);

        var firms = await FirmsDatasetFetcher.FetchWorldAsync(
            firmsHttp, Path.Combine(cacheDir, "firms"), days, refreshFirms, cancellationToken).ConfigureAwait(false);

        if (firms.Spots.Count == 0)
            throw new InvalidOperationException("No FIRMS hotspots returned for world query.");

        var minAcq = firms.Spots[0].AcquiredAtUtc;
        var maxAcq = firms.Spots[^1].AcquiredAtUtc;
        Console.WriteLine($"[Dataset] {firms.Spots.Count:N0} detections spanning {minAcq:yyyy-MM-dd HH:mm}Z .. {maxAcq:yyyy-MM-dd HH:mm}Z (fetched {firms.FetchedAtUtc:yyyy-MM-dd HH:mm}Z).");

        using var tleHttp = httpFactory.CreateClient("TleDownload");
        var fleetTles = await OverpassIndexBuilder.LoadOrFetchTlesAsync(
            tleHttp, Path.Combine(cacheDir, "tles"), refreshTles, cancellationToken).ConfigureAwait(false);

        foreach (var kv in fleetTles.OrderBy(k => k.Key))
            Console.WriteLine($"[TLE] NORAD {kv.Key} ({kv.Value.Tle.Name}): epoch {kv.Value.Tle.EpochUtc:yyyy-MM-dd HH:mm}Z [{kv.Value.Source}]");

        using var weatherEnricher = new GlobalWeatherBatchEnricher();
        var lcSpots = await weatherEnricher.EnrichLandCoverAsync(firms.Spots, cacheDir, cancellationToken)
            .ConfigureAwait(false);

        Console.WriteLine("[Overpass] Building J2 overpass index across full multi-day window...");
        var overpassIndex = OverpassIndexBuilder.Build(fleetTles, minAcq, maxAcq);
        var geomCalc = new HotspotGeometryCalculator(fleetTles, TimeSpan.FromDays(Math.Max(7, days + 2)));

        var (spotGeoms, pairTemplates, weatherQueryIndex, uniqueQueries, outcomes) =
            HarmonizationPairBuilder.BuildStructure(lcSpots, firms, overpassIndex, geomCalc);

        Console.WriteLine($"[Pairs] Extracted {pairTemplates.Count:N0} follow-up pass pairs; {uniqueQueries.Count:N0} unique weather sample points.");

        var weatherVectors = await weatherEnricher.EnrichWeatherAsync(uniqueQueries, cacheDir, cancellationToken)
            .ConfigureAwait(false);

        WeatherFeatures LookupWeather(double lat, double lon, DateTimeOffset ts)
        {
            var key = (Math.Round(lat, 4), Math.Round(lon, 4), ts.ToUnixTimeMilliseconds());
            return weatherQueryIndex.TryGetValue(key, out var idx) ? weatherVectors[idx] : WeatherFeatures.Empty;
        }

        var spotRows = new List<EnrichedSpotRecord>(lcSpots.Count);
        for (var i = 0; i < lcSpots.Count; i++)
        {
            var s = lcSpots[i];
            var o = outcomes[i];
            var w1 = LookupWeather(s.Latitude, s.Longitude, s.AcquiredAtUtc);
            spotRows.Add(new EnrichedSpotRecord(
                SpotId: i,
                Latitude: s.Latitude,
                Longitude: s.Longitude,
                AcquiredAtUtc: s.AcquiredAtUtc,
                TimestampMs: s.AcquiredAtUtc.ToUnixTimeMilliseconds(),
                Satellite: s.Satellite,
                Instrument: s.Instrument,
                SourceDataset: s.SourceDataset,
                DayNight: s.DayNight,
                FrpMw: s.FrpMw,
                BrightnessK: s.BrightnessKelvin,
                SecondaryBrightnessK: s.SecondaryBrightnessKelvin,
                ScanKm: s.ScanKm,
                TrackKm: s.TrackKm,
                Confidence: s.ConfidenceScore,
                LandCoverCode: s.LandCover?.DominantCode,
                LandCoverShare: s.LandCover?.Coverage,
                Geometry1: spotGeoms[i],
                Weather1: w1,
                Settled6hAll: o.Settled6hAll,
                SettledSameFamilyPasses6h: o.SettledSameFamilyPasses6h,
                PositiveSameFamilyPasses6h: o.PositiveSameFamilyPasses6h,
                NegativeSameFamilyPasses6h: o.NegativeSameFamilyPasses6h,
                SettledCrossFamilyPasses6h: o.SettledCrossFamilyPasses6h,
                PositiveCrossFamilyPasses6h: o.PositiveCrossFamilyPasses6h,
                NegativeCrossFamilyPasses6h: o.NegativeCrossFamilyPasses6h,
                SettledTotalPasses6h: o.SettledTotalPasses6h,
                PositiveTotalPasses6h: o.PositiveTotalPasses6h,
                NegativeTotalPasses6h: o.NegativeTotalPasses6h,
                MinCandidateTrackDistKm6h: o.MinCandidateTrackDistKm6h,
                MeanCandidateTrackDistKm6h: o.MeanCandidateTrackDistKm6h,
                HasNadirCandidate6h: o.HasNadirCandidate6h,
                Settled12hSymmetric: o.Settled12hSymmetric,
                SettledTotalPasses12h: o.SettledTotalPasses12h,
                PositiveTotalPasses12h: o.PositiveTotalPasses12h,
                NegativeTotalPasses12h: o.NegativeTotalPasses12h));
        }

        var pairRows = new List<PassPairRecord>(pairTemplates.Count);
        foreach (var p in pairTemplates)
        {
            var w1 = LookupWeather(p.Latitude, p.Longitude, p.FirstAcquiredAtUtc);
            var w2 = LookupWeather(p.Latitude, p.Longitude, p.Pass2Utc);
            pairRows.Add(new PassPairRecord(
                p.Direction, p.SatellitePair, p.AnchorSpotId, p.Latitude, p.Longitude,
                p.FirstTimestampMs, p.FirstAcquiredAtUtc, p.FirstSatellite, p.FirstInstrument, p.FirstDayNight,
                p.Frp1, p.Brightness1, p.SecondaryBrightness1, p.Confidence1, p.Scan1, p.Track1,
                p.LandCoverCode, p.LandCoverShare, p.Geometry1, w1,
                p.Pass2TimestampMs, p.Pass2Utc, p.SecondSatellite, p.SecondInstrument, p.SecondDayNight,
                p.ElapsedMinutes, p.SecondTrackDistanceKm, p.SecondNadirSwath, p.Geometry2, w2,
                p.Hit500m, p.Hit1km, p.PrimaryHit, p.PrimaryMiss, p.Frp2, p.Brightness2, p.Confidence2, p.LogFrpChange));
        }

        var spotsPath = Path.Combine(outputDir, $"spots_{days}d_weather.csv.gz");
        var pairsPath = Path.Combine(outputDir, $"pass_pairs_4dir_{days}d_weather.csv.gz");
        Console.WriteLine($"[Write] Writing {spotsRowsDescription(spotRows.Count)} to {Path.GetFileName(spotsPath)}...");
        CsvSchemaCodec.WriteSpotsCsvGzip(spotsPath, spotRows);
        Console.WriteLine($"[Write] Writing {pairRows.Count:N0} pairs to {Path.GetFileName(pairsPath)}...");
        CsvSchemaCodec.WritePairsCsvGzip(pairsPath, pairRows);

        // Compute coverage & summary statistics for dataset_manifest.json
        var gfsCov1 = 100.0 * spotRows.Count(r => r.Weather1.GfsAvailable) / Math.Max(1, spotRows.Count);
        var gwisCov1 = 100.0 * spotRows.Count(r => r.Weather1.GwisAvailable) / Math.Max(1, spotRows.Count);
        var lcCov1 = 100.0 * spotRows.Count(r => r.LandCoverCode is > 0) / Math.Max(1, spotRows.Count);
        var orbitCov1 = 100.0 * spotRows.Count(r => r.Geometry1.OffNadirDeg.HasValue) / Math.Max(1, spotRows.Count);

        var dirSummary = pairRows.GroupBy(p => p.Direction)
            .OrderBy(g => g.Key)
            .ToDictionary(g => g.Key, g => new
            {
                eligiblePasses = g.Count(),
                matchedPrimary = g.Count(x => x.PrimaryHit == 1),
                missRate = Math.Round(100.0 * g.Count(x => x.PrimaryMiss == 1) / g.Count(), 2),
                matched1km = g.Count(x => x.Hit1km == 1),
                gfsT1CoveragePct = Math.Round(100.0 * g.Count(x => x.Weather1.GfsAvailable) / g.Count(), 2),
                gfsT2CoveragePct = Math.Round(100.0 * g.Count(x => x.Weather2.GfsAvailable) / g.Count(), 2),
                gwisT1CoveragePct = Math.Round(100.0 * g.Count(x => x.Weather1.GwisAvailable) / g.Count(), 2),
                gwisT2CoveragePct = Math.Round(100.0 * g.Count(x => x.Weather2.GwisAvailable) / g.Count(), 2),
            });

        var manifest = new
        {
            generatedAtUtc = DateTimeOffset.UtcNow,
            daysRequested = days,
            fetchedAtUtc = firms.FetchedAtUtc,
            windowStartUtc = minAcq,
            windowEndUtc = maxAcq,
            totalSpots = spotRows.Count,
            settled6hSpotsWithPass = spotRows.Count(r => r.Settled6hAll && r.SettledTotalPasses6h > 0),
            settled12hSpotsWithPass = spotRows.Count(r => r.Settled12hSymmetric && r.SettledTotalPasses12h > 0),
            spotsFile = Path.GetFileName(spotsPath),
            pairsFile = Path.GetFileName(pairsPath),
            coveragePct = new
            {
                orbitGeometry = Math.Round(orbitCov1, 2),
                landCover = Math.Round(lcCov1, 2),
                gfsWeather = Math.Round(gfsCov1, 2),
                gwisFireWeather = Math.Round(gwisCov1, 2),
            },
            instrumentCounts = firms.InstrumentWindows.ToDictionary(
                k => k.Key,
                k => new { count = k.Value.Count, minUtc = k.Value.MinUtc, maxUtc = k.Value.MaxUtc }),
            directions = dirSummary,
        };

        var manifestPath = Path.Combine(outputDir, "dataset_manifest.json");
        await File.WriteAllTextAsync(
            manifestPath,
            JsonSerializer.Serialize(manifest, new JsonSerializerOptions { WriteIndented = true }),
            cancellationToken).ConfigureAwait(false);

        Console.WriteLine($"[Done] Export manifest saved to {manifestPath}");
        static string spotsRowsDescription(int count) => $"{count:N0} enriched spot rows";
    }
}
