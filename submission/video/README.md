# Production plan for the Lama video

[Script](demo-video.md) · [Voice and character](voice-direction.md) · [Disclosures](disclosures.md) · [Official requirements](../docs/formal-requirements.md)

The user authorized full assembly with the updated **47-word** script and selected **Flicker - Cheerful Fairy & Sparkly Sweetness**. The current full-frame 29-second review is in `lama/prepared/assembly-v4/lama-fullscreen.mp4`; its player is `assembly-v4/review.html`. The first full assembly remains in `assembly-v1/lama-assembly.mp4`. The user accepted its voice and requested two visual corrections: the recorded interface must fill the frame, and Lama must move between relevant details without a repeating wave. That first assembly remains a superseded review artifact, not the final film.

## Current edit

- 1920×1080, 30 fps, 29 seconds (870 frames), English narration and subtitles.
- Original locally synthesized keyboard foley plays during 0–1 s only. The closing card retains the PDF styling and adds the real presentation globe capture with a dark gradient behind the text. This revision makes no new API calls.
- The photographic plush jumps first. The animated character appears only inside the physical monitor after entry; a camera push alone is insufficient.
- The original five voice files totaled 23.36 seconds. The user then replaced the closing line to describe implemented cross-satellite corrections; the 4.8-second replacement brings the selected raw speech total to 22.64 seconds. Their starts are 2.3, 6.3, 12, 17 and 22.5 seconds. No pitch or tempo shift; normalize the final mix's loudness.
- Alexey's real recordings are in the Git-ignored `screens/` directory. Use these in place of old screenshots, including the recordings with expanded Weather at acquisition and the 22.28.52 cross-satellite correction.
- The interface fills the frame. Its original aspect is fitted to 16:9 without cutting edges. Actual right-panel excerpts are enlarged, covering enrichment statuses and experimental model rows; values are not changed. Lama moves between positions and stays clear of those details. The user approved the layout stills.
- Replace the repeated wave with restrained head turns, brief gestures and movement toward the relevant detail. The new six-second presenter-v6 take supplies short steps and head turns, with non-looping excerpts and endpoint holds. The preceding v5 take was rejected for an extra appendage.
- Preserve Team Plush, the exact challenge name in the opening, NASA FIRMS attribution, the final First harmonization step caption and NASA non-endorsement note.

## Assets and reproduction

Media, captures, API manifests and local review pages remain ignored. Tracked scripts contain no keys. Use installed FFmpeg, Chrome and Node; no packages need installation. `render-fullscreen.mjs` reproduces the current revision from the absolute prepared-media directory. `render-assembly.mjs` reproduces the first assembly and optional source replacements, but its framed staging is superseded by the user's review. `render-draft.mjs`, `render-presenter-pilot.mjs` and the older voice/jump renderers preserve historical variants.

`synthesize.py` defaults to the ID in `voice-selection.json`. It uses the existing research gateway's credentials, HTTP client, budget reservations and ledger. `animate-character.py` submits one bounded motion job and then collects the original saved job ID on subsequent calls. Run Python adapters with the main research checkout's managed interpreter and `--gateway-root`. The existing $0.30 run and shared provider daily caps remain enforced.

The five completed Flicker takes and one Scribe verification are saved in `lama/prepared/assembly-v1/`, together with exact input text, word timings and measured billing. The accepted six-call voice cost is $0.030547555555555297 through OpenRouter. Two new six-second Veo takes add $0.36, including the rejected v5 take: the original assembly block totaled $0.39054755555555526. The revised closing voice and its transcription add $0.00757333333333328, bringing this ten-call block to $0.3981208888888886 in measured API charges. One image-tool edit has undisclosed cost. Earlier experiments are excluded. Codex subscription usage is not exposed. Do not equate API dollars with a subscription allowance percentage.

## Review checkpoints

1. Voice and updated narration: user accepted the assembled Flicker voice.
2. Full-frame recordings and revised presenter behavior: current review block. Show an intermediate result before further polishing.
3. Revised ending: show the recorded CAMS adjustment, use the new Flicker line, and style the closing card after the final presentation PDF (deep blue, Overpass, yellow accent).
4. Final duration, audio/caption coverage, readability, disclosures, source continuity and export check.

Commit and push verified milestones through the isolated feature worktree into main. Keep the actual script, metadata and living production documents consistent. Frozen documents under `submission/docs/` are reference material; do not rewrite them.

## Export checks

Inspect actual frames for plush-before-cartoon order, anatomy, unobstructed data, watermark placement and safe caption margins. Decode the entire MP4, verify 870 frames and a duration no greater than 30 seconds, and reconcile every new API job and its cost before claiming completion. Stills, transcripts and ffprobe do not establish acting quality or continuous-motion quality; the user's playback review remains the creative checkpoint. No music is planned.
