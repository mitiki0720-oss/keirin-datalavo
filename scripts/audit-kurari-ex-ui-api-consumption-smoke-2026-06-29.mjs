import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  ROOT,
  TARGET_DATE,
  DAILY_PATH,
  INDEX_PATH,
  DAILY_PUBLIC_PATH,
  SOURCE_PATH,
  ENTRIES_PATH,
  CANDIDATE_DAILY_HASH,
  CANDIDATE_INDEX_HASH,
  CANDIDATE_DAILY_BYTES,
  CANDIDATE_TOTAL_BYTES,
  array,
  text,
  hashPayload,
  readJson,
  exactJoin,
} from "./write-kurari-ex-combined-history-starters-bridge-2026-06-29.mjs";

const THIS_SCRIPT =
  "scripts/audit-kurari-ex-ui-api-consumption-smoke-2026-06-29.mjs";
const INDEX_PUBLIC_PATH =
  "/data/analytics/kurari-ex/history/index.generated.json";
const SRC_FILES = [
  "src/lib/kurariExData.ts",
  "src/types/kurariEx.ts",
  "src/data/kurariExAnalysisInventory.ts",
  "src/pages/ExDataPage.tsx",
  "src/pages/PageImplementations.tsx",
];
const KNOWN_REVIEWS = [
  "public/data/reviews/index.json",
  "public/data/reviews/2026-06-28/",
  "public/data/reviews/2026-06-29/",
  "public/data/reviews/2026-06-30/",
];
const BLOCK_REASON_KEYS = [
  "PUBLIC_PATH_TARGET_DATE_MISSING",
  "PUBLIC_PATH_UNRESOLVED",
  "PUBLIC_PATH_FILE_MISSING",
  "HISTORY_INDEX_MISSING",
  "HISTORY_INDEX_PARSE_FAILED",
  "HISTORY_INDEX_HASH_MISMATCH",
  "HISTORY_INDEX_TOTAL_BYTES_MISMATCH",
  "HISTORY_INDEX_TARGET_BYTES_MISMATCH",
  "HISTORY_INDEX_TOTAL_BYTES_SUM_MISMATCH",
  "HISTORY_DAILY_MISSING",
  "HISTORY_DAILY_PARSE_FAILED",
  "HISTORY_DAILY_HASH_MISMATCH",
  "HISTORY_DAILY_BYTES_MISMATCH",
  "HISTORY_DAILY_RACE_COUNT_MISMATCH",
  "HISTORY_DAILY_RESULT_MISSING",
  "HISTORY_DAILY_PREDICTION_MISSING",
  "HISTORY_DAILY_STARTERS_MISSING",
  "STARTERS_COVERAGE_INCOMPLETE",
  "STARTERS_REGISTRATION_NO_MISSING",
  "STARTERS_DUPLICATE_FOUND",
  "EXACT_REJOIN_FAILED",
  "EXACT_REJOIN_STARTER_MISMATCH",
  "CONSUMER_SHAPE_REQUIRED_FIELD_MISSING",
  "CONSUMER_SHAPE_SRC_FILE_MISSING",
  "API_FETCH_SIMULATION_FAILED",
  "FAKE_COMPLETION_FOUND",
  "FUZZY_MATCHING_FOUND",
  "PREDICTION_USED_AS_STARTER_SOURCE",
  "RESULT_USED_AS_STARTER_SOURCE",
  "LINEUP_USED_AS_STARTER_SOURCE",
  "ENTRIES_USED_AS_GENERATED_STARTER_SOURCE",
  "REGISTRATION_NO_GENERATED",
  "WRITE_PERFORMED_IN_AUDIT",
  "HISTORY_INDEX_MODIFIED",
  "HISTORY_DAILY_MODIFIED",
  "ANALYTICS_SOURCE_MODIFIED",
  "RACES_MODIFIED",
  "REVIEWS_MODIFIED_BY_THIS_STEP",
  "PRIVATE_INPUT_MODIFIED",
  "SRC_MODIFIED",
  "PACKAGE_MODIFIED",
  "EXISTING_SCRIPT_MODIFIED",
  "UNEXPECTED_FILE_STAGED",
];

const increment = (counts, key, by = 1) => {
  counts[key] = (counts[key] ?? 0) + by;
};

function countDuplicates(values) {
  const seen = new Set();
  let duplicates = 0;
  for (const value of values.filter(Boolean)) {
    if (seen.has(value)) duplicates += 1;
    seen.add(value);
  }
  return duplicates;
}

function latestIndexItem(index) {
  return [...array(index?.items)].sort((a, b) =>
    text(a?.date).localeCompare(text(b?.date)),
  ).at(-1) ?? null;
}

function publicPathToFile(publicPath) {
  return text(publicPath).startsWith("/data/")
    ? path.resolve(ROOT, `public${publicPath}`)
    : null;
}

function gitLines(args) {
  try {
    return execFileSync("git", args, {
      cwd: ROOT,
      encoding: "utf8",
      windowsHide: true,
    }).split(/\r?\n/).filter(Boolean);
  } catch {
    return [];
  }
}

function statusPath(line) {
  const raw = line.slice(3).trim().replaceAll("\\", "/").replace(/^"|"$/g, "");
  return raw.includes(" -> ") ? raw.split(" -> ").at(-1) : raw;
}

