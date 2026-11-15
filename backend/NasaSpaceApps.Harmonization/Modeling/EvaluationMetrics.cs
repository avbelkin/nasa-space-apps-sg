using System.Text.Json.Serialization;

namespace NasaSpaceApps.Harmonization.Modeling;

public sealed record ClassificationMetrics(
    int Count,
    int PositiveCount,
    double BaseRate,
    double RocAuc,
    double PrAuc,
    double LogLoss,
    double BrierScore,
    double Ece10,
    double HighDetectThreshold,
    int HighDetectCount,
    int HighDetectUnexpectedMisses,
    double HighDetectMeanScore,
    double HighDetectObservedHitRate);

public sealed record RegressionMetrics(
    int Count,
    double TargetMeanLog1p,
    double TargetMedianMw,
    double Log1pMae,
    double Log1pRmse,
    double Log1pR2,
    double PearsonR,
    double SpearmanRho,
    double MwMae,
    double MwMedianAe,
    double? BaselineMwMae,
    double? SkillVsBaselinePct);

public sealed record BlockBootstrapDelta(
    double MeanDelta,
    double Ci95Low,
    double Ci95High,
    int ImprovedFolds,
    int TotalFolds);

internal static class EvaluationMetrics
{
    public static ClassificationMetrics EvaluateBinary(
        ReadOnlySpan<double> yTrueMiss,
        ReadOnlySpan<double> pMissPred,
        double detectThreshold = 0.70)
    {
        var n = yTrueMiss.Length;
        var pos = 0;
        var logLoss = 0.0;
        var brier = 0.0;
        var hdCount = 0;
        var hdMiss = 0;
        var hdScoreSum = 0.0;

        for (var i = 0; i < n; i++)
        {
            var y = yTrueMiss[i] >= 0.5 ? 1 : 0;
            pos += y;
            var p = Math.Clamp(pMissPred[i], 1e-7, 1.0 - 1e-7);
            logLoss -= y == 1 ? Math.Log(p) : Math.Log(1.0 - p);
            var diff = p - y;
            brier += diff * diff;

            var pDetect = 1.0 - p;
            if (pDetect >= detectThreshold)
            {
                hdCount++;
                if (y == 1) hdMiss++;
                hdScoreSum += pDetect;
            }
        }

        var rocAuc = ComputeRocAuc(yTrueMiss, pMissPred);
        var prAuc = ComputePrAuc(yTrueMiss, pMissPred);
        var ece = ComputeEce10(yTrueMiss, pMissPred);

        return new ClassificationMetrics(
            Count: n,
            PositiveCount: pos,
            BaseRate: n > 0 ? (double)pos / n : 0.0,
            RocAuc: rocAuc,
            PrAuc: prAuc,
            LogLoss: n > 0 ? logLoss / n : 0.0,
            BrierScore: n > 0 ? brier / n : 0.0,
            Ece10: ece,
            HighDetectThreshold: detectThreshold,
            HighDetectCount: hdCount,
            HighDetectUnexpectedMisses: hdMiss,
            HighDetectMeanScore: hdCount > 0 ? hdScoreSum / hdCount : 0.0,
            HighDetectObservedHitRate: hdCount > 0 ? (double)(hdCount - hdMiss) / hdCount : 0.0);
    }

