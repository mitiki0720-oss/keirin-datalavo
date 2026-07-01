import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { open, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

export const TARGET_DATE = "2026-06-25";
export const INDEX_PATH =
  "public/data/analytics/kurari-ex/history/index.generated.json";
export const DAILY_PATH =
  "public/data/analytics/kurari-ex/history/daily/2026-06/2026-06-25.generated.json";
export const PUBLIC_PATH =
  "/data/analytics/kurari-ex/history/daily/2026-06/2026-06-25.generated.json";
export const EXPECTED_DAILY_HASH =
  "sha256:b348ef4fc981701199fbc4a1e3d4e90a6fc54ff9e80bb2f65fc93cbb4fc247da";
export const EXPECTED_DAILY_BYTES = 199655;
export const EXPECTED_DAILY_RACE_COUNT = 75;
export const EXPECTED_DAILY_VENUE_COUNT = 8;
export const EXPECTED_INDEX_HASH_AFTER =
  "sha256:5b9d2a00ebd5c62654ac769cc67609241c6fb37ace6f1194e7a2a8dab9b3eea2";
export const EXPECTED_INDEX_BYTES_AFTER = 13127;
export const EXPECTED_CURRENT_INDEX = {
  sourceCount: 53,
  dayCount: 53,
  raceCount: 3997,
  totalBytes: 11009372,
  latestDate: "2026-06-29",
  latestPath:
    "/data/analytics/kurari-ex/history/daily/2026-06/2026-06-29.generated.json",
};
export const EXPECTED_INDEX_AFTER = {
  sourceCount: 54,
  dayCount: 54,
  raceCount: 4072,
  totalBytes: 11209027,
  latestDate: "2026-06-29",
  latestPath:
    "/data/analytics/kurari-ex/history/daily/2026-06/2026-06-29.generated.json",
};

const ROOT = process.cwd();
const WRITER_PATH = "scripts/write-kurari-ex-history-index-2026-06-25.mjs";
const CHECKER_PATH = "scripts/check-kurari-ex-history-index-2026-06-25.mjs";
const ALLOWED_FILES = new Set([WRITER_PATH, CHECKER_PATH, INDEX_PATH]);
const KNOWN_REVIEW_CHANGES = [
  "public/data/reviews/index.json",
  "public/data/reviews/2026-06-28/",
  "public/data/reviews/2026-06-29/",
  "public/data/reviews/2026-06-30/",
  "public/data/reviews/2026-07-01/",
];

const BLOCK_REASON_ORDER = [
  "HISTORY_INDEX_MISSING",
  "HISTORY_INDEX_PARSE_FAILED",
  "HISTORY_INDEX_ALREADY_INDEXED_DIFFERENT",
  "HISTORY_INDEX_POST_WRITE_HASH_MISMATCH",
  "HISTORY_INDEX_POST_WRITE_BYTES_MISMATCH",
  "HISTORY_INDEX_COUNT_MISMATCH",
  "HISTORY_INDEX_TOTAL_BYTES_MISMATCH",
  "HISTORY_INDEX_ITEM_BYTES_SUM_MISMATCH",
  "HISTORY_INDEX_LATEST_POINTER_CHANGED",
  "DAILY_FILE_MISSING",
  "DAILY_FILE_PARSE_FAILED",
  "DAILY_HASH_MISMATCH",
  "DAILY_BYTES_MISMATCH",
  "DAILY_RACE_COUNT_MISMATCH",
  "DAILY_VENUE_COUNT_MISMATCH",
  "TARGET_DATE_ENTRY_MISSING_AFTER_WRITE",
  "TARGET_DATE_ENTRY_DUPLICATE",
  "TARGET_DATE_ENTRY_BYTES_MISMATCH",
  "TARGET_DATE_ENTRY_RACE_COUNT_MISMATCH",
  "TARGET_DATE_PUBLIC_PATH_UNRESOLVED",
  "EXISTING_ENTRY_CHANGED_UNEXPECTEDLY",
  "ENTRY_2026_06_29_CHANGED",
  "INDEX_WRITE_FAILED",
  "TMP_FILE_LEFTOVER",
  "FAKE_COMPLETION_FOUND",
  "FUZZY_MATCHING_FOUND",
  "GENERATED_STARTERS_FOUND",
  "GENERATED_REGISTRATION_NO_FOUND",
  "HISTORY_DAILY_MODIFIED",
  "ANALYTICS_SOURCE_MODIFIED",
  "PUBLIC_RACES_MODIFIED",
  "PUBLIC_REVIEWS_MODIFIED_BY_THIS_STEP",
  "PRIVATE_INPUT_MODIFIED",
  "SRC_MODIFIED",
  "PACKAGE_MODIFIED",
  "DOCS_MODIFIED",
  "EXISTING_SCRIPT_MODIFIED",
  "UNEXPECTED_FILE_STAGED",
];

function abs(file) {
  return path.isAbsolute(file) ? file : path.resolve(ROOT, file);
}

export function array(value) {
  return Array.isArray(value) ? value : [];
}

function increment(counter, key, by = 1) {
  counter[key] = (counter[key] ?? 0) + by;
}

export function hashBuffer(buffer) {
  return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
}

export function hashPayload(payload) {
  return hashBuffer(Buffer.from(JSON.stringify(payload), "utf8"));
}

export function hashStableIndex(payload) {
  return hashPayload({ ...payload, generatedAt: undefined });
}

export function latestItem(items) {
  return [...items]
    .sort((left, right) => String(left.date).localeCompare(String(right.date)))
    .at(-1) ?? null;
}

export function itemBytesSum(items) {
  return items.reduce((sum, item) => sum + (Number(item.bytes) || 0), 0);
}

export function countDuplicates(values) {
  return values.length - new Set(values).size;
}

function deepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function readHeadIndex() {
  const text = execFileSync(
    "git",
    ["show", `HEAD:${INDEX_PATH}`],
    { cwd: ROOT, encoding: "utf8" },
  );
  return JSON.parse(text);
}

export function summarizeIndex(index) {
  const items = array(index?.items);
  const latest = latestItem(items);
  return {
    sourceCount: items.length,
    dayCount: index?.dayCount ?? null,
    raceCount: index?.raceCount ?? null,
    settledRaceCount: index?.settledRaceCount ?? null,
    cancelledRaceCount: index?.cancelledRaceCount ?? null,
    totalBytes: index?.totalBytes ?? null,
    itemBytesSum: itemBytesSum(items),
    latestDate: latest?.date ?? null,
    latestPath: latest?.file ?? null,
    targetDateEntryCount:
      items.filter((item) => item?.date === TARGET_DATE).length,
    targetDateEntry:
      items.find((item) => item?.date === TARGET_DATE) ?? null,
  };
}

export function buildCandidateIndex(baselineIndex, daily, dailyBytes) {
  const baselineItems = array(baselineIndex.items);
  if (baselineItems.some((item) => item?.date === TARGET_DATE)) {
    throw new Error("HEAD baseline already contains target date");
  }
  const targetEntry = {
    date: TARGET_DATE,
    file: PUBLIC_PATH,
    raceCount: daily.raceCount,
    settledRaceCount: daily.settledRaceCount,
    cancelledRaceCount: daily.cancelledRaceCount,
    bytes: dailyBytes,
  };
  const items = [...baselineItems, targetEntry]
    .sort((left, right) => String(left.date).localeCompare(String(right.date)));
  return {
    candidate: {
      ...baselineIndex,
      period: {
        from: baselineIndex.period?.from ?? items[0]?.date ?? TARGET_DATE,
        to: latestItem(items)?.date ?? TARGET_DATE,
      },
      dayCount: items.length,
      raceCount:
        items.reduce((sum, item) => sum + (Number(item.raceCount) || 0), 0),
      settledRaceCount:
        items.reduce(
          (sum, item) => sum + (Number(item.settledRaceCount) || 0),
          0,
        ),
      cancelledRaceCount:
        items.reduce(
          (sum, item) => sum + (Number(item.cancelledRaceCount) || 0),
          0,
        ),
      totalBytes: itemBytesSum(items),
      items,
    },
    targetEntry,
  };
}

export function compareExistingEntries(baselineIndex, candidateIndex) {
  const baselineItems = array(baselineIndex.items);
  const candidateByDate =
    new Map(array(candidateIndex.items).map((item) => [item.date, item]));
  const changedExistingEntryPaths =
    baselineItems
      .filter(
        (item) =>
          !candidateByDate.has(item.date)
          || !deepEqual(item, candidateByDate.get(item.date)),
      )
      .map((item) => `items[${item.date}]`);
  const candidateDates =
    new Set(array(candidateIndex.items).map((item) => item.date));
  const removedEntryCount =
    baselineItems.filter((item) => !candidateDates.has(item.date)).length;
  const baseline20260629 =
    baselineItems.find((item) => item.date === "2026-06-29") ?? null;
  const candidate20260629 =
    candidateByDate.get("2026-06-29") ?? null;
  return {
    addedEntryCount:
      array(candidateIndex.items).filter(
        (item) => !baselineItems.some((base) => base.date === item.date),
      ).length,
    changedExistingEntryCount: changedExistingEntryPaths.length,
    changedExistingEntryPaths,
    removedEntryCount,
    entry20260629Unchanged:
      deepEqual(baseline20260629, candidate20260629),
  };
}

function indexMatches(summary, expected) {
  return (
    summary.sourceCount === expected.sourceCount
    && summary.dayCount === expected.dayCount
    && summary.raceCount === expected.raceCount
    && summary.totalBytes === expected.totalBytes
    && summary.itemBytesSum === expected.totalBytes
    && summary.latestDate === expected.latestDate
    && summary.latestPath === expected.latestPath
  );
}

async function readJsonWithBuffer(file) {
  const buffer = await readFile(abs(file));
  return { buffer, payload: JSON.parse(buffer.toString("utf8")) };
}

function parsePorcelain() {
  const output = execFileSync(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=all"],
    { cwd: ROOT, encoding: "utf8" },
  );
  return output
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => {
      const status = line.slice(0, 2);
      const rawPath = line.slice(3).replace(/^"|"$/gu, "");
      const file = rawPath.includes(" -> ")
        ? rawPath.split(" -> ").at(-1)
        : rawPath;
      return { status, file: file.replaceAll("\\", "/") };
    });
}

