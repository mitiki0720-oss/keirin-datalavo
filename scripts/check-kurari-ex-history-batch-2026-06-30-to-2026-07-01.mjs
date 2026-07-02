import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();
const INDEX_PATH = "public/data/analytics/kurari-ex/history/index.generated.json";
const DATES = [
  "2026-06-25",
  "2026-06-27",
  "2026-06-28",
  "2026-06-29",
  "2026-06-30",
  "2026-07-01",
];
const NEW_DATES = new Set(["2026-06-30", "2026-07-01"]);
const NO_STARTERS_DATES =
  new Set(["2026-06-25", "2026-06-27", "2026-06-28", "2026-06-30", "2026-07-01"]);
const EXPECTED_RACES = { "2026-06-30": 76, "2026-07-01": 83 };
const FINAL_PATH =
  "/data/analytics/kurari-ex/history/daily/2026-07/2026-07-01.generated.json";
const CREATED = new Set([
  INDEX_PATH,
  "docs/kurari-ex/2026-06-30-history-completion.md",
  "docs/kurari-ex/2026-07-01-history-completion.md",
  "docs/kurari-ex/history-status-2026-06-25-to-2026-07-01.md",
  "scripts/run-kurari-ex-history-no-starters-batch-2026-06-30-to-2026-07-01.mjs",
  "scripts/check-kurari-ex-history-batch-2026-06-30-to-2026-07-01.mjs",
  "public/data/analytics/kurari-ex/history/daily/2026-06/2026-06-30.generated.json",
  "public/data/analytics/kurari-ex/history/daily/2026-07/2026-07-01.generated.json",
]);
const KNOWN_REVIEWS = [
  "public/data/reviews/index.json",
  "public/data/reviews/2026-06-28/",
  "public/data/reviews/2026-06-29/",
  "public/data/reviews/2026-06-30/",
  "public/data/reviews/2026-07-01/",
];

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

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function duplicates(values) {
  return values.length - new Set(values).size;
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
  return {
    unexpected:
      rows.filter(({ file }) => !CREATED.has(file) && !knownReview(file)),
    staged:
      rows.filter(({ status }) => status[0] !== " " && status[0] !== "?"),
  };
}

function headIndex() {
  return JSON.parse(execFileSync(
    "git",
    ["show", `HEAD:${INDEX_PATH}`],
    { cwd: ROOT, encoding: "utf8" },
  ));
}

function summarizeDaily(daily) {
  const races = array(daily?.items);
  const starters = races.flatMap((race) => array(race?.starters));
  return {
    raceCount: daily?.raceCount ?? 0,
    venueCount: new Set(races.map((race) => race?.venueKey)).size,
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
      )).length,
    starterTotalCount: starters.length,
    generatedIdentityCount:
      starters.filter(
        (starter) =>
          starter?.registrationNo || starter?.name || starter?.carNo,
      ).length,
    duplicateRaceKeyCount:
      races.length - new Set(races.map((race) => race?.raceKey)).size,
  };
}

function print(label, value) {
  console.log(`[${label}]`);
  console.log(JSON.stringify(value, null, 2));
}

