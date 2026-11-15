using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using NasaSpaceApps.Harmonization.Export;

namespace NasaSpaceApps.Harmonization.Modeling;

public sealed record NamedFeatureGain(string Feature, double SharePct);

public sealed record ClassificationEvalPair(
    ClassificationMetrics SpatialCv,
    ClassificationMetrics? TemporalHoldout,
    int? ViirsMiss500mHit1kmCount = null);

public sealed record RegressionEvalPair(
    RegressionMetrics SpatialCv,
    RegressionMetrics? TemporalHoldout);

public sealed record AblationDeltaResult(
    string Group,
    ClassificationMetrics? SingleGroupClassification,
    double? SingleGroupDeltaRocAuc,
    double? SingleGroupNegDeltaLogLoss,
    ClassificationMetrics? LeaveOneOutClassification,
    double? LeaveOneOutDeltaRocAuc,
    double? LeaveOneOutNegDeltaLogLoss,
    RegressionMetrics? SingleGroupRegression,
    double? SingleGroupMwMaeReduction,
    RegressionMetrics? LeaveOneOutRegression,
    double? LeaveOneOutMwMaePenalty);

public sealed record DirectionDetectionStudy(
    string Direction,
    int SampleCount,
    int MissCount,
    double MissRatePct,
    int SpatialBlockCount,
    int TemporalTrainCount,
    int TemporalTestCount,
    string TemporalCutoffUtc,
    Dictionary<string, ClassificationEvalPair> Models,
    Dictionary<string, BlockBootstrapDelta> PairedSpatialBootstrapDeltas,
    List<AblationDeltaResult> WeatherGroupAblationsGbdt,
    List<NamedFeatureGain> TopGbdtFeatures);

public sealed record DirectionFrpStudy(
    string Direction,
    int SampleCount,
    double TargetMedianMw,
    int SpatialBlockCount,
    int TemporalTrainCount,
    int TemporalTestCount,
    string TemporalCutoffUtc,
    Dictionary<string, RegressionEvalPair> Models,
    Dictionary<string, BlockBootstrapDelta> PairedSpatialBootstrapDeltas,
    List<AblationDeltaResult> WeatherGroupAblationsGbdt,
    List<NamedFeatureGain> TopGbdtFeatures);

public sealed record SpotBinaryCohortStudy(
    string CohortName,
    string TargetName,
    int SampleCount,
    int PositiveCount,
    double PositiveRatePct,
    int SpatialBlockCount,
    int TemporalTrainCount,
    int TemporalTestCount,
    Dictionary<string, ClassificationEvalPair> Models,
    BlockBootstrapDelta? PairedDeltaGeomWeatherVsGeomGbdt,
    List<NamedFeatureGain> TopGbdtFeatures);

public sealed record SpotFrpCohortStudy(
    string CohortName,
    int SampleCount,
    double TargetMedianMw,
    double HighFrp50MwRatePct,
    int SpatialBlockCount,
    int TemporalTrainCount,
    int TemporalTestCount,
    Dictionary<string, RegressionEvalPair> Models,
    Dictionary<string, ClassificationEvalPair> HighFrp50MwModels,
    BlockBootstrapDelta? PairedDeltaLog1pMaeGeomWeatherVsGeomGbdt,
    BlockBootstrapDelta? PairedDeltaMwMaeGeomWeatherVsGeomGbdt,
    List<NamedFeatureGain> TopGbdtFeatures);

public sealed record PassLevelNoIntensityStudy(
    string Direction,
    int SampleCount,
    double AbsenceOfPositiveRatePct,
    double AbsenceOfNegativeRatePct,
    Dictionary<string, PassNoIntensityMetrics> Models);

public sealed record PassNoIntensityMetrics(
    ClassificationMetrics AbsenceOfPositiveSpatialCv,
    double AbsenceOfNegativePrAucSpatialCv,
    ClassificationMetrics? AbsenceOfPositiveTemporal);

public sealed record MatchedPass2FrpNoFrp1Study(
    string Direction,
    int SampleCount,
    Dictionary<string, RegressionMetrics> SpatialCvModels);

public sealed record HarmonizationStudyReport(
    DateTimeOffset GeneratedAtUtc,
    int DaysRequested,
    JsonElement DatasetManifest,
    Dictionary<string, DirectionDetectionStudy> Suite1Detection,
    Dictionary<string, DirectionFrpStudy> Suite1ConditionalFrp,
    Dictionary<string, PassLevelNoIntensityStudy> Suite2PassLevelNoIntensity,
    List<SpotBinaryCohortStudy> Suite2SpotAbsence6hAnd12h,
    List<SpotFrpCohortStudy> Suite2DirectSpotFrp,
    Dictionary<string, MatchedPass2FrpNoFrp1Study> Suite2Pass2FrpWithoutFrp1,
    Dictionary<string, object> UiModelFitMetadata);

internal static class HarmonizationStudyRunner
{
    private static readonly string[] Directions = ["modis-modis", "viirs-viirs", "modis-viirs", "viirs-modis"];

    private static readonly (string Name, WeatherGroupFlags Flag)[] WeatherGroups =
    [
        ("G1_Clouds", WeatherGroupFlags.G1Clouds),
        ("G2_WaterPrecip", WeatherGroupFlags.G2WaterPrecip),
        ("G3_Wind", WeatherGroupFlags.G3Wind),
        ("G4_ThermoRad", WeatherGroupFlags.G4ThermoRad),
        ("G5_SoilSnow", WeatherGroupFlags.G5SoilSnow),
        ("G6_GWIS", WeatherGroupFlags.G6Gwis),
    ];

    public static async Task<HarmonizationStudyReport> RunAsync(
        string dataDir,
        int days,
        string reportJsonPath,
        string? updateUiModelsDir,
        CancellationToken cancellationToken)
    {
        var spotsPath = Path.Combine(dataDir, $"spots_{days}d_weather.csv.gz");
        var pairsPath = Path.Combine(dataDir, $"pass_pairs_4dir_{days}d_weather.csv.gz");
        var manifestPath = Path.Combine(dataDir, "dataset_manifest.json");

        if (!File.Exists(spotsPath) || !File.Exists(pairsPath))
            throw new FileNotFoundException($"Missing dataset files in {dataDir}. Expected {Path.GetFileName(spotsPath)} and {Path.GetFileName(pairsPath)}.");

        Console.WriteLine($"[Train] Loading {Path.GetFileName(spotsPath)} and {Path.GetFileName(pairsPath)}...");
        var spots = CsvSchemaCodec.ReadSpotsCsvGzip(spotsPath);
        var pairs = CsvSchemaCodec.ReadPairsCsvGzip(pairsPath);
        var manifestDoc = File.Exists(manifestPath)
            ? JsonDocument.Parse(await File.ReadAllTextAsync(manifestPath, cancellationToken).ConfigureAwait(false)).RootElement.Clone()
            : JsonDocument.Parse("{}").RootElement.Clone();

        Console.WriteLine($"[Train] Loaded {spots.Count:N0} spots and {pairs.Count:N0} 4-direction pass pairs.");

        var suite1Det = new Dictionary<string, DirectionDetectionStudy>(StringComparer.Ordinal);
        var suite1Frp = new Dictionary<string, DirectionFrpStudy>(StringComparer.Ordinal);
        var suite2PassNoInt = new Dictionary<string, PassLevelNoIntensityStudy>(StringComparer.Ordinal);
        var suite2Pass2FrpNoFrp1 = new Dictionary<string, MatchedPass2FrpNoFrp1Study>(StringComparer.Ordinal);

        foreach (var dir in Directions)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var dirPairs = pairs.Where(p => p.Direction == dir).ToList();
            if (dirPairs.Count < 100)
                throw new InvalidOperationException($"Insufficient rows for direction {dir}: {dirPairs.Count}");

            Console.WriteLine($"\n=== Suite 1A: Detection [{dir}] ({dirPairs.Count:N0} pairs) ===");
            var detStudy = RunDetectionDirectionStudy(dir, dirPairs, out var suite1CeilingFullPreds, out var splitState);
            suite1Det[dir] = detStudy;

            Console.WriteLine($"=== Suite 2A: Pass-level Absence without Anchor Intensity [{dir}] ===");
            suite2PassNoInt[dir] = RunPassLevelNoIntensityStudy(dir, dirPairs, splitState);

            var hitPairs = dirPairs.Where(p => p.PrimaryHit == 1 && p.Frp2 is >= 0 && p.LogFrpChange.HasValue).ToList();
            Console.WriteLine($"=== Suite 1B: Conditional FRP [{dir}] ({hitPairs.Count:N0} matched pairs) ===");
            var frpStudy = RunConditionalFrpDirectionStudy(dir, hitPairs);
            suite1Frp[dir] = frpStudy;

            Console.WriteLine($"=== Suite 2C-Pair: 2nd-Pass FRP without Frp1 [{dir}] ===");
            suite2Pass2FrpNoFrp1[dir] = RunMatchedPass2FrpWithoutFrp1(dir, hitPairs);
        }

        Console.WriteLine("\n=== Suite 2B: Spot-level 6h & 12h Absence of Positive / Negative Detections (Geometry + Weather) ===");
        var suite2SpotAbsence = RunSpotAbsenceStudies(spots, cancellationToken);

        Console.WriteLine("\n=== Suite 2C: Direct Spot FRP from Geometry + Weather Alone (Zero Thermal/Confidence/Scan Leakage) ===");
        var suite2DirectFrp = RunDirectSpotFrpStudies(spots, cancellationToken);

