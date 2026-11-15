using System.Buffers.Binary;
using System.Collections.Concurrent;
using System.Globalization;
using System.IO.Compression;
using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using NasaSpaceApps.Api.Firms;
using NasaSpaceApps.Api.LandCover;
using NasaSpaceApps.Api.Weather;
using static NasaSpaceApps.Api.Weather.GfsGribSubset;

namespace NasaSpaceApps.Harmonization.Export;

internal readonly record struct WeatherSamplePoint(
    double Latitude,
    double Longitude,
    DateTimeOffset AcquiredAtUtc);

/// <summary>Simple HTTP client factory for offline batch ingestion.</summary>
internal sealed class OfflineHttpClientFactory : IHttpClientFactory, IDisposable
{
    private readonly SocketsHttpHandler _handler = new()
    {
        PooledConnectionLifetime = TimeSpan.FromMinutes(10),
        MaxConnectionsPerServer = 32,
        AutomaticDecompression = DecompressionMethods.All,
    };

    public HttpClient CreateClient(string name)
    {
        var client = new HttpClient(_handler, disposeHandler: false)
        {
            Timeout = TimeSpan.FromSeconds(60),
        };
        if (name == "CelesTrak")
            client.BaseAddress = new Uri("https://celestrak.org/");
        client.DefaultRequestHeaders.UserAgent.ParseAdd("EarthFireCalendar-Research/1.0");
        return client;
    }

    public void Dispose() => _handler.Dispose();
}

/// <summary>Enriches hundreds of thousands of locations globally with C3S land cover, Copernicus GWIS, and NOAA GFS weather.</summary>
internal sealed class GlobalWeatherBatchEnricher : IDisposable
{
    private const int GwisWidth = 2880;
    private const int GwisHeight = 1440;
    private const double GwisPixelDeg = 360.0 / GwisWidth;
    private const string GwisWmsUrl = "https://maps.effis.emergency.copernicus.eu/gwis";
    private const string GcsGfsRoot = "https://storage.googleapis.com/global-forecast-system/";
    private const string S3GfsRoot = "https://noaa-gfs-bdp-pds.s3.amazonaws.com/";

    private static readonly (string LayerName, string ShortName)[] GwisLayers =
    [
        ("ecmwf.fwi", "fwi"),
        ("ecmwf.ffmc", "ffmc"),
        ("ecmwf.dc", "dc"),
        ("ecmwf.extra.lightning", "lightning"),
    ];

    private static readonly Parameter ParamPrate = new(0, 1, 7, 1, 0, 0);
    private static readonly Parameter ParamApcp = new(0, 1, 8, 1, 0, 0);
    private static readonly Parameter ParamSnowCover = new(0, 1, 42, 1, 0, 0);

    private readonly OfflineHttpClientFactory _httpFactory = new();
    private readonly ILoggerFactory _loggerFactory = LoggerFactory.Create(b =>
        b.SetMinimumLevel(LogLevel.Warning));

    public async Task<IReadOnlyList<FirmsHotspot>> EnrichLandCoverAsync(
        IReadOnlyList<FirmsHotspot> spots,
        string cacheDir,
        CancellationToken cancellationToken)
    {
        using var landCover = new PlanetaryComputerLandCover(
            _httpFactory, _loggerFactory.CreateLogger<PlanetaryComputerLandCover>());
        var blockDir = Path.Combine(cacheDir, "landcover");
        Console.WriteLine($"[LandCover] Enriching {spots.Count:N0} spots using C3S 2019 300 m COG blocks...");
        var enriched = await landCover.EnrichOfflineCompleteAsync(spots, world: false, blockDir, cancellationToken)
            .ConfigureAwait(false);
        var hits = enriched.Count(s => s.LandCover is { DominantCode: > 0 });
        Console.WriteLine($"[LandCover] Complete: {hits:N0}/{spots.Count:N0} ({100.0 * hits / Math.Max(1, spots.Count):F2}%) covered.");
        return enriched;
    }

