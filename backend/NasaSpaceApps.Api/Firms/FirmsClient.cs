using System.Globalization;
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;

namespace NasaSpaceApps.Api.Firms;

/// <summary>
/// Cached NASA FIRMS HTTP client covering MAP_KEY quota status, dataset availability,
/// and MODIS/VIIRS active-fire area queries with automatic secret redaction.
/// </summary>
public sealed class FirmsClient(
    IHttpClientFactory httpClientFactory,
    IMemoryCache cache,
    FirmsOptions options,
    ILogger<FirmsClient> logger)
{
    public const string DefaultBbox = "95,-11,141,20";
    public const int DefaultLiveWindowHours = 24;
    public const int MaxTileZoom = 12;

    private const string KeyStatusCacheKey = "firms:mapkey-status";
    private const string AvailabilityCacheKey = "firms:data-availability";
    private const string GlobalSnapshotCacheKey = "firms:global-snapshot-v1";
    private static readonly TimeSpan KeyStatusCacheDuration = TimeSpan.FromMinutes(2);
    private static readonly TimeSpan AvailabilityCacheDuration = TimeSpan.FromHours(6);
    private static readonly TimeSpan HotspotsCacheDuration = TimeSpan.FromMinutes(15);
    private static readonly TimeSpan GlobalSnapshotCacheDuration = TimeSpan.FromMinutes(20);
    private static readonly TimeSpan GlobalFailureBackoffDuration = TimeSpan.FromMinutes(2);
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
    ];

    private readonly SemaphoreSlim _statusLock = new(1, 1);
    private readonly SemaphoreSlim _hotspotsLock = new(1, 1);
    private readonly SemaphoreSlim _globalSnapshotLock = new(1, 1);
    private volatile CachedGlobalSnapshot? _lastGlobalSnapshot;

    private sealed record CachedKeyQuota(
        int? TransactionLimit,
        int? CurrentTransactions,
        string? TransactionInterval,
        string? ErrorMessage);

    private sealed record CachedGlobalSnapshot(
        DateTimeOffset FetchedAtUtc,
        bool Stale,
        IReadOnlyList<FirmsHotspot> Spots);

    private readonly record struct BoundingBox(double West, double South, double East, double North)
    {
        public bool Contains(double latitude, double longitude) =>
            longitude >= West && longitude <= East && latitude >= South && latitude <= North;

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
        CancellationToken cancellationToken = default)
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
                Hotspots: combined);

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
        CancellationToken cancellationToken = default)
    {
        var windowHours = Math.Clamp(hours ?? DefaultLiveWindowHours, 1, 48);
        var (sensorFilter, sources) = ResolveSources(string.IsNullOrWhiteSpace(sensor) ? "harmonized" : sensor);
        BoundingBox? parsedBbox = string.IsNullOrWhiteSpace(bbox)
            ? null
            : ParseBoundingBox(bbox, enforceSpanLimit: false);

        var snapshot = await GetGlobalSnapshotAsync(cancellationToken).ConfigureAwait(false);
        var canUseGlobalCache = parsedBbox is null && windowHours == DefaultLiveWindowHours;
        var responseCacheKey = $"firms:live:{snapshot.FetchedAtUtc.UtcTicks}:{sensorFilter}";
        if (canUseGlobalCache &&
            cache.TryGetValue(responseCacheKey, out FirmsLiveSpotsResponse? cachedResponse) &&
            cachedResponse is not null)
        {
            return cachedResponse;
        }

        var nowUtc = DateTimeOffset.UtcNow;
        var filtered = FilterSnapshotSpots(snapshot.Spots, nowUtc, windowHours, sources, parsedBbox);

        var sourceCounts = new Dictionary<int, int>();
        var modisCount = 0;
        var viirsCount = 0;
        var maxFrp = 0.0;
        DateTimeOffset? latestAcquiredAtUtc = null;
        var rows = new List<object[]>(filtered.Count);

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
                FirmsSensorCatalog.NormalizeSatelliteLabel(spot.Satellite),
                spot.DayNight,
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
            Spots: rows);

        if (canUseGlobalCache)
        {
            cache.Set(responseCacheKey, response, LiveResponseCacheDuration);
        }

        return response;
    }

    public async Task<FirmsGeoJsonFeatureCollection> GetLiveSpotsGeoJsonAsync(
        string? sensor = null,
        int? hours = null,
        string? bbox = null,
        CancellationToken cancellationToken = default)
    {
        var windowHours = Math.Clamp(hours ?? DefaultLiveWindowHours, 1, 48);
        var (sensorFilter, sources) = ResolveSources(string.IsNullOrWhiteSpace(sensor) ? "harmonized" : sensor);
        BoundingBox? parsedBbox = string.IsNullOrWhiteSpace(bbox)
            ? null
            : ParseBoundingBox(bbox, enforceSpanLimit: false);

        var snapshot = await GetGlobalSnapshotAsync(cancellationToken).ConfigureAwait(false);
        var nowUtc = DateTimeOffset.UtcNow;
        var filtered = FilterSnapshotSpots(snapshot.Spots, nowUtc, windowHours, sources, parsedBbox);

        return BuildGeoJsonFeatureCollection(filtered, nowUtc, snapshot, windowHours, sensorFilter);
    }

    public async Task<FirmsGeoJsonFeatureCollection> GetTileSpotsGeoJsonAsync(
        int zoom,
        int x,
        int y,
        string? sensor = null,
        int? hours = null,
        CancellationToken cancellationToken = default)
    {
        if (zoom < 0 || zoom > MaxTileZoom || !WebMercatorTile.TryCreate(zoom, x, y, out var tile))
        {
            throw new ArgumentException($"Invalid tile coordinates z={zoom}, x={x}, y={y}. Supported zoom range is 0..{MaxTileZoom}.");
        }

        var windowHours = Math.Clamp(hours ?? DefaultLiveWindowHours, 1, 48);
        var (sensorFilter, sources) = ResolveSources(string.IsNullOrWhiteSpace(sensor) ? "harmonized" : sensor);

        var snapshot = await GetGlobalSnapshotAsync(cancellationToken).ConfigureAwait(false);
        var nowUtc = DateTimeOffset.UtcNow;
        var filtered = FilterSnapshotSpots(snapshot.Spots, nowUtc, windowHours, sources, bbox: null, tile: tile);

        return BuildGeoJsonFeatureCollection(filtered, nowUtc, snapshot, windowHours, sensorFilter);
    }

    private async Task<CachedGlobalSnapshot> GetGlobalSnapshotAsync(CancellationToken cancellationToken)
    {
        if (!options.IsConfigured)
        {
            throw new InvalidOperationException("FIRMS_MAP_KEY is not configured.");
        }

        if (cache.TryGetValue(GlobalSnapshotCacheKey, out CachedGlobalSnapshot? cached) && cached is not null)
        {
            return cached;
        }

        await _globalSnapshotLock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            if (cache.TryGetValue(GlobalSnapshotCacheKey, out cached) && cached is not null)
            {
                return cached;
            }

            var escapedKey = Uri.EscapeDataString(options.MapKey);
            var fetchTasks = FirmsSensorCatalog.All.Select(async meta =>
            {
                var relativeUrl = $"api/area/csv/{escapedKey}/{meta.Dataset}/world/2";
                var csv = await FetchStringAsync(relativeUrl, cancellationToken).ConfigureAwait(false);
                return FirmsCsvParser.ParseHotspots(csv, meta.Dataset);
            });

            try
            {
                var perSourceResults = await Task.WhenAll(fetchTasks).ConfigureAwait(false);
                var combined = perSourceResults
                    .SelectMany(list => list)
                    .OrderBy(h => h.FrpMw)
                    .ThenBy(h => h.AcquiredAtUtc)
                    .ToArray();

                var fresh = new CachedGlobalSnapshot(
                    FetchedAtUtc: DateTimeOffset.UtcNow,
                    Stale: false,
                    Spots: combined);

                _lastGlobalSnapshot = fresh;
                cache.Set(GlobalSnapshotCacheKey, fresh, GlobalSnapshotCacheDuration);
                logger.LogInformation("Refreshed global NASA FIRMS 48h snapshot with {Count} hotspots.", combined.Length);
                return fresh;
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                var safeMessage = options.Redact(ex.Message);
                logger.LogWarning("Failed to refresh global NASA FIRMS snapshot: {Error}", safeMessage);

                if (_lastGlobalSnapshot is not null)
                {
                    var degraded = _lastGlobalSnapshot with { Stale = true };
                    cache.Set(GlobalSnapshotCacheKey, degraded, GlobalFailureBackoffDuration);
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
            _globalSnapshotLock.Release();
        }
    }

    private static List<FirmsHotspot> FilterSnapshotSpots(
        IReadOnlyList<FirmsHotspot> spots,
        DateTimeOffset nowUtc,
        int windowHours,
        string[] sources,
        BoundingBox? bbox,
        WebMercatorTile? tile = null)
    {
        var cutoff = nowUtc.AddHours(-windowHours);
        var sourceSet = new HashSet<string>(sources, StringComparer.OrdinalIgnoreCase);
        var filtered = new List<FirmsHotspot>(Math.Min(spots.Count, 8192));

        foreach (var spot in spots)
        {
            if (spot.AcquiredAtUtc <= cutoff || !sourceSet.Contains(spot.SourceDataset))
            {
                continue;
            }

            if (bbox.HasValue && !bbox.Value.Contains(spot.Latitude, spot.Longitude))
            {
                continue;
            }

            if (tile.HasValue && !tile.Value.Contains(spot.Latitude, spot.Longitude))
            {
                continue;
            }

            filtered.Add(spot);
        }

        return filtered;
    }

    private static FirmsGeoJsonFeatureCollection BuildGeoJsonFeatureCollection(
        IReadOnlyList<FirmsHotspot> spots,
        DateTimeOffset nowUtc,
        CachedGlobalSnapshot snapshot,
        int windowHours,
        string sensorFilter)
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
                    Satellite: FirmsSensorCatalog.NormalizeSatelliteLabel(spot.Satellite),
                    Confidence: spot.ConfidenceScore,
                    Daynight: spot.DayNight)));
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
            Features: features);
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
