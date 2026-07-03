import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  auditPredictionPageGptMaterialRegistrationNoMaterialEnrichment,
} from "./audit-prediction-page-gpt-material-registrationno-material-enrichment.mjs";

const ROOT = process.cwd();
const ALLOWED_CHANGED = new Set([
  "src/lib/predictionGptSourceContract.ts",
  "src/pages/PageImplementations.tsx",
  "docs/kurari-ex/prediction-page-gpt-material-registrationno-material-enrichment.md",
  "scripts/audit-prediction-page-gpt-material-registrationno-material-enrichment.mjs",
  "scripts/check-prediction-page-gpt-material-registrationno-material-enrichment.mjs",
]);
const REQUIRED_FILES = [...ALLOWED_CHANGED];

const abs = (file) => path.isAbsolute(file) ? file : path.resolve(ROOT, file);
const git = (args) => spawnSync("git", args, { encoding: "utf8" });

export async function checkPredictionPageGptMaterialRegistrationNoMaterialEnrichment({
  printOutput = true,
} = {}) {
  const failures = [];
  const warnings = [];

  for (const file of REQUIRED_FILES) {
    if (!existsSync(abs(file))) failures.push(`missing required file: ${file}`);
  }

  const audit =
    await auditPredictionPageGptMaterialRegistrationNoMaterialEnrichment({
      printOutput: false,
    });
  const summary =
    audit.predictionPageGptMaterialRegistrationNoMaterialEnrichmentSummary;
  if (
    summary.finalStatus
    !== "PREDICTION_PAGE_GPT_MATERIAL_REGISTRATIONNO_MATERIAL_ENRICHMENT_AUDIT_COMPLETED"
  ) {
    failures.push(`material enrichment audit failed: ${summary.finalStatus}`);
  }
  if (
    !summary.explicitEntryRegistrationHasPriority
    || !summary.materialCarNoAndExactNameRequired
    || !summary.prefectureAdministrativeSuffixOnly
    || summary.nameOnlyCompletionDetected
    || summary.fuzzyMatchingDetected
    || summary.generatedRegistrationNoDetected
    || summary.publicWritePerformed
  ) {
    failures.push("material enrichment safety baseline changed");
  }

  const status = git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  if (status.status !== 0) {
    failures.push(`git status failed: ${status.stderr.trim()}`);
  } else {
    const changed = status.stdout
      .split("\0")
      .filter(Boolean)
      .map((entry) => entry.slice(3));
    const preExistingReviewChanges = [];
    for (const file of changed) {
      if (ALLOWED_CHANGED.has(file)) continue;
      if (file === "public/data/reviews/index.json" || file.startsWith("public/data/reviews/")) {
        preExistingReviewChanges.push(file);
        continue;
      }
      failures.push(`changed file is outside this task: ${file}`);
    }
    if (preExistingReviewChanges.length) {
      warnings.push(
        `pre-existing public/data/reviews changes retained: ${preExistingReviewChanges.length} file(s)`,
      );
    }
  }

  for (const protectedPath of [
    "public/data",
    "private-input",
    "package.json",
    ".github",
    "dog/reviews",
    "scripts/debug",
  ]) {
    if (protectedPath === "public/data/reviews") continue;
    const diff = git(["diff", "--quiet", "HEAD", "--", protectedPath]);
    if (protectedPath === "public/data" && diff.status !== 0) {
      const changedPublic = git(["diff", "--name-only", "HEAD", "--", protectedPath])
        .stdout.split(/\r?\n/u)
        .filter(Boolean)
        .filter((file) => !file.startsWith("public/data/reviews/"));
      if (changedPublic.length) {
        failures.push(`protected public data changed: ${changedPublic.join(", ")}`);
      }
      continue;
    }
    if (diff.status !== 0) failures.push(`protected path changed: ${protectedPath}`);
  }

  const finalStatus = failures.length
    ? "PREDICTION_PAGE_GPT_MATERIAL_REGISTRATIONNO_MATERIAL_ENRICHMENT_CHECK_FAIL"
    : warnings.length
      ? "PREDICTION_PAGE_GPT_MATERIAL_REGISTRATIONNO_MATERIAL_ENRICHMENT_CHECK_PASS_WITH_WARNINGS"
      : "PREDICTION_PAGE_GPT_MATERIAL_REGISTRATIONNO_MATERIAL_ENRICHMENT_CHECK_PASS";
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
if (isMain) {
  await checkPredictionPageGptMaterialRegistrationNoMaterialEnrichment();
}

