import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  collectFiles,
  projectRoot,
  serializeJson,
} from "./kurari-ex-history-common.mjs";
import { writeTextIfChanged } from "./lib/write-json-if-changed.mjs";

export const dailyPredictionsRoot = path.join(
  projectRoot,
  "public",
  "data",
  "predictions",
  "daily",
);
export const dailyPredictionsIndexPath = path.join(
  dailyPredictionsRoot,
  "index.generated.json",
);
export const savedPredictionsPath = path.join(
  projectRoot,
  "public",
  "data",
  "predictions",
  "saved-predictions.generated.json",
);

export function parseJson(text) {
  return JSON.parse(String(text).replace(/^\uFEFF/u, ""));
}

export function normalizeStringList(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value ?? "").trim())
      .filter(Boolean),
  )].sort();
}

function normalizeTicket(value, length) {
  const text = String(value ?? "").trim();
  if (!new RegExp(`^[1-9](?:-[1-9]){${length - 1}}$`, "u").test(text)) return null;
  const numbers = text.split("-");
  if (new Set(numbers).size !== length) return null;
  return text;
}

const allowedRiskLevels = new Set(["LOW", "MEDIUM", "HIGH", "VERY_HIGH", "INSUFFICIENT"]);
const allowedPointRangeActions = new Set(["BASE_8", "VALUE_10", "STRONG_VALUE_12", "MAX_14", "SKIP"]);
const allowedConfidence = new Set(["high", "medium", "low"]);

function normalizeBetPlanIndex(value) {
  const text = String(value ?? "").trim();
  return /^\d+$/u.test(text) ? text.padStart(2, "0") : text;
}

