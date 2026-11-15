namespace NasaSpaceApps.Harmonization.Modeling;

internal sealed class SparseFeatureSet
{
    public string[] FeatureNames { get; }
    public int[][] RowIndices { get; }
    public int NumRows => RowIndices.Length;
    public int NumFeatures => FeatureNames.Length;

    private SparseFeatureSet(string[] featureNames, int[][] rowIndices)
    {
        FeatureNames = featureNames;
        RowIndices = rowIndices;
    }

    public static SparseFeatureSet Build(IReadOnlyList<string[]> rows, int[]? restrictTrainIdx = null)
    {
        var vocab = new Dictionary<string, int>(StringComparer.Ordinal);
        var indexSet = restrictTrainIdx is not null ? new HashSet<int>(restrictTrainIdx) : null;

        for (var i = 0; i < rows.Count; i++)
        {
            if (indexSet is not null && !indexSet.Contains(i)) continue;
            foreach (var f in rows[i])
            {
                if (!vocab.ContainsKey(f))
                    vocab[f] = vocab.Count;
            }
        }

        var featureNames = new string[vocab.Count];
        foreach (var (name, id) in vocab) featureNames[id] = name;

        var encoded = new int[rows.Count][];
        for (var i = 0; i < rows.Count; i++)
        {
            var raw = rows[i];
            var ids = new List<int>(raw.Length);
            foreach (var f in raw)
            {
                if (vocab.TryGetValue(f, out var id))
                    ids.Add(id);
            }
            encoded[i] = ids.Distinct().ToArray();
        }

        return new SparseFeatureSet(featureNames, encoded);
    }
}

internal static class LbfgsOptimizer
{
    public delegate double ObjectiveAndGradient(ReadOnlySpan<double> x, Span<double> grad);

    public static double[] Minimize(
        int dim,
        double[] x0,
        ObjectiveAndGradient eval,
        int memory = 10,
        int maxIterations = 120,
        double gradTol = 1e-6)
    {
        var x = (double[])x0.Clone();
        var g = new double[dim];
        var f = eval(x, g);

        var sHist = new List<double[]>(memory);
        var yHist = new List<double[]>(memory);
        var rhoHist = new List<double>(memory);
        var q = new double[dim];
        var d = new double[dim];
        var xNext = new double[dim];
        var gNext = new double[dim];
        var alpha = new double[memory];

        for (var iter = 0; iter < maxIterations; iter++)
        {
            var gNorm = Norm2(g);
            if (gNorm <= gradTol) break;

            // Two-loop L-BFGS recursion for search direction d = -H * g
            Array.Copy(g, q, dim);
            var m = sHist.Count;
            for (var i = m - 1; i >= 0; i--)
            {
                alpha[i] = rhoHist[i] * Dot(sHist[i], q);
                for (var j = 0; j < dim; j++)
                    q[j] -= alpha[i] * yHist[i][j];
            }

            var gamma = 1.0;
            if (m > 0)
            {
                var yy = Dot(yHist[m - 1], yHist[m - 1]);
                if (yy > 1e-18)
                    gamma = (1.0 / rhoHist[m - 1]) / yy;
            }
            for (var j = 0; j < dim; j++) d[j] = gamma * q[j];

            for (var i = 0; i < m; i++)
            {
                var beta = rhoHist[i] * Dot(yHist[i], d);
                var diff = alpha[i] - beta;
                for (var j = 0; j < dim; j++)
                    d[j] += sHist[i][j] * diff;
            }
            for (var j = 0; j < dim; j++) d[j] = -d[j];

            var dg = Dot(d, g);
            if (dg >= 0)
            {
                // Safeguard fallback to steepest descent if Hessian approximation lost positivity.
                for (var j = 0; j < dim; j++) d[j] = -g[j];
                dg = -gNorm * gNorm;
                sHist.Clear();
                yHist.Clear();
                rhoHist.Clear();
            }

            // Backtracking Armijo line search.
            var step = iter == 0 && m == 0 ? Math.Min(1.0, 1.0 / Math.Max(1.0, gNorm)) : 1.0;
            var accepted = false;
            var fNext = f;
            for (var ls = 0; ls < 25; ls++)
            {
                for (var j = 0; j < dim; j++) xNext[j] = x[j] + step * d[j];
                fNext = eval(xNext, gNext);
                if (double.IsFinite(fNext) && fNext <= f + 1e-4 * step * dg)
                {
                    accepted = true;
                    break;
                }
                step *= 0.5;
            }

            if (!accepted) break;

            var sVec = new double[dim];
            var yVec = new double[dim];
            for (var j = 0; j < dim; j++)
            {
                sVec[j] = xNext[j] - x[j];
                yVec[j] = gNext[j] - g[j];
            }
            var ys = Dot(yVec, sVec);
            var ss = Dot(sVec, sVec);

            Array.Copy(xNext, x, dim);
            Array.Copy(gNext, g, dim);
            f = fNext;

            if (ys > 1e-12 * Math.Sqrt(ss + 1e-18))
            {
                if (sHist.Count == memory)
                {
                    sHist.RemoveAt(0);
                    yHist.RemoveAt(0);
                    rhoHist.RemoveAt(0);
                }
                sHist.Add(sVec);
                yHist.Add(yVec);
                rhoHist.Add(1.0 / ys);
            }
            if (Math.Sqrt(ss) < 1e-11) break;
        }

        return x;
    }

