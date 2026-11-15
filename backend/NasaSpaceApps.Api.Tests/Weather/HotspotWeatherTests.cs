using System.Net;
using System.Net.Http.Json;
using System.Text;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using NasaSpaceApps.Api.Firms;
using NasaSpaceApps.Api.Weather;
using Xunit;

namespace NasaSpaceApps.Api.Tests.Weather;

public sealed class HotspotWeatherTests
{
    [Fact]
    public async Task EndpointReturnsOnlyMatchedLiveFirmsSpotsInRequestOrder()
    {
        var hour = DateTimeOffset.FromUnixTimeSeconds(DateTimeOffset.UtcNow.ToUnixTimeSeconds() / 3600 * 3600);
        var first = hour.AddHours(-2).AddMinutes(25);
        var last = hour.AddHours(-1).AddMinutes(35);
        var old = hour.AddHours(-26);
        var forecast = $$"""
            { "latitude": 45, "longitude": 7, "hourly_units": { "temperature_2m": "°C" },
              "hourly": { "time": [{{hour.AddHours(-2).ToUnixTimeSeconds()}}, {{hour.AddHours(-1).ToUnixTimeSeconds()}}],
                          "temperature_2m": [3, 4] } }
            """;
        using var weatherHandler = new WeatherHandler(forecast);
        using var firmsHandler = new FirmsHandler(first, last, old);
        await using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(
                new Dictionary<string, string?> { ["FIRMS_MAP_KEY"] = new string('a', 32) }));
            builder.ConfigureServices(services =>
            {
                services.AddHttpClient("Firms").ConfigurePrimaryHttpMessageHandler(() => firmsHandler);
                services.AddHttpClient(OpenMeteoHotspotWeather.HttpClientName)
                    .ConfigurePrimaryHttpMessageHandler(() => weatherHandler);
                services.AddHttpClient(CopernicusFireWeather.HttpClientName)
                    .ConfigurePrimaryHttpMessageHandler(() => new OfflineHandler());
                services.AddHttpClient(NoaaWeatherObservations.HttpClientName)
                    .ConfigurePrimaryHttpMessageHandler(() => new OfflineHandler());
            });
        });
        using var client = factory.CreateClient();
        using var response = await client.PostAsJsonAsync("/api/fires/spots/weather", new FirmsSpotGeometryRequest(
            [Key(last), Key(old), Key(first), Key(first.AddMinutes(1))]));

        response.EnsureSuccessStatusCode();
        var body = Assert.IsType<HotspotWeatherResponse>(await response.Content.ReadFromJsonAsync<HotspotWeatherResponse>());
        Assert.Equal(last, body.Spots[0]?.AcquiredAtUtc);
        Assert.Null(body.Spots[1]);
        Assert.Equal(first, body.Spots[2]?.AcquiredAtUtc);
        Assert.Null(body.Spots[3]);
        Assert.Equal(277.15, body.Spots[0]?.Sources[0].Values["temperature_2m"].Value);
        Assert.Equal(276.15, body.Spots[2]?.Sources[0].Values["temperature_2m"].Value);
        Assert.Equal(2, weatherHandler.RequestCount);
        Assert.Equal("source_unavailable", body.Spots[0]?.Sources[2].Status);
    }

    [Fact]
    public async Task SpotsAtSameLocationShareUpstreamReadsAndKeepTheirOwnAcquisitionTime()
    {
        const string weatherJson = """
            { "latitude": 45, "longitude": 7, "hourly_units": {
                "temperature_2m": "°C", "precipitation": "mm", "snowfall": "cm", "surface_pressure": "hPa",
                "wind_speed_10m": "m/s", "wind_direction_10m": "°", "wind_speed_925hPa": "m/s", "weather_code": "wmo code"
              }, "hourly": { "time": [0, 3600, 7200, 10800],
                "temperature_2m": [1, 2, 3, 4], "precipitation": [1, 2, 0, 50], "snowfall": [0.7, 0.7, 0, 0],
                "surface_pressure": [910, 910, 900, 910], "wind_speed_10m": [5, 5, 5, 5],
                "wind_direction_10m": [90, 90, 90, 90], "wind_speed_925hPa": [6, 6, 6, 6], "weather_code": [45, 0, 48, 0]
            } }
            """;
        using var handler = new WeatherHandler(weatherJson);
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var weather = new OpenMeteoHotspotWeather(new TestClientFactory(handler), cache,
            NullLogger<OpenMeteoHotspotWeather>.Instance);
        var origin = DateTimeOffset.UnixEpoch;
        var firstTime = origin.AddMinutes(20);
        var nextTime = origin.AddHours(2).AddMinutes(20);

        var result = await weather.EnrichAsync([Spot(firstTime), null, Spot(nextTime)], CancellationToken.None);

        var first = Assert.IsType<HotspotWeather>(result.Spots[0]);
        var next = Assert.IsType<HotspotWeather>(result.Spots[2]);
        Assert.Equal(firstTime, first.AcquiredAtUtc);
        Assert.Equal(nextTime, next.AcquiredAtUtc);
        Assert.Null(result.Spots[1]);
        Assert.Equal(2, handler.RequestCount);
        Assert.Equal(274.15, first.Sources[0].Values["temperature_2m"].Value);
        Assert.Equal(276.15, next.Sources[0].Values["temperature_2m"].Value);
        Assert.Equal(20d, next.Sources[0].Values["temperature_2m"].AgeMinutesAtAcquisition);
        var total = next.Sources[0].Values["precipitation_3h"];
        Assert.Equal(3d, total.Value);
        Assert.Equal(origin.AddHours(-1), total.ValidFromUtc);
        Assert.Equal(origin.AddHours(2), total.ValidThroughUtc);
        Assert.Equal(2d, next.Sources[0].Values["snowfall_water_equivalent_3h"].Value);
        Assert.Equal(-5d, next.Sources[0].Values["wind_u_10m"].Value);
        Assert.Equal("below_ground", next.Sources[0].Values["wind_speed_925hPa"].MissingReason);
        Assert.Equal(48d, next.Sources[0].Values["fog_or_rime_code"].Value);
        Assert.Equal("source_unavailable", next.Sources[1].Status);
    }

    private static FirmsHotspot Spot(DateTimeOffset acquiredAt) =>
        new(45, 7, 350, null, null, null, acquiredAt, "T", "MODIS", "MODIS_NRT", "80", 80, "6.1NRT", 35, "D");

    private static FirmsSpotGeometryKey Key(DateTimeOffset acquiredAt) =>
        new(7, 45, acquiredAt.ToUnixTimeMilliseconds(), "Terra");

    private sealed class TestClientFactory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, disposeHandler: false);
    }

    private sealed class WeatherHandler(string payload) : HttpMessageHandler
    {
        private int requestCount;
        public int RequestCount => requestCount;

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Interlocked.Increment(ref requestCount);
            return Task.FromResult(request.RequestUri!.Host == "api.open-meteo.com"
                ? new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(payload, Encoding.UTF8, "application/json") }
                : new HttpResponseMessage(HttpStatusCode.ServiceUnavailable));
        }
    }

    private sealed class FirmsHandler(params DateTimeOffset[] times) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            const string header = "latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight\n";
            var payload = request.RequestUri!.AbsolutePath.Contains("/MODIS_NRT/", StringComparison.Ordinal)
                ? header + string.Join('\n', times.Select(time => FormattableString.Invariant(
                    $"45,7,350,1,1,{time:yyyy-MM-dd},{time:HHmm},T,MODIS,80,6.1NRT,300,35,D")))
                : header;
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(payload) });
        }
    }

    private sealed class OfflineHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            Task.FromResult(new HttpResponseMessage(HttpStatusCode.ServiceUnavailable));
    }
}
