namespace NasaSpaceApps.Harmonization.Modeling;

internal enum GbdtObjective
{
    BinaryLogLoss,
    Huber,
}

internal sealed class QuantileBinnedDataset
{
    public string[] FeatureNames { get; }
    public int NumRows { get; }
    public int NumFeatures { get; }
    // Column-major binned values: Bin 0 = NaN/Missing; Bins 1..NumBins[f]-1 = ordered quantile intervals.
    public byte[][] BinnedColumns { get; }
    public double[][] CutPoints { get; }
    public int[] BinCounts { get; }

    private QuantileBinnedDataset(
        string[] featureNames,
        int numRows,
        byte[][] binnedColumns,
        double[][] cutPoints,
        int[] binCounts)
    {
        FeatureNames = featureNames;
        NumRows = numRows;
        NumFeatures = featureNames.Length;
        BinnedColumns = binnedColumns;
        CutPoints = cutPoints;
        BinCounts = binCounts;
    }

    public static QuantileBinnedDataset FitAndTransform(
        string[] featureNames,
        double[][] rawColumns,
        int[] trainIdx,
        int maxBins = 255)
    {
        var numFeatures = featureNames.Length;
        var numRows = numFeatures > 0 ? rawColumns[0].Length : 0;
        var binned = new byte[numFeatures][];
        var cuts = new double[numFeatures][];
        var counts = new int[numFeatures];

        Parallel.For(0, numFeatures, f =>
        {
            var col = rawColumns[f];
            var finiteVals = new List<double>(trainIdx.Length);
            foreach (var r in trainIdx)
            {
                var v = col[r];
                if (double.IsFinite(v)) finiteVals.Add(v);
            }

            double[] boundaries;
            if (finiteVals.Count == 0)
            {
                boundaries = [];
            }
            else
            {
                finiteVals.Sort();
                var uniqCuts = new List<double>(maxBins);
                var step = Math.Max(1.0, (double)finiteVals.Count / maxBins);
                for (var b = 1; b < maxBins; b++)
                {
                    var pos = (int)Math.Floor(b * step);
                    if (pos >= finiteVals.Count) break;
                    var candidate = finiteVals[pos];
                    if (uniqCuts.Count == 0 || candidate > uniqCuts[^1] + 1e-12)
                        uniqCuts.Add(candidate);
                }
                boundaries = [.. uniqCuts];
            }

            cuts[f] = boundaries;
            counts[f] = boundaries.Length + 2; // 0 = missing, 1..boundaries.Length+1 = value bins
            var outCol = new byte[numRows];
            for (var r = 0; r < numRows; r++)
            {
                var v = col[r];
                if (!double.IsFinite(v))
                {
                    outCol[r] = 0;
                    continue;
                }
                if (boundaries.Length == 0)
                {
                    outCol[r] = 1;
                    continue;
                }
                var idx = Array.BinarySearch(boundaries, v);
                var bin = idx >= 0 ? idx + 1 : ~idx + 1;
                outCol[r] = (byte)Math.Clamp(bin, 1, boundaries.Length + 1);
            }
            binned[f] = outCol;
        });

        return new QuantileBinnedDataset(featureNames, numRows, binned, cuts, counts);
    }
}

internal sealed class HistogramGbdtModel
{
    public sealed record TreeNode(
        bool IsLeaf,
        double LeafValue,
        int FeatureIndex,
        byte ThresholdBin,
        bool MissingGoesLeft,
        int LeftChild,
        int RightChild);

    public GbdtObjective Objective { get; }
    public double BaseScore { get; }
    public double LearningRate { get; }
    public List<TreeNode[]> Trees { get; }
    public double[] FeatureGainImportance { get; }
    public int BestIteration { get; }
    public string[] FeatureNames { get; }

    private HistogramGbdtModel(
        GbdtObjective objective,
        double baseScore,
        double learningRate,
        List<TreeNode[]> trees,
        double[] featureGainImportance,
        int bestIteration,
        string[] featureNames)
    {
        Objective = objective;
        BaseScore = baseScore;
        LearningRate = learningRate;
        Trees = trees;
        FeatureGainImportance = featureGainImportance;
        BestIteration = bestIteration;
        FeatureNames = featureNames;
    }

