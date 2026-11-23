import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { mergeWithExisting, raceResultSignature, describeSettledResultConflict } from "./update-keirin-jp-results.mjs";
import { loadOfficialConflictProof, planOfficialResultConflictIsolation, writeOfficialConflictPlan } from "./plan-official-result-conflict-isolation.mjs";

const evidence = path.resolve(process.env.ODAWARA_EVIDENCE_DIR || ".tmp/odawara");
const read = async file => JSON.parse(await fs.readFile(file, "utf8"));
const clone = structuredClone;
const snapshot = await read(path.join(evidence, "stored-snapshot.json"));
const proof = await loadOfficialConflictProof(path.join(evidence, "acquisition.json"));
const raceId = `${proof.target.date}:${proof.target.venueCode}:${proof.target.raceNumber}`;
const find = value => value.venues.find(venue => venue.venueCode === proof.target.venueCode).races.find(race => race.raceNumber === proof.target.raceNumber);
const previous = find(snapshot);
const next = clone(snapshot);
Object.assign(find(next), clone(proof.result));
const comparison = describeSettledResultConflict(raceId, previous, proof.result);
const plan = () => planOfficialResultConflictIsolation(snapshot, next, [proof]);
const results = [];
async function test(name, run) {
  try { await run(); results.push({ name, status: "PASS" }); }
  catch (error) { results.push({ name, status: "FAIL", error: error.stack }); }
}
const mutationRejected = (mutate, pattern) => {
  const changed = clone(next); mutate(changed);
  assert.throws(() => planOfficialResultConflictIsolation(snapshot, changed, [proof]), pattern);
};

await test("official identity validated for all seven riders", () => {
  assert.equal(proof.result.resultStatus, "confirmed"); assert.equal(proof.result.finishOrder.length, 7);
});
await test("all eight signature fields compared", () => assert.deepEqual(comparison.fields.map(row => row.field),
  ["operationStatus", "finishOrder", "kimarite", "secondKimarite", "sLeaderCarNo", "hLeaderCarNo", "bLeaderCarNo", "payouts"]));
await test("only finishOrder differs in acquired evidence", () => assert.deepEqual(comparison.changedFields, ["finishOrder"]));
await test("actual car1 old and new official states retained", () => {
  assert.equal(previous.finishOrder.find(row => row.carNo === "1").status, "失格（外帯線内進入）");
  assert.equal(proof.result.finishOrder.find(row => row.carNo === "1").status, "失格（外帯線内進入） / 落車棄権");
});
await test("car1 S mark absent in both available snapshots", () => {
  assert.equal(previous.sLeaderCarNo, ""); assert.equal(proof.result.sLeaderCarNo, "");
  assert.equal(proof.result.finishOrder.find(row => row.carNo === "1").mark, "");
});
await test("cars3 4 5 crash withdrawal unchanged", () => {
  for (const car of ["3", "4", "5"]) {
    const old = previous.finishOrder.find(row => row.carNo === car), now = proof.result.finishOrder.find(row => row.carNo === car);
    assert.equal(now.status, "落車棄権"); assert.deepEqual(old, now);
  }
});
await test("all other rider fields identical", () => {
  const expected = clone(previous.finishOrder); expected.find(row => row.carNo === "1").status = proof.result.finishOrder.find(row => row.carNo === "1").status;
  assert.deepEqual(expected, proof.result.finishOrder);
});
await test("official exacta and trifecta unchanged", () => {
  assert.deepEqual(previous.payouts, proof.result.payouts);
  assert.equal(proof.result.payout2tan.combination, "7-2"); assert.equal(proof.result.payout2tan.payoutYen, 2250);
  assert.equal(proof.result.payout3tan.combination, "7-2-6"); assert.equal(proof.result.payout3tan.payoutYen, 22540);
});
await test("kimarite and H B unchanged", () => {
  assert.equal(proof.result.kimarite, "差し"); assert.equal(proof.result.secondKimarite, "逃げ");
  assert.equal(proof.result.hLeaderCarNo, "2"); assert.equal(proof.result.bLeaderCarNo, "2");
});
await test("strict public merge still blocks actual conflict", () => assert.throws(() => mergeWithExisting(snapshot, next), error =>
  error.code === "SETTLED_OFFICIAL_RESULT_CONFLICT" && error.raceId === raceId && error.conflict.fields.length === 8));
