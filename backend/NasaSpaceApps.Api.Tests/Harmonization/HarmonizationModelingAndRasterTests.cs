using System.Buffers.Binary;
using System.IO.Compression;
using NasaSpaceApps.Api.Firms;
using NasaSpaceApps.Api.Satellites;
using NasaSpaceApps.Api.Weather;
using NasaSpaceApps.Harmonization.Export;
using NasaSpaceApps.Harmonization.Modeling;
using Xunit;

namespace NasaSpaceApps.Api.Tests.Harmonization;

public sealed class HarmonizationModelingAndRasterTests
{
    [Fact]
    public void NonSquareFireWeatherRasterDecodesValuesAndCoverageMask()
    {
        const int width = 8;
        const int height = 4;
        var tiff = BuildFloatTiff(width, height, i => (i + 1) * 1.5f);
        var png = BuildPngMask(width, height, (x, y) => (x + y) % 2 == 0);

        var values = FireWeatherRaster.ReadValues(tiff, width, height);
        var cov = FireWeatherRaster.ReadCoverage(png, width, height);

        Assert.Equal(width * height, values.Length);
        Assert.Equal(width * height, cov.Length);
        Assert.Equal(1.5f, values[0]);
        Assert.Equal(48.0f, values[width * height - 1]);
        Assert.Equal(255, cov[0]);
        Assert.Equal(0, cov[1]);
        Assert.Equal(255, cov[width + 1]);
    }

    [Fact]
    public void SampleGlobalFrameWrapsWesternHemisphereAndGreenwichCleanly()
    {
        // Global 0.25-deg grid starting at 0.0 E with 1440 columns, 3 latitude rows [10, 0, -10].
        var lats = new[] { 10.0, 0.0, -10.0 };
        const int cols = 1440;
        var grid = new GfsGribSubset.Grid(FirstLongitude: 0.0, LongitudeStep: 0.25, Latitudes: lats, Columns: cols);
        var values = new double[lats.Length * cols];
        // Put 10.0 at lon = 0.0 (col 0), 20.0 at lon = 359.75 (col 1439, i.e. -0.25 deg),
        // and 100.0 at lon = 240.0 (col 960, i.e. -120.0 deg).
        for (var r = 0; r < lats.Length; r++)
        {
            values[r * cols + 0] = 10.0;
            values[r * cols + 1439] = 20.0;
            values[r * cols + 960] = 100.0;
            values[r * cols + 959] = 60.0; // 239.75 deg = -120.25 deg
        }

        var t = new DateTimeOffset(2026, 11, 15, 0, 0, 0, TimeSpan.Zero);
        var field = new GfsGribSubset.UnpackedField(
            new GfsGribSubset.Parameter(0, 0, 0, 103, 2, 0),
            t, t, t, grid, [], [], [], 0, values);

        // Midpoint between -0.25 W (359.75 E, val 20) and 0.0 E (val 10) should be 15.0!
        var greenwichMid = GlobalWeatherBatchEnricher.SampleGlobalFrame(field, 0.0, -0.125, nearest: false);
        Assert.NotNull(greenwichMid);
        Assert.Equal(15.0, greenwichMid!.Value, 6);

        // Western Hemisphere (-120.125 W => 239.875 E): halfway between col 959 (60) and col 960 (100) => 80.0!
        var westMid = GlobalWeatherBatchEnricher.SampleGlobalFrame(field, 5.0, -120.125, nearest: false);
        Assert.NotNull(westMid);
        Assert.Equal(80.0, westMid!.Value, 6);

        // Nearest neighbor at -0.05 W snaps to col 0 (10.0).
        var nearestZero = GlobalWeatherBatchEnricher.SampleGlobalFrame(field, 0.0, -0.05, nearest: true);
        Assert.Equal(10.0, nearestZero);
    }

