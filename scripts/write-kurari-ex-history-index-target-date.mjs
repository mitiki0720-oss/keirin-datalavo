import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const TARGET_DATE = "2026-06-29";
const TARGET_MONTH = "2026-06";
const INDEX_PATH = "public/data/analytics/kurari-ex/history/index.generated.json";
const TARGET_DAILY_PATH =
  `public/data/analytics/kurari-ex/history/daily/${TARGET_MONTH}/${TARGET_DATE}.generated.json`;
const TARGET_DAILY_PUBLIC_PATH =
  `/data/analytics/kurari-ex/history/daily/${TARGET_MONTH}/${TARGET_DATE}.generated.json`;
const EXPECTED_CURRENT_INDEX_HASH =
  "sha256:a9eb63e753b4b1e5d694a63c7a8af7a3edd666a8676f03fcd136e2e8b5f386f1";
const EXPECTED_TARGET_DAILY_HASH =
  "sha256:96a4d2399cf7f57f777170648c9ab8da2f87f20b5bdcc3ed680f2ca6b67d6e2f";
const EXPECTED_CANDIDATE_INDEX_HASH =
  "sha256:53833ef5cc74c02b153c12a5c520b2f4740345777b7806fd5a22a2a7723659d9";

function abs(file) {
  return path.isAbsolute(file) ? file : path.resolve(ROOT, file);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function stableSort(value) {
  if (Array.isArray(value)) return value.map(stableSort);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableSort(item)]),
    );
  }
  return value;
}