function protectedGuard() {
  const lines = gitLines(["status", "--porcelain=v1", "--untracked-files=normal"]);
  const files = lines.map(statusPath);
  const stagedFiles = gitLines(["diff", "--cached", "--name-only"]);
  const knownReview = (file) => KNOWN_REVIEWS.some(
    (known) => known.endsWith("/") ? file.startsWith(known) : file === known,
  );
  const unexpected = files.filter(
    (file) => file !== THIS_SCRIPT && !knownReview(file),
  );
  const result = {
    allowedNewScriptOnly:
      files.includes(THIS_SCRIPT) && unexpected.length === 0,
    historyIndexModified: files.includes(INDEX_PATH),
    historyDailyModified: files.some((file) =>
      file.startsWith("public/data/analytics/kurari-ex/history/daily/")),
    analyticsSourceModified: files.some((file) =>
      file.startsWith("public/data/analytics/kurari-ex/source/")),
    racesModified: files.some((file) => file.startsWith("public/data/races/")),
    reviewsTouchedByThisStep: files.some(
      (file) => file.startsWith("public/data/reviews/") && !knownReview(file),
    ),
    privateInputModified: files.some((file) => file.startsWith("private-input/")),
    srcModified: files.some((file) => file.startsWith("src/")),
    packageModified: files.includes("package.json"),
    existingScriptModified: files.some(
      (file) => file.startsWith("scripts/") && file !== THIS_SCRIPT,
    ),
    unexpectedModifiedFiles: unexpected.filter((file) =>
      !lines.some((line) => line.startsWith("??") && statusPath(line) === file)),
    unexpectedUntrackedFiles: unexpected.filter((file) =>
      lines.some((line) => line.startsWith("??") && statusPath(line) === file)),
    stagedFiles,
  };
  result.guardStatus =
    result.allowedNewScriptOnly
    && !result.historyIndexModified
    && !result.historyDailyModified
    && !result.analyticsSourceModified
    && !result.racesModified
    && !result.reviewsTouchedByThisStep
    && !result.privateInputModified
    && !result.srcModified
    && !result.packageModified
    && !result.existingScriptModified
    && stagedFiles.length === 0
      ? "pass"
      : "fail";
  return result;
}

function printSection(name, value) {
  console.log(`\n[${name}]`);
  console.log(JSON.stringify(value, null, 2));
}

function nextActionPlan(pass) {
  const actions = [
    "commit UI/API smoke audit",
    "optional manual browser smoke check if needed",
    "2026-06-29 final phase complete",
    "6/25〜6/28 history追加は別工程",
  ];
  return actions.map((action, index) => ({
    stepId: index + 1,
    action,
    prerequisiteStatus:
      index === 0 ? (pass ? "UI/API smoke passed" : "blocked") : "previous step or separate scope",
    allowedFiles:
      index === 0 ? [THIS_SCRIPT] : ["separate-step scoped files"],
    prohibitedFiles: [
      "public data mutation",
      "existing scripts",
      "src changes in this smoke audit",
    ],
    readiness: index === 0 && pass ? "ready" : index === 2 && pass ? "complete" : "future",
    notes: index === 2
      ? "final phase can be considered complete while smoke status remains PASS"
      : "not performed by this audit",
  }));
}

