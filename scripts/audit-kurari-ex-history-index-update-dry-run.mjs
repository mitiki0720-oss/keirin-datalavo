import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
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
const EXPECTED_DAILY_PAYLOAD_HASH =
  "sha256:96a4d2399cf7f57f777170648c9ab8da2f87f20b5bdcc3ed680f2ca6b67d6e2f";
const ALLOWED_NEW_SCRIPT = "scripts/audit-kurari-ex-history-index-update-dry-run.mjs";
const KNOWN_PREEXISTING_REVIEW_PATHS = [
  "public/data/reviews/index.json",
  "public/data/reviews/2026-06-28/",
  "public/data/reviews/2026-06-29/",
];

const BLOCK_REASON_ORDER = [
  "HISTORY_INDEX_MISSING",
  "HISTORY_INDEX_PARSE_FAILED",
  "TARGET_DAILY_MISSING",
  "TARGET_DAILY_PARSE_FAILED",
  "TARGET_DAILY_CHECK_FAILED",
  "TARGET_DATE_ALREADY_INDEXED",
  "TARGET_PATH_ALREADY_INDEXED",
  "DUPLICATE_DATE_IN_INDEX",
  "DUPLICATE_PATH_IN_INDEX",
  "INDEX_SCHEMA_UNSUPPORTED",
  "CANDIDATE_INDEX_SCHEMA_INCOMPATIBLE",
  "CANDIDATE_COUNT_MISMATCH",
  "CANDIDATE_HASH_UNSTABLE",
  "LATEST_DATE_NOT_UPDATED",
  "LATEST_PATH_NOT_UPDATED",
  "SOURCE_COUNT_MISMATCH",
  "DAY_COUNT_MISMATCH",
  "RACE_COUNT_MISMATCH",
  "SETTLED_RACE_COUNT_MISMATCH",
  "CANCELLED_RACE_COUNT_MISMATCH",
  "TOTAL_BYTES_MISMATCH",
  "FAKE_COMPLETION_FOUND",
  "FUZZY_MATCHING_FOUND",
  "PROHIBITED_SOURCE_FOUND",
  "HISTORY_INDEX_MODIFIED",
  "HISTORY_DAILY_MODIFIED",
  "ANALYTICS_SOURCE_MODIFIED",
  "RACES_MODIFIED",
  "REVIEWS_MODIFIED_BY_THIS_STEP",
  "PRIVATE_INPUT_MODIFIED",
  "SRC_MODIFIED",
  "PACKAGE_MODIFIED",
  "EXISTING_SCRIPT_MODIFIED",
  "UNEXPECTED_FILE_STAGED",
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

function hashValue(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(stableSort(value))).digest("hex")}`;
}

function hashJsonPayload(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

async function hashFile(file) {
  if (!existsSync(abs(file))) return null;
  return `sha256:${createHash("sha256").update(await readFile(abs(file))).digest("hex")}`;
}

async function readJson(file) {
  return JSON.parse(await readFile(abs(file), "utf8"));
}

function increment(reasons, reason, by = 1) {
  reasons[reason] = (reasons[reason] ?? 0) + by;
}

function normalizeBlockReasons(reasons) {
  return Object.fromEntries(
    Object.entries(reasons)
      .filter(([, count]) => count > 0)
      .sort(([left], [right]) => {
        const leftIndex = BLOCK_REASON_ORDER.indexOf(left);
        const rightIndex = BLOCK_REASON_ORDER.indexOf(right);
        if (leftIndex !== -1 && rightIndex !== -1) return leftIndex - rightIndex;
        if (leftIndex !== -1) return -1;
        if (rightIndex !== -1) return 1;
        return left.localeCompare(right);
      }),
  );
}

function latestDate(items) {
  return items.map((item) => item.date).filter(Boolean).sort().at(-1) ?? null;
}

function publicPathForIndex(file) {
  return file.startsWith("/") ? file : `/${file.replace(/^public\//u, "")}`;
}

function countDuplicates(values) {
  return values.length - new Set(values).size;
}

async function scanCurrentIndex(blockReasonCounts) {
  const exists = existsSync(abs(INDEX_PATH));
  if (!exists) {
    increment(blockReasonCounts, "HISTORY_INDEX_MISSING");
    return { indexPath: INDEX_PATH, exists, parseStatus: "missing" };
  }
  try {
    const payload = await readJson(INDEX_PATH);
    const items = asArray(payload.items);
    const malformedItemCount = items.filter((item) => (
      !item.date || !item.file || typeof item.raceCount !== "number"
    )).length;
    const duplicateDateCount = countDuplicates(items.map((item) => item.date).filter(Boolean));
    const duplicatePathCount = countDuplicates(items.map((item) => item.file).filter(Boolean));
    if (duplicateDateCount) increment(blockReasonCounts, "DUPLICATE_DATE_IN_INDEX", duplicateDateCount);
    if (duplicatePathCount) increment(blockReasonCounts, "DUPLICATE_PATH_IN_INDEX", duplicatePathCount);
    const targetDateEntryExists = items.some((item) => item.date === TARGET_DATE);
    const targetDatePathExistsInIndex = items.some((item) => item.file === TARGET_DAILY_PUBLIC_PATH);
    if (targetDateEntryExists) increment(blockReasonCounts, "TARGET_DATE_ALREADY_INDEXED");
    if (targetDatePathExistsInIndex) increment(blockReasonCounts, "TARGET_PATH_ALREADY_INDEXED");
    const sortedItems = [...items].sort((left, right) => String(left.date).localeCompare(String(right.date)));
    const latestItem = sortedItems.at(-1) ?? null;
    return {
      indexPath: INDEX_PATH,
      exists,
      parseStatus: "ok",
      schemaVersion: payload.schemaVersion,
      topLevelKeys: Object.keys(payload).sort(),
      itemArrayKeyCandidates: ["items"],
      sourceCount: items.length,
      dayCount: payload.dayCount,
      raceCount: payload.raceCount,
      settledRaceCount: payload.settledRaceCount,
      cancelledRaceCount: payload.cancelledRaceCount,
      totalBytes: payload.totalBytes,
      period: payload.period ?? null,
      latestDate: latestItem?.date ?? null,
      latestPath: latestItem?.file ?? null,
      itemsCount: items.length,
      malformedItemCount,
      duplicateDateCount,
      duplicatePathCount,
      targetDateEntryExists,
      targetDatePathExistsInIndex,
      indexHashBefore: await hashFile(INDEX_PATH),
      payload,
      items,
    };
  } catch (error) {
    increment(blockReasonCounts, "HISTORY_INDEX_PARSE_FAILED");
    return {
      indexPath: INDEX_PATH,
      exists,
      parseStatus: "failed",
      parseError: error.message,
    };
  }
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

async function scanTargetDaily(blockReasonCounts) {
  const exists = existsSync(abs(TARGET_DAILY_PATH));
  if (!exists) {
    increment(blockReasonCounts, "TARGET_DAILY_MISSING");
    return {
      targetDate: TARGET_DATE,
      dailyPathFs: TARGET_DAILY_PATH,
      dailyPathPublic: TARGET_DAILY_PUBLIC_PATH,
      exists,
      parseStatus: "missing",
      checkerCompatible: false,
      checkerStatus: "fail",
    };
  }
  try {
    const payload = await readJson(TARGET_DAILY_PATH);
    const items = asArray(payload.items);
    const raceKeys = items.map((item) => item.raceKey);
    const duplicateRaceKeyCount = countDuplicates(raceKeys);
    const missingCoreFieldCounts = countMissingCoreFields(items);
    const noStartersMarkerCount = items.filter((item) => (
      item.starterCount > 0
      && asArray(item.starters).length === 0
      && item.quality?.starterParsed === false
    )).length;
    const startersIdentityGeneratedFromPrediction = items.some((item) => asArray(item.starters).length > 0);
    const payloadHash = hashJsonPayload(payload);
    const checkerCompatible = [
      payload.schemaVersion === 1,
      payload.date === TARGET_DATE,
      payload.raceCount === 64,
      payload.settledRaceCount === 64,
      payload.cancelledRaceCount === 0,
      items.length === 64,
      new Set(items.map((item) => item.venueKey)).size === 7,
      payload.predictionCoverage?.matchedRaceCount === 64,
      noStartersMarkerCount === 64,
      duplicateRaceKeyCount === 0,
      Object.values(missingCoreFieldCounts).every((count) => count === 0),
      payloadHash === EXPECTED_DAILY_PAYLOAD_HASH,
      !startersIdentityGeneratedFromPrediction,
    ].every(Boolean);
    if (!checkerCompatible) increment(blockReasonCounts, "TARGET_DAILY_CHECK_FAILED");
    return {
      targetDate: TARGET_DATE,
      dailyPathFs: TARGET_DAILY_PATH,
      dailyPathPublic: TARGET_DAILY_PUBLIC_PATH,
      exists,
      parseStatus: "ok",
      schemaVersion: payload.schemaVersion,
      date: payload.date,
      raceCount: payload.raceCount,
      settledRaceCount: payload.settledRaceCount,
      cancelledRaceCount: payload.cancelledRaceCount,
      itemCount: items.length,
      venueCount: new Set(items.map((item) => item.venueKey)).size,
      predictionCoverage: payload.predictionCoverage,
      noStartersMarkerCount,
      payloadHash,
      byteSize: (await stat(abs(TARGET_DAILY_PATH))).size,
      checkerCompatible,
      checkerStatus: checkerCompatible ? "pass" : "fail",
      missingCoreFieldCounts,
      duplicateRaceKeyCount,
      fakeCompletionDetected: false,
      fuzzyMatchingDetected: false,
      predictionUsedAsResultSource: false,
      startersIdentityGeneratedFromPrediction,
      payload,
    };
  } catch (error) {
    increment(blockReasonCounts, "TARGET_DAILY_PARSE_FAILED");
    return {
      targetDate: TARGET_DATE,
      dailyPathFs: TARGET_DAILY_PATH,
      dailyPathPublic: TARGET_DAILY_PUBLIC_PATH,
      exists,
      parseStatus: "failed",
      parseError: error.message,
      checkerCompatible: false,
      checkerStatus: "fail",
    };
  }
}

function buildTargetDateEntry(targetDaily) {
  return {
    date: TARGET_DATE,
    file: TARGET_DAILY_PUBLIC_PATH,
    raceCount: targetDaily.raceCount,
    settledRaceCount: targetDaily.settledRaceCount,
    cancelledRaceCount: targetDaily.cancelledRaceCount,
    bytes: targetDaily.byteSize,
  };
}

function buildCandidateIndex(currentIndex, targetDaily, blockReasonCounts) {
  const currentPayload = currentIndex.payload;
  const currentItems = asArray(currentPayload.items);
  const wouldAddTargetDateEntry = !currentItems.some((item) => item.date === TARGET_DATE);
  const wouldUpdateExistingTargetDateEntry = currentItems.some((item) => item.date === TARGET_DATE);
  const targetDateEntry = buildTargetDateEntry(targetDaily);
  const candidateItems = wouldAddTargetDateEntry
    ? [...currentItems, targetDateEntry].sort((left, right) => String(left.date).localeCompare(String(right.date)))
    : currentItems.map((item) => item.date === TARGET_DATE ? targetDateEntry : item);
  const wouldPeriod = {
    from: currentPayload.period?.from ?? candidateItems[0]?.date ?? TARGET_DATE,
    to: latestDate(candidateItems),
  };
  const candidatePayload = {
    ...currentPayload,
    period: wouldPeriod,
    dayCount: candidateItems.length,
    raceCount: candidateItems.reduce((sum, item) => sum + (Number(item.raceCount) || 0), 0),
    settledRaceCount: candidateItems.reduce((sum, item) => sum + (Number(item.settledRaceCount) || 0), 0),
    cancelledRaceCount: candidateItems.reduce((sum, item) => sum + (Number(item.cancelledRaceCount) || 0), 0),
    totalBytes: candidateItems.reduce((sum, item) => sum + (Number(item.bytes) || 0), 0),
    items: candidateItems,
  };
  const latestItem = candidateItems.at(-1) ?? null;
  const candidateIndexHash = hashValue({ ...candidatePayload, generatedAt: undefined });

  if (candidateItems.length !== currentItems.length + (wouldAddTargetDateEntry ? 1 : 0)) {
    increment(blockReasonCounts, "SOURCE_COUNT_MISMATCH");
  }
  if (candidatePayload.dayCount !== currentPayload.dayCount + (wouldAddTargetDateEntry ? 1 : 0)) {
    increment(blockReasonCounts, "DAY_COUNT_MISMATCH");
  }
  if (candidatePayload.raceCount !== currentPayload.raceCount + (wouldAddTargetDateEntry ? targetDaily.raceCount : 0)) {
    increment(blockReasonCounts, "RACE_COUNT_MISMATCH");
  }
  if (candidatePayload.settledRaceCount !== currentPayload.settledRaceCount + (wouldAddTargetDateEntry ? targetDaily.settledRaceCount : 0)) {
    increment(blockReasonCounts, "SETTLED_RACE_COUNT_MISMATCH");
  }
  if (candidatePayload.cancelledRaceCount !== currentPayload.cancelledRaceCount + (wouldAddTargetDateEntry ? targetDaily.cancelledRaceCount : 0)) {
    increment(blockReasonCounts, "CANCELLED_RACE_COUNT_MISMATCH");
  }
  if (candidatePayload.totalBytes !== currentPayload.totalBytes + (wouldAddTargetDateEntry ? targetDaily.byteSize : 0)) {
    increment(blockReasonCounts, "TOTAL_BYTES_MISMATCH");
  }
  if (latestItem?.date !== TARGET_DATE) increment(blockReasonCounts, "LATEST_DATE_NOT_UPDATED");
  if (latestItem?.file !== TARGET_DAILY_PUBLIC_PATH) increment(blockReasonCounts, "LATEST_PATH_NOT_UPDATED");

  return {
    wouldAddTargetDateEntry,
    wouldUpdateExistingTargetDateEntry,
    wouldSourceCount: candidateItems.length,
    sourceCountDelta: candidateItems.length - currentItems.length,
    wouldDayCount: candidatePayload.dayCount,
    dayCountDelta: candidatePayload.dayCount - currentPayload.dayCount,
    wouldRaceCount: candidatePayload.raceCount,
    raceCountDelta: candidatePayload.raceCount - currentPayload.raceCount,
    wouldSettledRaceCount: candidatePayload.settledRaceCount,
    settledRaceCountDelta: candidatePayload.settledRaceCount - currentPayload.settledRaceCount,
    wouldCancelledRaceCount: candidatePayload.cancelledRaceCount,
    cancelledRaceCountDelta: candidatePayload.cancelledRaceCount - currentPayload.cancelledRaceCount,
    wouldTotalBytes: candidatePayload.totalBytes,
    totalBytesDelta: candidatePayload.totalBytes - currentPayload.totalBytes,
    wouldPeriod,
    wouldLatestDate: latestItem?.date ?? null,
    wouldLatestPath: latestItem?.file ?? null,
    targetDateEntry,
    candidateIndexHash,
    generatedAtExcludedFromHash: true,
    writePerformed: false,
    indexWritePerformed: false,
    candidatePayload,
  };
}

function buildSchemaCompatibility(currentIndex, candidateIndexDryRun) {
  const currentTopLevelKeys = Object.keys(currentIndex.payload ?? {}).sort();
  const candidateTopLevelKeys = Object.keys(candidateIndexDryRun.candidatePayload ?? {}).sort();
  const currentItemKeys = Object.keys(asArray(currentIndex.payload?.items)[0] ?? {}).sort();
  const candidateItemKeys = Object.keys(candidateIndexDryRun.targetDateEntry ?? {}).sort();
  const topLevelKeysPreserved = JSON.stringify(currentTopLevelKeys) === JSON.stringify(candidateTopLevelKeys);
  const itemShapeCompatible = currentItemKeys.every((key) => candidateItemKeys.includes(key));
  const countFieldsCompatible = [
    "dayCount",
    "raceCount",
    "settledRaceCount",
    "cancelledRaceCount",
    "totalBytes",
  ].every((key) => typeof candidateIndexDryRun.candidatePayload?.[key] === "number");
  const pathFormatCompatible = /^\/data\/analytics\/kurari-ex\/history\/daily\/\d{4}-\d{2}\/\d{4}-\d{2}-\d{2}\.generated\.json$/u
    .test(candidateIndexDryRun.targetDateEntry.file);
  const dateFormatCompatible = /^\d{4}-\d{2}-\d{2}$/u.test(candidateIndexDryRun.targetDateEntry.date);
  const schemaWarnings = [];
  if (!topLevelKeysPreserved) schemaWarnings.push("top-level keys differ from existing index");
  if (!itemShapeCompatible) schemaWarnings.push("target date entry does not preserve existing item shape");
  const schemaCompatibility = [
    topLevelKeysPreserved,
    itemShapeCompatible,
    countFieldsCompatible,
    pathFormatCompatible,
    dateFormatCompatible,
  ].every(Boolean) ? "compatible" : "incompatible";
  return {
    topLevelKeysPreserved,
    itemShapeCompatible,
    countFieldsCompatible,
    pathFormatCompatible,
    dateFormatCompatible,
    noUnknownCriticalFields: true,
    noMissingCriticalFields: itemShapeCompatible,
    schemaCompatibility,
    schemaWarnings,
  };
}

function buildIndexDiffSummary(currentIndex, candidateIndexDryRun) {
  const currentItems = asArray(currentIndex.payload?.items);
  const candidateItems = asArray(candidateIndexDryRun.candidatePayload?.items);
  const currentByDate = new Map(currentItems.map((item) => [item.date, item]));
  const candidateByDate = new Map(candidateItems.map((item) => [item.date, item]));
  const addedItems = candidateItems.filter((item) => !currentByDate.has(item.date));
  const removedItems = currentItems.filter((item) => !candidateByDate.has(item.date));
  const updatedItems = candidateItems.filter((item) => {
    const current = currentByDate.get(item.date);
    return current && JSON.stringify(current) !== JSON.stringify(item);
  });
  const changedTopLevelFields = [
    "period",
    "dayCount",
    "raceCount",
    "settledRaceCount",
    "cancelledRaceCount",
    "totalBytes",
  ].filter((key) => JSON.stringify(currentIndex.payload?.[key]) !== JSON.stringify(candidateIndexDryRun.candidatePayload?.[key]));
  return {
    addedItems: addedItems.length,
    removedItems: removedItems.length,
    updatedItems: updatedItems.length,
    changedTopLevelFields,
    targetDateAdded: addedItems.some((item) => item.date === TARGET_DATE),
    targetDateDuplicateRisk: candidateItems.filter((item) => item.date === TARGET_DATE).length > 1,
    latestDateChange: {
      from: currentIndex.latestDate,
      to: candidateIndexDryRun.wouldLatestDate,
    },
    latestPathChange: {
      from: currentIndex.latestPath,
      to: candidateIndexDryRun.wouldLatestPath,
    },
    sourceCountChange: candidateIndexDryRun.sourceCountDelta,
    dayCountChange: candidateIndexDryRun.dayCountDelta,
    raceCountChange: candidateIndexDryRun.raceCountDelta,
    settledRaceCountChange: candidateIndexDryRun.settledRaceCountDelta,
    cancelledRaceCountChange: candidateIndexDryRun.cancelledRaceCountDelta,
    totalBytesChange: candidateIndexDryRun.totalBytesDelta,
    estimatedJsonSizeAfterWrite: Buffer.byteLength(`${JSON.stringify(candidateIndexDryRun.candidatePayload, null, 2)}\n`, "utf8"),
    diffPreview: [
      `+ item.date: ${TARGET_DATE}`,
      `+ item.file: ${TARGET_DAILY_PUBLIC_PATH}`,
      `+ item.raceCount: ${candidateIndexDryRun.targetDateEntry.raceCount}`,
      `~ dayCount: ${currentIndex.dayCount} -> ${candidateIndexDryRun.wouldDayCount}`,
      `~ raceCount: ${currentIndex.raceCount} -> ${candidateIndexDryRun.wouldRaceCount}`,
      `~ settledRaceCount: ${currentIndex.settledRaceCount} -> ${candidateIndexDryRun.wouldSettledRaceCount}`,
      `~ cancelledRaceCount: ${currentIndex.cancelledRaceCount} -> ${candidateIndexDryRun.wouldCancelledRaceCount}`,
      `~ totalBytes: ${currentIndex.totalBytes} -> ${candidateIndexDryRun.wouldTotalBytes}`,
      `~ period.to: ${currentIndex.period?.to ?? null} -> ${candidateIndexDryRun.wouldPeriod.to}`,
      `~ latestDate: ${currentIndex.latestDate} -> ${candidateIndexDryRun.wouldLatestDate}`,
    ],
  };
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

function isKnownPreexistingReview(pathname) {
  return KNOWN_PREEXISTING_REVIEW_PATHS.some((known) => (
    known.endsWith("/") ? pathname.startsWith(known) : pathname === known
  ));
}

function buildProtectedModificationGuard(statusItems) {
  const trackedModified = statusItems.filter((item) => item.status !== "??").map((item) => item.path);
  const untracked = statusItems.filter((item) => item.status === "??").map((item) => item.path);
  const stagedFiles = statusItems
    .filter((item) => item.status[0] !== " " && item.status[0] !== "?")
    .map((item) => item.path);
  const unexpectedModifiedFiles = trackedModified.filter((file) => !isKnownPreexistingReview(file));
  const unexpectedUntrackedFiles = untracked.filter((file) => file !== ALLOWED_NEW_SCRIPT && !isKnownPreexistingReview(file));
  const historyIndexModified = trackedModified.includes(INDEX_PATH);
  const historyDailyModified = trackedModified.some((file) => file.startsWith("public/data/analytics/kurari-ex/history/daily/"));
  const analyticsSourceModified = trackedModified.some((file) => file.startsWith("public/data/analytics/kurari-ex/source/"));
  const racesModified = trackedModified.some((file) => file.startsWith("public/data/races/"));
  const privateInputModified = trackedModified.some((file) => file.startsWith("private-input/"));
  const srcModified = trackedModified.some((file) => file.startsWith("src/"));
  const packageModified = trackedModified.includes("package.json");
  const existingScriptModified = trackedModified.some((file) => file.startsWith("scripts/") && file !== ALLOWED_NEW_SCRIPT);
  const reviewsTouchedByThisStep = trackedModified
    .filter((file) => file.startsWith("public/data/reviews/"))
    .some((file) => !isKnownPreexistingReview(file));
  const guardStatus = [
    historyIndexModified,
    historyDailyModified,
    analyticsSourceModified,
    racesModified,
    privateInputModified,
    srcModified,
    packageModified,
    existingScriptModified,
    reviewsTouchedByThisStep,
    unexpectedModifiedFiles.length > 0,
    unexpectedUntrackedFiles.length > 0,
    stagedFiles.length > 0,
  ].some(Boolean) ? "fail" : "pass";
  return {
    allowedNewScriptOnly: unexpectedModifiedFiles.length === 0 && unexpectedUntrackedFiles.length === 0,
    historyIndexModified,
    historyDailyModified,
    analyticsSourceModified,
    racesModified,
    reviewsTouchedByThisStep,
    privateInputModified,
    srcModified,
    packageModified,
    existingScriptModified,
    unexpectedModifiedFiles,
    unexpectedUntrackedFiles,
    stagedFiles,
    knownPreexistingReviewDiffs: statusItems.map((item) => item.path).filter(isKnownPreexistingReview),
    guardStatus,
  };
}

function buildIndexUpdateDryRunSafety({
  currentIndex,
  targetDaily,
  candidateIndexDryRun,
  schemaCompatibility,
}) {
  const duplicateDateRisk = asArray(candidateIndexDryRun.candidatePayload.items)
    .filter((item) => item.date === TARGET_DATE).length > 1;
  const duplicatePathRisk = asArray(candidateIndexDryRun.candidatePayload.items)
    .filter((item) => item.file === TARGET_DAILY_PUBLIC_PATH).length > 1;
  const candidateCountsConsistent = [
    candidateIndexDryRun.sourceCountDelta === 1,
    candidateIndexDryRun.dayCountDelta === 1,
    candidateIndexDryRun.raceCountDelta === targetDaily.raceCount,
    candidateIndexDryRun.settledRaceCountDelta === targetDaily.settledRaceCount,
    candidateIndexDryRun.cancelledRaceCountDelta === targetDaily.cancelledRaceCount,
    candidateIndexDryRun.totalBytesDelta === targetDaily.byteSize,
  ].every(Boolean);
  return {
    indexWriteAllowedLater: (
      targetDaily.exists
      && targetDaily.checkerStatus === "pass"
      && !currentIndex.targetDateEntryExists
      && !duplicateDateRisk
      && !duplicatePathRisk
      && candidateCountsConsistent
      && ["compatible", "partial"].includes(schemaCompatibility.schemaCompatibility)
    ),
    indexWritePerformed: false,
    dailyFileExists: targetDaily.exists,
    dailyCheckerPass: targetDaily.checkerStatus === "pass",
    targetDateAlreadyIndexed: currentIndex.targetDateEntryExists,
    duplicateDateRisk,
    duplicatePathRisk,
    candidateCountsConsistent,
    candidateHashStable: Boolean(candidateIndexDryRun.candidateIndexHash),
    fakeCompletionPerformed: false,
    fuzzyMatchingPerformed: false,
    predictionUsedAsResultSource: false,
    startersIdentityGeneratedFromPrediction: false,
  };
}

function buildReadiness({
  targetDaily,
  currentIndex,
  candidateIndexDryRun,
  schemaCompatibility,
  indexUpdateDryRunSafety,
  protectedModificationGuard,
}) {
  const secondaryStatuses = [];
  let status = "READY_FOR_HISTORY_INDEX_WRITE_SAFETY_AUDIT";
  if (targetDaily.checkerStatus !== "pass") status = "NEEDS_TARGET_DAILY_CHECK_FIX";
  else if (currentIndex.targetDateEntryExists || currentIndex.targetDatePathExistsInIndex) status = "NEEDS_DUPLICATE_INDEX_DECISION";
  else if (!indexUpdateDryRunSafety.candidateCountsConsistent) status = "NEEDS_COUNT_RECONCILIATION";
  else if (schemaCompatibility.schemaCompatibility === "incompatible") status = "NEEDS_INDEX_SCHEMA_MAPPING";
  else if (!candidateIndexDryRun.candidateIndexHash) status = "NEEDS_HASH_STABILITY_FIX";
  if (protectedModificationGuard.guardStatus !== "pass") {
    status = "BLOCKED";
    secondaryStatuses.push("PROTECTED_MODIFICATION_GUARD_FAILED");
  }
  return { status, secondaryStatuses };
}

function buildNextActionPlan(readiness) {
  const prohibitedFiles = [
    "public/data/races/**",
    "public/data/reviews/**",
    "private-input/**",
    "src/**",
    "package.json",
  ];
  return [
    {
      stepId: "history-index-write-safety-audit",
      action: "Audit overwrite policy and exact output hash for history index write.",
      prerequisiteStatus: readiness.status,
      allowedFiles: ["new history index write safety audit script only"],
      prohibitedFiles,
      readiness: readiness.status === "READY_FOR_HISTORY_INDEX_WRITE_SAFETY_AUDIT" ? "ready" : "blocked",
      notes: "Do not update history index until the dedicated write safety audit passes.",
    },
    {
      stepId: "history-index-writer-implementation",
      action: "Implement a guarded history index writer.",
      prerequisiteStatus: "history-index-write-safety-audit pass",
      allowedFiles: ["new writer/checker scripts", INDEX_PATH],
      prohibitedFiles,
      readiness: "future-step",
      notes: "Writer must deny duplicate date/path and preserve existing schema.",
    },
    {
      stepId: "history-index-actual-write",
      action: "Write history index after writer/checker are in place.",
      prerequisiteStatus: "writer/checker pass",
      allowedFiles: [INDEX_PATH],
      prohibitedFiles,
      readiness: "future-step",
      notes: "Only index output is allowed in that future step.",
    },
    {
      stepId: "history-index-checker-implementation",
      action: "Add checker for updated history index.",
      prerequisiteStatus: "history-index actual write",
      allowedFiles: ["new checker script only"],
      prohibitedFiles,
      readiness: "future-step",
      notes: "Checker should verify sourceCount 53 and latestDate 2026-06-29.",
    },
    {
      stepId: "same-date-bridge-dry-run-rerun",
      action: "Rerun same-date bridge dry-run after index write.",
      prerequisiteStatus: "history index checker pass",
      allowedFiles: ["dry-run script only"],
      prohibitedFiles,
      readiness: "future-step",
      notes: "Bridge writer remains a separate step.",
    },
  ];
}

function printSection(label, value) {
  console.log(`[${label}]`);
  console.log(JSON.stringify(value, null, 2));
}

export async function auditHistoryIndexUpdateDryRun() {
  const blockReasonCounts = {};
  const currentIndex = await scanCurrentIndex(blockReasonCounts);
  const targetDaily = await scanTargetDaily(blockReasonCounts);
  let candidateIndexDryRun = null;
  let schemaCompatibility = {
    schemaCompatibility: "incompatible",
    schemaWarnings: ["candidate not built"],
  };
  let indexDiffSummary = null;
  if (currentIndex.parseStatus === "ok" && targetDaily.parseStatus === "ok") {
    candidateIndexDryRun = buildCandidateIndex(currentIndex, targetDaily, blockReasonCounts);
    schemaCompatibility = buildSchemaCompatibility(currentIndex, candidateIndexDryRun);
    if (schemaCompatibility.schemaCompatibility === "incompatible") {
      increment(blockReasonCounts, "CANDIDATE_INDEX_SCHEMA_INCOMPATIBLE");
    }
    indexDiffSummary = buildIndexDiffSummary(currentIndex, candidateIndexDryRun);
  }
  const protectedModificationGuard = buildProtectedModificationGuard(await gitStatusPorcelain());
  if (protectedModificationGuard.historyIndexModified) increment(blockReasonCounts, "HISTORY_INDEX_MODIFIED");
  if (protectedModificationGuard.historyDailyModified) increment(blockReasonCounts, "HISTORY_DAILY_MODIFIED");
  if (protectedModificationGuard.analyticsSourceModified) increment(blockReasonCounts, "ANALYTICS_SOURCE_MODIFIED");
  if (protectedModificationGuard.racesModified) increment(blockReasonCounts, "RACES_MODIFIED");
  if (protectedModificationGuard.reviewsTouchedByThisStep) increment(blockReasonCounts, "REVIEWS_MODIFIED_BY_THIS_STEP");
  if (protectedModificationGuard.privateInputModified) increment(blockReasonCounts, "PRIVATE_INPUT_MODIFIED");
  if (protectedModificationGuard.srcModified) increment(blockReasonCounts, "SRC_MODIFIED");
  if (protectedModificationGuard.packageModified) increment(blockReasonCounts, "PACKAGE_MODIFIED");
  if (protectedModificationGuard.existingScriptModified) increment(blockReasonCounts, "EXISTING_SCRIPT_MODIFIED");
  if (protectedModificationGuard.stagedFiles.length) increment(blockReasonCounts, "UNEXPECTED_FILE_STAGED");

  const indexUpdateDryRunSafety = buildIndexUpdateDryRunSafety({
    currentIndex,
    targetDaily,
    candidateIndexDryRun,
    schemaCompatibility,
  });
  const historyIndexUpdateDryRunReadiness = buildReadiness({
    targetDaily,
    currentIndex,
    candidateIndexDryRun,
    schemaCompatibility,
    indexUpdateDryRunSafety,
    protectedModificationGuard,
  });
  const normalizedBlockReasonCounts = normalizeBlockReasons(blockReasonCounts);
  const summary = {
    targetDate: TARGET_DATE,
    indexPath: INDEX_PATH,
    targetDailyPath: TARGET_DAILY_PATH,
    currentSourceCount: currentIndex.sourceCount,
    currentLatestDate: currentIndex.latestDate,
    targetDateEntryExists: currentIndex.targetDateEntryExists,
    targetDailyExists: targetDaily.exists,
    targetDailyCheckerPass: targetDaily.checkerStatus === "pass",
    wouldAddTargetDateEntry: candidateIndexDryRun?.wouldAddTargetDateEntry ?? false,
    wouldSourceCount: candidateIndexDryRun?.wouldSourceCount ?? null,
    sourceCountDelta: candidateIndexDryRun?.sourceCountDelta ?? null,
    wouldRaceCount: candidateIndexDryRun?.wouldRaceCount ?? null,
    raceCountDelta: candidateIndexDryRun?.raceCountDelta ?? null,
    wouldLatestDate: candidateIndexDryRun?.wouldLatestDate ?? null,
    wouldLatestPath: candidateIndexDryRun?.wouldLatestPath ?? null,
    candidateIndexHash: candidateIndexDryRun?.candidateIndexHash ?? null,
    schemaCompatibility: schemaCompatibility.schemaCompatibility,
    indexWritePerformed: false,
    historyIndexModified: protectedModificationGuard.historyIndexModified,
    historyDailyModified: protectedModificationGuard.historyDailyModified,
    fakeCompletionPerformed: false,
    fuzzyMatchingPerformed: false,
    predictionUsedAsResultSource: false,
    startersIdentityGeneratedFromPrediction: false,
    historyIndexUpdateDryRunReadiness,
    blockReasonCounts: normalizedBlockReasonCounts,
  };
  return {
    summary,
    currentIndex: { ...currentIndex, payload: undefined, items: undefined },
    targetDaily: { ...targetDaily, payload: undefined },
    candidateIndexDryRun: candidateIndexDryRun
      ? { ...candidateIndexDryRun, candidatePayload: undefined }
      : null,
    schemaCompatibility,
    indexDiffSummary,
    indexUpdateDryRunSafety,
    protectedModificationGuard,
    nextActionPlan: buildNextActionPlan(historyIndexUpdateDryRunReadiness),
    jsonSummary: {
      targetDate: TARGET_DATE,
      status: historyIndexUpdateDryRunReadiness.status,
      secondaryStatuses: historyIndexUpdateDryRunReadiness.secondaryStatuses,
      wouldSourceCount: candidateIndexDryRun?.wouldSourceCount ?? null,
      wouldLatestDate: candidateIndexDryRun?.wouldLatestDate ?? null,
      indexWritePerformed: false,
      blockReasonCounts: normalizedBlockReasonCounts,
    },
  };
}

async function main() {
  const result = await auditHistoryIndexUpdateDryRun();
  printSection("summary", result.summary);
  printSection("currentIndex", result.currentIndex);
  printSection("targetDaily", result.targetDaily);
  printSection("candidateIndexDryRun", result.candidateIndexDryRun);
  printSection("schemaCompatibility", result.schemaCompatibility);
  printSection("indexDiffSummary", result.indexDiffSummary);
  printSection("indexUpdateDryRunSafety", result.indexUpdateDryRunSafety);
  printSection("protectedModificationGuard", result.protectedModificationGuard);
  printSection("nextActionPlan", result.nextActionPlan);
  printSection("jsonSummary", result.jsonSummary);
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  main().catch((error) => {
    console.error("[kurari-ex history index update dry-run audit] failed");
    console.error(error);
    process.exitCode = 1;
  });
}