    [Fact]
    public void SparseLinearAndHistogramGbdtFitSyntheticClassificationAndRegressionSignals()
    {
        var rng = new Random(42);
        const int n = 600;
        var sparseRows = new string[n][];
        var yClass = new double[n];
        var yReg = new double[n];
        var colSignal = new double[n];
        var colMissingFlag = new double[n];
        var colNoise = new double[n];
        var blockIds = new int[n];

        for (var i = 0; i < n; i++)
        {
            var sig = rng.NextDouble() * 4.0 - 2.0; // [-2, 2]
            var isHighCloud = rng.NextDouble() > 0.5;
            colSignal[i] = sig;
            colMissingFlag[i] = isHighCloud ? double.NaN : sig + 1.0;
            colNoise[i] = rng.NextDouble();
            blockIds[i] = i % 10;

            var logit = 1.8 * sig + (isHighCloud ? 1.2 : -1.2);
            yClass[i] = logit + 0.3 * (rng.NextDouble() - 0.5) > 0 ? 1.0 : 0.0;
            yReg[i] = 0.6 * sig + (isHighCloud ? -0.4 : 0.4) + 0.05 * (rng.NextDouble() - 0.5);

            sparseRows[i] =
            [
                sig >= 0 ? "sig=pos" : "sig=neg",
                isHighCloud ? "cloud=missing" : "cloud=clear",
            ];
        }

        var trainIdx = Enumerable.Range(0, 480).ToArray();
        var testIdx = Enumerable.Range(480, 120).ToArray();

        // 1. Sparse L2 Logistic + Platt calibration
        var logFit = SparseLinearTrainer.FitLogistic(sparseRows, yClass, trainIdx, blockIds, out _, tuneHyperparams: true);
        var pLin = SparseLinearTrainer.PredictLogisticMissProb(logFit, sparseRows, testIdx);
        var yTestClass = testIdx.Select(i => yClass[i]).ToArray();
        var aucLin = EvaluationMetrics.ComputeRocAuc(yTestClass, pLin);
        Assert.True(aucLin > 0.85, $"Expected linear ROC AUC > 0.85, got {aucLin:F4}");

        // 2. Sparse L2 Huber Regression
        var huberFit = SparseLinearTrainer.FitHuber(sparseRows, yReg, trainIdx, blockIds, tuneHyperparams: true);
        var rLin = SparseLinearTrainer.PredictHuber(huberFit, sparseRows, testIdx);
        var maeLin = testIdx.Select((row, k) => Math.Abs(rLin[k] - yReg[row])).Average();
        Assert.True(maeLin < 0.60, $"Expected linear MAE < 0.60, got {maeLin:F4}");

        // 3. Histogram GBDT classification with NaN missing-bin routing
        var ds = QuantileBinnedDataset.FitAndTransform(
            ["sig", "cloud_or_nan", "noise"],
            [colSignal, colMissingFlag, colNoise],
            trainIdx);
        var gbdtCls = HistogramGbdtModel.Train(
            ds, yClass, trainIdx, blockIds, GbdtObjective.BinaryLogLoss,
            maxTrees: 80, maxDepth: 4, minChildWeight: 10);
        var pGbdt = gbdtCls.Predict(ds, testIdx);
        var aucGbdt = EvaluationMetrics.ComputeRocAuc(yTestClass, pGbdt);
        Assert.True(aucGbdt > 0.90, $"Expected GBDT ROC AUC > 0.90, got {aucGbdt:F4}");

        // 4. Histogram GBDT Huber regression
        var gbdtReg = HistogramGbdtModel.Train(
            ds, yReg, trainIdx, blockIds, GbdtObjective.Huber,
            maxTrees: 80, maxDepth: 4, minChildWeight: 10);
        var rGbdt = gbdtReg.Predict(ds, testIdx);
        var maeGbdt = testIdx.Select((row, k) => Math.Abs(rGbdt[k] - yReg[row])).Average();
        Assert.True(maeGbdt < 0.25, $"Expected GBDT MAE < 0.25, got {maeGbdt:F4}");
    }

