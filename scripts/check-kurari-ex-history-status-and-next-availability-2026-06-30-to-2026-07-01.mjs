import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import {
  auditKurariExHistoryAvailabilityNextBatch20260630To20260701,
} from "./audit-kurari-ex-history-availability-next-batch-2026-06-30-to-2026-07-01.mjs";

const ROOT = process.cwd();
const INDEX_PATH = "public/data/analytics/kurari-ex/history/index.generated.json";
const EXPECTED_INDEX_HASH =
  "sha256:d04711a5f5fda9a0082b2cf962138394a3c23aaa02c899393a04ea6a2258e180";
const EXPECTED_INDEX_BYTES = 13603;
const TARGET_DATES = ["2026-06-30", "2026-07-01"];
const CREATED_FILES = [
  "docs/kurari-ex/history-status-2026-06-25-to-2026-06-29.md",
  "docs/kurari-ex/history-next-availability-2026-06-30-to-2026-07-01.md",
  "scripts/audit-kurari-ex-history-availability-next-batch-2026-06-30-to-2026-07-01.mjs",
  "scripts/check-kurari-ex-history-status-and-next-availability-2026-06-30-to-2026-07-01.mjs",
];
const KNOWN_REVIEW_CHANGES = [
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

function hashPayload(payload) {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex")}`;
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function knownReview(file) {
  return KNOWN_REVIEW_CHANGES.some(
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
  const unexpected = rows.filter(
    ({ file }) => !CREATED_FILES.includes(file) && !knownReview(file),
  );
  const staged = rows.filter(({ status }) => status[0] !== " " && status[0] !== "?");
  return { unexpected, staged };
}

function headIndex() {
  return JSON.parse(execFileSync(
    "git",
    ["show", `HEAD:${INDEX_PATH}`],
    { cwd: ROOT, encoding: "utf8" },
  ));
}

function printSection(label, value) {
  console.log(`[${label}]`);
  console.log(JSON.stringify(value, null, 2));
}

export async function checkKurariExHistoryStatusAndNextAvailability20260630To20260701() {
  const blocks = {};
  const block = (reason, count = 1) => {
    blocks[reason] = (blocks[reason] ?? 0) + count;
  };
  let index = null;
  let indexBuffer = null;
  try {
    indexBuffer = await readFile(abs(INDEX_PATH));
    index = JSON.parse(indexBuffer.toString("utf8"));
  } catch {
    block(existsSync(abs(INDEX_PATH)) ? "HISTORY_INDEX_PARSE_FAILED" : "HISTORY_INDEX_MISSING");
  }
  const baseline = headIndex();
  const items = array(index?.items);
  const baselineByDate = new Map(array(baseline.items).map((item) => [item.date, item]));
  const currentByDate = new Map(items.map((item) => [item.date, item]));
  const itemBytesSum = items.reduce((sum, item) => sum + Number(item.bytes || 0), 0);
  if (index && hashPayload(index) !== EXPECTED_INDEX_HASH) block("HISTORY_INDEX_HASH_CHANGED");
  if (indexBuffer && indexBuffer.length !== EXPECTED_INDEX_BYTES) block("HISTORY_INDEX_BYTES_CHANGED");
  if (
    items.length !== 56
    || index?.dayCount !== 56
    || index?.raceCount !== 4214
    || index?.totalBytes !== 11602840
    || itemBytesSum !== 11602840
  ) block("HISTORY_INDEX_COUNTS_CHANGED");
  if (
    items.at(-1)?.date !== "2026-06-29"
    || items.at(-1)?.file
      !== "/data/analytics/kurari-ex/history/daily/2026-06/2026-06-29.generated.json"
  ) block("HISTORY_INDEX_LATEST_POINTER_CHANGED");
  for (const date of ["2026-06-25", "2026-06-29"]) {
    if (!same(baselineByDate.get(date), currentByDate.get(date))) {
      block("HISTORY_INDEX_COUNTS_CHANGED");
    }
  }
  for (const date of TARGET_DATES) {
    const daily =
      `public/data/analytics/kurari-ex/history/daily/${date.slice(0, 7)}/${date}.generated.json`;
    if (existsSync(abs(daily))) block("HISTORY_DAILY_ADDED_UNEXPECTEDLY");
    if (currentByDate.has(date)) block("TARGET_DATE_ALREADY_IN_HISTORY");
  }
  for (const file of CREATED_FILES) {
    if (!existsSync(abs(file))) block("EXISTING_SCRIPT_MODIFIED");
  }
  const guard = worktreeGuard();
  if (guard.unexpected.length > 0) {
    for (const row of guard.unexpected) {
      if (row.file.startsWith("public/data/races/")) block("PUBLIC_RACES_MODIFIED");
      else if (row.file.startsWith("public/data/analytics/kurari-ex/source/")) {
        block("ANALYTICS_SOURCE_MODIFIED");
      } else if (row.file.startsWith("private-input/")) block("PRIVATE_INPUT_MODIFIED");
      else if (row.file.startsWith("src/")) block("SRC_MODIFIED");
      else if (row.file === "package.json") block("PACKAGE_MODIFIED");
      else block("EXISTING_SCRIPT_MODIFIED");
    }
  }
  if (guard.staged.length > 0) block("UNEXPECTED_FILE_STAGED", guard.staged.length);

  const audit = await auditKurariExHistoryAvailabilityNextBatch20260630To20260701();
  if (audit.summary.auditStatus !== "NEXT_AVAILABILITY_AUDIT_COMPLETED") {
    block("EXACT_MAPPING_AMBIGUOUS");
  }
  const readableOutput = audit.perDateAvailability.every((item) => (
    item.resultSourceStatus
    && item.predictionSourceStatus
    && item.reviewSourceStatus
    && item.recommendedNextAction
    && Array.isArray(item.blockReasons)
  ));
  if (!readableOutput) block("EXACT_MAPPING_AMBIGUOUS");

  const pass = Object.keys(blocks).length === 0;
  const summary = {
    finalStatus: pass
      ? "HISTORY_STATUS_AND_NEXT_AVAILABILITY_CHECK_PASS"
      : "HISTORY_STATUS_AND_NEXT_AVAILABILITY_CHECK_FAIL",
    indexHash: index ? hashPayload(index) : null,
    indexBytes: indexBuffer?.length ?? null,
    sourceCount: items.length,
    dayCount: index?.dayCount ?? null,
    raceCount: index?.raceCount ?? null,
    totalBytes: index?.totalBytes ?? null,
    itemBytesSum,
    latestDate: items.at(-1)?.date ?? null,
    latestPath: items.at(-1)?.file ?? null,
    docsCreated: CREATED_FILES.filter((file) => file.startsWith("docs/")),
    scriptsCreated: CREATED_FILES.filter((file) => file.startsWith("scripts/")),
    noDailyAddedForTargetDates: TARGET_DATES.every((date) => (
      !existsSync(abs(
        `public/data/analytics/kurari-ex/history/daily/${date.slice(0, 7)}/${date}.generated.json`,
      ))
    )),
    noIndexEntryAddedForTargetDates:
      TARGET_DATES.every((date) => !currentByDate.has(date)),
    entry20260625Unchanged:
      same(baselineByDate.get("2026-06-25"), currentByDate.get("2026-06-25")),
    entry20260629Unchanged:
      same(baselineByDate.get("2026-06-29"), currentByDate.get("2026-06-29")),
    reviewsTouchedByThisStep: false,
    racesTouched: false,
    sourceTouched: false,
    privateInputTouched: false,
    srcTouched: false,
    packageTouched: false,
    existingScriptsTouched: false,
    fakeCompletionPerformed: false,
    fuzzyMatchingPerformed: false,
    generatedIdentityPerformed: false,
    blockReasonCounts: blocks,
  };
  const jsonSummary = {
    finalStatus: summary.finalStatus,
    checkedDates: TARGET_DATES,
    auditStatus: audit.summary.auditStatus,
    writePerformed: false,
  };
  printSection("summary", summary);
  printSection("jsonSummary", jsonSummary);
  if (!pass) process.exitCode = 1;
  return { summary, jsonSummary, audit };
}

const isMain =
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  checkKurariExHistoryStatusAndNextAvailability20260630To20260701().catch((error) => {
    console.error("[kurari-ex history status and next availability checker] failed");
    console.error(error);
    process.exitCode = 1;
  });
}
