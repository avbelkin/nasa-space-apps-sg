using System.Collections.Concurrent;
using System.Text.Json;
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

internal sealed class LocalWeatherWorker(
    FirmsClient firms,
    NoaaGfsWeather gfs,
    GfsCloudArchive gfsArchive,
    CopernicusFireWeather fireWeather,
    NoaaSoilMoistureAnomaly soilAnomaly,
    UsfsFuelMoisture fuelMoisture,
    FirestoreWeatherGridStore gridStore,
    LocalWeatherCredentials credentials,
    TimeProvider clock,
    ILogger<LocalWeatherWorker> logger)
{
    private static readonly TimeSpan ScanInterval = TimeSpan.FromMinutes(2);
    private static readonly TimeSpan RetryInterval = TimeSpan.FromMinutes(2);
    private static readonly TimeSpan SuccessCooldown = TimeSpan.FromMinutes(15);
    private static readonly TimeSpan SpotCacheLifetime = TimeSpan.FromSeconds(60);

    private readonly SemaphoreSlim spotsGate = new(1, 1);
    private IReadOnlyList<FirmsHotspot>? cachedSpots;
    private DateTimeOffset spotsFetchedAt = DateTimeOffset.MinValue;

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
                    RunGfsCloudLoopAsync(token),
                    RunProviderLoopAsync(
                        "Copernicus GWIS",
                        CopernicusFireWeather.SamplingGroup,
                        _ => true,
                        (batch, ct) => fireWeather.EnrichAsync(batch, ct),
                        batchSize: 8,
                        token),
                    RunProviderLoopAsync(
                        "NOAA CPC soil anomaly",
                        spot => DateOnly.FromDateTime(spot.AcquiredAtUtc.UtcDateTime),
                        NoaaSoilMoistureAnomaly.InRegion,
                        (batch, ct) => soilAnomaly.EnrichAsync(batch, ct),
                        batchSize: DeferredHotspotWeather.BatchSize,
                        token),
                    RunProviderLoopAsync(
                        "USFS WFAS fuel moisture",
                        spot => DateOnly.FromDateTime(spot.AcquiredAtUtc.UtcDateTime),
                        UsfsFuelMoisture.InRegion,
                        (batch, ct) => fuelMoisture.EnrichAsync(batch, ct),
                        batchSize: DeferredHotspotWeather.BatchSize,
                        token)
                ).ConfigureAwait(false);
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

    private async Task RunGfsCloudLoopAsync(CancellationToken token)
    {
        var activeGrids = new ConcurrentDictionary<string, DateTimeOffset>(StringComparer.Ordinal);
        var preloaded = false;
        while (!token.IsCancellationRequested)
        {
            var scanStart = clock.GetUtcNow();
            try
            {
                if (!preloaded)
                {
                    var active = await gridStore.ListActiveExpirationsAsync(scanStart, token).ConfigureAwait(false);
                    foreach (var pair in active) activeGrids[pair.Key] = pair.Value;
                    preloaded = true;
                    logger.LogInformation("Loaded {Count} unexpired weather grids from Firestore.", activeGrids.Count);
                }

                await ScanGfsCloudAsync(activeGrids, token).ConfigureAwait(false);
            }
            catch (Exception error) when (!token.IsCancellationRequested && IsTransient(error))
            {
                logger.LogWarning("GFS cloud scan will resume after a failure: {Message}", error.Message);
                await Task.Delay(TimeSpan.FromSeconds(15), token).ConfigureAwait(false);
                continue;
            }

            var delay = scanStart + ScanInterval - clock.GetUtcNow();
            if (delay > TimeSpan.Zero) await Task.Delay(delay, token).ConfigureAwait(false);
        }
    }

    internal async Task ScanGfsCloudAsync(ConcurrentDictionary<string, DateTimeOffset> activeGrids, CancellationToken token)
    {
        var spots = await GetLiveSpotsAsync(token).ConfigureAwait(false);
        var now = clock.GetUtcNow();
        foreach (var pair in activeGrids)
        {
            if (pair.Value <= now) activeGrids.TryRemove(pair.Key, out _);
        }

        var eligible = spots.Where(spot => spot.AcquiredAtUtc <= now && WeatherSpotKey.From(spot).ExpiresAt > now).ToArray();
        var hourAcquisitions = eligible
            .Select(spot => (Hour: NoaaGfsWeather.SamplingGroup(spot).Hour, spot.AcquiredAtUtc))
            .Distinct()
            .ToArray();

        var resolvedWeather = new ConcurrentDictionary<(DateTimeOffset Hour, DateTimeOffset Acquired), NoaaGfsWeather.PublishedFrame?>();
        var resolvedSnow = new ConcurrentDictionary<(DateTimeOffset Hour, DateTimeOffset Acquired), NoaaGfsWeather.PublishedFrame?>();
        await Parallel.ForEachAsync(hourAcquisitions, new ParallelOptions
        {
            MaxDegreeOfParallelism = 8,
            CancellationToken = token,
        }, async (item, ct) =>
        {
            var weatherTask = gfs.ResolvePublishedFrameAsync(item.Hour, item.AcquiredAtUtc, false, ct);
            var snowTask = gfs.ResolvePublishedFrameAsync(item.Hour, item.AcquiredAtUtc, true, ct);
            await Task.WhenAll(weatherTask, snowTask).ConfigureAwait(false);
            resolvedWeather[item] = await weatherTask;
            resolvedSnow[item] = await snowTask;
        }).ConfigureAwait(false);

        var distinctGroups = eligible
            .Select(spot => (Group: NoaaGfsWeather.SamplingGroup(spot), spot.AcquiredAtUtc))
            .Distinct();
        var missingById = new Dictionary<string, PlannedGfsTile>(StringComparer.Ordinal);

        foreach (var (group, acquired) in distinctGroups)
        {
            var expires = group.Hour.AddHours(25);
            if (expires <= now) continue;

            if (resolvedWeather.TryGetValue((group.Hour, acquired), out var weatherFrame) && weatherFrame is not null)
                AddIfMissing(group.West, group.South, weatherFrame, group.Hour, expires, false);
            if (resolvedSnow.TryGetValue((group.Hour, acquired), out var snowFrame) && snowFrame is not null)
                AddIfMissing(group.West, group.South, snowFrame, group.Hour, expires, true);
        }

        void AddIfMissing(int west, int south, NoaaGfsWeather.PublishedFrame frame, DateTimeOffset valid, DateTimeOffset expires, bool isSnow)
        {
            var url = NoaaGfsWeather.BuildUrl(west, south, frame.Run, valid, isSnow);
            var gridId = FirestoreWeatherGridStore.GridId(url);
            if (activeGrids.TryGetValue(gridId, out var knownExpires) && knownExpires > now) return;
            missingById.TryAdd(gridId, new PlannedGfsTile(gridId, url, west, south, frame.Run, valid, frame.Published, expires, isSnow));
        }

        var fileGroups = missingById.Values
            .GroupBy(tile => new ForecastFileKey(tile.Run, tile.Valid, tile.IsSnow))
            .OrderByDescending(group => group.Key.Valid)
            .ThenBy(group => group.Key.IsSnow)
            .ToArray();

        var totalWritten = 0;
        await Parallel.ForEachAsync(fileGroups, new ParallelOptions
        {
            MaxDegreeOfParallelism = 2,
            CancellationToken = token,
        }, async (group, ct) =>
        {
            var key = group.Key;
            var tiles = group.ToArray();
            var filename = NoaaGfsWeather.ObjectFilename(key.Run, key.Valid, key.IsSnow);
            try
            {
                var downloaded = await gfsArchive.DownloadHourAsync(key.Run, key.Valid, key.IsSnow, ct).ConfigureAwait(false);
                if (downloaded is null) return;

                var items = new List<FirestoreWeatherGridStore.BatchWriteItem>(tiles.Length);
                var writeIds = new List<(string GridId, DateTimeOffset Expires)>(tiles.Length);
                var slicedAt = clock.GetUtcNow();
                foreach (var tile in tiles)
                {
                    if (tile.Expires <= slicedAt) continue;
                    var bytes = GfsGribSubset.SliceToSimpleGrib2(downloaded.Fields, tile.West, tile.South);
                    var parsed = GfsGribSubset.Parse(bytes);
                    if (!parsed.Values.Any(frame => frame.Run == tile.Run && frame.End == tile.Valid))
                        throw new InvalidDataException($"Sliced GFS tile {tile.West},{tile.South} failed round-trip validation for {tile.Valid:O}.");
                    var grid = new EncodedWeatherGrid(bytes, downloaded.FetchedAt, downloaded.ModifiedAt ?? tile.Published);
                    items.Add(new FirestoreWeatherGridStore.BatchWriteItem(tile.Url, grid, tile.Expires));
                    writeIds.Add((tile.GridId, tile.Expires));
                }
                if (items.Count == 0) return;

                var written = await gridStore.WriteBatchAsync(items, ct).ConfigureAwait(false);
                foreach (var (id, expires) in writeIds) activeGrids[id] = expires;
                Interlocked.Add(ref totalWritten, written);
                logger.LogInformation("GFS cloud file {File}: backfilled {Written}/{Planned} tiles.",
                    filename, written, items.Count);
            }
            catch (Exception error) when (!token.IsCancellationRequested && IsTransient(error))
            {
                logger.LogWarning("Skipping GFS cloud file {File} after error: {Message}", filename, error.Message);
            }
        }).ConfigureAwait(false);

        logger.LogInformation(
            "GFS cloud scan complete: {Eligible} live detections, {Missing} missing tiles across {Files} forecast files, {Written} written.",
            eligible.Length, missingById.Count, fileGroups.Length, totalWritten);
    }

    private async Task RunProviderLoopAsync<TGroup>(
        string providerName,
        Func<FirmsHotspot, TGroup> groupBy,
        Func<FirmsHotspot, bool> filter,
        Func<IReadOnlyList<FirmsHotspot?>, CancellationToken, Task<HotspotWeatherSource?[]>> enrichAsync,
        int batchSize,
        CancellationToken token) where TGroup : notnull
    {
        var nextChecks = new Dictionary<TGroup, DateTimeOffset>();
        while (!token.IsCancellationRequested)
        {
            var scanStart = clock.GetUtcNow();
            try
            {
                var spots = await GetLiveSpotsAsync(token).ConfigureAwait(false);
                var now = clock.GetUtcNow();
                var eligible = spots.Where(spot => spot.AcquiredAtUtc <= now && WeatherSpotKey.From(spot).ExpiresAt > now).ToArray();
                var liveGroups = eligible.Where(filter).Select(groupBy).ToHashSet();
                foreach (var stale in nextChecks.Keys.Where(key => !liveGroups.Contains(key)).ToArray())
                    nextChecks.Remove(stale);

                var refreshAt = now + ScanInterval;
                var checkedGroups = 0;
                foreach (var batch in PlanDailyBatches(eligible, groupBy, filter, nextChecks, now, batchSize))
                {
                    var results = await enrichAsync(batch, token).ConfigureAwait(false);
                    var checkedAt = clock.GetUtcNow();
                    for (var i = 0; i < batch.Length; i++)
                    {
                        var source = i < results.Length ? results[i] : null;
                        var cooldown = source is not null && !WeatherCacheEntry.NeedsRetry(source)
                            ? SuccessCooldown
                            : RetryInterval;
                        nextChecks[groupBy(batch[i])] = checkedAt + cooldown;
                    }
                    checkedGroups += batch.Length;
                    if (clock.GetUtcNow() >= refreshAt) break;
                }

                logger.LogInformation("{Provider} scan: {Eligible} live detections, {Groups} tiles checked.",
                    providerName, eligible.Length, checkedGroups);
            }
            catch (Exception error) when (!token.IsCancellationRequested && IsTransient(error))
            {
                logger.LogWarning("{Provider} scan will resume after a failure: {Message}", providerName, error.Message);
                await Task.Delay(TimeSpan.FromSeconds(15), token).ConfigureAwait(false);
                continue;
            }

            var delay = scanStart + ScanInterval - clock.GetUtcNow();
            if (delay > TimeSpan.Zero) await Task.Delay(delay, token).ConfigureAwait(false);
        }
    }

    private async Task<IReadOnlyList<FirmsHotspot>> GetLiveSpotsAsync(CancellationToken token)
    {
        var now = clock.GetUtcNow();
        if (cachedSpots is { } cached && now - spotsFetchedAt < SpotCacheLifetime) return cached;
        await spotsGate.WaitAsync(token).ConfigureAwait(false);
        try
        {
            now = clock.GetUtcNow();
            if (cachedSpots is { } latest && now - spotsFetchedAt < SpotCacheLifetime) return latest;
            var fetched = await firms.GetWorldwideWeatherSpotsAsync(token).ConfigureAwait(false);
            cachedSpots = fetched;
            spotsFetchedAt = clock.GetUtcNow();
            return fetched;
        }
        finally
        {
            spotsGate.Release();
        }
    }

    private static bool IsTransient(Exception error) => error is HttpRequestException or IOException or
        JsonException or OperationCanceledException or InvalidOperationException or InvalidDataException;

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

    internal static IEnumerable<FirmsHotspot[]> PlanDailyBatches<TGroup>(
        IEnumerable<FirmsHotspot> spots,
        Func<FirmsHotspot, TGroup> groupBy,
        Func<FirmsHotspot, bool> filter,
        IReadOnlyDictionary<TGroup, DateTimeOffset> known,
        DateTimeOffset now,
        int batchSize = DeferredHotspotWeather.BatchSize) where TGroup : notnull
    {
        return spots.Where(filter)
            .OrderByDescending(spot => spot.AcquiredAtUtc)
            .DistinctBy(groupBy)
            .Select(spot => (Spot: spot, Seen: known.TryGetValue(groupBy(spot), out var retryAt), RetryAt: retryAt))
            .Where(item => !item.Seen || item.RetryAt <= now)
            .OrderBy(item => item.Seen)
            .ThenByDescending(item => item.Spot.AcquiredAtUtc)
            .Select(item => item.Spot)
            .Chunk(batchSize);
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

    private sealed record ForecastFileKey(DateTimeOffset Run, DateTimeOffset Valid, bool IsSnow);

    private sealed record PlannedGfsTile(
        string GridId,
        string Url,
        int West,
        int South,
        DateTimeOffset Run,
        DateTimeOffset Valid,
        DateTimeOffset Published,
        DateTimeOffset Expires,
        bool IsSnow);
}
