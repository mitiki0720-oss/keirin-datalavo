import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  TARGET_DATE,
  DAILY_PATH,
  INDEX_PATH,
  DAILY_PUBLIC_PATH,
  SOURCE_PATH,
  ENTRIES_PATH,
  CURRENT_DAILY_HASH,
  CANDIDATE_DAILY_HASH,
  CURRENT_INDEX_HASH,
  CANDIDATE_INDEX_HASH,
  CANDIDATE_DAILY_BYTES,
  CANDIDATE_TOTAL_BYTES,
  array,
  text,
  hashPayload,
  readJson,
  exactJoin,
  buildDailyCandidate,
  buildIndexCandidate,
  reconstructBaselineDaily,
  reconstructBaselineIndex,
  stripStarterChanges,
  protectedGuard,
} from "./write-kurari-ex-combined-history-starters-bridge-2026-06-29.mjs";

function countDuplicates(values) {
  const seen = new Set();
  let duplicates = 0;
  for (const value of values.filter(Boolean)) {
    if (seen.has(value)) duplicates += 1;
    seen.add(value);
  }
  return duplicates;
}

function fieldChangedCount(before, after, field) {
  return before.filter(
    (item, index) =>
      JSON.stringify(item?.[field]) !== JSON.stringify(after[index]?.[field]),
  ).length;
}

function printSection(name, value) {
  console.log(`\n[${name}]`);
  console.log(JSON.stringify(value, null, 2));
}

