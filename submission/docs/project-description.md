# Earth Fire Calendar: project page text

[Slides](demo-slides.md) · [Video script](demo-video.md) · [Project page text](project-description.md) · [Technical note](technical-note.md) · [Form fields](form-fields.md) · [Formal requirements](formal-requirements.md) · [Advice](advice.md)

Draft text for the **Project** tab, field by field, in the order of the [form](form-fields.md). It describes the app as of commit `3da451f` (15 November 2026, 17:47 SGT). Replace everything in `[square brackets]` before submitting; the items the team still has to confirm are collected in [Before submitting](#before-submitting).

The live numbers come from one snapshot of the app's feed, fetched on 15 November 2026 at 08:36 UTC; its summary is saved in [`firms-snapshot-2026-11-15T0836Z.json`](../assets/firms-snapshot-2026-11-15T0836Z.json). If the slides or the video use a different snapshot, use one set of numbers everywhere.

## 1. Project Name

```text
Earth Fire Calendar
```

## 2. High-Level Project Summary

170 words; the official video recommends 50–200.

```text
Earth Fire Calendar shows, on a live 3D globe, every active-fire detection that NASA FIRMS published in the last 24 hours from MODIS (Terra, Aqua) and VIIRS (NOAA-20, NOAA-21), and lets you switch between the two sensors. The same day looks very different: on 15 November 2026 at 08:36 UTC, VIIRS reported 79,349 detections and MODIS 8,127. The two sets of detections overlap only in part, which is why the MODIS record since 2000 and the newer VIIRS record cannot simply be joined.

To explain the gap, not only show it, the app attaches to each detection the conditions under which it was observed: viewing geometry, land cover inside the pixel footprint and weather at acquisition time. This is the evidence a harmonization method needs.

The app is a tool for studying this difference and a source of detection-level data for research. Harmonization rules, and a test of whether fire radiative power can be predicted from weather conditions, are what we explore next; they are not part of this prototype.
```

## 3. Link to Project Demo

`[public link to the 30-second video]` — recorded from the [video script](demo-video.md).

## 4. Link to Final Project

```text
https://avbelkin.github.io/nasa-space-apps-sg/#z=3&lat=1.3521&lng=103.8198&sensor=modis&proj=globe&orbits=0&clouds=0&lights=0&rain=0
```

## 5. Detailed Project Description

```text
THE PROBLEM

For more than two decades satellites have recorded where the Earth is burning. The record is split between two sensor families. MODIS, on Terra and Aqua, has about 1 km pixels at nadir and a record that starts in 2000. VIIRS, on Suomi NPP, NOAA-20 and NOAA-21, has 375 m pixels and a record that starts in 2012. VIIRS sees smaller and cooler fires, so it reports many more detections of the same burning. Joined without adjustment, the two records would show a jump in fire activity when VIIRS starts, even if nothing changed on the ground.

An emergency manager asks a simple question: is fire activity in my area this month normal for the season? Answering it needs one consistent record, and building that record needs to know when and why the two sensors disagree.

WHAT WE BUILT

Earth Fire Calendar is a public web app. It works on live NASA FIRMS data, with no sample or synthetic values.

1. A live globe of detections. The app shows every detection from the last 24 hours in three FIRMS near-real-time datasets: MODIS, VIIRS NOAA-20 and VIIRS NOAA-21. Dot size follows fire radiative power (FRP), brightness follows detection confidence, and the pulse fades with the age of the detection.

2. A sensor switch. "All sensors", "MODIS" and "VIIRS" filter the map, the counters and the satellite tracks. On 15 November 2026 at 08:36 UTC the same 24 hours held 8,127 MODIS detections (Terra 2,614; Aqua 5,513) and 79,349 VIIRS detections (NOAA-20 41,306; NOAA-21 38,043): almost ten times more.

3. Agreement at a glance. With "Color fire spots by sensor" on, each group of neighbouring detections is coloured by who saw it: both sensors, MODIS only, VIIRS only, or a single detection.

4. One place, 24 hours. Selecting a fire pins a timeline of all detections at that place, hour by hour and satellite by satellite, against the local Sun elevation. It also marks the hours when a satellite passed over and reported nothing, and the most recent passes whose data is probably still being processed. Both are estimates from orbital elements, not FIRMS data: a pass without a detection does not prove there was no fire.

5. The conditions of each observation. For the pinned detections the app shows, side by side for MODIS and VIIRS:
- estimated viewing geometry: off-nadir angle, distance to the satellite, Sun and Moon elevation, glint angles;
- land cover inside the pixel footprint, from the 2019 ESA CCI / Copernicus C3S land cover map;
- weather at the acquisition time: temperature, humidity, wind, cloud over the footprint, precipitation, lightning, snow, aerosol, soil moisture, fire-weather index and dead-fuel moisture, where each source has coverage.

6. Context layers. Satellite ground tracks and scan swaths, cloud imagery, GPM IMERG precipitation and VIIRS Black Marble night lights can be switched on and off.

HOW IT WORKS

The interface is a static React and MapLibre GL JS application on GitHub Pages. A small ASP.NET Core service on Google Cloud Run queries the NASA FIRMS Area API, keeps the FIRMS key on the server, caches a snapshot for 20 minutes and serves a rolling 24-hour window.

The service then enriches the detections in the background. It estimates the viewing geometry of each detection by propagating the satellite's orbit from CelesTrak orbital elements to the acquisition time. It samples the land cover map over a circle with the same area as the FIRMS scan-by-track pixel. It samples weather at the acquisition time from NOAA model and satellite products, Open-Meteo, Copernicus fire-danger and drought services and the US Forest Service, and keeps the source, valid time and unit of every value: model and fire-danger fields in the background for the most recent detections, every field for the detections you pin. Weather samples are shared between service instances and expire 24 hours after the acquisition. Missing values stay empty with no substitute. The side panel shows how far each enrichment stage has progressed.

WHY THESE FIELDS

Our literature review (82 sources, linked below) shows that existing harmonization methods convert between the two pixel systems mainly by geometry and statistics: pixel footprint, view angle, overpass time. Land cover is already used too. The open question we want to test is narrower: does the way the MODIS–VIIRS difference changes with view angle depend on the detailed land-cover class, at the level of individual detections, and does accounting for it improve on existing corrections? The enrichment in this prototype produces exactly the per-detection fields that test needs.

WHAT IS LIVE AND WHAT IS PLANNED

Working today, on live data: the 24-hour detections, the sensor switch and counters, colouring by sensor, the pinned timeline, the geometry, land-cover and weather enrichment, and the context layers.

Not built yet: the FIRMS archive since 2000, the harmonized record itself, its validation, free selection of an area and dates, and data export. "All sensors" shows the two sensors together without calibration or removal of duplicates; it is not a harmonized product.

WHAT WE HOPE TO ACHIEVE

The goal is a record in which MODIS and VIIRS are comparable, and a tool that lets researchers see where and under what conditions the two sensors disagree. We also want to test whether a detection's fire radiative power can be predicted from the weather and observation conditions we collect. A seasonal calendar for emergency managers, the original idea behind the name, could be built on such a record later. The next milestone is a harmonized record for one region that passes a hold-out test: hide one sensor during the years when both flew, reconstruct it from the other, and compare with simple baselines using pass criteria fixed in advance. If calibration fails the test, we will show each sensor separately and label the combined view experimental.

LIMITATIONS

- A detection is a hot pixel seen on one satellite pass, not an individual fire, and not every detection is a vegetation fire.
- The viewing geometry is our estimate from public orbital elements, not the instruments' own per-pixel geolocation.
- Land cover is a fixed 2019 map; at the global scale it is sampled from a 1.2 km overview.
- Weather coverage differs by source: some products cover only the Americas or the contiguous United States, and model values are not observations.
- The app does not forecast fires and is not an operational alerting tool.

WHAT WE CONSIDERED

- Cost and access: the app needs no account or key from the user, the interface is a static site, and the service can scale to zero when idle.
- Accessibility: keyboard navigation, light, dark and high-contrast themes, a reduced-motion mode, and text labels next to colour.
- Honesty of the picture: every value keeps its source and time; estimates are labelled as estimates.

TOOLS

TypeScript, React, Vite, MapLibre GL JS and WebGL2 shaders for the interface; C# on .NET 10 with ASP.NET Core for the service; GitHub Actions, GitHub Pages, Google Cloud Run and Firestore for build, hosting and the shared weather cache. Automated tests cover FIRMS parsing, the orbit and geometry calculations, land-cover sampling, the weather samplers and the weather cache.

USE OF AI

AI coding assistants ([Anthropic Claude Code, OpenAI Codex — confirm the list]) were used to write and review code and to draft documentation, the presentation text and the demo script. [Confirm: AI assistance in compiling the literature review.] The app itself does not generate AI content: everything it shows comes from the data sources listed below. The idea of the project is the team's own.

Independent project. Not affiliated with or endorsed by NASA.

MATERIALS

- Slides: [link to the PDF in the repository]
- Technical note: https://github.com/avbelkin/nasa-space-apps-sg/blob/main/submission/docs/technical-note.md
- Literature review: https://github.com/avbelkin/nasa-space-apps-sg/blob/main/submission/docs/modis-viirs-harmonization-literature-review.md
- Code: https://github.com/avbelkin/nasa-space-apps-sg
```

Screenshots to insert in this field, each taken from the version that is submitted:

| No. | Screenshot | Caption |
|---|---|---|
| 1 | Globe, **MODIS** selected, counters visible | `Live NASA FIRMS · last 24 h · MODIS` |
| 2 | Same view, **VIIRS** selected | `Live NASA FIRMS · same 24 h · VIIRS` |
| 3 | **All sensors** with **Color fire spots by sensor** on, zoomed to one region | `Who saw it: both sensors, MODIS only, VIIRS only` |
| 4 | Pinned group: timeline plus the geometry table with MODIS and VIIRS columns | `One place, 24 hours: detections, passes and viewing geometry` |
| 5 | Same pinned group with **Weather at acquisition** open and the land-cover line visible | `Conditions of each observation` |

## 6. Use of Super Intelligence (SI)

Tick every option that applies. From what the repository shows:

- **Code generation tools** — yes: `Co-Authored-By: Claude` trailers in 23 of 156 commits, branches named `codex/*`, an `AGENTS.md` in the root.
- **Large language models for text** — yes: drafts of the documentation, the slide text, the video script and this page.
- **Image or video generation** — `[confirm: how og-preview.png was made]`. If it was generated, it needs a visible watermark.
- **Machine learning in the project itself** — no: the app has no model and makes no AI calls.

The form's exact option names have not been seen; match them on the form.

## 7. NASA Data

```text
NASA FIRMS (Fire Information for Resource Management System) — the core data of the project. The service queries the FIRMS Area API for three near-real-time active-fire datasets: MODIS_NRT (MODIS Collection 6.1 on Terra and Aqua, 1 km), VIIRS_NOAA20_NRT and VIIRS_NOAA21_NRT (VIIRS 375 m). Every point, counter, timeline and comparison in the app is built from these detections and their attributes: position, acquisition time, satellite, confidence, fire radiative power, brightness temperature, scan and track pixel size, day/night flag.
https://firms.modaps.eosdis.nasa.gov/

NASA GIBS (Global Imagery Browse Services) — context layers, requested directly by the app:
- IMERG_Precipitation_Rate_30min (GPM IMERG half-hourly precipitation rate) — the rain layer, with the GPM precipitation colour scale;
- VIIRS_NOAA20_GapFilled_BRDF_Corrected_DayNightBand_Radiance (VIIRS Black Marble) — night lights on the night side of the globe.
https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api

NASA / NOAA VIIRS imagery from NASA GIBS is also part of the high-latitude cloud layer; it reaches the app already blended into the Extremum cloud tiles.

NASA algorithm documentation used to define the viewing-geometry and glint fields and to choose the enrichment fields: the MODIS Collection 6 active fire algorithm paper and user guide, and the VIIRS 375 m active fire algorithm theoretical basis document and user guide.
```

The backend also has `/api/nasa/epic` and `/api/nasa/wildfires` endpoints (DSCOVR EPIC, EONET). The interface does not use them, so they are not listed.

## 8. Space Agency Partner Data and Other References

The licence column records what we believe applies; the rows marked **check** have not been verified against the provider's terms. The ⛔ rule: licences of all third-party materials must be named in the submitted documentation.

**Partner space agency data**

| Source | Role in the project | Licence or terms |
|---|---|---|
| **ESA** — Climate Change Initiative Land Cover, continued by the Copernicus Climate Change Service (C3S) land cover map v2.1.1, year 2019; Cloud Optimized GeoTIFFs hosted by Microsoft Planetary Computer. [DOI](https://doi.org/10.24381/cds.006f2c9a) | Land cover inside each detection's footprint | ESA CCI and C3S licences, attribution required — **check** |
| **ESA** — Hipparcos catalogue; Yale Bright Star Catalogue | About 230 bright stars in the background of the globe | **check**; confirm the exact provenance of the table in `brightStarCatalog.ts` with its author |
| Contains modified **Copernicus Sentinel** data 2025 — Sentinel-2 cloudless by EOX IT Services GmbH, [s2maps.eu](https://s2maps.eu) | Earth basemap | **CC BY-NC-SA 4.0, non-commercial only** — conflicts with the rule on third-party materials; see [status](formal-requirements.md#earth-fire-calendar-status-against-the-formal-requirements) |

**Other data**

| Source | Role in the project | Licence or terms |
|---|---|---|
| [CelesTrak](https://celestrak.org/) — orbital elements (GP / TLE) for Terra, Aqua, NOAA-20, NOAA-21, including fallback sets embedded in the source | Satellite tracks, swaths, estimated viewing geometry, passes without a detection | **check** |
| [Extremum SAR GIS](https://gis.extremum.org) — cloud tiles built from EUMETSAT, NOAA and JMA geostationary imagery and NASA/NOAA VIIRS imagery | Cloud layer, proxied through our service | **check**: terms not recorded |
| NOAA GFS — model fields from NOMADS and the NOAA open data mirror on AWS | Weather at acquisition: temperature, humidity, wind, cloud, precipitation type, snow, soil water | US Government work, public domain — **check** |
| NOAA GOES-R ABI and GLM — open data on AWS | Brightness temperature, cloud class, fraction, optical depth, height and phase, smoke flag, lightning flashes (GOES East and West coverage) | US Government work, public domain — **check** |
| NOAA nowCOAST — radar mosaic and global satellite mosaic (GMGSI) | Radar reflectivity and satellite imagery samples | US Government work, public domain — **check** |
| NOAA Climate Prediction Center — weekly NLDAS Noah soil-moisture anomalies | Soil-moisture departures by depth (North America) | US Government work, public domain — **check** |
| [Open-Meteo](https://open-meteo.com/) — forecast and air-quality APIs | Weather codes, precipitation totals, aerosol and pollutants | Data CC BY 4.0; free API for non-commercial use — **check** |
| [Copernicus GWIS](https://gwis.jrc.ec.europa.eu/) (European Commission JRC) | Fire Weather Index, danger class, fuel-moisture and drought codes, modelled lightning | European Commission reuse policy (CC BY 4.0) — **check** |
| Copernicus Global Drought Observatory (European Commission JRC) — [soil-moisture anomaly](https://data.jrc.ec.europa.eu/dataset/4ce9599e-b3e1-406d-a87b-b98b814565da) | Soil-moisture anomaly class | European Commission reuse policy (CC BY 4.0) — **check** |
| [US Forest Service WFAS](https://www.wfas.net/) | 10-, 100- and 1,000-hour dead-fuel moisture (contiguous United States) | US Government work, public domain — **check** |

**Software**

| Component | Licence |
|---|---|
| MapLibre GL JS | BSD-3-Clause |
| React, React DOM | MIT |
| Vite, `@vitejs/plugin-react` | MIT |
| TypeScript | Apache-2.0 |
| oxlint | MIT — **check** |
| .NET 10, ASP.NET Core, `Microsoft.AspNetCore.OpenApi` | MIT |
| PureHDF | MIT — **check** |
| xUnit (tests) | Apache-2.0 — **check** |

Hosting: GitHub Pages, GitHub Actions, Google Cloud Run, Google Cloud Firestore.

**Methods and references**

- Our [literature review](modis-viirs-harmonization-literature-review.md) with its 82 references — the supporting source for the problem statement and the hypothesis.
- Our [design notes](harmonization-design-notes.md) for the harmonized calendar, with the documentation and studies they cite.
- Giglio, Schroeder & Justice (2016), the MODIS Collection 6 active fire detection algorithm; Schroeder et al., the VIIRS 375 m active fire algorithm (ATBD) — definitions of glint and viewing geometry.
- US Naval Observatory approximate solar coordinates; Van Flandern & Pulkkinen low-precision lunar ephemeris — Sun and Moon positions.
- NASA GIBS `GPM_Precipitation_Rate` colour map, ported into the code.
- [NASA Space Apps brand assets](../assets/README.md) — logos, palette and patterns for the slides.
- AI tools: `[list, as in field 5]`.

## 9. Two checkboxes

Tick both after the [checklist](formal-requirements.md#checklist) is closed.

## Before submitting

| What | Why |
|---|---|
| Team name and member names | Placeholders here, on the slides and in the video |
| List of AI tools; whether the literature review and `og-preview.png` were AI-assisted | Fields 5, 6 and 8 must say the same |
| Licence rows marked **check**; the EOX basemap | ⛔ licence rule; the basemap restriction is still open |
| Project licence | There is no `LICENSE` file; without one NASA distributes the work under Apache 2.0 |
| Slides PDF link | The deck is not exported yet |
| Link preview image `og-preview.png` | It still reads "harmonization" and "Seasonal burning baselines & live calendar anomalies"; the app has neither |
| Commit or tag of the submitted version | Replace `3da451f` in the first paragraph and in the [technical note](technical-note.md) |
| Numbers | One snapshot across this page, the slides and the video |
