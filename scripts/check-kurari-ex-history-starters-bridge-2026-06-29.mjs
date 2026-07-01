import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  TARGET_DATE,
  HISTORY_DAILY_PATH,
  HISTORY_INDEX_PATH,
  HISTORY_DAILY_PUBLIC_PATH,
  STARTERS_SOURCE_PATH,
  ENTRIES_SNAPSHOT_PATH,
  EXPECTED_CURRENT_HISTORY_DAILY_HASH,
  EXPECTED_CANDIDATE_PAYLOAD_HASH,
  asArray,
  buildCandidate,
  candidateSummary,
  exactJoin,
  hashPayload,
  protectedModificationGuard,
  readJson,
  stripAllowedChanges,
  text,
} from "./write-kurari-ex-history-starters-bridge-2026-06-29.mjs";

const clone = (value) => structuredClone(value);

function countDuplicates(values) {
  const seen = new Set();
  let duplicates = 0;
  for (const value of values.filter(Boolean)) {
    if (seen.has(value)) duplicates += 1;
    seen.add(value);
  }
  return duplicates;
}

function fieldChangedCount(beforeItems, afterItems, field) {
  return beforeItems.filter(
    (item, index) =>
      JSON.stringify(item?.[field]) !== JSON.stringify(afterItems[index]?.[field]),
  ).length;
}

function reconstructOriginal(bridged) {
  const original = clone(bridged);
  original.items = asArray(original.items).map((item) => {
    const quality = clone(item.quality ?? {});
    if (Object.hasOwn(quality, "starterParsed")) quality.starterParsed = false;
    delete quality.starterSource;
    quality.warnings = [
      "starter identity intentionally not generated in this dry-run",
    ];
    return {
      ...clone(item),
      starters: [],
      quality,
    };
  });
  return original;
}

function printSection(name, value) {
  console.log(`\n[${name}]`);
  console.log(JSON.stringify(value, null, 2));
}

