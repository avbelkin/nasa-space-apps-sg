# Earth Fire Calendar video script with Lama

[Slides](../presentation/demo-slides.md) · [Production plan](README.md) · [Project description](../deliverables/project-description.md) · [Technical note](../deliverables/technical-note.md) · [Requirements](../docs/formal-requirements.md) · [Advice](../docs/advice.md)

Lama, a small boy alpaca, is Alexey's assistant. He starts as the real plush toy, then becomes a living animated presenter in front of a large display, like a TV weather presenter. He steps, turns toward the data, points and looks back at the viewer. This is a presentation style, not a claim that the app forecasts fires. Narration, captions and production instructions are all in English. The app imagery uses Alexey's real production-site recordings, including the expanded observation context and cross-satellite correction.

**Current scope: full assembly.** The user selected Flicker and authorized the updated narration on 15 November. Preserve the exact narration below. Alexey is supplying the final screen recordings under `screens/`; see the [current voice and character direction](voice-direction.md).

Editing target: **29 seconds, 1920×1080, 30 fps — 870 frames**. The narration, revised on 15 November with the supplied correction recording, contains **47 words**, and is authorized for this assembly. The selected speech lasts 22.64 seconds; place its five lines at 2.3, 6.3, 12, 17 and 22.5 seconds within the 29-second film.

## Storyboard

| Time | Frames, start inclusive and end exclusive | Visuals and action | Lama's narration | Captions in addition to subtitles |
|---|---|---|---|---|
| 0–0.7 s | 0–21 | Full-width close-up from the real portrait recording, cropped to 16:9 without side panels. Keyboard typing begins here and ends at 1 s. | — | Earth Fire Calendar; Harmonization of MODIS and VIIRS Hot Spots; Team Plush |
| 0.7–2.3 s | 21–69 | Photographic plush Lama squashes, jumps and shrinks into the physical monitor. The animated character first appears inside it at 1.8 s, after the plush has disappeared. End with a short push into the screen. | — | Title; visible AI transition disclosure |
| 2.3–6.3 s | 69–189 | Animated full-body Lama over the app's recorded globe, blinking and turning toward the viewer. | I’m Lama. I help protect nature. Mostly. | AI-generated on the character |
| 6.3–12 s | 189–360 | Real recorded view with sensor coloring and the actual MODIS/VIIRS counters from that recording. The supplied captures show All sensors, so do not label them as individual filter switches. | Same planet. Same day. But MODIS and VIIRS see different hotspots. | NASA FIRMS · last 24 h |
| 12–17 s | 360–510 | The real Color fire spots by sensor action and its color key. Lama gestures toward the display. Exclude status rows and popup timeline totals by framing. | Earth Fire Calendar compares their detections using NASA FIRMS data. | NASA FIRMS · last 24 h |
| 17–22.5 s | 510–675 | Enlarge real Sat. off-nadir, Land cover and populated Weather at acquisition excerpts from the same single detection in the new 21.52.05 recording. Exclude forecast, missing-pass warnings and timeline totals. | We add context: viewing angle, land cover, and weather. | Estimated viewing geometry → Land cover → Weather at acquisition |
| 22.5–29 s | 675–870 | 22.5–26 s: show the new recorded cross-satellite context correction. 26–29 s: closing card styled after the presentation PDF, with the real presentation globe behind a dark gradient, the link and team. | We apply cross-satellite corrections — a first step toward comparable records. | Experimental cross-satellite correction; First harmonization step; avbelkin.github.io/nasa-space-apps-sg; NASA non-endorsement note |

## Narration

```text
I’m Lama. I help protect nature. Mostly.

Same planet. Same day. But MODIS and VIIRS see different hotspots.

Earth Fire Calendar compares their detections using NASA FIRMS data.

We add context: viewing angle, land cover, and weather.

We apply cross-satellite corrections — a first step toward comparable records.
```