    public async Task<WeatherFeatures[]> EnrichWeatherAsync(
        IReadOnlyList<WeatherSamplePoint> queries,
        string cacheDir,
        CancellationToken cancellationToken)
    {
        var results = new WeatherFeatures[queries.Count];
        var gwisDir = Path.Combine(cacheDir, "gwis");
        var gfsDir = Path.Combine(cacheDir, "gfs");
        Directory.CreateDirectory(gwisDir);
        Directory.CreateDirectory(gfsDir);

        // 1. Sample Copernicus GWIS daily global rasters date by date (keeps RAM ~80 MB).
        var gwisData = await SampleAllGwisAsync(queries, gwisDir, cancellationToken).ConfigureAwait(false);

        // 2. Resolve published NOAA GFS runs for all query timestamps (strictly published <= AcquiredAtUtc).
        var publicationsPath = Path.Combine(gfsDir, "publications.json");
        var pubCache = LoadPublications(publicationsPath);
        using var client = _httpFactory.CreateClient("GfsPub");

        var byValidHour = new Dictionary<DateTimeOffset, List<int>>();
        for (var i = 0; i < queries.Count; i++)
        {
            var validHour = HourFloor(queries[i].AcquiredAtUtc);
            if (!byValidHour.TryGetValue(validHour, out var list))
                byValidHour[validHour] = list = [];
            list.Add(i);
        }

        Console.WriteLine($"[GFS] Resolving published runs across {byValidHour.Count} valid hours for {queries.Count:N0} query points...");
        var weatherGroupByRunHour = new Dictionary<(DateTimeOffset Run, DateTimeOffset Valid), List<int>>();
        var snowGroupByRunHour = new Dictionary<(DateTimeOffset Run, DateTimeOffset Valid), List<int>>();
        var noWeatherFrameCount = 0;

        foreach (var (validHour, indices) in byValidHour.OrderBy(kv => kv.Key))
        {
            var minAcq = indices.Min(i => queries[i].AcquiredAtUtc);
            var candidateRuns = EnumerateCandidateRuns(validHour).ToArray();
            var pubWeather = await ResolvePublishedDatesAsync(client, candidateRuns, validHour, minAcq, isSnow: false, pubCache, cancellationToken)
                .ConfigureAwait(false);
            var pubSnow = await ResolvePublishedDatesAsync(client, candidateRuns, validHour, minAcq, isSnow: true, pubCache, cancellationToken)
                .ConfigureAwait(false);

            foreach (var idx in indices)
            {
                var acq = queries[idx].AcquiredAtUtc;
                DateTimeOffset? chosenW = null;
                foreach (var run in candidateRuns)
                {
                    if (pubWeather.TryGetValue(run, out var p) && p is { } pubTs && pubTs >= run && pubTs <= acq)
                    {
                        chosenW = run;
                        break;
                    }
                }
                if (chosenW is { } rw)
                {
                    var key = (rw, validHour);
                    if (!weatherGroupByRunHour.TryGetValue(key, out var list))
                        weatherGroupByRunHour[key] = list = [];
                    list.Add(idx);
                }
                else
                {
                    noWeatherFrameCount++;
                }

                DateTimeOffset? chosenS = null;
                foreach (var run in candidateRuns)
                {
                    if (pubSnow.TryGetValue(run, out var p) && p is { } pubTs && pubTs >= run && pubTs <= acq)
                    {
                        chosenS = run;
                        break;
                    }
                }
                if (chosenS is { } rs)
                {
                    var key = (rs, validHour);
                    if (!snowGroupByRunHour.TryGetValue(key, out var list))
                        snowGroupByRunHour[key] = list = [];
                    list.Add(idx);
                }
            }
        }
        SavePublications(publicationsPath, pubCache);
        Console.WriteLine($"[GFS] Matched {weatherGroupByRunHour.Count} (run, validHour) weather groups ({noWeatherFrameCount} points had no frame); {snowGroupByRunHour.Count} snow groups.");

        // 3. Process snow cover per (run, validHour) sequentially (compact array per point).
        var gfsArchive = new GfsCloudArchive(_httpFactory, TimeProvider.System, _loggerFactory.CreateLogger<GfsCloudArchive>());
        var snowCover = new double?[queries.Count];
        var snowCacheDir = Path.Combine(gfsDir, "snow_samples");
        Directory.CreateDirectory(snowCacheDir);
        var snowDone = 0;
        foreach (var ((run, valid), indices) in snowGroupByRunHour.OrderBy(kv => kv.Key.Valid).ThenBy(kv => kv.Key.Run))
        {
            cancellationToken.ThrowIfCancellationRequested();
            var sampleMap = await LoadOrSampleSnowHourAsync(gfsArchive, run, valid, queries, indices, snowCacheDir, cancellationToken)
                .ConfigureAwait(false);
            foreach (var idx in indices)
            {
                if (sampleMap.TryGetValue(PointKey(queries[idx]), out var sc))
                    snowCover[idx] = sc;
            }
            snowDone++;
            if (snowDone % 20 == 0 || snowDone == snowGroupByRunHour.Count)
                Console.WriteLine($"[GFS snow] Processed {snowDone}/{snowGroupByRunHour.Count} hours");
        }

        // 4. Process full GFS 0.25° weather (+ PRATE/APCP) sequentially one (run, validHour) at a time (< 800 MB RAM).
        var gfsSamples = new GfsSampleRow[queries.Count];
        var weatherCacheDir = Path.Combine(gfsDir, "wx_samples");
        Directory.CreateDirectory(weatherCacheDir);
        var wxDone = 0;
        foreach (var ((run, valid), indices) in weatherGroupByRunHour.OrderBy(kv => kv.Key.Valid).ThenBy(kv => kv.Key.Run))
        {
            cancellationToken.ThrowIfCancellationRequested();
            var sampleMap = await LoadOrSampleWeatherHourAsync(gfsArchive, run, valid, queries, indices, weatherCacheDir, cancellationToken)
                .ConfigureAwait(false);
            foreach (var idx in indices)
            {
                if (sampleMap.TryGetValue(PointKey(queries[idx]), out var row))
                    gfsSamples[idx] = row;
            }
            wxDone++;
            if (wxDone % 15 == 0 || wxDone == weatherGroupByRunHour.Count)
                Console.WriteLine($"[GFS 0.25°] Processed {wxDone}/{weatherGroupByRunHour.Count} hours");
        }

        // 5. Merge GFS + Snow + GWIS into final WeatherFeatures[].
        for (var i = 0; i < queries.Count; i++)
        {
            var g = gfsSamples[i];
            var gw = gwisData[i];
            var sc = snowCover[i];
            var gfsAvail = g.HasData;
            var gwisAvail = gw.Available;
            var leadH = g.HasData ? (queries[i].AcquiredAtUtc - g.Run).TotalHours : (double?)null;
            var ageMin = g.HasData ? (queries[i].AcquiredAtUtc - g.Valid).TotalMinutes : (double?)null;

            double? temp2mC = g.Temp2mK - 273.15;
            double? dew2mC = g.DewPoint2mK - 273.15;
            double? dewSpread = temp2mC is { } t && dew2mC is { } d ? t - d : null;
            double? surfTempC = g.SurfaceTempK - 273.15;
            double? surfPressHpa = g.SurfacePressurePa / 100.0;
            double? ws10 = Hypot(g.WindU10m, g.WindV10m);
            double? temp850C = g.Temp850K - 273.15;
            double? ws850 = Hypot(g.WindU850, g.WindV850);
            double? shear = ws850 is { } w8 && ws10 is { } w10 && g.WindU850 is { } u8 && g.WindV850 is { } v8 && g.WindU10m is { } u10 && g.WindV10m is { } v10
                ? Math.Sqrt((u8 - u10) * (u8 - u10) + (v8 - v10) * (v8 - v10))
                : null;
            var precipAny = (g.PrecipFlagAny > 0 || g.PrecipRateMmH > 0.05 || g.AccumPrecipMm > 0.05) ? 1 : 0;

            results[i] = new WeatherFeatures(
                GfsAvailable: gfsAvail,
                GwisAvailable: gwisAvail,
                GfsAgeMinutes: ageMin,
                GfsLeadHours: leadH,
                CloudCoverPct: g.CloudCoverPct,
                ColumnCloudWaterKgM2: g.ColumnCloudWater,
                CloudCeilingAglM: g.CloudCeilingAgl,
                VisibilityM: g.VisibilityM,
                ShortwaveRadiationWm2: g.ShortwaveWm2,
                PrecipRateMmH: g.PrecipRateMmH,
                AccumPrecipMm: g.AccumPrecipMm,
                PrecipAny: precipAny,
                PwatKgM2: g.PwatKgM2,
                Temp2mC: temp2mC,
                DewPoint2mC: dew2mC,
                DewPointSpreadC: dewSpread,
                Rh2mPct: g.Rh2mPct,
                VpdKpa: g.VpdKpa,
                SurfaceTempC: surfTempC,
                SurfacePressureHpa: surfPressHpa,
                WindU10mMs: g.WindU10m,
                WindV10mMs: g.WindV10m,
                WindSpeed10mMs: ws10,
                WindGustMs: g.WindGustMs,
                Temp850C: temp850C,
                Rh850Pct: g.Rh850Pct,
                WindSpeed850Ms: ws850,
                WindShear10to850Ms: shear,
                SoilMoistureTop: g.SoilMoistureTop,
                Paw40Pct: g.Paw40Pct,
                Paw100Pct: g.Paw100Pct,
                SoilDeficit40Mm: g.SoilDeficit40Mm,
                SnowCoverPct: sc,
                SnowDepthCm: g.SnowDepthCm,
                GwisFwi: gw.Fwi,
                GwisFfmc: gw.Ffmc,
                GwisDc: gw.Dc,
                GwisLightning: gw.Lightning,
                GwisDangerClass: gw.Fwi is { } fwiVal ? CopernicusFireWeather.DangerClass((float)fwiVal) : null);
        }

        return results;
    }

