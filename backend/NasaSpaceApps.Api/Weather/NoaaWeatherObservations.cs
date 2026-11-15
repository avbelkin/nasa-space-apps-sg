using System.Globalization;
using System.Text.Json;
using System.Xml;
using System.Xml.Linq;
using Microsoft.Extensions.Caching.Memory;
using NasaSpaceApps.Api.Firms;

namespace NasaSpaceApps.Api.Weather;

internal sealed class NoaaWeatherObservations(IHttpClientFactory clients, IMemoryCache cache)
{
    public const string HttpClientName = "NoaaWeatherObservations";
    private const string Wms = "https://nowcoast.noaa.gov/geoserver/observations/";
    private static readonly Product Radar = new("weather_radar", "MRMS", "radar_reflectivity", "dBZ", 8,
        ["conus_base_reflectivity_mosaic", "alaska_base_reflectivity_mosaic", "hawaii_base_reflectivity_mosaic",
         "caribbean_base_reflectivity_mosaic", "guam_base_reflectivity_mosaic"]);
    private static readonly Product Infrared = new("satellite", "NESDIS GMGSI", "satellite_longwave_infrared_count", "count", 60,
        ["global_longwave_imagery_mosaic"]);
    private static readonly Product Visible = new("satellite", "NESDIS GMGSI", "satellite_visible_count", "count", 60,
        ["global_visible_imagery_mosaic"]);
    private readonly SemaphoreSlim requests = new(4);

