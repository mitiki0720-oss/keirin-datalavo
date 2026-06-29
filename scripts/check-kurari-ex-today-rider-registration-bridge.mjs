import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
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
const INDEX_RELATIVE_PATH =
  "public/data/races/entries-history/index.generated.json";
const TODAY_RELATIVE_PATH = "public/data/races/today.generated.json";
const BRIDGE_VERSION = "kurari-ex-today-rider-bridge/v1";
const SOURCE_LABEL = "entries-history-snapshot";
const JOIN_TYPES = [
  "raceId",
  "raceKey",
  "dateVenueKeyRaceNumber",
  "dateVenueNameRaceNumber",
];

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function determineTodayDate(payload) {
  const rootDate = normalizeText(
    payload?.date ?? payload?.targetDate ?? payload?.raceDate,
  );
  if (/^\d{4}-\d{2}-\d{2}$/.test(rootDate)) return rootDate;
  const dates = new Set();
  for (const venue of Array.isArray(payload?.venues) ? payload.venues : []) {
    const venueDate = normalizeText(venue?.date);
    if (/^\d{4}-\d{2}-\d{2}$/.test(venueDate)) dates.add(venueDate);
    for (const race of Array.isArray(venue?.races) ? venue.races : []) {
      const raceDate = normalizeText(race?.date);
      if (/^\d{4}-\d{2}-\d{2}$/.test(raceDate)) dates.add(raceDate);
    }
  }
  return dates.size === 1 ? [...dates][0] : null;
}

