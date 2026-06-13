import path from "node:path";
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

if (expectedDate && !/^\d{4}-\d{2}-\d{2}$/u.test(expectedDate)) {
  throw new Error(`invalid --expect-date: ${expectedDate}`);
}

async function fetchJson(url) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      accept: "application/json,text/plain,*/*",
      "user-agent": "keirin-datalavo-keirin-jp-results/0.1",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(
      `KEIRIN.JP request failed: ${response.status} ${response.statusText}`,
    );
  }

  return response.json();
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

function createRaceResult(raceNumber, raceMeta, data) {
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
          status: /^[0-9]+$/u.test(rank) ? "" : rank,
        };
      })
    : [];

  const payouts = createPayouts(data);
  const exacta = firstUsablePayout(payouts.exacta);
  const trifecta = firstUsablePayout(payouts.trifecta);

  const hasFinishOrder = finishOrder.length > 0;
  const hasTrifecta = Boolean(trifecta);

  const resultStatus =
    hasFinishOrder && hasTrifecta
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

function mergeWithExisting(existing, candidate) {
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

      if (
        raceResultSignature(previous) !==
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

async function fetchVenue(venue) {
  const venueEntryParameter = clean(venue.touhyouLivePara);

  if (!venueEntryParameter) {
    throw new Error(
      `touhyouLivePara missing: ${clean(venue.keirinjoName)}`,
    );
  }

  const indexData = await fetchJson(
    buildJsonUrl(venueEntryParameter, "JSJ001"),
  );

  const venueData = indexData?.C0201data ?? {};
  const raceList = Array.isArray(venueData.C0201race)
    ? venueData.C0201race
    : [];

  const races = [];

  for (const [index, raceMeta] of raceList.entries()) {
    const raceNumber =
      integerValue(raceMeta.raceNo) ??
      integerValue(raceMeta.raceNum) ??
      index + 1;

    const raceParameter = clean(raceMeta.encParaR);

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
      const resultData = await fetchJson(
        buildJsonUrl(raceParameter, "JSJ012"),
      );

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

    await sleep(delayMs);
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

  const listData = await fetchJson(listUrl);

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
    venues.push(await fetchVenue(venue));
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

  if (expectedDate && dates[0] !== expectedDate) {
    throw new Error(
      `KEIRIN.JP date mismatch: expected ${expectedDate}, actual ${dates[0]}; output was not written.`,
    );
  }
  const candidate = summarize({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: {
      provider: "KEIRIN.JP",
      listType: "JSJ048",
      endpoint: "/pc/json",
      kaisaiDateKbn: clean(listData.kaisaiDateKbn),
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

main().catch((error) => {
  console.error("[keirin-jp results update] failed");
  console.error(error);
  process.exitCode = 1;
});
