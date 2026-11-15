using System.Threading.Channels;
using NasaSpaceApps.Api.Firms;

namespace NasaSpaceApps.Api.Weather;

public sealed record HotspotWeatherProgress(string Status, int SampledCount, int TargetCount, int EligibleCount)
{
    public int PendingCount => TargetCount - SampledCount;
    public int AvailableCount { get; init; }
    public int RetryCount { get; init; }
    public HotspotWeatherCoverage? Coverage { get; init; }
}

public sealed record HotspotWeatherCoverage(int GridCount, DateTimeOffset CheckedAtUtc);

internal sealed class DeferredHotspotWeather(
    NoaaGfsWeather forecasts,
    CopernicusFireWeather fireWeather,
    NoaaSoilMoistureAnomaly soilAnomaly,
    UsfsFuelMoisture fuelMoisture,
    WeatherSampleCache samples,
    TimeProvider clock,
    ILogger<DeferredHotspotWeather> logger) : BackgroundService
{
    internal const int BatchSize = 64;
    private const int MaximumTargets = 512;
    private readonly object gate = new();
    private readonly Dictionary<WeatherSpotKey, Work> inProgress = [];
    private readonly Channel<Work> queue = Channel.CreateBounded<Work>(new BoundedChannelOptions(4) { SingleReader = true });

    internal async Task<HotspotWeatherProgress> ObserveAsync(IReadOnlyList<FirmsHotspot> spots, DateTimeOffset now,
        bool enrich, CancellationToken token, bool includeCoverage = false)
    {
        var eligible = spots.Where(spot => Key(spot).ExpiresAt > now && spot.AcquiredAtUtc <= now)
            .OrderByDescending(spot => spot.AcquiredAtUtc).DistinctBy(Key).ToArray();
        var targets = eligible.Take(MaximumTargets).ToArray();
        var coverage = includeCoverage ? samples.GetCoverageAsync(token) : null;
        Work? work = null;
        if (enrich)
        {
            lock (gate)
            {
                // Give new spots a first pass before retrying incomplete results.
                var next = targets.Select(spot => (Spot: spot, Entry: Read(spot)))
                    .Where(item => !inProgress.ContainsKey(Key(item.Spot)) && (item.Entry?.ShouldRetry(now) ?? true))
                    .OrderBy(item => item.Entry?.RetryAt)
                    // Keep adjacent points at the same forecast hour together within a pass.
                    .GroupBy(item => (Retry: item.Entry is not null, Group: NoaaGfsWeather.SamplingGroup(item.Spot)))
                    .SelectMany(group => group).Take(BatchSize).Select(item => item.Spot).ToArray();
                work = Enqueue(next);
                work ??= targets.Select(spot => inProgress.GetValueOrDefault(Key(spot))).FirstOrDefault(active => active is not null);
            }
        }
        if (work is not null)
        {
            try { await work.Completed.Task.WaitAsync(TimeSpan.FromSeconds(1), token).ConfigureAwait(false); }
            catch (TimeoutException) { }
        }

        var results = targets.Select(Read).OfType<WeatherCacheEntry>().ToArray();
        var sampled = results.Length;
        var retries = results.Count(result => result.RetryAt.HasValue);
        return new HotspotWeatherProgress(sampled < targets.Length || retries > 0 ? "pending" :
            targets.Length < eligible.Length ? "partial" : "ready", sampled, targets.Length, eligible.Length)
        {
            AvailableCount = results.Count(result => result.Sources.HasData),
            RetryCount = retries,
            Coverage = coverage is null ? null : await coverage.ConfigureAwait(false),
        };
    }

    internal async Task<GridSources?[]> GetAsync(IReadOnlyList<FirmsHotspot?> spots, CancellationToken token)
    {
        var requested = spots.OfType<FirmsHotspot>().DistinctBy(Key).ToArray();
        Task[] running;
        lock (gate)
            running = spots.OfType<FirmsHotspot>().Select(spot => inProgress.GetValueOrDefault(Key(spot)))
                .OfType<Work>().Distinct().Select(work => (Task)work.Completed.Task).ToArray();
        if (running.Length > 0)
        {
            try { await Task.WhenAll(running).WaitAsync(TimeSpan.FromSeconds(1), token).ConfigureAwait(false); }
            catch (TimeoutException) { }
        }
        var now = clock.GetUtcNow();
        var live = requested.Where(spot => Key(spot).ExpiresAt > now).Select(spot => (Spot: spot, Entry: Read(spot))).ToArray();
        lock (gate)
        {
            Enqueue(live.Where(item => item.Entry?.ShouldRetry(now) == true && !inProgress.ContainsKey(Key(item.Spot)))
                .Select(item => item.Spot).ToArray());
        }
        var missing = live.Where(item => item.Entry is null).Select(item => item.Spot).ToArray();
        var loaded = missing.Length == 0 ? null : await LoadAsync(missing, token).ConfigureAwait(false);
        return spots.Select(spot => spot is null ? null : Read(spot)?.Sources ?? loaded?.GetValueOrDefault(Key(spot))?.Sources)
            .ToArray();
    }

    // Called under the gate so observers and pinned requests share queued work.
    private Work? Enqueue(FirmsHotspot[] spots)
    {
        if (spots.Length == 0) return null;
        var work = new Work(spots);
        if (!queue.Writer.TryWrite(work)) return null;
        foreach (var spot in spots) inProgress.Add(Key(spot), work);
        return work;
    }

    private async Task<Dictionary<WeatherSpotKey, WeatherCacheEntry>> LoadAsync(IReadOnlyList<FirmsHotspot> spots, CancellationToken token)
    {
        var result = await SampleAsync(spots, token).ConfigureAwait(false);
        samples.Save(result);
        return result;
    }

    internal async Task<Dictionary<WeatherSpotKey, WeatherCacheEntry>> SampleAsync(IReadOnlyList<FirmsHotspot> spots, CancellationToken token)
    {
        var forecast = forecasts.EnrichAsync(spots, token);
        var danger = fireWeather.EnrichAsync(spots, token);
        var anomaly = soilAnomaly.EnrichAsync(spots, token);
        var fuel = fuelMoisture.EnrichAsync(spots, token);
        await Task.WhenAll(forecast, danger, anomaly, fuel).ConfigureAwait(false);
        var forecastsBySpot = await forecast;
        var dangersBySpot = await danger;
        var anomaliesBySpot = await anomaly;
        var fuelsBySpot = await fuel;
        var result = new Dictionary<WeatherSpotKey, WeatherCacheEntry>(spots.Count);
        var now = clock.GetUtcNow();
        for (var i = 0; i < spots.Count; i++)
        {
            var sources = new GridSources(forecastsBySpot[i], dangersBySpot[i]!, anomaliesBySpot[i]!, fuelsBySpot[i]!);
            result[Key(spots[i])] = WeatherCacheEntry.FromSample(sources, now);
        }
        return result;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var work in queue.Reader.ReadAllAsync(stoppingToken))
        {
            try { await LoadAsync(work.Spots, stoppingToken).ConfigureAwait(false); }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { return; }
            catch (Exception error) { logger.LogWarning(error, "Deferred weather pass failed for {Count} hotspots.", work.Spots.Length); }
            finally
            {
                lock (gate)
                    foreach (var spot in work.Spots) inProgress.Remove(Key(spot));
                work.Completed.TrySetResult();
            }
        }
    }

    private WeatherCacheEntry? Read(FirmsHotspot spot) => samples.Read(Key(spot));
    private static WeatherSpotKey Key(FirmsHotspot spot) => WeatherSpotKey.From(spot);
    private sealed record Work(FirmsHotspot[] Spots)
    {
        public TaskCompletionSource Completed { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
    }

    internal sealed record GridSources(HotspotWeatherSource[] Forecast, HotspotWeatherSource Danger,
        HotspotWeatherSource SoilAnomaly, HotspotWeatherSource Fuel)
    {
        internal IEnumerable<HotspotWeatherSource> All => [.. Forecast, Danger, SoilAnomaly, Fuel];
        internal bool HasData => All.Any(source => source.Values.Values.Any(value => value.Value.HasValue));
    }
}
