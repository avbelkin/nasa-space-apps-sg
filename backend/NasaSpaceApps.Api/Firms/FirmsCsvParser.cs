using System.Globalization;

namespace NasaSpaceApps.Api.Firms;

/// <summary>
/// Parses CSV payloads returned by NASA FIRMS data_availability and area hotspot endpoints
/// across both MODIS and VIIRS schemas.
/// </summary>
public static class FirmsCsvParser
{
    public static IReadOnlyList<FirmsDatasetAvailability> ParseDatasetAvailability(string csv)
    {
        var lines = SplitNonEmptyLines(csv);
        if (lines.Count == 0)
        {
            throw new InvalidOperationException("NASA FIRMS returned an empty data availability response.");
        }

        var header = lines[0];
        if (!header.StartsWith("data_id,", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException($"NASA FIRMS rejected the availability request: {header}");
        }

        var columns = MapColumns(header);
        var dataIdIdx = GetRequiredColumn(columns, "data_id");
        var minDateIdx = GetRequiredColumn(columns, "min_date");
        var maxDateIdx = GetRequiredColumn(columns, "max_date");

        var datasets = new List<FirmsDatasetAvailability>(lines.Count - 1);
        for (var i = 1; i < lines.Count; i++)
        {
            var cells = lines[i].Split(',');
            if (cells.Length <= Math.Max(dataIdIdx, Math.Max(minDateIdx, maxDateIdx)))
            {
                continue;
            }

            datasets.Add(new FirmsDatasetAvailability(
                cells[dataIdIdx].Trim(),
                cells[minDateIdx].Trim(),
                cells[maxDateIdx].Trim()));
        }

        return datasets;
    }

    public static IReadOnlyList<FirmsHotspot> ParseHotspots(string csv, string sourceDataset)
    {
        var lines = SplitNonEmptyLines(csv);
        if (lines.Count == 0)
        {
            throw new InvalidOperationException("NASA FIRMS returned an empty hotspot response.");
        }

        var header = lines[0];
        if (!header.StartsWith("latitude,", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException($"NASA FIRMS rejected the hotspot request: {header}");
        }

        if (lines.Count == 1)
        {
            return [];
        }

        var columns = MapColumns(header);
        var latIdx = GetRequiredColumn(columns, "latitude");
        var lonIdx = GetRequiredColumn(columns, "longitude");
        var brightnessIdx = GetFirstColumn(columns, "brightness", "bright_ti4");
        var secondaryIdx = TryGetFirstColumn(columns, "bright_t31", "bright_ti5");
        var scanIdx = TryGetColumn(columns, "scan");
        var trackIdx = TryGetColumn(columns, "track");
        var dateIdx = GetRequiredColumn(columns, "acq_date");
        var timeIdx = GetRequiredColumn(columns, "acq_time");
        var satelliteIdx = GetRequiredColumn(columns, "satellite");
        var instrumentIdx = GetRequiredColumn(columns, "instrument");
        var confidenceIdx = GetRequiredColumn(columns, "confidence");
        var versionIdx = TryGetColumn(columns, "version");
        var frpIdx = GetRequiredColumn(columns, "frp");
        var dayNightIdx = TryGetColumn(columns, "daynight");

        var results = new List<FirmsHotspot>(lines.Count - 1);
        for (var i = 1; i < lines.Count; i++)
        {
            var cells = lines[i].Split(',');
            if (!TryParseDouble(cells, latIdx, out var lat) ||
                !TryParseDouble(cells, lonIdx, out var lon) ||
                !TryParseDouble(cells, brightnessIdx, out var brightness) ||
                !TryParseDouble(cells, frpIdx, out var frp))
            {
                continue;
            }

            if (!TryParseAcqTimestamp(GetCell(cells, dateIdx), GetCell(cells, timeIdx), out var acquiredAtUtc))
            {
                continue;
            }

            var confidenceRaw = GetCell(cells, confidenceIdx);
            results.Add(new FirmsHotspot(
                Latitude: lat,
                Longitude: lon,
                BrightnessKelvin: brightness,
                SecondaryBrightnessKelvin: secondaryIdx.HasValue && TryParseDouble(cells, secondaryIdx.Value, out var sec) ? sec : null,
                ScanKm: scanIdx.HasValue && TryParseDouble(cells, scanIdx.Value, out var scan) ? scan : null,
                TrackKm: trackIdx.HasValue && TryParseDouble(cells, trackIdx.Value, out var track) ? track : null,
                AcquiredAtUtc: acquiredAtUtc,
                Satellite: GetCell(cells, satelliteIdx),
                Instrument: GetCell(cells, instrumentIdx),
                SourceDataset: sourceDataset,
                ConfidenceRaw: confidenceRaw,
                ConfidenceScore: NormalizeConfidence(confidenceRaw),
                Version: versionIdx.HasValue ? GetCell(cells, versionIdx.Value) : string.Empty,
                FrpMw: frp,
                DayNight: dayNightIdx.HasValue ? GetCell(cells, dayNightIdx.Value) : string.Empty));
        }

        return results;
    }

    private static List<string> SplitNonEmptyLines(string csv)
    {
        var list = new List<string>();
        foreach (var raw in csv.Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries))
        {
            var trimmed = raw.Trim();
            if (!string.IsNullOrEmpty(trimmed))
            {
                list.Add(trimmed);
            }
        }

        return list;
    }

    private static Dictionary<string, int> MapColumns(string headerLine)
    {
        var headers = headerLine.Split(',');
        var map = new Dictionary<string, int>(headers.Length, StringComparer.OrdinalIgnoreCase);
        for (var i = 0; i < headers.Length; i++)
        {
            map[headers[i].Trim()] = i;
        }

        return map;
    }

    private static int GetRequiredColumn(IReadOnlyDictionary<string, int> columns, string name)
    {
        if (columns.TryGetValue(name, out var idx))
        {
            return idx;
        }

        throw new InvalidOperationException($"NASA FIRMS CSV response missing expected column '{name}'.");
    }

    private static int GetFirstColumn(IReadOnlyDictionary<string, int> columns, params string[] candidates)
    {
        var idx = TryGetFirstColumn(columns, candidates);
        if (idx.HasValue)
        {
            return idx.Value;
        }

        throw new InvalidOperationException(
            $"NASA FIRMS CSV response missing expected column ({string.Join(" or ", candidates)}).");
    }

    private static int? TryGetFirstColumn(IReadOnlyDictionary<string, int> columns, params string[] candidates)
    {
        foreach (var name in candidates)
        {
            if (columns.TryGetValue(name, out var idx))
            {
                return idx;
            }
        }

        return null;
    }

    private static int? TryGetColumn(IReadOnlyDictionary<string, int> columns, string name)
    {
        return columns.TryGetValue(name, out var idx) ? idx : null;
    }

    private static string GetCell(string[] cells, int index)
    {
        return index >= 0 && index < cells.Length ? cells[index].Trim() : string.Empty;
    }

    private static bool TryParseDouble(string[] cells, int index, out double value)
    {
        if (index < 0 || index >= cells.Length)
        {
            value = 0;
            return false;
        }

        return double.TryParse(cells[index].Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out value);
    }

    private static bool TryParseAcqTimestamp(string acqDate, string acqTime, out DateTimeOffset timestampUtc)
    {
        var digits = new string(acqTime.Where(char.IsDigit).ToArray()).PadLeft(4, '0');
        if (digits.Length > 4)
        {
            digits = digits[..4];
        }

        return DateTimeOffset.TryParseExact(
            $"{acqDate.Trim()} {digits}",
            "yyyy-MM-dd HHmm",
            CultureInfo.InvariantCulture,
            DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
            out timestampUtc);
    }

    public static int NormalizeConfidence(string raw)
    {
        var normalized = raw.Trim().ToLowerInvariant();
        return normalized switch
        {
            "l" or "low" => 25,
            "n" or "nominal" => 65,
            "h" or "high" => 95,
            _ when int.TryParse(normalized, NumberStyles.Integer, CultureInfo.InvariantCulture, out var numeric)
                => Math.Clamp(numeric, 0, 100),
            _ => 50,
        };
    }
}