    private static double Dot(double[] a, double[] b)
    {
        var s = 0.0;
        for (var i = 0; i < a.Length; i++) s += a[i] * b[i];
        return s;
    }

    private static double Norm2(double[] v) => Math.Sqrt(Dot(v, v));
}

internal sealed record LinearLogisticFit(
    double Intercept,
    Dictionary<string, double> Coefficients,
    double CalibrationBias,
    double CalibrationSlope,
    double SelectedAlpha);

internal sealed record LinearHuberFit(
    double Intercept,
    Dictionary<string, double> Coefficients,
    double SelectedAlpha);

internal static class SparseLinearTrainer
{
    private static readonly double[] AlphaGrid = [1.0, 4.0, 16.0, 64.0];

    public static LinearLogisticFit FitLogistic(
        IReadOnlyList<string[]> featureRows,
        IReadOnlyList<double> targets,
        int[] trainIdx,
        int[] blockIds,
        out double[] innerOofLogits,
        bool tuneHyperparams = true)
    {
        var sparse = SparseFeatureSet.Build(featureRows, trainIdx);
        var innerFolds = AssignInnerFolds(trainIdx, blockIds, 3);

        var bestAlpha = 4.0;
        var bestOofLogits = Array.Empty<double>();
        if (tuneHyperparams && innerFolds.Distinct().Count() >= 2)
        {
            var bestLoss = double.PositiveInfinity;
            foreach (var alpha in AlphaGrid)
            {
                var oof = ComputeInnerOofLogits(sparse, targets, trainIdx, innerFolds, alpha);
                var ll = BinaryLogLoss(targets, trainIdx, oof);
                if (ll < bestLoss)
                {
                    bestLoss = ll;
                    bestAlpha = alpha;
                    bestOofLogits = oof;
                }
            }
        }
        else
        {
            bestOofLogits = ComputeInnerOofLogits(sparse, targets, trainIdx, innerFolds, bestAlpha);
        }

        innerOofLogits = bestOofLogits;
        var (bias, slope) = FitPlattCalibration(targets, trainIdx, bestOofLogits);
        var weights = SolveLogisticWeights(sparse, targets, trainIdx, bestAlpha);

        var coeffDict = new Dictionary<string, double>(sparse.NumFeatures, StringComparer.Ordinal);
        for (var j = 0; j < sparse.NumFeatures; j++)
        {
            if (Math.Abs(weights[j + 1]) > 1e-9)
                coeffDict[sparse.FeatureNames[j]] = weights[j + 1];
        }

        return new LinearLogisticFit(weights[0], coeffDict, bias, slope, bestAlpha);
    }

    public static double[] PredictLogisticMissProb(
        LinearLogisticFit fit,
        IReadOnlyList<string[]> featureRows,
        int[] indices)
    {
        var probs = new double[indices.Length];
        for (var k = 0; k < indices.Length; k++)
        {
            var z = fit.Intercept;
            foreach (var f in featureRows[indices[k]])
                if (fit.Coefficients.TryGetValue(f, out var w))
                    z += w;
            // Match viirsDetectionScore.ts: p_detect = 1 / (1 + exp(slope * z - bias)) -> p_miss = sigmoid(slope * z - bias)
            var cal = fit.CalibrationSlope * z - fit.CalibrationBias;
            probs[k] = Sigmoid(cal);
        }
        return probs;
    }

