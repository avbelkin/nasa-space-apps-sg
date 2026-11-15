using System.Globalization;
using NasaSpaceApps.Api.Firms;
using NasaSpaceApps.Api.LandCover;
using PureHDF;
using PureHDF.Selections;

namespace NasaSpaceApps.Api.Weather;

internal static class GoesMeasurements
{
    private const double Radians = Math.PI / 180;
    private const double EarthRadiusKm = 6371.0088;
    private const int Bearings = 16;
    private const int Rings = 3;

    internal enum Product { Infrared, Cloud, Smoke, OpticalDepth, CloudTopHeight, CloudTopPhase }

    public static IReadOnlyDictionary<string, double?>[] ReadRasters(Stream stream, Product product, IReadOnlyList<FirmsHotspot> spots)
    {
        using var file = H5File.Open(stream, leaveOpen: true);
        var grid = new Grid(file);
        return spots.Select(spot => ReadRaster(file, grid, product, spot)).ToArray();
    }

    private static IReadOnlyDictionary<string, double?> ReadRaster(IH5Group file, Grid grid, Product product, FirmsHotspot spot)
    {
        var center = grid.Pixel(spot.Latitude, spot.Longitude);
        if (product == Product.Cloud)
            return ReadCloud(file, grid, spot, center);

        var (field, value) = product switch
        {
            Product.Infrared => ("satellite_infrared_brightness_temperature", SamplePacked("CMI", false)),
            Product.OpticalDepth => ("satellite_cloud_optical_depth_640nm", SamplePacked("COD", true, opticalDepth: true)),
            Product.CloudTopHeight => ("satellite_cloud_top_geopotential_height", SamplePacked("HT", true)),
            Product.CloudTopPhase => ("satellite_cloud_top_phase", SampleCategory("Phase", 5, smoke: false)),
            Product.Smoke => ("satellite_smoke_flag", SampleCategory("Smoke", 1, smoke: true)),
            _ => throw new ArgumentOutOfRangeException(nameof(product)),
        };
        return new Dictionary<string, double?> { [field] = value };

        double? SamplePacked(string dataset, bool unsigned, bool opticalDepth = false)
        {
            if (center is not { } pixel) return null;
            var quality = file.Dataset("DQF");
            // The optical depth flags use the first two bits for the retrieval algorithm.
            // Require every other bit to be clear for quantitative use.
            var good = opticalDepth ? ReadPixel<ushort>(quality, pixel) is 1 or 2 : ReadPixel<byte>(quality, pixel) == 0;
            return good ? Unpack(file.Dataset(dataset), pixel, unsigned) : null;
        }

        double? SampleCategory(string dataset, byte maximum, bool smoke)
        {
            if (center is not { } pixel) return null;
            var quality = file.Dataset("DQF");
            var flag = smoke ? ReadPixel<short>(quality, pixel) : ReadPixel<byte>(quality, pixel);
            var good = smoke ? flag is >= 0 and <= 255 && (flag & 12) is 0 or 4 : flag == 0;
            var category = ReadPixel<byte>(file.Dataset(dataset), pixel);
            return good && category <= maximum ? category : null;
        }
    }

    private static double? Unpack(IH5Dataset image, (int Row, int Column) pixel, bool unsigned)
    {
        var packed = ReadPixel<short>(image, pixel);
        var valid = image.Attribute("valid_range").Read<short[]>();
        int Decode(short bits) => unsigned ? unchecked((ushort)bits) : bits;
        var count = Decode(packed);
        return count >= Decode(valid[0]) && count <= Decode(valid[1])
            ? count * Attribute(image, "scale_factor") + Attribute(image, "add_offset") : null;
    }