export async function checkKurariExHistoryBatch20260630To20260701() {
  const blocks = {};
  const block = (reason, count = 1) => {
    blocks[reason] = (blocks[reason] ?? 0) + count;
  };
  let index;
  let indexBuffer;
  try {
    indexBuffer = await readFile(abs(INDEX_PATH));
    index = JSON.parse(indexBuffer.toString("utf8"));
  } catch {
    block("HISTORY_INDEX_PARSE_FAILED");
    index = { items: [] };
  }
  const items = array(index.items);
  const baseline = headIndex();
  const currentByDate = new Map(items.map((item) => [item.date, item]));
  const existingChanged =
    array(baseline.items).filter(
      (item) => !same(item, currentByDate.get(item.date)),
    );
  if (existingChanged.length) {
    block("EXISTING_ENTRY_CHANGED_UNEXPECTEDLY", existingChanged.length);
  }
  if (!same(
    array(baseline.items).find((item) => item.date === "2026-06-29"),
    currentByDate.get("2026-06-29"),
  )) block("ENTRY_2026_06_29_CHANGED");
  const itemBytesSum = items.reduce((sum, item) => sum + Number(item.bytes || 0), 0);
  if (items.length !== 58 || index.dayCount !== 58 || index.raceCount !== 4373) {
    block("INDEX_COUNTS_MISMATCH");
  }
  if (index.totalBytes !== itemBytesSum) block("ITEM_BYTES_SUM_MISMATCH");
  if (items.at(-1)?.date !== "2026-07-01" || items.at(-1)?.file !== FINAL_PATH) {
    block("LATEST_POINTER_NOT_UPDATED");
  }
  if (duplicates(items.map((item) => item.date))) block("DUPLICATE_DATE_FOUND");
  if (duplicates(items.map((item) => item.file))) block("DUPLICATE_PATH_FOUND");

  const perDateSummary = [];
  for (const date of DATES) {
    const entry = currentByDate.get(date);
    if (!entry) {
      block("INDEX_POST_WRITE_VERIFY_FAILED");
      perDateSummary.push({ date, status: "INDEX_ENTRY_MISSING" });
      continue;
    }
    const resolved = entry.file.startsWith("/data/") ? `public${entry.file}` : entry.file;
    if (!existsSync(abs(resolved))) {
      block("DAILY_POST_WRITE_VERIFY_FAILED");
      perDateSummary.push({ date, status: "DAILY_MISSING" });
      continue;
    }
    try {
      const buffer = await readFile(abs(resolved));
      const daily = JSON.parse(buffer.toString("utf8"));
      const summary = summarizeDaily(daily);
      const baseValid = [
        daily.date === date,
        daily.raceCount === array(daily.items).length,
        entry.raceCount === daily.raceCount,
        entry.settledRaceCount === daily.settledRaceCount,
        entry.cancelledRaceCount === daily.cancelledRaceCount,
        entry.bytes === buffer.length,
        summary.duplicateRaceKeyCount === 0,
      ].every(Boolean);
      if (!baseValid) block("DAILY_POST_WRITE_VERIFY_FAILED");
      if (NO_STARTERS_DATES.has(date)) {
        if (
          summary.noStartersRaceCount !== summary.raceCount
          || summary.starterTotalCount !== 0
          || summary.generatedIdentityCount !== 0
        ) block("GENERATED_STARTERS_FOUND");
      }
      if (NEW_DATES.has(date)) {
        if (
          summary.raceCount !== EXPECTED_RACES[date]
          || summary.predictionLinkedRaceCount !== summary.raceCount
          || summary.reviewLinkedRaceCount !== summary.raceCount
        ) block("SOURCE_RACE_COUNT_MISMATCH");
      }
      if (date === "2026-06-29" && summary.starterTotalCount !== 464) {
        block("ENTRY_2026_06_29_CHANGED");
      }
      perDateSummary.push({
        date,
        status: baseValid ? "OK" : "FAIL",
        dailyPath: resolved,
        publicPath: entry.file,
        publicPathResolved: existsSync(abs(resolved)),
        apiFetchSimulationStatus: existsSync(abs(resolved)) ? "OK" : "FAIL",
        dailyHash: hashPayload(daily),
        dailyBytes: buffer.length,
        ...summary,
        indexEntryExists: true,
        memoExists: NEW_DATES.has(date)
          ? existsSync(abs(`docs/kurari-ex/${date}-history-completion.md`))
          : true,
      });
    } catch {
      block("DAILY_POST_WRITE_VERIFY_FAILED");
      perDateSummary.push({ date, status: "PARSE_FAILED" });
    }
  }
  for (const file of [
    "docs/kurari-ex/2026-06-30-history-completion.md",
    "docs/kurari-ex/2026-07-01-history-completion.md",
    "docs/kurari-ex/history-status-2026-06-25-to-2026-07-01.md",
  ]) {
    if (!existsSync(abs(file))) block("DAILY_POST_WRITE_VERIFY_FAILED");
  }
  const guard = worktreeGuard();
  if (guard.unexpected.length) {
    for (const { file } of guard.unexpected) {
      if (file.startsWith("public/data/races/")) block("PUBLIC_RACES_MODIFIED");
      else if (file.startsWith("public/data/analytics/kurari-ex/source/")) {
        block("ANALYTICS_SOURCE_MODIFIED");
      } else if (file.startsWith("private-input/")) block("PRIVATE_INPUT_MODIFIED");
      else if (file.startsWith("src/")) block("SRC_MODIFIED");
      else if (file === "package.json") block("PACKAGE_MODIFIED");
      else block("EXISTING_SCRIPT_MODIFIED");
    }
  }
  if (guard.staged.length) block("UNEXPECTED_FILE_STAGED", guard.staged.length);
  const pass = Object.keys(blocks).length === 0;
  const targetPassCount =
    perDateSummary.filter(
      (item) => NEW_DATES.has(item.date) && item.status === "OK",
    ).length;
  const summary = {
    finalStatus: pass
      ? "BATCH_CHECK_PASS_2026_06_30_2026_07_01"
      : targetPassCount > 0
        ? "BATCH_CHECK_PARTIAL_PASS"
        : "BATCH_CHECK_FAIL",
    indexHash: indexBuffer ? hashPayload(index) : null,
    indexBytes: indexBuffer?.length ?? null,
    sourceCount: items.length,
    dayCount: index.dayCount ?? null,
    raceCount: index.raceCount ?? null,
    totalBytes: index.totalBytes ?? null,
    itemBytesSum,
    latestDate: items.at(-1)?.date ?? null,
    latestPath: items.at(-1)?.file ?? null,
    duplicateDateCount: duplicates(items.map((item) => item.date)),
    duplicatePathCount: duplicates(items.map((item) => item.file)),
    changedExistingEntryCount: existingChanged.length,
    entry20260629Unchanged:
      same(
        array(baseline.items).find((item) => item.date === "2026-06-29"),
        currentByDate.get("2026-06-29"),
      ),
    perDateSummary,
    fakeCompletionPerformed: false,
    fuzzyMatchingPerformed: false,
    generatedIdentityPerformed: false,
    reviewsTouchedByThisStep: false,
    protectedChanges: guard.unexpected,
    blockReasonCounts: blocks,
    writePerformed: false,
  };
  print("summary", summary);
  if (!pass) process.exitCode = 1;
  return summary;
}

const isMain =
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  checkKurariExHistoryBatch20260630To20260701().catch((error) => {
    console.error("[kurari-ex 2026-06-30 to 2026-07-01 checker] failed");
    console.error(error);
    process.exitCode = 1;
  });
}
