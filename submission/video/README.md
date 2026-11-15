# Production plan for the Lama video

[Script](demo-video.md) · [Voice and character](voice-direction.md) · [Disclosures](disclosures.md) · [Official requirements](../docs/formal-requirements.md)

The user authorized full assembly with the updated **47-word** script and selected **Flicker - Cheerful Fairy & Sparkly Sweetness**. The first full 29-second assembly is in `lama/prepared/assembly-v1/lama-assembly.mp4`. The user accepted its voice and requested two visual corrections: the recorded interface must fill the frame, and Lama must move between relevant details without a repeating wave. That first assembly remains a superseded review artifact, not the final film.

## Current edit

- 1920×1080, 30 fps, 29 seconds (870 frames), English narration and subtitles.
- The photographic plush jumps first. The animated character appears only inside the physical monitor after entry; a camera push alone is insufficient.
- The five voice files total 23.36 seconds. Their starts are 2.3, 6.3, 12, 17 and 22.5 seconds. No pitch or tempo shift; normalize the final mix's loudness.
- Alexey's real recordings are in the Git-ignored `screens/` directory. Use these in place of old screenshots, including the new recording with expanded Weather at acquisition.
- The interface fills the frame. Use readable enlargements of actual data where needed, and keep Lama clear of the highlighted information. Remove the framed presenter-stage layout.
- Replace the repeated wave with restrained head turns, brief gestures and movement toward the relevant detail. A new bounded motion take is being evaluated; generated anatomy must be inspected before use.
- Preserve Team Plush, the exact challenge name in the opening, NASA FIRMS attribution, the final future-harmonization caption and NASA non-endorsement note.

## Assets and reproduction

Media, captures, API manifests and local review pages remain ignored. Tracked scripts contain no keys. Use installed FFmpeg, Chrome and Node; no packages need installation. `render-assembly.mjs` reproduces the first assembly and optional source replacements, but its framed staging is superseded by the user's review. `render-draft.mjs`, `render-presenter-pilot.mjs` and the older voice/jump renderers preserve historical variants.

`synthesize.py` defaults to the ID in `voice-selection.json`. It uses the existing research gateway's credentials, HTTP client, budget reservations and ledger. `animate-character.py` submits one bounded motion job and then collects the original saved job ID on subsequent calls. Run Python adapters with the main research checkout's managed interpreter and `--gateway-root`. The existing $0.30 run and shared provider daily caps remain enforced.

The five completed Flicker takes and one Scribe verification are saved in `lama/prepared/assembly-v1/`, together with exact input text, word timings and measured billing. The six-call cost is $0.030547555555555297 through OpenRouter; this excludes earlier image and motion experiments. Codex subscription usage is not exposed. Do not equate API dollars with a subscription allowance percentage.

## Review checkpoints

1. Voice and updated narration: user accepted the assembled Flicker voice.
2. Full-frame recordings and revised presenter behavior: current review block. Show an intermediate result before further polishing.
3. Final duration, audio/caption coverage, readability, disclosures, source continuity and export check.

Commit and push verified milestones through the isolated feature worktree into main. Keep the actual script, metadata and living production documents consistent. Frozen documents under `submission/docs/` are reference material; do not rewrite them.

## Export checks

Inspect actual frames for plush-before-cartoon order, anatomy, unobstructed data, watermark placement and safe caption margins. Decode the entire MP4, verify 870 frames and a duration no greater than 30 seconds, and reconcile every new API job and its cost before claiming completion. Stills, transcripts and ffprobe do not establish acting quality or continuous-motion quality; the user's playback review remains the creative checkpoint. No music is planned.
