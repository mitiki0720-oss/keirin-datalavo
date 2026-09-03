export type ReviewTicketLike = {
  index?: unknown;
  betType?: unknown;
  combination?: unknown;
};

export type ReviewPredictionJsonLike = {
  tickets?: ReviewTicketLike[];
  betPlan?: Record<string, unknown>;
  preRaceSnapshot?: {
    ticketSnapshot?: {
      purchaseClassification?: unknown;
      tickets?: ReviewTicketLike[];
      betPlan?: Record<string, unknown>;
    };
  };
  ticketSnapshot?: {
    purchaseClassification?: unknown;
    tickets?: ReviewTicketLike[];
    betPlan?: Record<string, unknown>;
  };
};

export type ReviewTicket = {
  index: string;
  betType: "3連単" | "2車単";
  combination: string;
};

export type ReviewTicketClassification = {
  status: "classified" | "unknown";
  source: "prediction-json-bet-plan" | "pre-race-ticket-snapshot" | "ticket-snapshot" | "prediction-text-explicit" | "unknown";
  purchaseTickets: ReviewTicket[];
  shadowTickets: ReviewTicket[];
  unitStakeYen?: number;
  warnings: string[];
};

export type ReviewRacePerformanceStatus = "purchase-hit" | "shadow-hit" | "miss" | "unknown" | "pending";

export type ReviewRacePerformance = {
  status: ReviewRacePerformanceStatus;
  classification: ReviewTicketClassification;
  actualInvestment?: number;
  actualPayout?: number;
  actualProfit?: number;
  actualRoi?: number;
  shadowReferencePayout?: number;
  purchaseHit: boolean;
  shadowOnlyHit: boolean;
  matchedPurchaseTickets: ReviewTicket[];
  matchedShadowTickets: ReviewTicket[];
};

export type ReviewPerformanceSummary = {
  predictionRaceCount: number;
  settledRaceCount: number;
  classifiedSettledRaceCount: number;
  purchaseHitCount: number;
  shadowHitCount: number;
  capturedHitCount: number;
  unknownCount: number;
  pendingCount: number;
  actualInvestment: number;
  actualPayout: number;
  actualProfit: number;
  actualHitRate?: number;
  actualRoi?: number;
  shadowCoverageRate?: number;
};

export type ReviewRaceReadiness = {
  targetRaceNumbers: number[];
  predictionRaceNumbers: number[];
  resultRaceNumbers: number[];
  predictionMissingRaceNumbers: number[];
  resultMissingRaceNumbers: number[];
  predictionOnlyRaceNumbers: number[];
  resultOnlyRaceNumbers: number[];
  raceNumbersMatch: boolean;
};

const normalizeTicketIndex = (value: unknown) => {
  const text = String(value ?? "").trim();
  return /^\d+$/u.test(text) ? text.padStart(2, "0") : text;
};

const normalizeBetType = (value: unknown): ReviewTicket["betType"] | null => {
  const text = String(value ?? "").normalize("NFKC").replace(/\s+/g, "");
  if (text.includes("3連単")) return "3連単";
  if (text.includes("2車単")) return "2車単";
  return null;
};

const normalizeCombination = (value: unknown, betType: ReviewTicket["betType"]): string | null => {
  const parts = String(value ?? "")
    .normalize("NFKC")
    .replace(/[>＞→]/g, "-")
    .match(/[1-9]/g) ?? [];
  const expectedLength = betType === "3連単" ? 3 : 2;
  if (parts.length !== expectedLength || new Set(parts).size !== expectedLength) return null;
  return parts.join("-");
};

const normalizeTicket = (ticket: ReviewTicketLike, fallbackIndex: number): ReviewTicket | null => {
  const betType = normalizeBetType(ticket?.betType);
  if (!betType) return null;
  const combination = normalizeCombination(ticket?.combination, betType);
  if (!combination) return null;
  return {
    index: normalizeTicketIndex(ticket?.index) || String(fallbackIndex + 1).padStart(2, "0"),
    betType,
    combination,
  };
};

const normalizeTickets = (tickets: unknown): ReviewTicket[] => (
  (Array.isArray(tickets) ? tickets : [])
    .map((ticket, index) => normalizeTicket(ticket as ReviewTicketLike, index))
    .filter((ticket): ticket is ReviewTicket => ticket !== null)
);