    public double[] Predict(QuantileBinnedDataset dataset, int[] indices)
    {
        var preds = new double[indices.Length];
        Array.Fill(preds, BaseScore);
        var cols = dataset.BinnedColumns;

        foreach (var tree in Trees)
        {
            for (var k = 0; k < indices.Length; k++)
            {
                var row = indices[k];
                var nodeIdx = 0;
                while (true)
                {
                    var node = tree[nodeIdx];
                    if (node.IsLeaf)
                    {
                        preds[k] += LearningRate * node.LeafValue;
                        break;
                    }
                    var bin = cols[node.FeatureIndex][row];
                    var goLeft = bin == 0 ? node.MissingGoesLeft : bin <= node.ThresholdBin;
                    nodeIdx = goLeft ? node.LeftChild : node.RightChild;
                }
            }
        }

        if (Objective == GbdtObjective.BinaryLogLoss)
        {
            for (var k = 0; k < preds.Length; k++)
                preds[k] = SparseLinearTrainer.Sigmoid(preds[k]);
        }
        return preds;
    }

    public static HistogramGbdtModel Train(
        QuantileBinnedDataset dataset,
        IReadOnlyList<double> targets,
        int[] outerTrainIdx,
        int[] blockIds,
        GbdtObjective objective,
        int maxTrees = 220,
        int maxDepth = 5,
        double learningRate = 0.05,
        double regLambda = 10.0,
        double minChildWeight = 20.0,
        double huberDelta = 0.35,
        int patience = 20,
        int seed = 20261115)
    {
        // Split outerTrainIdx geographically into 80% inner-train / 20% inner-early-stop validation.
        var blocks = outerTrainIdx.Select(i => blockIds[i]).Distinct().OrderBy(b => b).ToArray();
        var innerValBlocks = new HashSet<int>();
        if (blocks.Length >= 5)
        {
            for (var i = 0; i < blocks.Length; i++)
                if (i % 5 == 4) innerValBlocks.Add(blocks[i]);
        }

        var trIdx = innerValBlocks.Count > 0
            ? outerTrainIdx.Where(i => !innerValBlocks.Contains(blockIds[i])).ToArray()
            : outerTrainIdx;
        var valIdx = innerValBlocks.Count > 0
            ? outerTrainIdx.Where(i => innerValBlocks.Contains(blockIds[i])).ToArray()
            : [];

        var baseScore = ComputeInitialScore(targets, trIdx, objective);
        var rawPreds = new double[dataset.NumRows];
        Array.Fill(rawPreds, baseScore);

        var grad = new double[dataset.NumRows];
        var hess = new double[dataset.NumRows];
        var importance = new double[dataset.NumFeatures];
        var trees = new List<TreeNode[]>(maxTrees);

        var bestValLoss = double.PositiveInfinity;
        var bestIter = 0;
        var staleRounds = 0;
        var rng = new Random(seed);
        var allFeatures = Enumerable.Range(0, dataset.NumFeatures).ToArray();

        for (var iter = 0; iter < maxTrees; iter++)
        {
            ComputeGradients(objective, targets, trIdx, rawPreds, grad, hess, huberDelta);

            // Column subsampling 85% for robustness when many features exist.
            var featSubset = dataset.NumFeatures > 12
                ? allFeatures.Where(_ => rng.NextDouble() < 0.85).ToArray()
                : allFeatures;
            if (featSubset.Length == 0) featSubset = allFeatures;

            var tree = FitSingleTree(
                dataset, targets, trIdx, grad, hess, rawPreds,
                featSubset, objective, maxDepth, regLambda, minChildWeight, huberDelta, importance);
            trees.Add(tree);

            UpdatePredictions(tree, dataset.BinnedColumns, trIdx, rawPreds, learningRate);
            if (valIdx.Length > 0)
            {
                UpdatePredictions(tree, dataset.BinnedColumns, valIdx, rawPreds, learningRate);
                var valLoss = EvaluateLoss(objective, targets, valIdx, rawPreds, huberDelta);
                if (valLoss < bestValLoss - 1e-6)
                {
                    bestValLoss = valLoss;
                    bestIter = trees.Count;
                    staleRounds = 0;
                }
                else
                {
                    staleRounds++;
                    if (staleRounds >= patience)
                        break;
                }
            }
            else
            {
                bestIter = trees.Count;
            }
        }

        if (valIdx.Length > 0 && bestIter > 0 && bestIter < trees.Count)
            trees.RemoveRange(bestIter, trees.Count - bestIter);

        return new HistogramGbdtModel(
            objective, baseScore, learningRate, trees, importance, trees.Count, dataset.FeatureNames);
    }

