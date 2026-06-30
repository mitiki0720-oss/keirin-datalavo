import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const TARGET_DATE = "2026-06-29";
const HISTORY_INDEX_PATH =
  "public/data/analytics/kurari-ex/history/index.generated.json";
const HISTORY_DAILY_ROOT = "public/data/analytics/kurari-ex/history/daily";
const STARTERS_INDEX_PATH =
  "public/data/analytics/kurari-ex/source/starters/index.generated.json";
const ENTRIES_INDEX_PATH = "public/data/races/entries-history/index.generated.json";
const MAX_ITEMS = 30;

const PROTECTED_FLAGS = {
  writesPerformed: false,
  analyticsModified: false,
  racesModified: false,
  reviewsModified: false,
  protectedFilesModified: false,
  fakeCompletionPerformed: false,
  fuzzyMatchingPerformed: false,
  resultLineupPredictionUsedAsStarterSource: false,
};

const BLOCK_REASON_ORDER = [
  "HISTORY_INDEX_MISSING",
  "HISTORY_INDEX_PARSE_FAILED",
  "HISTORY_DAILY_MISSING",
  "HISTORY_DAILY_PARSE_FAILED",
  "HISTORY_DAILY_WRITER_NOT_FOUND",
  "HISTORY_INDEX_WRITER_NOT_FOUND",
  "TARGET_DATE_HISTORY_ALREADY_EXISTS",
  "TARGET_DATE_RESULT_SOURCE_NOT_FOUND",
  "TARGET_DATE_SCHEDULE_SOURCE_NOT_FOUND",
  "TARGET_DATE_ENTRY_SNAPSHOT_NOT_FOUND",
  "TARGET_DATE_STARTERS_SOURCE_NOT_FOUND",
  "INPUT_SOURCE_AMBIGUOUS",
  "OUTPUT_PATH_AMBIGUOUS",
  "SCHEMA_MAPPING_AMBIGUOUS",
  "JOIN_KEY_NOT_AVAILABLE",
  "FAKE_COMPLETION_FOUND",
  "FUZZY_MATCHING_FOUND",
  "PROHIBITED_SOURCE_FOUND",
  "ANALYTICS_MODIFIED",
  "RACES_MODIFIED",
  "REVIEWS_MODIFIED",
  "PROTECTED_FILE_MODIFIED",
  "PACKAGE_MODIFIED",
];

function increment(counter, key, by = 1) {
  counter[key] = (counter[key] ?? 0) + by;
}

function normalizePath(file) {
  return String(file ?? "").replaceAll("\\", "/");
}

function rel(file) {
  return normalizePath(path.relative(ROOT, file));
}

function abs(file) {
  const normalized = normalizePath(file);
  if (normalized.startsWith("/data/")) {
    return path.join(ROOT, "public", normalized.slice(1));
  }
  if (normalized.startsWith("data/")) {
    return path.join(ROOT, "public", normalized);
  }
  return path.isAbsolute(file) ? file : path.resolve(ROOT, file);
}

async function readJson(file) {
  return JSON.parse(await readFile(abs(file), "utf8"));
}

async function readTextIfExists(file) {
  const target = abs(file);
  if (!existsSync(target)) return null;
  return readFile(target, "utf8");
}

async function collectFiles(directory, predicate = () => true) {
  const root = abs(directory);
  const files = [];
  async function visit(current) {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(target);
      if (entry.isFile() && predicate(target)) files.push(target);
    }
  }
  await visit(root);
  return files.sort((left, right) => rel(left).localeCompare(rel(right)));
}

function sortedDates(values) {
  return [...new Set(values.filter((value) => /^\d{4}-\d{2}-\d{2}$/u.test(String(value))))].sort();
}

function dateRange(values) {
  const dates = sortedDates(values);
  return dates.length ? { from: dates[0], to: dates.at(-1) } : null;
}

function limit(items, max = MAX_ITEMS) {
  const values = [...items];
  return {
    count: values.length,
    truncated: values.length > max,
    items: values.slice(0, max),
  };
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : 0;
}

function extractRaces(payload) {
  return asArray(payload?.items ?? payload?.races ?? payload?.data?.races ?? []);
}