function hashStableIndex(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(stableSort({
    ...value,
    generatedAt: undefined,
  }))).digest("hex")}`;
}

function hashPayload(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function hashBuffer(buffer) {
  return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
}

async function hashFile(file) {
  if (!existsSync(abs(file))) return null;
  return hashBuffer(await readFile(abs(file)));
}

async function readJson(file) {
  return JSON.parse(await readFile(abs(file), "utf8"));
}

function latestItem(items) {
  return [...items].sort((left, right) => String(left.date).localeCompare(String(right.date))).at(-1) ?? null;
}

function countDuplicates(values) {
  return values.length - new Set(values).size;
}

function buildTargetDateEntry(targetDailyPayload, targetDailyByteSize) {
  return {
    date: TARGET_DATE,
    file: TARGET_DAILY_PUBLIC_PATH,
    raceCount: targetDailyPayload.raceCount,
    settledRaceCount: targetDailyPayload.settledRaceCount,
    cancelledRaceCount: targetDailyPayload.cancelledRaceCount,
    bytes: targetDailyByteSize,
  };
}

function buildCandidateIndex(currentIndex, targetDateEntry) {
  const currentItems = asArray(currentIndex.items);
  const existingByDate = currentItems.find((item) => item.date === TARGET_DATE);
  const existingByPath = currentItems.find((item) => item.file === TARGET_DAILY_PUBLIC_PATH);
  if (existingByDate || existingByPath) {
    const sameDate = existingByDate?.file === TARGET_DAILY_PUBLIC_PATH;
    const samePath = !existingByPath || existingByPath.date === TARGET_DATE;
    const sameCounts = existingByDate
      && existingByDate.raceCount === targetDateEntry.raceCount
      && existingByDate.settledRaceCount === targetDateEntry.settledRaceCount
      && existingByDate.cancelledRaceCount === targetDateEntry.cancelledRaceCount
      && existingByDate.bytes === targetDateEntry.bytes;
    if (sameDate && samePath && sameCounts) {
      return { candidate: currentIndex, mode: "no-op" };
    }
    throw new Error("target date/path already indexed with different content");
  }

  const items = [...currentItems, targetDateEntry]
    .sort((left, right) => String(left.date).localeCompare(String(right.date)));
  const candidate = {
    ...currentIndex,
    generatedAt: new Date().toISOString(),
    period: {
      from: currentIndex.period?.from ?? items[0]?.date ?? TARGET_DATE,
      to: latestItem(items)?.date ?? TARGET_DATE,
    },
    dayCount: items.length,
    raceCount: items.reduce((sum, item) => sum + (Number(item.raceCount) || 0), 0),
    settledRaceCount: items.reduce((sum, item) => sum + (Number(item.settledRaceCount) || 0), 0),
    cancelledRaceCount: items.reduce((sum, item) => sum + (Number(item.cancelledRaceCount) || 0), 0),
    totalBytes: items.reduce((sum, item) => sum + (Number(item.bytes) || 0), 0),
    items,
  };
  return { candidate, mode: "replace-index-only-with-current-hash-precondition" };
}

function validateCandidate(candidate, targetDateEntry) {
  const items = asArray(candidate.items);
  const latest = latestItem(items);
  const target = items.find((item) => item.date === TARGET_DATE);
  const duplicateDateCount = countDuplicates(items.map((item) => item.date).filter(Boolean));
  const duplicatePathCount = countDuplicates(items.map((item) => item.file).filter(Boolean));
  const malformedItemCount = items.filter((item) => (
    !item.date || !item.file || typeof item.raceCount !== "number"
  )).length;
  return {
    duplicateDateCount,
    duplicatePathCount,
    malformedItemCount,
    sourceCountBefore: 52,
    sourceCountAfter: items.length,
    sourceCountDelta: items.length - 52,
    raceCountBefore: 3933,
    raceCountAfter: candidate.raceCount,
    raceCountDelta: candidate.raceCount - 3933,
    latestDateAfter: latest?.date ?? null,
    latestPathAfter: latest?.file ?? null,
    valid: [
      candidate.schemaVersion === 1,
      items.length === 53,
      candidate.dayCount === 53,
      candidate.raceCount === 3997,
      candidate.settledRaceCount === 3989,
      candidate.cancelledRaceCount === 0,
      candidate.period?.to === TARGET_DATE,
      latest?.date === TARGET_DATE,
      latest?.file === TARGET_DAILY_PUBLIC_PATH,
      Boolean(target),
      target?.file === TARGET_DAILY_PUBLIC_PATH,
      target?.raceCount === targetDateEntry.raceCount,
      target?.settledRaceCount === targetDateEntry.settledRaceCount,
      target?.cancelledRaceCount === targetDateEntry.cancelledRaceCount,
      target?.bytes === targetDateEntry.bytes,
      duplicateDateCount === 0,
      duplicatePathCount === 0,
      malformedItemCount === 0,
    ].every(Boolean),
  };
}

function printSection(label, value) {
  console.log(`[${label}]`);
  console.log(JSON.stringify(value, null, 2));
}

export async function writeKurariExHistoryIndexTargetDate() {
  const outputExists = existsSync(abs(INDEX_PATH));
  if (!outputExists) throw new Error(`index file missing: ${INDEX_PATH}`);
  if (!existsSync(abs(TARGET_DAILY_PATH))) throw new Error(`target daily missing: ${TARGET_DAILY_PATH}`);

  const currentIndexHashBefore = await hashFile(INDEX_PATH);
  const currentIndex = await readJson(INDEX_PATH);
  const targetDaily = await readJson(TARGET_DAILY_PATH);
  const targetDailyHash = hashPayload(targetDaily);
  const targetDailyHashMatched = targetDailyHash === EXPECTED_TARGET_DAILY_HASH;
  if (!targetDailyHashMatched) throw new Error(`target daily hash mismatch: ${targetDailyHash}`);

  const targetDateEntryExistsBefore = asArray(currentIndex.items).some((item) => item.date === TARGET_DATE);
  const targetPathEntryExistsBefore = asArray(currentIndex.items).some((item) => item.file === TARGET_DAILY_PUBLIC_PATH);
  const targetDailyByteSize = Buffer.byteLength(`${JSON.stringify(targetDaily, null, 2)}\n`, "utf8");
  const targetDateEntry = buildTargetDateEntry(targetDaily, targetDailyByteSize);
  const currentStableIndexHash = hashStableIndex(currentIndex);

  if (targetDateEntryExistsBefore || targetPathEntryExistsBefore) {
    const targetEntry = asArray(currentIndex.items).find((item) => item.date === TARGET_DATE);
    const latest = latestItem(asArray(currentIndex.items));
    const noOpValid = [
      targetDateEntryExistsBefore,
      targetPathEntryExistsBefore,
      targetEntry?.file === TARGET_DAILY_PUBLIC_PATH,
      targetEntry?.raceCount === targetDateEntry.raceCount,
      targetEntry?.settledRaceCount === targetDateEntry.settledRaceCount,
      targetEntry?.cancelledRaceCount === targetDateEntry.cancelledRaceCount,
      targetEntry?.bytes === targetDateEntry.bytes,
      currentIndex.dayCount === 53,
      asArray(currentIndex.items).length === 53,
      currentIndex.raceCount === 3997,
      currentIndex.settledRaceCount === 3989,
      currentIndex.cancelledRaceCount === 0,
      latest?.date === TARGET_DATE,
      latest?.file === TARGET_DAILY_PUBLIC_PATH,
      currentStableIndexHash === EXPECTED_CANDIDATE_INDEX_HASH,
    ].every(Boolean);
    if (!noOpValid) throw new Error("target date/path already indexed with different content");
    const summary = {
      targetDate: TARGET_DATE,
      indexPath: INDEX_PATH,
      outputExists,
      currentIndexHashBefore,
      expectedCurrentIndexHash: EXPECTED_CURRENT_INDEX_HASH,
      currentIndexHashMatched: false,
      targetDailyExists: true,
      targetDailyHash,
      expectedTargetDailyHash: EXPECTED_TARGET_DAILY_HASH,
      targetDailyHashMatched,
      targetDateEntryExistsBefore,
      targetPathEntryExistsBefore,
      writeMode: "no-op-target-already-indexed",
      writePerformed: false,
      noOp: true,
      candidateIndexHash: currentStableIndexHash,
      expectedCandidateIndexHash: EXPECTED_CANDIDATE_INDEX_HASH,
      candidateIndexHashMatched: true,
      sourceCountBefore: 53,
      sourceCountAfter: 53,
      sourceCountDelta: 0,
      raceCountBefore: 3997,
      raceCountAfter: 3997,
      raceCountDelta: 0,
      latestDateBefore: latest?.date ?? null,
      latestDateAfter: latest?.date ?? null,
      latestPathAfter: latest?.file ?? null,
      indexUpdated: false,
      historyDailyModified: false,
      analyticsSourceModified: false,
      racesModified: false,
      reviewsModifiedByThisStep: false,
      privateInputModified: false,
      srcModified: false,
      packageModified: false,
      fakeCompletionPerformed: false,
      fuzzyMatchingPerformed: false,
      predictionUsedAsResultSource: false,
      startersIdentityGeneratedFromPrediction: false,
    };
    return {
      summary,
      writePolicy: {
        targetFile: INDEX_PATH,
        writeModePlanned: "no-op-target-already-indexed",
        overwritePolicy: "allow-noop-only-if-index-stable-hash-matched",
        currentIndexHashBefore,
        currentIndexHashMatched: false,
        candidateIndexHash: currentStableIndexHash,
        candidateIndexHashMatched: true,
        writePerformed: false,
        noOp: true,
      },
      countReconciliation: {
        sourceCountBefore: 53,
        sourceCountAfter: 53,
        sourceCountDelta: 0,
        raceCountBefore: 3997,
        targetDailyRaceCount: targetDaily.raceCount,
        raceCountAfter: 3997,
        raceCountDelta: 0,
        settledRaceCountAfter: currentIndex.settledRaceCount,
        cancelledRaceCountAfter: currentIndex.cancelledRaceCount,
        totalBytesAfter: currentIndex.totalBytes,
        status: "OK",
      },
      indexWriteSummary: {
        targetDateEntry: targetEntry,
        duplicateDateCount: countDuplicates(asArray(currentIndex.items).map((item) => item.date).filter(Boolean)),
        duplicatePathCount: countDuplicates(asArray(currentIndex.items).map((item) => item.file).filter(Boolean)),
        malformedItemCount: asArray(currentIndex.items).filter((item) => (
          !item.date || !item.file || typeof item.raceCount !== "number"
        )).length,
        generatedAtUpdated: false,
        stableHashExcludingGeneratedAt: currentStableIndexHash,
      },
      jsonSummary: {
        targetDate: TARGET_DATE,
        writePerformed: false,
        noOp: true,
        candidateIndexHashMatched: true,
        sourceCountAfter: 53,
        latestDateAfter: latest?.date ?? null,
      },
    };
  }

  const currentIndexHashMatched = currentIndexHashBefore === EXPECTED_CURRENT_INDEX_HASH;
  if (!currentIndexHashMatched) {
    throw new Error(`current index hash mismatch: ${currentIndexHashBefore}`);
  }

  const { candidate, mode } = buildCandidateIndex(currentIndex, targetDateEntry);
  const candidateIndexHash = hashStableIndex(candidate);
  const candidateIndexHashMatched = candidateIndexHash === EXPECTED_CANDIDATE_INDEX_HASH;
  if (!candidateIndexHashMatched) {
    throw new Error(`candidate index hash mismatch: ${candidateIndexHash}`);
  }

  const candidateValidation = validateCandidate(candidate, targetDateEntry);
  if (!candidateValidation.valid) throw new Error("candidate index validation failed");

  let writePerformed = false;
  let noOp = false;
  if (mode === "no-op") {
    noOp = true;
  } else {
    await writeFile(abs(INDEX_PATH), `${JSON.stringify(candidate, null, 2)}\n`, "utf8");
    writePerformed = true;
  }

  const latestAfter = latestItem(asArray(candidate.items));
  const summary = {
    targetDate: TARGET_DATE,
    indexPath: INDEX_PATH,
    outputExists,
    currentIndexHashBefore,
    expectedCurrentIndexHash: EXPECTED_CURRENT_INDEX_HASH,
    currentIndexHashMatched,
    targetDailyExists: true,
    targetDailyHash,
    expectedTargetDailyHash: EXPECTED_TARGET_DAILY_HASH,
    targetDailyHashMatched,
    targetDateEntryExistsBefore,
    targetPathEntryExistsBefore,
    writeMode: mode,
    writePerformed,
    noOp,
    candidateIndexHash,
    expectedCandidateIndexHash: EXPECTED_CANDIDATE_INDEX_HASH,
    candidateIndexHashMatched,
    sourceCountBefore: 52,
    sourceCountAfter: candidateValidation.sourceCountAfter,
    sourceCountDelta: candidateValidation.sourceCountDelta,
    raceCountBefore: 3933,
    raceCountAfter: candidateValidation.raceCountAfter,
    raceCountDelta: candidateValidation.raceCountDelta,
    latestDateBefore: "2026-06-24",
    latestDateAfter: latestAfter?.date ?? null,
    latestPathAfter: latestAfter?.file ?? null,
    indexUpdated: writePerformed,
    historyDailyModified: false,
    analyticsSourceModified: false,
    racesModified: false,
    reviewsModifiedByThisStep: false,
    privateInputModified: false,
    srcModified: false,
    packageModified: false,
    fakeCompletionPerformed: false,
    fuzzyMatchingPerformed: false,
    predictionUsedAsResultSource: false,
    startersIdentityGeneratedFromPrediction: false,
  };
  return {
    summary,
    writePolicy: {
      targetFile: INDEX_PATH,
      writeModePlanned: "replace-index-only-with-current-hash-precondition",
      overwritePolicy: "allow-only-if-current-index-hash-unchanged-and-candidate-hash-matched",
      currentIndexHashBefore,
      currentIndexHashMatched,
      candidateIndexHash,
      candidateIndexHashMatched,
      writePerformed,
      noOp,
    },
    countReconciliation: {
      sourceCountBefore: 52,
      sourceCountAfter: candidateValidation.sourceCountAfter,
      sourceCountDelta: candidateValidation.sourceCountDelta,
      raceCountBefore: 3933,
      targetDailyRaceCount: targetDaily.raceCount,
      raceCountAfter: candidateValidation.raceCountAfter,
      raceCountDelta: candidateValidation.raceCountDelta,
      settledRaceCountAfter: candidate.settledRaceCount,
      cancelledRaceCountAfter: candidate.cancelledRaceCount,
      totalBytesAfter: candidate.totalBytes,
      status: "OK",
    },
    indexWriteSummary: {
      targetDateEntry,
      duplicateDateCount: candidateValidation.duplicateDateCount,
      duplicatePathCount: candidateValidation.duplicatePathCount,
      malformedItemCount: candidateValidation.malformedItemCount,
      generatedAtUpdated: true,
      stableHashExcludingGeneratedAt: candidateIndexHash,
    },
    jsonSummary: {
      targetDate: TARGET_DATE,
      writePerformed,
      noOp,
      candidateIndexHashMatched,
      sourceCountAfter: candidateValidation.sourceCountAfter,
      latestDateAfter: latestAfter?.date ?? null,
    },
  };
}

async function main() {
  const result = await writeKurariExHistoryIndexTargetDate();
  printSection("summary", result.summary);
  printSection("writePolicy", result.writePolicy);
  printSection("countReconciliation", result.countReconciliation);
  printSection("indexWriteSummary", result.indexWriteSummary);
  printSection("jsonSummary", result.jsonSummary);
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  main().catch((error) => {
    console.error("[kurari-ex history index target-date writer] failed");
    console.error(error);
    process.exitCode = 1;
  });
}