const normalizeIndexList = (values: unknown) => [...new Set(
  (Array.isArray(values) ? values : [])
    .map(normalizeTicketIndex)
    .filter(Boolean),
)];

const resolveStructuredPlan = (
  plan: Record<string, unknown> | undefined,
  tickets: ReviewTicket[],
  source: ReviewTicketClassification["source"],
): ReviewTicketClassification | null => {
  if (!plan || plan.status !== "structured") return null;
  const purchaseIndices = normalizeIndexList(plan.purchaseTicketIndices);
  const shadowIndices = normalizeIndexList(plan.shadowTicketIndices);
  if (purchaseIndices.length === 0 && shadowIndices.length === 0) return null;

  const byIndex = new Map(tickets.map((ticket) => [ticket.index, ticket]));
  const missing = [...purchaseIndices, ...shadowIndices].filter((index) => !byIndex.has(index));
  if (missing.length > 0) return null;

  const purchaseTickets = purchaseIndices.map((index) => byIndex.get(index) as ReviewTicket);
  const purchaseKeys = new Set(purchaseTickets.map((ticket) => `${ticket.betType}:${ticket.combination}`));
  const shadowCandidates = shadowIndices.map((index) => byIndex.get(index) as ReviewTicket);
  const overlap = shadowCandidates.filter((ticket) => purchaseKeys.has(`${ticket.betType}:${ticket.combination}`));
  const shadowTickets = shadowCandidates.filter((ticket) => !purchaseKeys.has(`${ticket.betType}:${ticket.combination}`));
  const unitStake = Number(plan.unitStakeYen ?? 100);

  return {
    status: "classified",
    source,
    purchaseTickets,
    shadowTickets,
    unitStakeYen: Number.isFinite(unitStake) && unitStake > 0 ? unitStake : 100,
    warnings: overlap.length > 0 ? [`purchase-shadow-overlap:${overlap.map((ticket) => ticket.index).join(",")}`] : [],
  };
};

const parseExplicitTextTickets = (predictionText: string): ReviewTicketClassification | null => {
  const lines = String(predictionText ?? "").replace(/\r\n/g, "\n").split("\n");
  let mode: "purchase" | "shadow" | null = null;
  const purchaseTickets: ReviewTicket[] = [];
  const shadowTickets: ReviewTicket[] = [];

  lines.forEach((rawLine, lineIndex) => {
    const line = rawLine.trim().normalize("NFKC");
    if (!line) return;
    if (/^(?:【|\[)?(?:実購入|購入買い目|購入)(?:】|\])?(?:\s*[:：]\s*)?$/u.test(line)) {
      mode = "purchase";
      return;
    }
    if (/^(?:【|\[)?(?:影目|影買い目|SHADOW)(?:】|\])?(?:\s*[:：]\s*)?$/iu.test(line)) {
      mode = "shadow";
      return;
    }
    if (/^(?:【[^】]+】|\[[^\]]+\])$/u.test(line)) {
      mode = null;
      return;
    }

    const hasPurchaseToken = /(?:^|[|｜])\s*(?:実購入|購入)\s*(?:[|｜]|$)/u.test(line);
    const hasShadowToken = /(?:^|[|｜])\s*(?:影目|影買い目|SHADOW)\s*(?:[|｜]|$)/iu.test(line);
    const lineMode = hasPurchaseToken && !hasShadowToken
      ? "purchase"
      : hasShadowToken && !hasPurchaseToken
        ? "shadow"
        : mode;
    if (!lineMode) return;

    const explicitBetType = normalizeBetType(line);
    const combinationMatch = line.match(/([1-9])\s*[-=→>＞]\s*([1-9])(?:\s*[-=→>＞]\s*([1-9]))?/u);
    if (!combinationMatch) return;
    const betType = explicitBetType ?? (combinationMatch[3] ? "3連単" : "2車単");
    const combination = normalizeCombination(combinationMatch.slice(1).filter(Boolean).join("-"), betType);
    if (!combination) return;
    const indexMatch = line.match(/^\s*(\d{1,3})(?:[.)、|｜\s]|$)/u);
    const ticket: ReviewTicket = {
      index: normalizeTicketIndex(indexMatch?.[1] ?? lineIndex + 1),
      betType,
      combination,
    };
    (lineMode === "purchase" ? purchaseTickets : shadowTickets).push(ticket);
  });

  if (purchaseTickets.length === 0 && shadowTickets.length === 0) return null;
  const purchaseKeys = new Set(purchaseTickets.map((ticket) => `${ticket.betType}:${ticket.combination}`));
  const overlap = shadowTickets.filter((ticket) => purchaseKeys.has(`${ticket.betType}:${ticket.combination}`));
  return {
    status: "classified",
    source: "prediction-text-explicit",
    purchaseTickets,
    shadowTickets: shadowTickets.filter((ticket) => !purchaseKeys.has(`${ticket.betType}:${ticket.combination}`)),
    unitStakeYen: 100,
    warnings: overlap.length > 0 ? [`purchase-shadow-overlap:${overlap.map((ticket) => ticket.combination).join(",")}`] : [],
  };
};

