import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { isOfficialResultOnHold } from "../src/lib/officialResultConflict.mjs";
import { fetchOfficialResultJson, normalizeOfficialFinishStatus, isOfficialNonFinisherStatus } from "./lib/official-today-source.mjs";
import {
  readJsonIfPresent,
  writeJsonIfChanged,
} from "./lib/write-json-if-changed.mjs";

const DEFAULT_JSJ048_URL =
  "https://keirin.jp/pc/json?kaisaibikbn=0&kanyusyaflg=false&shccp=0&dispid=PJ0326&type=JSJ048";

const PUBLIC_OUTPUT_PATH = path.resolve(
  "public/data/races/keirin-jp-results.generated.json",
);

const LOCAL_OUTPUT_PATH = path.resolve(
  "scripts/debug/keirin-jp-results.local.json",
);

const args = process.argv.slice(2);

function getArgValue(name, fallback = "") {
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1] ?? fallback;

  return (
    args
      .find((arg) => arg.startsWith(`${name}=`))
      ?.slice(name.length + 1) ?? fallback
  );
}

function clean(value) {
  return String(value ?? "")
    .replace(/&nbsp;/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function numberValue(value) {
  if (value == null || value === "") return null;

  const match = String(value)
    .replaceAll(",", "")
    .match(/[+-]?\d+(?:\.\d+)?/u);

  if (!match) return null;

  const number = Number(match[0]);
  return Number.isFinite(number) ? number : null;
}

function integerValue(value) {
  const number = numberValue(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

function normalizeDate(value) {
  const digits = clean(value).replace(/[^0-9]/gu, "");

  if (digits.length !== 8) return "";

  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildJsonUrl(encp, type) {
  const url = new URL("https://keirin.jp/pc/json");
  url.searchParams.set("encp", encp);
  url.searchParams.set("type", type);
  return url;
}

const shouldWritePublic =
  process.env.GITHUB_ACTIONS === "true" ||
  args.includes("--write-public");

const outputPath = path.resolve(
  getArgValue(
    "--output",
    shouldWritePublic ? PUBLIC_OUTPUT_PATH : LOCAL_OUTPUT_PATH,
  ),
);

const listUrl = new URL(
  getArgValue("--url048", DEFAULT_JSJ048_URL),
);

const timeoutMs = Number(getArgValue("--timeout-ms", "15000"));
const delayMs = Number(getArgValue("--delay-ms", "120"));
const expectedDate = clean(getArgValue("--expect-date", ""));

if (expectedDate && !isIsoDate(expectedDate)) {
  throw new Error(`invalid --expect-date: ${expectedDate}`);
}

const rawResponses = new WeakMap();
export const OFFICIAL_RESULT_PROOF = Symbol("official-result-proof");
const publicOutputRelative = path.relative(path.resolve("public"), outputPath);
const isPublicOutput = !publicOutputRelative.startsWith("..") && !path.isAbsolute(publicOutputRelative);

async function fetchJson(url) {
  return fetchOfficialResultJson(url, {
    method: "GET",
    headers: {
      accept: "application/json,text/plain,*/*",
      "user-agent": "keirin-datalavo-keirin-jp-results/0.1",
    },
  }, {
    timeoutMs,
    label: `KEIRIN.JP ${url.searchParams.get("type") || "result"}`,
    onResponse: (response, bytes, value) => {
      const body = Buffer.from(bytes), sha256 = createHash("sha256").update(body).digest("hex");
      rawResponses.set(value, { type: url.searchParams.get("type"), url: url.href,
        finalUrl: response.url || url.href, status: response.status, fetchedAt: new Date().toISOString(),
        file: `${url.searchParams.get("type")}-${sha256}.json`, sha256, bodyBase64: body.toString("base64") });
    },
  });
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/u.test(value) && Number.isFinite(Date.parse(value))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function jstDate(now = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(now);
}

function venueName(value) {
  return clean(value).normalize("NFKC").replace(/\s/gu, "").replace(/競輪場$/u, "");
}

export function getOfficialResultListDates(data) {
  if (data?.resultCd !== 0 || !Array.isArray(data.RaceList) || !data.RaceList.length) {
    throw new Error("OFFICIAL_LIST_INVALID_OR_EMPTY; output was not written.");
  }
  const codes = new Set(), parameters = new Set();
  const dates = data.RaceList.map((venue) => {
    if (!venue || typeof venue !== "object") throw new Error("OFFICIAL_LIST_IDENTITY_INVALID; output was not written.");
    const date = normalizeDate(venue.kaisaiDate ?? venue.selKaisai ?? venue.kaisaiDateDisp ?? venue.kaisaiBi);
    const code = clean(venue.naibuKeirinCd), parameter = clean(venue.touhyouLivePara);
    if (!isIsoDate(date) || !/^\d{2}$/u.test(code) || !venueName(venue.keirinjoName)
      || !parameter || codes.has(code) || parameters.has(parameter)) {
      throw new Error("OFFICIAL_LIST_IDENTITY_INVALID; output was not written.");
    }
    codes.add(code); parameters.add(parameter); return date;
  });
  const unique = [...new Set(dates)].sort();
  if (unique.length !== 1) throw new Error(`OFFICIAL_LIST_MIXED_DATES: ${unique.join(",")}; output was not written.`);
  return unique;
}

export async function fetchExpectedListData({ url = listUrl, now = new Date(), targetDate = expectedDate || jstDate(now), fetchImpl = fetchJson } = {}) {
  if (!isIsoDate(targetDate)) throw new Error(`invalid target date: ${targetDate}`);
  const base = new URL(url);
  if (base.origin !== "https://keirin.jp" || base.username || base.password || base.pathname !== "/pc/json" || base.searchParams.get("type") !== "JSJ048") {
    throw new Error("KEIRIN.JP公式のJSJ048 URLを指定してください。");
  }
  const candidates = [...new Set([clean(base.searchParams.get("kaisaibikbn")), "1", "0", "-1", "2"].filter(Boolean))];
  const attempts = [];
  for (const kbn of candidates) {
    const candidateUrl = new URL(base); candidateUrl.searchParams.set("kaisaibikbn", kbn);
    const data = await fetchImpl(candidateUrl);
    const dates = getOfficialResultListDates(data);
    attempts.push({ kaisaiDateKbn: kbn, dates, venueCount: data.RaceList.length, url: candidateUrl.href });
    if (dates[0] === targetDate) return { data, url: candidateUrl, kaisaiDateKbn: kbn, attempts, targetDate };
  }
  throw new Error(`OFFICIAL_TARGET_DATE_UNAVAILABLE: expected ${targetDate}; attempts=${JSON.stringify(attempts)}; output was not written.`);
}

const PAYOUT_GROUPS = ["WH2HaraiGakuDispItemSubData", "WT2HaraiGakuDispItemSubData", "SH2HaraiGakuDispItemSubData", "ST2HaraiGakuDispItemSubData", "RH3HaraiGakuDispItemSubData", "RT3HaraiGakuDispItemSubData", "WHaraiGakuDispItemSubData"];

function validateUnrankedContext({ raceNumber, date, venueCode, entries, detail }) {
  const header = detail?.C0201data;
  if (!isIsoDate(date) || !Number.isInteger(raceNumber) || raceNumber < 1 || raceNumber > 12
    || entries?.resultCd !== 0 || detail?.resultCd !== 0 || normalizeDate(header?.selKaisai) !== date
    || clean(header?.selKjyoCd) !== venueCode || integerValue(header?.selRaceNo) !== raceNumber
    || clean(entries?.bKeirinjyoCd) !== venueCode) throw new Error("OFFICIAL_RESULT_RACE_IDENTITY_MISMATCH");
  const starters = entries.sensyuTypeInfo, details = header?.C0201racedtl?.C0201sensyu;
  if (!Array.isArray(starters) || !starters.length || !Array.isArray(details) || starters.length !== details.length) throw new Error("OFFICIAL_RESULT_RIDER_COUNT_MISMATCH");
  const byCar = new Map(details.map(row => [clean(row.carNum), clean(row.numPlayer)]));
  const cars = new Set(), registrations = new Set();
  if (byCar.size !== details.length) throw new Error("OFFICIAL_RESULT_DETAIL_DUPLICATE");
  for (const rider of starters) {
    const car = clean(rider.syaban), registration = clean(rider.sensyuRegistNo);
    if (!/^[1-9]$/u.test(car) || !/^\d{6}$/u.test(registration) || !clean(rider.sensyuName)
      || cars.has(car) || registrations.has(registration) || byCar.get(car) !== registration) throw new Error("OFFICIAL_RESULT_ENTRY_IDENTITY_INVALID");
    cars.add(car); registrations.add(registration);
  }
  return header;
}

function classifyUnrankedPublication(context) {
  const { data, raceNumber } = context;
  const header = validateUnrankedContext(context);
  const payouts = data.haraiGakuSubData;
  if (!payouts || typeof payouts !== "object" || payouts.APartReturnDispFlg !== false
    || PAYOUT_GROUPS.some(key => !Array.isArray(payouts[key]) || !payouts[key].length)
    || Object.keys(payouts).some(key => key !== "APartReturnDispFlg" && !PAYOUT_GROUPS.includes(key))) throw new Error("OFFICIAL_UNRANKED_PAYOUT_FORMAT_INVALID");
  let refunded = 0, numeric = 0;
  for (const key of PAYOUT_GROUPS) {
    for (const row of payouts[key]) {
      if (!row || typeof row !== "object") throw new Error("OFFICIAL_UNRANKED_PAYOUT_FORMAT_INVALID");
      const display = clean(row.haraiGaku), combination = clean(row.kumiBan);
      if (["【全返還】", "【未発売】"].includes(display)) {
        if (payouts[key].length !== 1 || combination || row.kumiDispFlg !== false || row.ninkiDispFlg !== false) throw new Error("OFFICIAL_REFUND_PAYOUT_CONTRADICTION");
        if (display === "【全返還】") refunded += 1;
      } else {
        const separator = ["WT2HaraiGakuDispItemSubData", "ST2HaraiGakuDispItemSubData", "RT3HaraiGakuDispItemSubData"].includes(key) ? "-" : "=";
        const count = ["RH3HaraiGakuDispItemSubData", "RT3HaraiGakuDispItemSubData"].includes(key) ? 3 : 2;
        const cars = combination.split(separator);
        if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/u.test(display) || numberValue(display) <= 0
          || cars.length !== count || cars.some(car => !/^[1-9]$/u.test(car)) || new Set(cars).size !== cars.length
          || row.kumiDispFlg !== true || typeof row.ninkiDispFlg !== "boolean") throw new Error("OFFICIAL_UNRANKED_PAYOUT_FORMAT_INVALID");
        numeric += 1;
      }
    }
  }
  if (refunded && numeric) throw new Error("OFFICIAL_REFUND_PAYOUT_CONTRADICTION");
  if (refunded) {
    const note = clean(header.hhMessage).normalize("NFKC");
    const cancelled = [...note.matchAll(/(\d+(?:\s*[,、・]\s*\d+)*)\s*(?:レース|R)\s*は中止(?:となりました|となります|です)?[。.]?/gu)]
      .some(match => match[1].split(/\s*[,、・]\s*/u).map(Number).includes(raceNumber));
    if (!cancelled || !(header.flgRaceCancel === true || header.flgSectionCancel === true)) throw new Error("OFFICIAL_CANCELLATION_EVIDENCE_MISSING");
    return { kind: "cancelled", note: clean(header.hhMessage) };
  }
  const meta = header.C0201race?.[raceNumber - 1];
  if (!numeric || header.flgRaceCancel !== false || header.flgSectionCancel !== false
    || clean(meta?.rcvKekka) !== "0" || clean(meta?.rcvRefund) !== "1") throw new Error("OFFICIAL_FINISH_PUBLICATION_STATE_INVALID");
  return { kind: "awaiting-finish" };
}

export function validateOfficialResultIdentity({ raceNumber, date, venueCode, data, entries, detail }) {
  if (data?.resultCd !== 0 || typeof data.tyakujyunDispFlg !== "boolean" || typeof data.haraiGakuDispFlg !== "boolean"
    || (data.tyakujyunItemSubData != null && !Array.isArray(data.tyakujyunItemSubData))) throw new Error("OFFICIAL_RESULT_RESPONSE_INVALID");
  const rows = data.tyakujyunItemSubData ?? [];
  if (!data.haraiGakuDispFlg && data.haraiGakuSubData && Object.values(data.haraiGakuSubData).some(value => Array.isArray(value) && value.length)) throw new Error("OFFICIAL_UNPUBLISHED_PAYOUT_CONTRADICTION");
  if (!rows.length) {
    const refundOnly = data.haraiGakuDispFlg && data.haraiGakuSubData
      && Object.entries(data.haraiGakuSubData).some(([key, value]) => PAYOUT_GROUPS.includes(key) && Array.isArray(value) && value.length)
      && Object.entries(data.haraiGakuSubData).every(([key, value]) => key === "APartReturnDispFlg" ? value === false
        : PAYOUT_GROUPS.includes(key) && Array.isArray(value) && value.length > 0
          && value.every(row => clean(row.kumiBan) === "全返還" && clean(row.haraiGaku) === "全返還"));
    if (data.tyakujyunDispFlg) throw new Error("OFFICIAL_RESULT_ROWS_MISSING");
    if (data.haraiGakuDispFlg && !refundOnly) return classifyUnrankedPublication({ raceNumber, date, venueCode, data, entries, detail });
    // Keep the pre-existing legacy refund-only validator contract; live acquisition still checks its race context.
    if (refundOnly && (date || entries || detail)) validateUnrankedContext({ raceNumber, date, venueCode, entries, detail });
    return;
  }
  const header = detail?.C0201data;
  if (!data.tyakujyunDispFlg || entries?.resultCd !== 0 || detail?.resultCd !== 0
    || normalizeDate(header?.selKaisai) !== date || clean(header?.selKjyoCd) !== venueCode
    || integerValue(header?.selRaceNo) !== raceNumber || clean(entries?.bKeirinjyoCd) !== venueCode) throw new Error("OFFICIAL_RESULT_RACE_IDENTITY_MISMATCH");
  const starters = Array.isArray(entries.sensyuTypeInfo) ? entries.sensyuTypeInfo : [];
  const detailRows = header?.C0201racedtl?.C0201sensyu;
  if (!starters.length || !Array.isArray(detailRows) || starters.length !== rows.length || detailRows.length !== rows.length) throw new Error("OFFICIAL_RESULT_RIDER_COUNT_MISMATCH");
  const byCar = new Map(), registrations = new Set();
  for (const rider of starters) {
    const car = clean(rider.syaban), registration = clean(rider.sensyuRegistNo);
    if (!/^[1-9]$/u.test(car) || !/^\d{6}$/u.test(registration) || !clean(rider.sensyuName) || byCar.has(car) || registrations.has(registration)) throw new Error("OFFICIAL_RESULT_ENTRY_IDENTITY_INVALID");
    byCar.set(car, rider); registrations.add(registration);
  }
  const detailByCar = new Map(detailRows.map(row => [clean(row.carNum), clean(row.numPlayer)]));
  const seen = new Set();
  if (detailByCar.size !== rows.length) throw new Error("OFFICIAL_RESULT_DETAIL_DUPLICATE");
  for (const row of rows) {
    const car = clean(row.syaban), starter = byCar.get(car);
    if (!starter || seen.has(car) || clean(row.sensyuRegistNo) !== clean(starter.sensyuRegistNo)
      || detailByCar.get(car) !== clean(row.sensyuRegistNo)
      || clean(row.sensyuName).normalize("NFKC").replace(/\s/gu, "") !== clean(starter.sensyuName).normalize("NFKC").replace(/\s/gu, "")) throw new Error("OFFICIAL_RESULT_RIDER_IDENTITY_MISMATCH");
    seen.add(car);
  }
}

function payoutRows(data, key) {
  const rows = data?.haraiGakuSubData?.[key];

  if (!Array.isArray(rows)) return [];

  return rows.map((row) => ({
    combination: clean(row.kumiBan),
    payoutYen: numberValue(row.haraiGaku),
    payoutDisplay: clean(row.haraiGaku),
    popularity: integerValue(row.ninki),
  }));
}

function createPayouts(data) {
  return {
    bracketQuinella: payoutRows(data, "WH2HaraiGakuDispItemSubData"),
    bracketExacta: payoutRows(data, "WT2HaraiGakuDispItemSubData"),
    quinella: payoutRows(data, "SH2HaraiGakuDispItemSubData"),
    exacta: payoutRows(data, "ST2HaraiGakuDispItemSubData"),
    trio: payoutRows(data, "RH3HaraiGakuDispItemSubData"),
    trifecta: payoutRows(data, "RT3HaraiGakuDispItemSubData"),
    wide: payoutRows(data, "WHaraiGakuDispItemSubData"),
  };
}

function firstUsablePayout(rows) {
  return (
    rows.find(
      (row) =>
        row.combination &&
        Number.isFinite(row.payoutYen),
    ) ?? null
  );
}

export function createRaceResult(raceNumber, raceMeta, data, publicationState) {
  const finishOrder = Array.isArray(data.tyakujyunItemSubData)
    ? data.tyakujyunItemSubData.map((row) => {
        const rank = clean(row.tyaku);

        return {
          rank,
          carNo: clean(row.syaban),
          name: clean(row.sensyuName),
          registrationNo: clean(row.sensyuRegistNo),
          gap: clean(row.tyakusa),
          agari: clean(row.agari),
          kimarite: clean(row.kimarite),
          mark: clean(row.BH),
          status: normalizeOfficialFinishStatus(row),
        };
      })
    : [];

  const payouts = createPayouts(data);
  const exacta = firstUsablePayout(payouts.exacta);
  const trifecta = firstUsablePayout(payouts.trifecta);

  const hasFinishOrder = finishOrder.length > 0;
  const hasTrifecta = Boolean(trifecta);
  const hasUnresolvedFinisher = finishOrder.some((row) =>
    !/^\d+$/.test(row.rank) && !isOfficialNonFinisherStatus(row.status));

  const resultStatus =
    hasFinishOrder && hasTrifecta && !hasUnresolvedFinisher
      ? "confirmed"
      : hasFinishOrder
        ? "partial"
        : "pending";

  return {
    raceNumber,
    resultStatus,
    operationStatus: publicationState?.kind === "cancelled" ? "cancelled"
      : resultStatus === "confirmed" ? "finished" : "pending",
    ...(publicationState ? { officialPublicationState: publicationState } : {}),
    raceEnded: Boolean(raceMeta?.flgRaceEnd),
    raceButtonActive: Boolean(raceMeta?.flgActvRaceBtn),
    resultCode: data.resultCd ?? null,
    resultVisible: Boolean(data.tyakujyunDispFlg),
    lastUpdateTime: clean(data.lastUpdateTime),
    weatherActual: {
      condition: clean(data.tenki),
      windSpeedMps: numberValue(data.husoku),
    },
    finishOrder,
    kimarite: finishOrder[0]?.kimarite ?? "",
    secondKimarite: finishOrder[1]?.kimarite ?? "",
    sLeaderCarNo:
      finishOrder.find((row) => row.mark.includes("S"))?.carNo ?? "",
    hLeaderCarNo:
      finishOrder.find((row) => row.mark.includes("H"))?.carNo ?? "",
    bLeaderCarNo:
      finishOrder.find((row) => row.mark.includes("B"))?.carNo ?? "",
    payouts,
    payout2tan: exacta,
    payout3tan: trifecta,
    quality: {
      finishOrderCount: finishOrder.length,
      hasFinishOrder,
      hasTrifecta,
      warnings: [
        ...(publicationState ? [`official publication: ${publicationState.kind}`] : []),
        ...(hasFinishOrder ? [] : ["finish order missing"]),
        ...(hasTrifecta ? [] : ["trifecta payout missing"]),
        ...(hasUnresolvedFinisher ? ["finisher status unresolved"] : []),
      ],
    },
  };
}

function createErrorRace(raceNumber, message) {
  return {
    raceNumber,
    resultStatus: "error",
    operationStatus: "pending",
    error: clean(message),
    finishOrder: [],
    payouts: {
      bracketQuinella: [],
      bracketExacta: [],
      quinella: [],
      exacta: [],
      trio: [],
      trifecta: [],
      wide: [],
    },
    payout2tan: null,
    payout3tan: null,
    quality: {
      finishOrderCount: 0,
      hasFinishOrder: false,
      hasTrifecta: false,
      warnings: ["official result fetch failed"],
    },
  };
}

function reportRaceError(raceId, apiType, error) {
  const reason = clean(error instanceof Error ? error.message : String(error));
  const category = /IDENTITY|MISMATCH|DUPLICATE/u.test(reason) ? "IDENTITY_MISMATCH"
    : /request failed: \d{3}/u.test(reason) ? "HTTP_ERROR"
      : error?.name === "TimeoutError" || error?.name === "AbortError" ? "NETWORK_TIMEOUT"
        : error instanceof SyntaxError ? "RESPONSE_PARSE_ERROR"
          : error instanceof TypeError ? "NETWORK_ERROR"
            : /^OFFICIAL_/u.test(reason) ? "RESPONSE_CONTRADICTION" : "UNKNOWN_ERROR";
  console.error(JSON.stringify({ event: "official-result-error", raceId, apiType, category, reason }));
}

export function raceResultSignature(race) {
  return JSON.stringify({
    operationStatus: race.operationStatus,
    finishOrder: race.finishOrder,
    kimarite: race.kimarite,
    secondKimarite: race.secondKimarite,
    sLeaderCarNo: race.sLeaderCarNo,
    hLeaderCarNo: race.hLeaderCarNo,
    bLeaderCarNo: race.bLeaderCarNo,
    payouts: race.payouts,
  });
}

export function describeSettledResultConflict(raceId, previous, candidate) {
  const before = JSON.parse(raceResultSignature(previous)), after = JSON.parse(raceResultSignature(candidate));
  const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])].map(field => ({ field,
    equal: JSON.stringify(before[field]) === JSON.stringify(after[field]),
    previous: before[field], candidate: after[field] }));
  return { event: "settled-official-result-conflict", raceId, resolution: "blocked; existing file retained",
    changedFields: fields.filter(row => !row.equal).map(row => row.field), fields };
}

function raceKey(venue, race) {
  return `${venue.date}:${venue.venueCode}:${race.raceNumber}`;
}

export function summarize(payload) {
  const races = payload.venues.flatMap((venue) => venue.races);

  return {
    ...payload,
    venueCount: payload.venues.length,
    raceCount: races.length,
    confirmedRaceCount: races.filter(
      (race) => race.resultStatus === "confirmed",
    ).length,
    partialRaceCount: races.filter(
      (race) => race.resultStatus === "partial",
    ).length,
    pendingRaceCount: races.filter(
      (race) => race.resultStatus === "pending",
    ).length,
    errorCount: races.filter(
      (race) => race.resultStatus === "error",
    ).length,
    cancelledRaceCount: races.filter((race) => race.operationStatus === "cancelled").length,
    venues: payload.venues.map((venue) => ({
      ...venue,
      raceCount: venue.races.length,
      confirmedRaceCount: venue.races.filter(
        (race) => race.resultStatus === "confirmed",
      ).length,
      partialRaceCount: venue.races.filter(
        (race) => race.resultStatus === "partial",
      ).length,
      pendingRaceCount: venue.races.filter(
        (race) => race.resultStatus === "pending",
      ).length,
      errorCount: venue.races.filter(
        (race) => race.resultStatus === "error",
      ).length,
      cancelledRaceCount: venue.races.filter((race) => race.operationStatus === "cancelled").length,
    })),
  };
}

export function mergeWithExisting(existing, candidate) {
  if (!existing || existing.date !== candidate.date) {
    return {
      payload: candidate,
      preservedSettledRaceCount: 0,
    };
  }

  if (candidate.venueCount < existing.venueCount) {
    throw new Error(
      `venue count regression: ${existing.venueCount} -> ${candidate.venueCount}`,
    );
  }

  if (candidate.raceCount < existing.raceCount) {
    throw new Error(
      `race count regression: ${existing.raceCount} -> ${candidate.raceCount}`,
    );
  }

  const previousByKey = new Map();

  for (const venue of existing.venues ?? []) {
    for (const race of venue.races ?? []) {
      previousByKey.set(raceKey(venue, race), race);
    }
  }

  let preservedSettledRaceCount = 0;

  const venues = candidate.venues.map((venue) => ({
    ...venue,
    races: venue.races.map((race) => {
      const previous = previousByKey.get(raceKey(venue, race));

      if (!previous || previous.resultStatus !== "confirmed") {
        return race;
      }

      if (race.resultStatus !== "confirmed") {
        preservedSettledRaceCount += 1;
        return previous;
      }

      // Only fill missing official states; other settled-result changes remain conflicts.
      const enrichedPrevious = { ...previous, finishOrder: previous.finishOrder?.map((row, index) => ({
        ...row, status: row.status || race.finishOrder?.[index]?.status || "",
      })) };
      if (
        raceResultSignature(enrichedPrevious) !==
        raceResultSignature(race)
      ) {
        throw Object.assign(new Error(`settled official result conflict: ${raceKey(venue, race)}`), {
          code: "SETTLED_OFFICIAL_RESULT_CONFLICT", raceId: raceKey(venue, race),
          conflict: describeSettledResultConflict(raceKey(venue, race), previous, race),
        });
      }

      return race;
    }),
  }));

  return {
    payload: summarize({
      ...candidate,
      venues,
    }),
    preservedSettledRaceCount,
  };
}

export async function fetchVenue(venue, { targetDate = expectedDate || jstDate(), fetchImpl = fetchJson, sleepImpl = sleep, collectConflictEvidence = false, onConfirmedRace } = {}) {
  const venueEntryParameter = clean(venue.touhyouLivePara);

  if (!venueEntryParameter) {
    throw new Error(
      `touhyouLivePara missing: ${clean(venue.keirinjoName)}`,
    );
  }

  const indexData = await fetchImpl(
    buildJsonUrl(venueEntryParameter, "JSJ001"),
  );

  const venueData = indexData?.C0201data ?? {};
  const raceList = Array.isArray(venueData.C0201race)
    ? venueData.C0201race
    : [];

  if (indexData?.resultCd !== 0 || normalizeDate(venue.kaisaiDate) !== targetDate
    || normalizeDate(venueData.selKaisai) !== targetDate || clean(venueData.selKjyoCd) !== clean(venue.naibuKeirinCd)
    || venueName(venueData.joName) !== venueName(venue.keirinjoName) || !raceList.length) throw new Error("OFFICIAL_VENUE_DATE_OR_IDENTITY_MISMATCH; output was not written.");

  const races = [];
  const seenRaces = new Set(), seenParameters = new Set();

  for (const [index, raceMeta] of raceList.entries()) {
    const explicitNumbers = [raceMeta.raceNo, raceMeta.raceNum].map(clean).filter(Boolean);
    if (explicitNumbers.some(number => !/^\d{1,2}$/u.test(number)) || new Set(explicitNumbers.map(Number)).size > 1) throw new Error("OFFICIAL_RACE_MAPPING_INVALID; output was not written.");
    const raceNumber =
      integerValue(raceMeta.raceNo) ??
      integerValue(raceMeta.raceNum) ??
      index + 1;

    const raceParameter = clean(raceMeta.encParaR);

    if (!Number.isInteger(raceNumber) || raceNumber < 1 || raceNumber > 12 || seenRaces.has(raceNumber)
      || (raceParameter && seenParameters.has(raceParameter))) throw new Error("OFFICIAL_RACE_MAPPING_INVALID; output was not written.");
    seenRaces.add(raceNumber); if (raceParameter) seenParameters.add(raceParameter);

    if (!raceParameter) {
      reportRaceError(`${targetDate}:${clean(venue.naibuKeirinCd)}:${raceNumber}`, "JSJ001", new Error("encParaR missing"));
      races.push(
        createErrorRace(
          raceNumber,
          "encParaR missing",
        ),
      );

      continue;
    }

    let apiType = "JSJ012";
    try {
      const resultData = await fetchImpl(
        buildJsonUrl(raceParameter, "JSJ012"),
      );

      let entries, detail;
      if ((Array.isArray(resultData.tyakujyunItemSubData) && resultData.tyakujyunItemSubData.length)
        || resultData.haraiGakuDispFlg === true) {
        apiType = "JSJ006";
        entries = await fetchImpl(buildJsonUrl(raceParameter, "JSJ006"));
        apiType = "JSJ001";
        detail = await fetchImpl(buildJsonUrl(raceParameter, "JSJ001"));
      }
      apiType = "JSJ012/JSJ006/JSJ001";
      const publicationState = validateOfficialResultIdentity({ raceNumber, date: targetDate, venueCode: clean(venue.naibuKeirinCd), data: resultData, entries, detail });

      const normalized = createRaceResult(
          raceNumber,
          raceMeta,
          resultData,
          publicationState,
        );
      if (collectConflictEvidence && normalized.resultStatus === "confirmed") {
        const records = [resultData, entries, detail].map(value => rawResponses.get(value));
        if (records.some(record => !record)) throw new Error("OFFICIAL_RESPONSE_PROOF_MISSING");
        const { createOfficialConflictProof } = await import("./plan-official-result-conflict-isolation.mjs");
        Object.defineProperty(normalized, OFFICIAL_RESULT_PROOF, { value: createOfficialConflictProof(
          { date: targetDate, venueCode: clean(venue.naibuKeirinCd), raceNumber },
          { JSJ012: resultData, JSJ006: entries, JSJ001: detail }, records) });
      }
      if (normalized.resultStatus === "confirmed") await onConfirmedRace?.({
        date: targetDate, venueCode: clean(venueData.selKjyoCd), venueName: clean(venueData.joName),
      }, normalized);
      races.push(normalized);
    } catch (error) {
      reportRaceError(`${targetDate}:${clean(venue.naibuKeirinCd)}:${raceNumber}`, apiType, error);
      races.push(
        createErrorRace(
          raceNumber,
          error instanceof Error
            ? error.message
            : String(error),
        ),
      );
    }

    await sleepImpl(delayMs);
  }

  return {
    date:
      normalizeDate(venueData.selKaisai) ||
      normalizeDate(venue.kaisaiDate),
    venueCode: clean(venueData.selKjyoCd),
    venueName:
      clean(venueData.joName) ||
      clean(venue.keirinjoName),
    grade: clean(venue.gradeIconName),
    raceName: clean(venueData.raceName),
    races,
  };
}

async function main() {
  if (
    listUrl.hostname !== "keirin.jp" ||
    listUrl.pathname !== "/pc/json" ||
    listUrl.searchParams.get("type") !== "JSJ048"
  ) {
    throw new Error(
      "KEIRIN.JP公式のJSJ048 URLを指定してください。",
    );
  }

  const fetchStartedAt = new Date().toISOString();
  const targetDate = expectedDate || jstDate();
  if (isPublicOutput && targetDate !== jstDate()) throw new Error("PAST_DATE_PUBLIC_OUTPUT_PROHIBITED");
  if (targetDate !== jstDate() && !getArgValue("--output")) throw new Error("PAST_DATE_REQUIRES_EXPLICIT_OUTPUT");
  const resolvedList = await fetchExpectedListData({ targetDate });
  const listData = resolvedList.data;
  console.log(`[official date] expected=${targetDate} selected=${resolvedList.kaisaiDateKbn} attempts=${resolvedList.attempts.length}`);

  const venueList = Array.isArray(listData.RaceList)
    ? listData.RaceList
    : [];

  if (!venueList.length) {
    throw new Error(
      "KEIRIN.JP JSJ048 returned no venues; output was not written.",
    );
  }

  let existing, existingReadError;
  try { existing = readJsonIfPresent(outputPath); }
  catch (error) { existingReadError = error; }
  const { mergeOfficialResultsWithConflictIsolation, persistOfficialConflictEvidence, verifyConflictRegistryImport } = await import("./plan-official-result-conflict-isolation.mjs");
  const persistedEvidence = new Set();
  const persistEvidence = async bundles => {
    const pending = bundles.filter(row => !persistedEvidence.has(row.sha256));
    if (!pending.length) return;
    const files = await persistOfficialConflictEvidence(pending);
    for (const row of pending) persistedEvidence.add(row.sha256);
    for (const file of files) console.log(JSON.stringify({ event: "official-conflict-evidence-saved", ...file }));
  };
  // Persist each validated conflict before another race can abort the acquisition.
  // The full-feed validation and public write gates below remain unchanged.
  const onConfirmedRace = async (venue, race) => {
    if (existing?.date !== targetDate) return;
    const previousVenues = existing.venues?.filter(row => row.venueCode === venue.venueCode) ?? [];
    if (previousVenues.length !== 1) return;
    const previousRaces = previousVenues[0].races?.filter(row => row.raceNumber === race.raceNumber) ?? [];
    if (previousRaces.length !== 1 || previousRaces[0].resultStatus !== "confirmed"
      || raceResultSignature(previousRaces[0]) === raceResultSignature(race)) return;
    const before = summarize({ ...existing, venues: [{ ...previousVenues[0], races: [previousRaces[0]] }] });
    const after = summarize({ ...before, venues: [{ ...venue, races: [race] }] });
    const isolated = mergeOfficialResultsWithConflictIsolation(before, after, [race[OFFICIAL_RESULT_PROOF]]);
    await persistEvidence(isolated.evidenceBundles);
    for (const conflict of isolated.conflicts) console.warn(JSON.stringify({
      event: "official-result-conflict-acquired", ...conflict, settlement: "hold; public output not committed",
    }));
  };
  const venues = [];

  for (const venue of venueList) {
    venues.push(await fetchVenue(venue, { targetDate, collectConflictEvidence: true, onConfirmedRace }));
    await sleep(delayMs);
  }

  venues.sort(
    (left, right) =>
      left.venueCode.localeCompare(right.venueCode),
  );

  const dates = [
    ...new Set(
      venues
        .map((venue) => venue.date)
        .filter(Boolean),
    ),
  ];

  if (dates.length !== 1) {
    throw new Error(
      `unexpected KEIRIN.JP date set: ${dates.join(", ") || "(empty)"}`,
    );
  }

  if (dates[0] !== targetDate) {
    throw new Error(
      `KEIRIN.JP date mismatch: expected ${targetDate}, actual ${dates[0]}; output was not written.`,
    );
  }
  const candidate = summarize({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: {
      provider: "KEIRIN.JP",
      listType: "JSJ048",
      endpoint: "/pc/json",
      kaisaiDateKbn: resolvedList.kaisaiDateKbn,
      expectedDate: targetDate,
      listUrl: resolvedList.url.href,
      listResolutionAttempts: resolvedList.attempts,
      fetchStartedAt,
      fetchCompletedAt: new Date().toISOString(),
    },
    date: dates[0],
    venues,
  });

  if (candidate.venueCount <= 0 || candidate.raceCount <= 0) {
    throw new Error(
      "KEIRIN.JP result feed is empty; output was not written.",
    );
  }

  if (shouldWritePublic && candidate.errorCount > 0) {
    console.error(JSON.stringify({ event: "official-result-summary", date: targetDate,
      normal: candidate.confirmedRaceCount + candidate.partialRaceCount,
      pending: candidate.pendingRaceCount - candidate.cancelledRaceCount,
      cancelled: candidate.cancelledRaceCount, errors: candidate.errorCount }));
    throw new Error(
      `KEIRIN.JP result feed has ${candidate.errorCount} fetch errors; public output was not written.`,
    );
  }

  if (existingReadError) throw existingReadError;
  const proofs = venues.flatMap(venue => venue.races.map(race => race[OFFICIAL_RESULT_PROOF]).filter(Boolean));
  const approvalsFile = getArgValue("--conflict-approvals");
  const approvals = approvalsFile ? readJsonIfPresent(path.resolve(approvalsFile)) : [];
  const resolutionFile = getArgValue("--conflict-registry-snapshot");
  const resolutionSnapshot = resolutionFile ? readJsonIfPresent(path.resolve(resolutionFile)) : undefined;
  if (resolutionFile && !resolutionSnapshot) throw new Error("CONFLICT_RESOLUTION_SNAPSHOT_MISSING");
  if (!Array.isArray(approvals)) throw new Error("INVALID_CONFLICT_APPROVALS");
  if (resolutionSnapshot) await verifyConflictRegistryImport(resolutionSnapshot, targetDate);
  const {
    payload,
    preservedSettledRaceCount,
    conflicts,
    evidenceBundles,
  } = mergeOfficialResultsWithConflictIsolation(existing, candidate, proofs, approvals, { resolutionSnapshot });
  // Private raw evidence must be persisted successfully before the public normalized snapshot can change.
  await persistEvidence(evidenceBundles);
  for (const conflict of conflicts) console.warn(JSON.stringify({ event: "official-result-quarantined", ...conflict, settlement: "hold; previous official value retained" }));
  // Recheck the day after acquisition; historical replays require an explicit non-public output.
  if (isPublicOutput && targetDate !== jstDate()) throw new Error("PAST_DATE_PUBLIC_OUTPUT_PROHIBITED");

  const writeResult = writeJsonIfChanged(
    outputPath,
    payload,
  );

  console.log("[keirin-jp results update]");
  console.log(
    `mode: ${shouldWritePublic ? "public" : "local"}`,
  );
  console.log(`output: ${outputPath}`);
  console.log(`date: ${writeResult.value.date}`);
  console.log(`venues: ${writeResult.value.venueCount}`);
  console.log(`races: ${writeResult.value.raceCount}`);
  console.log(
    `confirmed: ${writeResult.value.confirmedRaceCount}`,
  );
  console.log(
    `partial: ${writeResult.value.partialRaceCount}`,
  );
  console.log(
    `pending: ${writeResult.value.pendingRaceCount}`,
  );
  console.log(
    `errors: ${writeResult.value.errorCount}`,
  );
  console.log(
    `preserved settled: ${preservedSettledRaceCount}`,
  );
  console.log(`changed: ${writeResult.changed}`);
  console.log(`unresolved conflicts: ${writeResult.value.venues.flatMap(venue => venue.races).filter(isOfficialResultOnHold).length}`);
  console.log(`verified confirmed (excluding held races): ${writeResult.value.verifiedConfirmedRaceCount}`);
  console.log(`historical unresolved holds (metadata only): ${(writeResult.value.officialResultConflictRegistry ?? []).filter(row => row.date !== targetDate && row.status === "unresolved").length}`);
  console.log(JSON.stringify({ event: "official-result-summary", date: targetDate,
    normal: writeResult.value.confirmedRaceCount - conflicts.length + writeResult.value.partialRaceCount,
    unresolvedConflicts: conflicts.length,
    pending: writeResult.value.pendingRaceCount - writeResult.value.cancelledRaceCount,
    cancelled: writeResult.value.cancelledRaceCount, errors: writeResult.value.errorCount }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => {
  console.error("[keirin-jp results update] failed");
  if (error.conflict) console.error(JSON.stringify(error.conflict));
  console.error(error);
  process.exitCode = 1;
});
