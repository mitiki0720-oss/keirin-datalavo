import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {readOfficialEntriesWithDigest} from '../scripts/lib/official-entry-crosscheck.mjs';
const source = process.env.AP_ENTRIES_FIXTURE || 'public/data/races/keirin-jp-entries.generated.json';
const bytes=await fs.readFile(source);
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'ap-sha-test-'));
try {
 const target=path.join(temp,'official.json');await fs.writeFile(target,bytes);
 const {payload,counts}=await readOfficialEntriesWithDigest(target,'2026-11-05',(p,d)=>{
   assert.equal(p.date,d);return {races:p.raceCount,riders:p.totalEntryCount};
 });
 const before=payload.__verifiedOfficialEntriesSha256;
 assert.equal(before,createHash('sha256').update(bytes).digest('hex'));
 assert.ok(!JSON.stringify(payload).includes('__verifiedOfficialEntriesSha256'));
 assert.equal(Object.prototype.propertyIsEnumerable.call(payload,'__verifiedOfficialEntriesSha256'),false);
 assert.equal(counts.riders,575);
 assert.equal(counts.races,79);
 const altered=Buffer.concat([bytes,Buffer.from(' ')]);
 await fs.writeFile(target,altered);
 const again=await readOfficialEntriesWithDigest(target,'2026-11-05',(p,d)=>{assert.equal(p.date,d);return {}});
 assert.notEqual(again.payload.__verifiedOfficialEntriesSha256,before);
 assert.equal(payload.__verifiedOfficialEntriesSha256,before);
 await assert.rejects(readOfficialEntriesWithDigest(target,'2026-11-06',(p,d)=>{assert.equal(p.date,d)}));
 console.log(JSON.stringify({checks:9,passed:9,sourceBytes:bytes.length,expectedSha256:before,mutatedWhitespaceChangesHash:true,officialIndependentCheck:false}));
} finally {await fs.rm(temp,{recursive:true,force:true})}
