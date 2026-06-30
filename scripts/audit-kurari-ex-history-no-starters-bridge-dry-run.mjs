import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_TARGET_PATH as SOURCE_INDEX_PATH,
  INDEX_SCHEMA_VERSION,
  checkStartersSourceIndex,
  startersSourceIndexContentHash,
} from "./check-kurari-ex-starters-source-index.mjs";
import {
  SCHEMA_VERSION as STARTERS_SOURCE_SCHEMA_VERSION,
  startersSourceContentHash,
} from "./check-kurari-ex-starters-from-today-registration.mjs";
import {
  normalizeText,
  toInteger,
} from "./lib/kurari-ex-entry-snapshot.mjs";

const ROOT = process.cwd();
const HISTORY_INDEX_PATH = "public/data/analytics/kurari-ex/history/index.generated.json";

const BLOCK_REASONS = new Set([
  "STARTERS_INDEX_CHECK_FAILED",
  "STARTERS_SOURCE_CHECK_FAILED",
  "HISTORY_INDEX_MISSING",
  "HISTORY_INDEX_PARSE_FAILED",
  "HISTORY_SOURCE_MISSING",
  "HISTORY_SOURCE_PARSE_FAILED",
  "HISTORY_DATE_NOT_AVAILABLE",
  "EXACT_DATE_HISTORY_NOT_FOUND",
  "JOIN_KEY_NOT_AVAILABLE",
  "JOIN_KEY_AMBIGUOUS",
  "DATE_MISMATCH",
  "VENUE_KEY_MISSING",
  "RACE_NUMBER_MISSING",
  "NO_STARTERS_MARKERS_NOT_FOUND",
  "FAKE_COMPLETION_FOUND",
  "FUZZY_MATCHING_FOUND",
  "PROHIBITED_SOURCE_FOUND",
  "ANALYTICS_MODIFIED",
  "RACES_MODIFIED",
  "REVIEWS_MODIFIED",
  "PROTECTED_FILE_MODIFIED",
]);

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.resolve(ROOT, relativePath), "utf8"));
}

function toPublicRelativePath(file) {
  const normalized = normalizeText(file).replaceAll("\\", "/");
  if (normalized.startsWith("public/")) return normalized;
  if (normalized.startsWith("/public/")) return normalized.slice(1);
  if (normalized.startsWith("/data/")) return `public${normalized}`;
  if (normalized.startsWith("data/")) return `public/${normalized}`;
  return normalized;
}

function increment(counter, reason) {
  if (!BLOCK_REASONS.has(reason)) {
    throw new Error(`unknown block reason: ${reason}`);
  }
  counter[reason] = (counter[reason] ?? 0) + 1;
}

function addReason(reasons, reason) {
  if (!BLOCK_REASONS.has(reason)) {
    throw new Error(`unknown block reason: ${reason}`);
  }
  reasons.add(reason);
}

function registrationNoIsComplete(source) {
  const races = Array.isArray(source?.races) ? source.races : [];
  return races.every((race) =>
    (Array.isArray(race?.starters) ? race.starters : []).every((starter) =>
      /^\d{6}$/.test(normalizeText(starter?.registrationNo)),
    ),
  );
}

function validateStartersIndex(index, indexCheck) {
  const reasons = new Set();
  if (indexCheck.checkStatus !== "PASS") addReason(reasons, "STARTERS_INDEX_CHECK_FAILED");
  if (index?.schemaVersion !== INDEX_SCHEMA_VERSION) addReason(reasons, "STARTERS_INDEX_CHECK_FAILED");
  if (index?.contentHash !== startersSourceIndexContentHash(index)) {
    addReason(reasons, "STARTERS_INDEX_CHECK_FAILED");
  }
  if (index?.quality?.checkStatus !== "PASS") addReason(reasons, "STARTERS_INDEX_CHECK_FAILED");
  if (!index?.latest?.path) addReason(reasons, "STARTERS_INDEX_CHECK_FAILED");
  if (toInteger(index?.summary?.sourceFileCount) <= 0) addReason(reasons, "STARTERS_INDEX_CHECK_FAILED");
  if (toInteger(index?.summary?.indexedSourceCount) <= 0) addReason(reasons, "STARTERS_INDEX_CHECK_FAILED");
  if (toInteger(index?.summary?.failSourceCount) !== 0) addReason(reasons, "STARTERS_INDEX_CHECK_FAILED");
  if (toInteger(index?.summary?.duplicateDateCount) !== 0) addReason(reasons, "STARTERS_INDEX_CHECK_FAILED");
  if (toInteger(index?.summary?.duplicatePathCount) !== 0) addReason(reasons, "STARTERS_INDEX_CHECK_FAILED");
  return [...reasons];
}

