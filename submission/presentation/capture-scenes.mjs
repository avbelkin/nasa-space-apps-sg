import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const root=import.meta.dirname;
const require=createRequire(path.join(process.env.RUNTIME_NODE_MODULES,'__capture__.cjs'));
const {chromium}=require('playwright');
const assets=path.join(root,'assets/screenshots');
await fs.mkdir(assets,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:2});
const manifest={capturedAt:new Date().toISOString(),viewport:{width:1920,height:1080},deviceScaleFactor:2,source:'https://avbelkin.github.io/nasa-space-apps-sg/',images:[],note:'Current UI illustrations; not the 08:36 UTC count snapshot on slide 2. Captured through normal sensor controls and map clicks. No data is invented or modified.'};
const base='https://avbelkin.github.io/nasa-space-apps-sg/';
async function save(name,locator,extra={}){
 await page.mouse.move(5,5);
 await locator.screenshot({path:path.join(assets,`${name}.png`),animations:'disabled'});
 manifest.images.push({name:`${name}.png`,url:page.url(),capturedAt:new Date().toISOString(),...extra});
}
async function findMap(){
 return page.evaluate(()=>{
  for(const el of document.querySelectorAll('*')){
   const key=Object.keys(el).find(k=>k.startsWith('__reactFiber$'));if(!key)continue;
   for(let node=el[key],depth=0;node&&depth<15;node=node.return,depth++){
    for(let hook=node.memoizedState,i=0;hook&&i++<100;hook=hook.next){
     const ref=hook.memoizedState?.current;
     if(ref?.queryRenderedFeatures&&ref?.getCanvas){window.__deckMap=ref;return true;}
    }
   }
  }return false;
 });
}
try {
 await page.goto(`${base}#z=1.8&lat=9&lng=94&sensor=harmonized&proj=globe&orbits=0&clouds=0&lights=0&rain=0`,{waitUntil:'domcontentloaded',timeout:60000});
 await page.getByRole('switch',{name:'Color fire spots by sensor'}).check();
 await page.waitForFunction(()=>document.body.innerText.includes('loaded'));
 await page.waitForTimeout(9000);
 if(!await findMap())throw Error('Map instance not found');
 const mapSources=await page.evaluate(()=>Object.fromEntries(Object.entries(window.__deckMap.getStyle().sources).filter(([,source])=>source.type==='raster')));
 if(!JSON.stringify(mapSources).includes('s2cloudless_3857')||JSON.stringify(mapSources).includes('s2cloudless-2025'))throw Error('Expected the current EOxCloudless 2016 basemap');
 manifest.basemap={name:'EOxCloudless 2016',license:'CC BY 4.0',sources:mapSources};
 const canvas=await page.locator('.maplibregl-canvas').boundingBox();
 const coverClip={x:canvas.x+canvas.width/2-249,y:canvas.y+canvas.height/2-249,width:498,height:498};
 await page.screenshot({path:path.join(assets,'cover-sensors.png'),clip:coverClip});
 manifest.images.push({name:'cover-sensors.png',url:page.url(),capturedAt:new Date().toISOString(),clip:coverClip,description:'Complete globe crop with sensor colouring enabled.'});
 if(process.env.CAPTURE_SCOPE==='cover'){
  const previous=JSON.parse(await fs.readFile(path.join(assets,'capture-scenes.json'),'utf8'));
  previous.images=previous.images.map(item=>item.name==='cover-sensors.png'?manifest.images[0]:item);
  previous.basemap=manifest.basemap;
  await fs.writeFile(path.join(assets,'capture-scenes.json'),JSON.stringify(previous,null,2)+'\n');
  console.log('Updated the cover capture and its provenance.');
 }else{
 await page.goto(`${base}#z=5&lat=29&lng=76&sensor=harmonized&proj=mercator&orbits=0&clouds=0&lights=0&rain=0`,{waitUntil:'domcontentloaded'});
 await page.waitForTimeout(7000);
 await page.getByRole('switch',{name:'Color fire spots by sensor'}).check();
 if(!await findMap())throw Error('Map instance not found');
 await save('regional-sensors',page.locator('.maplibregl-canvas'),{description:'Northern India, all sensors; colour key is captured separately.'});
 await save('sensor-key',page.locator('.fire-sensor-colors'),{description:'Unmodified in-app legend.'});
 await page.getByRole('radio',{name:'MODIS',exact:true}).check();
 await page.waitForTimeout(1500);
 await save('step-modis',page.locator('.maplibregl-canvas'));
 await page.getByRole('radio',{name:'VIIRS',exact:true}).check();
 await page.waitForTimeout(1500);
 await save('step-viirs',page.locator('.maplibregl-canvas'));
 await page.getByRole('radio',{name:'All sensors',exact:true}).check();
 await page.getByRole('switch',{name:'Color fire spots by sensor'}).check();
 await page.waitForTimeout(1500);
 const target=await page.evaluate(()=>{
  const m=window.__deckMap;
  const features=m.queryRenderedFeatures(undefined,{layers:m.getStyle().layers.filter(l=>l.type==='circle'&&!l.id.includes('focus')).map(l=>l.id)});
  const points=features.filter(f=>f.properties.screenSensorGroup==='both').map(f=>({xy:m.project(f.geometry.coordinates),coords:f.geometry.coordinates,props:f.properties})).filter(f=>f.xy.x>150&&f.xy.x<1300&&f.xy.y>180&&f.xy.y<800);
  return points.sort((a,b)=>Math.hypot(a.xy.x-760,a.xy.y-520)-Math.hypot(b.xy.x-760,b.xy.y-520))[0];
 });
 if(!target)throw Error('No group observed by both sensors in the selected view');
 const canvasBox=await page.locator('.maplibregl-canvas').boundingBox();
 await page.mouse.click(canvasBox.x+target.xy.x,canvasBox.y+target.xy.y);
 await page.locator('.pinned-fire-details').waitFor();
 await page.waitForTimeout(12000);
 const geometry=page.getByRole('table',{name:'Estimated observation geometry',exact:true});
 if(!await geometry.innerText().then(s=>s.includes('MODIS')&&s.includes('VIIRS')))throw Error('Pinned comparison lacks both sensor columns');
 // Capture-only layout expansion. Source code and displayed data stay unchanged.
 const captureStyle='.app-frame{grid-template-columns:minmax(0,1fr) 700px !important;}';
 await page.addStyleTag({content:captureStyle});
 await page.waitForTimeout(1000);
 await save('pinned-timeline',page.locator('.fire-timeline'),{description:'24-hour timeline, actual and estimated passes.',captureStyle,selection:target.coords});
 await save('pinned-geometry',geometry,{description:'Estimated viewing geometry, MODIS and VIIRS columns.',captureStyle,selection:target.coords});
 await page.getByText('Weather at acquisition',{exact:true}).first().click();
 await page.waitForTimeout(6000);
 const weather=page.getByRole('table',{name:'Weather at acquisition',exact:true});
 if(await weather.count())await save('pinned-weather',weather,{description:'Weather-at-acquisition comparison.',captureStyle,selection:target.coords});
 await save('pinned-summary',page.locator('.pinned-fire-header'),{description:'Selected real detection group.',captureStyle,selection:target.coords});
 manifest.selection=target;
 manifest.visibleSnapshotText=(await page.locator('body').innerText()).match(/Latest detection:[\s\S]*?Snapshot fetched[^.]*\./)?.[0];
 await fs.writeFile(path.join(assets,'capture-scenes.json'),JSON.stringify(manifest,null,2)+'\n');
 console.log(JSON.stringify({files:manifest.images.map(x=>x.name),snapshot:manifest.visibleSnapshotText,selection:target.coords}));
 }
} finally {await browser.close();}
