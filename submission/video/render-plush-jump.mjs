import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {withChrome, sleep} from './chrome.mjs';

// Silent motion-order prototype only. Never replaces the final film or narration.
if (!process.argv[2]) throw new Error('Pass the absolute prepared media directory.');
const root = path.resolve(process.argv[2]);
const out = path.join(root, 'jump-v2');
const old = path.join(root, 'jump-v1');
const presenter = path.join(root, 'presenter-v4');
const ff = args => execFileSync('/opt/homebrew/bin/ffmpeg', ['-v', 'error', '-y', ...args], {stdio: 'inherit'});
const enc = ['-c:v', 'h264_videotoolbox', '-b:v', '12M', '-pix_fmt', 'yuv420p', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-an'];
await withChrome(async ({send, evaluate, capture}) => {
  await send('Page.navigate', {url: pathToFileURL(path.join(root, 'presenter-v2', 'hello.html')).href});
  await sleep(100);
  await evaluate("Promise.all([...document.images].map(i=>i.decode())).then(()=>{document.querySelector('.subtitle')?.remove();document.querySelector('.source').style.left='870px';})");
  await capture(path.join(out, 'landing-stage.png'));
});
ff(['-i', path.join(root, 'intro-no-face.mp4'), '-frames:v', '15', ...enc, path.join(out, 'live.mp4')]);
const u = 'min(max((t-0.18)/0.82,0),1)';
const scale = `(0.587*(1-${u})+0.04*${u})`;
const squash = '(1-0.12*sin(min(t/0.18,1)*PI))';
// The airborne figure remains the photographic plush cutout. The generated
// character first appears inside the physical monitor, after the plush vanishes.
ff(['-loop', '1', '-framerate', '30', '-i', path.join(out, 'end.png'),
  '-loop', '1', '-framerate', '30', '-i', path.join(out, 'plush-cutout.png'),
  '-loop', '1', '-framerate', '30', '-i', path.join(presenter, 'lama-character-green.png'),
  '-loop', '1', '-framerate', '30', '-i', path.join(old, 'glow.png'),
  '-loop', '1', '-framerate', '30', '-i', path.join(old, 'label.png'),
  '-loop', '1', '-framerate', '30', '-i', path.join(root, 'presenter-v2', 'watermark.png'),
  '-filter_complex', `[0:v]scale=1920:1080,setsar=1[bg];` +
    '[5:v]split=2[mark1][mark2];[1:v][mark1]overlay=310:1180:format=auto[photo];' +
    `[photo]format=rgba,scale=w='trunc(1086*${scale}/2)*2':h='trunc(1448*${scale}*${squash}/2)*2':eval=frame,fade=t=out:st=1.0:d=0.07:alpha=1[plush];` +
    `[bg][plush]overlay=x='1200+360*${u}-543*${scale}':y='1030-600*${u}-120*sin(PI*${u})-1448*${scale}*${squash}':eval=frame:format=auto[flight];` +
    '[2:v]format=rgba,colorkey=0x00ff00:0.30:0.10,despill=green[design];[design][mark2]overlay=650:710:format=auto,scale=230:130,fade=t=in:st=1.08:d=0.15:alpha=1[inside];' +
    '[flight][inside]overlay=1445:305:enable=\'gte(t,1.08)\':format=auto[transform];' +
    '[3:v]format=rgba,fade=t=in:st=0.88:d=0.08:alpha=1,fade=t=out:st=1.0:d=0.2:alpha=1[glow];' +
    '[transform][glow]overlay=0:0:format=auto[g];[g][4:v]overlay=0:0,format=yuv420p[v]',
  '-map', '[v]', '-frames:v', '51', ...enc, path.join(out, 'flight.mp4')]);
// The raw full-body animation has an extra limb and is rejected. This short,
// waist-up excerpt is separately reviewed; no walking/full-body claim is made.
ff(['-loop', '1', '-framerate', '30', '-i', path.join(out, 'landing-stage.png'),
  '-ss', '1.0', '-i', path.join(presenter, 'lama-motion-green.mp4'),
  '-loop', '1', '-i', path.join(root, 'presenter-v2', 'watermark.png'),
  '-filter_complex', '[1:v]fps=30,crop=720:480:280:0,format=rgba,colorkey=0x00ff00:0.30:0.10,despill=green,scale=1080:720[host];' +
    '[0:v][host]overlay=x=-190:y=360:format=auto[stage];[stage][2:v]overlay=160:995,setsar=1,format=yuv420p[v]',
  '-map', '[v]', '-frames:v', '48', ...enc, path.join(out, 'presenter-excerpt.mp4')]);
fs.writeFileSync(path.join(out, 'concat-corrected.txt'), ['live', 'flight', 'presenter-excerpt'].map(n => `file '${n}.mp4'`).join('\n') + '\n');
ff(['-f', 'concat', '-safe', '0', '-i', path.join(out, 'concat-corrected.txt'), '-c', 'copy',
  '-metadata', 'title=Lama plush-to-screen motion-order prototype — silent',
  '-metadata', 'comment=Silent rough prototype; not final film. The airborne plush is an AI-edited photographic cutout of the actual toy (OpenAI ChatGPT image tool), locally animated. The empty desk background comes from a rejected Google Veo 3.1 Lite take via OpenRouter. The cartoon appears only inside the monitor, then a waist-up excerpt of the new Google Veo 3.1 Lite presenter plays. Its raw full-body take is rejected for an extra limb. Character design: OpenAI ChatGPT image tool. Live opening and application captures are real recordings. No narration or lip sync. Assembly: OpenAI Codex.',
  '-movflags', '+faststart', path.join(out, 'plush-to-screen-pilot.mp4')]);
const probe = JSON.parse(execFileSync('/opt/homebrew/bin/ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path.join(out, 'plush-to-screen-pilot.mp4')], {encoding: 'utf8'}));
fs.writeFileSync(path.join(out, 'render-report.json'), JSON.stringify({scope: 'Rough silent motion-order and waist-up presenter test', expectedFrames: 114,
  segments: [{name: 'real opening', frames: 15}, {name: 'photographic plush flight; transformation starts inside monitor at overall 1.58 s', frames: 51}, {name: 'waist-up animated presenter excerpt', frames: 48}],
  limitations: ['Pose and hand continuity at live/composite cut is rough', 'Plush flight is a rigid cutout with squash, not articulated movement', 'Raw full-body presenter motion has an extra limb and remains rejected', 'Narration and final script are on hold'], probe}, null, 2) + '\n');
console.log(JSON.stringify({file: path.join(out, 'plush-to-screen-pilot.mp4'), frames: 114, duration: 3.8, silent: true}));
