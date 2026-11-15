using System.Globalization;
using System.Xml;
using System.Xml.Linq;
using Microsoft.Extensions.Caching.Memory;
using NasaSpaceApps.Api.Firms;

namespace NasaSpaceApps.Api.Weather;

internal sealed class NoaaGoesWeather(IHttpClientFactory clients, IMemoryCache cache, ILogger<NoaaGoesWeather> logger)
{
    public const string HttpClientName = "NoaaGoesWeather";
    private const string LightningProduct = "GLM-L2-LCFA";
    private const double LightningRadiusKm = 50;
    private static readonly Satellite[] Satellites = [new("GOES-19", "noaa-goes19", -75), new("GOES-18", "noaa-goes18", -137)];
    private readonly SemaphoreSlim reads = new(4);
    private static readonly RasterProduct[] Rasters =
    [
        new("ABI-L2-CMIPF", GoesMeasurements.Product.Infrared, [("satellite_infrared_brightness_temperature", "K")]),
        new("ABI-L2-ACMF", GoesMeasurements.Product.Cloud,
            [("satellite_cloud_mask", "class 0–3"), ("satellite_cloud_fraction", "1"), ("satellite_cloud_footprint_coverage", "1")]),
        new("ABI-L2-ADPF", GoesMeasurements.Product.Smoke, [("satellite_smoke_flag", "flag")]),
        new("ABI-L2-CODF", GoesMeasurements.Product.OpticalDepth, [("satellite_cloud_optical_depth_640nm", "1")]),
        new("ABI-L2-ACHAF", GoesMeasurements.Product.CloudTopHeight, [("satellite_cloud_top_geopotential_height", "m")]),
        new("ABI-L2-ACTPF", GoesMeasurements.Product.CloudTopPhase, [("satellite_cloud_top_phase", "class 0–5")]),
    ];

