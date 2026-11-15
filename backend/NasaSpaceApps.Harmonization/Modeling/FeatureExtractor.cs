using NasaSpaceApps.Harmonization.Export;

namespace NasaSpaceApps.Harmonization.Modeling;

[Flags]
internal enum WeatherGroupFlags
{
    None = 0,
    G1Clouds = 1 << 0,
    G2WaterPrecip = 1 << 1,
    G3Wind = 1 << 2,
    G4ThermoRad = 1 << 3,
    G5SoilSnow = 1 << 4,
    G6Gwis = 1 << 5,
    All = G1Clouds | G2WaterPrecip | G3Wind | G4ThermoRad | G5SoilSnow | G6Gwis,
}

internal static class FeatureExtractor
{
    private static readonly double[] FrpEdges = [2, 5, 10, 20, 50, 100, 250];
    private static readonly double[] BrightEdges = [300, 315, 330, 345, 360, 400, 450];
    private static readonly double[] ConfEdges = [30, 50, 65, 80, 95, 100];
    private static readonly double[] ElapsedEdges = [40, 55, 70, 90, 120, 180, 240, 300];
    private static readonly double[] DistEdges = [100, 250, 400, 600, 800, 1000, 1200];
    private static readonly double[] OffNadirEdges = [10, 20, 30, 40, 50, 60];
    private static readonly double[] GlintEdges = [5, 15, 30, 60, 90];
    private static readonly double[] SunElevEdges = [-30, -12, 0, 15, 30, 45, 60];
    private static readonly double[] MoonElevEdges = [-30, 0, 30, 60];

    public static string UpperBand(double? value, double[] boundaries)
    {
        if (value is not { } v || !double.IsFinite(v)) return "missing";
        foreach (var b in boundaries)
            if (v < b) return $"<{b}";
        return $">={boundaries[^1]}";
    }

    public static string RangeBand(double? value, double[] edges)
    {
        if (value is not { } v || !double.IsFinite(v)) return "missing";
        for (var i = 0; i < edges.Length; i++)
        {
            if (v < edges[i])
                return i == 0 ? $"<{edges[0]}" : $"{edges[i - 1]} to <{edges[i]}";
        }
        return $">={edges[^1]}";
    }

    /// <summary>Encodes exact frpForecast.ts sparse feature tokens (optionally extended with pass2/weather).</summary>
    public static string[] EncodePairFrpBinned(
        PassPairRecord r,
        bool includePass2Geometry,
        bool includeWeatherT1,
        bool includeWeatherT2AndInteractions,
        WeatherGroupFlags weatherGroups = WeatherGroupFlags.All)
    {
        var list = new List<string>(64)
        {
            $"frp={UpperBand(r.Frp1, FrpEdges)}",
            $"brightness={UpperBand(r.Brightness1, BrightEdges)}",
            $"confidence={UpperBand(r.Confidence1, ConfEdges)}",
            $"elapsed={UpperBand(r.ElapsedMinutes, ElapsedEdges)}",
            $"distance={UpperBand(r.SecondTrackDistanceKm, DistEdges)}",
            $"nadir={(r.SecondNadirSwath ? "true" : "false")}",
            $"offNadir={UpperBand(r.Geometry1.OffNadirDeg, OffNadirEdges)}",
            $"glint={UpperBand(r.Geometry1.SunGlintAngleDeg, GlintEdges)}",
            $"dayNight={r.FirstDayNight}",
            $"sun={UpperBand(r.Geometry1.SunElevationDeg, SunElevEdges)}",
            $"moon={UpperBand(r.Geometry1.MoonElevationDeg, MoonElevEdges)}",
            $"cover={(r.LandCoverCode is { } lc ? lc.ToString() : "missing")}",
            $"pair={r.SatellitePair}",
        };

        if (includePass2Geometry)
        {
            list.Add($"offNadir2={UpperBand(r.Geometry2.OffNadirDeg, OffNadirEdges)}");
            list.Add($"sun2={UpperBand(r.Geometry2.SunElevationDeg, SunElevEdges)}");
            list.Add($"glint2={UpperBand(r.Geometry2.SunGlintAngleDeg, GlintEdges)}");
            list.Add($"dn2={r.SecondDayNight}");
        }

        if (includeWeatherT1)
            AppendWeatherBins(list, "w1", r.Weather1, weatherGroups);

        if (includeWeatherT2AndInteractions)
        {
            AppendWeatherBins(list, "w2", r.Weather2, weatherGroups);
            AppendWeatherInteractions(list, r, weatherGroups, includeFrpInteractions: true);
        }

        return [.. list];
    }

