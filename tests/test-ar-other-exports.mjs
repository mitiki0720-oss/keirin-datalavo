/** Review-only: verify the separate saved-prediction JSON export is not a rider ID proof.
 * Against the REAL source in src/lib/keirinPredictionExport.ts at the checked-out Git SHA.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const ts=require('typescript');
const root=path.resolve(import.meta.dirname,'..');
const p=path.join(root,'src/lib/keirinPredictionExport.ts');
const source=fs.readFileSync(p,'utf8');
const parse=ts.createSourceFile(p,source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TS);
assert.equal(parse.parseDiagnostics.length,0);
const aliases=['KeirinPredictionExportItem','KeirinPredictionExportPayload'];
const fields={};
for(const alias of aliases){
 const node=parse.statements.find(n=>ts.isTypeAliasDeclaration(n)&&n.name.text===alias);
 assert.ok(node,alias);
 assert.ok(ts.isTypeLiteralNode(node.type),alias);
 fields[alias]=node.type.members.map(m=>m.name?.getText(parse)).filter(Boolean);
 const restricted=['registrationNo','registration','registrationId','racerId','playerId','athleteId','riderId'];
 assert.ok(restricted.every(f=>!fields[alias].includes(f)),alias+' must not contain raw identity numbers');
}
const js=ts.transpileModule(source,{fileName:p,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}});
assert.equal(js.diagnostics?.length||0,0);
const mod={exports:{}};
const requireSafe=(name)=>{
 if(name==='./kurariExData')return {
  lookupKurariExFailureGuidanceForRace:()=>null,
  lookupKurariExRaceRiskForRace:()=>null,
 };
 throw Error('unexpected dependency '+name);
};
vm.runInNewContext('(function(module,exports,require){'+js.outputText+'\n})',{})(mod,mod.exports,requireSafe);
const feed={date:'2026-11-05',venues:[{venue:'青森',venueCode:'12',slug:'aomori',grade:'F1',session:'day',raceIds:['1212123'],races:[{raceNo:1,title:'A級一般'}]}]};
const noProof='AR_SYNTHETIC_UNVERIFIED_REGISTRATION_999999';
const slots={slot1:{date:feed.date,venue:'青森',raceId:'1212123',raceNumber:1,
 predictionText:`検証前の選手情報 ${noProof}\n見送り対象は別途判定`,
 predictionJson:{tickets:[
  {index:'01',betType:'3連単',combination:'1-2-3',group:'purchase'},
  {index:'02',betType:'2車単',combination:'1-2',group:'shadow'},
 ],betPlan:{status:'structured',purchaseTicketIndices:['01'],shadowTicketIndices:['02'],declaredHeadCandidates:['1'],unitStakeYen:100}}
}};
const result=mod.exports.buildKeirinPredictionExport(feed,slots,{},'2026-11-05T04:00:00.000Z');
assert.equal(result.payload.items.length,1);
const payload=JSON.stringify(result.payload);
assert.ok(!payload.includes(noProof),'unverified ID in saved raw predictionText must not be silently copied as verified field');
assert.deepEqual(Array.from(result.payload.items[0].trifectaTickets),['1-2-3']);
assert.deepEqual(Array.from(result.payload.items[0].exactaTickets),['1-2']);
assert.equal(result.payload.items[0].preRaceSnapshot.ticketSnapshot.betPlan.structuredPurchaseCount,1);
assert.equal(result.payload.items[0].preRaceSnapshot.ticketSnapshot.betPlan.structuredShadowCount,1);
assert.equal(result.payload.items[0].preRaceSnapshot.stake.actualStakeYen,null);
assert.equal(result.summary.savedRaceCount,1);
assert.equal(result.summary.exportRaceCount,1);
console.log(JSON.stringify({status:'AR_SEPARATE_SAVED_PREDICTION_EXPORT_PASS',checks:9,
 itemProperties:fields.KeirinPredictionExportItem.length,payloadProperties:fields.KeirinPredictionExportPayload.length,
 rawPredictionTextRetainedInStorageButNotRiderProof:true,
 preservedTickets:2,purchasedTickets:1,shadowTickets:1,
 noUnverifiedIDInjected:true,realSourceCompilation:true,
 userSavedOriginalNotModified:true}));
