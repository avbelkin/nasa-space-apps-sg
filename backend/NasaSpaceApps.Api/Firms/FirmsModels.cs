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

public sealed record FirmsSensorMetadata(
    int SourceCode,
    string Dataset,
    string Label,
    string Instrument,
    int RadiusMeters);

public static class FirmsSensorCatalog
{
    public static readonly FirmsSensorMetadata ModisNrt =
        new(0, "MODIS_NRT", "MODIS 1km", "modis", 1000);

    public static readonly FirmsSensorMetadata ViirsNoaa20Nrt =
        new(1, "VIIRS_NOAA20_NRT", "VIIRS 375m / NOAA-20", "viirs", 375);

    public static readonly FirmsSensorMetadata ViirsNoaa21Nrt =
        new(2, "VIIRS_NOAA21_NRT", "VIIRS 375m / NOAA-21", "viirs", 375);

    public static readonly IReadOnlyList<FirmsSensorMetadata> All =
    [
        ModisNrt,
        ViirsNoaa20Nrt,
        ViirsNoaa21Nrt,
    ];

    public static FirmsSensorMetadata Resolve(string sourceDataset)
    {
        return sourceDataset.Trim().ToUpperInvariant() switch
        {
            "MODIS_NRT" => ModisNrt,
            "VIIRS_NOAA20_NRT" => ViirsNoaa20Nrt,
            "VIIRS_NOAA21_NRT" => ViirsNoaa21Nrt,
            _ when sourceDataset.Contains("MODIS", StringComparison.OrdinalIgnoreCase) => ModisNrt,
            _ when sourceDataset.Contains("21", StringComparison.OrdinalIgnoreCase) => ViirsNoaa21Nrt,
            _ => ViirsNoaa20Nrt,
        };
    }

    public static string NormalizeSatelliteLabel(string raw)
    {
        var trimmed = raw.Trim();
        return trimmed.ToUpperInvariant() switch
        {
            "T" => "Terra",
            "A" => "Aqua",
            "N20" => "NOAA-20",
            "N21" => "NOAA-21",
            "N" => "Suomi NPP",
            _ => trimmed,
        };
    }
}

public sealed record FirmsSourceSummaryDto(
    int Code,
    string Dataset,
    string Label,
    string Instrument,
    int RadiusMeters,
    int Count);

public sealed record FirmsLiveSpotsResponse(
    DateTimeOffset GeneratedAtUtc,
    DateTimeOffset FetchedAtUtc,
    DateTimeOffset? LatestAcquiredAtUtc,
    bool Stale,
    int WindowHours,
    string SensorFilter,
    IReadOnlyList<FirmsSourceSummaryDto> Sources,
    int Count,
    int ModisCount,
    int ViirsCount,
    double MaxFrpMw,
    string Attribution,
    IReadOnlyList<string> Columns,
    IReadOnlyList<object[]> Spots);

public sealed record FirmsGeoJsonPointGeometry(
    string Type,
    double[] Coordinates);

public sealed record FirmsGeoJsonSpotProperties(
    long Timestamp,
    double Brightness,
    double Frp,
    int Radius,
    string Source,
    string Instrument,
    string Satellite,
    int Confidence,
    string Daynight);

public sealed record FirmsGeoJsonFeature(
    string Type,
    FirmsGeoJsonPointGeometry Geometry,
    FirmsGeoJsonSpotProperties Properties);

public sealed record FirmsGeoJsonFeatureCollection(
    string Type,
    DateTimeOffset GeneratedAtUtc,
    DateTimeOffset FetchedAtUtc,
    bool Stale,
    int WindowHours,
    string SensorFilter,
    int Count,
    string Attribution,
    IReadOnlyList<FirmsGeoJsonFeature> Features);
