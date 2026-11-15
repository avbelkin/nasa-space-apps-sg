import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';

// Repair exporter omissions before finalization so its checks/hash cover the repairs.
export async function patchPptx({candidate,scenes,modules}) {
 const require=createRequire(path.join(modules,'__patch__.cjs'));
 const JSZip=require('jszip');
 const {xml2js,js2xml}=require('xml-js');
 const zip=await JSZip.loadAsync(await fs.readFile(candidate));
 const list=v=>v===undefined?[]:Array.isArray(v)?v:[v];
 for(const scene of scenes){
  const name=`ppt/slides/slide${scene.number}.xml`;
  // Preserve mixed run/break order: compact XML serialization reorders it.
  const doc=xml2js(await zip.file(name).async('string'),{compact:false,captureSpacesBetweenElements:true});
  const child=(node,name)=>node.elements?.find(e=>e.name===name);
  const tree=child(child(child(doc,'p:sld'),'p:cSld'),'p:spTree');
  const pictures=tree.elements.filter(e=>e.name==='p:pic');
  const assets=scene.elements.filter(e=>e.kind==='image');
  if(pictures.length!==assets.length)throw Error(`Slide ${scene.number}: image/alt order mismatch`);
  pictures.forEach((picture,i)=>{
   const a=child(child(picture,'p:nvPicPr'),'p:cNvPr').attributes;
   a.name=`Illustration ${i+1}: ${assets[i].alt}`;a.descr=assets[i].alt;
  });
  const charts=scene.elements.filter(e=>['chart','mini-bar'].includes(e.kind));
  const frames=tree.elements.filter(e=>e.name==='p:graphicFrame');
  if(charts.length!==frames.length)throw Error(`Slide ${scene.number}: chart/alt order mismatch`);
  frames.forEach((frame,i)=>{
   const a=child(child(frame,'p:nvGraphicFramePr'),'p:cNvPr').attributes;
   a.name='MODIS and VIIRS detection comparison';a.descr=charts[i].alt;
  });
  zip.file(name,js2xml(doc,{compact:false}));
 }
 for(const name of Object.keys(zip.files).filter(n=>/^ppt\/(?:slides\/)?charts\/chart\d+\.xml$/.test(n))){
  const doc=xml2js(await zip.file(name).async('string'),{compact:true});
  const plot=doc['c:chartSpace']['c:chart']['c:plotArea'];
  for(const axis of list(plot['c:valAx'])){
   // c:scaling child order follows CT_Scaling (orientation, max, min).
   const old=axis['c:scaling']||{};
   axis['c:scaling']={...(old['c:logBase']?{'c:logBase':old['c:logBase']}:{}),...(old['c:orientation']?{'c:orientation':old['c:orientation']}:{}),'c:max':{_attributes:{val:'100000'}},'c:min':{_attributes:{val:'0'}}};
  }
  zip.file(name,js2xml(doc,{compact:true}));
 }
 const core=xml2js(await zip.file('docProps/core.xml').async('string'),{compact:true});
 const p=core['cp:coreProperties']||core.coreProperties;
 p['dc:title']={_text:'Earth Fire Calendar'};
 p['dc:creator']={_text:'Earth Fire Calendar'};
 p[core.coreProperties?'lastModifiedBy':'cp:lastModifiedBy']={_text:'Earth Fire Calendar'};
 p['dc:subject']={_text:'Harmonization of MODIS and VIIRS Hot Spots'};
 p['dc:description']={_text:'Independent project presentation. Not affiliated with or endorsed by NASA.'};
 zip.file('docProps/core.xml',js2xml(core,{compact:true}));
 await fs.writeFile(candidate,await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));
}
