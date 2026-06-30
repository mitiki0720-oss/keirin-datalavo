import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const TARGET_DATE = "2026-06-29";
const MAX_ITEMS = 30;
const SAMPLE_MAX = 20;

const FLAGS = {
  writesPerformed: false,
  analyticsModified: false,
  racesModified: false,
  reviewsModified: false,
  privateInputModified: false,
  protectedFilesModified: false,
  fakeCompletionPerformed: false,
  fuzzyMatchingPerformed: false,
  predictionUsedAsResultSource: false,
};

const BLOCK_REASON_ORDER = [
  "OFFICIAL_RESULT_SOURCE_MISSING",
  "PRIVATE_RAW_SOURCE_MISSING",
  "PRIVATE_NORMALIZED_SOURCE_MISSING",
  "TARGET_DATE_NOT_FOUND_IN_RESULT_SOURCE",
  "TARGET_DATE_RESULT_PARSE_FAILED",
  "TARGET_DATE_RESULT_SCHEMA_UNKNOWN",
  "TARGET_DATE_RESULT_INCOMPLETE",
  "TARGET_DATE_RESULT_ONLY_IN_REVIEWS",
  "TARGET_DATE_ONLY_PREDICTION",
  "RESULT_SOURCE_STALE",
  "RESULT_SOURCE_AMBIGUOUS",
  "WRITER_COMPATIBILITY_UNKNOWN",
  "WRITER_REQUIRES_NORMALIZED_INPUT",
  "WRITER_REQUIRES_PRIVATE_INPUT",
  "HISTORY_DAILY_WRITER_NOT_READY",
  "DRY_RUN_MODE_NOT_AVAILABLE",
  "FAKE_COMPLETION_FOUND",
  "FUZZY_MATCHING_FOUND",
  "PROHIBITED_SOURCE_FOUND",
  "ANALYTICS_MODIFIED",
  "RACES_MODIFIED",
  "REVIEWS_MODIFIED",
  "PRIVATE_INPUT_MODIFIED",
  "PROTECTED_FILE_MODIFIED",
  "PACKAGE_MODIFIED",
];

function abs(file) {
  return path.isAbsolute(file) ? file : path.resolve(ROOT, file);
}

function rel(file) {
  return path.relative(ROOT, file).replaceAll("\\", "/");
}

function normalizeText(value) {
  return String(value ?? "").replace(/^\uFEFF/u, "").normalize("NFKC");
}

function increment(counter, key, by = 1) {
  counter[key] = (counter[key] ?? 0) + by;
}

function sortedDates(values) {
  return [...new Set(values.filter((value) => /^\d{4}-\d{2}-\d{2}$/u.test(String(value))))].sort();
}

function limit(items, max = MAX_ITEMS) {
  const values = [...items];
  return {
    count: values.length,
    truncated: values.length > max,
    items: values.slice(0, max),
  };
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : 0;
}

async function readTextIfExists(file) {
  const target = abs(file);
  if (!existsSync(target)) return null;
  return readFile(target, "utf8");
}

async function readJsonIfExists(file) {
  const text = await readTextIfExists(file);
  if (!text) return null;
  return JSON.parse(text);
}

