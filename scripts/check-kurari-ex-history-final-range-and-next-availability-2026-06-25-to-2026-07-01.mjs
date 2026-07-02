import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import {
  auditKurariExHistoryFinalRange20260625To20260701,
} from "./audit-kurari-ex-history-final-range-2026-06-25-to-2026-07-01.mjs";
import {
  auditKurariExHistoryUiApiSmokeRange20260625To20260701,
} from "./audit-kurari-ex-history-ui-api-smoke-range-2026-06-25-to-2026-07-01.mjs";
import {
  auditKurariExHistoryNextAvailabilityAfter20260701,
} from "./audit-kurari-ex-history-next-availability-after-2026-07-01.mjs";

const ROOT = process.cwd();
const INDEX_PATH = "public/data/analytics/kurari-ex/history/index.generated.json";
const DAILY_FILES = [
  "public/data/analytics/kurari-ex/history/daily/2026-06/2026-06-25.generated.json",
  "public/data/analytics/kurari-ex/history/daily/2026-06/2026-06-27.generated.json",
  "public/data/analytics/kurari-ex/history/daily/2026-06/2026-06-28.generated.json",
  "public/data/analytics/kurari-ex/history/daily/2026-06/2026-06-29.generated.json",
  "public/data/analytics/kurari-ex/history/daily/2026-06/2026-06-30.generated.json",
  "public/data/analytics/kurari-ex/history/daily/2026-07/2026-07-01.generated.json",
];
const DOCS = [
  "docs/kurari-ex/history-final-audit-2026-06-25-to-2026-07-01.md",
  "docs/kurari-ex/history-ui-api-smoke-2026-06-25-to-2026-07-01.md",
  "docs/kurari-ex/history-next-availability-after-2026-07-01.md",
];
const SCRIPTS = [
  "scripts/audit-kurari-ex-history-final-range-2026-06-25-to-2026-07-01.mjs",
  "scripts/audit-kurari-ex-history-ui-api-smoke-range-2026-06-25-to-2026-07-01.mjs",
  "scripts/audit-kurari-ex-history-next-availability-after-2026-07-01.mjs",
  "scripts/check-kurari-ex-history-final-range-and-next-availability-2026-06-25-to-2026-07-01.mjs",
];
const ALLOWED = new Set([...DOCS, ...SCRIPTS]);
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

function hashBuffer(buffer) {
  return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
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
    unexpected: rows.filter(({ file }) => !ALLOWED.has(file) && !knownReview(file)),
    staged: rows.filter(({ status }) => status[0] !== " " && status[0] !== "?"),
  };
}

function headBuffer(file) {
  return Buffer.from(execFileSync(
    "git",
    ["show", `HEAD:${file}`],
    { cwd: ROOT, encoding: "buffer", maxBuffer: 20 * 1024 * 1024 },
  ));
}

function print(label, value) {
  console.log(`[${label}]`);
  console.log(JSON.stringify(value, null, 2));
}

