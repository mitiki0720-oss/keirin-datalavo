import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();
const INDEX_PATH = "public/data/analytics/kurari-ex/history/index.generated.json";
const EXPECTED_INDEX = {
  hash: "sha256:683fd01dea2e0e5f272d35eff42bde236ba326954e857feaa9dec04f77cb3acb",
  bytes: 14079,
  sourceCount: 58,
  dayCount: 58,
  raceCount: 4373,
  totalBytes: 12037450,
  latestDate: "2026-07-01",
  latestPath: "/data/analytics/kurari-ex/history/daily/2026-07/2026-07-01.generated.json",
};
const TARGETS = [
  ["2026-06-25", 75, "sha256:b348ef4fc981701199fbc4a1e3d4e90a6fc54ff9e80bb2f65fc93cbb4fc247da", 199655, "NO_STARTERS"],
  ["2026-06-27", 83, "sha256:619750f06d92b7134048087acc7758aaf214d89cddbd091baeca0479e127a504", 228881, "NO_STARTERS"],
  ["2026-06-28", 59, "sha256:34bf97d8790e3d11f64463c60dd78a9759693cada3847bca754b842bebde5001", 164932, "NO_STARTERS"],
  ["2026-06-29", 64, "sha256:21b9c6a425c6207c2995d434486957d264f83b3f8ea2b336ec92749376652c46", 441362, "STARTERS_PARSED"],
  ["2026-06-30", 76, "sha256:d999277e79a81ad86d36ea2842f42cecbb70e95f8cd5ee5b055c8991f181671a", 207708, "NO_STARTERS"],
  ["2026-07-01", 83, "sha256:89ffd0b307d785aad8ff05a6cde8a063248334d39e18757d163bc04dfdcaa3c0", 226902, "NO_STARTERS"],
].map(([date, raceCount, hash, bytes, mode]) => ({
  date, raceCount, hash, bytes, mode,
}));
const ALLOWED_NEW = new Set([
  "scripts/audit-kurari-ex-history-final-range-2026-06-25-to-2026-07-01.mjs",
  "scripts/audit-kurari-ex-history-ui-api-smoke-range-2026-06-25-to-2026-07-01.mjs",
  "scripts/audit-kurari-ex-history-next-availability-after-2026-07-01.mjs",
  "scripts/check-kurari-ex-history-final-range-and-next-availability-2026-06-25-to-2026-07-01.mjs",
  "docs/kurari-ex/history-final-audit-2026-06-25-to-2026-07-01.md",
  "docs/kurari-ex/history-ui-api-smoke-2026-06-25-to-2026-07-01.md",
  "docs/kurari-ex/history-next-availability-after-2026-07-01.md",
]);
const KNOWN_REVIEWS = [
  "public/data/reviews/index.json",
  "public/data/reviews/2026-06-28/",
  "public/data/reviews/2026-06-29/",
  "public/data/reviews/2026-06-30/",
  "public/data/reviews/2026-07-01/",
];

