using System.Globalization;

namespace NasaSpaceApps.Api.Satellites;

public sealed record SatelliteTle(
    int NoradId,
    string Name,
    DateTime EpochUtc,
    double InclinationDegrees,
    double RightAscensionAscendingNodeDegrees,
    double Eccentricity,
    double ArgumentOfPerigeeDegrees,
    double MeanAnomalyDegrees,
    double MeanMotionRevPerDay,
    double BStarDrag,
    string Line1 = "",
    string Line2 = "");

public static class SatelliteTleParser
{
    public static IReadOnlyDictionary<int, SatelliteTle> ParseCatalog(string? rawCatalog)
    {
        var result = new Dictionary<int, SatelliteTle>();
        if (string.IsNullOrWhiteSpace(rawCatalog))
        {
            return result;
        }

        var lines = rawCatalog
            .Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        string? pendingName = null;
        string? line1 = null;

        foreach (var line in lines)
        {
            if (line.StartsWith("1 ", StringComparison.Ordinal) && line.Length >= 68)
            {
                line1 = line;
                continue;
            }

            if (line.StartsWith("2 ", StringComparison.Ordinal) && line.Length >= 68 && line1 != null)
            {
                var parsed = ParseSingle(pendingName ?? string.Empty, line1, line);
                if (parsed != null)
                {
                    result[parsed.NoradId] = parsed;
                }

                pendingName = null;
                line1 = null;
                continue;
            }

            pendingName = line;
            line1 = null;
        }

        return result;
    }

    public static SatelliteTle? ParseSingle(string name, string line1, string line2)
    {
        if (string.IsNullOrWhiteSpace(line1) || string.IsNullOrWhiteSpace(line2))
        {
            return null;
        }

        line1 = line1.Trim();
        line2 = line2.Trim();

        if (line1.Length < 68 || line2.Length < 68)
        {
            return null;
        }

        if (!line1.StartsWith("1 ", StringComparison.Ordinal) || !line2.StartsWith("2 ", StringComparison.Ordinal))
        {
            return null;
        }

        if (!int.TryParse(line1.AsSpan(2, 5).Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var norad1))
        {
            return null;
        }

        if (!int.TryParse(line2.AsSpan(2, 5).Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var norad2) || norad1 != norad2)
        {
            return null;
        }

        if (!int.TryParse(line1.AsSpan(18, 2).Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var twoDigitYear))
        {
            return null;
        }

        if (!double.TryParse(line1.AsSpan(20, 12).Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out var dayOfYear))
        {
            return null;
        }

        var year = twoDigitYear < 57 ? 2000 + twoDigitYear : 1900 + twoDigitYear;
        var epochUtc = new DateTime(year, 1, 1, 0, 0, 0, DateTimeKind.Utc).AddDays(dayOfYear - 1.0);
        var bstar = ParseTleExponentialField(line1.AsSpan(53, 8));

        if (!double.TryParse(line2.AsSpan(8, 8).Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out var inclination))
        {
            return null;
        }

        if (!double.TryParse(line2.AsSpan(17, 8).Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out var raan))
        {
            return null;
        }

        if (!double.TryParse(string.Concat("0.", line2.AsSpan(26, 7).Trim()), NumberStyles.Float, CultureInfo.InvariantCulture, out var eccentricity))
        {
            return null;
        }

        if (!double.TryParse(line2.AsSpan(34, 8).Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out var argPerigee))
        {
            return null;
        }

        if (!double.TryParse(line2.AsSpan(43, 8).Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out var meanAnomaly))
        {
            return null;
        }

        if (!double.TryParse(line2.AsSpan(52, 11).Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out var meanMotion) || meanMotion <= 0.0)
        {
            return null;
        }

        var cleanName = string.IsNullOrWhiteSpace(name)
            ? (SatelliteCatalog.GetByNoradId(norad1)?.Name ?? $"SAT-{norad1}")
            : name.Trim();

        return new SatelliteTle(
            norad1,
            cleanName,
            epochUtc,
            inclination,
            raan,
            eccentricity,
            argPerigee,
            meanAnomaly,
            meanMotion,
            bstar,
            line1.Trim(),
            line2.Trim());
    }

    private static double ParseTleExponentialField(ReadOnlySpan<char> span)
    {
        var trimmed = span.Trim();
        if (trimmed.IsEmpty)
        {
            return 0.0;
        }

        var sign = 1.0;
        if (trimmed[0] == '-')
        {
            sign = -1.0;
            trimmed = trimmed[1..];
        }
        else if (trimmed[0] == '+')
        {
            trimmed = trimmed[1..];
        }

        var expIndex = trimmed.LastIndexOfAny('-', '+');
        if (expIndex <= 0)
        {
            return 0.0;
        }

        var mantissaPart = trimmed[..expIndex];
        var expPart = trimmed[expIndex..];

        if (!double.TryParse(string.Concat("0.", mantissaPart), NumberStyles.Float, CultureInfo.InvariantCulture, out var mantissa))
        {
            return 0.0;
        }

        if (!int.TryParse(expPart, NumberStyles.Integer, CultureInfo.InvariantCulture, out var exponent))
        {
            return 0.0;
        }

        return sign * mantissa * Math.Pow(10.0, exponent);
    }
}
