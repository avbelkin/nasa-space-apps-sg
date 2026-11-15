# Captions and AI disclosures for the Lama video

[Script](../docs/demo-video.md) · [Production plan](README.md)

## Persistent on-screen label

```text
AI-edited image
```

Show this beside Lama whenever the generated character is visible, from the 2-second mark until the end. The opening live footage is not a generated image. The label is included within the 29-second video; it is not replaced by an additional end card.

## Video description

Ready-to-use disclosure for AI already used:

```text
The Lama presenter image was generated with OpenAI ChatGPT from an original photograph of our plush alpaca. Live-action footage and application captures are real recordings. OpenAI Codex assisted with the script and production preparation. Independent project; not affiliated with or endorsed by NASA. Fire-detection data: NASA FIRMS.
```

If the final voice is actually generated with ElevenLabs, add:

```text
The English narration was synthesized using ElevenLabs.
```

Name the actual provider if another service is used. Omit the synthetic-voice sentence for a human recording.

## Submission AI-use field

The [project description](../docs/project-description.md#6-use-of-super-intelligence-si) records the use of image generation for Lama. Complete the voice details after producing the audio. Do not name a specific image-generation model: the built-in tool did not disclose it.

## MP4 metadata

Write the following to the `comment` field on export:

```text
AI-edited character image: OpenAI ChatGPT. Script and production preparation assisted by OpenAI Codex. Live-action footage and app captures are real recordings.
```

If ElevenLabs narration was used, append this to the same field:

```text
AI-generated English narration: ElevenLabs.
```

After export, read the actual tags with `ffprobe -v error -show_entries format=duration:format_tags=comment -of json <video.mp4>`. These instructions do not establish that metadata has already been written: the final MP4 does not exist yet.

## Before publication

The user identified Alexey as a team member and selected the opening that shows him. Separate consent is not being requested in the current workflow.

After the first edit, establish who owns the scarf symbols. Until that is resolved, do not mark the print as verified or claim the video is ready for publication.
