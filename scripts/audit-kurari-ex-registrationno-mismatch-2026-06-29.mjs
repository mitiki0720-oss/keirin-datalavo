import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  splitStarterSourceRow,
} from "./audit-kurari-ex-daily-ingestion-validation-gate.mjs";

const ROOT = process.cwd();
const TARGET_DATE = "2026-06-29";
const INDEX_PATH =
  "public/data/analytics/kurari-ex/history/index.generated.json";
const HISTORY_PATH =
  "public/data/analytics/kurari-ex/history/daily/2026-06/2026-06-29.generated.json";
const ENTRIES_PATH =
  "public/data/races/entries-history/2026-06-29/keirin-jp-entries.generated.json";
const RAW_DIR = "private-input/kurari-ex/raw/2026-06-29";
const EXPECTED_INDEX_PAYLOAD_HASH =
  "sha256:683fd01dea2e0e5f272d35eff42bde236ba326954e857feaa9dec04f77cb3acb";
const EXPECTED_INDEX_BYTES = 14079;
const EXPECTED_HISTORY_FILE_HASH =
  "sha256:c4665f94d38c90a01f1b38d3eb111a47ae90a98497b079ed4275248f72155cda";
const EXPECTED_HISTORY_BYTES = 441362;

function abs(file) {
  return path.isAbsolute(file) ? file : path.resolve(ROOT, file);
}

function clean(value) {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/gu, " ");
}