    public static RegressionMetrics EvaluateFrpRegression(
        ReadOnlySpan<double> actualLog1p,
        ReadOnlySpan<double> predLog1p,
        ReadOnlySpan<double> actualMw,
        ReadOnlySpan<double> predMw,
        ReadOnlySpan<double> baselinePredMw = default)
    {
        var n = actualLog1p.Length;
        if (n == 0)
            return new RegressionMetrics(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, null, null);

        var sumY = 0.0;
        var sumP = 0.0;
        var absLogErr = 0.0;
        var sqLogErr = 0.0;
        var mwAbsErrs = new double[n];
        var baseAbsSum = 0.0;
        var mwSum = 0.0;
        var mwSorted = new double[n];

        for (var i = 0; i < n; i++)
        {
            var y = actualLog1p[i];
            var p = predLog1p[i];
            sumY += y;
            sumP += p;
            var e = p - y;
            absLogErr += Math.Abs(e);
            sqLogErr += e * e;

            var am = actualMw[i];
            var pm = Math.Max(0.0, predMw[i]);
            mwSum += am;
            mwSorted[i] = am;
            mwAbsErrs[i] = Math.Abs(pm - am);
            if (!baselinePredMw.IsEmpty)
                baseAbsSum += Math.Abs(Math.Max(0.0, baselinePredMw[i]) - am);
        }

        var meanY = sumY / n;
        var meanP = sumP / n;
        var ssTot = 0.0;
        var ssPred = 0.0;
        var cov = 0.0;
        for (var i = 0; i < n; i++)
        {
            var dy = actualLog1p[i] - meanY;
            var dp = predLog1p[i] - meanP;
            ssTot += dy * dy;
            ssPred += dp * dp;
            cov += dy * dp;
        }

        var r2 = ssTot > 1e-12 ? 1.0 - sqLogErr / ssTot : 0.0;
        var pearson = ssTot > 1e-12 && ssPred > 1e-12 ? cov / Math.Sqrt(ssTot * ssPred) : 0.0;
        var spearman = ComputeSpearman(actualLog1p, predLog1p);

        Array.Sort(mwAbsErrs);
        Array.Sort(mwSorted);
        var mwMae = mwAbsErrs.Average();
        var mwMedAe = PercentileSorted(mwAbsErrs, 0.5);
        var targetMed = PercentileSorted(mwSorted, 0.5);

        double? baseMae = baselinePredMw.IsEmpty ? null : baseAbsSum / n;
        double? skillPct = baseMae is { } bm && bm > 1e-9 ? 100.0 * (1.0 - mwMae / bm) : null;

        return new RegressionMetrics(
            Count: n,
            TargetMeanLog1p: meanY,
            TargetMedianMw: targetMed,
            Log1pMae: absLogErr / n,
            Log1pRmse: Math.Sqrt(sqLogErr / n),
            Log1pR2: r2,
            PearsonR: pearson,
            SpearmanRho: spearman,
            MwMae: mwMae,
            MwMedianAe: mwMedAe,
            BaselineMwMae: baseMae,
            SkillVsBaselinePct: skillPct);
    }

    public static BlockBootstrapDelta ComparePairedByBlock(
        int[] blockIds,
        int[] folds,
        Func<int[], double> metricOnIndices,
        Func<int[], double> baselineMetricOnIndices,
        int bootstrapDraws = 400,
        int seed = 20261115)
    {
        var n = blockIds.Length;
        var foldNums = folds.Distinct().OrderBy(f => f).ToArray();
        var improved = 0;
        foreach (var f in foldNums)
        {
            var idx = Enumerable.Range(0, n).Where(i => folds[i] == f).ToArray();
            if (idx.Length == 0) continue;
            var d = metricOnIndices(idx) - baselineMetricOnIndices(idx);
            if (d > 0) improved++;
        }

        var blockRows = new Dictionary<int, List<int>>();
        for (var i = 0; i < n; i++)
        {
            if (!blockRows.TryGetValue(blockIds[i], out var list))
                blockRows[blockIds[i]] = list = [];
            list.Add(i);
        }
        var blocks = blockRows.Values.Select(l => l.ToArray()).ToArray();
        var fullIdx = Enumerable.Range(0, n).ToArray();
        var pointDelta = metricOnIndices(fullIdx) - baselineMetricOnIndices(fullIdx);

        if (blocks.Length < 5)
            return new BlockBootstrapDelta(pointDelta, pointDelta, pointDelta, improved, foldNums.Length);

        var rng = new Random(seed);
        var deltas = new double[bootstrapDraws];
        var sampleIndices = new List<int>(n);
        for (var b = 0; b < bootstrapDraws; b++)
        {
            sampleIndices.Clear();
            for (var k = 0; k < blocks.Length; k++)
                sampleIndices.AddRange(blocks[rng.Next(blocks.Length)]);
            var arr = sampleIndices.ToArray();
            deltas[b] = metricOnIndices(arr) - baselineMetricOnIndices(arr);
        }
        Array.Sort(deltas);
        return new BlockBootstrapDelta(
            pointDelta,
            PercentileSorted(deltas, 0.025),
            PercentileSorted(deltas, 0.975),
            improved,
            foldNums.Length);
    }

