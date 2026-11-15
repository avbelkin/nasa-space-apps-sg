# Earth Fire Calendar: how we apply the advice

[Slides](../presentation/demo-slides.md) · [Video script](../video/demo-video.md) · [Project page text](../deliverables/project-description.md) · [Technical note](../deliverables/technical-note.md) · [Form fields](form-fields.md) · [Formal requirements](../docs/formal-requirements.md) · [Advice](../docs/advice.md)

How the general [advice](../docs/advice.md) is applied to Earth Fire Calendar: what to show for each judging criterion, the status of every interface element, what not to claim, and the state of the project page and repository. This is a living document: update it whenever the app or the materials change. Video specifics are in the [recording checklist](../video/recording-checklist.md); slide specifics are in the [slide images](../presentation/slide-images.md).

**Recommended demo format: video.** The main result of Earth Fire Calendar is visible through interaction. Seven slides are the fallback with the same story.

## What to show for each criterion

| Criterion | What to show in Earth Fire Calendar | 2025 example |
|---|---|---|
| **Impact** | A named user and decision: a researcher or fire-data analyst joining the MODIS and VIIRS records has to decide where, and under what conditions, the two can be compared. The emergency manager from the challenge description, who needs one consistent record, benefits later: say so as a goal. A goal is called a goal, not an achieved effect. A map alone does not prove benefit: there must be an explicit link from the layer to the decision a person makes | Twisters: from the user's question to the decision screen; QUEÑARIS: place → consequence → method → action |
| **Creativity** | One memorable idea: every fire is coloured by which sensor saw it, and every detection carries the conditions under which it was observed | Resonant: a named mechanism — memorable, but it proves nothing by itself; SpaceGenes+: one central visualization |
| **Validity** | Separate statuses; one real comparison — MODIS and VIIRS over the same 24 hours; a test plan with criteria set before looking at the results; known limitations | The Resonant report narrows the pitch's bold claims; for PureFlow, a screen recording does not replace engineering verification |
| **Relevance** | FIRMS data at the centre: the gap between the sensors is shown on it; every NASA resource is tied to a screen or a calculation | PureFlow names its NASA sources; the review recommends tying each one to a specific calculation or screen |
| **Presentation** | One problem, one action, one result; no tour of all the layers | The PureFlow and QUEÑARIS videos; less successful as a short pitch — the Resonant video, the Astro Sweepers video on Google Drive and the long AakashNet dashboard walkthrough |

## The demonstration case

The advice asks for a traceable example: why this case, and the chain from source data to result.

- **Selection rule.** The case for the 17–23-second scene and for slide 5 is a group of detections that (1) contains both MODIS and VIIRS, (2) was seen by all four satellites within the 24-hour window, (3) has the geometry, land-cover and weather rows filled, and (4) lies inside the prepared view, so that no camera move is needed. Among the groups that qualify, take the one with the highest FRP: it is the easiest to find again on the map.
- **Candidate at the last check.** In the feed fetched on 15 November at 11:52 UTC, the half-degree cell at 17° S, 124° E (Kimberley, Western Australia) held 89 MODIS and 249 VIIRS detections from Terra, Aqua, NOAA-20 and NOAA-21 and contained the highest FRP in the feed, 1,097.7 MW. The feed fetched at 12:10 UTC gave the same cell, counts and peak. Weather is sampled only for the most recent detections, so rule 3 has to be checked on the pinned card at recording time. The feed changes every hour: re-apply the rule on the day of recording and record the cell, the time and the counts here.
- **Chain.** NASA FIRMS near-real-time records (MODIS_NRT, VIIRS_NOAA20_NRT, VIIRS_NOAA21_NRT) → the app's 24-hour feed, whose summary is saved as a [snapshot](firms-snapshot-2026-11-15T0836Z.json) → the chosen group → assumptions: the group is formed by screen distance, the passes and the viewing geometry are our estimates from orbits, land cover is the 2019 map, weather is modeled → result: the timeline by satellite and the conditions table side by side for MODIS and VIIRS.
- **Durable copy.** The live link shows different numbers every hour. The snapshot summary and the screenshots keep the numbers the materials quote; the commit of the submitted version is pinned on the project page. Still missing: the deck as a PDF in the repository and a tag on the submitted commit.

## The pitch against the six-part structure