function validateLatestStartersSource(source, index) {
  const reasons = new Set();
  const summary = source?.summary ?? {};
  const quality = source?.quality ?? {};
  if (source?.schemaVersion !== STARTERS_SOURCE_SCHEMA_VERSION) addReason(reasons, "STARTERS_SOURCE_CHECK_FAILED");
  if (source?.contentHash !== startersSourceContentHash(source)) addReason(reasons, "STARTERS_SOURCE_CHECK_FAILED");
  if (quality?.checkStatus !== "PASS") addReason(reasons, "STARTERS_SOURCE_CHECK_FAILED");
  if (source?.date !== index?.latest?.date) addReason(reasons, "DATE_MISMATCH");
  if (toInteger(summary?.raceCount) <= 0) addReason(reasons, "STARTERS_SOURCE_CHECK_FAILED");
  if (toInteger(summary?.starterCount) <= 0) addReason(reasons, "STARTERS_SOURCE_CHECK_FAILED");
  if (summary?.fullStarterRaceCount !== summary?.raceCount) addReason(reasons, "STARTERS_SOURCE_CHECK_FAILED");
  if (summary?.blockedStarterRaceCount !== 0) addReason(reasons, "STARTERS_SOURCE_CHECK_FAILED");
  if (summary?.registrationNoCompleteCount !== summary?.starterCount) addReason(reasons, "STARTERS_SOURCE_CHECK_FAILED");
  if (summary?.sourceMetadataCompleteCount !== summary?.starterCount) addReason(reasons, "STARTERS_SOURCE_CHECK_FAILED");
  if (!registrationNoIsComplete(source)) addReason(reasons, "STARTERS_SOURCE_CHECK_FAILED");
  if (quality?.fakeCompletionPerformed !== false) addReason(reasons, "FAKE_COMPLETION_FOUND");
  if (quality?.fuzzyMatchingPerformed !== false) addReason(reasons, "FUZZY_MATCHING_FOUND");
  if (quality?.resultLineupPredictionUsedAsStarterSource !== false) {
    addReason(reasons, "PROHIBITED_SOURCE_FOUND");
  }
  return [...reasons];
}

function raceJoinKey(race, keyType) {
  const date = normalizeText(race?.date);
  const venueName = normalizeText(race?.venueName);
  const venueKey = normalizeText(race?.venueKey);
  const raceNumber = toInteger(race?.raceNumber);
  if (keyType === "dateVenueNameRaceNumber") {
    return date && venueName && raceNumber > 0 ? `${date}|${venueName}|${raceNumber}` : null;
  }
  if (keyType === "dateVenueKeyRaceNumber") {
    return date && venueKey && raceNumber > 0 ? `${date}|${venueKey}|${raceNumber}` : null;
  }
  if (keyType === "raceId") return normalizeText(race?.raceId) || null;
  if (keyType === "raceKey") return normalizeText(race?.raceKey) || null;
  return null;
}

function availableRaceJoinKeys(races) {
  const keys = [];
  for (const keyType of ["dateVenueNameRaceNumber", "dateVenueKeyRaceNumber", "raceId", "raceKey"]) {
    if (races.some((race) => raceJoinKey(race, keyType))) keys.push(keyType);
  }
  return keys;
}

function detectNoStartersMarkers(race, rawRaceText = "") {
  const reasons = [];
  const starters = Array.isArray(race?.starters) ? race.starters : [];
  const starterCount = toInteger(race?.starterCount);
  if (starterCount > 0 && starters.length === 0) reasons.push("STARTER_COUNT_WITH_EMPTY_STARTERS");
  if (race?.coverage?.starterParsed === false) reasons.push("STARTER_PARSED_FALSE");
  if (/NO_STARTERS|no starters|missing starters/i.test(rawRaceText)) {
    reasons.push("NO_STARTERS_TEXT_MARKER");
  }
  return [...new Set(reasons)];
}

function sourceRaceMap(startersSource, keyType) {
  const map = new Map();
  for (const race of Array.isArray(startersSource?.races) ? startersSource.races : []) {
    const key = raceJoinKey(race, keyType);
    if (!key) continue;
    const current = map.get(key) ?? [];
    current.push(race);
    map.set(key, current);
  }
  return map;
}

