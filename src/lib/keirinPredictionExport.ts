import type {
  KurariExPredictionFailureGuidanceArtifact,
  KurariExRaceRiskIndex,
  KurariExRaceRiskRecord,
} from "./kurariExData";
import {
  lookupKurariExFailureGuidanceForRace,
  lookupKurariExRaceRiskForRace,
} from "./kurariExData";

export type KeirinPredictionExportFeedRace = {
  raceNo: number;
  title?: string;
  isGirls?: boolean;
};

export type KeirinPredictionExportFeedVenue = {
  venue: string;
  venueCode?: string;
  slug?: string;
  grade?: string;
  session?: string;
  raceIds?: string[];
  races: KeirinPredictionExportFeedRace[];
};

export type KeirinPredictionExportFeed = {
  date: string;
  venues: KeirinPredictionExportFeedVenue[];
};

export type KeirinPredictionExportSlot = {
  raceId?: string;
  venue?: string;
  date?: string;
  raceNumber?: number;
  predictionText?: string;
  predictionJson?: {
    tickets?: Array<{
      index?: string;
      betType?: string;
      combination?: string;
      group?: string;
      note?: string;
    }>;
    betPlan?: {
      version?: number;
      status?: string;
      source?: string;
      purchaseTicketIndices?: unknown[];
      shadowTicketIndices?: unknown[];
      declaredHeadCandidates?: unknown[];
      unitStakeYen?: number;
      actualStakeYen?: number | null;
    };
  };
};

export type KeirinPredictionTicketSnapshot = {
  index: string;
  betType: string;
  combination: string;
  group?: string;
  note?: string;
};

export type KeirinPredictionRiskSnapshot = {
  status: "available" | "unavailable";
  source: "kurari-ex-race-risk";
  sourceVersion?: string;
  targetDate?: string;
  generatedAt?: string;
  riskLevel?: string;
  riskScore?: number;
  pointRange?: {
    action: string;
    label: string;
    min: number | null;
    max: number | null;
  };
  confidence?: string;
  signals?: Array<{
    key: string;
    label: string;
    value: string;
    contribution: number;
    source: string;
    confidence: string;
    note?: string;
  }>;
};

export type KeirinPredictionBetPlanSnapshot = {
  source: "slot.predictionJson.betPlan";
  status: "structured";
  sourceStatus: "source-backed";
  purchaseTicketIndices: string[];
  shadowTicketIndices: string[];
  unclassifiedTicketIndices: string[];
  structuredPurchaseCount: number;
  structuredShadowCount: number;
  structuredUnclassifiedCount: number;
  recommendedPurchaseCount: number | null;
  purchaseCountDifference: number | null;
  purchaseDerivedHeads: string[];
  purchaseDerivedHeadCount: number;
  declaredHeadCandidates: string[];
  unitStakeYen: 100;
  plannedStakeYen: number;
  actualStakeYen: null;
};

export type KeirinPredictionPreRaceSnapshot = {
  version: 1;
  capturedAt: string;
  source: "prediction-page-export";
  raceIdentity: {
    date: string;
    raceId: string;
    venueName: string;
    venueKey: string;
    venueCode?: string;
    raceNumber: number;
  };
  risk: KeirinPredictionRiskSnapshot;
  failure: {
    status: "available" | "unavailable";
    source: "kurari-ex-prediction-failure-guidance";
    targetDate?: string;
    generatedAt?: string;
    historicalFrom?: string;
    historicalTo?: string;
    usage?: string;
    freshnessStatus?: string;
    strongContextCount?: number;
  };
  ticketSnapshot: {
    source: "slot.predictionJson.tickets";
    purchaseClassification: "unavailable" | "structured";
    tickets: KeirinPredictionTicketSnapshot[];
    trifectaTicketCount: number;
    exactaTicketCount: number;
    actualTicketCount: number;
    riskRecommendedSkip: boolean;
    riskPointRangeAction?: string;
    betPlan?: KeirinPredictionBetPlanSnapshot;
  };
  stake: {
    unitStakeYen: 100;
    actualStakeYen: null;
    calculatedCandidateStakeYen: number;
    plannedStakeYen: number | null;
    actualStakeSource: "unavailable";
  };
  headCandidates:
    | {
        status: "unavailable";
        source: "not-structured";
      }
    | {
        status: "structured";
        source: "slot.predictionJson.betPlan";
        declaredHeadCandidates: string[];
        purchaseDerivedHeads: string[];
        purchaseDerivedHeadCount: number;
      };
  evidence: {
    player: {
      status: "available" | "unavailable";
      source: "prediction-material";
      note: string;
    };
    matchup: {
      status: "available" | "unavailable";
      source: "prediction-material";
      note: string;
    };
    venue: {
      status: "available";
      source: "prediction-feed";
      grade?: string;
      timeslot?: string;
    };
  };
};

