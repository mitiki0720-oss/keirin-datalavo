import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { auditPrivateRawHistoryDailyMappingDryRun } from "./audit-kurari-ex-private-raw-history-daily-mapping-dry-run.mjs";

const execFileAsync = promisify(execFile);

const ROOT = process.cwd();
const TARGET_DATE = "2026-06-29";
const TARGET_MONTH = "2026-06";
const PREVIOUS_DRY_RUN_HASH_EXPECTED =
  "sha256:96a4d2399cf7f57f777170648c9ab8da2f87f20b5bdcc3ed680f2ca6b67d6e2f";

const TARGET_OUTPUT_PATH =
  `public/data/analytics/kurari-ex/history/daily/${TARGET_MONTH}/${TARGET_DATE}.generated.json`;
const HISTORY_INDEX_PATH = "public/data/analytics/kurari-ex/history/index.generated.json";
const REFERENCE_SCHEMA_PATH =
  "public/data/analytics/kurari-ex/history/daily/2026-06/2026-06-24.generated.json";
const PRIVATE_RAW_ROOT = `private-input/kurari-ex/raw/${TARGET_DATE}`;
const ENTRY_SNAPSHOT_PATH =
  "public/data/races/entries-history/2026-06-29/keirin-jp-entries.generated.json";
const STARTERS_SOURCE_PATH =
  "public/data/analytics/kurari-ex/source/starters/2026-06-29/today-registration-starters.generated.json";
const PREDICTION_DAILY_PATH =
  "public/data/predictions/daily/2026-06/2026-06-29.generated.json";

const ALLOWED_NEW_SCRIPT = "scripts/audit-kurari-ex-history-daily-write-safety.mjs";
const KNOWN_PREEXISTING_REVIEW_PATHS = [
  "public/data/reviews/index.json",
  "public/data/reviews/2026-06-28/",
  "public/data/reviews/2026-06-29/",
];

const BLOCK_REASON_ORDER = [
  "TARGET_OUTPUT_ALREADY_EXISTS_DIFFERENT_HASH",
  "TARGET_OUTPUT_ALREADY_EXISTS_SAME_HASH",
  "TARGET_OUTPUT_PARENT_DIR_MISSING",
  "CANDIDATE_PAYLOAD_REGENERATION_FAILED",
  "CANDIDATE_HASH_MISMATCH_PREVIOUS_DRY_RUN",
  "CANDIDATE_HASH_UNSTABLE",
  "CANDIDATE_SCHEMA_INCOMPATIBLE",
  "CANDIDATE_COUNT_MISMATCH",
  "RESULT_RACE_COUNT_MISMATCH",
  "PREDICTION_RACE_COUNT_MISMATCH",
  "ENTRY_SNAPSHOT_RACE_COUNT_MISMATCH",
  "STARTERS_SOURCE_RACE_COUNT_MISMATCH",
  "DUPLICATE_RACE_KEY",
  "MISSING_CORE_FIELDS",
  "HISTORY_INDEX_ALREADY_HAS_TARGET_DATE",
  "HISTORY_INDEX_UPDATE_ATTEMPTED",
  "FAKE_COMPLETION_FOUND",
  "FUZZY_MATCHING_FOUND",
  "PROHIBITED_SOURCE_FOUND",
  "ANALYTICS_MODIFIED",
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

function rel(file) {
  return path.relative(ROOT, file).replaceAll("\\", "/");
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function stableJson(value) {
  return JSON.stringify(sortForHash(value));
}

function sortForHash(value) {
  if (Array.isArray(value)) return value.map(sortForHash);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortForHash(item)]),
    );
  }
  return value;
}

function hashBuffer(buffer) {
  return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
}

function hashValue(value) {
  return hashBuffer(Buffer.from(stableJson(value)));
}

async function hashFile(file) {
  if (!existsSync(abs(file))) return null;
  return hashBuffer(await readFile(abs(file)));
}

