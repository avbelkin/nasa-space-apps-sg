# Earth Fire Calendar: status against the formal requirements

[Slides](../presentation/demo-slides.md) · [Video script](../video/demo-video.md) · [Project page text](../deliverables/project-description.md) · [Technical note](../deliverables/technical-note.md) · [Form fields](form-fields.md) · [Formal requirements](../docs/formal-requirements.md) · [Advice](../docs/advice.md)

Where Earth Fire Calendar stands against the official [formal requirements](../docs/formal-requirements.md). This is a living document. Each row records what was found at the time of the check described below; re-check a row against the current app before relying on it, and update it when the app or the materials change.

The app was checked on 15 November at 05:15–05:30 SGT against commit `38f0407` and against the public version, opened without sign-in in 1920×1080 and 1440×900 windows; the GitHub Pages deployment was started at 05:16 SGT and completed successfully. Later the same day the code was checked against the repository: the current `main` is `ff90992` (05:29 SGT), one commit newer. For the event in Singapore the deadline is 15 November, 23:59 SGT (UTC+8).

Re-checked on 15 November, 19:50–20:10 SGT, against the code at `2d3f5df`, which is also the commit GitHub Pages deployed at 19:49 SGT: every row of the table below. For availability, only the current state was checked: the backend answered and served live data; a cold start after hibernation was not tested. The public app was opened in a clean headless Chrome profile in 1920×1080 and 1440×900 windows; the links were requested without sign-in. The Space Apps team page was not opened at any point.

Re-checked again on 15 November, 20:05–20:25 SGT, against `c73d0b5`, the current `main`: GitHub Pages deployed it at 20:07 SGT, and the backend was redeployed from `4686c3c` at 20:08 SGT. Since `2d3f5df` the code changed in two places only: the local weather worker now backfills GFS grids from NOAA's public cloud archive, and the **Expected detection, no match** note is drawn in an error colour. Neither changes a row of the table below. This time the links, the backend status endpoints and the live feed were requested, the published bundle was confirmed to contain the `c73d0b5` change, and the repository counts were redone; the app was not opened in a browser.

Re-checked on 15 November, 21:30 SGT, against the corrections made after `7ed4d73` (licence, basemap, credits, AI disclosure); rows not mentioned there are unchanged. The participant terms were re-read for the rows on third-party materials and people in the video.

Re-checked against `ab196ce` on 15 November at 22:21–22:30 SGT: all five deliverables were reconciled with code, the public PDF and the video production state. [Audit and acceptance record](deliverables-audit-2026-11-15.md). The app, health endpoint, feed and PDF returned HTTP 200; 120 UI tests, build and lint passed. Backend tests were not rerun because this machine has no .NET SDK. The public PDF now fills the demo link; the final video remains unpublished.

| Requirement | State | What to do |
|---|---|---|
| Work started after the kick-off | The repository's first commit was made on 14 November at 14:31 SGT, after the start (re-checked). The commit history does not establish when work actually began | The team should confirm for itself that no work was done before the start |
| Link access | Re-checked without sign-in on 15 November at 20:10 SGT: the app, the repository, the technical note and the literature review on GitHub, and the backend `/health` all returned 200; the backend's `/api/firms/status` reported the FIRMS key as valid and FIRMS as reachable; the feed returned 69,890 live detections (MODIS 8,951, VIIRS 60,939). The video link does not exist yet | Open the video link in a private window once it exists |
| Basemap license | Fixed on 15 November (`969941f`, deployed): the app uses EOxCloudless 2016, layer `s2cloudless_3857`, **CC BY 4.0**, with EOX's credit wording. The 2018–2025 layers are CC BY-NC-SA 4.0, which does not meet the participant terms' rule that non-NASA, non-partner materials be "freely and publicly available without restriction" or OSI-licensed | The public deck uses refreshed 2016-layer captures. Superseded local video artifacts retain the 2025 layer and are now explicitly listed in the [register](../deliverables/third-party-rights.md). Replace those frames in the final video as the production plan requires |
| Extremum link | Fixed: the app's source credits now link to `https://gis.extremum.org`, which opened when checked on 15 November | Nothing |
| Licenses of the other third-party layers | Every source is listed with its use and licence in the [third-party materials register](../deliverables/third-party-rights.md), linked from field 8; dependencies in the [software inventory](../deliverables/software-licenses.md). | Nothing |
| Completeness of credits in the app | Fixed: the bright-star catalogues are now in **Sources and credits** | Nothing |
| Site icon | Fixed: replaced with an original icon | Nothing |
| Link preview image | Replaced with a code-rendered card that no longer promises finished harmonization | Optional: restore a nicer illustration if its provenance is known and its text matches the app |
| Project license | Fixed: `LICENSE` (Apache-2.0) and `NOTICE` in the root | Nothing |
| AI disclosure | Fixed: the README, the [project page text](../deliverables/project-description.md) fields 5, 6 and 8, the technical note and [`ai-provenance.json`](../../ui/public/ai-provenance.json) name Claude Code, Codex, the ChatGPT image tool, Veo and ElevenLabs | Nothing |
| AI in the demo | Character design: OpenAI ChatGPT image tool; motion: Google Veo 3.1 Lite via OpenRouter; voice: ElevenLabs Eleven v4 "Flicker" via OpenRouter; the five accepted takes use the exact 47-word script, with no pitch or tempo shift. The first local assembly is superseded. Its photographic plush cutout is AI-edited and its reconstructed desk background is generated; real footage and app captures remain real | Keep `AI-generated` on the character; write the actual tools into the final MP4 metadata and video description ([disclosures](../video/disclosures.md)) |
| Music in the demo | The production plan has no music in the first edit; the final export was not checked | Only with a license that permits such use, and with a line in References; otherwise no music |
| Brand | No files with the NASA Insignia, Logotype or Seal are in the repository (re-checked by file name). The official Space Apps brand kit is stored in `submission/assets/` for the slides; by the team's decision the app itself does not use the Space Apps logo | Do not add the NASA Insignia or Logotype to the demo |
| Personal data | Three distinct author email addresses are visible in the public commit history (re-checked) | The team should decide whether this is acceptable |
| Availability during judging | The app is hosted on `github.io`, the backend on Cloud Run (`run.app`). The live points, orbits and clouds depend on the backend and the FIRMS key; without them the map shows no detections | Do not shut down the backend or the key before 26 January 2027; after Cloud Run goes into hibernate mode, check the cold start. Do not delete or replace the demo file at the link |

