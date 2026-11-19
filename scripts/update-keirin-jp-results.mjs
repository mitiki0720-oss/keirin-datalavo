import path from "node:path";
import { fileURLToPath } from "node:url";
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

export function validateOfficialResultIdentity({ raceNumber, date, venueCode, data, entries, detail }) {
  if (data?.resultCd !== 0 || typeof data.tyakujyunDispFlg !== "boolean" || typeof data.haraiGakuDispFlg !== "boolean"
    || (data.tyakujyunItemSubData != null && !Array.isArray(data.tyakujyunItemSubData))) throw new Error("OFFICIAL_RESULT_RESPONSE_INVALID");
  const rows = data.tyakujyunItemSubData ?? [];
  if (!data.haraiGakuDispFlg && data.haraiGakuSubData && Object.values(data.haraiGakuSubData).some(value => Array.isArray(value) && value.length)) throw new Error("OFFICIAL_UNPUBLISHED_PAYOUT_CONTRADICTION");
  if (!rows.length) {
    const refundOnly = data.haraiGakuDispFlg && data.haraiGakuSubData && Object.values(data.haraiGakuSubData).every(value => !Array.isArray(value) || value.every(row => clean(row.kumiBan) === "全返還"));
    if (data.tyakujyunDispFlg || (data.haraiGakuDispFlg && !refundOnly)) throw new Error("OFFICIAL_RESULT_ROWS_MISSING");
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

export function createRaceResult(raceNumber, raceMeta, data) {
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
    operationStatus:
      resultStatus === "confirmed" ? "finished" : "pending",
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

function raceResultSignature(race) {
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

function raceKey(venue, race) {
  return `${venue.date}:${venue.venueCode}:${race.raceNumber}`;
}

function summarize(payload) {
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
        throw new Error(
          `settled official result conflict: ${raceKey(venue, race)}`,
        );
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

export async function fetchVenue(venue, { targetDate = expectedDate || jstDate(), fetchImpl = fetchJson, sleepImpl = sleep } = {}) {
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
      races.push(
        createErrorRace(
          raceNumber,
          "encParaR missing",
        ),
      );

      continue;
    }

    try {
      const resultData = await fetchImpl(
        buildJsonUrl(raceParameter, "JSJ012"),
      );

      let entries, detail;
      if (Array.isArray(resultData.tyakujyunItemSubData) && resultData.tyakujyunItemSubData.length) {
        entries = await fetchImpl(buildJsonUrl(raceParameter, "JSJ006"));
        detail = await fetchImpl(buildJsonUrl(raceParameter, "JSJ001"));
      }
      validateOfficialResultIdentity({ raceNumber, date: targetDate, venueCode: clean(venue.naibuKeirinCd), data: resultData, entries, detail });

      races.push(
        createRaceResult(
          raceNumber,
          raceMeta,
          resultData,
        ),
      );
    } catch (error) {
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

  const venues = [];

  for (const venue of venueList) {
    venues.push(await fetchVenue(venue, { targetDate }));
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
    throw new Error(
      `KEIRIN.JP result feed has ${candidate.errorCount} fetch errors; public output was not written.`,
    );
  }

  const existing = readJsonIfPresent(outputPath);

  const {
    payload,
    preservedSettledRaceCount,
  } = mergeWithExisting(existing, candidate);

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
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => {
  console.error("[keirin-jp results update] failed");
  console.error(error);
  process.exitCode = 1;
});
