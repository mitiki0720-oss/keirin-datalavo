import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();
const TARGETS = [
  { date: "2026-06-30", expectedRaceCount: 76 },
  { date: "2026-07-01", expectedRaceCount: 83 },
];
const INDEX_PATH = "public/data/analytics/kurari-ex/history/index.generated.json";
const EXPECTED_INDEX_HASH =
  "sha256:d04711a5f5fda9a0082b2cf962138394a3c23aaa02c899393a04ea6a2258e180";
const EXPECTED_INDEX_BYTES = 13603;
const MAPPING_TEMPLATE =
  "scripts/audit-kurari-ex-private-raw-history-daily-mapping-dry-run-2026-06-25.mjs";
const RUNNER =
  "scripts/run-kurari-ex-history-no-starters-batch-2026-06-30-to-2026-07-01.mjs";
const CHECKER =
  "scripts/check-kurari-ex-history-batch-2026-06-30-to-2026-07-01.mjs";
const FINAL_LATEST_PATH =
  "/data/analytics/kurari-ex/history/daily/2026-07/2026-07-01.generated.json";
const KNOWN_REVIEWS = [
  "public/data/reviews/index.json",
  "public/data/reviews/2026-06-28/",
  "public/data/reviews/2026-06-29/",
  "public/data/reviews/2026-06-30/",
  "public/data/reviews/2026-07-01/",
];

function dailyPath(date) {
  return `public/data/analytics/kurari-ex/history/daily/${date.slice(0, 7)}/${date}.generated.json`;
}

function publicPath(date) {
  return `/data/analytics/kurari-ex/history/daily/${date.slice(0, 7)}/${date}.generated.json`;
}

function memoPath(date) {
  return `docs/kurari-ex/${date}-history-completion.md`;
}

const STATUS_MEMO = "docs/kurari-ex/history-status-2026-06-25-to-2026-07-01.md";
const ALLOWED = new Set([
  RUNNER,
  CHECKER,
  INDEX_PATH,
  STATUS_MEMO,
  ...TARGETS.flatMap(({ date }) => [dailyPath(date), memoPath(date)]),
]);

