import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {verifyPairedOfficialRelease} from '../scripts/lib/step10-01at-pair-release-gate.mjs';
const root=process.env.AT_FIXTURES||new URL('./as/fixtures/',import.meta.url).pathname;
const official=JSON.parse(fs.readFileSync(root+'/keirin-jp-entries.generated.json','utf8'));
const today=JSON.parse(fs.readFileSync(root+'/today.generated.json','utf8'));
const pack=obj=>Buffer.from(JSON.stringify(obj),'utf8');
const sha=b=>createHash('sha256').update(b).digest('hex');
let cases=0;
function check(label,o,t,expected){const v=verifyPairedOfficialRelease(pack(o),t);assert.equal(v.status,expected,label+' '+JSON.stringify(v));cases++;return v;}
check('old archived feeds safely held',official,today,'HOLD');
const synthetic=structuredClone(official);
synthetic.source.fetchStartedAt='2026-11-05T04:31:00.000Z';synthetic.source.fetchCompletedAt='2026-11-05T04:35:00.000Z';
synthetic.preservedCompleteRaceCount=0;
for(const venue of synthetic.venues)for(const race of venue.races){
 race.quality.entryDetailCrosscheck={status:'PASS_JSJ001_JSJ006_EXACT',date:synthetic.date,venueCode:venue.venueCode,raceNo:race.raceNumber,rowCount:race.entries.length,entryType:'JSJ006',detailType:'JSJ001',checkedAt:'2026-11-05T04:32:00.000Z'};
}
const td=structuredClone(today);td.source.officialEntriesSha256=sha(pack(synthetic));
const ok=check('synthetic evidence passes',synthetic,td,'PASS_REVIEW_PAIR');assert.equal(ok.races,79);assert.equal(ok.riders,575);
const change=(o,t,fn)=>{const x=structuredClone(o),y=structuredClone(t);fn(x,y);y.source.officialEntriesSha256=sha(pack(x));return [x,y];};
for(const [label,fn,reason] of [
 ['old carryover',x=>x.preservedCompleteRaceCount=1,'PRESERVED_PRIOR_RACES'],
 ['stale per-race',x=>x.venues[0].races[0].quality.entryDetailCrosscheck.checkedAt='2026-11-05T04:00:00.000Z','RACE_ATTESTATION_MISSING_OR_STALE'],
 ['future per-race',x=>x.venues[0].races[0].quality.entryDetailCrosscheck.checkedAt='2026-11-05T05:00:00.000Z','RACE_ATTESTATION_MISSING_OR_STALE'],
 ['missing proof',x=>delete x.venues[0].races[0].quality.entryDetailCrosscheck,'RACE_ATTESTATION_MISSING_OR_STALE'],
 ['entry duplicate',x=>x.venues[0].races[0].entries.push(structuredClone(x.venues[0].races[0].entries[0])),'RACE_ATTESTATION_MISSING_OR_STALE'],
 ['wrong ID',(_,y)=>y.venues[0].races[0].riders[0].registrationNo='999999','TODAY_RIDER_IDENTITY_MISMATCH'],
 ['missing today rider',(_,y)=>y.venues[0].races[0].riders.shift(),'TODAY_COVERAGE_MISMATCH'],
 ['missing official race',x=>x.venues[0].races.pop(),'TODAY_RIDER_IDENTITY_MISMATCH'],
 ['duplicate today race',(_,y)=>y.venues[0].races.push(structuredClone(y.venues[0].races[0])),'TODAY_RACE_DUPLICATE'],
 ['wrong official source',x=>x.source.entryType='FAKE','OFFICIAL_SCHEMA_OR_DATE_MISMATCH'],
 ['bad source window',x=>x.source.fetchStartedAt='2026-11-05T06:00:00.000Z','SOURCE_FETCH_WINDOW_INVALID'],
]){
 const [x,y]=change(synthetic,td,fn);const actual=check(label,x,y,'HOLD');assert.equal(actual.code,reason,label+' '+JSON.stringify(actual));
}
const wrong=structuredClone(td);wrong.source.officialEntriesSha256='0'.repeat(64);const m=verifyPairedOfficialRelease(pack(synthetic),wrong);assert.equal(m.code,'OFFICIAL_SHA_MANIFEST_MISMATCH');cases++;
const spacing=Buffer.concat([pack(synthetic),Buffer.from(' ')]);const ws=verifyPairedOfficialRelease(spacing,td);assert.equal(ws.code,'OFFICIAL_SHA_MANIFEST_MISMATCH');cases++;
console.log(JSON.stringify({status:'AT_OFFLINE_GATE_TEST_PASS',cases,archiveOriginal:{races:79,riders:575,decision:'HOLD'},syntheticOnly:{races:ok.races,riders:ok.riders,decision:ok.status},liveOfficialProfilesVerified:false,publicationApproved:false}));