    private static TreeNode[] FitSingleTree(
        QuantileBinnedDataset ds,
        IReadOnlyList<double> targets,
        int[] trIdx,
        double[] grad,
        double[] hess,
        double[] rawPreds,
        int[] features,
        GbdtObjective objective,
        int maxDepth,
        double regLambda,
        double minChildWeight,
        double huberDelta,
        double[] importance)
    {
        var nodes = new List<TreeNode>(64);
        var queue = new Queue<(int NodeId, int[] Rows, int Depth, double[][][]? ParentHists)>();
        var rootRows = (int[])trIdx.Clone();
        nodes.Add(default!);
        queue.Enqueue((0, rootRows, 0, null));

        var totalCols = ds.BinnedColumns;
        var binCounts = ds.BinCounts;

        while (queue.Count > 0)
        {
            var (nodeId, rows, depth, cachedHists) = queue.Dequeue();

            if (depth >= maxDepth || rows.Length < 2 * (int)Math.Max(10, minChildWeight))
            {
                nodes[nodeId] = MakeLeaf(objective, rows, targets, rawPreds, grad, hess, regLambda, huberDelta);
                continue;
            }

            // Build histograms per feature (reuse subtracted parent histogram when provided).
            var nFeat = features.Length;
            var histG = new double[nFeat][];
            var histH = new double[nFeat][];

            if (cachedHists is not null)
            {
                for (var fi = 0; fi < nFeat; fi++)
                {
                    var bins = binCounts[features[fi]];
                    histG[fi] = cachedHists[0]![fi];
                    histH[fi] = cachedHists[1]![fi];
                }
            }
            else
            {
                Parallel.For(0, nFeat, fi =>
                {
                    var f = features[fi];
                    var bins = binCounts[f];
                    var gArr = new double[bins];
                    var hArr = new double[bins];
                    var col = totalCols[f];
                    for (var k = 0; k < rows.Length; k++)
                    {
                        var r = rows[k];
                        var b = col[r];
                        gArr[b] += grad[r];
                        hArr[b] += hess[r];
                    }
                    histG[fi] = gArr;
                    histH[fi] = hArr;
                });
            }

            double totalG = 0, totalH = 0;
            for (var b = 0; b < histG[0].Length; b++)
            {
                totalG += histG[0][b];
                totalH += histH[0][b];
            }
            var parentGain = (totalG * totalG) / (totalH + regLambda);

            var bestGain = 0.0;
            var bestFeatSlot = -1;
            byte bestBin = 0;
            var bestMissingLeft = true;

            for (var fi = 0; fi < nFeat; fi++)
            {
                var bins = binCounts[features[fi]];
                if (bins <= 2) continue;
                var gArr = histG[fi];
                var hArr = histH[fi];
                var missG = gArr[0];
                var missH = hArr[0];

                foreach (var missingLeft in new[] { true, false })
                {
                    var leftG = missingLeft ? missG : 0.0;
                    var leftH = missingLeft ? missH : 0.0;

                    for (var splitBin = 1; splitBin < bins - 1; splitBin++)
                    {
                        leftG += gArr[splitBin];
                        leftH += hArr[splitBin];
                        var rightG = totalG - leftG;
                        var rightH = totalH - leftH;

                        if (leftH < minChildWeight || rightH < minChildWeight)
                            continue;

                        var gain = (leftG * leftG) / (leftH + regLambda)
                                 + (rightG * rightG) / (rightH + regLambda)
                                 - parentGain;
                        if (gain > bestGain)
                        {
                            bestGain = gain;
                            bestFeatSlot = fi;
                            bestBin = (byte)splitBin;
                            bestMissingLeft = missingLeft;
                        }
                    }
                }
            }

            if (bestFeatSlot < 0 || bestGain <= 1e-6)
            {
                nodes[nodeId] = MakeLeaf(objective, rows, targets, rawPreds, grad, hess, regLambda, huberDelta);
                continue;
            }

            var splitFeature = features[bestFeatSlot];
            importance[splitFeature] += bestGain;

            var splitCol = totalCols[splitFeature];
            var leftCount = 0;
            for (var k = 0; k < rows.Length; k++)
            {
                var b = splitCol[rows[k]];
                if (b == 0 ? bestMissingLeft : b <= bestBin) leftCount++;
            }

            if (leftCount == 0 || leftCount == rows.Length)
            {
                nodes[nodeId] = MakeLeaf(objective, rows, targets, rawPreds, grad, hess, regLambda, huberDelta);
                continue;
            }

            var leftRows = new int[leftCount];
            var rightRows = new int[rows.Length - leftCount];
            int li = 0, ri = 0;
            for (var k = 0; k < rows.Length; k++)
            {
                var r = rows[k];
                var b = splitCol[r];
                if (b == 0 ? bestMissingLeft : b <= bestBin) leftRows[li++] = r;
                else rightRows[ri++] = r;
            }

            var leftChildId = nodes.Count;
            nodes.Add(default!);
            var rightChildId = nodes.Count;
            nodes.Add(default!);
            nodes[nodeId] = new TreeNode(false, 0.0, splitFeature, bestBin, bestMissingLeft, leftChildId, rightChildId);

            // Histogram subtraction trick for the larger child when depth budget permits!
            if (depth + 1 < maxDepth &&
                leftRows.Length >= 2 * (int)Math.Max(10, minChildWeight) &&
                rightRows.Length >= 2 * (int)Math.Max(10, minChildWeight))
            {
                var leftSmaller = leftRows.Length <= rightRows.Length;
                var smallRows = leftSmaller ? leftRows : rightRows;
                var smallG = new double[nFeat][];
                var smallH = new double[nFeat][];
                var largeG = new double[nFeat][];
                var largeH = new double[nFeat][];

                Parallel.For(0, nFeat, fi =>
                {
                    var f = features[fi];
                    var bins = binCounts[f];
                    var col = totalCols[f];
                    var sg = new double[bins];
                    var sh = new double[bins];
                    for (var k = 0; k < smallRows.Length; k++)
                    {
                        var r = smallRows[k];
                        var b = col[r];
                        sg[b] += grad[r];
                        sh[b] += hess[r];
                    }
                    var lg = new double[bins];
                    var lh = new double[bins];
                    var pg = histG[fi];
                    var ph = histH[fi];
                    for (var b = 0; b < bins; b++)
                    {
                        lg[b] = pg[b] - sg[b];
                        lh[b] = ph[b] - sh[b];
                    }
                    smallG[fi] = sg;
                    smallH[fi] = sh;
                    largeG[fi] = lg;
                    largeH[fi] = lh;
                });

                queue.Enqueue((leftSmaller ? leftChildId : rightChildId, smallRows, depth + 1, [smallG, smallH]));
                queue.Enqueue((leftSmaller ? rightChildId : leftChildId, leftSmaller ? rightRows : leftRows, depth + 1, [largeG, largeH]));
            }
            else
            {
                queue.Enqueue((leftChildId, leftRows, depth + 1, null));
                queue.Enqueue((rightChildId, rightRows, depth + 1, null));
            }
        }

        return [.. nodes];
    }