await test("unchanged confirmed snapshot accepted", () => assert.equal(mergeWithExisting(snapshot, clone(snapshot)).payload.raceCount, snapshot.raceCount));
await test("strict merge retains previous confirmed against pending", () => {
  const pending = clone(snapshot); Object.assign(find(pending), { resultStatus: "pending", finishOrder: [] });
  assert.deepEqual(find(mergeWithExisting(snapshot, pending).payload), previous);
});
await test("quarantine preserves exact previous result", () => assert.deepEqual(plan().quarantined[0].previous, previous));
await test("quarantine preserves new official result separately", () => assert.deepEqual(plan().quarantined[0].candidate, proof.result));
await test("conflict excluded and not authorized for publication", () => {
  const value = plan(); assert.deepEqual(value.excludedRaceIds, [raceId]);
  assert.equal(value.candidateOnly, true); assert.equal(value.publicationAllowed, false); assert.equal(value.requiresManualResolution, true);
});
await test("plan cannot masquerade as official feed", () => { assert.equal(plan().venues, undefined); assert.equal(plan().source, undefined); });
await test("actual evidence does not claim fresh other-race updates", () => assert.equal(plan().normalUpdates.length, 0));
await test("synthetic separate pending-race progress survives quarantine", () => {
  const changed = clone(next), venue = changed.venues.find(value => value.venueCode !== proof.target.venueCode);
  const race = venue.races.find(value => value.resultStatus === "pending"); assert.ok(race);
  race.lastUpdateTime = "synthetic diagnostic metadata only";
  const value = planOfficialResultConflictIsolation(snapshot, changed, [proof]);
  assert.equal(value.normalUpdates.length, 1); assert.equal(value.quarantined.length, 1);
  assert.deepEqual(value.retained.find(row => row.raceId === raceId).previous, previous);
});
await test("no input mutation", () => {
  const a = JSON.stringify(snapshot), b = JSON.stringify(next), c = JSON.stringify(proof); plan();
  assert.equal(JSON.stringify(snapshot), a); assert.equal(JSON.stringify(next), b); assert.equal(JSON.stringify(proof), c);
});
await test("synthetic earlier pending state can accept a separately verified normal result", () => {
  const earlier = clone(snapshot), updated = clone(next);
  const venue = earlier.venues.find(value => value.races.some(race => race.resultStatus === "confirmed") && value.venueCode !== proof.target.venueCode);
  const race = venue.races.find(value => value.resultStatus === "confirmed");
  Object.assign(race, { resultStatus: "pending", finishOrder: [], payouts: {} });
  const value = planOfficialResultConflictIsolation(earlier, updated, [proof]);
  assert.equal(value.normalUpdates.length, 1); assert.equal(value.quarantined.length, 1);
  assert.equal(value.normalUpdates[0].candidate.resultStatus, "confirmed");
  assert.deepEqual(value.normalUpdates[0].candidate, updated.venues.find(row => row.venueCode === venue.venueCode).races.find(row => row.raceNumber === race.raceNumber));
});
await test("missing proof rejected", () => assert.throws(() => planOfficialResultConflictIsolation(snapshot, next), /VERIFIED_CONFLICT_PROOF_REQUIRED/u));
await test("forged proof rejected", () => assert.throws(() => planOfficialResultConflictIsolation(snapshot, next, [clone(proof)]), /VERIFIED_CONFLICT_PROOF_REQUIRED/u));
await test("mutated loaded proof rejected", () => {
  proof.signature += "tampered";
  try { assert.throws(plan, /VERIFIED_CONFLICT_PROOF_REQUIRED/u); } finally { proof.signature = raceResultSignature(proof.result); }
});
await test("duplicate proof rejected", () => assert.throws(() => planOfficialResultConflictIsolation(snapshot, next, [proof, proof]), /VERIFIED_CONFLICT_PROOF_REQUIRED/u));
await test("different-date candidate rejected", () => mutationRejected(value => { value.date = "2026-11-23"; }, /SNAPSHOT_DATE_MISMATCH/u));
await test("error race rejected globally", () => mutationRejected(value => { find(value).resultStatus = "error"; }, /INVALID_RACE_IDENTITY_OR_STATUS/u));
await test("error count rejected globally", () => mutationRejected(value => { value.errorCount = 1; }, /INVALID_OR_ERRORED_SNAPSHOT/u));
await test("unknown source rejected", () => mutationRejected(value => { value.source.provider = "unknown"; }, /INVALID_OR_ERRORED_SNAPSHOT/u));
await test("mixed venue date rejected", () => mutationRejected(value => { value.venues[0].date = "2026-11-21"; }, /INVALID_VENUE_IDENTITY/u));
await test("duplicate race rejected", () => mutationRejected(value => { value.venues[0].races.push(clone(value.venues[0].races[0])); value.raceCount++; }, /INVALID_RACE_IDENTITY_OR_STATUS/u));
await test("missing previous race rejected", () => mutationRejected(value => { value.venues[0].races.pop(); value.raceCount--; }, /SNAPSHOT_RACE_SET_REGRESSION/u));
await test("venue name mismatch rejected", () => mutationRejected(value => { value.venues[0].venueName = "unknown"; }, /VENUE_NAME_MISMATCH/u));
await test("registration identity mismatch rejected", () => mutationRejected(value => { find(value).finishOrder[0].registrationNo = "999999"; }, /VERIFIED_CONFLICT_PROOF_REQUIRED/u));
await test("changed payout is not silently accepted", () => mutationRejected(value => { find(value).payouts.trifecta[0].payoutYen++; }, /VERIFIED_CONFLICT_PROOF_REQUIRED/u));
await test("synthetic S-only difference diagnosed without official attribution", () => {
  const changed = clone(previous); changed.sLeaderCarNo = "1";
  assert.deepEqual(describeSettledResultConflict(raceId, previous, changed).changedFields, ["sLeaderCarNo"]);
});
const temp = path.resolve(".tmp/official-result-conflicts"); await fs.mkdir(temp, { recursive: true });
const unique = `${Date.now()}-${process.pid}`;
let fixtureNumber = 0;
async function alteredProof(mutateManifest, mutateRaw) {
  const dir = path.join(temp, `proof-fixture-${unique}-${fixtureNumber++}`);
  await fs.mkdir(path.join(dir, "raw"), { recursive: true });
  const manifest = await read(path.join(evidence, "acquisition.json"));
  for (const record of manifest.records) {
    let bytes = await fs.readFile(path.join(evidence, "raw", record.file));
    if (mutateRaw && record.type === "JSJ012") {
      const data = JSON.parse(bytes); mutateRaw(data); bytes = Buffer.from(JSON.stringify(data));
      record.sha256 = createHash("sha256").update(bytes).digest("hex");
    }
    await fs.writeFile(path.join(dir, "raw", record.file), bytes, { flag: "wx" });
  }
  mutateManifest?.(manifest);
  const file = path.join(dir, "acquisition.json"); await fs.writeFile(file, JSON.stringify(manifest), { flag: "wx" });
  return loadOfficialConflictProof(file);
}
await test("proof SHA mismatch rejected", async () => assert.rejects(alteredProof(value => { value.records.find(row => row.type === "JSJ012").sha256 = "0".repeat(64); }), /PROOF_SHA_MISMATCH/u));
await test("proof nonofficial host rejected", async () => assert.rejects(alteredProof(value => { value.records.find(row => row.type === "JSJ012").url = "https://example.org/pc/json?type=JSJ012"; }), /UNOFFICIAL_PROOF_SOURCE/u));
await test("proof non200 rejected", async () => assert.rejects(alteredProof(value => { value.records.find(row => row.type === "JSJ012").status = 500; }), /UNOFFICIAL_PROOF_SOURCE/u));
await test("proof future timestamp rejected", async () => assert.rejects(alteredProof(value => { value.records.find(row => row.type === "JSJ012").fetchedAt = "2099-11-22T12:00:00Z"; }), /INVALID_PROOF_TIME/u));
await test("proof wrong acquisition date rejected", async () => assert.rejects(alteredProof(value => { value.records.find(row => row.type === "JSJ012").fetchedAt = "2026-11-21T12:00:00Z"; }), /INVALID_PROOF_TIME/u));
await test("proof missing API rejected", async () => assert.rejects(alteredProof(value => { value.records = value.records.filter(row => row.type !== "JSJ006"); }), /MISSING_RACE_PROOF_JSJ006/u));
await test("proof path traversal rejected", async () => assert.rejects(alteredProof(value => { value.records.find(row => row.type === "JSJ012").file = "../other.json"; }), /INVALID_PROOF_PATH/u));
await test("proof rider registration mismatch rejected", async () => assert.rejects(alteredProof(null, value => { value.tyakujyunItemSubData[0].sensyuRegistNo = "999999"; })));
await test("proof target venue mismatch rejected", async () => assert.rejects(alteredProof(value => { value.target.venueCode = "37"; })));
await test("proof target race mismatch rejected", async () => assert.rejects(alteredProof(value => { value.target.raceNumber = 5; })));
await test("writer rejects public directory", async () => assert.rejects(writeOfficialConflictPlan(plan(), path.resolve(`public/forbidden-${unique}`)), /DIAGNOSTIC_OUTPUT_ONLY/u));
await test("writer rejects relative directory", async () => assert.rejects(writeOfficialConflictPlan(plan(), "relative"), /EXPLICIT_DIAGNOSTIC_DIRECTORY_REQUIRED/u));
await test("writer rejects publication authorization", async () => assert.rejects(writeOfficialConflictPlan({ ...plan(), publicationAllowed: true }, path.join(temp, `forbidden-${unique}`)), /NONPUBLIC_PLAN_REQUIRED/u));
await test("writer rejects official-feed-shaped input", async () => assert.rejects(writeOfficialConflictPlan(snapshot, path.join(temp, `feed-${unique}`)), /NONPUBLIC_PLAN_REQUIRED/u));
await test("write-once plan SHA and reread verified", async () => {
  const out = path.join(temp, `actual-${unique}`), value = plan();
  const written = await writeOfficialConflictPlan(value, out);
  const bytes = await fs.readFile(written.file);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), written.sha256);
  assert.deepEqual(JSON.parse(bytes), value); assert.equal(written.publicationAllowed, false);
  await assert.rejects(writeOfficialConflictPlan(value, out), /EEXIST/u);
});
await test("original raw bytes remain SHA-matched", async () => {
  const manifest = await read(path.join(evidence, "acquisition.json"));
  for (const record of manifest.records) assert.equal(createHash("sha256").update(await fs.readFile(path.join(evidence, "raw", record.file))).digest("hex"), record.sha256);
});
const report = { target: proof.target, actualEvidence: { comparedRaces: 1, totalStoredRaces: snapshot.raceCount, newOtherRacesFetched: 0 },
  pass: results.filter(row => row.status === "PASS").length, fail: results.filter(row => row.status === "FAIL").length, results };
await fs.writeFile(path.join(evidence, `conflict-tests-${unique}.json`), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
console.log(JSON.stringify(report, null, 2));
if (report.fail) process.exitCode = 1;
