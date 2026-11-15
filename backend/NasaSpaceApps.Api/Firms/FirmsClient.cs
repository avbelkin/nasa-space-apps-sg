using System.Collections.Concurrent;
using System.Globalization;
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;
using NasaSpaceApps.Api.LandCover;
using NasaSpaceApps.Api.Weather;

namespace NasaSpaceApps.Api.Firms;

/// <summary>
/// Cached NASA FIRMS HTTP client covering MAP_KEY quota status, dataset availability,
/// and MODIS/VIIRS active-fire area queries with automatic secret redaction.
/// </summary>
internal sealed class FirmsClient(
    IHttpClientFactory httpClientFactory,
    IMemoryCache cache,
    FirmsOptions options,
    ILogger<FirmsClient> logger,
    HotspotGeometryWorker geometryWorker,
    ILandCoverEnricher landCover)
{
    public const string DefaultBbox = "95,-11,141,20";
    public const int DefaultLiveWindowHours = 24;

    private const string KeyStatusCacheKey = "firms:mapkey-status";
    private const string AvailabilityCacheKey = "firms:data-availability";
    private static readonly TimeSpan KeyStatusCacheDuration = TimeSpan.FromMinutes(2);
    private static readonly TimeSpan AvailabilityCacheDuration = TimeSpan.FromHours(6);
    private static readonly TimeSpan HotspotsCacheDuration = TimeSpan.FromMinutes(15);
    private static readonly TimeSpan AreaSnapshotCacheDuration = TimeSpan.FromMinutes(20);
    private static readonly TimeSpan AreaFailureBackoffDuration = TimeSpan.FromMinutes(2);
    private static readonly TimeSpan LiveResponseCacheDuration = TimeSpan.FromMinutes(5);
    private static readonly string[] LiveSpotColumns =
    [
        "lng",
        "lat",
        "timestampMs",
        "frp",
        "brightnessK",
        "confidence",
        "sourceCode",
        "satellite",
        "dayNight",
        "landCover",
    ];
    private static readonly string[] EnrichedLiveSpotColumns = [.. LiveSpotColumns, "geometry"];

    private readonly SemaphoreSlim _statusLock = new(1, 1);
    private readonly SemaphoreSlim _hotspotsLock = new(1, 1);
    private readonly SemaphoreSlim _areaSnapshotLock = new(1, 1);
    private readonly ConcurrentDictionary<string, CachedAreaSnapshot> _lastAreaSnapshots = new(StringComparer.Ordinal);

    private sealed record CachedKeyQuota(
        int? TransactionLimit,
        int? CurrentTransactions,
        string? TransactionInterval,
        string? ErrorMessage);

    private sealed record CachedAreaSnapshot(
        DateTimeOffset FetchedAtUtc,
        bool Stale,
        IReadOnlyList<FirmsHotspot> Spots);

    private sealed record CachedLiveResponse(FirmsLiveSpotsResponse Response, IReadOnlyList<FirmsHotspot> Selected);

    private readonly record struct BoundingBox(double West, double South, double East, double North)
    {
        public string ToQueryString() => string.Join(',',
            West.ToString(CultureInfo.InvariantCulture),
            South.ToString(CultureInfo.InvariantCulture),
            East.ToString(CultureInfo.InvariantCulture),
            North.ToString(CultureInfo.InvariantCulture));
    }

    public async Task<FirmsStatusResponse> GetStatusAsync(CancellationToken cancellationToken = default)
    {
        var checkedAt = DateTimeOffset.UtcNow;
        if (!options.IsConfigured)
        {
            return new FirmsStatusResponse(
                Configured: false,
                KeyFormatValid: false,
                ConfigSource: options.ConfigSource,
                Reachable: false,
                TransactionLimit: null,
                CurrentTransactions: null,
                TransactionInterval: null,
                Datasets: [],
                Attribution: FirmsDefaults.Attribution,
                CheckedAtUtc: checkedAt,
                Message: "FIRMS_MAP_KEY is not configured. Set the Windows User env var locally or attach Secret Manager secret firms-map-key on Cloud Run.");
        }

        var quota = await GetKeyQuotaAsync(cancellationToken).ConfigureAwait(false);
        var (datasets, availabilityError) = await GetDatasetsAsync(cancellationToken).ConfigureAwait(false);

        var reachable = quota.ErrorMessage is null && availabilityError is null && datasets.Count > 0;
        var message = quota.ErrorMessage ?? availabilityError;

        return new FirmsStatusResponse(
            Configured: options.IsConfigured,
            KeyFormatValid: options.IsKeyFormatValid,
            ConfigSource: options.ConfigSource,
            Reachable: reachable,
            TransactionLimit: quota.TransactionLimit,
            CurrentTransactions: quota.CurrentTransactions,
            TransactionInterval: quota.TransactionInterval,
            Datasets: datasets,
            Attribution: FirmsDefaults.Attribution,
            CheckedAtUtc: checkedAt,
            Message: message);
    }

    public async Task<FirmsHotspotsResponse> GetAreaHotspotsAsync(
        string? bbox,
        int? days,
        string? sensor,
        CancellationToken cancellationToken = default,
        bool includeGeometry = false,
        bool enrichLandCover = false)
    {
        var response = await GetAreaHotspotsCoreAsync(bbox, days, sensor, cancellationToken).ConfigureAwait(false);
        var geometry = await geometryWorker.ObserveAsync(
            response.Hotspots, response.Hotspots, includeGeometry, cancellationToken).ConfigureAwait(false);
        var landCoverResult = await landCover.EnrichAsync(response.Hotspots, enrichLandCover, cancellationToken);
        return response with
        {
            Hotspots = landCoverResult.Spots,
            Geometry = geometry,
            LandCoverPending = landCoverResult.Pending,
        };
    }

    private async Task<FirmsHotspotsResponse> GetAreaHotspotsCoreAsync(
        string? bbox, int? days, string? sensor, CancellationToken cancellationToken)
    {
        if (!options.IsConfigured)
        {
            throw new InvalidOperationException("FIRMS_MAP_KEY is not configured.");
        }

        var normalizedBbox = NormalizeAndValidateBbox(bbox);
        var clampedDays = Math.Clamp(days ?? 1, 1, 5);
        var (sensorFilter, sources) = ResolveSources(sensor);
        var cacheKey = $"firms:hotspots:{sensorFilter}:{normalizedBbox}:{clampedDays}";

        if (cache.TryGetValue(cacheKey, out FirmsHotspotsResponse? cached) && cached is not null)
        {
            return cached;
        }

        await _hotspotsLock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            if (cache.TryGetValue(cacheKey, out cached) && cached is not null)
            {
                return cached;
            }

            var escapedKey = Uri.EscapeDataString(options.MapKey);
            var fetchTasks = sources.Select(async source =>
            {
                var relativeUrl = $"api/area/csv/{escapedKey}/{source}/{normalizedBbox}/{clampedDays}";
                var csv = await FetchStringAsync(relativeUrl, cancellationToken).ConfigureAwait(false);
                return FirmsCsvParser.ParseHotspots(csv, source);
            });

            IReadOnlyList<FirmsHotspot>[] perSourceResults;
            try
            {
                perSourceResults = await Task.WhenAll(fetchTasks).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                var safeMessage = options.Redact(ex.Message);
                logger.LogWarning("Failed to retrieve NASA FIRMS area hotspots ({Sensor}, {Bbox}, {Days}d): {Error}",
                    sensorFilter, normalizedBbox, clampedDays, safeMessage);
                throw new InvalidOperationException(safeMessage);
            }

            var combined = perSourceResults
                .SelectMany(list => list)
                .OrderByDescending(h => h.AcquiredAtUtc)
                .ThenByDescending(h => h.FrpMw)
                .ToArray();

            var response = new FirmsHotspotsResponse(
                Area: normalizedBbox,
                DayRange: clampedDays,
                SensorFilter: sensorFilter,
                SourcesQueried: sources,
                Count: combined.Length,
                FetchedAtUtc: DateTimeOffset.UtcNow,
                Attribution: FirmsDefaults.Attribution,
                Hotspots: combined,
                LandCoverDataset: LandCoverDataset.C3s2019);

            cache.Set(cacheKey, response, HotspotsCacheDuration);
            return response;
        }
        finally
        {
            _hotspotsLock.Release();
        }
    }

    public async Task<FirmsLiveSpotsResponse> GetLiveSpotsAsync(
        string? sensor = null,
        int? hours = null,
        string? bbox = null,
        CancellationToken cancellationToken = default,
        bool includeGeometry = false,
        bool enrichLandCover = false,
        bool enrichGeometry = false,
        DeferredHotspotWeather? weatherEnrichment = null,
        bool enrichWeather = false)
    {
        var windowHours = Math.Clamp(hours ?? DefaultLiveWindowHours, 1, 48);
        var dayRange = windowHours <= 24 ? 2 : 3;
        var (sensorFilter, sources) = ResolveSources(string.IsNullOrWhiteSpace(sensor) ? "harmonized" : sensor);
        var area = ResolveLiveArea(bbox);

        var snapshot = await GetAreaSnapshotAsync(area, dayRange, sources, cancellationToken).ConfigureAwait(false);
        var responseCacheKey = $"firms:live:{snapshot.FetchedAtUtc.UtcTicks}:{snapshot.Stale}:{sensorFilter}:{area}:{windowHours}";
        if (!cache.TryGetValue(responseCacheKey, out CachedLiveResponse? cachedResponse) || cachedResponse is null)
        {
            var nowUtc = DateTimeOffset.UtcNow;
            var selected = FilterSnapshotSpots(snapshot.Spots, nowUtc, windowHours);
            var landCoverResult = await landCover.EnrichAsync(
                selected, enrichLandCover, cancellationToken, world: area == "world");
            var response = BuildLiveSpotsResponse(
                snapshot, windowHours, sensorFilter, sources, area, nowUtc, landCoverResult);
            cachedResponse = new CachedLiveResponse(response, selected);
            if (!landCoverResult.Pending)
                cache.Set(responseCacheKey, cachedResponse, LiveResponseCacheDuration);
        }
        var weatherProgress = weatherEnrichment?.ObserveAsync(cachedResponse.Selected, DateTimeOffset.UtcNow, enrichWeather, cancellationToken);
        var geometry = await geometryWorker.ObserveAsync(
            snapshot.Spots, cachedResponse.Selected, includeGeometry || enrichGeometry, cancellationToken).ConfigureAwait(false);
        var liveResponse = cachedResponse.Response;
        var rows = liveResponse.Spots;
        if (enrichGeometry && geometry?.Spots is { } observations)
        {
            var enrichedRows = new object?[rows.Count][];
            for (var i = 0; i < rows.Count; i++)
            {
                enrichedRows[i] = [.. rows[i], observations[i]];
            }

            liveResponse = liveResponse with { Columns = EnrichedLiveSpotColumns, Spots = enrichedRows };
        }

        return liveResponse with
        {
            Geometry = includeGeometry ? geometry : null,
            GeometryStatus = geometry?.Status ?? (rows.Count == 0 ? "ready" : "pending"),
            GeometryProgress = geometryWorker.GetProgress(snapshot.Spots, cachedResponse.Selected),
            Weather = weatherProgress is null ? null : await weatherProgress.ConfigureAwait(false),
            IncludeWeatherInEnrichmentStatus = enrichWeather,
        };
    }

    private static FirmsLiveSpotsResponse BuildLiveSpotsResponse(
        CachedAreaSnapshot snapshot, int windowHours, string sensorFilter, string[] sources,
        string area, DateTimeOffset nowUtc, LandCoverResult landCoverResult)
    {
        var filtered = landCoverResult.Spots;

        var sourceCounts = new Dictionary<int, int>();
        var modisCount = 0;
        var viirsCount = 0;
        var maxFrp = 0.0;
        DateTimeOffset? latestAcquiredAtUtc = null;
        var rows = new List<object?[]>(filtered.Count);

        foreach (var spot in filtered)
        {
            var meta = FirmsSensorCatalog.Resolve(spot.SourceDataset);
            sourceCounts[meta.SourceCode] = sourceCounts.GetValueOrDefault(meta.SourceCode) + 1;

            if (meta.Instrument == "modis")
            {
                modisCount++;
            }
            else
            {
                viirsCount++;
            }

            if (spot.FrpMw > maxFrp)
            {
                maxFrp = spot.FrpMw;
            }

            if (latestAcquiredAtUtc is null || spot.AcquiredAtUtc > latestAcquiredAtUtc.Value)
            {
                latestAcquiredAtUtc = spot.AcquiredAtUtc;
            }

            rows.Add([
                Math.Round(spot.Longitude, 4),
                Math.Round(spot.Latitude, 4),
                spot.AcquiredAtUtc.ToUnixTimeMilliseconds(),
                Math.Round(spot.FrpMw, 1),
                Math.Round(spot.BrightnessKelvin, 1),
                spot.ConfidenceScore,
                meta.SourceCode,
                FirmsSensorCatalog.NormalizeSatelliteLabel(spot.Satellite, spot.SourceDataset),
                spot.DayNight,
                spot.LandCover,
            ]);
        }

        var sourceSet = new HashSet<string>(sources, StringComparer.OrdinalIgnoreCase);
        var sourceSummaries = FirmsSensorCatalog.All
            .Where(meta => sourceSet.Contains(meta.Dataset))
            .Select(meta => new FirmsSourceSummaryDto(
                Code: meta.SourceCode,
                Dataset: meta.Dataset,
                Label: meta.Label,
                Instrument: meta.Instrument,
                RadiusMeters: meta.RadiusMeters,
                Count: sourceCounts.GetValueOrDefault(meta.SourceCode)))
            .ToArray();

        var response = new FirmsLiveSpotsResponse(
            GeneratedAtUtc: nowUtc,
            FetchedAtUtc: snapshot.FetchedAtUtc,
            LatestAcquiredAtUtc: latestAcquiredAtUtc,
            WindowStartUtc: nowUtc.AddHours(-windowHours),
            WindowEndUtc: nowUtc,
            Stale: snapshot.Stale,
            WindowHours: windowHours,
            SensorFilter: sensorFilter,
            Sources: sourceSummaries,
            Count: rows.Count,
            ModisCount: modisCount,
            ViirsCount: viirsCount,
            MaxFrpMw: Math.Round(maxFrp, 1),
            Attribution: FirmsDefaults.Attribution,
            Columns: LiveSpotColumns,
            Spots: rows,
            LandCoverDataset: LandCoverDatasetFor(area),
            LandCoverPending: landCoverResult.Pending);

        return response;
    }

    public async Task<HotspotGeometryBatch> GetSelectedSpotGeometryAsync(
        FirmsSpotGeometryRequest request, CancellationToken cancellationToken)
    {
        if (request.Spots is not { Count: >= 1 and <= 512 } keys)
        {
            throw new ArgumentException("Provide between 1 and 512 spots.");
        }

        var (snapshot, selected) = await FindSelectedSpotsAsync(keys, cancellationToken).ConfigureAwait(false);
        if (selected.All(spot => spot is null))
        {
            return new HotspotGeometryBatch("ready", new HotspotGeometry?[keys.Count]);
        }

        return await geometryWorker.GetGeometryAsync(snapshot.Spots, selected, cancellationToken).ConfigureAwait(false);
    }

    public async Task<FirmsHotspot?[]> GetSelectedLiveSpotsAsync(
        IReadOnlyList<FirmsSpotGeometryKey> keys, CancellationToken cancellationToken)
    {
        var (_, selected) = await FindSelectedSpotsAsync(keys, cancellationToken).ConfigureAwait(false);
        var now = DateTimeOffset.UtcNow;
        var earliest = now.AddHours(-24);
        return selected.Select(spot => spot is not null && spot.AcquiredAtUtc >= earliest && spot.AcquiredAtUtc <= now
            ? spot : null).ToArray();
    }

    private async Task<(CachedAreaSnapshot Snapshot, FirmsHotspot?[] Selected)> FindSelectedSpotsAsync(
        IReadOnlyList<FirmsSpotGeometryKey> keys, CancellationToken cancellationToken)
    {
        // Use the same world snapshot as the 24-hour map feed. Join by detection
        // identity, since row positions can change between the map load and a pin.
        var (_, sources) = ResolveSources("harmonized");
        var snapshot = await GetAreaSnapshotAsync("world", 2, sources, cancellationToken).ConfigureAwait(false);
        var wanted = keys.ToHashSet();
        var locations = keys.Select(key => (key.Lng, key.Lat, key.TimestampMs)).ToHashSet();
        var matches = new Dictionary<FirmsSpotGeometryKey, FirmsHotspot>();
        for (var i = snapshot.Spots.Count - 1; i >= 0 && wanted.Count > 0; i--)
        {
            var spot = snapshot.Spots[i];
            var location = (Math.Round(spot.Longitude, 4), Math.Round(spot.Latitude, 4), spot.AcquiredAtUtc.ToUnixTimeMilliseconds());
            if (!locations.Contains(location))
            {
                continue;
            }

            var satellite = FirmsSensorCatalog.NormalizeSatelliteLabel(spot.Satellite, spot.SourceDataset);
            var key = new FirmsSpotGeometryKey(location.Item1, location.Item2, location.Item3, satellite);
            if (wanted.Remove(key))
            {
                matches.Add(key, spot);
            }
        }

        return (snapshot, keys.Select(key => matches.GetValueOrDefault(key)).ToArray());
    }

    public async Task<FirmsGeoJsonFeatureCollection> GetLiveSpotsGeoJsonAsync(
        string? sensor = null,
        int? hours = null,
        string? bbox = null,
        CancellationToken cancellationToken = default,
        bool includeGeometry = false,
        bool enrichLandCover = false)
    {
        var windowHours = Math.Clamp(hours ?? DefaultLiveWindowHours, 1, 48);
        var dayRange = windowHours <= 24 ? 2 : 3;
        var (sensorFilter, sources) = ResolveSources(string.IsNullOrWhiteSpace(sensor) ? "harmonized" : sensor);
        var area = ResolveLiveArea(bbox);

        var snapshot = await GetAreaSnapshotAsync(area, dayRange, sources, cancellationToken).ConfigureAwait(false);
        var nowUtc = DateTimeOffset.UtcNow;
        var filtered = FilterSnapshotSpots(snapshot.Spots, nowUtc, windowHours);
        var geometry = await geometryWorker.ObserveAsync(
            snapshot.Spots, filtered, includeGeometry, cancellationToken).ConfigureAwait(false);
        var landCoverResult = await landCover.EnrichAsync(
            filtered, enrichLandCover, cancellationToken, world: area == "world");
        var response = BuildGeoJsonFeatureCollection(
            landCoverResult.Spots, nowUtc, snapshot, windowHours, sensorFilter, LandCoverDatasetFor(area), landCoverResult.Pending);
        return geometry is null ? response : response with { Geometry = geometry };
    }

    private async Task<CachedAreaSnapshot> GetAreaSnapshotAsync(
        string area,
        int dayRange,
        string[] sources,
        CancellationToken cancellationToken)
    {
        if (!options.IsConfigured)
        {
            throw new InvalidOperationException("FIRMS_MAP_KEY is not configured.");
        }

        var sourcesKey = string.Join(',', sources);
        var snapshotCacheKey = $"firms:area-snapshot:{sourcesKey}:{area}:{dayRange}";

        if (cache.TryGetValue(snapshotCacheKey, out CachedAreaSnapshot? cached) && cached is not null)
        {
            return cached;
        }

        await _areaSnapshotLock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            if (cache.TryGetValue(snapshotCacheKey, out cached) && cached is not null)
            {
                return cached;
            }

            var escapedKey = Uri.EscapeDataString(options.MapKey);
            var fetchTasks = sources.Select(async source =>
            {
                var relativeUrl = $"api/area/csv/{escapedKey}/{source}/{area}/{dayRange}";
                var csv = await FetchStringAsync(relativeUrl, cancellationToken).ConfigureAwait(false);
                return FirmsCsvParser.ParseHotspots(csv, source);
            });

            try
            {
                var perSourceResults = await Task.WhenAll(fetchTasks).ConfigureAwait(false);
                var combined = perSourceResults
                    .SelectMany(list => list)
                    .OrderBy(h => h.FrpMw)
                    .ThenBy(h => h.AcquiredAtUtc)
                    .ToArray();

                var fresh = new CachedAreaSnapshot(
                    FetchedAtUtc: DateTimeOffset.UtcNow,
                    Stale: false,
                    Spots: combined);

                _lastAreaSnapshots[snapshotCacheKey] = fresh;
                cache.Set(snapshotCacheKey, fresh, AreaSnapshotCacheDuration);
                logger.LogInformation(
                    "Refreshed NASA FIRMS {DayRange}d snapshot for area={Area}, sources={Sources} ({Count} hotspots).",
                    dayRange, area, sourcesKey, combined.Length);
                return fresh;
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                var safeMessage = options.Redact(ex.Message);
                logger.LogWarning(
                    "Failed to refresh NASA FIRMS snapshot for area={Area}, sources={Sources}: {Error}",
                    area, sourcesKey, safeMessage);

                if (_lastAreaSnapshots.TryGetValue(snapshotCacheKey, out var previous))
                {
                    var degraded = previous with { Stale = true };
                    cache.Set(snapshotCacheKey, degraded, AreaFailureBackoffDuration);
                    return degraded;
                }

                if (ex is HttpRequestException httpEx)
                {
                    throw new HttpRequestException(safeMessage, null, httpEx.StatusCode);
                }

                throw new InvalidOperationException(safeMessage);
            }
        }
        finally
        {
            _areaSnapshotLock.Release();
        }
    }

    private static LandCoverDataset LandCoverDatasetFor(string area) =>
        area == "world" ? LandCoverDataset.C3s2019World : LandCoverDataset.C3s2019;

    private static string ResolveLiveArea(string? bbox)
    {
        if (string.IsNullOrWhiteSpace(bbox) || string.Equals(bbox.Trim(), "world", StringComparison.OrdinalIgnoreCase))
            return "world";

        var bounds = ParseBoundingBox(bbox, enforceSpanLimit: false);
        return bounds == new BoundingBox(-180, -90, 180, 90) ? "world" : bounds.ToQueryString();
    }

    private static List<FirmsHotspot> FilterSnapshotSpots(
        IReadOnlyList<FirmsHotspot> spots,
        DateTimeOffset nowUtc,
        int windowHours)
    {
        var cutoff = nowUtc.AddHours(-windowHours);
        var filtered = new List<FirmsHotspot>(Math.Min(spots.Count, 8192));

        foreach (var spot in spots)
        {
            if (spot.AcquiredAtUtc > cutoff)
            {
                filtered.Add(spot);
            }
        }

        return filtered;
    }

    private static FirmsGeoJsonFeatureCollection BuildGeoJsonFeatureCollection(
        IReadOnlyList<FirmsHotspot> spots,
        DateTimeOffset nowUtc,
        CachedAreaSnapshot snapshot,
        int windowHours,
        string sensorFilter,
        LandCoverDataset landCoverDataset,
        bool landCoverPending)
    {
        var features = new List<FirmsGeoJsonFeature>(spots.Count);
        foreach (var spot in spots)
        {
            var meta = FirmsSensorCatalog.Resolve(spot.SourceDataset);
            features.Add(new FirmsGeoJsonFeature(
                Type: "Feature",
                Geometry: new FirmsGeoJsonPointGeometry(
                    Type: "Point",
                    Coordinates: [Math.Round(spot.Longitude, 4), Math.Round(spot.Latitude, 4)]),
                Properties: new FirmsGeoJsonSpotProperties(
                    Timestamp: spot.AcquiredAtUtc.ToUnixTimeMilliseconds(),
                    Brightness: Math.Round(spot.BrightnessKelvin, 1),
                    Frp: Math.Round(spot.FrpMw, 1),
                    Radius: meta.RadiusMeters,
                    Source: meta.Label,
                    Instrument: meta.Instrument,
                    Satellite: FirmsSensorCatalog.NormalizeSatelliteLabel(spot.Satellite, spot.SourceDataset),
                    Confidence: spot.ConfidenceScore,
                    Daynight: spot.DayNight,
                    LandCover: spot.LandCover)));
        }

        return new FirmsGeoJsonFeatureCollection(
            Type: "FeatureCollection",
            GeneratedAtUtc: nowUtc,
            FetchedAtUtc: snapshot.FetchedAtUtc,
            Stale: snapshot.Stale,
            WindowHours: windowHours,
            SensorFilter: sensorFilter,
            Count: features.Count,
            Attribution: FirmsDefaults.Attribution,
            Features: features,
            LandCoverDataset: landCoverDataset,
            LandCoverPending: landCoverPending);
    }

    private async Task<CachedKeyQuota> GetKeyQuotaAsync(CancellationToken cancellationToken)
    {
        if (cache.TryGetValue(KeyStatusCacheKey, out CachedKeyQuota? cached) && cached is not null)
        {
            return cached;
        }

        await _statusLock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            if (cache.TryGetValue(KeyStatusCacheKey, out cached) && cached is not null)
            {
                return cached;
            }

            var url = $"mapserver/mapkey_status/?MAP_KEY={Uri.EscapeDataString(options.MapKey)}";
            try
            {
                var payload = await FetchStringAsync(url, cancellationToken).ConfigureAwait(false);
                using var doc = JsonDocument.Parse(payload);
                var root = doc.RootElement;

                int? limit = root.TryGetProperty("transaction_limit", out var limEl) && limEl.TryGetInt32(out var l)
                    ? l
                    : null;
                int? current = root.TryGetProperty("current_transactions", out var curEl) && curEl.TryGetInt32(out var c)
                    ? c
                    : null;
                var interval = root.TryGetProperty("transaction_interval", out var intEl)
                    ? intEl.GetString()
                    : null;

                var result = new CachedKeyQuota(limit, current, interval, ErrorMessage: null);
                cache.Set(KeyStatusCacheKey, result, KeyStatusCacheDuration);
                return result;
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                var safeError = options.Redact(ex.Message);
                logger.LogWarning("Failed to query NASA FIRMS mapkey_status: {Error}", safeError);
                return new CachedKeyQuota(null, null, null, safeError);
            }
        }
        finally
        {
            _statusLock.Release();
        }
    }

    private async Task<(IReadOnlyList<FirmsDatasetAvailability> Datasets, string? ErrorMessage)> GetDatasetsAsync(
        CancellationToken cancellationToken)
    {
        if (cache.TryGetValue(AvailabilityCacheKey, out IReadOnlyList<FirmsDatasetAvailability>? cached) && cached is not null)
        {
            return (cached, null);
        }

        var url = $"api/data_availability/csv/{Uri.EscapeDataString(options.MapKey)}/ALL";
        try
        {
            var csv = await FetchStringAsync(url, cancellationToken).ConfigureAwait(false);
            var parsed = FirmsCsvParser.ParseDatasetAvailability(csv);
            cache.Set(AvailabilityCacheKey, parsed, AvailabilityCacheDuration);
            return (parsed, null);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            var safeError = options.Redact(ex.Message);
            logger.LogWarning("Failed to query NASA FIRMS data_availability: {Error}", safeError);
            return ([], safeError);
        }
    }

    private async Task<string> FetchStringAsync(string relativeUrl, CancellationToken cancellationToken)
    {
        using var client = httpClientFactory.CreateClient("Firms");
        try
        {
            using var response = await client.GetAsync(relativeUrl, cancellationToken).ConfigureAwait(false);
            var content = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                throw new HttpRequestException(
                    $"NASA FIRMS returned HTTP {(int)response.StatusCode} ({response.ReasonPhrase}): {options.Redact(content)}");
            }

            return content;
        }
        catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            throw new InvalidOperationException("NASA FIRMS request timed out.");
        }
        catch (HttpRequestException ex)
        {
            throw new HttpRequestException(options.Redact(ex.Message), null, ex.StatusCode);
        }
    }

    private static string NormalizeAndValidateBbox(string? bbox)
    {
        var candidate = string.IsNullOrWhiteSpace(bbox) ? DefaultBbox : bbox;
        return ParseBoundingBox(candidate, enforceSpanLimit: true).ToQueryString();
    }

    private static BoundingBox ParseBoundingBox(string bbox, bool enforceSpanLimit)
    {
        var parts = bbox.Trim().Split(',', StringSplitOptions.TrimEntries);
        if (parts.Length != 4 ||
            !double.TryParse(parts[0], NumberStyles.Float, CultureInfo.InvariantCulture, out var west) ||
            !double.TryParse(parts[1], NumberStyles.Float, CultureInfo.InvariantCulture, out var south) ||
            !double.TryParse(parts[2], NumberStyles.Float, CultureInfo.InvariantCulture, out var east) ||
            !double.TryParse(parts[3], NumberStyles.Float, CultureInfo.InvariantCulture, out var north))
        {
            throw new ArgumentException("Invalid bbox parameter. Expected 'west,south,east,north' decimal coordinates.");
        }

        if (!double.IsFinite(west) || !double.IsFinite(south) || !double.IsFinite(east) || !double.IsFinite(north))
        {
            throw new ArgumentException("bbox coordinates must be finite numbers.");
        }

        if (west < -180 || east > 180 || west >= east || south < -90 || north > 90 || south >= north)
        {
            throw new ArgumentException("bbox coordinates out of range. Require -180 <= west < east <= 180 and -90 <= south < north <= 90.");
        }

        if (enforceSpanLimit && ((east - west) > 90 || (north - south) > 60))
        {
            throw new ArgumentException("bbox span is too large. Maximum allowed span is 90 degrees longitude by 60 degrees latitude.");
        }

        return new BoundingBox(west, south, east, north);
    }

    private static (string Filter, string[] Sources) ResolveSources(string? sensor)
    {
        var normalized = string.IsNullOrWhiteSpace(sensor) ? "all" : sensor.Trim().ToLowerInvariant();
        return normalized switch
        {
            "all" or "harmonized" => (normalized, ["MODIS_NRT", "VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT"]),
            "modis" => ("modis", ["MODIS_NRT"]),
            "viirs" => ("viirs", ["VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT"]),
            _ => throw new ArgumentException("Invalid sensor parameter. Supported values: all, harmonized, modis, viirs."),
        };
    }
}