    private static TreeNode MakeLeaf(
        GbdtObjective objective,
        int[] rows,
        IReadOnlyList<double> targets,
        double[] rawPreds,
        double[] grad,
        double[] hess,
        double regLambda,
        double huberDelta)
    {
        if (objective == GbdtObjective.BinaryLogLoss)
        {
            double gSum = 0, hSum = 0;
            for (var k = 0; k < rows.Length; k++)
            {
                var r = rows[k];
                gSum += grad[r];
                hSum += hess[r];
            }
            var step = Math.Clamp(-gSum / (hSum + regLambda), -5.0, 5.0);
            return new TreeNode(true, step, 0, 0, true, -1, -1);
        }

        // Exact Huber optimal leaf increment via 4 IRLS steps (res = target - rawPred).
        var res = new double[rows.Length];
        for (var k = 0; k < rows.Length; k++)
            res[k] = targets[rows[k]] - rawPreds[rows[k]];
        var sorted = (double[])res.Clone();
        Array.Sort(sorted);
        var val = sorted.Length > 0 ? sorted[sorted.Length / 2] : 0.0;
        for (var stepIdx = 0; stepIdx < 4; stepIdx++)
        {
            double wSum = regLambda * 0.1, wrSum = 0.0;
            for (var k = 0; k < res.Length; k++)
            {
                var d = Math.Abs(res[k] - val);
                var w = d <= huberDelta ? 1.0 : huberDelta / d;
                wSum += w;
                wrSum += w * res[k];
            }
            val = wSum > 1e-12 ? wrSum / wSum : val;
        }
        return new TreeNode(true, val, 0, 0, true, -1, -1);
    }

