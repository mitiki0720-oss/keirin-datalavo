import path from "node:path";
import {
  readJsonIfPresent,
  writeJsonIfChanged,
} from "./lib/write-json-if-changed.mjs";

const DEFAULT_JSJ048_URL =
  "https://keirin.jp/pc/json?kaisaibikbn=0&kanyusyaflg=false&shccp=0&dispid=PJ0326&type=JSJ048";

const PUBLIC_OUTPUT_PATH = path.resolve(
  "public/data/races/keirin-jp-entries.generated.json",
);

const LOCAL_OUTPUT_PATH = path.resolve(
  "scripts/debug/keirin-jp-entries.local.json",
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
      "user-agent": "keirin-datalavo-keirin-jp-entries/0.1",
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

function normalizeEntry(row) {
  return {
    carNo: clean(row.syaban),
    registrationNo: clean(row.sensyuRegistNo),
    name: clean(row.sensyuName),
    prefecture: clean(row.huKen),
    previousClass: clean(row.prevKyuhan),
    raceClass: clean(row.kyuhan),
    style: clean(row.kyakusitu),
    graduationTerm: clean(row.sotugyouki),
    age: integerValue(row.age),
    predictionMark: clean(row.yosoin),
    score: numberValue(row.heikinTokuten),
    stats: {
      escapeCount: integerValue(row.nigeCnt),
      makuriCount: integerValue(row.makuriCnt),
      sashiCount: integerValue(row.sasiCnt),
      markCount: integerValue(row.markCnt),
      backCount: integerValue(row.backCnt),
      homeCount: integerValue(row.homeTori),
      startCount: integerValue(row.stTori),
      winRate: numberValue(row.syouritu),
      quinellaRate: numberValue(row.rentairitu2),
      trioRate: numberValue(row.rentairitu3),
    },
    source: "KEIRIN.JP:JSJ006",
  };
}

function officialLineupFromJsj005(data) {
  const rows = data?.narabiyoso?.shaban;

  if (!Array.isArray(rows)) {
    return {
      lineup: "",
      positions: [],
      source: "",
    };
  }

  const positions = rows
    .map((row) => ({
      position: integerValue(row.ichi),
      carNo: clean(row.shaban),
      className: clean(row.classname),
    }))
    .filter((row) => row.carNo)
    .sort((left, right) => {
      const leftPosition = Number.isFinite(left.position)
        ? left.position
        : Number.MAX_SAFE_INTEGER;
      const rightPosition = Number.isFinite(right.position)
        ? right.position
        : Number.MAX_SAFE_INTEGER;

      return leftPosition - rightPosition || left.carNo.localeCompare(right.carNo);
    });

  return {
    lineup: positions.map((row) => row.carNo).join(" "),
    positions,
    source: positions.length ? "KEIRIN.JP:JSJ005:narabiyoso" : "",
  };
}

function createRaceEntry(raceNumber, raceMeta, entryData, lineupData) {
  const rows = Array.isArray(entryData.sensyuTypeInfo)
    ? entryData.sensyuTypeInfo
    : [];

  const entries = rows.map(normalizeEntry);
  const officialLineup = officialLineupFromJsj005(lineupData);

  const warnings = [
    ...(entries.length ? [] : ["entry rows missing"]),
    ...(entries.some((entry) => !entry.registrationNo)
      ? ["registration number missing"]
      : []),
    ...(entries.some((entry) => !entry.name)
      ? ["rider name missing"]
      : []),
    ...(officialLineup.lineup ? [] : ["official lineup missing"]),
  ];

  return {
    raceNumber,
    entryStatus: entries.length ? "available" : "missing",
    operationStatus: Boolean(raceMeta?.flgRaceEnd) ? "finished" : "scheduled",
    raceEnded: Boolean(raceMeta?.flgRaceEnd),
    raceButtonActive: Boolean(raceMeta?.flgActvRaceBtn),
    resultCode: entryData.resultCd ?? null,
    lastUpdateTime: clean(entryData.lastUpdateTime),
    raceMeta: {
      raceNo: clean(raceMeta.raceNo),
      raceNum: clean(raceMeta.raceNum),
      raceName: clean(raceMeta.raceName ?? raceMeta.shumokuName),
      deadlineTime: clean(raceMeta.dentoShimekiri ?? raceMeta.denTime),
      startTime: clean(raceMeta.hassouYotei ?? raceMeta.stTime),
    },
    official: {
      bKeirinjyoCd: clean(entryData.bKeirinjyoCd),
      yudoSensyuName: clean(entryData.yudoSensyuName),
      yosoinMei: clean(entryData.yosoinMei),
      raceResult1CarNo: clean(entryData.raceResult1Syaban),
      raceResult2CarNo: clean(entryData.raceResult2Syaban),
      backCount1CarNo: clean(entryData.backCnt1Syaban),
      backCount2CarNo: clean(entryData.backCnt2Syaban),
    },
    lineup: officialLineup.lineup,
    officialLineup,
    entries,
    quality: {
      entryCount: entries.length,
      hasEntries: entries.length > 0,
      hasRegistrationNumbers: entries.length > 0 &&
        entries.every((entry) => entry.registrationNo),
      hasNames: entries.length > 0 &&
        entries.every((entry) => entry.name),
      hasLineup: Boolean(officialLineup.lineup),
      warnings,
    },
  };
}

function createErrorRace(raceNumber, message) {
  return {
    raceNumber,
    entryStatus: "error",
    operationStatus: "scheduled",
    error: clean(message),
    lineup: "",
    officialLineup: {
      lineup: "",
      positions: [],
      source: "",
    },
    entries: [],
    quality: {
      entryCount: 0,
      hasEntries: false,
      hasRegistrationNumbers: false,
      hasNames: false,
      hasLineup: false,
      warnings: ["official entry fetch failed"],
    },
  };
}

function raceKey(venue, race) {
  return `${venue.date}:${venue.venueCode}:${race.raceNumber}`;
}

function summarize(payload) {
  const races = payload.venues.flatMap((venue) => venue.races);
  const entries = races.flatMap((race) => race.entries ?? []);

  return {
    ...payload,
    venueCount: payload.venues.length,
    raceCount: races.length,
    entryRaceCount: races.filter(
      (race) => race.entryStatus === "available",
    ).length,
    missingRaceCount: races.filter(
      (race) => race.entryStatus === "missing",
    ).length,
    errorCount: races.filter(
      (race) => race.entryStatus === "error",
    ).length,
    totalEntryCount: entries.length,
    lineupRaceCount: races.filter(
      (race) => race.officialLineup?.lineup,
    ).length,
    venues: payload.venues.map((venue) => ({
      ...venue,
      raceCount: venue.races.length,
      entryRaceCount: venue.races.filter(
        (race) => race.entryStatus === "available",
      ).length,
      missingRaceCount: venue.races.filter(
        (race) => race.entryStatus === "missing",
      ).length,
      errorCount: venue.races.filter(
        (race) => race.entryStatus === "error",
      ).length,
      totalEntryCount: venue.races.reduce(
        (sum, race) => sum + (race.entries?.length ?? 0),
        0,
      ),
      lineupRaceCount: venue.races.filter(
        (race) => race.officialLineup?.lineup,
      ).length,
    })),
  };
}

function mergeWithExisting(existing, candidate) {
  if (!existing || existing.date !== candidate.date) {
    return candidate;
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

  const existingByKey = new Map();

  for (const venue of existing.venues ?? []) {
    for (const race of venue.races ?? []) {
      existingByKey.set(raceKey(venue, race), race);
    }
  }

  let preservedCompleteRaceCount = 0;

  const venues = candidate.venues.map((venue) => ({
    ...venue,
    races: venue.races.map((race) => {
      const previous = existingByKey.get(raceKey(venue, race));

      if (!previous || previous.entryStatus !== "available") {
        return race;
      }

      if (race.entryStatus === "available") {
        return race;
      }

      preservedCompleteRaceCount += 1;
      return previous;
    }),
  }));

  const payload = summarize({
    ...candidate,
    venues,
  });

  return {
    ...payload,
    preservedCompleteRaceCount,
  };
}

async function fetchRace(raceNumber, raceMeta) {
  const raceParameter = clean(raceMeta.encParaR);

  if (!raceParameter) {
    return createErrorRace(raceNumber, "encParaR missing");
  }

  const entryData = await fetchJson(
    buildJsonUrl(raceParameter, "JSJ006"),
  );

  let lineupData = null;

  try {
    lineupData = await fetchJson(
      buildJsonUrl(raceParameter, "JSJ005"),
    );
  } catch {
    lineupData = null;
  }

  return createRaceEntry(
    raceNumber,
    raceMeta,
    entryData,
    lineupData,
  );
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

    try {
      races.push(await fetchRace(raceNumber, raceMeta));
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
    selectedRaceNumber: clean(venueData.selRaceNo),
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
      entryType: "JSJ006",
      lineupType: "JSJ005",
      endpoint: "/pc/json",
      kaisaiDateKbn: clean(listData.kaisaiDateKbn),
    },
    date: dates[0],
    venues,
  });

  if (candidate.venueCount <= 0 || candidate.raceCount <= 0) {
    throw new Error(
      "KEIRIN.JP entry feed is empty; output was not written.",
    );
  }

  if (shouldWritePublic && candidate.errorCount > 0) {
    throw new Error(
      `KEIRIN.JP entry feed has ${candidate.errorCount} fetch errors; public output was not written.`,
    );
  }

  const existing = readJsonIfPresent(outputPath);
  const payload = mergeWithExisting(existing, candidate);

  const writeResult = writeJsonIfChanged(
    outputPath,
    payload,
  );

  console.log("[keirin-jp entries update]");
  console.log(
    `mode: ${shouldWritePublic ? "public" : "local"}`,
  );
  console.log(`output: ${outputPath}`);
  console.log(`date: ${writeResult.value.date}`);
  console.log(`venues: ${writeResult.value.venueCount}`);
  console.log(`races: ${writeResult.value.raceCount}`);
  console.log(`entry races: ${writeResult.value.entryRaceCount}`);
  console.log(`lineup races: ${writeResult.value.lineupRaceCount}`);
  console.log(`entries: ${writeResult.value.totalEntryCount}`);
  console.log(`missing: ${writeResult.value.missingRaceCount}`);
  console.log(`errors: ${writeResult.value.errorCount}`);
  console.log(
    `preserved complete: ${writeResult.value.preservedCompleteRaceCount ?? 0}`,
  );
  console.log(`changed: ${writeResult.changed}`);
}

main().catch((error) => {
  console.error("[keirin-jp entries update] failed");
  console.error(error);
  process.exitCode = 1;
});