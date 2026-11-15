import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const root=import.meta.dirname;
if(!process.env.RUNTIME_NODE_MODULES) throw Error('Set RUNTIME_NODE_MODULES to an existing managed runtime.');
const require=createRequire(path.join(process.env.RUNTIME_NODE_MODULES,'__verify__.cjs'));
const JSZip=require('jszip');
const {xml2js}=require('xml-js');
const {PDFDocument}=require('pdf-lib');
const version=process.env.DECK_VERSION || 'checkpoint-01-r3';
const pptx=path.join(root,'output',`earth-fire-calendar-${version}.pptx`);
const pptxBytes=await fs.readFile(pptx);
const zip=await JSZip.loadAsync(pptxBytes);
const source=await fs.readFile(path.join(root,'../docs/demo-slides.md'),'utf8');
const snapshot=JSON.parse(await fs.readFile(path.join(root,'../assets/firms-snapshot-2026-11-15T0836Z.json'),'utf8'));
const normalize=s=>s.replace(/\s+/g,' ').trim();
const visible=s=>normalize(s.replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').replace(/\*/g,'').replace(/^(?:- |\d+\. )/gm,''));
function texts(xml){
 const out=[];
 function walk(e){
  if(e.name==='a:t')out.push((e.elements || []).filter(x=>x.type==='text').map(x=>x.text).join(''));
  else if(e.name==='a:br' || e.name==='a:tab')out.push(' ');
  else {for(const c of e.elements || [])walk(c);if(e.name==='a:p')out.push(' ');}
 }
 walk(xml2js(xml,{compact:false,captureSpacesBetweenElements:true}));return out;
}
const sections=[...source.matchAll(/^## Slide (\d+) — (.+)\n([\s\S]*?)(?=^## Slide |$(?![\s\S]))/gm)];
const reports=[];
for(const section of sections){
 const number=+section[1];
 const xml=await zip.file(`ppt/slides/slide${number}.xml`).async('string');
 const actual=normalize(texts(xml).join(''));
 const expected=[section[2],...section[3].trim().split('\n').filter(x=>x.trim())].map(visible);
 const missing=expected.filter(s=>!actual.includes(s));
 if(missing.length)throw Error(`Slide ${number}: missing or changed source text: ${JSON.stringify(missing)}`);
 reports.push({slide:number,sourceLines:expected.length,wording:'preserved'});
}
const slideCount=Object.keys(zip.files).filter(n=>/^ppt\/slides\/slide\d+\.xml$/.test(n)).length;
if(slideCount!==7)throw Error(`Expected 7 slides, got ${slideCount}`);
const charts=Object.keys(zip.files).filter(n=>/^ppt\/(?:slides\/)?charts\/chart\d+\.xml$/.test(n));
if(charts.length!==1)throw Error(`Expected 1 native chart, got ${charts.length}`);
const chartXml=await zip.file(charts[0]).async('string');
for(const value of [snapshot.modisCount,snapshot.viirsCount])if(!chartXml.includes(`<c:v>${value}</c:v>`))throw Error(`Chart missing count ${value}`);
const workbooks=Object.keys(zip.files).filter(n=>/^ppt\/embeddings\/.*\.xlsx$/.test(n));
if(workbooks.length!==1)throw Error('Expected one editable embedded chart workbook');
const workbook=await JSZip.loadAsync(await zip.file(workbooks[0]).async('nodebuffer'));
const worksheet=await workbook.file('xl/worksheets/sheet1.xml').async('string');
for(const value of [snapshot.modisCount,snapshot.viirsCount])if(!worksheet.includes(`<v>${value}</v>`))throw Error(`Workbook missing count ${value}`);
const pdfPath=path.join(root,'output',`earth-fire-calendar-${version}.pdf`);
const pdf=await PDFDocument.load(await fs.readFile(pdfPath));
if(pdf.getPageCount()!==7)throw Error('Review PDF page count differs from PPTX');
const result={checkpoint:version,slides:reports,slideCount,pdfPages:pdf.getPageCount(),chart:'native with embedded workbook',counts:{modis:snapshot.modisCount,viirs:snapshot.viirsCount},sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),pptxSha256:crypto.createHash('sha256').update(pptxBytes).digest('hex'),independentReviewerStatus:'pending, not launched',limitations:['Visual proof PDF is raster, not searchable.','Five intentional screenshot placeholders on slides 3–5.','Fonts supplied separately; not embedded in PPTX.']};
await fs.writeFile(path.join(root,'output',`verification-${version}.json`),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
