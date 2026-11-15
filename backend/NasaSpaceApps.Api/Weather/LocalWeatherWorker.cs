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
    ISharedWeatherSampleStore shared, LocalWeatherCredentials credentials, TimeProvider clock, ILogger<LocalWeatherWorker> logger)
{
    private static readonly TimeSpan ScanInterval = TimeSpan.FromMinutes(2);
    private readonly Dictionary<WeatherSpotKey, DateTimeOffset?> known = [];

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
        foreach (var key in known.Keys.Where(key => key.ExpiresAt <= now).ToArray()) known.Remove(key);
        var eligible = spots.Where(spot => spot.AcquiredAtUtc <= now && WeatherSpotKey.From(spot).ExpiresAt > now)
            .DistinctBy(WeatherSpotKey.From).ToArray();
        var inspected = 0;
        var written = 0;
        var available = 0;

        foreach (var batch in PlanBatches(eligible, known, now))
        {
            var candidates = batch.Where(spot => WeatherSpotKey.From(spot).ExpiresAt > clock.GetUtcNow())
                .ToDictionary(WeatherSpotKey.From);
            if (candidates.Count == 0) continue;
            var previous = await shared.ReadAsync(candidates.Keys.ToArray(), token).ConfigureAwait(false);
            inspected += candidates.Count;
            foreach (var (key, entry) in previous) known[key] = entry.RetryAt;
            var missing = candidates.Where(item => !previous.TryGetValue(item.Key, out var entry) ||
                entry.ShouldRetry(clock.GetUtcNow())).Select(item => item.Value).ToArray();
            if (missing.Length > 0)
            {
                var sampled = await sampler.SampleAsync(missing, token).ConfigureAwait(false);
                var stored = await shared.WriteAsync(sampled, token).ConfigureAwait(false);
                foreach (var (key, entry) in stored) known[key] = entry.RetryAt;
                written += stored.Count;
                available += stored.Values.Count(entry => entry.Sources.HasData);
            }
            if (clock.GetUtcNow() >= refreshAt) break;
        }

        logger.LogInformation("Local weather scan: {Eligible} live spots, {Known} cache entries seen, {Checked} checked in Firestore, {Written} saved ({Available} with data).",
            eligible.Length, eligible.Count(spot => known.ContainsKey(WeatherSpotKey.From(spot))), inspected, written, available);
        var delay = refreshAt - clock.GetUtcNow();
        if (delay > TimeSpan.Zero) await Task.Delay(delay, token).ConfigureAwait(false);
    }

    internal static IEnumerable<FirmsHotspot[]> PlanBatches(IEnumerable<FirmsHotspot> spots,
        IReadOnlyDictionary<WeatherSpotKey, DateTimeOffset?> known, DateTimeOffset now)
    {
        return spots.Select(spot => (Spot: spot, Seen: known.TryGetValue(WeatherSpotKey.From(spot), out var retryAt), RetryAt: retryAt))
            .Where(item => !item.Seen || item.RetryAt <= now)
            .OrderBy(item => item.Seen)
            .ThenByDescending(item => item.Spot.AcquiredAtUtc)
            .GroupBy(item => (item.Seen, Tile: NoaaGfsWeather.SamplingGroup(item.Spot)))
            .SelectMany(group => group.Select(item => item.Spot).Chunk(DeferredHotspotWeather.BatchSize));
    }
}
