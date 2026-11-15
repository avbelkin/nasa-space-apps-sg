# Space Apps 2026: advice on the submission and demo

[Slides](demo-slides.md) · [Video script](demo-video.md) · [Project page text](project-description.md) · [Technical note](technical-note.md) · [Form fields](form-fields.md) · [Formal requirements](formal-requirements.md) · [Advice](advice.md)

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
| Project page | Let the reader study the proposal; the page must make sense without the demo | What was built and how it works; the NASA datasets and the role of each; what runs on live data, what is a sample and what is planned; limitations; screenshots |
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
| **Impact** | A named user and decision: an emergency manager compares the current month in their area with the typical season — the scenario from the challenge description. A goal is called a goal, not an achieved effect. A map alone does not prove benefit: there must be an explicit link from the layer to the decision a person makes | Twisters: from the user's question to the decision screen; QUEÑARIS: place → consequence → method → action |
| **Creativity** | One memorable idea: the map shows where it is burning, the calendar shows when and how unusual that is | Resonant: a named mechanism — memorable, but it proves nothing by itself; SpaceGenes+: one central visualization |
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
6. **Statuses are not mixed.** For QUEÑARIS, the seedlings already grown in the video and the first-year planting target on the site are different quantities, and neither is a measured result. A positive example is the SpaceGenes+ site: it says outright that one case works and the rest is a concept. Ours keeps live data, samples and plans separate in the same way.
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

The [video script](demo-video.md) is an adaptation of this outline, not a literal execution of it. The project name is spoken; the team name and the challenge appear as captions in the first shot. The presenter's name, a separate tagline and the explanation of why the challenge was chosen are omitted. The outline is the guide's advice, not an eligibility condition.

| Script shot | Criteria it covers |
|---|---|
| First: title | Presentation |
| Second: MODIS | Relevance |
| Third: switch to VIIRS | Relevance, Validity |
| Fourth: calendar | Creativity, Validity |
| Fifth: next step | Impact |

### Official advice on slides

- A template with a readable font size; as few words per slide as possible.
- The images show the project itself, the user experience and how open data and technology from NASA and partner agencies make the solution possible.

Our advice, not official:

- One point and one image per slide; put the methodology and the full bibliography on the project page and in the repository.
- Duplicate the meaning of colour with text or a symbol and keep text contrast at 4.5:1 or higher: these are guidelines from the Space Apps brand guide that are also useful for the styling of our own map and calendar. The review of SpaceGenes+ specifically notes a second visual cue besides colour.

What to show on each of the [seven slides](demo-slides.md):

| Slide | Image | Criteria |
|---|---|---|
| 1 | Close-up of the globe with live FIRMS points | Presentation, Relevance |
| 2 | Two screenshots of the same view, MODIS and VIIRS, with the numbers and the snapshot time | Relevance, Validity |
| 3 | Close-up of the month strip and the **Typical / This year** tiles with the `Sample data` label | Impact, Creativity |
| 4 | Screenshot of the interface with status labels | Validity, Relevance |
| 5 | Three numbered frames; the third with the sample label | Presentation, Creativity |
| 6 | Diagram with "working" and "planned" labels | Validity |
| 7 | Closing frame, readable links, compact attribution | Impact, Presentation |

The numbers on slide 2 come from the check on 15 November at 05:20 SGT; the app received its data snapshot at 21:19 UTC on 14 November, that is, at 05:19 SGT on 15 November. Together they give 90,336 detections. No API response or screenshot from that moment was saved, so the numbers cannot be confirmed after the fact. The numbers on the slide must match the numbers in the screenshots: if you take new screenshots, replace the numbers and the snapshot time along with them.

## Earth Fire Calendar: what to show and what not to

**The main story.** In the same live NASA FIRMS data over 24 hours, VIIRS yields several times more detections than MODIS, so the twenty-year fire record cannot simply be stitched together. Earth Fire Calendar is a globe and a calendar that will show whether fire activity is typical for a chosen place and month. For now the calendar runs on samples.

