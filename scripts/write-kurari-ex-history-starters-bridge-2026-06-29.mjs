import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const TARGET_DATE = "2026-06-29";
export const HISTORY_DAILY_PATH =
  "public/data/analytics/kurari-ex/history/daily/2026-06/2026-06-29.generated.json";
export const HISTORY_INDEX_PATH =
  "public/data/analytics/kurari-ex/history/index.generated.json";
export const HISTORY_DAILY_PUBLIC_PATH =
  "/data/analytics/kurari-ex/history/daily/2026-06/2026-06-29.generated.json";
export const STARTERS_SOURCE_PATH =
  "public/data/analytics/kurari-ex/source/starters/2026-06-29/today-registration-starters.generated.json";
export const ENTRIES_SNAPSHOT_PATH =
  "public/data/races/entries-history/2026-06-29/keirin-jp-entries.generated.json";
export const EXPECTED_CURRENT_HISTORY_DAILY_HASH =
  "sha256:96a4d2399cf7f57f777170648c9ab8da2f87f20b5bdcc3ed680f2ca6b67d6e2f";
export const EXPECTED_CANDIDATE_PAYLOAD_HASH =
  "sha256:21b9c6a425c6207c2995d434486957d264f83b3f8ea2b336ec92749376652c46";

const ROOT = process.cwd();
const THIS_SCRIPT =
  "scripts/write-kurari-ex-history-starters-bridge-2026-06-29.mjs";
const CHECKER_SCRIPT =
  "scripts/check-kurari-ex-history-starters-bridge-2026-06-29.mjs";
const KNOWN_REVIEWS = [
  "public/data/reviews/index.json",
  "public/data/reviews/2026-06-28/",
  "public/data/reviews/2026-06-29/",
  "public/data/reviews/2026-06-30/",
];

