import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const FROM_DATE = "2026-05-01";
const TO_DATE = "2026-07-01";
const INDEX_PATH = "public/data/analytics/kurari-ex/history/index.generated.json";
const REVIEW_INDEX_PATH = "public/data/reviews/index.json";

function abs(file) {
  return path.isAbsolute(file) ? file : path.resolve(ROOT, file);
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function datesInRange(from, to) {
  const dates = [];
  for (
    let current = new Date(`${from}T00:00:00Z`);
    current <= new Date(`${to}T00:00:00Z`);
    current = new Date(current.getTime() + 86_400_000)
  ) dates.push(current.toISOString().slice(0, 10));
  return dates;
}

async function filesIn(directory) {
  if (!existsSync(abs(directory))) return [];
  const entries = await readdir(abs(directory), { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(directory, entry.name).replaceAll("\\", "/"))
    .sort();
}

function publicToFile(publicPath) {
  return publicPath?.startsWith("/data/") ? `public${publicPath}` : publicPath;
}

function hashPayload(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function typeCount(files, suffix) {
  return files.filter((file) => file.endsWith(suffix)).length;
}

function print(label, value) {
  console.log(`[${label}]`);
  console.log(JSON.stringify(value, null, 2));
}

export async function auditKurariExFullCoverage20260501To20260701(
  { printOutput = true } = {},
) {
  const dates = datesInRange(FROM_DATE, TO_DATE);
  const indexBuffer = await readFile(abs(INDEX_PATH));
  const index = JSON.parse(indexBuffer.toString("utf8"));
  const reviewIndex = JSON.parse(await readFile(abs(REVIEW_INDEX_PATH), "utf8"));
  const indexByDate = new Map(
    array(index.items)
      .filter((item) => item.date >= FROM_DATE && item.date <= TO_DATE)
      .map((item) => [item.date, item]),
  );
  const reviewIndexDates =
    new Set(array(reviewIndex.items).map((item) => item.date));
  const perDateCoverage = [];
  for (const date of dates) {
    const rawDir = `private-input/kurari-ex/raw/${date}`;
    const reviewDir = `public/data/reviews/${date}`;
    const entriesDir = `public/data/races/entries-history/${date}`;
    const startersDir = `public/data/analytics/kurari-ex/source/starters/${date}`;
    const [rawFiles, reviewFiles, entriesFiles, starterFiles] = await Promise.all([
      filesIn(rawDir),
      filesIn(reviewDir),
      filesIn(entriesDir),
      filesIn(startersDir),
    ]);
    const historyEntry = indexByDate.get(date);
    const historyFile = historyEntry ? publicToFile(historyEntry.file) : null;
    let historyRaceCount = null;
    let historyVenueCount = null;
    let starterTotal = null;
    let noStartersRaceCount = null;
    let startersParsedRaceCount = null;
    let historyMode = rawFiles.length || reviewFiles.length
      ? "NOT_IN_HISTORY"
      : "SOURCE_MISSING";
    if (historyFile && existsSync(abs(historyFile))) {
      const daily = JSON.parse(await readFile(abs(historyFile), "utf8"));
      const races = array(daily.items);
      const starters = races.flatMap((race) => array(race.starters));
      historyRaceCount = daily.raceCount;
      historyVenueCount = new Set(races.map((race) => race.venueKey)).size;
      starterTotal = starters.length;
      noStartersRaceCount = races.filter((race) => (
        array(race.starters).length === 0
        && race.quality?.starterParsed === false
      )).length;
      startersParsedRaceCount = races.filter((race) => (
        array(race.starters).length > 0
        && race.quality?.starterParsed === true
      )).length;
      historyMode = noStartersRaceCount === races.length
        ? "NO_STARTERS"
        : startersParsedRaceCount === races.length
          ? "STARTERS_PARSED"
          : "MIXED";
    }
    const resultSourceStatus =
      typeCount(rawFiles, "-result.txt") > 0 ? "READY" : "MISSING";
    const predictionSourceStatus =
      typeCount(rawFiles, "-prediction.txt") > 0 ? "READY" : "MISSING";
    const reviewSourceStatus =
      reviewFiles.length > 0 && reviewIndexDates.has(date) ? "READY" : "MISSING";
    const entriesSourceStatus =
      entriesFiles.length > 0 ? "READY" : "MISSING";
    const startersSourceStatus =
      starterFiles.length > 0 ? "READY" : "MISSING";
    const blockReasons = [];
    if (!rawFiles.length) blockReasons.push("RAW_SOURCE_MISSING");
    if (!reviewFiles.length) blockReasons.push("REVIEW_SOURCE_MISSING");
    if (!historyEntry) blockReasons.push("HISTORY_NOT_BUILT");
    const recommendedAction = historyMode === "STARTERS_PARSED"
      ? "OK_HISTORY_READY"
      : historyMode === "NO_STARTERS"
        ? "NEEDS_STARTERS_BACKFILL"
        : historyMode === "MIXED"
          ? "BLOCKED_REVIEW_REQUIRED"
        : historyMode === "NOT_IN_HISTORY"
          ? "NEEDS_HISTORY_BUILD"
          : "NEEDS_SOURCE_COLLECTION";
    perDateCoverage.push({
      date,
      rawDirExists: existsSync(abs(rawDir)),
      rawFileCount: rawFiles.length,
      reviewDirExists: existsSync(abs(reviewDir)),
      reviewFileCount: reviewFiles.length,
      reviewIndexContainsDate: reviewIndexDates.has(date),
      historyIndexEntryExists: Boolean(historyEntry),
      historyDailyExists: Boolean(historyFile && existsSync(abs(historyFile))),
      historyPublicPath: historyEntry?.file ?? null,
      historyRaceCount,
      historyVenueCount,
      historyMode,
      starterTotal,
      noStartersRaceCount,
      startersParsedRaceCount,
      resultSourceStatus,
      predictionSourceStatus,
      reviewSourceStatus,
      entriesSourceStatus,
      startersSourceStatus,
      recommendedAction,
      blockReasons,
    });
  }
  const count = (predicate) => perDateCoverage.filter(predicate).length;
  const datesFor = (field, value) =>
    perDateCoverage.filter((item) => item[field] === value).map((item) => item.date);
  const summary = {
    auditStatus: "FULL_COVERAGE_AUDIT_COMPLETED",
    fromDate: FROM_DATE,
    toDate: TO_DATE,
    targetDateCount: dates.length,
    indexHash: hashPayload(index),
    indexBytes: indexBuffer.length,
    sourceCount: indexByDate.size,
    dayCount: index.dayCount,
    raceCount: index.raceCount,
    totalBytes: index.totalBytes,
    rawCoverageDateCount: count((item) => item.rawDirExists),
    rawFileCount:
      perDateCoverage.reduce((sum, item) => sum + item.rawFileCount, 0),
    reviewsCoverageDateCount: count((item) => item.reviewDirExists),
    reviewFileCount:
      perDateCoverage.reduce((sum, item) => sum + item.reviewFileCount, 0),
    reviewIndexCoverageDateCount:
      count((item) => item.reviewIndexContainsDate),
    historyCoverageDateCount: count((item) => item.historyDailyExists),
    entriesSourceDateCount: count((item) => item.entriesSourceStatus === "READY"),
    startersSourceDateCount: count((item) => item.startersSourceStatus === "READY"),
    startersParsedDateCount: count((item) => item.historyMode === "STARTERS_PARSED"),
    noStartersDateCount: count((item) => item.historyMode === "NO_STARTERS"),
    mixedDateCount: count((item) => item.historyMode === "MIXED"),
    notInHistoryDateCount: count((item) => item.historyMode === "NOT_IN_HISTORY"),
    sourceMissingDateCount: count((item) => item.historyMode === "SOURCE_MISSING"),
    starterTotal:
      perDateCoverage.reduce((sum, item) => sum + Number(item.starterTotal || 0), 0),
    startersParsedDates: datesFor("historyMode", "STARTERS_PARSED"),
    noStartersDates: datesFor("historyMode", "NO_STARTERS"),
    mixedDates: datesFor("historyMode", "MIXED"),
    notInHistoryDates: datesFor("historyMode", "NOT_IN_HISTORY"),
    sourceMissingDates: datesFor("historyMode", "SOURCE_MISSING"),
    needsSourceCollectionDates:
      datesFor("recommendedAction", "NEEDS_SOURCE_COLLECTION"),
    needsStartersBackfillDates:
      datesFor("recommendedAction", "NEEDS_STARTERS_BACKFILL"),
    blockedReviewRequiredDates:
      datesFor("recommendedAction", "BLOCKED_REVIEW_REQUIRED"),
    writePerformed: false,
  };
  const jsonSummary = {
    auditStatus: summary.auditStatus,
    coverage: {
      raw: summary.rawCoverageDateCount,
      reviews: summary.reviewsCoverageDateCount,
      history: summary.historyCoverageDateCount,
      target: summary.targetDateCount,
    },
    writePerformed: false,
  };
  if (printOutput) {
    print("summary", summary);
    print("perDateCoverage", perDateCoverage);
    print("jsonSummary", jsonSummary);
  }
  return { summary, perDateCoverage, jsonSummary };
}

const isMain =
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  auditKurariExFullCoverage20260501To20260701().catch((error) => {
    console.error("[kurari-ex full coverage audit] failed");
    console.error(error);
    process.exitCode = 1;
  });
}
