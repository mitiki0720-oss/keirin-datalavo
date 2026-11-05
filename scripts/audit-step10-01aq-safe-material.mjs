/**
 * AQ nondeploy: behavioral safety assertions, not string-presence-only PASS.
 * Run under npm ci (TypeScript installed). Against the checked-out PR head.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const pathFor = (file) => path.resolve(root, file);
const source = fs.readFileSync(pathFor('src/lib/predictionGptSourceContract.ts'), 'utf8');
const page = fs.readFileSync(pathFor('src/pages/PageImplementations.tsx'), 'utf8').replace(/^\uFEFF/u, '');
const strictSource = fs.readFileSync(pathFor('src/lib/strictOfficialRegistrationMaterial.ts'),'utf8');
const auditLog = [];
const check = (name, fn) => { fn(); auditLog.push({name,status:'PASS'}); };

const parsed = ts.createSourceFile('PageImplementations.tsx',page,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
check('React TSX parses without diagnostics',() => assert.equal(parsed.parseDiagnostics.length,0));
check('no old preview flag can switch default path',() => {
  assert.ok(!page.includes('VITE_AL_STRICT_REGISTRATION_REVIEW'));
  assert.ok(!page.includes('buildPredictionGptMaterialSourceContract'));
});
const exportedFunction = page.slice(page.indexOf('export const buildPredictionExportText ='),page.indexOf('const buildPredictionBatchRaceCoreText ='));
check('single R calls only strict identity contract',() => {
  assert.ok(exportedFunction.includes('const exSourceContractText = buildStrictOfficialRegistrationMaterial({'));
  assert.ok(!exportedFunction.includes('const alReview'));
  assert.ok(exportedFunction.includes('exportRiders.length === 0 || exportRiders.some((rider) => resolveStrictRegistration({'));
  assert.ok(exportedFunction.indexOf('[REGISTRATION_EVIDENCE_HOLD') < exportedFunction.indexOf('[A. レース基本情報]'));
});
check('batch guards all extra sections regardless of flags',() => {
  const begin=page.indexOf('    if (raceMaterials.some((text) => text.includes("[REGISTRATION_EVIDENCE_HOLD"))) {');
  const end=page.indexOf('    return {\n      text: targetRaces.length',begin);
  assert.ok(begin>=0 && end>begin);
  const guarded=page.slice(begin,end);
  assert.ok(guarded.includes('【まとめ素材保留 / REGISTRATION_EVIDENCE_HOLD】'));
  assert.ok(!guarded.includes('import.meta.env'));
  const f=new Function('raceMaterials','startR','endR','maxRaceNumber','targetRaces',guarded+'\nreturn null;');
  const sentinel='594839_PRIVATE_ID_FROM_UNVERIFIED_AUXILIARY';
  const held=f(['[REGISTRATION_EVIDENCE_HOLD] '+sentinel],1,7,9,[1]);
  assert.ok(held?.text.includes('まとめ素材保留'));
  assert.ok(!held.text.includes(sentinel));
  assert.equal(f(['no holds'],1,7,9,[1]),null);
});
check('copy and download handlers reject held material',() => {
  for(const line of [
    'const handlePredictionCopy = async () => {',
    'const handlePredictionDownload = () => {',
    'const handleLegacyPredictionBatchCopy = async () => {',
    'const copyBatchMaterial = async () => {',
  ]) {
    const at=page.indexOf(line);
    assert.ok(at>=0,line);
    const initial=page.slice(at,at+650);
    assert.ok(initial.includes('REGISTRATION_EVIDENCE_HOLD'),line);
    assert.ok(!/if\s*\(\s*(?:false\s*&&|true\s*\|\|)/u.test(initial), 'constant bypass in '+line);
    assert.ok(initial.includes('return;'), 'held material must return from '+line);
  }
});
check('no browser-side implicit rider ID backfill',() => {
  assert.ok(!page.includes('buildKeirinJpEntryRegistrationLookup'));
  assert.ok(!page.includes('enrichPredictionFeedWithKeirinJpEntries'));
  assert.ok(!page.includes('registrationNoTrustStatus: "official-entry-match"'));
  assert.ok(page.includes('const sortedVenues = [...(feed.venues ?? [])].sort(comparePredictionVenues);'));
  assert.ok(page.includes('setPredictionFeed({ ...feed, venues: sortedVenues });'));
  assert.ok(page.includes('actualSha256: actualEntriesSha256'));
  assert.ok(page.includes('expectedSha256: String(feed.source?.officialEntriesSha256 ?? "")'));
});
check('strict module requires exact 4-key, same bytes and recorded JSJ001 check',() => {
  for(const term of ['key(date,venueCode,raceNo,rider.carNo)', 'expectedSha256 !== evidence.actualSha256','PASS_JSJ001_JSJ006_EXACT','KEIRIN.JP:JSJ006'])
    assert.ok(strictSource.includes(term),term);
});

const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});
assert.equal(js.diagnostics?.length||0,0,'TS transpile diagnostics');
const mod=await import('data:text/javascript;base64,'+Buffer.from(js.outputText,'utf8').toString('base64'));
const base={date:'2026-11-05',feed:{sourceName:'KEIRIN.JP:JSJ006',sourceFetchedAt:'2026-11-05T04:30:00Z',sourceType:'official'},venue:{venue:'玉野',sourceType:'official'},race:{raceNo:1},riders:[{carNo:1,name:'山田 太郎',registrationNo:'12345',registrationNoSource:'KEIRIN.JP:JSJ006',prefecture:'岡山',term:'123',grade:'A1'}]};
const candidates=[{playerName:'山田太郎',registrationNo:'98765',prefecture:'岡山',term:'123',source:'kurari-ex-rider-identity'}];
check('explicit unverified ID is not emitted by compatibility helper',()=>{
  const out=mod.buildPredictionGptMaterialSourceContract(base);
  assert.ok(out.includes('12345')===false);
  assert.ok(out.includes('null / none / unverified-blocked'));
  assert.ok(out.includes('sourceName: KEIRIN.JP:JSJ006'));
  assert.ok(out.includes('registrationNoProof: unverified'));
});
check('name-prefecture-term identity candidate never fills missing ID',()=>{
  const out=mod.buildPredictionGptMaterialSourceContract({...base,riders:[{...base.riders[0],registrationNo:null}],registrationCandidates:candidates});
  assert.ok(!out.includes('98765'));
  assert.ok(out.includes('null / none / unverified-blocked'));
});
check('same-name conflicting, fuzzy and material IDs are all denied',()=>{
  const poisoned=[...candidates,{...candidates[0],registrationNo:'54321',source:'material-player-exact-detail',fuzzyMatched:true}];
  const out=mod.buildPredictionGptMaterialSourceContract({...base,riders:[{carNo:1,name:'山田 太郎'}],registrationCandidates:poisoned});
  assert.ok(!out.includes('54321')&&!out.includes('98765'));
});
check('official race metadata is not rider registration provenance',()=>{
  const out=mod.buildPredictionGptMaterialSourceContract(base);
  assert.ok(out.includes('sourceType: official'));
  assert.ok(out.includes('registrationNoProof: unverified'));
  assert.ok(!out.includes('12345'));
});
check('no rider case retains explicit null placeholder',()=>{
  const out=mod.buildPredictionGptMaterialSourceContract({...base,riders:[]});
  assert.ok(out.includes('null / null / null / none / unavailable'));
});

export function auditSafeMaterial() { return {status:'SAFE_GPT_REGISTRATION_MIGRATION_PASS',checks:auditLog.length,items:auditLog,source:'source code + transpiled TypeScript behavior; not live official identity'}; }
if (process.argv[1]&&path.resolve(process.argv[1])===pathFor('scripts/audit-step10-01aq-safe-material.mjs'))
  console.log(JSON.stringify(auditSafeMaterial()));
