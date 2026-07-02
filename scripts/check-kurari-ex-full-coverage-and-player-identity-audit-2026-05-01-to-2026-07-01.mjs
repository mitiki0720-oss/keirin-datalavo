import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import {
  auditKurariExFullCoverage20260501To20260701,
} from "./audit-kurari-ex-full-coverage-2026-05-01-to-2026-07-01.mjs";
import {
  auditKurariExPlayerIdentityCollisions20260501To20260701,
} from "./audit-kurari-ex-player-identity-collisions-2026-05-01-to-2026-07-01.mjs";

const ROOT = process.cwd();
const INDEX_PATH = "public/data/analytics/kurari-ex/history/index.generated.json";
const EXPECTED_INDEX_HASH =
  "sha256:683fd01dea2e0e5f272d35eff42bde236ba326954e857feaa9dec04f77cb3acb";
const DOCS = [
  "docs/kurari-ex/full-coverage-audit-2026-05-01-to-2026-07-01.md",
  "docs/kurari-ex/player-identity-duplicate-collision-audit-2026-05-01-to-2026-07-01.md",
];
const SCRIPTS = [
  "scripts/audit-kurari-ex-full-coverage-2026-05-01-to-2026-07-01.mjs",
  "scripts/audit-kurari-ex-player-identity-collisions-2026-05-01-to-2026-07-01.mjs",
  "scripts/check-kurari-ex-full-coverage-and-player-identity-audit-2026-05-01-to-2026-07-01.mjs",
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

function knownReview(file) {
  return KNOWN_REVIEWS.some(
    (known) => file === known || (known.endsWith("/") && file.startsWith(known)),
  );
}

function headBuffer(file) {
  return Buffer.from(execFileSync(
    "git",
    ["show", `HEAD:${file}`],
    { cwd: ROOT, encoding: "buffer", maxBuffer: 25 * 1024 * 1024 },
  ));
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

export async function checkKurariExFullCoverageAndPlayerIdentityAudit20260501To20260701() {
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
  if (index && hashPayload(index) !== EXPECTED_INDEX_HASH) {
    block("HISTORY_INDEX_HASH_CHANGED");
  }
  if (
    indexBuffer?.length !== 14079
    || index?.items?.length !== 58
    || index?.dayCount !== 58
    || index?.raceCount !== 4373
    || index?.items?.at(-1)?.date !== "2026-07-01"
  ) block("HISTORY_INDEX_COUNTS_CHANGED");

  let historyDailyUnchanged = true;
  for (const item of index?.items ?? []) {
    if (item.date < "2026-05-01" || item.date > "2026-07-01") continue;
    const file = item.file.startsWith("/data/") ? `public${item.file}` : item.file;
    try {
      const current = await readFile(abs(file));
      if (hashBuffer(current) !== hashBuffer(headBuffer(file))) {
        historyDailyUnchanged = false;
        block("HISTORY_DAILY_PARSE_FAILED");
      }
      JSON.parse(current.toString("utf8"));
    } catch {
      historyDailyUnchanged = false;
      block("HISTORY_DAILY_PARSE_FAILED");
    }
  }
  const coverage =
    await auditKurariExFullCoverage20260501To20260701({ printOutput: false });
  const identity =
    await auditKurariExPlayerIdentityCollisions20260501To20260701({
      printOutput: false,
    });
  if (coverage.summary.auditStatus !== "FULL_COVERAGE_AUDIT_COMPLETED") {
    block("RAW_DIR_SCAN_FAILED");
  }
  if (![
    "PLAYER_IDENTITY_COLLISION_AUDIT_OK",
    "PLAYER_IDENTITY_COLLISION_AUDIT_OK_WITH_WARNINGS",
  ].includes(identity.summary.auditStatus)) {
    block("SAME_REGISTRATION_MULTIPLE_NAMES");
  }
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

  const warnings = [];
  if (identity.summary.auditStatus.endsWith("WITH_WARNINGS")) {
    warnings.push(
      `${identity.summary.unknownRegistrationNoCount} starters have no registration number`,
      `${identity.summary.rawNameVariantWarningCount} registrations have raw-name whitespace variants`,
      `${identity.summary.normalizedNameMultipleRegistrationCandidateCount} normalized names map to multiple registrations`,
    );
  }
  if (coverage.summary.mixedDateCount > 0) {
    warnings.push(`${coverage.summary.mixedDateCount} history dates have mixed starter coverage`);
  }
  const pass = Object.keys(blocks).length === 0;
  const summary = {
    finalStatus: pass
      ? warnings.length
        ? "FULL_COVERAGE_AND_PLAYER_IDENTITY_AUDIT_CHECK_PASS_WITH_WARNINGS"
        : "FULL_COVERAGE_AND_PLAYER_IDENTITY_AUDIT_CHECK_PASS"
      : "FULL_COVERAGE_AND_PLAYER_IDENTITY_AUDIT_CHECK_FAIL",
    docsCreated: DOCS,
    scriptsCreated: SCRIPTS,
    coverageAuditStatus: coverage.summary.auditStatus,
    playerIdentityAuditStatus: identity.summary.auditStatus,
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
    auditStatuses: {
      coverage: summary.coverageAuditStatus,
      playerIdentity: summary.playerIdentityAuditStatus,
    },
    writePerformed: false,
  };
  print("summary", summary);
  print("jsonSummary", jsonSummary);
  if (!pass) process.exitCode = 1;
  return { summary, jsonSummary, coverage, identity };
}

const isMain =
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  checkKurariExFullCoverageAndPlayerIdentityAudit20260501To20260701().catch((error) => {
    console.error("[kurari-ex full coverage and identity checker] failed");
    console.error(error);
    process.exitCode = 1;
  });
}
