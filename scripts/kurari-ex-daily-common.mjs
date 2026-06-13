import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  collectFiles,
  compactHistoryDailyRoot,
  compactHistoryRoot,
  projectRoot,
  serializeJson,
} from "./kurari-ex-history-common.mjs";
import {
  loadRiderIdentitySources,
  resolveRiderIdentity,
} from "./kurari-ex-rider-common.mjs";

export const todayFeedPath = path.join(
  projectRoot,
  "public",
  "data",
  "races",
  "today.generated.json",
);
export const savedPredictionsPath = path.join(
  projectRoot,
  "public",
  "data",
  "predictions",
  "saved-predictions.generated.json",
);
export const dailyPredictionsRoot = path.join(
  projectRoot,
  "public",
  "data",
  "predictions",
  "daily",
);

export function dailyPredictionsPath(date) {
  return path.join(
    dailyPredictionsRoot,
    date.slice(0, 7),
    `${date}.generated.json`,
  );
}

export async function resolvePredictionInput(date, explicitFile = "") {
  if (explicitFile) {
    return { file: path.resolve(explicitFile), source: "explicit" };
  }
  const dailyFile = dailyPredictionsPath(date);
  try {
    await access(dailyFile);
    return { file: dailyFile, source: "daily" };
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  try {
    await access(savedPredictionsPath);
    return { file: savedPredictionsPath, source: "saved-predictions-fallback" };
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return { file: null, source: "missing" };
}

function parseJson(text) {
  return JSON.parse(String(text).replace(/^\uFEFF/u, ""));
}

export function getArgValue(args, name, fallback = "") {
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1] ?? fallback;
  return args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1) ?? fallback;
}

export function resolveJstDate(value = "today", now = new Date()) {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const today = formatter.format(now);
  if (!value || value === "today") return today;
  if (value === "yesterday") {
    const noonUtc = new Date(`${today}T03:00:00.000Z`);
    noonUtc.setUTCDate(noonUtc.getUTCDate() - 1);
    return formatter.format(noonUtc);
  }
  if (/^\d{4}-\d{2}-\d{2}$/u.test(value)) return value;
  throw new Error(`invalid date argument: ${value}`);
}

function numberValue(value) {
  if (value == null || value === "") return null;
  const match = String(value).replaceAll(",", "").match(/[+-]?\d+(?:\.\d+)?/u);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) ? number : null;
}

function canonicalCombination(value, length) {
  const numbers = String(value ?? "").match(/[1-9]/gu) ?? [];
  return numbers.length >= length ? numbers.slice(0, length).join("-") : "";
}

function parseLineup(value) {
  const text = String(value ?? "").normalize("NFKC").trim();
  if (!text) return { lines: [], status: "missing" };
  const groups = text
    .replace(/[|｜]/gu, "/")
    .split(/[\/\s]+/u)
    .filter(Boolean);
  const lines = groups
    .map((group) => {
      const digits = group.match(/[1-9]/gu) ?? [];
      return digits.map(Number);
    })
    .filter((line) => line.length);
  const cars = lines.flat();
  if (!lines.length || new Set(cars).size !== cars.length) {
    return { lines: [], status: "missing" };
  }
  return { lines, status: "parsed" };
}

function payoutYen(item) {
  return numberValue(item?.payout);
}

export function normalizeVenueName(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/gu, "")
    .replace(/競輪場|競輪$/u, "");
}

export function predictionCompositeKey(date, venueName, raceNumber) {
  return `${String(date ?? "")}:${normalizeVenueName(venueName)}:${Number(raceNumber)}`;
}

