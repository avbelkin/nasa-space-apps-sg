using System.Net;
using System.Runtime.InteropServices;
using Microsoft.AspNetCore.ResponseCompression;
using NasaSpaceApps.Api.Clouds;
using NasaSpaceApps.Api.Firms;
using NasaSpaceApps.Api.LandCover;
using NasaSpaceApps.Api.NasaOpenApi;
using NasaSpaceApps.Api.Satellites;
using NasaSpaceApps.Api.Weather;

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
builder.Services.AddResponseCompression(options =>
{
    options.EnableForHttps = true;
    options.MimeTypes = ResponseCompressionDefaults.MimeTypes.Concat(["application/geo+json"]);
});
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
    client.Timeout = TimeSpan.FromSeconds(60);
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
builder.Services.AddSingleton<SatelliteOrbitService>();
builder.Services.AddHttpClient(PlanetaryComputerLandCover.HttpClientName, client =>
{
    client.Timeout = TimeSpan.FromSeconds(5);
}).RemoveAllLoggers(); // Azure range URLs include short-lived access tokens.
builder.Services.AddSingleton<ILandCoverEnricher, PlanetaryComputerLandCover>();
builder.Services.AddHttpClient(OpenMeteoHotspotWeather.HttpClientName, client => client.Timeout = TimeSpan.FromSeconds(5))
    .RemoveAllLoggers();
builder.Services.AddSingleton<OpenMeteoHotspotWeather>();
builder.Services.AddHttpClient(CopernicusFireWeather.HttpClientName, client => client.Timeout = TimeSpan.FromSeconds(5));
builder.Services.AddSingleton<CopernicusFireWeather>();
builder.Services.AddHttpClient(NoaaWeatherObservations.HttpClientName, client => client.Timeout = TimeSpan.FromSeconds(5));
builder.Services.AddSingleton<NoaaWeatherObservations>();
builder.Services.AddHttpClient(NoaaGfsWeather.HttpClientName, client => client.Timeout = TimeSpan.FromSeconds(5));
builder.Services.AddSingleton<NoaaGfsWeather>();
builder.Services.AddHttpClient(NoaaGoesWeather.HttpClientName, client => client.Timeout = TimeSpan.FromSeconds(6))
    .RemoveAllLoggers();
builder.Services.AddSingleton<NoaaGoesWeather>();
builder.Services.AddHttpClient(CopernicusSoilDrought.HttpClientName, client => client.Timeout = TimeSpan.FromSeconds(7))
    .RemoveAllLoggers();
builder.Services.AddSingleton<CopernicusSoilDrought>();
builder.Services.AddHttpClient(NoaaSoilMoistureAnomaly.HttpClientName, client => client.Timeout = TimeSpan.FromSeconds(5));
builder.Services.AddSingleton<NoaaSoilMoistureAnomaly>();
builder.Services.AddHttpClient(UsfsFuelMoisture.HttpClientName, client => client.Timeout = TimeSpan.FromSeconds(5));
builder.Services.AddSingleton<UsfsFuelMoisture>();
builder.Services.AddSingleton<FirmsClient>();
builder.Services.AddSingleton<HotspotGeometryWorker>();
builder.Services.AddHostedService(services => services.GetRequiredService<HotspotGeometryWorker>());
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
app.UseResponseCompression();

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

app.MapGet("/api/hotspots", (
    string? bbox,
    int? days,
    string? sensor,
    bool? includeGeometry,
    bool? enrichLandCover,
    FirmsOptions firms,
    FirmsClient firmsClient,
    CancellationToken cancellationToken) =>
    ExecuteFirmsQueryAsync(firms, () => firmsClient.GetAreaHotspotsAsync(bbox, days, sensor, cancellationToken, includeGeometry: includeGeometry == true, enrichLandCover: enrichLandCover == true)));

app.MapGet("/api/fires/spots", (
    string? sensor,
    int? hours,
    string? bbox,
    bool? includeGeometry,
    bool? enrichLandCover,
    bool? enrichGeometry,
    FirmsOptions firms,
    FirmsClient firmsClient,
    CancellationToken cancellationToken) =>
    ExecuteFirmsQueryAsync(firms, () => firmsClient.GetLiveSpotsAsync(sensor, hours, bbox, cancellationToken,
        includeGeometry: includeGeometry == true, enrichLandCover: enrichLandCover == true, enrichGeometry: enrichGeometry == true)));

app.MapGet("/api/fires/spots.geojson", (
    string? sensor,
    int? hours,
    string? bbox,
    bool? includeGeometry,
    bool? enrichLandCover,
    FirmsOptions firms,
    FirmsClient firmsClient,
    CancellationToken cancellationToken) =>
    ExecuteFirmsQueryAsync(firms, () => firmsClient.GetLiveSpotsGeoJsonAsync(sensor, hours, bbox, cancellationToken, includeGeometry: includeGeometry == true, enrichLandCover: enrichLandCover == true)));

app.MapPost("/api/fires/spots/geometry", (
    FirmsSpotGeometryRequest request,
    FirmsOptions firms,
    FirmsClient firmsClient,
    CancellationToken cancellationToken) =>
    ExecuteFirmsQueryAsync(firms, () => firmsClient.GetSelectedSpotGeometryAsync(request, cancellationToken)));

