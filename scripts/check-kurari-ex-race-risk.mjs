import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TARGET = path.join(ROOT, "public/data/analytics/kurari-ex/race-risk/index.generated.json");
const allowedRiskLevels = new Set(["LOW", "MEDIUM", "HIGH", "VERY_HIGH", "INSUFFICIENT"]);
const allowedActions = new Set(["BASE_8", "VALUE_10", "STRONG_VALUE_12", "MAX_14", "SKIP"]);
const allowedConfidence = new Set(["high", "medium", "low"]);
const allowedFreshness = new Set(["fresh", "stale", "unknown"]);
const forbiddenCurrentLeakSources = [/current.*result/iu, /current.*payout/iu, /today.*result/iu, /today.*payout/iu, /odds.*driver/iu];

const fail = (message, details = {}) => {
  console.error(JSON.stringify({ ok: false, message, ...details }, null, 2));
  process.exit(1);
};

if (!fs.existsSync(TARGET)) fail("race-risk index is missing", { target: path.relative(ROOT, TARGET) });

const data = JSON.parse(fs.readFileSync(TARGET, "utf8"));
if (data.version !== "kurari-ex-race-risk/v1") fail("invalid version", { version: data.version });
if (!Array.isArray(data.records)) fail("records is not an array");
if (data.records.length <= 0) fail("records is empty");

const seen = new Set();
const issues = {
  duplicateRaceKey: 0,
  invalidRiskLevel: 0,
  invalidPointRange: 0,
  missingRequiredSource: 0,
  futureDataLeakage: 0,
  fakeMatchup: 0,
  invalidRegistrationNoJoin: 0,
  invalidSignal: 0,
  invalidFreshness: 0,
};

if (!data.freshness || !allowedFreshness.has(data.freshness.status) || typeof data.freshness.warning !== "string") {
  issues.invalidFreshness += 1;
}

for (const record of data.records) {
  if (!record.raceKey || seen.has(record.raceKey)) issues.duplicateRaceKey += 1;
  seen.add(record.raceKey);
  if (!allowedRiskLevels.has(record.riskLevel)) issues.invalidRiskLevel += 1;
  if (!record.pointRange || !allowedActions.has(record.pointRange.action)) issues.invalidPointRange += 1;
  if (!allowedConfidence.has(record.confidence)) issues.invalidRiskLevel += 1;
  if (record.date !== data.period?.date) issues.futureDataLeakage += 1;
  if (record.leakageGuard?.currentResultUsed || record.leakageGuard?.currentPayoutUsed || record.leakageGuard?.fakeCompletionUsed || record.leakageGuard?.fuzzyMatchingUsed) {
    issues.futureDataLeakage += 1;
  }
  if (record.riskLevel !== "INSUFFICIENT" && (!record.sourceAvailability?.officialEntries || !record.sourceAvailability?.officialLineup)) {
    issues.missingRequiredSource += 1;
  }
  for (const signal of record.signals ?? []) {
    if (!signal.key || !signal.label || typeof signal.value !== "string" || !Number.isFinite(signal.contribution) || !signal.source || !allowedConfidence.has(signal.confidence)) {
      issues.invalidSignal += 1;
    }
    if (forbiddenCurrentLeakSources.some((pattern) => pattern.test(String(signal.source)))) {
      issues.futureDataLeakage += 1;
    }
    if (/fake|synthetic|fuzzy/iu.test(String(signal.source))) {
      issues.fakeMatchup += 1;
    }
  }
  if (record.line?.source && /result|payout|odds/iu.test(String(record.line.source))) {
    issues.futureDataLeakage += 1;
  }
}

const failed = Object.entries(issues).filter(([, count]) => count > 0);
if (failed.length) fail("race-risk validation failed", { issues });

console.log(JSON.stringify({
  ok: true,
  raceCount: data.records.length,
  riskLevelCounts: data.riskLevelCounts,
  confidenceCounts: data.confidenceCounts,
  pointRangeCounts: data.pointRangeCounts,
  issues,
}, null, 2));
