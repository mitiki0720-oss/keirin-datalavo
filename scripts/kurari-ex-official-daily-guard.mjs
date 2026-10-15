import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { projectRoot, venueMap } from "./kurari-ex-history-common.mjs";

const raceRoot = path.join(projectRoot, "public", "data", "races");
const resultPath = path.join(raceRoot, "keirin-jp-results.generated.json");
const entryPath = path.join(raceRoot, "keirin-jp-entries.generated.json");
const cleanName = (value) => String(value ?? "").normalize("NFKC").replace(/\s+/gu, "");
const carNumber = (value) => /^[1-9]$/u.test(String(value ?? "")) ? Number(value) : null;
const raceNumber = (value) => Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const registrationNo = (value) => /^\d{6}$/u.test(String(value ?? "")) ? String(value) : null;
const officialVenueName = (value) => cleanName(value).replace(/競輪場$/u, "");

function onePerKey(items, keyOf, label) {
  const map = new Map();
  for (const item of items) {
    const key = keyOf(item);
    if (key == null || map.has(key)) throw new Error(`${label}: missing or duplicate key ${key}`);
    map.set(key, item);
  }
  return map;
}

function flatten(document, targetDate, label) {
  if (document?.date !== targetDate || document?.source?.provider !== "KEIRIN.JP"
    || document.source.endpoint !== "/pc/json" || document.errorCount !== 0) {
    throw new Error(`${label}: official source, date, or fetch completeness unavailable`);
  }
  if (label === "entries" && document.source.entryType !== "JSJ006") {
    throw new Error("entries: JSJ006 provenance unavailable");
  }
  if (label === "results" && document.source.listType !== "JSJ048") {
    throw new Error("results: JSJ048 provenance unavailable");
  }
  const rows = [];
  for (const venue of document.venues ?? []) {
    if (venue.date !== targetDate || !/^\d{2}$/u.test(String(venue.venueCode ?? ""))) {
      throw new Error(`${label}: venue identity unavailable`);
    }
    for (const race of venue.races ?? []) {
      const number = raceNumber(race.raceNumber);
      if (!number) throw new Error(`${label}: race number unavailable`);
      rows.push({ key: `${venue.venueCode}:${number}`, venue, race });
    }
  }
  if (!rows.length || rows.length !== document.raceCount) {
    throw new Error(`${label}: race count incomplete`);
  }
  return onePerKey(rows, (row) => row.key, label);
}

function officialRank(row) {
  const raw = String(row?.rank ?? "").normalize("NFKC").trim();
  if (/^[1-9]\d*$/u.test(raw)) return Number(raw);
  const status = String(row?.status ?? "").trim();
  if (!raw && (!status || /^(?:失格|落車|棄権|欠場|中止|再乗)/u.test(status))) return null;
  throw new Error(`official rank unavailable without explicit disposition: car ${row?.carNo}`);
}

function uniquePlacement(rows, rank, winningMethod = false) {
  const matches = rows.filter((row) => row.rank === rank);
  const row = matches.length === 1 ? matches[0] : null;
  return { carNo: row?.carNo ?? null, name: row?.name ?? "", ...(winningMethod ? { winningMethod: row?.kimarite ?? "" } : {}) };
}

function singlePayout(items, label) {
  if (!Array.isArray(items) || items.length !== 1) throw new Error(`${label}: payout is missing or ambiguous`);
  const item = items[0];
  if (!/^\d(?:-\d){2}$/u.test(String(item.combination ?? "")) && label === "trifecta") {
    throw new Error("trifecta: invalid combination");
  }
  if (!/^\d-\d$/u.test(String(item.combination ?? "")) && label === "exacta") {
    throw new Error("exacta: invalid combination");
  }
  if (!Number.isFinite(Number(item.payoutYen)) || Number(item.payoutYen) <= 0) {
    throw new Error(`${label}: invalid payout`);
  }
  return { combination: item.combination, payoutYen: Number(item.payoutYen) };
}

