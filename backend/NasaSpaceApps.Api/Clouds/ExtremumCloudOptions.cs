namespace NasaSpaceApps.Api.Clouds;

/// <summary>
/// Configuration options for upstream satellite cloud tile requests to layers.extremum.org.
/// </summary>
public sealed record ExtremumCloudOptions
{
    public const string HttpClientName = "ExtremumLayers";
    public const string DefaultBaseUrl = "https://layers.extremum.org/";
    public const string DefaultReferer = "https://avbelkin.github.io/nasa-space-apps-sg";
    public const string DefaultUserAgent = "NASA-space-apps-sg";

    public string BaseUrl { get; init; } = DefaultBaseUrl;
    public string Referer { get; init; } = DefaultReferer;
    public string UserAgent { get; init; } = DefaultUserAgent;
    public TimeSpan TileCacheDuration { get; init; } = TimeSpan.FromMinutes(3);
    public TimeSpan EmptyTileCacheDuration { get; init; } = TimeSpan.FromMinutes(1);
    public TimeSpan UpstreamTimeout { get; init; } = TimeSpan.FromSeconds(15);

    public static ExtremumCloudOptions FromConfiguration(IConfiguration configuration)
    {
        var section = configuration.GetSection("ExtremumClouds");
        var baseUrl = section["BaseUrl"];
        var referer = section["Referer"];
        var userAgent = section["UserAgent"];

        return new ExtremumCloudOptions
        {
            BaseUrl = string.IsNullOrWhiteSpace(baseUrl) ? DefaultBaseUrl : baseUrl.Trim(),
            Referer = string.IsNullOrWhiteSpace(referer) ? DefaultReferer : referer.Trim(),
            UserAgent = string.IsNullOrWhiteSpace(userAgent) ? DefaultUserAgent : userAgent.Trim(),
        };
    }
}
