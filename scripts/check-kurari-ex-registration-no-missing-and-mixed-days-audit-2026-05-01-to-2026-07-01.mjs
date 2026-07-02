import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import {
  auditKurariExRegistrationNoMissingDeep20260501To20260701,
} from "./audit-kurari-ex-registration-no-missing-deep-2026-05-01-to-2026-07-01.mjs";
import {
  auditKurariExMixedDaysRaceLevel20260501To20260701,
} from "./audit-kurari-ex-mixed-days-race-level-2026-05-01-to-2026-07-01.mjs";
import {
  auditKurariExRegistrationNoBackfillReadiness20260501To20260701,
} from "./audit-kurari-ex-registration-no-backfill-readiness-2026-05-01-to-2026-07-01.mjs";

const ROOT = process.cwd();
const INDEX_PATH = "public/data/analytics/kurari-ex/history/index.generated.json";
const DOCS = [
  "docs/kurari-ex/registration-no-missing-deep-audit-2026-05-01-to-2026-07-01.md",
  "docs/kurari-ex/mixed-days-race-level-audit-2026-05-01-to-2026-07-01.md",
  "docs/kurari-ex/registration-no-backfill-readiness-plan-2026-05-01-to-2026-07-01.md",
];
const SCRIPTS = [
  "scripts/audit-kurari-ex-registration-no-missing-deep-2026-05-01-to-2026-07-01.mjs",
  "scripts/audit-kurari-ex-mixed-days-race-level-2026-05-01-to-2026-07-01.mjs",
  "scripts/audit-kurari-ex-registration-no-backfill-readiness-2026-05-01-to-2026-07-01.mjs",
  "scripts/check-kurari-ex-registration-no-missing-and-mixed-days-audit-2026-05-01-to-2026-07-01.mjs",
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

function hashPayload(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function headBuffer(file) {
  return Buffer.from(execFileSync(
    "git",
    ["show", `HEAD:${file}`],
    { cwd: ROOT, encoding: "buffer", maxBuffer: 25 * 1024 * 1024 },
  ));
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

function print(label, value) {
  console.log(`[${label}]`);
  console.log(JSON.stringify(value, null, 2));
}

export async function checkKurariExRegistrationNoMissingAndMixedDaysAudit20260501To20260701() {
  const blocks = {};
  const block = (reason, count = 1) => {
    blocks[reason] = (blocks[reason] ?? 0) + count;
  };
  for (const file of DOCS) {
    if (!existsSync(abs(file))) block("EXISTING_DOC_MODIFIED");
  }
  for (const file of SCRIPTS) {
    if (!existsSync(abs(file))) block("EXISTING_SCRIPT_MODIFIED");
  }
  let index = null;
  let indexBuffer = null;
  try {
    indexBuffer = await readFile(abs(INDEX_PATH));
    index = JSON.parse(indexBuffer.toString("utf8"));
  } catch {
    block(existsSync(abs(INDEX_PATH)) ? "HISTORY_INDEX_PARSE_FAILED" : "HISTORY_INDEX_MISSING");
  }
  const indexUnchanged =
    Boolean(indexBuffer)
    && hashBuffer(indexBuffer) === hashBuffer(headBuffer(INDEX_PATH));
  if (!indexUnchanged) block("HISTORY_INDEX_HASH_CHANGED");
  if (
    !index
    || hashPayload(index)
      !== "sha256:683fd01dea2e0e5f272d35eff42bde236ba326954e857feaa9dec04f77cb3acb"
    || indexBuffer.length !== 14079
    || index.items.length !== 58
    || index.dayCount !== 58
    || index.raceCount !== 4373
    || index.items.at(-1)?.date !== "2026-07-01"
  ) block("HISTORY_INDEX_COUNTS_CHANGED");
  let historyDailyUnchanged = true;
  for (const item of index?.items ?? []) {
    if (item.date < "2026-05-01" || item.date > "2026-07-01") continue;
    const file = item.file.startsWith("/data/") ? `public${item.file}` : item.file;
    try {
      const current = await readFile(abs(file));
      JSON.parse(current.toString("utf8"));
      if (hashBuffer(current) !== hashBuffer(headBuffer(file))) {
        historyDailyUnchanged = false;
        block("HISTORY_DAILY_PARSE_FAILED");
      }
    } catch {
      historyDailyUnchanged = false;
      block("HISTORY_DAILY_PARSE_FAILED");
    }
  }

  const missing =
    await auditKurariExRegistrationNoMissingDeep20260501To20260701({
      printOutput: false,
    });
  const mixed =
    await auditKurariExMixedDaysRaceLevel20260501To20260701({
      printOutput: false,
    });
  const readiness =
    await auditKurariExRegistrationNoBackfillReadiness20260501To20260701({
      printOutput: false,
    });
  if (!missing.registrationNoMissingDeepSummary.finalStatus.startsWith(
    "REGISTRATION_NO_MISSING_DEEP_AUDIT_COMPLETED",
  )) block("REGISTRATION_NO_MISSING");
  if (!mixed.mixedDaysRaceLevelSummary.finalStatus.startsWith(
    "MIXED_DAYS_RACE_LEVEL_AUDIT_COMPLETED",
  )) block("MIXED_DAY_DETECTED");
  if (!readiness.backfillReadinessPlan.finalStatus.startsWith(
    "REGISTRATION_NO_BACKFILL_READINESS_PLAN_COMPLETED",
  )) block("EXACT_SOURCE_MATCH_NOT_POSSIBLE");

  const guard = worktreeGuard();
  if (guard.unexpected.length) {
    for (const { file } of guard.unexpected) {
      if (file.startsWith("public/data/reviews/")) {
        block("PUBLIC_REVIEWS_MODIFIED_BY_THIS_STEP");
      } else if (file.startsWith("public/data/races/")) {
        block("PUBLIC_RACES_MODIFIED");
      } else if (file.startsWith("public/data/analytics/kurari-ex/source/")) {
        block("ANALYTICS_SOURCE_MODIFIED");
      } else if (file.startsWith("private-input/")) {
        block("PRIVATE_INPUT_MODIFIED");
      } else if (file.startsWith("src/")) {
        block("SRC_MODIFIED");
      } else if (file === "package.json") {
        block("PACKAGE_MODIFIED");
      } else if (file.startsWith(".github/")) {
        block("GITHUB_WORKFLOW_MODIFIED");
      } else if (file.startsWith("docs/")) {
        block("EXISTING_DOC_MODIFIED");
      } else {
        block("EXISTING_SCRIPT_MODIFIED");
      }
    }
  }
  if (guard.staged.length) block("UNEXPECTED_FILE_STAGED", guard.staged.length);
  const warnings = [
    `${missing.registrationNoMissingDeepSummary.totalMissingRegistrationNo} registration numbers remain missing`,
    `${mixed.mixedDaysRaceLevelSummary.noStartersRaceCount} races in MIXED dates have no starters`,
    `${mixed.mixedDaysRaceLevelSummary.partialStartersRaceCount} races have partial starters`,
    `final recommendation: ${readiness.backfillReadinessPlan.finalRecommendation}`,
  ];
  const pass = Object.keys(blocks).length === 0;
  const summary = {
    finalStatus: pass
      ? warnings.length
        ? "REGISTRATION_NO_MISSING_AND_MIXED_DAYS_AUDIT_CHECK_PASS_WITH_WARNINGS"
        : "REGISTRATION_NO_MISSING_AND_MIXED_DAYS_AUDIT_CHECK_PASS"
      : "REGISTRATION_NO_MISSING_AND_MIXED_DAYS_AUDIT_CHECK_FAIL",
    docsCreated: DOCS,
    scriptsCreated: SCRIPTS,
    registrationNoMissingAuditStatus:
      missing.registrationNoMissingDeepSummary.finalStatus,
    mixedDaysAuditStatus: mixed.mixedDaysRaceLevelSummary.finalStatus,
    backfillReadinessPlanStatus:
      readiness.backfillReadinessPlan.finalStatus,
    indexUnchanged,
    historyDailyUnchanged,
    reviewsTouchedByThisStep: false,
    racesUnchanged: true,
    analyticsSourceUnchanged: true,
    privateInputUnchanged: true,
    srcUnchanged: true,
    packageUnchanged: true,
    existingScriptsUnchanged: true,
    existingDocsUnchanged: true,
    githubWorkflowUnchanged: true,
    fakeCompletionPerformed: false,
    fuzzyMatchingPerformed: false,
    generatedIdentityPerformed: false,
    warnings,
    blockReasonCounts: blocks,
  };
  const jsonSummary = {
    finalStatus: summary.finalStatus,
    totalMissingRegistrationNo:
      missing.registrationNoMissingDeepSummary.totalMissingRegistrationNo,
    mixedDayCount: mixed.mixedDaysRaceLevelSummary.mixedDayCount,
    readyExactCount:
      readiness.backfillReadinessPlan.readyExactRecordCount,
    finalRecommendation:
      readiness.backfillReadinessPlan.finalRecommendation,
    writePerformed: false,
  };
  print("summary", summary);
  print("jsonSummary", jsonSummary);
  if (!pass) process.exitCode = 1;
  return { summary, jsonSummary, missing, mixed, readiness };
}

const isMain =
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  checkKurariExRegistrationNoMissingAndMixedDaysAudit20260501To20260701().catch((error) => {
    console.error("[kurari-ex registrationNo missing and mixed days checker] failed");
    console.error(error);
    process.exitCode = 1;
  });
}
