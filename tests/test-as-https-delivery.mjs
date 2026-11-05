/** AS read-only live HTTPS source-integrity observation.
 * Compare HTTP-delivered bytes against pinned origin/main Git blobs, then
 * validate the published today->entries SHA and per-race JSJ001 attestations.
 * Never infer a matching version from dates, URLs, or HTTP 200 alone.
 */
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const repo='https://mitiki0720-oss.github.io/keirin-datalavo/';
const files=['today.generated.json','keirin-jp-entries.generated.json'];
const result={status:'WAIT_SOURCE',pagesBase:repo,mainSha:null,httpsReadOnly:true,httpStatuses:{},sameBytesAsMain:{},registrationEvidence:'UNVERIFIED',osClipboardTested:false};
const fromGit=(sha,name)=>execFileSync('git',['show',`${sha}:public/data/races/${name}`],{maxBuffer:32*1024*1024});
let commit='';
try{commit=execFileSync('git',['rev-parse','origin/main'],{encoding:'utf8'}).trim();result.mainSha=commit;}catch(e){result.gitError=String(e?.message??e).slice(0,150)}
const deployed={};
for(const file of files){
 try{
  const r=await fetch(new URL(`data/races/${file}`,repo),{cache:'no-store',signal:AbortSignal.timeout(13000)});
  result.httpStatuses[file]=r.status;
  if(!r.ok)continue;
  const b=Buffer.from(await r.arrayBuffer());
  if(b.length>16*1024*1024||b.length<30)throw Error('unexpected file size');
  const obj=JSON.parse(b.toString('utf8'));
  deployed[file]={b,obj};result[`deliveredSha256_${file}`]=hash(b);result[`deliveredBytes_${file}`]=b.length;
  if(commit){const expected=fromGit(commit,file);result.sameBytesAsMain[file]=hash(expected)===hash(b);result[`mainSha256_${file}`]=hash(expected)}
 }catch(e){result.httpStatuses[file]=result.httpStatuses[file]??'FETCH_ERROR';result[`${file}_error`]=String(e?.message??e).slice(0,220)}
}
if(files.every(f=>deployed[f])){
 const today=deployed[files[0]].obj,entries=deployed[files[1]].obj;
 const actual=hash(deployed[files[1]].b),expected=today.source?.officialEntriesSha256??null;
 result.todayDate=today.date;result.officialDate=entries.date;result.expectedOfficialSha256=expected;
 result.actualOfficialSha256=actual;
 let races=0,withAtt=0,riders=0,attestedRiders=0;
 for(const venue of entries.venues??[])for(const race of venue.races??[]){
  if(!Array.isArray(race.entries)||!race.entries.length)continue;
  races++;riders+=race.entries.length;
  const a=race.quality?.entryDetailCrosscheck;
  if(a?.status==='PASS_JSJ001_JSJ006_EXACT'&&a?.date===entries.date&&Number(a.venueCode)===Number(venue.venueCode)&&Number(a.raceNo)===Number(race.raceNumber)&&Number(a.rowCount)===race.entries.length&&a.entryType==='JSJ006'&&a.detailType==='JSJ001'){withAtt++;attestedRiders+=race.entries.length;}
 }
 result.officialRaces=races;result.officialRiders=riders;result.attestedRaces=withAtt;result.attestedRiders=attestedRiders;
 const matched=expected!==null&&expected===actual&&today.date===entries.date;
 const sameGit=files.every(f=>result.sameBytesAsMain[f]===true);
 if(!expected)result.status='HOLD_NO_PAIRED_VERSION_MANIFEST';
 else if(!matched)result.status='FAIL_PUBLISHED_SHA_OR_DATE_MISMATCH';
 else if(withAtt!==races||races===0)result.status='HOLD_PARTIAL_OR_MISSING_JSJ001_EVIDENCE';
 else if(!sameGit)result.status='HOLD_GITHUB_PAGES_NOT_SAME_MAIN_BYTES';
 else {result.status='PASS_DISTRIBUTED_FEED_PAIR';result.registrationEvidence='INTERNAL_GENERATED_JSJ001_JSJ006_EXACT';}
}else result.status='WAIT_SOURCE_PAGES_JSON_UNREACHABLE';
console.log(JSON.stringify(result));

if(process.env.GITHUB_OUTPUT){
  const {appendFileSync}=await import('node:fs');
  appendFileSync(process.env.GITHUB_OUTPUT, `status=${result.status}\n`);
}
