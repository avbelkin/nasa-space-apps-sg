import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {withChrome, sleep} from './chrome.mjs';

const root=path.resolve(process.argv[2]);
const out=path.join(root,'jump-v1');
const presenter=path.join(root,'presenter-v2');
const ff=args=>execFileSync('/opt/homebrew/bin/ffmpeg',['-v','error','-y',...args],{stdio:'inherit'});
const enc=['-c:v','h264_videotoolbox','-b:v','12M','-pix_fmt','yuv420p','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-an'];
await withChrome(async({send,evaluate,capture})=>{
  await send('Page.navigate',{url:pathToFileURL(path.join(presenter,'hello.html')).href});await sleep(100);
  await evaluate("Promise.all([...document.images].map(i=>i.decode())).then(()=>document.querySelector('.subtitle')?.remove())");
  await capture(path.join(out,'landing-stage.png'));
  await send('Emulation.setDefaultBackgroundColorOverride',{color:{r:0,g:0,b:0,a:0}});
  const html=path.join(out,'effects.html');
  fs.writeFileSync(html,'<!doctype html><html lang="en"><meta charset="utf-8"><style>html,body{margin:0;background:transparent;width:1920px;height:1080px;overflow:hidden}.label{position:absolute;left:50px;top:45px;padding:9px 15px;border-radius:6px;background:#10202de8;color:#fff;font:24px Arial,sans-serif}.glow{position:absolute;left:1440px;top:310px;width:240px;height:240px;background:radial-gradient(circle,#fff 0, #c9fbff 12%,#38cbff99 28%,transparent 67%);border-radius:50%}</style><body><div class="label">AI-generated transition</div><div class="glow"></div></body></html>');
  await send('Page.navigate',{url:pathToFileURL(html).href});await sleep(100);
  await evaluate("document.querySelector('.glow').style.display='none'");await capture(path.join(out,'label.png'));
  await evaluate("document.querySelector('.glow').style.display='block';document.querySelector('.label').style.display='none'");await capture(path.join(out,'glow.png'));
});
ff(['-i',path.join(root,'intro-no-face.mp4'),'-frames:v','15',...enc,path.join(out,'live.mp4')]);
// The generated take jumped out of frame; only its empty ending is reused.
// A controlled trajectory makes the existing living character enter the monitor.
const u='min(max((t-0.18)/0.82,0),1)';
const scale=`(1.1*(1-${u})+0.07*${u})`;
const squash='(1-0.12*sin(min(t/0.18,1)*PI))';
ff(['-loop','1','-framerate','30','-i',path.join(out,'clean-end.png'),'-i',path.join(presenter,'lama-motion-green.mp4'),'-loop','1','-framerate','30','-i',path.join(out,'glow.png'),'-loop','1','-i',path.join(out,'label.png'),'-filter_complex',`[0:v]scale=1920:1080,setsar=1[bg];[1:v]fps=30,crop=1060:720:0:0,format=rgba,colorkey=0x00ff00:0.30:0.10,despill=green,scale=w='trunc(1060*${scale}/2)*2':h='trunc(720*${scale}*${squash}/2)*2':eval=frame,fade=t=out:st=1.0:d=0.07:alpha=1[host];[bg][host]overlay=x='1200+360*${u}-630*${scale}':y='1030-600*${u}-120*sin(PI*${u})-705*${scale}*${squash}':eval=frame:format=auto[jump];[2:v]format=rgba,fade=t=in:st=0.88:d=0.08:alpha=1,fade=t=out:st=1.0:d=0.2:alpha=1[glow];[jump][glow]overlay=0:0:format=auto[j];[j][3:v]overlay=0:0,format=yuv420p[v]`,'-map','[v]','-frames:v','36',...enc,path.join(out,'flight.mp4')]);
ff(['-loop','1','-framerate','30','-i',path.join(out,'landing-stage.png'),'-i',path.join(presenter,'lama-motion-green.mp4'),'-loop','1','-i',path.join(presenter,'watermark.png'),'-filter_complex',"[1:v]fps=30,crop=1060:720:0:0,format=rgba,colorkey=0x00ff00:0.30:0.10,despill=green[key];[key][2:v]overlay=510:555:format=auto[host];[0:v][host]overlay=x=-170:y='205-if(lt(t,0.4),150*pow(1-t/0.4,2),0)':eval=frame:format=auto,format=yuv420p,setsar=1[v]",'-map','[v]','-frames:v','54',...enc,path.join(out,'landing.mp4')]);
fs.writeFileSync(path.join(out,'concat.txt'),['live','flight','landing'].map(n=>`file '${n}.mp4'`).join('\n')+'\n');
ff(['-f','concat','-safe','0','-i',path.join(out,'concat.txt'),'-c','copy','-metadata','title=Lama physical jump concept — silent','-metadata','comment=Silent character-motion concept, not final narration or submission. AI image: OpenAI ChatGPT image tool. AI character animation and reconstructed empty desk: Google Veo 3.1 Lite via OpenRouter. The raw jump take missed the screen; its empty ending is reused as a generated background for a controlled composited jump. Transformation to the cartoon character occurs before takeoff. Real opening and application imagery. Assembly: OpenAI Codex.','-movflags','+faststart',path.join(out,'jump-pilot.mp4')]);
console.log(JSON.stringify({file:path.join(out,'jump-pilot.mp4'),frames:105,duration:3.5,silent:true}));
