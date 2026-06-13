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
    date: item.date,
    raceNumber: item.raceNumber,
    predictionText: "",
    predictionJson: {
      version: 1,
      source: "daily-prediction-export",
      generatedAt,
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
