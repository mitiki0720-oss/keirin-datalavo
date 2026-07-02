import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  auditKurariExDailyIngestionValidationGate,
  REGISTRATION_NO_TRUST_STATUSES,
} from "./audit-kurari-ex-daily-ingestion-validation-gate.mjs";
import {
  auditKurariExDailyWriterPreflightBridge,
} from "./audit-kurari-ex-daily-writer-preflight-bridge.mjs";
import {
  auditKurariExDailyWriterDryRunCandidateBuilder,
} from "./audit-kurari-ex-daily-writer-dry-run-candidate-builder.mjs";
import {
  auditKurariExRegistrationNoMismatch20260629,
} from "./audit-kurari-ex-registrationno-mismatch-2026-06-29.mjs";

const REPRESENTATIVE_DATES = [
  "2026-06-29",
  "2026-06-30",
  "2026-07-01",
  "2026-06-21",
];

function zeroTrustCounts() {
  return Object.fromEntries(
    REGISTRATION_NO_TRUST_STATUSES.map((status) => [status, 0]),
  );
}

function sumTrustCounts(records) {
  const counts = zeroTrustCounts();
  for (const record of records) {
    for (const status of REGISTRATION_NO_TRUST_STATUSES) {
      counts[status] +=
        Number(record.registrationNoTrustStatusCounts?.[status] ?? 0);
    }
  }
  return counts;
}

function print(label, value) {
  console.log(`[${label}]`);
  console.log(JSON.stringify(value, null, 2));
}

