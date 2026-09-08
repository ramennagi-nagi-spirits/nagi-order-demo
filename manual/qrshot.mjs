/* qr.html の QR を PNG として取り出す */
import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const OUT=fileURLToPath(new URL('./shots/qr.png',import.meta.url));
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';const PORT=9334;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const chrome=spawn(CHROME,['--headless=new','--remote-debugging-port='+PORT,'--user-data-dir='+join(tmpdir(),'qrshot'+Date.now()),'--no-first-run','about:blank'],{stdio:'ignore'});
let ws,id=0,pend=new Map(),session;
const send=(m,p={},sid=session)=>new Promise((res,rej)=>{const n=++id;pend.set(n,{res,rej});ws.send(JSON.stringify({id:n,method:m,params:p,...(sid?{sessionId:sid}:{})}))});
try{
 let ver;for(let i=0;i<60;i++){try{ver=await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();break}catch{await sleep(250)}}
 ws=new WebSocket(ver.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){const p=pend.get(m.id);pend.delete(m.id);m.error?p.rej(new Error(JSON.stringify(m.error))):p.res(m.result)}};
 const {targetId}=await send('Target.createTarget',{url:'about:blank'},null);
 ({sessionId:session}=await send('Target.attachToTarget',{targetId,flatten:true},null));
 await send('Page.enable');await send('Runtime.enable');
 await send('Page.navigate',{url:process.argv[2]});await sleep(2500);
 const r=await send('Runtime.evaluate',{expression:`(()=>{const c=document.querySelector('#qr canvas');return c?c.toDataURL('image/png'):(document.querySelector('#qr img')||{}).src||''})()`,returnByValue:true});
 const d=r.result.value||'';
 if(!d.startsWith('data:image/png;base64,'))throw new Error('QR not found: '+d.slice(0,40));
 writeFileSync(OUT,Buffer.from(d.split(',')[1],'base64'));console.log('qr.png ok');
}finally{try{await send('Browser.close',{},null)}catch{};chrome.kill()}
