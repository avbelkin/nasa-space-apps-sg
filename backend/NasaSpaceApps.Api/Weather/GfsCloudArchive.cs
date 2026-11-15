using System.Collections.Concurrent;
using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Text.RegularExpressions;
using static NasaSpaceApps.Api.Weather.GfsGribSubset;

namespace NasaSpaceApps.Api.Weather;

internal sealed partial class GfsCloudArchive(IHttpClientFactory clients, TimeProvider clock, ILogger<GfsCloudArchive> logger)
{
    internal const string HttpClientName = "GfsCloudArchive";
    private const string GcsBaseUrl = "https://storage.googleapis.com/global-forecast-system/";
    private const string S3BaseUrl = "https://noaa-gfs-bdp-pds.s3.amazonaws.com/";
    private const long CoalesceGapBytes = 128 * 1024;
    private const int MaxRangeBytes = 64 * 1024 * 1024;
    private static readonly string[] MirrorRoots = [GcsBaseUrl, S3BaseUrl];

    private static readonly HashSet<(string Var, string Level)> WeatherFields = BuildWeatherFieldSet();
    private static readonly HashSet<(string Var, string Level)> SnowFields = [("SNOWC", "surface")];

    private readonly SemaphoreSlim rangeRequests = new(8);

    [GeneratedRegex(@"^(\d+)-(\d+)\s+", RegexOptions.CultureInvariant)]
    private static partial Regex ForecastRangePattern();

    internal async Task<CloudHourData?> DownloadHourAsync(
        DateTimeOffset run, DateTimeOffset valid, bool isSnow, CancellationToken token)
    {
        var relativeGrib = FormattableString.Invariant(
            $"gfs.{run:yyyyMMdd}/{run:HH}/atmos/{NoaaGfsWeather.ObjectFilename(run, valid, isSnow)}");
        var relativeIdx = relativeGrib + ".idx";

        var idxResult = await DownloadTextWithFallbackAsync(relativeIdx, preferredMirrorIndex: 0, token)
            .ConfigureAwait(false);
        if (idxResult is null) return null;

        var (idxText, mirrorIndex, modifiedAt) = idxResult.Value;
        var ranges = SelectByteRanges(idxText, isSnow);
        if (ranges.Count == 0)
        {
            logger.LogWarning("NOAA cloud index {Path} yielded no matching GRIB2 fields.", relativeIdx);
            return null;
        }

        var unpacked = new ConcurrentBag<UnpackedField>();
        var modifiedTicks = modifiedAt?.UtcTicks ?? -1L;
        await Parallel.ForEachAsync(ranges, new ParallelOptions
        {
            MaxDegreeOfParallelism = 8,
            CancellationToken = token,
        }, async (range, ct) =>
        {
            var downloaded = await DownloadRangeWithFallbackAsync(relativeGrib, range, mirrorIndex, ct)
                .ConfigureAwait(false);
            if (downloaded.ModifiedAt is { } rangeModified)
                Interlocked.CompareExchange(ref modifiedTicks, rangeModified.UtcTicks, -1L);
            var buffer = downloaded.Bytes;

            if (range.Entries.Count == 1)
            {
                UnpackEntry(range.Entries[0]);
            }
            else
            {
                Parallel.ForEach(range.Entries, UnpackEntry);
            }

            void UnpackEntry(IdxEntry entry)
            {
                var offset = checked((int)(entry.Start - range.Start));
                var length = entry.End is { } end
                    ? checked((int)(end - entry.Start + 1))
                    : buffer.Length - offset;
                if (offset < 0 || length < 20 || offset + length > buffer.Length)
                    throw new InvalidDataException($"Corrupt byte slice [{offset}..+{length}] in range [{range.Start}..{range.End}].");
                foreach (var field in UnpackGlobalMessage(buffer.AsSpan(offset, length)))
                    unpacked.Add(field);
            }
        }).ConfigureAwait(false);

        var selected = new Dictionary<Parameter, UnpackedField>();
        foreach (var field in unpacked)
        {
            if (field.Run != run || field.End != valid) continue;
            if (selected.TryGetValue(field.Parameter, out var existing) &&
                existing.End == field.End && existing.Start >= field.Start)
                continue;
            selected[field.Parameter] = field;
        }

        if (selected.Count == 0)
        {
            logger.LogWarning("NOAA cloud archive produced zero matching fields for {Path}.", relativeGrib);
            return null;
        }

        DateTimeOffset? finalModifiedAt = modifiedTicks >= 0 ? new DateTimeOffset(modifiedTicks, TimeSpan.Zero) : null;
        return new CloudHourData(selected.Values.ToArray(), clock.GetUtcNow(), finalModifiedAt);
    }

