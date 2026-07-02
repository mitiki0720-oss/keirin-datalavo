import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  auditKurariExDailyIngestionValidationGate,
  splitStarterSourceRow,
} from "./audit-kurari-ex-daily-ingestion-validation-gate.mjs";
import {
  auditKurariExDailyWriterPreflightBridge,
} from "./audit-kurari-ex-daily-writer-preflight-bridge.mjs";

const ROOT = process.cwd();
const REPRESENTATIVE_DATES = [
  "2026-06-29",
  "2026-06-30",
  "2026-07-01",
  "2026-06-21",
];
const WRITER_MODES = new Set(["exact", "race-only", "partial"]);

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
  return clean(value).replace(/[\s　・･.]/gu, "");
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function hashPayload(value) {
  return sha256(JSON.stringify(value));
}

function jsonBytes(value) {
  return Buffer.byteLength(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseArgs(argv) {
  const options = {
    date: null,
    sourceDir: null,
    writerMode: null,
    dryRun: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--date") options.date = argv[++index] ?? null;
    else if (argument === "--source-dir") options.sourceDir = argv[++index] ?? null;
    else if (argument === "--writer-mode") options.writerMode = argv[++index] ?? null;
    else if (argument === "--dry-run") options.dryRun = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (options.date && !/^\d{4}-\d{2}-\d{2}$/u.test(options.date)) {
    throw new Error(`Invalid --date: ${options.date}`);
  }
  if (options.sourceDir && !options.date) throw new Error("--source-dir requires --date");
  if (options.writerMode && !WRITER_MODES.has(options.writerMode)) {
    throw new Error(`Invalid --writer-mode: ${options.writerMode}`);
  }
  return options;
}

function classifyMode(daily) {
  const races = array(daily?.items);
  if (!races.length) return "UNKNOWN";
  const withStarters = races.filter((race) => array(race.starters).length > 0).length;
  if (withStarters === races.length) return "STARTERS_PARSED";
  if (withStarters === 0) return "NO_STARTERS";
  return "MIXED";
}

function parseOptionalStarterFields(parts) {
  const joined = parts.join(" ");
  const prefecture = clean(parts[1]);
  const age = joined.match(/(\d{1,3})歳/u);
  const term = joined.match(/(\d{2,3})期/u);
  const className =
    parts.map(clean).find((part) => /^(?:L|A|S)\s*(?:級)?[123]班?$/iu.test(part)) ?? "";
  return {
    ...(prefecture ? { prefecture } : {}),
    ...(age ? { age: Number(age[1]) } : {}),
    ...(term ? { term: term[1] } : {}),
    ...(className ? { className: className.replace(/\s+/gu, "") } : {}),
  };
}

async function parseValidatedSourceRows(validation) {
  const rows = [];
  for (const file of array(validation.selectedEntryTableFiles)) {
    const content = await readFile(abs(file), "utf8");
    const sourceHash = sha256(content);
    const venueKey =
      path.basename(file).replace(/-(prediction|summary)\.(txt|md)$/iu, "");
    let raceNumber = null;
    let inEntryTable = false;
    for (const rawLine of content.split(/\r?\n/u)) {
      const line = clean(rawLine);
      const raceHeader = line.match(/^■\s*.+?\s+(\d{1,2})R\b/u);
      if (raceHeader) {
        raceNumber = Number(raceHeader[1]);
        inEntryTable = false;
        continue;
      }
      if (/^【出走表】$/u.test(line)) {
        inEntryTable = true;
        continue;
      }
      if (/^【(?!出走表)/u.test(line) || /^■\s*/u.test(line)) {
        inEntryTable = false;
        continue;
      }
      if (!inEntryTable || !raceNumber) continue;
      const rowMatch = line.match(/^(?:車番\s*)?([1-9])(?:番車|番)?[\s　]+(.+)$/u);
      if (!rowMatch) continue;
      const rowBody = rowMatch[2];
      const explicitCarNo = rowBody.match(/(?:車番|番車)\s*([1-9])/u);
      const registrationMatch =
        rowBody.match(/登録番号\s*[：:]?\s*(\d{5,6}|未確認|不明|なし|--)/u);
      const registrationToken = clean(registrationMatch?.[1]);
      const registrationNo = /^\d{5,6}$/u.test(registrationToken)
        ? registrationToken.padStart(6, "0")
        : null;
      const parts = splitStarterSourceRow(rowBody);
      const playerName = clean(
        parts[0]
          .replace(/(?:車番|番車)\s*[1-9].*$/u, "")
          .replace(/[（(].*?[）)]/gu, ""),
      );
      rows.push({
        date: validation.targetDate,
        venueKey,
        raceNumber,
        sourceFile: file,
        starter: {
          carNo: explicitCarNo ? Number(explicitCarNo[1]) : Number(rowMatch[1]),
          name: playerName,
          registrationNo,
          ...parseOptionalStarterFields(parts),
          source: "structured-entry-table",
          registrationNoSource: "validated-prediction-entry-table",
          registrationNoSourceDate: validation.targetDate,
          registrationNoSourcePath: file,
          registrationNoSourceHash: sourceHash,
        },
      });
    }
  }
  return rows;
}

function groupRowsByRace(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.date}:${row.venueKey}:${row.raceNumber}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row.starter);
  }
  for (const starters of groups.values()) {
    starters.sort((left, right) => left.carNo - right.carNo);
  }
  return groups;
}

