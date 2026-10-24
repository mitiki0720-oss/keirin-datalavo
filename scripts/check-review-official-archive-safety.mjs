import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import yaml from "js-yaml";
import { archiveReviewOfficialResults, verifyReviewOfficialArchive } from "./archive-keirin-review-official-results.mjs";

const date = "2026-10-23";
const resultBytes = await readFile(`public/data/review-page/official-results/${date}.generated.json`);
const results = JSON.parse(resultBytes.toString("utf8"));
const entriesBytes = execFileSync("git", ["show", "033df7739f:public/data/races/keirin-jp-entries.generated.json"]);
const entries = JSON.parse(entriesBytes.toString("utf8"));
assert.deepEqual(verifyReviewOfficialArchive(results, entries, date), { raceCount: 82, venueCount: 9 });
const nara = results.venues.find((venue) => venue.venueCode === "53").races.find((race) => race.raceNumber === 12);
assert.deepEqual(nara.finishOrder.map((rider) => rider.rank), ["1", "2", "3", "4", "4", "6", "7"]);
assert.deepEqual(nara.finishOrder.map((rider) => rider.carNo), ["6", "2", "5", "1", "3", "7", "4"]);
assert.deepEqual(nara.payouts.trifecta.map((item) => [item.combination, item.payoutYen]), [["6-2-5", 20340]]);

const tempRoot = await mkdtemp(path.join(tmpdir(), "keirin-review-archive-safety-"));
const resultFile = path.join(tempRoot, "results.json");
const entriesFile = path.join(tempRoot, "entries.json");
const outputRoot = path.join(tempRoot, "archive");
const output = path.join(outputRoot, `${date}.generated.json`);
await writeFile(entriesFile, entriesBytes);
const run = async (candidate = results) => {
  await writeFile(resultFile, JSON.stringify(candidate));
  return archiveReviewOfficialResults({ date, resultFile, entriesFile, outputRoot });
};
assert.equal((await run()).status, "created");
const original = await readFile(output);
assert.equal((await run()).status, "unchanged");
assert.deepEqual(await readFile(output), original);

const altered = (change) => {
  const candidate = structuredClone(results);
  change(candidate);
  return candidate;
};
const blocked = async (candidate, pattern) => {
  await assert.rejects(run(candidate), pattern);
  assert.deepEqual(await readFile(output), original);
};
await blocked(altered((value) => {
  value.confirmedRaceCount -= 1;
  value.pendingRaceCount = 1;
  value.venues[0].races[0].resultStatus = "pending";
}), /not complete/u);
await blocked(altered((value) => {
  value.confirmedRaceCount -= 1;
  value.partialRaceCount = 1;
  value.venues[0].races[0].resultStatus = "partial";
}), /not complete/u);
await blocked(altered((value) => { value.errorCount = 1; }), /source, date, fetch, or count unavailable/u);
await blocked(altered((value) => { value.date = "2026-10-24"; }), /source, date, fetch, or count unavailable/u);
await blocked(altered((value) => { value.source.provider = "unknown"; }), /source, date, fetch, or count unavailable/u);
await blocked(altered((value) => {
  value.venues[0].races.push(structuredClone(value.venues[0].races[0]));
}), /duplicate or invalid race/u);
await blocked(altered((value) => {
  value.venues[0].races[0].finishOrder[1].carNo = value.venues[0].races[0].finishOrder[0].carNo;
}), /duplicate or unidentified rider/u);
await blocked(altered((value) => {
  value.venues[0].races[0].finishOrder[0].registrationNo = "999999";
}), /official rider identity mismatch/u);
await blocked(altered((value) => {
  value.source.fetchCompletedAt = "2026-10-23T16:40:00.000Z";
}), /archive conflict; existing file preserved/u);
await writeFile(entriesFile, JSON.stringify({ ...entries, date: "2026-10-24" }));
await assert.rejects(run(), /source, date, fetch, or count unavailable/u);
assert.deepEqual(await readFile(output), original);
const untrustedEntry = structuredClone(entries);
untrustedEntry.venues[0].races[0].entries[0].source = "unknown";
await writeFile(entriesFile, JSON.stringify(untrustedEntry));
await assert.rejects(run(), /official rider identity mismatch/u);
assert.deepEqual(await readFile(output), original);

const workflow = yaml.load(await readFile(".github/workflows/update-today-race-data.yml", "utf8"));
const steps = workflow.jobs["update-race-data"].steps;
const byName = (name) => steps.find((step) => step.name === name);
const archive = byName("Archive Review official results");
const warning = byName("Report Review official archive failure");
const commit = byName("Commit updated race data");
assert.match(archive.if, /47 14 \* \* \*/u);
assert.match(archive.if, /53 14 \* \* \*/u);
assert.equal(archive["continue-on-error"], true);
assert.match(archive.run, /--require-complete --require-no-errors/u);
assert.match(archive.run, /archive-keirin-review-official-results\.mjs --expect-date/u);
assert.ok(steps.indexOf(byName("Validate KEIRIN.JP official results")) < steps.indexOf(archive));
assert.ok(steps.indexOf(archive) < steps.indexOf(commit));
assert.match(warning.if, /steps\.review_official_archive\.outcome == 'failure'/u);
assert.match(warning.run, /::warning/u);
assert.match(commit.run, /git add -- "public\/data\/review-page\/official-results\/\$\{REVIEW_OFFICIAL_ARCHIVE_DATE\}\.generated\.json"/u);
assert.match(commit.run, /assertCurrentDayWriteDate\(feed\.date, jstDate/u);
assert.equal(byName("Update upcoming race schedule")["continue-on-error"], true);

console.log("Review archive safety PASS: 82R, Nara tie/payout, complete/pending/partial/error/date/identity/duplicate/write-once, workflow gate");