    /// <summary>Encodes exact viirsDetectionScore.ts sparse feature tokens (with optional pass2/weather).</summary>
    public static string[] EncodePairDetectionBinned(
        PassPairRecord r,
        bool includeIntensity,
        bool includeLandCover,
        bool includePass2Geometry,
        bool includeWeatherT1,
        bool includeWeatherT2AndInteractions,
        WeatherGroupFlags weatherGroups = WeatherGroupFlags.All)
    {
        var list = new List<string>(72);
        if (includeIntensity)
        {
            list.Add($"frpMw={RangeBand(r.Frp1, FrpEdges)}");
            list.Add($"brightnessK={RangeBand(r.Brightness1, BrightEdges)}");
            list.Add($"confidence={RangeBand(r.Confidence1, ConfEdges)}");
        }

        list.Add($"elapsedMinutes={RangeBand(r.ElapsedMinutes, ElapsedEdges)}");
        list.Add($"secondTrackDistanceKm={RangeBand(r.SecondTrackDistanceKm, DistEdges)}");
        list.Add($"secondNadirSwath={(r.SecondNadirSwath ? "true" : "false")}");
        list.Add($"firstOffNadirDeg={RangeBand(r.Geometry1.OffNadirDeg, OffNadirEdges)}");
        list.Add($"firstGlintAngleDeg={RangeBand(r.Geometry1.SunGlintAngleDeg, GlintEdges)}");
        list.Add($"dayNight={r.FirstDayNight}");
        list.Add($"sunElevationDeg={RangeBand(r.Geometry1.SunElevationDeg, SunElevEdges)}");
        list.Add($"moonElevationDeg={RangeBand(r.Geometry1.MoonElevationDeg, MoonElevEdges)}");
        list.Add($"satellitePair={r.SatellitePair}");
        if (includeLandCover)
            list.Add($"landCover={(r.LandCoverCode is { } lc ? lc.ToString() : "missing")}");

        if (includePass2Geometry)
        {
            list.Add($"secondOffNadirDeg={RangeBand(r.Geometry2.OffNadirDeg, OffNadirEdges)}");
            list.Add($"secondSunElevationDeg={RangeBand(r.Geometry2.SunElevationDeg, SunElevEdges)}");
            list.Add($"secondGlintAngleDeg={RangeBand(r.Geometry2.SunGlintAngleDeg, GlintEdges)}");
            list.Add($"secondDayNight={r.SecondDayNight}");
        }

        if (includeWeatherT1)
            AppendWeatherBins(list, "w1", r.Weather1, weatherGroups);

        if (includeWeatherT2AndInteractions)
        {
            AppendWeatherBins(list, "w2", r.Weather2, weatherGroups);
            AppendWeatherInteractions(list, r, weatherGroups, includeFrpInteractions: includeIntensity);
        }

        return [.. list];
    }

