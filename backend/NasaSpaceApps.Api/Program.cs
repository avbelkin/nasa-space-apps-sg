using System.Net;
using System.Runtime.InteropServices;
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

builder.Services.AddOpenApi();
builder.Services.AddMemoryCache();
builder.Services.AddSingleton(firmsOptions);
builder.Services.AddSingleton(nasaOpenApiOptions);
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
builder.Services.AddSingleton<CelesTrakTleDownloader>();
builder.Services.AddSingleton<SatelliteOrbitService>();
builder.Services.AddSingleton<FirmsClient>();
builder.Services.AddSingleton<NasaOpenApiClient>();
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

app.Run();
