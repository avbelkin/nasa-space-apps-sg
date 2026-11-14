namespace NasaSpaceApps.Api.NasaOpenApi;

public static class NasaOpenApiDefaults
{
    public const string Attribution =
        "Earth observation & natural-event metadata via NASA Open APIs (api.nasa.gov DSCOVR EPIC & NASA EONET). Independent project; not affiliated with or endorsed by NASA.";
}

public sealed record NasaOpenApiStatusResponse(
    bool Configured,
    bool KeyFormatValid,
    string ConfigSource,
    bool Reachable,
    int? RateLimit,
    int? RateLimitRemaining,
    int EpicFrameCount,
    DateTimeOffset? LatestEpicObservationUtc,
    string Attribution,
    DateTimeOffset CheckedAtUtc,
    string? Message);

public sealed record NasaEpicFrameDto(
    string Identifier,
    string Image,
    DateTimeOffset ObservationUtc,
    double CentroidLat,
    double CentroidLon,
    string Caption,
    string ArchivePngUrl);

public sealed record NasaEpicNaturalResponse(
    int Count,
    int? RateLimit,
    int? RateLimitRemaining,
    DateTimeOffset FetchedAtUtc,
    string Attribution,
    IReadOnlyList<NasaEpicFrameDto> Frames);

public sealed record NasaEonetWildfireEventDto(
    string Id,
    string Title,
    DateTimeOffset LatestGeometryUtc,
    double Latitude,
    double Longitude,
    double? MagnitudeValue,
    string? MagnitudeUnit,
    string? PrimarySourceId,
    string? PrimarySourceUrl,
    string EventApiUrl);

public sealed record NasaEonetWildfiresResponse(
    string StatusFilter,
    int Days,
    int Count,
    DateTimeOffset FetchedAtUtc,
    string Attribution,
    IReadOnlyList<NasaEonetWildfireEventDto> Events);
