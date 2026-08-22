import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const VERSION = "kurari-ex-prediction-failure-guidance/v1";
const SOURCE_PUBLIC_PATH = "/data/analytics/kurari-ex/prediction-failure/index.generated.json";
const SOURCE_PATH = path.join(ROOT, "public/data/analytics/kurari-ex/prediction-failure/index.generated.json");
const OUTPUT_PATH = path.join(ROOT, "public/data/analytics/kurari-ex/prediction-failure-guidance/index.generated.json");

const PRIMARY_CLASSES = [
  "EXACT_HIT",
  "THIRD_PLACE_SHADOW_DROP",
  "THIRD_PLACE_MISS",
  "HEAD_MISS",
  "TOP3_ORDER_MISS",
  "OTHER_STRUCTURE_MISS",
  "SHADOW_ONLY_HIT",
  "UNCLASSIFIABLE",
];

function formatJstDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function getArgValue(args, key, fallback = null) {
  const index = args.indexOf(key);
  return index >= 0 ? args[index + 1] ?? fallback : fallback;
}

function assertDate(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(String(value ?? ""))) {
    throw new Error(`${label} must be YYYY-MM-DD`);
  }
  return String(value);
}

function dayDiff(from, to) {
  const fromTime = Date.parse(`${from}T00:00:00Z`);
  const toTime = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(fromTime) || !Number.isFinite(toTime)) return null;
  return Math.round((toTime - fromTime) / 86400000);
}

function roundRate(value) {
  return value == null || !Number.isFinite(value) ? null : Number(value.toFixed(4));
}

function rate(count, denominator) {
  return denominator > 0 ? roundRate(count / denominator) : null;
}

function classField(primaryClass) {
  return ({
    EXACT_HIT: "exactHitCount",
    THIRD_PLACE_SHADOW_DROP: "thirdPlaceShadowDropCount",
    THIRD_PLACE_MISS: "thirdPlaceMissCount",
    HEAD_MISS: "headMissCount",
    TOP3_ORDER_MISS: "top3OrderMissCount",
    OTHER_STRUCTURE_MISS: "otherMissCount",
    SHADOW_ONLY_HIT: "shadowOnlyHitCount",
    UNCLASSIFIABLE: "unclassifiableCount",
  })[primaryClass];
}

function createAccumulator(key, label, contextType) {
  return {
    key,
    label,
    contextType,
    sampleCount: 0,
    classifiableCount: 0,
    unclassifiableCount: 0,
    exactHitCount: 0,
    headMissCount: 0,
    correctTop2PairCount: 0,
    thirdPlaceMissCount: 0,
    thirdPlaceShadowDropCount: 0,
    shadowOnlyHitCount: 0,
    top3OrderMissCount: 0,
    otherMissCount: 0,
  };
}

function addRecord(accumulator, record) {
  accumulator.sampleCount += 1;
  const primaryClass = PRIMARY_CLASSES.includes(record.primaryClass) ? record.primaryClass : "UNCLASSIFIABLE";
  const classifiable = Boolean(record.sourceStatus?.classifiable) && primaryClass !== "UNCLASSIFIABLE";
  if (classifiable) accumulator.classifiableCount += 1;
  const field = classField(primaryClass);
  if (field) accumulator[field] += 1;
  if (record.correctTop2PairCovered) accumulator.correctTop2PairCount += 1;
}

function sampleStatusFor(contextType, classifiableCount) {
  if (contextType === "global") return "usable";
  if (contextType === "venueRaceNo") return classifiableCount >= 10 ? "reference" : "low_sample";
  if (classifiableCount >= 30) return "usable";
  if (classifiableCount >= 10) return "reference";
  return "low_sample";
}

function freshnessFor(sourceHistoricalTo, targetDate) {
  if (!(sourceHistoricalTo < targetDate)) {
    throw new Error(`source historicalTo must be before targetDate: ${sourceHistoricalTo} >= ${targetDate}`);
  }
  const rawDiff = dayDiff(sourceHistoricalTo, targetDate);
  const lagDays = rawDiff == null ? null : Math.max(0, rawDiff - 1);
  const status = lagDays == null ? "unknown" : lagDays <= 1 ? "fresh" : lagDays <= 7 ? "reference" : "stale";
  const preRaceUsage = status === "fresh" ? "allowed" : status === "reference" ? "reference_only" : "prohibited";
  return { lagDays, status, preRaceUsage };
}