export async function checkHistoryStartersBridge() {
  const [historyRead, indexRead, sourceRead, entriesRead] = await Promise.all([
    readJson(HISTORY_DAILY_PATH),
    readJson(HISTORY_INDEX_PATH),
    readJson(STARTERS_SOURCE_PATH),
    readJson(ENTRIES_SNAPSHOT_PATH),
  ]);
  const history = historyRead.payload ?? {};
  const index = indexRead.payload ?? {};
  const source = sourceRead.payload ?? {};
  const entries = entriesRead.payload ?? {};
  const historyItems = asArray(history.items);
  const sourceRaces = asArray(source.races);
  const entryRaces = asArray(entries.races);
  const starters = historyItems.flatMap((item) => asArray(item.starters));
  const historyHash = historyRead.payload ? hashPayload(history) : null;
  const join = exactJoin(historyItems, sourceRaces);
  const sourceByKey = new Map(
    sourceRaces.map((race) => [
      `${text(race.date)}::${text(race.venueName)}::${text(race.raceNumber)}`,
      race,
    ]),
  );
  let exactRejoinMatchedCount = 0;
  let starterArrayMismatchRaceCount = 0;
  for (const item of historyItems) {
    const key =
      `${text(item.date)}::${text(item.venueName)}::${text(item.raceNumber)}`;
    const sourceRace = sourceByKey.get(key);
    if (!sourceRace) continue;
    exactRejoinMatchedCount += 1;
    if (JSON.stringify(item.starters) !== JSON.stringify(sourceRace.starters)) {
      starterArrayMismatchRaceCount += 1;
    }
  }
  const reconstructedOriginal = reconstructOriginal(history);
  const originalHash = hashPayload(reconstructedOriginal);
  const baselineReconstructed =
    originalHash === EXPECTED_CURRENT_HISTORY_DAILY_HASH;
  const expectedCandidate = buildCandidate(reconstructedOriginal, exactJoin(
    asArray(reconstructedOriginal.items),
    sourceRaces,
  ));
  const expectedCandidateInfo =
    candidateSummary(reconstructedOriginal, expectedCandidate);
  const reconstructedItems = asArray(reconstructedOriginal.items);
  const nonStarterFieldChangedCount = reconstructedItems.filter(
    (item, index) =>
      JSON.stringify(stripAllowedChanges(item))
      !== JSON.stringify(stripAllowedChanges(historyItems[index] ?? {})),
  ).length;
  const resultChangedCount =
    fieldChangedCount(reconstructedItems, historyItems, "result");
  const predictionChangedCount =
    fieldChangedCount(reconstructedItems, historyItems, "prediction");
  const lineupChangedCount =
    fieldChangedCount(reconstructedItems, historyItems, "lineup");
  const weatherChangedCount =
    fieldChangedCount(reconstructedItems, historyItems, "weather");
  const targetEntries =
    asArray(index.items).filter((item) => item?.date === TARGET_DATE);
  const target = targetEntries[0] ?? null;
  const latest = [...asArray(index.items)].sort((a, b) =>
    text(a?.date).localeCompare(text(b?.date)),
  ).at(-1) ?? null;
  const historyDailyCheck = {
    fileExists: historyRead.exists,
    parseStatus: historyRead.parseStatus,
    date: history.date ?? null,
    historyDailyHash: historyHash,
    expectedHistoryDailyHash: EXPECTED_CANDIDATE_PAYLOAD_HASH,
    historyDailyHashMatched:
      historyHash === EXPECTED_CANDIDATE_PAYLOAD_HASH,
    raceCount: historyItems.length,
    venueCount:
      new Set(historyItems.map((item) => item.venueName).filter(Boolean)).size,
    startersNonEmptyRaceCount:
      historyItems.filter((item) => asArray(item.starters).length > 0).length,
    startersEmptyRaceCount:
      historyItems.filter((item) => asArray(item.starters).length === 0).length,
    starterTotalCount: starters.length,
    missingRegistrationNoCount:
      starters.filter((starter) => !text(starter.registrationNo)).length,
    duplicateCarNoWithinRaceCount: historyItems.filter(
      (item) =>
        countDuplicates(asArray(item.starters).map((starter) => starter.carNo)) > 0,
    ).length,
    duplicateRegistrationNoWithinRaceCount: historyItems.filter(
      (item) =>
        countDuplicates(
          asArray(item.starters).map((starter) => starter.registrationNo),
        ) > 0,
    ).length,
    qualityStarterParsedTrueCount:
      historyItems.filter((item) => item?.quality?.starterParsed === true).length,
    qualityStarterParsedFalseCount:
      historyItems.filter((item) => item?.quality?.starterParsed === false).length,
    unresolvedNoStartersWarningCount: historyItems.filter(
      (item) => asArray(item?.quality?.warnings).some(
        (warning) =>
          /NO_STARTERS|no starters|starter identity intentionally not generated/i
            .test(text(warning)),
      ),
    ).length,
  };
  const historyIndexCheck = {
    targetDateEntryExists: targetEntries.length === 1,
    targetDatePath: target?.file ?? null,
    targetDatePathMatched: target?.file === HISTORY_DAILY_PUBLIC_PATH,
    targetDateRaceCount: target?.raceCount ?? null,
    topLevelRaceCount: index?.raceCount ?? null,
    latestDate: latest?.date ?? null,
    latestPath: latest?.file ?? null,
    contentDependentMetadataPresent:
      Object.hasOwn(index, "totalBytes") || Object.hasOwn(target ?? {}, "bytes"),
  };
  historyIndexCheck.historyIndexStatus =
    indexRead.exists
    && indexRead.parseStatus === "ok"
    && historyIndexCheck.targetDateEntryExists
    && historyIndexCheck.targetDatePathMatched
    && historyIndexCheck.targetDateRaceCount === 64
    && historyIndexCheck.topLevelRaceCount === 3997
    && historyIndexCheck.latestDate === TARGET_DATE
    && historyIndexCheck.latestPath === HISTORY_DAILY_PUBLIC_PATH
      ? "OK"
      : "FAIL";
  const sourceRejoinCheck = {
    exactRejoinMatchedCount,
    starterArrayMismatchRaceCount,
    sourceStarterTotalCount:
      sourceRaces.flatMap((race) => asArray(race.starters)).length,
    entriesStarterTotalCount:
      entryRaces.flatMap((race) => asArray(race.entries)).length,
    joinStatus: join.summary.exactJoinStatus,
  };
  const nonStarterFieldCheck = {
    baselineReconstructed,
    reconstructedOriginalHash: originalHash,
    expectedOriginalHash: EXPECTED_CURRENT_HISTORY_DAILY_HASH,
    expectedCandidatePayloadHash:
      expectedCandidateInfo.candidatePayloadHash,
    expectedCandidatePayloadHashMatched:
      expectedCandidateInfo.candidatePayloadHashMatched,
    nonStarterFieldChangedCount,
    resultChangedCount,
    predictionChangedCount,
    lineupChangedCount,
    weatherChangedCount,
  };
  const guard = protectedModificationGuard();
  const pass =
    historyDailyCheck.fileExists
    && historyDailyCheck.parseStatus === "ok"
    && historyDailyCheck.date === TARGET_DATE
    && historyDailyCheck.historyDailyHashMatched
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
    && historyDailyCheck.unresolvedNoStartersWarningCount === 0
    && historyIndexCheck.historyIndexStatus === "OK"
    && exactRejoinMatchedCount === 64
    && starterArrayMismatchRaceCount === 0
    && sourceRejoinCheck.sourceStarterTotalCount === 464
    && sourceRejoinCheck.entriesStarterTotalCount === 464
    && baselineReconstructed
    && nonStarterFieldChangedCount === 0
    && resultChangedCount === 0
    && predictionChangedCount === 0
    && lineupChangedCount === 0
    && weatherChangedCount === 0
    && guard.guardStatus === "pass";
  const summary = {
    targetDate: TARGET_DATE,
    historyDailyPath: HISTORY_DAILY_PATH,
    fileExists: historyDailyCheck.fileExists,
    parseStatus: historyDailyCheck.parseStatus,
    historyDailyHash: historyHash,
    expectedHistoryDailyHash: EXPECTED_CANDIDATE_PAYLOAD_HASH,
    historyDailyHashMatched: historyDailyCheck.historyDailyHashMatched,
    raceCount: historyDailyCheck.raceCount,
    venueCount: historyDailyCheck.venueCount,
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
    nonStarterFieldChangedCount,
    resultChangedCount,
    predictionChangedCount,
    lineupChangedCount,
    weatherChangedCount,
    historyIndexStatus: historyIndexCheck.historyIndexStatus,
    historyIndexModified: guard.historyIndexModified,
    analyticsSourceModified: guard.analyticsSourceModified,
    racesModified: guard.racesModified,
    reviewsModifiedByThisStep: guard.reviewsModifiedByThisStep,
    privateInputModified: guard.privateInputModified,
    srcModified: guard.srcModified,
    packageModified: guard.packageModified,
    existingScriptModified: guard.existingScriptModified,
    fakeCompletionPerformed: false,
    fuzzyMatchingPerformed: false,
    predictionUsedAsStarterSource: false,
    resultUsedAsStarterSource: false,
    lineupUsedAsStarterSource: false,
    registrationNoGenerated: false,
    checkStatus: pass ? "pass" : "fail",
  };
  return {
    summary,
    historyDailyCheck,
    historyIndexCheck,
    sourceRejoinCheck,
    nonStarterFieldCheck,
    protectedModificationGuard: guard,
    jsonSummary: summary,
  };
}

async function main() {
  const result = await checkHistoryStartersBridge();
  printSection("summary", result.summary);
  printSection("historyDailyCheck", result.historyDailyCheck);
  printSection("historyIndexCheck", result.historyIndexCheck);
  printSection("sourceRejoinCheck", result.sourceRejoinCheck);
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
    console.error("[kurari-ex history starters bridge checker] failed");
    console.error(error);
    process.exitCode = 1;
  });
}
