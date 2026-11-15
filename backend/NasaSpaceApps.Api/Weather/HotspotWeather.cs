namespace NasaSpaceApps.Api.Weather;

public sealed record HotspotWeatherResponse(IReadOnlyList<HotspotWeather?> Spots);

public sealed record HotspotWeather(DateTimeOffset AcquiredAtUtc, IReadOnlyList<HotspotWeatherSource> Sources);

public sealed record HotspotWeatherSource(
    string Provider,
    string Model,
    string DataKind,
    double? GridLatitude,
    double? GridLongitude,
    double? GridSpacingDegrees,
    DateTimeOffset? RunUtc,
    string SamplingMethod,
    string Status,
    bool? MayUseSatelliteFireEmissions,
    IReadOnlyDictionary<string, HotspotWeatherValue> Values)
{
    [System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)]
    public DateTimeOffset? PublishedAtUtc { get; init; }
}

public sealed record HotspotWeatherValue(
    double? Value,
    string Unit,
    DateTimeOffset? ValidFromUtc,
    DateTimeOffset? ValidThroughUtc,
    double? AgeMinutesAtAcquisition,
    string? MissingReason)
{
    [System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)]
    public DateOnly? ValidDateUtc { get; init; }

    [System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)]
    public DateOnly? ValidDateLocal { get; init; }

    [System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)]
    public string? ValidDateTimeZone { get; init; }
}
