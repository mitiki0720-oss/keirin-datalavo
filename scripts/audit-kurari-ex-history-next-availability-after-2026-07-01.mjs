import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const AUDIT_AS_OF_DATE = "2026-07-02";
const DATES = ["2026-07-02", "2026-07-03", "2026-07-04"];
const INDEX_PATH = "public/data/analytics/kurari-ex/history/index.generated.json";

function abs(file) {
  return path.isAbsolute(file) ? file : path.resolve(ROOT, file);
}

async function filesIn(directory) {
  if (!existsSync(abs(directory))) return [];
  const output = [];
  async function visit(current) {
    const entries = await readdir(abs(current), { withFileTypes: true });
    for (const entry of entries) {
      const child = path.join(current, entry.name).replaceAll("\\", "/");
      if (entry.isDirectory()) await visit(child);
      if (entry.isFile()) output.push(child);
    }
  }
  await visit(directory);
  return output.sort();
}

function fileType(file) {
  if (/-result\.txt$/u.test(file)) return "result";
  if (/-prediction\.txt$/u.test(file)) return "prediction";
  if (/-summary\.txt$/u.test(file)) return "review";
  return "other";
}

function print(label, value) {
  console.log(`[${label}]`);
  console.log(JSON.stringify(value, null, 2));
}