export function classifyReviewTickets(
  predictionJson?: ReviewPredictionJsonLike | null,
  predictionText = "",
): ReviewTicketClassification {
  const directTickets = normalizeTickets(predictionJson?.tickets);
  const direct = resolveStructuredPlan(
    predictionJson?.betPlan,
    directTickets,
    "prediction-json-bet-plan",
  );
  if (direct) return direct;

  const preRaceSnapshot = predictionJson?.preRaceSnapshot?.ticketSnapshot;
  if (preRaceSnapshot?.purchaseClassification === "structured") {
    const snapshot = resolveStructuredPlan(
      preRaceSnapshot.betPlan,
      normalizeTickets(preRaceSnapshot.tickets),
      "pre-race-ticket-snapshot",
    );
    if (snapshot) return snapshot;
  }

  const ticketSnapshot = predictionJson?.ticketSnapshot;
  if (ticketSnapshot?.purchaseClassification === "structured") {
    const snapshot = resolveStructuredPlan(
      ticketSnapshot.betPlan,
      normalizeTickets(ticketSnapshot.tickets),
      "ticket-snapshot",
    );
    if (snapshot) return snapshot;
  }

  return parseExplicitTextTickets(predictionText) ?? {
    status: "unknown",
    source: "unknown",
    purchaseTickets: [],
    shadowTickets: [],
    warnings: [],
  };
}

const ticketMatchesResult = (ticket: ReviewTicket, resultOrder: string) => {
  const expectedParts = ticket.betType === "3連単" ? 3 : 2;
  const parts = String(resultOrder ?? "").normalize("NFKC").match(/[1-9]/g) ?? [];
  if (parts.length < expectedParts) return false;
  return ticket.combination === parts.slice(0, expectedParts).join("-");
};

export function evaluateReviewRacePerformance(input: {
  predictionJson?: ReviewPredictionJsonLike | null;
  predictionText?: string;
  settled: boolean;
  resultOrder?: string;
  payoutByBetType?: Partial<Record<ReviewTicket["betType"], number>>;
  manualActualInvestment?: number;
}): ReviewRacePerformance {
  const classification = classifyReviewTickets(input.predictionJson, input.predictionText);
  const base = {
    classification,
    purchaseHit: false,
    shadowOnlyHit: false,
    matchedPurchaseTickets: [] as ReviewTicket[],
    matchedShadowTickets: [] as ReviewTicket[],
  };
  if (!input.settled) return { ...base, status: "pending" };
  if (classification.status === "unknown") return { ...base, status: "unknown" };

  const unitStakeYen = classification.unitStakeYen ?? 100;
  const calculatedInvestment = classification.purchaseTickets.length * unitStakeYen;
  const actualInvestment = Number.isFinite(input.manualActualInvestment) && Number(input.manualActualInvestment) >= 0
    ? Number(input.manualActualInvestment)
    : calculatedInvestment;
  const matchedPurchaseTickets = classification.purchaseTickets.filter((ticket) => ticketMatchesResult(ticket, input.resultOrder ?? ""));
  const matchedShadowTickets = matchedPurchaseTickets.length === 0
    ? classification.shadowTickets.filter((ticket) => ticketMatchesResult(ticket, input.resultOrder ?? ""))
    : [];
  const payoutFor = (ticket: ReviewTicket) => {
    const payout = Number(input.payoutByBetType?.[ticket.betType]);
    return Number.isFinite(payout) && payout >= 0 ? Math.round(payout * (unitStakeYen / 100)) : 0;
  };
  const actualPayout = matchedPurchaseTickets.reduce((sum, ticket) => sum + payoutFor(ticket), 0);
  const shadowReferencePayout = matchedShadowTickets.reduce((sum, ticket) => sum + payoutFor(ticket), 0);
  const actualProfit = actualPayout - actualInvestment;
  const actualRoi = actualInvestment > 0 ? (actualPayout / actualInvestment) * 100 : undefined;
  const status: ReviewRacePerformanceStatus = matchedPurchaseTickets.length > 0
    ? "purchase-hit"
    : matchedShadowTickets.length > 0
      ? "shadow-hit"
      : "miss";

  return {
    ...base,
    status,
    actualInvestment,
    actualPayout,
    actualProfit,
    actualRoi,
    shadowReferencePayout,
    purchaseHit: status === "purchase-hit",
    shadowOnlyHit: status === "shadow-hit",
    matchedPurchaseTickets,
    matchedShadowTickets,
  };
}

