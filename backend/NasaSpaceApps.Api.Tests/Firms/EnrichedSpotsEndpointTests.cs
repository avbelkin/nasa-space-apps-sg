using System.Globalization;
using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using NasaSpaceApps.Api.Firms;
using Xunit;

namespace NasaSpaceApps.Api.Tests.Firms;

public sealed class EnrichedSpotsEndpointTests
{
    [Fact]
    public async Task ReturnsOneEnrichedRowPerDetectionInsideTheWindow()
    {
        var now = DateTimeOffset.UtcNow;
        var csv = string.Join('\n',
            "latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight",
            Row(10, now.AddHours(-1)),
            Row(20, now.AddHours(-23)),
            Row(30, now.AddHours(-25)),
            Row(40, now.AddHours(1)));

        await using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(
                new Dictionary<string, string?> { ["FIRMS_MAP_KEY"] = "test-key" }));
            builder.ConfigureTestServices(services =>
            {
                services.AddHttpClient("Firms").ConfigurePrimaryHttpMessageHandler(() => new StubHandler(csv));
                services.AddHttpClient("CelesTrak").ConfigurePrimaryHttpMessageHandler(() => new StubHandler(""));
            });
        });
        using var client = factory.CreateClient();

        FirmsEnrichedSpotsResponse batch;
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        do
        {
            batch = (await client.GetFromJsonAsync<FirmsEnrichedSpotsResponse>(
                "/api/fires/spots/enriched?sensor=modis", timeout.Token))!;
        } while (batch.Status == "pending");

        Assert.Equal("ready", batch.Status);
        Assert.Equal(TimeSpan.FromHours(24), batch.WindowEndUtc - batch.WindowStartUtc);
        Assert.Equal(2, batch.Count);
        Assert.Equal(new double[] { 10, 20 }, batch.Spots!.Select(row => row.Spot.Latitude).Order());
        Assert.All(batch.Spots!, row =>
        {
            var geometry = Assert.IsType<HotspotGeometry>(row.Geometry);
            Assert.Null(geometry.Orbit);
            Assert.Equal(row.Spot.AcquiredAtUtc, geometry.EstimatedObservationUtc);
            Assert.InRange(geometry.Sun.ElevationDeg, -90, 90);
        });
    }

    private static string Row(int latitude, DateTimeOffset time) =>
        string.Create(CultureInfo.InvariantCulture, $"{latitude},5,350,1,1,{time:yyyy-MM-dd},{time:HHmm},X,MODIS,80,6.1NRT,290,35,D");

    private sealed class StubHandler(string body) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken) =>
            Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(body) });
    }
}
