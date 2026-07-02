import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  auditKurariExDailyIngestionValidationGate,
} from "./audit-kurari-ex-daily-ingestion-validation-gate.mjs";

const ROOT = process.cwd();
const WRITER_MODES = new Set(["exact", "partial", "race-only", "no-write"]);
const WRITER_DECISIONS = [
  "ALLOW_EXACT_DAILY_WRITE",
  "ALLOW_RACE_ONLY_NO_STARTERS_WRITE",
  "BLOCK_EXACT_WRITE_ALLOW_PARTIAL_WITH_HUMAN_CONFIRMATION",
  "BLOCK_WRITE_MANUAL_REVIEW_REQUIRED",
  "BLOCK_WRITE",
];

function abs(file) {
  return path.isAbsolute(file) ? file : path.resolve(ROOT, file);
}

function parseArgs(argv) {
  const options = {
    date: null,
    sourceDir: null,
    validationResult: null,
    writerMode: "no-write",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--date") options.date = argv[++index] ?? null;
    else if (argument === "--source-dir") options.sourceDir = argv[++index] ?? null;
    else if (argument === "--validation-result") options.validationResult = argv[++index] ?? null;
    else if (argument === "--writer-mode") options.writerMode = argv[++index] ?? null;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (options.date && !/^\d{4}-\d{2}-\d{2}$/u.test(options.date)) {
    throw new Error(`Invalid --date: ${options.date}`);
  }
  if (options.sourceDir && !options.date && !options.validationResult) {
    throw new Error("--source-dir requires --date or --validation-result");
  }
  if (!WRITER_MODES.has(options.writerMode)) {
    throw new Error(`Invalid --writer-mode: ${options.writerMode}`);
  }
  return options;
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

async function aggregateSourceHash(files) {
  const entries = [];
  for (const file of [...files].sort()) {
    if (!existsSync(abs(file))) continue;
    const buffer = await readFile(abs(file));
    entries.push({ file, hash: sha256(buffer) });
  }
  return entries.length ? sha256(JSON.stringify(entries)) : null;
}

async function countValidatedRaceRows(files) {
  const raceKeys = new Set();
  for (const file of files) {
    if (!existsSync(abs(file))) continue;
    const venueKey =
      path.basename(file).replace(/-(prediction|summary)\.(txt|md)$/iu, "");
    const content = await readFile(abs(file), "utf8");
    let raceNumber = null;
    for (const rawLine of content.split(/\r?\n/u)) {
      const line = String(rawLine).normalize("NFKC").trim();
      const match = line.match(/^■\s*.+?\s+(\d{1,2})R\b/u);
      if (match) {
        raceNumber = Number(match[1]);
        continue;
      }
      if (raceNumber && /^【出走表】$/u.test(line)) {
        raceKeys.add(`${venueKey}:${raceNumber}`);
      }
    }
  }
  return raceKeys.size;
}

function validationRecordsFromJson(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.dailyIngestionValidationResult)) {
    return payload.dailyIngestionValidationResult;
  }
  if (payload?.validationDecision) return [payload];
  return [];
}

async function loadValidationRecords(options) {
  if (options.validationResult) {
    if (!existsSync(abs(options.validationResult))) {
      throw new Error(`Validation result not found: ${options.validationResult}`);
    }
    const payload = JSON.parse(await readFile(abs(options.validationResult), "utf8"));
    const records = validationRecordsFromJson(payload);
    return options.date
      ? records.filter((record) => record.targetDate === options.date)
      : records;
  }
  const validationArgv = [];
  if (options.date) validationArgv.push("--date", options.date);
  if (options.sourceDir) validationArgv.push("--source-dir", options.sourceDir);
  const validation = await auditKurariExDailyIngestionValidationGate({
    argv: validationArgv,
    printOutput: false,
  });
  return validation.dailyIngestionValidationResult;
}

function hasSafetyViolation(record) {
  return Boolean(
    record.duplicateCarNoInRace
    || record.duplicateRegistrationNoInRace
    || record.fakeGeneratedIdentityDetected
    || record.fuzzyMatchingDetected
    || record.prohibitedSourceUseDetected
    || record.invalidSourceRows
  );
}

function writerModeMatches(requestedMode, writerModeAllowed) {
  if (requestedMode === "no-write") return true;
  if (requestedMode === "exact") return writerModeAllowed === "exact";
  if (requestedMode === "race-only") return writerModeAllowed === "race-only";
  return writerModeAllowed === "partial-with-confirmation";
}