export function aggregateReviewPerformance(
  races: Array<{ hasPrediction: boolean; performance: ReviewRacePerformance }>,
): ReviewPerformanceSummary {
  const predictions = races.filter((race) => race.hasPrediction);
  const settled = predictions.filter((race) => race.performance.status !== "pending");
  const classified = settled.filter((race) => race.performance.classification.status === "classified");
  const purchaseHitCount = classified.filter((race) => race.performance.status === "purchase-hit").length;
  const shadowHitCount = classified.filter((race) => race.performance.status === "shadow-hit").length;
  const actualInvestment = classified.reduce((sum, race) => sum + (race.performance.actualInvestment ?? 0), 0);
  const actualPayout = classified.reduce((sum, race) => sum + (race.performance.actualPayout ?? 0), 0);

  return {
    predictionRaceCount: predictions.length,
    settledRaceCount: settled.length,
    classifiedSettledRaceCount: classified.length,
    purchaseHitCount,
    shadowHitCount,
    capturedHitCount: purchaseHitCount + shadowHitCount,
    unknownCount: settled.filter((race) => race.performance.status === "unknown").length,
    pendingCount: predictions.filter((race) => race.performance.status === "pending").length,
    actualInvestment,
    actualPayout,
    actualProfit: actualPayout - actualInvestment,
    actualHitRate: classified.length > 0 ? (purchaseHitCount / classified.length) * 100 : undefined,
    actualRoi: actualInvestment > 0 ? (actualPayout / actualInvestment) * 100 : undefined,
    shadowCoverageRate: classified.length > 0 ? ((purchaseHitCount + shadowHitCount) / classified.length) * 100 : undefined,
  };
}

const sortedUniqueRaceNumbers = (values: Iterable<number>) => [...new Set([...values].filter(Number.isFinite))].sort((a, b) => a - b);

export function compareReviewRaceReadiness(
  targetRaceNumbers: Iterable<number>,
  predictionRaceNumbers: Iterable<number>,
  resultRaceNumbers: Iterable<number>,
): ReviewRaceReadiness {
  const target = sortedUniqueRaceNumbers(targetRaceNumbers);
  const predictions = sortedUniqueRaceNumbers(predictionRaceNumbers);
  const results = sortedUniqueRaceNumbers(resultRaceNumbers);
  const predictionSet = new Set(predictions);
  const resultSet = new Set(results);
  const targetSet = new Set(target);
  return {
    targetRaceNumbers: target,
    predictionRaceNumbers: predictions,
    resultRaceNumbers: results,
    predictionMissingRaceNumbers: target.filter((raceNumber) => !predictionSet.has(raceNumber)),
    resultMissingRaceNumbers: target.filter((raceNumber) => !resultSet.has(raceNumber)),
    predictionOnlyRaceNumbers: predictions.filter((raceNumber) => !resultSet.has(raceNumber)),
    resultOnlyRaceNumbers: results.filter((raceNumber) => !predictionSet.has(raceNumber)),
    raceNumbersMatch:
      predictions.length === results.length &&
      predictions.every((raceNumber) => resultSet.has(raceNumber)) &&
      predictions.every((raceNumber) => targetSet.has(raceNumber)),
  };
}
