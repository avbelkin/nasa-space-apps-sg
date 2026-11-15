using Microsoft.Extensions.Caching.Memory;
using NasaSpaceApps.Api.Firms;

namespace NasaSpaceApps.Api.Weather;

internal sealed class CopernicusFireWeather(
    IHttpClientFactory clients, IMemoryCache cache, ILogger<CopernicusFireWeather> logger)
{
    public const string HttpClientName = "CopernicusFireWeather";
    private const string WmsUrl = "https://maps.effis.emergency.copernicus.eu/gwis";
    private const int Size = 64;
    private const int Degrees = 4;
    private const double PixelDegrees = (double)Degrees / Size;
    private readonly SemaphoreSlim downloads = new(4);

    private static readonly Field[] Fields =
    [
        new("ecmwf.fwi", "fire_weather_index", "1"),
        new("ecmwf.ffmc", "fine_fuel_moisture_code", "1"),
        new("ecmwf.dc", "fire_weather_drought_code", "1"),
        new("ecmwf.extra.lightning", "forecast_lightning_flash_density", "flashes/km²"),
    ];

    public async Task<HotspotWeatherSource?[]> EnrichAsync(
        IReadOnlyList<FirmsHotspot?> spots, CancellationToken cancellationToken)
    {
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        deadline.CancelAfter(TimeSpan.FromSeconds(8));
        var tiles = new Dictionary<Tile, Task<Dictionary<string, Layer>>>();
        return await Task.WhenAll(spots.Select(EnrichSpotAsync)).ConfigureAwait(false);

        async Task<HotspotWeatherSource?> EnrichSpotAsync(FirmsHotspot? spot)
        {
            if (spot is null)
                return null;

            var date = DateOnly.FromDateTime(spot.AcquiredAtUtc.UtcDateTime);
            var tile = TileAt(spot.Latitude, spot.Longitude, date);
            if (!tiles.TryGetValue(tile, out var pending))
            {
                pending = LoadTileAsync(tile, deadline.Token, cancellationToken);
                tiles.Add(tile, pending);
            }

            var layers = await pending.ConfigureAwait(false);
            var x = Math.Clamp((int)((spot.Longitude - tile.West) / PixelDegrees), 0, Size - 1);
            var y = Math.Clamp((int)((tile.South + Degrees - spot.Latitude) / PixelDegrees), 0, Size - 1);
            var index = y * Size + x;
            var values = Fields.ToDictionary(field => field.Name, field => Sample(layers[field.Name], field, date, index));
            var fwi = values["fire_weather_index"];
            values.Add("gwis_fire_danger_class", fwi with
            {
                Value = fwi.Value is double value ? DangerClass((float)value) : null,
                Unit = "class 1–7",
            });
            return new HotspotWeatherSource("Copernicus GWIS", "ECMWF", "daily_forecast",
                tile.South + Degrees - (y + 0.5) * PixelDegrees, tile.West + (x + 0.5) * PixelDegrees,
                null, null, "wms_raster_pixel", layers.Values.Any(layer => layer.Values is not null)
                    ? "available" : "source_unavailable", null, values);
        }
    }

    internal static int DangerClass(float fwi) => fwi switch
    {
        < 5.2f => 1,
        < 11.2f => 2,
        < 21.3f => 3,
        < 38f => 4,
        < 50f => 5,
        < 70f => 6,
        _ => 7,
    };

    private static HotspotWeatherValue Sample(Layer layer, Field field, DateOnly date, int index)
    {
        if (layer.Values is not { } raster || layer.Coverage is not { } coverage)
            return new HotspotWeatherValue(null, field.Unit, null, null, null, "source_unavailable") { ValidDateUtc = date };
        if (coverage[index] == 0 || !float.IsFinite(raster[index]) || raster[index] < 0)
            return new HotspotWeatherValue(null, field.Unit, null, null, null, "no_source_coverage") { ValidDateUtc = date };
        return new HotspotWeatherValue(raster[index], field.Unit, null, null, null, null) { ValidDateUtc = date };
    }

    private static Tile TileAt(double latitude, double longitude, DateOnly date) => new(
        Math.Min(180 - Degrees, (int)Math.Floor((longitude + 180) / Degrees) * Degrees - 180),
        Math.Min(90 - Degrees, (int)Math.Floor((latitude + 90) / Degrees) * Degrees - 90), date);

    private async Task<Dictionary<string, Layer>> LoadTileAsync(
        Tile tile, CancellationToken deadline, CancellationToken cancellationToken)
    {
        var layers = await Task.WhenAll(Fields.Select(async field => (field.Name,
            Data: await LoadLayerAsync(tile, field, deadline, cancellationToken).ConfigureAwait(false)))).ConfigureAwait(false);
        return layers.ToDictionary(layer => layer.Name, layer => layer.Data);
    }

    private async Task<Layer> LoadLayerAsync(
        Tile tile, Field field, CancellationToken deadline, CancellationToken cancellationToken)
    {
        var key = (nameof(CopernicusFireWeather), tile, field.LayerName);
        if (cache.TryGetValue<Layer>(key, out var cached) && cached is not null)
            return cached;

        try
        {
            await downloads.WaitAsync(deadline).ConfigureAwait(false);
            try
            {
                if (cache.TryGetValue<Layer>(key, out cached) && cached is not null)
                    return cached;

                var query = FormattableString.Invariant(
                    $"{WmsUrl}?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&STYLES=&SRS=EPSG:4326&BBOX={tile.West},{tile.South},{tile.West + Degrees},{tile.South + Degrees}&WIDTH={Size}&HEIGHT={Size}&TIME={tile.Date:yyyy-MM-dd}&LAYERS={field.LayerName}");
                using var http = clients.CreateClient(HttpClientName);
                var mask = await DownloadAsync(http, query + "&FORMAT=image/png&TRANSPARENT=TRUE", deadline).ConfigureAwait(false);
                var coverage = FireWeatherRaster.ReadCoverage(mask, Size);
                var values = new float[Size * Size];
                if (coverage.Any(alpha => alpha != 0))
                {
                    var raster = await DownloadAsync(http, query + "&FORMAT=image/tiff", deadline).ConfigureAwait(false);
                    values = FireWeatherRaster.ReadValues(raster, Size);
                }

                var layer = new Layer(values, coverage);
                cache.Set(key, layer, TimeSpan.FromMinutes(coverage.Any(alpha => alpha != 0) ? 30 : 5));
                return layer;
            }
            finally
            {
                downloads.Release();
            }
        }
        catch (Exception error) when (!cancellationToken.IsCancellationRequested && error is
            HttpRequestException or OperationCanceledException or IOException or InvalidDataException or ArgumentOutOfRangeException or OverflowException)
        {
            if (error is not OperationCanceledException)
                logger.LogWarning("Could not read the fire-weather layer {Layer}: {Message}", field.LayerName, error.Message);
            return new Layer(null, null);
        }
    }

    private static async Task<byte[]> DownloadAsync(HttpClient http, string url, CancellationToken token)
    {
        using var response = await http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, token).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();
        await response.Content.LoadIntoBufferAsync(128 * 1024, token).ConfigureAwait(false);
        return await response.Content.ReadAsByteArrayAsync(token).ConfigureAwait(false);
    }

    private sealed record Field(string LayerName, string Name, string Unit);
    private readonly record struct Tile(int West, int South, DateOnly Date);
    private sealed record Layer(float[]? Values, byte[]? Coverage);
}
