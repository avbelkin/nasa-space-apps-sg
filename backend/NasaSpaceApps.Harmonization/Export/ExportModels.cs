using System.Globalization;
using System.IO.Compression;
using System.Text;

namespace NasaSpaceApps.Harmonization.Export;

/// <summary>Deterministic orbital, viewing, solar, and lunar geometry computed for an observation or overpass.</summary>
public sealed record SpotGeometryFeatures(
    double? OffNadirDeg,
    double? ViewZenithDeg,
    double? ViewAzimuthDeg,
    double? SlantRangeKm,
    double SunElevationDeg,
    double? SunAzimuthDeg,
    double? SunRelativeAzimuthDeg,
    double? SunLookSeparationDeg,
    double? SunGlintAngleDeg,
    double MoonElevationDeg,
    double? MoonRelativeAzimuthDeg,
    double? MoonGlintAngleDeg,
    double MoonPhaseAngleDeg,
    double MoonIlluminatedFraction,
    double MoonDistanceKm);

/// <summary>Weather variables sampled from published NOAA GFS and Copernicus GWIS rasters.</summary>
public sealed record WeatherFeatures(
    bool GfsAvailable,
    bool GwisAvailable,
    double? GfsAgeMinutes,
    double? GfsLeadHours,
    double? CloudCoverPct,
    double? ColumnCloudWaterKgM2,
    double? CloudCeilingAglM,
    double? VisibilityM,
    double? ShortwaveRadiationWm2,
    double? PrecipRateMmH,
    double? AccumPrecipMm,
    int PrecipAny,
    double? PwatKgM2,
    double? Temp2mC,
    double? DewPoint2mC,
    double? DewPointSpreadC,
    double? Rh2mPct,
    double? VpdKpa,
    double? SurfaceTempC,
    double? SurfacePressureHpa,
    double? WindU10mMs,
    double? WindV10mMs,
    double? WindSpeed10mMs,
    double? WindGustMs,
    double? Temp850C,
    double? Rh850Pct,
    double? WindSpeed850Ms,
    double? WindShear10to850Ms,
    double? SoilMoistureTop,
    double? Paw40Pct,
    double? Paw100Pct,
    double? SoilDeficit40Mm,
    double? SnowCoverPct,
    double? SnowDepthCm,
    double? GwisFwi,
    double? GwisFfmc,
    double? GwisDc,
    double? GwisLightning,
    int? GwisDangerClass)
{
    public static WeatherFeatures Empty { get; } = new(
        false, false, null, null,
        null, null, null, null, null,
        null, null, 0, null,
        null, null, null, null, null, null, null,
        null, null, null, null,
        null, null, null, null,
        null, null, null, null, null, null,
        null, null, null, null, null);
}

/// <summary>Weather- and geometry-enriched detection record with forward/symmetric overpass outcomes.</summary>
public sealed record EnrichedSpotRecord(
    int SpotId,
    double Latitude,
    double Longitude,
    DateTimeOffset AcquiredAtUtc,
    long TimestampMs,
    string Satellite,
    string Instrument,
    string SourceDataset,
    string DayNight,
    double FrpMw,
    double BrightnessK,
    double? SecondaryBrightnessK,
    double? ScanKm,
    double? TrackKm,
    int Confidence,
    int? LandCoverCode,
    double? LandCoverShare,
    SpotGeometryFeatures Geometry1,
    WeatherFeatures Weather1,
    bool Settled6hAll,
    int SettledSameFamilyPasses6h,
    int PositiveSameFamilyPasses6h,
    int NegativeSameFamilyPasses6h,
    int SettledCrossFamilyPasses6h,
    int PositiveCrossFamilyPasses6h,
    int NegativeCrossFamilyPasses6h,
    int SettledTotalPasses6h,
    int PositiveTotalPasses6h,
    int NegativeTotalPasses6h,
    double? MinCandidateTrackDistKm6h,
    double? MeanCandidateTrackDistKm6h,
    int HasNadirCandidate6h,
    bool Settled12hSymmetric,
    int SettledTotalPasses12h,
    int PositiveTotalPasses12h,
    int NegativeTotalPasses12h);

