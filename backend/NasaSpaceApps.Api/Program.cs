using System.Net;
using System.Runtime.InteropServices;
using NasaSpaceApps.Api.Clouds;
using NasaSpaceApps.Api.Firms;
using NasaSpaceApps.Api.NasaOpenApi;
using NasaSpaceApps.Api.Satellites;

var builder = WebApplication.CreateBuilder(args);

var port = Environment.GetEnvironmentVariable("PORT");
if (!string.IsNullOrWhiteSpace(port))
{
    builder.WebHost.UseUrls($"http://0.0.0.0:{port}");
}

var allowedOrigins = builder.Configuration
    .GetSection("AllowedOrigins")
    .Get<string[]>()
    ?.Where(origin => !string.IsNullOrWhiteSpace(origin))
    .ToArray() ?? [];

var firmsOptions = FirmsOptions.FromConfiguration(builder.Configuration, builder.Environment);
var nasaOpenApiOptions = NasaOpenApiOptions.FromConfiguration(builder.Configuration, builder.Environment);
var cloudOptions = ExtremumCloudOptions.FromConfiguration(builder.Configuration);

builder.Services.AddOpenApi();
builder.Services.AddMemoryCache();
builder.Services.AddSingleton(firmsOptions);
builder.Services.AddSingleton(nasaOpenApiOptions);
builder.Services.AddSingleton(cloudOptions);
builder.Services.AddSingleton<ExtremumCloudInstanceIdentity>();
builder.Services.AddHttpClient("CelesTrak", client =>
{
    client.BaseAddress = new Uri("https://celestrak.org/");
    client.Timeout = TimeSpan.FromSeconds(10);
    client.DefaultRequestHeaders.UserAgent.ParseAdd(
        "NasaSpaceApps-EarthFireCalendar/1.0 (+https://github.com/avbelkin/nasa-space-apps-sg)");
}).ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler
{
    AutomaticDecompression = DecompressionMethods.All,
});
builder.Services.AddHttpClient("Firms", client =>
{
    client.BaseAddress = new Uri("https://firms.modaps.eosdis.nasa.gov/");
    client.Timeout = TimeSpan.FromSeconds(25);
    client.DefaultRequestHeaders.UserAgent.ParseAdd(
        "NasaSpaceApps-EarthFireCalendar/1.0 (+https://github.com/avbelkin/nasa-space-apps-sg)");
}).ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler
{
    AutomaticDecompression = DecompressionMethods.All,
});
builder.Services.AddHttpClient("NasaOpenApi", client =>
{
    client.BaseAddress = new Uri("https://api.nasa.gov/");
    client.Timeout = TimeSpan.FromSeconds(20);
    client.DefaultRequestHeaders.UserAgent.ParseAdd(
        "NasaSpaceApps-EarthFireCalendar/1.0 (+https://github.com/avbelkin/nasa-space-apps-sg)");
}).ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler
{
    AutomaticDecompression = DecompressionMethods.All,
});
builder.Services.AddHttpClient("NasaEonet", client =>
{
    client.BaseAddress = new Uri("https://eonet.gsfc.nasa.gov/");
    client.Timeout = TimeSpan.FromSeconds(20);
    client.DefaultRequestHeaders.UserAgent.ParseAdd(
        "NasaSpaceApps-EarthFireCalendar/1.0 (+https://github.com/avbelkin/nasa-space-apps-sg)");
}).ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler
{
    AutomaticDecompression = DecompressionMethods.All,
});
builder.Services.AddHttpClient(ExtremumCloudOptions.HttpClientName, client =>
{
    client.BaseAddress = new Uri(cloudOptions.BaseUrl);
    client.Timeout = Timeout.InfiniteTimeSpan;
    client.DefaultRequestHeaders.Clear();
}).ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler
{
    // Disable handler CookieContainer so our single explicit gis-uuid Cookie header is preserved verbatim.
    UseCookies = false,
    AutomaticDecompression = DecompressionMethods.All,
});
builder.Services.AddSingleton<CelesTrakTleDownloader>();
builder.Services.AddSingleton<SatelliteTrackerProcessor>();
builder.Services.AddSingleton<SatelliteOrbitService>();
builder.Services.AddSingleton<FirmsClient>();
builder.Services.AddSingleton<NasaOpenApiClient>();
builder.Services.AddSingleton<ExtremumCloudTileClient>();
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        if (allowedOrigins.Length > 0)
        {
            policy.WithOrigins(allowedOrigins)
                .AllowAnyHeader()
                .AllowAnyMethod();
        }
        else if (builder.Environment.IsDevelopment())
        {
            policy.AllowAnyOrigin()
                .AllowAnyHeader()
                .AllowAnyMethod();
        }
    });
});

