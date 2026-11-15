using System.Globalization;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using NasaSpaceApps.Api.Firms;
using NasaSpaceApps.Api.LandCover;
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
            Row(30, now.AddHours(-25)));

        await using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(
                new Dictionary<string, string?> { ["FIRMS_MAP_KEY"] = "test-key" }));
            builder.ConfigureTestServices(services =>
            {
                services.AddHttpClient("Firms").ConfigurePrimaryHttpMessageHandler(() => new StubHandler(csv));
                services.AddHttpClient("CelesTrak").ConfigurePrimaryHttpMessageHandler(() => new StubHandler(""));
                services.AddSingleton<ILandCoverEnricher, StubLandCover>();
            });
        });
        using var client = factory.CreateClient();

        const string feedUrl = "/api/fires/spots?hours=24&sensor=modis";
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var initial = (await client.GetFromJsonAsync<FirmsLiveSpotsResponse>(feedUrl, timeout.Token))!;
        Assert.Equal("pending", initial.GeometryStatus);
        Assert.Equal("pending", initial.EnrichmentStatus);
        Assert.DoesNotContain("geometry", initial.Columns);
        Assert.Equal(2, initial.Count);

        FirmsLiveSpotsResponse batch;
        do
        {
            batch = (await client.GetFromJsonAsync<FirmsLiveSpotsResponse>(
                feedUrl + "&enrichGeometry=true", timeout.Token))!;
        } while (batch.GeometryStatus == "pending");

        Assert.Equal("ready", batch.GeometryStatus);
        Assert.Equal("pending", batch.EnrichmentStatus);
        Assert.Equal(TimeSpan.FromHours(24), batch.WindowEndUtc - batch.WindowStartUtc);
        Assert.Equal(initial.Columns.Append("geometry"), batch.Columns);
        Assert.Null(batch.Geometry);
        Assert.Equal(initial.Count, batch.Count);
        for (var i = 0; i < batch.Spots.Count; i++)
        {
            var row = batch.Spots[i];
            Assert.Equal(initial.Spots[i].Select(JsonText), row.Take(row.Length - 1).Select(JsonText));
            var geometry = ((JsonElement)row[^1]!).Deserialize<HotspotGeometry>(JsonSerializerOptions.Web)!;
            Assert.Null(geometry.Orbit);
            Assert.Equal(((JsonElement)row[2]!).GetInt64(), geometry.EstimatedObservationUtc.ToUnixTimeMilliseconds());
            Assert.InRange(geometry.Sun.ElevationDeg, -90, 90);
        }

        var unaugmented = (await client.GetFromJsonAsync<FirmsLiveSpotsResponse>(feedUrl, timeout.Token))!;
        Assert.DoesNotContain("geometry", unaugmented.Columns);

        var complete = await client.GetFromJsonAsync<JsonElement>(
            feedUrl + "&enrichGeometry=true&enrichLandCover=true", timeout.Token);
        Assert.Equal("complete", complete.GetProperty("enrichmentStatus").GetString());
    }

    private static string? JsonText(object? value) => ((JsonElement?)value)?.GetRawText();

    private static string Row(int latitude, DateTimeOffset time) =>
        string.Create(CultureInfo.InvariantCulture, $"{latitude},5,350,1,1,{time:yyyy-MM-dd},{time:HHmm},X,MODIS,80,6.1NRT,290,35,D");

    private sealed class StubHandler(string body) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken) =>
            Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(body) });
    }

    private sealed class StubLandCover : ILandCoverEnricher
    {
        public Task<LandCoverResult> EnrichAsync(
            IReadOnlyList<FirmsHotspot> spots, bool fetchMissing, CancellationToken cancellationToken, bool world = false) =>
            Task.FromResult(new LandCoverResult(spots, Pending: !fetchMissing));
    }
}
