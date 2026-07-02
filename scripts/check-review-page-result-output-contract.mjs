import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  auditReviewPageResultOutputContract,
} from "./audit-review-page-result-output-contract.mjs";

const ROOT = process.cwd();
const ALLOWED_CHANGED = new Set([
  "src/lib/reviewResultOutputContract.ts",
  "src/pages/ReviewPage.tsx",
  "docs/kurari-ex/review-page-result-output-implementation.md",
  "scripts/audit-review-page-result-output-contract.mjs",
  "scripts/check-review-page-result-output-contract.mjs",
]);
const REQUIRED_FILES = [...ALLOWED_CHANGED];

const abs = (file) => path.isAbsolute(file) ? file : path.resolve(ROOT, file);
const git = (args) => spawnSync("git", args, { encoding: "utf8" });

export async function checkReviewPageResultOutputContract({
  printOutput = true,
} = {}) {
  const failures = [];
  const warnings = [];

  for (const file of REQUIRED_FILES) {
    if (!existsSync(abs(file))) failures.push(`missing required file: ${file}`);
  }

  const audit = await auditReviewPageResultOutputContract({
    printOutput: false,
  });
  const summary = audit.reviewPageResultOutputSummary;
  if (
    summary.finalStatus !== "REVIEW_PAGE_RESULT_OUTPUT_CONTRACT_AUDIT_COMPLETED"
  ) {
    failures.push(`result output audit failed: ${summary.finalStatus}`);
  }
  if (
    summary.nameOnlyCompletionDetected
    || summary.fuzzyMatchingDetected
    || summary.generatedRegistrationNoDetected
    || summary.publicWritePerformed
  ) {
    failures.push("result output safety baseline changed");
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
    ? "REVIEW_PAGE_RESULT_OUTPUT_CONTRACT_CHECK_FAIL"
    : warnings.length
      ? "REVIEW_PAGE_RESULT_OUTPUT_CONTRACT_CHECK_PASS_WITH_WARNINGS"
      : "REVIEW_PAGE_RESULT_OUTPUT_CONTRACT_CHECK_PASS";
  const result = {
    failures,
    warnings,
    finalStatus,
  };
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
if (isMain) await checkReviewPageResultOutputContract();

