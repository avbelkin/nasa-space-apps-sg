using System.Globalization;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Caching.Memory;
using NasaSpaceApps.Api.Firms;
using PureHDF;
using PureHDF.Selections;

namespace NasaSpaceApps.Api.Weather;

internal sealed partial class CopernicusSoilDrought(IHttpClientFactory clients, IMemoryCache cache, ILogger<CopernicusSoilDrought> logger)
{
    public const string HttpClientName = "CopernicusSoilDrought";
    private static readonly Uri Directory = new("https://drought.emergency.copernicus.eu/data/Drought_Observatories_datasets/GDO_Soil_Moisture_Index_Anomaly/ver3-0-1/");
    private readonly SemaphoreSlim downloads = new(2);

    public async Task<HotspotWeatherSource?[]> EnrichAsync(IReadOnlyList<FirmsHotspot?> spots, CancellationToken token)
    {
        var result = new HotspotWeatherSource?[spots.Count];
        if (spots.All(spot => spot is null)) return result;
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(token);
        deadline.CancelAfter(TimeSpan.FromSeconds(16));
        using var http = clients.CreateClient(HttpClientName);
        var store = new WeatherObjectStore(http, deadline.Token, 2 * 1024 * 1024);
        try
        {
            var catalogue = await CatalogueAsync(http, deadline.Token).ConfigureAwait(false);
            var groups = Enumerable.Range(0, spots.Count).Where(index => spots[index] is not null).GroupBy(index =>
            {
                var date = DateOnly.FromDateTime(spots[index]!.AcquiredAtUtc.UtcDateTime);
                return catalogue.FirstOrDefault(file => PeriodEnd(file.First) <= date && date.DayNumber - PeriodEnd(file.Last).DayNumber <= 45);
            });
            foreach (var group in groups)
            {
                var requests = group.Select(index => (Index: index, Spot: spots[index]!)).ToArray();
                if (group.Key is not { } file)
                {
                    foreach (var (index, spot) in requests) result[index] = Source(spot.AcquiredAtUtc, null, "no_matching_frame");
                    continue;
                }

                await downloads.WaitAsync(deadline.Token).ConfigureAwait(false);
                try
                {
                    var length = await FileLengthAsync(http, file.Uri, deadline.Token).ConfigureAwait(false);
                    await Task.Run(() =>
                    {
                        using var stream = store.Open(file.Uri, length);
                        using var raster = H5File.Open(stream, leaveOpen: true);
                        var grid = new Grid(raster);
                        foreach (var (index, spot) in requests)
                        {
                            var day = DateOnly.FromDateTime(spot.AcquiredAtUtc.UtcDateTime);
                            var pixel = grid.Nearest(spot.Latitude, spot.Longitude);
                            var key = (nameof(CopernicusSoilDrought), file.Uri, day, pixel);
                            if (!cache.TryGetValue(key, out Sample? sample))
                            {
                                sample = grid.Read(day, pixel);
                                cache.Set(key, sample, TimeSpan.FromHours(1));
                            }
                            result[index] = Source(spot.AcquiredAtUtc, sample, pixel is null ? "outside_coverage" : "no_matching_frame");
                        }
                    }, deadline.Token).ConfigureAwait(false);
                }
                finally { downloads.Release(); }
            }
        }
        catch (Exception error) when (!token.IsCancellationRequested && error is not OutOfMemoryException)
        {
            if (error is not OperationCanceledException) logger.LogWarning("Soil drought data were unavailable: {Message}", error.Message);
            for (var i = 0; i < spots.Count; i++)
                if (spots[i] is { } spot) result[i] ??= Source(spot.AcquiredAtUtc, null, "source_unavailable");
        }
        return result;
    }

    private async Task<RasterFile[]> CatalogueAsync(HttpClient http, CancellationToken token)
    {
        var key = (nameof(CopernicusSoilDrought), "catalogue");
        if (cache.TryGetValue<RasterFile[]>(key, out var cached) && cached is not null) return cached;
        var html = await http.GetStringAsync(Directory, token).ConfigureAwait(false);
        var files = Filename().Matches(html).Select(match => new RasterFile(new Uri(Directory, match.Value),
            DateOnly.ParseExact(match.Groups[1].Value, "yyyyMMdd", CultureInfo.InvariantCulture),
            DateOnly.ParseExact(match.Groups[2].Value, "yyyyMMdd", CultureInfo.InvariantCulture)))
            .Distinct().OrderByDescending(file => file.Last).ToArray();
        if (files.Length == 0) throw new InvalidDataException("Missing numeric soil drought file catalogue.");
        cache.Set(key, files, TimeSpan.FromHours(1));
        return files;
    }

