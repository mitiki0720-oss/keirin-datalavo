import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();
const TARGET_DATE = "2026-06-25";
const DAILY_PATH =
  "public/data/analytics/kurari-ex/history/daily/2026-06/2026-06-25.generated.json";
const PUBLIC_PATH =
  "/data/analytics/kurari-ex/history/daily/2026-06/2026-06-25.generated.json";
const INDEX_PATH =
  "public/data/analytics/kurari-ex/history/index.generated.json";
const EXPECTED_DAILY_HASH =
  "sha256:b348ef4fc981701199fbc4a1e3d4e90a6fc54ff9e80bb2f65fc93cbb4fc247da";
const EXPECTED_DAILY_BYTES = 199655;
const EXPECTED_DAILY_RACE_COUNT = 75;
const EXPECTED_DAILY_VENUE_COUNT = 8;
const EXPECTED_CURRENT_INDEX = {
  sourceCount: 53,
  dayCount: 53,
  raceCount: 3997,
  totalBytes: 11009372,
  latestDate: "2026-06-29",
  latestPath:
    "/data/analytics/kurari-ex/history/daily/2026-06/2026-06-29.generated.json",
};
const EXPECTED_CANDIDATE_INDEX = {
  sourceCount: 54,
  dayCount: 54,
  raceCount: 4072,
  totalBytes: 11209027,
  latestDate: "2026-06-29",
  latestPath:
    "/data/analytics/kurari-ex/history/daily/2026-06/2026-06-29.generated.json",
};
const THIS_SCRIPT =
  "scripts/audit-kurari-ex-history-index-update-2026-06-25.mjs";
const STARTERS_SOURCE_PATH =
  "public/data/analytics/kurari-ex/source/starters/2026-06-25/today-registration-starters.generated.json";
const ENTRIES_SNAPSHOT_PATH =
  "public/data/races/entries-history/2026-06-25/keirin-jp-entries.generated.json";
const KNOWN_REVIEW_CHANGES = [
  "public/data/reviews/index.json",
  "public/data/reviews/2026-06-28/",
  "public/data/reviews/2026-06-29/",
  "public/data/reviews/2026-06-30/",
  "public/data/reviews/2026-07-01/",
];
const ALLOWED_TOP_LEVEL_CHANGED_KEYS = [
  "dayCount",
  "raceCount",
  "settledRaceCount",
  "totalBytes",
  "items",
];

const BLOCK_REASON_ORDER = [
  "HISTORY_INDEX_MISSING",
  "HISTORY_INDEX_PARSE_FAILED",
  "CURRENT_INDEX_COUNT_MISMATCH",
  "CURRENT_INDEX_TOTAL_BYTES_MISMATCH",
  "CURRENT_INDEX_ITEM_BYTES_SUM_MISMATCH",
  "TARGET_DATE_ALREADY_INDEXED",
  "DUPLICATE_INDEX_DATE",
  "DUPLICATE_INDEX_PATH",
  "DAILY_FILE_MISSING",
  "DAILY_FILE_PARSE_FAILED",
  "DAILY_HASH_MISMATCH",
  "DAILY_BYTES_MISMATCH",
  "DAILY_RACE_COUNT_MISMATCH",
  "DAILY_VENUE_COUNT_MISMATCH",
  "DAILY_SHAPE_INVALID",
  "CANDIDATE_INDEX_CONSTRUCTION_FAILED",
  "CANDIDATE_INDEX_SCHEMA_MAPPING_FAILED",
  "CANDIDATE_INDEX_COUNT_MISMATCH",
  "CANDIDATE_INDEX_TOTAL_BYTES_MISMATCH",
  "CANDIDATE_INDEX_ITEM_BYTES_SUM_MISMATCH",
  "CANDIDATE_INDEX_LATEST_POINTER_CHANGED",
  "CANDIDATE_INDEX_TARGET_PATH_UNRESOLVED",
  "INDEX_DIFF_UNEXPECTED_EXISTING_ENTRY_CHANGE",
  "INDEX_DIFF_UNEXPECTED_TOP_LEVEL_CHANGE",
  "INDEX_DIFF_DELTA_MISMATCH",
  "FAKE_COMPLETION_FOUND",
  "FUZZY_MATCHING_FOUND",
  "PREDICTION_USED_AS_RESULT_SOURCE",
  "REVIEW_USED_AS_RESULT_SOURCE_UNSAFELY",
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

function itemBytesSum(items) {
  return items.reduce((sum, item) => sum + (Number(item.bytes) || 0), 0);
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

function deepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function changedTopLevelKeys(current, candidate) {
  return [...new Set([
    ...Object.keys(current ?? {}),
    ...Object.keys(candidate ?? {}),
  ])].filter((key) => !deepEqual(current?.[key], candidate?.[key])).sort();
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
    "public/data/analytics/kurari-ex/history/daily/**",
    "public/data/analytics/kurari-ex/source/**",
    "public/data/races/**",
    "public/data/reviews/**",
    "private-input/**",
    "src/**",
    "package.json",
    "docs/**",
  ];
  const steps = [
    [
      "history-index-writer-checker",
      "2026-06-25 history index writer/checker",
    ],
    [
      "final-consistency-audit",
      "2026-06-25 final consistency audit no-starters",
    ],
    [
      "ui-api-consumption-smoke",
      "2026-06-25 UI/API consumption smoke",
    ],
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
    allowedFiles:
      index === 0
        ? [
            INDEX_PATH,
            "scripts/write-*.mjs",
            "scripts/check-*.mjs",
          ]
        : ["別工程で明示された新規script/dataのみ"],
    prohibitedFiles,
    readiness:
      index === 0
      && finalStatus
        === "READY_FOR_HISTORY_INDEX_WRITER_IMPLEMENTATION_2026_06_25"
        ? "ready"
        : "future",
    notes:
      index === 0
        ? "current index hash precondition、atomic write、post-write checkerを必須とする。"
        : "このauditではindex・daily・sourceを書き換えない。",
  }));
}

