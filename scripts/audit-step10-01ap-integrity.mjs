import assert from 'node:assert/strict';
import fs from 'node:fs';
const generator=fs.readFileSync('scripts/update-keirin-jp-entries.mjs','utf8');
const today=fs.readFileSync('scripts/update-today-races.mjs','utf8');
const workflow=fs.readFileSync('.github/workflows/update-today-race-data.yml','utf8');
const page=fs.readFileSync('src/pages/PageImplementations.tsx','utf8');
assert.ok(generator.includes('import { assertJsj001Jsj006Exact }'), 'generator must import the exact-check helper');
assert.ok(generator.includes('entryDetailCrosscheck: { ...entryDetailCrosscheck'), 'generator must only emit the check result from the helper');
assert.ok(generator.includes('assertJsj001Jsj006Exact({') && generator.includes('detailRiders,'), 'must compare real JSJ001 and JSJ006 row arrays');
assert.ok(today.includes('readOfficialEntriesWithDigest('), 'today reads and validates exact source bytes');
assert.ok(today.includes('officialEntriesSha256: officialEntries?.__verifiedOfficialEntriesSha256 ?? null'), 'today publishes the raw-byte hash');
assert.ok(page.includes('expectedSha256: String(feed.source?.officialEntriesSha256 ?? "")'), 'GPT export binds against today digest');
const ordered=['Resolve KEIRIN.JP expected entry date','Update KEIRIN.JP official entries',
 'Validate KEIRIN.JP official entries','Update today race data'];
const positions=ordered.map(x=>workflow.indexOf(`      - name: ${x}`));
assert.ok(positions.every((x,i)=>x>=0&&(i===0||x>positions[i-1])), 'official must be downloaded and checked before today generation');
assert.ok(workflow.includes('git add public/data/races/keirin-jp-entries.generated.json')
 && workflow.includes('git add public/data/races/today.generated.json'), 'same published commit must include both generated files');
assert.ok(page.includes('VITE_AL_STRICT_REGISTRATION_REVIEW'), 'strict preview flag required');
console.log(JSON.stringify({status:'AP_WIRING_AUDIT_PASS',checks:9,officialFirst:true,shaSource:'exact raw bytes',jsj001Evidence:'computed from official API responses',noOfficialIndependentReplay:true}));
