import fs from 'node:fs';
import path from 'node:path';
import {withChrome, sleep} from './chrome.mjs';

const root = path.resolve(process.argv[2] || new URL('./lama/prepared', import.meta.url).pathname);
const out = path.join(root, 'ui');
fs.mkdirSync(out, {recursive: true});
await withChrome(async ({send, evaluate, capture}) => {
  await send('Page.navigate', {url: 'https://avbelkin.github.io/nasa-space-apps-sg/#z=3&lat=1.3521&lng=103.8198&sensor=harmonized&proj=globe&orbits=0&clouds=0&lights=0&rain=0'});
  await sleep(18000);
  await evaluate(`(()=>{const e=[...document.querySelectorAll('label')].find(x=>x.innerText.includes('Color fire spots by sensor'))?.querySelector('input');if(e&&!e.checked)e.click();})()`);
  await sleep(1500);
  const click = async (x, y) => {
    await send('Input.dispatchMouseEvent', {type: 'mouseMoved', x, y});
    await send('Input.dispatchMouseEvent', {type: 'mousePressed', x, y, button: 'left', clickCount: 1});
    await send('Input.dispatchMouseEvent', {type: 'mouseReleased', x, y, button: 'left', clickCount: 1});
  };
  await capture(path.join(out, '05-detail-search.png'));
  // Actual on-screen red groups in the fixed global view, tried without changing application data.
  const candidates = [[871, 743], [995, 694]];
  let selected = null;
  for (const [x, y] of candidates) {
    await click(x, y); await sleep(1100);
    const heading = await evaluate(`document.querySelector('#pinned-fire-heading')?.textContent || ''`);
    console.log(JSON.stringify({x,y,heading}));
    if (!heading.includes('Pinned group')) continue;
    await evaluate(`(()=>{const d=document.querySelector('.fire-weather-details');if(d)d.open=true;})()`);
    for (let wait = 0; wait < 12; wait++) {
      if (await evaluate(`!!document.querySelector('.pinned-fire-details table[aria-label="Weather at acquisition"]')`)) break;
      await sleep(5000);
    }
    const state = await evaluate(`(()=>{const card=document.querySelector('.pinned-fire-details');return {heading:card?.querySelector('h2')?.innerText,text:card?.innerText,hasBoth:!!card?.querySelector('thead'),weather:card?.querySelector('[aria-label="Weather at acquisition"]')?.innerText};})()`);
    if (state.hasBoth && state.weather) {selected = {x, y, ...state}; break;}
  }
  if (!selected) {
    await capture(path.join(out, '05-detail-search-result.png'));
    fs.writeFileSync(path.join(out, '05-detail-search.json'), JSON.stringify({status:'No populated mixed-sensor group found at the candidate coordinates',url:await evaluate('location.href'),text:await evaluate('document.body.innerText')}, null, 2));
    console.log('Detail search incomplete; inspect 05-detail-search-result.png.');
    return;
  }
  const selectors = {
    geometry: '.pinned-fire-details table[aria-label="Estimated observation geometry"]',
    land: '.pinned-fire-details .fire-land-cover',
    weather: '.pinned-fire-details table[aria-label="Weather at acquisition"]',
  };
  const crops = {};
  for (const [name, selector] of Object.entries(selectors)) {
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`);
    await sleep(100);
    const rect = await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height};})()`);
    if (rect.width <= 0 || rect.height <= 0) throw new Error(`Empty crop: ${name}`);
    await capture(path.join(out, `05-${name}.png`), rect);
    crops[name] = rect;
  }
  await capture(path.join(out, '05-context.png'));
  fs.writeFileSync(path.join(out, '05-context.json'), JSON.stringify({capturedAt:new Date().toISOString(),url:await evaluate('location.href'),selected,crops,excluded:'FRP forecast and timeline totals; only actual observation tables and land-cover label were cropped'}, null, 2));
  console.log(JSON.stringify({status:'Captured populated real detail crops',selected}));
});
