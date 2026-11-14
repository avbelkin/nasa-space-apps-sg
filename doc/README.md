# Application Purpose: Harmonization of MODIS and VIIRS Hot Spots

## Challenge Overview

- **Event**: 2026 NASA Space Apps Challenge (`nasa-space-apps-sg`)
- **Challenge**: [Harmonization of MODIS and VIIRS Hot Spots](https://www.spaceappschallenge.org/2026/challenges/modis-and-viirs-hot-spots/?tab=details)
- **Difficulty**: Intermediate / Advanced
- **Primary Subjects**: Earth Science, Software, Data Visualization, Disaster Response, Forecasting

## Background & Problem Statement

For over two decades, satellites have tracked global active fire hotspots and thermal anomalies (wildfires, agricultural burns, and land-clearing fires), distributed primarily through **NASA FIRMS** (*Fire Information for Resource Management System*).

However, this long-term historical record is fragmented across two satellite sensor families with distinct spatial resolutions and detection capabilities:

- **MODIS** (*Moderate Resolution Imaging Spectroradiometer*, aboard **Terra** since 2000 and **Aqua** since 2002): provides ~**1 km** nadir spatial resolution, forming the multi-decade historical baseline.
- **VIIRS** (*Visible Infrared Imaging Radiometer Suite*, aboard **Suomi NPP** since 2012, **NOAA-20**, and **NOAA-21**): provides **375 m** spatial resolution with higher sensitivity to smaller or cooler fires and tighter control of off-nadir pixel distortion.

Because raw hotspot counts and pixel sizes are incompatible across instruments, combining uncalibrated MODIS and VIIRS detections creates an artificial surge in apparent burning after VIIRS begins in 2012 and double-counts overlapping satellite overpasses. This prevents emergency planners and scientists from comparing historical fire activity consistently over time.

## Application Purpose

Build an interactive web application that harmonizes MODIS and VIIRS active-fire hotspot records into a consistent **Burning Activity Calendar** and Area-of-Interest (AOI) analytics dashboard, giving users a bias-corrected view of when, where, and how intensely burning occurs across multi-decade records.

## Target Users

- **Emergency Responders & Early-Warning Agencies**: Anticipate critical fire seasons and spot unusual out-of-season anomalies.
- **Wildfire Firefighters & Operations Teams**: Assess regional burning baselines and recent thermal escalation.
- **Land & Forestry Managers**: Track long-term agricultural or peatland burning patterns and policy impacts.
- **Earth Science Researchers**: Compare sensor coverage, calibration residuals, and decadal climate-fire trends.

## Key Functional Goals

1. **Interactive AOI Selection**: Let users explore via an interactive map (draw a custom bounding box/polygon, pick preset regions, or enter latitude/longitude coordinates) and select historical date ranges.
2. **Sensor Harmonization Pipeline**: Normalize MODIS (1 km) and VIIRS (375 m) hotspot detections onto a consistent spatiotemporal representation—accounting for pixel geometry (`scan` × `track`), multi-pass overlap/deduplication, confidence filtering, and cross-calibrated intensity metrics (e.g., Fire Radiative Power [`FRP`] or gridded burned-cell indices).
3. **Unified Burning Activity Calendar**: Visualize multi-year seasonal burning rhythms, peak fire windows, and year-over-year baselines without sensor-transition artifacts.
4. **Anomaly Detection & Decision Support**: Highlight anomalous burning episodes and unexpected seasonal shifts using accessible color ramps and focused, clutter-free metrics.

## Primary Data Sources

- **NASA FIRMS Active Fire Archives & APIs**:
  - **MODIS Collection 6.1** (`MOD14` / `MYD14` — 1 km)
  - **VIIRS 375 m** (`VNP14IMGTDL` / `VJ114IMGTDL` / `VJ214IMGTDL`)
- Core attributes used for harmonization and filtering: `latitude`, `longitude`, `acq_date`, `acq_time`, `satellite`, `instrument`, `confidence`, `frp`, `scan`, `track`, and `daynight`.

See [architecture-and-harmonization.md](./architecture-and-harmonization.md) for how this repository's React UI and ASP.NET Core backend divide the workload.