    public static string[] EncodeSpotBinned(
        EnrichedSpotRecord r,
        bool includeAcquisitionGeom,
        bool includeScheduleGeom,
        bool includeWeather,
        bool includeLandCover,
        bool includeSensorMeta = true)
    {
        var list = new List<string>(56);
        if (includeSensorMeta)
        {
            list.Add($"sat={r.Satellite}");
            list.Add($"inst={r.Instrument}");
        }

        if (includeAcquisitionGeom)
        {
            list.Add($"dn={r.DayNight}");
            list.Add($"offNadir={RangeBand(r.Geometry1.OffNadirDeg, OffNadirEdges)}");
            list.Add($"viewZenith={RangeBand(r.Geometry1.ViewZenithDeg, OffNadirEdges)}");
            list.Add($"slant={RangeBand(r.Geometry1.SlantRangeKm, [800, 950, 1150, 1400, 1700])}");
            list.Add($"glint={RangeBand(r.Geometry1.SunGlintAngleDeg, GlintEdges)}");
            list.Add($"relAz={RangeBand(r.Geometry1.SunRelativeAzimuthDeg, [30, 60, 90, 120, 150])}");
            list.Add($"sun={RangeBand(r.Geometry1.SunElevationDeg, SunElevEdges)}");
            list.Add($"moon={RangeBand(r.Geometry1.MoonElevationDeg, MoonElevEdges)}");
        }

        if (includeScheduleGeom)
        {
            list.Add($"candPasses={r.SettledTotalPasses6h}");
            list.Add($"candSame={r.SettledSameFamilyPasses6h}");
            list.Add($"candCross={r.SettledCrossFamilyPasses6h}");
            list.Add($"minDist={RangeBand(r.MinCandidateTrackDistKm6h, [100, 250, 400, 600, 800, 1000, 1200])}");
            list.Add($"meanDist={RangeBand(r.MeanCandidateTrackDistKm6h, [200, 450, 700, 950, 1200])}");
            list.Add($"hasNadir={r.HasNadirCandidate6h}");
        }

        if (includeWeather)
            AppendWeatherBins(list, "w1", r.Weather1, WeatherGroupFlags.All);

        if (includeLandCover)
            list.Add($"landCover={(r.LandCoverCode is { } lc ? lc.ToString() : "missing")}");

        if (includeAcquisitionGeom && includeWeather && r.Weather1.GfsAvailable)
        {
            var highCloud = (r.Weather1.CloudCoverPct ?? 0) >= 60 ? "1" : "0";
            var wideOffNadir = (r.Geometry1.OffNadirDeg ?? 0) >= 35 ? "1" : "0";
            list.Add($"ix_cloud_offNadir={highCloud}_{wideOffNadir}");
            var dryWindy = (r.Weather1.VpdKpa ?? 0) >= 1.5 && (r.Weather1.WindSpeed10mMs ?? 0) >= 5.0 ? "1" : "0";
            list.Add($"ix_dryWindy_dn={dryWindy}_{r.DayNight}");
        }

        return [.. list];
    }