function normalizeBetPlanIndexList(values) {
  return (Array.isArray(values) ? values : [])
    .map(normalizeBetPlanIndex)
    .filter(Boolean);
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function getDuplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

function getRecommendedPurchaseCount(risk) {
  if (risk?.pointRange?.action === "SKIP") return 0;
  const max = risk?.pointRange?.max;
  return Number.isFinite(Number(max)) ? Number(max) : null;
}

function derivePurchaseHeads(tickets, purchaseTicketIndices) {
  const purchaseSet = new Set(purchaseTicketIndices);
  return sortedUnique(tickets
    .filter((ticket) => purchaseSet.has(ticket.index) && ticket.betType.includes("3連単"))
    .map((ticket) => String(ticket.combination ?? "").split("-")[0]?.trim() ?? "")
    .filter((value) => /^[1-9]$/u.test(value)));
}

function normalizeBetPlanSnapshot(ticketSnapshot, snapshotTickets, risk, prefix, errors) {
  const raw = ticketSnapshot.betPlan;
  if (raw == null) return undefined;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    errors.push(`${prefix}.preRaceSnapshot.ticketSnapshot.betPlan must be an object`);
    return undefined;
  }
  const ticketIndices = snapshotTickets.map((ticket) => ticket.index);
  const ticketIndexSet = new Set(ticketIndices);
  const purchaseTicketIndicesRaw = normalizeBetPlanIndexList(raw.purchaseTicketIndices);
  const shadowTicketIndicesRaw = normalizeBetPlanIndexList(raw.shadowTicketIndices);
  const purchaseTicketIndices = sortedUnique(purchaseTicketIndicesRaw);
  const shadowTicketIndices = sortedUnique(shadowTicketIndicesRaw);
  const duplicatePurchase = getDuplicateValues(purchaseTicketIndicesRaw);
  const duplicateShadow = getDuplicateValues(shadowTicketIndicesRaw);
  const missingPurchase = purchaseTicketIndices.filter((index) => !ticketIndexSet.has(index));
  const missingShadow = shadowTicketIndices.filter((index) => !ticketIndexSet.has(index));
  const overlap = purchaseTicketIndices.filter((index) => shadowTicketIndices.includes(index));
  if (raw.status !== "structured") errors.push(`${prefix}.preRaceSnapshot.ticketSnapshot.betPlan.status is invalid`);
  if (raw.source !== "slot.predictionJson.betPlan") errors.push(`${prefix}.preRaceSnapshot.ticketSnapshot.betPlan.source is invalid`);
  if (raw.sourceStatus !== "source-backed") errors.push(`${prefix}.preRaceSnapshot.ticketSnapshot.betPlan.sourceStatus is invalid`);
  if (duplicatePurchase.length > 0) errors.push(`${prefix}.preRaceSnapshot.ticketSnapshot.betPlan.purchaseTicketIndices duplicate: ${duplicatePurchase.join(",")}`);
  if (duplicateShadow.length > 0) errors.push(`${prefix}.preRaceSnapshot.ticketSnapshot.betPlan.shadowTicketIndices duplicate: ${duplicateShadow.join(",")}`);
  if (missingPurchase.length > 0) errors.push(`${prefix}.preRaceSnapshot.ticketSnapshot.betPlan.purchaseTicketIndices missing tickets: ${missingPurchase.join(",")}`);
  if (missingShadow.length > 0) errors.push(`${prefix}.preRaceSnapshot.ticketSnapshot.betPlan.shadowTicketIndices missing tickets: ${missingShadow.join(",")}`);
  if (overlap.length > 0) errors.push(`${prefix}.preRaceSnapshot.ticketSnapshot.betPlan purchase/shadow overlap: ${overlap.join(",")}`);
  const classified = new Set([...purchaseTicketIndices, ...shadowTicketIndices]);
  const unclassifiedTicketIndices = ticketIndices.filter((index) => !classified.has(index));
  const purchaseDerivedHeads = derivePurchaseHeads(snapshotTickets, purchaseTicketIndices);
  const recommendedPurchaseCount = getRecommendedPurchaseCount(risk);
  const plannedStakeYen = purchaseTicketIndices.length * 100;
  if (Number(raw.structuredPurchaseCount) !== purchaseTicketIndices.length) {
    errors.push(`${prefix}.preRaceSnapshot.ticketSnapshot.betPlan.structuredPurchaseCount mismatch`);
  }
  if (Number(raw.structuredShadowCount) !== shadowTicketIndices.length) {
    errors.push(`${prefix}.preRaceSnapshot.ticketSnapshot.betPlan.structuredShadowCount mismatch`);
  }
  if (Number(raw.structuredUnclassifiedCount) !== unclassifiedTicketIndices.length) {
    errors.push(`${prefix}.preRaceSnapshot.ticketSnapshot.betPlan.structuredUnclassifiedCount mismatch`);
  }
  if (Number(raw.plannedStakeYen) !== plannedStakeYen) {
    errors.push(`${prefix}.preRaceSnapshot.ticketSnapshot.betPlan.plannedStakeYen mismatch`);
  }
  if (raw.actualStakeYen != null) {
    errors.push(`${prefix}.preRaceSnapshot.ticketSnapshot.betPlan.actualStakeYen must be null pre-race`);
  }
  return {
    source: "slot.predictionJson.betPlan",
    status: "structured",
    sourceStatus: "source-backed",
    purchaseTicketIndices,
    shadowTicketIndices,
    unclassifiedTicketIndices,
    structuredPurchaseCount: purchaseTicketIndices.length,
    structuredShadowCount: shadowTicketIndices.length,
    structuredUnclassifiedCount: unclassifiedTicketIndices.length,
    recommendedPurchaseCount,
    purchaseCountDifference: recommendedPurchaseCount == null ? null : purchaseTicketIndices.length - recommendedPurchaseCount,
    purchaseDerivedHeads,
    purchaseDerivedHeadCount: purchaseDerivedHeads.length,
    declaredHeadCandidates: normalizeStringList(raw.declaredHeadCandidates).filter((value) => /^[1-9]$/u.test(value)),
    unitStakeYen: 100,
    plannedStakeYen,
    actualStakeYen: null,
  };
}

function normalizeSnapshotTicket(raw, prefix, errors) {
  const index = String(raw?.index ?? "").trim();
  const betType = String(raw?.betType ?? "").trim();
  const combination = String(raw?.combination ?? "").trim();
  if (!index) errors.push(`${prefix}.index is empty`);
  if (!betType) errors.push(`${prefix}.betType is empty`);
  if (!combination) errors.push(`${prefix}.combination is empty`);
  return {
    index,
    betType,
    combination,
    ...(String(raw?.group ?? "").trim() ? { group: String(raw.group).trim() } : {}),
    ...(String(raw?.note ?? "").trim() ? { note: String(raw.note).trim() } : {}),
  };
}