export type KeirinPredictionExportItem = {
  raceId: string;
  date: string;
  venueName: string;
  venueKey: string;
  venueCode?: string;
  raceNumber: number;
  raceTitle: string;
  grade: string;
  timeslot: string;
  predictionStatus: "structured";
  trifectaTickets: string[];
  exactaTickets: string[];
  confidence: string;
  raceType: string;
  tags: string[];
  isSpecialRace: boolean;
  preRaceSnapshot?: KeirinPredictionPreRaceSnapshot;
};

export type KeirinPredictionExportPayload = {
  schemaVersion: 1;
  generatedAt: string;
  date: string;
  source: "prediction-page-local-export";
  raceCount: number;
  items: KeirinPredictionExportItem[];
};

export type KeirinPredictionExportSummary = {
  date: string;
  savedRaceCount: number;
  structuredRaceCount: number;
  raceIdCount: number;
  exportRaceCount: number;
  excludedRaceCount: number;
  excludedReasons: Record<string, number>;
};

export type KeirinPredictionExportOptions = {
  raceRisk?: KurariExRaceRiskIndex | null;
  failureGuidance?: KurariExPredictionFailureGuidanceArtifact | null;
};

const normalizedUnique = (values: unknown[]) => (
  [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))].sort()
);

const normalizeTicket = (value: unknown, length: number) => {
  const numbers = String(value ?? "").match(/[1-9]/gu) ?? [];
  if (numbers.length !== length || new Set(numbers).size !== length) return "";
  return numbers.join("-");
};

const findFeedRace = (
  feed: KeirinPredictionExportFeed,
  slot: KeirinPredictionExportSlot,
) => {
  const raceId = String(slot.raceId ?? "").trim();
  for (const venue of feed.venues) {
    const raceIndex = venue.raceIds?.findIndex((value) => String(value ?? "").trim() === raceId) ?? -1;
    if (raceIndex >= 0) return { venue, race: venue.races[raceIndex] };
  }
  const venueName = String(slot.venue ?? "").trim();
  const venue = feed.venues.find((item) => item.venue === venueName);
  const race = venue?.races.find((item) => item.raceNo === Number(slot.raceNumber));
  return venue && race ? { venue, race } : null;
};

const parseMetadata = (text: string) => ({
  confidence: text.match(/自信度\s*[:：]?\s*([^\r\n]+)/u)?.[1]?.trim() ?? "",
  raceType: text.match(/レース(?:タイプ|型)\s*[:：]?\s*([^\r\n]+)/u)?.[1]?.trim() ?? "",
  tags: normalizedUnique(text.match(/#[^\s#]+/gu) ?? []),
});

const normalizeTicketSnapshot = (
  tickets: NonNullable<KeirinPredictionExportSlot["predictionJson"]>["tickets"],
): KeirinPredictionTicketSnapshot[] => (
  Array.isArray(tickets)
    ? tickets.map((ticket, index) => ({
        index: String(ticket?.index ?? index + 1).padStart(2, "0"),
        betType: String(ticket?.betType ?? "").trim(),
        combination: String(ticket?.combination ?? "").trim(),
        ...(String(ticket?.group ?? "").trim() ? { group: String(ticket?.group ?? "").trim() } : {}),
        ...(String(ticket?.note ?? "").trim() ? { note: String(ticket?.note ?? "").trim() } : {}),
      })).filter((ticket) => ticket.betType && ticket.combination)
    : []
);

const normalizeBetPlanIndex = (value: unknown) => {
  const text = String(value ?? "").trim();
  const numeric = text.match(/^\d+$/u)?.[0];
  return numeric ? numeric.padStart(2, "0") : text;
};

const normalizeBetPlanIndexList = (values: unknown) => (
  [...new Set(
    (Array.isArray(values) ? values : [])
      .map(normalizeBetPlanIndex)
      .filter(Boolean),
  )]
);

const normalizeHeadCandidateList = (values: unknown) => (
  [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value ?? "").trim())
      .filter((value) => /^[1-9]$/u.test(value)),
  )].sort()
);

