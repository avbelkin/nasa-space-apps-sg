# Application Purpose: Harmonization of MODIS and VIIRS Hot Spots

## Challenge Overview

- **Public Web UI**: [https://avbelkin.github.io/nasa-space-apps-sg](https://avbelkin.github.io/nasa-space-apps-sg)
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

Build an **Earth-first** interactive web application (powered by **MapLibre GL JS**) for studying how MODIS and VIIRS active-fire detections differ. It shows what each instrument recorded over the same place in the same rolling 24 hours, and attaches to every detection the surface and observation conditions needed to explain the difference. The detection-level record it produces is first-hand input for harmonization research.

## How We Address the Challenge: Compare in Context, Then Harmonize

**Working now**

- **Side-by-side sensor comparison on Earth**: The interactive Earth map (`globe` / `mercator` via MapLibre) shows live MODIS and VIIRS detections together or separately, colors fire spots by which instrument saw them, and shows each satellite's passes, including passes that recorded no fire.
- **The instruments record different hotspots**: Their detections overlap only in part. Whole regions and observation conditions show one instrument and not the other.
- **Per-detection context**: Each detection carries its viewing geometry, the land cover inside its footprint, and weather conditions at acquisition time, each value with its source and validity time. Published studies link these factors to detection probability and retrieved FRP; see the [literature review](../submission/docs/modis-viirs-harmonization-literature-review.md).

**Exploratory, not yet built**

- **Harmonization rules**: Use the enriched record to find conditions under which MODIS and VIIRS can be brought onto one scale.
- **FRP from conditions**: Test whether FRP can be predicted from weather and observation conditions.

A seasonal calendar of harmonized activity against a multi-year baseline was the original concept and gave the app its provisional title. It is a possible follow-up, not a current goal. Do not describe seasonal baselines, anomaly scores, or calendar controls as existing features.

## Target Users

- **Earth Science Researchers**: Compare sensor coverage and detection differences, and collect detection-level conditions for harmonization studies.
- **Fire Data Analysts & Product Developers**: Check where and under what conditions a MODIS-based record and a VIIRS-based record disagree.
- **Emergency Responders, Land & Forestry Managers**: See current detections from both instruments with pass times and processing delay. This is a secondary audience.

## Key Functional Goals

1. **Earth-First Sensor Comparison**: Interactive MapLibre globe/map with harmonized (all sensors), MODIS (1 km), and VIIRS (375 m) views, sensor-based coloring, and a 24-hour timeline of detections and passes for a pinned location.
2. **Per-Detection Enrichment**: Attach viewing geometry, land cover, and weather at acquisition to each detection, and report the source, validity time, and availability of every value.
3. **Evidence for Harmonization**: Make the differences between instruments inspectable by place and by observation condition, so that harmonization rules can be derived from the record.
4. **Harmonization Experiments** *(exploratory)*: Normalize MODIS and VIIRS detections onto a consistent representation, accounting for pixel geometry (`scan` × `track`), multi-pass overlap, confidence, and FRP, and test FRP prediction from conditions.

## Primary Data Sources

- **NASA FIRMS Active Fire Archives & APIs**:
  - **MODIS Collection 6.1** (`MOD14` / `MYD14` — 1 km)
  - **VIIRS 375 m** (`VNP14IMGTDL` / `VJ114IMGTDL` / `VJ214IMGTDL`)
- Core attributes used for harmonization and filtering: `latitude`, `longitude`, `acq_date`, `acq_time`, `satellite`, `instrument`, `confidence`, `frp`, `scan`, `track`, and `daynight`.

## Branding & Data Attribution

- **Provisional UI Title**: Use **Earth Fire Calendar** for now (subject to later reconsideration).
- **No NASA Branding or Logos**: Although built for the 2026 NASA Space Apps Challenge, the application must not be branded as a NASA project/product or display NASA or Space Apps logos/insignias.
- **Explicit NASA Data Attribution**: Whenever NASA datasets, APIs, or mission/sensor parameters are used (such as NASA FIRMS feeds/archives, Terra/Aqua MODIS, or NOAA/NASA JPSS VIIRS), expose clear factual NASA data attribution alongside a non-affiliation/non-endorsement statement.
- Add or update attribution for map layers and data sources in **Sources and credits** in the side panel footer. List NASA FIRMS first, then other NASA sources, and Extremum last.

See [architecture-and-harmonization.md](./architecture-and-harmonization.md) for how this repository's React UI and ASP.NET Core backend divide the workload.