function analyzeHistoryPayload(historyItem, payload) {
  const races = Array.isArray(payload?.items) ? payload.items : [];
  const noStartersRaces = [];
  for (const race of races) {
    const reasons = detectNoStartersMarkers(race, JSON.stringify(race));
    if (reasons.length === 0) continue;
    noStartersRaces.push({
      date: normalizeText(race?.date ?? payload?.date ?? historyItem?.date),
      venueName: normalizeText(race?.venueName),
      venueKey: normalizeText(race?.venueKey),
      raceNumber: toInteger(race?.raceNumber),
      raceKey: normalizeText(race?.raceKey),
      raceId: normalizeText(race?.raceId),
      starterCount: toInteger(race?.starterCount),
      starterArrayCount: Array.isArray(race?.starters) ? race.starters.length : 0,
      markerReasons: reasons,
      joinKeyCandidates: availableRaceJoinKeys([race]),
    });
  }
  return {
    path: historyItem.file,
    publicPath: toPublicRelativePath(historyItem.file),
    date: normalizeText(payload?.date ?? historyItem?.date),
    schemaVersion: payload?.schemaVersion ?? null,
    raceCount: toInteger(payload?.raceCount ?? historyItem?.raceCount),
    settledRaceCount: toInteger(payload?.settledRaceCount ?? historyItem?.settledRaceCount),
    cancelledRaceCount: toInteger(payload?.cancelledRaceCount ?? historyItem?.cancelledRaceCount),
    itemCount: races.length,
    joinKeyCandidates: availableRaceJoinKeys(races),
    noStartersMarkerCount: noStartersRaces.length,
    noStartersRaces,
  };
}

function classifyResolutionCandidate(noStarterRace, latestStartersDate, sourceQualityPass, sourceMaps) {
  if (!sourceQualityPass) return { resolutionClass: "blocked", reason: "STARTERS_SOURCE_CHECK_FAILED", matchedKeyType: null };
  if (noStarterRace.date !== latestStartersDate) {
    return {
      resolutionClass: "futureDateResolvable",
      reason: "HISTORY_DATE_NOT_AVAILABLE",
      matchedKeyType: null,
    };
  }
  for (const keyType of ["dateVenueNameRaceNumber", "dateVenueKeyRaceNumber", "raceId", "raceKey"]) {
    const key = raceJoinKey(noStarterRace, keyType);
    if (!key) continue;
    const matches = sourceMaps[keyType]?.get(key) ?? [];
    if (matches.length === 1) {
      return {
        resolutionClass: "exactDateResolvable",
        reason: null,
        matchedKeyType: keyType,
        matchedStarterCount: matches[0].starterCount,
      };
    }
    if (matches.length > 1) {
      return { resolutionClass: "blocked", reason: "JOIN_KEY_AMBIGUOUS", matchedKeyType: keyType };
    }
  }
  return {
    resolutionClass: "notResolvable",
    reason: "JOIN_KEY_NOT_AVAILABLE",
    matchedKeyType: null,
  };
}