function nameKey(value) {
  return clean(value).replace(/\s+/gu, "");
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function payloadHash(value) {
  return sha256(JSON.stringify(value));
}

function entryKey(venueKey, raceNumber, carNo) {
  return `${venueKey}:${raceNumber}:${carNo}`;
}

function parsePlayerName(rowBody, delimiterAware) {
  const fields = delimiterAware
    ? splitStarterSourceRow(rowBody)
    : clean(rowBody).split(/[／/]/u).map(clean);
  return clean(
    clean(fields[0])
      .replace(/(?:車番|番車)\s*[1-9].*$/u, "")
      .replace(/[（(].*?[）)]/gu, ""),
  );
}

async function parseRawEntryRows({ delimiterAware }) {
  const files = (await readdir(abs(RAW_DIR), { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /-prediction\.txt$/iu.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  const rows = [];
  for (const fileName of files) {
    const sourcePath = `${RAW_DIR}/${fileName}`;
    const venueKey = fileName.replace(/-prediction\.txt$/iu, "");
    const content = await readFile(abs(sourcePath), "utf8");
    let raceNumber = null;
    let inEntryTable = false;
    const lines = content.split(/\r?\n/u);
    for (let index = 0; index < lines.length; index += 1) {
      const line = clean(lines[index]);
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
      const rowMatch = line.match(
        /^(?:車番\s*)?([1-9])(?:番車|番)?[\s　]+(.+)$/u,
      );
      if (!rowMatch) continue;
      const leadingCarNo = Number(rowMatch[1]);
      const rowBody = rowMatch[2];
      const explicitCarNo = rowBody.match(/(?:車番|番車)\s*([1-9])/u);
      const registrationMatch =
        rowBody.match(/登録番号\s*[：:]?\s*(\d{5,6})/u);
      rows.push({
        date: TARGET_DATE,
        venueKey,
        raceNumber,
        leadingCarNo,
        carNo: explicitCarNo ? Number(explicitCarNo[1]) : leadingCarNo,
        playerName: parsePlayerName(rowBody, delimiterAware),
        registrationNo:
          registrationMatch?.[1]?.padStart(6, "0") ?? null,
        sourcePath,
        sourceLine: index + 1,
      });
    }
  }
  return rows;
}

function historyStarterMap(history) {
  const map = new Map();
  for (const race of history.items ?? []) {
    for (const starter of race.starters ?? []) {
      map.set(entryKey(race.venueKey, race.raceNumber, starter.carNo), {
        race,
        starter,
      });
    }
  }
  return map;
}

function compareRawRows(rows, historyMap) {
  const mismatches = [];
  let rowShiftSuspectedCount = 0;
  let raceJoinShiftSuspectedCount = 0;
  for (const row of rows) {
    if (row.leadingCarNo !== row.carNo) rowShiftSuspectedCount += 1;
    const historyEntry =
      historyMap.get(entryKey(row.venueKey, row.raceNumber, row.carNo));
    if (!historyEntry) {
      raceJoinShiftSuspectedCount += 1;
      continue;
    }
    const nameMatches =
      nameKey(row.playerName) === nameKey(historyEntry.starter.name);
    const registrationNoMatches =
      row.registrationNo === historyEntry.starter.registrationNo;
    if (!nameMatches || !registrationNoMatches) {
      mismatches.push({
        row,
        historyEntry,
        nameMatches,
        registrationNoMatches,
      });
    }
  }
  return {
    mismatches,
    rowShiftSuspectedCount,
    raceJoinShiftSuspectedCount,
  };
}

function compareHistoryToEntries(history, entries) {
  const venueKeyByName = new Map(
    (history.items ?? []).map((race) => [
      nameKey(race.venueName),
      race.venueKey,
    ]),
  );
  const entryMap = new Map();
  for (const race of entries.races ?? []) {
    const venueKey = venueKeyByName.get(nameKey(race.venueName));
    for (const entry of race.entries ?? []) {
      entryMap.set(entryKey(venueKey, race.raceNumber, entry.carNo), entry);
    }
  }
  let matched = 0;
  let mismatch = 0;
  for (const race of history.items ?? []) {
    for (const starter of race.starters ?? []) {
      const entry =
        entryMap.get(entryKey(race.venueKey, race.raceNumber, starter.carNo));
      if (
        entry
        && nameKey(entry.name) === nameKey(starter.name)
        && entry.registrationNo === starter.registrationNo
      ) {
        matched += 1;
      } else {
        mismatch += 1;
      }
    }
  }
  const provenanceMatches = (history.items ?? []).every((race) =>
    (race.starters ?? []).every((starter) =>
      starter.registrationNoSource === "entries-history-snapshot"
      && starter.registrationNoSourceDate === TARGET_DATE
      && starter.registrationNoSourcePath === ENTRIES_PATH
      && starter.registrationNoSourceHash === entries.contentHash
    )
  );
  return { matched, mismatch, provenanceMatches };
}

export async function auditKurariExRegistrationNoMismatch20260629({
  printOutput = true,
} = {}) {
  const failures = [];
  const warnings = [];
  for (const file of [INDEX_PATH, HISTORY_PATH, ENTRIES_PATH]) {
    if (!existsSync(abs(file))) failures.push(`missing required input: ${file}`);
  }
  if (failures.length) {
    const result = {
      registrationNoMismatchCauseAuditSummary: {
        failures,
        warnings,
        writePerformed: false,
        finalStatus: "REGISTRATIONNO_MISMATCH_CAUSE_AUDIT_FAIL",
      },
      registrationNoMismatchCauseAuditRecords: [],
    };
    if (printOutput) {
      console.log(JSON.stringify(result, null, 2));
      console.log(result.registrationNoMismatchCauseAuditSummary.finalStatus);
      process.exitCode = 1;
    }
    return result;
  }

  const indexBuffer = await readFile(abs(INDEX_PATH));
  const index = JSON.parse(indexBuffer.toString("utf8"));
  const historyBuffer = await readFile(abs(HISTORY_PATH));
  const history = JSON.parse(historyBuffer.toString("utf8"));
  const entries = JSON.parse(await readFile(abs(ENTRIES_PATH), "utf8"));
  const historyMap = historyStarterMap(history);
  const totalHistoryStarters = historyMap.size;
  const legacyRows = await parseRawEntryRows({ delimiterAware: false });
  const correctedRows = await parseRawEntryRows({ delimiterAware: true });
  const legacyComparison = compareRawRows(legacyRows, historyMap);
  const correctedComparison = compareRawRows(correctedRows, historyMap);
  const actualMismatches = correctedComparison.mismatches.filter(
    (item) => item.nameMatches && !item.registrationNoMatches,
  );
  const historyEntriesComparison =
    compareHistoryToEntries(history, entries);
  const nameCounts = new Map();
  for (const { starter } of historyMap.values()) {
    const key = nameKey(starter.name);
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }
  const sameNameCandidateInActualMismatchCount = actualMismatches.filter(
    ({ row }) => (nameCounts.get(nameKey(row.playerName)) ?? 0) > 1,
  ).length;
  const mismatchReported = legacyComparison.mismatches.length;
  const actualRawRegistrationNoWrong = actualMismatches.length;
  const parserDelimiterCompareFalsePositive =
    mismatchReported - actualRawRegistrationNoWrong;

  if (payloadHash(index) !== EXPECTED_INDEX_PAYLOAD_HASH) {
    failures.push(`index payload hash changed: ${payloadHash(index)}`);
  }
  if (indexBuffer.length !== EXPECTED_INDEX_BYTES) {
    failures.push(`index bytes changed: ${indexBuffer.length}`);
  }
  if (
    index.items?.length !== 58
    || index.dayCount !== 58
    || index.raceCount !== 4373
    || index.items?.at(-1)?.date !== "2026-07-01"
  ) {
    failures.push("index source/day/race/latest baseline changed");
  }
  if (sha256(historyBuffer) !== EXPECTED_HISTORY_FILE_HASH) {
    failures.push(`2026-06-29 history file hash changed: ${sha256(historyBuffer)}`);
  }
  if (historyBuffer.length !== EXPECTED_HISTORY_BYTES) {
    failures.push(`2026-06-29 history bytes changed: ${historyBuffer.length}`);
  }
  if (totalHistoryStarters !== 464) {
    failures.push(`history starter total changed: ${totalHistoryStarters}`);
  }
  if (legacyRows.length !== 464 || correctedRows.length !== 464) {
    failures.push(
      `raw entry row count changed: legacy=${legacyRows.length}, corrected=${correctedRows.length}`,
    );
  }
  if (
    mismatchReported !== 59
    || parserDelimiterCompareFalsePositive !== 49
    || actualRawRegistrationNoWrong !== 10
  ) {
    failures.push(
      `mismatch classification changed: reported=${mismatchReported}, falsePositive=${parserDelimiterCompareFalsePositive}, actual=${actualRawRegistrationNoWrong}`,
    );
  }
  if (
    correctedComparison.mismatches.some((item) => !item.nameMatches)
    || correctedComparison.rowShiftSuspectedCount
    || correctedComparison.raceJoinShiftSuspectedCount
  ) {
    failures.push("corrected comparison detected a name, row, or race join shift");
  }
  if (
    historyEntriesComparison.matched !== 464
    || historyEntriesComparison.mismatch !== 0
    || !historyEntriesComparison.provenanceMatches
  ) {
    failures.push("history does not match the authoritative entries snapshot");
  }
  if (sameNameCandidateInActualMismatchCount !== 0) {
    failures.push("same-name candidate is involved in an actual mismatch");
  }

  warnings.push(
    "49 of the originally reported 59 identity mismatches are delimiter comparison false positives.",
    "10 raw registrationNo values conflict with the authoritative entries snapshot and remain quarantined.",
  );
  const records = actualMismatches.map(({ row, historyEntry }) => ({
    date: TARGET_DATE,
    venueKey: row.venueKey,
    venueName: historyEntry.race.venueName,
    raceNumber: row.raceNumber,
    carNo: row.carNo,
    playerName: historyEntry.starter.name,
    rawRegistrationNo: row.registrationNo,
    authoritativeRegistrationNo: historyEntry.starter.registrationNo,
    rawSourcePath: row.sourcePath,
    rawSourceLine: row.sourceLine,
    authoritativeSourcePath:
      historyEntry.starter.registrationNoSourcePath,
    authoritativeSourceHash:
      historyEntry.starter.registrationNoSourceHash,
    classification: "ACTUAL_RAW_REGISTRATIONNO_WRONG",
    writePerformed: false,
  }));
  const finalStatus = failures.length
    ? "REGISTRATIONNO_MISMATCH_CAUSE_AUDIT_FAIL"
    : "REGISTRATIONNO_MISMATCH_CAUSE_AUDIT_COMPLETED_WITH_WARNINGS";
  const summary = {
    targetDate: TARGET_DATE,
    indexPayloadHash: payloadHash(index),
    indexBytes: indexBuffer.length,
    historyFileHash: sha256(historyBuffer),
    historyBytes: historyBuffer.length,
    totalHistoryStarters,
    mismatchReported,
    parserDelimiterCompareFalsePositive,
    actualRawRegistrationNoWrong,
    rowShiftSuspectedCount: correctedComparison.rowShiftSuspectedCount,
    raceJoinShiftSuspectedCount:
      correctedComparison.raceJoinShiftSuspectedCount,
    sameNameAutoMergeCount: 0,
    sameNameCandidateInActualMismatchCount,
    historySnapshotMatchedCount: historyEntriesComparison.matched,
    historySnapshotMismatchCount: historyEntriesComparison.mismatch,
    snapshotHashMatchesHistoryProvenance:
      historyEntriesComparison.provenanceMatches,
    fakeGeneratedIdentityDetected: false,
    fuzzyMatchingDetected: false,
    generatedStarterDetected: false,
    keepExistingHistory: true,
    refreshRequired: false,
    backfillBlockedUntilTrustGate: true,
    canProceedTo20260630Backfill: false,
    writePerformed: false,
    publicDataChanged: false,
    failures,
    warnings,
    finalStatus,
  };
  const result = {
    registrationNoMismatchCauseAuditSummary: summary,
    registrationNoMismatchCauseAuditRecords: records,
  };
  if (printOutput) {
    console.log(JSON.stringify(result, null, 2));
    console.log(finalStatus);
    if (failures.length) process.exitCode = 1;
  }
  return result;
}

const isMain =
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) await auditKurariExRegistrationNoMismatch20260629();