function hasNoStartersMarker(race) {
  const starters = asArray(race?.starters ?? race?.riders ?? race?.entries);
  const starterCount = toInteger(race?.starterCount ?? race?.riderCount ?? race?.entryCount);
  if (starterCount > 0 && starters.length === 0) return true;
  if (race?.quality?.starterParsed === false || race?.coverage?.starterParsed === false) {
    return true;
  }
  return /NO_STARTERS|no starters|missing starters/i.test(JSON.stringify(race));
}

function joinKeyCandidatesForRace(race) {
  const candidates = [];
  if (race?.raceKey) candidates.push("raceKey");
  if (race?.raceId) candidates.push("raceId");
  if (race?.date && race?.venueName && race?.raceNumber) {
    candidates.push("dateVenueNameRaceNumber");
  }
  if (race?.date && race?.venueKey && race?.raceNumber) {
    candidates.push("dateVenueKeyRaceNumber");
  }
  return candidates;
}

function flattenKeys(value, prefix = "", output = new Set(), depth = 0) {
  if (depth > 4 || value == null || typeof value !== "object") return output;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 3)) flattenKeys(item, prefix, output, depth + 1);
    return output;
  }
  for (const key of Object.keys(value)) {
    const next = prefix ? `${prefix}.${key}` : key;
    output.add(next);
    flattenKeys(value[key], next, output, depth + 1);
  }
  return output;
}

function hasField(race, field) {
  if (field === "condition") return Boolean(race?.weather?.condition);
  if (field === "role") return /role|position/i.test(JSON.stringify(race));
  if (field === "matchup") return /matchup|sameLine|otherLine/i.test(JSON.stringify(race));
  if (field === "relationship") return /relationship|samePrefecture|relation/i.test(JSON.stringify(race));
  if (field === "lineup") return race?.lineup != null;
  if (field === "starters") return Array.isArray(race?.starters);
  return race?.[field] != null && race?.[field] !== "";
}

async function analyzeHistoryStructure(blockReasonCounts) {
  const historyIndex = {
    exists: existsSync(abs(HISTORY_INDEX_PATH)),
    path: HISTORY_INDEX_PATH,
    parseStatus: "missing",
    schemaVersion: null,
    generatedAt: null,
    sourceCount: 0,
    dateRange: null,
    latestDate: null,
    latestPath: null,
    indexKeyCandidates: [],
    fileReferencesCount: 0,
    malformedReferenceCount: 0,
  };

  let indexPayload = null;
  if (!historyIndex.exists) {
    increment(blockReasonCounts, "HISTORY_INDEX_MISSING");
  } else {
    try {
      indexPayload = await readJson(HISTORY_INDEX_PATH);
      const items = asArray(indexPayload?.items);
      const dates = sortedDates(items.map((item) => item.date));
      const malformedReferenceCount = items.filter((item) => {
        const reference = item.file ?? item.path;
        return !reference || !existsSync(abs(reference));
      }).length;
      historyIndex.parseStatus = "ok";
      historyIndex.schemaVersion = indexPayload?.schemaVersion ?? null;
      historyIndex.generatedAt = indexPayload?.generatedAt ?? null;
      historyIndex.sourceCount = items.length;
      historyIndex.dateRange = dateRange(dates);
      historyIndex.latestDate = dates.at(-1) ?? null;
      historyIndex.latestPath =
        items.find((item) => item.date === historyIndex.latestDate)?.file ?? null;
      historyIndex.indexKeyCandidates = Object.keys(indexPayload ?? {}).sort();
      historyIndex.fileReferencesCount = items.filter((item) => item.file ?? item.path).length;
      historyIndex.malformedReferenceCount = malformedReferenceCount;
    } catch {
      increment(blockReasonCounts, "HISTORY_INDEX_PARSE_FAILED");
      historyIndex.parseStatus = "failed";
    }
  }

  const dailyFiles = await collectFiles(HISTORY_DAILY_ROOT, (file) =>
    file.endsWith(".generated.json"),
  );
  if (dailyFiles.length === 0) increment(blockReasonCounts, "HISTORY_DAILY_MISSING");

  const dailySummaries = [];
  const schemaVersions = new Set();
  const fieldCounts = {
    date: 0,
    venueName: 0,
    venueKey: 0,
    raceNumber: 0,
    raceId: 0,
    raceKey: 0,
    lineup: 0,
    role: 0,
    condition: 0,
    matchup: 0,
    relationship: 0,
    starters: 0,
    starterCount: 0,
    result: 0,
    prediction: 0,
  };
  const missingCoreFieldCounts = {
    date: 0,
    venueName: 0,
    venueKey: 0,
    raceNumber: 0,
    result: 0,
  };
  let totalRaceCount = 0;
  let itemCount = 0;
  let noStartersMarkerCount = 0;

  for (const file of dailyFiles) {
    try {
      const payload = await readJson(file);
      const races = extractRaces(payload);
      const joinKeyCandidates = new Set();
      schemaVersions.add(String(payload?.schemaVersion ?? "(missing)"));
      totalRaceCount += toInteger(payload?.raceCount ?? races.length);
      itemCount += races.length;
      const date = payload?.date ?? rel(file).match(/\d{4}-\d{2}-\d{2}/u)?.[0] ?? null;
      let fileNoStarters = 0;
      for (const race of races) {
        for (const field of Object.keys(fieldCounts)) {
          if (hasField(race, field)) fieldCounts[field] += 1;
        }
        for (const field of Object.keys(missingCoreFieldCounts)) {
          if (!hasField(race, field)) missingCoreFieldCounts[field] += 1;
        }
        for (const candidate of joinKeyCandidatesForRace(race)) {
          joinKeyCandidates.add(candidate);
        }
        if (hasNoStartersMarker(race)) {
          fileNoStarters += 1;
          noStartersMarkerCount += 1;
        }
      }
      dailySummaries.push({
        path: rel(file),
        date,
        schemaVersion: payload?.schemaVersion ?? null,
        raceCount: toInteger(payload?.raceCount ?? races.length),
        itemCount: races.length,
        noStartersMarkerCount: fileNoStarters,
        joinKeyCandidates: [...joinKeyCandidates].sort(),
      });
    } catch {
      increment(blockReasonCounts, "HISTORY_DAILY_PARSE_FAILED");
    }
  }

  const dates = sortedDates(dailySummaries.map((summary) => summary.date));
  return {
    historyIndex,
    historyDaily: {
      dailyFileCount: dailySummaries.length,
      dateRange: dateRange(dates),
      latestDailyDate: dates.at(-1) ?? null,
      latestDailyPath:
        dailySummaries.find((summary) => summary.date === dates.at(-1))?.path ?? null,
      schemaVersions: [...schemaVersions].sort(),
      totalRaceCount,
      itemCount,
      noStartersMarkerCount,
      fieldsSummary: fieldCounts,
      missingCoreFieldCounts,
      joinKeyCandidatesByFile: limit(
        dailySummaries.map((summary) => ({
          path: summary.path,
          date: summary.date,
          joinKeyCandidates: summary.joinKeyCandidates,
        })),
      ),
    },
    dailySummaries,
  };
}

