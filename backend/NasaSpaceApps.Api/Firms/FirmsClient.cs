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

    private const string KeyStatusCacheKey = "firms:mapkey-status";
    private const string AvailabilityCacheKey = "firms:data-availability";
    private static readonly TimeSpan KeyStatusCacheDuration = TimeSpan.FromMinutes(2);
    private static readonly TimeSpan AvailabilityCacheDuration = TimeSpan.FromHours(6);
    private static readonly TimeSpan HotspotsCacheDuration = TimeSpan.FromMinutes(15);

    private readonly SemaphoreSlim _statusLock = new(1, 1);
    private readonly SemaphoreSlim _hotspotsLock = new(1, 1);

    private sealed record CachedKeyQuota(
        int? TransactionLimit,
        int? CurrentTransactions,
        string? TransactionInterval,
        string? ErrorMessage);

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
        var candidate = string.IsNullOrWhiteSpace(bbox) ? DefaultBbox : bbox.Trim();
        var parts = candidate.Split(',', StringSplitOptions.TrimEntries);
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

        if ((east - west) > 90 || (north - south) > 60)
        {
            throw new ArgumentException("bbox span is too large. Maximum allowed span is 90 degrees longitude by 60 degrees latitude.");
        }

        return string.Join(',',
            west.ToString(CultureInfo.InvariantCulture),
            south.ToString(CultureInfo.InvariantCulture),
            east.ToString(CultureInfo.InvariantCulture),
            north.ToString(CultureInfo.InvariantCulture));
    }

    private static (string Filter, string[] Sources) ResolveSources(string? sensor)
    {
        var normalized = (sensor ?? "all").Trim().ToLowerInvariant();
        return normalized switch
        {
            "all" or "harmonized" => (normalized, ["MODIS_NRT", "VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT"]),
            "modis" => ("modis", ["MODIS_NRT"]),
            "viirs" => ("viirs", ["VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT"]),
            _ => throw new ArgumentException("Invalid sensor parameter. Supported values: all, harmonized, modis, viirs."),
        };
    }
}
