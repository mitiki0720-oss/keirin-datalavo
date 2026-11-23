import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import yaml from "js-yaml";
import { prepareOfficialConflictArtifact } from "./prepare-official-conflict-artifact.mjs";
import { loadOfficialConflictProof, mergeOfficialResultsWithConflictIsolation } from "./plan-official-result-conflict-isolation.mjs";
import { summarize } from "./update-keirin-jp-results.mjs";

const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const clone = structuredClone;
const read = async file => JSON.parse(await fs.readFile(file, "utf8"));
const root = await fs.mkdtemp(path.resolve(".tmp/artifact-finalization/test-"));
const proof = await loadOfficialConflictProof(path.resolve(".tmp/odawara/acquisition.json"));
const stored = await read(".tmp/odawara/stored-snapshot.json");
const find = snapshot => snapshot.venues.find(venue => venue.venueCode === "36").races.find(race => race.raceNumber === 4);
const incoming = clone(stored); Object.assign(find(incoming), proof.result);
const integrated = mergeOfficialResultsWithConflictIsolation(stored, incoming, [proof]);
const sourceBundle = integrated.evidenceBundles[0].bundle;
const inputSha = sha(JSON.stringify(sourceBundle));
let sequence = 0;
async function fixture({ mutateBundle, mutateSnapshot, files = true, oldSnapshot = false } = {}) {
  const directory = path.join(root, String(sequence++));
  const sourceRoot = path.join(directory, "source"), sourceDate = path.join(sourceRoot, "2026-11-22");
  await fs.mkdir(sourceDate, { recursive: true });
  const bundle = clone(sourceBundle), snapshot = clone(oldSnapshot ? stored : integrated.payload);
  mutateBundle?.(bundle);
  const bytes = Buffer.from(JSON.stringify(bundle)), hash = sha(bytes);
  if (!oldSnapshot) find(snapshot).officialResultConflict.lastEvidenceBundleSha256 = hash;
  mutateSnapshot?.(snapshot);
  const sourceFile = path.join(sourceDate, hash + ".json");
  if (files) await fs.writeFile(sourceFile, bytes, { flag: "wx" });
  const snapshotFile = path.join(directory, "snapshot.json");
  await fs.writeFile(snapshotFile, JSON.stringify(snapshot), { flag: "wx" });
  return { directory, sourceRoot, sourceDate, sourceFile, sourceBytes: bytes, snapshotFile,
    options: { targetDate: "2026-11-22", runStartedAt: "2026-11-22T14:50:00Z", priorJobStatus: "success",
      sourceRoot, snapshotFile, runnerTemp: path.join(directory, "staging"), repositoryRetentionDays: 90, retentionDays: 7 } };
}
async function texts(result) { return (await Promise.all(result.files.map(file => fs.readFile(file, "utf8")))).join("\n"); }
function rawChange(bundle, type, change) {
  const record = bundle.records.find(row => row.type === type), data = JSON.parse(Buffer.from(record.bodyBase64, "base64"));
  change(data); const bytes = Buffer.from(JSON.stringify(data)); record.bodyBase64 = bytes.toString("base64"); record.sha256 = sha(bytes);
}

