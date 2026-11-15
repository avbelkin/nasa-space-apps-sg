import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {withChrome, sleep} from './chrome.mjs';

// A local, replaceable concept pilot. No API requests or package installation.
const root = path.resolve(process.argv[2]);
const out = path.join(root, 'presenter-v2');
const ff = args => execFileSync('/opt/homebrew/bin/ffmpeg', ['-v','error','-y',...args], {stdio:'inherit'});
const probe = file => JSON.parse(execFileSync('/opt/homebrew/bin/ffprobe',['-v','error','-show_streams','-show_format','-of','json',file],{encoding:'utf8'}));
const url = file => pathToFileURL(path.join(root,file)).href;
const enc = ['-c:v','h264_videotoolbox','-b:v','12M','-pix_fmt','yuv420p','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-an'];
const css = `*{box-sizing:border-box}html,body{margin:0;width:1920px;height:1080px;overflow:hidden;font-family:Arial,sans-serif;color:#f2f7ff}body{background:radial-gradient(ellipse at 22% 77%,#28435c 0,#132638 33%,#07141e 72%)}h1{position:absolute;top:43px;left:64px;font-size:54px;line-height:1;margin:0;font-weight:700;letter-spacing:-1px}.tag{position:absolute;right:68px;top:57px;font-size:27px;letter-spacing:3px;color:#ffbd79}.display{position:absolute;left:550px;top:140px;width:1305px;height:782px;overflow:hidden;border:2px solid #657c8c;border-radius:18px;box-shadow:0 30px 70px #0008;background:#030a13}.map{position:absolute;width:1655px;height:931px;left:-10px;top:-60px}.map-mask{position:absolute;inset:0;background:linear-gradient(90deg,#07141e88,transparent 25%)}.counter{position:absolute;left:1515px;top:175px;width:275px;height:235px;overflow:hidden;border:2px solid #ffba6a;border-radius:16px;box-shadow:0 8px 40px #0008}.counter img{position:absolute;width:4800px;height:2700px;top:-1512.5px}.source{position:absolute;left:680px;top:936px;color:#b9ccdc;font-size:24px}.subtitle{position:absolute;left:100px;top:987px;width:1720px;text-align:center;font-size:38px;line-height:44px;font-weight:600;text-shadow:0 2px 10px #000}.shadow{position:absolute;left:270px;top:896px;width:400px;height:48px;background:#0005;border-radius:50%;filter:blur(12px)}.intro{position:absolute;left:66px;top:42px;text-shadow:0 2px 12px #000}.intro b{font-size:53px}.intro p{font-size:25px;margin:13px 0 0}.watermark{width:220px;height:34px;line-height:34px;text-align:center;background:#10202de8;color:#fff;border-radius:5px;font-size:23px;font-weight:600}`;
const scenes = [
  {name:'hello', frames:110, screenshot:'03-all-sensors.png', subtitle:'I’m Lama. I help Alexey. Mostly.'},
  {name:'modis', frames:80, screenshot:'01-modis.png', subtitle:'Same planet. Same day.', counterX:1670},
  {name:'viirs', frames:95, screenshot:'02-viirs.png', subtitle:'But MODIS and VIIRS see different hotspots.', counterX:1783},
];
await withChrome(async ({send,evaluate,capture}) => {
  const render = async (name,body,extra='') => {
    const file=path.join(out,name+'.html');
    fs.writeFileSync(file,`<!doctype html><html lang="en"><meta charset="utf-8"><title>Lama presenter pilot</title><style>${css}${extra}</style><body>${body}</body></html>`);
    await send('Page.navigate',{url:pathToFileURL(file).href}); await sleep(100);
    await evaluate('Promise.all([...document.images].map(i=>i.decode()))');
    await capture(path.join(out,name+'.png'));
  };
  for(const s of scenes) {
    const src=url('ui/'+s.screenshot);
    await render(s.name,`<h1>Earth Fire Calendar</h1><div class="tag">SAME PLANET. DIFFERENT DETECTIONS.</div><div class="display"><img class="map" src="${src}" alt="Real application capture"><div class="map-mask"></div></div><div class="shadow"></div>${s.counterX?`<div class="counter"><img src="${src}" style="left:${-s.counterX*2.5}px" alt="Actual sensor counter"></div>`:''}<div class="source">NASA FIRMS · last 24 h · recorded application view</div><div class="subtitle">${s.subtitle}</div>`);
  }
  await send('Emulation.setDefaultBackgroundColorOverride',{color:{r:0,g:0,b:0,a:0}});
  await render('intro-overlay','<div class="intro"><b>Earth Fire Calendar</b><p>Harmonization of MODIS and VIIRS Hot Spots</p></div>','body{background:transparent}');
  await send('Emulation.setDeviceMetricsOverride',{width:220,height:34,deviceScaleFactor:1,mobile:false});
  await render('watermark','<div class="watermark">AI-generated</div>','html,body{width:220px;height:34px;background:transparent}');
});
for(const s of scenes) ff(['-loop','1','-framerate','30','-i',path.join(out,s.name+'.png'),'-frames:v',String(s.frames),...enc,path.join(out,s.name+'.mp4')]);
fs.writeFileSync(path.join(out,'stage-concat.txt'),scenes.map(s=>`file '${s.name}.mp4'`).join('\n')+'\n');
ff(['-f','concat','-safe','0','-i',path.join(out,'stage-concat.txt'),'-c','copy',path.join(out,'stage.mp4')]);
// Crop the invented prop at the far right of the generated source out completely.
// The watermark overlays the moving body, below the scarf; it is not a footer.
ff(['-i',path.join(out,'stage.mp4'),'-i',path.join(out,'lama-motion-green.mp4'),'-loop','1','-i',path.join(out,'watermark.png'),'-filter_complex',"[1:v]setpts=PTS*1.1875,fps=30,crop=1060:720:0:0,format=rgba,colorkey=0x00ff00:0.30:0.10,despill=green[key];[key][2:v]overlay=x='510+min(t/3,1)*50':y=555:format=auto[host];[0:v][host]overlay=x=-170:y=205:format=auto,format=yuv420p,setsar=1[v]",'-map','[v]','-frames:v','285',...enc,path.join(out,'presenter.mp4')]);
ff(['-i',path.join(out,'intro-full-bleed.mp4'),'-i',path.join(out,'intro-overlay.png'),'-filter_complex','[0:v][1:v]overlay=0:0,setsar=1[v]','-map','[v]','-frames:v','42',...enc,path.join(out,'intro.mp4')]);
ff(['-sseof','-0.034','-i',path.join(out,'intro-full-bleed.mp4'),'-frames:v','1',path.join(out,'intro-last.png')]);
ff(['-loop','1','-framerate','30','-i',path.join(out,'intro-last.png'),'-vf',"zoompan=z='1+5*on/11':x='1670-iw/zoom/2':y='410-ih/zoom/2':d=12:s=1920x1080:fps=30,gblur=sigma=5:enable='gte(n,8)',setsar=1",'-frames:v','12',...enc,path.join(out,'push.mp4')]);
ff(['-loop','1','-framerate','30','-i',path.join(out,'hello.png'),'-vf','fade=t=in:st=0:d=0.166667:color=white,setsar=1','-frames:v','6',...enc,path.join(out,'reveal.mp4')]);
fs.writeFileSync(path.join(out,'picture-concat.txt'),['intro','push','reveal','presenter'].map(s=>`file '${s}.mp4'`).join('\n')+'\n');
ff(['-f','concat','-safe','0','-i',path.join(out,'picture-concat.txt'),'-c','copy',path.join(out,'picture.mp4')]);
const pitch = 2**(3/12);
const speech=path.join(out,'voice-charlie');
for(let i=1;i<=2;i++) ff(['-i',path.join(speech,`voice-${i}.mp3`),'-af',`aresample=48000,asetrate=${48000*pitch},aresample=48000,atempo=${1/pitch}`,'-c:a','pcm_s16le',path.join(out,`young-voice-${i}.wav`)]);
ff(['-i',path.join(out,'young-voice-1.wav'),'-i',path.join(out,'young-voice-2.wav'),'-f','lavfi','-t','11.5','-i','anullsrc=r=48000:cl=stereo','-filter_complex','[0:a]adelay=2000:all=1[a];[1:a]adelay=5667:all=1[b];[a][b][2:a]amix=inputs=3:normalize=0,alimiter=limit=0.85:level=false[m]','-map','[m]','-t','11.5','-c:a','pcm_s16le',path.join(out,'mix.wav')]);
const comment='Concept pilot, not final submission. AI character image: OpenAI ChatGPT image tool (model not disclosed). AI animation: Google Veo 3.1 Lite via OpenRouter. Synthetic narration: ElevenLabs Eleven v4, Charlie, via OpenRouter, pitch raised three semitones with duration preserved. Script and assembly: OpenAI Codex. Live footage and application screenshots are real recordings.';
ff(['-i',path.join(out,'picture.mp4'),'-i',path.join(out,'mix.wav'),'-map','0:v','-map','1:a','-c:v','copy','-c:a','aac','-b:a','192k','-t','11.5','-metadata',`comment=${comment}`,'-metadata','title=Earth Fire Calendar — Lama presenter concept','-movflags','+faststart',path.join(out,'pilot.mp4')]);
fs.writeFileSync(path.join(out,'render-report.json'),JSON.stringify({createdAt:new Date().toISOString(),scope:'Character, voice and composition pilot; final 29-second film pending review',frames:345,pitchSemitones:3,voiceStarts:[2,5.666667],sourceMotion:probe(path.join(out,'lama-motion-green.mp4')),export:probe(path.join(out,'pilot.mp4'))},null,2)+'\n');
console.log(JSON.stringify({file:path.join(out,'pilot.mp4'),duration:11.5,frames:345}));