    private static void UpdatePredictions(
        TreeNode[] tree,
        byte[][] cols,
        int[] indices,
        double[] rawPreds,
        double learningRate)
    {
        Parallel.For(0, indices.Length, k =>
        {
            var row = indices[k];
            var nodeIdx = 0;
            while (true)
            {
                var node = tree[nodeIdx];
                if (node.IsLeaf)
                {
                    rawPreds[row] += learningRate * node.LeafValue;
                    break;
                }
                var bin = cols[node.FeatureIndex][row];
                var goLeft = bin == 0 ? node.MissingGoesLeft : bin <= node.ThresholdBin;
                nodeIdx = goLeft ? node.LeftChild : node.RightChild;
            }
        });
    }

    private static double ComputeInitialScore(IReadOnlyList<double> targets, int[] trIdx, GbdtObjective objective)
    {
        if (trIdx.Length == 0) return 0.0;
        if (objective == GbdtObjective.BinaryLogLoss)
        {
            var mean = Math.Clamp(trIdx.Average(i => targets[i]), 1e-4, 1.0 - 1e-4);
            return Math.Log(mean / (1.0 - mean));
        }
        var vals = trIdx.Select(i => targets[i]).OrderBy(v => v).ToArray();
        return vals[vals.Length / 2];
    }

    private static void ComputeGradients(
        GbdtObjective objective,
        IReadOnlyList<double> targets,
        int[] trIdx,
        double[] rawPreds,
        double[] grad,
        double[] hess,
        double huberDelta)
    {
        Parallel.For(0, trIdx.Length, k =>
        {
            var i = trIdx[k];
            var f = rawPreds[i];
            var y = targets[i];
            if (objective == GbdtObjective.BinaryLogLoss)
            {
                var p = SparseLinearTrainer.Sigmoid(f);
                grad[i] = p - y;
                hess[i] = Math.Max(p * (1.0 - p), 1e-6);
            }
            else
            {
                var r = f - y;
                grad[i] = Math.Clamp(r, -huberDelta, huberDelta);
                hess[i] = 1.0;
            }
        });
    }

    private static double EvaluateLoss(
        GbdtObjective objective,
        IReadOnlyList<double> targets,
        int[] indices,
        double[] rawPreds,
        double huberDelta)
    {
        var loss = 0.0;
        for (var k = 0; k < indices.Length; k++)
        {
            var i = indices[k];
            var f = rawPreds[i];
            var y = targets[i];
            if (objective == GbdtObjective.BinaryLogLoss)
            {
                loss += MathUtil.Softplus(f) - y * f;
            }
            else
            {
                var a = Math.Abs(f - y);
                loss += a <= huberDelta ? 0.5 * a * a : huberDelta * (a - 0.5 * huberDelta);
            }
        }
        return loss / Math.Max(1, indices.Length);
    }
}