    public async Task<HotspotWeatherSource[][]> EnrichAsync(IReadOnlyList<FirmsHotspot?> spots, CancellationToken cancellationToken,
        Task<DeferredHotspotWeather.GridSources?[]>? grids = null)
    {
        if (spots.All(spot => spot is null))
            return spots.Select(_ => Array.Empty<HotspotWeatherSource>()).ToArray();

        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        deadline.CancelAfter(TimeSpan.FromSeconds(8));
        var radarCatalogue = new Lazy<Task<Dictionary<string, Layer>?>>(LoadRadarCatalogue);
        var satelliteCatalogue = CatalogueAsync(Infrared.Workspace, deadline.Token, cancellationToken);
        return await Task.WhenAll(spots.Select(EnrichSpotAsync)).ConfigureAwait(false);

        async Task<HotspotWeatherSource[]> EnrichSpotAsync(FirmsHotspot? spot, int index)
        {
            if (spot is null)
                return [];

            var radar = ResolveRadar(spot, index);
            var infrared = SampleAsync(Infrared, satelliteCatalogue, spot, deadline.Token, cancellationToken);
            var visible = SampleAsync(Visible, satelliteCatalogue, spot, deadline.Token, cancellationToken);
            await Task.WhenAll(radar, infrared, visible).ConfigureAwait(false);
            var radarValue = await radar;
            var infraredValue = await infrared;
            var visibleValue = await visible;
            return [radarValue, ToSource(Infrared, infraredValue, visibleValue)];
        }

        async Task<HotspotWeatherSource> ResolveRadar(FirmsHotspot spot, int index)
        {
            if (grids is not null && (await grids.ConfigureAwait(false))[index]?.Radar is { } native) return native;
            using var radarDeadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            radarDeadline.CancelAfter(TimeSpan.FromSeconds(8));
            var radar = await SampleAsync(Radar, radarCatalogue.Value, spot, radarDeadline.Token, cancellationToken).ConfigureAwait(false);
            return ToSource(Radar, radar);
        }

        async Task<Dictionary<string, Layer>?> LoadRadarCatalogue()
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(TimeSpan.FromSeconds(8));
            return await CatalogueAsync(Radar.Workspace, timeout.Token, cancellationToken).ConfigureAwait(false);
        }
    }

    private static HotspotWeatherSource ToSource(Product product, params KeyValuePair<string, HotspotWeatherValue>[] values) =>
        new("NOAA nowCOAST", product.Model, "observation", null, null, null, null, "wms_point",
            values.All(value => value.Value.MissingReason == "source_unavailable") ? "source_unavailable" : "available",
            null, values.ToDictionary(pair => pair.Key, pair => pair.Value));

    private async Task<KeyValuePair<string, HotspotWeatherValue>> SampleAsync(Product product, Task<Dictionary<string, Layer>?> catalogue,
        FirmsHotspot spot, CancellationToken deadline, CancellationToken cancellationToken)
    {
        KeyValuePair<string, HotspotWeatherValue> Missing(string reason) => new(product.Field,
            new HotspotWeatherValue(null, product.Unit, null, null, null, reason));

        var layers = await catalogue.ConfigureAwait(false);
        if (layers is null)
            return Missing("source_unavailable");

        var candidates = product.Layers.Where(layers.ContainsKey).Select(name => layers[name])
            .Where(layer => layer.Contains(spot.Latitude, spot.Longitude)).ToArray();
        if (candidates.Length == 0 || (product.Workspace == "satellite" && Math.Abs(spot.Latitude) > 60))
            return Missing("outside_coverage");

        var available = candidates.Select(layer => (layer.Name, Frame: FindFrame(layer.Frames, spot.AcquiredAtUtc, product.MaxAgeMinutes)))
            .Where(candidate => candidate.Frame.HasValue).OrderByDescending(candidate => candidate.Frame).FirstOrDefault();
        if (available.Frame is not { } frame)
            return Missing("no_matching_frame");

        // The center pixel of an odd-sized CRS:84 viewport is the FIRMS point.
        var x = spot.Longitude;
        var y = spot.Latitude;
        var time = frame.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
        var url = FormattableString.Invariant(
            $"{Wms}{product.Workspace}/ows?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&CRS=CRS:84&INFO_FORMAT=application/json&WIDTH=21&HEIGHT=21&I=10&J=10&BBOX={x - 0.1},{y - 0.1},{x + 0.1},{y + 0.1}&LAYERS={available.Name}&QUERY_LAYERS={available.Name}&TIME={time}");
        var key = (nameof(NoaaWeatherObservations), url);
        try
        {
            if (!cache.TryGetValue<double?>(key, out var value))
            {
                await requests.WaitAsync(deadline).ConfigureAwait(false);
                try
                {
                    if (!cache.TryGetValue(key, out value))
                    {
                        using var http = clients.CreateClient(HttpClientName);
                        using var json = JsonDocument.Parse(await http.GetStringAsync(url, deadline).ConfigureAwait(false));
                        value = ReadBand(json.RootElement, product.Unit);
                        cache.Set(key, value, TimeSpan.FromMinutes(10));
                    }
                }
                finally
                {
                    requests.Release();
                }
            }

            return new KeyValuePair<string, HotspotWeatherValue>(product.Field, new HotspotWeatherValue(value, product.Unit,
                frame, frame, (spot.AcquiredAtUtc - frame).TotalMinutes, value.HasValue ? null : "no_source_coverage"));
        }
        catch (Exception error) when (!cancellationToken.IsCancellationRequested &&
            error is HttpRequestException or OperationCanceledException or JsonException)
        {
            return Missing("source_unavailable");
        }
    }

    private async Task<Dictionary<string, Layer>?> CatalogueAsync(string workspace, CancellationToken deadline, CancellationToken cancellationToken)
    {
        var key = (nameof(NoaaWeatherObservations), workspace);
        if (cache.TryGetValue<Dictionary<string, Layer>>(key, out var cached))
            return cached;

        try
        {
            using var http = clients.CreateClient(HttpClientName);
            var xml = await http.GetStringAsync($"{Wms}{workspace}/ows?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.3.0", deadline)
                .ConfigureAwait(false);
            var result = ParseCatalogue(xml);
            cache.Set(key, result, TimeSpan.FromMinutes(1));
            return result;
        }
        catch (Exception error) when (!cancellationToken.IsCancellationRequested &&
            error is HttpRequestException or OperationCanceledException or XmlException)
        {
            return null;
        }
    }

    internal static Dictionary<string, Layer> ParseCatalogue(string xml)
    {
        var result = new Dictionary<string, Layer>(StringComparer.Ordinal);
        var document = XDocument.Parse(xml);
        if (document.Root is not { } root || root.Name.LocalName != "WMS_Capabilities")
            throw new XmlException("Expected NOAA WMS capabilities.");
        var ns = root.Name.Namespace;
        foreach (var layer in root.Descendants(ns + "Layer"))
        {
            var name = layer.Element(ns + "Name")?.Value;
            var time = layer.Elements(ns + "Dimension").FirstOrDefault(dimension => (string?)dimension.Attribute("name") == "time")?.Value;
            var bounds = layer.Element(ns + "EX_GeographicBoundingBox");
            if (name is null || time is null || bounds is null ||
                !double.TryParse(bounds.Element(ns + "westBoundLongitude")?.Value, CultureInfo.InvariantCulture, out var west) ||
                !double.TryParse(bounds.Element(ns + "eastBoundLongitude")?.Value, CultureInfo.InvariantCulture, out var east) ||
                !double.TryParse(bounds.Element(ns + "southBoundLatitude")?.Value, CultureInfo.InvariantCulture, out var south) ||
                !double.TryParse(bounds.Element(ns + "northBoundLatitude")?.Value, CultureInfo.InvariantCulture, out var north))
                continue;

            var frames = new List<DateTimeOffset>();
            foreach (var value in time.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries))
            {
                if (DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var frame))
                    frames.Add(frame);
            }
            result[name] = new Layer(name, west, south, east, north, frames);
        }
        return result;
    }

    internal static DateTimeOffset? FindFrame(IReadOnlyList<DateTimeOffset> frames, DateTimeOffset acquiredAt, int maxAgeMinutes) =>
        frames.Where(frame => frame <= acquiredAt && (acquiredAt - frame).TotalMinutes <= maxAgeMinutes)
            .Select(frame => (DateTimeOffset?)frame).Max();

    internal static double? ReadBand(JsonElement root, string unit)
    {
        if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("features", out var features) ||
            features.ValueKind != JsonValueKind.Array)
            throw new JsonException("Expected NOAA observation features.");
        if (features.GetArrayLength() == 0 || features[0].ValueKind != JsonValueKind.Object ||
            !features[0].TryGetProperty("properties", out var properties) || properties.ValueKind != JsonValueKind.Object ||
            !properties.TryGetProperty("Band1", out var band) || band.ValueKind != JsonValueKind.Number ||
            !band.TryGetDouble(out var value) || !double.IsFinite(value))
            return null;
        return (unit == "count" ? value is >= 0 and <= 255 : value is >= -40 and <= 100) ? value : null;
    }

    internal sealed record Layer(string Name, double West, double South, double East, double North, IReadOnlyList<DateTimeOffset> Frames)
    {
        public bool Contains(double lat, double lng) => lat >= South && lat <= North && lng >= West && lng <= East;
    }

    private sealed record Product(string Workspace, string Model, string Field, string Unit, int MaxAgeMinutes, string[] Layers);
}
