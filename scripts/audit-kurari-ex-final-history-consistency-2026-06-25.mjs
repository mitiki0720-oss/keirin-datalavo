import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();
const TARGET_DATE = "2026-06-25";
const INDEX_PATH =
  "public/data/analytics/kurari-ex/history/index.generated.json";
const DAILY_PATH =
  "public/data/analytics/kurari-ex/history/daily/2026-06/2026-06-25.generated.json";
const PUBLIC_PATH =
  "/data/analytics/kurari-ex/history/daily/2026-06/2026-06-25.generated.json";
const STARTERS_SOURCE_PATH =
  "public/data/analytics/kurari-ex/source/starters/2026-06-25/today-registration-starters.generated.json";
const ENTRIES_SNAPSHOT_PATH =
  "public/data/races/entries-history/2026-06-25/keirin-jp-entries.generated.json";
const EXPECTED_INDEX_HASH =
  "sha256:5b9d2a00ebd5c62654ac769cc67609241c6fb37ace6f1194e7a2a8dab9b3eea2";
const EXPECTED_INDEX_BYTES = 13127;
const EXPECTED_DAILY_HASH =
  "sha256:b348ef4fc981701199fbc4a1e3d4e90a6fc54ff9e80bb2f65fc93cbb4fc247da";
const EXPECTED_DAILY_BYTES = 199655;
const EXPECTED = {
  sourceCount: 54,
  dayCount: 54,
  raceCount: 4072,
  totalBytes: 11209027,
  latestDate: "2026-06-29",
  latestPath:
    "/data/analytics/kurari-ex/history/daily/2026-06/2026-06-29.generated.json",
  dailyRaceCount: 75,
  dailyVenueCount: 8,
};
const EXPECTED_20260629 = {
  path:
    "/data/analytics/kurari-ex/history/daily/2026-06/2026-06-29.generated.json",
  bytes: 441362,
  raceCount: 64,
};
const THIS_SCRIPT =
  "scripts/audit-kurari-ex-final-history-consistency-2026-06-25.mjs";
const KNOWN_REVIEW_CHANGES = [
  "public/data/reviews/index.json",
  "public/data/reviews/2026-06-28/",
  "public/data/reviews/2026-06-29/",
  "public/data/reviews/2026-06-30/",
  "public/data/reviews/2026-07-01/",
];

const BLOCK_REASON_ORDER = [
  "HISTORY_INDEX_MISSING",
  "HISTORY_INDEX_PARSE_FAILED",
  "HISTORY_INDEX_HASH_MISMATCH",
  "HISTORY_INDEX_BYTES_MISMATCH",
  "HISTORY_INDEX_COUNT_MISMATCH",
  "HISTORY_INDEX_TOTAL_BYTES_MISMATCH",
  "HISTORY_INDEX_ITEM_BYTES_SUM_MISMATCH",
  "HISTORY_INDEX_LATEST_POINTER_MISMATCH",
  "TARGET_DATE_ENTRY_MISSING",
  "TARGET_DATE_ENTRY_DUPLICATE",
  "TARGET_DATE_ENTRY_PATH_MISMATCH",
  "TARGET_DATE_ENTRY_BYTES_MISMATCH",
  "TARGET_DATE_ENTRY_RACE_COUNT_MISMATCH",
  "TARGET_DATE_PUBLIC_PATH_UNRESOLVED",
  "TARGET_DAILY_MISSING",
  "TARGET_DAILY_PARSE_FAILED",
  "TARGET_DAILY_HASH_MISMATCH",
  "TARGET_DAILY_BYTES_MISMATCH",
  "TARGET_DAILY_RACE_COUNT_MISMATCH",
  "TARGET_DAILY_VENUE_COUNT_MISMATCH",
  "TARGET_DAILY_SHAPE_INVALID",
  "NO_STARTERS_POLICY_MISMATCH",
  "STARTERS_SOURCE_AVAILABLE_UNEXPECTEDLY",
  "ENTRIES_SNAPSHOT_AVAILABLE_UNEXPECTEDLY",
  "GENERATED_STARTERS_FOUND",
  "GENERATED_REGISTRATION_NO_FOUND",
  "ENTRY_2026_06_29_CHANGED",
  "LATEST_POINTER_CHANGED_UNEXPECTEDLY",
  "EXISTING_ENTRY_CHANGED_UNEXPECTEDLY",
  "EXISTING_ENTRY_REMOVED_UNEXPECTEDLY",
  "FAKE_COMPLETION_FOUND",
  "FUZZY_MATCHING_FOUND",
  "PREDICTION_USED_AS_RESULT_SOURCE",
  "REVIEW_USED_AS_RESULT_SOURCE_UNSAFELY",
  "WRITE_PERFORMED_IN_AUDIT",
  "INDEX_MODIFIED",
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

function array(value) {
  return Array.isArray(value) ? value : [];
}

function increment(counter, key, by = 1) {
  counter[key] = (counter[key] ?? 0) + by;
}

function hashBuffer(buffer) {
  return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
}

function hashPayload(payload) {
  return hashBuffer(Buffer.from(JSON.stringify(payload), "utf8"));
}

function hashStableIndex(payload) {
  return hashPayload({ ...payload, generatedAt: undefined });
}

function countDuplicates(values) {
  return values.length - new Set(values).size;
}

function latestItem(items) {
  return [...items]
    .sort((left, right) => String(left.date).localeCompare(String(right.date)))
    .at(-1) ?? null;
}

function deepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function readJsonStatus(file) {
  if (!existsSync(abs(file))) {
    return {
      exists: false,
      parseStatus: "missing",
      payload: null,
      buffer: null,
      error: null,
    };
  }
  try {
    const buffer = await readFile(abs(file));
    return {
      exists: true,
      parseStatus: "ok",
      payload: JSON.parse(buffer.toString("utf8")),
      buffer,
      error: null,
    };
  } catch (error) {
    return {
      exists: true,
      parseStatus: "failed",
      payload: null,
      buffer: null,
      error: error.message,
    };
  }
}

function readHeadIndex() {
  const text = execFileSync(
    "git",
    ["show", `HEAD:${INDEX_PATH}`],
    { cwd: ROOT, encoding: "utf8" },
  );
  return JSON.parse(text);
}

function parsePorcelain() {
  const output = execFileSync(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=all"],
    { cwd: ROOT, encoding: "utf8" },
  );
  return output
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => {
      const status = line.slice(0, 2);
      const rawPath = line.slice(3).replace(/^"|"$/gu, "");
      const file = rawPath.includes(" -> ")
        ? rawPath.split(" -> ").at(-1)
        : rawPath;
      return { status, file: file.replaceAll("\\", "/") };
    });
}