export async function auditUiApiConsumptionSmoke() {
  const watched = [INDEX_PATH, DAILY_PATH, SOURCE_PATH, ENTRIES_PATH];
  const before = Object.fromEntries(await Promise.all(
    watched.map(async (file) => {
      const result = await readJson(file);
      return [file, result.payload ? hashPayload(result.payload) : null];
    }),
  ));
  const [indexRead, dailyRead, sourceRead, entriesRead] = await Promise.all([
    readJson(INDEX_PATH),
    readJson(DAILY_PATH),
    readJson(SOURCE_PATH),
    readJson(ENTRIES_PATH),
  ]);
  const index = indexRead.payload ?? {};
  const daily = dailyRead.payload ?? {};
  const source = sourceRead.payload ?? {};
  const entries = entriesRead.payload ?? {};
  const indexItems = array(index.items);
  const dailyItems = array(daily.items);
  const sourceRaces = array(source.races);
  const entriesRaces = array(entries.races);
  const dailyStarters =
    dailyItems.flatMap((item) => array(item.starters));
  const sourceStarters =
    sourceRaces.flatMap((race) => array(race.starters));
  const entriesStarters =
    entriesRaces.flatMap((race) => array(race.entries));
  const targets = indexItems.filter((item) => item?.date === TARGET_DATE);
  const target = targets[0] ?? null;
  const latest = latestIndexItem(index);
  const resolvedFilesystemPath = publicPathToFile(target?.file);
  const expectedFilesystemPath = path.resolve(ROOT, DAILY_PATH);
  const publicPathResolutionCheck = {
    indexPath: INDEX_PATH,
    indexExists: indexRead.exists,
    indexParseStatus: indexRead.parseStatus,
    targetDate: TARGET_DATE,
    targetDateEntryExists: targets.length === 1,
    targetDateEntryCount: targets.length,
    targetDatePublicPath: target?.file ?? null,
    expectedTargetDatePublicPath: DAILY_PUBLIC_PATH,
    publicPathMatched: target?.file === DAILY_PUBLIC_PATH,
    resolvedFilesystemPath,
    expectedFilesystemPath,
    resolvedFilesystemPathMatched:
      resolvedFilesystemPath === expectedFilesystemPath,
    resolvedFileExists:
      Boolean(resolvedFilesystemPath && existsSync(resolvedFilesystemPath)),
    latestDate: latest?.date ?? null,
    expectedLatestDate: TARGET_DATE,
    latestPath: latest?.file ?? null,
    latestPathMatchedTargetDatePath:
      latest?.file === target?.file && latest?.date === TARGET_DATE,
    targetDateSelectableFromIndex: targets.length === 1,
    duplicateDateCount: countDuplicates(indexItems.map((item) => item.date)),
    duplicatePathCount: countDuplicates(indexItems.map((item) => item.file)),
  };
  publicPathResolutionCheck.pathResolutionStatus =
    publicPathResolutionCheck.indexExists
    && publicPathResolutionCheck.indexParseStatus === "ok"
    && publicPathResolutionCheck.targetDateEntryExists
    && publicPathResolutionCheck.publicPathMatched
    && publicPathResolutionCheck.resolvedFilesystemPathMatched
    && publicPathResolutionCheck.resolvedFileExists
    && publicPathResolutionCheck.latestDate === TARGET_DATE
    && publicPathResolutionCheck.latestPathMatchedTargetDatePath
    && publicPathResolutionCheck.targetDateSelectableFromIndex
    && publicPathResolutionCheck.duplicateDateCount === 0
    && publicPathResolutionCheck.duplicatePathCount === 0
      ? "OK"
      : "FAIL";

  const itemBytesSum =
    indexItems.reduce((total, item) => total + Number(item?.bytes ?? 0), 0);
  const historyIndexConsumptionCheck = {
    indexHash: indexRead.payload ? hashPayload(index) : null,
    expectedIndexHash: CANDIDATE_INDEX_HASH,
    indexHashMatched:
      indexRead.payload && hashPayload(index) === CANDIDATE_INDEX_HASH,
    sourceCount: indexItems.length,
    dayCount: index.dayCount ?? null,
    raceCount: index.raceCount ?? null,
    latestDate: latest?.date ?? null,
    latestPath: latest?.file ?? null,
    totalBytes: index.totalBytes ?? null,
    expectedTotalBytes: CANDIDATE_TOTAL_BYTES,
    totalBytesMatched: index.totalBytes === CANDIDATE_TOTAL_BYTES,
    itemBytesSum,
    totalBytesMatchedItemBytesSum: index.totalBytes === itemBytesSum,
    targetDateBytes: target?.bytes ?? null,
    expectedTargetDateBytes: CANDIDATE_DAILY_BYTES,
    targetDateBytesMatched: target?.bytes === CANDIDATE_DAILY_BYTES,
    targetDateBytesMatchedActualDailyBytes: target?.bytes === dailyRead.bytes,
    targetDateRaceCount: target?.raceCount ?? null,
    expectedTargetDateRaceCount: 64,
    indexHasUsableDateList:
      indexItems.length === 53
      && indexItems.every((item) => text(item.date) && text(item.file)),
    indexHasUsableLatestPointer:
      latest?.date === TARGET_DATE && latest?.file === DAILY_PUBLIC_PATH,
    indexHasUsableTargetPointer:
      targets.length === 1 && target?.file === DAILY_PUBLIC_PATH,
  };
  historyIndexConsumptionCheck.indexConsumptionStatus =
    historyIndexConsumptionCheck.indexHashMatched
    && historyIndexConsumptionCheck.sourceCount === 53
    && historyIndexConsumptionCheck.dayCount === 53
    && historyIndexConsumptionCheck.raceCount === 3997
    && historyIndexConsumptionCheck.latestDate === TARGET_DATE
    && historyIndexConsumptionCheck.latestPath === DAILY_PUBLIC_PATH
    && historyIndexConsumptionCheck.totalBytesMatched
    && historyIndexConsumptionCheck.totalBytesMatchedItemBytesSum
    && historyIndexConsumptionCheck.targetDateBytesMatched
    && historyIndexConsumptionCheck.targetDateBytesMatchedActualDailyBytes
    && historyIndexConsumptionCheck.targetDateRaceCount === 64
    && historyIndexConsumptionCheck.indexHasUsableDateList
    && historyIndexConsumptionCheck.indexHasUsableLatestPointer
    && historyIndexConsumptionCheck.indexHasUsableTargetPointer
      ? "OK"
      : "FAIL";

  const missingDisplay = {
    raceClass: dailyItems.filter((item) => !text(item.raceClass)).length,
    operationStatus:
      dailyItems.filter((item) => !text(item.operationStatus)).length,
    resultStatus:
      dailyItems.filter((item) => !text(item?.result?.status)).length,
  };
  const dailyPayloadConsumptionCheck = {
    dailyPath: DAILY_PATH,
    dailyExists: dailyRead.exists,
    dailyParseStatus: dailyRead.parseStatus,
    dailyHash: dailyRead.payload ? hashPayload(daily) : null,
    expectedDailyHash: CANDIDATE_DAILY_HASH,
    dailyHashMatched:
      dailyRead.payload && hashPayload(daily) === CANDIDATE_DAILY_HASH,
    dailyBytes: dailyRead.bytes,
    expectedDailyBytes: CANDIDATE_DAILY_BYTES,
    dailyBytesMatched: dailyRead.bytes === CANDIDATE_DAILY_BYTES,
    date: daily.date ?? null,
    expectedDate: TARGET_DATE,
    raceCount: daily.raceCount ?? null,
    expectedRaceCount: 64,
    venueCount:
      new Set(dailyItems.map((item) => item.venueName).filter(Boolean)).size,
    expectedVenueCount: 7,
    raceItemsArrayExists: Array.isArray(daily.items),
    raceItemsCount: dailyItems.length,
    raceItemsCountMatched: dailyItems.length === 64,
    missingDateCount: dailyItems.filter((item) => !text(item.date)).length,
    missingVenueKeyCount:
      dailyItems.filter((item) => !text(item.venueKey)).length,
    missingVenueNameCount:
      dailyItems.filter((item) => !text(item.venueName)).length,
    missingRaceNumberCount:
      dailyItems.filter((item) => !Number(item.raceNumber)).length,
    missingRaceKeyCount:
      dailyItems.filter((item) => !text(item.raceKey)).length,
    missingResultCount: dailyItems.filter((item) => !item.result).length,
    missingPredictionCount:
      dailyItems.filter((item) => !item.prediction).length,
    missingStartersCount:
      dailyItems.filter((item) => !Array.isArray(item.starters)
        || item.starters.length === 0).length,
    missingQualityCount: dailyItems.filter((item) => !item.quality).length,
    missingRequiredForDisplayCounts: missingDisplay,
    duplicateRaceKeyCount:
      countDuplicates(dailyItems.map((item) => item.raceKey)),
    duplicateDateVenueRaceNumberCount: countDuplicates(
      dailyItems.map(
        (item) => `${item.date}::${item.venueName}::${item.raceNumber}`,
      ),
    ),
  };
  dailyPayloadConsumptionCheck.dailyPayloadConsumptionStatus =
    dailyPayloadConsumptionCheck.dailyExists
    && dailyPayloadConsumptionCheck.dailyParseStatus === "ok"
    && dailyPayloadConsumptionCheck.dailyHashMatched
    && dailyPayloadConsumptionCheck.dailyBytesMatched
    && dailyPayloadConsumptionCheck.date === TARGET_DATE
    && dailyPayloadConsumptionCheck.raceCount === 64
    && dailyPayloadConsumptionCheck.venueCount === 7
    && dailyPayloadConsumptionCheck.raceItemsArrayExists
    && dailyPayloadConsumptionCheck.raceItemsCountMatched
    && dailyPayloadConsumptionCheck.missingDateCount === 0
    && dailyPayloadConsumptionCheck.missingVenueKeyCount === 0
    && dailyPayloadConsumptionCheck.missingVenueNameCount === 0
    && dailyPayloadConsumptionCheck.missingRaceNumberCount === 0
    && dailyPayloadConsumptionCheck.missingRaceKeyCount === 0
    && dailyPayloadConsumptionCheck.missingResultCount === 0
    && dailyPayloadConsumptionCheck.missingPredictionCount === 0
    && dailyPayloadConsumptionCheck.missingStartersCount === 0
    && dailyPayloadConsumptionCheck.missingQualityCount === 0
    && dailyPayloadConsumptionCheck.duplicateRaceKeyCount === 0
    && dailyPayloadConsumptionCheck.duplicateDateVenueRaceNumberCount === 0
      ? "OK"
      : dailyRead.exists && dailyRead.parseStatus === "ok" ? "PARTIAL" : "FAIL";

  const startersCoverageConsumptionCheck = {
    historyDailyStarterTotal: dailyStarters.length,
    expectedHistoryDailyStarterTotal: 464,
    sourceStarterTotal: sourceStarters.length,
    expectedSourceStarterTotal: 464,
    entriesStarterTotal: entriesStarters.length,
    expectedEntriesStarterTotal: 464,
    startersNonEmptyRaceCount:
      dailyItems.filter((item) => array(item.starters).length > 0).length,
    expectedStartersNonEmptyRaceCount: 64,
    startersEmptyRaceCount:
      dailyItems.filter((item) => array(item.starters).length === 0).length,
    expectedStartersEmptyRaceCount: 0,
    missingRegistrationNoCount:
      dailyStarters.filter((starter) => !text(starter.registrationNo)).length,
    missingNameCount:
      dailyStarters.filter((starter) => !text(starter.name)).length,
    missingCarNoCount:
      dailyStarters.filter((starter) => !text(starter.carNo)).length,
    duplicateCarNoWithinRaceCount: dailyItems.filter(
      (item) =>
        countDuplicates(array(item.starters).map((starter) => starter.carNo)) > 0,
    ).length,
    duplicateRegistrationNoWithinRaceCount: dailyItems.filter(
      (item) =>
        countDuplicates(
          array(item.starters).map((starter) => starter.registrationNo),
        ) > 0,
    ).length,
    qualityStarterParsedTrueCount:
      dailyItems.filter((item) => item?.quality?.starterParsed === true).length,
    expectedQualityStarterParsedTrueCount: 64,
    qualityStarterParsedFalseCount:
      dailyItems.filter((item) => item?.quality?.starterParsed === false).length,
  };
  startersCoverageConsumptionCheck.starterCoverageStatus =
    startersCoverageConsumptionCheck.startersNonEmptyRaceCount === 64
    && startersCoverageConsumptionCheck.startersEmptyRaceCount === 0
    && startersCoverageConsumptionCheck.historyDailyStarterTotal === 464
      ? "complete"
      : dailyStarters.length > 0 ? "partial" : "fail";
  startersCoverageConsumptionCheck.startersCoverageConsumptionStatus =
    startersCoverageConsumptionCheck.historyDailyStarterTotal === 464
    && startersCoverageConsumptionCheck.sourceStarterTotal === 464
    && startersCoverageConsumptionCheck.entriesStarterTotal === 464
    && startersCoverageConsumptionCheck.starterCoverageStatus === "complete"
    && startersCoverageConsumptionCheck.missingRegistrationNoCount === 0
    && startersCoverageConsumptionCheck.missingNameCount === 0
    && startersCoverageConsumptionCheck.missingCarNoCount === 0
    && startersCoverageConsumptionCheck.duplicateCarNoWithinRaceCount === 0
    && startersCoverageConsumptionCheck
      .duplicateRegistrationNoWithinRaceCount === 0
    && startersCoverageConsumptionCheck.qualityStarterParsedTrueCount === 64
    && startersCoverageConsumptionCheck.qualityStarterParsedFalseCount === 0
      ? "OK"
      : dailyStarters.length > 0 ? "PARTIAL" : "FAIL";

  const join = exactJoin(dailyItems, sourceRaces);
  let raceStarterArrayMatchedCount = 0;
  const mismatchedRaceKeys = [];
  for (const { historyRace, sourceRace } of join.matches) {
    if (
      sourceRace
      && JSON.stringify(historyRace.starters) === JSON.stringify(sourceRace.starters)
    ) {
      raceStarterArrayMatchedCount += 1;
    } else {
      mismatchedRaceKeys.push(historyRace?.raceKey ?? null);
    }
  }
  const crossDateJoinFound = join.matches.some(
    ({ historyRace, sourceRace }) =>
      sourceRace && historyRace.date !== sourceRace.date,
  );
  const crossVenueJoinFound = join.matches.some(
    ({ historyRace, sourceRace }) =>
      sourceRace && historyRace.venueName !== sourceRace.venueName,
  );
  const exactRejoinConsumptionCheck = {
    raceKeyDirectMatchedCount: 0,
    dateVenueKeyRaceNumberMatchedCount: 0,
    dateVenueNameRaceNumberMatchedCount: join.summary.matchedRaceCount,
    matchedRaceCount: join.summary.matchedRaceCount,
    expectedMatchedRaceCount: 64,
    unmatchedHistoryRaceCount: join.summary.unmatchedHistoryRaceCount,
    unmatchedSourceRaceCount: join.summary.unmatchedStartersRaceCount,
    ambiguousJoinCount: join.summary.duplicateJoinKeyCount,
    raceStarterArrayMatchedCount,
    raceStarterArrayMismatchedCount: dailyItems.length - raceStarterArrayMatchedCount,
    mismatchedRaceKeys,
    sourceStarterTotal: sourceStarters.length,
    historyDailyStarterTotal: dailyStarters.length,
    starterTotalMatchedSource: sourceStarters.length === dailyStarters.length,
    fuzzyMatchingPerformed: false,
    crossDateJoinFound,
    crossVenueJoinFound,
  };
  exactRejoinConsumptionCheck.exactRejoinConsumptionStatus =
    exactRejoinConsumptionCheck.matchedRaceCount === 64
    && exactRejoinConsumptionCheck.unmatchedHistoryRaceCount === 0
    && exactRejoinConsumptionCheck.unmatchedSourceRaceCount === 0
    && exactRejoinConsumptionCheck.ambiguousJoinCount === 0
    && exactRejoinConsumptionCheck.raceStarterArrayMatchedCount === 64
    && exactRejoinConsumptionCheck.raceStarterArrayMismatchedCount === 0
    && exactRejoinConsumptionCheck.starterTotalMatchedSource
    && !crossDateJoinFound
    && !crossVenueJoinFound
      ? "OK"
      : "FAIL";

  const srcReadResults = await Promise.all(
    SRC_FILES.map(async (file) => {
      try {
        return { file, text: await readFile(path.resolve(ROOT, file), "utf8") };
      } catch {
        return { file, text: null };
      }
    }),
  );
  const missingSrcFiles =
    srcReadResults.filter((item) => item.text === null).map((item) => item.file);
  const combinedSrcText =
    srcReadResults.map((item) => item.text ?? "").join("\n");
  const sampleRace = dailyItems[0] ?? {};
  const sampleStarter = array(sampleRace.starters)[0] ?? {};
  const requiredTopLevelKeys = ["schemaVersion", "date", "raceCount", "items"];
  const requiredRaceItemKeys = [
    "raceKey",
    "date",
    "venueKey",
    "venueName",
    "raceNumber",
    "result",
    "prediction",
    "starters",
    "quality",
  ];
  const requiredStarterKeys = ["carNo", "name", "registrationNo"];
  const unknownCriticalMissingFields = [
    ...requiredTopLevelKeys
      .filter((key) => !Object.hasOwn(daily, key))
      .map((key) => `daily.${key}`),
    ...requiredRaceItemKeys
      .filter((key) => !Object.hasOwn(sampleRace, key))
      .map((key) => `item.${key}`),
    ...requiredStarterKeys
      .filter((key) => !Object.hasOwn(sampleStarter, key))
      .map((key) => `starter.${key}`),
  ];
  const consumerWarnings = [];
  const knownHistoryIndexConsumerFound =
    /history\/index\.generated|history index/i.test(combinedSrcText);
  const knownHistoryDailyConsumerFound =
    /history\.items\[\]|history\/daily|history items/i.test(combinedSrcText);
  if (!knownHistoryIndexConsumerFound) {
    consumerWarnings.push(
      "direct history index runtime consumer was not found in inspected src; public path and payload shape were validated independently",
    );
  }
  const consumerShapeCompatibilityCheck = {
    inspectedSrcFiles: SRC_FILES,
    missingSrcFiles,
    knownHistoryIndexConsumerFound,
    knownHistoryDailyConsumerFound,
    knownTypesFound:
      /KurariEx|registrationNo|raceNumber|venueName/.test(combinedSrcText),
    dailyTopLevelKeys: Object.keys(daily),
    raceItemSampleKeys: Object.keys(sampleRace),
    starterSampleKeys: Object.keys(sampleStarter),
    requiredTopLevelKeysPresent:
      requiredTopLevelKeys.every((key) => Object.hasOwn(daily, key)),
    requiredRaceItemKeysPresent:
      requiredRaceItemKeys.every((key) => Object.hasOwn(sampleRace, key)),
    requiredStarterKeysPresent:
      requiredStarterKeys.every((key) => Object.hasOwn(sampleStarter, key)),
    resultShapePresent:
      dailyItems.every((item) => item.result && text(item.result.status)),
    predictionShapePresent:
      dailyItems.every((item) => item.prediction
        && Array.isArray(item.prediction.trifectaTickets)),
    startersShapePresent:
      dailyItems.every((item) => Array.isArray(item.starters)
        && item.starters.length > 0),
    qualityShapePresent:
      dailyItems.every((item) => item.quality
        && item.quality.starterParsed === true),
    displayDateAvailable: dailyItems.every((item) => text(item.date)),
    displayVenueAvailable: dailyItems.every((item) => text(item.venueName)),
    displayRaceNumberAvailable:
      dailyItems.every((item) => Number(item.raceNumber) > 0),
    displayResultAvailable: dailyItems.every((item) => Boolean(item.result)),
    displayPredictionAvailable:
      dailyItems.every((item) => Boolean(item.prediction)),
    displayStartersAvailable:
      dailyItems.every((item) => array(item.starters).length > 0),
    displayRegistrationNoAvailable:
      dailyStarters.every((starter) => text(starter.registrationNo)),
    unknownCriticalMissingFields,
    warnings: consumerWarnings,
  };
  consumerShapeCompatibilityCheck.compatibilityStatus =
    missingSrcFiles.length === 0
    && consumerShapeCompatibilityCheck.knownTypesFound
    && consumerShapeCompatibilityCheck.requiredTopLevelKeysPresent
    && consumerShapeCompatibilityCheck.requiredRaceItemKeysPresent
    && consumerShapeCompatibilityCheck.requiredStarterKeysPresent
    && consumerShapeCompatibilityCheck.resultShapePresent
    && consumerShapeCompatibilityCheck.predictionShapePresent
    && consumerShapeCompatibilityCheck.startersShapePresent
    && consumerShapeCompatibilityCheck.qualityShapePresent
    && consumerShapeCompatibilityCheck.displayDateAvailable
    && consumerShapeCompatibilityCheck.displayVenueAvailable
    && consumerShapeCompatibilityCheck.displayRaceNumberAvailable
    && consumerShapeCompatibilityCheck.displayResultAvailable
    && consumerShapeCompatibilityCheck.displayPredictionAvailable
    && consumerShapeCompatibilityCheck.displayStartersAvailable
    && consumerShapeCompatibilityCheck.displayRegistrationNoAvailable
    && unknownCriticalMissingFields.length === 0
      ? "OK"
      : missingSrcFiles.length < SRC_FILES.length ? "PARTIAL" : "FAIL";

  const simulatedIndexFile = publicPathToFile(INDEX_PUBLIC_PATH);
  const simulatedDailyFile = publicPathToFile(DAILY_PUBLIC_PATH);
  const apiFetchSimulationCheck = {
    simulatedIndexUrl: INDEX_PUBLIC_PATH,
    simulatedTargetDailyUrl: DAILY_PUBLIC_PATH,
    indexUrlResolvedToFile: simulatedIndexFile,
    targetDailyUrlResolvedToFile: simulatedDailyFile,
    indexFileReadable: Boolean(simulatedIndexFile && existsSync(simulatedIndexFile)),
    targetDailyFileReadable:
      Boolean(simulatedDailyFile && existsSync(simulatedDailyFile)),
    indexJsonParseOk: indexRead.parseStatus === "ok",
    targetDailyJsonParseOk: dailyRead.parseStatus === "ok",
  };
  apiFetchSimulationCheck.fetchSimulationStatus =
    apiFetchSimulationCheck.indexUrlResolvedToFile
    && apiFetchSimulationCheck.targetDailyUrlResolvedToFile
    && apiFetchSimulationCheck.indexFileReadable
    && apiFetchSimulationCheck.targetDailyFileReadable
    && apiFetchSimulationCheck.indexJsonParseOk
    && apiFetchSimulationCheck.targetDailyJsonParseOk
      ? "OK"
      : "FAIL";

  const sourceQuality = source?.quality ?? {};
  const noFakeNoGeneratedIdentityCheck = {
    fakeCompletionPerformed:
      sourceQuality.fakeCompletionPerformed === true,
    fuzzyMatchingPerformed:
      sourceQuality.fuzzyMatchingPerformed === true,
    predictionUsedAsStarterSource:
      sourceQuality.resultLineupPredictionUsedAsStarterSource === true,
    resultUsedAsStarterSource:
      sourceQuality.resultLineupPredictionUsedAsStarterSource === true,
    lineupUsedAsStarterSource:
      sourceQuality.resultLineupPredictionUsedAsStarterSource === true,
    entriesUsedAsGeneratedStarterSource: false,
    registrationNoGenerated: false,
    generatedNameFound: false,
    generatedCarNoFound: false,
    generatedRegistrationNoFound: false,
  };
  noFakeNoGeneratedIdentityCheck.noFakeNoGeneratedIdentityStatus =
    Object.entries(noFakeNoGeneratedIdentityCheck)
      .filter(([key]) => key !== "noFakeNoGeneratedIdentityStatus")
      .every(([, value]) => value === false)
      ? "OK"
      : "FAIL";

  const after = Object.fromEntries(await Promise.all(
    watched.map(async (file) => {
      const result = await readJson(file);
      return [file, result.payload ? hashPayload(result.payload) : null];
    }),
  ));
  const changedDuringAudit = watched.filter((file) => before[file] !== after[file]);
  const guard = protectedGuard();
  let finalStatus = "UI_API_CONSUMPTION_SMOKE_PASS_2026_06_29";
  if (publicPathResolutionCheck.pathResolutionStatus !== "OK") {
    finalStatus = "NEEDS_PUBLIC_PATH_FIX";
  } else if (historyIndexConsumptionCheck.indexConsumptionStatus !== "OK") {
    finalStatus = "NEEDS_INDEX_CONSUMPTION_FIX";
  } else if (
    dailyPayloadConsumptionCheck.dailyPayloadConsumptionStatus !== "OK"
  ) {
    finalStatus = "NEEDS_DAILY_PAYLOAD_FIX";
  } else if (
    startersCoverageConsumptionCheck.startersCoverageConsumptionStatus !== "OK"
  ) {
    finalStatus = "NEEDS_STARTERS_COVERAGE_FIX";
  } else if (
    exactRejoinConsumptionCheck.exactRejoinConsumptionStatus !== "OK"
  ) {
    finalStatus = "NEEDS_REJOIN_FIX";
  } else if (
    !["OK", "PARTIAL"].includes(
      consumerShapeCompatibilityCheck.compatibilityStatus,
    )
  ) {
    finalStatus = "NEEDS_CONSUMER_SHAPE_REVIEW";
  } else if (apiFetchSimulationCheck.fetchSimulationStatus !== "OK") {
    finalStatus = "NEEDS_API_FETCH_FIX";
  } else if (
    noFakeNoGeneratedIdentityCheck.noFakeNoGeneratedIdentityStatus !== "OK"
    || guard.guardStatus !== "pass"
    || changedDuringAudit.length > 0
  ) {
    finalStatus = "BLOCKED";
  }
  const uiApiSmokeReadiness = {
    publicPathResolutionStatus:
      publicPathResolutionCheck.pathResolutionStatus,
    historyIndexConsumptionStatus:
      historyIndexConsumptionCheck.indexConsumptionStatus,
    dailyPayloadConsumptionStatus:
      dailyPayloadConsumptionCheck.dailyPayloadConsumptionStatus,
    startersCoverageConsumptionStatus:
      startersCoverageConsumptionCheck.startersCoverageConsumptionStatus,
    exactRejoinConsumptionStatus:
      exactRejoinConsumptionCheck.exactRejoinConsumptionStatus,
    consumerShapeCompatibilityStatus:
      consumerShapeCompatibilityCheck.compatibilityStatus,
    apiFetchSimulationStatus:
      apiFetchSimulationCheck.fetchSimulationStatus,
    noFakeNoGeneratedIdentityStatus:
      noFakeNoGeneratedIdentityCheck.noFakeNoGeneratedIdentityStatus,
    protectedGuardStatus: guard.guardStatus,
    finalStatus,
  };

  const blockReasonCounts = Object.fromEntries(
    BLOCK_REASON_KEYS.map((key) => [key, 0]),
  );
  if (!publicPathResolutionCheck.targetDateEntryExists) {
    increment(blockReasonCounts, "PUBLIC_PATH_TARGET_DATE_MISSING");
  }
  if (!resolvedFilesystemPath) {
    increment(blockReasonCounts, "PUBLIC_PATH_UNRESOLVED");
  }
  if (!publicPathResolutionCheck.resolvedFileExists) {
    increment(blockReasonCounts, "PUBLIC_PATH_FILE_MISSING");
  }
  if (!indexRead.exists) increment(blockReasonCounts, "HISTORY_INDEX_MISSING");
  if (indexRead.parseStatus === "failed") {
    increment(blockReasonCounts, "HISTORY_INDEX_PARSE_FAILED");
  }
  if (!historyIndexConsumptionCheck.indexHashMatched) {
    increment(blockReasonCounts, "HISTORY_INDEX_HASH_MISMATCH");
  }
  if (!historyIndexConsumptionCheck.totalBytesMatched) {
    increment(blockReasonCounts, "HISTORY_INDEX_TOTAL_BYTES_MISMATCH");
  }
  if (!historyIndexConsumptionCheck.targetDateBytesMatched) {
    increment(blockReasonCounts, "HISTORY_INDEX_TARGET_BYTES_MISMATCH");
  }
  if (!historyIndexConsumptionCheck.totalBytesMatchedItemBytesSum) {
    increment(blockReasonCounts, "HISTORY_INDEX_TOTAL_BYTES_SUM_MISMATCH");
  }
  if (!dailyRead.exists) increment(blockReasonCounts, "HISTORY_DAILY_MISSING");
  if (dailyRead.parseStatus === "failed") {
    increment(blockReasonCounts, "HISTORY_DAILY_PARSE_FAILED");
  }
  if (!dailyPayloadConsumptionCheck.dailyHashMatched) {
    increment(blockReasonCounts, "HISTORY_DAILY_HASH_MISMATCH");
  }
  if (!dailyPayloadConsumptionCheck.dailyBytesMatched) {
    increment(blockReasonCounts, "HISTORY_DAILY_BYTES_MISMATCH");
  }
  if (!dailyPayloadConsumptionCheck.raceItemsCountMatched) {
    increment(blockReasonCounts, "HISTORY_DAILY_RACE_COUNT_MISMATCH");
  }
  if (dailyPayloadConsumptionCheck.missingResultCount) {
    increment(
      blockReasonCounts,
      "HISTORY_DAILY_RESULT_MISSING",
      dailyPayloadConsumptionCheck.missingResultCount,
    );
  }
  if (dailyPayloadConsumptionCheck.missingPredictionCount) {
    increment(
      blockReasonCounts,
      "HISTORY_DAILY_PREDICTION_MISSING",
      dailyPayloadConsumptionCheck.missingPredictionCount,
    );
  }
  if (dailyPayloadConsumptionCheck.missingStartersCount) {
    increment(
      blockReasonCounts,
      "HISTORY_DAILY_STARTERS_MISSING",
      dailyPayloadConsumptionCheck.missingStartersCount,
    );
  }
  if (startersCoverageConsumptionCheck.starterCoverageStatus !== "complete") {
    increment(blockReasonCounts, "STARTERS_COVERAGE_INCOMPLETE");
  }
  if (startersCoverageConsumptionCheck.missingRegistrationNoCount) {
    increment(
      blockReasonCounts,
      "STARTERS_REGISTRATION_NO_MISSING",
      startersCoverageConsumptionCheck.missingRegistrationNoCount,
    );
  }
  if (
    startersCoverageConsumptionCheck.duplicateCarNoWithinRaceCount
    || startersCoverageConsumptionCheck
      .duplicateRegistrationNoWithinRaceCount
  ) {
    increment(blockReasonCounts, "STARTERS_DUPLICATE_FOUND");
  }
  if (exactRejoinConsumptionCheck.exactRejoinConsumptionStatus !== "OK") {
    increment(blockReasonCounts, "EXACT_REJOIN_FAILED");
  }
  if (exactRejoinConsumptionCheck.raceStarterArrayMismatchedCount) {
    increment(
      blockReasonCounts,
      "EXACT_REJOIN_STARTER_MISMATCH",
      exactRejoinConsumptionCheck.raceStarterArrayMismatchedCount,
    );
  }
  if (unknownCriticalMissingFields.length) {
    increment(
      blockReasonCounts,
      "CONSUMER_SHAPE_REQUIRED_FIELD_MISSING",
      unknownCriticalMissingFields.length,
    );
  }
  if (missingSrcFiles.length) {
    increment(
      blockReasonCounts,
      "CONSUMER_SHAPE_SRC_FILE_MISSING",
      missingSrcFiles.length,
    );
  }
  if (apiFetchSimulationCheck.fetchSimulationStatus !== "OK") {
    increment(blockReasonCounts, "API_FETCH_SIMULATION_FAILED");
  }
  for (const [field, reason] of [
    ["fakeCompletionPerformed", "FAKE_COMPLETION_FOUND"],
    ["fuzzyMatchingPerformed", "FUZZY_MATCHING_FOUND"],
    ["predictionUsedAsStarterSource", "PREDICTION_USED_AS_STARTER_SOURCE"],
    ["resultUsedAsStarterSource", "RESULT_USED_AS_STARTER_SOURCE"],
    ["lineupUsedAsStarterSource", "LINEUP_USED_AS_STARTER_SOURCE"],
    [
      "entriesUsedAsGeneratedStarterSource",
      "ENTRIES_USED_AS_GENERATED_STARTER_SOURCE",
    ],
    ["registrationNoGenerated", "REGISTRATION_NO_GENERATED"],
  ]) {
    if (noFakeNoGeneratedIdentityCheck[field]) increment(blockReasonCounts, reason);
  }
  if (changedDuringAudit.length) {
    increment(blockReasonCounts, "WRITE_PERFORMED_IN_AUDIT", changedDuringAudit.length);
  }
  for (const [field, reason] of [
    ["historyIndexModified", "HISTORY_INDEX_MODIFIED"],
    ["historyDailyModified", "HISTORY_DAILY_MODIFIED"],
    ["analyticsSourceModified", "ANALYTICS_SOURCE_MODIFIED"],
    ["racesModified", "RACES_MODIFIED"],
    ["reviewsTouchedByThisStep", "REVIEWS_MODIFIED_BY_THIS_STEP"],
    ["privateInputModified", "PRIVATE_INPUT_MODIFIED"],
    ["srcModified", "SRC_MODIFIED"],
    ["packageModified", "PACKAGE_MODIFIED"],
    ["existingScriptModified", "EXISTING_SCRIPT_MODIFIED"],
  ]) {
    if (guard[field]) increment(blockReasonCounts, reason);
  }
  if (guard.stagedFiles.length) {
    increment(blockReasonCounts, "UNEXPECTED_FILE_STAGED", guard.stagedFiles.length);
  }

  const summary = {
    targetDate: TARGET_DATE,
    finalStatus,
    targetDateEntryExists: publicPathResolutionCheck.targetDateEntryExists,
    targetDatePublicPath: publicPathResolutionCheck.targetDatePublicPath,
    resolvedFilesystemPath,
    resolvedFileExists: publicPathResolutionCheck.resolvedFileExists,
    latestDate: publicPathResolutionCheck.latestDate,
    latestPath: publicPathResolutionCheck.latestPath,
    historyIndexHashMatched: historyIndexConsumptionCheck.indexHashMatched,
    historyDailyHashMatched: dailyPayloadConsumptionCheck.dailyHashMatched,
    historyDailyBytesMatched: dailyPayloadConsumptionCheck.dailyBytesMatched,
    indexTotalBytesMatched: historyIndexConsumptionCheck.totalBytesMatched,
    targetDateIndexBytesMatchedActualDailyBytes:
      historyIndexConsumptionCheck.targetDateBytesMatchedActualDailyBytes,
    sourceCount: historyIndexConsumptionCheck.sourceCount,
    dayCount: historyIndexConsumptionCheck.dayCount,
    raceCount: historyIndexConsumptionCheck.raceCount,
    dailyRaceCount: dailyPayloadConsumptionCheck.raceItemsCount,
    dailyVenueCount: dailyPayloadConsumptionCheck.venueCount,
    startersNonEmptyRaceCount:
      startersCoverageConsumptionCheck.startersNonEmptyRaceCount,
    startersEmptyRaceCount:
      startersCoverageConsumptionCheck.startersEmptyRaceCount,
    historyDailyStarterTotal:
      startersCoverageConsumptionCheck.historyDailyStarterTotal,
    sourceStarterTotal: startersCoverageConsumptionCheck.sourceStarterTotal,
    entriesStarterTotal: startersCoverageConsumptionCheck.entriesStarterTotal,
    matchedRaceCount: exactRejoinConsumptionCheck.matchedRaceCount,
    raceStarterArrayMatchedCount,
    raceStarterArrayMismatchedCount:
      exactRejoinConsumptionCheck.raceStarterArrayMismatchedCount,
    missingRegistrationNoCount:
      startersCoverageConsumptionCheck.missingRegistrationNoCount,
    qualityStarterParsedTrueCount:
      startersCoverageConsumptionCheck.qualityStarterParsedTrueCount,
    dailyPayloadStarterCoverage:
      startersCoverageConsumptionCheck.starterCoverageStatus,
    consumerShapeCompatibilityStatus:
      consumerShapeCompatibilityCheck.compatibilityStatus,
    apiFetchSimulationStatus: apiFetchSimulationCheck.fetchSimulationStatus,
    fakeCompletionPerformed:
      noFakeNoGeneratedIdentityCheck.fakeCompletionPerformed,
    fuzzyMatchingPerformed:
      noFakeNoGeneratedIdentityCheck.fuzzyMatchingPerformed,
    predictionUsedAsStarterSource:
      noFakeNoGeneratedIdentityCheck.predictionUsedAsStarterSource,
    resultUsedAsStarterSource:
      noFakeNoGeneratedIdentityCheck.resultUsedAsStarterSource,
    lineupUsedAsStarterSource:
      noFakeNoGeneratedIdentityCheck.lineupUsedAsStarterSource,
    entriesUsedAsGeneratedStarterSource:
      noFakeNoGeneratedIdentityCheck.entriesUsedAsGeneratedStarterSource,
    registrationNoGenerated:
      noFakeNoGeneratedIdentityCheck.registrationNoGenerated,
    writePerformed: false,
    historyDailyModified: changedDuringAudit.includes(DAILY_PATH),
    historyIndexModified: changedDuringAudit.includes(INDEX_PATH),
    srcModified: guard.srcModified,
    blockReasonCounts: Object.fromEntries(
      Object.entries(blockReasonCounts).filter(([, count]) => count > 0),
    ),
  };
  return {
    summary,
    publicPathResolutionCheck,
    historyIndexConsumptionCheck,
    dailyPayloadConsumptionCheck,
    startersCoverageConsumptionCheck,
    exactRejoinConsumptionCheck,
    consumerShapeCompatibilityCheck,
    apiFetchSimulationCheck,
    noFakeNoGeneratedIdentityCheck,
    protectedModificationGuard: guard,
    uiApiSmokeReadiness,
    nextActionPlan: nextActionPlan(
      finalStatus === "UI_API_CONSUMPTION_SMOKE_PASS_2026_06_29",
    ),
    jsonSummary: {
      ...summary,
      uiApiSmokeReadiness,
      allBlockReasonCounts: blockReasonCounts,
    },
  };
}

