import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();
const TARGET_DATE = "2026-06-25";
const TARGET_MONTH = TARGET_DATE.slice(0, 7);
const RAW_ROOT = `private-input/kurari-ex/raw/${TARGET_DATE}`;
const REVIEW_ROOT = `public/data/reviews/${TARGET_DATE}`;
const REVIEW_INDEX_PATH = "public/data/reviews/index.json";
const HISTORY_INDEX_PATH =
  "public/data/analytics/kurari-ex/history/index.generated.json";
const EXPECTED_DAILY_PATH =
  `public/data/analytics/kurari-ex/history/daily/${TARGET_MONTH}/${TARGET_DATE}.generated.json`;
const EXPECTED_PUBLIC_PATH =
  `/data/analytics/kurari-ex/history/daily/${TARGET_MONTH}/${TARGET_DATE}.generated.json`;
const STARTERS_SOURCE_PATH =
  `public/data/analytics/kurari-ex/source/starters/${TARGET_DATE}/today-registration-starters.generated.json`;
const STARTERS_INDEX_PATH =
  "public/data/analytics/kurari-ex/source/starters/index.generated.json";
const ENTRIES_SNAPSHOT_PATH =
  `public/data/races/entries-history/${TARGET_DATE}/keirin-jp-entries.generated.json`;
const ENTRIES_INDEX_PATH =
  "public/data/races/entries-history/index.generated.json";
const OFFICIAL_RESULTS_PATH = "public/data/races/keirin-jp-results.generated.json";
const GENERIC_MAPPING_SCRIPT =
  "scripts/audit-kurari-ex-private-raw-history-daily-mapping-dry-run.mjs";
const THIS_SCRIPT =
  "scripts/audit-kurari-ex-private-raw-history-daily-mapping-dry-run-2026-06-25.mjs";
const KNOWN_REVIEW_CHANGES = [
  "public/data/reviews/index.json",
  "public/data/reviews/2026-06-28/",
  "public/data/reviews/2026-06-29/",
  "public/data/reviews/2026-06-30/",
];

