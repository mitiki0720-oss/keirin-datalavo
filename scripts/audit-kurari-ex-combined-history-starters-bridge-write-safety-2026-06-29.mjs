import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const TARGET_DATE = "2026-06-29";
const THIS_SCRIPT =
  "scripts/audit-kurari-ex-combined-history-starters-bridge-write-safety-2026-06-29.mjs";
const DAILY_PATH =
  "public/data/analytics/kurari-ex/history/daily/2026-06/2026-06-29.generated.json";
const INDEX_PATH =
  "public/data/analytics/kurari-ex/history/index.generated.json";
const DAILY_PUBLIC_PATH =
  "/data/analytics/kurari-ex/history/daily/2026-06/2026-06-29.generated.json";
const SOURCE_PATH =
  "public/data/analytics/kurari-ex/source/starters/2026-06-29/today-registration-starters.generated.json";
const ENTRIES_PATH =
  "public/data/races/entries-history/2026-06-29/keirin-jp-entries.generated.json";
const EXPECTED_CURRENT_DAILY_HASH =
  "sha256:96a4d2399cf7f57f777170648c9ab8da2f87f20b5bdcc3ed680f2ca6b67d6e2f";
const EXPECTED_CANDIDATE_DAILY_HASH =
  "sha256:21b9c6a425c6207c2995d434486957d264f83b3f8ea2b336ec92749376652c46";
