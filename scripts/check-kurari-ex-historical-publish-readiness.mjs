import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { projectRoot } from "./kurari-ex-history-common.mjs";

const arg = process.argv.find((value) => value.startsWith("--historical-date="));
if (!arg) throw new Error("--historical-date=YYYY-MM-DD is required");
const targetDate = arg.slice("--historical-date=".length);
if (!/^\d{4}-\d{2}-\d{2}$/u.test(targetDate)) throw new Error("invalid historical date");
const root = path.join(projectRoot, "public", "data", "analytics");
const read = async (relative) => JSON.parse(await readFile(path.join(root, relative), "utf8"));
const [history, exact, riders, matchups, trend, failure, guidance] = await Promise.all([
  read("kurari-ex/history/index.generated.json"),
  read("kurari-ex/exact/index.generated.json"),
  read("kurari-ex/exact/riders/index.generated.json"),
  read("kurari-ex/exact/matchups/index.generated.json"),
  read("kurari-ex-result-trend-lab-history/index.generated.json"),
  read("kurari-ex/prediction-failure/index.generated.json"),
  read("kurari-ex/prediction-failure-guidance/index.generated.json"),
]);
for (const [label, date] of [
  ["history", history.period?.to], ["exact", exact.period?.to],
  ["rider exact", riders.period?.to], ["matchup exact", matchups.period?.to],
  ["result trend", trend.range?.to], ["prediction failure", failure.historicalTo],
  ["failure guidance", guidance.historicalTo],
]) assert.equal(date, targetDate, `${label} historical date`);
assert.equal(history.raceCount, history.items.reduce((sum, item) => sum + item.raceCount, 0));
assert.equal(exact.venueCount, exact.files.filter((file) => file.includes("/exact/venues/")).length);
assert.equal(exact.files.length, exact.venueCount + 2);
let venueRaceCount = 0;
for (const file of exact.files) {
  assert.match(file, /^\/data\/analytics\/kurari-ex\/exact\/(?:status\.generated\.json|global\/prediction-kpi\.generated\.json|venues\/[a-z]+\.generated\.json)$/u);
  const document = await readFile(path.join(projectRoot, "public", file.slice(1)), "utf8").then(JSON.parse);
  if (file.includes("/exact/venues/")) {
    assert.equal(document.sourceType, "EXACT");
    assert.equal(document.venueKey, path.basename(file, ".generated.json"));
    venueRaceCount += document.coverage?.normalizedRaces ?? 0;
  }
}
assert.equal(venueRaceCount, history.raceCount, "venue EXACT physical race coverage");
assert.equal(trend.shardCount, 60);
assert.equal(trend.summary?.productionBackfillReady, true);
assert.equal(trend.summary?.sourceRejectedCount, 0);
const next = new Date(`${targetDate}T00:00:00Z`);
next.setUTCDate(next.getUTCDate() + 1);
assert.equal(guidance.targetDate, next.toISOString().slice(0, 10));
if (guidance.freshness?.classifiableTo < targetDate) {
  assert.equal(guidance.freshness.status, "stale");
  assert.equal(guidance.freshness.preRaceUsage, "prohibited");
}
console.log(JSON.stringify({ status: "HISTORICAL_ONLY_READY", historicalDate: targetDate,
  historyRaceCount: history.raceCount, riderCount: riders.riderCount,
  matchupPairCount: matchups.distinctPairCount ?? matchups.pairCount,
  trendRaceCount: trend.raceCount, failureGuidance: guidance.freshness }));
