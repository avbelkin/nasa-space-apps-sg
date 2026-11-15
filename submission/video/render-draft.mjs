import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {withChrome, sleep} from './chrome.mjs';

const root = path.resolve(process.argv[2]);
const out = path.join(root, 'draft');
const team = process.env.LAMA_TEAM_NAME || '[Team name pending]';
fs.mkdirSync(out, {recursive:true});
const ff = args => execFileSync('/opt/homebrew/bin/ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {stdio:'inherit'});
const probe = file => JSON.parse(execFileSync('/opt/homebrew/bin/ffprobe', ['-v','error','-show_streams','-show_format','-of','json',file], {encoding:'utf8'}));
const esc = text => String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const url = file => pathToFileURL(path.join(root, file)).href;
const image = (file, cls, style='') => `<img src="${url(file)}" class="${cls}" style="${style}" alt="">`;
const style = `*{box-sizing:border-box}html,body{margin:0;width:1920px;height:1080px;overflow:hidden;font-family:Arial,sans-serif;color:white}body{background:#101821}.ui{position:absolute;left:16px;top:24px;width:1600px;height:900px;border-radius:12px}.subtitle{position:absolute;left:48px;top:940px;width:1490px;font-size:40px;line-height:44px;text-align:center;font-weight:600}.pill{display:inline-block;border:1px solid #577184;background:#101821ed;border-radius:16px;padding:13px 22px;font-size:27px;line-height:36px}.caption{position:absolute;left:52px;top:70px}.inset{position:absolute;left:300px;top:550px;border:3px solid #ffb461;border-radius:18px;overflow:hidden;background:#e2e8f0;box-shadow:0 12px 60px #000b}.crop{overflow:hidden;position:relative}.crop img{position:absolute;max-width:none}.end{position:absolute;left:160px;top:270px;width:1310px;padding:50px 55px;background:#101821f0;border:1px solid #597285;border-radius:24px}.end h1{font-size:74px;letter-spacing:-2px;margin:0 0 22px}.end .next{font-size:45px;color:#ffbc76;margin:0 0 30px}.end .link{font-size:34px;color:#d5e9fa}.end .credits{font-size:25px;line-height:34px;margin-top:30px;color:#c8d7e0}.detail{position:absolute;left:310px;top:300px;width:1080px;padding:30px;background:#f8fafc;color:#142231;border:3px solid #ffb461;border-radius:20px;box-shadow:0 12px 60px #000b}.detail h2{font-size:36px;margin:0 0 22px}.detail img{display:block;width:100%;height:auto}.intro-title{position:absolute;left:58px;top:120px;width:535px}.intro-title h1{font-size:72px;line-height:1.04;letter-spacing:-2px;margin:0 0 32px}.intro-title .challenge{font-size:32px;line-height:1.24;color:#ecf5fb}.intro-title .team{font-size:28px;margin-top:32px;color:#ffbc76}.accent{width:90px;height:7px;background:#ffbc76;margin-bottom:30px}`;

const subtitles = [
  'I’m Lama. I help Alexey. Mostly.',
  'Same planet. Same day.<br>But MODIS and VIIRS see different hotspots.',
  'Earth Fire Calendar compares their detections<br>using NASA FIRMS data.',
  'We add context: viewing angle,<br>land cover, and weather.',
  'Next, we’ll use this evidence<br>to make their records comparable.',
];
const base = (file, subtitle) => image(`ui/${file}`, 'ui') + `<div class="subtitle">${subtitle}</div>`;
const magnify = (file, x, y, w, h, scale) => `<div class="inset"><div class="crop" style="width:${w*scale}px;height:${h*scale}px"><img src="${url(`ui/${file}`)}" style="width:${1920*scale}px;height:${1080*scale}px;left:${-x*scale}px;top:${-y*scale}px"></div></div>`;
const scenes = [
  {name:'hello',frames:105,body:base('03-all-sensors.png',subtitles[0])},
  {name:'modis',frames:90,body:base('01-modis.png',subtitles[1])+`<div class="caption pill">NASA FIRMS · last 24 h · global detections</div>`+magnify('01-modis.png',1670,605,110,94,2.8)},
  {name:'viirs',frames:90,body:base('02-viirs.png',subtitles[1])+`<div class="caption pill">NASA FIRMS · last 24 h · global detections</div>`+magnify('02-viirs.png',1783,605,110,94,2.8)},
  {name:'together',frames:165,body:base('03-all-sensors.png',subtitles[2])+`<div class="caption pill">Both sensors, one view</div>`},
];
for (const [name, title] of [['geometry','Estimated viewing geometry'],['land','Land cover'],['weather','Weather at acquisition']]) {
  const file = `ui/05-${name}.png`;
  const available = fs.existsSync(path.join(root,file));
  let detail;
  if (available && name==='geometry') {
    // Keep the actual column header and first row (Sat. off-nadir), excluding other rows.
    detail = `<div style="height:60px;overflow:hidden">${image(file,'')}</div>`;
  } else if (available && name==='weather') detail = `<div style="height:150px;overflow:hidden">${image(file,'')}</div><p style="font-size:23px;margin:18px 0 0">Model-derived conditions at acquisition</p>`;
  else if (available) detail = image(file,'');
  else detail = `<p style="font-size:32px;line-height:1.5">Final interface capture pending</p>`;
  scenes.push({name,frames:60,body:base('03-all-sensors.png',subtitles[3])+`<div class="detail"><h2>${title}</h2>${detail}</div>`});
}
scenes.push({name:'closing',frames:180,body:base('03-all-sensors.png',subtitles[4])+`<div class="end"><h1>Earth Fire Calendar</h1><p class="next">Next: harmonization</p><div class="link">avbelkin.github.io/nasa-space-apps-sg</div><div class="credits">Fire-detection data: NASA FIRMS<br>Independent project. Not affiliated with or endorsed by NASA.</div></div>`});

await withChrome(async ({send, evaluate, capture}) => {
  const render = async (name, body, extra='') => {
    const file = path.join(out,`${name}.html`);
    fs.writeFileSync(file,`<!doctype html><html lang="en"><meta charset="utf-8"><title>${esc(name)}</title><style>${style}${extra}</style><body>${body}</body></html>`);
    await send('Page.navigate',{url:pathToFileURL(file).href});
    await sleep(100);
    await evaluate(`Promise.all([...document.images].map(i=>i.decode()))`);
    await capture(path.join(out,`${name}.png`));
  };
  for(const scene of scenes) await render(scene.name,scene.body);
  await send('Emulation.setDefaultBackgroundColorOverride',{color:{r:0,g:0,b:0,a:0}});
  await render('intro-overlay',`<div class="intro-title"><div class="accent"></div><h1>Earth Fire<br>Calendar</h1><div class="challenge">Harmonization of MODIS and VIIRS Hot Spots</div><div class="team">${esc(team)}</div></div>`,`body{background:transparent}.intro-title{text-shadow:0 2px 16px #000b}`);
  await send('Emulation.setDeviceMetricsOverride',{width:255,height:340,deviceScaleFactor:1,mobile:false});
  await render('lama-marked',image('lama-presenter.png','figure')+'<div class="watermark">AI-edited image</div>',`html,body{width:255px;height:340px;background:transparent}.figure{width:255px;height:340px;position:absolute;left:0;top:0}.watermark{position:absolute;left:26px;top:284px;width:205px;height:28px;line-height:28px;text-align:center;font-size:22px;color:white;background:#101821e8;border-radius:5px}`);
});

const encoder = ['-c:v','h264_videotoolbox','-b:v','12M','-pix_fmt','yuv420p','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-an'];
ff(['-i',path.join(root,'intro-centered.mp4'),'-i',path.join(out,'intro-overlay.png'),'-filter_complex','[0:v][1:v]overlay=0:0,setsar=1[v]','-map','[v]','-frames:v','42',...encoder,path.join(out,'intro.mp4')]);
ff(['-sseof','-0.034','-i',path.join(root,'intro-centered.mp4'),'-frames:v','1',path.join(out,'intro-last.png')]);
// Eight frames push into the lower monitor, four blurred frames, then six frames reveal the UI.
ff(['-loop','1','-framerate','30','-i',path.join(out,'intro-last.png'),'-vf',"zoompan=z='1+7*min(on/7,1)':x='1130-iw/zoom/2':y='416-ih/zoom/2':d=12:s=1920x1080:fps=30,gblur=sigma=8:enable='gte(n,8)',setsar=1",'-frames:v','12',...encoder,path.join(out,'push.mp4')]);
ff(['-loop','1','-framerate','30','-i',path.join(out,'hello.png'),'-vf','fade=t=in:st=0:d=0.166667:color=white,setsar=1','-frames:v','6',...encoder,path.join(out,'reveal.mp4')]);

let mainTime=0;
for(const scene of scenes) {
  const start=mainTime; mainTime+=scene.frames/30;
  const t=`(t+${start})`;
  // The watermark is baked into the sprite, so it follows every movement over the feet.
  const x=`1640+if(lt(${t},0.4),20*pow(1-${t}/0.4,2),0)-if(between(${t},9.5,15),16*sin((${t}-9.5)/5.5*PI),0)`;
  const y=`700-if(lt(${t},0.55),32*sin(${t}/0.55*PI),0)-if(between(${t},9.5,10),12*sin((${t}-9.5)/0.5*PI),0)`;
  ff(['-loop','1','-framerate','30','-i',path.join(out,`${scene.name}.png`),'-loop','1','-framerate','30','-i',path.join(out,'lama-marked.png'),'-filter_complex',`[0:v][1:v]overlay=x='${x}':y='${y}':eval=frame,setsar=1[v]`,'-map','[v]','-frames:v',String(scene.frames),...encoder,path.join(out,`${scene.name}.mp4`)]);
}
const parts=['intro','push','reveal',...scenes.map(x=>x.name)];
fs.writeFileSync(path.join(out,'concat.txt'),parts.map(n=>`file '${n}.mp4'`).join('\n')+'\n');
ff(['-f','concat','-safe','0','-i',path.join(out,'concat.txt'),'-c','copy',path.join(out,'picture.mp4')]);

const voiceDir=path.join(out,'elevenlabs');
const starts=[2,5.5,11.5,17,23];
const windows=[3.5,6,5.5,6,6];
const audioInputs=[];const filters=[];const voiceStats=[];
for(let i=0;i<5;i++) {
  const file=path.join(voiceDir,`voice-${i+1}.mp3`);
  if(!fs.existsSync(file)) throw new Error(`Missing ElevenLabs narration: ${file}; picture.mp4 is ready.`);
  const duration=Number(probe(file).format.duration);
  const speed=Math.max(1,duration/(windows[i]-0.15));
  if(speed>1.15) throw new Error(`Voice line ${i+1} needs a new take, not excessive acceleration: ${duration}s`);
  voiceStats.push({line:i+1,duration,speed,start:starts[i]});
  audioInputs.push('-i',file);
  filters.push(`[${i}:a]aresample=48000,atempo=${speed},afade=t=out:st=${Math.max(0,duration/speed-0.03)}:d=0.03,adelay=${starts[i]*1000}:all=1[a${i}]`);
}
audioInputs.push('-f','lavfi','-t','29','-i','anullsrc=r=48000:cl=stereo');
audioInputs.push('-f','lavfi','-t','0.42','-i','anoisesrc=color=pink:amplitude=0.13:sample_rate=48000');
filters.push('[6:a]highpass=f=700,lowpass=f=3500,afade=t=in:d=0.1,afade=t=out:st=0.12:d=0.3,adelay=1450:all=1[sfx]');
filters.push('[a0][a1][a2][a3][a4][5:a][sfx]amix=inputs=7:duration=longest:normalize=0,alimiter=limit=0.85:level=false[a]');
ff([...audioInputs,'-filter_complex',filters.join(';'),'-map','[a]','-t','29','-c:a','pcm_s16le',path.join(out,'mix.wav')]);
const comment='AI-edited character image: OpenAI ChatGPT. English narration: ElevenLabs Eleven v4, Will, synthesized through OpenRouter. Script and production assisted by OpenAI Codex. Live footage and app captures are real recordings. Review draft with replaceable interface captures.';
ff(['-i',path.join(out,'picture.mp4'),'-i',path.join(out,'mix.wav'),'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','192k','-t','29','-metadata',`comment=${comment}`,'-metadata','title=Earth Fire Calendar — Lama demo draft','-movflags','+faststart',path.join(out,'lama-draft.mp4')]);
const report={createdAt:new Date().toISOString(),team,frames:870,voice:voiceStats,scenes:scenes.map(({body,...s})=>s),probe:probe(path.join(out,'lama-draft.mp4'))};
fs.writeFileSync(path.join(out,'render-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({file:path.join(out,'lama-draft.mp4'),duration:report.probe.format.duration,voice:voiceStats}));