async function bridgeRecord(validation, options) {
  const sourceFiles =
    Array.isArray(validation.selectedEntryTableFiles)
      ? validation.selectedEntryTableFiles
      : Array.isArray(validation.sourceFiles) ? validation.sourceFiles : [];
  const validatedStarterRows =
    Math.max(
      0,
      Number(validation.sourceRowsDetected ?? 0)
      - Number(validation.invalidSourceRows ?? 0),
    );
  const validatedRaceRows = await countValidatedRaceRows(sourceFiles);
  const sourceHash = await aggregateSourceHash(sourceFiles);
  const blockReasons = [...(validation.blockReasons ?? [])];
  const warnings = [...(validation.warnings ?? [])];
  const safetyViolation = hasSafetyViolation(validation);
  let writerDecision;
  let writerModeAllowed;
  let nextAction;
  let invariantFailure = false;

  if (validation.validationDecision === "PASS_READY_FOR_DAILY_WRITE") {
    const exactInvariant = Boolean(
      !safetyViolation
      && validation.startersDetected > 0
      && validation.startersWithRegistrationNo === validation.startersDetected
      && validation.startersMissingRegistrationNo === 0
      && validation.sameNameManualReviewRequired === 0
      && validation.futureRegistrationNoContractValidation === "PASS"
      && validatedRaceRows > 0
      && sourceHash,
    );
    if (exactInvariant) {
      writerDecision = "ALLOW_EXACT_DAILY_WRITE";
      writerModeAllowed = "exact";
      nextAction = "Pass the immutable preflight contract to a separate exact daily writer.";
    } else {
      writerDecision = "BLOCK_WRITE";
      writerModeAllowed = "blocked";
      blockReasons.push("PASS_READY_INVARIANT_VIOLATION");
      nextAction = "Do not write; repair validation/preflight invariant mismatch.";
      invariantFailure = true;
    }
  } else if (validation.validationDecision === "PASS_RACE_ONLY_NO_STARTERS") {
    const raceOnlyInvariant = Boolean(
      !safetyViolation
      && validation.startersDetected === 0
      && validation.noStartersAllowed
      && validatedRaceRows > 0,
    );
    if (raceOnlyInvariant) {
      writerDecision = "ALLOW_RACE_ONLY_NO_STARTERS_WRITE";
      writerModeAllowed = "race-only";
      nextAction = "Pass only validated race rows; starter generation remains prohibited.";
    } else {
      writerDecision = "BLOCK_WRITE";
      writerModeAllowed = "blocked";
      blockReasons.push("RACE_ONLY_INVARIANT_VIOLATION");
      nextAction = "Do not write; race-only prerequisites are incomplete.";
      invariantFailure = true;
    }
  } else if (validation.validationDecision === "WARN_PARTIAL_REGISTRATION_NO") {
    const partialInvariant = Boolean(
      !safetyViolation
      && validation.startersDetected > 0
      && validation.startersMissingRegistrationNo > 0,
    );
    if (partialInvariant) {
      writerDecision = "BLOCK_EXACT_WRITE_ALLOW_PARTIAL_WITH_HUMAN_CONFIRMATION";
      writerModeAllowed = "partial-with-confirmation";
      blockReasons.push("EXACT_WRITE_BLOCKED_REGISTRATION_NO_MISSING");
      warnings.push("Partial writer requires explicit human confirmation in a separate write step.");
      nextAction = "Keep missing registrationNo null; obtain human confirmation before a partial writer.";
    } else {
      writerDecision = "BLOCK_WRITE";
      writerModeAllowed = "blocked";
      blockReasons.push("PARTIAL_INVARIANT_VIOLATION");
      nextAction = "Do not write; repair validation/preflight invariant mismatch.";
      invariantFailure = true;
    }
  } else if (validation.validationDecision === "WARN_MANUAL_REVIEW_REQUIRED") {
    writerDecision = "BLOCK_WRITE_MANUAL_REVIEW_REQUIRED";
    writerModeAllowed = "blocked";
    blockReasons.push("MANUAL_REVIEW_REQUIRED", "SAME_NAME_AUTO_MERGE_PROHIBITED");
    nextAction = "Resolve ambiguous identity with authoritative evidence, then rerun validation.";
  } else if (String(validation.validationDecision).startsWith("STOP_")) {
    writerDecision = "BLOCK_WRITE";
    writerModeAllowed = "blocked";
    blockReasons.push("VALIDATION_GATE_STOP");
    nextAction = "Do not write; resolve every validation STOP reason and rerun the gate.";
  } else {
    writerDecision = "BLOCK_WRITE";
    writerModeAllowed = "blocked";
    blockReasons.push("UNKNOWN_VALIDATION_DECISION");
    nextAction = "Do not write; unsupported validation decision.";
    invariantFailure = true;
  }

  const requestedWriterModeAllowed =
    writerModeMatches(options.writerMode, writerModeAllowed);
  if (!requestedWriterModeAllowed) {
    warnings.push(`Requested writer mode ${options.writerMode} is not allowed by preflight.`);
  }
  const exactDailyWriteAllowed = writerModeAllowed === "exact";
  const raceOnlyWriteAllowed = writerModeAllowed === "race-only";
  const partialWriteAllowedWithHumanConfirmation =
    writerModeAllowed === "partial-with-confirmation";
  const blocked = writerModeAllowed === "blocked";
  return {
    date: validation.targetDate,
    validationDecision: validation.validationDecision,
    writerDecision,
    writerModeAllowed,
    requestedWriterMode: options.writerMode,
    requestedWriterModeAllowed,
    dailyWriteAllowed: exactDailyWriteAllowed || raceOnlyWriteAllowed,
    exactDailyWriteAllowed,
    raceOnlyWriteAllowed,
    partialWriteAllowedWithHumanConfirmation,
    blocked,
    requiredHumanConfirmation: partialWriteAllowedWithHumanConfirmation,
    blockReasons: [...new Set(blockReasons)],
    warnings: [...new Set(warnings)],
    expectedWriterInputContract: {
      date: validation.targetDate,
      sourceDir: options.sourceDir ?? validation.sourceDir ?? null,
      sourceHash,
      sourceFiles,
      validatedStarterRows,
      validatedRaceRows,
      validationDecision: validation.validationDecision,
      writerDecision,
    },
    nextAction,
    invariantFailure,
    writePerformed: false,
  };
}

