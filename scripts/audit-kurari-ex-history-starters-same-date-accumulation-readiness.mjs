import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  DEFAULT_TARGET_PATH as STARTERS_SOURCE_INDEX_PATH,
  checkStartersSourceIndex,
} from "./check-kurari-ex-starters-source-index.mjs";

const HISTORY_INDEX_PATH =
  "public/data/analytics/kurari-ex/history/index.generated.json";
const ENTRY_SNAPSHOT_INDEX_PATH =
  "public/data/races/entries-history/index.generated.json";
const MAX_DISPLAY_ITEMS = 20;

const BLOCK_REASON_KEYS = [
  "STARTERS_INDEX_MISSING",
  "STARTERS_INDEX_CHECK_FAILED",
  "STARTERS_SOURCE_MISSING",
  "STARTERS_SOURCE_CHECK_FAILED",
  "HISTORY_INDEX_MISSING",
  "HISTORY_SOURCE_MISSING",
  "ENTRY_SNAPSHOT_INDEX_MISSING",
  "ENTRY_SNAPSHOT_SOURCE_MISSING",
  "SAME_DATE_PAIR_NOT_FOUND",
  "HISTORY_DATE_MISSING_FOR_STARTERS_DATE",
  "STARTERS_DATE_MISSING_FOR_HISTORY_DATE",
  "ENTRY_SNAPSHOT_DATE_MISSING",
  "JOIN_KEY_NOT_AVAILABLE",
  "JOIN_KEY_AMBIGUOUS",
  "DATE_MISMATCH",
  "FAKE_COMPLETION_FOUND",
  "FUZZY_MATCHING_FOUND",
  "PROHIBITED_SOURCE_FOUND",
  "ANALYTICS_MODIFIED",
  "RACES_MODIFIED",
  "REVIEWS_MODIFIED",
  "PROTECTED_FILE_MODIFIED",
  "PIPELINE_SCRIPT_NOT_FOUND",
  "PIPELINE_OUTPUT_NOT_FOUND",
];

const REQUIRED_FLAGS = {
  writesPerformed: false,
  analyticsModified: false,
  racesModified: false,
  reviewsModified: false,
  protectedFilesModified: false,
  fakeCompletionPerformed: false,
  fuzzyMatchingPerformed: false,
  resultLineupPredictionUsedAsStarterSource: false,
};

function increment(counter, key, by = 1) {
  counter[key] = (counter[key] ?? 0) + by;
}

function sortDates(dates) {
  return [...new Set(dates.filter(Boolean))].sort();
}

function dateRange(dates) {
  const sorted = sortDates(dates);
  if (sorted.length === 0) return null;
  return { from: sorted[0], to: sorted.at(-1) };
}

function limitItems(items, max = MAX_DISPLAY_ITEMS) {
  const values = [...items];
  return {
    count: values.length,
    truncated: values.length > max,
    items: values.slice(0, max),
  };
}

function toAbsolutePath(root, filePath) {
  if (!filePath) return null;
  const slashNormalized = String(filePath).replaceAll("\\", "/");
  if (slashNormalized.startsWith("/data/")) {
    return path.join(root, "public", slashNormalized.slice(1));
  }
  if (slashNormalized.startsWith("data/")) {
    return path.join(root, "public", slashNormalized);
  }
  if (path.isAbsolute(filePath)) {
    return filePath;
  }
  const normalized = slashNormalized;
  if (normalized.startsWith("/data/")) {
    return path.join(root, "public", normalized.slice(1));
  }
  if (normalized.startsWith("data/")) {
    return path.join(root, "public", normalized);
  }
  return path.resolve(root, normalized);
}

function toPublicRelativePath(root, filePath) {
  const absolute = toAbsolutePath(root, filePath);
  if (!absolute) return null;
  return path.relative(root, absolute).replaceAll("\\", "/");
}