export async function checkCombinedBridge() {
  const [dailyRead, indexRead, sourceRead, entriesRead] = await Promise.all([
    readJson(DAILY_PATH),
    readJson(INDEX_PATH),
    readJson(SOURCE_PATH),
    readJson(ENTRIES_PATH),
  ]);
  const daily = dailyRead.payload ?? {};
  const index = indexRead.payload ?? {};
  const source = sourceRead.payload ?? {};
  const entries = entriesRead.payload ?? {};
  const items = array(daily.items);
  const starters = items.flatMap((item) => array(item.starters));
  const sourceRaces = array(source.races);
  const entryRaces = array(entries.races);
  const baselineDaily = reconstructBaselineDaily(daily);
  const baselineIndex = reconstructBaselineIndex(index);
  const baselineJoin = exactJoin(array(baselineDaily.items), sourceRaces);
  const expectedDaily = buildDailyCandidate(baselineDaily, baselineJoin);
  const expectedIndex = buildIndexCandidate(baselineIndex);
  const expectedItems = array(expectedDaily.items);
  const target = array(index.items).find((item) => item.date === TARGET_DATE);
  const latest = [...array(index.items)].sort((a, b) =>
    text(a.date).localeCompare(text(b.date))).at(-1);
  const sourceByKey = new Map(
    sourceRaces.map((race) => [
      `${text(race.date)}::${text(race.venueName)}::${text(race.raceNumber)}`,
      race,
    ]),
  );
  let exactRejoinMatchedCount = 0;
  let starterMismatchRaceCount = 0;
  for (const item of items) {
    const sourceRace = sourceByKey.get(
      `${text(item.date)}::${text(item.venueName)}::${text(item.raceNumber)}`,
    );
    if (!sourceRace) continue;
    exactRejoinMatchedCount += 1;
    if (JSON.stringify(item.starters) !== JSON.stringify(sourceRace.starters)) {
      starterMismatchRaceCount += 1;
    }
  }
  const historyDailyCheck = {
    fileExists: dailyRead.exists,
    parseStatus: dailyRead.parseStatus,
    date: daily.date ?? null,
    historyDailyHash: dailyRead.payload ? hashPayload(daily) : null,
    expectedHistoryDailyHash: CANDIDATE_DAILY_HASH,
    historyDailyHashMatched:
      dailyRead.payload && hashPayload(daily) === CANDIDATE_DAILY_HASH,
    historyDailyBytes: dailyRead.bytes,
    expectedHistoryDailyBytes: CANDIDATE_DAILY_BYTES,
    historyDailyBytesMatched: dailyRead.bytes === CANDIDATE_DAILY_BYTES,
    raceCount: items.length,
    venueCount: new Set(items.map((item) => item.venueName).filter(Boolean)).size,
    startersNonEmptyRaceCount:
      items.filter((item) => array(item.starters).length > 0).length,
    startersEmptyRaceCount:
      items.filter((item) => array(item.starters).length === 0).length,
    starterTotalCount: starters.length,
    missingRegistrationNoCount:
      starters.filter((starter) => !text(starter.registrationNo)).length,
    duplicateCarNoWithinRaceCount: items.filter(
      (item) =>
        countDuplicates(array(item.starters).map((starter) => starter.carNo)) > 0,
    ).length,
    duplicateRegistrationNoWithinRaceCount: items.filter(
      (item) =>
        countDuplicates(
          array(item.starters).map((starter) => starter.registrationNo),
        ) > 0,
    ).length,
    qualityStarterParsedTrueCount:
      items.filter((item) => item?.quality?.starterParsed === true).length,
    qualityStarterParsedFalseCount:
      items.filter((item) => item?.quality?.starterParsed === false).length,
  };
  const historyIndexCheck = {
    fileExists: indexRead.exists,
    parseStatus: indexRead.parseStatus,
    historyIndexHash: indexRead.payload ? hashPayload(index) : null,
    expectedHistoryIndexHash: CANDIDATE_INDEX_HASH,
    historyIndexHashMatched:
      indexRead.payload && hashPayload(index) === CANDIDATE_INDEX_HASH,
    sourceCount: array(index.items).length,
    dayCount: index.dayCount ?? null,
    raceCount: index.raceCount ?? null,
    latestDate: latest?.date ?? null,
    latestPath: latest?.file ?? null,
    indexTotalBytes: index.totalBytes ?? null,
    expectedIndexTotalBytes: CANDIDATE_TOTAL_BYTES,
    indexTotalBytesMatched: index.totalBytes === CANDIDATE_TOTAL_BYTES,
    targetDateIndexBytes: target?.bytes ?? null,
    expectedTargetDateIndexBytes: CANDIDATE_DAILY_BYTES,
    targetDateIndexBytesMatched: target?.bytes === CANDIDATE_DAILY_BYTES,
    targetDateIndexBytesMatchedActualDailyBytes: target?.bytes === dailyRead.bytes,
    targetDatePath: target?.file ?? null,
    targetDateRaceCount: target?.raceCount ?? null,
    baselineIndexHash: hashPayload(baselineIndex),
    expectedBaselineIndexHash: CURRENT_INDEX_HASH,
    baselineIndexHashMatched: hashPayload(baselineIndex) === CURRENT_INDEX_HASH,
    otherItemsChangedCount: array(baselineIndex.items).filter(
      (item, itemIndex) =>
        item.date !== TARGET_DATE
        && JSON.stringify(item) !== JSON.stringify(index.items[itemIndex]),
    ).length,
  };
  const sourceRejoinCheck = {
    exactRejoinMatchedCount,
    starterMismatchRaceCount,
    sourceRaceCount: sourceRaces.length,
    sourceStarterTotalCount:
      sourceRaces.flatMap((race) => array(race.starters)).length,
    entriesRaceCount: entryRaces.length,
    entriesStarterTotalCount:
      entryRaces.flatMap((race) => array(race.entries)).length,
  };
  const baselineItems = array(baselineDaily.items);
  const nonStarterFieldCheck = {
    baselineDailyHash: hashPayload(baselineDaily),
    expectedBaselineDailyHash: CURRENT_DAILY_HASH,
    baselineDailyHashMatched: hashPayload(baselineDaily) === CURRENT_DAILY_HASH,
    expectedCandidateDailyHash: hashPayload(expectedDaily),
    expectedCandidateDailyHashMatched:
      hashPayload(expectedDaily) === CANDIDATE_DAILY_HASH,
    expectedCandidateIndexHash: hashPayload(expectedIndex),
    expectedCandidateIndexHashMatched:
      hashPayload(expectedIndex) === CANDIDATE_INDEX_HASH,
    nonStarterFieldChangedCount: baselineItems.filter(
      (item, itemIndex) =>
        JSON.stringify(stripStarterChanges(item))
        !== JSON.stringify(stripStarterChanges(items[itemIndex])),
    ).length,
    resultChangedCount: fieldChangedCount(baselineItems, items, "result"),
    predictionChangedCount:
      fieldChangedCount(baselineItems, items, "prediction"),
    lineupChangedCount: fieldChangedCount(baselineItems, items, "lineup"),
    weatherChangedCount: fieldChangedCount(baselineItems, items, "weather"),
  };
  const countReconciliation = {
    historyRaceCount: items.length,
    sourceRaceCount: sourceRaces.length,
    entriesRaceCount: entryRaces.length,
    starterTotalCount: starters.length,
    sourceStarterTotalCount: sourceRejoinCheck.sourceStarterTotalCount,
    entriesStarterTotalCount: sourceRejoinCheck.entriesStarterTotalCount,
    actualDailyBytes: dailyRead.bytes,
    targetDateIndexBytes: target?.bytes ?? null,
    indexTotalBytes: index.totalBytes ?? null,
    countReconciliationStatus:
      items.length === 64
      && sourceRaces.length === 64
      && entryRaces.length === 64
      && starters.length === 464
      && sourceRejoinCheck.sourceStarterTotalCount === 464
      && sourceRejoinCheck.entriesStarterTotalCount === 464
      && dailyRead.bytes === CANDIDATE_DAILY_BYTES
      && target?.bytes === dailyRead.bytes
      && index.totalBytes === CANDIDATE_TOTAL_BYTES
        ? "OK"
        : "FAIL",
  };
  const guard = protectedGuard();
  const pass =
    historyDailyCheck.fileExists
    && historyDailyCheck.parseStatus === "ok"
    && historyDailyCheck.date === TARGET_DATE
    && historyDailyCheck.historyDailyHashMatched
    && historyDailyCheck.historyDailyBytesMatched
    && historyDailyCheck.raceCount === 64
    && historyDailyCheck.venueCount === 7
    && historyDailyCheck.startersNonEmptyRaceCount === 64
    && historyDailyCheck.startersEmptyRaceCount === 0
    && historyDailyCheck.starterTotalCount === 464
    && historyDailyCheck.missingRegistrationNoCount === 0
    && historyDailyCheck.duplicateCarNoWithinRaceCount === 0
    && historyDailyCheck.duplicateRegistrationNoWithinRaceCount === 0
    && historyDailyCheck.qualityStarterParsedTrueCount === 64
    && historyDailyCheck.qualityStarterParsedFalseCount === 0
    && historyIndexCheck.historyIndexHashMatched
    && historyIndexCheck.sourceCount === 53
    && historyIndexCheck.dayCount === 53
    && historyIndexCheck.raceCount === 3997
    && historyIndexCheck.latestDate === TARGET_DATE
    && historyIndexCheck.latestPath === DAILY_PUBLIC_PATH
    && historyIndexCheck.indexTotalBytesMatched
    && historyIndexCheck.targetDateIndexBytesMatched
    && historyIndexCheck.targetDateIndexBytesMatchedActualDailyBytes
    && historyIndexCheck.targetDatePath === DAILY_PUBLIC_PATH
    && historyIndexCheck.targetDateRaceCount === 64
    && historyIndexCheck.otherItemsChangedCount === 0
    && exactRejoinMatchedCount === 64
    && starterMismatchRaceCount === 0
    && nonStarterFieldCheck.baselineDailyHashMatched
    && nonStarterFieldCheck.expectedCandidateDailyHashMatched
    && nonStarterFieldCheck.expectedCandidateIndexHashMatched
    && nonStarterFieldCheck.nonStarterFieldChangedCount === 0
    && nonStarterFieldCheck.resultChangedCount === 0
    && nonStarterFieldCheck.predictionChangedCount === 0
    && nonStarterFieldCheck.lineupChangedCount === 0
    && nonStarterFieldCheck.weatherChangedCount === 0
    && countReconciliation.countReconciliationStatus === "OK"
    && guard.guardStatus === "pass";
  const summary = {
    targetDate: TARGET_DATE,
    historyDailyPath: DAILY_PATH,
    historyIndexPath: INDEX_PATH,
    dailyFileExists: historyDailyCheck.fileExists,
    indexFileExists: historyIndexCheck.fileExists,
    dailyParseStatus: historyDailyCheck.parseStatus,
    indexParseStatus: historyIndexCheck.parseStatus,
    historyDailyHash: historyDailyCheck.historyDailyHash,
    expectedHistoryDailyHash: CANDIDATE_DAILY_HASH,
    historyDailyHashMatched: historyDailyCheck.historyDailyHashMatched,
    historyDailyBytes: dailyRead.bytes,
    expectedHistoryDailyBytes: CANDIDATE_DAILY_BYTES,
    historyDailyBytesMatched: historyDailyCheck.historyDailyBytesMatched,
    historyIndexHash: historyIndexCheck.historyIndexHash,
    expectedHistoryIndexHash: CANDIDATE_INDEX_HASH,
    historyIndexHashMatched: historyIndexCheck.historyIndexHashMatched,
    indexTotalBytes: index.totalBytes ?? null,
    expectedIndexTotalBytes: CANDIDATE_TOTAL_BYTES,
    indexTotalBytesMatched: historyIndexCheck.indexTotalBytesMatched,
    targetDateIndexBytes: target?.bytes ?? null,
    expectedTargetDateIndexBytes: CANDIDATE_DAILY_BYTES,
    targetDateIndexBytesMatched:
      historyIndexCheck.targetDateIndexBytesMatched,
    targetDateIndexBytesMatchedActualDailyBytes:
      historyIndexCheck.targetDateIndexBytesMatchedActualDailyBytes,
    sourceCount: historyIndexCheck.sourceCount,
    dayCount: historyIndexCheck.dayCount,
    raceCount: historyIndexCheck.raceCount,
    latestDate: historyIndexCheck.latestDate,
    latestPath: historyIndexCheck.latestPath,
    startersNonEmptyRaceCount:
      historyDailyCheck.startersNonEmptyRaceCount,
    startersEmptyRaceCount: historyDailyCheck.startersEmptyRaceCount,
    starterTotalCount: historyDailyCheck.starterTotalCount,
    missingRegistrationNoCount:
      historyDailyCheck.missingRegistrationNoCount,
    duplicateCarNoWithinRaceCount:
      historyDailyCheck.duplicateCarNoWithinRaceCount,
    duplicateRegistrationNoWithinRaceCount:
      historyDailyCheck.duplicateRegistrationNoWithinRaceCount,
    qualityStarterParsedTrueCount:
      historyDailyCheck.qualityStarterParsedTrueCount,
    qualityStarterParsedFalseCount:
      historyDailyCheck.qualityStarterParsedFalseCount,
    exactRejoinMatchedCount,
    sourceStarterTotalCount: sourceRejoinCheck.sourceStarterTotalCount,
    entriesStarterTotalCount: sourceRejoinCheck.entriesStarterTotalCount,
    ...nonStarterFieldCheck,
    otherItemsChangedCount: historyIndexCheck.otherItemsChangedCount,
    fakeCompletionPerformed: false,
    fuzzyMatchingPerformed: false,
    predictionUsedAsStarterSource: false,
    resultUsedAsStarterSource: false,
    lineupUsedAsStarterSource: false,
    entriesUsedAsGeneratedStarterSource: false,
    registrationNoGenerated: false,
    checkStatus: pass ? "pass" : "fail",
  };
  return {
    summary,
    historyDailyCheck,
    historyIndexCheck,
    sourceRejoinCheck,
    countReconciliation,
    nonStarterFieldCheck,
    protectedModificationGuard: guard,
    jsonSummary: summary,
  };
}

async function main() {
  const result = await checkCombinedBridge();
  printSection("summary", result.summary);
  printSection("historyDailyCheck", result.historyDailyCheck);
  printSection("historyIndexCheck", result.historyIndexCheck);
  printSection("sourceRejoinCheck", result.sourceRejoinCheck);
  printSection("countReconciliation", result.countReconciliation);
  printSection("nonStarterFieldCheck", result.nonStarterFieldCheck);
  printSection("protectedModificationGuard", result.protectedModificationGuard);
  printSection("jsonSummary", result.jsonSummary);
  if (result.summary.checkStatus !== "pass") process.exitCode = 1;
}

const isMain =
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  main().catch((error) => {
    console.error("[kurari-ex combined history starters bridge checker] failed");
    console.error(error);
    process.exitCode = 1;
  });
}