const BLOCK_REASON_ORDER = [
  "HISTORY_INDEX_MISSING",
  "HISTORY_INDEX_PARSE_FAILED",
  "HISTORY_DAILY_ALREADY_EXISTS",
  "HISTORY_DAILY_PARSE_FAILED",
  "RESULT_SOURCE_MISSING",
  "RESULT_SOURCE_PARTIAL",
  "RESULT_SOURCE_PARSE_FAILED",
  "PREDICTION_SOURCE_MISSING",
  "PREDICTION_SOURCE_PARTIAL",
  "PREDICTION_MAPPING_PARTIAL",
  "REVIEW_SOURCE_MISSING",
  "REVIEW_SOURCE_PARTIAL",
  "STARTERS_SOURCE_MISSING_EXPECTED_FOR_NOW",
  "ENTRIES_SNAPSHOT_MISSING_EXPECTED_FOR_NOW",
  "EXACT_MAPPING_MISSING_RACE",
  "EXACT_MAPPING_EXTRA_PREDICTION_RACE",
  "AMBIGUOUS_MAPPING_KEY",
  "CROSS_DATE_JOIN_FOUND",
  "CROSS_VENUE_JOIN_FOUND",
  "CANDIDATE_SCHEMA_INCOMPATIBLE",
  "CANDIDATE_COUNT_MISMATCH",
  "FAKE_COMPLETION_FOUND",
  "FUZZY_MATCHING_FOUND",
  "PREDICTION_USED_AS_RESULT_SOURCE",
  "REVIEW_USED_AS_RESULT_SOURCE_UNSAFELY",
  "GENERATED_STARTERS_FOUND",
  "GENERATED_REGISTRATION_NO_FOUND",
  "WRITE_PERFORMED_IN_DRY_RUN",
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

function rel(file) {
  return path.relative(ROOT, file).replaceAll("\\", "/");
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function increment(counter, key, by = 1) {
  counter[key] = (counter[key] ?? 0) + by;
}

function stableHash(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function fileHash(buffer) {
  return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
}

function normalizeText(value) {
  return String(value ?? "")
    .replace(/^\uFEFF/u, "")
    .replace(/\r\n?/gu, "\n")
    .normalize("NFKC");
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

async function filesIn(directory) {
  if (!existsSync(abs(directory))) return [];
  const entries = await readdir(abs(directory), { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(directory, entry.name).replaceAll("\\", "/"))
    .sort();
}

function sourceType(file) {
  if (file.startsWith("private-input/") && /-result\.txt$/u.test(file)) {
    return "private-raw-result";
  }
  if (file.startsWith("private-input/") && /-prediction\.txt$/u.test(file)) {
    return "private-raw-prediction";
  }
  if (file.startsWith("private-input/") && /-summary\.txt$/u.test(file)) {
    return "private-raw-summary";
  }
  if (file.startsWith("public/data/reviews/") && /-result\.txt$/u.test(file)) {
    return "review-result";
  }
  if (file.startsWith("public/data/reviews/") && /-prediction\.txt$/u.test(file)) {
    return "review-prediction";
  }
  if (file.startsWith("public/data/reviews/") && /-summary\.txt$/u.test(file)) {
    return "review-summary";
  }
  return "other";
}

function venueSlug(file) {
  return path.basename(file).replace(/-(?:result|prediction|summary)\.txt$/u, "");
}

function venueNameAndRaceCount(text) {
  const normalized = normalizeText(text);
  const headers = [...normalized.matchAll(/^■\s+(.+?)\s+(\d{1,2})R\s*$/gmu)];
  return {
    venueCount: new Set(headers.map((match) => match[1].trim())).size,
    raceCount: headers.length,
  };
}

async function textCandidate(file, type) {
  try {
    const text = await readFile(abs(file), "utf8");
    const counts = venueNameAndRaceCount(text);
    return {
      path: file,
      sourceType: type,
      parseStatus: counts.raceCount > 0 ? "ok" : "partial",
      dateMatched:
        text.includes(TARGET_DATE) || text.includes(TARGET_DATE.replaceAll("-", "/")),
      venueCount: counts.venueCount || 1,
      raceCount: counts.raceCount,
      confidence: type.startsWith("private-raw-") ? "high" : "medium",
      reasons: [
        type.startsWith("private-raw-")
          ? "target-date private raw source"
          : "target-date public review mirror",
        "date and race headers inspected without fuzzy matching",
      ],
    };
  } catch (error) {
    return {
      path: file,
      sourceType: type,
      parseStatus: "failed",
      dateMatched: false,
      venueCount: 0,
      raceCount: 0,
      confidence: "none",
      reasons: [error.message],
    };
  }
}

async function loadParserInternals() {
  let source = await readFile(abs(GENERIC_MAPPING_SCRIPT), "utf8");
  const original = 'const TARGET_DATE = "2026-06-29";';
  if (!source.includes(original)) {
    throw new Error("generic mapping parser target constant not found");
  }
  source = source.replace(original, `const TARGET_DATE = "${TARGET_DATE}";`);
  source += `

export async function __parseTargetDateForAvailabilityAudit() {
  const blockReasonCounts = {};
  const scan = await privateRawScan(blockReasonCounts);
  const parsedResults = await Promise.all(scan.filesByType.result.map(parseResultFile));
  const parsedPredictions = await Promise.all(scan.filesByType.prediction.map(parsePredictionFile));
  const resultSummary = summarizeParsedResults(parsedResults, blockReasonCounts);
  const predictionSummary = summarizePredictions(parsedPredictions, blockReasonCounts);
  return {
    scan: { ...scan, filesByType: undefined },
    resultSummary,
    predictionSummary,
  };
}
`;
  const url =
    `data:text/javascript;base64,${Buffer.from(source, "utf8").toString("base64")}`;
  return import(url);
}

function reviewIndexItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.entries)) return payload.entries;
  return [];
}

function indexItems(payload, key) {
  return array(payload?.[key]);
}

async function buildHistoryExistingPrecheck(historyIndexRead) {
  const items = array(historyIndexRead.payload?.items);
  const matches = items.filter((item) => item?.date === TARGET_DATE);
  const dailyRead = await readJsonStatus(EXPECTED_DAILY_PATH);
  let existingHistoryStatus = "ABSENT_READY_TO_CREATE";
  if (!historyIndexRead.exists || historyIndexRead.parseStatus !== "ok") {
    existingHistoryStatus = "BLOCKED";
  } else if (matches.length > 0) {
    existingHistoryStatus = "ALREADY_INDEXED_NEEDS_VERIFY";
  } else if (dailyRead.exists) {
    existingHistoryStatus = "DAILY_EXISTS_NOT_INDEXED";
  }
  let targetDailyHash = null;
  let targetDailyBytes = null;
  if (dailyRead.exists) {
    const buffer = await readFile(abs(EXPECTED_DAILY_PATH));
    targetDailyHash = fileHash(buffer);
    targetDailyBytes = buffer.length;
  }
  return {
    indexExists: historyIndexRead.exists,
    indexParseStatus: historyIndexRead.parseStatus,
    targetDateIndexEntryExists: matches.length > 0,
    targetDateIndexEntryCount: matches.length,
    targetDateIndexPath: matches[0]?.file ?? null,
    targetDailyExists: dailyRead.exists,
    targetDailyParseStatus: dailyRead.parseStatus,
    targetDailyHash,
    targetDailyBytes,
    shouldCreateNewDailyLater: existingHistoryStatus === "ABSENT_READY_TO_CREATE",
    shouldSkipBecauseAlreadyExists:
      existingHistoryStatus === "ALREADY_INDEXED_NEEDS_VERIFY"
      || existingHistoryStatus === "DAILY_EXISTS_NOT_INDEXED",
    existingHistoryStatus,
  };
}

function buildCandidate(results, predictions, reviewSummaryByVenue) {
  const predictionByKey = new Map(predictions.map((race) => [race.raceKey, race]));
  const items = results.map((race) => {
    const prediction = predictionByKey.get(race.raceKey) ?? null;
    const summaryFile = reviewSummaryByVenue.get(race.venueKey) ?? null;
    return {
      raceKey: race.raceKey,
      raceId: "",
      date: race.date,
      venueKey: race.venueKey,
      venueName: race.venueName,
      raceNumber: race.raceNumber,
      grade: prediction?.grade ?? "",
      timeslot: prediction?.timeslot ?? "",
      raceClass: prediction?.raceClass || race.raceTitle || "",
      operationStatus: race.operationStatus,
      starterCount: 0,
      starters: [],
      lineup: prediction?.lineup ?? { lines: [], status: "missing" },
      weather: race.weather,
      result: {
        status: race.result.status,
        first: race.result.first,
        second: race.result.second,
        third: race.result.third,
        trifecta: race.result.trifecta,
        exacta: race.result.exacta,
        favoriteTrifecta: race.result.favoriteTrifecta,
        ...(race.result.sRider ? { sRider: race.result.sRider } : {}),
        ...(race.result.bRider ? { bRider: race.result.bRider } : {}),
      },
      prediction: prediction?.prediction ?? null,
      predictionEnrichment: {
        status: prediction ? "matched" : "missing",
        matchedBy: prediction ? "raceKey" : null,
      },
      reviewEnrichment: {
        status: summaryFile ? "matched" : "missing",
        matchedBy: summaryFile ? "date+venueKey" : null,
        summaryFile,
      },
      quality: {
        resultParsed: Boolean(race.result.trifecta?.combination),
        predictionParsed: Boolean(prediction),
        lineupParsed: prediction?.lineup?.status === "parsed",
        starterParsed: false,
        marker: "NO_STARTERS",
        warnings: [
          "NO_STARTERS",
          "starters source missing; starter identity intentionally not generated",
          "entries snapshot missing; registrationNo intentionally not generated",
        ],
      },
    };
  }).sort(
    (left, right) =>
      left.venueKey.localeCompare(right.venueKey)
      || left.raceNumber - right.raceNumber,
  );
  const matchedPredictionRaceCount =
    items.filter((item) => item.predictionEnrichment.status === "matched").length;
  return {
    schemaVersion: 1,
    date: TARGET_DATE,
    raceCount: items.length,
    settledRaceCount:
      items.filter((item) => item.operationStatus === "finished").length,
    cancelledRaceCount:
      items.filter((item) => item.operationStatus === "cancelled").length,
    predictionCoverage: {
      matchedRaceCount: matchedPredictionRaceCount,
      totalRaceCount: items.length,
      coverageRate:
        items.length > 0
          ? Number(((matchedPredictionRaceCount / items.length) * 100).toFixed(1))
          : 0,
      status:
        matchedPredictionRaceCount === items.length ? "complete" : "partial",
    },
    items,
  };
}

function missingCoreFieldCounts(items) {
  return {
    raceKey: items.filter((item) => !item.raceKey).length,
    date: items.filter((item) => !item.date).length,
    venueKey: items.filter((item) => !item.venueKey).length,
    venueName: items.filter((item) => !item.venueName).length,
    raceNumber: items.filter((item) => !item.raceNumber).length,
    operationStatus: items.filter((item) => !item.operationStatus).length,
    result: items.filter((item) => !item.result?.trifecta?.combination).length,
    prediction: items.filter((item) => !item.prediction).length,
  };
}

function countDuplicates(values) {
  return values.length - new Set(values).size;
}

function buildResultPredictionMapping(results, predictions) {
  const resultByKey = new Map();
  const predictionByKey = new Map();
  let ambiguousJoinCount = 0;
  for (const race of results) {
    if (resultByKey.has(race.raceKey)) ambiguousJoinCount += 1;
    resultByKey.set(race.raceKey, race);
  }
  for (const race of predictions) {
    if (predictionByKey.has(race.raceKey)) ambiguousJoinCount += 1;
    predictionByKey.set(race.raceKey, race);
  }
  const matchedKeys =
    [...resultByKey.keys()].filter((key) => predictionByKey.has(key));
  const unmatchedResult =
    [...resultByKey.keys()].filter((key) => !predictionByKey.has(key));
  const unmatchedPrediction =
    [...predictionByKey.keys()].filter((key) => !resultByKey.has(key));
  const crossDateJoinFound =
    matchedKeys.some((key) => !key.startsWith(`${TARGET_DATE}:`));
  const crossVenueJoinFound =
    matchedKeys.some((key) => {
      const result = resultByKey.get(key);
      const prediction = predictionByKey.get(key);
      return result?.venueKey !== prediction?.venueKey;
    });
  let mappingStatus = "COMPLETE";
  if (!predictions.length) mappingStatus = "MISSING_PREDICTION";
  else if (
    unmatchedResult.length
    || unmatchedPrediction.length
    || ambiguousJoinCount
  ) mappingStatus = "PARTIAL";
  if (crossDateJoinFound || crossVenueJoinFound) mappingStatus = "BLOCKED";
  return {
    targetDate: TARGET_DATE,
    resultRaceCount: results.length,
    predictionRaceCount: predictions.length,
    reviewRaceCount: results.length,
    raceKeyDirectMatchedCount: matchedKeys.length,
    dateVenueKeyRaceNumberMatchedCount: 0,
    dateVenueNameRaceNumberMatchedCount: 0,
    matchedPredictionRaceCount: matchedKeys.length,
    unmatchedResultRaceCount: unmatchedResult.length,
    unmatchedPredictionRaceCount: unmatchedPrediction.length,
    ambiguousJoinCount,
    crossDateJoinFound,
    crossVenueJoinFound,
    mappingMethodUsed: ["raceKey"],
    mappingStatus,
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
  const publicAnalyticsModified =
    changedFiles.some((file) => file.startsWith("public/data/analytics/"));
  const publicRacesModified =
    changedFiles.some((file) => file.startsWith("public/data/races/"));
  const privateInputModified =
    changedFiles.some((file) => file.startsWith("private-input/"));
  const srcModified = changedFiles.some((file) => file.startsWith("src/"));
  const packageModified = changedFiles.includes("package.json");
  const docsModified = changedFiles.some((file) => file.startsWith("docs/"));
  const existingScriptModified =
    changedFiles.some(
      (file) => file.startsWith("scripts/") && file !== THIS_SCRIPT,
    );
  const publicReviewsTouchedByThisStep =
    changedFiles.some(
      (file) => file.startsWith("public/data/reviews/") && !knownReview(file),
    );
  const allowedNewScriptOnly =
    rows.some((row) => row.file === THIS_SCRIPT && row.status === "??")
    && unexpectedModifiedFiles.length === 0
    && unexpectedUntrackedFiles.length === 0;
  const fail =
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
    guardStatus: fail ? "fail" : "pass",
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

function nextActionPlan(readinessStatus) {
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
      "history-daily-write-safety-audit-no-starters",
      "2026-06-25 history daily write safety audit no-starters",
    ],
    [
      "history-daily-writer-checker-no-starters",
      "2026-06-25 history daily writer/checker no-starters",
    ],
    [
      "history-index-writer-checker",
      "2026-06-25 history index update writer/checker",
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
    prerequisiteStatus: readinessStatus,
    allowedFiles:
      index === 0
        ? ["scripts/audit-*.mjs", "scripts/check-*.mjs"]
        : ["別工程で明示されたwriter/checker/sourceのみ"],
    prohibitedFiles,
    readiness:
      index === 0
      && readinessStatus
        === "READY_FOR_HISTORY_DAILY_WRITE_SAFETY_AUDIT_NO_STARTERS"
        ? "ready"
        : "future",
    notes:
      index === 3
        ? "history daily NO_STARTERS工程とは分離し、公式同日sourceだけを使う。"
        : "このdry-runでは生成・書き込み・stageを行わない。",
  }));
}

function printSection(label, value) {
  console.log(`[${label}]`);
  console.log(JSON.stringify(value, null, 2));
}

export async function auditPrivateRawHistoryDailyMappingDryRun20260625() {
  const blockReasonCounts = {};
  const targetConfig = {
    targetDate: TARGET_DATE,
    expectedDailyPath: EXPECTED_DAILY_PATH,
    expectedPublicPath: EXPECTED_PUBLIC_PATH,
    expectedIndexPath: HISTORY_INDEX_PATH,
    writePerformed: false,
  };

  const [
    historyIndexRead,
    reviewIndexRead,
    startersIndexRead,
    entriesIndexRead,
    parserModule,
    rawFiles,
    reviewFiles,
    officialResultsRead,
  ] = await Promise.all([
    readJsonStatus(HISTORY_INDEX_PATH),
    readJsonStatus(REVIEW_INDEX_PATH),
    readJsonStatus(STARTERS_INDEX_PATH),
    readJsonStatus(ENTRIES_INDEX_PATH),
    loadParserInternals(),
    filesIn(RAW_ROOT),
    filesIn(REVIEW_ROOT),
    readJsonStatus(OFFICIAL_RESULTS_PATH),
  ]);
  const parsed = await parserModule.__parseTargetDateForAvailabilityAudit();
  const results = parsed.resultSummary.races;
  const predictions = parsed.predictionSummary.races;
  const historyExistingPrecheck =
    await buildHistoryExistingPrecheck(historyIndexRead);

  if (!historyIndexRead.exists) {
    increment(blockReasonCounts, "HISTORY_INDEX_MISSING");
  } else if (historyIndexRead.parseStatus !== "ok") {
    increment(blockReasonCounts, "HISTORY_INDEX_PARSE_FAILED");
  }
  if (historyExistingPrecheck.targetDailyExists) {
    increment(blockReasonCounts, "HISTORY_DAILY_ALREADY_EXISTS");
  }

  const privateResultFiles =
    rawFiles.filter((file) => sourceType(file) === "private-raw-result");
  const reviewResultFiles =
    reviewFiles.filter((file) => sourceType(file) === "review-result");
  const resultCandidateFiles = await Promise.all([
    ...privateResultFiles.map(
      (file) => textCandidate(file, "private-raw-result"),
    ),
    ...reviewResultFiles.map((file) => textCandidate(file, "review-result")),
  ]);
  const officialPayloadText =
    officialResultsRead.payload ? JSON.stringify(officialResultsRead.payload) : "";
  const officialFeedCandidateCount =
    officialPayloadText.includes(TARGET_DATE) ? 1 : 0;
  const resultCompleteness =
    results.length === 0
      ? "missing"
      : parsed.resultSummary.resultCompleteness === "complete"
        ? "complete"
        : "partial";
  const resultSourceStatus =
    results.length === 0
      ? "MISSING_RESULT_SOURCE"
      : resultCompleteness === "complete"
        ? "READY_WITH_PRIVATE_RAW_SOURCE"
        : "PARTIAL_RESULT_SOURCE";
  if (resultSourceStatus === "MISSING_RESULT_SOURCE") {
    increment(blockReasonCounts, "RESULT_SOURCE_MISSING");
  } else if (resultSourceStatus === "PARTIAL_RESULT_SOURCE") {
    increment(blockReasonCounts, "RESULT_SOURCE_PARTIAL");
  }
  const resultSourceDiscovery = {
    targetDate: TARGET_DATE,
    candidateFileCount:
      resultCandidateFiles.length + officialFeedCandidateCount,
    privateRawCandidateCount: privateResultFiles.length,
    privateNormalizedCandidateCount: 0,
    publicAnalyticsCandidateCount: 0,
    publicRaceCandidateCount: officialFeedCandidateCount,
    reviewResultCandidateCount: reviewResultFiles.length,
    officialFeedCandidateCount,
    candidateFiles: resultCandidateFiles,
    bestResultSourceCandidate: privateResultFiles[0] ?? null,
    bestResultSourceType:
      privateResultFiles.length ? "private-raw-result" : null,
    bestResultSourceParseStatus:
      results.length ? "ok" : privateResultFiles.length ? "failed" : "missing",
    resultRaceCount: results.length,
    resultVenueCount: parsed.resultSummary.venueCount,
    settledRaceCount: parsed.resultSummary.settledRaceCount,
    cancelledRaceCount: parsed.resultSummary.cancelledRaceCount,
    resultCompleteness,
    predictionUsedAsResultSource: false,
    reviewUsedAsResultSourceUnsafely: false,
    fakeCompletionPerformed: false,
    fuzzyMatchingPerformed: false,
    resultSourceStatus,
  };

  const privatePredictionFiles =
    rawFiles.filter((file) => sourceType(file) === "private-raw-prediction");
  const reviewPredictionFiles =
    reviewFiles.filter((file) => sourceType(file) === "review-prediction");
  const predictionCandidateFiles = await Promise.all([
    ...privatePredictionFiles.map(
      (file) => textCandidate(file, "private-raw-prediction"),
    ),
    ...reviewPredictionFiles.map(
      (file) => textCandidate(file, "review-prediction"),
    ),
  ]);
  const predictionSourceStatus =
    predictions.length === 0
      ? "MISSING"
      : predictions.length === results.length
        ? "READY"
        : "PARTIAL";
  if (predictionSourceStatus === "MISSING") {
    increment(blockReasonCounts, "PREDICTION_SOURCE_MISSING");
  } else if (predictionSourceStatus === "PARTIAL") {
    increment(blockReasonCounts, "PREDICTION_SOURCE_PARTIAL");
  }
  const predictionSourceDiscovery = {
    targetDate: TARGET_DATE,
    candidateFileCount: predictionCandidateFiles.length,
    predictionFileCount: privatePredictionFiles.length,
    reviewPredictionFileCount: reviewPredictionFiles.length,
    privatePredictionFileCount: privatePredictionFiles.length,
    candidateFiles: predictionCandidateFiles,
    bestPredictionSourceCandidate: privatePredictionFiles[0] ?? null,
    predictionVenueCount: parsed.predictionSummary.venueCount,
    predictionRaceCount: predictions.length,
    predictionSourceStatus,
  };

  const reviewSummaryFiles =
    reviewFiles.filter((file) => sourceType(file) === "review-summary");
  const reviewCandidates = await Promise.all(
    reviewFiles
      .filter((file) => sourceType(file) !== "other")
      .map((file) => textCandidate(file, sourceType(file))),
  );
  const reviewIndexMatches =
    reviewIndexItems(reviewIndexRead.payload)
      .filter((item) => item?.date === TARGET_DATE);
  const reviewVenueCount =
    new Set(reviewFiles.map(venueSlug).filter(Boolean)).size;
  const reviewSourceStatus =
    reviewFiles.length > 0 && reviewIndexMatches.length > 0
      ? "READY"
      : reviewFiles.length > 0
        ? "PARTIAL"
        : "MISSING";
  if (reviewSourceStatus === "MISSING") {
    increment(blockReasonCounts, "REVIEW_SOURCE_MISSING");
  } else if (reviewSourceStatus === "PARTIAL") {
    increment(blockReasonCounts, "REVIEW_SOURCE_PARTIAL");
  }
  const reviewSourceDiscovery = {
    targetDate: TARGET_DATE,
    reviewDirExists: existsSync(abs(REVIEW_ROOT)),
    reviewIndexEntryExists: reviewIndexMatches.length > 0,
    reviewFileCount: reviewFiles.length,
    reviewPredictionCount: reviewPredictionFiles.length,
    reviewResultCount: reviewResultFiles.length,
    reviewSummaryCount: reviewSummaryFiles.length,
    reviewVenueCount,
    reviewRaceCount: Math.max(
      results.length,
      reviewCandidates
        .filter((item) => item.sourceType === "review-result")
        .reduce((sum, item) => sum + item.raceCount, 0),
    ),
    candidateFiles: reviewCandidates.map(
      ({ confidence: _confidence, ...candidate }) => candidate,
    ),
    reviewSourceStatus,
  };

  const startersRead = await readJsonStatus(STARTERS_SOURCE_PATH);
  const entriesRead = await readJsonStatus(ENTRIES_SNAPSHOT_PATH);
  const startersIndexEntryExists =
    indexItems(startersIndexRead.payload, "sources")
      .some((item) => item?.date === TARGET_DATE);
  const entriesIndexEntryExists =
    indexItems(entriesIndexRead.payload, "snapshots")
      .some((item) => item?.date === TARGET_DATE);
  const starterRaces = array(startersRead.payload?.races);
  const entryRaces = array(entriesRead.payload?.races);
  const starterTotal = starterRaces
    .flatMap((race) => array(race.starters)).length;
  const entryTotal = entryRaces
    .flatMap((race) => array(race.entries)).length;
  const sameDateBridgePossibleNow =
    startersRead.exists
    && entriesRead.exists
    && startersIndexEntryExists
    && entriesIndexEntryExists;
  let startersEntriesStatus = "MISSING_EXPECTED_FOR_NOW";
  if (sameDateBridgePossibleNow) {
    startersEntriesStatus = "READY_FOR_SAME_DATE_BRIDGE";
  } else if (startersRead.exists || entriesRead.exists) {
    startersEntriesStatus = "PARTIAL";
  }
  if (!startersRead.exists) {
    increment(
      blockReasonCounts,
      "STARTERS_SOURCE_MISSING_EXPECTED_FOR_NOW",
    );
  }
  if (!entriesRead.exists) {
    increment(
      blockReasonCounts,
      "ENTRIES_SNAPSHOT_MISSING_EXPECTED_FOR_NOW",
    );
  }
  const startersEntriesAvailability = {
    targetDate: TARGET_DATE,
    startersSourcePath: STARTERS_SOURCE_PATH,
    startersSourceExists: startersRead.exists,
    startersSourceIndexEntryExists: startersIndexEntryExists,
    startersSourceParseStatus: startersRead.parseStatus,
    startersSourceRaceCount: starterRaces.length,
    startersSourceStarterTotal: starterTotal,
    entriesSnapshotPath: ENTRIES_SNAPSHOT_PATH,
    entriesSnapshotExists: entriesRead.exists,
    entriesIndexEntryExists,
    entriesSnapshotParseStatus: entriesRead.parseStatus,
    entriesSnapshotRaceCount: entryRaces.length,
    entriesSnapshotStarterTotal: entryTotal,
    sameDateBridgePossibleNow,
    sameDateBridgeBlockedReason:
      sameDateBridgePossibleNow
        ? null
        : "same-date starters source and entries snapshot are missing",
    startersEntriesStatus,
  };

  const resultPredictionMapping =
    buildResultPredictionMapping(results, predictions);
  if (resultPredictionMapping.mappingStatus === "PARTIAL") {
    increment(blockReasonCounts, "PREDICTION_MAPPING_PARTIAL");
  }
  if (resultPredictionMapping.unmatchedResultRaceCount > 0) {
    increment(
      blockReasonCounts,
      "EXACT_MAPPING_MISSING_RACE",
      resultPredictionMapping.unmatchedResultRaceCount,
    );
  }
  if (resultPredictionMapping.unmatchedPredictionRaceCount > 0) {
    increment(
      blockReasonCounts,
      "EXACT_MAPPING_EXTRA_PREDICTION_RACE",
      resultPredictionMapping.unmatchedPredictionRaceCount,
    );
  }
  if (resultPredictionMapping.ambiguousJoinCount > 0) {
    increment(
      blockReasonCounts,
      "AMBIGUOUS_MAPPING_KEY",
      resultPredictionMapping.ambiguousJoinCount,
    );
  }
  if (resultPredictionMapping.crossDateJoinFound) {
    increment(blockReasonCounts, "CROSS_DATE_JOIN_FOUND");
  }
  if (resultPredictionMapping.crossVenueJoinFound) {
    increment(blockReasonCounts, "CROSS_VENUE_JOIN_FOUND");
  }

  const reviewSummaryByVenue =
    new Map(reviewSummaryFiles.map((file) => [
      venueSlug(file),
      file.replace(/^public\//u, ""),
    ]));
  const candidate = buildCandidate(
    results,
    predictions,
    reviewSummaryByVenue,
  );
  const candidateItems = candidate.items;
  const candidateMissingCoreFieldCounts =
    missingCoreFieldCounts(candidateItems);
  const candidateDuplicateRaceKeyCount =
    countDuplicates(candidateItems.map((item) => item.raceKey));
  const candidateDuplicateDateVenueRaceNumberCount =
    countDuplicates(
      candidateItems.map(
        (item) => `${item.date}:${item.venueKey}:${item.raceNumber}`,
      ),
    );
  const candidateStartersNonEmptyRaceCount =
    candidateItems.filter((item) => item.starters.length > 0).length;
  const candidateStarterTotalCount =
    candidateItems.flatMap((item) => item.starters).length;
  const candidateQualityStarterParsedFalseCount =
    candidateItems.filter((item) => item.quality?.starterParsed === false).length;
  const candidateNoStartersRaceCount =
    candidateItems.filter(
      (item) =>
        item.starterCount === 0
        && item.starters.length === 0
        && item.quality?.marker === "NO_STARTERS",
    ).length;
  const candidatePredictionLinkedRaceCount =
    candidateItems.filter(
      (item) => item.predictionEnrichment.status === "matched",
    ).length;
  const candidateReviewLinkedRaceCount =
    candidateItems.filter(
      (item) => item.reviewEnrichment.status === "matched",
    ).length;
  const requiredMissingTotal =
    Object.entries(candidateMissingCoreFieldCounts)
      .filter(([field]) => field !== "prediction")
      .reduce((sum, [, count]) => sum + count, 0);
  const candidateSchemaCompatibility =
    requiredMissingTotal === 0 ? "compatible" : "incompatible";
  if (candidateSchemaCompatibility === "incompatible") {
    increment(blockReasonCounts, "CANDIDATE_SCHEMA_INCOMPATIBLE");
  }
  const countsAligned =
    candidate.raceCount === results.length
    && candidateStartersNonEmptyRaceCount === 0
    && candidateStarterTotalCount === 0
    && candidateNoStartersRaceCount === candidate.raceCount
    && candidateQualityStarterParsedFalseCount === candidate.raceCount;
  if (!countsAligned) increment(blockReasonCounts, "CANDIDATE_COUNT_MISMATCH");
  const candidatePayloadText = `${JSON.stringify(candidate, null, 2)}\n`;
  const candidatePayloadHash = stableHash(candidate);
  const candidatePayloadBytes = Buffer.byteLength(candidatePayloadText, "utf8");
  let candidateStatus = "READY_NO_STARTERS_DAILY_CANDIDATE";
  if (candidateSchemaCompatibility === "incompatible") {
    candidateStatus = "NEEDS_SCHEMA_MAPPING";
  } else if (
    resultPredictionMapping.mappingStatus !== "COMPLETE"
    || candidatePredictionLinkedRaceCount !== candidate.raceCount
  ) {
    candidateStatus = "PARTIAL_NEEDS_MAPPING_REVIEW";
  }
  if (
    historyExistingPrecheck.existingHistoryStatus
    !== "ABSENT_READY_TO_CREATE"
    || !countsAligned
  ) candidateStatus = "BLOCKED";
  const candidateHistoryDaily = {
    targetDate: TARGET_DATE,
    candidateDailyPath: EXPECTED_DAILY_PATH,
    candidatePublicPath: EXPECTED_PUBLIC_PATH,
    candidateRaceCount: candidate.raceCount,
    candidateVenueCount:
      new Set(candidateItems.map((item) => item.venueKey)).size,
    candidateSettledRaceCount: candidate.settledRaceCount,
    candidateCancelledRaceCount: candidate.cancelledRaceCount,
    candidatePredictionLinkedRaceCount,
    candidateReviewLinkedRaceCount,
    candidateNoStartersRaceCount,
    candidateStartersEmptyRaceCount:
      candidateItems.filter((item) => item.starters.length === 0).length,
    candidateStartersNonEmptyRaceCount,
    candidateStarterTotalCount,
    candidateQualityStarterParsedFalseCount,
    candidateMissingCoreFieldCounts,
    candidateDuplicateRaceKeyCount,
    candidateDuplicateDateVenueRaceNumberCount,
    candidateSchemaCompatibility,
    candidatePayloadHash,
    candidatePayloadBytes,
    writePerformed: false,
    candidateStatus,
  };

  const historyItems = array(historyIndexRead.payload?.items);
  const currentSourceCount = historyItems.length;
  const currentDayCount =
    historyIndexRead.payload?.dayCount ?? currentSourceCount;
  const currentRaceCount =
    historyIndexRead.payload?.raceCount
      ?? historyItems.reduce((sum, item) => sum + (item.raceCount ?? 0), 0);
  const currentTotalBytes =
    historyIndexRead.payload?.totalBytes
      ?? historyItems.reduce((sum, item) => sum + (item.bytes ?? 0), 0);
  const previewItems = [
    ...historyItems,
    {
      date: TARGET_DATE,
      file: EXPECTED_PUBLIC_PATH,
      raceCount: candidate.raceCount,
      settledRaceCount: candidate.settledRaceCount,
      cancelledRaceCount: candidate.cancelledRaceCount,
      bytes: candidatePayloadBytes,
    },
  ].sort((left, right) => left.date.localeCompare(right.date));
  const wouldSourceCount = currentSourceCount + 1;
  const wouldDayCount = currentDayCount + 1;
  const wouldRaceCount = currentRaceCount + candidate.raceCount;
  const wouldTotalBytes = currentTotalBytes + candidatePayloadBytes;
  const latest = previewItems.at(-1);
  const candidateIndexPayload = {
    ...historyIndexRead.payload,
    period: {
      from: previewItems[0]?.date ?? null,
      to: latest?.date ?? null,
    },
    dayCount: wouldDayCount,
    raceCount: wouldRaceCount,
    settledRaceCount:
      (historyIndexRead.payload?.settledRaceCount ?? 0)
      + candidate.settledRaceCount,
    cancelledRaceCount:
      (historyIndexRead.payload?.cancelledRaceCount ?? 0)
      + candidate.cancelledRaceCount,
    totalBytes: wouldTotalBytes,
    items: previewItems,
  };
  const indexUpdateStatus =
    historyIndexRead.parseStatus === "ok"
    && !historyExistingPrecheck.targetDateIndexEntryExists
    && candidateStatus === "READY_NO_STARTERS_DAILY_CANDIDATE"
      ? "READY_FOR_INDEX_WRITE_SAFETY_AUDIT_AFTER_DAILY"
      : historyIndexRead.parseStatus === "ok"
        ? "NEEDS_INDEX_SCHEMA_MAPPING"
        : "BLOCKED";
  const indexUpdatePreview = {
    targetDate: TARGET_DATE,
    currentIndexSourceCount: currentSourceCount,
    currentIndexDayCount: currentDayCount,
    currentIndexRaceCount: currentRaceCount,
    currentIndexTotalBytes: currentTotalBytes,
    targetDateEntryExists:
      historyExistingPrecheck.targetDateIndexEntryExists,
    wouldAddTargetDateEntry:
      !historyExistingPrecheck.targetDateIndexEntryExists,
    candidateDailyBytes: candidatePayloadBytes,
    candidateDailyRaceCount: candidate.raceCount,
    wouldSourceCount,
    wouldDayCount,
    wouldRaceCount,
    raceCountDelta: candidate.raceCount,
    wouldTotalBytes,
    totalBytesDelta: candidatePayloadBytes,
    wouldLatestDate: latest?.date ?? null,
    wouldLatestPath: latest?.file ?? null,
    candidateIndexHash: stableHash(candidateIndexPayload),
    indexUpdateStatus,
  };

  const guard = protectedModificationGuard();
  if (guard.publicAnalyticsModified) {
    increment(blockReasonCounts, "PUBLIC_ANALYTICS_MODIFIED");
  }
  if (guard.publicRacesModified) {
    increment(blockReasonCounts, "PUBLIC_RACES_MODIFIED");
  }
  if (guard.publicReviewsTouchedByThisStep) {
    increment(blockReasonCounts, "PUBLIC_REVIEWS_MODIFIED_BY_THIS_STEP");
  }
  if (guard.privateInputModified) {
    increment(blockReasonCounts, "PRIVATE_INPUT_MODIFIED");
  }
  if (guard.srcModified) increment(blockReasonCounts, "SRC_MODIFIED");
  if (guard.packageModified) increment(blockReasonCounts, "PACKAGE_MODIFIED");
  if (guard.docsModified) increment(blockReasonCounts, "DOCS_MODIFIED");
  if (guard.existingScriptModified) {
    increment(blockReasonCounts, "EXISTING_SCRIPT_MODIFIED");
  }
  if (guard.stagedFiles.length) {
    increment(
      blockReasonCounts,
      "UNEXPECTED_FILE_STAGED",
      guard.stagedFiles.length,
    );
  }

  const canProceedToDailyWriteSafetyAudit =
    historyExistingPrecheck.existingHistoryStatus === "ABSENT_READY_TO_CREATE"
    && resultSourceStatus === "READY_WITH_PRIVATE_RAW_SOURCE"
    && ["READY", "PARTIAL"].includes(predictionSourceStatus)
    && ["READY", "PARTIAL"].includes(reviewSourceStatus)
    && resultPredictionMapping.mappingStatus === "COMPLETE"
    && candidateStatus === "READY_NO_STARTERS_DAILY_CANDIDATE"
    && indexUpdateStatus === "READY_FOR_INDEX_WRITE_SAFETY_AUDIT_AFTER_DAILY"
    && guard.guardStatus === "pass";
  let readinessStatus =
    canProceedToDailyWriteSafetyAudit
      ? "READY_FOR_HISTORY_DAILY_WRITE_SAFETY_AUDIT_NO_STARTERS"
      : "PARTIAL_NEEDS_MAPPING_REVIEW";
  if (
    historyExistingPrecheck.existingHistoryStatus
    === "ALREADY_INDEXED_NEEDS_VERIFY"
    || historyExistingPrecheck.existingHistoryStatus
    === "DAILY_EXISTS_NOT_INDEXED"
  ) readinessStatus = "ALREADY_EXISTS_NEEDS_VERIFY";
  else if (resultSourceStatus === "MISSING_RESULT_SOURCE") {
    readinessStatus = "NEEDS_RESULT_SOURCE_FIX";
  } else if (predictionSourceStatus === "MISSING") {
    readinessStatus = "NEEDS_PREDICTION_SOURCE_FIX";
  } else if (
    candidateStatus === "NEEDS_SCHEMA_MAPPING"
    || indexUpdateStatus === "NEEDS_INDEX_SCHEMA_MAPPING"
  ) readinessStatus = "NEEDS_SCHEMA_MAPPING";
  if (guard.guardStatus === "fail") readinessStatus = "BLOCKED";
  const readiness = {
    targetDate: TARGET_DATE,
    existingHistoryStatus:
      historyExistingPrecheck.existingHistoryStatus,
    resultSourceStatus,
    predictionSourceStatus,
    reviewSourceStatus,
    startersEntriesStatus,
    resultPredictionMappingStatus:
      resultPredictionMapping.mappingStatus,
    candidateHistoryDailyStatus: candidateStatus,
    indexUpdatePreviewStatus: indexUpdateStatus,
    canProceedToDailyWriteSafetyAudit,
    canProceedToSameDateBridgeNow: sameDateBridgePossibleNow,
    missingForStartersBridge: [
      ...(!startersRead.exists ? ["starters source"] : []),
      ...(!entriesRead.exists ? ["entries snapshot"] : []),
    ],
    nextRequiredStep:
      canProceedToDailyWriteSafetyAudit
        ? "2026-06-25 history daily write safety audit no-starters"
        : "resolve reported mapping/schema/source block reasons",
    readinessStatus,
  };

  const normalizedBlockReasonCounts =
    normalizeBlockReasons(blockReasonCounts);
  const summary = {
    targetDate: TARGET_DATE,
    readinessStatus,
    existingHistoryStatus:
      historyExistingPrecheck.existingHistoryStatus,
    resultSourceStatus,
    predictionSourceStatus,
    reviewSourceStatus,
    startersEntriesStatus,
    resultPredictionMappingStatus:
      resultPredictionMapping.mappingStatus,
    candidateHistoryDailyStatus: candidateStatus,
    indexUpdatePreviewStatus: indexUpdateStatus,
    bestResultSourceCandidate:
      resultSourceDiscovery.bestResultSourceCandidate,
    bestPredictionSourceCandidate:
      predictionSourceDiscovery.bestPredictionSourceCandidate,
    candidateRaceCount: candidateHistoryDaily.candidateRaceCount,
    candidateVenueCount: candidateHistoryDaily.candidateVenueCount,
    candidateSettledRaceCount:
      candidateHistoryDaily.candidateSettledRaceCount,
    candidateCancelledRaceCount:
      candidateHistoryDaily.candidateCancelledRaceCount,
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
    canProceedToDailyWriteSafetyAudit,
    canProceedToSameDateBridgeNow: sameDateBridgePossibleNow,
    writePerformed: false,
    publicAnalyticsModified: guard.publicAnalyticsModified,
    publicRacesModified: guard.publicRacesModified,
    publicReviewsTouchedByThisStep:
      guard.publicReviewsTouchedByThisStep,
    privateInputModified: guard.privateInputModified,
    srcModified: guard.srcModified,
    packageModified: guard.packageModified,
    docsModified: guard.docsModified,
    existingScriptModified: guard.existingScriptModified,
    fakeCompletionPerformed: false,
    fuzzyMatchingPerformed: false,
    predictionUsedAsResultSource: false,
    generatedStartersFound: candidateStartersNonEmptyRaceCount > 0,
    generatedRegistrationNoFound: false,
    blockReasonCounts: normalizedBlockReasonCounts,
  };

  return {
    summary,
    targetConfig,
    historyExistingPrecheck,
    resultSourceDiscovery,
    predictionSourceDiscovery,
    reviewSourceDiscovery,
    startersEntriesAvailability,
    resultPredictionMapping,
    candidateHistoryDaily,
    indexUpdatePreview,
    readiness,
    protectedModificationGuard: guard,
    nextActionPlan: nextActionPlan(readinessStatus),
    jsonSummary: {
      ...summary,
      blockReasonCounts: normalizedBlockReasonCounts,
    },
  };
}

async function main() {
  const result =
    await auditPrivateRawHistoryDailyMappingDryRun20260625();
  printSection("summary", result.summary);
  printSection("targetConfig", result.targetConfig);
  printSection("historyExistingPrecheck", result.historyExistingPrecheck);
  printSection("resultSourceDiscovery", result.resultSourceDiscovery);
  printSection(
    "predictionSourceDiscovery",
    result.predictionSourceDiscovery,
  );
  printSection("reviewSourceDiscovery", result.reviewSourceDiscovery);
  printSection(
    "startersEntriesAvailability",
    result.startersEntriesAvailability,
  );
  printSection("resultPredictionMapping", result.resultPredictionMapping);
  printSection("candidateHistoryDaily", result.candidateHistoryDaily);
  printSection("indexUpdatePreview", result.indexUpdatePreview);
  printSection("readiness", result.readiness);
  printSection(
    "protectedModificationGuard",
    result.protectedModificationGuard,
  );
  printSection("nextActionPlan", result.nextActionPlan);
  printSection("jsonSummary", result.jsonSummary);
  if (
    result.protectedModificationGuard.guardStatus !== "pass"
    || result.readiness.readinessStatus === "BLOCKED"
  ) process.exitCode = 1;
}

const isMain =
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  main().catch((error) => {
    console.error(
      "[kurari-ex private raw history daily mapping dry-run 2026-06-25] failed",
    );
    console.error(error);
    process.exitCode = 1;
  });
}