    /// <summary>Converts an unpacked global GFS field directly to a sampling frame and fixes Western Hemisphere wrap-around.</summary>
    internal static double? SampleGlobalFrame(UnpackedField field, double lat, double lon, bool nearest)
    {
        var grid = field.Grid;
        var cols = grid.Columns;
        var lats = grid.Latitudes;
        var stepLon = Math.Abs(grid.LongitudeStep);
        var wrappedLonOffset = (((lon - grid.FirstLongitude) % 360.0) + 360.0) % 360.0;
        var colCoord = wrappedLonOffset / stepLon;

        if (nearest)
        {
            var col = ((int)Math.Round(colCoord)) % cols;
            var row = FindNearestRow(lats, lat);
            var val = field.Values[row * cols + col];
            return double.IsFinite(val) ? val : null;
        }

        var leftCol = ((int)Math.Floor(colCoord)) % cols;
        var isFullGlobe = Math.Abs(cols * stepLon - 360.0) < 0.5;
        var rightCol = isFullGlobe ? (leftCol + 1) % cols : Math.Min(leftCol + 1, cols - 1);
        var u = colCoord - Math.Floor(colCoord);

        var (row0, row1, yFrac) = FindLatitudeBracket(lats, lat);
        var sum = 0.0;
        var weight = 0.0;
        Accumulate(row0, leftCol, (1.0 - yFrac) * (1.0 - u));
        Accumulate(row0, rightCol, (1.0 - yFrac) * u);
        Accumulate(row1, leftCol, yFrac * (1.0 - u));
        Accumulate(row1, rightCol, yFrac * u);
        return weight > 0.0 ? sum / weight : null;

        void Accumulate(int r, int c, double f)
        {
            if (f <= 0.0) return;
            var v = field.Values[r * cols + c];
            if (!double.IsFinite(v)) return;
            sum += f * v;
            weight += f;
        }
    }