function starterIdentity(starter) {
  return [
    Number(starter.carNo),
    normalizeName(starter.name),
    clean(starter.registrationNo),
  ].join(":");
}

function compareExistingIdentityToSource(history, sourceGroups) {
  const mismatches = [];
  for (const race of array(history.items)) {
    const key = `${race.date}:${race.venueKey}:${race.raceNumber}`;
    const sourceStarters = sourceGroups.get(key);
    const existingStarters = array(race.starters);
    if (!sourceStarters || sourceStarters.length !== existingStarters.length) {
      mismatches.push({
        raceKey: key,
        reason: "STARTER_COUNT_MISMATCH",
        existingCount: existingStarters.length,
        sourceCount: sourceStarters?.length ?? 0,
      });
      continue;
    }
    for (let index = 0; index < sourceStarters.length; index += 1) {
      if (
        starterIdentity(sourceStarters[index])
        !== starterIdentity(existingStarters[index])
      ) {
        mismatches.push({
          raceKey: key,
          reason: "STARTER_IDENTITY_MISMATCH",
          carNo: sourceStarters[index].carNo,
          existingIdentity: starterIdentity(existingStarters[index]),
          sourceIdentity: starterIdentity(sourceStarters[index]),
        });
      }
    }
  }
  return {
    matches:
      sourceGroups.size === array(history.items).length
      && mismatches.length === 0,
    mismatchCount: mismatches.length,
    mismatchPreview: mismatches.slice(0, 5),
  };
}

function buildExactCandidate(history, sourceGroups) {
  const candidate = structuredClone(history);
  candidate.items = array(history.items).map((race) => {
    const key = `${race.date}:${race.venueKey}:${race.raceNumber}`;
    const starters = structuredClone(sourceGroups.get(key) ?? []);
    const quality = structuredClone(race.quality ?? {});
    quality.starterParsed = true;
    quality.starterSource = "same-date-validated-entry-table";
    if (quality.marker === "NO_STARTERS") delete quality.marker;
    if (Array.isArray(quality.warnings)) {
      quality.warnings = quality.warnings.filter(
        (warning) =>
          !/NO_STARTERS|no starters|starter identity intentionally not generated|registrationNo intentionally not generated/iu
            .test(clean(warning)),
      );
    }
    return {
      ...structuredClone(race),
      starterCount: starters.length,
      starters,
      quality,
    };
  });
  return candidate;
}

function stripStarterChanges(race) {
  const copy = structuredClone(race);
  delete copy.starters;
  delete copy.starterCount;
  if (copy.quality) {
    delete copy.quality.starterParsed;
    delete copy.quality.starterSource;
    delete copy.quality.marker;
    delete copy.quality.warnings;
  }
  return copy;
}

