/** AS source probe -- READ ONLY, limited to ONE race and four official GETs.
 * Any network/API failure means WAIT_SOURCE, never a fabricated official PASS.
 * The branch's old saved 11/05 JSON is for cross-version comparison only.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { assertJsj001Jsj006Exact } from '../scripts/lib/official-entry-crosscheck.mjs';
const root=path.resolve(import.meta.dirname,'..');
const normDate=x=>{const s=String(x??'').replace(/\D/gu,'');return /^\d{8}$/u.test(s)?`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`:''};
const txt=x=>String(x??'').trim();
const lastSnapshot=JSON.parse(fs.readFileSync(path.join(root,'public/data/races/keirin-jp-entries.generated.json'),'utf8'));
const expectedDate=lastSnapshot.date;
const base='https://keirin.jp/pc/json';
const request=async(url)=>{
  const u=new URL(url);
  if(u.origin!=='https://keirin.jp'||u.pathname!=='/pc/json') throw Error('unexpected official URL');
  const r=await fetch(u.toString(),{headers:{accept:'application/json,text/plain,*/*','user-agent':'keirin-datalavo-as-review/0.1'},signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw Error('official HTTP '+r.status);
  const buffer=Buffer.from(await r.arrayBuffer());
  if(buffer.length<10||buffer.length>5000000)throw Error('official body length outside safe range');
  const data=JSON.parse(buffer.toString('utf8'));
  return {data,bytes:buffer.length,sha256:crypto.createHash('sha256').update(buffer).digest('hex')};
};
const official=(type,encp)=>{const u=new URL(base);u.searchParams.set('encp',encp);u.searchParams.set('type',type);return u.toString()};
const status={status:'WAIT_SOURCE',requestedDate:expectedDate,officialQueries:0,matchedRows:0,officialUrl:base, officialIndependentSamples:0,officialIndividualProfileVerified:false,liveSource:true};
try{
  const listUrl='https://keirin.jp/pc/json?kaisaibikbn=0&kanyusyaflg=false&shccp=0&dispid=PJ0326&type=JSJ048';
  const list=await request(listUrl);status.officialQueries++;
  const venues=Array.isArray(list.data?.RaceList)?list.data.RaceList:[];
  const candidate=venues.find(v=>normDate(v.kaisaiDate??v.selKaisai??v.kaisaiDateDisp??v.kaisaiBi)===expectedDate && txt(v.touhyouLivePara));
  if(!candidate){status.status='WAIT_SOURCE_NO_SAME_DATE';status.liveListDates=[...new Set(venues.map(v=>normDate(v.kaisaiDate??v.selKaisai)).filter(Boolean))];}
  else {
    const venue=await request(official('JSJ001',txt(candidate.touhyouLivePara)));status.officialQueries++;
    const parent=venue.data?.C0201data??{};
    const venueCode=txt(parent.selKjyoCd);
    const meta=(Array.isArray(parent.C0201race)?parent.C0201race:[]).find(r=>txt(r.encParaR));
    if(!meta||normDate(parent.selKaisai)!==expectedDate){status.status='WAIT_SOURCE_VENUE_DETAIL_UNAVAILABLE';}
    else{
      const raceNo=Number(meta.raceNo??meta.raceNum);
      const [entries,detail]=await Promise.all([request(official('JSJ006',txt(meta.encParaR))),request(official('JSJ001',txt(meta.encParaR)))]);
      status.officialQueries+=2;
      const entryRows=(Array.isArray(entries.data?.sensyuTypeInfo)?entries.data.sensyuTypeInfo:[]).map(x=>({carNo:txt(x.syaban),registrationNo:txt(x.sensyuRegistNo),name:txt(x.sensyuName)}));
      const dj=detail.data?.C0201data??{};
      const detailRows=dj.C0201racedtl?.C0201sensyu??[];
      const check=assertJsj001Jsj006Exact({date:expectedDate,venueCode,raceNumber:raceNo,entryVenueCode:entries.data?.bKeirinjyoCd,detailDate:dj.selKaisai,detailVenueCode:dj.selKjyoCd,detailRaceNumber:dj.selRaceNo,entries:entryRows,detailRiders:detailRows});
      status.status=check.status==='PASS_JSJ001_JSJ006_EXACT'?'LIVE_JSJ001_JSJ006_SAMPLE_PASS':'FAIL_UNEXPECTED_CHECK';
      status.officialIndependentSamples=1;status.matchedRows=check.rowCount;
      status.sampleRaceKey=[expectedDate,venueCode,raceNo].join('|');
      status.listSha256=list.sha256;status.entryResponseSha256=entries.sha256;status.detailResponseSha256=detail.sha256;
      const storedVenue=(lastSnapshot.venues||[]).find(x=>Number(x.venueCode)===Number(venueCode));
      const storedRace=(storedVenue?.races||[]).find(x=>Number(x.raceNumber)===raceNo);
      const stored=(storedRace?.entries||[]).map(x=>[txt(x.carNo),txt(x.registrationNo)]).sort((x,y)=>Number(x[0])-Number(y[0]));
      const live=entryRows.map(x=>[x.carNo,x.registrationNo]).sort((x,y)=>Number(x[0])-Number(y[0]));
      status.matchesArchivedGeneratedRows=stored.length===live.length&&stored.every((x,i)=>x[0]===live[i][0]&&x[1]===live[i][1]);
      status.savedSnapshotRecordCount=stored.length;
      status.liveDate=expectedDate;status.dataSource='KEIRIN.JP JSJ048 + per-race JSJ001 + JSJ006, read-only';
    }
  }
}catch(e){status.status='WAIT_SOURCE_OFFICIAL_FETCH_OR_SHAPE';status.error=String(e?.message??e).slice(0,320)}
console.log(JSON.stringify(status));
// Observational script: no network/snapshot issue may be silently called PASS.
// A separate gating test verifies the code, not the availability of a live endpoint.

if(process.env.GITHUB_OUTPUT){
  const {appendFileSync}=await import('node:fs');
  appendFileSync(process.env.GITHUB_OUTPUT, `status=${status.status}\n`);
}
