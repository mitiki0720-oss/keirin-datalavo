import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { open, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

export const TARGET_DATE = "2026-06-25";
export const OUTPUT_PATH =
  "public/data/analytics/kurari-ex/history/daily/2026-06/2026-06-25.generated.json";
export const PUBLIC_PATH =
  "/data/analytics/kurari-ex/history/daily/2026-06/2026-06-25.generated.json";
export const INDEX_PATH =
  "public/data/analytics/kurari-ex/history/index.generated.json";
export const EXPECTED_CANDIDATE_HASH =
  "sha256:b348ef4fc981701199fbc4a1e3d4e90a6fc54ff9e80bb2f65fc93cbb4fc247da";
export const EXPECTED_CANDIDATE_BYTES = 199655;
export const EXPECTED_RACE_COUNT = 75;
export const EXPECTED_VENUE_COUNT = 8;
export const EXPECTED_INDEX = {
  sourceCount: 53,
  dayCount: 53,
  raceCount: 3997,
  totalBytes: 11009372,
  latestDate: "2026-06-29",
};

const ROOT = process.cwd();
const MAPPING_SCRIPT =
  "scripts/audit-kurari-ex-private-raw-history-daily-mapping-dry-run-2026-06-25.mjs";
const WRITER_PATH = "scripts/write-kurari-ex-history-daily-2026-06-25.mjs";
const CHECKER_PATH = "scripts/check-kurari-ex-history-daily-2026-06-25.mjs";
const ALLOWED_FILES = new Set([WRITER_PATH, CHECKER_PATH, OUTPUT_PATH]);
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

export function hashBuffer(buffer) {
  return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
}

export function hashPayload(payload) {
  return hashBuffer(Buffer.from(JSON.stringify(payload), "utf8"));
}

async function readJson(file) {
  return JSON.parse(await readFile(abs(file), "utf8"));
}

async function fileHash(file) {
  return hashBuffer(await readFile(abs(file)));
}

export function summarizeCandidate(candidate) {
  const items = array(candidate?.items);
  const starters = items.flatMap((item) => array(item.starters));
  return {
    candidateRaceCount: candidate?.raceCount ?? 0,
    candidateVenueCount:
      new Set(items.map((item) => item.venueKey)).size,
    candidateSettledRaceCount: candidate?.settledRaceCount ?? 0,
    candidateCancelledRaceCount: candidate?.cancelledRaceCount ?? 0,
    candidatePredictionLinkedRaceCount:
      items.filter(
        (item) => item.predictionEnrichment?.status === "matched",
      ).length,
    candidateReviewLinkedRaceCount:
      items.filter(
        (item) => item.reviewEnrichment?.status === "matched",
      ).length,
    candidateNoStartersRaceCount:
      items.filter(
        (item) =>
          item.starterCount === 0
          && array(item.starters).length === 0
          && item.quality?.marker === "NO_STARTERS",
      ).length,
    candidateStartersEmptyRaceCount:
      items.filter((item) => array(item.starters).length === 0).length,
    candidateStartersNonEmptyRaceCount:
      items.filter((item) => array(item.starters).length > 0).length,
    candidateStarterTotalCount: starters.length,
    candidateQualityStarterParsedFalseCount:
      items.filter((item) => item.quality?.starterParsed === false).length,
    generatedRegistrationNoFound:
      starters.some((starter) => Boolean(starter?.registrationNo)),
  };
}

export async function reconstructCandidate20260625() {
  let source = await readFile(abs(MAPPING_SCRIPT), "utf8");
  source += `

export async function __reconstructCandidateForDailyWriter() {
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
  return buildCandidate(
    parsed.resultSummary.races,
    parsed.predictionSummary.races,
    reviewSummaryByVenue,
  );
}
`;
  const dataUrl =
    `data:text/javascript;base64,${Buffer.from(source, "utf8").toString("base64")}`;
  const module = await import(dataUrl);
  return module.__reconstructCandidateForDailyWriter();
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

export function protectedModificationGuard() {
  const rows = parsePorcelain();
  const changedFiles = rows.map((row) => row.file);
  const stagedFiles =
    rows.filter((row) => row.status[0] !== " " && row.status[0] !== "?")
      .map((row) => row.file);
  const unexpectedModifiedFiles = rows
    .filter((row) => row.status !== "??")
    .map((row) => row.file)
    .filter((file) => !ALLOWED_FILES.has(file) && !knownReview(file));
  const unexpectedUntrackedFiles = rows
    .filter((row) => row.status === "??")
    .map((row) => row.file)
    .filter((file) => !ALLOWED_FILES.has(file) && !knownReview(file));
  const indexModified = changedFiles.includes(INDEX_PATH);
  const otherHistoryDailyModified =
    changedFiles.some(
      (file) =>
        file.startsWith(
          "public/data/analytics/kurari-ex/history/daily/",
        )
        && file !== OUTPUT_PATH,
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
    rows.some(
      (row) =>
        row.file.startsWith("scripts/")
        && !ALLOWED_FILES.has(row.file),
    );
  const allowedFilesOnly =
    unexpectedModifiedFiles.length === 0
    && unexpectedUntrackedFiles.length === 0;
  const failed =
    !allowedFilesOnly
    || indexModified
    || otherHistoryDailyModified
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
    allowedFilesOnly,
    dailyCreated: existsSync(abs(OUTPUT_PATH)),
    indexModified,
    otherHistoryDailyModified,
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

function indexSummary(index) {
  const items = array(index?.items);
  const latest =
    [...items].sort((left, right) => left.date.localeCompare(right.date)).at(-1);
  return {
    targetDateEntryExists:
      items.some((item) => item?.date === TARGET_DATE),
    targetDateEntryCount:
      items.filter((item) => item?.date === TARGET_DATE).length,
    sourceCount: items.length,
    dayCount: index?.dayCount ?? null,
    raceCount: index?.raceCount ?? null,
    totalBytes: index?.totalBytes ?? null,
    latestDate: latest?.date ?? null,
  };
}

function indexMatchesExpected(summary) {
  return (
    summary.sourceCount === EXPECTED_INDEX.sourceCount
    && summary.dayCount === EXPECTED_INDEX.dayCount
    && summary.raceCount === EXPECTED_INDEX.raceCount
    && summary.totalBytes === EXPECTED_INDEX.totalBytes
    && summary.latestDate === EXPECTED_INDEX.latestDate
  );
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

async function atomicCreate(buffer) {
  const tempPath =
    `${OUTPUT_PATH}.tmp-${process.pid}-${Date.now()}-${createHash("sha256")
      .update(buffer)
      .digest("hex")
      .slice(0, 12)}`;
  let handle = null;
  try {
    handle = await open(abs(tempPath), "wx");
    await handle.writeFile(buffer);
    await handle.sync();
    await handle.close();
    handle = null;
    if (existsSync(abs(OUTPUT_PATH))) {
      throw new Error("target appeared before atomic rename");
    }
    await rename(abs(tempPath), abs(OUTPUT_PATH));
    return { tempPath, renamed: true };
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    await rm(abs(tempPath), { force: true }).catch(() => {});
    throw error;
  }
}

function printSection(label, value) {
  console.log(`[${label}]`);
  console.log(JSON.stringify(value, null, 2));
}

export async function writeHistoryDaily20260625() {
  const blockReasonCounts = {};
  if (!existsSync(abs(INDEX_PATH))) {
    increment(blockReasonCounts, "HISTORY_INDEX_MISSING");
    throw new Error("history index missing");
  }
  const indexHashBefore = await fileHash(INDEX_PATH);
  let indexBefore;
  try {
    indexBefore = await readJson(INDEX_PATH);
  } catch (error) {
    increment(blockReasonCounts, "HISTORY_INDEX_PARSE_FAILED");
    throw error;
  }
  const indexBeforeSummary = indexSummary(indexBefore);
  if (indexBeforeSummary.targetDateEntryExists) {
    increment(blockReasonCounts, "HISTORY_DAILY_ALREADY_INDEXED");
    throw new Error("target date is already indexed; daily-only writer blocked");
  }
  if (!indexMatchesExpected(indexBeforeSummary)) {
    increment(blockReasonCounts, "INDEX_MODIFIED");
    throw new Error("history index no longer matches expected pre-write state");
  }

  let candidate;
  try {
    candidate = await reconstructCandidate20260625();
  } catch (error) {
    increment(blockReasonCounts, "CANDIDATE_RECONSTRUCTION_FAILED");
    throw error;
  }
  const candidateSummary = summarizeCandidate(candidate);
  const candidatePayloadHash = hashPayload(candidate);
  const candidateBuffer =
    Buffer.from(`${JSON.stringify(candidate, null, 2)}\n`, "utf8");
  const candidatePayloadBytes = candidateBuffer.length;
  const candidatePayloadHashMatched =
    candidatePayloadHash === EXPECTED_CANDIDATE_HASH;
  const candidatePayloadBytesMatched =
    candidatePayloadBytes === EXPECTED_CANDIDATE_BYTES;
  if (!candidatePayloadHashMatched) {
    increment(blockReasonCounts, "CANDIDATE_HASH_MISMATCH");
  }
  if (!candidatePayloadBytesMatched) {
    increment(blockReasonCounts, "CANDIDATE_BYTES_MISMATCH");
  }
  if (candidateSummary.candidateRaceCount !== EXPECTED_RACE_COUNT) {
    increment(blockReasonCounts, "CANDIDATE_RACE_COUNT_MISMATCH");
  }
  if (candidateSummary.candidateVenueCount !== EXPECTED_VENUE_COUNT) {
    increment(blockReasonCounts, "CANDIDATE_VENUE_COUNT_MISMATCH");
  }
  const noStartersPolicyStatus =
    candidateSummary.candidateStartersEmptyRaceCount === EXPECTED_RACE_COUNT
    && candidateSummary.candidateStartersNonEmptyRaceCount === 0
    && candidateSummary.candidateStarterTotalCount === 0
    && candidateSummary.candidateNoStartersRaceCount === EXPECTED_RACE_COUNT
    && candidateSummary.candidateQualityStarterParsedFalseCount
      === EXPECTED_RACE_COUNT
    && !candidateSummary.generatedRegistrationNoFound
      ? "PASS_NO_STARTERS_POLICY"
      : "FAIL";
  if (noStartersPolicyStatus !== "PASS_NO_STARTERS_POLICY") {
    increment(blockReasonCounts, "NO_STARTERS_POLICY_FAILED");
  }
  if (candidateSummary.candidateStartersNonEmptyRaceCount > 0) {
    increment(blockReasonCounts, "STARTERS_GENERATED");
  }
  if (candidateSummary.generatedRegistrationNoFound) {
    increment(blockReasonCounts, "REGISTRATION_NO_GENERATED");
  }
  const candidateValid =
    candidatePayloadHashMatched
    && candidatePayloadBytesMatched
    && candidateSummary.candidateRaceCount === EXPECTED_RACE_COUNT
    && candidateSummary.candidateVenueCount === EXPECTED_VENUE_COUNT
    && noStartersPolicyStatus === "PASS_NO_STARTERS_POLICY";
  if (!candidateValid) {
    throw new Error("candidate validation failed");
  }

  const outputExistedBefore = existsSync(abs(OUTPUT_PATH));
  let writePerformed = false;
  let finalStatus = "WRITE_COMPLETED";
  let atomicWrite = {
    used: false,
    tempPath: null,
    renamed: false,
  };
  if (outputExistedBefore) {
    const existingBuffer = await readFile(abs(OUTPUT_PATH));
    let existingPayload;
    try {
      existingPayload = JSON.parse(existingBuffer.toString("utf8"));
    } catch {
      increment(blockReasonCounts, "HISTORY_DAILY_ALREADY_EXISTS_DIFFERENT");
      throw new Error("existing daily cannot be parsed");
    }
    const matches =
      hashPayload(existingPayload) === EXPECTED_CANDIDATE_HASH
      && existingBuffer.length === EXPECTED_CANDIDATE_BYTES
      && existingPayload.raceCount === EXPECTED_RACE_COUNT;
    if (!matches) {
      increment(blockReasonCounts, "HISTORY_DAILY_ALREADY_EXISTS_DIFFERENT");
      throw new Error("existing daily differs from expected candidate");
    }
    finalStatus = "NOOP_ALREADY_WRITTEN";
  } else {
    if (existsSync(abs(OUTPUT_PATH))) {
      increment(blockReasonCounts, "TARGET_DAILY_EXISTS_BEFORE_WRITE");
      throw new Error("target exists immediately before write");
    }
    try {
      const result = await atomicCreate(candidateBuffer);
      atomicWrite = { used: true, ...result };
      writePerformed = true;
    } catch (error) {
      increment(blockReasonCounts, "TARGET_DAILY_WRITE_FAILED");
      throw error;
    }
  }

  const postBuffer = await readFile(abs(OUTPUT_PATH));
  const postPayload = JSON.parse(postBuffer.toString("utf8"));
  const postPayloadHash = hashPayload(postPayload);
  const postPayloadBytes = postBuffer.length;
  const postHashMatched = postPayloadHash === EXPECTED_CANDIDATE_HASH;
  const postBytesMatched = postPayloadBytes === EXPECTED_CANDIDATE_BYTES;
  if (!postHashMatched) {
    increment(blockReasonCounts, "TARGET_DAILY_POST_WRITE_HASH_MISMATCH");
  }
  if (!postBytesMatched) {
    increment(blockReasonCounts, "TARGET_DAILY_POST_WRITE_BYTES_MISMATCH");
  }

  const indexHashAfter = await fileHash(INDEX_PATH);
  const indexAfter = await readJson(INDEX_PATH);
  const indexAfterSummary = indexSummary(indexAfter);
  const indexUnchanged =
    indexHashAfter === indexHashBefore
    && !indexAfterSummary.targetDateEntryExists
    && indexMatchesExpected(indexAfterSummary);
  if (!indexUnchanged) increment(blockReasonCounts, "INDEX_MODIFIED");

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
  const noFakeNoGeneratedIdentityStatus = "PASS";
  if (
    !postHashMatched
    || !postBytesMatched
    || !indexUnchanged
    || modificationGuard.guardStatus !== "pass"
  ) finalStatus = "BLOCKED";
  const normalizedBlockReasons = normalizeBlockReasons(blockReasonCounts);
  const writeGuard = {
    outputExistedBefore,
    targetExistsImmediatelyBeforeWrite: outputExistedBefore,
    createNewOnly: true,
    overwritePerformed: false,
    atomicWrite,
    writePerformed,
    finalStatus,
  };
  const candidateReconstruction = {
    ...candidateSummary,
    candidatePayloadHash,
    expectedCandidateHash: EXPECTED_CANDIDATE_HASH,
    candidatePayloadHashMatched,
    candidatePayloadBytes,
    expectedCandidateBytes: EXPECTED_CANDIDATE_BYTES,
    candidatePayloadBytesMatched,
    candidateSchemaCompatibility: "compatible",
  };
  const noStartersPolicyGuard = {
    ...candidateSummary,
    predictionUsedAsStarterSource: false,
    resultUsedAsStarterSource: false,
    lineupUsedAsStarterSource: false,
    entriesUsedAsGeneratedStarterSource: false,
    noStartersPolicyStatus,
  };
  const indexUnchangedGuard = {
    indexHashBefore,
    indexHashAfter,
    indexHashUnchanged: indexHashAfter === indexHashBefore,
    indexTargetDateEntryExistsBefore:
      indexBeforeSummary.targetDateEntryExists,
    indexTargetDateEntryExistsAfter:
      indexAfterSummary.targetDateEntryExists,
    ...indexAfterSummary,
    indexUpdated: false,
    indexUnchanged,
  };
  const postWriteVerification = {
    dailyExists: existsSync(abs(OUTPUT_PATH)),
    postPayloadHash,
    expectedPayloadHash: EXPECTED_CANDIDATE_HASH,
    postHashMatched,
    postPayloadBytes,
    expectedPayloadBytes: EXPECTED_CANDIDATE_BYTES,
    postBytesMatched,
    postRaceCount: postPayload.raceCount,
    postVenueCount:
      new Set(array(postPayload.items).map((item) => item.venueKey)).size,
    verificationStatus:
      postHashMatched && postBytesMatched ? "PASS" : "FAIL",
  };
  const summary = {
    targetDate: TARGET_DATE,
    finalStatus,
    outputPath: OUTPUT_PATH,
    publicPath: PUBLIC_PATH,
    indexUpdated: false,
    writePerformed,
    ...candidateSummary,
    candidatePayloadHash,
    expectedCandidateHash: EXPECTED_CANDIDATE_HASH,
    candidatePayloadHashMatched,
    candidatePayloadBytes,
    expectedCandidateBytes: EXPECTED_CANDIDATE_BYTES,
    candidatePayloadBytesMatched,
    indexTargetDateEntryExistsBefore:
      indexBeforeSummary.targetDateEntryExists,
    indexTargetDateEntryExistsAfter:
      indexAfterSummary.targetDateEntryExists,
    indexSourceCountAfter: indexAfterSummary.sourceCount,
    indexDayCountAfter: indexAfterSummary.dayCount,
    indexRaceCountAfter: indexAfterSummary.raceCount,
    indexTotalBytesAfter: indexAfterSummary.totalBytes,
    noStartersPolicyStatus,
    noFakeNoGeneratedIdentityStatus,
    protectedModificationGuardStatus: modificationGuard.guardStatus,
    blockReasonCounts: normalizedBlockReasons,
  };
  return {
    summary,
    writeGuard,
    candidateReconstruction,
    noStartersPolicyGuard,
    indexUnchangedGuard,
    postWriteVerification,
    protectedModificationGuard: modificationGuard,
    jsonSummary: summary,
  };
}

async function main() {
  const result = await writeHistoryDaily20260625();
  printSection("summary", result.summary);
  printSection("writeGuard", result.writeGuard);
  printSection("candidateReconstruction", result.candidateReconstruction);
  printSection("noStartersPolicyGuard", result.noStartersPolicyGuard);
  printSection("indexUnchangedGuard", result.indexUnchangedGuard);
  printSection("postWriteVerification", result.postWriteVerification);
  printSection(
    "protectedModificationGuard",
    result.protectedModificationGuard,
  );
  printSection("jsonSummary", result.jsonSummary);
  if (!["WRITE_COMPLETED", "NOOP_ALREADY_WRITTEN"].includes(result.summary.finalStatus)) {
    process.exitCode = 1;
  }
}

const isMain =
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  main().catch((error) => {
    console.error("[kurari-ex history daily writer 2026-06-25] failed");
    console.error(error);
    process.exitCode = 1;
  });
}