    public static LinearHuberFit FitHuber(
        IReadOnlyList<string[]> featureRows,
        IReadOnlyList<double> targets,
        int[] trainIdx,
        int[] blockIds,
        double delta = 0.35,
        bool tuneHyperparams = true)
    {
        var sparse = SparseFeatureSet.Build(featureRows, trainIdx);
        var innerFolds = AssignInnerFolds(trainIdx, blockIds, 3);

        var bestAlpha = 8.0;
        if (tuneHyperparams && innerFolds.Distinct().Count() >= 2)
        {
            var bestLoss = double.PositiveInfinity;
            foreach (var alpha in AlphaGrid)
            {
                var oofPreds = ComputeInnerOofHuber(sparse, targets, trainIdx, innerFolds, alpha, delta);
                var loss = 0.0;
                for (var k = 0; k < trainIdx.Length; k++)
                    loss += HuberVal(oofPreds[k] - targets[trainIdx[k]], delta);
                loss /= Math.Max(1, trainIdx.Length);
                if (loss < bestLoss)
                {
                    bestLoss = loss;
                    bestAlpha = alpha;
                }
            }
        }

        var weights = SolveHuberWeights(sparse, targets, trainIdx, bestAlpha, delta);
        var coeffDict = new Dictionary<string, double>(sparse.NumFeatures, StringComparer.Ordinal);
        for (var j = 0; j < sparse.NumFeatures; j++)
        {
            if (Math.Abs(weights[j + 1]) > 1e-9)
                coeffDict[sparse.FeatureNames[j]] = weights[j + 1];
        }

        return new LinearHuberFit(weights[0], coeffDict, bestAlpha);
    }

    public static double[] PredictHuber(
        LinearHuberFit fit,
        IReadOnlyList<string[]> featureRows,
        int[] indices)
    {
        var preds = new double[indices.Length];
        for (var k = 0; k < indices.Length; k++)
        {
            var sum = fit.Intercept;
            foreach (var f in featureRows[indices[k]])
                if (fit.Coefficients.TryGetValue(f, out var w))
                    sum += w;
            preds[k] = sum;
        }
        return preds;
    }

    private static double[] SolveLogisticWeights(SparseFeatureSet sparse, IReadOnlyList<double> targets, int[] trainIdx, double alpha)
    {
        var dim = sparse.NumFeatures + 1;
        var pos = 0.0;
        foreach (var i in trainIdx) pos += targets[i];
        var baseP = Math.Clamp(pos / Math.Max(1, trainIdx.Length), 1e-4, 1.0 - 1e-4);
        var x0 = new double[dim];
        x0[0] = Math.Log(baseP / (1.0 - baseP));

        var invN = 1.0 / Math.Max(1, trainIdx.Length);
        return LbfgsOptimizer.Minimize(dim, x0, (w, g) =>
        {
            g.Clear();
            var totalLoss = 0.0;
            for (var k = 0; k < trainIdx.Length; k++)
            {
                var i = trainIdx[k];
                var cols = sparse.RowIndices[i];
                var z = w[0];
                for (var c = 0; c < cols.Length; c++) z += w[cols[c] + 1];
                var p = Sigmoid(z);
                var y = targets[i];
                // Stable softplus binary cross entropy
                totalLoss += MathUtil.Softplus(z) - y * z;
                var diff = p - y;
                g[0] += diff;
                for (var c = 0; c < cols.Length; c++) g[cols[c] + 1] += diff;
            }

            var reg = 0.0;
            for (var j = 1; j < dim; j++)
            {
                reg += w[j] * w[j];
                g[j] = g[j] * invN + alpha * invN * w[j];
            }
            g[0] *= invN;
            return totalLoss * invN + 0.5 * alpha * invN * reg;
        });
    }

    private static double[] SolveHuberWeights(SparseFeatureSet sparse, IReadOnlyList<double> targets, int[] trainIdx, double alpha, double delta)
    {
        var dim = sparse.NumFeatures + 1;
        var yVals = trainIdx.Select(i => targets[i]).OrderBy(v => v).ToArray();
        var x0 = new double[dim];
        x0[0] = yVals.Length > 0 ? yVals[yVals.Length / 2] : 0.0;

        var invN = 1.0 / Math.Max(1, trainIdx.Length);
        return LbfgsOptimizer.Minimize(dim, x0, (w, g) =>
        {
            g.Clear();
            var totalLoss = 0.0;
            for (var k = 0; k < trainIdx.Length; k++)
            {
                var i = trainIdx[k];
                var cols = sparse.RowIndices[i];
                var pred = w[0];
                for (var c = 0; c < cols.Length; c++) pred += w[cols[c] + 1];
                var r = pred - targets[i];
                var absR = Math.Abs(r);
                double grad;
                if (absR <= delta)
                {
                    totalLoss += 0.5 * r * r;
                    grad = r;
                }
                else
                {
                    totalLoss += delta * (absR - 0.5 * delta);
                    grad = r > 0 ? delta : -delta;
                }
                g[0] += grad;
                for (var c = 0; c < cols.Length; c++) g[cols[c] + 1] += grad;
            }

            var reg = 0.0;
            for (var j = 1; j < dim; j++)
            {
                reg += w[j] * w[j];
                g[j] = g[j] * invN + alpha * invN * w[j];
            }
            g[0] *= invN;
            return totalLoss * invN + 0.5 * alpha * invN * reg;
        });
    }

