using System.Globalization;
using System.IO.Compression;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace NasaSpaceApps.Api.Weather;

internal sealed class FirestoreWeatherSampleStore(IHttpClientFactory clients, IConfiguration config, TimeProvider clock)
    : ISharedWeatherSampleStore
{
    internal const string HttpClientName = "WeatherFirestore";
    internal const string MetadataHttpClientName = "WeatherFirestoreMetadata";
    internal const string Collection = "hotspotWeatherV1";
    private const int RequestSize = 128;
    private const string Metadata = "http://metadata.google.internal/computeMetadata/v1/";
    private readonly string? database = config["WeatherCache:Database"]?.Trim();
    private readonly SemaphoreSlim identityGate = new(1);
    private Identity? identity;

    public async Task<IReadOnlyDictionary<WeatherSpotKey, WeatherCacheEntry>> ReadAsync(WeatherSpotKey[] keys, CancellationToken token)
    {
        if (string.IsNullOrEmpty(database) || keys.Length == 0) return new Dictionary<WeatherSpotKey, WeatherCacheEntry>();
        var auth = await GetIdentityAsync(token).ConfigureAwait(false);
        var reads = await Task.WhenAll(keys.Chunk(RequestSize).Select(chunk => ReadDocumentsAsync(auth, chunk, token))).ConfigureAwait(false);
        return reads.SelectMany(read => read).ToDictionary(entry => entry.Key, entry => entry.Value.Entry);
    }

    public async Task<IReadOnlyDictionary<WeatherSpotKey, WeatherCacheEntry>> WriteAsync(
        IReadOnlyDictionary<WeatherSpotKey, WeatherCacheEntry> entries, CancellationToken token)
    {
        if (string.IsNullOrEmpty(database) || entries.Count == 0) return entries;
        var auth = await GetIdentityAsync(token).ConfigureAwait(false);
        var result = new Dictionary<WeatherSpotKey, WeatherCacheEntry>();
        var remaining = entries.Keys.ToArray();
        for (var attempt = 0; remaining.Length > 0 && attempt < 3; attempt++)
        {
            var conflicts = new List<WeatherSpotKey>();
            foreach (var batch in remaining.Chunk(RequestSize))
            {
                var current = await ReadDocumentsAsync(auth, batch, token).ConfigureAwait(false);
                var changed = new List<(WeatherSpotKey Key, WeatherCacheEntry Entry, string? Version)>();
                foreach (var key in batch)
                {
                    if (key.ExpiresAt <= clock.GetUtcNow()) continue;
                    var previous = current.GetValueOrDefault(key);
                    var candidate = entries[key];
                    var merged = WeatherCacheEntry.Merge(previous?.Entry, candidate);
                    if (previous is not null && ReferenceEquals(previous.Entry, merged)) result[key] = merged;
                    else changed.Add((key, merged, previous?.Version));
                }
                if (changed.Count == 0) continue;
                var writes = changed.Select(item => new
                {
                    update = new { name = auth.Name(item.Key), fields = new
                    {
                        expireAt = new { timestampValue = item.Key.ExpiresAt.UtcDateTime.ToString("O", CultureInfo.InvariantCulture) },
                        payload = new { bytesValue = Encode(item.Entry) },
                    }},
                    currentDocument = item.Version is null ? (object)new { exists = false } : new { updateTime = item.Version },
                }).ToArray();
                using var json = await SendAsync(auth, "batchWrite", new { writes }, token).ConfigureAwait(false);
                var statuses = json.RootElement.GetProperty("status");
                if (statuses.GetArrayLength() != changed.Count) throw new JsonException("Unexpected Firestore write status count.");
                for (var i = 0; i < changed.Count; i++)
                {
                    var item = changed[i];
                    var code = statuses[i].TryGetProperty("code", out var statusCode) ? statusCode.GetInt32() : 0;
                    if (code == 0) result[item.Key] = item.Entry;
                    else if (code is 6 or 9 or 10) conflicts.Add(item.Key);
                    else throw new IOException($"Firestore weather write failed with status {code}.");
                }
            }
            remaining = conflicts.ToArray();
        }
        if (remaining.Length > 0) throw new IOException("Firestore weather documents changed during concurrent writes.");
        return result;
    }

    private async Task<Dictionary<WeatherSpotKey, Document>> ReadDocumentsAsync(Identity auth, WeatherSpotKey[] keys, CancellationToken token)
    {
        var documents = keys.ToDictionary(auth.Name);
        using var json = await SendAsync(auth, "batchGet", new { documents = documents.Keys }, token).ConfigureAwait(false);
        var result = new Dictionary<WeatherSpotKey, Document>();
        foreach (var response in json.RootElement.EnumerateArray())
        {
            if (!response.TryGetProperty("found", out var found)) continue;
            var name = found.GetProperty("name").GetString();
            if (name is null || !documents.TryGetValue(name, out var key)) continue;
            var fields = found.GetProperty("fields");
            var payload = fields.GetProperty("payload").GetProperty("bytesValue").GetBytesFromBase64();
            var version = found.GetProperty("updateTime").GetString() ?? throw new JsonException("Missing Firestore document version.");
            result.Add(key, new Document(Decode(payload), version));
        }
        return result;
    }

    private async Task<JsonDocument> SendAsync(Identity auth, string operation, object payload, CancellationToken token)
    {
        using var client = clients.CreateClient(HttpClientName);
        using var request = new HttpRequestMessage(HttpMethod.Post, $"https://firestore.googleapis.com/v1/{auth.Root}/documents:{operation}")
        {
            Content = JsonContent.Create(payload),
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", auth.Token);
        using var response = await client.SendAsync(request, token).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();
        await using var content = await response.Content.ReadAsStreamAsync(token).ConfigureAwait(false);
        return await JsonDocument.ParseAsync(content, cancellationToken: token).ConfigureAwait(false);
    }

    private async Task<Identity> GetIdentityAsync(CancellationToken token)
    {
        var cached = Volatile.Read(ref identity);
        if (cached is not null && cached.Expires > clock.GetUtcNow()) return cached;
        await identityGate.WaitAsync(token).ConfigureAwait(false);
        try
        {
            cached = identity;
            if (cached is not null && cached.Expires > clock.GetUtcNow()) return cached;
            using var http = clients.CreateClient(MetadataHttpClientName);
            var root = cached?.Root;
            if (root is null)
            {
                var project = await http.GetStringAsync(Metadata + "project/project-id", token).ConfigureAwait(false);
                root = $"projects/{Uri.EscapeDataString(project.Trim())}/databases/{Uri.EscapeDataString(database!)}";
            }
            var body = await http.GetFromJsonAsync<JsonElement>(Metadata + "instance/service-accounts/default/token", token).ConfigureAwait(false);
            var access = body.GetProperty("access_token").GetString() ?? throw new JsonException("Missing Cloud Run access token.");
            var expiry = Math.Max(0, body.GetProperty("expires_in").GetInt32() - 60);
            var updated = new Identity(root, access, clock.GetUtcNow().AddSeconds(expiry));
            Volatile.Write(ref identity, updated);
            return updated;
        }
        finally { identityGate.Release(); }
    }

    internal static string Encode(WeatherCacheEntry entry)
    {
        using var bytes = new MemoryStream();
        using (var gzip = new GZipStream(bytes, CompressionLevel.Fastest, leaveOpen: true))
            JsonSerializer.Serialize(gzip, entry);
        return Convert.ToBase64String(bytes.GetBuffer().AsSpan(0, (int)bytes.Length));
    }

    internal static WeatherCacheEntry Decode(byte[] data)
    {
        using var bytes = new MemoryStream(data);
        using var gzip = new GZipStream(bytes, CompressionMode.Decompress);
        return JsonSerializer.Deserialize<WeatherCacheEntry>(gzip) ?? throw new JsonException("Empty hotspot weather entry.");
    }

    private sealed record Identity(string Root, string Token, DateTimeOffset Expires)
    {
        public string Name(WeatherSpotKey key) => $"{Root}/documents/{Collection}/{key.Id}";
    }

    private sealed record Document(WeatherCacheEntry Entry, string Version);
}
