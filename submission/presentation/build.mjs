import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import crypto from 'node:crypto';
import {renderVectorPdf} from './render-pdf.mjs';
import {patchPptx} from './patch-pptx.mjs';

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
const {FontLibrary,Canvas}=artifactRequire('skia-canvas');
const measure=new Canvas(1,1).getContext('2d');
const fontDir=path.join(root,'assets/fonts');
FontLibrary.use('Fira Sans Black',[path.join(fontDir,'FiraSans-Black.ttf')]);
FontLibrary.use('Fira Sans',[path.join(fontDir,'FiraSans-Bold.ttf')]);
FontLibrary.use('Overpass',['Regular','Bold','Italic'].map(s=>path.join(fontDir,`Overpass-${s}.ttf`)));

const T=JSON.parse(await fs.readFile(path.join(root,'design-tokens.json'),'utf8'));
const C=T.colors,S=T.sizes;
const sourcePath=path.join(root,'demo-slides.md');
const source=await fs.readFile(sourcePath,'utf8');
const sections=[...source.matchAll(/^## Slide (\d+) — (.+)\n([\s\S]*?)(?=^## Slide |$(?![\s\S]))/gm)].map(m=>({number:+m[1],title:m[2],markdown:m[3].trim(),blocks:m[3].trim().split(/\n\s*\n/)}));
if(sections.length!==7) throw Error(`Expected seven source slides, got ${sections.length}`);
const snapshot=JSON.parse(await fs.readFile(path.join(root,'assets/data/firms-snapshot-2026-11-15T0836Z.json'),'utf8'));
const version=process.env.DECK_VERSION || 'scaffold-r6';
const buildDir=path.join(root,'.build',version);
const out=path.join(root,'output');
await fs.mkdir(buildDir,{recursive:true});
await fs.mkdir(out,{recursive:true});
const pres=Presentation.create({slideSize:T.slide});
pres.theme.defaultFont=T.fonts.body;
pres.theme.colorScheme={name:'Earth Fire Calendar',themeColors:{accent1:C.blue,accent2:C.yellow,accent3:C.neonBlue,accent4:C.electric,accent5:C.deep,accent6:C.white,bg1:C.white,bg2:C.deep,tx1:C.deep,tx2:C.white,dk1:C.deep,dk2:C.electric,lt1:C.white,lt2:C.white,hlink:C.electric,folHlink:C.electric}};
const content=[];
const scenes=[];

function plain(md){return md.replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').replace(/\*\*/g,'').replace(/\*/g,'').replace(/^[-\d.]+\s+/gm,'').replace(/\s+/g,' ').trim();}
function runs(md){
 md=md.replaceAll(' · ','\u00a0·\u00a0');
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
function rect(s,x,y,w,h,fill,line='none',name='rule',record=true){
 if(record)s._scene.elements.push({kind:'rect',name,x,y,w,h,fill:fill==='none'?'transparent':fill,line});
 return s.shapes.add({name,geometry:'rect',position:{left:x,top:y,width:w,height:h},fill,line:{fill:line,style:'solid',width:line==='none'?0:1}});
}
function text(s,md,x,y,w,h,size=S.body,opt={}){
 const sh=s.shapes.add({name:opt.name || 'copy',geometry:'textbox',position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0,style:'solid'}});
 sh.text.style={fontSize:size,typeface:opt.font || T.fonts.body,color:opt.color || (s._dark?C.white:C.deep),bold:opt.bold || false,autoFit:'none',wrap:'square',insets:0,verticalAlignment:'top',alignment:opt.align || 'left',lineSpacing:1.18};
 sh.text=[{runs:runs(md)}];
 for(const link of md.matchAll(/\[([^\]]+)\]\([^)]+\)/g))sh.text.get(link[1]).color=opt.color || (s._dark?C.white:C.deep);
 s._scene.elements.push({kind:'text',name:opt.name||'copy',x,y,w,h,size,font:opt.font||T.fonts.body,color:opt.color||(s._dark?C.white:C.deep),bold:opt.bold||false,align:opt.align,runs:runs(md)});
 content.push({slide:s._number,text:plain(md),position:{x,y,w,h},size});
 return sh;
}
function title(s,md){text(s,md,80,60,1440,90,S.heading,{font:T.fonts.heading,bold:true,name:'headline'});}
function base(index,dark=false){
 const s=pres.slides.add(); s._number=index+1;s._dark=dark;s._scene={number:index+1,dark,elements:[]};scenes.push(s._scene);
 s.background.fill=dark?{type:'gradient',gradientKind:'linear',angleDeg:45,stops:[{offset:0,color:C.electric},{offset:100000,color:C.deep}]}:C.white;
 const sec=sections[index];
 s.speakerNotes.text=`${sec.title}\n\n${sec.markdown}\n\nSources: submission/presentation/demo-slides.md; submission/presentation/assets/brand/README.md. Independent project. Not affiliated with or endorsed by NASA.`;
 if(index>0)text(s,String(index+1).padStart(2,'0'),1475,index===1?860:850,45,30,S.small,{color:dark?C.white:C.deep,align:'right',name:'slide-number'});
 return s;
}
async function pattern(s,name,x,y,w,h){
 // Opacity is applied as an editable image fill; the original PNG is untouched.
 const img=s.images.add({blob:new Uint8Array(await fs.readFile(path.join(root,'assets/brand/patterns',`${name}.png`))),contentType:'image/png',alt:`Decorative ${name} pattern from supplied references`,position:{left:x,top:y,width:w,height:h},fit:'cover'});
 s._scene.elements.push({kind:'image',path:path.join(root,'assets/brand/patterns',`${name}.png`),x,y,w,h,alt:`Decorative ${name} pattern`,fit:'cover',opacity:T.patternOpacity});
 // Same full-slide gradient screens the pattern back without a rectangular seam.
 const screen=Math.round((1-T.patternOpacity)*100);
 rect(s,0,0,T.slide.width,T.slide.height,{type:'gradient',gradientKind:'linear',angleDeg:45,stops:[{offset:0,color:`${C.electric}/${screen}`},{offset:100000,color:`${C.deep}/${screen}`}]},'none','pattern-screen',false);
 return img;
}
async function image(s,file,x,y,w,h,alt,opt={}){
 const filePath=path.join(root,file);s.images.add({blob:new Uint8Array(await fs.readFile(filePath)),contentType:'image/png',alt,fit:opt.fit||'contain',geometry:opt.circle?'ellipse':'rect',position:{left:x,top:y,width:w,height:h}});
 s._scene.elements.push({kind:'image',path:filePath,x,y,w,h,alt,fit:opt.fit||'contain',circle:opt.circle});
}
function textHeight(md,width,size){
 let used=0,lines=1;
 for(const r of runs(md)){
  const value=typeof r==='string'?r:r.run,style=typeof r==='string'?{}:r.style||{};
  measure.font=`${style.italic?'italic ':''}${style.bold?'700':'400'} ${size}px Overpass`;
  for(const word of value.split(/(\s+)/)){
   if(word.includes('\n')){lines+=word.split('\n').length-1;used=0;continue;}
   const w=measure.measureText(word).width;
   if(used+w>width&&word.trim()){lines++;used=w;}else used+=w;
  }
 }return Math.ceil(lines*size*1.18)+6;
}
function flowList(s,items,x,y,w,size=S.body,gap=22){
 for(const item of items){const h=textHeight(item,w-28,size);text(s,'•',x,y,20,30,size);text(s,item,x+28,y,w-28,h,size);y+=h+gap;}return y;
}

// 1 — cover, all current text retained.
{
 const s=base(0,true),b=sections[0].blocks;
 await pattern(s,'orbits',0,0,1600,900);
 await image(s,'assets/screenshots/cover-sensors.png',910,125,610,610,'Earth Fire Calendar globe with live detections coloured by sensor. This is a later snapshot than the count comparison on slide 2.',{circle:true,fit:'cover'});
 text(s,sections[0].title.replace(' Calendar','\nCalendar'),80,70,800,208,S.cover,{font:T.fonts.display,name:'headline'});
 text(s,b[0],80,300,760,110,S.lead,{color:C.yellow});
 text(s,b[1],80,436,760,116,S.body);
 text(s,b[2],80,592,760,60,S.small);
 text(s,b[3],80,672,760,40,S.small);
 text(s,b[4],80,741,760,95,S.small);
 s.speakerNotes.text+='\nCover screenshot metadata: assets/screenshots/capture-scenes.json. Data: NASA FIRMS. Basemap: EOX / Copernicus Sentinel-2. This later illustration does not represent the count snapshot on slide 2.';
}
// 2 — data comparison, grounded in the saved 08:36 UTC snapshot.
{
 const s=base(1),b=sections[1].blocks; title(s,sections[1].title);
 text(s,b[0],80,169,1440,90,S.lead);
 const list=b[1].split('\n').map(t=>t.replace(/^- /,''));
 text(s,list[2],80,268,1440,70,S.body);
 text(s,list[0],80,382,610,112,S.body);
 text(s,list[1],80,538,610,148,S.body);
 const alt='Worldwide NASA FIRMS detections in the same 24 hours: MODIS 8,127; VIIRS 79,349. Snapshot 15 November 2026, 08:36 UTC. Fixed value axis from 0 to 100,000.';
 s.charts.add('bar',{position:{left:760,top:350,width:760,height:310},categories:['VIIRS','MODIS'],series:[{name:'Worldwide detections in 24 hours',values:[snapshot.viirsCount,snapshot.modisCount],fill:C.electric}],barOptions:{direction:'bar',grouping:'clustered',gapWidth:110},hasLegend:false,chartFill:'none',plotAreaFill:'none',chartLine:{fill:'none',width:0,style:'solid'},xAxis:{visible:true,textStyle:{typeface:T.fonts.body,fontSize:S.body,fill:C.deep},line:{fill:'none',width:0,style:'solid'}},yAxis:{visible:false,min:0,max:100000,majorGridlines:null},dataLabels:{showValue:true,position:'outEnd',numberFormatCode:'#,##0',textStyle:{typeface:T.fonts.body,fontSize:S.lead,bold:true,fill:C.deep}}});
 s._scene.elements.push({kind:'chart',x:760,y:350,w:760,h:310,modis:snapshot.modisCount,viirs:snapshot.viirsCount,max:100000,alt});
 text(s,b[3],790,686,730,35,S.small);
 rect(s,0,755,1600,100,C.deep);
 text(s,b[2],80,775,1440,75,S.body,{color:C.white});
 s.speakerNotes.text+='\nChart values: submission/presentation/assets/data/firms-snapshot-2026-11-15T0836Z.json. Native editable chart. Fresh screenshots intentionally not used for this historical count comparison.';
}
// 3–7: completed visual framework; original copy and team placeholders retained.
{
 const s=base(2,true),b=sections[2].blocks;title(s,sections[2].title);
 text(s,b[0],80,174,1440,110,S.lead);
 let y=326;for(const line of b[1].split('\n')){const h=textHeight(line,470,S.body);text(s,line,80,y,470,h,S.body);y+=h+38;}
 await image(s,'assets/screenshots/regional-sensors.png',620,292,900,510,'Northern India with fire groups coloured by sensor. The application legend is shown below.',{fit:'cover'});
 await image(s,'assets/screenshots/sensor-key.png',620,807,560,60,'Application colour key: both sensors, single detection, MODIS only and VIIRS only.');
 text(s,b[2],80,765,470,80,S.body);
}
{
 const s=base(3),b=sections[3].blocks;title(s,sections[3].title);
 const items=b[0].split('\n').map(t=>t.replace(/^- /,''));
 flowList(s,items,80,182,560,S.small,23);
 await image(s,'assets/screenshots/pinned-summary.png',710,178,810,100,'Header of the selected real detection group, with location and land cover.');
 await image(s,'assets/screenshots/pinned-timeline.png',710,297,810,235,'Twenty-four-hour satellite timeline. Negative passes are estimated, not FIRMS observations.');
 text(s,'**Estimated observation geometry**',710,548,810,35,S.small);
 await image(s,'assets/screenshots/pinned-geometry.png',710,591,810,190,'Estimated observation geometry for the pinned group, with separate MODIS and VIIRS columns.');
 rect(s,80,768,560,71,C.deep);text(s,b[1],96,778,528,61,S.small,{color:C.white});
}
{
 const s=base(4,true),b=sections[4].blocks;title(s,sections[4].title);
 await image(s,'assets/screenshots/step-modis.png',80,183,430,195,'MODIS detections over the selected region before switching sensors.',{fit:'cover'});
 text(s,b[0],80,393,430,97,S.small);
 await image(s,'assets/screenshots/step-viirs.png',80,506,430,195,'VIIRS detections in the same region and live snapshot.',{fit:'cover'});
 text(s,b[1],80,718,430,98,S.small);
 text(s,b[2],580,183,940,112,S.body);
 await image(s,'assets/screenshots/pinned-summary.png',580,321,940,110,'The real group whose sensor observations are compared below.');
 text(s,'**Estimated observation geometry**',580,457,940,36,S.small);
 await image(s,'assets/screenshots/pinned-geometry.png',580,503,940,270,'Pinned MODIS and VIIRS observation columns enlarged for comparison.');
 text(s,b[3],580,807,940,36,S.small,{color:C.yellow});
}
{
 const s=base(5),b=sections[5].blocks;title(s,sections[5].title);
 text(s,b[0],80,174,1440,111,S.body);
 text(s,'**Planned pipeline:**',80,302,1440,35,S.small);
 const steps=b[1].replace(/^\*\*Planned pipeline:\*\* /,'').split(' → ');
 steps.forEach((v,i)=>{const x=80+i*244;rect(s,x,349,220,149,C.deep);text(s,v,x+14,367,192,124,S.small,{color:C.white});if(i<steps.length-1)text(s,'→',x+222,402,24,32,S.small,{color:C.electric});});
 text(s,b[2],80,548,710,40,S.body);flowList(s,b[3].split('\n').map(t=>t.replace(/^- /,'')),80,600,710,S.body,19);
 text(s,b[4],885,548,635,182,S.body);
 text(s,b[5],885,758,635,83,S.body,{bold:true});
}
{
 const s=base(6,true),b=sections[6].blocks;title(s,sections[6].title);
 text(s,b[0],80,177,1440,112,S.lead);
 text(s,b[1],80,318,1440,79,S.lead,{color:C.yellow});
 // Separate link and separator shapes keep visible spacing in both exporters.
 const links=[...b[2].matchAll(/\[[^\]]+\]\([^)]+\)/g)].map(m=>m[0]);
 text(s,'**Links:**',80,433,85,52,S.body);
 text(s,links[0],165,433,50,52,S.body);
 text(s,'·',230,433,12,52,S.body);
 text(s,links[1],260,433,65,52,S.body);
 text(s,'·',335,433,12,52,S.body);
 text(s,links[2],365,433,200,52,S.body);
 rect(s,80,518,1440,1,C.blue);
 text(s,b[3],80,550,1440,188,S.small);
 text(s,b[4],80,764,1440,50,S.small);
 text(s,b[5],80,829,1340,30,S.small);
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
await patchPptx({candidate,scenes,modules});
const {finalizePresentation}=await import(pathToFileURL(path.join(skill,'container_tools/artifact_tool_utils.mjs')));
const final=path.join(out,`earth-fire-calendar-${version}.pptx`);
const receipt=await finalizePresentation({workspaceDir:root,candidatePath:candidate,finalPath:final,pythonExecutable:python,integrityValidatorPath:path.join(skill,'container_tools/inspect_presentation_package_integrity.py'),layoutValidatorPath:path.join(skill,'container_tools/inspect_presentation_layout_geometry.py'),layoutArgs:['--expected-slide-size-emu','15240000,8572500','--validate-heading-fit'],explicitTotalSlideCount:7,requiredNativeChartOwnerSlides:[2],requiredNativeTableOwnerSlides:[],materializeLiteralChartWorkbooks:true,fontPolicy:{basis:'design',families:['Fira Sans Black','Fira Sans','Overpass']},verifyArtifactToolImport:true,receiptPath:path.join(buildDir,'validation.json')});
console.log('PPTX finalized',final);
for(let i=0;i<pres.slides.items.length;i++) {
 const image=await pres.export({slide:pres.slides.items[i],format:'png',scale:2});
 await fs.writeFile(path.join(buildDir,`slide-${i+1}.png`),new Uint8Array(await image.arrayBuffer()));
 const layout=await pres.slides.items[i].export({format:'layout'});
 await fs.writeFile(path.join(buildDir,`slide-${i+1}.layout.json`),await layout.text());
}
// Both exports consume the same layout. Chromium embeds the original font
// subsets and produces real text, vectors and clickable URI annotations.
const pdfResult=await renderVectorPdf({root,version,slides:scenes,tokens:T,buildDir,out});
const sharp=require('sharp');
const thumbnails=await Promise.all(scenes.map(async(s,i)=>({input:await sharp(path.join(buildDir,`pdf-slide-${i+1}.png`)).resize(800,450).png().toBuffer(),left:20+(i%2)*820,top:20+Math.floor(i/2)*470})));
await sharp({create:{width:1660,height:1900,channels:3,background:'#E8EDF4'}}).composite(thumbnails).png().toFile(path.join(out,`earth-fire-calendar-${version}-overview.png`));
await fs.writeFile(path.join(buildDir,'content.json'),JSON.stringify(content,null,2));
await fs.writeFile(path.join(buildDir,'scene.json'),JSON.stringify(scenes,null,2));
await fs.writeFile(path.join(buildDir,'pdf-export.json'),JSON.stringify(pdfResult,null,2));
await fs.writeFile(path.join(buildDir,'source.json'),JSON.stringify({path:'demo-slides.md',sha256:crypto.createHash('sha256').update(source).digest('hex'),checkpoint:version,slideCount:7},null,2));
console.log('Rendered seven slides, PDF and overview; source copy coverage complete.');
