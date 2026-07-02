import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  auditPredictionPageGptMaterialRegistrationNoEnrichment,
} from "./audit-prediction-page-gpt-material-registrationno-enrichment.mjs";

const ROOT = process.cwd();
const ALLOWED_CHANGED = new Set([
  "src/lib/predictionGptSourceContract.ts",
  "src/pages/PageImplementations.tsx",
  "docs/kurari-ex/prediction-page-gpt-material-registrationno-enrichment.md",
  "scripts/audit-prediction-page-gpt-material-registrationno-enrichment.mjs",
  "scripts/check-prediction-page-gpt-material-registrationno-enrichment.mjs",
]);
const REQUIRED_NEW = [
  "docs/kurari-ex/prediction-page-gpt-material-registrationno-enrichment.md",
  "scripts/audit-prediction-page-gpt-material-registrationno-enrichment.mjs",
  "scripts/check-prediction-page-gpt-material-registrationno-enrichment.mjs",
];

function abs(file) {
  return path.isAbsolute(file) ? file : path.resolve(ROOT, file);
}

function git(args) {
  return spawnSync("git", args, { encoding: "utf8" });
}

export async function checkPredictionPageGptMaterialRegistrationNoEnrichment({
  printOutput = true,
} = {}) {
  const failures = [];
  const warnings = [];
  for (const file of REQUIRED_NEW) {
    if (!existsSync(abs(file))) failures.push(`missing required file: ${file}`);
  }
  const audit =
    await auditPredictionPageGptMaterialRegistrationNoEnrichment({
      printOutput: false,
    });
  const summary =
    audit.predictionPageGptMaterialRegistrationNoEnrichmentSummary;
  if (
    summary.finalStatus
    !== "PREDICTION_PAGE_GPT_MATERIAL_REGISTRATIONNO_ENRICHMENT_AUDIT_COMPLETED"
  ) failures.push(`registrationNo enrichment audit failed: ${summary.finalStatus}`);
  if (
    !summary.explicitEntryRegistrationHasPriority
    || !summary.safeIdentityMatchOnly
    || summary.nameOnlyCompletionDetected
    || summary.fuzzyMatchingDetected
    || summary.generatedRegistrationNoDetected
    || !summary.ambiguousCandidatesBlocked
    || !summary.unavailableRemainsNull
    || summary.publicWritePerformed
  ) failures.push("registrationNo enrichment safety baseline changed");

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
      failures.push(`changed file is outside this enrichment task: ${file}`);
    }
    if (reviewChanges.length) {
      warnings.push(
        `pre-existing review changes retained: ${reviewChanges.length} file(s)`,
      );
    }
  }
  for (const protectedPath of [
    "public/data/analytics/kurari-ex/history",
    "public/data/races",
    "private-input",
    "package.json",
    ".github",
  ]) {
    const diff = git(["diff", "--quiet", "HEAD", "--", protectedPath]);
    if (diff.status !== 0) failures.push(`protected path changed: ${protectedPath}`);
  }

  const finalStatus = failures.length
    ? "PREDICTION_PAGE_GPT_MATERIAL_REGISTRATIONNO_ENRICHMENT_CHECK_FAIL"
    : warnings.length
      ? "PREDICTION_PAGE_GPT_MATERIAL_REGISTRATIONNO_ENRICHMENT_CHECK_PASS_WITH_WARNINGS"
      : "PREDICTION_PAGE_GPT_MATERIAL_REGISTRATIONNO_ENRICHMENT_CHECK_PASS";
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
if (isMain) await checkPredictionPageGptMaterialRegistrationNoEnrichment();
