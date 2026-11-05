/** STEP10-01AT: actual React preview UI via Chromium CDP. NONDEPLOY, TEST-ONLY.
 * Synthetic attestation is never official verification. Dist files are temporary.
 * No modification to tracked public JSON or prediction history.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import { assertJsj001Jsj006Exact } from '../scripts/lib/official-entry-crosscheck.mjs';

const root=path.resolve(import.meta.dirname,'..');
const loaded=name=>JSON.parse(fs.readFileSync(path.join(root,'public/data/races',name),'utf8'));
const origOfficial=loaded('keirin-jp-entries.generated.json');
const origToday=loaded('today.generated.json');
const outputDir=path.join(root,'dist/data/races');
const previewUrl='http://127.0.0.1:4173/keirin-datalavo/#prediction-page';
const sha256=b=>crypto.createHash('sha256').update(b).digest('hex');
const chromePaths=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'];
const chrome=chromePaths.find(x=>fs.existsSync(x));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'keirin-at-cdp-'));
const report={status:'WAIT_BROWSER',sourceMode:'PR9-review-code',browser:chrome||null,
 fixtureSource:'saved 2026-11-05 79R/575 + TEST-ONLY synthetic JSJ001 detail',
 liveOfficialVerified:false, actualPublishedSite:false, cases:[], filesChangedInGit:0};
let browser,preview,session;
const originalBytes=new Map();
const waitUntil=async(check,{attempts=50,interval=250,message='condition not satisfied'}={})=>{
 for(let i=0;i<attempts;i++){try{const r=await check();if(r)return r}catch{} await delay(interval)}
 throw Error(message);
};
const forceStop=child=>{try{child?.kill('SIGTERM')}catch{}};
class Protocol {
 constructor(ws){this.ws=ws;this.counter=0;this.handlers=new Map();this.events=[];
  ws.onmessage=message=>{
   const item=JSON.parse(message.data);
   if(item.id){const itemPending=this.handlers.get(item.id);if(itemPending){this.handlers.delete(item.id);if(item.error)itemPending.reject(Error(JSON.stringify(item.error)));else itemPending.resolve(item.result??{})}}
   else if(item.method)this.events.push(item);
  };
 }
 send(method,params={}){const id=++this.counter;return new Promise((resolve,reject)=>{this.handlers.set(id,{resolve,reject});this.ws.send(JSON.stringify({id,method,params}));});}
 async eval(expression){const v=await this.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(v.exceptionDetails)throw Error(JSON.stringify(v.exceptionDetails).slice(0,750));return v.result?.value;}
}
const click=async(label)=>{
 const selector=JSON.stringify(label);
 const rect=await session.eval(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===${selector});if(!b)return {found:false};b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return {found:true,disabled:b.disabled,x:r.x+r.width/2,y:r.y+r.height/2,text:b.textContent.trim()}})()`);
 if(!rect.found)return {status:'NOT_FOUND',label};
 if(rect.disabled)return {status:'DISABLED',label};
 await session.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:rect.x,y:rect.y});
 await session.send('Input.dispatchMouseEvent',{type:'mousePressed',x:rect.x,y:rect.y,button:'left',clickCount:1});
 await session.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:rect.x,y:rect.y,button:'left',clickCount:1});
 return {status:'CLICKED',label};
};
const checkDom=async()=>session.eval(`(()=>({ready:document.readyState,buttons:[...document.querySelectorAll('button')].filter(x=>['TXTダウンロード','コピー','まとめてコピー'].includes(x.textContent.trim())).map(x=>({text:x.textContent.trim(),disabled:x.disabled})),hasRace:document.body.innerText.includes('単独R GPT貼り付け用素材'),hasVenueSelected:document.body.innerText.includes(' のレースを選択'),hasHold:document.body.innerText.includes('登録番号の公式照合待ち'),slice:document.body.innerText.slice(-400)}))()`);
const navigate=async()=>{
 await session.send('Page.navigate',{url:previewUrl});
 try{return await waitUntil(async()=>{const d=await checkDom();return d.hasRace&&d.hasVenueSelected&&d.buttons.some(x=>x.text==='TXTダウンロード')?d:null},{attempts:75,interval:400,message:'React preview did not load single-R controls'});}catch(e){
   let info={};try{info={href:await session.eval('location.href'),dom:await checkDom(),root:await session.eval('document.querySelector("#root")?.outerHTML.slice(0,700)'),scriptCount:await session.eval('document.scripts.length')};}catch{}
   const exceptionEvents=session.events.filter(x=>x.method==='Runtime.exceptionThrown'||x.method==='Log.entryAdded'||x.method==='Network.loadingFailed').slice(-10).map(x=>({method:x.method,params:JSON.stringify(x.params).slice(0,450)}));
   throw Error(String(e.message)+' | '+JSON.stringify({info,exceptionEvents}).slice(0,2600));
 }
};
try{
 assert.ok(chrome,'Chromium executable unavailable; real-browser test cannot pass');
 assert.ok(fs.existsSync(path.join(root,'dist/index.html')),'Run npm run build:github before actual Chrome preview');
 assert.equal(origOfficial.date,origToday.date);
 fs.mkdirSync(outputDir,{recursive:true});
 for(const name of ['today.generated.json','keirin-jp-entries.generated.json']){
  const p=path.join(outputDir,name);originalBytes.set(name,fs.existsSync(p)?fs.readFileSync(p):null);
  fs.copyFileSync(path.join(root,'public/data/races',name),p);
 }
 const chromeProfile=path.join(tmp,'chrome-profile');
 preview=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'preview','--mode','github','--host','127.0.0.1','--port','4173','--strictPort'],{cwd:root,stdio:['ignore','pipe','pipe']});
 await waitUntil(async()=>{const r=await fetch('http://127.0.0.1:4173/keirin-datalavo/').catch(()=>null);return r?.ok},{attempts:60,interval:250,message:'Vite preview server not available'});
 browser=spawn(chrome,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run','--no-default-browser-check','--disable-background-networking',`--user-data-dir=${chromeProfile}`,'--remote-allow-origins=*','--remote-debugging-port=0','about:blank'],{stdio:'ignore'});
 const portPath=path.join(chromeProfile,'DevToolsActivePort');
 const port=await waitUntil(()=>fs.existsSync(portPath)?Number(fs.readFileSync(portPath,'utf8').split('\n')[0]):null,{attempts:100,interval:150,message:'Chrome debug port absent'});
 const targets=await waitUntil(async()=>{const x=await fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json());return x.find(z=>z.type==='page')?.webSocketDebuggerUrl??null},{attempts:40,interval:200,message:'Chrome CDP target absent'});
 const ws=new WebSocket(targets);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});
 session=new Protocol(ws);
 await session.send('Page.enable');await session.send('Runtime.enable');await session.send('Log.enable');await session.send('Network.enable');
 try{await session.send('Browser.grantPermissions',{origin:'http://127.0.0.1:4173',permissions:['clipboardReadWrite','clipboardSanitizedWrite']});report.permissionsGranted=true}catch(e){report.permissionsGranted=false;report.permissionNote=String(e).slice(0,140)}
 await session.send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:path.join(tmp,'downloads')});
 fs.mkdirSync(path.join(tmp,'downloads'),{recursive:true});
 // Historical feed: unsafe registration numbers must NOT enable UI copy/save.
 const held=await navigate();
 const heldButtons=Object.fromEntries(held.buttons.map(x=>[x.text,x.disabled]));
 const oldHold=heldButtons['TXTダウンロード']===true && heldButtons['コピー']===true;
 const batchHold=heldButtons['まとめてコピー']===undefined?'NOT_RENDERED':heldButtons['まとめてコピー']===true?'PASS_DISABLED':'FAIL_BATCH_ENABLED';
 report.cases.push({case:'unaltered historical feed',uiRoute:'real React19',status:oldHold?'PASS_HELD_SINGLE_R':'FAIL_UNSAFE_ENABLED',batchStatus:batchHold,hasHoldLabel:held.hasHold,buttons:held.buttons});
 assert.ok(oldHold,'Historical feed after venue load must disable single-R copy and TXT');
 assert.notEqual(batchHold,'FAIL_BATCH_ENABLED','If rendered, batch copy must be disabled with unverified feed');
 // Build a complete synthetic proof in memory, paired via actual raw JSON bytes.
 const synthetic=structuredClone(origOfficial);let races=0,riders=0;
 for(const venue of synthetic.venues)for(const race of venue.races){if(!Array.isArray(race.entries)||!race.entries.length)continue;
  const attest=assertJsj001Jsj006Exact({date:synthetic.date,venueCode:venue.venueCode,raceNumber:race.raceNumber,entryVenueCode:race.official?.bKeirinjyoCd,detailDate:synthetic.date.replaceAll('-',''),detailVenueCode:venue.venueCode,detailRaceNumber:race.raceNumber,entries:race.entries,detailRiders:race.entries.map(e=>({carNum:e.carNo,numPlayer:e.registrationNo}))});
  race.quality={...race.quality,entryDetailCrosscheck:{...attest,checkedAt:'SYNTHETIC_TEST_ONLY'}};
  races++;riders+=race.entries.length;
 }
 assert.equal(races,79);assert.equal(riders,575);
 const officialBytes=Buffer.from(JSON.stringify(synthetic)+'\n','utf8');
 const syntheticToday=structuredClone(origToday);
 syntheticToday.source={...syntheticToday.source,officialEntriesSha256:sha256(officialBytes)};
 const todayBytes=Buffer.from(JSON.stringify(syntheticToday)+'\n','utf8');
 fs.writeFileSync(path.join(outputDir,'keirin-jp-entries.generated.json'),officialBytes);
 fs.writeFileSync(path.join(outputDir,'today.generated.json'),todayBytes);
 const positive=await navigate();
 const buttons=Object.fromEntries(positive.buttons.map(x=>[x.text,x.disabled]));
 const positiveEnabled=buttons['TXTダウンロード']===false&&buttons['コピー']===false;
 const positiveBatch=buttons['まとめてコピー']===undefined?'NOT_RENDERED':buttons['まとめてコピー']===false?'PASS_ENABLED_SYNTHETIC':'FAIL_BATCH_HELD';
 report.cases.push({case:'synthetic complete attestation / same raw-byte SHA',status:positiveEnabled?'PASS_ENABLED_SYNTHETIC':'FAIL_UNEXPECTED_HOLD',batchStatus:positiveBatch,buttons:positive.buttons,syntheticRaces:races,syntheticRiders:riders,syntheticSha256:sha256(officialBytes)});
 assert.ok(positiveEnabled,'A fully paired synthetic fixture must enable the actual single-R React controls');
 assert.notEqual(positiveBatch,'FAIL_BATCH_HELD','If rendered, batch controls must enable for synthetic full proof');
 const copy=await click('コピー');
 await delay(600);
 let clipboardText='',clipboardError='';
 try{clipboardText=await session.eval(`navigator.clipboard.readText()`)}catch(e){clipboardError=String(e).slice(0,200)}
 const copyStatus=await session.eval(`(()=>[...document.querySelectorAll('span')].map(x=>x.textContent.trim()).filter(x=>x.includes('コピーしました')||x.includes('コピーに失敗')).slice(-3))()`);
 const clipboardGood=typeof clipboardText==='string'&&clipboardText.includes('【EX source contract】')&&clipboardText.includes('KEIRIN.JP:JSJ006');
 report.cases.push({case:'real Chrome click on single-R copy',click:copy.status,status:clipboardGood?'PASS_CLIPBOARD':'WAIT_CLIPBOARD_VERIFY',clipboardCharacters:clipboardText.length,clipboardError,copyStatus});
 // Real browser TXT download via actual button handler, no synthetic button event.
 const down=await click('TXTダウンロード');
 let saved=null;
 try{saved=await waitUntil(()=>{const files=fs.readdirSync(path.join(tmp,'downloads')).filter(n=>n.endsWith('.txt'));return files.length?path.join(tmp,'downloads',files[0]):null},{attempts:40,interval:250,message:'TXT not saved'})}catch{}
 let bytes=null,fmt=null;
 if(saved){bytes=fs.readFileSync(saved);fmt={byteLength:bytes.length,bom:bytes.subarray(0,3).equals(Buffer.from([0xef,0xbb,0xbf])),crlf:bytes.includes(Buffer.from('\r\n')),hasContract:bytes.toString('utf8').includes('【EX source contract】'),hasOfficialSource:bytes.toString('utf8').includes('KEIRIN.JP:JSJ006')};}
 const downloadGood=!!(fmt?.bom && fmt?.crlf && fmt?.hasContract && fmt?.hasOfficialSource);
 report.cases.push({case:'real Chrome TXT button download',click:down.status,status:downloadGood?'PASS_DOWNLOAD':'WAIT_DOWNLOAD_VERIFY',fileFormat:fmt});
 // Positive normal UI is valid only with an explicitly SYNTHETIC source; never a live claim.
 report.status=positiveEnabled&&oldHold?'AT_REAL_REACT_SINGLE_R_GUARDS_PASS':'FAIL_BROWSER_GUARDS';
 report.clipboardVerified=clipboardGood;report.downloadVerified=downloadGood;
 report.syntheticProofOnly=true;
 assert.equal(report.status,'AT_REAL_REACT_SINGLE_R_GUARDS_PASS');
 // Browser copy/download are diagnostic and separately reported, not false PASS.
 ws.close();
}catch(e){report.status='FAIL_AT_BROWSER_GUARD';report.error=String(e?.stack||e).slice(0,1200);process.exitCode=1;}
finally{
 for(const [name,b] of originalBytes){try{const p=path.join(outputDir,name);if(b===null)fs.rmSync(p,{force:true});else fs.writeFileSync(p,b)}catch{}}
 forceStop(browser);forceStop(preview);
 try{fs.rmSync(tmp,{recursive:true,force:true})}catch{}
 console.log(JSON.stringify(report));
 if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,`status=${report.status}\nclipboard=${report.clipboardVerified?'PASS':'HOLD'}\ndownload=${report.downloadVerified?'PASS':'HOLD'}\n`);
}
