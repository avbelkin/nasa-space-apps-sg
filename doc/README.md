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

Build an **Earth-first** interactive web application (powered by **MapLibre GL JS**) that harmonizes MODIS and VIIRS active-fire hotspot records into seasonal burning dynamics and live anomaly layers. Rather than presenting a standalone calendar-first grid, our application keeps **Earth** as the primary canvas and overlays how the **current situation fits or departs from typical calendar baselines** across multi-decade records.

## How We Address the Challenge: Earth-First Seasonal & Anomaly Intelligence

- **Earth-First, Not Calendar-First**: The interactive Earth map (`globe` / `mercator` via MapLibre) is the center of exploration; temporal and calendar controls drive and contextualize the geospatial view rather than replacing it with a static table or matrix.
- **Seasonal Dynamics + Current Anomaly Fit/Deviation**: Users scrub across the climatological burning cycle (harmonized 2000–present MODIS + VIIRS baseline) side-by-side with the **current/selected situation**, immediately distinguishing *expected seasonal burning* ("fits typical calendar window") from *calendar anomalies* (unusually early/late season onset, out-of-season ignitions, or above-norm intensity spikes).
- **Spatial + Perimeter Interaction Model**: Outer wrapper controls surround the map for mode selection, seasonal/calendar timeline scrubbing, and regional anomaly inspection, while tactical layer, projection, and legend HUD controls sit directly over the map inside the map's own CSS Grid container.

## Target Users

- **Emergency Responders & Early-Warning Agencies**: Anticipate critical fire seasons and spot unusual out-of-season anomalies.
- **Wildfire Firefighters & Operations Teams**: Assess regional burning baselines and recent thermal escalation.
- **Land & Forestry Managers**: Track long-term agricultural or peatland burning patterns and policy impacts.
- **Earth Science Researchers**: Compare sensor coverage, calibration residuals, and decadal climate-fire trends.

## Key Functional Goals

1. **Earth-First AOI & Spatial Exploration**: Interactive MapLibre globe/map allowing users to inspect global or regional fire regimes, draw/select an Area of Interest (AOI), and toggle between harmonized, MODIS (1 km), and VIIRS (375 m) views.
2. **Sensor Harmonization Pipeline**: Normalize MODIS (1 km) and VIIRS (375 m) hotspot detections onto a consistent spatiotemporal representation—accounting for pixel geometry (`scan` × `track`), multi-pass overlap/deduplication, confidence filtering, and cross-calibrated intensity metrics (e.g., Fire Radiative Power [`FRP`] or gridded burned-cell indices).
3. **Seasonal & Calendar Baseline Comparison**: Drive the Earth map with a seasonal/calendar timeline scrubber showing typical historical activity alongside current conditions so users can see whether ongoing activity fits expected seasonal windows.
4. **Anomaly Detection & Decision Support**: Highlight positive/negative calendar departures, out-of-season thermal activity, and extreme intensity episodes using accessible color ramps, clear text badges, and focused metrics.

## Primary Data Sources

- **NASA FIRMS Active Fire Archives & APIs**:
  - **MODIS Collection 6.1** (`MOD14` / `MYD14` — 1 km)
  - **VIIRS 375 m** (`VNP14IMGTDL` / `VJ114IMGTDL` / `VJ214IMGTDL`)
- Core attributes used for harmonization and filtering: `latitude`, `longitude`, `acq_date`, `acq_time`, `satellite`, `instrument`, `confidence`, `frp`, `scan`, `track`, and `daynight`.

## Branding & Data Attribution

- **Provisional UI Title**: Use **Earth Fire Calendar** for now (subject to later reconsideration).
- **No NASA Branding or Logos**: Although built for the 2026 NASA Space Apps Challenge, the application must not be branded as a NASA project/product or display NASA or Space Apps logos/insignias.
- **Explicit NASA Data Attribution**: Whenever NASA datasets, APIs, or mission/sensor parameters are used (such as NASA FIRMS feeds/archives, Terra/Aqua MODIS, or NOAA/NASA JPSS VIIRS), expose clear factual NASA data attribution alongside a non-affiliation/non-endorsement statement, and clearly indicate when illustrative/stub baselines are displayed.

See [architecture-and-harmonization.md](./architecture-and-harmonization.md) for how this repository's React UI and ASP.NET Core backend divide the workload.
