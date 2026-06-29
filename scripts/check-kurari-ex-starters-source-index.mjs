import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  SCHEMA_VERSION as STARTERS_SOURCE_SCHEMA_VERSION,
  SOURCE as STARTERS_SOURCE,
  startersSourceContentHash,
} from "./check-kurari-ex-starters-from-today-registration.mjs";
import {
  normalizeText,
  stableJson,
  toInteger,
} from "./lib/kurari-ex-entry-snapshot.mjs";

export const INDEX_SCHEMA_VERSION = "kurari-ex-starters-source-index/v1";
export const SOURCE_ROOT =
  "public/data/analytics/kurari-ex/source/starters";
export const SOURCE_PATTERN = "*/today-registration-starters.generated.json";
export const DEFAULT_TARGET_PATH = `${SOURCE_ROOT}/index.generated.json`;

const SOURCE_FILE_NAME = "today-registration-starters.generated.json";

function sha256Text(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function startersSourceIndexContentHash(payload) {
  const { contentHash: _contentHash, ...semantic } = payload ?? {};
  return sha256Text(JSON.stringify(semantic));
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function relativePath(root, file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

function increment(counter, reason) {
  counter[reason] = (counter[reason] ?? 0) + 1;
}

function countDuplicateValues(values) {
  const counts = new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.values()].filter((count) => count > 1).length;
}

async function findSourceFiles(root) {
  const sourceRoot = path.resolve(root, SOURCE_ROOT);
  if (!existsSync(sourceRoot)) return [];
  const entries = await readdir(sourceRoot, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.name)) continue;
    const file = path.join(sourceRoot, entry.name, SOURCE_FILE_NAME);
    if (existsSync(file)) files.push(file);
  }
  return files.sort((left, right) =>
    relativePath(root, left).localeCompare(relativePath(root, right)),
  );
}

function sourceDateFromPath(file) {
  return path.basename(path.dirname(file));
}

function validateSourcePayload(payload, file, root) {
  const failedReasons = [];
  const sourcePath = relativePath(root, file);
  const pathDate = sourceDateFromPath(file);
  const summary = payload?.summary ?? {};
  const quality = payload?.quality ?? {};

  if (payload?.schemaVersion !== STARTERS_SOURCE_SCHEMA_VERSION) {
    failedReasons.push("SOURCE_SCHEMA_VERSION_MISMATCH");
  }
  if (payload?.source !== STARTERS_SOURCE) {
    failedReasons.push("SOURCE_NAME_MISMATCH");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizeText(payload?.date))) {
    failedReasons.push("SOURCE_DATE_INVALID");
  }
  if (payload?.date !== pathDate) {
    failedReasons.push("SOURCE_DATE_PATH_MISMATCH");
  }
  const hashMatched =
    normalizeText(payload?.contentHash) ===
    startersSourceContentHash(payload);
  if (!hashMatched) failedReasons.push("SOURCE_CONTENT_HASH_MISMATCH");
  if (quality?.checkStatus !== "PASS") {
    failedReasons.push("SOURCE_QUALITY_NOT_PASS");
  }
  if (toInteger(summary?.raceCount) <= 0) {
    failedReasons.push("SOURCE_RACE_COUNT_INVALID");
  }
  if (toInteger(summary?.starterCount) <= 0) {
    failedReasons.push("SOURCE_STARTER_COUNT_INVALID");
  }
  if (summary?.fullStarterRaceCount !== summary?.raceCount) {
    failedReasons.push("SOURCE_FULL_RACE_COUNT_MISMATCH");
  }
  if (summary?.blockedStarterRaceCount !== 0) {
    failedReasons.push("SOURCE_BLOCKED_RACE_COUNT_NON_ZERO");
  }
  if (summary?.registrationNoCompleteCount !== summary?.starterCount) {
    failedReasons.push("SOURCE_REGISTRATION_INCOMPLETE");
  }
  if (summary?.sourceMetadataCompleteCount !== summary?.starterCount) {
    failedReasons.push("SOURCE_METADATA_INCOMPLETE");
  }
  if (quality?.fakeCompletionPerformed !== false) {
    failedReasons.push("SOURCE_FAKE_COMPLETION_PERFORMED");
  }
  if (quality?.fuzzyMatchingPerformed !== false) {
    failedReasons.push("SOURCE_FUZZY_MATCHING_PERFORMED");
  }
  if (quality?.resultLineupPredictionUsedAsStarterSource !== false) {
    failedReasons.push("SOURCE_PROHIBITED_STARTER_SOURCE_USED");
  }
  if ((quality?.blockedReasons ?? []).length !== 0) {
    failedReasons.push("SOURCE_BLOCKED_REASONS_NON_EMPTY");
  }

  return {
    checkStatus: failedReasons.length === 0 ? "PASS" : "FAIL",
    path: sourcePath,
    pathDate,
    hashMatched,
    failedReasons: [...new Set(failedReasons)],
  };
}

