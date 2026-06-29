import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  SNAPSHOT_ROOT,
  atomicWriteJson,
  isValidRegistrationNo,
  normalizeText,
  normalizeVenueName,
  toInteger,
  validateSnapshot,
  validateSnapshotIndex,
} from "./lib/kurari-ex-entry-snapshot.mjs";
import { checkTodayRiderRegistrationBridge } from "./check-kurari-ex-today-rider-registration-bridge.mjs";

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

function relativePath(file) {
  return path.relative(ROOT, file).replaceAll("\\", "/");
}

function determineTodayDate(today) {
  const rootDate = normalizeText(
    today?.date ?? today?.targetDate ?? today?.raceDate,
  );
  if (/^\d{4}-\d{2}-\d{2}$/.test(rootDate)) return rootDate;
  const dates = new Set();
  for (const venue of Array.isArray(today?.venues) ? today.venues : []) {
    const venueDate = normalizeText(venue?.date);
    if (/^\d{4}-\d{2}-\d{2}$/.test(venueDate)) dates.add(venueDate);
    for (const race of Array.isArray(venue?.races) ? venue.races : []) {
      const raceDate = normalizeText(race?.date);
      if (/^\d{4}-\d{2}-\d{2}$/.test(raceDate)) dates.add(raceDate);
    }
  }
  return dates.size === 1 ? [...dates][0] : null;
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

function todayRaceIdentity(today, venue, race, index, date) {
  const raceIds = Array.isArray(venue?.raceIds) ? venue.raceIds : [];
  return {
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
  };
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

function findMatch(identity, indexes) {
  for (const type of JOIN_TYPES) {
    const key = joinKey(identity, type);
    if (!key) continue;
    const matches = indexes[type].get(key) ?? [];
    if (matches.length > 0) return { type, matches };
  }
  return { type: null, matches: [] };
}

function expectedRiderMetadata(snapshot, snapshotPath) {
  return {
    registrationNoSource: SOURCE_LABEL,
    registrationNoSourceDate: snapshot.date,
    registrationNoSourcePath: snapshotPath,
    registrationNoSourceHash: snapshot.contentHash,
    registrationNoBridgeVersion: BRIDGE_VERSION,
  };
}

function rootMetadata(snapshot, snapshotPath, joinCounts) {
  return {
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
}

function buildCandidate(today, snapshot, snapshotPath) {
  const date = determineTodayDate(today);
  const indexes = createSnapshotIndexes(snapshot.races);
  const joinKeyUsageCounts = Object.fromEntries(
    JOIN_TYPES.map((type) => [type, 0]),
  );
  const blockReasonCounts = {};
  const block = (reason) => {
    blockReasonCounts[reason] = (blockReasonCounts[reason] ?? 0) + 1;
  };
  const counts = {
    todayRaceCount: 0,
    todayRiderCount: 0,
    todayRidersWithRegistrationNoBeforeCount: 0,
    todayRidersWithRegistrationNoAfterCount: 0,
    matchedTodayRaceCount: 0,
    bridgeFullRaceCount: 0,
    bridgeBlockedRaceCount: 0,
    registrationNoAddedCount: 0,
    registrationNoPreservedCount: 0,
    registrationNoMismatchCount: 0,
    sourceMetadataAddedCount: 0,
    sourceMetadataPreservedCount: 0,
    sourceMetadataMismatchCount: 0,
    nameMismatchDisplayOnlyCount: 0,
  };
  const expectedMetadata = expectedRiderMetadata(snapshot, snapshotPath);

  const venues = (Array.isArray(today?.venues) ? today.venues : []).map(
    (venue) => ({
      ...venue,
      races: (Array.isArray(venue?.races) ? venue.races : []).map(
        (race, raceIndex) => {
          counts.todayRaceCount += 1;
          const identity = todayRaceIdentity(
            today,
            venue,
            race,
            raceIndex,
            date,
          );
          const riders = Array.isArray(race?.riders) ? race.riders : [];
          counts.todayRiderCount += riders.length;
          counts.todayRidersWithRegistrationNoBeforeCount += riders.filter(
            (rider) => isValidRegistrationNo(rider?.registrationNo),
          ).length;
          const match = findMatch(identity, indexes);
          if (match.matches.length !== 1) {
            counts.bridgeBlockedRaceCount += 1;
            block(
              match.matches.length === 0
                ? "ENTRY_MATCH_NOT_FOUND"
                : "AMBIGUOUS_ENTRY_MATCH",
            );
            return race;
          }
          counts.matchedTodayRaceCount += 1;
          joinKeyUsageCounts[match.type] += 1;
          const entries = match.matches[0].entries;
          if (riders.length === 0) {
            counts.bridgeBlockedRaceCount += 1;
            block("TODAY_RIDERS_MISSING");
            return race;
          }
          if (riders.length !== entries.length) {
            counts.bridgeBlockedRaceCount += 1;
            block("RIDER_COUNT_MISMATCH");
            return race;
          }
          const entryByCarNo = new Map(
            entries.map((entry) => [toInteger(entry?.carNo), entry]),
          );
          const todayCarNos = riders.map((rider) =>
            toInteger(rider?.carNo),
          );
          if (
            todayCarNos.some(
              (carNo) =>
                !Number.isInteger(carNo) || carNo < 1 || carNo > 9,
            ) ||
            new Set(todayCarNos).size !== todayCarNos.length ||
            entries.some(
              (entry) => !entryByCarNo.has(toInteger(entry?.carNo)),
            )
          ) {
            counts.bridgeBlockedRaceCount += 1;
            block("CAR_NO_INVALID_OR_DUPLICATE");
            return race;
          }

          let raceBlocked = false;
          const nextRiders = riders.map((rider) => {
            const entry = entryByCarNo.get(toInteger(rider?.carNo));
            if (!entry) {
              raceBlocked = true;
              block("CAR_NO_JOIN_MISMATCH");
              return rider;
            }
            const sourceRegistration = normalizeText(
              entry?.registrationNo,
            );
            if (!isValidRegistrationNo(sourceRegistration)) {
              raceBlocked = true;
              block("REGISTRATION_NO_INVALID");
              return rider;
            }
            const existingRegistration = normalizeText(
              rider?.registrationNo,
            );
            if (existingRegistration) {
              if (
                !isValidRegistrationNo(existingRegistration) ||
                existingRegistration !== sourceRegistration
              ) {
                raceBlocked = true;
                counts.registrationNoMismatchCount += 1;
                block("EXISTING_REGISTRATION_NO_MISMATCH");
                return rider;
              }
              counts.registrationNoPreservedCount += 1;
            } else {
              counts.registrationNoAddedCount += 1;
            }

            const metadataKeys = Object.keys(expectedMetadata);
            const presentKeys = metadataKeys.filter(
              (key) => rider?.[key] !== undefined,
            );
            if (
              presentKeys.some(
                (key) => rider?.[key] !== expectedMetadata[key],
              )
            ) {
              raceBlocked = true;
              counts.sourceMetadataMismatchCount += 1;
              block("EXISTING_SOURCE_METADATA_MISMATCH");
              return rider;
            }
            if (presentKeys.length === metadataKeys.length) {
              counts.sourceMetadataPreservedCount += 1;
            } else {
              counts.sourceMetadataAddedCount += 1;
            }
            if (
              normalizeText(rider?.name) !==
              normalizeText(entry?.name)
            ) {
              counts.nameMismatchDisplayOnlyCount += 1;
            }
            return {
              ...rider,
              registrationNo: sourceRegistration,
              ...expectedMetadata,
            };
          });

          if (raceBlocked) {
            counts.bridgeBlockedRaceCount += 1;
            return race;
          }
          counts.bridgeFullRaceCount += 1;
          counts.todayRidersWithRegistrationNoAfterCount +=
            nextRiders.length;
          return { ...race, riders: nextRiders };
        },
      ),
    }),
  );

  const expectedRootMetadata = rootMetadata(
    snapshot,
    snapshotPath,
    joinKeyUsageCounts,
  );
  const existingRootMetadata =
    today?.kurariExRiderRegistrationBridge;
  if (
    existingRootMetadata !== undefined &&
    JSON.stringify(existingRootMetadata) !==
      JSON.stringify(expectedRootMetadata)
  ) {
    block("EXISTING_ROOT_BRIDGE_METADATA_MISMATCH");
  }
  const blocked = Object.keys(blockReasonCounts).length > 0;
  return {
    candidate: blocked
      ? today
      : {
          ...today,
          venues,
          kurariExRiderRegistrationBridge: expectedRootMetadata,
        },
    counts,
    joinKeyUsageCounts,
    blockReasonCounts,
    blocked,
    todayDate: date,
  };
}

function printResult(context) {
  console.log("[kurari-ex today rider registration writer]");
  for (const key of [
    "indexPath",
    "snapshotPath",
    "todayPath",
    "todayDate",
    "snapshotDate",
    "todayRaceCount",
    "todayRiderCount",
    "todayRidersWithRegistrationNoBeforeCount",
    "todayRidersWithRegistrationNoAfterCount",
    "matchedTodayRaceCount",
    "bridgeFullRaceCount",
    "bridgeBlockedRaceCount",
    "registrationNoAddedCount",
    "registrationNoPreservedCount",
    "registrationNoMismatchCount",
    "sourceMetadataAddedCount",
    "sourceMetadataPreservedCount",
    "sourceMetadataMismatchCount",
  ]) {
    console.log(`${key}: ${context[key]}`);
  }
  console.log(
    `joinKeyUsageCounts: ${JSON.stringify(context.joinKeyUsageCounts)}`,
  );
  console.log(
    `blockReasonCounts: ${JSON.stringify(context.blockReasonCounts)}`,
  );
  console.log("targetAlreadyExists: true");
  console.log(`writeStatus: ${context.writeStatus}`);
  console.log(
    `noWriteNeeded: ${context.writeStatus === "NO_WRITE_NEEDED"}`,
  );
  console.log(`todayModified: ${context.todayModified}`);
  console.log(`writesPerformed: ${context.writesPerformed}`);
  console.log("fakeCompletionPerformed: false");
  console.log("fuzzyMatchingPerformed: false");
  console.log("resultLineupPredictionUsedAsStarterSource: false");
}

async function main() {
  if (!existsSync(INDEX_PATH) || !existsSync(TODAY_PATH)) {
    throw new Error("INDEX_MISSING or TODAY_FILE_MISSING");
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
  const todayDate = determineTodayDate(today);
  if (!todayDate) throw new Error("TODAY_DATE_INVALID");
  const indexEntries = index.snapshots.filter(
    (entry) => entry.date === todayDate,
  );
  if (indexEntries.length !== 1) {
    throw new Error("SNAPSHOT_INDEX_ENTRY_NOT_UNIQUE");
  }
  const indexEntry = indexEntries[0];
  const snapshotRoot = path.resolve(ROOT, SNAPSHOT_ROOT);
  const snapshotAbsolutePath = path.resolve(ROOT, indexEntry.path);
  if (
    !snapshotAbsolutePath.startsWith(`${snapshotRoot}${path.sep}`) ||
    !existsSync(snapshotAbsolutePath)
  ) {
    throw new Error("SNAPSHOT_FILE_MISSING");
  }
  const snapshot = await readJson(snapshotAbsolutePath);
  const snapshotValidation = validateSnapshot(snapshot);
  if (
    snapshotValidation.checkStatus !== "PASS" ||
    !snapshotValidation.hashMatched ||
    snapshot.contentHash !== indexEntry.contentHash
  ) {
    throw new Error("SNAPSHOT_VALIDATION_FAILED");
  }
  if (
    snapshot.date !== todayDate ||
    snapshot.summary.raceCount <= 0 ||
    snapshot.summary.riderCount <= 0 ||
    snapshot.summary.fullRegistrationRaceCount !==
      snapshot.summary.raceCount ||
    snapshot.summary.blockedRaceCount !== 0
  ) {
    throw new Error("SNAPSHOT_NOT_FULL_OR_DATE_MISMATCH");
  }

  const snapshotPath = relativePath(snapshotAbsolutePath);
  const build = buildCandidate(today, snapshot, snapshotPath);
  const context = {
    indexPath: relativePath(INDEX_PATH),
    snapshotPath,
    todayPath: relativePath(TODAY_PATH),
    todayDate,
    snapshotDate: snapshot.date,
    ...build.counts,
    joinKeyUsageCounts: build.joinKeyUsageCounts,
    blockReasonCounts: build.blockReasonCounts,
    writeStatus: "BLOCKED",
    todayModified: false,
    writesPerformed: false,
  };
  if (build.blocked) {
    printResult(context);
    process.exitCode = 1;
    return;
  }
  if (
    build.counts.matchedTodayRaceCount !==
      build.counts.todayRaceCount ||
    build.counts.bridgeFullRaceCount !==
      build.counts.todayRaceCount ||
    build.counts.bridgeBlockedRaceCount !== 0 ||
    build.counts.todayRidersWithRegistrationNoAfterCount !==
      build.counts.todayRiderCount
  ) {
    context.blockReasonCounts.FINAL_COMPLETENESS_CHECK_FAILED = 1;
    printResult(context);
    process.exitCode = 1;
    return;
  }

  if (JSON.stringify(today) === JSON.stringify(build.candidate)) {
    context.writeStatus = "NO_WRITE_NEEDED";
    printResult(context);
    return;
  }

  await atomicWriteJson(TODAY_PATH, build.candidate);
  context.writeStatus = "WRITTEN";
  context.todayModified = true;
  context.writesPerformed = true;
  const postWrite = await checkTodayRiderRegistrationBridge(ROOT);
  if (postWrite.checkStatus !== "PASS") {
    printResult(context);
    throw new Error(
      `post-write validation failed: ${postWrite.failedReasons.join(", ")}`,
    );
  }
  printResult(context);
}

main().catch((error) => {
  console.error("[kurari-ex today rider registration writer] failed");
  console.error(error);
  process.exitCode = 1;
});
