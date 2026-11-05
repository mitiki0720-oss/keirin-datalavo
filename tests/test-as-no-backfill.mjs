/** STEP10-01AS NONDEPLOY: no official number is inserted into today's UI feed.
 * This is a source-contract / regression test, not an independent official check.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
let ts;try{ts=require('typescript')}catch{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}
const root=path.resolve(import.meta.dirname,'..');
const source=fs.readFileSync(path.join(root,'src/pages/PageImplementations.tsx'),'utf8').replace(/^\uFEFF/u,'');
const moduleSource=fs.readFileSync(path.join(root,'src/lib/strictOfficialRegistrationMaterial.ts'),'utf8');
const auditChecks=(page) => {
  const fail=[];
  const needs=[
    ['no name/venue implicit official ID mapper',!page.includes('buildKeirinJpEntryRegistrationLookup')],
    ['no implicit feed enrichment',!page.includes('enrichPredictionFeedWithKeirinJpEntries')],
    ['no unverified official-entry-match status',!page.includes('registrationNoTrustStatus: "official-entry-match"')],
    ['rider feed used without mutation',page.includes('const sortedVenues = [...(feed.venues ?? [])].sort(comparePredictionVenues);')],
    ['original rider feed stored',page.includes('setPredictionFeed({ ...feed, venues: sortedVenues });')],
    ['raw official bytes are SHA-digested',page.includes('sha256Hex(officialBytes)')],
    ['expected is from paired today manifest',page.includes('expectedSha256: String(feed.source?.officialEntriesSha256 ?? "")')],
    ['actual is from received official bytes',page.includes('actualSha256: actualEntriesSha256')],
    ['official evidence remains separate',page.includes('setPredictionStrictOfficialRegistrationEvidence(strictRegistrationEvidence)')],
    ['strict single-R contract',page.includes('buildStrictOfficialRegistrationMaterial({')],
    ['strict all-R gate',page.includes('if (raceMaterials.some((text) => text.includes("[REGISTRATION_EVIDENCE_HOLD")))')],
    ['explicit registration and individual attestation',moduleSource.includes('PASS_JSJ001_JSJ006_EXACT') && moduleSource.includes('no explicit registration number')],
  ];
  for(const [name,pass] of needs){if(!pass)fail.push(name)}
  return {checks:needs.length,failed:fail};
};
const parsed=ts.createSourceFile('PageImplementations.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
assert.equal(parsed.parseDiagnostics.length,0);
const normal=auditChecks(source);
assert.deepEqual(normal.failed,[]);
// Red-team the contract: three previously dangerous shortcuts MUST be detected.
const mutations=[
  source.replace('const sortedVenues = [...(feed.venues ?? [])].sort(comparePredictionVenues);',
    'const sortedVenues = [...(enrichPredictionFeedWithKeirinJpEntries(feed, entriesFeed).venues ?? [])].sort(comparePredictionVenues);'),
  source.replace('setPredictionFeed({ ...feed, venues: sortedVenues });',
    'setPredictionFeed({ ...enrichedFeed, venues: sortedVenues });'),
  source.replace('expectedSha256: String(feed.source?.officialEntriesSha256 ?? "")',
    'expectedSha256: actualEntriesSha256'),
  source.replace('const sortedVenues = [...(feed.venues ?? [])].sort(comparePredictionVenues);',
    'const sortedVenues = [...(feed.venues ?? [])].sort(comparePredictionVenues);\n        registrationNoTrustStatus: "official-entry-match";'),
];
let blocked=0;
for(const candidate of mutations){assert.notEqual(candidate,source); if(auditChecks(candidate).failed.length)blocked++;}
assert.equal(blocked,mutations.length);
console.log(JSON.stringify({status:'AS_UNVERIFIED_FEED_BACKFILL_REJECTED_PASS',checks:normal.checks,mutationsRejected:blocked,realOfficialApiFetched:false,productionChanged:false}));
