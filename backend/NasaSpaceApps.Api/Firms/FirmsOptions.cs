using System.Text.RegularExpressions;

namespace NasaSpaceApps.Api.Firms;

/// <summary>
/// Resolves and holds the NASA FIRMS MAP_KEY configuration while keeping the raw key internal
/// and providing redaction helpers so the secret never leaks in responses or logs.
/// </summary>
public sealed partial class FirmsOptions
{
    internal string MapKey { get; }

    public bool IsConfigured => !string.IsNullOrWhiteSpace(MapKey);

    public bool IsKeyFormatValid => IsConfigured && MapKeyHexRegex().IsMatch(MapKey);

    public string ConfigSource { get; }

    private FirmsOptions(string mapKey, string configSource)
    {
        MapKey = mapKey;
        ConfigSource = configSource;
    }

    public static FirmsOptions FromConfiguration(IConfiguration configuration, IHostEnvironment environment)
    {
        var primary = configuration["FIRMS_MAP_KEY"]?.Trim();
        if (!string.IsNullOrWhiteSpace(primary))
        {
            return new FirmsOptions(primary, "FIRMS_MAP_KEY");
        }

        var nested = configuration["Firms:MapKey"]?.Trim();
        if (!string.IsNullOrWhiteSpace(nested))
        {
            return new FirmsOptions(nested, "Firms:MapKey");
        }

        // Allow an existing local Windows terminal/IDE session to pick up `[Environment]::SetEnvironmentVariable(..., "User")`
        // without requiring a full process tree restart during local Development.
        if (OperatingSystem.IsWindows() && environment.IsDevelopment())
        {
            var userEnv = Environment.GetEnvironmentVariable("FIRMS_MAP_KEY", EnvironmentVariableTarget.User)?.Trim();
            if (!string.IsNullOrWhiteSpace(userEnv))
            {
                return new FirmsOptions(userEnv, "WindowsUserEnv:FIRMS_MAP_KEY");
            }
        }

        return new FirmsOptions(string.Empty, "none");
    }

    internal string Redact(string? message)
    {
        if (string.IsNullOrEmpty(message))
        {
            return string.Empty;
        }

        return string.IsNullOrEmpty(MapKey)
            ? message
            : message.Replace(MapKey, "[REDACTED]", StringComparison.OrdinalIgnoreCase);
    }

    [GeneratedRegex("^[0-9a-fA-F]{32}$")]
    private static partial Regex MapKeyHexRegex();
}
