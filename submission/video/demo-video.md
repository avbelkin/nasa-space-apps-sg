# Earth Fire Calendar video script with Lama

[Slides](../presentation/demo-slides.md) · [Production plan](README.md) · [Project description](../deliverables/project-description.md) · [Technical note](../deliverables/technical-note.md) · [Requirements](../docs/formal-requirements.md) · [Advice](../docs/advice.md)

Lama, a small boy alpaca, is Alexey's assistant. He starts as the real plush toy, then becomes a living animated presenter in front of a large display, like a TV weather presenter. He steps, turns toward the data, points and looks back at the viewer. This is a presentation style, not a claim that the app forecasts fires. Narration, captions and production instructions are all in English. The app imagery is real, temporary production-site captures; replace it with recordings of the required actions before the final export.

**Current scope: voice and character only.** The user also rejected the Charlie voice in the 11.5-second presenter pilot and clarified the target: an adult female performer voicing a little cartoon boy. The physical desk-to-monitor jump is still required; the preceding camera push does not satisfy it. See the [current voice and character direction](voice-direction.md). The narration and storyboard below are provisional audition/reference material and will be revised later; do not rebuild the complete film yet.

Editing target: **29 seconds, 1920×1080, 30 fps — 870 frames**. The narration, revised on 15 November for the app at `c16b7b7`, contains **48 words**, but its wording is not locked. Revise the script and timing after voice/character review while retaining a final duration of at most 30 seconds.

## Storyboard

| Time | Frames, start inclusive and end exclusive | Visuals and action | Lama's narration | Captions in addition to subtitles |
|---|---|---|---|---|
| 0–1.4 s | 0–42 | Full-width close-up of the real toy in profile beside the monitor, using the existing portrait footage cropped to 16:9. No side panels. This framing prioritizes Lama and the screen; Alexey's full face need not be visible. | — | Earth Fire Calendar; Harmonization of MODIS and VIIRS Hot Spots; Team Plush |
| 1.4–2 s | 42–60 | Hold the final frame. Push into the lower monitor over 8 frames, use 4 frames for motion blur and the cut, then reveal the interface over 6 frames. The toy leaves the frame as the view enlarges; its background is not reconstructed. | — | Earth Fire Calendar |
| 2–5.5 s | 60–165 | A large display shows the app's globe. The animated Lama stands in the left foreground, greets the viewer, blinks and takes a small step. Cream fur, copper ears and the orange/navy scarf connect him to the toy. | I’m Lama. I help Alexey. Mostly. | Earth Fire Calendar; AI-generated on the character |
| 5.5–11.5 s | 165–345 | Keep the same map view: MODIS first, then VIIRS. Let the points finish rendering after the switch. Lama turns and points toward the display, then looks back at the viewer. Enlarge the actual counter; keep his gestures clear of it. | Same planet. Same day. But MODIS and VIIRS see different hotspots. | NASA FIRMS · last 24 h; MODIS → VIIRS |
| 11.5–17 s | 345–510 | Select All sensors and enable Color fire spots by sensor. Show the prepared region and color key. Lama introduces the shared view with an open gesture, then lowers his foreleg. | Earth Fire Calendar compares their detections using NASA FIRMS data. | NASA FIRMS · last 24 h |
| 17–23 s | 510–690 | Select the prepared group. Enlarge real excerpts from the same card in sequence: Sat. off-nadir, Land cover, and populated Weather at acquisition rows. Exclude the FRP forecast, pass predictions, the Expected detection, no match flag and timeline totals. Lama indicates the panel, then pauses so the rows can be read. | We add context: viewing angle, land cover, and weather. | Estimated viewing geometry → Land cover → Weather at acquisition |
| 23–29 s | 690–870 | Return to the map. Lama turns back to the viewer and gives a small concluding nod beside the closing card. Keep the final title, link and next step visible until the end. | Our first models already learn from it. Next: one comparable fire record. | Earth Fire Calendar; First models: experimental, one day of data; Next: harmonization; avbelkin.github.io/nasa-space-apps-sg |

## Narration

```text
I’m Lama. I help Alexey. Mostly.

Same planet. Same day. But MODIS and VIIRS see different hotspots.

Earth Fire Calendar compares their detections using NASA FIRMS data.

We add context: viewing angle, land cover, and weather.

Our first models already learn from it. Next: one comparable fire record.
```

