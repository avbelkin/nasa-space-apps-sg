using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;
using NasaSpaceApps.Api.Firms;

namespace NasaSpaceApps.Api.Weather;

internal sealed class OpenMeteoHotspotWeather(
    IHttpClientFactory clients, IMemoryCache cache, ILogger<OpenMeteoHotspotWeather> logger)
{
    public const string HttpClientName = "HotspotWeather";
    public const int MaximumSpots = 16;
    private const string ForecastUrl = "https://api.open-meteo.com/v1/forecast";
    private const string AirQualityUrl = "https://air-quality-api.open-meteo.com/v1/air-quality";
    private static readonly TimeSpan Hour = TimeSpan.FromHours(1);
    private readonly SemaphoreSlim fetchGate = new(2);

    private static readonly string[] ForecastFields =
    [
        "temperature_2m", "dew_point_2m", "relative_humidity_2m", "vapour_pressure_deficit",
        "cloud_cover", "cloud_cover_low", "cloud_cover_mid", "cloud_cover_high", "visibility", "weather_code",
        "precipitation", "rain", "showers", "snowfall", "snow_depth", "shortwave_radiation_instant",
        "wind_speed_10m", "wind_direction_10m", "wind_gusts_10m", "surface_pressure", "surface_temperature",
        "total_column_integrated_water_vapour", "soil_moisture_0_to_10cm", "soil_moisture_10_to_40cm", "soil_moisture_40_to_100cm",
        "temperature_925hPa", "relative_humidity_925hPa", "wind_speed_925hPa", "wind_direction_925hPa",
        "temperature_850hPa", "relative_humidity_850hPa", "wind_speed_850hPa", "wind_direction_850hPa",
    ];

    private static readonly string[] AirQualityFields =
        ["aerosol_optical_depth", "dust", "pm2_5", "pm10", "carbon_monoxide"];

    public async Task<HotspotWeatherResponse> EnrichAsync(
        IReadOnlyList<FirmsHotspot?> spots, CancellationToken cancellationToken)
    {
        var locations = spots.OfType<FirmsHotspot>().Select(Location).Distinct()
            .OrderBy(point => point.Latitude).ThenBy(point => point.Longitude).ToArray();
        if (locations.Length == 0)
            return new HotspotWeatherResponse(new HotspotWeather?[spots.Count]);

        var forecast = FetchAsync(ForecastUrl, locations, ForecastFields,
            "&models=gfs_seamless&wind_speed_unit=ms&elevation=" + string.Join(',', Enumerable.Repeat("nan", locations.Length)),
            cancellationToken);
        var airQuality = FetchAsync(AirQualityUrl, locations, AirQualityFields, "&domains=cams_global", cancellationToken);
        await Task.WhenAll(forecast, airQuality).ConfigureAwait(false);
        var forecasts = await forecast;
        var airQualityFields = await airQuality;
        var indexes = locations.Select((point, i) => (point, i)).ToDictionary(entry => entry.point, entry => entry.i);
        return new HotspotWeatherResponse(spots.Select(EnrichSpot).ToArray());

        HotspotWeather? EnrichSpot(FirmsHotspot? spot)
        {
            if (spot is null) return null;
            var index = indexes[Location(spot)];
            var acquiredAt = spot.AcquiredAtUtc.ToUniversalTime();
            return new HotspotWeather(acquiredAt,
            [
                Sample(forecasts?[index], ForecastFields, acquiredAt, "NOAA GFS Seamless", isForecast: true),
                Sample(airQualityFields?[index], AirQualityFields, acquiredAt, "CAMS Global", isForecast: false),
            ]);
        }
    }

    private static (double Latitude, double Longitude) Location(FirmsHotspot spot) =>
        (Math.Round(spot.Latitude, 2), Math.Round(spot.Longitude, 2));

    private async Task<HourlyWeather[]?> FetchAsync(string service, (double Latitude, double Longitude)[] locations,
        string[] fields, string options, CancellationToken token)
    {
        var latitudes = string.Join(',', locations.Select(location => FormattableString.Invariant($"{location.Latitude:F2}")));
        var longitudes = string.Join(',', locations.Select(location => FormattableString.Invariant($"{location.Longitude:F2}")));
        var url = $"{service}?latitude={latitudes}&longitude={longitudes}&past_hours=48&forecast_hours=1" +
            $"&timeformat=unixtime&timezone=GMT&cell_selection=nearest{options}&hourly={string.Join(',', fields)}";
        var cacheKey = (nameof(OpenMeteoHotspotWeather), url);
        if (cache.TryGetValue(cacheKey, out HourlyWeather[]? cached))
        {
            return cached;
        }

        await fetchGate.WaitAsync(token).ConfigureAwait(false);
        try
        {
            if (cache.TryGetValue(cacheKey, out cached))
            {
                return cached;
            }

            using var client = clients.CreateClient(HttpClientName);
            using var response = await client.GetAsync(url, token).ConfigureAwait(false);
            response.EnsureSuccessStatusCode();
            await using var stream = await response.Content.ReadAsStreamAsync(token).ConfigureAwait(false);
            using var json = await JsonDocument.ParseAsync(stream, cancellationToken: token).ConfigureAwait(false);
            var root = json.RootElement;
            HourlyWeather[] data = root.ValueKind switch
            {
                JsonValueKind.Object when locations.Length == 1 => [Parse(root)],
                JsonValueKind.Array when locations.Length == root.GetArrayLength() => root.EnumerateArray().Select(Parse).ToArray(),
                _ => throw new JsonException("Weather batch size did not match the requested locations."),
            };
            cache.Set(cacheKey, data, TimeSpan.FromMinutes(10));
            return data;
        }
        catch (Exception error) when (!token.IsCancellationRequested &&
            error is HttpRequestException or OperationCanceledException or JsonException or FormatException or ArgumentOutOfRangeException)
        {
            logger.LogWarning("Weather source {Host} was unavailable: {Message}", new Uri(url).Host, error.Message);
            cache.Set<HourlyWeather[]?>(cacheKey, null, TimeSpan.FromMinutes(1));
            return null;
        }
        finally
        {
            fetchGate.Release();
        }
    }

    internal static HourlyWeather Parse(JsonElement root)
    {
        if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("hourly", out var hourly) ||
            hourly.ValueKind != JsonValueKind.Object || !hourly.TryGetProperty("time", out var time) ||
            time.ValueKind != JsonValueKind.Array || time.GetArrayLength() == 0 ||
            !root.TryGetProperty("hourly_units", out var units) || units.ValueKind != JsonValueKind.Object ||
            !root.TryGetProperty("latitude", out var latitude) || latitude.ValueKind != JsonValueKind.Number ||
            !root.TryGetProperty("longitude", out var longitude) || longitude.ValueKind != JsonValueKind.Number)
        {
            throw new JsonException("Missing grid coordinates or hourly time series.");
        }

        var count = time.GetArrayLength();
        if (time[0].ValueKind != JsonValueKind.Number || !time[0].TryGetInt64(out var first))
        {
            throw new JsonException("Expected a Unix timestamp.");
        }

        for (var i = 0; i < count; i++)
        {
            if (time[i].ValueKind != JsonValueKind.Number || !time[i].TryGetInt64(out var utc) || utc != first + i * 3600L)
            {
                throw new JsonException("Expected consecutive hourly UTC timestamps.");
            }
        }

        var start = DateTimeOffset.FromUnixTimeSeconds(first);
        var fields = new Dictionary<string, HourlyField>(StringComparer.Ordinal);
        foreach (var item in hourly.EnumerateObject())
        {
            if (item.NameEquals("time") || item.Value.ValueKind != JsonValueKind.Array ||
                item.Value.GetArrayLength() != count || !units.TryGetProperty(item.Name, out var unit) ||
                unit.ValueKind != JsonValueKind.String)
            {
                continue;
            }

            var nativeUnit = unit.GetString()!;
            var outputUnit = (item.Name, nativeUnit) switch
            {
                (_, "°C") => "K",
                ("snow_depth", "m") => "cm",
                ("aerosol_optical_depth", "") => "1",
                _ => nativeUnit,
            };
            var values = item.Value.EnumerateArray().Select(value => value.ValueKind == JsonValueKind.Number
                ? (double?)ConvertValue(value.GetDouble(), nativeUnit, outputUnit) : null).ToArray();
            fields.Add(item.Name, new HourlyField(outputUnit, new WeatherTimeSeries(start, Hour, values)));
        }

        return new HourlyWeather(latitude.GetDouble(), longitude.GetDouble(), fields);
    }

    private static double ConvertValue(double number, string unit, string outputUnit) => (unit, outputUnit) switch
    {
        ("°C", "K") => number + 273.15,
        ("m", "cm") => number * 100,
        _ => number,
    };

    internal static HotspotWeatherSource Sample(
        HourlyWeather? data, IReadOnlyList<string> fields, DateTimeOffset acquiredAt, string model, bool isForecast)
    {
        var values = new Dictionary<string, HotspotWeatherValue>(StringComparer.Ordinal);
        foreach (var field in fields)
        {
            if (field is "precipitation" or "rain" or "showers" or "snowfall" or "wind_gusts_10m")
            {
                values.Add(field, Read(data, field, acquiredAt, precedingHour: true));
            }
            else
            {
                values.Add(field, Read(data, field, acquiredAt));
            }
        }

        if (isForecast)
        {
            foreach (var field in new[] { "precipitation", "rain", "showers", "snowfall" })
            {
                values.Add(field + "_3h", Read(data, field, acquiredAt, intervalCount: 3));
                values.Add(field + "_24h", Read(data, field, acquiredAt, intervalCount: 24));
            }

            ExcludeBelowGround(values, "925hPa", 925);
            ExcludeBelowGround(values, "850hPa", 850);
            AddWindComponents(values, "10m");
            AddWindComponents(values, "925hPa");
            AddWindComponents(values, "850hPa");
            var weatherCode = values["weather_code"];
            values.Add("fog_or_rime_code", weatherCode with
            {
                Value = weatherCode.Value is double code ? code is 45 or 48 ? code : 0 : null,
            });

            foreach (var suffix in new[] { "", "_3h", "_24h" })
            {
                // GFS converts frozen water to snowfall at 0.7 cm per mm.
                var snow = values["snowfall" + suffix];
                values.Add("snowfall_water_equivalent" + suffix, snow with { Value = snow.Value / 0.7, Unit = "mm" });
            }
        }

        return new HotspotWeatherSource("Open-Meteo", model, "forecast", data?.Latitude, data?.Longitude,
            isForecast ? null : 0.4, null, "nearest_grid_point", data is null ? "source_unavailable" : "available",
            isForecast ? null : true, values);
    }

    private static void ExcludeBelowGround(Dictionary<string, HotspotWeatherValue> values, string level, int pressureHpa)
    {
        var pressure = values["surface_pressure"];
        if (pressure.Unit == "hPa" && pressure.Value < pressureHpa)
        {
            foreach (var parameter in new[] { "temperature", "relative_humidity", "wind_speed", "wind_direction" })
            {
                var field = $"{parameter}_{level}";
                values[field] = Missing("below_ground", values[field].Unit);
            }
        }
    }

    private static void AddWindComponents(Dictionary<string, HotspotWeatherValue> values, string level)
    {
        var speed = values[$"wind_speed_{level}"];
        var direction = values[$"wind_direction_{level}"];
        var missingReason = speed.MissingReason ?? direction.MissingReason;
        var radians = direction.Value.GetValueOrDefault() * Math.PI / 180;
        values.Add($"wind_u_{level}", speed with
        {
            Value = missingReason is null ? -speed.Value * Math.Sin(radians) : null,
            MissingReason = missingReason,
        });
        values.Add($"wind_v_{level}", speed with
        {
            Value = missingReason is null ? -speed.Value * Math.Cos(radians) : null,
            MissingReason = missingReason,
        });
    }

    private static HotspotWeatherValue Read(HourlyWeather? data, string field, DateTimeOffset acquiredAt,
        bool precedingHour = false, int intervalCount = 0)
    {
        if (data is null)
        {
            return Missing("source_unavailable");
        }

        if (!data.Fields.TryGetValue(field, out var hourly))
        {
            return Missing("unsupported");
        }

        var match = intervalCount > 0
            ? hourly.Series.SumTrailing(acquiredAt, intervalCount)
            : hourly.Series.AtOrBefore(acquiredAt);
        return match is { } sample
            ? new HotspotWeatherValue(sample.Value, hourly.Unit,
                precedingHour ? sample.ValidFromUtc.Subtract(Hour) : sample.ValidFromUtc,
                sample.ValidThroughUtc, (acquiredAt - sample.ValidThroughUtc).TotalMinutes, null)
            : Missing("no_matching_frame", hourly.Unit);
    }

    private static HotspotWeatherValue Missing(string reason, string unit = "") =>
        new(null, unit, null, null, null, reason);

    internal sealed record HourlyField(string Unit, WeatherTimeSeries Series);
    internal sealed record HourlyWeather(double Latitude, double Longitude, IReadOnlyDictionary<string, HourlyField> Fields);
}