async function collectFiles(rootPath, predicate = () => true) {
  const root = abs(rootPath);
  if (!existsSync(root)) return [];
  const rootStat = await stat(root);
  if (rootStat.isFile()) return predicate(root) ? [root] : [];
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

function datesInText(text) {
  return sortedDates(normalizeText(text).match(/\b20\d{2}-\d{2}-\d{2}\b/gu) ?? []);
}

function detectResultFieldsFromText(text) {
  const normalized = normalizeText(text);
  return {
    "rank/order": /着順|1着|2着|3着|finishOrder|rank|着/u.test(normalized),
    "riderNo/name": /車番|番車|carNo|riderNo|選手|name|氏名/u.test(normalized),
    resultTime: /タイム|time|上がり|走行時間/u.test(normalized),
    "win/payoff": /払戻|配当|円|payout|3連単|三連単|2車単|二車単/u.test(normalized),
    officialResult: /結果|確定|confirmed|finished|result/u.test(normalized),
    raceStatus: /finished|confirmed|確定|中止|cancelled|operationStatus|resultStatus/u.test(normalized),
  };
}

function detectHistoryCoreFieldsFromText(text) {
  const normalized = normalizeText(text);
  return {
    date: /\b20\d{2}-\d{2}-\d{2}\b|20\d{2}年\d{1,2}月\d{1,2}日/u.test(normalized),
    venueName: /競輪場|岐阜|伊東|高知|佐世保|武雄|玉野|取手|函館|弥彦|venueName|venue/u.test(normalized),
    venueKey: /venueKey|raceKey|gifu|ito|kochi|sasebo|takeo|tamano|toride/u.test(normalized),
    raceNumber: /\b\d{1,2}R\b|raceNumber|raceNo/u.test(normalized),
    result: /結果|着順|3連単|払戻|result|trifecta/u.test(normalized),
  };
}

function parseMaybeJsonLines(text) {
  const records = [];
  const errors = [];
  for (const [index, line] of text.split(/\r?\n/u).entries()) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line));
    } catch (error) {
      errors.push({ line: index + 1, message: error.message });
    }
  }
  return { records, errors };
}

function flattenRecords(value) {
  if (Array.isArray(value)) return value.flatMap(flattenRecords);
  if (!value || typeof value !== "object") return [];
  const directArrays = [
    value.races,
    value.items,
    value.venues,
    value.results,
    value.recordList,
    value.data?.races,
  ].filter(Array.isArray);
  if (directArrays.length === 0) return [value];
  return [value, ...directArrays.flatMap(flattenRecords)];
}

function dateOfRecord(record) {
  return record?.date ?? record?.raceDate ?? record?.resultDate ?? record?.meta?.date ?? null;
}

function venueOfRecord(record) {
  return record?.venueName ?? record?.venue ?? record?.trackName ?? record?.placeName ?? record?.meta?.venueName ?? null;
}

function raceNumberOfRecord(record) {
  return record?.raceNumber ?? record?.raceNo ?? record?.race ?? record?.meta?.raceNumber ?? null;
}

function isSettledRecord(record) {
  const text = JSON.stringify(record);
  if (/cancelled|中止/u.test(text)) return false;
  return /finished|confirmed|確定|trifecta|3連単|finishOrder|payout|払戻|着順/u.test(text);
}

function isCancelledRecord(record) {
  return /cancelled|中止/u.test(JSON.stringify(record));
}

function resultCompleteness(candidate) {
  if (candidate.targetDateRecordCount === 0) return "none";
  const fields = candidate.hasResultFields;
  const core = candidate.hasHistoryCoreFields;
  const required = [
    fields["rank/order"],
    fields["win/payoff"],
    fields.officialResult,
    core.date,
    core.venueName || core.venueKey,
    core.raceNumber,
    core.result,
  ];
  const score = required.filter(Boolean).length;
  if (score >= 6) return "complete";
  if (score >= 4) return "partial";
  return "insufficient";
}

function supportStatus(candidate) {
  if (!candidate.existsNow) return { history: "no", target: "no" };
  if (candidate.targetDateRecordCount === 0 && candidate.targetDateFileCount === 0) {
    return { history: "unknown", target: "no" };
  }
  const completeness = resultCompleteness(candidate);
  if (candidate.sourceType === "prediction") return { history: "no", target: "no" };
  if (candidate.sourceType === "review-result") {
    return completeness === "complete"
      ? { history: "partial", target: "partial" }
      : { history: "unknown", target: "partial" };
  }
  if (completeness === "complete") return { history: "yes", target: "yes" };
  if (completeness === "partial") return { history: "partial", target: "partial" };
  return { history: "unknown", target: "unknown" };
}

