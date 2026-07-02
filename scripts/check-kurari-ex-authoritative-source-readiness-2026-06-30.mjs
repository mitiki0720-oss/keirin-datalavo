import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  auditKurariExAuthoritativeSourceReadiness20260630,
} from "./audit-kurari-ex-authoritative-source-readiness-2026-06-30.mjs";

const ROOT = process.cwd();
const REQUIRED_NEW = new Set([
  "docs/kurari-ex/authoritative-source-readiness-audit-2026-06-30.md",
  "docs/kurari-ex/authoritative-source-readiness-plan-2026-06-30.md",
  "scripts/audit-kurari-ex-authoritative-source-readiness-2026-06-30.mjs",
  "scripts/check-kurari-ex-authoritative-source-readiness-2026-06-30.mjs",
]);
const INDEX_PATH =
  "public/data/analytics/kurari-ex/history/index.generated.json";
const HISTORY_PATH =
  "public/data/analytics/kurari-ex/history/daily/2026-06/2026-06-30.generated.json";

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

export async function checkKurariExAuthoritativeSourceReadiness20260630({
  printOutput = true,
} = {}) {
  const failures = [];
  const warnings = [];
  for (const file of REQUIRED_NEW) {
    if (!existsSync(abs(file))) failures.push(`missing required file: ${file}`);
  }
  const indexBuffer = await readFile(abs(INDEX_PATH));
  const index = JSON.parse(indexBuffer.toString("utf8"));
  if (
    payloadHash(index)
      !== "sha256:683fd01dea2e0e5f272d35eff42bde236ba326954e857feaa9dec04f77cb3acb"
    || indexBuffer.length !== 14079
    || index.items?.length !== 58
    || index.dayCount !== 58
    || index.raceCount !== 4373
    || index.items?.at(-1)?.date !== "2026-07-01"
  ) failures.push("history index baseline changed");
  const historyBuffer = await readFile(abs(HISTORY_PATH));
  if (
    sha256(historyBuffer)
      !== "sha256:cd2877c08bc14ca931d858c11fe0008c1c230642fa6b95482eb5d77456d1426c"
    || historyBuffer.length !== 207708
  ) failures.push("2026-06-30 history daily baseline changed");

  const audit = await auditKurariExAuthoritativeSourceReadiness20260630({
    printOutput: false,
  });
  const summary = audit.authoritativeSourceReadinessSummary;
  if (
    summary.finalStatus
      !== "AUTHORITATIVE_SOURCE_READINESS_AUDIT_COMPLETED_WITH_WARNINGS"
  ) failures.push(`readiness audit failed: ${summary.finalStatus}`);
  if (
    summary.expectedRaceCount !== 76
    || summary.expectedStarterCount !== 551
    || summary.rawStarterRows !== 551
    || summary.trustedRows !== 0
    || summary.rawOnlyRows !== 551
    || summary.untrustedRows !== 551
    || summary.authoritativeSnapshotExists
    || summary.authoritativeSnapshotHashMatched
    || summary.provenanceHashMatched
    || summary.duplicateCount
    || summary.knownBadCount
    || summary.conflictCount
    || summary.manualReviewCount
    || summary.canProceedToBackfillDryRun
    || summary.canProceedToBackfillWrite
    || summary.writePerformed
    || summary.conclusion
      !== "BLOCKED_RAW_ONLY_NEEDS_TRUST_CONFIRMATION"
  ) failures.push("authoritative readiness baseline changed");

  const status = git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  if (status.status !== 0) {
    failures.push(`git status failed: ${status.stderr.trim()}`);
  } else {
    const changed =
      status.stdout.split("\0").filter(Boolean).map((entry) => entry.slice(3));
    const reviewChanges = [];
    for (const file of changed) {
      if (REQUIRED_NEW.has(file)) continue;
      if (file === "public/data/reviews/index.json" || file.startsWith("public/data/reviews/")) {
        reviewChanges.push(file);
        continue;
      }
      failures.push(`changed file is outside this readiness audit: ${file}`);
    }
    if (reviewChanges.length) {
      warnings.push(
        `pre-existing review changes retained: ${reviewChanges.length} file(s)`,
      );
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
    "dog/reviews",
    "scripts/debug",
  ]) {
    const diff = git(["diff", "--quiet", "HEAD", "--", protectedPath]);
    if (diff.status !== 0) failures.push(`protected path changed: ${protectedPath}`);
  }

  const finalStatus = failures.length
    ? "AUTHORITATIVE_SOURCE_READINESS_CHECK_FAIL"
    : warnings.length
      ? "AUTHORITATIVE_SOURCE_READINESS_CHECK_PASS_WITH_WARNINGS"
      : "AUTHORITATIVE_SOURCE_READINESS_CHECK_PASS";
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
if (isMain) await checkKurariExAuthoritativeSourceReadiness20260630();