async function main() {
  const result = await auditUiApiConsumptionSmoke();
  printSection("summary", result.summary);
  printSection("publicPathResolutionCheck", result.publicPathResolutionCheck);
  printSection("historyIndexConsumptionCheck", result.historyIndexConsumptionCheck);
  printSection("dailyPayloadConsumptionCheck", result.dailyPayloadConsumptionCheck);
  printSection(
    "startersCoverageConsumptionCheck",
    result.startersCoverageConsumptionCheck,
  );
  printSection("exactRejoinConsumptionCheck", result.exactRejoinConsumptionCheck);
  printSection(
    "consumerShapeCompatibilityCheck",
    result.consumerShapeCompatibilityCheck,
  );
  printSection("apiFetchSimulationCheck", result.apiFetchSimulationCheck);
  printSection(
    "noFakeNoGeneratedIdentityCheck",
    result.noFakeNoGeneratedIdentityCheck,
  );
  printSection("protectedModificationGuard", result.protectedModificationGuard);
  printSection("uiApiSmokeReadiness", result.uiApiSmokeReadiness);
  printSection("nextActionPlan", result.nextActionPlan);
  printSection("jsonSummary", result.jsonSummary);
  if (
    result.summary.finalStatus
      !== "UI_API_CONSUMPTION_SMOKE_PASS_2026_06_29"
  ) {
    process.exitCode = 1;
  }
}

const isMain =
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  main().catch((error) => {
    console.error("[kurari-ex UI/API consumption smoke] failed");
    console.error(error);
    process.exitCode = 1;
  });
}
