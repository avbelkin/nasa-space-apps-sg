using Microsoft.Extensions.Caching.Memory;
using NasaSpaceApps.Api.Firms;
using static NasaSpaceApps.Api.Weather.GfsGribSubset;

namespace NasaSpaceApps.Api.Weather;

internal sealed class NoaaGfsWeather(IHttpClientFactory clients, IMemoryCache cache, ILogger<NoaaGfsWeather> logger)
{
    public const string HttpClientName = "NoaaGfsWeather";
    private const string BaseUrl = "https://nomads.ncep.noaa.gov/cgi-bin/filter_";
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
    ];

    private readonly SemaphoreSlim requests = new(4);

    public async Task<HotspotWeatherSource[][]> EnrichAsync(IReadOnlyList<FirmsHotspot?> spots, CancellationToken token)
    {
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(token);
        deadline.CancelAfter(TimeSpan.FromSeconds(8));
        var batches = new Dictionary<Tile, Task<Dictionary<Parameter, Frame>?>>();
        return await Task.WhenAll(spots.Select(EnrichSpotAsync)).ConfigureAwait(false);

        async Task<HotspotWeatherSource[]> EnrichSpotAsync(FirmsHotspot? spot)
        {
            if (spot is null) return [];
            var lon = spot.Longitude == 180 ? -180 : spot.Longitude;
            var lat = spot.Latitude;
            var time = HourFloor(spot.AcquiredAtUtc);
            var run = HourFloor(time.AddHours(-6), 6);
            var tile = new Tile(Math.Min(176, (int)Math.Floor((lon + 180) / TileDegrees) * TileDegrees - 180),
                Math.Min(86, (int)Math.Floor((lat + 90) / TileDegrees) * TileDegrees - 90), run, time, false);
            var weather = GetAsync(tile);
            var snow = GetAsync(tile with { Snow = true });
            await Task.WhenAll(weather, snow).ConfigureAwait(false);

            var data = await weather;
            var snowData = await snow;
            var weatherValues = BuildWeatherValues(data, spot.AcquiredAtUtc, lat, lon);
            var snowValues = new Dictionary<string, HotspotWeatherValue>
            {
                ["snow_cover_percent"] = Read(snowData, new(0, 1, 42, 1, 0, 0), "%", spot.AcquiredAtUtc, lat, lon),
            };
            return [Source(data, tile, weatherValues, lat, lon, "GFS 0.25°"),
                Source(snowData, tile with { Snow = true }, snowValues, lat, lon, "GFS Gaussian surface flux")];
        }

        Task<Dictionary<Parameter, Frame>?> GetAsync(Tile tile)
        {
            if (!batches.TryGetValue(tile, out var task))
            {
                task = LoadAsync(tile, deadline.Token, token);
                batches.Add(tile, task);
            }
            return task;
        }
    }

    private static DateTimeOffset HourFloor(DateTimeOffset time, int step = 1)
    {
        var utc = time.UtcDateTime;
        return new DateTimeOffset(utc.Date.AddHours(utc.Hour / step * step), TimeSpan.Zero);
    }

    private static HotspotWeatherSource Source(Dictionary<Parameter, Frame>? data, Tile tile,
        IReadOnlyDictionary<string, HotspotWeatherValue> values, double lat, double lon, string model)
    {
        var grid = data?.Values.FirstOrDefault()?.Grid;
        var index = grid?.Nearest(lat, lon);
        return new HotspotWeatherSource("NOAA NOMADS", model, "forecast",
            index is int i ? grid!.Latitudes[i / grid.Columns] : null,
            index is int j ? Math.IEEERemainder(grid!.FirstLongitude + j % grid.Columns * grid.LongitudeStep, 360) : null,
            tile.Snow ? null : 0.25, tile.Run, "nearest_grid_point", data is null ? "source_unavailable" : "available",
            null, values);
    }

    internal static Dictionary<string, HotspotWeatherValue> BuildWeatherValues(
        Dictionary<Parameter, Frame>? data, DateTimeOffset acquired, double lat, double lon)
    {
        HotspotWeatherValue Sample(Parameter key, string unit) => Read(data, key, unit, acquired, lat, lon);
        var values = NativeFields.ToDictionary(field => field.Name, field => Sample(field.Key, field.Unit));
        var surfaceHeight = Sample(new(0, 3, 5, 1, 0, 0), "gpm").Value;
        var surfacePressure = Sample(new(0, 3, 0, 1, 0, 0), "Pa").Value;
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

        var wilting = values["soil_wilting_point"];
        var capacity = values["soil_field_capacity"];
        var top = Sample(new(2, 0, 192, 106, 0, 10), "m³/m³");
        var middle = Sample(new(2, 0, 192, 106, 10, 40), "m³/m³");
        var bottom = Sample(new(2, 0, 192, 106, 40, 100), "m³/m³");
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
        var value = frame.Sample(lat, lon);
        return new HotspotWeatherValue(value, unit, frame.Start, frame.End, (acquired - frame.End).TotalMinutes,
            value.HasValue ? null : "no_source_coverage");
    }

    internal static string BuildUrl(int west, int south, DateTimeOffset run, DateTimeOffset valid, bool snow)
    {
        var lead = (int)(valid - run).TotalHours;
        var file = snow ? FormattableString.Invariant($"gfs.t{run:HH}z.sfluxgrbf{lead:000}.grib2")
            : FormattableString.Invariant($"gfs.t{run:HH}z.pgrb2.0p25.f{lead:000}");
        var fields = snow ? "&var_SNOWC=on&lev_surface=on" :
            "&var_HGT=on&var_PRES=on&var_CWAT=on&var_WILT=on&var_FLDCP=on&var_SOILW=on&var_CRAIN=on&var_CFRZR=on&var_CICEP=on&var_CSNOW=on&var_CLWMR=on&var_ICMR=on" +
            "&lev_surface=on&lev_cloud_ceiling=on&lev_entire_atmosphere_(considered_as_a_single_layer)=on" +
            "&lev_low_cloud_bottom_level=on&lev_middle_cloud_bottom_level=on&lev_high_cloud_bottom_level=on" +
            "&lev_low_cloud_top_level=on&lev_middle_cloud_top_level=on&lev_high_cloud_top_level=on" +
            "&lev_0-0.1_m_below_ground=on&lev_0.1-0.4_m_below_ground=on&lev_0.4-1_m_below_ground=on" + PressureLevels;
        return FormattableString.Invariant($"{BaseUrl}{(snow ? "gfs_sflux" : "gfs_0p25")}.pl?dir=%2Fgfs.{run:yyyyMMdd}%2F{run:HH}%2Fatmos&file={file}{fields}&subregion=&leftlon={west}&rightlon={west + TileDegrees}&toplat={south + TileDegrees}&bottomlat={south}");
    }

    private async Task<Dictionary<Parameter, Frame>?> LoadAsync(Tile tile, CancellationToken deadline, CancellationToken token)
    {
        var key = (nameof(NoaaGfsWeather), tile);
        if (cache.TryGetValue<Dictionary<Parameter, Frame>>(key, out var cached)) return cached;
        try
        {
            await requests.WaitAsync(deadline).ConfigureAwait(false);
            try
            {
                if (cache.TryGetValue(key, out cached)) return cached;
                using var http = clients.CreateClient(HttpClientName);
                using var response = await http.GetAsync(BuildUrl(tile.West, tile.South, tile.Run, tile.Valid, tile.Snow),
                    HttpCompletionOption.ResponseHeadersRead, deadline).ConfigureAwait(false);
                response.EnsureSuccessStatusCode();
                await response.Content.LoadIntoBufferAsync(256 * 1024, deadline).ConfigureAwait(false);
                var frames = Parse(await response.Content.ReadAsByteArrayAsync(deadline).ConfigureAwait(false));
                foreach (var parameter in frames.Where(pair => pair.Value.Run != tile.Run || pair.Value.End != tile.Valid)
                    .Select(pair => pair.Key).ToArray()) frames.Remove(parameter);
                cache.Set(key, frames, TimeSpan.FromMinutes(20));
                return frames;
            }
            finally { requests.Release(); }
        }
        catch (Exception error) when (!token.IsCancellationRequested && error is HttpRequestException or OperationCanceledException or
            IOException or InvalidDataException or ArgumentException or IndexOutOfRangeException or OverflowException)
        {
            if (error is not OperationCanceledException) logger.LogWarning("NOAA GFS subset was unavailable: {Message}", error.Message);
            return null;
        }
    }

    private readonly record struct Tile(int West, int South, DateTimeOffset Run, DateTimeOffset Valid, bool Snow);
}
