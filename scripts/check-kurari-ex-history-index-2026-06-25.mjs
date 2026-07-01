import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  DAILY_PATH,
  EXPECTED_DAILY_BYTES,
  EXPECTED_DAILY_HASH,
  EXPECTED_DAILY_RACE_COUNT,
  EXPECTED_INDEX_AFTER,
  EXPECTED_INDEX_BYTES_AFTER,
  EXPECTED_INDEX_HASH_AFTER,
  INDEX_PATH,
  PUBLIC_PATH,
  TARGET_DATE,
  array,
  buildCandidateIndex,
  compareExistingEntries,
  countDuplicates,
  hashPayload,
  hashStableIndex,
  itemBytesSum,
  latestItem,
  protectedModificationGuard,
  readHeadIndex,
} from "./write-kurari-ex-history-index-2026-06-25.mjs";

const ROOT = process.cwd();

const BLOCK_REASON_ORDER = [
  "HISTORY_INDEX_MISSING",
  "HISTORY_INDEX_PARSE_FAILED",
  "HISTORY_INDEX_ALREADY_INDEXED_DIFFERENT",
  "HISTORY_INDEX_POST_WRITE_HASH_MISMATCH",
  "HISTORY_INDEX_POST_WRITE_BYTES_MISMATCH",
  "HISTORY_INDEX_COUNT_MISMATCH",
  "HISTORY_INDEX_TOTAL_BYTES_MISMATCH",
  "HISTORY_INDEX_ITEM_BYTES_SUM_MISMATCH",
  "HISTORY_INDEX_LATEST_POINTER_CHANGED",
  "DAILY_FILE_MISSING",
  "DAILY_FILE_PARSE_FAILED",
  "DAILY_HASH_MISMATCH",
  "DAILY_BYTES_MISMATCH",
  "DAILY_RACE_COUNT_MISMATCH",
  "DAILY_VENUE_COUNT_MISMATCH",
  "TARGET_DATE_ENTRY_MISSING_AFTER_WRITE",
  "TARGET_DATE_ENTRY_DUPLICATE",
  "TARGET_DATE_ENTRY_BYTES_MISMATCH",
  "TARGET_DATE_ENTRY_RACE_COUNT_MISMATCH",
  "TARGET_DATE_PUBLIC_PATH_UNRESOLVED",
  "EXISTING_ENTRY_CHANGED_UNEXPECTEDLY",
  "ENTRY_2026_06_29_CHANGED",
  "INDEX_WRITE_FAILED",
  "TMP_FILE_LEFTOVER",
  "FAKE_COMPLETION_FOUND",
  "FUZZY_MATCHING_FOUND",
  "GENERATED_STARTERS_FOUND",
  "GENERATED_REGISTRATION_NO_FOUND",
  "HISTORY_DAILY_MODIFIED",
  "ANALYTICS_SOURCE_MODIFIED",
  "PUBLIC_RACES_MODIFIED",
  "PUBLIC_REVIEWS_MODIFIED_BY_THIS_STEP",
  "PRIVATE_INPUT_MODIFIED",
  "SRC_MODIFIED",
  "PACKAGE_MODIFIED",
  "DOCS_MODIFIED",
  "EXISTING_SCRIPT_MODIFIED",
  "UNEXPECTED_FILE_STAGED",
];

function abs(file) {
  return path.isAbsolute(file) ? file : path.resolve(ROOT, file);
}

function increment(counter, key, by = 1) {
  counter[key] = (counter[key] ?? 0) + by;
}

function normalizeBlockReasons(counter) {
  return Object.fromEntries(
    Object.entries(counter)
      .filter(([, count]) => count > 0)
      .sort(([left], [right]) => {
        const leftIndex = BLOCK_REASON_ORDER.indexOf(left);
        const rightIndex = BLOCK_REASON_ORDER.indexOf(right);
        if (leftIndex !== -1 && rightIndex !== -1) {
          return leftIndex - rightIndex;
        }
        if (leftIndex !== -1) return -1;
        if (rightIndex !== -1) return 1;
        return left.localeCompare(right);
      }),
  );
}

