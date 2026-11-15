using NasaSpaceApps.Api.Firms;

namespace NasaSpaceApps.Api.Weather;

internal sealed class LocalWeatherCredentials(string project, string database)
{
    private string? token;
    internal string Project { get; } = project;
    internal string Database { get; } = database;
    internal string Token => Volatile.Read(ref token) ?? throw new InvalidOperationException("Google access token is missing.");

    internal static LocalWeatherCredentials? Parse(string[] args)
    {
        if (args.Length == 0 || args[0] != "weather-worker") return null;
        if (args.Length != 3 || string.IsNullOrWhiteSpace(args[1]) || string.IsNullOrWhiteSpace(args[2]))
            throw new ArgumentException("Usage: weather-worker <Google Cloud project> <Firestore database>. Supply Google OAuth access tokens on standard input.");
        return new(args[1], args[2]);
    }

    internal void Update(string accessToken) => Volatile.Write(ref token, accessToken.Trim());
}

internal sealed class LocalWeatherWorker(FirmsClient firms, DeferredHotspotWeather sampler,
    LocalWeatherCredentials credentials, TimeProvider clock, ILogger<LocalWeatherWorker> logger)
{
    private static readonly TimeSpan ScanInterval = TimeSpan.FromMinutes(2);
    private readonly Dictionary<GridWorkKey, DateTimeOffset> nextChecks = [];

    internal async Task RunAsync()
    {
        using var stop = new CancellationTokenSource();
        using var input = new StreamReader(Console.OpenStandardInput());
        Console.CancelKeyPress += OnCancel;
        var token = stop.Token;
        try
        {
            var initial = await input.ReadLineAsync(token).ConfigureAwait(false);
            if (string.IsNullOrWhiteSpace(initial)) throw new InvalidOperationException("Supply a Google OAuth access token on standard input.");
            credentials.Update(initial);
            var refresh = RefreshCredentialsAsync();
            logger.LogInformation("Local weather worker started for {Project}/{Database}.", credentials.Project, credentials.Database);
            try
            {
                while (!token.IsCancellationRequested)
                {
                    try { await ScanAsync(token).ConfigureAwait(false); }
                    catch (Exception error) when (!token.IsCancellationRequested && error is HttpRequestException or IOException or
                        System.Text.Json.JsonException or OperationCanceledException or InvalidOperationException)
                    {
                        logger.LogWarning("Local weather scan will resume after a failure: {Message}", error.Message);
                        await Task.Delay(TimeSpan.FromSeconds(15), token).ConfigureAwait(false);
                    }
                }
            }
            finally
            {
                await stop.CancelAsync().ConfigureAwait(false);
                await refresh.ConfigureAwait(false);
            }
        }
        catch (OperationCanceledException) when (token.IsCancellationRequested) { }
        finally { Console.CancelKeyPress -= OnCancel; }

        void OnCancel(object? sender, ConsoleCancelEventArgs args)
        {
            args.Cancel = true;
            stop.Cancel();
        }

        async Task RefreshCredentialsAsync()
        {
            while (await input.ReadLineAsync(token).ConfigureAwait(false) is { } next)
            {
                if (!string.IsNullOrWhiteSpace(next)) credentials.Update(next);
            }
            await stop.CancelAsync().ConfigureAwait(false);
        }
    }

    internal async Task ScanAsync(CancellationToken token)
    {
        var spots = await firms.GetWorldwideWeatherSpotsAsync(token).ConfigureAwait(false);
        var now = clock.GetUtcNow();
        var refreshAt = now + ScanInterval;
        foreach (var key in nextChecks.Keys.Where(key => key.Acquired.AddHours(24) <= now).ToArray())
            nextChecks.Remove(key);
        var eligible = spots.Where(spot => spot.AcquiredAtUtc <= now && WeatherSpotKey.From(spot).ExpiresAt > now)
            .ToArray();
        var groups = 0;
        var selections = 0;

        foreach (var batch in PlanBatches(eligible, nextChecks, now))
        {
            var live = batch.Where(spot => spot.AcquiredAtUtc.AddHours(24) > clock.GetUtcNow()).ToArray();
            if (live.Length == 0) continue;
            var sampled = await sampler.SampleAsync(live, token).ConfigureAwait(false);
            var checkedAt = clock.GetUtcNow();
            foreach (var spot in live)
            {
                var entry = sampled[WeatherSpotKey.From(spot)];
                nextChecks[GridWorkKey.From(spot)] = entry.RetryAt ?? checkedAt.AddMinutes(15);
            }
            groups++;
            selections += live.Length;
            if (clock.GetUtcNow() >= refreshAt) break;
        }

        logger.LogInformation("Local weather scan: {Eligible} live detections, {Groups} grid batches, {Selections} acquisition and coverage selections checked.",
            eligible.Length, groups, selections);
        var delay = refreshAt - clock.GetUtcNow();
        if (delay > TimeSpan.Zero) await Task.Delay(delay, token).ConfigureAwait(false);
    }

    internal static IEnumerable<FirmsHotspot[]> PlanBatches(IEnumerable<FirmsHotspot> spots,
        IReadOnlyDictionary<GridWorkKey, DateTimeOffset> known, DateTimeOffset now)
    {
        return spots.DistinctBy(GridWorkKey.From)
            .Select(spot => (Spot: spot, Seen: known.TryGetValue(GridWorkKey.From(spot), out var retryAt), RetryAt: retryAt))
            .Where(item => !item.Seen || item.RetryAt <= now)
            .OrderBy(item => item.Seen)
            .ThenByDescending(item => item.Spot.AcquiredAtUtc)
            .GroupBy(item => (item.Seen, Tile: NoaaGfsWeather.SamplingGroup(item.Spot)))
            .SelectMany(group => group.Select(item => item.Spot).Chunk(DeferredHotspotWeather.BatchSize));
    }

    internal readonly record struct GridWorkKey(int West, int South, DateTimeOffset Acquired, bool Wfas, bool Cpc, bool AtEastDateline)
    {
        internal static GridWorkKey From(FirmsHotspot spot)
        {
            var (west, south, _) = NoaaGfsWeather.SamplingGroup(spot);
            return new(west, south, spot.AcquiredAtUtc, UsfsFuelMoisture.InRegion(spot), NoaaSoilMoistureAnomaly.InRegion(spot),
                spot.Longitude == 180);
        }
    }
}