function knownReview(file) {
  return KNOWN_REVIEW_CHANGES.some(
    (known) => file === known || (known.endsWith("/") && file.startsWith(known)),
  );
}

export function protectedModificationGuard() {
  const rows = parsePorcelain();
  const changedFiles = rows.map((row) => row.file);
  const stagedFiles =
    rows.filter((row) => row.status[0] !== " " && row.status[0] !== "?")
      .map((row) => row.file);
  const unexpectedModifiedFiles = rows
    .filter((row) => row.status !== "??")
    .map((row) => row.file)
    .filter((file) => !ALLOWED_FILES.has(file) && !knownReview(file));
  const unexpectedUntrackedFiles = rows
    .filter((row) => row.status === "??")
    .map((row) => row.file)
    .filter((file) => !ALLOWED_FILES.has(file) && !knownReview(file));
  const indexModified = changedFiles.includes(INDEX_PATH);
  const historyDailyModified =
    changedFiles.some(
      (file) =>
        file.startsWith(
          "public/data/analytics/kurari-ex/history/daily/",
        ),
    );
  const analyticsSourceModified =
    changedFiles.some(
      (file) =>
        file.startsWith("public/data/analytics/kurari-ex/source/"),
    );
  const publicRacesModified =
    changedFiles.some((file) => file.startsWith("public/data/races/"));
  const publicReviewsTouchedByThisStep =
    changedFiles.some(
      (file) => file.startsWith("public/data/reviews/") && !knownReview(file),
    );
  const privateInputModified =
    changedFiles.some((file) => file.startsWith("private-input/"));
  const srcModified =
    changedFiles.some((file) => file.startsWith("src/"));
  const packageModified = changedFiles.includes("package.json");
  const docsModified =
    changedFiles.some((file) => file.startsWith("docs/"));
  const existingScriptModified =
    changedFiles.some(
      (file) =>
        file.startsWith("scripts/")
        && !ALLOWED_FILES.has(file),
    );
  const allowedFilesOnly =
    unexpectedModifiedFiles.length === 0
    && unexpectedUntrackedFiles.length === 0;
  const failed =
    !allowedFilesOnly
    || historyDailyModified
    || analyticsSourceModified
    || publicRacesModified
    || publicReviewsTouchedByThisStep
    || privateInputModified
    || srcModified
    || packageModified
    || docsModified
    || existingScriptModified
    || stagedFiles.length > 0;
  return {
    allowedFilesOnly,
    indexModified,
    historyDailyModified,
    analyticsSourceModified,
    publicRacesModified,
    publicReviewsTouchedByThisStep,
    privateInputModified,
    srcModified,
    packageModified,
    docsModified,
    existingScriptModified,
    unexpectedModifiedFiles,
    unexpectedUntrackedFiles,
    stagedFiles,
    guardStatus: failed ? "fail" : "pass",
  };
}

