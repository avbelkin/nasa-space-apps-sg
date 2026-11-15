import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {withChrome,sleep} from './chrome.mjs';
import {writeKeyboardFoley} from './keyboard-sfx.mjs';

// Revised full-frame UI assembly. Local rendering only; never submits API work.
if(!process.argv[2])throw new Error('Pass the absolute prepared media directory.');
const root=path.resolve(process.argv[2]);
const screens=path.resolve(root,'../../screens');
const old=path.join(root,'assembly-v1');
const out=path.join(root,'assembly-v4');fs.mkdirSync(out,{recursive:true});
const ff=args=>execFileSync('/opt/homebrew/bin/ffmpeg',['-v','error','-y',...args],{stdio:'inherit'});
const probe=file=>JSON.parse(execFileSync('/opt/homebrew/bin/ffprobe',['-v','error','-show_format','-show_streams','-of','json',file],{encoding:'utf8'}));
const enc=['-c:v','h264_videotoolbox','-b:v','14M','-pix_fmt','yuv420p','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-an'];
const file=time=>path.join(screens,`Screen Recording 2026-11-15 at ${time}.mov`);
const times=['21.23.52','21.26.02','21.52.05','22.28.52'];
for(const time of times)if(!fs.existsSync(file(time)))throw new Error(`Missing recording: ${file(time)}`);
for(const [name,time,at] of [['overview','21.23.52',0.2],['color','21.26.02',1.2],['context','21.52.05',9],['land','21.52.05',6.3]])ff(['-ss',String(at),'-i',file(time),'-frames:v','1',path.join(out,name+'-source.png')]);
fs.copyFileSync(path.join(screens,'Screenshot 2026-11-15 at 22.28.33.png'),path.join(out,'harmonization-source.png'));
const scenes=[
 {name:'hello',time:'21.23.52',seek:0,sourceDuration:2.5,start:2.3,end:6.3,kind:'overview',hostStart:0,hostDuration:4,x:'180-150*min(t/2,1)'},
 {name:'compare',time:'21.26.02',seek:0,sourceDuration:2.6,start:6.3,end:12,kind:'counts',hostStart:1.8,hostDuration:4.2,x:'700-120*min(t/1.5,1)'},
 {name:'all',time:'21.26.02',seek:0.5,sourceDuration:2.1,start:12,end:17,kind:'color',hostStart:2.3,hostDuration:3.7,x:'190+20*sin(min(t/2,1)*PI)'},
 {name:'geometry',time:'21.52.05',seek:8.8,sourceDuration:1.4,start:17,end:19.5,kind:'geometry',hostStart:1,hostDuration:2.5,x:'580-100*min(t/2,1)'},
 {name:'land',time:'21.52.05',seek:8.8,sourceDuration:1.4,start:19.5,end:20.4,kind:'land',hostStart:3.5,hostDuration:0.9,x:'480'},
 {name:'weather',time:'21.52.05',seek:8.8,sourceDuration:1.4,start:20.4,end:22.5,kind:'weather',hostStart:3.9,hostDuration:2.1,x:'480'},
 {name:'harmonization',time:'22.28.52',seek:4.15,sourceDuration:0.8,start:22.5,end:26,kind:'harmonization',hostStart:2,hostDuration:3.5,x:'480'},
 {name:'closing',time:'22.28.52',seek:4.15,sourceDuration:0.8,start:26,end:29,kind:'closing',hostStart:4.5,hostDuration:1.5,x:'1340'},
];
// Real source crops, enlarged without changing values. The full-frame recording
// remains behind them. The right-side enlargements cover status and model rows.
const crop=(name,x,y,w,h,left,top,scale)=>`<div class="crop" style="left:${left}px;top:${top}px;width:${w*scale}px;height:${h*scale}px"><img src="${pathToFileURL(path.join(out,name+'-source.png')).href}" style="position:absolute;left:${-x*scale}px;top:${-y*scale}px;width:${(name==='harmonization'?1509:name==='context'||name==='land'?1510:1506)*scale}px"></div>`;
const fonts=path.resolve(root,'../../../presentation/assets/fonts');
const closingEarth=path.resolve(root,'../../../presentation/assets/screenshots/cover-sensors.png');
if(!fs.existsSync(closingEarth))throw new Error('Missing presentation globe capture.');
const css=`@font-face{font-family:Overpass;src:url('${pathToFileURL(path.join(fonts,'Overpass-Regular.ttf')).href}')}@font-face{font-family:Overpass;src:url('${pathToFileURL(path.join(fonts,'Overpass-Bold.ttf')).href}');font-weight:700}*{box-sizing:border-box}html,body{width:1920px;height:1080px;margin:0;overflow:hidden;background:transparent;color:#edf4fc;font-family:Arial,sans-serif}.panel{position:absolute;left:1230px;top:76px;right:0;bottom:0;background:#0e1521;border-left:1px solid #344355}.crop{position:absolute;overflow:hidden}.title{position:absolute;left:1270px;top:110px;font-size:32px;line-height:1.2;width:600px}.note{position:absolute;left:1270px;top:680px;width:570px;font-size:25px;line-height:1.5;color:#b2c4d7}.source{position:absolute;left:1270px;top:850px;font-size:24px;color:#aac2d7;width:570px}.source small{font-size:18px;line-height:1.5;display:block;margin-top:12px}.subtitle{position:absolute;bottom:24px;left:90px;right:90px;padding:12px 20px;text-align:center;background:#071520;color:#fff;font-size:37px;line-height:43px;font-weight:600;border-radius:12px}.closing{position:absolute;inset:0;background:#07173F;font-family:Overpass,Arial,sans-serif}.closing .earth{position:absolute;width:1160px;height:1160px;left:875px;top:-60px;opacity:.88;mask-image:linear-gradient(90deg,transparent,#000 16%)}.closing .shade{position:absolute;inset:0;background:linear-gradient(90deg,#07173F 0%,#07173F 35%,rgba(7,23,63,.82) 48%,rgba(7,23,63,.12) 72%),linear-gradient(0deg,rgba(7,23,63,.92) 0%,rgba(7,23,63,0) 45%)}.closing h1{position:absolute;left:106px;top:125px;font-size:90px;line-height:1.12;font-weight:700;letter-spacing:-1px;margin:0}.closing .summary{position:absolute;left:106px;top:285px;font-size:35px;line-height:1.5;width:1240px}.closing .next{color:#EAFE07;font-size:53px;font-weight:700;margin:25px 0 60px}.closing .url{font-size:35px;color:#FFFFFF;text-decoration:underline;text-underline-offset:8px}.closing .team{position:absolute;left:106px;top:735px;font-size:28px;color:#DCE5F3}.closing .credit{position:absolute;left:106px;top:805px;font-size:25px;line-height:1.5;color:#B6C6E2;width:1260px}.badge{width:155px;height:28px;line-height:28px;text-align:center;background:#0e1521f0;color:#fff;font:600 18px/28px Arial;border-radius:4px}`;
const timeline=JSON.parse(fs.readFileSync(path.join(old,'timeline.json')));
const revision=path.join(root,'assembly-v2/voice-revision-1');
timeline.lines[4]={text:'We apply cross-satellite corrections — a first step toward comparable records.',start:22.5,duration:4.8};
timeline.captions=timeline.captions.slice(0,-2).concat([{start:22.68,end:24.8,text:'We apply cross-satellite corrections —'},{start:25,end:27.3,text:'a first step toward comparable records.'}]);
const manuscript=fs.readFileSync(new URL('./demo-video.md',import.meta.url),'utf8').split('```text\n')[1].split('```')[0].trim().split(/\n\s*\n/).map(s=>s.trim());
if(manuscript.length!==timeline.lines.length || manuscript.some((line,i)=>line!==timeline.lines[i].text))throw new Error('Narration changed: update the selected speech and caption timings before rendering.');
await withChrome(async({send,evaluate,capture})=>{
 await send('Emulation.setDefaultBackgroundColorOverride',{color:{r:0,g:0,b:0,a:0}});
 const render=async(name,body,extra='')=>{
  const f=path.join(out,name+'.html');fs.writeFileSync(f,`<!doctype html><html lang="en"><meta charset="utf-8"><title>Lama full-frame assembly</title><style>${css}${extra}</style><body>${body}</body></html>`);
  await send('Page.navigate',{url:pathToFileURL(f).href});await sleep(80);await evaluate('Promise.all([document.fonts.ready,...[...document.images].map(i=>i.decode())])');await capture(path.join(out,name+'.png'));
 };
 for(const s of scenes){
  let body='<div class="panel"></div>';
  if(['overview','counts','color'].includes(s.kind)){
   body+=crop(s.kind==='overview'?'overview':'color',984,83,500,90,1265,112,1.21);
   body+='<div class="title" style="top:295px">NASA FIRMS · last 24 hours</div>';
   body+=crop('color',1153,485,327,64,1270,400,1.8);
   body+='<div class="note">MODIS and VIIRS detections<br>shown in the same view</div>';
  }else if(s.kind==='harmonization'){
   body='<div class="panel" style="left:1030px"></div><div class="title" style="left:1070px;width:800px">Cross-satellite correction</div>';
   body+=crop('harmonization',998,369,470,55,1070,295,1.65);
   body+='<div class="note" style="left:1070px;top:490px;width:790px">Experimental model · one day of training data<br>First harmonization step</div>';
  }else if(s.kind==='geometry'){
   body+='<div class="title">Estimated viewing geometry</div>';
   body+=crop('context',998,350,470,122,1268,280,1.28);
  }else if(s.kind==='land'){
   body+='<div class="title">Land cover</div>';
   body+=crop('land',998,214,470,25,1268,310,1.28);
  }else if(s.kind==='weather'){
   body+='<div class="title">Weather at acquisition</div>';
   body+=crop('context',998,504,470,136,1268,270,1.28);
  }
  body+='<div class="source">NASA FIRMS · recorded application view<small>NASA GIBS · CelesTrak · EOX / Copernicus Sentinel-2 · Extremum<br>Independent project. Not affiliated with NASA.</small></div>';
  if(s.kind==='closing')body='<div class="closing"><img class="earth" src="'+pathToFileURL(closingEarth).href+'" alt="Recorded application globe"><div class="shade"></div><h1>Earth Fire Calendar</h1><div class="summary">Experimental cross-satellite corrections<div class="next">First harmonization step</div><div class="url">avbelkin.github.io/nasa-space-apps-sg</div></div><div style="position:absolute;left:106px;right:106px;top:680px;height:1px;background:#34466A"></div><div class="team">Team Plush · Alexey Belkin &amp; Viktoriia Naiman</div><div class="credit">Fire-detection data: NASA FIRMS<br>Earth imagery: EOX / Copernicus Sentinel-2<br>Independent project. Not affiliated with or endorsed by NASA.</div></div>';
  await render(s.name+'-overlay',body);
 }
 await send('Emulation.setDeviceMetricsOverride',{width:1920,height:160,deviceScaleFactor:1,mobile:false});
 for(let i=0;i<timeline.captions.length;i++)await render('cap-'+i,`<div class="subtitle">${timeline.captions[i].text}</div>`,'html,body{height:160px;background:#00ff00}');
 await render('cap-empty','','html,body{height:160px;background:#00ff00}');
 await send('Emulation.setDeviceMetricsOverride',{width:155,height:28,deviceScaleFactor:1,mobile:false});
 await render('watermark','<div class="badge">AI-generated</div>','html,body{width:155px;height:28px}');
});
const motion=path.join(root,'presenter-v6/lama-motion-green.mp4');
const keyboard=writeKeyboardFoley(path.join(out,'keyboard.wav'));
fs.writeFileSync(path.join(out,'keyboard-provenance.json'),JSON.stringify(keyboard,null,2)+'\n');
if(process.argv.includes('--layout-only')){
 for(const [name,source,x] of [['hello','overview',50],['weather','context',480],['closing','harmonization',1340]])ff(['-i',path.join(out,source+'-source.png'),'-i',path.join(out,name+'-overlay.png'),'-i',path.join(root,'presenter-v6/lama-character-green.png'),'-i',path.join(out,'watermark.png'),'-filter_complex',`[0:v]scale=1920:1080,setsar=1[bg];[bg][1:v]overlay=0:0[ui];[2:v]crop=840:941:366:0,format=rgba,colorkey=0x00ff00:0.3:0.08,despill=green,scale=448:502[host];[ui][host]overlay=${x}:425:format=auto[h];[h][3:v]overlay=${x+140}:860[v]`,'-map','[v]','-frames:v','1',path.join(out,name+'-layout.png')]);
 console.log(JSON.stringify({layouts:['hello-layout.png','weather-layout.png','closing-layout.png'],keyboard:path.join(out,'keyboard.wav')}));
 process.exit(0);
}
if(!fs.existsSync(motion))throw new Error('Collect and inspect the presenter-v6 motion before rendering.');
for(const s of scenes){
 if(process.argv.includes('--reuse-reviewed-scenes') && s.kind!=='closing'){
  const previous=path.join(root,'assembly-v3',s.name+'.mp4');
  if(!fs.existsSync(previous))throw new Error('Missing reviewed scene: '+previous);
  fs.copyFileSync(previous,path.join(out,s.name+'.mp4'));continue;
 }
 const count=Math.round((s.end-s.start)*30);
 const controls=['overview','counts','color'].includes(s.kind);
 const uiFilter=controls ? '[0:v]split=2[raw][control];[raw]scale=1920:1080,setsar=1,fps=30,tpad=stop_mode=clone:stop_duration=29[screen];[screen][1:v]overlay=0:0[ui0];[control]crop=500:90:984:83,scale=605:108,setsar=1,fps=30,tpad=stop_mode=clone:stop_duration=29[c];[ui0][c]overlay=1265:112[ui];' : '[0:v]scale=1920:1080,setsar=1,fps=30,tpad=stop_mode=clone:stop_duration=29[screen];[screen][1:v]overlay=0:0[ui];';
 ff(['-ss',String(s.seek),'-t',String(s.sourceDuration),'-i',file(s.time),'-loop','1','-framerate','30','-i',path.join(out,s.name+'-overlay.png'),
  '-ss',String(s.hostStart),'-t',String(s.hostDuration),'-i',motion,'-loop','1','-framerate','30','-i',path.join(out,'watermark.png'),
  '-filter_complex',uiFilter+
   '[2:v]fps=30,crop=640:720:280:0,format=rgba,colorkey=0x00ff00:0.30:0.08,despill=green,scale=448:504,tpad=stop_mode=clone:stop_duration=29[host];'+
   `[ui][host]overlay=x='${s.x}':y=425:format=auto[withhost];[withhost][3:v]overlay=x='${s.x}+140':y=860,setsar=1,format=yuv420p[v]`,
  '-map','[v]','-frames:v',String(count),...enc,path.join(out,s.name+'.mp4')]);
}
const concat=(names,name)=>{const f=path.join(out,name+'.txt');fs.writeFileSync(f,names.map(n=>`file '${n}'`).join('\n')+'\n');ff(['-f','concat','-safe','0','-i',f,'-c','copy',path.join(out,name+'.mp4')]);};
concat([path.join(old,'opening.mp4'),...scenes.map(s=>path.join(out,s.name+'.mp4'))],'picture');
const parts=[];let frame=0;let serial=0;
for(const c of [...timeline.captions,{start:29,end:29}]){
 const a=Math.round(c.start*30),b=Math.min(870,Math.round(c.end*30));
 for(const [from,to,name] of [[frame,a,'cap-empty'],[a,b,'cap-'+timeline.captions.indexOf(c)]]){
  if(to<=from)continue;const f=path.join(out,`cap-part-${serial++}.mp4`);ff(['-loop','1','-framerate','30','-i',path.join(out,name+'.png'),'-frames:v',String(to-from),...enc,f]);parts.push(f);
 }frame=b;
}
concat(parts,'captions');
const voiceFiles=JSON.parse(fs.readFileSync(path.join(old,'audio-files.json'))).slice(0,4).map(a=>path.join(old,a.file)).concat([path.join(revision,'voice-1.mp3')]);
const voiceStarts=[2.3,6.3,12,17,22.5];
ff([...voiceFiles.flatMap(f=>['-i',f]),'-f','lavfi','-t','29','-i','anullsrc=r=48000:cl=stereo','-filter_complex',voiceFiles.map((_,i)=>`[${i}:a]aresample=48000,adelay=${voiceStarts[i]*1000}:all=1[a${i}]`).join(';')+';'+voiceFiles.map((_,i)=>`[a${i}]`).join('')+'[5:a]amix=inputs=6:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[m]','-map','[m]','-t','29','-c:a','pcm_s16le',path.join(out,'narration.wav')]);
ff(['-i',path.join(out,'narration.wav'),'-i',path.join(out,'keyboard.wav'),'-filter_complex','[0:a][1:a]amix=inputs=2:duration=first:normalize=0[m]','-map','[m]','-t','29','-c:a','pcm_s16le',path.join(out,'mix.wav')]);
const comment='Review assembly with revised cross-satellite-correction ending. First-second keyboard foley is original deterministic local synthesis, with no third-party audio sample or generative API. Closing globe reuses the real presentation capture (EOxCloudless 2016, CC BY 4.0), darkened under text. Synthetic narration: ElevenLabs Eleven v4, Flicker (piI8Kku0DcvcL6TTSeQt), via OpenRouter; no pitch or tempo shift. Voice accepted by the team. Real full-frame UI recordings by Alexey; recorded data crops enlarged without changing values. Plush cutout and character images edited/generated using the OpenAI ChatGPT image tool (exact model undisclosed). Generated desk background and character motion: Google Veo 3.1 Lite via OpenRouter. The photographic plush enters the monitor before the cartoon appears. Local compositing and assembly: OpenAI Codex. No phoneme lip sync. NASA FIRMS data; independent project, no NASA endorsement. Current screen-recording basemap: EOxCloudless 2016 (modified Copernicus Sentinel data 2016 & 2017), CC BY 4.0. Earlier imagery on the physical monitor: EOxCloudless 2025, CC BY-NC-SA 4.0; publication review remains open.';
ff(['-i',path.join(out,'picture.mp4'),'-i',path.join(out,'captions.mp4'),'-i',path.join(out,'mix.wav'),'-filter_complex','[1:v]format=rgba,colorkey=0x00ff00:0.3:0.08[sub];[0:v][sub]overlay=0:920,format=yuv420p[v]','-map','[v]','-map','2:a','-c:v','h264_videotoolbox','-b:v','14M','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-frames:v','870','-t','29','-metadata','title=Earth Fire Calendar — Lama full-frame review','-metadata',`comment=${comment}`,'-movflags','+faststart',path.join(out,'lama-fullscreen.mp4')]);
const srtTime=t=>{const ms=Math.round(t*1000);return `00:00:${String(Math.floor(ms/1000)).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`;};
fs.writeFileSync(path.join(out,'subtitles.srt'),timeline.captions.map((c,i)=>`${i+1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join('\n'));
fs.writeFileSync(path.join(out,'timeline.json'),JSON.stringify({...timeline,scenes,ui:'Full-frame recordings with enlarged actual right-panel excerpts; source aspect fitted to 1920x1080 without edge cropping',motion:'presenter-v6; non-looping excerpts plus endpoint holds',keyboard,closingBackground:'Presentation cover-sensors.png; real application globe, darkened for legibility' },null,2)+'\n');
fs.writeFileSync(path.join(out,'render-report.json'),JSON.stringify({probe:probe(path.join(out,'lama-fullscreen.mp4')),limitations:['Live-to-composite plush pose cut remains visible','No exact phoneme lip sync','Recorded UI aspect is fitted to 16:9 without cutting edges','Source clips pause after their selected action completes'],apiCallsFromRenderer:0},null,2)+'\n');
fs.writeFileSync(path.join(out,'review.html'),'<!doctype html><html lang="en"><meta charset="utf-8"><title>Lama full-frame review</title><style>body{background:#101b28;color:white;font:18px Arial;margin:30px auto;max-width:1440px}video{width:100%}a{color:#9ed5ff}</style><h1>Lama — full-frame interface</h1><video controls src="lama-fullscreen.mp4"></video><p>Approved Flicker voice. Alexey’s real recordings, including expanded weather and the cross-satellite correction. Revised final narration reflects a first harmonization step. Restrained head turns and steps; no repeating wave. Keyboard foley during the first second; a real application globe behind the PDF-styled closing card.</p><p><a href="lama-fullscreen.mp4">MP4</a> · <a href="subtitles.srt">English subtitles</a></p></html>');
console.log(JSON.stringify({file:path.join(out,'lama-fullscreen.mp4'),frames:870,duration:29}));