    public async Task<HotspotWeatherSource[][]> EnrichAsync(IReadOnlyList<FirmsHotspot?> spots, CancellationToken token)
    {
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(token);
        deadline.CancelAfter(TimeSpan.FromSeconds(12));
        using var http = clients.CreateClient(HttpClientName);
        var store = new WeatherObjectStore(http, deadline.Token);
        var lists = new System.Collections.Concurrent.ConcurrentDictionary<(Satellite, string, DateTimeOffset), Lazy<Task<Scene[]>>>();
        return await Task.WhenAll(spots.Select(EnrichSpot)).ConfigureAwait(false);

        async Task<HotspotWeatherSource[]> EnrichSpot(FirmsHotspot? spot)
        {
            if (spot is null) return [];
            var satellite = Satellites.MinBy(satellite => Math.Abs(Math.IEEERemainder(spot.Longitude - satellite.Longitude, 360)))!;
            var view = GoesMeasurements.Project(spot.Latitude, spot.Longitude, satellite.Longitude, 6_378_137, 6_356_752.31414, 35_786_023);
            var abi = Rasters.Select(product => SafeSource(product.Folder, satellite, spot,
                view is not null, product.Fields, () => ReadRaster(product, satellite, spot))).ToArray();
            var glm = SafeSource(LightningProduct, satellite, spot,
                view is { } angles && Math.Abs(spot.Latitude) < 50 && angles.X * angles.X + angles.Y * angles.Y < 0.12 * 0.12,
                [("observed_lightning_flash_count_50km", "flashes"), ("observed_lightning_nearest_50km", "km")],
                () => ReadLightning(satellite, spot));
            return await Task.WhenAll(abi.Append(glm)).ConfigureAwait(false);
        }

        async Task<Measurement?> ReadRaster(RasterProduct product, Satellite satellite, FirmsHotspot spot)
        {
            var frames = await Recent(satellite, product.Folder, spot.AcquiredAtUtc, TimeSpan.FromMinutes(20)).ConfigureAwait(false);
            var scene = frames.Where(frame => product.Kind != GoesMeasurements.Product.Infrared || frame.Key.Contains("C13_", StringComparison.Ordinal))
                .MaxBy(frame => frame.End);
            if (scene is null) return null;
            var values = await ReadAsync(() =>
            {
                using var stream = store.Open(ObjectUri(satellite, scene.Key), scene.Size);
                return GoesMeasurements.ReadRaster(stream, product.Kind, spot);
            }).ConfigureAwait(false);
            return new Measurement(scene.Start, scene.End, values);
        }

        async Task<Measurement?> ReadLightning(Satellite satellite, FirmsHotspot spot)
        {
            var scenes = await Recent(satellite, LightningProduct, spot.AcquiredAtUtc, TimeSpan.FromMinutes(2)).ConfigureAwait(false);
            var window = LightningWindow(scenes);
            if (window.Length < 3) return null;
            var start = window[0].Start;
            var end = window[^1].End;
            var samples = await Task.WhenAll(window.Select(scene => ReadAsync(() =>
            {
                using var stream = store.Open(ObjectUri(satellite, scene.Key), scene.Size);
                return GoesMeasurements.ReadFlashes(stream, spot.Latitude, spot.Longitude, scene.Start, start, end, LightningRadiusKm);
            }))).ConfigureAwait(false);
            return new Measurement(start, end, new Dictionary<string, double?>
            {
                ["observed_lightning_flash_count_50km"] = samples.Sum(sample => sample.Count),
                ["observed_lightning_nearest_50km"] = samples.Select(sample => sample.NearestKm).Min(),
            });
        }

        async Task<Scene[]> Recent(Satellite satellite, string folder, DateTimeOffset acquired, TimeSpan maxAge)
        {
            var utc = acquired.UtcDateTime;
            var hour = new DateTimeOffset(utc.Date.AddHours(utc.Hour), TimeSpan.Zero);
            var frames = await List(satellite, folder, hour).ConfigureAwait(false);
            if (acquired - maxAge < hour)
            {
                var previous = await List(satellite, folder, hour.AddHours(-1)).ConfigureAwait(false);
                frames = frames.Concat(previous).ToArray();
            }
            return frames.Where(scene => scene.End <= acquired && acquired - scene.End <= maxAge).ToArray();
        }

        Task<Scene[]> List(Satellite satellite, string folder, DateTimeOffset hour) => lists.GetOrAdd((satellite, folder, hour), key =>
            new Lazy<Task<Scene[]>>(() => FetchListAsync(http, key.Item1, key.Item2, key.Item3, deadline.Token))).Value;

        async Task<T> ReadAsync<T>(Func<T> action)
        {
            await reads.WaitAsync(deadline.Token).ConfigureAwait(false);
            try { return await Task.Run(action, deadline.Token).ConfigureAwait(false); }
            finally { reads.Release(); }
        }

        async Task<HotspotWeatherSource> SafeSource(string product, Satellite satellite, FirmsHotspot spot, bool covered,
            (string Name, string Unit)[] fields, Func<Task<Measurement?>> fetch)
        {
            Measurement? measurement = null;
            var missing = covered ? "no_matching_frame" : "outside_coverage";
            try
            {
                if (covered) measurement = await fetch().ConfigureAwait(false);
            }
            catch (Exception error) when (!token.IsCancellationRequested && error is not OutOfMemoryException)
            {
                if (error is not OperationCanceledException) logger.LogWarning("GOES {Product} was unavailable: {Message}", product, error.Message);
                missing = "source_unavailable";
            }

            var values = fields.ToDictionary(field => field.Name, field =>
            {
                var value = measurement?.Values.GetValueOrDefault(field.Name);
                var age = measurement is null ? (double?)null : (spot.AcquiredAtUtc - measurement.End).TotalMinutes;
                var reason = value.HasValue ? null : measurement is null ? missing : "no_source_coverage";
                if (field.Name == "observed_lightning_nearest_50km" && measurement is not null && value is null)
                    reason = "no_flash_in_radius";
                return new HotspotWeatherValue(value, field.Unit, measurement?.Start, measurement?.End, age, reason);
            });
            return new HotspotWeatherSource("NOAA", satellite.Name + " " + product, "observation", null, null, null, null,
                product == LightningProduct ? "three_complete_scans_within_50km" : "fixed_grid_point_and_cloud_footprint",
                measurement is null ? missing : "available", null, values);
        }
    }