    internal static IReadOnlyList<ByteRange> SelectByteRanges(string idxContent, bool isSnow)
    {
        var targets = isSnow ? SnowFields : WeatherFields;
        var parsed = new List<(long Offset, string Var, string Level, string TimeSpec)>();
        foreach (var rawLine in idxContent.Split('\n'))
        {
            var line = rawLine.TrimEnd('\r');
            if (string.IsNullOrWhiteSpace(line)) continue;
            var parts = line.Split(':');
            if (parts.Length < 6 || !long.TryParse(parts[1], NumberStyles.None, CultureInfo.InvariantCulture, out var offset))
                continue;
            parsed.Add((offset, parts[3], parts[4], parts[5]));
        }

        var chosen = new Dictionary<(string Var, string Level), IdxEntry>();
        for (var i = 0; i < parsed.Count; i++)
        {
            var item = parsed[i];
            var key = (item.Var, item.Level);
            if (!targets.Contains(key)) continue;

            long? end = i + 1 < parsed.Count ? parsed[i + 1].Offset - 1 : null;
            if (end is { } endByte && endByte < item.Offset) continue;

            var score = ScoreForecastSpec(item.TimeSpec);
            var candidate = new IdxEntry(item.Offset, end, item.Var, item.Level, score);
            if (!chosen.TryGetValue(key, out var existing) || candidate.Score.CompareTo(existing.Score) < 0)
                chosen[key] = candidate;
        }

        if (chosen.Count == 0) return [];
        var ordered = chosen.Values.OrderBy(entry => entry.Start).ToArray();
        var ranges = new List<ByteRange>();
        var currentEntries = new List<IdxEntry> { ordered[0] };
        var rangeStart = ordered[0].Start;
        var rangeEnd = ordered[0].End;

        for (var i = 1; i < ordered.Length; i++)
        {
            var next = ordered[i];
            if (rangeEnd is { } prevEnd && next.Start - (prevEnd + 1) <= CoalesceGapBytes)
            {
                var projectedBytes = (next.End ?? next.Start) - rangeStart + 1;
                if (projectedBytes <= MaxRangeBytes)
                {
                    currentEntries.Add(next);
                    rangeEnd = next.End;
                    continue;
                }
            }
            ranges.Add(new ByteRange(rangeStart, rangeEnd, currentEntries.ToArray()));
            currentEntries = [next];
            rangeStart = next.Start;
            rangeEnd = next.End;
        }
        ranges.Add(new ByteRange(rangeStart, rangeEnd, currentEntries.ToArray()));
        return ranges;
    }

    private static ForecastScore ScoreForecastSpec(string timeSpec)
    {
        if (string.Equals(timeSpec, "anl", StringComparison.OrdinalIgnoreCase))
            return new ForecastScore(0, 0);
        var range = ForecastRangePattern().Match(timeSpec);
        if (range.Success &&
            int.TryParse(range.Groups[1].ValueSpan, NumberStyles.None, CultureInfo.InvariantCulture, out var startHour) &&
            int.TryParse(range.Groups[2].ValueSpan, NumberStyles.None, CultureInfo.InvariantCulture, out var endHour))
        {
            return new ForecastScore(1, Math.Max(0, endHour - startHour));
        }
        return new ForecastScore(0, 0);
    }

