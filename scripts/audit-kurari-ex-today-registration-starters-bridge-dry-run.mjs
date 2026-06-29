import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  checkTodayRiderRegistrationBridge,
} from "./check-kurari-ex-today-rider-registration-bridge.mjs";
import {
  isValidRegistrationNo,
  normalizeText,
  normalizeVenueName,
  toInteger,
} from "./lib/kurari-ex-entry-snapshot.mjs";

const ROOT = process.cwd();
const TODAY_PATH = "public/data/races/today.generated.json";
const ENTRY_INDEX_PATH =
  "public/data/races/entries-history/index.generated.json";
const HISTORY_INDEX_PATH =
  "public/data/analytics/kurari-ex/history/index.generated.json";
const SOURCE_BRIDGE_VERSION = "kurari-ex-today-rider-bridge/v1";
const STARTER_BRIDGE_VERSION =
  "kurari-ex-starters-from-today-registration/v1-dry-run";
const REGISTRATION_SOURCE = "entries-history-snapshot";
const STARTER_SOURCE = "today.riders.registrationNo";
const JOIN_TYPES = [
  "raceId",
  "raceKey",
  "dateVenueKeyRaceNumber",
  "dateVenueNameRaceNumber",
];
const BLOCK_REASONS = new Set([
  "TODAY_FILE_MISSING",
  "TODAY_DATE_MISSING",
  "TODAY_DATE_AMBIGUOUS",
  "TODAY_REGISTRATION_BRIDGE_CHECK_FAILED",
  "INDEX_CHECK_FAILED",
  "SNAPSHOT_CHECK_FAILED",
  "TODAY_SNAPSHOT_DATE_MISMATCH",
  "TODAY_RACES_MISSING",
  "TODAY_RIDERS_MISSING",
  "CAR_NO_MISSING",
  "CAR_NO_INVALID",
  "DUPLICATE_CAR_NO",
  "REGISTRATION_NO_MISSING",
  "REGISTRATION_NO_INVALID",
  "DUPLICATE_REGISTRATION_NO",
  "REGISTRATION_NO_SOURCE_MISSING",
  "REGISTRATION_NO_SOURCE_MISMATCH",
  "REGISTRATION_NO_SOURCE_HASH_MISSING",
  "STARTER_COUNT_ZERO",
  "STARTER_COUNT_MISMATCH",
  "STARTER_IDENTITY_INCOMPLETE",
  "LINEUP_COMPATIBILITY_UNKNOWN",
  "RESULT_OR_LINEUP_ONLY_SOURCE_PROHIBITED",
  "NAME_MATCH_REQUIRED_FAKE_PROHIBITED",
  "FUZZY_MATCHING_PROHIBITED",
]);

async function readJson(relativePath) {
  return JSON.parse(
    await readFile(path.resolve(ROOT, relativePath), "utf8"),
  );
}

function increment(counter, reason) {
  if (!BLOCK_REASONS.has(reason)) {
    throw new Error(`unknown blocked reason: ${reason}`);
  }
  counter[reason] = (counter[reason] ?? 0) + 1;
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
    for (const value of [venue?.date, venue?.startDate]) {
      const date = normalizeText(value);
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) dates.add(date);
    }
    for (const race of Array.isArray(venue?.races) ? venue.races : []) {
      const date = normalizeText(race?.date);
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) dates.add(date);
    }
  }
  if (dates.size === 1) return { date: [...dates][0], reason: null };
  return {
    date: null,
    reason:
      dates.size > 1 ? "TODAY_DATE_AMBIGUOUS" : "TODAY_DATE_MISSING",
  };
}

