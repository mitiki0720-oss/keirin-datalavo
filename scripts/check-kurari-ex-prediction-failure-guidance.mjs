import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const GUIDANCE_PATH = path.join(ROOT, "public/data/analytics/kurari-ex/prediction-failure-guidance/index.generated.json");
const SOURCE_PATH = path.join(ROOT, "public/data/analytics/kurari-ex/prediction-failure/index.generated.json");
const EXPECTED_SOURCE_ARTIFACT = "/data/analytics/kurari-ex/prediction-failure/index.generated.json";
const EXPECTED_VERSION = "kurari-ex-prediction-failure-guidance/v1";
const EXPECTED_SOURCE_VERSION = "kurari-ex-prediction-failure/v1";
const STRONG_HEAD = "HEAD_STRUCTURE_CAUTION";
const STRONG_THIRD = "PROTECT_SECOND_THIRD";

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/u.test(String(value ?? ""));
}

function dayDiff(from, to) {
  const fromTime = Date.parse(`${from}T00:00:00Z`);
  const toTime = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(fromTime) || !Number.isFinite(toTime)) return null;
  return Math.round((toTime - fromTime) / 86400000);
}

function expectedFreshness(historicalTo, targetDate) {
  const rawDiff = dayDiff(historicalTo, targetDate);
  const lagDays = rawDiff == null ? null : Math.max(0, rawDiff - 1);
  const status = lagDays == null ? "unknown" : lagDays <= 1 ? "fresh" : lagDays <= 7 ? "reference" : "stale";
  const preRaceUsage = status === "fresh" ? "allowed" : status === "reference" ? "reference_only" : "prohibited";
  return { lagDays, status, preRaceUsage };
}

function isRate(value) {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1);
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function hasStrongGuidance(context) {
  return context?.headGuidance === STRONG_HEAD || context?.thirdProtectionGuidance === STRONG_THIRD;
}

function collectContexts(guidance) {
  return [
    guidance.global,
    ...(Array.isArray(guidance.byVenue) ? guidance.byVenue : []),
    ...(Array.isArray(guidance.byRaceNo) ? guidance.byRaceNo : []),
    ...(Array.isArray(guidance.byVenueRaceNo) ? guidance.byVenueRaceNo : []),
  ].filter(Boolean);
}

function validateContext(context, failures, seenKeys) {
  const uniqueKey = `${context.contextType}:${context.key}`;
  if (seenKeys.has(uniqueKey)) failures.push(`duplicate context key: ${uniqueKey}`);
  seenKeys.add(uniqueKey);

  for (const field of [
    "sampleCount",
    "classifiableCount",
    "unclassifiableCount",
    "exactHitCount",
    "headMissCount",
    "correctTop2PairCount",
    "thirdPlaceMissCount",
    "thirdPlaceShadowDropCount",
  ]) {
    if (!isNonNegativeInteger(context[field])) failures.push(`${uniqueKey}.${field} must be non-negative integer`);
  }
  if (context.classifiableCount > context.sampleCount) failures.push(`${uniqueKey}: classifiableCount exceeds sampleCount`);
  if (context.correctTop2PairCount > context.classifiableCount) failures.push(`${uniqueKey}: correctTop2PairCount exceeds classifiableCount`);
  if (context.thirdPlaceMissCount + context.thirdPlaceShadowDropCount > context.correctTop2PairCount) {
    failures.push(`${uniqueKey}: thirdPlace miss counts exceed correctTop2PairCount`);
  }
  for (const field of ["exactHitRate", "headMissRate", "thirdPlaceMissRateAmongCorrectTop2", "thirdProtectionRate"]) {
    if (!isRate(context[field])) failures.push(`${uniqueKey}.${field} must be null or 0..1`);
  }
  if (context.sampleStatus === "low_sample" && hasStrongGuidance(context)) {
    failures.push(`${uniqueKey}: low_sample context used as strong signal`);
  }
  if (context.sampleStatus === "reference" && hasStrongGuidance(context)) {
    failures.push(`${uniqueKey}: reference context used as strong signal`);
  }
  if (context.contextType === "venueRaceNo" && hasStrongGuidance(context)) {
    failures.push(`${uniqueKey}: venueRaceNo used as strong signal`);
  }
  if (context.structureGuidance?.specificRiderSelectionAllowed !== false) {
    failures.push(`${uniqueKey}: specific rider selection is not false`);
  }
  if (context.structureGuidance?.pointRangeAutoPromotionAllowed !== false) {
    failures.push(`${uniqueKey}: point range auto promotion is not false`);
  }
  if (context.structureGuidance?.raceRiskScoreMutationAllowed !== false) {
    failures.push(`${uniqueKey}: race risk score mutation is not false`);
  }
}