    private async Task<long> FileLengthAsync(HttpClient http, Uri uri, CancellationToken token)
    {
        var key = (nameof(CopernicusSoilDrought), uri);
        if (cache.TryGetValue<long>(key, out var length)) return length;
        using var request = new HttpRequestMessage(HttpMethod.Head, uri);
        using var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, token).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();
        length = response.Content.Headers.ContentLength ?? throw new InvalidDataException("Missing soil drought raster length.");
        cache.Set(key, length, TimeSpan.FromHours(1));
        return length;
    }

    internal static DateOnly PeriodEnd(DateOnly first) => first.Day switch
    {
        1 or 11 => first.AddDays(10),
        21 => new DateOnly(first.Year, first.Month, 1).AddMonths(1),
        _ => throw new InvalidDataException("Unexpected soil drought observation period."),
    };

    internal static int MoistureClass(double anomaly) => anomaly switch
    {
        <= -2 => 1,
        < -1.5 => 2,
        < -1 => 3,
        < 1 => 4,
        < 1.5 => 5,
        < 2 => 6,
        _ => 7,
    };

    private static HotspotWeatherSource Source(DateTimeOffset acquired, Sample? sample, string missing)
    {
        var from = sample?.From.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
        var through = sample?.Through.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
        var anomaly = new HotspotWeatherValue(sample?.Value, "standard deviations (1995–2023)", from, through,
            through.HasValue ? (acquired - through.Value).TotalMinutes : null,
            sample is null ? missing : sample.Value.HasValue ? null : "no_source_coverage");
        return new HotspotWeatherSource("Copernicus GDO / European Commission–JRC", "LISFLOOD GloFAS 4 SMA v3.0.1",
            "modeled_analysis", sample?.Latitude, sample?.Longitude, 0.05, null, "nearest_grid_point", sample is null ? missing : "available",
            null, new Dictionary<string, HotspotWeatherValue>
            {
                ["soil_moisture_standardized_anomaly"] = anomaly,
                ["soil_moisture_anomaly_class"] = anomaly with
                {
                    Unit = "class 1–7 (dry to wet)", Value = anomaly.Value is double value ? MoistureClass(value) : null,
                },
            });
    }

    [GeneratedRegex(@"smang_m_gdo_(\d{8})_(\d{8})_t\.nc", RegexOptions.CultureInvariant)]
    private static partial Regex Filename();

    private sealed record RasterFile(Uri Uri, DateOnly First, DateOnly Last);
    private sealed record Sample(double? Value, double Latitude, double Longitude, DateOnly From, DateOnly Through);

    private sealed class Grid(IH5Group file)
    {
        private readonly double[] latitudes = file.Dataset("lat").Read<double[]>();
        private readonly double[] longitudes = file.Dataset("lon").Read<double[]>();
        private readonly DateOnly[] dates = Dates(file.Dataset("time"));
        private readonly IH5Dataset field = file.Dataset("smang");

        private static DateOnly[] Dates(IH5Dataset time)
        {
            var units = time.Attribute("units").Read<string[]>()[0];
            const string prefix = "days since ";
            if (!units.StartsWith(prefix, StringComparison.Ordinal) || units.Length < prefix.Length + 10 ||
                !DateOnly.TryParseExact(units.AsSpan(prefix.Length, 10), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var epoch))
                throw new InvalidDataException("Unknown soil drought time reference.");
            return time.Read<long[]>().Select(days => epoch.AddDays(checked((int)days))).ToArray();
        }

        public (int Row, int Column)? Nearest(double lat, double lon)
        {
            var row = (int)Math.Round((latitudes[0] - lat) / 0.05);
            lon = lon == 180 ? -180 : lon;
            var col = (int)Math.Round((lon - longitudes[0]) / 0.05);
            return (uint)row < latitudes.Length && (uint)col < longitudes.Length ? (row, col) : null;
        }

        public Sample? Read(DateOnly acquired, (int Row, int Column)? pixel)
        {
            if (pixel is not { } p) return null;
            var time = Array.FindLastIndex(dates, first => PeriodEnd(first) <= acquired);
            if (time < 0 || acquired.DayNumber - PeriodEnd(dates[time]).DayNumber > 45) return null;
            var data = field.Read<float[]>(fileSelection: new PointSelection(new ulong[,] { { (ulong)time, (ulong)p.Row, (ulong)p.Column } }))[0];
            return new Sample(float.IsFinite(data) && Math.Abs(data) < 1e10 ? data : null,
                latitudes[p.Row], longitudes[p.Column], dates[time], PeriodEnd(dates[time]));
        }
    }
}
