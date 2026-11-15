namespace NasaSpaceApps.Harmonization.Modeling;

internal static class CrossValidationSplit
{
    public static int BlockKey(double lat, double lon)
    {
        var row = Math.Clamp((int)Math.Floor((lat + 90.0) / 5.0), 0, 35);
        var col = Math.Clamp((int)Math.Floor((lon + 180.0) / 5.0), 0, 71);
        return row * 72 + col;
    }

    /// <summary>Assigns every row to one of K folds grouped strictly by 5°×5° geographic blocks, balanced in count and positive sum.</summary>
    public static (int[] Folds, int[] BlockIds, int BlockCount) AssignSpatialBlockFolds(
        IReadOnlyList<double> lats,
        IReadOnlyList<double> lons,
        IReadOnlyList<double> targets,
        int foldCount = 5)
    {
        var n = lats.Count;
        var blockIds = new int[n];
        var cells = new Dictionary<int, (int Count, double TargetSum)>();
        for (var i = 0; i < n; i++)
        {
            var b = BlockKey(lats[i], lons[i]);
            blockIds[i] = b;
            cells.TryGetValue(b, out var cur);
            cells[b] = (cur.Count + 1, cur.TargetSum + (double.IsFinite(targets[i]) ? targets[i] : 0.0));
        }

        var orderedCells = cells
            .OrderByDescending(kv => kv.Value.Count)
            .ThenBy(kv => kv.Key)
            .ToArray();

        var foldCounts = new int[foldCount];
        var foldTargetSums = new double[foldCount];
        var globalMean = targets.Count > 0 ? targets.Where(double.IsFinite).DefaultIfEmpty(0.0).Average() : 0.0;
        var cellToFold = new Dictionary<int, int>(orderedCells.Length);

        foreach (var (cellKey, (cnt, tSum)) in orderedCells)
        {
            var bestFold = 0;
            var bestScore = double.PositiveInfinity;
            for (var f = 0; f < foldCount; f++)
            {
                var projectedCount = foldCounts[f] + cnt;
                var projectedMean = (foldTargetSums[f] + tSum) / Math.Max(1, projectedCount);
                var score = projectedCount + 150.0 * Math.Abs(projectedMean - globalMean);
                if (score < bestScore)
                {
                    bestScore = score;
                    bestFold = f;
                }
            }

            cellToFold[cellKey] = bestFold;
            foldCounts[bestFold] += cnt;
            foldTargetSums[bestFold] += tSum;
        }

        var folds = new int[n];
        for (var i = 0; i < n; i++)
            folds[i] = cellToFold[blockIds[i]];

        return (folds, blockIds, orderedCells.Length);
    }

    public static (int[] TrainIdx, int[] TestIdx, long CutoffMs) BuildTemporalHoldout(
        IReadOnlyList<long> timestampsMs,
        long holdoutDurationMs = 24L * 3600_000,
        long embargoBufferMs = 6L * 3600_000)
    {
        if (timestampsMs.Count == 0)
            return ([], [], 0);
        var maxTs = timestampsMs.Max();
        var cutoff = maxTs - holdoutDurationMs;
        var train = new List<int>(timestampsMs.Count);
        var test = new List<int>(timestampsMs.Count / 4);
        for (var i = 0; i < timestampsMs.Count; i++)
        {
            var ts = timestampsMs[i];
            if (ts < cutoff - embargoBufferMs) train.Add(i);
            else if (ts >= cutoff) test.Add(i);
        }
        return ([.. train], [.. test], cutoff);
    }
}