    internal static Dictionary<string, double?> BuildGlobalWeatherDictionary(
        IReadOnlyDictionary<Parameter, UnpackedField> fields,
        double lat,
        double lon)
    {
        // Convert unpacked global values directly to Frame-equivalent values, using wrap-safe global sampling.
        var dict = new Dictionary<Parameter, double?>();
        double? SampleParam(Parameter p, bool isFlag)
            => fields.TryGetValue(p, out var f) ? SampleGlobalFrame(f, lat, lon, nearest: isFlag) : null;

        // Replicate exact NoaaGfsWeather.BuildWeatherValues formulas over wrap-safe global sampling.
        var temp2m = SampleParam(new(0, 0, 0, 103, 2, 0), false);
        var dew2m = SampleParam(new(0, 0, 6, 103, 2, 0), false);
        var rh2m = SampleParam(new(0, 1, 1, 103, 2, 0), false);
        var windU10 = SampleParam(new(0, 2, 2, 103, 10, 0), false);
        var windV10 = SampleParam(new(0, 2, 3, 103, 10, 0), false);
        var gust = SampleParam(new(0, 2, 22, 1, 0, 0), false);
        var vis = SampleParam(new(0, 19, 0, 1, 0, 0), false);
        var cloudCover = SampleParam(new(0, 6, 1, 10, 0, 0), false);
        var cwat = SampleParam(new(0, 6, 6, 200, 0, 0), false);
        var pwat = SampleParam(new(0, 1, 3, 200, 0, 0), false);
        var surfTemp = SampleParam(new(0, 0, 0, 1, 0, 0), false);
        var surfPress = SampleParam(new(0, 3, 0, 1, 0, 0), false);
        var shortwave = SampleParam(new(0, 4, 192, 1, 0, 0), false);
        var surfHeight = SampleParam(new(0, 3, 5, 1, 0, 0), false);
        var ceiling = SampleParam(new(0, 3, 5, 215, 0, 0), false);
        double? ceilingAgl = ceiling - surfHeight;
        if (ceiling is not < 20_000 || ceilingAgl is not (>= 0 and < 20_000)) ceilingAgl = null;

        double? vpd = temp2m is double tk && dew2m is double dk
            ? Math.Max(0.0, SatKpa(tk) - SatKpa(dk))
            : null;

        var snowDepthM = SampleParam(new(0, 1, 11, 1, 0, 0), false);
        double? snowDepthCm = snowDepthM * 100.0;

        var prate = SampleParam(ParamPrate, false);
        double? prateMmH = prate * 3600.0;
        var apcp = SampleParam(ParamApcp, false);

        var rain = SampleParam(new(0, 1, 192, 1, 0, 0), true);
        var frz = SampleParam(new(0, 1, 193, 1, 0, 0), true);
        var ice = SampleParam(new(0, 1, 194, 1, 0, 0), true);
        var snow = SampleParam(new(0, 1, 195, 1, 0, 0), true);
        var precipFlag = ((rain ?? 0) > 0 || (frz ?? 0) > 0 || (ice ?? 0) > 0 || (snow ?? 0) > 0) ? 1.0 : 0.0;

        double? Above850(Parameter p)
        {
            var val = SampleParam(p, false);
            return surfPress > 85_000 ? val : null;
        }

        var temp850 = Above850(new(0, 0, 0, 100, 85_000, 0));
        var rh850 = Above850(new(0, 1, 1, 100, 85_000, 0));
        var windU850 = Above850(new(0, 2, 2, 100, 85_000, 0));
        var windV850 = Above850(new(0, 2, 3, 100, 85_000, 0));

        var wilt = SampleParam(new(2, 0, 201, 1, 0, 0), false);
        var cap = SampleParam(new(2, 3, 203, 1, 0, 0), false);
        var topSoil = SampleParam(new(2, 0, 192, 106, 0, 10), false);
        var midSoil = SampleParam(new(2, 0, 192, 106, 10, 40), false);
        var botSoil = SampleParam(new(2, 0, 192, 106, 40, 100), false);
        var w40 = (topSoil * 10 + midSoil * 30) / 40.0;
        var w100 = (topSoil * 10 + midSoil * 30 + botSoil * 60) / 100.0;
        double? paw40 = w40 is double s4 && wilt is double mn4 && cap is double mx4 && mx4 > mn4 && mn4 >= 0 && mx4 <= 1
            ? Math.Clamp(100.0 * (s4 - mn4) / (mx4 - mn4), 0.0, 100.0) : null;
        double? paw100 = w100 is double s1 && wilt is double mn1 && cap is double mx1 && mx1 > mn1 && mn1 >= 0 && mx1 <= 1
            ? Math.Clamp(100.0 * (s1 - mn1) / (mx1 - mn1), 0.0, 100.0) : null;
        var def40 = NoaaGfsWeather.DeficitToFieldCapacity(w40, cap, 400);

        return new Dictionary<string, double?>
        {
            ["temperature_2m"] = temp2m,
            ["dew_point_2m"] = dew2m,
            ["relative_humidity_2m"] = rh2m,
            ["vapour_pressure_deficit"] = vpd,
            ["wind_u_10m"] = windU10,
            ["wind_v_10m"] = windV10,
            ["surface_wind_gust"] = gust,
            ["visibility"] = vis,
            ["cloud_cover"] = cloudCover,
            ["column_cloud_water"] = cwat,
            ["total_column_integrated_water_vapour"] = pwat,
            ["model_cloud_ceiling_agl"] = ceilingAgl,
            ["surface_temperature"] = surfTemp,
            ["surface_pressure"] = surfPress,
            ["shortwave_radiation"] = shortwave,
            ["precip_rate_mm_h"] = prateMmH,
            ["accum_precip_mm"] = apcp,
            ["precip_flag_any"] = precipFlag,
            ["temperature_850hPa"] = temp850,
            ["relative_humidity_850hPa"] = rh850,
            ["wind_u_850hPa"] = windU850,
            ["wind_v_850hPa"] = windV850,
            ["soil_moisture_0_to_10cm"] = topSoil,
            ["plant_available_water_0_to_40cm"] = paw40,
            ["plant_available_water_0_to_100cm"] = paw100,
            ["soil_water_deficit_to_field_capacity_0_to_40cm"] = def40,
            ["snow_depth"] = snowDepthCm,
        };
    }

