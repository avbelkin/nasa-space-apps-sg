using System.Net;
using System.Runtime.InteropServices;
using NasaSpaceApps.Api.Clouds;
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
var cloudOptions = ExtremumCloudOptions.FromConfiguration(builder.Configuration);

builder.Services.AddOpenApi();
builder.Services.AddMemoryCache();
builder.Services.AddSingleton(firmsOptions);
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
builder.Services.AddSingleton<SatelliteOrbitService>();
builder.Services.AddSingleton<FirmsClient>();
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

app.MapGet("/api/satellites/orbits", async (
    int? pastMinutes,
    int? futureMinutes,
    int? stepSeconds,
    SatelliteOrbitService orbitService,
    CancellationToken cancellationToken) =>
{
    var response = await orbitService.GetOrbitsAsync(
        pastMinutes ?? 45,
        futureMinutes ?? 90,
        stepSeconds ?? 30,
        cancellationToken);
    return Results.Ok(response);
});

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

app.Run();

public partial class Program;