const getRiskRecommendedPurchaseCount = (risk: KeirinPredictionRiskSnapshot) => {
  const action = risk.pointRange?.action;
  if (action === "SKIP") return 0;
  const max = risk.pointRange?.max;
  if (Number.isFinite(Number(max))) return Number(max);
  return null;
};

const buildStructuredBetPlanSnapshot = (
  betPlan: NonNullable<KeirinPredictionExportSlot["predictionJson"]>["betPlan"] | undefined,
  tickets: KeirinPredictionTicketSnapshot[],
  risk: KeirinPredictionRiskSnapshot,
): KeirinPredictionBetPlanSnapshot | null => {
  if (!betPlan || betPlan.status !== "structured") return null;
  const ticketIndexSet = new Set(tickets.map((ticket) => ticket.index));
  const purchaseTicketIndices = normalizeBetPlanIndexList(betPlan.purchaseTicketIndices)
    .filter((index) => ticketIndexSet.has(index));
  const shadowTicketIndices = normalizeBetPlanIndexList(betPlan.shadowTicketIndices)
    .filter((index) => ticketIndexSet.has(index));
  if (purchaseTicketIndices.length === 0 && shadowTicketIndices.length === 0) return null;
  const classified = new Set([...purchaseTicketIndices, ...shadowTicketIndices]);
  const unclassifiedTicketIndices = tickets
    .map((ticket) => ticket.index)
    .filter((index) => !classified.has(index));
  const purchaseTicketIndexSet = new Set(purchaseTicketIndices);
  const purchaseDerivedHeads = [...new Set(
    tickets
      .filter((ticket) => purchaseTicketIndexSet.has(ticket.index) && ticket.betType.includes("3連単"))
      .map((ticket) => ticket.combination.split("-")[0]?.trim() ?? "")
      .filter((value) => /^[1-9]$/u.test(value)),
  )].sort();
  const recommendedPurchaseCount = getRiskRecommendedPurchaseCount(risk);
  const structuredPurchaseCount = purchaseTicketIndices.length;

  return {
    source: "slot.predictionJson.betPlan",
    status: "structured",
    sourceStatus: "source-backed",
    purchaseTicketIndices,
    shadowTicketIndices,
    unclassifiedTicketIndices,
    structuredPurchaseCount,
    structuredShadowCount: shadowTicketIndices.length,
    structuredUnclassifiedCount: unclassifiedTicketIndices.length,
    recommendedPurchaseCount,
    purchaseCountDifference: recommendedPurchaseCount == null ? null : structuredPurchaseCount - recommendedPurchaseCount,
    purchaseDerivedHeads,
    purchaseDerivedHeadCount: purchaseDerivedHeads.length,
    declaredHeadCandidates: normalizeHeadCandidateList(betPlan.declaredHeadCandidates),
    unitStakeYen: 100,
    plannedStakeYen: structuredPurchaseCount * 100,
    actualStakeYen: null,
  };
};

const buildRiskSnapshot = (
  artifact: KurariExRaceRiskIndex | null | undefined,
  record: KurariExRaceRiskRecord | null,
): KeirinPredictionRiskSnapshot => {
  if (!artifact || !record) {
    return {
      status: "unavailable",
      source: "kurari-ex-race-risk",
    };
  }
  return {
    status: "available",
    source: "kurari-ex-race-risk",
    sourceVersion: artifact.version,
    targetDate: artifact.period.date,
    generatedAt: artifact.generatedAt,
    riskLevel: record.riskLevel,
    riskScore: record.riskScore,
    pointRange: record.pointRange,
    confidence: record.confidence,
    signals: record.signals.map((signal) => ({
      key: signal.key,
      label: signal.label,
      value: signal.value,
      contribution: signal.contribution,
      source: signal.source,
      confidence: signal.confidence,
      ...(signal.note ? { note: signal.note } : {}),
    })),
  };
};

