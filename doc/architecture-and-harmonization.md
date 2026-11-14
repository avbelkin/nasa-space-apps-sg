# Architecture & Harmonization Design Notes

This repository implements the [Harmonization of MODIS and VIIRS Hot Spots](./README.md) solution as a decoupled static SPA and containerized API.

## System Split

### 1. Frontend (`ui/` — Pure React + TypeScript + Vite on GitHub Pages)

- **AOI Explorer & Map Selector**: Interactive map view allowing users to draw/select an Area of Interest (bounding box, coordinates, or regional presets) and choose historical time windows.
- **Burning Activity Calendar**: Calendar heatmap and seasonal timeline comparing current-year fire activity against a harmonized multi-decade baseline (2000–present), built with accessible, colorblind-safe color ramps and clear numeric summaries.
- **Sensor Transparency View**: Side-by-side breakdown showing raw MODIS detections, raw VIIRS detections, and the harmonized index so researchers and responders can inspect how the 2012+ transition is normalized.

### 2. Backend (`backend/` — ASP.NET Core `.NET 10` Container on Google Cloud Run)

- **FIRMS Ingestion & Caching Proxy**: Fetches and caches NASA FIRMS archives / near-real-time API feeds server-side so `FIRMS_MAP_KEY` secrets remain protected on Cloud Run and client requests avoid rate-limit failures.
- **Spatiotemporal Harmonization Pipeline**:
  1. **Spatial Gridding**: Maps point detections onto a uniform grid (cell size ≥ 1 km, e.g. fixed equal-area / H3 / degree grid) while accounting for MODIS/VIIRS `scan` × `track` footprint growth toward scan edges.
  2. **Temporal Binning & Deduplication**: Aggregates detections per grid cell within daily/pentad windows to eliminate artificial inflation from multiple same-day satellite overpasses (Terra, Aqua, Suomi NPP, NOAA-20, NOAA-21).
  3. **Cross-Sensor Calibration**: Uses the post-2012 MODIS–VIIRS overlap period to align active-fire cell density and Fire Radiative Power (`FRP`) quantiles into a continuous multi-decade metric.
- **Planned REST API Endpoints**:
  - `GET /health` — Cloud Run readiness/liveness probe (implemented stub).
  - `GET /api/status` — Service metadata and environment diagnostics (implemented stub).
  - `GET /api/aoi/calendar` *(planned)* — Harmonized daily/weekly burning calendar series and historical percentile baselines for an AOI.
  - `GET /api/aoi/timeseries` *(planned)* — Raw MODIS vs. raw VIIRS vs. harmonized yearly/seasonal comparison series.
  - `GET /api/aoi/hotspots` *(planned)* — Filtered spatial hotspot points/grid cells for map rendering within a selected date window.