app.MapPost("/api/fires/spots/weather", (
    FirmsSpotGeometryRequest request,
    FirmsOptions firms,
    FirmsClient firmsClient,
    OpenMeteoHotspotWeather weather,
    CopernicusFireWeather fireWeather,
    NoaaWeatherObservations observations,
    NoaaGfsWeather gfsWeather,
    NoaaGoesWeather goesWeather,
    CopernicusSoilDrought soilDrought,
    NoaaSoilMoistureAnomaly soilAnomaly,
    UsfsFuelMoisture fuelMoisture,
    CancellationToken cancellationToken) =>
    ExecuteFirmsQueryAsync(firms, async () =>
    {
        if (request.Spots is not { Count: >= 1 and <= OpenMeteoHotspotWeather.MaximumSpots } keys)
        {
            throw new ArgumentException($"Provide between 1 and {OpenMeteoHotspotWeather.MaximumSpots} spots.");
        }

        var spots = await firmsClient.GetSelectedLiveSpotsAsync(keys, cancellationToken);
        var forecastTask = weather.EnrichAsync(spots, cancellationToken);
        var fireWeatherTask = fireWeather.EnrichAsync(spots, cancellationToken);
        var observationsTask = observations.EnrichAsync(spots, cancellationToken);
        var gfsWeatherTask = gfsWeather.EnrichAsync(spots, cancellationToken);
        var goesWeatherTask = goesWeather.EnrichAsync(spots, cancellationToken);
        var droughtTask = soilDrought.EnrichAsync(spots, cancellationToken);
        var anomalyTask = soilAnomaly.EnrichAsync(spots, cancellationToken);
        var fuelMoistureTask = fuelMoisture.EnrichAsync(spots, cancellationToken);
        await Task.WhenAll(forecastTask, fireWeatherTask, observationsTask, gfsWeatherTask, goesWeatherTask, droughtTask, anomalyTask, fuelMoistureTask);
        var forecast = await forecastTask;
        var fireWeatherSources = await fireWeatherTask;
        var observationSources = await observationsTask;
        var gfsSources = await gfsWeatherTask;
        var goesSources = await goesWeatherTask;
        var droughtSources = await droughtTask;
        var anomalySources = await anomalyTask;
        var fuelMoistureSources = await fuelMoistureTask;
        return new HotspotWeatherResponse(forecast.Spots.Select((spot, index) =>
            spot is not null && fireWeatherSources[index] is { } source && droughtSources[index] is { } drought &&
                anomalySources[index] is { } anomaly && fuelMoistureSources[index] is { } fuel
                ? spot with { Sources = [.. gfsSources[index], .. spot.Sources, source, .. observationSources[index], .. goesSources[index], drought, anomaly, fuel] }
                : spot).ToArray());
    }));

app.MapGet("/api/satellites/orbits", async (
    int? pastMinutes,
    int? futureMinutes,
    int? stepSeconds,
    double? lat,
    double? lng,
    SatelliteOrbitService orbitService,
    CancellationToken cancellationToken) =>
{
    if (lat.HasValue != lng.HasValue)
    {
        return Results.BadRequest(new { error = "lat and lng must both be provided together." });
    }

    if (lat.HasValue && (!double.IsFinite(lat.Value) || lat.Value < -90.0 || lat.Value > 90.0 ||
        !double.IsFinite(lng!.Value) || lng.Value < -180.0 || lng.Value > 180.0))
    {
        return Results.BadRequest(new { error = "lat must be within [-90, 90] and lng within [-180, 180]." });
    }

    var response = await orbitService.GetOrbitsAsync(
        pastMinutes ?? SatelliteOrbitService.DefaultPastMinutes,
        futureMinutes ?? SatelliteOrbitService.DefaultFutureMinutes,
        stepSeconds ?? SatelliteOrbitService.DefaultStepSeconds,
        lat ?? 0.0,
        lng ?? 0.0,
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

    return await ExecuteCloudProxyAsync(
        httpContext,
        ct => cloudClient.GetTileAsync(z, x, y, ct),
        cancellationToken);
});

app.MapGet("/api/weather/satellite/polar/{pole}.png", async (
    string pole,
    HttpContext httpContext,
    ExtremumCloudTileClient cloudClient,
    CancellationToken cancellationToken) =>
{
    if (!ExtremumCloudTileClient.TryNormalizePole(pole, out var normalizedPole))
    {
        return Results.BadRequest(new { error = "Polar hemisphere must be 'north' or 'south'." });
    }

    return await ExecuteCloudProxyAsync(
        httpContext,
        ct => cloudClient.GetPolarCapAsync(normalizedPole, ct),
        cancellationToken);
});

static async Task<IResult> ExecuteCloudProxyAsync(
    HttpContext httpContext,
    Func<CancellationToken, Task<CloudTileResult>> fetchAsync,
    CancellationToken cancellationToken)
{
    httpContext.Response.Headers.CacheControl = "no-store, no-cache";

    try
    {
        var result = await fetchAsync(cancellationToken);
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
}

app.Run();

static async Task<IResult> ExecuteFirmsQueryAsync<T>(FirmsOptions firms, Func<Task<T>> queryAsync)
{
    if (!firms.IsConfigured)
    {
        return Results.Json(
            new { error = "FIRMS_MAP_KEY is not configured on this backend instance." },
            statusCode: StatusCodes.Status503ServiceUnavailable);
    }

    try
    {
        var response = await queryAsync();
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
}

public partial class Program;
