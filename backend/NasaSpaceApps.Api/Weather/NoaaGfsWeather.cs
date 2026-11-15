using System.Diagnostics;
using Microsoft.Extensions.Caching.Memory;
using NasaSpaceApps.Api.Firms;
using static NasaSpaceApps.Api.Weather.GfsGribSubset;

namespace NasaSpaceApps.Api.Weather;

internal sealed class NoaaGfsWeather(IHttpClientFactory clients, IMemoryCache cache, ILogger<NoaaGfsWeather> logger,
    LocalWeatherCredentials? local = null, EncodedWeatherGridCache? grids = null)
{
    public const string HttpClientName = "NoaaGfsWeather";
    private const string BaseUrl = "https://nomads.ncep.noaa.gov/cgi-bin/filter_";
    private const string PublicationBaseUrl = "https://noaa-gfs-bdp-pds.s3.amazonaws.com/";
    private const int TileDegrees = 4;
    private static readonly int[] HeightLevelsHpa = [1000, 925, 850, 700, 600, 500, 400, 300, 250, 200, 150, 100];
    private static readonly int[] CondensateLevelsHpa = [925, 850, 700, 500, 300];
    private static readonly string PressureLevels = string.Concat(HeightLevelsHpa.Select(p => $"&lev_{p}_mb=on"));
    private static readonly (string Name, int Bottom, int Top)[] CloudLevels = [("low", 212, 213), ("middle", 222, 223), ("high", 232, 233)];
    private static readonly (string Name, Parameter Key, string Unit)[] NativeFields =
    [
        ("model_cloud_ceiling_msl", new(0, 3, 5, 215, 0, 0), "gpm"),
        ("column_cloud_water", new(0, 6, 6, 200, 0, 0), "kg/m²"),
        ("model_precipitation_rain", new(0, 1, 192, 1, 0, 0), "flag"),
        ("model_precipitation_freezing_rain", new(0, 1, 193, 1, 0, 0), "flag"),
        ("model_precipitation_ice_pellets", new(0, 1, 194, 1, 0, 0), "flag"),
        ("model_precipitation_snow", new(0, 1, 195, 1, 0, 0), "flag"),
        ("soil_field_capacity", new(2, 3, 203, 1, 0, 0), "m³/m³"),
        ("soil_wilting_point", new(2, 0, 201, 1, 0, 0), "m³/m³"),
        ("temperature_2m", new(0, 0, 0, 103, 2, 0), "K"),
        ("dew_point_2m", new(0, 0, 6, 103, 2, 0), "K"),
        ("relative_humidity_2m", new(0, 1, 1, 103, 2, 0), "%"),
        ("wind_u_10m", new(0, 2, 2, 103, 10, 0), "m/s"),
        ("wind_v_10m", new(0, 2, 3, 103, 10, 0), "m/s"),
        ("surface_wind_gust", new(0, 2, 22, 1, 0, 0), "m/s"),
        ("visibility", new(0, 19, 0, 1, 0, 0), "m"),
        ("cloud_cover", new(0, 6, 1, 10, 0, 0), "%"),
        ("total_column_integrated_water_vapour", new(0, 1, 3, 200, 0, 0), "kg/m²"),
        ("surface_temperature", new(0, 0, 0, 1, 0, 0), "K"),
        ("surface_pressure", new(0, 3, 0, 1, 0, 0), "Pa"),
        ("shortwave_radiation", new(0, 4, 192, 1, 0, 0), "W/m²"),
    ];

    private readonly SemaphoreSlim requests = new(local is null ? 4 : 1);
    private readonly SemaphoreSlim publicationRequests = new(8);
    private readonly Dictionary<string, Task<DateTimeOffset?>> inFlightPublications = [];
    private readonly EncodedWeatherGridCache gridCache = grids ?? EncodedWeatherGridCache.Disabled;
    private long lastLocalFetch;

    public async Task<HotspotWeatherSource[][]> EnrichAsync(IReadOnlyList<FirmsHotspot?> spots, CancellationToken token)
    {
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(token);
        deadline.CancelAfter(TimeSpan.FromSeconds(local is null ? 8 : 45));
        var batches = new Dictionary<Tile, Task<Dictionary<Parameter, Frame>?>>();
        var publications = new Dictionary<string, Task<DateTimeOffset?>>();
        return await Task.WhenAll(spots.Select(EnrichSpotAsync)).ConfigureAwait(false);

        async Task<HotspotWeatherSource[]> EnrichSpotAsync(FirmsHotspot? spot)
        {
            if (spot is null) return [];
            var lon = spot.Longitude == 180 ? -180 : spot.Longitude;
            var lat = spot.Latitude;
            var (west, south, time) = SamplingGroup(spot);
            var weather = SampleAsync(false);
            var snow = SampleAsync(true);
            await Task.WhenAll(weather, snow).ConfigureAwait(false);
            return [await weather, await snow];

            async Task<HotspotWeatherSource> SampleAsync(bool isSnow)
            {
                var frame = await FindPublishedAsync(time, spot.AcquiredAtUtc, isSnow, GetPublicationAsync).ConfigureAwait(false);
                Dictionary<Parameter, Frame>? data = null;
                if (frame is not null)
                {
                    var tile = new Tile(west, south, frame.Run, time, isSnow);
                    data = await GetAsync(tile).ConfigureAwait(false);
                }
                var values = isSnow ? new Dictionary<string, HotspotWeatherValue>
                {
                    ["snow_cover_percent"] = Read(data, new(0, 1, 42, 1, 0, 0), "%", spot.AcquiredAtUtc, lat, lon),
                } : BuildWeatherValues(data, spot.AcquiredAtUtc, lat, lon);
                if (frame is null)
                    foreach (var field in values.Keys.ToArray())
                        values[field] = values[field] with { MissingReason = "no_matching_frame" };
                return Source(data, frame, isSnow, values, lat, lon);
            }
        }

        Task<Dictionary<Parameter, Frame>?> GetAsync(Tile tile)
        {
            lock (batches)
            {
                if (!batches.TryGetValue(tile, out var task))
                {
                    task = LoadAsync(tile, deadline.Token, token);
                    batches.Add(tile, task);
                }
                return task;
            }
        }

        Task<DateTimeOffset?> GetPublicationAsync(string uri)
        {
            lock (publications)
            {
                if (!publications.TryGetValue(uri, out var pending))
                {
                    pending = ReadPublicationAsync(uri, deadline.Token, token);
                    publications.Add(uri, pending);
                }
                return pending;
            }
        }
    }

    internal static (int West, int South, DateTimeOffset Hour) SamplingGroup(FirmsHotspot spot)
    {
        var longitude = spot.Longitude == 180 ? -180 : spot.Longitude;
        var west = Math.Min(176, (int)Math.Floor((longitude + 180) / TileDegrees) * TileDegrees - 180);
        var south = Math.Min(86, (int)Math.Floor((spot.Latitude + 90) / TileDegrees) * TileDegrees - 90);
        return (west, south, HourFloor(spot.AcquiredAtUtc));
    }

    internal async Task<PublishedFrame?> ResolvePublishedFrameAsync(DateTimeOffset at, DateTimeOffset acquisition,
        bool snow, CancellationToken token)
    {
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(token);
        deadline.CancelAfter(TimeSpan.FromSeconds(local is null ? 8 : 45));
        return await FindPublishedAsync(at, acquisition, snow, uri => ReadPublicationAsync(uri, deadline.Token, token))
            .ConfigureAwait(false);
    }

    private static async Task<PublishedFrame?> FindPublishedAsync(DateTimeOffset at, DateTimeOffset acquisition, bool snow,
        Func<string, Task<DateTimeOffset?>> read)
    {
        // f000 is an analysis. Hourly forecast hours are indexed from each 6-hour run.
        for (var run = HourFloor(at.AddHours(-1), 6); at - run <= TimeSpan.FromHours(30); run = run.AddHours(-6))
        {
            var uri = FormattableString.Invariant($"{PublicationBaseUrl}gfs.{run:yyyyMMdd}/{run:HH}/atmos/{ObjectFilename(run, at, snow)}");
            if (await read(uri).ConfigureAwait(false) is { } published && published >= run && published <= acquisition)
                return new PublishedFrame(run, published);
        }
        return null;
    }

    private Task<DateTimeOffset?> ReadPublicationAsync(string uri, CancellationToken deadline, CancellationToken token)
    {
        if (cache.TryGetValue<DateTimeOffset>(uri, out var cached)) return Task.FromResult<DateTimeOffset?>(cached);
        lock (inFlightPublications)
        {
            if (inFlightPublications.TryGetValue(uri, out var existing)) return existing;
            var task = FetchPublicationAsync();
            inFlightPublications[uri] = task;
            return task;
        }

        async Task<DateTimeOffset?> FetchPublicationAsync()
        {
            try
            {
                await publicationRequests.WaitAsync(deadline).ConfigureAwait(false);
                try
                {
                    if (cache.TryGetValue<DateTimeOffset>(uri, out cached)) return cached;
                    using var http = clients.CreateClient(HttpClientName);
                    using var request = new HttpRequestMessage(HttpMethod.Head, uri);
                    using var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, deadline).ConfigureAwait(false);
                    if (!response.IsSuccessStatusCode || response.Content.Headers.LastModified is not { } modified) return null;
                    cache.Set(uri, modified, TimeSpan.FromHours(2));
                    return modified;
                }
                finally { publicationRequests.Release(); }
            }
            catch (Exception error) when (!token.IsCancellationRequested && error is HttpRequestException or OperationCanceledException)
            {
                logger.LogWarning("NOAA model publication was unavailable: {Message}", error.Message);
                return null;
            }
            finally
            {
                lock (inFlightPublications) inFlightPublications.Remove(uri);
            }
        }
    }

    private static DateTimeOffset HourFloor(DateTimeOffset time, int step = 1)
    {
        var utc = time.UtcDateTime;
        return new DateTimeOffset(utc.Date.AddHours(utc.Hour / step * step), TimeSpan.Zero);
    }

    private static HotspotWeatherSource Source(Dictionary<Parameter, Frame>? data, PublishedFrame? frame, bool snow,
        IReadOnlyDictionary<string, HotspotWeatherValue> values, double lat, double lon)
    {
        var grid = data?.Values.FirstOrDefault()?.Grid;
        var index = grid?.Nearest(lat, lon);
        return new HotspotWeatherSource("NOAA NOMADS", snow ? "GFS Gaussian surface flux" : "GFS 0.25°", "forecast",
            index is int i ? grid!.Latitudes[i / grid.Columns] : null,
            index is int j ? Math.IEEERemainder(grid!.FirstLongitude + j % grid.Columns * grid.LongitudeStep, 360) : null,
            snow ? null : 0.25, frame?.Run, snow ? "bilinear_grid" : "bilinear_continuous_nearest_categorical",
            frame is null ? "no_matching_frame" : data is null ? "source_unavailable" : "available",
            null, values)
        {
            PublishedAtUtc = frame?.Published,
        };
    }

    internal static Dictionary<string, HotspotWeatherValue> BuildWeatherValues(
        Dictionary<Parameter, Frame>? data, DateTimeOffset acquired, double lat, double lon)
    {
        HotspotWeatherValue Sample(Parameter key, string unit) => Read(data, key, unit, acquired, lat, lon);
        var values = NativeFields.ToDictionary(field => field.Name, field => Sample(field.Key, field.Unit));
        var surfaceHeight = Sample(new(0, 3, 5, 1, 0, 0), "gpm").Value;
        var surfacePressure = values["surface_pressure"].Value;
        var air = values["temperature_2m"];
        var dewPoint = values["dew_point_2m"];
        values.Add("vapour_pressure_deficit", Derived(air,
            air.Value is double temp && dewPoint.Value is double dew ? Math.Max(0, SaturationKpa(temp) - SaturationKpa(dew)) : null, "kPa"));
        var snowDepth = Sample(new(0, 1, 11, 1, 0, 0), "m");
        values.Add("snow_depth", Derived(snowDepth, snowDepth.Value * 100, "cm"));
        var ceiling = values["model_cloud_ceiling_msl"];
        // Reject extrapolation and the clear-sky ceiling sentinel. The same
        // model's terrain defines the reference for above-ground heights.
        double? ceilingAgl = ceiling.Value - surfaceHeight;
        if (ceiling.Value is not < 20_000 || ceilingAgl is not (>= 0 and < 20_000)) ceilingAgl = null;
        values["model_cloud_ceiling_msl"] = Derived(ceiling, ceilingAgl.HasValue ? ceiling.Value : null, "gpm");
        values.Add("model_cloud_ceiling_agl", Derived(ceiling, ceilingAgl, "m AGL"));

        var profile = new List<(double Pressure, double Height)>();
        if (surfaceHeight is double ground && surfacePressure is double pressure)
        {
            profile.Add((pressure, ground));
            foreach (var level in HeightLevelsHpa)
            {
                var pa = level * 100;
                if (pa < pressure && Sample(new(0, 3, 5, 100, pa, 0), "gpm").Value is double height && height >= ground)
                    profile.Add((pa, height));
            }
        }

        foreach (var layer in CloudLevels)
        {
            foreach (var (name, surface) in new[] { ("base", layer.Bottom), ("top", layer.Top) })
            {
                var cloudPressure = Sample(new(0, 3, 0, surface, 0, 0), "Pa");
                var prefix = $"model_{layer.Name}_cloud_{name}";
                values.Add(prefix + "_pressure", cloudPressure);
                values.Add(prefix + "_height_estimated_msl", Derived(cloudPressure,
                    cloudPressure.Value is double p ? HeightAtPressure(profile, p) : null, "gpm"));
            }
        }

        foreach (var level in CondensateLevelsHpa)
        {
            var pressurePa = level * 100;
            var liquid = Sample(new(0, 1, 22, 100, pressurePa, 0), "kg/kg");
            var ice = Sample(new(0, 1, 23, 100, pressurePa, 0), "kg/kg");
            values.Add($"cloud_liquid_water_mixing_ratio_{level}hPa", AboveGround(liquid, pressurePa, surfacePressure));
            values.Add($"cloud_ice_water_mixing_ratio_{level}hPa", AboveGround(ice, pressurePa, surfacePressure));
        }

        foreach (var level in new[] { 925, 850 })
        {
            var pressurePa = level * 100;
            foreach (var (name, category, number, unit) in new (string, int, int, string)[]
                { ("temperature", 0, 0, "K"), ("relative_humidity", 1, 1, "%"), ("wind_u", 2, 2, "m/s"), ("wind_v", 2, 3, "m/s") })
            {
                var value = Sample(new(0, category, number, 100, pressurePa, 0), unit);
                values.Add($"{name}_{level}hPa", AboveGround(value, pressurePa, surfacePressure));
            }
        }

        var wilting = values["soil_wilting_point"];
        var capacity = values["soil_field_capacity"];
        var top = Sample(new(2, 0, 192, 106, 0, 10), "m³/m³");
        var middle = Sample(new(2, 0, 192, 106, 10, 40), "m³/m³");
        var bottom = Sample(new(2, 0, 192, 106, 40, 100), "m³/m³");
        values.Add("soil_moisture_0_to_10cm", top);
        values.Add("soil_moisture_10_to_40cm", middle);
        values.Add("soil_moisture_40_to_100cm", bottom);
        var water40 = (top.Value * 10 + middle.Value * 30) / 40;
        var water100 = (top.Value * 10 + middle.Value * 30 + bottom.Value * 60) / 100;
        values.Add("plant_available_water_0_to_40cm", Derived(top,
            AvailableWater(water40, wilting.Value, capacity.Value), "% of modeled capacity"));
        values.Add("plant_available_water_0_to_100cm", Derived(top,
            AvailableWater(water100, wilting.Value, capacity.Value), "% of modeled capacity"));
        values.Add("soil_water_deficit_to_field_capacity_0_to_40cm", Derived(top,
            DeficitToFieldCapacity(water40, capacity.Value, 400), "mm"));
        values.Add("soil_water_deficit_to_field_capacity_0_to_100cm", Derived(top,
            DeficitToFieldCapacity(water100, capacity.Value, 1000), "mm"));
        return values;
    }

    private static double SaturationKpa(double temperatureK)
    {
        var celsius = temperatureK - 273.15;
        return 0.6108 * Math.Exp(17.27 * celsius / (celsius + 237.3));
    }

    internal static double? HeightAtPressure(IReadOnlyList<(double Pressure, double Height)> profile, double pressure)
    {
        for (var i = 1; i < profile.Count; i++)
        {
            var (lowerPressure, lowerHeight) = profile[i - 1];
            var (upperPressure, upperHeight) = profile[i];
            if (pressure >= upperPressure && pressure <= lowerPressure)
                return lowerHeight + (upperHeight - lowerHeight) * Math.Log(lowerPressure / pressure) /
                    Math.Log(lowerPressure / upperPressure);
        }
        return null;
    }

    private static double? AvailableWater(double? water, double? wilting, double? capacity) =>
        water is double sample && wilting is double min && capacity is double max && max > min && min >= 0 && max <= 1
            ? Math.Clamp(100 * (sample - min) / (max - min), 0, 100) : null;

    internal static double? DeficitToFieldCapacity(double? water, double? capacity, double depthMm) =>
        water is >= 0 and <= 1 && capacity is > 0 and <= 1
            ? Math.Max(0, capacity.Value - water.Value) * depthMm : null;

    private static HotspotWeatherValue Derived(HotspotWeatherValue source, double? value, string unit) => source with
    {
        Value = value,
        Unit = unit,
        MissingReason = value.HasValue ? null : source.MissingReason ?? "no_source_coverage",
    };

    private static HotspotWeatherValue AboveGround(HotspotWeatherValue value, int levelPa, double? surfacePressurePa)
    {
        if (value.Value is null) return value;
        if (surfacePressurePa > levelPa) return value;
        return value with { Value = null, MissingReason = surfacePressurePa.HasValue ? "below_ground" : "no_source_coverage" };
    }

    private static HotspotWeatherValue Read(Dictionary<Parameter, Frame>? data, Parameter parameter, string unit,
        DateTimeOffset acquired, double lat, double lon)
    {
        if (data is null || !data.TryGetValue(parameter, out var frame) || frame.End > acquired)
            return new HotspotWeatherValue(null, unit, null, null, null, data is null ? "source_unavailable" : "no_matching_frame");
        var value = unit == "flag" ? frame.Sample(lat, lon) : frame.Interpolate(lat, lon);
        return new HotspotWeatherValue(value, unit, frame.Start, frame.End, (acquired - frame.End).TotalMinutes,
            value.HasValue ? null : "no_source_coverage");
    }

    internal static string BuildUrl(int west, int south, DateTimeOffset run, DateTimeOffset valid, bool snow)
    {
        var file = ObjectFilename(run, valid, snow);
        var fields = snow ? "&var_SNOWC=on&lev_surface=on" :
            "&var_HGT=on&var_PRES=on&var_CWAT=on&var_WILT=on&var_FLDCP=on&var_SOILW=on&var_CRAIN=on&var_CFRZR=on&var_CICEP=on&var_CSNOW=on&var_CLWMR=on&var_ICMR=on" +
            "&var_TMP=on&var_DPT=on&var_RH=on&var_UGRD=on&var_VGRD=on&var_GUST=on&var_VIS=on&var_TCDC=on&var_PWAT=on&var_DSWRF=on&var_SNOD=on" +
            "&lev_surface=on&lev_cloud_ceiling=on&lev_entire_atmosphere_(considered_as_a_single_layer)=on" +
            "&lev_entire_atmosphere=on&lev_2_m_above_ground=on&lev_10_m_above_ground=on" +
            "&lev_low_cloud_bottom_level=on&lev_middle_cloud_bottom_level=on&lev_high_cloud_bottom_level=on" +
            "&lev_low_cloud_top_level=on&lev_middle_cloud_top_level=on&lev_high_cloud_top_level=on" +
            "&lev_0-0.1_m_below_ground=on&lev_0.1-0.4_m_below_ground=on&lev_0.4-1_m_below_ground=on" + PressureLevels;
        return FormattableString.Invariant($"{BaseUrl}{(snow ? "gfs_sflux" : "gfs_0p25")}.pl?dir=%2Fgfs.{run:yyyyMMdd}%2F{run:HH}%2Fatmos&file={file}{fields}&subregion=&leftlon={west}&rightlon={west + TileDegrees}&toplat={south + TileDegrees}&bottomlat={south}");
    }

    internal static string ObjectFilename(DateTimeOffset run, DateTimeOffset valid, bool snow)
    {
        var lead = (int)(valid - run).TotalHours;
        return snow ? FormattableString.Invariant($"gfs.t{run:HH}z.sfluxgrbf{lead:000}.grib2")
            : FormattableString.Invariant($"gfs.t{run:HH}z.pgrb2.0p25.f{lead:000}");
    }

    internal sealed record PublishedFrame(DateTimeOffset Run, DateTimeOffset Published);

    private async Task<Dictionary<Parameter, Frame>?> LoadAsync(Tile tile, CancellationToken deadline, CancellationToken token)
    {
        var key = (nameof(NoaaGfsWeather), tile);
        if (cache.TryGetValue<Dictionary<Parameter, Frame>>(key, out var cached)) return cached;
        try
        {
            var url = BuildUrl(tile.West, tile.South, tile.Run, tile.Valid, tile.Snow);
            var frames = await gridCache.GetAsync(url, tile.Valid.AddHours(25), DownloadAsync, Decode, deadline).ConfigureAwait(false);
            cache.Set(key, frames, TimeSpan.FromMinutes(20));
            return frames;

            async Task<EncodedWeatherGrid> DownloadAsync(CancellationToken fetchToken)
            {
                await requests.WaitAsync(fetchToken).ConfigureAwait(false);
                try
                {
                    if (local is not null && lastLocalFetch != 0)
                    {
                        var remaining = TimeSpan.FromSeconds(10) - Stopwatch.GetElapsedTime(lastLocalFetch);
                        if (remaining > TimeSpan.Zero) await Task.Delay(remaining, fetchToken).ConfigureAwait(false);
                    }
                    try
                    {
                        using var http = clients.CreateClient(HttpClientName);
                        return await gridCache.DownloadAsync(http, url, 512 * 1024, fetchToken).ConfigureAwait(false);
                    }
                    finally { if (local is not null) lastLocalFetch = Stopwatch.GetTimestamp(); }
                }
                finally { requests.Release(); }
            }

            Dictionary<Parameter, Frame> Decode(EncodedWeatherGrid encoded)
            {
                var frames = Parse(encoded.Bytes);
                foreach (var parameter in frames.Where(pair => pair.Value.Run != tile.Run || pair.Value.End != tile.Valid)
                    .Select(pair => pair.Key).ToArray()) frames.Remove(parameter);
                if (frames.Count == 0) throw new InvalidDataException("GFS grid has no fields matching the selected run and valid hour.");
                return frames;
            }
        }
        catch (Exception error) when (!token.IsCancellationRequested && error is HttpRequestException or OperationCanceledException or
            IOException or InvalidDataException or ArgumentException or IndexOutOfRangeException or OverflowException)
        {
            logger.LogWarning("NOAA GFS subset was unavailable: {Message}", error.Message);
            return null;
        }
    }

    private readonly record struct Tile(int West, int South, DateTimeOffset Run, DateTimeOffset Valid, bool Snow);
}
