import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const ROOT = process.cwd();
export const TARGET_DATE = "2026-06-29";
export const DAILY_PATH =
  "public/data/analytics/kurari-ex/history/daily/2026-06/2026-06-29.generated.json";
export const INDEX_PATH =
  "public/data/analytics/kurari-ex/history/index.generated.json";
export const DAILY_PUBLIC_PATH =
  "/data/analytics/kurari-ex/history/daily/2026-06/2026-06-29.generated.json";
export const SOURCE_PATH =
  "public/data/analytics/kurari-ex/source/starters/2026-06-29/today-registration-starters.generated.json";
export const ENTRIES_PATH =
  "public/data/races/entries-history/2026-06-29/keirin-jp-entries.generated.json";
export const CURRENT_DAILY_HASH =
  "sha256:96a4d2399cf7f57f777170648c9ab8da2f87f20b5bdcc3ed680f2ca6b67d6e2f";
export const CANDIDATE_DAILY_HASH =
  "sha256:21b9c6a425c6207c2995d434486957d264f83b3f8ea2b336ec92749376652c46";
export const CURRENT_INDEX_HASH =
  "sha256:f666535d4ed263bf3a94ad25d8d78a814f7954776aed09347b53b34c83f8515a";
export const CANDIDATE_INDEX_HASH =
  "sha256:d506eaf1f4765636d3196048843c6375049f0b964a2b1298fecb18d14ecb1d74";
export const CURRENT_DAILY_BYTES = 154559;
export const CANDIDATE_DAILY_BYTES = 441362;
export const CURRENT_TOTAL_BYTES = 10722569;
export const CANDIDATE_TOTAL_BYTES = 11009372;
export const ALLOWED_INDEX_PATHS = [
  "totalBytes",
  "items[2026-06-29].bytes",
];

const THIS_SCRIPT =
  "scripts/write-kurari-ex-combined-history-starters-bridge-2026-06-29.mjs";
const CHECKER_SCRIPT =
  "scripts/check-kurari-ex-combined-history-starters-bridge-2026-06-29.mjs";
const KNOWN_REVIEWS = [
  "public/data/reviews/index.json",
  "public/data/reviews/2026-06-28/",
  "public/data/reviews/2026-06-29/",
  "public/data/reviews/2026-06-30/",
];