The selected voice is **Flicker - Cheerful Fairy & Sparkly Sweetness**, ElevenLabs Eleven v4 through OpenRouter, ID `piI8Kku0DcvcL6TTSeQt`. The first four accepted takes and one revised closing take preserve the 47 words above. The closing take lasts 4.8 seconds and starts at 22.5 seconds. Use the short comic pause before Mostly. No local pitch or tempo change is applied. Scribe v2 verified narration coverage; check pronunciation and acting by listening. English caption timings follow the collected word timestamps.

English subtitles repeat the narration verbatim. Split them into short meaningful phrases, at most two lines, and set their timing after receiving the audio. Retain Mostly and the full closing qualification a first step toward comparable records. The former completes the joke; the latter identifies partial harmonization rather than a validated finished record.

## Character and editing

Use the corrected character derived from the actual toy: long cream muzzle and neck, copper ears, black eyes with gold rims, and the orange/navy/ivory scarf. Alpacas have toes, not hooves. The current full-frame revision uses the corrected neutral presenter-v6 reference and six-second Google Veo 3.1 Lite take through OpenRouter. Earlier full-body takes with extra limbs remain rejected. Brief steps and head turns replace the repeated wave; excerpts play once and then hold their final frame. No exact lip sync is claimed.

The real UI recording fills the frame. Its aspect is fitted to 16:9 without trimming the edges. Enlarge actual right-panel crops while preserving their values; cover enrichment statuses, experimental forecasts and missing-pass warnings. The user approved this layout. Lama changes position across scenes and looks toward the data. Keep `AI-generated` on his lower body, and keep counters, selected context rows, NASA FIRMS and subtitles unobstructed.

The 0.7-second real opening is full-width, without blurred side areas. The flight uses an AI-edited photographic cutout of the plush over a generated empty desk background. The cartoon is first revealed inside the physical monitor, after the photographic flight ends. The live/composite pose cut remains visible in this draft. The local render script and provenance record distinguish this montage from entirely real footage.

The final frame retains a short NASA FIRMS credit and the note Independent project. Not affiliated with or endorsed by NASA. Name Team Plush — Alexey Belkin and Viktoriia Naiman; Lama's name does not replace it.

Disclosure text for the description, AI-use field and export metadata is in [publication disclosures](disclosures.md). The English narration has been synthesized using ElevenLabs Eleven v4 through OpenRouter; disclose it in the video description and MP4 metadata. Check the scarf print after the first edit; do not claim that it contains no third-party branding before its ownership is established.

## Scope of claims

Compare real detections from the same 24-hour window. All sensors combines them for display, and the colored groups depend on screen-space proximity: they do not establish that individual fires match. Label geometry as estimated. Show weather and land cover only where values are available.

The app, at `09b25a0`, also shows experimental estimates fitted on one day of data on a pinned single detection: notes on unmatched passes, the red **Expected detection, no match** flag with its detection score, **Predicted FRP if detected** or **GWIS-adjusted FRP if detected**, and the GWIS or CAMS context line with its detection-odds multiplier. They remain excluded from the 17–22.5-second observation excerpts. The new 22.5–26-second scene deliberately shows the recorded CAMS-assisted cross-satellite detection-odds adjustment with its experimental attribution, at the user’s request.

The user clarified that partial harmonization is implemented through cross-satellite corrections. The new recording at 22.28.52 and screenshot at 22.28.33 show a **CAMS context** adjustment of **1.28× study baseline detection odds** for NOAA-20, with the experimental Earth Fire Calendar attribution. Show that exact real excerpt, not a fabricated corrected count. The closing narration calls this a first step toward comparable records. The local UI evidence is a context-adjusted model estimate; the raw All sensors counts and raw CSV export are not claimed to be calibrated or deduplicated.

The models were fitted once on one day of data; do not claim continuing learning or independent scientific validation. Do not depict completed calibration of a unified event record, fire forecasting or a working seasonal calendar. Retain the actual source values on screen.

Asset preparation and recording steps are in the [production plan](README.md).

## Before export

Record map scenes from the live app: it now uses the EOX 2016 basemap (CC BY 4.0); older recordings show the 2025 layer (CC BY-NC-SA 4.0). Check the final MP4 for duration, the `AI-generated` label, English speech and subtitles, and metadata. See [disclosures](disclosures.md#publication-checks-still-requiring-the-final-artifact).
