using System.Buffers.Binary;
using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using NasaSpaceApps.Api.Firms;
using NasaSpaceApps.Api.Weather;
using Xunit;

namespace NasaSpaceApps.Api.Tests.Weather;

public sealed class NoaaGfsWeatherTests
{
    private static readonly DateTimeOffset Run = new(2026, 11, 15, 0, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task SamplesRealRegionalAndGaussianFieldsAtTheRequestedForecastTime()
    {
        using var handler = new FixtureHandler();
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var weather = new NoaaGfsWeather(new ClientFactory(handler), cache, NullLogger<NoaaGfsWeather>.Instance);
        var acquisition = Run.AddHours(6).AddMinutes(24);

        var result = await weather.EnrichAsync([Spot(acquisition, 1.5, 101), Spot(acquisition, 1.5, 100.75),
            Spot(acquisition.AddHours(-1), 1.5, 101), Spot(acquisition.AddMinutes(-20), 1.5, 101)], CancellationToken.None);

        Assert.Equal(6, handler.Urls.Count);
        Assert.Contains(handler.Urls, url => url.Contains("f006&var_HGT", StringComparison.Ordinal));
        Assert.Contains(handler.Urls, url => url.Contains("sfluxgrbf006.grib2", StringComparison.Ordinal));
        var forecast = result[0][0];
        Assert.Equal(Run, forecast.RunUtc);
        Assert.Equal(Run.AddHours(6).AddMinutes(10), forecast.PublishedAtUtc);
        Assert.Equal(1, handler.PublicationUrls.Count(url => url.EndsWith("pgrb2.0p25.f006", StringComparison.Ordinal)));
        Assert.Equal(Run.AddHours(-6), result[3][0].RunUtc);
        Assert.True(result[3][0].PublishedAtUtc <= acquisition.AddMinutes(-20));
        Assert.Equal(1.5, forecast.GridLatitude);
        Assert.Equal(101, forecast.GridLongitude);
        Assert.Equal(301.867, Assert.IsType<double>(forecast.Values["temperature_2m"].Value), 3);
        Assert.InRange(Assert.IsType<double>(forecast.Values["cloud_cover"].Value), 0, 100);
        var water = forecast.Values["column_cloud_water"];
        Assert.InRange(Assert.IsType<double>(water.Value), 0, 10);
        Assert.Equal(Run.AddHours(6), water.ValidThroughUtc);
        Assert.Equal(24, water.AgeMinutesAtAcquisition);
        var ice = forecast.Values["cloud_ice_water_mixing_ratio_300hPa"];
        Assert.Equal(3.696e-5, Assert.IsType<double>(ice.Value), 10);
        Assert.Equal(water.ValidThroughUtc, ice.ValidThroughUtc);
        Assert.Equal(0, forecast.Values["cloud_liquid_water_mixing_ratio_300hPa"].Value);
        Assert.InRange(Assert.IsType<double>(forecast.Values["plant_available_water_0_to_100cm"].Value), 0, 100);
        var deficit = forecast.Values["soil_water_deficit_to_field_capacity_0_to_100cm"];
        Assert.InRange(Assert.IsType<double>(deficit.Value), 0, 1000);
        Assert.Equal(water.ValidThroughUtc, deficit.ValidThroughUtc);
        Assert.Contains(forecast.Values, field => field.Key.EndsWith("_height_estimated_msl", StringComparison.Ordinal)
            && field.Value.Value is >= 0 and < 20_000);
        var snow = result[0][1].Values["snow_cover_percent"];
        Assert.Equal(0d, snow.Value);
        Assert.True(snow.ValidFromUtc < snow.ValidThroughUtc);
        Assert.Equal(Run.AddHours(6), snow.ValidThroughUtc);
        Assert.Null(result[2][0].Values["column_cloud_water"].Value);
    }

    [Fact]
    public async Task AnotherBackendSamplesADifferentSpotFromTheSameSharedEncodedGrids()
    {
        var acquisition = Run.AddHours(6).AddMinutes(24);
        var clock = new FixedClock(acquisition);
        using var upstream = new FixtureHandler();
        using var remote = new GridDocuments();
        using var firstMemory = new MemoryCache(new MemoryCacheOptions());
        using var secondMemory = new MemoryCache(new MemoryCacheOptions());
        var first = CreateBackend(firstMemory);
        var second = CreateBackend(secondMemory);

        var original = Assert.Single(await first.EnrichAsync([Spot(acquisition, 1.5, 101)], default));
        var reused = Assert.Single(await second.EnrichAsync([Spot(acquisition.AddMinutes(1), 1.5, 100.75)], default));

        Assert.Equal(2, upstream.Urls.Count);
        Assert.Equal(2, remote.EncodedDocuments.Count);
        Assert.All(remote.EncodedDocuments.Values, document => Assert.True(document.GetProperty("encoded")
            .GetProperty("bytesValue").GetBytesFromBase64().AsSpan(0, 4).SequenceEqual("GRIB"u8)));
        Assert.NotNull(original[0].Values["temperature_2m"].Value);
        Assert.NotNull(reused[0].Values["temperature_2m"].Value);
        Assert.Equal(25, reused[0].Values["temperature_2m"].AgeMinutesAtAcquisition);

        NoaaGfsWeather CreateBackend(IMemoryCache memory)
        {
            var google = new LocalWeatherCredentials("testing", "weather-cache");
            google.Update("test-token");
            var documents = new FirestoreWeatherGridStore(new ClientFactory(remote), new ConfigurationBuilder().Build(), clock, google);
            var grids = new EncodedWeatherGridCache(documents, clock, NullLogger<EncodedWeatherGridCache>.Instance);
            return new NoaaGfsWeather(new ClientFactory(upstream), memory, NullLogger<NoaaGfsWeather>.Instance, grids: grids);
        }
    }

    [Fact]
    public void InterpolatesContinuousFieldsAcrossTheGridAndKeepsCategoricalPixels()
    {
        var grid = new GfsGribSubset.Grid(179, 1, [0, 1], 2);
        var frame = new GfsGribSubset.Frame(Run, Run, Run, grid, [2, 8, null, 6]);
        Assert.Equal(16d / 3, frame.Interpolate(0.5, 179.5));
        Assert.Null(frame.Interpolate(1, 179));
        Assert.Equal(6, frame.Sample(0.9, -180));
    }

    [Fact]
    public void ConvertsVolumetricShortfallToWaterDepth()
    {
        Assert.Equal(40, NoaaGfsWeather.DeficitToFieldCapacity(0.2, 0.3, 400)!.Value, 8);
        Assert.Equal(100, NoaaGfsWeather.DeficitToFieldCapacity(0.2, 0.3, 1000)!.Value, 8);
        Assert.Equal(0, NoaaGfsWeather.DeficitToFieldCapacity(0.4, 0.3, 400));
        Assert.Null(NoaaGfsWeather.DeficitToFieldCapacity(null, 0.3, 400));
    }

    [Fact]
    public void UsesLogPressureInterpolationAndRejectsUnbracketedCloudPressure()
    {
        var profile = new (double, double)[] { (100_000, 0), (90_000, 1200), (80_000, 2200) };
        Assert.Equal(600d, NoaaGfsWeather.HeightAtPressure(profile, Math.Sqrt(100_000d * 90_000))!.Value, 8);
        Assert.Null(NoaaGfsWeather.HeightAtPressure(profile, 79_999));
        Assert.Null(NoaaGfsWeather.HeightAtPressure(profile, 102_000));
    }

    [Fact]
    public void UnpacksTemplate53LatLonAndSlicesNegativeAndPrimeMeridianTiles()
    {
        const int cols = 1440;
        const int rows = 721;
        var expected = new double[rows * cols];
        // Populate values around west=-124..west=-120 (lon 236..240E) and prime meridian -4..0 (356..360, 0)
        // with non-monotonic spatial differences (negative minsd) in template 5.3 order 2.
        var ints = new long[rows * cols];
        for (var r = 0; r < rows; r++)
        {
            var lat = 90d - r * 0.25;
            for (var c = 0; c < cols; c++)
            {
                var lon = c * 0.25;
                var val = 2800L + (long)Math.Round(120 * Math.Sin((lat + lon) * Math.PI / 45d));
                ints[r * cols + c] = val;
                expected[r * cols + c] = val * 0.1;
            }
        }

        var globalGrib = EncodeTemplate53Message(cols, rows, template3Type: 0, firstLatDeg: 90d, firstLonDeg: 0d,
            diMicro: 250_000, djOrN: 250_000, scan: 0, decimalScale: 1, reference: 0f, ints);
        var unpacked = GfsGribSubset.UnpackGlobalMessage(globalGrib);
        Assert.Single(unpacked);

        // Negative longitude tile: [-124, -120] x [36, 40]
        var westUsBytes = GfsGribSubset.SliceToSimpleGrib2(unpacked, -124, 36);
        var westUsFrames = GfsGribSubset.Parse(westUsBytes);
        var westUsFrame = Assert.Single(westUsFrames.Values);
        Assert.Equal(17, westUsFrame.Grid.Columns);
        Assert.Equal(17, westUsFrame.Grid.Latitudes.Length);
        var sampleRow = (int)((90d - 37.5) * 4);
        var sampleCol = (int)((360d - 122.25) * 4);
        Assert.InRange(Math.Abs(westUsFrame.Interpolate(37.5, -122.25)!.Value - expected[sampleRow * cols + sampleCol]), 0, 0.01);

        // Prime-meridian wraparound tile: [-4, 0] x [4, 8] (longitude wraps 356..359.75 -> 0.00)
        var primeBytes = GfsGribSubset.SliceToSimpleGrib2(unpacked, -4, 4);
        var primeFrames = GfsGribSubset.Parse(primeBytes);
        var primeFrame = Assert.Single(primeFrames.Values);
        Assert.Equal(17, primeFrame.Grid.Columns);
        var row5 = (int)((90d - 5.25) * 4);
        var colWest = (int)(356.5 * 4);
        var colZero = 0;
        Assert.InRange(Math.Abs(primeFrame.Interpolate(5.25, -3.5)!.Value - expected[row5 * cols + colWest]), 0, 0.01);
        Assert.InRange(Math.Abs(primeFrame.Interpolate(5.25, 0.0)!.Value - expected[row5 * cols + colZero]), 0, 0.01);
    }

    [Fact]
    public void UnpacksGaussianGridAndAllMissingOceanBitmapAndSlicesCleanly()
    {
        const int cols = 256;
        const int rows = 128; // N = 64 Gaussian parallels
        // Extract North-most Gaussian latitude so Section 3 matches ReadGrid tolerance.
        var lats = ComputeGaussianLatitudes(rows);
        var ints = new long[rows * cols];
        for (var r = 0; r < rows; r++)
            for (var c = 0; c < cols; c++)
                ints[r * cols + c] = 500 + (r * 3 + c * 5) % 400;

        var gaussianGrib = EncodeTemplate53Message(cols, rows, template3Type: 40, firstLatDeg: lats[^1], firstLonDeg: 0d,
            diMicro: 1_406_250, djOrN: rows / 2, scan: 0, decimalScale: 0, reference: 0f, ints);
        var unpackedGaussian = GfsGribSubset.UnpackGlobalMessage(gaussianGrib);
        var slicedGaussian = GfsGribSubset.SliceToSimpleGrib2(unpackedGaussian, 100, 0);
        var parsedGaussian = GfsGribSubset.Parse(slicedGaussian);
        var gaussianFrame = Assert.Single(parsedGaussian.Values);
        Assert.InRange(gaussianFrame.Interpolate(2.0, 102.0)!.Value, 500, 900);

        // Zero valid values with an all-zero ocean bitmap (Template 5.3 with count = 0)
        var allMissingGrib = EncodeAllMissingOceanMessage(1440, 721);
        var unpackedOcean = GfsGribSubset.UnpackGlobalMessage(allMissingGrib);
        var slicedOcean = GfsGribSubset.SliceToSimpleGrib2(unpackedOcean, -140, 0);
        var parsedOcean = GfsGribSubset.Parse(slicedOcean);
        var oceanFrame = Assert.Single(parsedOcean.Values);
        Assert.All(oceanFrame.Data, value => Assert.Null(value));
    }

    [Fact]
    public void SelectByteRangesSelects61FieldsPrefersInstantaneousAndCoalescesWithinGap()
    {
        var weatherLines = new[]
        {
            "1:0:d=2026111500:HGT:cloud ceiling:6 hour fcst:",
            "2:10000:d=2026111500:CWAT:entire atmosphere (considered as a single layer):6 hour fcst:",
            "3:20000:d=2026111500:CRAIN:surface:5-6 hour ave fcst:",
            "4:30000:d=2026111500:CRAIN:surface:0-6 hour ave fcst:",
            "5:40000:d=2026111500:CRAIN:surface:6 hour fcst:",
            "6:50000:d=2026111500:CFRZR:surface:5-6 hour ave fcst:",
            "7:60000:d=2026111500:CFRZR:surface:0-6 hour ave fcst:",
            "8:70000:d=2026111500:CICEP:surface:6 hour fcst:",
            "9:80000:d=2026111500:CSNOW:surface:6 hour fcst:",
            "10:90000:d=2026111500:FLDCP:surface:6 hour fcst:",
            "11:100000:d=2026111500:WILT:surface:6 hour fcst:",
            "12:110000:d=2026111500:TMP:2 m above ground:6 hour fcst:",
            "13:120000:d=2026111500:DPT:2 m above ground:6 hour fcst:",
            "14:130000:d=2026111500:RH:2 m above ground:6 hour fcst:",
            "15:140000:d=2026111500:UGRD:10 m above ground:6 hour fcst:",
            "16:150000:d=2026111500:VGRD:10 m above ground:6 hour fcst:",
            "17:160000:d=2026111500:GUST:surface:6 hour fcst:",
            "18:170000:d=2026111500:VIS:surface:6 hour fcst:",
            "19:180000:d=2026111500:TCDC:entire atmosphere:5-6 hour ave fcst:",
            "20:190000:d=2026111500:PWAT:entire atmosphere (considered as a single layer):6 hour fcst:",
            "21:200000:d=2026111500:TMP:surface:6 hour fcst:",
            "22:210000:d=2026111500:PRES:surface:6 hour fcst:",
            "23:220000:d=2026111500:DSWRF:surface:0-6 hour ave fcst:",
            "24:230000:d=2026111500:HGT:surface:6 hour fcst:",
            "25:240000:d=2026111500:SNOD:surface:6 hour fcst:",
            "26:250000:d=2026111500:HGT:1000 mb:6 hour fcst:",
            "27:260000:d=2026111500:HGT:925 mb:6 hour fcst:",
            "28:270000:d=2026111500:HGT:850 mb:6 hour fcst:",
            "29:280000:d=2026111500:HGT:700 mb:6 hour fcst:",
            "30:290000:d=2026111500:HGT:600 mb:6 hour fcst:",
            "31:300000:d=2026111500:HGT:500 mb:6 hour fcst:",
            "32:310000:d=2026111500:HGT:400 mb:6 hour fcst:",
            "33:320000:d=2026111500:HGT:300 mb:6 hour fcst:",
            "34:330000:d=2026111500:HGT:250 mb:6 hour fcst:",
            "35:340000:d=2026111500:HGT:200 mb:6 hour fcst:",
            "36:350000:d=2026111500:HGT:150 mb:6 hour fcst:",
            "37:360000:d=2026111500:HGT:100 mb:6 hour fcst:",
            "38:370000:d=2026111500:PRES:low cloud bottom level:6 hour fcst:",
            "39:380000:d=2026111500:PRES:low cloud top level:6 hour fcst:",
            "40:390000:d=2026111500:PRES:middle cloud bottom level:6 hour fcst:",
            "41:400000:d=2026111500:PRES:middle cloud top level:6 hour fcst:",
            "42:410000:d=2026111500:PRES:high cloud bottom level:6 hour fcst:",
            "43:420000:d=2026111500:PRES:high cloud top level:6 hour fcst:",
            "44:430000:d=2026111500:CLWMR:925 mb:6 hour fcst:",
            "45:440000:d=2026111500:ICMR:925 mb:6 hour fcst:",
            "46:450000:d=2026111500:CLWMR:850 mb:6 hour fcst:",
            "47:460000:d=2026111500:ICMR:850 mb:6 hour fcst:",
            "48:470000:d=2026111500:CLWMR:700 mb:6 hour fcst:",
            "49:480000:d=2026111500:ICMR:700 mb:6 hour fcst:",
            "50:490000:d=2026111500:CLWMR:500 mb:6 hour fcst:",
            "51:500000:d=2026111500:ICMR:500 mb:6 hour fcst:",
            "52:510000:d=2026111500:CLWMR:300 mb:6 hour fcst:",
            "53:520000:d=2026111500:ICMR:300 mb:6 hour fcst:",
            "54:530000:d=2026111500:TMP:925 mb:6 hour fcst:",
            "55:540000:d=2026111500:RH:925 mb:6 hour fcst:",
            "56:550000:d=2026111500:UGRD:925 mb:6 hour fcst:",
            "57:560000:d=2026111500:VGRD:925 mb:6 hour fcst:",
            "58:570000:d=2026111500:TMP:850 mb:6 hour fcst:",
            "59:580000:d=2026111500:RH:850 mb:6 hour fcst:",
            "60:590000:d=2026111500:UGRD:850 mb:6 hour fcst:",
            "61:600000:d=2026111500:VGRD:850 mb:6 hour fcst:",
            "62:610000:d=2026111500:SOILW:0-0.1 m below ground:6 hour fcst:",
            "63:620000:d=2026111500:SOILW:0.1-0.4 m below ground:6 hour fcst:",
            "64:630000:d=2026111500:UNNEEDED:surface:6 hour fcst:",
            "65:850000:d=2026111500:SOILW:0.4-1 m below ground:anl:",
        };
        var ranges = GfsCloudArchive.SelectByteRanges(string.Join('\n', weatherLines), isSnow: false);
        var entries = ranges.SelectMany(r => r.Entries).ToArray();
        Assert.Equal(61, entries.Length);
        Assert.Equal(2, ranges.Count);
        Assert.Equal(40000, entries.Single(e => e.Var == "CRAIN").Start);
        Assert.Equal(50000, entries.Single(e => e.Var == "CFRZR").Start);
        Assert.Null(ranges[^1].End);
        Assert.Null(entries[^1].End);

        var snowIdx = "1:0:d=2026111500:TMP:surface:6 hour fcst:\n2:15000:d=2026111500:SNOWC:surface:6 hour fcst:\n";
        var snowRanges = GfsCloudArchive.SelectByteRanges(snowIdx, isSnow: true);
        var snowEntry = Assert.Single(Assert.Single(snowRanges).Entries);
        Assert.Equal("SNOWC", snowEntry.Var);
        Assert.Equal(15000, snowEntry.Start);
        Assert.Null(snowEntry.End);
    }

    private static double[] ComputeGaussianLatitudes(int count)
    {
        var rows = new double[count];
        for (var i = 0; i < count / 2; i++)
        {
            var root = Math.Cos(Math.PI * (i + 0.75) / (count + 0.5));
            for (var iteration = 0; iteration < 10; iteration++)
            {
                var previous = 0d;
                var current = 1d;
                for (var degree = 1; degree <= count; degree++)
                    (previous, current) = (current, ((2 * degree - 1) * root * current - (degree - 1) * previous) / degree);
                root -= current / (count * (root * current - previous) / (root * root - 1));
            }
            var latitude = Math.Asin(root) * 180 / Math.PI;
            rows[i] = -latitude;
            rows[count - 1 - i] = latitude;
        }
        return rows;
    }

    private static byte[] EncodeTemplate53Message(int cols, int rows, ushort template3Type, double firstLatDeg,
        double firstLonDeg, uint diMicro, uint djOrN, byte scan, int decimalScale, float reference, long[] ints)
    {
        var count = ints.Length;
        var ival1 = ints[0];
        var ival2 = ints[1];
        var diffs = new long[count];
        long minsd = 0;
        for (var i = 2; i < count; i++)
        {
            var d2 = ints[i] - 2 * ints[i - 1] + ints[i - 2];
            diffs[i] = d2;
            if (i == 2 || d2 < minsd) minsd = d2;
        }
        var adjusted = new ulong[count];
        for (var i = 2; i < count; i++) adjusted[i] = (ulong)(diffs[i] - minsd);
        var half = count / 2;
        var x1 = new[] { adjusted[..half].Min(), adjusted[half..].Min() };
        var gl = new[] { half, count - half };
        const int bits = 16;

        var sec1 = BuildSection1(Run);
        var sec3 = BuildSection3(cols, rows, template3Type, firstLatDeg, firstLonDeg, diMicro, djOrN, scan);
        var sec4 = BuildSection4(6);

        var sec5 = new byte[49];
        BinaryPrimitives.WriteUInt32BigEndian(sec5.AsSpan(0, 4), 49u);
        sec5[4] = 5;
        BinaryPrimitives.WriteUInt32BigEndian(sec5.AsSpan(5, 4), (uint)count);
        BinaryPrimitives.WriteUInt16BigEndian(sec5.AsSpan(9, 2), 3);
        BinaryPrimitives.WriteSingleBigEndian(sec5.AsSpan(11, 4), reference);
        BinaryPrimitives.WriteUInt16BigEndian(sec5.AsSpan(15, 2), 0); // binary scale = 0
        WriteSignMag16(sec5.AsSpan(17, 2), decimalScale);
        sec5[19] = 16; // nbits for X1
        sec5[21] = 1;
        sec5[22] = 0; // miss = 0
        BinaryPrimitives.WriteUInt32BigEndian(sec5.AsSpan(31, 4), 2u); // ng = 2
        sec5[35] = 0;
        sec5[36] = 8; // 8 bits for gw
        BinaryPrimitives.WriteUInt32BigEndian(sec5.AsSpan(37, 4), (uint)half);
        sec5[41] = 1;
        BinaryPrimitives.WriteUInt32BigEndian(sec5.AsSpan(42, 4), (uint)gl[1]);
        sec5[46] = 8; // 8 bits for gl
        sec5[47] = 2; // spatial difference order = 2
        sec5[48] = 2; // extraOctets = 2 (16-bit sign-magnitude)

        var sec6 = new byte[] { 0, 0, 0, 6, 6, 255 };
        // Section 7 data: 6 header bytes (ival1, ival2, minsd) + 4 x1 bytes + 2 gw bytes + 2 gl bytes + count * 2 bytes
        var dataBytes = 6 + 4 + 2 + 2 + count * 2;
        var sec7 = new byte[5 + dataBytes];
        BinaryPrimitives.WriteUInt32BigEndian(sec7.AsSpan(0, 4), (uint)sec7.Length);
        sec7[4] = 7;
        var payload = sec7.AsSpan(5);
        WriteSignMag16(payload[..2], (int)ival1);
        WriteSignMag16(payload[2..4], (int)ival2);
        WriteSignMag16(payload[4..6], (int)minsd);
        BinaryPrimitives.WriteUInt16BigEndian(payload[6..8], (ushort)x1[0]);
        BinaryPrimitives.WriteUInt16BigEndian(payload[8..10], (ushort)x1[1]);
        payload[10] = bits;
        payload[11] = bits;
        payload[12] = 0;
        payload[13] = 0;
        var pos = 14;
        for (var i = 0; i < count; i++)
        {
            var g = i < half ? 0 : 1;
            BinaryPrimitives.WriteUInt16BigEndian(payload.Slice(pos, 2), (ushort)(adjusted[i] - x1[g]));
            pos += 2;
        }
        return WrapGrib2Message(sec1, sec3, sec4, sec5, sec6, sec7);
    }

    private static byte[] EncodeAllMissingOceanMessage(int cols, int rows)
    {
        var gridCount = cols * rows;
        var sec1 = BuildSection1(Run);
        var sec3 = BuildSection3(cols, rows, 0, 90d, 0d, 250_000, 250_000, 0);
        var sec4 = BuildSection4(6);
        var sec5 = new byte[49];
        BinaryPrimitives.WriteUInt32BigEndian(sec5.AsSpan(0, 4), 49u);
        sec5[4] = 5;
        BinaryPrimitives.WriteUInt32BigEndian(sec5.AsSpan(5, 4), 0u); // count = 0
        BinaryPrimitives.WriteUInt16BigEndian(sec5.AsSpan(9, 2), 3);
        sec5[47] = 2;
        sec5[48] = 1;
        var sec6 = new byte[6 + (gridCount + 7) / 8];
        BinaryPrimitives.WriteUInt32BigEndian(sec6.AsSpan(0, 4), (uint)sec6.Length);
        sec6[4] = 6;
        sec6[5] = 0; // bitmap with all zeros
        var sec7 = new byte[] { 0, 0, 0, 5, 7 };
        return WrapGrib2Message(sec1, sec3, sec4, sec5, sec6, sec7);
    }

    private static byte[] BuildSection1(DateTimeOffset run)
    {
        var s = new byte[21];
        BinaryPrimitives.WriteUInt32BigEndian(s.AsSpan(0, 4), 21u);
        s[4] = 1;
        BinaryPrimitives.WriteUInt16BigEndian(s.AsSpan(12, 2), (ushort)run.Year);
        s[14] = (byte)run.Month;
        s[15] = (byte)run.Day;
        s[16] = (byte)run.Hour;
        return s;
    }

    private static byte[] BuildSection3(int cols, int rows, ushort template, double lat1, double lon1, uint di, uint djOrN, byte scan)
    {
        var s = new byte[72];
        BinaryPrimitives.WriteUInt32BigEndian(s.AsSpan(0, 4), 72u);
        s[4] = 3;
        BinaryPrimitives.WriteUInt32BigEndian(s.AsSpan(6, 4), (uint)(cols * rows));
        BinaryPrimitives.WriteUInt16BigEndian(s.AsSpan(12, 2), template);
        BinaryPrimitives.WriteUInt32BigEndian(s.AsSpan(30, 4), (uint)cols);
        BinaryPrimitives.WriteUInt32BigEndian(s.AsSpan(34, 4), (uint)rows);
        WriteSignMag32(s.AsSpan(46, 4), (long)Math.Round(lat1 * 1_000_000d));
        WriteSignMag32(s.AsSpan(50, 4), (long)Math.Round(lon1 * 1_000_000d));
        BinaryPrimitives.WriteUInt32BigEndian(s.AsSpan(63, 4), di);
        BinaryPrimitives.WriteUInt32BigEndian(s.AsSpan(67, 4), djOrN);
        s[71] = scan;
        return s;
    }

    private static byte[] BuildSection4(int leadHours)
    {
        var s = new byte[34];
        BinaryPrimitives.WriteUInt32BigEndian(s.AsSpan(0, 4), 34u);
        s[4] = 4;
        BinaryPrimitives.WriteUInt16BigEndian(s.AsSpan(7, 2), 0); // Template 4.0
        s[9] = 0; // Category temperature
        s[10] = 0; // Number TMP
        s[17] = 1; // Hour
        BinaryPrimitives.WriteUInt32BigEndian(s.AsSpan(18, 4), (uint)leadHours);
        s[22] = 103; // Height above ground
        BinaryPrimitives.WriteUInt32BigEndian(s.AsSpan(24, 4), 2u);
        return s;
    }

    private static byte[] WrapGrib2Message(params byte[][] sections)
    {
        var total = 16 + sections.Sum(s => s.Length) + 4;
        var buf = new byte[total];
        "GRIB"u8.CopyTo(buf);
        buf[6] = 0; // Discipline 0
        buf[7] = 2; // Edition 2
        BinaryPrimitives.WriteUInt64BigEndian(buf.AsSpan(8, 8), (ulong)total);
        var pos = 16;
        foreach (var sec in sections)
        {
            sec.CopyTo(buf, pos);
            pos += sec.Length;
        }
        "7777"u8.CopyTo(buf.AsSpan(pos, 4));
        return buf;
    }

    private static void WriteSignMag16(Span<byte> dest, int value) =>
        BinaryPrimitives.WriteUInt16BigEndian(dest, value < 0 ? (ushort)(0x8000 | -value) : (ushort)value);

    private static void WriteSignMag32(Span<byte> dest, long value) =>
        BinaryPrimitives.WriteUInt32BigEndian(dest, value < 0 ? 0x8000_0000u | (uint)(-value) : (uint)value);

    private static FirmsHotspot Spot(DateTimeOffset acquired, double latitude, double longitude) =>
        new(latitude, longitude, 350, null, null, null, acquired, "T", "MODIS", "MODIS_NRT", "80", 80, "6.1NRT", 35, "D");

    private sealed class ClientFactory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, disposeHandler: false);
    }

    private sealed class FixedClock(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }

    private sealed class GridDocuments : HttpMessageHandler
    {
        internal ConcurrentDictionary<string, JsonElement> EncodedDocuments { get; } = new();

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            using var json = await request.Content!.ReadFromJsonAsync<JsonDocument>(cancellationToken: cancellationToken);
            if (request.RequestUri!.AbsolutePath.EndsWith(":batchGet", StringComparison.Ordinal))
            {
                var name = json!.RootElement.GetProperty("documents")[0].GetString()!;
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = EncodedDocuments.TryGetValue(name, out var fields)
                        ? JsonContent.Create(new[] { new { found = new { name, fields, updateTime = "2026-11-15T06:24:00Z" } } })
                        : JsonContent.Create(new[] { new { missing = name } }),
                };
            }
            var write = json!.RootElement.GetProperty("writes")[0];
            var update = write.GetProperty("update");
            var path = update.GetProperty("name").GetString()!;
            Assert.Contains("/weatherGridCache/liveV1/hotspotWeatherV1/", path);
            Assert.False(write.GetProperty("currentDocument").GetProperty("exists").GetBoolean());
            Assert.True(EncodedDocuments.TryAdd(path, update.GetProperty("fields").Clone()));
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = JsonContent.Create(new { status = new[] { new { } } }) };
        }
    }

    private sealed class FixtureHandler : HttpMessageHandler
    {
        public ConcurrentBag<string> Urls { get; } = [];
        public ConcurrentBag<string> PublicationUrls { get; } = [];

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var url = request.RequestUri!;
            if (request.Method == HttpMethod.Head)
            {
                PublicationUrls.Add(url.AbsoluteUri);
                var afterHour = url.AbsolutePath.Contains("/00/", StringComparison.Ordinal) &&
                    (url.AbsolutePath.EndsWith("f006", StringComparison.Ordinal) || url.AbsolutePath.EndsWith("f006.grib2", StringComparison.Ordinal));
                var publication = new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent([]) };
                publication.Content.Headers.LastModified = afterHour ? Run.AddHours(6).AddMinutes(10) : Run.AddHours(2);
                return Task.FromResult(publication);
            }
            Urls.Add(url.AbsoluteUri);
            // Real NOMADS subsets from the run at 00 UTC, valid 06 UTC, 15 Nov 2026.
            var file = url.AbsolutePath.Contains("sflux", StringComparison.Ordinal) ? "gfs-snow.grb2" : "gfs-weather.grb2";
            var bytes = File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "Weather", "Fixtures", file));
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent(bytes) });
        }
    }
}
