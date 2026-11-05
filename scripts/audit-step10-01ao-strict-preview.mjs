import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const ts=require(process.env.AO_TS_PATH || 'typescript');

const entriesPath=process.env.AO_TEST_ENTRIES || 'public/data/races/keirin-jp-entries.generated.json';
const todayPath=process.env.AO_TEST_TODAY || 'public/data/races/today.generated.json';
const actualEntries=JSON.parse(fs.readFileSync(entriesPath,'utf8'));
const today=JSON.parse(fs.readFileSync(todayPath,'utf8'));
const txt=fs.readFileSync('src/lib/strictOfficialRegistrationMaterial.ts','utf8');
const page=fs.readFileSync('src/pages/PageImplementations.tsx','utf8');
const parsed=ts.createSourceFile('PageImplementations.tsx',page,ts.ScriptTarget.ESNext,true,ts.ScriptKind.TSX);
assert.equal(parsed.parseDiagnostics.length,0,'review PageImplementations.tsx parser errors');
assert.ok(page.includes('exportRiders.length === 0 || exportRiders.some((rider) => resolveStrictRegistration'),'zero-rider hold');
assert.ok(page.includes('raceMaterials.some((text) => text.includes("[REGISTRATION_EVIDENCE_HOLD"))'),'all-R whole-batch hold');
assert.equal((page.match(/strictRegistrationEvidence: predictionStrictOfficialRegistrationEvidence/g)||[]).length,2,'single and batch both wired');
const start=page.indexOf('    if (raceMaterials.some((text) => text.includes("[REGISTRATION_EVIDENCE_HOLD"))) {');
const end=page.indexOf('\n\n    return {\n      text: targetRaces.length',start);
assert.ok(start>=0&&end>start,'unconditional whole-batch guard must precede supplemental templates');
const gate=page.slice(start,end);
const checkGate=new Function('raceMaterials','startR','endR','maxRaceNumber','targetRaces',gate+'\nreturn null;');
const sentinel='PRIVATE_UNVERIFIED_RIDER_REG_NO_999999';
assert.ok(!checkGate(['[REGISTRATION_EVIDENCE_HOLD]\n'+sentinel],1,7,7,[1]).text.includes(sentinel),'no unverified content in full batch');
assert.equal(checkGate(['verified'],1,7,7,[1]),null,'verified source can continue');
assert.ok(!page.includes('VITE_AL_STRICT_REGISTRATION_REVIEW'),'no unsafe default switch');

