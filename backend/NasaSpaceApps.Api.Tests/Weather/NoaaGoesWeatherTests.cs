using System.Net;
using System.Net.Http.Headers;
using System.Xml.Linq;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;
using NasaSpaceApps.Api.Firms;
using NasaSpaceApps.Api.Weather;
using PureHDF;
using Xunit;

namespace NasaSpaceApps.Api.Tests.Weather;

public sealed class NoaaGoesWeatherTests
{
    private static readonly DateTimeOffset Six = new(2026, 11, 15, 6, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task SamplesCalibratedPixelsAndCompleteLightningWindowsAtAcquisition()
    {
        using var handler = new GoesHandler();
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var service = new NoaaGoesWeather(new ClientFactory(handler), cache, NullLogger<NoaaGoesWeather>.Instance);
        var acquired = Six.AddMinutes(9).AddSeconds(50);

        var results = await service.EnrichAsync([Spot(acquired), Spot(Six.AddMinutes(4)), Spot(acquired, 100)], CancellationToken.None);

        var sources = results[0];
        Assert.Equal(250d, sources[0].Values["satellite_infrared_brightness_temperature"].Value);
        Assert.Equal(Six.AddMinutes(9), sources[0].Values["satellite_infrared_brightness_temperature"].ValidThroughUtc);
        Assert.Equal(3d, sources[1].Values["satellite_cloud_mask"].Value);
        Assert.Equal(1d, sources[1].Values["satellite_cloud_fraction"].Value);
        Assert.Equal(1d, sources[1].Values["satellite_cloud_footprint_coverage"].Value);
        Assert.Equal(1d, sources[2].Values["satellite_smoke_flag"].Value);
        var opticalDepth = sources[3].Values["satellite_cloud_optical_depth_640nm"];
        Assert.Equal(4d, opticalDepth.Value);
        Assert.Equal(Six.AddMinutes(9), opticalDepth.ValidThroughUtc);
        Assert.Null(sources[4].Values["satellite_cloud_top_geopotential_height"].Value);
        Assert.Equal(4d, sources[5].Values["satellite_cloud_top_phase"].Value);
        var lightning = sources[6].Values["observed_lightning_flash_count_50km"];
        Assert.Equal(3d, lightning.Value);
        Assert.Equal(Six.AddMinutes(8).AddSeconds(40), lightning.ValidFromUtc);
        Assert.Equal(Six.AddMinutes(9).AddSeconds(40), lightning.ValidThroughUtc);
        Assert.Equal(0d, sources[6].Values["observed_lightning_nearest_50km"].Value);
        Assert.Equal("no_matching_frame", results[1][0].Status);
        Assert.All(results[2], source => Assert.Equal("outside_coverage", source.Status));
    }

    [Fact]
    public void RefusesToCountLightningAcrossAGap()
    {
        var frames = new[] { Scene(0), Scene(20), Scene(60) };
        Assert.Empty(NoaaGoesWeather.LightningWindow(frames));
        Assert.Equal(3, NoaaGoesWeather.LightningWindow([Scene(0), Scene(20), Scene(40)]).Length);

        static NoaaGoesWeather.Scene Scene(int second) => new("fixture", 50, Six.AddSeconds(second), Six.AddSeconds(second + 20));
    }

    private static FirmsHotspot Spot(DateTimeOffset acquired, double longitude = -75) =>
        new(0, longitude, 350, null, 1, 1, acquired, "T", "MODIS", "MODIS_NRT", "80", 80, "6.1NRT", 35, "D");

    private sealed class ClientFactory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, disposeHandler: false);
    }

    private sealed class GoesHandler : HttpMessageHandler
    {
        private readonly Dictionary<string, byte[]> objects = CreateObjects();

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var uri = request.RequestUri!;
            if (uri.Query.Contains("list-type=2", StringComparison.Ordinal))
            {
                var prefix = Uri.UnescapeDataString(uri.Query.Split('&').Single(item => item.StartsWith("prefix=", StringComparison.Ordinal))[7..]);
                var listing = new XElement("ListBucketResult", objects.Where(entry => entry.Key.StartsWith(prefix, StringComparison.Ordinal))
                    .Select(entry => new XElement("Contents", new XElement("Key", entry.Key), new XElement("Size", entry.Value.Length))));
                return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(listing.ToString()) });
            }

            var bytes = objects[uri.AbsolutePath[1..]];
            var range = request.Headers.Range!.Ranges.Single();
            var first = (int)range.From!.Value;
            var last = (int)range.To!.Value;
            var content = new ByteArrayContent(bytes[first..(last + 1)]);
            content.Headers.ContentRange = new ContentRangeHeaderValue(first, last, bytes.Length);
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.PartialContent) { Content = content });
        }

        private static Dictionary<string, byte[]> CreateObjects()
        {
            var infrared = Grid();
            infrared["CMI"] = new H5Dataset(Fill((short)3000))
            {
                Attributes = new() { ["scale_factor"] = 0.05d, ["add_offset"] = 100d, ["valid_range"] = new short[] { 0, 4095 } },
            };
            infrared["DQF"] = Fill((byte)0);
            var clouds = Grid();
            clouds["ACM"] = Fill((byte)3);
            clouds["DQF"] = Fill((byte)0);
            var smoke = Grid();
            smoke["Smoke"] = Fill((byte)1);
            smoke["DQF"] = Fill((short)4);
            var opticalDepth = Grid();
            opticalDepth["COD"] = Packed(40_000, 0.0001);
            opticalDepth["DQF"] = Fill((short)1);
            var cloudHeight = Grid();
            cloudHeight["HT"] = Packed(40_000, 0.2);
            cloudHeight["DQF"] = Fill((byte)1);
            var phase = Grid();
            phase["Phase"] = Fill((byte)4);
            phase["DQF"] = Fill((byte)0);
            var objects = new Dictionary<string, byte[]>
            {
                ["ABI-L2-CMIPF/2026/319/06/OR_ABI-L2-CMIPF-M6C13_G19_s20263190600000_e20263190609000_c20263190610000.nc"] = Bytes(infrared),
                ["ABI-L2-ACMF/2026/319/06/OR_ABI-L2-ACMF-M6_G19_s20263190600000_e20263190609000_c20263190610000.nc"] = Bytes(clouds),
                ["ABI-L2-ADPF/2026/319/06/OR_ABI-L2-ADPF-M6_G19_s20263190600000_e20263190609000_c20263190610000.nc"] = Bytes(smoke),
                ["ABI-L2-CODF/2026/319/06/OR_ABI-L2-CODF-M6_G19_s20263190600000_e20263190609000_c20263190610000.nc"] = Bytes(opticalDepth),
                ["ABI-L2-ACHAF/2026/319/06/OR_ABI-L2-ACHAF-M6_G19_s20263190600000_e20263190609000_c20263190610000.nc"] = Bytes(cloudHeight),
                ["ABI-L2-ACTPF/2026/319/06/OR_ABI-L2-ACTPF-M6_G19_s20263190600000_e20263190609000_c20263190610000.nc"] = Bytes(phase),
            };

            foreach (var (start, end) in new[] { (520, 540), (540, 560), (560, 580), (580, 600) })
            {
                var from = Six.AddSeconds(start);
                var through = Six.AddSeconds(end);
                objects[$"GLM-L2-LCFA/2026/319/06/OR_GLM-L2-LCFA_G19_s2026319{from:HHmmss}0_e2026319{through:HHmmss}0_c2026319{through:HHmmss}0.nc"] = Bytes(new H5File
                {
                    ["flash_lat"] = new float[] { 0, 0, 0 },
                    ["flash_lon"] = new float[] { -75, -75, -74 },
                    ["flash_quality_flag"] = new short[] { 0, 3, 0 },
                    ["flash_time_offset_of_first_event"] = new H5Dataset(new ushort[] { 2, 3, 4 })
                    {
                        Attributes = new() { ["scale_factor"] = 1d, ["add_offset"] = 0d, ["units"] = $"seconds since {from:yyyy-MM-dd HH:mm:ss}.000" },
                    },
                });
            }
            return objects;
        }

        private static H5Dataset Packed(ushort count, double scale) => new(Fill(unchecked((short)count)))
        {
            Attributes = new() { ["scale_factor"] = scale, ["add_offset"] = 0d, ["valid_range"] = new short[] { 0, -6 } },
        };

        private static H5File Grid() => new()
        {
            ["x"] = new H5Dataset(new short[] { -2, -1, 0, 1, 2 }) { Attributes = new() { ["scale_factor"] = 0.000056d, ["add_offset"] = 0d } },
            ["y"] = new H5Dataset(new short[] { 2, 1, 0, -1, -2 }) { Attributes = new() { ["scale_factor"] = 0.000056d, ["add_offset"] = 0d } },
            ["goes_imager_projection"] = new H5Dataset(0) { Attributes = new()
            {
                ["semi_major_axis"] = 6_378_137d, ["semi_minor_axis"] = 6_356_752.31414d,
                ["longitude_of_projection_origin"] = -75d, ["perspective_point_height"] = 35_786_023d,
            } },
        };

        private static T[,] Fill<T>(T value)
        {
            var values = new T[5, 5];
            for (var row = 0; row < 5; row++)
                for (var col = 0; col < 5; col++)
                    values[row, col] = value;
            return values;
        }

        private static byte[] Bytes(H5File file)
        {
            using var buffer = new MemoryStream();
            file.Write(buffer);
            return buffer.ToArray();
        }
    }
}