export function predictionRecords(payload) {
  const dailyRecords = Array.isArray(payload?.items)
    ? payload.items.map((item) => ({
        raceId: String(item?.raceId ?? "").trim(),
        date: item?.date ?? payload.date,
        venue: item?.venueName,
        raceNumber: item?.raceNumber,
        predictionJson: {
          tickets: [
            ...(item?.trifectaTickets ?? []).map((combination) => ({
              betType: "3連単",
              combination,
            })),
            ...(item?.exactaTickets ?? []).map((combination) => ({
              betType: "2車単",
              combination,
            })),
          ],
        },
        predictionMetadata: {
          confidence: item?.confidence,
          raceType: item?.raceType,
          tags: item?.tags,
          isSpecialRace: item?.isSpecialRace,
        },
      }))
    : [];
  const rawCandidates = [
    ...dailyRecords,
    ...(Array.isArray(payload.recordList) ? payload.recordList : []),
    ...Object.values(payload.records ?? {}),
  ];
  const candidates = [
    ...new Map(rawCandidates.map((record) => [
      JSON.stringify([
        String(record?.raceId ?? "").trim(),
        record?.date,
        record?.venue,
        record?.raceNumber,
        record?.predictionJson,
        record?.predictionText,
      ]),
      record,
    ])).values(),
  ];
  const byRaceId = new Map();
  const byComposite = new Map();
  const ambiguous = [];
  const compositeAmbiguous = [];
  for (const record of candidates) {
    const raceId = String(record?.raceId ?? "").trim();
    if (raceId) {
      const current = byRaceId.get(raceId);
      if (!current) {
        byRaceId.set(raceId, record);
      } else {
        const currentSignature = JSON.stringify([
          current.date,
          current.venue,
          current.raceNumber,
          current.predictionJson,
          current.predictionText,
        ]);
        const nextSignature = JSON.stringify([
          record.date,
          record.venue,
          record.raceNumber,
          record.predictionJson,
          record.predictionText,
        ]);
        if (currentSignature !== nextSignature) ambiguous.push(raceId);
      }
    }
    const composite = predictionCompositeKey(
      record?.date,
      record?.venue,
      record?.raceNumber,
    );
    if (!record?.date || !normalizeVenueName(record?.venue) || !Number(record?.raceNumber)) continue;
    const compositeRecords = byComposite.get(composite) ?? [];
    compositeRecords.push(record);
    byComposite.set(composite, compositeRecords);
    if (compositeRecords.length > 1) compositeAmbiguous.push(composite);
  }
  return {
    candidates,
    byRaceId,
    byComposite,
    ambiguous: [...new Set(ambiguous)].sort(),
    compositeAmbiguous: [...new Set(compositeAmbiguous)].sort(),
  };
}

