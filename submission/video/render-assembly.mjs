import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {withChrome, sleep} from './chrome.mjs';

// Local assembly only. Speech is collected separately; this renderer makes no API calls.
if (!process.argv[2]) throw new Error('Pass the absolute prepared media directory.');
const root = path.resolve(process.argv[2]);
const out = path.join(root, 'assembly-v1');
fs.mkdirSync(out, {recursive: true});
const ff = args => execFileSync('/opt/homebrew/bin/ffmpeg', ['-v', 'error', '-y', ...args], {stdio: 'inherit'});
const probe = file => JSON.parse(execFileSync('/opt/homebrew/bin/ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', file], {encoding: 'utf8'}));
const enc = ['-c:v', 'h264_videotoolbox', '-b:v', '12M', '-pix_fmt', 'yuv420p', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-an'];
const uri = name => pathToFileURL(path.join(root, name)).href;
const esc = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const lines = JSON.parse(fs.readFileSync(path.join(out, 'lines.json')));
const audio = JSON.parse(fs.readFileSync(path.join(out, 'audio-files.json')));
const starts = [2.3, 6.3, 12, 17, 22.5];
const scenes = [
  {name: 'hello', start: 2.3, end: 6.3, image: '03-all-sensors.png', heading: 'Meet Lama'},
  {name: 'modis', start: 6.3, end: 9.1, image: '01-modis.png', heading: 'Same planet. Same day.', sensor: 'MODIS', counterX: 1670},
  {name: 'viirs', start: 9.1, end: 12, image: '02-viirs.png', heading: 'Different detections', sensor: 'VIIRS', counterX: 1783},
  {name: 'all', start: 12, end: 17, image: '03-all-sensors.png', heading: 'Compare both instruments'},
  {name: 'geometry', start: 17, end: 19.5, image: '03-all-sensors.png', heading: 'Estimated viewing geometry', detail: '05-geometry.png'},
  {name: 'land', start: 19.5, end: 20.4, image: '03-all-sensors.png', heading: 'Land cover', detail: '05-land.png'},
  {name: 'weather', start: 20.4, end: 22.5, image: '03-all-sensors.png', heading: 'Weather at acquisition', detail: '05-weather.png'},
  {name: 'closing', start: 22.5, end: 29, image: '03-all-sensors.png', heading: 'From observations to a comparable record'},
];
// Optional replacement clips, supplied by the team. Each source is a local path.
// crop is an optional FFmpeg crop expression for the recorded UI, never a synthetic UI.
const replacementsPath = path.join(out, 'screen-clips.json');
const replacements = fs.existsSync(replacementsPath) ? JSON.parse(fs.readFileSync(replacementsPath)) : {};
const movieName = Object.keys(replacements).length ? 'lama-assembly-recordings.mp4' : 'lama-assembly.mp4';
const css = `*{box-sizing:border-box}html,body{margin:0;width:1920px;height:1080px;overflow:hidden;font-family:Arial,sans-serif;color:#f4f7fb}body{background:radial-gradient(ellipse at 15% 78%,#34556b,#152b3b 37%,#071520 78%)}h1{position:absolute;left:64px;top:44px;font-size:52px;letter-spacing:-1px;margin:0}.heading{position:absolute;left:590px;top:111px;font-size:29px;color:#ffc58d}.display{position:absolute;left:560px;top:160px;width:1295px;height:728px;border:2px solid #67859a;border-radius:15px;overflow:hidden;background:#07111c;box-shadow:0 18px 50px #0007}.map{position:absolute;width:1370px;height:770px;left:-10px;top:-45px}.screen-mask{position:absolute;right:0;top:0;width:465px;height:728px;background:linear-gradient(90deg,#07111c,#102938)}.card{position:absolute;right:42px;top:130px;width:360px;color:#eff6ff}.card h2{font-size:51px;margin:0 0 18px}.card p{font-size:28px;line-height:1.4}.counter{position:relative;width:275px;height:205px;overflow:hidden;border-radius:12px;border:2px solid #f7b566}.counter img{position:absolute;width:4800px;height:2700px;top:-1512.5px}.detail{position:absolute;inset:80px 38px auto 38px;background:#f8fafc;padding:28px;border-radius:14px;box-shadow:0 12px 50px #0008}.detail img{width:100%;display:block}.detail.geometry{top:200px}.detail.land{top:260px}.detail.weather{top:100px}.source{position:absolute;left:850px;top:914px;color:#c1d3df;font-size:23px}.review{position:absolute;right:68px;top:57px;color:#a2b6c5;font-size:21px;letter-spacing:1px}.closing{position:absolute;inset:0;background:#102330ef;padding:70px 65px}.closing h2{font-size:55px;line-height:1.12;margin:0 0 22px}.closing .next{font-size:43px;color:#ffc58d;margin:30px 0}.closing p{font-size:27px;line-height:1.4}.closing .url{font-size:32px;color:#c8e8ff}.closing .team{margin-top:28px;font-size:23px}.closing .note{font-size:21px;margin-top:20px}.subtitle{position:absolute;left:90px;right:90px;bottom:41px;text-align:center;font-size:37px;line-height:43px;font-weight:600;text-shadow:0 2px 8px #000;background:#071520dd;border-radius:12px;padding:12px 20px}.intro{position:absolute;left:60px;top:44px;padding:20px 26px;background:#071520cc;border-radius:12px}.intro b{font-size:47px}.intro p{font-size:25px;margin:10px 0 0}.watermark{background:#10202de8;border-radius:5px;width:220px;height:34px;line-height:34px;text-align:center;font-size:23px;font-weight:600}`;

// Word timings came from an independently checked Scribe transcript. Captions use
// the team's exact copy (including Lama, Earth Fire Calendar, and punctuation).
const groups = [
  [0,0.18,0.9,'I’m Lama.'], [0,1.3,2.65,'I help protect nature.'], [0,3.06,3.68,'Mostly.'],
  [1,0.24,2.15,'Same planet. Same day.'], [1,2.44,5.36,'But MODIS and VIIRS see different hotspots.'],
  [2,0.08,2.55,'Earth Fire Calendar compares their detections'], [2,2.6,4.4,'using NASA FIRMS data.'],
  [3,0.12,1.5,'We add context:'], [3,1.58,4.4,'viewing angle, land cover, and weather.'],
  [4,0.2,2.6,'First experimental estimates use it.'], [4,2.76,5.6,'Next: one comparable fire record.'],
];
const captions = groups.map(([i,a,b,text]) => ({start: starts[i]+a, end: starts[i]+b, text}));
await withChrome(async ({send, evaluate, capture}) => {
  const render = async (name,body,extra='') => {
    const file=path.join(out,name+'.html');
    fs.writeFileSync(file,`<!doctype html><html lang="en"><meta charset="utf-8"><title>Lama assembly review</title><style>${css}${extra}</style><body>${body}</body></html>`);
    await send('Page.navigate',{url:pathToFileURL(file).href}); await sleep(80);
    await evaluate('Promise.all([...document.images].map(i=>i.decode()))');
    await capture(path.join(out,name+'.png'));
  };
  for(const s of scenes) {
    let contents = `<img class="map" src="${uri('ui/'+s.image)}"><div class="screen-mask"></div>`;
    if(s.sensor) contents += `<div class="card"><h2>${s.sensor}</h2><div class="counter"><img src="${uri('ui/'+s.image)}" style="left:${-s.counterX*2.5}px"></div><p>Detections in the same 24 hours</p></div>`;
    else contents += '<div class="card"><h2>MODIS<br>+ VIIRS</h2><p>NASA FIRMS<br>Last 24 hours</p></div>';
    if(s.detail) contents += `<div class="detail ${s.name}"><img src="${uri('ui/'+s.detail)}"></div>`;
    if(replacements[s.name]) contents='';
    if(s.name==='closing') contents += '<div class="closing"><h2>Earth Fire Calendar</h2><p>First models: experimental,<br>one day of data</p><div class="next">Next: harmonization</div><p class="url">avbelkin.github.io/nasa-space-apps-sg</p><div class="team">Team Plush · Alexey Belkin &amp; Viktoriia Naiman</div><div class="note">NASA FIRMS · Independent project.<br>Not affiliated with or endorsed by NASA.</div></div>';
    await render(s.name,`<h1>Earth Fire Calendar</h1><div class="heading">${s.heading}</div><div class="display">${contents}</div><div class="source">NASA FIRMS · last 24 h</div>`);
  }
  await send('Emulation.setDefaultBackgroundColorOverride',{color:{r:0,g:0,b:0,a:0}});
  await render('intro-title','<div class="intro"><b>Earth Fire Calendar</b><p>Harmonization of MODIS and VIIRS Hot Spots</p><p>Team Plush</p></div>','body{background:transparent}');
  await render('transition-label','<div style="position:absolute;bottom:60px;left:65px;background:#10202de8;padding:9px 15px;border-radius:6px;font-size:23px">AI-generated transition · AI-edited plush image</div>','body{background:transparent}');
  // A green subtitle strip is converted to alpha in the final composite.
  await send('Emulation.setDeviceMetricsOverride',{width:1920,height:160,deviceScaleFactor:1,mobile:false});
  for(let i=0;i<captions.length;i++) await render(`caption-${i}`,`<div class="subtitle">${esc(captions[i].text)}</div>`,'html,body{height:160px;background:#00ff00}.subtitle{bottom:24px;background:#071520}');
  await render('caption-empty','','html,body{height:160px;background:#00ff00}');
});

// The plush stays photographic throughout takeoff and flight. The animated image
// first appears inside the monitor after the plush has fully disappeared.
ff(['-i',path.join(root,'intro-no-face.mp4'),'-frames:v','21',...enc,path.join(out,'live.mp4')]);
const u='min(max((t-0.15)/0.80,0),1)';
const scale=`(0.587*(1-${u})+0.04*${u})`;
const squash='(1-0.12*sin(min(t/0.15,1)*PI))';
ff(['-loop','1','-framerate','30','-i',path.join(root,'jump-v2/end.png'),
 '-loop','1','-framerate','30','-i',path.join(root,'jump-v2/plush-cutout.png'),
 '-loop','1','-framerate','30','-i',path.join(root,'presenter-v4/lama-character-green.png'),
 '-loop','1','-framerate','30','-i',path.join(root,'jump-v1/glow.png'),
 '-loop','1','-i',path.join(out,'transition-label.png'),
 '-loop','1','-i',path.join(root,'presenter-v2/watermark.png'),
 '-filter_complex',`[0:v]scale=1920:1080,setsar=1[bg];[5:v]split=2[mark1][mark2];[1:v][mark1]overlay=310:1180:format=auto[photo];`+
 `[photo]format=rgba,scale=w='trunc(1086*${scale}/2)*2':h='trunc(1448*${scale}*${squash}/2)*2':eval=frame,fade=t=out:st=0.95:d=0.066667:alpha=1[plush];`+
 `[bg][plush]overlay=x='1200+360*${u}-543*${scale}':y='1030-600*${u}-120*sin(PI*${u})-1448*${scale}*${squash}':eval=frame:format=auto[flight];`+
 '[2:v]format=rgba,colorkey=0x00ff00:0.30:0.10,despill=green[design];[design][mark2]overlay=650:710:format=auto,scale=230:130,fade=t=in:st=1.1:d=0.1:alpha=1[inside];'+
 "[flight][inside]overlay=1445:305:enable='gte(t,1.1)':format=auto[transform];"+
 '[3:v]format=rgba,fade=t=in:st=0.90:d=0.066667:alpha=1,fade=t=out:st=1.04:d=0.16:alpha=1[glow];'+
 '[transform][glow]overlay=0:0:format=auto[g];[g][4:v]overlay=0:0,format=yuv420p[v]',
 '-map','[v]','-frames:v','42',...enc,path.join(out,'flight.mp4')]);
ff(['-sseof','-0.034','-i',path.join(out,'flight.mp4'),'-frames:v','1',path.join(out,'flight-last.png')]);
ff(['-loop','1','-i',path.join(out,'flight-last.png'),'-vf',"zoompan=z='1+4*on/5':x='1560-iw/zoom/2':y='365-ih/zoom/2':d=6:s=1920x1080:fps=30,gblur=sigma=3:enable='gte(n,3)',setsar=1",'-frames:v','6',...enc,path.join(out,'push.mp4')]);
const concat = (names,name) => {
 const list=path.join(out,name+'.txt'); fs.writeFileSync(list,names.map(n=>`file '${n}.mp4'`).join('\n')+'\n');
 ff(['-f','concat','-safe','0','-i',list,'-c','copy',path.join(out,name+'.mp4')]);
};
concat(['live','flight','push'],'opening-plain');
ff(['-i',path.join(out,'opening-plain.mp4'),'-i',path.join(out,'intro-title.png'),'-filter_complex','[0:v][1:v]overlay=0:0,setsar=1[v]','-map','[v]','-frames:v','69',...enc,path.join(out,'opening.mp4')]);

for(const s of scenes) {
 const frames=Math.round((s.end-s.start)*30); const replacement=replacements[s.name];
 if(replacement) {
   const layers=replacement.layers || [replacement]; const inputs=[];const filters=[];
   layers.forEach((layer,i)=>{
    const file=path.resolve(layer.file);if(!fs.existsSync(file))throw new Error(`Missing replacement ${file}`);
    inputs.push('-ss',String(layer.start||0),...(layer.duration?['-t',String(layer.duration)]:[]),'-i',file);
    const [x,y,w,h]=layer.rect || [560,160,1294,728];
    filters.push(`[${i+1}:v]${layer.crop?`crop=${layer.crop},`:''}scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=0x07111c,setsar=1,fps=30,tpad=stop_mode=clone:stop_duration=29[screen${i}];[${i?'layer'+(i-1):'0:v'}][screen${i}]overlay=${x}:${y}[layer${i}]`);
   });
   filters.push(`[layer${layers.length-1}]format=yuv420p[v]`);
   ff(['-loop','1','-framerate','30','-i',path.join(out,s.name+'.png'),...inputs,
    '-filter_complex',filters.join(';'),
    '-map','[v]','-frames:v',String(frames),...enc,path.join(out,s.name+'.mp4')]);
 } else ff(['-loop','1','-framerate','30','-i',path.join(out,s.name+'.png'),'-frames:v',String(frames),...enc,path.join(out,s.name+'.mp4')]);
}
concat(scenes.map(s=>s.name),'stage');
// Only the independently inspected 1.0–2.6 s waist-up excerpt is used. The rejected
// full-body take is never shown. Forward/reverse cycles retain blinks and gestures.
ff(['-ss','1','-t','1.6','-i',path.join(root,'presenter-v4/lama-motion-green.mp4'),
 '-filter_complex','[0:v]fps=30,crop=720:480:280:0,split=2[a][b];[b]reverse[back];[a][back]concat=n=2:v=1:a=0,setpts=PTS*1.25,fps=30,setsar=1[v]',
 '-map','[v]','-frames:v','120',...enc,path.join(out,'host-cycle.mp4')]);
ff(['-i',path.join(out,'stage.mp4'),'-stream_loop','-1','-i',path.join(out,'host-cycle.mp4'),'-loop','1','-i',path.join(root,'presenter-v2/watermark.png'),
 '-filter_complex','[1:v]format=rgba,colorkey=0x00ff00:0.30:0.10,despill=green,scale=960:640[host];[0:v][host]overlay=-230:380:format=auto[stage];[stage][2:v]overlay=95:915,setsar=1,format=yuv420p[v]',
 '-map','[v]','-frames:v','801',...enc,path.join(out,'presenter.mp4')]);
concat(['opening','presenter'],'picture');

const capList=[];let frame=0;let part=0;
for(const c of [...captions,{start:29,end:29,text:''}]) {
 const a=Math.round(c.start*30),b=Math.min(870,Math.round(c.end*30));
 for(const [from,to,name] of [[frame,a,'caption-empty'],[a,b,`caption-${captions.indexOf(c)}`]]) {
  if(to<=from)continue;const stem=`caption-part-${part++}`;
  ff(['-loop','1','-framerate','30','-i',path.join(out,name+'.png'),'-frames:v',String(to-from),...enc,path.join(out,stem+'.mp4')]);capList.push(stem);
 }
 frame=b;
}
concat(capList,'captions');
const inputArgs=audio.flatMap(a=>['-i',path.join(out,a.file)]);
const delayed=audio.map((_,i)=>`[${i}:a]aresample=48000,adelay=${starts[i]*1000}:all=1[a${i}]`).join(';');
ff([...inputArgs,'-f','lavfi','-t','29','-i','anullsrc=r=48000:cl=stereo','-filter_complex',`${delayed};${audio.map((_,i)=>`[a${i}]`).join('')}[5:a]amix=inputs=6:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[m]`,'-map','[m]','-t','29','-c:a','pcm_s16le',path.join(out,'mix.wav')]);
const comment='Assembly review with temporary real production-site screenshots; not publication-ready. Synthetic narration: ElevenLabs Eleven v4, Flicker - Cheerful Fairy & Sparkly Sweetness (piI8Kku0DcvcL6TTSeQt), via OpenRouter; no pitch or tempo shift, loudness normalized. Photographic plush cutout edited using the OpenAI ChatGPT image tool; locally animated into the monitor before transformation. Generated desk background and waist-up character motion: Google Veo 3.1 Lite via OpenRouter. Character design: OpenAI ChatGPT image tool, exact model undisclosed. Local forward/reverse animation cycles, no phoneme lip sync. Script and assembly assistance: OpenAI Codex. Fire data: NASA FIRMS. Placeholder basemap: EOX 2025 CC BY-NC-SA 4.0; replace with final EOX 2016 live recording.';
ff(['-i',path.join(out,'picture.mp4'),'-i',path.join(out,'captions.mp4'),'-i',path.join(out,'mix.wav'),'-filter_complex','[1:v]format=rgba,colorkey=0x00ff00:0.3:0.1[sub];[0:v][sub]overlay=0:920,format=yuv420p[v]','-map','[v]','-map','2:a','-frames:v','870','-c:v','h264_videotoolbox','-b:v','14M','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-t','29','-metadata','title=Earth Fire Calendar — Lama assembly review','-metadata',`comment=${comment}`,'-movflags','+faststart',path.join(out,movieName)]);
const srtTime=t=>{const ms=Math.round(t*1000);return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`;};
fs.writeFileSync(path.join(out,'subtitles.srt'),captions.map((c,i)=>`${i+1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join('\n'));
fs.writeFileSync(path.join(out,'timeline.json'),JSON.stringify({frames:870,fps:30,lines:lines.map((text,i)=>({text,start:starts[i],duration:audio[i].duration})),scenes,captions,plushFlight:{start:0.85,end:1.716667},cartoonFirstAppearance:1.8,replacementClips:replacements},null,2)+'\n');
fs.writeFileSync(path.join(out,'render-report.json'),JSON.stringify({probe:probe(path.join(out,movieName)),limitations:['Temporary app screenshots await Alexey’s final recording','Live-to-composite pose continuity remains visible','Rigid photographic plush arc, not articulated takeoff','Waist-up repeated gestures; no walking or exact lip sync'],apiCallsFromRenderer:0},null,2)+'\n');
fs.writeFileSync(path.join(out,'review.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><title>Lama assembly review</title><style>body{background:#101c28;color:#eef5ff;font:18px Arial;margin:32px auto;max-width:1280px}video{width:100%}a{color:#9ed6ff}li{margin:10px 0}</style><h1>Lama — 29-second assembly</h1><video controls src="${movieName}"></video><p>Flicker · updated narration · photographic plush jumps before becoming the animated presenter.</p><ul><li>Temporary real app stills: Alexey’s screen recording is pending.</li><li>The plush flight uses a photographic cutout and a generated background; the live/composite pose cut remains visible.</li><li>Presenter motion uses a reviewed waist-up excerpt in forward/reverse cycles; no walking or phoneme lip sync.</li></ul><p><a href="${movieName}">MP4</a> · <a href="subtitles.srt">English subtitles</a> · <a href="timeline.json">Timing</a></p></html>`);
console.log(JSON.stringify({file:path.join(out,movieName),frames:870,duration:29}));