const buildPreRaceSnapshot = ({
  feed,
  raceId,
  venue,
  race,
  tickets,
  betPlan,
  generatedAt,
  options,
}: {
  feed: KeirinPredictionExportFeed;
  raceId: string;
  venue: KeirinPredictionExportFeedVenue;
  race: KeirinPredictionExportFeedRace;
  tickets: NonNullable<KeirinPredictionExportSlot["predictionJson"]>["tickets"];
  betPlan?: NonNullable<KeirinPredictionExportSlot["predictionJson"]>["betPlan"];
  generatedAt: string;
  options: KeirinPredictionExportOptions;
}): KeirinPredictionPreRaceSnapshot => {
  const raceRiskRecord = options.raceRisk
    ? lookupKurariExRaceRiskForRace(options.raceRisk, {
        raceDate: feed.date,
        venueCode: venue.venueCode,
        venueSlug: venue.slug,
        venueName: venue.venue,
        raceNo: race.raceNo,
      })
    : null;
  const failureLookup = options.failureGuidance
    ? lookupKurariExFailureGuidanceForRace(options.failureGuidance, {
        raceDate: feed.date,
        venueSlug: venue.slug,
        venueKey: venue.slug,
        raceNo: race.raceNo,
      })
    : null;
  const ticketSnapshot = normalizeTicketSnapshot(tickets);
  const trifectaTicketCount = ticketSnapshot.filter((ticket) => ticket.betType.includes("3連単")).length;
  const exactaTicketCount = ticketSnapshot.filter((ticket) => ticket.betType.includes("2車単")).length;
  const risk = buildRiskSnapshot(options.raceRisk, raceRiskRecord);
  const riskPointRangeAction = risk.pointRange?.action;
  const betPlanSnapshot = buildStructuredBetPlanSnapshot(betPlan, ticketSnapshot, risk);

  return {
    version: 1,
    capturedAt: generatedAt,
    source: "prediction-page-export",
    raceIdentity: {
      date: feed.date,
      raceId,
      venueName: venue.venue,
      venueKey: venue.slug ?? "",
      ...(venue.venueCode ? { venueCode: venue.venueCode } : {}),
      raceNumber: race.raceNo,
    },
    risk,
    failure: failureLookup && options.failureGuidance
      ? {
          status: "available",
          source: "kurari-ex-prediction-failure-guidance",
          targetDate: options.failureGuidance.targetDate,
          generatedAt: options.failureGuidance.generatedAt,
          historicalFrom: options.failureGuidance.historicalFrom,
          historicalTo: options.failureGuidance.historicalTo,
          usage: failureLookup.usage,
          freshnessStatus: failureLookup.effectiveFreshness.status,
          strongContextCount: failureLookup.strongContexts.length,
        }
      : {
          status: "unavailable",
          source: "kurari-ex-prediction-failure-guidance",
        },
    ticketSnapshot: {
      source: "slot.predictionJson.tickets",
      purchaseClassification: betPlanSnapshot ? "structured" : "unavailable",
      tickets: ticketSnapshot,
      trifectaTicketCount,
      exactaTicketCount,
      actualTicketCount: ticketSnapshot.length,
      riskRecommendedSkip: riskPointRangeAction === "SKIP",
      ...(riskPointRangeAction ? { riskPointRangeAction } : {}),
      ...(betPlanSnapshot ? { betPlan: betPlanSnapshot } : {}),
    },
    stake: {
      unitStakeYen: 100,
      actualStakeYen: null,
      calculatedCandidateStakeYen: ticketSnapshot.length * 100,
      plannedStakeYen: betPlanSnapshot?.plannedStakeYen ?? null,
      actualStakeSource: "unavailable",
    },
    headCandidates: betPlanSnapshot
      ? {
          status: "structured",
          source: "slot.predictionJson.betPlan",
          declaredHeadCandidates: betPlanSnapshot.declaredHeadCandidates,
          purchaseDerivedHeads: betPlanSnapshot.purchaseDerivedHeads,
          purchaseDerivedHeadCount: betPlanSnapshot.purchaseDerivedHeadCount,
        }
      : {
          status: "unavailable",
          source: "not-structured",
        },
    evidence: {
      player: {
        status: "available",
        source: "prediction-material",
        note: "Prediction materialに反映されたPLAYER EXのみ。GPT採用・買い目採用は未確定。",
      },
      matchup: {
        status: "available",
        source: "prediction-material",
        note: "Prediction materialに反映されたMATCHUP EXのみ。specific comparison採用は未確定。",
      },
      venue: {
        status: "available",
        source: "prediction-feed",
        ...(venue.grade ? { grade: venue.grade } : {}),
        ...(venue.session ? { timeslot: venue.session } : {}),
      },
    },
  };
};

