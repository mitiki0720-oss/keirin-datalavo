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
const INDEX_PUBLIC_PATH =
  "/data/analytics/kurari-ex/history/index.generated.json";
const DAILY_PATH =
  "public/data/analytics/kurari-ex/history/daily/2026-06/2026-06-25.generated.json";
const DAILY_PUBLIC_PATH =
  "/data/analytics/kurari-ex/history/daily/2026-06/2026-06-25.generated.json";
const STARTERS_SOURCE_PATH =
  "public/data/analytics/kurari-ex/source/starters/2026-06-25/today-registration-starters.generated.json";
const ENTRIES_SNAPSHOT_PATH =
  "public/data/races/entries-history/2026-06-25/keirin-jp-entries.generated.json";
const EXPECTED_INDEX = {
  hash:
    "sha256:5b9d2a00ebd5c62654ac769cc67609241c6fb37ace6f1194e7a2a8dab9b3eea2",
  bytes: 13127,
  sourceCount: 54,
  dayCount: 54,
  raceCount: 4072,
  totalBytes: 11209027,
  latestDate: "2026-06-29",
  latestPath:
    "/data/analytics/kurari-ex/history/daily/2026-06/2026-06-29.generated.json",
};
const EXPECTED_DAILY = {
  hash:
    "sha256:b348ef4fc981701199fbc4a1e3d4e90a6fc54ff9e80bb2f65fc93cbb4fc247da",
  bytes: 199655,
  raceCount: 75,
  venueCount: 8,
  settledRaceCount: 75,
  cancelledRaceCount: 0,
  predictionLinkedRaceCount: 75,
  reviewLinkedRaceCount: 75,
  noStartersRaceCount: 75,
  startersEmptyRaceCount: 75,
  startersNonEmptyRaceCount: 0,
  starterTotalCount: 0,
  qualityStarterParsedFalseCount: 75,
};
const SRC_FILES = [
  "src/lib/kurariExData.ts",
  "src/types/kurariEx.ts",
  "src/data/kurariExAnalysisInventory.ts",
  "src/pages/ExDataPage.tsx",
  "src/pages/PageImplementations.tsx",
];
const THIS_SCRIPT =
  "scripts/audit-kurari-ex-ui-api-consumption-smoke-2026-06-25.mjs";
const KNOWN_REVIEW_CHANGES = [
  "public/data/reviews/index.json",
  "public/data/reviews/2026-06-28/",
  "public/data/reviews/2026-06-29/",
  "public/data/reviews/2026-06-30/",
  "public/data/reviews/2026-07-01/",
];

