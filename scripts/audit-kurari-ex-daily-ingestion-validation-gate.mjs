import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const DEFAULT_HISTORY_INDEX =
  "public/data/analytics/kurari-ex/history/index.generated.json";
const REPRESENTATIVE_DATES = [
  "2026-06-29",
  "2026-07-01",
  "2026-06-30",
  "2026-06-21",
];
const SAME_NAME_CANDIDATES = new Set(["石井貴子", "山中貴雄", "山口貴弘"]);
const DECISIONS = [
  "PASS_READY_FOR_DAILY_WRITE",
  "PASS_RACE_ONLY_NO_STARTERS",
  "WARN_PARTIAL_REGISTRATION_NO",
  "WARN_MANUAL_REVIEW_REQUIRED",
  "STOP_SOURCE_MISSING",
  "STOP_DUPLICATE_IDENTITY",
  "STOP_FAKE_OR_GENERATED_IDENTITY",
  "STOP_PROHIBITED_SOURCE_USE",
  "STOP_CONTRACT_VIOLATION",
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
  return clean(value).replace(/[\s　・･.]/gu, "");
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function parseArgs(argv) {
  const options = {
    date: null,
    sourceDir: null,
    historyIndex: DEFAULT_HISTORY_INDEX,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--date") options.date = argv[++index] ?? null;
    else if (argument === "--source-dir") options.sourceDir = argv[++index] ?? null;
    else if (argument === "--history-index") options.historyIndex = argv[++index] ?? null;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (options.date && !/^\d{4}-\d{2}-\d{2}$/u.test(options.date)) {
    throw new Error(`Invalid --date: ${options.date}`);
  }
  if (options.sourceDir && !options.date) {
    throw new Error("--source-dir requires --date");
  }
  if (!options.historyIndex) throw new Error("--history-index requires a path");
  return options;
}

function classifyHistoryMode(daily) {
  const races = array(daily?.items);
  if (!races.length) return "SOURCE_MISSING";
  const withStarters = races.filter((race) => array(race.starters).length > 0).length;
  if (withStarters === races.length) return "STARTERS_PARSED";
  if (withStarters === 0) return "NO_STARTERS";
  return "MIXED";
}

function sourceKind(file) {
  if (/-prediction\.txt$/iu.test(file)) return "prediction";
  if (/-summary\.(txt|md)$/iu.test(file)) return "summary";
  if (/-result\.txt$/iu.test(file)) return "result";
  if (/review/iu.test(file)) return "review";
  return "unknown";
}

function parseEntryTableRows({ content, date, file, venueKey }) {
  const rows = [];
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
    const leadingCarNo = Number(rowMatch[1]);
    const rowBody = rowMatch[2];
    const explicitCarNo = rowBody.match(/(?:車番|番車)\s*([1-9])/u);
    const registrationMatch =
      rowBody.match(/登録番号\s*[：:]?\s*(\d{5,6}|未確認|不明|なし|--)/u);
    const registrationToken = clean(registrationMatch?.[1]);
    const registrationNo = /^\d{5,6}$/u.test(registrationToken)
      ? registrationToken.padStart(6, "0")
      : null;
    const firstField = clean(rowBody.split(/[／/]/u)[0]);
    const playerName = clean(
      firstField
        .replace(/(?:車番|番車)\s*[1-9].*$/u, "")
        .replace(/[（(].*?[）)]/gu, ""),
    );
    const carNo = explicitCarNo ? Number(explicitCarNo[1]) : leadingCarNo;
    const registrationMarkerPresent = /登録番号/u.test(rowBody);
    const malformedRegistrationNo =
      registrationMarkerPresent
      && !registrationNo
      && !/登録番号\s*[：:]?\s*(未確認|不明|なし|--)/u.test(rowBody);
    rows.push({
      date,
      venueKey,
      raceNumber,
      carNo,
      playerName,
      registrationNo,
      sourceFile: file,
      sourceKind: `${sourceKind(file)}-entry-table`,
      sourceHash: sha256(content),
      registrationMarkerPresent,
      malformedRegistrationNo,
      rawLine: line,
    });
  }
  return rows;
}

async function listSourceFiles(sourceDir) {
  if (!existsSync(abs(sourceDir))) return [];
  const entries = await readdir(abs(sourceDir), { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(sourceDir, entry.name).replaceAll("\\", "/"))
    .sort();
}

async function detectSourceRows(date, sourceDir, sourceFiles) {
  const predictionFiles = sourceFiles.filter((file) => sourceKind(file) === "prediction");
  const summaryFiles = sourceFiles.filter((file) => sourceKind(file) === "summary");
  const selectedFiles = predictionFiles.length ? predictionFiles : summaryFiles;
  const rows = [];
  for (const file of selectedFiles) {
    const content = await readFile(abs(file), "utf8");
    const venueKey =
      path.basename(file).replace(/-(prediction|summary)\.(txt|md)$/iu, "");
    rows.push(...parseEntryTableRows({ content, date, file, venueKey }));
  }
  return { rows, selectedFiles };
}

function groupByRace(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.date}:${row.venueKey}:${row.raceNumber}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

async function validateDate({ date, sourceDir, index }) {
  const item = array(index.items).find((entry) => entry.date === date) ?? null;
  const dailyPath = item?.file ? `public${item.file}` : null;
  const historyDailyExists = Boolean(dailyPath && existsSync(abs(dailyPath)));
  const daily = historyDailyExists
    ? JSON.parse(await readFile(abs(dailyPath), "utf8"))
    : null;
  const historyMode = classifyHistoryMode(daily);
  const sourceFiles = await listSourceFiles(sourceDir);
  const { rows, selectedFiles } =
    await detectSourceRows(date, sourceDir, sourceFiles);
  const raceGroups = groupByRace(rows);

  let duplicateCarNoInRace = 0;
  let duplicateRegistrationNoInRace = 0;
  for (const raceRows of raceGroups.values()) {
    const carNos = raceRows.map((row) => row.carNo);
    const registrationNos =
      raceRows.map((row) => row.registrationNo).filter(Boolean);
    duplicateCarNoInRace += carNos.length - new Set(carNos).size;
    duplicateRegistrationNoInRace +=
      registrationNos.length - new Set(registrationNos).size;
  }

  const invalidRows = rows.filter((row) =>
    row.date !== date
    || !row.venueKey
    || !Number.isInteger(row.raceNumber)
    || !Number.isInteger(row.carNo)
    || !row.playerName
    || row.malformedRegistrationNo
  );
  const exactRows = rows.filter((row) =>
    !invalidRows.includes(row)
    && Boolean(row.registrationNo)
  );
  const missingRegistrationRows = rows.filter((row) =>
    !invalidRows.includes(row)
    && !row.registrationNo
  );
  const sameNameRows =
    rows.filter((row) => SAME_NAME_CANDIDATES.has(normalizeName(row.playerName)));
  const sameNameManualRows =
    sameNameRows.filter((row) => !row.registrationNo);
  const selectedKinds = new Set(selectedFiles.map(sourceKind));
  const predictionUsedAsStarterSource = false;
  const resultUsedAsStarterSource = selectedKinds.has("result");
  const reviewUsedAsStarterSource = selectedKinds.has("review");
  const prohibitedSourceUseDetected =
    resultUsedAsStarterSource || reviewUsedAsStarterSource;
  const fakeGeneratedIdentityDetected =
    rows.some((row) =>
      /generated|fake|自動生成|推定登録番号|補完登録番号/iu.test(row.rawLine),
    );
  const fuzzyMatchingDetected =
    rows.some((row) => /fuzzy|曖昧一致|類似一致/iu.test(row.rawLine));
  const noStartersAllowed = historyMode === "NO_STARTERS";
  const raceOnlyAllowed =
    noStartersAllowed && rows.length === 0;
  const blockReasons = [];
  const warnings = [];
  let validationDecision;
  let nextAction;

  if (fakeGeneratedIdentityDetected || fuzzyMatchingDetected) {
    validationDecision = "STOP_FAKE_OR_GENERATED_IDENTITY";
    blockReasons.push("FAKE_FUZZY_OR_GENERATED_IDENTITY_DETECTED");
    nextAction = "Reject input and collect an authoritative source without generated identity.";
  } else if (prohibitedSourceUseDetected) {
    validationDecision = "STOP_PROHIBITED_SOURCE_USE";
    blockReasons.push("RESULT_OR_REVIEW_USED_AS_STARTER_SOURCE");
    nextAction = "Reject input and use only an authoritative structured entry table.";
  } else if (duplicateCarNoInRace || duplicateRegistrationNoInRace) {
    validationDecision = "STOP_DUPLICATE_IDENTITY";
    blockReasons.push(
      ...(duplicateCarNoInRace ? ["DUPLICATE_CAR_NO_IN_RACE"] : []),
      ...(duplicateRegistrationNoInRace ? ["DUPLICATE_REGISTRATION_NO_IN_RACE"] : []),
    );
    nextAction = "Resolve duplicate identity rows before any daily write.";
  } else if (invalidRows.length) {
    validationDecision = "STOP_CONTRACT_VIOLATION";
    blockReasons.push("INVALID_EXACT_SOURCE_CONTRACT_ROW");
    nextAction = "Correct malformed date/venue/race/car/name/registrationNo rows.";
  } else if (!existsSync(abs(sourceDir))) {
    validationDecision = "STOP_SOURCE_MISSING";
    blockReasons.push("SOURCE_DIRECTORY_MISSING");
    nextAction = "Collect an authoritative source directory; do not write history.";
  } else if (raceOnlyAllowed) {
    validationDecision = "PASS_RACE_ONLY_NO_STARTERS";
    warnings.push("NO_STARTERS is allowed only as race-level history without player analysis.");
    nextAction = "A race-only daily may proceed without generating starters.";
  } else if (!rows.length) {
    validationDecision = "STOP_SOURCE_MISSING";
    blockReasons.push("STRUCTURED_ENTRY_TABLE_NOT_FOUND");
    nextAction = "Collect a structured entry table or explicitly validate a race-only daily.";
  } else if (sameNameManualRows.length) {
    validationDecision = "WARN_MANUAL_REVIEW_REQUIRED";
    warnings.push("Same-name candidate row lacks registrationNo; automatic assignment is prohibited.");
    nextAction = "Keep the row unresolved and send it to authoritative manual review.";
  } else if (missingRegistrationRows.length) {
    validationDecision = "WARN_PARTIAL_REGISTRATION_NO";
    warnings.push("Rows without registrationNo are excluded from EXACT player analysis.");
    nextAction = "Write only as partial data after explicit warning acceptance; never backfill by name.";
  } else {
    validationDecision = "PASS_READY_FOR_DAILY_WRITE";
    nextAction = "Proceed to a separate guarded daily writer and post-write checker.";
  }

  return {
    targetDate: date,
    sourceDir,
    sourceDirExists: existsSync(abs(sourceDir)),
    historyIndexExists: true,
    historyDailyExists,
    historyDailyPath: dailyPath,
    historyMode,
    sourceFiles,
    selectedEntryTableFiles: selectedFiles,
    sourceRowsDetected: rows.length,
    startersDetected: rows.length,
    startersWithRegistrationNo: exactRows.length,
    startersMissingRegistrationNo: missingRegistrationRows.length,
    exactSourceContractRows: exactRows.length,
    invalidSourceRows: invalidRows.length,
    futureRegistrationNoContractValidation:
      invalidRows.length
      || duplicateCarNoInRace
      || duplicateRegistrationNoInRace
        ? "FAIL"
        : exactRows.length === rows.length && rows.length > 0
          ? "PASS"
          : exactRows.length > 0
            ? "PARTIAL"
            : "NOT_READY",
    duplicateCarNoInRace,
    duplicateRegistrationNoInRace,
    sameNameCandidateRecords: sameNameRows.length,
    sameNameManualReviewRequired: sameNameManualRows.length,
    noStartersAllowed,
    raceOnlyAllowed,
    fakeGeneratedIdentityDetected,
    fuzzyMatchingDetected,
    prohibitedSourceUseDetected,
    predictionUsedAsStarterSource,
    resultUsedAsStarterSource,
    reviewUsedAsStarterSource,
    validationDecision,
    blockReasons,
    warnings,
    nextAction,
  };
}

function countDecisions(results) {
  return Object.fromEntries(
    DECISIONS.map((decision) => [
      decision,
      results.filter((result) => result.validationDecision === decision).length,
    ]),
  );
}

function print(label, value) {
  console.log(`[${label}]`);
  console.log(JSON.stringify(value, null, 2));
}

export async function auditKurariExDailyIngestionValidationGate({
  argv = process.argv.slice(2),
  printOutput = true,
} = {}) {
  const options = parseArgs(argv);
  const historyIndexExists = existsSync(abs(options.historyIndex));
  if (!historyIndexExists) {
    const dailyIngestionValidationSummary = {
      checkedDateCount: 0,
      passReadyForDailyWriteCount: 0,
      passRaceOnlyNoStartersCount: 0,
      warnPartialRegistrationNoCount: 0,
      warnManualReviewRequiredCount: 0,
      stopSourceMissingCount: 0,
      stopDuplicateIdentityCount: 0,
      stopFakeGeneratedIdentityCount: 0,
      stopProhibitedSourceUseCount: 0,
      stopContractViolationCount: 0,
      failures: [`History index missing: ${options.historyIndex}`],
      finalStatus: "DAILY_INGESTION_VALIDATION_GATE_FAIL",
    };
    if (printOutput) {
      print("dailyIngestionValidationSummary", dailyIngestionValidationSummary);
      console.log(dailyIngestionValidationSummary.finalStatus);
      process.exitCode = 1;
    }
    return { dailyIngestionValidationSummary, dailyIngestionValidationResult: [] };
  }

  const index = JSON.parse(await readFile(abs(options.historyIndex), "utf8"));
  const dates = options.date ? [options.date] : REPRESENTATIVE_DATES;
  const dailyIngestionValidationResult = [];
  for (const date of dates) {
    dailyIngestionValidationResult.push(await validateDate({
      date,
      sourceDir:
        options.sourceDir ?? `private-input/kurari-ex/raw/${date}`,
      index,
    }));
  }
  const counts = countDecisions(dailyIngestionValidationResult);
  const hardStopCount =
    counts.STOP_DUPLICATE_IDENTITY
    + counts.STOP_FAKE_OR_GENERATED_IDENTITY
    + counts.STOP_PROHIBITED_SOURCE_USE
    + counts.STOP_CONTRACT_VIOLATION;
  const warningCount =
    counts.PASS_RACE_ONLY_NO_STARTERS
    + counts.WARN_PARTIAL_REGISTRATION_NO
    + counts.WARN_MANUAL_REVIEW_REQUIRED
    + counts.STOP_SOURCE_MISSING;
  const finalStatus = hardStopCount
    ? "DAILY_INGESTION_VALIDATION_GATE_FAIL"
    : warningCount
      ? "DAILY_INGESTION_VALIDATION_GATE_COMPLETED_WITH_WARNINGS"
      : "DAILY_INGESTION_VALIDATION_GATE_COMPLETED";
  const dailyIngestionValidationSummary = {
    checkedDateCount: dailyIngestionValidationResult.length,
    passReadyForDailyWriteCount: counts.PASS_READY_FOR_DAILY_WRITE,
    passRaceOnlyNoStartersCount: counts.PASS_RACE_ONLY_NO_STARTERS,
    warnPartialRegistrationNoCount: counts.WARN_PARTIAL_REGISTRATION_NO,
    warnManualReviewRequiredCount: counts.WARN_MANUAL_REVIEW_REQUIRED,
    stopSourceMissingCount: counts.STOP_SOURCE_MISSING,
    stopDuplicateIdentityCount: counts.STOP_DUPLICATE_IDENTITY,
    stopFakeGeneratedIdentityCount: counts.STOP_FAKE_OR_GENERATED_IDENTITY,
    stopProhibitedSourceUseCount: counts.STOP_PROHIBITED_SOURCE_USE,
    stopContractViolationCount: counts.STOP_CONTRACT_VIOLATION,
    writePerformed: false,
    finalStatus,
  };
  if (printOutput) {
    print("dailyIngestionValidationSummary", dailyIngestionValidationSummary);
    print("dailyIngestionValidationResult", dailyIngestionValidationResult);
    console.log(finalStatus);
    if (hardStopCount) process.exitCode = 1;
  }
  return { dailyIngestionValidationSummary, dailyIngestionValidationResult };
}

const isMain =
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) await auditKurariExDailyIngestionValidationGate();