function candidateIntegrity(history, candidate) {
  const races = array(candidate.items);
  const starters = races.flatMap((race) => array(race.starters));
  let duplicateCarNoInRace = 0;
  let duplicateRegistrationNoInRace = 0;
  for (const race of races) {
    const carNos = array(race.starters).map((starter) => starter.carNo);
    const registrationNos =
      array(race.starters).map((starter) => clean(starter.registrationNo)).filter(Boolean);
    duplicateCarNoInRace += carNos.length - new Set(carNos).size;
    duplicateRegistrationNoInRace +=
      registrationNos.length - new Set(registrationNos).size;
  }
  const nonStarterFieldChangedCount =
    array(history.items).filter((race, index) =>
      JSON.stringify(stripStarterChanges(race))
      !== JSON.stringify(stripStarterChanges(races[index])),
    ).length;
  return {
    candidateRaceCount: races.length,
    candidateStarterTotal: starters.length,
    candidateRegistrationNoCount:
      starters.filter((starter) => clean(starter.registrationNo)).length,
    candidateMissingRegistrationNoCount:
      starters.filter((starter) => !clean(starter.registrationNo)).length,
    duplicateCarNoInRace,
    duplicateRegistrationNoInRace,
    nonStarterFieldChangedCount,
    candidatePayloadHash: hashPayload(candidate),
    candidateBytes: jsonBytes(candidate),
  };
}

