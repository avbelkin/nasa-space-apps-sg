using System.IO.Compression;
using System.Text;
using System.Text.Json;
using NasaSpaceApps.Api.Firms;

namespace NasaSpaceApps.Harmonization.Export;

internal sealed record FirmsDatasetBundle(
    IReadOnlyList<FirmsHotspot> Spots,
    DateTimeOffset FetchedAtUtc,
    IReadOnlyDictionary<string, (DateTimeOffset MinUtc, DateTimeOffset MaxUtc, int Count)> InstrumentWindows);

/// <summary>Downloads (or loads cached) multi-day global NASA FIRMS CSV feeds without logging the API key.</summary>
internal static class FirmsDatasetFetcher
{
    private static readonly string[] Sources = ["MODIS_NRT", "VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT"];

    private sealed record CachedMeta(DateTimeOffset FetchedAtUtc);

    public static async Task<FirmsDatasetBundle> FetchWorldAsync(
        HttpClient httpClient,
        string cacheDir,
        int days,
        bool refresh,
        CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(cacheDir);
        var metaPath = Path.Combine(cacheDir, $"firms_world_{days}d_meta.json");
        var allCached = !refresh && File.Exists(metaPath) &&
            Sources.All(s => File.Exists(Path.Combine(cacheDir, $"{s}_world_{days}d.csv.gz")));

        DateTimeOffset fetchedAtUtc;
        var spots = new List<FirmsHotspot>(400_000);

        if (allCached)
        {
            var metaJson = await File.ReadAllTextAsync(metaPath, cancellationToken).ConfigureAwait(false);
            var meta = JsonSerializer.Deserialize<CachedMeta>(metaJson)
                ?? throw new InvalidDataException("Corrupt FIRMS metadata cache.");
            fetchedAtUtc = meta.FetchedAtUtc;

            foreach (var source in Sources)
            {
                var gzPath = Path.Combine(cacheDir, $"{source}_world_{days}d.csv.gz");
                await using var fs = File.OpenRead(gzPath);
                await using var gz = new GZipStream(fs, CompressionMode.Decompress);
                using var sr = new StreamReader(gz, Encoding.UTF8);
                var csv = await sr.ReadToEndAsync(cancellationToken).ConfigureAwait(false);
                var parsed = ParseAndNormalize(csv, source);
                spots.AddRange(parsed);
                Console.WriteLine($"[FIRMS cache] {source}: {parsed.Count:N0} detections");
            }
        }
        else
        {
            var mapKey = ResolveMapKey();
            var escapedKey = Uri.EscapeDataString(mapKey);
            fetchedAtUtc = DateTimeOffset.UtcNow;

            foreach (var source in Sources)
            {
                var url = $"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{escapedKey}/{source}/world/{days}";
                Console.WriteLine($"[FIRMS live] Downloading {source} world {days}d...");
                string csv;
                try
                {
                    csv = await httpClient.GetStringAsync(url, cancellationToken).ConfigureAwait(false);
                }
                catch (Exception ex)
                {
                    var sanitized = ex.Message.Replace(mapKey, "***", StringComparison.Ordinal);
                    throw new InvalidOperationException($"Failed to fetch {source} from NASA FIRMS: {sanitized}");
                }

                var parsed = ParseAndNormalize(csv, source);
                spots.AddRange(parsed);
                Console.WriteLine($"[FIRMS live] {source}: {parsed.Count:N0} detections");

                var gzPath = Path.Combine(cacheDir, $"{source}_world_{days}d.csv.gz");
                await using (var fs = File.Create(gzPath))
                await using (var gz = new GZipStream(fs, CompressionLevel.Optimal))
                await using (var sw = new StreamWriter(gz, new UTF8Encoding(false)))
                {
                    await sw.WriteAsync(csv.AsMemory(), cancellationToken).ConfigureAwait(false);
                }
            }

            await File.WriteAllTextAsync(metaPath,
                JsonSerializer.Serialize(new CachedMeta(fetchedAtUtc)), cancellationToken).ConfigureAwait(false);
        }

        // Assign deterministic chronological order so episode clustering is 100% reproducible.
        var ordered = spots
            .OrderBy(s => s.AcquiredAtUtc)
            .ThenBy(s => s.Latitude)
            .ThenBy(s => s.Longitude)
            .ThenBy(s => s.Satellite, StringComparer.Ordinal)
            .ToArray();

        var windows = ordered
            .GroupBy(s => s.Instrument, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(
                g => g.Key.ToLowerInvariant(),
                g => (
                    MinUtc: g.Min(x => x.AcquiredAtUtc),
                    MaxUtc: g.Max(x => x.AcquiredAtUtc),
                    Count: g.Count()),
                StringComparer.OrdinalIgnoreCase);

        return new FirmsDatasetBundle(ordered, fetchedAtUtc, windows);
    }

    private static List<FirmsHotspot> ParseAndNormalize(string csv, string sourceDataset)
    {
        var raw = FirmsCsvParser.ParseHotspots(csv, sourceDataset);
        var normalized = new List<FirmsHotspot>(raw.Count);
        var expectedInst = FirmsSensorCatalog.Resolve(sourceDataset).Instrument;
        foreach (var spot in raw)
        {
            var sat = FirmsSensorCatalog.NormalizeSatelliteLabel(spot.Satellite, sourceDataset);
            if (sat is not ("Terra" or "Aqua" or "NOAA-20" or "NOAA-21"))
                continue;
            if (!double.IsFinite(spot.FrpMw) || spot.FrpMw < 0)
                continue;
            normalized.Add(spot with
            {
                Satellite = sat,
                Instrument = expectedInst,
                DayNight = string.IsNullOrEmpty(spot.DayNight) ? "D" : spot.DayNight.ToUpperInvariant(),
            });
        }
        return normalized;
    }

    private static string ResolveMapKey()
    {
        var key = Environment.GetEnvironmentVariable("FIRMS_MAP_KEY");
        if (string.IsNullOrWhiteSpace(key) && OperatingSystem.IsWindows())
            key = Environment.GetEnvironmentVariable("FIRMS_MAP_KEY", EnvironmentVariableTarget.User);
        if (string.IsNullOrWhiteSpace(key))
            throw new InvalidOperationException("FIRMS_MAP_KEY is not set in process or User environment variables.");
        return key.Trim();
    }
}