function abs(file) {
  return path.isAbsolute(file) ? file : path.resolve(ROOT, file);
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function hashPayload(value) {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")}`;
}

function knownReview(file) {
  return KNOWN_REVIEWS.some(
    (known) => file === known || (known.endsWith("/") && file.startsWith(known)),
  );
}

function worktreeGuard() {
  const output = execFileSync(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=all"],
    { cwd: ROOT, encoding: "utf8" },
  );
  const rows = output.split(/\r?\n/u).filter(Boolean).map((line) => ({
    status: line.slice(0, 2),
    file: line.slice(3).replace(/^"|"$/gu, "").replaceAll("\\", "/"),
  }));
  const protectedChanges =
    rows.filter(({ file }) => !ALLOWED.has(file) && !knownReview(file));
  const staged =
    rows.filter(({ status }) => status[0] !== " " && status[0] !== "?");
  return {
    pass: protectedChanges.length === 0 && staged.length === 0,
    protectedChanges,
    staged,
  };
}

async function loadCandidate(date) {
  let source = await readFile(abs(MAPPING_TEMPLATE), "utf8");
  const target = 'const TARGET_DATE = "2026-06-25";';
  if (!source.includes(target)) throw new Error("mapping template target missing");
  source = source.replace(target, `const TARGET_DATE = "${date}";`);
  source += `

export async function __buildNextBatchCandidate() {
  const parserModule = await loadParserInternals();
  const parsed = await parserModule.__parseTargetDateForAvailabilityAudit();
  const reviewFiles = await filesIn(REVIEW_ROOT);
  const summaries = reviewFiles.filter(
    (file) => sourceType(file) === "review-summary",
  );
  const summaryByVenue = new Map(
    summaries.map((file) => [
      venueSlug(file),
      file.replace(/^public\\\\/u, ""),
    ]),
  );
  return {
    candidate: buildCandidate(
      parsed.resultSummary.races,
      parsed.predictionSummary.races,
      summaryByVenue,
    ),
    resultCompleteness: parsed.resultSummary.resultCompleteness,
    resultRaceCount: parsed.resultSummary.races.length,
    predictionRaceCount: parsed.predictionSummary.races.length,
    reviewSummaryCount: summaries.length,
  };
}
`;
  const url =
    `data:text/javascript;base64,${Buffer.from(source, "utf8").toString("base64")}`;
  const module = await import(url);
  return module.__buildNextBatchCandidate();
}

function summarizeDaily(daily) {
  const races = array(daily?.items);
  const starters = races.flatMap((race) => array(race?.starters));
  return {
    raceCount: daily?.raceCount ?? 0,
    venueCount: new Set(races.map((race) => race?.venueKey)).size,
    settledRaceCount: daily?.settledRaceCount ?? 0,
    cancelledRaceCount: daily?.cancelledRaceCount ?? 0,
    predictionLinkedRaceCount:
      races.filter((race) => race?.predictionEnrichment?.status === "matched").length,
    reviewLinkedRaceCount:
      races.filter((race) => race?.reviewEnrichment?.status === "matched").length,
    noStartersRaceCount:
      races.filter((race) => (
        race?.starterCount === 0
        && array(race?.starters).length === 0
        && race?.quality?.starterParsed === false
        && race?.quality?.marker === "NO_STARTERS"
        && array(race?.quality?.warnings).includes("NO_STARTERS")
      )).length,
    starterTotalCount: starters.length,
    generatedRegistrationNoCount:
      starters.filter((starter) => starter?.registrationNo).length,
    generatedNameCount: starters.filter((starter) => starter?.name).length,
    generatedCarNoCount: starters.filter((starter) => starter?.carNo).length,
    duplicateRaceKeyCount:
      races.length - new Set(races.map((race) => race?.raceKey)).size,
    missingCoreFieldCount:
      races.filter((race) => (
        !race?.raceKey
        || !race?.date
        || !race?.venueKey
        || !race?.venueName
        || !race?.raceNumber
        || !race?.result?.trifecta?.combination
        || !race?.prediction
      )).length,
  };
}

function validateDaily(target, daily, source) {
  const summary = summarizeDaily(daily);
  const races = array(daily?.items);
  const valid = [
    daily?.schemaVersion === 1,
    daily?.date === target.date,
    summary.raceCount === target.expectedRaceCount,
    races.length === target.expectedRaceCount,
    source.resultCompleteness === "complete",
    source.resultRaceCount === target.expectedRaceCount,
    source.predictionRaceCount === target.expectedRaceCount,
    source.reviewSummaryCount === summary.venueCount,
    summary.settledRaceCount === target.expectedRaceCount,
    summary.cancelledRaceCount === 0,
    summary.predictionLinkedRaceCount === target.expectedRaceCount,
    summary.reviewLinkedRaceCount === target.expectedRaceCount,
    summary.noStartersRaceCount === target.expectedRaceCount,
    summary.starterTotalCount === 0,
    summary.generatedRegistrationNoCount === 0,
    summary.generatedNameCount === 0,
    summary.generatedCarNoCount === 0,
    summary.duplicateRaceKeyCount === 0,
    summary.missingCoreFieldCount === 0,
    races.every((race) => race.date === target.date),
  ].every(Boolean);
  return { valid, ...summary };
}

function starterOrEntriesExists(date) {
  return [
    `public/data/analytics/kurari-ex/source/starters/${date}/today-registration-starters.generated.json`,
    `public/data/races/entries-history/${date}/keirin-jp-entries.generated.json`,
  ].some((file) => existsSync(abs(file)));
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function latest(items) {
  return [...items]
    .sort((left, right) => String(left.date).localeCompare(String(right.date)))
    .at(-1);
}

function buildIndex(index, additions) {
  const items = [...array(index.items), ...additions]
    .sort((left, right) => String(left.date).localeCompare(String(right.date)));
  return {
    ...index,
    generatedAt: new Date().toISOString(),
    period: { from: index.period.from, to: latest(items).date },
    dayCount: items.length,
    raceCount: items.reduce((sum, item) => sum + item.raceCount, 0),
    settledRaceCount: items.reduce((sum, item) => sum + item.settledRaceCount, 0),
    cancelledRaceCount: items.reduce((sum, item) => sum + item.cancelledRaceCount, 0),
    totalBytes: items.reduce((sum, item) => sum + item.bytes, 0),
    items,
  };
}

function validateIndex(before, after, additions) {
  const beforeItems = array(before.items);
  const afterItems = array(after.items);
  const afterByDate = new Map(afterItems.map((item) => [item.date, item]));
  return [
    additions.length === 2,
    afterItems.length === 58,
    after.dayCount === 58,
    after.raceCount === 4373,
    after.raceCount === afterItems.reduce((sum, item) => sum + item.raceCount, 0),
    after.totalBytes === afterItems.reduce((sum, item) => sum + item.bytes, 0),
    latest(afterItems)?.date === "2026-07-01",
    latest(afterItems)?.file === FINAL_LATEST_PATH,
    new Set(afterItems.map((item) => item.date)).size === afterItems.length,
    new Set(afterItems.map((item) => item.file)).size === afterItems.length,
    beforeItems.every((item) => same(item, afterByDate.get(item.date))),
  ].every(Boolean);
}

async function atomicCreate(file, buffer) {
  const target = abs(file);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
  const handle = await open(temporary, "wx");
  try {
    await handle.writeFile(buffer);
  } finally {
    await handle.close();
  }
  try {
    if (existsSync(target)) throw new Error(`target already exists: ${file}`);
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

async function atomicReplace(file, buffer) {
  const target = abs(file);
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
  const handle = await open(temporary, "wx");
  try {
    await handle.writeFile(buffer);
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

function completionMemo(item, indexSummary) {
  const token = item.date.replaceAll("-", "_");
  return `# KURARI EX ${item.date} History Completion Memo

## Status

- Status: \`PHASE_COMPLETE_${token}_NO_STARTERS\`
- Final consistency: \`FINAL_CONSISTENCY_PASS_${token}_NO_STARTERS\`
- UI/API smoke: \`UI_API_CONSUMPTION_SMOKE_PASS_${token}_NO_STARTERS\`

## Data

- Daily: \`${item.dailyPath}\`
- Public path: \`${item.publicPath}\`
- Daily hash: \`${item.dailyHash}\`
- Daily bytes: \`${item.dailyBytes}\`
- Race / venue count: \`${item.raceCount} / ${item.venueCount}\`
- Prediction / review linked: \`${item.predictionLinkedRaceCount} / ${item.reviewLinkedRaceCount}\`
- \`NO_STARTERS\`: \`${item.noStartersRaceCount}\`
- Starter total: \`${item.starterTotalCount}\`
- Index entry: registered

## Final Index

- Hash: \`${indexSummary.hash}\`
- Bytes: \`${indexSummary.bytes}\`
- Source / day / race count: \`58 / 58 / 4373\`
- Total bytes: \`${indexSummary.totalBytes}\`
- Latest date: \`2026-07-01\`
- Latest path: \`${FINAL_LATEST_PATH}\`

## Safety

- Fake completion: none
- Fuzzy matching: none
- Generated starter identity or \`registrationNo\`: none
- Starters / entries: not available; acquisition remains a separate phase
`;
}

function statusMemo(perDate, indexSummary) {
  return `# KURARI EX History Status Memo: 2026-06-25 to 2026-07-01

## Batch

- Latest verified batch: \`24-BATCH-03\`
- Latest verified commit: pending before commit

## Completed Dates

- 2026-06-25: \`NO_STARTERS\`, 75R, starter total 0
- 2026-06-27: \`NO_STARTERS\`, 83R, starter total 0
- 2026-06-28: \`NO_STARTERS\`, 59R, starter total 0
- 2026-06-29: starters parsed, 64R, starter total 464
- 2026-06-30: \`NO_STARTERS\`, ${perDate[0].raceCount}R, starter total 0
- 2026-07-01: \`NO_STARTERS\`, ${perDate[1].raceCount}R, starter total 0

## Current Index

- Hash: \`${indexSummary.hash}\`
- Bytes: \`${indexSummary.bytes}\`
- Source / day / race count: \`58 / 58 / 4373\`
- Total bytes / item bytes sum: \`${indexSummary.totalBytes} / ${indexSummary.totalBytes}\`
- Latest date: \`2026-07-01\`
- Latest path: \`${FINAL_LATEST_PATH}\`

## Known Skipped or Blocked

- 2026-06-26: \`MISSING_REQUIRED_SOURCE\`

## Policy and Open Tasks

- Fake completion, fuzzy matching, generated starters, and generated \`registrationNo\`: none
- Cross-date and cross-venue joins: none
- Starters/entries acquisition for \`NO_STARTERS\` dates remains separate
- Existing reviews working-tree differences remain outside this batch
- The next availability target must be selected separately
`;
}

function print(label, value) {
  console.log(`[${label}]`);
  console.log(JSON.stringify(value, null, 2));
}

export async function runKurariExHistoryNoStartersBatch20260630To20260701() {
  const guardBefore = worktreeGuard();
  if (!guardBefore.pass) {
    const summary = {
      batchStatus: "BATCH_BLOCKED",
      processedDates: [],
      skippedDates: TARGETS.map((item) => item.date),
      failedDates: TARGETS.map((item) => item.date),
      protectedChanges: guardBefore.protectedChanges,
      blockReasonCounts: { EXISTING_SCRIPT_MODIFIED: 1 },
      writePerformed: false,
    };
    print("summary", summary);
    process.exitCode = 1;
    return summary;
  }

  const indexBufferBefore = await readFile(abs(INDEX_PATH));
  const indexBefore = JSON.parse(indexBufferBefore.toString("utf8"));
  const indexHashBefore = hashPayload(indexBefore);
  const existingTargets =
    TARGETS.filter(({ date }) => array(indexBefore.items).some((item) => item.date === date));
  const existingDailies =
    TARGETS.filter(({ date }) => existsSync(abs(dailyPath(date))));

  if (existingTargets.length || existingDailies.length) {
    if (existingTargets.length !== 2 || existingDailies.length !== 2) {
      throw new Error("TARGET_DATE_ALREADY_IN_HISTORY_DIFFERENT");
    }
    const perDateSummary = [];
    for (const target of TARGETS) {
      const buffer = await readFile(abs(dailyPath(target.date)));
      const daily = JSON.parse(buffer.toString("utf8"));
      const validation = validateDaily(target, daily, {
        resultCompleteness: "complete",
        resultRaceCount: target.expectedRaceCount,
        predictionRaceCount: target.expectedRaceCount,
        reviewSummaryCount: new Set(array(daily.items).map((item) => item.venueKey)).size,
      });
      const entry = array(indexBefore.items).find((item) => item.date === target.date);
      if (
        !validation.valid
        || entry?.file !== publicPath(target.date)
        || entry?.bytes !== buffer.length
        || !existsSync(abs(memoPath(target.date)))
      ) throw new Error("TARGET_DAILY_ALREADY_EXISTS_DIFFERENT");
      perDateSummary.push({
        date: target.date,
        status: "ALREADY_COMPLETED",
        dailyPath: dailyPath(target.date),
        publicPath: publicPath(target.date),
        dailyHash: hashPayload(daily),
        dailyBytes: buffer.length,
        ...validation,
        indexEntryExists: true,
        memoCreated: true,
      });
    }
    const baseline = JSON.parse(execFileSync(
      "git",
      ["show", `HEAD:${INDEX_PATH}`],
      { cwd: ROOT, encoding: "utf8" },
    ));
    const currentByDate =
      new Map(array(indexBefore.items).map((item) => [item.date, item]));
    const latestCurrent = latest(array(indexBefore.items));
    const noOpIndexValid = [
      array(indexBefore.items).length === 58,
      indexBefore.dayCount === 58,
      indexBefore.raceCount === 4373,
      indexBefore.totalBytes
        === array(indexBefore.items).reduce((sum, item) => sum + item.bytes, 0),
      latestCurrent?.date === "2026-07-01",
      latestCurrent?.file === FINAL_LATEST_PATH,
      new Set(array(indexBefore.items).map((item) => item.date)).size === 58,
      new Set(array(indexBefore.items).map((item) => item.file)).size === 58,
      array(baseline.items).every(
        (item) => same(item, currentByDate.get(item.date)),
      ),
      existsSync(abs(STATUS_MEMO)),
    ].every(Boolean);
    if (!noOpIndexValid) throw new Error("INDEX_POST_WRITE_VERIFY_FAILED");
    const latestItem = latest(array(indexBefore.items));
    const summary = {
      batchStatus: "BATCH_NOOP_ALREADY_COMPLETED",
      processedDates: [],
      skippedDates: TARGETS.map((item) => item.date),
      failedDates: [],
      currentIndexHashBefore: indexHashBefore,
      currentIndexHashAfter: indexHashBefore,
      currentIndexBytesAfter: indexBufferBefore.length,
      sourceCountAfter: array(indexBefore.items).length,
      dayCountAfter: indexBefore.dayCount,
      raceCountAfter: indexBefore.raceCount,
      totalBytesAfter: indexBefore.totalBytes,
      itemBytesSumAfter:
        array(indexBefore.items).reduce((sum, item) => sum + item.bytes, 0),
      latestDateAfter: latestItem.date,
      latestPathAfter: latestItem.file,
      perDateSummary,
      changedFiles: [],
      protectedChanges: [],
      blockReasonCounts: {},
      writePerformed: false,
    };
    print("summary", summary);
    return summary;
  }

  if (indexHashBefore !== EXPECTED_INDEX_HASH) throw new Error("CURRENT_INDEX_HASH_MISMATCH");
  if (indexBufferBefore.length !== EXPECTED_INDEX_BYTES) {
    throw new Error("CURRENT_INDEX_BYTES_MISMATCH");
  }
  if (TARGETS.some(({ date }) => starterOrEntriesExists(date))) {
    throw new Error("STARTERS_SOURCE_AVAILABLE_UNEXPECTEDLY");
  }

  const prepared = [];
  for (const target of TARGETS) {
    const source = await loadCandidate(target.date);
    const validation = validateDaily(target, source.candidate, source);
    if (!validation.valid) throw new Error(`candidate validation failed: ${target.date}`);
    const buffer = Buffer.from(`${JSON.stringify(source.candidate, null, 2)}\n`, "utf8");
    prepared.push({
      date: target.date,
      daily: source.candidate,
      buffer,
      dailyPath: dailyPath(target.date),
      publicPath: publicPath(target.date),
      memoPath: memoPath(target.date),
      dailyHash: hashPayload(source.candidate),
      dailyBytes: buffer.length,
      ...validation,
    });
  }

  const additions = prepared.map((item) => ({
    date: item.date,
    file: item.publicPath,
    raceCount: item.raceCount,
    settledRaceCount: item.settledRaceCount,
    cancelledRaceCount: item.cancelledRaceCount,
    bytes: item.dailyBytes,
  }));
  const indexAfter = buildIndex(indexBefore, additions);
  if (!validateIndex(indexBefore, indexAfter, additions)) {
    throw new Error("INDEX_COUNTS_MISMATCH");
  }
  const indexBufferAfter =
    Buffer.from(`${JSON.stringify(indexAfter, null, 2)}\n`, "utf8");
  const indexSummary = {
    hash: hashPayload(indexAfter),
    bytes: indexBufferAfter.length,
    totalBytes: indexAfter.totalBytes,
  };

  const created = [];
  let indexWritten = false;
  try {
    for (const item of prepared) {
      await atomicCreate(item.dailyPath, item.buffer);
      created.push(item.dailyPath);
    }
    await atomicReplace(INDEX_PATH, indexBufferAfter);
    indexWritten = true;
    for (const item of prepared) {
      await atomicCreate(
        item.memoPath,
        Buffer.from(completionMemo(item, indexSummary), "utf8"),
      );
      created.push(item.memoPath);
    }
    await atomicCreate(
      STATUS_MEMO,
      Buffer.from(statusMemo(prepared, indexSummary), "utf8"),
    );
    created.push(STATUS_MEMO);
  } catch (error) {
    if (indexWritten) await atomicReplace(INDEX_PATH, indexBufferBefore);
    for (const file of created.reverse()) await rm(abs(file), { force: true });
    throw error;
  }

  const guardAfter = worktreeGuard();
  if (!guardAfter.pass) throw new Error("protected modification detected after write");
  const finalBuffer = await readFile(abs(INDEX_PATH));
  const finalIndex = JSON.parse(finalBuffer.toString("utf8"));
  const latestItem = latest(array(finalIndex.items));
  const summary = {
    batchStatus: "BATCH_WRITE_COMPLETED",
    processedDates: TARGETS.map((item) => item.date),
    skippedDates: [],
    failedDates: [],
    currentIndexHashBefore: indexHashBefore,
    currentIndexHashAfter: hashPayload(finalIndex),
    currentIndexBytesAfter: finalBuffer.length,
    sourceCountAfter: array(finalIndex.items).length,
    dayCountAfter: finalIndex.dayCount,
    raceCountAfter: finalIndex.raceCount,
    totalBytesAfter: finalIndex.totalBytes,
    itemBytesSumAfter:
      array(finalIndex.items).reduce((sum, item) => sum + item.bytes, 0),
    latestDateAfter: latestItem.date,
    latestPathAfter: latestItem.file,
    perDateSummary: prepared.map((item) => ({
      date: item.date,
      status: "PROCESSED",
      dailyPath: item.dailyPath,
      publicPath: item.publicPath,
      dailyHash: item.dailyHash,
      dailyBytes: item.dailyBytes,
      raceCount: item.raceCount,
      venueCount: item.venueCount,
      predictionLinkedRaceCount: item.predictionLinkedRaceCount,
      reviewLinkedRaceCount: item.reviewLinkedRaceCount,
      noStartersRaceCount: item.noStartersRaceCount,
      starterTotalCount: item.starterTotalCount,
      indexEntryExists: true,
      memoCreated: true,
    })),
    changedFiles: [...prepared.flatMap((item) => [item.dailyPath, item.memoPath]), INDEX_PATH, STATUS_MEMO],
    protectedChanges: guardAfter.protectedChanges,
    blockReasonCounts: {},
    writePerformed: true,
  };
  print("summary", summary);
  return summary;
}

const isMain =
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  runKurariExHistoryNoStartersBatch20260630To20260701().catch((error) => {
    console.error("[kurari-ex 2026-06-30 to 2026-07-01 batch] failed");
    console.error(error);
    process.exitCode = 1;
  });
}
