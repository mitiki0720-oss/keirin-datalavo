import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  assertSnapshotTarget,
  atomicWriteJson,
  buildSnapshotPayload,
  evaluateExistingSnapshot,
  snapshotPathForDate,
  validateSnapshot,
} from "./lib/kurari-ex-entry-snapshot.mjs";

const ROOT = process.cwd();
const SOURCE_PATH = path.join(
  ROOT,
  "public",
  "data",
  "races",
  "keirin-jp-entries.generated.json",
);

function relativePath(file) {
  return path.relative(ROOT, file).replaceAll("\\", "/");
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function readJsonIfPresent(file) {
  if (!existsSync(file)) return null;
  return readJson(file);
}

async function main() {
  if (!existsSync(SOURCE_PATH)) {
    throw new Error(`source file does not exist: ${SOURCE_PATH}`);
  }
  const sourcePayload = await readJson(SOURCE_PATH);
  const build = buildSnapshotPayload(sourcePayload);
  const payload = build.payload;
  const targetPath = path.resolve(
    ROOT,
    snapshotPathForDate(payload.date),
  );
  assertSnapshotTarget(ROOT, targetPath, payload.date);

  if (!build.eligible) {
    console.log("[kurari-ex entry snapshot writer]");
    console.log(`sourcePath: ${relativePath(SOURCE_PATH)}`);
    console.log(`targetPath: ${relativePath(targetPath)}`);
    console.log(`sourceGeneratedAt: ${payload.sourceGeneratedAt}`);
    console.log(`snapshotDate: ${payload.date}`);
    console.log(`raceCount: ${payload.summary.raceCount}`);
    console.log(`riderCount: ${payload.summary.riderCount}`);
    console.log(
      `fullRegistrationRaceCount: ${payload.summary.fullRegistrationRaceCount}`,
    );
    console.log(`blockedRaceCount: ${payload.summary.blockedRaceCount}`);
    console.log(`contentHash: ${payload.contentHash}`);
    console.log(`targetAlreadyExists: ${existsSync(targetPath)}`);
    console.log("existingSnapshotStatus: NOT_CHECKED");
    console.log("writeStatus: BLOCKED");
    console.log("noWriteNeeded: false");
    console.log("snapshotGenerated: false");
    console.log("writesPerformed: false");
    console.log("fakeCompletionPerformed: false");
    console.log("productionAnalyticsGenerated: false");
    console.log(
      `blockedReasons: ${JSON.stringify(build.globalBlockedReasons)}`,
    );
    process.exitCode = 1;
    return;
  }

  const preWriteValidation = validateSnapshot(payload);
  if (preWriteValidation.checkStatus !== "PASS") {
    throw new Error(
      `proposed snapshot failed validation: ${preWriteValidation.failedReasons.join(", ")}`,
    );
  }

  const existing = await readJsonIfPresent(targetPath);
  const existingAudit = evaluateExistingSnapshot(existing, payload);
  let writeStatus = existingAudit.writeStatus;
  let snapshotGenerated = false;
  let writesPerformed = false;

  if (writeStatus === "WRITE_CANDIDATE") {
    await atomicWriteJson(targetPath, payload);
    const written = await readJson(targetPath);
    const postWriteValidation = validateSnapshot(written);
    if (postWriteValidation.checkStatus !== "PASS") {
      throw new Error(
        `written snapshot failed validation: ${postWriteValidation.failedReasons.join(", ")}`,
      );
    }
    writeStatus = "WRITTEN";
    snapshotGenerated = true;
    writesPerformed = true;
  } else if (writeStatus === "BLOCKED") {
    process.exitCode = 1;
  }

  console.log("[kurari-ex entry snapshot writer]");
  console.log(`sourcePath: ${relativePath(SOURCE_PATH)}`);
  console.log(`targetPath: ${relativePath(targetPath)}`);
  console.log(`sourceGeneratedAt: ${payload.sourceGeneratedAt}`);
  console.log(`snapshotDate: ${payload.date}`);
  console.log(`raceCount: ${payload.summary.raceCount}`);
  console.log(`riderCount: ${payload.summary.riderCount}`);
  console.log(
    `fullRegistrationRaceCount: ${payload.summary.fullRegistrationRaceCount}`,
  );
  console.log(`blockedRaceCount: ${payload.summary.blockedRaceCount}`);
  console.log(`contentHash: ${payload.contentHash}`);
  console.log(
    `targetAlreadyExists: ${existingAudit.targetAlreadyExists}`,
  );
  console.log(
    `existingSnapshotStatus: ${existingAudit.existingSnapshotStatus}`,
  );
  console.log(`writeStatus: ${writeStatus}`);
  console.log(
    `noWriteNeeded: ${writeStatus === "NO_WRITE_NEEDED"}`,
  );
  console.log(`snapshotGenerated: ${snapshotGenerated}`);
  console.log(`writesPerformed: ${writesPerformed}`);
  console.log("fakeCompletionPerformed: false");
  console.log("productionAnalyticsGenerated: false");
  console.log(
    `blockedReasons: ${JSON.stringify(existingAudit.blockedReasons)}`,
  );
}

main().catch((error) => {
  console.error("[kurari-ex entry snapshot writer] failed");
  console.error(error);
  process.exitCode = 1;
});
