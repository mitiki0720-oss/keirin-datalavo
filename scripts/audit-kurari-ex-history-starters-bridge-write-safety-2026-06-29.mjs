import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { auditSameDateHistoryStartersBridgeDryRun } from "./audit-kurari-ex-same-date-history-starters-bridge-dry-run-2026-06-29.mjs";

const ROOT = process.cwd();
const TARGET_DATE = "2026-06-29";
const THIS_SCRIPT =
  "scripts/audit-kurari-ex-history-starters-bridge-write-safety-2026-06-29.mjs";
const HISTORY_INDEX_PATH =
  "public/data/analytics/kurari-ex/history/index.generated.json";
const HISTORY_DAILY_PATH =
  "public/data/analytics/kurari-ex/history/daily/2026-06/2026-06-29.generated.json";
const STARTERS_SOURCE_PATH =
  "public/data/analytics/kurari-ex/source/starters/2026-06-29/today-registration-starters.generated.json";
const ENTRIES_SNAPSHOT_PATH =
  "public/data/races/entries-history/2026-06-29/keirin-jp-entries.generated.json";
const EXPECTED_CURRENT_HISTORY_DAILY_HASH =
  "sha256:96a4d2399cf7f57f777170648c9ab8da2f87f20b5bdcc3ed680f2ca6b67d6e2f";
const EXPECTED_CANDIDATE_PAYLOAD_HASH =
  "sha256:21b9c6a425c6207c2995d434486957d264f83b3f8ea2b336ec92749376652c46";
const KNOWN_PREEXISTING_REVIEW_PATHS = [
  "public/data/reviews/index.json",
  "public/data/reviews/2026-06-28/",
  "public/data/reviews/2026-06-29/",
  "public/data/reviews/2026-06-30/",
];

