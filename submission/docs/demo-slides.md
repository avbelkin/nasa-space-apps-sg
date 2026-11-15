# Earth Fire Calendar — slide text

[Slides](demo-slides.md) · [Video script](demo-video.md) · [Form fields](form-fields.md) · [Formal requirements](formal-requirements.md) · [Advice](advice.md)

## Slide 1 — Earth Fire Calendar

**Is this month's fire activity normal for this place, or unusual?**

An Earth-first map and calendar built on NASA FIRMS active-fire data.

**Challenge:** Harmonization of MODIS and VIIRS Hot Spots

**Team:** [team name] — [team member names]

**Stage:** Working prototype with live NASA FIRMS detections; calendar values are still samples.

## Slide 2 — Two sensors, two different counts

**Same 24 hours of NASA FIRMS data: 82,977 VIIRS detections and 7,359 MODIS detections worldwide.**

- MODIS on Terra and Aqua: about 1 km pixels at nadir; the record starts in 2000.
- VIIRS on NOAA-20 and NOAA-21: 375 m pixels; the record starts in 2012 with Suomi NPP, whose data delivery ended on 2 November 2026.
- A detection is a hot pixel seen on one satellite pass, not an individual fire.

**Joined without adjustment, the record would show a jump in burning when VIIRS starts, even if nothing changed on the ground.**

*Snapshot: 14 November 2026, 21:19 UTC.*

## Slide 3 — The question we answer

**An emergency manager asks: is fire activity in my area this month normal for the season?**

1. Choose an area on the globe.
2. See its typical fire season, month by month.
3. Compare this year with the typical level.

*Calendar values shown are samples until the harmonized record is built.*

## Slide 4 — Working today

- **Live NASA FIRMS hotspots** from the last 24 hours: MODIS on Terra and Aqua, VIIRS on NOAA-20 and NOAA-21.
- **Sensor switch:** compare MODIS and VIIRS over the same 24 hours.
- **Context layers:** GPM IMERG precipitation and VIIRS Black Marble night lights from NASA GIBS; cloud imagery via Extremum; satellite tracks from CelesTrak.
- **Calendar interface:** month strip, typical-versus-this-year comparison and location cards, with sample values.

**Not built yet:** historical archive, harmonization, validation, area drawing, date-range selection and CSV export.

## Slide 5 — Three steps in the prototype

**1. Open the globe.** Live NASA FIRMS detections from the last 24 hours.

**2. Switch from MODIS to VIIRS.** The same hours show many more detections.

**3. Pick an area and a month.** Compare this year with the typical level. *Sample values.*

**Try it:** [avbelkin.github.io/nasa-space-apps-sg](https://avbelkin.github.io/nasa-space-apps-sg/#z=3&lat=1.3521&lng=103.8198&sensor=modis&proj=globe&orbits=0&clouds=0&lights=0&rain=0)

## Slide 6 — From live feed to a harmonized calendar

**Planned pipeline:** FIRMS archive since 2000 → daily grid per satellite, with day and night kept separate → one reference scale → typical season and departures → calendar and CSV export.

**How we will test it:**

- Hide one sensor during the overlap years and reconstruct it from the other.
- Hold out whole years and a contrasting region.
- Compare with simple baselines, using pass criteria fixed in advance.

**Known pitfalls:** repeated satellite passes, different confidence scales, MODIS orbit drift, gaps with no data that look like zero fire, and heat sources that are not vegetation fires.

**If calibration fails, we will show each sensor separately and label the combined view experimental.**

## Slide 7 — A consistent fire calendar

**Goal:** Show emergency managers when an area usually burns and whether the current period is unusual.

**Next milestone:** A harmonized record for one region that passes the hold-out test.

**Links:** [App](https://avbelkin.github.io/nasa-space-apps-sg/#z=3&lat=1.3521&lng=103.8198&sensor=modis&proj=globe&orbits=0&clouds=0&lights=0&rain=0) · [Code](https://github.com/avbelkin/nasa-space-apps-sg)

**Sources:** [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/) — MODIS and VIIRS fire detections. [NASA GIBS](https://earthdata.nasa.gov/gibs) — GPM IMERG precipitation and VIIRS Black Marble night lights. [Extremum](https://extremum.org/) — cloud layer: geostationary imagery from EUMETSAT, NOAA and JMA, blended with NASA VIIRS imagery at high latitudes. [CelesTrak](https://celestrak.org/) — orbital elements. [EOX](https://s2maps.eu/)/Copernicus Sentinel-2 — Earth basemap. Bright Star / Hipparcos catalogue — star background.

**AI assistance:** code development, and drafting of this presentation text and the demo script.

Independent project. Not affiliated with or endorsed by NASA.
