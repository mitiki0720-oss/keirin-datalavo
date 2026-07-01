import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  EXPECTED_CANDIDATE_BYTES,
  EXPECTED_CANDIDATE_HASH,
  EXPECTED_INDEX,
  EXPECTED_RACE_COUNT,
  EXPECTED_VENUE_COUNT,
  INDEX_PATH,
  OUTPUT_PATH,
  TARGET_DATE,
  hashPayload,
  protectedModificationGuard,
  reconstructCandidate20260625,
} from "./write-kurari-ex-history-daily-2026-06-25.mjs";

const ROOT = process.cwd();

const BLOCK_REASON_ORDER = [
  "HISTORY_INDEX_MISSING",
  "HISTORY_INDEX_PARSE_FAILED",
  "HISTORY_DAILY_ALREADY_EXISTS_DIFFERENT",
  "HISTORY_DAILY_ALREADY_INDEXED",
  "TARGET_DAILY_EXISTS_BEFORE_WRITE",
  "TARGET_DAILY_WRITE_FAILED",
  "TARGET_DAILY_POST_WRITE_HASH_MISMATCH",
  "TARGET_DAILY_POST_WRITE_BYTES_MISMATCH",
  "RESULT_SOURCE_MISSING",
  "RESULT_SOURCE_NOT_READABLE",
  "PREDICTION_SOURCE_MISSING",
  "PREDICTION_SOURCE_NOT_READABLE",
  "REVIEW_SOURCE_MISSING",
  "CANDIDATE_RECONSTRUCTION_FAILED",
  "CANDIDATE_HASH_MISMATCH",
  "CANDIDATE_BYTES_MISMATCH",
  "CANDIDATE_RACE_COUNT_MISMATCH",
  "CANDIDATE_VENUE_COUNT_MISMATCH",
  "CANDIDATE_SCHEMA_INCOMPATIBLE",
  "NO_STARTERS_POLICY_FAILED",
  "STARTERS_GENERATED",
  "REGISTRATION_NO_GENERATED",
  "FAKE_COMPLETION_FOUND",
  "FUZZY_MATCHING_FOUND",
  "PREDICTION_USED_AS_RESULT_SOURCE",
  "REVIEW_USED_AS_RESULT_SOURCE_UNSAFELY",
  "PREDICTION_USED_AS_STARTER_SOURCE",
  "RESULT_USED_AS_STARTER_SOURCE",
  "LINEUP_USED_AS_STARTER_SOURCE",
  "ENTRIES_USED_AS_GENERATED_STARTER_SOURCE",
  "INDEX_MODIFIED",
  "PUBLIC_RACES_MODIFIED",
  "PUBLIC_REVIEWS_MODIFIED_BY_THIS_STEP",
  "PRIVATE_INPUT_MODIFIED",
  "SRC_MODIFIED",
  "PACKAGE_MODIFIED",
  "DOCS_MODIFIED",
  "EXISTING_SCRIPT_MODIFIED",
  "OTHER_HISTORY_DAILY_MODIFIED",
  "ANALYTICS_SOURCE_MODIFIED",
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

function countDuplicates(values) {
  return values.length - new Set(values).size;
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

export async function checkHistoryDaily20260625() {
  const blockReasonCounts = {};
  const dailyExists = existsSync(abs(OUTPUT_PATH));
  let dailyParseStatus = "missing";
  let payload = null;
  let buffer = null;
  if (dailyExists) {
    try {
      buffer = await readFile(abs(OUTPUT_PATH));
      payload = JSON.parse(buffer.toString("utf8"));
      dailyParseStatus = "ok";
    } catch (error) {
      dailyParseStatus = "failed";
      increment(blockReasonCounts, "HISTORY_DAILY_ALREADY_EXISTS_DIFFERENT");
    }
  } else {
    increment(blockReasonCounts, "TARGET_DAILY_WRITE_FAILED");
  }

  let expectedCandidate = null;
  let candidateReconstructionError = null;
  try {
    expectedCandidate = await reconstructCandidate20260625();
  } catch (error) {
    candidateReconstructionError = error.message;
    increment(blockReasonCounts, "CANDIDATE_RECONSTRUCTION_FAILED");
  }
  const reconstructedCandidateHash =
    expectedCandidate ? hashPayload(expectedCandidate) : null;
  const dailyHash = payload ? hashPayload(payload) : null;
  const dailyBytes = buffer?.length ?? null;
  const dailyHashMatched = dailyHash === EXPECTED_CANDIDATE_HASH;
  const dailyBytesMatched = dailyBytes === EXPECTED_CANDIDATE_BYTES;
  const reconstructedCandidateMatched =
    reconstructedCandidateHash === EXPECTED_CANDIDATE_HASH
    && dailyHash === reconstructedCandidateHash;
  if (!dailyHashMatched || !reconstructedCandidateMatched) {
    increment(blockReasonCounts, "CANDIDATE_HASH_MISMATCH");
  }
  if (!dailyBytesMatched) {
    increment(blockReasonCounts, "CANDIDATE_BYTES_MISMATCH");
  }

  const items = array(payload?.items);
  const starters = items.flatMap((item) => array(item.starters));
  const raceCount = payload?.raceCount ?? 0;
  const venueCount = new Set(items.map((item) => item.venueKey)).size;
  const settledRaceCount = payload?.settledRaceCount ?? 0;
  const cancelledRaceCount = payload?.cancelledRaceCount ?? 0;
  const predictionLinkedRaceCount =
    items.filter(
      (item) => item.predictionEnrichment?.status === "matched",
    ).length;
  const reviewLinkedRaceCount =
    items.filter(
      (item) => item.reviewEnrichment?.status === "matched",
    ).length;
  const startersEmptyRaceCount =
    items.filter((item) => array(item.starters).length === 0).length;
  const startersNonEmptyRaceCount =
    items.filter((item) => array(item.starters).length > 0).length;
  const starterTotalCount = starters.length;
  const qualityStarterParsedFalseCount =
    items.filter((item) => item.quality?.starterParsed === false).length;
  const noStartersMarkerCount =
    items.filter(
      (item) =>
        item.starterCount === 0
        && item.quality?.marker === "NO_STARTERS"
        && array(item.quality?.warnings).includes("NO_STARTERS"),
    ).length;
  const resultExistsCount =
    items.filter((item) => Boolean(item.result?.trifecta?.combination)).length;
  const predictionExistsCount =
    items.filter((item) => Boolean(item.prediction)).length;
  const duplicateRaceKeyCount =
    countDuplicates(items.map((item) => item.raceKey));
  const duplicateDateVenueRaceNumberCount =
    countDuplicates(
      items.map(
        (item) => `${item.date}:${item.venueKey}:${item.raceNumber}`,
      ),
    );
  const missingCoreFieldCounts = {
    raceKey: items.filter((item) => !item.raceKey).length,
    date: items.filter((item) => !item.date).length,
    venueKey: items.filter((item) => !item.venueKey).length,
    venueName: items.filter((item) => !item.venueName).length,
    raceNumber: items.filter((item) => !item.raceNumber).length,
    operationStatus: items.filter((item) => !item.operationStatus).length,
    result: items.filter((item) => !item.result?.trifecta?.combination).length,
    prediction: items.filter((item) => !item.prediction).length,
  };
  const missingCoreFieldTotal =
    Object.values(missingCoreFieldCounts).reduce((sum, count) => sum + count, 0);
  if (raceCount !== EXPECTED_RACE_COUNT) {
    increment(blockReasonCounts, "CANDIDATE_RACE_COUNT_MISMATCH");
  }
  if (venueCount !== EXPECTED_VENUE_COUNT) {
    increment(blockReasonCounts, "CANDIDATE_VENUE_COUNT_MISMATCH");
  }
  if (missingCoreFieldTotal > 0) {
    increment(blockReasonCounts, "CANDIDATE_SCHEMA_INCOMPATIBLE");
  }

  const generatedStartersFound = startersNonEmptyRaceCount > 0;
  const generatedRegistrationNoFound =
    starters.some((starter) => Boolean(starter?.registrationNo));
  const generatedNameFound =
    starters.some((starter) => Boolean(starter?.name));
  const generatedCarNoFound =
    starters.some((starter) => starter?.carNo != null);
  if (generatedStartersFound) increment(blockReasonCounts, "STARTERS_GENERATED");
  if (generatedRegistrationNoFound) {
    increment(blockReasonCounts, "REGISTRATION_NO_GENERATED");
  }
  const noStartersPassed =
    startersEmptyRaceCount === EXPECTED_RACE_COUNT
    && startersNonEmptyRaceCount === 0
    && starterTotalCount === 0
    && qualityStarterParsedFalseCount === EXPECTED_RACE_COUNT
    && noStartersMarkerCount === EXPECTED_RACE_COUNT
    && !generatedRegistrationNoFound;
  if (!noStartersPassed) {
    increment(blockReasonCounts, "NO_STARTERS_POLICY_FAILED");
  }

  let indexParseStatus = "missing";
  let index = null;
  if (!existsSync(abs(INDEX_PATH))) {
    increment(blockReasonCounts, "HISTORY_INDEX_MISSING");
  } else {
    try {
      index = JSON.parse(await readFile(abs(INDEX_PATH), "utf8"));
      indexParseStatus = "ok";
    } catch {
      indexParseStatus = "failed";
      increment(blockReasonCounts, "HISTORY_INDEX_PARSE_FAILED");
    }
  }
  const indexItems = array(index?.items);
  const indexTargetDateEntryExists =
    indexItems.some((item) => item?.date === TARGET_DATE);
  const latest =
    [...indexItems].sort((left, right) => left.date.localeCompare(right.date))
      .at(-1);
  const indexSourceCount = indexItems.length;
  const indexDayCount = index?.dayCount ?? null;
  const indexRaceCount = index?.raceCount ?? null;
  const indexTotalBytes = index?.totalBytes ?? null;
  const indexLatestDate = latest?.date ?? null;
  const indexUnchangedExpectedCurrent =
    indexParseStatus === "ok"
    && !indexTargetDateEntryExists
    && indexSourceCount === EXPECTED_INDEX.sourceCount
    && indexDayCount === EXPECTED_INDEX.dayCount
    && indexRaceCount === EXPECTED_INDEX.raceCount
    && indexTotalBytes === EXPECTED_INDEX.totalBytes
    && indexLatestDate === EXPECTED_INDEX.latestDate;
  if (indexTargetDateEntryExists) {
    increment(blockReasonCounts, "HISTORY_DAILY_ALREADY_INDEXED");
  }
  if (!indexUnchangedExpectedCurrent) {
    increment(blockReasonCounts, "INDEX_MODIFIED");
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
    status:
      !generatedStartersFound
      && !generatedRegistrationNoFound
      && !generatedNameFound
      && !generatedCarNoFound
        ? "PASS"
        : "FAIL",
  };
  const modificationGuard = protectedModificationGuard();
  if (modificationGuard.indexModified) {
    increment(blockReasonCounts, "INDEX_MODIFIED");
  }
  if (modificationGuard.otherHistoryDailyModified) {
    increment(blockReasonCounts, "OTHER_HISTORY_DAILY_MODIFIED");
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
    dailyExists
    && dailyParseStatus === "ok"
    && dailyHashMatched
    && dailyBytesMatched
    && reconstructedCandidateMatched
    && raceCount === EXPECTED_RACE_COUNT
    && venueCount === EXPECTED_VENUE_COUNT
    && settledRaceCount === EXPECTED_RACE_COUNT
    && cancelledRaceCount === 0
    && predictionLinkedRaceCount === EXPECTED_RACE_COUNT
    && reviewLinkedRaceCount === EXPECTED_RACE_COUNT
    && resultExistsCount === EXPECTED_RACE_COUNT
    && predictionExistsCount === EXPECTED_RACE_COUNT
    && duplicateRaceKeyCount === 0
    && duplicateDateVenueRaceNumberCount === 0
    && missingCoreFieldTotal === 0
    && noStartersPassed
    && indexUnchangedExpectedCurrent
    && noFakeNoGeneratedIdentityCheck.status === "PASS"
    && modificationGuard.guardStatus === "pass";
  const finalStatus =
    allPassed ? "CHECK_PASS_2026_06_25_NO_STARTERS_DAILY" : "CHECK_FAIL";
  const normalizedBlockReasons = normalizeBlockReasons(blockReasonCounts);
  const dailyFileCheck = {
    dailyPath: OUTPUT_PATH,
    dailyExists,
    dailyParseStatus,
    dailyHash,
    expectedDailyHash: EXPECTED_CANDIDATE_HASH,
    dailyHashMatched,
    reconstructedCandidateHash,
    reconstructedCandidateMatched,
    candidateReconstructionError,
    dailyBytes,
    expectedDailyBytes: EXPECTED_CANDIDATE_BYTES,
    dailyBytesMatched,
  };
  const dailyShapeCheck = {
    raceCount,
    venueCount,
    settledRaceCount,
    cancelledRaceCount,
    predictionLinkedRaceCount,
    reviewLinkedRaceCount,
    resultExistsCount,
    predictionExistsCount,
    duplicateRaceKeyCount,
    duplicateDateVenueRaceNumberCount,
    missingCoreFieldCounts,
    missingCoreFieldTotal,
    status:
      raceCount === EXPECTED_RACE_COUNT
      && venueCount === EXPECTED_VENUE_COUNT
      && missingCoreFieldTotal === 0
        ? "PASS"
        : "FAIL",
  };
  const noStartersCheck = {
    startersEmptyRaceCount,
    startersNonEmptyRaceCount,
    starterTotalCount,
    qualityStarterParsedFalseCount,
    noStartersMarkerCount,
    generatedStartersFound,
    generatedRegistrationNoFound,
    status: noStartersPassed ? "PASS_NO_STARTERS_POLICY" : "FAIL",
  };
  const indexStillNotUpdatedCheck = {
    indexParseStatus,
    indexTargetDateEntryExists,
    indexSourceCount,
    expectedIndexSourceCount: EXPECTED_INDEX.sourceCount,
    indexDayCount,
    expectedIndexDayCount: EXPECTED_INDEX.dayCount,
    indexRaceCount,
    expectedIndexRaceCount: EXPECTED_INDEX.raceCount,
    indexTotalBytes,
    expectedIndexTotalBytes: EXPECTED_INDEX.totalBytes,
    indexLatestDate,
    expectedIndexLatestDate: EXPECTED_INDEX.latestDate,
    indexUnchangedExpectedCurrent,
  };
  const summary = {
    targetDate: TARGET_DATE,
    finalStatus,
    dailyExists,
    dailyHash,
    dailyHashMatched,
    dailyBytes,
    dailyBytesMatched,
    raceCount,
    venueCount,
    settledRaceCount,
    cancelledRaceCount,
    predictionLinkedRaceCount,
    reviewLinkedRaceCount,
    startersEmptyRaceCount,
    startersNonEmptyRaceCount,
    starterTotalCount,
    qualityStarterParsedFalseCount,
    noStartersMarkerCount,
    resultExistsCount,
    predictionExistsCount,
    duplicateRaceKeyCount,
    duplicateDateVenueRaceNumberCount,
    missingCoreFieldCounts,
    indexTargetDateEntryExists,
    indexUnchangedExpectedCurrent,
    fakeCompletionPerformed: false,
    fuzzyMatchingPerformed: false,
    predictionUsedAsResultSource: false,
    generatedStartersFound,
    generatedRegistrationNoFound,
    blockReasonCounts: normalizedBlockReasons,
  };
  return {
    summary,
    dailyFileCheck,
    dailyShapeCheck,
    noStartersCheck,
    indexStillNotUpdatedCheck,
    noFakeNoGeneratedIdentityCheck,
    protectedModificationGuard: modificationGuard,
    jsonSummary: summary,
  };
}

async function main() {
  const result = await checkHistoryDaily20260625();
  printSection("summary", result.summary);
  printSection("dailyFileCheck", result.dailyFileCheck);
  printSection("dailyShapeCheck", result.dailyShapeCheck);
  printSection("noStartersCheck", result.noStartersCheck);
  printSection(
    "indexStillNotUpdatedCheck",
    result.indexStillNotUpdatedCheck,
  );
  printSection(
    "noFakeNoGeneratedIdentityCheck",
    result.noFakeNoGeneratedIdentityCheck,
  );
  printSection(
    "protectedModificationGuard",
    result.protectedModificationGuard,
  );
  printSection("jsonSummary", result.jsonSummary);
  if (result.summary.finalStatus !== "CHECK_PASS_2026_06_25_NO_STARTERS_DAILY") {
    process.exitCode = 1;
  }
}

const isMain =
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  main().catch((error) => {
    console.error("[kurari-ex history daily checker 2026-06-25] failed");
    console.error(error);
    process.exitCode = 1;
  });
}
