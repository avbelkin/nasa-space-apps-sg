namespace NasaSpaceApps.Api.Satellites;

public sealed record OrbitTrackPointDto(
    long TimestampUnixMs,
    double Lat,
    double Lng,
    double AltitudeKm,
    double HeadingDeg,
    bool IsAscending);

public sealed record SatellitePositionDto(
    long TimestampUnixMs,
    double Lat,
    double Lng,
    double AltitudeKm,
    double GroundSpeedKmS,
    double HeadingDeg,
    bool IsAscending);

public sealed record SatelliteOrbitDto(
    string Id,
    string Name,
    int NoradId,
    string Instrument,
    string InstrumentLabel,
    string CrossingNote,
    double NadirSwathKm,
    double WideSwathKm,
    int TypicalIngestionLagMinutes,
    IReadOnlyList<string> LayerVariantIds,
    string TleSource,
    DateTimeOffset TleEpochUtc,
    string TleLine1,
    string TleLine2,
    double InclinationDeg,
    double PeriodMinutes,
    SatellitePositionDto CurrentPosition,
    IReadOnlyList<OrbitTrackPointDto> Track);

public sealed record SatelliteSwathDto(
    string Id,
    string SatelliteId,
    string SwathRole,
    double SwathWidthKm,
    IReadOnlyList<double[]> Coordinates);

public sealed record SatelliteOrbitsResponse(
    DateTimeOffset GeneratedAtUtc,
    long WindowStartUnixMs,
    long WindowEndUnixMs,
    int StepSeconds,
    IReadOnlyList<SatelliteOrbitDto> Satellites,
    IReadOnlyList<SatelliteSwathDto> Swaths,
    IReadOnlyList<SatelliteHudFreshnessEntry> SatelliteHud);

public sealed class SatelliteOrbitService(CelesTrakTleDownloader tleDownloader)
{
    private const double DefaultNadirAlongTrackKm = 180.0;
    private const double DefaultWideAlongTrackKm = 280.0;

