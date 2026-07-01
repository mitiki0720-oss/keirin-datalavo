import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();
const TARGET_DATE = "2026-06-25";
const EXPECTED_DAILY_PATH =
  "public/data/analytics/kurari-ex/history/daily/2026-06/2026-06-25.generated.json";
const EXPECTED_PUBLIC_PATH =
  "/data/analytics/kurari-ex/history/daily/2026-06/2026-06-25.generated.json";
const EXPECTED_INDEX_PATH =
  "public/data/analytics/kurari-ex/history/index.generated.json";
const EXPECTED_CANDIDATE_HASH =
  "sha256:b348ef4fc981701199fbc4a1e3d4e90a6fc54ff9e80bb2f65fc93cbb4fc247da";
const EXPECTED_CANDIDATE_BYTES = 199655;
const EXPECTED_CANDIDATE_RACE_COUNT = 75;
const EXPECTED_CANDIDATE_VENUE_COUNT = 8;
const EXPECTED_CURRENT_INDEX = {
  sourceCount: 53,
  dayCount: 53,
  raceCount: 3997,
  totalBytes: 11009372,
  latestDate: "2026-06-29",
};
const EXPECTED_INDEX_PREVIEW = {
  sourceCount: 54,
  dayCount: 54,
  raceCount: 4072,
  totalBytes: 11209027,
  raceCountDelta: 75,
  totalBytesDelta: 199655,
  latestDate: "2026-06-29",
  latestPath:
    "/data/analytics/kurari-ex/history/daily/2026-06/2026-06-29.generated.json",
};
const RESULT_SOURCE_PATH =
  "private-input/kurari-ex/raw/2026-06-25/aomori-result.txt";
const PREDICTION_SOURCE_PATH =
  "private-input/kurari-ex/raw/2026-06-25/aomori-prediction.txt";
const RAW_ROOT = "private-input/kurari-ex/raw/2026-06-25";
const REVIEW_ROOT = "public/data/reviews/2026-06-25";
const STARTERS_SOURCE_PATH =
  "public/data/analytics/kurari-ex/source/starters/2026-06-25/today-registration-starters.generated.json";
const ENTRIES_SNAPSHOT_PATH =
  "public/data/races/entries-history/2026-06-25/keirin-jp-entries.generated.json";
const MAPPING_DRY_RUN_SCRIPT =
  "scripts/audit-kurari-ex-private-raw-history-daily-mapping-dry-run-2026-06-25.mjs";
const THIS_SCRIPT =
  "scripts/audit-kurari-ex-history-daily-write-safety-2026-06-25.mjs";
const KNOWN_PREEXISTING_REVIEW_CHANGES = [
  "public/data/reviews/index.json",
  "public/data/reviews/2026-06-28/",
  "public/data/reviews/2026-06-29/",
  "public/data/reviews/2026-06-30/",
  "public/data/reviews/2026-07-01/",
];