    private async Task<GwisSample[]> SampleAllGwisAsync(
        IReadOnlyList<WeatherSamplePoint> queries,
        string gwisDir,
        CancellationToken ct)
    {
        var samples = new GwisSample[queries.Count];
        var byDate = new Dictionary<DateOnly, List<int>>();
        for (var i = 0; i < queries.Count; i++)
        {
            var date = DateOnly.FromDateTime(queries[i].AcquiredAtUtc.UtcDateTime);
            if (!byDate.TryGetValue(date, out var list))
                byDate[date] = list = [];
            list.Add(i);
        }

        Console.WriteLine($"[GWIS] Sampling {byDate.Count} UTC dates at global {GwisWidth}x{GwisHeight} (0.125°) resolution...");
        using var http = _httpFactory.CreateClient("GwisGlobal");
        foreach (var (date, indices) in byDate.OrderBy(kv => kv.Key))
        {
            var layers = new Dictionary<string, (float[] Values, byte[] Coverage)>();
            foreach (var (layerName, shortName) in GwisLayers)
            {
                ct.ThrowIfCancellationRequested();
                var pngPath = Path.Combine(gwisDir, $"{date:yyyyMMdd}_{shortName}.png");
                var tifGzPath = Path.Combine(gwisDir, $"{date:yyyyMMdd}_{shortName}.tif.gz");

                byte[] pngBytes;
                if (File.Exists(pngPath))
                {
                    pngBytes = await File.ReadAllBytesAsync(pngPath, ct).ConfigureAwait(false);
                }
                else
                {
                    var url = $"{GwisWmsUrl}?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&STYLES=&SRS=EPSG:4326&BBOX=-180,-90,180,90&WIDTH={GwisWidth}&HEIGHT={GwisHeight}&TIME={date:yyyy-MM-dd}&LAYERS={layerName}&FORMAT=image/png&TRANSPARENT=TRUE";
                    pngBytes = await RetryDownloadBytesAsync(http, url, ct).ConfigureAwait(false);
                    await File.WriteAllBytesAsync(pngPath, pngBytes, ct).ConfigureAwait(false);
                }

                byte[] tifBytes;
                if (File.Exists(tifGzPath))
                {
                    await using var fs = File.OpenRead(tifGzPath);
                    await using var gz = new GZipStream(fs, CompressionMode.Decompress);
                    using var ms = new MemoryStream();
                    await gz.CopyToAsync(ms, ct).ConfigureAwait(false);
                    tifBytes = ms.ToArray();
                }
                else
                {
                    var url = $"{GwisWmsUrl}?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&STYLES=&SRS=EPSG:4326&BBOX=-180,-90,180,90&WIDTH={GwisWidth}&HEIGHT={GwisHeight}&TIME={date:yyyy-MM-dd}&LAYERS={layerName}&FORMAT=image/tiff";
                    tifBytes = await RetryDownloadBytesAsync(http, url, ct).ConfigureAwait(false);
                    await using var fs = File.Create(tifGzPath);
                    await using var gz = new GZipStream(fs, CompressionLevel.Optimal);
                    await gz.WriteAsync(tifBytes, ct).ConfigureAwait(false);
                }

                var cov = FireWeatherRaster.ReadCoverage(pngBytes, GwisWidth, GwisHeight);
                var vals = FireWeatherRaster.ReadValues(tifBytes, GwisWidth, GwisHeight);
                layers[shortName] = (vals, cov);
            }

            foreach (var idx in indices)
            {
                var q = queries[idx];
                var x = Math.Clamp((int)((q.Longitude + 180.0) / GwisPixelDeg), 0, GwisWidth - 1);
                var y = Math.Clamp((int)((90.0 - q.Latitude) / GwisPixelDeg), 0, GwisHeight - 1);
                var cell = y * GwisWidth + x;

                double? ReadLayer(string key)
                {
                    var (v, c) = layers[key];
                    if (c[cell] == 0) return null;
                    var f = v[cell];
                    return float.IsFinite(f) && f >= 0 ? f : null;
                }

                var fwi = ReadLayer("fwi");
                var ffmc = ReadLayer("ffmc");
                var dc = ReadLayer("dc");
                var lightning = ReadLayer("lightning");
                samples[idx] = new GwisSample(fwi.HasValue || ffmc.HasValue || dc.HasValue, fwi, ffmc, dc, lightning);
            }
            Console.WriteLine($"[GWIS] {date:yyyy-MM-dd}: {indices.Count:N0} points sampled.");
        }

        return samples;
    }

