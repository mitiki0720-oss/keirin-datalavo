import { existsSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import {
  INDEX_PATH,
  INDEX_SCHEMA_VERSION,
  SNAPSHOT_ROOT,
  atomicWriteJson,
  buildSnapshotIndexPayload,
  validateSnapshot,
  validateSnapshotIndex,
} from "./lib/kurari-ex-entry-snapshot.mjs";

const ROOT = process.cwd();
const BASE_PATH = path.resolve(ROOT, SNAPSHOT_ROOT);
const TARGET_PATH = path.resolve(ROOT, INDEX_PATH);

function relativePath(file) {
  return path.relative(ROOT, file).replaceAll("\\", "/");
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function collectSnapshotFiles() {
  if (!existsSync(BASE_PATH)) {
    throw new Error(`entries-history directory is missing: ${BASE_PATH}`);
  }
  const files = [];
  for (const entry of await readdir(BASE_PATH, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^\d{4}-\d{2}-\d{2}$/.test(entry.name)) {
      continue;
    }
    const candidate = path.join(
      BASE_PATH,
      entry.name,
      "keirin-jp-entries.generated.json",
    );
    if (existsSync(candidate)) files.push(candidate);
  }
  return files.sort();
}

async function inspectSnapshot(file) {
  const [payload, fileStat] = await Promise.all([
    readJson(file),
    stat(file),
  ]);
  const validation = validateSnapshot(payload);
  return {
    date: payload?.date,
    path: relativePath(file),
    schemaVersion: payload?.schemaVersion,
    source: payload?.source,
    sourceGeneratedAt: payload?.sourceGeneratedAt,
    contentHash: payload?.contentHash,
    raceCount: validation.raceCount,
    riderCount: validation.riderCount,
    fullRegistrationRaceCount:
      validation.fullRegistrationRaceCount,
    blockedRaceCount: validation.blockedRaceCount,
    checkStatus: validation.checkStatus,
    hashMatched: validation.hashMatched,
    sizeBytes: fileStat.size,
    fileExists: true,
    failedReasons: validation.failedReasons,
  };
}

async function evaluateExistingIndex(current) {
  if (!existsSync(TARGET_PATH)) {
    return {
      targetAlreadyExists: false,
      existingIndexStatus: "NOT_FOUND",
      writeStatus: "WRITE_CANDIDATE",
      blockedReasons: [],
    };
  }
  const existing = await readJson(TARGET_PATH);
  if (existing?.schemaVersion !== INDEX_SCHEMA_VERSION) {
    return {
      targetAlreadyExists: true,
      existingIndexStatus: "SCHEMA_MISMATCH",
      writeStatus: "BLOCKED",
      blockedReasons: ["SCHEMA_VERSION_MISMATCH"],
    };
  }
  const validation = await validateSnapshotIndex(ROOT, existing);
  if (validation.checkStatus !== "PASS") {
    return {
      targetAlreadyExists: true,
      existingIndexStatus: "INVALID",
      writeStatus: "BLOCKED",
      blockedReasons: [
        "EXISTING_INDEX_INVALID",
        ...validation.failedReasons,
      ],
    };
  }
  if (existing.contentHash === current.contentHash) {
    return {
      targetAlreadyExists: true,
      existingIndexStatus: "SEMANTIC_HASH_MATCHED",
      writeStatus: "NO_WRITE_NEEDED",
      blockedReasons: [],
    };
  }

  const reasons = [];
  const currentDates = new Set(
    current.snapshots.map((snapshot) => snapshot.date),
  );
  const removedDates = existing.snapshots
    .map((snapshot) => snapshot.date)
    .filter((date) => !currentDates.has(date));
  if (removedDates.length > 0) reasons.push("SNAPSHOT_DATE_REMOVED");
  for (const field of [
    "snapshotCount",
    "raceCount",
    "riderCount",
    "fullRegistrationRaceCount",
  ]) {
    if (current.summary[field] < existing.summary[field]) {
      reasons.push(`${field.toUpperCase()}_REGRESSION`);
    }
  }
  if (current.summary.failCount > 0) {
    reasons.push("CURRENT_INDEX_HAS_FAILED_SNAPSHOT");
  }
  return {
    targetAlreadyExists: true,
    existingIndexStatus:
      reasons.length > 0
        ? "PROTECTED_FROM_REGRESSION"
        : "CURRENT_EQUAL_OR_BETTER",
    writeStatus: reasons.length > 0 ? "BLOCKED" : "WRITE_CANDIDATE",
    blockedReasons: reasons,
  };
}

function printResult(payload, candidateCount, existingAudit, writeResult) {
  console.log("[kurari-ex entry snapshot index writer]");
  console.log(`basePath: ${SNAPSHOT_ROOT}`);
  console.log(`targetPath: ${INDEX_PATH}`);
  console.log(`snapshotCandidateCount: ${candidateCount}`);
  console.log(`indexedSnapshotCount: ${payload.summary.snapshotCount}`);
  console.log(
    `snapshotDates: ${JSON.stringify(payload.snapshots.map((item) => item.date))}`,
  );
  console.log(`raceCount: ${payload.summary.raceCount}`);
  console.log(`riderCount: ${payload.summary.riderCount}`);
  console.log(
    `fullRegistrationRaceCount: ${payload.summary.fullRegistrationRaceCount}`,
  );
  console.log(`blockedRaceCount: ${payload.summary.blockedRaceCount}`);
  console.log(`passCount: ${payload.summary.passCount}`);
  console.log(`failCount: ${payload.summary.failCount}`);
  console.log(
    `duplicateDateCount: ${payload.quality.duplicateDateCount}`,
  );
  console.log(
    `duplicatePathCount: ${payload.quality.duplicatePathCount}`,
  );
  console.log(`contentHash: ${payload.contentHash}`);
  console.log(
    `targetAlreadyExists: ${existingAudit.targetAlreadyExists}`,
  );
  console.log(
    `existingIndexStatus: ${existingAudit.existingIndexStatus}`,
  );
  console.log(`writeStatus: ${writeResult.writeStatus}`);
  console.log(
    `noWriteNeeded: ${writeResult.writeStatus === "NO_WRITE_NEEDED"}`,
  );
  console.log(`indexGenerated: ${writeResult.indexGenerated}`);
  console.log(`writesPerformed: ${writeResult.writesPerformed}`);
  console.log("fakeCompletionPerformed: false");
  console.log("productionAnalyticsGenerated: false");
  console.log(
    `blockedReasons: ${JSON.stringify(existingAudit.blockedReasons)}`,
  );
}

async function main() {
  if (
    TARGET_PATH !== path.resolve(ROOT, INDEX_PATH) ||
    path.dirname(TARGET_PATH) !== BASE_PATH
  ) {
    throw new Error(`index target is outside exact allowed path: ${TARGET_PATH}`);
  }
  const files = await collectSnapshotFiles();
  if (files.length === 0) {
    throw new Error("no entry snapshot candidates found");
  }
  const records = await Promise.all(files.map(inspectSnapshot));
  const failed = records.filter(
    (record) =>
      record.checkStatus !== "PASS" || record.hashMatched !== true,
  );
  if (failed.length > 0) {
    console.error("[kurari-ex entry snapshot index writer] BLOCKED");
    console.error(
      JSON.stringify(
        failed.map((record) => ({
          path: record.path,
          failedReasons: record.failedReasons,
        })),
        null,
        2,
      ),
    );
    process.exitCode = 1;
    return;
  }

  const build = buildSnapshotIndexPayload(records);
  if (!build.eligible) {
    console.error("[kurari-ex entry snapshot index writer] BLOCKED");
    console.error(JSON.stringify(build.blockedReasons));
    process.exitCode = 1;
    return;
  }
  const payload = build.payload;
  const existingAudit = await evaluateExistingIndex(payload);
  const writeResult = {
    writeStatus: existingAudit.writeStatus,
    indexGenerated: false,
    writesPerformed: false,
  };

  if (existingAudit.writeStatus === "WRITE_CANDIDATE") {
    await atomicWriteJson(TARGET_PATH, payload);
    const written = await readJson(TARGET_PATH);
    const validation = await validateSnapshotIndex(ROOT, written);
    if (validation.checkStatus !== "PASS") {
      throw new Error(
        `written index failed validation: ${validation.failedReasons.join(", ")}`,
      );
    }
    writeResult.writeStatus = "WRITTEN";
    writeResult.indexGenerated = true;
    writeResult.writesPerformed = true;
  } else if (existingAudit.writeStatus === "BLOCKED") {
    process.exitCode = 1;
  }

  printResult(payload, files.length, existingAudit, writeResult);
}

main().catch((error) => {
  console.error("[kurari-ex entry snapshot index writer] failed");
  console.error(error);
  process.exitCode = 1;
});