function main() {
  const failures = [];
  const guidance = readJson(GUIDANCE_PATH);
  const source = readJson(SOURCE_PATH);

  if (guidance.version !== EXPECTED_VERSION) failures.push(`unexpected version: ${guidance.version}`);
  if (!isDate(guidance.targetDate)) failures.push("targetDate must be YYYY-MM-DD");
  if (!isDate(guidance.historicalFrom)) failures.push("historicalFrom must be YYYY-MM-DD");
  if (!isDate(guidance.historicalTo)) failures.push("historicalTo must be YYYY-MM-DD");
  if (isDate(guidance.historicalTo) && isDate(guidance.targetDate) && !(guidance.historicalTo < guidance.targetDate)) {
    failures.push("historicalTo must be before targetDate");
  }

  if (guidance.source?.artifact !== EXPECTED_SOURCE_ARTIFACT) failures.push("source artifact path mismatch");
  if (guidance.source?.version !== EXPECTED_SOURCE_VERSION) failures.push("source version mismatch");
  for (const field of ["targetDate", "historicalFrom", "historicalTo", "raceCount", "classifiableRaceCount"]) {
    if (guidance.source?.[field] !== source[field]) failures.push(`source metadata mismatch: ${field}`);
  }

  const freshness = expectedFreshness(guidance.historicalTo, guidance.targetDate);
  if (guidance.freshness?.lagDays !== freshness.lagDays) failures.push("freshness lagDays mismatch");
  if (guidance.freshness?.status !== freshness.status) failures.push("freshness status mismatch");
  if (guidance.freshness?.preRaceUsage !== freshness.preRaceUsage) failures.push("freshness preRaceUsage mismatch");

  const policy = guidance.policy ?? {};
  for (const [field, expected] of Object.entries({
    specificRiderSelectionAllowed: false,
    raceRiskScoreMutationAllowed: false,
    pointRangeAutoPromotionAllowed: false,
    counterfactualPointRangeAllowed: false,
    currentDayResultAllowed: false,
  })) {
    if (policy[field] !== expected) failures.push(`policy.${field} must be ${expected}`);
  }

  const guard = guidance.leakageGuard ?? {};
  for (const field of [
    "currentDayResultUsed",
    "futureResultUsed",
    "fakeCompletionUsed",
    "fuzzyMatchingUsed",
    "resultBackfilledPrediction",
    "failureGuidanceUsedToSelectSpecificRider",
    "lowSampleContextUsedAsStrongSignal",
    "referenceContextUsedAsStrongSignal",
    "staleArtifactUsedAsStrongSignal",
    "venueRaceNoUsedAsStrongSignal",
  ]) {
    if (guard[field] !== false) failures.push(`leakageGuard.${field} must be false`);
  }
  if (guard.historicalToBeforeTargetDate !== true) failures.push("leakageGuard.historicalToBeforeTargetDate must be true");
  if (guard.sourceFailureHistoricalToBeforeTargetDate !== true) failures.push("leakageGuard.sourceFailureHistoricalToBeforeTargetDate must be true");

  const contexts = collectContexts(guidance);
  const seenKeys = new Set();
  for (const context of contexts) validateContext(context, failures, seenKeys);
  if (guidance.freshness?.status === "stale" && contexts.some(hasStrongGuidance)) {
    failures.push("stale artifact used as strong signal");
  }

  const summary = guidance.contextSummary ?? {};
  if (summary.globalCount !== 1) failures.push("contextSummary.globalCount must be 1");
  if (summary.venueCount !== (guidance.byVenue ?? []).length) failures.push("contextSummary.venueCount mismatch");
  if (summary.raceNoCount !== (guidance.byRaceNo ?? []).length) failures.push("contextSummary.raceNoCount mismatch");
  if (summary.venueRaceNoCount !== (guidance.byVenueRaceNo ?? []).length) failures.push("contextSummary.venueRaceNoCount mismatch");

  console.log("[kurari-ex-prediction-failure-guidance-check]");
  console.log("targetDate:", guidance.targetDate);
  console.log("historical:", `${guidance.historicalFrom}..${guidance.historicalTo}`);
  console.log("freshness:", JSON.stringify(guidance.freshness));
  console.log("contexts:", JSON.stringify({
    global: summary.globalCount,
    venue: summary.venueCount,
    raceNo: summary.raceNoCount,
    venueRaceNo: summary.venueRaceNoCount,
  }));
  console.log("sampleStatusCounts:", JSON.stringify(summary.sampleStatusCounts ?? {}));
  console.log("guidanceCounts:", JSON.stringify(summary.guidanceCounts ?? {}));
  console.log("strongContexts:", JSON.stringify((summary.strongContexts ?? []).slice(0, 20)));
  console.log("issues:", failures.length);

  if (failures.length) {
    for (const failure of failures) console.error(`ERROR: ${failure}`);
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error("[kurari-ex-prediction-failure-guidance-check] failed:", error);
  process.exitCode = 1;
}
