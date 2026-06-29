import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  SNAPSHOT_ROOT,
  isValidRegistrationNo,
  normalizeText,
  normalizeVenueName,
  toInteger,
  validateSnapshot,
  validateSnapshotIndex,
} from "./lib/kurari-ex-entry-snapshot.mjs";

const ROOT = process.cwd();
const INDEX_PATH = path.join(
  ROOT,
  "public",
  "data",
  "races",
  "entries-history",
  "index.generated.json",
);
const TODAY_PATH = path.join(
  ROOT,
  "public",
  "data",
  "races",
  "today.generated.json",
);
const BRIDGE_VERSION = "kurari-ex-today-rider-bridge/v1-dry-run";
const SOURCE_LABEL = "entries-history-snapshot";
const PREVIEW_RACE_LIMIT = 3;
const PREVIEW_RIDER_LIMIT = 2;

const JOIN_TYPES = [
  "raceId",
  "raceKey",
  "dateVenueKeyRaceNumber",
  "dateVenueNameRaceNumber",
];

const BLOCK_REASON_TAXONOMY = [
  "INDEX_MISSING",
  "INDEX_CHECK_FAILED",
  "INDEX_HASH_MISMATCH",
  "SNAPSHOT_INDEX_ENTRY_MISSING",
  "SNAPSHOT_FILE_MISSING",
  "SNAPSHOT_CHECK_FAILED",
  "SNAPSHOT_HASH_MISMATCH",
  "TODAY_FILE_MISSING",
  "TODAY_DATE_MISSING",
  "TODAY_DATE_AMBIGUOUS",
  "TODAY_SNAPSHOT_DATE_MISMATCH",
  "TODAY_RIDERS_MISSING",
  "RACE_JOIN_KEY_MISSING",
  "ENTRY_MATCH_NOT_FOUND",
  "AMBIGUOUS_ENTRY_MATCH",
  "RIDER_COUNT_MISMATCH",
  "CAR_NO_MISSING",
  "CAR_NO_INVALID",
  "DUPLICATE_CAR_NO",
  "ENTRY_CAR_NO_NOT_IN_TODAY",
  "TODAY_CAR_NO_NOT_IN_ENTRY",
  "REGISTRATION_NO_MISSING",
  "REGISTRATION_NO_INVALID",
  "DUPLICATE_REGISTRATION_NO",
  "NAME_MATCH_REQUIRED_FAKE_PROHIBITED",
  "RESULT_OR_LINEUP_ONLY_SOURCE_PROHIBITED",
];

