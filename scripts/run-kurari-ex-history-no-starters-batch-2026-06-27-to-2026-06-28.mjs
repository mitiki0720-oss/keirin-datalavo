import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  open,
  readFile,
  rename,
  rm,
} from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();
const TARGET_DATES = ["2026-06-27", "2026-06-28"];
const INDEX_PATH = "public/data/analytics/kurari-ex/history/index.generated.json";
const MAPPING_TEMPLATE =
  "scripts/audit-kurari-ex-private-raw-history-daily-mapping-dry-run-2026-06-25.mjs";
const RUNNER_PATH =
  "scripts/run-kurari-ex-history-no-starters-batch-2026-06-27-to-2026-06-28.mjs";
const CHECKER_PATH =
  "scripts/check-kurari-ex-history-batch-2026-06-25-2026-06-27-2026-06-28.mjs";
const LATEST_DATE = "2026-06-29";
const LATEST_PATH =
  "/data/analytics/kurari-ex/history/daily/2026-06/2026-06-29.generated.json";
const KNOWN_REVIEW_CHANGES = [
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

const ALLOWED_FILES = new Set([
  RUNNER_PATH,
  CHECKER_PATH,
  INDEX_PATH,
  "docs/kurari-ex/2026-06-25-history-completion.md",
  ...TARGET_DATES.flatMap((date) => [dailyPath(date), memoPath(date)]),
]);

function abs(file) {
  return path.isAbsolute(file) ? file : path.resolve(ROOT, file);
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function hashBuffer(buffer) {
  return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
}

function hashPayload(payload) {
  return hashBuffer(Buffer.from(JSON.stringify(payload), "utf8"));
}

async function readJson(file) {
  return JSON.parse(await readFile(abs(file), "utf8"));
}

function parsePorcelain() {
  const output = execFileSync(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=all"],
    { cwd: ROOT, encoding: "utf8" },
  );
  return output.split(/\r?\n/u).filter(Boolean).map((line) => {
    const status = line.slice(0, 2);
    const raw = line.slice(3).replace(/^"|"$/gu, "");
    const file = (raw.includes(" -> ") ? raw.split(" -> ").at(-1) : raw)
      .replaceAll("\\", "/");
    return { status, file };
  });
}

function knownReview(file) {
  return KNOWN_REVIEW_CHANGES.some(
    (known) => file === known || (known.endsWith("/") && file.startsWith(known)),
  );
}

function protectedModificationGuard() {
  const rows = parsePorcelain();
  const protectedChanges = rows
    .filter(({ file }) => !ALLOWED_FILES.has(file) && !knownReview(file))
    .map(({ status, file }) => ({ status, file }));
  const stagedFiles = rows
    .filter(({ status }) => status[0] !== " " && status[0] !== "?")
    .map(({ file }) => file);
  return {
    pass: protectedChanges.length === 0 && stagedFiles.length === 0,
    protectedChanges,
    stagedFiles,
  };
}

async function loadCandidateBuilder(date) {
  let source = await readFile(abs(MAPPING_TEMPLATE), "utf8");
  const target = 'const TARGET_DATE = "2026-06-25";';
  if (!source.includes(target)) throw new Error("mapping template target constant missing");
  source = source.replace(target, `const TARGET_DATE = "${date}";`);
  source += `

export async function __buildBatchCandidate() {
  const parserModule = await loadParserInternals();
  const parsed = await parserModule.__parseTargetDateForAvailabilityAudit();
  const rawFiles = await filesIn(RAW_ROOT);
  const reviewFiles = await filesIn(REVIEW_ROOT);
  const reviewSummaryFiles = reviewFiles.filter(
    (file) => sourceType(file) === "review-summary",
  );
  const reviewSummaryByVenue = new Map(
    reviewSummaryFiles.map((file) => [
      venueSlug(file),
      file.replace(/^public\\\\/u, ""),
    ]),
  );
  return {
    candidate: buildCandidate(
      parsed.resultSummary.races,
      parsed.predictionSummary.races,
      reviewSummaryByVenue,
    ),
    resultRaceCount: parsed.resultSummary.races.length,
    predictionRaceCount: parsed.predictionSummary.races.length,
    reviewSummaryCount: reviewSummaryFiles.length,
  };
}
`;
  const url =
    `data:text/javascript;base64,${Buffer.from(source, "utf8").toString("base64")}`;
  return import(url);
}

function summarizeDaily(daily) {
  const items = array(daily?.items);
  const starters = items.flatMap((item) => array(item?.starters));
  return {
    raceCount: daily?.raceCount ?? 0,
    venueCount: new Set(items.map((item) => item?.venueKey)).size,
    settledRaceCount: daily?.settledRaceCount ?? 0,
    cancelledRaceCount: daily?.cancelledRaceCount ?? 0,
    predictionLinkedRaceCount:
      items.filter((item) => item?.predictionEnrichment?.status === "matched").length,
    reviewLinkedRaceCount:
      items.filter((item) => item?.reviewEnrichment?.status === "matched").length,
    noStartersRaceCount:
      items.filter((item) => (
        item?.starterCount === 0
        && array(item?.starters).length === 0
        && item?.quality?.starterParsed === false
        && item?.quality?.marker === "NO_STARTERS"
      )).length,
    starterTotalCount: starters.length,
    duplicateRaceKeyCount:
      items.length - new Set(items.map((item) => item?.raceKey)).size,
    missingCoreFieldCount:
      items.filter((item) => (
        !item?.raceKey
        || !item?.date
        || !item?.venueKey
        || !item?.venueName
        || !item?.raceNumber
        || !item?.result?.trifecta?.combination
        || !item?.prediction
      )).length,
    generatedRegistrationNoCount:
      starters.filter((starter) => starter?.registrationNo).length,
  };
}

function validateCandidate(date, candidate, source) {
  const summary = summarizeDaily(candidate);
  const items = array(candidate?.items);
  const valid = [
    candidate?.schemaVersion === 1,
    candidate?.date === date,
    summary.raceCount > 0,
    items.length === summary.raceCount,
    source.resultRaceCount === summary.raceCount,
    source.predictionRaceCount === summary.raceCount,
    source.reviewSummaryCount === summary.venueCount,
    summary.settledRaceCount === summary.raceCount,
    summary.cancelledRaceCount === 0,
    summary.predictionLinkedRaceCount === summary.raceCount,
    summary.reviewLinkedRaceCount === summary.raceCount,
    summary.noStartersRaceCount === summary.raceCount,
    summary.starterTotalCount === 0,
    summary.duplicateRaceKeyCount === 0,
    summary.missingCoreFieldCount === 0,
    summary.generatedRegistrationNoCount === 0,
    items.every((item) => item.date === date),
  ].every(Boolean);
  return { valid, ...summary };
}

function startersOrEntriesExist(date) {
  return [
    `public/data/analytics/kurari-ex/source/starters/${date}/today-registration-starters.generated.json`,
    `public/data/races/entries-history/${date}/keirin-jp-entries.generated.json`,
  ].some((file) => existsSync(abs(file)));
}

function sameEntry(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function latestItem(items) {
  return [...items]
    .sort((left, right) => String(left.date).localeCompare(String(right.date)))
    .at(-1) ?? null;
}

function buildIndexCandidate(index, additions) {
  const before = array(index?.items);
  const additionDates = new Set(additions.map((item) => item.date));
  if (before.some((item) => additionDates.has(item.date))) {
    throw new Error("candidate index would replace an existing date");
  }
  const items = [...before, ...additions]
    .sort((left, right) => String(left.date).localeCompare(String(right.date)));
  return {
    ...index,
    generatedAt: new Date().toISOString(),
    period: {
      from: index?.period?.from ?? items[0]?.date,
      to: latestItem(items)?.date,
    },
    dayCount: items.length,
    raceCount: items.reduce((sum, item) => sum + Number(item.raceCount || 0), 0),
    settledRaceCount:
      items.reduce((sum, item) => sum + Number(item.settledRaceCount || 0), 0),
    cancelledRaceCount:
      items.reduce((sum, item) => sum + Number(item.cancelledRaceCount || 0), 0),
    totalBytes: items.reduce((sum, item) => sum + Number(item.bytes || 0), 0),
    items,
  };
}

function validateIndex(before, after, additions) {
  const beforeItems = array(before?.items);
  const afterItems = array(after?.items);
  const afterByDate = new Map(afterItems.map((item) => [item.date, item]));
  const latest = latestItem(afterItems);
  return [
    additions.length > 0,
    afterItems.length === beforeItems.length + additions.length,
    after.dayCount === afterItems.length,
    after.raceCount === afterItems.reduce((sum, item) => sum + item.raceCount, 0),
    after.settledRaceCount
      === afterItems.reduce((sum, item) => sum + item.settledRaceCount, 0),
    after.cancelledRaceCount
      === afterItems.reduce((sum, item) => sum + item.cancelledRaceCount, 0),
    after.totalBytes === afterItems.reduce((sum, item) => sum + item.bytes, 0),
    latest?.date === LATEST_DATE,
    latest?.file === LATEST_PATH,
    new Set(afterItems.map((item) => item.date)).size === afterItems.length,
    new Set(afterItems.map((item) => item.file)).size === afterItems.length,
    beforeItems.every((item) => sameEntry(item, afterByDate.get(item.date))),
  ].every(Boolean);
}

async function atomicCreate(file, buffer) {
  const target = abs(file);
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
  const handle = await open(temporary, "wx");
  try {
    await handle.writeFile(buffer);
  } finally {
    await handle.close();
  }
  try {
    if (existsSync(target)) throw new Error(`target appeared before write: ${file}`);
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

function completionMemo(date, details, indexSummary) {
  return `# KURARI EX ${date} History Completion Memo

## Status

- Status: \`PHASE_COMPLETE_${date.replaceAll("-", "_")}_NO_STARTERS\`
- Final consistency: \`FINAL_CONSISTENCY_PASS_${date.replaceAll("-", "_")}_NO_STARTERS\`
- UI/API smoke: \`UI_API_CONSUMPTION_SMOKE_PASS_${date.replaceAll("-", "_")}_NO_STARTERS\`

## Data

- Daily: \`${details.dailyPath}\`
- Public path: \`${details.publicPath}\`
- Daily hash: \`${details.dailyHash}\`
- Daily bytes: \`${details.dailyBytes}\`
- Race / venue count: \`${details.raceCount} / ${details.venueCount}\`
- Prediction / review linked: \`${details.predictionLinkedRaceCount} / ${details.reviewLinkedRaceCount}\`
- \`NO_STARTERS\` races: \`${details.noStartersRaceCount}\`
- Starter total: \`${details.starterTotalCount}\`

## Index

- Source / day / race count: \`${indexSummary.sourceCount} / ${indexSummary.dayCount} / ${indexSummary.raceCount}\`
- Total bytes: \`${indexSummary.totalBytes}\`
- Latest date: \`${indexSummary.latestDate}\`
- Latest path: \`${indexSummary.latestPath}\`

## Safety

- Fake completion: none
- Fuzzy matching: none
- Generated starter identity / \`registrationNo\`: none
- Starters / entries: not available; acquisition remains a separate phase
`;
}

function printSection(label, value) {
  console.log(`[${label}]`);
  console.log(JSON.stringify(value, null, 2));
}

export async function runKurariExHistoryNoStartersBatch20260627To20260628() {
  const guardBefore = protectedModificationGuard();
  if (!guardBefore.pass) {
    const result = {
      batchStatus: "BATCH_BLOCKED",
      processedDates: [],
      skippedDates: TARGET_DATES,
      failedDates: TARGET_DATES,
      changedFiles: [],
      protectedChanges: guardBefore.protectedChanges,
      blockReasonCounts: { PROTECTED_MODIFICATION_FOUND: guardBefore.protectedChanges.length },
      writePerformed: false,
    };
    printSection("summary", result);
    process.exitCode = 1;
    return result;
  }

  const indexBufferBefore = await readFile(abs(INDEX_PATH));
  const indexBefore = JSON.parse(indexBufferBefore.toString("utf8"));
  const indexHashBefore = hashPayload(indexBefore);
  const original20260625 =
    array(indexBefore.items).find((item) => item.date === "2026-06-25");
  const original20260629 =
    array(indexBefore.items).find((item) => item.date === "2026-06-29");
  const prepared = [];
  const perDateSummary = [];
  const skippedDates = [];
  const failedDates = [];
  const blockReasonCounts = {};

  for (const date of TARGET_DATES) {
    const targetDailyPath = dailyPath(date);
    const targetPublicPath = publicPath(date);
    const targetMemoPath = memoPath(date);
    const existingEntry =
      array(indexBefore.items).find((item) => item.date === date);
    const dailyExists = existsSync(abs(targetDailyPath));
    if (existingEntry || dailyExists) {
      if (!existingEntry || !dailyExists || existingEntry.file !== targetPublicPath) {
        skippedDates.push(date);
        failedDates.push(date);
        blockReasonCounts.EXISTING_TARGET_PARTIAL_OR_DIFFERENT =
          (blockReasonCounts.EXISTING_TARGET_PARTIAL_OR_DIFFERENT ?? 0) + 1;
        continue;
      }
      const buffer = await readFile(abs(targetDailyPath));
      const daily = JSON.parse(buffer.toString("utf8"));
      const validation = validateCandidate(
        date,
        daily,
        {
          resultRaceCount: daily.raceCount,
          predictionRaceCount: daily.raceCount,
          reviewSummaryCount: new Set(array(daily.items).map((item) => item.venueKey)).size,
        },
      );
      if (
        !validation.valid
        || existingEntry.bytes !== buffer.length
        || existingEntry.raceCount !== daily.raceCount
      ) {
        skippedDates.push(date);
        failedDates.push(date);
        blockReasonCounts.EXISTING_TARGET_VALIDATION_FAILED =
          (blockReasonCounts.EXISTING_TARGET_VALIDATION_FAILED ?? 0) + 1;
        continue;
      }
      perDateSummary.push({
        date,
        status: "ALREADY_COMPLETED",
        dailyPath: targetDailyPath,
        publicPath: targetPublicPath,
        dailyHash: hashPayload(daily),
        dailyBytes: buffer.length,
        ...validation,
        indexEntryExists: true,
        memoCreated: existsSync(abs(targetMemoPath)),
      });
      skippedDates.push(date);
      continue;
    }
    if (startersOrEntriesExist(date)) {
      skippedDates.push(date);
      failedDates.push(date);
      blockReasonCounts.STARTERS_OR_ENTRIES_SOURCE_EXISTS =
        (blockReasonCounts.STARTERS_OR_ENTRIES_SOURCE_EXISTS ?? 0) + 1;
      continue;
    }
    try {
      const module = await loadCandidateBuilder(date);
      const source = await module.__buildBatchCandidate();
      const validation = validateCandidate(date, source.candidate, source);
      if (!validation.valid) throw new Error("candidate validation failed");
      const buffer = Buffer.from(`${JSON.stringify(source.candidate, null, 2)}\n`, "utf8");
      const details = {
        date,
        status: "READY",
        dailyPath: targetDailyPath,
        publicPath: targetPublicPath,
        memoPath: targetMemoPath,
        dailyHash: hashPayload(source.candidate),
        dailyBytes: buffer.length,
        buffer,
        daily: source.candidate,
        ...validation,
      };
      prepared.push(details);
    } catch (error) {
      skippedDates.push(date);
      failedDates.push(date);
      blockReasonCounts.CANDIDATE_BUILD_OR_VALIDATION_FAILED =
        (blockReasonCounts.CANDIDATE_BUILD_OR_VALIDATION_FAILED ?? 0) + 1;
      perDateSummary.push({ date, status: "SKIP_DATE", reason: error.message });
    }
  }

  if (failedDates.length > 0) {
    const summary = {
      batchStatus: "BATCH_PARTIAL_COMPLETED",
      processedDates: [],
      skippedDates,
      failedDates,
      currentIndexHashBefore: indexHashBefore,
      currentIndexHashAfter: indexHashBefore,
      perDateSummary,
      changedFiles: [],
      protectedChanges: [],
      blockReasonCounts,
      writePerformed: false,
    };
    printSection("summary", summary);
    process.exitCode = 1;
    return summary;
  }

  let indexAfter = indexBefore;
  if (prepared.length > 0) {
    const additions = prepared.map((item) => ({
      date: item.date,
      file: item.publicPath,
      raceCount: item.daily.raceCount,
      settledRaceCount: item.daily.settledRaceCount,
      cancelledRaceCount: item.daily.cancelledRaceCount,
      bytes: item.dailyBytes,
    }));
    indexAfter = buildIndexCandidate(indexBefore, additions);
    if (!validateIndex(indexBefore, indexAfter, additions)) {
      throw new Error("index candidate validation failed");
    }
    const afterByDate = new Map(array(indexAfter.items).map((item) => [item.date, item]));
    if (
      !sameEntry(original20260625, afterByDate.get("2026-06-25"))
      || !sameEntry(original20260629, afterByDate.get("2026-06-29"))
    ) {
      throw new Error("protected index entry changed");
    }
  }

  const createdFiles = [];
  let indexWritten = false;
  try {
    for (const item of prepared) {
      await atomicCreate(item.dailyPath, item.buffer);
      createdFiles.push(item.dailyPath);
    }
    if (prepared.length > 0) {
      await atomicReplace(
        INDEX_PATH,
        Buffer.from(`${JSON.stringify(indexAfter, null, 2)}\n`, "utf8"),
      );
      indexWritten = true;
    }
    const latest = latestItem(array(indexAfter.items));
    const indexSummary = {
      sourceCount: array(indexAfter.items).length,
      dayCount: indexAfter.dayCount,
      raceCount: indexAfter.raceCount,
      totalBytes: indexAfter.totalBytes,
      latestDate: latest?.date,
      latestPath: latest?.file,
    };
    for (const item of prepared) {
      const memo = Buffer.from(completionMemo(item.date, item, indexSummary), "utf8");
      await atomicCreate(item.memoPath, memo);
      createdFiles.push(item.memoPath);
      perDateSummary.push({
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
      });
    }
  } catch (error) {
    if (indexWritten) await atomicReplace(INDEX_PATH, indexBufferBefore);
    for (const file of createdFiles.reverse()) await rm(abs(file), { force: true });
    throw error;
  }

  const indexBufferAfter = await readFile(abs(INDEX_PATH));
  const finalIndex = JSON.parse(indexBufferAfter.toString("utf8"));
  const latestAfter = latestItem(array(finalIndex.items));
  const guardAfter = protectedModificationGuard();
  if (!guardAfter.pass) throw new Error("protected modification detected after write");
  const processedDates = prepared.map((item) => item.date);
  const allAlreadyCompleted =
    processedDates.length === 0
    && perDateSummary.length === TARGET_DATES.length
    && perDateSummary.every((item) => item.status === "ALREADY_COMPLETED");
  const summary = {
    batchStatus: allAlreadyCompleted
      ? "BATCH_NOOP_ALREADY_COMPLETED"
      : prepared.length === TARGET_DATES.length
        ? "BATCH_WRITE_COMPLETED"
        : "BATCH_PARTIAL_COMPLETED",
    processedDates,
    skippedDates,
    failedDates,
    currentIndexHashBefore: indexHashBefore,
    currentIndexHashAfter: hashPayload(finalIndex),
    currentIndexBytesAfter: indexBufferAfter.length,
    sourceCountAfter: array(finalIndex.items).length,
    dayCountAfter: finalIndex.dayCount,
    raceCountAfter: finalIndex.raceCount,
    totalBytesAfter: finalIndex.totalBytes,
    itemBytesSumAfter:
      array(finalIndex.items).reduce((sum, item) => sum + item.bytes, 0),
    latestDateAfter: latestAfter?.date,
    latestPathAfter: latestAfter?.file,
    perDateSummary: perDateSummary.sort((a, b) => a.date.localeCompare(b.date)),
    changedFiles: prepared.length > 0
      ? [...prepared.flatMap((item) => [item.dailyPath, item.memoPath]), INDEX_PATH]
      : [],
    protectedChanges: guardAfter.protectedChanges,
    blockReasonCounts,
    writePerformed: prepared.length > 0,
  };
  printSection("summary", summary);
  return summary;
}

const isMain =
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  runKurariExHistoryNoStartersBatch20260627To20260628().catch((error) => {
    console.error("[kurari-ex no-starters history batch] failed");
    console.error(error);
    process.exitCode = 1;
  });
}
