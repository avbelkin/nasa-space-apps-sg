# Earth Fire Calendar video script with Lama

[Slides](demo-slides.md) · [Production plan](../video/README.md) · [Project description](project-description.md) · [Technical note](technical-note.md) · [Requirements](formal-requirements.md) · [Advice](advice.md)

Lama, a plush alpaca, is Alexey's assistant. The opening uses 1.4 seconds of live footage followed by a 0.6-second transition into the monitor. Lama then appears beside the interface and begins narrating. Narration, captions and production instructions are all in English. The working edit uses temporary production-site captures; replace them with recordings of the required actions before the final export.

Editing target: **29 seconds, 1920×1080, 30 fps — 870 frames**. The narration contains **46 words**. Speech timing is provisional: adjust the edit and pauses to the recorded audio while retaining the total duration.

## Storyboard

| Time | Frames, start inclusive and end exclusive | Visuals and action | Lama's narration | Captions in addition to subtitles |
|---|---|---|---|---|
| 0–1.4 s | 0–42 | Live footage: Alexey at the computer, the toy in front of the monitor. Fit the portrait clip to the frame height, centered over an enlarged, blurred copy. The user selected the version showing Alexey, a team member. | — | Earth Fire Calendar |
| 1.4–2 s | 42–60 | Hold the final frame. Push into the lower monitor over 8 frames, use 4 frames for motion blur and the cut, then reveal the interface over 6 frames. The toy leaves the frame as the view enlarges; its background is not reconstructed. | — | Earth Fire Calendar |
| 2–5.5 s | 60–165 | The interface fills most of the frame. Lama immediately appears at the lower right, bounces gently, then tilts on Mostly. The fur and scarf connect the presenter to the physical toy. | I’m Lama. I help Alexey. Mostly. | Earth Fire Calendar; AI-edited image |
| 5.5–11.5 s | 165–345 | Keep the same map view: MODIS first, then VIIRS. Let the points finish rendering after the switch. Lama leans toward the map; briefly highlight the switch and the corresponding counter. | Same planet. Same day. But MODIS and VIIRS see different hotspots. | NASA FIRMS · last 24 h; MODIS → VIIRS |
| 11.5–17 s | 345–510 | Select All sensors and enable Color fire spots by sensor. Show the prepared region and color key. Lama moves in short hops within his own strip, then stops. | Earth Fire Calendar compares their detections using NASA FIRMS data. | NASA FIRMS · last 24 h |
| 17–23 s | 510–690 | Select the prepared group. Enlarge real excerpts from the same card in sequence: Sat. off-nadir, Land cover, and populated Weather at acquisition rows. Lama stays still while highlights direct attention. | We add context: viewing angle, land cover, and weather. | Estimated viewing geometry → Land cover → Weather at acquisition |
| 23–29 s | 690–870 | Return to the map. Lama looks toward the viewer and nods slightly. Keep the final title, link and next step visible until the end. | Next, we’ll use this evidence to make their records comparable. | Earth Fire Calendar; Next: harmonization; avbelkin.github.io/nasa-space-apps-sg |

## Narration

```text
I’m Lama. I help Alexey. Mostly.

Same planet. Same day. But MODIS and VIIRS see different hotspots.

Earth Fire Calendar compares their detections using NASA FIRMS data.

We add context: viewing angle, land cover, and weather.

Next, we’ll use this evidence to make their records comparable.
```

Use a warm, curious, conversational voice, with a short comic pause before Mostly. Aim for about 25 seconds including pauses, starting at the 2-second mark. Keep the agreed 46-word text: do not add Meet Earth Fire Calendar over the opening. Check the pronunciation of Lama, Alexey, MODIS, VIIRS and NASA FIRMS before the final edit. If a take is too long, shorten pauses or rerecord the phrase.

English subtitles repeat the narration verbatim. Split them into short meaningful phrases, at most two lines, and set their timing after receiving the audio. Retain Mostly and Next in the subtitle segmentation: the first completes the joke; the second identifies future work.

## Character and editing

Use the prepared AI-generated version of Lama with transparency. It was regenerated from a photograph: the pose, eye, ear color and scarf pattern differ slightly from the original. Its recognizability is accepted for the first edit; do not mirror or regenerate it. Separate paw and mouth movements are not planned.

Within the 1920×1080 frame, fit the interface into a 1600×900 area starting at x=16, y=24. Reserve the right strip for Lama: x≈1640, top y=700, height 340 px (up to 380 px if the bottom spacing is revised). He looks left toward the globe; the counters and NASA FIRMS heading remain visible. Keep AI-edited image visible below the character from his first appearance at 2 seconds. Subtitles occupy a separate area at the lower left. Lama stays still while the viewer reads tables.

Build the opening from intro-candidate.mp4 using the selected 608×1080 centered version over a blurred copy. The version cropped to exclude the face remains a technical fallback and is not part of the current edit. The chosen transition uses neither without_Lama.MOV nor background reconstruction.

The final frame retains a short NASA FIRMS credit and the note Independent project. Not affiliated with or endorsed by NASA. Add the team name once its exact spelling is supplied; Lama's name does not replace it.

Disclosure text for the description, AI-use field and export metadata is in [publication disclosures](../video/disclosures.md). Disclose synthesized narration after it has actually been generated. Check the scarf print after the first edit; do not claim that it contains no third-party branding before its ownership is established.

## Scope of claims

Compare real detections from the same 24-hour window. All sensors combines them for display, and the colored groups depend on screen-space proximity: they do not establish that individual fires match. Label geometry as estimated. Show weather and land cover only where values are available.

Harmonization is the next step. Do not depict completed calibration, a scientifically verified merging of detections into events, fire forecasting or a working seasonal calendar. Do not read exact detection counts aloud; retain the actual counters from the selected data snapshot on screen.

Asset preparation and recording steps are in the [production plan](../video/README.md).
