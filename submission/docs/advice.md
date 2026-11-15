# Space Apps 2026: advice on the submission and demo

[Slides](../presentation/demo-slides.md) · [Video script](../video/demo-video.md) · [Project page text](../deliverables/project-description.md) · [Technical note](../deliverables/technical-note.md) · [Form fields](form-fields.md) · [Formal requirements](formal-requirements.md) · [Advice](advice.md)

This document contains recommendations only: what raises the score and how best to show the project. They rest on the official guides and on our review of the 2025 winners. The conclusions drawn from that review are editorial hypotheses based on a sample of winners alone, not the jury's disclosed reasoning. What is mandatory is covered in the [form fields](form-fields.md) and the [formal requirements](formal-requirements.md).

## What the judges score

Each of the five criteria is scored on a **1–5** scale at every level of judging, including local selection. The third column is the guide's description of the top score.

| Criterion | What is assessed | Top score |
|---|---|---|
| **Impact** | The significance of the problem and the benefit of the solution | A significant problem, broad reach and a convincing benefit for a large audience |
| **Creativity** | Originality and novelty; a meaningful improvement on existing ideas also counts | A breakthrough approach that has not been tried before and challenges conventional methods |
| **Validity** | Scientific soundness, feasibility, completeness and usability | A scientifically sound, technically feasible and usable solution that does what it is meant to do, is fully developed and is ready for real-world use |
| **Relevance** | Fit with the chosen challenge and meaningful use of NASA data | The challenge is addressed fully and directly; NASA data is the foundation of the solution, not a superficial add-on |
| **Presentation** | Clarity, structure and the ability to tell the project's story | A clear, well-structured explanation of the challenge, the solution and why it matters |

- In the 2025 instructions to judges, scoring had two steps: first the minimum requirements (language, fit with the challenge, demo limit, link accessibility, NASA data, AI disclosure) — a project failing any of them received a 1 and was not considered further; then a single holistic score from 1 to 5 guided by the criteria. No such instruction for 2026 appears in the official materials we collected.
- **Most of the score rests on the project page**, so attached files do not replace its text. The demo also counts and can raise the Presentation score; for that criterion judges look at both the demo and the whole project.
- The guide asks teams to give Presentation as much attention as the other four criteria and recommends having people with storytelling and design skills on the team.
- A finished product is not required, but the readiness and completeness of the solution affect Validity.

Finalists are nominated for one of ten global awards:

| Award | What it is for, according to the guide |
|---|---|
| Best Use of Science | The best and most valid use of the scientific method |
| Best Use of Data | The project that best makes space data accessible or finds a unique use for it |
| Best Use of Technology | The most innovative use of technology |
| Galactic Impact | The greatest potential to improve life on Earth or in the universe |
| Best Mission Concept | The most plausible concept and design |
| Most Inspirational | The project that captures hearts |
| Best Storytelling | The most creative story about what open data makes possible |
| Global Connection | The project that best connects people around the world through technology |
| Art & Technology | The most successful combination of technical and creative skills |
| Local Impact | The greatest potential to change life in the team's local community |

## Layers of materials

The strongest shared technique in the review of the 2025 winners: the viewer sees the link "a specific user's problem → transformation → visible result". Build the materials in layers so that names, numbers and statuses match across them; in the winners' own materials they did not always agree.

| Layer | Job | What to put there for Earth Fire Calendar |
|---|---|---|
| Demo | Get the main point across on first viewing | One problem, one action, one visible result |
| Project page | Let the reader study the proposal; the page must make sense without the demo | What was built and how it works; the NASA datasets and the role of each; what runs on live data, what is an estimate and what is planned; limitations; screenshots |
| Documentation in the repository | Answer follow-up questions | Metric, grid, reference scale, test plan with criteria, known pitfalls |
| Code | Let the implementation be checked | A public repository whose README does not contradict the project page |