function normalizePreRaceSnapshot(raw, item, payloadDate, prefix, errors) {
  if (raw == null) return undefined;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    errors.push(`${prefix}.preRaceSnapshot must be an object`);
    return undefined;
  }
  if (raw.version !== 1) errors.push(`${prefix}.preRaceSnapshot.version is invalid`);
  const raceIdentity = raw.raceIdentity ?? {};
  if (raceIdentity.date !== payloadDate || raceIdentity.date !== item.date) {
    errors.push(`${prefix}.preRaceSnapshot.raceIdentity.date mismatch`);
  }
  if (String(raceIdentity.raceId ?? "").trim() !== item.raceId) {
    errors.push(`${prefix}.preRaceSnapshot.raceIdentity.raceId mismatch`);
  }
  if (Number(raceIdentity.raceNumber) !== item.raceNumber) {
    errors.push(`${prefix}.preRaceSnapshot.raceIdentity.raceNumber mismatch`);
  }
  if (String(raceIdentity.venueName ?? "").trim() !== item.venueName) {
    errors.push(`${prefix}.preRaceSnapshot.raceIdentity.venueName mismatch`);
  }

  const risk = raw.risk ?? {};
  if (!["available", "unavailable"].includes(risk.status)) {
    errors.push(`${prefix}.preRaceSnapshot.risk.status is invalid`);
  }
  if (risk.status === "available") {
    if (risk.targetDate !== payloadDate) errors.push(`${prefix}.preRaceSnapshot.risk.targetDate mismatch`);
    if (!allowedRiskLevels.has(risk.riskLevel)) errors.push(`${prefix}.preRaceSnapshot.risk.riskLevel is invalid`);
    if (!Number.isFinite(Number(risk.riskScore))) errors.push(`${prefix}.preRaceSnapshot.risk.riskScore is invalid`);
    if (!allowedConfidence.has(risk.confidence)) errors.push(`${prefix}.preRaceSnapshot.risk.confidence is invalid`);
    if (!risk.pointRange || !allowedPointRangeActions.has(risk.pointRange.action)) {
      errors.push(`${prefix}.preRaceSnapshot.risk.pointRange.action is invalid`);
    }
    if (!Array.isArray(risk.signals) || risk.signals.length === 0) {
      errors.push(`${prefix}.preRaceSnapshot.risk.signals is empty`);
    }
    for (const [signalIndex, signal] of (Array.isArray(risk.signals) ? risk.signals : []).entries()) {
      const signalPrefix = `${prefix}.preRaceSnapshot.risk.signals[${signalIndex}]`;
      if (!String(signal?.key ?? "").trim()) errors.push(`${signalPrefix}.key is empty`);
      if (!String(signal?.source ?? "").trim()) errors.push(`${signalPrefix}.source is empty`);
      if (!Number.isFinite(Number(signal?.contribution))) errors.push(`${signalPrefix}.contribution is invalid`);
      if (!allowedConfidence.has(signal?.confidence)) errors.push(`${signalPrefix}.confidence is invalid`);
      if (/current.*result|current.*payout|today.*result|today.*payout|finishOrder|refund|払戻|確定結果/iu.test(String(signal?.source ?? ""))) {
        errors.push(`${signalPrefix}.source has current result leakage`);
      }
      if (/fake|synthetic|fuzzy/iu.test(String(signal?.source ?? ""))) {
        errors.push(`${signalPrefix}.source has fake/fuzzy marker`);
      }
    }
  }

  const ticketSnapshot = raw.ticketSnapshot ?? {};
  const snapshotTickets = Array.isArray(ticketSnapshot.tickets)
    ? ticketSnapshot.tickets.map((ticket, ticketIndex) => normalizeSnapshotTicket(
        ticket,
        `${prefix}.preRaceSnapshot.ticketSnapshot.tickets[${ticketIndex}]`,
        errors,
      ))
    : [];
  if (!Array.isArray(ticketSnapshot.tickets)) {
    errors.push(`${prefix}.preRaceSnapshot.ticketSnapshot.tickets must be an array`);
  }
  if (ticketSnapshot.purchaseClassification !== "unavailable") {
    if (ticketSnapshot.purchaseClassification !== "structured") {
      errors.push(`${prefix}.preRaceSnapshot.ticketSnapshot.purchaseClassification must be unavailable or structured`);
    }
  }
  if (Number(ticketSnapshot.actualTicketCount) !== snapshotTickets.length) {
    errors.push(`${prefix}.preRaceSnapshot.ticketSnapshot.actualTicketCount mismatch`);
  }
  const normalizedRisk = risk.status === "available"
    ? {
        status: "available",
        source: "kurari-ex-race-risk",
        ...(String(risk.sourceVersion ?? "").trim() ? { sourceVersion: String(risk.sourceVersion).trim() } : {}),
        targetDate: String(risk.targetDate ?? ""),
        generatedAt: String(risk.generatedAt ?? ""),
        riskLevel: String(risk.riskLevel ?? ""),
        riskScore: Number(risk.riskScore),
        pointRange: {
          action: String(risk.pointRange?.action ?? ""),
          label: String(risk.pointRange?.label ?? ""),
          min: risk.pointRange?.min == null ? null : Number(risk.pointRange.min),
          max: risk.pointRange?.max == null ? null : Number(risk.pointRange.max),
        },
        confidence: String(risk.confidence ?? ""),
        signals: (Array.isArray(risk.signals) ? risk.signals : []).map((signal) => ({
          key: String(signal?.key ?? "").trim(),
          label: String(signal?.label ?? "").trim(),
          value: String(signal?.value ?? "").trim(),
          contribution: Number(signal?.contribution),
          source: String(signal?.source ?? "").trim(),
          confidence: String(signal?.confidence ?? "").trim(),
          ...(String(signal?.note ?? "").trim() ? { note: String(signal.note).trim() } : {}),
        })),
      }
    : {
        status: "unavailable",
        source: "kurari-ex-race-risk",
      };
  const normalizedBetPlan = ticketSnapshot.purchaseClassification === "structured"
    ? normalizeBetPlanSnapshot(ticketSnapshot, snapshotTickets, normalizedRisk, prefix, errors)
    : undefined;
  if (ticketSnapshot.purchaseClassification === "structured" && !normalizedBetPlan) {
    errors.push(`${prefix}.preRaceSnapshot.ticketSnapshot.betPlan is required for structured purchaseClassification`);
  }

  return {
    version: 1,
    capturedAt: String(raw.capturedAt ?? ""),
    source: "prediction-page-export",
    raceIdentity: {
      date: String(raceIdentity.date ?? ""),
      raceId: String(raceIdentity.raceId ?? ""),
      venueName: String(raceIdentity.venueName ?? ""),
      venueKey: String(raceIdentity.venueKey ?? ""),
      ...(String(raceIdentity.venueCode ?? "").trim() ? { venueCode: String(raceIdentity.venueCode).trim() } : {}),
      raceNumber: Number(raceIdentity.raceNumber),
    },
    risk: normalizedRisk,
    failure: {
      status: raw.failure?.status === "available" ? "available" : "unavailable",
      source: "kurari-ex-prediction-failure-guidance",
      ...(raw.failure?.targetDate ? { targetDate: String(raw.failure.targetDate) } : {}),
      ...(raw.failure?.generatedAt ? { generatedAt: String(raw.failure.generatedAt) } : {}),
      ...(raw.failure?.historicalFrom ? { historicalFrom: String(raw.failure.historicalFrom) } : {}),
      ...(raw.failure?.historicalTo ? { historicalTo: String(raw.failure.historicalTo) } : {}),
      ...(raw.failure?.usage ? { usage: String(raw.failure.usage) } : {}),
      ...(raw.failure?.freshnessStatus ? { freshnessStatus: String(raw.failure.freshnessStatus) } : {}),
      ...(Number.isFinite(Number(raw.failure?.strongContextCount)) ? { strongContextCount: Number(raw.failure.strongContextCount) } : {}),
    },
    ticketSnapshot: {
      source: "slot.predictionJson.tickets",
      purchaseClassification: normalizedBetPlan ? "structured" : "unavailable",
      tickets: snapshotTickets,
      trifectaTicketCount: Number(ticketSnapshot.trifectaTicketCount ?? 0),
      exactaTicketCount: Number(ticketSnapshot.exactaTicketCount ?? 0),
      actualTicketCount: snapshotTickets.length,
      riskRecommendedSkip: ticketSnapshot.riskRecommendedSkip === true,
      ...(String(ticketSnapshot.riskPointRangeAction ?? "").trim()
        ? { riskPointRangeAction: String(ticketSnapshot.riskPointRangeAction).trim() }
        : {}),
      ...(normalizedBetPlan ? { betPlan: normalizedBetPlan } : {}),
    },
    stake: {
      unitStakeYen: 100,
      actualStakeYen: null,
      calculatedCandidateStakeYen: Number(raw.stake?.calculatedCandidateStakeYen ?? snapshotTickets.length * 100),
      plannedStakeYen: normalizedBetPlan?.plannedStakeYen ?? null,
      actualStakeSource: "unavailable",
    },
    headCandidates: normalizedBetPlan
      ? {
          status: "structured",
          source: "slot.predictionJson.betPlan",
          declaredHeadCandidates: normalizedBetPlan.declaredHeadCandidates,
          purchaseDerivedHeads: normalizedBetPlan.purchaseDerivedHeads,
          purchaseDerivedHeadCount: normalizedBetPlan.purchaseDerivedHeadCount,
        }
      : {
          status: "unavailable",
          source: "not-structured",
        },
    evidence: {
      player: {
        status: raw.evidence?.player?.status === "available" ? "available" : "unavailable",
        source: "prediction-material",
        note: String(raw.evidence?.player?.note ?? ""),
      },
      matchup: {
        status: raw.evidence?.matchup?.status === "available" ? "available" : "unavailable",
        source: "prediction-material",
        note: String(raw.evidence?.matchup?.note ?? ""),
      },
      venue: {
        status: "available",
        source: "prediction-feed",
        ...(String(raw.evidence?.venue?.grade ?? "").trim() ? { grade: String(raw.evidence.venue.grade).trim() } : {}),
        ...(String(raw.evidence?.venue?.timeslot ?? "").trim() ? { timeslot: String(raw.evidence.venue.timeslot).trim() } : {}),
      },
    },
  };
}