/// <summary>Episode-anchored follow-up pass pair for one of the four sensor directions.</summary>
public sealed record PassPairRecord(
    string Direction,
    string SatellitePair,
    int AnchorSpotId,
    double Latitude,
    double Longitude,
    long FirstTimestampMs,
    DateTimeOffset FirstAcquiredAtUtc,
    string FirstSatellite,
    string FirstInstrument,
    string FirstDayNight,
    double Frp1,
    double Brightness1,
    double? SecondaryBrightness1,
    int Confidence1,
    double? Scan1,
    double? Track1,
    int? LandCoverCode,
    double? LandCoverShare,
    SpotGeometryFeatures Geometry1,
    WeatherFeatures Weather1,
    long Pass2TimestampMs,
    DateTimeOffset Pass2Utc,
    string SecondSatellite,
    string SecondInstrument,
    string SecondDayNight,
    double ElapsedMinutes,
    double SecondTrackDistanceKm,
    bool SecondNadirSwath,
    SpotGeometryFeatures Geometry2,
    WeatherFeatures Weather2,
    int Hit500m,
    int Hit1km,
    int PrimaryHit,
    int PrimaryMiss,
    double? Frp2,
    double? Brightness2,
    int? Confidence2,
    double? LogFrpChange);

internal static class CsvSchemaCodec
{
    private static string F(double? v) =>
        v is { } d && double.IsFinite(d) ? d.ToString("G9", CultureInfo.InvariantCulture) : string.Empty;

    private static string I(int? v) =>
        v is { } n ? n.ToString(CultureInfo.InvariantCulture) : string.Empty;

    private static string B(bool v) => v ? "1" : "0";

    private static double? P(string s) =>
        string.IsNullOrEmpty(s) ? null : double.Parse(s, NumberStyles.Float, CultureInfo.InvariantCulture);

    private static int? PI(string s) =>
        string.IsNullOrEmpty(s) ? null : int.Parse(s, NumberStyles.Integer, CultureInfo.InvariantCulture);

    private static bool PB(string s) => s == "1";

    private static void AppendGeometry(StringBuilder sb, SpotGeometryFeatures g)
    {
        sb.Append(',').Append(F(g.OffNadirDeg));
        sb.Append(',').Append(F(g.ViewZenithDeg));
        sb.Append(',').Append(F(g.ViewAzimuthDeg));
        sb.Append(',').Append(F(g.SlantRangeKm));
        sb.Append(',').Append(F(g.SunElevationDeg));
        sb.Append(',').Append(F(g.SunAzimuthDeg));
        sb.Append(',').Append(F(g.SunRelativeAzimuthDeg));
        sb.Append(',').Append(F(g.SunLookSeparationDeg));
        sb.Append(',').Append(F(g.SunGlintAngleDeg));
        sb.Append(',').Append(F(g.MoonElevationDeg));
        sb.Append(',').Append(F(g.MoonRelativeAzimuthDeg));
        sb.Append(',').Append(F(g.MoonGlintAngleDeg));
        sb.Append(',').Append(F(g.MoonPhaseAngleDeg));
        sb.Append(',').Append(F(g.MoonIlluminatedFraction));
        sb.Append(',').Append(F(g.MoonDistanceKm));
    }

    private static SpotGeometryFeatures ParseGeometry(string[] c, ref int idx) => new(
        P(c[idx++]), P(c[idx++]), P(c[idx++]), P(c[idx++]),
        double.Parse(c[idx++], CultureInfo.InvariantCulture),
        P(c[idx++]), P(c[idx++]), P(c[idx++]), P(c[idx++]),
        double.Parse(c[idx++], CultureInfo.InvariantCulture),
        P(c[idx++]), P(c[idx++]),
        double.Parse(c[idx++], CultureInfo.InvariantCulture),
        double.Parse(c[idx++], CultureInfo.InvariantCulture),
        double.Parse(c[idx++], CultureInfo.InvariantCulture));

