import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  auditKurariExParserDelimiterAndRegistrationNoTrustGate,
} from "./audit-kurari-ex-parser-delimiter-and-registrationno-trust-gate.mjs";

const ROOT = process.cwd();
const INDEX_PATH =
  "public/data/analytics/kurari-ex/history/index.generated.json";
const ALLOWED_CHANGED = new Set([
  "scripts/audit-kurari-ex-daily-ingestion-validation-gate.mjs",
  "scripts/audit-kurari-ex-daily-writer-preflight-bridge.mjs",
  "scripts/audit-kurari-ex-daily-writer-dry-run-candidate-builder.mjs",
  "scripts/audit-kurari-ex-registrationno-mismatch-2026-06-29.mjs",
  "docs/kurari-ex/parser-delimiter-and-registrationno-trust-gate.md",
  "docs/kurari-ex/raw-registrationno-known-bad-source-quarantine-2026-06-29.md",
  "docs/kurari-ex/post-trust-gate-backfill-readiness-2026-06-30.md",
  "scripts/audit-kurari-ex-parser-delimiter-and-registrationno-trust-gate.mjs",
  "scripts/check-kurari-ex-parser-delimiter-and-registrationno-trust-gate.mjs",
]);
const REQUIRED_NEW = [
  "docs/kurari-ex/parser-delimiter-and-registrationno-trust-gate.md",
  "docs/kurari-ex/raw-registrationno-known-bad-source-quarantine-2026-06-29.md",
  "docs/kurari-ex/post-trust-gate-backfill-readiness-2026-06-30.md",
  "scripts/audit-kurari-ex-parser-delimiter-and-registrationno-trust-gate.mjs",
  "scripts/check-kurari-ex-parser-delimiter-and-registrationno-trust-gate.mjs",
];
const HISTORY_BASELINES = new Map([
  [
    "public/data/analytics/kurari-ex/history/daily/2026-06/2026-06-29.generated.json",
    { bytes: 441362, hash: "sha256:c4665f94d38c90a01f1b38d3eb111a47ae90a98497b079ed4275248f72155cda" },
  ],
  [
    "public/data/analytics/kurari-ex/history/daily/2026-06/2026-06-30.generated.json",
    { bytes: 207708, hash: "sha256:cd2877c08bc14ca931d858c11fe0008c1c230642fa6b95482eb5d77456d1426c" },
  ],
]);

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

export async function checkKurariExParserDelimiterAndRegistrationNoTrustGate({
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
  ) failures.push(`index payload hash changed: ${payloadHash(index)}`);
  if (
    indexBuffer.length !== 14079
    || index.items?.length !== 58
    || index.dayCount !== 58
    || index.raceCount !== 4373
    || index.items?.at(-1)?.date !== "2026-07-01"
  ) failures.push("history index bytes/count/latest baseline changed");
  for (const [file, baseline] of HISTORY_BASELINES) {
    const buffer = await readFile(abs(file));
    if (buffer.length !== baseline.bytes || sha256(buffer) !== baseline.hash) {
      failures.push(`history daily baseline changed: ${file}`);
    }
  }

  const audit = await auditKurariExParserDelimiterAndRegistrationNoTrustGate({
    printOutput: false,
  });
  const summary = audit.parserTrustGateSummary;
  if (
    summary.finalStatus
    !== "PARSER_DELIMITER_AND_REGISTRATIONNO_TRUST_GATE_COMPLETED_WITH_WARNINGS"
  ) failures.push(`trust-gate audit failed: ${summary.finalStatus}`);
  if (
    !summary.delimiterFixApplied
    || summary.delimiterFalsePositiveResolvedCount !== 49
    || summary.knownBadRawRegistrationNoCount !== 10
    || summary.rawOnlyNeedsTrustConfirmationCount !== 945
    || summary.trustedAuthoritativeSnapshotMatchCount !== 454
    || summary.conflictWithAuthoritativeHistoryCount !== 0
    || summary.exactWriteAllowedAfterTrustGateCount !== 0
    || summary.exactWriteBlockedByTrustGateCount !== 4
    || summary.canProceedTo20260630Backfill
    || summary.writePerformed
  ) failures.push("trust-gate summary baseline changed");
  if (
    summary.fakeGeneratedIdentityDetected
    || summary.fuzzyMatchingDetected
    || summary.generatedStarterDetected
  ) failures.push("prohibited identity generation or fuzzy matching detected");

  const status = git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  if (status.status !== 0) {
    failures.push(`git status failed: ${status.stderr.trim()}`);
  } else {
    const changed =
      status.stdout.split("\0").filter(Boolean).map((entry) => entry.slice(3));
    const reviewChanges = [];
    for (const file of changed) {
      if (ALLOWED_CHANGED.has(file)) continue;
      if (file === "public/data/reviews/index.json" || file.startsWith("public/data/reviews/")) {
        reviewChanges.push(file);
        continue;
      }
      failures.push(`changed file is outside this trust-gate task: ${file}`);
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
    "dog/reviews",
    "scripts/debug",
    "package.json",
    ".github",
  ]) {
    const diff = git(["diff", "--quiet", "HEAD", "--", protectedPath]);
    if (diff.status !== 0) failures.push(`protected path changed: ${protectedPath}`);
  }

  const finalStatus = failures.length
    ? "PARSER_DELIMITER_AND_REGISTRATIONNO_TRUST_GATE_CHECK_FAIL"
    : warnings.length
      ? "PARSER_DELIMITER_AND_REGISTRATIONNO_TRUST_GATE_CHECK_PASS_WITH_WARNINGS"
      : "PARSER_DELIMITER_AND_REGISTRATIONNO_TRUST_GATE_CHECK_PASS";
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
if (isMain) await checkKurariExParserDelimiterAndRegistrationNoTrustGate();
