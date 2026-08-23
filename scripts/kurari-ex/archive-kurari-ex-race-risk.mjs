import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LIVE_PATH = "public/data/analytics/kurari-ex/race-risk/index.generated.json";
const HISTORY_DIR = path.join(ROOT, "public/data/analytics/kurari-ex/race-risk-history");
const VERSION = "kurari-ex-race-risk/v1";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/u;

const args = process.argv.slice(2);
const getArg = (name) => {
  const prefixed = args.find((arg) => arg.startsWith(`${name}=`));
  if (prefixed) return prefixed.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};

const sourceRef = getArg("--source-ref");
const sourcePath = getArg("--source") ?? LIVE_PATH;

const fail = (message, details = {}) => {
  console.error(JSON.stringify({ ok: false, message, ...details }, null, 2));
  process.exit(1);
};

const readSource = () => {
  if (sourceRef) {
    const gitPath = sourcePath.replace(/\\/gu, "/");
    return execFileSync("git", ["show", `${sourceRef}:${gitPath}`], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 100 * 1024 * 1024,
    });
  }
  const absolutePath = path.resolve(ROOT, sourcePath);
  if (!absolutePath.startsWith(ROOT)) fail("source path escapes repository", { sourcePath });
  if (!fs.existsSync(absolutePath)) fail("source race-risk artifact is missing", { sourcePath });
  return fs.readFileSync(absolutePath, "utf8");
};

const validatePayload = (payload) => {
  const issues = {
    invalidVersion: 0,
    invalidDate: 0,
    recordDateMismatch: 0,
    raceKeyDateMismatch: 0,
    leakageViolation: 0,
    duplicateRaceKey: 0,
    raceCountMismatch: 0,
    emptyRecords: 0,
  };

  const date = payload?.period?.date;
  if (payload?.version !== VERSION) issues.invalidVersion += 1;
  if (!DATE_RE.test(String(date ?? ""))) issues.invalidDate += 1;
  if (payload?.freshness?.targetDate !== date) issues.invalidDate += 1;
  if (!Array.isArray(payload?.records) || payload.records.length === 0) {
    issues.emptyRecords += 1;
  }
  if (payload?.raceCount !== payload?.records?.length) issues.raceCountMismatch += 1;

  const seen = new Set();
  for (const record of payload?.records ?? []) {
    if (record.date !== date) issues.recordDateMismatch += 1;
    if (!String(record.raceKey ?? "").startsWith(`${date}|`)) issues.raceKeyDateMismatch += 1;
    if (!record.raceKey || seen.has(record.raceKey)) issues.duplicateRaceKey += 1;
    seen.add(record.raceKey);
    const guard = record.leakageGuard ?? {};
    if (
      guard.currentResultUsed !== false ||
      guard.currentPayoutUsed !== false ||
      guard.oddsUsedAsRiskDriver !== false ||
      guard.fuzzyMatchingUsed !== false ||
      guard.fakeCompletionUsed !== false
    ) {
      issues.leakageViolation += 1;
    }
  }

  const failed = Object.entries(issues).filter(([, count]) => count > 0);
  if (failed.length) fail("race-risk archive source validation failed", { issues, date });
  return date;
};

const sourceText = readSource();
let payload;
try {
  payload = JSON.parse(sourceText);
} catch (error) {
  fail("source race-risk artifact is not valid JSON", { error: error.message });
}

const date = validatePayload(payload);
const outputPath = path.join(HISTORY_DIR, `${date}.generated.json`);

fs.mkdirSync(HISTORY_DIR, { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);

console.log(JSON.stringify({
  ok: true,
  source: sourceRef ? `${sourceRef}:${sourcePath}` : sourcePath,
  output: path.relative(ROOT, outputPath).replace(/\\/gu, "/"),
  date,
  raceCount: payload.raceCount,
  riskLevelCounts: payload.riskLevelCounts,
  pointRangeCounts: payload.pointRangeCounts,
}, null, 2));