    private static void AppendWeather(StringBuilder sb, WeatherFeatures w)
    {
        sb.Append(',').Append(B(w.GfsAvailable));
        sb.Append(',').Append(B(w.GwisAvailable));
        sb.Append(',').Append(F(w.GfsAgeMinutes));
        sb.Append(',').Append(F(w.GfsLeadHours));
        sb.Append(',').Append(F(w.CloudCoverPct));
        sb.Append(',').Append(F(w.ColumnCloudWaterKgM2));
        sb.Append(',').Append(F(w.CloudCeilingAglM));
        sb.Append(',').Append(F(w.VisibilityM));
        sb.Append(',').Append(F(w.ShortwaveRadiationWm2));
        sb.Append(',').Append(F(w.PrecipRateMmH));
        sb.Append(',').Append(F(w.AccumPrecipMm));
        sb.Append(',').Append(w.PrecipAny);
        sb.Append(',').Append(F(w.PwatKgM2));
        sb.Append(',').Append(F(w.Temp2mC));
        sb.Append(',').Append(F(w.DewPoint2mC));
        sb.Append(',').Append(F(w.DewPointSpreadC));
        sb.Append(',').Append(F(w.Rh2mPct));
        sb.Append(',').Append(F(w.VpdKpa));
        sb.Append(',').Append(F(w.SurfaceTempC));
        sb.Append(',').Append(F(w.SurfacePressureHpa));
        sb.Append(',').Append(F(w.WindU10mMs));
        sb.Append(',').Append(F(w.WindV10mMs));
        sb.Append(',').Append(F(w.WindSpeed10mMs));
        sb.Append(',').Append(F(w.WindGustMs));
        sb.Append(',').Append(F(w.Temp850C));
        sb.Append(',').Append(F(w.Rh850Pct));
        sb.Append(',').Append(F(w.WindSpeed850Ms));
        sb.Append(',').Append(F(w.WindShear10to850Ms));
        sb.Append(',').Append(F(w.SoilMoistureTop));
        sb.Append(',').Append(F(w.Paw40Pct));
        sb.Append(',').Append(F(w.Paw100Pct));
        sb.Append(',').Append(F(w.SoilDeficit40Mm));
        sb.Append(',').Append(F(w.SnowCoverPct));
        sb.Append(',').Append(F(w.SnowDepthCm));
        sb.Append(',').Append(F(w.GwisFwi));
        sb.Append(',').Append(F(w.GwisFfmc));
        sb.Append(',').Append(F(w.GwisDc));
        sb.Append(',').Append(F(w.GwisLightning));
        sb.Append(',').Append(I(w.GwisDangerClass));
    }

    private static WeatherFeatures ParseWeather(string[] c, ref int idx) => new(
        PB(c[idx++]), PB(c[idx++]), P(c[idx++]), P(c[idx++]),
        P(c[idx++]), P(c[idx++]), P(c[idx++]), P(c[idx++]), P(c[idx++]),
        P(c[idx++]), P(c[idx++]), int.Parse(c[idx++], CultureInfo.InvariantCulture), P(c[idx++]),
        P(c[idx++]), P(c[idx++]), P(c[idx++]), P(c[idx++]), P(c[idx++]), P(c[idx++]), P(c[idx++]),
        P(c[idx++]), P(c[idx++]), P(c[idx++]), P(c[idx++]),
        P(c[idx++]), P(c[idx++]), P(c[idx++]), P(c[idx++]),
        P(c[idx++]), P(c[idx++]), P(c[idx++]), P(c[idx++]), P(c[idx++]), P(c[idx++]),
        P(c[idx++]), P(c[idx++]), P(c[idx++]), P(c[idx++]), PI(c[idx++]));