Use a childlike male cartoon voice: Lama is little, curious and clever, with lively delivery and a short comic pause before Mostly. The user selected ElevenLabs through OpenRouter. The preceding pilot used Charlie with a three-semitone pitch increase; the user rejected it as insufficiently childlike. Current auditions use Jessica, Bella and Laura with an adult-female-performing-a-little-boy direction and no local pitch change. No voice is selected yet. Will was also rejected as too adult. Aim for about 25 seconds including pauses, starting at 2 seconds. These 48 words are temporary copy; the user will revise the text later. Check Lama, Alexey, MODIS, VIIRS and NASA FIRMS before the final edit. If a take is too long, shorten pauses or rerecord it.

English subtitles repeat the narration verbatim. Split them into short meaningful phrases, at most two lines, and set their timing after receiving the audio. Retain Mostly, first models and Next in the subtitle segmentation: the first completes the joke, the second marks work that is experimental, the third identifies future work.

## Character and editing

Use the new rounded, youthful animated character derived from the real toy, with an original abstract scarf pattern. Alpacas have toes, not hooves; retain the soft two-toed feet. The pilot uses an OpenAI-generated character image and an eight-second Google Veo 3.1 Lite animation through OpenRouter. The character has actual facial, head, foreleg and stepping motion. Mouth movement is expressive but is not synchronized to individual phonemes. Do not describe the prototype as finished lip sync.

Compose him as a weather presenter in the foreground, about 700 px tall, with a large real app display behind and to his right. In the pilot the display is x=550, y=140, 1305×782; the character's visible bounds vary with his gesture. He may overlap the edge of the display but not meaningful data. Use readable enlargements of actual counters and context rows. Burn AI-generated over his lower body whenever he appears; keep it on the moving figure. Subtitles remain inside the bottom safe area, ending around y=1031. Move the source line up if a final caption needs two lines. Keep NASA FIRMS visible with the map and reserve the full non-endorsement note for the closing card.

The new opening uses 12.6–14.0 seconds of with_Lama.MOV, converted from HDR to SDR and cropped to a full-width profile close-up. It is softer than a native landscape recording but has no side areas. A fast push into the monitor connects it to the presenter stage. This is an editorial transition, not a generated physical jump. It uses neither without_Lama.MOV nor background reconstruction.

The final frame retains a short NASA FIRMS credit and the note Independent project. Not affiliated with or endorsed by NASA. Use Team Plush; registered members are Alexey Belkin and Viktoriia Naiman. Lama is a fictional presenter, and Claude / Codex are tools rather than registered members; Lama's name does not replace it.

Disclosure text for the description, AI-use field and export metadata is in [publication disclosures](disclosures.md). The English narration has been synthesized using ElevenLabs Eleven v4 through OpenRouter; disclose it in the video description and MP4 metadata. Check the scarf print after the first edit; do not claim that it contains no third-party branding before its ownership is established.

## Scope of claims

Compare real detections from the same 24-hour window. All sensors combines them for display, and the colored groups depend on screen-space proximity: they do not establish that individual fires match. Label geometry as estimated. Show weather and land cover only where values are available.

The app, at `c16b7b7`, also shows experimental estimates fitted on one day of data on a pinned single detection: notes on unmatched passes, the red **Expected detection, no match** flag with its detection score, **Predicted FRP if detected** or **GWIS-adjusted FRP if detected**, and the GWIS or CAMS context line with its detection-odds multiplier. None of them appears on screen; the detail scene pins a group, where they are not shown.

The closing line and its caption are the only mention of these models. They use the viewing angle, land cover and, for some sensor pairs, weather as inputs, which is what "learn from it" refers to. Call them first models or first baselines, experimental and fitted on one day of data. Do not say that the app predicts or forecasts fires, do not quote a score without its sample, and attribute the models to Earth Fire Calendar, never to NASA.

Harmonization is the next step. Do not depict completed calibration, a scientifically verified merging of detections into events, fire forecasting or a working seasonal calendar. Do not read exact detection counts aloud; retain the actual counters from the selected data snapshot on screen.

Asset preparation and recording steps are in the [production plan](README.md).

## Compliance handoff

Before final export, follow the [rights and capture release gate](disclosures.md#rights-release-gate). The live basemap now uses EOX 2016 (CC BY 4.0); old EOX 2025 recordings must be replaced, not relabelled. Include the EOX source / licence near its use and in the description. Keep written adult consent privately even for team members. The final MP4, not this storyboard, must be checked for duration, watermark coverage, English speech/subtitles, metadata and public access.