The list of materials found among the winners is in [supporting materials](form-fields.md#supporting-materials). There is no need to prepare everything: a technical appendix is useful when it answers the questions left open after the demo and the page. The best example of this separation is Resonant Exoplanets: a short pitch on its own, a technical report on its own.

Practices from the review that make materials verifiable:

- **A traceable example.** Explain why this particular case was chosen for the demonstration, and keep the chain "source data → chosen case → assumptions → result" (Astro Sweepers).
- **Conditions next to the number.** Units, period and measurement conditions sit next to every comparison: Resonant's presentation says 3–8 seconds and its report says 10–40 seconds for the same process.
- **A durable copy.** A year later, three of the winners' links no longer opened: the Resonant repository, the SpaceGenes+ demo and the Twisters site, whose domain had expired. Keep a stable repository and an exported copy of the result alongside the live link.
- **Nothing is taken without rights.** The winners' code, images and text cannot be used just because the project won an award.

## What to show for each criterion

| Criterion | What to show in Earth Fire Calendar | 2025 example |
|---|---|---|
| **Impact** | A named user and decision: a researcher or fire-data analyst joining the MODIS and VIIRS records has to decide where, and under what conditions, the two can be compared. The emergency manager from the challenge description, who needs one consistent record, benefits later: say so as a goal. A goal is called a goal, not an achieved effect. A map alone does not prove benefit: there must be an explicit link from the layer to the decision a person makes | Twisters: from the user's question to the decision screen; QUEÑARIS: place → consequence → method → action |
| **Creativity** | One memorable idea: every fire is coloured by which sensor saw it, and every detection carries the conditions under which it was observed | Resonant: a named mechanism — memorable, but it proves nothing by itself; SpaceGenes+: one central visualization |
| **Validity** | Separate statuses; one real comparison — MODIS and VIIRS over the same 24 hours; a test plan with criteria set before looking at the results; known limitations | The Resonant report narrows the pitch's bold claims; for PureFlow, a screen recording does not replace engineering verification |
| **Relevance** | FIRMS data at the centre: the gap between the sensors is shown on it; every NASA resource is tied to a screen or a calculation | PureFlow names its NASA sources; the review recommends tying each one to a specific calculation or screen |
| **Presentation** | One problem, one action, one result; no tour of all the layers | The PureFlow and QUEÑARIS videos; less successful as a short pitch — the Resonant video, the Astro Sweepers video on Google Drive and the long AakashNet dashboard walkthrough |

## Demo: video or slides

**The recommended format is video:** the main result of Earth Fire Calendar is visible through interaction. Seven slides are the fallback with the same story. The official guide advises choosing the format early, starting from the question "what story does the team want to tell?", assigning one person responsible for the demo, and looking at the Demo section on past winners' pages.

The goal, according to the guide, is to quickly convey the importance and relevance of the project to someone with no context, no technical background and no knowledge of the topic; in either format, strong visuals and readability are needed.

### Rules from the review of the winners

1. **One problem, a visible action, a clear consequence.** In PureFlow's video the main interaction runs from roughly the 7th to the 22nd second. For us it is the MODIS → VIIRS switch on live data: the challenge's problem is visible in NASA data, not in a diagram.
2. **The result before the feature list.** Twisters' slides lead from the user's question to the result screen; the review recommends showing the result even earlier, before the feature list. Do not give a tour of the layers: AakashNet's 116-second dashboard walkthrough is useful as an appendix, not as a short pitch, and the Astro Sweepers video flips through eight slides in about eight seconds.
3. **A non-trivial case in the key frame.** On Twisters' main screen all indicators read 0%: it shows the interface, not the capability. Choose a frame where the difference is visible at once.
4. **Only what can be read in time goes on screen.** In the Resonant video, pages of the technical report change faster than they can be read. Move the methodology, test plan and limitations to the project page and the repository.
5. **No time is spent on credits and atmosphere.** Astro Sweepers puts the team slide before the benefit; the first 17 seconds of A Solar Tale are mood. That is why our names go in a caption, not in the voiceover.
6. **Statuses are not mixed.** For QUEÑARIS, the seedlings already grown in the video and the first-year planting target on the site are different quantities, and neither is a measured result. A positive example is the SpaceGenes+ site: it says outright that one case works and the rest is a concept. Ours keeps live data, estimates and plans separate in the same way.
7. **Subtitles are proofread.** In the PureFlow video the name DONKI turned into "donkey". FIRMS, MODIS and VIIRS get mangled just as easily.
8. **After the first viewing, the viewer can answer four questions:** what the problem is, what was built, what result is visible and why NASA data is needed.

### A structure to check the pitch against

From the same review. It is a checklist for the argument, not a mandatory seven-slide template.

| Part | Question it answers | Minimal evidence |
|---|---|---|
| Problem | Who is affected, where, and which decision is difficult? | One named user situation and a sourced baseline |
| Contribution | What is different about the proposed approach? | One explained transformation or design choice |
| Demonstration | What enters, what happens, what comes out? | One readable example with input and output |
| Validity | Why should the result be trusted within its scope? | A control, comparison or explicit constraint; a known failure mode |
| NASA relevance | What part of the value depends on these resources? | The exact dataset, tool or resource and its role |
| Impact and next step | Who acts on the result, and what remains to be shown? | An adoption path and a clearly labelled future test |

How the winners' decks carried such an argument:

| Approach | Example | What to take |
|---|---|---|
| A user scenario leads to the product | Twisters, slides 1–6 | Begin with a specific decision the user has to make; show the result before listing further capabilities; label an invented dialogue as an illustration |
| The deck answers the judging questions | Resonant Exoplanets, slides 2–7 | Impact, Creativity, Validity, Relevance and Results as a sequence of questions; the slides need not be named after the criteria |
| A social purpose backed by architecture | AakashNet, slides 2–7 | The people and their constraint first, then one system diagram; detailed cost tables go to supporting material |
| A technical result connected to adoption | Astro Sweepers, slides 4–7 | Keep one worked case and the person acting on it central; the full business model stays behind the short argument |

Choosing the form: if the result is visible through an interaction, show the interaction; if the achievement is reasoning about a system, use one diagram and one worked scenario; if local action is central, show the place, the decision and the intervention.

### Other presentation forms among the winners

They are not needed in full for a 30-second Earth Fire Calendar demo, but the techniques carry over to the slides and the project page.

| Technique | Example | What to take |
|---|---|---|
| Choice under constraints | Gaia+LEO: decisions, goal, constraints, a recommendation per scenario | Show what can be changed, what must stay feasible and what the example recommends; keep the assumptions next to the result |
| Situation → choice → feedback | Henry's Farm Adventures | One complete episode instead of a description of how it is built; it is clear who it is for |
| Sequential narrative | A Solar Tale: one narrator, concepts introduced gradually | The tone of delivery matches the product itself; each new concept builds on the previous one |

### What not to copy

The winners' materials also contain claims of infallibility and accuracy with no reproducible check, model assumptions presented as discoveries, goals presented as results, forecasts formatted as reporting, agencies named as partners, and arithmetic that does not add up. An award does not confirm a claim. The length of the materials available today is not a guide either: the link between the current files and the original submissions has not been established.

### The official 30-second video outline

| Time | What to say |
|---|---|
| 0:00 | Introduce yourself: your name and the team name |
| 0:02 | Which challenge the project addresses and why it was chosen |
| 0:05 | The project name and a short tagline |
| 0:10 | How it works: images or a prototype, the user experience, the role of open data from NASA and partner agencies |
| 0:20–0:30 | A look ahead: what the solution could give people and the world |

The [video script](../video/demo-video.md) adapts this outline to a 29-second story with Lama, Alexey's plush alpaca assistant. A one-second live shot leads into an animated jump into the monitor; the character then narrates a real screen recording. The project name is spoken; the exact team name is added as a caption when supplied. The outline is the guide's advice, not an eligibility condition. The [shooting plan](../video/README.md) specifies the footage and tools.

| Script shot | Criteria it covers |
|---|---|
| 0–2 seconds: live footage and transition; 2–5.5 seconds: Lama introduces himself | Presentation |
| 5.5–11.5 seconds: MODIS → VIIRS in the same view | Relevance, Validity |
| 11.5–17 seconds: both sensors and NASA FIRMS attribution | Relevance, Creativity |
| 17–23 seconds: viewing geometry, land cover and weather | Creativity, Validity |
| 23–29 seconds: next step | Impact |

### Official advice on slides

- A template with a readable font size; as few words per slide as possible.
- The images show the project itself, the user experience and how open data and technology from NASA and partner agencies make the solution possible.

Our advice, not official:

- One point and one image per slide; put the methodology and the full bibliography on the project page and in the repository.
- Duplicate the meaning of colour with text or a symbol and keep text contrast at 4.5:1 or higher: these are guidelines from the Space Apps brand guide that are also useful for the styling of our own map. The review of SpaceGenes+ specifically notes a second visual cue besides colour.

What to show on each of the [seven slides](../presentation/demo-slides.md):

| Slide | Image | Criteria |
|---|---|---|
| 1 | Close-up of the globe with live FIRMS points | Presentation, Relevance |
| 2 | Two screenshots of the same view, MODIS and VIIRS, with the numbers and the snapshot time | Relevance, Validity |
| 3 | Close-up of one region in **All sensors** mode with **Color fire spots by sensor** on and the colour key visible | Impact, Creativity |
| 4 | Screenshot of the interface with a pinned group: the timeline and the conditions tables, with the estimates labelled | Validity, Relevance |
| 5 | Three numbered frames; the third is a pinned group with its MODIS and VIIRS columns | Presentation, Creativity |
| 6 | Diagram with "working" and "planned" labels | Validity |
| 7 | Closing frame, readable links, compact attribution | Impact, Presentation |

The numbers on slide 2 come from the snapshot the app fetched on 15 November at 08:36 UTC, that is, at 16:36 SGT: 79,349 VIIRS and 8,127 MODIS detections, 87,476 together. Its summary is saved in [`firms-snapshot-2026-11-15T0836Z.json`](../deliverables/firms-snapshot-2026-11-15T0836Z.json); the [project page text](../deliverables/project-description.md) and the [technical note](../deliverables/technical-note.md) use the same snapshot. The numbers on the slide must match the numbers in the screenshots: if you take new screenshots, replace the numbers and the snapshot time along with them.

## Earth Fire Calendar: what to show and what not to

**The main story.** In the same live NASA FIRMS data over 24 hours, VIIRS yields several times more detections than MODIS, and the two sets overlap only in part, so the twenty-year fire record cannot simply be stitched together. Earth Fire Calendar is a globe that shows which sensor saw each fire and attaches to every detection the conditions of its observation: viewing geometry, land cover and weather. This is evidence for harmonization; harmonization itself is the next step.

When and against which version the app was checked is in the [status against the formal requirements](formal-requirements.md#earth-fire-calendar-status-against-the-formal-requirements). Exactly which NASA products are used is in the [NASA Data field](form-fields.md#7-nasa-data).

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
| History since 2000, harmonization, validation, area and date selection, export | Not implemented | Only as the next step |
| Seasonal calendar, typical season, anomaly index | Not in the app. The sample calendar interface was removed; the calendar is a possible follow-up and survives only in the provisional name | Do not show or promise; if asked about the name, say it is provisional |

### Recording the video

- [ ] Record after the last interface change: the footage must match the version the judges will open.
- [ ] Open the [link with the prepared view](form-fields.md#4-link-to-final-project) in a private window. In a regular window the app restores the last saved view.
- [ ] Wait for the live counters, the **Latest detection** line and the points on the map. If the block reports that FIRMS data is unavailable, do not record: the map will have no detections.
- [ ] Record in a 1920×1080 window, or crop so that the counters are fully readable: in a 1440×900 window they are cut off at the bottom. Remove loading waits and accidental camera movements.
- [ ] Check the rendering: in a browser without graphics acceleration the VIIRS points appeared with a delay after the counters, and there were black patches at the poles of the globe. If they are there, crop without the poles.
- [ ] The name NASA FIRMS is visible in every shot with live points.
- [ ] Choose the region and the group for the 17–23-second detail scene in advance: a group containing both sensors, with the geometry, land-cover and weather rows already filled. The enrichment arrives after the detections; wait until the pinned card stops changing.
- [ ] Leave the orbits, the satellite HUD and the enrichment status rows out of the video; the pinned card appears only in the detail scene.
- [ ] Use the same viewport and feed snapshot for the MODIS → VIIRS comparison. The voiceover describes different hotspots without promising a fixed ratio or count.
- [ ] Give the real team name and the member details the rules allow; do not invent missing names.
- [ ] The duration is set by the recorded take, not by the storyboard. Our recommendation is a margin of one or two seconds below the limit in case the video host rounds up: the Astro Sweepers and QUEÑARIS videos as available today run 30.5 and 30.4 seconds. If the video does not fit, cut text or pauses rather than speeding up the speech.
- [ ] Check the duration of the exported file, not of the project in the editor.
- [ ] English subtitles are useful even with an English voiceover: the video then makes sense without sound.
- [ ] Open the finished link on a phone as well.

### What not to say

- Do not pass off **All sensors** mode as harmonization, colouring by sensor as a match between passes, plans as working features, or computed satellite passes and viewing geometry as FIRMS data.
- FIRMS detections are thermal anomalies, not individual fires; do not attribute a cause such as peatlands or industry to them without data.
- Do not promise fire forecasting, operational response, accuracy or damage reduction: the app shows where the two sensors disagree and under what conditions each detection was made. Do not describe a seasonal calendar, baselines or anomaly scores as existing features.

### Project page and repository

The guide advises saving the project page often so as not to lose work.

| What | State | Advice |
|---|---|---|
| A judge's first visit | With no parameters, on first visit the app opens on Singapore with all layers and **All sensors** mode, and requests geolocation; if allowed, it moves the view to the user when they are more than 100 km from Singapore. In the test screenshot of that view, clouds and night lights covered the map and the fire points were barely visible | Give the link with the prepared view in all materials: it opens the globe in MODIS mode without context layers and does not request geolocation |
| Statuses | The app shows no sample values. The passes without a detection, the processing marks and the viewing geometry are our estimates from orbits | On the project page, separate live data, estimates and plans |
| README and page metadata | The README and the description in `ui/index.html` now describe a tool for comparing the sensors; the name is marked as provisional. The link preview image `og-preview.png` still reads "MODIS 1 km · VIIRS 375 m harmonization" and "Seasonal burning baselines & live calendar anomalies" | Replace the preview image: it promises features the app does not have |
| The version the judges will see | GitHub Pages rebuilds the site on every push to `main` that changes `ui/` or the `deploy-ui.yml` file, and on manual runs; changes only to the README, `doc/` and `backend/` do not touch the site. The version published now is `3da451f`, deployed on 15 November at 17:47 SGT | Pin the commit or tag at the moment of submission and state it on the project page; do not publish changes after the deadline at the link from the submission. Take screenshots and record after the last interface change |
| Consistency of materials | — | Names, numbers and statuses in the demo match the project page and the README |

**Order of work before the deadline.** First, all the [items marked ⛔](formal-requirements.md#checklist): these include the license information for third-party materials. Then the remaining formal requirements: completeness of sources, AI disclosure. Then what affects the score: separation of statuses on the project page, the README, the link with the prepared view.

Sources: [Project Submission Guide](https://www.spaceappschallenge.org/resources/project-submission-guide/), [Judging & Awards Guide](https://www.spaceappschallenge.org/resources/judging-awards-guide/), [NASA Space Apps Brand Guidelines](https://www.spaceappschallenge.org/brand/), and our own comparison of the 2025 winners' presentation formats and of their recurring arguments.
