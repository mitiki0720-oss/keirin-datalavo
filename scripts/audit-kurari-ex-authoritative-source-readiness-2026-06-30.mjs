import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  auditKurariExDailyIngestionValidationGate,
} from "./audit-kurari-ex-daily-ingestion-validation-gate.mjs";
import {
  auditKurariExDailyWriterPreflightBridge,
} from "./audit-kurari-ex-daily-writer-preflight-bridge.mjs";

const ROOT = process.cwd();
const TARGET_DATE = "2026-06-30";
const RAW_DIR = "private-input/kurari-ex/raw/2026-06-30";
const INDEX_PATH =
  "public/data/analytics/kurari-ex/history/index.generated.json";
const HISTORY_PATH =
  "public/data/analytics/kurari-ex/history/daily/2026-06/2026-06-30.generated.json";
const SNAPSHOT_PATH =
  "public/data/races/entries-history/2026-06-30/keirin-jp-entries.generated.json";
const EXPECTED_INDEX_PAYLOAD_HASH =
  "sha256:683fd01dea2e0e5f272d35eff42bde236ba326954e857feaa9dec04f77cb3acb";
const EXPECTED_HISTORY_FILE_HASH =
  "sha256:cd2877c08bc14ca931d858c11fe0008c1c230642fa6b95482eb5d77456d1426c";

