import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { checkTodayRiderRegistrationBridge } from "./check-kurari-ex-today-rider-registration-bridge.mjs";
import {
  isValidRegistrationNo,
  normalizeText,
  normalizeVenueName,
  toInteger,
  validateSnapshot,
  validateSnapshotIndex,
} from "./lib/kurari-ex-entry-snapshot.mjs";

export const TODAY_PATH = "public/data/races/today.generated.json";
export const ENTRY_INDEX_PATH =
  "public/data/races/entries-history/index.generated.json";
export const DEFAULT_TARGET_PATH =
  "public/data/analytics/kurari-ex/source/starters/2026-06-29/today-registration-starters.generated.json";
export const SCHEMA_VERSION =
  "kurari-ex-starters-from-today-registration/v1";
export const SOURCE = "today.riders.registrationNo";
export const SOURCE_BRIDGE_VERSION =
  "kurari-ex-today-rider-bridge/v1";
export const STARTER_BRIDGE_VERSION =
  "kurari-ex-starters-from-today-registration/v1";

const REGISTRATION_SOURCE = "entries-history-snapshot";
const JOIN_TYPES = [
  "raceId",
  "raceKey",
  "dateVenueKeyRaceNumber",
  "dateVenueNameRaceNumber",
];

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function relativePath(root, file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

function sha256(buffer) {
  return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
}

export function startersSourceContentHash(payload) {
  const { contentHash: _contentHash, ...semantic } = payload ?? {};
  return sha256(JSON.stringify(semantic));
}

function determineTodayDate(today) {
  const rootDate = normalizeText(
    today?.date ?? today?.targetDate ?? today?.raceDate,
  );
  if (/^\d{4}-\d{2}-\d{2}$/.test(rootDate)) return rootDate;
  const dates = new Set();
  for (const venue of Array.isArray(today?.venues) ? today.venues : []) {
    for (const race of Array.isArray(venue?.races) ? venue.races : []) {
      const date = normalizeText(race?.date ?? venue?.date);
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) dates.add(date);
    }
  }
  return dates.size === 1 ? [...dates][0] : null;
}

