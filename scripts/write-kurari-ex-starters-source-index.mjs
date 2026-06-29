import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_TARGET_PATH,
  SOURCE_ROOT,
  buildExpectedStartersSourceIndex,
  checkStartersSourceIndex,
} from "./check-kurari-ex-starters-source-index.mjs";
import { atomicWriteJson } from "./lib/kurari-ex-entry-snapshot.mjs";

const ROOT = process.cwd();

function blockReasonCountsFromReasons(reasons) {
  return Object.fromEntries((reasons ?? []).map((reason) => [reason, 1]));
}

function printResult(context) {
  console.log("[kurari-ex starters source index writer]");
  for (const key of [
    "targetPath",
    "sourceRoot",
    "sourceFileCount",
    "indexedSourceCount",
    "latestDate",
    "latestPath",
    "totalRaceCount",
    "totalStarterCount",
    "passSourceCount",
    "failSourceCount",
    "duplicateDateCount",
    "duplicatePathCount",
    "blockReasonCounts",
    "targetAlreadyExists",
    "existingTargetStatus",
    "contentHash",
    "writeStatus",
    "noWriteNeeded",
    "indexGenerated",
    "writesPerformed",
    "sourceFilesModified",
    "todayModified",
    "historyModified",
    "analyticsExistingModified",
    "reviewsModified",
    "fakeCompletionPerformed",
    "fuzzyMatchingPerformed",
    "resultLineupPredictionUsedAsStarterSource",
  ]) {
    const value = context[key];
    console.log(
      `${key}: ${typeof value === "object" ? JSON.stringify(value) : value}`,
    );
  }
}

async function main() {
  const targetFile = path.resolve(ROOT, DEFAULT_TARGET_PATH);
  const exactAllowedTarget = path.resolve(
    ROOT,
    "public/data/analytics/kurari-ex/source/starters/index.generated.json",
  );
  if (targetFile !== exactAllowedTarget) {
    throw new Error("TARGET_PATH_OUT_OF_SCOPE");
  }

  const build = await buildExpectedStartersSourceIndex(ROOT);
  const payload = build.payload;
  const summary = payload.summary;
  const context = {
    targetPath: DEFAULT_TARGET_PATH,
    sourceRoot: SOURCE_ROOT,
    sourceFileCount: summary.sourceFileCount,
    indexedSourceCount: summary.indexedSourceCount,
    latestDate: payload.latest?.date ?? null,
    latestPath: payload.latest?.path ?? null,
    totalRaceCount: summary.totalRaceCount,
    totalStarterCount: summary.totalStarterCount,
    passSourceCount: summary.passSourceCount,
    failSourceCount: summary.failSourceCount,
    duplicateDateCount: summary.duplicateDateCount,
    duplicatePathCount: summary.duplicatePathCount,
    blockReasonCounts: build.blockReasonCounts,
    targetAlreadyExists: existsSync(targetFile),
    existingTargetStatus: "NOT_FOUND",
    contentHash: payload.contentHash,
    writeStatus: "BLOCKED",
    noWriteNeeded: false,
    indexGenerated: false,
    writesPerformed: false,
    sourceFilesModified: false,
    todayModified: false,
    historyModified: false,
    analyticsExistingModified: false,
    reviewsModified: false,
    fakeCompletionPerformed: false,
    fuzzyMatchingPerformed: false,
    resultLineupPredictionUsedAsStarterSource: false,
  };

  if (build.buildStatus !== "PASS") {
    printResult(context);
    process.exitCode = 1;
    return;
  }

  if (context.targetAlreadyExists) {
    const existingCheck = await checkStartersSourceIndex(
      DEFAULT_TARGET_PATH,
      ROOT,
    );
    context.existingTargetStatus = existingCheck.checkStatus;
    if (existingCheck.checkStatus !== "PASS") {
      context.blockReasonCounts = {
        EXISTING_INDEX_CHECK_FAILED: 1,
        ...blockReasonCountsFromReasons(existingCheck.failedReasons),
      };
      printResult(context);
      process.exitCode = 1;
      return;
    }
    const existing = JSON.parse(await readFile(targetFile, "utf8"));
    if (existing.contentHash === payload.contentHash) {
      context.writeStatus = "NO_WRITE_NEEDED";
      context.noWriteNeeded = true;
      printResult(context);
      return;
    }
    context.blockReasonCounts = { EXISTING_INDEX_DIFFERENT: 1 };
    printResult(context);
    process.exitCode = 1;
    return;
  }

  await atomicWriteJson(targetFile, payload);
  context.writeStatus = "WRITTEN";
  context.indexGenerated = true;
  context.writesPerformed = true;
  const postWrite = await checkStartersSourceIndex(
    DEFAULT_TARGET_PATH,
    ROOT,
  );
  context.existingTargetStatus = postWrite.checkStatus;
  if (postWrite.checkStatus !== "PASS") {
    context.blockReasonCounts = {
      POST_WRITE_INDEX_CHECK_FAILED: 1,
      ...blockReasonCountsFromReasons(postWrite.failedReasons),
    };
    printResult(context);
    process.exitCode = 1;
    return;
  }
  printResult(context);
}

main().catch((error) => {
  console.error("[kurari-ex starters source index writer] failed");
  console.error(error);
  process.exitCode = 1;
});