    private static double[] ComputeInnerOofLogits(SparseFeatureSet sparse, IReadOnlyList<double> targets, int[] trainIdx, int[] innerFolds, double alpha)
    {
        var oof = new double[trainIdx.Length];
        for (var f = 0; f < 3; f++)
        {
            var tr = new List<int>(trainIdx.Length);
            var valPos = new List<int>(trainIdx.Length / 3);
            for (var k = 0; k < trainIdx.Length; k++)
            {
                if (innerFolds[k] == f) valPos.Add(k);
                else tr.Add(trainIdx[k]);
            }
            if (valPos.Count == 0 || tr.Count == 0) continue;
            var w = SolveLogisticWeights(sparse, targets, [.. tr], alpha);
            foreach (var k in valPos)
            {
                var z = w[0];
                foreach (var col in sparse.RowIndices[trainIdx[k]]) z += w[col + 1];
                oof[k] = z;
            }
        }
        return oof;
    }

    private static double[] ComputeInnerOofHuber(SparseFeatureSet sparse, IReadOnlyList<double> targets, int[] trainIdx, int[] innerFolds, double alpha, double delta)
    {
        var oof = new double[trainIdx.Length];
        for (var f = 0; f < 3; f++)
        {
            var tr = new List<int>(trainIdx.Length);
            var valPos = new List<int>(trainIdx.Length / 3);
            for (var k = 0; k < trainIdx.Length; k++)
            {
                if (innerFolds[k] == f) valPos.Add(k);
                else tr.Add(trainIdx[k]);
            }
            if (valPos.Count == 0 || tr.Count == 0) continue;
            var w = SolveHuberWeights(sparse, targets, [.. tr], alpha, delta);
            foreach (var k in valPos)
            {
                var pred = w[0];
                foreach (var col in sparse.RowIndices[trainIdx[k]]) pred += w[col + 1];
                oof[k] = pred;
            }
        }
        return oof;
    }

    private static (double Bias, double Slope) FitPlattCalibration(IReadOnlyList<double> targets, int[] trainIdx, double[] rawMissLogits)
    {
        // Fit p_miss = sigmoid(slope * z - bias) => w[0] = slope, w[1] = -bias
        var x0 = new[] { 1.0, 0.0 };
        var invN = 1.0 / Math.Max(1, trainIdx.Length);
        var sol = LbfgsOptimizer.Minimize(2, x0, (w, g) =>
        {
            g.Clear();
            var loss = 0.0;
            for (var k = 0; k < trainIdx.Length; k++)
            {
                var z = rawMissLogits[k];
                var u = w[0] * z + w[1];
                var p = Sigmoid(u);
                var y = targets[trainIdx[k]];
                loss += MathUtil.Softplus(u) - y * u;
                var d = p - y;
                g[0] += d * z;
                g[1] += d;
            }
            var reg = 0.01 * ((w[0] - 1.0) * (w[0] - 1.0) + w[1] * w[1]);
            g[0] = g[0] * invN + 0.02 * (w[0] - 1.0);
            g[1] = g[1] * invN + 0.02 * w[1];
            return loss * invN + reg;
        });

        var slope = Math.Clamp(sol[0], 0.1, 10.0);
        var bias = -sol[1];
        return (bias, slope);
    }

    private static int[] AssignInnerFolds(int[] trainIdx, int[] blockIds, int k)
    {
        var blockOrder = trainIdx.Select(i => blockIds[i]).Distinct().OrderBy(b => b).ToArray();
        var map = new Dictionary<int, int>(blockOrder.Length);
        for (var i = 0; i < blockOrder.Length; i++) map[blockOrder[i]] = i % k;
        var res = new int[trainIdx.Length];
        for (var i = 0; i < trainIdx.Length; i++) res[i] = map[blockIds[trainIdx[i]]];
        return res;
    }

    private static double BinaryLogLoss(IReadOnlyList<double> targets, int[] trainIdx, double[] logits)
    {
        var loss = 0.0;
        for (var k = 0; k < trainIdx.Length; k++)
        {
            var u = logits[k];
            var y = targets[trainIdx[k]];
            loss += MathUtil.Softplus(u) - y * u;
        }
        return loss / Math.Max(1, trainIdx.Length);
    }

    private static double HuberVal(double r, double delta)
    {
        var a = Math.Abs(r);
        return a <= delta ? 0.5 * r * r : delta * (a - 0.5 * delta);
    }

    internal static double Sigmoid(double x) =>
        x >= 0 ? 1.0 / (1.0 + Math.Exp(-x)) : Math.Exp(x) / (1.0 + Math.Exp(x));
}