function classifyScriptCandidate(relativePath, text, packageScripts) {
  const normalizedText = normalizePath(text);
  const evidence = {
    matchedLiterals: [],
    writesToHistory: false,
    readsLikelyInputs: [],
    packageScriptName: [],
    outputPathCandidates: [],
    inputPathCandidates: [],
  };

  const literalPatterns = [
    "public/data/analytics/kurari-ex/history",
    "/data/analytics/kurari-ex/history",
    "history/index.generated.json",
    "history/daily",
    "compactHistoryRoot",
    "compactHistoryDailyRoot",
    "readNormalizedRaces",
    "private-normalized-export",
  ];
  for (const literal of literalPatterns) {
    if (normalizedText.includes(literal)) evidence.matchedLiterals.push(literal);
  }
  if (
    /writeFile|writeJson|writeTextIfChanged|unlink|removeStaleDailyFiles/u.test(text) &&
    /historyRoot|dailyRoot|compactHistoryRoot|compactHistoryDailyRoot|history\/daily|history\/index\.generated/u.test(normalizedText)
  ) {
    evidence.writesToHistory = true;
  }
  const inputPatterns = [
    ["private-input/kurari-ex/normalized", "private normalized races"],
    ["readNormalizedRaces", "normalized races helper"],
    ["public/data/races/keirin-jp-results.generated.json", "keirin jp results"],
    ["public/data/races/today.generated.json", "today feed"],
    ["public/data/reviews", "reviews"],
    ["public/data/predictions", "predictions"],
  ];
  for (const [needle, label] of inputPatterns) {
    if (normalizedText.includes(needle)) evidence.readsLikelyInputs.push(label);
  }
  for (const [scriptName, command] of Object.entries(packageScripts)) {
    if (command.includes(relativePath)) evidence.packageScriptName.push(scriptName);
  }
  for (const match of normalizedText.matchAll(/(?:public\/data\/analytics\/kurari-ex\/history|\/data\/analytics\/kurari-ex\/history|history\/daily|history\/index\.generated\.json)[^"'`\s)]*/gu)) {
    evidence.outputPathCandidates.push(match[0]);
  }
  for (const match of normalizedText.matchAll(/(?:private-input\/kurari-ex\/normalized|public\/data\/races|public\/data\/predictions|public\/data\/reviews)[^"'`\s)]*/gu)) {
    evidence.inputPathCandidates.push(match[0]);
  }

  const name = path.basename(relativePath);
  let classification = "unrelated";
  let confidence = "low";
  if (name === "export-kurari-ex-compact-history.mjs" && evidence.writesToHistory) {
    classification = "confirmed-history-daily-writer";
    confidence = "confirmed";
  } else if (name === "kurari-ex-daily-common.mjs" && evidence.writesToHistory) {
    classification = "confirmed-history-index-writer";
    confidence = "confirmed";
  } else if (/^check-/u.test(name) && evidence.matchedLiterals.length) {
    classification = "related-check-only";
    confidence = "medium";
  } else if (/^audit-/u.test(name) && evidence.matchedLiterals.length) {
    classification = "related-audit-only";
    confidence = "medium";
  } else if (evidence.writesToHistory && /index\.generated|rebuildHistoryMetadata/u.test(text)) {
    classification = "possible-history-index-writer";
    confidence = "high";
  } else if (evidence.writesToHistory) {
    classification = "possible-history-writer";
    confidence = "high";
  } else if (evidence.matchedLiterals.length) {
    classification = "possible-history-writer";
    confidence = "low";
  }

  const risk = {
    modifiesGeneratedAnalytics: evidence.writesToHistory,
    mayTouchReviews: /public\/data\/reviews|reviewsRoot|reviews\//u.test(normalizedText),
    mayTouchRaces: /public\/data\/races|today\.generated|keirin-jp-results/u.test(normalizedText),
    unknown: classification !== "unrelated" && evidence.matchedLiterals.length === 0,
  };
  return {
    path: relativePath,
    exists: true,
    classification,
    confidence,
    evidence: {
      ...evidence,
      matchedLiterals: [...new Set(evidence.matchedLiterals)].sort(),
      readsLikelyInputs: [...new Set(evidence.readsLikelyInputs)].sort(),
      packageScriptName: [...new Set(evidence.packageScriptName)].sort(),
      outputPathCandidates: [...new Set(evidence.outputPathCandidates)].sort(),
      inputPathCandidates: [...new Set(evidence.inputPathCandidates)].sort(),
    },
    risk,
    recommendedAction:
      classification.startsWith("confirmed")
        ? "次工程でdry-run/write-safety対象として個別確認する。今回のauditでは実行しない。"
        : classification === "unrelated"
          ? "history生成候補としては扱わない。"
          : "証拠が弱いため、writer確定前に読み取り専用で追加確認する。",
  };
}

async function scanGenerationScripts() {
  const packageJson = await readJson("package.json");
  const packageScripts = packageJson?.scripts ?? {};
  const scriptFiles = await collectFiles("scripts", (file) => file.endsWith(".mjs"));
  const candidates = [];
  for (const file of scriptFiles) {
    const relativePath = rel(file);
    if (relativePath === "scripts/audit-kurari-ex-history-generation-source-map.mjs") {
      continue;
    }
    const text = await readFile(file, "utf8");
    const candidate = classifyScriptCandidate(relativePath, text, packageScripts);
    if (candidate.classification !== "unrelated") candidates.push(candidate);
  }
  const order = {
    "confirmed-history-daily-writer": 0,
    "confirmed-history-index-writer": 1,
    "possible-history-writer": 2,
    "possible-history-index-writer": 3,
    "related-audit-only": 4,
    "related-check-only": 5,
  };
  return candidates.sort((left, right) => {
    const group = (order[left.classification] ?? 99) - (order[right.classification] ?? 99);
    return group || left.path.localeCompare(right.path);
  });
}

function findDates(value) {
  return [
    ...new Set(JSON.stringify(value ?? {}).match(/\b20\d{2}-\d{2}-\d{2}\b/gu) ?? []),
  ].sort();
}

async function countFiles(pathPatternRoot, predicate = () => true) {
  if (!existsSync(abs(pathPatternRoot))) return 0;
  return (await collectFiles(pathPatternRoot, predicate)).length;
}

async function inputSourceCandidate({ pathPattern, likelyRole, reason, dateDetector }) {
  const rootPattern = pathPattern.replace(/\*\*\/\*.*$/u, "").replace(/\*.*$/u, "");
  const existsNow = existsSync(abs(rootPattern));
  let sampleFileCount = 0;
  let latestDate = null;
  let canSupport2026_06_29 = "unknown";
  if (existsNow) {
    const rootStat = await stat(abs(rootPattern));
    const files = rootStat.isFile()
      ? [abs(rootPattern)]
      : await collectFiles(rootPattern, (file) => file.endsWith(".json") || file.endsWith(".generated.json") || file.endsWith(".jsonl"));
    sampleFileCount = files.length;
    const dates = [];
    for (const file of files.slice(0, 60)) {
      try {
        const text = await readFile(file, "utf8");
        if (file.endsWith(".jsonl")) {
          dates.push(...(text.match(/\b20\d{2}-\d{2}-\d{2}\b/gu) ?? []));
        } else {
          dates.push(...findDates(JSON.parse(text)));
        }
      } catch {
        dates.push(...(rel(file).match(/\b20\d{2}-\d{2}-\d{2}\b/gu) ?? []));
      }
    }
    latestDate = sortedDates(dates).at(-1) ?? null;
    const targetSupported = dateDetector
      ? await dateDetector()
      : sortedDates(dates).includes(TARGET_DATE);
    canSupport2026_06_29 = targetSupported
      ? "yes"
      : dateDetector
        ? "no"
        : sampleFileCount > 0
          ? "unknown"
          : "no";
  } else {
    canSupport2026_06_29 = "no";
  }
  return {
    pathPattern,
    existsNow,
    sampleFileCount,
    latestDate,
    likelyRole,
    canSupport2026_06_29,
    reason,
  };
}

async function dateExistsInJsonFile(file, date) {
  const text = await readTextIfExists(file);
  if (!text) return false;
  return text.includes(date);
}

async function buildInputSourceCandidates() {
  return [
    await inputSourceCandidate({
      pathPattern: "public/data/races/keirin-jp-results.generated.json",
      likelyRole: "race-result-source",
      reason: "公式結果feed候補。targetDateの結果がなければhistory dailyを安全生成できない。",
      dateDetector: () =>
        dateExistsInJsonFile("public/data/races/keirin-jp-results.generated.json", TARGET_DATE),
    }),
    await inputSourceCandidate({
      pathPattern: "public/data/races/today.generated.json",
      likelyRole: "schedule-source",
      reason: "today feed候補。現行daily commonのloadDailySourceが参照する。",
      dateDetector: () =>
        dateExistsInJsonFile("public/data/races/today.generated.json", TARGET_DATE),
    }),
    await inputSourceCandidate({
      pathPattern: "public/data/races/entries-history/**/*",
      likelyRole: "entry-source",
      reason: "公式entries snapshot。2026-06-29は既に保存済み。",
      dateDetector: () =>
        dateExistsInJsonFile(ENTRIES_INDEX_PATH, TARGET_DATE),
    }),
    await inputSourceCandidate({
      pathPattern: "public/data/analytics/kurari-ex/source/starters/**/*",
      likelyRole: "starter-identity-source",
      reason: "registrationNo付きstarters source。NO_STARTERS bridgeの参照元。",
      dateDetector: () =>
        dateExistsInJsonFile(STARTERS_INDEX_PATH, TARGET_DATE),
    }),
    await inputSourceCandidate({
      pathPattern: "public/data/predictions/**/*",
      likelyRole: "review-summary-source",
      reason: "history dailyのprediction enrichment候補。存在しない場合はprediction missing扱いにするべき。",
    }),
    await inputSourceCandidate({
      pathPattern: "public/data/analytics/kurari-ex/history/**/*",
      likelyRole: "analytics-derived-source",
      reason: "既存history出力。新規生成の入力ではなくschema map確認用。",
    }),
    {
      pathPattern: "private-input/kurari-ex/normalized/races/**/*.jsonl",
      existsNow: null,
      sampleFileCount: null,
      latestDate: null,
      likelyRole: "race-result-source",
      canSupport2026_06_29: "unknown",
      reason:
        "export-kurari-ex-compact-history.mjs の readNormalizedRaces() が読む正規化済み入力。保護対象のため、このauditでは中身を走査しない。",
    },
  ];
}

async function buildTargetDateReadiness({
  historyStructure,
  generationScriptCandidates,
  inputSourceCandidates,
  blockReasonCounts,
}) {
  const targetHistoryPath = `public/data/analytics/kurari-ex/history/daily/${TARGET_DATE.slice(0, 7)}/${TARGET_DATE}.generated.json`;
  const targetDateHistoryExists = existsSync(abs(targetHistoryPath));
  const indexPayload = existsSync(abs(HISTORY_INDEX_PATH))
    ? await readJson(HISTORY_INDEX_PATH)
    : null;
  const targetDateHistoryIndexEntryExists = asArray(indexPayload?.items).some(
    (item) => item.date === TARGET_DATE,
  );
  const targetDateEntriesSnapshotExists = await dateExistsInJsonFile(
    ENTRIES_INDEX_PATH,
    TARGET_DATE,
  );
  const targetDateStartersSourceExists = await dateExistsInJsonFile(
    STARTERS_INDEX_PATH,
    TARGET_DATE,
  );
  const resultCandidate = inputSourceCandidates.find(
    (candidate) => candidate.likelyRole === "race-result-source" && candidate.pathPattern.startsWith("public/data/races/keirin-jp-results"),
  );
  const scheduleCandidate = inputSourceCandidates.find(
    (candidate) => candidate.pathPattern === "public/data/races/today.generated.json",
  );
  const targetDateResultSourceStatus = resultCandidate?.canSupport2026_06_29 ?? "unknown";
  const targetDateScheduleSourceStatus = scheduleCandidate?.canSupport2026_06_29 ?? "unknown";
  const dailyWriterCandidates = generationScriptCandidates.filter(
    (candidate) =>
      candidate.classification === "confirmed-history-daily-writer" ||
      (candidate.classification === "possible-history-writer" && ["confirmed", "high"].includes(candidate.confidence)),
  );
  const indexWriterCandidates = generationScriptCandidates.filter(
    (candidate) =>
      candidate.classification === "confirmed-history-index-writer" ||
      candidate.classification === "possible-history-index-writer" ||
      candidate.path === "export-kurari-ex-compact-history.mjs",
  );
  const outputPathCandidate = targetHistoryPath;
  const exactJoinKeysAvailable =
    historyStructure.historyDaily.fieldsSummary.raceKey > 0 ||
    historyStructure.historyDaily.fieldsSummary.raceId > 0 ||
    (historyStructure.historyDaily.fieldsSummary.date > 0 &&
      historyStructure.historyDaily.fieldsSummary.venueKey > 0 &&
      historyStructure.historyDaily.fieldsSummary.raceNumber > 0);

  if (targetDateHistoryExists || targetDateHistoryIndexEntryExists) {
    increment(blockReasonCounts, "TARGET_DATE_HISTORY_ALREADY_EXISTS");
  }
  if (!targetDateEntriesSnapshotExists) increment(blockReasonCounts, "TARGET_DATE_ENTRY_SNAPSHOT_NOT_FOUND");
  if (!targetDateStartersSourceExists) increment(blockReasonCounts, "TARGET_DATE_STARTERS_SOURCE_NOT_FOUND");
  if (targetDateResultSourceStatus === "no") increment(blockReasonCounts, "TARGET_DATE_RESULT_SOURCE_NOT_FOUND");
  if (targetDateResultSourceStatus === "unknown") increment(blockReasonCounts, "INPUT_SOURCE_AMBIGUOUS");
  if (targetDateScheduleSourceStatus === "no") increment(blockReasonCounts, "TARGET_DATE_SCHEDULE_SOURCE_NOT_FOUND");
  if (dailyWriterCandidates.length === 0) increment(blockReasonCounts, "HISTORY_DAILY_WRITER_NOT_FOUND");
  if (indexWriterCandidates.length === 0) increment(blockReasonCounts, "HISTORY_INDEX_WRITER_NOT_FOUND");
  if (!exactJoinKeysAvailable) increment(blockReasonCounts, "JOIN_KEY_NOT_AVAILABLE");

  const secondaryStatuses = [];
  if (indexWriterCandidates.length === 0) secondaryStatuses.push("NEEDS_HISTORY_INDEX_WRITER_IDENTIFICATION");
  if (targetDateScheduleSourceStatus !== "yes") secondaryStatuses.push("NEEDS_TARGET_DATE_INPUT_MAPPING");
  if (targetDateResultSourceStatus !== "yes") secondaryStatuses.push("NEEDS_RESULT_SOURCE_FOR_TARGET_DATE");

  let status = "NEEDS_TARGET_DATE_INPUT_MAPPING";
  if (dailyWriterCandidates.length === 0) {
    status = "NEEDS_HISTORY_WRITER_IDENTIFICATION";
  } else if (targetDateResultSourceStatus !== "yes") {
    status = "NEEDS_RESULT_SOURCE_FOR_TARGET_DATE";
  } else {
    status = "READY_FOR_HISTORY_DAILY_GENERATION_DRY_RUN";
    if (indexWriterCandidates.length > 0) {
      secondaryStatuses.push("READY_FOR_HISTORY_INDEX_UPDATE_DRY_RUN");
    }
  }

  return {
    targetDate: TARGET_DATE,
    targetDateHistoryExists,
    targetDateHistoryIndexEntryExists,
    targetDateEntriesSnapshotExists,
    targetDateStartersSourceExists,
    targetDateResultSourceStatus,
    targetDateScheduleSourceStatus,
    outputPathCandidate,
    generationScriptCandidateExists: dailyWriterCandidates.length > 0,
    indexUpdateScriptCandidateExists: indexWriterCandidates.length > 0,
    exactJoinKeysAvailable,
    fakeOrFuzzyOrProhibitedSourceNeeded: false,
    historyGenerationReadiness: {
      status,
      secondaryStatuses: [...new Set(secondaryStatuses)],
      reason:
        status === "READY_FOR_HISTORY_DAILY_GENERATION_DRY_RUN"
          ? "writer候補・target result source・output pathを確認できたため、次工程はdry-run/write-safety監査。"
          : "writer候補またはtargetDate入力sourceの確定が不足しています。",
    },
  };
}

function buildNextActionPlan(targetDateReadiness) {
  const commonProhibited = [
    "public/data/analytics/**",
    "public/data/races/**",
    "public/data/reviews/**",
    "src/**",
    "package.json",
  ];
  return [
    ["history-writer-identification", "history writer候補確定"],
    ["target-date-input-source-check", "targetDate input source存在確認"],
    ["history-daily-generation-dry-run", "history daily generation dry-run script作成"],
    ["history-daily-write-safety-audit", "history daily write safety audit"],
    ["history-daily-writer", "history daily writer実装"],
    ["history-index-update-dry-run", "history index update dry-run"],
    ["history-index-writer", "history index writer実装"],
    ["same-date-bridge-dry-run", "same-date bridge dry-run再実行"],
    ["future-bridge-writer", "bridge writerは別工程"],
  ].map(([stepId, action], index) => ({
    stepId,
    action,
    allowedFiles:
      index <= 3
        ? ["scripts/audit-*.mjs", "scripts/check-*.mjs"]
        : ["別工程で明示されたwriter/checkerのみ"],
    prohibitedFiles: commonProhibited,
    prerequisites:
      stepId === "history-daily-generation-dry-run"
        ? ["confirmed/high history writer candidate", "targetDate result source"]
        : stepId === "same-date-bridge-dry-run"
          ? ["targetDate history daily/index exists", "targetDate starters source exists"]
          : [],
    readiness:
      stepId === "history-writer-identification"
        ? "partial"
        : stepId === "target-date-input-source-check"
          ? targetDateReadiness.targetDateResultSourceStatus === "yes"
            ? "existing"
            : "missing"
          : "future-accumulation",
    notes:
      stepId === "future-bridge-writer"
        ? "writerは今回対象外。fake補完・fuzzy matchingは禁止。"
        : "このauditでは実行・生成・書き込みを行わない。",
  }));
}

function normalizedBlockReasons(counter) {
  return Object.fromEntries(
    Object.entries(counter)
      .filter(([, count]) => count > 0)
      .sort(([left], [right]) => {
        const leftIndex = BLOCK_REASON_ORDER.indexOf(left);
        const rightIndex = BLOCK_REASON_ORDER.indexOf(right);
        if (leftIndex !== -1 && rightIndex !== -1) return leftIndex - rightIndex;
        if (leftIndex !== -1) return -1;
        if (rightIndex !== -1) return 1;
        return left.localeCompare(right);
      }),
  );
}

function printSection(label, value) {
  console.log(`[${label}]`);
  console.log(JSON.stringify(value, null, 2));
}

export async function auditHistoryGenerationSourceMap() {
  const blockReasonCounts = {};
  const historyStructure = await analyzeHistoryStructure(blockReasonCounts);
  const generationScriptCandidates = await scanGenerationScripts();
  const inputSourceCandidates = await buildInputSourceCandidates();
  const targetDateReadiness = await buildTargetDateReadiness({
    historyStructure,
    generationScriptCandidates,
    inputSourceCandidates,
    blockReasonCounts,
  });
  const nextActionPlan = buildNextActionPlan(targetDateReadiness);
  const confirmedHistoryDailyWriterCount = generationScriptCandidates.filter(
    (candidate) => candidate.classification === "confirmed-history-daily-writer",
  ).length;
  const confirmedHistoryIndexWriterCount = generationScriptCandidates.filter(
    (candidate) => candidate.classification === "confirmed-history-index-writer",
  ).length;
  const possibleHistoryWriterCount = generationScriptCandidates.filter(
    (candidate) =>
      candidate.classification === "possible-history-writer" ||
      candidate.classification === "possible-history-index-writer",
  ).length;
  const summary = {
    historyIndexExists: historyStructure.historyIndex.exists,
    historySourceCount: historyStructure.historyIndex.sourceCount,
    historyDateRange: historyStructure.historyIndex.dateRange,
    latestHistoryDate: historyStructure.historyIndex.latestDate,
    latestHistoryPath: historyStructure.historyIndex.latestPath,
    dailyFileCount: historyStructure.historyDaily.dailyFileCount,
    noStartersMarkerCount: historyStructure.historyDaily.noStartersMarkerCount,
    generationScriptCandidateCount: generationScriptCandidates.length,
    confirmedHistoryDailyWriterCount,
    confirmedHistoryIndexWriterCount,
    possibleHistoryWriterCount,
    inputSourceCandidateCount: inputSourceCandidates.length,
    targetDate: TARGET_DATE,
    targetDateHistoryExists: targetDateReadiness.targetDateHistoryExists,
    targetDateEntriesSnapshotExists:
      targetDateReadiness.targetDateEntriesSnapshotExists,
    targetDateStartersSourceExists:
      targetDateReadiness.targetDateStartersSourceExists,
    targetDateResultSourceStatus:
      targetDateReadiness.targetDateResultSourceStatus,
    targetDateScheduleSourceStatus:
      targetDateReadiness.targetDateScheduleSourceStatus,
    historyGenerationReadiness:
      targetDateReadiness.historyGenerationReadiness,
    blockReasonCounts: normalizedBlockReasons(blockReasonCounts),
    ...PROTECTED_FLAGS,
  };
  return {
    summary,
    historyStructure: {
      historyIndex: historyStructure.historyIndex,
      historyDaily: historyStructure.historyDaily,
    },
    generationScriptCandidates: limit(generationScriptCandidates),
    inputSourceCandidates: limit(inputSourceCandidates),
    targetDateReadiness,
    nextActionPlan,
    jsonSummary: {
      targetDate: TARGET_DATE,
      status: targetDateReadiness.historyGenerationReadiness.status,
      secondaryStatuses:
        targetDateReadiness.historyGenerationReadiness.secondaryStatuses,
      historySourceCount: summary.historySourceCount,
      latestHistoryDate: summary.latestHistoryDate,
      confirmedHistoryDailyWriterCount,
      confirmedHistoryIndexWriterCount,
      possibleHistoryWriterCount,
      blockReasonCounts: summary.blockReasonCounts,
      ...PROTECTED_FLAGS,
    },
  };
}

async function main() {
  const result = await auditHistoryGenerationSourceMap();
  printSection("summary", result.summary);
  printSection("historyStructure", result.historyStructure);
  printSection("generationScriptCandidates", result.generationScriptCandidates);
  printSection("inputSourceCandidates", result.inputSourceCandidates);
  printSection("targetDateReadiness", result.targetDateReadiness);
  printSection("nextActionPlan", result.nextActionPlan);
  printSection("jsonSummary", result.jsonSummary);
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  main().catch((error) => {
    console.error("[kurari-ex history generation source map audit] failed");
    console.error(error);
    process.exitCode = 1;
  });
}
