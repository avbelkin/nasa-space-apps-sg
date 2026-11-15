import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

// Local processing only. The source is the previously collected, trimmed Laura audition.
if (!process.argv[2]) throw new Error('Pass the absolute prepared media directory.');
const root = path.resolve(process.argv[2]);
const out = path.join(root, 'voice-v5');
const source = path.join(root, 'voice-v3', '03-laura.wav');
fs.mkdirSync(out, {recursive: true});
const variants = [];
for (const semitones of [-1, -2]) {
  const factor = 2 ** (semitones / 12);
  const file = `laura-minus-${-semitones}.wav`;
  const filter = `aresample=48000,asetrate=${48000 * factor},aresample=48000,atempo=${1 / factor}`;
  execFileSync('/opt/homebrew/bin/ffmpeg', ['-v', 'error', '-y', '-i', source, '-af', filter,
    '-c:a', 'pcm_s16le', '-metadata', `title=Lama Laura audition (${semitones} semitones)`,
    '-metadata', `comment=Synthetic narration audition: ElevenLabs Eleven v4 Laura via OpenRouter. Source repeats trimmed as documented in voice-v3/review-edits.json. Local pitch and formant shift ${semitones} semitones; tempo compensated. Temporary words; selection pending.`,
    path.join(out, file)], {stdio: 'inherit'});
  const probe = JSON.parse(execFileSync('/opt/homebrew/bin/ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path.join(out, file)], {encoding: 'utf8'}));
  variants.push({file, semitones, filter, probe});
}
fs.writeFileSync(path.join(out, 'variants.json'), JSON.stringify({source, baseVoice: 'Laura', newApiCalls: 0,
  processing: 'Pitch/formants lowered slightly; duration compensated', variants}, null, 2) + '\n');
console.log(JSON.stringify({directory: out, files: variants.map(v => v.file), newApiCalls: 0}));
