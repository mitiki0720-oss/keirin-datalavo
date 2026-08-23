import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const HISTORY_DIR = path.join(ROOT, "public/data/analytics/kurari-ex/race-risk-history");
const VERSION = "kurari-ex-race-risk/v1";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/u;
const allowedRiskLevels = new Set(["LOW", "MEDIUM", "HIGH", "VERY_HIGH", "INSUFFICIENT"]);
const allowedPointRanges = new Set(["BASE_8", "VALUE_10", "STRONG_VALUE_12", "MAX_14", "SKIP"]);
const allowedConfidence = new Set(["high", "medium", "low"]);

const fail = (message, details = {}) => {
  console.error(JSON.stringify({ ok: false, message, ...details }, null, 2));
  process.exit(1);
};

const listFiles = (dir) => {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^\d{4}-\d{2}-\d{2}\.generated\.json$/u.test(entry.name))
    .map((entry) => path.join(dir, entry.name))
    .sort();
};

const files = listFiles(HISTORY_DIR);
if (files.length === 0) {
  fail("race-risk history files are missing", { dir: path.relative(ROOT, HISTORY_DIR) });
}

const totals = {
  fileCount: files.length,
  raceCount: 0,
  duplicateRaceKey: 0,
  invalidFilenameDate: 0,
  invalidVersion: 0,
  invalidPeriodDate: 0,
  invalidRiskLevel: 0,
  invalidPointRange: 0,
  invalidConfidence: 0,
  missingSignals: 0,
  invalidSignal: 0,
  leakageViolation: 0,
  fakeOrFuzzy: 0,
  raceCountMismatch: 0,
};

const dates = [];
const summaries = [];

for (const file of files) {
  const filenameDate = path.basename(file).replace(/\.generated\.json$/u, "");
  if (!DATE_RE.test(filenameDate)) totals.invalidFilenameDate += 1;

  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail("race-risk history file is not valid JSON", {
      file: path.relative(ROOT, file),
      error: error.message,
    });
  }

  const date = data?.period?.date;
  dates.push(date);
  if (data?.version !== VERSION) totals.invalidVersion += 1;
  if (date !== filenameDate || data?.freshness?.targetDate !== date) totals.invalidPeriodDate += 1;
  if (!Array.isArray(data?.records) || data.records.length <= 0) totals.raceCountMismatch += 1;
  if (data?.raceCount !== data?.records?.length) totals.raceCountMismatch += 1;

  const seen = new Set();
  for (const record of data?.records ?? []) {
    totals.raceCount += 1;
    if (!record.raceKey || seen.has(record.raceKey)) totals.duplicateRaceKey += 1;
    seen.add(record.raceKey);
    if (record.date !== date || !String(record.raceKey ?? "").startsWith(`${date}|`)) {
      totals.invalidPeriodDate += 1;
    }
    if (!allowedRiskLevels.has(record.riskLevel)) totals.invalidRiskLevel += 1;
    if (!record.pointRange || !allowedPointRanges.has(record.pointRange.action)) {
      totals.invalidPointRange += 1;
    }
    if (!allowedConfidence.has(record.confidence)) totals.invalidConfidence += 1;
    if (!Array.isArray(record.signals) || record.signals.length === 0) totals.missingSignals += 1;
    for (const signal of record.signals ?? []) {
      if (
        !signal.key ||
        !signal.label ||
        typeof signal.value !== "string" ||
        !Number.isFinite(signal.contribution) ||
        !signal.source ||
        !allowedConfidence.has(signal.confidence)
      ) {
        totals.invalidSignal += 1;
      }
      if (/fake|synthetic|fuzzy/iu.test(String(signal.source))) totals.fakeOrFuzzy += 1;
      if (/current.*result|current.*payout|today.*result|today.*payout|odds.*driver/iu.test(String(signal.source))) {
        totals.leakageViolation += 1;
      }
    }
    const guard = record.leakageGuard ?? {};
    if (
      guard.currentResultUsed !== false ||
      guard.currentPayoutUsed !== false ||
      guard.oddsUsedAsRiskDriver !== false ||
      guard.fuzzyMatchingUsed !== false ||
      guard.fakeCompletionUsed !== false
    ) {
      totals.leakageViolation += 1;
    }
  }

  summaries.push({
    file: path.relative(ROOT, file).replace(/\\/gu, "/"),
    date,
    generatedAt: data.generatedAt,
    raceCount: data.raceCount,
    riskLevelCounts: data.riskLevelCounts,
    pointRangeCounts: data.pointRangeCounts,
  });
}

const failed = Object.entries(totals)
  .filter(([key, value]) => !["fileCount", "raceCount"].includes(key) && value > 0);

if (failed.length) {
  fail("race-risk history validation failed", { totals, summaries });
}

console.log(JSON.stringify({
  ok: true,
  fileCount: totals.fileCount,
  raceCount: totals.raceCount,
  dates,
  summaries,
  issues: totals,
}, null, 2));
