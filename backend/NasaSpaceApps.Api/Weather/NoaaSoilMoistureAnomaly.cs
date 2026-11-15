using System.Globalization;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Caching.Memory;
using NasaSpaceApps.Api.Firms;

namespace NasaSpaceApps.Api.Weather;

internal sealed partial class NoaaSoilMoistureAnomaly(
    IHttpClientFactory clients, IMemoryCache cache, ILogger<NoaaSoilMoistureAnomaly> logger, EncodedWeatherGridCache? grids = null)
{
    public const string HttpClientName = "NoaaSoilMoistureAnomaly";
    private const string Product = "https://www.cpc.ncep.noaa.gov/products/Drought/";
    private const string Catalogue = Product + "Monitoring/weekly-SM-noah.shtml";
    private const int Width = 474;
    private const int Height = 202;
    private static readonly string[] Depths = ["0_10", "10_40", "40_100"];
    private readonly SemaphoreSlim downloads = new(1);
    private readonly EncodedWeatherGridCache gridCache = grids ?? EncodedWeatherGridCache.Disabled;

    public async Task<HotspotWeatherSource?[]> EnrichAsync(IReadOnlyList<FirmsHotspot?> spots, CancellationToken token)
    {
        if (!spots.Any(spot => spot is not null && InRegion(spot))) return spots.Select(spot => AtSpot(spot, null)).ToArray();
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(token);
        deadline.CancelAfter(TimeSpan.FromSeconds(8));
        Snapshot? snapshot = null;
        try
        {
            await downloads.WaitAsync(deadline.Token).ConfigureAwait(false);
            try { snapshot = await LoadAsync(deadline.Token).ConfigureAwait(false); }
            finally { downloads.Release(); }
        }
        catch (Exception error) when (!token.IsCancellationRequested && error is
            HttpRequestException or OperationCanceledException or IOException or InvalidDataException or ArgumentException or OverflowException)
        {
            if (error is not OperationCanceledException)
                logger.LogWarning("NOAA CPC soil-moisture anomalies were unavailable: {Message}", error.Message);
        }
        return spots.Select(spot => AtSpot(spot, snapshot)).ToArray();
    }

    private async Task<Snapshot> LoadAsync(CancellationToken token)
    {
        if (cache.TryGetValue<Snapshot>(HttpClientName, out var cached) && cached is not null) return cached;
        using var http = clients.CreateClient(HttpClientName);
        var period = ReadPeriod(await http.GetStringAsync(Catalogue, token).ConfigureAwait(false));
        var rasters = await Task.WhenAll(Depths.Select(ReadRasterAsync)).ConfigureAwait(false);
        var published = rasters.Max(raster => raster.Modified);
        var grid = rasters[0].Grid;
        if (rasters.Any(raster => raster.Grid != grid || published - raster.Modified > TimeSpan.FromMinutes(2)) ||
            published < period.End || published - period.End > TimeSpan.FromDays(7) ||
            period != ReadPeriod(await http.GetStringAsync(Catalogue, token).ConfigureAwait(false)))
            throw new InvalidDataException("NOAA CPC soil-moisture layers and their catalogue disagree.");
        var snapshot = new Snapshot(period.Start, period.End, grid.West, grid.North, grid.Step, rasters.Select(raster => raster.Values).ToArray());
        cache.Set(HttpClientName, snapshot, TimeSpan.FromMinutes(15));
        return snapshot;

        Task<((double West, double North, double Step) Grid, float[] Values, DateTimeOffset Modified)> ReadRasterAsync(string depth)
        {
            var url = Product + $"GeoTIFF/SurfaceHydrology/NoahSM/weekly/weekly_SMprof_noah.{depth}cm.tif";
            var key = FormattableString.Invariant($"{url}|{period.Start:O}|{period.End:O}");
            return gridCache.GetAsync(key, DateTimeOffset.UtcNow.AddMinutes(15),
                cancellation => gridCache.DownloadAsync(http, url, 512 * 1024, cancellation),
                encoded => (FloatWeatherTiff.ReadWgs84Grid(encoded.Bytes),
                    FloatWeatherTiff.ReadValues(encoded.Bytes, Width, Height),
                    encoded.ModifiedAt ?? throw new InvalidDataException("Missing NOAA CPC raster revision timestamp.")), token);
        }
    }

    private static (DateTimeOffset Start, DateTimeOffset End) ReadPeriod(string html)
    {
        var period = PublishedPeriod().Match(html);
        if (!period.Success || !Parse(period.Groups[1].Value, out var start) || !Parse(period.Groups[2].Value, out var end) ||
            end - start != TimeSpan.FromDays(7))
            throw new InvalidDataException("Missing NOAA CPC weekly soil-moisture validity.");
        return (start, end);

        static bool Parse(string value, out DateTimeOffset date) => DateTimeOffset.TryParseExact(value, "ddMMMyyyy",
            CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out date);
    }

    internal static bool InRegion(FirmsHotspot spot) =>
        spot.Latitude is >= 24 and <= 51 && spot.Longitude is >= -126 and <= -65;

    private static HotspotWeatherSource? AtSpot(FirmsHotspot? spot, Snapshot? snapshot)
    {
        if (spot is null) return null;
        var age = snapshot is null ? (TimeSpan?)null : spot.AcquiredAtUtc - snapshot.End;
        var ready = age is { TotalDays: >= 0 and <= 10 };
        var pixel = ready ? snapshot!.FindPixel(spot.Latitude, spot.Longitude) : null;
        var status = !InRegion(spot) ? "outside_coverage" : snapshot is null ? "source_unavailable" :
            !ready ? "no_matching_frame" : pixel.HasValue ? "available" : "outside_coverage";
        double? ReadLayer(int layer) => pixel is int index && snapshot!.Layers[layer][index] is >= -1000 and <= 1000
            ? snapshot.Layers[layer][index] : null;
        var top = ReadLayer(0);
        var middle = ReadLayer(1);
        var bottom = ReadLayer(2);
        return new HotspotWeatherSource("NOAA CPC", "NLDAS Noah weekly soil-moisture anomaly", "analysis",
            pixel is int row ? snapshot!.North - (row / Width + 0.5) * snapshot.Step : null,
            pixel is int col ? snapshot!.West + (col % Width + 0.5) * snapshot.Step : null,
            snapshot?.Step, null, "nearest_grid_point", status, null,
            new Dictionary<string, HotspotWeatherValue>
            {
                ["soil_moisture_anomaly_0_to_10cm"] = Value(top),
                ["soil_moisture_anomaly_10_to_40cm"] = Value(middle),
                ["soil_moisture_anomaly_40_to_100cm"] = Value(bottom),
                ["soil_moisture_anomaly_0_to_40cm"] = Value(top + middle),
                ["soil_moisture_anomaly_0_to_100cm"] = Value(top + middle + bottom),
            });

        HotspotWeatherValue Value(double? value) => new(value, "mm", ready ? snapshot!.Start : null,
            ready ? snapshot!.End : null, ready ? age!.Value.TotalMinutes : null,
            value.HasValue ? null : pixel.HasValue ? "no_source_coverage" : status);
    }

    [GeneratedRegex(@"<td\b[^>]*>\s*(\d{2}[A-Za-z]{3}\d{4})\s*-\s*(\d{2}[A-Za-z]{3}\d{4})", RegexOptions.CultureInvariant)]
    private static partial Regex PublishedPeriod();

    private sealed record Snapshot(DateTimeOffset Start, DateTimeOffset End, double West, double North, double Step, float[][] Layers)
    {
        public int? FindPixel(double latitude, double longitude)
        {
            var row = (int)Math.Floor((North - latitude) / Step);
            var col = (int)Math.Floor((longitude - West) / Step);
            return row is >= 0 and < Height && col is >= 0 and < Width ? row * Width + col : null;
        }
    }
}
