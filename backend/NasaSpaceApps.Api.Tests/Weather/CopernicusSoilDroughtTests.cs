using System.Net;
using System.Net.Http.Headers;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;
using NasaSpaceApps.Api.Firms;
using NasaSpaceApps.Api.Weather;
using PureHDF;
using Xunit;

namespace NasaSpaceApps.Api.Tests.Weather;

public sealed class CopernicusSoilDroughtTests
{
    [Fact]
    public async Task SelectsLatestCompletedPeriodAndPreservesSourceAnomalyUnits()
    {
        using var http = new ClientFactory();
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var service = new CopernicusSoilDrought(http, cache, NullLogger<CopernicusSoilDrought>.Instance);
        var midnight = new DateTimeOffset(2026, 11, 11, 0, 0, 0, TimeSpan.Zero);

        var results = await service.EnrichAsync([Spot(midnight.AddMinutes(-1)), Spot(midnight), Spot(midnight, 80)], CancellationToken.None);

        var previous = results[0]!.Values["soil_moisture_standardized_anomaly"];
        Assert.Equal(-2.5, previous.Value);
        Assert.Equal(new DateTimeOffset(2026, 11, 1, 0, 0, 0, TimeSpan.Zero), previous.ValidThroughUtc);
        var current = results[1]!.Values["soil_moisture_standardized_anomaly"];
        Assert.Equal(0.5, current.Value);
        Assert.Contains("1995–2023", current.Unit);
        Assert.Equal(midnight, current.ValidThroughUtc);
        Assert.Equal(4d, results[1]!.Values["soil_moisture_anomaly_class"].Value);
        Assert.Equal("outside_coverage", results[2]!.Status);
    }

    [Fact]
    public void UsesCalendarBoundariesForTheFinalPeriodOfTheMonth()
    {
        Assert.Equal(new DateOnly(2028, 3, 1), CopernicusSoilDrought.PeriodEnd(new DateOnly(2028, 2, 21)));
        Assert.Equal(new DateOnly(2027, 1, 1), CopernicusSoilDrought.PeriodEnd(new DateOnly(2026, 12, 21)));
        Assert.Equal(4, CopernicusSoilDrought.MoistureClass(-1));
    }

    private static FirmsHotspot Spot(DateTimeOffset utc, double lat = 0.025) =>
        new(lat, 0.025, 350, null, 1, 1, utc, "T", "MODIS", "MODIS_NRT", "80", 80, "6.1NRT", 35, "D");

    private sealed class ClientFactory : HttpMessageHandler, IHttpClientFactory
    {
        private readonly byte[] payload = Raster();

        public HttpClient CreateClient(string name) => new(this, disposeHandler: false);

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            if (request.Method == HttpMethod.Head)
            {
                var head = new HttpResponseMessage(HttpStatusCode.OK);
                head.Content.Headers.ContentLength = payload.Length;
                return Task.FromResult(head);
            }
            if (request.Headers.Range is null)
                return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent("<a href='smang_m_gdo_20261021_20261111_t.nc'>numeric data</a>"),
                });

            var content = new ByteArrayContent(payload);
            content.Headers.ContentRange = new ContentRangeHeaderValue(0, payload.Length - 1, payload.Length);
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.PartialContent) { Content = content });
        }

        private static byte[] Raster()
        {
            var file = new H5File
            {
                ["lat"] = new[] { 0.025, -0.025 },
                ["lon"] = new[] { 0.025, 0.075 },
                ["time"] = new H5Dataset(new long[] { 0, 11, 21 })
                {
                    Attributes = new() { ["units"] = "days since 2026-10-21 00:00:00" },
                },
                ["smang"] = new float[,,] { { { -2.5f, 0 }, { 0, 0 } }, { { 0.5f, 0 }, { 0, 0 } }, { { 2.5f, 0 }, { 0, 0 } } },
            };
            using var stream = new MemoryStream();
            file.Write(stream);
            return stream.ToArray();
        }
    }
}