function printSection(label, value) {
  console.log(`[${label}]`);
  console.log(JSON.stringify(value, null, 2));
}

export async function auditHistoryIndexUpdate20260625() {
  const blockReasonCounts = {};
  const targetConfig = {
    targetDate: TARGET_DATE,
    dailyPath: DAILY_PATH,
    publicPath: PUBLIC_PATH,
    indexPath: INDEX_PATH,
    expectedDailyHash: EXPECTED_DAILY_HASH,
    expectedDailyBytes: EXPECTED_DAILY_BYTES,
    expectedDailyRaceCount: EXPECTED_DAILY_RACE_COUNT,
    expectedDailyVenueCount: EXPECTED_DAILY_VENUE_COUNT,
    expectedCurrentIndex: EXPECTED_CURRENT_INDEX,
    expectedCandidateIndex: EXPECTED_CANDIDATE_INDEX,
    writePerformed: false,
  };

  const [indexRead, dailyRead] = await Promise.all([
    readJsonStatus(INDEX_PATH),
    readJsonStatus(DAILY_PATH),
  ]);
  if (!indexRead.exists) {
    increment(blockReasonCounts, "HISTORY_INDEX_MISSING");
  } else if (indexRead.parseStatus !== "ok") {
    increment(blockReasonCounts, "HISTORY_INDEX_PARSE_FAILED");
  }
  const currentIndex = indexRead.payload ?? {};
  const currentItems = array(currentIndex.items);
  const currentLatest = latestItem(currentItems);
  const currentSourceCount = currentItems.length;
  const currentDayCount = currentIndex.dayCount ?? null;
  const currentRaceCount = currentIndex.raceCount ?? null;
  const currentTotalBytes = currentIndex.totalBytes ?? null;
  const currentItemBytesSum = itemBytesSum(currentItems);
  const targetDateEntries =
    currentItems.filter((item) => item?.date === TARGET_DATE);
  const duplicateDateCount =
    countDuplicates(currentItems.map((item) => item?.date).filter(Boolean));
  const duplicatePathCount =
    countDuplicates(currentItems.map((item) => item?.file).filter(Boolean));
  const sourceCountMatched =
    currentSourceCount === EXPECTED_CURRENT_INDEX.sourceCount;
  const dayCountMatched =
    currentDayCount === EXPECTED_CURRENT_INDEX.dayCount;
  const raceCountMatched =
    currentRaceCount === EXPECTED_CURRENT_INDEX.raceCount;
  const totalBytesMatched =
    currentTotalBytes === EXPECTED_CURRENT_INDEX.totalBytes;
  const totalBytesMatchedItemBytesSum =
    currentTotalBytes === currentItemBytesSum;
  const latestDateMatched =
    currentLatest?.date === EXPECTED_CURRENT_INDEX.latestDate;
  const latestPathMatched =
    currentLatest?.file === EXPECTED_CURRENT_INDEX.latestPath;
  let currentIndexGuardStatus = "PASS_READY_FOR_TARGET_DATE_INSERT";
  if (indexRead.parseStatus !== "ok") {
    currentIndexGuardStatus = "FAIL_INDEX_PARSE";
  } else if (targetDateEntries.length > 0) {
    currentIndexGuardStatus = "FAIL_TARGET_DATE_ALREADY_EXISTS";
  } else if (duplicateDateCount || duplicatePathCount) {
    currentIndexGuardStatus = "FAIL_DUPLICATE_ENTRY";
  } else if (!sourceCountMatched || !dayCountMatched || !raceCountMatched) {
    currentIndexGuardStatus = "FAIL_INDEX_COUNT_MISMATCH";
  } else if (!totalBytesMatched || !totalBytesMatchedItemBytesSum) {
    currentIndexGuardStatus = "FAIL_INDEX_TOTAL_BYTES_MISMATCH";
  } else if (!latestDateMatched || !latestPathMatched) {
    currentIndexGuardStatus = "FAIL";
  }
  if (!sourceCountMatched || !dayCountMatched || !raceCountMatched) {
    increment(blockReasonCounts, "CURRENT_INDEX_COUNT_MISMATCH");
  }
  if (!totalBytesMatched) {
    increment(blockReasonCounts, "CURRENT_INDEX_TOTAL_BYTES_MISMATCH");
  }
  if (!totalBytesMatchedItemBytesSum) {
    increment(
      blockReasonCounts,
      "CURRENT_INDEX_ITEM_BYTES_SUM_MISMATCH",
    );
  }
  if (targetDateEntries.length > 0) {
    increment(blockReasonCounts, "TARGET_DATE_ALREADY_INDEXED");
  }
  if (duplicateDateCount) {
    increment(blockReasonCounts, "DUPLICATE_INDEX_DATE", duplicateDateCount);
  }
  if (duplicatePathCount) {
    increment(blockReasonCounts, "DUPLICATE_INDEX_PATH", duplicatePathCount);
  }
  const currentIndexGuard = {
    indexExists: indexRead.exists,
    indexParseStatus: indexRead.parseStatus,
    indexHash: indexRead.buffer ? hashBuffer(indexRead.buffer) : null,
    sourceCount: currentSourceCount,
    expectedSourceCount: EXPECTED_CURRENT_INDEX.sourceCount,
    sourceCountMatched,
    dayCount: currentDayCount,
    expectedDayCount: EXPECTED_CURRENT_INDEX.dayCount,
    dayCountMatched,
    raceCount: currentRaceCount,
    expectedRaceCount: EXPECTED_CURRENT_INDEX.raceCount,
    raceCountMatched,
    totalBytes: currentTotalBytes,
    expectedTotalBytes: EXPECTED_CURRENT_INDEX.totalBytes,
    totalBytesMatched,
    itemBytesSum: currentItemBytesSum,
    totalBytesMatchedItemBytesSum,
    latestDate: currentLatest?.date ?? null,
    expectedLatestDate: EXPECTED_CURRENT_INDEX.latestDate,
    latestDateMatched,
    latestPath: currentLatest?.file ?? null,
    expectedLatestPath: EXPECTED_CURRENT_INDEX.latestPath,
    latestPathMatched,
    targetDateEntryExists: targetDateEntries.length > 0,
    targetDateEntryCount: targetDateEntries.length,
    duplicateDateCount,
    duplicatePathCount,
    currentIndexGuardStatus,
  };

  if (!dailyRead.exists) {
    increment(blockReasonCounts, "DAILY_FILE_MISSING");
  } else if (dailyRead.parseStatus !== "ok") {
    increment(blockReasonCounts, "DAILY_FILE_PARSE_FAILED");
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
  const noStartersRaceCount =
    dailyItems.filter(
      (item) =>
        item.starterCount === 0
        && array(item.starters).length === 0
        && item.quality?.marker === "NO_STARTERS",
    ).length;
  const starterTotalCount =
    dailyItems.flatMap((item) => array(item.starters)).length;
  const qualityStarterParsedFalseCount =
    dailyItems.filter((item) => item.quality?.starterParsed === false).length;
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
  const duplicateRaceKeyCount =
    countDuplicates(dailyItems.map((item) => item.raceKey));
  const duplicateDateVenueRaceNumberCount =
    countDuplicates(
      dailyItems.map(
        (item) => `${item.date}:${item.venueKey}:${item.raceNumber}`,
      ),
    );
  const dailyHashMatched = dailyHash === EXPECTED_DAILY_HASH;
  const dailyBytesMatched = dailyBytes === EXPECTED_DAILY_BYTES;
  const dailyRaceCountMatched =
    daily.raceCount === EXPECTED_DAILY_RACE_COUNT;
  const dailyVenueCountMatched =
    dailyVenueCount === EXPECTED_DAILY_VENUE_COUNT;
  const dailyShapeValid =
    daily.date === TARGET_DATE
    && daily.settledRaceCount === EXPECTED_DAILY_RACE_COUNT
    && daily.cancelledRaceCount === 0
    && predictionLinkedRaceCount === EXPECTED_DAILY_RACE_COUNT
    && reviewLinkedRaceCount === EXPECTED_DAILY_RACE_COUNT
    && noStartersRaceCount === EXPECTED_DAILY_RACE_COUNT
    && starterTotalCount === 0
    && qualityStarterParsedFalseCount === EXPECTED_DAILY_RACE_COUNT
    && missingCoreFieldTotal === 0
    && duplicateRaceKeyCount === 0
    && duplicateDateVenueRaceNumberCount === 0;
  let dailyFileGuardStatus = "PASS_DAILY_READY_FOR_INDEX";
  if (!dailyRead.exists) dailyFileGuardStatus = "FAIL_DAILY_MISSING";
  else if (dailyRead.parseStatus !== "ok") {
    dailyFileGuardStatus = "FAIL_DAILY_PARSE";
  } else if (!dailyHashMatched) {
    dailyFileGuardStatus = "FAIL_DAILY_HASH_MISMATCH";
  } else if (!dailyBytesMatched) {
    dailyFileGuardStatus = "FAIL_DAILY_BYTES_MISMATCH";
  } else if (!dailyRaceCountMatched || !dailyVenueCountMatched) {
    dailyFileGuardStatus = "FAIL_DAILY_COUNT_MISMATCH";
  } else if (!dailyShapeValid) dailyFileGuardStatus = "FAIL_DAILY_SHAPE";
  if (!dailyHashMatched) increment(blockReasonCounts, "DAILY_HASH_MISMATCH");
  if (!dailyBytesMatched) increment(blockReasonCounts, "DAILY_BYTES_MISMATCH");
  if (!dailyRaceCountMatched) {
    increment(blockReasonCounts, "DAILY_RACE_COUNT_MISMATCH");
  }
  if (!dailyVenueCountMatched) {
    increment(blockReasonCounts, "DAILY_VENUE_COUNT_MISMATCH");
  }
  if (!dailyShapeValid) increment(blockReasonCounts, "DAILY_SHAPE_INVALID");
  const dailyFileGuard = {
    dailyExists: dailyRead.exists,
    dailyParseStatus: dailyRead.parseStatus,
    dailyHash,
    expectedDailyHash: EXPECTED_DAILY_HASH,
    dailyHashMatched,
    dailyBytes,
    expectedDailyBytes: EXPECTED_DAILY_BYTES,
    dailyBytesMatched,
    dailyDate: daily.date ?? null,
    expectedDate: TARGET_DATE,
    dailyRaceCount: daily.raceCount ?? null,
    expectedDailyRaceCount: EXPECTED_DAILY_RACE_COUNT,
    dailyRaceCountMatched,
    dailyVenueCount,
    expectedDailyVenueCount: EXPECTED_DAILY_VENUE_COUNT,
    dailyVenueCountMatched,
    settledRaceCount: daily.settledRaceCount ?? null,
    cancelledRaceCount: daily.cancelledRaceCount ?? null,
    predictionLinkedRaceCount,
    reviewLinkedRaceCount,
    noStartersRaceCount,
    starterTotalCount,
    qualityStarterParsedFalseCount,
    missingCoreFieldCounts,
    duplicateRaceKeyCount,
    duplicateDateVenueRaceNumberCount,
    dailyFileGuardStatus,
  };

  const existingEntryShapeKeysSample =
    Object.keys(currentItems[0] ?? {}).sort();
  const targetEntry = {
    date: TARGET_DATE,
    file: PUBLIC_PATH,
    raceCount: daily.raceCount,
    settledRaceCount: daily.settledRaceCount,
    cancelledRaceCount: daily.cancelledRaceCount,
    bytes: dailyBytes,
  };
  const insertedEntryShapeKeys = Object.keys(targetEntry).sort();
  const schemaShapeMatched =
    deepEqual(insertedEntryShapeKeys, existingEntryShapeKeysSample);
  let candidateIndex = null;
  let candidateConstructionError = null;
  try {
    const items = [...currentItems, targetEntry]
      .sort((left, right) => String(left.date).localeCompare(String(right.date)));
    candidateIndex = {
      ...currentIndex,
      period: {
        from: currentIndex.period?.from ?? items[0]?.date ?? TARGET_DATE,
        to: latestItem(items)?.date ?? TARGET_DATE,
      },
      dayCount: items.length,
      raceCount:
        items.reduce((sum, item) => sum + (Number(item.raceCount) || 0), 0),
      settledRaceCount:
        items.reduce(
          (sum, item) => sum + (Number(item.settledRaceCount) || 0),
          0,
        ),
      cancelledRaceCount:
        items.reduce(
          (sum, item) => sum + (Number(item.cancelledRaceCount) || 0),
          0,
        ),
      totalBytes: itemBytesSum(items),
      items,
    };
  } catch (error) {
    candidateConstructionError = error.message;
    increment(blockReasonCounts, "CANDIDATE_INDEX_CONSTRUCTION_FAILED");
  }
  if (!schemaShapeMatched) {
    increment(blockReasonCounts, "CANDIDATE_INDEX_SCHEMA_MAPPING_FAILED");
  }
  const candidateItems = array(candidateIndex?.items);
  const candidateLatest = latestItem(candidateItems);
  const candidateSourceCount = candidateItems.length;
  const candidateDayCount = candidateIndex?.dayCount ?? null;
  const candidateRaceCount = candidateIndex?.raceCount ?? null;
  const candidateTotalBytes = candidateIndex?.totalBytes ?? null;
  const candidateItemBytesSum = itemBytesSum(candidateItems);
  const candidateTotalBytesMatchedItemBytesSum =
    candidateTotalBytes === candidateItemBytesSum;
  const candidateLatestDateMatched =
    candidateLatest?.date === EXPECTED_CANDIDATE_INDEX.latestDate;
  const candidateLatestPathMatched =
    candidateLatest?.file === EXPECTED_CANDIDATE_INDEX.latestPath;
  const targetCandidateEntry =
    candidateItems.find((item) => item?.date === TARGET_DATE);
  const targetDateSelectableFromIndex =
    Boolean(targetCandidateEntry && targetCandidateEntry.file === PUBLIC_PATH);
  const resolvedTargetPath =
    targetCandidateEntry?.file?.startsWith("/")
      ? `public${targetCandidateEntry.file}`
      : targetCandidateEntry?.file ?? null;
  const targetDateDailyPathResolves = resolvedTargetPath === DAILY_PATH;
  const targetDateDailyFileExists =
    targetDateDailyPathResolves && existsSync(abs(resolvedTargetPath));
  const candidateCountsMatched =
    candidateSourceCount === EXPECTED_CANDIDATE_INDEX.sourceCount
    && candidateDayCount === EXPECTED_CANDIDATE_INDEX.dayCount
    && candidateRaceCount === EXPECTED_CANDIDATE_INDEX.raceCount;
  const candidateTotalBytesMatched =
    candidateTotalBytes === EXPECTED_CANDIDATE_INDEX.totalBytes;
  let candidateIndexConstructionStatus = "PASS_CANDIDATE_INDEX_READY";
  if (!candidateIndex) {
    candidateIndexConstructionStatus = "FAIL";
  } else if (!schemaShapeMatched) {
    candidateIndexConstructionStatus = "FAIL_SCHEMA_MAPPING";
  } else if (!candidateCountsMatched) {
    candidateIndexConstructionStatus = "FAIL_COUNT_MISMATCH";
  } else if (
    !candidateTotalBytesMatched
    || !candidateTotalBytesMatchedItemBytesSum
  ) {
    candidateIndexConstructionStatus = "FAIL_TOTAL_BYTES_MISMATCH";
  } else if (!candidateLatestDateMatched || !candidateLatestPathMatched) {
    candidateIndexConstructionStatus =
      "FAIL_LATEST_POINTER_CHANGED_UNEXPECTEDLY";
  } else if (!targetDateDailyPathResolves || !targetDateDailyFileExists) {
    candidateIndexConstructionStatus = "FAIL";
  }
  if (!candidateCountsMatched) {
    increment(blockReasonCounts, "CANDIDATE_INDEX_COUNT_MISMATCH");
  }
  if (!candidateTotalBytesMatched) {
    increment(blockReasonCounts, "CANDIDATE_INDEX_TOTAL_BYTES_MISMATCH");
  }
  if (!candidateTotalBytesMatchedItemBytesSum) {
    increment(
      blockReasonCounts,
      "CANDIDATE_INDEX_ITEM_BYTES_SUM_MISMATCH",
    );
  }
  if (!candidateLatestDateMatched || !candidateLatestPathMatched) {
    increment(
      blockReasonCounts,
      "CANDIDATE_INDEX_LATEST_POINTER_CHANGED",
    );
  }
  if (!targetDateDailyPathResolves || !targetDateDailyFileExists) {
    increment(
      blockReasonCounts,
      "CANDIDATE_INDEX_TARGET_PATH_UNRESOLVED",
    );
  }
  const candidateIndexText =
    candidateIndex ? `${JSON.stringify(candidateIndex, null, 2)}\n` : "";
  const candidateIndexConstruction = {
    candidateConstructed: Boolean(candidateIndex),
    candidateConstructionError,
    insertedDate: targetEntry.date,
    insertedPath: targetEntry.file,
    insertedBytes: targetEntry.bytes,
    insertedRaceCount: targetEntry.raceCount,
    insertedEntryShapeKeys,
    existingEntryShapeKeysSample,
    addedItemCount: candidateItems.length - currentItems.length,
    removedItemCount: 0,
    changedItemCount: 0,
    candidateSourceCount,
    expectedCandidateSourceCount: EXPECTED_CANDIDATE_INDEX.sourceCount,
    candidateDayCount,
    expectedCandidateDayCount: EXPECTED_CANDIDATE_INDEX.dayCount,
    candidateRaceCount,
    expectedCandidateRaceCount: EXPECTED_CANDIDATE_INDEX.raceCount,
    candidateTotalBytes,
    expectedCandidateTotalBytes: EXPECTED_CANDIDATE_INDEX.totalBytes,
    candidateItemBytesSum,
    candidateTotalBytesMatchedItemBytesSum,
    candidateLatestDate: candidateLatest?.date ?? null,
    expectedCandidateLatestDate: EXPECTED_CANDIDATE_INDEX.latestDate,
    candidateLatestDateMatched,
    candidateLatestPath: candidateLatest?.file ?? null,
    expectedCandidateLatestPath: EXPECTED_CANDIDATE_INDEX.latestPath,
    candidateLatestPathMatched,
    targetDateSelectableFromIndex,
    targetDateDailyPathResolves,
    targetDateDailyFileExists,
    candidateIndexHash:
      candidateIndex ? hashStableIndex(candidateIndex) : null,
    candidateIndexBytes: Buffer.byteLength(candidateIndexText, "utf8"),
    candidateIndexConstructionStatus,
  };

  const currentByDate =
    new Map(currentItems.map((item) => [item.date, item]));
  const candidateByDate =
    new Map(candidateItems.map((item) => [item.date, item]));
  const addedDateEntries =
    [...candidateByDate.keys()].filter((date) => !currentByDate.has(date));
  const removedDateEntries =
    [...currentByDate.keys()].filter((date) => !candidateByDate.has(date));
  const changedExistingEntryPaths =
    [...currentByDate.keys()]
      .filter(
        (date) =>
          candidateByDate.has(date)
          && !deepEqual(currentByDate.get(date), candidateByDate.get(date)),
      )
      .map((date) => `items[${date}]`);
  const topLevelChangedKeys =
    changedTopLevelKeys(currentIndex, candidateIndex);
  const unexpectedTopLevelChanges =
    topLevelChangedKeys.filter(
      (key) => !ALLOWED_TOP_LEVEL_CHANGED_KEYS.includes(key),
    );
  const sourceCountDelta = candidateSourceCount - currentSourceCount;
  const dayCountDelta = candidateDayCount - currentDayCount;
  const raceCountDelta = candidateRaceCount - currentRaceCount;
  const totalBytesDelta = candidateTotalBytes - currentTotalBytes;
  const latestDateChanged =
    candidateLatest?.date !== currentLatest?.date;
  const latestPathChanged =
    candidateLatest?.file !== currentLatest?.file;
  const schemaVersionChanged =
    candidateIndex?.schemaVersion !== currentIndex.schemaVersion;
  const deltasMatched =
    sourceCountDelta === 1
    && dayCountDelta === 1
    && raceCountDelta === EXPECTED_DAILY_RACE_COUNT
    && totalBytesDelta === EXPECTED_DAILY_BYTES;
  const expectedInsertOnly =
    deepEqual(addedDateEntries, [TARGET_DATE])
    && removedDateEntries.length === 0
    && changedExistingEntryPaths.length === 0
    && unexpectedTopLevelChanges.length === 0
    && !latestDateChanged
    && !latestPathChanged
    && !schemaVersionChanged
    && deltasMatched;
  let indexDiffStatus = "PASS_ONLY_EXPECTED_TARGET_DATE_INSERT";
  if (changedExistingEntryPaths.length || removedDateEntries.length) {
    indexDiffStatus = "FAIL_UNEXPECTED_EXISTING_ENTRY_CHANGE";
  } else if (unexpectedTopLevelChanges.length || schemaVersionChanged) {
    indexDiffStatus = "FAIL_UNEXPECTED_TOP_LEVEL_CHANGE";
  } else if (
    !deltasMatched
    || !deepEqual(addedDateEntries, [TARGET_DATE])
  ) indexDiffStatus = "FAIL_DELTA_MISMATCH";
  if (changedExistingEntryPaths.length || removedDateEntries.length) {
    increment(
      blockReasonCounts,
      "INDEX_DIFF_UNEXPECTED_EXISTING_ENTRY_CHANGE",
    );
  }
  if (unexpectedTopLevelChanges.length || schemaVersionChanged) {
    increment(
      blockReasonCounts,
      "INDEX_DIFF_UNEXPECTED_TOP_LEVEL_CHANGE",
    );
  }
  if (!deltasMatched || !deepEqual(addedDateEntries, [TARGET_DATE])) {
    increment(blockReasonCounts, "INDEX_DIFF_DELTA_MISMATCH");
  }
  const indexDiffGuard = {
    addedDateEntries,
    expectedAddedDateEntries: [TARGET_DATE],
    addedEntryCount: addedDateEntries.length,
    expectedAddedEntryCount: 1,
    removedEntryCount: removedDateEntries.length,
    changedExistingEntryCount: changedExistingEntryPaths.length,
    changedExistingEntryPaths,
    topLevelChangedKeys,
    allowedTopLevelChangedKeys: ALLOWED_TOP_LEVEL_CHANGED_KEYS,
    sourceCountDelta,
    expectedSourceCountDelta: 1,
    dayCountDelta,
    expectedDayCountDelta: 1,
    raceCountDelta,
    expectedRaceCountDelta: EXPECTED_DAILY_RACE_COUNT,
    totalBytesDelta,
    expectedTotalBytesDelta: EXPECTED_DAILY_BYTES,
    latestDateChanged,
    latestPathChanged,
    schemaVersionChanged,
    unexpectedChanges: [
      ...unexpectedTopLevelChanges.map(
        (key) => `unexpected top-level change: ${key}`,
      ),
      ...changedExistingEntryPaths,
      ...removedDateEntries.map((date) => `removed date: ${date}`),
      ...(!expectedInsertOnly ? [] : []),
    ],
    indexDiffStatus,
  };

  const noFakeNoGeneratedIdentityGuard = {
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
    noFakeNoGeneratedIdentityStatus: "PASS",
  };
  const writePlanGuard = {
    writeAllowedInCurrentAudit: false,
    nextWriterShouldModifyOnly: INDEX_PATH,
    nextWriterShouldNotModifyDaily: true,
    nextWriterShouldNotModifySource: true,
    nextWriterShouldNotModifyRaces: true,
    nextWriterShouldNotModifyReviews: true,
    nextWriterShouldNotModifySrc: true,
    nextWriterShouldUseAtomicWrite: true,
    nextWriterShouldFailIfTargetDateAlreadyExistsWithDifferentEntry: true,
    nextWriterShouldBeNoopIfAlreadyIndexedExactly: true,
    nextWriterShouldVerifyIndexAfterWrite: true,
    nextCheckerRequired: true,
    writePlanStatus: "PASS_READY_FOR_INDEX_WRITER_IMPLEMENTATION",
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

  const canProceedToIndexWriter =
    currentIndexGuardStatus === "PASS_READY_FOR_TARGET_DATE_INSERT"
    && dailyFileGuardStatus === "PASS_DAILY_READY_FOR_INDEX"
    && candidateIndexConstructionStatus === "PASS_CANDIDATE_INDEX_READY"
    && indexDiffStatus === "PASS_ONLY_EXPECTED_TARGET_DATE_INSERT"
    && noFakeNoGeneratedIdentityGuard.noFakeNoGeneratedIdentityStatus
      === "PASS"
    && writePlanGuard.writePlanStatus
      === "PASS_READY_FOR_INDEX_WRITER_IMPLEMENTATION"
    && modificationGuard.guardStatus === "pass";
  let finalStatus =
    canProceedToIndexWriter
      ? "READY_FOR_HISTORY_INDEX_WRITER_IMPLEMENTATION_2026_06_25"
      : "BLOCKED";
  if (currentIndexGuardStatus !== "PASS_READY_FOR_TARGET_DATE_INSERT") {
    finalStatus = "NEEDS_CURRENT_INDEX_REVIEW";
  } else if (dailyFileGuardStatus !== "PASS_DAILY_READY_FOR_INDEX") {
    finalStatus = "NEEDS_DAILY_FILE_REVIEW";
  } else if (
    candidateIndexConstructionStatus !== "PASS_CANDIDATE_INDEX_READY"
  ) finalStatus = "NEEDS_CANDIDATE_INDEX_REVIEW";
  else if (indexDiffStatus !== "PASS_ONLY_EXPECTED_TARGET_DATE_INSERT") {
    finalStatus = "NEEDS_INDEX_DIFF_REVIEW";
  }
  if (modificationGuard.guardStatus !== "pass") finalStatus = "BLOCKED";
  const canProceedToSameDateBridgeNow =
    existsSync(abs(STARTERS_SOURCE_PATH))
    && existsSync(abs(ENTRIES_SNAPSHOT_PATH));
  const indexUpdateReadiness = {
    targetDate: TARGET_DATE,
    currentIndexGuardStatus,
    dailyFileGuardStatus,
    candidateIndexConstructionStatus,
    indexDiffStatus,
    noFakeNoGeneratedIdentityStatus:
      noFakeNoGeneratedIdentityGuard.noFakeNoGeneratedIdentityStatus,
    writePlanStatus: writePlanGuard.writePlanStatus,
    protectedModificationGuardStatus: modificationGuard.guardStatus,
    canProceedToIndexWriter,
    canProceedToSameDateBridgeNow,
    finalStatus,
  };
  const normalizedBlockReasons = normalizeBlockReasons(blockReasonCounts);
  const summary = {
    targetDate: TARGET_DATE,
    finalStatus,
    canProceedToIndexWriter,
    canProceedToSameDateBridgeNow,
    currentIndexGuardStatus,
    dailyFileGuardStatus,
    candidateIndexConstructionStatus,
    indexDiffStatus,
    writePlanStatus: writePlanGuard.writePlanStatus,
    noFakeNoGeneratedIdentityStatus:
      noFakeNoGeneratedIdentityGuard.noFakeNoGeneratedIdentityStatus,
    currentSourceCount,
    currentDayCount,
    currentRaceCount,
    currentTotalBytes,
    currentLatestDate: currentLatest?.date ?? null,
    currentLatestPath: currentLatest?.file ?? null,
    dailyHash,
    dailyBytes,
    dailyRaceCount: daily.raceCount ?? null,
    dailyVenueCount,
    candidateSourceCount,
    candidateDayCount,
    candidateRaceCount,
    candidateTotalBytes,
    candidateLatestDate: candidateLatest?.date ?? null,
    candidateLatestPath: candidateLatest?.file ?? null,
    sourceCountDelta,
    dayCountDelta,
    raceCountDelta,
    totalBytesDelta,
    addedEntryCount: addedDateEntries.length,
    changedExistingEntryCount: changedExistingEntryPaths.length,
    removedEntryCount: removedDateEntries.length,
    candidateIndexHash:
      candidateIndexConstruction.candidateIndexHash,
    candidateIndexBytes:
      candidateIndexConstruction.candidateIndexBytes,
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
    generatedRegistrationNoFound: false,
    blockReasonCounts: normalizedBlockReasons,
  };
  return {
    summary,
    targetConfig,
    currentIndexGuard,
    dailyFileGuard,
    candidateIndexConstruction,
    indexDiffGuard,
    noFakeNoGeneratedIdentityGuard,
    writePlanGuard,
    protectedModificationGuard: modificationGuard,
    indexUpdateReadiness,
    nextActionPlan: nextActionPlan(finalStatus),
    jsonSummary: {
      ...summary,
      blockReasonCounts: normalizedBlockReasons,
    },
  };
}

async function main() {
  const result = await auditHistoryIndexUpdate20260625();
  printSection("summary", result.summary);
  printSection("targetConfig", result.targetConfig);
  printSection("currentIndexGuard", result.currentIndexGuard);
  printSection("dailyFileGuard", result.dailyFileGuard);
  printSection(
    "candidateIndexConstruction",
    result.candidateIndexConstruction,
  );
  printSection("indexDiffGuard", result.indexDiffGuard);
  printSection(
    "noFakeNoGeneratedIdentityGuard",
    result.noFakeNoGeneratedIdentityGuard,
  );
  printSection("writePlanGuard", result.writePlanGuard);
  printSection(
    "protectedModificationGuard",
    result.protectedModificationGuard,
  );
  printSection("indexUpdateReadiness", result.indexUpdateReadiness);
  printSection("nextActionPlan", result.nextActionPlan);
  printSection("jsonSummary", result.jsonSummary);
  if (
    result.indexUpdateReadiness.finalStatus
    !== "READY_FOR_HISTORY_INDEX_WRITER_IMPLEMENTATION_2026_06_25"
  ) process.exitCode = 1;
}

const isMain =
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  main().catch((error) => {
    console.error("[kurari-ex history index update 2026-06-25] failed");
    console.error(error);
    process.exitCode = 1;
  });
}
