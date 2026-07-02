import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const INDEX_PUBLIC_PATH = "/data/analytics/kurari-ex/history/index.generated.json";
const DATES = [
  "2026-06-25",
  "2026-06-27",
  "2026-06-28",
  "2026-06-29",
  "2026-06-30",
  "2026-07-01",
];
const NO_STARTERS = new Set(
  DATES.filter((date) => date !== "2026-06-29"),
);
const SRC_FILES = [
  "src/lib/kurariExData.ts",
  "src/types/kurariEx.ts",
  "src/data/kurariExAnalysisInventory.ts",
  "src/pages/ExDataPage.tsx",
  "src/pages/PageImplementations.tsx",
];

function abs(file) {
  return path.isAbsolute(file) ? file : path.resolve(ROOT, file);
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function publicToFile(publicPath) {
  return publicPath.startsWith("/data/") ? `public${publicPath}` : publicPath;
}

function hasKeys(value, keys) {
  return value && keys.every((key) => Object.hasOwn(value, key));
}

function print(label, value) {
  console.log(`[${label}]`);
  console.log(JSON.stringify(value, null, 2));
}

export async function auditKurariExHistoryUiApiSmokeRange20260625To20260701(
  { printOutput = true } = {},
) {
  const blocks = {};
  const block = (reason, count = 1) => {
    blocks[reason] = (blocks[reason] ?? 0) + count;
  };
  const indexFile = publicToFile(INDEX_PUBLIC_PATH);
  let index = null;
  let indexReadable = false;
  let indexParseOk = false;
  try {
    const text = await readFile(abs(indexFile), "utf8");
    indexReadable = true;
    index = JSON.parse(text);
    indexParseOk = true;
  } catch {
    block("API_FETCH_SIMULATION_FAILED");
  }
  const indexItems = array(index?.items);
  const perDateFetch = [];
  for (const date of DATES) {
    const entry = indexItems.find((item) => item.date === date);
    const file = entry ? publicToFile(entry.file) : null;
    const row = {
      date,
      publicPath: entry?.file ?? null,
      urlResolvedToFile: Boolean(file && existsSync(abs(file))),
      fileReadable: false,
      jsonParseOk: false,
    };
    try {
      const daily = JSON.parse(await readFile(abs(file), "utf8"));
      const races = array(daily.items);
      const starters = races.flatMap((race) => array(race.starters));
      const mode = NO_STARTERS.has(date) ? "NO_STARTERS" : "STARTERS_PARSED";
      const displayResultAvailable =
        races.every((race) => Boolean(race.result?.trifecta?.combination));
      const displayPredictionAvailable =
        races.every((race) => Boolean(race.prediction));
      const displayReviewAvailable =
        races.every((race) => race.reviewEnrichment?.status === "matched");
      const displayStartersUnavailableButSafe =
        mode === "NO_STARTERS"
        && starters.length === 0
        && races.every((race) => (
          race.quality?.starterParsed === false
          && race.quality?.marker === "NO_STARTERS"
        ));
      const displayStartersAvailableForParsedDate =
        mode === "STARTERS_PARSED"
        && starters.length === 464
        && races.every((race) => (
          array(race.starters).length > 0
          && race.quality?.starterParsed === true
        ));
      const ok = [
        daily.date === date,
        daily.raceCount === races.length,
        displayResultAvailable,
        displayPredictionAvailable,
        mode === "NO_STARTERS"
          ? displayStartersUnavailableButSafe
          : displayStartersAvailableForParsedDate,
      ].every(Boolean);
      Object.assign(row, {
        fileReadable: true,
        jsonParseOk: true,
        dateMatched: daily.date === date,
        raceCount: daily.raceCount,
        noStartersOrStartersParsedMode: mode,
        displayResultAvailable,
        displayPredictionAvailable,
        displayReviewAvailable,
        displayStartersUnavailableButSafe,
        displayStartersAvailableForParsedDate,
        fetchStatus: ok
          ? mode === "NO_STARTERS" ? "OK_NO_STARTERS" : "OK_STARTERS_PARSED"
          : "FAIL",
      });
      if (!ok) block("API_FETCH_SIMULATION_FAILED");
    } catch {
      row.fetchStatus = "FAIL";
      block("API_FETCH_SIMULATION_FAILED");
    }
    perDateFetch.push(row);
  }
  const apiFetchSimulationRangeCheck = {
    simulatedIndexUrl: INDEX_PUBLIC_PATH,
    indexUrlResolvedToFile: existsSync(abs(indexFile)),
    indexFileReadable: indexReadable,
    indexJsonParseOk: indexParseOk,
    perDateFetch,
    status:
      indexParseOk && perDateFetch.every((item) => item.fetchStatus !== "FAIL")
        ? "OK"
        : "FAIL",
  };

  const inspectedSrcFiles = [];
  const missingSrcFiles = [];
  const sourceTexts = [];
  for (const file of SRC_FILES) {
    if (!existsSync(abs(file))) {
      missingSrcFiles.push(file);
      continue;
    }
    inspectedSrcFiles.push(file);
    sourceTexts.push(await readFile(abs(file), "utf8"));
  }
  const allDaily = [];
  for (const row of perDateFetch) {
    if (row.fetchStatus === "FAIL") continue;
    allDaily.push(JSON.parse(await readFile(abs(publicToFile(row.publicPath)), "utf8")));
  }
  const allRaces = allDaily.flatMap((daily) => array(daily.items));
  const noStarterRaces =
    allDaily
      .filter((daily) => NO_STARTERS.has(daily.date))
      .flatMap((daily) => array(daily.items));
  const parsedStarterRaces =
    allDaily
      .filter((daily) => daily.date === "2026-06-29")
      .flatMap((daily) => array(daily.items));
  const warnings = [];
  const joinedSrc = sourceTexts.join("\n");
  const knownHistoryIndexConsumerFound =
    /kurari-ex\/history\/index|history\/index\.generated/u.test(joinedSrc);
  const knownHistoryDailyConsumerFound =
    /kurari-ex\/history\/daily|history\/daily/u.test(joinedSrc);
  if (!knownHistoryIndexConsumerFound) {
    warnings.push("direct history index runtime consumer was not found in inspected src");
  }
  if (!knownHistoryDailyConsumerFound) {
    warnings.push("direct history daily runtime consumer was not found; local fetch simulation was used");
  }
  if (perDateFetch.some((item) => !item.displayReviewAvailable)) {
    warnings.push("2026-06-29 has no reviewEnrichment field; result/prediction/starters display remains available");
  }
  const consumerShapeCompatibilityRangeCheck = {
    inspectedSrcFiles,
    missingSrcFiles,
    knownHistoryIndexConsumerFound,
    knownHistoryDailyConsumerFound,
    knownTypesFound: /KurariEx|KURARI/u.test(joinedSrc),
    requiredTopLevelKeysPresentForAllDaily:
      allDaily.every((daily) => hasKeys(daily, ["schemaVersion", "date", "raceCount", "items"])),
    requiredRaceItemKeysPresentForAllDaily:
      allRaces.every((race) => hasKeys(
        race,
        ["raceKey", "date", "venueKey", "venueName", "raceNumber", "starters", "result", "prediction", "quality"],
      )),
    requiredResultKeysPresentForAllDaily:
      allRaces.every((race) => hasKeys(race.result, ["status", "trifecta"])),
    requiredPredictionKeysPresentForAllDaily:
      allRaces.every((race) => Boolean(race.prediction)),
    requiredQualityKeysPresentForAllDaily:
      allRaces.every((race) => Object.hasOwn(race.quality ?? {}, "starterParsed")),
    startersArrayPresentForAllDaily:
      allRaces.every((race) => Array.isArray(race.starters)),
    noStartersArrayEmptyAccepted:
      noStarterRaces.every((race) => (
        race.starters.length === 0 && race.quality.starterParsed === false
      )),
    startersParsedArrayNonEmptyAccepted:
      parsedStarterRaces.every((race) => (
        race.starters.length > 0 && race.quality.starterParsed === true
      )),
    displayDateAvailable: allRaces.every((race) => Boolean(race.date)),
    displayVenueAvailable: allRaces.every((race) => Boolean(race.venueName)),
    displayRaceNumberAvailable: allRaces.every((race) => Number(race.raceNumber) > 0),
    displayResultAvailable:
      perDateFetch.every((item) => item.displayResultAvailable),
    displayPredictionAvailable:
      perDateFetch.every((item) => item.displayPredictionAvailable),
    displayReviewAvailable:
      perDateFetch.every((item) => item.displayReviewAvailable),
    displayStartersUnavailableButSafe:
      perDateFetch
        .filter((item) => item.noStartersOrStartersParsedMode === "NO_STARTERS")
        .every((item) => item.displayStartersUnavailableButSafe),
    displayStartersAvailableForParsedDate:
      perDateFetch
        .filter((item) => item.noStartersOrStartersParsedMode === "STARTERS_PARSED")
        .every((item) => item.displayStartersAvailableForParsedDate),
    warnings,
  };
  const requiredShapeOk = [
    missingSrcFiles.length === 0,
    consumerShapeCompatibilityRangeCheck.requiredTopLevelKeysPresentForAllDaily,
    consumerShapeCompatibilityRangeCheck.requiredRaceItemKeysPresentForAllDaily,
    consumerShapeCompatibilityRangeCheck.requiredResultKeysPresentForAllDaily,
    consumerShapeCompatibilityRangeCheck.requiredPredictionKeysPresentForAllDaily,
    consumerShapeCompatibilityRangeCheck.requiredQualityKeysPresentForAllDaily,
    consumerShapeCompatibilityRangeCheck.startersArrayPresentForAllDaily,
    consumerShapeCompatibilityRangeCheck.noStartersArrayEmptyAccepted,
    consumerShapeCompatibilityRangeCheck.startersParsedArrayNonEmptyAccepted,
  ].every(Boolean);
  consumerShapeCompatibilityRangeCheck.mixedModeUiSafe = requiredShapeOk;
  consumerShapeCompatibilityRangeCheck.status =
    requiredShapeOk ? warnings.length ? "OK_WITH_WARNINGS" : "OK" : "FAIL";
  if (!requiredShapeOk) block("CONSUMER_SHAPE_REQUIRED_FIELD_MISSING");
  const pass = Object.keys(blocks).length === 0;
  const finalStatus = pass
    ? warnings.length
      ? "UI_API_SMOKE_RANGE_PASS_WITH_WARNINGS"
      : "UI_API_SMOKE_RANGE_PASS_2026_06_25_TO_2026_07_01"
    : "UI_API_SMOKE_RANGE_FAIL";
  const summary = {
    finalStatus,
    checkedDates: DATES,
    indexFetchSimulationStatus:
      indexParseOk ? "OK" : "FAIL",
    dailyFetchSimulationStatus:
      perDateFetch.every((item) => item.fetchStatus !== "FAIL") ? "OK" : "FAIL",
    consumerShapeCompatibilityStatus:
      consumerShapeCompatibilityRangeCheck.status,
    mixedModeUiSafe: requiredShapeOk,
    warnings,
    blockReasonCounts: blocks,
  };
  const jsonSummary = {
    finalStatus,
    fetchStatus: apiFetchSimulationRangeCheck.status,
    consumerStatus: consumerShapeCompatibilityRangeCheck.status,
    writePerformed: false,
  };
  if (printOutput) {
    print("summary", summary);
    print("perDateFetch", perDateFetch);
    print("jsonSummary", jsonSummary);
  }
  if (!pass && printOutput) process.exitCode = 1;
  return {
    summary,
    apiFetchSimulationRangeCheck,
    perDateFetch,
    consumerShapeCompatibilityRangeCheck,
    jsonSummary,
  };
}

const isMain =
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  auditKurariExHistoryUiApiSmokeRange20260625To20260701().catch((error) => {
    console.error("[kurari-ex UI/API range smoke] failed");
    console.error(error);
    process.exitCode = 1;
  });
}