function joinDryRun(exactDateHistories, startersSource) {
  if (exactDateHistories.length === 0) {
    return {
      joinDryRunStatus: "HISTORY_DATE_NOT_AVAILABLE",
      matchedHistoryRaceCount: 0,
      matchedStarterRaceCount: 0,
      bridgeCandidateRaceCount: 0,
      blockedRaceCount: 0,
      joinPreview: [],
      blockReasonCounts: { HISTORY_DATE_NOT_AVAILABLE: 1, EXACT_DATE_HISTORY_NOT_FOUND: 1 },
    };
  }
  const starterRaces = Array.isArray(startersSource?.races) ? startersSource.races : [];
  const starterMaps = Object.fromEntries(
    ["dateVenueNameRaceNumber", "dateVenueKeyRaceNumber", "raceId", "raceKey"].map((keyType) => [
      keyType,
      sourceRaceMap(startersSource, keyType),
    ]),
  );
  const preview = [];
  let matchedHistoryRaceCount = 0;
  let matchedStarterRaceCount = 0;
  let bridgeCandidateRaceCount = 0;
  let blockedRaceCount = 0;
  const blockReasonCounts = {};
  for (const history of exactDateHistories) {
    for (const race of history.noStartersRaces) {
      let matched = null;
      let matchedKeyType = null;
      for (const keyType of ["dateVenueNameRaceNumber", "dateVenueKeyRaceNumber", "raceId", "raceKey"]) {
        const key = raceJoinKey(race, keyType);
        if (!key) continue;
        const matches = starterMaps[keyType].get(key) ?? [];
        if (matches.length === 1) {
          matched = matches[0];
          matchedKeyType = keyType;
          break;
        }
        if (matches.length > 1) {
          increment(blockReasonCounts, "JOIN_KEY_AMBIGUOUS");
          blockedRaceCount += 1;
          break;
        }
      }
      if (matched) {
        matchedHistoryRaceCount += 1;
        matchedStarterRaceCount += 1;
        bridgeCandidateRaceCount += 1;
        if (preview.length < 10) {
          preview.push({
            date: race.date,
            venueName: race.venueName,
            raceNumber: race.raceNumber,
            matchedKeyType,
            historyStarterCount: race.starterCount,
            sourceStarterCount: matched.starterCount,
          });
        }
      } else {
        blockedRaceCount += 1;
        increment(blockReasonCounts, "JOIN_KEY_NOT_AVAILABLE");
      }
    }
  }
  if (bridgeCandidateRaceCount === 0 && starterRaces.length > 0) {
    increment(blockReasonCounts, "JOIN_KEY_NOT_AVAILABLE");
  }
  return {
    joinDryRunStatus: bridgeCandidateRaceCount > 0 ? "READY_FOR_EXACT_DATE_HISTORY_BRIDGE" : "HISTORY_STRUCTURE_NOT_COMPATIBLE",
    matchedHistoryRaceCount,
    matchedStarterRaceCount,
    bridgeCandidateRaceCount,
    blockedRaceCount,
    joinPreview: preview,
    blockReasonCounts,
  };
}

function buildReadiness({ startersSourcePass, historyIndexExists, historySourceCount, exactDateMatchedHistoryCount, joinDryRunStatus }) {
  if (!startersSourcePass) {
    return {
      status: "BLOCKED",
      reason: "starters source quality is not PASS",
    };
  }
  if (!historyIndexExists) {
    return {
      status: "BLOCKED",
      reason: "history index missing",
    };
  }
  if (exactDateMatchedHistoryCount === 0 && historySourceCount > 0) {
    return {
      status: "READY_WHEN_HISTORY_DATE_AVAILABLE",
      reason: "latest starters date is not present in current history index",
    };
  }
  if (joinDryRunStatus === "READY_FOR_EXACT_DATE_HISTORY_BRIDGE") {
    return {
      status: "READY_FOR_EXACT_DATE_HISTORY_BRIDGE_DRY_RUN",
      reason: "same-date history and exact join key are available",
    };
  }
  return {
    status: "NEEDS_HISTORY_STRUCTURE_MAPPING",
    reason: "same-date history exists but exact join key was not established",
  };
}

function printSection(title, value) {
  console.log("");
  console.log(title);
  console.log(JSON.stringify(value, null, 2));
}

function compactHistoryCandidate(candidate, latestStartersDate) {
  return {
    path: candidate.path,
    date: candidate.date,
    schemaVersion: candidate.schemaVersion ?? null,
    raceCount: candidate.raceCount ?? null,
    itemCount: candidate.itemCount ?? null,
    joinKeyCandidates: candidate.joinKeyCandidates ?? [],
    noStartersMarkerCount: candidate.noStartersMarkerCount ?? 0,
    exactDateMatched: candidate.date === latestStartersDate,
    futureBridgeCandidate: candidate.date !== latestStartersDate && (candidate.noStartersMarkerCount ?? 0) > 0,
  };
}

