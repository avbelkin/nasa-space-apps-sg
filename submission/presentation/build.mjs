import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import crypto from 'node:crypto';

// Uses existing managed dependencies only. No package or font installation.
const root=import.meta.dirname;
const modules=process.env.RUNTIME_NODE_MODULES;
const skill=process.env.PRESENTATIONS_SKILL;
const python=process.env.RUNTIME_PYTHON;
if(!modules || !skill || !python) throw Error('Set RUNTIME_NODE_MODULES, PRESENTATIONS_SKILL and RUNTIME_PYTHON; see README.');
const require=createRequire(path.join(modules,'__deck__.cjs'));
const artifactEntry=require.resolve('@oai/artifact-tool');
const {Presentation,PresentationFile}=await import(pathToFileURL(artifactEntry));
const artifactRequire=createRequire(artifactEntry);
const {FontLibrary}=artifactRequire('skia-canvas');
const fontDir=path.join(root,'assets/fonts');
FontLibrary.use('Fira Sans Black',[path.join(fontDir,'FiraSans-Black.ttf')]);
FontLibrary.use('Fira Sans',[path.join(fontDir,'FiraSans-Bold.ttf')]);
FontLibrary.use('Overpass',['Regular','Bold','Italic'].map(s=>path.join(fontDir,`Overpass-${s}.otf`)));

const T=JSON.parse(await fs.readFile(path.join(root,'design-tokens.json'),'utf8'));
const C=T.colors;
const sourcePath=path.join(root,'../docs/demo-slides.md');
const source=await fs.readFile(sourcePath,'utf8');
const sections=[...source.matchAll(/^## Slide (\d+) — (.+)\n([\s\S]*?)(?=^## Slide |$(?![\s\S]))/gm)].map(m=>({number:+m[1],title:m[2],markdown:m[3].trim(),blocks:m[3].trim().split(/\n\s*\n/)}));
if(sections.length!==7) throw Error(`Expected seven source slides, got ${sections.length}`);
const snapshot=JSON.parse(await fs.readFile(path.join(root,'../assets/firms-snapshot-2026-11-15T0836Z.json'),'utf8'));
const version=process.env.DECK_VERSION || 'checkpoint-01-r3';
const buildDir=path.join(root,'.build',version);
const out=path.join(root,'output');
await fs.mkdir(buildDir,{recursive:true});
await fs.mkdir(out,{recursive:true});
const pres=Presentation.create({slideSize:T.slide});
pres.theme.defaultFont=T.fonts.body;
pres.theme.colorScheme={name:'Earth Fire Calendar',themeColors:{accent1:C.blue,accent2:C.yellow,accent3:C.neonBlue,accent4:C.electric,accent5:C.deep,accent6:C.white,bg1:C.white,bg2:C.deep,tx1:C.deep,tx2:C.white,dk1:C.deep,dk2:C.electric,lt1:C.white,lt2:C.white,hlink:C.electric,folHlink:C.electric}};
const content=[];

function plain(md){return md.replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').replace(/\*\*/g,'').replace(/\*/g,'').replace(/^[-\d.]+\s+/gm,'').replace(/\s+/g,' ').trim();}
function runs(md){
 const result=[]; const re=/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|\*[^*]+\*)/g; let at=0;
 for(const m of md.matchAll(re)) {
  if(m.index>at) result.push(md.slice(at,m.index));
  const t=m[0];
  if(t.startsWith('**')) result.push({run:t.slice(2,-2),style:{bold:true}});
  else if(t.startsWith('*')) result.push({run:t.slice(1,-1),style:{italic:true}});
  else {const link=t.match(/^\[([^\]]+)\]\(([^)]+)\)$/);result.push({run:link[1],link:{uri:link[2],isExternal:true}});}
  at=m.index+t.length;
 }
 if(at<md.length) result.push(md.slice(at));
 return result;
}
function rect(s,x,y,w,h,fill,line='none',name='rule'){
 return s.shapes.add({name,geometry:'rect',position:{left:x,top:y,width:w,height:h},fill,line:{fill:line,style:'solid',width:line==='none'?0:1}});
}
function text(s,md,x,y,w,h,size=25,opt={}){
 const sh=s.shapes.add({name:opt.name || 'copy',geometry:'textbox',position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0,style:'solid'}});
 sh.text.style={fontSize:size,typeface:opt.font || T.fonts.body,color:opt.color || (s._dark?C.white:C.deep),bold:opt.bold || false,autoFit:'none',wrap:'square',insets:0,verticalAlignment:'top',alignment:opt.align || 'left',lineSpacing:1.18};
 sh.text=[{runs:runs(md)}];
 for(const link of md.matchAll(/\[([^\]]+)\]\([^)]+\)/g))sh.text.get(link[1]).color=opt.color || (s._dark?C.white:C.deep);
 content.push({slide:s._number,text:plain(md),position:{x,y,w,h},size});
 return sh;
}
function title(s,md){text(s,md,80,60,1440,90,52,{font:T.fonts.heading,bold:true,name:'headline'});}
function base(index,dark=false){
 const s=pres.slides.add(); s._number=index+1;s._dark=dark;
 s.background.fill=dark?{type:'gradient',gradientKind:'linear',angleDeg:45,stops:[{offset:0,color:C.electric},{offset:100000,color:C.deep}]}:C.white;
 const sec=sections[index];
 s.speakerNotes.text=`CHECKPOINT 01: visual review. Slides 1–2 are the first designed block; slides 3–7 are editable layout scaffolds. Copy is unchanged.\n\nSOURCE: submission/docs/demo-slides.md at 633c0c3\n\n${sec.title}\n\n${sec.markdown}\n\nDesign references: submission/assets/README.md and Space Apps Brand Guide. Independent project; no NASA or Space Apps logos.\n`;
 if(index>0)text(s,String(index+1).padStart(2,'0'),1475,850,45,26,18,{color:dark?C.white:C.deep,align:'right',name:'slide-number'});
 return s;
}
async function pattern(s,name,x,y,w,h){
 // Opacity is applied as an editable image fill; the original PNG is untouched.
 const img=s.images.add({blob:new Uint8Array(await fs.readFile(path.join(root,'../assets/space-apps-brand/patterns',`${name}.png`))),contentType:'image/png',alt:`Decorative ${name} pattern from supplied references`,position:{left:x,top:y,width:w,height:h},fit:'cover'});
 // Same full-slide gradient screens the pattern back without a rectangular seam.
 rect(s,0,0,T.slide.width,T.slide.height,{type:'gradient',gradientKind:'linear',angleDeg:45,stops:[{offset:0,color:`${C.electric}/75`},{offset:100000,color:`${C.deep}/75`}]},'none','pattern-screen');
 return img;
}
function mediaSlot(s,x,y,w,h,label){
 rect(s,x,y,w,h,'none',s._dark?'#2E96F5':'#9AAACA','media-slot');
 text(s,label,x+24,y+h/2-24,w-48,48,20,{color:s._dark?C.white:C.electric,align:'center',name:'review-media-placeholder'});
}

