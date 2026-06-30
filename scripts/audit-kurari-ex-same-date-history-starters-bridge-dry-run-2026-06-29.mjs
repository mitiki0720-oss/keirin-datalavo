import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const TARGET_DATE = "2026-06-29";
const HISTORY_INDEX_PATH =
  "public/data/analytics/kurari-ex/history/index.generated.json";
const HISTORY_DAILY_PATH =
  "public/data/analytics/kurari-ex/history/daily/2026-06/2026-06-29.generated.json";
const HISTORY_DAILY_PUBLIC_PATH =
  "/data/analytics/kurari-ex/history/daily/2026-06/2026-06-29.generated.json";
const STARTERS_INDEX_PATH =
  "public/data/analytics/kurari-ex/source/starters/index.generated.json";
const STARTERS_SOURCE_PATH =
  "public/data/analytics/kurari-ex/source/starters/2026-06-29/today-registration-starters.generated.json";
const ENTRIES_INDEX_PATH =
  "public/data/races/entries-history/index.generated.json";
const ENTRIES_SNAPSHOT_PATH =
  "public/data/races/entries-history/2026-06-29/keirin-jp-entries.generated.json";
const THIS_SCRIPT =
  "scripts/audit-kurari-ex-same-date-history-starters-bridge-dry-run-2026-06-29.mjs";
const EXPECTED_HISTORY_DAILY_HASH =
  "sha256:96a4d2399cf7f57f777170648c9ab8da2f87f20b5bdcc3ed680f2ca6b67d6e2f";

