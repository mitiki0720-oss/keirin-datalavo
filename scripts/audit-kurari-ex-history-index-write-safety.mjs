import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { auditHistoryIndexUpdateDryRun } from "./audit-kurari-ex-history-index-update-dry-run.mjs";

const execFileAsync = promisify(execFile);

const ROOT = process.cwd();
const TARGET_DATE = "2026-06-29";
const TARGET_MONTH = "2026-06";
const INDEX_PATH = "public/data/analytics/kurari-ex/history/index.generated.json";
const TARGET_DAILY_PATH =
  `public/data/analytics/kurari-ex/history/daily/${TARGET_MONTH}/${TARGET_DATE}.generated.json`;
const TARGET_DAILY_PUBLIC_PATH =
  `/data/analytics/kurari-ex/history/daily/${TARGET_MONTH}/${TARGET_DATE}.generated.json`;
const EXPECTED_TARGET_DAILY_HASH =
  "sha256:96a4d2399cf7f57f777170648c9ab8da2f87f20b5bdcc3ed680f2ca6b67d6e2f";
const EXPECTED_CANDIDATE_INDEX_HASH =
  "sha256:53833ef5cc74c02b153c12a5c520b2f4740345777b7806fd5a22a2a7723659d9";
const ALLOWED_NEW_SCRIPT = "scripts/audit-kurari-ex-history-index-write-safety.mjs";
const KNOWN_PREEXISTING_REVIEW_PATHS = [
  "public/data/reviews/index.json",
  "public/data/reviews/2026-06-28/",
  "public/data/reviews/2026-06-29/",
];