const transpiled=ts.transpileModule(txt,{compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.ESNext},reportDiagnostics:true});
assert.equal(transpiled.diagnostics?.length||0,0,'strict resolver TS syntax');
const stub='const resolvePredictionGptSourceMetadata=()=>({sourceName:"unknown",sourceFetchedAt:"unknown",sourceType:"unknown"});';
const js=transpiled.outputText.replace(/^import\s*\{\s*resolvePredictionGptSourceMetadata\s*\}\s*from\s*['"]\.\/predictionGptSourceContract['"];?\s*\n/m,stub+'\n');
assert.ok(js.includes(stub));
const strict=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const indexActual=strict.indexOfficialRegistrationSnapshot(actualEntries);
assert.ok(indexActual.valid,'source schema should parse');
const clone=structuredClone(actualEntries);
let checked=0;
for(const v of clone.venues){
 const tv=(today.venues||[]).find(x=>String(Number(x.venueCode))===String(Number(v.venueCode)));
 assert.ok(tv,'venue missing');
 for(const r of v.races){
  r.quality??={};
  r.quality.entryDetailCrosscheck={status:'PASS_JSJ001_JSJ006_EXACT',date:v.date,venueCode:v.venueCode,raceNo:r.raceNumber,rowCount:r.entries.length,entryType:'JSJ006',detailType:'JSJ001'};
  assert.ok(tv.races.some(x=>x.raceNo===r.raceNumber),'race missing');
  checked+=r.entries.length;
 }
}
assert.ok(checked>0);
const checksum=crypto.createHash('sha256').update(JSON.stringify(clone)).digest('hex');
const good={snapshot:clone,expectedSha256:checksum,actualSha256:checksum};
const raw={snapshot:actualEntries,expectedSha256:checksum,actualSha256:checksum};
const goodIndex=strict.indexOfficialRegistrationSnapshot(clone);
assert.ok(goodIndex.valid);
let accepted=0,blocked=0;
for(const v of clone.venues){
 const tv=today.venues.find(x=>String(Number(x.venueCode))===String(Number(v.venueCode)));
 for(const r of v.races){
  const tr=tv.races.find(x=>x.raceNo===r.raceNumber);
  for(const e of r.entries){
   const rider=tr.riders.find(x=>String(x.carNo)===String(e.carNo));
   assert.ok(rider,'rider missing');
   const args={date:clone.date,venueCode:v.venueCode,raceNo:r.raceNumber,rider};
   const a=strict.resolveStrictRegistration({...args,evidence:good,index:goodIndex});
   assert.equal(a.registrationNo,e.registrationNo);
   accepted++;
   const b=strict.resolveStrictRegistration({...args,evidence:raw,index:indexActual});
   assert.equal(b.registrationNo,'null','unproven original must not claim identity');
   blocked++;
  }
 }
}
const v=clone.venues[0],r=v.races[0],e=r.entries[0],tv=today.venues.find(x=>String(Number(x.venueCode))===String(Number(v.venueCode))),rider=tv.races.find(x=>x.raceNo===r.raceNumber).riders.find(x=>x.carNo===e.carNo);
const q=(candidate,ev=good,idx=goodIndex)=>strict.resolveStrictRegistration({date:clone.date,venueCode:v.venueCode,raceNo:r.raceNumber,rider:candidate,evidence:ev,index:idx});
const missing={...rider,registrationNo:undefined,registration:undefined,registrationNumber:undefined,registrationId:undefined};
assert.equal(q(missing).registrationNo,'null','no name-only completion');
assert.equal(q({...rider,registration:'999999'}).registrationNo,'null','aliases conflict');
assert.equal(q({...rider,registrationNo:'1234'}).registrationNo,'null','invalid digits');
assert.equal(q({...rider,name:'別人',fullName:'別人'}).registrationNo,'null','identity conflict');
assert.equal(q(rider,{...good,actualSha256:'b'.repeat(64)}).registrationNo,'null','different snapshot hash');
const badAtt=structuredClone(clone);badAtt.venues[0].races[0].quality.entryDetailCrosscheck.status='UNVERIFIED';
assert.equal(q(rider,{...good,snapshot:badAtt},strict.indexOfficialRegistrationSnapshot(badAtt)).registrationNo,'null','attestation absence');
const duplicate=structuredClone(clone);duplicate.venues[0].races[0].entries.push(structuredClone(duplicate.venues[0].races[0].entries[0]));
assert.ok(!strict.indexOfficialRegistrationSnapshot(duplicate).valid,'duplicate car must be rejected');
const testFive=structuredClone(clone);testFive.venues[0].races[0].entries[0].registrationNo='12345';
const fiveIndex=strict.indexOfficialRegistrationSnapshot(testFive);
assert.ok(fiveIndex.valid);
const fiveHash=crypto.createHash('sha256').update(JSON.stringify(testFive)).digest('hex');
assert.equal(strict.resolveStrictRegistration({date:clone.date,venueCode:v.venueCode,raceNo:r.raceNumber,rider:{...rider,registrationNo:'12345'},evidence:{snapshot:testFive,expectedSha256:fiveHash,actualSha256:fiveHash},index:fiveIndex}).registrationNo,'12345','5 digit valid according to upstream validator');
console.log(JSON.stringify({status:'AO_REVIEW_TEST_PASS',date:clone.date,officialRows:checked,originalUnverifiedRowsBlocked:blocked,syntheticAttestationRowsPassed:accepted,caseChecks:12,wholeBatchLeakBlocked:true,blankRBlocked:true,defaultStrict:true,originalSourceImmutable:true,liveIndependentOfficialCheck:false}));