    private static string GeometryColumns(string prefix) => string.Join(',',
        $"{prefix}_off_nadir_deg", $"{prefix}_view_zenith_deg", $"{prefix}_view_azimuth_deg", $"{prefix}_slant_range_km",
        $"{prefix}_sun_elevation_deg", $"{prefix}_sun_azimuth_deg", $"{prefix}_sun_rel_azimuth_deg", $"{prefix}_sun_look_sep_deg", $"{prefix}_sun_glint_deg",
        $"{prefix}_moon_elevation_deg", $"{prefix}_moon_rel_azimuth_deg", $"{prefix}_moon_glint_deg", $"{prefix}_moon_phase_deg", $"{prefix}_moon_illum_frac", $"{prefix}_moon_dist_km");

    private static string WeatherColumns(string prefix) => string.Join(',',
        $"{prefix}_gfs_avail", $"{prefix}_gwis_avail", $"{prefix}_gfs_age_min", $"{prefix}_gfs_lead_h",
        $"{prefix}_cloud_cover_pct", $"{prefix}_cwat_kg_m2", $"{prefix}_cloud_ceiling_agl_m", $"{prefix}_visibility_m", $"{prefix}_shortwave_w_m2",
        $"{prefix}_precip_rate_mm_h", $"{prefix}_accum_precip_mm", $"{prefix}_precip_any", $"{prefix}_pwat_kg_m2",
        $"{prefix}_temp_2m_c", $"{prefix}_dew_point_2m_c", $"{prefix}_dew_spread_2m_c", $"{prefix}_rh_2m_pct", $"{prefix}_vpd_kpa", $"{prefix}_surface_temp_c", $"{prefix}_surface_pressure_hpa",
        $"{prefix}_wind_u_10m_ms", $"{prefix}_wind_v_10m_ms", $"{prefix}_wind_speed_10m_ms", $"{prefix}_wind_gust_ms",
        $"{prefix}_temp_850_c", $"{prefix}_rh_850_pct", $"{prefix}_wind_speed_850_ms", $"{prefix}_wind_shear_10_850_ms",
        $"{prefix}_soil_moisture_top", $"{prefix}_paw_40_pct", $"{prefix}_paw_100_pct", $"{prefix}_soil_deficit_40_mm", $"{prefix}_snow_cover_pct", $"{prefix}_snow_depth_cm",
        $"{prefix}_gwis_fwi", $"{prefix}_gwis_ffmc", $"{prefix}_gwis_dc", $"{prefix}_gwis_lightning", $"{prefix}_gwis_danger_class");

    public static void WriteSpotsCsvGzip(string path, IReadOnlyList<EnrichedSpotRecord> rows)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        using var fs = File.Create(path);
        using var gz = new GZipStream(fs, CompressionLevel.Optimal);
        using var writer = new StreamWriter(gz, new UTF8Encoding(false), bufferSize: 1 << 16);

        writer.Write("spot_id,lat,lon,acquired_utc,timestamp_ms,satellite,instrument,source_dataset,day_night,frp_mw,brightness_k,sec_brightness_k,scan_km,track_km,confidence,land_cover_code,land_cover_share,");
        writer.Write(GeometryColumns("g1"));
        writer.Write(',');
        writer.Write(WeatherColumns("w1"));
        writer.WriteLine(",settled_6h,settled_same_6h,pos_same_6h,neg_same_6h,settled_cross_6h,pos_cross_6h,neg_cross_6h,settled_total_6h,pos_total_6h,neg_total_6h,min_cand_dist_km_6h,mean_cand_dist_km_6h,has_nadir_cand_6h,settled_12h,settled_total_12h,pos_total_12h,neg_total_12h");

