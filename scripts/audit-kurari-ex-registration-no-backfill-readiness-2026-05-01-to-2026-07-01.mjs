import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  auditKurariExRegistrationNoMissingDeep20260501To20260701,
} from "./audit-kurari-ex-registration-no-missing-deep-2026-05-01-to-2026-07-01.mjs";
import {
  auditKurariExMixedDaysRaceLevel20260501To20260701,
} from "./audit-kurari-ex-mixed-days-race-level-2026-05-01-to-2026-07-01.mjs";

function unique(values) {
  return [...new Set(values)].sort();
}

function print(label, value) {
  console.log(`[${label}]`);
  console.log(JSON.stringify(value, null, 2));
}

export async function auditKurariExRegistrationNoBackfillReadiness20260501To20260701(
  { printOutput = true } = {},
) {
  const missing =
    await auditKurariExRegistrationNoMissingDeep20260501To20260701({
      printOutput: false,
    });
  const mixed =
    await auditKurariExMixedDaysRaceLevel20260501To20260701({
      printOutput: false,
    });
  const records = missing.missingRegistrationNoRecord;
  const recordsFor = (readiness) =>
    records.filter((record) => record.backfillReadiness === readiness);
  const ready = recordsFor("READY_EXACT");
  const parserFix = recordsFor("NEEDS_PARSER_FIX");
  const sourceCollection = recordsFor("NEEDS_SOURCE_COLLECTION");
  const ambiguous = recordsFor("AMBIGUOUS_REVIEW_REQUIRED");
  const unsafe = recordsFor("NOT_BACKFILLABLE_SAFELY");
  const sameNameMultipleRegistrationCandidates = [];
  const candidateKeys = new Set();
  for (const record of ambiguous) {
    const key =
      `${record.playerNameNormalized}|${record.sameNameCandidateRegistrationNos.join(",")}`;
    if (candidateKeys.has(key)) continue;
    candidateKeys.add(key);
    sameNameMultipleRegistrationCandidates.push({
      playerNameNormalized: record.playerNameNormalized,
      playerNamesRaw: unique(
        ambiguous
          .filter((item) => item.playerNameNormalized === record.playerNameNormalized)
          .map((item) => item.playerNameRaw),
      ),
      candidateRegistrationNos: record.sameNameCandidateRegistrationNos,
      affectedDates: unique(
        ambiguous
          .filter((item) => item.playerNameNormalized === record.playerNameNormalized)
          .map((item) => item.date),
      ),
      affectedRaceKeys: unique(
        ambiguous
          .filter((item) => item.playerNameNormalized === record.playerNameNormalized)
          .map((item) => item.raceKey),
      ),
      status: "AMBIGUOUS_REVIEW_REQUIRED",
    });
  }
  const proposedBackfillBatches = [];
  if (ready.length > 0) {
    proposedBackfillBatches.push({
      batchName: "registration-no-ready-exact",
      targetDates: unique(ready.map((record) => record.date)),
      targetRaceKeys: unique(ready.map((record) => record.raceKey)),
      targetRecordCount: ready.length,
      sourceType: "exact same-date venue race car and name source",
      expectedRisk: "LOW",
      requiredGuards: [
        "exact date+venue+raceNumber+carNo+normalizedName match",
        "registrationNo present in source",
        "same-name multiple-registration candidate excluded",
        "atomic daily and index bytes refresh",
      ],
    });
  }
  const blockedBatches = [
    {
      batchName: "source-registration-number-collection",
      targetDates: unique(sourceCollection.map((record) => record.date)),
      targetRecordCount: sourceCollection.length,
      reason: "exact race source exists but does not contain registrationNo",
      expectedRisk: "HIGH",
    },
    {
      batchName: "same-name-manual-review",
      targetDates: unique(ambiguous.map((record) => record.date)),
      targetRecordCount: ambiguous.length,
      reason: "same normalized name maps to multiple registration numbers",
      expectedRisk: "HIGH",
    },
    {
      batchName: "mixed-days-no-starters-source-collection",
      targetDates: mixed.mixedDaysRaceLevelSummary.mixedDates,
      targetRecordCount:
        mixed.mixedDaysRaceLevelSummary.noStartersRaceCount,
      reason: "race has no starters and no dedicated starters/entries source",
      expectedRisk: "HIGH",
    },
    {
      batchName: "mixed-days-partial-starters-review",
      targetDates: unique(
        mixed.mixedDayRaceRecord
          .filter((record) => record.raceMode === "PARTIAL_STARTERS")
          .map((record) => record.date),
      ),
      targetRecordCount:
        mixed.mixedDaysRaceLevelSummary.partialStartersRaceCount,
      reason: "starter count or core identity fields are partial",
      expectedRisk: "HIGH",
    },
  ].filter((batch) => batch.targetRecordCount > 0);
  const finalRecommendation =
    ready.length > 0 ? "PROCEED_WITH_READY_EXACT_BACKFILL"
      : parserFix.length > 0 ? "PARSER_FIX_FIRST"
        : sourceCollection.length > 0 ? "SOURCE_COLLECTION_FIRST"
          : ambiguous.length > 0 ? "MANUAL_REVIEW_FIRST"
            : "DO_NOT_BACKFILL_YET";
  const backfillReadinessPlan = {
    readyExactDates: unique(ready.map((record) => record.date)),
    readyExactVenues: unique(ready.map((record) => record.venueKey)),
    readyExactRaceKeys: unique(ready.map((record) => record.raceKey)),
    readyExactRecordCount: ready.length,
    needsParserFixDates: unique(parserFix.map((record) => record.date)),
    needsParserFixRecordCount: parserFix.length,
    needsSourceCollectionDates:
      unique(sourceCollection.map((record) => record.date)),
    needsSourceCollectionRecordCount: sourceCollection.length,
    ambiguousReviewRequiredDates:
      unique(ambiguous.map((record) => record.date)),
    ambiguousReviewRequiredRecordCount: ambiguous.length,
    notBackfillableSafelyCount: unsafe.length,
    sameNameMultipleRegistrationCandidates,
    proposedBackfillBatches,
    blockedBatches,
    finalRecommendation,
    finalStatus:
      missing.registrationNoMissingDeepSummary.totalMissingRegistrationNo === 2480
      && mixed.mixedDaysRaceLevelSummary.mixedDayCount === 14
        ? "REGISTRATION_NO_BACKFILL_READINESS_PLAN_COMPLETED_WITH_WARNINGS"
        : "REGISTRATION_NO_BACKFILL_READINESS_PLAN_FAIL",
  };
  const jsonSummary = {
    finalStatus: backfillReadinessPlan.finalStatus,
    finalRecommendation,
    readyExactRecordCount: ready.length,
    blockedRecordCount: records.length - ready.length,
    writePerformed: false,
  };
  if (printOutput) {
    print("backfillReadinessPlan", backfillReadinessPlan);
    print("jsonSummary", jsonSummary);
  }
  if (backfillReadinessPlan.finalStatus.endsWith("_FAIL") && printOutput) {
    process.exitCode = 1;
  }
  return { backfillReadinessPlan, jsonSummary, missing, mixed };
}

const isMain =
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  auditKurariExRegistrationNoBackfillReadiness20260501To20260701().catch((error) => {
    console.error("[kurari-ex registrationNo backfill readiness] failed");
    console.error(error);
    process.exitCode = 1;
  });
}
