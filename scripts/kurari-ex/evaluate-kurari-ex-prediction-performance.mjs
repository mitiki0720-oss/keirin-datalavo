import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..");
const predictionDailyRoot = path.join(projectRoot, "public", "data", "predictions", "daily");
const resultHistoryRoot = path.join(
  projectRoot,
  "public",
  "data",
  "analytics",
  "kurari-ex-result-trend-lab-history",
);
const currentResultPath = path.join(projectRoot, "public", "data", "races", "keirin-jp-results.generated.json");
const outputRoot = path.join(projectRoot, "public", "data", "analytics", "kurari-ex", "prediction-performance");

function getArgValue(args, name, fallback = "") {
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(name);
  if (index >= 0 && index + 1 < args.length) return args[index + 1];
  return fallback;
}

function serializeJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function readJson(file) {
  return JSON.parse(String(await readFile(file, "utf8")).replace(/^\uFEFF/u, ""));
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/u.test(String(value ?? ""));
}

function monthOf(date) {
  return String(date).slice(0, 7);
}

async function fileExists(file) {
  try {
    await readFile(file);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function collectPredictionFiles() {
  const files = [];
  let months = [];
  try {
    months = await readdir(predictionDailyRoot, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return files;
    throw error;
  }
  for (const month of months) {
    if (!month.isDirectory()) continue;
    const directory = path.join(predictionDailyRoot, month.name);
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && /^\d{4}-\d{2}-\d{2}\.generated\.json$/u.test(entry.name)) {
        files.push(path.join(directory, entry.name));
      }
    }
  }
  return files.sort();
}

function normalizeTicketIndex(value) {
  const text = String(value ?? "").trim();
  return /^\d+$/u.test(text) ? text.padStart(2, "0") : text;
}

function normalizeCombination(value) {
  const numbers = String(value ?? "").match(/[1-9]/gu) ?? [];
  return numbers.length > 0 ? numbers.join("-") : "";
}

function normalizeYen(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const number = Number(String(value ?? "").replace(/[^\d.-]/gu, ""));
  return Number.isFinite(number) ? number : null;
}

function resultRaceKey({ date, venueCode, raceNumber }) {
  return `${date}|${venueCode}|${Number(raceNumber)}`;
}

function predictionRaceKey(item, snapshot) {
  const identity = snapshot?.raceIdentity ?? {};
  const date = String(identity.date ?? item.date ?? "").trim();
  const venueCode = String(identity.venueCode ?? item.venueCode ?? "").trim();
  const raceNumber = Number(identity.raceNumber ?? item.raceNumber);
  return date && venueCode && Number.isInteger(raceNumber) ? resultRaceKey({ date, venueCode, raceNumber }) : "";
}

function collectOfficialTrifectaResults(race) {
  const results = [];
  const add = (combination, payoutYen, source) => {
    const normalizedCombination = normalizeCombination(combination);
    const normalizedPayout = normalizeYen(payoutYen);
    if (normalizedCombination && normalizedPayout != null) {
      results.push({ combination: normalizedCombination, payoutYen: normalizedPayout, source });
    }
  };
  add(race?.result?.trifecta, race?.result?.trifectaPayoutYen, "history.scalar-result");
  for (const item of Array.isArray(race?.deadHeat?.trifectaResults) ? race.deadHeat.trifectaResults : []) {
    add(item?.combination ?? item?.trifecta, item?.payoutYen ?? item?.trifectaPayoutYen, "history.dead-heat");
  }
  for (const item of Array.isArray(race?.payouts?.trifecta) ? race.payouts.trifecta : []) {
    add(item?.combination, item?.payoutYen, "current-feed.trifecta-payouts");
  }
  add(race?.payout3tan?.combination, race?.payout3tan?.payoutYen, "current-feed.payout3tan");

  const seen = new Set();
  return results.filter((item) => {
    const key = `${item.combination}|${item.payoutYen}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeHistoryResultRace(race, sourceFile) {
  const confirmed = race?.status === "confirmed" && race?.storageEligible === true;
  return {
    raceKey: resultRaceKey(race),
    date: String(race?.date ?? ""),
    venueCode: String(race?.venueCode ?? ""),
    venueName: String(race?.venue ?? race?.venueName ?? ""),
    raceNumber: Number(race?.raceNumber),
    sourceType: "result-trend-history",
    sourceFile,
    confirmed,
    status: String(race?.status ?? ""),
    storageEligible: race?.storageEligible === true,
    trendEligible: race?.trendEligible === true,
    officialTrifectaResults: collectOfficialTrifectaResults(race),
    deadHeat: race?.deadHeat ?? null,
    provenance: race?.provenance ?? race?.source ?? null,
  };
}

function normalizeCurrentResultRace(venue, race, sourceFile, date) {
  const confirmed = race?.resultStatus === "confirmed" && race?.operationStatus === "finished";
  return {
    raceKey: resultRaceKey({ date, venueCode: venue?.venueCode, raceNumber: race?.raceNumber }),
    date,
    venueCode: String(venue?.venueCode ?? ""),
    venueName: String(venue?.venueName ?? venue?.venue ?? ""),
    raceNumber: Number(race?.raceNumber),
    sourceType: "keirin-jp-current-results",
    sourceFile,
    confirmed,
    status: String(race?.resultStatus ?? ""),
    storageEligible: confirmed,
    trendEligible: null,
    officialTrifectaResults: collectOfficialTrifectaResults(race),
    deadHeat: null,
    provenance: {
      result: {
        status: confirmed ? "present" : "unavailable",
        sourceRef: "public/data/races/keirin-jp-results.generated.json",
      },
    },
  };
}

async function loadResultHistoryIndex() {
  const file = path.join(resultHistoryRoot, "index.generated.json");
  if (!(await fileExists(file))) return null;
  const artifact = await readJson(file);
  const dates = [];
  for (const shard of Array.isArray(artifact.shards) ? artifact.shards : []) {
    if (isIsoDate(shard.date)) dates.push(shard.date);
  }
  if (dates.length === 0) {
    const dailyRoot = path.join(resultHistoryRoot, "daily");
    try {
      for (const month of await readdir(dailyRoot, { withFileTypes: true })) {
        if (!month.isDirectory()) continue;
        const entries = await readdir(path.join(dailyRoot, month.name), { withFileTypes: true });
        for (const entry of entries) {
          const match = entry.name.match(/^(\d{4}-\d{2}-\d{2})\.generated\.json$/u);
          if (entry.isFile() && match) dates.push(match[1]);
        }
      }
    } catch {
      // Range metadata is optional for fixture-free operation.
    }
  }
  dates.sort();
  return {
    file,
    range: {
      from: artifact.period?.from ?? dates[0] ?? null,
      to: artifact.period?.to ?? dates.at(-1) ?? null,
    },
    shardCount: artifact.shardCount ?? artifact.loadedShardCount ?? dates.length,
    raceCount: artifact.raceCount ?? artifact.accepted ?? null,
  };
}

async function loadResultMapForDates(dates, options = {}) {
  const resultMap = new Map();
  const sourceByDate = new Map();
  if (options.resultFile) {
    const payload = await readJson(options.resultFile);
    const sourceFile = path.resolve(options.resultFile);
    for (const race of Array.isArray(payload.races) ? payload.races : []) {
      const normalized = normalizeHistoryResultRace(race, sourceFile);
      if (normalized.raceKey) resultMap.set(normalized.raceKey, normalized);
    }
    return { resultMap, sourceByDate };
  }

  for (const date of dates) {
    const historyFile = path.join(resultHistoryRoot, "daily", monthOf(date), `${date}.generated.json`);
    if (await fileExists(historyFile)) {
      const shard = await readJson(historyFile);
      for (const race of Array.isArray(shard.races) ? shard.races : []) {
        const normalized = normalizeHistoryResultRace(race, historyFile);
        if (normalized.raceKey) resultMap.set(normalized.raceKey, normalized);
      }
      sourceByDate.set(date, "result-trend-history");
      continue;
    }
    if (await fileExists(currentResultPath)) {
      const current = await readJson(currentResultPath);
      if (current.date === date) {
        for (const venue of Array.isArray(current.venues) ? current.venues : []) {
          for (const race of Array.isArray(venue.races) ? venue.races : []) {
            const normalized = normalizeCurrentResultRace(venue, race, currentResultPath, date);
            if (normalized.raceKey) resultMap.set(normalized.raceKey, normalized);
          }
        }
        sourceByDate.set(date, "keirin-jp-current-results");
      }
    }
  }
  return { resultMap, sourceByDate };
}

function createBucket() {
  return {
    raceCount: 0,
    evaluableRaceCount: 0,
    plannedHitCount: 0,
    plannedStakeYen: 0,
    plannedReturnYen: 0,
    plannedProfitYen: 0,
    plannedHitRate: null,
    plannedRoiPercent: null,
  };
}

function finalizeBucket(bucket) {
  bucket.plannedProfitYen = bucket.plannedReturnYen - bucket.plannedStakeYen;
  bucket.plannedHitRate = bucket.evaluableRaceCount > 0 ? bucket.plannedHitCount / bucket.evaluableRaceCount : null;
  bucket.plannedRoiPercent = bucket.plannedStakeYen > 0 ? (bucket.plannedReturnYen / bucket.plannedStakeYen) * 100 : null;
  return bucket;
}

function addToBucket(map, key, evaluation) {
  const normalizedKey = String(key ?? "unknown") || "unknown";
  if (!map[normalizedKey]) map[normalizedKey] = createBucket();
  const bucket = map[normalizedKey];
  bucket.raceCount += 1;
  if (evaluation.evaluationStatus === "evaluable-planned-trifecta") {
    bucket.evaluableRaceCount += 1;
    bucket.plannedHitCount += evaluation.plannedHit ? 1 : 0;
    bucket.plannedStakeYen += evaluation.plannedStakeYen;
    bucket.plannedReturnYen += evaluation.plannedReturnYen;
  }
}

function increment(map, key, amount = 1) {
  const normalizedKey = String(key ?? "unknown") || "unknown";
  map[normalizedKey] = (map[normalizedKey] ?? 0) + amount;
}

function headCountBucket(count) {
  if (!Number.isFinite(Number(count))) return "unknown";
  const number = Number(count);
  return number >= 5 ? "5+" : String(number);
}

function classifyRecommendation(betPlan, pointRangeAction) {
  const purchaseCount = Number(betPlan?.structuredPurchaseCount ?? 0);
  const recommended = betPlan?.recommendedPurchaseCount == null ? null : Number(betPlan.recommendedPurchaseCount);
  if (pointRangeAction === "SKIP") return purchaseCount > 0 ? "skipWithPurchase" : "skipObserved";
  if (recommended == null) return "recommendationUnavailable";
  if (purchaseCount === recommended) return "matchesRecommendation";
  if (purchaseCount < recommended) return "underRecommendation";
  return "overRecommendation";
}

function ticketByIndexMap(tickets) {
  const map = new Map();
  for (const ticket of Array.isArray(tickets) ? tickets : []) {
    map.set(normalizeTicketIndex(ticket?.index), {
      index: normalizeTicketIndex(ticket?.index),
      betType: String(ticket?.betType ?? ""),
      combination: normalizeCombination(ticket?.combination),
      group: String(ticket?.group ?? ""),
      note: String(ticket?.note ?? ""),
    });
  }
  return map;
}

function evaluateItem(item, resultMap) {
  const snapshot = item?.preRaceSnapshot;
  const base = {
    raceId: String(item?.raceId ?? ""),
    date: String(item?.date ?? ""),
    venueName: String(item?.venueName ?? ""),
    venueCode: String(item?.venueCode ?? snapshot?.raceIdentity?.venueCode ?? ""),
    raceNumber: Number(item?.raceNumber ?? snapshot?.raceIdentity?.raceNumber),
    raceKey: "",
    evaluationStatus: "unclassified",
    excludedReason: null,
    riskLevel: snapshot?.risk?.riskLevel ?? "unavailable",
    pointRangeAction: snapshot?.risk?.pointRange?.action ?? "unavailable",
    failure: {
      status: snapshot?.failure?.status ?? "unavailable",
      usage: snapshot?.failure?.usage ?? null,
      freshnessStatus: snapshot?.failure?.freshnessStatus ?? null,
      strongContextCount: snapshot?.failure?.strongContextCount ?? null,
    },
    evidence: snapshot?.evidence ?? null,
    signals: Array.isArray(snapshot?.risk?.signals) ? snapshot.risk.signals : [],
    structuredPurchaseCount: 0,
    structuredShadowCount: 0,
    purchaseDerivedHeadCount: null,
    declaredHeadCandidates: [],
    purchaseDerivedHeads: [],
    plannedStakeYen: 0,
    plannedReturnYen: 0,
    plannedProfitYen: 0,
    plannedHit: false,
    winningCombinations: [],
    hitCombinations: [],
    shadowRescue: false,
    shadowHitCombinations: [],
    resultSource: null,
    resultProvenance: null,
    actualRoiEvaluable: false,
  };

  if (!snapshot) return { ...base, evaluationStatus: "not-evaluable-missing-pre-race-snapshot", excludedReason: "missingPreRaceSnapshot" };
  const raceKey = predictionRaceKey(item, snapshot);
  base.raceKey = raceKey;
  if (!raceKey) return { ...base, evaluationStatus: "not-evaluable-join-key-missing", excludedReason: "missingJoinKey" };
  const ticketSnapshot = snapshot.ticketSnapshot ?? {};
  const betPlan = ticketSnapshot.betPlan;
  if (ticketSnapshot.purchaseClassification !== "structured") {
    return { ...base, evaluationStatus: "not-evaluable-no-structured-bet-plan", excludedReason: "purchaseClassificationUnavailable" };
  }
  if (betPlan?.status !== "structured" || betPlan?.sourceStatus !== "source-backed") {
    return { ...base, evaluationStatus: "not-evaluable-no-structured-bet-plan", excludedReason: "missingStructuredBetPlan" };
  }

  const tickets = ticketByIndexMap(ticketSnapshot.tickets);
  const purchaseIndices = (Array.isArray(betPlan.purchaseTicketIndices) ? betPlan.purchaseTicketIndices : []).map(normalizeTicketIndex);
  const shadowIndices = (Array.isArray(betPlan.shadowTicketIndices) ? betPlan.shadowTicketIndices : []).map(normalizeTicketIndex);
  const missingPurchase = purchaseIndices.filter((index) => !tickets.has(index));
  const missingShadow = shadowIndices.filter((index) => !tickets.has(index));
  if (missingPurchase.length > 0 || missingShadow.length > 0) {
    return {
      ...base,
      raceKey,
      evaluationStatus: "not-evaluable-invalid-bet-plan",
      excludedReason: "purchaseTicketMissing",
      structuredPurchaseCount: purchaseIndices.length,
      structuredShadowCount: shadowIndices.length,
    };
  }

  const unitStakeYen = Number(betPlan.unitStakeYen ?? snapshot.stake?.unitStakeYen ?? 100);
  const plannedStakeAllPurchase = purchaseIndices.length * unitStakeYen;
  if (Number(betPlan.plannedStakeYen) !== plannedStakeAllPurchase) {
    return {
      ...base,
      raceKey,
      evaluationStatus: "not-evaluable-invalid-bet-plan",
      excludedReason: "plannedStakeMismatch",
      structuredPurchaseCount: purchaseIndices.length,
      structuredShadowCount: shadowIndices.length,
    };
  }

  const result = resultMap.get(raceKey);
  if (!result) {
    return {
      ...base,
      raceKey,
      evaluationStatus: "not-evaluable-result-unavailable",
      excludedReason: "missingResult",
      structuredPurchaseCount: purchaseIndices.length,
      structuredShadowCount: shadowIndices.length,
      purchaseDerivedHeadCount: betPlan.purchaseDerivedHeadCount ?? null,
      declaredHeadCandidates: betPlan.declaredHeadCandidates ?? [],
      purchaseDerivedHeads: betPlan.purchaseDerivedHeads ?? [],
    };
  }
  base.resultSource = {
    type: result.sourceType,
    status: result.status,
    confirmed: result.confirmed,
    storageEligible: result.storageEligible,
    sourceFile: result.sourceFile,
  };
  base.resultProvenance = result.provenance;
  if (!result.confirmed) {
    return { ...base, evaluationStatus: "not-evaluable-result-not-confirmed", excludedReason: "resultNotConfirmed" };
  }
  if (!Array.isArray(result.officialTrifectaResults) || result.officialTrifectaResults.length === 0) {
    return { ...base, evaluationStatus: "not-evaluable-missing-payout", excludedReason: "missingPayout" };
  }

  const purchaseTrifectaTickets = purchaseIndices
    .map((index) => tickets.get(index))
    .filter((ticket) => ticket?.betType === "3連単" && ticket.combination);
  const shadowTrifectaTickets = shadowIndices
    .map((index) => tickets.get(index))
    .filter((ticket) => ticket?.betType === "3連単" && ticket.combination);
  if (purchaseTrifectaTickets.length === 0) {
    return {
      ...base,
      raceKey,
      evaluationStatus: "not-evaluable-no-purchase-trifecta",
      excludedReason: "noPurchaseTrifecta",
      structuredPurchaseCount: purchaseIndices.length,
      structuredShadowCount: shadowIndices.length,
      purchaseDerivedHeadCount: betPlan.purchaseDerivedHeadCount ?? null,
      declaredHeadCandidates: betPlan.declaredHeadCandidates ?? [],
      purchaseDerivedHeads: betPlan.purchaseDerivedHeads ?? [],
      winningCombinations: result.officialTrifectaResults,
    };
  }

  const purchaseCombinations = new Set(purchaseTrifectaTickets.map((ticket) => ticket.combination));
  const shadowCombinations = new Set(shadowTrifectaTickets.map((ticket) => ticket.combination));
  const hitResults = result.officialTrifectaResults.filter((official) => purchaseCombinations.has(official.combination));
  const shadowHitResults = hitResults.length === 0
    ? result.officialTrifectaResults.filter((official) => shadowCombinations.has(official.combination))
    : [];
  const plannedStakeYen = purchaseTrifectaTickets.length * unitStakeYen;
  const plannedReturnYen = hitResults.reduce((sum, official) => sum + Math.round(official.payoutYen * (unitStakeYen / 100)), 0);

  return {
    ...base,
    raceKey,
    evaluationStatus: "evaluable-planned-trifecta",
    structuredPurchaseCount: purchaseIndices.length,
    structuredShadowCount: shadowIndices.length,
    purchaseTrifectaCount: purchaseTrifectaTickets.length,
    purchaseExactaCount: purchaseIndices.length - purchaseTrifectaTickets.length,
    shadowTrifectaCount: shadowTrifectaTickets.length,
    unitStakeYen,
    plannedStakeYen,
    plannedStakeYenAllPurchase: plannedStakeAllPurchase,
    plannedReturnYen,
    plannedProfitYen: plannedReturnYen - plannedStakeYen,
    plannedHit: hitResults.length > 0,
    winningCombinations: result.officialTrifectaResults,
    hitCombinations: hitResults,
    shadowRescue: shadowHitResults.length > 0,
    shadowHitCombinations: shadowHitResults,
    purchaseDerivedHeadCount: betPlan.purchaseDerivedHeadCount ?? null,
    declaredHeadCandidates: betPlan.declaredHeadCandidates ?? [],
    purchaseDerivedHeads: betPlan.purchaseDerivedHeads ?? [],
    recommendationClass: classifyRecommendation(betPlan, snapshot.risk?.pointRange?.action),
  };
}

function summarizeEvaluations(evaluations) {
  const summary = {
    predictionRaceCount: evaluations.length,
    preRaceSnapshotCount: 0,
    structuredBetPlanCount: 0,
    resultAvailableCount: 0,
    exactJoinedCount: 0,
    plannedRoiEvaluableCount: 0,
    plannedHitCount: 0,
    plannedStakeYen: 0,
    plannedReturnYen: 0,
    plannedProfitYen: 0,
    plannedHitRate: null,
    plannedRoiPercent: null,
    actualRoiEvaluableCount: 0,
    purchaseMissCount: 0,
    shadowRescueCount: 0,
    shadowRescueRate: null,
  };
  const excludedReasonCounts = {};
  const byRisk = {};
  const byPointRange = {};
  const byRecommendation = {};
  const byHeadCount = {};
  const byFailureUsage = {};
  const bySignal = {};
  const skip = {
    skipRecommendedCount: 0,
    skipObservedCount: 0,
    skipOverrideCount: 0,
  };

  for (const evaluation of evaluations) {
    if (evaluation.excludedReason) increment(excludedReasonCounts, evaluation.excludedReason);
    if (evaluation.evaluationStatus !== "not-evaluable-missing-pre-race-snapshot") summary.preRaceSnapshotCount += 1;
    if (evaluation.evaluationStatus !== "not-evaluable-no-structured-bet-plan" && evaluation.structuredPurchaseCount > 0) {
      summary.structuredBetPlanCount += 1;
    }
    if (evaluation.resultSource) summary.resultAvailableCount += 1;
    if (evaluation.resultSource?.confirmed) summary.exactJoinedCount += 1;
    if (evaluation.pointRangeAction === "SKIP") {
      skip.skipRecommendedCount += 1;
      if (evaluation.structuredPurchaseCount > 0) skip.skipOverrideCount += 1;
      else skip.skipObservedCount += 1;
    }
    addToBucket(byRisk, evaluation.riskLevel, evaluation);
    addToBucket(byPointRange, evaluation.pointRangeAction, evaluation);
    addToBucket(byRecommendation, evaluation.recommendationClass ?? "notEvaluable", evaluation);
    addToBucket(byHeadCount, headCountBucket(evaluation.purchaseDerivedHeadCount), evaluation);
    addToBucket(byFailureUsage, `${evaluation.failure.status}:${evaluation.failure.usage ?? "none"}:${evaluation.failure.freshnessStatus ?? "none"}`, evaluation);
    for (const signal of evaluation.signals) addToBucket(bySignal, signal.key, evaluation);
    if (evaluation.evaluationStatus === "evaluable-planned-trifecta") {
      summary.plannedRoiEvaluableCount += 1;
      summary.plannedHitCount += evaluation.plannedHit ? 1 : 0;
      summary.plannedStakeYen += evaluation.plannedStakeYen;
      summary.plannedReturnYen += evaluation.plannedReturnYen;
      if (!evaluation.plannedHit) summary.purchaseMissCount += 1;
      if (evaluation.shadowRescue) summary.shadowRescueCount += 1;
    }
  }
  summary.plannedProfitYen = summary.plannedReturnYen - summary.plannedStakeYen;
  summary.plannedHitRate = summary.plannedRoiEvaluableCount > 0 ? summary.plannedHitCount / summary.plannedRoiEvaluableCount : null;
  summary.plannedRoiPercent = summary.plannedStakeYen > 0 ? (summary.plannedReturnYen / summary.plannedStakeYen) * 100 : null;
  summary.shadowRescueRate = summary.purchaseMissCount > 0 ? summary.shadowRescueCount / summary.purchaseMissCount : null;
  for (const bucketMap of [byRisk, byPointRange, byRecommendation, byHeadCount, byFailureUsage, bySignal]) {
    for (const bucket of Object.values(bucketMap)) finalizeBucket(bucket);
  }
  return {
    summary,
    excludedReasonCounts,
    byRisk,
    byPointRange,
    byRecommendation,
    skip,
    shadow: {
      purchaseMissCount: summary.purchaseMissCount,
      shadowRescueCount: summary.shadowRescueCount,
      shadowRescueRate: summary.shadowRescueRate,
    },
    byPurchaseDerivedHeadCount: byHeadCount,
    byFailureUsage,
    bySignal,
  };
}

async function loadPredictionPayloads(options) {
  if (options.predictionFile) {
    const payload = await readJson(options.predictionFile);
    return [{ file: path.resolve(options.predictionFile), payload }];
  }
  const files = await collectPredictionFiles();
  const selected = [];
  for (const file of files) {
    const date = path.basename(file).replace(/\.generated\.json$/u, "");
    if (options.date && date !== options.date) continue;
    if (options.from && date < options.from) continue;
    if (options.to && date > options.to) continue;
    selected.push({ file, payload: await readJson(file) });
  }
  return selected;
}

function buildPeriod(payloads) {
  const dates = payloads.map((entry) => String(entry.payload?.date ?? "")).filter(isIsoDate).sort();
  return {
    from: dates[0] ?? null,
    to: dates.at(-1) ?? null,
    dateCount: new Set(dates).size,
  };
}

export async function evaluatePredictionPerformance(options = {}) {
  const payloads = await loadPredictionPayloads(options);
  const dates = [...new Set(payloads.map((entry) => String(entry.payload?.date ?? "")).filter(isIsoDate))].sort();
  const { resultMap, sourceByDate } = await loadResultMapForDates(dates, options);
  const evaluations = [];
  for (const { payload } of payloads) {
    for (const item of Array.isArray(payload.items) ? payload.items : []) {
      evaluations.push(evaluateItem(item, resultMap));
    }
  }
  const aggregates = summarizeEvaluations(evaluations);
  const resultHistory = await loadResultHistoryIndex();
  const artifact = {
    schemaVersion: 1,
    version: "kurari-ex-prediction-performance/v1",
    generatedAt: new Date().toISOString(),
    source: "kurari-ex-post-race-planned-performance-evaluator",
    namespace: "public/data/analytics/kurari-ex/prediction-performance",
    period: buildPeriod(payloads),
    preRaceSource: {
      root: "public/data/predictions/daily",
      sourceOfTruth: "preRaceSnapshot.ticketSnapshot.betPlan",
      fakeBackfillPolicy: "forbidden",
    },
    postRaceSource: {
      priority: [
        "public/data/analytics/kurari-ex-result-trend-lab-history/daily/YYYY-MM/YYYY-MM-DD.generated.json",
        "public/data/races/keirin-jp-results.generated.json only for exact same date confirmed fallback",
      ],
      resultHistoryRange: resultHistory?.range ?? null,
      resultHistoryRaceCount: resultHistory?.raceCount ?? null,
      sourceByDate: Object.fromEntries(sourceByDate),
    },
    join: {
      method: "exact",
      keys: ["date", "venueCode", "raceNumber"],
      fuzzyVenueMatching: false,
      reviewFallback: false,
    },
    roiDefinition: {
      plannedPurchaseRoi: "3連単purchaseTicketIndicesのみ。shadow/2車単/actualStakeは混入しない。",
      unitStake: "preRaceSnapshot.ticketSnapshot.betPlan.unitStakeYen",
      actualRoi: "unavailable",
    },
    ...aggregates,
    records: evaluations,
  };

  if (options.write) {
    if (artifact.period.dateCount !== 1 || !artifact.period.to) {
      throw new Error("--write requires a single --date or single prediction file date");
    }
    const dailyFile = path.join(outputRoot, "daily", monthOf(artifact.period.to), `${artifact.period.to}.generated.json`);
    await mkdir(path.dirname(dailyFile), { recursive: true });
    await writeFile(dailyFile, serializeJson(artifact), "utf8");
    const index = {
      schemaVersion: 1,
      version: artifact.version,
      generatedAt: artifact.generatedAt,
      period: artifact.period,
      latestDate: artifact.period.to,
      latestFile: `/data/analytics/kurari-ex/prediction-performance/daily/${monthOf(artifact.period.to)}/${artifact.period.to}.generated.json`,
      latestSummary: artifact.summary,
    };
    await writeFile(path.join(outputRoot, "index.generated.json"), serializeJson(index), "utf8");
  }

  return artifact;
}

async function main() {
  const args = process.argv.slice(2);
  const artifact = await evaluatePredictionPerformance({
    date: getArgValue(args, "--date"),
    from: getArgValue(args, "--from"),
    to: getArgValue(args, "--to"),
    predictionFile: getArgValue(args, "--prediction-file"),
    resultFile: getArgValue(args, "--result-file"),
    write: args.includes("--write"),
  });
  console.log("[kurari ex prediction performance]");
  console.log(`period: ${artifact.period.from ?? "(none)"} to ${artifact.period.to ?? "(none)"}`);
  console.log(`predictionRaceCount: ${artifact.summary.predictionRaceCount}`);
  console.log(`structuredBetPlanCount: ${artifact.summary.structuredBetPlanCount}`);
  console.log(`resultAvailableCount: ${artifact.summary.resultAvailableCount}`);
  console.log(`plannedRoiEvaluableCount: ${artifact.summary.plannedRoiEvaluableCount}`);
  console.log(`plannedHitCount: ${artifact.summary.plannedHitCount}`);
  console.log(`plannedStakeYen: ${artifact.summary.plannedStakeYen}`);
  console.log(`plannedReturnYen: ${artifact.summary.plannedReturnYen}`);
  console.log(`plannedRoiPercent: ${artifact.summary.plannedRoiPercent ?? "null"}`);
  console.log(`actualRoiEvaluableCount: ${artifact.summary.actualRoiEvaluableCount}`);
  console.log(`excludedReasonCounts: ${JSON.stringify(artifact.excludedReasonCounts)}`);
  if (args.includes("--print-json")) process.stdout.write(serializeJson(artifact));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("[kurari ex prediction performance] failed");
    console.error(error);
    process.exitCode = 1;
  });
}