    private async Task<Dictionary<PointKeyRecord, double?>> LoadOrSampleSnowHourAsync(
        GfsCloudArchive archive,
        DateTimeOffset run,
        DateTimeOffset valid,
        IReadOnlyList<WeatherSamplePoint> queries,
        List<int> indices,
        string cacheDir,
        CancellationToken ct)
    {
        var points = indices.Select(i => PointKey(queries[i])).Distinct().ToList();
        var cachePath = Path.Combine(cacheDir, $"{run:yyyyMMddHH}_{valid:yyyyMMddHH}.json");
        var map = File.Exists(cachePath)
            ? JsonSerializer.Deserialize<Dictionary<string, double?>>(await File.ReadAllTextAsync(cachePath, ct).ConfigureAwait(false)) ?? []
            : [];

        var missing = points.Where(p => !map.ContainsKey(p.Id)).ToList();
        if (missing.Count > 0)
        {
            var hourData = await archive.DownloadHourAsync(run, valid, isSnow: true, ct, includePrecipitation: false)
                .ConfigureAwait(false);
            var field = hourData?.Fields.FirstOrDefault(f => f.Parameter == ParamSnowCover);
            if (field is not null)
            {
                foreach (var p in missing)
                    map[p.Id] = SampleGlobalFrame(field, p.Lat, p.Lon, nearest: false);
            }
            else
            {
                foreach (var p in missing) map[p.Id] = null;
            }
            await File.WriteAllTextAsync(cachePath, JsonSerializer.Serialize(map), ct).ConfigureAwait(false);
        }

        return points.ToDictionary(p => p, p => map.GetValueOrDefault(p.Id));
    }