function flattenTodayRaces(today, date) {
  const races = [];
  for (const venue of Array.isArray(today?.venues) ? today.venues : []) {
    const raceIds = Array.isArray(venue?.raceIds) ? venue.raceIds : [];
    (Array.isArray(venue?.races) ? venue.races : []).forEach(
      (race, index) => {
        races.push({
          raceId:
            normalizeText(race?.raceId ?? raceIds[index]) || null,
          raceKey: normalizeText(race?.raceKey) || null,
          date: normalizeText(race?.date ?? venue?.date) || date,
          venueKey:
            normalizeText(
              race?.venueKey ??
                race?.slug ??
                venue?.venueKey ??
                venue?.slug,
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
      },
    );
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

function findSnapshotMatch(race, indexes) {
  for (const type of JOIN_TYPES) {
    const key = joinKey(race, type);
    if (!key) continue;
    const matches = indexes[type].get(key) ?? [];
    if (matches.length === 1) return { type, race: matches[0] };
    if (matches.length > 1) return { type: null, race: null };
  }
  return { type: null, race: null };
}

function optionalStarterFields(rider) {
  const fields = {};
  const prefecture = normalizeText(rider?.prefecture);
  const age = toInteger(rider?.age);
  const term = normalizeText(rider?.term);
  const className = normalizeText(rider?.grade);
  if (prefecture) fields.prefecture = prefecture;
  if (age !== null) fields.age = age;
  if (term) fields.term = term;
  if (className) fields.className = className;
  return fields;
}

function expectedStarter(rider) {
  return {
    carNo: toInteger(rider?.carNo),
    name: normalizeText(rider?.name ?? rider?.fullName),
    registrationNo: normalizeText(rider?.registrationNo),
    ...optionalStarterFields(rider),
    source: SOURCE,
    registrationNoSource: rider?.registrationNoSource,
    registrationNoSourceDate: rider?.registrationNoSourceDate,
    registrationNoSourcePath: rider?.registrationNoSourcePath,
    registrationNoSourceHash: rider?.registrationNoSourceHash,
  };
}

function validateAndBuildRace(
  race,
  snapshotMatch,
  expectedSourcePath,
  expectedSourceHash,
  blockReasonCounts,
) {
  const blockedReasons = [];
  const block = (reason) => {
    if (!blockedReasons.includes(reason)) blockedReasons.push(reason);
    blockReasonCounts[reason] = (blockReasonCounts[reason] ?? 0) + 1;
  };
  if (!race.date) block("RACE_DATE_MISSING");
  if (!race.venueName && !race.venueKey) block("VENUE_MISSING");
  if (!Number.isInteger(race.raceNumber) || race.raceNumber <= 0) {
    block("RACE_NUMBER_INVALID");
  }
  if (race.riders.length === 0) block("TODAY_RIDERS_MISSING");
  if (!snapshotMatch?.race) block("SNAPSHOT_RACE_MATCH_FAILED");

  const carNos = race.riders.map((rider) => toInteger(rider?.carNo));
  const registrationNos = race.riders.map((rider) =>
    normalizeText(rider?.registrationNo),
  );
  if (
    carNos.some(
      (carNo) =>
        !Number.isInteger(carNo) || carNo < 1 || carNo > 9,
    )
  ) {
    block("CAR_NO_INVALID");
  }
  if (new Set(carNos).size !== carNos.length) {
    block("DUPLICATE_CAR_NO");
  }
  if (registrationNos.some((value) => !value)) {
    block("REGISTRATION_NO_MISSING");
  }
  if (registrationNos.some((value) => !isValidRegistrationNo(value))) {
    block("REGISTRATION_NO_INVALID");
  }
  if (new Set(registrationNos).size !== registrationNos.length) {
    block("DUPLICATE_REGISTRATION_NO");
  }
  if (
    snapshotMatch?.race &&
    toInteger(snapshotMatch.race.starterCount) !== race.riders.length
  ) {
    block("STARTER_COUNT_MISMATCH");
  }

  for (const rider of race.riders) {
    if (
      rider?.registrationNoSource !== REGISTRATION_SOURCE ||
      rider?.registrationNoSourceDate !== race.date ||
      normalizeText(rider?.registrationNoSourcePath) !==
        normalizeText(expectedSourcePath) ||
      normalizeText(rider?.registrationNoSourceHash) !==
        normalizeText(expectedSourceHash) ||
      rider?.registrationNoBridgeVersion !== SOURCE_BRIDGE_VERSION
    ) {
      block("SOURCE_METADATA_MISMATCH");
      break;
    }
  }

  const starters = race.riders.map(expectedStarter);
  return {
    date: race.date,
    venueName: race.venueName,
    raceNumber: race.raceNumber,
    joinKeyType: snapshotMatch?.type ?? null,
    starterCount: starters.length,
    starters,
    quality: {
      starterStatus:
        blockedReasons.length === 0 ? "FULL" : "BLOCKED",
      carNoUnique:
        carNos.length > 0 && new Set(carNos).size === carNos.length,
      registrationNoComplete:
        registrationNos.length > 0 &&
        registrationNos.every(isValidRegistrationNo),
      registrationNoUnique:
        registrationNos.length > 0 &&
        new Set(registrationNos).size === registrationNos.length,
      todayRegistrationBridgeValidated: true,
      fakeCompletionPerformed: false,
      fuzzyMatchingPerformed: false,
      resultLineupPredictionUsedAsStarterSource: false,
      blockedReasons,
    },
  };
}

export async function buildExpectedStartersSource(
  root = process.cwd(),
) {
  const todayFile = path.resolve(root, TODAY_PATH);
  const indexFile = path.resolve(root, ENTRY_INDEX_PATH);
  const blockedReasons = [];
  if (!existsSync(todayFile)) blockedReasons.push("TODAY_FILE_MISSING");
  if (!existsSync(indexFile)) blockedReasons.push("INDEX_FILE_MISSING");
  if (blockedReasons.length > 0) {
    return { buildStatus: "BLOCKED", blockedReasons };
  }

  const bridgeCheck = await checkTodayRiderRegistrationBridge(root);
  if (bridgeCheck.checkStatus !== "PASS") {
    return {
      buildStatus: "BLOCKED",
      bridgeCheck,
      blockedReasons: ["TODAY_REGISTRATION_BRIDGE_CHECK_FAILED"],
    };
  }

  const [todayBuffer, index] = await Promise.all([
    readFile(todayFile),
    readJson(indexFile),
  ]);
  const today = JSON.parse(todayBuffer.toString("utf8"));
  const indexValidation = await validateSnapshotIndex(root, index);
  if (indexValidation.checkStatus !== "PASS") {
    return {
      buildStatus: "BLOCKED",
      bridgeCheck,
      blockedReasons: ["INDEX_CHECK_FAILED"],
    };
  }
  const date = determineTodayDate(today);
  if (!date) {
    return {
      buildStatus: "BLOCKED",
      bridgeCheck,
      blockedReasons: ["TODAY_DATE_INVALID"],
    };
  }
  const snapshotItems = index.snapshots.filter(
    (item) => item.date === date,
  );
  if (snapshotItems.length !== 1) {
    return {
      buildStatus: "BLOCKED",
      bridgeCheck,
      blockedReasons: ["SNAPSHOT_INDEX_ENTRY_NOT_UNIQUE"],
    };
  }
  const snapshotPath = normalizeText(snapshotItems[0].path);
  const snapshotFile = path.resolve(root, snapshotPath);
  if (!existsSync(snapshotFile)) {
    return {
      buildStatus: "BLOCKED",
      bridgeCheck,
      blockedReasons: ["SNAPSHOT_FILE_MISSING"],
    };
  }
  const snapshot = await readJson(snapshotFile);
  const snapshotValidation = validateSnapshot(snapshot);
  if (
    snapshotValidation.checkStatus !== "PASS" ||
    !snapshotValidation.hashMatched ||
    snapshot.contentHash !== snapshotItems[0].contentHash
  ) {
    return {
      buildStatus: "BLOCKED",
      bridgeCheck,
      blockedReasons: ["SNAPSHOT_CHECK_FAILED"],
    };
  }
  if (snapshot.date !== date) {
    return {
      buildStatus: "BLOCKED",
      bridgeCheck,
      blockedReasons: ["TODAY_SNAPSHOT_DATE_MISMATCH"],
    };
  }

  const todayRaces = flattenTodayRaces(today, date);
  const snapshotIndexes = createSnapshotIndexes(snapshot.races);
  const blockReasonCounts = {};
  const races = todayRaces.map((race) =>
    validateAndBuildRace(
      race,
      findSnapshotMatch(race, snapshotIndexes),
      snapshotPath,
      snapshot.contentHash,
      blockReasonCounts,
    ),
  );
  const starterCount = races.reduce(
    (total, race) => total + race.starterCount,
    0,
  );
  const fullStarterRaceCount = races.filter(
    (race) => race.quality.starterStatus === "FULL",
  ).length;
  const blockedStarterRaceCount =
    races.length - fullStarterRaceCount;
  const registrationNoCompleteCount = races.reduce(
    (total, race) =>
      total +
      race.starters.filter((starter) =>
        isValidRegistrationNo(starter.registrationNo),
      ).length,
    0,
  );
  const sourceMetadataCompleteCount = races.reduce(
    (total, race) =>
      total +
      race.starters.filter(
        (starter) =>
          starter.registrationNoSource === REGISTRATION_SOURCE &&
          starter.registrationNoSourceDate === date &&
          starter.registrationNoSourcePath === snapshotPath &&
          starter.registrationNoSourceHash === snapshot.contentHash,
      ).length,
    0,
  );
  const dryRunChecks = {
    bridgeCheckPassed: bridgeCheck.checkStatus === "PASS",
    todayRaceCountPositive: bridgeCheck.todayRaceCount > 0,
    todayRiderCountPositive: bridgeCheck.todayRiderCount > 0,
    allTodayRidersHaveRegistration:
      bridgeCheck.todayRidersWithRegistrationNoCount ===
      bridgeCheck.todayRiderCount,
    candidateRaceCountMatched:
      races.length === bridgeCheck.todayRaceCount,
    candidateStarterCountMatched:
      starterCount === bridgeCheck.todayRiderCount,
    allCandidateRacesFull:
      fullStarterRaceCount === bridgeCheck.todayRaceCount,
    noCandidateRacesBlocked: blockedStarterRaceCount === 0,
    registrationComplete:
      registrationNoCompleteCount === bridgeCheck.todayRiderCount,
    sourceMetadataComplete:
      sourceMetadataCompleteCount === bridgeCheck.todayRiderCount,
    fakeCompletionNotPerformed:
      bridgeCheck.fakeCompletionPerformed === false,
    fuzzyMatchingNotPerformed:
      bridgeCheck.fuzzyMatchingPerformed === false,
    prohibitedSourcesNotUsed:
      bridgeCheck.resultLineupPredictionUsedAsStarterSource === false,
  };
  const failedChecks = Object.keys(dryRunChecks).filter(
    (key) => !dryRunChecks[key],
  );
  const startersDryRunReadiness = {
    status:
      failedChecks.length === 0
        ? "READY_FOR_KURARI_EX_STARTERS_WRITE_IMPLEMENTATION"
        : "BLOCKED",
    passedChecks: Object.keys(dryRunChecks).filter(
      (key) => dryRunChecks[key],
    ),
    failedChecks,
  };

  const payloadWithoutHash = {
    schemaVersion: SCHEMA_VERSION,
    source: SOURCE,
    date,
    sourceTodayPath: TODAY_PATH,
    sourceBridgeVersion: SOURCE_BRIDGE_VERSION,
    starterBridgeVersion: STARTER_BRIDGE_VERSION,
    sourceSnapshotPath: snapshotPath,
    sourceSnapshotHash: snapshot.contentHash,
    sourceTodayHash: sha256(todayBuffer),
    ...(normalizeText(today.generatedAt)
      ? { sourceGeneratedAt: today.generatedAt }
      : {}),
    contentHash: "",
    summary: {
      raceCount: races.length,
      starterCount,
      fullStarterRaceCount,
      blockedStarterRaceCount,
      registrationNoCompleteCount,
      sourceMetadataCompleteCount,
    },
    quality: {
      checkStatus:
        failedChecks.length === 0 ? "PASS" : "FAIL",
      fakeCompletionPerformed: false,
      fuzzyMatchingPerformed: false,
      resultLineupPredictionUsedAsStarterSource: false,
      blockedReasons: Object.keys(blockReasonCounts),
    },
    races,
  };
  const payload = {
    ...payloadWithoutHash,
    contentHash: startersSourceContentHash(payloadWithoutHash),
  };
  return {
    buildStatus:
      failedChecks.length === 0 ? "PASS" : "BLOCKED",
    blockedReasons: Object.keys(blockReasonCounts),
    blockReasonCounts,
    bridgeCheck,
    indexValidation,
    snapshotValidation,
    startersDryRunReadiness,
    payload,
  };
}

function duplicateCount(values) {
  return values.length - new Set(values).size;
}

export async function checkStartersSource(
  target = DEFAULT_TARGET_PATH,
  root = process.cwd(),
) {
  const targetFile = path.resolve(root, target);
  const targetPath = relativePath(root, targetFile);
  const failedReasons = [];
  const result = {
    checkStatus: "FAIL",
    targetPath,
    todayPath: TODAY_PATH,
    date: null,
    todayRaceCount: 0,
    todayRiderCount: 0,
    targetRaceCount: 0,
    targetStarterCount: 0,
    todayRegistrationRootBridgeMetadataStatus: null,
    todayRegistrationRootBridgeMetadataWarningReasons: [],
    registrationNoMatchedCount: 0,
    registrationNoMissingCount: 0,
    registrationNoMismatchCount: 0,
    sourceMetadataMatchedCount: 0,
    sourceMetadataMissingCount: 0,
    sourceMetadataMismatchCount: 0,
    duplicateCarNoRaceCount: 0,
    duplicateRegistrationNoRaceCount: 0,
    hashMatched: false,
    failedReasons,
  };
  if (!existsSync(targetFile)) {
    failedReasons.push("TARGET_FILE_MISSING");
    return result;
  }

  const build = await buildExpectedStartersSource(root);
  if (build.buildStatus !== "PASS") {
    failedReasons.push("EXPECTED_SOURCE_BUILD_FAILED");
    failedReasons.push(...build.blockedReasons);
    return result;
  }
  const targetPayload = await readJson(targetFile);
  const expected = build.payload;
  result.todayRegistrationRootBridgeMetadataStatus =
    build.bridgeCheck.rootBridgeMetadataStatus ?? null;
  result.todayRegistrationRootBridgeMetadataWarningReasons =
    build.bridgeCheck.rootBridgeMetadataWarningReasons ?? [];
  result.date = targetPayload?.date ?? null;
  result.todayRaceCount = build.bridgeCheck.todayRaceCount;
  result.todayRiderCount = build.bridgeCheck.todayRiderCount;
  const targetRaces = Array.isArray(targetPayload?.races)
    ? targetPayload.races
    : [];
  result.targetRaceCount = targetRaces.length;
  result.targetStarterCount = targetRaces.reduce(
    (total, race) =>
      total + (Array.isArray(race?.starters) ? race.starters.length : 0),
    0,
  );

  if (targetPayload?.schemaVersion !== SCHEMA_VERSION) {
    failedReasons.push("SCHEMA_VERSION_MISMATCH");
  }
  result.hashMatched =
    targetPayload?.contentHash ===
    startersSourceContentHash(targetPayload);
  if (!result.hashMatched) failedReasons.push("CONTENT_HASH_MISMATCH");
  for (const key of [
    "date",
    "source",
    "sourceTodayPath",
    "sourceBridgeVersion",
    "starterBridgeVersion",
    "sourceSnapshotPath",
    "sourceSnapshotHash",
    "sourceTodayHash",
  ]) {
    if (targetPayload?.[key] !== expected[key]) {
      failedReasons.push(`${key.toUpperCase()}_MISMATCH`);
    }
  }
  if (
    JSON.stringify(targetPayload?.summary) !==
    JSON.stringify(expected.summary)
  ) {
    failedReasons.push("SUMMARY_MISMATCH");
  }
  if (
    targetPayload?.quality?.checkStatus !== "PASS" ||
    targetPayload?.quality?.fakeCompletionPerformed !== false ||
    targetPayload?.quality?.fuzzyMatchingPerformed !== false ||
    targetPayload?.quality
      ?.resultLineupPredictionUsedAsStarterSource !== false ||
    (targetPayload?.quality?.blockedReasons ?? []).length !== 0
  ) {
    failedReasons.push("QUALITY_MISMATCH");
  }

  const expectedRaceByKey = new Map(
    expected.races.map((race) => [
      joinKey(race, "dateVenueNameRaceNumber"),
      race,
    ]),
  );
  for (const race of targetRaces) {
    const expectedRace = expectedRaceByKey.get(
      joinKey(race, "dateVenueNameRaceNumber"),
    );
    if (!expectedRace) {
      failedReasons.push("TARGET_RACE_NOT_IN_TODAY");
      continue;
    }
    const starters = Array.isArray(race?.starters)
      ? race.starters
      : [];
    const carNos = starters.map((starter) =>
      toInteger(starter?.carNo),
    );
    const registrationNos = starters.map((starter) =>
      normalizeText(starter?.registrationNo),
    );
    if (duplicateCount(carNos) > 0) {
      result.duplicateCarNoRaceCount += 1;
    }
    if (duplicateCount(registrationNos) > 0) {
      result.duplicateRegistrationNoRaceCount += 1;
    }
    const expectedByCarNo = new Map(
      expectedRace.starters.map((starter) => [
        starter.carNo,
        starter,
      ]),
    );
    for (const starter of starters) {
      const registrationNo = normalizeText(starter?.registrationNo);
      if (!registrationNo) {
        result.registrationNoMissingCount += 1;
      }
      const expectedStarterValue = expectedByCarNo.get(
        toInteger(starter?.carNo),
      );
      if (
        expectedStarterValue &&
        registrationNo === expectedStarterValue.registrationNo
      ) {
        result.registrationNoMatchedCount += 1;
      } else if (registrationNo) {
        result.registrationNoMismatchCount += 1;
      }
      const metadataFields = [
        "source",
        "registrationNoSource",
        "registrationNoSourceDate",
        "registrationNoSourcePath",
        "registrationNoSourceHash",
      ];
      const presentCount = metadataFields.filter(
        (key) => normalizeText(starter?.[key]),
      ).length;
      if (presentCount === 0) {
        result.sourceMetadataMissingCount += 1;
      } else if (
        expectedStarterValue &&
        metadataFields.every(
          (key) =>
            starter?.[key] === expectedStarterValue?.[key],
        )
      ) {
        result.sourceMetadataMatchedCount += 1;
      } else {
        result.sourceMetadataMismatchCount += 1;
      }
    }
    if (starters.length !== expectedRace.starters.length) {
      failedReasons.push("RACE_STARTER_COUNT_MISMATCH");
    }
  }
  if (result.targetRaceCount !== result.todayRaceCount) {
    failedReasons.push("RACE_COUNT_MISMATCH");
  }
  if (result.targetStarterCount !== result.todayRiderCount) {
    failedReasons.push("STARTER_COUNT_MISMATCH");
  }
  if (result.registrationNoMatchedCount !== result.todayRiderCount) {
    failedReasons.push("REGISTRATION_NO_MATCH_INCOMPLETE");
  }
  if (
    result.registrationNoMissingCount > 0 ||
    result.registrationNoMismatchCount > 0
  ) {
    failedReasons.push("REGISTRATION_NO_INVALID");
  }
  if (result.sourceMetadataMatchedCount !== result.todayRiderCount) {
    failedReasons.push("SOURCE_METADATA_MATCH_INCOMPLETE");
  }
  if (
    result.sourceMetadataMissingCount > 0 ||
    result.sourceMetadataMismatchCount > 0
  ) {
    failedReasons.push("SOURCE_METADATA_INVALID");
  }
  if (
    result.duplicateCarNoRaceCount > 0 ||
    result.duplicateRegistrationNoRaceCount > 0
  ) {
    failedReasons.push("DUPLICATE_STARTER_IDENTITY");
  }
  if (targetPayload?.contentHash !== expected.contentHash) {
    failedReasons.push("EXPECTED_CONTENT_HASH_MISMATCH");
  }

  result.failedReasons = [...new Set(failedReasons)];
  result.checkStatus =
    result.failedReasons.length === 0 ? "PASS" : "FAIL";
  return result;
}

function printResult(result) {
  console.log("[kurari-ex starters from today registration check]");
  for (const key of [
    "checkStatus",
    "targetPath",
    "todayPath",
    "date",
    "todayRaceCount",
    "todayRiderCount",
    "targetRaceCount",
    "targetStarterCount",
    "todayRegistrationRootBridgeMetadataStatus",
    "registrationNoMatchedCount",
    "registrationNoMissingCount",
    "registrationNoMismatchCount",
    "sourceMetadataMatchedCount",
    "sourceMetadataMissingCount",
    "sourceMetadataMismatchCount",
    "duplicateCarNoRaceCount",
    "duplicateRegistrationNoRaceCount",
    "hashMatched",
  ]) {
    console.log(`${key}: ${result[key] ?? null}`);
  }
  console.log(`failedReasons: ${JSON.stringify(result.failedReasons)}`);
  console.log(
    `todayRegistrationRootBridgeMetadataWarningReasons: ${JSON.stringify(result.todayRegistrationRootBridgeMetadataWarningReasons ?? [])}`,
  );
}

async function main() {
  const target = process.argv[2] ?? DEFAULT_TARGET_PATH;
  const result = await checkStartersSource(target);
  printResult(result);
  if (result.checkStatus !== "PASS") process.exitCode = 1;
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  main().catch((error) => {
    console.error(
      "[kurari-ex starters from today registration check] failed",
    );
    console.error(error);
    process.exitCode = 1;
  });
}