function sourceEntry(payload, sourceValidation) {
  const summary = payload.summary;
  const quality = payload.quality;
  return {
    date: payload.date,
    path: sourceValidation.path,
    schemaVersion: payload.schemaVersion,
    source: payload.source,
    sourceTodayPath: payload.sourceTodayPath,
    sourceSnapshotPath: payload.sourceSnapshotPath,
    sourceTodayHash: payload.sourceTodayHash,
    sourceSnapshotHash: payload.sourceSnapshotHash,
    contentHash: payload.contentHash,
    raceCount: summary.raceCount,
    starterCount: summary.starterCount,
    fullStarterRaceCount: summary.fullStarterRaceCount,
    blockedStarterRaceCount: summary.blockedStarterRaceCount,
    registrationNoCompleteCount: summary.registrationNoCompleteCount,
    sourceMetadataCompleteCount: summary.sourceMetadataCompleteCount,
    checkStatus: sourceValidation.checkStatus,
    quality: {
      fakeCompletionPerformed: quality.fakeCompletionPerformed,
      fuzzyMatchingPerformed: quality.fuzzyMatchingPerformed,
      resultLineupPredictionUsedAsStarterSource:
        quality.resultLineupPredictionUsedAsStarterSource,
      blockedReasons: quality.blockedReasons ?? [],
    },
  };
}

function summarizeSources(sourceFileCount, sources, failSourceCount) {
  return {
    sourceFileCount,
    indexedSourceCount: sources.length,
    passSourceCount: sources.filter((source) => source.checkStatus === "PASS")
      .length,
    failSourceCount,
    duplicateDateCount: countDuplicateValues(
      sources.map((source) => source.date),
    ),
    duplicatePathCount: countDuplicateValues(
      sources.map((source) => source.path),
    ),
    totalRaceCount: sources.reduce(
      (total, source) => total + Number(source.raceCount ?? 0),
      0,
    ),
    totalStarterCount: sources.reduce(
      (total, source) => total + Number(source.starterCount ?? 0),
      0,
    ),
    fullStarterRaceCount: sources.reduce(
      (total, source) =>
        total + Number(source.fullStarterRaceCount ?? 0),
      0,
    ),
    blockedStarterRaceCount: sources.reduce(
      (total, source) =>
        total + Number(source.blockedStarterRaceCount ?? 0),
      0,
    ),
    registrationNoCompleteCount: sources.reduce(
      (total, source) =>
        total + Number(source.registrationNoCompleteCount ?? 0),
      0,
    ),
    sourceMetadataCompleteCount: sources.reduce(
      (total, source) =>
        total + Number(source.sourceMetadataCompleteCount ?? 0),
      0,
    ),
  };
}

function latestSource(sources) {
  return [...sources]
    .sort(
      (left, right) =>
        left.date.localeCompare(right.date) ||
        left.path.localeCompare(right.path),
    )
    .at(-1);
}

export async function buildExpectedStartersSourceIndex(
  root = process.cwd(),
) {
  const sourceFiles = await findSourceFiles(root);
  const failedSourceRecords = [];
  const validSources = [];
  const blockReasonCounts = {};

  for (const file of sourceFiles) {
    let payload = null;
    let validation = null;
    try {
      payload = await readJson(file);
      validation = validateSourcePayload(payload, file, root);
    } catch {
      validation = {
        checkStatus: "FAIL",
        path: relativePath(root, file),
        failedReasons: ["SOURCE_JSON_PARSE_FAILED"],
      };
    }
    if (validation.checkStatus !== "PASS") {
      failedSourceRecords.push(validation);
      for (const reason of validation.failedReasons) {
        increment(blockReasonCounts, reason);
      }
      continue;
    }
    validSources.push(sourceEntry(payload, validation));
  }

  const sources = validSources.sort(
    (left, right) =>
      left.date.localeCompare(right.date) ||
      left.path.localeCompare(right.path),
  );
  const summary = summarizeSources(
    sourceFiles.length,
    sources,
    failedSourceRecords.length,
  );
  if (summary.sourceFileCount === 0) {
    increment(blockReasonCounts, "SOURCE_FILE_COUNT_ZERO");
  }
  if (summary.failSourceCount > 0) {
    increment(blockReasonCounts, "SOURCE_CHECK_FAILED");
  }
  if (summary.duplicateDateCount > 0) {
    increment(blockReasonCounts, "DUPLICATE_DATE");
  }
  if (summary.duplicatePathCount > 0) {
    increment(blockReasonCounts, "DUPLICATE_PATH");
  }
  const latest = latestSource(sources) ?? null;
  const blockedReasons = Object.keys(blockReasonCounts);
  const withoutHash = {
    schemaVersion: INDEX_SCHEMA_VERSION,
    sourceRoot: SOURCE_ROOT,
    sourcePattern: SOURCE_PATTERN,
    contentHash: "",
    summary,
    latest: latest
      ? {
          date: latest.date,
          path: latest.path,
          contentHash: latest.contentHash,
          sourceTodayHash: latest.sourceTodayHash,
          sourceSnapshotHash: latest.sourceSnapshotHash,
          raceCount: latest.raceCount,
          starterCount: latest.starterCount,
          checkStatus: latest.checkStatus,
        }
      : null,
    sources,
    quality: {
      checkStatus: blockedReasons.length === 0 ? "PASS" : "FAIL",
      fakeCompletionPerformed: false,
      fuzzyMatchingPerformed: false,
      resultLineupPredictionUsedAsStarterSource: false,
      blockedReasons,
    },
  };
  const payload = {
    ...withoutHash,
    contentHash: startersSourceIndexContentHash(withoutHash),
  };
  return {
    buildStatus: blockedReasons.length === 0 ? "PASS" : "BLOCKED",
    payload,
    sourceFileCount: sourceFiles.length,
    failedSourceRecords,
    blockReasonCounts,
  };
}