export const clone = (value) => structuredClone(value);
export const array = (value) => (Array.isArray(value) ? value : []);
export const text = (value) => String(value ?? "").trim();
export const hashPayload = (value) =>
  `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
export const stringifyPayload = (value) => `${JSON.stringify(value, null, 2)}\n`;
export const payloadBytes = (value) =>
  Buffer.byteLength(stringifyPayload(value), "utf8");

export async function readJson(file) {
  try {
    const raw = await readFile(path.resolve(ROOT, file), "utf8");
    return {
      exists: true,
      parseStatus: "ok",
      raw,
      bytes: Buffer.byteLength(raw, "utf8"),
      payload: JSON.parse(raw),
    };
  } catch (error) {
    return {
      exists: error?.code !== "ENOENT",
      parseStatus: error?.code === "ENOENT" ? "missing" : "failed",
      raw: null,
      bytes: null,
      payload: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function exactJoin(historyItems, sourceRaces) {
  const groups = new Map();
  for (const race of sourceRaces) {
    const key = `${text(race.date)}::${text(race.venueName)}::${text(race.raceNumber)}`;
    groups.set(key, [...(groups.get(key) ?? []), race]);
  }
  const sourceByKey = new Map(
    [...groups].filter(([, races]) => races.length === 1)
      .map(([key, races]) => [key, races[0]]),
  );
  const used = new Set();
  const matches = historyItems.map((historyRace) => {
    const key =
      `${text(historyRace.date)}::${text(historyRace.venueName)}::${text(historyRace.raceNumber)}`;
    const sourceRace = sourceByKey.get(key) ?? null;
    if (sourceRace) used.add(sourceRace);
    return { historyRace, sourceRace };
  });
  const matchedRaceCount = matches.filter((match) => match.sourceRace).length;
  const bridgeEligibleRaceCount = matches.filter(
    ({ sourceRace }) =>
      array(sourceRace?.starters).length > 0
      && array(sourceRace?.starters).every(
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
      duplicateJoinKeyCount:
        [...groups.values()].filter((races) => races.length > 1).length,
    },
  };
}

export function buildDailyCandidate(history, join) {
  const sourceByHistory = new Map(
    join.matches.map(({ historyRace, sourceRace }) => [historyRace, sourceRace]),
  );
  const candidate = clone(history);
  candidate.items = array(history.items).map((item) => {
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

export function buildIndexCandidate(index) {
  const candidate = clone(index);
  candidate.totalBytes = CANDIDATE_TOTAL_BYTES;
  const target = array(candidate.items)
    .find((item) => item?.date === TARGET_DATE);
  if (target) target.bytes = CANDIDATE_DAILY_BYTES;
  return candidate;
}

export function stripStarterChanges(item) {
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

export function indexDiffPaths(before, after) {
  const changed = [];
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (key !== "items" && JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changed.push(key);
    }
  }
  const beforeByDate = new Map(array(before.items).map((item) => [item.date, item]));
  const afterByDate = new Map(array(after.items).map((item) => [item.date, item]));
  for (const date of new Set([...beforeByDate.keys(), ...afterByDate.keys()])) {
    const left = beforeByDate.get(date) ?? {};
    const right = afterByDate.get(date) ?? {};
    for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
      if (JSON.stringify(left[key]) !== JSON.stringify(right[key])) {
        changed.push(`items[${date}].${key}`);
      }
    }
  }
  return changed;
}

export function reconstructBaselineDaily(bridged) {
  const baseline = clone(bridged);
  baseline.items = array(baseline.items).map((item) => {
    const quality = clone(item.quality ?? {});
    if (Object.hasOwn(quality, "starterParsed")) quality.starterParsed = false;
    delete quality.starterSource;
    quality.warnings = [
      "starter identity intentionally not generated in this dry-run",
    ];
    return { ...clone(item), starters: [], quality };
  });
  return baseline;
}

export function reconstructBaselineIndex(updated) {
  const baseline = clone(updated);
  baseline.totalBytes = CURRENT_TOTAL_BYTES;
  const target = array(baseline.items)
    .find((item) => item?.date === TARGET_DATE);
  if (target) target.bytes = CURRENT_DAILY_BYTES;
  return baseline;
}

function changedFieldCount(before, after, field) {
  return before.filter(
    (item, index) =>
      JSON.stringify(item?.[field]) !== JSON.stringify(after[index]?.[field]),
  ).length;
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

export function protectedGuard() {
  const lines = gitLines(["status", "--porcelain=v1", "--untracked-files=normal"]);
  const files = lines.map(statusPath);
  const stagedFiles = gitLines(["diff", "--cached", "--name-only"]);
  const knownReview = (file) => KNOWN_REVIEWS.some(
    (known) => known.endsWith("/") ? file.startsWith(known) : file === known,
  );
  const permitted = [THIS_SCRIPT, CHECKER_SCRIPT, DAILY_PATH, INDEX_PATH];
  const unexpected = files.filter(
    (file) => !permitted.includes(file) && !knownReview(file),
  );
  const guard = {
    permittedFiles: permitted,
    unexpectedFiles: unexpected,
    historyDailyModified: files.includes(DAILY_PATH),
    historyIndexModified: files.includes(INDEX_PATH),
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
  guard.guardStatus =
    unexpected.length === 0
    && !guard.analyticsSourceModified
    && !guard.racesModified
    && !guard.reviewsModifiedByThisStep
    && !guard.privateInputModified
    && !guard.srcModified
    && !guard.packageModified
    && !guard.existingScriptModified
    && stagedFiles.length === 0
      ? "pass"
      : "fail";
  return guard;
}

async function writeBothWithRollback(dailyRead, indexRead, dailyCandidate, indexCandidate) {
  const dailyTarget = path.resolve(ROOT, DAILY_PATH);
  const indexTarget = path.resolve(ROOT, INDEX_PATH);
  const dailyTemp = `${dailyTarget}.combined-${process.pid}.tmp`;
  const indexTemp = `${indexTarget}.combined-${process.pid}.tmp`;
  const result = {
    candidatesPrepared: false,
    dailyWriteAttempted: false,
    indexWriteAttempted: false,
    rollbackAttempted: false,
    rollbackSucceeded: false,
    partialFailure: false,
  };
  try {
    await Promise.all([
      writeFile(dailyTemp, stringifyPayload(dailyCandidate), "utf8"),
      writeFile(indexTemp, stringifyPayload(indexCandidate), "utf8"),
    ]);
    const [tempDaily, tempIndex] = await Promise.all([
      readJson(dailyTemp),
      readJson(indexTemp),
    ]);
    if (
      hashPayload(tempDaily.payload) !== CANDIDATE_DAILY_HASH
      || tempDaily.bytes !== CANDIDATE_DAILY_BYTES
      || hashPayload(tempIndex.payload) !== CANDIDATE_INDEX_HASH
    ) {
      throw new Error("temporary candidate verification failed");
    }
    result.candidatesPrepared = true;
    result.dailyWriteAttempted = true;
    await writeFile(dailyTarget, stringifyPayload(dailyCandidate), "utf8");
    result.indexWriteAttempted = true;
    await writeFile(indexTarget, stringifyPayload(indexCandidate), "utf8");
    const [postDaily, postIndex] = await Promise.all([
      readJson(DAILY_PATH),
      readJson(INDEX_PATH),
    ]);
    if (
      hashPayload(postDaily.payload) !== CANDIDATE_DAILY_HASH
      || postDaily.bytes !== CANDIDATE_DAILY_BYTES
      || hashPayload(postIndex.payload) !== CANDIDATE_INDEX_HASH
    ) {
      throw new Error("post-write combined verification failed");
    }
    return result;
  } catch (error) {
    result.partialFailure = result.dailyWriteAttempted || result.indexWriteAttempted;
    if (result.partialFailure) {
      result.rollbackAttempted = true;
      try {
        await Promise.all([
          writeFile(dailyTarget, dailyRead.raw, "utf8"),
          writeFile(indexTarget, indexRead.raw, "utf8"),
        ]);
        const [rolledDaily, rolledIndex] = await Promise.all([
          readJson(DAILY_PATH),
          readJson(INDEX_PATH),
        ]);
        result.rollbackSucceeded =
          hashPayload(rolledDaily.payload) === hashPayload(dailyRead.payload)
          && hashPayload(rolledIndex.payload) === hashPayload(indexRead.payload);
      } catch {
        result.rollbackSucceeded = false;
      }
    }
    error.writeOperation = result;
    throw error;
  } finally {
    await Promise.all([
      rm(dailyTemp, { force: true }),
      rm(indexTemp, { force: true }),
    ]);
  }
}

function printSection(name, value) {
  console.log(`\n[${name}]`);
  console.log(JSON.stringify(value, null, 2));
}

export async function writeCombinedBridge() {
  const [dailyRead, indexRead, sourceRead, entriesRead] = await Promise.all([
    readJson(DAILY_PATH),
    readJson(INDEX_PATH),
    readJson(SOURCE_PATH),
    readJson(ENTRIES_PATH),
  ]);
  const daily = dailyRead.payload ?? {};
  const index = indexRead.payload ?? {};
  const source = sourceRead.payload ?? {};
  const entries = entriesRead.payload ?? {};
  const dailyHashBefore = dailyRead.payload ? hashPayload(daily) : null;
  const indexHashBefore = indexRead.payload ? hashPayload(index) : null;
  const alreadyCombinedUpdated =
    dailyHashBefore === CANDIDATE_DAILY_HASH
    && indexHashBefore === CANDIDATE_INDEX_HASH;
  const mixedDailyUpdated =
    dailyHashBefore === CANDIDATE_DAILY_HASH
    && indexHashBefore === CURRENT_INDEX_HASH;
  const mixedIndexUpdated =
    dailyHashBefore === CURRENT_DAILY_HASH
    && indexHashBefore === CANDIDATE_INDEX_HASH;
  const dailyForCandidate = alreadyCombinedUpdated
    ? reconstructBaselineDaily(daily)
    : daily;
  const indexForCandidate = alreadyCombinedUpdated
    ? reconstructBaselineIndex(index)
    : index;
  const join = exactJoin(array(dailyForCandidate.items), array(source.races));
  const dailyCandidate = buildDailyCandidate(dailyForCandidate, join);
  const indexCandidate = buildIndexCandidate(indexForCandidate);
  const dailyCandidateHash = hashPayload(dailyCandidate);
  const indexCandidateHash = hashPayload(indexCandidate);
  const dailyCandidateItems = array(dailyCandidate.items);
  const baselineItems = array(dailyForCandidate.items);
  const candidateStarters =
    dailyCandidateItems.flatMap((item) => array(item.starters));
  const changedPaths = indexDiffPaths(indexForCandidate, indexCandidate);
  const unexpectedChangedPaths =
    changedPaths.filter((field) => !ALLOWED_INDEX_PATHS.includes(field));
  const nonStarterFieldChangedCount = baselineItems.filter(
    (item, itemIndex) =>
      JSON.stringify(stripStarterChanges(item))
      !== JSON.stringify(stripStarterChanges(dailyCandidateItems[itemIndex])),
  ).length;
  const precondition = {
    dailyExists: dailyRead.exists,
    dailyParseStatus: dailyRead.parseStatus,
    indexExists: indexRead.exists,
    indexParseStatus: indexRead.parseStatus,
    sourceExists: sourceRead.exists,
    sourceParseStatus: sourceRead.parseStatus,
    entriesExists: entriesRead.exists,
    entriesParseStatus: entriesRead.parseStatus,
    currentDailyHash: dailyHashBefore,
    currentDailyBytes: dailyRead.bytes,
    currentIndexHash: indexHashBefore,
    currentIndexTotalBytes: index.totalBytes ?? null,
    currentTargetDateBytes:
      array(index.items).find((item) => item.date === TARGET_DATE)?.bytes ?? null,
  };
  const candidateDaily = {
    candidateDailyHash: dailyCandidateHash,
    expectedCandidateDailyHash: CANDIDATE_DAILY_HASH,
    candidateDailyHashMatched: dailyCandidateHash === CANDIDATE_DAILY_HASH,
    candidateDailyBytes: payloadBytes(dailyCandidate),
    expectedCandidateDailyBytes: CANDIDATE_DAILY_BYTES,
    candidateDailyBytesMatched:
      payloadBytes(dailyCandidate) === CANDIDATE_DAILY_BYTES,
    candidateRaceCount: dailyCandidateItems.length,
    candidateStarterTotal: candidateStarters.length,
    candidateMissingRegistrationNoCount:
      candidateStarters.filter((starter) => !text(starter.registrationNo)).length,
    nonStarterFieldChangedCount,
    resultChangedCount:
      changedFieldCount(baselineItems, dailyCandidateItems, "result"),
    predictionChangedCount:
      changedFieldCount(baselineItems, dailyCandidateItems, "prediction"),
    lineupChangedCount:
      changedFieldCount(baselineItems, dailyCandidateItems, "lineup"),
    weatherChangedCount:
      changedFieldCount(baselineItems, dailyCandidateItems, "weather"),
    ...join.summary,
  };
  const candidateIndex = {
    candidateHistoryIndexHash: indexCandidateHash,
    expectedCandidateHistoryIndexHash: CANDIDATE_INDEX_HASH,
    candidateHistoryIndexHashMatched:
      indexCandidateHash === CANDIDATE_INDEX_HASH,
    candidateIndexTotalBytes: indexCandidate.totalBytes ?? null,
    targetDateIndexBytesAfter:
      array(indexCandidate.items)
        .find((item) => item.date === TARGET_DATE)?.bytes ?? null,
    indexChangedFieldPaths: changedPaths,
    indexUnexpectedChangedFieldPaths: unexpectedChangedPaths,
  };
  const sourceStarters =
    array(source.races).flatMap((race) => array(race.starters));
  const entryStarters =
    array(entries.races).flatMap((race) => array(race.entries));
  const targetIndex =
    array(indexForCandidate.items).find((item) => item.date === TARGET_DATE);
  const latest = [...array(indexForCandidate.items)].sort((a, b) =>
    text(a.date).localeCompare(text(b.date))).at(-1);
  const guardBefore = protectedGuard();
  const fullPreconditions =
    dailyRead.exists
    && dailyRead.parseStatus === "ok"
    && indexRead.exists
    && indexRead.parseStatus === "ok"
    && sourceRead.exists
    && sourceRead.parseStatus === "ok"
    && entriesRead.exists
    && entriesRead.parseStatus === "ok"
    && array(dailyForCandidate.items).length === 64
    && array(source.races).length === 64
    && sourceStarters.length === 464
    && array(entries.races).length === 64
    && entryStarters.length === 464
    && sourceStarters.every((starter) => text(starter.registrationNo))
    && join.summary.matchedRaceCount === 64
    && join.summary.bridgeEligibleRaceCount === 64
    && join.summary.duplicateJoinKeyCount === 0
    && dailyCandidateHash === CANDIDATE_DAILY_HASH
    && payloadBytes(dailyCandidate) === CANDIDATE_DAILY_BYTES
    && indexCandidateHash === CANDIDATE_INDEX_HASH
    && indexCandidate.totalBytes === CANDIDATE_TOTAL_BYTES
    && targetIndex?.file === DAILY_PUBLIC_PATH
    && targetIndex?.raceCount === 64
    && latest?.date === TARGET_DATE
    && latest?.file === DAILY_PUBLIC_PATH
    && changedPaths.length === 2
    && unexpectedChangedPaths.length === 0
    && nonStarterFieldChangedCount === 0
    && candidateDaily.resultChangedCount === 0
    && candidateDaily.predictionChangedCount === 0
    && candidateDaily.lineupChangedCount === 0
    && candidateDaily.weatherChangedCount === 0
    && guardBefore.guardStatus === "pass";
  let writerStatus = "BLOCKED";
  let writePerformed = false;
  let noOp = false;
  let writeOperation = {
    candidatesPrepared: false,
    dailyWriteAttempted: false,
    indexWriteAttempted: false,
    rollbackAttempted: false,
    rollbackSucceeded: false,
    partialFailure: false,
  };
  if (alreadyCombinedUpdated) {
    writerStatus = "NOOP_ALREADY_COMBINED_UPDATED";
    noOp = true;
  } else if (mixedDailyUpdated) {
    writerStatus = "BLOCKED_DAILY_UPDATED_INDEX_STALE";
  } else if (mixedIndexUpdated) {
    writerStatus = "BLOCKED_INDEX_UPDATED_DAILY_STALE";
  } else if (
    dailyHashBefore !== CURRENT_DAILY_HASH
    || indexHashBefore !== CURRENT_INDEX_HASH
  ) {
    writerStatus = "BLOCKED_CURRENT_HASH_MISMATCH";
  } else if (
    dailyRead.bytes !== CURRENT_DAILY_BYTES
    || index.totalBytes !== CURRENT_TOTAL_BYTES
    || targetIndex?.bytes !== CURRENT_DAILY_BYTES
    || !fullPreconditions
  ) {
    writerStatus = "BLOCKED";
  } else {
    try {
      writeOperation = await writeBothWithRollback(
        dailyRead,
        indexRead,
        dailyCandidate,
        indexCandidate,
      );
      writerStatus = "WRITE_COMPLETED";
      writePerformed = true;
    } catch (error) {
      writeOperation = error.writeOperation ?? writeOperation;
      writerStatus = writeOperation.partialFailure
        ? "BLOCKED_PARTIAL_WRITE_ROLLED_BACK"
        : "BLOCKED";
    }
  }
  const [postDaily, postIndex] = await Promise.all([
    readJson(DAILY_PATH),
    readJson(INDEX_PATH),
  ]);
  const postWriteVerification = {
    postWriteDailyHash: postDaily.payload ? hashPayload(postDaily.payload) : null,
    postWriteIndexHash: postIndex.payload ? hashPayload(postIndex.payload) : null,
    postWriteDailyBytes: postDaily.bytes,
    postWriteDailyHashMatched:
      postDaily.payload
      && hashPayload(postDaily.payload) === CANDIDATE_DAILY_HASH,
    postWriteIndexHashMatched:
      postIndex.payload
      && hashPayload(postIndex.payload) === CANDIDATE_INDEX_HASH,
    postWriteDailyBytesMatched: postDaily.bytes === CANDIDATE_DAILY_BYTES,
    bothCandidatesPresent:
      postDaily.payload
      && postIndex.payload
      && hashPayload(postDaily.payload) === CANDIDATE_DAILY_HASH
      && hashPayload(postIndex.payload) === CANDIDATE_INDEX_HASH,
  };
  const guardAfter = protectedGuard();
  const summary = {
    targetDate: TARGET_DATE,
    historyDailyPath: DAILY_PATH,
    historyIndexPath: INDEX_PATH,
    currentHistoryDailyHashBefore: dailyHashBefore,
    expectedCurrentHistoryDailyHash: CURRENT_DAILY_HASH,
    currentHistoryDailyHashMatched: dailyHashBefore === CURRENT_DAILY_HASH,
    currentHistoryDailyBytesBefore: dailyRead.bytes,
    expectedCurrentHistoryDailyBytes: CURRENT_DAILY_BYTES,
    currentHistoryDailyBytesMatched: dailyRead.bytes === CURRENT_DAILY_BYTES,
    candidateDailyHash: dailyCandidateHash,
    expectedCandidateDailyHash: CANDIDATE_DAILY_HASH,
    candidateDailyHashMatched: dailyCandidateHash === CANDIDATE_DAILY_HASH,
    candidateDailyBytes: payloadBytes(dailyCandidate),
    expectedCandidateDailyBytes: CANDIDATE_DAILY_BYTES,
    candidateDailyBytesMatched:
      payloadBytes(dailyCandidate) === CANDIDATE_DAILY_BYTES,
    currentHistoryIndexHashBefore: indexHashBefore,
    expectedCurrentHistoryIndexHash: CURRENT_INDEX_HASH,
    currentHistoryIndexHashMatched: indexHashBefore === CURRENT_INDEX_HASH,
    candidateHistoryIndexHash: indexCandidateHash,
    expectedCandidateHistoryIndexHash: CANDIDATE_INDEX_HASH,
    candidateHistoryIndexHashMatched:
      indexCandidateHash === CANDIDATE_INDEX_HASH,
    currentIndexTotalBytesBefore: index.totalBytes ?? null,
    candidateIndexTotalBytes: indexCandidate.totalBytes ?? null,
    targetDateIndexBytesBefore:
      array(index.items).find((item) => item.date === TARGET_DATE)?.bytes ?? null,
    targetDateIndexBytesAfter:
      array(indexCandidate.items).find((item) => item.date === TARGET_DATE)?.bytes ?? null,
    indexChangedFieldPaths: changedPaths,
    indexUnexpectedChangedFieldPaths: unexpectedChangedPaths,
    alreadyCombinedUpdated,
    writePerformed,
    noOp,
    writerStatus,
    historyRaceCount: array(dailyForCandidate.items).length,
    startersSourceRaceCount: array(source.races).length,
    entriesSnapshotRaceCount: array(entries.races).length,
    sourceStarterTotal: sourceStarters.length,
    candidateDailyStarterTotal: candidateStarters.length,
    ...join.summary,
    candidateMissingRegistrationNoCount:
      candidateDaily.candidateMissingRegistrationNoCount,
    nonStarterFieldChangedCount,
    resultChangedCount: candidateDaily.resultChangedCount,
    predictionChangedCount: candidateDaily.predictionChangedCount,
    lineupChangedCount: candidateDaily.lineupChangedCount,
    weatherChangedCount: candidateDaily.weatherChangedCount,
    ...postWriteVerification,
    historyDailyModified: postWriteVerification.postWriteDailyHash
      !== dailyHashBefore,
    historyIndexModified: postWriteVerification.postWriteIndexHash
      !== indexHashBefore,
    analyticsSourceModified: guardAfter.analyticsSourceModified,
    racesModified: guardAfter.racesModified,
    reviewsModifiedByThisStep: guardAfter.reviewsModifiedByThisStep,
    privateInputModified: guardAfter.privateInputModified,
    srcModified: guardAfter.srcModified,
    packageModified: guardAfter.packageModified,
    existingScriptModified: guardAfter.existingScriptModified,
    fakeCompletionPerformed: false,
    fuzzyMatchingPerformed: false,
    predictionUsedAsStarterSource: false,
    resultUsedAsStarterSource: false,
    lineupUsedAsStarterSource: false,
    entriesUsedAsGeneratedStarterSource: false,
    registrationNoGenerated: false,
  };
  return {
    summary,
    precondition,
    candidateDaily,
    candidateIndex,
    writeResult: { writerStatus, writePerformed, noOp, alreadyCombinedUpdated, ...writeOperation },
    postWriteVerification,
    protectedModificationGuard: guardAfter,
    jsonSummary: summary,
  };
}

async function main() {
  const result = await writeCombinedBridge();
  printSection("summary", result.summary);
  printSection("precondition", result.precondition);
  printSection("candidateDaily", result.candidateDaily);
  printSection("candidateIndex", result.candidateIndex);
  printSection("writeResult", result.writeResult);
  printSection("postWriteVerification", result.postWriteVerification);
  printSection("protectedModificationGuard", result.protectedModificationGuard);
  printSection("jsonSummary", result.jsonSummary);
  if (
    result.summary.writerStatus !== "WRITE_COMPLETED"
    && result.summary.writerStatus !== "NOOP_ALREADY_COMBINED_UPDATED"
  ) {
    process.exitCode = 1;
  }
}

const isMain =
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  main().catch((error) => {
    console.error("[kurari-ex combined history starters bridge writer] failed");
    console.error(error);
    process.exitCode = 1;
  });
}
