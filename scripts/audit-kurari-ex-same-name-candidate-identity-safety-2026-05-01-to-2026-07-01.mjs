import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  auditKurariExPlayerIdentityCollisions20260501To20260701,
} from "./audit-kurari-ex-player-identity-collisions-2026-05-01-to-2026-07-01.mjs";
import {
  auditKurariExRegistrationNoMissingDeep20260501To20260701,
} from "./audit-kurari-ex-registration-no-missing-deep-2026-05-01-to-2026-07-01.mjs";

const ROOT = process.cwd();
const INDEX_PATH = "public/data/analytics/kurari-ex/history/index.generated.json";
const NORMALIZED_FILES = [
  "private-input/kurari-ex/normalized/races/2026-05.jsonl",
  "private-input/kurari-ex/normalized/races/2026-06.jsonl",
  "private-input/kurari-ex/normalized/races/2026-07.jsonl",
];
const EXPECTED_REGISTRATION_SETS = new Set([
  "014962,015023",
  "013264,014108",
  "013615,014268",
]);

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

function unique(values) {
  return [...new Set(values.filter((value) => value !== null && value !== ""))].sort();
}

async function readJsonLines(file) {
  if (!existsSync(abs(file))) return [];
  return (await readFile(abs(file), "utf8"))
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function print(label, value) {
  console.log(`[${label}]`);
  console.log(JSON.stringify(value, null, 2));
}

export async function auditKurariExSameNameCandidateIdentitySafety20260501To20260701(
  { printOutput = true } = {},
) {
  const identity =
    await auditKurariExPlayerIdentityCollisions20260501To20260701({
      printOutput: false,
    });
  const missing =
    await auditKurariExRegistrationNoMissingDeep20260501To20260701({
      printOutput: false,
    });
  const candidates =
    identity.normalizedNameCollisionCandidates.filter((candidate) =>
      EXPECTED_REGISTRATION_SETS.has([...candidate.registrationNos].sort().join(",")),
    );
  const normalizedRaces =
    (await Promise.all(NORMALIZED_FILES.map(readJsonLines))).flat();
  const normalizedByRaceKey =
    new Map(normalizedRaces.map((race) => [race.raceKey, race]));
  const index = JSON.parse(await readFile(abs(INDEX_PATH), "utf8"));
  const allRecords = [];
  for (const item of array(index.items)) {
    if (item.date < "2026-05-01" || item.date > "2026-07-01") continue;
    const historyFile = `public${item.file}`;
    const daily = JSON.parse(await readFile(abs(historyFile), "utf8"));
    for (const race of array(daily.items)) {
      for (const starter of array(race.starters)) {
        const candidate =
          candidates.find(
            (itemCandidate) =>
              itemCandidate.normalizedName === normalizeName(starter.name),
          );
        if (!candidate) continue;
        const sourceRace = normalizedByRaceKey.get(race.raceKey);
        const sourceStarter =
          array(sourceRace?.starters).find(
            (source) =>
              Number(source.carNo) === Number(starter.carNo)
              && normalizeName(source.name) === candidate.normalizedName,
          ) ?? null;
        allRecords.push({
          normalizedName: candidate.normalizedName,
          candidateRegistrationNos: [...candidate.registrationNos].sort(),
          date: race.date,
          venueKey: race.venueKey,
          venueName: race.venueName,
          raceNumber: race.raceNumber,
          raceKey: race.raceKey,
          carNo: starter.carNo,
          playerNameRaw: clean(starter.name),
          registrationNo: clean(starter.registrationNo) || null,
          className: clean(sourceStarter?.class),
          prefecture: clean(sourceStarter?.prefecture),
          sourceCandidateFiles: unique([
            ...Object.values(sourceRace?.sourceRefs ?? {}),
            ...NORMALIZED_FILES.filter((file) => file.includes(race.date.slice(0, 7))),
          ]),
        });
      }
    }
  }
  const sameNameCandidateRecord = [];
  for (const candidate of candidates) {
    const records =
      allRecords.filter((record) => record.normalizedName === candidate.normalizedName);
    const registered =
      records.filter((record) => Boolean(record.registrationNo));
    const unassigned =
      missing.missingRegistrationNoRecord.filter(
        (record) => record.playerNameNormalized === candidate.normalizedName,
      );
    const byRegistrationNo = {};
    for (const registrationNo of candidate.registrationNos) {
      byRegistrationNo[registrationNo] =
        registered.filter((record) => record.registrationNo === registrationNo).length;
    }
    const groupedByRace = new Map();
    for (const record of records) {
      if (!groupedByRace.has(record.raceKey)) groupedByRace.set(record.raceKey, []);
      groupedByRace.get(record.raceKey).push(record);
    }
    const sameRaceConflict =
      [...groupedByRace.values()].filter((raceRecords) => (
        raceRecords.length > 1
        || new Set(raceRecords.map((record) => record.registrationNo).filter(Boolean)).size > 1
      )).length;
    const candidateRegistrationSet = new Set(candidate.registrationNos);
    const suspectedWrongMerge =
      registered.some(
        (record) => !candidateRegistrationSet.has(record.registrationNo),
      );
    const registrationNoAssignedSafely =
      registered.every(
        (record) => candidateRegistrationSet.has(record.registrationNo),
      ) && sameRaceConflict === 0;
    const noRegistrationNoRecordsKeptUnassigned =
      unassigned.every((record) => (
        !record.sourceHasRegistrationNo && !record.exactSourceMatchPossible
      ));
    const recommendedAction =
      suspectedWrongMerge || sameRaceConflict > 0 ? "BLOCKED"
        : unassigned.length > 0 ? "MANUAL_REVIEW_REQUIRED"
          : "SAFE_KEEP_SEPARATED";
    const blockReasons = [];
    if (sameRaceConflict > 0) blockReasons.push("SAME_RACE_CONFLICT");
    if (suspectedWrongMerge) blockReasons.push("SUSPECTED_WRONG_MERGE");
    if (unassigned.length > 0) {
      blockReasons.push(
        "SAME_NAME_MULTIPLE_REGISTRATION_AMBIGUOUS",
        "EXACT_SOURCE_MATCH_NOT_POSSIBLE",
      );
    }
    sameNameCandidateRecord.push({
      normalizedName: candidate.normalizedName,
      candidateRegistrationNos: [...candidate.registrationNos].sort(),
      recordsWithRegistrationNo: registered.length,
      recordsWithRegistrationNoByCandidate: byRegistrationNo,
      recordsWithoutRegistrationNo: unassigned.length,
      dates: unique([...records, ...unassigned].map((record) => record.date)),
      venues: unique([...records, ...unassigned].map((record) => record.venueKey)),
      raceKeys: unique([...records, ...unassigned].map((record) => record.raceKey)),
      carNos: unique([...records, ...unassigned].map((record) => record.carNo)),
      classNames: unique(records.map((record) => record.className)),
      prefectures: unique(records.map((record) => record.prefecture)),
      sourceCandidateFiles:
        unique([
          ...records.flatMap((record) => record.sourceCandidateFiles),
          ...unassigned.flatMap((record) => record.sourceCandidateFiles),
        ]),
      registrationNoAssignedSafely,
      noRegistrationNoRecordsKeptUnassigned,
      autoMerged: false,
      suspectedWrongMerge,
      sameRaceConflict,
      sameDateVenueRaceConflict: sameRaceConflict,
      recommendedAction,
      blockReasons,
    });
  }
  const autoMergeCount =
    sameNameCandidateRecord.filter((record) => record.autoMerged).length;
  const suspectedWrongMergeCount =
    sameNameCandidateRecord.filter((record) => record.suspectedWrongMerge).length;
  const sameRaceConflictCount =
    sameNameCandidateRecord.reduce((sum, record) => sum + record.sameRaceConflict, 0);
  const manualReviewRequiredCount =
    sameNameCandidateRecord.filter(
      (record) => record.recommendedAction === "MANUAL_REVIEW_REQUIRED",
    ).length;
  const manualReviewRequiredRecordCount =
    sameNameCandidateRecord.reduce(
      (sum, record) =>
        sum + (
          record.recommendedAction === "MANUAL_REVIEW_REQUIRED"
            ? record.recordsWithoutRegistrationNo
            : 0
        ),
      0,
    );
  const sourceCollectionRequiredCount = manualReviewRequiredRecordCount;
  const fail =
    candidates.length !== 3
    || autoMergeCount > 0
    || suspectedWrongMergeCount > 0
    || sameRaceConflictCount > 0
    || sameNameCandidateRecord.some(
      (record) =>
        !record.registrationNoAssignedSafely
        || !record.noRegistrationNoRecordsKeptUnassigned,
    );
  const finalStatus = fail
    ? "SAME_NAME_CANDIDATE_IDENTITY_SAFETY_FAIL"
    : manualReviewRequiredCount > 0
      ? "SAME_NAME_CANDIDATE_IDENTITY_SAFETY_PASS_WITH_MANUAL_REVIEW"
      : "SAME_NAME_CANDIDATE_IDENTITY_SAFETY_PASS";
  const summary = {
    finalStatus,
    checkedCandidateNameCount: candidates.length,
    checkedCandidateRegistrationNoCount:
      unique(candidates.flatMap((candidate) => candidate.registrationNos)).length,
    recordsWithRegistrationNo:
      sameNameCandidateRecord.reduce(
        (sum, record) => sum + record.recordsWithRegistrationNo,
        0,
      ),
    recordsWithoutRegistrationNo:
      sameNameCandidateRecord.reduce(
        (sum, record) => sum + record.recordsWithoutRegistrationNo,
        0,
      ),
    autoMergeCount,
    suspectedWrongMergeCount,
    sameRaceConflictCount,
    manualReviewRequiredCount,
    manualReviewRequiredRecordCount,
    sourceCollectionRequiredCount,
    fakeCompletionPerformed: false,
    fuzzyMatchingPerformed: false,
    generatedIdentityPerformed: false,
    writePerformed: false,
  };
  const jsonSummary = {
    finalStatus,
    candidateCount: candidates.length,
    safeSeparatedCandidateCount:
      sameNameCandidateRecord.filter(
        (record) => record.recommendedAction === "SAFE_KEEP_SEPARATED",
      ).length,
    manualReviewRequiredCount,
    writePerformed: false,
  };
  if (printOutput) {
    print("summary", summary);
    print("sameNameCandidateRecord", sameNameCandidateRecord);
    print("jsonSummary", jsonSummary);
  }
  if (fail && printOutput) process.exitCode = 1;
  return { summary, sameNameCandidateRecord, jsonSummary };
}

const isMain =
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  auditKurariExSameNameCandidateIdentitySafety20260501To20260701().catch((error) => {
    console.error("[kurari-ex same-name candidate identity safety audit] failed");
    console.error(error);
    process.exitCode = 1;
  });
}