    private async Task<Dictionary<PointKeyRecord, GfsSampleRow>> LoadOrSampleWeatherHourAsync(
        GfsCloudArchive archive,
        DateTimeOffset run,
        DateTimeOffset valid,
        IReadOnlyList<WeatherSamplePoint> queries,
        List<int> indices,
        string cacheDir,
        CancellationToken ct)
    {
        var points = indices.Select(i => PointKey(queries[i])).Distinct().ToList();
        var cachePath = Path.Combine(cacheDir, $"{run:yyyyMMddHH}_{valid:yyyyMMddHH}.json");
        var map = File.Exists(cachePath)
            ? JsonSerializer.Deserialize<Dictionary<string, GfsSampleRow>>(await File.ReadAllTextAsync(cachePath, ct).ConfigureAwait(false)) ?? []
            : new Dictionary<string, GfsSampleRow>(points.Count);

        var missing = points.Where(p => !map.TryGetValue(p.Id, out var existing) || !existing.HasData).ToList();
        if (missing.Count > 0)
        {
            var hourData = await archive.DownloadHourAsync(run, valid, isSnow: false, ct, includePrecipitation: true)
                .ConfigureAwait(false);
            if (hourData is not null && hourData.Fields.Count > 0)
            {
                var fieldMap = hourData.Fields.ToDictionary(f => f.Parameter);
                Parallel.ForEach(missing, p =>
                {
                    var d = BuildGlobalWeatherDictionary(fieldMap, p.Lat, p.Lon);
                    var row = new GfsSampleRow(
                        HasData: true,
                        Run: run,
                        Valid: valid,
                        Temp2mK: d["temperature_2m"],
                        DewPoint2mK: d["dew_point_2m"],
                        Rh2mPct: d["relative_humidity_2m"],
                        VpdKpa: d["vapour_pressure_deficit"],
                        WindU10m: d["wind_u_10m"],
                        WindV10m: d["wind_v_10m"],
                        WindGustMs: d["surface_wind_gust"],
                        VisibilityM: d["visibility"],
                        CloudCoverPct: d["cloud_cover"],
                        ColumnCloudWater: d["column_cloud_water"],
                        PwatKgM2: d["total_column_integrated_water_vapour"],
                        CloudCeilingAgl: d["model_cloud_ceiling_agl"],
                        SurfaceTempK: d["surface_temperature"],
                        SurfacePressurePa: d["surface_pressure"],
                        ShortwaveWm2: d["shortwave_radiation"],
                        PrecipRateMmH: d["precip_rate_mm_h"],
                        AccumPrecipMm: d["accum_precip_mm"],
                        PrecipFlagAny: (d["precip_flag_any"] ?? 0) > 0 ? 1 : 0,
                        Temp850K: d["temperature_850hPa"],
                        Rh850Pct: d["relative_humidity_850hPa"],
                        WindU850: d["wind_u_850hPa"],
                        WindV850: d["wind_v_850hPa"],
                        SoilMoistureTop: d["soil_moisture_0_to_10cm"],
                        Paw40Pct: d["plant_available_water_0_to_40cm"],
                        Paw100Pct: d["plant_available_water_0_to_100cm"],
                        SoilDeficit40Mm: d["soil_water_deficit_to_field_capacity_0_to_40cm"],
                        SnowDepthCm: d["snow_depth"]);
                    lock (map) map[p.Id] = row;
                });
                await File.WriteAllTextAsync(cachePath, JsonSerializer.Serialize(map), ct).ConfigureAwait(false);
            }
        }

        var result = new Dictionary<PointKeyRecord, GfsSampleRow>(points.Count);
        foreach (var p in points)
        {
            if (map.TryGetValue(p.Id, out var row))
                result[p] = row;
        }
        return result;
    }

    private static async Task<Dictionary<DateTimeOffset, DateTimeOffset?>> ResolvePublishedDatesAsync(
        HttpClient client,
        DateTimeOffset[] candidateRuns,
        DateTimeOffset validHour,
        DateTimeOffset minAcqInHour,
        bool isSnow,
        ConcurrentDictionary<string, DateTimeOffset?> pubCache,
        CancellationToken ct)
    {
        var dict = new Dictionary<DateTimeOffset, DateTimeOffset?>();
        foreach (var run in candidateRuns)
        {
            var rel = FormattableString.Invariant(
                $"gfs.{run:yyyyMMdd}/{run:HH}/atmos/{NoaaGfsWeather.ObjectFilename(run, validHour, isSnow)}");
            if (!pubCache.TryGetValue(rel, out var modified))
            {
                modified = await HeadLastModifiedAsync(client, rel, ct).ConfigureAwait(false);
                pubCache[rel] = modified;
            }
            dict[run] = modified;
            if (modified is { } pubTs && pubTs >= run && pubTs <= minAcqInHour)
                break;
        }
        return dict;
    }