    private static IReadOnlyDictionary<string, double?> ReadCloud(IH5Group file, Grid grid, FirmsHotspot spot,
        (int Row, int Column)? center)
    {
        var weights = new Dictionary<(int Row, int Column), int>();
        var lat = spot.Latitude * Radians;
        var radius = LandCoverFootprint.RadiusMeters(spot) / (1000 * EarthRadiusKm);
        for (var ring = 0; ring < Rings; ring++)
        {
            var distance = 2 * Math.Asin(Math.Sin(radius / 2) * Math.Sqrt((ring + 0.5) / Rings));
            for (var sector = 0; sector < Bearings; sector++)
            {
                var bearing = 2 * Math.PI * (sector + 0.5) / Bearings;
                var sampleLat = Math.Asin(Math.Clamp(Math.Sin(lat) * Math.Cos(distance) +
                    Math.Cos(lat) * Math.Sin(distance) * Math.Cos(bearing), -1, 1));
                var sampleLon = spot.Longitude + Math.Atan2(Math.Sin(bearing) * Math.Sin(distance) * Math.Cos(lat),
                    Math.Cos(distance) - Math.Sin(lat) * Math.Sin(sampleLat)) / Radians;
                if (grid.Pixel(sampleLat / Radians, sampleLon) is { } pixel)
                    weights[pixel] = weights.GetValueOrDefault(pixel) + 1;
            }
        }
        if (center is { } centerPixel) weights.TryAdd(centerPixel, 0);

        var classified = 0;
        var cloudy = 0;
        double? centerClass = null;
        if (weights.Count > 0)
        {
            var points = new ulong[weights.Count, 2];
            var position = 0;
            foreach (var pixel in weights.Keys)
            {
                points[position, 0] = (ulong)pixel.Row;
                points[position++, 1] = (ulong)pixel.Column;
            }
            var selection = new PointSelection(points);
            var quality = file.Dataset("DQF").Read<byte[]>(fileSelection: selection);
            var cloud = file.Dataset("ACM").Read<byte[]>(fileSelection: selection);
            position = 0;
            foreach (var (pixel, weight) in weights)
            {
                var value = cloud[position];
                if (quality[position++] != 0 || value > 3) continue;
                if (pixel == center) centerClass = value;
                classified += weight;
                if (value >= 2) cloudy += weight;
            }
        }
        return new Dictionary<string, double?>
        {
            ["satellite_cloud_mask"] = centerClass,
            ["satellite_cloud_fraction"] = classified == 0 ? null : (double)cloudy / classified,
            ["satellite_cloud_footprint_coverage"] = (double)classified / (Rings * Bearings),
        };
    }

    internal static Flash[] ReadFlashes(Stream stream, DateTimeOffset sceneStart)
    {
        using var file = H5File.Open(stream, leaveOpen: true);
        var latitudes = file.Dataset("flash_lat").Read<float[]>();
        if (latitudes.Length == 0) return [];
        var longitudes = file.Dataset("flash_lon").Read<float[]>();
        var quality = file.Dataset("flash_quality_flag").Read<short[]>();
        var time = file.Dataset("flash_time_offset_of_first_event");
        var offsets = time.Read<ushort[]>();
        var scale = Attribute(time, "scale_factor");
        var offset = Attribute(time, "add_offset");
        var units = time.Attribute("units").Read<string[]>()[0];
        const string prefix = "seconds since ";
        if (!units.StartsWith(prefix, StringComparison.Ordinal) ||
            !DateTimeOffset.TryParse(units[prefix.Length..], CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var origin) ||
            (origin - sceneStart).Duration() > TimeSpan.FromSeconds(1))
        {
            throw new InvalidDataException("Invalid GOES lightning time origin.");
        }
        var flashes = new List<Flash>();
        for (var i = 0; i < latitudes.Length; i++)
        {
            var acquired = origin.AddSeconds(offsets[i] * scale + offset);
            if (quality[i] != 0 ||
                !float.IsFinite(latitudes[i]) || !float.IsFinite(longitudes[i]) ||
                latitudes[i] is < -90 or > 90 || longitudes[i] is < -180 or > 180)
                continue;
            flashes.Add(new Flash(acquired, latitudes[i], longitudes[i]));
        }
        return flashes.ToArray();
    }

