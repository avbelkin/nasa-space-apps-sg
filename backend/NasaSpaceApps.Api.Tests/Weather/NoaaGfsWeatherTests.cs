using System.Collections.Concurrent;
using System.Net;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;
using NasaSpaceApps.Api.Firms;
using NasaSpaceApps.Api.Weather;
using Xunit;

namespace NasaSpaceApps.Api.Tests.Weather;

public sealed class NoaaGfsWeatherTests
{
    private static readonly DateTimeOffset Run = new(2026, 11, 15, 0, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task SamplesRealRegionalAndGaussianFieldsAtTheRequestedForecastTime()
    {
        using var handler = new FixtureHandler();
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var weather = new NoaaGfsWeather(new ClientFactory(handler), cache, NullLogger<NoaaGfsWeather>.Instance);
        var acquisition = Run.AddHours(6).AddMinutes(24);

        var result = await weather.EnrichAsync([Spot(acquisition, 1.5, 101), Spot(acquisition, 1.5, 100.75),
            Spot(acquisition.AddHours(-1), 1.5, 101), Spot(acquisition.AddMinutes(-20), 1.5, 101)], CancellationToken.None);

        Assert.Equal(6, handler.Urls.Count);
        Assert.Contains(handler.Urls, url => url.Contains("f006&var_HGT", StringComparison.Ordinal));
        Assert.Contains(handler.Urls, url => url.Contains("sfluxgrbf006.grib2", StringComparison.Ordinal));
        var forecast = result[0][0];
        Assert.Equal(Run, forecast.RunUtc);
        Assert.Equal(Run.AddHours(6).AddMinutes(10), forecast.PublishedAtUtc);
        Assert.Equal(1, handler.PublicationUrls.Count(url => url.EndsWith("pgrb2.0p25.f006", StringComparison.Ordinal)));
        Assert.Equal(Run.AddHours(-6), result[3][0].RunUtc);
        Assert.True(result[3][0].PublishedAtUtc <= acquisition.AddMinutes(-20));
        Assert.Equal(1.5, forecast.GridLatitude);
        Assert.Equal(101, forecast.GridLongitude);
        Assert.Equal(301.867, Assert.IsType<double>(forecast.Values["temperature_2m"].Value), 3);
        Assert.InRange(Assert.IsType<double>(forecast.Values["cloud_cover"].Value), 0, 100);
        var water = forecast.Values["column_cloud_water"];
        Assert.InRange(Assert.IsType<double>(water.Value), 0, 10);
        Assert.Equal(Run.AddHours(6), water.ValidThroughUtc);
        Assert.Equal(24, water.AgeMinutesAtAcquisition);
        var ice = forecast.Values["cloud_ice_water_mixing_ratio_300hPa"];
        Assert.Equal(3.696e-5, Assert.IsType<double>(ice.Value), 10);
        Assert.Equal(water.ValidThroughUtc, ice.ValidThroughUtc);
        Assert.Equal(0, forecast.Values["cloud_liquid_water_mixing_ratio_300hPa"].Value);
        Assert.InRange(Assert.IsType<double>(forecast.Values["plant_available_water_0_to_100cm"].Value), 0, 100);
        var deficit = forecast.Values["soil_water_deficit_to_field_capacity_0_to_100cm"];
        Assert.InRange(Assert.IsType<double>(deficit.Value), 0, 1000);
        Assert.Equal(water.ValidThroughUtc, deficit.ValidThroughUtc);
        Assert.Contains(forecast.Values, field => field.Key.EndsWith("_height_estimated_msl", StringComparison.Ordinal)
            && field.Value.Value is >= 0 and < 20_000);
        var snow = result[0][1].Values["snow_cover_percent"];
        Assert.Equal(0d, snow.Value);
        Assert.True(snow.ValidFromUtc < snow.ValidThroughUtc);
        Assert.Equal(Run.AddHours(6), snow.ValidThroughUtc);
        Assert.Null(result[2][0].Values["column_cloud_water"].Value);
    }

    [Fact]
    public void InterpolatesContinuousFieldsAcrossTheGridAndKeepsCategoricalPixels()
    {
        var grid = new GfsGribSubset.Grid(179, 1, [0, 1], 2);
        var frame = new GfsGribSubset.Frame(Run, Run, Run, grid, [2, 8, null, 6]);
        Assert.Equal(16d / 3, frame.Interpolate(0.5, 179.5));
        Assert.Null(frame.Interpolate(1, 179));
        Assert.Equal(6, frame.Sample(0.9, -180));
    }

    [Fact]
    public void ConvertsVolumetricShortfallToWaterDepth()
    {
        Assert.Equal(40, NoaaGfsWeather.DeficitToFieldCapacity(0.2, 0.3, 400)!.Value, 8);
        Assert.Equal(100, NoaaGfsWeather.DeficitToFieldCapacity(0.2, 0.3, 1000)!.Value, 8);
        Assert.Equal(0, NoaaGfsWeather.DeficitToFieldCapacity(0.4, 0.3, 400));
        Assert.Null(NoaaGfsWeather.DeficitToFieldCapacity(null, 0.3, 400));
    }

    [Fact]
    public void UsesLogPressureInterpolationAndRejectsUnbracketedCloudPressure()
    {
        var profile = new (double, double)[] { (100_000, 0), (90_000, 1200), (80_000, 2200) };
        Assert.Equal(600d, NoaaGfsWeather.HeightAtPressure(profile, Math.Sqrt(100_000d * 90_000))!.Value, 8);
        Assert.Null(NoaaGfsWeather.HeightAtPressure(profile, 79_999));
        Assert.Null(NoaaGfsWeather.HeightAtPressure(profile, 102_000));
    }

    private static FirmsHotspot Spot(DateTimeOffset acquired, double latitude, double longitude) =>
        new(latitude, longitude, 350, null, null, null, acquired, "T", "MODIS", "MODIS_NRT", "80", 80, "6.1NRT", 35, "D");

    private sealed class ClientFactory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, disposeHandler: false);
    }

    private sealed class FixtureHandler : HttpMessageHandler
    {
        public ConcurrentBag<string> Urls { get; } = [];
        public ConcurrentBag<string> PublicationUrls { get; } = [];

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var url = request.RequestUri!;
            if (request.Method == HttpMethod.Head)
            {
                PublicationUrls.Add(url.AbsoluteUri);
                var afterHour = url.AbsolutePath.Contains("/00/", StringComparison.Ordinal) &&
                    (url.AbsolutePath.EndsWith("f006", StringComparison.Ordinal) || url.AbsolutePath.EndsWith("f006.grib2", StringComparison.Ordinal));
                var publication = new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent([]) };
                publication.Content.Headers.LastModified = afterHour ? Run.AddHours(6).AddMinutes(10) : Run.AddHours(2);
                return Task.FromResult(publication);
            }
            Urls.Add(url.AbsoluteUri);
            // Real NOMADS subsets from the run at 00 UTC, valid 06 UTC, 15 Nov 2026.
            var file = url.AbsolutePath.Contains("sflux", StringComparison.Ordinal) ? "gfs-snow.grb2" : "gfs-weather.grb2";
            var bytes = File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "Weather", "Fixtures", file));
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent(bytes) });
        }
    }
}