function finalize(accumulator, { globalContext, freshness }) {
  const sampleStatus = sampleStatusFor(accumulator.contextType, accumulator.classifiableCount);
  const thirdPlaceMissLike = accumulator.thirdPlaceMissCount + accumulator.thirdPlaceShadowDropCount;
  const thirdPlaceMissRateAmongCorrectTop2 = rate(thirdPlaceMissLike, accumulator.correctTop2PairCount);
  const thirdProtectionRate = thirdPlaceMissRateAmongCorrectTop2 == null
    ? null
    : roundRate(1 - thirdPlaceMissRateAmongCorrectTop2);
  const exactHitRate = rate(accumulator.exactHitCount, accumulator.classifiableCount);
  const headMissRate = rate(accumulator.headMissCount, accumulator.classifiableCount);
  const strongAllowed =
    accumulator.contextType !== "venueRaceNo" &&
    sampleStatus === "usable" &&
    freshness.status === "fresh";
  const headStrong =
    strongAllowed &&
    accumulator.classifiableCount >= 30 &&
    headMissRate != null &&
    globalContext.headMissRate != null &&
    headMissRate >= globalContext.headMissRate + 0.05;
  const thirdStrong =
    strongAllowed &&
    accumulator.correctTop2PairCount >= 20 &&
    thirdProtectionRate != null &&
    globalContext.thirdProtectionRate != null &&
    thirdProtectionRate <= globalContext.thirdProtectionRate - 0.10;

  const nonStrongGuidance = () => {
    if (freshness.status === "stale") return "STALE";
    if (sampleStatus === "low_sample") return "LOW_SAMPLE";
    if (sampleStatus === "reference" || freshness.status === "reference") return "REFERENCE";
    return "NORMAL";
  };
  const fallbackGuidance = nonStrongGuidance();
  const headGuidance = headStrong ? "HEAD_STRUCTURE_CAUTION" : fallbackGuidance;
  const thirdProtectionGuidance = thirdStrong ? "PROTECT_SECOND_THIRD" : fallbackGuidance;

  return {
    key: accumulator.key,
    label: accumulator.label,
    contextType: accumulator.contextType,
    sampleStatus,
    sampleCount: accumulator.sampleCount,
    classifiableCount: accumulator.classifiableCount,
    unclassifiableCount: accumulator.unclassifiableCount,
    exactHitCount: accumulator.exactHitCount,
    headMissCount: accumulator.headMissCount,
    correctTop2PairCount: accumulator.correctTop2PairCount,
    thirdPlaceMissCount: accumulator.thirdPlaceMissCount,
    thirdPlaceShadowDropCount: accumulator.thirdPlaceShadowDropCount,
    exactHitRate,
    headMissRate,
    thirdPlaceMissRateAmongCorrectTop2,
    thirdProtectionRate,
    headGuidance,
    thirdProtectionGuidance,
    structureGuidance: {
      head: headGuidance,
      thirdProtection: thirdProtectionGuidance,
      usage: headStrong || thirdStrong ? "supplemental-only" : sampleStatus === "usable" ? "baseline-reference" : sampleStatus,
      specificRiderSelectionAllowed: false,
      pointRangeAutoPromotionAllowed: false,
      raceRiskScoreMutationAllowed: false,
    },
  };
}

function splitRaceKey(key) {
  const [date, venueSlug, raceNo] = String(key ?? "").split("|");
  return { date, venueSlug, raceNo };
}

function contextSort(left, right) {
  return right.classifiableCount - left.classifiableCount || String(left.key).localeCompare(String(right.key), "ja");
}

function guidanceCounts(contexts) {
  const counts = {};
  for (const context of contexts) {
    counts[context.headGuidance] = (counts[context.headGuidance] ?? 0) + 1;
    counts[context.thirdProtectionGuidance] = (counts[context.thirdProtectionGuidance] ?? 0) + 1;
  }
  return counts;
}

