using System.Text.RegularExpressions;

namespace NasaSpaceApps.Api.NasaOpenApi;

/// <summary>
/// Resolves and holds the api.nasa.gov API key (`NASA_API_KEY`) while keeping the raw key internal
/// and providing redaction helpers so the secret never leaks in responses or logs.
/// </summary>
public sealed partial class NasaOpenApiOptions
{
    internal string ApiKey { get; }

    public bool IsConfigured => !string.IsNullOrWhiteSpace(ApiKey);

    public bool IsKeyFormatValid => IsConfigured && ApiKeyRegex().IsMatch(ApiKey);

    public string ConfigSource { get; }

    private NasaOpenApiOptions(string apiKey, string configSource)
    {
        ApiKey = apiKey;
        ConfigSource = configSource;
    }

    public static NasaOpenApiOptions FromConfiguration(IConfiguration configuration, IHostEnvironment environment)
    {
        var primary = configuration["NASA_API_KEY"]?.Trim();
        if (!string.IsNullOrWhiteSpace(primary))
        {
            return new NasaOpenApiOptions(primary, "NASA_API_KEY");
        }

        var nested = configuration["Nasa:ApiKey"]?.Trim();
        if (!string.IsNullOrWhiteSpace(nested))
        {
            return new NasaOpenApiOptions(nested, "Nasa:ApiKey");
        }

        // Allow an existing local Windows terminal/IDE session to pick up `[Environment]::SetEnvironmentVariable(..., "User")`
        // without requiring a full process tree restart during local Development.
        if (OperatingSystem.IsWindows() && environment.IsDevelopment())
        {
            var userEnv = Environment.GetEnvironmentVariable("NASA_API_KEY", EnvironmentVariableTarget.User)?.Trim();
            if (!string.IsNullOrWhiteSpace(userEnv))
            {
                return new NasaOpenApiOptions(userEnv, "WindowsUserEnv:NASA_API_KEY");
            }
        }

        return new NasaOpenApiOptions(string.Empty, "none");
    }

    internal string Redact(string? message)
    {
        if (string.IsNullOrEmpty(message))
        {
            return string.Empty;
        }

        return string.IsNullOrEmpty(ApiKey)
            ? message
            : message.Replace(ApiKey, "[REDACTED]", StringComparison.OrdinalIgnoreCase);
    }

    [GeneratedRegex("^[A-Za-z0-9]{40}$")]
    private static partial Regex ApiKeyRegex();
}
