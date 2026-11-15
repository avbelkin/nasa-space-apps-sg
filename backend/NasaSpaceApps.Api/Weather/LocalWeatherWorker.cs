using System.Collections.Concurrent;
using System.Threading.Channels;
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

internal sealed class LocalWeatherWorker(FirmsClient firms, NoaaGfsWeather forecasts, CopernicusFireWeather fireWeather,
    NoaaSoilMoistureAnomaly anomaly, UsfsFuelMoisture fuel,
    LocalWeatherCredentials credentials, TimeProvider clock, ILogger<LocalWeatherWorker> logger)
{
    private static readonly TimeSpan ScanInterval = TimeSpan.FromMinutes(2);
    private static readonly TimeSpan RetryInterval = TimeSpan.FromMinutes(2);

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
                await Task.WhenAll(
                    RunProviderAsync(new("GFS", spot => GridWorkKey.From(spot), WarmGfsAsync,
                        (spot, _) => spot.AcquiredAtUtc.AddHours(24)), token),
                    RunProviderAsync(new("Copernicus fire weather", spot => new GridWorkKey(CopernicusFireWeather.SamplingGroup(spot)),
                        (spots, cancel) => WarmAsync(fireWeather.EnrichAsync(spots, cancel)), (_, now) => now.AddMinutes(5)), token),
                    RunProviderAsync(new("NOAA soil moisture", spot => NoaaSoilMoistureAnomaly.InRegion(spot) ? GridWorkKey.CurrentRaster : null,
                        (spots, cancel) => WarmAsync(anomaly.EnrichAsync(spots, cancel)), (_, now) => now.AddMinutes(15)), token),
                    RunProviderAsync(new("Forest Service fuel moisture", spot => UsfsFuelMoisture.InRegion(spot) ? GridWorkKey.CurrentRaster : null,
                        (spots, cancel) => WarmAsync(fuel.EnrichAsync(spots, cancel)), (_, now) => now.AddMinutes(15)), token))
                    .ConfigureAwait(false);
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

    private async Task<bool[]> WarmGfsAsync(FirmsHotspot[] spots, CancellationToken token)
    {
        var results = await forecasts.EnrichAsync(spots, token).ConfigureAwait(false);
        return results.Select(sources => sources.Any(WeatherCacheEntry.NeedsRetry)).ToArray();
    }

    private static async Task<bool[]> WarmAsync(Task<HotspotWeatherSource?[]> pending) =>
        (await pending.ConfigureAwait(false)).Select(source => source is null || WeatherCacheEntry.NeedsRetry(source)).ToArray();

    private Task RunProviderAsync(Provider provider, CancellationToken token)
    {
        var queue = Channel.CreateBounded<FirmsHotspot[]>(new BoundedChannelOptions(4) { SingleReader = true, SingleWriter = true });
        var nextChecks = new ConcurrentDictionary<GridWorkKey, DateTimeOffset>();
        return Task.WhenAll(ProduceAsync(), ConsumeAsync());

        async Task ProduceAsync()
        {
            try
            {
                while (!token.IsCancellationRequested)
                {
                    var refreshAt = clock.GetUtcNow() + ScanInterval;
                    try
                    {
                        var spots = await firms.GetWorldwideWeatherSpotsAsync(token).ConfigureAwait(false);
                        var now = clock.GetUtcNow();
                        foreach (var item in nextChecks.Where(item => item.Value <= now.AddHours(-24)))
                            nextChecks.TryRemove(item);
                        var eligible = spots.Where(spot => IsLive(spot, now));
                        var queued = 0;
                        foreach (var batch in PlanBatches(eligible, nextChecks, now, provider.Select))
                        {
                            foreach (var spot in batch) nextChecks[provider.Select(spot)!.Value] = DateTimeOffset.MaxValue;
                            await queue.Writer.WriteAsync(batch, token).ConfigureAwait(false);
                            queued += batch.Length;
                            if (clock.GetUtcNow() >= refreshAt) break;
                        }
                        logger.LogInformation("Local {Provider} queue added {Count} grid selections.", provider.Name, queued);
                    }
                    catch (Exception error) when (!token.IsCancellationRequested && IsRecoverable(error))
                    {
                        logger.LogWarning("Local {Provider} scan will retry: {Message}", provider.Name, error.Message);
                        refreshAt = clock.GetUtcNow().AddSeconds(15);
                    }
                    var delay = refreshAt - clock.GetUtcNow();
                    if (delay > TimeSpan.Zero) await Task.Delay(delay, token).ConfigureAwait(false);
                }
            }
            finally { queue.Writer.TryComplete(); }
        }

        async Task ConsumeAsync()
        {
            await foreach (var batch in queue.Reader.ReadAllAsync(token))
            {
                var live = batch.Where(spot => IsLive(spot, clock.GetUtcNow())).ToArray();
                foreach (var spot in batch.Except(live)) nextChecks.TryRemove(provider.Select(spot)!.Value, out _);
                if (live.Length == 0) continue;
                try
                {
                    var retry = await provider.Warm(live, token).ConfigureAwait(false);
                    var now = clock.GetUtcNow();
                    for (var index = 0; index < live.Length; index++)
                        nextChecks[provider.Select(live[index])!.Value] = retry[index] ? now + RetryInterval : provider.Refresh(live[index], now);
                }
                catch (Exception error) when (!token.IsCancellationRequested && IsRecoverable(error))
                {
                    var next = clock.GetUtcNow() + RetryInterval;
                    foreach (var spot in live) nextChecks[provider.Select(spot)!.Value] = next;
                    logger.LogWarning("Local {Provider} grid fetch will retry: {Message}", provider.Name, error.Message);
                }
            }
        }
    }

    internal static IEnumerable<FirmsHotspot[]> PlanBatches(IEnumerable<FirmsHotspot> spots,
        IReadOnlyDictionary<GridWorkKey, DateTimeOffset> known, DateTimeOffset now, Func<FirmsHotspot, GridWorkKey?>? select = null)
    {
        select ??= spot => GridWorkKey.From(spot);
        return spots.OrderByDescending(spot => spot.AcquiredAtUtc)
            .Select(spot => (Spot: spot, Key: select(spot)))
            .Where(item => item.Key.HasValue).DistinctBy(item => item.Key)
            .Select(item => (item.Spot, Key: item.Key!.Value, Seen: known.TryGetValue(item.Key.Value, out var retryAt), RetryAt: retryAt))
            .Where(item => !item.Seen || item.RetryAt <= now)
            .OrderBy(item => item.Seen)
            .GroupBy(item => (item.Seen, item.Key.Group))
            .SelectMany(group => group.Select(item => item.Spot).Chunk(DeferredHotspotWeather.BatchSize));
    }

    private static bool IsLive(FirmsHotspot spot, DateTimeOffset now) => spot.AcquiredAtUtc <= now && spot.AcquiredAtUtc.AddHours(24) > now;

    private static bool IsRecoverable(Exception error) => EncodedWeatherGridCache.IsStoreError(error) || error is InvalidOperationException;

    private sealed record Provider(string Name, Func<FirmsHotspot, GridWorkKey?> Select,
        Func<FirmsHotspot[], CancellationToken, Task<bool[]>> Warm, Func<FirmsHotspot, DateTimeOffset, DateTimeOffset> Refresh);

    internal readonly record struct GridWorkKey((int West, int South, DateTimeOffset Hour) Group,
        DateTimeOffset Acquired = default, int FallbackWest = 0, int FallbackSouth = 0)
    {
        internal static GridWorkKey CurrentRaster { get; } = new((0, 0, DateTimeOffset.UnixEpoch));

        internal static GridWorkKey From(FirmsHotspot spot)
        {
            var (fineWest, fineSouth, _) = NoaaGfsWeather.FallbackGroup(spot);
            return new(NoaaGfsWeather.SamplingGroup(spot), spot.AcquiredAtUtc, fineWest, fineSouth);
        }
    }
}