async function main() {
  const blockReasonCounts = {};
  const indexCheck = await checkStartersSourceIndex(SOURCE_INDEX_PATH, ROOT);
  let startersIndex = null;
  let startersSource = null;
  let historyIndex = null;
  const historyCandidates = [];

  if (!existsSync(path.resolve(ROOT, SOURCE_INDEX_PATH))) {
    increment(blockReasonCounts, "STARTERS_INDEX_CHECK_FAILED");
  } else {
    startersIndex = await readJson(SOURCE_INDEX_PATH);
    for (const reason of validateStartersIndex(startersIndex, indexCheck)) {
      increment(blockReasonCounts, reason);
    }
  }

  const latestStartersSourcePath = startersIndex?.latest?.path ?? null;
  if (!latestStartersSourcePath || !existsSync(path.resolve(ROOT, latestStartersSourcePath))) {
    increment(blockReasonCounts, "STARTERS_SOURCE_CHECK_FAILED");
  } else {
    startersSource = await readJson(latestStartersSourcePath);
    for (const reason of validateLatestStartersSource(startersSource, startersIndex)) {
      increment(blockReasonCounts, reason);
    }
  }

  if (!existsSync(path.resolve(ROOT, HISTORY_INDEX_PATH))) {
    increment(blockReasonCounts, "HISTORY_INDEX_MISSING");
  } else {
    try {
      historyIndex = await readJson(HISTORY_INDEX_PATH);
    } catch {
      increment(blockReasonCounts, "HISTORY_INDEX_PARSE_FAILED");
    }
  }

  const historyItems = Array.isArray(historyIndex?.items) ? historyIndex.items : [];
  for (const item of historyItems) {
    const publicPath = toPublicRelativePath(item?.file);
    if (!existsSync(path.resolve(ROOT, publicPath))) {
      increment(blockReasonCounts, "HISTORY_SOURCE_MISSING");
      historyCandidates.push({
        path: item?.file,
        publicPath,
        date: item?.date,
        parseStatus: "missing",
      });
      continue;
    }
    try {
      const payload = await readJson(publicPath);
      historyCandidates.push({
        ...analyzeHistoryPayload(item, payload),
        parseStatus: "PASS",
      });
    } catch {
      increment(blockReasonCounts, "HISTORY_SOURCE_PARSE_FAILED");
      historyCandidates.push({
        path: item?.file,
        publicPath,
        date: item?.date,
        parseStatus: "parse-failed",
      });
    }
  }

  const latestStartersDate = startersSource?.date ?? startersIndex?.latest?.date ?? null;
  const exactDateHistories = historyCandidates.filter((candidate) => candidate.date === latestStartersDate);
  const noStartersMarkerCount = historyCandidates.reduce((total, candidate) => total + toInteger(candidate.noStartersMarkerCount), 0);
  if (noStartersMarkerCount === 0) increment(blockReasonCounts, "NO_STARTERS_MARKERS_NOT_FOUND");

  const startersSourcePass =
    indexCheck.checkStatus === "PASS" &&
    startersSource?.quality?.checkStatus === "PASS" &&
    !blockReasonCounts.STARTERS_INDEX_CHECK_FAILED &&
    !blockReasonCounts.STARTERS_SOURCE_CHECK_FAILED &&
    !blockReasonCounts.FAKE_COMPLETION_FOUND &&
    !blockReasonCounts.FUZZY_MATCHING_FOUND &&
    !blockReasonCounts.PROHIBITED_SOURCE_FOUND;

  const sourceMaps = Object.fromEntries(
    ["dateVenueNameRaceNumber", "dateVenueKeyRaceNumber", "raceId", "raceKey"].map((keyType) => [
      keyType,
      sourceRaceMap(startersSource, keyType),
    ]),
  );
  const noStartersResolutionCandidates = [];
  const resolutionCounts = {
    exactDateResolvable: 0,
    futureDateResolvable: 0,
    notResolvable: 0,
    blocked: 0,
  };
  for (const history of historyCandidates) {
    for (const race of history.noStartersRaces ?? []) {
      const resolution = classifyResolutionCandidate(race, latestStartersDate, startersSourcePass, sourceMaps);
      resolutionCounts[resolution.resolutionClass] += 1;
      if (noStartersResolutionCandidates.length < 20) {
        noStartersResolutionCandidates.push({
          historyPath: history.path,
          date: race.date,
          venueName: race.venueName,
          venueKey: race.venueKey,
          raceNumber: race.raceNumber,
          markerReasons: race.markerReasons,
          joinKeyCandidates: race.joinKeyCandidates,
          ...resolution,
        });
      }
    }
  }

  const join = joinDryRun(exactDateHistories, startersSource);
  const historyBridgeReadiness = buildReadiness({
    startersSourcePass,
    historyIndexExists: Boolean(historyIndex),
    historySourceCount: historyItems.length,
    exactDateMatchedHistoryCount: exactDateHistories.length,
    joinDryRunStatus: join.joinDryRunStatus,
  });

  const summary = {
    startersIndexPath: SOURCE_INDEX_PATH,
    latestStartersSourcePath,
    latestStartersDate,
    startersIndexCheckStatus: indexCheck.checkStatus,
    latestStartersCheckStatus: startersSourcePass ? "PASS" : "FAIL",
    latestStartersRaceCount: toInteger(startersSource?.summary?.raceCount),
    latestStartersStarterCount: toInteger(startersSource?.summary?.starterCount),
    historyIndexPath: HISTORY_INDEX_PATH,
    historyIndexExists: Boolean(historyIndex),
    historySourceCount: historyItems.length,
    historyDateRange: {
      from: historyIndex?.period?.from ?? historyCandidates[0]?.date ?? null,
      to: historyIndex?.period?.to ?? historyCandidates.at(-1)?.date ?? null,
    },
    matchingHistoryDateCount: exactDateHistories.length,
    exactDateMatchedHistoryCount: exactDateHistories.length,
    noExactDateMatchedReason: exactDateHistories.length === 0 ? "EXACT_DATE_HISTORY_NOT_FOUND" : null,
    noStartersMarkerCount,
    joinDryRunStatus: join.joinDryRunStatus,
    matchedHistoryRaceCount: join.matchedHistoryRaceCount,
    matchedStarterRaceCount: join.matchedStarterRaceCount,
    bridgeCandidateRaceCount: join.bridgeCandidateRaceCount,
    blockedRaceCount: join.blockedRaceCount,
    blockReasonCounts: {
      ...blockReasonCounts,
      ...join.blockReasonCounts,
    },
    noStartersResolutionCounts: resolutionCounts,
    historyBridgeReadiness,
    writesPerformed: false,
    analyticsModified: false,
    racesModified: false,
    reviewsModified: false,
    protectedFilesModified: false,
    fakeCompletionPerformed: startersSource?.quality?.fakeCompletionPerformed === true,
    fuzzyMatchingPerformed: startersSource?.quality?.fuzzyMatchingPerformed === true,
    resultLineupPredictionUsedAsStarterSource:
      startersSource?.quality?.resultLineupPredictionUsedAsStarterSource === true,
  };

  console.log("[kurari-ex history NO_STARTERS bridge dry-run]");
  console.log("");
  console.log("[summary]");
  for (const key of [
    "startersIndexPath",
    "latestStartersSourcePath",
    "latestStartersDate",
    "startersIndexCheckStatus",
    "latestStartersCheckStatus",
    "latestStartersRaceCount",
    "latestStartersStarterCount",
    "historyIndexPath",
    "historyIndexExists",
    "historySourceCount",
    "exactDateMatchedHistoryCount",
    "noExactDateMatchedReason",
    "noStartersMarkerCount",
    "joinDryRunStatus",
    "matchedHistoryRaceCount",
    "matchedStarterRaceCount",
    "bridgeCandidateRaceCount",
    "blockedRaceCount",
  ]) {
    console.log(`${key}: ${summary[key] ?? null}`);
  }
  console.log(`historyDateRange: ${JSON.stringify(summary.historyDateRange)}`);
  console.log(`blockReasonCounts: ${JSON.stringify(summary.blockReasonCounts)}`);
  console.log(`historyBridgeReadiness: ${JSON.stringify(summary.historyBridgeReadiness)}`);
  for (const key of [
    "writesPerformed",
    "analyticsModified",
    "racesModified",
    "reviewsModified",
    "protectedFilesModified",
    "fakeCompletionPerformed",
    "fuzzyMatchingPerformed",
    "resultLineupPredictionUsedAsStarterSource",
  ]) {
    console.log(`${key}: ${summary[key]}`);
  }
  const compactHistoryCandidates = historyCandidates
    .slice(0, 20)
    .map((candidate) => compactHistoryCandidate(candidate, latestStartersDate));
  const compactJoinPreview = join.joinPreview.slice(0, 10);
  const compactResolutionCandidates = noStartersResolutionCandidates.slice(0, 20);
  printSection("[historyCandidates]", compactHistoryCandidates);
  printSection("[joinPreview]", compactJoinPreview);
  printSection("[noStartersResolutionCandidates]", compactResolutionCandidates);
  printSection("[jsonSummary]", {
    ...summary,
    historyCandidates: compactHistoryCandidates,
    joinPreview: compactJoinPreview,
    noStartersResolutionCandidates: compactResolutionCandidates,
  });

  if (historyBridgeReadiness.status === "BLOCKED") process.exitCode = 1;
}

main().catch((error) => {
  console.error("[kurari-ex history NO_STARTERS bridge dry-run] failed");
  console.error(error);
  process.exitCode = 1;
});