| Part | Where it is covered | Evidence shown | Gap |
|---|---|---|---|
| Problem | Slides 2–3; video 5.5–11.5 s; project page, field 2 | A researcher joining the two records; 79,349 VIIRS against 8,127 MODIS detections in the same 24 hours, with the snapshot time | None |
| Contribution | Slides 3–4; video 11.5–23 s | Colouring by who saw each group; the conditions of every detection | None |
| Demonstration | Slide 5; video 5.5–23 s | The MODIS → VIIRS switch on one view; one pinned group | The group is not chosen yet: see [the demonstration case](#the-demonstration-case) |
| Validity | Slide 6; [technical note](../deliverables/technical-note.md) | Estimates labelled as estimates; test plan with criteria fixed in advance; known pitfalls | The first baselines rest on one day of data; say so wherever they appear |
| NASA relevance | Slides 4 and 7; video caption "NASA FIRMS · last 24 h"; project page, field 7 | FIRMS as the core data, GIBS for context layers, each tied to a screen | None |
| Impact and next step | Slide 7; video 23–29 s | Goal and next milestone: a harmonized record for one region that passes the hold-out test | The adoption path is thin: the materials name the researcher but not how they get the data out, since export is not built. Keep it as a stated next step |

## Four questions after the first viewing

| Question | Answer the video gives |
|---|---|
| What is the problem? | "Same planet. Same day. But MODIS and VIIRS see different hotspots." |
| What was built? | "Earth Fire Calendar compares their detections using NASA FIRMS data." |
| What result is visible? | The switch changes the map and the counter; the pinned card shows viewing angle, land cover and weather |
| Why is NASA data needed? | The narration and the caption name NASA FIRMS as the source of every point |

The script answers all four. Not done yet: showing the finished video once to a person who has not seen the project and asking them the four questions.

## Global awards

The advice lists ten global awards. Proposed targets, for the team to confirm: **Best Use of Data** first, since the project makes FIRMS detections comparable and inspectable detection by detection; **Best Use of Science** second, on the strength of the stated hypothesis and the test plan fixed in advance. The materials should not be bent toward the other eight.

## What to show and what not to

**The main story.** In the same live NASA FIRMS data over 24 hours, VIIRS yields several times more detections than MODIS, and the two sets overlap only in part, so the twenty-year fire record cannot simply be stitched together. Earth Fire Calendar is a globe that shows which sensor saw each fire and attaches to every detection the conditions of its observation: viewing geometry, land cover and weather. This is evidence for harmonization; harmonization itself is the next step.

When and against which version the app was checked is in the [status against the formal requirements](requirements-status.md). Exactly which NASA products are used is in the [NASA Data field](form-fields.md#7-nasa-data).

| Element | Status | How to show it |
|---|---|---|
| NASA FIRMS active-fire points for 24 hours | Live data worldwide | The main shot |
| **All sensors / MODIS / VIIRS** switch | Filters the live points, the counters and the satellite tracks | The key action of the video |
| Counters in the **Live active fire spots (NASA FIRMS · 24h)** block | Global over 24 hours. The tiles are **Peak FRP**, **MODIS 1 km** and **VIIRS 375 m**; in MODIS mode the **VIIRS 375 m** tile shows 0, in VIIRS mode the **MODIS 1 km** tile shows 0, and both numbers are visible side by side only in **All sensors** mode | Compare the **MODIS 1 km** tile before the switch with the **VIIRS 375 m** tile after it, and caption them as the whole world; for a still image use **All sensors** |
| **All sensors** mode | Shows MODIS and VIIRS detections together with no calibration and no removal of duplicates. Its internal name, visible in the link as `sensor=harmonized`, is not a claim | Do not call it harmonization; describe it as both sensors together |
| **Color fire spots by sensor** and its colour key | Live data. Available only in **All sensors** mode. Detections drawn close together on screen form a group, coloured as both sensors, MODIS only (2+), VIIRS only (2+) or a single detection. The grouping follows screen distance and changes with zoom; it is not a footprint-and-time match between passes | The 11.5–17-second scene and slide 3. Keep the zoom fixed while the colours are in the shot |
| Pinned card: bars of detections over 24 hours by satellite | Live FIRMS data; known inaccuracies: the VIIRS confidence classes are converted to percentages (25, 65, 95), and `MW total` sums FRP across different passes | Show the bars, not the totals |
| Pinned card: the `Pass, no fire` and `Processing` labels, the Sun curve | Computed from CelesTrak orbits and fixed processing delays (90 minutes for VIIRS, 120 minutes for MODIS), not FIRMS data; a pass without a detection does not prove the absence of fire | On the slides and the project page only with this explanation; do not read aloud in the video |
| Pinned card: the observation table with MODIS and VIIRS columns | Our estimate from public orbital elements, not the instruments' own geolocation: off-nadir angle, distance, Sun and Moon elevation, glint | The 17–23-second detail scene; caption it as an estimate |
| Pinned card: land cover and **Weather at acquisition** | Land cover is a fixed 2019 map. Weather comes from models and satellite products; coverage differs by source, and rows no source could fill are hidden | Choose a detection with filled rows; do not present model values as observations |
| Status rows in the counter block: **Detections**, **Observation geometry**, **Land cover**, **Weather** | Progress of the background enrichment. Weather is sampled in bulk only for the most recent detections, so its count is smaller than the number of detections | Leave out of the video; record after the pending counts stop changing |
| **Satellite passes** HUD (`ready` / `processing`) and orbit lines: solid for `ready`, dashed for `in processing` | An estimate from the orbit calculation and a timer, not confirmation that data has arrived | Leave out of the video |
| Orbits, clouds, precipitation, night lights, star background | Context layers | Switch off in the key shots; night lights are easily mistaken for fires |
| Source credits | There is no credit on the map itself. With the **Sources and credits** block collapsed, the sidebar footer shows the short line "NASA FIRMS · NASA GIBS · CelesTrak · EOX / Copernicus Sentinel-2 · Extremum SAR GIS. Not affiliated with NASA."; the full list is in the expanded block. The heading of the counter block names NASA FIRMS | If the shot is cropped to the map, the name NASA FIRMS must appear in the shot's caption |
| Pinned card: **Predicted FRP if detected** | A regression fitted on matched pairs from one 24-hour FIRMS snapshot; it estimates the FRP at the next predicted pass. Not validated on other days | Only with the word "estimate" and the one-day basis; do not present as a forecast of fire behaviour |
| Pinned card: **Expected detection, no match** and the notes "No matching detection for … predicted pass" | Shown for a solo detection when a later predicted pass has no matching FIRMS detection. The notes quote associations observed in the same one-day snapshot. **Expected detection, no match** appears only for a VIIRS detection and the other VIIRS satellite (NOAA-20 and NOAA-21), when a logistic model fitted on that snapshot scores the pass at 70% or more and FIRMS has no detection within 1 km and ±25 minutes; it is drawn in red, shows the score as a percentage and replaces the same-sensor note. All of them rest on predicted, not confirmed, passes; details are in [doc/architecture-and-harmonization.md](../../doc/architecture-and-harmonization.md) | Describe as a first baseline and a prompt to look closer, not as a detected omission or a harmonization result. Call the percentage a detection score from a one-day model, not a probability |
| History since 2000, harmonization, validation, area and date selection, export | Not implemented | Only as the next step |
| Seasonal calendar, typical season, anomaly index | Not in the app. The sample calendar interface was removed; the calendar is a possible follow-up and survives only in the provisional name | Do not show or promise; if asked about the name, say it is provisional |

## What not to say

- Do not pass off **All sensors** mode as harmonization, colouring by sensor as a match between passes, plans as working features, or computed satellite passes and viewing geometry as FIRMS data.
- FIRMS detections are thermal anomalies, not individual fires; do not attribute a cause such as peatlands or industry to them without data.
- Do not promise fire forecasting, operational response, accuracy or damage reduction: the app shows where the two sensors disagree and under what conditions each detection was made. The predicted FRP and the unmatched-pass notes are first baselines fitted on one day of data; do not present them as validated models.
- Do not describe a seasonal calendar, seasonal baselines or anomaly scores as existing features.

## Project page and repository

| What | State | Advice |
|---|---|---|
| A judge's first visit | With no parameters and no saved view, the app opens on Singapore with all layers on and **All sensors** mode, and requests geolocation; if allowed, it moves the view to the user when they are more than 100 km from Singapore (re-checked in the code and in a clean browser profile on 15 November). In that view the fire points are visible, but clouds, night lights, orbit lines and the satellite HUD compete with them | Give the link with the prepared view in all materials: it opens the globe in MODIS mode without context layers and does not request geolocation |
| Statuses | The app shows no sample values. The passes without a detection, the processing marks and the viewing geometry are our estimates from orbits | On the project page, separate live data, estimates and plans |
| README and page metadata | The README and the description in `ui/index.html` now describe a tool for comparing the sensors; the name is marked as provisional. The link preview image `og-preview.png` still reads "MODIS 1 km · VIIRS 375 m harmonization" and "Seasonal burning baselines & live calendar anomalies" | Replace the preview image: it promises features the app does not have |
| The version the judges will see | GitHub Pages rebuilds the site on every push to `main` that changes `ui/` or the `deploy-ui.yml` file, and on manual runs; changes only to the README, `doc/` and `backend/` do not touch the site. The published version changes with every push that touches `ui/`; the version published at the last check is `c73d0b5`, deployed on 15 November at 20:07 SGT. The backend is deployed separately, on pushes that change `backend/`; its last deployment, from `4686c3c`, finished at 20:08 SGT | Pin the commit or tag at the moment of submission and state it on the project page; do not publish changes after the deadline at the link from the submission. Take screenshots and record after the last interface change |
| Consistency of materials | — | Names, numbers and statuses in the demo match the project page and the README |
