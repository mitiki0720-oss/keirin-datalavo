import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ap-generator-'));
let checked=0;
try {
 for(const scenario of ['normal','wrong-id','duplicate-detail','wrong-date']) {
  const output=path.join(tmp,`${scenario}.json`);
  const args=['--import=./tests/ap-fetch-mock.mjs','scripts/update-keirin-jp-entries.mjs',
    `--expect-date=2026-11-05`,`--output=${output}`,`--delay-ms=0`];
  if(scenario!=='normal')args.push('--write-public'); // fail safely, with explicit temp output path
  const r=spawnSync(process.execPath,args,{cwd:process.cwd(),encoding:'utf8',timeout:20000,
    env:{...process.env,AP_MOCK_CASE:scenario,GITHUB_ACTIONS:'false'}});
  if(scenario==='normal'){
    assert.equal(r.status,0,`generator normal failed ${r.stderr}`);
    const doc=JSON.parse(fs.readFileSync(output,'utf8'));
    const race=doc.venues[0].races[0];
    assert.equal(race.entryStatus,'available');
    assert.equal(race.quality.entryDetailCrosscheck.status,'PASS_JSJ001_JSJ006_EXACT');
    assert.equal(race.quality.entryDetailCrosscheck.rowCount,2);
    assert.equal(race.quality.entryDetailCrosscheck.entryType,'JSJ006');
    assert.equal(race.quality.entryDetailCrosscheck.detailType,'JSJ001');
    assert.equal(race.entries[1].registrationNo,'12345');
    assert.match(race.quality.entryDetailCrosscheck.checkedAt,/^2026|^20\d{2}-/);
    checked+=7;
  } else {
    assert.notEqual(r.status,0,`expected official-source mismatch refusal ${scenario}`);
    assert.equal(fs.existsSync(output),false,`must not write a failed public candidate ${scenario}`);
    assert.match(r.stderr+r.stdout,/has 1 fetch errors|identity check failed|failed/i);
    checked+=3;
  }
 }
 console.log(JSON.stringify({scenarios:4,assertions:checked,normal:'PASS',wrongId:'REFUSED',duplicateDetail:'REFUSED',wrongDate:'REFUSED',writesToActualPublic:false,officialHttpFetched:false}));
} finally {fs.rmSync(tmp,{recursive:true,force:true})}