    private static async Task<DateTimeOffset?> HeadLastModifiedAsync(HttpClient client, string relativePath, CancellationToken ct)
    {
        foreach (var root in new[] { GcsGfsRoot, S3GfsRoot })
        {
            try
            {
                using var req = new HttpRequestMessage(HttpMethod.Head, root + relativePath);
                using var resp = await client.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, ct).ConfigureAwait(false);
                if (resp.IsSuccessStatusCode && resp.Content.Headers.LastModified is { } modified)
                    return modified;
            }
            catch (Exception ex) when (!ct.IsCancellationRequested && ex is HttpRequestException or TaskCanceledException)
            {
                // Try fallback mirror.
            }
        }
        return null;
    }

    private static IEnumerable<DateTimeOffset> EnumerateCandidateRuns(DateTimeOffset validHour)
    {
        for (var run = HourFloor(validHour.AddHours(-1), 6); validHour - run <= TimeSpan.FromHours(30); run = run.AddHours(-6))
            yield return run;
    }

    private static DateTimeOffset HourFloor(DateTimeOffset time, int step = 1)
    {
        var utc = time.UtcDateTime;
        return new DateTimeOffset(utc.Date.AddHours(utc.Hour / step * step), TimeSpan.Zero);
    }

    private static async Task<byte[]> RetryDownloadBytesAsync(HttpClient http, string url, CancellationToken ct)
    {
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                return await http.GetByteArrayAsync(url, ct).ConfigureAwait(false);
            }
            catch (Exception) when (attempt < 3 && !ct.IsCancellationRequested)
            {
                await Task.Delay(TimeSpan.FromSeconds(attempt * 2), ct).ConfigureAwait(false);
            }
        }
    }

    private static ConcurrentDictionary<string, DateTimeOffset?> LoadPublications(string path)
    {
        if (!File.Exists(path)) return new(StringComparer.Ordinal);
        var loaded = JsonSerializer.Deserialize<Dictionary<string, DateTimeOffset?>>(File.ReadAllText(path));
        return loaded is null ? new(StringComparer.Ordinal) : new(loaded, StringComparer.Ordinal);
    }

    private static void SavePublications(string path, ConcurrentDictionary<string, DateTimeOffset?> cache) =>
        File.WriteAllText(path, JsonSerializer.Serialize(new Dictionary<string, DateTimeOffset?>(cache)));

    private static int FindNearestRow(double[] lats, double lat)
    {
        var (r0, r1, f) = FindLatitudeBracket(lats, lat);
        return f < 0.5 ? r0 : r1;
    }

    private static (int Row0, int Row1, double Fraction) FindLatitudeBracket(double[] lats, double lat)
    {
        if (lats.Length == 1) return (0, 0, 0.0);
        var ascending = lats[^1] > lats[0];
        var lo = 0;
        var hi = lats.Length - 2;
        while (lo <= hi)
        {
            var mid = (lo + hi) >> 1;
            var a = lats[mid];
            var b = lats[mid + 1];
            if (ascending)
            {
                if (lat < a) hi = mid - 1;
                else if (lat > b) lo = mid + 1;
                else return (mid, mid + 1, b == a ? 0.0 : Math.Clamp((lat - a) / (b - a), 0.0, 1.0));
            }
            else
            {
                if (lat > a) hi = mid - 1;
                else if (lat < b) lo = mid + 1;
                else return (mid, mid + 1, b == a ? 0.0 : Math.Clamp((lat - a) / (b - a), 0.0, 1.0));
            }
        }

        if ((ascending && lat <= lats[0]) || (!ascending && lat >= lats[0])) return (0, 1, 0.0);
        return (lats.Length - 2, lats.Length - 1, 1.0);
    }

    private static double SatKpa(double k)
    {
        var c = k - 273.15;
        return 0.6108 * Math.Exp(17.27 * c / (c + 237.3));
    }

    private static double? Hypot(double? x, double? y) =>
        x is { } a && y is { } b ? Math.Sqrt(a * a + b * b) : null;

    private static PointKeyRecord PointKey(WeatherSamplePoint p)
    {
        var lat = Math.Round(p.Latitude, 4);
        var lon = Math.Round(p.Longitude, 4);
        var id = string.Create(CultureInfo.InvariantCulture, $"{lat:F4},{lon:F4}");
        return new(id, lat, lon);
    }

    private readonly record struct PointKeyRecord(string Id, double Lat, double Lon);
    private readonly record struct GwisSample(bool Available, double? Fwi, double? Ffmc, double? Dc, double? Lightning);
    private readonly record struct GfsSampleRow(
        bool HasData, DateTimeOffset Run, DateTimeOffset Valid,
        double? Temp2mK, double? DewPoint2mK, double? Rh2mPct, double? VpdKpa,
        double? WindU10m, double? WindV10m, double? WindGustMs, double? VisibilityM,
        double? CloudCoverPct, double? ColumnCloudWater, double? PwatKgM2, double? CloudCeilingAgl,
        double? SurfaceTempK, double? SurfacePressurePa, double? ShortwaveWm2,
        double? PrecipRateMmH, double? AccumPrecipMm, int PrecipFlagAny,
        double? Temp850K, double? Rh850Pct, double? WindU850, double? WindV850,
        double? SoilMoistureTop, double? Paw40Pct, double? Paw100Pct, double? SoilDeficit40Mm,
        double? SnowDepthCm);

    public void Dispose()
    {
        _httpFactory.Dispose();
        _loggerFactory.Dispose();
    }
}