function sampleStatusCounts(contexts) {
  const counts = { usable: 0, reference: 0, low_sample: 0 };
  for (const context of contexts) counts[context.sampleStatus] = (counts[context.sampleStatus] ?? 0) + 1;
  return counts;
}

function buildGuidanceArtifact({ sourceArtifact, targetDate, generatedAt = new Date().toISOString() }) {
  const historicalFrom = assertDate(sourceArtifact.historicalFrom, "source historicalFrom");
  const historicalTo = assertDate(sourceArtifact.historicalTo, "source historicalTo");
  targetDate = assertDate(targetDate, "targetDate");
  const freshness = freshnessFor(historicalTo, targetDate);

  const globalAccumulator = createAccumulator("global", "GLOBAL", "global");
  const venueMap = new Map();
  const raceNoMap = new Map();
  const venueRaceNoMap = new Map();

  for (const record of sourceArtifact.records ?? []) {
    if (!(String(record.date) < targetDate)) {
      throw new Error(`source record date must be before targetDate: ${record.key}`);
    }
    const parts = splitRaceKey(record.key);
    const venueKey = parts.venueSlug || String(record.venue ?? "").trim();
    if (!venueKey) throw new Error(`missing venue context key: ${record.key}`);
    const raceNo = Number(record.raceNo);
    if (!Number.isInteger(raceNo) || raceNo <= 0) throw new Error(`invalid raceNo: ${record.key}`);
    const venueLabel = String(record.venue ?? venueKey);
    const venueRaceKey = `${venueKey}|${raceNo}`;

    if (!venueMap.has(venueKey)) venueMap.set(venueKey, createAccumulator(venueKey, venueLabel, "venue"));
    if (!raceNoMap.has(String(raceNo))) raceNoMap.set(String(raceNo), createAccumulator(String(raceNo), `${raceNo}R`, "raceNo"));
    if (!venueRaceNoMap.has(venueRaceKey)) {
      venueRaceNoMap.set(venueRaceKey, createAccumulator(venueRaceKey, `${venueLabel} ${raceNo}R`, "venueRaceNo"));
    }

    addRecord(globalAccumulator, record);
    addRecord(venueMap.get(venueKey), record);
    addRecord(raceNoMap.get(String(raceNo)), record);
    addRecord(venueRaceNoMap.get(venueRaceKey), record);
  }

  const globalBaseline = finalize(globalAccumulator, {
    globalContext: { headMissRate: null, thirdProtectionRate: null },
    freshness,
  });
  const global = finalize(globalAccumulator, { globalContext: globalBaseline, freshness });
  const contextOptions = { globalContext: global, freshness };
  const byVenue = [...venueMap.values()].map((item) => finalize(item, contextOptions)).sort(contextSort);
  const byRaceNo = [...raceNoMap.values()].map((item) => finalize(item, contextOptions)).sort((a, b) => Number(a.key) - Number(b.key));
  const byVenueRaceNo = [...venueRaceNoMap.values()].map((item) => finalize(item, contextOptions)).sort(contextSort);
  const allContexts = [global, ...byVenue, ...byRaceNo, ...byVenueRaceNo];

  return {
    version: VERSION,
    generatedAt,
    targetDate,
    historicalFrom,
    historicalTo,
    freshness,
    source: {
      artifact: SOURCE_PUBLIC_PATH,
      version: sourceArtifact.version ?? null,
      targetDate: sourceArtifact.targetDate ?? null,
      historicalFrom,
      historicalTo,
      raceCount: sourceArtifact.raceCount ?? null,
      classifiableRaceCount: sourceArtifact.classifiableRaceCount ?? null,
    },
    policy: {
      specificRiderSelectionAllowed: false,
      raceRiskScoreMutationAllowed: false,
      pointRangeAutoPromotionAllowed: false,
      counterfactualPointRangeAllowed: false,
      currentDayResultAllowed: false,
    },
    leakageGuard: {
      historicalToBeforeTargetDate: historicalTo < targetDate,
      sourceFailureHistoricalToBeforeTargetDate: historicalTo < targetDate,
      currentDayResultUsed: false,
      futureResultUsed: false,
      fakeCompletionUsed: false,
      fuzzyMatchingUsed: false,
      resultBackfilledPrediction: false,
      failureGuidanceUsedToSelectSpecificRider: false,
      lowSampleContextUsedAsStrongSignal: allContexts.some((context) =>
        context.sampleStatus === "low_sample" &&
        (context.headGuidance === "HEAD_STRUCTURE_CAUTION" || context.thirdProtectionGuidance === "PROTECT_SECOND_THIRD")
      ),
      referenceContextUsedAsStrongSignal: allContexts.some((context) =>
        context.sampleStatus === "reference" &&
        (context.headGuidance === "HEAD_STRUCTURE_CAUTION" || context.thirdProtectionGuidance === "PROTECT_SECOND_THIRD")
      ),
      staleArtifactUsedAsStrongSignal: freshness.status === "stale" && allContexts.some((context) =>
        context.headGuidance === "HEAD_STRUCTURE_CAUTION" || context.thirdProtectionGuidance === "PROTECT_SECOND_THIRD"
      ),
      venueRaceNoUsedAsStrongSignal: byVenueRaceNo.some((context) =>
        context.headGuidance === "HEAD_STRUCTURE_CAUTION" || context.thirdProtectionGuidance === "PROTECT_SECOND_THIRD"
      ),
    },
    global,
    byVenue,
    byRaceNo,
    byVenueRaceNo,
    contextSummary: {
      globalCount: 1,
      venueCount: byVenue.length,
      raceNoCount: byRaceNo.length,
      venueRaceNoCount: byVenueRaceNo.length,
      sampleStatusCounts: sampleStatusCounts(allContexts),
      guidanceCounts: guidanceCounts(allContexts),
      strongContexts: allContexts
        .filter((context) =>
          context.headGuidance === "HEAD_STRUCTURE_CAUTION" ||
          context.thirdProtectionGuidance === "PROTECT_SECOND_THIRD"
        )
        .map((context) => ({
          key: context.key,
          label: context.label,
          contextType: context.contextType,
          sampleStatus: context.sampleStatus,
          classifiableCount: context.classifiableCount,
          headGuidance: context.headGuidance,
          thirdProtectionGuidance: context.thirdProtectionGuidance,
          headMissRate: context.headMissRate,
          thirdProtectionRate: context.thirdProtectionRate,
        })),
    },
  };
}

