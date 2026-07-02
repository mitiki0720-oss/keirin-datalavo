import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const TARGET_DATES = ["2026-06-30", "2026-07-01"];
const INDEX_PATH = "public/data/analytics/kurari-ex/history/index.generated.json";
const REVIEW_INDEX_PATH = "public/data/reviews/index.json";
const GENERIC_PARSER =
  "scripts/audit-kurari-ex-private-raw-history-daily-mapping-dry-run.mjs";

function abs(file) {
  return path.isAbsolute(file) ? file : path.resolve(ROOT, file);
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function hashPayload(payload) {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex")}`;
}

async function filesIn(directory) {
  if (!existsSync(abs(directory))) return [];
  const entries = await readdir(abs(directory), { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(directory, entry.name).replaceAll("\\", "/"))
    .sort();
}

function typeOfTextFile(file) {
  if (/-result\.txt$/u.test(file)) return "result";
  if (/-prediction\.txt$/u.test(file)) return "prediction";
  if (/-summary\.txt$/u.test(file)) return "summary";
  return "other";
}

function venueSlug(file) {
  return path.basename(file).replace(/-(?:result|prediction|summary)\.txt$/u, "");
}

async function loadParser(date) {
  let source = await readFile(abs(GENERIC_PARSER), "utf8");
  const target = 'const TARGET_DATE = "2026-06-29";';
  if (!source.includes(target)) throw new Error("generic parser target constant missing");
  source = source.replace(target, `const TARGET_DATE = "${date}";`);
  source += `

export async function __parseForNextAvailabilityAudit() {
  const blockReasonCounts = {};
  const scan = await privateRawScan(blockReasonCounts);
  const parsedResults = await Promise.all(scan.filesByType.result.map(parseResultFile));
  const parsedPredictions = await Promise.all(
    scan.filesByType.prediction.map(parsePredictionFile),
  );
  return {
    resultSummary: summarizeParsedResults(parsedResults, blockReasonCounts),
    predictionSummary: summarizePredictions(parsedPredictions, blockReasonCounts),
  };
}
`;
  const url =
    `data:text/javascript;base64,${Buffer.from(source, "utf8").toString("base64")}`;
  return import(url);
}

function indexItems(payload) {
  if (Array.isArray(payload)) return payload;
  return array(payload?.items);
}

function duplicates(values) {
  return values.length - new Set(values).size;
}

function statusForSource(count, expected, missing, ambiguous) {
  if (count === 0) return missing;
  return count === expected ? "READY" : ambiguous;
}

async function inspectDate(date, historyIndex, reviewIndex) {
  const rawRoot = `private-input/kurari-ex/raw/${date}`;
  const reviewRoot = `public/data/reviews/${date}`;
  const dailyPath =
    `public/data/analytics/kurari-ex/history/daily/${date.slice(0, 7)}/${date}.generated.json`;
  const startersRoot = `public/data/analytics/kurari-ex/source/starters/${date}`;
  const entriesRoot = `public/data/races/entries-history/${date}`;
  const [rawFiles, reviewFiles, starterFiles, entriesFiles, parser] =
    await Promise.all([
      filesIn(rawRoot),
      filesIn(reviewRoot),
      filesIn(startersRoot),
      filesIn(entriesRoot),
      loadParser(date),
    ]);
  const parsed = await parser.__parseForNextAvailabilityAudit();
  const results = array(parsed.resultSummary?.races);
  const predictions = array(parsed.predictionSummary?.races);
  const resultKeys = results.map((race) => race.raceKey).filter(Boolean);
  const predictionKeys = predictions.map((race) => race.raceKey).filter(Boolean);
  const predictionKeySet = new Set(predictionKeys);
  const resultVenueKeys = new Set(results.map((race) => race.venueKey).filter(Boolean));

  const rawResultFiles = rawFiles.filter((file) => typeOfTextFile(file) === "result");
  const rawPredictionFiles =
    rawFiles.filter((file) => typeOfTextFile(file) === "prediction");
  const reviewResultFiles =
    reviewFiles.filter((file) => typeOfTextFile(file) === "result");
  const reviewPredictionFiles =
    reviewFiles.filter((file) => typeOfTextFile(file) === "prediction");
  const reviewSummaryFiles =
    reviewFiles.filter((file) => typeOfTextFile(file) === "summary");
  const reviewSummaryVenues = new Set(reviewSummaryFiles.map(venueSlug));
  const reviewIndexEntries =
    indexItems(reviewIndex).filter((item) => item?.date === date);
  const historyEntries =
    array(historyIndex?.items).filter((item) => item?.date === date);

  const resultSourceStatus = results.length > 0
    && parsed.resultSummary?.resultCompleteness === "complete"
    && rawResultFiles.length === resultVenueKeys.size
    ? "READY_WITH_PRIVATE_RAW_SOURCE"
    : rawResultFiles.length === 0
      ? "MISSING_REQUIRED_SOURCE"
      : "AMBIGUOUS";
  const predictionSourceStatus = statusForSource(
    rawPredictionFiles.length,
    resultVenueKeys.size,
    "MISSING_REQUIRED_SOURCE",
    "AMBIGUOUS",
  );
  const reviewReady = [
    reviewResultFiles.length,
    reviewPredictionFiles.length,
    reviewSummaryFiles.length,
    reviewIndexEntries.length,
  ].every((count) => count === resultVenueKeys.size);
  const reviewSourceStatus = reviewFiles.length === 0
    ? "MISSING_REQUIRED_SOURCE"
    : reviewReady
      ? "READY"
      : "AMBIGUOUS";
  const startersSourceStatus =
    starterFiles.length === 0 ? "MISSING" : starterFiles.length === 1 ? "READY" : "AMBIGUOUS";
  const entriesSnapshotStatus =
    entriesFiles.length === 0 ? "MISSING" : entriesFiles.length === 1 ? "READY" : "AMBIGUOUS";

  const resultPredictionExact =
    results.length > 0
    && results.length === predictions.length
    && duplicates(resultKeys) === 0
    && duplicates(predictionKeys) === 0
    && resultKeys.every((key) => predictionKeySet.has(key));
  const reviewVenueExact =
    resultVenueKeys.size > 0
    && [...resultVenueKeys].every((key) => reviewSummaryVenues.has(key));
  const exactMappingRisk =
    resultPredictionExact && reviewVenueExact ? "LOW"
      : results.length > 0 && predictions.length > 0 ? "MEDIUM"
        : "HIGH";
  const alreadyInHistory = historyEntries.length > 0 || existsSync(abs(dailyPath));
  const requiredSourcesReady =
    resultSourceStatus === "READY_WITH_PRIVATE_RAW_SOURCE"
    && predictionSourceStatus === "READY"
    && reviewSourceStatus === "READY"
    && exactMappingRisk === "LOW";
  const noStartersCandidatePossible =
    !alreadyInHistory
    && requiredSourcesReady
    && startersSourceStatus === "MISSING"
    && entriesSnapshotStatus === "MISSING";
  const startersBridgeCandidatePossible =
    !alreadyInHistory
    && requiredSourcesReady
    && startersSourceStatus === "READY"
    && entriesSnapshotStatus === "READY";
  const blockReasons = [];
  if (alreadyInHistory) blockReasons.push("TARGET_DATE_ALREADY_IN_HISTORY");
  if (resultSourceStatus === "MISSING_REQUIRED_SOURCE") blockReasons.push("RESULT_SOURCE_MISSING");
  if (predictionSourceStatus === "MISSING_REQUIRED_SOURCE") {
    blockReasons.push("PREDICTION_SOURCE_MISSING");
  }
  if (reviewSourceStatus === "MISSING_REQUIRED_SOURCE") blockReasons.push("REVIEW_SOURCE_MISSING");
  if (startersSourceStatus === "AMBIGUOUS") blockReasons.push("STARTERS_SOURCE_AMBIGUOUS");
  if (entriesSnapshotStatus === "AMBIGUOUS") blockReasons.push("ENTRIES_SOURCE_AMBIGUOUS");
  if (
    exactMappingRisk !== "LOW"
    && results.length > 0
    && predictions.length > 0
    && reviewFiles.length > 0
  ) {
    blockReasons.push("EXACT_MAPPING_AMBIGUOUS");
  }
  if (results.length === 0 && rawResultFiles.length > 0) {
    blockReasons.push("SOURCE_RACE_COUNT_NOT_MEASURABLE");
  }
  const recommendedNextAction = alreadyInHistory
    ? "ALREADY_IN_HISTORY"
    : noStartersCandidatePossible
      ? "READY_FOR_NO_STARTERS_HISTORY_BATCH"
      : startersBridgeCandidatePossible
        ? "READY_FOR_STARTERS_BRIDGE_HISTORY_BATCH"
        : blockReasons.some((reason) => reason.includes("AMBIGUOUS"))
          ? "BLOCKED_REVIEW_REQUIRED"
          : "NEEDS_SOURCE_COLLECTION";

  return {
    targetDate: date,
    historyIndexEntryExists: historyEntries.length > 0,
    historyDailyExists: existsSync(abs(dailyPath)),
    resultSourceStatus,
    predictionSourceStatus,
    reviewSourceStatus,
    startersSourceStatus,
    entriesSnapshotStatus,
    publicReviewDirExists: existsSync(abs(reviewRoot)),
    privateRawDirExists: existsSync(abs(rawRoot)),
    candidateResultFiles: rawResultFiles,
    candidatePredictionFiles: rawPredictionFiles,
    candidateReviewFiles: reviewFiles,
    candidateStarterFiles: starterFiles,
    candidateEntriesFiles: entriesFiles,
    estimatedRaceCountFromResultSource: results.length || null,
    estimatedReviewLinkedRaceCount:
      reviewVenueExact ? results.filter((race) => reviewSummaryVenues.has(race.venueKey)).length : null,
    estimatedPredictionLinkedRaceCount:
      resultPredictionExact ? results.length : null,
    noStartersCandidatePossible,
    startersBridgeCandidatePossible,
    exactMappingRisk,
    recommendedNextAction,
    blockReasons,
  };
}

function printSection(label, value) {
  console.log(`[${label}]`);
  console.log(JSON.stringify(value, null, 2));
}

export async function auditKurariExHistoryAvailabilityNextBatch20260630To20260701() {
  const indexBuffer = await readFile(abs(INDEX_PATH));
  const index = JSON.parse(indexBuffer.toString("utf8"));
  const reviewIndex = JSON.parse(await readFile(abs(REVIEW_INDEX_PATH), "utf8"));
  const perDateAvailability = [];
  for (const date of TARGET_DATES) {
    perDateAvailability.push(await inspectDate(date, index, reviewIndex));
  }
  const byAction = (action) =>
    perDateAvailability
      .filter((item) => item.recommendedNextAction === action)
      .map((item) => item.targetDate);
  const blockReasonCounts = {};
  for (const reason of perDateAvailability.flatMap((item) => item.blockReasons)) {
    blockReasonCounts[reason] = (blockReasonCounts[reason] ?? 0) + 1;
  }
  const readyForNoStartersHistoryBatchDates =
    byAction("READY_FOR_NO_STARTERS_HISTORY_BATCH");
  const readyForStartersBridgeHistoryBatchDates =
    byAction("READY_FOR_STARTERS_BRIDGE_HISTORY_BATCH");
  const needsSourceCollectionDates = byAction("NEEDS_SOURCE_COLLECTION");
  const alreadyInHistoryDates = byAction("ALREADY_IN_HISTORY");
  const blockedDates = byAction("BLOCKED_REVIEW_REQUIRED");
  const latest = array(index.items).at(-1);
  const summary = {
    auditStatus: "NEXT_AVAILABILITY_AUDIT_COMPLETED",
    checkedDates: TARGET_DATES,
    readyForNoStartersHistoryBatchDates,
    readyForStartersBridgeHistoryBatchDates,
    needsSourceCollectionDates,
    alreadyInHistoryDates,
    blockedDates,
    recommendedOrder: [
      ...readyForStartersBridgeHistoryBatchDates,
      ...readyForNoStartersHistoryBatchDates,
      ...needsSourceCollectionDates,
      ...blockedDates,
    ],
    indexHash: hashPayload(index),
    indexBytes: indexBuffer.length,
    sourceCount: array(index.items).length,
    dayCount: index.dayCount,
    raceCount: index.raceCount,
    latestDate: latest?.date ?? null,
    latestPath: latest?.file ?? null,
    writePerformed: false,
    blockReasonCounts,
  };
  const nextActionPlan = perDateAvailability.map((item) => ({
    targetDate: item.targetDate,
    recommendedNextAction: item.recommendedNextAction,
    reason: item.noStartersCandidatePossible
      ? "result, prediction, and review are exact-mappable; starters and entries are absent"
      : item.blockReasons,
  }));
  const jsonSummary = {
    auditStatus: summary.auditStatus,
    checkedDates: summary.checkedDates,
    recommendedOrder: summary.recommendedOrder,
    writePerformed: false,
  };
  printSection("summary", summary);
  printSection("perDateAvailability", perDateAvailability);
  printSection("nextActionPlan", nextActionPlan);
  printSection("jsonSummary", jsonSummary);
  return { summary, perDateAvailability, nextActionPlan, jsonSummary };
}

const isMain =
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  auditKurariExHistoryAvailabilityNextBatch20260630To20260701().catch((error) => {
    console.error("[kurari-ex next history availability audit] failed");
    console.error(error);
    process.exitCode = 1;
  });
}