export function validateDailyPredictionExport(payload) {
  const errors = [];
  if (payload?.schemaVersion !== 1) errors.push("unsupported schemaVersion");
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(String(payload?.date ?? ""))) {
    errors.push("invalid payload date");
  }
  if (!Array.isArray(payload?.items)) errors.push("items must be an array");
  if (
    Number(payload?.raceCount) !== (Array.isArray(payload?.items) ? payload.items.length : 0)
  ) {
    errors.push("raceCount does not match items length");
  }
  const raceIds = new Set();
  const items = [];
  for (const [index, raw] of (Array.isArray(payload?.items) ? payload.items : []).entries()) {
    const prefix = `items[${index}]`;
    if (typeof raw?.raceId !== "string") errors.push(`${prefix}.raceId must be a string`);
    const raceId = String(raw?.raceId ?? "").trim();
    if (!raceId) errors.push(`${prefix}.raceId is empty`);
    if (raceIds.has(raceId)) errors.push(`${prefix}.raceId is duplicated`);
    raceIds.add(raceId);
    const date = String(raw?.date ?? "");
    if (date !== payload.date) errors.push(`${prefix}.date does not match payload date`);
    const venueName = String(raw?.venueName ?? "").trim();
    if (!venueName) errors.push(`${prefix}.venueName is empty`);
    const venueCode = String(raw?.venueCode ?? "").trim();
    const raceNumber = Number(raw?.raceNumber);
    if (!Number.isInteger(raceNumber) || raceNumber < 1 || raceNumber > 12) {
      errors.push(`${prefix}.raceNumber is invalid`);
    }
    if (!Array.isArray(raw?.trifectaTickets)) {
      errors.push(`${prefix}.trifectaTickets must be an array`);
    }
    const trifectaTickets = [];
    for (const value of Array.isArray(raw?.trifectaTickets) ? raw.trifectaTickets : []) {
      const normalized = normalizeTicket(value, 3);
      if (!normalized) errors.push(`${prefix}.trifectaTickets contains invalid ticket`);
      else trifectaTickets.push(normalized);
    }
    if (!Array.isArray(raw?.exactaTickets)) {
      errors.push(`${prefix}.exactaTickets must be an array`);
    }
    const exactaTickets = [];
    for (const value of Array.isArray(raw?.exactaTickets) ? raw.exactaTickets : []) {
      const normalized = normalizeTicket(value, 2);
      if (!normalized) errors.push(`${prefix}.exactaTickets contains invalid ticket`);
      else exactaTickets.push(normalized);
    }
    if (!trifectaTickets.length && !exactaTickets.length) {
      errors.push(`${prefix} has no valid tickets`);
    }
    items.push({
      raceId,
      date,
      venueName,
      venueKey: String(raw?.venueKey ?? "").trim(),
      ...(venueCode ? { venueCode } : {}),
      raceNumber,
      raceTitle: String(raw?.raceTitle ?? "").trim(),
      grade: String(raw?.grade ?? "").trim(),
      timeslot: String(raw?.timeslot ?? "").trim(),
      predictionStatus: "structured",
      trifectaTickets: normalizeStringList(trifectaTickets),
      exactaTickets: normalizeStringList(exactaTickets),
      confidence: String(raw?.confidence ?? "").trim(),
      raceType: String(raw?.raceType ?? "").trim(),
      tags: normalizeStringList(raw?.tags),
      isSpecialRace: raw?.isSpecialRace === true,
      ...(raw?.preRaceSnapshot
        ? { preRaceSnapshot: normalizePreRaceSnapshot(raw.preRaceSnapshot, {
            raceId,
            date,
            venueName,
            raceNumber,
          }, payload.date, prefix, errors) }
        : {}),
    });
  }
  items.sort((left, right) => left.raceId.localeCompare(right.raceId));
  return {
    valid: errors.length === 0,
    errors,
    payload: {
      schemaVersion: 1,
      generatedAt: String(payload?.generatedAt ?? new Date().toISOString()),
      date: String(payload?.date ?? ""),
      source: "prediction-page-local-export",
      raceCount: items.length,
      items,
    },
  };
}

