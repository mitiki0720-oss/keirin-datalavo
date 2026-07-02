import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  auditKurariExAuthoritativeSourceReadiness20260630,
} from "./audit-kurari-ex-authoritative-source-readiness-2026-06-30.mjs";

const ROOT = process.cwd();
const TARGET_DATE = "2026-06-30";
const RAW_DIR = "private-input/kurari-ex/raw/2026-06-30";
const SOURCE_BLOCK_MARKER = "KURARI_EX_STRUCTURED_SOURCE_V1";
const RESULT_BLOCK_MARKER = "KURARI_EX_RESULT_OUTPUT_V1";
const STARTER_SOURCE_REQUIRED_FIELDS = [
  "date",
  "venueName",
  "raceNumber",
  "carNo",
  "playerName",
  "registrationNo",
  "prefecture",
  "age",
  "term",
  "className",
  "sourceName",
  "sourceType",
  "sourceFetchedAt",
  "sourceHash",
];
const RESULT_REQUIRED_FIELDS = [
  "date",
  "venueName",
  "raceNumber",
  "raceStatus",
  "finishOrder",
  "payout",
  "officialResultSource",
  "sourceFetchedAt",
  "sourceHash",
  "linkedPredictionFile",
  "linkedSummaryFile",
  "linkedReviewFile",
];
const FINISH_ORDER_REQUIRED_FIELDS = [
  "rank",
  "carNo",
  "playerName",
  "registrationNo",
];
const PAYOUT_REQUIRED_FIELDS = [
  "twoExact",
  "twoQuinella",
  "threeExact",
  "threeQuinella",
  "wide",
];