function validateIndexPayload(payload, expected) {
  const failedReasons = [];
  if (payload?.schemaVersion !== INDEX_SCHEMA_VERSION) {
    failedReasons.push("SCHEMA_VERSION_MISMATCH");
  }
  if (payload?.sourceRoot !== SOURCE_ROOT) {
    failedReasons.push("SOURCE_ROOT_MISMATCH");
  }
  if (payload?.sourcePattern !== SOURCE_PATTERN) {
    failedReasons.push("SOURCE_PATTERN_MISMATCH");
  }
  const hashMatched =
    payload?.contentHash === startersSourceIndexContentHash(payload);
  if (!hashMatched) failedReasons.push("CONTENT_HASH_MISMATCH");
  if (JSON.stringify(payload?.summary) !== JSON.stringify(expected.summary)) {
    failedReasons.push("SUMMARY_MISMATCH");
  }
  if (JSON.stringify(payload?.latest) !== JSON.stringify(expected.latest)) {
    failedReasons.push("LATEST_MISMATCH");
  }
  if (JSON.stringify(payload?.sources) !== JSON.stringify(expected.sources)) {
    failedReasons.push("SOURCES_MISMATCH");
  }
  if (JSON.stringify(payload?.quality) !== JSON.stringify(expected.quality)) {
    failedReasons.push("QUALITY_MISMATCH");
  }
  if (payload?.contentHash !== expected.contentHash) {
    failedReasons.push("EXPECTED_CONTENT_HASH_MISMATCH");
  }
  return {
    hashMatched,
    failedReasons: [...new Set(failedReasons)],
  };
}

export async function checkStartersSourceIndex(
  target = DEFAULT_TARGET_PATH,
  root = process.cwd(),
) {
  const targetFile = path.resolve(root, target);
  const targetPath = relativePath(root, targetFile);
  const build = await buildExpectedStartersSourceIndex(root);
  const expected = build.payload;
  const result = {
    checkStatus: "FAIL",
    targetPath,
    sourceRoot: SOURCE_ROOT,
    sourceFileCount: expected.summary.sourceFileCount,
    indexedSourceCount: expected.summary.indexedSourceCount,
    latestDate: expected.latest?.date ?? null,
    latestPath: expected.latest?.path ?? null,
    totalRaceCount: expected.summary.totalRaceCount,
    totalStarterCount: expected.summary.totalStarterCount,
    passSourceCount: expected.summary.passSourceCount,
    failSourceCount: expected.summary.failSourceCount,
    duplicateDateCount: expected.summary.duplicateDateCount,
    duplicatePathCount: expected.summary.duplicatePathCount,
    hashMatched: false,
    failedReasons: [],
  };

  if (build.buildStatus !== "PASS") {
    result.failedReasons.push("EXPECTED_INDEX_BUILD_BLOCKED");
    result.failedReasons.push(...Object.keys(build.blockReasonCounts));
    return result;
  }
  if (!existsSync(targetFile)) {
    result.failedReasons.push("TARGET_FILE_MISSING");
    return result;
  }

  let payload;
  try {
    payload = await readJson(targetFile);
  } catch {
    result.failedReasons.push("TARGET_JSON_PARSE_FAILED");
    return result;
  }
  const validation = validateIndexPayload(payload, expected);
  result.hashMatched = validation.hashMatched;
  result.failedReasons = validation.failedReasons;
  result.checkStatus = result.failedReasons.length === 0 ? "PASS" : "FAIL";
  return result;
}

function printResult(result) {
  console.log("[kurari-ex starters source index check]");
  for (const key of [
    "checkStatus",
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
    "hashMatched",
  ]) {
    console.log(`${key}: ${result[key] ?? null}`);
  }
  console.log(`failedReasons: ${JSON.stringify(result.failedReasons)}`);
}

async function main() {
  const target = process.argv[2] ?? DEFAULT_TARGET_PATH;
  const result = await checkStartersSourceIndex(target);
  printResult(result);
  if (result.checkStatus !== "PASS") process.exitCode = 1;
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  main().catch((error) => {
    console.error("[kurari-ex starters source index check] failed");
    console.error(error);
    process.exitCode = 1;
  });
}