function knownReview(file) {
  return KNOWN_REVIEW_CHANGES.some(
    (known) => file === known || (known.endsWith("/") && file.startsWith(known)),
  );
}

function protectedModificationGuard() {
  const rows = parsePorcelain();
  const changedFiles = rows.map((row) => row.file);
  const stagedFiles =
    rows.filter((row) => row.status[0] !== " " && row.status[0] !== "?")
      .map((row) => row.file);
  const unexpectedModifiedFiles = rows
    .filter((row) => row.status !== "??")
    .map((row) => row.file)
    .filter((file) => !knownReview(file));
  const unexpectedUntrackedFiles = rows
    .filter((row) => row.status === "??")
    .map((row) => row.file)
    .filter((file) => file !== THIS_SCRIPT && !knownReview(file));
  const indexModified = changedFiles.includes(INDEX_PATH);
  const historyDailyModified =
    changedFiles.some(
      (file) =>
        file.startsWith(
          "public/data/analytics/kurari-ex/history/daily/",
        ),
    );
  const analyticsSourceModified =
    changedFiles.some(
      (file) =>
        file.startsWith("public/data/analytics/kurari-ex/source/"),
    );
  const publicRacesModified =
    changedFiles.some((file) => file.startsWith("public/data/races/"));
  const publicReviewsTouchedByThisStep =
    changedFiles.some(
      (file) => file.startsWith("public/data/reviews/") && !knownReview(file),
    );
  const privateInputModified =
    changedFiles.some((file) => file.startsWith("private-input/"));
  const srcModified =
    changedFiles.some((file) => file.startsWith("src/"));
  const packageModified = changedFiles.includes("package.json");
  const docsModified =
    changedFiles.some((file) => file.startsWith("docs/"));
  const existingScriptModified =
    changedFiles.some(
      (file) => file.startsWith("scripts/") && file !== THIS_SCRIPT,
    );
  const allowedNewScriptOnly =
    rows.some((row) => row.file === THIS_SCRIPT && row.status === "??")
    && unexpectedModifiedFiles.length === 0
    && unexpectedUntrackedFiles.length === 0;
  const failed =
    !allowedNewScriptOnly
    || indexModified
    || historyDailyModified
    || analyticsSourceModified
    || publicRacesModified
    || publicReviewsTouchedByThisStep
    || privateInputModified
    || srcModified
    || packageModified
    || docsModified
    || existingScriptModified
    || stagedFiles.length > 0;
  return {
    allowedNewScriptOnly,
    indexModified,
    historyDailyModified,
    analyticsSourceModified,
    publicRacesModified,
    publicReviewsTouchedByThisStep,
    privateInputModified,
    srcModified,
    packageModified,
    docsModified,
    existingScriptModified,
    unexpectedModifiedFiles,
    unexpectedUntrackedFiles,
    stagedFiles,
    guardStatus: failed ? "fail" : "pass",
  };
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

function nextActionPlan(finalStatus) {
  const prohibitedFiles = [
    "public/data/analytics/**",
    "public/data/races/**",
    "public/data/reviews/**",
    "private-input/**",
    "src/**",
    "package.json",
    "docs/**",
  ];
  const steps = [
    [
      "ui-api-consumption-smoke",
      "2026-06-25 UI/API consumption smoke no-starters",
    ],
    ["completion-memo", "2026-06-25 completion memo"],
    [
      "starters-entries-source-acquisition",
      "starters/entries source acquisition is separate",
    ],
    [
      "repeat-2026-06-27-2026-06-28",
      "2026-06-27 / 2026-06-28 repeat after 6/25 pattern",
    ],
    ["reviews-separate-management", "reviews差分は別管理・別commit"],
  ];
  return steps.map(([stepId, action], index) => ({
    stepId,
    action,
    targetDate:
      stepId === "repeat-2026-06-27-2026-06-28"
        ? ["2026-06-27", "2026-06-28"]
        : TARGET_DATE,
    prerequisiteStatus: finalStatus,
    allowedFiles: ["別工程で明示された新規audit/memoのみ"],
    prohibitedFiles,
    readiness:
      index === 0
      && finalStatus === "FINAL_CONSISTENCY_PASS_2026_06_25_NO_STARTERS"
        ? "ready"
        : "future",
    notes: "このfinal auditではデータ・source・既存scriptを書き換えない。",
  }));
}

function printSection(label, value) {
  console.log(`[${label}]`);
  console.log(JSON.stringify(value, null, 2));
}

export async function auditFinalHistoryConsistency20260625() {
  const blockReasonCounts = {};
  const [indexRead, dailyRead] = await Promise.all([
    readJsonStatus(INDEX_PATH),
    readJsonStatus(DAILY_PATH),
  ]);
  if (!indexRead.exists) {
    increment(blockReasonCounts, "HISTORY_INDEX_MISSING");
  } else if (indexRead.parseStatus !== "ok") {
    increment(blockReasonCounts, "HISTORY_INDEX_PARSE_FAILED");
  }
  const index = indexRead.payload ?? {};
  const indexItems = array(index.items);
  const indexLatest = latestItem(indexItems);
  const indexHash = indexRead.payload ? hashStableIndex(index) : null;
  const indexBytes = indexRead.buffer?.length ?? null;
  const sourceCount = indexItems.length;
  const dayCount = index.dayCount ?? null;
  const raceCount = index.raceCount ?? null;
  const totalBytes = index.totalBytes ?? null;
  const itemBytesSum =
    indexItems.reduce((sum, item) => sum + (Number(item.bytes) || 0), 0);
  const duplicateDateCount =
    countDuplicates(indexItems.map((item) => item?.date).filter(Boolean));
  const duplicatePathCount =
    countDuplicates(indexItems.map((item) => item?.file).filter(Boolean));
  const indexConsistencyPassed =
    indexRead.parseStatus === "ok"
    && indexHash === EXPECTED_INDEX_HASH
    && indexBytes === EXPECTED_INDEX_BYTES
    && sourceCount === EXPECTED.sourceCount
    && dayCount === EXPECTED.dayCount
    && raceCount === EXPECTED.raceCount
    && totalBytes === EXPECTED.totalBytes
    && itemBytesSum === EXPECTED.totalBytes
    && indexLatest?.date === EXPECTED.latestDate
    && indexLatest?.file === EXPECTED.latestPath
    && duplicateDateCount === 0
    && duplicatePathCount === 0;
  if (indexHash !== EXPECTED_INDEX_HASH) {
    increment(blockReasonCounts, "HISTORY_INDEX_HASH_MISMATCH");
  }
  if (indexBytes !== EXPECTED_INDEX_BYTES) {
    increment(blockReasonCounts, "HISTORY_INDEX_BYTES_MISMATCH");
  }
  if (
    sourceCount !== EXPECTED.sourceCount
    || dayCount !== EXPECTED.dayCount
    || raceCount !== EXPECTED.raceCount
  ) increment(blockReasonCounts, "HISTORY_INDEX_COUNT_MISMATCH");
  if (totalBytes !== EXPECTED.totalBytes) {
    increment(blockReasonCounts, "HISTORY_INDEX_TOTAL_BYTES_MISMATCH");
  }
  if (itemBytesSum !== EXPECTED.totalBytes) {
    increment(
      blockReasonCounts,
      "HISTORY_INDEX_ITEM_BYTES_SUM_MISMATCH",
    );
  }
  if (
    indexLatest?.date !== EXPECTED.latestDate
    || indexLatest?.file !== EXPECTED.latestPath
  ) increment(blockReasonCounts, "HISTORY_INDEX_LATEST_POINTER_MISMATCH");
  const indexConsistencyCheck = {
    indexExists: indexRead.exists,
    indexParseStatus: indexRead.parseStatus,
    indexHash,
    expectedIndexHash: EXPECTED_INDEX_HASH,
    indexBytes,
    expectedIndexBytes: EXPECTED_INDEX_BYTES,
    sourceCount,
    dayCount,
    raceCount,
    totalBytes,
    itemBytesSum,
    latestDate: indexLatest?.date ?? null,
    latestPath: indexLatest?.file ?? null,
    duplicateDateCount,
    duplicatePathCount,
    status: indexConsistencyPassed ? "PASS" : "FAIL",
  };

  const targetEntries =
    indexItems.filter((item) => item?.date === TARGET_DATE);
  const targetEntry = targetEntries[0] ?? null;
  const resolvedTargetPath =
    targetEntry?.file?.startsWith("/") ? `public${targetEntry.file}` : null;
  const targetDatePublicPathResolves =
    targetEntry?.file === PUBLIC_PATH && resolvedTargetPath === DAILY_PATH;
  const resolvedFileExists =
    Boolean(resolvedTargetPath && existsSync(abs(resolvedTargetPath)));
  const targetDateIndexEntryPassed =
    targetEntries.length === 1
    && targetEntry?.file === PUBLIC_PATH
    && targetEntry?.bytes === EXPECTED_DAILY_BYTES
    && targetEntry?.raceCount === EXPECTED.dailyRaceCount
    && targetDatePublicPathResolves
    && resolvedFileExists;
  if (targetEntries.length === 0) {
    increment(blockReasonCounts, "TARGET_DATE_ENTRY_MISSING");
  }
  if (targetEntries.length > 1) {
    increment(blockReasonCounts, "TARGET_DATE_ENTRY_DUPLICATE");
  }
  if (targetEntry?.file !== PUBLIC_PATH) {
    increment(blockReasonCounts, "TARGET_DATE_ENTRY_PATH_MISMATCH");
  }
  if (targetEntry?.bytes !== EXPECTED_DAILY_BYTES) {
    increment(blockReasonCounts, "TARGET_DATE_ENTRY_BYTES_MISMATCH");
  }
  if (targetEntry?.raceCount !== EXPECTED.dailyRaceCount) {
    increment(blockReasonCounts, "TARGET_DATE_ENTRY_RACE_COUNT_MISMATCH");
  }
  if (!targetDatePublicPathResolves || !resolvedFileExists) {
    increment(blockReasonCounts, "TARGET_DATE_PUBLIC_PATH_UNRESOLVED");
  }
  const targetDateIndexEntryCheck = {
    targetDate: TARGET_DATE,
    entryExists: targetEntries.length === 1,
    entryCount: targetEntries.length,
    entryPath: targetEntry?.file ?? null,
    entryBytes: targetEntry?.bytes ?? null,
    entryRaceCount: targetEntry?.raceCount ?? null,
    publicPathResolves: targetDatePublicPathResolves,
    resolvedFileExists,
    status: targetDateIndexEntryPassed ? "PASS" : "FAIL",
  };

  if (!dailyRead.exists) {
    increment(blockReasonCounts, "TARGET_DAILY_MISSING");
  } else if (dailyRead.parseStatus !== "ok") {
    increment(blockReasonCounts, "TARGET_DAILY_PARSE_FAILED");
  }
  const daily = dailyRead.payload ?? {};
  const dailyItems = array(daily.items);
  const dailyHash = dailyRead.payload ? hashPayload(daily) : null;
  const dailyBytes = dailyRead.buffer?.length ?? null;
  const dailyVenueCount =
    new Set(dailyItems.map((item) => item.venueKey)).size;
  const predictionLinkedRaceCount =
    dailyItems.filter(
      (item) => item.predictionEnrichment?.status === "matched",
    ).length;
  const reviewLinkedRaceCount =
    dailyItems.filter(
      (item) => item.reviewEnrichment?.status === "matched",
    ).length;
  const resultExistsCount =
    dailyItems.filter(
      (item) => Boolean(item.result?.trifecta?.combination),
    ).length;
  const predictionExistsCount =
    dailyItems.filter((item) => Boolean(item.prediction)).length;
  const duplicateRaceKeyCount =
    countDuplicates(dailyItems.map((item) => item.raceKey));
  const duplicateDateVenueRaceNumberCount =
    countDuplicates(
      dailyItems.map(
        (item) => `${item.date}:${item.venueKey}:${item.raceNumber}`,
      ),
    );
  const missingCoreFieldCounts = {
    raceKey: dailyItems.filter((item) => !item.raceKey).length,
    date: dailyItems.filter((item) => !item.date).length,
    venueKey: dailyItems.filter((item) => !item.venueKey).length,
    venueName: dailyItems.filter((item) => !item.venueName).length,
    raceNumber: dailyItems.filter((item) => !item.raceNumber).length,
    operationStatus:
      dailyItems.filter((item) => !item.operationStatus).length,
    result:
      dailyItems.filter((item) => !item.result?.trifecta?.combination).length,
    prediction: dailyItems.filter((item) => !item.prediction).length,
  };
  const missingCoreFieldTotal =
    Object.values(missingCoreFieldCounts).reduce((sum, count) => sum + count, 0);
  const targetDailyPassed =
    dailyRead.parseStatus === "ok"
    && dailyHash === EXPECTED_DAILY_HASH
    && dailyBytes === EXPECTED_DAILY_BYTES
    && daily.date === TARGET_DATE
    && daily.raceCount === EXPECTED.dailyRaceCount
    && dailyVenueCount === EXPECTED.dailyVenueCount
    && daily.settledRaceCount === EXPECTED.dailyRaceCount
    && daily.cancelledRaceCount === 0
    && predictionLinkedRaceCount === EXPECTED.dailyRaceCount
    && reviewLinkedRaceCount === EXPECTED.dailyRaceCount
    && resultExistsCount === EXPECTED.dailyRaceCount
    && predictionExistsCount === EXPECTED.dailyRaceCount
    && duplicateRaceKeyCount === 0
    && duplicateDateVenueRaceNumberCount === 0
    && missingCoreFieldTotal === 0;
  if (dailyHash !== EXPECTED_DAILY_HASH) {
    increment(blockReasonCounts, "TARGET_DAILY_HASH_MISMATCH");
  }
  if (dailyBytes !== EXPECTED_DAILY_BYTES) {
    increment(blockReasonCounts, "TARGET_DAILY_BYTES_MISMATCH");
  }
  if (daily.raceCount !== EXPECTED.dailyRaceCount) {
    increment(blockReasonCounts, "TARGET_DAILY_RACE_COUNT_MISMATCH");
  }
  if (dailyVenueCount !== EXPECTED.dailyVenueCount) {
    increment(blockReasonCounts, "TARGET_DAILY_VENUE_COUNT_MISMATCH");
  }
  if (!targetDailyPassed) {
    increment(blockReasonCounts, "TARGET_DAILY_SHAPE_INVALID");
  }
  const targetDailyConsistencyCheck = {
    dailyExists: dailyRead.exists,
    dailyParseStatus: dailyRead.parseStatus,
    dailyHash,
    expectedDailyHash: EXPECTED_DAILY_HASH,
    dailyBytes,
    expectedDailyBytes: EXPECTED_DAILY_BYTES,
    date: daily.date ?? null,
    raceCount: daily.raceCount ?? null,
    venueCount: dailyVenueCount,
    settledRaceCount: daily.settledRaceCount ?? null,
    cancelledRaceCount: daily.cancelledRaceCount ?? null,
    predictionLinkedRaceCount,
    reviewLinkedRaceCount,
    resultExistsCount,
    predictionExistsCount,
    duplicateRaceKeyCount,
    duplicateDateVenueRaceNumberCount,
    missingCoreFieldCounts,
    missingCoreFieldTotal,
    status: targetDailyPassed ? "PASS" : "FAIL",
  };

  const startersSourceExists = existsSync(abs(STARTERS_SOURCE_PATH));
  const entriesSnapshotExists = existsSync(abs(ENTRIES_SNAPSHOT_PATH));
  const sameDateBridgePossibleNow =
    startersSourceExists && entriesSnapshotExists;
  const starters = dailyItems.flatMap((item) => array(item.starters));
  const noStartersRaceCount =
    dailyItems.filter(
      (item) =>
        item.starterCount === 0
        && array(item.starters).length === 0,
    ).length;
  const startersEmptyRaceCount =
    dailyItems.filter((item) => array(item.starters).length === 0).length;
  const startersNonEmptyRaceCount =
    dailyItems.filter((item) => array(item.starters).length > 0).length;
  const starterTotalCount = starters.length;
  const qualityStarterParsedFalseCount =
    dailyItems.filter((item) => item.quality?.starterParsed === false).length;
  const noStartersMarkerCount =
    dailyItems.filter(
      (item) =>
        item.quality?.marker === "NO_STARTERS"
        && array(item.quality?.warnings).includes("NO_STARTERS"),
    ).length;
  const generatedStartersFound = startersNonEmptyRaceCount > 0;
  const generatedRegistrationNoFound =
    starters.some((starter) => Boolean(starter?.registrationNo));
  const generatedNameFound =
    starters.some((starter) => Boolean(starter?.name));
  const generatedCarNoFound =
    starters.some((starter) => starter?.carNo != null);
  const noStartersPassed =
    !startersSourceExists
    && !entriesSnapshotExists
    && !sameDateBridgePossibleNow
    && noStartersRaceCount === EXPECTED.dailyRaceCount
    && startersEmptyRaceCount === EXPECTED.dailyRaceCount
    && startersNonEmptyRaceCount === 0
    && starterTotalCount === 0
    && qualityStarterParsedFalseCount === EXPECTED.dailyRaceCount
    && noStartersMarkerCount === EXPECTED.dailyRaceCount
    && !generatedStartersFound
    && !generatedRegistrationNoFound
    && !generatedNameFound
    && !generatedCarNoFound;
  if (startersSourceExists) {
    increment(
      blockReasonCounts,
      "STARTERS_SOURCE_AVAILABLE_UNEXPECTEDLY",
    );
  }
  if (entriesSnapshotExists) {
    increment(
      blockReasonCounts,
      "ENTRIES_SNAPSHOT_AVAILABLE_UNEXPECTEDLY",
    );
  }
  if (generatedStartersFound) {
    increment(blockReasonCounts, "GENERATED_STARTERS_FOUND");
  }
  if (generatedRegistrationNoFound) {
    increment(blockReasonCounts, "GENERATED_REGISTRATION_NO_FOUND");
  }
  if (!noStartersPassed) {
    increment(blockReasonCounts, "NO_STARTERS_POLICY_MISMATCH");
  }
  const noStartersConsistencyCheck = {
    startersSourceExists,
    entriesSnapshotExists,
    sameDateBridgePossibleNow,
    noStartersRaceCount,
    startersEmptyRaceCount,
    startersNonEmptyRaceCount,
    starterTotalCount,
    qualityStarterParsedFalseCount,
    noStartersMarkerCount,
    generatedIdentity: false,
    generatedStartersFound,
    generatedRegistrationNoFound,
    generatedNameFound,
    generatedCarNoFound,
    status:
      noStartersPassed ? "PASS_NO_STARTERS_EXPECTED" : "FAIL",
  };

  const headIndex = readHeadIndex();
  const headItems = array(headIndex.items);
  const currentByDate =
    new Map(indexItems.map((item) => [item.date, item]));
  const existingEntryChangedUnexpectedlyPaths =
    headItems
      .filter(
        (item) =>
          !currentByDate.has(item.date)
          || !deepEqual(item, currentByDate.get(item.date)),
      )
      .map((item) => `items[${item.date}]`);
  const currentDates = new Set(indexItems.map((item) => item.date));
  const removedEntryCount =
    headItems.filter((item) => !currentDates.has(item.date)).length;
  const entry20260629 =
    indexItems.filter((item) => item.date === "2026-06-29");
  const headEntry20260629 =
    headItems.find((item) => item.date === "2026-06-29") ?? null;
  const entry20260629Unchanged =
    entry20260629.length === 1
    && deepEqual(entry20260629[0], headEntry20260629)
    && entry20260629[0].file === EXPECTED_20260629.path
    && entry20260629[0].bytes === EXPECTED_20260629.bytes
    && entry20260629[0].raceCount === EXPECTED_20260629.raceCount;
  const crossDatePassed =
    indexLatest?.date === EXPECTED.latestDate
    && indexLatest?.file === EXPECTED.latestPath
    && entry20260629Unchanged
    && existingEntryChangedUnexpectedlyPaths.length === 0
    && removedEntryCount === 0;
  if (!entry20260629Unchanged) {
    increment(blockReasonCounts, "ENTRY_2026_06_29_CHANGED");
  }
  if (
    indexLatest?.date !== EXPECTED.latestDate
    || indexLatest?.file !== EXPECTED.latestPath
  ) {
    increment(
      blockReasonCounts,
      "LATEST_POINTER_CHANGED_UNEXPECTEDLY",
    );
  }
  if (existingEntryChangedUnexpectedlyPaths.length) {
    increment(blockReasonCounts, "EXISTING_ENTRY_CHANGED_UNEXPECTEDLY");
  }
  if (removedEntryCount) {
    increment(blockReasonCounts, "EXISTING_ENTRY_REMOVED_UNEXPECTEDLY");
  }
  const crossDateInvariantCheck = {
    latestDate: indexLatest?.date ?? null,
    latestPath: indexLatest?.file ?? null,
    entry20260629ExistsExactlyOnce: entry20260629.length === 1,
    entry20260629Path: entry20260629[0]?.file ?? null,
    entry20260629Bytes: entry20260629[0]?.bytes ?? null,
    entry20260629RaceCount: entry20260629[0]?.raceCount ?? null,
    entry20260629Unchanged,
    existingEntryChangedUnexpectedlyCount:
      existingEntryChangedUnexpectedlyPaths.length,
    existingEntryChangedUnexpectedlyPaths,
    removedEntryCount,
    status: crossDatePassed ? "PASS" : "FAIL",
  };

  const modificationGuard = protectedModificationGuard();
  if (modificationGuard.indexModified) {
    increment(blockReasonCounts, "INDEX_MODIFIED");
  }
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
  const immutabilityPassed = modificationGuard.guardStatus === "pass";
  const immutabilityCheck = {
    publicAnalyticsIndexModified: modificationGuard.indexModified,
    publicAnalyticsDailyModified:
      modificationGuard.historyDailyModified,
    analyticsSourceModified: modificationGuard.analyticsSourceModified,
    publicRacesModified: modificationGuard.publicRacesModified,
    publicReviewsTouchedByThisStep:
      modificationGuard.publicReviewsTouchedByThisStep,
    privateInputModified: modificationGuard.privateInputModified,
    srcModified: modificationGuard.srcModified,
    packageModified: modificationGuard.packageModified,
    docsModified: modificationGuard.docsModified,
    existingScriptModified: modificationGuard.existingScriptModified,
    status: immutabilityPassed ? "PASS" : "FAIL",
  };

  const noFakeNoGeneratedIdentityCheck = {
    fakeCompletionPerformed: false,
    fuzzyMatchingPerformed: false,
    predictionUsedAsResultSource: false,
    reviewUsedAsResultSourceUnsafely: false,
    predictionUsedAsStarterSource: false,
    resultUsedAsStarterSource: false,
    lineupUsedAsStarterSource: false,
    entriesUsedAsGeneratedStarterSource: false,
    generatedStartersFound,
    generatedRegistrationNoFound,
    generatedNameFound,
    generatedCarNoFound,
    status:
      !generatedStartersFound
      && !generatedRegistrationNoFound
      && !generatedNameFound
      && !generatedCarNoFound
        ? "PASS"
        : "FAIL",
  };

  const canProceedToUiApiSmoke =
    indexConsistencyPassed
    && targetDateIndexEntryPassed
    && targetDailyPassed
    && noStartersPassed
    && crossDatePassed
    && immutabilityPassed
    && noFakeNoGeneratedIdentityCheck.status === "PASS";
  let finalStatus =
    canProceedToUiApiSmoke
      ? "FINAL_CONSISTENCY_PASS_2026_06_25_NO_STARTERS"
      : "BLOCKED";
  if (!indexConsistencyPassed || !targetDateIndexEntryPassed) {
    finalStatus = "NEEDS_INDEX_REVIEW";
  } else if (!targetDailyPassed) finalStatus = "NEEDS_DAILY_REVIEW";
  else if (!noStartersPassed) finalStatus = "NEEDS_NO_STARTERS_REVIEW";
  else if (!crossDatePassed) finalStatus = "NEEDS_CROSS_DATE_REVIEW";
  if (!immutabilityPassed) finalStatus = "BLOCKED";
  const finalConsistencyReadiness = {
    targetDate: TARGET_DATE,
    indexConsistencyStatus: indexConsistencyCheck.status,
    targetDateIndexEntryStatus: targetDateIndexEntryCheck.status,
    targetDailyConsistencyStatus: targetDailyConsistencyCheck.status,
    noStartersConsistencyStatus: noStartersConsistencyCheck.status,
    crossDateInvariantStatus: crossDateInvariantCheck.status,
    immutabilityStatus: immutabilityCheck.status,
    noFakeNoGeneratedIdentityStatus:
      noFakeNoGeneratedIdentityCheck.status,
    protectedModificationGuardStatus: modificationGuard.guardStatus,
    canProceedToUiApiSmoke,
    canProceedToSameDateBridgeNow: sameDateBridgePossibleNow,
    finalStatus,
  };
  const normalizedBlockReasons = normalizeBlockReasons(blockReasonCounts);
  const summary = {
    targetDate: TARGET_DATE,
    finalStatus,
    canProceedToUiApiSmoke,
    canProceedToSameDateBridgeNow: sameDateBridgePossibleNow,
    indexHash,
    indexBytes,
    sourceCount,
    dayCount,
    raceCount,
    totalBytes,
    itemBytesSum,
    latestDate: indexLatest?.date ?? null,
    latestPath: indexLatest?.file ?? null,
    targetDateEntryPath: targetEntry?.file ?? null,
    targetDateEntryBytes: targetEntry?.bytes ?? null,
    targetDateEntryRaceCount: targetEntry?.raceCount ?? null,
    dailyHash,
    dailyBytes,
    dailyRaceCount: daily.raceCount ?? null,
    dailyVenueCount,
    settledRaceCount: daily.settledRaceCount ?? null,
    cancelledRaceCount: daily.cancelledRaceCount ?? null,
    predictionLinkedRaceCount,
    reviewLinkedRaceCount,
    noStartersRaceCount,
    startersEmptyRaceCount,
    startersNonEmptyRaceCount,
    starterTotalCount,
    qualityStarterParsedFalseCount,
    noStartersMarkerCount,
    entry20260629Unchanged,
    duplicateDateCount,
    duplicatePathCount,
    writePerformed: false,
    indexModified: modificationGuard.indexModified,
    historyDailyModified: modificationGuard.historyDailyModified,
    analyticsSourceModified: modificationGuard.analyticsSourceModified,
    publicRacesModified: modificationGuard.publicRacesModified,
    publicReviewsTouchedByThisStep:
      modificationGuard.publicReviewsTouchedByThisStep,
    privateInputModified: modificationGuard.privateInputModified,
    srcModified: modificationGuard.srcModified,
    packageModified: modificationGuard.packageModified,
    docsModified: modificationGuard.docsModified,
    existingScriptModified: modificationGuard.existingScriptModified,
    fakeCompletionPerformed: false,
    fuzzyMatchingPerformed: false,
    generatedRegistrationNoFound,
    blockReasonCounts: normalizedBlockReasons,
  };
  return {
    summary,
    indexConsistencyCheck,
    targetDateIndexEntryCheck,
    targetDailyConsistencyCheck,
    noStartersConsistencyCheck,
    crossDateInvariantCheck,
    immutabilityCheck,
    noFakeNoGeneratedIdentityCheck,
    protectedModificationGuard: modificationGuard,
    finalConsistencyReadiness,
    nextActionPlan: nextActionPlan(finalStatus),
    jsonSummary: {
      ...summary,
      blockReasonCounts: normalizedBlockReasons,
    },
  };
}

async function main() {
  const result = await auditFinalHistoryConsistency20260625();
  printSection("summary", result.summary);
  printSection("indexConsistencyCheck", result.indexConsistencyCheck);
  printSection(
    "targetDateIndexEntryCheck",
    result.targetDateIndexEntryCheck,
  );
  printSection(
    "targetDailyConsistencyCheck",
    result.targetDailyConsistencyCheck,
  );
  printSection(
    "noStartersConsistencyCheck",
    result.noStartersConsistencyCheck,
  );
  printSection("crossDateInvariantCheck", result.crossDateInvariantCheck);
  printSection("immutabilityCheck", result.immutabilityCheck);
  printSection(
    "noFakeNoGeneratedIdentityCheck",
    result.noFakeNoGeneratedIdentityCheck,
  );
  printSection(
    "protectedModificationGuard",
    result.protectedModificationGuard,
  );
  printSection(
    "finalConsistencyReadiness",
    result.finalConsistencyReadiness,
  );
  printSection("nextActionPlan", result.nextActionPlan);
  printSection("jsonSummary", result.jsonSummary);
  if (
    result.finalConsistencyReadiness.finalStatus
    !== "FINAL_CONSISTENCY_PASS_2026_06_25_NO_STARTERS"
  ) process.exitCode = 1;
}

const isMain =
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  main().catch((error) => {
    console.error(
      "[kurari-ex final history consistency 2026-06-25] failed",
    );
    console.error(error);
    process.exitCode = 1;
  });
}