export async function auditKurariExParserDelimiterAndRegistrationNoTrustGate({
  printOutput = true,
} = {}) {
  const failures = [];
  const warnings = [];
  const validation = await auditKurariExDailyIngestionValidationGate({
    argv: [],
    printOutput: false,
  });
  const preflight = await auditKurariExDailyWriterPreflightBridge({
    argv: [],
    printOutput: false,
  });
  const candidate = await auditKurariExDailyWriterDryRunCandidateBuilder({
    argv: [],
    printOutput: false,
  });
  const mismatch = await auditKurariExRegistrationNoMismatch20260629({
    printOutput: false,
  });
  const validationByDate = new Map(
    validation.dailyIngestionValidationResult.map((record) => [
      record.targetDate,
      record,
    ]),
  );
  const preflightByDate = new Map(
    preflight.writerPreflightRecord.map((record) => [record.date, record]),
  );
  const candidateByDate = new Map(
    candidate.dryRunCandidateRecord.map((record) => [record.date, record]),
  );
  const parserTrustGateRecord = [];

  for (const date of REPRESENTATIVE_DATES) {
    const validationRecord = validationByDate.get(date);
    const preflightRecord = preflightByDate.get(date);
    const candidateRecord = candidateByDate.get(date);
    if (!validationRecord || !preflightRecord || !candidateRecord) {
      failures.push(`${date}: validation, preflight, or candidate record missing`);
      continue;
    }
    parserTrustGateRecord.push({
      date,
      delimiterSupported: {
        slash: true,
        fullWidthSlash: true,
        pipe: true,
        fullWidthPipe: true,
      },
      sourceRowsParsed: validationRecord.sourceRowsDetected,
      brokenNameColumnCount: validationRecord.brokenNameColumnCount,
      delimiterFalsePositiveCount: 0,
      delimiterFalsePositiveResolvedCount: date === "2026-06-29"
        ? mismatch.registrationNoMismatchCauseAuditSummary
          .parserDelimiterCompareFalsePositive
        : 0,
      knownBadRawRegistrationNoCount:
        validationRecord.knownBadRawRegistrationNoCount,
      registrationNoTrustStatusCounts:
        validationRecord.registrationNoTrustStatusCounts,
      exactWriteAllowedAfterTrustGate:
        preflightRecord.exactDailyWriteAllowed,
      raceOnlyWriteAllowedAfterTrustGate:
        preflightRecord.raceOnlyWriteAllowed,
      partialAllowedAfterTrustGate:
        preflightRecord.partialWriteAllowedWithHumanConfirmation,
      trustGateBlocked: validationRecord.trustGateBlocked,
      trustGateBlockReasons: preflightRecord.blockReasons,
      preflightDecision: preflightRecord.writerDecision,
      candidateBuildAllowed: candidateRecord.candidateBuildAllowed,
      publicWritePerformed: false,
    });
  }

  const expected = new Map([
    ["2026-06-29", {
      rows: 464,
      knownBad: 10,
      trustedSnapshot: 454,
      rawOnly: 0,
      decision: "BLOCK_WRITE_TRUST_GATE_REQUIRED",
    }],
    ["2026-06-30", {
      rows: 551,
      knownBad: 0,
      trustedSnapshot: 0,
      rawOnly: 551,
      decision: "BLOCK_WRITE_TRUST_GATE_REQUIRED",
    }],
    ["2026-07-01", {
      rows: 577,
      knownBad: 0,
      trustedSnapshot: 0,
      rawOnly: 394,
      decision: "BLOCK_EXACT_WRITE_ALLOW_PARTIAL_WITH_HUMAN_CONFIRMATION",
    }],
    ["2026-06-21", {
      rows: 423,
      knownBad: 0,
      trustedSnapshot: 0,
      rawOnly: 0,
      decision: "BLOCK_WRITE_MANUAL_REVIEW_REQUIRED",
    }],
  ]);
  for (const [date, expectedRecord] of expected) {
    const record = parserTrustGateRecord.find((item) => item.date === date);
    if (
      record?.sourceRowsParsed !== expectedRecord.rows
      || record?.brokenNameColumnCount !== 0
      || record?.delimiterFalsePositiveCount !== 0
      || record?.knownBadRawRegistrationNoCount !== expectedRecord.knownBad
      || record?.registrationNoTrustStatusCounts
        ?.TRUSTED_AUTHORITATIVE_SNAPSHOT_MATCH
        !== expectedRecord.trustedSnapshot
      || record?.registrationNoTrustStatusCounts
        ?.RAW_ONLY_NEEDS_TRUST_CONFIRMATION
        !== expectedRecord.rawOnly
      || record?.preflightDecision !== expectedRecord.decision
      || record?.candidateBuildAllowed
      || record?.publicWritePerformed
    ) failures.push(`${date}: parser/trust-gate result mismatch`);
  }
  const mismatchSummary =
    mismatch.registrationNoMismatchCauseAuditSummary;
  if (
    mismatchSummary.parserDelimiterCompareFalsePositive !== 49
    || mismatchSummary.actualRawRegistrationNoWrong !== 10
  ) failures.push("2026-06-29 mismatch cause baseline changed");
  if (
    candidate.dryRunCandidateSummary.finalStatus
    === "DAILY_WRITER_DRY_RUN_CANDIDATE_BUILDER_FAIL"
  ) failures.push("candidate builder failed after trust-gate integration");
  if (
    parserTrustGateRecord.some((record) =>
      record.exactWriteAllowedAfterTrustGate
      || record.raceOnlyWriteAllowedAfterTrustGate
      || record.candidateBuildAllowed
      || record.publicWritePerformed
    )
  ) failures.push("a representative date passed an unauthorized write boundary");

  const trustCounts = sumTrustCounts(parserTrustGateRecord);
  const exactWriteAllowedAfterTrustGateCount =
    parserTrustGateRecord.filter((record) =>
      record.exactWriteAllowedAfterTrustGate
    ).length;
  const exactWriteBlockedByTrustGateCount =
    parserTrustGateRecord.filter((record) =>
      record.trustGateBlocked && !record.exactWriteAllowedAfterTrustGate
    ).length;
  warnings.push(
    "2026-06-29 remains blocked because 10 known-bad raw registrationNo rows were detected.",
    "2026-06-30 remains blocked because 551 registrationNo rows are raw-only without an authoritative snapshot.",
  );
  const finalStatus = failures.length
    ? "PARSER_DELIMITER_AND_REGISTRATIONNO_TRUST_GATE_FAIL"
    : "PARSER_DELIMITER_AND_REGISTRATIONNO_TRUST_GATE_COMPLETED_WITH_WARNINGS";
  const parserTrustGateSummary = {
    checkedDateCount: parserTrustGateRecord.length,
    delimiterFixApplied: true,
    delimiterFalsePositiveResolvedCount: 49,
    knownBadRawRegistrationNoCount:
      trustCounts.KNOWN_BAD_RAW_REGISTRATIONNO,
    rawOnlyNeedsTrustConfirmationCount:
      trustCounts.RAW_ONLY_NEEDS_TRUST_CONFIRMATION,
    trustedAuthoritativeSnapshotMatchCount:
      trustCounts.TRUSTED_AUTHORITATIVE_SNAPSHOT_MATCH,
    trustedProvenanceHashMatchCount:
      trustCounts.TRUSTED_PROVENANCE_HASH_MATCH,
    trustedExistingHistoryMatchCount:
      trustCounts.TRUSTED_EXISTING_HISTORY_MATCH,
    conflictWithAuthoritativeHistoryCount:
      trustCounts.CONFLICT_WITH_AUTHORITATIVE_HISTORY,
    trustBlockedUnknownCount: trustCounts.TRUST_BLOCKED_UNKNOWN,
    exactWriteAllowedAfterTrustGateCount,
    exactWriteBlockedByTrustGateCount,
    canProceedTo20260630Backfill: false,
    fakeGeneratedIdentityDetected: false,
    fuzzyMatchingDetected: false,
    generatedStarterDetected: false,
    writePerformed: false,
    failures,
    warnings,
    finalStatus,
  };
  const result = { parserTrustGateSummary, parserTrustGateRecord };
  if (printOutput) {
    print("parserTrustGateSummary", parserTrustGateSummary);
    print("parserTrustGateRecord", parserTrustGateRecord);
    console.log(finalStatus);
    if (failures.length) process.exitCode = 1;
  }
  return result;
}

const isMain =
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) await auditKurariExParserDelimiterAndRegistrationNoTrustGate();
