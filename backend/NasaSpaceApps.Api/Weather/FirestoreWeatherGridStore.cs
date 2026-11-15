using System.Globalization;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace NasaSpaceApps.Api.Weather;

internal sealed class FirestoreWeatherGridStore(IHttpClientFactory clients, IConfiguration config, TimeProvider clock,
    LocalWeatherCredentials? local = null)
{
    internal const string HttpClientName = "WeatherFirestore";
    internal const string MetadataHttpClientName = "WeatherFirestoreMetadata";
    // Reuse the existing collection-group TTL policy. Root documents are the retired per-spot cache.
    private const string Parent = "/weatherGridCache/liveV1";
    private const string Collection = "hotspotWeatherV1";
    private const string Metadata = "http://metadata.google.internal/computeMetadata/v1/";
    private readonly string? database = local?.Database ?? config["WeatherCache:Database"]?.Trim();
    private readonly SemaphoreSlim identityGate = new(1);
    private Identity? identity;

    internal bool IsEnabled => !string.IsNullOrEmpty(database);
    internal static string GridId(string key) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(key)));

    internal async Task<StoredWeatherGrid?> ReadAsync(string key, CancellationToken token)
    {
        var auth = await GetIdentityAsync(token).ConfigureAwait(false);
        var name = auth.GridName(key);
        using var json = await SendAsync(auth, "batchGet", new { documents = new[] { name } }, token).ConfigureAwait(false);
        foreach (var row in json.RootElement.EnumerateArray())
        {
            if (!row.TryGetProperty("found", out var found)) continue;
            var fields = found.GetProperty("fields");
            var expires = fields.GetProperty("expireAt").GetProperty("timestampValue").GetDateTimeOffset();
            var fetched = fields.GetProperty("fetchedAt").GetProperty("timestampValue").GetDateTimeOffset();
            DateTimeOffset? modified = fields.TryGetProperty("modifiedAt", out var timestamp)
                ? timestamp.GetProperty("timestampValue").GetDateTimeOffset() : null;
            var grid = new EncodedWeatherGrid(fields.GetProperty("encoded").GetProperty("bytesValue").GetBytesFromBase64(),
                fetched, modified);
            return new StoredWeatherGrid(grid, expires, found.GetProperty("updateTime").GetString() ??
                throw new JsonException("Missing Firestore grid document version."));
        }
        return null;
    }

    internal async Task<bool> WriteAsync(string key, EncodedWeatherGrid grid, DateTimeOffset expires, string? version, CancellationToken token)
    {
        if (expires <= clock.GetUtcNow()) return false;
        var auth = await GetIdentityAsync(token).ConfigureAwait(false);
        var fields = new Dictionary<string, object>
        {
            ["expireAt"] = Timestamp(expires),
            ["fetchedAt"] = Timestamp(grid.FetchedAt),
            ["encoded"] = new { bytesValue = Convert.ToBase64String(grid.Bytes) },
            ["sourceKey"] = new { stringValue = key },
        };
        if (grid.ModifiedAt is { } modified) fields["modifiedAt"] = Timestamp(modified);
        var update = new { name = auth.GridName(key), fields };
        var currentDocument = version is null ? (object)new { exists = false } : new { updateTime = version };
        using var json = await SendAsync(auth, "batchWrite", new { writes = new[] { new { update, currentDocument } } }, token).ConfigureAwait(false);
        var status = json.RootElement.GetProperty("status")[0];
        var code = status.TryGetProperty("code", out var number) ? number.GetInt32() : 0;
        if (code is 6 or 9 or 10) return false;
        if (code != 0) throw new IOException($"Firestore grid write failed with status {code}.");
        return true;
    }

    internal async Task<HotspotWeatherCoverage?> CountAsync(DateTimeOffset now, CancellationToken token)
    {
        if (!IsEnabled) return null;
        var auth = await GetIdentityAsync(token).ConfigureAwait(false);
        var filter = new { fieldFilter = new { field = new { fieldPath = "expireAt" }, op = "GREATER_THAN", value = Timestamp(now) } };
        var query = new
        {
            structuredAggregationQuery = new
            {
                structuredQuery = new { from = new[] { new { collectionId = Collection } }, where = filter },
                aggregations = new[] { new { count = new { }, alias = "cached" } },
            },
        };
        using var json = await SendAsync(auth, "runAggregationQuery", query, token, Parent).ConfigureAwait(false);
        foreach (var row in json.RootElement.EnumerateArray())
        {
            if (!row.TryGetProperty("result", out var result)) continue;
            var count = result.GetProperty("aggregateFields").GetProperty("cached").GetProperty("integerValue").GetString();
            if (int.TryParse(count, NumberStyles.None, CultureInfo.InvariantCulture, out var cached))
                return new HotspotWeatherCoverage(cached, now);
        }
        throw new JsonException("Missing Firestore weather grid count.");
    }

    private async Task<JsonDocument> SendAsync(Identity auth, string operation, object payload, CancellationToken token, string parent = "")
    {
        using var client = clients.CreateClient(HttpClientName);
        using var request = new HttpRequestMessage(HttpMethod.Post, $"https://firestore.googleapis.com/v1/{auth.Root}/documents{parent}:{operation}")
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
        if (local is not null)
            return new Identity($"projects/{Uri.EscapeDataString(local.Project)}/databases/{Uri.EscapeDataString(local.Database)}",
                local.Token, DateTimeOffset.MaxValue);
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

    private static object Timestamp(DateTimeOffset value) => new { timestampValue = value.UtcDateTime.ToString("O", CultureInfo.InvariantCulture) };

    private sealed record Identity(string Root, string Token, DateTimeOffset Expires)
    {
        public string GridName(string key) => $"{Root}/documents{Parent}/{Collection}/{GridId(key)}";
    }

    internal sealed record StoredWeatherGrid(EncodedWeatherGrid Grid, DateTimeOffset Expires, string Version);
}