    public async Task<SatelliteOrbitsResponse> GetOrbitsAsync(
        int pastMinutes = 45,
        int futureMinutes = 90,
        int stepSeconds = 30,
        double targetLat = 0.0,
        double targetLng = 0.0,
        CancellationToken cancellationToken = default)
    {
        var clampedPastMinutes = Math.Clamp(pastMinutes, 5, 180);
        var clampedFutureMinutes = Math.Clamp(futureMinutes, 15, 360);
        var clampedStepSeconds = Math.Clamp(stepSeconds, 10, 120);

        var fleetTles = await tleDownloader.GetFleetTlesAsync(cancellationToken).ConfigureAwait(false);
        var activeTles = fleetTles.ToDictionary(kvp => kvp.Key, kvp => kvp.Value.Tle);

        var nowUnixSeconds = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var generatedAtUtc = DateTimeOffset.FromUnixTimeSeconds(nowUnixSeconds);
        var nowMs = generatedAtUtc.ToUnixTimeMilliseconds();
        var stepMs = clampedStepSeconds * 1000L;

        var windowStartMs = ((nowMs - clampedPastMinutes * 60_000L) / stepMs) * stepMs;
        var windowEndMs = ((nowMs + clampedFutureMinutes * 60_000L) / stepMs) * stepMs;
        var windowStartUtc = DateTimeOffset.FromUnixTimeMilliseconds(windowStartMs).UtcDateTime;
        var windowEndUtc = DateTimeOffset.FromUnixTimeMilliseconds(windowEndMs).UtcDateTime;
        var step = TimeSpan.FromSeconds(clampedStepSeconds);

        var satellites = new List<SatelliteOrbitDto>(SatelliteCatalog.Default.Count);
        var swaths = new List<SatelliteSwathDto>(SatelliteCatalog.Default.Count * 2);
        foreach (var meta in SatelliteCatalog.Default)
        {
            if (!fleetTles.TryGetValue(meta.NoradId, out var resolved))
            {
                continue;
            }

            var tle = resolved.Tle;
            var currentState = SatelliteOrbitPropagator.Propagate(tle, generatedAtUtc.UtcDateTime);
            var rawTrack = SatelliteOrbitPropagator.ComputeGroundTrack(tle, windowStartUtc, windowEndUtc, step);

            var trackDtos = new List<OrbitTrackPointDto>(rawTrack.Count);
            foreach (var state in rawTrack)
            {
                trackDtos.Add(new OrbitTrackPointDto(
                    TimestampUnixMs: new DateTimeOffset(state.TimestampUtc).ToUnixTimeMilliseconds(),
                    Lat: Math.Round(state.Latitude, 4),
                    Lng: Math.Round(state.Longitude, 4),
                    AltitudeKm: Math.Round(state.AltitudeKm, 1),
                    HeadingDeg: Math.Round(state.HeadingDegrees, 1),
                    IsAscending: state.IsAscending));
            }

            var currentPosition = new SatellitePositionDto(
                TimestampUnixMs: nowMs,
                Lat: Math.Round(currentState.Latitude, 4),
                Lng: Math.Round(currentState.Longitude, 4),
                AltitudeKm: Math.Round(currentState.AltitudeKm, 1),
                GroundSpeedKmS: Math.Round(currentState.GroundSpeedKmS, 2),
                HeadingDeg: Math.Round(currentState.HeadingDegrees, 1),
                IsAscending: currentState.IsAscending);

            satellites.Add(new SatelliteOrbitDto(
                Id: meta.Id,
                Name: meta.Name,
                NoradId: meta.NoradId,
                Instrument: meta.Instrument,
                InstrumentLabel: meta.InstrumentLabel,
                CrossingNote: meta.CrossingNote,
                NadirSwathKm: meta.NadirSwathKm,
                WideSwathKm: meta.WideSwathKm,
                TypicalIngestionLagMinutes: meta.TypicalIngestionLagMinutes,
                LayerVariantIds: meta.LayerVariantIds,
                TleSource: resolved.Source,
                TleEpochUtc: new DateTimeOffset(DateTime.SpecifyKind(tle.EpochUtc, DateTimeKind.Utc)),
                TleLine1: string.IsNullOrWhiteSpace(tle.Line1) ? meta.DefaultTleLine1 : tle.Line1,
                TleLine2: string.IsNullOrWhiteSpace(tle.Line2) ? meta.DefaultTleLine2 : tle.Line2,
                InclinationDeg: Math.Round(tle.InclinationDegrees, 2),
                PeriodMinutes: Math.Round(1440.0 / tle.MeanMotionRevPerDay, 2),
                CurrentPosition: currentPosition,
                Track: trackDtos));

            if (meta.WideSwathKm > meta.NadirSwathKm)
            {
                var wideRing = SatelliteSwathBuilder.BuildInstantaneousSwathPolygon(
                    currentState,
                    currentState,
                    meta.WideSwathKm,
                    DefaultWideAlongTrackKm);
                swaths.Add(new SatelliteSwathDto(
                    Id: $"{meta.Id}-swath-wide",
                    SatelliteId: meta.Id,
                    SwathRole: "wide",
                    SwathWidthKm: meta.WideSwathKm,
                    Coordinates: wideRing.Select(v => new[] { v.Longitude, v.Latitude }).ToList()));
            }

            var nadirRing = SatelliteSwathBuilder.BuildInstantaneousSwathPolygon(
                currentState,
                currentState,
                meta.NadirSwathKm,
                DefaultNadirAlongTrackKm);
            swaths.Add(new SatelliteSwathDto(
                Id: $"{meta.Id}-swath-nadir",
                SatelliteId: meta.Id,
                SwathRole: "nadir",
                SwathWidthKm: meta.NadirSwathKm,
                Coordinates: nadirRing.Select(v => new[] { v.Longitude, v.Latitude }).ToList()));
        }

        var hudFreshness = SatelliteOverpassEvaluator.EvaluateFleetFreshness(
            SatelliteCatalog.Default,
            activeTles,
            targetLat,
            targetLng,
            generatedAtUtc.UtcDateTime);

        return new SatelliteOrbitsResponse(
            GeneratedAtUtc: generatedAtUtc,
            WindowStartUnixMs: windowStartMs,
            WindowEndUnixMs: windowEndMs,
            StepSeconds: clampedStepSeconds,
            Satellites: satellites,
            Swaths: swaths,
            SatelliteHud: hudFreshness);
    }
}
