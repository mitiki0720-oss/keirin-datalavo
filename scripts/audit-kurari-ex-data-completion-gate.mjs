import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  auditKurariExRegistrationNoMissingDeep20260501To20260701,
} from "./audit-kurari-ex-registration-no-missing-deep-2026-05-01-to-2026-07-01.mjs";

const ROOT = process.cwd();
const FROM_DATE = "2026-05-01";
const TO_DATE = "2026-07-01";
const INDEX_PATH = "public/data/analytics/kurari-ex/history/index.generated.json";
const EXPECTED_INDEX_HASH = "sha256:683fd01dea2e0e5f272d35eff42bde236ba326954e857feaa9dec04f77cb3acb";
const EXPECTED_INDEX_BYTES = 14079;
const EXPECTED_SOURCE_MISSING_DATES = [
  "2026-05-18",
  "2026-05-19",
  "2026-06-16",
  "2026-06-26",
];

function abs(file) {
  return path.isAbsolute(file) ? file : path.resolve(ROOT, file);
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function hashPayload(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function datesInRange(from, to) {
  const dates = [];
  for (
    let current = new Date(`${from}T00:00:00Z`);
    current <= new Date(`${to}T00:00:00Z`);
    current = new Date(current.getTime() + 86_400_000)
  ) {
    dates.push(current.toISOString().slice(0, 10));
  }
  return dates;
}

function classifyMode(races) {
  if (!races.length) return "SOURCE_MISSING";
  const racesWithStarters = races.filter((race) => array(race.starters).length > 0).length;
  if (racesWithStarters === races.length) return "STARTERS_PARSED";
  if (racesWithStarters === 0) return "NO_STARTERS";
  return "MIXED";
}

function countBy(records, field, values) {
  return Object.fromEntries(
    values.map((value) => [value, records.filter((record) => record[field] === value).length]),
  );
}

function print(label, value) {
  console.log(`[${label}]`);
  console.log(JSON.stringify(value, null, 2));
}

export async function auditKurariExDataCompletionGate({ printOutput = true } = {}) {
  const failures = [];
  const warnings = [];
  const indexBuffer = await readFile(abs(INDEX_PATH));
  const index = JSON.parse(indexBuffer.toString("utf8"));
  const indexByDate = new Map(array(index.items).map((item) => [item.date, item]));
  const missingAudit =
    await auditKurariExRegistrationNoMissingDeep20260501To20260701({
      printOutput: false,
    });
  const manualReviewRecords = missingAudit.missingRegistrationNoRecord.filter(
    (record) => record.sameNameMultipleRegistrationCandidate,
  );
  const manualReviewCountByDate = new Map();
  for (const record of manualReviewRecords) {
    manualReviewCountByDate.set(
      record.date,
      (manualReviewCountByDate.get(record.date) ?? 0) + 1,
    );
  }

  if (hashPayload(index) !== EXPECTED_INDEX_HASH) failures.push(`index payload hash mismatch: ${hashPayload(index)}`);
  if (indexBuffer.length !== EXPECTED_INDEX_BYTES) failures.push(`index bytes mismatch: ${indexBuffer.length}`);
  if (index.items?.length !== 58 || index.dayCount !== 58 || index.raceCount !== 4373) {
    failures.push("index source/day/race baseline mismatch");
  }

  const completionGateRecord = [];
  for (const date of datesInRange(FROM_DATE, TO_DATE)) {
    const item = indexByDate.get(date) ?? null;
    if (!item) {
      completionGateRecord.push({
        date,
        historyExists: false,
        dailyPath: null,
        venueCount: 0,
        raceCount: 0,
        starterTotal: 0,
        exactRegistrationNoStarterCount: 0,
        missingRegistrationNoStarterCount: 0,
        noStartersRaceCount: 0,
        mode: "SOURCE_MISSING",
        completionCategory: "EX_SOURCE_MISSING",
        displayReadiness: "BLOCKED_SOURCE_MISSING",
        playerAnalysisReadiness: "BLOCKED",
        blockReasons: ["HISTORY_DAILY_MISSING", "AUTHORITATIVE_SOURCE_REQUIRED"],
        notes: ["No history daily is indexed; do not synthesize races or starters."],
      });
      continue;
    }

    const dailyPath = `public${item.file}`;
    const daily = JSON.parse(await readFile(abs(dailyPath), "utf8"));
    const races = array(daily.items);
    const starters = races.flatMap((race) => array(race.starters));
    const exactRegistrationNoStarterCount =
      starters.filter((starter) => Boolean(String(starter.registrationNo ?? "").trim())).length;
    const missingRegistrationNoStarterCount =
      starters.length - exactRegistrationNoStarterCount;
    const noStartersRaceCount =
      races.filter((race) => array(race.starters).length === 0).length;
    const mode = classifyMode(races);
    const manualReviewRecordCount = manualReviewCountByDate.get(date) ?? 0;
    const duplicateCarNoCount = races.reduce((sum, race) => {
      const carNos = array(race.starters).map((starter) => String(starter.carNo));
      return sum + carNos.length - new Set(carNos).size;
    }, 0);
    const duplicateRegistrationNoCount = races.reduce((sum, race) => {
      const registrationNos = array(race.starters)
        .map((starter) => String(starter.registrationNo ?? "").trim())
        .filter(Boolean);
      return sum + registrationNos.length - new Set(registrationNos).size;
    }, 0);
    const generatedIdentityCount = starters.filter(
      (starter) => /generated|fake|fuzzy/iu.test(String(starter.identityStatus ?? "")),
    ).length;
    const crossDateRaceCount = races.filter((race) => race.date !== date).length;
    const venueCount = new Set(races.map((race) => race.venueKey)).size;

    let completionCategory;
    let displayReadiness;
    let playerAnalysisReadiness;
    const blockReasons = [];
    const notes = [];
    if (manualReviewRecordCount > 0) {
      completionCategory = "EX_MANUAL_REVIEW_REQUIRED";
      displayReadiness = "MANUAL_REVIEW";
      playerAnalysisReadiness = "MANUAL_REVIEW_REQUIRED";
      blockReasons.push("SAME_NAME_MULTIPLE_REGISTRATION_AMBIGUOUS", "AUTO_MERGE_PROHIBITED");
      notes.push(`${manualReviewRecordCount} same-name record(s) require authoritative source review.`);
    } else if (mode === "NO_STARTERS") {
      completionCategory = "EX_READY_RACE_ONLY";
      displayReadiness = "RACE_ONLY";
      playerAnalysisReadiness = "UNAVAILABLE_NO_STARTERS";
      blockReasons.push("NO_STARTERS");
      notes.push("Race/result/prediction/review display is available; player analysis is unavailable.");
    } else if (missingRegistrationNoStarterCount > 0 || noStartersRaceCount > 0) {
      completionCategory = "EX_READY_PARTIAL_PLAYERS";
      displayReadiness = "READY_WITH_WARNINGS";
      playerAnalysisReadiness = "PARTIAL_AVAILABLE";
      if (missingRegistrationNoStarterCount > 0) blockReasons.push("REGISTRATION_NO_MISSING");
      if (noStartersRaceCount > 0) blockReasons.push("SOME_RACES_NO_STARTERS");
      notes.push("Use only saved starters and registrationNo values; missing identity remains missing.");
    } else {
      completionCategory = "EX_READY_EXACT_PLAYERS";
      displayReadiness = "READY";
      playerAnalysisReadiness = "EXACT_AVAILABLE";
      notes.push("All saved starters have registrationNo and race-level identity uniqueness checks passed.");
    }

    if (duplicateCarNoCount) failures.push(`${date}: duplicate carNo in same race`);
    if (duplicateRegistrationNoCount) failures.push(`${date}: duplicate registrationNo in same race`);
    if (generatedIdentityCount) failures.push(`${date}: generated/fake/fuzzy identity marker detected`);
    if (crossDateRaceCount) failures.push(`${date}: cross-date race mix detected`);
    if (daily.raceCount !== races.length || item.raceCount !== races.length) {
      failures.push(`${date}: race count mismatch`);
    }

    completionGateRecord.push({
      date,
      historyExists: true,
      dailyPath,
      venueCount,
      raceCount: races.length,
      starterTotal: starters.length,
      exactRegistrationNoStarterCount,
      missingRegistrationNoStarterCount,
      noStartersRaceCount,
      mode,
      completionCategory,
      displayReadiness,
      playerAnalysisReadiness,
      blockReasons,
      notes,
    });
  }

  const completionCategories = [
    "EX_READY_EXACT_PLAYERS",
    "EX_READY_PARTIAL_PLAYERS",
    "EX_READY_RACE_ONLY",
    "EX_SOURCE_MISSING",
    "EX_MANUAL_REVIEW_REQUIRED",
  ];
  const displayReadinessValues = [
    "READY",
    "READY_WITH_WARNINGS",
    "RACE_ONLY",
    "BLOCKED_SOURCE_MISSING",
    "MANUAL_REVIEW",
  ];
  const playerReadinessValues = [
    "EXACT_AVAILABLE",
    "PARTIAL_AVAILABLE",
    "UNAVAILABLE_NO_STARTERS",
    "BLOCKED",
    "MANUAL_REVIEW_REQUIRED",
  ];
  const byCompletionCategory =
    countBy(completionGateRecord, "completionCategory", completionCategories);
  const byDisplayReadiness =
    countBy(completionGateRecord, "displayReadiness", displayReadinessValues);
  const byPlayerAnalysisReadiness =
    countBy(completionGateRecord, "playerAnalysisReadiness", playerReadinessValues);
  const historyRecords = completionGateRecord.filter((record) => record.historyExists);
  const sourceMissingDates =
    completionGateRecord.filter((record) => record.mode === "SOURCE_MISSING").map((record) => record.date);
  const modeCounts = countBy(historyRecords, "mode", ["STARTERS_PARSED", "NO_STARTERS", "MIXED"]);
  const total = (field) =>
    historyRecords.reduce((sum, record) => sum + record[field], 0);

  if (sourceMissingDates.join(",") !== EXPECTED_SOURCE_MISSING_DATES.join(",")) {
    failures.push(`source-missing dates mismatch: ${sourceMissingDates.join(",")}`);
  }
  if (
    modeCounts.STARTERS_PARSED !== 5
    || modeCounts.NO_STARTERS !== 39
    || modeCounts.MIXED !== 14
  ) failures.push("history mode counts mismatch");
  if (total("starterTotal") !== 8025) failures.push(`starter total mismatch: ${total("starterTotal")}`);
  if (total("exactRegistrationNoStarterCount") !== 5545) {
    failures.push(`exact registrationNo starter count mismatch: ${total("exactRegistrationNoStarterCount")}`);
  }
  if (total("missingRegistrationNoStarterCount") !== 2480) {
    failures.push(`missing registrationNo starter count mismatch: ${total("missingRegistrationNoStarterCount")}`);
  }
  if (manualReviewRecords.length !== 9) failures.push(`manual review record count mismatch: ${manualReviewRecords.length}`);
  if (
    byCompletionCategory.EX_READY_EXACT_PLAYERS !== 1
    || byCompletionCategory.EX_READY_PARTIAL_PLAYERS !== 11
    || byCompletionCategory.EX_READY_RACE_ONLY !== 39
    || byCompletionCategory.EX_SOURCE_MISSING !== 4
    || byCompletionCategory.EX_MANUAL_REVIEW_REQUIRED !== 7
  ) failures.push("completion category counts mismatch");

  if (
    byCompletionCategory.EX_READY_PARTIAL_PLAYERS
    || byCompletionCategory.EX_READY_RACE_ONLY
    || byCompletionCategory.EX_SOURCE_MISSING
    || byCompletionCategory.EX_MANUAL_REVIEW_REQUIRED
  ) {
    warnings.push("Some target days are partial, race-only, source-missing, or require manual review");
  }
  const finalStatus = failures.length
    ? "EX_DATA_COMPLETION_GATE_FAIL"
    : warnings.length
      ? "EX_DATA_COMPLETION_GATE_COMPLETED_WITH_WARNINGS"
      : "EX_DATA_COMPLETION_GATE_COMPLETED";
  const completionGateSummary = {
    totalTargetDays: completionGateRecord.length,
    historyDays: historyRecords.length,
    raceCount: total("raceCount"),
    historyModeCounts: modeCounts,
    byCompletionCategory,
    byDisplayReadiness,
    byPlayerAnalysisReadiness,
    exactPlayerReadyDays: byCompletionCategory.EX_READY_EXACT_PLAYERS,
    partialPlayerReadyDays: byCompletionCategory.EX_READY_PARTIAL_PLAYERS,
    raceOnlyDays: byCompletionCategory.EX_READY_RACE_ONLY,
    sourceMissingDays: byCompletionCategory.EX_SOURCE_MISSING,
    manualReviewDays: byCompletionCategory.EX_MANUAL_REVIEW_REQUIRED,
    sourceMissingDates,
    manualReviewDates:
      completionGateRecord
        .filter((record) => record.completionCategory === "EX_MANUAL_REVIEW_REQUIRED")
        .map((record) => record.date),
    totalStarters: total("starterTotal"),
    exactRegistrationNoStarterCount: total("exactRegistrationNoStarterCount"),
    missingRegistrationNoStarterCount: total("missingRegistrationNoStarterCount"),
    noStartersRaceCount: total("noStartersRaceCount"),
    sameNameManualReviewRecords: manualReviewRecords.length,
    registrationNoBackfillReadyExactCount: 0,
    registrationNoBackfillRecommendation: "SOURCE_COLLECTION_FIRST",
    fakeCompletionPerformed: false,
    fuzzyMatchingPerformed: false,
    generatedIdentityPerformed: false,
    autoSameNameMergePerformed: false,
    crossDateVenueRaceMixCount: 0,
    warnings,
    failures,
    finalStatus,
  };
  if (printOutput) {
    print("completionGateSummary", completionGateSummary);
    print("completionGateRecord", completionGateRecord);
    console.log(finalStatus);
  }
  if (failures.length && printOutput) process.exitCode = 1;
  return { completionGateSummary, completionGateRecord };
}

const isMain =
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) await auditKurariExDataCompletionGate();
