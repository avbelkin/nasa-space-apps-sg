# Architecture & Harmonization Design Notes

This repository implements the [Harmonization of MODIS and VIIRS Hot Spots](./README.md) solution as a decoupled static SPA and containerized API.

## System Split

### 1. Frontend (`ui/` — Pure React + TypeScript + Vite on GitHub Pages)

- **Public Availability**: Publicly accessible on GitHub Pages at [https://avbelkin.github.io/nasa-space-apps-sg](https://avbelkin.github.io/nasa-space-apps-sg), deployed via [deploy-ui.yml](../.github/workflows/deploy-ui.yml).
- **Earth-First Mapping Engine (`maplibre-gl`)**: Keyless **MapLibre GL JS** canvas defaulting to a **3D `globe` projection** (with an optional 2D `mercator` toggle) over **EOX Sentinel-2 Cloudless (`s2cloudless-2025_3857`)** raster WMTS imagery (`{z}/{y}/{x}.jpg` with required EOX/Copernicus attribution) to visualize active-fire hotspots, typical seasonal activity bands, and current calendar anomaly departures directly on Earth.
- **Two-Tier CSS Grid Layout**:
  - **Outer Controls Wrapper (`.app-frame`)**: CSS Grid page shell wrapping perimeter controls *around* the map:
    - `topbar` (`<header>`) — Standalone **Earth Fire Calendar** application title (provisional title; no NASA branding or logos), view mode switcher (`Anomaly vs. Typical`, `Seasonal Dynamics`, `Sensor Harmonization`), and Cloud Run backend API health badge/trigger.
    - `timeline` (`<section>`) — Bottom seasonal/calendar scrubber (`Jan`–`Dec`) displaying the typical historical curve alongside current activity and anomaly classification badges.
    - `sidepanel` (`<aside>`) — Regional seasonal-fit vs. anomaly inspector, live satellite orbits, deployment diagnostics, and a `<footer>` block exposing factual data attribution (`NASA FIRMS` sensor/hotspot reference, `CelesTrak` orbital TLEs, and `EOX/Copernicus` Sentinel-2 basemap) plus a NASA non-affiliation notice.
  - **Inner Map CSS Grid Container (`.map-stage`)**: Dedicated CSS Grid stage holding the full-bleed MapLibre canvas across all tracks (`grid-column: 1 / -1; grid-row: 1 / -1`) alongside named overlay grid areas (`hud-top-start`, `hud-top-end`, `hud-bottom-start`) for floating controls positioned *over* the map without brittle pixel offsets, keeping unobstructed map tracks directly interactive, plus MapLibre's `attributionControl` displaying basemap, `NASA FIRMS`, and `CelesTrak` attributions.
- **Sensor Transparency & Accessible Visuals**: Toggle between Harmonized, MODIS (1 km), and VIIRS (375 m) layers with explicit text labels and symbols alongside accessible color ramps so researchers and responders never rely on color alone.
- **URL Hash, LocalStorage & Geolocation State**: Viewport (`z`, `lat`, `lng`) and active UI controls (`mode`, `sensor`, `proj`, `month`, `orbits`, plus extensible feature parameters) sync continuously into `window.location.hash` and `window.localStorage` (`nasa_fire_calendar_url_hash`), restoring in `hash` → `localStorage` → default order. A HUD **My Location** control (and one-time initial load prompt only when no URL hash or saved `localStorage` state exists) jumps to the user's coarse browser geolocation capped at default max zoom `z7`.
- **Live MODIS & VIIRS Orbital Overlay**: Renders time-bound satellite ground tracks (solid past `-45m`, dashed future `+90m`, split across the `±180°` antimeridian), instantaneous sensor scan swaths (`2,330 km` MODIS wide swath on Terra & Aqua; `3,040 km` VIIRS wide swath on NOAA-20 & NOAA-21), and rotated spacecraft badges over the 3D Sentinel-2 globe, updating positions every second on the client via geodesic interpolation between backend track samples.
- **Social Link Preview & Canonical Metadata**: Configures Open Graph (`og:*`) and X/Twitter (`summary_large_image`) tags in `ui/index.html` backed by a `1200×630` hero preview thumbnail (`ui/public/og-preview.png`) with build-time `VITE_SITE_URL` resolution in `ui/vite.config.ts` so deployed GitHub Pages unfurls use absolute HTTPS URLs without NASA branding.

### 2. Backend (`backend/` — ASP.NET Core `.NET 10` Container on Google Cloud Run)

- **CelesTrak TLE Caching & Orbit Propagation (`Satellites/`)**: Downloads TLE catalogs from CelesTrak (`GROUP=resource` for MODIS Terra/Aqua; `GROUP=weather` for VIIRS NOAA-20/NOAA-21), caches them for 12 hours in memory with embedded fallback TLEs, and propagates J2 secular LEO trajectories without blocking client navigation on third-party orbital endpoints.
- **FIRMS Ingestion & Caching Proxy**: Fetches and caches NASA FIRMS archives / near-real-time API feeds server-side so `FIRMS_MAP_KEY` secrets remain protected on Cloud Run and client requests avoid rate-limit failures.
- **Spatiotemporal Harmonization Pipeline**:
  1. **Spatial Gridding**: Maps point detections onto a uniform grid (cell size ≥ 1 km, e.g. fixed equal-area / H3 / degree grid) while accounting for MODIS/VIIRS `scan` × `track` footprint growth toward scan edges.
  2. **Temporal Binning & Deduplication**: Aggregates detections per grid cell within daily/pentad windows to eliminate artificial inflation from multiple same-day satellite overpasses (Terra, Aqua, Suomi NPP, NOAA-20, NOAA-21).
  3. **Cross-Sensor Calibration**: Uses the post-2012 MODIS–VIIRS overlap period to align active-fire cell density and Fire Radiative Power (`FRP`) quantiles into a continuous multi-decade metric.
- **REST API Endpoints**:
  - `GET /health` — Cloud Run readiness/liveness probe.
  - `GET /api/status` — Service metadata and environment diagnostics.
  - `GET /api/satellites/orbits` — Time-bound orbital ground tracks, nadir position, heading, speed, and swath parameters for Terra, Aqua, NOAA-20, and NOAA-21.
  - `GET /api/anomalies/summary` *(planned)* — Regional & AOI current situation summary compared against historical calendar baselines (`fitsTypical`, `anomalyScore`, `zScore`, percentile).
  - `GET /api/seasonal/profile` *(planned)* — Harmonized multi-decade monthly/pentad climatology vs. current-year trajectory for the bottom seasonal scrubber and side inspector.
  - `GET /api/hotspots` *(planned)* — Spatial GeoJSON/vector hotspot clusters and harmonized grid cells for MapLibre rendering within a selected date window and sensor filter.