        Console.WriteLine("\n=== Exporting full-dataset UI coefficients and checking Weather-t1 fit ===");
        var uiMetadata = FitAndMaybeExportUiModels(pairs, updateUiModelsDir);

        var report = new HarmonizationStudyReport(
            DateTimeOffset.UtcNow,
            days,
            manifestDoc,
            suite1Det,
            suite1Frp,
            suite2PassNoInt,
            suite2SpotAbsence,
            suite2DirectFrp,
            suite2Pass2FrpNoFrp1,
            uiMetadata);

        var reportDir = Path.GetDirectoryName(reportJsonPath);
        if (!string.IsNullOrEmpty(reportDir)) Directory.CreateDirectory(reportDir);
        var json = JsonSerializer.Serialize(report, new JsonSerializerOptions
        {
            WriteIndented = true,
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        });
        await File.WriteAllTextAsync(reportJsonPath, json, cancellationToken).ConfigureAwait(false);
        Console.WriteLine($"\n[Done] Benchmark report written to {reportJsonPath}");

        PrintConciseSummary(report);
        return report;
    }

    private sealed record PairSplitState(
        double[] TargetsMiss,
        int[] Folds,
        int[] BlockIds,
        int BlockCount,
        int[] TempTrainIdx,
        int[] TempTestIdx,
        long TempCutoffMs);

    private static DirectionDetectionStudy RunDetectionDirectionStudy(
        string direction,
        List<PassPairRecord> rows,
        out double[] gbdtAllWeatherOof,
        out PairSplitState splitState)
    {
        var n = rows.Count;
        var y = new double[n];
        var lats = new double[n];
        var lons = new double[n];
        var ts = new long[n];
        for (var i = 0; i < n; i++)
        {
            y[i] = rows[i].PrimaryMiss;
            lats[i] = rows[i].Latitude;
            lons[i] = rows[i].Longitude;
            ts[i] = rows[i].FirstTimestampMs;
        }

        var (folds, blockIds, blockCount) = CrossValidationSplit.AssignSpatialBlockFolds(lats, lons, y, 5);
        var (tempTrain, tempTest, cutoffMs) = CrossValidationSplit.BuildTemporalHoldout(ts);
        splitState = new PairSplitState(y, folds, blockIds, blockCount, tempTrain, tempTest, cutoffMs);

        var models = new Dictionary<string, ClassificationEvalPair>(StringComparer.Ordinal);
        var oofCache = new Dictionary<string, double[]>(StringComparer.Ordinal);

        ClassificationEvalPair EvalLinear(string name, Func<PassPairRecord, string[]> featFn)
        {
            var feats = rows.Select(featFn).ToArray();
            var oof = RunLinearClassificationSpatialCv(feats, y, folds, blockIds);
            oofCache[name] = oof;
            var cvMetrics = EvaluationMetrics.EvaluateBinary(y, oof);

            ClassificationMetrics? tempMetrics = null;
            if (tempTrain.Length >= 50 && tempTest.Length >= 30)
            {
                var fit = SparseLinearTrainer.FitLogistic(feats, y, tempTrain, blockIds, out _);
                var pTest = SparseLinearTrainer.PredictLogisticMissProb(fit, feats, tempTest);
                tempMetrics = EvaluateSlice(y, pTest, tempTest);
            }

            var extra1km = direction == "viirs-viirs" ? CountViirs1kmRecovery(rows, oof, 0.70) : (int?)null;
            Console.WriteLine($"  [{name,-30}] Spatial AUC={cvMetrics.RocAuc:F4} LL={cvMetrics.LogLoss:F4} >=70%miss={cvMetrics.HighDetectUnexpectedMisses}/{cvMetrics.HighDetectCount}" +
                              (tempMetrics is not null ? $" | Temp AUC={tempMetrics.RocAuc:F4}" : ""));
            return new ClassificationEvalPair(cvMetrics, tempMetrics, extra1km);
        }

        List<NamedFeatureGain> lastImportance = [];
        ClassificationEvalPair EvalGbdt(
            string name,
            bool pass2Geom,
            bool w1,
            bool w2,
            WeatherGroupFlags groups = WeatherGroupFlags.All)
        {
            var (colNames, cols) = FeatureExtractor.BuildPairContinuousMatrix(
                rows, includeIntensity: true, includeLandCover: true,
                includePass2Geometry: pass2Geom, includeWeatherT1: w1, includeWeatherT2: w2, weatherGroups: groups);

            var oof = RunGbdtClassificationSpatialCv(colNames, cols, y, folds, blockIds, out var gainSums);
            oofCache[name] = oof;
            var cvMetrics = EvaluationMetrics.EvaluateBinary(y, oof);

            ClassificationMetrics? tempMetrics = null;
            if (tempTrain.Length >= 50 && tempTest.Length >= 30)
            {
                var (maxTrees, minChild, lr) = GbdtParams(tempTrain.Length);
                var ds = QuantileBinnedDataset.FitAndTransform(colNames, cols, tempTrain);
                var m = HistogramGbdtModel.Train(ds, y, tempTrain, blockIds, GbdtObjective.BinaryLogLoss,
                    maxTrees: maxTrees, minChildWeight: minChild, learningRate: lr);
                var pTest = m.Predict(ds, tempTest);
                tempMetrics = EvaluateSlice(y, pTest, tempTest);
            }

            lastImportance = NormalizeTopFeatures(colNames, gainSums, 15);
            var extra1km = direction == "viirs-viirs" ? CountViirs1kmRecovery(rows, oof, 0.70) : (int?)null;
            Console.WriteLine($"  [{name,-30}] Spatial AUC={cvMetrics.RocAuc:F4} LL={cvMetrics.LogLoss:F4} >=70%miss={cvMetrics.HighDetectUnexpectedMisses}/{cvMetrics.HighDetectCount}" +
                              (tempMetrics is not null ? $" | Temp AUC={tempMetrics.RocAuc:F4}" : ""));
            return new ClassificationEvalPair(cvMetrics, tempMetrics, extra1km);
        }

        models["Baseline-NoWeather-Linear"] = EvalLinear("Baseline-NoWeather-Linear",
            r => FeatureExtractor.EncodePairDetectionBinned(r, true, true, false, false, false));
        models["NoWeather+Pass2Geom-Linear"] = EvalLinear("NoWeather+Pass2Geom-Linear",
            r => FeatureExtractor.EncodePairDetectionBinned(r, true, true, true, false, false));
        models["Weather-t1-Linear"] = EvalLinear("Weather-t1-Linear",
            r => FeatureExtractor.EncodePairDetectionBinned(r, true, true, false, true, false));
        models["Weather-t1t2-Interactions-Linear"] = EvalLinear("Weather-t1t2-Interactions-Linear",
            r => FeatureExtractor.EncodePairDetectionBinned(r, true, true, true, true, true));

        models["NoWeather-GBDT"] = EvalGbdt("NoWeather-GBDT", pass2Geom: true, w1: false, w2: false);
        models["Weather-t1-GBDT"] = EvalGbdt("Weather-t1-GBDT", pass2Geom: true, w1: true, w2: false);
        models["Weather-t1t2-GBDT"] = EvalGbdt("Weather-t1t2-GBDT", pass2Geom: true, w1: true, w2: true);
        var topFeatures = lastImportance;
        gbdtAllWeatherOof = oofCache["Weather-t1t2-GBDT"];

        // Paired block-bootstrap deltas on the exact same spatial blocks.
        var deltas = new Dictionary<string, BlockBootstrapDelta>(StringComparer.Ordinal)
        {
            ["WeatherT1Linear_vs_BaselineLinear_DeltaRocAuc"] = BootstrapAucDelta(y, blockIds, folds, oofCache["Weather-t1-Linear"], oofCache["Baseline-NoWeather-Linear"]),
            ["WeatherT1Linear_vs_BaselineLinear_NegDeltaLogLoss"] = BootstrapNegLogLossDelta(y, blockIds, folds, oofCache["Weather-t1-Linear"], oofCache["Baseline-NoWeather-Linear"]),
            ["WeatherT1T2Linear_vs_NoWeatherPass2Linear_DeltaRocAuc"] = BootstrapAucDelta(y, blockIds, folds, oofCache["Weather-t1t2-Interactions-Linear"], oofCache["NoWeather+Pass2Geom-Linear"]),
            ["WeatherT1T2Linear_vs_NoWeatherPass2Linear_NegDeltaLogLoss"] = BootstrapNegLogLossDelta(y, blockIds, folds, oofCache["Weather-t1t2-Interactions-Linear"], oofCache["NoWeather+Pass2Geom-Linear"]),
            ["WeatherT1T2Gbdt_vs_NoWeatherGbdt_DeltaRocAuc"] = BootstrapAucDelta(y, blockIds, folds, oofCache["Weather-t1t2-GBDT"], oofCache["NoWeather-GBDT"]),
            ["WeatherT1T2Gbdt_vs_NoWeatherGbdt_NegDeltaLogLoss"] = BootstrapNegLogLossDelta(y, blockIds, folds, oofCache["Weather-t1t2-GBDT"], oofCache["NoWeather-GBDT"]),
        };

        // 6-group weather ablations on GBDT (matching NoWeather-GBDT & Weather-t1t2-GBDT).
        var baseMetrics = models["NoWeather-GBDT"].SpatialCv;
        var allMetrics = models["Weather-t1t2-GBDT"].SpatialCv;
        var ablations = new List<AblationDeltaResult>(WeatherGroups.Length);
        foreach (var (gName, gFlag) in WeatherGroups)
        {
            var (cPlus, colsPlus) = FeatureExtractor.BuildPairContinuousMatrix(rows, true, true, true, true, true, gFlag);
            var oofPlus = RunGbdtClassificationSpatialCv(cPlus, colsPlus, y, folds, blockIds, out _);
            var mPlus = EvaluationMetrics.EvaluateBinary(y, oofPlus);

            var minusFlag = WeatherGroupFlags.All & ~gFlag;
            var (cMinus, colsMinus) = FeatureExtractor.BuildPairContinuousMatrix(rows, true, true, true, true, true, minusFlag);
            var oofMinus = RunGbdtClassificationSpatialCv(cMinus, colsMinus, y, folds, blockIds, out _);
            var mMinus = EvaluationMetrics.EvaluateBinary(y, oofMinus);

            ablations.Add(new AblationDeltaResult(
                Group: gName,
                SingleGroupClassification: mPlus,
                SingleGroupDeltaRocAuc: mPlus.RocAuc - baseMetrics.RocAuc,
                SingleGroupNegDeltaLogLoss: baseMetrics.LogLoss - mPlus.LogLoss,
                LeaveOneOutClassification: mMinus,
                LeaveOneOutDeltaRocAuc: allMetrics.RocAuc - mMinus.RocAuc,
                LeaveOneOutNegDeltaLogLoss: mMinus.LogLoss - allMetrics.LogLoss,
                SingleGroupRegression: null,
                SingleGroupMwMaeReduction: null,
                LeaveOneOutRegression: null,
                LeaveOneOutMwMaePenalty: null));
        }

        var missCount = rows.Count(r => r.PrimaryMiss == 1);
        return new DirectionDetectionStudy(
            Direction: direction,
            SampleCount: n,
            MissCount: missCount,
            MissRatePct: Math.Round(100.0 * missCount / n, 2),
            SpatialBlockCount: blockCount,
            TemporalTrainCount: tempTrain.Length,
            TemporalTestCount: tempTest.Length,
            TemporalCutoffUtc: DateTimeOffset.FromUnixTimeMilliseconds(cutoffMs).ToString("O"),
            Models: models,
            PairedSpatialBootstrapDeltas: deltas,
            WeatherGroupAblationsGbdt: ablations,
            TopGbdtFeatures: topFeatures);
    }

    private static DirectionFrpStudy RunConditionalFrpDirectionStudy(
        string direction,
        List<PassPairRecord> rows)
    {
        var n = rows.Count;
        var deltaLog = new double[n];
        var log1pFrp1 = new double[n];
        var log1pFrp2 = new double[n];
        var frp1Mw = new double[n];
        var frp2Mw = new double[n];
        var lats = new double[n];
        var lons = new double[n];
        var ts = new long[n];

        for (var i = 0; i < n; i++)
        {
            var r = rows[i];
            log1pFrp1[i] = MathUtil.Log1p(Math.Max(0.0, r.Frp1));
            log1pFrp2[i] = MathUtil.Log1p(Math.Max(0.0, r.Frp2!.Value));
            deltaLog[i] = r.LogFrpChange ?? (log1pFrp2[i] - log1pFrp1[i]);
            frp1Mw[i] = r.Frp1;
            frp2Mw[i] = r.Frp2!.Value;
            lats[i] = r.Latitude;
            lons[i] = r.Longitude;
            ts[i] = r.FirstTimestampMs;
        }

        var (folds, blockIds, blockCount) = CrossValidationSplit.AssignSpatialBlockFolds(lats, lons, deltaLog, 5);
        var (tempTrain, tempTest, cutoffMs) = CrossValidationSplit.BuildTemporalHoldout(ts);

        var models = new Dictionary<string, RegressionEvalPair>(StringComparer.Ordinal);
        var oofPredLog2 = new Dictionary<string, double[]>(StringComparer.Ordinal);
        var oofPredMw = new Dictionary<string, double[]>(StringComparer.Ordinal);

        RegressionMetrics EvalPreds(int[] idx, double[] predDelta)
        {
            var actLog = new double[idx.Length];
            var pLog = new double[idx.Length];
            var actMw = new double[idx.Length];
            var pMw = new double[idx.Length];
            var baseMw = new double[idx.Length];
            for (var k = 0; k < idx.Length; k++)
            {
                var i = idx[k];
                actLog[k] = log1pFrp2[i];
                pLog[k] = Math.Max(0.0, log1pFrp1[i] + predDelta[k]);
                actMw[k] = frp2Mw[i];
                pMw[k] = Math.Max(0.0, MathUtil.Expm1(pLog[k]));
                baseMw[k] = frp1Mw[i];
            }
            return EvaluationMetrics.EvaluateFrpRegression(actLog, pLog, actMw, pMw, baseMw);
        }

        var allIdx = Enumerable.Range(0, n).ToArray();

        // 1. No-change baseline
        var zeroDelta = new double[n];
        var noChangeCv = EvalPreds(allIdx, zeroDelta);
        var noChangeTemp = tempTest.Length >= 20 ? EvalPreds(tempTest, new double[tempTest.Length]) : null;
        models["NoChange"] = new RegressionEvalPair(noChangeCv, noChangeTemp);

        // 2. Fold median offset baseline
        var medOofDelta = new double[n];
        for (var f = 0; f < 5; f++)
        {
            var tr = Enumerable.Range(0, n).Where(i => folds[i] != f).Select(i => deltaLog[i]).OrderBy(v => v).ToArray();
            var med = tr.Length > 0 ? tr[tr.Length / 2] : 0.0;
            for (var i = 0; i < n; i++)
                if (folds[i] == f) medOofDelta[i] = med;
        }
        double[]? medTempDelta = null;
        if (tempTrain.Length >= 30 && tempTest.Length >= 20)
        {
            var tr = tempTrain.Select(i => deltaLog[i]).OrderBy(v => v).ToArray();
            medTempDelta = Enumerable.Repeat(tr[tr.Length / 2], tempTest.Length).ToArray();
        }
        models["MedianOffset"] = new RegressionEvalPair(
            EvalPreds(allIdx, medOofDelta),
            medTempDelta is null ? null : EvalPreds(tempTest, medTempDelta));

        void RunLinearFrp(string name, Func<PassPairRecord, string[]> featFn)
        {
            var feats = rows.Select(featFn).ToArray();
            var oofDelta = RunLinearHuberSpatialCv(feats, deltaLog, folds, blockIds);
            RecordOof(name, oofDelta);
            RegressionMetrics? tempM = null;
            if (tempTrain.Length >= 30 && tempTest.Length >= 20)
            {
                var fit = SparseLinearTrainer.FitHuber(feats, deltaLog, tempTrain, blockIds);
                var pTest = SparseLinearTrainer.PredictHuber(fit, feats, tempTest);
                tempM = EvalPreds(tempTest, pTest);
            }
            var cvM = EvalPreds(allIdx, oofDelta);
            Console.WriteLine($"  [{name,-30}] Spatial log1pMAE={cvM.Log1pMae:F4} MW_MAE={cvM.MwMae:F2} (noChg {noChangeCv.MwMae:F2})" +
                              (tempM is not null ? $" | Temp MW_MAE={tempM.MwMae:F2}" : ""));
            models[name] = new RegressionEvalPair(cvM, tempM);
        }

        List<NamedFeatureGain> lastImp = [];
        void RunGbdtFrp(string name, bool pass2Geom, bool w1, bool w2, WeatherGroupFlags groups = WeatherGroupFlags.All)
        {
            var (colNames, cols) = FeatureExtractor.BuildPairContinuousMatrix(
                rows, includeIntensity: true, includeLandCover: true,
                includePass2Geometry: pass2Geom, includeWeatherT1: w1, includeWeatherT2: w2, weatherGroups: groups);
            var oofDelta = RunGbdtHuberSpatialCv(colNames, cols, deltaLog, folds, blockIds, out var gains);
            RecordOof(name, oofDelta);
            RegressionMetrics? tempM = null;
            if (tempTrain.Length >= 30 && tempTest.Length >= 20)
            {
                var (maxTrees, minChild, lr) = GbdtParams(tempTrain.Length);
                var ds = QuantileBinnedDataset.FitAndTransform(colNames, cols, tempTrain);
                var m = HistogramGbdtModel.Train(ds, deltaLog, tempTrain, blockIds, GbdtObjective.Huber,
                    maxTrees: maxTrees, minChildWeight: minChild, learningRate: lr);
                var pTest = m.Predict(ds, tempTest);
                tempM = EvalPreds(tempTest, pTest);
            }
            lastImp = NormalizeTopFeatures(colNames, gains, 15);
            var cvM = EvalPreds(allIdx, oofDelta);
            Console.WriteLine($"  [{name,-30}] Spatial log1pMAE={cvM.Log1pMae:F4} MW_MAE={cvM.MwMae:F2}" +
                              (tempM is not null ? $" | Temp MW_MAE={tempM.MwMae:F2}" : ""));
            models[name] = new RegressionEvalPair(cvM, tempM);
        }

        void RecordOof(string name, double[] oofDelta)
        {
            var pLog2 = new double[n];
            var pMw = new double[n];
            for (var i = 0; i < n; i++)
            {
                pLog2[i] = Math.Max(0.0, log1pFrp1[i] + oofDelta[i]);
                pMw[i] = Math.Max(0.0, MathUtil.Expm1(pLog2[i]));
            }
            oofPredLog2[name] = pLog2;
            oofPredMw[name] = pMw;
        }

        RunLinearFrp("Baseline-NoWeather-Linear", r => FeatureExtractor.EncodePairFrpBinned(r, false, false, false));
        RunLinearFrp("NoWeather+Pass2Geom-Linear", r => FeatureExtractor.EncodePairFrpBinned(r, true, false, false));
        RunLinearFrp("Weather-t1-Linear", r => FeatureExtractor.EncodePairFrpBinned(r, false, true, false));
        RunLinearFrp("Weather-t1t2-Interactions-Linear", r => FeatureExtractor.EncodePairFrpBinned(r, true, true, true));

        RunGbdtFrp("NoWeather-GBDT", pass2Geom: true, w1: false, w2: false);
        RunGbdtFrp("Weather-t1-GBDT", pass2Geom: true, w1: true, w2: false);
        RunGbdtFrp("Weather-t1t2-GBDT", pass2Geom: true, w1: true, w2: true);
        var topFeatures = lastImp;

        var deltas = new Dictionary<string, BlockBootstrapDelta>(StringComparer.Ordinal)
        {
            ["WeatherT1Linear_vs_BaselineLinear_NegDeltaLog1pMae"] = BootstrapNegMaeDelta(log1pFrp2, blockIds, folds, oofPredLog2["Weather-t1-Linear"], oofPredLog2["Baseline-NoWeather-Linear"]),
            ["WeatherT1Linear_vs_BaselineLinear_NegDeltaMwMae"] = BootstrapNegMaeDelta(frp2Mw, blockIds, folds, oofPredMw["Weather-t1-Linear"], oofPredMw["Baseline-NoWeather-Linear"]),
            ["WeatherT1T2Linear_vs_NoWeatherPass2Linear_NegDeltaLog1pMae"] = BootstrapNegMaeDelta(log1pFrp2, blockIds, folds, oofPredLog2["Weather-t1t2-Interactions-Linear"], oofPredLog2["NoWeather+Pass2Geom-Linear"]),
            ["WeatherT1T2Linear_vs_NoWeatherPass2Linear_NegDeltaMwMae"] = BootstrapNegMaeDelta(frp2Mw, blockIds, folds, oofPredMw["Weather-t1t2-Interactions-Linear"], oofPredMw["NoWeather+Pass2Geom-Linear"]),
            ["WeatherT1T2Gbdt_vs_NoWeatherGbdt_NegDeltaLog1pMae"] = BootstrapNegMaeDelta(log1pFrp2, blockIds, folds, oofPredLog2["Weather-t1t2-GBDT"], oofPredLog2["NoWeather-GBDT"]),
            ["WeatherT1T2Gbdt_vs_NoWeatherGbdt_NegDeltaMwMae"] = BootstrapNegMaeDelta(frp2Mw, blockIds, folds, oofPredMw["Weather-t1t2-GBDT"], oofPredMw["NoWeather-GBDT"]),
        };

        var baseM = models["NoWeather-GBDT"].SpatialCv;
        var allM = models["Weather-t1t2-GBDT"].SpatialCv;
        var ablations = new List<AblationDeltaResult>(WeatherGroups.Length);
        foreach (var (gName, gFlag) in WeatherGroups)
        {
            var (cPlus, colsPlus) = FeatureExtractor.BuildPairContinuousMatrix(rows, true, true, true, true, true, gFlag);
            var oofPlus = RunGbdtHuberSpatialCv(cPlus, colsPlus, deltaLog, folds, blockIds, out _);
            var mPlus = EvalPreds(allIdx, oofPlus);

            var minusFlag = WeatherGroupFlags.All & ~gFlag;
            var (cMinus, colsMinus) = FeatureExtractor.BuildPairContinuousMatrix(rows, true, true, true, true, true, minusFlag);
            var oofMinus = RunGbdtHuberSpatialCv(cMinus, colsMinus, deltaLog, folds, blockIds, out _);
            var mMinus = EvalPreds(allIdx, oofMinus);

            ablations.Add(new AblationDeltaResult(
                Group: gName,
                SingleGroupClassification: null, SingleGroupDeltaRocAuc: null, SingleGroupNegDeltaLogLoss: null,
                LeaveOneOutClassification: null, LeaveOneOutDeltaRocAuc: null, LeaveOneOutNegDeltaLogLoss: null,
                SingleGroupRegression: mPlus,
                SingleGroupMwMaeReduction: baseM.MwMae - mPlus.MwMae,
                LeaveOneOutRegression: mMinus,
                LeaveOneOutMwMaePenalty: mMinus.MwMae - allM.MwMae));
        }

        return new DirectionFrpStudy(
            Direction: direction,
            SampleCount: n,
            TargetMedianMw: noChangeCv.TargetMedianMw,
            SpatialBlockCount: blockCount,
            TemporalTrainCount: tempTrain.Length,
            TemporalTestCount: tempTest.Length,
            TemporalCutoffUtc: DateTimeOffset.FromUnixTimeMilliseconds(cutoffMs).ToString("O"),
            Models: models,
            PairedSpatialBootstrapDeltas: deltas,
            WeatherGroupAblationsGbdt: ablations,
            TopGbdtFeatures: topFeatures);
    }

    private static PassLevelNoIntensityStudy RunPassLevelNoIntensityStudy(
        string direction,
        List<PassPairRecord> rows,
        PairSplitState split)
    {
        var yMiss = split.TargetsMiss;
        var yHit = yMiss.Select(m => 1.0 - m).ToArray();
        var models = new Dictionary<string, PassNoIntensityMetrics>(StringComparer.Ordinal);

        void RunPairTier(string name, bool includeLinear, Func<PassPairRecord, string[]>? linearFeatFn, Func<(string[] Names, double[][] Columns)> gbdtMatrixFn)
        {
            if (includeLinear && linearFeatFn is not null)
            {
                var feats = rows.Select(linearFeatFn).ToArray();
                var oof = RunLinearClassificationSpatialCv(feats, yMiss, split.Folds, split.BlockIds);
                var pHit = oof.Select(p => 1.0 - p).ToArray();
                var mPos = EvaluationMetrics.EvaluateBinary(yMiss, oof);
                var prNeg = EvaluationMetrics.ComputePrAuc(yHit, pHit);
                ClassificationMetrics? tempM = null;
                if (split.TempTrainIdx.Length >= 50 && split.TempTestIdx.Length >= 30)
                {
                    var fit = SparseLinearTrainer.FitLogistic(feats, yMiss, split.TempTrainIdx, split.BlockIds, out _);
                    var pTest = SparseLinearTrainer.PredictLogisticMissProb(fit, feats, split.TempTestIdx);
                    tempM = EvaluateSlice(yMiss, pTest, split.TempTestIdx);
                }
                models[name + "-Linear"] = new PassNoIntensityMetrics(mPos, prNeg, tempM);
            }

            var (colNames, cols) = gbdtMatrixFn();
            var oofGbdt = RunGbdtClassificationSpatialCv(colNames, cols, yMiss, split.Folds, split.BlockIds, out _);
            var pHitGbdt = oofGbdt.Select(p => 1.0 - p).ToArray();
            var mPosG = EvaluationMetrics.EvaluateBinary(yMiss, oofGbdt);
            var prNegG = EvaluationMetrics.ComputePrAuc(yHit, pHitGbdt);
            ClassificationMetrics? tempG = null;
            if (split.TempTrainIdx.Length >= 50 && split.TempTestIdx.Length >= 30)
            {
                var (maxTrees, minChild, lr) = GbdtParams(split.TempTrainIdx.Length);
                var ds = QuantileBinnedDataset.FitAndTransform(colNames, cols, split.TempTrainIdx);
                var gm = HistogramGbdtModel.Train(ds, yMiss, split.TempTrainIdx, split.BlockIds, GbdtObjective.BinaryLogLoss,
                    maxTrees: maxTrees, minChildWeight: minChild, learningRate: lr);
                var pTest = gm.Predict(ds, split.TempTestIdx);
                tempG = EvaluateSlice(yMiss, pTest, split.TempTestIdx);
            }
            models[name + "-GBDT"] = new PassNoIntensityMetrics(mPosG, prNegG, tempG);
            Console.WriteLine($"  [{name,-24} GBDT] AUC={mPosG.RocAuc:F4} PR(AbsPos)={mPosG.PrAuc:F4} PR(AbsNeg)={prNegG:F4}");
        }

        RunPairTier("GeometryOnly", true,
            r => FeatureExtractor.EncodePairDetectionBinned(r, includeIntensity: false, includeLandCover: false, includePass2Geometry: true, includeWeatherT1: false, includeWeatherT2AndInteractions: false),
            () => FeatureExtractor.BuildPairContinuousMatrix(rows, includeIntensity: false, includeLandCover: false, includePass2Geometry: true, includeWeatherT1: false, includeWeatherT2: false));

        RunPairTier("WeatherOnly", false, null,
            () => BuildPairWeatherOnlyMatrix(rows));

        RunPairTier("Geometry+Weather", true,
            r => FeatureExtractor.EncodePairDetectionBinned(r, includeIntensity: false, includeLandCover: false, includePass2Geometry: true, includeWeatherT1: true, includeWeatherT2AndInteractions: true),
            () => FeatureExtractor.BuildPairContinuousMatrix(rows, includeIntensity: false, includeLandCover: false, includePass2Geometry: true, includeWeatherT1: true, includeWeatherT2: true));

        RunPairTier("Geometry+Weather+LC", true,
            r => FeatureExtractor.EncodePairDetectionBinned(r, includeIntensity: false, includeLandCover: true, includePass2Geometry: true, includeWeatherT1: true, includeWeatherT2AndInteractions: true),
            () => FeatureExtractor.BuildPairContinuousMatrix(rows, includeIntensity: false, includeLandCover: true, includePass2Geometry: true, includeWeatherT1: true, includeWeatherT2: true));

        var missRate = 100.0 * rows.Count(r => r.PrimaryMiss == 1) / rows.Count;
        return new PassLevelNoIntensityStudy(direction, rows.Count, Math.Round(missRate, 2), Math.Round(100.0 - missRate, 2), models);
    }

    private static List<SpotBinaryCohortStudy> RunSpotAbsenceStudies(
        List<EnrichedSpotRecord> allSpots,
        CancellationToken cancellationToken)
    {
        var results = new List<SpotBinaryCohortStudy>();

        void RunCohort(
            string cohortName,
            string targetName,
            List<EnrichedSpotRecord> subset,
            Func<EnrichedSpotRecord, double> targetFn,
            bool is12hCohort = false,
            bool includeSingleSensorOnly = false)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (subset.Count < 200) return;
            var n = subset.Count;
            var y = new double[n];
            var lats = new double[n];
            var lons = new double[n];
            var ts = new long[n];
            for (var i = 0; i < n; i++)
            {
                y[i] = targetFn(subset[i]);
                lats[i] = subset[i].Latitude;
                lons[i] = subset[i].Longitude;
                ts[i] = subset[i].TimestampMs;
            }

            var (folds, blockIds, blockCount) = CrossValidationSplit.AssignSpatialBlockFolds(lats, lons, y, 5);
            var (tempTrain, tempTest, _) = CrossValidationSplit.BuildTemporalHoldout(ts);
            Console.WriteLine($"\n  Cohort {cohortName} (N={n:N0}, positive={100.0 * y.Average():F1}%):");

            var models = new Dictionary<string, ClassificationEvalPair>(StringComparer.Ordinal);
            var oofStore = new Dictionary<string, double[]>(StringComparer.Ordinal);
            List<NamedFeatureGain> lastFeatureGains = [];

            void EvalSpotBinary(string tier, bool acqGeom, bool schedGeom, bool weather, bool lc, bool runLinear)
            {
                if (runLinear)
                {
                    var feats = subset.Select(r => FeatureExtractor.EncodeSpotBinned(
                        r, includeAcquisitionGeom: acqGeom, includeScheduleGeom: is12hCohort ? false : schedGeom,
                        includeWeather: weather, includeLandCover: lc, includeSensorMeta: !includeSingleSensorOnly)).ToArray();
                    if (is12hCohort && schedGeom)
                    {
                        for (var i = 0; i < n; i++)
                            feats[i] = [.. feats[i], $"cand12h={subset[i].SettledTotalPasses12h}"];
                    }
                    var oofLin = RunLinearClassificationSpatialCv(feats, y, folds, blockIds);
                    var mLin = EvaluationMetrics.EvaluateBinary(y, oofLin);
                    ClassificationMetrics? tempLin = null;
                    if (tempTrain.Length >= 50 && tempTest.Length >= 30)
                    {
                        var fit = SparseLinearTrainer.FitLogistic(feats, y, tempTrain, blockIds, out _);
                        tempLin = EvaluateSlice(y, SparseLinearTrainer.PredictLogisticMissProb(fit, feats, tempTest), tempTest);
                    }
                    models[tier + "-Linear"] = new ClassificationEvalPair(mLin, tempLin);
                }

                var (colNames, cols) = FeatureExtractor.BuildSpotContinuousMatrix(
                    subset, includeAcquisitionGeom: acqGeom, includeScheduleGeom: is12hCohort ? false : schedGeom,
                    includeWeather: weather, includeLandCover: lc, includeSensorMeta: !includeSingleSensorOnly);
                if (is12hCohort && schedGeom)
                {
                    colNames = [.. colNames, "cand_total_12h"];
                    cols = [.. cols, subset.Select(r => (double)r.SettledTotalPasses12h).ToArray()];
                }

                var oofGbdt = RunGbdtClassificationSpatialCv(colNames, cols, y, folds, blockIds, out var gains);
                oofStore[tier + "-GBDT"] = oofGbdt;
                var mGbdt = EvaluationMetrics.EvaluateBinary(y, oofGbdt);
                ClassificationMetrics? tempGbdt = null;
                if (tempTrain.Length >= 50 && tempTest.Length >= 30)
                {
                    var (maxTrees, minChild, lr) = GbdtParams(tempTrain.Length);
                    var ds = QuantileBinnedDataset.FitAndTransform(colNames, cols, tempTrain);
                    var m = HistogramGbdtModel.Train(ds, y, tempTrain, blockIds, GbdtObjective.BinaryLogLoss,
                        maxTrees: maxTrees, minChildWeight: minChild, learningRate: lr);
                    tempGbdt = EvaluateSlice(y, m.Predict(ds, tempTest), tempTest);
                }
                models[tier + "-GBDT"] = new ClassificationEvalPair(mGbdt, tempGbdt);
                if (tier is "Geometry+Weather" or "Geometry+Weather+LC")
                    lastFeatureGains = NormalizeTopFeatures(colNames, gains, 12);

                Console.WriteLine($"    [{tier,-22}] GBDT AUC={mGbdt.RocAuc:F4} PR={mGbdt.PrAuc:F4} LL={mGbdt.LogLoss:F4}" +
                                  (models.TryGetValue(tier + "-Linear", out var lm) ? $" | Linear AUC={lm.SpatialCv.RocAuc:F4}" : ""));
            }

            EvalSpotBinary("AcqGeometryOnly", true, false, false, false, runLinear: false);
            EvalSpotBinary("FullGeometryOnly", true, true, false, false, runLinear: true);
            EvalSpotBinary("WeatherOnly", false, false, true, false, runLinear: true);
            EvalSpotBinary("Geometry+Weather", true, true, true, false, runLinear: true);
            EvalSpotBinary("Geometry+Weather+LC", true, true, true, true, runLinear: true);

            var bootDelta = BootstrapAucDelta(y, blockIds, folds, oofStore["Geometry+Weather-GBDT"], oofStore["FullGeometryOnly-GBDT"]);
            var posCount = (int)y.Count(v => v >= 0.5);
            results.Add(new SpotBinaryCohortStudy(
                cohortName, targetName, n, posCount, Math.Round(100.0 * posCount / n, 2),
                blockCount, tempTrain.Length, tempTest.Length, models, bootDelta, lastFeatureGains));
        }

        var settled6h = allSpots.Where(s => s.Settled6hAll && s.SettledTotalPasses6h >= 1).ToList();
        var settled6hModis = settled6h.Where(s => s.Instrument == "modis").ToList();
        var settled6hViirs = settled6h.Where(s => s.Instrument == "viirs").ToList();
        var settled6hSame = allSpots.Where(s => s.Settled6hAll && s.SettledSameFamilyPasses6h >= 1).ToList();
        var settled6hSingle = settled6h.Where(s => s.SettledTotalPasses6h == 1).ToList();
        var settled12h = allSpots.Where(s => s.Settled12hSymmetric && s.SettledTotalPasses12h >= 1).ToList();

        // 1-4: Absence of positive detections
        RunCohort("AbsenceOfPositive_6h_Pooled", "PositiveTotalPasses6h==0", settled6h, r => r.PositiveTotalPasses6h == 0 ? 1.0 : 0.0);
        RunCohort("AbsenceOfPositive_6h_Modis", "PositiveTotalPasses6h==0", settled6hModis, r => r.PositiveTotalPasses6h == 0 ? 1.0 : 0.0, includeSingleSensorOnly: true);
        RunCohort("AbsenceOfPositive_6h_Viirs", "PositiveTotalPasses6h==0", settled6hViirs, r => r.PositiveTotalPasses6h == 0 ? 1.0 : 0.0, includeSingleSensorOnly: true);
        RunCohort("AbsenceOfPositive_6h_SameFamily", "PositiveSameFamilyPasses6h==0", settled6hSame, r => r.PositiveSameFamilyPasses6h == 0 ? 1.0 : 0.0);

        // 5-8: Absence of negative detections
        RunCohort("AbsenceOfNegative_6h_Pooled", "NegativeTotalPasses6h==0", settled6h, r => r.NegativeTotalPasses6h == 0 ? 1.0 : 0.0);
        RunCohort("AbsenceOfNegative_6h_Modis", "NegativeTotalPasses6h==0", settled6hModis, r => r.NegativeTotalPasses6h == 0 ? 1.0 : 0.0, includeSingleSensorOnly: true);
        RunCohort("AbsenceOfNegative_6h_Viirs", "NegativeTotalPasses6h==0", settled6hViirs, r => r.NegativeTotalPasses6h == 0 ? 1.0 : 0.0, includeSingleSensorOnly: true);
        RunCohort("AbsenceOfNegative_6h_SinglePass", "NegativeTotalPasses6h==0", settled6hSingle, r => r.NegativeTotalPasses6h == 0 ? 1.0 : 0.0);

        // 9-10: Symmetric 12h sensitivity checks
        RunCohort("AbsenceOfPositive_12h_Pooled", "PositiveTotalPasses12h==0", settled12h, r => r.PositiveTotalPasses12h == 0 ? 1.0 : 0.0, is12hCohort: true);
        RunCohort("AbsenceOfNegative_12h_Pooled", "NegativeTotalPasses12h==0", settled12h, r => r.NegativeTotalPasses12h == 0 ? 1.0 : 0.0, is12hCohort: true);

        return results;
    }

    private static List<SpotFrpCohortStudy> RunDirectSpotFrpStudies(
        List<EnrichedSpotRecord> allSpots,
        CancellationToken cancellationToken)
    {
        var results = new List<SpotFrpCohortStudy>();

        void RunFrpCohort(string cohortName, List<EnrichedSpotRecord> subset, bool includeSensorMeta)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (subset.Count < 200) return;
            var n = subset.Count;
            var yLog1p = new double[n];
            var yMw = new double[n];
            var yHigh50 = new double[n];
            var lats = new double[n];
            var lons = new double[n];
            var ts = new long[n];
            for (var i = 0; i < n; i++)
            {
                var mw = Math.Max(0.0, subset[i].FrpMw);
                yMw[i] = mw;
                yLog1p[i] = MathUtil.Log1p(mw);
                yHigh50[i] = mw >= 50.0 ? 1.0 : 0.0;
                lats[i] = subset[i].Latitude;
                lons[i] = subset[i].Longitude;
                ts[i] = subset[i].TimestampMs;
            }

            var (folds, blockIds, blockCount) = CrossValidationSplit.AssignSpatialBlockFolds(lats, lons, yLog1p, 5);
            var (tempTrain, tempTest, _) = CrossValidationSplit.BuildTemporalHoldout(ts);
            Console.WriteLine($"\n  Direct Spot FRP Cohort {cohortName} (N={n:N0}, median={Median(yMw):F1} MW, >=50MW={100.0 * yHigh50.Average():F1}%):");

            // Baseline: fold median MW
            var oofConstLog = new double[n];
            var oofConstMw = new double[n];
            for (var f = 0; f < 5; f++)
            {
                var tr = Enumerable.Range(0, n).Where(i => folds[i] != f).Select(i => yLog1p[i]).OrderBy(v => v).ToArray();
                var med = tr.Length > 0 ? tr[tr.Length / 2] : 0.0;
                for (var i = 0; i < n; i++)
                    if (folds[i] == f) { oofConstLog[i] = med; oofConstMw[i] = MathUtil.Expm1(med); }
            }

            var models = new Dictionary<string, RegressionEvalPair>(StringComparer.Ordinal);
            var highModels = new Dictionary<string, ClassificationEvalPair>(StringComparer.Ordinal);
            var oofMwStore = new Dictionary<string, double[]>(StringComparer.Ordinal);
            var oofLogStore = new Dictionary<string, double[]>(StringComparer.Ordinal);
            var allIdx = Enumerable.Range(0, n).ToArray();

            RegressionMetrics EvalRegSlice(int[] idx, double[] pLog)
            {
                var al = new double[idx.Length];
                var am = new double[idx.Length];
                var pm = new double[idx.Length];
                var bm = new double[idx.Length];
                for (var k = 0; k < idx.Length; k++)
                {
                    var i = idx[k];
                    al[k] = yLog1p[i];
                    am[k] = yMw[i];
                    var clampedLog = Math.Max(0.0, pLog[k]);
                    pLog[k] = clampedLog;
                    pm[k] = MathUtil.Expm1(clampedLog);
                    bm[k] = oofConstMw[i];
                }
                return EvaluationMetrics.EvaluateFrpRegression(al, pLog, am, pm, bm);
            }

            models["ConstantMedian"] = new RegressionEvalPair(EvalRegSlice(allIdx, (double[])oofConstLog.Clone()), null);
            List<NamedFeatureGain> lastGains = [];

            void RunTier(string tier, bool acqGeom, bool weather, bool lc, bool runLinear, bool runHighFrp)
            {
                if (runLinear)
                {
                    var feats = subset.Select(r => FeatureExtractor.EncodeSpotBinned(
                        r, includeAcquisitionGeom: acqGeom, includeScheduleGeom: false,
                        includeWeather: weather, includeLandCover: lc, includeSensorMeta: includeSensorMeta)).ToArray();
                    var oofL = RunLinearHuberSpatialCv(feats, yLog1p, folds, blockIds);
                    var mL = EvalRegSlice(allIdx, oofL);
                    RegressionMetrics? tL = null;
                    if (tempTrain.Length >= 50 && tempTest.Length >= 30)
                    {
                        var fit = SparseLinearTrainer.FitHuber(feats, yLog1p, tempTrain, blockIds);
                        tL = EvalRegSlice(tempTest, SparseLinearTrainer.PredictHuber(fit, feats, tempTest));
                    }
                    models[tier + "-Linear"] = new RegressionEvalPair(mL, tL);
                }

                var (colNames, cols) = FeatureExtractor.BuildSpotContinuousMatrix(
                    subset, includeAcquisitionGeom: acqGeom, includeScheduleGeom: false,
                    includeWeather: weather, includeLandCover: lc, includeSensorMeta: includeSensorMeta);
                if (colNames.Length == 0) return;

                var oofG = RunGbdtHuberSpatialCv(colNames, cols, yLog1p, folds, blockIds, out var gains);
                oofLogStore[tier + "-GBDT"] = oofG.Select(v => Math.Max(0.0, v)).ToArray();
                oofMwStore[tier + "-GBDT"] = oofLogStore[tier + "-GBDT"].Select(MathUtil.Expm1).ToArray();
                var mG = EvalRegSlice(allIdx, (double[])oofG.Clone());
                RegressionMetrics? tG = null;
                if (tempTrain.Length >= 50 && tempTest.Length >= 30)
                {
                    var (maxTrees, minChild, lr) = GbdtParams(tempTrain.Length);
                    var ds = QuantileBinnedDataset.FitAndTransform(colNames, cols, tempTrain);
                    var gm = HistogramGbdtModel.Train(ds, yLog1p, tempTrain, blockIds, GbdtObjective.Huber,
                        maxTrees: maxTrees, minChildWeight: minChild, learningRate: lr);
                    tG = EvalRegSlice(tempTest, gm.Predict(ds, tempTest));
                }
                models[tier + "-GBDT"] = new RegressionEvalPair(mG, tG);
                if (tier is "Geometry+Weather" or "Geometry+Weather+LC")
                    lastGains = NormalizeTopFeatures(colNames, gains, 12);

                if (runHighFrp)
                {
                    var oofH = RunGbdtClassificationSpatialCv(colNames, cols, yHigh50, folds, blockIds, out _);
                    var mh = EvaluationMetrics.EvaluateBinary(yHigh50, oofH);
                    ClassificationMetrics? th = null;
                    if (tempTrain.Length >= 50 && tempTest.Length >= 30)
                    {
                        var (maxTrees, minChild, lr) = GbdtParams(tempTrain.Length);
                        var ds = QuantileBinnedDataset.FitAndTransform(colNames, cols, tempTrain);
                        var hm = HistogramGbdtModel.Train(ds, yHigh50, tempTrain, blockIds, GbdtObjective.BinaryLogLoss,
                            maxTrees: maxTrees, minChildWeight: minChild, learningRate: lr);
                        th = EvaluateSlice(yHigh50, hm.Predict(ds, tempTest), tempTest);
                    }
                    highModels[tier + "-GBDT"] = new ClassificationEvalPair(mh, th);
                }

                Console.WriteLine($"    [{tier,-22}] GBDT R2={mG.Log1pR2:F4} rho={mG.SpearmanRho:F4} logMAE={mG.Log1pMae:F4} mwMAE={mG.MwMae:F2}" +
                                  (highModels.TryGetValue(tier + "-GBDT", out var hm2) ? $" | >=50MW AUC={hm2.SpatialCv.RocAuc:F4}" : ""));
            }

            // Sensor + Day/Night simple baseline (Linear only cleanly represents sat/inst/dn)
            var sdnFeats = subset.Select(r => new[] { $"sat={r.Satellite}", $"inst={r.Instrument}", $"dn={r.DayNight}" }).ToArray();
            var oofSdn = RunLinearHuberSpatialCv(sdnFeats, yLog1p, folds, blockIds);
            models["SensorDayNight-Linear"] = new RegressionEvalPair(EvalRegSlice(allIdx, oofSdn), null);

            RunTier("GeometryOnly", acqGeom: true, weather: false, lc: false, runLinear: true, runHighFrp: true);
            RunTier("WeatherOnly", acqGeom: false, weather: true, lc: false, runLinear: true, runHighFrp: true);
            RunTier("Geometry+Weather", acqGeom: true, weather: true, lc: false, runLinear: true, runHighFrp: true);
            RunTier("Geometry+Weather+LC", acqGeom: true, weather: true, lc: true, runLinear: true, runHighFrp: true);

            var bootLog = BootstrapNegMaeDelta(yLog1p, blockIds, folds, oofLogStore["Geometry+Weather-GBDT"], oofLogStore["GeometryOnly-GBDT"]);
            var bootMw = BootstrapNegMaeDelta(yMw, blockIds, folds, oofMwStore["Geometry+Weather-GBDT"], oofMwStore["GeometryOnly-GBDT"]);

            results.Add(new SpotFrpCohortStudy(
                cohortName, n, Median(yMw), Math.Round(100.0 * yHigh50.Average(), 2),
                blockCount, tempTrain.Length, tempTest.Length, models, highModels, bootLog, bootMw, lastGains));
        }

        RunFrpCohort("SpotFrp_Modis", allSpots.Where(s => s.Instrument == "modis" && s.FrpMw >= 0).ToList(), includeSensorMeta: true);
        RunFrpCohort("SpotFrp_Viirs", allSpots.Where(s => s.Instrument == "viirs" && s.FrpMw >= 0).ToList(), includeSensorMeta: true);
        RunFrpCohort("SpotFrp_Pooled", allSpots.Where(s => s.FrpMw >= 0).ToList(), includeSensorMeta: true);
        return results;
    }

    private static MatchedPass2FrpNoFrp1Study RunMatchedPass2FrpWithoutFrp1(
        string direction,
        List<PassPairRecord> rows)
    {
        var n = rows.Count;
        var yLog2 = rows.Select(r => MathUtil.Log1p(Math.Max(0.0, r.Frp2!.Value))).ToArray();
        var yMw2 = rows.Select(r => r.Frp2!.Value).ToArray();
        var lats = rows.Select(r => r.Latitude).ToArray();
        var lons = rows.Select(r => r.Longitude).ToArray();
        var (folds, blockIds, _) = CrossValidationSplit.AssignSpatialBlockFolds(lats, lons, yLog2, 5);

        var outModels = new Dictionary<string, RegressionMetrics>(StringComparer.Ordinal);
        void Eval(string label, Func<(string[] Names, double[][] Columns)> matrixFn)
        {
            var (colNames, cols) = matrixFn();
            var oof = RunGbdtHuberSpatialCv(colNames, cols, yLog2, folds, blockIds, out _);
            var pLog = oof.Select(v => Math.Max(0.0, v)).ToArray();
            var pMw = pLog.Select(MathUtil.Expm1).ToArray();
            outModels[label] = EvaluationMetrics.EvaluateFrpRegression(yLog2, pLog, yMw2, pMw, rows.Select(r => r.Frp1).ToArray());
            Console.WriteLine($"  [{label,-24} Pass2-NoFrp1] R2={outModels[label].Log1pR2:F4} logMAE={outModels[label].Log1pMae:F4} MW_MAE={outModels[label].MwMae:F2}");
        }

        Eval("GeometryOnly-GBDT", () => FeatureExtractor.BuildPairContinuousMatrix(rows, false, false, true, false, false));
        Eval("WeatherOnly-GBDT", () => BuildPairWeatherOnlyMatrix(rows));
        Eval("Geometry+Weather-GBDT", () => FeatureExtractor.BuildPairContinuousMatrix(rows, false, false, true, true, true));
        Eval("Geom+Weather+LC-GBDT", () => FeatureExtractor.BuildPairContinuousMatrix(rows, false, true, true, true, true));

        return new MatchedPass2FrpNoFrp1Study(direction, n, outModels);
    }

    private static Dictionary<string, object> FitAndMaybeExportUiModels(
        List<PassPairRecord> allPairs,
        string? updateUiModelsDir)
    {
        var metadata = new Dictionary<string, object>(StringComparer.Ordinal);
        var frpUiExport = new Dictionary<string, object>(StringComparer.Ordinal);

        foreach (var dir in Directions)
        {
            var hitRows = allPairs.Where(p => p.Direction == dir && p.PrimaryHit == 1 && p.LogFrpChange.HasValue).ToList();
            var yDelta = hitRows.Select(r => r.LogFrpChange!.Value).ToArray();
            var blockIds = hitRows.Select(r => CrossValidationSplit.BlockKey(r.Latitude, r.Longitude)).ToArray();
            var allIdx = Enumerable.Range(0, hitRows.Count).ToArray();

            var featsNoW = hitRows.Select(r => FeatureExtractor.EncodePairFrpBinned(r, false, false, false)).ToArray();
            var fitNoW = SparseLinearTrainer.FitHuber(featsNoW, yDelta, allIdx, blockIds);
            // Retain observed satellite-pair tokens so frpForecast.ts Object.hasOwn check never drops an observed pair.
            foreach (var pTok in featsNoW.SelectMany(f => f).Where(f => f.StartsWith("pair=", StringComparison.Ordinal)).Distinct())
                fitNoW.Coefficients.TryAdd(pTok, 0.0);

            frpUiExport[dir] = new
            {
                intercept = fitNoW.Intercept,
                coefficients = fitNoW.Coefficients,
            };

            var featsW1 = hitRows.Select(r => FeatureExtractor.EncodePairFrpBinned(r, false, true, false)).ToArray();
            var fitW1 = SparseLinearTrainer.FitHuber(featsW1, yDelta, allIdx, blockIds);
            foreach (var pTok in featsW1.SelectMany(f => f).Where(f => f.StartsWith("pair=", StringComparison.Ordinal)).Distinct())
                fitW1.Coefficients.TryAdd(pTok, 0.0);

            metadata[$"frp_{dir}"] = new
            {
                sampleCount = hitRows.Count,
                noWeatherAlpha = fitNoW.SelectedAlpha,
                noWeatherNonZeroFeatures = fitNoW.Coefficients.Count,
                weatherT1Alpha = fitW1.SelectedAlpha,
                weatherT1NonZeroFeatures = fitW1.Coefficients.Count,
                weatherT1Model = new
                {
                    intercept = fitW1.Intercept,
                    coefficients = fitW1.Coefficients,
                },
            };
        }

        object? viirsDetExport = null;
        foreach (var dir in Directions)
        {
            var dirRows = allPairs.Where(p => p.Direction == dir).ToList();
            var yMiss = dirRows.Select(r => (double)r.PrimaryMiss).ToArray();
            var blockIds = dirRows.Select(r => CrossValidationSplit.BlockKey(r.Latitude, r.Longitude)).ToArray();
            var allIdx = Enumerable.Range(0, dirRows.Count).ToArray();

            var featsNoW = dirRows.Select(r => FeatureExtractor.EncodePairDetectionBinned(r, true, true, false, false, false)).ToArray();
            var fitNoW = SparseLinearTrainer.FitLogistic(featsNoW, yMiss, allIdx, blockIds, out _);

            var featsW1 = dirRows.Select(r => FeatureExtractor.EncodePairDetectionBinned(r, true, true, false, true, false)).ToArray();
            var fitW1 = SparseLinearTrainer.FitLogistic(featsW1, yMiss, allIdx, blockIds, out _);

            if (dir == "viirs-viirs")
            {
                viirsDetExport = new
                {
                    missIntercept = fitNoW.Intercept,
                    detectionCalibration = new
                    {
                        bias = fitNoW.CalibrationBias,
                        slope = fitNoW.CalibrationSlope,
                    },
                    coefficients = fitNoW.Coefficients,
                };
            }

            metadata[$"det_{dir}"] = new
            {
                sampleCount = dirRows.Count,
                noWeatherAlpha = fitNoW.SelectedAlpha,
                calibrationBias = fitNoW.CalibrationBias,
                calibrationSlope = fitNoW.CalibrationSlope,
                noWeatherNonZeroFeatures = fitNoW.Coefficients.Count,
                weatherT1Alpha = fitW1.SelectedAlpha,
                weatherT1NonZeroFeatures = fitW1.Coefficients.Count,
                weatherT1Model = new
                {
                    missIntercept = fitW1.Intercept,
                    detectionCalibration = new
                    {
                        bias = fitW1.CalibrationBias,
                        slope = fitW1.CalibrationSlope,
                    },
                    coefficients = fitW1.Coefficients,
                },
            };
        }

        if (!string.IsNullOrWhiteSpace(updateUiModelsDir))
        {
            Directory.CreateDirectory(updateUiModelsDir);
            var jsonOpts = new JsonSerializerOptions { WriteIndented = true };
            var frpPath = Path.Combine(updateUiModelsDir, "frp-forecast-coefficients.json");
            File.WriteAllText(frpPath, JsonSerializer.Serialize(frpUiExport, jsonOpts));
            Console.WriteLine($"[UI Export] Updated {frpPath}");

            if (viirsDetExport is not null)
            {
                var detPath = Path.Combine(updateUiModelsDir, "viirs-detection-model.json");
                File.WriteAllText(detPath, JsonSerializer.Serialize(viirsDetExport, jsonOpts));
                Console.WriteLine($"[UI Export] Updated {detPath}");
            }
        }

        return metadata;
    }

    private static (string[] Names, double[][] Columns) BuildPairWeatherOnlyMatrix(IReadOnlyList<PassPairRecord> rows)
    {
        var (fullNames, fullCols) = FeatureExtractor.BuildPairContinuousMatrix(
            rows, includeIntensity: false, includeLandCover: false,
            includePass2Geometry: false, includeWeatherT1: true, includeWeatherT2: true);
        var keep = new List<int>(fullNames.Length);
        for (var i = 0; i < fullNames.Length; i++)
        {
            if (fullNames[i].StartsWith("w1_", StringComparison.Ordinal) ||
                fullNames[i].StartsWith("w2_", StringComparison.Ordinal) ||
                fullNames[i].StartsWith("w_", StringComparison.Ordinal) ||
                fullNames[i] is "src_modis" or "tgt_modis" or "sat1_code" or "sat2_code")
            {
                keep.Add(i);
            }
        }
        return (keep.Select(i => fullNames[i]).ToArray(), keep.Select(i => fullCols[i]).ToArray());
    }

    private static double[] RunLinearClassificationSpatialCv(string[][] feats, double[] y, int[] folds, int[] blockIds)
    {
        var n = y.Length;
        var oof = new double[n];
        for (var f = 0; f < 5; f++)
        {
            SplitIndices(folds, f, out var tr, out var te);
            if (tr.Length == 0 || te.Length == 0) continue;
            var fit = SparseLinearTrainer.FitLogistic(feats, y, tr, blockIds, out _);
            var preds = SparseLinearTrainer.PredictLogisticMissProb(fit, feats, te);
            for (var k = 0; k < te.Length; k++) oof[te[k]] = preds[k];
        }
        return oof;
    }

    private static double[] RunLinearHuberSpatialCv(string[][] feats, double[] y, int[] folds, int[] blockIds)
    {
        var n = y.Length;
        var oof = new double[n];
        for (var f = 0; f < 5; f++)
        {
            SplitIndices(folds, f, out var tr, out var te);
            if (tr.Length == 0 || te.Length == 0) continue;
            var fit = SparseLinearTrainer.FitHuber(feats, y, tr, blockIds);
            var preds = SparseLinearTrainer.PredictHuber(fit, feats, te);
            for (var k = 0; k < te.Length; k++) oof[te[k]] = preds[k];
        }
        return oof;
    }

    private static double[] RunGbdtClassificationSpatialCv(
        string[] colNames, double[][] cols, double[] y, int[] folds, int[] blockIds, out double[] totalGains)
    {
        var n = y.Length;
        var oof = new double[n];
        totalGains = new double[colNames.Length];
        for (var f = 0; f < 5; f++)
        {
            SplitIndices(folds, f, out var tr, out var te);
            if (tr.Length == 0 || te.Length == 0) continue;
            var (maxTrees, minChild, lr) = GbdtParams(tr.Length);
            var ds = QuantileBinnedDataset.FitAndTransform(colNames, cols, tr);
            var m = HistogramGbdtModel.Train(ds, y, tr, blockIds, GbdtObjective.BinaryLogLoss,
                maxTrees: maxTrees, minChildWeight: minChild, learningRate: lr, seed: 20261115 + f);
            var preds = m.Predict(ds, te);
            for (var k = 0; k < te.Length; k++) oof[te[k]] = preds[k];
            for (var j = 0; j < totalGains.Length; j++) totalGains[j] += m.FeatureGainImportance[j];
        }
        return oof;
    }

    private static double[] RunGbdtHuberSpatialCv(
        string[] colNames, double[][] cols, double[] y, int[] folds, int[] blockIds, out double[] totalGains)
    {
        var n = y.Length;
        var oof = new double[n];
        totalGains = new double[colNames.Length];
        for (var f = 0; f < 5; f++)
        {
            SplitIndices(folds, f, out var tr, out var te);
            if (tr.Length == 0 || te.Length == 0) continue;
            var (maxTrees, minChild, lr) = GbdtParams(tr.Length);
            var ds = QuantileBinnedDataset.FitAndTransform(colNames, cols, tr);
            var m = HistogramGbdtModel.Train(ds, y, tr, blockIds, GbdtObjective.Huber,
                maxTrees: maxTrees, minChildWeight: minChild, learningRate: lr, seed: 20261115 + f);
            var preds = m.Predict(ds, te);
            for (var k = 0; k < te.Length; k++) oof[te[k]] = preds[k];
            for (var j = 0; j < totalGains.Length; j++) totalGains[j] += m.FeatureGainImportance[j];
        }
        return oof;
    }

    private static (int MaxTrees, double MinChildWeight, double LearningRate) GbdtParams(int trainCount) =>
        trainCount > 80_000 ? (150, 40.0, 0.06) : (200, 20.0, 0.05);

    private static void SplitIndices(int[] folds, int testFold, out int[] train, out int[] test)
    {
        var tr = new List<int>(folds.Length * 4 / 5);
        var te = new List<int>(folds.Length / 5);
        for (var i = 0; i < folds.Length; i++)
        {
            if (folds[i] == testFold) te.Add(i);
            else tr.Add(i);
        }
        train = [.. tr];
        test = [.. te];
    }

    private static ClassificationMetrics EvaluateSlice(double[] yAll, double[] predsSlice, int[] idxSlice)
    {
        var ySub = new double[idxSlice.Length];
        for (var k = 0; k < idxSlice.Length; k++) ySub[k] = yAll[idxSlice[k]];
        return EvaluationMetrics.EvaluateBinary(ySub, predsSlice);
    }

    private static int CountViirs1kmRecovery(List<PassPairRecord> rows, double[] missProb, double threshold)
    {
        var count = 0;
        for (var i = 0; i < rows.Count; i++)
        {
            if (1.0 - missProb[i] >= threshold && rows[i].PrimaryMiss == 1 && rows[i].Hit1km == 1)
                count++;
        }
        return count;
    }

    private static BlockBootstrapDelta BootstrapAucDelta(double[] y, int[] blockIds, int[] folds, double[] cand, double[] basePred) =>
        EvaluationMetrics.ComparePairedByBlock(
            blockIds, folds,
            idx => SliceAuc(y, cand, idx),
            idx => SliceAuc(y, basePred, idx));

    private static BlockBootstrapDelta BootstrapNegLogLossDelta(double[] y, int[] blockIds, int[] folds, double[] cand, double[] basePred) =>
        EvaluationMetrics.ComparePairedByBlock(
            blockIds, folds,
            idx => -SliceLogLoss(y, cand, idx),
            idx => -SliceLogLoss(y, basePred, idx));

    private static BlockBootstrapDelta BootstrapNegMaeDelta(double[] y, int[] blockIds, int[] folds, double[] cand, double[] basePred) =>
        EvaluationMetrics.ComparePairedByBlock(
            blockIds, folds,
            idx => -SliceMae(y, cand, idx),
            idx => -SliceMae(y, basePred, idx));

    private static double SliceAuc(double[] y, double[] p, int[] idx)
    {
        var ys = new double[idx.Length];
        var ps = new double[idx.Length];
        for (var k = 0; k < idx.Length; k++) { ys[k] = y[idx[k]]; ps[k] = p[idx[k]]; }
        return EvaluationMetrics.ComputeRocAuc(ys, ps);
    }

    private static double SliceLogLoss(double[] y, double[] p, int[] idx)
    {
        var ll = 0.0;
        for (var k = 0; k < idx.Length; k++)
        {
            var i = idx[k];
            var prob = Math.Clamp(p[i], 1e-7, 1.0 - 1e-7);
            ll -= y[i] >= 0.5 ? Math.Log(prob) : Math.Log(1.0 - prob);
        }
        return ll / Math.Max(1, idx.Length);
    }

    private static double SliceMae(double[] y, double[] p, int[] idx)
    {
        var sum = 0.0;
        for (var k = 0; k < idx.Length; k++)
            sum += Math.Abs(p[idx[k]] - y[idx[k]]);
        return sum / Math.Max(1, idx.Length);
    }

    private static List<NamedFeatureGain> NormalizeTopFeatures(string[] names, double[] gains, int topK)
    {
        var total = gains.Sum();
        if (total <= 1e-12) return [];
        return Enumerable.Range(0, names.Length)
            .Select(i => new NamedFeatureGain(names[i], Math.Round(100.0 * gains[i] / total, 2)))
            .Where(x => x.SharePct > 0.0)
            .OrderByDescending(x => x.SharePct)
            .Take(topK)
            .ToList();
    }

    private static double Median(double[] vals)
    {
        if (vals.Length == 0) return 0.0;
        var s = (double[])vals.Clone();
        Array.Sort(s);
        return s[s.Length / 2];
    }

    private static void PrintConciseSummary(HarmonizationStudyReport r)
    {
        Console.WriteLine("\n================ SUMMARY: WITH VS WITHOUT WEATHER (SPATIAL CV) ================");
        foreach (var dir in Directions)
        {
            var d = r.Suite1Detection[dir];
            var bLin = d.Models["Baseline-NoWeather-Linear"].SpatialCv.RocAuc;
            var w1Lin = d.Models["Weather-t1-Linear"].SpatialCv.RocAuc;
            var w12Lin = d.Models["Weather-t1t2-Interactions-Linear"].SpatialCv.RocAuc;
            var noWG = d.Models["NoWeather-GBDT"].SpatialCv.RocAuc;
            var wG = d.Models["Weather-t1t2-GBDT"].SpatialCv.RocAuc;
            Console.WriteLine($"Det {dir,-11} (N={d.SampleCount,6:N0}): Lin {bLin:F4} -> w1 {w1Lin:F4} -> w1w2 {w12Lin:F4} | GBDT {noWG:F4} -> {wG:F4}");

            var f = r.Suite1ConditionalFrp[dir];
            var ncMw = f.Models["NoChange"].SpatialCv.MwMae;
            var fbLin = f.Models["Baseline-NoWeather-Linear"].SpatialCv.MwMae;
            var fw1Lin = f.Models["Weather-t1-Linear"].SpatialCv.MwMae;
            var fNoG = f.Models["NoWeather-GBDT"].SpatialCv.MwMae;
            var fwG = f.Models["Weather-t1t2-GBDT"].SpatialCv.MwMae;
            Console.WriteLine($"FRP {dir,-11} (N={f.SampleCount,6:N0}): NoChg {ncMw:F2} | Lin {fbLin:F2} -> w1 {fw1Lin:F2} | GBDT {fNoG:F2} -> {fwG:F2} MW");
        }
    }
}