    internal static (int Count, double? NearestKm) SummarizeFlashes(IEnumerable<Flash> flashes, double latitude, double longitude,
        DateTimeOffset start, DateTimeOffset end, double radiusKm)
    {
        var count = 0;
        double? nearest = null;
        foreach (var flash in flashes)
        {
            if (flash.Time < start || flash.Time >= end) continue;
            var distance = DistanceKm(latitude, longitude, flash.Latitude, flash.Longitude);
            if (distance <= radiusKm)
            {
                count++;
                nearest = nearest.HasValue ? Math.Min(nearest.Value, distance) : distance;
            }
        }
        return (count, nearest);
    }

    internal readonly record struct Flash(DateTimeOffset Time, double Latitude, double Longitude);

    private static double DistanceKm(double lat, double lon, double otherLat, double otherLon)
    {
        var a = Math.Pow(Math.Sin((otherLat - lat) * Radians / 2), 2) +
            Math.Cos(lat * Radians) * Math.Cos(otherLat * Radians) * Math.Pow(Math.Sin((otherLon - lon) * Radians / 2), 2);
        return 2 * EarthRadiusKm * Math.Asin(Math.Sqrt(Math.Clamp(a, 0, 1)));
    }

    private static T ReadPixel<T>(IH5Dataset data, (int Row, int Column) pixel) where T : unmanaged =>
        data.Read<T[]>(fileSelection: new PointSelection(new ulong[,] { { (ulong)pixel.Row, (ulong)pixel.Column } }))[0];

    private static double Attribute(IH5Object item, string name)
    {
        var attribute = item.Attribute(name);
        return attribute.Type.Size == sizeof(float) ? attribute.Read<float[]>()[0] : attribute.Read<double[]>()[0];
    }

    internal static (double X, double Y)? Project(double latitude, double longitude, double origin, double major, double minor, double height)
    {
        var delta = (longitude - origin) * Radians;
        var ratio = major * major / (minor * minor);
        var geocentric = Math.Atan(Math.Tan(latitude * Radians) / ratio);
        var r = minor / Math.Sqrt(1 - (1 - 1 / ratio) * Math.Pow(Math.Cos(geocentric), 2));
        var sx = r * Math.Cos(geocentric) * Math.Cos(delta);
        var sy = r * Math.Cos(geocentric) * Math.Sin(delta);
        var sz = r * Math.Sin(geocentric);
        var satellite = height + major;
        if (satellite * sx <= sx * sx + sy * sy + ratio * sz * sz) return null;
        var along = satellite - sx;
        return (Math.Asin(sy / Math.Sqrt(along * along + sy * sy + sz * sz)), Math.Atan2(sz, along));
    }

    private sealed class Grid
    {
        private readonly double major, minor, height, longitude;
        private readonly Axis x, y;

        public Grid(IH5Group file)
        {
            var projection = file.Dataset("goes_imager_projection");
            major = Attribute(projection, "semi_major_axis");
            minor = Attribute(projection, "semi_minor_axis");
            longitude = Attribute(projection, "longitude_of_projection_origin");
            height = Attribute(projection, "perspective_point_height");
            x = Axis.Read(file.Dataset("x"));
            y = Axis.Read(file.Dataset("y"));
        }

        public (int Row, int Column)? Pixel(double lat, double lon) =>
            Project(lat, lon, longitude, major, minor, height) is { } projected && y.Index(projected.Y) is int row && x.Index(projected.X) is int col
                ? (row, col) : null;
    }

    private readonly record struct Axis(double Origin, double Step, int Length)
    {
        public int? Index(double angle)
        {
            var position = (int)Math.Round((angle - Origin) / Step);
            return position >= 0 && position < Length ? position : null;
        }

        public static Axis Read(IH5Dataset dataset)
        {
            var packed = dataset.Read<short[]>();
            if (packed.Length < 2 || packed[1] == packed[0]) throw new InvalidDataException("Invalid GOES grid axis.");
            var scale = Attribute(dataset, "scale_factor");
            var offset = Attribute(dataset, "add_offset");
            return new Axis(packed[0] * scale + offset, (packed[1] - packed[0]) * scale, packed.Length);
        }
    }
}