function flattenTodayRaces(payload, todayDate) {
  const races = [];
  for (const venue of Array.isArray(payload?.venues) ? payload.venues : []) {
    const venueRaces = Array.isArray(venue?.races) ? venue.races : [];
    const raceIds = Array.isArray(venue?.raceIds) ? venue.raceIds : [];
    venueRaces.forEach((race, index) => {
      races.push({
        raceId: normalizeText(race?.raceId ?? raceIds[index]) || null,
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

function inspectRaceCandidate(
  race,
  match,
  summary,
  expectedSourcePath,
  expectedSourceHash,
) {
  const reasons = [];
  if (!race.date) reasons.push("TODAY_DATE_MISSING");
  if (!race.venueName && !race.venueKey) {
    reasons.push("TODAY_RACES_MISSING");
  }
  if (!Number.isInteger(race.raceNumber) || race.raceNumber <= 0) {
    reasons.push("TODAY_RACES_MISSING");
  }
  if (race.riders.length === 0) reasons.push("TODAY_RIDERS_MISSING");

  const carNos = race.riders.map((rider) => toInteger(rider?.carNo));
  const registrationNos = race.riders.map((rider) =>
    normalizeText(rider?.registrationNo),
  );
  if (carNos.some((carNo) => carNo === null)) {
    reasons.push("CAR_NO_MISSING");
  }
  if (
    carNos.some(
      (carNo) =>
        !Number.isInteger(carNo) || carNo < 1 || carNo > 9,
    )
  ) {
    reasons.push("CAR_NO_INVALID");
  }
  if (new Set(carNos).size !== carNos.length) {
    reasons.push("DUPLICATE_CAR_NO");
    summary.duplicateCarNoRaceCount += 1;
  }
  if (registrationNos.some((registrationNo) => !registrationNo)) {
    reasons.push("REGISTRATION_NO_MISSING");
  }
  if (
    registrationNos.some(
      (registrationNo) =>
        registrationNo && !isValidRegistrationNo(registrationNo),
    )
  ) {
    reasons.push("REGISTRATION_NO_INVALID");
  }
  if (
    registrationNos.filter(Boolean).length !==
    new Set(registrationNos.filter(Boolean)).size
  ) {
    reasons.push("DUPLICATE_REGISTRATION_NO");
    summary.duplicateRegistrationNoRaceCount += 1;
  }
  if (race.riders.length === 0) reasons.push("STARTER_COUNT_ZERO");
  if (
    match?.race &&
    toInteger(match.race.starterCount) !== race.riders.length
  ) {
    reasons.push("STARTER_COUNT_MISMATCH");
  }

  for (const rider of race.riders) {
    const registrationNo = normalizeText(rider?.registrationNo);
    if (!registrationNo) summary.starterRegistrationNoMissingCount += 1;
    else if (!isValidRegistrationNo(registrationNo)) {
      summary.starterRegistrationNoInvalidCount += 1;
    } else {
      summary.starterRegistrationNoCompleteCount += 1;
    }

    const sourceFields = [
      rider?.registrationNoSource,
      rider?.registrationNoSourceDate,
      rider?.registrationNoSourcePath,
      rider?.registrationNoSourceHash,
      rider?.registrationNoBridgeVersion,
    ];
    if (sourceFields.every((value) => !normalizeText(value))) {
      summary.sourceMetadataMissingCount += 1;
      reasons.push("REGISTRATION_NO_SOURCE_MISSING");
      continue;
    }
    const sourceMatched =
      rider?.registrationNoSource === REGISTRATION_SOURCE &&
      rider?.registrationNoSourceDate === race.date &&
      normalizeText(rider?.registrationNoSourcePath) ===
        expectedSourcePath &&
      normalizeText(rider?.registrationNoSourceHash) ===
        expectedSourceHash &&
      rider?.registrationNoBridgeVersion === SOURCE_BRIDGE_VERSION;
    if (!normalizeText(rider?.registrationNoSourceHash)) {
      reasons.push("REGISTRATION_NO_SOURCE_HASH_MISSING");
    }
    if (sourceMatched) summary.sourceMetadataCompleteCount += 1;
    else {
      summary.sourceMetadataMismatchCount += 1;
      reasons.push("REGISTRATION_NO_SOURCE_MISMATCH");
    }
  }

  const blockedReasons = [...new Set(reasons)];
  if (
    blockedReasons.some((reason) =>
      [
        "CAR_NO_MISSING",
        "CAR_NO_INVALID",
        "REGISTRATION_NO_MISSING",
        "REGISTRATION_NO_INVALID",
        "REGISTRATION_NO_SOURCE_MISSING",
        "REGISTRATION_NO_SOURCE_MISMATCH",
      ].includes(reason),
    )
  ) {
    blockedReasons.push("STARTER_IDENTITY_INCOMPLETE");
  }
  for (const reason of new Set(blockedReasons)) {
    increment(summary.blockReasonCounts, reason);
  }

  const starters = race.riders.map((rider) => ({
    carNo: toInteger(rider?.carNo),
    name: normalizeText(rider?.name ?? rider?.fullName),
    registrationNo: normalizeText(rider?.registrationNo),
    ...optionalStarterFields(rider),
    source: STARTER_SOURCE,
    registrationNoSource: rider?.registrationNoSource,
    registrationNoSourceDate: rider?.registrationNoSourceDate,
    registrationNoSourcePath: rider?.registrationNoSourcePath,
    registrationNoSourceHash: rider?.registrationNoSourceHash,
  }));
  const uniqueBlockedReasons = [...new Set(blockedReasons)];
  return {
    date: race.date,
    venueName: race.venueName,
    raceNumber: race.raceNumber,
    sourceTodayPath: TODAY_PATH,
    sourceBridgeVersion: SOURCE_BRIDGE_VERSION,
    starterBridgeVersion: STARTER_BRIDGE_VERSION,
    joinKeyType: match?.type ?? null,
    starterCount: starters.length,
    starters,
    quality: {
      starterStatus:
        uniqueBlockedReasons.length === 0 ? "FULL" : "BLOCKED",
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
      blockedReasons: uniqueBlockedReasons,
    },
  };
}

function historyFilePath(file) {
  const normalized = normalizeText(file).replaceAll("\\", "/");
  if (normalized.startsWith("/data/")) return `public${normalized}`;
  return normalized.replace(/^\/+/u, "");
}

async function inspectHistoryCompatibility(todayDate, candidates) {
  if (!existsSync(path.resolve(ROOT, HISTORY_INDEX_PATH))) {
    return {
      candidateNoStartersResolutionRaceCount: 0,
      candidateNoStartersResolutionRiderCount: 0,
      lineupCompatibilityCheckStatus: "HISTORY_INDEX_NOT_AVAILABLE",
    };
  }
  const historyIndex = await readJson(HISTORY_INDEX_PATH);
  const sameDateItems = (Array.isArray(historyIndex?.items)
    ? historyIndex.items
    : []
  ).filter((item) => item?.date === todayDate);
  if (sameDateItems.length !== 1) {
    return {
      candidateNoStartersResolutionRaceCount: 0,
      candidateNoStartersResolutionRiderCount: 0,
      lineupCompatibilityCheckStatus:
        sameDateItems.length === 0
          ? "HISTORY_DATE_NOT_AVAILABLE"
          : "HISTORY_DATE_AMBIGUOUS",
    };
  }

  const daily = await readJson(historyFilePath(sameDateItems[0].file));
  const candidateByKey = new Map(
    candidates
      .filter((candidate) => candidate.quality.starterStatus === "FULL")
      .map((candidate) => [
        `${candidate.date}|${normalizeVenueName(candidate.venueName)}|${candidate.raceNumber}`,
        candidate,
      ]),
  );
  let raceCount = 0;
  let riderCount = 0;
  let lineupCompatibleCount = 0;
  for (const race of Array.isArray(daily?.items) ? daily.items : []) {
    if (Array.isArray(race?.starters) && race.starters.length > 0) continue;
    const key = `${race?.date}|${normalizeVenueName(race?.venueName)}|${toInteger(race?.raceNumber)}`;
    const candidate = candidateByKey.get(key);
    if (!candidate) continue;
    raceCount += 1;
    riderCount += candidate.starterCount;
    const candidateCarNos = new Set(
      candidate.starters.map((starter) => starter.carNo),
    );
    const members = Array.isArray(race?.lineup?.lines)
      ? race.lineup.lines.flatMap((line) =>
          Array.isArray(line) ? line.map(toInteger) : [],
        )
      : [];
    if (
      members.length === candidate.starterCount &&
      members.every((carNo) => candidateCarNos.has(carNo)) &&
      new Set(members).size === members.length
    ) {
      lineupCompatibleCount += 1;
    }
  }
  return {
    candidateNoStartersResolutionRaceCount: raceCount,
    candidateNoStartersResolutionRiderCount: riderCount,
    lineupCompatibilityCheckStatus:
      raceCount === 0
        ? "NO_SAME_DATE_NO_STARTERS_RACES"
        : lineupCompatibleCount === raceCount
          ? "PASS"
          : "STARTERS_SOURCE_READY_LINEUP_PARTIAL_OR_MISSING",
  };
}

function buildReadiness(summary) {
  const checks = {
    todayRegistrationBridgeCheckPassed:
      summary.todayRegistrationBridgeCheckStatus === "PASS",
    todayRaceCountPositive: summary.todayRaceCount > 0,
    todayRiderCountPositive: summary.todayRiderCount > 0,
    allCandidateRacesFull:
      summary.fullStarterCandidateRaceCount === summary.todayRaceCount,
    noCandidateRacesBlocked:
      summary.blockedStarterCandidateRaceCount === 0,
    candidateCountMatched:
      summary.starterCandidateCount === summary.todayRiderCount,
    registrationComplete:
      summary.starterRegistrationNoCompleteCount ===
      summary.todayRiderCount,
    registrationMissingZero:
      summary.starterRegistrationNoMissingCount === 0,
    registrationInvalidZero:
      summary.starterRegistrationNoInvalidCount === 0,
    sourceMetadataComplete:
      summary.sourceMetadataCompleteCount === summary.todayRiderCount,
    fakeCompletionNotPerformed: !summary.fakeCompletionPerformed,
    fuzzyMatchingNotPerformed: !summary.fuzzyMatchingPerformed,
    prohibitedSourcesNotUsed:
      !summary.resultLineupPredictionUsedAsStarterSource,
    writesNotPerformed: !summary.writesPerformed,
  };
  const passedChecks = Object.keys(checks).filter((key) => checks[key]);
  const failedChecks = Object.keys(checks).filter((key) => !checks[key]);
  return {
    status:
      failedChecks.length === 0
        ? "READY_FOR_KURARI_EX_STARTERS_WRITE_IMPLEMENTATION"
        : "BLOCKED",
    passedChecks,
    failedChecks,
    nextRecommendedAction:
      failedChecks.length === 0
        ? "保存先・上書き禁止・atomic write・再検証を含むstarters write実装を別工程で設計する。"
        : "failedChecksとblockReasonCountsを解消し、同じdry-runを再実行する。",
  };
}

function previewCandidates(candidates) {
  return candidates.slice(0, 3).map((candidate) => ({
    date: candidate.date,
    venueName: candidate.venueName,
    raceNumber: candidate.raceNumber,
    joinKeyType: candidate.joinKeyType,
    starterCount: candidate.starterCount,
    starters: candidate.starters.slice(0, 2),
    omittedStarterCount: Math.max(candidate.starters.length - 2, 0),
    quality: candidate.quality,
  }));
}

function printSummary(summary, preview) {
  console.log("[kurari-ex today registrationNo -> starters bridge dry-run]");
  console.log("");
  console.log("[summary]");
  for (const key of [
    "todayPath",
    "todayDate",
    "todayRegistrationBridgeCheckStatus",
    "todayRegistrationRootBridgeMetadataStatus",
    "todayRaceCount",
    "todayRiderCount",
    "todayRidersWithRegistrationNoCount",
    "starterCandidateRaceCount",
    "starterCandidateCount",
    "fullStarterCandidateRaceCount",
    "partialStarterCandidateRaceCount",
    "blockedStarterCandidateRaceCount",
    "starterRegistrationNoCompleteCount",
    "starterRegistrationNoMissingCount",
    "starterRegistrationNoInvalidCount",
    "duplicateCarNoRaceCount",
    "duplicateRegistrationNoRaceCount",
    "sourceMetadataCompleteCount",
    "sourceMetadataMissingCount",
    "sourceMetadataMismatchCount",
    "candidateNoStartersResolutionRaceCount",
    "candidateNoStartersResolutionRiderCount",
    "lineupCompatibilityCheckStatus",
  ]) {
    console.log(`${key}: ${summary[key] ?? null}`);
  }
  console.log(
    `todayRegistrationRootBridgeMetadataWarningReasons: ${JSON.stringify(summary.todayRegistrationRootBridgeMetadataWarningReasons ?? [])}`,
  );
  console.log(
    `blockReasonCounts: ${JSON.stringify(summary.blockReasonCounts)}`,
  );
  console.log(
    `startersBridgeReadiness: ${JSON.stringify(summary.startersBridgeReadiness)}`,
  );
  for (const key of [
    "writesPerformed",
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
  console.log("");
  console.log("[previewStarterCandidates]");
  console.log(JSON.stringify(preview, null, 2));
  console.log("");
  console.log("[jsonSummary]");
  console.log(JSON.stringify({ ...summary, previewStarterCandidates: preview }, null, 2));
}

async function main() {
  const summary = {
    todayPath: TODAY_PATH,
    todayDate: null,
    todayRegistrationBridgeCheckStatus: "FAIL",
    todayRegistrationRootBridgeMetadataStatus: null,
    todayRegistrationRootBridgeMetadataWarningReasons: [],
    todayRaceCount: 0,
    todayRiderCount: 0,
    todayRidersWithRegistrationNoCount: 0,
    starterCandidateRaceCount: 0,
    starterCandidateCount: 0,
    fullStarterCandidateRaceCount: 0,
    partialStarterCandidateRaceCount: 0,
    blockedStarterCandidateRaceCount: 0,
    starterRegistrationNoCompleteCount: 0,
    starterRegistrationNoMissingCount: 0,
    starterRegistrationNoInvalidCount: 0,
    duplicateCarNoRaceCount: 0,
    duplicateRegistrationNoRaceCount: 0,
    sourceMetadataCompleteCount: 0,
    sourceMetadataMissingCount: 0,
    sourceMetadataMismatchCount: 0,
    candidateNoStartersResolutionRaceCount: 0,
    candidateNoStartersResolutionRiderCount: 0,
    lineupCompatibilityCheckStatus: "NOT_CHECKED",
    blockReasonCounts: {},
    fakeCompletionPerformed: false,
    fuzzyMatchingPerformed: false,
    resultLineupPredictionUsedAsStarterSource: false,
    writesPerformed: false,
    todayModified: false,
    historyModified: false,
    analyticsModified: false,
    reviewsModified: false,
  };

  if (!existsSync(path.resolve(ROOT, TODAY_PATH))) {
    increment(summary.blockReasonCounts, "TODAY_FILE_MISSING");
    summary.startersBridgeReadiness = buildReadiness(summary);
    printSummary(summary, []);
    process.exitCode = 1;
    return;
  }

  const bridgeCheck = await checkTodayRiderRegistrationBridge(ROOT);
  summary.todayRegistrationBridgeCheckStatus = bridgeCheck.checkStatus;
  summary.todayRegistrationRootBridgeMetadataStatus =
    bridgeCheck.rootBridgeMetadataStatus ?? null;
  summary.todayRegistrationRootBridgeMetadataWarningReasons =
    bridgeCheck.rootBridgeMetadataWarningReasons ?? [];
  summary.todayDate = bridgeCheck.todayDate ?? null;
  summary.todayRaceCount = bridgeCheck.todayRaceCount ?? 0;
  summary.todayRiderCount = bridgeCheck.todayRiderCount ?? 0;
  summary.todayRidersWithRegistrationNoCount =
    bridgeCheck.todayRidersWithRegistrationNoCount ?? 0;
  if (bridgeCheck.checkStatus !== "PASS") {
    increment(
      summary.blockReasonCounts,
      "TODAY_REGISTRATION_BRIDGE_CHECK_FAILED",
    );
    if (bridgeCheck.indexCheckStatus !== "PASS") {
      increment(summary.blockReasonCounts, "INDEX_CHECK_FAILED");
    }
    if (bridgeCheck.snapshotCheckStatus !== "PASS") {
      increment(summary.blockReasonCounts, "SNAPSHOT_CHECK_FAILED");
    }
    if (
      bridgeCheck.todayDate &&
      bridgeCheck.snapshotDate &&
      bridgeCheck.todayDate !== bridgeCheck.snapshotDate
    ) {
      increment(
        summary.blockReasonCounts,
        "TODAY_SNAPSHOT_DATE_MISMATCH",
      );
    }
    summary.startersBridgeReadiness = buildReadiness(summary);
    printSummary(summary, []);
    process.exitCode = 1;
    return;
  }

  const [today, entryIndex] = await Promise.all([
    readJson(TODAY_PATH),
    readJson(ENTRY_INDEX_PATH),
  ]);
  const todayDateResult = determineTodayDate(today);
  if (todayDateResult.reason) {
    increment(summary.blockReasonCounts, todayDateResult.reason);
    summary.startersBridgeReadiness = buildReadiness(summary);
    printSummary(summary, []);
    process.exitCode = 1;
    return;
  }
  const snapshotItems = (Array.isArray(entryIndex?.snapshots)
    ? entryIndex.snapshots
    : []
  ).filter((item) => item?.date === todayDateResult.date);
  if (snapshotItems.length !== 1) {
    increment(summary.blockReasonCounts, "INDEX_CHECK_FAILED");
    summary.startersBridgeReadiness = buildReadiness(summary);
    printSummary(summary, []);
    process.exitCode = 1;
    return;
  }
  const snapshot = await readJson(snapshotItems[0].path);
  const snapshotIndexes = createSnapshotIndexes(snapshot.races);
  const races = flattenTodayRaces(today, todayDateResult.date);
  const candidates = races.map((race) =>
    inspectRaceCandidate(
      race,
      findSnapshotMatch(race, snapshotIndexes),
      summary,
      normalizeText(snapshotItems[0].path),
      normalizeText(snapshot.contentHash),
    ),
  );

  summary.starterCandidateRaceCount = candidates.length;
  summary.starterCandidateCount = candidates.reduce(
    (total, candidate) => total + candidate.starterCount,
    0,
  );
  summary.fullStarterCandidateRaceCount = candidates.filter(
    (candidate) => candidate.quality.starterStatus === "FULL",
  ).length;
  summary.partialStarterCandidateRaceCount = candidates.filter(
    (candidate) => candidate.quality.starterStatus === "PARTIAL",
  ).length;
  summary.blockedStarterCandidateRaceCount = candidates.filter(
    (candidate) => candidate.quality.starterStatus === "BLOCKED",
  ).length;

  const compatibility = await inspectHistoryCompatibility(
    todayDateResult.date,
    candidates,
  );
  Object.assign(summary, compatibility);
  summary.startersBridgeReadiness = buildReadiness(summary);
  const preview = previewCandidates(candidates);
  printSummary(summary, preview);
  if (summary.startersBridgeReadiness.status === "BLOCKED") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(
    "[kurari-ex today registrationNo -> starters bridge dry-run] failed",
  );
  console.error(error);
  process.exitCode = 1;
});
