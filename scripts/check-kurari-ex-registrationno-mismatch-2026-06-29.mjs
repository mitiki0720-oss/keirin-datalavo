import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  auditKurariExRegistrationNoMismatch20260629,
} from "./audit-kurari-ex-registrationno-mismatch-2026-06-29.mjs";

const ROOT = process.cwd();
const INDEX_PATH =
  "public/data/analytics/kurari-ex/history/index.generated.json";
const HISTORY_PATH =
  "public/data/analytics/kurari-ex/history/daily/2026-06/2026-06-29.generated.json";
const EXPECTED_INDEX_PAYLOAD_HASH =
  "sha256:683fd01dea2e0e5f272d35eff42bde236ba326954e857feaa9dec04f77cb3acb";
const EXPECTED_HISTORY_FILE_HASH =
  "sha256:c4665f94d38c90a01f1b38d3eb111a47ae90a98497b079ed4275248f72155cda";
const ALLOWED_NEW = new Set([
  "docs/kurari-ex/registrationno-mismatch-cause-audit-2026-06-29.md",
  "docs/kurari-ex/registrationno-mismatch-resolution-plan-2026-06-29.md",
  "scripts/audit-kurari-ex-registrationno-mismatch-2026-06-29.mjs",
  "scripts/check-kurari-ex-registrationno-mismatch-2026-06-29.mjs",
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

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function payloadHash(value) {
  return sha256(JSON.stringify(value));
}

function git(args) {
  return spawnSync("git", args, { encoding: "utf8" });
}

export async function checkKurariExRegistrationNoMismatch20260629({
  printOutput = true,
} = {}) {
  const failures = [];
  const warnings = [];
  for (const file of ALLOWED_NEW) {
    if (!existsSync(abs(file))) failures.push(`missing required file: ${file}`);
  }

  const indexBuffer = await readFile(abs(INDEX_PATH));
  const index = JSON.parse(indexBuffer.toString("utf8"));
  if (payloadHash(index) !== EXPECTED_INDEX_PAYLOAD_HASH) {
    failures.push(`index payload hash changed: ${payloadHash(index)}`);
  }
  if (indexBuffer.length !== 14079) {
    failures.push(`index bytes changed: ${indexBuffer.length}`);
  }
  if (
    index.items?.length !== 58
    || index.dayCount !== 58
    || index.raceCount !== 4373
    || index.items?.at(-1)?.date !== "2026-07-01"
  ) {
    failures.push("index source/day/race/latest baseline changed");
  }
  const historyBuffer = await readFile(abs(HISTORY_PATH));
  if (sha256(historyBuffer) !== EXPECTED_HISTORY_FILE_HASH) {
    failures.push(`2026-06-29 history hash changed: ${sha256(historyBuffer)}`);
  }
  if (historyBuffer.length !== 441362) {
    failures.push(`2026-06-29 history bytes changed: ${historyBuffer.length}`);
  }

  const audit = await auditKurariExRegistrationNoMismatch20260629({
    printOutput: false,
  });
  const summary = audit.registrationNoMismatchCauseAuditSummary;
  const records = audit.registrationNoMismatchCauseAuditRecords;
  if (
    summary.finalStatus
    !== "REGISTRATIONNO_MISMATCH_CAUSE_AUDIT_COMPLETED_WITH_WARNINGS"
  ) failures.push(`audit failed: ${summary.finalStatus}`);
  if (
    summary.totalHistoryStarters !== 464
    || summary.mismatchReported !== 59
    || summary.parserDelimiterCompareFalsePositive !== 49
    || summary.actualRawRegistrationNoWrong !== 10
    || records.length !== 10
  ) failures.push("audit classification baseline changed");
  if (
    summary.rowShiftSuspectedCount
    || summary.raceJoinShiftSuspectedCount
    || summary.sameNameAutoMergeCount
    || summary.sameNameCandidateInActualMismatchCount
  ) failures.push("identity join safety count is non-zero");
  if (
    summary.fakeGeneratedIdentityDetected
    || summary.fuzzyMatchingDetected
    || summary.generatedStarterDetected
    || summary.writePerformed
    || summary.publicDataChanged
  ) failures.push("prohibited generation, fuzzy matching, or write detected");
  if (
    !summary.keepExistingHistory
    || summary.refreshRequired
    || !summary.backfillBlockedUntilTrustGate
    || summary.canProceedTo20260630Backfill
  ) failures.push("history retention or backfill block decision changed");

  const status = git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  if (status.status !== 0) {
    failures.push(`git status failed: ${status.stderr.trim()}`);
  } else {
    const changed =
      status.stdout.split("\0").filter(Boolean).map((entry) => entry.slice(3));
    const reviewChanges = [];
    for (const file of changed) {
      if (ALLOWED_NEW.has(file)) continue;
      if (
        KNOWN_REVIEWS.some((known) =>
          file === known || (known.endsWith("/") && file.startsWith(known))
        )
      ) {
        reviewChanges.push(file);
        continue;
      }
      failures.push(`changed file is outside this recreation task: ${file}`);
    }
    if (reviewChanges.length) {
      warnings.push(
        `pre-existing review changes retained: ${reviewChanges.length} file(s)`,
      );
    }
    const protectedChanges = changed.filter((file) =>
      file.startsWith("src/")
      || file.startsWith("public/data/analytics/kurari-ex/history/")
      || file.startsWith("public/data/analytics/kurari-ex/source/")
      || file.startsWith("public/data/races/")
      || file.startsWith("private-input/")
      || file.startsWith("dog/reviews/")
      || file.startsWith("scripts/debug/")
      || file.startsWith(".github/")
      || file === "package.json"
    );
    for (const file of protectedChanges) {
      failures.push(`protected path changed: ${file}`);
    }
  }

  for (const protectedPath of [
    "src",
    "public/data/analytics/kurari-ex/history",
    "public/data/analytics/kurari-ex/source",
    "public/data/races",
    "private-input",
    "package.json",
    ".github",
  ]) {
    const diff = git(["diff", "--quiet", "HEAD", "--", protectedPath]);
    if (diff.status !== 0) {
      failures.push(`tracked protected path changed: ${protectedPath}`);
    }
  }

  const finalStatus = failures.length
    ? "REGISTRATIONNO_MISMATCH_CAUSE_CHECK_FAIL"
    : warnings.length
      ? "REGISTRATIONNO_MISMATCH_CAUSE_CHECK_PASS_WITH_WARNINGS"
      : "REGISTRATIONNO_MISMATCH_CAUSE_CHECK_PASS_WITH_WARNINGS";
  const result = { failures, warnings, finalStatus };
  if (printOutput) {
    console.log(JSON.stringify(result, null, 2));
    console.log(finalStatus);
    if (failures.length) process.exitCode = 1;
  }
  return result;
}

const isMain =
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) await checkKurariExRegistrationNoMismatch20260629();
