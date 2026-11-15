import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';

const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cssPos=e=>`left:${e.x}px;top:${e.y}px;width:${e.w}px;height:${e.h}px;`;
function rich(runs){return runs.map(r=>{
 if(typeof r==='string')return escape(r).replaceAll('\n','<br>');
 let t=escape(r.run).replaceAll('\n','<br>');
 if(r.style?.bold)t=`<strong>${t}</strong>`;
 if(r.style?.italic)t=`<em>${t}</em>`;
 if(r.link)t=`<a href="${escape(r.link.uri)}">${t}</a>`;
 return t;
}).join('');}

export async function renderVectorPdf({root,version,slides,tokens,buildDir,out}){
 const require=createRequire(path.join(process.env.RUNTIME_NODE_MODULES,'__pdf__.cjs'));
 const {chromium}=require('playwright');
 const {PDFDocument}=require('pdf-lib');
 const fontSpecs=[['Fira Sans Black','FiraSans-Black.ttf',900,'normal'],['Fira Sans','FiraSans-Bold.ttf',700,'normal'],['Overpass','Overpass-Regular.ttf',400,'normal'],['Overpass','Overpass-Bold.ttf',700,'normal'],['Overpass','Overpass-Italic.ttf',400,'italic']];
 const faces=await Promise.all(fontSpecs.map(async([family,file,weight,style])=>`@font-face{font-family:'${family}';src:url(data:font/${file.endsWith('.ttf')?'ttf':'otf'};base64,${(await fs.readFile(path.join(root,'assets/fonts',file))).toString('base64')});font-weight:${weight};font-style:${style};}`));
 const parts=[];
 for(const slide of slides){
  const children=[];
  for(const e of slide.elements){
   const pos=cssPos(e);
   if(e.kind==='text')children.push(`<div class="text" data-name="${escape(e.name)}" style="${pos}font-family:'${e.font}';font-size:${e.size}px;font-weight:${e.bold?700:e.font==='Fira Sans Black'?900:400};color:${e.color};text-align:${e.align||'left'};line-height:1.18;">${rich(e.runs)}</div>`);
   if(e.kind==='rect')children.push(`<div class="rect" style="${pos}background:${e.fill};${e.line&&e.line!=='none'?`border:1px solid ${e.line};`:''}"></div>`);
   if(e.kind==='image')children.push(`<img alt="${escape(e.alt)}" src="data:image/png;base64,${(await fs.readFile(e.path)).toString('base64')}" style="${pos}object-fit:${e.fit||'contain'};${e.circle?'border-radius:50%;':''}opacity:${e.opacity??1};"/>`);
   if(e.kind==='chart'){
    const barX=118,barWidth=e.w-270,rows=[{name:'MODIS',value:e.modis},{name:'VIIRS',value:e.viirs}];
    children.push(`<svg role="img" aria-label="${escape(e.alt)}" style="${pos}" viewBox="0 0 ${e.w} ${e.h}">${rows.map((r,i)=>{const y=55+i*150,w=barWidth*r.value/e.max;return `<text x="0" y="${y+35}" font-family="Overpass" font-size="${tokens.sizes.body}" fill="${tokens.colors.deep}">${r.name}</text><rect x="${barX}" y="${y}" width="${w}" height="60" fill="${tokens.colors.electric}"/><text x="${barX+w+14}" y="${y+38}" font-family="Overpass" font-weight="700" font-size="${tokens.sizes.lead}" fill="${tokens.colors.deep}">${r.value.toLocaleString('en-US')}</text>`;}).join('')}</svg>`);
   }
  }
  parts.push(`<section class="slide" data-slide="${slide.number}" style="background:${slide.dark?`linear-gradient(135deg,${tokens.colors.electric},${tokens.colors.deep})`:tokens.colors.white}">${children.join('\n')}</section>`);
 }
 const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Earth Fire Calendar</title><style>${faces.join('\n')}@page{size:1600px 900px;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0}.slide{width:1600px;height:900px;position:relative;overflow:hidden;break-after:page}.slide:last-child{break-after:auto}.slide>*{position:absolute}.text{white-space:pre-wrap;overflow:visible;font-kerning:normal}.text a{color:inherit;text-decoration:underline;text-underline-offset:3px}.text strong{font-weight:700}img{display:block}svg{overflow:visible}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body>${parts.join('\n')}</body></html>`;
 await fs.writeFile(path.join(buildDir,'presentation.html'),html);
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:2});
  await page.setContent(html,{waitUntil:'load'});
  await page.evaluate(()=>document.fonts.ready);
  const overflow=await page.locator('.text').evaluateAll(elements=>elements.filter(e=>e.scrollHeight>e.clientHeight+3||e.scrollWidth>e.clientWidth+3).map(e=>({slide:e.closest('.slide').dataset.slide,name:e.dataset.name,text:e.textContent,actualHeight:e.scrollHeight,height:e.clientHeight,actualWidth:e.scrollWidth,width:e.clientWidth})));
  await fs.writeFile(path.join(buildDir,'pdf-layout-check.json'),JSON.stringify({overflow},null,2));
  if(overflow.length)throw Error(`PDF text overflow: ${JSON.stringify(overflow)}`);
  const links=await page.locator('a').evaluateAll(elements=>elements.map(e=>({slide:Number(e.closest('.slide').dataset.slide),text:e.textContent,url:e.href,rects:[...e.getClientRects()].map(r=>({x:r.x,y:r.y-(Number(e.closest('.slide').dataset.slide)-1)*900,width:r.width,height:r.height}))})));
  await fs.writeFile(path.join(buildDir,'pdf-links.json'),JSON.stringify(links,null,2));
  const raw=await page.pdf({preferCSSPageSize:true,printBackground:true,tagged:true,outline:false});
  const pdf=await PDFDocument.load(raw);pdf.setTitle('Earth Fire Calendar');pdf.setAuthor('Earth Fire Calendar');pdf.setSubject('Harmonization of MODIS and VIIRS Hot Spots');pdf.setCreator('Earth Fire Calendar presentation builder');pdf.setProducer('Chromium PDF');
  await fs.writeFile(path.join(out,`earth-fire-calendar-${version}.pdf`),await pdf.save());
  for(let i=0;i<7;i++)await page.locator('.slide').nth(i).screenshot({path:path.join(buildDir,`pdf-slide-${i+1}.png`),animations:'disabled'});
  return {pageCount:pdf.getPageCount(),links:links.length,renderScale:2,mode:'vector text, vector shapes, embedded fonts and native URI annotations'};
 }finally{await browser.close();}
}
