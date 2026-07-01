import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const TARGET_DATE = "2026-06-29";
const THIS_SCRIPT =
  "scripts/audit-kurari-ex-history-starters-bridge-index-refresh-policy-2026-06-29.mjs";
const HISTORY_DAILY_PATH =
  "public/data/analytics/kurari-ex/history/daily/2026-06/2026-06-29.generated.json";
const HISTORY_INDEX_PATH =
  "public/data/analytics/kurari-ex/history/index.generated.json";
const HISTORY_DAILY_PUBLIC_PATH =
  "/data/analytics/kurari-ex/history/daily/2026-06/2026-06-29.generated.json";
const STARTERS_SOURCE_PATH =
  "public/data/analytics/kurari-ex/source/starters/2026-06-29/today-registration-starters.generated.json";
const ENTRIES_SNAPSHOT_PATH =
  "public/data/races/entries-history/2026-06-29/keirin-jp-entries.generated.json";
const EXPECTED_CURRENT_DAILY_HASH =
  "sha256:96a4d2399cf7f57f777170648c9ab8da2f87f20b5bdcc3ed680f2ca6b67d6e2f";
const EXPECTED_CANDIDATE_DAILY_HASH =
  "sha256:21b9c6a425c6207c2995d434486957d264f83b3f8ea2b336ec92749376652c46";
