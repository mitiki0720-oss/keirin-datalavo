/** STEP10-01AR NONDEPLOY: source-backed generated JSON, synthetic JSJ001 attestations only.
 * Test the ACTUAL AQ PageImplementations buildPredictionExportText function, not a rewriting.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {assertJsj001Jsj006Exact} from '../scripts/lib/official-entry-crosscheck.mjs';
const require=createRequire(import.meta.url);
let ts;
try { ts=require('typescript'); } catch { ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript'); }
const root=path.resolve(import.meta.dirname,'..');
const dataPath=(name)=>{
  const fixture=path.resolve(root,'fixtures',name);
  return fs.existsSync(fixture)?fixture:path.resolve(root,'public/data/races',name);
};
const json=(name)=>JSON.parse(fs.readFileSync(dataPath(name),'utf8'));
const original=json('keirin-jp-entries.generated.json');
const today=json('today.generated.json');
const helperSource=fs.readFileSync(path.join(root,'src/lib/predictionGptSourceContract.ts'),'utf8');
const strictSource=fs.readFileSync(path.join(root,'src/lib/strictOfficialRegistrationMaterial.ts'),'utf8');
const pageSource=fs.readFileSync(path.join(root,'src/pages/PageImplementations.tsx'),'utf8').replace(/^\uFEFF/u,'');
function loadTS(source,name,foreign={}){
 const compiled=ts.transpileModule(source,{fileName:name,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}});
 assert.equal(compiled.diagnostics?.length??0,0,name+' TS compilation diagnostics');
 const module={exports:{}};
 const localRequire=(key)=>{
   if(Object.hasOwn(foreign,key))return foreign[key];
   throw Error('Unexpected require '+key);
 };
 vm.runInNewContext('(function(module,exports,require){'+compiled.outputText+'\n})',{}, {filename:name})(module,module.exports,localRequire);
 return module.exports;
}
const helper=loadTS(helperSource,'predictionGptSourceContract.ts');
const strict=loadTS(strictSource,'strictOfficialRegistrationMaterial.ts',{'./predictionGptSourceContract':helper});
const proof=structuredClone(original);
let eventCount=0, riderCount=0;
for(const venue of proof.venues){
  for(const race of venue.races){
    if(race.entryStatus!=='available'||!(race.entries?.length)) continue;
    const syntheticDetails=race.entries.map(e=>({carNum:e.carNo,numPlayer:e.registrationNo}));
    const att=assertJsj001Jsj006Exact({
      date:proof.date,venueCode:venue.venueCode,raceNumber:race.raceNumber,
      entryVenueCode:race.official?.bKeirinjyoCd,
      detailDate:proof.date.replaceAll('-',''),detailVenueCode:venue.venueCode,detailRaceNumber:race.raceNumber,
      entries:race.entries,detailRiders:syntheticDetails,
    });
    race.quality={...race.quality,entryDetailCrosscheck:{...att,checkedAt:'2026-11-05T05:00:00Z'}};
    eventCount++;riderCount+=race.entries.length;
  }
}
assert.equal(eventCount,79);assert.equal(riderCount,575);
const originalBytes=fs.readFileSync(dataPath('keirin-jp-entries.generated.json'));
const originalHash=crypto.createHash('sha256').update(originalBytes).digest('hex');
const syntheticBytes=Buffer.from(JSON.stringify(proof)+'\n','utf8');
const syntheticHash=crypto.createHash('sha256').update(syntheticBytes).digest('hex');
assert.notEqual(syntheticHash,originalHash);
const evidence={snapshot:proof,expectedSha256:syntheticHash,actualSha256:syntheticHash};
const index=strict.indexOfficialRegistrationSnapshot(proof);
assert.equal(index.valid,true,index.reason);
let passed=0, blocked=0, failures=[];
for(const venue of today.venues){
  for(const race of venue.races){
    for(const rider of race.riders??[]){
      const args={date:today.date,venueCode:venue.venueCode,raceNo:race.raceNo,rider,index,evidence};
      const ok=strict.resolveStrictRegistration(args);
      if(ok.registrationNo!=='null'){
        passed++;assert.equal(ok.source,'KEIRIN.JP:JSJ006');
        assert.equal(ok.status,'internal-feed-exact-match');
        assert.equal(ok.evidence,'internal-generated-feed-only');
      }else failures.push({venueCode:venue.venueCode,raceNo:race.raceNo,carNo:rider.carNo,reason:ok.reason});
      const old=strict.resolveStrictRegistration({...args,evidence:{snapshot:original,expectedSha256:originalHash,actualSha256:originalHash},index:strict.indexOfficialRegistrationSnapshot(original)});
      if(old.registrationNo==='null')blocked++;
    }
  }
}
assert.equal(passed,575,'synthetic all-venue proof must admit all riders');
assert.equal(blocked,575,'historical snapshot must remain held');
assert.deepEqual(failures,[]);
const begin=pageSource.indexOf('export const buildPredictionExportText =');
const end=pageSource.indexOf('const buildPredictionBatchRaceCoreText =',begin);
assert.ok(begin>=0&&end>begin,'actual Page export function slice');
const stubStr=()=> 'FIXTURE_ONLY';
const stubs={
 exports:{},
 buildStrictOfficialRegistrationMaterial:strict.buildStrictOfficialRegistrationMaterial,
 indexOfficialRegistrationSnapshot:strict.indexOfficialRegistrationSnapshot,
 resolveStrictRegistration:strict.resolveStrictRegistration,
 getPredictionMaterialRidersForKeirinRace:(race)=>race.riders??[],
 isPredictionRaceExcludedByOperation:()=>false,
 buildPredictionExportContextsFromRiders:(riders)=>riders.map(rider=>({rider})),
 buildPredictionBasicRiderExport:stubStr,buildPredictionPlayerCardInsightExport:stubStr,
 buildPredictionRecentPerformanceExport:stubStr,buildPredictionRecentRaceExport:stubStr,
 buildPredictionMatchupExport:stubStr,buildPredictionTrackAffinityExport:stubStr,
 buildPredictionDataAnalysisExport:stubStr,buildPredictionOddsExport:stubStr,
 getPredictionRaceIdForVenue:()=> 'fixture-id',
 normalizePredictionExportValue:(value,fallback)=>String(value??fallback??'').trim(),
 detectPredictionRookieRaceCategory:()=>null,getPredictionRookieRaceLabel:()=>'',
 buildPredictionKdreamsLineupExport:stubStr,
 getPredictionSessionBadge:()=> 'day',
 buildPredictionVenueSummaryExportLines:()=> ['STUB_VENUE_SUMMARY'],
 formatPredictionWeatherReferenceForExport:stubStr,
 buildPredictionMemoExport:stubStr,
};
const output=ts.transpileModule(pageSource.slice(begin,end),{fileName:'actual-PageImplementations-fn.tsx',compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}});
assert.equal(output.diagnostics?.length||0,0,'actual Page function parse');
vm.runInNewContext(output.outputText,stubs,{filename:'actual-buildPredictionExportText.js'});
const exportText=stubs.exports.buildPredictionExportText;
assert.equal(typeof exportText,'function');
const venue=today.venues[0], race=venue.races[0];
const base={date:today.date,feed:today,venue,race,materialRace:race,materialRiders:race.riders,
 registrationCandidates:[{playerName:'藤田真',registrationNo:'99999',source:'kurari-ex-rider-identity'}],
 gradeLabel:venue.grade??'A',venueSummary:{},weather:null,weatherFallbackText:'未取得',memo:'',riderBasicText:'',playerCardInsightText:'',recentPerformanceText:'',recentRaceText:'',matchupText:'',trackAffinityText:'',dataAnalysisText:'',oddsText:'',kurariExGuidanceText:'',preRaceRiskSignalText:''};
const normal=exportText({...base,strictRegistrationEvidence:evidence});
assert.ok(normal.includes('[A. レース基本情報]'),'positive race must include real body');
assert.ok(normal.includes('[B. KDreams 並び予想 / 周回予想]'));
assert.ok(normal.includes('KEIRIN.JP:JSJ006'));
assert.ok(normal.includes('014032 / KEIRIN.JP:JSJ006 / internal-feed-exact-match'),'confirmed official number emitted');
assert.ok(!normal.includes('REGISTRATION_EVIDENCE_HOLD'));
assert.ok(!normal.includes('99999'));
const invalid=exportText({...base,strictRegistrationEvidence:{snapshot:original,expectedSha256:originalHash,actualSha256:originalHash}});
assert.ok(invalid.includes('REGISTRATION_EVIDENCE_HOLD'),'historical race must hold');
assert.ok(!invalid.includes('[A. レース基本情報]'));
assert.ok(!invalid.includes('014032'),'historical unverified ID must not leak into contract');
const wrongSha=exportText({...base,strictRegistrationEvidence:{...evidence,expectedSha256:originalHash}});
assert.ok(wrongSha.includes('REGISTRATION_EVIDENCE_HOLD'));
const badRiders=structuredClone(race.riders);badRiders[0].registrationNo='999999';
const wrongRider=exportText({...base,materialRiders:badRiders,strictRegistrationEvidence:evidence});
assert.ok(wrongRider.includes('REGISTRATION_EVIDENCE_HOLD'));
assert.ok(!wrongRider.includes('999999'));
const emptyRider=exportText({...base,materialRiders:[],materialRace:{...race,riders:[]},strictRegistrationEvidence:evidence});
assert.ok(emptyRider.includes('REGISTRATION_EVIDENCE_HOLD'));
const result={status:'AR_REAL_EXPORT_FUNCTION_OFFLINE_PASS',date:today.date,races:eventCount,riders:riderCount,
 syntheticPositive:passed,originalEvidenceBlocked:blocked,sourceCandidateIgnored:true,
 actualPageFunctionTests:5,conditions:['synthetic same-edition positive','old unverified hold','wrong byte SHA hold','wrong individual ID hold','empty riders hold'],
 officialApiFetched:false,jsj001Details:'SYNTHETIC generated from saved JSJ006 (NOT a live official crosscheck)',reactFullAppE2E:false,
 officialSnapshotOriginalSHA256:originalHash,syntheticSnapshotSHA256:syntheticHash,
 pageSourceGitBlob:'451bc46baddf47da588d9c3605378a69d6f85cd2'};
const evidencePath=path.join(root,'evidence/AR_REAL_FUNCTION_QA.json');
if (fs.existsSync(path.join(root,'fixtures'))) fs.writeFileSync(evidencePath,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
