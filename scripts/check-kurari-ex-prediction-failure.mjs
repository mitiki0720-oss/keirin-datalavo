import { readFile } from "node:fs/promises";
import {
  POINT_RANGES,
  PRIMARY_CLASSES,
  classToSummaryKey,
  isAllowedReviewSourcePath,
  outputPath,
} from "./kurari-ex/prediction-failure-common.mjs";

function pushIssue(issues, message) {
  issues.push(message);
}

function pointBucket(record) {
  return record.explicitPointRange === null ? "unknown" : String(record.explicitPointRange);
}

function assertPrimaryClassInvariant(record, issues) {
  if (record.primaryClass === "EXACT_HIT" && (!record.correctTop2PairCovered || !record.actualThirdCoveredForCorrectTop2)) {
    pushIssue(issues, `${record.key}: EXACT_HIT invariant failed`);
  }
  if (
    record.primaryClass === "THIRD_PLACE_SHADOW_DROP"
    && (
      record.correctTop2PairCovered !== true
      || record.actualThirdCoveredForCorrectTop2 !== false
      || record.shadowAvailability !== "observed"
      || record.shadowExactCovered !== true
    )
  ) pushIssue(issues, `${record.key}: THIRD_PLACE_SHADOW_DROP invariant failed`);
  if (
    record.primaryClass === "SHADOW_ONLY_HIT"
    && (
      record.shadowAvailability !== "observed"
      || record.shadowExactCovered !== true
      || record.correctTop2PairCovered === true
    )
  ) pushIssue(issues, `${record.key}: SHADOW_ONLY_HIT invariant failed`);
  if (record.primaryClass === "THIRD_PLACE_MISS" && (record.correctTop2PairCovered !== true || record.actualThirdCoveredForCorrectTop2 !== false)) {
    pushIssue(issues, `${record.key}: THIRD_PLACE_MISS invariant failed`);
  }
  if (record.primaryClass === "HEAD_MISS" && record.actualWinnerCovered !== false) {
    pushIssue(issues, `${record.key}: HEAD_MISS invariant failed`);
  }
  if (record.primaryClass === "TOP3_ORDER_MISS" && (record.actualWinnerCovered !== true || record.actualTop3PermutationCovered !== true)) {
    pushIssue(issues, `${record.key}: TOP3_ORDER_MISS invariant failed`);
  }
}