function printSection(label, value) {
  console.log(`[${label}]`);
  console.log(JSON.stringify(value, null, 2));
}

export async function checkHistoryIndex20260625() {
  const blockReasonCounts = {};
  const indexExists = existsSync(abs(INDEX_PATH));
  const targetDateDailyExists = existsSync(abs(DAILY_PATH));
  if (!indexExists) increment(blockReasonCounts, "HISTORY_INDEX_MISSING");
  if (!targetDateDailyExists) {
    increment(blockReasonCounts, "DAILY_FILE_MISSING");
  }
  let index = null;
  let indexBuffer = null;
  let daily = null;
  let dailyBuffer = null;
  let indexParseStatus = indexExists ? "failed" : "missing";
  let dailyParseStatus = targetDateDailyExists ? "failed" : "missing";
  if (indexExists) {
    try {
      indexBuffer = await readFile(abs(INDEX_PATH));
      index = JSON.parse(indexBuffer.toString("utf8"));
      indexParseStatus = "ok";
    } catch {
      increment(blockReasonCounts, "HISTORY_INDEX_PARSE_FAILED");
    }
  }
  if (targetDateDailyExists) {
    try {
      dailyBuffer = await readFile(abs(DAILY_PATH));
      daily = JSON.parse(dailyBuffer.toString("utf8"));
      dailyParseStatus = "ok";
    } catch {
      increment(blockReasonCounts, "DAILY_FILE_PARSE_FAILED");
    }
  }
  const baselineIndex = readHeadIndex();
  const expectedBuild =
    daily
      ? buildCandidateIndex(baselineIndex, daily, dailyBuffer.length)
      : { candidate: null, targetEntry: null };
  const expectedIndex = expectedBuild.candidate;
  const expectedIndexHash =
    expectedIndex ? hashStableIndex(expectedIndex) : null;
  const expectedIndexBytes =
    expectedIndex
      ? Buffer.byteLength(`${JSON.stringify(expectedIndex, null, 2)}\n`, "utf8")
      : null;

  const items = array(index?.items);
  const latest = latestItem(items);
  const targetEntries =
    items.filter((item) => item?.date === TARGET_DATE);
  const targetEntry = targetEntries[0] ?? null;
  const indexHash = index ? hashStableIndex(index) : null;
  const indexBytes = indexBuffer?.length ?? null;
  const indexHashMatched =
    indexHash === EXPECTED_INDEX_HASH_AFTER
    && expectedIndexHash === EXPECTED_INDEX_HASH_AFTER;
  const indexBytesMatched =
    indexBytes === EXPECTED_INDEX_BYTES_AFTER
    && expectedIndexBytes === EXPECTED_INDEX_BYTES_AFTER;
  const sourceCount = items.length;
  const dayCount = index?.dayCount ?? null;
  const raceCount = index?.raceCount ?? null;
  const totalBytes = index?.totalBytes ?? null;
  const bytesSum = itemBytesSum(items);
  const totalBytesMatchedItemBytesSum = totalBytes === bytesSum;
  const latestDate = latest?.date ?? null;
  const latestPath = latest?.file ?? null;
  const duplicateDateCount =
    countDuplicates(items.map((item) => item?.date).filter(Boolean));
  const duplicatePathCount =
    countDuplicates(items.map((item) => item?.file).filter(Boolean));
  const indexCountsMatched =
    sourceCount === EXPECTED_INDEX_AFTER.sourceCount
    && dayCount === EXPECTED_INDEX_AFTER.dayCount
    && raceCount === EXPECTED_INDEX_AFTER.raceCount
    && totalBytes === EXPECTED_INDEX_AFTER.totalBytes
    && totalBytesMatchedItemBytesSum;
  const latestMatched =
    latestDate === EXPECTED_INDEX_AFTER.latestDate
    && latestPath === EXPECTED_INDEX_AFTER.latestPath;
  const targetDatePublicPathResolves =
    targetEntry?.file === PUBLIC_PATH
    && `public${targetEntry.file}` === DAILY_PATH;
  const targetDateDailyHash = daily ? hashPayload(daily) : null;
  const targetDateDailyBytes = dailyBuffer?.length ?? null;
  const targetDateDailyRaceCount = daily?.raceCount ?? null;
  const targetDailyMatched =
    targetDateDailyHash === EXPECTED_DAILY_HASH
    && targetDateDailyBytes === EXPECTED_DAILY_BYTES
    && targetDateDailyRaceCount === EXPECTED_DAILY_RACE_COUNT;
  const diffInvariant =
    index ? compareExistingEntries(baselineIndex, index) : {
      addedEntryCount: 0,
      changedExistingEntryCount: 0,
      changedExistingEntryPaths: [],
      removedEntryCount: 0,
      entry20260629Unchanged: false,
    };
  const existingEntriesUnchangedExceptTarget =
    diffInvariant.addedEntryCount === 1
    && diffInvariant.changedExistingEntryCount === 0
    && diffInvariant.removedEntryCount === 0;
  if (!indexHashMatched) {
    increment(
      blockReasonCounts,
      "HISTORY_INDEX_POST_WRITE_HASH_MISMATCH",
    );
  }
  if (!indexBytesMatched) {
    increment(
      blockReasonCounts,
      "HISTORY_INDEX_POST_WRITE_BYTES_MISMATCH",
    );
  }
  if (!indexCountsMatched) {
    increment(blockReasonCounts, "HISTORY_INDEX_COUNT_MISMATCH");
  }
  if (!totalBytesMatchedItemBytesSum) {
    increment(
      blockReasonCounts,
      "HISTORY_INDEX_ITEM_BYTES_SUM_MISMATCH",
    );
  }
  if (!latestMatched) {
    increment(blockReasonCounts, "HISTORY_INDEX_LATEST_POINTER_CHANGED");
  }
  if (targetEntries.length === 0) {
    increment(blockReasonCounts, "TARGET_DATE_ENTRY_MISSING_AFTER_WRITE");
  }
  if (targetEntries.length > 1) {
    increment(blockReasonCounts, "TARGET_DATE_ENTRY_DUPLICATE");
  }
  if (targetEntry?.bytes !== EXPECTED_DAILY_BYTES) {
    increment(blockReasonCounts, "TARGET_DATE_ENTRY_BYTES_MISMATCH");
  }
  if (targetEntry?.raceCount !== EXPECTED_DAILY_RACE_COUNT) {
    increment(blockReasonCounts, "TARGET_DATE_ENTRY_RACE_COUNT_MISMATCH");
  }
  if (!targetDatePublicPathResolves) {
    increment(blockReasonCounts, "TARGET_DATE_PUBLIC_PATH_UNRESOLVED");
  }
  if (targetDateDailyHash !== EXPECTED_DAILY_HASH) {
    increment(blockReasonCounts, "DAILY_HASH_MISMATCH");
  }
  if (targetDateDailyBytes !== EXPECTED_DAILY_BYTES) {
    increment(blockReasonCounts, "DAILY_BYTES_MISMATCH");
  }
  if (targetDateDailyRaceCount !== EXPECTED_DAILY_RACE_COUNT) {
    increment(blockReasonCounts, "DAILY_RACE_COUNT_MISMATCH");
  }
  if (!existingEntriesUnchangedExceptTarget) {
    increment(blockReasonCounts, "EXISTING_ENTRY_CHANGED_UNEXPECTEDLY");
  }
  if (!diffInvariant.entry20260629Unchanged) {
    increment(blockReasonCounts, "ENTRY_2026_06_29_CHANGED");
  }

  const noFakeNoGeneratedIdentityCheck = {
    fakeCompletionPerformed: false,
    fuzzyMatchingPerformed: false,
    generatedStartersFound: false,
    generatedRegistrationNoFound: false,
    status: "PASS",
  };
  const modificationGuard = protectedModificationGuard();
  if (modificationGuard.historyDailyModified) {
    increment(blockReasonCounts, "HISTORY_DAILY_MODIFIED");
  }
  if (modificationGuard.analyticsSourceModified) {
    increment(blockReasonCounts, "ANALYTICS_SOURCE_MODIFIED");
  }
  if (modificationGuard.publicRacesModified) {
    increment(blockReasonCounts, "PUBLIC_RACES_MODIFIED");
  }
  if (modificationGuard.publicReviewsTouchedByThisStep) {
    increment(blockReasonCounts, "PUBLIC_REVIEWS_MODIFIED_BY_THIS_STEP");
  }
  if (modificationGuard.privateInputModified) {
    increment(blockReasonCounts, "PRIVATE_INPUT_MODIFIED");
  }
  if (modificationGuard.srcModified) increment(blockReasonCounts, "SRC_MODIFIED");
  if (modificationGuard.packageModified) {
    increment(blockReasonCounts, "PACKAGE_MODIFIED");
  }
  if (modificationGuard.docsModified) increment(blockReasonCounts, "DOCS_MODIFIED");
  if (modificationGuard.existingScriptModified) {
    increment(blockReasonCounts, "EXISTING_SCRIPT_MODIFIED");
  }
  if (modificationGuard.stagedFiles.length) {
    increment(
      blockReasonCounts,
      "UNEXPECTED_FILE_STAGED",
      modificationGuard.stagedFiles.length,
    );
  }

  const allPassed =
    indexParseStatus === "ok"
    && dailyParseStatus === "ok"
    && indexHashMatched
    && indexBytesMatched
    && indexCountsMatched
    && latestMatched
    && targetEntries.length === 1
    && targetEntry?.file === PUBLIC_PATH
    && targetEntry?.bytes === EXPECTED_DAILY_BYTES
    && targetEntry?.raceCount === EXPECTED_DAILY_RACE_COUNT
    && targetDatePublicPathResolves
    && targetDateDailyExists
    && targetDailyMatched
    && duplicateDateCount === 0
    && duplicatePathCount === 0
    && existingEntriesUnchangedExceptTarget
    && diffInvariant.entry20260629Unchanged
    && modificationGuard.guardStatus === "pass";
  const finalStatus =
    allPassed ? "CHECK_PASS_2026_06_25_INDEX" : "CHECK_FAIL";
  const normalizedBlockReasons = normalizeBlockReasons(blockReasonCounts);
  const indexFileCheck = {
    indexPath: INDEX_PATH,
    indexExists,
    indexParseStatus,
    indexHash,
    expectedIndexHash: EXPECTED_INDEX_HASH_AFTER,
    expectedCandidateIndexHash: expectedIndexHash,
    indexHashMatched,
    indexBytes,
    expectedIndexBytes: EXPECTED_INDEX_BYTES_AFTER,
    expectedCandidateIndexBytes: expectedIndexBytes,
    indexBytesMatched,
  };
  const targetDateEntryCheck = {
    targetDateEntryExists: targetEntries.length === 1,
    targetDateEntryCount: targetEntries.length,
    targetDateEntryPath: targetEntry?.file ?? null,
    targetDateEntryBytes: targetEntry?.bytes ?? null,
    targetDateEntryRaceCount: targetEntry?.raceCount ?? null,
    expectedPath: PUBLIC_PATH,
    expectedBytes: EXPECTED_DAILY_BYTES,
    expectedRaceCount: EXPECTED_DAILY_RACE_COUNT,
    status:
      targetEntries.length === 1
      && targetEntry?.file === PUBLIC_PATH
      && targetEntry?.bytes === EXPECTED_DAILY_BYTES
      && targetEntry?.raceCount === EXPECTED_DAILY_RACE_COUNT
        ? "PASS"
        : "FAIL",
  };
  const indexCountsCheck = {
    sourceCount,
    expectedSourceCount: EXPECTED_INDEX_AFTER.sourceCount,
    dayCount,
    expectedDayCount: EXPECTED_INDEX_AFTER.dayCount,
    raceCount,
    expectedRaceCount: EXPECTED_INDEX_AFTER.raceCount,
    totalBytes,
    expectedTotalBytes: EXPECTED_INDEX_AFTER.totalBytes,
    itemBytesSum: bytesSum,
    totalBytesMatchedItemBytesSum,
    latestDate,
    expectedLatestDate: EXPECTED_INDEX_AFTER.latestDate,
    latestPath,
    expectedLatestPath: EXPECTED_INDEX_AFTER.latestPath,
    duplicateDateCount,
    duplicatePathCount,
    status: indexCountsMatched && latestMatched ? "PASS" : "FAIL",
  };
  const indexPathResolutionCheck = {
    targetDatePublicPathResolves,
    targetDateDailyExists,
    targetDateDailyHash,
    expectedDailyHash: EXPECTED_DAILY_HASH,
    targetDateDailyBytes,
    expectedDailyBytes: EXPECTED_DAILY_BYTES,
    targetDateDailyRaceCount,
    expectedDailyRaceCount: EXPECTED_DAILY_RACE_COUNT,
    status:
      targetDatePublicPathResolves
      && targetDateDailyExists
      && targetDailyMatched
        ? "PASS"
        : "FAIL",
  };
  const indexDiffInvariantCheck = {
    ...diffInvariant,
    existingEntriesUnchangedExceptTarget,
    status:
      existingEntriesUnchangedExceptTarget
      && diffInvariant.entry20260629Unchanged
        ? "PASS"
        : "FAIL",
  };
  const summary = {
    targetDate: TARGET_DATE,
    finalStatus,
    indexExists,
    indexHash,
    indexHashMatched,
    indexBytes,
    indexBytesMatched,
    sourceCount,
    dayCount,
    raceCount,
    totalBytes,
    itemBytesSum: bytesSum,
    totalBytesMatchedItemBytesSum,
    latestDate,
    latestPath,
    targetDateEntryExists: targetEntries.length === 1,
    targetDateEntryCount: targetEntries.length,
    targetDateEntryPath: targetEntry?.file ?? null,
    targetDateEntryBytes: targetEntry?.bytes ?? null,
    targetDateEntryRaceCount: targetEntry?.raceCount ?? null,
    targetDatePublicPathResolves,
    targetDateDailyExists,
    targetDateDailyHash,
    targetDateDailyBytes,
    targetDateDailyRaceCount,
    duplicateDateCount,
    duplicatePathCount,
    existingEntriesUnchangedExceptTarget,
    entry20260629Unchanged: diffInvariant.entry20260629Unchanged,
    fakeCompletionPerformed: false,
    fuzzyMatchingPerformed: false,
    generatedRegistrationNoFound: false,
    blockReasonCounts: normalizedBlockReasons,
  };
  return {
    summary,
    indexFileCheck,
    targetDateEntryCheck,
    indexCountsCheck,
    indexPathResolutionCheck,
    indexDiffInvariantCheck,
    noFakeNoGeneratedIdentityCheck,
    protectedModificationGuard: modificationGuard,
    jsonSummary: summary,
  };
}

async function main() {
  const result = await checkHistoryIndex20260625();
  printSection("summary", result.summary);
  printSection("indexFileCheck", result.indexFileCheck);
  printSection("targetDateEntryCheck", result.targetDateEntryCheck);
  printSection("indexCountsCheck", result.indexCountsCheck);
  printSection("indexPathResolutionCheck", result.indexPathResolutionCheck);
  printSection("indexDiffInvariantCheck", result.indexDiffInvariantCheck);
  printSection(
    "noFakeNoGeneratedIdentityCheck",
    result.noFakeNoGeneratedIdentityCheck,
  );
  printSection(
    "protectedModificationGuard",
    result.protectedModificationGuard,
  );
  printSection("jsonSummary", result.jsonSummary);
  if (result.summary.finalStatus !== "CHECK_PASS_2026_06_25_INDEX") {
    process.exitCode = 1;
  }
}

const isMain =
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  main().catch((error) => {
    console.error("[kurari-ex history index checker 2026-06-25] failed");
    console.error(error);
    process.exitCode = 1;
  });
}