function flattenTodayRaces(payload, date) {
  const races = [];
  for (const venue of Array.isArray(payload?.venues) ? payload.venues : []) {
    const venueRaces = Array.isArray(venue?.races) ? venue.races : [];
    const raceIds = Array.isArray(venue?.raceIds) ? venue.raceIds : [];
    venueRaces.forEach((race, index) => {
      races.push({
        raceId:
          normalizeText(race?.raceId ?? raceIds[index]) || null,
        raceKey: normalizeText(race?.raceKey) || null,
        date: normalizeText(race?.date ?? venue?.date) || date,
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
        riders: Array.isArray(race?.riders) ? race.riders : [],
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

function createIndexes(races) {
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

function findMatch(race, indexes) {
  for (const type of JOIN_TYPES) {
    const key = joinKey(race, type);
    if (!key) continue;
    const matches = indexes[type].get(key) ?? [];
    if (matches.length > 0) return { type, matches };
  }
  return { type: null, matches: [] };
}

function metadataExpected(snapshot, snapshotPath) {
  return {
    registrationNoSource: SOURCE_LABEL,
    registrationNoSourceDate: snapshot.date,
    registrationNoSourcePath: snapshotPath,
    registrationNoSourceHash: snapshot.contentHash,
    registrationNoBridgeVersion: BRIDGE_VERSION,
  };
}

function validateRootMetadata(today, snapshot, snapshotPath, joinCounts) {
  const expected = {
    bridgeVersion: BRIDGE_VERSION,
    status: "FULL",
    source: SOURCE_LABEL,
    sourceDate: snapshot.date,
    sourcePath: snapshotPath,
    sourceHash: snapshot.contentHash,
    joinedBy: joinCounts,
    raceCount: snapshot.summary.raceCount,
    riderCount: snapshot.summary.riderCount,
    blockedRaceCount: 0,
    fakeCompletionPerformed: false,
    fuzzyMatchingPerformed: false,
    resultLineupPredictionUsedAsStarterSource: false,
  };
  return {
    expected,
    matched:
      JSON.stringify(today?.kurariExRiderRegistrationBridge) ===
      JSON.stringify(expected),
  };
}

export async function checkTodayRiderRegistrationBridge(
  root = process.cwd(),
) {
  const indexPath = path.resolve(root, INDEX_RELATIVE_PATH);
  const todayPath = path.resolve(root, TODAY_RELATIVE_PATH);
  const failedReasons = [];
  if (!existsSync(indexPath)) failedReasons.push("INDEX_MISSING");
  if (!existsSync(todayPath)) failedReasons.push("TODAY_FILE_MISSING");
  if (failedReasons.length > 0) {
    return { checkStatus: "FAIL", failedReasons };
  }

  const [index, today] = await Promise.all([
    readJson(indexPath),
    readJson(todayPath),
  ]);
  const indexValidation = await validateSnapshotIndex(root, index);
  if (indexValidation.checkStatus !== "PASS") {
    failedReasons.push("INDEX_CHECK_FAILED");
  }
  const todayDate = determineTodayDate(today);
  if (!todayDate) failedReasons.push("TODAY_DATE_INVALID");
  const indexEntries = index.snapshots.filter(
    (entry) => entry.date === todayDate,
  );
  if (indexEntries.length !== 1) {
    failedReasons.push("SNAPSHOT_INDEX_ENTRY_NOT_UNIQUE");
  }

  const indexEntry = indexEntries[0];
  const snapshotRoot = path.resolve(root, SNAPSHOT_ROOT);
  const snapshotPath = indexEntry
    ? path.resolve(root, indexEntry.path)
    : "";
  if (
    !snapshotPath ||
    !snapshotPath.startsWith(`${snapshotRoot}${path.sep}`) ||
    !existsSync(snapshotPath)
  ) {
    failedReasons.push("SNAPSHOT_FILE_MISSING");
  }
  if (failedReasons.length > 0) {
    return {
      checkStatus: "FAIL",
      todayDate,
      failedReasons: [...new Set(failedReasons)],
    };
  }

  const snapshot = await readJson(snapshotPath);
  const snapshotValidation = validateSnapshot(snapshot);
  if (snapshotValidation.checkStatus !== "PASS") {
    failedReasons.push("SNAPSHOT_CHECK_FAILED");
  }
  if (
    !snapshotValidation.hashMatched ||
    snapshot.contentHash !== indexEntry.contentHash
  ) {
    failedReasons.push("SNAPSHOT_HASH_MISMATCH");
  }
  if (snapshot.date !== todayDate) {
    failedReasons.push("TODAY_SNAPSHOT_DATE_MISMATCH");
  }

  const todayRaces = flattenTodayRaces(today, todayDate);
  const indexes = createIndexes(snapshot.races);
  const joinKeyUsageCounts = Object.fromEntries(
    JOIN_TYPES.map((type) => [type, 0]),
  );
  let todayRiderCount = 0;
  let todayRidersWithRegistrationNoCount = 0;
  let matchedTodayRaceCount = 0;
  let bridgeFullRaceCount = 0;
  let bridgeBlockedRaceCount = 0;
  let registrationNoMatchedCount = 0;
  let registrationNoMissingCount = 0;
  let registrationNoMismatchCount = 0;
  let registrationNoInvalidCount = 0;
  let sourceMetadataMatchedCount = 0;
  let sourceMetadataMissingCount = 0;
  let sourceMetadataMismatchCount = 0;
  let nameMismatchDisplayOnlyCount = 0;

  const sourcePath = path
    .relative(root, snapshotPath)
    .replaceAll("\\", "/");
  const expectedMetadata = metadataExpected(snapshot, sourcePath);

  for (const todayRace of todayRaces) {
    todayRiderCount += todayRace.riders.length;
    const match = findMatch(todayRace, indexes);
    if (match.matches.length !== 1) {
      bridgeBlockedRaceCount += 1;
      failedReasons.push(
        match.matches.length === 0
          ? "ENTRY_MATCH_NOT_FOUND"
          : "AMBIGUOUS_ENTRY_MATCH",
      );
      continue;
    }
    matchedTodayRaceCount += 1;
    joinKeyUsageCounts[match.type] += 1;
    const entries = match.matches[0].entries;
    if (todayRace.riders.length !== entries.length) {
      bridgeBlockedRaceCount += 1;
      failedReasons.push("RIDER_COUNT_MISMATCH");
      continue;
    }
    const entryByCarNo = new Map(
      entries.map((entry) => [toInteger(entry.carNo), entry]),
    );
    let raceFull = true;
    for (const rider of todayRace.riders) {
      const entry = entryByCarNo.get(toInteger(rider?.carNo));
      if (!entry) {
        raceFull = false;
        failedReasons.push("CAR_NO_JOIN_MISMATCH");
        continue;
      }
      const actualRegistration = normalizeText(rider?.registrationNo);
      if (!actualRegistration) {
        registrationNoMissingCount += 1;
        raceFull = false;
      } else {
        todayRidersWithRegistrationNoCount += 1;
        if (!isValidRegistrationNo(actualRegistration)) {
          registrationNoInvalidCount += 1;
          raceFull = false;
        } else if (
          actualRegistration !== normalizeText(entry.registrationNo)
        ) {
          registrationNoMismatchCount += 1;
          raceFull = false;
        } else {
          registrationNoMatchedCount += 1;
        }
      }
      const metadataFields = Object.keys(expectedMetadata);
      const presentCount = metadataFields.filter(
        (key) => rider?.[key] !== undefined,
      ).length;
      if (presentCount === 0) {
        sourceMetadataMissingCount += 1;
        raceFull = false;
      } else if (
        metadataFields.every(
          (key) => rider?.[key] === expectedMetadata[key],
        )
      ) {
        sourceMetadataMatchedCount += 1;
      } else {
        sourceMetadataMismatchCount += 1;
        raceFull = false;
      }
      if (
        normalizeText(rider?.name) !== normalizeText(entry?.name)
      ) {
        nameMismatchDisplayOnlyCount += 1;
      }
    }
    if (raceFull) bridgeFullRaceCount += 1;
    else bridgeBlockedRaceCount += 1;
  }

  const rootMetadata = validateRootMetadata(
    today,
    snapshot,
    sourcePath,
    joinKeyUsageCounts,
  );
  if (!rootMetadata.matched) {
    failedReasons.push("ROOT_BRIDGE_METADATA_MISMATCH");
  }
  if (registrationNoMissingCount > 0) {
    failedReasons.push("REGISTRATION_NO_MISSING");
  }
  if (registrationNoMismatchCount > 0) {
    failedReasons.push("REGISTRATION_NO_MISMATCH");
  }
  if (registrationNoInvalidCount > 0) {
    failedReasons.push("REGISTRATION_NO_INVALID");
  }
  if (sourceMetadataMissingCount > 0) {
    failedReasons.push("SOURCE_METADATA_MISSING");
  }
  if (sourceMetadataMismatchCount > 0) {
    failedReasons.push("SOURCE_METADATA_MISMATCH");
  }
  if (bridgeFullRaceCount !== todayRaces.length) {
    failedReasons.push("BRIDGE_NOT_FULL");
  }

  return {
    checkStatus: failedReasons.length === 0 ? "PASS" : "FAIL",
    indexCheckStatus: indexValidation.checkStatus,
    snapshotCheckStatus: snapshotValidation.checkStatus,
    todayDate,
    snapshotDate: snapshot.date,
    todayRaceCount: todayRaces.length,
    todayRiderCount,
    todayRidersWithRegistrationNoCount,
    matchedTodayRaceCount,
    joinKeyUsageCounts,
    bridgeFullRaceCount,
    bridgeBlockedRaceCount,
    registrationNoMatchedCount,
    registrationNoMissingCount,
    registrationNoMismatchCount,
    registrationNoInvalidCount,
    sourceMetadataMatchedCount,
    sourceMetadataMissingCount,
    sourceMetadataMismatchCount,
    nameMismatchDisplayOnlyCount,
    rootMetadataMatched: rootMetadata.matched,
    fakeCompletionPerformed: false,
    fuzzyMatchingPerformed: false,
    resultLineupPredictionUsedAsStarterSource: false,
    failedReasons: [...new Set(failedReasons)],
  };
}

function printResult(result) {
  console.log("[kurari-ex today rider registration bridge check]");
  for (const key of [
    "checkStatus",
    "indexCheckStatus",
    "snapshotCheckStatus",
    "todayDate",
    "snapshotDate",
    "todayRaceCount",
    "todayRiderCount",
    "todayRidersWithRegistrationNoCount",
    "registrationNoMatchedCount",
    "registrationNoMissingCount",
    "registrationNoMismatchCount",
    "registrationNoInvalidCount",
    "sourceMetadataMatchedCount",
    "sourceMetadataMissingCount",
    "sourceMetadataMismatchCount",
    "bridgeFullRaceCount",
    "bridgeBlockedRaceCount",
  ]) {
    console.log(`${key}: ${result[key] ?? null}`);
  }
  console.log(
    `joinKeyUsageCounts: ${JSON.stringify(result.joinKeyUsageCounts ?? {})}`,
  );
  console.log(`failedReasons: ${JSON.stringify(result.failedReasons)}`);
}

async function main() {
  const result = await checkTodayRiderRegistrationBridge(ROOT);
  printResult(result);
  if (result.checkStatus !== "PASS") process.exitCode = 1;
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  main().catch((error) => {
    console.error(
      "[kurari-ex today rider registration bridge check] failed",
    );
    console.error(error);
    process.exitCode = 1;
  });
}