async function buildRecord({ date, validation, preflight }) {
  const historyPath = validation.historyDailyPath;
  const history = historyPath && existsSync(abs(historyPath))
    ? JSON.parse(await readFile(abs(historyPath), "utf8"))
    : null;
  const existingHistoryMode = classifyMode(history);
  const existingStarterTotal =
    array(history?.items).reduce(
      (total, race) => total + array(race.starters).length,
      0,
    );
  const blockReasons = [];
  const warnings = [];
  let candidate = null;
  let candidateMode = "BLOCKED";
  let candidateBuildAllowed = false;
  let candidateChangeType = "BLOCKED";
  let sourceIdentityConflictPreservedExisting = false;
  let candidateNextAction = null;
  let identityComparison = {
    matches: false,
    mismatchCount: 0,
    mismatchPreview: [],
  };

  if (preflight.writerDecision === "ALLOW_EXACT_DAILY_WRITE") {
    const sourceRows = await parseValidatedSourceRows(validation);
    const sourceGroups = groupRowsByRace(sourceRows);
    const sourceComplete = Boolean(
      history
      && sourceRows.length === preflight.expectedWriterInputContract.validatedStarterRows
      && sourceGroups.size === preflight.expectedWriterInputContract.validatedRaceRows
      && sourceRows.every((row) => clean(row.starter.registrationNo))
      && sourceGroups.size === array(history.items).length,
    );
    if (!sourceComplete) {
      blockReasons.push("VALIDATED_SOURCE_ROWS_DO_NOT_COVER_HISTORY");
    } else {
      identityComparison =
        compareExistingIdentityToSource(history, sourceGroups);
      const existingExactComplete = Boolean(
        existingHistoryMode === "STARTERS_PARSED"
        && existingStarterTotal
          === preflight.expectedWriterInputContract.validatedStarterRows
        && array(history.items).every((race) =>
          array(race.starters).every((starter) => clean(starter.registrationNo)),
        ),
      );
      const identitiesAlreadyMatch = identityComparison.matches;
      sourceIdentityConflictPreservedExisting =
        existingExactComplete && !identitiesAlreadyMatch;
      candidate = existingExactComplete
        ? structuredClone(history)
        : identitiesAlreadyMatch
          ? structuredClone(history)
          : buildExactCandidate(history, sourceGroups);
      candidateBuildAllowed = true;
      candidateMode = "STARTERS_PARSED";
      candidateChangeType = existingExactComplete || identitiesAlreadyMatch
        ? "NO_CHANGE"
        : existingHistoryMode === "NO_STARTERS"
          ? "NO_STARTERS_TO_STARTERS_BACKFILL"
          : "EXACT_REFRESH";
      if (sourceIdentityConflictPreservedExisting) {
        warnings.push(
          `${identityComparison.mismatchCount} source identity conflict(s) detected; existing authoritative history was preserved unchanged.`,
        );
        candidateNextAction =
          "Reconcile conflicting registrationNo source rows before any exact refresh.";
      }
      if (candidateChangeType === "NO_STARTERS_TO_STARTERS_BACKFILL") {
        warnings.push("Candidate is a future backfill candidate; no public history write was performed.");
      }
    }
  } else if (preflight.writerDecision === "ALLOW_RACE_ONLY_NO_STARTERS_WRITE") {
    if (history && existingHistoryMode === "NO_STARTERS") {
      candidate = structuredClone(history);
      candidateBuildAllowed = true;
      candidateMode = "RACE_ONLY_NO_STARTERS";
      candidateChangeType = "NO_CHANGE";
    } else {
      blockReasons.push("RACE_ONLY_HISTORY_NOT_AVAILABLE");
    }
  } else if (
    preflight.writerDecision
    === "BLOCK_EXACT_WRITE_ALLOW_PARTIAL_WITH_HUMAN_CONFIRMATION"
  ) {
    blockReasons.push("PARTIAL_CANDIDATE_BUILD_NOT_AUTHORIZED_IN_THIS_STEP");
    warnings.push("Partial writer requires a separate human-confirmed task.");
  } else if (preflight.writerDecision === "BLOCK_WRITE_MANUAL_REVIEW_REQUIRED") {
    blockReasons.push("MANUAL_REVIEW_REQUIRED", "SAME_NAME_AUTO_MERGE_PROHIBITED");
  } else if (preflight.writerDecision === "BLOCK_WRITE_TRUST_GATE_REQUIRED") {
    blockReasons.push("REGISTRATIONNO_TRUST_GATE_REQUIRED");
    if (Number(validation.knownBadRawRegistrationNoCount ?? 0) > 0) {
      blockReasons.push("KNOWN_BAD_RAW_REGISTRATIONNO_DETECTED");
    }
    if (Number(validation.rawOnlyNeedsTrustConfirmationCount ?? 0) > 0) {
      blockReasons.push("RAW_ONLY_NEEDS_TRUST_CONFIRMATION");
    }
  } else {
    blockReasons.push("PREFLIGHT_BLOCKED_WRITE");
  }

  const integrity = candidate
    ? candidateIntegrity(history, candidate)
    : {
        candidateRaceCount: 0,
        candidateStarterTotal: 0,
        candidateRegistrationNoCount: 0,
        candidateMissingRegistrationNoCount: 0,
        duplicateCarNoInRace: 0,
        duplicateRegistrationNoInRace: 0,
        nonStarterFieldChangedCount: 0,
        candidatePayloadHash: null,
        candidateBytes: 0,
      };
  const fakeGeneratedIdentityDetected = Boolean(validation.fakeGeneratedIdentityDetected);
  const fuzzyMatchingDetected = Boolean(validation.fuzzyMatchingDetected);
  const prohibitedSourceUseDetected = Boolean(validation.prohibitedSourceUseDetected);
  const safetyFailure = Boolean(
    integrity.duplicateCarNoInRace
    || integrity.duplicateRegistrationNoInRace
    || integrity.candidateMissingRegistrationNoCount
    || integrity.nonStarterFieldChangedCount
    || fakeGeneratedIdentityDetected
    || fuzzyMatchingDetected
    || prohibitedSourceUseDetected,
  );
  if (candidateBuildAllowed && safetyFailure) {
    candidateBuildAllowed = false;
    candidate = null;
    candidateMode = "BLOCKED";
    candidateChangeType = "BLOCKED";
    blockReasons.push("CANDIDATE_INTEGRITY_CHECK_FAILED");
  }

  return {
    date,
    preflightDecision: preflight.writerDecision,
    candidateBuildAllowed,
    candidateBuildBlocked: !candidateBuildAllowed,
    candidateMode,
    existingHistoryMode,
    existingRaceCount: array(history?.items).length,
    existingStarterTotal,
    candidateRaceCount: integrity.candidateRaceCount,
    candidateStarterTotal: integrity.candidateStarterTotal,
    candidateRegistrationNoCount: integrity.candidateRegistrationNoCount,
    candidateMissingRegistrationNoCount:
      integrity.candidateMissingRegistrationNoCount,
    duplicateCarNoInRace: integrity.duplicateCarNoInRace,
    duplicateRegistrationNoInRace: integrity.duplicateRegistrationNoInRace,
    sameNameManualReviewRequired:
      Number(validation.sameNameManualReviewRequired ?? 0),
    registrationNoTrustStatusCounts:
      validation.registrationNoTrustStatusCounts ?? {},
    registrationNoTrustedRows:
      Number(validation.registrationNoTrustedRows ?? 0),
    registrationNoTrustBlockedRows:
      Number(validation.registrationNoTrustBlockedRows ?? 0),
    knownBadRawRegistrationNoCount:
      Number(validation.knownBadRawRegistrationNoCount ?? 0),
    rawOnlyNeedsTrustConfirmationCount:
      Number(validation.rawOnlyNeedsTrustConfirmationCount ?? 0),
    conflictWithAuthoritativeHistoryCount:
      Number(validation.conflictWithAuthoritativeHistoryCount ?? 0),
    trustGateBlocked: Boolean(validation.trustGateBlocked),
    fakeGeneratedIdentityDetected,
    fuzzyMatchingDetected,
    prohibitedSourceUseDetected,
    predictionUsedAsStarterSource:
      Boolean(validation.predictionUsedAsStarterSource),
    resultUsedAsStarterSource: Boolean(validation.resultUsedAsStarterSource),
    reviewUsedAsStarterSource: Boolean(validation.reviewUsedAsStarterSource),
    candidateWouldChangeExistingHistory:
      Boolean(candidate && JSON.stringify(candidate) !== JSON.stringify(history)),
    candidateChangeType,
    sourceIdentityConflictPreservedExisting,
    existingSourceIdentityMismatchCount: identityComparison.mismatchCount,
    existingSourceIdentityMismatchPreview: identityComparison.mismatchPreview,
    candidatePayloadHash: integrity.candidatePayloadHash,
    candidateBytes: integrity.candidateBytes,
    nonStarterFieldChangedCount: integrity.nonStarterFieldChangedCount,
    writePerformed: false,
    outputPath: null,
    blockReasons: [...new Set(blockReasons)],
    warnings: [...new Set(warnings)],
    nextAction:
      candidateNextAction
      ?? (candidateBuildAllowed
        ? "Retain this in-memory candidate for a later immutable-manifest writer dry-run."
        : "Do not build or write a candidate until preflight permits the requested mode."),
  };
}

