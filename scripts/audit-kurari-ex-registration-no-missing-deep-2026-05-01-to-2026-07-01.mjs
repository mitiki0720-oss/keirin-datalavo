import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const INDEX_PATH = "public/data/analytics/kurari-ex/history/index.generated.json";
const NORMALIZED_FILES = [
  "private-input/kurari-ex/normalized/races/2026-05.jsonl",
  "private-input/kurari-ex/normalized/races/2026-06.jsonl",
  "private-input/kurari-ex/normalized/races/2026-07.jsonl",
];

function abs(file) {
  return path.isAbsolute(file) ? file : path.resolve(ROOT, file);
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function clean(value) {
  return String(value ?? "").normalize("NFKC").trim();
}

function normalizeName(value) {
  return clean(value).replace(/[\s　・･.]/gu, "").toLowerCase();
}

function increment(map, key, by = 1) {
  map[key] = (map[key] ?? 0) + by;
}

async function readJsonLines(file) {
  if (!existsSync(abs(file))) return [];
  const text = await readFile(abs(file), "utf8");
  return text.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
}

function print(label, value) {
  console.log(`[${label}]`);
  console.log(JSON.stringify(value, null, 2));
}

export async function auditKurariExRegistrationNoMissingDeep20260501To20260701(
  { printOutput = true } = {},
) {
  const index = JSON.parse(await readFile(abs(INDEX_PATH), "utf8"));
  const historyItems =
    array(index.items).filter((item) => item.date >= "2026-05-01" && item.date <= "2026-07-01");
  const normalizedRaces = (
    await Promise.all(NORMALIZED_FILES.map(readJsonLines))
  ).flat();
  const normalizedByRaceKey =
    new Map(normalizedRaces.map((race) => [race.raceKey, race]));
  const knownRegistrationsByName = new Map();
  const dailyPayloads = [];
  for (const item of historyItems) {
    const file = `public${item.file}`;
    const daily = JSON.parse(await readFile(abs(file), "utf8"));
    dailyPayloads.push({ file, daily });
    for (const race of array(daily.items)) {
      for (const starter of array(race.starters)) {
        const name = normalizeName(starter.name);
        const registrationNo = clean(starter.registrationNo);
        if (!name || !registrationNo) continue;
        if (!knownRegistrationsByName.has(name)) {
          knownRegistrationsByName.set(name, new Set());
        }
        knownRegistrationsByName.get(name).add(registrationNo);
      }
    }
  }

  const missingRegistrationNoRecord = [];
  for (const { file, daily } of dailyPayloads) {
    const dateStarters = array(daily.items).flatMap((race) => array(race.starters));
    const dateMode = dateStarters.length === 0
      ? "NO_STARTERS"
      : array(daily.items).every((race) => array(race.starters).length > 0)
        ? "STARTERS_PARSED"
        : "MIXED";
    for (const race of array(daily.items)) {
      const sourceRace = normalizedByRaceKey.get(race.raceKey);
      for (const starter of array(race.starters)) {
        if (clean(starter.registrationNo)) continue;
        const playerNameRaw = clean(starter.name);
        const playerNameNormalized = normalizeName(playerNameRaw);
        const sourceStarter =
          array(sourceRace?.starters).find(
            (candidate) =>
              Number(candidate.carNo) === Number(starter.carNo)
              && normalizeName(candidate.name) === playerNameNormalized,
          ) ?? null;
        const sameNameCandidateRegistrationNos = [
          ...(knownRegistrationsByName.get(playerNameNormalized) ?? new Set()),
        ].sort();
        const sameNameMultipleRegistrationCandidate =
          sameNameCandidateRegistrationNos.length > 1;
        const exactSourceMatchPossible =
          Boolean(sourceStarter && clean(sourceStarter.registrationNo));
        const sourceCandidateFiles = [
          ...(sourceRace?.sourceRefs
            ? Object.values(sourceRace.sourceRefs).filter(Boolean)
            : []),
          ...(sourceRace
            ? NORMALIZED_FILES.filter((candidate) => candidate.includes(race.date.slice(0, 7)))
            : []),
        ].filter((value, index, values) => values.indexOf(value) === index);
        let missingReason;
        let backfillReadiness;
        const blockReasons = [];
        if (exactSourceMatchPossible) {
          missingReason = "SOURCE_HAS_REGISTRATION_NO_NOT_BACKFILLED";
          backfillReadiness = "READY_EXACT";
        } else if (sameNameMultipleRegistrationCandidate) {
          missingReason = "SAME_NAME_MULTIPLE_REGISTRATION_AMBIGUOUS";
          backfillReadiness = "AMBIGUOUS_REVIEW_REQUIRED";
          blockReasons.push("SAME_NAME_MULTIPLE_REGISTRATION_AMBIGUOUS");
        } else if (sourceStarter) {
          missingReason = "SOURCE_LACKS_REGISTRATION_NO";
          backfillReadiness = "NEEDS_SOURCE_COLLECTION";
          blockReasons.push("SOURCE_HAS_NO_REGISTRATION_NO");
        } else if (sourceRace) {
          missingReason = "PARSER_MISSED_REGISTRATION_NO";
          backfillReadiness = "NEEDS_PARSER_FIX";
          blockReasons.push("PARSER_MISSED_REGISTRATION_NO");
        } else {
          missingReason = "SOURCE_NOT_FOUND";
          backfillReadiness = "NOT_BACKFILLABLE_SAFELY";
          blockReasons.push("SOURCE_CANDIDATE_NOT_FOUND");
        }
        if (!exactSourceMatchPossible) {
          blockReasons.push("EXACT_SOURCE_MATCH_NOT_POSSIBLE");
        }
        missingRegistrationNoRecord.push({
          date: race.date,
          venueKey: race.venueKey,
          venueName: race.venueName,
          raceNumber: race.raceNumber,
          raceKey: race.raceKey,
          carNo: starter.carNo,
          playerNameRaw,
          playerNameNormalized,
          className: clean(sourceStarter?.class),
          prefecture: clean(sourceStarter?.prefecture),
          age: sourceStarter?.age ?? null,
          term: sourceStarter?.period ?? sourceStarter?.term ?? null,
          historyMode: dateMode,
          historyDailyPath: file,
          sourceCandidateFiles,
          sourceCandidateType:
            sourceStarter || sourceRace ? "privateRaw"
              : sameNameCandidateRegistrationNos.length ? "analyticsSource"
                : "unknown",
          sourceHasSameDate: sourceRace?.date === race.date,
          sourceHasSameVenue:
            sourceRace?.venueKey === race.venueKey,
          sourceHasSameRaceNumber:
            Number(sourceRace?.raceNumber) === Number(race.raceNumber),
          sourceHasSameCarNo:
            Number(sourceStarter?.carNo) === Number(starter.carNo),
          sourceHasSamePlayerName:
            normalizeName(sourceStarter?.name) === playerNameNormalized,
          sourceHasRegistrationNo:
            Boolean(clean(sourceStarter?.registrationNo)),
          exactSourceMatchPossible,
          sameNameMultipleRegistrationCandidate,
          sameNameCandidateRegistrationNos,
          missingReason,
          backfillReadiness,
          blockReasons,
        });
      }
    }
  }

  const byDate = {};
  const byVenue = {};
  const byHistoryMode = {};
  const byMissingReason = {};
  const byBackfillReadiness = {};
  const blockReasonCounts = {};
  for (const record of missingRegistrationNoRecord) {
    increment(byDate, record.date);
    increment(byVenue, record.venueKey || record.venueName);
    increment(byHistoryMode, record.historyMode);
    increment(byMissingReason, record.missingReason);
    increment(byBackfillReadiness, record.backfillReadiness);
    for (const reason of record.blockReasons) increment(blockReasonCounts, reason);
  }
  const top = (counter, limit = 15) =>
    Object.entries(counter)
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, limit)
      .map(([key, count]) => ({ key, count }));
  const totalMissingRegistrationNo = missingRegistrationNoRecord.length;
  const readyExactCount = byBackfillReadiness.READY_EXACT ?? 0;
  const needsSourceCollectionCount =
    byBackfillReadiness.NEEDS_SOURCE_COLLECTION ?? 0;
  const needsParserFixCount = byBackfillReadiness.NEEDS_PARSER_FIX ?? 0;
  const ambiguousReviewRequiredCount =
    byBackfillReadiness.AMBIGUOUS_REVIEW_REQUIRED ?? 0;
  const notBackfillableSafelyCount =
    byBackfillReadiness.NOT_BACKFILLABLE_SAFELY ?? 0;
  const registrationNoMissingDeepSummary = {
    totalMissingRegistrationNo,
    byDate,
    byVenue,
    byHistoryMode,
    byMissingReason,
    byBackfillReadiness,
    readyExactCount,
    needsSourceCollectionCount,
    needsParserFixCount,
    ambiguousReviewRequiredCount,
    notBackfillableSafelyCount,
    topDatesByMissingCount: top(byDate),
    topVenuesByMissingCount: top(byVenue),
    blockReasonCounts,
    finalStatus:
      totalMissingRegistrationNo === 2480
        ? readyExactCount > 0
          ? "REGISTRATION_NO_MISSING_DEEP_AUDIT_COMPLETED"
          : "REGISTRATION_NO_MISSING_DEEP_AUDIT_COMPLETED_WITH_WARNINGS"
        : "REGISTRATION_NO_MISSING_DEEP_AUDIT_FAIL",
  };
  const jsonSummary = {
    finalStatus: registrationNoMissingDeepSummary.finalStatus,
    totalMissingRegistrationNo,
    readyExactCount,
    safelyBlockedCount:
      totalMissingRegistrationNo - readyExactCount,
    writePerformed: false,
  };
  if (printOutput) {
    print("registrationNoMissingDeepSummary", registrationNoMissingDeepSummary);
    print("missingRegistrationNoRecord", missingRegistrationNoRecord);
    print("jsonSummary", jsonSummary);
  }
  if (
    registrationNoMissingDeepSummary.finalStatus.endsWith("_FAIL")
    && printOutput
  ) process.exitCode = 1;
  return {
    registrationNoMissingDeepSummary,
    missingRegistrationNoRecord,
    jsonSummary,
  };
}

const isMain =
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  auditKurariExRegistrationNoMissingDeep20260501To20260701().catch((error) => {
    console.error("[kurari-ex registrationNo missing deep audit] failed");
    console.error(error);
    process.exitCode = 1;
  });
}
