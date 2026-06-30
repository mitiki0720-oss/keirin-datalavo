import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);

const ROOT = process.cwd();
const TARGET_DATE = "2026-06-29";
const TARGET_MONTH = "2026-06";
const INDEX_PATH = "public/data/analytics/kurari-ex/history/index.generated.json";
const TARGET_DAILY_PATH =
  `public/data/analytics/kurari-ex/history/daily/${TARGET_MONTH}/${TARGET_DATE}.generated.json`;
const TARGET_DAILY_PUBLIC_PATH =
  `/data/analytics/kurari-ex/history/daily/${TARGET_MONTH}/${TARGET_DATE}.generated.json`;
const EXPECTED_INDEX_HASH =
  "sha256:53833ef5cc74c02b153c12a5c520b2f4740345777b7806fd5a22a2a7723659d9";
const EXPECTED_TARGET_DAILY_HASH =
  "sha256:96a4d2399cf7f57f777170648c9ab8da2f87f20b5bdcc3ed680f2ca6b67d6e2f";
const ALLOWED_PATHS = new Set([
  "scripts/write-kurari-ex-history-index-target-date.mjs",
  "scripts/check-kurari-ex-history-index-target-date.mjs",
  INDEX_PATH,
]);
const KNOWN_PREEXISTING_REVIEW_PATHS = [
  "public/data/reviews/index.json",
  "public/data/reviews/2026-06-28/",
  "public/data/reviews/2026-06-29/",
];

function abs(file) {
  return path.isAbsolute(file) ? file : path.resolve(ROOT, file);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function stableSort(value) {
  if (Array.isArray(value)) return value.map(stableSort);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableSort(item)]),
    );
  }
  return value;
}

