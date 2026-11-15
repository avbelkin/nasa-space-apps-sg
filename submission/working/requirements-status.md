# Earth Fire Calendar: current formal-requirement status

**Current decision: not cleared for final submission.** The [detailed audit](submission-compliance-audit.md) supersedes earlier status tables and covers every one of the 47 checkboxes in the frozen [formal requirements](../docs/formal-requirements.md). Read individual evidence and qualifications there rather than treating this summary as approval.

Team **Plush**: **Alexey Belkin** and **Viktoriia Naiman**. Lama is a fictional presenter; Claude Code and Codex are tools, not registered participants. The user confirms that the team owns the idea and all application development began after the start. Research collection/reading occurred earlier, so the applicability of the strict project-start rule to the pre-existing research/review remains an organizer question.

## Corrections now in the repository

- Original contributions: Apache-2.0 LICENSE with third-party exclusions in NOTICE.
- Live basemap: EOX 2016 CC BY 4.0 instead of the restricted 2025 layer; actual WMTS layer and tile verified, credit updated. Old slide/video captures remain unchanged historical 2025 imagery and must be replaced.
- Submitted [rights register](../deliverables/third-party-rights.md), [122-entry UI licence inventory](../deliverables/software-licenses.md) and public dependency notices; field 8 links both documents.
- Original labelled social-preview diagram and geometric favicon replace unverified illustration / Vite branding.
- Visible AI disclosure, machine-readable code/asset/model provenance, and model-output attribution / NASA non-responsibility added. Known GWIS/CAMS model additions and rejected Charlie/new voice auditions are preserved.
- Team source placeholders, grouping/causality/land-cover wording and 500 m versus 1 km score caveat corrected.
- Team-member consent exemption removed; a blank [private-completion template](../video/consent-template.md) is available, but no actual consent is recorded.

## Open release gates

| Gate | State |
|---|---|
| Final demo | Only historical 11.5 s pilot inspected; final at-most-30 s MP4 and public URL still required |
| Final complete deck | Seven-page old r6 and two-page r10 preview are local drafts; recapture 2025 maps, rebuild current complete source, inspect and publish |
| Third-party rights | CelesTrak redistribution basis, exact star-table provenance, Extremum composite/constituents and exact land-cover/weather-product conditions still need closure; see register for safe alternatives |
| Media permissions | Actual OpenRouter model/voice output terms, toy/scarf assessment, footage copyright and written adult consent still incomplete; synthetic generation does not automatically remove those conditions |
| Backend inventory/testing | No discoverable .NET SDK on this machine; resolved transitive NuGet inventory and final-commit backend test evidence must come from existing Windows/CI environment |
| Team platform | Members/event/waitlist, registration, private contact, exclusivity/employment/affiliation checks and local judging details not accessed |
| Final submission | Required final links, truthful checkboxes, Submit for Judging status, applicable time zone and Last Saved/Last Submitted timestamps not verified |
| Continued availability | Keep implementation/artifacts publicly accessible through 26 January 2027; preserve dated reference snapshots while live observations naturally update |

The [anonymous link-check record](compliance-link-check-2026-11-15.json) distinguishes successful project entry points from publisher blocks, TLS errors and incomplete browser verification. No failed automated reference request is silently called a nonexistent paper. FortiGuard classification remains optional.

The application and materials changed in parallel during the audit. Earlier AUROC/FRP baselines, the new GWIS/CAMS comparisons, source edits and voice rejections are retained; no old test count is substituted for the final integrated check. See the detailed audit's verification/accounting section for actual collected results and limitations. No Space Apps form was submitted or edited by this work.

## Last check of the published version

Checked on 15 November 2026 at 20:59–21:03 SGT (12:59–13:03 UTC) against `c16b7b7`, the current `main`. GitHub Pages deployed it at 21:01 SGT. The backend still runs `4686c3c`, deployed at 20:08 SGT; its code has not changed since. Nothing here lifts a gate in the table above.

| What | Result |
|---|---|
| Published interface | The published bundle contains the GWIS and CAMS weather-odds line, the notes that attribute model estimates to Earth Fire Calendar and state that NASA has not validated them, and the `s2cloudless_3857` (2016, CC BY 4.0) basemap; the 2025 layer name is no longer in it |
| Links without sign-in | HTTP 200 for the app, the repository, the technical note, the literature review, the rights register and the software inventory on GitHub, the public `third-party-notices.txt` and `ai-provenance.json`, and the backend `/health`. The video link and the deck PDF do not exist yet |
| Backend and FIRMS | `/api/firms/status` reported the key as valid and FIRMS as reachable. The backend answers the published origin with a matching `Access-Control-Allow-Origin` header |
| Live feed | 65,158 detections (MODIS 8,724, VIIRS 56,434), peak FRP 1,097.7 MW; geometry ready for all of them; background weather sampled for 0 of 512 targets on the answering instance; 8,962 shared weather grids |
| Interface tests | 114 passed, 0 failed, on `c16b7b7` |
| Backend tests | Not run: no .NET SDK on this machine. The backend code is the same as at `4686c3c` |
| Repository counts | 250 commits; `Co-Authored-By: Claude` trailers in 46 of them. The trailers do not measure the extent of AI assistance |

Not done in this check: the app was not opened in a browser, so rendering, the pinned card and a cold start of the backend were not observed. The Space Apps team page was not opened.
