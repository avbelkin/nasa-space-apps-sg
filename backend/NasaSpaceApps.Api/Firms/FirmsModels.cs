namespace NasaSpaceApps.Api.Firms;

public static class FirmsDefaults
{
    public const string Attribution =
        "Active fire & thermal anomalies via NASA FIRMS (MODIS Collection 6.1 & VIIRS 375 m). Independent project; not affiliated with or endorsed by NASA.";
}

public sealed record FirmsDatasetAvailability(
    string DataId,
    string MinDate,
    string MaxDate);

public sealed record FirmsStatusResponse(
    bool Configured,
    bool KeyFormatValid,
    string ConfigSource,
    bool Reachable,
    int? TransactionLimit,
    int? CurrentTransactions,
    string? TransactionInterval,
    IReadOnlyList<FirmsDatasetAvailability> Datasets,
    string Attribution,
    DateTimeOffset CheckedAtUtc,
    string? Message);

public sealed record FirmsHotspot(
    double Latitude,
    double Longitude,
    double BrightnessKelvin,
    double? SecondaryBrightnessKelvin,
    double? ScanKm,
    double? TrackKm,
    DateTimeOffset AcquiredAtUtc,
    string Satellite,
    string Instrument,
    string SourceDataset,
    string ConfidenceRaw,
    int ConfidenceScore,
    string Version,
    double FrpMw,
    string DayNight);

public sealed record FirmsHotspotsResponse(
    string Area,
    int DayRange,
    string SensorFilter,
    IReadOnlyList<string> SourcesQueried,
    int Count,
    DateTimeOffset FetchedAtUtc,
    string Attribution,
    IReadOnlyList<FirmsHotspot> Hotspots);
