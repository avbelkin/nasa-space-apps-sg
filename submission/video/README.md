# Production plan for the Lama video

[Script and narration](demo-video.md) · [AI disclosures](disclosures.md) · [Requirements](../docs/formal-requirements.md) · [Advice](../docs/advice.md)

The review draft targets **29 seconds, 1920×1080, 30 fps — 870 frames**. The accepted asset-preparation block is followed by one combined animation and full-draft block, then a review stop. Media and local review pages remain in the Git-ignored submission/video/lama/ folder.

## Current production decisions

| Element | Decision |
|---|---|
| Opening | 1.4 seconds of live footage, then a 0.6-second push into the lower monitor |
| Title | Earth Fire Calendar and Harmonization of MODIS and VIIRS Hot Spots over the opening; insert the exact team name when supplied |
| Narration | The agreed 46 English words, starting at 2 seconds; no additional spoken opening |
| Voice | ElevenLabs Eleven v4, Will, through OpenRouter; a young adult male with bright, energetic, playful delivery |
| Transition | Final live frame → 8-frame push → 4 blurred frames → 6-frame interface reveal; no reconstructed background |
| Live portrait | 608×1080 centered over a blurred enlarged copy; the selected shot includes Alexey |
| Character | Existing AI-edited Lama PNG; keep the scarf and direction, do not mirror or regenerate |
| Motion | Small entrance bounce and one short shift; no separate mouth or toe animation |
| Composition | Interface at x=16, y=24, 1600×900; Lama at x≈1640, y=700, 255×340 |
| Watermark | AI-edited image burned into the lower part of the character, over the feet at y≈984–1012; it moves with him |
| Subtitles | x=48, y=940, width 1490, at most two 44-pixel lines; no ordinary-scene credit footer |
| Detail scenes | Magnify the real counter at 5.5–11.5 seconds and actual context rows at 17–23 seconds |
| Closing card | Project title, next step, URL, NASA FIRMS credit and non-endorsement statement |

## Tools and reproduction

Use the installed FFmpeg, Chrome and Node. Chrome renders English text and transparent overlays; FFmpeg assembles the transition, character motion, narration and MP4. No Remotion or new packages are required. Speech parameters follow the [OpenRouter ElevenLabs integration](https://openrouter.ai/blog/announcements/elevenlabs-on-openrouter/). chrome.mjs, capture-details.mjs and render-draft.mjs implement this route.

Run from the repository root: node submission/video/render-draft.mjs /absolute/path/to/submission/video/lama/prepared

Set LAMA_TEAM_NAME to the team's exact spelling. An unset name produces an explicit draft placeholder; that export is not ready to submit. The renderer requires the five completed ElevenLabs files under prepared/draft/elevenlabs/ and does not make API calls.

synthesize.py is the bounded speech adapter for the user-selected existing research gateway. Run it with that gateway's managed Python interpreter and --gateway-root; it uses the gateway's credential loader, HTTP client, redaction, shared reservation and spending ledger. The text-only gateway has no binary speech command, so the adapter adds that transport without changing its text-model allowlist. The $0.30 run cap and shared provider daily cap remain enforced. No keys or private gateway paths belong in this repository. A saved run manifest prevents accidental resubmission; retain generation IDs for billing and review.

## Local review files

Under lama/prepared/:

- draft/lama-draft.mp4 — completed 29-second draft for review;
- draft/render-report.json — actual duration, streams, frame counts, scene timing and voice alignment;
- draft/elevenlabs/ — generated narration, original generation IDs and accounting manifests;
- review.html and REVIEW.md — local review player and findings/status;
- lama-presenter.png — existing 1086×1448 RGBA image generated from the original photo;
- intro-centered.mp4 — selected 42-frame muted opening;
- ui/01-modis.png through 04-map.png — temporary production screenshots from one earlier snapshot;
- ui/05-geometry.png, 05-land.png, 05-weather.png, 05-context.json — real populated detail rows captured from a mixed MODIS/VIIRS group on production; separate, later snapshot.

The current detail example is the group near latitude −14.906°, longitude 126.865°, with 123 detections at capture. The JSON retains actual rows and capture time. It is a screen-proximity group, not a confirmed matched fire. The three detail crops come from that same selection. Show only Sat. off-nadir, Land cover and selected Weather at acquisition rows; exclude the FRP forecast, pass predictions and FRP totals.

## Review blocks and deadline

1. Asset preparation and its corrections — accepted by the user.
2. Transition, character motion and complete draft with synthetic narration — one combined block; stop for external review here.
3. Apply review, replace the remaining interface placeholders with final actions, confirm the team caption and export the submission version.

Working cutoffs for 15 November 2026 (SGT): full draft with sound by 21:30; upload by 23:00; official submission deadline 23:59. If the character version is not ready by 21:30, use the agreed fallback of screen recording, voice and English subtitles. These are production targets, not scheduled uploads or automatic tasks.

## Final capture and acceptance

Follow the [recording checklist](recording-checklist.md#recording-the-video) alongside the scene-specific directions below.

Keep one viewport and data load for the MODIS→VIIRS comparison. Preserve the actual counts and snapshot timestamp together. The later context capture is a separate example; do not imply that its group generated the earlier global counters. Exclude enrichment-status rows in the final framing and retain legible NASA FIRMS attribution. Start from the saved group to reduce capture time; live values and selection counts can change.

Check the pronunciation of Lama, Alexey, MODIS, VIIRS and NASA FIRMS, as well as the requested youthful energy. Watch the transition and full edit in motion and on a phone. Technical duration checks and still frames do not establish motion or voice quality. Keep the final phrase's Next: harmonization wording; do not claim completed harmonization or forecast future fires.

Export H.264/AAC MP4 with the [actual AI disclosures](disclosures.md) in its description and metadata. Verify the exported duration is at most 30 seconds, all narration is present, and the watermark/subtitles remain visible. The user selected the shot showing Alexey; separate consent is not being requested in this workflow. Scarf-symbol ownership remains an unresolved publication item.