const BLOCK_REASON_KEYS = [
  "HISTORY_INDEX_MISSING",
  "HISTORY_INDEX_PARSE_FAILED",
  "HISTORY_INDEX_TARGET_DATE_MISSING",
  "HISTORY_DAILY_MISSING",
  "HISTORY_DAILY_PARSE_FAILED",
  "HISTORY_DAILY_HASH_MISMATCH",
  "HISTORY_DAILY_ALREADY_HAS_STARTERS",
  "HISTORY_DAILY_NO_STARTERS_NOT_FOUND",
  "STARTERS_SOURCE_MISSING",
  "STARTERS_SOURCE_PARSE_FAILED",
  "STARTERS_SOURCE_RACE_COUNT_MISMATCH",
  "STARTERS_SOURCE_REGISTRATION_NO_MISSING",
  "STARTERS_SOURCE_DUPLICATE_RACE_KEY",
  "ENTRIES_SNAPSHOT_MISSING",
  "ENTRIES_SNAPSHOT_PARSE_FAILED",
  "ENTRIES_SNAPSHOT_RACE_COUNT_MISMATCH",
  "EXACT_JOIN_MISSING_RACE",
  "EXACT_JOIN_EXTRA_SOURCE_RACE",
  "AMBIGUOUS_JOIN_KEY",
  "CROSS_DATE_JOIN_FOUND",
  "CROSS_VENUE_JOIN_FOUND",
  "CANDIDATE_SCHEMA_INCOMPATIBLE",
  "CANDIDATE_COUNT_MISMATCH",
  "FAKE_COMPLETION_FOUND",
  "FUZZY_MATCHING_FOUND",
  "PREDICTION_USED_AS_STARTER_SOURCE",
  "RESULT_USED_AS_STARTER_SOURCE",
  "LINEUP_USED_AS_STARTER_SOURCE",
  "REGISTRATION_NO_GENERATED",
  "WRITE_PERFORMED_IN_DRY_RUN",
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

const KNOWN_PREEXISTING_REVIEW_PATHS = [
  "public/data/reviews/index.json",
  "public/data/reviews/2026-06-28/",
  "public/data/reviews/2026-06-29/",
  "public/data/reviews/2026-06-30/",
];

function abs(file) {
  return path.isAbsolute(file) ? file : path.resolve(ROOT, file);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asInteger(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizePath(value) {
  return normalizeText(value).replaceAll("\\", "/").replace(/^"|"$/g, "");
}

function hashPayload(value) {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")}`;
}

function countDuplicates(values) {
  const counts = new Map();
  for (const value of values.filter(Boolean)) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.values()].reduce(
    (total, count) => total + Math.max(0, count - 1),
    0,
  );
}

function increment(counter, key, by = 1) {
  counter[key] = (counter[key] ?? 0) + by;
}

async function readJsonStatus(file) {
  const exists = existsSync(abs(file));
  if (!exists) {
    return { exists: false, parseStatus: "missing", payload: null, error: null };
  }
  try {
    const payload = JSON.parse(await readFile(abs(file), "utf8"));
    return { exists: true, parseStatus: "ok", payload, error: null };
  } catch (error) {
    return {
      exists: true,
      parseStatus: "failed",
      payload: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function missingCoreFields(items, fieldReaders) {
  return Object.fromEntries(
    Object.entries(fieldReaders).map(([key, reader]) => [
      key,
      items.filter((item) => !normalizeText(reader(item))).length,
    ]),
  );
}

function keyRace(race) {
  return normalizeText(race?.raceKey);
}

function keyDateVenueKeyRaceNumber(race) {
  const date = normalizeText(race?.date);
  const venueKey = normalizeText(race?.venueKey);
  const raceNumber = normalizeText(race?.raceNumber);
  return date && venueKey && raceNumber
    ? `${date}::${venueKey}::${raceNumber}`
    : null;
}

function keyDateVenueNameRaceNumber(race) {
  const date = normalizeText(race?.date);
  const venueName = normalizeText(race?.venueName);
  const raceNumber = normalizeText(race?.raceNumber);
  return date && venueName && raceNumber
    ? `${date}::${venueName}::${raceNumber}`
    : null;
}

function buildUniqueLookup(items, keyBuilder) {
  const grouped = new Map();
  for (const item of items) {
    const key = keyBuilder(item);
    if (!key) continue;
    const values = grouped.get(key) ?? [];
    values.push(item);
    grouped.set(key, values);
  }
  return {
    unique: new Map(
      [...grouped.entries()]
        .filter(([, values]) => values.length === 1)
        .map(([key, values]) => [key, values[0]]),
    ),
    ambiguousKeys: [...grouped.entries()]
      .filter(([, values]) => values.length > 1)
      .map(([key]) => key),
  };
}

function registrationNoOf(starter) {
  return normalizeText(starter?.registrationNo);
}

function carNoOf(starter) {
  return normalizeText(starter?.carNo);
}

function nameOf(starter) {
  return normalizeText(starter?.name);
}

function starterIdentityKey(starter) {
  return registrationNoOf(starter) || `${carNoOf(starter)}::${nameOf(starter)}`;
}

function summarizeHistoryIndex(readResult, blockReasonCounts) {
  if (!readResult.exists) increment(blockReasonCounts, "HISTORY_INDEX_MISSING");
  if (readResult.parseStatus === "failed") {
    increment(blockReasonCounts, "HISTORY_INDEX_PARSE_FAILED");
  }
  const index = readResult.payload ?? {};
  const items = asArray(index.items);
  const targetEntries = items.filter((item) => item?.date === TARGET_DATE);
  const targetPathEntries = items.filter(
    (item) => item?.file === HISTORY_DAILY_PUBLIC_PATH,
  );
  const target = targetEntries[0] ?? null;
  const latest = [...items].sort((a, b) =>
    normalizeText(a?.date).localeCompare(normalizeText(b?.date)),
  ).at(-1);
  const duplicateDateCount = countDuplicates(items.map((item) => item?.date));
  const duplicatePathCount = countDuplicates(items.map((item) => item?.file));
  const targetDateEntryExists = targetEntries.length === 1;
  if (!targetDateEntryExists) {
    increment(blockReasonCounts, "HISTORY_INDEX_TARGET_DATE_MISSING");
  }
  const indexStatus = (
    readResult.exists
    && readResult.parseStatus === "ok"
    && targetDateEntryExists
    && targetPathEntries.length === 1
    && target?.raceCount === 64
    && duplicateDateCount === 0
    && duplicatePathCount === 0
  ) ? "OK" : "FAIL";
  return {
    exists: readResult.exists,
    parseStatus: readResult.parseStatus,
    sourceCount: items.length,
    dayCount: asInteger(index.dayCount),
    raceCount: asInteger(index.raceCount),
    latestDate: latest?.date ?? null,
    latestPath: latest?.file ?? null,
    targetDateEntryExists,
    targetDatePath: target?.file ?? null,
    targetDateRaceCountInIndex: target?.raceCount ?? null,
    duplicateDateCount,
    duplicatePathCount,
    indexStatus,
  };
}

function summarizeHistoryDaily(readResult, blockReasonCounts) {
  if (!readResult.exists) increment(blockReasonCounts, "HISTORY_DAILY_MISSING");
  if (readResult.parseStatus === "failed") {
    increment(blockReasonCounts, "HISTORY_DAILY_PARSE_FAILED");
  }
  const daily = readResult.payload ?? {};
  const items = asArray(daily.items);
  const historyDailyHash = readResult.payload
    ? hashPayload(readResult.payload)
    : null;
  const hashMatched = historyDailyHash === EXPECTED_HISTORY_DAILY_HASH;
  if (readResult.payload && !hashMatched) {
    increment(blockReasonCounts, "HISTORY_DAILY_HASH_MISMATCH");
  }
  const startersEmptyRaceCount = items.filter(
    (item) => asArray(item?.starters).length === 0,
  ).length;
  const startersNonEmptyRaceCount = items.length - startersEmptyRaceCount;
  const qualityStarterParsedFalseCount = items.filter(
    (item) => item?.quality?.starterParsed === false,
  ).length;
  const noStartersRaceCount = items.filter(
    (item) => (
      asInteger(item?.starterCount) > 0
      && asArray(item?.starters).length === 0
      && item?.quality?.starterParsed === false
    ),
  ).length;
  const duplicateRaceKeyCount = countDuplicates(
    items.map((item) => item?.raceKey),
  );
  const missingCoreFieldCounts = missingCoreFields(items, {
    raceKey: (item) => item?.raceKey,
    date: (item) => item?.date,
    venueKey: (item) => item?.venueKey,
    venueName: (item) => item?.venueName,
    raceNumber: (item) => item?.raceNumber,
  });
  const resultRaceCount = items.filter(
    (item) => item?.quality?.resultParsed === true,
  ).length;
  const predictionLinkedRaceCount = items.filter(
    (item) => (
      item?.quality?.predictionParsed === true
      && item?.predictionEnrichment?.status === "matched"
    ),
  ).length;
  const noStartersMaintained = (
    items.length > 0
    && startersEmptyRaceCount === items.length
    && qualityStarterParsedFalseCount === items.length
  );
  if (startersNonEmptyRaceCount > 0) {
    increment(blockReasonCounts, "HISTORY_DAILY_ALREADY_HAS_STARTERS");
  }
  if (!noStartersMaintained) {
    increment(blockReasonCounts, "HISTORY_DAILY_NO_STARTERS_NOT_FOUND");
  }
  const status = (
    readResult.exists
    && readResult.parseStatus === "ok"
    && daily.date === TARGET_DATE
    && daily.raceCount === items.length
    && items.length === 64
    && duplicateRaceKeyCount === 0
    && Object.values(missingCoreFieldCounts).every((count) => count === 0)
    && noStartersMaintained
    && hashMatched
  ) ? "OK" : "FAIL";
  return {
    exists: readResult.exists,
    parseStatus: readResult.parseStatus,
    schemaVersion: daily.schemaVersion ?? null,
    date: daily.date ?? null,
    raceCount: asInteger(daily.raceCount),
    itemCount: items.length,
    venueCount: new Set(items.map((item) => item?.venueKey).filter(Boolean)).size,
    settledRaceCount: asInteger(daily.settledRaceCount),
    cancelledRaceCount: asInteger(daily.cancelledRaceCount),
    noStartersRaceCount,
    startersEmptyRaceCount,
    startersNonEmptyRaceCount,
    qualityStarterParsedFalseCount,
    duplicateRaceKeyCount,
    missingCoreFieldCounts,
    resultRaceCount,
    predictionLinkedRaceCount,
    noStartersMaintained,
    historyDailyHash,
    expectedHistoryDailyHash: EXPECTED_HISTORY_DAILY_HASH,
    hashMatched,
    status,
  };
}

function summarizeStartersSource(readResult, blockReasonCounts) {
  if (!readResult.exists) increment(blockReasonCounts, "STARTERS_SOURCE_MISSING");
  if (readResult.parseStatus === "failed") {
    increment(blockReasonCounts, "STARTERS_SOURCE_PARSE_FAILED");
  }
  const payload = readResult.payload ?? {};
  const races = asArray(payload.races);
  const starters = races.flatMap((race) => asArray(race?.starters));
  const duplicateRaceKeyCount = countDuplicates(
    races.map((race) => keyRace(race)).filter(Boolean),
  );
  const duplicateStarterIdentityCount = races.reduce(
    (total, race) => total + countDuplicates(
      asArray(race?.starters).map(starterIdentityKey),
    ),
    0,
  );
  const missingRaceKeyCount = races.filter((race) => !keyRace(race)).length;
  const missingVenueKeyCount = races.filter(
    (race) => !normalizeText(race?.venueKey),
  ).length;
  const missingRaceNumberCount = races.filter(
    (race) => !normalizeText(race?.raceNumber),
  ).length;
  const missingCarNoCount = starters.filter(
    (starter) => !carNoOf(starter),
  ).length;
  const missingNameCount = starters.filter(
    (starter) => !nameOf(starter),
  ).length;
  const missingRegistrationNoCount = starters.filter(
    (starter) => !registrationNoOf(starter),
  ).length;
  const missingRiderIdentityCount = starters.filter(
    (starter) => (
      !carNoOf(starter)
      || !nameOf(starter)
      || !registrationNoOf(starter)
    ),
  ).length;
  const identityStatusCounts = {};
  for (const race of races) {
    const status = normalizeText(race?.quality?.starterStatus) || "unknown";
    increment(identityStatusCounts, status);
  }
  const raceCountByVenue = {};
  for (const race of races) {
    increment(raceCountByVenue, normalizeText(race?.venueName) || "未取得");
  }
  const exactKeyLookup = buildUniqueLookup(races, keyRace);
  const duplicateExactKeyCount = exactKeyLookup.ambiguousKeys.length;
  if (duplicateRaceKeyCount > 0 || duplicateExactKeyCount > 0) {
    increment(blockReasonCounts, "STARTERS_SOURCE_DUPLICATE_RACE_KEY");
  }
  if (missingRegistrationNoCount > 0) {
    increment(
      blockReasonCounts,
      "STARTERS_SOURCE_REGISTRATION_NO_MISSING",
      missingRegistrationNoCount,
    );
  }
  if (races.length !== 64) {
    increment(blockReasonCounts, "STARTERS_SOURCE_RACE_COUNT_MISMATCH");
  }
  const sourceStatus = (
    readResult.exists
    && readResult.parseStatus === "ok"
    && payload.date === TARGET_DATE
    && races.length === 64
    && duplicateRaceKeyCount === 0
    && duplicateStarterIdentityCount === 0
    && missingRaceNumberCount === 0
    && missingCarNoCount === 0
    && missingNameCount === 0
    && missingRegistrationNoCount === 0
    && payload?.quality?.checkStatus === "PASS"
  ) ? "OK" : (
    readResult.exists && readResult.parseStatus === "ok" ? "PARTIAL" : "FAIL"
  );
  return {
    exists: readResult.exists,
    parseStatus: readResult.parseStatus,
    schemaVersion: payload.schemaVersion ?? null,
    date: payload.date ?? null,
    sourceRaceCount: races.length,
    sourceVenueCount: new Set(
      races.map((race) => race?.venueName).filter(Boolean),
    ).size,
    sourceStarterTotalCount: starters.length,
    raceCountByVenue,
    duplicateRaceKeyCount,
    duplicateStarterIdentityCount,
    missingRaceKeyCount,
    missingVenueKeyCount,
    missingRaceNumberCount,
    missingCarNoCount,
    missingNameCount,
    missingRegistrationNoCount,
    missingRiderIdentityCount,
    identityStatusCounts,
    sourceHash: readResult.payload ? hashPayload(readResult.payload) : null,
    declaredContentHash: payload.contentHash ?? null,
    sourceStatus,
  };
}

function summarizeEntriesSnapshot(readResult, blockReasonCounts) {
  if (!readResult.exists) increment(blockReasonCounts, "ENTRIES_SNAPSHOT_MISSING");
  if (readResult.parseStatus === "failed") {
    increment(blockReasonCounts, "ENTRIES_SNAPSHOT_PARSE_FAILED");
  }
  const payload = readResult.payload ?? {};
  const races = asArray(payload.races);
  const entries = races.flatMap((race) => asArray(race?.entries));
  const duplicateRaceKeyCount = countDuplicates(
    races.map((race) => keyRace(race)).filter(Boolean),
  );
  const missingCoreFieldCounts = {
    raceKey: races.filter((race) => !keyRace(race)).length,
    date: races.filter((race) => !normalizeText(race?.date)).length,
    venueKey: races.filter((race) => !normalizeText(race?.venueKey)).length,
    venueName: races.filter((race) => !normalizeText(race?.venueName)).length,
    raceNumber: races.filter(
      (race) => !normalizeText(race?.raceNumber),
    ).length,
    entries: races.filter((race) => asArray(race?.entries).length === 0).length,
    carNo: entries.filter((entry) => !carNoOf(entry)).length,
    name: entries.filter((entry) => !nameOf(entry)).length,
    registrationNo: entries.filter(
      (entry) => !registrationNoOf(entry),
    ).length,
  };
  if (races.length !== 64) {
    increment(blockReasonCounts, "ENTRIES_SNAPSHOT_RACE_COUNT_MISMATCH");
  }
  const status = (
    readResult.exists
    && readResult.parseStatus === "ok"
    && payload.date === TARGET_DATE
    && races.length === 64
    && duplicateRaceKeyCount === 0
    && missingCoreFieldCounts.date === 0
    && missingCoreFieldCounts.venueName === 0
    && missingCoreFieldCounts.raceNumber === 0
    && missingCoreFieldCounts.entries === 0
    && missingCoreFieldCounts.carNo === 0
    && missingCoreFieldCounts.name === 0
    && missingCoreFieldCounts.registrationNo === 0
  ) ? "OK" : (
    readResult.exists && readResult.parseStatus === "ok" ? "PARTIAL" : "FAIL"
  );
  return {
    exists: readResult.exists,
    parseStatus: readResult.parseStatus,
    date: payload.date ?? null,
    entryRaceCount: races.length,
    entryVenueCount: new Set(
      races.map((race) => race?.venueName).filter(Boolean),
    ).size,
    entryStarterTotalCount: entries.length,
    duplicateRaceKeyCount,
    missingCoreFieldCounts,
    entryHash: readResult.payload ? hashPayload(readResult.payload) : null,
    declaredContentHash: payload.contentHash ?? null,
    status,
  };
}

function exactJoinDryRun(historyItems, sourceRaces, blockReasonCounts) {
  const lookups = {
    raceKey: buildUniqueLookup(sourceRaces, keyRace),
    venueKey: buildUniqueLookup(sourceRaces, keyDateVenueKeyRaceNumber),
    venueName: buildUniqueLookup(sourceRaces, keyDateVenueNameRaceNumber),
  };
  const ambiguousJoinKeys = [
    ...lookups.raceKey.ambiguousKeys,
    ...lookups.venueKey.ambiguousKeys,
    ...lookups.venueName.ambiguousKeys,
  ];
  if (ambiguousJoinKeys.length > 0) {
    increment(blockReasonCounts, "AMBIGUOUS_JOIN_KEY", ambiguousJoinKeys.length);
  }
  const consumed = new Set();
  const matches = [];
  const matchCounts = {
    raceKey: 0,
    dateVenueKeyRaceNumber: 0,
    dateVenueNameRaceNumber: 0,
  };
  for (const historyRace of historyItems) {
    const candidates = [
      ["raceKey", keyRace(historyRace), lookups.raceKey.unique],
      [
        "dateVenueKeyRaceNumber",
        keyDateVenueKeyRaceNumber(historyRace),
        lookups.venueKey.unique,
      ],
      [
        "dateVenueNameRaceNumber",
        keyDateVenueNameRaceNumber(historyRace),
        lookups.venueName.unique,
      ],
    ];
    let match = null;
    for (const [matchedBy, key, lookup] of candidates) {
      if (!key || !lookup.has(key)) continue;
      const sourceRace = lookup.get(key);
      match = { historyRace, sourceRace, matchedBy, key };
      matchCounts[matchedBy] += 1;
      consumed.add(sourceRace);
      break;
    }
    matches.push(match ?? { historyRace, sourceRace: null, matchedBy: null, key: null });
  }
  const unmatchedHistoryRaceCount = matches.filter(
    (match) => !match.sourceRace,
  ).length;
  const unmatchedStartersRaceCount = sourceRaces.filter(
    (race) => !consumed.has(race),
  ).length;
  if (unmatchedHistoryRaceCount > 0) {
    increment(
      blockReasonCounts,
      "EXACT_JOIN_MISSING_RACE",
      unmatchedHistoryRaceCount,
    );
  }
  if (unmatchedStartersRaceCount > 0) {
    increment(
      blockReasonCounts,
      "EXACT_JOIN_EXTRA_SOURCE_RACE",
      unmatchedStartersRaceCount,
    );
  }
  const crossDateJoinCount = matches.filter(
    (match) => (
      match.sourceRace
      && match.historyRace?.date !== match.sourceRace?.date
    ),
  ).length;
  const crossVenueJoinCount = matches.filter(
    (match) => (
      match.sourceRace
      && normalizeText(match.historyRace?.venueName)
        !== normalizeText(match.sourceRace?.venueName)
    ),
  ).length;
  if (crossDateJoinCount > 0) {
    increment(blockReasonCounts, "CROSS_DATE_JOIN_FOUND", crossDateJoinCount);
  }
  if (crossVenueJoinCount > 0) {
    increment(blockReasonCounts, "CROSS_VENUE_JOIN_FOUND", crossVenueJoinCount);
  }
  const bridgeEligibleMatches = matches.filter((match) => {
    if (!match.sourceRace) return false;
    const starters = asArray(match.sourceRace.starters);
    return (
      starters.length > 0
      && starters.every(
        (starter) => (
          carNoOf(starter)
          && nameOf(starter)
          && registrationNoOf(starter)
        ),
      )
    );
  });
  const matchedRaceCount = matches.length - unmatchedHistoryRaceCount;
  return {
    matches,
    summary: {
      targetDate: TARGET_DATE,
      historyRaceCount: historyItems.length,
      startersSourceRaceCount: sourceRaces.length,
      exactRaceKeyMatchedCount: matchCounts.raceKey,
      dateVenueKeyRaceNumberMatchedCount:
        matchCounts.dateVenueKeyRaceNumber,
      dateVenueNameRaceNumberMatchedCount:
        matchCounts.dateVenueNameRaceNumber,
      unmatchedHistoryRaceCount,
      unmatchedStartersRaceCount,
      matchedRaceCount,
      bridgeEligibleRaceCount: bridgeEligibleMatches.length,
      bridgeBlockedRaceCount: historyItems.length - bridgeEligibleMatches.length,
      totalStarterCountToBridge: bridgeEligibleMatches.reduce(
        (total, match) => total + asArray(match.sourceRace?.starters).length,
        0,
      ),
      allMatchedByExactKey: (
        matchedRaceCount === historyItems.length
        && unmatchedStartersRaceCount === 0
        && ambiguousJoinKeys.length === 0
      ),
      directRaceKeyAvailableInStartersSource:
        sourceRaces.every((race) => Boolean(keyRace(race))),
      exactFallbackUsed: matchCounts.dateVenueNameRaceNumber > 0,
      ambiguousJoinKeyCount: ambiguousJoinKeys.length,
      crossDateJoinCount,
      crossVenueJoinCount,
      fuzzyMatchingPerformed: false,
      fakeCompletionPerformed: false,
      predictionUsedAsStarterSource: false,
      resultUsedAsStarterSource: false,
      lineupUsedAsStarterSource: false,
      registrationNoGenerated: false,
    },
  };
}

function clone(value) {
  return structuredClone(value);
}

function buildCandidate(historyDaily, joinResult, blockReasonCounts) {
  const candidate = clone(historyDaily);
  const matchesByRaceKey = new Map(
    joinResult.matches.map((match) => [match.historyRace?.raceKey, match]),
  );
  candidate.items = asArray(candidate.items).map((item) => {
    const match = matchesByRaceKey.get(item.raceKey);
    if (!match?.sourceRace) return item;
    const sourceStarters = asArray(match.sourceRace.starters);
    const warnings = asArray(item?.quality?.warnings).filter(
      (warning) => (
        !/starter identity intentionally not generated/i.test(
          normalizeText(warning),
        )
      ),
    );
    return {
      ...item,
      starterCount: sourceStarters.length,
      starters: clone(sourceStarters),
      quality: {
        ...item.quality,
        starterParsed: true,
        starterSource: "same-date-exact-starters-source",
        warnings,
      },
    };
  });
  const items = asArray(candidate.items);
  const allStarters = items.flatMap((item) => asArray(item.starters));
  const candidateStartersNonEmptyRaceCount = items.filter(
    (item) => asArray(item.starters).length > 0,
  ).length;
  const candidateStartersEmptyRaceCount =
    items.length - candidateStartersNonEmptyRaceCount;
  const candidateStarterParsedTrueCount = items.filter(
    (item) => item?.quality?.starterParsed === true,
  ).length;
  const candidateStarterParsedFalseCount = items.filter(
    (item) => item?.quality?.starterParsed === false,
  ).length;
  const candidateMissingRegistrationNoCount = allStarters.filter(
    (starter) => !registrationNoOf(starter),
  ).length;
  const candidateDuplicateRegistrationNoWithinRaceCount = items.filter(
    (item) => (
      countDuplicates(
        asArray(item.starters)
          .map(registrationNoOf)
          .filter(Boolean),
      ) > 0
    ),
  ).length;
  const candidateDuplicateCarNoWithinRaceCount = items.filter(
    (item) => (
      countDuplicates(
        asArray(item.starters).map(carNoOf).filter(Boolean),
      ) > 0
    ),
  ).length;
  const itemCountsMatch = items.every(
    (item) => (
      asInteger(item?.starterCount) === asArray(item?.starters).length
    ),
  );
  const candidateSchemaCompatibility = (
    candidate.schemaVersion === historyDaily.schemaVersion
    && candidate.date === TARGET_DATE
    && candidate.raceCount === items.length
    && items.length === 64
    && candidateStartersNonEmptyRaceCount === items.length
    && candidateStarterParsedTrueCount === items.length
    && candidateMissingRegistrationNoCount === 0
    && candidateDuplicateRegistrationNoWithinRaceCount === 0
    && candidateDuplicateCarNoWithinRaceCount === 0
    && itemCountsMatch
  ) ? "compatible" : "incompatible";
  if (candidateSchemaCompatibility === "incompatible") {
    increment(blockReasonCounts, "CANDIDATE_SCHEMA_INCOMPATIBLE");
  }
  if (
    candidate.raceCount !== 64
    || candidateStartersNonEmptyRaceCount !== 64
    || candidateStarterParsedTrueCount !== 64
  ) {
    increment(blockReasonCounts, "CANDIDATE_COUNT_MISMATCH");
  }
  return {
    candidate,
    summary: {
      candidateRaceCount: items.length,
      candidateVenueCount: new Set(
        items.map((item) => item?.venueKey).filter(Boolean),
      ).size,
      candidateStartersNonEmptyRaceCount,
      candidateStartersEmptyRaceCount,
      candidateStarterTotalCount: allStarters.length,
      candidateStarterParsedTrueCount,
      candidateStarterParsedFalseCount,
      candidateMissingRegistrationNoCount,
      candidateDuplicateRegistrationNoWithinRaceCount,
      candidateDuplicateCarNoWithinRaceCount,
      candidateSchemaCompatibility,
      candidatePayloadHash: hashPayload(candidate),
      originalHistoryHash: hashPayload(historyDaily),
      writePerformed: false,
      historyDailyModified: false,
    },
  };
}

function gitLines(args) {
  try {
    return execFileSync("git", args, {
      cwd: ROOT,
      encoding: "utf8",
      windowsHide: true,
    })
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter((line) => line.length > 0);
  } catch {
    return [];
  }
}

function statusPath(line) {
  const raw = line.length > 3 ? line.slice(3).trim() : line;
  const renamed = raw.includes(" -> ") ? raw.split(" -> ").at(-1) : raw;
  return normalizePath(renamed);
}

function isKnownReviewPath(file) {
  return KNOWN_PREEXISTING_REVIEW_PATHS.some(
    (allowed) => (
      allowed.endsWith("/")
        ? file.startsWith(allowed)
        : file === allowed
    ),
  );
}

function protectedModificationGuard(blockReasonCounts) {
  const statusLines = gitLines(["status", "--porcelain=v1", "--untracked-files=normal"]);
  const statusFiles = statusLines.map(statusPath);
  const stagedFiles = gitLines(["diff", "--cached", "--name-only"]).map(
    normalizePath,
  );
  const permitted = (file) => file === THIS_SCRIPT || isKnownReviewPath(file);
  const unexpected = statusFiles.filter((file) => !permitted(file));
  const unexpectedModifiedFiles = unexpected.filter(
    (file) => !statusLines.some(
      (line) => line.startsWith("??") && statusPath(line) === file,
    ),
  );
  const unexpectedUntrackedFiles = unexpected.filter((file) =>
    statusLines.some(
      (line) => line.startsWith("??") && statusPath(line) === file,
    ),
  );
  const historyIndexModified = statusFiles.includes(HISTORY_INDEX_PATH);
  const historyDailyModified = statusFiles.some((file) =>
    file.startsWith("public/data/analytics/kurari-ex/history/daily/"),
  );
  const analyticsSourceModified = statusFiles.some((file) =>
    file.startsWith("public/data/analytics/kurari-ex/source/"),
  );
  const racesModified = statusFiles.some((file) =>
    file.startsWith("public/data/races/"),
  );
  const privateInputModified = statusFiles.some((file) =>
    file.startsWith("private-input/"),
  );
  const srcModified = statusFiles.some((file) => file.startsWith("src/"));
  const packageModified = statusFiles.includes("package.json");
  const existingScriptModified = statusFiles.some(
    (file) => file.startsWith("scripts/") && file !== THIS_SCRIPT,
  );
  const reviewsTouchedByThisStep = statusFiles.some(
    (file) => file.startsWith("public/data/reviews/") && !isKnownReviewPath(file),
  );
  const allowedNewScriptOnly = (
    statusFiles.includes(THIS_SCRIPT)
    && unexpected.length === 0
  );
  if (historyIndexModified) increment(blockReasonCounts, "HISTORY_INDEX_MODIFIED");
  if (historyDailyModified) increment(blockReasonCounts, "HISTORY_DAILY_MODIFIED");
  if (analyticsSourceModified) increment(blockReasonCounts, "ANALYTICS_SOURCE_MODIFIED");
  if (racesModified) increment(blockReasonCounts, "RACES_MODIFIED");
  if (reviewsTouchedByThisStep) {
    increment(blockReasonCounts, "REVIEWS_MODIFIED_BY_THIS_STEP");
  }
  if (privateInputModified) increment(blockReasonCounts, "PRIVATE_INPUT_MODIFIED");
  if (srcModified) increment(blockReasonCounts, "SRC_MODIFIED");
  if (packageModified) increment(blockReasonCounts, "PACKAGE_MODIFIED");
  if (existingScriptModified) increment(blockReasonCounts, "EXISTING_SCRIPT_MODIFIED");
  if (stagedFiles.length > 0) {
    increment(blockReasonCounts, "UNEXPECTED_FILE_STAGED", stagedFiles.length);
  }
  const guardStatus = (
    allowedNewScriptOnly
    && !historyIndexModified
    && !historyDailyModified
    && !analyticsSourceModified
    && !racesModified
    && !reviewsTouchedByThisStep
    && !privateInputModified
    && !srcModified
    && !packageModified
    && !existingScriptModified
    && stagedFiles.length === 0
  ) ? "pass" : "fail";
  return {
    allowedNewScriptOnly,
    historyIndexModified,
    historyDailyModified,
    analyticsSourceModified,
    racesModified,
    reviewsTouchedByThisStep,
    privateInputModified,
    srcModified,
    packageModified,
    existingScriptModified,
    unexpectedModifiedFiles,
    unexpectedUntrackedFiles,
    stagedFiles,
    knownPreexistingReviewPathsPresent: statusFiles.filter(isKnownReviewPath),
    guardStatus,
  };
}

function buildNextActionPlan(writeAllowedLater) {
  const readiness = writeAllowedLater ? "ready" : "blocked";
  return [
    {
      stepId: 1,
      action: "history starters bridge write safety audit",
      prerequisiteStatus: readiness,
      allowedFiles: ["new audit script only"],
      prohibitedFiles: [HISTORY_DAILY_PATH, HISTORY_INDEX_PATH],
      readiness,
      notes: "writer実装前にhash・上書き・schema変更範囲を固定する。",
    },
    {
      stepId: 2,
      action: "history starters bridge writer implementation",
      prerequisiteStatus: "write safety audit pass",
      allowedFiles: ["new writer/checker scripts only"],
      prohibitedFiles: ["existing scripts", "src/**"],
      readiness: "future",
      notes: "このdry-runでは実装しない。",
    },
    {
      stepId: 3,
      action: "history starters bridge actual write",
      prerequisiteStatus: "writer/checker validation pass",
      allowedFiles: [HISTORY_DAILY_PATH],
      prohibitedFiles: [HISTORY_INDEX_PATH, STARTERS_SOURCE_PATH],
      readiness: "future",
      notes: "明示された別工程でのみ実施する。",
    },
    {
      stepId: 4,
      action: "history starters bridge checker",
      prerequisiteStatus: "actual write completed",
      allowedFiles: ["new checker script only"],
      prohibitedFiles: ["public data mutation"],
      readiness: "future",
      notes: "64R・464選手・registrationNo完全性を再検証する。",
    },
    {
      stepId: 5,
      action: "final history/index/daily/source consistency audit",
      prerequisiteStatus: "bridge checker pass",
      allowedFiles: ["new audit script only"],
      prohibitedFiles: ["public data mutation"],
      readiness: "future",
      notes: "index件数はdailyのstarter追加では変えない。",
    },
    {
      stepId: 6,
      action: "UI/API consumption check",
      prerequisiteStatus: "final consistency audit pass",
      allowedFiles: ["read-only inspection"],
      prohibitedFiles: ["prediction logic", "GPT material"],
      readiness: "future",
      notes: "別工程。",
    },
    {
      stepId: 7,
      action: "6/25〜6/28 history追加",
      prerequisiteStatus: "separate source audit",
      allowedFiles: ["separate task scope only"],
      prohibitedFiles: ["this dry-run scope"],
      readiness: "separate",
      notes: "2026-06-29 bridgeとは分離する。",
    },
  ];
}

function printSection(label, value) {
  console.log(`[${label}]`);
  console.log(JSON.stringify(value, null, 2));
}

export async function auditSameDateHistoryStartersBridgeDryRun() {
  const blockReasonCounts = Object.fromEntries(
    BLOCK_REASON_KEYS.map((key) => [key, 0]),
  );
  const beforeHashes = {};
  for (const file of [
    HISTORY_INDEX_PATH,
    HISTORY_DAILY_PATH,
    STARTERS_INDEX_PATH,
    STARTERS_SOURCE_PATH,
    ENTRIES_INDEX_PATH,
    ENTRIES_SNAPSHOT_PATH,
  ]) {
    const result = await readJsonStatus(file);
    beforeHashes[file] = result.payload ? hashPayload(result.payload) : null;
  }

  const [
    historyIndexRead,
    historyDailyRead,
    startersIndexRead,
    startersSourceRead,
    entriesIndexRead,
    entriesSnapshotRead,
  ] = await Promise.all([
    readJsonStatus(HISTORY_INDEX_PATH),
    readJsonStatus(HISTORY_DAILY_PATH),
    readJsonStatus(STARTERS_INDEX_PATH),
    readJsonStatus(STARTERS_SOURCE_PATH),
    readJsonStatus(ENTRIES_INDEX_PATH),
    readJsonStatus(ENTRIES_SNAPSHOT_PATH),
  ]);
  const historyIndexStatus = summarizeHistoryIndex(
    historyIndexRead,
    blockReasonCounts,
  );
  const historyDailyStatus = summarizeHistoryDaily(
    historyDailyRead,
    blockReasonCounts,
  );
  const startersSourceStatus = summarizeStartersSource(
    startersSourceRead,
    blockReasonCounts,
  );
  const entriesSnapshotStatus = summarizeEntriesSnapshot(
    entriesSnapshotRead,
    blockReasonCounts,
  );
  const historyItems = asArray(historyDailyRead.payload?.items);
  const sourceRaces = asArray(startersSourceRead.payload?.races);
  const entriesRaces = asArray(entriesSnapshotRead.payload?.races);
  const join = exactJoinDryRun(historyItems, sourceRaces, blockReasonCounts);
  join.summary.entriesSnapshotRaceCount = entriesRaces.length;
  const candidate = buildCandidate(
    historyDailyRead.payload ?? {},
    join,
    blockReasonCounts,
  );

  const afterHashes = {};
  for (const file of Object.keys(beforeHashes)) {
    const result = await readJsonStatus(file);
    afterHashes[file] = result.payload ? hashPayload(result.payload) : null;
  }
  const changedDuringRun = Object.keys(beforeHashes).filter(
    (file) => beforeHashes[file] !== afterHashes[file],
  );
  if (changedDuringRun.length > 0) {
    increment(blockReasonCounts, "WRITE_PERFORMED_IN_DRY_RUN", changedDuringRun.length);
  }
  const protectedGuard = protectedModificationGuard(blockReasonCounts);
  const sourceIndexesOk = (
    startersIndexRead.exists
    && startersIndexRead.parseStatus === "ok"
    && entriesIndexRead.exists
    && entriesIndexRead.parseStatus === "ok"
  );
  const allStartersHaveRegistrationNo =
    startersSourceStatus.missingRegistrationNoCount === 0;
  const allCandidateStartersNonEmpty =
    candidate.summary.candidateStartersNonEmptyRaceCount
      === candidate.summary.candidateRaceCount;
  const dataChecksReady = (
    historyIndexStatus.indexStatus === "OK"
    && historyDailyStatus.status === "OK"
    && startersSourceStatus.sourceStatus === "OK"
    && entriesSnapshotStatus.status === "OK"
    && sourceIndexesOk
    && join.summary.matchedRaceCount === 64
    && join.summary.bridgeEligibleRaceCount === 64
    && join.summary.unmatchedHistoryRaceCount === 0
    && join.summary.unmatchedStartersRaceCount === 0
    && join.summary.allMatchedByExactKey
    && allStartersHaveRegistrationNo
    && allCandidateStartersNonEmpty
    && candidate.summary.candidateSchemaCompatibility === "compatible"
  );
  const writeAllowedLater = dataChecksReady && protectedGuard.guardStatus === "pass";
  let bridgeSafetyStatus =
    "READY_FOR_HISTORY_STARTERS_BRIDGE_WRITE_SAFETY_AUDIT";
  if (!historyDailyRead.exists || historyDailyStatus.status !== "OK") {
    bridgeSafetyStatus = "NEEDS_HISTORY_DAILY_FIX";
  } else if (
    !startersSourceRead.exists
    || startersSourceStatus.sourceStatus !== "OK"
  ) {
    bridgeSafetyStatus = "NEEDS_STARTERS_SOURCE_FIX";
  } else if (
    !entriesSnapshotRead.exists
    || entriesSnapshotStatus.status !== "OK"
  ) {
    bridgeSafetyStatus = "NEEDS_ENTRIES_SNAPSHOT_FIX";
  } else if (!join.summary.allMatchedByExactKey) {
    bridgeSafetyStatus = "NEEDS_JOIN_KEY_FIX";
  } else if (candidate.summary.candidateSchemaCompatibility !== "compatible") {
    bridgeSafetyStatus = "NEEDS_SCHEMA_MAPPING";
  } else if (!writeAllowedLater) {
    bridgeSafetyStatus = "BLOCKED";
  }
  const secondaryStatuses = [];
  if (join.summary.exactFallbackUsed) {
    secondaryStatuses.push(
      "DIRECT_RACE_KEY_UNAVAILABLE_USED_EXACT_DATE_VENUE_NAME_RACE_NUMBER",
    );
  }
  if (entriesSnapshotStatus.missingCoreFieldCounts.raceKey > 0) {
    secondaryStatuses.push("ENTRIES_RACE_KEY_NOT_STORED");
  }
  if (entriesSnapshotStatus.missingCoreFieldCounts.venueKey > 0) {
    secondaryStatuses.push("ENTRIES_VENUE_KEY_NOT_STORED");
  }
  const bridgeSafety = {
    sameDateHistoryExists: historyDailyRead.exists,
    sameDateStartersSourceExists: startersSourceRead.exists,
    sameDateEntriesSnapshotExists: entriesSnapshotRead.exists,
    historyIndexed: historyIndexStatus.targetDateEntryExists,
    allRaceKeysMatched: join.summary.allMatchedByExactKey,
    allStartersHaveRegistrationNo,
    allCandidateStartersNonEmpty,
    noFakeCompletion: true,
    noFuzzyMatching: true,
    noPredictionAsStarterSource: true,
    noResultAsStarterSource: true,
    noLineupAsStarterSource: true,
    noGeneratedRegistrationNo: true,
    noCrossDateJoin: join.summary.crossDateJoinCount === 0,
    noCrossVenueJoin: join.summary.crossVenueJoinCount === 0,
    noAmbiguousJoin: join.summary.ambiguousJoinKeyCount === 0,
    writeAllowedLater,
    writePerformed: false,
    bridgeSafetyStatus,
    secondaryStatuses,
  };
  const nonZeroBlockReasonCounts = Object.fromEntries(
    Object.entries(blockReasonCounts).filter(([, count]) => count > 0),
  );
  const summary = {
    targetDate: TARGET_DATE,
    historyIndexed: historyIndexStatus.targetDateEntryExists,
    historyDailyExists: historyDailyRead.exists,
    startersSourceExists: startersSourceRead.exists,
    entriesSnapshotExists: entriesSnapshotRead.exists,
    historyRaceCount: historyItems.length,
    startersSourceRaceCount: sourceRaces.length,
    entriesSnapshotRaceCount: entriesRaces.length,
    noStartersRaceCount: historyDailyStatus.noStartersRaceCount,
    exactRaceKeyMatchedCount: join.summary.exactRaceKeyMatchedCount,
    matchedRaceCount: join.summary.matchedRaceCount,
    bridgeEligibleRaceCount: join.summary.bridgeEligibleRaceCount,
    bridgeBlockedRaceCount: join.summary.bridgeBlockedRaceCount,
    candidateStartersNonEmptyRaceCount:
      candidate.summary.candidateStartersNonEmptyRaceCount,
    candidateMissingRegistrationNoCount:
      candidate.summary.candidateMissingRegistrationNoCount,
    candidatePayloadHash: candidate.summary.candidatePayloadHash,
    writeAllowedLater,
    writePerformed: false,
    historyIndexModified: changedDuringRun.includes(HISTORY_INDEX_PATH),
    historyDailyModified: changedDuringRun.includes(HISTORY_DAILY_PATH),
    analyticsSourceModified: changedDuringRun.some((file) =>
      file.startsWith("public/data/analytics/kurari-ex/source/"),
    ),
    racesModified: changedDuringRun.some((file) =>
      file.startsWith("public/data/races/"),
    ),
    fakeCompletionPerformed: false,
    fuzzyMatchingPerformed: false,
    predictionUsedAsStarterSource: false,
    resultUsedAsStarterSource: false,
    lineupUsedAsStarterSource: false,
    registrationNoGenerated: false,
    bridgeSafetyStatus,
    secondaryStatuses,
    blockReasonCounts: nonZeroBlockReasonCounts,
  };
  const nextActionPlan = buildNextActionPlan(writeAllowedLater);
  const jsonSummary = {
    ...summary,
    historyIndexStatus: historyIndexStatus.indexStatus,
    historyDailyStatus: historyDailyStatus.status,
    startersSourceStatus: startersSourceStatus.sourceStatus,
    entriesSnapshotStatus: entriesSnapshotStatus.status,
    candidateSchemaCompatibility:
      candidate.summary.candidateSchemaCompatibility,
    protectedModificationGuard: protectedGuard.guardStatus,
    allBlockReasonCounts: blockReasonCounts,
  };
  return {
    summary,
    historyIndexStatus,
    historyDailyStatus,
    startersSourceStatus,
    entriesSnapshotStatus,
    exactJoinDryRun: join.summary,
    candidateBridgePayload: candidate.summary,
    bridgeSafety,
    protectedModificationGuard: protectedGuard,
    nextActionPlan,
    jsonSummary,
  };
}

async function main() {
  const result = await auditSameDateHistoryStartersBridgeDryRun();
  printSection("summary", result.summary);
  printSection("historyIndexStatus", result.historyIndexStatus);
  printSection("historyDailyStatus", result.historyDailyStatus);
  printSection("startersSourceStatus", result.startersSourceStatus);
  printSection("entriesSnapshotStatus", result.entriesSnapshotStatus);
  printSection("exactJoinDryRun", result.exactJoinDryRun);
  printSection("candidateBridgePayload", result.candidateBridgePayload);
  printSection("bridgeSafety", result.bridgeSafety);
  printSection("protectedModificationGuard", result.protectedModificationGuard);
  printSection("nextActionPlan", result.nextActionPlan);
  printSection("jsonSummary", result.jsonSummary);
  if (
    result.bridgeSafety.bridgeSafetyStatus
      !== "READY_FOR_HISTORY_STARTERS_BRIDGE_WRITE_SAFETY_AUDIT"
    || result.protectedModificationGuard.guardStatus !== "pass"
  ) {
    process.exitCode = 1;
  }
}

const isMain =
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  main().catch((error) => {
    console.error("[kurari-ex same-date history starters bridge dry-run] failed");
    console.error(error);
    process.exitCode = 1;
  });
}