const BLOCK_REASONS = [
  "HISTORY_INDEX_MISSING",
  "HISTORY_INDEX_PARSE_FAILED",
  "HISTORY_INDEX_TARGET_DATE_MISSING",
  "HISTORY_DAILY_MISSING",
  "HISTORY_DAILY_PARSE_FAILED",
  "HISTORY_DAILY_HASH_MISMATCH",
  "CURRENT_HISTORY_HASH_UNAVAILABLE",
  "CURRENT_HISTORY_HASH_UNSTABLE",
  "HISTORY_DAILY_ALREADY_HAS_STARTERS",
  "HISTORY_DAILY_NO_STARTERS_NOT_FOUND",
  "STARTERS_SOURCE_MISSING",
  "STARTERS_SOURCE_PARSE_FAILED",
  "STARTERS_SOURCE_RACE_COUNT_MISMATCH",
  "STARTERS_SOURCE_REGISTRATION_NO_MISSING",
  "STARTERS_SOURCE_DUPLICATE_JOIN_KEY",
  "ENTRIES_SNAPSHOT_MISSING",
  "ENTRIES_SNAPSHOT_PARSE_FAILED",
  "ENTRIES_SNAPSHOT_RACE_COUNT_MISMATCH",
  "EXACT_JOIN_MISSING_RACE",
  "EXACT_JOIN_EXTRA_SOURCE_RACE",
  "AMBIGUOUS_JOIN_KEY",
  "CROSS_DATE_JOIN_FOUND",
  "CROSS_VENUE_JOIN_FOUND",
  "CANDIDATE_SCHEMA_INCOMPATIBLE",
  "CANDIDATE_PAYLOAD_HASH_MISMATCH_DRY_RUN",
  "CANDIDATE_HASH_UNSTABLE",
  "CANDIDATE_COUNT_MISMATCH",
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
const countDuplicates = (values) => {
  const seen = new Set();
  let duplicates = 0;
  for (const value of values.filter(Boolean)) {
    if (seen.has(value)) duplicates += 1;
    seen.add(value);
  }
  return duplicates;
};
const increment = (counts, reason, by = 1) => {
  counts[reason] = (counts[reason] ?? 0) + by;
};

async function readJson(file) {
  try {
    const payload = JSON.parse(await readFile(path.resolve(ROOT, file), "utf8"));
    return { exists: true, parseStatus: "ok", payload };
  } catch (error) {
    return {
      exists: error?.code !== "ENOENT",
      parseStatus: error?.code === "ENOENT" ? "missing" : "failed",
      payload: null,
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
      [...grouped].filter(([, rows]) => rows.length === 1)
        .map(([key, rows]) => [key, rows[0]]),
    ),
    duplicateCount: [...grouped.values()]
      .filter((rows) => rows.length > 1).length,
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
  const counts = Object.fromEntries(types.map((type) => [type, 0]));
  const used = new Set();
  const matches = historyItems.map((historyRace) => {
    for (const type of types) {
      const sourceRace = lookups[type].values.get(joinKey(historyRace, type));
      if (!sourceRace) continue;
      counts[type] += 1;
      used.add(sourceRace);
      return { historyRace, sourceRace, matchedBy: type };
    }
    return { historyRace, sourceRace: null, matchedBy: null };
  });
  const unmatchedHistoryRaceCount =
    matches.filter((match) => !match.sourceRace).length;
  const unmatchedStartersRaceCount =
    sourceRaces.filter((race) => !used.has(race)).length;
  const ambiguousJoinCount = types.reduce(
    (total, type) => total + lookups[type].duplicateCount,
    0,
  );
  const crossDateJoinFound = matches.some(
    ({ historyRace, sourceRace }) =>
      sourceRace && historyRace.date !== sourceRace.date,
  );
  const crossVenueJoinFound = matches.some(
    ({ historyRace, sourceRace }) =>
      sourceRace && text(historyRace.venueName) !== text(sourceRace.venueName),
  );
  return {
    matches,
    summary: {
      targetDate: TARGET_DATE,
      historyRaceCount: historyItems.length,
      startersSourceRaceCount: sourceRaces.length,
      raceKeyDirectMatchedCount: counts.raceKey,
      dateVenueKeyRaceNumberMatchedCount: counts.dateVenueKeyRaceNumber,
      dateVenueNameRaceNumberMatchedCount: counts.dateVenueNameRaceNumber,
      unmatchedHistoryRaceCount,
      unmatchedStartersRaceCount,
      matchedRaceCount: matches.length - unmatchedHistoryRaceCount,
      bridgeEligibleRaceCount: matches.filter(
        ({ sourceRace }) =>
          asArray(sourceRace?.starters).length > 0
          && asArray(sourceRace?.starters).every(
            (starter) =>
              text(starter.carNo)
              && text(starter.name)
              && text(starter.registrationNo),
          ),
      ).length,
      bridgeBlockedRaceCount: unmatchedHistoryRaceCount,
      totalStarterCountToBridge: matches.reduce(
        (total, { sourceRace }) => total + asArray(sourceRace?.starters).length,
        0,
      ),
      allMatchedByExactKey:
        unmatchedHistoryRaceCount === 0
        && unmatchedStartersRaceCount === 0
        && ambiguousJoinCount === 0,
      joinMethodUsed: counts.dateVenueNameRaceNumber > 0
        ? "dateVenueNameRaceNumber"
        : counts.dateVenueKeyRaceNumber > 0
          ? "dateVenueKeyRaceNumber"
          : "raceKey",
      joinMethodReason: counts.raceKey === 0
        ? "starters source does not store raceKey; exact same-date venueName and raceNumber used"
        : "direct raceKey exact match",
      fuzzyMatchingPerformed: false,
      fakeCompletionPerformed: false,
      predictionUsedAsStarterSource: false,
      resultUsedAsStarterSource: false,
      lineupUsedAsStarterSource: false,
      registrationNoGenerated: false,
      crossDateJoinFound,
      crossVenueJoinFound,
      ambiguousJoinFound: ambiguousJoinCount > 0,
      exactJoinStatus:
        unmatchedHistoryRaceCount === 0
        && unmatchedStartersRaceCount === 0
        && ambiguousJoinCount === 0
        && !crossDateJoinFound
        && !crossVenueJoinFound
          ? "OK"
          : "FAIL",
    },
  };
}

function buildCandidate(history, join) {
  const byHistoryRace = new Map(
    join.matches.map((match) => [match.historyRace, match.sourceRace]),
  );
  const candidate = clone(history);
  candidate.items = asArray(history.items).map((item) => {
    const sourceRace = byHistoryRace.get(item);
    if (!sourceRace) return clone(item);
    const starters = clone(sourceRace.starters);
    return {
      ...clone(item),
      starterCount: starters.length,
      starters,
      quality: {
        ...clone(item.quality),
        starterParsed: true,
        starterSource: "same-date-exact-starters-source",
        warnings: asArray(item?.quality?.warnings).filter(
          (warning) =>
            !/starter identity intentionally not generated/i.test(text(warning)),
        ),
      },
    };
  });
  return candidate;
}

function withoutAllowedStarterChanges(item) {
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

function keySet(value) {
  return Object.keys(value ?? {}).sort();
}

function schemaCompatibility(history, candidate) {
  const historyItems = asArray(history.items);
  const candidateItems = asArray(candidate.items);
  const topLevelKeysPreserved =
    JSON.stringify(keySet(history)) === JSON.stringify(keySet(candidate));
  const itemShapeCompatible =
    historyItems.length === candidateItems.length
    && historyItems.every(
      (item, index) =>
        JSON.stringify(keySet(item)) === JSON.stringify(keySet(candidateItems[index])),
    );
  const startersShapeCompatible = candidateItems.every(
    (item) =>
      asArray(item.starters).every(
        (starter) =>
          text(starter.carNo)
          && text(starter.name)
          && text(starter.registrationNo),
      ),
  );
  const qualityShapeCompatible = candidateItems.every(
    (item) =>
      item?.quality?.starterParsed === true
      && item?.quality?.starterSource === "same-date-exact-starters-source"
      && Array.isArray(item?.quality?.warnings),
  );
  const countFieldsCompatible = candidateItems.every(
    (item) => item.starterCount === item.starters.length,
  );
  const compatible =
    topLevelKeysPreserved
    && itemShapeCompatible
    && startersShapeCompatible
    && qualityShapeCompatible
    && countFieldsCompatible;
  return {
    topLevelKeysPreserved,
    itemShapeCompatible,
    startersShapeCompatible,
    qualityShapeCompatible,
    countFieldsCompatible,
    noUnknownCriticalFields: true,
    noMissingCriticalFields: compatible,
    schemaCompatibility: compatible ? "compatible" : "incompatible",
    schemaWarnings: compatible ? [] : ["candidate shape differs from locked history schema"],
  };
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
  const knownReview = (file) => KNOWN_PREEXISTING_REVIEW_PATHS.some(
    (known) => known.endsWith("/") ? file.startsWith(known) : file === known,
  );
  const allowed = (file) => file === THIS_SCRIPT || knownReview(file);
  const unexpected = files.filter((file) => !allowed(file));
  const existingScriptModified = files.some(
    (file) => file.startsWith("scripts/") && file !== THIS_SCRIPT,
  );
  const result = {
    allowedNewScriptOnly: files.includes(THIS_SCRIPT) && unexpected.length === 0,
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
    existingScriptModified,
    unexpectedModifiedFiles: unexpected.filter((file) =>
      !lines.some((line) => line.startsWith("??") && statusPath(line) === file)),
    unexpectedUntrackedFiles: unexpected.filter((file) =>
      lines.some((line) => line.startsWith("??") && statusPath(line) === file)),
    stagedFiles,
  };
  result.guardStatus =
    result.allowedNewScriptOnly
    && !Object.entries(result).some(
      ([key, value]) =>
        key.endsWith("Modified") && key !== "reviewsModified" && value === true,
    )
    && !result.reviewsTouchedByThisStep
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

function nextActionPlan(writeAllowedLater) {
  const actions = [
    "history starters bridge writer implementation",
    "history starters bridge actual write",
    "history starters bridge checker",
    "final history/index/daily/source consistency audit",
    "UI/API consumption check",
    "6/25〜6/28 history追加は別工程",
  ];
  return actions.map((action, index) => ({
    stepId: index + 1,
    action,
    prerequisiteStatus: index === 0
      ? (writeAllowedLater ? "write safety audit passed" : "blocked")
      : "previous step passed",
    allowedFiles: index === 1 ? [HISTORY_DAILY_PATH] : ["separate-step scoped files"],
    prohibitedFiles: [HISTORY_INDEX_PATH, STARTERS_SOURCE_PATH],
    readiness: index === 0 && writeAllowedLater ? "ready" : "future",
    notes: index === 1
      ? "replace starters only under current and candidate hash locks"
      : "not performed by this audit",
  }));
}

export async function auditHistoryStartersBridgeWriteSafety() {
  const watched = [
    HISTORY_INDEX_PATH,
    HISTORY_DAILY_PATH,
    STARTERS_SOURCE_PATH,
    ENTRIES_SNAPSHOT_PATH,
  ];
  const before = Object.fromEntries(await Promise.all(
    watched.map(async (file) => {
      const read = await readJson(file);
      return [file, read.payload ? hashPayload(read.payload) : null];
    }),
  ));
  const base = await auditSameDateHistoryStartersBridgeDryRun();
  const [historyRead, sourceRead, entriesRead] = await Promise.all([
    readJson(HISTORY_DAILY_PATH),
    readJson(STARTERS_SOURCE_PATH),
    readJson(ENTRIES_SNAPSHOT_PATH),
  ]);
  const history = historyRead.payload ?? {};
  const source = sourceRead.payload ?? {};
  const entries = entriesRead.payload ?? {};
  const historyItems = asArray(history.items);
  const sourceRaces = asArray(source.races);
  const entryRaces = asArray(entries.races);
  const currentHash = historyRead.payload ? hashPayload(history) : null;
  const join = exactJoin(historyItems, sourceRaces);
  const candidate = buildCandidate(history, join);
  const candidateAgain = buildCandidate(history, join);
  const candidateHash = hashPayload(candidate);
  const candidateHashStable = candidateHash === hashPayload(candidateAgain);
  const schema = schemaCompatibility(history, candidate);
  const candidateItems = asArray(candidate.items);
  const allCandidateStarters = candidateItems.flatMap((item) => item.starters);
  const nonStarterFieldChangedCount = historyItems.filter(
    (item, index) =>
      JSON.stringify(withoutAllowedStarterChanges(item))
      !== JSON.stringify(withoutAllowedStarterChanges(candidateItems[index])),
  ).length;
  const fieldChangedCount = (field) => historyItems.filter(
    (item, index) =>
      JSON.stringify(item[field]) !== JSON.stringify(candidateItems[index]?.[field]),
  ).length;
  const warningsResolvedCount = historyItems.reduce(
    (total, item, index) =>
      total + Math.max(
        0,
        asArray(item?.quality?.warnings).length
          - asArray(candidateItems[index]?.quality?.warnings).length,
      ),
    0,
  );
  const bridgeWritePreview = {
    changedRaceItems: historyItems.filter(
      (item, index) => JSON.stringify(item) !== JSON.stringify(candidateItems[index]),
    ).length,
    unchangedRaceItems: historyItems.filter(
      (item, index) => JSON.stringify(item) === JSON.stringify(candidateItems[index]),
    ).length,
    startersFilledRaceCount: candidateItems.filter(
      (item, index) =>
        asArray(historyItems[index]?.starters).length === 0
        && asArray(item.starters).length > 0,
    ).length,
    startersBeforeTotal: historyItems.flatMap((item) => asArray(item.starters)).length,
    startersAfterTotal: allCandidateStarters.length,
    starterParsedFalseToTrueCount: candidateItems.filter(
      (item, index) =>
        historyItems[index]?.quality?.starterParsed === false
        && item?.quality?.starterParsed === true,
    ).length,
    warningsResolvedCount,
    topLevelCountChanges: history.raceCount === candidate.raceCount ? 0 : 1,
    resultChangedCount: fieldChangedCount("result"),
    predictionChangedCount: fieldChangedCount("prediction"),
    lineupChangedCount: fieldChangedCount("lineup"),
    weatherChangedCount: fieldChangedCount("weather"),
    nonStarterFieldChangedCount,
    estimatedJsonSizeAfterWrite: Buffer.byteLength(
      `${JSON.stringify(candidate, null, 2)}\n`,
      "utf8",
    ),
    diffPreview: candidateItems.slice(0, 5).map((item, index) => ({
      raceKey: item.raceKey,
      startersBefore: asArray(historyItems[index]?.starters).length,
      startersAfter: asArray(item.starters).length,
      starterParsedBefore: historyItems[index]?.quality?.starterParsed,
      starterParsedAfter: item?.quality?.starterParsed,
    })),
  };
  const guard = protectedModificationGuard();
  const after = Object.fromEntries(await Promise.all(
    watched.map(async (file) => {
      const read = await readJson(file);
      return [file, read.payload ? hashPayload(read.payload) : null];
    }),
  ));
  const changedDuringAudit = watched.filter((file) => before[file] !== after[file]);
  const currentHistoryDailyPrecondition = {
    historyDailyPath: HISTORY_DAILY_PATH,
    exists: historyRead.exists,
    parseStatus: historyRead.parseStatus,
    ...base.historyDailyStatus,
    currentHistoryDailyHash: currentHash,
    expectedCurrentHistoryDailyHash: EXPECTED_CURRENT_HISTORY_DAILY_HASH,
    currentHistoryDailyHashMatched:
      currentHash === EXPECTED_CURRENT_HISTORY_DAILY_HASH,
    currentHistoryDailyStatus:
      base.historyDailyStatus.status === "OK"
      && currentHash === EXPECTED_CURRENT_HISTORY_DAILY_HASH
        ? "OK"
        : "FAIL",
  };
  const startersSourcePrecondition = {
    sourcePath: STARTERS_SOURCE_PATH,
    ...base.startersSourceStatus,
    duplicateJoinKeyCount: uniqueLookup(
      sourceRaces,
      "dateVenueNameRaceNumber",
    ).duplicateCount,
    sourceStatus: base.startersSourceStatus.sourceStatus,
  };
  const entriesSnapshotPrecondition = {
    entriesPath: ENTRIES_SNAPSHOT_PATH,
    ...base.entriesSnapshotStatus,
    duplicateJoinKeyCount: uniqueLookup(
      entryRaces,
      "dateVenueNameRaceNumber",
    ).duplicateCount,
    entriesStatus: base.entriesSnapshotStatus.status,
  };
  const candidateBridgePayload = {
    candidateRaceCount: candidateItems.length,
    candidateVenueCount: new Set(candidateItems.map((item) => item.venueName)).size,
    candidateStartersNonEmptyRaceCount:
      candidateItems.filter((item) => asArray(item.starters).length > 0).length,
    candidateStartersEmptyRaceCount:
      candidateItems.filter((item) => asArray(item.starters).length === 0).length,
    candidateStarterTotalCount: allCandidateStarters.length,
    candidateStarterParsedTrueCount:
      candidateItems.filter((item) => item?.quality?.starterParsed === true).length,
    candidateStarterParsedFalseCount:
      candidateItems.filter((item) => item?.quality?.starterParsed === false).length,
    candidateMissingRegistrationNoCount:
      allCandidateStarters.filter((starter) => !text(starter.registrationNo)).length,
    candidateDuplicateRegistrationNoWithinRaceCount: candidateItems.filter(
      (item) =>
        countDuplicates(item.starters.map((starter) => starter.registrationNo)) > 0,
    ).length,
    candidateDuplicateCarNoWithinRaceCount: candidateItems.filter(
      (item) => countDuplicates(item.starters.map((starter) => starter.carNo)) > 0,
    ).length,
    candidateSchemaCompatibility: schema.schemaCompatibility,
    originalHistoryHash: currentHash,
    candidatePayloadHash: candidateHash,
    expectedCandidatePayloadHash: EXPECTED_CANDIDATE_PAYLOAD_HASH,
    candidatePayloadHashMatched: candidateHash === EXPECTED_CANDIDATE_PAYLOAD_HASH,
    candidateHashStable,
    writePerformed: false,
    historyDailyModified: changedDuringAudit.includes(HISTORY_DAILY_PATH),
  };
  const countReconciliation = {
    historyRaceCount: historyItems.length,
    startersSourceRaceCount: sourceRaces.length,
    entriesSnapshotRaceCount: entryRaces.length,
    candidateRaceCount: candidateItems.length,
    historyStarterTotalBefore:
      historyItems.flatMap((item) => asArray(item.starters)).length,
    sourceStarterTotal:
      sourceRaces.flatMap((race) => asArray(race.starters)).length,
    entriesStarterTotal:
      entryRaces.flatMap((race) => asArray(race.entries)).length,
    candidateStarterTotal: allCandidateStarters.length,
    startersEmptyRaceCountBefore:
      historyItems.filter((item) => asArray(item.starters).length === 0).length,
    candidateStartersEmptyRaceCount:
      candidateBridgePayload.candidateStartersEmptyRaceCount,
    candidateStartersNonEmptyRaceCount:
      candidateBridgePayload.candidateStartersNonEmptyRaceCount,
    starterParsedFalseBefore:
      historyItems.filter((item) => item?.quality?.starterParsed === false).length,
    candidateStarterParsedTrueCount:
      candidateBridgePayload.candidateStarterParsedTrueCount,
    candidateMissingRegistrationNoCount:
      candidateBridgePayload.candidateMissingRegistrationNoCount,
  };
  countReconciliation.countReconciliationStatus =
    new Set([
      countReconciliation.historyRaceCount,
      countReconciliation.startersSourceRaceCount,
      countReconciliation.entriesSnapshotRaceCount,
      countReconciliation.candidateRaceCount,
    ]).size === 1
    && new Set([
      countReconciliation.sourceStarterTotal,
      countReconciliation.entriesStarterTotal,
      countReconciliation.candidateStarterTotal,
    ]).size === 1
      ? "OK"
      : "FAIL";
  const dataReady =
    currentHistoryDailyPrecondition.currentHistoryDailyStatus === "OK"
    && base.historyIndexStatus.indexStatus === "OK"
    && startersSourcePrecondition.sourceStatus === "OK"
    && entriesSnapshotPrecondition.entriesStatus === "OK"
    && join.summary.exactJoinStatus === "OK"
    && schema.schemaCompatibility === "compatible"
    && countReconciliation.countReconciliationStatus === "OK"
    && candidateBridgePayload.candidatePayloadHashMatched
    && candidateHashStable
    && nonStarterFieldChangedCount === 0
    && changedDuringAudit.length === 0;
  const writeAllowedLater = dataReady && guard.guardStatus === "pass";
  const writePolicy = {
    targetFile: HISTORY_DAILY_PATH,
    fileExists: historyRead.exists,
    writeModePlanned:
      "replace-history-daily-starters-only-with-current-hash-precondition",
    overwritePolicy:
      "allow-only-if-current-history-hash-unchanged-and-candidate-hash-matched",
    currentHistoryDailyHashBefore: currentHash,
    expectedCurrentHistoryDailyHash: EXPECTED_CURRENT_HISTORY_DAILY_HASH,
    currentHistoryDailyHashMatched:
      currentHash === EXPECTED_CURRENT_HISTORY_DAILY_HASH,
    candidatePayloadHash: candidateHash,
    expectedCandidatePayloadHash: EXPECTED_CANDIDATE_PAYLOAD_HASH,
    candidatePayloadHashMatched:
      candidateHash === EXPECTED_CANDIDATE_PAYLOAD_HASH,
    joinPreconditionMatched: join.summary.exactJoinStatus === "OK",
    sourcePreconditionMatched: startersSourcePrecondition.sourceStatus === "OK",
    writeAllowedLater,
    writePerformed: false,
    historyDailyWritePerformed: false,
  };
  const blockReasonCounts = Object.fromEntries(
    BLOCK_REASONS.map((reason) => [reason, 0]),
  );
  if (!currentHash) increment(blockReasonCounts, "CURRENT_HISTORY_HASH_UNAVAILABLE");
  if (currentHash && currentHash !== EXPECTED_CURRENT_HISTORY_DAILY_HASH) {
    increment(blockReasonCounts, "HISTORY_DAILY_HASH_MISMATCH");
  }
  if (!candidateBridgePayload.candidatePayloadHashMatched) {
    increment(blockReasonCounts, "CANDIDATE_PAYLOAD_HASH_MISMATCH_DRY_RUN");
  }
  if (!candidateHashStable) increment(blockReasonCounts, "CANDIDATE_HASH_UNSTABLE");
  if (join.summary.exactJoinStatus !== "OK") {
    increment(blockReasonCounts, "EXACT_JOIN_MISSING_RACE");
  }
  if (schema.schemaCompatibility !== "compatible") {
    increment(blockReasonCounts, "CANDIDATE_SCHEMA_INCOMPATIBLE");
  }
  if (countReconciliation.countReconciliationStatus !== "OK") {
    increment(blockReasonCounts, "CANDIDATE_COUNT_MISMATCH");
  }
  for (const [field, reason] of [
    ["nonStarterFieldChangedCount", "NON_STARTER_FIELD_CHANGED"],
    ["resultChangedCount", "RESULT_FIELD_CHANGED"],
    ["predictionChangedCount", "PREDICTION_FIELD_CHANGED"],
    ["lineupChangedCount", "LINEUP_FIELD_CHANGED"],
    ["weatherChangedCount", "WEATHER_FIELD_CHANGED"],
  ]) {
    if (bridgeWritePreview[field] > 0) {
      increment(blockReasonCounts, reason, bridgeWritePreview[field]);
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
  let status = "READY_FOR_HISTORY_STARTERS_BRIDGE_WRITER_IMPLEMENTATION";
  if (!currentHash) status = "NEEDS_CURRENT_HISTORY_HASH_LOCK";
  else if (base.historyDailyStatus.status !== "OK") status = "NEEDS_HISTORY_DAILY_FIX";
  else if (base.historyIndexStatus.indexStatus !== "OK") status = "NEEDS_HISTORY_INDEX_FIX";
  else if (startersSourcePrecondition.sourceStatus !== "OK") {
    status = "NEEDS_STARTERS_SOURCE_FIX";
  } else if (entriesSnapshotPrecondition.entriesStatus !== "OK") {
    status = "NEEDS_ENTRIES_SNAPSHOT_FIX";
  } else if (join.summary.exactJoinStatus !== "OK") status = "NEEDS_JOIN_KEY_FIX";
  else if (schema.schemaCompatibility !== "compatible") status = "NEEDS_SCHEMA_MAPPING";
  else if (countReconciliation.countReconciliationStatus !== "OK") {
    status = "NEEDS_COUNT_RECONCILIATION";
  } else if (!candidateHashStable || !candidateBridgePayload.candidatePayloadHashMatched) {
    status = "NEEDS_HASH_STABILITY_FIX";
  } else if (!writeAllowedLater) status = "BLOCKED";
  const readiness = { status };
  const secondaryStatuses = join.summary.raceKeyDirectMatchedCount === 0
    ? ["DIRECT_RACE_KEY_UNAVAILABLE_USED_EXACT_DATE_VENUE_NAME_RACE_NUMBER"]
    : [];
  const summary = {
    targetDate: TARGET_DATE,
    historyDailyPath: HISTORY_DAILY_PATH,
    currentHistoryDailyHash: currentHash,
    expectedCurrentHistoryDailyHash: EXPECTED_CURRENT_HISTORY_DAILY_HASH,
    currentHistoryDailyHashMatched:
      currentHash === EXPECTED_CURRENT_HISTORY_DAILY_HASH,
    historyIndexed: base.historyIndexStatus.targetDateEntryExists,
    historyDailyExists: historyRead.exists,
    startersSourceExists: sourceRead.exists,
    entriesSnapshotExists: entriesRead.exists,
    historyRaceCount: historyItems.length,
    startersSourceRaceCount: sourceRaces.length,
    entriesSnapshotRaceCount: entryRaces.length,
    noStartersRaceCount: base.historyDailyStatus.noStartersRaceCount,
    raceKeyDirectMatchedCount: join.summary.raceKeyDirectMatchedCount,
    dateVenueNameRaceNumberMatchedCount:
      join.summary.dateVenueNameRaceNumberMatchedCount,
    matchedRaceCount: join.summary.matchedRaceCount,
    bridgeEligibleRaceCount: join.summary.bridgeEligibleRaceCount,
    bridgeBlockedRaceCount: join.summary.bridgeBlockedRaceCount,
    candidateStartersNonEmptyRaceCount:
      candidateBridgePayload.candidateStartersNonEmptyRaceCount,
    candidateStarterTotalCount:
      candidateBridgePayload.candidateStarterTotalCount,
    candidateMissingRegistrationNoCount:
      candidateBridgePayload.candidateMissingRegistrationNoCount,
    candidatePayloadHash: candidateHash,
    expectedCandidatePayloadHash: EXPECTED_CANDIDATE_PAYLOAD_HASH,
    candidatePayloadHashMatched:
      candidateBridgePayload.candidatePayloadHashMatched,
    writeAllowedLater,
    writePerformed: false,
    historyDailyWritePerformed: false,
    historyIndexModified: changedDuringAudit.includes(HISTORY_INDEX_PATH),
    historyDailyModified: changedDuringAudit.includes(HISTORY_DAILY_PATH),
    analyticsSourceModified: changedDuringAudit.includes(STARTERS_SOURCE_PATH),
    racesModified: changedDuringAudit.includes(ENTRIES_SNAPSHOT_PATH),
    fakeCompletionPerformed: false,
    fuzzyMatchingPerformed: false,
    predictionUsedAsStarterSource: false,
    resultUsedAsStarterSource: false,
    lineupUsedAsStarterSource: false,
    registrationNoGenerated: false,
    historyStartersBridgeWriteSafetyReadiness: status,
    secondaryStatuses,
    blockReasonCounts: Object.fromEntries(
      Object.entries(blockReasonCounts).filter(([, count]) => count > 0),
    ),
  };
  return {
    summary,
    currentHistoryDailyPrecondition,
    historyIndexPrecondition: base.historyIndexStatus,
    startersSourcePrecondition,
    entriesSnapshotPrecondition,
    exactJoinPrecondition: join.summary,
    candidateBridgePayload,
    writePolicy,
    schemaCompatibility: schema,
    countReconciliation,
    bridgeWritePreview,
    protectedModificationGuard: guard,
    nextActionPlan: nextActionPlan(writeAllowedLater),
    jsonSummary: {
      ...summary,
      historyStartersBridgeWriteSafetyReadiness: readiness,
      allBlockReasonCounts: blockReasonCounts,
    },
  };
}

async function main() {
  const result = await auditHistoryStartersBridgeWriteSafety();
  printSection("summary", result.summary);
  printSection(
    "currentHistoryDailyPrecondition",
    result.currentHistoryDailyPrecondition,
  );
  printSection("historyIndexPrecondition", result.historyIndexPrecondition);
  printSection("startersSourcePrecondition", result.startersSourcePrecondition);
  printSection("entriesSnapshotPrecondition", result.entriesSnapshotPrecondition);
  printSection("exactJoinPrecondition", result.exactJoinPrecondition);
  printSection("candidateBridgePayload", result.candidateBridgePayload);
  printSection("writePolicy", result.writePolicy);
  printSection("schemaCompatibility", result.schemaCompatibility);
  printSection("countReconciliation", result.countReconciliation);
  printSection("bridgeWritePreview", result.bridgeWritePreview);
  printSection("protectedModificationGuard", result.protectedModificationGuard);
  printSection("nextActionPlan", result.nextActionPlan);
  printSection("jsonSummary", result.jsonSummary);
  if (
    result.summary.historyStartersBridgeWriteSafetyReadiness
      !== "READY_FOR_HISTORY_STARTERS_BRIDGE_WRITER_IMPLEMENTATION"
  ) {
    process.exitCode = 1;
  }
}

const isMain =
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  main().catch((error) => {
    console.error("[kurari-ex history starters bridge write safety] failed");
    console.error(error);
    process.exitCode = 1;
  });
}