When and against which version the app was checked is in the [status against the formal requirements](formal-requirements.md#earth-fire-calendar-status-against-the-formal-requirements). Exactly which NASA products are used is in the [NASA Data field](form-fields.md#7-nasa-data).

| Element | Status | How to show it |
|---|---|---|
| NASA FIRMS active-fire points for 24 hours | Live data worldwide | The main shot |
| **MODIS / VIIRS** switch | Filters the live points and counters | The key action of the video |
| Counters in the **Live active fire spots (NASA FIRMS · 24h)** block | Global over 24 hours; independent of the selected location and month. The **Active spots (24h)** tile shows the number for the selected sensor; in MODIS mode the **VIIRS 375 m** tile shows 0, in VIIRS mode the **MODIS 1 km** tile shows 0, and both numbers are visible side by side only in Harmonized mode | Only with `Area: Global`; compare using the **Active spots (24h)** tile and caption it as the whole world and the selected sensor |
| **Harmonized** mode | Combines MODIS and VIIRS detections with no calibration and no removal of duplicates. The sample index is shown without a multiplier in this mode | Do not call it harmonization; describe it as combined observations |
| The 0–100 index, the **Typical / This year** tiles, the month strip, the **Locations** list | Sample. The `Sample index` label is in the top row, the `Sample data` label only in the summary block; the Locations list and the month strip have no label of their own. The tooltip on `Sample data` says the values are illustrative "until live FIRMS data is connected", although it already is | As the interface of the future calendar; at least one label must be visible in the shot |
| Sample texts: the caption under the Global tiles and the texts that appear in the summary after a location is selected | A sample that reads like a finding: "Transition toward wet monsoon conditions aligns closely with historical seasonal decline", "MODIS and VIIRS agree here", peatlands near Singapore, "harmonized FRP normalizes…" | Do not show large or read aloud; better to replace with neutral text before recording |
| Locations values when the sensor changes | In MODIS and VIIRS modes the location values are multiplied by hard-coded 0.82 and 1.28; the Global tiles and the month strip do not depend on the sensor. For November: Singapore +8 with MODIS and +13 with VIIRS. There is no upper cap, so with VIIRS the sample goes beyond its own 0–100 scale: in peak months Amazon Basin gives 116 and Singapore 108 | In the sensor-switch shot keep only the map and the live counters; do not show a location in a peak month with VIIRS |
| Point card: bars of detections over 24 hours by satellite | Live FIRMS data; known inaccuracies: in `Conf NN%` the VIIRS categories are converted to percentages (25, 65, 95), and `MW total` sums FRP across different passes | Do not show large |
| Point card: the `Pass, no fire` and `Processing` labels, the Sun curve | Computed from CelesTrak orbits and fixed processing delays (90 minutes for VIIRS, 120 minutes for MODIS), not FIRMS data; a pass without a detection does not prove the absence of fire | Leave out of the video; on the project page only with this explanation |
| **Satellite passes** HUD (`ready` / `processing`) and orbit lines: solid for `ready`, dashed for `in processing` | An estimate from the orbit calculation and a timer, not confirmation that data has arrived | Leave out of the video |
| Orbits, clouds, precipitation, night lights, star background | Context layers | Switch off in the key shots; night lights are easily mistaken for fires |
| Source credits | There is no credit on the map itself. In version `ff90992`, with the **Sources and credits** block collapsed, the sidebar footer shows the short line "NASA FIRMS · NASA GIBS · CelesTrak · EOX / Copernicus Sentinel-2 · Extremum. Not affiliated with NASA."; the full list is in the expanded block. The heading of the counter block names NASA FIRMS | If the shot is cropped to the map, the name NASA FIRMS must appear in the shot's caption |
| History since 2000, harmonization, validation, arbitrary area selection, CSV export | Not implemented. "Choose an area" currently means choosing one of six predefined locations | Only as the next step |

**A risk for the script and the slides.** The repository has an unmerged branch, `codex/remove-sample-fire-data`, that removes the sample interface. If it is merged into `main`, there will be nothing to show in the fourth shot of the video or for the calendar items on slides 4 and 5: they would have to be rewritten before recording.

### Recording the video

- [ ] Record after the last interface change: the footage must match the version the judges will open.
- [ ] Open the [link with the prepared view](form-fields.md#4-link-to-final-project) in a private window. In a regular window the app restores the last saved view.
- [ ] Wait for the live counters, the **Latest detection** line and the points on the map. If the block reports that FIRMS data is unavailable, do not record: only samples will remain on the map.
- [ ] Record with `Area: Global` in a 1920×1080 window, or crop so that the counters are fully readable: in a 1440×900 window they are cut off at the bottom. Remove loading waits and accidental camera movements.
- [ ] Check the rendering: in a browser without graphics acceleration the VIIRS points appeared with a delay after the counters, and there were black patches at the poles of the globe. If they are there, crop without the poles.
- [ ] The sample labels are readable in every shot with the index; the name NASA FIRMS is visible in every shot with live points.
- [ ] Leave the orbits, the satellite HUD, the point card and the API diagnostics out of the video.
- [ ] Check that the phrase about "far more" VIIRS detections matches the numbers in the shot. During the check, after switching to VIIRS the points became noticeably denser over India, China, Indochina, Indonesia and Australia.
- [ ] Give the real team name and the member details the rules allow; do not invent missing names.
- [ ] The duration is set by the recorded take, not by the storyboard. Our recommendation is a margin of one or two seconds below the limit in case the video host rounds up: the Astro Sweepers and QUEÑARIS videos as available today run 30.5 and 30.4 seconds. If the video does not fit, cut text or pauses rather than speeding up the speech.
- [ ] Check the duration of the exported file, not of the project in the editor.
- [ ] English subtitles are useful even with an English voiceover: the video then makes sense without sound.
- [ ] Open the finished link on a phone as well.

### What not to say

- Do not pass off Harmonized mode and the index multipliers as calibration, samples as results, plans as working features, or computed satellite passes as FIRMS data.
- FIRMS detections are thermal anomalies, not individual fires; do not attribute a cause such as peatlands or industry to them without data.
- Do not promise fire forecasting, operational response, accuracy or damage reduction: the calendar answers when an area usually burns and whether the current period is unusual.

### Project page and repository

The guide advises saving the project page often so as not to lose work.

| What | State | Advice |
|---|---|---|
| A judge's first visit | With no parameters, on first visit the app opens on Singapore with all layers, Harmonized mode and the current month, and requests geolocation; if allowed, it moves the view to the user when they are more than 100 km from Singapore. In the test screenshot of that view, clouds and night lights covered the map and the fire points were barely visible | Give the link with the prepared view in all materials: it opens the globe in MODIS mode without context layers and does not request geolocation |
| Sample texts | The index, the calendar and Locations are labelled as samples, but the texts in the summary read like findings | On the project page, separate live data, sample and plan; replace the sample texts with neutral ones |
| README and page metadata | The README describes the project in the present tense as showing departures based on harmonized records, although harmonization is not implemented; the name is marked as provisional. The description and title in `ui/index.html` promise the same ("harmonizing MODIS… and VIIRS…", "Harmonized MODIS & VIIRS Fire Anomalies") | Bring the README and metadata into line with the project page |
| The version the judges will see | GitHub Pages rebuilds the site on every push to `main` that changes `ui/` or the `deploy-ui.yml` file, and on manual runs; changes only to the README, `doc/` and `backend/` do not touch the site. Since the previously checked commit `05161f3`, 18 more commits have been published; the source credits, the point card and the orbit lines changed in that time | Pin the commit or tag at the moment of submission and state it on the project page; do not publish changes after the deadline at the link from the submission. Take screenshots and record after the last interface change |
| Consistency of materials | — | Names, numbers and statuses in the demo match the project page and the README |

**Order of work before the deadline.** First, all the [items marked ⛔](formal-requirements.md#checklist): these include the license information for third-party materials. Then the remaining formal requirements: completeness of sources, AI disclosure. Then what affects the score: separation of statuses on the project page, the README, the link with the prepared view.

Sources: [Project Submission Guide](https://www.spaceappschallenge.org/resources/project-submission-guide/), [Judging & Awards Guide](https://www.spaceappschallenge.org/resources/judging-awards-guide/), [NASA Space Apps Brand Guidelines](https://www.spaceappschallenge.org/brand/), and our own comparison of the 2025 winners' presentation formats and of their recurring arguments.
