using System.Globalization;
using System.IO.Compression;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Caching.Memory;
using NasaSpaceApps.Api.Firms;

namespace NasaSpaceApps.Api.Weather;

internal sealed partial class NoaaMrmsRadar(IHttpClientFactory clients, IMemoryCache cache, ILogger<NoaaMrmsRadar> logger)
{
    public const string HttpClientName = "NoaaMrmsRadar";
    private const string Directory = "https://mrms.ncep.noaa.gov/data/2D/MergedBaseReflectivityQC/";
    private const int MaximumFramesPerBatch = 4;
    private const int MaximumMessageBytes = 16 * 1024 * 1024;
    private readonly SemaphoreSlim reads = new(2);

    internal async Task<HotspotWeatherSource?[]> EnrichAsync(IReadOnlyList<FirmsHotspot?> spots, CancellationToken token)
    {
        var result = new HotspotWeatherSource?[spots.Count];
        var candidates = spots.Select((spot, index) => (Spot: spot, Index: index))
            .Where(item => item.Spot is { Latitude: >= 20 and <= 55, Longitude: >= -130 and <= -60 }).ToArray();
        if (candidates.Length == 0) return result;
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(token);
        deadline.CancelAfter(TimeSpan.FromSeconds(8));
        using var http = clients.CreateClient(HttpClientName);
        try
        {
            var frames = await CatalogueAsync(http, deadline.Token).ConfigureAwait(false);
            var batches = candidates.Select(item => (item.Index, Spot: item.Spot!,
                Frame: FindFrame(frames, item.Spot!.AcquiredAtUtc)))
                .Where(item => item.Frame is not null).GroupBy(item => item.Frame!.Value)
                .OrderByDescending(group => group.Count()).ThenByDescending(group => group.Key)
                .Take(MaximumFramesPerBatch);
            await Task.WhenAll(batches.Select(async batch =>
            {
                try
                {
                    var targets = batch.ToArray();
                    var samples = await ReadFrameAsync(http, batch.Key, targets.Select(target => target.Spot).ToArray(), deadline.Token)
                        .ConfigureAwait(false);
                    for (var i = 0; i < targets.Length; i++)
                    {
                        var sample = samples[i];
                        if (sample.MissingReason is "outside_coverage" or "no_source_coverage") continue;
                        result[targets[i].Index] = new HotspotWeatherSource("NOAA MRMS", "Quality-controlled base reflectivity",
                            "observation", null, null, 0.01, null, "nearest_native_png_grid_cell", "available", null,
                            new Dictionary<string, HotspotWeatherValue>
                            {
                                ["radar_reflectivity"] = new(sample.Value, "dBZ", batch.Key, batch.Key,
                                    (targets[i].Spot.AcquiredAtUtc - batch.Key).TotalMinutes, sample.MissingReason),
                            });
                    }
                }
                catch (Exception error) when (!token.IsCancellationRequested && IsFeedError(error))
                {
                    if (error is not OperationCanceledException)
                        logger.LogWarning("MRMS reflectivity at {Time} was unavailable: {Message}", batch.Key, error.Message);
                }
            })).ConfigureAwait(false);
        }
        catch (Exception error) when (!token.IsCancellationRequested && IsFeedError(error))
        {
            if (error is not OperationCanceledException)
                logger.LogWarning("MRMS reflectivity catalogue was unavailable: {Message}", error.Message);
        }
        return result;
    }

    private async Task<DateTimeOffset[]> CatalogueAsync(HttpClient http, CancellationToken token)
    {
        if (cache.TryGetValue<DateTimeOffset[]>(Directory, out var cached) && cached is not null) return cached;
        var html = await http.GetStringAsync(Directory, token).ConfigureAwait(false);
        var frames = FrameName().Matches(html).Select(match => DateTimeOffset.ParseExact(match.Groups[1].Value, "yyyyMMdd-HHmmss",
            CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal))
            .Distinct().Order().ToArray();
        cache.Set(Directory, frames, TimeSpan.FromMinutes(1));
        return frames;
    }

    private async Task<MrmsPngGrid.Sample[]> ReadFrameAsync(HttpClient http, DateTimeOffset frame, FirmsHotspot[] spots, CancellationToken token)
    {
        await reads.WaitAsync(token).ConfigureAwait(false);
        try
        {
            var url = FormattableString.Invariant($"{Directory}MRMS_MergedBaseReflectivityQC_00.50_{frame:yyyyMMdd-HHmmss}.grib2.gz");
            using var source = await http.GetStreamAsync(url, token).ConfigureAwait(false);
            using var gzip = new GZipStream(source, CompressionMode.Decompress);
            using var bytes = new MemoryStream();
            var buffer = new byte[64 * 1024];
            int size;
            while ((size = await gzip.ReadAsync(buffer, token).ConfigureAwait(false)) != 0)
            {
                if (bytes.Length + size > MaximumMessageBytes) throw new InvalidDataException("MRMS GRIB2 exceeded its size limit.");
                bytes.Write(buffer.AsSpan(0, size));
            }
            return MrmsPngGrid.Read(bytes.GetBuffer().AsSpan(0, (int)bytes.Length), frame, spots, token);
        }
        finally { reads.Release(); }
    }

    private static DateTimeOffset? FindFrame(DateTimeOffset[] frames, DateTimeOffset acquisition)
    {
        var index = Array.BinarySearch(frames, acquisition);
        if (index < 0) index = ~index - 1;
        return index >= 0 && acquisition - frames[index] <= TimeSpan.FromMinutes(8) ? frames[index] : null;
    }

    private static bool IsFeedError(Exception error) =>
        error is HttpRequestException or IOException or InvalidDataException or OperationCanceledException or ArgumentException or FormatException or OverflowException;

    [GeneratedRegex(@"MRMS_MergedBaseReflectivityQC_00\.50_(\d{8}-\d{6})\.grib2\.gz", RegexOptions.CultureInvariant)]
    private static partial Regex FrameName();
}