function abs(file) {
  return path.isAbsolute(file) ? file : path.resolve(ROOT, file);
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function payloadHash(value) {
  return sha256(JSON.stringify(value));
}

async function sourceManifest(files) {
  const manifest = [];
  for (const file of [...files].sort()) {
    const buffer = await readFile(abs(file));
    manifest.push({ file, bytes: buffer.length, hash: sha256(buffer) });
  }
  return {
    files: manifest,
    aggregateHash: sha256(JSON.stringify(manifest)),
  };
}

function print(label, value) {
  console.log(`[${label}]`);
  console.log(JSON.stringify(value, null, 2));
}

export async function auditKurariExAuthoritativeSourceReadiness20260630({
  printOutput = true,
} = {}) {
  const failures = [];
  const warnings = [];
  for (const file of [INDEX_PATH, HISTORY_PATH]) {
    if (!existsSync(abs(file))) failures.push(`missing required input: ${file}`);
  }
  if (!existsSync(abs(RAW_DIR))) {
    failures.push(`missing raw source directory: ${RAW_DIR}`);
  }
  if (failures.length) {
    const summary = {
      targetDate: TARGET_DATE,
      writePerformed: false,
      failures,
      warnings,
      finalStatus: "AUTHORITATIVE_SOURCE_READINESS_AUDIT_FAIL",
    };
    const result = {
      authoritativeSourceReadinessSummary: summary,
      authoritativeSourceReadinessRecord: null,
    };
    if (printOutput) {
      print("authoritativeSourceReadinessSummary", summary);
      console.log(summary.finalStatus);
      process.exitCode = 1;
    }
    return result;
  }

  const indexBuffer = await readFile(abs(INDEX_PATH));
  const index = JSON.parse(indexBuffer.toString("utf8"));
  const historyBuffer = await readFile(abs(HISTORY_PATH));
  const history = JSON.parse(historyBuffer.toString("utf8"));
  const validation = await auditKurariExDailyIngestionValidationGate({
    argv: ["--date", TARGET_DATE, "--source-dir", RAW_DIR],
    printOutput: false,
  });
  const preflight = await auditKurariExDailyWriterPreflightBridge({
    argv: ["--date", TARGET_DATE, "--source-dir", RAW_DIR],
    printOutput: false,
  });
  const validationRecord = validation.dailyIngestionValidationResult[0];
  const preflightRecord = preflight.writerPreflightRecord[0];
  const manifest = await sourceManifest(
    validationRecord?.selectedEntryTableFiles ?? [],
  );
  const expectedRaceCount = 76;
  const expectedStarterCount = 551;
  const existingRaceCount = history.items?.length ?? 0;
  const existingStarterCount = (history.items ?? []).reduce(
    (sum, race) => sum + (race.starters?.length ?? 0),
    0,
  );
  const rawStarterRows = Number(validationRecord?.sourceRowsDetected ?? 0);
  const registrationNoRows =
    Number(validationRecord?.startersWithRegistrationNo ?? 0);
  const trustedRows =
    Number(validationRecord?.registrationNoTrustedRows ?? 0);
  const rawOnlyRows =
    Number(validationRecord?.rawOnlyNeedsTrustConfirmationCount ?? 0);
  const untrustedRows =
    Number(validationRecord?.registrationNoTrustBlockedRows ?? 0);
  const duplicateCarNoCount =
    Number(validationRecord?.duplicateCarNoInRace ?? 0);
  const duplicateRegistrationNoCount =
    Number(validationRecord?.duplicateRegistrationNoInRace ?? 0);
  const duplicateCount =
    duplicateCarNoCount + duplicateRegistrationNoCount;
  const knownBadCount =
    Number(validationRecord?.knownBadRawRegistrationNoCount ?? 0);
  const conflictCount =
    Number(validationRecord?.conflictWithAuthoritativeHistoryCount ?? 0);
  const manualReviewCount =
    Number(validationRecord?.sameNameManualReviewRequired ?? 0);
  const authoritativeSnapshotExists = existsSync(abs(SNAPSHOT_PATH));
  const trustedSnapshotRows = Number(
    validationRecord?.registrationNoTrustStatusCounts
      ?.TRUSTED_AUTHORITATIVE_SNAPSHOT_MATCH ?? 0,
  );
  const trustedProvenanceRows = Number(
    validationRecord?.registrationNoTrustStatusCounts
      ?.TRUSTED_PROVENANCE_HASH_MATCH ?? 0,
  );
  const authoritativeSnapshotHashMatched = Boolean(
    authoritativeSnapshotExists
    && validationRecord?.authoritativeSnapshotHash
    && trustedSnapshotRows === expectedStarterCount,
  );
  const provenanceHashMatched =
    trustedProvenanceRows === expectedStarterCount;
  const canProceedToBackfillDryRun = Boolean(
    authoritativeSnapshotExists
    && authoritativeSnapshotHashMatched
    && trustedRows === expectedStarterCount
    && untrustedRows === 0
    && duplicateCount === 0
    && knownBadCount === 0
    && conflictCount === 0
    && manualReviewCount === 0,
  );
  const conclusion = canProceedToBackfillDryRun
    ? "READY_FOR_SEPARATE_BACKFILL_DRY_RUN"
    : "BLOCKED_RAW_ONLY_NEEDS_TRUST_CONFIRMATION";

  if (
    payloadHash(index) !== EXPECTED_INDEX_PAYLOAD_HASH
    || indexBuffer.length !== 14079
    || index.items?.length !== 58
    || index.dayCount !== 58
    || index.raceCount !== 4373
    || index.items?.at(-1)?.date !== "2026-07-01"
  ) failures.push("history index baseline changed");
  if (
    sha256(historyBuffer) !== EXPECTED_HISTORY_FILE_HASH
    || historyBuffer.length !== 207708
  ) failures.push("2026-06-30 history daily baseline changed");
  if (
    validationRecord?.historyMode !== "NO_STARTERS"
    || existingRaceCount !== expectedRaceCount
    || existingStarterCount !== 0
  ) failures.push("existing 2026-06-30 history mode/count changed");
  if (
    rawStarterRows !== expectedStarterCount
    || registrationNoRows !== expectedStarterCount
    || Number(preflightRecord?.expectedWriterInputContract?.validatedRaceRows)
      !== expectedRaceCount
  ) failures.push("raw 76R/551 starter contract changed");
  if (
    duplicateCount
    || knownBadCount
    || conflictCount
    || manualReviewCount
  ) failures.push("source safety count is non-zero");
  if (!authoritativeSnapshotExists) {
    warnings.push(
      "No same-date authoritative entry snapshot exists for 2026-06-30.",
    );
  }
  if (rawOnlyRows) {
    warnings.push(
      `${rawOnlyRows} registrationNo rows remain raw-only and cannot authorize a backfill dry-run.`,
    );
  }
  if (
    authoritativeSnapshotExists
    && trustedSnapshotRows === expectedStarterCount
    && !canProceedToBackfillDryRun
  ) failures.push("authoritative snapshot is complete but readiness stayed blocked");
  if (
    !authoritativeSnapshotExists
    && (
      canProceedToBackfillDryRun
      || trustedRows !== 0
      || rawOnlyRows !== expectedStarterCount
      || untrustedRows !== expectedStarterCount
      || conclusion !== "BLOCKED_RAW_ONLY_NEEDS_TRUST_CONFIRMATION"
    )
  ) failures.push("raw-only block invariant failed");

  const finalStatus = failures.length
    ? "AUTHORITATIVE_SOURCE_READINESS_AUDIT_FAIL"
    : warnings.length
      ? "AUTHORITATIVE_SOURCE_READINESS_AUDIT_COMPLETED_WITH_WARNINGS"
      : "AUTHORITATIVE_SOURCE_READINESS_AUDIT_COMPLETED";
  const record = {
    date: TARGET_DATE,
    expectedRaceCount,
    expectedStarterCount,
    existingHistoryMode: validationRecord.historyMode,
    existingRaceCount,
    existingStarterCount,
    rawStarterRows,
    registrationNoRows,
    trustedRows,
    rawOnlyRows,
    untrustedRows,
    authoritativeSnapshotPath: SNAPSHOT_PATH,
    authoritativeSnapshotExists,
    authoritativeSnapshotHash:
      validationRecord.authoritativeSnapshotHash ?? null,
    authoritativeSnapshotHashMatched,
    provenanceHashMatched,
    rawSourceManifestFileCount: manifest.files.length,
    rawSourceAggregateHash: manifest.aggregateHash,
    duplicateCarNoCount,
    duplicateRegistrationNoCount,
    duplicateCount,
    knownBadCount,
    conflictCount,
    manualReviewCount,
    validationDecision: validationRecord.validationDecision,
    preflightDecision: preflightRecord.writerDecision,
    canProceedToBackfillDryRun,
    canProceedToBackfillWrite: false,
    writePerformed: false,
    conclusion,
  };
  const summary = {
    targetDate: TARGET_DATE,
    expectedRaceCount,
    expectedStarterCount,
    rawStarterRows,
    trustedRows,
    rawOnlyRows,
    untrustedRows,
    authoritativeSnapshotExists,
    authoritativeSnapshotHashMatched,
    provenanceHashMatched,
    duplicateCount,
    knownBadCount,
    conflictCount,
    manualReviewCount,
    canProceedToBackfillDryRun,
    canProceedToBackfillWrite: false,
    writePerformed: false,
    conclusion,
    failures,
    warnings,
    finalStatus,
  };
  const result = {
    authoritativeSourceReadinessSummary: summary,
    authoritativeSourceReadinessRecord: record,
  };
  if (printOutput) {
    print("authoritativeSourceReadinessSummary", summary);
    print("authoritativeSourceReadinessRecord", record);
    console.log(finalStatus);
    if (failures.length) process.exitCode = 1;
  }
  return result;
}

const isMain =
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) await auditKurariExAuthoritativeSourceReadiness20260630();