function countByDecision(records) {
  return Object.fromEntries(
    WRITER_DECISIONS.map((decision) => [
      decision,
      records.filter((record) => record.writerDecision === decision).length,
    ]),
  );
}

function print(label, value) {
  console.log(`[${label}]`);
  console.log(JSON.stringify(value, null, 2));
}

export async function auditKurariExDailyWriterPreflightBridge({
  argv = process.argv.slice(2),
  printOutput = true,
} = {}) {
  const failures = [];
  let options;
  let validationRecords = [];
  try {
    options = parseArgs(argv);
    validationRecords = await loadValidationRecords(options);
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
    options = { writerMode: "no-write", sourceDir: null };
  }
  if (!validationRecords.length && !failures.length) {
    failures.push("No validation result records were available for preflight");
  }

  const writerPreflightRecord = [];
  for (const validation of validationRecords) {
    writerPreflightRecord.push(await bridgeRecord(validation, options));
  }
  const decisionCounts = countByDecision(writerPreflightRecord);
  const invariantFailureCount =
    writerPreflightRecord.filter((record) => record.invariantFailure).length;
  if (invariantFailureCount) {
    failures.push(`${invariantFailureCount} validation/preflight invariant failure(s)`);
  }
  const warningCount =
    writerPreflightRecord.filter((record) =>
      record.warnings.length
      || record.requiredHumanConfirmation
      || record.blocked,
    ).length;
  const finalStatus = failures.length
    ? "DAILY_WRITER_PREFLIGHT_BRIDGE_FAIL"
    : warningCount
      ? "DAILY_WRITER_PREFLIGHT_BRIDGE_COMPLETED_WITH_WARNINGS"
      : "DAILY_WRITER_PREFLIGHT_BRIDGE_COMPLETED";
  const writerPreflightSummary = {
    checkedDateCount: writerPreflightRecord.length,
    allowExactDailyWriteCount: decisionCounts.ALLOW_EXACT_DAILY_WRITE,
    allowRaceOnlyNoStartersWriteCount:
      decisionCounts.ALLOW_RACE_ONLY_NO_STARTERS_WRITE,
    allowPartialWithHumanConfirmationCount:
      decisionCounts.BLOCK_EXACT_WRITE_ALLOW_PARTIAL_WITH_HUMAN_CONFIRMATION,
    blockManualReviewRequiredCount:
      decisionCounts.BLOCK_WRITE_MANUAL_REVIEW_REQUIRED,
    blockStopCount:
      writerPreflightRecord.filter((record) =>
        String(record.validationDecision).startsWith("STOP_"),
      ).length,
    blockedCount:
      writerPreflightRecord.filter((record) => record.blocked).length,
    writePerformed: false,
    failures,
    finalStatus,
  };
  if (printOutput) {
    print("writerPreflightSummary", writerPreflightSummary);
    print("writerPreflightRecord", writerPreflightRecord);
    console.log(finalStatus);
    if (failures.length) process.exitCode = 1;
  }
  return { writerPreflightSummary, writerPreflightRecord };
}

const isMain =
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) await auditKurariExDailyWriterPreflightBridge();
