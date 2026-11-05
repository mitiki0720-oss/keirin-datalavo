/** AS supplemental browser smoke, not a clipboard/TXT proof. Read-only DOM. */
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const paths=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'];
const chrome=paths.find(p=>fs.existsSync(p));
const out={status:'WAIT_BROWSER',chromePresent:!!chrome,site:'https://mitiki0720-oss.github.io/keirin-datalavo/',clipboardVerified:false,actualAppCopyButtonClicked:false};
if(chrome){
 const r=spawnSync(chrome,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--virtual-time-budget=9500','--dump-dom',out.site],{timeout:29000,encoding:'utf8',maxBuffer:8*1024*1024});
 const html=r.stdout||'';
 out.chromeExit=r.status;out.htmlBytes=Buffer.byteLength(html);out.hasRoot=/<div[^>]+id=["']root["']/iu.test(html);out.hasPageContent=/競輪|KURARI|予想|keirin/iu.test(html);
 out.status=r.status===0&&out.hasRoot&&out.hasPageContent?'HTTPS_CHROME_DOM_SMOKE_PASS':'WAIT_BROWSER_RENDER_OR_NETWORK';
 if(r.error)out.error=String(r.error.message).slice(0,220);
}
console.log(JSON.stringify(out));

if(process.env.GITHUB_OUTPUT){
  const {appendFileSync}=await import('node:fs');
  appendFileSync(process.env.GITHUB_OUTPUT, `status=${out.status}\n`);
}
