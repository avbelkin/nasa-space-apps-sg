import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Uses the installed browser; no package installation or personal browser profile.
export async function withChrome(task, {width = 1920, height = 1080} = {}) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lama-video-'));
  const browser = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', `--window-size=${width},${height}`,
    '--hide-scrollbars', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank',
  ], {stdio: 'ignore'});
  let socket;
  try {
    const active = path.join(profile, 'DevToolsActivePort');
    for (let i = 0; i < 100 && !fs.existsSync(active); i++) await sleep(100);
    if (!fs.existsSync(active)) throw new Error('Chrome did not start');
    const port = fs.readFileSync(active, 'utf8').split('\n')[0];
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {socket.onopen = resolve; socket.onerror = reject;});
    let id = 0;
    const pending = new Map();
    socket.onmessage = event => {
      const message = JSON.parse(event.data);
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id); clearTimeout(request.timer);
      if (message.error) request.reject(new Error(JSON.stringify(message.error)));
      else request.resolve(message.result);
    };
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const requestId = ++id;
      const timer = setTimeout(() => {pending.delete(requestId); reject(new Error(`Timeout: ${method}`));}, 30000);
      pending.set(requestId, {resolve, reject, timer});
      socket.send(JSON.stringify({id: requestId, method, params}));
    });
    const evaluate = async expression => {
      const r = await send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
      if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
      return r.result.value;
    };
    const capture = async (filename, clip) => {
      const shot = await send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: true, ...(clip ? {clip: {...clip, scale: 1}} : {})});
      fs.writeFileSync(filename, Buffer.from(shot.data, 'base64'));
    };
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: 1, mobile: false});
    await task({send, evaluate, capture});
    await send('Browser.close').catch(() => {});
  } finally {
    socket?.close(); browser.kill('SIGTERM');
    await sleep(300);
    if (browser.exitCode === null) browser.kill('SIGKILL');
    fs.rmSync(profile, {recursive: true, force: true});
  }
}