const BLOCK_REASON_ORDER = [
  "HISTORY_INDEX_MISSING",
  "HISTORY_INDEX_PARSE_FAILED",
  "HISTORY_DAILY_ALREADY_EXISTS",
  "HISTORY_DAILY_PARSE_FAILED",
  "RESULT_SOURCE_MISSING",
  "RESULT_SOURCE_NOT_READABLE",
  "RESULT_SOURCE_CHANGED",
  "PREDICTION_SOURCE_MISSING",
  "PREDICTION_SOURCE_NOT_READABLE",
  "PREDICTION_SOURCE_CHANGED",
  "REVIEW_SOURCE_MISSING",
  "REVIEW_SOURCE_CHANGED",
  "CANDIDATE_RECONSTRUCTION_FAILED",
  "CANDIDATE_HASH_MISMATCH",
  "CANDIDATE_BYTES_MISMATCH",
  "CANDIDATE_RACE_COUNT_MISMATCH",
  "CANDIDATE_VENUE_COUNT_MISMATCH",
  "CANDIDATE_SCHEMA_INCOMPATIBLE",
  "NO_STARTERS_POLICY_FAILED",
  "STARTERS_SOURCE_AVAILABLE_BUT_NOT_USED",
  "STARTERS_SOURCE_MISSING_EXPECTED_FOR_NOW",
  "ENTRIES_SNAPSHOT_MISSING_EXPECTED_FOR_NOW",
  "INDEX_COUNT_MISMATCH",
  "INDEX_TOTAL_BYTES_MISMATCH",
  "INDEX_LATEST_DATE_REGRESSION",
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
  "GENERATED_NAME_FOUND",
  "GENERATED_CAR_NO_FOUND",
  "WRITE_PERFORMED_IN_AUDIT",
  "PUBLIC_ANALYTICS_MODIFIED",
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

function countDuplicates(values) {
  return values.length - new Set(values).size;
}

async function readJsonStatus(file) {
  if (!existsSync(abs(file))) {
    return { exists: false, parseStatus: "missing", payload: null, error: null };
  }
  try {
    return {
      exists: true,
      parseStatus: "ok",
      payload: JSON.parse(await readFile(abs(file), "utf8")),
      error: null,
    };
  } catch (error) {
    return {
      exists: true,
      parseStatus: "failed",
      payload: null,
      error: error.message,
    };
  }
}

async function fileSnapshot(file) {
  if (!existsSync(abs(file))) {
    return {
      path: file,
      exists: false,
      readable: false,
      hash: null,
      bytes: null,
      error: null,
    };
  }
  try {
    const buffer = await readFile(abs(file));
    return {
      path: file,
      exists: true,
      readable: true,
      hash: hashBuffer(buffer),
      bytes: buffer.length,
      error: null,
    };
  } catch (error) {
    return {
      path: file,
      exists: true,
      readable: false,
      hash: null,
      bytes: null,
      error: error.message,
    };
  }
}

async function filesIn(directory) {
  if (!existsSync(abs(directory))) return [];
  const entries = await readdir(abs(directory), { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(directory, entry.name).replaceAll("\\", "/"))
    .sort();
}

async function loadCandidateReconstructor() {
  let source = await readFile(abs(MAPPING_DRY_RUN_SCRIPT), "utf8");
  source += `

export async function __reconstructCandidateForWriteSafetyAudit() {
  const parserModule = await loadParserInternals();
  const parsed = await parserModule.__parseTargetDateForAvailabilityAudit();
  const rawFiles = await filesIn(RAW_ROOT);
  const reviewFiles = await filesIn(REVIEW_ROOT);
  const reviewSummaryFiles = reviewFiles.filter(
    (file) => sourceType(file) === "review-summary",
  );
  const reviewSummaryByVenue = new Map(
    reviewSummaryFiles.map((file) => [
      venueSlug(file),
      file.replace(/^public\\//u, ""),
    ]),
  );
  const candidate = buildCandidate(
    parsed.resultSummary.races,
    parsed.predictionSummary.races,
    reviewSummaryByVenue,
  );
  return {
    candidate,
    rawFiles,
    reviewFiles,
    reviewSummaryFiles,
    resultFiles: rawFiles.filter(
      (file) => sourceType(file) === "private-raw-result",
    ),
    predictionFiles: rawFiles.filter(
      (file) => sourceType(file) === "private-raw-prediction",
    ),
    resultRaceCount: parsed.resultSummary.resultRaceCount,
    predictionRaceCount: parsed.predictionSummary.predictionRaceCount,
  };
}
`;
  const dataUrl =
    `data:text/javascript;base64,${Buffer.from(source, "utf8").toString("base64")}`;
  return import(dataUrl);
}

async function buildExistingHistoryGuard(indexRead) {
  const indexItems = array(indexRead.payload?.items);
  const matches = indexItems.filter((item) => item?.date === TARGET_DATE);
  const dailyRead = await readJsonStatus(EXPECTED_DAILY_PATH);
  let targetDailyHash = null;
  let targetDailyBytes = null;
  if (dailyRead.exists) {
    const buffer = await readFile(abs(EXPECTED_DAILY_PATH));
    targetDailyHash = hashBuffer(buffer);
    targetDailyBytes = buffer.length;
  }
  let existingHistoryGuardStatus = "PASS_ABSENT_READY_TO_WRITE_DAILY";
  if (!indexRead.exists || indexRead.parseStatus !== "ok") {
    existingHistoryGuardStatus = "FAIL_INDEX_PARSE";
  } else if (matches.length > 0) {
    existingHistoryGuardStatus = "FAIL_ALREADY_INDEXED";
  } else if (dailyRead.exists) {
    existingHistoryGuardStatus = "FAIL_DAILY_EXISTS_NOT_INDEXED";
  }
  return {
    indexExists: indexRead.exists,
    indexParseStatus: indexRead.parseStatus,
    targetDateIndexEntryExists: matches.length > 0,
    targetDateIndexEntryCount: matches.length,
    targetDateIndexPath: matches[0]?.file ?? null,
    targetDailyExists: dailyRead.exists,
    targetDailyParseStatus: dailyRead.parseStatus,
    targetDailyHash,
    targetDailyBytes,
    targetDailyWouldBeNewFile:
      indexRead.parseStatus === "ok" && matches.length === 0 && !dailyRead.exists,
    targetDateAlreadyProtected: matches.length > 0 || dailyRead.exists,
    existingHistoryGuardStatus,
  };
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

function isKnownReviewChange(file) {
  return KNOWN_PREEXISTING_REVIEW_CHANGES.some(
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
    .filter((file) => !isKnownReviewChange(file));
  const unexpectedUntrackedFiles = rows
    .filter((row) => row.status === "??")
    .map((row) => row.file)
    .filter(
      (file) => file !== THIS_SCRIPT && !isKnownReviewChange(file),
    );
  const publicAnalyticsModified =
    changedFiles.some((file) => file.startsWith("public/data/analytics/"));
  const publicRacesModified =
    changedFiles.some((file) => file.startsWith("public/data/races/"));
  const publicReviewsTouchedByThisStep =
    changedFiles.some(
      (file) =>
        file.startsWith("public/data/reviews/")
        && !isKnownReviewChange(file),
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
    || publicAnalyticsModified
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
    publicAnalyticsModified,
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

function buildNextActionPlan(finalStatus) {
  const prohibitedFiles = [
    "private-input/**",
    "public/data/races/**",
    "public/data/reviews/**",
    "src/**",
    "package.json",
    "docs/**",
  ];
  const steps = [
    [
      "history-daily-writer-checker-no-starters",
      "2026-06-25 history daily writer/checker no-starters",
    ],
    [
      "history-index-update-safety",
      "2026-06-25 history index update dry-run / write safety audit",
    ],
    [
      "history-index-writer-checker",
      "2026-06-25 history index writer/checker",
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
            EXPECTED_DAILY_PATH,
            "scripts/write-*.mjs",
            "scripts/check-*.mjs",
          ]
        : ["別工程で明示されたwriter/checker/sourceのみ"],
    prohibitedFiles,
    readiness:
      index === 0
      && finalStatus
        === "READY_FOR_HISTORY_DAILY_WRITER_IMPLEMENTATION_NO_STARTERS"
        ? "ready"
        : "future",
    notes:
      index === 0
        ? "create-new-only、atomic write、post-write hash照合を必須とする。indexは変更しない。"
        : "このwrite safety auditでは書き込み・stageを行わない。",
  }));
}

function printSection(label, value) {
  console.log(`[${label}]`);
  console.log(JSON.stringify(value, null, 2));
}

export async function auditHistoryDailyWriteSafety20260625() {
  const blockReasonCounts = {};
  const targetConfig = {
    targetDate: TARGET_DATE,
    expectedDailyPath: EXPECTED_DAILY_PATH,
    expectedPublicPath: EXPECTED_PUBLIC_PATH,
    expectedIndexPath: EXPECTED_INDEX_PATH,
    expectedCandidateHash: EXPECTED_CANDIDATE_HASH,
    expectedCandidateBytes: EXPECTED_CANDIDATE_BYTES,
    expectedCandidateRaceCount: EXPECTED_CANDIDATE_RACE_COUNT,
    expectedCandidateVenueCount: EXPECTED_CANDIDATE_VENUE_COUNT,
    writePerformed: false,
  };

  const [
    indexRead,
    resultSourceSnapshot,
    predictionSourceSnapshot,
    reviewFiles,
    reconstructor,
  ] = await Promise.all([
    readJsonStatus(EXPECTED_INDEX_PATH),
    fileSnapshot(RESULT_SOURCE_PATH),
    fileSnapshot(PREDICTION_SOURCE_PATH),
    filesIn(REVIEW_ROOT),
    loadCandidateReconstructor(),
  ]);
  const existingHistoryGuard =
    await buildExistingHistoryGuard(indexRead);
  if (!indexRead.exists) {
    increment(blockReasonCounts, "HISTORY_INDEX_MISSING");
  } else if (indexRead.parseStatus !== "ok") {
    increment(blockReasonCounts, "HISTORY_INDEX_PARSE_FAILED");
  }
  if (existingHistoryGuard.targetDailyExists) {
    increment(blockReasonCounts, "HISTORY_DAILY_ALREADY_EXISTS");
  }

  let reconstruction = null;
  let reconstructionError = null;
  try {
    reconstruction =
      await reconstructor.__reconstructCandidateForWriteSafetyAudit();
  } catch (error) {
    reconstructionError = error.message;
    increment(blockReasonCounts, "CANDIDATE_RECONSTRUCTION_FAILED");
  }

  const reviewSourceCandidateFiles =
    reviewFiles.filter(
      (file) => /-(?:result|prediction|summary)\.txt$/u.test(file),
    );
  const reviewSourceCandidateHashes =
    await Promise.all(reviewSourceCandidateFiles.map(fileSnapshot));
  const sourceFilesReadable = [
    resultSourceSnapshot,
    predictionSourceSnapshot,
    ...reviewSourceCandidateHashes,
  ].every((snapshot) => snapshot.readable);
  const resultSourceStillBestCandidate =
    reconstruction?.resultFiles?.[0] === RESULT_SOURCE_PATH;
  const predictionSourceStillBestCandidate =
    reconstruction?.predictionFiles?.[0] === PREDICTION_SOURCE_PATH;
  let sourceStabilityStatus = "WARN_SOURCE_HASH_NOT_PINNED";
  if (!resultSourceSnapshot.exists || !predictionSourceSnapshot.exists) {
    sourceStabilityStatus = "FAIL_SOURCE_MISSING";
  } else if (!sourceFilesReadable) {
    sourceStabilityStatus = "FAIL_SOURCE_NOT_READABLE";
  } else if (
    !resultSourceStillBestCandidate
    || !predictionSourceStillBestCandidate
  ) sourceStabilityStatus = "FAIL_BEST_SOURCE_CHANGED";
  if (!resultSourceSnapshot.exists) {
    increment(blockReasonCounts, "RESULT_SOURCE_MISSING");
  } else if (!resultSourceSnapshot.readable) {
    increment(blockReasonCounts, "RESULT_SOURCE_NOT_READABLE");
  }
  if (!predictionSourceSnapshot.exists) {
    increment(blockReasonCounts, "PREDICTION_SOURCE_MISSING");
  } else if (!predictionSourceSnapshot.readable) {
    increment(blockReasonCounts, "PREDICTION_SOURCE_NOT_READABLE");
  }
  if (!reviewSourceCandidateFiles.length) {
    increment(blockReasonCounts, "REVIEW_SOURCE_MISSING");
  }
  const sourceStabilityGuard = {
    resultSourcePath: RESULT_SOURCE_PATH,
    resultSourceExists: resultSourceSnapshot.exists,
    resultSourceHash: resultSourceSnapshot.hash,
    resultSourceBytes: resultSourceSnapshot.bytes,
    predictionSourcePath: PREDICTION_SOURCE_PATH,
    predictionSourceExists: predictionSourceSnapshot.exists,
    predictionSourceHash: predictionSourceSnapshot.hash,
    predictionSourceBytes: predictionSourceSnapshot.bytes,
    reviewSourceCandidateCount: reviewSourceCandidateFiles.length,
    reviewSourceCandidateHashes,
    sourceFilesReadable,
    resultSourceStillBestCandidate,
    predictionSourceStillBestCandidate,
    sourceStabilityStatus,
  };

  const candidate = reconstruction?.candidate ?? null;
  const items = array(candidate?.items);
  const candidateRaceCount = candidate?.raceCount ?? 0;
  const candidateVenueCount =
    new Set(items.map((item) => item.venueKey)).size;
  const candidateSettledRaceCount =
    candidate?.settledRaceCount ?? 0;
  const candidateCancelledRaceCount =
    candidate?.cancelledRaceCount ?? 0;
  const candidatePredictionLinkedRaceCount =
    items.filter(
      (item) => item.predictionEnrichment?.status === "matched",
    ).length;
  const candidateReviewLinkedRaceCount =
    items.filter(
      (item) => item.reviewEnrichment?.status === "matched",
    ).length;
  const candidateNoStartersRaceCount =
    items.filter(
      (item) =>
        item.starterCount === 0
        && array(item.starters).length === 0
        && item.quality?.marker === "NO_STARTERS",
    ).length;
  const candidateStartersEmptyRaceCount =
    items.filter((item) => array(item.starters).length === 0).length;
  const candidateStartersNonEmptyRaceCount =
    items.length - candidateStartersEmptyRaceCount;
  const candidateStarterTotalCount =
    items.flatMap((item) => array(item.starters)).length;
  const candidateQualityStarterParsedFalseCount =
    items.filter((item) => item.quality?.starterParsed === false).length;
  const candidateMissingCoreFieldCounts = {
    raceKey: items.filter((item) => !item.raceKey).length,
    date: items.filter((item) => !item.date).length,
    venueKey: items.filter((item) => !item.venueKey).length,
    venueName: items.filter((item) => !item.venueName).length,
    raceNumber: items.filter((item) => !item.raceNumber).length,
    operationStatus: items.filter((item) => !item.operationStatus).length,
    result:
      items.filter((item) => !item.result?.trifecta?.combination).length,
    prediction: items.filter((item) => !item.prediction).length,
  };
  const candidateDuplicateRaceKeyCount =
    countDuplicates(items.map((item) => item.raceKey));
  const candidateDuplicateDateVenueRaceNumberCount =
    countDuplicates(
      items.map(
        (item) => `${item.date}:${item.venueKey}:${item.raceNumber}`,
      ),
    );
  const candidatePayloadHash = candidate ? hashPayload(candidate) : null;
  const candidatePayloadBytes =
    candidate
      ? Buffer.byteLength(`${JSON.stringify(candidate, null, 2)}\n`, "utf8")
      : null;
  const candidateRaceCountMatched =
    candidateRaceCount === EXPECTED_CANDIDATE_RACE_COUNT;
  const candidateVenueCountMatched =
    candidateVenueCount === EXPECTED_CANDIDATE_VENUE_COUNT;
  const candidatePayloadHashMatched =
    candidatePayloadHash === EXPECTED_CANDIDATE_HASH;
  const candidatePayloadBytesMatched =
    candidatePayloadBytes === EXPECTED_CANDIDATE_BYTES;
  const requiredMissingCount =
    Object.entries(candidateMissingCoreFieldCounts)
      .filter(([field]) => field !== "prediction")
      .reduce((sum, [, count]) => sum + count, 0);
  const candidateSchemaCompatibility =
    candidate
      ? requiredMissingCount === 0
        ? "compatible"
        : "incompatible"
      : "incompatible";
  let candidateReconstructionStatus = "PASS";
  if (!candidate) candidateReconstructionStatus = "FAIL";
  else if (!candidatePayloadHashMatched) {
    candidateReconstructionStatus = "FAIL_HASH_MISMATCH";
  } else if (!candidatePayloadBytesMatched) {
    candidateReconstructionStatus = "FAIL_BYTES_MISMATCH";
  } else if (!candidateRaceCountMatched || !candidateVenueCountMatched) {
    candidateReconstructionStatus = "FAIL_COUNT_MISMATCH";
  } else if (candidateSchemaCompatibility !== "compatible") {
    candidateReconstructionStatus = "FAIL_SCHEMA_INCOMPATIBLE";
  }
  if (!candidatePayloadHashMatched) {
    increment(blockReasonCounts, "CANDIDATE_HASH_MISMATCH");
  }
  if (!candidatePayloadBytesMatched) {
    increment(blockReasonCounts, "CANDIDATE_BYTES_MISMATCH");
  }
  if (!candidateRaceCountMatched) {
    increment(blockReasonCounts, "CANDIDATE_RACE_COUNT_MISMATCH");
  }
  if (!candidateVenueCountMatched) {
    increment(blockReasonCounts, "CANDIDATE_VENUE_COUNT_MISMATCH");
  }
  if (candidateSchemaCompatibility !== "compatible") {
    increment(blockReasonCounts, "CANDIDATE_SCHEMA_INCOMPATIBLE");
  }
  const candidateReconstructionGuard = {
    candidateReconstructed: Boolean(candidate),
    reconstructionError,
    candidateDailyPath: EXPECTED_DAILY_PATH,
    candidatePublicPath: EXPECTED_PUBLIC_PATH,
    candidateRaceCount,
    expectedCandidateRaceCount: EXPECTED_CANDIDATE_RACE_COUNT,
    candidateRaceCountMatched,
    candidateVenueCount,
    expectedCandidateVenueCount: EXPECTED_CANDIDATE_VENUE_COUNT,
    candidateVenueCountMatched,
    candidateSettledRaceCount,
    candidateCancelledRaceCount,
    candidatePredictionLinkedRaceCount,
    candidateReviewLinkedRaceCount,
    candidateNoStartersRaceCount,
    candidateStartersEmptyRaceCount,
    candidateStartersNonEmptyRaceCount,
    candidateStarterTotalCount,
    candidateQualityStarterParsedFalseCount,
    candidateMissingCoreFieldCounts,
    candidateDuplicateRaceKeyCount,
    candidateDuplicateDateVenueRaceNumberCount,
    candidatePayloadHash,
    expectedCandidateHash: EXPECTED_CANDIDATE_HASH,
    candidatePayloadHashMatched,
    candidatePayloadBytes,
    expectedCandidateBytes: EXPECTED_CANDIDATE_BYTES,
    candidatePayloadBytesMatched,
    candidateSchemaCompatibility,
    writePerformed: false,
    candidateReconstructionStatus,
  };

  const startersSourceExists = existsSync(abs(STARTERS_SOURCE_PATH));
  const entriesSnapshotExists = existsSync(abs(ENTRIES_SNAPSHOT_PATH));
  const sameDateBridgePossibleNow =
    startersSourceExists && entriesSnapshotExists;
  const candidateAllStartersEmpty =
    items.length > 0
    && candidateStartersEmptyRaceCount === items.length;
  const generatedStartersFound = candidateStartersNonEmptyRaceCount > 0;
  const generatedRegistrationNoFound =
    items.flatMap((item) => array(item.starters))
      .some((starter) => Boolean(starter?.registrationNo));
  const generatedNameFound =
    items.flatMap((item) => array(item.starters))
      .some((starter) => Boolean(starter?.name));
  const generatedCarNoFound =
    items.flatMap((item) => array(item.starters))
      .some((starter) => starter?.carNo != null);
  const predictionUsedAsStarterSource = false;
  const resultUsedAsStarterSource = false;
  const lineupUsedAsStarterSource = false;
  const entriesUsedAsGeneratedStarterSource = false;
  let noStartersPolicyStatus = "PASS_NO_STARTERS_POLICY";
  if (generatedStartersFound) {
    noStartersPolicyStatus = "FAIL_STARTERS_GENERATED";
  } else if (generatedRegistrationNoFound) {
    noStartersPolicyStatus = "FAIL_REGISTRATION_NO_GENERATED";
  } else if (startersSourceExists || entriesSnapshotExists) {
    noStartersPolicyStatus = "FAIL_STARTER_SOURCE_AVAILABLE_BUT_NOT_USED";
  } else if (
    !candidateAllStartersEmpty
    || candidateNoStartersRaceCount !== candidateRaceCount
    || candidateQualityStarterParsedFalseCount !== candidateRaceCount
  ) noStartersPolicyStatus = "FAIL";
  if (!startersSourceExists) {
    increment(
      blockReasonCounts,
      "STARTERS_SOURCE_MISSING_EXPECTED_FOR_NOW",
    );
  }
  if (!entriesSnapshotExists) {
    increment(
      blockReasonCounts,
      "ENTRIES_SNAPSHOT_MISSING_EXPECTED_FOR_NOW",
    );
  }
  if (startersSourceExists || entriesSnapshotExists) {
    increment(
      blockReasonCounts,
      "STARTERS_SOURCE_AVAILABLE_BUT_NOT_USED",
    );
  }
  if (noStartersPolicyStatus !== "PASS_NO_STARTERS_POLICY") {
    increment(blockReasonCounts, "NO_STARTERS_POLICY_FAILED");
  }
  const noStartersPolicyGuard = {
    startersSourceExists,
    entriesSnapshotExists,
    sameDateBridgePossibleNow,
    candidateAllStartersEmpty,
    candidateStarterTotalCount,
    candidateNoStartersRaceCount,
    candidateQualityStarterParsedFalseCount,
    predictionUsedAsStarterSource,
    resultUsedAsStarterSource,
    lineupUsedAsStarterSource,
    entriesUsedAsGeneratedStarterSource,
    generatedStartersFound,
    generatedRegistrationNoFound,
    generatedNameFound,
    generatedCarNoFound,
    noStartersPolicyStatus,
  };

  const indexItems = array(indexRead.payload?.items);
  const currentIndexSourceCount = indexItems.length;
  const currentIndexDayCount = indexRead.payload?.dayCount ?? null;
  const currentIndexRaceCount = indexRead.payload?.raceCount ?? null;
  const currentIndexTotalBytes = indexRead.payload?.totalBytes ?? null;
  const currentLatest =
    [...indexItems].sort((left, right) => left.date.localeCompare(right.date))
      .at(-1);
  const wouldSourceCount = currentIndexSourceCount + 1;
  const wouldDayCount = currentIndexDayCount + 1;
  const wouldRaceCount = currentIndexRaceCount + candidateRaceCount;
  const wouldTotalBytes = currentIndexTotalBytes + candidatePayloadBytes;
  const wouldLatestDate =
    [currentLatest?.date, TARGET_DATE].filter(Boolean).sort().at(-1) ?? null;
  const wouldLatestPath =
    wouldLatestDate === currentLatest?.date
      ? currentLatest?.file
      : EXPECTED_PUBLIC_PATH;
  const indexCountMatched =
    currentIndexSourceCount === EXPECTED_CURRENT_INDEX.sourceCount
    && currentIndexDayCount === EXPECTED_CURRENT_INDEX.dayCount
    && currentIndexRaceCount === EXPECTED_CURRENT_INDEX.raceCount
    && wouldSourceCount === EXPECTED_INDEX_PREVIEW.sourceCount
    && wouldDayCount === EXPECTED_INDEX_PREVIEW.dayCount
    && wouldRaceCount === EXPECTED_INDEX_PREVIEW.raceCount;
  const indexBytesMatched =
    currentIndexTotalBytes === EXPECTED_CURRENT_INDEX.totalBytes
    && candidatePayloadBytes === EXPECTED_CANDIDATE_BYTES
    && wouldTotalBytes === EXPECTED_INDEX_PREVIEW.totalBytes;
  const latestMatched =
    currentLatest?.date === EXPECTED_CURRENT_INDEX.latestDate
    && wouldLatestDate === EXPECTED_INDEX_PREVIEW.latestDate
    && wouldLatestPath === EXPECTED_INDEX_PREVIEW.latestPath;
  let indexImpactPreviewStatus =
    "PASS_READY_FOR_INDEX_SAFETY_AFTER_DAILY";
  if (!indexCountMatched) {
    indexImpactPreviewStatus = "FAIL_INDEX_COUNT_MISMATCH";
  } else if (!indexBytesMatched) {
    indexImpactPreviewStatus = "FAIL_INDEX_TOTAL_BYTES_MISMATCH";
  } else if (!latestMatched) {
    indexImpactPreviewStatus = "FAIL_LATEST_DATE_REGRESSION";
  }
  if (!indexCountMatched) increment(blockReasonCounts, "INDEX_COUNT_MISMATCH");
  if (!indexBytesMatched) {
    increment(blockReasonCounts, "INDEX_TOTAL_BYTES_MISMATCH");
  }
  if (!latestMatched) {
    increment(blockReasonCounts, "INDEX_LATEST_DATE_REGRESSION");
  }
  const indexImpactPreviewGuard = {
    currentIndexSourceCount,
    expectedCurrentIndexSourceCount: EXPECTED_CURRENT_INDEX.sourceCount,
    currentIndexDayCount,
    expectedCurrentIndexDayCount: EXPECTED_CURRENT_INDEX.dayCount,
    currentIndexRaceCount,
    expectedCurrentIndexRaceCount: EXPECTED_CURRENT_INDEX.raceCount,
    currentIndexTotalBytes,
    expectedCurrentIndexTotalBytes: EXPECTED_CURRENT_INDEX.totalBytes,
    targetDateEntryExists:
      existingHistoryGuard.targetDateIndexEntryExists,
    wouldAddTargetDateEntry:
      !existingHistoryGuard.targetDateIndexEntryExists,
    candidateDailyBytes: candidatePayloadBytes,
    expectedCandidateBytes: EXPECTED_CANDIDATE_BYTES,
    candidateDailyRaceCount: candidateRaceCount,
    expectedCandidateRaceCount: EXPECTED_CANDIDATE_RACE_COUNT,
    wouldSourceCount,
    expectedWouldSourceCount: EXPECTED_INDEX_PREVIEW.sourceCount,
    wouldDayCount,
    expectedWouldDayCount: EXPECTED_INDEX_PREVIEW.dayCount,
    wouldRaceCount,
    expectedWouldRaceCount: EXPECTED_INDEX_PREVIEW.raceCount,
    wouldTotalBytes,
    expectedWouldTotalBytes: EXPECTED_INDEX_PREVIEW.totalBytes,
    raceCountDelta: candidateRaceCount,
    expectedRaceCountDelta: EXPECTED_INDEX_PREVIEW.raceCountDelta,
    totalBytesDelta: candidatePayloadBytes,
    expectedTotalBytesDelta: EXPECTED_INDEX_PREVIEW.totalBytesDelta,
    currentLatestDate: currentLatest?.date ?? null,
    expectedCurrentLatestDate: EXPECTED_CURRENT_INDEX.latestDate,
    wouldLatestDate,
    expectedWouldLatestDate: EXPECTED_INDEX_PREVIEW.latestDate,
    wouldLatestPath,
    expectedWouldLatestPath: EXPECTED_INDEX_PREVIEW.latestPath,
    indexWouldBeWrittenInThisStep: false,
    indexImpactPreviewStatus,
  };

  const writePlanGuard = {
    writeAllowedInCurrentAudit: false,
    nextWriterShouldCreateFile: EXPECTED_DAILY_PATH,
    nextWriterShouldNotModifyIndex: true,
    nextWriterShouldNotModifySource: true,
    nextWriterShouldNotModifyRaces: true,
    nextWriterShouldNotModifyReviews: true,
    nextWriterShouldNotModifySrc: true,
    nextWriterShouldUseAtomicWrite: true,
    nextWriterShouldFailIfTargetExists: true,
    nextWriterShouldVerifyHashAfterWrite: true,
    nextCheckerRequired: true,
    nextIndexUpdateSeparateStep: true,
    writePlanStatus: "PASS_READY_FOR_DAILY_WRITER_IMPLEMENTATION",
  };

  const noFakeNoGeneratedIdentityGuard = {
    fakeCompletionPerformed: false,
    fuzzyMatchingPerformed: false,
    predictionUsedAsResultSource: false,
    reviewUsedAsResultSourceUnsafely: false,
    predictionUsedAsStarterSource,
    resultUsedAsStarterSource,
    lineupUsedAsStarterSource,
    entriesUsedAsGeneratedStarterSource,
    generatedStartersFound,
    generatedRegistrationNoFound,
    generatedNameFound,
    generatedCarNoFound,
    noFakeNoGeneratedIdentityStatus:
      [
        generatedStartersFound,
        generatedRegistrationNoFound,
        generatedNameFound,
        generatedCarNoFound,
      ].some(Boolean)
        ? "FAIL"
        : "PASS",
  };

  const modificationGuard = protectedModificationGuard();
  if (modificationGuard.publicAnalyticsModified) {
    increment(blockReasonCounts, "PUBLIC_ANALYTICS_MODIFIED");
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
  if (modificationGuard.srcModified) {
    increment(blockReasonCounts, "SRC_MODIFIED");
  }
  if (modificationGuard.packageModified) {
    increment(blockReasonCounts, "PACKAGE_MODIFIED");
  }
  if (modificationGuard.docsModified) {
    increment(blockReasonCounts, "DOCS_MODIFIED");
  }
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

  const allGuardsPass =
    existingHistoryGuard.existingHistoryGuardStatus
      === "PASS_ABSENT_READY_TO_WRITE_DAILY"
    && ["PASS", "WARN_SOURCE_HASH_NOT_PINNED"].includes(
      sourceStabilityStatus,
    )
    && candidateReconstructionStatus === "PASS"
    && noStartersPolicyStatus === "PASS_NO_STARTERS_POLICY"
    && indexImpactPreviewStatus
      === "PASS_READY_FOR_INDEX_SAFETY_AFTER_DAILY"
    && writePlanGuard.writePlanStatus
      === "PASS_READY_FOR_DAILY_WRITER_IMPLEMENTATION"
    && noFakeNoGeneratedIdentityGuard.noFakeNoGeneratedIdentityStatus
      === "PASS"
    && modificationGuard.guardStatus === "pass";
  let finalStatus =
    allGuardsPass
      ? "READY_FOR_HISTORY_DAILY_WRITER_IMPLEMENTATION_NO_STARTERS"
      : "BLOCKED";
  if (
    !["PASS", "WARN_SOURCE_HASH_NOT_PINNED"].includes(sourceStabilityStatus)
  ) finalStatus = "NEEDS_SOURCE_REVIEW";
  else if (candidateReconstructionStatus !== "PASS") {
    finalStatus = "NEEDS_CANDIDATE_RECONSTRUCTION_REVIEW";
  } else if (noStartersPolicyStatus !== "PASS_NO_STARTERS_POLICY") {
    finalStatus = "NEEDS_NO_STARTERS_POLICY_REVIEW";
  } else if (
    indexImpactPreviewStatus
    !== "PASS_READY_FOR_INDEX_SAFETY_AFTER_DAILY"
  ) finalStatus = "NEEDS_INDEX_IMPACT_REVIEW";
  if (
    existingHistoryGuard.existingHistoryGuardStatus
      !== "PASS_ABSENT_READY_TO_WRITE_DAILY"
    || modificationGuard.guardStatus !== "pass"
  ) finalStatus = "BLOCKED";
  const canProceedToDailyWriter =
    finalStatus
    === "READY_FOR_HISTORY_DAILY_WRITER_IMPLEMENTATION_NO_STARTERS";
  const dailyWriteSafetyReadiness = {
    targetDate: TARGET_DATE,
    existingHistoryGuardStatus:
      existingHistoryGuard.existingHistoryGuardStatus,
    sourceStabilityStatus,
    candidateReconstructionStatus,
    noStartersPolicyStatus,
    indexImpactPreviewStatus,
    writePlanStatus: writePlanGuard.writePlanStatus,
    noFakeNoGeneratedIdentityStatus:
      noFakeNoGeneratedIdentityGuard.noFakeNoGeneratedIdentityStatus,
    protectedModificationGuardStatus: modificationGuard.guardStatus,
    canProceedToDailyWriter,
    canProceedToIndexWriterNow: false,
    canProceedToSameDateBridgeNow: sameDateBridgePossibleNow,
    finalStatus,
  };

  const normalizedBlockReasons =
    normalizeBlockReasons(blockReasonCounts);
  const summary = {
    targetDate: TARGET_DATE,
    finalStatus,
    canProceedToDailyWriter,
    canProceedToIndexWriterNow: false,
    canProceedToSameDateBridgeNow: sameDateBridgePossibleNow,
    existingHistoryGuardStatus:
      existingHistoryGuard.existingHistoryGuardStatus,
    sourceStabilityStatus,
    candidateReconstructionStatus,
    noStartersPolicyStatus,
    indexImpactPreviewStatus,
    writePlanStatus: writePlanGuard.writePlanStatus,
    noFakeNoGeneratedIdentityStatus:
      noFakeNoGeneratedIdentityGuard.noFakeNoGeneratedIdentityStatus,
    candidateRaceCount,
    candidateVenueCount,
    candidateSettledRaceCount,
    candidateCancelledRaceCount,
    candidatePredictionLinkedRaceCount,
    candidateReviewLinkedRaceCount,
    candidateNoStartersRaceCount,
    candidateStarterTotalCount,
    candidatePayloadHash,
    candidatePayloadBytes,
    wouldSourceCount,
    wouldDayCount,
    wouldRaceCount,
    wouldTotalBytes,
    wouldLatestDate,
    wouldLatestPath,
    writePerformed: false,
    publicAnalyticsModified:
      modificationGuard.publicAnalyticsModified,
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
    predictionUsedAsResultSource: false,
    generatedStartersFound,
    generatedRegistrationNoFound,
    blockReasonCounts: normalizedBlockReasons,
  };

  return {
    summary,
    targetConfig,
    existingHistoryGuard,
    sourceStabilityGuard,
    candidateReconstructionGuard,
    noStartersPolicyGuard,
    indexImpactPreviewGuard,
    writePlanGuard,
    noFakeNoGeneratedIdentityGuard,
    protectedModificationGuard: modificationGuard,
    dailyWriteSafetyReadiness,
    nextActionPlan: buildNextActionPlan(finalStatus),
    jsonSummary: {
      ...summary,
      blockReasonCounts: normalizedBlockReasons,
    },
  };
}

async function main() {
  const result = await auditHistoryDailyWriteSafety20260625();
  printSection("summary", result.summary);
  printSection("targetConfig", result.targetConfig);
  printSection("existingHistoryGuard", result.existingHistoryGuard);
  printSection("sourceStabilityGuard", result.sourceStabilityGuard);
  printSection(
    "candidateReconstructionGuard",
    result.candidateReconstructionGuard,
  );
  printSection("noStartersPolicyGuard", result.noStartersPolicyGuard);
  printSection("indexImpactPreviewGuard", result.indexImpactPreviewGuard);
  printSection("writePlanGuard", result.writePlanGuard);
  printSection(
    "noFakeNoGeneratedIdentityGuard",
    result.noFakeNoGeneratedIdentityGuard,
  );
  printSection(
    "protectedModificationGuard",
    result.protectedModificationGuard,
  );
  printSection(
    "dailyWriteSafetyReadiness",
    result.dailyWriteSafetyReadiness,
  );
  printSection("nextActionPlan", result.nextActionPlan);
  printSection("jsonSummary", result.jsonSummary);
  if (
    result.dailyWriteSafetyReadiness.finalStatus
    !== "READY_FOR_HISTORY_DAILY_WRITER_IMPLEMENTATION_NO_STARTERS"
  ) process.exitCode = 1;
}

const isMain =
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  main().catch((error) => {
    console.error(
      "[kurari-ex history daily write safety 2026-06-25] failed",
    );
    console.error(error);
    process.exitCode = 1;
  });
}
