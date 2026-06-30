import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const TARGET_DATE = "2026-06-29";
const TARGET_MONTH = "2026-06";
const OUTPUT_PATH =
  `public/data/analytics/kurari-ex/history/daily/${TARGET_MONTH}/${TARGET_DATE}.generated.json`;
const EXPECTED_PAYLOAD_HASH =
  "sha256:96a4d2399cf7f57f777170648c9ab8da2f87f20b5bdcc3ed680f2ca6b67d6e2f";
const MAPPING_DRY_RUN_SCRIPT =
  "scripts/audit-kurari-ex-private-raw-history-daily-mapping-dry-run.mjs";

function abs(file) {
  return path.isAbsolute(file) ? file : path.resolve(ROOT, file);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function hashPayload(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function hashBuffer(buffer) {
  return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
}

async function hashFile(file) {
  if (!existsSync(abs(file))) return null;
  return hashBuffer(await readFile(abs(file)));
}

async function loadMappingDryRunInternals() {
  const source = await readFile(abs(MAPPING_DRY_RUN_SCRIPT), "utf8");
  const appended = `${source}

export async function __buildHistoryDailyCandidateForWriter() {
  const blockReasonCounts = {};
  const scan = await privateRawScan(blockReasonCounts);
  const parsedResults = await Promise.all(scan.filesByType.result.map(parseResultFile));
  const parsedPredictions = await Promise.all(scan.filesByType.prediction.map(parsePredictionFile));
  const parsedResultSummary = summarizeParsedResults(parsedResults, blockReasonCounts);
  const parsedPredictionSummary = summarizePredictions(parsedPredictions, blockReasonCounts);
  const startersPayload = await readJson(STARTERS_SOURCE_PATH);
  const startersByKey = new Map(asArray(startersPayload.races).map((race) => [
    \`\${race.date}:\${race.venueName === "蟯宣・" ? "gifu" : Object.entries(VENUE_SLUG_TO_NAME).find(([, name]) => name === race.venueName)?.[0] ?? race.venueName}:\${race.raceNumber}\`,
    { starterCount: race.starterCount },
  ]));
  const candidate = buildCandidatePayload({
    results: parsedResultSummary.races,
    predictions: parsedPredictionSummary.races,
    startersByKey,
  });
  const candidateRaceKeys = candidate.items.map((item) => item.raceKey);
  const duplicateRaceKeyCount = candidateRaceKeys.length - new Set(candidateRaceKeys).size;
  const candidateMissingCoreFieldCounts = {
    raceKey: candidate.items.filter((item) => !item.raceKey).length,
    date: candidate.items.filter((item) => !item.date).length,
    venueName: candidate.items.filter((item) => !item.venueName).length,
    venueKey: candidate.items.filter((item) => !item.venueKey).length,
    raceNumber: candidate.items.filter((item) => !item.raceNumber).length,
    result: candidate.items.filter((item) => !item.result?.trifecta?.combination).length,
  };
  const entrySnapshotRaceCount = await sourceRaceCount(ENTRY_SNAPSHOT_PATH, "raceCount");
  const exactStartersSourceRaceCount = startersPayload.summary?.raceCount ?? asArray(startersPayload.races).length;
  const predictionDailyRaceCount = existsSync(abs(PREDICTION_DAILY_PATH))
    ? await sourceRaceCount(PREDICTION_DAILY_PATH, "raceCount")
    : null;
  return {
    candidate,
    candidatePayloadHash: stableHash(candidate),
    candidateSchemaCompatibility: schemaCompatibility(candidate),
    candidateDuplicateRaceKeyCount: duplicateRaceKeyCount,
    candidateMissingCoreFieldCounts,
    resultRaceCount: parsedResultSummary.resultRaceCount,
    predictionRaceCount: parsedPredictionSummary.predictionRaceCount,
    entrySnapshotRaceCount,
    exactStartersSourceRaceCount,
    predictionDailyRaceCount,
  };
}
`;
  const dataUrl = `data:text/javascript;base64,${Buffer.from(appended, "utf8").toString("base64")}`;
  return import(dataUrl);
}

function validateCandidate(candidate) {
  const items = asArray(candidate.items);
  const missingCoreFieldCounts = {
    raceKey: items.filter((item) => !item.raceKey).length,
    date: items.filter((item) => !item.date).length,
    venueKey: items.filter((item) => !item.venueKey).length,
    venueName: items.filter((item) => !item.venueName).length,
    raceNumber: items.filter((item) => !item.raceNumber).length,
    result: items.filter((item) => !item.result?.trifecta?.combination).length,
    prediction: items.filter((item) => !item.prediction).length,
  };
  const raceKeys = items.map((item) => item.raceKey);
  const duplicateRaceKeyCount = raceKeys.length - new Set(raceKeys).size;
  const noStartersMarkerCount = items.filter((item) => (
    item.starterCount > 0
    && asArray(item.starters).length === 0
    && item.quality?.starterParsed === false
  )).length;
  const registrationNoGeneratedCount = items.reduce((sum, item) => (
    sum + asArray(item.starters).filter((starter) => starter?.registrationNo).length
  ), 0);
  const countsAligned = [
    candidate.raceCount,
    items.length,
    candidate.settledRaceCount,
    candidate.predictionCoverage?.matchedRaceCount,
    noStartersMarkerCount,
  ].every((count) => count === 64);
  return {
    missingCoreFieldCounts,
    duplicateRaceKeyCount,
    noStartersMarkerCount,
    registrationNoGeneratedCount,
    countsAligned,
    schemaCompatibility: (
      candidate.schemaVersion === 1
      && candidate.date === TARGET_DATE
      && candidate.raceCount === 64
      && candidate.settledRaceCount === 64
      && candidate.cancelledRaceCount === 0
      && items.length === 64
      && duplicateRaceKeyCount === 0
      && Object.values(missingCoreFieldCounts).every((count) => count === 0)
      && noStartersMarkerCount === 64
      && registrationNoGeneratedCount === 0
    ) ? "compatible" : "incompatible",
  };
}

function printSection(label, value) {
  console.log(`[${label}]`);
  console.log(JSON.stringify(value, null, 2));
}

export async function writeHistoryDailyFromPrivateRawTargetDate() {
  const outputAbs = abs(OUTPUT_PATH);
  const parentDir = path.dirname(outputAbs);
  const parentDirExists = existsSync(parentDir);
  const outputExistsBefore = existsSync(outputAbs);
  if (!parentDirExists) {
    throw new Error(`output parent directory missing: ${path.relative(ROOT, parentDir)}`);
  }

  const mappingModule = await loadMappingDryRunInternals();
  const candidateResult = await mappingModule.__buildHistoryDailyCandidateForWriter();
  const candidate = candidateResult.candidate;
  const candidatePayloadHash = candidateResult.candidatePayloadHash;
  const directPayloadHash = hashPayload(candidate);
  const payloadHashMatched = (
    candidatePayloadHash === EXPECTED_PAYLOAD_HASH
    && directPayloadHash === EXPECTED_PAYLOAD_HASH
  );
  const candidateValidation = validateCandidate(candidate);
  if (!payloadHashMatched) {
    throw new Error(`candidate payload hash mismatch: ${candidatePayloadHash}`);
  }
  if (candidateValidation.schemaCompatibility !== "compatible") {
    throw new Error("candidate payload is not schema compatible");
  }

  const existingHash = outputExistsBefore ? await hashFile(OUTPUT_PATH) : null;
  let writePerformed = false;
  let noOp = false;
  let writeMode = "create-new-file-only";
  if (outputExistsBefore) {
    const existingPayload = JSON.parse(await readFile(outputAbs, "utf8"));
    const existingPayloadHash = hashPayload(existingPayload);
    if (existingPayloadHash !== EXPECTED_PAYLOAD_HASH) {
      throw new Error(`target already exists with different payload hash: ${existingPayloadHash}`);
    }
    writeMode = "no-overwrite";
    noOp = true;
  } else {
    await writeFile(outputAbs, `${JSON.stringify(candidate, null, 2)}\n`, "utf8");
    writePerformed = true;
  }

  const outputExistsAfter = existsSync(outputAbs);
  const payloadSummary = {
    schemaVersion: candidate.schemaVersion,
    date: candidate.date,
    raceCount: candidate.raceCount,
    itemCount: asArray(candidate.items).length,
    venueCount: new Set(asArray(candidate.items).map((item) => item.venueKey)).size,
    settledRaceCount: candidate.settledRaceCount,
    cancelledRaceCount: candidate.cancelledRaceCount,
    predictionLinkedRaceCount: candidate.predictionCoverage?.matchedRaceCount ?? 0,
    noStartersMarkerCount: candidateValidation.noStartersMarkerCount,
    duplicateRaceKeyCount: candidateValidation.duplicateRaceKeyCount,
    missingCoreFieldCounts: candidateValidation.missingCoreFieldCounts,
  };
  const summary = {
    targetDate: TARGET_DATE,
    outputPath: OUTPUT_PATH,
    outputExistsBefore,
    parentDirExists,
    writeMode,
    writePerformed,
    noOp,
    candidatePayloadHash,
    expectedPayloadHash: EXPECTED_PAYLOAD_HASH,
    payloadHashMatched,
    raceCount: payloadSummary.raceCount,
    venueCount: payloadSummary.venueCount,
    settledRaceCount: payloadSummary.settledRaceCount,
    cancelledRaceCount: payloadSummary.cancelledRaceCount,
    predictionLinkedRaceCount: payloadSummary.predictionLinkedRaceCount,
    noStartersMarkerCount: payloadSummary.noStartersMarkerCount,
    schemaCompatibility: candidateValidation.schemaCompatibility,
    indexUpdated: false,
    fakeCompletionPerformed: false,
    fuzzyMatchingPerformed: false,
    predictionUsedAsResultSource: false,
    startersIdentityGeneratedFromPrediction: false,
  };
  return {
    summary,
    writeSafety: {
      outputPath: OUTPUT_PATH,
      outputExistsBefore,
      outputExistsAfter,
      parentDirExists,
      existingFileByteHashBefore: existingHash,
      overwritePolicy: outputExistsBefore ? "allow-noop-only-if-same-payload-hash" : "create-new-file-only",
      writePerformed,
      noOp,
      indexUpdated: false,
    },
    sourceIntegrity: {
      resultRaceCount: candidateResult.resultRaceCount,
      predictionRaceCount: candidateResult.predictionRaceCount,
      entrySnapshotRaceCount: candidateResult.entrySnapshotRaceCount,
      exactStartersSourceRaceCount: candidateResult.exactStartersSourceRaceCount,
      predictionDailyRaceCount: candidateResult.predictionDailyRaceCount,
      allCountsAligned: [
        candidateResult.resultRaceCount,
        candidateResult.predictionRaceCount,
        candidateResult.entrySnapshotRaceCount,
        candidateResult.exactStartersSourceRaceCount,
        candidateResult.predictionDailyRaceCount,
        payloadSummary.raceCount,
      ].every((count) => count === 64),
    },
    payloadSummary,
    jsonSummary: {
      targetDate: TARGET_DATE,
      outputPath: OUTPUT_PATH,
      writePerformed,
      noOp,
      payloadHashMatched,
      raceCount: payloadSummary.raceCount,
      checkNext: "node scripts/check-kurari-ex-history-daily-target-date.mjs",
    },
  };
}

async function main() {
  const result = await writeHistoryDailyFromPrivateRawTargetDate();
  printSection("summary", result.summary);
  printSection("writeSafety", result.writeSafety);
  printSection("sourceIntegrity", result.sourceIntegrity);
  printSection("payloadSummary", result.payloadSummary);
  printSection("jsonSummary", result.jsonSummary);
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  main().catch((error) => {
    console.error("[kurari-ex history daily target-date writer] failed");
    console.error(error);
    process.exitCode = 1;
  });
}
