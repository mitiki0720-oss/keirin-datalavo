/** Nondeploy AT: end-to-end manifest and original-vs-synthetic safety contract. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import { assertJsj001Jsj006Exact, readOfficialEntriesWithDigest } from '../scripts/lib/official-entry-crosscheck.mjs';
import { validateOfficialTodayEntries } from '../scripts/lib/official-today-source.mjs';
const require=createRequire(import.meta.url);
const ts=require('typescript');
const dir=path.resolve(import.meta.dirname,'..');
const origPath=path.join(dir,'public/data/races/keirin-jp-entries.generated.json');
const today=JSON.parse(fs.readFileSync(path.join(dir,'public/data/races/today.generated.json'),'utf8'));
const original=JSON.parse(fs.readFileSync(origPath,'utf8'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const oldHash=hash(fs.readFileSync(origPath));
const strictFile=fs.readFileSync(path.join(dir,'src/lib/strictOfficialRegistrationMaterial.ts'),'utf8');
const resolver=fs.readFileSync(path.join(dir,'src/lib/predictionGptSourceContract.ts'),'utf8');
const vm=await import('node:vm');
function transpile(source,file,mocks={}){
 const x=ts.transpileModule(source,{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}});
 assert.equal(x.diagnostics?.length??0,0);
 const mod={exports:{}};
 vm.runInNewContext('(function(module,exports,require){'+x.outputText+'\n})',{}, {filename:file})(mod,mod.exports,k=>{if(!Object.hasOwn(mocks,k))throw Error('unexpected import '+k);return mocks[k]});
 return mod.exports;
}
const meta=transpile(resolver,'predictionGptSourceContract.ts');
const strict=transpile(strictFile,'strictOfficialRegistrationMaterial.ts',{'./predictionGptSourceContract':meta});
const indexOld=strict.indexOfficialRegistrationSnapshot(original);
assert.equal(indexOld.valid,true);
const sampleToday=today.venues.flatMap(v=>v.races.map(r=>({v,r}))).find(z=>z.r.riders?.length);
const oldDec=strict.resolveStrictRegistration({date:today.date,venueCode:sampleToday.v.venueCode,raceNo:sampleToday.r.raceNo,rider:sampleToday.r.riders[0],evidence:{snapshot:original,expectedSha256:oldHash,actualSha256:oldHash},index:indexOld});
assert.equal(oldDec.registrationNo,'null');
const synthetic=structuredClone(original);
let races=0,riders=0;
for(const venue of synthetic.venues)for(const race of venue.races){if(!(race.entries?.length))continue;
 const att=assertJsj001Jsj006Exact({date:synthetic.date,venueCode:venue.venueCode,raceNumber:race.raceNumber,entryVenueCode:race.official?.bKeirinjyoCd,detailDate:synthetic.date.replaceAll('-',''),detailVenueCode:venue.venueCode,detailRaceNumber:race.raceNumber,entries:race.entries,detailRiders:race.entries.map(e=>({carNum:e.carNo,numPlayer:e.registrationNo}))});
 race.quality={...race.quality,entryDetailCrosscheck:{...att,checkedAt:'SYNTHETIC_ONLY'}};races++;riders+=race.entries.length;
}
assert.equal(races,79);assert.equal(riders,575);
const fixturePath=path.join(dir,'.at-synthetic-entries-tmp.json');
const syntheticBytes=Buffer.from(JSON.stringify(synthetic)+'\n');
try{
 fs.writeFileSync(fixturePath,syntheticBytes);
 const {payload,counts}=await readOfficialEntriesWithDigest(fixturePath,today.date,validateOfficialTodayEntries);
 assert.equal(payload.__verifiedOfficialEntriesSha256,hash(syntheticBytes));
 assert.ok(!Object.keys(payload).includes('__verifiedOfficialEntriesSha256'));
 assert.equal(counts.riderCount,575);
 const index=strict.indexOfficialRegistrationSnapshot(payload);
 assert.equal(index.valid,true,index.reason);
 let confirmed=0;
 for(const v of today.venues)for(const race of v.races)for(const rider of race.riders??[]){
  const decision=strict.resolveStrictRegistration({date:today.date,venueCode:v.venueCode,raceNo:race.raceNo,rider,index,evidence:{snapshot:payload,expectedSha256:hash(syntheticBytes),actualSha256:hash(syntheticBytes)}});
  assert.notEqual(decision.registrationNo,'null',`synthetic ${v.venueCode} ${race.raceNo} ${rider.carNo} ${decision.reason}`);confirmed++;
 }
 assert.equal(confirmed,575);
 const changed=Buffer.concat([syntheticBytes,Buffer.from(' ')]);
 assert.notEqual(hash(changed),hash(syntheticBytes));
 const denied=strict.resolveStrictRegistration({date:today.date,venueCode:sampleToday.v.venueCode,raceNo:sampleToday.r.raceNo,rider:sampleToday.r.riders[0],index,evidence:{snapshot:payload,expectedSha256:hash(syntheticBytes),actualSha256:hash(changed)}});
 assert.equal(denied.registrationNo,'null');assert.equal(denied.status,'version-mismatch-blocked');
 console.log(JSON.stringify({status:'AT_RAW_BYTES_MANIFEST_CONTRACT_PASS',date:today.date,sourceRaces:races,sourceRiders:riders,syntheticProofPassed:confirmed,originalUnverifiedBlocked:true,whitespaceMutationBlocked:true,originalSourceImmutable:true,independentOfficialJSJ001:false}));
}finally{fs.rmSync(fixturePath,{force:true})}