test("conflict: acquired evidence is selected", async () => { const f = await fixture(); const result = await prepareOfficialConflictArtifact(f.options); assert.equal(result.hasEvidence, true); assert.deepEqual(result.raceIds, ["2026-11-22:36:4"]); assert.equal(result.files.length, 2); });
test("conflict: old and new state preserved after identity redaction", async () => {
  const f = await fixture(), result = await prepareOfficialConflictArtifact(f.options), text = await texts(result);
  assert.match(text, /失格（外帯線内進入）/u); assert.match(text, /失格（外帯線内進入） \/ 落車棄権/u);
  assert.match(text, /previousSignatureSha256/u); assert.match(text, /candidateSignatureSha256/u);
});
test("original response SHA and acquisition time kept", async () => { const f = await fixture(), result = await prepareOfficialConflictArtifact(f.options), text = await texts(result); for (const record of sourceBundle.records) { assert.ok(text.includes(record.sha256)); assert.ok(text.includes(record.fetchedAt)); } });
test("official source is sanitized, no internal request parameters", async () => { const f = await fixture(), text = await texts(await prepareOfficialConflictArtifact(f.options)); assert.match(text, /https:\/\/keirin.jp\/pc\/json\?type=JSJ012/u); assert.doesNotMatch(text, /encp=|encPara|touhyouLivePara|bodyBase64/u); });
test("all player names and registration numbers excluded", async () => {
  const f = await fixture(), text = await texts(await prepareOfficialConflictArtifact(f.options));
  for (const row of proof.result.finishOrder) { assert.ok(!text.includes(row.name)); assert.ok(!text.includes(row.registrationNo)); }
  assert.doesNotMatch(text, /"(?:name|sensyuName|registrationNo|sensyuRegistNo|numPlayer|age|huKen)"\s*:/u);
});
test("profiles and other-race navigation excluded", async () => { const f = await fixture(), text = await texts(await prepareOfficialConflictArtifact(f.options)); assert.doesNotMatch(text, /heikinTokuten|sotugyouki|imgPlayer|C0201kaisai|namePlayer|C0201race"/u); });
test("artifact explicitly documents non-restorability", async () => { const f = await fixture(), text = await texts(await prepareOfficialConflictArtifact(f.options)); assert.match(text, /"originalRestorable": false/u); assert.match(text, /"originalsIncluded": false/u); });
test("source originals remain byte-identical", async () => { const f = await fixture(); const before = await fs.readFile(f.sourceFile); await prepareOfficialConflictArtifact(f.options); assert.deepEqual(await fs.readFile(f.sourceFile), before); assert.equal(sha(JSON.stringify(sourceBundle)), inputSha); });
test("only explicit prepared JSON files are uploaded", async () => {
  const f = await fixture(); await fs.writeFile(path.join(f.sourceDate, "cookie-dump.txt"), "not uploaded");
  const result = await prepareOfficialConflictArtifact(f.options); assert.equal(result.files.length, 2);
  assert.ok(result.files.every(file => file.startsWith(result.directory) && file.endsWith(".json")));
  assert.doesNotMatch(await texts(result), /not uploaded/u);
});
test("no evidence: no empty artifact or staging folder", async () => {
  const f = await fixture({ files: false, oldSnapshot: true }), result = await prepareOfficialConflictArtifact(f.options);
  assert.equal(result.hasEvidence, false); assert.equal(result.files.length, 0); assert.equal(result.status, "NO_NEW_CONFLICT_EVIDENCE");
  await assert.rejects(fs.stat(f.options.runnerTemp), { code: "ENOENT" });
});
test("no actual difference: no artifact", async () => {
  const f = await fixture({ oldSnapshot: true, mutateSnapshot(snapshot) { Object.assign(find(snapshot), proof.result); } });
  assert.equal((await prepareOfficialConflictArtifact(f.options)).hasEvidence, false);
});
test("update failure: acquired evidence still prepared", async () => { const f = await fixture(); const result = await prepareOfficialConflictArtifact({ ...f.options, priorJobStatus: "failure" }); assert.equal(result.hasEvidence, true); const manifest = await read(result.files.at(-1)); assert.equal(manifest.priorJobStatus, "failure"); });
test("cancelled update: acquired evidence still prepared", async () => { const f = await fixture(); assert.equal((await prepareOfficialConflictArtifact({ ...f.options, priorJobStatus: "cancelled" })).hasEvidence, true); });
test("failed update with no proof is not labelled recovery", async () => { const f = await fixture({ files: false, oldSnapshot: true }); const result = await prepareOfficialConflictArtifact({ ...f.options, priorJobStatus: "failure" }); assert.equal(result.status, "UPSTREAM_FAILED_WITHOUT_CONFLICT_EVIDENCE"); assert.equal(result.hasEvidence, false); });
test("newly recorded marker with missing proof fails closed", async () => { const f = await fixture({ files: false }); await assert.rejects(prepareOfficialConflictArtifact(f.options), /REQUIRED_CONFLICT_EVIDENCE_MISSING/u); });
test("old persistent hold without a new observation does not require a new artifact", async () => {
  const f = await fixture({ files: false }); const result = await prepareOfficialConflictArtifact({ ...f.options, runStartedAt: new Date(Date.now() - 60000).toISOString() });
  assert.equal(result.hasEvidence, false);
});
test("stale proof files are not re-uploaded", async () => { const f = await fixture(); assert.equal((await prepareOfficialConflictArtifact({ ...f.options, runStartedAt: new Date(Date.now() - 60000).toISOString() })).hasEvidence, false); });
test("retention 7 is valid under repository setting 90", async () => { const f = await fixture(); assert.equal((await prepareOfficialConflictArtifact(f.options)).retentionDays, 7); });
test("retention cannot silently clamp below 7", async () => { const f = await fixture(); await assert.rejects(prepareOfficialConflictArtifact({ ...f.options, repositoryRetentionDays: 6 }), /RETENTION_LIMIT/u); });
test("missing retention limit is not guessed", async () => { const f = await fixture(); await assert.rejects(prepareOfficialConflictArtifact({ ...f.options, repositoryRetentionDays: undefined }), /RETENTION_LIMIT/u); });
test("other retention duration rejected", async () => { const f = await fixture(); await assert.rejects(prepareOfficialConflictArtifact({ ...f.options, retentionDays: 90 }), /SEVEN_DAYS/u); });
test("wrong target date rejected", async () => { const f = await fixture({ mutateBundle(bundle) { bundle.target.date = "2026-11-21"; } }); await assert.rejects(prepareOfficialConflictArtifact(f.options), /INVALID_CONFLICT_BUNDLE/u); });
test("missing old result identity rejected", async () => { const f = await fixture({ oldSnapshot: true, mutateSnapshot(snapshot) { snapshot.date = "2026-11-23"; } }); await assert.rejects(prepareOfficialConflictArtifact(f.options), /STORED_SNAPSHOT_DATE_OR_SOURCE_MISMATCH/u); });
test("SHA corruption rejected", async () => { const f = await fixture(); await fs.writeFile(f.sourceFile, "{}"); await assert.rejects(prepareOfficialConflictArtifact(f.options), /FILENAME_SHA_MISMATCH/u); });
test("original body SHA corruption rejected", async () => { const f = await fixture({ mutateBundle(bundle) { bundle.records[0].sha256 = "0".repeat(64); } }); await assert.rejects(prepareOfficialConflictArtifact(f.options), /ORIGINAL_RESPONSE_SHA_MISMATCH/u); });
for (const key of ["authorization", "cookie", "access_token", "email", "phone", "homeAddress", "birthDate"]) test(`sensitive input field rejected: ${key}`, async () => {
  const f = await fixture({ mutateBundle(bundle) { rawChange(bundle, "JSJ012", data => { data[key] = "fixture-private-value"; }); } });
  await assert.rejects(prepareOfficialConflictArtifact(f.options), /SENSITIVE_FIELD_REJECTED/u);
  await assert.rejects(fs.stat(f.options.runnerTemp), { code: "ENOENT" });
});
test("credential headers in input are rejected without disclosure", async () => {
  const f = await fixture({ mutateBundle(bundle) { bundle.records[0].headers = { Authorization: "Bearer fixture-secret" }; } });
  await assert.rejects(prepareOfficialConflictArtifact(f.options), /SENSITIVE_FIELD_REJECTED/u);
});
test("token in request URL rejected", async () => { const f = await fixture({ mutateBundle(bundle) { bundle.records[0].url += "&access_token=fixture-secret"; } }); await assert.rejects(prepareOfficialConflictArtifact(f.options), /SENSITIVE_CONTENT_REJECTED/u); });
test("secret in a free-text field rejected", async () => { const f = await fixture({ mutateBundle(bundle) { rawChange(bundle, "JSJ012", data => { data.tyakujyunItemSubData[0].tyakuNote = "Bearer fixture-secret"; }); } }); await assert.rejects(prepareOfficialConflictArtifact(f.options), /SENSITIVE_CONTENT_REJECTED/u); });
test("output persistence failure is fatal", async () => { const f = await fixture(); const blocker = path.join(f.directory, "not-a-directory"); await fs.writeFile(blocker, "blocker"); await assert.rejects(prepareOfficialConflictArtifact({ ...f.options, runnerTemp: blocker })); });
test("artifact preparation cannot write under public data", async () => { const f = await fixture(); await assert.rejects(prepareOfficialConflictArtifact({ ...f.options, runnerTemp: path.resolve("public/data/forbidden-artifact-staging") }), /PUBLIC_ARTIFACT_STAGING_PROHIBITED/u); });

const workflow = yaml.load(await fs.readFile(".github/workflows/update-today-race-data.yml", "utf8"));
const composite = yaml.load(await fs.readFile(".github/actions/official-conflict-artifact/action.yml", "utf8"));
const steps = workflow.jobs["update-race-data"].steps, byName = name => steps.find(step => step.name === name);
const artifact = byName("Preserve official result conflict evidence"), prepare = composite.runs.steps[0], upload = composite.runs.steps[1];
test("workflow adds one logical artifact step", () => { assert.equal(steps.filter(step => step.name === artifact.name).length, 1); assert.equal(artifact.uses, "./.github/actions/official-conflict-artifact"); assert.equal(artifact.with["retention-days"], 7); });
test("artifact outer and inner steps run after upstream failure", () => { assert.match(artifact.if, /^always\(\)/u); assert.equal(prepare.if, "always()"); assert.match(upload.if, /^always\(\)/u); });
test("upload only follows successful preparation with evidence", () => { assert.match(upload.if, /steps.prepare.outcome == 'success'/u); assert.match(upload.if, /has_evidence == 'true'/u); assert.equal(upload.with.path, "${{ steps.prepare.outputs.files }}"); });
test("upload failure is not ignored", () => { assert.equal(artifact["continue-on-error"], undefined); assert.equal(upload["continue-on-error"], undefined); assert.equal(upload.with["if-no-files-found"], "error"); assert.equal(upload.with["retention-days"], 7); });
test("upload contains no broad public or workspace glob", () => { assert.doesNotMatch(upload.with.path, /public|workspace|\*|source|\.tmp/u); assert.equal(upload.with["include-hidden-files"], false); assert.equal(upload.with.overwrite, false); });
test("critical official and today gates remain fail-closed", () => { for (const name of ["Update KEIRIN.JP official results", "Validate KEIRIN.JP official results", "Update today race data", "Validate today race data is not empty", "Commit updated race data"]) assert.equal(byName(name)["continue-on-error"], undefined, name); });
test("EX failures are non-blocking and partial EX files are not staged", () => {
  assert.equal(byName("Generate KURARI EX race risk for current day")["continue-on-error"], true);
  assert.equal(byName("Generate KURARI EX prediction performance")["continue-on-error"], true);
  const commit = byName("Commit updated race data").run;
  assert.match(commit, /if \[ "\$\{\{ steps.ex_race_risk.outcome \}\}" = "success" \]; then/u);
  assert.match(commit, /steps.ex_prediction_performance.outcome \}\}" = "success"/u);
  assert.match(commit, /git add public\/data\/races\/today.generated.json/u);
});
for (const [risk, performance, generated, expected] of [
  ["failure", "failure", "false", []],
  ["failure", "success", "true", ["performance"]],
  ["success", "failure", "false", ["risk"]],
  ["skipped", "skipped", "false", []],
  ["success", "success", "false", ["risk"]],
  ["success", "success", "true", ["risk", "performance"]],
]) test(`EX workflow shell guards: risk=${risk}, performance=${performance}, generated=${generated}`, () => {
  const command = byName("Commit updated race data").run;
  const start = command.indexOf('if [ "${{ steps.ex_race_risk.outcome }}"'), end = command.indexOf("if git diff --cached --quiet;");
  assert.ok(start >= 0 && end > start);
  const fragment = command.slice(start, end).replaceAll("${{ steps.ex_race_risk.outcome }}", risk).replaceAll("${{ steps.ex_prediction_performance.outcome }}", performance);
  const script = `set -e\ngit(){ if [ "$1" != add ]; then exit 90; fi; printf 'MOCK_ADD:%s\\n' "$*"; }\nnode(){ printf '2026-11-22'; }\nPERFORMANCE_GENERATED=${generated}\nPERFORMANCE_DATE=2026-11-22\n${fragment}`;
  const shell = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "/bin/bash";
  const env = { ...process.env }; delete env.BASH_ENV;
  const run = spawnSync(shell, ["--noprofile", "--norc", "-c", script], { encoding: "utf8", env });
  assert.equal(run.status, 0, run.stderr);
  const staged = run.stdout.split("\n").filter(line => line.startsWith("MOCK_ADD:"));
  assert.equal(staged.some(line => line.includes("race-risk")), expected.includes("risk"));
  assert.equal(staged.some(line => line.includes("prediction-performance")), expected.includes("performance"));
});
test("existing schedules, permissions and concurrency unchanged", () => {
  const original = spawnSync("git", ["show", "HEAD:.github/workflows/update-today-race-data.yml"], { encoding: "utf8" }); assert.equal(original.status, 0);
  const base = yaml.load(original.stdout);
  assert.deepEqual(workflow.on, base.on); assert.deepEqual(workflow.permissions, base.permissions); assert.deepEqual(workflow.concurrency, base.concurrency);
  assert.equal(steps.length, base.jobs["update-race-data"].steps.length + 1);
});
test("artifact step contains no git writes, public writes or notification", () => { const text = JSON.stringify(composite); assert.doesNotMatch(text, /git (?:add|commit|push)|SLACK|webhook|deploy|public\/data/u); });

async function acquisition({ failRace = 5, conflict = true, failPersistence = false } = {}) {
  const directory = path.join(root, `acquisition-${sequence++}`);
  await fs.mkdir(directory);
  const snapshot = summarize({ ...clone(stored), venues: [clone(stored.venues.find(row => row.venueCode === "36"))] });
  if (!conflict) Object.assign(find(snapshot), proof.result);
  const snapshotFile = path.join(directory, "snapshot.json"), original = JSON.stringify(snapshot);
  await fs.writeFile(snapshotFile, original, { flag: "wx" });
  const list = await read(".tmp/odawara/raw/JSJ048-kbn0.json");
  list.RaceList = list.RaceList.filter(row => String(row.naibuKeirinCd) === "36");
  const venue = await read(".tmp/odawara/raw/JSJ001-venue.json");
  const responses = { list, [`JSJ001:${list.RaceList[0].touhyouLivePara}`]: venue }, raceByParameter = {};
  for (const [index, meta] of venue.C0201data.C0201race.entries()) {
    raceByParameter[meta.encParaR] = index + 1;
    responses[`JSJ012:${meta.encParaR}`] = index + 1 === failRace ? { fixtureHttpStatus: 503 }
      : index === 3 ? proof.raw.JSJ012 : { resultCd: 0, tyakujyunDispFlg: false, haraiGakuDispFlg: false, tyakujyunItemSubData: [] };
    if (index === 3) { responses[`JSJ006:${meta.encParaR}`] = proof.raw.JSJ006; responses[`JSJ001:${meta.encParaR}`] = proof.raw.JSJ001; }
  }
  const configFile = path.join(directory, "responses.json"), traceFile = path.join(directory, "trace.jsonl"), preload = path.join(directory, "fetch.mjs");
  await fs.writeFile(configFile, JSON.stringify({ responses, raceByParameter }), { flag: "wx" });
  await fs.writeFile(preload, `import fs from 'node:fs';import path from 'node:path';
const config=JSON.parse(fs.readFileSync(process.env.ARTIFACT_TEST_CONFIG,'utf8'));let saved=0;
const trace=row=>fs.appendFileSync(process.env.ARTIFACT_TEST_TRACE,JSON.stringify(row)+'\\n');
const write=fs.promises.writeFile;fs.promises.writeFile=async(file,...args)=>{
  const evidence=String(file).replaceAll('\\\\','/').includes('/.tmp/official-result-conflicts/');
  if(evidence){trace({event:'persist-attempt',file:path.basename(file)});if(process.env.ARTIFACT_FAIL_PERSISTENCE==='true')throw Error('injected conflict persistence failure');}
  const value=await write(file,...args);if(evidence){saved++;trace({event:'persisted',file:path.basename(file)});}return value;
};
globalThis.fetch=async input=>{const u=new URL(input),type=u.searchParams.get('type'),parameter=u.searchParams.get('encp');
  trace({event:'request',type,race:config.raceByParameter[parameter]??null,saved});
  const value=config.responses[type==='JSJ048'?'list':type+':'+parameter];if(!value)throw Error('unmapped offline fixture');
  if(value.fixtureHttpStatus)return new Response('injected unrelated race HTTP failure',{status:value.fixtureHttpStatus});
  return new Response(JSON.stringify(value),{status:200});};`, { flag: "wx" });
  const runStartedAt = new Date().toISOString();
  const run = spawnSync(process.execPath, ["--import=" + pathToFileURL(preload).href, "scripts/update-keirin-jp-results.mjs",
    "--expect-date=2026-11-22", "--output=" + snapshotFile, "--delay-ms=0"], {
    encoding: "utf8", timeout: 30000, env: { ...process.env, GITHUB_ACTIONS: "true", ARTIFACT_TEST_CONFIG: configFile,
      ARTIFACT_TEST_TRACE: traceFile, ARTIFACT_FAIL_PERSISTENCE: String(failPersistence) },
  });
  await fs.writeFile(path.join(directory, "cli.log"), run.stdout + run.stderr, { flag: "wx" });
  const trace = (await fs.readFile(traceFile, "utf8")).trim().split("\n").map(line => JSON.parse(line));
  const saved = run.stdout.split("\n").filter(line => line.startsWith('{"event":"official-conflict-evidence-saved"')).map(line => JSON.parse(line));
  // Each mocked run has its own runner workspace; do not mix subsequent fixtures' observations.
  const sourceRoot = path.join(directory, "source");
  if (saved.length) {
    await fs.mkdir(path.join(sourceRoot, "2026-11-22"), { recursive: true });
    for (const record of saved) await fs.copyFile(record.file, path.join(sourceRoot, "2026-11-22", path.basename(record.file)));
  }
  return { directory, snapshotFile, original, run, trace, saved,
    options: { targetDate: "2026-11-22", runStartedAt, priorJobStatus: run.status === 0 ? "success" : "failure",
      sourceRoot, snapshotFile, runnerTemp: path.join(directory, "runner-temp"), repositoryRetentionDays: 90, retentionDays: 7 } };
}
const failedAcquisition = await acquisition();
const successfulAcquisition = await acquisition({ failRace: null });
const noConflictAcquisition = await acquisition({ failRace: null, conflict: false });
const failedPersistence = await acquisition({ failPersistence: true });
const recoveredArtifact = await prepareOfficialConflictArtifact(failedAcquisition.options);

test("acquisition: conflict evidence is durable before later race HTTP failure", () => {
  const later = failedAcquisition.trace.find(row => row.event === "request" && row.type === "JSJ012" && row.race === 5);
  assert.ok(later); assert.equal(later.saved, 1); assert.equal(failedAcquisition.saved.length, 1);
});
test("acquisition: later HTTP error remains failure and original result file is unchanged", async () => {
  assert.equal(failedAcquisition.run.status, 1); assert.match(failedAcquisition.run.stderr, /official-result-error.*2026-11-22:36:5/u);
  assert.match(failedAcquisition.run.stderr, /503/u); assert.match(failedAcquisition.run.stderr, /fetch errors/u);
  assert.equal(await fs.readFile(failedAcquisition.snapshotFile, "utf8"), failedAcquisition.original);
});
test("acquisition: failed update still prepares acquired redacted evidence", () => {
  assert.equal(recoveredArtifact.hasEvidence, true); assert.deepEqual(recoveredArtifact.raceIds, ["2026-11-22:36:4"]);
  assert.equal(recoveredArtifact.status, "PREPARED_UPLOAD_REQUIRED");
});
test("acquisition: failed job artifact lists only explicit RUNNER_TEMP files", async () => {
  assert.equal(recoveredArtifact.files.length, 2);
  for (const file of recoveredArtifact.files) { assert.ok(path.resolve(file).startsWith(path.resolve(failedAcquisition.options.runnerTemp) + path.sep)); assert.ok((await fs.stat(file)).isFile()); }
});
test("acquisition: recovered artifact excludes personal fields and authentication", async () => {
  const text = await texts(recoveredArtifact);
  for (const row of proof.result.finishOrder) { assert.ok(!text.includes(row.name)); assert.ok(!text.includes(row.registrationNo)); }
  assert.doesNotMatch(text, /"(?:name|registrationNo|sensyuRegistNo|age|bodyBase64|authorization|cookie)"\s*:|encp=|Bearer /iu);
});
test("acquisition: recovered artifact preserves official source, target, states and original SHA", async () => {
  const document = JSON.parse(await fs.readFile(recoveredArtifact.files[0], "utf8"));
  assert.equal(document.raceId, "2026-11-22:36:4"); assert.deepEqual(document.changedFields, ["finishOrder"]);
  assert.match(JSON.stringify(document.previous), /失格（外帯線内進入）/u);
  assert.match(JSON.stringify(document.candidate), /失格（外帯線内進入） \/ 落車棄権/u);
  const bundle = JSON.parse(await fs.readFile(failedAcquisition.saved[0].file, "utf8"));
  for (const record of bundle.records) { const item = document.rawResponses.find(row => row.apiType === record.type); assert.equal(item.originalSha256, record.sha256); assert.equal(item.fetchedAt, record.fetchedAt); assert.equal(item.source, `https://keirin.jp/pc/json?type=${record.type}`); }
});
test("acquisition: early and final persistence write one bundle rather than duplicate it", () => {
  assert.equal(successfulAcquisition.run.status, 0, successfulAcquisition.run.stderr);
  assert.equal(successfulAcquisition.trace.filter(row => row.event === "persist-attempt").length, 1);
  assert.equal(successfulAcquisition.trace.filter(row => row.event === "persisted").length, 1);
  assert.equal(successfulAcquisition.saved.length, 1);
});
test("acquisition: normal completion retains old conflict value and downstream hold", async () => {
  const result = await read(successfulAcquisition.snapshotFile);
  assert.equal(result.conflictRaceCount, 1); assert.equal(find(result).officialResultConflict.status, "unresolved");
  assert.deepEqual(find(result).finishOrder, find(stored).finishOrder);
});
test("acquisition: no conflict causes no evidence write or unused artifact", async () => {
  assert.equal(noConflictAcquisition.run.status, 0, noConflictAcquisition.run.stderr);
  assert.equal(noConflictAcquisition.saved.length, 0); assert.equal(noConflictAcquisition.trace.filter(row => row.event === "persist-attempt").length, 0);
  const result = await prepareOfficialConflictArtifact(noConflictAcquisition.options);
  assert.equal(result.hasEvidence, false); assert.equal(result.fileCount, 0);
});
test("acquisition: evidence persistence failure does not permit normalized output", async () => {
  assert.equal(failedPersistence.run.status, 1); assert.match(failedPersistence.run.stderr, /injected conflict persistence failure/u);
  assert.equal(await fs.readFile(failedPersistence.snapshotFile, "utf8"), failedPersistence.original);
  assert.equal(failedPersistence.saved.length, 0);
});
test("acquisition: artifact staging failure remains fatal after upstream failure", async () => {
  const blocked = path.join(failedAcquisition.directory, "blocked-staging"); await fs.writeFile(blocked, "not a directory", { flag: "wx" });
  await assert.rejects(prepareOfficialConflictArtifact({ ...failedAcquisition.options, runnerTemp: blocked }));
  assert.equal(failedAcquisition.run.status, 1);
});
test("acquisition: originals are not included in recovered artifact and cannot be restored from it", async () => {
  const manifest = await read(recoveredArtifact.files.at(-1));
  assert.equal(manifest.originalsIncluded, false); assert.equal(manifest.originalsRestorable, false); assert.equal(manifest.retentionDays, 7);
  assert.ok(recoveredArtifact.files.every(file => file !== failedAcquisition.saved[0].file));
});
test("acquisition: workflow results condition covers the sole official result command", () => {
  const commands = steps.filter(step => /update:keirin-jp-results:write/u.test(step.run ?? ""));
  assert.equal(commands.length, 1); assert.equal(artifact.if, "always() && " + commands[0].if);
  assert.ok(steps.indexOf(artifact) > steps.indexOf(commands[0]));
});
console.log(`Artifact fixture evidence: ${root}`);