export const asArray = (value) => (Array.isArray(value) ? value : []);
export const clone = (value) => structuredClone(value);
export const text = (value) => String(value ?? "").trim();
export const hashPayload = (value) =>
  `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
export const jsonBytes = (value) =>
  Buffer.byteLength(`${JSON.stringify(value, null, 2)}\n`, "utf8");

export async function readJson(file) {
  try {
    const raw = await readFile(path.resolve(ROOT, file), "utf8");
    return { exists: true, parseStatus: "ok", payload: JSON.parse(raw), raw };
  } catch (error) {
    return {
      exists: error?.code !== "ENOENT",
      parseStatus: error?.code === "ENOENT" ? "missing" : "failed",
      payload: null,
      raw: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function exactJoin(historyItems, sourceRaces) {
  const sourceGroups = new Map();
  for (const race of sourceRaces) {
    const key = `${text(race.date)}::${text(race.venueName)}::${text(race.raceNumber)}`;
    sourceGroups.set(key, [...(sourceGroups.get(key) ?? []), race]);
  }
  const duplicateJoinKeyCount = [...sourceGroups.values()]
    .filter((races) => races.length !== 1).length;
  const sourceByKey = new Map(
    [...sourceGroups].filter(([, races]) => races.length === 1)
      .map(([key, races]) => [key, races[0]]),
  );
  const used = new Set();
  const matches = historyItems.map((historyRace) => {
    const key =
      `${text(historyRace.date)}::${text(historyRace.venueName)}::${text(historyRace.raceNumber)}`;
    const sourceRace = sourceByKey.get(key) ?? null;
    if (sourceRace) used.add(sourceRace);
    return { historyRace, sourceRace, key };
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
  return {
    matches,
    summary: {
      raceKeyDirectMatchedCount: 0,
      dateVenueNameRaceNumberMatchedCount: matchedRaceCount,
      matchedRaceCount,
      bridgeEligibleRaceCount,
      bridgeBlockedRaceCount: historyItems.length - bridgeEligibleRaceCount,
      unmatchedHistoryRaceCount: historyItems.length - matchedRaceCount,
      unmatchedStartersRaceCount:
        sourceRaces.filter((race) => !used.has(race)).length,
      duplicateJoinKeyCount,
      joinMethod: "dateVenueNameRaceNumber",
      exactJoinStatus:
        matchedRaceCount === historyItems.length
        && used.size === sourceRaces.length
        && duplicateJoinKeyCount === 0
          ? "OK"
          : "FAIL",
      fakeCompletionPerformed: false,
      fuzzyMatchingPerformed: false,
      predictionUsedAsStarterSource: false,
      resultUsedAsStarterSource: false,
      lineupUsedAsStarterSource: false,
      registrationNoGenerated: false,
    },
  };
}

export function buildCandidate(history, join) {
  const sourceByHistoryItem = new Map(
    join.matches.map(({ historyRace, sourceRace }) => [historyRace, sourceRace]),
  );
  const candidate = clone(history);
  candidate.items = asArray(history.items).map((item) => {
    const sourceRace = sourceByHistoryItem.get(item);
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

export function stripAllowedChanges(item) {
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

function fieldChangedCount(beforeItems, afterItems, field) {
  return beforeItems.filter(
    (item, index) =>
      JSON.stringify(item?.[field]) !== JSON.stringify(afterItems[index]?.[field]),
  ).length;
}

export function candidateSummary(history, candidate) {
  const beforeItems = asArray(history.items);
  const afterItems = asArray(candidate.items);
  const starters = afterItems.flatMap((item) => asArray(item.starters));
  return {
    candidatePayloadHash: hashPayload(candidate),
    expectedCandidatePayloadHash: EXPECTED_CANDIDATE_PAYLOAD_HASH,
    candidatePayloadHashMatched:
      hashPayload(candidate) === EXPECTED_CANDIDATE_PAYLOAD_HASH,
    candidateRaceCount: afterItems.length,
    candidateStartersNonEmptyRaceCount:
      afterItems.filter((item) => asArray(item.starters).length > 0).length,
    candidateStarterTotalCount: starters.length,
    candidateMissingRegistrationNoCount:
      starters.filter((starter) => !text(starter.registrationNo)).length,
    nonStarterFieldChangedCount: beforeItems.filter(
      (item, index) =>
        JSON.stringify(stripAllowedChanges(item))
        !== JSON.stringify(stripAllowedChanges(afterItems[index])),
    ).length,
    resultChangedCount: fieldChangedCount(beforeItems, afterItems, "result"),
    predictionChangedCount:
      fieldChangedCount(beforeItems, afterItems, "prediction"),
    lineupChangedCount: fieldChangedCount(beforeItems, afterItems, "lineup"),
    weatherChangedCount: fieldChangedCount(beforeItems, afterItems, "weather"),
    estimatedJsonBytes: jsonBytes(candidate),
  };
}

function inspectHistoryIndex(index, candidate) {
  const items = asArray(index?.items);
  const targetEntries = items.filter((item) => item?.date === TARGET_DATE);
  const target = targetEntries[0] ?? null;
  const latest = [...items].sort((a, b) =>
    text(a?.date).localeCompare(text(b?.date)),
  ).at(-1) ?? null;
  const dependentFields = [];
  for (const key of ["bytes", "size", "hash", "digest", "checksum"]) {
    if (Object.hasOwn(target ?? {}, key)) dependentFields.push(`targetDate.${key}`);
  }
  for (const key of [
    "totalBytes",
    "totalSize",
    "contentHash",
    "hash",
    "digest",
    "checksum",
  ]) {
    if (Object.hasOwn(index ?? {}, key)) dependentFields.push(`topLevel.${key}`);
  }
  const currentTargetBytes = Number(target?.bytes);
  const candidateBytes = jsonBytes(candidate);
  const contentDependentMetadataWouldChange =
    dependentFields.length > 0
    && (
      !Number.isFinite(currentTargetBytes)
      || currentTargetBytes !== candidateBytes
      || dependentFields.some((field) => field !== "targetDate.bytes")
    );
  return {
    exists: Boolean(index),
    targetDateEntryExists: targetEntries.length === 1,
    targetDatePath: target?.file ?? null,
    targetDateRaceCount: target?.raceCount ?? null,
    latestDate: latest?.date ?? null,
    latestPath: latest?.file ?? null,
    topLevelRaceCount: index?.raceCount ?? null,
    currentTargetBytes: Number.isFinite(currentTargetBytes)
      ? currentTargetBytes
      : null,
    candidateBytes,
    contentDependentFields: dependentFields,
    contentDependentMetadataWouldChange,
    indexChangeRequired: contentDependentMetadataWouldChange,
    indexUpdateAllowed: false,
    policyStatus: contentDependentMetadataWouldChange
      ? "NEEDS_HISTORY_INDEX_REFRESH_POLICY"
      : "INDEX_UPDATE_NOT_REQUIRED",
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

export function protectedModificationGuard() {
  const lines = gitLines(["status", "--porcelain=v1", "--untracked-files=normal"]);
  const files = lines.map(statusPath);
  const stagedFiles = gitLines(["diff", "--cached", "--name-only"]);
  const knownReview = (file) => KNOWN_REVIEWS.some(
    (known) => known.endsWith("/") ? file.startsWith(known) : file === known,
  );
  const allowedFiles = [THIS_SCRIPT, CHECKER_SCRIPT, HISTORY_DAILY_PATH];
  const allowed = (file) => allowedFiles.includes(file) || knownReview(file);
  const unexpected = files.filter((file) => !allowed(file));
  const result = {
    allowedFiles,
    unexpectedFiles: unexpected,
    historyIndexModified: files.includes(HISTORY_INDEX_PATH),
    historyDailyModified: files.includes(HISTORY_DAILY_PATH),
    analyticsSourceModified: files.some((file) =>
      file.startsWith("public/data/analytics/kurari-ex/source/")),
    racesModified: files.some((file) => file.startsWith("public/data/races/")),
    reviewsModifiedByThisStep: files.some(
      (file) => file.startsWith("public/data/reviews/") && !knownReview(file),
    ),
    privateInputModified: files.some((file) => file.startsWith("private-input/")),
    srcModified: files.some((file) => file.startsWith("src/")),
    packageModified: files.includes("package.json"),
    existingScriptModified: files.some(
      (file) =>
        file.startsWith("scripts/")
        && file !== THIS_SCRIPT
        && file !== CHECKER_SCRIPT,
    ),
    stagedFiles,
  };
  result.guardStatus =
    unexpected.length === 0
    && !result.historyIndexModified
    && !result.analyticsSourceModified
    && !result.racesModified
    && !result.reviewsModifiedByThisStep
    && !result.privateInputModified
    && !result.srcModified
    && !result.packageModified
    && !result.existingScriptModified
    && stagedFiles.length === 0
      ? "pass"
      : "fail";
  return result;
}

async function writeCandidate(candidate) {
  const target = path.resolve(ROOT, HISTORY_DAILY_PATH);
  const temporary = `${target}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(candidate, null, 2)}\n`, "utf8");
  await rename(temporary, target);
}

function printSection(name, value) {
  console.log(`\n[${name}]`);
  console.log(JSON.stringify(value, null, 2));
}

export async function writeHistoryStartersBridge() {
  const [historyRead, indexRead, sourceRead, entriesRead] = await Promise.all([
    readJson(HISTORY_DAILY_PATH),
    readJson(HISTORY_INDEX_PATH),
    readJson(STARTERS_SOURCE_PATH),
    readJson(ENTRIES_SNAPSHOT_PATH),
  ]);
  const history = historyRead.payload ?? {};
  const index = indexRead.payload ?? {};
  const source = sourceRead.payload ?? {};
  const entries = entriesRead.payload ?? {};
  const currentHashBefore = historyRead.payload ? hashPayload(history) : null;
  const alreadyBridged =
    currentHashBefore === EXPECTED_CANDIDATE_PAYLOAD_HASH;
  const join = exactJoin(asArray(history.items), asArray(source.races));
  const candidate = alreadyBridged ? clone(history) : buildCandidate(history, join);
  const candidateInfo = candidateSummary(history, candidate);
  const indexPolicy = inspectHistoryIndex(index, candidate);
  const sourceStarters =
    asArray(source.races).flatMap((race) => asArray(race.starters));
  const entryStarters =
    asArray(entries.races).flatMap((race) => asArray(race.entries));
  const precondition = {
    historyDailyExists: historyRead.exists,
    historyDailyParseStatus: historyRead.parseStatus,
    currentHistoryDailyHash: currentHashBefore,
    currentHistoryDailyHashMatched:
      currentHashBefore === EXPECTED_CURRENT_HISTORY_DAILY_HASH,
    historyIndexExists: indexRead.exists,
    historyIndexParseStatus: indexRead.parseStatus,
    startersSourceExists: sourceRead.exists,
    startersSourceParseStatus: sourceRead.parseStatus,
    entriesSnapshotExists: entriesRead.exists,
    entriesSnapshotParseStatus: entriesRead.parseStatus,
    historyRaceCount: asArray(history.items).length,
    startersSourceRaceCount: asArray(source.races).length,
    startersSourceStarterCount: sourceStarters.length,
    entriesSnapshotRaceCount: asArray(entries.races).length,
    entriesSnapshotStarterCount: entryStarters.length,
    sourceMissingRegistrationNoCount:
      sourceStarters.filter((starter) => !text(starter.registrationNo)).length,
    exactJoinStatus: join.summary.exactJoinStatus,
  };
  let writerStatus = "BLOCKED";
  let writePerformed = false;
  let noOp = false;
  if (alreadyBridged) {
    writerStatus = "NOOP_ALREADY_BRIDGED";
    noOp = true;
  } else if (
    !historyRead.exists
    || historyRead.parseStatus !== "ok"
    || !indexRead.exists
    || indexRead.parseStatus !== "ok"
    || !sourceRead.exists
    || sourceRead.parseStatus !== "ok"
    || !entriesRead.exists
    || entriesRead.parseStatus !== "ok"
  ) {
    writerStatus = "BLOCKED";
  } else if (currentHashBefore !== EXPECTED_CURRENT_HISTORY_DAILY_HASH) {
    writerStatus = "BLOCKED_CURRENT_HISTORY_HASH_MISMATCH";
  } else if (
    !indexPolicy.targetDateEntryExists
    || indexPolicy.targetDatePath !== HISTORY_DAILY_PUBLIC_PATH
    || indexPolicy.targetDateRaceCount !== 64
    || indexPolicy.latestDate !== TARGET_DATE
    || indexPolicy.latestPath !== HISTORY_DAILY_PUBLIC_PATH
  ) {
    writerStatus = "BLOCKED";
  } else if (indexPolicy.contentDependentMetadataWouldChange) {
    writerStatus = "NEEDS_HISTORY_INDEX_REFRESH_POLICY";
  } else if (!candidateInfo.candidatePayloadHashMatched) {
    writerStatus = "BLOCKED_CANDIDATE_HASH_MISMATCH";
  } else if (
    candidateInfo.nonStarterFieldChangedCount > 0
    || candidateInfo.resultChangedCount > 0
    || candidateInfo.predictionChangedCount > 0
    || candidateInfo.lineupChangedCount > 0
    || candidateInfo.weatherChangedCount > 0
  ) {
    writerStatus = "BLOCKED_NON_STARTER_FIELD_CHANGE";
  } else if (
    precondition.historyRaceCount !== 64
    || precondition.startersSourceRaceCount !== 64
    || precondition.startersSourceStarterCount !== 464
    || precondition.entriesSnapshotRaceCount !== 64
    || precondition.entriesSnapshotStarterCount !== 464
    || precondition.sourceMissingRegistrationNoCount !== 0
    || join.summary.exactJoinStatus !== "OK"
  ) {
    writerStatus = "BLOCKED";
  } else {
    await writeCandidate(candidate);
    writePerformed = true;
    writerStatus = "WRITE_COMPLETED";
  }
  const historyAfter = await readJson(HISTORY_DAILY_PATH);
  const currentHashAfter = historyAfter.payload
    ? hashPayload(historyAfter.payload)
    : null;
  const guard = protectedModificationGuard();
  if (guard.guardStatus !== "pass" && writerStatus === "WRITE_COMPLETED") {
    writerStatus = "BLOCKED";
  }
  const summary = {
    targetDate: TARGET_DATE,
    historyDailyPath: HISTORY_DAILY_PATH,
    historyIndexPath: HISTORY_INDEX_PATH,
    startersSourcePath: STARTERS_SOURCE_PATH,
    entriesSnapshotPath: ENTRIES_SNAPSHOT_PATH,
    currentHistoryDailyHashBefore: currentHashBefore,
    expectedCurrentHistoryDailyHash: EXPECTED_CURRENT_HISTORY_DAILY_HASH,
    currentHistoryDailyHashMatched:
      currentHashBefore === EXPECTED_CURRENT_HISTORY_DAILY_HASH,
    expectedCandidatePayloadHash: EXPECTED_CANDIDATE_PAYLOAD_HASH,
    candidatePayloadHash: candidateInfo.candidatePayloadHash,
    candidatePayloadHashMatched: candidateInfo.candidatePayloadHashMatched,
    alreadyBridged,
    writePerformed,
    noOp,
    writeMode: "replace-history-daily-starters-only-with-hash-preconditions",
    historyRaceCount: precondition.historyRaceCount,
    startersSourceRaceCount: precondition.startersSourceRaceCount,
    entriesSnapshotRaceCount: precondition.entriesSnapshotRaceCount,
    ...join.summary,
    ...candidateInfo,
    historyIndexModified: guard.historyIndexModified,
    historyDailyModified: currentHashAfter !== currentHashBefore,
    analyticsSourceModified: guard.analyticsSourceModified,
    racesModified: guard.racesModified,
    reviewsModifiedByThisStep: guard.reviewsModifiedByThisStep,
    privateInputModified: guard.privateInputModified,
    srcModified: guard.srcModified,
    packageModified: guard.packageModified,
    existingScriptModified: guard.existingScriptModified,
    writerStatus,
  };
  const writeResult = {
    writerStatus,
    writePerformed,
    noOp,
    alreadyBridged,
    currentHistoryDailyHashBefore: currentHashBefore,
    currentHistoryDailyHashAfter: currentHashAfter,
  };
  return {
    summary,
    precondition,
    historyIndexConsistencyPolicy: indexPolicy,
    exactJoin: join.summary,
    candidatePayload: candidateInfo,
    writeResult,
    protectedModificationGuard: guard,
    jsonSummary: {
      ...summary,
      preconditionStatus:
        writerStatus === "WRITE_COMPLETED" || writerStatus === "NOOP_ALREADY_BRIDGED"
          ? "pass"
          : "blocked",
    },
  };
}

async function main() {
  const result = await writeHistoryStartersBridge();
  printSection("summary", result.summary);
  printSection("precondition", result.precondition);
  printSection(
    "historyIndexConsistencyPolicy",
    result.historyIndexConsistencyPolicy,
  );
  printSection("exactJoin", result.exactJoin);
  printSection("candidatePayload", result.candidatePayload);
  printSection("writeResult", result.writeResult);
  printSection("protectedModificationGuard", result.protectedModificationGuard);
  printSection("jsonSummary", result.jsonSummary);
  if (
    result.summary.writerStatus !== "WRITE_COMPLETED"
    && result.summary.writerStatus !== "NOOP_ALREADY_BRIDGED"
  ) {
    process.exitCode = 1;
  }
}

const isMain =
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  main().catch((error) => {
    console.error("[kurari-ex history starters bridge writer] failed");
    console.error(error);
    process.exitCode = 1;
  });
}