export function buildKeirinPredictionExport(
  feed: KeirinPredictionExportFeed,
  slots: Record<string, KeirinPredictionExportSlot>,
  options: KeirinPredictionExportOptions = {},
  generatedAt = new Date().toISOString(),
) {
  const todaySlots = Object.values(slots).filter((slot) => slot?.date === feed.date);
  const excludedReasons: Record<string, number> = {};
  const exclude = (reason: string) => {
    excludedReasons[reason] = (excludedReasons[reason] ?? 0) + 1;
  };
  const items: KeirinPredictionExportItem[] = [];
  let structuredRaceCount = 0;
  let raceIdCount = 0;

  for (const slot of todaySlots) {
    const raceId = String(slot.raceId ?? "").trim();
    if (raceId) raceIdCount += 1;
    const tickets = Array.isArray(slot.predictionJson?.tickets)
      ? slot.predictionJson.tickets
      : [];
    const trifectaTickets = normalizedUnique(
      tickets
        .filter((ticket) => String(ticket?.betType ?? "").includes("3連単"))
        .map((ticket) => normalizeTicket(ticket?.combination, 3)),
    );
    const exactaTickets = normalizedUnique(
      tickets
        .filter((ticket) => String(ticket?.betType ?? "").includes("2車単"))
        .map((ticket) => normalizeTicket(ticket?.combination, 2)),
    );
    const structured = trifectaTickets.length + exactaTickets.length > 0;
    if (structured) structuredRaceCount += 1;
    if (!raceId) {
      exclude("raceId missing");
      continue;
    }
    if (!structured) {
      exclude("structured tickets missing");
      continue;
    }
    const context = findFeedRace(feed, slot);
    if (!context) {
      exclude("feed race not found");
      continue;
    }
    const metadata = parseMetadata(String(slot.predictionText ?? ""));
    items.push({
      raceId,
      date: feed.date,
      venueName: context.venue.venue,
      venueKey: context.venue.slug ?? "",
      ...(context.venue.venueCode ? { venueCode: context.venue.venueCode } : {}),
      raceNumber: context.race.raceNo,
      raceTitle: context.race.title ?? "",
      grade: context.venue.grade ?? "",
      timeslot: context.venue.session ?? "",
      predictionStatus: "structured",
      trifectaTickets,
      exactaTickets,
      confidence: metadata.confidence,
      raceType: metadata.raceType,
      tags: metadata.tags,
      isSpecialRace: Boolean(
        context.race.isGirls
        || /決勝|特選|優秀|記念|グランプリ|ダービー/u.test(context.race.title ?? ""),
      ),
      preRaceSnapshot: buildPreRaceSnapshot({
        feed,
        raceId,
        venue: context.venue,
        race: context.race,
        tickets,
        betPlan: slot.predictionJson?.betPlan,
        generatedAt,
        options,
      }),
    });
  }
  items.sort((left, right) => left.raceId.localeCompare(right.raceId));
  const payload: KeirinPredictionExportPayload = {
    schemaVersion: 1,
    generatedAt,
    date: feed.date,
    source: "prediction-page-local-export",
    raceCount: items.length,
    items,
  };
  const summary: KeirinPredictionExportSummary = {
    date: feed.date,
    savedRaceCount: todaySlots.length,
    structuredRaceCount,
    raceIdCount,
    exportRaceCount: items.length,
    excludedRaceCount: todaySlots.length - items.length,
    excludedReasons,
  };
  return { payload, summary };
}

export function downloadKeirinPredictionExport(payload: KeirinPredictionExportPayload) {
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
    type: "application/json;charset=utf-8",
  });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `keirin-predictions-${payload.date}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
}
