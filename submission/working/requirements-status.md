# Earth Fire Calendar: status against the formal requirements

[Slides](../presentation/demo-slides.md) · [Video script](../video/demo-video.md) · [Project page text](../deliverables/project-description.md) · [Technical note](../deliverables/technical-note.md) · [Form fields](form-fields.md) · [Formal requirements](../docs/formal-requirements.md) · [Advice](../docs/advice.md)

Where Earth Fire Calendar stands against the official [formal requirements](../docs/formal-requirements.md). This is a living document. Each row records what was found at the time of the check described below; re-check a row against the current app before relying on it, and update it when the app or the materials change.

The app was checked on 15 November at 05:15–05:30 SGT against commit `38f0407` and against the public version, opened without sign-in in 1920×1080 and 1440×900 windows; the GitHub Pages deployment was started at 05:16 SGT and completed successfully. Later the same day the code was checked against the repository: the current `main` is `ff90992` (05:29 SGT), one commit newer. For the event in Singapore the deadline is 15 November, 23:59 SGT (UTC+8).

Re-checked against the code at `2d3f5df` on 15 November, evening SGT: the rows on the Extremum link, licences of third-party layers, credits, site icon, link preview image, project license, AI disclosure, AI in the demo and music. The rows on link access, the basemap license, the start of work, personal data and availability were not re-checked. The Space Apps team page was not opened at any point.

| Requirement | State | What to do |
|---|---|---|
| Work started after the kick-off | The repository's first commit was made on 14 November at 14:31 SGT, after the start. The commit history does not establish when work actually began | The team should confirm for itself that no work was done before the start |
| Link access | The app and the repository opened without sign-in; the backend responded and live FIRMS data loaded | Open both links in a private window before submitting |
| Basemap license | The app loads the EOX `s2cloudless-2025` layer. The EOX license page, reopened on 15 November, permits free use for non-commercial purposes only, under CC BY-NC-SA 4.0 | The "non-commercial only" restriction does not meet the requirement for third-party materials; this is the conclusion of our check, not a clarification from the organizers. Replace the basemap with a NASA layer or a layer under an open license. Recording the license in References does not lift the restriction; the layer can stay only on a confirmed basis, such as a reply from the organizers |
| Extremum link | Fixed: the app's source credits now link to `https://gis.extremum.org`, which opened when checked on 15 November | Nothing |
| Licenses of the other third-party layers | The [project page text, field 8](../deliverables/project-description.md#8-space-agency-partner-data-and-other-references) now lists the sources with their licences, but 17 entries are still marked **check**. The repository README names the sources without licences | Resolve every **check** mark before submitting; the licence information must be in the documentation submitted with the project |
| Completeness of credits in the app | The bright-star catalogue appears neither in the **Sources and credits** block nor in the short sources line | Our advice: add the catalogue to the sources block |
| Site icon | `favicon.svg` is the unmodified logo of the Vite template | Replace it with your own or remove it |
| Link preview image | `og-preview.png` is not a screenshot but an illustration with the text "MODIS 1 KM · VIIRS 375 M HARMONIZATION"; its provenance is not recorded | If it was AI-generated, it needs a watermark and disclosure; in any case it promises harmonization as finished |
| Project license | There is no `LICENSE` file in the repository | If something other than Apache 2.0 is wanted, state the license explicitly |
| AI disclosure | The README and `doc/` have no section on AI use. `Co-Authored-By: Claude` trailers appear in 41 of 219 commits (counted at `2d3f5df`). The others have no trailers, although four branches are named `codex/*`, there is an `AGENTS.md` in the root, and the documentation mentions a Google AI Ultra subscription. The [project page text, field 6](../deliverables/project-description.md#6-use-of-super-intelligence-si) lists the AI tools; its commit count is older | The number of trailers does not show the full extent. Describe in the README all AI tools used: where and for what. Refresh the commit count in field 6 at submission |
| AI in the demo | The Lama presenter image was generated with OpenAI ChatGPT from an original photo. The draft narration is synthesized with ElevenLabs Eleven v4 through OpenRouter. The footage and app captures are real recordings. The final video is not exported yet | Keep `AI-edited image` visible whenever the character appears; use the prepared [description and metadata text](../video/disclosures.md) and update it if the voice or model changes; verify the labels and metadata in the final export |
| Music in the demo | The production plan has no music in the first edit; the final export was not checked | Only with a license that permits such use, and with a line in References; otherwise no music |
| Brand | No files with NASA logos were found in the repository; by the team's decision the app does not use the Space Apps logo | Do not add the NASA Insignia or Logotype to the demo |
| Personal data | The email addresses of two authors are visible in the public commit history | The team should decide whether this is acceptable |
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
| People and personal data | Written consent of every person shown in the video; no minors; no personal data in the submission. The opening is live footage, so check who is recognizable in it | The team |
| Prohibited content | No advertising, proprietary information or export-controlled content. Not reviewed | The team |
| AI rules beyond disclosure | Visible watermark on generated images, AI use stated in the metadata of generated audio, no NASA branding in generated material, the idea belongs to the team. Prepared in the [disclosures](../video/disclosures.md); not verified on the final export | Check the final export |
| FortiGuard classification | Optional. No request is recorded | The team decides |

**Not checked at all:** the project page on the Space Apps site, the Members tab, the Team Contact Information field, the team name and roster, the local judging schedule and the final demo. These require signing in to the team account or a reply from the organizer.