function printSummary(artifact, mode, outputPath) {
  console.log("[kurari-ex-prediction-failure-guidance] mode:", mode);
  console.log("[kurari-ex-prediction-failure-guidance] targetDate:", artifact.targetDate);
  console.log("[kurari-ex-prediction-failure-guidance] historical:", `${artifact.historicalFrom}..${artifact.historicalTo}`);
  console.log("[kurari-ex-prediction-failure-guidance] freshness:", `${artifact.freshness.status} lagDays=${artifact.freshness.lagDays} usage=${artifact.freshness.preRaceUsage}`);
  console.log("[kurari-ex-prediction-failure-guidance] source:", JSON.stringify(artifact.source));
  console.log("[kurari-ex-prediction-failure-guidance] global:", JSON.stringify({
    classifiableCount: artifact.global.classifiableCount,
    headMissRate: artifact.global.headMissRate,
    thirdPlaceMissRateAmongCorrectTop2: artifact.global.thirdPlaceMissRateAmongCorrectTop2,
    thirdProtectionRate: artifact.global.thirdProtectionRate,
  }));
  console.log("[kurari-ex-prediction-failure-guidance] contexts:", JSON.stringify(artifact.contextSummary));
  console.log("[kurari-ex-prediction-failure-guidance] output:", outputPath);
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const sourceArtifact = JSON.parse(fs.readFileSync(SOURCE_PATH, "utf8"));
  const targetDate = getArgValue(args, "--target-date", sourceArtifact.targetDate ?? formatJstDate());
  const artifact = buildGuidanceArtifact({ sourceArtifact, targetDate });
  printSummary(artifact, write ? "write" : "dry-run", OUTPUT_PATH);
  if (write) {
    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
    fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  }
}

main().catch((error) => {
  console.error("[kurari-ex-prediction-failure-guidance] failed:", error);
  process.exitCode = 1;
});