var app = builder.Build();

app.UseCors();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.MapGet("/health", () => Results.Ok(new
{
    status = "healthy",
    timestampUtc = DateTimeOffset.UtcNow
}));

app.MapGet("/api/status", (IHostEnvironment env, FirmsOptions firms, NasaOpenApiOptions nasa) => Results.Ok(new
{
    service = "NasaSpaceApps.Api",
    status = "ok",
    environment = env.EnvironmentName,
    framework = RuntimeInformation.FrameworkDescription,
    timestampUtc = DateTimeOffset.UtcNow,
    firmsConfigured = firms.IsConfigured,
    firmsKeyFormatValid = firms.IsKeyFormatValid,
    firmsConfigSource = firms.ConfigSource,
    nasaApiConfigured = nasa.IsConfigured,
    nasaApiKeyFormatValid = nasa.IsKeyFormatValid,
    nasaApiConfigSource = nasa.ConfigSource
}));

app.MapGet("/api/firms/status", async (FirmsClient firmsClient, CancellationToken cancellationToken) =>
{
    var status = await firmsClient.GetStatusAsync(cancellationToken);
    return Results.Ok(status);
});

app.MapGet("/api/nasa/status", async (NasaOpenApiClient nasaClient, CancellationToken cancellationToken) =>
{
    var status = await nasaClient.GetStatusAsync(cancellationToken);
    return Results.Ok(status);
});

app.MapGet("/api/nasa/epic", async (
    NasaOpenApiOptions nasa,
    NasaOpenApiClient nasaClient,
    CancellationToken cancellationToken) =>
{
    if (!nasa.IsConfigured)
    {
        return Results.Json(
            new { error = "NASA_API_KEY is not configured on this backend instance." },
            statusCode: StatusCodes.Status503ServiceUnavailable);
    }

    try
    {
        var response = await nasaClient.GetLatestEpicNaturalAsync(cancellationToken);
        return Results.Ok(response);
    }
    catch (InvalidOperationException ex)
    {
        return Results.Json(
            new { error = nasa.Redact(ex.Message) },
            statusCode: StatusCodes.Status502BadGateway);
    }
    catch (HttpRequestException ex)
    {
        return Results.Json(
            new { error = $"Failed to query NASA EPIC API: {nasa.Redact(ex.Message)}" },
            statusCode: StatusCodes.Status502BadGateway);
    }
});

app.MapGet("/api/nasa/wildfires", async (
    string? status,
    int? days,
    int? limit,
    NasaOpenApiOptions nasa,
    NasaOpenApiClient nasaClient,
    CancellationToken cancellationToken) =>
{
    try
    {
        var response = await nasaClient.GetWildfireEventsAsync(status, days, limit, cancellationToken);
        return Results.Ok(response);
    }
    catch (ArgumentException ex)
    {
        return Results.BadRequest(new { error = ex.Message });
    }
    catch (InvalidOperationException ex)
    {
        return Results.Json(
            new { error = nasa.Redact(ex.Message) },
            statusCode: StatusCodes.Status502BadGateway);
    }
    catch (HttpRequestException ex)
    {
        return Results.Json(
            new { error = $"Failed to query NASA EONET API: {nasa.Redact(ex.Message)}" },
            statusCode: StatusCodes.Status502BadGateway);
    }
});

app.MapGet("/api/hotspots", async (
    string? bbox,
    int? days,
    string? sensor,
    FirmsOptions firms,
    FirmsClient firmsClient,
    CancellationToken cancellationToken) =>
{
    if (!firms.IsConfigured)
    {
        return Results.Json(
            new { error = "FIRMS_MAP_KEY is not configured on this backend instance." },
            statusCode: StatusCodes.Status503ServiceUnavailable);
    }

    try
    {
        var response = await firmsClient.GetAreaHotspotsAsync(bbox, days, sensor, cancellationToken);
        return Results.Ok(response);
    }
    catch (ArgumentException ex)
    {
        return Results.BadRequest(new { error = ex.Message });
    }
    catch (InvalidOperationException ex)
    {
        return Results.Json(
            new { error = firms.Redact(ex.Message) },
            statusCode: StatusCodes.Status502BadGateway);
    }
    catch (HttpRequestException ex)
    {
        return Results.Json(
            new { error = $"Failed to query NASA FIRMS: {firms.Redact(ex.Message)}" },
            statusCode: StatusCodes.Status502BadGateway);
    }
});

