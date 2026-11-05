import assert from 'node:assert/strict';
import fs from 'node:fs';
import {assertJsj001Jsj006Exact,readOfficialEntriesWithDigest} from '../scripts/lib/official-entry-crosscheck.mjs';
const officialFile=process.env.AP_ENTRIES_FIXTURE || 'public/data/races/keirin-jp-entries.generated.json';
const data=JSON.parse(fs.readFileSync(officialFile,'utf8'));
assert.equal(data.date,'2026-11-05','pinned review-only fixture date');
let nRaces=0,nRows=0,negativeRejects=0;
for(const v of data.venues){
 for(const r of v.races){
  assert.ok(Array.isArray(r.entries)&&r.entries.length,'original official fixture must have entries');
  const base={date:v.date,venueCode:v.venueCode,raceNumber:r.raceNumber,
   entryVenueCode:v.venueCode,detailDate:v.date.replaceAll('-',''),
   detailVenueCode:v.venueCode,detailRaceNumber:r.raceNumber,
   entries:r.entries,detailRiders:r.entries.map(e=>({carNum:e.carNo,numPlayer:e.registrationNo}))};
  const result=assertJsj001Jsj006Exact(base);
  assert.equal(result.rowCount,r.entries.length);
  assert.equal(result.status,'PASS_JSJ001_JSJ006_EXACT');
  const wrong=structuredClone(base);
  wrong.detailRiders[0].numPlayer=wrong.detailRiders[0].numPlayer==='99999'?'88888':'99999';
  assert.throws(()=>assertJsj001Jsj006Exact(wrong),/identity check failed/);
  nRaces++;nRows+=r.entries.length;negativeRejects++;
 }
}
assert.equal(nRaces,79);assert.equal(nRows,575);
const {payload}=await readOfficialEntriesWithDigest(officialFile,data.date,(x,d)=>{assert.equal(x.date,d);return {}});
assert.equal(payload.__verifiedOfficialEntriesSha256.length,64);
assert.equal(data.venues[0].races[0].quality?.entryDetailCrosscheck,undefined,'original must not be retro-certified');
console.log(JSON.stringify({races:nRaces,rows:nRows,syntheticPositive:nRows,syntheticMismatchRejected:negativeRejects,
 officialHttpFetched:false,originalAttestationCreated:false,origin:'pinned 2026-11-05 generated JSON; synthetic JSJ001 only'}));
