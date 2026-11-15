using System.Net;
using System.Text;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using NasaSpaceApps.Api.Firms;
using NasaSpaceApps.Api.LandCover;
using NasaSpaceApps.Api.Satellites;
using Xunit;

namespace NasaSpaceApps.Api.Tests.Firms;

public sealed class FirmsParsingAndNormalizationTests
{
    private sealed class StubHostEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = Environments.Production;
        public string ApplicationName { get; set; } = "NasaSpaceApps.Api.Tests";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }

    private sealed class StubHttpClientFactory(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> responder)
        : IHttpClientFactory
    {
        private sealed class StubHandler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> handlerResponder)
            : HttpMessageHandler
        {
            protected override Task<HttpResponseMessage> SendAsync(
                HttpRequestMessage request,
                CancellationToken cancellationToken)
            {
                return handlerResponder(request, cancellationToken);
            }
        }

        public HttpClient CreateClient(string name)
        {
            return new HttpClient(new StubHandler(responder), disposeHandler: true)
            {
                BaseAddress = new Uri("https://firms.modaps.eosdis.nasa.gov/"),
            };
        }
    }

    private sealed class StubLandCover : ILandCoverEnricher
    {
        public Task<LandCoverResult> EnrichAsync(
            IReadOnlyList<FirmsHotspot> spots, bool fetchMissing, CancellationToken cancellationToken, bool world = false) =>
            Task.FromResult(new LandCoverResult(spots.Select(s => s with
            {
                LandCover = new LandCoverSummary(50, 1, [new(50, 0.75), new(130, 0.25)]),
            }).ToArray(), Pending: false));
    }

    [Theory]
    [InlineData("T", null, "Terra")]
    [InlineData("terra", null, "Terra")]
    [InlineData("A", null, "Aqua")]
    [InlineData("AQUA", null, "Aqua")]
    [InlineData("1", "VIIRS_NOAA20_NRT", "NOAA-20")]
    [InlineData("J1", null, "NOAA-20")]
    [InlineData("N20", null, "NOAA-20")]
    [InlineData("NOAA20", null, "NOAA-20")]
    [InlineData("2", "VIIRS_NOAA21_NRT", "NOAA-21")]
    [InlineData("J2", null, "NOAA-21")]
    [InlineData("N21", null, "NOAA-21")]
    [InlineData("NOAA-21", null, "NOAA-21")]
    [InlineData("N", null, "Suomi NPP")]
    [InlineData("snpp", null, "Suomi NPP")]
    [InlineData("", "VIIRS_NOAA20_NRT", "NOAA-20")]
    [InlineData("unknown", "VJ214IMGTDL", "NOAA-21")]
    [InlineData("", "VNP14IMGTDL", "Suomi NPP")]
    [InlineData("CustomSat", null, "CustomSat")]
    public void NormalizeSatelliteLabel_MapsCodesAndDatasetFallbacks(
        string raw,
        string? sourceDataset,
        string expected)
    {
        Assert.Equal(expected, FirmsSensorCatalog.NormalizeSatelliteLabel(raw, sourceDataset));
    }

    [Theory]
    [InlineData("l", 25)]
    [InlineData("low", 25)]
    [InlineData("n", 65)]
    [InlineData("nominal", 65)]
    [InlineData("h", 95)]
    [InlineData("high", 95)]
    [InlineData("0", 0)]
    [InlineData("84", 84)]
    [InlineData("140", 100)]
    [InlineData("-10", 0)]
    [InlineData("unexpected", 50)]
    public void NormalizeConfidence_HarmonizesViirsCategoriesAndModisPercentages(
        string raw,
        int expected)
    {
        Assert.Equal(expected, FirmsCsvParser.NormalizeConfidence(raw));
    }

    [Fact]
    public void ParseHotspots_ParsesModisNumericAndViirsCategoricalPayloads()
    {
        const string modisCsv = """
            latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight
            1.3521,103.8198,342.6,1.1,1.0,2026-11-14,0435,T,MODIS,88,6.1NRT,295.4,64.2,D
            """;

        const string viirsCsv = """
            latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
            1.3525,103.8202,351.2,0.4,0.4,2026-11-14,0610,1,VIIRS,h,2.0NRT,294.1,18.7,D
            1.3529,103.8205,332.0,0.4,0.4,2026-11-14,1820,2,VIIRS,n,2.0NRT,290.5,7.3,N
            1.3531,103.8209,320.4,0.4,0.4,2026-11-14,1915,N,VIIRS,l,2.0NRT,289.2,2.1,N
            """;

        var modis = FirmsCsvParser.ParseHotspots(modisCsv, "MODIS_NRT");
        Assert.Single(modis);
        Assert.Equal(88, modis[0].ConfidenceScore);
        Assert.Equal("Terra", FirmsSensorCatalog.NormalizeSatelliteLabel(modis[0].Satellite, modis[0].SourceDataset));
        Assert.Equal(64.2, modis[0].FrpMw);

        var viirs = FirmsCsvParser.ParseHotspots(viirsCsv, "VIIRS_NOAA20_NRT");
        Assert.Equal(3, viirs.Count);
        Assert.Equal([95, 65, 25], viirs.Select(v => v.ConfidenceScore).ToArray());
        Assert.Equal("NOAA-20", FirmsSensorCatalog.NormalizeSatelliteLabel(viirs[0].Satellite, viirs[0].SourceDataset));
        Assert.Equal("NOAA-21", FirmsSensorCatalog.NormalizeSatelliteLabel(viirs[1].Satellite, viirs[1].SourceDataset));
        Assert.Equal("Suomi NPP", FirmsSensorCatalog.NormalizeSatelliteLabel(viirs[2].Satellite, viirs[2].SourceDataset));
    }

    [Fact]
    public async Task GetLiveSpotsAsync_LoadsBeforeGeometryAndRematchesCachedRowsAfterEnrichment()
    {
        var now = DateTimeOffset.UtcNow;
        var recent = now.AddHours(-2);
        var acqDate = recent.ToString("yyyy-MM-dd");
        var acqTime = recent.ToString("HHmm");

        var csv = new StringBuilder()
            .AppendLine("latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight")
            .AppendLine($"38.7000,-120.5000,348.5,0.4,0.4,{acqDate},{acqTime},1,VIIRS,h,2.0NRT,292.1,42.3,D")
            .ToString();

        var releaseTles = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var tleRequests = 0;
        var firmsRequests = 0;
        var factory = new StubHttpClientFactory(async (request, token) =>
        {
            if (request.RequestUri!.AbsolutePath.StartsWith("/NORAD/"))
            {
                Interlocked.Increment(ref tleRequests);
                await releaseTles.Task.WaitAsync(token);
                return new HttpResponseMessage(HttpStatusCode.ServiceUnavailable);
            }
            Interlocked.Increment(ref firmsRequests);
            var feed = request.RequestUri.AbsolutePath.Contains("/VIIRS_NOAA21_NRT/")
                ? csv.Replace("38.7000,-120.5000", "42.0000,-90.0000").Replace(",1,VIIRS,", ",2,VIIRS,")
                : csv;
            if (request.RequestUri.AbsolutePath.Contains("/MODIS_NRT/"))
            {
                feed = csv.Split('\n', 2)[0].TrimEnd();
            }
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(feed, Encoding.UTF8, "text/csv"),
            };
        });

        using var memoryCache = new MemoryCache(new MemoryCacheOptions());
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["FIRMS_MAP_KEY"] = "1234567890abcdef1234567890abcdef",
            })
            .Build();
        var options = FirmsOptions.FromConfiguration(config, new StubHostEnvironment());
        var downloader = new CelesTrakTleDownloader(factory, memoryCache, NullLogger<CelesTrakTleDownloader>.Instance);
        using var worker = new HotspotGeometryWorker(downloader, memoryCache, NullLogger<HotspotGeometryWorker>.Instance);
        var client = new FirmsClient(factory, memoryCache, options, NullLogger<FirmsClient>.Instance, worker, new StubLandCover());
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        await worker.StartAsync(timeout.Token);
        try
        {
            var response = await clientResponse(false).WaitAsync(timeout.Token);
            Assert.Null(response.Geometry);
            Assert.Equal(2019, response.LandCoverDataset.Year);
            Assert.Equal(1200, response.LandCoverDataset.ResolutionMeters);
            Assert.Equal("landCover", response.Columns[9]);
            Assert.Equal(24, response.WindowHours);
            Assert.Equal(TimeSpan.FromHours(24), response.WindowEndUtc - response.WindowStartUtc);
            Assert.Equal(2, response.Count);
            Assert.Equal(["NOAA-20", "NOAA-21"], response.Spots.Select(row => (string)row[7]!).Order().ToArray());
            Assert.All(response.Spots, row =>
            {
                Assert.Equal(95, row[5]);
                Assert.Equal(10, row.Length);
                Assert.Equal(50, Assert.IsType<LandCoverSummary>(row[9]).DominantCode);
            });

            static FirmsSpotGeometryKey Key(object?[] row) => new((double)row[0]!, (double)row[1]!, (long)row[2]!, (string)row[7]!);
            var first = Key(response.Spots[0]);
            var second = Key(response.Spots[1]);
            var pinned = new FirmsSpotGeometryRequest([second, first with { Satellite = "Aqua" }, first]);
            var pending = await client.GetSelectedSpotGeometryAsync(pinned, timeout.Token);
            Assert.Equal("pending", pending.Status);
            Assert.Null(pending.Spots);
            releaseTles.SetResult();

            FirmsLiveSpotsResponse ready;
            do
            {
                ready = await clientResponse(true);
            }
            while (ready.Geometry?.Status == "pending");
            Assert.Equal("ready", ready.Geometry?.Status);
            Assert.Same(response.Spots, ready.Spots);
            Assert.Equal(ready.Count, ready.Geometry!.Spots!.Count);
            Assert.All(ready.Geometry.Spots, spot => Assert.InRange(Assert.IsType<HotspotGeometry>(spot).MoonIlluminatedFraction, 0, 1));
            var enrichedPin = await client.GetSelectedSpotGeometryAsync(pinned, timeout.Token);
            Assert.Equal("ready", enrichedPin.Status);
            Assert.Equal([ready.Geometry.Spots[1], null, ready.Geometry.Spots[0]], enrichedPin.Spots);
            Assert.Equal(3, firmsRequests); // Pin requests reuse the map feed's cached snapshot.
            Assert.Equal(2, tleRequests); // One attempt per CelesTrak group, shared across requests.
        }
        finally
        {
            await worker.StopAsync(CancellationToken.None);
        }

        Task<FirmsLiveSpotsResponse> clientResponse(bool includeGeometry)
        {
            return client.GetLiveSpotsAsync("harmonized", 24, "world", timeout.Token, includeGeometry: includeGeometry, enrichLandCover: includeGeometry);
        }
    }
}
