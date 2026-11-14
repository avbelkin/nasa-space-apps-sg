using System.Globalization;
using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;

namespace NasaSpaceApps.Api.NasaOpenApi;

/// <summary>
/// Cached HTTP client for NASA Open APIs (`api.nasa.gov`, authenticated with `NASA_API_KEY`)
/// and NASA EONET v3 natural wildfire event feeds (`eonet.gsfc.nasa.gov`).
/// </summary>
public sealed class NasaOpenApiClient(
    IHttpClientFactory httpClientFactory,
    IMemoryCache cache,
    NasaOpenApiOptions options,
    ILogger<NasaOpenApiClient> logger)
{
    private const string EpicCacheKey = "nasa:epic:natural";
    private static readonly TimeSpan EpicCacheDuration = TimeSpan.FromMinutes(10);
    private static readonly TimeSpan EonetCacheDuration = TimeSpan.FromMinutes(15);

    private readonly SemaphoreSlim _epicLock = new(1, 1);
    private readonly SemaphoreSlim _eonetLock = new(1, 1);

    public async Task<NasaOpenApiStatusResponse> GetStatusAsync(CancellationToken cancellationToken = default)
    {
        var checkedAt = DateTimeOffset.UtcNow;
        if (!options.IsConfigured)
        {
            return new NasaOpenApiStatusResponse(
                Configured: false,
                KeyFormatValid: false,
                ConfigSource: options.ConfigSource,
                Reachable: false,
                RateLimit: null,
                RateLimitRemaining: null,
                EpicFrameCount: 0,
                LatestEpicObservationUtc: null,
                Attribution: NasaOpenApiDefaults.Attribution,
                CheckedAtUtc: checkedAt,
                Message: "NASA_API_KEY is not configured. Set the Windows User env var locally or attach Secret Manager secret nasa-api-key on Cloud Run.");
        }

        try
        {
            var epic = await GetLatestEpicNaturalAsync(cancellationToken).ConfigureAwait(false);
            var latestObs = epic.Frames.Count > 0 ? epic.Frames[0].ObservationUtc : (DateTimeOffset?)null;

            return new NasaOpenApiStatusResponse(
                Configured: options.IsConfigured,
                KeyFormatValid: options.IsKeyFormatValid,
                ConfigSource: options.ConfigSource,
                Reachable: true,
                RateLimit: epic.RateLimit,
                RateLimitRemaining: epic.RateLimitRemaining,
                EpicFrameCount: epic.Count,
                LatestEpicObservationUtc: latestObs,
                Attribution: NasaOpenApiDefaults.Attribution,
                CheckedAtUtc: checkedAt,
                Message: null);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            var safeError = options.Redact(ex.Message);
            logger.LogWarning("Failed to reach api.nasa.gov EPIC endpoint: {Error}", safeError);
            return new NasaOpenApiStatusResponse(
                Configured: options.IsConfigured,
                KeyFormatValid: options.IsKeyFormatValid,
                ConfigSource: options.ConfigSource,
                Reachable: false,
                RateLimit: null,
                RateLimitRemaining: null,
                EpicFrameCount: 0,
                LatestEpicObservationUtc: null,
                Attribution: NasaOpenApiDefaults.Attribution,
                CheckedAtUtc: checkedAt,
                Message: safeError);
        }
    }

    public async Task<NasaEpicNaturalResponse> GetLatestEpicNaturalAsync(CancellationToken cancellationToken = default)
    {
        if (!options.IsConfigured)
        {
            throw new InvalidOperationException("NASA_API_KEY is not configured.");
        }

        if (cache.TryGetValue(EpicCacheKey, out NasaEpicNaturalResponse? cached) && cached is not null)
        {
            return cached;
        }

        await _epicLock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            if (cache.TryGetValue(EpicCacheKey, out cached) && cached is not null)
            {
                return cached;
            }

            var relativeUrl = $"EPIC/api/natural?api_key={Uri.EscapeDataString(options.ApiKey)}";
            var (payload, headers) = await FetchAsync("NasaOpenApi", relativeUrl, cancellationToken).ConfigureAwait(false);

            var rateLimit = TryReadHeaderInt(headers, "X-RateLimit-Limit");
            var rateRemaining = TryReadHeaderInt(headers, "X-RateLimit-Remaining");
            var frames = ParseEpicFrames(payload);

            var result = new NasaEpicNaturalResponse(
                Count: frames.Count,
                RateLimit: rateLimit,
                RateLimitRemaining: rateRemaining,
                FetchedAtUtc: DateTimeOffset.UtcNow,
                Attribution: NasaOpenApiDefaults.Attribution,
                Frames: frames);

            cache.Set(EpicCacheKey, result, EpicCacheDuration);
            return result;
        }
        finally
        {
            _epicLock.Release();
        }
    }

    public async Task<NasaEonetWildfiresResponse> GetWildfireEventsAsync(
        string? status,
        int? days,
        int? limit,
        CancellationToken cancellationToken = default)
    {
        var normalizedStatus = NormalizeStatus(status);
        var clampedDays = Math.Clamp(days ?? 14, 1, 90);
        var clampedLimit = Math.Clamp(limit ?? 50, 1, 200);
        var cacheKey = $"nasa:eonet:wildfires:{normalizedStatus}:{clampedDays}:{clampedLimit}";

        if (cache.TryGetValue(cacheKey, out NasaEonetWildfiresResponse? cached) && cached is not null)
        {
            return cached;
        }

        await _eonetLock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            if (cache.TryGetValue(cacheKey, out cached) && cached is not null)
            {
                return cached;
            }

            // Never send NASA_API_KEY to eonet.gsfc.nasa.gov (separate keyless NASA GSFC endpoint).
            var relativeUrl =
                $"api/v3/events?category=wildfires&status={Uri.EscapeDataString(normalizedStatus)}&days={clampedDays}&limit={clampedLimit}";
            var (payload, _) = await FetchAsync("NasaEonet", relativeUrl, cancellationToken).ConfigureAwait(false);
            var events = ParseEonetWildfires(payload);

            var response = new NasaEonetWildfiresResponse(
                StatusFilter: normalizedStatus,
                Days: clampedDays,
                Count: events.Count,
                FetchedAtUtc: DateTimeOffset.UtcNow,
                Attribution: NasaOpenApiDefaults.Attribution,
                Events: events);

            cache.Set(cacheKey, response, EonetCacheDuration);
            return response;
        }
        finally
        {
            _eonetLock.Release();
        }
    }

    private async Task<(string Content, HttpResponseHeaders Headers)> FetchAsync(
        string clientName,
        string relativeUrl,
        CancellationToken cancellationToken)
    {
        using var client = httpClientFactory.CreateClient(clientName);
        try
        {
            using var response = await client.GetAsync(relativeUrl, cancellationToken).ConfigureAwait(false);
            var content = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                throw new HttpRequestException(
                    $"Upstream NASA service returned HTTP {(int)response.StatusCode} ({response.ReasonPhrase}): {options.Redact(content)}",
                    null,
                    response.StatusCode);
            }

            return (content, response.Headers);
        }
        catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            throw new InvalidOperationException($"Upstream request to '{clientName}' timed out.");
        }
        catch (HttpRequestException ex)
        {
            throw new HttpRequestException(options.Redact(ex.Message), null, ex.StatusCode);
        }
    }

    private static IReadOnlyList<NasaEpicFrameDto> ParseEpicFrames(string json)
    {
        using var doc = JsonDocument.Parse(json);
        if (doc.RootElement.ValueKind != JsonValueKind.Array)
        {
            throw new InvalidOperationException("NASA EPIC endpoint returned an unexpected non-array JSON payload.");
        }

        var frames = new List<NasaEpicFrameDto>();
        foreach (var item in doc.RootElement.EnumerateArray())
        {
            var identifier = item.TryGetProperty("identifier", out var idEl) ? idEl.GetString() : null;
            var image = item.TryGetProperty("image", out var imgEl) ? imgEl.GetString() : null;
            var dateStr = item.TryGetProperty("date", out var dtEl) ? dtEl.GetString() : null;
            var caption = item.TryGetProperty("caption", out var capEl) ? capEl.GetString() ?? string.Empty : string.Empty;

            if (string.IsNullOrWhiteSpace(identifier) ||
                string.IsNullOrWhiteSpace(image) ||
                string.IsNullOrWhiteSpace(dateStr) ||
                !DateTimeOffset.TryParseExact(
                    dateStr.Trim(),
                    "yyyy-MM-dd HH:mm:ss",
                    CultureInfo.InvariantCulture,
                    DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
                    out var obsUtc))
            {
                continue;
            }

            if (!TryGetCentroid(item, out var lat, out var lon))
            {
                continue;
            }

            var archiveUrl = string.Format(
                CultureInfo.InvariantCulture,
                "https://epic.gsfc.nasa.gov/archive/natural/{0:yyyy/MM/dd}/png/{1}.png",
                obsUtc,
                Uri.EscapeDataString(image.Trim()));

            frames.Add(new NasaEpicFrameDto(
                Identifier: identifier.Trim(),
                Image: image.Trim(),
                ObservationUtc: obsUtc,
                CentroidLat: lat,
                CentroidLon: lon,
                Caption: caption.Trim(),
                ArchivePngUrl: archiveUrl));
        }

        frames.Sort(static (a, b) => b.ObservationUtc.CompareTo(a.ObservationUtc));
        return frames;
    }

    private static bool TryGetCentroid(JsonElement item, out double lat, out double lon)
    {
        lat = 0;
        lon = 0;
        if (!item.TryGetProperty("centroid_coordinates", out var coords) || coords.ValueKind != JsonValueKind.Object)
        {
            return false;
        }

        return coords.TryGetProperty("lat", out var latEl) && latEl.TryGetDouble(out lat) &&
               coords.TryGetProperty("lon", out var lonEl) && lonEl.TryGetDouble(out lon);
    }

    private static IReadOnlyList<NasaEonetWildfireEventDto> ParseEonetWildfires(string json)
    {
        using var doc = JsonDocument.Parse(json);
        if (!doc.RootElement.TryGetProperty("events", out var eventsEl) || eventsEl.ValueKind != JsonValueKind.Array)
        {
            throw new InvalidOperationException("NASA EONET endpoint returned an unexpected payload without 'events'.");
        }

        var list = new List<NasaEonetWildfireEventDto>();
        foreach (var ev in eventsEl.EnumerateArray())
        {
            var id = ev.TryGetProperty("id", out var idEl) ? idEl.GetString() : null;
            var title = ev.TryGetProperty("title", out var titleEl) ? titleEl.GetString() : null;
            var link = ev.TryGetProperty("link", out var linkEl) ? linkEl.GetString() ?? string.Empty : string.Empty;

            if (string.IsNullOrWhiteSpace(id) || string.IsNullOrWhiteSpace(title))
            {
                continue;
            }

            if (!TryExtractLatestPointGeometry(ev, out var latestUtc, out var lat, out var lon, out var magVal, out var magUnit))
            {
                continue;
            }

            string? sourceId = null;
            string? sourceUrl = null;
            if (ev.TryGetProperty("sources", out var sourcesEl) && sourcesEl.ValueKind == JsonValueKind.Array)
            {
                foreach (var src in sourcesEl.EnumerateArray())
                {
                    sourceId = src.TryGetProperty("id", out var sidEl) ? sidEl.GetString() : null;
                    sourceUrl = src.TryGetProperty("url", out var surlEl) ? surlEl.GetString() : null;
                    break;
                }
            }

            list.Add(new NasaEonetWildfireEventDto(
                Id: id.Trim(),
                Title: title.Trim(),
                LatestGeometryUtc: latestUtc,
                Latitude: lat,
                Longitude: lon,
                MagnitudeValue: magVal,
                MagnitudeUnit: magUnit,
                PrimarySourceId: sourceId,
                PrimarySourceUrl: sourceUrl,
                EventApiUrl: link.Trim()));
        }

        list.Sort(static (a, b) => b.LatestGeometryUtc.CompareTo(a.LatestGeometryUtc));
        return list;
    }

    private static bool TryExtractLatestPointGeometry(
        JsonElement ev,
        out DateTimeOffset latestUtc,
        out double lat,
        out double lon,
        out double? magnitudeValue,
        out string? magnitudeUnit)
    {
        latestUtc = DateTimeOffset.MinValue;
        lat = 0;
        lon = 0;
        magnitudeValue = null;
        magnitudeUnit = null;

        if (!ev.TryGetProperty("geometry", out var geomArray) || geomArray.ValueKind != JsonValueKind.Array)
        {
            return false;
        }

        var found = false;
        foreach (var geom in geomArray.EnumerateArray())
        {
            var type = geom.TryGetProperty("type", out var typeEl) ? typeEl.GetString() : null;
            if (!string.Equals(type, "Point", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            if (!geom.TryGetProperty("date", out var dateEl) ||
                dateEl.ValueKind != JsonValueKind.String ||
                !DateTimeOffset.TryParse(dateEl.GetString(), CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var parsedDate))
            {
                continue;
            }

            if (!geom.TryGetProperty("coordinates", out var coordsEl) ||
                coordsEl.ValueKind != JsonValueKind.Array ||
                coordsEl.GetArrayLength() < 2 ||
                !coordsEl[0].TryGetDouble(out var candidateLon) ||
                !coordsEl[1].TryGetDouble(out var candidateLat))
            {
                continue;
            }

            if (!found || parsedDate > latestUtc)
            {
                found = true;
                latestUtc = parsedDate;
                lon = candidateLon;
                lat = candidateLat;
                magnitudeValue = geom.TryGetProperty("magnitudeValue", out var mvEl) && mvEl.ValueKind == JsonValueKind.Number && mvEl.TryGetDouble(out var mv)
                    ? mv
                    : null;
                magnitudeUnit = geom.TryGetProperty("magnitudeUnit", out var muEl) && muEl.ValueKind == JsonValueKind.String
                    ? muEl.GetString()
                    : null;
            }
        }

        return found;
    }

    private static string NormalizeStatus(string? status)
    {
        var normalized = (status ?? "open").Trim().ToLowerInvariant();
        return normalized switch
        {
            "open" or "closed" or "all" => normalized,
            _ => throw new ArgumentException("Invalid status parameter. Supported values: open, closed, all."),
        };
    }

    private static int? TryReadHeaderInt(HttpResponseHeaders headers, string name)
    {
        if (!headers.TryGetValues(name, out var values))
        {
            return null;
        }

        var first = values.FirstOrDefault();
        return int.TryParse(first, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed)
            ? parsed
            : null;
    }
}
