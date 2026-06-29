import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_TARGET_PATH,
  TODAY_PATH,
  buildExpectedStartersSource,
  checkStartersSource,
} from "./check-kurari-ex-starters-from-today-registration.mjs";
import { atomicWriteJson } from "./lib/kurari-ex-entry-snapshot.mjs";

const ROOT = process.cwd();

function printResult(context) {
  console.log("[kurari-ex starters from today registration writer]");
  for (const key of [
    "targetPath",
    "todayPath",
    "todayDate",
    "sourceTodayHash",
    "sourceSnapshotPath",
    "sourceSnapshotHash",
    "todayRegistrationBridgeCheckStatus",
    "todayRegistrationRootBridgeMetadataStatus",
    "todayRegistrationRootBridgeMetadataWarningReasons",
    "startersDryRunReadiness",
    "todayRaceCount",
    "todayRiderCount",
    "targetRaceCount",
    "targetStarterCount",
    "fullStarterRaceCount",
    "blockedStarterRaceCount",
    "registrationNoCompleteCount",
    "sourceMetadataCompleteCount",
    "blockReasonCounts",
    "targetAlreadyExists",
    "existingTargetStatus",
    "contentHash",
    "writeStatus",
    "noWriteNeeded",
    "startersSourceGenerated",
    "writesPerformed",
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
      `${key}: ${
        typeof value === "object" ? JSON.stringify(value) : value
      }`,
    );
  }
}

async function main() {
  const targetFile = path.resolve(ROOT, DEFAULT_TARGET_PATH);
  const exactAllowedTarget = path.resolve(
    ROOT,
    "public/data/analytics/kurari-ex/source/starters/2026-06-29/today-registration-starters.generated.json",
  );
  if (targetFile !== exactAllowedTarget) {
    throw new Error("TARGET_PATH_OUT_OF_SCOPE");
  }

  const build = await buildExpectedStartersSource(ROOT);
  const payload = build.payload;
  const context = {
    targetPath: DEFAULT_TARGET_PATH,
    todayPath: TODAY_PATH,
    todayDate: payload?.date ?? build.bridgeCheck?.todayDate ?? null,
    sourceTodayHash: payload?.sourceTodayHash ?? null,
    sourceSnapshotPath: payload?.sourceSnapshotPath ?? null,
    sourceSnapshotHash: payload?.sourceSnapshotHash ?? null,
    todayRegistrationBridgeCheckStatus:
      build.bridgeCheck?.checkStatus ?? "FAIL",
    todayRegistrationRootBridgeMetadataStatus:
      build.bridgeCheck?.rootBridgeMetadataStatus ?? null,
    todayRegistrationRootBridgeMetadataWarningReasons:
      build.bridgeCheck?.rootBridgeMetadataWarningReasons ?? [],
    startersDryRunReadiness:
      build.startersDryRunReadiness?.status ?? "BLOCKED",
    todayRaceCount: build.bridgeCheck?.todayRaceCount ?? 0,
    todayRiderCount: build.bridgeCheck?.todayRiderCount ?? 0,
    targetRaceCount: payload?.summary?.raceCount ?? 0,
    targetStarterCount: payload?.summary?.starterCount ?? 0,
    fullStarterRaceCount:
      payload?.summary?.fullStarterRaceCount ?? 0,
    blockedStarterRaceCount:
      payload?.summary?.blockedStarterRaceCount ?? 0,
    registrationNoCompleteCount:
      payload?.summary?.registrationNoCompleteCount ?? 0,
    sourceMetadataCompleteCount:
      payload?.summary?.sourceMetadataCompleteCount ?? 0,
    blockReasonCounts: build.blockReasonCounts ?? {},
    targetAlreadyExists: existsSync(targetFile),
    existingTargetStatus: "NOT_FOUND",
    contentHash: payload?.contentHash ?? null,
    writeStatus: "BLOCKED",
    noWriteNeeded: false,
    startersSourceGenerated: false,
    writesPerformed: false,
    todayModified: false,
    historyModified: false,
    analyticsExistingModified: false,
    reviewsModified: false,
    fakeCompletionPerformed: false,
    fuzzyMatchingPerformed: false,
    resultLineupPredictionUsedAsStarterSource: false,
  };

  if (
    build.buildStatus !== "PASS" ||
    build.startersDryRunReadiness?.status !==
      "READY_FOR_KURARI_EX_STARTERS_WRITE_IMPLEMENTATION"
  ) {
    context.blockReasonCounts = Object.fromEntries(
      (build.blockedReasons ?? ["STARTERS_BUILD_BLOCKED"]).map(
        (reason) => [reason, 1],
      ),
    );
    printResult(context);
    process.exitCode = 1;
    return;
  }

  if (context.targetAlreadyExists) {
    const existingCheck = await checkStartersSource(
      DEFAULT_TARGET_PATH,
      ROOT,
    );
    context.existingTargetStatus = existingCheck.checkStatus;
    const existing = JSON.parse(await readFile(targetFile, "utf8"));
    if (
      existingCheck.checkStatus === "PASS" &&
      existing.contentHash === payload.contentHash
    ) {
      context.writeStatus = "NO_WRITE_NEEDED";
      context.noWriteNeeded = true;
      printResult(context);
      return;
    }
    context.blockReasonCounts =
      existing.contentHash !== payload.contentHash
        ? { EXISTING_STARTERS_SOURCE_DIFFERENT: 1 }
        : {
            EXISTING_STARTERS_SOURCE_CHECK_FAILED: 1,
            ...Object.fromEntries(
              existingCheck.failedReasons.map((reason) => [reason, 1]),
            ),
          };
    printResult(context);
    process.exitCode = 1;
    return;
  }

  await atomicWriteJson(targetFile, payload);
  context.writeStatus = "WRITTEN";
  context.startersSourceGenerated = true;
  context.writesPerformed = true;
  const postWrite = await checkStartersSource(
    DEFAULT_TARGET_PATH,
    ROOT,
  );
  context.existingTargetStatus = postWrite.checkStatus;
  if (postWrite.checkStatus !== "PASS") {
    context.blockReasonCounts = Object.fromEntries(
      postWrite.failedReasons.map((reason) => [reason, 1]),
    );
    printResult(context);
    process.exitCode = 1;
    return;
  }
  printResult(context);
}

main().catch((error) => {
  console.error(
    "[kurari-ex starters from today registration writer] failed",
  );
  console.error(error);
  process.exitCode = 1;
});
