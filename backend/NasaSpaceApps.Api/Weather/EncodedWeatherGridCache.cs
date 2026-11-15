using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;

namespace NasaSpaceApps.Api.Weather;

internal sealed record EncodedWeatherGrid(byte[] Bytes, DateTimeOffset FetchedAt, DateTimeOffset? ModifiedAt);

internal sealed class EncodedWeatherGridCache(FirestoreWeatherGridStore? store, TimeProvider clock,
    ILogger<EncodedWeatherGridCache> logger, LocalWeatherCredentials? local = null)
{
    internal static EncodedWeatherGridCache Disabled { get; } = new(null, TimeProvider.System, NullLogger<EncodedWeatherGridCache>.Instance);
    private long backoffUntil;
    private int reportedHits;

    internal async Task<T> GetAsync<T>(string key, DateTimeOffset expires, Func<CancellationToken, Task<EncodedWeatherGrid>> fetch,
        Func<EncodedWeatherGrid, T> decode, CancellationToken token, Func<T, DateTimeOffset>? expiration = null)
    {
        if (store is null || !store.IsEnabled || (!IsAvailable() && local is null))
            return decode(await fetch(token).ConfigureAwait(false));

        FirestoreWeatherGridStore.StoredWeatherGrid? cached = null;
        try
        {
            cached = await store.ReadAsync(key, token).ConfigureAwait(false);
            if (cached is not null && cached.Expires > clock.GetUtcNow())
            {
                var decodedGrid = decode(cached.Grid);
                if (local is null && Volatile.Read(ref reportedHits) < 16 && Interlocked.Increment(ref reportedHits) <= 16)
                    logger.LogInformation("Reused shared encoded weather grid {Grid} fetched at {FetchedAt:O}.",
                        FirestoreWeatherGridStore.GridId(key), cached.Grid.FetchedAt);
                return decodedGrid;
            }
        }
        catch (InvalidDataException) when (cached is not null)
        {
            // A replacement still uses the document version from the corrupt grid.
        }
        catch (Exception error) when (!token.IsCancellationRequested && IsStoreError(error))
        {
            if (local is not null) throw;
            Warn(error);
        }

        var fresh = await fetch(token).ConfigureAwait(false);
        var decoded = decode(fresh);
        try
        {
            if (IsAvailable() || local is not null)
            {
                var saved = await store.WriteAsync(key, fresh, expiration?.Invoke(decoded) ?? expires, cached?.Version, token).ConfigureAwait(false);
                if (local is not null && saved)
                    logger.LogInformation("Saved encoded weather grid {Grid} ({Bytes} bytes).",
                        FirestoreWeatherGridStore.GridId(key), fresh.Bytes.Length);
            }
        }
        catch (Exception error) when (local is null && !token.IsCancellationRequested && IsStoreError(error)) { Warn(error); }
        return decoded;
    }

    internal async Task<EncodedWeatherGrid> DownloadAsync(HttpClient client, string url, int maximumSize, CancellationToken token)
    {
        using var response = await client.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, token).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();
        await response.Content.LoadIntoBufferAsync(maximumSize, token).ConfigureAwait(false);
        return new EncodedWeatherGrid(await response.Content.ReadAsByteArrayAsync(token).ConfigureAwait(false),
            clock.GetUtcNow(), response.Content.Headers.LastModified);
    }

    private bool IsAvailable() => Volatile.Read(ref backoffUntil) <= clock.GetUtcNow().UtcTicks;

    private void Warn(Exception error)
    {
        var now = clock.GetUtcNow();
        if (Interlocked.Exchange(ref backoffUntil, now.AddSeconds(20).UtcTicks) <= now.UtcTicks)
            logger.LogWarning("Shared encoded weather grid cache is unavailable: {Message}", error.Message);
    }

    internal static bool IsStoreError(Exception error) => error is HttpRequestException or IOException or
        JsonException or FormatException or KeyNotFoundException or OperationCanceledException or InvalidDataException;
}
