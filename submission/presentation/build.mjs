import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import crypto from 'node:crypto';
import {renderVectorPdf} from './render-pdf.mjs';
import {patchPptx} from './patch-pptx.mjs';
import {drawFirstBlock} from './first-block.mjs';
import {drawRemainingSlides} from './remaining-slides.mjs';

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
FontLibrary.use('Overpass',['Regular','Bold','Italic'].map(s=>path.join(fontDir,`Overpass-${s}.ttf`)));

const T=JSON.parse(await fs.readFile(path.join(root,'design-tokens.json'),'utf8'));
const C=T.colors,S=T.sizes;
const sourcePath=path.join(root,'demo-slides.md');
const source=await fs.readFile(sourcePath,'utf8');
const sections=[...source.matchAll(/^## Slide (\d+) — (.+)\n([\s\S]*?)(?=^## Slide |$(?![\s\S]))/gm)].map(m=>({number:+m[1],title:m[2],markdown:m[3].trim(),blocks:m[3].trim().split(/\n\s*\n/)}));
if(sections.length!==7) throw Error(`Expected seven source slides, got ${sections.length}`);
const snapshot=JSON.parse(await fs.readFile(path.join(root,'assets/data/firms-snapshot-2026-11-15T0836Z.json'),'utf8'));
const firstBlock=process.env.DECK_SCOPE==='first-block';
const slideCount=firstBlock?2:7;
const version=process.env.DECK_VERSION || (firstBlock?'direction-r11':'complete-r11');
const evidence=JSON.parse(await fs.readFile(path.join(root,'assets/evidence/manifest.json'),'utf8'));
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
function title(s,md){text(s,md,88,60,1424,90,S.heading,{font:T.fonts.body,bold:true,name:'headline'});}
function base(index,dark=false){
 const s=pres.slides.add(); s._number=index+1;s._dark=dark;s._scene={number:index+1,dark,elements:[]};scenes.push(s._scene);
 s.background.fill=dark?C.deep:C.white;s._scene.background=s.background.fill;
 const sec=sections[index];
 s.speakerNotes.text=`${sec.title}\n\n${sec.markdown}\n\nSources: submission/presentation/demo-slides.md; submission/presentation/assets/brand/README.md. Independent project. Not affiliated with or endorsed by NASA.`;
 return s;
}
function dot(s,x,y,d,color){s.shapes.add({name:'sensor-key',geometry:'ellipse',position:{left:x,top:y,width:d,height:d},fill:color,line:{fill:C.deep,width:0.6,style:'solid'}});s._scene.elements.push({kind:'dot',x,y,w:d,h:d,color});}
async function image(s,file,x,y,w,h,alt,opt={}){
 const optimized=evidence.images.find(e=>e.original===path.basename(file));
 const filePath=optimized?path.join(root,'assets/evidence',optimized.file):path.join(root,file);s.images.add({blob:new Uint8Array(await fs.readFile(filePath)),contentType:filePath.endsWith('.jpg')?'image/jpeg':'image/png',alt,fit:opt.fit||'contain',geometry:opt.circle?'ellipse':'rect',position:{left:x,top:y,width:w,height:h}});
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

await drawFirstBlock({base,text,rect,image,sections,snapshot,T});
if(!firstBlock)await drawRemainingSlides({base,title,text,rect,dot,image,sections,T,textHeight,flowList});

// Verify that every source paragraph and title is represented on its slide.
const coverage=sections.slice(0,slideCount).map(sec=>{
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
const receipt=await finalizePresentation({workspaceDir:root,candidatePath:candidate,finalPath:final,pythonExecutable:python,integrityValidatorPath:path.join(skill,'container_tools/inspect_presentation_package_integrity.py'),layoutValidatorPath:path.join(skill,'container_tools/inspect_presentation_layout_geometry.py'),layoutArgs:['--expected-slide-size-emu','15240000,8572500','--validate-heading-fit'],explicitTotalSlideCount:slideCount,requiredNativeChartOwnerSlides:[2],requiredNativeTableOwnerSlides:[],materializeLiteralChartWorkbooks:true,fontPolicy:{basis:'design',families:['Overpass']},verifyArtifactToolImport:true,receiptPath:path.join(buildDir,'validation.json')});
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
await sharp({create:{width:1660,height:20+Math.ceil(slideCount/2)*470,channels:3,background:'#E8EDF4'}}).composite(thumbnails).png().toFile(path.join(out,`earth-fire-calendar-${version}-overview.png`));
await fs.writeFile(path.join(buildDir,'content.json'),JSON.stringify(content,null,2));
await fs.writeFile(path.join(buildDir,'scene.json'),JSON.stringify(scenes,null,2));
await fs.writeFile(path.join(buildDir,'pdf-export.json'),JSON.stringify(pdfResult,null,2));
await fs.writeFile(path.join(buildDir,'source.json'),JSON.stringify({path:'demo-slides.md',sha256:crypto.createHash('sha256').update(source).digest('hex'),checkpoint:version,slideCount},null,2));
console.log(`Rendered ${slideCount} slides, PDF and overview; source copy coverage complete.`);