async function analyzeFiles({ sourceId, sourceType, pathPattern, rootPath, filePredicate, protectedInput = false, generatedPublicData = false, reviewData = false }) {
  const files = await collectFiles(rootPath, filePredicate);
  let parseStatus = files.length ? "ok" : "missing";
  let recordCount = 0;
  let targetDateRecordCount = 0;
  let settledRaceCountDetected = 0;
  let cancelledRaceCountDetected = 0;
  const venues = new Set();
  const races = new Set();
  const dates = new Set();
  let targetDateFileCount = 0;
  const resultFields = {
    "rank/order": false,
    "riderNo/name": false,
    resultTime: false,
    "win/payoff": false,
    officialResult: false,
    raceStatus: false,
  };
  const coreFields = {
    date: false,
    venueName: false,
    venueKey: false,
    raceNumber: false,
    result: false,
  };
  const limitations = [];
  const sampleFiles = files.slice(0, SAMPLE_MAX).map(rel);

  for (const file of files) {
    const text = await readFile(file, "utf8");
    const fileDates = new Set([
      ...datesInText(text),
      ...(rel(file).match(/\b20\d{2}-\d{2}-\d{2}\b/gu) ?? []),
    ]);
    for (const date of fileDates) dates.add(date);
    if (fileDates.has(TARGET_DATE) || rel(file).includes(TARGET_DATE)) targetDateFileCount += 1;

    const textFields = detectResultFieldsFromText(text);
    const textCore = detectHistoryCoreFieldsFromText(text);
    for (const key of Object.keys(resultFields)) resultFields[key] ||= textFields[key];
    for (const key of Object.keys(coreFields)) coreFields[key] ||= textCore[key];

    let records = [];
    if (file.endsWith(".jsonl")) {
      const parsed = parseMaybeJsonLines(text);
      records = parsed.records;
      if (parsed.errors.length) parseStatus = "partial";
    } else if (file.endsWith(".json") || file.endsWith(".generated.json")) {
      try {
        records = flattenRecords(JSON.parse(text));
      } catch {
        parseStatus = "partial";
      }
    } else {
      const normalizedText = normalizeText(text);
      const raceMatches = normalizedText.match(
        /^(?:■\s+.+?\s+\d{1,2}R|#{2,3}\s+.*?\d{1,2}R(?:\s|$)|\s*\d{1,2}R\s*[｜|])/gmu,
      ) ?? [];
      const resultLike = /結果|着順|3連単|三連単|2車単|二車単|払戻/u.test(normalizedText);
      const resultFileForResultSource =
        !["private-raw", "review-result"].includes(sourceType) ||
        /(?:^|-)result\.(?:txt|md|json)$/iu.test(path.basename(file));
      const textRecordCount = resultFileForResultSource
        ? raceMatches.length || (resultLike && fileDates.has(TARGET_DATE) ? 1 : 0)
        : 0;
      recordCount += textRecordCount;
      if (fileDates.has(TARGET_DATE) || rel(file).includes(TARGET_DATE)) {
        const venueSlug = path.basename(file).split("-")[0];
        if (venueSlug) venues.add(venueSlug);
        targetDateRecordCount += textRecordCount || 1;
        settledRaceCountDetected += textRecordCount || 1;
        for (let index = 1; index <= textRecordCount; index += 1) {
          races.add(`${venueSlug}:${index}`);
        }
      }
      continue;
    }

    recordCount += records.length;
    for (const record of records) {
      const recordDate = dateOfRecord(record);
      if (recordDate) dates.add(recordDate);
      const target = recordDate === TARGET_DATE || JSON.stringify(record).includes(TARGET_DATE);
      if (!target) continue;
      targetDateRecordCount += 1;
      const venue = venueOfRecord(record);
      if (venue) venues.add(String(venue));
      const raceNumber = raceNumberOfRecord(record);
      if (venue && raceNumber) races.add(`${venue}:${raceNumber}`);
      if (isSettledRecord(record)) settledRaceCountDetected += 1;
      if (isCancelledRecord(record)) cancelledRaceCountDetected += 1;
    }
  }

  if (files.length === 0) limitations.push("source path is missing or empty");
  if (!Object.values(resultFields).some(Boolean)) limitations.push("result-like fields were not detected");
  if (sourceType === "prediction") limitations.push("prediction source is not a result source");
  if (sourceType === "review-result") limitations.push("review source is not treated as official result source");
  if (protectedInput) limitations.push("protected input: read-only only");

  const candidate = {
    sourceId,
    sourceType,
    pathPattern,
    existsNow: files.length > 0,
    fileCount: files.length,
    sampleFiles,
    latestDateDetected: sortedDates([...dates]).at(-1) ?? null,
    targetDateDetected: dates.has(TARGET_DATE) || targetDateFileCount > 0,
    targetDateFileCount,
    parseStatus,
    recordCount,
    targetDateRecordCount,
    raceCountDetected: races.size || targetDateRecordCount,
    settledRaceCountDetected,
    cancelledRaceCountDetected,
    venueCountDetected: venues.size,
    hasResultFields: resultFields,
    hasHistoryCoreFields: coreFields,
    canSupportHistoryDaily: "unknown",
    canSupportTargetDate: "unknown",
    limitations,
    risk: {
      protectedInput,
      generatedPublicData,
      reviewData,
      missingResultFields: !Object.values(resultFields).some(Boolean),
      staleDate: Boolean(sortedDates([...dates]).at(-1) && sortedDates([...dates]).at(-1) < TARGET_DATE),
      ambiguousDate: dates.size > 1 && targetDateFileCount === 0,
      parseFailed: parseStatus === "partial" || parseStatus === "failed",
      unknown: false,
    },
  };
  const support = supportStatus(candidate);
  candidate.canSupportHistoryDaily = support.history;
  candidate.canSupportTargetDate = support.target;
  return candidate;
}

async function buildResultSourceCandidates() {
  const textPredicate = (file) => /\.(?:txt|md|json|jsonl)$/iu.test(file);
  return [
    await analyzeFiles({
      sourceId: "official-keirin-jp-results-current",
      sourceType: "official-keirin-jp-results",
      pathPattern: "public/data/races/keirin-jp-results.generated.json",
      rootPath: "public/data/races/keirin-jp-results.generated.json",
      filePredicate: textPredicate,
      generatedPublicData: true,
    }),
    await analyzeFiles({
      sourceId: "official-keirin-jp-results-history",
      sourceType: "official-keirin-jp-results",
      pathPattern: "public/data/races/keirin-jp-results/**/*",
      rootPath: "public/data/races/keirin-jp-results",
      filePredicate: textPredicate,
      generatedPublicData: true,
    }),
    await analyzeFiles({
      sourceId: "public-race-results",
      sourceType: "official-keirin-jp-results",
      pathPattern: "public/data/races/results/**/*",
      rootPath: "public/data/races/results",
      filePredicate: textPredicate,
      generatedPublicData: true,
    }),
    await analyzeFiles({
      sourceId: "private-raw-2026-06-29",
      sourceType: "private-raw",
      pathPattern: "private-input/kurari-ex/raw/2026-06-29/**/*",
      rootPath: "private-input/kurari-ex/raw/2026-06-29",
      filePredicate: (file) => /(?:result|summary|prediction)\.(?:txt|md)$/iu.test(file),
      protectedInput: true,
    }),
    await analyzeFiles({
      sourceId: "private-raw-2026-06-28",
      sourceType: "private-raw",
      pathPattern: "private-input/kurari-ex/raw/2026-06-28/**/*",
      rootPath: "private-input/kurari-ex/raw/2026-06-28",
      filePredicate: (file) => /(?:result|summary|prediction)\.(?:txt|md)$/iu.test(file),
      protectedInput: true,
    }),
    await analyzeFiles({
      sourceId: "private-normalized-races",
      sourceType: "private-normalized",
      pathPattern: "private-input/kurari-ex/normalized/races/**/*.jsonl",
      rootPath: "private-input/kurari-ex/normalized/races",
      filePredicate: (file) => file.endsWith(".jsonl"),
      protectedInput: true,
    }),
    await analyzeFiles({
      sourceId: "review-result-2026-06-29",
      sourceType: "review-result",
      pathPattern: "public/data/reviews/2026-06-29/**/*",
      rootPath: "public/data/reviews/2026-06-29",
      filePredicate: (file) => /(?:result|summary)\.(?:txt|md|json)$/iu.test(file),
      reviewData: true,
      generatedPublicData: true,
    }),
    await analyzeFiles({
      sourceId: "review-result-2026-06-28",
      sourceType: "review-result",
      pathPattern: "public/data/reviews/2026-06-28/**/*",
      rootPath: "public/data/reviews/2026-06-28",
      filePredicate: (file) => /(?:result|summary)\.(?:txt|md|json)$/iu.test(file),
      reviewData: true,
      generatedPublicData: true,
    }),
    await analyzeFiles({
      sourceId: "review-index",
      sourceType: "review-result",
      pathPattern: "public/data/reviews/index.json",
      rootPath: "public/data/reviews/index.json",
      filePredicate: textPredicate,
      reviewData: true,
      generatedPublicData: true,
    }),
    await analyzeFiles({
      sourceId: "prediction-2026-06-29",
      sourceType: "prediction",
      pathPattern: "public/data/predictions/2026-06-29/**/*",
      rootPath: "public/data/predictions/2026-06-29",
      filePredicate: textPredicate,
      generatedPublicData: true,
    }),
    await analyzeFiles({
      sourceId: "prediction-daily-2026-06-29",
      sourceType: "prediction",
      pathPattern: "public/data/predictions/daily/2026-06/2026-06-29.generated.json",
      rootPath: "public/data/predictions/daily/2026-06/2026-06-29.generated.json",
      filePredicate: textPredicate,
      generatedPublicData: true,
    }),
  ];
}

function chooseBestCandidate(candidates) {
  const priority = [
    "official-keirin-jp-results",
    "private-normalized",
    "private-raw",
    "review-result",
    "prediction",
  ];
  return [...candidates]
    .filter((candidate) => ["yes", "partial"].includes(candidate.canSupportTargetDate))
    .sort((left, right) => {
      const leftPriority = priority.indexOf(left.sourceType);
      const rightPriority = priority.indexOf(right.sourceType);
      const priorityDiff = (leftPriority === -1 ? 99 : leftPriority) - (rightPriority === -1 ? 99 : rightPriority);
      if (priorityDiff) return priorityDiff;
      return right.targetDateRecordCount - left.targetDateRecordCount;
    })[0] ?? null;
}

function availabilityStatus({ candidates, bestCandidate, blockReasonCounts }) {
  const hasOfficial = candidates.some((candidate) =>
    candidate.sourceType === "official-keirin-jp-results" && candidate.canSupportTargetDate === "yes",
  );
  const hasPrivateNormalized = candidates.some((candidate) =>
    candidate.sourceType === "private-normalized" && ["yes", "partial"].includes(candidate.canSupportTargetDate),
  );
  const hasPrivateRaw = candidates.some((candidate) =>
    candidate.sourceType === "private-raw" && ["yes", "partial"].includes(candidate.canSupportTargetDate),
  );
  const hasReview = candidates.some((candidate) =>
    candidate.sourceType === "review-result" && ["yes", "partial"].includes(candidate.canSupportTargetDate),
  );
  const hasPrediction = candidates.some((candidate) =>
    candidate.sourceType === "prediction" && candidate.targetDateDetected,
  );

  if (hasOfficial) return "READY_FOR_HISTORY_DAILY_GENERATION_DRY_RUN";
  if (hasPrivateNormalized) {
    increment(blockReasonCounts, "WRITER_REQUIRES_NORMALIZED_INPUT");
    return "READY_WITH_PRIVATE_NORMALIZED_SOURCE";
  }
  if (hasPrivateRaw) {
    increment(blockReasonCounts, "WRITER_REQUIRES_PRIVATE_INPUT");
    return "READY_WITH_PRIVATE_RAW_SOURCE";
  }
  if (hasReview) {
    increment(blockReasonCounts, "TARGET_DATE_RESULT_ONLY_IN_REVIEWS");
    return "REVIEW_ONLY_NOT_OFFICIAL_RESULT";
  }
  if (hasPrediction && !bestCandidate) {
    increment(blockReasonCounts, "TARGET_DATE_ONLY_PREDICTION");
    return "PREDICTION_ONLY_NOT_RESULT";
  }
  increment(blockReasonCounts, "NEEDS_RESULT_SOURCE_FOR_TARGET_DATE");
  return "NEEDS_RESULT_SOURCE_FOR_TARGET_DATE";
}

async function buildTargetDateAvailability(candidates, blockReasonCounts) {
  const bestCandidate = chooseBestCandidate(candidates);
  const fallbackCandidates = candidates
    .filter((candidate) => candidate !== bestCandidate && ["yes", "partial"].includes(candidate.canSupportTargetDate))
    .map((candidate) => candidate.sourceId);
  const targetCandidates = candidates.filter((candidate) => candidate.targetDateDetected);
  const totalRecords = targetCandidates.reduce((sum, candidate) => sum + candidate.targetDateRecordCount, 0);
  const totalVenues = Math.max(...targetCandidates.map((candidate) => candidate.venueCountDetected), 0);
  const totalRaces = Math.max(...targetCandidates.map((candidate) => candidate.raceCountDetected), 0);
  const settled = Math.max(...targetCandidates.map((candidate) => candidate.settledRaceCountDetected), 0);
  const cancelled = Math.max(...targetCandidates.map((candidate) => candidate.cancelledRaceCountDetected), 0);
  const completeness = bestCandidate ? resultCompleteness(bestCandidate) : "none";
  const missingFields = bestCandidate
    ? [
        ...Object.entries(bestCandidate.hasResultFields)
          .filter(([, present]) => !present)
          .map(([field]) => `result.${field}`),
        ...Object.entries(bestCandidate.hasHistoryCoreFields)
          .filter(([, present]) => !present)
          .map(([field]) => `history.${field}`),
      ]
    : ["result source candidate"];
  const status = availabilityStatus({ candidates, bestCandidate, blockReasonCounts });
  const blockingReasons = Object.keys(blockReasonCounts);
  return {
    targetDate: TARGET_DATE,
    officialResultSourceExists: candidates.some((candidate) => candidate.sourceType === "official-keirin-jp-results" && candidate.existsNow),
    privateRawTargetDateExists: candidates.some((candidate) => candidate.sourceType === "private-raw" && candidate.targetDateDetected),
    privateNormalizedTargetDateExists: candidates.some((candidate) => candidate.sourceType === "private-normalized" && candidate.targetDateDetected),
    reviewTargetDateExists: candidates.some((candidate) => candidate.sourceType === "review-result" && candidate.targetDateDetected),
    predictionTargetDateExists: candidates.some((candidate) => candidate.sourceType === "prediction" && candidate.targetDateDetected),
    targetDateRaceResultRecordCount:
      bestCandidate?.raceCountDetected ??
      bestCandidate?.targetDateRecordCount ??
      totalRecords,
    targetDateVenueCount: totalVenues,
    targetDateRaceCount: totalRaces,
    targetDateSettledRaceCount: Math.min(
      settled,
      bestCandidate?.raceCountDetected ?? settled,
    ),
    targetDateCancelledRaceCount: cancelled,
    targetDateResultCompleteness: completeness,
    bestResultSourceCandidate: bestCandidate?.sourceId ?? null,
    fallbackResultSourceCandidates: fallbackCandidates,
    missingFields,
    blockingReasons,
    status,
  };
}

async function buildWriterCompatibility(candidates) {
  const normalizedReady = candidates.some((candidate) => candidate.sourceType === "private-normalized" && ["yes", "partial"].includes(candidate.canSupportTargetDate));
  const rawReady = candidates.some((candidate) => candidate.sourceType === "private-raw" && ["yes", "partial"].includes(candidate.canSupportTargetDate));
  const officialReady = candidates.some((candidate) => candidate.sourceType === "official-keirin-jp-results" && candidate.canSupportTargetDate === "yes");
  const writerSpecs = [
    "scripts/export-kurari-ex-compact-history.mjs",
    "scripts/kurari-ex-daily-common.mjs",
    "scripts/kurari-ex-history-common.mjs",
    "scripts/run-kurari-ex-raw-refresh.mjs",
  ];
  const result = [];
  for (const writerPath of writerSpecs) {
    const text = await readTextIfExists(writerPath);
    const normalized = normalizeText(text ?? "");
    const readsNormalized = /readNormalizedRaces|normalizedRacesRoot|private-input.*normalized/u.test(normalized);
    const readsRaw = /rawRoot|scanRawInputs|private-input.*raw/u.test(normalized);
    const readsOfficial = /keirin-jp-results|todayFeedPath|loadDailySource/u.test(normalized);
    const dryRunSupported = /--dry-run|dryRun/u.test(normalized);
    const writesHistoryDaily = /dailyRoot|compactHistoryDailyRoot|writeDailyPayload|history\/daily/u.test(normalized);
    const writesHistoryIndex = /index\.generated\.json|rebuildHistoryMetadata|historyRoot/u.test(normalized);
    const targetDateArgumentSupported = /--date|getArgValue\(.*date|resolveJstDate/u.test(normalized);
    const canUseCandidateSource =
      (readsNormalized && normalizedReady) ||
      (readsRaw && rawReady) ||
      (readsOfficial && officialReady);
    const blockers = [];
    if (!canUseCandidateSource) blockers.push("targetDate compatible source not confirmed for this writer");
    if (!dryRunSupported) blockers.push("dry-run mode not confirmed");
    if (!targetDateArgumentSupported) blockers.push("targetDate argument not confirmed");
    result.push({
      writerPath,
      readsSourceType: [
        readsNormalized ? "private-normalized" : null,
        readsRaw ? "private-raw" : null,
        readsOfficial ? "official-or-current-feed" : null,
      ].filter(Boolean),
      targetDateArgumentSupported,
      dryRunSupported,
      writesHistoryDaily,
      writesHistoryIndex,
      requiresPrivateInput: readsNormalized || readsRaw,
      requiresOfficialResultFeed: readsOfficial,
      canUseCandidateSource,
      compatibility: canUseCandidateSource
        ? dryRunSupported && targetDateArgumentSupported
          ? "ready"
          : "partial"
        : "no",
      blockers,
      nextAction: canUseCandidateSource
        ? "write-safety/dry-run設計でtargetDate単日実行可否を確認する。"
        : "writerが読む入力sourceとtargetDate sourceの対応を追加監査する。",
    });
  }
  return result;
}

function buildNextActionPlan(availability) {
  const prohibitedFiles = [
    "public/data/analytics/**",
    "public/data/races/**",
    "public/data/reviews/**",
    "private-input/**",
    "src/**",
    "package.json",
  ];
  return [
    ["result-source-mapping-audit", "result source mapping audit if schema unknown"],
    ["history-daily-generation-dry-run", "history daily generation dry-run if source ready"],
    ["history-daily-write-safety-audit", "history daily write safety audit"],
    ["history-daily-writer-target-date", "history daily writer execution for targetDate"],
    ["history-index-update-dry-run", "history index update dry-run"],
    ["history-index-write-safety-audit", "history index write safety audit"],
    ["same-date-bridge-dry-run", "same-date bridge dry-run再実行"],
    ["future-bridge-writer", "bridge writerは別工程"],
  ].map(([stepId, action], index) => ({
    stepId,
    action,
    prerequisiteStatus: availability.status,
    allowedFiles:
      index <= 2
        ? ["scripts/audit-*.mjs", "scripts/check-*.mjs"]
        : ["別工程で明示されたwriter/checkerのみ"],
    prohibitedFiles,
    readiness:
      availability.status.startsWith("READY") && index <= 2
        ? "ready"
        : index === 0
          ? "partial"
          : "future-accumulation",
    notes:
      stepId === "future-bridge-writer"
        ? "bridge writerはhistory daily/index生成後の別工程。"
        : "このauditでは生成・書き込み・stageを行わない。",
  }));
}

function normalizeBlockReasons(counter) {
  return Object.fromEntries(
    Object.entries(counter)
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

function printSection(label, value) {
  console.log(`[${label}]`);
  console.log(JSON.stringify(value, null, 2));
}

export async function auditTargetDateResultSourceAvailability() {
  const blockReasonCounts = {};
  const candidates = await buildResultSourceCandidates();
  if (!candidates.some((candidate) => candidate.sourceType === "official-keirin-jp-results" && candidate.existsNow)) {
    increment(blockReasonCounts, "OFFICIAL_RESULT_SOURCE_MISSING");
  }
  if (!candidates.some((candidate) => candidate.sourceType === "private-raw" && candidate.existsNow)) {
    increment(blockReasonCounts, "PRIVATE_RAW_SOURCE_MISSING");
  }
  if (!candidates.some((candidate) => candidate.sourceType === "private-normalized" && candidate.existsNow)) {
    increment(blockReasonCounts, "PRIVATE_NORMALIZED_SOURCE_MISSING");
  }
  const availability = await buildTargetDateAvailability(candidates, blockReasonCounts);
  const writerCompatibility = await buildWriterCompatibility(candidates);
  if (!writerCompatibility.some((writer) => ["ready", "partial"].includes(writer.compatibility))) {
    increment(blockReasonCounts, "WRITER_COMPATIBILITY_UNKNOWN");
  }
  if (!writerCompatibility.some((writer) => writer.dryRunSupported)) {
    increment(blockReasonCounts, "DRY_RUN_MODE_NOT_AVAILABLE");
  }
  const normalizedReasons = normalizeBlockReasons(blockReasonCounts);
  availability.blockingReasons = Object.keys(normalizedReasons);
  const nextActionPlan = buildNextActionPlan(availability);
  const writerCompatibilityStatus = writerCompatibility.some((writer) => writer.compatibility === "ready")
    ? "ready"
    : writerCompatibility.some((writer) => writer.compatibility === "partial")
      ? "partial"
      : "no";
  const summary = {
    targetDate: TARGET_DATE,
    resultSourceCandidateCount: candidates.length,
    officialResultSourceExists: availability.officialResultSourceExists,
    privateRawTargetDateExists: availability.privateRawTargetDateExists,
    privateNormalizedTargetDateExists: availability.privateNormalizedTargetDateExists,
    reviewTargetDateExists: availability.reviewTargetDateExists,
    predictionTargetDateExists: availability.predictionTargetDateExists,
    targetDateRaceResultRecordCount: availability.targetDateRaceResultRecordCount,
    targetDateVenueCount: availability.targetDateVenueCount,
    targetDateRaceCount: availability.targetDateRaceCount,
    targetDateResultCompleteness: availability.targetDateResultCompleteness,
    bestResultSourceCandidate: availability.bestResultSourceCandidate,
    targetDateResultAvailability: { status: availability.status },
    writerCompatibilityStatus,
    blockReasonCounts: normalizedReasons,
    ...FLAGS,
  };
  return {
    summary,
    resultSourceCandidates: limit(candidates),
    targetDateResultAvailability: availability,
    writerCompatibility,
    nextActionPlan,
    jsonSummary: {
      targetDate: TARGET_DATE,
      status: availability.status,
      bestResultSourceCandidate: availability.bestResultSourceCandidate,
      targetDateRaceResultRecordCount: availability.targetDateRaceResultRecordCount,
      writerCompatibilityStatus,
      blockReasonCounts: normalizedReasons,
      ...FLAGS,
    },
  };
}

async function main() {
  const result = await auditTargetDateResultSourceAvailability();
  printSection("summary", result.summary);
  printSection("resultSourceCandidates", result.resultSourceCandidates);
  printSection("targetDateResultAvailability", result.targetDateResultAvailability);
  printSection("writerCompatibility", result.writerCompatibility);
  printSection("nextActionPlan", result.nextActionPlan);
  printSection("jsonSummary", result.jsonSummary);
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  main().catch((error) => {
    console.error("[kurari-ex target date result source availability audit] failed");
    console.error(error);
    process.exitCode = 1;
  });
}
