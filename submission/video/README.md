# Production plan for the Lama video

[Script and narration](demo-video.md) · [AI disclosures](disclosures.md) · [Requirements](../docs/formal-requirements.md) · [Advice](../docs/advice.md)

The video targets 29 seconds, 1920×1080 and 30 fps. Source material has been received; the presenter image, a short opening and four temporary production-site captures are prepared. The English voice, transition and full edit have not yet been produced. Media and review materials remain local in the Git-ignored submission/video/lama directory.

## Decisions following review

| Element | Decision |
|---|---|
| Opening | 1.4 seconds of live footage followed by a 0.6-second transition; the complete video remains 29 seconds |
| Narration | Retain the agreed 46-word text; speech begins after the transition at 2 seconds |
| Transition into the monitor | Hold the final frame → push in over 8 frames → motion blur and cut over 4 frames → reveal the interface over 6 frames; the toy leaves the frame |
| Background | No reconstruction; without_Lama.MOV is not needed for the selected transition |
| Portrait footage | The user selected the version showing Alexey: 608×1080 centered over an enlarged, blurred copy |
| Character | Keep the existing AI-generated image based on the photograph; do not mirror it or change the fur-edge halo now |
| Lama's position | Separate strip on the right, x≈1640, y=700, height 340 px; looking toward the globe |
| Label | AI-edited image remains visible beside the character from 2 seconds until the end |
| Interface | Production-site screenshots are replaceable placeholders. Record the required actions closer to the final feature set |

The opening is included in the new total timing, not prepended to the previous 29-second script. Earth Fire Calendar appears over the live footage. Do not add the extra narration Meet Earth Fire Calendar.

## Local assets

The following files are in submission/video/lama/prepared:

- lama-presenter.png — 1086×1448 RGBA, regenerated from IMG_1081 rather than an exact photographic cutout;
- intro-candidate.mp4 — the original portrait excerpt from 8.2–9.6 seconds of with_Lama.MOV; 1.4 seconds, SDR, muted;
- intro-centered.mp4 — landscape version with the portrait frame centered over a blurred background;
- intro-no-face.mp4 — fallback cropped to 1080×608 at x=0, y=780 and enlarged to 1920×1080; detail is softer and the lower part of the toy is cropped;
- ui/01-modis.png, ui/02-viirs.png, ui/03-all-sensors.png, ui/04-map.png — temporary captures of the real application; adjacent JSON files retain the URL, capture time and page text;
- review.html and REVIEW.md — the current external-review package.

The scarf covers more of the toy's body in the live footage than in the presenter image. Change the pose at the transition into the monitor. In the first edit, check that viewers immediately connect the toy seen from behind with the presenter.

## Tools and next stage

Preparation used the installed FFmpeg, sips and Chrome. The image was created with ChatGPT's built-in image editor. Animation will use a separate Remotion project in submission/video/remotion; narration will use ElevenLabs Multilingual v2 or a human recording. Voice generation has not run.

Remotion is not installed yet. Before installing locally through npm, identify the exact packages, destination and removal command, and obtain approval as required by this machine's rules. Do not add video dependencies to ui.

Work in blocks, stopping for review after each:

1. Asset-review corrections: script, composition, labeling, opening variants and publication disclosures.
2. After feedback on this block: the short transition into the monitor and Lama's entrance.
3. After transition review: a complete 29-second draft with the replaceable interface background.
4. After draft review: final interface actions, voice, subtitles and export.

## Final interface recording

Record the actual page at 1920×1080 or higher. Keep one viewport and one data load for MODIS and VIIRS. Exclude enrichment-status rows from the final composition; NASA FIRMS and the compared counters must remain readable.

Before recording, find a group containing both sensors with populated geometry, land cover and weather. The 17–23-second scene needs actual Sat. off-nadir, Land cover and Weather at acquisition rows for the same group. The four temporary screenshots do not replace this scene. Check recording conditions and claim boundaries against the [recording advice](recording-checklist.md#recording-the-video).

## Voice, captions and export

Record the voice from the [script](demo-video.md), then align pauses and English subtitles with the actual audio. Do not lengthen the text. The first edit has no music; a short transition sound can be synthesized locally.

At 1920×1080, place the 1600×900 interface at x=16, y=24; Lama on the right starting at y=700; AI-edited image below him; and subtitles at the lower left. Scaling must not obscure the MODIS/VIIRS tiles, sources or required values. Enlarge excerpts for the detail scene.

Export MP4 with H.264, 30 fps and AAC audio. Include [AI disclosures](disclosures.md) in the description and metadata; mention synthesized speech only if it was actually used. Verify with ffprobe: about 29 seconds and no more than 30, required tags retained, and no truncated audio. Watch the entire video in motion and on a phone.

The user selected the shot showing Alexey; separate consent is not being requested in the current workflow. Scarf-symbol ownership still needs checking after the first edit. Completed documents and mockups do not mean the final video is ready.