    public static (string[] Names, double[][] Columns) BuildPairContinuousMatrix(
        IReadOnlyList<PassPairRecord> rows,
        bool includeIntensity,
        bool includeLandCover,
        bool includePass2Geometry,
        bool includeWeatherT1,
        bool includeWeatherT2,
        WeatherGroupFlags weatherGroups = WeatherGroupFlags.All)
    {
        var specs = new List<(string Name, Func<PassPairRecord, double> Eval)>(80)
        {
            ("src_modis", r => r.FirstInstrument == "modis" ? 1.0 : 0.0),
            ("tgt_modis", r => r.SecondInstrument == "modis" ? 1.0 : 0.0),
            ("sat1_code", r => SatCode(r.FirstSatellite)),
            ("sat2_code", r => SatCode(r.SecondSatellite)),
            ("dn1_day", r => r.FirstDayNight == "D" ? 1.0 : 0.0),
            ("elapsed_min", r => r.ElapsedMinutes),
            ("dist2_km", r => r.SecondTrackDistanceKm),
            ("nadir2", r => r.SecondNadirSwath ? 1.0 : 0.0),
            ("off_nadir1", r => r.Geometry1.OffNadirDeg ?? double.NaN),
            ("view_zenith1", r => r.Geometry1.ViewZenithDeg ?? double.NaN),
            ("slant1_km", r => r.Geometry1.SlantRangeKm ?? double.NaN),
            ("glint1", r => r.Geometry1.SunGlintAngleDeg ?? double.NaN),
            ("sun_rel_az1", r => r.Geometry1.SunRelativeAzimuthDeg ?? double.NaN),
            ("sun_elev1", r => r.Geometry1.SunElevationDeg),
            ("moon_elev1", r => r.Geometry1.MoonElevationDeg),
            ("moon_illum1", r => r.Geometry1.MoonIlluminatedFraction),
        };

        if (includeIntensity)
        {
            specs.Add(("log1p_frp1", r => MathUtil.Log1p(Math.Max(0, r.Frp1))));
            specs.Add(("frp1_mw", r => r.Frp1));
            specs.Add(("br1_k", r => r.Brightness1));
            specs.Add(("sec_br1_k", r => r.SecondaryBrightness1 ?? double.NaN));
            specs.Add(("br_diff1", r => r.SecondaryBrightness1 is { } s ? r.Brightness1 - s : double.NaN));
            specs.Add(("conf1", r => r.Confidence1));
            specs.Add(("scan1_km", r => r.Scan1 ?? double.NaN));
            specs.Add(("track1_km", r => r.Track1 ?? double.NaN));
        }

        if (includeLandCover)
        {
            specs.Add(("lc_code", r => r.LandCoverCode ?? double.NaN));
            specs.Add(("lc_share", r => r.LandCoverShare ?? double.NaN));
        }

        if (includePass2Geometry)
        {
            specs.Add(("dn2_day", r => r.SecondDayNight == "D" ? 1.0 : 0.0));
            specs.Add(("off_nadir2", r => r.Geometry2.OffNadirDeg ?? double.NaN));
            specs.Add(("sun_elev2", r => r.Geometry2.SunElevationDeg));
            specs.Add(("glint2", r => r.Geometry2.SunGlintAngleDeg ?? double.NaN));
            specs.Add(("sun_elev_diff", r => r.Geometry2.SunElevationDeg - r.Geometry1.SunElevationDeg));
        }

        if (includeWeatherT1)
            AddWeatherColumns(specs, "w1", r => r.Weather1, weatherGroups);
        if (includeWeatherT2)
        {
            AddWeatherColumns(specs, "w2", r => r.Weather2, weatherGroups);
            if ((weatherGroups & WeatherGroupFlags.G1Clouds) != 0)
                specs.Add(("w_cloud_delta", r => (r.Weather2.CloudCoverPct - r.Weather1.CloudCoverPct) ?? double.NaN));
            if ((weatherGroups & WeatherGroupFlags.G4ThermoRad) != 0)
                specs.Add(("w_vpd_delta", r => (r.Weather2.VpdKpa - r.Weather1.VpdKpa) ?? double.NaN));
            if ((weatherGroups & WeatherGroupFlags.G3Wind) != 0)
                specs.Add(("w_wind_delta", r => (r.Weather2.WindSpeed10mMs - r.Weather1.WindSpeed10mMs) ?? double.NaN));
        }

        return EvaluateSpecs(specs, rows);
    }

    public static (string[] Names, double[][] Columns) BuildSpotContinuousMatrix(
        IReadOnlyList<EnrichedSpotRecord> rows,
        bool includeAcquisitionGeom,
        bool includeScheduleGeom,
        bool includeWeather,
        bool includeLandCover,
        bool includeSensorMeta = true)
    {
        var specs = new List<(string Name, Func<EnrichedSpotRecord, double> Eval)>(64);
        if (includeSensorMeta)
        {
            specs.Add(("is_modis", r => r.Instrument == "modis" ? 1.0 : 0.0));
            specs.Add(("sat_code", r => SatCode(r.Satellite)));
        }

        if (includeAcquisitionGeom)
        {
            specs.Add(("dn_day", r => r.DayNight == "D" ? 1.0 : 0.0));
            specs.Add(("off_nadir", r => r.Geometry1.OffNadirDeg ?? double.NaN));
            specs.Add(("view_zenith", r => r.Geometry1.ViewZenithDeg ?? double.NaN));
            specs.Add(("view_azimuth", r => r.Geometry1.ViewAzimuthDeg ?? double.NaN));
            specs.Add(("slant_km", r => r.Geometry1.SlantRangeKm ?? double.NaN));
            specs.Add(("sun_elev", r => r.Geometry1.SunElevationDeg));
            specs.Add(("sun_glint", r => r.Geometry1.SunGlintAngleDeg ?? double.NaN));
            specs.Add(("sun_rel_az", r => r.Geometry1.SunRelativeAzimuthDeg ?? double.NaN));
            specs.Add(("sun_look_sep", r => r.Geometry1.SunLookSeparationDeg ?? double.NaN));
            specs.Add(("moon_elev", r => r.Geometry1.MoonElevationDeg));
            specs.Add(("moon_illum", r => r.Geometry1.MoonIlluminatedFraction));
        }

        if (includeScheduleGeom)
        {
            specs.Add(("cand_total_6h", r => r.SettledTotalPasses6h));
            specs.Add(("cand_same_6h", r => r.SettledSameFamilyPasses6h));
            specs.Add(("cand_cross_6h", r => r.SettledCrossFamilyPasses6h));
            specs.Add(("min_cand_dist_km", r => r.MinCandidateTrackDistKm6h ?? double.NaN));
            specs.Add(("mean_cand_dist_km", r => r.MeanCandidateTrackDistKm6h ?? double.NaN));
            specs.Add(("has_nadir_cand", r => r.HasNadirCandidate6h));
        }

        if (includeWeather)
            AddWeatherColumns(specs, "w1", r => r.Weather1, WeatherGroupFlags.All);

        if (includeLandCover)
        {
            specs.Add(("lc_code", r => r.LandCoverCode ?? double.NaN));
            specs.Add(("lc_share", r => r.LandCoverShare ?? double.NaN));
        }

        return EvaluateSpecs(specs, rows);
    }