    private async Task<(string Text, int MirrorIndex, DateTimeOffset? ModifiedAt)?> DownloadTextWithFallbackAsync(
        string relativePath, int preferredMirrorIndex, CancellationToken token)
    {
        for (var attempt = 0; attempt < MirrorRoots.Length; attempt++)
        {
            var mirrorIndex = (preferredMirrorIndex + attempt) % MirrorRoots.Length;
            var url = MirrorRoots[mirrorIndex] + relativePath;
            try
            {
                using var http = clients.CreateClient(HttpClientName);
                using var response = await http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, token)
                    .ConfigureAwait(false);
                if (!response.IsSuccessStatusCode)
                {
                    if (response.StatusCode != HttpStatusCode.NotFound || attempt == MirrorRoots.Length - 1)
                        logger.LogWarning("NOAA cloud index {Url} returned HTTP {Status}.", url, (int)response.StatusCode);
                    continue;
                }
                var text = await response.Content.ReadAsStringAsync(token).ConfigureAwait(false);
                return (text, mirrorIndex, response.Content.Headers.LastModified);
            }
            catch (Exception error) when (!token.IsCancellationRequested && error is HttpRequestException or TaskCanceledException)
            {
                logger.LogWarning("Failed to read NOAA cloud index {Url}: {Message}", url, error.Message);
            }
        }
        return null;
    }

    private async Task<(byte[] Bytes, DateTimeOffset? ModifiedAt)> DownloadRangeWithFallbackAsync(
        string relativePath, ByteRange range, int preferredMirrorIndex, CancellationToken token)
    {
        Exception? lastError = null;
        for (var attempt = 0; attempt < MirrorRoots.Length; attempt++)
        {
            var mirrorIndex = (preferredMirrorIndex + attempt) % MirrorRoots.Length;
            var url = MirrorRoots[mirrorIndex] + relativePath;
            await rangeRequests.WaitAsync(token).ConfigureAwait(false);
            try
            {
                using var http = clients.CreateClient(HttpClientName);
                using var request = new HttpRequestMessage(HttpMethod.Get, url);
                request.Headers.Range = range.End is { } end
                    ? new RangeHeaderValue(range.Start, end)
                    : new RangeHeaderValue(range.Start, null);

                using var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, token)
                    .ConfigureAwait(false);
                if (response.StatusCode is not (HttpStatusCode.PartialContent or HttpStatusCode.OK))
                    throw new HttpRequestException($"Unexpected status {(int)response.StatusCode} for {url}.", null, response.StatusCode);
                if (response.StatusCode == HttpStatusCode.OK && range.Start > 0)
                    throw new IOException($"Mirror {url} ignored HTTP byte range header.");

                var bytes = await response.Content.ReadAsByteArrayAsync(token).ConfigureAwait(false);
                if (range.End is { } expectedEnd)
                {
                    var expectedLength = checked((int)(expectedEnd - range.Start + 1));
                    if (bytes.Length != expectedLength)
                        throw new IOException($"Expected {expectedLength} bytes from {url}, received {bytes.Length}.");
                }
                return (bytes, response.Content.Headers.LastModified);
            }
            catch (Exception error) when (!token.IsCancellationRequested && error is HttpRequestException or IOException or TaskCanceledException)
            {
                lastError = error;
                logger.LogWarning("NOAA cloud range {Url} [{Start}..{End}] failed: {Message}",
                    url, range.Start, range.End, error.Message);
            }
            finally
            {
                rangeRequests.Release();
            }
        }
        throw lastError ?? new HttpRequestException($"Failed to read NOAA cloud range for {relativePath}.");
    }

    private static HashSet<(string Var, string Level)> BuildWeatherFieldSet()
    {
        var set = new HashSet<(string Var, string Level)>
        {
            ("HGT", "cloud ceiling"),
            ("CWAT", "entire atmosphere (considered as a single layer)"),
            ("CRAIN", "surface"),
            ("CFRZR", "surface"),
            ("CICEP", "surface"),
            ("CSNOW", "surface"),
            ("FLDCP", "surface"),
            ("WILT", "surface"),
            ("TMP", "2 m above ground"),
            ("DPT", "2 m above ground"),
            ("RH", "2 m above ground"),
            ("UGRD", "10 m above ground"),
            ("VGRD", "10 m above ground"),
            ("GUST", "surface"),
            ("VIS", "surface"),
            ("TCDC", "entire atmosphere"),
            ("PWAT", "entire atmosphere (considered as a single layer)"),
            ("TMP", "surface"),
            ("PRES", "surface"),
            ("DSWRF", "surface"),
            ("HGT", "surface"),
            ("SNOD", "surface"),
            ("PRES", "low cloud bottom level"),
            ("PRES", "low cloud top level"),
            ("PRES", "middle cloud bottom level"),
            ("PRES", "middle cloud top level"),
            ("PRES", "high cloud bottom level"),
            ("PRES", "high cloud top level"),
            ("SOILW", "0-0.1 m below ground"),
            ("SOILW", "0.1-0.4 m below ground"),
            ("SOILW", "0.4-1 m below ground"),
        };
        foreach (var p in new[] { 1000, 925, 850, 700, 600, 500, 400, 300, 250, 200, 150, 100 })
            set.Add(("HGT", $"{p} mb"));
        foreach (var p in new[] { 925, 850, 700, 500, 300 })
        {
            set.Add(("CLWMR", $"{p} mb"));
            set.Add(("ICMR", $"{p} mb"));
        }
        foreach (var p in new[] { 925, 850 })
        {
            set.Add(("TMP", $"{p} mb"));
            set.Add(("RH", $"{p} mb"));
            set.Add(("UGRD", $"{p} mb"));
            set.Add(("VGRD", $"{p} mb"));
        }
        return set;
    }

    internal readonly record struct ForecastScore(int IsInterval, int SpanHours) : IComparable<ForecastScore>
    {
        public int CompareTo(ForecastScore other)
        {
            var instantComparison = IsInterval.CompareTo(other.IsInterval);
            return instantComparison != 0 ? instantComparison : SpanHours.CompareTo(other.SpanHours);
        }
    }

    internal sealed record IdxEntry(long Start, long? End, string Var, string Level, ForecastScore Score);
    internal sealed record ByteRange(long Start, long? End, IReadOnlyList<IdxEntry> Entries);
    internal sealed record CloudHourData(IReadOnlyList<UnpackedField> Fields, DateTimeOffset FetchedAt, DateTimeOffset? ModifiedAt);
}