function abs(file) {
  return path.isAbsolute(file) ? file : path.resolve(ROOT, file);
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

async function inspectRawDocuments() {
  const entries = await readdir(abs(RAW_DIR), { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
  const records = [];
  for (const fileName of files) {
    const match = fileName.match(/-(prediction|summary|result)\.txt$/u);
    if (!match) continue;
    const file = `${RAW_DIR}/${fileName}`;
    const buffer = await readFile(abs(file));
    const content = buffer.toString("utf8");
    records.push({
      file,
      kind: match[1],
      bytes: buffer.length,
      hash: sha256(buffer),
      structuredSourceBlockPresent: content.includes(SOURCE_BLOCK_MARKER),
      structuredResultBlockPresent: content.includes(RESULT_BLOCK_MARKER),
      sourceFetchedAtPresent: /sourceFetchedAt/u.test(content),
      sourceHashPresent: /sourceHash/u.test(content),
      officialResultSourcePresent: /officialResultSource/u.test(content),
      linkedFilesPresent:
        /linkedPredictionFile/u.test(content)
        && /linkedSummaryFile/u.test(content)
        && /linkedReviewFile/u.test(content),
    });
  }
  return records;
}

function print(label, value) {
  console.log(`[${label}]`);
  console.log(JSON.stringify(value, null, 2));
}

export async function auditKurariExSourceContractReadiness20260630({
  printOutput = true,
} = {}) {
  const failures = [];
  const warnings = [];
  if (!existsSync(abs(RAW_DIR))) {
    failures.push(`missing raw source directory: ${RAW_DIR}`);
  }
  const readiness = await auditKurariExAuthoritativeSourceReadiness20260630({
    printOutput: false,
  });
  const authoritative = readiness.authoritativeSourceReadinessSummary;
  const documents = failures.length ? [] : await inspectRawDocuments();
  const byKind = (kind) => documents.filter((record) => record.kind === kind);
  const predictionFiles = byKind("prediction");
  const summaryFiles = byKind("summary");
  const resultFiles = byKind("result");
  const predictionStructuredBlockCount =
    predictionFiles.filter((record) => record.structuredSourceBlockPresent).length;
  const summaryStructuredBlockCount =
    summaryFiles.filter((record) => record.structuredSourceBlockPresent).length;
  const resultStructuredBlockCount =
    resultFiles.filter((record) => record.structuredResultBlockPresent).length;
  const sourceProvenanceBlockCount =
    [...predictionFiles, ...summaryFiles].filter((record) =>
      record.sourceFetchedAtPresent && record.sourceHashPresent
    ).length;
  const officialResultProvenanceBlockCount =
    resultFiles.filter((record) =>
      record.officialResultSourcePresent
      && record.sourceFetchedAtPresent
      && record.sourceHashPresent
      && record.linkedFilesPresent
    ).length;
  const rawDocumentManifestHash = sha256(JSON.stringify(
    documents.map(({ file, bytes, hash }) => ({ file, bytes, hash })),
  ));
  const authoritativeSourceCollectionRequired = Boolean(
    !authoritative.authoritativeSnapshotExists
    || authoritative.trustedRows !== 551
    || !authoritative.authoritativeSnapshotHashMatched,
  );
  const predictionContractReady =
    predictionFiles.length === 8
    && predictionStructuredBlockCount === predictionFiles.length
    && sourceProvenanceBlockCount >= predictionFiles.length;
  const summaryContractReady =
    summaryFiles.length === 8
    && summaryStructuredBlockCount === summaryFiles.length
    && sourceProvenanceBlockCount
      === predictionFiles.length + summaryFiles.length;
  const resultOutputContractReady =
    resultFiles.length === 8
    && resultStructuredBlockCount === resultFiles.length
    && officialResultProvenanceBlockCount === resultFiles.length;
  const canProceedToBackfillDryRun = Boolean(
    authoritative.canProceedToBackfillDryRun
    && predictionContractReady
    && summaryContractReady,
  );

  if (
    authoritative.expectedRaceCount !== 76
    || authoritative.expectedStarterCount !== 551
    || authoritative.rawStarterRows !== 551
    || authoritative.rawOnlyRows !== 551
    || authoritative.trustedRows !== 0
  ) failures.push("2026-06-30 authoritative readiness baseline changed");
  if (
    predictionFiles.length !== 8
    || summaryFiles.length !== 8
    || resultFiles.length !== 8
  ) failures.push("prediction/summary/result file coverage changed");
  if (
    predictionStructuredBlockCount
    || summaryStructuredBlockCount
    || resultStructuredBlockCount
    || sourceProvenanceBlockCount
    || officialResultProvenanceBlockCount
  ) failures.push("unexpected structured contract block detected in immutable raw input");
  if (!authoritativeSourceCollectionRequired) {
    failures.push("authoritative source unexpectedly became ready");
  }
  warnings.push(
    "The 2026-06-30 authoritative snapshot is absent; all 551 starter rows remain raw-only.",
    "Current prediction, summary, and result documents do not contain the proposed structured contract blocks.",
  );
  const conclusion =
    "BLOCKED_AUTHORITATIVE_SOURCE_AND_STRUCTURED_CONTRACT_NOT_READY";
  const finalStatus = failures.length
    ? "SOURCE_CONTRACT_READINESS_AUDIT_FAIL"
    : "SOURCE_CONTRACT_READINESS_AUDIT_COMPLETED_WITH_WARNINGS";
  const sourceContractReadinessSummary = {
    targetDate: TARGET_DATE,
    expectedRaceCount: 76,
    expectedStarterCount: 551,
    authoritativeSnapshotExists:
      authoritative.authoritativeSnapshotExists,
    authoritativeSnapshotHashMatched:
      authoritative.authoritativeSnapshotHashMatched,
    trustedRows: authoritative.trustedRows,
    rawOnlyRows: authoritative.rawOnlyRows,
    authoritativeSourceCollectionRequired,
    predictionFileCount: predictionFiles.length,
    summaryFileCount: summaryFiles.length,
    resultFileCount: resultFiles.length,
    predictionStructuredBlockCount,
    summaryStructuredBlockCount,
    resultStructuredBlockCount,
    sourceProvenanceBlockCount,
    officialResultProvenanceBlockCount,
    predictionContractReady,
    summaryContractReady,
    resultOutputContractReady,
    canProceedToBackfillDryRun,
    canProceedToBackfillWrite: false,
    writePerformed: false,
    conclusion,
    failures,
    warnings,
    finalStatus,
  };
  const sourceContractReadinessRecord = {
    date: TARGET_DATE,
    rawDocumentManifestHash,
    starterSourceRequiredFields: STARTER_SOURCE_REQUIRED_FIELDS,
    resultRequiredFields: RESULT_REQUIRED_FIELDS,
    finishOrderRequiredFields: FINISH_ORDER_REQUIRED_FIELDS,
    payoutRequiredFields: PAYOUT_REQUIRED_FIELDS,
    sourceBlockMarker: SOURCE_BLOCK_MARKER,
    resultBlockMarker: RESULT_BLOCK_MARKER,
    documentAudit: documents,
    registrationNoNullWhenUnavailable: true,
    proseIdentityInferenceProhibited: true,
    sameNameAutoMergeProhibited: true,
    publicWritePerformed: false,
  };
  const result = {
    sourceContractReadinessSummary,
    sourceContractReadinessRecord,
  };
  if (printOutput) {
    print("sourceContractReadinessSummary", sourceContractReadinessSummary);
    print("sourceContractReadinessRecord", sourceContractReadinessRecord);
    console.log(finalStatus);
    if (failures.length) process.exitCode = 1;
  }
  return result;
}

const isMain =
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) await auditKurariExSourceContractReadiness20260630();
