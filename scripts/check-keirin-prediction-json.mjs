import { readFile } from "node:fs/promises";
import path from "node:path";

const MOJIBAKE_PATTERN = /\u8373|\u7E3A|\u8B41|\u83A0|\u95D5\uFF73|\u90B5\uFF7A|\u96B4\uFF0D\u95D4\uF8F0/u;
const CONFLICT_MARKER_PATTERN = /<<<<<<<|=======|>>>>>>>/u;

const JST_OPERATION_DATE_FORMATTER = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hour12: false,
});

function getArgValue(args, name, fallback = "") {
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(name);
  if (index >= 0 && index + 1 < args.length) return args[index + 1];
  return fallback;
}

function shiftIsoDateByDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getJstOperationalDate(base = new Date()) {
  const parts = JST_OPERATION_DATE_FORMATTER.formatToParts(base);
  const get = (type) => parts.find((part) => part.type === type)?.value ?? "00";
  const isoDate = `${get("year")}-${get("month")}-${get("day")}`;
  return Number(get("hour")) >= 6 ? isoDate : shiftIsoDateByDays(isoDate, -1);
}

function parseJsonText(raw, file) {
  const text = String(raw).replace(/^\uFEFF/u, "");
  if (CONFLICT_MARKER_PATTERN.test(text)) {
    throw new Error(`${file}: conflict marker detected`);
  }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(text)) {
    throw new Error(`${file}: invalid control character detected`);
  }
  return JSON.parse(text);
}

