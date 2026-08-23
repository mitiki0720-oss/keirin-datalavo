import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

function getArgValue(args, name, fallback = "") {
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(name);
  if (index >= 0 && index + 1 < args.length) return args[index + 1];
  return fallback;
}

async function readJson(file) {
  return JSON.parse(String(await readFile(file, "utf8")).replace(/^\uFEFF/u, ""));
}

function roughlyEqual(left, right) {
  if (left == null && right == null) return true;
  return Math.abs(Number(left) - Number(right)) < 0.000001;
}

function bucketProfit(bucket) {
  return Number(bucket?.plannedReturnYen ?? 0) - Number(bucket?.plannedStakeYen ?? 0);
}

function validateBucket(bucket, prefix, errors) {
  if (!bucket) return;
  if (Number(bucket.plannedProfitYen) !== bucketProfit(bucket)) {
    errors.push(`${prefix}.plannedProfitYen mismatch`);
  }
  const expectedHitRate = Number(bucket.evaluableRaceCount) > 0
    ? Number(bucket.plannedHitCount) / Number(bucket.evaluableRaceCount)
    : null;
  if (!roughlyEqual(bucket.plannedHitRate, expectedHitRate)) {
    errors.push(`${prefix}.plannedHitRate mismatch`);
  }
  const expectedRoi = Number(bucket.plannedStakeYen) > 0
    ? (Number(bucket.plannedReturnYen) / Number(bucket.plannedStakeYen)) * 100
    : null;
  if (!roughlyEqual(bucket.plannedRoiPercent, expectedRoi)) {
    errors.push(`${prefix}.plannedRoiPercent mismatch`);
  }
}

