import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  auditPredictionPageGptMaterialSourceContract,
} from "./audit-prediction-page-gpt-material-source-contract.mjs";

const ROOT = process.cwd();
const ALLOWED_CHANGED = new Set([
  "src/lib/predictionGptSourceContract.ts",
  "src/pages/PageImplementations.tsx",
  "docs/kurari-ex/prediction-page-gpt-material-source-contract.md",
  "scripts/audit-prediction-page-gpt-material-source-contract.mjs",
  "scripts/check-prediction-page-gpt-material-source-contract.mjs",
]);
const REQUIRED_NEW = [
  "docs/kurari-ex/prediction-page-gpt-material-source-contract.md",
  "scripts/audit-prediction-page-gpt-material-source-contract.mjs",
  "scripts/check-prediction-page-gpt-material-source-contract.mjs",
];
const KNOWN_PREEXISTING = new Set([
  "docs/kurari-ex/authoritative-source-collection-plan-2026-06-30.md",
  "docs/kurari-ex/prediction-summary-result-source-contract.md",
  "docs/kurari-ex/review-page-result-output-contract.md",
  "scripts/audit-kurari-ex-source-contract-readiness-2026-06-30.mjs",
  "scripts/check-kurari-ex-source-contract-readiness-2026-06-30.mjs",
]);

function abs(file) {
  return path.isAbsolute(file) ? file : path.resolve(ROOT, file);
}

function git(args) {
  return spawnSync("git", args, { encoding: "utf8" });
}

export async function checkPredictionPageGptMaterialSourceContract({
  printOutput = true,
} = {}) {
  const failures = [];
  const warnings = [];
  for (const file of REQUIRED_NEW) {
    if (!existsSync(abs(file))) failures.push(`missing required file: ${file}`);
  }
  const audit = await auditPredictionPageGptMaterialSourceContract({
    printOutput: false,
  });
  const summary = audit.predictionPageGptMaterialSourceContractSummary;
  if (
    summary.finalStatus
    !== "PREDICTION_PAGE_GPT_MATERIAL_SOURCE_CONTRACT_AUDIT_COMPLETED"
  ) failures.push(`GPT material audit failed: ${summary.finalStatus}`);
  if (
    summary.requiredFieldCount !== 13
    || summary.presentFieldCount !== 13
    || !summary.registrationNoUsesOnlyExplicitFields
    || !summary.missingValuesUseNull
    || summary.nameBasedRegistrationNoCompletionDetected
    || summary.fakeGeneratedIdentityDetected
    || summary.fuzzyMatchingDetected
    || summary.publicWritePerformed
  ) failures.push("GPT material source contract baseline changed");

  const status = git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  if (status.status !== 0) {
    failures.push(`git status failed: ${status.stderr.trim()}`);
  } else {
    const changed =
      status.stdout.split("\0").filter(Boolean).map((entry) => entry.slice(3));
    const reviewChanges = [];
    const retainedPreExisting = [];
    for (const file of changed) {
      if (ALLOWED_CHANGED.has(file)) continue;
      if (KNOWN_PREEXISTING.has(file)) {
        retainedPreExisting.push(file);
        continue;
      }
      if (file === "public/data/reviews/index.json" || file.startsWith("public/data/reviews/")) {
        reviewChanges.push(file);
        continue;
      }
      failures.push(`changed file is outside this prediction-page task: ${file}`);
    }
    if (retainedPreExisting.length) {
      warnings.push(
        `pre-existing 26-10 files retained: ${retainedPreExisting.length} file(s)`,
      );
    }
    if (reviewChanges.length) {
      warnings.push(
        `pre-existing review changes retained: ${reviewChanges.length} file(s)`,
      );
    }
  }
  for (const protectedPath of [
    "public/data/analytics/kurari-ex/history",
    "public/data/analytics/kurari-ex/source",
    "public/data/races",
    "private-input",
    "package.json",
    ".github",
    "dog/reviews",
  ]) {
    const diff = git(["diff", "--quiet", "HEAD", "--", protectedPath]);
    if (diff.status !== 0) failures.push(`protected path changed: ${protectedPath}`);
  }

  const finalStatus = failures.length
    ? "PREDICTION_PAGE_GPT_MATERIAL_SOURCE_CONTRACT_CHECK_FAIL"
    : warnings.length
      ? "PREDICTION_PAGE_GPT_MATERIAL_SOURCE_CONTRACT_CHECK_PASS_WITH_WARNINGS"
      : "PREDICTION_PAGE_GPT_MATERIAL_SOURCE_CONTRACT_CHECK_PASS";
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
if (isMain) await checkPredictionPageGptMaterialSourceContract();