// 1 — cover, all current text retained.
{
 const s=base(0,true),b=sections[0].blocks;
 await pattern(s,'orbits',0,0,1600,900);
 text(s,'01',1475,850,45,26,18,{color:C.white,align:'right',name:'cover-slide-number'});
 s.images.add({blob:new Uint8Array(await fs.readFile(path.join(root,'assets/screenshots/cover-globe.png'))),contentType:'image/png',alt:'Earth Fire Calendar globe with live NASA FIRMS detections; capture date in notes.',geometry:'ellipse',fit:'cover',position:{left:910,top:110,width:610,height:610}});
 text(s,sections[0].title.replace(' Calendar','\nCalendar'),80,70,800,218,86,{font:T.fonts.display,name:'headline'});
 text(s,b[0],80,300,760,110,34,{color:C.yellow});
 text(s,b[1],80,446,750,116,27);
 text(s,b[2],80,600,780,78,24);
 text(s,b[3],80,698,1360,40,23);
 text(s,b[4],80,765,1360,70,22);
 s.speakerNotes.text+='\nCover screenshot metadata: assets/screenshots/cover-globe.json. This current illustration does not represent the earlier count snapshot on slide 2.';
}
// 2 — data comparison, grounded in the saved 08:36 UTC snapshot.
{
 const s=base(1),b=sections[1].blocks; title(s,sections[1].title);
 text(s,b[0],80,169,1440,86,29);
 const list=b[1].split('\n').map(t=>t.replace(/^- /,''));
 text(s,list[0],80,298,640,116,27);
 text(s,list[1],80,450,640,153,27);
 const chart=s.charts.add('bar',{position:{left:770,top:270,width:750,height:350},categories:['VIIRS','MODIS'],series:[{name:'Worldwide detections in 24 hours',values:[snapshot.viirsCount,snapshot.modisCount],fill:C.electric}],barOptions:{direction:'bar',grouping:'clustered',gapWidth:110},hasLegend:false,chartFill:'none',plotAreaFill:'none',chartLine:{fill:'none',width:0,style:'solid'},xAxis:{visible:true,textStyle:{typeface:'Overpass',fontSize:25,color:C.deep},line:{fill:'none',width:0,style:'solid'},majorTickMark:'none',minorTickMark:'none'},yAxis:{visible:false,minimumScale:0,maximumScale:100000,majorGridlines:{fill:'none',width:0,style:'solid'}},dataLabels:{showValue:true,position:'outEnd',numberFormatCode:'#,##0',textStyle:{typeface:'Overpass',fontSize:38,bold:true,color:C.deep}}});
 text(s,list[2],80,633,1440,70,25);
 rect(s,0,723,1600,107,C.deep);
 text(s,b[2],80,742,1440,73,27,{color:C.white});
 text(s,b[3],80,850,1300,30,19);
 s.speakerNotes.text+='\nChart values: submission/assets/firms-snapshot-2026-11-15T0836Z.json. Native editable chart. Fresh screenshots intentionally not used for this historical count comparison.';
}
// 3–7 — editable composition scaffolds for subsequent review blocks.
{
 const s=base(2,true),b=sections[2].blocks;title(s,sections[2].title);
 text(s,b[0],80,174,1440,120,31);
 const items=b[1].split('\n');
 items.forEach((line,i)=>{text(s,String(i+1).padStart(2,'0'),80,350+i*125,65,55,36,{color:C.yellow,font:T.fonts.heading,bold:true});text(s,line.replace(/^\d+\. /,''),172,351+i*125,650,106,27);});
 mediaSlot(s,900,340,620,350,'[Regional comparison screenshot]');
 text(s,b[2],900,729,620,80,25);
}
{
 const s=base(3),b=sections[3].blocks;title(s,sections[3].title);
 const items=b[0].split('\n').map(t=>t.replace(/^- /,''));
 let y=181; const heights=[100,116,131,131,116];
 items.forEach((v,i)=>{text(s,v,80,y,800,heights[i],24);y+=heights[i]+7;});
 mediaSlot(s,950,182,570,484,'[Pinned timeline + observation conditions]');
 rect(s,950,701,570,132,C.deep);
 text(s,b[1],976,714,518,106,23,{color:C.white});
}
{
 const s=base(4,true),b=sections[4].blocks;title(s,sections[4].title);
 for(let i=0;i<3;i++) {
  const x=80+i*492;
  text(s,String(i+1).padStart(2,'0'),x,190,80,65,50,{font:T.fonts.heading,bold:true,color:C.yellow});
  mediaSlot(s,x,280,456,280,['[Globe screenshot]','[Same view: VIIRS]','[Pinned MODIS + VIIRS columns]'][i]);
  text(s,b[i],x,607,456,150,27);
 }
 text(s,b[3],80,803,1360,38,25,{color:C.yellow});
}
{
 const s=base(5),b=sections[5].blocks;title(s,sections[5].title);
 text(s,b[0],80,174,1440,111,28);
 rect(s,80,326,1440,152,C.deep);
 text(s,b[1],109,350,1382,107,27,{color:C.white});
 text(s,b[2],80,522,710,50,27);
 const items=b[3].split('\n').map(t=>t.replace(/^- /,''));
 items.forEach((v,i)=>text(s,v,105,576+i*77,695,72,24));
 text(s,b[4],885,528,635,178,25);
 text(s,b[5],885,737,635,81,25,{bold:true});
}
{
 const s=base(6,true),b=sections[6].blocks;title(s,sections[6].title);
 text(s,b[0],80,177,1440,112,32);
 text(s,b[1],80,318,1440,79,29,{color:C.yellow});
 text(s,b[2],80,433,1440,52,28);
 rect(s,80,518,1440,1,C.blue);
 text(s,b[3],80,550,1440,188,21);
 text(s,b[4],80,764,1440,50,21);
 text(s,b[5],80,829,1340,30,20);
}

