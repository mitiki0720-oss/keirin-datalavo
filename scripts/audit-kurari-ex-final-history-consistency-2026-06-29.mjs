import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
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
} from "./write-kurari-ex-combined-history-starters-bridge-2026-06-29.mjs";

const THIS_SCRIPT =
  "scripts/audit-kurari-ex-final-history-consistency-2026-06-29.mjs";
const SOURCE_INDEX_PATH =
  "public/data/analytics/kurari-ex/source/starters/index.generated.json";
const ENTRIES_INDEX_PATH =
  "public/data/races/entries-history/index.generated.json";
const KNOWN_REVIEWS = [
  "public/data/reviews/index.json",
  "public/data/reviews/2026-06-28/",
  "public/data/reviews/2026-06-29/",
  "public/data/reviews/2026-06-30/",
];
const BLOCK_REASONS = [
  "HISTORY_INDEX_MISSING",
  "HISTORY_INDEX_PARSE_FAILED",
  "HISTORY_INDEX_HASH_MISMATCH",
  "HISTORY_INDEX_TARGET_DATE_MISSING",
  "HISTORY_INDEX_TARGET_BYTES_MISMATCH",
  "HISTORY_INDEX_TOTAL_BYTES_MISMATCH",
  "HISTORY_INDEX_TOTAL_BYTES_SUM_MISMATCH",
  "HISTORY_INDEX_DUPLICATE_DATE",
  "HISTORY_INDEX_DUPLICATE_PATH",
  "HISTORY_DAILY_MISSING",
  "HISTORY_DAILY_PARSE_FAILED",
  "HISTORY_DAILY_HASH_MISMATCH",
  "HISTORY_DAILY_BYTES_MISMATCH",
  "HISTORY_DAILY_RACE_COUNT_MISMATCH",
  "HISTORY_DAILY_STARTERS_EMPTY",
  "HISTORY_DAILY_STARTER_TOTAL_MISMATCH",
  "HISTORY_DAILY_REGISTRATION_NO_MISSING",
  "HISTORY_DAILY_DUPLICATE_STARTER",
  "STARTERS_SOURCE_MISSING",
  "STARTERS_SOURCE_PARSE_FAILED",
  "STARTERS_SOURCE_RACE_COUNT_MISMATCH",
  "STARTERS_SOURCE_STARTER_TOTAL_MISMATCH",
  "STARTERS_SOURCE_REGISTRATION_NO_MISSING",
  "ENTRIES_SNAPSHOT_MISSING",
  "ENTRIES_SNAPSHOT_PARSE_FAILED",
  "ENTRIES_SNAPSHOT_RACE_COUNT_MISMATCH",
  "ENTRIES_SNAPSHOT_STARTER_TOTAL_MISMATCH",
  "EXACT_REJOIN_MISSING_RACE",
  "EXACT_REJOIN_EXTRA_SOURCE_RACE",
  "EXACT_REJOIN_STARTER_MISMATCH",
  "AMBIGUOUS_JOIN_KEY",
  "CROSS_DATE_JOIN_FOUND",
  "CROSS_VENUE_JOIN_FOUND",
  "NON_STARTER_FIELD_CHANGED",
  "RESULT_FIELD_CHANGED",
  "PREDICTION_FIELD_CHANGED",
  "LINEUP_FIELD_CHANGED",
  "WEATHER_FIELD_CHANGED",
  "UI_API_PUBLIC_PATH_UNRESOLVED",
  "UI_API_DAILY_FILE_NOT_FOUND_FROM_INDEX",
  "UI_API_DATA_SHAPE_INCOMPATIBLE",
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

const clone = (value) => structuredClone(value);
const increment = (counts, key, by = 1) => {
  counts[key] = (counts[key] ?? 0) + by;
};

function countDuplicates(values) {
  const seen = new Set();
  let count = 0;
  for (const value of values.filter(Boolean)) {
    if (seen.has(value)) count += 1;
    seen.add(value);
  }
  return count;
}

function starterIdentity(starter) {
  return text(starter?.registrationNo)
    || `${text(starter?.carNo)}::${text(starter?.name)}`;
}

function fieldChangedCount(before, after, field) {
  return before.filter(
    (item, index) =>
      JSON.stringify(item?.[field]) !== JSON.stringify(after[index]?.[field]),
  ).length;
}

function latestItem(index) {
  return [...array(index?.items)].sort((a, b) =>
    text(a?.date).localeCompare(text(b?.date)),
  ).at(-1) ?? null;
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
    "commit final consistency audit",
    "UI/API consumption check script if needed",
    "optional KURARI EX page smoke check",
    "6/25〜6/28 history追加は別工程",
    "2026-06-29 final phase completion",
  ];
  return actions.map((action, index) => ({
    stepId: index + 1,
    action,
    prerequisiteStatus:
      index === 0 ? (pass ? "final consistency passed" : "blocked") : "previous step or separate scope",
    allowedFiles:
      index === 0 ? [THIS_SCRIPT] : ["separate-step scoped files"],
    prohibitedFiles: [
      "public/data mutation in this audit",
      "existing scripts",
      "src changes without separate authorization",
    ],
    readiness: index === 0 && pass ? "ready" : index === 4 && pass ? "complete" : "future",
    notes: index === 4
      ? "final phase is complete only while final status remains PASS"
      : "not performed by this audit",
  }));
}

