import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  auditKurariExDailyWriterDryRunCandidateBuilder,
} from "./audit-kurari-ex-daily-writer-dry-run-candidate-builder.mjs";

const ROOT = process.cwd();
const INDEX_PATH = "public/data/analytics/kurari-ex/history/index.generated.json";
const EXPECTED_INDEX_HASH = "sha256:683fd01dea2e0e5f272d35eff42bde236ba326954e857feaa9dec04f77cb3acb";
const ALLOWED_NEW = new Set([
  "docs/kurari-ex/daily-writer-dry-run-candidate-builder.md",
  "docs/kurari-ex/daily-writer-dry-run-results-2026-06-29-2026-06-30.md",
  "scripts/audit-kurari-ex-daily-writer-dry-run-candidate-builder.mjs",
  "scripts/check-kurari-ex-daily-writer-dry-run-candidate-builder.mjs",
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

export async function checkKurariExDailyWriterDryRunCandidateBuilder({ printOutput = true } = {}) {
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

  const audit = await auditKurariExDailyWriterDryRunCandidateBuilder({
    argv: [],
    printOutput: false,
  });
  if (
    audit.dryRunCandidateSummary.finalStatus
    === "DAILY_WRITER_DRY_RUN_CANDIDATE_BUILDER_FAIL"
  ) failures.push("representative candidate builder failed");
  if (audit.dryRunCandidateSummary.writePerformed) failures.push("candidate builder performed a write");
  const expected = new Map([
    ["2026-06-29", { allowed: true, change: "NO_CHANGE", starters: 464, races: 64 }],
    ["2026-06-30", { allowed: true, change: "NO_STARTERS_TO_STARTERS_BACKFILL", starters: 551, races: 76 }],
    ["2026-07-01", { allowed: false, change: "BLOCKED", starters: 0, races: 0 }],
    ["2026-06-21", { allowed: false, change: "BLOCKED", starters: 0, races: 0 }],
  ]);
  for (const [date, expectedRecord] of expected) {
    const record = audit.dryRunCandidateRecord.find((item) => item.date === date);
    if (
      record?.candidateBuildAllowed !== expectedRecord.allowed
      || record?.candidateChangeType !== expectedRecord.change
      || record?.candidateStarterTotal !== expectedRecord.starters
      || record?.candidateRaceCount !== expectedRecord.races
    ) failures.push(`${date} candidate result mismatch`);
  }
  if (
    audit.dryRunCandidateSummary.duplicateCount
    || audit.dryRunCandidateSummary.fakeGeneratedCount
    || audit.dryRunCandidateSummary.prohibitedSourceUseCount
  ) failures.push("candidate safety violation detected");

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
      failures.push(`changed file is outside this candidate-builder task: ${file}`);
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
    ? "DAILY_WRITER_DRY_RUN_CANDIDATE_BUILDER_CHECK_FAIL"
    : warnings.length
      ? "DAILY_WRITER_DRY_RUN_CANDIDATE_BUILDER_CHECK_PASS_WITH_WARNINGS"
      : "DAILY_WRITER_DRY_RUN_CANDIDATE_BUILDER_CHECK_PASS";
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
if (isMain) await checkKurariExDailyWriterDryRunCandidateBuilder();
