import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  auditKurariExFullCoverage20260501To20260701,
} from "./audit-kurari-ex-full-coverage-2026-05-01-to-2026-07-01.mjs";
import {
  auditKurariExRegistrationNoMissingDeep20260501To20260701,
} from "./audit-kurari-ex-registration-no-missing-deep-2026-05-01-to-2026-07-01.mjs";

const ROOT = process.cwd();
const INDEX_PATH = "public/data/analytics/kurari-ex/history/index.generated.json";

function abs(file) {
  return path.isAbsolute(file) ? file : path.resolve(ROOT, file);
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function increment(counter, key) {
  counter[key] = (counter[key] ?? 0) + 1;
}

async function filesForVenue(directory, venueKey) {
  if (!existsSync(abs(directory))) return [];
  const entries = await readdir(abs(directory), { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.startsWith(`${venueKey}-`))
    .map((entry) => path.join(directory, entry.name).replaceAll("\\", "/"))
    .sort();
}

function print(label, value) {
  console.log(`[${label}]`);
  console.log(JSON.stringify(value, null, 2));
}

export async function auditKurariExMixedDaysRaceLevel20260501To20260701(
  { printOutput = true } = {},
) {
  const coverage =
    await auditKurariExFullCoverage20260501To20260701({ printOutput: false });
  const missing =
    await auditKurariExRegistrationNoMissingDeep20260501To20260701({
      printOutput: false,
    });
  const mixedDates = coverage.summary.mixedDates;
  const missingByRace = new Map();
  for (const record of missing.missingRegistrationNoRecord) {
    if (!missingByRace.has(record.raceKey)) missingByRace.set(record.raceKey, []);
    missingByRace.get(record.raceKey).push(record);
  }
  const index = JSON.parse(await readFile(abs(INDEX_PATH), "utf8"));
  const indexByDate = new Map(array(index.items).map((item) => [item.date, item]));
  const mixedDayRaceRecord = [];
  for (const date of mixedDates) {
    const entry = indexByDate.get(date);
    const daily = JSON.parse(await readFile(abs(`public${entry.file}`), "utf8"));
    for (const race of array(daily.items)) {
      const starters = array(race.starters);
      const missingRecords = missingByRace.get(race.raceKey) ?? [];
      const missingRegistrationNoCount =
        starters.filter((starter) => !starter.registrationNo).length;
      const declaredStarterCount = Number(race.starterCount ?? starters.length);
      const partial =
        starters.length > 0
        && (
          declaredStarterCount > starters.length
          || starters.some((starter) => starter.carNo == null || !starter.name)
        );
      const raceMode =
        starters.length === 0 ? "NO_STARTERS"
          : partial ? "PARTIAL_STARTERS"
            : "STARTERS_PARSED";
      const rawFiles =
        await filesForVenue(`private-input/kurari-ex/raw/${date}`, race.venueKey);
      const reviewFiles =
        await filesForVenue(`public/data/reviews/${date}`, race.venueKey);
      const starterSourceDir =
        `public/data/analytics/kurari-ex/source/starters/${date}`;
      const entriesSourceDir =
        `public/data/races/entries-history/${date}`;
      const startersSourceStatus =
        existsSync(abs(starterSourceDir)) ? "READY" : "MISSING";
      const entriesSourceStatus =
        existsSync(abs(entriesSourceDir)) ? "READY" : "MISSING";
      const readyExact =
        missingRecords.length > 0
        && missingRecords.every((record) => record.backfillReadiness === "READY_EXACT");
      const mixedReason =
        raceMode === "NO_STARTERS" ? "SOME_RACES_HAVE_STARTERS_SOME_DO_NOT"
          : raceMode === "PARTIAL_STARTERS" ? "PARTIAL_STARTERS_IN_RACE"
            : missingRegistrationNoCount > 0 ? "REGISTRATION_NO_MISSING_ONLY"
              : "SOURCE_SPLIT_BY_RACE";
      let recommendedAction;
      const blockReasons = [];
      if (raceMode === "NO_STARTERS") {
        recommendedAction = "NEEDS_STARTERS_SOURCE_COLLECTION";
        if (startersSourceStatus === "MISSING") blockReasons.push("STARTERS_SOURCE_MISSING");
        if (entriesSourceStatus === "MISSING") blockReasons.push("ENTRIES_SOURCE_MISSING");
      } else if (raceMode === "PARTIAL_STARTERS") {
        recommendedAction = "NEEDS_RACE_LEVEL_REVIEW";
        blockReasons.push("PARTIAL_STARTERS_IN_RACE", "NEEDS_RACE_LEVEL_REVIEW");
      } else if (missingRegistrationNoCount > 0) {
        recommendedAction =
          readyExact ? "READY_FOR_REGISTRATION_NO_BACKFILL" : "NEEDS_RACE_LEVEL_REVIEW";
        if (!readyExact) blockReasons.push("NEEDS_RACE_LEVEL_REVIEW");
      } else {
        recommendedAction = "NO_ACTION_REQUIRED";
      }
      mixedDayRaceRecord.push({
        date,
        venueKey: race.venueKey,
        venueName: race.venueName,
        raceNumber: race.raceNumber,
        raceKey: race.raceKey,
        raceMode,
        starterCount: declaredStarterCount,
        starterTotal: starters.length,
        missingRegistrationNoCount,
        hasAnyRegistrationNo:
          starters.some((starter) => Boolean(starter.registrationNo)),
        hasAllRegistrationNo:
          starters.length > 0 && starters.every((starter) => Boolean(starter.registrationNo)),
        noStartersMarker:
          race.quality?.marker === "NO_STARTERS"
          || array(race.quality?.warnings).includes("NO_STARTERS"),
        qualityStarterParsed: race.quality?.starterParsed ?? null,
        sourceCandidateFiles: [...rawFiles, ...reviewFiles],
        startersSourceStatus,
        entriesSourceStatus,
        mixedReason,
        recommendedAction,
        blockReasons,
      });
    }
  }
  const byMixedReason = {};
  const byRecommendedAction = {};
  for (const record of mixedDayRaceRecord) {
    increment(byMixedReason, record.mixedReason);
    increment(byRecommendedAction, record.recommendedAction);
  }
  const countMode = (mode) =>
    mixedDayRaceRecord.filter((record) => record.raceMode === mode).length;
  const mixedDaysRaceLevelSummary = {
    mixedDayCount: mixedDates.length,
    mixedDates,
    mixedRaceCount: mixedDayRaceRecord.length,
    startersParsedRaceCount: countMode("STARTERS_PARSED"),
    noStartersRaceCount: countMode("NO_STARTERS"),
    partialStartersRaceCount: countMode("PARTIAL_STARTERS"),
    missingRegistrationNoInMixedDaysCount:
      mixedDayRaceRecord.reduce(
        (sum, record) => sum + record.missingRegistrationNoCount,
        0,
      ),
    byMixedReason,
    byRecommendedAction,
    readyForRegistrationNoBackfillRaceCount:
      byRecommendedAction.READY_FOR_REGISTRATION_NO_BACKFILL ?? 0,
    readyForStartersBackfillRaceCount:
      byRecommendedAction.READY_FOR_STARTERS_BACKFILL ?? 0,
    needsSourceCollectionRaceCount:
      byRecommendedAction.NEEDS_STARTERS_SOURCE_COLLECTION ?? 0,
    needsRaceLevelReviewRaceCount:
      byRecommendedAction.NEEDS_RACE_LEVEL_REVIEW ?? 0,
    finalStatus:
      mixedDates.length === 14 && mixedDayRaceRecord.length > 0
        ? "MIXED_DAYS_RACE_LEVEL_AUDIT_COMPLETED_WITH_WARNINGS"
        : "MIXED_DAYS_RACE_LEVEL_AUDIT_FAIL",
  };
  const jsonSummary = {
    finalStatus: mixedDaysRaceLevelSummary.finalStatus,
    mixedDayCount: mixedDates.length,
    mixedRaceCount: mixedDayRaceRecord.length,
    writePerformed: false,
  };
  if (printOutput) {
    print("mixedDaysRaceLevelSummary", mixedDaysRaceLevelSummary);
    print("mixedDayRaceRecord", mixedDayRaceRecord);
    print("jsonSummary", jsonSummary);
  }
  if (mixedDaysRaceLevelSummary.finalStatus.endsWith("_FAIL") && printOutput) {
    process.exitCode = 1;
  }
  return { mixedDaysRaceLevelSummary, mixedDayRaceRecord, jsonSummary };
}

const isMain =
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  auditKurariExMixedDaysRaceLevel20260501To20260701().catch((error) => {
    console.error("[kurari-ex mixed days race-level audit] failed");
    console.error(error);
    process.exitCode = 1;
  });
}