function hashStableIndex(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(stableSort({
    ...value,
    generatedAt: undefined,
  }))).digest("hex")}`;
}

function hashPayload(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

async function readJson(file) {
  return JSON.parse(await readFile(abs(file), "utf8"));
}

function countDuplicates(values) {
  return values.length - new Set(values).size;
}

function latestItem(items) {
  return [...items].sort((left, right) => String(left.date).localeCompare(String(right.date))).at(-1) ?? null;
}

function isKnownPreexistingReview(pathname) {
  return KNOWN_PREEXISTING_REVIEW_PATHS.some((known) => (
    known.endsWith("/") ? pathname.startsWith(known) : pathname === known
  ));
}

async function gitStatusPorcelain() {
  const { stdout } = await execFileAsync("git", ["status", "--porcelain=v1"], {
    cwd: ROOT,
    maxBuffer: 1024 * 1024 * 20,
  });
  return stdout
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => ({
      raw: line,
      status: line.slice(0, 2),
      path: line.slice(3).replaceAll("\\", "/"),
    }));
}

function buildProtectedGuard(statusItems) {
  const paths = statusItems.map((item) => item.path);
  const stagedFiles = statusItems
    .filter((item) => item.status[0] !== " " && item.status[0] !== "?")
    .map((item) => item.path);
  const unexpectedPaths = paths.filter((itemPath) => (
    !ALLOWED_PATHS.has(itemPath)
    && !isKnownPreexistingReview(itemPath)
  ));
  const historyDailyModified = paths.some((itemPath) => itemPath.startsWith("public/data/analytics/kurari-ex/history/daily/"));
  const analyticsSourceModified = paths.some((itemPath) => itemPath.startsWith("public/data/analytics/kurari-ex/source/"));
  const racesModified = paths.some((itemPath) => itemPath.startsWith("public/data/races/"));
  const privateInputModified = paths.some((itemPath) => itemPath.startsWith("private-input/"));
  const srcModified = paths.some((itemPath) => itemPath.startsWith("src/"));
  const packageModified = paths.includes("package.json");
  const existingScriptModified = paths.some((itemPath) => (
    itemPath.startsWith("scripts/")
    && itemPath !== "scripts/write-kurari-ex-history-index-target-date.mjs"
    && itemPath !== "scripts/check-kurari-ex-history-index-target-date.mjs"
  ));
  const reviewsModifiedByThisStep = paths
    .filter((itemPath) => itemPath.startsWith("public/data/reviews/"))
    .some((itemPath) => !isKnownPreexistingReview(itemPath));
  const guardStatus = [
    stagedFiles.length > 0,
    unexpectedPaths.length > 0,
    historyDailyModified,
    analyticsSourceModified,
    racesModified,
    privateInputModified,
    srcModified,
    packageModified,
    existingScriptModified,
    reviewsModifiedByThisStep,
  ].some(Boolean) ? "fail" : "pass";
  return {
    allowedPaths: [...ALLOWED_PATHS],
    unexpectedPaths,
    stagedFiles,
    historyDailyModified,
    analyticsSourceModified,
    racesModified,
    reviewsModifiedByThisStep,
    privateInputModified,
    srcModified,
    packageModified,
    existingScriptModified,
    knownPreexistingReviewDiffs: paths.filter(isKnownPreexistingReview),
    guardStatus,
  };
}

function printSection(label, value) {
  console.log(`[${label}]`);
  console.log(JSON.stringify(value, null, 2));
}

export async function checkKurariExHistoryIndexTargetDate() {
  const fileExists = existsSync(abs(INDEX_PATH));
  let parseStatus = "missing";
  let parseError = null;
  let indexPayload = null;
  if (fileExists) {
    try {
      indexPayload = await readJson(INDEX_PATH);
      parseStatus = "ok";
    } catch (error) {
      parseStatus = "failed";
      parseError = error.message;
    }
  }
  const items = asArray(indexPayload?.items);
  const latest = latestItem(items);
  const targetEntry = items.find((item) => item.date === TARGET_DATE);
  const duplicateDateCount = countDuplicates(items.map((item) => item.date).filter(Boolean));
  const duplicatePathCount = countDuplicates(items.map((item) => item.file).filter(Boolean));
  const malformedItemCount = items.filter((item) => (
    !item.date || !item.file || typeof item.raceCount !== "number"
  )).length;
  const indexHashExcludingGeneratedAt = indexPayload ? hashStableIndex(indexPayload) : null;
  const indexHashMatched = indexHashExcludingGeneratedAt === EXPECTED_INDEX_HASH;

  const targetDailyExists = existsSync(abs(TARGET_DAILY_PATH));
  const targetDailyPayload = targetDailyExists ? await readJson(TARGET_DAILY_PATH) : null;
  const targetDailyHash = targetDailyPayload ? hashPayload(targetDailyPayload) : null;
  const targetDailyHashMatched = targetDailyHash === EXPECTED_TARGET_DAILY_HASH;
  const targetDailyCheck = {
    path: TARGET_DAILY_PATH,
    publicPath: TARGET_DAILY_PUBLIC_PATH,
    exists: targetDailyExists,
    payloadHash: targetDailyHash,
    expectedPayloadHash: EXPECTED_TARGET_DAILY_HASH,
    targetDailyHashMatched,
    raceCount: targetDailyPayload?.raceCount ?? null,
    settledRaceCount: targetDailyPayload?.settledRaceCount ?? null,
    cancelledRaceCount: targetDailyPayload?.cancelledRaceCount ?? null,
  };

  const indexCheck = {
    schemaVersionOk: indexPayload?.schemaVersion === 1,
    itemsArrayExists: Array.isArray(indexPayload?.items),
    sourceCount: items.length,
    sourceCountOk: items.length === 53,
    dayCount: indexPayload?.dayCount ?? null,
    dayCountOk: indexPayload?.dayCount === 53,
    raceCount: indexPayload?.raceCount ?? null,
    raceCountOk: indexPayload?.raceCount === 3997,
    settledRaceCount: indexPayload?.settledRaceCount ?? null,
    settledRaceCountOk: indexPayload?.settledRaceCount === 3989,
    cancelledRaceCount: indexPayload?.cancelledRaceCount ?? null,
    cancelledRaceCountOk: indexPayload?.cancelledRaceCount === 0,
    latestDate: latest?.date ?? null,
    latestDateOk: latest?.date === TARGET_DATE,
    latestPath: latest?.file ?? null,
    latestPathOk: latest?.file === TARGET_DAILY_PUBLIC_PATH,
    periodTo: indexPayload?.period?.to ?? null,
    periodToOk: indexPayload?.period?.to === TARGET_DATE,
    targetDateEntryExists: Boolean(targetEntry),
    targetPathEntryExists: items.some((item) => item.file === TARGET_DAILY_PUBLIC_PATH),
    targetDateEntryPathOk: targetEntry?.file === TARGET_DAILY_PUBLIC_PATH,
    targetDateEntryRaceCountOk: targetEntry?.raceCount === 64,
    duplicateDateCount,
    duplicatePathCount,
    malformedItemCount,
    indexHashExcludingGeneratedAt,
    expectedIndexHash: EXPECTED_INDEX_HASH,
    indexHashMatched,
  };

  const protectedGuard = buildProtectedGuard(await gitStatusPorcelain());
  const checkStatus = [
    fileExists,
    parseStatus === "ok",
    indexCheck.schemaVersionOk,
    indexCheck.itemsArrayExists,
    indexCheck.sourceCountOk,
    indexCheck.dayCountOk,
    indexCheck.raceCountOk,
    indexCheck.settledRaceCountOk,
    indexCheck.cancelledRaceCountOk,
    indexCheck.latestDateOk,
    indexCheck.latestPathOk,
    indexCheck.periodToOk,
    indexCheck.targetDateEntryExists,
    indexCheck.targetPathEntryExists,
    indexCheck.targetDateEntryPathOk,
    indexCheck.targetDateEntryRaceCountOk,
    duplicateDateCount === 0,
    duplicatePathCount === 0,
    malformedItemCount === 0,
    targetDailyHashMatched,
    indexHashMatched,
    protectedGuard.guardStatus === "pass",
  ].every(Boolean) ? "pass" : "fail";

  const summary = {
    targetDate: TARGET_DATE,
    indexPath: INDEX_PATH,
    fileExists,
    parseStatus,
    parseError,
    checkStatus,
    indexHashExcludingGeneratedAt,
    expectedIndexHash: EXPECTED_INDEX_HASH,
    indexHashMatched,
    sourceCount: items.length,
    dayCount: indexPayload?.dayCount ?? null,
    raceCount: indexPayload?.raceCount ?? null,
    settledRaceCount: indexPayload?.settledRaceCount ?? null,
    cancelledRaceCount: indexPayload?.cancelledRaceCount ?? null,
    latestDate: latest?.date ?? null,
    latestPath: latest?.file ?? null,
    targetDateEntryExists: Boolean(targetEntry),
    targetPathEntryExists: items.some((item) => item.file === TARGET_DAILY_PUBLIC_PATH),
    duplicateDateCount,
    duplicatePathCount,
    malformedItemCount,
    targetDailyExists,
    targetDailyHashMatched,
    historyDailyModified: protectedGuard.historyDailyModified,
    analyticsSourceModified: protectedGuard.analyticsSourceModified,
    racesModified: protectedGuard.racesModified,
    reviewsModifiedByThisStep: protectedGuard.reviewsModifiedByThisStep,
    privateInputModified: protectedGuard.privateInputModified,
    srcModified: protectedGuard.srcModified,
    packageModified: protectedGuard.packageModified,
  };
  return {
    summary,
    indexCheck,
    targetDailyCheck,
    protectedGuard,
    jsonSummary: {
      targetDate: TARGET_DATE,
      checkStatus,
      indexHashMatched,
      sourceCount: items.length,
      latestDate: latest?.date ?? null,
      targetDailyHashMatched,
    },
  };
}

async function main() {
  const result = await checkKurariExHistoryIndexTargetDate();
  printSection("summary", result.summary);
  printSection("indexCheck", result.indexCheck);
  printSection("targetDailyCheck", result.targetDailyCheck);
  printSection("protectedGuard", result.protectedGuard);
  printSection("jsonSummary", result.jsonSummary);
  if (result.summary.checkStatus !== "pass") process.exitCode = 1;
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  main().catch((error) => {
    console.error("[kurari-ex history index target-date checker] failed");
    console.error(error);
    process.exitCode = 1;
  });
}