function relativePath(file) {
  return path.relative(ROOT, file).replaceAll("\\", "/");
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function increment(counter, key, amount = 1) {
  counter[key] = (counter[key] ?? 0) + amount;
}

function determineTodayDate(payload) {
  const rootDate = normalizeText(
    payload?.date ?? payload?.targetDate ?? payload?.raceDate,
  );
  if (/^\d{4}-\d{2}-\d{2}$/.test(rootDate)) {
    return { date: rootDate, reason: null };
  }
  const dates = new Set();
  for (const venue of Array.isArray(payload?.venues) ? payload.venues : []) {
    const venueDate = normalizeText(venue?.date);
    if (/^\d{4}-\d{2}-\d{2}$/.test(venueDate)) dates.add(venueDate);
    for (const race of Array.isArray(venue?.races) ? venue.races : []) {
      const raceDate = normalizeText(race?.date);
      if (/^\d{4}-\d{2}-\d{2}$/.test(raceDate)) dates.add(raceDate);
    }
  }
  if (dates.size === 1) return { date: [...dates][0], reason: null };
  return {
    date: null,
    reason:
      dates.size === 0
        ? "TODAY_DATE_MISSING"
        : "TODAY_DATE_AMBIGUOUS",
  };
}

function flattenTodayRaces(payload, todayDate) {
  const races = [];
  for (const venue of Array.isArray(payload?.venues) ? payload.venues : []) {
    const venueRaces = Array.isArray(venue?.races) ? venue.races : [];
    const raceIds = Array.isArray(venue?.raceIds) ? venue.raceIds : [];
    venueRaces.forEach((race, index) => {
      races.push({
        raceId:
          normalizeText(race?.raceId ?? raceIds[index]) || null,
        raceKey: normalizeText(race?.raceKey) || null,
        date: normalizeText(race?.date ?? venue?.date) || todayDate,
        venueKey:
          normalizeText(
            race?.venueKey ?? race?.slug ?? venue?.venueKey ?? venue?.slug,
          ) || null,
        venueName: normalizeVenueName(
          race?.venueName ??
            race?.venue ??
            venue?.venueName ??
            venue?.venue,
        ),
        raceNumber: toInteger(race?.raceNumber ?? race?.raceNo),
        riders: Array.isArray(race?.riders) ? race.riders : null,
      });
    });
  }
  return races;
}

function joinKey(item, type) {
  if (type === "raceId") return normalizeText(item?.raceId);
  if (type === "raceKey") return normalizeText(item?.raceKey);
  if (type === "dateVenueKeyRaceNumber") {
    return item?.date && item?.venueKey && item?.raceNumber
      ? `${item.date}|${item.venueKey}|${item.raceNumber}`
      : "";
  }
  if (type === "dateVenueNameRaceNumber") {
    return item?.date && item?.venueName && item?.raceNumber
      ? `${item.date}|${normalizeVenueName(item.venueName)}|${item.raceNumber}`
      : "";
  }
  return "";
}

function createSnapshotIndexes(races) {
  return Object.fromEntries(
    JOIN_TYPES.map((type) => {
      const index = new Map();
      for (const race of races) {
        const key = joinKey(race, type);
        if (!key) continue;
        const values = index.get(key) ?? [];
        values.push(race);
        index.set(key, values);
      }
      return [type, index];
    }),
  );
}

function findSnapshotRace(todayRace, indexes) {
  for (const type of JOIN_TYPES) {
    const key = joinKey(todayRace, type);
    if (!key) continue;
    const matches = indexes[type].get(key) ?? [];
    if (matches.length > 0) return { type, matches };
  }
  const hasAnySafeKey = JOIN_TYPES.some(
    (type) => joinKey(todayRace, type).length > 0,
  );
  return {
    type: null,
    matches: [],
    noSafeKey: !hasAnySafeKey,
  };
}

function inspectCarNos(items) {
  const carNos = items.map((item) => toInteger(item?.carNo));
  const missing = carNos.filter((carNo) => carNo === null).length;
  const invalid = carNos.filter(
    (carNo) =>
      carNo !== null && (!Number.isInteger(carNo) || carNo < 1 || carNo > 9),
  ).length;
  const valid = carNos.filter(
    (carNo) => Number.isInteger(carNo) && carNo >= 1 && carNo <= 9,
  );
  return {
    carNos,
    missing,
    invalid,
    duplicate: valid.length - new Set(valid).size,
  };
}

function inspectRegistrations(entries) {
  const values = entries.map((entry) =>
    normalizeText(entry?.registrationNo),
  );
  const missing = values.filter((value) => !value).length;
  const invalid = values.filter(
    (value) => value && !isValidRegistrationNo(value),
  ).length;
  const valid = values.filter(isValidRegistrationNo);
  return {
    values,
    missing,
    invalid,
    duplicate: valid.length - new Set(valid).size,
  };
}

function recordBlock(summary, reason, race, detail) {
  increment(summary.blockReasonCounts, reason);
  if (summary.blockedExamples.length < 5) {
    summary.blockedExamples.push({
      date: race?.date ?? null,
      venue: race?.venueName ?? null,
      raceNumber: race?.raceNumber ?? null,
      reason,
      detail,
    });
  }
}

function buildBridgeCandidates(todayRaces, snapshot, snapshotPath) {
  const indexes = createSnapshotIndexes(snapshot.races);
  const summary = {
    joinKeyUsageCounts: Object.fromEntries(
      JOIN_TYPES.map((type) => [type, 0]),
    ),
    unmatchedTodayRaceCount: 0,
    ambiguousTodayRaceCount: 0,
    matchedTodayRaceCount: 0,
    blockReasonCounts: {},
    bridgeCandidateRaceCount: 0,
    bridgeCandidateRiderCount: 0,
    bridgeFullRaceCount: 0,
    bridgePartialRaceCount: 0,
    bridgeBlockedRaceCount: 0,
    riderRegistrationNoBeforeCount: 0,
    riderRegistrationNoAfterCandidateCount: 0,
    carNoJoinMismatchCount: 0,
    duplicateCarNoCount: 0,
    duplicateRegistrationNoCount: 0,
    registrationNoInvalidCount: 0,
    nameComparedForDisplayOnlyCount: 0,
    nameMismatchDisplayOnlyCount: 0,
    previewFullCandidates: [],
    blockedExamples: [],
  };

  for (const todayRace of todayRaces) {
    const riders = Array.isArray(todayRace.riders)
      ? todayRace.riders
      : [];
    summary.riderRegistrationNoBeforeCount += riders.filter((rider) =>
      isValidRegistrationNo(rider?.registrationNo),
    ).length;

    const match = findSnapshotRace(todayRace, indexes);
    if (match.matches.length === 0) {
      summary.unmatchedTodayRaceCount += 1;
      summary.bridgeBlockedRaceCount += 1;
      recordBlock(
        summary,
        match.noSafeKey
          ? "RACE_JOIN_KEY_MISSING"
          : "ENTRY_MATCH_NOT_FOUND",
        todayRace,
        "no unique snapshot race matched by an allowed key",
      );
      continue;
    }
    summary.matchedTodayRaceCount += 1;
    summary.joinKeyUsageCounts[match.type] += 1;
    if (match.matches.length > 1) {
      summary.ambiguousTodayRaceCount += 1;
      summary.bridgeBlockedRaceCount += 1;
      recordBlock(
        summary,
        "AMBIGUOUS_ENTRY_MATCH",
        todayRace,
        `${match.matches.length} snapshot races matched`,
      );
      continue;
    }
    if (!Array.isArray(todayRace.riders) || riders.length === 0) {
      summary.bridgeBlockedRaceCount += 1;
      recordBlock(
        summary,
        "TODAY_RIDERS_MISSING",
        todayRace,
        "today.riders is missing or empty",
      );
      continue;
    }

    const snapshotRace = match.matches[0];
    const entries = Array.isArray(snapshotRace.entries)
      ? snapshotRace.entries
      : [];
    const todayCars = inspectCarNos(riders);
    const entryCars = inspectCarNos(entries);
    const registrations = inspectRegistrations(entries);
    summary.duplicateCarNoCount +=
      todayCars.duplicate + entryCars.duplicate;
    summary.duplicateRegistrationNoCount += registrations.duplicate;
    summary.registrationNoInvalidCount += registrations.invalid;
    const reasons = [];
    if (riders.length !== entries.length) {
      reasons.push("RIDER_COUNT_MISMATCH");
    }
    if (todayCars.missing + entryCars.missing > 0) {
      reasons.push("CAR_NO_MISSING");
    }
    if (todayCars.invalid + entryCars.invalid > 0) {
      reasons.push("CAR_NO_INVALID");
    }
    if (todayCars.duplicate + entryCars.duplicate > 0) {
      reasons.push("DUPLICATE_CAR_NO");
    }
    if (registrations.missing > 0) {
      reasons.push("REGISTRATION_NO_MISSING");
    }
    if (registrations.invalid > 0) {
      reasons.push("REGISTRATION_NO_INVALID");
    }
    if (registrations.duplicate > 0) {
      reasons.push("DUPLICATE_REGISTRATION_NO");
    }
    const todayOnly = todayCars.carNos.filter(
      (carNo) => !entryCars.carNos.includes(carNo),
    );
    const entryOnly = entryCars.carNos.filter(
      (carNo) => !todayCars.carNos.includes(carNo),
    );
    if (todayOnly.length > 0) {
      reasons.push("TODAY_CAR_NO_NOT_IN_ENTRY");
    }
    if (entryOnly.length > 0) {
      reasons.push("ENTRY_CAR_NO_NOT_IN_TODAY");
    }
    if (todayOnly.length > 0 || entryOnly.length > 0) {
      summary.carNoJoinMismatchCount += 1;
    }

    if (reasons.length > 0) {
      summary.bridgePartialRaceCount += 1;
      summary.bridgeBlockedRaceCount += 1;
      for (const reason of new Set(reasons)) {
        recordBlock(
          summary,
          reason,
          todayRace,
          "rider carNo/registrationNo validation failed",
        );
      }
      continue;
    }

    const entryByCarNo = new Map(
      entries.map((entry) => [toInteger(entry.carNo), entry]),
    );
    const enrichedRiders = riders.map((rider) => {
      const entry = entryByCarNo.get(toInteger(rider.carNo));
      summary.nameComparedForDisplayOnlyCount += 1;
      if (
        normalizeText(rider?.name) !== normalizeText(entry?.name)
      ) {
        summary.nameMismatchDisplayOnlyCount += 1;
      }
      return {
        carNo: toInteger(rider.carNo),
        name: normalizeText(rider.name),
        registrationNo: entry.registrationNo,
        registrationNoSource: SOURCE_LABEL,
        registrationNoSourceDate: snapshot.date,
        registrationNoSourcePath: relativePath(snapshotPath),
        registrationNoSourceHash: snapshot.contentHash,
      };
    });

    summary.bridgeCandidateRaceCount += 1;
    summary.bridgeCandidateRiderCount += enrichedRiders.length;
    summary.bridgeFullRaceCount += 1;
    summary.riderRegistrationNoAfterCandidateCount +=
      enrichedRiders.length;

    if (
      summary.previewFullCandidates.length < PREVIEW_RACE_LIMIT
    ) {
      summary.previewFullCandidates.push({
        date: todayRace.date,
        venueName: todayRace.venueName,
        raceNumber: todayRace.raceNumber,
        joinKeyType: match.type,
        riderCount: enrichedRiders.length,
        sourceSnapshotPath: relativePath(snapshotPath),
        sourceSnapshotContentHash: snapshot.contentHash,
        bridgeVersion: BRIDGE_VERSION,
        riders: enrichedRiders.slice(0, PREVIEW_RIDER_LIMIT),
        omittedRiderCount: Math.max(
          0,
          enrichedRiders.length - PREVIEW_RIDER_LIMIT,
        ),
        quality: {
          bridgeStatus: "FULL",
          carNoJoinComplete: true,
          registrationComplete: true,
          carNoUnique: true,
          registrationNoUnique: true,
          sourceSnapshotValidated: true,
          blockedReasons: [],
        },
      });
    }
  }
  return summary;
}

function evaluateReadiness(context) {
  const checks = [
    {
      label: "index validation PASS",
      passed: context.indexCheckStatus === "PASS",
    },
    {
      label: "snapshot validation PASS",
      passed: context.snapshotCheckStatus === "PASS",
    },
    {
      label: "todayDate === snapshotDate",
      passed: context.todayDate === context.snapshotDate,
    },
    {
      label: "matchedTodayRaceCount === todayRaceCount",
      passed:
        context.matchedTodayRaceCount === context.todayRaceCount,
    },
    {
      label: "bridgeFullRaceCount === todayRaceCount",
      passed: context.bridgeFullRaceCount === context.todayRaceCount,
    },
    {
      label: "bridgeBlockedRaceCount === 0",
      passed: context.bridgeBlockedRaceCount === 0,
    },
    {
      label:
        "riderRegistrationNoAfterCandidateCount > riderRegistrationNoBeforeCount",
      passed:
        context.riderRegistrationNoAfterCandidateCount >
        context.riderRegistrationNoBeforeCount,
    },
    { label: "fakeCompletionPerformed === false", passed: true },
    { label: "fuzzyMatchingPerformed === false", passed: true },
    {
      label:
        "resultLineupPredictionUsedAsStarterSource === false",
      passed: true,
    },
    { label: "writesPerformed === false", passed: true },
  ];
  const passedChecks = checks
    .filter((check) => check.passed)
    .map((check) => check.label);
  const failedChecks = checks
    .filter((check) => !check.passed)
    .map((check) => check.label);
  return {
    status:
      failedChecks.length === 0
        ? "READY_FOR_TODAY_RIDERS_WRITE_IMPLEMENTATION"
        : "BLOCKED",
    passedChecks,
    failedChecks,
    nextRecommendedAction:
      failedChecks.length === 0
        ? "today更新前に、snapshot検証・carNo join・既存registrationNo保護・atomic current-feed writeを含む最小実装設計へ進む。"
        : "failedChecksのindex/snapshot/join原因を修正し、writeなしdry-runを再実行する。",
  };
}

function printSection(label, value) {
  console.log(`\n[${label}]`);
  console.log(JSON.stringify(value, null, 2));
}

async function main() {
  const startupBlocks = {};
  if (!existsSync(INDEX_PATH)) {
    increment(startupBlocks, "INDEX_MISSING");
  }
  if (!existsSync(TODAY_PATH)) {
    increment(startupBlocks, "TODAY_FILE_MISSING");
  }
  if (Object.keys(startupBlocks).length > 0) {
    throw new Error(
      `required input missing: ${Object.keys(startupBlocks).join(", ")}`,
    );
  }

  const [index, today] = await Promise.all([
    readJson(INDEX_PATH),
    readJson(TODAY_PATH),
  ]);
  const indexValidation = await validateSnapshotIndex(ROOT, index);
  if (indexValidation.checkStatus !== "PASS") {
    throw new Error(
      `index validation failed: ${indexValidation.failedReasons.join(", ")}`,
    );
  }
  if (!indexValidation.hashMatched) {
    throw new Error("index hash mismatch");
  }

  const todayDateResult = determineTodayDate(today);
  if (!todayDateResult.date) {
    throw new Error(todayDateResult.reason);
  }
  const todayDate = todayDateResult.date;
  const indexMatches = index.snapshots.filter(
    (entry) => entry.date === todayDate,
  );
  if (indexMatches.length !== 1) {
    throw new Error(
      indexMatches.length === 0
        ? "SNAPSHOT_INDEX_ENTRY_MISSING"
        : "AMBIGUOUS_ENTRY_MATCH",
    );
  }

  const indexEntry = indexMatches[0];
  const snapshotRoot = path.resolve(ROOT, SNAPSHOT_ROOT);
  const snapshotPath = path.resolve(ROOT, indexEntry.path);
  if (
    !snapshotPath.startsWith(`${snapshotRoot}${path.sep}`) ||
    !existsSync(snapshotPath)
  ) {
    throw new Error("SNAPSHOT_FILE_MISSING");
  }
  const snapshot = await readJson(snapshotPath);
  const snapshotValidation = validateSnapshot(snapshot);
  if (snapshotValidation.checkStatus !== "PASS") {
    throw new Error(
      `snapshot validation failed: ${snapshotValidation.failedReasons.join(", ")}`,
    );
  }
  if (
    !snapshotValidation.hashMatched ||
    snapshot.contentHash !== indexEntry.contentHash
  ) {
    throw new Error("SNAPSHOT_HASH_MISMATCH");
  }
  if (snapshot.date !== todayDate) {
    throw new Error("TODAY_SNAPSHOT_DATE_MISMATCH");
  }
  if (
    snapshot.summary.raceCount !== 64 ||
    snapshot.summary.riderCount !== 464 ||
    snapshot.summary.fullRegistrationRaceCount !== 64 ||
    snapshot.summary.blockedRaceCount !== 0
  ) {
    throw new Error("snapshot summary does not match the validated baseline");
  }

  const todayRaces = flattenTodayRaces(today, todayDate);
  const todayRiderRaces = todayRaces.filter(
    (race) => Array.isArray(race.riders) && race.riders.length > 0,
  );
  const todayRiderCount = todayRiderRaces.reduce(
    (total, race) => total + race.riders.length,
    0,
  );
  const bridge = buildBridgeCandidates(
    todayRaces,
    snapshot,
    snapshotPath,
  );
  const context = {
    indexPath: relativePath(INDEX_PATH),
    snapshotPath: relativePath(snapshotPath),
    todayPath: relativePath(TODAY_PATH),
    indexCheckStatus: indexValidation.checkStatus,
    snapshotCheckStatus: snapshotValidation.checkStatus,
    todayDate,
    snapshotDate: snapshot.date,
    todayRaceCount: todayRaces.length,
    todayRiderRaceCount: todayRiderRaces.length,
    todayRiderCount,
    todayRidersWithRegistrationNoBeforeCount:
      bridge.riderRegistrationNoBeforeCount,
    ...bridge,
    writesPerformed: false,
    snapshotModified: false,
    indexModified: false,
    todayModified: false,
    historyModified: false,
    analyticsModified: false,
    reviewsModified: false,
    fakeCompletionPerformed: false,
    fuzzyMatchingPerformed: false,
    resultLineupPredictionUsedAsStarterSource: false,
    blockedReasonTaxonomy: BLOCK_REASON_TAXONOMY,
  };
  const todayBridgeReadiness = evaluateReadiness(context);
  const summary = { ...context, todayBridgeReadiness };

  console.log("[kurari-ex snapshot -> today.riders bridge dry-run]");
  console.log("\n[summary]");
  const scalarKeys = [
    "indexPath",
    "snapshotPath",
    "todayPath",
    "indexCheckStatus",
    "snapshotCheckStatus",
    "todayDate",
    "snapshotDate",
    "todayRaceCount",
    "todayRiderCount",
    "todayRidersWithRegistrationNoBeforeCount",
    "matchedTodayRaceCount",
    "bridgeFullRaceCount",
    "bridgeBlockedRaceCount",
    "riderRegistrationNoAfterCandidateCount",
  ];
  for (const key of scalarKeys) console.log(`${key}: ${summary[key]}`);
  console.log(
    `joinKeyUsageCounts: ${JSON.stringify(summary.joinKeyUsageCounts)}`,
  );
  console.log(
    `blockReasonCounts: ${JSON.stringify(summary.blockReasonCounts)}`,
  );
  console.log(
    `todayBridgeReadiness: ${todayBridgeReadiness.status}`,
  );
  for (const key of [
    "writesPerformed",
    "snapshotModified",
    "indexModified",
    "todayModified",
    "historyModified",
    "analyticsModified",
    "reviewsModified",
    "fakeCompletionPerformed",
    "fuzzyMatchingPerformed",
    "resultLineupPredictionUsedAsStarterSource",
  ]) {
    console.log(`${key}: ${summary[key]}`);
  }
  printSection(
    "previewFullCandidates",
    summary.previewFullCandidates,
  );
  printSection("jsonSummary", summary);
}

main().catch((error) => {
  console.error(
    "[kurari-ex snapshot -> today.riders bridge dry-run] BLOCKED",
  );
  console.error(error);
  process.exitCode = 1;
});