export async function auditFinalHistoryConsistency() {
  const watched = [
    INDEX_PATH,
    DAILY_PATH,
    SOURCE_PATH,
    SOURCE_INDEX_PATH,
    ENTRIES_PATH,
    ENTRIES_INDEX_PATH,
  ];
  const before = Object.fromEntries(await Promise.all(
    watched.map(async (file) => {
      const read = await readJson(file);
      return [file, read.payload ? hashPayload(read.payload) : null];
    }),
  ));
  const [
    indexRead,
    dailyRead,
    sourceRead,
    sourceIndexRead,
    entriesRead,
    entriesIndexRead,
  ] = await Promise.all([
    readJson(INDEX_PATH),
    readJson(DAILY_PATH),
    readJson(SOURCE_PATH),
    readJson(SOURCE_INDEX_PATH),
    readJson(ENTRIES_PATH),
    readJson(ENTRIES_INDEX_PATH),
  ]);
  const index = indexRead.payload ?? {};
  const daily = dailyRead.payload ?? {};
  const source = sourceRead.payload ?? {};
  const sourceIndex = sourceIndexRead.payload ?? {};
  const entries = entriesRead.payload ?? {};
  const entriesIndex = entriesIndexRead.payload ?? {};
  const indexItems = array(index.items);
  const dailyItems = array(daily.items);
  const sourceRaces = array(source.races);
  const entriesRaces = array(entries.races);
  const sourceStarters =
    sourceRaces.flatMap((race) => array(race.starters));
  const dailyStarters =
    dailyItems.flatMap((item) => array(item.starters));
  const entryStarters =
    entriesRaces.flatMap((race) => array(race.entries));
  const latest = latestItem(index);
  const targetEntries =
    indexItems.filter((item) => item?.date === TARGET_DATE);
  const target = targetEntries[0] ?? null;
  const indexActualTotalBytesByItems =
    indexItems.reduce((total, item) => total + Number(item?.bytes ?? 0), 0);
  const historyIndexFinalCheck = {
    indexPath: INDEX_PATH,
    exists: indexRead.exists,
    parseStatus: indexRead.parseStatus,
    schemaVersion: index.schemaVersion ?? null,
    indexHash: indexRead.payload ? hashPayload(index) : null,
    expectedIndexHash: CANDIDATE_INDEX_HASH,
    indexHashMatched:
      indexRead.payload && hashPayload(index) === CANDIDATE_INDEX_HASH,
    sourceCount: indexItems.length,
    expectedSourceCount: 53,
    dayCount: index.dayCount ?? null,
    expectedDayCount: 53,
    raceCount: index.raceCount ?? null,
    expectedRaceCount: 3997,
    settledRaceCount: index.settledRaceCount ?? null,
    cancelledRaceCount: index.cancelledRaceCount ?? null,
    latestDate: latest?.date ?? null,
    expectedLatestDate: TARGET_DATE,
    latestPath: latest?.file ?? null,
    expectedLatestPath: DAILY_PUBLIC_PATH,
    totalBytes: index.totalBytes ?? null,
    expectedTotalBytes: CANDIDATE_TOTAL_BYTES,
    totalBytesMatched: index.totalBytes === CANDIDATE_TOTAL_BYTES,
    itemCount: indexItems.length,
    itemDateCount: new Set(indexItems.map((item) => item.date)).size,
    duplicateDateCount: countDuplicates(indexItems.map((item) => item.date)),
    duplicatePathCount: countDuplicates(indexItems.map((item) => item.file)),
    malformedItemCount: indexItems.filter(
      (item) =>
        !text(item.date)
        || !text(item.file)
        || !Number.isFinite(Number(item.raceCount))
        || !Number.isFinite(Number(item.bytes)),
    ).length,
    targetDateEntryExists: targetEntries.length === 1,
    targetDateEntryCount: targetEntries.length,
    targetDatePath: target?.file ?? null,
    expectedTargetDatePath: DAILY_PUBLIC_PATH,
    targetDatePathMatched: target?.file === DAILY_PUBLIC_PATH,
    targetDateRaceCount: target?.raceCount ?? null,
    expectedTargetDateRaceCount: 64,
    targetDateBytes: target?.bytes ?? null,
    expectedTargetDateBytes: CANDIDATE_DAILY_BYTES,
    targetDateBytesMatched: target?.bytes === CANDIDATE_DAILY_BYTES,
    targetDateBytesMatchedActualDailyBytes: target?.bytes === dailyRead.bytes,
    indexActualTotalBytesByItems,
    totalBytesMatchedSumOfItemBytes:
      index.totalBytes === indexActualTotalBytesByItems,
  };
  historyIndexFinalCheck.historyIndexStatus =
    historyIndexFinalCheck.exists
    && historyIndexFinalCheck.parseStatus === "ok"
    && historyIndexFinalCheck.indexHashMatched
    && historyIndexFinalCheck.sourceCount === 53
    && historyIndexFinalCheck.dayCount === 53
    && historyIndexFinalCheck.raceCount === 3997
    && historyIndexFinalCheck.latestDate === TARGET_DATE
    && historyIndexFinalCheck.latestPath === DAILY_PUBLIC_PATH
    && historyIndexFinalCheck.totalBytesMatched
    && historyIndexFinalCheck.duplicateDateCount === 0
    && historyIndexFinalCheck.duplicatePathCount === 0
    && historyIndexFinalCheck.malformedItemCount === 0
    && historyIndexFinalCheck.targetDateEntryCount === 1
    && historyIndexFinalCheck.targetDatePathMatched
    && historyIndexFinalCheck.targetDateRaceCount === 64
    && historyIndexFinalCheck.targetDateBytesMatched
    && historyIndexFinalCheck.targetDateBytesMatchedActualDailyBytes
    && historyIndexFinalCheck.totalBytesMatchedSumOfItemBytes
      ? "OK"
      : "FAIL";

  const dailyMissingCore = {
    raceKey: dailyItems.filter((item) => !text(item.raceKey)).length,
    date: dailyItems.filter((item) => !text(item.date)).length,
    venueKey: dailyItems.filter((item) => !text(item.venueKey)).length,
    venueName: dailyItems.filter((item) => !text(item.venueName)).length,
    raceNumber: dailyItems.filter((item) => !text(item.raceNumber)).length,
  };
  const historyDailyFinalCheck = {
    dailyPath: DAILY_PATH,
    dailyPublicPath: DAILY_PUBLIC_PATH,
    exists: dailyRead.exists,
    parseStatus: dailyRead.parseStatus,
    schemaVersion: daily.schemaVersion ?? null,
    date: daily.date ?? null,
    expectedDate: TARGET_DATE,
    dailyHash: dailyRead.payload ? hashPayload(daily) : null,
    expectedDailyHash: CANDIDATE_DAILY_HASH,
    dailyHashMatched:
      dailyRead.payload && hashPayload(daily) === CANDIDATE_DAILY_HASH,
    dailyBytes: dailyRead.bytes,
    expectedDailyBytes: CANDIDATE_DAILY_BYTES,
    dailyBytesMatched: dailyRead.bytes === CANDIDATE_DAILY_BYTES,
    raceCount: daily.raceCount ?? null,
    expectedRaceCount: 64,
    itemCount: dailyItems.length,
    venueCount:
      new Set(dailyItems.map((item) => item.venueName).filter(Boolean)).size,
    expectedVenueCount: 7,
    settledRaceCount: daily.settledRaceCount ?? null,
    cancelledRaceCount: daily.cancelledRaceCount ?? null,
    predictionLinkedRaceCount: dailyItems.filter(
      (item) => item?.predictionEnrichment?.status === "matched",
    ).length,
    resultRaceCount: dailyItems.filter(
      (item) => item?.quality?.resultParsed === true,
    ).length,
    duplicateRaceKeyCount:
      countDuplicates(dailyItems.map((item) => item.raceKey)),
    duplicateDateVenueRaceNumberCount: countDuplicates(
      dailyItems.map(
        (item) => `${item.date}::${item.venueName}::${item.raceNumber}`,
      ),
    ),
    missingCoreFieldCounts: dailyMissingCore,
    startersNonEmptyRaceCount:
      dailyItems.filter((item) => array(item.starters).length > 0).length,
    expectedStartersNonEmptyRaceCount: 64,
    startersEmptyRaceCount:
      dailyItems.filter((item) => array(item.starters).length === 0).length,
    expectedStartersEmptyRaceCount: 0,
    starterTotalCount: dailyStarters.length,
    expectedStarterTotalCount: 464,
    missingRegistrationNoCount:
      dailyStarters.filter((starter) => !text(starter.registrationNo)).length,
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
    noStartersWarningRemainingCount: dailyItems.filter(
      (item) => array(item?.quality?.warnings).some(
        (warning) =>
          /NO_STARTERS|no starters|starter identity intentionally not generated/i
            .test(text(warning)),
      ),
    ).length,
    starterSourceStatusCounts: dailyItems.reduce((counts, item) => {
      const key = text(item?.quality?.starterSource) || "missing";
      counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    }, {}),
  };
  historyDailyFinalCheck.historyDailyStatus =
    historyDailyFinalCheck.exists
    && historyDailyFinalCheck.parseStatus === "ok"
    && historyDailyFinalCheck.date === TARGET_DATE
    && historyDailyFinalCheck.dailyHashMatched
    && historyDailyFinalCheck.dailyBytesMatched
    && historyDailyFinalCheck.raceCount === 64
    && historyDailyFinalCheck.itemCount === 64
    && historyDailyFinalCheck.venueCount === 7
    && historyDailyFinalCheck.duplicateRaceKeyCount === 0
    && historyDailyFinalCheck.duplicateDateVenueRaceNumberCount === 0
    && Object.values(dailyMissingCore).every((count) => count === 0)
    && historyDailyFinalCheck.startersNonEmptyRaceCount === 64
    && historyDailyFinalCheck.startersEmptyRaceCount === 0
    && historyDailyFinalCheck.starterTotalCount === 464
    && historyDailyFinalCheck.missingRegistrationNoCount === 0
    && historyDailyFinalCheck.duplicateCarNoWithinRaceCount === 0
    && historyDailyFinalCheck.duplicateRegistrationNoWithinRaceCount === 0
    && historyDailyFinalCheck.qualityStarterParsedTrueCount === 64
    && historyDailyFinalCheck.qualityStarterParsedFalseCount === 0
    && historyDailyFinalCheck.noStartersWarningRemainingCount === 0
      ? "OK"
      : "FAIL";

  const sourceIndexTargets =
    array(sourceIndex.sources).filter((item) => item?.date === TARGET_DATE);
  const sourceMissing = {
    raceKey: sourceRaces.filter((race) => !text(race.raceKey)).length,
    venueKey: sourceRaces.filter((race) => !text(race.venueKey)).length,
    venueName: sourceRaces.filter((race) => !text(race.venueName)).length,
    raceNumber: sourceRaces.filter((race) => !text(race.raceNumber)).length,
    carNo: sourceStarters.filter((starter) => !text(starter.carNo)).length,
    name: sourceStarters.filter((starter) => !text(starter.name)).length,
    registrationNo:
      sourceStarters.filter((starter) => !text(starter.registrationNo)).length,
  };
  const startersSourceFinalCheck = {
    sourcePath: SOURCE_PATH,
    sourceIndexPath: SOURCE_INDEX_PATH,
    sourceExists: sourceRead.exists,
    sourceParseStatus: sourceRead.parseStatus,
    sourceSchemaVersion: source.schemaVersion ?? null,
    sourceDate: source.date ?? null,
    sourceRaceCount: sourceRaces.length,
    expectedSourceRaceCount: 64,
    sourceVenueCount:
      new Set(sourceRaces.map((race) => race.venueName).filter(Boolean)).size,
    expectedSourceVenueCount: 7,
    sourceStarterTotalCount: sourceStarters.length,
    expectedSourceStarterTotalCount: 464,
    raceCountByVenue: sourceRaces.reduce((counts, race) => {
      const venue = text(race.venueName) || "missing";
      counts[venue] = (counts[venue] ?? 0) + 1;
      return counts;
    }, {}),
    missingRaceKeyCount: sourceMissing.raceKey,
    missingVenueKeyCount: sourceMissing.venueKey,
    missingVenueNameCount: sourceMissing.venueName,
    missingRaceNumberCount: sourceMissing.raceNumber,
    missingCarNoCount: sourceMissing.carNo,
    missingNameCount: sourceMissing.name,
    missingRegistrationNoCount: sourceMissing.registrationNo,
    duplicateJoinKeyCount: countDuplicates(
      sourceRaces.map(
        (race) => `${race.date}::${race.venueName}::${race.raceNumber}`,
      ),
    ),
    duplicateStarterIdentityCount: sourceRaces.reduce(
      (total, race) =>
        total + countDuplicates(array(race.starters).map(starterIdentity)),
      0,
    ),
    duplicateCarNoWithinRaceCount: sourceRaces.filter(
      (race) =>
        countDuplicates(array(race.starters).map((starter) => starter.carNo)) > 0,
    ).length,
    duplicateRegistrationNoWithinRaceCount: sourceRaces.filter(
      (race) =>
        countDuplicates(
          array(race.starters).map((starter) => starter.registrationNo),
        ) > 0,
    ).length,
    identityStatusCounts: sourceRaces.reduce((counts, race) => {
      const status = text(race?.quality?.starterStatus) || "missing";
      counts[status] = (counts[status] ?? 0) + 1;
      return counts;
    }, {}),
    sourceIndexExists: sourceIndexRead.exists,
    sourceIndexParseStatus: sourceIndexRead.parseStatus,
    sourceIndexTargetDateExists: sourceIndexTargets.length === 1,
    sourceIndexTargetPath: sourceIndexTargets[0]?.path ?? null,
  };
  startersSourceFinalCheck.startersSourceStatus =
    startersSourceFinalCheck.sourceExists
    && startersSourceFinalCheck.sourceParseStatus === "ok"
    && startersSourceFinalCheck.sourceDate === TARGET_DATE
    && startersSourceFinalCheck.sourceRaceCount === 64
    && startersSourceFinalCheck.sourceVenueCount === 7
    && startersSourceFinalCheck.sourceStarterTotalCount === 464
    && startersSourceFinalCheck.missingVenueNameCount === 0
    && startersSourceFinalCheck.missingRaceNumberCount === 0
    && startersSourceFinalCheck.missingCarNoCount === 0
    && startersSourceFinalCheck.missingNameCount === 0
    && startersSourceFinalCheck.missingRegistrationNoCount === 0
    && startersSourceFinalCheck.duplicateJoinKeyCount === 0
    && startersSourceFinalCheck.duplicateStarterIdentityCount === 0
    && startersSourceFinalCheck.duplicateCarNoWithinRaceCount === 0
    && startersSourceFinalCheck.duplicateRegistrationNoWithinRaceCount === 0
    && startersSourceFinalCheck.sourceIndexExists
    && startersSourceFinalCheck.sourceIndexParseStatus === "ok"
    && startersSourceFinalCheck.sourceIndexTargetDateExists
      ? "OK"
      : sourceRead.exists && sourceRead.parseStatus === "ok" ? "PARTIAL" : "FAIL";

  const entriesIndexTargets =
    array(entriesIndex.snapshots).filter((item) => item?.date === TARGET_DATE);
  const entriesMissing = {
    date: entriesRaces.filter((race) => !text(race.date)).length,
    venueName: entriesRaces.filter((race) => !text(race.venueName)).length,
    raceNumber: entriesRaces.filter((race) => !text(race.raceNumber)).length,
    entries: entriesRaces.filter((race) => array(race.entries).length === 0).length,
    carNo: entryStarters.filter((entry) => !text(entry.carNo)).length,
    name: entryStarters.filter((entry) => !text(entry.name)).length,
    registrationNo:
      entryStarters.filter((entry) => !text(entry.registrationNo)).length,
  };
  const entriesSnapshotFinalCheck = {
    entriesPath: ENTRIES_PATH,
    entriesIndexPath: ENTRIES_INDEX_PATH,
    entriesExists: entriesRead.exists,
    entriesParseStatus: entriesRead.parseStatus,
    entriesDate: entries.date ?? null,
    entryRaceCount: entriesRaces.length,
    expectedEntryRaceCount: 64,
    entryVenueCount:
      new Set(entriesRaces.map((race) => race.venueName).filter(Boolean)).size,
    expectedEntryVenueCount: 7,
    entryStarterTotalCount: entryStarters.length,
    expectedEntryStarterTotalCount: 464,
    duplicateRaceKeyCount: countDuplicates(
      entriesRaces.map((race) => race.raceKey).filter(Boolean),
    ),
    duplicateJoinKeyCount: countDuplicates(
      entriesRaces.map(
        (race) => `${race.date}::${race.venueName}::${race.raceNumber}`,
      ),
    ),
    missingCoreFieldCounts: entriesMissing,
    missingRegistrationNoCount: entriesMissing.registrationNo,
    entriesIndexExists: entriesIndexRead.exists,
    entriesIndexParseStatus: entriesIndexRead.parseStatus,
    entriesIndexTargetDateExists: entriesIndexTargets.length === 1,
    entriesIndexTargetPath: entriesIndexTargets[0]?.path ?? null,
  };
  entriesSnapshotFinalCheck.entriesSnapshotStatus =
    entriesSnapshotFinalCheck.entriesExists
    && entriesSnapshotFinalCheck.entriesParseStatus === "ok"
    && entriesSnapshotFinalCheck.entriesDate === TARGET_DATE
    && entriesSnapshotFinalCheck.entryRaceCount === 64
    && entriesSnapshotFinalCheck.entryVenueCount === 7
    && entriesSnapshotFinalCheck.entryStarterTotalCount === 464
    && entriesSnapshotFinalCheck.duplicateRaceKeyCount === 0
    && entriesSnapshotFinalCheck.duplicateJoinKeyCount === 0
    && Object.values(entriesMissing).every((count) => count === 0)
    && entriesSnapshotFinalCheck.entriesIndexExists
    && entriesSnapshotFinalCheck.entriesIndexParseStatus === "ok"
    && entriesSnapshotFinalCheck.entriesIndexTargetDateExists
      ? "OK"
      : entriesRead.exists && entriesRead.parseStatus === "ok" ? "PARTIAL" : "FAIL";

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
  const exactSourceRejoinFinalCheck = {
    targetDate: TARGET_DATE,
    historyRaceCount: dailyItems.length,
    sourceRaceCount: sourceRaces.length,
    entriesRaceCount: entriesRaces.length,
    raceKeyDirectMatchedCount: 0,
    dateVenueKeyRaceNumberMatchedCount: 0,
    dateVenueNameRaceNumberMatchedCount: join.summary.matchedRaceCount,
    matchedRaceCount: join.summary.matchedRaceCount,
    expectedMatchedRaceCount: 64,
    unmatchedHistoryRaceCount: join.summary.unmatchedHistoryRaceCount,
    unmatchedSourceRaceCount: join.summary.unmatchedStartersRaceCount,
    ambiguousJoinCount: join.summary.duplicateJoinKeyCount,
    crossDateJoinFound,
    crossVenueJoinFound,
    sourceStarterTotal: sourceStarters.length,
    historyDailyStarterTotal: dailyStarters.length,
    entriesStarterTotal: entryStarters.length,
    starterTotalMatchedSource: dailyStarters.length === sourceStarters.length,
    starterTotalMatchedEntries: dailyStarters.length === entryStarters.length,
    raceStarterArrayMatchedCount,
    raceStarterArrayMismatchedCount: dailyItems.length - raceStarterArrayMatchedCount,
    mismatchedRaceKeys,
    missingRegistrationNoAfterRejoinCount:
      dailyStarters.filter((starter) => !text(starter.registrationNo)).length,
    fakeCompletionPerformed: false,
    fuzzyMatchingPerformed: false,
    predictionUsedAsStarterSource: false,
    resultUsedAsStarterSource: false,
    lineupUsedAsStarterSource: false,
    entriesUsedAsGeneratedStarterSource: false,
    registrationNoGenerated: false,
  };
  exactSourceRejoinFinalCheck.exactSourceRejoinStatus =
    exactSourceRejoinFinalCheck.matchedRaceCount === 64
    && exactSourceRejoinFinalCheck.unmatchedHistoryRaceCount === 0
    && exactSourceRejoinFinalCheck.unmatchedSourceRaceCount === 0
    && exactSourceRejoinFinalCheck.ambiguousJoinCount === 0
    && !crossDateJoinFound
    && !crossVenueJoinFound
    && exactSourceRejoinFinalCheck.sourceStarterTotal === 464
    && exactSourceRejoinFinalCheck.historyDailyStarterTotal === 464
    && exactSourceRejoinFinalCheck.entriesStarterTotal === 464
    && exactSourceRejoinFinalCheck.raceStarterArrayMatchedCount === 64
    && exactSourceRejoinFinalCheck.raceStarterArrayMismatchedCount === 0
    && exactSourceRejoinFinalCheck.missingRegistrationNoAfterRejoinCount === 0
      ? "OK"
      : "FAIL";

  const baselineDaily = reconstructBaselineDaily(daily);
  const baselineIndex = reconstructBaselineIndex(index);
  const baselineJoin = exactJoin(array(baselineDaily.items), sourceRaces);
  const reconstructedCandidate = buildDailyCandidate(baselineDaily, baselineJoin);
  const reconstructedIndexCandidate = buildIndexCandidate(baselineIndex);
  const baselineItems = array(baselineDaily.items);
  const reconstructedItems = array(reconstructedCandidate.items);
  const nonStarterFieldChangedCount = baselineItems.filter(
    (item, itemIndex) =>
      JSON.stringify(stripStarterChanges(item))
      !== JSON.stringify(stripStarterChanges(reconstructedItems[itemIndex])),
  ).length;
  const raceMetadataFields = [
    "raceKey",
    "raceId",
    "date",
    "venueKey",
    "venueName",
    "raceNumber",
    "grade",
    "timeslot",
    "raceClass",
    "operationStatus",
  ];
  const raceMetadataChangedCount = baselineItems.filter(
    (item, itemIndex) =>
      raceMetadataFields.some(
        (field) =>
          JSON.stringify(item[field])
          !== JSON.stringify(reconstructedItems[itemIndex]?.[field]),
      ),
  ).length;
  const summaryBefore = clone(baselineDaily);
  const summaryAfter = clone(reconstructedCandidate);
  delete summaryBefore.items;
  delete summaryAfter.items;
  const unexpectedChangedFieldPaths = [];
  if (hashPayload(baselineDaily) !== CURRENT_DAILY_HASH) {
    unexpectedChangedFieldPaths.push("baselineDailyHash");
  }
  if (hashPayload(reconstructedCandidate) !== CANDIDATE_DAILY_HASH) {
    unexpectedChangedFieldPaths.push("candidateDailyHash");
  }
  if (hashPayload(reconstructedIndexCandidate) !== CANDIDATE_INDEX_HASH) {
    unexpectedChangedFieldPaths.push("candidateIndexHash");
  }
  const nonStarterIntegrityFinalCheck = {
    baselineDailyHash: hashPayload(baselineDaily),
    expectedBaselineDailyHash: CURRENT_DAILY_HASH,
    candidateDailyHash: hashPayload(reconstructedCandidate),
    expectedCandidateDailyHash: CANDIDATE_DAILY_HASH,
    baselineIndexHash: hashPayload(baselineIndex),
    expectedBaselineIndexHash: CURRENT_INDEX_HASH,
    candidateIndexHash: hashPayload(reconstructedIndexCandidate),
    expectedCandidateIndexHash: CANDIDATE_INDEX_HASH,
    nonStarterFieldChangedCount,
    resultChangedCount:
      fieldChangedCount(baselineItems, reconstructedItems, "result"),
    predictionChangedCount:
      fieldChangedCount(baselineItems, reconstructedItems, "prediction"),
    lineupChangedCount:
      fieldChangedCount(baselineItems, reconstructedItems, "lineup"),
    weatherChangedCount:
      fieldChangedCount(baselineItems, reconstructedItems, "weather"),
    raceMetadataChangedCount,
    summaryChangedCount:
      JSON.stringify(summaryBefore) === JSON.stringify(summaryAfter) ? 0 : 1,
    allowedStarterFieldChangedCount: reconstructedItems.filter(
      (item, itemIndex) =>
        JSON.stringify(item) !== JSON.stringify(baselineItems[itemIndex]),
    ).length,
    unexpectedChangedFieldPaths,
  };
  nonStarterIntegrityFinalCheck.nonStarterIntegrityStatus =
    nonStarterIntegrityFinalCheck.baselineDailyHash === CURRENT_DAILY_HASH
    && nonStarterIntegrityFinalCheck.candidateDailyHash === CANDIDATE_DAILY_HASH
    && nonStarterIntegrityFinalCheck.baselineIndexHash === CURRENT_INDEX_HASH
    && nonStarterIntegrityFinalCheck.candidateIndexHash === CANDIDATE_INDEX_HASH
    && nonStarterIntegrityFinalCheck.nonStarterFieldChangedCount === 0
    && nonStarterIntegrityFinalCheck.resultChangedCount === 0
    && nonStarterIntegrityFinalCheck.predictionChangedCount === 0
    && nonStarterIntegrityFinalCheck.lineupChangedCount === 0
    && nonStarterIntegrityFinalCheck.weatherChangedCount === 0
    && nonStarterIntegrityFinalCheck.raceMetadataChangedCount === 0
    && nonStarterIntegrityFinalCheck.summaryChangedCount === 0
    && unexpectedChangedFieldPaths.length === 0
      ? "OK"
      : "FAIL";

  const resolvedDailyPath = target?.file?.startsWith("/data/")
    ? path.resolve(ROOT, `public${target.file}`)
    : null;
  const uiApiConsumptionPrecheck = {
    publicIndexPathExists: indexRead.exists,
    targetDailyPublicPathFromIndex: target?.file ?? null,
    targetDailyFilesystemPathResolved: resolvedDailyPath,
    targetDailyFileExistsFromIndexPath:
      Boolean(resolvedDailyPath && existsSync(resolvedDailyPath)),
    targetDailyPathMatchesExpected: target?.file === DAILY_PUBLIC_PATH,
    indexLatestDateUsable: latest?.date === TARGET_DATE,
    indexLatestPathUsable: latest?.file === DAILY_PUBLIC_PATH,
    targetDateCanBeSelectedFromIndex: targetEntries.length === 1,
    dailyPayloadHasRaceItems: dailyItems.length > 0,
    dailyPayloadHasResults:
      dailyItems.some((item) => item?.quality?.resultParsed === true),
    dailyPayloadHasPredictions:
      dailyItems.some((item) => item?.quality?.predictionParsed === true),
    dailyPayloadHasStarters:
      dailyItems.some((item) => array(item.starters).length > 0),
    dailyPayloadStarterCoverage:
      dailyItems.length > 0
      && dailyItems.every((item) => array(item.starters).length > 0)
        ? "complete"
        : "partial",
    dataShapeCompatibleWithKnownHistoryDailyConsumer:
      Boolean(
        daily.schemaVersion
        && Array.isArray(daily.items)
        && dailyItems.every(
          (item) =>
            text(item.raceKey)
            && text(item.date)
            && text(item.venueName)
            && Number(item.raceNumber) > 0
            && Array.isArray(item.starters)
            && item.result
            && item.prediction,
        ),
      ),
    protectedSrcUnchanged:
      !gitLines(["status", "--porcelain=v1"]).some(
        (line) => statusPath(line).startsWith("src/"),
      ),
  };
  uiApiConsumptionPrecheck.uiApiPrecheckStatus =
    uiApiConsumptionPrecheck.publicIndexPathExists
    && uiApiConsumptionPrecheck.targetDailyFileExistsFromIndexPath
    && uiApiConsumptionPrecheck.targetDailyPathMatchesExpected
    && uiApiConsumptionPrecheck.indexLatestDateUsable
    && uiApiConsumptionPrecheck.indexLatestPathUsable
    && uiApiConsumptionPrecheck.targetDateCanBeSelectedFromIndex
    && uiApiConsumptionPrecheck.dailyPayloadHasRaceItems
    && uiApiConsumptionPrecheck.dailyPayloadHasResults
    && uiApiConsumptionPrecheck.dailyPayloadHasPredictions
    && uiApiConsumptionPrecheck.dailyPayloadHasStarters
    && uiApiConsumptionPrecheck.dailyPayloadStarterCoverage === "complete"
    && uiApiConsumptionPrecheck.dataShapeCompatibleWithKnownHistoryDailyConsumer
    && uiApiConsumptionPrecheck.protectedSrcUnchanged
      ? "OK"
      : "FAIL";

  const countReconciliationStatus =
    historyIndexFinalCheck.sourceCount === 53
    && historyIndexFinalCheck.dayCount === 53
    && historyIndexFinalCheck.raceCount === 3997
    && historyIndexFinalCheck.totalBytesMatchedSumOfItemBytes
    && dailyItems.length === 64
    && sourceRaces.length === 64
    && entriesRaces.length === 64
    && dailyStarters.length === 464
    && sourceStarters.length === 464
    && entryStarters.length === 464
      ? "OK"
      : "FAIL";
  const after = Object.fromEntries(await Promise.all(
    watched.map(async (file) => {
      const read = await readJson(file);
      return [file, read.payload ? hashPayload(read.payload) : null];
    }),
  ));
  const changedDuringAudit = watched.filter((file) => before[file] !== after[file]);
  const guard = protectedGuard();
  const combinedCheckerStatus =
    historyDailyFinalCheck.historyDailyStatus === "OK"
    && historyIndexFinalCheck.historyIndexStatus === "OK"
    && exactSourceRejoinFinalCheck.exactSourceRejoinStatus === "OK"
    && nonStarterIntegrityFinalCheck.nonStarterIntegrityStatus === "OK"
      ? "pass"
      : "fail";
  let finalStatus = "FINAL_CONSISTENCY_PASS_2026_06_29";
  if (historyIndexFinalCheck.historyIndexStatus !== "OK") {
    finalStatus = "NEEDS_HISTORY_INDEX_FIX";
  } else if (historyDailyFinalCheck.historyDailyStatus !== "OK") {
    finalStatus = "NEEDS_HISTORY_DAILY_FIX";
  } else if (startersSourceFinalCheck.startersSourceStatus !== "OK") {
    finalStatus = "NEEDS_STARTERS_SOURCE_FIX";
  } else if (entriesSnapshotFinalCheck.entriesSnapshotStatus !== "OK") {
    finalStatus = "NEEDS_ENTRIES_SNAPSHOT_FIX";
  } else if (exactSourceRejoinFinalCheck.exactSourceRejoinStatus !== "OK") {
    finalStatus = "NEEDS_REJOIN_FIX";
  } else if (nonStarterIntegrityFinalCheck.nonStarterIntegrityStatus !== "OK") {
    finalStatus = "NEEDS_NON_STARTER_INTEGRITY_FIX";
  } else if (uiApiConsumptionPrecheck.uiApiPrecheckStatus !== "OK") {
    finalStatus = "NEEDS_UI_API_CONSUMPTION_CHECK";
  } else if (
    combinedCheckerStatus !== "pass"
    || countReconciliationStatus !== "OK"
    || guard.guardStatus !== "pass"
    || changedDuringAudit.length > 0
  ) {
    finalStatus = "BLOCKED";
  }
  const finalConsistencyReadiness = {
    historyIndexStatus: historyIndexFinalCheck.historyIndexStatus,
    historyDailyStatus: historyDailyFinalCheck.historyDailyStatus,
    startersSourceStatus: startersSourceFinalCheck.startersSourceStatus,
    entriesSnapshotStatus: entriesSnapshotFinalCheck.entriesSnapshotStatus,
    exactSourceRejoinStatus:
      exactSourceRejoinFinalCheck.exactSourceRejoinStatus,
    nonStarterIntegrityStatus:
      nonStarterIntegrityFinalCheck.nonStarterIntegrityStatus,
    uiApiPrecheckStatus: uiApiConsumptionPrecheck.uiApiPrecheckStatus,
    combinedCheckerStatus,
    countReconciliationStatus,
    protectedGuardStatus: guard.guardStatus,
    finalStatus,
  };

  const blockReasonCounts = Object.fromEntries(
    BLOCK_REASONS.map((reason) => [reason, 0]),
  );
  if (!indexRead.exists) increment(blockReasonCounts, "HISTORY_INDEX_MISSING");
  if (indexRead.parseStatus === "failed") {
    increment(blockReasonCounts, "HISTORY_INDEX_PARSE_FAILED");
  }
  if (!historyIndexFinalCheck.indexHashMatched) {
    increment(blockReasonCounts, "HISTORY_INDEX_HASH_MISMATCH");
  }
  if (!historyIndexFinalCheck.targetDateEntryExists) {
    increment(blockReasonCounts, "HISTORY_INDEX_TARGET_DATE_MISSING");
  }
  if (!historyIndexFinalCheck.targetDateBytesMatched) {
    increment(blockReasonCounts, "HISTORY_INDEX_TARGET_BYTES_MISMATCH");
  }
  if (!historyIndexFinalCheck.totalBytesMatched) {
    increment(blockReasonCounts, "HISTORY_INDEX_TOTAL_BYTES_MISMATCH");
  }
  if (!historyIndexFinalCheck.totalBytesMatchedSumOfItemBytes) {
    increment(blockReasonCounts, "HISTORY_INDEX_TOTAL_BYTES_SUM_MISMATCH");
  }
  if (historyIndexFinalCheck.duplicateDateCount) {
    increment(
      blockReasonCounts,
      "HISTORY_INDEX_DUPLICATE_DATE",
      historyIndexFinalCheck.duplicateDateCount,
    );
  }
  if (historyIndexFinalCheck.duplicatePathCount) {
    increment(
      blockReasonCounts,
      "HISTORY_INDEX_DUPLICATE_PATH",
      historyIndexFinalCheck.duplicatePathCount,
    );
  }
  if (!dailyRead.exists) increment(blockReasonCounts, "HISTORY_DAILY_MISSING");
  if (dailyRead.parseStatus === "failed") {
    increment(blockReasonCounts, "HISTORY_DAILY_PARSE_FAILED");
  }
  if (!historyDailyFinalCheck.dailyHashMatched) {
    increment(blockReasonCounts, "HISTORY_DAILY_HASH_MISMATCH");
  }
  if (!historyDailyFinalCheck.dailyBytesMatched) {
    increment(blockReasonCounts, "HISTORY_DAILY_BYTES_MISMATCH");
  }
  if (historyDailyFinalCheck.itemCount !== 64) {
    increment(blockReasonCounts, "HISTORY_DAILY_RACE_COUNT_MISMATCH");
  }
  if (historyDailyFinalCheck.startersEmptyRaceCount) {
    increment(
      blockReasonCounts,
      "HISTORY_DAILY_STARTERS_EMPTY",
      historyDailyFinalCheck.startersEmptyRaceCount,
    );
  }
  if (historyDailyFinalCheck.starterTotalCount !== 464) {
    increment(blockReasonCounts, "HISTORY_DAILY_STARTER_TOTAL_MISMATCH");
  }
  if (historyDailyFinalCheck.missingRegistrationNoCount) {
    increment(
      blockReasonCounts,
      "HISTORY_DAILY_REGISTRATION_NO_MISSING",
      historyDailyFinalCheck.missingRegistrationNoCount,
    );
  }
  if (
    historyDailyFinalCheck.duplicateCarNoWithinRaceCount
    || historyDailyFinalCheck.duplicateRegistrationNoWithinRaceCount
  ) {
    increment(blockReasonCounts, "HISTORY_DAILY_DUPLICATE_STARTER");
  }
  if (!sourceRead.exists) increment(blockReasonCounts, "STARTERS_SOURCE_MISSING");
  if (sourceRead.parseStatus === "failed") {
    increment(blockReasonCounts, "STARTERS_SOURCE_PARSE_FAILED");
  }
  if (startersSourceFinalCheck.sourceRaceCount !== 64) {
    increment(blockReasonCounts, "STARTERS_SOURCE_RACE_COUNT_MISMATCH");
  }
  if (startersSourceFinalCheck.sourceStarterTotalCount !== 464) {
    increment(blockReasonCounts, "STARTERS_SOURCE_STARTER_TOTAL_MISMATCH");
  }
  if (startersSourceFinalCheck.missingRegistrationNoCount) {
    increment(
      blockReasonCounts,
      "STARTERS_SOURCE_REGISTRATION_NO_MISSING",
      startersSourceFinalCheck.missingRegistrationNoCount,
    );
  }
  if (!entriesRead.exists) increment(blockReasonCounts, "ENTRIES_SNAPSHOT_MISSING");
  if (entriesRead.parseStatus === "failed") {
    increment(blockReasonCounts, "ENTRIES_SNAPSHOT_PARSE_FAILED");
  }
  if (entriesSnapshotFinalCheck.entryRaceCount !== 64) {
    increment(blockReasonCounts, "ENTRIES_SNAPSHOT_RACE_COUNT_MISMATCH");
  }
  if (entriesSnapshotFinalCheck.entryStarterTotalCount !== 464) {
    increment(blockReasonCounts, "ENTRIES_SNAPSHOT_STARTER_TOTAL_MISMATCH");
  }
  if (exactSourceRejoinFinalCheck.unmatchedHistoryRaceCount) {
    increment(
      blockReasonCounts,
      "EXACT_REJOIN_MISSING_RACE",
      exactSourceRejoinFinalCheck.unmatchedHistoryRaceCount,
    );
  }
  if (exactSourceRejoinFinalCheck.unmatchedSourceRaceCount) {
    increment(
      blockReasonCounts,
      "EXACT_REJOIN_EXTRA_SOURCE_RACE",
      exactSourceRejoinFinalCheck.unmatchedSourceRaceCount,
    );
  }
  if (exactSourceRejoinFinalCheck.raceStarterArrayMismatchedCount) {
    increment(
      blockReasonCounts,
      "EXACT_REJOIN_STARTER_MISMATCH",
      exactSourceRejoinFinalCheck.raceStarterArrayMismatchedCount,
    );
  }
  if (exactSourceRejoinFinalCheck.ambiguousJoinCount) {
    increment(
      blockReasonCounts,
      "AMBIGUOUS_JOIN_KEY",
      exactSourceRejoinFinalCheck.ambiguousJoinCount,
    );
  }
  if (crossDateJoinFound) increment(blockReasonCounts, "CROSS_DATE_JOIN_FOUND");
  if (crossVenueJoinFound) increment(blockReasonCounts, "CROSS_VENUE_JOIN_FOUND");
  for (const [field, reason] of [
    ["nonStarterFieldChangedCount", "NON_STARTER_FIELD_CHANGED"],
    ["resultChangedCount", "RESULT_FIELD_CHANGED"],
    ["predictionChangedCount", "PREDICTION_FIELD_CHANGED"],
    ["lineupChangedCount", "LINEUP_FIELD_CHANGED"],
    ["weatherChangedCount", "WEATHER_FIELD_CHANGED"],
  ]) {
    if (nonStarterIntegrityFinalCheck[field]) {
      increment(
        blockReasonCounts,
        reason,
        nonStarterIntegrityFinalCheck[field],
      );
    }
  }
  if (!resolvedDailyPath) {
    increment(blockReasonCounts, "UI_API_PUBLIC_PATH_UNRESOLVED");
  }
  if (!uiApiConsumptionPrecheck.targetDailyFileExistsFromIndexPath) {
    increment(blockReasonCounts, "UI_API_DAILY_FILE_NOT_FOUND_FROM_INDEX");
  }
  if (!uiApiConsumptionPrecheck.dataShapeCompatibleWithKnownHistoryDailyConsumer) {
    increment(blockReasonCounts, "UI_API_DATA_SHAPE_INCOMPATIBLE");
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

  const duplicateStarterCount =
    historyDailyFinalCheck.duplicateCarNoWithinRaceCount
    + historyDailyFinalCheck.duplicateRegistrationNoWithinRaceCount;
  const summary = {
    targetDate: TARGET_DATE,
    finalStatus,
    historyIndexHashMatched: historyIndexFinalCheck.indexHashMatched,
    historyDailyHashMatched: historyDailyFinalCheck.dailyHashMatched,
    historyDailyBytesMatched: historyDailyFinalCheck.dailyBytesMatched,
    indexTotalBytesMatched: historyIndexFinalCheck.totalBytesMatched,
    targetDateIndexBytesMatched:
      historyIndexFinalCheck.targetDateBytesMatched,
    targetDateIndexBytesMatchedActualDailyBytes:
      historyIndexFinalCheck.targetDateBytesMatchedActualDailyBytes,
    indexTotalBytesMatchedSumOfItemBytes:
      historyIndexFinalCheck.totalBytesMatchedSumOfItemBytes,
    sourceCount: historyIndexFinalCheck.sourceCount,
    dayCount: historyIndexFinalCheck.dayCount,
    raceCount: historyIndexFinalCheck.raceCount,
    latestDate: historyIndexFinalCheck.latestDate,
    latestPath: historyIndexFinalCheck.latestPath,
    dailyRaceCount: historyDailyFinalCheck.itemCount,
    dailyVenueCount: historyDailyFinalCheck.venueCount,
    startersNonEmptyRaceCount:
      historyDailyFinalCheck.startersNonEmptyRaceCount,
    startersEmptyRaceCount: historyDailyFinalCheck.startersEmptyRaceCount,
    historyDailyStarterTotal: dailyStarters.length,
    sourceStarterTotal: sourceStarters.length,
    entriesStarterTotal: entryStarters.length,
    matchedRaceCount: exactSourceRejoinFinalCheck.matchedRaceCount,
    raceStarterArrayMatchedCount,
    raceStarterArrayMismatchedCount:
      exactSourceRejoinFinalCheck.raceStarterArrayMismatchedCount,
    missingRegistrationNoCount:
      historyDailyFinalCheck.missingRegistrationNoCount,
    duplicateStarterCount,
    qualityStarterParsedTrueCount:
      historyDailyFinalCheck.qualityStarterParsedTrueCount,
    nonStarterFieldChangedCount,
    resultChangedCount: nonStarterIntegrityFinalCheck.resultChangedCount,
    predictionChangedCount:
      nonStarterIntegrityFinalCheck.predictionChangedCount,
    lineupChangedCount: nonStarterIntegrityFinalCheck.lineupChangedCount,
    weatherChangedCount: nonStarterIntegrityFinalCheck.weatherChangedCount,
    targetDailyFileExistsFromIndexPath:
      uiApiConsumptionPrecheck.targetDailyFileExistsFromIndexPath,
    dailyPayloadStarterCoverage:
      uiApiConsumptionPrecheck.dailyPayloadStarterCoverage,
    fakeCompletionPerformed: false,
    fuzzyMatchingPerformed: false,
    predictionUsedAsStarterSource: false,
    resultUsedAsStarterSource: false,
    lineupUsedAsStarterSource: false,
    entriesUsedAsGeneratedStarterSource: false,
    registrationNoGenerated: false,
    writePerformed: false,
    historyDailyModified: changedDuringAudit.includes(DAILY_PATH),
    historyIndexModified: changedDuringAudit.includes(INDEX_PATH),
    blockReasonCounts: Object.fromEntries(
      Object.entries(blockReasonCounts).filter(([, count]) => count > 0),
    ),
  };
  return {
    summary,
    historyIndexFinalCheck,
    historyDailyFinalCheck,
    startersSourceFinalCheck,
    entriesSnapshotFinalCheck,
    exactSourceRejoinFinalCheck,
    nonStarterIntegrityFinalCheck,
    uiApiConsumptionPrecheck,
    finalConsistencyReadiness,
    protectedModificationGuard: guard,
    nextActionPlan: nextActionPlan(
      finalStatus === "FINAL_CONSISTENCY_PASS_2026_06_29",
    ),
    jsonSummary: {
      ...summary,
      allBlockReasonCounts: blockReasonCounts,
      finalConsistencyReadiness,
    },
  };
}

async function main() {
  const result = await auditFinalHistoryConsistency();
  printSection("summary", result.summary);
  printSection("historyIndexFinalCheck", result.historyIndexFinalCheck);
  printSection("historyDailyFinalCheck", result.historyDailyFinalCheck);
  printSection("startersSourceFinalCheck", result.startersSourceFinalCheck);
  printSection("entriesSnapshotFinalCheck", result.entriesSnapshotFinalCheck);
  printSection("exactSourceRejoinFinalCheck", result.exactSourceRejoinFinalCheck);
  printSection("nonStarterIntegrityFinalCheck", result.nonStarterIntegrityFinalCheck);
  printSection("uiApiConsumptionPrecheck", result.uiApiConsumptionPrecheck);
  printSection("finalConsistencyReadiness", result.finalConsistencyReadiness);
  printSection("protectedModificationGuard", result.protectedModificationGuard);
  printSection("nextActionPlan", result.nextActionPlan);
  printSection("jsonSummary", result.jsonSummary);
  if (result.summary.finalStatus !== "FINAL_CONSISTENCY_PASS_2026_06_29") {
    process.exitCode = 1;
  }
}

const isMain =
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  main().catch((error) => {
    console.error("[kurari-ex final history consistency] failed");
    console.error(error);
    process.exitCode = 1;
  });
}