function recordsFromPayload(payload) {
  if (Array.isArray(payload?.records)) return payload.records;
  if (payload?.records && typeof payload.records === "object") return Object.values(payload.records);
  if (Array.isArray(payload?.recordList)) return payload.recordList;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

function recordsSourceFromPayload(payload) {
  if (Array.isArray(payload?.records)) return "records";
  if (payload?.records && typeof payload.records === "object") return "records-object";
  if (Array.isArray(payload?.recordList)) return "recordList";
  if (Array.isArray(payload?.items)) return "items";
  return "none";
}

function getRecordDate(record, fallbackDate) {
  return String(record?.date ?? fallbackDate ?? "").trim();
}

function findPredictionText(record) {
  return String(
    record?.predictionText
      ?? record?.text
      ?? record?.summary?.title
      ?? record?.raceTitle
      ?? record?.venueName
      ?? record?.venue
      ?? "",
  ).trim();
}

function collectHumanText(records) {
  return records.flatMap((record) => [
    record?.predictionText,
    record?.text,
    record?.raceTitle,
    record?.venueName,
    record?.venue,
    record?.confidence,
    record?.raceType,
    record?.summary?.title,
    record?.summary?.scenario,
    record?.summary?.memo,
  ]).map((value) => String(value ?? "").trim()).filter(Boolean);
}

function normalizeBetPlanIndex(value) {
  const text = String(value ?? "").trim();
  return /^\d+$/u.test(text) ? text.padStart(2, "0") : text;
}

function normalizeBetPlanIndexList(values) {
  return (Array.isArray(values) ? values : [])
    .map(normalizeBetPlanIndex)
    .filter(Boolean);
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

function getRiskRecommendedPurchaseCount(risk) {
  if (risk?.pointRange?.action === "SKIP") return 0;
  const max = risk?.pointRange?.max;
  return Number.isFinite(Number(max)) ? Number(max) : null;
}

function derivePurchaseHeads(tickets, purchaseTicketIndices) {
  const purchaseSet = new Set(purchaseTicketIndices);
  return [...new Set(tickets
    .filter((ticket) => purchaseSet.has(String(ticket?.index ?? "").trim()) && String(ticket?.betType ?? "").includes("3連単"))
    .map((ticket) => String(ticket?.combination ?? "").split("-")[0]?.trim() ?? "")
    .filter((value) => /^[1-9]$/u.test(value)))].sort();
}

function validateBetPlanSnapshot(snapshot, tickets, risk, prefix) {
  const errors = [];
  const betPlan = snapshot.ticketSnapshot?.betPlan;
  if (betPlan == null) {
    errors.push(`${prefix}: structured purchaseClassification requires betPlan`);
    return errors;
  }
  const ticketIndices = tickets.map((ticket) => String(ticket?.index ?? "").trim());
  const ticketIndexSet = new Set(ticketIndices);
  const purchaseTicketIndices = normalizeBetPlanIndexList(betPlan.purchaseTicketIndices);
  const shadowTicketIndices = normalizeBetPlanIndexList(betPlan.shadowTicketIndices);
  const purchaseUnique = [...new Set(purchaseTicketIndices)].sort();
  const shadowUnique = [...new Set(shadowTicketIndices)].sort();
  const missingPurchase = purchaseUnique.filter((index) => !ticketIndexSet.has(index));
  const missingShadow = shadowUnique.filter((index) => !ticketIndexSet.has(index));
  const overlap = purchaseUnique.filter((index) => shadowUnique.includes(index));
  const classified = new Set([...purchaseUnique, ...shadowUnique]);
  const unclassified = ticketIndices.filter((index) => !classified.has(index));
  const purchaseHeads = derivePurchaseHeads(tickets, purchaseUnique);
  const recommendedPurchaseCount = getRiskRecommendedPurchaseCount(risk);
  if (betPlan.status !== "structured") errors.push(`${prefix}: betPlan status invalid`);
  if (betPlan.source !== "slot.predictionJson.betPlan") errors.push(`${prefix}: betPlan source invalid`);
  if (betPlan.sourceStatus !== "source-backed") errors.push(`${prefix}: betPlan sourceStatus invalid`);
  const duplicatePurchase = duplicateValues(purchaseTicketIndices);
  const duplicateShadow = duplicateValues(shadowTicketIndices);
  if (duplicatePurchase.length > 0) errors.push(`${prefix}: betPlan purchase duplicates ${duplicatePurchase.join(",")}`);
  if (duplicateShadow.length > 0) errors.push(`${prefix}: betPlan shadow duplicates ${duplicateShadow.join(",")}`);
  if (missingPurchase.length > 0) errors.push(`${prefix}: betPlan purchase missing tickets ${missingPurchase.join(",")}`);
  if (missingShadow.length > 0) errors.push(`${prefix}: betPlan shadow missing tickets ${missingShadow.join(",")}`);
  if (overlap.length > 0) errors.push(`${prefix}: betPlan purchase/shadow overlap ${overlap.join(",")}`);
  if (Number(betPlan.structuredPurchaseCount) !== purchaseUnique.length) errors.push(`${prefix}: structuredPurchaseCount mismatch`);
  if (Number(betPlan.structuredShadowCount) !== shadowUnique.length) errors.push(`${prefix}: structuredShadowCount mismatch`);
  if (Number(betPlan.structuredUnclassifiedCount) !== unclassified.length) errors.push(`${prefix}: structuredUnclassifiedCount mismatch`);
  if (Number(betPlan.plannedStakeYen) !== purchaseUnique.length * 100) errors.push(`${prefix}: plannedStakeYen mismatch`);
  if (betPlan.actualStakeYen != null) errors.push(`${prefix}: betPlan actualStakeYen must be null`);
  if (recommendedPurchaseCount == null) {
    if (betPlan.recommendedPurchaseCount != null) errors.push(`${prefix}: recommendedPurchaseCount mismatch`);
  } else if (Number(betPlan.recommendedPurchaseCount) !== recommendedPurchaseCount) {
    errors.push(`${prefix}: recommendedPurchaseCount mismatch`);
  }
  const expectedDifference = recommendedPurchaseCount == null ? null : purchaseUnique.length - recommendedPurchaseCount;
  if (expectedDifference == null ? betPlan.purchaseCountDifference != null : Number(betPlan.purchaseCountDifference) !== expectedDifference) {
    errors.push(`${prefix}: purchaseCountDifference mismatch`);
  }
  if (JSON.stringify(betPlan.purchaseDerivedHeads ?? []) !== JSON.stringify(purchaseHeads)) {
    errors.push(`${prefix}: purchaseDerivedHeads mismatch`);
  }
  return errors;
}

function validatePreRaceSnapshot(record, fallbackDate, index) {
  const snapshot = record?.preRaceSnapshot ?? record?.predictionJson?.preRaceSnapshot;
  if (snapshot == null) return [];
  const errors = [];
  const prefix = `record[${index}].preRaceSnapshot`;
  const expectedDate = getRecordDate(record, fallbackDate);
  const raceIdentity = snapshot.raceIdentity ?? {};
  if (snapshot.version !== 1) errors.push(`${prefix}: invalid version`);
  if (raceIdentity.date !== expectedDate) errors.push(`${prefix}: raceIdentity date mismatch`);
  if (String(raceIdentity.raceId ?? "").trim() && String(record?.raceId ?? "").trim() && String(raceIdentity.raceId).trim() !== String(record.raceId).trim()) {
    errors.push(`${prefix}: raceIdentity raceId mismatch`);
  }
  if (Number.isFinite(Number(record?.raceNumber)) && Number(raceIdentity.raceNumber) !== Number(record.raceNumber)) {
    errors.push(`${prefix}: raceIdentity raceNumber mismatch`);
  }
  const risk = snapshot.risk ?? {};
  if (!["available", "unavailable"].includes(risk.status)) errors.push(`${prefix}: invalid risk status`);
  if (risk.status === "available") {
    if (risk.targetDate !== expectedDate) errors.push(`${prefix}: risk targetDate mismatch`);
    if (!["LOW", "MEDIUM", "HIGH", "VERY_HIGH", "INSUFFICIENT"].includes(risk.riskLevel)) {
      errors.push(`${prefix}: invalid riskLevel`);
    }
    if (!risk.pointRange || !["BASE_8", "VALUE_10", "STRONG_VALUE_12", "MAX_14", "SKIP"].includes(risk.pointRange.action)) {
      errors.push(`${prefix}: invalid pointRange action`);
    }
    if (!["high", "medium", "low"].includes(risk.confidence)) errors.push(`${prefix}: invalid confidence`);
    for (const [signalIndex, signal] of (Array.isArray(risk.signals) ? risk.signals : []).entries()) {
      const source = String(signal?.source ?? "");
      if (!String(signal?.key ?? "").trim()) errors.push(`${prefix}: signal[${signalIndex}] key missing`);
      if (!Number.isFinite(Number(signal?.contribution))) errors.push(`${prefix}: signal[${signalIndex}] contribution invalid`);
      if (/current.*result|current.*payout|today.*result|today.*payout|finishOrder|refund|払戻|確定結果/iu.test(source)) {
        errors.push(`${prefix}: signal[${signalIndex}] current result leakage`);
      }
      if (/fake|synthetic|fuzzy/iu.test(source)) errors.push(`${prefix}: signal[${signalIndex}] fake/fuzzy source`);
    }
  }
  const ticketSnapshot = snapshot.ticketSnapshot ?? {};
  if (!["unavailable", "structured"].includes(ticketSnapshot.purchaseClassification)) {
    errors.push(`${prefix}: purchaseClassification must be unavailable or structured`);
  }
  const tickets = Array.isArray(ticketSnapshot.tickets) ? ticketSnapshot.tickets : [];
  if (!Array.isArray(ticketSnapshot.tickets)) errors.push(`${prefix}: ticketSnapshot tickets must be an array`);
  if (Number(ticketSnapshot.actualTicketCount) !== tickets.length) {
    errors.push(`${prefix}: actualTicketCount mismatch`);
  }
  if (ticketSnapshot.purchaseClassification === "structured") {
    errors.push(...validateBetPlanSnapshot(snapshot, tickets, risk, prefix));
  }
  if (snapshot.stake?.actualStakeYen != null) {
    errors.push(`${prefix}: actualStakeYen must not be set without purchase source`);
  }
  if (ticketSnapshot.purchaseClassification === "structured" && Number(snapshot.stake?.plannedStakeYen) !== Number(ticketSnapshot.betPlan?.plannedStakeYen)) {
    errors.push(`${prefix}: stake plannedStakeYen mismatch`);
  }
  return errors;
}

async function checkFile(file, options) {
  const raw = await readFile(file, "utf8");
  const payload = parseJsonText(raw, file);
  const records = recordsFromPayload(payload);
  const recordSource = recordsSourceFromPayload(payload);
  if (!Array.isArray(records)) throw new Error(`${file}: records must be an array`);
  if (records.length === 0) throw new Error(`${file}: records must not be empty`);

  const expectedDate = options.date || getJstOperationalDate();
  const dates = records.map((record) => getRecordDate(record, payload?.date));
  const uniqueDates = [...new Set(dates)].sort();
  const invalidDates = dates.filter((date) => date !== expectedDate);
  if (invalidDates.length > 0) {
    throw new Error(`${file}: records must be JST operation date only (${expectedDate})`);
  }

  const firstPredictionText = findPredictionText(records[0]);
  const joinedText = collectHumanText(records).join("\n");
  if (MOJIBAKE_PATTERN.test(joinedText)) {
    throw new Error(`${file}: suspected mojibake marker detected`);
  }
  const snapshotErrors = records.flatMap((record, index) => (
    validatePreRaceSnapshot(record, payload?.date, index)
  ));
  if (snapshotErrors.length > 0) {
    throw new Error(`${file}: ${snapshotErrors.join("; ")}`);
  }

  return {
    file,
    expectedDate,
    recordSource,
    recordCount: records.length,
    dates: uniqueDates,
    firstPredictionText,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const fileArg = getArgValue(args, "--file") || args.find((arg) => !arg.startsWith("--"));
  const file = path.resolve(fileArg ?? "");
  if (!file) throw new Error("--file is required");

  const result = await checkFile(file, {
    date: getArgValue(args, "--date"),
  });

  console.log("[keirin prediction json check]");
  console.log(`file: ${result.file}`);
  console.log(`date: ${result.expectedDate}`);
  console.log(`${result.recordSource}: ${result.recordCount}`);
  console.log(`dates: ${result.dates.join(", ")}`);
  console.log(`first predictionText: ${result.firstPredictionText || "(empty)"}`);
  if (args.includes("--print-date")) console.log(result.expectedDate);
}

main().catch((error) => {
  console.error("[keirin prediction json check] failed");
  console.error(error.message);
  process.exitCode = 1;
});
