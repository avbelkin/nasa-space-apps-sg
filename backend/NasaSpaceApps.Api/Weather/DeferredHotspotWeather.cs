using System.Threading.Channels;
using Microsoft.Extensions.Caching.Memory;
using NasaSpaceApps.Api.Firms;

namespace NasaSpaceApps.Api.Weather;

public sealed record HotspotWeatherProgress(string Status, int SampledCount, int TargetCount, int EligibleCount);

internal sealed class DeferredHotspotWeather(
    NoaaGfsWeather forecasts,
    CopernicusFireWeather fireWeather,
    NoaaSoilMoistureAnomaly soilAnomaly,
    UsfsFuelMoisture fuelMoisture,
    NoaaMrmsRadar radar,
    NoaaGoesWeather goes,
    ILogger<DeferredHotspotWeather> logger) : BackgroundService
{
    private const int BatchSize = 64;
    private const int MaximumTargets = 512;
    private readonly MemoryCache samples = new(new MemoryCacheOptions { SizeLimit = 4096 });
    private readonly object gate = new();
    private readonly Dictionary<SpotKey, Work> inProgress = [];
    private readonly Channel<Work> queue = Channel.CreateBounded<Work>(new BoundedChannelOptions(4) { SingleReader = true });

    internal async Task<HotspotWeatherProgress> ObserveAsync(IReadOnlyList<FirmsHotspot> spots, DateTimeOffset now, CancellationToken token)
    {
        var eligible = spots.Where(spot => spot.AcquiredAtUtc >= now.AddHours(-24) && spot.AcquiredAtUtc <= now)
            .OrderByDescending(spot => spot.AcquiredAtUtc).DistinctBy(Key).ToArray();
        var targets = eligible.Take(MaximumTargets).ToArray();
        Work? work = null;
        lock (gate)
        {
            var next = targets.Where(spot => !inProgress.ContainsKey(Key(spot)) && Read(spot) is null)
                // Keep adjacent points at the same forecast hour together within a pass.
                .GroupBy(spot => NoaaGfsWeather.SamplingGroup(spot))
                .SelectMany(group => group).Take(BatchSize).ToArray();
            if (next.Length > 0)
            {
                var candidate = new Work(next);
                if (queue.Writer.TryWrite(candidate))
                {
                    foreach (var spot in next) inProgress.Add(Key(spot), candidate);
                    work = candidate;
                }
            }
            work ??= targets.Select(spot => inProgress.GetValueOrDefault(Key(spot))).FirstOrDefault(active => active is not null);
        }
        if (work is not null)
        {
            try { await work.Completed.Task.WaitAsync(TimeSpan.FromSeconds(1), token).ConfigureAwait(false); }
            catch (TimeoutException) { }
        }

        var sampled = targets.Count(spot => Read(spot) is not null);
        return new HotspotWeatherProgress(sampled < targets.Length ? "pending" :
            targets.Length < eligible.Length ? "partial" : "ready", sampled, targets.Length, eligible.Length);
    }

    internal async Task<GridSources?[]> GetAsync(IReadOnlyList<FirmsHotspot?> spots, CancellationToken token)
    {
        Task[] running;
        lock (gate)
            running = spots.OfType<FirmsHotspot>().Select(spot => inProgress.GetValueOrDefault(Key(spot)))
                .OfType<Work>().Distinct().Select(work => (Task)work.Completed.Task).ToArray();
        if (running.Length > 0)
        {
            try { await Task.WhenAll(running).WaitAsync(TimeSpan.FromSeconds(1), token).ConfigureAwait(false); }
            catch (TimeoutException) { }
        }
        var result = spots.Select(spot => spot is null ? null : Read(spot)).ToArray();
        var missing = Enumerable.Range(0, spots.Count).Where(index => spots[index] is not null && result[index] is null).ToArray();
        if (missing.Length == 0) return result;
        var values = await LoadAsync(missing.Select(index => spots[index]!).ToArray(), token).ConfigureAwait(false);
        for (var i = 0; i < missing.Length; i++) result[missing[i]] = values[i];
        return result;
    }

    private async Task<GridSources[]> LoadAsync(IReadOnlyList<FirmsHotspot> spots, CancellationToken token)
    {
        var forecast = forecasts.EnrichAsync(spots, token);
        var danger = fireWeather.EnrichAsync(spots, token);
        var anomaly = soilAnomaly.EnrichAsync(spots, token);
        var fuel = fuelMoisture.EnrichAsync(spots, token);
        var radarTask = radar.EnrichAsync(spots, token);
        var goesTask = goes.EnrichAsync(spots, token);
        await Task.WhenAll(forecast, danger, anomaly, fuel, radarTask, goesTask).ConfigureAwait(false);
        var forecastsBySpot = await forecast;
        var dangersBySpot = await danger;
        var anomaliesBySpot = await anomaly;
        var fuelsBySpot = await fuel;
        var radarBySpot = await radarTask;
        var goesBySpot = await goesTask;
        var result = new GridSources[spots.Count];
        for (var i = 0; i < result.Length; i++)
        {
            var sources = new GridSources(forecastsBySpot[i], dangersBySpot[i]!, anomaliesBySpot[i]!, fuelsBySpot[i]!,
                radarBySpot[i], goesBySpot[i]);
            result[i] = sources;
            // Retry upstream failures on a later pass without blocking the current snapshot.
            var lifetime = sources.All.Any(source => source.Status == "source_unavailable")
                ? TimeSpan.FromMinutes(2) : TimeSpan.FromMinutes(30);
            samples.Set(Key(spots[i]), sources, new MemoryCacheEntryOptions
            {
                Size = 1,
                AbsoluteExpirationRelativeToNow = lifetime,
            });
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

    public override void Dispose()
    {
        base.Dispose();
        samples.Dispose();
    }

    private GridSources? Read(FirmsHotspot spot) => samples.Get<GridSources>(Key(spot));
    private static SpotKey Key(FirmsHotspot spot) => new(spot.Latitude, spot.Longitude, spot.AcquiredAtUtc);
    private readonly record struct SpotKey(double Latitude, double Longitude, DateTimeOffset Acquired);
    private sealed record Work(FirmsHotspot[] Spots)
    {
        public TaskCompletionSource Completed { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
    }

    internal sealed record GridSources(HotspotWeatherSource[] Forecast, HotspotWeatherSource Danger,
        HotspotWeatherSource SoilAnomaly, HotspotWeatherSource Fuel, HotspotWeatherSource? Radar, HotspotWeatherSource[] Goes)
    {
        internal IEnumerable<HotspotWeatherSource> All => [.. Forecast, Danger, SoilAnomaly, Fuel, .. Goes];
    }
}
