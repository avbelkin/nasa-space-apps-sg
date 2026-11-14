using System.Collections.Concurrent;
using System.Net;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Http;
using NasaSpaceApps.Api.Clouds;
using Xunit;

namespace NasaSpaceApps.Api.Tests;

public sealed class SatelliteCloudsEndpointTests
{
    private static readonly byte[] SamplePngBytes =
    [
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
    ];

    private sealed record RecordedUpstreamRequest(
        string Uri,
        string? Referer,
        string? UserAgent,
        string? Cookie);

    private sealed class RecordingUpstreamHandler(
        Func<HttpRequestMessage, HttpResponseMessage> responder) : HttpMessageHandler
    {
        public ConcurrentQueue<RecordedUpstreamRequest> Requests { get; } = new();

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            var referer = request.Headers.TryGetValues("Referer", out var refValues)
                ? string.Join(", ", refValues)
                : null;
            var userAgent = request.Headers.TryGetValues("User-Agent", out var uaValues)
                ? string.Join(" ", uaValues)
                : null;
            var cookie = request.Headers.TryGetValues("Cookie", out var cookieValues)
                ? string.Join("; ", cookieValues)
                : null;

            Requests.Enqueue(new RecordedUpstreamRequest(
                request.RequestUri?.ToString() ?? string.Empty,
                referer,
                userAgent,
                cookie));

            return Task.FromResult(responder(request));
        }
    }

    private sealed class OverridePrimaryHandlerFilter(
        string clientName,
        HttpMessageHandler handler) : IHttpMessageHandlerBuilderFilter
    {
        public Action<HttpMessageHandlerBuilder> Configure(Action<HttpMessageHandlerBuilder> next)
        {
            return builder =>
            {
                next(builder);
                if (string.Equals(builder.Name, clientName, StringComparison.Ordinal))
                {
                    builder.PrimaryHandler = handler;
                }
            };
        }
    }

    private static WebApplicationFactory<Program> CreateFactory(RecordingUpstreamHandler handler)
    {
        return new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Development");
            builder.ConfigureTestServices(services =>
            {
                services.AddSingleton<IHttpMessageHandlerBuilderFilter>(
                    new OverridePrimaryHandlerFilter(ExtremumCloudOptions.HttpClientName, handler));
            });
        });
    }

    [Fact]
    public async Task ProxiesPngTileWithExactHeadersAndPerInstanceGisUuidCookie()
    {
        var upstreamHandler = new RecordingUpstreamHandler(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new ByteArrayContent(SamplePngBytes),
        });

        await using var factory = CreateFactory(upstreamHandler);
        using var client = factory.CreateClient();

        var firstResponse = await client.GetAsync("/api/weather/satellite/2/3/1.png");
        Assert.Equal(HttpStatusCode.OK, firstResponse.StatusCode);
        Assert.Equal("image/png", firstResponse.Content.Headers.ContentType?.MediaType);
        Assert.Equal(SamplePngBytes, await firstResponse.Content.ReadAsByteArrayAsync());
        Assert.Contains("no-store", firstResponse.Headers.CacheControl?.ToString() ?? string.Empty);

        // Request a different tile from the same backend instance: gis-uuid cookie must stay identical.
        var secondResponse = await client.GetAsync("/api/weather/satellite/3/4/2.png");
        Assert.Equal(HttpStatusCode.OK, secondResponse.StatusCode);

        var recorded = upstreamHandler.Requests.ToArray();
        Assert.Equal(2, recorded.Length);
        Assert.Equal("https://layers.extremum.org/v3/weather/satellite/2/3/1.png", recorded[0].Uri);
        Assert.Equal("https://avbelkin.github.io/nasa-space-apps-sg", recorded[0].Referer);
        Assert.Equal("NASA-space-apps-sg", recorded[0].UserAgent);
        Assert.Matches(
            new Regex("^gis-uuid=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"),
            recorded[0].Cookie ?? string.Empty);
        Assert.Equal(recorded[0].Cookie, recorded[1].Cookie);

        // Requesting the first tile again must be served from IMemoryCache without a third upstream call.
        var cachedResponse = await client.GetAsync("/api/weather/satellite/2/3/1.png");
        Assert.Equal(HttpStatusCode.OK, cachedResponse.StatusCode);
        Assert.Equal(2, upstreamHandler.Requests.Count);
    }

    [Fact]
    public async Task SeparateBackendInstancesGenerateDistinctGisUuidCookies()
    {
        var handlerOne = new RecordingUpstreamHandler(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new ByteArrayContent(SamplePngBytes),
        });
        var handlerTwo = new RecordingUpstreamHandler(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new ByteArrayContent(SamplePngBytes),
        });

        await using var factoryOne = CreateFactory(handlerOne);
        await using var factoryTwo = CreateFactory(handlerTwo);
        using var clientOne = factoryOne.CreateClient();
        using var clientTwo = factoryTwo.CreateClient();

        Assert.Equal(HttpStatusCode.OK, (await clientOne.GetAsync("/api/weather/satellite/1/0/0.png")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await clientTwo.GetAsync("/api/weather/satellite/1/0/0.png")).StatusCode);

        var cookieOne = Assert.Single(handlerOne.Requests).Cookie;
        var cookieTwo = Assert.Single(handlerTwo.Requests).Cookie;
        Assert.False(string.IsNullOrWhiteSpace(cookieOne));
        Assert.False(string.IsNullOrWhiteSpace(cookieTwo));
        Assert.NotEqual(cookieOne, cookieTwo);
    }

    [Fact]
    public async Task PassesThroughUpstreamNoContentResponse()
    {
        var upstreamHandler = new RecordingUpstreamHandler(_ => new HttpResponseMessage(HttpStatusCode.NoContent));

        await using var factory = CreateFactory(upstreamHandler);
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/api/weather/satellite/2/1/1.png");
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
    }

    [Theory]
    [InlineData("/api/weather/satellite/0/0/0.png", HttpStatusCode.NotFound)]
    [InlineData("/api/weather/satellite/8/0/0.png", HttpStatusCode.NotFound)]
    [InlineData("/api/weather/satellite/2/-1/0.png", HttpStatusCode.BadRequest)]
    [InlineData("/api/weather/satellite/2/4/0.png", HttpStatusCode.BadRequest)]
    [InlineData("/api/weather/satellite/2/0/4.png", HttpStatusCode.BadRequest)]
    public async Task RejectsOutOfRangeZoomOrTileCoordinatesWithoutCallingUpstream(
        string path,
        HttpStatusCode expectedStatus)
    {
        var upstreamHandler = new RecordingUpstreamHandler(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new ByteArrayContent(SamplePngBytes),
        });

        await using var factory = CreateFactory(upstreamHandler);
        using var client = factory.CreateClient();

        var response = await client.GetAsync(path);
        Assert.Equal(expectedStatus, response.StatusCode);
        Assert.Empty(upstreamHandler.Requests);
    }

    [Theory]
    [InlineData("north", "north")]
    [InlineData("NORTH", "north")]
    [InlineData("south", "south")]
    public async Task ProxiesPolarCapPngWithHeadersCachingAndNormalizedPole(
        string requestedPole,
        string expectedNormalizedPole)
    {
        var upstreamHandler = new RecordingUpstreamHandler(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new ByteArrayContent(SamplePngBytes),
        });

        await using var factory = CreateFactory(upstreamHandler);
        using var client = factory.CreateClient();

        var firstResponse = await client.GetAsync($"/api/weather/satellite/polar/{requestedPole}.png");
        Assert.Equal(HttpStatusCode.OK, firstResponse.StatusCode);
        Assert.Equal("image/png", firstResponse.Content.Headers.ContentType?.MediaType);
        Assert.Equal(SamplePngBytes, await firstResponse.Content.ReadAsByteArrayAsync());
        Assert.Contains("no-store", firstResponse.Headers.CacheControl?.ToString() ?? string.Empty);

        var recorded = Assert.Single(upstreamHandler.Requests);
        Assert.Equal($"https://layers.extremum.org/v3/weather/satellite/polar/{expectedNormalizedPole}.png", recorded.Uri);
        Assert.Matches(
            new Regex("^gis-uuid=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"),
            recorded.Cookie ?? string.Empty);

        var cachedResponse = await client.GetAsync($"/api/weather/satellite/polar/{requestedPole.ToLowerInvariant()}.png");
        Assert.Equal(HttpStatusCode.OK, cachedResponse.StatusCode);
        Assert.Single(upstreamHandler.Requests);
    }

    [Theory]
    [InlineData("/api/weather/satellite/polar/invalid.png")]
    [InlineData("/api/weather/satellite/polar/east.png")]
    public async Task RejectsInvalidPolarHemisphereWithoutCallingUpstream(string path)
    {
        var upstreamHandler = new RecordingUpstreamHandler(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new ByteArrayContent(SamplePngBytes),
        });

        await using var factory = CreateFactory(upstreamHandler);
        using var client = factory.CreateClient();

        var response = await client.GetAsync(path);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Empty(upstreamHandler.Requests);
    }

    [Theory]
    [InlineData(HttpStatusCode.NoContent)]
    [InlineData(HttpStatusCode.NotFound)]
    public async Task PolarCapPassesThroughUpstreamNoContentOrNotFoundAsNoContent(HttpStatusCode upstreamStatus)
    {
        var upstreamHandler = new RecordingUpstreamHandler(_ => new HttpResponseMessage(upstreamStatus));

        await using var factory = CreateFactory(upstreamHandler);
        using var client = factory.CreateClient();

        var firstResponse = await client.GetAsync("/api/weather/satellite/polar/north.png");
        Assert.Equal(HttpStatusCode.NoContent, firstResponse.StatusCode);

        var cachedResponse = await client.GetAsync("/api/weather/satellite/polar/north.png");
        Assert.Equal(HttpStatusCode.NoContent, cachedResponse.StatusCode);
        Assert.Single(upstreamHandler.Requests);
    }

    [Fact]
    public async Task PolarCapReturnsBadGatewayWhenUpstreamFails()
    {
        var upstreamHandler = new RecordingUpstreamHandler(_ => new HttpResponseMessage(HttpStatusCode.InternalServerError));

        await using var factory = CreateFactory(upstreamHandler);
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/api/weather/satellite/polar/south.png");
        Assert.Equal(HttpStatusCode.BadGateway, response.StatusCode);
    }
}