export async function auditKurariExHistoryNextAvailabilityAfter20260701(
  { printOutput = true } = {},
) {
  const index = JSON.parse(await readFile(abs(INDEX_PATH), "utf8"));
  const indexDates = new Set((index.items ?? []).map((item) => item.date));
  const perDateAvailability = [];
  for (const date of DATES) {
    const rawRoot = `private-input/kurari-ex/raw/${date}`;
    const reviewRoot = `public/data/reviews/${date}`;
    const startersRoot = `public/data/analytics/kurari-ex/source/starters/${date}`;
    const entriesRoot = `public/data/races/entries-history/${date}`;
    const [rawFiles, reviewFiles, starterFiles, entriesFiles] = await Promise.all([
      filesIn(rawRoot),
      filesIn(reviewRoot),
      filesIn(startersRoot),
      filesIn(entriesRoot),
    ]);
    const resultFiles = rawFiles.filter((file) => fileType(file) === "result");
    const predictionFiles =
      rawFiles.filter((file) => fileType(file) === "prediction");
    const reviewResultFiles =
      reviewFiles.filter((file) => fileType(file) === "result");
    const reviewPredictionFiles =
      reviewFiles.filter((file) => fileType(file) === "prediction");
    const reviewSummaryFiles =
      reviewFiles.filter((file) => fileType(file) === "review");
    const dailyPath =
      `public/data/analytics/kurari-ex/history/daily/${date.slice(0, 7)}/${date}.generated.json`;
    const alreadyInHistory =
      indexDates.has(date) || existsSync(abs(dailyPath));
    const dateNotFinalized = date >= AUDIT_AS_OF_DATE;
    const resultSourceStatus = resultFiles.length
      ? dateNotFinalized ? "NOT_FINALIZED" : "READY_WITH_PRIVATE_RAW_SOURCE"
      : dateNotFinalized ? "NOT_FINALIZED" : "MISSING_REQUIRED_SOURCE";
    const predictionSourceStatus = predictionFiles.length
      ? dateNotFinalized ? "NOT_FINALIZED" : "READY"
      : dateNotFinalized ? "NOT_FINALIZED" : "MISSING_REQUIRED_SOURCE";
    const reviewSourceStatus =
      reviewResultFiles.length && reviewPredictionFiles.length && reviewSummaryFiles.length
        ? dateNotFinalized ? "NOT_FINALIZED" : "READY"
        : dateNotFinalized ? "NOT_FINALIZED" : "MISSING_REQUIRED_SOURCE";
    const startersSourceStatus =
      starterFiles.length === 0 ? "MISSING" : starterFiles.length === 1 ? "READY" : "AMBIGUOUS";
    const entriesSnapshotStatus =
      entriesFiles.length === 0 ? "MISSING" : entriesFiles.length === 1 ? "READY" : "AMBIGUOUS";
    const blockReasons = [];
    if (dateNotFinalized) blockReasons.push("SOURCE_NOT_FINALIZED");
    if (!dateNotFinalized && !resultFiles.length) blockReasons.push("RESULT_SOURCE_MISSING");
    if (!dateNotFinalized && !predictionFiles.length) {
      blockReasons.push("PREDICTION_SOURCE_MISSING");
    }
    if (!dateNotFinalized && !reviewFiles.length) blockReasons.push("REVIEW_SOURCE_MISSING");
    if (startersSourceStatus === "AMBIGUOUS" || entriesSnapshotStatus === "AMBIGUOUS") {
      blockReasons.push("SOURCE_AMBIGUOUS");
    }
    const recommendedNextAction = alreadyInHistory
      ? "ALREADY_IN_HISTORY"
      : dateNotFinalized
        ? "NOT_FINALIZED"
        : "NEEDS_SOURCE_COLLECTION";
    perDateAvailability.push({
      targetDate: date,
      historyIndexEntryExists: indexDates.has(date),
      historyDailyExists: existsSync(abs(dailyPath)),
      publicReviewDirExists: existsSync(abs(reviewRoot)),
      privateRawDirExists: existsSync(abs(rawRoot)),
      resultSourceStatus,
      predictionSourceStatus,
      reviewSourceStatus,
      startersSourceStatus,
      entriesSnapshotStatus,
      candidateResultFiles: resultFiles,
      candidatePredictionFiles: predictionFiles,
      candidateReviewFiles: reviewFiles,
      candidateStarterFiles: starterFiles,
      candidateEntriesFiles: entriesFiles,
      estimatedRaceCountFromResultSource: null,
      estimatedPredictionLinkedRaceCount: null,
      estimatedReviewLinkedRaceCount: null,
      noStartersCandidatePossible: false,
      startersBridgeCandidatePossible: false,
      exactMappingRisk: "UNKNOWN",
      recommendedNextAction,
      blockReasons,
    });
  }
  const datesFor = (action) =>
    perDateAvailability
      .filter((item) => item.recommendedNextAction === action)
      .map((item) => item.targetDate);
  const blockReasonCounts = {};
  for (const reason of perDateAvailability.flatMap((item) => item.blockReasons)) {
    blockReasonCounts[reason] = (blockReasonCounts[reason] ?? 0) + 1;
  }
  const summary = {
    finalStatus: "NEXT_AVAILABILITY_AFTER_2026_07_01_AUDIT_COMPLETED",
    checkedDates: DATES,
    readyForNoStartersHistoryBatchDates: [],
    readyForStartersBridgeHistoryBatchDates: [],
    needsSourceCollectionDates: datesFor("NEEDS_SOURCE_COLLECTION"),
    notFinalizedDates: datesFor("NOT_FINALIZED"),
    blockedDates: datesFor("BLOCKED_REVIEW_REQUIRED"),
    recommendedOrder: [],
    blockReasonCounts,
  };
  const jsonSummary = {
    finalStatus: summary.finalStatus,
    auditAsOfDate: AUDIT_AS_OF_DATE,
    actionableDates: summary.recommendedOrder,
    writePerformed: false,
  };
  if (printOutput) {
    print("summary", summary);
    print("perDateAvailability", perDateAvailability);
    print("jsonSummary", jsonSummary);
  }
  return { summary, perDateAvailability, jsonSummary };
}

const isMain =
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  auditKurariExHistoryNextAvailabilityAfter20260701().catch((error) => {
    console.error("[kurari-ex next availability after 2026-07-01] failed");
    console.error(error);
    process.exitCode = 1;
  });
}