export function dailyPredictionFile(date) {
  return path.join(
    dailyPredictionsRoot,
    date.slice(0, 7),
    `${date}.generated.json`,
  );
}

export async function writeIfChanged(file, content) {
  return writeTextIfChanged(file, content).changed;
}

export async function readDailyPredictionFiles() {
  const files = await collectFiles(
    dailyPredictionsRoot,
    (file) => /^\d{4}-\d{2}-\d{2}\.generated\.json$/u.test(path.basename(file)),
  );
  const entries = [];
  for (const file of files) {
    const payload = parseJson(await readFile(file, "utf8"));
    entries.push({ file, payload, bytes: (await stat(file)).size });
  }
  return entries.sort((left, right) => left.payload.date.localeCompare(right.payload.date));
}

export async function rebuildDailyPredictionIndex() {
  const entries = await readDailyPredictionFiles();
  const items = entries.map(({ file, payload, bytes }) => ({
    date: payload.date,
    file: `/${path.relative(path.join(projectRoot, "public"), file).replaceAll(path.sep, "/")}`,
    raceCount: payload.items?.length ?? 0,
    generatedAt: payload.generatedAt ?? null,
    bytes,
  }));
  const index = {
    schemaVersion: 1,
    generatedAt: items.map((item) => item.generatedAt).filter(Boolean).sort().at(-1) ?? null,
    dayCount: items.length,
    predictionCount: items.reduce((sum, item) => sum + item.raceCount, 0),
    period: {
      from: items[0]?.date ?? null,
      to: items.at(-1)?.date ?? null,
    },
    items,
  };
  await writeIfChanged(dailyPredictionsIndexPath, serializeJson(index));
  return index;
}

export function toLegacyPredictionRecord(item, generatedAt) {
  const tickets = [
    ...(item.trifectaTickets ?? []).map((combination, index) => ({
      index: String(index + 1).padStart(2, "0"),
      betType: "3連単",
      combination,
      group: "その他",
    })),
    ...(item.exactaTickets ?? []).map((combination, index) => ({
      index: String((item.trifectaTickets?.length ?? 0) + index + 1).padStart(2, "0"),
      betType: "2車単",
      combination,
      group: "その他",
    })),
  ];
  return {
    raceKey: `prediction-slot:${item.raceId}`,
    raceId: String(item.raceId ?? "").trim(),
    venue: item.venueName,
    ...(item.venueCode ? { venueCode: item.venueCode } : {}),
    date: item.date,
    raceNumber: item.raceNumber,
    predictionText: "",
    predictionJson: {
      version: 1,
      source: "daily-prediction-export",
      generatedAt,
      ...(item.preRaceSnapshot ? { preRaceSnapshot: item.preRaceSnapshot } : {}),
      summary: {
        title: "",
        lineup: "",
        scenario: item.raceType ?? "",
        memo: item.confidence ?? "",
      },
      tickets,
    },
    savedAt: generatedAt,
  };
}