export function verifyOfficialDailySource(source, results, entries, targetDate) {
  const resultByKey = flatten(results, targetDate, "results");
  const entryByKey = flatten(entries, targetDate, "entries");
  if (resultByKey.size !== entryByKey.size || resultByKey.size !== source.races.length) {
    throw new Error("official result, entry, and today race sets differ");
  }
  const feedVenueByKey = onePerKey(source.feed.venues ?? [], (venue) => String(venue.venueCode ?? ""), "today venues");
  const registrations = new Map();
  const verified = source.races.map((race) => {
    if (race.date !== targetDate || !race.venueKey || !race.raceNumber) throw new Error("today race identity unavailable");
    const feedVenue = feedVenueByKey.get(String((source.feed.venues ?? []).find((v) => v.slug === race.venueKey)?.venueCode ?? ""));
    if (!feedVenue || feedVenue.slug !== race.venueKey || cleanName(venueMap[race.venueKey]) !== cleanName(feedVenue.venue)) {
      throw new Error(`today venue identity conflict: ${race.raceKey}`);
    }
    const key = `${feedVenue.venueCode}:${race.raceNumber}`;
    const result = resultByKey.get(key);
    const entry = entryByKey.get(key);
    if (!result || !entry || officialVenueName(result.venue.venueName) !== cleanName(feedVenue.venue)
      || officialVenueName(entry.venue.venueName) !== cleanName(feedVenue.venue)) {
      throw new Error(`official venue/race mismatch: ${race.raceKey}`);
    }
    if ((result.race.quality?.warnings ?? []).length
      || (entry.race.quality?.warnings ?? []).some((warning) => warning !== "official lineup missing")) {
      throw new Error(`official source parser warnings: ${race.raceKey}`);
    }
    const entryRows = entry.race.entries;
    if (entry.race.entryStatus !== "available" || !Array.isArray(entryRows) || entryRows.length < 5) {
      throw new Error(`official entries incomplete: ${race.raceKey}`);
    }
    const entryByCar = onePerKey(entryRows, (row) => carNumber(row.carNo), `entry ${race.raceKey}`);
    const todayByCar = onePerKey(race.starters, (row) => carNumber(row.carNo), `today ${race.raceKey}`);
    if (entryByCar.size !== todayByCar.size) throw new Error(`today/entry starters differ: ${race.raceKey}`);
    const starters = [...entryByCar].map(([carNo, row]) => {
      const reg = registrationNo(row.registrationNo);
      const today = todayByCar.get(carNo);
      if (!reg || row.source !== "KEIRIN.JP:JSJ006" || !today
        || cleanName(today.name) !== cleanName(row.name)
        || (today.registrationNo && today.registrationNo !== reg)) {
        throw new Error(`official entry identity mismatch: ${race.raceKey} car ${carNo}`);
      }
      if (registrations.has(reg)) throw new Error(`registration number collision: ${reg}`);
      registrations.set(reg, { raceKey: race.raceKey, name: cleanName(row.name) });
      return { carNo, name: row.name, registrationNo: reg, identityStatus: "registration-no" };
    }).sort((a, b) => a.carNo - b.carNo);
    const official = result.race;
    if (official.resultStatus === "cancelled" && official.operationStatus === "cancelled"
      && race.operationStatus === "cancelled") {
      if ((official.finishOrder ?? []).length || (official.payouts?.trifecta ?? []).some((item) => item.payoutYen != null)) {
        throw new Error(`cancelled race has finish or payout: ${race.raceKey}`);
      }
      return { ...race, starters, result: { ...race.result, status: "unknown", finishOrder: [] },
        quality: { ...race.quality, resultParsed: false },
        sourceEvidence: { provider: "KEIRIN.JP", resultSource: "JSJ012", entrySource: "JSJ006",
          resultGeneratedAt: results.generatedAt ?? null, entryGeneratedAt: entries.generatedAt ?? null,
          actualFetchedAt: null, rawHttpResponseHash: null } };
    }
    if (official.resultStatus !== "confirmed" || official.operationStatus !== "finished"
      || race.operationStatus !== "finished") {
      throw new Error(`official result not confirmed: ${race.raceKey}`);
    }
    const finishRows = official.finishOrder;
    if (!Array.isArray(finishRows) || finishRows.length < 5) throw new Error(`official finish rows incomplete: ${race.raceKey}`);
    const finishByCar = onePerKey(finishRows, (row) => carNumber(row.carNo), `finish ${race.raceKey}`);
    if (finishByCar.size !== entryByCar.size) throw new Error(`official finish/entry rows differ: ${race.raceKey}`);
    const finishOrder = [...finishByCar].map(([carNo, row]) => {
      const starter = starters.find((item) => item.carNo === carNo);
      if (!starter || row.registrationNo !== starter.registrationNo || cleanName(row.name) !== cleanName(starter.name)) {
        throw new Error(`official result identity conflict: ${race.raceKey} car ${carNo}`);
      }
      return { carNo, registrationNo: starter.registrationNo, name: starter.name,
        rank: officialRank(row), kimarite: String(row.kimarite ?? ""), status: String(row.status ?? "") };
    });
    if (Array.isArray(race.result?.finishOrder) && race.result.finishOrder.length) {
      const supplied = onePerKey(race.result.finishOrder, (row) => carNumber(row.carNo), `today finish ${race.raceKey}`);
      if (supplied.size !== finishByCar.size || finishOrder.some((row) => {
        const candidate = supplied.get(row.carNo);
        return !candidate || officialRank(candidate) !== row.rank
          || (candidate.registrationNo && candidate.registrationNo !== row.registrationNo)
          || (candidate.name && cleanName(candidate.name) !== cleanName(row.name));
      })) {
        throw new Error(`today/official finish order conflict: ${race.raceKey}`);
      }
    }
    const trifecta = singlePayout(official.payouts?.trifecta, "trifecta");
    const exacta = singlePayout(official.payouts?.exacta, "exacta");
    const podium = [1, 2, 3].map((rank) => finishOrder.filter((row) => row.rank === rank));
    if (podium.some((rows) => rows.length !== 1)
      || podium.map((rows) => rows[0].carNo).join("-") !== trifecta.combination
      || podium.slice(0, 2).map((rows) => rows[0].carNo).join("-") !== exacta.combination) {
      throw new Error(`official rank/payout conflict: ${race.raceKey}`);
    }
    if (race.result.trifecta.combination !== trifecta.combination
      || race.result.trifecta.payoutYen !== trifecta.payoutYen
      || (race.result.exacta?.combination && race.result.exacta.combination !== exacta.combination)
      || (race.result.exacta?.payoutYen && race.result.exacta.payoutYen !== exacta.payoutYen)) {
      throw new Error(`today/official payout conflict: ${race.raceKey}`);
    }
    const officialResult = { ...race.result, status: "finished", finishOrder,
      first: uniquePlacement(finishOrder, 1, true), second: uniquePlacement(finishOrder, 2),
      third: uniquePlacement(finishOrder, 3), trifecta, exacta };
    return { ...race, starters, result: officialResult,
      quality: { ...race.quality, resultParsed: true,
        warnings: [...(race.quality.warnings ?? []), ...(finishOrder.some((row) => row.rank == null) ? ["official rank unavailable for some finishers"] : [])] },
      sourceEvidence: { provider: "KEIRIN.JP", resultSource: "JSJ012", entrySource: "JSJ006",
        resultGeneratedAt: results.generatedAt ?? null, entryGeneratedAt: entries.generatedAt ?? null,
        actualFetchedAt: null, rawHttpResponseHash: null } };
  });
  const keys = verified.map((race) => race.raceKey);
  if (new Set(keys).size !== keys.length || resultByKey.size !== verified.length) {
    throw new Error("duplicate or unmatched raceKey");
  }
  return { ...source, races: verified };
}

export async function loadAndVerifyOfficialDailySource(source, targetDate, paths = {}) {
  const [resultBytes, entryBytes] = await Promise.all([
    readFile(paths.results ?? resultPath),
    readFile(paths.entries ?? entryPath),
  ]);
  const verified = verifyOfficialDailySource(source, JSON.parse(resultBytes.toString("utf8")),
    JSON.parse(entryBytes.toString("utf8")), targetDate);
  const resultFileSha256 = createHash("sha256").update(resultBytes).digest("hex");
  const entryFileSha256 = createHash("sha256").update(entryBytes).digest("hex");
  return { ...verified, races: verified.races.map((race) => ({ ...race,
    sourceEvidence: { ...race.sourceEvidence, resultFileSha256, entryFileSha256 } })) };
}
