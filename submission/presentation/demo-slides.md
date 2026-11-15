# Earth Fire Calendar — slide text

[Slides](demo-slides.md) · [Video script](../video/demo-video.md) · [Project page text](../deliverables/project-description.md) · [Technical note](../deliverables/technical-note.md) · [Form fields](../working/form-fields.md) · [Formal requirements](../docs/formal-requirements.md) · [Advice](../docs/advice.md)

## Slide 1 — Earth Fire Calendar

**Why do MODIS and VIIRS report different detections over the same place?**

A live globe that compares the two sensors and attaches to each detection the conditions under which it was observed, built on NASA FIRMS active-fire data.

**Challenge:** Harmonization of MODIS and VIIRS Hot Spots

**Team:** Plush — Alexey Belkin, Viktoriia Naiman

**Stage:** Working prototype on live NASA FIRMS detections. It collects evidence for harmonization and fits first baselines on one day of it; the harmonized record is not built yet.

## Slide 2 — Two sensors, two different counts

**Same 24 hours of NASA FIRMS data: 79,349 VIIRS detections and 8,127 MODIS detections worldwide, almost ten times more.**

- MODIS on Terra and Aqua: about 1 km pixels at nadir; the record starts in 2000.
- VIIRS on NOAA-20 and NOAA-21: 375 m pixels; the record starts in 2012 with Suomi NPP, whose data delivery ended on 2 November 2026.
- A detection is a hot pixel seen on one satellite pass, not an individual fire.

**Joined without adjustment, the record would show a jump in burning when VIIRS starts, even if nothing changed on the ground.**

*Snapshot: 15 November 2026, 08:36 UTC.*

## Slide 3 — The question we answer

**A researcher joining the two records asks: where, and under what conditions, do MODIS and VIIRS disagree?**

1. Compare what each sensor recorded over the same place in the same 24 hours.
2. See who saw each group of detections: both sensors, MODIS only or VIIRS only.
3. Read the conditions of each observation: viewing geometry, land cover and weather.
4. Check what the next satellite pass reported: nothing where a detection was expected, or a different fire radiative power.

*The two sets of detections overlap only in part.*

## Slide 4 — Working today, on live data

- **Live NASA FIRMS hotspots** from the last 24 hours: MODIS on Terra and Aqua, VIIRS on NOAA-20 and NOAA-21.
- **Sensor switch and colouring by sensor:** the same 24 hours for MODIS, VIIRS or both, with each group of detections coloured by who saw it.
- **One place, 24 hours:** a timeline of detections by satellite, with the passes that reported nothing. Passes are our estimate from orbits, not FIRMS data.
- **Conditions of each detection:** estimated viewing geometry and land cover inside the pixel footprint for every detection; weather at acquisition time for the most recent detections and for any detection you select. Every weather value keeps its source and time.
- **Experimental, from one day of data:** for a single selected detection, notes on a later pass that reported nothing, an "Expected detection, no match" flag between the two VIIRS satellites, and an estimate of the fire radiative power on the next pass. Not checked on other days.
- **Context layers:** GPM IMERG precipitation and VIIRS Black Marble night lights from NASA GIBS; cloud imagery via Extremum; satellite tracks from CelesTrak.

**Not built yet:** historical archive, harmonization, validation, area and date selection, and data export.

## Slide 5 — Three steps in the prototype

**1. Open the globe.** Live NASA FIRMS detections from the last 24 hours.

**2. Switch from MODIS to VIIRS.** The same hours show many more detections.

**3. Select a detection group.** Its 24-hour timeline and the conditions of each observation appear side by side for MODIS and VIIRS. For a single detection the app also shows what the next pass reported or may report, as an experimental estimate.

**Try it:** [avbelkin.github.io/nasa-space-apps-sg](https://avbelkin.github.io/nasa-space-apps-sg/#z=3&lat=1.3521&lng=103.8198&sensor=modis&proj=globe&orbits=0&clouds=0&lights=0&rain=0)

## Slide 6 — From evidence to a harmonized record

**Hypothesis:** the MODIS–VIIRS difference depends on land-cover class together with view angle, at the level of individual detections. The prototype collects initial fields; estimated geometry and coarse global land-cover sampling still need validation and refinement.

**First baselines, one day of data:** whether a later pass misses a detection (AUROC 0.64–0.77 on held-out regions) and how fire radiative power differs between passes (15,869 matched pairs). GWIS improved MODIS ranking/FRP in a small paired sample; CAMS improved VIIRS ranking. Other days and publication-time checks remain open.

**Planned pipeline:** FIRMS archive since 2000 → daily grid per satellite, with day and night kept separate → paired MODIS and VIIRS observations → response functions by view angle, pixel area and land cover → one reference scale → export.

**How we will test it:**

- Hide one sensor during the overlap years and reconstruct it from the other.
- Hold out whole years and a contrasting region.
- Compare with simple baselines, using pass criteria fixed in advance.

**Known pitfalls:** repeated satellite passes, different confidence scales, MODIS orbit drift, gaps with no data that look like zero fire, and heat sources that are not vegetation fires.

**If calibration fails, we will show each sensor separately and label the combined view experimental.**

## Slide 7 — One comparable fire record

**Goal:** A record in which MODIS and VIIRS are comparable, and a tool that shows researchers where and why the two sensors disagree.

**Next milestone:** A harmonized record for one region that passes the hold-out test.

**Links:** [App](https://avbelkin.github.io/nasa-space-apps-sg/#z=3&lat=1.3521&lng=103.8198&sensor=modis&proj=globe&orbits=0&clouds=0&lights=0&rain=0) · [Code](https://github.com/avbelkin/nasa-space-apps-sg) · [Technical note](https://github.com/avbelkin/nasa-space-apps-sg/blob/main/submission/deliverables/technical-note.md)

**Sources:** [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/) — MODIS and VIIRS fire detections. [NASA GIBS](https://earthdata.nasa.gov/gibs) — GPM IMERG precipitation and VIIRS Black Marble night lights. ESA CCI / Copernicus C3S — land cover. NOAA, [Open-Meteo](https://open-meteo.com/), Copernicus GWIS and GDO, US Forest Service — weather at acquisition. [Extremum](https://gis.extremum.org) — cloud layer: geostationary imagery from EUMETSAT, NOAA and JMA, blended with NASA VIIRS imagery at high latitudes. [CelesTrak](https://celestrak.org/) — orbital elements. [EOX](https://s2maps.eu/)/Copernicus Sentinel-2 — Earth basemap. Bright Star / Hipparcos catalogue — star background.
**Rights and licences:** [Data, imagery, generated media and fonts](https://github.com/avbelkin/nasa-space-apps-sg/blob/main/submission/deliverables/third-party-rights.md) · [Software inventory](https://github.com/avbelkin/nasa-space-apps-sg/blob/main/submission/deliverables/software-licenses.md).

**AI assistance:** Claude Code and Codex — code, text and layout.

Model estimates are Earth Fire Calendar's, not NASA's. Independent project; not affiliated with or endorsed by NASA.