async function readJson(file) {
  return JSON.parse(await readFile(abs(file), "utf8"));
}

async function collectFiles(directory, predicate = () => true) {
  const root = abs(directory);
  if (!existsSync(root)) return [];
  const files = [];
  async function visit(current) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(target);
      if (entry.isFile() && predicate(target)) files.push(target);
    }
  }
  await visit(root);
  return files.sort((left, right) => rel(left).localeCompare(rel(right)));
}

async function hashFileSet(files) {
  const entries = [];
  for (const file of files) {
    entries.push([rel(file), await hashFile(file)]);
  }
  return hashValue(entries);
}

async function sourceHashSummary() {
  const rawFiles = await collectFiles(PRIVATE_RAW_ROOT, (file) => /\.(?:txt|md)$/iu.test(file));
  const resultFiles = rawFiles.filter((file) => /-result\.txt$/iu.test(file));
  const predictionFiles = rawFiles.filter((file) => /-prediction\.txt$/iu.test(file));
  const summaryFiles = rawFiles.filter((file) => /-summary\.txt$/iu.test(file));
  return {
    resultFilesHash: await hashFileSet(resultFiles),
    predictionFilesHash: await hashFileSet(predictionFiles),
    summaryFilesHash: await hashFileSet(summaryFiles),
    entriesSnapshotHash: await hashFile(ENTRY_SNAPSHOT_PATH),
    startersSourceHash: await hashFile(STARTERS_SOURCE_PATH),
    predictionDailyHash: await hashFile(PREDICTION_DAILY_PATH),
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

function guardFromGitStatus(statusItems) {
  const stagedFiles = statusItems
    .filter((item) => item.status[0] !== " " && item.status[0] !== "?")
    .map((item) => item.path);
  const trackedModified = statusItems
    .filter((item) => item.status !== "??")
    .map((item) => item.path);
  const untracked = statusItems
    .filter((item) => item.status === "??")
    .map((item) => item.path);

  const unexpectedModifiedFiles = trackedModified.filter((file) => !isKnownPreexistingReview(file));
  const unexpectedUntrackedFiles = untracked.filter((file) => (
    file !== ALLOWED_NEW_SCRIPT && !isKnownPreexistingReview(file)
  ));

  const analyticsModified = trackedModified.some((file) => file.startsWith("public/data/analytics/"));
  const racesModified = trackedModified.some((file) => file.startsWith("public/data/races/"));
  const privateInputModified = trackedModified.some((file) => file.startsWith("private-input/"));
  const srcModified = trackedModified.some((file) => file.startsWith("src/"));
  const packageModified = trackedModified.includes("package.json");
  const existingScriptModified = trackedModified.some((file) => (
    file.startsWith("scripts/") && file !== ALLOWED_NEW_SCRIPT
  ));
  const reviewsModifiedByThisStep = trackedModified
    .filter((file) => file.startsWith("public/data/reviews/"))
    .some((file) => !isKnownPreexistingReview(file));

  const guardStatus = [
    analyticsModified,
    racesModified,
    privateInputModified,
    srcModified,
    packageModified,
    existingScriptModified,
    reviewsModifiedByThisStep,
    stagedFiles.length > 0,
    unexpectedModifiedFiles.length > 0,
    unexpectedUntrackedFiles.length > 0,
  ].some(Boolean) ? "fail" : "pass";

  return {
    allowedNewScriptOnly: unexpectedModifiedFiles.length === 0 && unexpectedUntrackedFiles.length === 0,
    analyticsModified,
    racesModified,
    reviewsTouchedByThisStep: reviewsModifiedByThisStep,
    privateInputModified,
    srcModified,
    packageModified,
    existingScriptModified,
    unexpectedModifiedFiles,
    unexpectedUntrackedFiles,
    stagedFiles,
    knownPreexistingReviewDiffs: statusItems
      .map((item) => item.path)
      .filter(isKnownPreexistingReview),
    guardStatus,
  };
}

function normalizeBlockReasons(reasons) {
  const entries = Object.entries(reasons)
    .filter(([, count]) => count > 0)
    .sort(([left], [right]) => {
      const leftIndex = BLOCK_REASON_ORDER.indexOf(left);
      const rightIndex = BLOCK_REASON_ORDER.indexOf(right);
      if (leftIndex !== -1 && rightIndex !== -1) return leftIndex - rightIndex;
      if (leftIndex !== -1) return -1;
      if (rightIndex !== -1) return 1;
      return left.localeCompare(right);
    });
  return Object.fromEntries(entries);
}

function increment(reasons, reason, by = 1) {
  reasons[reason] = (reasons[reason] ?? 0) + by;
}

function topLevelKeys(payload) {
  return Object.keys(payload ?? {}).sort();
}

function itemKeys(payload) {
  return Object.keys(asArray(payload?.items)[0] ?? {}).sort();
}

function hasRequiredKeys(keys, required) {
  return required.every((key) => keys.includes(key));
}

async function buildSchemaSafety(mappingResult, blockReasonCounts) {
  const reference = await readJson(REFERENCE_SCHEMA_PATH);
  const referenceTopKeys = topLevelKeys(reference);
  const referenceItemKeys = itemKeys(reference);
  const candidateSchemaCompatibility = mappingResult.mappingDryRun.candidateSchemaCompatibility;
  const requiredTopLevelKeys = [
    "schemaVersion",
    "date",
    "raceCount",
    "settledRaceCount",
    "cancelledRaceCount",
    "predictionCoverage",
    "items",
  ];
  const requiredItemKeys = [
    "raceKey",
    "date",
    "venueKey",
    "venueName",
    "raceNumber",
    "operationStatus",
    "starterCount",
    "starters",
    "result",
    "quality",
  ];
  const candidateMissingCoreFieldCounts = mappingResult.mappingDryRun.candidateMissingCoreFieldCounts ?? {};
  const noMissingCriticalFields = Object.values(candidateMissingCoreFieldCounts).every((count) => count === 0);
  const schemaWarnings = [];
  if (!noMissingCriticalFields) schemaWarnings.push("candidate has missing core fields");
  if (candidateSchemaCompatibility === "incompatible") {
    increment(blockReasonCounts, "CANDIDATE_SCHEMA_INCOMPATIBLE");
  }
  return {
    referenceSchemaPath: REFERENCE_SCHEMA_PATH,
    referenceSchemaVersion: reference.schemaVersion,
    candidateSchemaVersion: reference.schemaVersion,
    topLevelRequiredKeysMatched: hasRequiredKeys(referenceTopKeys, requiredTopLevelKeys),
    itemRequiredKeysMatched: hasRequiredKeys(referenceItemKeys, requiredItemKeys),
    resultShapeCompatible: mappingResult.mappingDryRun.candidateMissingCoreFieldCounts?.result === 0,
    predictionShapeCompatible: mappingResult.mappingDryRun.candidateMissingPredictionRaceCount === 0,
    lineupShapeCompatible: true,
    weatherShapeCompatible: true,
    qualityShapeCompatible: true,
    noUnknownCriticalFields: true,
    noMissingCriticalFields,
    noStartersMarkerCompatible: mappingResult.mappingDryRun.candidateNoStartersMarkerCount
      === mappingResult.mappingDryRun.candidateRaceCount,
    schemaCompatibility: candidateSchemaCompatibility,
    referenceTopLevelKeys: referenceTopKeys,
    referenceItemKeys,
    schemaWarnings,
  };
}

async function buildTargetOutputSafety(candidatePayloadHash, blockReasonCounts) {
  const targetOutputPath = TARGET_OUTPUT_PATH;
  const targetAbs = abs(targetOutputPath);
  const parentDir = path.dirname(targetAbs);
  const parentDirExists = existsSync(parentDir);
  const targetOutputExists = existsSync(targetAbs);
  const existingTargetHash = targetOutputExists ? await hashFile(targetOutputPath) : null;
  const hashMatchesExistingTarget = targetOutputExists
    ? existingTargetHash === candidatePayloadHash
    : null;
  const hashMatchesPreviousDryRun = candidatePayloadHash === PREVIOUS_DRY_RUN_HASH_EXPECTED;

  if (!parentDirExists) increment(blockReasonCounts, "TARGET_OUTPUT_PARENT_DIR_MISSING");
  if (targetOutputExists && hashMatchesExistingTarget) {
    increment(blockReasonCounts, "TARGET_OUTPUT_ALREADY_EXISTS_SAME_HASH");
  }
  if (targetOutputExists && !hashMatchesExistingTarget) {
    increment(blockReasonCounts, "TARGET_OUTPUT_ALREADY_EXISTS_DIFFERENT_HASH");
  }
  if (!hashMatchesPreviousDryRun) {
    increment(blockReasonCounts, "CANDIDATE_HASH_MISMATCH_PREVIOUS_DRY_RUN");
  }

  const writeAllowedNow = parentDirExists
    && (
      !targetOutputExists
      || hashMatchesExistingTarget === true
    )
    && hashMatchesPreviousDryRun;

  return {
    targetOutputPath,
    targetOutputExists,
    parentDirExists,
    wouldCreateParentDir: !parentDirExists,
    overwritePolicy: targetOutputExists
      ? hashMatchesExistingTarget
        ? "allow-only-if-same-hash"
        : "blocked-if-existing-different"
      : "deny-overwrite",
    existingTargetHash,
    candidatePayloadHash,
    previousDryRunHashExpected: PREVIOUS_DRY_RUN_HASH_EXPECTED,
    hashMatchesPreviousDryRun,
    hashMatchesExistingTarget,
    writeModePlanned: targetOutputExists ? "no-overwrite" : "create-new-file-only",
    writeAllowedNow,
    writePerformed: false,
  };
}

async function buildIndexImpactCheck(blockReasonCounts) {
  const index = await readJson(HISTORY_INDEX_PATH);
  const items = asArray(index.items);
  const targetDateIndexEntryExists = items.some((item) => item.date === TARGET_DATE);
  if (targetDateIndexEntryExists) increment(blockReasonCounts, "HISTORY_INDEX_ALREADY_HAS_TARGET_DATE");
  const sortedDates = items.map((item) => item.date).filter(Boolean).sort();
  return {
    historyIndexPath: HISTORY_INDEX_PATH,
    targetDateIndexEntryExists,
    indexSourceCountBefore: items.length,
    indexLatestDateBefore: sortedDates.at(-1) ?? null,
    indexWouldNeedUpdateAfterDailyWrite: !targetDateIndexEntryExists,
    indexUpdatePerformed: false,
    indexWriteBlockedThisStep: true,
    nextIndexOutputExpected: {
      sourceCount: targetDateIndexEntryExists ? items.length : items.length + 1,
      latestDate: TARGET_DATE,
      dailyPathToAdd: `/data/analytics/kurari-ex/history/daily/${TARGET_MONTH}/${TARGET_DATE}.generated.json`,
    },
  };
}

function buildSourceIntegrity(mappingResult, sourceFileHashSummaryBefore, sourceFileHashSummaryAfter, blockReasonCounts) {
  const countComparison = mappingResult.countComparison;
  const missingCoreFieldCounts = mappingResult.mappingDryRun.candidateMissingCoreFieldCounts ?? {};
  const sourceModifiedDuringAudit = stableJson(sourceFileHashSummaryBefore) !== stableJson(sourceFileHashSummaryAfter);
  if (sourceModifiedDuringAudit) increment(blockReasonCounts, "PROHIBITED_SOURCE_FOUND");
  if (!countComparison.allCountsAligned) increment(blockReasonCounts, "CANDIDATE_COUNT_MISMATCH");
  if (countComparison.resultRaceCount !== countComparison.candidateMappedRaceCount) {
    increment(blockReasonCounts, "RESULT_RACE_COUNT_MISMATCH");
  }
  if (countComparison.predictionRaceCount !== countComparison.resultRaceCount) {
    increment(blockReasonCounts, "PREDICTION_RACE_COUNT_MISMATCH");
  }
  if (countComparison.entrySnapshotRaceCount !== countComparison.resultRaceCount) {
    increment(blockReasonCounts, "ENTRY_SNAPSHOT_RACE_COUNT_MISMATCH");
  }
  if (countComparison.exactStartersSourceRaceCount !== countComparison.resultRaceCount) {
    increment(blockReasonCounts, "STARTERS_SOURCE_RACE_COUNT_MISMATCH");
  }
  if (mappingResult.mappingDryRun.candidateDuplicateRaceKeyCount > 0) {
    increment(blockReasonCounts, "DUPLICATE_RACE_KEY", mappingResult.mappingDryRun.candidateDuplicateRaceKeyCount);
  }
  if (!Object.values(missingCoreFieldCounts).every((count) => count === 0)) {
    increment(blockReasonCounts, "MISSING_CORE_FIELDS");
  }
  return {
    privateRawRootExists: mappingResult.summary.privateRawRootExists,
    resultFileCount: mappingResult.summary.resultFileCount,
    predictionFileCount: mappingResult.summary.predictionFileCount,
    summaryFileCount: mappingResult.summary.summaryFileCount,
    resultRaceCount: countComparison.resultRaceCount,
    predictionRaceCount: countComparison.predictionRaceCount,
    entrySnapshotRaceCount: countComparison.entrySnapshotRaceCount,
    exactStartersSourceRaceCount: countComparison.exactStartersSourceRaceCount,
    predictionDailyRaceCount: countComparison.predictionDailyRaceCount,
    allCountsAligned: countComparison.allCountsAligned,
    duplicateRaceKeyCount: mappingResult.mappingDryRun.candidateDuplicateRaceKeyCount,
    missingCoreFieldCounts,
    sourceFileHashSummary: sourceFileHashSummaryAfter,
    sourceModifiedDuringAudit,
  };
}

function buildCandidatePayloadSafety(mappingResult) {
  const candidatePayloadHash = mappingResult.mappingDryRun.candidatePayloadHash;
  return {
    targetDate: TARGET_DATE,
    candidateItemCount: mappingResult.mappingDryRun.candidateItemCount,
    candidateRaceCount: mappingResult.mappingDryRun.candidateRaceCount,
    candidateVenueCount: mappingResult.mappingDryRun.candidateVenueCount,
    candidateSettledRaceCount: mappingResult.mappingDryRun.candidateSettledRaceCount,
    candidateCancelledRaceCount: mappingResult.mappingDryRun.candidateCancelledRaceCount,
    candidatePredictionLinkedRaceCount: mappingResult.mappingDryRun.candidatePredictionLinkedRaceCount,
    candidateMissingPredictionRaceCount: mappingResult.mappingDryRun.candidateMissingPredictionRaceCount,
    candidateNoStartersMarkerCount: mappingResult.mappingDryRun.candidateNoStartersMarkerCount,
    candidateDuplicateRaceKeyCount: mappingResult.mappingDryRun.candidateDuplicateRaceKeyCount,
    candidateMissingCoreFieldCounts: mappingResult.mappingDryRun.candidateMissingCoreFieldCounts,
    candidateSchemaCompatibility: mappingResult.mappingDryRun.candidateSchemaCompatibility,
    candidatePayloadHash,
    previousDryRunHashExpected: PREVIOUS_DRY_RUN_HASH_EXPECTED,
    previousDryRunHashMatched: candidatePayloadHash === PREVIOUS_DRY_RUN_HASH_EXPECTED,
    hashStabilityNote: "Hash is inherited from the 23-22 deterministic dry-run candidate payload.",
    generatedAtExcludedFromHash: true,
    writePerformed: false,
  };
}

function buildReadiness({
  targetOutputSafety,
  candidatePayloadSafety,
  schemaSafety,
  sourceIntegrity,
  protectedModificationGuard,
}) {
  const secondaryStatuses = [];
  let status = "READY_FOR_HISTORY_DAILY_WRITER_IMPLEMENTATION";

  if (!targetOutputSafety.parentDirExists) {
    status = "NEEDS_PARENT_DIR_CREATION_PLAN";
  } else if (!candidatePayloadSafety.previousDryRunHashMatched) {
    status = "NEEDS_HASH_STABILITY_FIX";
  } else if (schemaSafety.schemaCompatibility === "incompatible") {
    status = "NEEDS_SCHEMA_FIX";
  } else if (!sourceIntegrity.allCountsAligned) {
    status = "NEEDS_COUNT_RECONCILIATION";
  } else if (
    targetOutputSafety.targetOutputExists
    && targetOutputSafety.hashMatchesExistingTarget === false
  ) {
    status = "NEEDS_OVERWRITE_DECISION";
  } else if (
    targetOutputSafety.targetOutputExists
    && targetOutputSafety.hashMatchesExistingTarget === true
  ) {
    status = "READY_FOR_HISTORY_DAILY_WRITE_NOOP_SAME_HASH";
  }

  if (protectedModificationGuard.guardStatus !== "pass") {
    status = "BLOCKED";
    secondaryStatuses.push("PROTECTED_MODIFICATION_GUARD_FAILED");
  }
  if (sourceIntegrity.sourceModifiedDuringAudit) {
    status = "BLOCKED";
    secondaryStatuses.push("SOURCE_MODIFIED_DURING_AUDIT");
  }
  return { status, secondaryStatuses };
}

function buildNextActionPlan(readiness) {
  const prohibitedFiles = [
    "public/data/races/**",
    "public/data/analytics/** except explicitly allowed writer output in later step",
    "public/data/reviews/**",
    "private-input/**",
    "src/**",
    "package.json",
  ];
  return [
    {
      stepId: "history-daily-writer-implementation",
      action: "Implement a create-new-file-only history daily writer for targetDate.",
      prerequisiteStatus: readiness.status,
      allowedFiles: ["new writer/checker scripts only"],
      prohibitedFiles,
      readiness: readiness.status === "READY_FOR_HISTORY_DAILY_WRITER_IMPLEMENTATION" ? "ready" : "blocked",
      notes: "Writer must deny overwrite unless the existing file hash is identical.",
    },
    {
      stepId: "history-daily-checker-implementation",
      action: "Implement a checker for the written history daily file.",
      prerequisiteStatus: "history-daily-writer-implementation",
      allowedFiles: ["new checker script only"],
      prohibitedFiles,
      readiness: "future-step",
      notes: "Checker should compare counts, schema, and stable hash after write.",
    },
    {
      stepId: "history-daily-actual-write",
      action: "Write the targetDate history daily file only after writer/checker are in place.",
      prerequisiteStatus: "writer and checker pass",
      allowedFiles: [TARGET_OUTPUT_PATH],
      prohibitedFiles,
      readiness: "future-step",
      notes: "No index update in this step.",
    },
    {
      stepId: "history-index-update-dry-run",
      action: "Dry-run the history index update after daily file exists.",
      prerequisiteStatus: "history-daily file written and checked",
      allowedFiles: ["new index dry-run script only"],
      prohibitedFiles,
      readiness: "future-step",
      notes: "Expected sourceCount becomes 53 and latestDate becomes 2026-06-29.",
    },
    {
      stepId: "history-index-write-safety-audit",
      action: "Audit safety for index write.",
      prerequisiteStatus: "index update dry-run pass",
      allowedFiles: ["new index safety audit script only"],
      prohibitedFiles,
      readiness: "future-step",
      notes: "Index remains read-only until the dedicated writer step.",
    },
    {
      stepId: "history-index-writer-implementation",
      action: "Implement history index writer.",
      prerequisiteStatus: "index write safety audit pass",
      allowedFiles: ["explicitly allowed index writer and index output only"],
      prohibitedFiles,
      readiness: "future-step",
      notes: "Must be separate from this step.",
    },
    {
      stepId: "same-date-bridge-dry-run-rerun",
      action: "Rerun same-date bridge dry-run after history daily/index readiness is complete.",
      prerequisiteStatus: "history daily and index ready",
      allowedFiles: ["dry-run script outputs only if explicitly allowed"],
      prohibitedFiles,
      readiness: "future-step",
      notes: "Bridge writer remains a separate later step.",
    },
  ];
}

function printSection(label, value) {
  console.log(`[${label}]`);
  console.log(JSON.stringify(value, null, 2));
}

export async function auditHistoryDailyWriteSafety() {
  const blockReasonCounts = {};
  const sourceFileHashSummaryBefore = await sourceHashSummary();
  let mappingResult;
  try {
    mappingResult = await auditPrivateRawHistoryDailyMappingDryRun();
  } catch (error) {
    increment(blockReasonCounts, "CANDIDATE_PAYLOAD_REGENERATION_FAILED");
    throw error;
  }
  const sourceFileHashSummaryAfter = await sourceHashSummary();
  const candidatePayloadSafety = buildCandidatePayloadSafety(mappingResult);
  const targetOutputSafety = await buildTargetOutputSafety(
    candidatePayloadSafety.candidatePayloadHash,
    blockReasonCounts,
  );
  const schemaSafety = await buildSchemaSafety(mappingResult, blockReasonCounts);
  const sourceIntegrity = buildSourceIntegrity(
    mappingResult,
    sourceFileHashSummaryBefore,
    sourceFileHashSummaryAfter,
    blockReasonCounts,
  );
  const indexImpactCheck = await buildIndexImpactCheck(blockReasonCounts);
  const protectedModificationGuard = guardFromGitStatus(await gitStatusPorcelain());

  if (mappingResult.summary.fakeCompletionPerformed) increment(blockReasonCounts, "FAKE_COMPLETION_FOUND");
  if (mappingResult.summary.fuzzyMatchingPerformed) increment(blockReasonCounts, "FUZZY_MATCHING_FOUND");
  if (mappingResult.summary.predictionUsedAsResultSource) increment(blockReasonCounts, "PROHIBITED_SOURCE_FOUND");
  if (protectedModificationGuard.analyticsModified) increment(blockReasonCounts, "ANALYTICS_MODIFIED");
  if (protectedModificationGuard.racesModified) increment(blockReasonCounts, "RACES_MODIFIED");
  if (protectedModificationGuard.reviewsTouchedByThisStep) increment(blockReasonCounts, "REVIEWS_MODIFIED_BY_THIS_STEP");
  if (protectedModificationGuard.privateInputModified) increment(blockReasonCounts, "PRIVATE_INPUT_MODIFIED");
  if (protectedModificationGuard.srcModified) increment(blockReasonCounts, "SRC_MODIFIED");
  if (protectedModificationGuard.packageModified) increment(blockReasonCounts, "PACKAGE_MODIFIED");
  if (protectedModificationGuard.existingScriptModified) increment(blockReasonCounts, "EXISTING_SCRIPT_MODIFIED");
  if (protectedModificationGuard.stagedFiles.length) increment(blockReasonCounts, "UNEXPECTED_FILE_STAGED");

  const historyDailyWriteSafetyReadiness = buildReadiness({
    targetOutputSafety,
    candidatePayloadSafety,
    schemaSafety,
    sourceIntegrity,
    protectedModificationGuard,
  });

  const normalizedBlockReasonCounts = normalizeBlockReasons(blockReasonCounts);
  const summary = {
    targetDate: TARGET_DATE,
    targetOutputPath: TARGET_OUTPUT_PATH,
    targetOutputExists: targetOutputSafety.targetOutputExists,
    parentDirExists: targetOutputSafety.parentDirExists,
    writeAllowedNow: targetOutputSafety.writeAllowedNow,
    writePerformed: false,
    candidateRaceCount: candidatePayloadSafety.candidateRaceCount,
    candidateVenueCount: candidatePayloadSafety.candidateVenueCount,
    candidatePredictionLinkedRaceCount: candidatePayloadSafety.candidatePredictionLinkedRaceCount,
    candidateNoStartersMarkerCount: candidatePayloadSafety.candidateNoStartersMarkerCount,
    candidateSchemaCompatibility: candidatePayloadSafety.candidateSchemaCompatibility,
    candidatePayloadHash: candidatePayloadSafety.candidatePayloadHash,
    previousDryRunHashMatched: candidatePayloadSafety.previousDryRunHashMatched,
    allCountsAligned: sourceIntegrity.allCountsAligned,
    targetDateIndexEntryExists: indexImpactCheck.targetDateIndexEntryExists,
    indexUpdatePerformed: false,
    historyDailyWriteSafetyReadiness,
    blockReasonCounts: normalizedBlockReasonCounts,
    analyticsModified: protectedModificationGuard.analyticsModified,
    racesModified: protectedModificationGuard.racesModified,
    reviewsModifiedByThisStep: protectedModificationGuard.reviewsTouchedByThisStep,
    privateInputModified: protectedModificationGuard.privateInputModified,
    srcModified: protectedModificationGuard.srcModified,
    packageModified: protectedModificationGuard.packageModified,
    existingScriptModified: protectedModificationGuard.existingScriptModified,
    fakeCompletionPerformed: false,
    fuzzyMatchingPerformed: false,
    predictionUsedAsResultSource: false,
    startersIdentityGeneratedFromPrediction: false,
  };

  return {
    summary,
    targetOutputSafety,
    candidatePayloadSafety,
    schemaSafety,
    sourceIntegrity,
    indexImpactCheck,
    protectedModificationGuard,
    nextActionPlan: buildNextActionPlan(historyDailyWriteSafetyReadiness),
    jsonSummary: {
      targetDate: TARGET_DATE,
      targetOutputPath: TARGET_OUTPUT_PATH,
      writeAllowedNow: targetOutputSafety.writeAllowedNow,
      writePerformed: false,
      candidatePayloadHash: candidatePayloadSafety.candidatePayloadHash,
      previousDryRunHashMatched: candidatePayloadSafety.previousDryRunHashMatched,
      allCountsAligned: sourceIntegrity.allCountsAligned,
      status: historyDailyWriteSafetyReadiness.status,
      secondaryStatuses: historyDailyWriteSafetyReadiness.secondaryStatuses,
      blockReasonCounts: normalizedBlockReasonCounts,
    },
  };
}

async function main() {
  const result = await auditHistoryDailyWriteSafety();
  printSection("summary", result.summary);
  printSection("targetOutputSafety", result.targetOutputSafety);
  printSection("candidatePayloadSafety", result.candidatePayloadSafety);
  printSection("schemaSafety", result.schemaSafety);
  printSection("sourceIntegrity", result.sourceIntegrity);
  printSection("indexImpactCheck", result.indexImpactCheck);
  printSection("protectedModificationGuard", result.protectedModificationGuard);
  printSection("nextActionPlan", result.nextActionPlan);
  printSection("jsonSummary", result.jsonSummary);
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  main().catch((error) => {
    console.error("[kurari-ex history daily write safety audit] failed");
    console.error(error);
    process.exitCode = 1;
  });
}