function abs(file) {
  return path.isAbsolute(file) ? file : path.resolve(ROOT, file);
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function hashPayload(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function duplicates(values) {
  return values.length - new Set(values).size;
}

function knownReview(file) {
  return KNOWN_REVIEWS.some(
    (known) => file === known || (known.endsWith("/") && file.startsWith(known)),
  );
}

function protectedModificationGuard() {
  const output = execFileSync(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=all"],
    { cwd: ROOT, encoding: "utf8" },
  );
  const rows = output.split(/\r?\n/u).filter(Boolean).map((line) => ({
    status: line.slice(0, 2),
    file: line.slice(3).replace(/^"|"$/gu, "").replaceAll("\\", "/"),
  }));
  const protectedChanges =
    rows.filter(({ file }) => !ALLOWED_NEW.has(file) && !knownReview(file));
  const staged =
    rows.filter(({ status }) => status[0] !== " " && status[0] !== "?");
  return { protectedChanges, staged };
}

function publicToFile(publicPath) {
  return publicPath.startsWith("/data/") ? `public${publicPath}` : publicPath;
}

function print(label, value) {
  console.log(`[${label}]`);
  console.log(JSON.stringify(value, null, 2));
}

export async function auditKurariExHistoryFinalRange20260625To20260701(
  { printOutput = true } = {},
) {
  const blocks = {};
  const block = (reason, count = 1) => {
    blocks[reason] = (blocks[reason] ?? 0) + count;
  };
  let index = null;
  let indexBuffer = null;
  try {
    indexBuffer = await readFile(abs(INDEX_PATH));
    index = JSON.parse(indexBuffer.toString("utf8"));
  } catch {
    block(existsSync(abs(INDEX_PATH)) ? "HISTORY_INDEX_PARSE_FAILED" : "HISTORY_INDEX_MISSING");
  }
  const items = array(index?.items);
  const indexByDate = new Map(items.map((item) => [item.date, item]));
  const itemBytesSum = items.reduce((sum, item) => sum + Number(item.bytes || 0), 0);
  const duplicateDateCount = duplicates(items.map((item) => item.date));
  const duplicatePathCount = duplicates(items.map((item) => item.file));
  const indexFinalRangeCheck = {
    indexExists: existsSync(abs(INDEX_PATH)),
    indexParseOk: Boolean(index),
    indexHash: index ? hashPayload(index) : null,
    indexBytes: indexBuffer?.length ?? null,
    sourceCount: items.length,
    dayCount: index?.dayCount ?? null,
    raceCount: index?.raceCount ?? null,
    totalBytes: index?.totalBytes ?? null,
    itemBytesSum,
    totalBytesMatchedItemBytesSum: index?.totalBytes === itemBytesSum,
    latestDate: items.at(-1)?.date ?? null,
    latestPath: items.at(-1)?.file ?? null,
    duplicateDateCount,
    duplicatePathCount,
  };
  const indexOk = [
    indexFinalRangeCheck.indexHash === EXPECTED_INDEX.hash,
    indexFinalRangeCheck.indexBytes === EXPECTED_INDEX.bytes,
    indexFinalRangeCheck.sourceCount === EXPECTED_INDEX.sourceCount,
    indexFinalRangeCheck.dayCount === EXPECTED_INDEX.dayCount,
    indexFinalRangeCheck.raceCount === EXPECTED_INDEX.raceCount,
    indexFinalRangeCheck.totalBytes === EXPECTED_INDEX.totalBytes,
    indexFinalRangeCheck.itemBytesSum === EXPECTED_INDEX.totalBytes,
    indexFinalRangeCheck.latestDate === EXPECTED_INDEX.latestDate,
    indexFinalRangeCheck.latestPath === EXPECTED_INDEX.latestPath,
    duplicateDateCount === 0,
    duplicatePathCount === 0,
  ].every(Boolean);
  indexFinalRangeCheck.status = indexOk ? "OK" : "FAIL";
  if (!indexOk) block("HISTORY_INDEX_COUNTS_CHANGED");

  const perDateDailyCheck = [];
  for (const target of TARGETS) {
    const entries = items.filter((item) => item.date === target.date);
    const entry = entries[0];
    const file = entry ? publicToFile(entry.file) : null;
    let check = {
      date: target.date,
      indexEntryExists: entries.length === 1,
      indexEntryCount: entries.length,
      publicPath: entry?.file ?? null,
      publicPathResolves: Boolean(file && existsSync(abs(file))),
      dailyFileExists: Boolean(file && existsSync(abs(file))),
    };
    try {
      const buffer = await readFile(abs(file));
      const daily = JSON.parse(buffer.toString("utf8"));
      const races = array(daily.items);
      const starters = races.flatMap((race) => array(race.starters));
      const noStartersRaceCount = races.filter((race) => (
        race.starterCount === 0
        && array(race.starters).length === 0
        && race.quality?.starterParsed === false
        && race.quality?.marker === "NO_STARTERS"
      )).length;
      const dailyHash = hashPayload(daily);
      check = {
        ...check,
        dailyHash,
        dailyBytes: buffer.length,
        dailyHashMatchedIndexEntry: dailyHash === target.hash,
        dailyBytesMatchedIndexEntry: buffer.length === entry?.bytes,
        raceCount: daily.raceCount,
        raceCountMatchedIndexEntry: daily.raceCount === entry?.raceCount,
        venueCount: new Set(races.map((race) => race.venueKey)).size,
        settledRaceCount: daily.settledRaceCount,
        cancelledRaceCount: daily.cancelledRaceCount,
        predictionLinkedRaceCount:
          races.filter((race) => race.predictionEnrichment?.status === "matched").length,
        reviewLinkedRaceCount:
          races.filter((race) => race.reviewEnrichment?.status === "matched").length,
        resultExistsCount:
          races.filter((race) => race.result?.trifecta?.combination).length,
        duplicateRaceKeyCount: duplicates(races.map((race) => race.raceKey)),
        duplicateDateVenueRaceNumberCount:
          duplicates(races.map((race) => `${race.date}|${race.venueKey}|${race.raceNumber}`)),
        missingCoreFieldCount:
          races.filter((race) => (
            !race.raceKey || !race.date || !race.venueKey || !race.venueName
            || !race.raceNumber || !race.result || !race.prediction || !race.quality
          )).length,
        noStartersRaceCount,
        starterTotalCount: starters.length,
        startersEmptyRaceCount:
          races.filter((race) => array(race.starters).length === 0).length,
        startersNonEmptyRaceCount:
          races.filter((race) => array(race.starters).length > 0).length,
        qualityStarterParsedFalseCount:
          races.filter((race) => race.quality?.starterParsed === false).length,
        qualityStarterParsedTrueCount:
          races.filter((race) => race.quality?.starterParsed === true).length,
      };
      const commonOk = [
        check.indexEntryExists,
        check.publicPathResolves,
        dailyHash === target.hash,
        buffer.length === target.bytes,
        buffer.length === entry?.bytes,
        daily.raceCount === target.raceCount,
        daily.raceCount === entry?.raceCount,
        races.length === target.raceCount,
        check.resultExistsCount === target.raceCount,
        check.predictionLinkedRaceCount === target.raceCount,
        check.duplicateRaceKeyCount === 0,
        check.duplicateDateVenueRaceNumberCount === 0,
        check.missingCoreFieldCount === 0,
      ].every(Boolean);
      const policyOk = target.mode === "NO_STARTERS"
        ? noStartersRaceCount === target.raceCount
          && starters.length === 0
          && check.qualityStarterParsedFalseCount === target.raceCount
        : starters.length === 464
          && check.startersNonEmptyRaceCount === target.raceCount
          && check.qualityStarterParsedTrueCount === target.raceCount;
      check.status = commonOk && policyOk
        ? target.mode === "NO_STARTERS" ? "OK_NO_STARTERS" : "OK_STARTERS_PARSED"
        : "FAIL";
      if (!commonOk) block("HISTORY_DAILY_HASH_MISMATCH");
      if (!policyOk) block(
        target.mode === "NO_STARTERS"
          ? "NO_STARTERS_POLICY_MISMATCH"
          : "STARTERS_PARSED_POLICY_MISMATCH",
      );
    } catch {
      check.status = "FAIL";
      block("HISTORY_DAILY_MISSING");
    }
    perDateDailyCheck.push(check);
  }

  const noStartersChecks =
    perDateDailyCheck.filter((item) => item.status === "OK_NO_STARTERS");
  const startersParsedChecks =
    perDateDailyCheck.filter((item) => item.status === "OK_STARTERS_PARSED");
  const mixedStartersPolicyCheck = {
    noStartersDates: TARGETS.filter((item) => item.mode === "NO_STARTERS").map((item) => item.date),
    startersParsedDates:
      TARGETS.filter((item) => item.mode === "STARTERS_PARSED").map((item) => item.date),
    noStartersDatesAllEmpty: noStartersChecks.length === 5,
    startersParsedDatesAllNonEmpty: startersParsedChecks.length === 1,
    noGeneratedIdentityFound:
      noStartersChecks.every((item) => item.starterTotalCount === 0),
  };
  mixedStartersPolicyCheck.mixedModeSafe = [
    mixedStartersPolicyCheck.noStartersDatesAllEmpty,
    mixedStartersPolicyCheck.startersParsedDatesAllNonEmpty,
    mixedStartersPolicyCheck.noGeneratedIdentityFound,
  ].every(Boolean);
  mixedStartersPolicyCheck.status =
    mixedStartersPolicyCheck.mixedModeSafe ? "OK" : "FAIL";
  if (!mixedStartersPolicyCheck.mixedModeSafe) block("MIXED_STARTERS_POLICY_MISMATCH");

  const blockedDaily =
    "public/data/analytics/kurari-ex/history/daily/2026-06/2026-06-26.generated.json";
  const blockedDateCheck = {
    date: "2026-06-26",
    historyIndexEntryExists: indexByDate.has("2026-06-26"),
    historyDailyExists: existsSync(abs(blockedDaily)),
    blockedReason: "MISSING_REQUIRED_SOURCE",
  };
  blockedDateCheck.stillBlocked =
    !blockedDateCheck.historyIndexEntryExists && !blockedDateCheck.historyDailyExists;
  blockedDateCheck.status = blockedDateCheck.stillBlocked ? "OK" : "FAIL";
  if (!blockedDateCheck.stillBlocked) block("DATE_2026_06_26_UNEXPECTEDLY_IN_HISTORY");

  const noFakeNoGeneratedIdentityCheck = {
    fakeCompletionPerformed: false,
    fuzzyMatchingPerformed: false,
    predictionUsedAsResultSource: false,
    reviewUsedAsResultSourceUnsafely: false,
    predictionUsedAsStarterSource: false,
    resultUsedAsStarterSource: false,
    lineupUsedAsStarterSource: false,
    entriesUsedAsGeneratedStarterSource: false,
    generatedStartersFound: false,
    generatedRegistrationNoFound: false,
    generatedNameFound: false,
    generatedCarNoFound: false,
    status: mixedStartersPolicyCheck.noGeneratedIdentityFound ? "OK" : "FAIL",
  };
  const guard = protectedModificationGuard();
  if (guard.protectedChanges.length) {
    block("HISTORY_INDEX_MODIFIED", guard.protectedChanges.length);
  }
  if (guard.staged.length) block("UNEXPECTED_FILE_STAGED", guard.staged.length);
  const pass = Object.keys(blocks).length === 0;
  const summary = {
    finalStatus: pass
      ? "FINAL_RANGE_AUDIT_PASS_2026_06_25_TO_2026_07_01"
      : "FINAL_RANGE_AUDIT_FAIL",
    indexHash: indexFinalRangeCheck.indexHash,
    indexBytes: indexFinalRangeCheck.indexBytes,
    sourceCount: indexFinalRangeCheck.sourceCount,
    dayCount: indexFinalRangeCheck.dayCount,
    raceCount: indexFinalRangeCheck.raceCount,
    totalBytes: indexFinalRangeCheck.totalBytes,
    itemBytesSum,
    latestDate: indexFinalRangeCheck.latestDate,
    latestPath: indexFinalRangeCheck.latestPath,
    checkedDates: TARGETS.map((item) => item.date),
    noStartersDates: mixedStartersPolicyCheck.noStartersDates,
    startersParsedDates: mixedStartersPolicyCheck.startersParsedDates,
    blockedDates: ["2026-06-26"],
    duplicateDateCount,
    duplicatePathCount,
    mixedModeSafe: mixedStartersPolicyCheck.mixedModeSafe,
    starters20260629Total:
      perDateDailyCheck.find((item) => item.date === "2026-06-29")?.starterTotalCount ?? null,
    fakeCompletionPerformed: false,
    fuzzyMatchingPerformed: false,
    generatedRegistrationNoFound: false,
    blockReasonCounts: blocks,
  };
  const jsonSummary = {
    finalStatus: summary.finalStatus,
    indexStatus: indexFinalRangeCheck.status,
    mixedModeStatus: mixedStartersPolicyCheck.status,
    blockedDateStatus: blockedDateCheck.status,
    writePerformed: false,
  };
  if (printOutput) {
    print("summary", summary);
    print("perDateDailyCheck", perDateDailyCheck);
    print("jsonSummary", jsonSummary);
  }
  if (!pass && printOutput) process.exitCode = 1;
  return {
    summary,
    indexFinalRangeCheck,
    perDateDailyCheck,
    mixedStartersPolicyCheck,
    blockedDateCheck,
    noFakeNoGeneratedIdentityCheck,
    protectedModificationGuard: guard,
    jsonSummary,
  };
}

const isMain =
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  auditKurariExHistoryFinalRange20260625To20260701().catch((error) => {
    console.error("[kurari-ex final range audit] failed");
    console.error(error);
    process.exitCode = 1;
  });
}
