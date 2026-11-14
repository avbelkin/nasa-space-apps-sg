namespace NasaSpaceApps.Api.Satellites;

public sealed record SatelliteMetadata(
    string Id,
    int NoradId,
    string Name,
    string Instrument,
    string InstrumentLabel,
    string CrossingNote,
    double NadirSwathKm,
    double? WideSwathKm,
    int TypicalIngestionLagMinutes,
    IReadOnlyList<string> LayerVariantIds,
    string DefaultTleLine1,
    string DefaultTleLine2);

public static class SatelliteCatalog
{
    public static IReadOnlyList<SatelliteMetadata> Default { get; } =
    [
        new(
            Id: "terra",
            NoradId: 25994,
            Name: "Terra",
            Instrument: "modis",
            InstrumentLabel: "MODIS (1 km)",
            CrossingNote: "10:30 LT descending",
            NadirSwathKm: 400.0,
            WideSwathKm: 2330.0,
            TypicalIngestionLagMinutes: 120,
            LayerVariantIds: ["modis", "harmonized", "wF"],
            DefaultTleLine1: "1 25994U 99068A   26317.92845958  .00000323  00000+0  74469-4 0  9991",
            DefaultTleLine2: "2 25994  97.9265   1.3927 0003544 108.9156 353.6658 14.61196780431475"),
        new(
            Id: "aqua",
            NoradId: 27424,
            Name: "Aqua",
            Instrument: "modis",
            InstrumentLabel: "MODIS (1 km)",
            CrossingNote: "13:30 LT ascending",
            NadirSwathKm: 400.0,
            WideSwathKm: 2330.0,
            TypicalIngestionLagMinutes: 120,
            LayerVariantIds: ["modis", "harmonized", "wF"],
            DefaultTleLine1: "1 27424U 02022A   26317.91074306  .00000799  00000+0  16835-3 0  9994",
            DefaultTleLine2: "2 27424  98.4492 290.3525 0001149 107.8217 278.6300 14.62279014305150"),
        new(
            Id: "noaa-20",
            NoradId: 43013,
            Name: "NOAA-20",
            Instrument: "viirs",
            InstrumentLabel: "VIIRS (375 m)",
            CrossingNote: "13:30 LT ascending (JPSS-1)",
            NadirSwathKm: 400.0,
            WideSwathKm: 3040.0,
            TypicalIngestionLagMinutes: 90,
            LayerVariantIds: ["viirs", "harmonized", "wF"],
            DefaultTleLine1: "1 43013U 17073A   26317.92457274  .00000075  00000+0  56363-4 0  9996",
            DefaultTleLine2: "2 43013  98.7926 256.1370 0001164 130.8784 229.2493 14.19536900465713"),
        new(
            Id: "noaa-21",
            NoradId: 54234,
            Name: "NOAA-21",
            Instrument: "viirs",
            InstrumentLabel: "VIIRS (375 m)",
            CrossingNote: "13:30 LT ascending (JPSS-2)",
            NadirSwathKm: 400.0,
            WideSwathKm: 3040.0,
            TypicalIngestionLagMinutes: 90,
            LayerVariantIds: ["viirs", "harmonized", "wF"],
            DefaultTleLine1: "1 54234U 22150A   26317.88453332  .00000065  00000+0  51446-4 0  9997",
            DefaultTleLine2: "2 54234  98.7206 254.2287 0002651 111.2994 248.8466 14.19558773207785")
    ];

    private static readonly Dictionary<int, SatelliteMetadata> ByNoradId =
        Default.ToDictionary(s => s.NoradId);

    public static SatelliteMetadata? GetByNoradId(int noradId) =>
        ByNoradId.GetValueOrDefault(noradId);
}