    public static double ComputeRocAuc(ReadOnlySpan<double> labels, ReadOnlySpan<double> scores)
    {
        var n = labels.Length;
        var pairs = new (double Score, int Label)[n];
        long posTotal = 0;
        for (var i = 0; i < n; i++)
        {
            var y = labels[i] >= 0.5 ? 1 : 0;
            posTotal += y;
            pairs[i] = (scores[i], y);
        }
        var negTotal = n - posTotal;
        if (posTotal == 0 || negTotal == 0) return 0.5;

        Array.Sort(pairs, (a, b) => a.Score.CompareTo(b.Score));
        var rankSumPos = 0.0;
        for (var i = 0; i < n;)
        {
            var j = i + 1;
            while (j < n && pairs[j].Score == pairs[i].Score) j++;
            var avgRank = 0.5 * ((i + 1) + j);
            for (var k = i; k < j; k++)
                if (pairs[k].Label == 1) rankSumPos += avgRank;
            i = j;
        }
        return (rankSumPos - posTotal * (posTotal + 1) * 0.5) / (posTotal * (double)negTotal);
    }

    public static double ComputePrAuc(ReadOnlySpan<double> labels, ReadOnlySpan<double> scores)
    {
        var n = labels.Length;
        var pairs = new (double Score, int Label)[n];
        long posTotal = 0;
        for (var i = 0; i < n; i++)
        {
            var y = labels[i] >= 0.5 ? 1 : 0;
            posTotal += y;
            pairs[i] = (scores[i], y);
        }
        if (posTotal == 0) return 0.0;

        Array.Sort(pairs, (a, b) => b.Score.CompareTo(a.Score));
        var tp = 0L;
        var fp = 0L;
        var ap = 0.0;
        var prevRecall = 0.0;
        for (var i = 0; i < n;)
        {
            var j = i + 1;
            while (j < n && pairs[j].Score == pairs[i].Score) j++;
            for (var k = i; k < j; k++)
            {
                if (pairs[k].Label == 1) tp++;
                else fp++;
            }
            var recall = (double)tp / posTotal;
            var precision = (double)tp / (tp + fp);
            ap += (recall - prevRecall) * precision;
            prevRecall = recall;
            i = j;
        }
        return ap;
    }

    private static double ComputeEce10(ReadOnlySpan<double> labels, ReadOnlySpan<double> probs)
    {
        var n = labels.Length;
        if (n == 0) return 0.0;
        var counts = new int[10];
        var sumP = new double[10];
        var sumY = new double[10];
        for (var i = 0; i < n; i++)
        {
            var p = Math.Clamp(probs[i], 0.0, 0.999999);
            var bin = Math.Clamp((int)(p * 10.0), 0, 9);
            counts[bin]++;
            sumP[bin] += p;
            sumY[bin] += labels[i] >= 0.5 ? 1.0 : 0.0;
        }
        var ece = 0.0;
        for (var b = 0; b < 10; b++)
        {
            if (counts[b] == 0) continue;
            ece += Math.Abs(sumY[b] - sumP[b]) / n;
        }
        return ece;
    }

    private static double ComputeSpearman(ReadOnlySpan<double> a, ReadOnlySpan<double> b)
    {
        var ra = AverageRanks(a);
        var rb = AverageRanks(b);
        var n = ra.Length;
        var meanA = ra.Average();
        var meanB = rb.Average();
        var cov = 0.0;
        var va = 0.0;
        var vb = 0.0;
        for (var i = 0; i < n; i++)
        {
            var da = ra[i] - meanA;
            var db = rb[i] - meanB;
            cov += da * db;
            va += da * da;
            vb += db * db;
        }
        return va > 1e-12 && vb > 1e-12 ? cov / Math.Sqrt(va * vb) : 0.0;
    }

    private static double[] AverageRanks(ReadOnlySpan<double> values)
    {
        var n = values.Length;
        var idx = new int[n];
        for (var i = 0; i < n; i++) idx[i] = i;
        var copy = values.ToArray();
        Array.Sort(copy, idx);
        var ranks = new double[n];
        for (var i = 0; i < n;)
        {
            var j = i + 1;
            while (j < n && copy[j] == copy[i]) j++;
            var r = 0.5 * ((i + 1) + j);
            for (var k = i; k < j; k++) ranks[idx[k]] = r;
            i = j;
        }
        return ranks;
    }

    private static double PercentileSorted(double[] sorted, double p)
    {
        if (sorted.Length == 0) return 0.0;
        var pos = p * (sorted.Length - 1);
        var lo = (int)Math.Floor(pos);
        var hi = Math.Min(sorted.Length - 1, lo + 1);
        return sorted[lo] + (pos - lo) * (sorted[hi] - sorted[lo]);
    }
}
