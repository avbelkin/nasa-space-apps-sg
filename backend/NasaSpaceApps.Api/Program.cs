using System.Net;
using System.Runtime.InteropServices;
using NasaSpaceApps.Api.Firms;
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

builder.Services.AddOpenApi();
builder.Services.AddMemoryCache();
builder.Services.AddSingleton(firmsOptions);
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
builder.Services.AddSingleton<CelesTrakTleDownloader>();
builder.Services.AddSingleton<SatelliteTrackerProcessor>();
builder.Services.AddSingleton<SatelliteOrbitService>();
builder.Services.AddSingleton<FirmsClient>();
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

app.MapGet("/api/status", (IHostEnvironment env, FirmsOptions firms) => Results.Ok(new
{
    service = "NasaSpaceApps.Api",
    status = "ok",
    environment = env.EnvironmentName,
    framework = RuntimeInformation.FrameworkDescription,
    timestampUtc = DateTimeOffset.UtcNow,
    firmsConfigured = firms.IsConfigured,
    firmsKeyFormatValid = firms.IsKeyFormatValid,
    firmsConfigSource = firms.ConfigSource
}));

app.MapGet("/api/firms/status", async (FirmsClient firmsClient, CancellationToken cancellationToken) =>
{
    var status = await firmsClient.GetStatusAsync(cancellationToken);
    return Results.Ok(status);
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
