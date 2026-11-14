using System.Net;
using System.Runtime.InteropServices;
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

builder.Services.AddOpenApi();
builder.Services.AddMemoryCache();
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
builder.Services.AddSingleton<CelesTrakTleDownloader>();
builder.Services.AddSingleton<SatelliteOrbitService>();
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

app.MapGet("/api/status", (IHostEnvironment env) => Results.Ok(new
{
    service = "NasaSpaceApps.Api",
    status = "ok",
    environment = env.EnvironmentName,
    framework = RuntimeInformation.FrameworkDescription,
    timestampUtc = DateTimeOffset.UtcNow
}));

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
