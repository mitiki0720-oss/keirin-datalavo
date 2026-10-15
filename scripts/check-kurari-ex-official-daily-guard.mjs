import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { checkNightlyHistoryContinuity } from "./run-kurari-ex-nightly-update.mjs";
import { verifyOfficialDailySource } from "./kurari-ex-official-daily-guard.mjs";
import { projectRoot } from "./kurari-ex-history-common.mjs";

const date = "2026-10-15";
const watched = [
  "public/data/analytics/kurari-ex/history/index.generated.json",
  "public/data/analytics/kurari-ex/history/status.generated.json",
  "public/data/analytics/kurari-ex/analysis/rider-score.generated.json",
  "public/data/analytics/kurari-ex/exact/riders/index.generated.json",
  "public/data/analytics/kurari-ex/exact/matchups/index.generated.json",
  "public/data/analytics/kurari-ex-result-trend-lab-history/index.generated.json",
  "public/data/analytics/kurari-ex/race-risk/index.generated.json",
  "public/data/races/today.generated.json",
];
async function hashes() {
  return Promise.all(watched.map(async (file) => createHash("sha256")
    .update(await readFile(path.join(projectRoot, file))).digest("hex")));
}
const before = await hashes();
const starters = Array.from({ length: 7 }, (_, index) => ({
  carNo: index + 1, name: `選手${index + 1}`, registrationNo: null,
}));
const source = {
  feed: { date, venues: [{ venue: "青森", venueCode: "12", slug: "aomori" }] },
  races: [{ raceKey: `${date}:aomori:1`, date, venueKey: "aomori", raceNumber: 1,
    operationStatus: "finished", starters, result: {
      status: "finished", trifecta: { combination: "1-2-3", payoutYen: 1000 },
      exacta: { combination: "1-2", payoutYen: 300 },
    }, prediction: null, predictionEnrichment: { status: "missing", matchedBy: null },
    quality: { resultParsed: true, warnings: [] } }],
};
const venue = { date, venueCode: "12", venueName: "青森競輪場" };
const entryRows = starters.map((rider) => ({ carNo: String(rider.carNo), name: rider.name,
  registrationNo: String(10000 + rider.carNo).padStart(6, "0"), source: "KEIRIN.JP:JSJ006" }));
const entries = { date, source: { provider: "KEIRIN.JP", endpoint: "/pc/json", entryType: "JSJ006" },
  errorCount: 0, raceCount: 1, venues: [{ ...venue, races: [{ raceNumber: 1, entryStatus: "available", entries: entryRows }] }] };
const finishOrder = entryRows.map((row, index) => ({ ...row, rank: String(index + 1), status: "" }));
const results = { date, source: { provider: "KEIRIN.JP", endpoint: "/pc/json", listType: "JSJ048" },
  errorCount: 0, raceCount: 1, venues: [{ ...venue, races: [{ raceNumber: 1, resultStatus: "confirmed",
    operationStatus: "finished", finishOrder, payouts: {
      trifecta: [{ combination: "1-2-3", payoutYen: 1000 }],
      exacta: [{ combination: "1-2", payoutYen: 300 }],
    } }] }] };
const clone = (value) => structuredClone(value);
const rejects = (mutator, label) => {
  const s = clone(source); const r = clone(results); const e = clone(entries);
  mutator(s, r, e);
  assert.throws(() => verifyOfficialDailySource(s, r, e, date), undefined, label);
};

assert.equal(checkNightlyHistoryContinuity("2026-10-13", date).safe, false); // A
rejects((s) => { s.races[0].operationStatus = "pending"; }, "B pending");
rejects((_s, r) => { r.source = null; }, "C source absent");
rejects((_s, r) => { r.venues[0].races[0].finishOrder[0].registrationNo = "099999"; }, "D result/entry mismatch");
rejects((_s, r) => { r.venues[0].races[0].finishOrder[0].rank = "2"; }, "D official rank/payout conflict");
rejects((_s, r, e) => {
  e.venues[0].races[0].entries[1].registrationNo = "010001";
  r.venues[0].races[0].finishOrder[1].registrationNo = "010001";
}, "E registration collision");
rejects((s) => { s.races.push(clone(s.races[0])); }, "F duplicate raceKey");
const unknown = clone(results);
unknown.venues[0].races[0].finishOrder[6].rank = "";
unknown.venues[0].races[0].finishOrder[6].status = "失格";
assert.equal(verifyOfficialDailySource(source, unknown, entries, date).races[0].result.finishOrder[6].rank, null); // G
const unplaced = clone(results);
unplaced.venues[0].races[0].finishOrder[6].rank = "";
assert.equal(verifyOfficialDailySource(source, unplaced, entries, date).races[0].result.finishOrder[6].rank, null);
rejects((_s, r) => { r.venues[0].races[0].finishOrder[0].rank = ""; }, "G missing podium rank");
rejects((s) => { s.races[0].result.finishOrder = clone(finishOrder); s.races[0].result.finishOrder[6].rank = ""; }, "G input omitted official rank");
rejects((s) => { s.races[0].result.finishOrder = clone(finishOrder); s.races[0].result.finishOrder[4].rank = "6"; }, "G input/official rank mismatch");
rejects((s) => { s.races[0].result.exacta.payoutYen = 301; }, "G input/official exacta mismatch");
const tie = clone(results);
tie.venues[0].races[0].finishOrder[4].rank = "4";
assert.equal(verifyOfficialDailySource(source, tie, entries, date).races[0].result.finishOrder[4].rank, 4); // H
rejects((_s, r) => { r.venues[0].races[0].resultStatus = "unknown"; }, "I unknown status");
const valid = verifyOfficialDailySource(source, results, entries, date); // J, K
assert.equal(valid.races[0].prediction, null);
assert.equal(valid.races[0].predictionEnrichment.status, "missing");
assert.equal(valid.races[0].starters.length, 7);
assert.deepEqual(await hashes(), before, "fixtures must not write public artifacts");
console.log(JSON.stringify({ fixtures: "A-K PASS", publicArtifactWrites: 0,
  candidateRaceCount: valid.races.length, predictionMissing: 1, unknownRankPreserved: true,
  tiePreserved: true }));