function validateArtifact(artifact) {
  const errors = [];
  if (artifact?.schemaVersion !== 1) errors.push("schemaVersion mismatch");
  if (artifact?.version !== "kurari-ex-prediction-performance/v1") errors.push("version mismatch");
  if (artifact?.preRaceSource?.sourceOfTruth !== "preRaceSnapshot.ticketSnapshot.betPlan") {
    errors.push("preRace source of truth mismatch");
  }
  if (artifact?.join?.method !== "exact") errors.push("join method must be exact");
  if (artifact?.join?.fuzzyVenueMatching !== false) errors.push("fuzzy venue matching must be false");
  if (artifact?.roiDefinition?.actualRoi !== "unavailable") errors.push("actual ROI must be unavailable");
  const records = Array.isArray(artifact?.records) ? artifact.records : [];
  if (!Array.isArray(artifact?.records)) errors.push("records must be an array");
  const seenRaceKeys = new Set();
  const summary = {
    predictionRaceCount: records.length,
    preRaceSnapshotCount: 0,
    structuredBetPlanCount: 0,
    resultAvailableCount: 0,
    exactJoinedCount: 0,
    plannedRoiEvaluableCount: 0,
    plannedHitCount: 0,
    plannedStakeYen: 0,
    plannedReturnYen: 0,
    purchaseMissCount: 0,
    shadowRescueCount: 0,
  };
  const excludedReasonCounts = {};

  for (const [index, record] of records.entries()) {
    const prefix = `records[${index}]`;
    const raceKey = String(record?.raceKey ?? "");
    if (raceKey) {
      if (seenRaceKeys.has(raceKey)) errors.push(`${prefix}.raceKey duplicate`);
      seenRaceKeys.add(raceKey);
    }
    if (record?.evaluationStatus !== "not-evaluable-missing-pre-race-snapshot") summary.preRaceSnapshotCount += 1;
    if (record?.structuredPurchaseCount > 0 && record?.evaluationStatus !== "not-evaluable-no-structured-bet-plan") {
      summary.structuredBetPlanCount += 1;
    }
    if (record?.resultSource) summary.resultAvailableCount += 1;
    if (record?.resultSource?.confirmed) summary.exactJoinedCount += 1;
    if (record?.excludedReason) excludedReasonCounts[record.excludedReason] = (excludedReasonCounts[record.excludedReason] ?? 0) + 1;
    if (record?.actualRoiEvaluable !== false) errors.push(`${prefix}.actualRoiEvaluable must be false`);
    if (record?.evaluationStatus === "evaluable-planned-trifecta") {
      summary.plannedRoiEvaluableCount += 1;
      summary.plannedHitCount += record.plannedHit ? 1 : 0;
      summary.plannedStakeYen += Number(record.plannedStakeYen ?? 0);
      summary.plannedReturnYen += Number(record.plannedReturnYen ?? 0);
      if (!record.plannedHit) summary.purchaseMissCount += 1;
      if (record.shadowRescue) summary.shadowRescueCount += 1;
      const expectedStake = Number(record.purchaseTrifectaCount ?? 0) * Number(record.unitStakeYen ?? 100);
      if (Number(record.plannedStakeYen) !== expectedStake) errors.push(`${prefix}.plannedStakeYen mismatch`);
      if (Number(record.plannedProfitYen) !== Number(record.plannedReturnYen) - Number(record.plannedStakeYen)) {
        errors.push(`${prefix}.plannedProfitYen mismatch`);
      }
      const winning = new Set((Array.isArray(record.winningCombinations) ? record.winningCombinations : []).map((item) => item.combination));
      for (const hit of Array.isArray(record.hitCombinations) ? record.hitCombinations : []) {
        if (!winning.has(hit.combination)) errors.push(`${prefix}.hitCombinations contains non-winning combination`);
      }
      if (record.shadowRescue && record.plannedHit) errors.push(`${prefix}.shadowRescue cannot be true on planned hit`);
      if (record.shadowRescue && Number(record.plannedReturnYen) !== 0) {
        errors.push(`${prefix}.shadowRescue must not add plannedReturnYen`);
      }
      if (!record.resultProvenance) errors.push(`${prefix}.resultProvenance missing`);
    }
    if (record?.pointRangeAction === "SKIP" && Number(record.plannedStakeYen ?? 0) === 0 && record?.evaluationStatus === "evaluable-planned-trifecta") {
      errors.push(`${prefix}.SKIP evaluable race must not have zero-stake division issue`);
    }
  }

  const actual = artifact.summary ?? {};
  for (const [key, value] of Object.entries(summary)) {
    if (Number(actual[key] ?? 0) !== value) errors.push(`summary.${key} mismatch`);
  }
  const expectedProfit = summary.plannedReturnYen - summary.plannedStakeYen;
  if (Number(actual.plannedProfitYen ?? 0) !== expectedProfit) errors.push("summary.plannedProfitYen mismatch");
  const expectedHitRate = summary.plannedRoiEvaluableCount > 0
    ? summary.plannedHitCount / summary.plannedRoiEvaluableCount
    : null;
  if (!roughlyEqual(actual.plannedHitRate, expectedHitRate)) errors.push("summary.plannedHitRate mismatch");
  const expectedRoi = summary.plannedStakeYen > 0
    ? (summary.plannedReturnYen / summary.plannedStakeYen) * 100
    : null;
  if (!roughlyEqual(actual.plannedRoiPercent, expectedRoi)) errors.push("summary.plannedRoiPercent mismatch");
  const expectedShadowRate = summary.purchaseMissCount > 0
    ? summary.shadowRescueCount / summary.purchaseMissCount
    : null;
  if (!roughlyEqual(actual.shadowRescueRate, expectedShadowRate)) errors.push("summary.shadowRescueRate mismatch");
  if (Number(actual.actualRoiEvaluableCount ?? 0) !== 0) errors.push("summary.actualRoiEvaluableCount must be 0");
  for (const [key, value] of Object.entries(excludedReasonCounts)) {
    if (Number(artifact.excludedReasonCounts?.[key] ?? 0) !== value) errors.push(`excludedReasonCounts.${key} mismatch`);
  }
  for (const [name, buckets] of Object.entries({
    byRisk: artifact.byRisk,
    byPointRange: artifact.byPointRange,
    byRecommendation: artifact.byRecommendation,
    byPurchaseDerivedHeadCount: artifact.byPurchaseDerivedHeadCount,
    byFailureUsage: artifact.byFailureUsage,
    bySignal: artifact.bySignal,
  })) {
    for (const [key, bucket] of Object.entries(buckets ?? {})) {
      validateBucket(bucket, `${name}.${key}`, errors);
    }
  }
  return errors;
}

export async function checkPredictionPerformance(file) {
  const artifact = await readJson(file);
  const errors = validateArtifact(artifact);
  return { artifact, errors };
}

async function main() {
  const args = process.argv.slice(2);
  const file = path.resolve(getArgValue(args, "--file") || args.find((arg) => !arg.startsWith("--")) || "");
  if (!file) throw new Error("--file is required");
  const { artifact, errors } = await checkPredictionPerformance(file);
  console.log("[kurari ex prediction performance check]");
  console.log(`file: ${file}`);
  console.log(`records: ${artifact.records?.length ?? 0}`);
  console.log(`plannedRoiEvaluableCount: ${artifact.summary?.plannedRoiEvaluableCount ?? 0}`);
  console.log(`actualRoiEvaluableCount: ${artifact.summary?.actualRoiEvaluableCount ?? 0}`);
  if (errors.length > 0) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exitCode = 2;
  } else {
    console.log("status: PASS");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("[kurari ex prediction performance check] failed");
    console.error(error);
    process.exitCode = 1;
  });
}
