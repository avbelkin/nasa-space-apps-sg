using System.Collections.Concurrent;
using System.Net;
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;
using NasaSpaceApps.Api.Firms;
using NasaSpaceApps.Api.Weather;
using Xunit;

namespace NasaSpaceApps.Api.Tests.Weather;

public sealed class NoaaWeatherObservationsTests
{
    [Fact]
    public async Task SelectsOnlyAdvertisedPreAcquisitionFramesAndPreservesEmptyCoverage()
    {
        using var handler = new ObservationHandler();
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var observations = new NoaaWeatherObservations(new ClientFactory(handler), cache);
        var acquired = new DateTimeOffset(2026, 11, 15, 7, 2, 0, TimeSpan.Zero);

        var result = await observations.EnrichAsync([
            Spot(acquired), Spot(acquired.AddMinutes(-55)), Spot(acquired, latitude: 75),
        ], CancellationToken.None);

        var radar = result[0][0].Values["radar_reflectivity"];
        Assert.Equal(0d, radar.Value);
        Assert.Equal(acquired.AddMinutes(-2), radar.ValidThroughUtc);
        Assert.Equal(2d, radar.AgeMinutesAtAcquisition);
        var infrared = result[0][1].Values["satellite_longwave_infrared_count"];
        Assert.Equal(210d, infrared.Value);
        Assert.Equal("count", infrared.Unit);
        Assert.Equal("no_source_coverage", result[0][1].Values["satellite_visible_count"].MissingReason);
        Assert.Equal("no_matching_frame", result[1][0].Values["radar_reflectivity"].MissingReason);
        Assert.Equal("outside_coverage", result[2][1].Values["satellite_longwave_infrared_count"].MissingReason);
        Assert.DoesNotContain(handler.QueryTimes, time => time.Contains("07:04", StringComparison.Ordinal));
    }

    private static FirmsHotspot Spot(DateTimeOffset time, double latitude = 35) =>
        new(latitude, -97, 350, null, null, null, time, "T", "MODIS", "MODIS_NRT", "80", 80, "6.1NRT", 35, "D");

    private sealed class ClientFactory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, disposeHandler: false);
    }

    private sealed class ObservationHandler : HttpMessageHandler
    {
        public ConcurrentBag<string> QueryTimes { get; } = [];

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var url = request.RequestUri!;
            var radar = url.AbsolutePath.Contains("weather_radar", StringComparison.Ordinal);
            string payload;
            if (url.Query.Contains("GetCapabilities", StringComparison.Ordinal))
            {
                var layers = radar ? Layer("conus_base_reflectivity_mosaic")
                    : Layer("global_longwave_imagery_mosaic") + Layer("global_visible_imagery_mosaic");
                payload = $"<WMS_Capabilities xmlns='http://www.opengis.net/wms'>{layers}</WMS_Capabilities>";
            }
            else
            {
                QueryTimes.Add(url.Query);
                payload = url.Query.Contains("global_visible", StringComparison.Ordinal) ? "{\"features\":[]}"
                    : JsonSerializer.Serialize(new { features = new[] { new { properties = new { Band1 = radar ? 0 : 210 } } } });
            }
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(payload) });
        }

        private static string Layer(string name) => $"""
            <Layer><Name>{name}</Name><EX_GeographicBoundingBox><westBoundLongitude>-130</westBoundLongitude>
              <eastBoundLongitude>-60</eastBoundLongitude><southBoundLatitude>20</southBoundLatitude>
              <northBoundLatitude>80</northBoundLatitude></EX_GeographicBoundingBox>
              <Dimension name="time">2026-11-15T07:00:00.000Z,2026-11-15T07:04:00.000Z</Dimension></Layer>
            """;
    }
}
