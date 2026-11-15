# Earth Fire Calendar: status against the formal requirements

[Slides](../presentation/demo-slides.md) · [Video script](../video/demo-video.md) · [Project page text](../deliverables/project-description.md) · [Technical note](../deliverables/technical-note.md) · [Form fields](form-fields.md) · [Formal requirements](../docs/formal-requirements.md) · [Advice](../docs/advice.md)

Where Earth Fire Calendar stands against the official [formal requirements](../docs/formal-requirements.md). This is a living document. Each row records what was found at the time of the check described below; re-check a row against the current app before relying on it, and update it when the app or the materials change.

The app was checked on 15 November at 05:15–05:30 SGT against commit `38f0407` and against the public version, opened without sign-in in 1920×1080 and 1440×900 windows; the GitHub Pages deployment was started at 05:16 SGT and completed successfully. Later the same day the code was checked against the repository: the current `main` is `ff90992` (05:29 SGT), one commit newer. For the event in Singapore the deadline is 15 November, 23:59 SGT (UTC+8).

Re-checked on 15 November, 19:50–20:10 SGT, against the code at `2d3f5df`, which is also the commit GitHub Pages deployed at 19:49 SGT: every row of the table below. For availability, only the current state was checked: the backend answered and served live data; a cold start after hibernation was not tested. The public app was opened in a clean headless Chrome profile in 1920×1080 and 1440×900 windows; the links were requested without sign-in. The Space Apps team page was not opened at any point.

Re-checked again on 15 November, 20:05–20:25 SGT, against `c73d0b5`, the current `main`: GitHub Pages deployed it at 20:07 SGT, and the backend was redeployed from `4686c3c` at 20:08 SGT. Since `2d3f5df` the code changed in two places only: the local weather worker now backfills GFS grids from NOAA's public cloud archive, and the **Expected detection, no match** note is drawn in an error colour. Neither changes a row of the table below. This time the links, the backend status endpoints and the live feed were requested, the published bundle was confirmed to contain the `c73d0b5` change, and the repository counts were redone; the app was not opened in a browser.

Re-checked on 15 November, 21:30 SGT, against the corrections made after `7ed4d73` (licence, basemap, credits, AI disclosure); rows not mentioned there are unchanged. The participant terms were re-read for the rows on third-party materials and people in the video.

| Requirement | State | What to do |
|---|---|---|
| Work started after the kick-off | The repository's first commit was made on 14 November at 14:31 SGT, after the start (re-checked). The commit history does not establish when work actually began | The team should confirm for itself that no work was done before the start |
| Link access | Re-checked without sign-in on 15 November at 20:10 SGT: the app, the repository, the technical note and the literature review on GitHub, and the backend `/health` all returned 200; the backend's `/api/firms/status` reported the FIRMS key as valid and FIRMS as reachable; the feed returned 69,890 live detections (MODIS 8,951, VIIRS 60,939). The video link does not exist yet | Open the video link in a private window once it exists |
| Basemap license | Fixed on 15 November (`969941f`, deployed): the app uses EOxCloudless 2016, layer `s2cloudless_3857`, **CC BY 4.0**, with EOX's credit wording. The 2018–2025 layers are CC BY-NC-SA 4.0, which does not meet the participant terms' rule that non-NASA, non-partner materials be "freely and publicly available without restriction" or OSI-licensed | Map frames captured before 20:54 SGT on 15 November show the 2025 layer: re-capture them from the live app for the deck and the video. If an old frame stays, name its licence in the [register](../deliverables/third-party-rights.md) |
| Extremum link | Fixed: the app's source credits now link to `https://gis.extremum.org`, which opened when checked on 15 November | Nothing |
| Licenses of the other third-party layers | Every source is listed with its use and licence in the [third-party materials register](../deliverables/third-party-rights.md), linked from field 8; dependencies in the [software inventory](../deliverables/software-licenses.md). | Nothing |
| Completeness of credits in the app | Fixed: the bright-star catalogues are now in **Sources and credits** | Nothing |
| Site icon | Fixed: replaced with an original icon | Nothing |
| Link preview image | Replaced with a code-rendered card that no longer promises finished harmonization | Optional: restore a nicer illustration if its provenance is known and its text matches the app |
| Project license | Fixed: `LICENSE` (Apache-2.0) and `NOTICE` in the root | Nothing |
| AI disclosure | Fixed: the README, the [project page text](../deliverables/project-description.md) fields 5, 6 and 8, the technical note and [`ai-provenance.json`](../../ui/public/ai-provenance.json) name Claude Code, Codex, the ChatGPT image tool, Veo and ElevenLabs | Nothing |
| AI in the demo | Character design: OpenAI ChatGPT image tool; motion: Google Veo 3.1 Lite via OpenRouter; voice: ElevenLabs Eleven v4 "Flicker" via OpenRouter (selected 15 November; narration text pending). Live footage and app imagery are real recordings | Keep `AI-generated` on the character; write the actual tools into the final MP4 metadata and video description ([disclosures](../video/disclosures.md)) |
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

