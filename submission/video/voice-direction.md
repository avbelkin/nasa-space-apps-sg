# Lama voice and character direction

[Production plan](README.md) · [Working script](demo-video.md)

## Current scope

Work only on Lama's voice, character performance and physical desk-to-screen jump. The narration and story will be revised later. Existing lines are audition copy, not locked submission text. Do not rebuild the full film or record final UI actions in this block.

## Voice brief

An adult female cartoon performer voicing a little boy, approximately seven. Lama is small, clever, curious, energetic and mischievous. Use a bright childlike register, clear diction, lively questions and a knowing comic pause. The character should sound like a little boy in an animated film.

The user rejected both Will and Charlie with a three-semitone pitch increase. The current audition changes the underlying voice and acting direction. It uses three female voice presets — Jessica, Bella and Laura — with no local pitch shift. The choice remains pending listening review; the presets and prompts do not establish that the resulting performance meets the brief.

Provider: ElevenLabs Eleven v4 through OpenRouter synchronous speech. Initial creative stability was 0; Jessica was also tried at 0.5, and that take is audition A. Similarity boost is 0.35, seed 38. The same two temporary lines are synthesized in one request per candidate. Generated repetitions were trimmed using recorded word timestamps; raw files remain intact. `prepare-voice-auditions.mjs` reproduces the three review WAV files and records the edits. The exact request direction, IDs, raw MP3 and transcription are preserved in `lama/prepared/voice-v3/`.

Reference: the [OpenRouter speech guide](https://openrouter.ai/docs/guides/overview/multimodal/tts) and live `models?output_modalities=speech` catalogue. The three chosen presets are advertised by the active endpoint. Free-form `instructions` are not supported for ElevenLabs on this route, so direction is passed as inline audio tags. The ordinary voice parameter does not create a custom designed voice. Transcription checks whether directions were accidentally spoken, but perceived age and boyish acting require listening.

## Physical jump

The preceding pilot contains a camera push, not the requested jump. The new test must visibly show Lama crouch, push off the desk, leave the surface, travel through the air and pass into the physical monitor. His original position must be empty afterward. The monitor and camera should stay still enough for the trajectory to read.

The real desk/monitor frame was used for one bounded four-second Google Veo 3.1 Lite image-to-video test through OpenRouter. That raw trajectory missed the screen and is rejected. Its empty ending supplies a generated background for a controlled composite: the existing living character squashes, rises toward the screen, shrinks into a glow, then drops into the presenter scene. `render-jump-pilot.mjs` produces the silent 3.5-second test in `lama/prepared/jump-v1/jump-pilot.mp4`.

This remains a rough test: transformation happens before takeoff, the body waves during flight, and the hand/background changes at the cut. These are creative review points, not an accepted final jump. Review it separately from speech. A visible AI watermark and metadata disclose the generated transition. The full film's timing will be revised with its text; the earlier 0.6-second transition allocation is provisional.

Review continuity of cream fur, orange/navy scarf, soft toes, full-body motion, monitor entry and the transformation into the existing living presenter. Do not accept a zoom or disappearance in place as a completed jump.