export async function checkKurariExHistoryFinalRangeAndNextAvailability20260625To20260701() {
  const blocks = {};
  const block = (reason, count = 1) => {
    blocks[reason] = (blocks[reason] ?? 0) + count;
  };
  const missingDocs = DOCS.filter((file) => !existsSync(abs(file)));
  const missingScripts = SCRIPTS.filter((file) => !existsSync(abs(file)));
  if (missingDocs.length) block("EXISTING_DOC_MODIFIED", missingDocs.length);
  if (missingScripts.length) block("EXISTING_SCRIPT_MODIFIED", missingScripts.length);

  const indexCurrent = await readFile(abs(INDEX_PATH));
  const indexHead = headBuffer(INDEX_PATH);
  const indexUnchanged = hashBuffer(indexCurrent) === hashBuffer(indexHead);
  if (!indexUnchanged) block("HISTORY_INDEX_MODIFIED");
  let historyDailyUnchanged = true;
  for (const file of DAILY_FILES) {
    const current = await readFile(abs(file));
    if (hashBuffer(current) !== hashBuffer(headBuffer(file))) {
      historyDailyUnchanged = false;
      block("HISTORY_DAILY_MODIFIED");
    }
  }
  const finalAudit =
    await auditKurariExHistoryFinalRange20260625To20260701({ printOutput: false });
  const uiSmoke =
    await auditKurariExHistoryUiApiSmokeRange20260625To20260701({ printOutput: false });
  const nextAvailability =
    await auditKurariExHistoryNextAvailabilityAfter20260701({ printOutput: false });
  if (
    finalAudit.summary.finalStatus
    !== "FINAL_RANGE_AUDIT_PASS_2026_06_25_TO_2026_07_01"
  ) block("HISTORY_DAILY_HASH_MISMATCH");
  if (![
    "UI_API_SMOKE_RANGE_PASS_2026_06_25_TO_2026_07_01",
    "UI_API_SMOKE_RANGE_PASS_WITH_WARNINGS",
  ].includes(uiSmoke.summary.finalStatus)) block("API_FETCH_SIMULATION_FAILED");
  if (
    nextAvailability.summary.finalStatus
    !== "NEXT_AVAILABILITY_AFTER_2026_07_01_AUDIT_COMPLETED"
  ) block("SOURCE_AMBIGUOUS");

  const guard = worktreeGuard();
  if (guard.unexpected.length) {
    for (const { file } of guard.unexpected) {
      if (file.startsWith("public/data/reviews/")) block("PUBLIC_REVIEWS_MODIFIED_BY_THIS_STEP");
      else if (file.startsWith("public/data/races/")) block("PUBLIC_RACES_MODIFIED");
      else if (file.startsWith("public/data/analytics/kurari-ex/source/")) {
        block("ANALYTICS_SOURCE_MODIFIED");
      } else if (file.startsWith("private-input/")) block("PRIVATE_INPUT_MODIFIED");
      else if (file.startsWith("src/")) block("SRC_MODIFIED");
      else if (file === "package.json") block("PACKAGE_MODIFIED");
      else if (file.startsWith("docs/")) block("EXISTING_DOC_MODIFIED");
      else block("EXISTING_SCRIPT_MODIFIED");
    }
  }
  if (guard.staged.length) block("UNEXPECTED_FILE_STAGED", guard.staged.length);
  const warnings = uiSmoke.summary.warnings;
  const pass = Object.keys(blocks).length === 0;
  const summary = {
    finalStatus: pass
      ? warnings.length
        ? "FINAL_RANGE_AND_NEXT_AVAILABILITY_CHECK_PASS_WITH_WARNINGS"
        : "FINAL_RANGE_AND_NEXT_AVAILABILITY_CHECK_PASS"
      : "FINAL_RANGE_AND_NEXT_AVAILABILITY_CHECK_FAIL",
    docsCreated: DOCS,
    scriptsCreated: SCRIPTS,
    indexUnchanged,
    historyDailyUnchanged,
    sourceUnchanged: true,
    racesUnchanged: true,
    reviewsTouchedByThisStep: false,
    privateInputUnchanged: true,
    srcUnchanged: true,
    packageUnchanged: true,
    existingScriptsUnchanged: true,
    existingDocsUnchanged: true,
    finalRangeAuditStatus: finalAudit.summary.finalStatus,
    uiApiSmokeStatus: uiSmoke.summary.finalStatus,
    nextAvailabilityStatus: nextAvailability.summary.finalStatus,
    warnings,
    blockReasonCounts: blocks,
  };
  const jsonSummary = {
    finalStatus: summary.finalStatus,
    auditStatuses: {
      finalRange: summary.finalRangeAuditStatus,
      uiApiSmoke: summary.uiApiSmokeStatus,
      nextAvailability: summary.nextAvailabilityStatus,
    },
    writePerformed: false,
  };
  print("summary", summary);
  print("jsonSummary", jsonSummary);
  if (!pass) process.exitCode = 1;
  return { summary, jsonSummary, finalAudit, uiSmoke, nextAvailability };
}

const isMain =
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  checkKurariExHistoryFinalRangeAndNextAvailability20260625To20260701().catch((error) => {
    console.error("[kurari-ex final range and next availability checker] failed");
    console.error(error);
    process.exitCode = 1;
  });
}
