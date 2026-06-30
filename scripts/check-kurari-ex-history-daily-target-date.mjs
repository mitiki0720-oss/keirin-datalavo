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
const TARGET_PATH =
  `public/data/analytics/kurari-ex/history/daily/${TARGET_MONTH}/${TARGET_DATE}.generated.json`;
const HISTORY_INDEX_PATH = "public/data/analytics/kurari-ex/history/index.generated.json";
const EXPECTED_PAYLOAD_HASH =
  "sha256:96a4d2399cf7f57f777170648c9ab8da2f87f20b5bdcc3ed680f2ca6b67d6e2f";
const ALLOWED_PATHS = new Set([
  "scripts/write-kurari-ex-history-daily-from-private-raw-target-date.mjs",
  "scripts/check-kurari-ex-history-daily-target-date.mjs",
  TARGET_PATH,
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

function hashPayload(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function isKnownPreexistingReview(pathname) {
  return KNOWN_PREEXISTING_REVIEW_PATHS.some((known) => (
    known.endsWith("/") ? pathname.startsWith(known) : pathname === known
  ));
}

async function readJson(file) {
  return JSON.parse(await readFile(abs(file), "utf8"));
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
  const historyIndexModified = paths.includes(HISTORY_INDEX_PATH);
  const analyticsUnexpectedModified = paths.some((itemPath) => (
    itemPath.startsWith("public/data/analytics/")
    && itemPath !== TARGET_PATH
  ));
  const sourceAnalyticsModified = paths.some((itemPath) => (
    itemPath.startsWith("public/data/analytics/kurari-ex/source/")
  ));
  const racesModified = paths.some((itemPath) => itemPath.startsWith("public/data/races/"));
  const privateInputModified = paths.some((itemPath) => itemPath.startsWith("private-input/"));
  const srcModified = paths.some((itemPath) => itemPath.startsWith("src/"));
  const packageModified = paths.includes("package.json");
  const existingScriptModified = paths.some((itemPath) => (
    itemPath.startsWith("scripts/")
    && itemPath !== "scripts/write-kurari-ex-history-daily-from-private-raw-target-date.mjs"
    && itemPath !== "scripts/check-kurari-ex-history-daily-target-date.mjs"
  ));
  const reviewsModifiedByThisStep = paths
    .filter((itemPath) => itemPath.startsWith("public/data/reviews/"))
    .some((itemPath) => !isKnownPreexistingReview(itemPath));
  const guardStatus = [
    stagedFiles.length > 0,
    unexpectedPaths.length > 0,
    historyIndexModified,
    analyticsUnexpectedModified,
    sourceAnalyticsModified,
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
    historyIndexModified,
    analyticsUnexpectedModified,
    sourceAnalyticsModified,
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

function countMissingCoreFields(items) {
  return {
    raceKey: items.filter((item) => !item.raceKey).length,
    date: items.filter((item) => !item.date).length,
    venueKey: items.filter((item) => !item.venueKey).length,
    venueName: items.filter((item) => !item.venueName).length,
    raceNumber: items.filter((item) => !item.raceNumber).length,
    operationStatus: items.filter((item) => !item.operationStatus).length,
    starterCount: items.filter((item) => !(item.starterCount > 0)).length,
    starters: items.filter((item) => !Array.isArray(item.starters)).length,
    result: items.filter((item) => !item.result?.trifecta?.combination).length,
    prediction: items.filter((item) => !item.prediction).length,
    predictionEnrichment: items.filter((item) => !item.predictionEnrichment).length,
    lineup: items.filter((item) => !item.lineup).length,
    weather: items.filter((item) => !item.weather).length,
    quality: items.filter((item) => !item.quality).length,
  };
}

function printSection(label, value) {
  console.log(`[${label}]`);
  console.log(JSON.stringify(value, null, 2));
}

export async function checkKurariExHistoryDailyTargetDate() {
  const fileExists = existsSync(abs(TARGET_PATH));
  let payload = null;
  let parseStatus = "missing";
  let parseError = null;
  if (fileExists) {
    try {
      payload = await readJson(TARGET_PATH);
      parseStatus = "ok";
    } catch (error) {
      parseStatus = "failed";
      parseError = error.message;
    }
  }

  const items = asArray(payload?.items);
  const raceKeys = items.map((item) => item.raceKey);
  const duplicateRaceKeyCount = raceKeys.length - new Set(raceKeys).size;
  const missingCoreFieldCounts = countMissingCoreFields(items);
  const venueCount = new Set(items.map((item) => item.venueKey)).size;
  const predictionLinkedRaceCount = items.filter((item) => item.predictionEnrichment?.status === "matched").length;
  const noStartersMarkerCount = items.filter((item) => (
    item.starterCount > 0
    && asArray(item.starters).length === 0
    && item.quality?.starterParsed === false
  )).length;
  const starterIdentityGeneratedCount = items.reduce((sum, item) => sum + asArray(item.starters).length, 0);
  const registrationNoGeneratedCount = items.reduce((sum, item) => (
    sum + asArray(item.starters).filter((starter) => starter?.registrationNo).length
  ), 0);
  const payloadHash = payload ? hashPayload(payload) : null;
  const payloadHashMatched = payloadHash === EXPECTED_PAYLOAD_HASH;

  const indexPayload = await readJson(HISTORY_INDEX_PATH);
  const indexItems = asArray(indexPayload.items);
  const indexDates = indexItems.map((item) => item.date).filter(Boolean).sort();
  const indexCheck = {
    historyIndexPath: HISTORY_INDEX_PATH,
    targetDateIndexEntryExists: indexItems.some((item) => item.date === TARGET_DATE),
    sourceCount: indexItems.length,
    latestDate: indexDates.at(-1) ?? null,
    historyIndexUnchanged: (
      !indexItems.some((item) => item.date === TARGET_DATE)
      && indexItems.length === 52
      && indexDates.at(-1) === "2026-06-24"
    ),
  };

  const payloadCheck = {
    schemaVersionOk: payload?.schemaVersion === 1,
    dateOk: payload?.date === TARGET_DATE,
    raceCountOk: payload?.raceCount === 64,
    settledRaceCountOk: payload?.settledRaceCount === 64,
    cancelledRaceCountOk: payload?.cancelledRaceCount === 0,
    itemCountOk: items.length === 64,
    venueCountOk: venueCount === 7,
    duplicateRaceKeyCount,
    missingCoreFieldCounts,
    resultExistsForAll: missingCoreFieldCounts.result === 0,
    predictionExistsForAll: missingCoreFieldCounts.prediction === 0,
    predictionCoverageConsistent: (
      payload?.predictionCoverage?.matchedRaceCount === predictionLinkedRaceCount
      && payload?.predictionCoverage?.totalRaceCount === items.length
    ),
    startersEmptyForAll: items.every((item) => asArray(item.starters).length === 0),
    starterCountPositiveKnown: missingCoreFieldCounts.starterCount === 0,
    qualityStarterParsedFalseForAll: items.every((item) => item.quality?.starterParsed === false),
    starterIdentityGeneratedCount,
    registrationNoGeneratedCount,
    payloadHash,
    expectedPayloadHash: EXPECTED_PAYLOAD_HASH,
    payloadHashMatched,
  };

  const protectedGuard = buildProtectedGuard(await gitStatusPorcelain());
  const checkStatus = [
    fileExists,
    parseStatus === "ok",
    payloadCheck.schemaVersionOk,
    payloadCheck.dateOk,
    payloadCheck.raceCountOk,
    payloadCheck.settledRaceCountOk,
    payloadCheck.cancelledRaceCountOk,
    payloadCheck.itemCountOk,
    payloadCheck.venueCountOk,
    duplicateRaceKeyCount === 0,
    Object.values(missingCoreFieldCounts).every((count) => count === 0),
    payloadCheck.resultExistsForAll,
    payloadCheck.predictionExistsForAll,
    payloadCheck.predictionCoverageConsistent,
    payloadCheck.startersEmptyForAll,
    payloadCheck.starterCountPositiveKnown,
    payloadCheck.qualityStarterParsedFalseForAll,
    starterIdentityGeneratedCount === 0,
    registrationNoGeneratedCount === 0,
    payloadHashMatched,
    indexCheck.historyIndexUnchanged,
    protectedGuard.guardStatus === "pass",
  ].every(Boolean) ? "pass" : "fail";

  const summary = {
    targetDate: TARGET_DATE,
    fileExists,
    parseStatus,
    parseError,
    payloadHash,
    expectedPayloadHash: EXPECTED_PAYLOAD_HASH,
    payloadHashMatched,
    raceCount: payload?.raceCount ?? null,
    itemCount: items.length,
    venueCount,
    settledRaceCount: payload?.settledRaceCount ?? null,
    cancelledRaceCount: payload?.cancelledRaceCount ?? null,
    predictionLinkedRaceCount,
    noStartersMarkerCount,
    duplicateRaceKeyCount,
    missingCoreFieldCounts,
    historyIndexUnchanged: indexCheck.historyIndexUnchanged,
    checkStatus,
  };
  return {
    summary,
    payloadCheck,
    indexCheck,
    protectedGuard,
    jsonSummary: {
      targetDate: TARGET_DATE,
      fileExists,
      parseStatus,
      checkStatus,
      payloadHashMatched,
      raceCount: payload?.raceCount ?? null,
      itemCount: items.length,
      historyIndexUnchanged: indexCheck.historyIndexUnchanged,
    },
  };
}

async function main() {
  const result = await checkKurariExHistoryDailyTargetDate();
  printSection("summary", result.summary);
  printSection("payloadCheck", result.payloadCheck);
  printSection("indexCheck", result.indexCheck);
  printSection("protectedGuard", result.protectedGuard);
  printSection("jsonSummary", result.jsonSummary);
  if (result.summary.checkStatus !== "pass") process.exitCode = 1;
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  main().catch((error) => {
    console.error("[kurari-ex history daily target-date checker] failed");
    console.error(error);
    process.exitCode = 1;
  });
}