function print(label, value) {
  console.log(`[${label}]`);
  console.log(JSON.stringify(value, null, 2));
}

export async function auditKurariExDailyWriterDryRunCandidateBuilder({
  argv = process.argv.slice(2),
  printOutput = true,
} = {}) {
  const failures = [];
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
    options = { date: null, sourceDir: null, writerMode: null, dryRun: true };
  }
  const validationArgv = [];
  if (options.date) validationArgv.push("--date", options.date);
  if (options.sourceDir) validationArgv.push("--source-dir", options.sourceDir);
  const preflightArgv = [...validationArgv];
  if (options.writerMode) preflightArgv.push("--writer-mode", options.writerMode);

  const validation = await auditKurariExDailyIngestionValidationGate({
    argv: validationArgv,
    printOutput: false,
  });
  const preflight = await auditKurariExDailyWriterPreflightBridge({
    argv: preflightArgv,
    printOutput: false,
  });
  const validationByDate =
    new Map(validation.dailyIngestionValidationResult.map((record) => [record.targetDate, record]));
  const preflightByDate =
    new Map(preflight.writerPreflightRecord.map((record) => [record.date, record]));
  const dates = options.date ? [options.date] : REPRESENTATIVE_DATES;
  const dryRunCandidateRecord = [];
  for (const date of dates) {
    const validationRecord = validationByDate.get(date);
    const preflightRecord = preflightByDate.get(date);
    if (!validationRecord || !preflightRecord) {
      failures.push(`${date}: validation or preflight record missing`);
      continue;
    }
    dryRunCandidateRecord.push(await buildRecord({
      date,
      validation: validationRecord,
      preflight: preflightRecord,
    }));
  }

  const allowed = dryRunCandidateRecord.filter((record) => record.candidateBuildAllowed);
  const unsafeTrustGateAllows =
    dryRunCandidateRecord.filter((record) =>
      record.trustGateBlocked && record.candidateBuildAllowed,
    );
  if (unsafeTrustGateAllows.length) {
    failures.push(
      `Trust-gate blocked candidate was allowed: ${unsafeTrustGateAllows.map((record) => record.date).join(",")}`,
    );
  }
  const integrityFailures =
    allowed.filter((record) =>
      record.duplicateCarNoInRace
      || record.duplicateRegistrationNoInRace
      || record.candidateMissingRegistrationNoCount
      || record.nonStarterFieldChangedCount
      || record.fakeGeneratedIdentityDetected
      || record.fuzzyMatchingDetected
      || record.prohibitedSourceUseDetected,
    );
  if (integrityFailures.length) failures.push("Allowed candidate integrity failure detected");

  const warningCount =
    dryRunCandidateRecord.filter((record) =>
      record.warnings.length || record.candidateBuildBlocked,
    ).length;
  const finalStatus = failures.length
    ? "DAILY_WRITER_DRY_RUN_CANDIDATE_BUILDER_FAIL"
    : warningCount
      ? "DAILY_WRITER_DRY_RUN_CANDIDATE_BUILDER_COMPLETED_WITH_WARNINGS"
      : "DAILY_WRITER_DRY_RUN_CANDIDATE_BUILDER_COMPLETED";
  const dryRunCandidateSummary = {
    checkedDateCount: dryRunCandidateRecord.length,
    candidateBuildAllowedCount: allowed.length,
    candidateBuildBlockedCount:
      dryRunCandidateRecord.length - allowed.length,
    exactCandidateCount:
      allowed.filter((record) => record.candidateMode === "STARTERS_PARSED").length,
    raceOnlyCandidateCount:
      allowed.filter((record) => record.candidateMode === "RACE_ONLY_NO_STARTERS").length,
    partialBlockedCount:
      dryRunCandidateRecord.filter((record) =>
        record.preflightDecision
        === "BLOCK_EXACT_WRITE_ALLOW_PARTIAL_WITH_HUMAN_CONFIRMATION",
      ).length,
    manualReviewBlockedCount:
      dryRunCandidateRecord.filter((record) =>
        record.preflightDecision === "BLOCK_WRITE_MANUAL_REVIEW_REQUIRED",
      ).length,
    noStartersToStartersBackfillCandidateCount:
      allowed.filter((record) =>
        record.candidateChangeType === "NO_STARTERS_TO_STARTERS_BACKFILL",
      ).length,
    trustGateBlockedCount:
      dryRunCandidateRecord.filter((record) => record.trustGateBlocked).length,
    duplicateCount:
      allowed.reduce(
        (sum, record) =>
          sum + record.duplicateCarNoInRace + record.duplicateRegistrationNoInRace,
        0,
      ),
    fakeGeneratedCount:
      allowed.filter((record) => record.fakeGeneratedIdentityDetected).length,
    prohibitedSourceUseCount:
      allowed.filter((record) => record.prohibitedSourceUseDetected).length,
    writePerformed: false,
    failures,
    finalStatus,
  };
  if (printOutput) {
    print("dryRunCandidateSummary", dryRunCandidateSummary);
    print("dryRunCandidateRecord", dryRunCandidateRecord);
    console.log(finalStatus);
    if (failures.length) process.exitCode = 1;
  }
  return { dryRunCandidateSummary, dryRunCandidateRecord };
}

const isMain =
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) await auditKurariExDailyWriterDryRunCandidateBuilder();