    private static void AppendWeatherBins(List<string> list, string prefix, WeatherFeatures w, WeatherGroupFlags flags)
    {
        if ((flags & WeatherGroupFlags.G1Clouds) != 0)
        {
            list.Add($"{prefix}_cloud={UpperBand(w.CloudCoverPct, [1, 15, 40, 70, 90])}");
            list.Add($"{prefix}_cwat={UpperBand(w.ColumnCloudWaterKgM2, [0.005, 0.03, 0.1, 0.3])}");
            var ceilLabel = !w.GfsAvailable
                ? "missing"
                : w.CloudCeilingAglM is null ? "clear" : UpperBand(w.CloudCeilingAglM, [500, 1500, 3000, 6000]);
            list.Add($"{prefix}_ceil={ceilLabel}");
        }

        if ((flags & WeatherGroupFlags.G2WaterPrecip) != 0)
        {
            list.Add($"{prefix}_pwat={UpperBand(w.PwatKgM2, [10, 20, 35, 50])}");
            list.Add($"{prefix}_vis={UpperBand(w.VisibilityM, [2000, 10000, 20000])}");
            list.Add($"{prefix}_prate={UpperBand(w.PrecipRateMmH, [0.01, 0.2, 1.0, 5.0])}");
            list.Add($"{prefix}_pany={(w.GfsAvailable ? w.PrecipAny.ToString() : "missing")}");
        }

        if ((flags & WeatherGroupFlags.G3Wind) != 0)
        {
            list.Add($"{prefix}_wind10={UpperBand(w.WindSpeed10mMs, [2, 4, 7, 11])}");
            list.Add($"{prefix}_gust={UpperBand(w.WindGustMs, [4, 8, 12, 18])}");
            list.Add($"{prefix}_wind850={UpperBand(w.WindSpeed850Ms, [3, 6, 10, 15])}");
        }

        if ((flags & WeatherGroupFlags.G4ThermoRad) != 0)
        {
            list.Add($"{prefix}_temp2m={UpperBand(w.Temp2mC, [5, 15, 22, 28, 35])}");
            list.Add($"{prefix}_rh2m={UpperBand(w.Rh2mPct, [25, 45, 65, 80])}");
            list.Add($"{prefix}_vpd={UpperBand(w.VpdKpa, [0.4, 1.0, 2.0, 3.5])}");
            list.Add($"{prefix}_sw={UpperBand(w.ShortwaveRadiationWm2, [10, 150, 450, 750])}");
        }

        if ((flags & WeatherGroupFlags.G5SoilSnow) != 0)
        {
            list.Add($"{prefix}_paw40={UpperBand(w.Paw40Pct, [15, 35, 60, 85])}");
            list.Add($"{prefix}_snow={UpperBand(w.SnowCoverPct, [1, 25])}");
        }

        if ((flags & WeatherGroupFlags.G6Gwis) != 0)
        {
            list.Add($"{prefix}_fwi={UpperBand(w.GwisFwi, [5.2, 11.2, 21.3, 38, 50])}");
            list.Add($"{prefix}_ffmc={UpperBand(w.GwisFfmc, [60, 75, 85, 90])}");
            list.Add($"{prefix}_dc={UpperBand(w.GwisDc, [100, 250, 450, 700])}");
            list.Add($"{prefix}_light={UpperBand(w.GwisLightning, [0.001, 0.05, 0.5])}");
        }
    }

