using System.Net;
using Microsoft.Extensions.Caching.Memory;
using NasaSpaceApps.Api.Firms;

namespace NasaSpaceApps.Api.Weather;

internal sealed class UsfsFuelMoisture(IHttpClientFactory clients, IMemoryCache cache, ILogger<UsfsFuelMoisture> logger,
    EncodedWeatherGridCache? grids = null)
{
    public const string HttpClientName = "UsfsFuelMoisture";
    private const string BaseUrl = "https://www.wfas.net/data/Current/";
    private const string ZoneName = "America/Denver";
    private const int Width = 576;
    private const int Height = 243;
    private static readonly TimeSpan GridLifetime = TimeSpan.FromMinutes(30);
    private static readonly TimeZoneInfo ProductZone = TimeZoneInfo.FindSystemTimeZoneById(ZoneName);
    private static readonly int[] Periods = [10, 100, 1000];
    private static readonly (string Suffix, string Kind, int DayOffset)[] Products =
        [("O_-1", "observation", -1), ("F_0", "forecast", 0), ("F_1", "forecast", 1)];
    private readonly SemaphoreSlim refresh = new(1);
    private readonly EncodedWeatherGridCache gridCache = grids ?? EncodedWeatherGridCache.Disabled;

    public async Task<HotspotWeatherSource?[]> EnrichAsync(IReadOnlyList<FirmsHotspot?> spots, CancellationToken token)
    {
        var frames = Array.Empty<Frame>();
        var reachable = true;
        if (spots.Any(spot => spot is not null && InRegion(spot)))
        {
            using var deadline = CancellationTokenSource.CreateLinkedTokenSource(token);
            deadline.CancelAfter(TimeSpan.FromSeconds(9));
            try
            {
                await refresh.WaitAsync(deadline.Token).ConfigureAwait(false);
                try { (frames, reachable) = await LoadAsync(deadline.Token).ConfigureAwait(false); }
                finally { refresh.Release(); }
            }
            catch (OperationCanceledException) when (!token.IsCancellationRequested)
            {
                if (cache.TryGetValue<Frame[]>(HttpClientName, out var retained) && retained is not null)
                    frames = retained.Where(frame => IsRecent(frame, DateTimeOffset.UtcNow)).ToArray();
                reachable = false;
            }
        }
        return spots.Select(spot => AtSpot(spot, frames, reachable)).ToArray();
    }

    private async Task<(Frame[] Frames, bool Reachable)> LoadAsync(CancellationToken token)
    {
        var refreshed = cache.TryGetValue((HttpClientName, "refreshed"), out _);
        cache.TryGetValue<Frame[]>(HttpClientName, out var previous);
        if (refreshed && previous is not null) return (previous.Where(frame => IsRecent(frame, DateTimeOffset.UtcNow)).ToArray(), true);

        using var http = clients.CreateClient(HttpClientName);
        var result = await Task.WhenAll(Products.Select(async product =>
        {
            try
            {
                var layers = await Task.WhenAll(Periods.Select(period => ReadRasterAsync(product.Suffix, period))).ConfigureAwait(false);
                var available = layers.OfType<Raster>().ToArray();
                if (available.Length == 0) return (Frame: (Frame?)null, Reachable: true);
                var revision = available.Max(layer => layer.Modified);
                var grid = available[0].Grid;
                if (available.Any(layer => ProductDate(layer.Modified) != ProductDate(revision) || layer.Grid != grid ||
                    revision - layer.Modified > TimeSpan.FromMinutes(2)))
                    throw new InvalidDataException("WFAS fuel moisture revisions or grids disagree.");
                return (Frame: new Frame(ProductDate(revision).AddDays(product.DayOffset), revision, product.Kind, grid, layers, DateTimeOffset.UtcNow),
                    Reachable: true);
            }
            catch (Exception error) when (!token.IsCancellationRequested && error is
                HttpRequestException or OperationCanceledException or IOException or InvalidDataException or ArgumentException or OverflowException)
            {
                if (error is not OperationCanceledException)
                    logger.LogWarning("WFAS {Product} fuel moisture was unavailable: {Message}", product.Suffix, error.Message);
                return (Frame: (Frame?)null, Reachable: false);
            }
        })).ConfigureAwait(false);

        var now = DateTimeOffset.UtcNow;
        var frames = result.Select(record => record.Frame).OfType<Frame>().Concat(previous ?? [])
            .Where(frame => IsRecent(frame, now))
            .OrderByDescending(frame => frame.Revision)
            .DistinctBy(frame => (frame.Date, frame.Kind, frame.Revision))
            .Take(9).ToArray();
        var reachable = result.All(record => record.Reachable);
        cache.Set(HttpClientName, frames, GridLifetime);
        if (reachable) cache.Set((HttpClientName, "refreshed"), true, TimeSpan.FromMinutes(15));
        return (frames, reachable);

        async Task<Raster?> ReadRasterAsync(string suffix, int hours)
        {
            var url = BaseUrl + FormattableString.Invariant($"MC{hours}_Current_{suffix}.tif");
            try
            {
                return await gridCache.GetAsync(url, DateTimeOffset.UtcNow.AddMinutes(15),
                    cancellation => gridCache.DownloadAsync(http, url, 640 * 1024, cancellation),
                    encoded => new Raster(FloatWeatherTiff.ReadWgs84Grid(encoded.Bytes),
                        encoded.ModifiedAt ?? throw new InvalidDataException("Missing WFAS raster revision timestamp."),
                        FloatWeatherTiff.ReadValues(encoded.Bytes, Width, Height)), token).ConfigureAwait(false);
            }
            catch (HttpRequestException error) when (error.StatusCode == HttpStatusCode.NotFound) { return null; }
        }
    }

    private static HotspotWeatherSource? AtSpot(FirmsHotspot? spot, Frame[] frames, bool reachable)
    {
        if (spot is null) return null;
        var date = ProductDate(spot.AcquiredAtUtc);
        // Daily observation summaries can be published after the hotspot timestamp.
        // A forecast must already have been published at the time of acquisition.
        var frame = frames.Where(frame => frame.Date == date && (frame.Kind == "observation" || frame.Revision <= spot.AcquiredAtUtc))
            .OrderBy(frame => frame.Kind == "observation" ? 0 : 1).FirstOrDefault();
        var point = InRegion(spot) ? frame?.FindPixel(spot.Latitude, spot.Longitude) : null;
        var status = !InRegion(spot) ? "outside_coverage" : frame is null ? reachable ? "no_matching_frame" : "source_unavailable" :
            point.HasValue ? "available" : "outside_coverage";
        var values = new Dictionary<string, HotspotWeatherValue>();
        for (var i = 0; i < Periods.Length; i++)
        {
            var raster = frame?.Rasters[i];
            var sample = point is { } pixel ? raster?.Values[pixel.Row * Width + pixel.Col] : null;
            var value = sample is >= 0 and <= 100 ? (double?)sample : null;
            values.Add($"dead_fuel_moisture_{Periods[i]}h", new HotspotWeatherValue(value, "%", null, null, null,
                value.HasValue ? null : point.HasValue ? raster is null ? "source_unavailable" : "no_source_coverage" : status)
            {
                ValidDateLocal = frame?.Date,
                ValidDateTimeZone = frame is null ? null : ZoneName,
            });
        }

        return new HotspotWeatherSource("USDA Forest Service", "Wildland Fire Assessment System daily dead fuel moisture",
            frame?.Kind ?? "daily", point is { } y ? frame!.Grid.North - (y.Row + 0.5) * frame.Grid.Step : null,
            point is { } x ? frame!.Grid.West + (x.Col + 0.5) * frame.Grid.Step : null, frame?.Grid.Step, null,
            "nearest_grid_point", status, null, values)
        {
            PublishedAtUtc = frame?.Revision,
        };
    }

    internal static DateOnly ProductDate(DateTimeOffset time) => DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(time, ProductZone).DateTime);

    internal static bool InRegion(FirmsHotspot spot) =>
        spot.Latitude is >= 24 and <= 50 && spot.Longitude is >= -125 and <= -67;

    private static bool IsRecent(Frame frame, DateTimeOffset now) => now - frame.FetchedAt < GridLifetime;

    private sealed record Raster((double West, double North, double Step) Grid, DateTimeOffset Modified, float[] Values);

    private sealed record Frame(DateOnly Date, DateTimeOffset Revision, string Kind,
        (double West, double North, double Step) Grid, Raster?[] Rasters, DateTimeOffset FetchedAt)
    {
        public (int Row, int Col)? FindPixel(double latitude, double longitude)
        {
            var row = (int)Math.Floor((Grid.North - latitude) / Grid.Step);
            var col = (int)Math.Floor((longitude - Grid.West) / Grid.Step);
            return row is >= 0 and < Height && col is >= 0 and < Width ? (row, col) : null;
        }
    }
}
