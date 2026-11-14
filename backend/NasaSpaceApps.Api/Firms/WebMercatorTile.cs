namespace NasaSpaceApps.Api.Firms;

/// <summary>
/// Web Mercator slippy-map tile bounding box helper for spatial filtering of active-fire hotspots.
/// </summary>
public readonly record struct WebMercatorTile(
    int Zoom,
    int X,
    int Y,
    double West,
    double South,
    double East,
    double North)
{
    public const int MaxSupportedZoom = 16;

    public static bool TryCreate(int zoom, int x, int y, out WebMercatorTile tile)
    {
        if (zoom < 0 || zoom > MaxSupportedZoom)
        {
            tile = default;
            return false;
        }

        var count = 1 << zoom;
        if (x < 0 || x >= count || y < 0 || y >= count)
        {
            tile = default;
            return false;
        }

        var west = x / (double)count * 360.0 - 180.0;
        var east = (x + 1) / (double)count * 360.0 - 180.0;
        var north = Math.Atan(Math.Sinh(Math.PI * (1.0 - 2.0 * y / count))) * (180.0 / Math.PI);
        var south = Math.Atan(Math.Sinh(Math.PI * (1.0 - 2.0 * (y + 1) / count))) * (180.0 / Math.PI);

        tile = new WebMercatorTile(zoom, x, y, west, south, east, north);
        return true;
    }

    public bool Contains(double latitude, double longitude)
    {
        var count = 1 << Zoom;
        var lonMatch = longitude >= West && (X == count - 1 ? longitude <= East : longitude < East);
        var latMatch = latitude >= South && (Y == 0 ? latitude <= North : latitude < North);
        return lonMatch && latMatch;
    }
}
