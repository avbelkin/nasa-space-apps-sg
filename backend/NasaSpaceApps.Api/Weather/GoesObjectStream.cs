using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Headers;

namespace NasaSpaceApps.Api.Weather;

// The ABI rasters are chunked NetCDF4 files. A seekable range reader lets the
// HDF5 library read metadata and selected chunks without downloading the disk.
internal sealed class GoesObjectStore(HttpClient client, CancellationToken token)
{
    internal const int PageSize = 128 * 1024;
    private const int MaximumPages = 192;
    private readonly ConcurrentDictionary<(Uri Uri, long Offset), Lazy<byte[]>> pages = new();
    private int pagesRequested;

    public Stream Open(Uri uri, long length) => new RangeStream(this, uri, length);

    private byte[] Page(Uri uri, long offset, long length) => pages.GetOrAdd((uri, offset), key =>
        new Lazy<byte[]>(() => Fetch(key.Uri, key.Offset, length))).Value;

    private byte[] Fetch(Uri uri, long offset, long length)
    {
        token.ThrowIfCancellationRequested();
        if (Interlocked.Increment(ref pagesRequested) > MaximumPages)
            throw new IOException("GOES batch exceeded the raster read budget.");
        var end = Math.Min(offset + PageSize, length) - 1;
        using var request = new HttpRequestMessage(HttpMethod.Get, uri);
        request.Headers.Range = new RangeHeaderValue(offset, end);
        using var response = client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, token).GetAwaiter().GetResult();
        var range = response.Content.Headers.ContentRange;
        if (response.StatusCode != HttpStatusCode.PartialContent || range?.From != offset || range.To != end || range.Length != length)
            throw new IOException("Unexpected GOES byte range.");
        var buffer = new byte[checked((int)(end - offset + 1))];
        using var body = response.Content.ReadAsStreamAsync(token).GetAwaiter().GetResult();
        body.ReadExactlyAsync(buffer, token).AsTask().GetAwaiter().GetResult();
        return buffer;
    }

    private sealed class RangeStream(GoesObjectStore store, Uri uri, long length) : Stream
    {
        private long position;
        public override bool CanRead => true;
        public override bool CanSeek => true;
        public override bool CanWrite => false;
        public override long Length => length;
        public override long Position
        {
            get => position;
            set => position = value >= 0 ? value : throw new ArgumentOutOfRangeException(nameof(value));
        }

        public override int Read(byte[] buffer, int offset, int count) => Read(buffer.AsSpan(offset, count));

        public override int Read(Span<byte> buffer)
        {
            var count = 0;
            while (!buffer.IsEmpty && position < length)
            {
                var offset = position / PageSize * PageSize;
                var page = store.Page(uri, offset, length).AsSpan((int)(position - offset));
                var take = Math.Min(page.Length, buffer.Length);
                page[..take].CopyTo(buffer);
                buffer = buffer[take..];
                position += take;
                count += take;
            }
            return count;
        }

        public override long Seek(long offset, SeekOrigin origin)
        {
            Position = checked(offset + (origin switch
            {
                SeekOrigin.Begin => 0,
                SeekOrigin.Current => position,
                SeekOrigin.End => length,
                _ => throw new ArgumentOutOfRangeException(nameof(origin)),
            }));
            return position;
        }

        public override void Flush() { }
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    }
}
