// Original typographic diagram, authored with OpenAI Codex; no external image assets.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { withChrome } from '../submission/video/chrome.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><style>
*{box-sizing:border-box}html,body{margin:0;width:1200px;height:630px;overflow:hidden}
body{background:#07173f;color:#fff;font-family:Arial,sans-serif;padding:58px 64px}
.kicker{font-size:22px;letter-spacing:3px;color:#a6c5ed}h1{font-size:64px;margin:26px 0 12px;line-height:1.05}
p{font-size:27px;line-height:1.4;margin:0;color:#e0eafa}.diagram{display:flex;align-items:center;gap:20px;margin:32px 0 22px}
.sensor{width:230px;padding:20px;border:2px solid #2e96f5;border-radius:12px;font-size:25px}
.arrow{font-size:32px;color:#eafe07}.goal{font-size:25px;color:#eafe07}.footer{font-size:19px;color:#a6c5ed;line-height:1.6}
.label{position:absolute;right:32px;bottom:22px;background:#fff;color:#07173f;font-size:17px;padding:7px 12px}
</style><div class="kicker">TEAM PLUSH · WORKING PROTOTYPE</div><h1>Earth Fire Calendar</h1>
<p>Live MODIS and VIIRS detections.<br>Context for understanding the difference.</p>
<div class="diagram"><div class="sensor">MODIS · 1 km</div><span class="arrow">+</span><div class="sensor">VIIRS · 375 m</div><span class="arrow">→</span><div class="goal">Evidence for<br>harmonization</div></div>
<div class="footer">Data: NASA FIRMS · Harmonization is the next step.<br>Independent project. Not affiliated with or endorsed by NASA.</div>
<div class="label">AI-generated diagram</div></html>`
await withChrome(async ({send, capture}) => {
  await send('Page.navigate', {url:'data:text/html;charset=utf-8,' + encodeURIComponent(html)})
  await send('Runtime.evaluate', {expression:'document.fonts.ready',awaitPromise:true})
  await capture(path.join(root, 'ui/public/og-preview.png'), {x:0,y:0,width:1200,height:630})
}, {width:1200,height:630})