function normalizeBlockReasons(counter) {
  return Object.fromEntries(
    Object.entries(counter)
      .filter(([, count]) => count > 0)
      .sort(([left], [right]) => {
        const leftIndex = BLOCK_REASON_ORDER.indexOf(left);
        const rightIndex = BLOCK_REASON_ORDER.indexOf(right);
        if (leftIndex !== -1 && rightIndex !== -1) {
          return leftIndex - rightIndex;
        }
        if (leftIndex !== -1) return -1;
        if (rightIndex !== -1) return 1;
        return left.localeCompare(right);
      }),
  );
}

async function atomicReplaceIndex(buffer) {
  const tempPath =
    `${INDEX_PATH}.tmp-${process.pid}-${Date.now()}-${hashBuffer(buffer)
      .slice(-12)}`;
  let handle = null;
  try {
    handle = await open(abs(tempPath), "wx");
    await handle.writeFile(buffer);
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(abs(tempPath), abs(INDEX_PATH));
    return { used: true, tempPath, renamed: true };
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    await rm(abs(tempPath), { force: true }).catch(() => {});
    throw error;
  }
}

function printSection(label, value) {
  console.log(`[${label}]`);
  console.log(JSON.stringify(value, null, 2));
}

export async function writeHistoryIndex20260625() {
  const blockReasonCounts = {};
  if (!existsSync(abs(INDEX_PATH))) {
    increment(blockReasonCounts, "HISTORY_INDEX_MISSING");
    throw new Error("history index missing");
  }
  if (!existsSync(abs(DAILY_PATH))) {
    increment(blockReasonCounts, "DAILY_FILE_MISSING");
    throw new Error("target daily missing");
  }
  let currentRead;
  let dailyRead;
  try {
    [currentRead, dailyRead] = await Promise.all([
      readJsonWithBuffer(INDEX_PATH),
      readJsonWithBuffer(DAILY_PATH),
    ]);
  } catch (error) {
    increment(blockReasonCounts, "HISTORY_INDEX_PARSE_FAILED");
    throw error;
  }
  const baselineIndex = readHeadIndex();
  const baselineSummary = summarizeIndex(baselineIndex);
  const currentIndex = currentRead.payload;
  const currentSummary = summarizeIndex(currentIndex);
  const daily = dailyRead.payload;
  const dailyHash = hashPayload(daily);
  const dailyBytes = dailyRead.buffer.length;
  const dailyVenueCount =
    new Set(array(daily.items).map((item) => item.venueKey)).size;
  const dailyGuardPassed =
    dailyHash === EXPECTED_DAILY_HASH
    && dailyBytes === EXPECTED_DAILY_BYTES
    && daily.raceCount === EXPECTED_DAILY_RACE_COUNT
    && dailyVenueCount === EXPECTED_DAILY_VENUE_COUNT;
  if (dailyHash !== EXPECTED_DAILY_HASH) {
    increment(blockReasonCounts, "DAILY_HASH_MISMATCH");
  }
  if (dailyBytes !== EXPECTED_DAILY_BYTES) {
    increment(blockReasonCounts, "DAILY_BYTES_MISMATCH");
  }
  if (daily.raceCount !== EXPECTED_DAILY_RACE_COUNT) {
    increment(blockReasonCounts, "DAILY_RACE_COUNT_MISMATCH");
  }
  if (dailyVenueCount !== EXPECTED_DAILY_VENUE_COUNT) {
    increment(blockReasonCounts, "DAILY_VENUE_COUNT_MISMATCH");
  }
  if (!dailyGuardPassed) throw new Error("target daily validation failed");

  const { candidate, targetEntry } =
    buildCandidateIndex(baselineIndex, daily, dailyBytes);
  const candidateSummary = summarizeIndex(candidate);
  const candidateInvariant = compareExistingEntries(baselineIndex, candidate);
  const candidateHash = hashStableIndex(candidate);
  const candidateBuffer =
    Buffer.from(`${JSON.stringify(candidate, null, 2)}\n`, "utf8");
  const candidateBytes = candidateBuffer.length;
  const candidateValid =
    indexMatches(baselineSummary, EXPECTED_CURRENT_INDEX)
    && indexMatches(candidateSummary, EXPECTED_INDEX_AFTER)
    && candidateHash === EXPECTED_INDEX_HASH_AFTER
    && candidateBytes === EXPECTED_INDEX_BYTES_AFTER
    && candidateInvariant.addedEntryCount === 1
    && candidateInvariant.changedExistingEntryCount === 0
    && candidateInvariant.removedEntryCount === 0
    && candidateInvariant.entry20260629Unchanged;
  if (!candidateValid) {
    increment(blockReasonCounts, "HISTORY_INDEX_COUNT_MISMATCH");
    throw new Error("candidate index validation failed");
  }

  const indexHashBefore = hashStableIndex(currentIndex);
  const sourceCountBefore = currentSummary.sourceCount;
  const dayCountBefore = currentSummary.dayCount;
  const raceCountBefore = currentSummary.raceCount;
  const totalBytesBefore = currentSummary.totalBytes;
  const targetAlreadyExists = currentSummary.targetDateEntryCount > 0;
  let writePerformed = false;
  let finalStatus = "WRITE_COMPLETED";
  let atomicWrite = { used: false, tempPath: null, renamed: false };
  if (targetAlreadyExists) {
    const alreadyExact =
      indexHashBefore === EXPECTED_INDEX_HASH_AFTER
      && currentRead.buffer.length === EXPECTED_INDEX_BYTES_AFTER
      && indexMatches(currentSummary, EXPECTED_INDEX_AFTER)
      && deepEqual(currentIndex, candidate);
    if (!alreadyExact) {
      increment(
        blockReasonCounts,
        "HISTORY_INDEX_ALREADY_INDEXED_DIFFERENT",
      );
      throw new Error("target date already indexed with different index");
    }
    finalStatus = "NOOP_ALREADY_INDEXED";
  } else {
    if (
      !indexMatches(currentSummary, EXPECTED_CURRENT_INDEX)
      || !deepEqual(currentIndex, baselineIndex)
    ) {
      increment(blockReasonCounts, "HISTORY_INDEX_COUNT_MISMATCH");
      throw new Error("current index differs from HEAD baseline");
    }
    try {
      atomicWrite = await atomicReplaceIndex(candidateBuffer);
      writePerformed = true;
    } catch (error) {
      increment(blockReasonCounts, "INDEX_WRITE_FAILED");
      throw error;
    }
  }

  const postRead = await readJsonWithBuffer(INDEX_PATH);
  const postIndex = postRead.payload;
  const postSummary = summarizeIndex(postIndex);
  const indexHashAfter = hashStableIndex(postIndex);
  const indexBytesAfter = postRead.buffer.length;
  const indexHashAfterMatched =
    indexHashAfter === EXPECTED_INDEX_HASH_AFTER;
  const indexBytesAfterMatched =
    indexBytesAfter === EXPECTED_INDEX_BYTES_AFTER;
  const postInvariant = compareExistingEntries(baselineIndex, postIndex);
  const targetAfter = postSummary.targetDateEntry;
  const postValid =
    indexHashAfterMatched
    && indexBytesAfterMatched
    && indexMatches(postSummary, EXPECTED_INDEX_AFTER)
    && postSummary.targetDateEntryCount === 1
    && targetAfter?.file === PUBLIC_PATH
    && targetAfter?.bytes === EXPECTED_DAILY_BYTES
    && targetAfter?.raceCount === EXPECTED_DAILY_RACE_COUNT
    && postInvariant.changedExistingEntryCount === 0
    && postInvariant.removedEntryCount === 0
    && postInvariant.entry20260629Unchanged;
  if (!indexHashAfterMatched) {
    increment(
      blockReasonCounts,
      "HISTORY_INDEX_POST_WRITE_HASH_MISMATCH",
    );
  }
  if (!indexBytesAfterMatched) {
    increment(
      blockReasonCounts,
      "HISTORY_INDEX_POST_WRITE_BYTES_MISMATCH",
    );
  }
  if (postSummary.targetDateEntryCount === 0) {
    increment(blockReasonCounts, "TARGET_DATE_ENTRY_MISSING_AFTER_WRITE");
  }
  if (postSummary.targetDateEntryCount > 1) {
    increment(blockReasonCounts, "TARGET_DATE_ENTRY_DUPLICATE");
  }
  if (targetAfter?.bytes !== EXPECTED_DAILY_BYTES) {
    increment(blockReasonCounts, "TARGET_DATE_ENTRY_BYTES_MISMATCH");
  }
  if (targetAfter?.raceCount !== EXPECTED_DAILY_RACE_COUNT) {
    increment(blockReasonCounts, "TARGET_DATE_ENTRY_RACE_COUNT_MISMATCH");
  }
  if (postInvariant.changedExistingEntryCount > 0) {
    increment(blockReasonCounts, "EXISTING_ENTRY_CHANGED_UNEXPECTEDLY");
  }
  if (!postInvariant.entry20260629Unchanged) {
    increment(blockReasonCounts, "ENTRY_2026_06_29_CHANGED");
  }

  const modificationGuard = protectedModificationGuard();
  if (modificationGuard.historyDailyModified) {
    increment(blockReasonCounts, "HISTORY_DAILY_MODIFIED");
  }
  if (modificationGuard.analyticsSourceModified) {
    increment(blockReasonCounts, "ANALYTICS_SOURCE_MODIFIED");
  }
  if (modificationGuard.publicRacesModified) {
    increment(blockReasonCounts, "PUBLIC_RACES_MODIFIED");
  }
  if (modificationGuard.publicReviewsTouchedByThisStep) {
    increment(blockReasonCounts, "PUBLIC_REVIEWS_MODIFIED_BY_THIS_STEP");
  }
  if (modificationGuard.privateInputModified) {
    increment(blockReasonCounts, "PRIVATE_INPUT_MODIFIED");
  }
  if (modificationGuard.srcModified) increment(blockReasonCounts, "SRC_MODIFIED");
  if (modificationGuard.packageModified) {
    increment(blockReasonCounts, "PACKAGE_MODIFIED");
  }
  if (modificationGuard.docsModified) increment(blockReasonCounts, "DOCS_MODIFIED");
  if (modificationGuard.existingScriptModified) {
    increment(blockReasonCounts, "EXISTING_SCRIPT_MODIFIED");
  }
  if (modificationGuard.stagedFiles.length) {
    increment(
      blockReasonCounts,
      "UNEXPECTED_FILE_STAGED",
      modificationGuard.stagedFiles.length,
    );
  }
  if (!postValid || modificationGuard.guardStatus !== "pass") {
    finalStatus = "BLOCKED";
  }
  const normalizedBlockReasons = normalizeBlockReasons(blockReasonCounts);
  const preWriteGuard = {
    indexExists: true,
    indexParseStatus: "ok",
    targetDateEntryExistsBefore: targetAlreadyExists,
    currentIndexMatchesHeadBaseline:
      targetAlreadyExists ? null : deepEqual(currentIndex, baselineIndex),
    currentIndexSummary: currentSummary,
    expectedBefore: EXPECTED_CURRENT_INDEX,
    preWriteStatus:
      targetAlreadyExists ? "ALREADY_INDEXED_VERIFY_NOOP" : "PASS_READY_TO_WRITE",
  };
  const dailyGuard = {
    dailyPath: DAILY_PATH,
    dailyHash,
    expectedDailyHash: EXPECTED_DAILY_HASH,
    dailyHashMatched: dailyHash === EXPECTED_DAILY_HASH,
    dailyBytes,
    expectedDailyBytes: EXPECTED_DAILY_BYTES,
    dailyBytesMatched: dailyBytes === EXPECTED_DAILY_BYTES,
    dailyRaceCount: daily.raceCount,
    expectedDailyRaceCount: EXPECTED_DAILY_RACE_COUNT,
    dailyVenueCount,
    expectedDailyVenueCount: EXPECTED_DAILY_VENUE_COUNT,
    dailyGuardStatus: dailyGuardPassed ? "PASS" : "FAIL",
  };
  const candidateIndex = {
    candidateHash,
    expectedCandidateHash: EXPECTED_INDEX_HASH_AFTER,
    candidateHashMatched:
      candidateHash === EXPECTED_INDEX_HASH_AFTER,
    candidateBytes,
    expectedCandidateBytes: EXPECTED_INDEX_BYTES_AFTER,
    candidateBytesMatched:
      candidateBytes === EXPECTED_INDEX_BYTES_AFTER,
    targetEntry,
    ...candidateSummary,
    candidateStatus: candidateValid ? "PASS" : "FAIL",
  };
  const indexDiffGuard = {
    ...candidateInvariant,
    expectedAddedEntryCount: 1,
    expectedChangedExistingEntryCount: 0,
    expectedRemovedEntryCount: 0,
    status:
      candidateInvariant.addedEntryCount === 1
      && candidateInvariant.changedExistingEntryCount === 0
      && candidateInvariant.removedEntryCount === 0
      && candidateInvariant.entry20260629Unchanged
        ? "PASS"
        : "FAIL",
  };
  const postWriteVerification = {
    indexHashAfter,
    expectedIndexHashAfter: EXPECTED_INDEX_HASH_AFTER,
    indexHashAfterMatched,
    indexBytesAfter,
    expectedIndexBytesAfter: EXPECTED_INDEX_BYTES_AFTER,
    indexBytesAfterMatched,
    ...postSummary,
    ...postInvariant,
    targetDateEntryPath: targetAfter?.file ?? null,
    targetDateEntryBytes: targetAfter?.bytes ?? null,
    targetDateEntryRaceCount: targetAfter?.raceCount ?? null,
    postWriteStatus: postValid ? "PASS" : "FAIL",
  };
  const summary = {
    targetDate: TARGET_DATE,
    finalStatus,
    indexPath: INDEX_PATH,
    dailyPath: DAILY_PATH,
    publicPath: PUBLIC_PATH,
    writePerformed,
    indexHashBefore,
    indexHashAfter,
    expectedIndexHashAfter: EXPECTED_INDEX_HASH_AFTER,
    indexHashAfterMatched,
    indexBytesAfter,
    expectedIndexBytesAfter: EXPECTED_INDEX_BYTES_AFTER,
    indexBytesAfterMatched,
    sourceCountBefore,
    dayCountBefore,
    raceCountBefore,
    totalBytesBefore,
    sourceCountAfter: postSummary.sourceCount,
    dayCountAfter: postSummary.dayCount,
    raceCountAfter: postSummary.raceCount,
    totalBytesAfter: postSummary.totalBytes,
    latestDateAfter: postSummary.latestDate,
    latestPathAfter: postSummary.latestPath,
    addedEntryCount: postInvariant.addedEntryCount,
    changedExistingEntryCount:
      postInvariant.changedExistingEntryCount,
    removedEntryCount: postInvariant.removedEntryCount,
    targetDateEntryExistsAfter:
      postSummary.targetDateEntryCount === 1,
    targetDateEntryPath: targetAfter?.file ?? null,
    targetDateEntryBytes: targetAfter?.bytes ?? null,
    targetDateEntryRaceCount: targetAfter?.raceCount ?? null,
    dailyHash,
    dailyBytes,
    dailyRaceCount: daily.raceCount,
    indexUpdated: writePerformed,
    historyDailyModified: modificationGuard.historyDailyModified,
    blockReasonCounts: normalizedBlockReasons,
  };
  return {
    summary,
    preWriteGuard,
    dailyGuard,
    candidateIndex,
    indexDiffGuard,
    postWriteVerification,
    atomicWrite,
    protectedModificationGuard: modificationGuard,
    jsonSummary: summary,
  };
}

async function main() {
  const result = await writeHistoryIndex20260625();
  printSection("summary", result.summary);
  printSection("preWriteGuard", result.preWriteGuard);
  printSection("dailyGuard", result.dailyGuard);
  printSection("candidateIndex", result.candidateIndex);
  printSection("indexDiffGuard", result.indexDiffGuard);
  printSection("postWriteVerification", result.postWriteVerification);
  printSection(
    "protectedModificationGuard",
    result.protectedModificationGuard,
  );
  printSection("jsonSummary", result.jsonSummary);
  if (!["WRITE_COMPLETED", "NOOP_ALREADY_INDEXED"].includes(result.summary.finalStatus)) {
    process.exitCode = 1;
  }
}

const isMain =
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  main().catch((error) => {
    console.error("[kurari-ex history index writer 2026-06-25] failed");
    console.error(error);
    process.exitCode = 1;
  });
}