function checkArtifact(artifact) {
  const issues = [];
  const seen = new Set();
  const summary = Object.fromEntries(PRIMARY_CLASSES.map((key) => [classToSummaryKey(key), 0]));
  const byPointRange = Object.fromEntries(["8", "10", "12", "14", "unknown"].map((key) => [key, 0]));
  let correctTop2PairCount = 0;
  let protectedThirdCount = 0;
  let thirdPlaceMissCount = 0;
  let thirdPlaceShadowDropCount = 0;
  let fakeCompletionUsed = false;
  let fuzzyMatchingUsed = false;
  let resultBackfilledPrediction = false;
  let shadowGeneratedFromResult = false;

  if (!(artifact.historicalTo < artifact.targetDate)) {
    pushIssue(issues, `historicalTo must be before targetDate: ${artifact.historicalTo} >= ${artifact.targetDate}`);
  }
  if (artifact.duplicateRaceKeys?.length > 0) pushIssue(issues, `duplicateRaceKeys not empty: ${artifact.duplicateRaceKeys.join(", ")}`);
  if (!Array.isArray(artifact.records)) pushIssue(issues, "records is not an array");

  for (const record of artifact.records ?? []) {
    if (seen.has(record.key)) pushIssue(issues, `duplicate race key: ${record.key}`);
    seen.add(record.key);
    if (record.date > artifact.historicalTo) pushIssue(issues, `${record.key}: date after historicalTo`);
    if (record.date >= artifact.targetDate) pushIssue(issues, `${record.key}: current/future result leakage`);
    if (!PRIMARY_CLASSES.includes(record.primaryClass)) pushIssue(issues, `${record.key}: invalid primaryClass`);
    if (record.explicitPointRange !== null && !POINT_RANGES.includes(record.explicitPointRange)) {
      pushIssue(issues, `${record.key}: invalid explicitPointRange`);
    }
    for (const field of ["purchaseTicketCount", "shadowTicketCount", "declaredHeadCandidateCount", "observedPurchaseHeadCount", "correctTop2ThirdCandidateCount"]) {
      if (!Number.isFinite(record[field]) || record[field] < 0) pushIssue(issues, `${record.key}: invalid ${field}`);
    }
    if (record.shadowAvailability === "unavailable" && ["THIRD_PLACE_SHADOW_DROP", "SHADOW_ONLY_HIT"].includes(record.primaryClass)) {
      pushIssue(issues, `${record.key}: unavailable shadow cannot classify as shadow hit`);
    }
    if (!isAllowedReviewSourcePath(record.predictionSource)) pushIssue(issues, `${record.key}: invalid predictionSource ${record.predictionSource}`);
    if (!isAllowedReviewSourcePath(record.resultSource)) pushIssue(issues, `${record.key}: invalid resultSource ${record.resultSource}`);
    if (record.sourceStatus?.fakeCompletionUsed) fakeCompletionUsed = true;
    if (record.sourceStatus?.fuzzyMatchingUsed) fuzzyMatchingUsed = true;
    if (record.sourceStatus?.resultBackfilledPrediction) resultBackfilledPrediction = true;
    if (record.sourceStatus?.shadowGeneratedFromResult) shadowGeneratedFromResult = true;
    summary[classToSummaryKey(record.primaryClass)] += 1;
    byPointRange[pointBucket(record)] += 1;
    if (record.correctTop2PairCovered) {
      correctTop2PairCount += 1;
      if (record.actualThirdCoveredForCorrectTop2) protectedThirdCount += 1;
    }
    if (record.primaryClass === "THIRD_PLACE_MISS") thirdPlaceMissCount += 1;
    if (record.primaryClass === "THIRD_PLACE_SHADOW_DROP") thirdPlaceShadowDropCount += 1;
    assertPrimaryClassInvariant(record, issues);
  }

  const summaryTotal = Object.values(summary).reduce((sum, value) => sum + value, 0);
  if (summaryTotal !== artifact.raceCount) pushIssue(issues, `summary total ${summaryTotal} != raceCount ${artifact.raceCount}`);
  if ((artifact.records?.length ?? 0) !== artifact.raceCount) pushIssue(issues, `records length ${artifact.records?.length} != raceCount ${artifact.raceCount}`);
  if (artifact.classifiableRaceCount !== artifact.raceCount - summary.unclassifiable) pushIssue(issues, "classifiableRaceCount mismatch");
  for (const [key, count] of Object.entries(byPointRange)) {
    if (artifact.byPointRange?.[key]?.raceCount !== count) pushIssue(issues, `byPointRange ${key} count mismatch`);
  }
  if (artifact.thirdPlaceProtection?.correctTop2PairCount !== correctTop2PairCount) pushIssue(issues, "thirdPlaceProtection correctTop2PairCount mismatch");
  if (artifact.thirdPlaceProtection?.thirdPlaceMissCount !== thirdPlaceMissCount) pushIssue(issues, "thirdPlaceProtection thirdPlaceMissCount mismatch");
  if (artifact.thirdPlaceProtection?.thirdPlaceShadowDropCount !== thirdPlaceShadowDropCount) pushIssue(issues, "thirdPlaceProtection thirdPlaceShadowDropCount mismatch");
  const expectedRate = correctTop2PairCount === 0 ? null : Number((protectedThirdCount / correctTop2PairCount).toFixed(4));
  if (artifact.thirdPlaceProtection?.thirdProtectionRate !== expectedRate) pushIssue(issues, "thirdPlaceProtection rate mismatch");
  if (artifact.leakageGuard?.currentOrFutureResultUsed !== false) pushIssue(issues, "leakageGuard currentOrFutureResultUsed must be false");
  if (artifact.sourcePolicy?.fakeCompletionUsed || fakeCompletionUsed) pushIssue(issues, "fakeCompletionUsed must be false");
  if (artifact.sourcePolicy?.fuzzyMatchingUsed || fuzzyMatchingUsed) pushIssue(issues, "fuzzyMatchingUsed must be false");
  if (artifact.sourcePolicy?.resultBackfilledPrediction || resultBackfilledPrediction) pushIssue(issues, "resultBackfilledPrediction must be false");
  if (artifact.sourcePolicy?.shadowGeneratedFromResult || shadowGeneratedFromResult) pushIssue(issues, "shadowGeneratedFromResult must be false");
  return { issues, summary, byPointRange };
}

async function main() {
  const artifact = JSON.parse(await readFile(outputPath, "utf8"));
  const result = checkArtifact(artifact);
  console.log("[kurari-ex-prediction-failure-check] file:", outputPath);
  console.log("[kurari-ex-prediction-failure-check] targetDate:", artifact.targetDate);
  console.log("[kurari-ex-prediction-failure-check] historical:", `${artifact.historicalFrom}..${artifact.historicalTo}`);
  console.log("[kurari-ex-prediction-failure-check] raceCount:", artifact.raceCount);
  console.log("[kurari-ex-prediction-failure-check] classifiableRaceCount:", artifact.classifiableRaceCount);
  console.log("[kurari-ex-prediction-failure-check] summary:", JSON.stringify(result.summary));
  console.log("[kurari-ex-prediction-failure-check] byPointRangeCounts:", JSON.stringify(result.byPointRange));
  console.log("[kurari-ex-prediction-failure-check] sourceCoverage:", JSON.stringify(artifact.sourceCoverage));
  console.log("[kurari-ex-prediction-failure-check] thirdPlaceProtection:", JSON.stringify(artifact.thirdPlaceProtection));
  console.log("[kurari-ex-prediction-failure-check] issues:", result.issues.length);
  for (const issue of result.issues.slice(0, 50)) console.error(" -", issue);
  if (result.issues.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("[kurari-ex-prediction-failure-check] failed:", error);
  process.exitCode = 1;
});