        var sb = new StringBuilder(1024);
        foreach (var r in rows)
        {
            sb.Clear();
            sb.Append(r.SpotId).Append(',')
              .Append(F(r.Latitude)).Append(',').Append(F(r.Longitude)).Append(',')
              .Append(r.AcquiredAtUtc.UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture)).Append(',')
              .Append(r.TimestampMs).Append(',')
              .Append(r.Satellite).Append(',').Append(r.Instrument).Append(',').Append(r.SourceDataset).Append(',')
              .Append(r.DayNight).Append(',')
              .Append(F(r.FrpMw)).Append(',').Append(F(r.BrightnessK)).Append(',').Append(F(r.SecondaryBrightnessK)).Append(',')
              .Append(F(r.ScanKm)).Append(',').Append(F(r.TrackKm)).Append(',').Append(r.Confidence).Append(',')
              .Append(I(r.LandCoverCode)).Append(',').Append(F(r.LandCoverShare));
            AppendGeometry(sb, r.Geometry1);
            AppendWeather(sb, r.Weather1);
            sb.Append(',').Append(B(r.Settled6hAll))
              .Append(',').Append(r.SettledSameFamilyPasses6h)
              .Append(',').Append(r.PositiveSameFamilyPasses6h)
              .Append(',').Append(r.NegativeSameFamilyPasses6h)
              .Append(',').Append(r.SettledCrossFamilyPasses6h)
              .Append(',').Append(r.PositiveCrossFamilyPasses6h)
              .Append(',').Append(r.NegativeCrossFamilyPasses6h)
              .Append(',').Append(r.SettledTotalPasses6h)
              .Append(',').Append(r.PositiveTotalPasses6h)
              .Append(',').Append(r.NegativeTotalPasses6h)
              .Append(',').Append(F(r.MinCandidateTrackDistKm6h))
              .Append(',').Append(F(r.MeanCandidateTrackDistKm6h))
              .Append(',').Append(r.HasNadirCandidate6h)
              .Append(',').Append(B(r.Settled12hSymmetric))
              .Append(',').Append(r.SettledTotalPasses12h)
              .Append(',').Append(r.PositiveTotalPasses12h)
              .Append(',').Append(r.NegativeTotalPasses12h);
            writer.WriteLine(sb.ToString());
        }
    }

    public static List<EnrichedSpotRecord> ReadSpotsCsvGzip(string path)
    {
        var list = new List<EnrichedSpotRecord>(200_000);
        using var fs = File.OpenRead(path);
        using var gz = new GZipStream(fs, CompressionMode.Decompress);
        using var reader = new StreamReader(gz, Encoding.UTF8);
        _ = reader.ReadLine(); // header
        while (reader.ReadLine() is { } line)
        {
            if (string.IsNullOrEmpty(line)) continue;
            var c = line.Split(',');
            var idx = 0;
            var spotId = int.Parse(c[idx++], CultureInfo.InvariantCulture);
            var lat = double.Parse(c[idx++], CultureInfo.InvariantCulture);
            var lon = double.Parse(c[idx++], CultureInfo.InvariantCulture);
            var acq = DateTimeOffset.Parse(c[idx++], CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal);
            var ts = long.Parse(c[idx++], CultureInfo.InvariantCulture);
            var sat = c[idx++];
            var inst = c[idx++];
            var src = c[idx++];
            var dn = c[idx++];
            var frp = double.Parse(c[idx++], CultureInfo.InvariantCulture);
            var br = double.Parse(c[idx++], CultureInfo.InvariantCulture);
            var secBr = P(c[idx++]);
            var scan = P(c[idx++]);
            var track = P(c[idx++]);
            var conf = int.Parse(c[idx++], CultureInfo.InvariantCulture);
            var lc = PI(c[idx++]);
            var lcShare = P(c[idx++]);
            var g1 = ParseGeometry(c, ref idx);
            var w1 = ParseWeather(c, ref idx);
            var s6 = PB(c[idx++]);
            var ss = int.Parse(c[idx++], CultureInfo.InvariantCulture);
            var ps = int.Parse(c[idx++], CultureInfo.InvariantCulture);
            var ns = int.Parse(c[idx++], CultureInfo.InvariantCulture);
            var sc = int.Parse(c[idx++], CultureInfo.InvariantCulture);
            var pc = int.Parse(c[idx++], CultureInfo.InvariantCulture);
            var nc = int.Parse(c[idx++], CultureInfo.InvariantCulture);
            var st = int.Parse(c[idx++], CultureInfo.InvariantCulture);
            var pt = int.Parse(c[idx++], CultureInfo.InvariantCulture);
            var nt = int.Parse(c[idx++], CultureInfo.InvariantCulture);
            var minDist = P(c[idx++]);
            var meanDist = P(c[idx++]);
            var nadir = int.Parse(c[idx++], CultureInfo.InvariantCulture);
            var s12 = PB(c[idx++]);
            var st12 = int.Parse(c[idx++], CultureInfo.InvariantCulture);
            var pt12 = int.Parse(c[idx++], CultureInfo.InvariantCulture);
            var nt12 = int.Parse(c[idx++], CultureInfo.InvariantCulture);

            list.Add(new EnrichedSpotRecord(
                spotId, lat, lon, acq, ts, sat, inst, src, dn, frp, br, secBr, scan, track, conf, lc, lcShare,
                g1, w1, s6, ss, ps, ns, sc, pc, nc, st, pt, nt, minDist, meanDist, nadir, s12, st12, pt12, nt12));
        }
        return list;
    }

    public static void WritePairsCsvGzip(string path, IReadOnlyList<PassPairRecord> rows)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        using var fs = File.Create(path);
        using var gz = new GZipStream(fs, CompressionLevel.Optimal);
        using var writer = new StreamWriter(gz, new UTF8Encoding(false), bufferSize: 1 << 16);

        writer.Write("direction,sat_pair,anchor_spot_id,lat,lon,ts1_ms,acq1_utc,sat1,inst1,dn1,frp1,br1,sec_br1,conf1,scan1,track1,lc_code,lc_share,");
        writer.Write(GeometryColumns("g1"));
        writer.Write(',');
        writer.Write(WeatherColumns("w1"));
        writer.Write(",ts2_ms,pass2_utc,sat2,inst2,dn2,elapsed_min,dist2_km,nadir2,");
        writer.Write(GeometryColumns("g2"));
        writer.Write(',');
        writer.Write(WeatherColumns("w2"));
        writer.WriteLine(",hit_500m,hit_1km,primary_hit,primary_miss,frp2,br2,conf2,log_frp_change");

        var sb = new StringBuilder(2048);
        foreach (var r in rows)
        {
            sb.Clear();
            sb.Append(r.Direction).Append(',').Append(r.SatellitePair).Append(',').Append(r.AnchorSpotId).Append(',')
              .Append(F(r.Latitude)).Append(',').Append(F(r.Longitude)).Append(',')
              .Append(r.FirstTimestampMs).Append(',')
              .Append(r.FirstAcquiredAtUtc.UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture)).Append(',')
              .Append(r.FirstSatellite).Append(',').Append(r.FirstInstrument).Append(',').Append(r.FirstDayNight).Append(',')
              .Append(F(r.Frp1)).Append(',').Append(F(r.Brightness1)).Append(',').Append(F(r.SecondaryBrightness1)).Append(',')
              .Append(r.Confidence1).Append(',').Append(F(r.Scan1)).Append(',').Append(F(r.Track1)).Append(',')
              .Append(I(r.LandCoverCode)).Append(',').Append(F(r.LandCoverShare));
            AppendGeometry(sb, r.Geometry1);
            AppendWeather(sb, r.Weather1);
            sb.Append(',').Append(r.Pass2TimestampMs).Append(',')
              .Append(r.Pass2Utc.UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture)).Append(',')
              .Append(r.SecondSatellite).Append(',').Append(r.SecondInstrument).Append(',').Append(r.SecondDayNight).Append(',')
              .Append(F(r.ElapsedMinutes)).Append(',').Append(F(r.SecondTrackDistanceKm)).Append(',').Append(B(r.SecondNadirSwath));
            AppendGeometry(sb, r.Geometry2);
            AppendWeather(sb, r.Weather2);
            sb.Append(',').Append(r.Hit500m)
              .Append(',').Append(r.Hit1km)
              .Append(',').Append(r.PrimaryHit)
              .Append(',').Append(r.PrimaryMiss)
              .Append(',').Append(F(r.Frp2))
              .Append(',').Append(F(r.Brightness2))
              .Append(',').Append(I(r.Confidence2))
              .Append(',').Append(F(r.LogFrpChange));
            writer.WriteLine(sb.ToString());
        }
    }

    public static List<PassPairRecord> ReadPairsCsvGzip(string path)
    {
        var list = new List<PassPairRecord>(150_000);
        using var fs = File.OpenRead(path);
        using var gz = new GZipStream(fs, CompressionMode.Decompress);
        using var reader = new StreamReader(gz, Encoding.UTF8);
        _ = reader.ReadLine(); // header
        while (reader.ReadLine() is { } line)
        {
            if (string.IsNullOrEmpty(line)) continue;
            var c = line.Split(',');
            var idx = 0;
            var dir = c[idx++];
            var pair = c[idx++];
            var anchor = int.Parse(c[idx++], CultureInfo.InvariantCulture);
            var lat = double.Parse(c[idx++], CultureInfo.InvariantCulture);
            var lon = double.Parse(c[idx++], CultureInfo.InvariantCulture);
            var ts1 = long.Parse(c[idx++], CultureInfo.InvariantCulture);
            var acq1 = DateTimeOffset.Parse(c[idx++], CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal);
            var sat1 = c[idx++];
            var inst1 = c[idx++];
            var dn1 = c[idx++];
            var frp1 = double.Parse(c[idx++], CultureInfo.InvariantCulture);
            var br1 = double.Parse(c[idx++], CultureInfo.InvariantCulture);
            var secBr1 = P(c[idx++]);
            var conf1 = int.Parse(c[idx++], CultureInfo.InvariantCulture);
            var scan1 = P(c[idx++]);
            var track1 = P(c[idx++]);
            var lc = PI(c[idx++]);
            var lcShare = P(c[idx++]);
            var g1 = ParseGeometry(c, ref idx);
            var w1 = ParseWeather(c, ref idx);
            var ts2 = long.Parse(c[idx++], CultureInfo.InvariantCulture);
            var utc2 = DateTimeOffset.Parse(c[idx++], CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal);
            var sat2 = c[idx++];
            var inst2 = c[idx++];
            var dn2 = c[idx++];
            var elapsed = double.Parse(c[idx++], CultureInfo.InvariantCulture);
            var dist2 = double.Parse(c[idx++], CultureInfo.InvariantCulture);
            var nadir2 = PB(c[idx++]);
            var g2 = ParseGeometry(c, ref idx);
            var w2 = ParseWeather(c, ref idx);
            var h500 = int.Parse(c[idx++], CultureInfo.InvariantCulture);
            var h1k = int.Parse(c[idx++], CultureInfo.InvariantCulture);
            var phit = int.Parse(c[idx++], CultureInfo.InvariantCulture);
            var pmiss = int.Parse(c[idx++], CultureInfo.InvariantCulture);
            var frp2 = P(c[idx++]);
            var br2 = P(c[idx++]);
            var conf2 = PI(c[idx++]);
            var lfc = P(c[idx++]);

            list.Add(new PassPairRecord(
                dir, pair, anchor, lat, lon, ts1, acq1, sat1, inst1, dn1, frp1, br1, secBr1, conf1, scan1, track1,
                lc, lcShare, g1, w1, ts2, utc2, sat2, inst2, dn2, elapsed, dist2, nadir2, g2, w2,
                h500, h1k, phit, pmiss, frp2, br2, conf2, lfc));
        }
        return list;
    }
}