const EXPECTED_CURRENT_DAILY_BYTES = 154559;
const EXPECTED_CANDIDATE_DAILY_BYTES = 441362;
const KNOWN_PREEXISTING_REVIEWS = [
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
  "NON_STARTER_FIELD_CHANGED",
  "RESULT_FIELD_CHANGED",
  "PREDICTION_FIELD_CHANGED",
  "LINEUP_FIELD_CHANGED",
  "WEATHER_FIELD_CHANGED",
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
const asArray = (value) => (Array.isArray(value) ? value : []);
const text = (value) => String(value ?? "").trim();
const hashPayload = (value) =>
  `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
const jsonBytes = (value) =>
  Buffer.byteLength(`${JSON.stringify(value, null, 2)}\n`, "utf8");
const increment = (counts, reason, by = 1) => {
  counts[reason] = (counts[reason] ?? 0) + by;
};

async function readJson(file) {
  try {
    const raw = await readFile(path.resolve(ROOT, file), "utf8");
    return {
      exists: true,
      parseStatus: "ok",
      payload: JSON.parse(raw),
      raw,
      bytes: Buffer.byteLength(raw, "utf8"),
    };
  } catch (error) {
    return {
      exists: error?.code !== "ENOENT",
      parseStatus: error?.code === "ENOENT" ? "missing" : "failed",
      payload: null,
      raw: null,
      bytes: null,
    };
  }
}

function joinKey(race, type) {
  if (type === "raceKey") return text(race?.raceKey) || null;
  const date = text(race?.date);
  const venue = text(
    type === "dateVenueKeyRaceNumber" ? race?.venueKey : race?.venueName,
  );
  const raceNumber = text(race?.raceNumber);
  return date && venue && raceNumber ? `${date}::${venue}::${raceNumber}` : null;
}

function uniqueLookup(races, type) {
  const grouped = new Map();
  for (const race of races) {
    const key = joinKey(race, type);
    if (!key) continue;
    grouped.set(key, [...(grouped.get(key) ?? []), race]);
  }
  return {
    values: new Map(
      [...grouped].filter(([, values]) => values.length === 1)
        .map(([key, values]) => [key, values[0]]),
    ),
    duplicateCount: [...grouped.values()]
      .filter((values) => values.length > 1).length,
  };
}

function exactJoin(historyItems, sourceRaces) {
  const types = [
    "raceKey",
    "dateVenueKeyRaceNumber",
    "dateVenueNameRaceNumber",
  ];
  const lookups = Object.fromEntries(
    types.map((type) => [type, uniqueLookup(sourceRaces, type)]),
  );
  const matchCounts = Object.fromEntries(types.map((type) => [type, 0]));
  const used = new Set();
  const matches = historyItems.map((historyRace) => {
    for (const type of types) {
      const sourceRace = lookups[type].values.get(joinKey(historyRace, type));
      if (!sourceRace) continue;
      matchCounts[type] += 1;
      used.add(sourceRace);
      return { historyRace, sourceRace, matchedBy: type };
    }
    return { historyRace, sourceRace: null, matchedBy: null };
  });
  const matchedRaceCount = matches.filter((match) => match.sourceRace).length;
  const bridgeEligibleRaceCount = matches.filter(
    ({ sourceRace }) =>
      asArray(sourceRace?.starters).length > 0
      && asArray(sourceRace?.starters).every(
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
      raceKeyDirectMatchedCount: matchCounts.raceKey,
      dateVenueKeyRaceNumberMatchedCount:
        matchCounts.dateVenueKeyRaceNumber,
      dateVenueNameRaceNumberMatchedCount:
        matchCounts.dateVenueNameRaceNumber,
      matchedRaceCount,
      bridgeEligibleRaceCount,
      bridgeBlockedRaceCount: historyItems.length - bridgeEligibleRaceCount,
      unmatchedHistoryRaceCount: historyItems.length - matchedRaceCount,
      unmatchedStartersRaceCount:
        sourceRaces.filter((race) => !used.has(race)).length,
      duplicateJoinKeyCount,
      exactJoinStatus:
        matchedRaceCount === historyItems.length
        && used.size === sourceRaces.length
        && duplicateJoinKeyCount === 0
          ? "OK"
          : "FAIL",
    },
  };
}

function buildCandidateDaily(history, join) {
  const sourceByHistory = new Map(
    join.matches.map(({ historyRace, sourceRace }) => [historyRace, sourceRace]),
  );
  const candidate = clone(history);
  candidate.items = asArray(history.items).map((item) => {
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

function fieldChangedCount(beforeItems, afterItems, field) {
  return beforeItems.filter(
    (item, index) =>
      JSON.stringify(item?.[field]) !== JSON.stringify(afterItems[index]?.[field]),
  ).length;
}

function latestIndexEntry(index) {
  return [...asArray(index?.items)].sort((a, b) =>
    text(a?.date).localeCompare(text(b?.date)),
  ).at(-1) ?? null;
}

function propertyNamesMatching(value, pattern, prefix = "") {
  const matches = [];
  if (!value || typeof value !== "object") return matches;
  for (const [key, child] of Object.entries(value)) {
    const propertyPath = prefix ? `${prefix}.${key}` : key;
    if (pattern.test(key)) matches.push(propertyPath);
    if (child && typeof child === "object") {
      matches.push(...propertyNamesMatching(child, pattern, propertyPath));
    }
  }
  return matches;
}

function changedTopLevelFields(before, after) {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  return [...keys].filter(
    (key) => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key]),
  );
}

function changedEntryFields(before, after) {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  return [...keys].filter(
    (key) => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key]),
  );
}

function buildCandidateIndex(index, candidateDailyBytes) {
  const candidate = clone(index);
  const targetBefore =
    asArray(index.items).find((item) => item?.date === TARGET_DATE) ?? null;
  const targetAfter =
    asArray(candidate.items).find((item) => item?.date === TARGET_DATE) ?? null;
  const bytesDelta = candidateDailyBytes - Number(targetBefore?.bytes ?? 0);
  if (targetAfter && Object.hasOwn(targetAfter, "bytes")) {
    targetAfter.bytes = candidateDailyBytes;
  }
  if (Object.hasOwn(candidate, "totalBytes")) {
    candidate.totalBytes = Number(index.totalBytes) + bytesDelta;
  }
  return { candidate, targetBefore, targetAfter, bytesDelta };
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

function protectedModificationGuard() {
  const lines = gitLines(["status", "--porcelain=v1", "--untracked-files=normal"]);
  const files = lines.map(statusPath);
  const stagedFiles = gitLines(["diff", "--cached", "--name-only"]);
  const knownReview = (file) => KNOWN_PREEXISTING_REVIEWS.some(
    (known) => known.endsWith("/") ? file.startsWith(known) : file === known,
  );
  const allowed = (file) => file === THIS_SCRIPT || knownReview(file);
  const unexpected = files.filter((file) => !allowed(file));
  const result = {
    allowedNewScriptOnly:
      files.includes(THIS_SCRIPT) && unexpected.length === 0,
    historyIndexModified: files.includes(HISTORY_INDEX_PATH),
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

function nextActionPlan(ready) {
  const actions = [
    "combined daily + index write safety audit",
    "combined daily + index writer implementation",
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
      index === 0 ? (ready ? "refresh policy audit passed" : "blocked") : "previous step passed",
    allowedFiles:
      index === 2
        ? [HISTORY_DAILY_PATH, HISTORY_INDEX_PATH]
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
    notes: index === 2
      ? "daily and index must be validated and replaced as one guarded operation"
      : "not performed by this policy audit",
  }));
}

function printSection(name, value) {
  console.log(`\n[${name}]`);
  console.log(JSON.stringify(value, null, 2));
}

export async function auditIndexRefreshPolicy() {
  const watchedFiles = [
    HISTORY_DAILY_PATH,
    HISTORY_INDEX_PATH,
    STARTERS_SOURCE_PATH,
    ENTRIES_SNAPSHOT_PATH,
  ];
  const beforeHashes = Object.fromEntries(await Promise.all(
    watchedFiles.map(async (file) => {
      const read = await readJson(file);
      return [file, read.payload ? hashPayload(read.payload) : null];
    }),
  ));
  const [dailyRead, indexRead, sourceRead, entriesRead] = await Promise.all([
    readJson(HISTORY_DAILY_PATH),
    readJson(HISTORY_INDEX_PATH),
    readJson(STARTERS_SOURCE_PATH),
    readJson(ENTRIES_SNAPSHOT_PATH),
  ]);
  const daily = dailyRead.payload ?? {};
  const index = indexRead.payload ?? {};
  const source = sourceRead.payload ?? {};
  const entries = entriesRead.payload ?? {};
  const dailyItems = asArray(daily.items);
  const sourceRaces = asArray(source.races);
  const entriesRaces = asArray(entries.races);
  const sourceStarters =
    sourceRaces.flatMap((race) => asArray(race.starters));
  const entriesStarters =
    entriesRaces.flatMap((race) => asArray(race.entries));
  const currentDailyHash = dailyRead.payload ? hashPayload(daily) : null;
  const currentIndexHash = indexRead.payload ? hashPayload(index) : null;
  const latest = latestIndexEntry(index);
  const targetEntries =
    asArray(index.items).filter((item) => item?.date === TARGET_DATE);
  const targetEntry = targetEntries[0] ?? null;
  const currentState = {
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
    currentDailyNoStartersRaceCount: dailyItems.filter(
      (item) =>
        asArray(item.starters).length === 0
        && item?.quality?.starterParsed === false,
    ).length,
    currentDailyStarterTotal:
      dailyItems.flatMap((item) => asArray(item.starters)).length,
    historyIndexExists: indexRead.exists,
    historyIndexParseStatus: indexRead.parseStatus,
    currentHistoryIndexHash: currentIndexHash,
    currentIndexSourceCount: asArray(index.items).length,
    currentIndexDayCount: index.dayCount ?? null,
    currentIndexRaceCount: index.raceCount ?? null,
    currentIndexLatestDate: latest?.date ?? null,
    currentIndexLatestPath: latest?.file ?? null,
    targetDateIndexEntryExists: targetEntries.length === 1,
    targetDateIndexPath: targetEntry?.file ?? null,
    targetDateIndexRaceCount: targetEntry?.raceCount ?? null,
    targetDateIndexBytes: targetEntry?.bytes ?? null,
    targetDateIndexBytesMatchedCurrentDaily:
      targetEntry?.bytes === dailyRead.bytes,
    currentIndexTotalBytes: index.totalBytes ?? null,
    startersSourceExists: sourceRead.exists,
    startersSourceParseStatus: sourceRead.parseStatus,
    startersSourceRaceCount: sourceRaces.length,
    startersSourceStarterTotal: sourceStarters.length,
    entriesSnapshotExists: entriesRead.exists,
    entriesSnapshotParseStatus: entriesRead.parseStatus,
    entriesSnapshotRaceCount: entriesRaces.length,
    entriesSnapshotStarterTotal: entriesStarters.length,
  };
  currentState.currentStateStatus =
    currentState.historyDailyExists
    && currentState.historyDailyParseStatus === "ok"
    && currentState.currentHistoryDailyHashMatched
    && currentState.currentHistoryDailyBytesMatched
    && currentState.currentDailyRaceCount === 64
    && currentState.currentDailyNoStartersRaceCount === 64
    && currentState.currentDailyStarterTotal === 0
    && currentState.historyIndexExists
    && currentState.historyIndexParseStatus === "ok"
    && currentState.currentIndexSourceCount === 53
    && currentState.currentIndexDayCount === 53
    && currentState.currentIndexRaceCount === 3997
    && currentState.currentIndexLatestDate === TARGET_DATE
    && currentState.currentIndexLatestPath === HISTORY_DAILY_PUBLIC_PATH
    && currentState.targetDateIndexEntryExists
    && currentState.targetDateIndexPath === HISTORY_DAILY_PUBLIC_PATH
    && currentState.targetDateIndexRaceCount === 64
    && currentState.targetDateIndexBytesMatchedCurrentDaily
    && currentState.startersSourceRaceCount === 64
    && currentState.startersSourceStarterTotal === 464
    && currentState.entriesSnapshotRaceCount === 64
    && currentState.entriesSnapshotStarterTotal === 464
      ? "OK"
      : "FAIL";

  const join = exactJoin(dailyItems, sourceRaces);
  const candidateDailyPayload = buildCandidateDaily(daily, join);
  const candidateItems = asArray(candidateDailyPayload.items);
  const candidateStarters =
    candidateItems.flatMap((item) => asArray(item.starters));
  const candidateDailyHash = hashPayload(candidateDailyPayload);
  const candidateDailyBytes = jsonBytes(candidateDailyPayload);
  const nonStarterFieldChangedCount = dailyItems.filter(
    (item, indexInItems) =>
      JSON.stringify(stripAllowedDailyChanges(item))
      !== JSON.stringify(stripAllowedDailyChanges(candidateItems[indexInItems])),
  ).length;
  const candidateDaily = {
    candidateDailyRaceCount: candidateItems.length,
    candidateDailyVenueCount:
      new Set(candidateItems.map((item) => item.venueName).filter(Boolean)).size,
    candidateDailyStartersNonEmptyRaceCount:
      candidateItems.filter((item) => asArray(item.starters).length > 0).length,
    candidateDailyStartersEmptyRaceCount:
      candidateItems.filter((item) => asArray(item.starters).length === 0).length,
    candidateDailyStarterTotal: candidateStarters.length,
    candidateDailyMissingRegistrationNoCount:
      candidateStarters.filter((starter) => !text(starter.registrationNo)).length,
    candidateDailyDuplicateCarNoWithinRaceCount: candidateItems.filter(
      (item) =>
        countDuplicates(asArray(item.starters).map((starter) => starter.carNo)) > 0,
    ).length,
    candidateDailyDuplicateRegistrationNoWithinRaceCount:
      candidateItems.filter(
        (item) =>
          countDuplicates(
            asArray(item.starters).map((starter) => starter.registrationNo),
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
    && candidateDaily.candidateDailyBytesMatched
      ? "OK"
      : "FAIL";

  const hashFields = propertyNamesMatching(index, /hash/i);
  const digestFields = propertyNamesMatching(index, /digest|checksum/i);
  const generatedAtFields = propertyNamesMatching(index, /^generatedAt$/i);
  const updatedAtFields = propertyNamesMatching(index, /^updatedAt$/i);
  const bytesDelta = candidateDailyBytes - Number(targetEntry?.bytes ?? 0);
  const indexRefreshPolicy = {
    indexHasTargetDateBytes: Object.hasOwn(targetEntry ?? {}, "bytes"),
    indexHasTopLevelTotalBytes: Object.hasOwn(index, "totalBytes"),
    indexHasTargetDateHash:
      Object.keys(targetEntry ?? {}).some((key) => /hash/i.test(key)),
    indexHasTopLevelHash:
      Object.keys(index).some((key) => /hash/i.test(key)),
    indexHasDigestFields: digestFields.length > 0,
    indexHasGeneratedAt: generatedAtFields.length > 0,
    indexHasUpdatedAt: updatedAtFields.length > 0,
    discoveredHashFields: hashFields,
    discoveredDigestFields: digestFields,
    targetDateBytesBefore: targetEntry?.bytes ?? null,
    candidateDailyBytesAfter: candidateDailyBytes,
    bytesDelta,
    totalBytesBefore: index.totalBytes ?? null,
    totalBytesAfterPlanned:
      Number(index.totalBytes) + bytesDelta,
    fieldsThatMustChange: [
      "items[targetDate].bytes",
      "totalBytes",
    ],
    fieldsThatMustStaySame: [
      "schemaVersion",
      "generatedAt",
      "period",
      "dayCount",
      "raceCount",
      "settledRaceCount",
      "cancelledRaceCount",
      "items[targetDate].date",
      "items[targetDate].file",
      "items[targetDate].raceCount",
      "items[targetDate].settledRaceCount",
      "items[targetDate].cancelledRaceCount",
      "all non-target entries",
    ],
    indexRefreshRequired: bytesDelta !== 0,
    indexRefreshReason:
      "targetDate.bytes and top-level totalBytes depend on daily serialized byte size",
    dailyOnlyWriteAllowed: false,
    combinedDailyAndIndexWriteRequired: true,
  };
  indexRefreshPolicy.policyStatus =
    indexRefreshPolicy.indexHasTargetDateBytes
    && indexRefreshPolicy.indexHasTopLevelTotalBytes
    && !indexRefreshPolicy.indexHasTargetDateHash
    && !indexRefreshPolicy.indexHasTopLevelHash
    && !indexRefreshPolicy.indexHasDigestFields
      ? "READY_FOR_COMBINED_DAILY_AND_INDEX_WRITE_SAFETY_AUDIT"
      : "NEEDS_INDEX_SCHEMA_MAPPING";

  const indexCandidateBuild = buildCandidateIndex(index, candidateDailyBytes);
  const candidateIndexPayload = indexCandidateBuild.candidate;
  const candidateTargetEntry = indexCandidateBuild.targetAfter;
  const candidateLatest = latestIndexEntry(candidateIndexPayload);
  const targetChangedFields = changedEntryFields(
    indexCandidateBuild.targetBefore,
    candidateTargetEntry,
  );
  const rawTopLevelChangedFields = changedTopLevelFields(index, candidateIndexPayload);
  const topLevelChangedFields = rawTopLevelChangedFields.filter(
    (field) => field !== "items",
  );
  const otherEntriesUnchanged =
    asArray(index.items).every((item, itemIndex) =>
      item?.date === TARGET_DATE
        ? true
        : JSON.stringify(item)
          === JSON.stringify(candidateIndexPayload.items[itemIndex]),
    );
  const allowedTargetFields = new Set(["bytes"]);
  const allowedTopLevelFields = new Set(["totalBytes"]);
  const unexpectedChangedFieldNames = [
    ...targetChangedFields
      .filter((field) => !allowedTargetFields.has(field))
      .map((field) => `targetDate.${field}`),
    ...topLevelChangedFields
      .filter((field) => !allowedTopLevelFields.has(field))
      .map((field) => `topLevel.${field}`),
    ...(otherEntriesUnchanged ? [] : ["items.nonTargetEntries"]),
  ];
  const candidateIndex = {
    currentIndexHash,
    candidateIndexHash: hashPayload(candidateIndexPayload),
    candidateIndexBytesDelta: bytesDelta,
    candidateIndexSerializedBytesBefore: indexRead.bytes,
    candidateIndexSerializedBytesAfter: jsonBytes(candidateIndexPayload),
    candidateIndexTotalBytesBefore: index.totalBytes ?? null,
    candidateIndexTotalBytesAfter: candidateIndexPayload.totalBytes ?? null,
    candidateTargetDateBytesBefore: targetEntry?.bytes ?? null,
    candidateTargetDateBytesAfter: candidateTargetEntry?.bytes ?? null,
    targetDateEntryChangedFieldNames: targetChangedFields,
    topLevelChangedFieldNames: topLevelChangedFields,
    unchangedCriticalFieldNames: [
      "schemaVersion",
      "generatedAt",
      "period",
      "dayCount",
      "raceCount",
      "settledRaceCount",
      "cancelledRaceCount",
      "targetDate.date",
      "targetDate.file",
      "targetDate.raceCount",
      "targetDate.settledRaceCount",
      "targetDate.cancelledRaceCount",
      "nonTargetEntries",
    ],
    unexpectedChangedFieldNames,
    sourceCountBefore: asArray(index.items).length,
    sourceCountAfter: asArray(candidateIndexPayload.items).length,
    dayCountBefore: index.dayCount ?? null,
    dayCountAfter: candidateIndexPayload.dayCount ?? null,
    raceCountBefore: index.raceCount ?? null,
    raceCountAfter: candidateIndexPayload.raceCount ?? null,
    latestDateBefore: latest?.date ?? null,
    latestDateAfter: candidateLatest?.date ?? null,
    latestPathBefore: latest?.file ?? null,
    latestPathAfter: candidateLatest?.file ?? null,
    candidateIndexSchemaCompatibility:
      targetChangedFields.length === 1
      && targetChangedFields[0] === "bytes"
      && topLevelChangedFields.length === 1
      && topLevelChangedFields[0] === "totalBytes"
      && unexpectedChangedFieldNames.length === 0
        ? "compatible"
        : "incompatible",
  };
  candidateIndex.candidateIndexStatus =
    candidateIndex.candidateTargetDateBytesAfter === candidateDailyBytes
    && candidateIndex.candidateIndexTotalBytesAfter
      === Number(index.totalBytes) + bytesDelta
    && candidateIndex.sourceCountAfter === candidateIndex.sourceCountBefore
    && candidateIndex.dayCountAfter === candidateIndex.dayCountBefore
    && candidateIndex.raceCountAfter === candidateIndex.raceCountBefore
    && candidateIndex.latestDateAfter === candidateIndex.latestDateBefore
    && candidateIndex.latestPathAfter === candidateIndex.latestPathBefore
    && candidateIndex.candidateIndexSchemaCompatibility === "compatible"
      ? "OK"
      : "FAIL";

  const countReconciliation = {
    historyRaceCount: dailyItems.length,
    startersSourceRaceCount: sourceRaces.length,
    entriesSnapshotRaceCount: entriesRaces.length,
    candidateDailyRaceCount: candidateItems.length,
    currentHistoryStarterTotal:
      dailyItems.flatMap((item) => asArray(item.starters)).length,
    sourceStarterTotal: sourceStarters.length,
    entriesStarterTotal: entriesStarters.length,
    candidateDailyStarterTotal: candidateStarters.length,
    currentTargetDateBytes: dailyRead.bytes,
    candidateTargetDateBytes: candidateDailyBytes,
    bytesDelta,
    indexTargetDateBytesBefore: targetEntry?.bytes ?? null,
    indexTargetDateBytesAfterPlanned: candidateTargetEntry?.bytes ?? null,
    indexTotalBytesBefore: index.totalBytes ?? null,
    indexTotalBytesAfterPlanned: candidateIndexPayload.totalBytes ?? null,
    sourceCountBefore: asArray(index.items).length,
    sourceCountAfterPlanned: asArray(candidateIndexPayload.items).length,
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
    && countReconciliation.currentTargetDateBytes
      === countReconciliation.indexTargetDateBytesBefore
    && countReconciliation.candidateTargetDateBytes
      === countReconciliation.indexTargetDateBytesAfterPlanned
    && countReconciliation.indexTotalBytesAfterPlanned
      === countReconciliation.indexTotalBytesBefore + bytesDelta
    && countReconciliation.sourceCountBefore
      === countReconciliation.sourceCountAfterPlanned
    && countReconciliation.dayCountBefore
      === countReconciliation.dayCountAfterPlanned
    && countReconciliation.raceCountBefore
      === countReconciliation.raceCountAfterPlanned
      ? "OK"
      : "FAIL";

  const afterHashes = Object.fromEntries(await Promise.all(
    watchedFiles.map(async (file) => {
      const read = await readJson(file);
      return [file, read.payload ? hashPayload(read.payload) : null];
    }),
  ));
  const changedDuringAudit = watchedFiles.filter(
    (file) => beforeHashes[file] !== afterHashes[file],
  );
  const guard = protectedModificationGuard();
  const dataReady =
    currentState.currentStateStatus === "OK"
    && candidateDaily.candidateDailyStatus === "OK"
    && indexRefreshPolicy.policyStatus
      === "READY_FOR_COMBINED_DAILY_AND_INDEX_WRITE_SAFETY_AUDIT"
    && candidateIndex.candidateIndexStatus === "OK"
    && countReconciliation.countReconciliationStatus === "OK"
    && changedDuringAudit.length === 0;
  const writeAllowedLater = dataReady && guard.guardStatus === "pass";
  const combinedWritePrePlan = {
    writeModePlanned:
      "replace-history-daily-and-refresh-history-index-bytes-with-hash-preconditions",
    allowedWriteFilesPlanned: [HISTORY_DAILY_PATH, HISTORY_INDEX_PATH],
    prohibitedWriteFilesPlanned: [
      "public/data/analytics/kurari-ex/source/**",
      "public/data/races/**",
      "public/data/reviews/**",
      "private-input/**",
      "src/**",
      "package.json",
      "existing scripts",
    ],
    requiredCurrentHistoryDailyHash: EXPECTED_CURRENT_DAILY_HASH,
    requiredCandidateDailyHash: EXPECTED_CANDIDATE_DAILY_HASH,
    requiredCurrentIndexHash: currentIndexHash,
    requiredCandidateIndexHash: candidateIndex.candidateIndexHash,
    requiredCurrentTargetDateBytes: EXPECTED_CURRENT_DAILY_BYTES,
    requiredCandidateTargetDateBytes: EXPECTED_CANDIDATE_DAILY_BYTES,
    requiredBytesDelta: EXPECTED_CANDIDATE_DAILY_BYTES
      - EXPECTED_CURRENT_DAILY_BYTES,
    dailyWriteRequired: true,
    indexWriteRequired: true,
    writeOrderPolicy: "write daily and index in one guarded operation",
    rollbackPolicy: "if either write cannot be validated, stop before writing",
    noOpPolicy: {
      bothCurrent: "perform guarded combined write",
      bothCandidate: "no-op success",
      dailyCandidateIndexCurrent: "require index refresh writer",
      dailyCurrentIndexCandidate: "block as inconsistent",
    },
    writeAllowedLater,
    prePlanStatus: writeAllowedLater
      ? "READY_FOR_COMBINED_DAILY_AND_INDEX_WRITE_SAFETY_AUDIT"
      : dataReady
        ? "BLOCKED"
        : "NEEDS_HASH_LOCK",
  };

  const blockReasonCounts = Object.fromEntries(
    BLOCK_REASON_KEYS.map((key) => [key, 0]),
  );
  if (!dailyRead.exists) increment(blockReasonCounts, "HISTORY_DAILY_MISSING");
  if (dailyRead.parseStatus === "failed") {
    increment(blockReasonCounts, "HISTORY_DAILY_PARSE_FAILED");
  }
  if (!currentState.currentHistoryDailyHashMatched) {
    increment(blockReasonCounts, "HISTORY_DAILY_HASH_MISMATCH");
  }
  if (!currentState.currentHistoryDailyBytesMatched) {
    increment(blockReasonCounts, "HISTORY_DAILY_BYTES_MISMATCH");
  }
  if (!indexRead.exists) increment(blockReasonCounts, "HISTORY_INDEX_MISSING");
  if (indexRead.parseStatus === "failed") {
    increment(blockReasonCounts, "HISTORY_INDEX_PARSE_FAILED");
  }
  if (!currentState.targetDateIndexEntryExists) {
    increment(blockReasonCounts, "HISTORY_INDEX_TARGET_DATE_MISSING");
  }
  if (!indexRefreshPolicy.indexHasTargetDateBytes) {
    increment(blockReasonCounts, "HISTORY_INDEX_TARGET_BYTES_MISSING");
  }
  if (!indexRefreshPolicy.indexHasTopLevelTotalBytes) {
    increment(blockReasonCounts, "HISTORY_INDEX_TOTAL_BYTES_MISSING");
  }
  if (!currentState.targetDateIndexBytesMatchedCurrentDaily) {
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
  if (join.summary.unmatchedHistoryRaceCount > 0) {
    increment(
      blockReasonCounts,
      "EXACT_JOIN_MISSING_RACE",
      join.summary.unmatchedHistoryRaceCount,
    );
  }
  if (join.summary.unmatchedStartersRaceCount > 0) {
    increment(
      blockReasonCounts,
      "EXACT_JOIN_EXTRA_SOURCE_RACE",
      join.summary.unmatchedStartersRaceCount,
    );
  }
  if (join.summary.duplicateJoinKeyCount > 0) {
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
  if (candidateIndex.unexpectedChangedFieldNames.length > 0) {
    increment(
      blockReasonCounts,
      "CANDIDATE_INDEX_UNEXPECTED_FIELD_CHANGE",
      candidateIndex.unexpectedChangedFieldNames.length,
    );
  }
  if (countReconciliation.countReconciliationStatus !== "OK") {
    increment(blockReasonCounts, "CANDIDATE_INDEX_COUNT_MISMATCH");
  }
  for (const [field, reason] of [
    ["nonStarterFieldChangedCount", "NON_STARTER_FIELD_CHANGED"],
    ["resultChangedCount", "RESULT_FIELD_CHANGED"],
    ["predictionChangedCount", "PREDICTION_FIELD_CHANGED"],
    ["lineupChangedCount", "LINEUP_FIELD_CHANGED"],
    ["weatherChangedCount", "WEATHER_FIELD_CHANGED"],
  ]) {
    if (candidateDaily[field] > 0) {
      increment(blockReasonCounts, reason, candidateDaily[field]);
    }
  }
  if (changedDuringAudit.length > 0) {
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
  if (guard.stagedFiles.length > 0) {
    increment(blockReasonCounts, "UNEXPECTED_FILE_STAGED", guard.stagedFiles.length);
  }

  let readinessStatus =
    "READY_FOR_COMBINED_DAILY_AND_INDEX_WRITE_SAFETY_AUDIT";
  if (!currentState.currentHistoryDailyHashMatched) {
    readinessStatus = "NEEDS_HASH_LOCK";
  } else if (candidateDaily.candidateDailyStatus !== "OK") {
    readinessStatus = "NEEDS_DAILY_CANDIDATE_FIX";
  } else if (indexRefreshPolicy.policyStatus === "NEEDS_INDEX_SCHEMA_MAPPING") {
    readinessStatus = "NEEDS_INDEX_SCHEMA_MAPPING";
  } else if (candidateIndex.candidateIndexStatus !== "OK") {
    readinessStatus = "NEEDS_INDEX_CANDIDATE_FIX";
  } else if (countReconciliation.countReconciliationStatus !== "OK") {
    readinessStatus = "NEEDS_COUNT_RECONCILIATION";
  } else if (!writeAllowedLater) {
    readinessStatus = "BLOCKED";
  }
  const readiness = { status: readinessStatus };
  const summary = {
    targetDate: TARGET_DATE,
    currentHistoryDailyHash: currentDailyHash,
    expectedCurrentHistoryDailyHash: EXPECTED_CURRENT_DAILY_HASH,
    currentHistoryDailyHashMatched:
      currentState.currentHistoryDailyHashMatched,
    currentHistoryDailyBytes: dailyRead.bytes,
    expectedCurrentHistoryDailyBytes: EXPECTED_CURRENT_DAILY_BYTES,
    currentHistoryDailyBytesMatched:
      currentState.currentHistoryDailyBytesMatched,
    candidateDailyHash,
    expectedCandidateDailyHash: EXPECTED_CANDIDATE_DAILY_HASH,
    candidateDailyHashMatched: candidateDaily.candidateDailyHashMatched,
    candidateDailyBytes,
    expectedCandidateDailyBytes: EXPECTED_CANDIDATE_DAILY_BYTES,
    candidateDailyBytesMatched: candidateDaily.candidateDailyBytesMatched,
    bytesDelta,
    currentIndexHash,
    candidateIndexHash: candidateIndex.candidateIndexHash,
    targetDateIndexBytesBefore: targetEntry?.bytes ?? null,
    targetDateIndexBytesAfterPlanned: candidateTargetEntry?.bytes ?? null,
    indexTotalBytesBefore: index.totalBytes ?? null,
    indexTotalBytesAfterPlanned: candidateIndexPayload.totalBytes ?? null,
    indexRefreshRequired: indexRefreshPolicy.indexRefreshRequired,
    dailyOnlyWriteAllowed: indexRefreshPolicy.dailyOnlyWriteAllowed,
    combinedDailyAndIndexWriteRequired:
      indexRefreshPolicy.combinedDailyAndIndexWriteRequired,
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
    writePerformed: false,
    historyDailyModified: changedDuringAudit.includes(HISTORY_DAILY_PATH),
    historyIndexModified: changedDuringAudit.includes(HISTORY_INDEX_PATH),
    indexRefreshPolicyAuditReadiness: readinessStatus,
    blockReasonCounts: Object.fromEntries(
      Object.entries(blockReasonCounts).filter(([, count]) => count > 0),
    ),
  };
  return {
    summary,
    currentState,
    candidateDaily,
    indexRefreshPolicy,
    candidateIndex,
    combinedWritePrePlan,
    countReconciliation,
    protectedModificationGuard: guard,
    nextActionPlan: nextActionPlan(writeAllowedLater),
    jsonSummary: {
      ...summary,
      indexRefreshPolicyAuditReadiness: readiness,
      allBlockReasonCounts: blockReasonCounts,
    },
  };
}

async function main() {
  const result = await auditIndexRefreshPolicy();
  printSection("summary", result.summary);
  printSection("currentState", result.currentState);
  printSection("candidateDaily", result.candidateDaily);
  printSection("indexRefreshPolicy", result.indexRefreshPolicy);
  printSection("candidateIndex", result.candidateIndex);
  printSection("combinedWritePrePlan", result.combinedWritePrePlan);
  printSection("countReconciliation", result.countReconciliation);
  printSection("protectedModificationGuard", result.protectedModificationGuard);
  printSection("nextActionPlan", result.nextActionPlan);
  printSection("jsonSummary", result.jsonSummary);
  if (
    result.summary.indexRefreshPolicyAuditReadiness
      !== "READY_FOR_COMBINED_DAILY_AND_INDEX_WRITE_SAFETY_AUDIT"
  ) {
    process.exitCode = 1;
  }
}

const isMain =
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  main().catch((error) => {
    console.error("[kurari-ex history starters bridge index refresh policy] failed");
    console.error(error);
    process.exitCode = 1;
  });
}