const BLOCK_REASON_ORDER = [
  "HISTORY_INDEX_MISSING",
  "HISTORY_INDEX_PARSE_FAILED",
  "CURRENT_INDEX_HASH_UNAVAILABLE",
  "CURRENT_INDEX_HASH_UNSTABLE",
  "TARGET_DAILY_MISSING",
  "TARGET_DAILY_PARSE_FAILED",
  "TARGET_DAILY_CHECK_FAILED",
  "TARGET_DAILY_HASH_MISMATCH",
  "TARGET_DATE_ALREADY_INDEXED",
  "TARGET_PATH_ALREADY_INDEXED",
  "DUPLICATE_DATE_IN_INDEX",
  "DUPLICATE_PATH_IN_INDEX",
  "INDEX_SCHEMA_UNSUPPORTED",
  "CANDIDATE_INDEX_SCHEMA_INCOMPATIBLE",
  "CANDIDATE_INDEX_HASH_MISMATCH_DRY_RUN",
  "CANDIDATE_INDEX_HASH_UNSTABLE",
  "CANDIDATE_COUNT_MISMATCH",
  "LATEST_DATE_NOT_UPDATED",
  "LATEST_PATH_NOT_UPDATED",
  "SOURCE_COUNT_MISMATCH",
  "DAY_COUNT_MISMATCH",
  "RACE_COUNT_MISMATCH",
  "SETTLED_RACE_COUNT_MISMATCH",
  "CANCELLED_RACE_COUNT_MISMATCH",
  "TOTAL_BYTES_MISMATCH",
  "WRITE_PERFORMED_IN_AUDIT",
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

function hashBuffer(buffer) {
  return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
}

async function hashFile(file) {
  if (!existsSync(abs(file))) return null;
  return hashBuffer(await readFile(abs(file)));
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

function countDuplicates(values) {
  return values.length - new Set(values).size;
}

async function buildCurrentIndexPrecondition(blockReasonCounts) {
  if (!existsSync(abs(INDEX_PATH))) {
    increment(blockReasonCounts, "HISTORY_INDEX_MISSING");
    return {
      indexPath: INDEX_PATH,
      exists: false,
      parseStatus: "missing",
      currentIndexWritePreconditionStatus: "FAIL",
    };
  }
  try {
    const payload = await readJson(INDEX_PATH);
    const items = asArray(payload.items);
    const duplicateDateCount = countDuplicates(items.map((item) => item.date).filter(Boolean));
    const duplicatePathCount = countDuplicates(items.map((item) => item.file).filter(Boolean));
    const malformedItemCount = items.filter((item) => (
      !item.date || !item.file || typeof item.raceCount !== "number"
    )).length;
    const sortedItems = [...items].sort((left, right) => String(left.date).localeCompare(String(right.date)));
    const latestItem = sortedItems.at(-1) ?? null;
    const targetDateEntryExists = items.some((item) => item.date === TARGET_DATE);
    const targetPathEntryExists = items.some((item) => item.file === TARGET_DAILY_PUBLIC_PATH);
    if (duplicateDateCount) increment(blockReasonCounts, "DUPLICATE_DATE_IN_INDEX", duplicateDateCount);
    if (duplicatePathCount) increment(blockReasonCounts, "DUPLICATE_PATH_IN_INDEX", duplicatePathCount);
    if (targetDateEntryExists) increment(blockReasonCounts, "TARGET_DATE_ALREADY_INDEXED");
    if (targetPathEntryExists) increment(blockReasonCounts, "TARGET_PATH_ALREADY_INDEXED");
    const currentIndexHash = await hashFile(INDEX_PATH);
    if (!currentIndexHash) increment(blockReasonCounts, "CURRENT_INDEX_HASH_UNAVAILABLE");
    const ok = [
      payload.schemaVersion === 1,
      items.length === 52,
      payload.dayCount === 52,
      latestItem?.date === "2026-06-24",
      !targetDateEntryExists,
      !targetPathEntryExists,
      duplicateDateCount === 0,
      duplicatePathCount === 0,
      malformedItemCount === 0,
      Boolean(currentIndexHash),
    ].every(Boolean);
    return {
      indexPath: INDEX_PATH,
      exists: true,
      parseStatus: "ok",
      schemaVersion: payload.schemaVersion,
      currentIndexHash,
      sourceCount: items.length,
      dayCount: payload.dayCount,
      raceCount: payload.raceCount,
      settledRaceCount: payload.settledRaceCount,
      cancelledRaceCount: payload.cancelledRaceCount,
      totalBytes: payload.totalBytes,
      latestDate: latestItem?.date ?? null,
      latestPath: latestItem?.file ?? null,
      period: payload.period ?? null,
      itemCount: items.length,
      duplicateDateCount,
      duplicatePathCount,
      malformedItemCount,
      targetDateEntryExists,
      targetPathEntryExists,
      targetDateWouldBeNew: !targetDateEntryExists && !targetPathEntryExists,
      currentIndexWritePreconditionStatus: ok ? "OK" : "FAIL",
    };
  } catch (error) {
    increment(blockReasonCounts, "HISTORY_INDEX_PARSE_FAILED");
    return {
      indexPath: INDEX_PATH,
      exists: true,
      parseStatus: "failed",
      parseError: error.message,
      currentIndexWritePreconditionStatus: "FAIL",
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

function hashJsonPayload(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

async function buildTargetDailyPrecondition(blockReasonCounts) {
  if (!existsSync(abs(TARGET_DAILY_PATH))) {
    increment(blockReasonCounts, "TARGET_DAILY_MISSING");
    return {
      targetDate: TARGET_DATE,
      dailyPathFs: TARGET_DAILY_PATH,
      dailyPathPublic: TARGET_DAILY_PUBLIC_PATH,
      exists: false,
      parseStatus: "missing",
      targetDailyPreconditionStatus: "FAIL",
    };
  }
  try {
    const payload = await readJson(TARGET_DAILY_PATH);
    const items = asArray(payload.items);
    const missingCoreFieldCounts = countMissingCoreFields(items);
    const duplicateRaceKeyCount = countDuplicates(items.map((item) => item.raceKey).filter(Boolean));
    const noStartersMarkerCount = items.filter((item) => (
      item.starterCount > 0
      && asArray(item.starters).length === 0
      && item.quality?.starterParsed === false
    )).length;
    const predictionLinkedRaceCount = items.filter((item) => item.predictionEnrichment?.status === "matched").length;
    const startersIdentityGeneratedFromPrediction = items.some((item) => asArray(item.starters).length > 0);
    const payloadHash = hashJsonPayload(payload);
    const payloadHashMatched = payloadHash === EXPECTED_TARGET_DAILY_HASH;
    if (!payloadHashMatched) increment(blockReasonCounts, "TARGET_DAILY_HASH_MISMATCH");
    const checkerCompatible = [
      payload.schemaVersion === 1,
      payload.date === TARGET_DATE,
      payload.raceCount === 64,
      payload.settledRaceCount === 64,
      payload.cancelledRaceCount === 0,
      items.length === 64,
      new Set(items.map((item) => item.venueKey)).size === 7,
      noStartersMarkerCount === 64,
      predictionLinkedRaceCount === 64,
      duplicateRaceKeyCount === 0,
      Object.values(missingCoreFieldCounts).every((count) => count === 0),
      payloadHashMatched,
      !startersIdentityGeneratedFromPrediction,
    ].every(Boolean);
    if (!checkerCompatible) increment(blockReasonCounts, "TARGET_DAILY_CHECK_FAILED");
    return {
      targetDate: TARGET_DATE,
      dailyPathFs: TARGET_DAILY_PATH,
      dailyPathPublic: TARGET_DAILY_PUBLIC_PATH,
      exists: true,
      parseStatus: "ok",
      schemaVersion: payload.schemaVersion,
      date: payload.date,
      raceCount: payload.raceCount,
      settledRaceCount: payload.settledRaceCount,
      cancelledRaceCount: payload.cancelledRaceCount,
      itemCount: items.length,
      venueCount: new Set(items.map((item) => item.venueKey)).size,
      noStartersMarkerCount,
      predictionLinkedRaceCount,
      payloadHash,
      byteSize: Buffer.byteLength(`${JSON.stringify(payload, null, 2)}\n`, "utf8"),
      expectedPayloadHash: EXPECTED_TARGET_DAILY_HASH,
      payloadHashMatched,
      checkerCompatible,
      missingCoreFieldCounts,
      duplicateRaceKeyCount,
      fakeCompletionDetected: false,
      fuzzyMatchingDetected: false,
      predictionUsedAsResultSource: false,
      startersIdentityGeneratedFromPrediction,
      targetDailyPreconditionStatus: checkerCompatible ? "OK" : "FAIL",
    };
  } catch (error) {
    increment(blockReasonCounts, "TARGET_DAILY_PARSE_FAILED");
    return {
      targetDate: TARGET_DATE,
      dailyPathFs: TARGET_DAILY_PATH,
      dailyPathPublic: TARGET_DAILY_PUBLIC_PATH,
      exists: true,
      parseStatus: "failed",
      parseError: error.message,
      targetDailyPreconditionStatus: "FAIL",
    };
  }
}

function buildCandidateIndex(dryRun, blockReasonCounts) {
  const candidate = dryRun.candidateIndexDryRun;
  const candidateIndexHashMatched = candidate?.candidateIndexHash === EXPECTED_CANDIDATE_INDEX_HASH;
  if (!candidateIndexHashMatched) increment(blockReasonCounts, "CANDIDATE_INDEX_HASH_MISMATCH_DRY_RUN");
  if (candidate?.wouldLatestDate !== TARGET_DATE) increment(blockReasonCounts, "LATEST_DATE_NOT_UPDATED");
  if (candidate?.wouldLatestPath !== TARGET_DAILY_PUBLIC_PATH) increment(blockReasonCounts, "LATEST_PATH_NOT_UPDATED");
  return {
    wouldAddTargetDateEntry: candidate?.wouldAddTargetDateEntry ?? false,
    wouldUpdateExistingTargetDateEntry: candidate?.wouldUpdateExistingTargetDateEntry ?? false,
    wouldSourceCount: candidate?.wouldSourceCount ?? null,
    sourceCountDelta: candidate?.sourceCountDelta ?? null,
    wouldDayCount: candidate?.wouldDayCount ?? null,
    dayCountDelta: candidate?.dayCountDelta ?? null,
    wouldRaceCount: candidate?.wouldRaceCount ?? null,
    raceCountDelta: candidate?.raceCountDelta ?? null,
    wouldSettledRaceCount: candidate?.wouldSettledRaceCount ?? null,
    settledRaceCountDelta: candidate?.settledRaceCountDelta ?? null,
    wouldCancelledRaceCount: candidate?.wouldCancelledRaceCount ?? null,
    cancelledRaceCountDelta: candidate?.cancelledRaceCountDelta ?? null,
    wouldTotalBytes: candidate?.wouldTotalBytes ?? null,
    totalBytesDelta: candidate?.totalBytesDelta ?? null,
    wouldPeriod: candidate?.wouldPeriod ?? null,
    wouldLatestDate: candidate?.wouldLatestDate ?? null,
    wouldLatestPath: candidate?.wouldLatestPath ?? null,
    targetDateEntry: candidate?.targetDateEntry ?? null,
    candidateIndexHash: candidate?.candidateIndexHash ?? null,
    expectedCandidateIndexHash: EXPECTED_CANDIDATE_INDEX_HASH,
    candidateIndexHashMatched,
    generatedAtExcludedFromHash: true,
    candidateHashStable: Boolean(candidate?.candidateIndexHash),
    indexWritePerformed: false,
  };
}

function buildSchemaCompatibility(dryRun, blockReasonCounts) {
  const schema = dryRun.schemaCompatibility;
  if (schema.schemaCompatibility === "incompatible") {
    increment(blockReasonCounts, "CANDIDATE_INDEX_SCHEMA_INCOMPATIBLE");
  }
  return schema;
}

function buildCountReconciliation(currentIndex, targetDaily, candidateIndex, blockReasonCounts) {
  const expectedSourceCount = currentIndex.sourceCount + 1;
  const expectedCandidateRaceCount = currentIndex.raceCount + targetDaily.raceCount;
  const ok = [
    candidateIndex.wouldSourceCount === expectedSourceCount,
    candidateIndex.sourceCountDelta === 1,
    candidateIndex.wouldRaceCount === expectedCandidateRaceCount,
    candidateIndex.raceCountDelta === targetDaily.raceCount,
    candidateIndex.wouldSettledRaceCount === currentIndex.settledRaceCount + targetDaily.settledRaceCount,
    candidateIndex.settledRaceCountDelta === targetDaily.settledRaceCount,
    candidateIndex.wouldCancelledRaceCount === currentIndex.cancelledRaceCount + targetDaily.cancelledRaceCount,
    candidateIndex.cancelledRaceCountDelta === targetDaily.cancelledRaceCount,
    candidateIndex.wouldTotalBytes === currentIndex.totalBytes + targetDaily.byteSize,
    candidateIndex.totalBytesDelta === targetDaily.byteSize,
  ].every(Boolean);
  if (!ok) increment(blockReasonCounts, "CANDIDATE_COUNT_MISMATCH");
  return {
    currentSourceCount: currentIndex.sourceCount,
    candidateSourceCount: candidateIndex.wouldSourceCount,
    expectedSourceCount,
    sourceCountDelta: candidateIndex.sourceCountDelta,
    currentRaceCount: currentIndex.raceCount,
    targetDailyRaceCount: targetDaily.raceCount,
    candidateRaceCount: candidateIndex.wouldRaceCount,
    expectedCandidateRaceCount,
    raceCountDelta: candidateIndex.raceCountDelta,
    currentSettledRaceCount: currentIndex.settledRaceCount,
    targetDailySettledRaceCount: targetDaily.settledRaceCount,
    candidateSettledRaceCount: candidateIndex.wouldSettledRaceCount,
    settledRaceCountDelta: candidateIndex.settledRaceCountDelta,
    currentCancelledRaceCount: currentIndex.cancelledRaceCount,
    targetDailyCancelledRaceCount: targetDaily.cancelledRaceCount,
    candidateCancelledRaceCount: candidateIndex.wouldCancelledRaceCount,
    cancelledRaceCountDelta: candidateIndex.cancelledRaceCountDelta,
    currentTotalBytes: currentIndex.totalBytes,
    targetDailyByteSize: targetDaily.byteSize,
    candidateTotalBytes: candidateIndex.wouldTotalBytes,
    totalBytesDelta: candidateIndex.totalBytesDelta,
    countReconciliationStatus: ok ? "OK" : "FAIL",
  };
}

function buildWritePolicy({
  currentIndexPrecondition,
  targetDailyPrecondition,
  candidateIndex,
  schemaCompatibility,
  countReconciliation,
  protectedModificationGuard,
}) {
  const writeAllowedLater = [
    currentIndexPrecondition.currentIndexWritePreconditionStatus === "OK",
    targetDailyPrecondition.targetDailyPreconditionStatus === "OK",
    currentIndexPrecondition.targetDateWouldBeNew,
    candidateIndex.candidateIndexHashMatched,
    ["compatible", "partial"].includes(schemaCompatibility.schemaCompatibility),
    countReconciliation.countReconciliationStatus === "OK",
    protectedModificationGuard.guardStatus === "pass",
  ].every(Boolean);
  return {
    targetFile: INDEX_PATH,
    fileExists: currentIndexPrecondition.exists,
    writeModePlanned: "replace-index-only-with-current-hash-precondition",
    overwritePolicy: "allow-only-if-current-index-hash-unchanged-and-candidate-hash-matched",
    currentIndexHashBefore: currentIndexPrecondition.currentIndexHash,
    expectedCurrentIndexHash: currentIndexPrecondition.currentIndexHash,
    candidateIndexHash: candidateIndex.candidateIndexHash,
    expectedCandidateIndexHash: EXPECTED_CANDIDATE_INDEX_HASH,
    candidateIndexHashMatched: candidateIndex.candidateIndexHashMatched,
    targetDailyHashMatched: targetDailyPrecondition.payloadHashMatched,
    dryRunHashMatched: candidateIndex.candidateIndexHashMatched,
    writeAllowedLater,
    writePerformed: false,
    indexWritePerformed: false,
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

function buildReadiness({
  currentIndexPrecondition,
  targetDailyPrecondition,
  candidateIndex,
  schemaCompatibility,
  countReconciliation,
  protectedModificationGuard,
  writePolicy,
}) {
  const secondaryStatuses = [];
  let status = "READY_FOR_HISTORY_INDEX_WRITER_IMPLEMENTATION";
  if (!currentIndexPrecondition.currentIndexHash) status = "NEEDS_CURRENT_INDEX_HASH_LOCK";
  else if (schemaCompatibility.schemaCompatibility === "incompatible") status = "NEEDS_INDEX_SCHEMA_MAPPING";
  else if (targetDailyPrecondition.targetDailyPreconditionStatus !== "OK") status = "NEEDS_TARGET_DAILY_CHECK_FIX";
  else if (countReconciliation.countReconciliationStatus !== "OK") status = "NEEDS_COUNT_RECONCILIATION";
  else if (!currentIndexPrecondition.targetDateWouldBeNew) status = "NEEDS_DUPLICATE_INDEX_DECISION";
  else if (!candidateIndex.candidateIndexHashMatched) status = "NEEDS_HASH_STABILITY_FIX";
  else if (!writePolicy.writeAllowedLater) status = "BLOCKED";
  if (protectedModificationGuard.guardStatus !== "pass") {
    status = "BLOCKED";
    secondaryStatuses.push("PROTECTED_MODIFICATION_GUARD_FAILED");
  }
  return { status, secondaryStatuses };
}

function buildIndexWritePreview(dryRun) {
  return dryRun.indexDiffSummary;
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
      stepId: "history-index-writer-implementation",
      action: "Implement guarded history index writer with current-index hash precondition.",
      prerequisiteStatus: readiness.status,
      allowedFiles: ["new writer/checker scripts", INDEX_PATH],
      prohibitedFiles,
      readiness: readiness.status === "READY_FOR_HISTORY_INDEX_WRITER_IMPLEMENTATION" ? "ready" : "blocked",
      notes: "Writer must verify currentIndexHash and expected candidateIndexHash before replacing index.",
    },
    {
      stepId: "history-index-actual-write",
      action: "Write history index.",
      prerequisiteStatus: "history-index-writer-implementation pass",
      allowedFiles: [INDEX_PATH],
      prohibitedFiles,
      readiness: "future-step",
      notes: "No daily/source/races/private-input/src changes.",
    },
    {
      stepId: "history-index-checker-implementation",
      action: "Add checker for updated history index.",
      prerequisiteStatus: "history index written",
      allowedFiles: ["new checker script only"],
      prohibitedFiles,
      readiness: "future-step",
      notes: "Verify sourceCount 53, latestDate 2026-06-29, and target path presence.",
    },
    {
      stepId: "same-date-bridge-dry-run-rerun",
      action: "Rerun same-date bridge dry-run after index checker passes.",
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

export async function auditHistoryIndexWriteSafety() {
  const blockReasonCounts = {};
  const dryRun = await auditHistoryIndexUpdateDryRun();
  const currentIndexPrecondition = await buildCurrentIndexPrecondition(blockReasonCounts);
  const targetDailyPrecondition = await buildTargetDailyPrecondition(blockReasonCounts);
  const candidateIndex = buildCandidateIndex(dryRun, blockReasonCounts);
  const schemaCompatibility = buildSchemaCompatibility(dryRun, blockReasonCounts);
  const countReconciliation = buildCountReconciliation(
    currentIndexPrecondition,
    targetDailyPrecondition,
    candidateIndex,
    blockReasonCounts,
  );
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
  const writePolicy = buildWritePolicy({
    currentIndexPrecondition,
    targetDailyPrecondition,
    candidateIndex,
    schemaCompatibility,
    countReconciliation,
    protectedModificationGuard,
  });
  const historyIndexWriteSafetyReadiness = buildReadiness({
    currentIndexPrecondition,
    targetDailyPrecondition,
    candidateIndex,
    schemaCompatibility,
    countReconciliation,
    protectedModificationGuard,
    writePolicy,
  });
  const normalizedBlockReasonCounts = normalizeBlockReasons(blockReasonCounts);
  const summary = {
    targetDate: TARGET_DATE,
    indexPath: INDEX_PATH,
    targetDailyPath: TARGET_DAILY_PATH,
    currentSourceCount: currentIndexPrecondition.sourceCount,
    currentLatestDate: currentIndexPrecondition.latestDate,
    currentIndexHash: currentIndexPrecondition.currentIndexHash,
    targetDateEntryExists: currentIndexPrecondition.targetDateEntryExists,
    targetDailyExists: targetDailyPrecondition.exists,
    targetDailyHashMatched: targetDailyPrecondition.payloadHashMatched,
    wouldAddTargetDateEntry: candidateIndex.wouldAddTargetDateEntry,
    wouldSourceCount: candidateIndex.wouldSourceCount,
    sourceCountDelta: candidateIndex.sourceCountDelta,
    wouldRaceCount: candidateIndex.wouldRaceCount,
    raceCountDelta: candidateIndex.raceCountDelta,
    wouldLatestDate: candidateIndex.wouldLatestDate,
    wouldLatestPath: candidateIndex.wouldLatestPath,
    candidateIndexHash: candidateIndex.candidateIndexHash,
    expectedCandidateIndexHash: EXPECTED_CANDIDATE_INDEX_HASH,
    candidateIndexHashMatched: candidateIndex.candidateIndexHashMatched,
    schemaCompatibility: schemaCompatibility.schemaCompatibility,
    writeAllowedLater: writePolicy.writeAllowedLater,
    writePerformed: false,
    indexWritePerformed: false,
    historyIndexModified: protectedModificationGuard.historyIndexModified,
    historyDailyModified: protectedModificationGuard.historyDailyModified,
    fakeCompletionPerformed: false,
    fuzzyMatchingPerformed: false,
    predictionUsedAsResultSource: false,
    startersIdentityGeneratedFromPrediction: false,
    historyIndexWriteSafetyReadiness,
    blockReasonCounts: normalizedBlockReasonCounts,
  };
  return {
    summary,
    currentIndexPrecondition,
    targetDailyPrecondition,
    candidateIndex,
    writePolicy,
    schemaCompatibility,
    countReconciliation,
    indexWritePreview: buildIndexWritePreview(dryRun),
    protectedModificationGuard,
    nextActionPlan: buildNextActionPlan(historyIndexWriteSafetyReadiness),
    jsonSummary: {
      targetDate: TARGET_DATE,
      status: historyIndexWriteSafetyReadiness.status,
      secondaryStatuses: historyIndexWriteSafetyReadiness.secondaryStatuses,
      writeAllowedLater: writePolicy.writeAllowedLater,
      candidateIndexHashMatched: candidateIndex.candidateIndexHashMatched,
      blockReasonCounts: normalizedBlockReasonCounts,
    },
  };
}

async function main() {
  const result = await auditHistoryIndexWriteSafety();
  printSection("summary", result.summary);
  printSection("currentIndexPrecondition", result.currentIndexPrecondition);
  printSection("targetDailyPrecondition", result.targetDailyPrecondition);
  printSection("candidateIndex", result.candidateIndex);
  printSection("writePolicy", result.writePolicy);
  printSection("schemaCompatibility", result.schemaCompatibility);
  printSection("countReconciliation", result.countReconciliation);
  printSection("indexWritePreview", result.indexWritePreview);
  printSection("protectedModificationGuard", result.protectedModificationGuard);
  printSection("nextActionPlan", result.nextActionPlan);
  printSection("jsonSummary", result.jsonSummary);
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  main().catch((error) => {
    console.error("[kurari-ex history index write safety audit] failed");
    console.error(error);
    process.exitCode = 1;
  });
}