## Requirements with no status yet

The table above does not cover every item of the [checklist](../docs/formal-requirements.md#checklist). These groups have no recorded status; none of them can be checked from the repository.

| Checklist group | What is missing | Who confirms |
|---|---|---|
| Team and challenge | Members tab and waitlist, team size, one team per member, Team Contact Information, registration before the start, no US federal employees, minors, no prohibited affiliation with China, local judging time and format | The team, on the Space Apps team page and with the organizer |
| Deadline and submission | All required fields filled, both checkboxes ticked, **Submit for Judging** clicked before 23:59 SGT on 15 November, both timestamps matching | The team, on the form |
| Language | The submission page, slides, video narration and subtitles are in English. The repository documents are in English; the page and the final video were not checked | The team, on the final materials |
| Demo limit | Video no longer than 30 seconds, measured on the exported file; the script targets 29 seconds | Check the final export |
| NASA Data field | Filled from [field 7 of the project page text](../deliverables/project-description.md#7-nasa-data) | The team, on the form |
| People and personal data | The video terms ask for written consent from every person featured. If Alexey is recognizable in the opening footage: as a registered participant he also grants NASA use of his likeness under the terms | Keep a one-line written OK from Alexey in the team chat. No one under 18, no personal data |
| Prohibited content | No advertising, proprietary information or export-controlled content. Not reviewed | The team |
| AI rules beyond disclosure | Visible watermark on generated images, AI use stated in the metadata of generated audio, no NASA branding in generated material, the idea belongs to the team. Prepared in the [disclosures](../video/disclosures.md); not verified on the final export | Check the final export |
| FortiGuard classification | Optional. No request is recorded | The team decides |

**Not checked at all:** the project page on the Space Apps site, the Members tab, the Team Contact Information field, the team name and roster, the local judging schedule and the final demo. These require signing in to the team account or a reply from the organizer.


## Last check of the published version

Checked on 15 November 2026 at 20:59–21:03 SGT (12:59–13:03 UTC) against `c16b7b7`, the last commit that changed the app; later commits on `main` change only submission materials. GitHub Pages deployed it at 21:01 SGT. The backend still runs `4686c3c`, deployed at 20:08 SGT; its code has not changed since. `09b25a0`, deployed at 21:26 SGT, then changed only the wording of the model notes, the source credits and the page description; at 21:30 SGT its published bundle contained the new notes, and the interface tests passed on it, 114 of 114.

| What | Result |
|---|---|
| Published interface | The published bundle contains the GWIS and CAMS weather-odds line, the notes that attribute model estimates to Earth Fire Calendar and state that NASA has not validated them, and the `s2cloudless_3857` (2016, CC BY 4.0) basemap; the 2025 layer name is no longer in it |
| Links without sign-in | HTTP 200 for the app, the repository, the technical note, the literature review, the rights register and the software inventory on GitHub, the public `third-party-notices.txt` and `ai-provenance.json`, and the backend `/health`. The video link and the deck PDF do not exist yet |
| Backend and FIRMS | `/api/firms/status` reported the key as valid and FIRMS as reachable. The backend answers the published origin with a matching `Access-Control-Allow-Origin` header |
| Live feed | 65,158 detections (MODIS 8,724, VIIRS 56,434), peak FRP 1,097.7 MW; geometry ready for all of them; background weather sampled for 0 of 512 targets on the answering instance; 8,962 shared weather grids |
| Interface tests | 114 passed, 0 failed, on `c16b7b7` |
| Backend tests | Not run: no .NET SDK on this machine. The backend code is the same as at `4686c3c` |
| Repository counts | 250 commits; `Co-Authored-By: Claude` trailers in 46 of them. The trailers do not measure the extent of AI assistance |

Not done in this check: the app was not opened in a browser; the pinned-card outputs and a cold start of the backend remain unobserved. The Space Apps team page was not opened.
