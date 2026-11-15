# Production plan for the Lama video

[Script and narration](demo-video.md) · [AI disclosures](disclosures.md) · [Requirements](../docs/formal-requirements.md) · [Advice](../docs/advice.md)

The full film targets **29 seconds, 1920×1080, 30 fps — 870 frames**. The current block covers **voice and character only**, including the missing physical jump; the narration will be revised later. See the [voice and character direction](voice-direction.md). The preceding 11.5-second pilot remains a visual reference, but its Charlie voice was rejected. The first full draft was rejected for its adult voice, photo-based character and portrait opening with wide blurred side areas. It is retained as a superseded version, not an approved direction. Media and local review pages stay in the Git-ignored `lama/` folder.

## Current production decisions

| Element | Decision |
|---|---|
| Opening | 1.4-second full-width close-up of the real toy in profile; no side panels |
| Transition | New rough jump test: controlled flight into the monitor and landing; generated empty background, visible watermark. Transformation/body performance still need review; final timing deferred |
| Title | Earth Fire Calendar and Harmonization of MODIS and VIIRS Hot Spots; add the exact team name to the final edit when supplied |
| Narration | Temporary audition copy; wording and scene timing will be revised later, within the final 30-second limit |
| Voice | Adult female performer voicing a little, smart, lively boy; ElevenLabs Eleven v4 through OpenRouter. Jessica/Bella/Laura auditions with no local pitch shift; selection pending |
| Character | Living animated interpretation of the toy: cream fur, copper ears, expressive face, orange/navy/ivory scarf, soft two-toed feet |
| Performance | Weather-presenter staging: greet, step, turn to the display, point, look back at the viewer, nod |
| Composition | Large presenter in the left foreground; real app display behind and to his right; protect the important data from his gestures |
| Motion source | OpenAI image generation, then Google Veo 3.1 Lite through OpenRouter; generated green background removed locally |
| Watermark | AI-generated visibly overlaps the lower body and follows the movement |
| Captions | English, inside safe margins; large real counter crops; NASA FIRMS attribution with the map |
| Closing | Project title, next step, URL, NASA FIRMS credit and non-endorsement statement; still required for the full edit |

Weather-presenter styling does not imply fire forecasting. The narration still describes comparison and future harmonization. The generated motion has expressive mouth movement, not exact lip sync. The generated source introduced an unwanted display at its far right; the composition crops it out and uses only real app imagery.

## Tools and reproduction

Use installed FFmpeg, Chrome and Node; no packages need installation. `chrome.mjs` renders layouts, `render-presenter-pilot.mjs` assembles the current pilot, and `render-draft.mjs` preserves the superseded full draft. The pilot renderer makes no API calls:

```sh
node submission/video/render-presenter-pilot.mjs /absolute/path/to/submission/video/lama/prepared
```

The renderer needs the collected motion, full-width intro and two completed Charlie speech files in `presenter-v2/`. `synthesize.py` supports explicit `--voice` and `--delivery`. `animate-character.py` submits one bounded motion job and, on subsequent calls, collects the original saved job ID without resubmitting. Run both with the existing research gateway's managed Python interpreter and `--gateway-root`; credentials, redaction, persistent budget reservations and the spending ledger come from that gateway. The $0.30 run cap and shared provider daily cap remain enforced. No keys or private gateway paths belong in tracked files.

API references: [OpenRouter speech](https://openrouter.ai/blog/announcements/elevenlabs-on-openrouter/) and [video generation](https://openrouter.ai/docs/guides/overview/multimodal/video-generation). Public-library voice ID DusUNVZxLmrLjz9sJF1w and the legacy Jeremy name were both rejected with HTTP 400; those attempts produced no audio and their reservations were settled. Charlie succeeded. The local manifests preserve every attempt and generation ID.

## Local review files

Current entry point: `lama/prepared/voice-v3/review.html`, with three female-performed boy voice auditions and the separate silent `jump-v1/jump-pilot.mp4`. No voice is selected. `voice-v3/REVIEW.md`, `review-edits.json` and `accounting.json` record the edits, limitations and every paid job. Reproduce the local artifacts with `prepare-voice-auditions.mjs` and `render-jump-pilot.mjs`, passing the absolute prepared directory. Neither renderer calls an API.

The following files describe the preceding visual pilot; its Charlie voice was rejected:

Under `lama/prepared/presenter-v2/`:

- `review.html` and `REVIEW.md`: current pilot player, voice comparison and scope;
- `pilot.mp4`: 11.5-second concept pilot, not the final submission;
- `render-report.json`: measured export parameters and source-motion timing;
- `lama-character-green.png`, `lama-motion-green.mp4`, `motion-job.json`: generated reference and collected animation;
- `voice-charlie/`, `young-voice-1.wav`, `young-voice-2.wav`: original and processed voice;
- `transcript.json`: transcription check, which does not establish perceived age or acting quality;
- `intro-full-bleed.mp4`: 42-frame cropped SDR opening.

The old `draft/lama-draft.mp4`, `review.html`, `intro-centered.mp4` and `lama-presenter.png` remain historical material. Do not treat them as the latest creative direction.

Temporary UI captures remain under `prepared/ui/`. MODIS and VIIRS screenshots share one earlier snapshot. The populated context rows are a separate, later capture of a group near −14.906°, 126.865° with 123 detections. `05-context.json` records that example. These are screen-proximity groups, not confirmed matched fires. Show only Sat. off-nadir, Land cover and selected Weather at acquisition rows; exclude FRP forecast, pass predictions, the **Expected detection, no match** flag and totals.

## Review blocks and deadline

1. Asset preparation and its corrections — accepted.
2. First full draft — technically reviewed, then rejected by the user on creative grounds.
3. New weather-presenter concept — short visual pilot retained; Charlie voice rejected.
4. Female-performed little-boy voice auditions and an actual desk-to-screen jump — current review block.
5. After that review, revise the narration with the user, then complete the film and final UI captures.

Commit and push each verified block from its feature worktree into main. Do not accumulate the entire film before sharing the changes. Media remains local and ignored.

Working targets for 15 November 2026 (SGT): full draft with sound by 21:30; upload by 23:00; deadline 23:59. These are production targets, not scheduled actions. The previously suggested screen-recording fallback would omit the user's requested animated host; discuss that tradeoff if it becomes necessary rather than silently substituting it.

## Final capture and acceptance

Follow the [recording checklist](recording-checklist.md). Keep one viewport and feed snapshot for MODIS→VIIRS, preserve actual counts and timestamps, exclude enrichment statuses, and retain readable NASA FIRMS attribution. Start the context scene from the saved selection; current values may differ.

Listen to the voice and check Lama, Alexey, MODIS, VIIRS and NASA FIRMS. Watch continuous playback and on a phone. Stills, transcripts and ffprobe do not establish acting, lip sync or transition quality. Keep Next in the last phrase and show harmonization as future work.

Export H.264/AAC with the [actual disclosures](disclosures.md) in its description and metadata. Check duration ≤30 seconds, narration completeness, watermark placement and caption margins. The user selected footage with Alexey, a team member; separate consent is not requested in this workflow. The new character's scarf is abstract; the physical toy's original scarf symbols still need review before publication. The exact team name remains pending.
