using NasaSpaceApps.Harmonization.Export;
using NasaSpaceApps.Harmonization.Modeling;

namespace NasaSpaceApps.Harmonization;

internal static class HarmonizationCli
{
    public static async Task<int> Main(string[] args)
    {
        if (args.Length == 0 || args[0] is "-h" or "--help")
        {
            PrintUsage();
            return 0;
        }

        var command = args[0].ToLowerInvariant();
        var opts = ParseOptions(args.Skip(1).ToArray());
        using var cts = new CancellationTokenSource();
        Console.CancelKeyPress += (_, e) =>
        {
            e.Cancel = true;
            cts.Cancel();
        };

        var days = opts.TryGetValue("days", out var daysStr) && int.TryParse(daysStr, out var d) ? Math.Clamp(d, 1, 10) : 5;
        var repoRoot = FindRepoRoot();
        var defaultDataDir = Path.Combine(repoRoot, "artifacts", "harmonization-dataset");
        var defaultReport = Path.Combine(repoRoot, "submission", "working", "weather-harmonization-study-2026-11-15.json");
        var defaultUiDir = Path.Combine(repoRoot, "ui", "src", "data");

        switch (command)
        {
            case "export":
            {
                var outputDir = opts.GetValueOrDefault("output-dir") ?? opts.GetValueOrDefault("data-dir") ?? defaultDataDir;
                var refreshFirms = opts.ContainsKey("refresh-firms");
                var refreshTles = opts.ContainsKey("refresh-tles");
                await DatasetExporter.RunAsync(outputDir, days, refreshFirms, refreshTles, cts.Token).ConfigureAwait(false);
                return 0;
            }

            case "train":
            {
                var dataDir = opts.GetValueOrDefault("data-dir") ?? opts.GetValueOrDefault("output-dir") ?? defaultDataDir;
                var reportJson = opts.GetValueOrDefault("report-json") ?? defaultReport;
                var uiModelsDir = opts.GetValueOrDefault("update-ui-models");
                await HarmonizationStudyRunner.RunAsync(dataDir, days, reportJson, uiModelsDir, cts.Token).ConfigureAwait(false);
                return 0;
            }

            case "all":
            {
                var outputDir = opts.GetValueOrDefault("output-dir") ?? opts.GetValueOrDefault("data-dir") ?? defaultDataDir;
                var reportJson = opts.GetValueOrDefault("report-json") ?? defaultReport;
                var uiModelsDir = opts.GetValueOrDefault("update-ui-models") ?? defaultUiDir;
                var refreshFirms = opts.ContainsKey("refresh-firms");
                var refreshTles = opts.ContainsKey("refresh-tles");
                await DatasetExporter.RunAsync(outputDir, days, refreshFirms, refreshTles, cts.Token).ConfigureAwait(false);
                await HarmonizationStudyRunner.RunAsync(outputDir, days, reportJson, uiModelsDir, cts.Token).ConfigureAwait(false);
                return 0;
            }

            default:
                Console.Error.WriteLine($"Unknown command '{command}'.");
                PrintUsage();
                return 1;
        }
    }

    private static Dictionary<string, string?> ParseOptions(string[] tokens)
    {
        var dict = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
        for (var i = 0; i < tokens.Length; i++)
        {
            var t = tokens[i];
            if (!t.StartsWith("--", StringComparison.Ordinal)) continue;
            var key = t[2..];
            if (i + 1 < tokens.Length && !tokens[i + 1].StartsWith("--", StringComparison.Ordinal))
                dict[key] = tokens[++i];
            else
                dict[key] = "true";
        }
        return dict;
    }

    private static string FindRepoRoot()
    {
        var dir = new DirectoryInfo(Directory.GetCurrentDirectory());
        while (dir is not null)
        {
            if (Directory.Exists(Path.Combine(dir.FullName, "backend")) &&
                Directory.Exists(Path.Combine(dir.FullName, "ui")))
                return dir.FullName;
            dir = dir.Parent;
        }
        return Directory.GetCurrentDirectory();
    }

    private static void PrintUsage()
    {
        Console.WriteLine("""
            Usage:
              dotnet run --project backend/NasaSpaceApps.Harmonization -c Release -- <command> [options]

            Commands:
              export  Download/cache FIRMS detections, CelesTrak TLEs, Land Cover, GWIS, and NOAA GFS weather,
                      and write gzipped spot + 4-direction pass-pair datasets.
              train   Evaluate 4-direction detection & FRP models (with vs without weather + ablations)
                      and run the leakage-free geometry+weather absence/FRP study.
              all     Run both export and train sequentially.

            Options:
              --output-dir <path>         Dataset directory (default: artifacts/harmonization-dataset)
              --data-dir <path>           Input dataset directory for 'train'
              --days <1..10>              FIRMS day window (default: 5)
              --report-json <path>        Output study benchmark JSON path
              --update-ui-models <path>   Optional ui/src/data directory to update linear model JSONs
              --refresh-firms             Re-download world FIRMS CSVs even if cached
              --refresh-tles              Re-fetch CelesTrak TLEs even if cached
            """);
    }
}