async function readJson(root, filePath) {
  const absolute = toAbsolutePath(root, filePath);
  return JSON.parse(await readFile(absolute, "utf8"));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : 0;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function raceNumberOf(race) {
  return (
    race?.raceNumber ??
    race?.raceNo ??
    race?.race ??
    race?.race_number ??
    race?.meta?.raceNumber ??
    null
  );
}

function venueNameOf(race) {
  return (
    race?.venueName ??
    race?.venue ??
    race?.trackName ??
    race?.placeName ??
    race?.meta?.venueName ??
    null
  );
}

function raceJoinKey(race) {
  const date = normalizeText(race?.date ?? race?.raceDate ?? race?.meta?.date);
  const venue = normalizeText(venueNameOf(race));
  const raceNumber = normalizeText(raceNumberOf(race));
  if (!date || !venue || !raceNumber) return null;
  return `${date}::${venue}::${raceNumber}`;
}

function availableRaceJoinKeys(races) {
  const keys = new Set();
  let ambiguousCount = 0;
  const seen = new Map();
  for (const race of races) {
    const key = raceJoinKey(race);
    if (!key) continue;
    seen.set(key, (seen.get(key) ?? 0) + 1);
    keys.add(key);
  }
  for (const count of seen.values()) {
    if (count > 1) ambiguousCount += 1;
  }
  return { keys, ambiguousCount };
}

function extractRaces(payload) {
  return asArray(
    payload?.races ??
      payload?.items ??
      payload?.raceResults ??
      payload?.data?.races ??
      [],
  );
}

function extractStarters(race) {
  return asArray(
    race?.starters ?? race?.riders ?? race?.entries ?? race?.players ?? [],
  );
}

function hasNoStartersMarker(race) {
  const starters = extractStarters(race);
  const starterCount = asInteger(
    race?.starterCount ?? race?.entryCount ?? race?.riderCount,
  );
  if (starterCount > 0 && starters.length === 0) return true;
  if (race?.coverage?.starterParsed === false) return true;
  if (asArray(race?.blockedReasons).some((reason) => reason === "NO_STARTERS")) {
    return true;
  }
  const text = JSON.stringify(race);
  return /NO_STARTERS|no starters|missing starters/i.test(text);
}

function summarizeByDate(entries, valueKey) {
  return Object.fromEntries(
    entries.map((entry) => [entry.date, entry[valueKey] ?? 0]),
  );
}

function summarizePathByDate(entries) {
  return Object.fromEntries(entries.map((entry) => [entry.date, entry.path]));
}

function summarizeQualityByDate(entries) {
  return Object.fromEntries(entries.map((entry) => [entry.date, entry.quality]));
}

function scriptStatus(root, candidates) {
  return candidates.map((candidate) => ({
    path: candidate,
    exists: existsSync(path.resolve(root, candidate)),
  }));
}

function anyScriptExists(root, candidates) {
  return scriptStatus(root, candidates).some((candidate) => candidate.exists);
}

function pipelineStep({
  root,
  stepId,
  label,
  requiredInput,
  expectedOutput,
  existingScriptCandidates,
  existingOutputNow,
  readiness,
  notes,
}) {
  const scripts = scriptStatus(root, existingScriptCandidates);
  return {
    stepId,
    label,
    requiredInput,
    expectedOutput,
    existingScriptCandidates: scripts,
    existingOutputNow,
    readiness,
    notes,
  };
}

async function buildStartersCoverage(root, blockReasonCounts) {
  if (!existsSync(path.resolve(root, STARTERS_SOURCE_INDEX_PATH))) {
    increment(blockReasonCounts, "STARTERS_INDEX_MISSING");
    return {
      startersSourceCount: 0,
      startersDates: [],
      latestStartersDate: null,
      startersDateRange: null,
      startersRaceCountByDate: {},
      startersStarterCountByDate: {},
      startersQualityByDate: {},
      startersPathByDate: {},
      startersContentHashByDate: {},
      starterJoinKeysByDate: {},
    };
  }

  const indexCheck = await checkStartersSourceIndex(
    STARTERS_SOURCE_INDEX_PATH,
    root,
  );
  if (indexCheck.checkStatus !== "PASS") {
    increment(blockReasonCounts, "STARTERS_INDEX_CHECK_FAILED");
  }

  const index = await readJson(root, STARTERS_SOURCE_INDEX_PATH);
  const sourceEntries = asArray(index?.sources);
  const sources = [];
  const starterJoinKeysByDate = {};

  for (const entry of sourceEntries) {
    const sourcePath = toPublicRelativePath(root, entry.path);
    if (!sourcePath || !existsSync(path.resolve(root, sourcePath))) {
      increment(blockReasonCounts, "STARTERS_SOURCE_MISSING");
      continue;
    }
    const payload = await readJson(root, sourcePath);
    const summary = payload?.summary ?? {};
    const quality = payload?.quality ?? {};
    const races = extractRaces(payload);
    const date = normalizeText(payload?.date ?? entry.date);
    const joinKeys = availableRaceJoinKeys(races);
    if (joinKeys.ambiguousCount > 0) increment(blockReasonCounts, "JOIN_KEY_AMBIGUOUS");
    if (joinKeys.keys.size === 0) increment(blockReasonCounts, "JOIN_KEY_NOT_AVAILABLE");
    if (quality?.checkStatus !== "PASS" || entry.checkStatus !== "PASS") {
      increment(blockReasonCounts, "STARTERS_SOURCE_CHECK_FAILED");
    }
    if (quality?.fakeCompletionPerformed !== false) {
      increment(blockReasonCounts, "FAKE_COMPLETION_FOUND");
    }
    if (quality?.fuzzyMatchingPerformed !== false) {
      increment(blockReasonCounts, "FUZZY_MATCHING_FOUND");
    }
    if (quality?.resultLineupPredictionUsedAsStarterSource !== false) {
      increment(blockReasonCounts, "PROHIBITED_SOURCE_FOUND");
    }
    starterJoinKeysByDate[date] = [...joinKeys.keys].sort();
    sources.push({
      date,
      path: sourcePath,
      raceCount: asInteger(summary?.raceCount ?? entry.raceCount),
      starterCount: asInteger(summary?.starterCount ?? entry.starterCount),
      quality: {
        checkStatus: quality?.checkStatus ?? entry.checkStatus ?? null,
        fakeCompletionPerformed: quality?.fakeCompletionPerformed ?? null,
        fuzzyMatchingPerformed: quality?.fuzzyMatchingPerformed ?? null,
        resultLineupPredictionUsedAsStarterSource:
          quality?.resultLineupPredictionUsedAsStarterSource ?? null,
        blockedReasons: asArray(quality?.blockedReasons),
      },
      contentHash: normalizeText(payload?.contentHash ?? entry.contentHash),
    });
  }

  const startersDates = sortDates(sources.map((source) => source.date));
  return {
    startersSourceCount: sources.length,
    startersDates,
    latestStartersDate: startersDates.at(-1) ?? null,
    startersDateRange: dateRange(startersDates),
    startersRaceCountByDate: summarizeByDate(sources, "raceCount"),
    startersStarterCountByDate: summarizeByDate(sources, "starterCount"),
    startersQualityByDate: summarizeQualityByDate(sources),
    startersPathByDate: summarizePathByDate(sources),
    startersContentHashByDate: Object.fromEntries(
      sources.map((source) => [source.date, source.contentHash]),
    ),
    starterJoinKeysByDate,
  };
}

async function buildHistoryCoverage(root, blockReasonCounts) {
  if (!existsSync(path.resolve(root, HISTORY_INDEX_PATH))) {
    increment(blockReasonCounts, "HISTORY_INDEX_MISSING");
    return {
      historySourceCount: 0,
      historyDates: [],
      historyDateRange: null,
      historyRaceCountByDate: {},
      noStartersMarkerCountByDate: {},
      historyPathByDate: {},
      historyJoinKeyCandidatesByDate: {},
    };
  }

  const index = await readJson(root, HISTORY_INDEX_PATH);
  const historyEntries = asArray(index?.items);
  const histories = [];

  for (const entry of historyEntries) {
    const historyPath = toPublicRelativePath(root, entry.file ?? entry.path);
    if (!historyPath || !existsSync(path.resolve(root, historyPath))) {
      increment(blockReasonCounts, "HISTORY_SOURCE_MISSING");
      continue;
    }
    const payload = await readJson(root, historyPath);
    const races = extractRaces(payload);
    const joinKeys = availableRaceJoinKeys(races);
    const noStartersMarkerCount = races.filter(hasNoStartersMarker).length;
    if (races.length > 0 && joinKeys.keys.size === 0) {
      increment(blockReasonCounts, "JOIN_KEY_NOT_AVAILABLE");
    }
    if (joinKeys.ambiguousCount > 0) increment(blockReasonCounts, "JOIN_KEY_AMBIGUOUS");
    histories.push({
      date: normalizeText(entry.date ?? payload?.date),
      path: historyPath,
      raceCount: asInteger(entry.raceCount ?? payload?.raceCount ?? races.length),
      noStartersMarkerCount,
      joinKeyCandidates: [...joinKeys.keys].sort(),
    });
  }

  const historyDates = sortDates(histories.map((history) => history.date));
  return {
    historySourceCount: histories.length,
    historyDates,
    historyDateRange: dateRange(historyDates),
    historyRaceCountByDate: summarizeByDate(histories, "raceCount"),
    noStartersMarkerCountByDate: summarizeByDate(histories, "noStartersMarkerCount"),
    historyPathByDate: summarizePathByDate(histories),
    historyJoinKeyCandidatesByDate: Object.fromEntries(
      histories.map((history) => [
        history.date,
        limitItems(history.joinKeyCandidates),
      ]),
    ),
    rawHistoryJoinKeysByDate: Object.fromEntries(
      histories.map((history) => [history.date, history.joinKeyCandidates]),
    ),
  };
}

async function buildEntrySnapshotCoverage(root, blockReasonCounts) {
  if (!existsSync(path.resolve(root, ENTRY_SNAPSHOT_INDEX_PATH))) {
    increment(blockReasonCounts, "ENTRY_SNAPSHOT_INDEX_MISSING");
    return {
      entrySnapshotCount: 0,
      entrySnapshotDates: [],
      entrySnapshotDateRange: null,
      entrySnapshotRaceCountByDate: {},
      entrySnapshotRiderCountByDate: {},
      entrySnapshotPathByDate: {},
      fullRegistrationRaceCountByDate: {},
    };
  }

  const index = await readJson(root, ENTRY_SNAPSHOT_INDEX_PATH);
  const snapshotEntries = asArray(index?.snapshots);
  const snapshots = [];

  for (const entry of snapshotEntries) {
    const snapshotPath = toPublicRelativePath(root, entry.path);
    if (!snapshotPath || !existsSync(path.resolve(root, snapshotPath))) {
      increment(blockReasonCounts, "ENTRY_SNAPSHOT_SOURCE_MISSING");
      continue;
    }
    const payload = await readJson(root, snapshotPath);
    const summary = payload?.summary ?? {};
    snapshots.push({
      date: normalizeText(payload?.date ?? entry.date),
      path: snapshotPath,
      raceCount: asInteger(summary?.raceCount ?? entry.raceCount),
      riderCount: asInteger(summary?.riderCount ?? entry.riderCount),
      fullRegistrationRaceCount: asInteger(
        summary?.fullRegistrationRaceCount ?? entry.fullRegistrationRaceCount,
      ),
    });
  }

  const entrySnapshotDates = sortDates(snapshots.map((snapshot) => snapshot.date));
  return {
    entrySnapshotCount: snapshots.length,
    entrySnapshotDates,
    entrySnapshotDateRange: dateRange(entrySnapshotDates),
    entrySnapshotRaceCountByDate: summarizeByDate(snapshots, "raceCount"),
    entrySnapshotRiderCountByDate: summarizeByDate(snapshots, "riderCount"),
    entrySnapshotPathByDate: summarizePathByDate(snapshots),
    fullRegistrationRaceCountByDate: summarizeByDate(
      snapshots,
      "fullRegistrationRaceCount",
    ),
  };
}

function buildDatePairCoverage(startersCoverage, historyCoverage, entryCoverage) {
  const startersDates = new Set(startersCoverage.startersDates);
  const historyDates = new Set(historyCoverage.historyDates);
  const entrySnapshotDates = new Set(entryCoverage.entrySnapshotDates);
  const allKnownDates = sortDates([
    ...startersDates,
    ...historyDates,
    ...entrySnapshotDates,
  ]);
  const matchedDates = sortDates(
    [...startersDates].filter((date) => historyDates.has(date)),
  );
  const startersWithoutHistoryDates = sortDates(
    [...startersDates].filter((date) => !historyDates.has(date)),
  );
  const historyWithoutStartersDates = sortDates(
    [...historyDates].filter((date) => !startersDates.has(date)),
  );
  const entriesWithoutStartersDates = sortDates(
    [...entrySnapshotDates].filter((date) => !startersDates.has(date)),
  );
  const historyWithoutEntriesDates = sortDates(
    [...historyDates].filter((date) => !entrySnapshotDates.has(date)),
  );

  const bridgeEligibleDates = matchedDates.filter((date) => {
    const startersKeys = new Set(startersCoverage.starterJoinKeysByDate[date] ?? []);
    const historyKeys = historyCoverage.rawHistoryJoinKeysByDate[date] ?? [];
    const hasJoinPair = historyKeys.some((key) => startersKeys.has(key));
    const hasNoStartersMarkers =
      (historyCoverage.noStartersMarkerCountByDate[date] ?? 0) > 0;
    return hasJoinPair && hasNoStartersMarkers;
  });

  return {
    matchedDateCount: matchedDates.length,
    matchedDates: limitItems(matchedDates),
    bridgeEligibleDateCount: bridgeEligibleDates.length,
    bridgeEligibleDates: limitItems(bridgeEligibleDates),
    startersWithoutHistoryDateCount: startersWithoutHistoryDates.length,
    startersWithoutHistoryDates: limitItems(startersWithoutHistoryDates),
    historyWithoutStartersDateCount: historyWithoutStartersDates.length,
    historyWithoutStartersDates: limitItems(historyWithoutStartersDates),
    entriesWithoutStartersDateCount: entriesWithoutStartersDates.length,
    entriesWithoutStartersDates: limitItems(entriesWithoutStartersDates),
    historyWithoutEntriesDateCount: historyWithoutEntriesDates.length,
    historyWithoutEntriesDates: limitItems(historyWithoutEntriesDates),
    allKnownDates: limitItems(allKnownDates),
    latestKnownDateBySource: {
      starters: startersCoverage.startersDates.at(-1) ?? null,
      history: historyCoverage.historyDates.at(-1) ?? null,
      entries: entryCoverage.entrySnapshotDates.at(-1) ?? null,
    },
  };
}

function buildSameDatePairCandidates(
  startersCoverage,
  historyCoverage,
  datePairCoverage,
) {
  return datePairCoverage.matchedDates.items.slice(0, MAX_DISPLAY_ITEMS).map((date) => {
    const startersKeys = new Set(startersCoverage.starterJoinKeysByDate[date] ?? []);
    const historyKeys = historyCoverage.rawHistoryJoinKeysByDate[date] ?? [];
    const matchedJoinKeyCount = historyKeys.filter((key) => startersKeys.has(key)).length;
    const blockReasons = [];
    if (matchedJoinKeyCount === 0) blockReasons.push("JOIN_KEY_NOT_AVAILABLE");
    if ((historyCoverage.noStartersMarkerCountByDate[date] ?? 0) === 0) {
      blockReasons.push("PIPELINE_OUTPUT_NOT_FOUND");
    }
    return {
      date,
      startersPath: startersCoverage.startersPathByDate[date] ?? null,
      historyPath: historyCoverage.historyPathByDate[date] ?? null,
      startersRaceCount: startersCoverage.startersRaceCountByDate[date] ?? 0,
      historyRaceCount: historyCoverage.historyRaceCountByDate[date] ?? 0,
      noStartersMarkerCount:
        historyCoverage.noStartersMarkerCountByDate[date] ?? 0,
      matchedJoinKeyCount,
      bridgeEligible: blockReasons.length === 0,
      blockReasons,
    };
  });
}

function buildBackfillReadiness(historyCoverage, startersCoverage, entryCoverage) {
  const startersDates = new Set(startersCoverage.startersDates);
  const entryDates = new Set(entryCoverage.entrySnapshotDates);
  const historyNoStarterDates = historyCoverage.historyDates.filter(
    (date) => (historyCoverage.noStartersMarkerCountByDate[date] ?? 0) > 0,
  );
  const backfillableDates = [];
  const blockedDates = [];
  const reasonCounts = {};

  for (const date of historyNoStarterDates) {
    const reasons = [];
    if (!startersDates.has(date)) reasons.push("STARTERS_DATE_MISSING_FOR_HISTORY_DATE");
    if (!entryDates.has(date)) reasons.push("ENTRY_SNAPSHOT_DATE_MISSING");
    if (reasons.length === 0) {
      backfillableDates.push(date);
      continue;
    }
    blockedDates.push({ date, reasons });
    for (const reason of reasons) increment(reasonCounts, reason);
  }

  return {
    canBackfillNow: backfillableDates.length > 0,
    backfillableDateCount: backfillableDates.length,
    backfillableDates: limitItems(sortDates(backfillableDates)),
    blockedDateCount: blockedDates.length,
    blockedDates: limitItems(blockedDates),
    missingStarterSourceDateCount:
      reasonCounts.STARTERS_DATE_MISSING_FOR_HISTORY_DATE ?? 0,
    missingEntrySnapshotDateCount: reasonCounts.ENTRY_SNAPSHOT_DATE_MISSING ?? 0,
    reasonCounts,
    recommendation:
      backfillableDates.length > 0
        ? "同日history/starters/entriesが揃った日付は、別工程のwriterで安全にbackfill候補にできます。"
        : "現時点の過去history日付には同日のstarters/entries snapshotがないため、過去分backfillは行わず、今後の同日蓄積を待つ状態です。",
  };
}

function buildPipelineSteps(root, coverages) {
  const { startersCoverage, historyCoverage, entryCoverage } = coverages;
  return [
    pipelineStep({
      root,
      stepId: "entries-history-snapshot-by-date",
      label: "entries-history snapshot saved by date",
      requiredInput: "公式entries取得結果",
      expectedOutput:
        "public/data/races/entries-history/YYYY-MM-DD/keirin-jp-entries.generated.json",
      existingScriptCandidates: [
        "scripts/audit-kurari-ex-entry-snapshot-write-safety.mjs",
      ],
      existingOutputNow: entryCoverage.entrySnapshotCount,
      readiness:
        entryCoverage.entrySnapshotCount > 0 ? "partial" : "future-accumulation",
      notes:
        "現存snapshotは確認対象。新規snapshot生成や書き込みはこの監査では実行しません。",
    }),
    pipelineStep({
      root,
      stepId: "entries-history-index",
      label: "entries-history index updated",
      requiredInput: "entries-history snapshots",
      expectedOutput: ENTRY_SNAPSHOT_INDEX_PATH,
      existingScriptCandidates: [
        "scripts/write-kurari-ex-entry-snapshot-index.mjs",
        "scripts/check-kurari-ex-entry-snapshot-index.mjs",
      ],
      existingOutputNow: entryCoverage.entrySnapshotCount,
      readiness:
        existsSync(path.resolve(root, ENTRY_SNAPSHOT_INDEX_PATH)) &&
        anyScriptExists(root, ["scripts/check-kurari-ex-entry-snapshot-index.mjs"])
          ? "existing"
          : "missing",
      notes: "既存indexを読み取り専用で参照しました。",
    }),
    pipelineStep({
      root,
      stepId: "today-registration-bridge",
      label: "today rider registration bridge or equivalent exact registration bridge",
      requiredInput: "entries-history snapshot + today.riders",
      expectedOutput: "registrationNo付きtoday.riders相当データ",
      existingScriptCandidates: [
        "scripts/write-kurari-ex-today-rider-registration-from-entry-snapshot.mjs",
        "scripts/check-kurari-ex-today-rider-registration-bridge.mjs",
      ],
      existingOutputNow: startersCoverage.startersSourceCount > 0,
      readiness: startersCoverage.startersSourceCount > 0 ? "existing" : "partial",
      notes: "starters sourceのmetadataからregistration bridge済み出力を確認します。",
    }),
    pipelineStep({
      root,
      stepId: "starters-source-by-date",
      label: "starters source generated by date",
      requiredInput: "registrationNo付きtoday.riders",
      expectedOutput:
        "public/data/analytics/kurari-ex/source/starters/YYYY-MM-DD/today-registration-starters.generated.json",
      existingScriptCandidates: [
        "scripts/write-kurari-ex-starters-from-today-registration.mjs",
        "scripts/check-kurari-ex-starters-from-today-registration.mjs",
      ],
      existingOutputNow: startersCoverage.startersSourceCount,
      readiness: startersCoverage.startersSourceCount > 0 ? "existing" : "missing",
      notes: "脚質・予想ラインからの補完は使わず、保存済みsourceだけを対象にします。",
    }),
    pipelineStep({
      root,
      stepId: "starters-source-index",
      label: "starters source index updated",
      requiredInput: "starters source by date",
      expectedOutput: STARTERS_SOURCE_INDEX_PATH,
      existingScriptCandidates: [
        "scripts/write-kurari-ex-starters-source-index.mjs",
        "scripts/check-kurari-ex-starters-source-index.mjs",
      ],
      existingOutputNow: startersCoverage.startersSourceCount,
      readiness:
        existsSync(path.resolve(root, STARTERS_SOURCE_INDEX_PATH)) &&
        anyScriptExists(root, ["scripts/check-kurari-ex-starters-source-index.mjs"])
          ? "existing"
          : "missing",
      notes: "index checkは読み取り専用で実行可能です。",
    }),
    pipelineStep({
      root,
      stepId: "history-daily-by-date",
      label: "history daily generated by date",
      requiredInput: "確定済みレース結果",
      expectedOutput:
        "public/data/analytics/kurari-ex/history/daily/YYYY-MM/YYYY-MM-DD.generated.json",
      existingScriptCandidates: [],
      existingOutputNow: historyCoverage.historySourceCount,
      readiness: historyCoverage.historySourceCount > 0 ? "partial" : "missing",
      notes:
        "既存daily JSONはありますが、この監査では生成scriptの存在を断定しません。",
    }),
    pipelineStep({
      root,
      stepId: "history-index",
      label: "history index updated",
      requiredInput: "history daily files",
      expectedOutput: HISTORY_INDEX_PATH,
      existingScriptCandidates: [],
      existingOutputNow: historyCoverage.historySourceCount,
      readiness: existsSync(path.resolve(root, HISTORY_INDEX_PATH))
        ? "partial"
        : "missing",
      notes:
        "既存indexはありますが、この監査では生成scriptの存在を断定しません。",
    }),
    pipelineStep({
      root,
      stepId: "history-no-starters-bridge-dry-run",
      label: "history NO_STARTERS bridge dry-run",
      requiredInput: "history daily + starters source index",
      expectedOutput: "dry-run audit output",
      existingScriptCandidates: [
        "scripts/audit-kurari-ex-history-no-starters-bridge-dry-run.mjs",
      ],
      existingOutputNow: existsSync(
        path.resolve(root, "scripts/audit-kurari-ex-history-no-starters-bridge-dry-run.mjs"),
      ),
      readiness: "existing",
      notes: "dry-runのみ。history JSONへのwriteは行いません。",
    }),
    pipelineStep({
      root,
      stepId: "future-bridge-writer",
      label: "bridge writer in future separate process",
      requiredInput: "同日history + 同日starters source + 明示join key",
      expectedOutput: "future writer output",
      existingScriptCandidates: [],
      existingOutputNow: false,
      readiness: "future-accumulation",
      notes:
        "今回の対象外。writer実装時も同日・明示join key・fake禁止を維持します。",
    }),
  ];
}

function determineReadiness({
  blockReasonCounts,
  datePairCoverage,
  startersCoverage,
  entryCoverage,
}) {
  const hardBlockReasons = [
    "STARTERS_INDEX_MISSING",
    "STARTERS_INDEX_CHECK_FAILED",
    "STARTERS_SOURCE_MISSING",
    "STARTERS_SOURCE_CHECK_FAILED",
    "HISTORY_INDEX_MISSING",
    "HISTORY_SOURCE_MISSING",
    "ENTRY_SNAPSHOT_INDEX_MISSING",
    "ENTRY_SNAPSHOT_SOURCE_MISSING",
    "FAKE_COMPLETION_FOUND",
    "FUZZY_MATCHING_FOUND",
    "PROHIBITED_SOURCE_FOUND",
    "ANALYTICS_MODIFIED",
    "RACES_MODIFIED",
    "REVIEWS_MODIFIED",
    "PROTECTED_FILE_MODIFIED",
  ];
  const hardBlocks = hardBlockReasons.filter((reason) => blockReasonCounts[reason]);
  if (hardBlocks.length > 0) {
    return {
      status: "BLOCKED",
      secondaryStatuses: [],
      reason: "入力index/sourceまたは禁止条件にhard blockがあります。",
      hardBlocks,
    };
  }

  const secondaryStatuses = [];
  if (datePairCoverage.startersWithoutHistoryDateCount > 0) {
    secondaryStatuses.push("NEEDS_HISTORY_ACCUMULATION");
  }
  if (datePairCoverage.historyWithoutStartersDateCount > 0) {
    secondaryStatuses.push("NEEDS_STARTERS_SOURCE_ACCUMULATION");
  }
  if (datePairCoverage.historyWithoutEntriesDateCount > 0) {
    secondaryStatuses.push("NEEDS_ENTRY_SNAPSHOT_ACCUMULATION");
  }

  if (datePairCoverage.bridgeEligibleDateCount > 0) {
    return {
      status: "READY_FOR_SAME_DATE_BRIDGE_NOW",
      secondaryStatuses,
      reason: "同日history/startersとjoin key候補が揃った日付があります。",
      hardBlocks: [],
    };
  }

  const latestStartersDate = startersCoverage.latestStartersDate;
  const latestEntryDate = entryCoverage.entrySnapshotDates.at(-1) ?? null;
  if (
    latestStartersDate &&
    latestEntryDate === latestStartersDate &&
    datePairCoverage.startersWithoutHistoryDates.items.includes(latestStartersDate)
  ) {
    return {
      status: "READY_FOR_SAME_DATE_BRIDGE_WHEN_HISTORY_AVAILABLE",
      secondaryStatuses,
      reason:
        "最新starters/entriesは同日で揃っていますが、同日historyが未蓄積です。historyが追加されればbridge候補になります。",
      hardBlocks: [],
    };
  }

  if (startersCoverage.startersSourceCount === 0) {
    return {
      status: "NEEDS_STARTERS_SOURCE_ACCUMULATION",
      secondaryStatuses,
      reason: "保存済みstarters sourceがありません。",
      hardBlocks: [],
    };
  }
  if (entryCoverage.entrySnapshotCount === 0) {
    return {
      status: "NEEDS_ENTRY_SNAPSHOT_ACCUMULATION",
      secondaryStatuses,
      reason: "保存済みentries-history snapshotがありません。",
      hardBlocks: [],
    };
  }
  if (datePairCoverage.matchedDateCount === 0) {
    return {
      status: "NEEDS_HISTORY_ACCUMULATION",
      secondaryStatuses,
      reason: "historyとstartersの同日ペアがまだありません。",
      hardBlocks: [],
    };
  }
  return {
    status: "NEEDS_PIPELINE_MAPPING",
    secondaryStatuses,
    reason: "同日ペアはありますが、bridge eligible条件を満たすjoin key候補がありません。",
    hardBlocks: [],
  };
}

function buildSummary({
  startersCoverage,
  historyCoverage,
  entryCoverage,
  datePairCoverage,
  backfillReadiness,
  sameDateAccumulationReadiness,
  blockReasonCounts,
}) {
  const noStartersMarkerCount = Object.values(
    historyCoverage.noStartersMarkerCountByDate,
  ).reduce((total, count) => total + count, 0);
  return {
    startersSourceCount: startersCoverage.startersSourceCount,
    startersDateRange: startersCoverage.startersDateRange,
    latestStartersDate: startersCoverage.latestStartersDate,
    historySourceCount: historyCoverage.historySourceCount,
    historyDateRange: historyCoverage.historyDateRange,
    entrySnapshotCount: entryCoverage.entrySnapshotCount,
    entrySnapshotDateRange: entryCoverage.entrySnapshotDateRange,
    matchedDateCount: datePairCoverage.matchedDateCount,
    bridgeEligibleDateCount: datePairCoverage.bridgeEligibleDateCount,
    startersWithoutHistoryDateCount:
      datePairCoverage.startersWithoutHistoryDateCount,
    historyWithoutStartersDateCount:
      datePairCoverage.historyWithoutStartersDateCount,
    entriesWithoutStartersDateCount:
      datePairCoverage.entriesWithoutStartersDateCount,
    noStartersMarkerCount,
    backfillableDateCount: backfillReadiness.backfillableDateCount,
    blockedDateCount: backfillReadiness.blockedDateCount,
    sameDateAccumulationReadiness,
    blockReasonCounts,
    ...REQUIRED_FLAGS,
  };
}

function addExpectedDateGapReasons(datePairCoverage, blockReasonCounts) {
  if (datePairCoverage.matchedDateCount === 0) {
    increment(blockReasonCounts, "SAME_DATE_PAIR_NOT_FOUND");
  }
  if (datePairCoverage.startersWithoutHistoryDateCount > 0) {
    increment(
      blockReasonCounts,
      "HISTORY_DATE_MISSING_FOR_STARTERS_DATE",
      datePairCoverage.startersWithoutHistoryDateCount,
    );
  }
  if (datePairCoverage.historyWithoutStartersDateCount > 0) {
    increment(
      blockReasonCounts,
      "STARTERS_DATE_MISSING_FOR_HISTORY_DATE",
      datePairCoverage.historyWithoutStartersDateCount,
    );
  }
  if (datePairCoverage.historyWithoutEntriesDateCount > 0) {
    increment(
      blockReasonCounts,
      "ENTRY_SNAPSHOT_DATE_MISSING",
      datePairCoverage.historyWithoutEntriesDateCount,
    );
  }
}

function normalizeBlockReasonCounts(blockReasonCounts) {
  return Object.fromEntries(
    Object.entries(blockReasonCounts)
      .filter(([, count]) => count > 0)
      .sort(([left], [right]) => {
        const leftIndex = BLOCK_REASON_KEYS.indexOf(left);
        const rightIndex = BLOCK_REASON_KEYS.indexOf(right);
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

export async function auditSameDateAccumulationReadiness(root = process.cwd()) {
  const blockReasonCounts = {};
  const startersCoverage = await buildStartersCoverage(root, blockReasonCounts);
  const historyCoverage = await buildHistoryCoverage(root, blockReasonCounts);
  const entryCoverage = await buildEntrySnapshotCoverage(root, blockReasonCounts);
  const datePairCoverage = buildDatePairCoverage(
    startersCoverage,
    historyCoverage,
    entryCoverage,
  );
  addExpectedDateGapReasons(datePairCoverage, blockReasonCounts);
  const sameDatePairCandidates = buildSameDatePairCandidates(
    startersCoverage,
    historyCoverage,
    datePairCoverage,
  );
  const backfillReadiness = buildBackfillReadiness(
    historyCoverage,
    startersCoverage,
    entryCoverage,
  );
  const sameDateAccumulationReadiness = determineReadiness({
    blockReasonCounts,
    datePairCoverage,
    startersCoverage,
    entryCoverage,
  });
  const pipelineSteps = buildPipelineSteps(root, {
    startersCoverage,
    historyCoverage,
    entryCoverage,
  });
  const normalizedBlockReasonCounts =
    normalizeBlockReasonCounts(blockReasonCounts);
  const summary = buildSummary({
    startersCoverage,
    historyCoverage,
    entryCoverage,
    datePairCoverage,
    backfillReadiness,
    sameDateAccumulationReadiness,
    blockReasonCounts: normalizedBlockReasonCounts,
  });

  return {
    summary,
    startersCoverage: {
      ...startersCoverage,
      starterJoinKeysByDate: Object.fromEntries(
        Object.entries(startersCoverage.starterJoinKeysByDate).map(
          ([date, keys]) => [date, limitItems(keys)],
        ),
      ),
    },
    historyCoverage: {
      ...historyCoverage,
      rawHistoryJoinKeysByDate: undefined,
    },
    entrySnapshotCoverage: entryCoverage,
    datePairCoverage,
    pipelineSteps,
    backfillReadiness,
    sameDatePairCandidates,
    jsonSummary: {
      status: sameDateAccumulationReadiness.status,
      latestStartersDate: startersCoverage.latestStartersDate,
      latestHistoryDate: historyCoverage.historyDates.at(-1) ?? null,
      latestEntrySnapshotDate: entryCoverage.entrySnapshotDates.at(-1) ?? null,
      matchedDateCount: datePairCoverage.matchedDateCount,
      bridgeEligibleDateCount: datePairCoverage.bridgeEligibleDateCount,
      writesPerformed: false,
      protectedWritesPerformed: false,
      fakeCompletionPerformed: false,
      fuzzyMatchingPerformed: false,
      resultLineupPredictionUsedAsStarterSource: false,
      blockReasonCounts: normalizedBlockReasonCounts,
    },
  };
}

async function main() {
  const result = await auditSameDateAccumulationReadiness();
  printSection("summary", result.summary);
  printSection("datePairCoverage", result.datePairCoverage);
  printSection("pipelineSteps", result.pipelineSteps);
  printSection("backfillReadiness", result.backfillReadiness);
  printSection("sameDatePairCandidates", result.sameDatePairCandidates);
  printSection("jsonSummary", result.jsonSummary);
  if (result.summary.sameDateAccumulationReadiness.status === "BLOCKED") {
    process.exitCode = 1;
  }
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  main().catch((error) => {
    console.error(
      "[kurari-ex history/starters same-date accumulation readiness audit] failed",
    );
    console.error(error);
    process.exitCode = 1;
  });
}