    private static void AppendWeatherInteractions(
        List<string> list, PassPairRecord r, WeatherGroupFlags flags, bool includeFrpInteractions)
    {
        if ((flags & WeatherGroupFlags.G1Clouds) != 0 && r.Weather2.GfsAvailable)
        {
            var cloudy2 = (r.Weather2.CloudCoverPct ?? 0) >= 60 ? "cloudy" : "clearish";
            var edge2 = r.SecondTrackDistanceKm >= 800 ? "edge" : "inner";
            list.Add($"ix_cloud2_dist2={cloudy2}_{edge2}");
            if (includeFrpInteractions)
                list.Add($"ix_cloud2_frp={cloudy2}_{UpperBand(r.Frp1, [10, 50])}");
        }

        if ((flags & WeatherGroupFlags.G1Clouds) != 0 && (r.Weather1.GfsAvailable && r.Weather2.GfsAvailable))
        {
            var c1 = (r.Weather1.CloudCoverPct ?? 0) >= 60 ? 1 : 0;
            var c2 = (r.Weather2.CloudCoverPct ?? 0) >= 60 ? 1 : 0;
            list.Add($"ix_cloud_persist={c1}->{c2}");
        }

        if ((flags & WeatherGroupFlags.G3Wind) != 0 && r.Weather1.GfsAvailable && r.Weather2.GfsAvailable)
        {
            var vpdDelta = (r.Weather2.VpdKpa ?? 0) - (r.Weather1.VpdKpa ?? 0);
            list.Add($"ix_vpd_delta={UpperBand(vpdDelta, [-0.5, 0.0, 0.5])}");
        }

        if ((flags & WeatherGroupFlags.G6Gwis) != 0 && r.Weather1.GwisAvailable)
        {
            var fwiCat = (r.Weather1.GwisFwi ?? 0) >= 21.3 ? "highFwi" : "lowFwi";
            var elapsedCat = r.ElapsedMinutes >= 120 ? "longElapsed" : "shortElapsed";
            list.Add($"ix_fwi_elapsed={fwiCat}_{elapsedCat}");
        }
    }