export function parsePrediction(record) {
  const structured = Array.isArray(record?.predictionJson?.tickets)
    ? record.predictionJson.tickets
    : [];
  let tickets = structured.map((ticket) => ({
    betType: String(ticket?.betType ?? ""),
    combination: String(ticket?.combination ?? ""),
  }));
  const text = String(record?.predictionText ?? "").normalize("NFKC");
  if (!tickets.length) {
    tickets = [...text.matchAll(
      /^\s*\d{1,2}\s+(?:(3連単|2車単)\s+)?([1-9]\s*[-→＞ー−–]\s*[1-9](?:\s*[-→＞ー−–]\s*[1-9])?)/gmu,
    )].map((match) => ({
      betType: match[1] || (canonicalCombination(match[2], 3).split("-").length === 3 ? "3連単" : "2車単"),
      combination: match[2],
    }));
  }
  const trifectaTickets = [];
  const exactaTickets = [];
  for (const ticket of tickets) {
    if (/3連単/u.test(ticket.betType)) {
      const combination = canonicalCombination(ticket.combination, 3);
      if (combination) trifectaTickets.push(combination);
    } else if (/2車単/u.test(ticket.betType)) {
      const combination = canonicalCombination(ticket.combination, 2);
      if (combination) exactaTickets.push(combination);
    }
  }
  const confidence = text.match(/自信度\s*[:：]?\s*([^\n]+)/u)?.[1]?.trim() ?? "";
  const raceType = text.match(/レース(?:タイプ|型)\s*[:：]?\s*([^\n]+)/u)?.[1]?.trim() ?? "";
  const tags = [...text.matchAll(/#[^\s#]+/gu)].map((match) => match[0]);
  return {
    trifectaTickets: [...new Set(trifectaTickets)].sort(),
    exactaTickets: [...new Set(exactaTickets)].sort(),
    confidence: String(record?.predictionMetadata?.confidence ?? confidence).trim(),
    raceType: String(record?.predictionMetadata?.raceType ?? raceType).trim(),
    tags: [...new Set([
      ...tags,
      ...(Array.isArray(record?.predictionMetadata?.tags)
        ? record.predictionMetadata.tags.map((tag) => String(tag ?? "").trim())
        : []),
    ].filter(Boolean))].sort(),
    isSpecialRace: record?.predictionMetadata?.isSpecialRace === true,
  };
}

function compactResult(race) {
  const order = Array.isArray(race?.result?.finishOrder)
    ? [...race.result.finishOrder].sort((left, right) => Number(left.rank) - Number(right.rank))
    : [];
  const placement = (index, withWinningMethod = false) => ({
    carNo: numberValue(order[index]?.carNo),
    name: String(order[index]?.name ?? "").trim(),
    ...(withWinningMethod
      ? { winningMethod: String(order[index]?.kimarite ?? race?.result?.kimarite ?? "").trim() }
      : {}),
  });
  const confirmed = race?.resultStatus === "confirmed" || race?.result?.status === "confirmed";
  return {
    status: confirmed ? "finished" : "unknown",
    first: placement(0, true),
    second: placement(1),
    third: placement(2),
    trifecta: {
      combination: canonicalCombination(race?.result?.payout3tan?.combination, 3),
      payoutYen: payoutYen(race?.result?.payout3tan),
    },
    exacta: {
      combination: canonicalCombination(race?.result?.payout2tan?.combination, 2),
      payoutYen: payoutYen(race?.result?.payout2tan),
    },
    favoriteTrifecta: {
      combination: canonicalCombination(
        race?.finalTrifectaFavorite?.combination ?? race?.favoriteCombination,
        3,
      ),
      odds: numberValue(race?.finalTrifectaFavorite?.odds ?? race?.favoriteOdds),
    },
    bRider: numberValue(race?.result?.bLeaderCarNo)
      ? { carNo: numberValue(race.result.bLeaderCarNo) }
      : null,
  };
}

function compactWeather(race) {
  const weather = race?.result?.weatherActual ?? {};
  let windSpeedMps = numberValue(weather.windSpeed);
  if (windSpeedMps != null && /km\/h/iu.test(String(weather.windSpeed))) {
    windSpeedMps = Number((windSpeedMps / 3.6).toFixed(1));
  }
  return {
    condition: String(weather.weather ?? "").trim(),
    windDirection: String(weather.windDirection ?? "").trim(),
    windSpeedMps,
  };
}

function compactRaceClass(title) {
  return String(title ?? "")
    .replace(/^20\d{2}年\d{2}月\d{2}日\s*/u, "")
    .replace(/^レース詳細\s*/u, "")
    .trim();
}

function isCancelled(venue, race) {
  return venue?.venueOperationStatus === "cancelled"
    || race?.raceOperationStatus === "cancelled";
}

export async function loadDailySource({
  feedFile = todayFeedPath,
  predictionsFile = null,
} = {}) {
  const [feedText, identitySources] = await Promise.all([
    readFile(feedFile, "utf8"),
    loadRiderIdentitySources(),
  ]);
  const feed = parseJson(feedText);
  const predictions = predictionsFile
    ? parseJson(await readFile(predictionsFile, "utf8"))
    : { schemaVersion: 1, date: feed.date, items: [] };
  const predictionLookup = predictionRecords(predictions);
  if (predictionLookup.ambiguous.length) {
    throw new Error(
      `saved predictions contain ambiguous raceId records: ${predictionLookup.ambiguous.join(", ")}`,
    );
  }

  const races = [];
  for (const venue of feed.venues ?? []) {
    for (let index = 0; index < (venue.races ?? []).length; index += 1) {
      const race = venue.races[index];
      const raceId = String(
        race?.raceId
        ?? race?.kdreamsRaceId
        ?? venue?.raceIds?.[index]
        ?? "",
      ).trim();
      const raceNumber = Number(race?.raceNo);
      let predictionRecord = predictionLookup.byRaceId.get(raceId) ?? null;
      let matchedBy = predictionRecord ? "raceId" : null;
      if (!predictionRecord) {
        const composite = predictionCompositeKey(feed.date, venue?.venue, raceNumber);
        const candidates = predictionLookup.byComposite.get(composite) ?? [];
        const unique = candidates.filter((candidate) => (
          String(candidate?.date ?? "") === String(feed.date ?? "")
          && normalizeVenueName(candidate?.venue) === normalizeVenueName(venue?.venue)
          && Number(candidate?.raceNumber) === raceNumber
        ));
        if (unique.length === 1) {
          predictionRecord = unique[0];
          matchedBy = "unique-composite-key";
        }
      }
      const parsedPrediction = predictionRecord ? parsePrediction(predictionRecord) : null;
      const result = compactResult(race);
      const cancelled = isCancelled(venue, race);
      const operationStatus = cancelled
        ? "cancelled"
        : result.status === "finished"
          ? "finished"
          : "pending";
      const starters = [];
      for (const rider of race?.riders ?? []) {
        const identity = resolveRiderIdentity(
          {
            carNo: numberValue(rider?.carNo),
            name: rider?.name ?? rider?.fullName ?? "",
            registrationNo: rider?.registrationNo,
          },
          identitySources,
        );
        starters.push({
          carNo: numberValue(rider?.carNo),
          name: String(rider?.name ?? rider?.fullName ?? "").trim(),
          registrationNo: identity.registrationNo,
          identityStatus: identity.status,
        });
      }
      starters.sort((left, right) => Number(left.carNo) - Number(right.carNo));
      const lineup = parseLineup(race?.lineup);
      const warnings = [];
      if (!raceId) warnings.push("raceId missing");
      if (!venue?.slug) warnings.push("venue slug missing");
      if (!predictionRecord) warnings.push("saved prediction missing");
      if (operationStatus === "finished" && !result.trifecta.combination) {
        warnings.push("confirmed result trifecta missing");
      }
      races.push({
        raceKey: `${feed.date}:${venue?.slug}:${raceNumber}`,
        raceId,
        date: feed.date,
        venueKey: String(venue?.slug ?? ""),
        venueName: String(venue?.venue ?? ""),
        raceNumber,
        grade: String(venue?.grade ?? ""),
        timeslot: String(venue?.session ?? ""),
        raceClass: compactRaceClass(race?.title),
        operationStatus,
        starters,
        lineup,
        weather: compactWeather(race),
        result: {
          ...result,
          status: operationStatus === "finished" ? "finished" : "unknown",
        },
        prediction: parsedPrediction,
        predictionEnrichment: {
          status: predictionRecord ? "matched" : "missing",
          matchedBy,
        },
        quality: {
          resultParsed: operationStatus === "finished" && Boolean(result.trifecta.combination),
          predictionParsed: Boolean(
            parsedPrediction?.trifectaTickets.length
            || parsedPrediction?.exactaTickets.length,
          ),
          lineupParsed: lineup.status === "parsed",
          starterParsed: starters.length > 0,
          warnings,
        },
      });
    }
  }
  races.sort((left, right) => (
    left.venueKey.localeCompare(right.venueKey)
    || left.raceNumber - right.raceNumber
  ));
  return { feed, predictions, races };
}

export function summarizeDailySource({ feed, races }) {
  const duplicateRaceKeyCount = races.length - new Set(races.map((race) => race.raceKey)).size;
  const settledRaceCount = races.filter((race) => race.operationStatus === "finished").length;
  const cancelledRaceCount = races.filter((race) => race.operationStatus === "cancelled").length;
  const pendingRaceCount = races.length - settledRaceCount - cancelledRaceCount;
  const predictionMatchedRaceCount = races.filter(
    (race) => race.predictionEnrichment?.status === "matched",
  ).length;
  const predictionCoverageRate = races.length
    ? Number(((predictionMatchedRaceCount / races.length) * 100).toFixed(1))
    : 0;
  return {
    feedDate: feed.date ?? "",
    venueCount: new Set(races.map((race) => race.venueKey)).size,
    raceCount: races.length,
    settledRaceCount,
    pendingRaceCount,
    cancelledRaceCount,
    duplicateRaceKeyCount,
    resultUnparsedCount: races.filter(
      (race) => race.operationStatus === "finished" && !race.quality.resultParsed,
    ).length,
    predictionMatchedRaceCount,
    predictionParsedCount: races.filter((race) => race.quality.predictionParsed).length,
    predictionMissingCount: races.length - predictionMatchedRaceCount,
    predictionCoverageRate,
    predictionCoverageStatus: predictionCoverageRate >= 95
      ? "complete"
      : predictionCoverageRate > 0
        ? "partial"
        : "missing",
    lineupParsedCount: races.filter((race) => race.quality.lineupParsed).length,
    starterParsedCount: races.filter((race) => race.quality.starterParsed).length,
    registrationResolvedStarterCount: races
      .flatMap((race) => race.starters)
      .filter((starter) => starter.registrationNo).length,
    missingRaceIdCount: races.filter((race) => !race.raceId).length,
    missingVenueKeyCount: races.filter((race) => !race.venueKey).length,
  };
}

async function readDailyPayloads() {
  const files = await collectFiles(
    compactHistoryDailyRoot,
    (file) => file.endsWith(".generated.json"),
  );
  const payloads = [];
  for (const file of files) {
    payloads.push({ file, payload: parseJson(await readFile(file, "utf8")) });
  }
  return payloads.sort((left, right) => left.payload.date.localeCompare(right.payload.date));
}

export async function rebuildHistoryMetadata(archiveFields = {}) {
  const payloads = await readDailyPayloads();
  const items = [];
  let totalBytes = 0;
  let maxDailyFileBytes = 0;
  const races = [];
  for (const { file, payload } of payloads) {
    const bytes = (await stat(file)).size;
    totalBytes += bytes;
    maxDailyFileBytes = Math.max(maxDailyFileBytes, bytes);
    races.push(...(payload.items ?? []));
    items.push({
      date: payload.date,
      file: `/data/analytics/kurari-ex/history/daily/${payload.date.slice(0, 7)}/${payload.date}.generated.json`,
      raceCount: payload.raceCount,
      settledRaceCount: payload.settledRaceCount,
      cancelledRaceCount: payload.cancelledRaceCount,
      bytes,
    });
  }
  const generatedAt = new Date().toISOString();
  const index = {
    schemaVersion: 1,
    generatedAt,
    period: {
      from: items[0]?.date ?? null,
      to: items.at(-1)?.date ?? null,
    },
    dayCount: items.length,
    raceCount: races.length,
    settledRaceCount: races.filter((race) => race.operationStatus === "finished").length,
    cancelledRaceCount: races.filter((race) => race.operationStatus === "cancelled").length,
    totalBytes,
    items,
  };
  let previousStatus = {};
  try {
    previousStatus = parseJson(
      await readFile(path.join(compactHistoryRoot, "status.generated.json"), "utf8"),
    );
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const status = {
    schemaVersion: 1,
    generatedAt,
    source: "compact-history-daily-archive",
    dayCount: items.length,
    raceCount: races.length,
    settledRaceCount: index.settledRaceCount,
    cancelledRaceCount: index.cancelledRaceCount,
    starterParsedCount: races.filter((race) => race.quality?.starterParsed).length,
    lineupParsedCount: races.filter((race) => race.quality?.lineupParsed).length,
    predictionParsedCount: races.filter((race) => race.quality?.predictionParsed).length,
    resultParsedCount: races.filter((race) => race.quality?.resultParsed).length,
    registrationResolvedStarterCount: races
      .flatMap((race) => race.starters ?? [])
      .filter((starter) => starter.registrationNo).length,
    totalBytes,
    maxDailyFileBytes,
    warningCount: races.reduce(
      (sum, race) => sum + (race.quality?.warnings?.length ?? 0),
      0,
    ),
    prohibitedDetected: false,
    lastArchiveAttemptAt: archiveFields.lastArchiveAttemptAt
      ?? previousStatus.lastArchiveAttemptAt
      ?? null,
    lastArchiveSuccessAt: archiveFields.lastArchiveSuccessAt
      ?? previousStatus.lastArchiveSuccessAt
      ?? null,
    lastArchiveDate: archiveFields.lastArchiveDate
      ?? previousStatus.lastArchiveDate
      ?? null,
    lastArchiveStatus: archiveFields.lastArchiveStatus
      ?? previousStatus.lastArchiveStatus
      ?? null,
    lastArchiveMessage: archiveFields.lastArchiveMessage
      ?? previousStatus.lastArchiveMessage
      ?? "",
    lastPredictionCoverageRate: archiveFields.lastPredictionCoverageRate
      ?? previousStatus.lastPredictionCoverageRate
      ?? null,
    lastPredictionMatchedRaceCount: archiveFields.lastPredictionMatchedRaceCount
      ?? previousStatus.lastPredictionMatchedRaceCount
      ?? null,
    lastPredictionTotalRaceCount: archiveFields.lastPredictionTotalRaceCount
      ?? previousStatus.lastPredictionTotalRaceCount
      ?? null,
    lastPredictionCoverageStatus: archiveFields.lastPredictionCoverageStatus
      ?? previousStatus.lastPredictionCoverageStatus
      ?? null,
    predictionArchiveWarningCount: archiveFields.predictionArchiveWarningCount
      ?? previousStatus.predictionArchiveWarningCount
      ?? 0,
  };
  await Promise.all([
    writeFile(path.join(compactHistoryRoot, "index.generated.json"), serializeJson(index), "utf8"),
    writeFile(path.join(compactHistoryRoot, "status.generated.json"), serializeJson(status), "utf8"),
  ]);
  return { index, status };
}

export async function writeArchiveStatus(fields) {
  await rebuildHistoryMetadata(fields);
}

export async function writeDailyPayload(payload) {
  const file = path.join(
    compactHistoryDailyRoot,
    payload.date.slice(0, 7),
    `${payload.date}.generated.json`,
  );
  const content = serializeJson(payload);
  try {
    if (await readFile(file, "utf8") === content) return { file, changed: false };
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content, "utf8");
  return { file, changed: true };
}

export async function readDailyPayload(date) {
  const file = path.join(
    compactHistoryDailyRoot,
    date.slice(0, 7),
    `${date}.generated.json`,
  );
  try {
    return { file, payload: parseJson(await readFile(file, "utf8")) };
  } catch (error) {
    if (error?.code === "ENOENT") return { file, payload: null };
    throw error;
  }
}

export function predictionCoverageForRaces(races) {
  const matchedRaceCount = races.filter(
    (race) => race.predictionEnrichment?.status === "matched",
  ).length;
  const totalRaceCount = races.length;
  const coverageRate = totalRaceCount
    ? Number(((matchedRaceCount / totalRaceCount) * 100).toFixed(1))
    : 0;
  return {
    matchedRaceCount,
    totalRaceCount,
    coverageRate,
    status: coverageRate >= 95 ? "complete" : coverageRate > 0 ? "partial" : "missing",
  };
}