const BLOCK_REASON_ORDER = [
  "PUBLIC_PATH_TARGET_DATE_MISSING",
  "PUBLIC_PATH_UNRESOLVED",
  "PUBLIC_PATH_FILE_MISSING",
  "HISTORY_INDEX_MISSING",
  "HISTORY_INDEX_PARSE_FAILED",
  "HISTORY_INDEX_HASH_MISMATCH",
  "HISTORY_INDEX_BYTES_MISMATCH",
  "HISTORY_INDEX_TOTAL_BYTES_MISMATCH",
  "HISTORY_INDEX_TARGET_BYTES_MISMATCH",
  "HISTORY_INDEX_TOTAL_BYTES_SUM_MISMATCH",
  "HISTORY_DAILY_MISSING",
  "HISTORY_DAILY_PARSE_FAILED",
  "HISTORY_DAILY_HASH_MISMATCH",
  "HISTORY_DAILY_BYTES_MISMATCH",
  "HISTORY_DAILY_RACE_COUNT_MISMATCH",
  "HISTORY_DAILY_RESULT_MISSING",
  "HISTORY_DAILY_PREDICTION_MISSING",
  "HISTORY_DAILY_QUALITY_MISSING",
  "NO_STARTERS_POLICY_MISMATCH",
  "NO_STARTERS_ARRAY_MISSING",
  "NO_STARTERS_GENERATED_IDENTITY_FOUND",
  "CONSUMER_SHAPE_REQUIRED_FIELD_MISSING",
  "CONSUMER_SHAPE_SRC_FILE_MISSING",
  "API_FETCH_SIMULATION_FAILED",
  "ENTRY_2026_06_29_CHANGED",
  "LATEST_POINTER_CHANGED_UNEXPECTEDLY",
  "FAKE_COMPLETION_FOUND",
  "FUZZY_MATCHING_FOUND",
  "PREDICTION_USED_AS_RESULT_SOURCE",
  "REVIEW_USED_AS_RESULT_SOURCE_UNSAFELY",
  "PREDICTION_USED_AS_STARTER_SOURCE",
  "RESULT_USED_AS_STARTER_SOURCE",
  "LINEUP_USED_AS_STARTER_SOURCE",
  "ENTRIES_USED_AS_GENERATED_STARTER_SOURCE",
  "GENERATED_STARTERS_FOUND",
  "GENERATED_REGISTRATION_NO_FOUND",
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

function rel(file) {
  return path.relative(ROOT, file).replaceAll("\\", "/");
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

function publicPathToFile(publicPath) {
  return String(publicPath ?? "").startsWith("/data/")
    ? path.resolve(ROOT, `public${publicPath}`)
    : null;
}

function deepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function readJsonStatus(file) {
  if (!existsSync(abs(file))) {
    return {
      exists: false,
      readable: false,
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
      readable: true,
      parseStatus: "ok",
      payload: JSON.parse(buffer.toString("utf8")),
      buffer,
      error: null,
    };
  } catch (error) {
    return {
      exists: true,
      readable: false,
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
    allowedFiles: ["別工程で明示された新規memo/auditのみ"],
    prohibitedFiles,
    readiness:
      index === 0
      && finalStatus
        === "UI_API_CONSUMPTION_SMOKE_PASS_2026_06_25_NO_STARTERS"
        ? "ready"
        : "future",
    notes: "このsmokeではデータ・src・既存scriptを書き換えない。",
  }));
}

function printSection(label, value) {
  console.log(`[${label}]`);
  console.log(JSON.stringify(value, null, 2));
}

export async function auditUiApiConsumptionSmoke20260625() {
  const blockReasonCounts = {};
  const targetConfig = {
    targetDate: TARGET_DATE,
    indexPath: INDEX_PATH,
    dailyPath: DAILY_PATH,
    publicPath: DAILY_PUBLIC_PATH,
    expectedIndex: EXPECTED_INDEX,
    expectedDaily: EXPECTED_DAILY,
    writePerformed: false,
  };
  const [indexRead, dailyRead] = await Promise.all([
    readJsonStatus(INDEX_PATH),
    readJsonStatus(DAILY_PATH),
  ]);
  const index = indexRead.payload ?? {};
  const indexItems = array(index.items);
  const latest = latestItem(indexItems);
  const targetEntries =
    indexItems.filter((item) => item?.date === TARGET_DATE);
  const targetEntry = targetEntries[0] ?? null;
  const resolvedFilesystemPath =
    targetEntry ? publicPathToFile(targetEntry.file) : null;
  const expectedResolvedFilesystemPath = abs(DAILY_PATH);
  const duplicateDateCount =
    countDuplicates(indexItems.map((item) => item?.date).filter(Boolean));
  const duplicatePathCount =
    countDuplicates(indexItems.map((item) => item?.file).filter(Boolean));
  const publicPathResolutionCheck = {
    indexExists: indexRead.exists,
    indexParseStatus: indexRead.parseStatus,
    targetDate: TARGET_DATE,
    targetDateEntryExists: targetEntries.length === 1,
    targetDateEntryCount: targetEntries.length,
    targetDatePublicPath: targetEntry?.file ?? null,
    expectedTargetDatePublicPath: DAILY_PUBLIC_PATH,
    publicPathMatched: targetEntry?.file === DAILY_PUBLIC_PATH,
    resolvedFilesystemPath,
    expectedResolvedFilesystemPath,
    resolvedFilesystemPathMatched:
      resolvedFilesystemPath === expectedResolvedFilesystemPath,
    resolvedFileExists:
      Boolean(resolvedFilesystemPath && existsSync(resolvedFilesystemPath)),
    latestDate: latest?.date ?? null,
    latestPath: latest?.file ?? null,
    latestStill20260629:
      latest?.date === EXPECTED_INDEX.latestDate
      && latest?.file === EXPECTED_INDEX.latestPath,
    targetDateSelectableFromIndex:
      Boolean(targetEntry?.date === TARGET_DATE && targetEntry?.file),
    duplicateDateCount,
    duplicatePathCount,
  };
  publicPathResolutionCheck.pathResolutionStatus =
    indexRead.parseStatus === "ok"
    && publicPathResolutionCheck.targetDateEntryExists
    && publicPathResolutionCheck.publicPathMatched
    && publicPathResolutionCheck.resolvedFilesystemPathMatched
    && publicPathResolutionCheck.resolvedFileExists
    && publicPathResolutionCheck.latestStill20260629
    && publicPathResolutionCheck.targetDateSelectableFromIndex
    && duplicateDateCount === 0
    && duplicatePathCount === 0
      ? "OK"
      : "FAIL";
  if (!targetEntries.length) {
    increment(blockReasonCounts, "PUBLIC_PATH_TARGET_DATE_MISSING");
  }
  if (!publicPathResolutionCheck.resolvedFilesystemPathMatched) {
    increment(blockReasonCounts, "PUBLIC_PATH_UNRESOLVED");
  }
  if (!publicPathResolutionCheck.resolvedFileExists) {
    increment(blockReasonCounts, "PUBLIC_PATH_FILE_MISSING");
  }

  const indexHash = indexRead.payload ? hashStableIndex(index) : null;
  const indexBytes = indexRead.buffer?.length ?? null;
  const sourceCount = indexItems.length;
  const itemBytesSum =
    indexItems.reduce((sum, item) => sum + (Number(item.bytes) || 0), 0);
  const historyIndexConsumptionCheck = {
    indexHash,
    expectedIndexHash: EXPECTED_INDEX.hash,
    indexHashMatched: indexHash === EXPECTED_INDEX.hash,
    indexBytes,
    expectedIndexBytes: EXPECTED_INDEX.bytes,
    indexBytesMatched: indexBytes === EXPECTED_INDEX.bytes,
    sourceCount,
    dayCount: index.dayCount ?? null,
    raceCount: index.raceCount ?? null,
    totalBytes: index.totalBytes ?? null,
    itemBytesSum,
    totalBytesMatchedItemBytesSum: index.totalBytes === itemBytesSum,
    latestDate: latest?.date ?? null,
    latestPath: latest?.file ?? null,
    targetDateEntryPath: targetEntry?.file ?? null,
    targetDateEntryBytes: targetEntry?.bytes ?? null,
    targetDateEntryRaceCount: targetEntry?.raceCount ?? null,
    indexHasUsableDateList:
      indexItems.length > 0
      && indexItems.every((item) => item?.date && item?.file),
    indexHasUsableLatestPointer:
      Boolean(latest?.date && latest?.file),
    indexHasUsableTargetPointer:
      Boolean(
        targetEntry?.file === DAILY_PUBLIC_PATH
        && targetEntry?.bytes === EXPECTED_DAILY.bytes
        && targetEntry?.raceCount === EXPECTED_DAILY.raceCount,
      ),
  };
  historyIndexConsumptionCheck.indexConsumptionStatus =
    historyIndexConsumptionCheck.indexHashMatched
    && historyIndexConsumptionCheck.indexBytesMatched
    && sourceCount === EXPECTED_INDEX.sourceCount
    && index.dayCount === EXPECTED_INDEX.dayCount
    && index.raceCount === EXPECTED_INDEX.raceCount
    && index.totalBytes === EXPECTED_INDEX.totalBytes
    && historyIndexConsumptionCheck.totalBytesMatchedItemBytesSum
    && latest?.date === EXPECTED_INDEX.latestDate
    && latest?.file === EXPECTED_INDEX.latestPath
    && historyIndexConsumptionCheck.indexHasUsableDateList
    && historyIndexConsumptionCheck.indexHasUsableLatestPointer
    && historyIndexConsumptionCheck.indexHasUsableTargetPointer
      ? "OK"
      : "FAIL";
  if (!indexRead.exists) increment(blockReasonCounts, "HISTORY_INDEX_MISSING");
  else if (indexRead.parseStatus !== "ok") {
    increment(blockReasonCounts, "HISTORY_INDEX_PARSE_FAILED");
  }
  if (!historyIndexConsumptionCheck.indexHashMatched) {
    increment(blockReasonCounts, "HISTORY_INDEX_HASH_MISMATCH");
  }
  if (!historyIndexConsumptionCheck.indexBytesMatched) {
    increment(blockReasonCounts, "HISTORY_INDEX_BYTES_MISMATCH");
  }
  if (index.totalBytes !== EXPECTED_INDEX.totalBytes) {
    increment(blockReasonCounts, "HISTORY_INDEX_TOTAL_BYTES_MISMATCH");
  }
  if (targetEntry?.bytes !== EXPECTED_DAILY.bytes) {
    increment(blockReasonCounts, "HISTORY_INDEX_TARGET_BYTES_MISMATCH");
  }
  if (!historyIndexConsumptionCheck.totalBytesMatchedItemBytesSum) {
    increment(
      blockReasonCounts,
      "HISTORY_INDEX_TOTAL_BYTES_SUM_MISMATCH",
    );
  }

  const daily = dailyRead.payload ?? {};
  const dailyItems = array(daily.items);
  const dailyHash = dailyRead.payload ? hashPayload(daily) : null;
  const dailyBytes = dailyRead.buffer?.length ?? null;
  const dailyVenueCount =
    new Set(dailyItems.map((item) => item.venueKey)).size;
  const resultExistsCount =
    dailyItems.filter(
      (item) => Boolean(item.result?.trifecta?.combination),
    ).length;
  const predictionExistsCount =
    dailyItems.filter((item) => Boolean(item.prediction)).length;
  const reviewLinkedRaceCount =
    dailyItems.filter(
      (item) => item.reviewEnrichment?.status === "matched",
    ).length;
  const predictionLinkedRaceCount =
    dailyItems.filter(
      (item) => item.predictionEnrichment?.status === "matched",
    ).length;
  const missingDateCount = dailyItems.filter((item) => !item.date).length;
  const missingVenueKeyCount =
    dailyItems.filter((item) => !item.venueKey).length;
  const missingVenueNameCount =
    dailyItems.filter((item) => !item.venueName).length;
  const missingRaceNumberCount =
    dailyItems.filter((item) => !item.raceNumber).length;
  const missingRaceKeyCount =
    dailyItems.filter((item) => !item.raceKey).length;
  const missingResultCount =
    dailyItems.filter((item) => !item.result).length;
  const missingPredictionCount =
    dailyItems.filter((item) => !item.prediction).length;
  const missingQualityCount =
    dailyItems.filter((item) => !item.quality).length;
  const duplicateRaceKeyCount =
    countDuplicates(dailyItems.map((item) => item.raceKey));
  const duplicateDateVenueRaceNumberCount =
    countDuplicates(
      dailyItems.map(
        (item) => `${item.date}:${item.venueKey}:${item.raceNumber}`,
      ),
    );
  const dailyPayloadConsumptionCheck = {
    dailyExists: dailyRead.exists,
    dailyParseStatus: dailyRead.parseStatus,
    dailyHash,
    expectedDailyHash: EXPECTED_DAILY.hash,
    dailyHashMatched: dailyHash === EXPECTED_DAILY.hash,
    dailyBytes,
    expectedDailyBytes: EXPECTED_DAILY.bytes,
    dailyBytesMatched: dailyBytes === EXPECTED_DAILY.bytes,
    dailyDate: daily.date ?? null,
    expectedDailyDate: TARGET_DATE,
    dailyDateMatched: daily.date === TARGET_DATE,
    raceCount: daily.raceCount ?? null,
    expectedRaceCount: EXPECTED_DAILY.raceCount,
    raceCountMatched: daily.raceCount === EXPECTED_DAILY.raceCount,
    venueCount: dailyVenueCount,
    expectedVenueCount: EXPECTED_DAILY.venueCount,
    venueCountMatched: dailyVenueCount === EXPECTED_DAILY.venueCount,
    settledRaceCount: daily.settledRaceCount ?? null,
    cancelledRaceCount: daily.cancelledRaceCount ?? null,
    resultExistsCount,
    predictionExistsCount,
    reviewLinkedRaceCount,
    missingDateCount,
    missingVenueKeyCount,
    missingVenueNameCount,
    missingRaceNumberCount,
    missingRaceKeyCount,
    missingResultCount,
    missingPredictionCount,
    missingQualityCount,
    duplicateRaceKeyCount,
    duplicateDateVenueRaceNumberCount,
  };
  dailyPayloadConsumptionCheck.dailyPayloadConsumptionStatus =
    dailyRead.parseStatus === "ok"
    && dailyPayloadConsumptionCheck.dailyHashMatched
    && dailyPayloadConsumptionCheck.dailyBytesMatched
    && dailyPayloadConsumptionCheck.dailyDateMatched
    && dailyPayloadConsumptionCheck.raceCountMatched
    && dailyPayloadConsumptionCheck.venueCountMatched
    && daily.settledRaceCount === EXPECTED_DAILY.settledRaceCount
    && daily.cancelledRaceCount === EXPECTED_DAILY.cancelledRaceCount
    && resultExistsCount === EXPECTED_DAILY.raceCount
    && predictionExistsCount === EXPECTED_DAILY.raceCount
    && reviewLinkedRaceCount === EXPECTED_DAILY.reviewLinkedRaceCount
    && [
      missingDateCount,
      missingVenueKeyCount,
      missingVenueNameCount,
      missingRaceNumberCount,
      missingRaceKeyCount,
      missingResultCount,
      missingPredictionCount,
      missingQualityCount,
      duplicateRaceKeyCount,
      duplicateDateVenueRaceNumberCount,
    ].every((count) => count === 0)
      ? "OK"
      : dailyRead.parseStatus === "ok" ? "PARTIAL" : "FAIL";
  if (!dailyRead.exists) increment(blockReasonCounts, "HISTORY_DAILY_MISSING");
  else if (dailyRead.parseStatus !== "ok") {
    increment(blockReasonCounts, "HISTORY_DAILY_PARSE_FAILED");
  }
  if (!dailyPayloadConsumptionCheck.dailyHashMatched) {
    increment(blockReasonCounts, "HISTORY_DAILY_HASH_MISMATCH");
  }
  if (!dailyPayloadConsumptionCheck.dailyBytesMatched) {
    increment(blockReasonCounts, "HISTORY_DAILY_BYTES_MISMATCH");
  }
  if (!dailyPayloadConsumptionCheck.raceCountMatched) {
    increment(blockReasonCounts, "HISTORY_DAILY_RACE_COUNT_MISMATCH");
  }
  if (missingResultCount) {
    increment(
      blockReasonCounts,
      "HISTORY_DAILY_RESULT_MISSING",
      missingResultCount,
    );
  }
  if (missingPredictionCount) {
    increment(
      blockReasonCounts,
      "HISTORY_DAILY_PREDICTION_MISSING",
      missingPredictionCount,
    );
  }
  if (missingQualityCount) {
    increment(
      blockReasonCounts,
      "HISTORY_DAILY_QUALITY_MISSING",
      missingQualityCount,
    );
  }

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
  const allRaceStartersArraysPresent =
    dailyItems.every((item) => Array.isArray(item.starters));
  const allRaceStartersArraysEmpty =
    dailyItems.every((item) => array(item.starters).length === 0);
  const generatedStartersFound = startersNonEmptyRaceCount > 0;
  const generatedRegistrationNoFound =
    starters.some((starter) => Boolean(starter?.registrationNo));
  const generatedNameFound =
    starters.some((starter) => Boolean(starter?.name));
  const generatedCarNoFound =
    starters.some((starter) => starter?.carNo != null);
  const noStartersUiApiConsumptionCheck = {
    startersSourceExists,
    entriesSnapshotExists,
    sameDateBridgePossibleNow,
    noStartersRaceCount,
    expectedNoStartersRaceCount: EXPECTED_DAILY.noStartersRaceCount,
    startersEmptyRaceCount,
    expectedStartersEmptyRaceCount: EXPECTED_DAILY.startersEmptyRaceCount,
    startersNonEmptyRaceCount,
    expectedStartersNonEmptyRaceCount:
      EXPECTED_DAILY.startersNonEmptyRaceCount,
    starterTotalCount,
    expectedStarterTotalCount: EXPECTED_DAILY.starterTotalCount,
    qualityStarterParsedFalseCount,
    expectedQualityStarterParsedFalseCount:
      EXPECTED_DAILY.qualityStarterParsedFalseCount,
    noStartersMarkerCount,
    noStartersMarkerCountMatchedRaceCount:
      noStartersMarkerCount === EXPECTED_DAILY.raceCount,
    allRaceStartersArraysPresent,
    allRaceStartersArraysEmpty,
    starterDisplayShouldBeUnavailable: allRaceStartersArraysEmpty,
    resultDisplayShouldBeAvailable:
      resultExistsCount === EXPECTED_DAILY.raceCount,
    predictionDisplayShouldBeAvailable:
      predictionExistsCount === EXPECTED_DAILY.raceCount,
    reviewDisplayShouldBeAvailable:
      reviewLinkedRaceCount === EXPECTED_DAILY.raceCount,
  };
  noStartersUiApiConsumptionCheck.noStartersUiApiConsumptionStatus =
    !startersSourceExists
    && !entriesSnapshotExists
    && !sameDateBridgePossibleNow
    && noStartersRaceCount === EXPECTED_DAILY.raceCount
    && startersEmptyRaceCount === EXPECTED_DAILY.raceCount
    && startersNonEmptyRaceCount === 0
    && starterTotalCount === 0
    && qualityStarterParsedFalseCount === EXPECTED_DAILY.raceCount
    && noStartersMarkerCount === EXPECTED_DAILY.raceCount
    && allRaceStartersArraysPresent
    && allRaceStartersArraysEmpty
    && noStartersUiApiConsumptionCheck.resultDisplayShouldBeAvailable
    && noStartersUiApiConsumptionCheck.predictionDisplayShouldBeAvailable
    && noStartersUiApiConsumptionCheck.reviewDisplayShouldBeAvailable
      ? "OK_NO_STARTERS_EXPECTED"
      : "FAIL";
  if (
    noStartersUiApiConsumptionCheck.noStartersUiApiConsumptionStatus
    !== "OK_NO_STARTERS_EXPECTED"
  ) increment(blockReasonCounts, "NO_STARTERS_POLICY_MISMATCH");
  if (!allRaceStartersArraysPresent) {
    increment(blockReasonCounts, "NO_STARTERS_ARRAY_MISSING");
  }
  if (
    generatedStartersFound
    || generatedRegistrationNoFound
    || generatedNameFound
    || generatedCarNoFound
  ) increment(blockReasonCounts, "NO_STARTERS_GENERATED_IDENTITY_FOUND");

  const srcReads = await Promise.all(
    SRC_FILES.map(async (file) => {
      if (!existsSync(abs(file))) return { file, exists: false, text: "" };
      return {
        file,
        exists: true,
        text: await readFile(abs(file), "utf8"),
      };
    }),
  );
  const missingSrcFiles =
    srcReads.filter((item) => !item.exists).map((item) => item.file);
  const combinedSrcText = srcReads.map((item) => item.text).join("\n");
  const sampleRace = dailyItems[0] ?? {};
  const sampleResult = sampleRace.result ?? {};
  const samplePrediction = sampleRace.prediction ?? {};
  const sampleQuality = sampleRace.quality ?? {};
  const requiredTopLevelKeys = [
    "schemaVersion",
    "date",
    "raceCount",
    "settledRaceCount",
    "cancelledRaceCount",
    "predictionCoverage",
    "items",
  ];
  const requiredRaceItemKeys = [
    "raceKey",
    "date",
    "venueKey",
    "venueName",
    "raceNumber",
    "result",
    "prediction",
    "reviewEnrichment",
    "starters",
    "quality",
  ];
  const requiredResultKeys = [
    "status",
    "first",
    "second",
    "third",
    "trifecta",
    "exacta",
  ];
  const requiredPredictionKeys = ["trifectaTickets", "exactaTickets"];
  const requiredQualityKeys = [
    "resultParsed",
    "predictionParsed",
    "lineupParsed",
    "starterParsed",
    "marker",
    "warnings",
  ];
  const unknownCriticalMissingFields = [
    ...requiredTopLevelKeys
      .filter((key) => !Object.hasOwn(daily, key))
      .map((key) => `daily.${key}`),
    ...requiredRaceItemKeys
      .filter((key) => !Object.hasOwn(sampleRace, key))
      .map((key) => `item.${key}`),
    ...requiredResultKeys
      .filter((key) => !Object.hasOwn(sampleResult, key))
      .map((key) => `result.${key}`),
    ...requiredPredictionKeys
      .filter((key) => !Object.hasOwn(samplePrediction, key))
      .map((key) => `prediction.${key}`),
    ...requiredQualityKeys
      .filter((key) => !Object.hasOwn(sampleQuality, key))
      .map((key) => `quality.${key}`),
  ];
  const knownHistoryIndexConsumerFound =
    /history\/index\.generated|history index/iu.test(combinedSrcText);
  const knownHistoryDailyConsumerFound =
    /history\/daily|history items/iu.test(combinedSrcText);
  const warnings = [];
  if (!knownHistoryIndexConsumerFound) {
    warnings.push(
      "direct history index runtime consumer was not found in inspected src; public path and payload shape were validated independently",
    );
  }
  if (!knownHistoryDailyConsumerFound) {
    warnings.push(
      "direct history daily runtime consumer was not found in inspected src; local fetch simulation was used",
    );
  }
  warnings.push(
    "NO_STARTERS is treated as an explicit unavailable display state; no identity fields are synthesized",
  );
  const requiredShapesPresent =
    requiredTopLevelKeys.every((key) => Object.hasOwn(daily, key))
    && requiredRaceItemKeys.every((key) => Object.hasOwn(sampleRace, key))
    && requiredResultKeys.every((key) => Object.hasOwn(sampleResult, key))
    && requiredPredictionKeys.every(
      (key) => Object.hasOwn(samplePrediction, key),
    )
    && requiredQualityKeys.every((key) => Object.hasOwn(sampleQuality, key));
  const consumerShapeCompatibilityCheck = {
    inspectedSrcFiles: SRC_FILES,
    missingSrcFiles,
    knownHistoryIndexConsumerFound,
    knownHistoryDailyConsumerFound,
    knownTypesFound:
      /KurariEx|raceNumber|venueName|registrationNo/u.test(combinedSrcText),
    dailyTopLevelKeys: Object.keys(daily),
    raceItemSampleKeys: Object.keys(sampleRace),
    qualitySampleKeys: Object.keys(sampleQuality),
    resultSampleKeys: Object.keys(sampleResult),
    predictionSampleKeys: Object.keys(samplePrediction),
    startersSampleShape: "empty-array",
    requiredTopLevelKeysPresent:
      requiredTopLevelKeys.every((key) => Object.hasOwn(daily, key)),
    requiredRaceItemKeysPresent:
      requiredRaceItemKeys.every((key) => Object.hasOwn(sampleRace, key)),
    requiredResultKeysPresent:
      requiredResultKeys.every((key) => Object.hasOwn(sampleResult, key)),
    requiredPredictionKeysPresent:
      requiredPredictionKeys.every(
        (key) => Object.hasOwn(samplePrediction, key),
      ),
    requiredQualityKeysPresent:
      requiredQualityKeys.every((key) => Object.hasOwn(sampleQuality, key)),
    startersArrayPresent: allRaceStartersArraysPresent,
    startersArrayEmptyAccepted:
      allRaceStartersArraysEmpty
      && noStartersMarkerCount === EXPECTED_DAILY.raceCount,
    noStartersMarkerPresent:
      noStartersMarkerCount === EXPECTED_DAILY.raceCount,
    displayDateAvailable: dailyItems.every((item) => Boolean(item.date)),
    displayVenueAvailable: dailyItems.every((item) => Boolean(item.venueName)),
    displayRaceNumberAvailable:
      dailyItems.every((item) => Number(item.raceNumber) > 0),
    displayResultAvailable:
      resultExistsCount === EXPECTED_DAILY.raceCount,
    displayPredictionAvailable:
      predictionExistsCount === EXPECTED_DAILY.raceCount,
    displayReviewAvailable:
      reviewLinkedRaceCount === EXPECTED_DAILY.raceCount,
    displayStartersUnavailableButSafe:
      allRaceStartersArraysEmpty
      && noStartersMarkerCount === EXPECTED_DAILY.raceCount,
    unknownCriticalMissingFields,
    warnings,
  };
  consumerShapeCompatibilityCheck.compatibilityStatus =
    missingSrcFiles.length === 0
    && consumerShapeCompatibilityCheck.knownTypesFound
    && requiredShapesPresent
    && consumerShapeCompatibilityCheck.startersArrayPresent
    && consumerShapeCompatibilityCheck.startersArrayEmptyAccepted
    && consumerShapeCompatibilityCheck.displayDateAvailable
    && consumerShapeCompatibilityCheck.displayVenueAvailable
    && consumerShapeCompatibilityCheck.displayRaceNumberAvailable
    && consumerShapeCompatibilityCheck.displayResultAvailable
    && consumerShapeCompatibilityCheck.displayPredictionAvailable
    && consumerShapeCompatibilityCheck.displayReviewAvailable
    && consumerShapeCompatibilityCheck.displayStartersUnavailableButSafe
    && unknownCriticalMissingFields.length === 0
      ? warnings.length ? "OK_WITH_WARNINGS" : "OK"
      : missingSrcFiles.length < SRC_FILES.length ? "PARTIAL" : "FAIL";
  if (missingSrcFiles.length) {
    increment(
      blockReasonCounts,
      "CONSUMER_SHAPE_SRC_FILE_MISSING",
      missingSrcFiles.length,
    );
  }
  if (unknownCriticalMissingFields.length) {
    increment(
      blockReasonCounts,
      "CONSUMER_SHAPE_REQUIRED_FIELD_MISSING",
      unknownCriticalMissingFields.length,
    );
  }

  const simulatedIndexFile = publicPathToFile(INDEX_PUBLIC_PATH);
  const simulatedTargetDailyFile = publicPathToFile(DAILY_PUBLIC_PATH);
  const apiFetchSimulationCheck = {
    simulatedIndexUrl: INDEX_PUBLIC_PATH,
    simulatedTargetDailyUrl: DAILY_PUBLIC_PATH,
    indexUrlResolvedToFile: simulatedIndexFile,
    targetDailyUrlResolvedToFile: simulatedTargetDailyFile,
    indexFileReadable:
      Boolean(simulatedIndexFile && existsSync(simulatedIndexFile)),
    targetDailyFileReadable:
      Boolean(
        simulatedTargetDailyFile && existsSync(simulatedTargetDailyFile),
      ),
    indexJsonParseOk: indexRead.parseStatus === "ok",
    targetDailyJsonParseOk: dailyRead.parseStatus === "ok",
  };
  apiFetchSimulationCheck.fetchSimulationStatus =
    apiFetchSimulationCheck.indexUrlResolvedToFile
    && apiFetchSimulationCheck.targetDailyUrlResolvedToFile
    && apiFetchSimulationCheck.indexFileReadable
    && apiFetchSimulationCheck.targetDailyFileReadable
    && apiFetchSimulationCheck.indexJsonParseOk
    && apiFetchSimulationCheck.targetDailyJsonParseOk
      ? "OK"
      : "FAIL";
  if (apiFetchSimulationCheck.fetchSimulationStatus !== "OK") {
    increment(blockReasonCounts, "API_FETCH_SIMULATION_FAILED");
  }

  const entry20260629 =
    indexItems.filter((item) => item.date === "2026-06-29");
  const headIndex = readHeadIndex();
  const headEntry20260629 =
    array(headIndex.items).find((item) => item.date === "2026-06-29") ?? null;
  const entry20260629File =
    entry20260629[0] ? publicPathToFile(entry20260629[0].file) : null;
  const entry20260629Unchanged =
    entry20260629.length === 1
    && deepEqual(entry20260629[0], headEntry20260629)
    && entry20260629[0].file === EXPECTED_INDEX.latestPath
    && entry20260629[0].bytes === 441362
    && entry20260629[0].raceCount === 64;
  const crossDateInvariantCheck = {
    latestDate: latest?.date ?? null,
    latestPath: latest?.file ?? null,
    latestStill20260629:
      latest?.date === EXPECTED_INDEX.latestDate
      && latest?.file === EXPECTED_INDEX.latestPath,
    entry20260629Exists: entry20260629.length === 1,
    entry20260629Path: entry20260629[0]?.file ?? null,
    entry20260629Bytes: entry20260629[0]?.bytes ?? null,
    expectedEntry20260629Bytes: 441362,
    entry20260629RaceCount: entry20260629[0]?.raceCount ?? null,
    expectedEntry20260629RaceCount: 64,
    entry20260629DailyFileExists:
      Boolean(entry20260629File && existsSync(entry20260629File)),
    entry20260629Unchanged,
  };
  crossDateInvariantCheck.crossDateInvariantStatus =
    crossDateInvariantCheck.latestStill20260629
    && crossDateInvariantCheck.entry20260629Exists
    && crossDateInvariantCheck.entry20260629DailyFileExists
    && entry20260629Unchanged
      ? "OK"
      : "FAIL";
  if (!entry20260629Unchanged) {
    increment(blockReasonCounts, "ENTRY_2026_06_29_CHANGED");
  }
  if (!crossDateInvariantCheck.latestStill20260629) {
    increment(
      blockReasonCounts,
      "LATEST_POINTER_CHANGED_UNEXPECTEDLY",
    );
  }

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
    noFakeNoGeneratedIdentityStatus:
      !generatedStartersFound
      && !generatedRegistrationNoFound
      && !generatedNameFound
      && !generatedCarNoFound
        ? "OK"
        : "FAIL",
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

  const acceptableCompatibility = ["OK", "OK_WITH_WARNINGS"].includes(
    consumerShapeCompatibilityCheck.compatibilityStatus,
  );
  const canProceedToCompletionMemo =
    publicPathResolutionCheck.pathResolutionStatus === "OK"
    && historyIndexConsumptionCheck.indexConsumptionStatus === "OK"
    && dailyPayloadConsumptionCheck.dailyPayloadConsumptionStatus === "OK"
    && noStartersUiApiConsumptionCheck.noStartersUiApiConsumptionStatus
      === "OK_NO_STARTERS_EXPECTED"
    && acceptableCompatibility
    && apiFetchSimulationCheck.fetchSimulationStatus === "OK"
    && crossDateInvariantCheck.crossDateInvariantStatus === "OK"
    && noFakeNoGeneratedIdentityCheck.noFakeNoGeneratedIdentityStatus === "OK"
    && modificationGuard.guardStatus === "pass";
  let finalStatus =
    canProceedToCompletionMemo
      ? "UI_API_CONSUMPTION_SMOKE_PASS_2026_06_25_NO_STARTERS"
      : "BLOCKED";
  if (publicPathResolutionCheck.pathResolutionStatus !== "OK") {
    finalStatus = "NEEDS_PUBLIC_PATH_FIX";
  } else if (
    historyIndexConsumptionCheck.indexConsumptionStatus !== "OK"
  ) finalStatus = "NEEDS_INDEX_CONSUMPTION_FIX";
  else if (
    dailyPayloadConsumptionCheck.dailyPayloadConsumptionStatus !== "OK"
  ) finalStatus = "NEEDS_DAILY_PAYLOAD_FIX";
  else if (
    noStartersUiApiConsumptionCheck.noStartersUiApiConsumptionStatus
    !== "OK_NO_STARTERS_EXPECTED"
  ) finalStatus = "NEEDS_NO_STARTERS_CONSUMPTION_REVIEW";
  else if (!acceptableCompatibility) {
    finalStatus = "NEEDS_CONSUMER_SHAPE_REVIEW";
  } else if (apiFetchSimulationCheck.fetchSimulationStatus !== "OK") {
    finalStatus = "NEEDS_API_FETCH_FIX";
  } else if (
    crossDateInvariantCheck.crossDateInvariantStatus !== "OK"
  ) finalStatus = "NEEDS_CROSS_DATE_REVIEW";
  if (modificationGuard.guardStatus !== "pass") finalStatus = "BLOCKED";
  const uiApiSmokeReadiness = {
    targetDate: TARGET_DATE,
    publicPathResolutionStatus:
      publicPathResolutionCheck.pathResolutionStatus,
    historyIndexConsumptionStatus:
      historyIndexConsumptionCheck.indexConsumptionStatus,
    dailyPayloadConsumptionStatus:
      dailyPayloadConsumptionCheck.dailyPayloadConsumptionStatus,
    noStartersUiApiConsumptionStatus:
      noStartersUiApiConsumptionCheck.noStartersUiApiConsumptionStatus,
    consumerShapeCompatibilityStatus:
      consumerShapeCompatibilityCheck.compatibilityStatus,
    apiFetchSimulationStatus:
      apiFetchSimulationCheck.fetchSimulationStatus,
    crossDateInvariantStatus:
      crossDateInvariantCheck.crossDateInvariantStatus,
    noFakeNoGeneratedIdentityStatus:
      noFakeNoGeneratedIdentityCheck.noFakeNoGeneratedIdentityStatus,
    protectedModificationGuardStatus: modificationGuard.guardStatus,
    canProceedToCompletionMemo,
    canProceedToSameDateBridgeNow: sameDateBridgePossibleNow,
    finalStatus,
  };
  const normalizedBlockReasons = normalizeBlockReasons(blockReasonCounts);
  const summary = {
    targetDate: TARGET_DATE,
    finalStatus,
    canProceedToCompletionMemo,
    canProceedToSameDateBridgeNow: sameDateBridgePossibleNow,
    targetDateEntryExists: targetEntries.length === 1,
    targetDatePublicPath: targetEntry?.file ?? null,
    resolvedFilesystemPath,
    resolvedFileExists:
      publicPathResolutionCheck.resolvedFileExists,
    indexHash,
    indexBytes,
    sourceCount,
    dayCount: index.dayCount ?? null,
    raceCount: index.raceCount ?? null,
    totalBytes: index.totalBytes ?? null,
    itemBytesSum,
    latestDate: latest?.date ?? null,
    latestPath: latest?.file ?? null,
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
    consumerShapeCompatibilityStatus:
      consumerShapeCompatibilityCheck.compatibilityStatus,
    apiFetchSimulationStatus:
      apiFetchSimulationCheck.fetchSimulationStatus,
    entry20260629Unchanged,
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
    targetConfig,
    publicPathResolutionCheck,
    historyIndexConsumptionCheck,
    dailyPayloadConsumptionCheck,
    noStartersUiApiConsumptionCheck,
    consumerShapeCompatibilityCheck,
    apiFetchSimulationCheck,
    crossDateInvariantCheck,
    noFakeNoGeneratedIdentityCheck,
    protectedModificationGuard: modificationGuard,
    uiApiSmokeReadiness,
    nextActionPlan: nextActionPlan(finalStatus),
    jsonSummary: {
      ...summary,
      blockReasonCounts: normalizedBlockReasons,
    },
  };
}

async function main() {
  const result = await auditUiApiConsumptionSmoke20260625();
  printSection("summary", result.summary);
  printSection("targetConfig", result.targetConfig);
  printSection(
    "publicPathResolutionCheck",
    result.publicPathResolutionCheck,
  );
  printSection(
    "historyIndexConsumptionCheck",
    result.historyIndexConsumptionCheck,
  );
  printSection(
    "dailyPayloadConsumptionCheck",
    result.dailyPayloadConsumptionCheck,
  );
  printSection(
    "noStartersUiApiConsumptionCheck",
    result.noStartersUiApiConsumptionCheck,
  );
  printSection(
    "consumerShapeCompatibilityCheck",
    result.consumerShapeCompatibilityCheck,
  );
  printSection("apiFetchSimulationCheck", result.apiFetchSimulationCheck);
  printSection("crossDateInvariantCheck", result.crossDateInvariantCheck);
  printSection(
    "noFakeNoGeneratedIdentityCheck",
    result.noFakeNoGeneratedIdentityCheck,
  );
  printSection(
    "protectedModificationGuard",
    result.protectedModificationGuard,
  );
  printSection("uiApiSmokeReadiness", result.uiApiSmokeReadiness);
  printSection("nextActionPlan", result.nextActionPlan);
  printSection("jsonSummary", result.jsonSummary);
  if (
    result.uiApiSmokeReadiness.finalStatus
    !== "UI_API_CONSUMPTION_SMOKE_PASS_2026_06_25_NO_STARTERS"
  ) process.exitCode = 1;
}

const isMain =
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  main().catch((error) => {
    console.error(
      "[kurari-ex UI/API consumption smoke 2026-06-25] failed",
    );
    console.error(error);
    process.exitCode = 1;
  });
}
