/* 吹き出しが出ている状態の実画面を、ヘッドレス Chrome で撮る。
   使い方: node manual/capture.mjs http://127.0.0.1:8795/index.html   */
import {spawn} from 'node:child_process';
import {writeFileSync, mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

const URL_ = process.argv[2] || 'http://127.0.0.1:8795/index.html';
const OUT = fileURLToPath(new URL('./shots/', import.meta.url));
mkdirSync(OUT, {recursive: true});
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;

// 端末は iPhone 相当（幅390・高さ844・2倍）
const W = 390, H = 844, DPR = 2;

const fillSup = n => `SUPPLIERS.forEach((s,si)=>{if(si<=${n})idxOf(s.id).forEach(i=>{S.stock[key(i)]=Math.max(0,ITEMS[i].par-1)})});render()`;
const fillAll = `SUPPLIERS.forEach(s=>idxOf(s.id).forEach(i=>{S.stock[key(i)]=Math.max(0,ITEMS[i].par-1)}));render()`;

const SHOTS = [
 {f:'01-home-start', setup:`S.stock={};S.final={};S.submitted=false;S.step='home';render()`, sel:'.hero'},
 {f:'02-home-help',  setup:`S.step='home';render()`, sel:'#helpToggle'},
 {f:'03-home-steps', setup:`S.step='home';render()`, sel:'.steps button:nth-child(3)'},
 {f:'04-type-food',  setup:`S.step='type';render()`, sel:'.tcard.on'},
 {f:'05-sup-tab',    setup:`S.type='food';S.sup=0;S.step='input';render()`, sel:'.sup'},
 {f:'06-guests',     setup:`S.step='input';render()`, sel:'.guest .ghost'},
 {f:'07-stepper',    setup:`S.step='input';render();document.querySelectorAll('.item')[0].scrollIntoView({block:'center'})`, sel:'.item .stp:last-of-type'},
 {f:'08-qty',        setup:`S.step='input';render();document.querySelectorAll('.item')[0].scrollIntoView({block:'center'})`, sel:'.item .qty'},
 {f:'09-est',        setup:`setStock(idxOf(SUPPLIERS[0].id)[0],1);document.querySelectorAll('.item')[0].scrollIntoView({block:'center'})`, sel:'.item .est'},
 {f:'10-order-row',  setup:`setStock(idxOf(SUPPLIERS[0].id)[0],1);document.querySelectorAll('.item')[0].scrollIntoView({block:'center'})`, sel:'.item .foot'},
 {f:'11-next-sup',   setup:fillSup(0)+`;window.scrollTo(0,0)`, sel:'.btn.pri'},
 {f:'12-confirm-fin',setup:fillAll+`;S.step='confirm';render();document.querySelectorAll('.qcell')[0].scrollIntoView({block:'center'})`, sel:'.qcell .mini:last-of-type'},
 {f:'13-save',       setup:fillAll+`;S.step='confirm';render()`, sel:'.saveln .b'},
 {f:'14-submit',     setup:fillAll+`;S.step='confirm';render()`, sel:'.submit'},
 {f:'15-done-reset', setup:fillAll+`;S.submitted=true;S.step='done';render()`, sel:'.resetbtn'},
];

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ud = join(tmpdir(), 'nagi-shot-' + Date.now());
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + ud, '--hide-scrollbars', '--force-device-scale-factor=' + DPR,
  '--no-first-run', '--disable-extensions', 'about:blank'], {stdio: 'ignore'});

let ws, id = 0, pend = new Map(), session;
const send = (method, params = {}, sid = session) => new Promise((res, rej) => {
  const n = ++id; pend.set(n, {res, rej});
  ws.send(JSON.stringify({id: n, method, params, ...(sid ? {sessionId: sid} : {})}));
});
const evalJS = async expr => {
  const r = await send('Runtime.evaluate', {expression: expr, awaitPromise: true, returnByValue: true});
  if (r.exceptionDetails) throw new Error(expr.slice(0, 60) + ' => ' + JSON.stringify(r.exceptionDetails.exception));
  return r.result && r.result.value;
};

try {
  let ver;
  for (let i = 0; i < 60; i++) {
    try { ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; }
    catch { await sleep(250); }
  }
  ws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
  };
  const {targetId} = await send('Target.createTarget', {url: 'about:blank'}, null);
  ({sessionId: session} = await send('Target.attachToTarget', {targetId, flatten: true}, null));
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {width: W, height: H, deviceScaleFactor: DPR, mobile: true});
  await send('Page.navigate', {url: URL_});
  await sleep(1500);
  await evalJS(`localStorage.setItem('nagi_help','0');S.lang='JA';1`);

  for (const s of SHOTS) {
    await evalJS(`hideHelp();${s.setup};1`);
    await sleep(220);
    const ok = await evalJS(`(()=>{const el=document.querySelector(${JSON.stringify(s.sel)});if(!el)return 'MISSING';showHelp(el,true);clearTimeout(helpTimer);const h=document.querySelector('.hcall');return h&&!h.hidden?h.textContent:'NOCALL'})()`);
    if (ok === 'MISSING' || ok === 'NOCALL') { console.log('!!', s.f, ok, s.sel); continue; }
    await sleep(260);
    // 画面下の余白は切り落とす（内容と吹き出しの下端まで）
    const hh = await evalJS(`(()=>{const els=[...document.querySelectorAll('.top,.wrap,.cards,.hcall,.bottom,.cbar,.done-w,.split,.main')];const b=Math.max(...els.map(e=>e.getBoundingClientRect().bottom));return Math.min(${H},Math.max(360,Math.ceil(b)+16))})()`);
    const {data} = await send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false,
      clip: {x: 0, y: 0, width: W, height: hh, scale: DPR}});
    writeFileSync(join(OUT, s.f + '.png'), Buffer.from(data, 'base64'));
    console.log('ok', s.f, hh+'px |', ok.slice(0, 26));
  }
} finally {
  try { await send('Browser.close', {}, null); } catch {}
  chrome.kill();
}