static bool TryParseViewportBounds(
    double? west,
    double? south,
    double? east,
    double? north,
    double? lat,
    double? lng,
    out GeoBounds? bounds,
    out string? error)
{
    bounds = null;
    error = null;

    if (west.HasValue || south.HasValue || east.HasValue || north.HasValue)
    {
        if (!west.HasValue || !south.HasValue || !east.HasValue || !north.HasValue)
        {
            error = "west, south, east, and north must all be provided when filtering by bounding box.";
            return false;
        }

        var candidate = new GeoBounds(west.Value, south.Value, east.Value, north.Value);
        if (!candidate.IsValid)
        {
            error = "Bounds must be finite coordinates with -90 <= south < north <= 90 and -180 <= west, east <= 180.";
            return false;
        }

        bounds = candidate;
        return true;
    }

    if (lat.HasValue || lng.HasValue)
    {
        if (!lat.HasValue || !lng.HasValue ||
            !double.IsFinite(lat.Value) || !double.IsFinite(lng.Value) ||
            lat.Value < -90.0 || lat.Value > 90.0 ||
            lng.Value < -180.0 || lng.Value > 180.0)
        {
            error = "lat and lng must both be finite coordinates within [-90, 90] and [-180, 180].";
            return false;
        }

        const double fallbackHalfSpanDegrees = 5.0;
        var centerLat = Math.Clamp(lat.Value, -84.9, 84.9);
        var centerLng = Math.Clamp(lng.Value, -179.8, 179.8);
        var southVal = Math.Clamp(centerLat - fallbackHalfSpanDegrees, -85.0, 84.0);
        var northVal = Math.Clamp(Math.Max(southVal + 0.2, centerLat + fallbackHalfSpanDegrees), -84.0, 85.0);
        var westVal = Math.Clamp(centerLng - fallbackHalfSpanDegrees, -179.9, 179.7);
        var eastVal = Math.Clamp(Math.Max(westVal + 0.2, centerLng + fallbackHalfSpanDegrees), -179.7, 179.9);
        bounds = new GeoBounds(westVal, southVal, eastVal, northVal);
        return true;
    }

    return true;
}

app.MapGet("/api/satellites/orbits", async (
    int? pastMinutes,
    int? futureMinutes,
    int? stepSeconds,
    double? west,
    double? south,
    double? east,
    double? north,
    double? lat,
    double? lng,
    SatelliteOrbitService orbitService,
    CancellationToken cancellationToken) =>
{
    if (!TryParseViewportBounds(west, south, east, north, lat, lng, out var bounds, out var error))
    {
        return Results.BadRequest(new { error });
    }

    var response = await orbitService.GetOrbitsAsync(
        pastMinutes ?? 45,
        futureMinutes ?? 90,
        stepSeconds ?? 30,
        bounds,
        cancellationToken);
    return Results.Ok(response);
});

<<<<<<< HEAD
app.MapGet("/api/weather/satellite/{z:int}/{x:int}/{y:int}.png", async (
    int z,
    int x,
    int y,
    HttpContext httpContext,
    ExtremumCloudTileClient cloudClient,
    CancellationToken cancellationToken) =>
{
    if (!ExtremumCloudTileClient.IsValidZoom(z))
    {
        return Results.NotFound();
    }

    if (!ExtremumCloudTileClient.IsValidCoords(z, x, y))
    {
        return Results.BadRequest(new { error = "Tile coordinates out of range for zoom level." });
    }

    httpContext.Response.Headers.CacheControl = "no-store, no-cache";

    try
    {
        var result = await cloudClient.GetTileAsync(z, x, y, cancellationToken);
        return result.Status == CloudTileStatus.NoContent
            ? Results.NoContent()
            : Results.File(result.PngBytes!, "image/png");
    }
    catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
    {
        return Results.StatusCode(499);
    }
    catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
    {
        return Results.Json(
            new { error = "Upstream satellite cloud service unavailable." },
            statusCode: StatusCodes.Status502BadGateway);
    }
});

app.MapGet("/api/satellites/swaths", async (
    double? west,
    double? south,
    double? east,
    double? north,
    double? lat,
    double? lng,
    SatelliteTrackerProcessor trackerProcessor,
    CancellationToken cancellationToken) =>
{
    if (!TryParseViewportBounds(west, south, east, north, lat, lng, out var bounds, out var error))
    {
        return Results.BadRequest(new { error });
    }

    var snapshot = await trackerProcessor.GetViewportSnapshotAsync(
        bounds ?? GeoBounds.World,
        nowUtc: null,
        cancellationToken);
    return Results.Ok(snapshot.ToGeoJson());
});

app.Run();

public partial class Program;