const EXPECTED_CURRENT_DAILY_BYTES = 154559;
const EXPECTED_CANDIDATE_DAILY_BYTES = 441362;
const EXPECTED_CURRENT_TOTAL_BYTES = 10722569;
const EXPECTED_CANDIDATE_TOTAL_BYTES = 11009372;
const EXPECTED_BYTES_DELTA = 286803;
const ALLOWED_INDEX_CHANGED_PATHS = [
  "totalBytes",
  "items[2026-06-29].bytes",
];
const KNOWN_REVIEWS = [
  "public/data/reviews/index.json",
  "public/data/reviews/2026-06-28/",
  "public/data/reviews/2026-06-29/",
  "public/data/reviews/2026-06-30/",
];
const BLOCK_REASON_KEYS = [
  "HISTORY_DAILY_MISSING",
  "HISTORY_DAILY_PARSE_FAILED",
  "HISTORY_DAILY_HASH_MISMATCH",
  "HISTORY_DAILY_BYTES_MISMATCH",
  "HISTORY_INDEX_MISSING",
  "HISTORY_INDEX_PARSE_FAILED",
  "HISTORY_INDEX_TARGET_DATE_MISSING",
  "HISTORY_INDEX_TARGET_BYTES_MISSING",
  "HISTORY_INDEX_TOTAL_BYTES_MISSING",
  "HISTORY_INDEX_TARGET_BYTES_CURRENT_DAILY_MISMATCH",
  "HISTORY_INDEX_SCHEMA_UNKNOWN",
  "STARTERS_SOURCE_MISSING",
  "STARTERS_SOURCE_PARSE_FAILED",
  "ENTRIES_SNAPSHOT_MISSING",
  "ENTRIES_SNAPSHOT_PARSE_FAILED",
  "EXACT_JOIN_MISSING_RACE",
  "EXACT_JOIN_EXTRA_SOURCE_RACE",
  "AMBIGUOUS_JOIN_KEY",
  "CANDIDATE_DAILY_HASH_MISMATCH",
  "CANDIDATE_DAILY_BYTES_MISMATCH",
  "CANDIDATE_INDEX_SCHEMA_INCOMPATIBLE",
  "CANDIDATE_INDEX_UNEXPECTED_FIELD_CHANGE",
  "CANDIDATE_INDEX_COUNT_MISMATCH",
  "CANDIDATE_INDEX_HASH_UNSTABLE",
  "NON_STARTER_FIELD_CHANGED",
  "RESULT_FIELD_CHANGED",
  "PREDICTION_FIELD_CHANGED",
  "LINEUP_FIELD_CHANGED",
  "WEATHER_FIELD_CHANGED",
  "COUNT_RECONCILIATION_FAILED",
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
const array = (value) => (Array.isArray(value) ? value : []);
const text = (value) => String(value ?? "").trim();
const hash = (value) =>
  `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
const serializedBytes = (value) =>
  Buffer.byteLength(`${JSON.stringify(value, null, 2)}\n`, "utf8");
const increment = (counts, key, by = 1) => {
  counts[key] = (counts[key] ?? 0) + by;
};

async function readJson(file) {
  try {
    const raw = await readFile(path.resolve(ROOT, file), "utf8");
    return {
      exists: true,
      parseStatus: "ok",
      payload: JSON.parse(raw),
      bytes: Buffer.byteLength(raw, "utf8"),
    };
  } catch (error) {
    return {
      exists: error?.code !== "ENOENT",
      parseStatus: error?.code === "ENOENT" ? "missing" : "failed",
      payload: null,
      bytes: null,
    };
  }
}

function raceJoinKey(race, type) {
  if (type === "raceKey") return text(race?.raceKey) || null;
  const date = text(race?.date);
  const venue = text(
    type === "dateVenueKeyRaceNumber" ? race?.venueKey : race?.venueName,
  );
  const raceNumber = text(race?.raceNumber);
  return date && venue && raceNumber ? `${date}::${venue}::${raceNumber}` : null;
}

function lookup(races, type) {
  const groups = new Map();
  for (const race of races) {
    const key = raceJoinKey(race, type);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), race]);
  }
  return {
    unique: new Map(
      [...groups].filter(([, values]) => values.length === 1)
        .map(([key, values]) => [key, values[0]]),
    ),
    duplicateCount:
      [...groups.values()].filter((values) => values.length > 1).length,
  };
}

function exactJoin(historyItems, sourceRaces) {
  const types = [
    "raceKey",
    "dateVenueKeyRaceNumber",
    "dateVenueNameRaceNumber",
  ];
  const lookups = Object.fromEntries(
    types.map((type) => [type, lookup(sourceRaces, type)]),
  );
  const counts = Object.fromEntries(types.map((type) => [type, 0]));
  const consumed = new Set();
  const matches = historyItems.map((historyRace) => {
    for (const type of types) {
      const sourceRace =
        lookups[type].unique.get(raceJoinKey(historyRace, type));
      if (!sourceRace) continue;
      counts[type] += 1;
      consumed.add(sourceRace);
      return { historyRace, sourceRace, matchedBy: type };
    }
    return { historyRace, sourceRace: null, matchedBy: null };
  });
  const matchedRaceCount = matches.filter((match) => match.sourceRace).length;
  const bridgeEligibleRaceCount = matches.filter(
    ({ sourceRace }) =>
      array(sourceRace?.starters).length > 0
      && array(sourceRace?.starters).every(
        (starter) =>
          text(starter.carNo)
          && text(starter.name)
          && text(starter.registrationNo),
      ),
  ).length;
  const duplicateJoinKeyCount = types.reduce(
    (total, type) => total + lookups[type].duplicateCount,
    0,
  );
  return {
    matches,
    summary: {
      raceKeyDirectMatchedCount: counts.raceKey,
      dateVenueKeyRaceNumberMatchedCount:
        counts.dateVenueKeyRaceNumber,
      dateVenueNameRaceNumberMatchedCount:
        counts.dateVenueNameRaceNumber,
      matchedRaceCount,
      bridgeEligibleRaceCount,
      bridgeBlockedRaceCount: historyItems.length - bridgeEligibleRaceCount,
      unmatchedHistoryRaceCount: historyItems.length - matchedRaceCount,
      unmatchedStartersRaceCount:
        sourceRaces.filter((race) => !consumed.has(race)).length,
      duplicateJoinKeyCount,
      exactJoinStatus:
        matchedRaceCount === historyItems.length
        && consumed.size === sourceRaces.length
        && duplicateJoinKeyCount === 0
          ? "OK"
          : "FAIL",
    },
  };
}

function buildDailyCandidate(history, join) {
  const sourceByHistory = new Map(
    join.matches.map(({ historyRace, sourceRace }) => [historyRace, sourceRace]),
  );
  const candidate = clone(history);
  candidate.items = array(history.items).map((item) => {
    const sourceRace = sourceByHistory.get(item);
    if (!sourceRace) return clone(item);
    const starters = clone(sourceRace.starters);
    const quality = clone(item.quality ?? {});
    if (Object.hasOwn(quality, "starterParsed")) quality.starterParsed = true;
    if (
      Object.hasOwn(quality, "starterSource")
      || Object.hasOwn(quality, "starterParsed")
    ) {
      quality.starterSource = "same-date-exact-starters-source";
    }
    if (Array.isArray(quality.warnings)) {
      quality.warnings = quality.warnings.filter(
        (warning) =>
          !/NO_STARTERS|no starters|starter identity intentionally not generated/i
            .test(text(warning)),
      );
    }
    return {
      ...clone(item),
      starterCount: starters.length,
      starters,
      quality,
    };
  });
  return candidate;
}

function stripAllowedDailyChanges(item) {
  const copy = clone(item);
  delete copy.starters;
  delete copy.starterCount;
  if (copy.quality) {
    delete copy.quality.starterParsed;
    delete copy.quality.starterSource;
    delete copy.quality.warnings;
  }
  return copy;
}

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

function latestItem(index) {
  return [...array(index?.items)].sort((a, b) =>
    text(a?.date).localeCompare(text(b?.date)),
  ).at(-1) ?? null;
}

function buildIndexCandidate(index) {
  const candidate = clone(index);
  const target =
    array(candidate.items).find((item) => item?.date === TARGET_DATE);
  if (target && Object.hasOwn(target, "bytes")) {
    target.bytes = EXPECTED_CANDIDATE_DAILY_BYTES;
  }
  if (Object.hasOwn(candidate, "totalBytes")) {
    candidate.totalBytes = EXPECTED_CANDIDATE_TOTAL_BYTES;
  }
  return candidate;
}

function diffIndexPaths(before, after) {
  const paths = [];
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (key === "items") continue;
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      paths.push(key);
    }
  }
  const beforeByDate = new Map(
    array(before.items).map((item) => [item.date, item]),
  );
  const afterByDate = new Map(
    array(after.items).map((item) => [item.date, item]),
  );
  for (const date of new Set([...beforeByDate.keys(), ...afterByDate.keys()])) {
    const beforeItem = beforeByDate.get(date) ?? {};
    const afterItem = afterByDate.get(date) ?? {};
    for (const key of new Set([
      ...Object.keys(beforeItem),
      ...Object.keys(afterItem),
    ])) {
      if (JSON.stringify(beforeItem[key]) !== JSON.stringify(afterItem[key])) {
        paths.push(`items[${date}].${key}`);
      }
    }
  }
  return paths;
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
  const allowed = (file) => file === THIS_SCRIPT || knownReview(file);
  const unexpected = files.filter((file) => !allowed(file));
  const guard = {
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
  guard.guardStatus =
    guard.allowedNewScriptOnly
    && !guard.historyIndexModified
    && !guard.historyDailyModified
    && !guard.analyticsSourceModified
    && !guard.racesModified
    && !guard.reviewsTouchedByThisStep
    && !guard.privateInputModified
    && !guard.srcModified
    && !guard.packageModified
    && !guard.existingScriptModified
    && stagedFiles.length === 0
      ? "pass"
      : "fail";
  return guard;
}

function nextActionPlan(ready) {
  const actions = [
    "combined daily + index writer/checker implementation",
    "combined daily + index actual write",
    "combined daily + index checker",
    "final history/index/daily/source consistency audit",
    "UI/API consumption check",
    "6/25〜6/28 history追加は別工程",
  ];
  return actions.map((action, index) => ({
    stepId: index + 1,
    action,
    prerequisiteStatus:
      index === 0 ? (ready ? "write safety audit passed" : "blocked") : "previous step passed",
    allowedFiles:
      index === 1
        ? [DAILY_PATH, INDEX_PATH]
        : ["separate-step scoped files"],
    prohibitedFiles: [
      "public/data/analytics/kurari-ex/source/**",
      "public/data/races/**",
      "public/data/reviews/**",
      "private-input/**",
      "src/**",
      "package.json",
      "existing scripts",
    ],
    readiness: index === 0 && ready ? "ready" : "future",
    notes: index === 1
      ? "replace both validated candidates in one guarded operation"
      : "not performed by this audit",
  }));
}

function printSection(name, value) {
  console.log(`\n[${name}]`);
  console.log(JSON.stringify(value, null, 2));
}

export async function auditCombinedWriteSafety() {
  const watched = [DAILY_PATH, INDEX_PATH, SOURCE_PATH, ENTRIES_PATH];
  const beforeHashes = Object.fromEntries(await Promise.all(
    watched.map(async (file) => {
      const read = await readJson(file);
      return [file, read.payload ? hash(read.payload) : null];
    }),
  ));
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
  const dailyItems = array(daily.items);
  const sourceRaces = array(source.races);
  const entriesRaces = array(entries.races);
  const sourceStarters =
    sourceRaces.flatMap((race) => array(race.starters));
  const entriesStarters =
    entriesRaces.flatMap((race) => array(race.entries));
  const currentDailyHash = dailyRead.payload ? hash(daily) : null;
  const currentIndexHash = indexRead.payload ? hash(index) : null;
  const latest = latestItem(index);
  const targetEntries =
    array(index.items).filter((item) => item?.date === TARGET_DATE);
  const target = targetEntries[0] ?? null;
  const currentPrecondition = {
    targetDate: TARGET_DATE,
    historyDailyExists: dailyRead.exists,
    historyDailyParseStatus: dailyRead.parseStatus,
    currentHistoryDailyHash: currentDailyHash,
    expectedCurrentHistoryDailyHash: EXPECTED_CURRENT_DAILY_HASH,
    currentHistoryDailyHashMatched:
      currentDailyHash === EXPECTED_CURRENT_DAILY_HASH,
    currentHistoryDailyBytes: dailyRead.bytes,
    expectedCurrentHistoryDailyBytes: EXPECTED_CURRENT_DAILY_BYTES,
    currentHistoryDailyBytesMatched:
      dailyRead.bytes === EXPECTED_CURRENT_DAILY_BYTES,
    currentDailyRaceCount: dailyItems.length,
    currentDailyVenueCount:
      new Set(dailyItems.map((item) => item.venueName).filter(Boolean)).size,
    currentDailyNoStartersRaceCount: dailyItems.filter(
      (item) =>
        array(item.starters).length === 0
        && item?.quality?.starterParsed === false,
    ).length,
    currentDailyStartersNonEmptyRaceCount:
      dailyItems.filter((item) => array(item.starters).length > 0).length,
    currentDailyStarterTotal:
      dailyItems.flatMap((item) => array(item.starters)).length,
    currentDailyStarterParsedFalseCount:
      dailyItems.filter((item) => item?.quality?.starterParsed === false).length,
    historyIndexExists: indexRead.exists,
    historyIndexParseStatus: indexRead.parseStatus,
    currentHistoryIndexHash: currentIndexHash,
    currentIndexSourceCount: array(index.items).length,
    currentIndexDayCount: index.dayCount ?? null,
    currentIndexRaceCount: index.raceCount ?? null,
    currentIndexSettledRaceCount: index.settledRaceCount ?? null,
    currentIndexCancelledRaceCount: index.cancelledRaceCount ?? null,
    currentIndexLatestDate: latest?.date ?? null,
    currentIndexLatestPath: latest?.file ?? null,
    currentIndexTotalBytes: index.totalBytes ?? null,
    expectedCurrentIndexTotalBytes: EXPECTED_CURRENT_TOTAL_BYTES,
    currentIndexTotalBytesMatched:
      index.totalBytes === EXPECTED_CURRENT_TOTAL_BYTES,
    targetDateIndexEntryExists: targetEntries.length === 1,
    targetDateIndexPath: target?.file ?? null,
    targetDateIndexRaceCount: target?.raceCount ?? null,
    targetDateIndexBytes: target?.bytes ?? null,
    expectedTargetDateIndexBytes: EXPECTED_CURRENT_DAILY_BYTES,
    targetDateIndexBytesMatched:
      target?.bytes === EXPECTED_CURRENT_DAILY_BYTES,
    targetDateIndexBytesMatchedCurrentDaily:
      target?.bytes === dailyRead.bytes,
    startersSourceExists: sourceRead.exists,
    startersSourceParseStatus: sourceRead.parseStatus,
    startersSourceRaceCount: sourceRaces.length,
    startersSourceStarterTotal: sourceStarters.length,
    entriesSnapshotExists: entriesRead.exists,
    entriesSnapshotParseStatus: entriesRead.parseStatus,
    entriesSnapshotRaceCount: entriesRaces.length,
    entriesSnapshotStarterTotal: entriesStarters.length,
  };
  currentPrecondition.currentPreconditionStatus =
    currentPrecondition.historyDailyExists
    && currentPrecondition.historyDailyParseStatus === "ok"
    && currentPrecondition.currentHistoryDailyHashMatched
    && currentPrecondition.currentHistoryDailyBytesMatched
    && currentPrecondition.currentDailyRaceCount === 64
    && currentPrecondition.currentDailyVenueCount === 7
    && currentPrecondition.currentDailyNoStartersRaceCount === 64
    && currentPrecondition.currentDailyStarterTotal === 0
    && currentPrecondition.currentDailyStarterParsedFalseCount === 64
    && currentPrecondition.historyIndexExists
    && currentPrecondition.historyIndexParseStatus === "ok"
    && currentPrecondition.currentIndexSourceCount === 53
    && currentPrecondition.currentIndexDayCount === 53
    && currentPrecondition.currentIndexRaceCount === 3997
    && currentPrecondition.currentIndexLatestDate === TARGET_DATE
    && currentPrecondition.currentIndexLatestPath === DAILY_PUBLIC_PATH
    && currentPrecondition.currentIndexTotalBytesMatched
    && currentPrecondition.targetDateIndexEntryExists
    && currentPrecondition.targetDateIndexPath === DAILY_PUBLIC_PATH
    && currentPrecondition.targetDateIndexRaceCount === 64
    && currentPrecondition.targetDateIndexBytesMatched
    && currentPrecondition.targetDateIndexBytesMatchedCurrentDaily
    && currentPrecondition.startersSourceRaceCount === 64
    && currentPrecondition.startersSourceStarterTotal === 464
    && currentPrecondition.entriesSnapshotRaceCount === 64
    && currentPrecondition.entriesSnapshotStarterTotal === 464
      ? "OK"
      : "FAIL";

  const join = exactJoin(dailyItems, sourceRaces);
  const candidateDailyPayload = buildDailyCandidate(daily, join);
  const candidateDailyPayloadAgain = buildDailyCandidate(daily, join);
  const candidateItems = array(candidateDailyPayload.items);
  const candidateStarters =
    candidateItems.flatMap((item) => array(item.starters));
  const candidateDailyHash = hash(candidateDailyPayload);
  const candidateDailyBytes = serializedBytes(candidateDailyPayload);
  const nonStarterFieldChangedCount = dailyItems.filter(
    (item, itemIndex) =>
      JSON.stringify(stripAllowedDailyChanges(item))
      !== JSON.stringify(stripAllowedDailyChanges(candidateItems[itemIndex])),
  ).length;
  const candidateDaily = {
    candidateDailyRaceCount: candidateItems.length,
    candidateDailyVenueCount:
      new Set(candidateItems.map((item) => item.venueName).filter(Boolean)).size,
    candidateDailyStartersNonEmptyRaceCount:
      candidateItems.filter((item) => array(item.starters).length > 0).length,
    candidateDailyStartersEmptyRaceCount:
      candidateItems.filter((item) => array(item.starters).length === 0).length,
    candidateDailyStarterTotal: candidateStarters.length,
    candidateDailyMissingRegistrationNoCount:
      candidateStarters.filter((starter) => !text(starter.registrationNo)).length,
    candidateDailyDuplicateCarNoWithinRaceCount: candidateItems.filter(
      (item) =>
        countDuplicates(array(item.starters).map((starter) => starter.carNo)) > 0,
    ).length,
    candidateDailyDuplicateRegistrationNoWithinRaceCount:
      candidateItems.filter(
        (item) =>
          countDuplicates(
            array(item.starters).map((starter) => starter.registrationNo),
          ) > 0,
      ).length,
    candidateDailyStarterParsedTrueCount:
      candidateItems.filter((item) => item?.quality?.starterParsed === true).length,
    candidateDailyStarterParsedFalseCount:
      candidateItems.filter((item) => item?.quality?.starterParsed === false).length,
    ...join.summary,
    nonStarterFieldChangedCount,
    resultChangedCount: fieldChangedCount(dailyItems, candidateItems, "result"),
    predictionChangedCount:
      fieldChangedCount(dailyItems, candidateItems, "prediction"),
    lineupChangedCount: fieldChangedCount(dailyItems, candidateItems, "lineup"),
    weatherChangedCount: fieldChangedCount(dailyItems, candidateItems, "weather"),
    candidateDailyHash,
    expectedCandidateDailyHash: EXPECTED_CANDIDATE_DAILY_HASH,
    candidateDailyHashMatched:
      candidateDailyHash === EXPECTED_CANDIDATE_DAILY_HASH,
    candidateDailyHashStable:
      candidateDailyHash === hash(candidateDailyPayloadAgain),
    candidateDailyBytes,
    expectedCandidateDailyBytes: EXPECTED_CANDIDATE_DAILY_BYTES,
    candidateDailyBytesMatched:
      candidateDailyBytes === EXPECTED_CANDIDATE_DAILY_BYTES,
  };
  candidateDaily.candidateDailyStatus =
    candidateDaily.candidateDailyRaceCount === 64
    && candidateDaily.candidateDailyVenueCount === 7
    && candidateDaily.candidateDailyStartersNonEmptyRaceCount === 64
    && candidateDaily.candidateDailyStartersEmptyRaceCount === 0
    && candidateDaily.candidateDailyStarterTotal === 464
    && candidateDaily.candidateDailyMissingRegistrationNoCount === 0
    && candidateDaily.candidateDailyDuplicateCarNoWithinRaceCount === 0
    && candidateDaily.candidateDailyDuplicateRegistrationNoWithinRaceCount === 0
    && candidateDaily.candidateDailyStarterParsedTrueCount === 64
    && candidateDaily.candidateDailyStarterParsedFalseCount === 0
    && candidateDaily.exactJoinStatus === "OK"
    && candidateDaily.nonStarterFieldChangedCount === 0
    && candidateDaily.resultChangedCount === 0
    && candidateDaily.predictionChangedCount === 0
    && candidateDaily.lineupChangedCount === 0
    && candidateDaily.weatherChangedCount === 0
    && candidateDaily.candidateDailyHashMatched
    && candidateDaily.candidateDailyHashStable
    && candidateDaily.candidateDailyBytesMatched
      ? "OK"
      : "FAIL";

  const candidateIndexPayload = buildIndexCandidate(index);
  const candidateIndexPayloadAgain = buildIndexCandidate(index);
  const candidateIndexHash = hash(candidateIndexPayload);
  const candidateLatest = latestItem(candidateIndexPayload);
  const candidateTarget = array(candidateIndexPayload.items)
    .find((item) => item?.date === TARGET_DATE);
  const changedFieldPaths = diffIndexPaths(index, candidateIndexPayload);
  const unexpectedChangedFieldPaths = changedFieldPaths.filter(
    (field) => !ALLOWED_INDEX_CHANGED_PATHS.includes(field),
  );
  const otherItemsChangedCount = array(index.items).filter(
    (item, itemIndex) =>
      item.date !== TARGET_DATE
      && JSON.stringify(item)
        !== JSON.stringify(candidateIndexPayload.items[itemIndex]),
  ).length;
  const candidateIndex = {
    currentHistoryIndexHash: currentIndexHash,
    candidateHistoryIndexHash: candidateIndexHash,
    currentIndexTotalBytes: index.totalBytes ?? null,
    candidateIndexTotalBytes: candidateIndexPayload.totalBytes ?? null,
    expectedCandidateIndexTotalBytes: EXPECTED_CANDIDATE_TOTAL_BYTES,
    indexTotalBytesDelta:
      Number(candidateIndexPayload.totalBytes) - Number(index.totalBytes),
    expectedIndexTotalBytesDelta: EXPECTED_BYTES_DELTA,
    targetDateIndexBytesBefore: target?.bytes ?? null,
    targetDateIndexBytesAfter: candidateTarget?.bytes ?? null,
    expectedTargetDateIndexBytesAfter: EXPECTED_CANDIDATE_DAILY_BYTES,
    targetDateIndexBytesDelta:
      Number(candidateTarget?.bytes) - Number(target?.bytes),
    expectedTargetDateIndexBytesDelta: EXPECTED_BYTES_DELTA,
    changedFieldPaths,
    allowedChangedFieldPaths: ALLOWED_INDEX_CHANGED_PATHS,
    unexpectedChangedFieldPaths,
    sourceCountBefore: array(index.items).length,
    sourceCountAfter: array(candidateIndexPayload.items).length,
    dayCountBefore: index.dayCount ?? null,
    dayCountAfter: candidateIndexPayload.dayCount ?? null,
    raceCountBefore: index.raceCount ?? null,
    raceCountAfter: candidateIndexPayload.raceCount ?? null,
    settledRaceCountBefore: index.settledRaceCount ?? null,
    settledRaceCountAfter: candidateIndexPayload.settledRaceCount ?? null,
    cancelledRaceCountBefore: index.cancelledRaceCount ?? null,
    cancelledRaceCountAfter: candidateIndexPayload.cancelledRaceCount ?? null,
    latestDateBefore: latest?.date ?? null,
    latestDateAfter: candidateLatest?.date ?? null,
    latestPathBefore: latest?.file ?? null,
    latestPathAfter: candidateLatest?.file ?? null,
    targetDatePathBefore: target?.file ?? null,
    targetDatePathAfter: candidateTarget?.file ?? null,
    targetDateRaceCountBefore: target?.raceCount ?? null,
    targetDateRaceCountAfter: candidateTarget?.raceCount ?? null,
    otherItemsChangedCount,
    candidateIndexHashStable:
      candidateIndexHash === hash(candidateIndexPayloadAgain),
    candidateIndexSchemaCompatibility:
      changedFieldPaths.length === ALLOWED_INDEX_CHANGED_PATHS.length
      && unexpectedChangedFieldPaths.length === 0
      && ALLOWED_INDEX_CHANGED_PATHS.every((field) =>
        changedFieldPaths.includes(field))
        ? "compatible"
        : "incompatible",
  };
  candidateIndex.candidateIndexStatus =
    candidateIndex.candidateIndexTotalBytes === EXPECTED_CANDIDATE_TOTAL_BYTES
    && candidateIndex.indexTotalBytesDelta === EXPECTED_BYTES_DELTA
    && candidateIndex.targetDateIndexBytesAfter === EXPECTED_CANDIDATE_DAILY_BYTES
    && candidateIndex.targetDateIndexBytesDelta === EXPECTED_BYTES_DELTA
    && candidateIndex.unexpectedChangedFieldPaths.length === 0
    && candidateIndex.sourceCountAfter === candidateIndex.sourceCountBefore
    && candidateIndex.dayCountAfter === candidateIndex.dayCountBefore
    && candidateIndex.raceCountAfter === candidateIndex.raceCountBefore
    && candidateIndex.settledRaceCountAfter
      === candidateIndex.settledRaceCountBefore
    && candidateIndex.cancelledRaceCountAfter
      === candidateIndex.cancelledRaceCountBefore
    && candidateIndex.latestDateAfter === candidateIndex.latestDateBefore
    && candidateIndex.latestPathAfter === candidateIndex.latestPathBefore
    && candidateIndex.targetDatePathAfter === candidateIndex.targetDatePathBefore
    && candidateIndex.targetDateRaceCountAfter
      === candidateIndex.targetDateRaceCountBefore
    && candidateIndex.otherItemsChangedCount === 0
    && candidateIndex.candidateIndexHashStable
    && candidateIndex.candidateIndexSchemaCompatibility === "compatible"
      ? "OK"
      : "FAIL";

  const countReconciliation = {
    historyRaceCount: dailyItems.length,
    startersSourceRaceCount: sourceRaces.length,
    entriesSnapshotRaceCount: entriesRaces.length,
    candidateDailyRaceCount: candidateItems.length,
    currentHistoryStarterTotal:
      dailyItems.flatMap((item) => array(item.starters)).length,
    sourceStarterTotal: sourceStarters.length,
    entriesStarterTotal: entriesStarters.length,
    candidateDailyStarterTotal: candidateStarters.length,
    currentTargetDateBytes: dailyRead.bytes,
    candidateTargetDateBytes: candidateDailyBytes,
    bytesDelta: candidateDailyBytes - dailyRead.bytes,
    indexTargetDateBytesBefore: target?.bytes ?? null,
    indexTargetDateBytesAfterPlanned: candidateTarget?.bytes ?? null,
    indexTotalBytesBefore: index.totalBytes ?? null,
    indexTotalBytesAfterPlanned: candidateIndexPayload.totalBytes ?? null,
    sourceCountBefore: array(index.items).length,
    sourceCountAfterPlanned: array(candidateIndexPayload.items).length,
    dayCountBefore: index.dayCount ?? null,
    dayCountAfterPlanned: candidateIndexPayload.dayCount ?? null,
    raceCountBefore: index.raceCount ?? null,
    raceCountAfterPlanned: candidateIndexPayload.raceCount ?? null,
  };
  countReconciliation.countReconciliationStatus =
    new Set([
      countReconciliation.historyRaceCount,
      countReconciliation.startersSourceRaceCount,
      countReconciliation.entriesSnapshotRaceCount,
      countReconciliation.candidateDailyRaceCount,
    ]).size === 1
    && new Set([
      countReconciliation.sourceStarterTotal,
      countReconciliation.entriesStarterTotal,
      countReconciliation.candidateDailyStarterTotal,
    ]).size === 1
    && countReconciliation.bytesDelta === EXPECTED_BYTES_DELTA
    && countReconciliation.indexTargetDateBytesBefore
      === countReconciliation.currentTargetDateBytes
    && countReconciliation.indexTargetDateBytesAfterPlanned
      === countReconciliation.candidateTargetDateBytes
    && countReconciliation.indexTotalBytesAfterPlanned
      === countReconciliation.indexTotalBytesBefore + EXPECTED_BYTES_DELTA
    && countReconciliation.sourceCountBefore
      === countReconciliation.sourceCountAfterPlanned
    && countReconciliation.dayCountBefore
      === countReconciliation.dayCountAfterPlanned
    && countReconciliation.raceCountBefore
      === countReconciliation.raceCountAfterPlanned
      ? "OK"
      : "FAIL";

  const afterHashes = Object.fromEntries(await Promise.all(
    watched.map(async (file) => {
      const read = await readJson(file);
      return [file, read.payload ? hash(read.payload) : null];
    }),
  ));
  const changedDuringAudit = watched.filter(
    (file) => beforeHashes[file] !== afterHashes[file],
  );
  const guard = protectedGuard();
  const baseReady =
    currentPrecondition.currentPreconditionStatus === "OK"
    && candidateDaily.candidateDailyStatus === "OK"
    && candidateIndex.candidateIndexStatus === "OK"
    && countReconciliation.countReconciliationStatus === "OK"
    && changedDuringAudit.length === 0;
  const writeAllowedLater = baseReady && guard.guardStatus === "pass";
  const combinedWriteSafety = {
    writeModePlanned:
      "replace-history-daily-and-refresh-history-index-bytes-with-hash-preconditions",
    allowedWriteFilesPlanned: [DAILY_PATH, INDEX_PATH],
    prohibitedWriteFilesPlanned: [
      "public/data/analytics/kurari-ex/source/**",
      "public/data/races/**",
      "public/data/reviews/**",
      "private-input/**",
      "src/**",
      "package.json",
      "existing scripts",
    ],
    requiredCurrentDailyHash: EXPECTED_CURRENT_DAILY_HASH,
    requiredCandidateDailyHash: EXPECTED_CANDIDATE_DAILY_HASH,
    requiredCurrentIndexHash: currentIndexHash,
    requiredCandidateIndexHash: candidateIndexHash,
    requiredCurrentTargetDateBytes: EXPECTED_CURRENT_DAILY_BYTES,
    requiredCandidateTargetDateBytes: EXPECTED_CANDIDATE_DAILY_BYTES,
    requiredBytesDelta: EXPECTED_BYTES_DELTA,
    requiredCurrentTotalBytes: EXPECTED_CURRENT_TOTAL_BYTES,
    requiredCandidateTotalBytes: EXPECTED_CANDIDATE_TOTAL_BYTES,
    dailyWriteRequired: true,
    indexWriteRequired: true,
    dailyOnlyWriteAllowed: false,
    combinedWriteRequired: true,
    writeOrderPolicy:
      "write both guarded candidates only after both candidates pass",
    rollbackPolicy: "stop before writing if either candidate fails",
    noOpPolicy: {
      bothCandidate: "no-op success",
      dailyCandidateIndexCurrent: "require index-only refresh policy",
      dailyCurrentIndexCandidate: "block as inconsistent",
      unknownHash: "block",
    },
    writeAllowedLater,
    writePerformed: false,
    combinedWriteSafetyStatus: writeAllowedLater
      ? "READY_FOR_COMBINED_DAILY_AND_INDEX_WRITER_IMPLEMENTATION"
      : candidateDaily.candidateDailyStatus !== "OK"
        ? "NEEDS_DAILY_CANDIDATE_FIX"
        : candidateIndex.candidateIndexStatus !== "OK"
          ? "NEEDS_INDEX_CANDIDATE_FIX"
          : countReconciliation.countReconciliationStatus !== "OK"
            ? "NEEDS_COUNT_RECONCILIATION"
            : "BLOCKED",
  };
  const combinedCheckerPrePlan = {
    expectedDailyHashAfterWrite: EXPECTED_CANDIDATE_DAILY_HASH,
    expectedDailyBytesAfterWrite: EXPECTED_CANDIDATE_DAILY_BYTES,
    expectedIndexHashAfterWrite: candidateIndexHash,
    expectedIndexTotalBytesAfterWrite: EXPECTED_CANDIDATE_TOTAL_BYTES,
    expectedTargetDateIndexBytesAfterWrite: EXPECTED_CANDIDATE_DAILY_BYTES,
    expectedStartersNonEmptyRaceCount: 64,
    expectedStarterTotal: 464,
    expectedMissingRegistrationNoCount: 0,
    expectedIndexChangedFieldPaths: ALLOWED_INDEX_CHANGED_PATHS,
    expectedUnchangedCriticalFields: [
      "sourceCount",
      "dayCount",
      "raceCount",
      "latestDate",
      "latestPath",
      "targetDate.path",
      "targetDate.raceCount",
    ],
    expectedNoFakeCompletion: true,
    expectedNoFuzzyMatching: true,
    expectedNoRegistrationNoGenerated: true,
    prePlanStatus: baseReady ? "OK" : "FAIL",
  };

  const blockReasonCounts = Object.fromEntries(
    BLOCK_REASON_KEYS.map((key) => [key, 0]),
  );
  if (!dailyRead.exists) increment(blockReasonCounts, "HISTORY_DAILY_MISSING");
  if (dailyRead.parseStatus === "failed") {
    increment(blockReasonCounts, "HISTORY_DAILY_PARSE_FAILED");
  }
  if (!currentPrecondition.currentHistoryDailyHashMatched) {
    increment(blockReasonCounts, "HISTORY_DAILY_HASH_MISMATCH");
  }
  if (!currentPrecondition.currentHistoryDailyBytesMatched) {
    increment(blockReasonCounts, "HISTORY_DAILY_BYTES_MISMATCH");
  }
  if (!indexRead.exists) increment(blockReasonCounts, "HISTORY_INDEX_MISSING");
  if (indexRead.parseStatus === "failed") {
    increment(blockReasonCounts, "HISTORY_INDEX_PARSE_FAILED");
  }
  if (!currentPrecondition.targetDateIndexEntryExists) {
    increment(blockReasonCounts, "HISTORY_INDEX_TARGET_DATE_MISSING");
  }
  if (!Object.hasOwn(target ?? {}, "bytes")) {
    increment(blockReasonCounts, "HISTORY_INDEX_TARGET_BYTES_MISSING");
  }
  if (!Object.hasOwn(index, "totalBytes")) {
    increment(blockReasonCounts, "HISTORY_INDEX_TOTAL_BYTES_MISSING");
  }
  if (!currentPrecondition.targetDateIndexBytesMatchedCurrentDaily) {
    increment(
      blockReasonCounts,
      "HISTORY_INDEX_TARGET_BYTES_CURRENT_DAILY_MISMATCH",
    );
  }
  if (!sourceRead.exists) increment(blockReasonCounts, "STARTERS_SOURCE_MISSING");
  if (sourceRead.parseStatus === "failed") {
    increment(blockReasonCounts, "STARTERS_SOURCE_PARSE_FAILED");
  }
  if (!entriesRead.exists) increment(blockReasonCounts, "ENTRIES_SNAPSHOT_MISSING");
  if (entriesRead.parseStatus === "failed") {
    increment(blockReasonCounts, "ENTRIES_SNAPSHOT_PARSE_FAILED");
  }
  if (join.summary.unmatchedHistoryRaceCount) {
    increment(
      blockReasonCounts,
      "EXACT_JOIN_MISSING_RACE",
      join.summary.unmatchedHistoryRaceCount,
    );
  }
  if (join.summary.unmatchedStartersRaceCount) {
    increment(
      blockReasonCounts,
      "EXACT_JOIN_EXTRA_SOURCE_RACE",
      join.summary.unmatchedStartersRaceCount,
    );
  }
  if (join.summary.duplicateJoinKeyCount) {
    increment(
      blockReasonCounts,
      "AMBIGUOUS_JOIN_KEY",
      join.summary.duplicateJoinKeyCount,
    );
  }
  if (!candidateDaily.candidateDailyHashMatched) {
    increment(blockReasonCounts, "CANDIDATE_DAILY_HASH_MISMATCH");
  }
  if (!candidateDaily.candidateDailyBytesMatched) {
    increment(blockReasonCounts, "CANDIDATE_DAILY_BYTES_MISMATCH");
  }
  if (candidateIndex.candidateIndexSchemaCompatibility !== "compatible") {
    increment(blockReasonCounts, "CANDIDATE_INDEX_SCHEMA_INCOMPATIBLE");
  }
  if (candidateIndex.unexpectedChangedFieldPaths.length) {
    increment(
      blockReasonCounts,
      "CANDIDATE_INDEX_UNEXPECTED_FIELD_CHANGE",
      candidateIndex.unexpectedChangedFieldPaths.length,
    );
  }
  if (!candidateIndex.candidateIndexHashStable) {
    increment(blockReasonCounts, "CANDIDATE_INDEX_HASH_UNSTABLE");
  }
  if (countReconciliation.countReconciliationStatus !== "OK") {
    increment(blockReasonCounts, "COUNT_RECONCILIATION_FAILED");
  }
  for (const [field, reason] of [
    ["nonStarterFieldChangedCount", "NON_STARTER_FIELD_CHANGED"],
    ["resultChangedCount", "RESULT_FIELD_CHANGED"],
    ["predictionChangedCount", "PREDICTION_FIELD_CHANGED"],
    ["lineupChangedCount", "LINEUP_FIELD_CHANGED"],
    ["weatherChangedCount", "WEATHER_FIELD_CHANGED"],
  ]) {
    if (candidateDaily[field]) {
      increment(blockReasonCounts, reason, candidateDaily[field]);
    }
  }
  if (changedDuringAudit.length) {
    increment(blockReasonCounts, "WRITE_PERFORMED_IN_AUDIT", changedDuringAudit.length);
  }
  for (const [flag, reason] of [
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
    if (guard[flag]) increment(blockReasonCounts, reason);
  }
  if (guard.stagedFiles.length) {
    increment(blockReasonCounts, "UNEXPECTED_FILE_STAGED", guard.stagedFiles.length);
  }

  let readiness =
    "READY_FOR_COMBINED_DAILY_AND_INDEX_WRITER_IMPLEMENTATION";
  if (currentPrecondition.currentPreconditionStatus !== "OK") {
    readiness = "NEEDS_HASH_LOCK";
  } else if (candidateDaily.candidateDailyStatus !== "OK") {
    readiness = "NEEDS_DAILY_CANDIDATE_FIX";
  } else if (candidateIndex.candidateIndexStatus !== "OK") {
    readiness = "NEEDS_INDEX_CANDIDATE_FIX";
  } else if (countReconciliation.countReconciliationStatus !== "OK") {
    readiness = "NEEDS_COUNT_RECONCILIATION";
  } else if (!writeAllowedLater) {
    readiness = "BLOCKED";
  }
  const summary = {
    targetDate: TARGET_DATE,
    currentHistoryDailyHash: currentDailyHash,
    expectedCurrentHistoryDailyHash: EXPECTED_CURRENT_DAILY_HASH,
    currentHistoryDailyHashMatched:
      currentPrecondition.currentHistoryDailyHashMatched,
    currentHistoryDailyBytes: dailyRead.bytes,
    expectedCurrentHistoryDailyBytes: EXPECTED_CURRENT_DAILY_BYTES,
    currentHistoryDailyBytesMatched:
      currentPrecondition.currentHistoryDailyBytesMatched,
    candidateDailyHash,
    expectedCandidateDailyHash: EXPECTED_CANDIDATE_DAILY_HASH,
    candidateDailyHashMatched: candidateDaily.candidateDailyHashMatched,
    candidateDailyBytes,
    expectedCandidateDailyBytes: EXPECTED_CANDIDATE_DAILY_BYTES,
    candidateDailyBytesMatched: candidateDaily.candidateDailyBytesMatched,
    bytesDelta: candidateDailyBytes - dailyRead.bytes,
    currentHistoryIndexHash: currentIndexHash,
    candidateHistoryIndexHash: candidateIndexHash,
    targetDateIndexBytesBefore: target?.bytes ?? null,
    targetDateIndexBytesAfterPlanned: candidateTarget?.bytes ?? null,
    indexTotalBytesBefore: index.totalBytes ?? null,
    indexTotalBytesAfterPlanned: candidateIndexPayload.totalBytes ?? null,
    indexChangedFieldPaths: changedFieldPaths,
    indexUnexpectedChangedFieldPaths: unexpectedChangedFieldPaths,
    dailyOnlyWriteAllowed: false,
    combinedWriteRequired: true,
    historyRaceCount: dailyItems.length,
    startersSourceRaceCount: sourceRaces.length,
    entriesSnapshotRaceCount: entriesRaces.length,
    sourceStarterTotal: sourceStarters.length,
    candidateDailyStarterTotal: candidateStarters.length,
    matchedRaceCount: join.summary.matchedRaceCount,
    bridgeEligibleRaceCount: join.summary.bridgeEligibleRaceCount,
    nonStarterFieldChangedCount,
    resultChangedCount: candidateDaily.resultChangedCount,
    predictionChangedCount: candidateDaily.predictionChangedCount,
    lineupChangedCount: candidateDaily.lineupChangedCount,
    weatherChangedCount: candidateDaily.weatherChangedCount,
    fakeCompletionPerformed: false,
    fuzzyMatchingPerformed: false,
    predictionUsedAsStarterSource: false,
    resultUsedAsStarterSource: false,
    lineupUsedAsStarterSource: false,
    entriesUsedAsGeneratedStarterSource: false,
    registrationNoGenerated: false,
    writeAllowedLater,
    writePerformed: false,
    historyDailyModified: changedDuringAudit.includes(DAILY_PATH),
    historyIndexModified: changedDuringAudit.includes(INDEX_PATH),
    combinedDailyIndexWriteSafetyReadiness: readiness,
    blockReasonCounts: Object.fromEntries(
      Object.entries(blockReasonCounts).filter(([, count]) => count > 0),
    ),
  };
  return {
    summary,
    currentPrecondition,
    candidateDaily,
    candidateIndex,
    combinedWriteSafety,
    combinedCheckerPrePlan,
    countReconciliation,
    protectedModificationGuard: guard,
    nextActionPlan: nextActionPlan(writeAllowedLater),
    jsonSummary: {
      ...summary,
      combinedDailyIndexWriteSafetyReadiness: { status: readiness },
      allBlockReasonCounts: blockReasonCounts,
    },
  };
}

async function main() {
  const result = await auditCombinedWriteSafety();
  printSection("summary", result.summary);
  printSection("currentPrecondition", result.currentPrecondition);
  printSection("candidateDaily", result.candidateDaily);
  printSection("candidateIndex", result.candidateIndex);
  printSection("combinedWriteSafety", result.combinedWriteSafety);
  printSection("combinedCheckerPrePlan", result.combinedCheckerPrePlan);
  printSection("countReconciliation", result.countReconciliation);
  printSection("protectedModificationGuard", result.protectedModificationGuard);
  printSection("nextActionPlan", result.nextActionPlan);
  printSection("jsonSummary", result.jsonSummary);
  if (
    result.summary.combinedDailyIndexWriteSafetyReadiness
      !== "READY_FOR_COMBINED_DAILY_AND_INDEX_WRITER_IMPLEMENTATION"
  ) {
    process.exitCode = 1;
  }
}

const isMain =
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  main().catch((error) => {
    console.error("[kurari-ex combined history starters bridge write safety] failed");
    console.error(error);
    process.exitCode = 1;
  });
}
