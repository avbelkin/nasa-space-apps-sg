# Earth Fire Calendar: project page text

[Slides](../presentation/demo-slides.md) · [Video script](../video/demo-video.md) · [Project page text](project-description.md) · [Technical note](technical-note.md) · [Form fields](../working/form-fields.md) · [Formal requirements](../docs/formal-requirements.md) · [Advice](../docs/advice.md)

Draft text for the **Project** tab, field by field, in the order of the [form](../working/form-fields.md). It describes the app as of commit `c16b7b7` (15 November 2026, deployed at 21:01 SGT). Team Plush: Alexey Belkin and Viktoriia Naiman. Replace unresolved publication links before submitting; the items the team still has to confirm are collected in [Before submitting](#before-submitting).

The live numbers come from one snapshot of the app's feed, fetched on 15 November 2026 at 08:36 UTC; its summary is saved in [`firms-snapshot-2026-11-15T0836Z.json`](../working/firms-snapshot-2026-11-15T0836Z.json). If the slides or the video use a different snapshot, use one set of numbers everywhere.

## 1. Project Name

```text
Earth Fire Calendar
```

## 2. High-Level Project Summary

198 words; the official video recommends 50–200.

```text
Earth Fire Calendar shows, on a live 3D globe, every active-fire detection that NASA FIRMS published in the last 24 hours from MODIS (Terra, Aqua) and VIIRS (NOAA-20, NOAA-21), and lets you switch between the two sensors. The same day looks very different: on 15 November 2026 at 08:36 UTC, VIIRS reported 79,349 detections and MODIS 8,127. The two sets of detections overlap only in part, which is why the MODIS record since 2000 and the newer VIIRS record cannot simply be joined.

To explain the gap, not only show it, the app attaches to each detection the conditions under which it was observed: viewing geometry, land cover inside the pixel footprint and weather at acquisition time. This is the evidence a harmonization method needs.

The app is a tool for studying this difference and a source of detection-level data for research. As a first use of that evidence, it notes when another satellite passed over a detection and reported nothing, and gives experimental one-day estimates of what the next pass would report; fire-weather and aerosol fields improved some of them on held-out regions. A harmonized record is what we explore next; it is not part of this prototype.
```

## 3. Link to Project Demo

`[public link to the 30-second video]` — recorded from the [video script](../video/demo-video.md).

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

Earth Fire Calendar is a public web app. It works on live NASA FIRMS data, with no sample or synthetic detections. Experimental model estimates are shown separately.

1. A live globe of detections. The app shows every detection from the last 24 hours in three FIRMS near-real-time datasets: MODIS, VIIRS NOAA-20 and VIIRS NOAA-21. Dot size follows fire radiative power (FRP), brightness follows detection confidence, and the pulse fades with the age of the detection.

2. A sensor switch. "All sensors", "MODIS" and "VIIRS" filter the map, the counters and the satellite tracks. On 15 November 2026 at 08:36 UTC the same 24 hours held 8,127 MODIS detections (Terra 2,614; Aqua 5,513) and 79,349 VIIRS detections (NOAA-20 41,306; NOAA-21 38,043): almost ten times more.

3. Agreement at a glance. With "Color fire spots by sensor" on, each group of neighbouring detections is coloured by the sensors represented: both sensors, MODIS only, VIIRS only, or a single detection. Groups depend on screen-space proximity and zoom; they do not establish the identity of an individual fire.

4. One place, 24 hours. Selecting a detection or a group pins a timeline of all detections at that place, hour by hour and satellite by satellite, against the local Sun elevation. It also marks the hours when a satellite passed over and reported nothing, and the most recent passes whose data is probably still being processed. Both are estimates from orbital elements, not FIRMS data: a pass without a detection does not prove there was no fire.

5. The conditions of each observation. For the pinned detections the app shows, side by side for MODIS and VIIRS:
- estimated viewing geometry: off-nadir angle, distance to the satellite, Sun and Moon elevation, glint angles;
- land cover inside the pixel footprint, from the 2019 ESA CCI / Copernicus C3S land cover map;
- weather at the acquisition time: temperature, humidity, wind, cloud over the footprint, precipitation, lightning, snow, aerosol, soil moisture, fire-weather index and dead-fuel moisture, where each source has coverage.

6. What the next pass may show. For a single pinned detection the app notes a predicted pass by another satellite, of the same sensor or the other one, that reported nothing there, and says under which conditions our one-day baseline saw fewer or more such misses. When the other VIIRS satellite passed over a VIIRS detection, our model scored that pass at 70% or more for detecting it, and FIRMS has no detection within 1 km, the app flags it as "Expected detection, no match". It also shows the fire radiative power the next pass would report if it detects the fire. For a pass by the other satellite of the same sensor, it shows how weather changes the model's detection odds: Copernicus GWIS fire-weather fields for MODIS, Copernicus CAMS aerosol fields for VIIRS. For MODIS the GWIS model also gives the power estimate. All of these are experimental outputs of our own models, labelled as such next to each value: they are fitted on one 24-hour snapshot and have not been checked on other days, and the detection score is not a validated probability.

7. Context layers. Satellite ground tracks and scan swaths, cloud imagery, GPM IMERG precipitation and VIIRS Black Marble night lights can be switched on and off. The precipitation layer shows the latest available data and refreshes every 10 minutes while visible.

HOW IT WORKS

The interface is a static React and MapLibre GL JS application on GitHub Pages. A small ASP.NET Core service on Google Cloud Run queries the NASA FIRMS Area API, keeps the FIRMS key on the server, caches a snapshot for 20 minutes and serves a rolling 24-hour window.

The service then enriches the detections in the background. It estimates the viewing geometry of each detection by propagating the satellite's orbit from CelesTrak orbital elements to the acquisition time. It samples the land cover map over a circle with the same area as the FIRMS scan-by-track pixel. It samples weather at the acquisition time from NOAA model and satellite products, Open-Meteo (including Copernicus CAMS aerosols), Copernicus fire-danger and drought services and the US Forest Service, and keeps the source, valid time and unit of every value: model and fire-danger fields in the background for the most recent detections, every field for the detections you pin. The weather grids the service downloads are stored in a shared cache, so every service instance can sample them; a worker the team starts by hand can fill this cache for the whole feed. Missing values stay empty with no substitute. The side panel shows how far each enrichment stage has progressed.

The first models use one 24-hour snapshot from 14–15 November 2026. They combine the first detection's readings, estimated satellite geometry and land cover to predict whether another pass will report a match (AUROC 0.64–0.77 on held-out geographic blocks, depending on the sensor pair) and what FRP it may report if it does (15,869 matched pairs). We then tested weather on the same held-out blocks with and without each source. For MODIS → MODIS, GWIS fire-weather fields improved detection ranking (AUROC 0.597 → 0.669 on 172 held-out passes) and the FRP estimate (mean error 12.91 → 9.86 MW on 87 matched pairs). For VIIRS → VIIRS, CAMS aerosol fields improved detection ranking (0.652 → 0.696 on 191 passes) but not the FRP estimate (3.10 → 3.49 MW on 95 pairs), so the app keeps the original estimate there. NOAA GFS fields alone helped in no direction. Where GWIS or CAMS fields are available, the pinned card shows how they change the study model's detection odds; for MODIS it also uses GWIS for the conditional FRP estimate. The calibrated score for the VIIRS warning is a separate value. [Methods and results](technical-note.md#6-first-baselines-on-matched-passes)

WHY THESE FIELDS

Our literature review (82 sources, linked below) shows that existing harmonization methods convert between the two pixel systems mainly by geometry and statistics: pixel footprint, view angle, overpass time. Land cover is already used too. The open question we want to test is narrower: does the way the MODIS–VIIRS difference changes with view angle depend on the detailed land-cover class, at the level of individual detections, and does accounting for it improve on existing corrections? The prototype collects an initial set of per-detection fields for that test. Estimated geometry and the 1.2 km global land-cover overview require validation and finer sampling before a detailed surface-class test.

WHAT IS LIVE AND WHAT IS PLANNED

Working today, on live data: the 24-hour detections, the sensor switch and counters, colouring by sensor, the pinned timeline, the geometry, land-cover and weather enrichment, and the context layers. Experimental, from a one-day baseline: the notes on unmatched passes, the "Expected detection, no match" flag, the estimated fire radiative power on the next pass, and the GWIS- and CAMS-assisted detection odds.

Not built yet: the FIRMS archive since 2000, the harmonized record itself, its validation, free selection of an area and dates, and data export. "All sensors" shows the two sensors together without calibration or removal of duplicates; it is not a harmonized product.

WHAT WE HOPE TO ACHIEVE

The goal is a record in which MODIS and VIIRS are comparable, and a tool that lets researchers see where and under what conditions the two sensors disagree. We will repeat the GWIS and CAMS comparisons on additional days and check when the weather products were published. A seasonal calendar for emergency managers, the original idea behind the name, could be built on such a record later. The next milestone is a harmonized record for one region that passes a hold-out test: hide one sensor during the years when both flew, reconstruct it from the other, and compare with simple baselines using pass criteria fixed in advance. If calibration fails the test, we will show each sensor separately and label the combined view experimental.

LIMITATIONS

- A detection is a hot pixel seen on one satellite pass, not an individual fire, and not every detection is a vegetation fire.
- The viewing geometry is our estimate from public orbital elements, not the instruments' own per-pixel geolocation.
- Land cover is a fixed 2019 map; at the global scale it is sampled from a 1.2 km overview.
- Weather coverage differs by source: some products cover only the Americas or the contiguous United States, and model values are not observations.
- The notes on unmatched passes, the detection score, the weather-assisted odds and the estimated fire radiative power rest on one day of data and have not been checked on other days. A pass without a detection is inferred from predicted orbits.
- The weather comparison used small held-out samples (172 and 191 passes) and could not check when the weather values were published, so it measures performance in retrospect. The scripts that fitted the models are not in the repository.
- The basemap is cloud-free imagery from 2016 and 2017, not the surface on the day of a detection.
- The app does not forecast fire behaviour or spread and is not an operational alerting tool.

WHAT WE CONSIDERED

- Cost and access: the app needs no account or key from the user, the interface is a static site, and the service can scale to zero when idle.
- Accessibility: keyboard navigation, light, dark and high-contrast themes, a reduced-motion mode, and text labels next to colour.
- Honesty of the picture: every value keeps its source and time; estimates are labelled as estimates.

TOOLS

TypeScript, React, Vite, MapLibre GL JS and WebGL2 shaders for the interface; C# on .NET 10 with ASP.NET Core for the service; GitHub Actions, GitHub Pages, Google Cloud Run and Firestore for build, hosting and the shared weather cache. Automated tests cover FIRMS parsing, the orbit and geometry calculations, land-cover sampling, the weather samplers, the weather cache, the notes on unmatched passes, the fire radiative power estimate and the weather-assisted models.

USE OF AI

AI coding assistants (Anthropic Claude Code and OpenAI Codex) were used to write and review code and to draft documentation, the presentation text and the demo script. AI assistance in assembling the literature review has not been fully reconstructed; its provenance disclosure states that limitation. The app itself makes no calls to AI services for inference; the link preview is an original code-rendered typographic diagram with a visible AI-assistance label and metadata. It applies fitted statistical models for next-pass FRP, detection scores and GWIS- or CAMS-assisted detection odds. Training inputs come from the sources listed below. The idea belongs to team Plush. The team confirms that application development began after the hackathon start; pre-event preparation consisted of collecting and studying research.

The animated Lama presenter for the demo was designed with the OpenAI ChatGPT image tool from an original photograph of the team's plush alpaca. Character motion was generated with Google Veo 3.1 Lite through OpenRouter. The current concept pilot labels the character "AI-generated" whenever it appears. Live-action footage and application captures are real recordings. Its English narration was synthesized with ElevenLabs Eleven v4 through OpenRouter, using Charlie, then raised by three semitones locally while preserving duration. These tools are disclosed in the video description and file metadata. The user rejected that voice; new Jessica, Bella and Laura auditions use a female-performed little-boy direction without local pitch shifting. No final voice or narration is selected. Update the disclosure to the selected export before submission.


Independent project. Not affiliated with or endorsed by NASA.

MATERIALS

- Slides: [link to the PDF in the repository]
- Technical note: https://github.com/avbelkin/nasa-space-apps-sg/blob/main/submission/deliverables/technical-note.md
- Literature review: https://github.com/avbelkin/nasa-space-apps-sg/blob/main/submission/deliverables/modis-viirs-harmonization-literature-review.md
- Third-party rights and licences: https://github.com/avbelkin/nasa-space-apps-sg/blob/main/submission/deliverables/third-party-rights.md
- Software licence inventory: https://github.com/avbelkin/nasa-space-apps-sg/blob/main/submission/deliverables/software-licenses.md
- Code: https://github.com/avbelkin/nasa-space-apps-sg
```

Screenshots to insert in this field, each taken from the version that is submitted and after the basemap change of 15 November, 21:01 SGT:

| No. | Screenshot | Caption |
|---|---|---|
| 1 | Globe, **MODIS** selected, counters visible | `Live NASA FIRMS · last 24 h · MODIS` |
| 2 | Same view, **VIIRS** selected | `Live NASA FIRMS · same 24 h · VIIRS` |
| 3 | **All sensors** with **Color fire spots by sensor** on, zoomed to one region | `Who saw it: both sensors, MODIS only, VIIRS only` |
| 4 | Pinned group: timeline plus the geometry table with MODIS and VIIRS columns | `One place, 24 hours: detections, passes and viewing geometry` |
| 5 | Same pinned group with **Weather at acquisition** open and the land-cover line visible | `Conditions of each observation` |
| 6 | One pinned detection with **Predicted FRP if detected** or **GWIS-adjusted FRP if detected**, the model note under it, and a note on an unmatched pass or the GWIS or CAMS context line | `Experimental Earth Fire Calendar model estimates: what the next pass may show` |

## 6. Use of Super Intelligence (SI)

Tick every option that applies. From what the repository shows:

- **Code generation tools** — yes: Anthropic Claude Code and OpenAI Codex, used for implementation, review, tests and documentation. Commit trailers are incomplete provenance and are not a measure of the extent of assistance.
- **Large language models for text** — yes: drafts of the documentation, the slide text, the video script and this page.
- **Image or video generation** — yes: OpenAI ChatGPT image tool for Lama's design, Google Veo 3.1 Lite through OpenRouter for his motion; label the animated character `AI-generated` throughout his appearance. The older unverified social-preview illustration was replaced with a visibly AI-assisted original typographic diagram, with machine-readable provenance.
- **Generated audio** — yes: ElevenLabs Eleven v4 through OpenRouter, Charlie with a local three-semitone pitch increase in the rejected pilot; current Jessica/Bella/Laura auditions have no final selection. Disclose the actual selected voice in the video description and MP4 metadata.
- **Machine learning in the project itself** — yes. The browser applies coefficients fitted on one day of FIRMS detections to estimate FRP, score a later VIIRS detection, and compare detection odds with and without GWIS or CAMS inputs. The app makes no calls to AI services.

The form's exact option names have not been seen; match them on the form.

## 7. NASA Data

```text
NASA FIRMS (Fire Information for Resource Management System) — the core data of the project. The service queries the FIRMS Area API for three near-real-time active-fire datasets: MODIS_NRT (MODIS Collection 6.1 on Terra and Aqua, 1 km), VIIRS_NOAA20_NRT and VIIRS_NOAA21_NRT (VIIRS 375 m). Every point, counter, timeline and comparison in the app is built from these detections and their attributes: position, acquisition time, satellite, confidence, fire radiative power, brightness temperature, scan and track pixel size, day/night flag. The same attributes are the inputs and the targets of our experimental next-pass models.
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

The submitted [third-party rights and credit register](third-party-rights.md) records the actual licences, primary-source terms, required credits and unresolved permissions. The [software inventory](software-licenses.md) lists every UI lockfile dependency, direct .NET references and presentation fonts. Include both links in this field; do not paste this short summary without them.

- NASA FIRMS MODIS / VIIRS; NASA GIBS GPM IMERG, Black Marble and imagery; NASA sensor/algorithm documentation and the ported GPM precipitation colour map — NASA open-data credits and product-specific terms, detailed in field 7 and the register.
- EOxCloudless 2016 / modified Copernicus Sentinel 2016 & 2017 — **CC BY 4.0**, with EOX credit. The live source has been corrected. Existing 2025 map captures remain **CC BY-NC-SA 4.0** and must be replaced before final release.
- ESA CCI / Copernicus C3S 2019 land cover via Microsoft Planetary Computer — **ESA CCI Land Cover licence** and applicable C3S terms; the exact COG redistribution terms remain under verification, not an assumed CC BY licence.
- CelesTrak GP / TLE — publicly available under its usage policy; an unrestricted redistribution licence has not been established. Bright Star / Hipparcos table — exact provenance and terms unresolved.
- NOAA GFS, GOES-R ABI / GLM and CPC NLDAS Noah — US Government-produced data, public-domain basis under US law, subject to item-specific third-party notices. NOAA nowCOAST / GMGSI mosaic constituents still require confirmation.
- Open-Meteo forecast and air quality — **data CC BY 4.0**; the free hosted API has non-commercial service conditions and limits. Credit underlying models as well as Open-Meteo: Copernicus CAMS Global supplies the aerosol, dust, particulate and carbon monoxide fields, which the VIIRS detection-odds model uses.
- Copernicus GWIS — **CC BY 4.0** for EU-owned content, subject to product-specific third-party terms. Copernicus GDO soil-moisture anomaly — **CC BY 4.0** on the dataset downloads. Credit European Commission JRC and actual product/model versions.
- US Forest Service WFAS — federal-work public-domain basis; exact raster-level notice still to be verified.
- Extremum cloud composite and its EUMETSAT / NOAA / JMA / NASA inputs — composite and constituent redistribution permissions unresolved. Do not claim that an accessible tile endpoint supplies a licence.
- MapLibre GL JS — BSD-3-Clause; React / React DOM, Vite and plugin, oxlint, PureHDF, .NET / ASP.NET Core — MIT; TypeScript and xUnit — Apache-2.0. Transitive UI licences also include ISC, BSD-2-Clause, 0BSD, MPL-2.0 and MIT-or-Apache-2.0. The complete table and notice links are in the software inventory; resolved .NET transitive coverage is still pending.
- Overpass and Fira Sans fonts — **SIL OFL 1.1**, with bundled licence texts. Space Apps palette / reference kit — official brand-use terms, not a grant over NASA insignia; no NASA or Space Apps logo appears in the inspected deck.
- Original team code and prose — **Apache-2.0**, with third-party exclusions in NOTICE. Literature: the [review's 82 references](modis-viirs-harmonization-literature-review.md), including the MODIS / VIIRS algorithm papers; US Naval Observatory solar coordinates and Van Flandern & Pulkkinen lunar ephemeris methods. Cited publications retain their own rights; the papers are not redistributed as project files.
- AI assistance: Anthropic Claude Code and OpenAI Codex (code/review/writing/layout); OpenAI ChatGPT image tool (Lama design); Google Veo 3.1 Lite via OpenRouter (motion); ElevenLabs Eleven v4 / Charlie via OpenRouter (pilot speech, locally pitch-shifted). Final selections and applicable output terms must match the final media. OpenRouter is the intermediary, not the owner of every model's output rights.
- Hosting / build services: GitHub Pages, GitHub Actions, Google Cloud Run, Firestore, managed presentation tooling, Chrome / Chromium, FFmpeg and PowerPoint. Their executables are not submitted as original team work.

Rights register: https://github.com/avbelkin/nasa-space-apps-sg/blob/main/submission/deliverables/third-party-rights.md
Software inventory: https://github.com/avbelkin/nasa-space-apps-sg/blob/main/submission/deliverables/software-licenses.md

The unresolved entries are release blockers, not compliance confirmations. Retain all applicable notices and resolve permissions before ticking the originality checkbox.

## 9. Two checkboxes

Tick both after the [checklist](../docs/formal-requirements.md#checklist) is closed.

## Before submitting

| What | Why |
|---|---|
| Team identity | Plush — Alexey Belkin and Viktoriia Naiman. Lama is a fictional presenter; Claude / Codex are AI tools, not registered team members |
| Final AI/media provenance | Fields 5, 6 and 8, the final video description and metadata must match; preserve the model terms and asset provenance |
| Remaining third-party rights | Resolve the explicit blockers in the rights register; recapture old EOX 2025 images |
| Project licence | Apache-2.0 in LICENSE, with third-party exclusions in NOTICE; no permission is asserted over unresolved assets |
| Slides PDF link | Existing exports are local drafts; publish the final complete deck at a public stable URL after rights/capture checks |
| Link preview image `og-preview.png` | Replaced with an original labelled diagram; rebuild/deploy the corrected app and verify the public preview |
| Commit or tag of the submitted version | This page and the [technical note](technical-note.md) describe `c16b7b7`. If the app changes again, update both; tag the submitted commit |
| Baseline fitting scripts | They are not in the repository, and the [technical note](technical-note.md#6-first-baselines-on-matched-passes) says so; add them or say where they are |
| Backend test run | The technical note records only the interface suite; run the backend suite on the submitted commit |
| Numbers | One snapshot across this page, the slides and the video |

Model estimates are outputs of Earth Fire Calendar, not NASA products. NASA has not reviewed or validated them and is not responsible for their accuracy.
