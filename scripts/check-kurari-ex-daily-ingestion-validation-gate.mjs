import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  auditKurariExDailyIngestionValidationGate,
} from "./audit-kurari-ex-daily-ingestion-validation-gate.mjs";

const ROOT = process.cwd();
const INDEX_PATH = "public/data/analytics/kurari-ex/history/index.generated.json";
const EXPECTED_INDEX_HASH = "sha256:683fd01dea2e0e5f272d35eff42bde236ba326954e857feaa9dec04f77cb3acb";
const ALLOWED_NEW = new Set([
  "docs/kurari-ex/daily-ingestion-validation-gate.md",
  "docs/kurari-ex/daily-ingestion-validation-runbook.md",
  "scripts/audit-kurari-ex-daily-ingestion-validation-gate.mjs",
  "scripts/check-kurari-ex-daily-ingestion-validation-gate.mjs",
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

function hashPayload(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function git(args) {
  return spawnSync("git", args, { encoding: "utf8" });
}

export async function checkKurariExDailyIngestionValidationGate({ printOutput = true } = {}) {
  const failures = [];
  const warnings = [];
  for (const file of ALLOWED_NEW) {
    if (!existsSync(abs(file))) failures.push(`missing required file: ${file}`);
  }

  const indexBuffer = await readFile(abs(INDEX_PATH));
  const index = JSON.parse(indexBuffer.toString("utf8"));
  if (hashPayload(index) !== EXPECTED_INDEX_HASH) failures.push(`index payload hash changed: ${hashPayload(index)}`);
  if (indexBuffer.length !== 14079) failures.push(`index bytes changed: ${indexBuffer.length}`);
  if (index.items?.length !== 58 || index.dayCount !== 58 || index.raceCount !== 4373) {
    failures.push("index source/day/race baseline changed");
  }
  const latest = index.items?.find((item) => item.date === "2026-07-01");
  if (latest?.file !== "/data/analytics/kurari-ex/history/daily/2026-07/2026-07-01.generated.json") {
    failures.push(`latest index path changed: ${latest?.file ?? "missing"}`);
  }

  const audit = await auditKurariExDailyIngestionValidationGate({
    argv: [],
    printOutput: false,
  });
  if (audit.dailyIngestionValidationSummary.finalStatus === "DAILY_INGESTION_VALIDATION_GATE_FAIL") {
    failures.push("representative daily ingestion validation failed");
  }
  if (
    audit.dailyIngestionValidationSummary.stopDuplicateIdentityCount
    || audit.dailyIngestionValidationSummary.stopFakeGeneratedIdentityCount
    || audit.dailyIngestionValidationSummary.stopProhibitedSourceUseCount
    || audit.dailyIngestionValidationSummary.stopContractViolationCount
  ) failures.push("representative validation detected a hard-stop safety violation");
  if (audit.dailyIngestionValidationSummary.writePerformed) failures.push("validation gate performed a write");

  const srcDiff = git(["diff", "--quiet", "HEAD", "--", "src"]);
  if (srcDiff.status !== 0) failures.push("src/UI/design changed from HEAD");

  const status = git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  if (status.status !== 0) {
    failures.push(`git status failed: ${status.stderr.trim()}`);
  } else {
    const changed = status.stdout.split("\0").filter(Boolean).map((entry) => entry.slice(3));
    const reviewChanges = [];
    for (const file of changed) {
      if (ALLOWED_NEW.has(file)) continue;
      if (KNOWN_REVIEWS.some((known) => file === known || (known.endsWith("/") && file.startsWith(known)))) {
        reviewChanges.push(file);
        continue;
      }
      failures.push(`changed file is outside this validation task: ${file}`);
    }
    if (reviewChanges.length) warnings.push(`pre-existing review changes retained: ${reviewChanges.length} file(s)`);
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
    for (const file of protectedChanges) failures.push(`protected path changed: ${file}`);
  }

  const finalStatus = failures.length
    ? "DAILY_INGESTION_VALIDATION_GATE_CHECK_FAIL"
    : warnings.length
      ? "DAILY_INGESTION_VALIDATION_GATE_CHECK_PASS_WITH_WARNINGS"
      : "DAILY_INGESTION_VALIDATION_GATE_CHECK_PASS";
  const result = { failures, warnings, finalStatus };
  if (printOutput) {
    console.log(JSON.stringify(result, null, 2));
    console.log(finalStatus);
  }
  if (failures.length && printOutput) process.exitCode = 1;
  return result;
}

const isMain =
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) await checkKurariExDailyIngestionValidationGate();
