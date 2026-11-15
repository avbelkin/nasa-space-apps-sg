using System.Threading.Channels;
using Microsoft.Extensions.Caching.Memory;
using NasaSpaceApps.Api.Satellites;

namespace NasaSpaceApps.Api.Firms;

public sealed record HotspotGeometryBatch(string Status, IReadOnlyList<HotspotGeometry?>? Spots);
public sealed record HotspotGeometryProgress(string Status, int TotalCount, int ReadyCount, int PendingCount);

public sealed class HotspotGeometryWorker(
    CelesTrakTleDownloader tleDownloader,
    IMemoryCache cache,
    ILogger<HotspotGeometryWorker> logger) : BackgroundService
{
    private static readonly TimeSpan ResultLifetime = TimeSpan.FromMinutes(20);
    private static readonly TimeSpan FailureBackoff = TimeSpan.FromMinutes(2);
    private static readonly TimeSpan ResponseWait = TimeSpan.FromSeconds(1);
    private readonly object _scheduleLock = new();
    private readonly Channel<Work> _queue = Channel.CreateBounded<Work>(new BoundedChannelOptions(8)
    {
        SingleReader = true,
    });

    private sealed record Work(IReadOnlyList<FirmsHotspot> Snapshot)
    {
        public int ProcessedCount;
        public TaskCompletionSource<Dictionary<FirmsHotspot, HotspotGeometry>?> Completion { get; } =
            new(TaskCreationOptions.RunContinuationsAsynchronously);
    }

    internal HotspotGeometryProgress GetProgress(IReadOnlyList<FirmsHotspot> snapshot, IReadOnlyList<FirmsHotspot> selected)
    {
        if (selected.Count == 0) return new("ready", 0, 0, 0);
        if (!cache.TryGetValue(CacheKey(snapshot), out Work? work) || work is null)
            return new("pending", selected.Count, 0, selected.Count);
        if (work.Completion.Task.IsCompletedSuccessfully)
        {
            var results = work.Completion.Task.Result;
            return results is null
                ? new("unavailable", selected.Count, 0, 0)
                : new("ready", selected.Count, selected.Count(results.ContainsKey), 0);
        }
        var scanned = Volatile.Read(ref work.ProcessedCount);
        if (scanned == 0) return new("pending", selected.Count, 0, selected.Count);

        var visible = selected.ToHashSet(ReferenceEqualityComparer.Instance);
        var processed = 0;
        var ready = 0;
        for (var i = 0; i < scanned; i++)
        {
            var spot = snapshot[i];
            if (!visible.Contains(spot)) continue;
            processed++;
            if (CanCalculate(spot)) ready++;
        }
        return new("pending", selected.Count, ready, selected.Count - processed);
    }

    internal async Task<HotspotGeometryBatch?> ObserveAsync(
        IReadOnlyList<FirmsHotspot> snapshot,
        IReadOnlyList<FirmsHotspot> selected,
        bool includeGeometry,
        CancellationToken cancellationToken)
    {
        if (includeGeometry)
        {
            return await GetGeometryAsync(snapshot, selected, cancellationToken).ConfigureAwait(false);
        }

        if (snapshot.Count > 0)
        {
            Schedule(snapshot);
        }
        return null;
    }

    internal async Task<HotspotGeometryBatch> GetGeometryAsync(
        IReadOnlyList<FirmsHotspot> snapshot,
        IReadOnlyList<FirmsHotspot?> selected,
        CancellationToken cancellationToken)
    {
        if (selected.Count == 0)
        {
            return new("ready", []);
        }
        if (Schedule(snapshot) is not { } work)
        {
            return new("pending", null);
        }

        try
        {
            // Opted-in requests can give the worker a short CPU window on Cloud Run.
            // Cancellation or timeout here must not cancel the shared snapshot job.
            var result = await work.Completion.Task.WaitAsync(ResponseWait, cancellationToken).ConfigureAwait(false);
            return result is null
                ? new("unavailable", null)
                : new("ready", selected.Select(spot => spot is null ? null : result.GetValueOrDefault(spot)).ToArray());
        }
        catch (TimeoutException)
        {
            return new("pending", null);
        }
    }

    private Work? Schedule(IReadOnlyList<FirmsHotspot> snapshot)
    {
        lock (_scheduleLock)
        {
            var key = CacheKey(snapshot);
            if (cache.TryGetValue(key, out Work? existing))
            {
                return existing;
            }

            var work = new Work(snapshot);
            if (!_queue.Writer.TryWrite(work))
            {
                return null;
            }
            cache.Set(key, work, ResultLifetime);
            return work;
        }
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var work in _queue.Reader.ReadAllAsync(stoppingToken))
        {
            try
            {
                var fleet = await tleDownloader.GetFleetTlesAsync(stoppingToken).ConfigureAwait(false);
                var calculator = new HotspotGeometryCalculator(fleet);
                var result = new Dictionary<FirmsHotspot, HotspotGeometry>(work.Snapshot.Count, ReferenceEqualityComparer.Instance);
                for (var i = 0; i < work.Snapshot.Count; i++)
                {
                    stoppingToken.ThrowIfCancellationRequested();
                    var spot = work.Snapshot[i];
                    if (CanCalculate(spot))
                    {
                        result[spot] = calculator.Calculate(spot);
                    }
                    Volatile.Write(ref work.ProcessedCount, i + 1);
                }
                work.Completion.TrySetResult(result);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Could not enrich a FIRMS snapshot ({Count} hotspots).", work.Snapshot.Count);
                lock (_scheduleLock)
                {
                    var key = CacheKey(work.Snapshot);
                    if (cache.TryGetValue(key, out Work? active) && ReferenceEquals(work, active))
                    {
                        cache.Set(key, work, FailureBackoff);
                    }
                }
                work.Completion.TrySetResult(null);
            }
        }
    }

    private static object CacheKey(IReadOnlyList<FirmsHotspot> snapshot) => (typeof(HotspotGeometryWorker), snapshot);

    private static bool CanCalculate(FirmsHotspot spot) =>
        spot.Latitude is >= -90 and <= 90 && spot.Longitude is >= -180 and <= 180;
}
