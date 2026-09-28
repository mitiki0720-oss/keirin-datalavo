import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function argValue(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const history = readJson("public/data/analytics/kurari-ex/history/index.generated.json");
const exact = readJson("public/data/analytics/kurari-ex/exact/index.generated.json");
const riders = readJson("public/data/analytics/kurari-ex/exact/riders/index.generated.json");
const matchups = readJson("public/data/analytics/kurari-ex/exact/matchups/index.generated.json");
const resultTrend = readJson("public/data/analytics/kurari-ex-result-trend-lab-history/index.generated.json");
const failure = readJson("public/data/analytics/kurari-ex/prediction-failure/index.generated.json");
const guidance = readJson("public/data/analytics/kurari-ex/prediction-failure-guidance/index.generated.json");
const risk = readJson("public/data/analytics/kurari-ex/race-risk/index.generated.json");
const today = readJson("public/data/races/today.generated.json");
const starters = readJson("public/data/analytics/kurari-ex/source/starters/index.generated.json");
const seedKpi = readJson("public/data/analytics/kurari-ex/global/prediction-kpi.generated.json");

const historicalDate = argValue("--historical-date", history.period?.to);
const targetDate = argValue("--target-date", today.date);
const nextTargetDate = addDays(historicalDate, 1);
const failures = [];

function requireEqual(label, actual, expected) {
  if (actual !== expected) failures.push(`${label}: expected ${expected}, got ${actual ?? "unavailable"}`);
}

requireEqual("compact history period.to", history.period?.to, historicalDate);
requireEqual("venue exact period.to", exact.period?.to, historicalDate);
requireEqual("rider exact period.to", riders.period?.to, historicalDate);
requireEqual("matchup exact period.to", matchups.period?.to, historicalDate);
requireEqual("Result Trend range.to", resultTrend.range?.to, historicalDate);
requireEqual("Result Trend shardCount", resultTrend.shardCount, 60);
if ((resultTrend.summary?.sourceRejectedCount ?? 0) !== 0) failures.push("Result Trend sourceRejectedCount is not 0");
if ((resultTrend.summary?.rejectedRaceCount ?? 0) !== 0) failures.push("Result Trend rejectedRaceCount is not 0");
if ((resultTrend.summary?.validatorIssueCount ?? 0) !== 0) failures.push("Result Trend validatorIssueCount is not 0");
if (resultTrend.availability?.productionBackfillReady === false) failures.push("Result Trend productionBackfillReady is false");

if (targetDate > historicalDate && targetDate !== nextTargetDate) {
  failures.push(`historical freshness gap: expected ${nextTargetDate}, got target ${targetDate}`);
}

requireEqual("prediction failure historicalTo", failure.historicalTo, historicalDate);
requireEqual("prediction failure targetDate", failure.targetDate, nextTargetDate);
requireEqual("failure guidance historicalTo", guidance.historicalTo, historicalDate);
requireEqual("failure guidance targetDate", guidance.targetDate, nextTargetDate);
if (!(guidance.historicalTo < guidance.targetDate)) failures.push("failure guidance uses current/future results");
if (guidance.leakageGuard?.currentDayResultUsed !== false) failures.push("failure guidance currentDayResultUsed is not false");

let raceRiskMode = "active";
if (targetDate > historicalDate) {
  requireEqual("race-risk targetDate", risk.period?.date, targetDate);
  requireEqual("race-risk historicalTo", risk.period?.historicalTo, historicalDate);
  if (!(risk.period?.historicalTo < risk.period?.date)) failures.push("race-risk historicalTo is not pre-race");
  if (risk.freshness?.status !== "fresh") failures.push(`race-risk freshness is ${risk.freshness?.status ?? "unavailable"}`);
} else {
  raceRiskMode = "deferred";
  if (!(risk.period?.historicalTo < risk.period?.date)) {
    failures.push("deferred race-risk artifact violates its own pre-race boundary");
  }
}
if ((risk.records ?? []).some((record) => record.leakageGuard?.currentResultUsed !== false)) {
  failures.push("race-risk contains current result usage");
}
if ((risk.records ?? []).some((record) => record.leakageGuard?.fuzzyMatchingUsed !== false)) {
  failures.push("race-risk contains fuzzy matching");
}
if ((risk.records ?? []).some((record) => record.leakageGuard?.fakeCompletionUsed !== false)) {
  failures.push("race-risk contains fake completion");
}

const report = {
  status: failures.length ? "FAIL" : "PASS",
  historicalDate,
  targetDate,
  sources: {
    today: { date: today.date, status: today.date === targetDate ? "LATEST" : "STALE" },
    compactHistory: { date: history.period?.to ?? null, status: history.period?.to === historicalDate ? "FRESH" : "STALE" },
    exact: { date: exact.period?.to ?? null, status: exact.period?.to === historicalDate ? "FRESH" : "STALE" },
    riderExact: { date: riders.period?.to ?? null, status: riders.period?.to === historicalDate ? "FRESH" : "STALE" },
    matchupExact: { date: matchups.period?.to ?? null, status: matchups.period?.to === historicalDate ? "FRESH" : "STALE" },
    resultTrend: { date: resultTrend.range?.to ?? null, status: resultTrend.range?.to === historicalDate ? "FRESH" : "STALE" },
    failureGuidance: {
      date: guidance.historicalTo ?? null,
      targetDate: guidance.targetDate ?? null,
      status: guidance.historicalTo === historicalDate && guidance.targetDate === nextTargetDate ? "FRESH" : "STALE",
    },
    raceRisk: { date: risk.period?.historicalTo ?? null, targetDate: risk.period?.date ?? null, status: raceRiskMode === "deferred" ? "REFERENCE" : risk.freshness?.status === "fresh" ? "FRESH" : "STALE" },
    seedPredictionKpi: { date: seedKpi.period?.to ?? null, status: seedKpi.period?.to === historicalDate ? "FRESH" : "REFERENCE" },
    legacyStarters: { date: starters.latest?.date ?? null, status: starters.latest?.date === targetDate ? "FRESH" : "REFERENCE" },
  },
  policy: {
    seedAndLegacyStartersCanBeReference: true,
    sourceUnavailableIsNeverInferred: true,
    historicalToBeforeTargetDate: guidance.historicalTo < guidance.targetDate,
  },
  failures,
};

console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
