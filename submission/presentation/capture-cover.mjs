import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const root=import.meta.dirname;
if(!process.env.RUNTIME_NODE_MODULES) throw Error('Set RUNTIME_NODE_MODULES to an existing runtime; this script installs nothing.');
const require=createRequire(path.join(process.env.RUNTIME_NODE_MODULES,'__capture__.cjs'));
const {chromium}=require('playwright');
const url='https://avbelkin.github.io/nasa-space-apps-sg/#z=1.8&lat=9&lng=94&sensor=harmonized&proj=globe&orbits=0&clouds=0&lights=0&rain=0';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:2});
 await page.goto(url,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.body.innerText.includes('Data service online'));
 await page.waitForTimeout(12000);
 const body=await page.locator('body').innerText();
 if(!body.includes('loaded')) throw Error('FIRMS data did not load');
 await page.screenshot({path:path.join(root,'assets/screenshots/cover-globe.png'),clip:{x:510,y:310,width:520,height:520}});
 await fs.writeFile(path.join(root,'assets/screenshots/cover-globe.json'),JSON.stringify({url,capturedAt:new Date().toISOString(),clip:{x:510,y:310,width:520,height:520},viewport:{width:1920,height:1080},deviceScaleFactor:2,description:'Unretouched browser screenshot, clipped to globe; only a cover illustration, not evidence for the 08:36 UTC count comparison.',attribution:'NASA FIRMS; EOX / Copernicus Sentinel-2; Bright Star / Hipparcos catalogue.',visibleSnapshotText:body.match(/Latest detection:[\s\S]*?Snapshot fetched[^.]*\./)?.[0]},null,2)+'\n');
 console.log('Saved cover globe and capture metadata.');
} finally {await browser.close();}
