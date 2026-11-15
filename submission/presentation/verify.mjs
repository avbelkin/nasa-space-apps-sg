import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const root=import.meta.dirname;
if(!process.env.RUNTIME_NODE_MODULES) throw Error('Set RUNTIME_NODE_MODULES to an existing managed runtime.');
const require=createRequire(path.join(process.env.RUNTIME_NODE_MODULES,'__verify__.cjs'));
const JSZip=require('jszip');
const {xml2js}=require('xml-js');
const {PDFDocument,PDFName,PDFString,PDFHexString}=require('pdf-lib');
const firstBlock=process.env.DECK_SCOPE==='first-block';
const expectedSlideCount=firstBlock?2:7;
const version=process.env.DECK_VERSION || (firstBlock?'direction-r11':'complete-r11');
const buildDir=path.join(root,'.build',version);
const tokens=JSON.parse(await fs.readFile(path.join(root,'design-tokens.json'),'utf8'));
const allowedSizes=new Set(Object.values(tokens.sizes).map(n=>String(n*75)));
const pptx=path.join(root,'output',`earth-fire-calendar-${version}.pptx`);
const pptxBytes=await fs.readFile(pptx);
const zip=await JSZip.loadAsync(pptxBytes);
const source=await fs.readFile(path.join(root,'demo-slides.md'),'utf8');
const snapshot=JSON.parse(await fs.readFile(path.join(root,'assets/data/firms-snapshot-2026-11-15T0836Z.json'),'utf8'));
const normalize=s=>s.normalize('NFKC').replace(/\u00ad/g,'').replace(/\s+/g,' ').trim();
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
const sections=[...source.matchAll(/^## Slide (\d+) — (.+)\n([\s\S]*?)(?=^## Slide |$(?![\s\S]))/gm)].slice(0,expectedSlideCount);
const reports=[];
let altCount=0;
const fontSizes=new Set();
for(const section of sections){
 const number=+section[1];
 const xml=await zip.file(`ppt/slides/slide${number}.xml`).async('string');
 const actual=normalize(texts(xml).join(''));
 const expected=[section[2],...section[3].trim().split('\n').filter(x=>x.trim())].map(visible);
 const missing=expected.filter(s=>!actual.includes(s));
 if(missing.length)throw Error(`Slide ${number}: missing or changed source text: ${JSON.stringify(missing)}`);
 for(const m of xml.matchAll(/\bsz="(\d+)"/g)){fontSizes.add(m[1]);if(!allowedSizes.has(m[1]))throw Error(`Slide ${number}: font size outside token scale: ${m[1]}`);}
 const tree=xml2js(xml,{compact:true})['p:sld']['p:cSld']['p:spTree'];
 for(const [tag,nv] of [['p:pic','p:nvPicPr'],['p:graphicFrame','p:nvGraphicFramePr']]){
  for(const object of [tree[tag]].flat().filter(Boolean)){
   const a=object[nv]['p:cNvPr']._attributes;
   if(!a.name||!a.descr||a.descr.length<20)throw Error(`Slide ${number}: missing alt text`);
   altCount++;
  }
 }
 if(number===1&&xml.includes('name="slide-number"'))throw Error('Cover has a slide number');
 const notes=await zip.file(`ppt/notesSlides/notesSlide${number}.xml`).async('string');
 if(/CHECKPOINT|633c0c3/.test(notes))throw Error('Stale internal notes');
 reports.push({slide:number,sourceLines:expected.length,wording:'preserved'});
}
const slideCount=Object.keys(zip.files).filter(n=>/^ppt\/slides\/slide\d+\.xml$/.test(n)).length;
if(slideCount!==expectedSlideCount)throw Error(`Expected ${expectedSlideCount} slides, got ${slideCount}`);
const charts=Object.keys(zip.files).filter(n=>/^ppt\/(?:slides\/)?charts\/chart\d+\.xml$/.test(n));
if(charts.length!==2)throw Error(`Expected 2 native charts, got ${charts.length}`);
const chartParts=await Promise.all(charts.map(n=>zip.file(n).async('string')));
for(const chart of chartParts){const axis=xml2js(chart,{compact:true})['c:chartSpace']['c:chart']['c:plotArea']['c:valAx']['c:scaling'];if(axis['c:max']?._attributes.val!=='100000'||axis['c:min']?._attributes.val!=='0')throw Error('Native chart scale must be 0–100,000');}
const chartXml=chartParts.join('');
for(const value of [snapshot.modisCount,snapshot.viirsCount])if(!chartXml.includes(`<c:v>${value}</c:v>`))throw Error(`Missing chart value ${value}`);
const workbooks=Object.keys(zip.files).filter(n=>/^ppt\/embeddings\/.*\.xlsx$/.test(n));
if(workbooks.length!==2)throw Error('Expected two editable embedded chart workbooks');
let worksheets='';for(const name of workbooks){const workbook=await JSZip.loadAsync(await zip.file(name).async('nodebuffer'));worksheets+=await workbook.file('xl/worksheets/sheet1.xml').async('string');}
for(const value of [snapshot.modisCount,snapshot.viirsCount])if(!worksheets.includes(`<v>${value}</v>`))throw Error(`Missing workbook value ${value}`);
const pdfPath=path.join(root,'output',`earth-fire-calendar-${version}.pdf`);
const pdf=await PDFDocument.load(await fs.readFile(pdfPath));
if(pdf.getPageCount()!==expectedSlideCount)throw Error('PDF page count differs from PPTX');
const poppler=process.env.POPPLER_BIN||path.resolve(process.env.RUNTIME_NODE_MODULES,'../../native/poppler/poppler/bin');
const extracted=execFileSync(path.join(poppler,'pdftotext'),['-raw',pdfPath,'-'],{encoding:'utf8'});
await fs.writeFile(path.join(buildDir,'pdf-text.txt'),extracted);
const pages=extracted.split('\f');
// Raw PDF extraction can omit inferred spaces even with embedded TrueType.
// Check exact character order and separately check spatially extracted words.
const bbox=xml2js(execFileSync(path.join(poppler,'pdftotext'),['-bbox',pdfPath,'-'],{encoding:'utf8'}),{compact:false});
function descendants(node,name){return (node.elements||[]).flatMap(e=>[...(e.name===name?[e]:[]),...descendants(e,name)]);}
const bboxPages=descendants(bbox,'page');
const noSpace=s=>normalize(s).replace(/\s/g,'');
for(const section of sections){
 const actual=normalize(pages[Number(section[1])-1]);
 const expected=[section[2],...section[3].trim().split('\n').filter(x=>x.trim())].map(visible);
 const missing=expected.filter(s=>!noSpace(actual).includes(noSpace(s)));
 if(missing.length)throw Error(`PDF slide ${section[1]} missing text: ${JSON.stringify(missing)}`);
 const wordElements=descendants(bboxPages[Number(section[1])-1],'word');
 const wordText=wordElements.map(e=>normalize((e.elements||[]).map(t=>t.text||'').join('')));
 const words=new Set(wordText);
 // Preserve an existing source hyphen when a compound wraps onto the next line.
 wordText.forEach((word,i)=>{if(word.endsWith('-')&&i+1<wordText.length&&Number(wordElements[i+1].attributes.yMin)>Number(wordElements[i].attributes.yMin))words.add(word+wordText[i+1]);});
 const missingWords=[...new Set(expected.flatMap(s=>s.split(' ')).filter(w=>!words.has(w)))];
 if(missingWords.length)throw Error(`PDF slide ${section[1]} missing word boundaries: ${JSON.stringify(missingWords)}`);
}
const pdfLinks=[];
for(const [i,page] of pdf.getPages().entries()){
 const annotations=page.node.Annots();
 if(!annotations)continue;
 for(let j=0;j<annotations.size();j++){
  const a=pdf.context.lookup(annotations.get(j));
  const action=a.lookup(PDFName.of('A'));if(!action)continue;
  const uri=action.lookup(PDFName.of('URI'));
  if(uri instanceof PDFString||uri instanceof PDFHexString)pdfLinks.push({slide:i+1,url:uri.decodeText()});
 }
}
for(const section of sections)for(const m of section[3].matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)){
 if(!pdfLinks.some(l=>l.slide===Number(section[1])&&new URL(l.url).href===new URL(m[2]).href))throw Error(`Missing PDF link ${m[1]}: ${m[2]}`);
}
const pdfFonts=execFileSync(path.join(poppler,'pdffonts'),[pdfPath],{encoding:'utf8'});
await fs.writeFile(path.join(buildDir,'pdf-fonts.txt'),pdfFonts);
if(!/Overpass/.test(pdfFonts)||/Calibri/.test(pdfFonts))throw Error('PDF brand fonts missing or substituted');
if(/Type 3/.test(pdfFonts))throw Error('Use the supplied TrueType fonts for the presentation PDF');
const embeddedFaces=[...pdfFonts.matchAll(/^\S+\s+CID TrueType\s+Identity-H\s+yes\s+yes\s+yes\s+\d+\s+\d+\s*$/gm)].length;
if(embeddedFaces!==3)throw Error('Expected embedded Unicode TrueType faces for the selected layout');
if(pdf.getTitle()!=='Earth Fire Calendar'||pdf.getAuthor()!=='Earth Fire Calendar')throw Error('Wrong PDF metadata');
const core=await zip.file('docProps/core.xml').async('string');
if(/Walnut Exporter|<dc:title>Presentation<\/dc:title>/.test(core))throw Error('Wrong PPTX metadata');
const layout=JSON.parse(await fs.readFile(path.join(buildDir,'pdf-layout-check.json'),'utf8'));
if(layout.overflow.length)throw Error('Unresolved PDF text overflow');
const receipt=JSON.parse(await fs.readFile(path.join(buildDir,'validation.json'),'utf8'));
if(receipt.finalSha256!==crypto.createHash('sha256').update(pptxBytes).digest('hex')||receipt.packageIntegrity.status!=='pass'||receipt.presentationLayout.findingCount!==0||!receipt.firstPartyImport.passed)throw Error('PPTX finalization receipt mismatch or failed checks');
const result={revision:version,slides:reports,slideCount,pdfPages:pdf.getPageCount(),pdf:'vector text and shapes, embedded fonts, resized frozen screenshot assets',pdfCopy:'all source lines preserved and extractable',pdfLinks,chart:'native with embedded workbook and fixed 0–100,000 scale',counts:{modis:snapshot.modisCount,viirs:snapshot.viirsCount},altTextObjects:altCount,fontSizesPx:[...fontSizes].map(n=>Number(n)/75).sort((a,b)=>a-b),sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),pptxSha256:crypto.createHash('sha256').update(pptxBytes).digest('hex'),pdfSha256:crypto.createHash('sha256').update(await fs.readFile(pdfPath)).digest('hex'),limitations:['Fonts supplied separately; not embedded in PPTX. Native PowerPoint may substitute fonts; use the supplied PDF for stable appearance.'],accounting:{apiProvider:null,apiModel:null,apiRoute:null,apiCalls:0,apiCostUsd:0,subscription:'Codex; allowance usage unavailable'}};
if(firstBlock)result.limitations.unshift('Visual direction checkpoint: slides 1–2 only; slides 3–7 remain the earlier baseline.');
result.finalization={packageIntegrity:'pass',layoutFindings:0,artifactToolReimport:'pass',pdfEmbeddedFontFaces:embeddedFaces};
result.accounting.subscription='Primary Codex session plus one independent Codex reviewer; allowance usage unavailable';
await fs.writeFile(path.join(root,'output',`verification-${version}.json`),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