    private static void AddWeatherColumns<T>(
        List<(string Name, Func<T, double> Eval)> specs,
        string pfx,
        Func<T, WeatherFeatures> getW,
        WeatherGroupFlags flags)
    {
        if ((flags & WeatherGroupFlags.G1Clouds) != 0)
        {
            specs.Add(($"{pfx}_cloud_pct", r => getW(r).CloudCoverPct ?? double.NaN));
            specs.Add(($"{pfx}_cwat", r => getW(r).ColumnCloudWaterKgM2 ?? double.NaN));
            specs.Add(($"{pfx}_ceil_agl", r => getW(r).CloudCeilingAglM ?? double.NaN));
            specs.Add(($"{pfx}_has_ceil", r => getW(r).GfsAvailable ? (getW(r).CloudCeilingAglM.HasValue ? 1.0 : 0.0) : double.NaN));
        }

        if ((flags & WeatherGroupFlags.G2WaterPrecip) != 0)
        {
            specs.Add(($"{pfx}_pwat", r => getW(r).PwatKgM2 ?? double.NaN));
            specs.Add(($"{pfx}_vis_m", r => getW(r).VisibilityM ?? double.NaN));
            specs.Add(($"{pfx}_prate_mmh", r => getW(r).PrecipRateMmH ?? double.NaN));
            specs.Add(($"{pfx}_apcp_mm", r => getW(r).AccumPrecipMm ?? double.NaN));
            specs.Add(($"{pfx}_precip_any", r => getW(r).GfsAvailable ? getW(r).PrecipAny : double.NaN));
        }

        if ((flags & WeatherGroupFlags.G3Wind) != 0)
        {
            specs.Add(($"{pfx}_wind10_ms", r => getW(r).WindSpeed10mMs ?? double.NaN));
            specs.Add(($"{pfx}_gust_ms", r => getW(r).WindGustMs ?? double.NaN));
            specs.Add(($"{pfx}_wind850_ms", r => getW(r).WindSpeed850Ms ?? double.NaN));
            specs.Add(($"{pfx}_shear_10_850", r => getW(r).WindShear10to850Ms ?? double.NaN));
        }

        if ((flags & WeatherGroupFlags.G4ThermoRad) != 0)
        {
            specs.Add(($"{pfx}_temp2m_c", r => getW(r).Temp2mC ?? double.NaN));
            specs.Add(($"{pfx}_dew2m_c", r => getW(r).DewPoint2mC ?? double.NaN));
            specs.Add(($"{pfx}_dew_spread_c", r => getW(r).DewPointSpreadC ?? double.NaN));
            specs.Add(($"{pfx}_rh2m_pct", r => getW(r).Rh2mPct ?? double.NaN));
            specs.Add(($"{pfx}_vpd_kpa", r => getW(r).VpdKpa ?? double.NaN));
            specs.Add(($"{pfx}_surf_temp_c", r => getW(r).SurfaceTempC ?? double.NaN));
            specs.Add(($"{pfx}_surf_press_hpa", r => getW(r).SurfacePressureHpa ?? double.NaN));
            specs.Add(($"{pfx}_shortwave_wm2", r => getW(r).ShortwaveRadiationWm2 ?? double.NaN));
            specs.Add(($"{pfx}_temp850_c", r => getW(r).Temp850C ?? double.NaN));
            specs.Add(($"{pfx}_rh850_pct", r => getW(r).Rh850Pct ?? double.NaN));
        }

        if ((flags & WeatherGroupFlags.G5SoilSnow) != 0)
        {
            specs.Add(($"{pfx}_soil_top", r => getW(r).SoilMoistureTop ?? double.NaN));
            specs.Add(($"{pfx}_paw40_pct", r => getW(r).Paw40Pct ?? double.NaN));
            specs.Add(($"{pfx}_paw100_pct", r => getW(r).Paw100Pct ?? double.NaN));
            specs.Add(($"{pfx}_soil_def40_mm", r => getW(r).SoilDeficit40Mm ?? double.NaN));
            specs.Add(($"{pfx}_snow_pct", r => getW(r).SnowCoverPct ?? double.NaN));
            specs.Add(($"{pfx}_snow_cm", r => getW(r).SnowDepthCm ?? double.NaN));
        }

        if ((flags & WeatherGroupFlags.G6Gwis) != 0)
        {
            specs.Add(($"{pfx}_gwis_fwi", r => getW(r).GwisFwi ?? double.NaN));
            specs.Add(($"{pfx}_gwis_ffmc", r => getW(r).GwisFfmc ?? double.NaN));
            specs.Add(($"{pfx}_gwis_dc", r => getW(r).GwisDc ?? double.NaN));
            specs.Add(($"{pfx}_gwis_lightning", r => getW(r).GwisLightning ?? double.NaN));
        }
    }

    private static (string[] Names, double[][] Columns) EvaluateSpecs<T>(
        List<(string Name, Func<T, double> Eval)> specs,
        IReadOnlyList<T> rows)
    {
        var n = rows.Count;
        var names = new string[specs.Count];
        var cols = new double[specs.Count][];
        for (var f = 0; f < specs.Count; f++)
        {
            names[f] = specs[f].Name;
            var col = new double[n];
            var fn = specs[f].Eval;
            for (var i = 0; i < n; i++) col[i] = fn(rows[i]);
            cols[f] = col;
        }
        return (names, cols);
    }

    private static double SatCode(string sat) => sat switch
    {
        "Terra" => 1.0,
        "Aqua" => 2.0,
        "NOAA-20" => 3.0,
        "NOAA-21" => 4.0,
        _ => 0.0,
    };
}