    private async Task<Scene[]> FetchListAsync(HttpClient http, Satellite satellite, string folder, DateTimeOffset hour, CancellationToken token)
    {
        var key = (nameof(NoaaGoesWeather), satellite, folder, hour);
        if (cache.TryGetValue<Scene[]>(key, out var cached) && cached is not null) return cached;
        var prefix = FormattableString.Invariant($"{folder}/{hour:yyyy}/{hour.DayOfYear:000}/{hour:HH}/");
        var xml = await http.GetStringAsync(new Uri($"https://{satellite.Host}.s3.amazonaws.com/?list-type=2&prefix={Uri.EscapeDataString(prefix)}&max-keys=1000"), token)
            .ConfigureAwait(false);
        var root = XDocument.Parse(xml).Root ?? throw new XmlException("Missing GOES object listing.");
        if (root.Name.LocalName != "ListBucketResult") throw new XmlException("Unexpected GOES object listing.");
        var ns = root.Name.Namespace;
        var result = new List<Scene>();
        foreach (var entry in root.Elements(ns + "Contents"))
        {
            var name = entry.Element(ns + "Key")?.Value;
            if (name is null || !name.StartsWith(prefix, StringComparison.Ordinal) ||
                !long.TryParse(entry.Element(ns + "Size")?.Value, CultureInfo.InvariantCulture, out var size) || size is < 8 or > 80_000_000)
                continue;
            if (ParseScene(name, size) is { } scene) result.Add(scene);
        }
        var frames = result.ToArray();
        cache.Set(key, frames, TimeSpan.FromMinutes(1));
        return frames;
    }

    internal static Scene? ParseScene(string path, long size)
    {
        var start = path.LastIndexOf("_s", StringComparison.Ordinal);
        var end = path.LastIndexOf("_e", StringComparison.Ordinal);
        if (start < 0 || end < 0 || start + 16 > path.Length || end + 16 > path.Length || !path.EndsWith(".nc", StringComparison.Ordinal))
            return null;
        var s = Goestime(path.AsSpan(start + 2, 14));
        var e = Goestime(path.AsSpan(end + 2, 14));
        return s is { } from && e is { } through && through > from ? new Scene(path, size, from, through) : null;
    }

    private static DateTimeOffset? Goestime(ReadOnlySpan<char> value)
    {
        if (!int.TryParse(value[..4], out var year) || year is < 2000 or > 2100 || !int.TryParse(value.Slice(4, 3), out var day) ||
            day < 1 || day > (DateTime.IsLeapYear(year) ? 366 : 365) ||
            !TimeOnly.TryParseExact(value[7..], "HHmmssf", CultureInfo.InvariantCulture, DateTimeStyles.None, out var time))
            return null;
        return new DateTimeOffset(new DateOnly(year, 1, 1).AddDays(day - 1).ToDateTime(time), TimeSpan.Zero);
    }

    internal static Scene[] LightningWindow(IReadOnlyList<Scene> scenes)
    {
        var latest = scenes.DistinctBy(scene => scene.Start).OrderByDescending(scene => scene.End).Take(3).Reverse().ToArray();
        if (latest.Length != 3 || latest.Any(scene => (scene.End - scene.Start).TotalSeconds is < 19 or > 21) ||
            (latest[1].Start - latest[0].End).Duration() > TimeSpan.FromSeconds(1) ||
            (latest[2].Start - latest[1].End).Duration() > TimeSpan.FromSeconds(1))
            return [];
        return latest;
    }

    private static Uri ObjectUri(Satellite satellite, string path) => new($"https://{satellite.Host}.s3.amazonaws.com/{path}");
    internal sealed record Scene(string Key, long Size, DateTimeOffset Start, DateTimeOffset End);
    private sealed record RasterProduct(string Folder, GoesMeasurements.Product Kind, (string Name, string Unit)[] Fields);
    private sealed record Satellite(string Name, string Host, double Longitude);
    private sealed record Measurement(DateTimeOffset Start, DateTimeOffset End, IReadOnlyDictionary<string, double?> Values);
}