// Verify that every source paragraph and title is represented on its slide.
const coverage=sections.map(sec=>{
 const rendered=content.filter(x=>x.slide===sec.number).map(x=>x.text).join(' ');
 const expected=[sec.title,...sec.blocks.flatMap(b=>b.split('\n').map(line=>line.replace(/^(?:- |\d+\. )/,'')))];
 const missing=expected.filter(v=>!rendered.includes(plain(v)));
 return {slide:sec.number,missing};
});
await fs.writeFile(path.join(buildDir,'copy-coverage.json'),JSON.stringify(coverage,null,2));
if(coverage.some(x=>x.missing.length)) throw Error(`Source copy missing: ${JSON.stringify(coverage)}`);
const candidate=path.join(buildDir,'candidate.pptx');
await (await PresentationFile.exportPptx(pres)).save(candidate);
const {finalizePresentation}=await import(pathToFileURL(path.join(skill,'container_tools/artifact_tool_utils.mjs')));
const final=path.join(out,`earth-fire-calendar-${version}.pptx`);
const receipt=await finalizePresentation({workspaceDir:root,candidatePath:candidate,finalPath:final,pythonExecutable:python,integrityValidatorPath:path.join(skill,'container_tools/inspect_presentation_package_integrity.py'),layoutValidatorPath:path.join(skill,'container_tools/inspect_presentation_layout_geometry.py'),layoutArgs:['--expected-slide-size-emu','15240000,8572500','--validate-heading-fit'],explicitTotalSlideCount:7,requiredNativeChartOwnerSlides:[2],requiredNativeTableOwnerSlides:[],materializeLiteralChartWorkbooks:true,fontPolicy:{basis:'design',families:['Fira Sans Black','Fira Sans','Overpass']},verifyArtifactToolImport:true,receiptPath:path.join(buildDir,'validation.json')});
console.log('PPTX finalized',final);
for(let i=0;i<pres.slides.items.length;i++) {
 const image=await pres.export({slide:pres.slides.items[i],format:'png',scale:1});
 await fs.writeFile(path.join(buildDir,`slide-${i+1}.png`),new Uint8Array(await image.arrayBuffer()));
 const layout=await pres.slides.items[i].export({format:'layout'});
 await fs.writeFile(path.join(buildDir,`slide-${i+1}.layout.json`),await layout.text());
}
// A visual review PDF built from the exact checked renders avoids a missing
// standard-font alias in this managed Artifact Tool runtime's PDF exporter.
// Native text, chart data and hyperlinks remain editable in the PPTX.
const {PDFDocument}=require('pdf-lib');
const pdf=await PDFDocument.create();
pdf.setTitle('Earth Fire Calendar — checkpoint 01');
pdf.setSubject('Visual review proof; use the accompanying PPTX to edit.');
for(let i=1;i<=7;i++){
 const page=pdf.addPage([1200,675]);
 const img=await pdf.embedPng(await fs.readFile(path.join(buildDir,`slide-${i}.png`)));
 page.drawImage(img,{x:0,y:0,width:1200,height:675});
}
await fs.writeFile(path.join(out,`earth-fire-calendar-${version}.pdf`),await pdf.save());
const montage=await pres.export({format:'png',montage:{columns:2,slideWidth:800,padding:20,gap:20,background:'#E8EDF4'}});
await fs.writeFile(path.join(out,`earth-fire-calendar-${version}-overview.png`),new Uint8Array(await montage.arrayBuffer()));
await fs.writeFile(path.join(buildDir,'content.json'),JSON.stringify(content,null,2));
await fs.writeFile(path.join(buildDir,'source.json'),JSON.stringify({path:'../docs/demo-slides.md',sha256:crypto.createHash('sha256').update(source).digest('hex'),checkpoint:version,slideCount:7},null,2));
console.log('Rendered seven slides, PDF and overview; source copy coverage complete.');
