# Recording and acceptance checklist

[Script](demo-video.md) · [Production plan](README.md) · [Disclosures](disclosures.md)

## Current supplied recordings

Alexey supplied six recordings and one screenshot under the Git-ignored `screens/` directory. The full-frame revision uses four recordings:

| Recording, 15 November SGT | Use |
|---|---|
| 21.23.52 | Globe and zoom toward the map |
| 21.26.02 | Color fire spots by sensor; same-view MODIS/VIIRS counters, 8,724 and 56,434 |
| 22.28.52 (plus screenshot 22.28.33) | CAMS context adjustment, 1.28× study baseline detection odds for NOAA-20 |
| 21.52.05 | Single detection near 46.574°, −80.792°; viewing geometry, Bare areas land cover, expanded populated weather |

The 21.32.29 and 21.33.57 recordings are retained as alternatives. Files are approximately 1506–1510 by 926–932 pixels at 60 fps, without sound. The export fits the whole recorded frame to 1920×1080 at 30 fps without cutting its edges. Source recording times and exact trims remain in `assembly-v4/timeline.json`.

## Story coverage

| Time | Coverage |
|---|---|
| 0–2.3 s | Real plush, photographic jump, transformation only inside the monitor; title, challenge and Team Plush |
| 2.3–6.3 s | Lama's introduction over the globe |
| 6.3–12 s | Different detections from the two instruments; actual counters from one recording |
| 12–17 s | Shared sensor-colored view and NASA FIRMS |
| 17–22.5 s | Estimated viewing geometry, land cover and weather from one recorded selection |
| 22.5–26 s | Actual cross-satellite context correction, labelled experimental |
| 26–29 s | First harmonization step, project URL and team; presentation-PDF styling with the real presentation globe behind the text |

The supplied comparison uses All sensors with sensor coloring, not a recorded MODIS-only → VIIRS-only switch. The narration does not claim a fixed ratio or exact counts. Preserve actual data and source context; do not manufacture an unavailable action.

## Checks for this export

- [x] Updated 47-word English narration synthesized with selected Flicker; the user accepted the assembled voice.
- [x] Five voice files decode; Scribe coverage checked and independently accepted inside Codex.
- [x] User approved the full-frame map and weather layout stills.
- [x] The full-frame review decodes completely: H.264/AAC, 1920×1080, 30 fps, 870 frames, 29 seconds.
- [x] Enlarged right-panel excerpts preserve real values and cover enrichment statuses, missing-pass warnings, experimental model text and timeline totals.
- [x] NASA FIRMS attribution, English subtitles and visible AI labels are included.
- [ ] First-second keyboard foley and globe-background closing checked in the new assembly-v4 export.
- [x] Independent frame-based acceptance of the final motion and composed artifact; exact hash, coverage and limitations are recorded in [REVIEW.md](REVIEW.md) and local `assembly-v4/ACCEPTANCE.md`.
- [ ] User playback review of the revised motion, scene changes and jump continuity.
- [ ] Phone playback and the eventual public link, when supplied.

Satellite tracks and the satellite HUD remain in Alexey's chosen map recordings. They are background observation context, not a fire forecast. No model forecast or warning appears in the observation excerpts; the new ending deliberately shows the actual CAMS adjustment with its experimental attribution. The presenter has no exact phoneme lip sync. The original live/composite jump cut remains visible. The older monitor imagery and original scarf print remain recorded publication review items in [disclosures](disclosures.md); a successful export is not a claim that those items are cleared.