    [Fact]
    public void HotspotGeometryCalculatorRespectsCustomMaxTleAge()
    {
        var meta = SatelliteCatalog.Default.First();
        var tle = SatelliteTleParser.ParseSingle(meta.Name, meta.DefaultTleLine1, meta.DefaultTleLine2)!;
        var fleet = new Dictionary<int, ResolvedTleEntry> { [meta.NoradId] = new(tle, "test") };
        var obsUtc = new DateTimeOffset(tle.EpochUtc, TimeSpan.Zero).AddDays(-6);
        var spot = new FirmsHotspot(10.0, 20.0, 320.0, null, null, null, obsUtc,
            meta.Name, meta.Instrument, "VIIRS_NOAA20_NRT", "80", 80, "NRT", 10.0, "D");

        var defaultCalc = new HotspotGeometryCalculator(fleet);
        var extendedCalc = new HotspotGeometryCalculator(fleet, TimeSpan.FromDays(7));

        Assert.Null(defaultCalc.Calculate(spot).Orbit);
        // Even if subsatellite isn't overhead, defaultCalc skipped TLE age gate completely; check extended gate attempted match when overhead:
        var sub = SatelliteOrbitPropagator.Propagate(tle, obsUtc.UtcDateTime);
        var overheadSpot = spot with { Latitude = sub.Latitude, Longitude = sub.Longitude };
        Assert.Null(defaultCalc.Calculate(overheadSpot).Orbit);
        Assert.NotNull(extendedCalc.Calculate(overheadSpot).Orbit);
    }

    private static byte[] BuildFloatTiff(int width, int height, Func<int, float> pixelValue)
    {
        const int pixelOffset = 128;
        var pixelCount = width * height;
        var pixelBytes = checked(pixelCount * sizeof(float));
        using var stream = new MemoryStream();
        using var writer = new BinaryWriter(stream);
        writer.Write(0x002A4949u);
        writer.Write(8u);
        (ushort Tag, uint Value)[] tags = [(256, (uint)width), (257, (uint)height), (258, 32), (273, pixelOffset),
            (278, (uint)height), (279, (uint)pixelBytes), (339, 3)];
        writer.Write((ushort)tags.Length);
        foreach (var (tag, value) in tags)
        {
            writer.Write(tag);
            writer.Write((ushort)4);
            writer.Write(1u);
            writer.Write(value);
        }
        stream.SetLength(pixelOffset + pixelBytes);
        stream.Position = pixelOffset;
        for (var i = 0; i < pixelCount; i++)
            writer.Write(pixelValue(i));
        return stream.ToArray();
    }

    private static byte[] BuildPngMask(int width, int height, Func<int, int, bool> covered)
    {
        var header = new byte[13];
        BinaryPrimitives.WriteInt32BigEndian(header, width);
        BinaryPrimitives.WriteInt32BigEndian(header.AsSpan(4), height);
        header[8] = 8;
        header[9] = 6;
        using var png = new MemoryStream();
        png.Write(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 });
        WriteChunk("IHDR"u8, header);
        using var compressed = new MemoryStream();
        using (var zlib = new ZLibStream(compressed, CompressionMode.Compress, leaveOpen: true))
        {
            var row = new byte[1 + width * 4];
            for (var y = 0; y < height; y++)
            {
                Array.Clear(row);
                for (var x = 0; x < width; x++)
                    row[x * 4 + 4] = covered(x, y) ? byte.MaxValue : (byte)0;
                zlib.Write(row);
            }
        }
        WriteChunk("IDAT"u8, compressed.ToArray());
        WriteChunk("IEND"u8, []);
        return png.ToArray();

        void WriteChunk(ReadOnlySpan<byte> type, ReadOnlySpan<byte> data)
        {
            Span<byte> lenBuf = stackalloc byte[4];
            BinaryPrimitives.WriteInt32BigEndian(lenBuf, data.Length);
            png.Write(lenBuf);
            png.Write(type);
            png.Write(data);
            png.Write(stackalloc byte[4]); // CRC ignored by ReadCoverage
        }
    }
}
