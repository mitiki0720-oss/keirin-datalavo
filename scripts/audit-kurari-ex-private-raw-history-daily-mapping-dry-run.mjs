import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const TARGET_DATE = "2026-06-29";
const RAW_ROOT = `private-input/kurari-ex/raw/${TARGET_DATE}`;
const HISTORY_SAMPLE_PATH =
  "public/data/analytics/kurari-ex/history/daily/2026-06/2026-06-24.generated.json";
const ENTRY_SNAPSHOT_PATH =
  "public/data/races/entries-history/2026-06-29/keirin-jp-entries.generated.json";
const STARTERS_SOURCE_PATH =
  "public/data/analytics/kurari-ex/source/starters/2026-06-29/today-registration-starters.generated.json";
const PREDICTION_DAILY_PATH =
  "public/data/predictions/daily/2026-06/2026-06-29.generated.json";
const OUTPUT_PATH_CANDIDATE =
  "public/data/analytics/kurari-ex/history/daily/2026-06/2026-06-29.generated.json";
const MAX_SAMPLE = 10;

const VENUE_SLUG_TO_NAME = {
  gifu: "岐阜",
  ito: "伊東",
  kochi: "高知",
  sasebo: "佐世保",
  takeo: "武雄",
  tamano: "玉野",
  toride: "取手",
};

const FLAGS = {
  writesPerformed: false,
  analyticsModified: false,
  racesModified: false,
  reviewsModified: false,
  privateInputModified: false,
  protectedFilesModified: false,
  fakeCompletionPerformed: false,
  fuzzyMatchingPerformed: false,
  predictionUsedAsResultSource: false,
  startersIdentityGeneratedFromPrediction: false,
};

const BLOCK_REASON_ORDER = [
  "PRIVATE_RAW_ROOT_MISSING",
  "TARGET_DATE_RESULT_FILES_MISSING",
  "TARGET_DATE_PREDICTION_FILES_MISSING",
  "TARGET_DATE_SUMMARY_FILES_MISSING",
  "RESULT_PARSE_FAILED",
  "PREDICTION_PARSE_FAILED",
  "SUMMARY_PARSE_FAILED",
  "RESULT_RACE_COUNT_ZERO",
  "RESULT_RACE_COUNT_MISMATCH",
  "PREDICTION_RACE_COUNT_MISMATCH",
  "ENTRY_SNAPSHOT_RACE_COUNT_MISMATCH",
  "STARTERS_SOURCE_RACE_COUNT_MISMATCH",
  "DUPLICATE_RACE_KEY",
  "RACE_KEY_MISSING",
  "VENUE_KEY_MISSING",
  "VENUE_NAME_MISSING",
  "RACE_NUMBER_MISSING",
  "RESULT_FIELD_MISSING",
  "HISTORY_SCHEMA_UNSUPPORTED",
  "HISTORY_SCHEMA_PARSE_FAILED",
  "CANDIDATE_SCHEMA_INCOMPATIBLE",
  "FAKE_COMPLETION_FOUND",
  "FUZZY_MATCHING_FOUND",
  "PROHIBITED_SOURCE_FOUND",
  "ANALYTICS_MODIFIED",
  "RACES_MODIFIED",
  "REVIEWS_MODIFIED",
  "PRIVATE_INPUT_MODIFIED",
  "PROTECTED_FILE_MODIFIED",
  "PACKAGE_MODIFIED",
];

function abs(file) {
  return path.isAbsolute(file) ? file : path.resolve(ROOT, file);
}

function rel(file) {
  return path.relative(ROOT, file).replaceAll("\\", "/");
}

function normalizeText(value) {
  return String(value ?? "")
    .replace(/^\uFEFF/u, "")
    .replace(/\r\n?/gu, "\n")
    .normalize("NFKC");
}

function increment(counter, key, by = 1) {
  counter[key] = (counter[key] ?? 0) + by;
}

function limit(items, max = MAX_SAMPLE) {
  return [...items].slice(0, max);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toNumber(value) {
  const match = normalizeText(value).replaceAll(",", "").match(/[+-]?\d+(?:\.\d+)?/u);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) ? number : null;
}

function canonicalCombination(value, length) {
  const numbers = normalizeText(value).match(/[1-9]/gu) ?? [];
  return numbers.length >= length ? numbers.slice(0, length).join("-") : "";
}

async function readJson(file) {
  return JSON.parse(await readFile(abs(file), "utf8"));
}

async function collectFiles(directory) {
  const root = abs(directory);
  if (!existsSync(root)) return [];
  const files = [];
  async function visit(current) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(target);
      if (entry.isFile()) files.push(target);
    }
  }
  await visit(root);
  return files.sort((left, right) => rel(left).localeCompare(rel(right)));
}

function fileType(file) {
  const name = path.basename(file);
  if (/-result\.txt$/u.test(name)) return "result";
  if (/-prediction\.txt$/u.test(name)) return "prediction";
  if (/-summary\.txt$/u.test(name)) return "summary";
  return "extra";
}

function venueSlugFromFile(file) {
  return path.basename(file).replace(/-(?:result|prediction|summary)\.txt$/u, "");
}

function splitRaceBlocks(text) {
  const normalized = normalizeText(text);
  const matches = [...normalized.matchAll(/^■\s+(.+?)\s+(\d{1,2})R\s*$/gmu)];
  return matches.map((match, index) => ({
    venueName: match[1].trim(),
    raceNumber: Number(match[2]),
    text: normalized.slice(match.index, matches[index + 1]?.index ?? normalized.length).trim(),
  }));
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1] != null) return match[1].trim();
  }
  return "";
}

function parseLineup(value) {
  const raw = normalizeText(value)
    .replace(/^.*?(?:並び|ライン|周回予想)\s*[:：]\s*/u, "")
    .replace(/[（(]単騎[）)]/gu, "")
    .replace(/\s+/gu, "");
  if (!raw || /ガールズ|ラインなし|不明|未掲載|なし/u.test(raw)) {
    return { lines: [], status: raw ? "missing" : "missing" };
  }
  const lines = raw
    .split(/[\/／|｜]/u)
    .map((group) => {
      const compact = group.replace(/[^\d-]/gu, "");
      if (/^\d{2,9}$/u.test(compact)) return compact.split("").map(Number);
      return compact.match(/\d+/gu)?.map(Number) ?? [];
    })
    .filter((line) => line.length > 0);
  const cars = lines.flat();
  const parsed = lines.length > 0 && new Set(cars).size === cars.length;
  return { lines: parsed ? lines : [], status: parsed ? "parsed" : "missing" };
}

function parseFinishOrder(block) {
  const section = firstMatch(block, [/【全着順】\n([\s\S]*?)(?=\n【|----|$)/u]);
  const order = [];
  for (const line of section.split("\n")) {
    const match = line.match(/^(\d+)着\s*[:：]\s*(\d+)\s*(.*?)\s*(?:\/|$)/u);
    if (!match) continue;
    const name = match[3].replace(/^[SB]\s+/u, "").trim();
    order.push({
      rank: Number(match[1]),
      carNo: Number(match[2]),
      name,
      winningMethod: firstMatch(line, [/決まり手\s*([^\s/]+)/u]),
      resultTime: firstMatch(line, [/上がり\s*([\d.]+)/u]),
      margin: firstMatch(line, /\/\s*([^/]*?車身|[^/]*?車輪|大差)/u ? [/\/\s*([^/]*?車身|[^/]*?車輪|大差)/u] : []),
    });
  }
  return order.sort((left, right) => left.rank - right.rank);
}

function parseShb(block, marker) {
  const line = firstMatch(block, [/^SHB\s*[:：]\s*([^\n]+)/mu]);
  const pattern = marker === "S"
    ? /S\s*[:：]?\s*(\d+)\s*([^/]+)?/u
    : /B\s*[:：]?\s*(\d+)\s*([^/]+)?/u;
  const match = line.match(pattern);
  if (!match) return null;
  return { carNo: Number(match[1]), name: String(match[2] ?? "").trim() };
}

function parseWeather(block) {
  const windRaw = firstMatch(block, [/風速\s*[:：]\s*([^\n]+)/u]);
  let windSpeedMps = toNumber(windRaw);
  if (windSpeedMps != null && /km\/h|kmh/u.test(windRaw)) {
    windSpeedMps = Number((windSpeedMps / 3.6).toFixed(1));
  }
  return {
    condition: firstMatch(block, [/天候\s*[:：]\s*([^\n]+)/u]),
    windDirection: firstMatch(block, [/風向\s*[:：]\s*([^\n]+)/u]),
    windSpeedMps,
  };
}

function parsePayoff(block, label, length) {
  const line = firstMatch(block, [new RegExp(`^${label}\\s*[:：]\\s*([^\\n]+)`, "mu")]);
  return {
    combination: canonicalCombination(line, length),
    payoutYen: toNumber(line.match(/([0-9,]+)\s*円/u)?.[1]),
  };
}

function parseFavorite(block) {
  const line = firstMatch(block, [/最終1番人気オッズ\s*[:：]\s*([^\n]+)/u]);
  return {
    combination: canonicalCombination(line, 3),
    odds: toNumber(line.match(/([\d.]+)\s*倍/u)?.[1]),
  };
}

function parseRaceTitle(block) {
  return firstMatch(block, [/レース名\s*[:：]\s*(?:20\d{2}年\d{2}月\d{2}日\s*)?(?:レース詳細\s*)?([^\n]+)/u]);
}

function parseResultFile(file) {
  const venueKey = venueSlugFromFile(file);
  const sourceFile = rel(file);
  return readFile(file, "utf8").then((text) => {
    const blocks = splitRaceBlocks(text);
    const warnings = [];
    const races = blocks.map((block) => {
      const raceKey = `${TARGET_DATE}:${venueKey}:${block.raceNumber}`;
      const finishOrder = parseFinishOrder(block.text);
      const trifecta = parsePayoff(block.text, "3連単", 3);
      const exacta = parsePayoff(block.text, "2車単", 2);
      const status = /結果確定\s*[:：]\s*confirmed/u.test(block.text) || trifecta.combination
        ? "finished"
        : "unknown";
      if (!finishOrder.length || !trifecta.combination) warnings.push(`${raceKey}: result field incomplete`);
      return {
        raceKey,
        date: TARGET_DATE,
        venueKey,
        venueName: block.venueName || VENUE_SLUG_TO_NAME[venueKey] || venueKey,
        raceNumber: block.raceNumber,
        raceTitle: parseRaceTitle(block.text),
        operationStatus: status,
        result: {
          status,
          first: {
            carNo: finishOrder[0]?.carNo ?? null,
            name: finishOrder[0]?.name ?? "",
            winningMethod: finishOrder[0]?.winningMethod || firstMatch(block.text, [/1着の決まり手\s*[:：]\s*([^\n]+)/u]),
          },
          second: {
            carNo: finishOrder[1]?.carNo ?? null,
            name: finishOrder[1]?.name ?? "",
          },
          third: {
            carNo: finishOrder[2]?.carNo ?? null,
            name: finishOrder[2]?.name ?? "",
          },
          finishOrder,
          trifecta,
          exacta,
          payoff2quinella: parsePayoff(block.text, "2車複", 2),
          payoff3quinella: parsePayoff(block.text, "3連複", 3),
          favoriteTrifecta: parseFavorite(block.text),
          sRider: parseShb(block.text, "S"),
          bRider: parseShb(block.text, "B"),
        },
        weather: parseWeather(block.text),
        metadata: {
          sourceFile,
          parserConfidence: finishOrder.length && trifecta.combination ? "high" : "partial",
          rawLineCount: block.text.split("\n").length,
          extractedLineCount: finishOrder.length,
        },
      };
    });
    return { file: sourceFile, venueKey, races, warnings };
  });
}

function parseTickets(block, label, length) {
  const lines = block.split("\n");
  const sectionStart = lines.findIndex((line) => line.includes(label));
  if (sectionStart < 0) return [];
  const tickets = [];
  for (const line of lines.slice(sectionStart + 1)) {
    if (/^【|^■|^#|^----/u.test(line)) break;
    const combo = canonicalCombination(line, length);
    if (combo) tickets.push(combo);
  }
  return [...new Set(tickets)];
}

async function parsePredictionFile(file) {
  const venueKey = venueSlugFromFile(file);
  const sourceFile = rel(file);
  const text = await readFile(file, "utf8");
  const blocks = splitRaceBlocks(text);
  const warnings = [];
  const races = blocks.map((block) => {
    const raceKey = `${TARGET_DATE}:${venueKey}:${block.raceNumber}`;
    const header = block.text.split("\n").find((line) => line.includes("｜")) ?? "";
    const lineupText = firstMatch(block.text, [/【並び】\n([\s\S]*?)(?=\n【|$)/u]);
    const raceClass = header.split("｜").find((part) => /級|ガールズ|決勝|特選|一般/u.test(part) && !/競輪場/u.test(part)) ?? "";
    const prediction = {
      trifectaTickets: parseTickets(block.text, "3連単", 3),
      exactaTickets: parseTickets(block.text, "2車単", 2),
      confidence: /勝負レース/u.test(block.text) ? "勝負レース" : "",
      raceType: firstMatch(block.text, [/レース型\s*[:：]\s*([^\n]+)/u]),
      tags: [...block.text.matchAll(/#[^\s#]+/gu)].map((match) => match[0]).slice(0, 30),
    };
    if (!prediction.trifectaTickets.length && !prediction.exactaTickets.length) {
      warnings.push(`${raceKey}: prediction tickets missing`);
    }
    return {
      raceKey,
      date: TARGET_DATE,
      venueKey,
      venueName: block.venueName || VENUE_SLUG_TO_NAME[venueKey] || venueKey,
      raceNumber: block.raceNumber,
      grade: header.match(/\b(G[123]|F[12])\b/u)?.[1] ?? "",
      timeslot: /モーニング/u.test(header) ? "morning" : /ミッドナイト/u.test(header) ? "midnight" : /ナイター/u.test(header) ? "night" : "",
      raceClass: raceClass.trim(),
      starterCount: toNumber(header.match(/(\d+)\s*車/u)?.[1]),
      lineup: parseLineup(lineupText),
      prediction,
      sourceFile,
    };
  });
  return { file: sourceFile, venueKey, races, warnings };
}

async function parseSummaryFiles(files) {
  let hasReviewAnalysis = false;
  let hasResultReflection = false;
  let hasFutureCorrectionNotes = false;
  const limitations = ["summary is auxiliary only; not treated as official result source"];
  for (const file of files) {
    const text = normalizeText(await readFile(file, "utf8"));
    hasReviewAnalysis ||= /反省|分析|サマリ|レポート/u.test(text);
    hasResultReflection ||= /結果|的中|回収|収支/u.test(text);
    hasFutureCorrectionNotes ||= /次回|修正|チェックリスト/u.test(text);
  }
  return {
    summaryFileCount: files.length,
    hasReviewAnalysis,
    hasResultReflection,
    hasFutureCorrectionNotes,
    usableForHistoryDaily: hasResultReflection ? "partial" : "no",
    limitations,
  };
}

async function privateRawScan(blockReasonCounts) {
  const files = await collectFiles(RAW_ROOT);
  const grouped = {
    result: files.filter((file) => fileType(file) === "result"),
    prediction: files.filter((file) => fileType(file) === "prediction"),
    summary: files.filter((file) => fileType(file) === "summary"),
    extra: files.filter((file) => fileType(file) === "extra"),
  };
  if (!existsSync(abs(RAW_ROOT))) increment(blockReasonCounts, "PRIVATE_RAW_ROOT_MISSING");
  if (!grouped.result.length) increment(blockReasonCounts, "TARGET_DATE_RESULT_FILES_MISSING");
  if (!grouped.prediction.length) increment(blockReasonCounts, "TARGET_DATE_PREDICTION_FILES_MISSING");
  if (!grouped.summary.length) increment(blockReasonCounts, "TARGET_DATE_SUMMARY_FILES_MISSING");
  const venueSlugs = [...new Set(files.map(venueSlugFromFile).filter(Boolean))].sort();
  const missingPairedFiles = [];
  for (const slug of venueSlugs) {
    for (const type of ["result", "prediction", "summary"]) {
      if (!grouped[type].some((file) => venueSlugFromFile(file) === slug)) {
        missingPairedFiles.push(`${slug}-${type}.txt`);
      }
    }
  }
  return {
    rawRoot: RAW_ROOT,
    exists: existsSync(abs(RAW_ROOT)),
    totalFileCount: files.length,
    resultFileCount: grouped.result.length,
    predictionFileCount: grouped.prediction.length,
    summaryFileCount: grouped.summary.length,
    venueSlugs,
    venueCount: venueSlugs.length,
    resultFiles: grouped.result.map(rel),
    predictionFiles: grouped.prediction.map(rel),
    summaryFiles: grouped.summary.map(rel),
    missingPairedFiles,
    extraFiles: grouped.extra.map(rel),
    parseStatus: missingPairedFiles.length ? "partial" : "ok",
    warnings: [
      ...missingPairedFiles.map((file) => `missing paired file: ${file}`),
      ...grouped.extra.map((file) => `extra file: ${rel(file)}`),
    ],
    filesByType: grouped,
  };
}

function fieldType(value) {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

async function extractHistoryDailySchema(blockReasonCounts) {
  try {
    const payload = await readJson(HISTORY_SAMPLE_PATH);
    const items = asArray(payload.items);
    const fieldTypes = {};
    const nullability = {};
    for (const item of items) {
      for (const [key, value] of Object.entries(item)) {
        fieldTypes[key] ??= new Set();
        fieldTypes[key].add(fieldType(value));
        nullability[key] ??= { null: 0, nonNull: 0 };
        if (value == null || value === "") nullability[key].null += 1;
        else nullability[key].nonNull += 1;
      }
    }
    const sample = items.slice(0, 3).map((item) => ({
      raceKey: item.raceKey,
      date: item.date,
      venueKey: item.venueKey,
      venueName: item.venueName,
      raceNumber: item.raceNumber,
      operationStatus: item.operationStatus,
      starterCount: item.starterCount,
      startersLength: asArray(item.starters).length,
      resultKeys: Object.keys(item.result ?? {}),
      predictionKeys: item.prediction ? Object.keys(item.prediction) : [],
    }));
    return {
      samplePath: HISTORY_SAMPLE_PATH,
      schemaVersion: payload.schemaVersion,
      topLevelKeys: Object.keys(payload).sort(),
      itemArrayKeyCandidates: ["items"],
      itemCount: items.length,
      requiredItemFields: [
        "raceKey",
        "date",
        "venueKey",
        "venueName",
        "raceNumber",
        "operationStatus",
        "starterCount",
        "starters",
        "result",
        "quality",
      ],
      optionalItemFields: ["grade", "timeslot", "raceClass", "lineup", "weather", "prediction", "predictionEnrichment"],
      fieldTypes: Object.fromEntries(Object.entries(fieldTypes).map(([key, set]) => [key, [...set].sort()])),
      resultFieldShape: Object.keys(items[0]?.result ?? {}).sort(),
      predictionFieldShape: Object.keys(items.find((item) => item.prediction)?.prediction ?? {}).sort(),
      lineupFieldShape: Object.keys(items[0]?.lineup ?? {}).sort(),
      conditionFieldShape: Object.keys(items[0]?.weather ?? {}).sort(),
      startersFieldShape: Object.keys(asArray(items.find((item) => item.starters?.length)?.starters)[0] ?? {}).sort(),
      nullabilitySummary: nullability,
      noStartersMarkerPattern: "starterCount > 0 && starters.length === 0 or quality.starterParsed === false",
      raceKeyPattern: "YYYY-MM-DD:venueKey:raceNumber",
      dateVenueRaceNumberPattern: "date + venueName/venueKey + raceNumber",
      sampleItemRedacted: sample,
    };
  } catch (error) {
    increment(blockReasonCounts, "HISTORY_SCHEMA_PARSE_FAILED");
    return { samplePath: HISTORY_SAMPLE_PATH, parseStatus: "failed", error: error.message };
  }
}

function summarizeParsedResults(parsed, blockReasonCounts) {
  const races = parsed.flatMap((item) => item.races);
  const raceKeys = races.map((race) => race.raceKey).filter(Boolean);
  const duplicateRaceKeyCount = raceKeys.length - new Set(raceKeys).size;
  const missingCoreFieldCounts = {
    raceKey: races.filter((race) => !race.raceKey).length,
    date: races.filter((race) => !race.date).length,
    venueName: races.filter((race) => !race.venueName).length,
    venueKey: races.filter((race) => !race.venueKey).length,
    raceNumber: races.filter((race) => !race.raceNumber).length,
    result: races.filter((race) => !race.result?.trifecta?.combination).length,
  };
  if (!races.length) increment(blockReasonCounts, "RESULT_RACE_COUNT_ZERO");
  if (duplicateRaceKeyCount) increment(blockReasonCounts, "DUPLICATE_RACE_KEY", duplicateRaceKeyCount);
  for (const [field, count] of Object.entries(missingCoreFieldCounts)) {
    if (!count) continue;
    const reason = field === "result" ? "RESULT_FIELD_MISSING" : `${field.toUpperCase()}_MISSING`;
    increment(blockReasonCounts, reason, count);
  }
  return {
    resultRaceCount: races.length,
    settledRaceCount: races.filter((race) => race.operationStatus === "finished").length,
    cancelledRaceCount: races.filter((race) => race.operationStatus === "cancelled").length,
    venueCount: new Set(races.map((race) => race.venueKey)).size,
    raceCountByVenue: Object.fromEntries(
      [...new Set(races.map((race) => race.venueKey))].sort().map((venue) => [
        venue,
        races.filter((race) => race.venueKey === venue).length,
      ]),
    ),
    missingCoreFieldCounts,
    duplicateRaceKeyCount,
    parseWarningCount: parsed.reduce((sum, item) => sum + item.warnings.length, 0),
    resultCompleteness: races.length && !missingCoreFieldCounts.result && !duplicateRaceKeyCount ? "complete" : races.length ? "partial" : "incomplete",
    sampleParsedResults: limit(races.map((race) => ({
      raceKey: race.raceKey,
      venueName: race.venueName,
      raceNumber: race.raceNumber,
      trifecta: race.result.trifecta,
      exacta: race.result.exacta,
      first: race.result.first,
      weather: race.weather,
      sourceFile: race.metadata.sourceFile,
    }))),
    races,
  };
}

function summarizePredictions(parsed, blockReasonCounts) {
  const races = parsed.flatMap((item) => item.races);
  const raceKeys = races.map((race) => race.raceKey).filter(Boolean);
  const duplicateRaceKeyCount = raceKeys.length - new Set(raceKeys).size;
  const missingCoreFieldCounts = {
    raceKey: races.filter((race) => !race.raceKey).length,
    date: races.filter((race) => !race.date).length,
    venueName: races.filter((race) => !race.venueName).length,
    venueKey: races.filter((race) => !race.venueKey).length,
    raceNumber: races.filter((race) => !race.raceNumber).length,
    prediction: races.filter((race) => !race.prediction.trifectaTickets.length && !race.prediction.exactaTickets.length).length,
  };
  if (duplicateRaceKeyCount) increment(blockReasonCounts, "DUPLICATE_RACE_KEY", duplicateRaceKeyCount);
  return {
    predictionRaceCount: races.length,
    venueCount: new Set(races.map((race) => race.venueKey)).size,
    raceCountByVenue: Object.fromEntries(
      [...new Set(races.map((race) => race.venueKey))].sort().map((venue) => [
        venue,
        races.filter((race) => race.venueKey === venue).length,
      ]),
    ),
    missingCoreFieldCounts,
    duplicateRaceKeyCount,
    parseWarningCount: parsed.reduce((sum, item) => sum + item.warnings.length, 0),
    predictionCompleteness: races.length && !missingCoreFieldCounts.prediction ? "complete" : races.length ? "partial" : "incomplete",
    sampleParsedPredictions: limit(races.map((race) => ({
      raceKey: race.raceKey,
      venueName: race.venueName,
      raceNumber: race.raceNumber,
      starterCount: race.starterCount,
      lineup: race.lineup,
      trifectaTickets: race.prediction.trifectaTickets.slice(0, 3),
      exactaTickets: race.prediction.exactaTickets.slice(0, 3),
      sourceFile: race.sourceFile,
    }))),
    races,
  };
}

async function sourceRaceCount(file, key = "raceCount") {
  if (!existsSync(abs(file))) return null;
  const payload = await readJson(file);
  return payload.summary?.[key] ?? payload[key] ?? asArray(payload.races).length ?? asArray(payload.items).length;
}

function stableHash(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function buildCandidatePayload({ results, predictions, startersByKey }) {
  const predictionByKey = new Map(predictions.map((race) => [race.raceKey, race]));
  const items = results.map((race) => {
    const prediction = predictionByKey.get(race.raceKey) ?? null;
    const starterCount = prediction?.starterCount ?? startersByKey.get(race.raceKey)?.starterCount ?? race.result.finishOrder.length;
    return {
      raceKey: race.raceKey,
      raceId: "",
      date: race.date,
      venueKey: race.venueKey,
      venueName: race.venueName,
      raceNumber: race.raceNumber,
      grade: prediction?.grade ?? "",
      timeslot: prediction?.timeslot ?? "",
      raceClass: prediction?.raceClass || race.raceTitle || "",
      operationStatus: race.operationStatus,
      starterCount,
      starters: [],
      lineup: prediction?.lineup ?? { lines: [], status: "missing" },
      weather: race.weather,
      result: {
        status: race.result.status,
        first: race.result.first,
        second: race.result.second,
        third: race.result.third,
        trifecta: race.result.trifecta,
        exacta: race.result.exacta,
        favoriteTrifecta: race.result.favoriteTrifecta,
        ...(race.result.sRider ? { sRider: race.result.sRider } : {}),
        ...(race.result.bRider ? { bRider: race.result.bRider } : {}),
      },
      prediction: prediction?.prediction ?? null,
      predictionEnrichment: {
        status: prediction ? "matched" : "missing",
        matchedBy: prediction ? "raceKey" : null,
      },
      quality: {
        resultParsed: Boolean(race.result.trifecta.combination),
        predictionParsed: Boolean(prediction),
        lineupParsed: prediction?.lineup?.status === "parsed",
        starterParsed: false,
        warnings: ["starter identity intentionally not generated in this dry-run"],
      },
    };
  }).sort((left, right) => left.venueKey.localeCompare(right.venueKey) || left.raceNumber - right.raceNumber);
  return {
    schemaVersion: 1,
    date: TARGET_DATE,
    raceCount: items.length,
    settledRaceCount: items.filter((item) => item.operationStatus === "finished").length,
    cancelledRaceCount: items.filter((item) => item.operationStatus === "cancelled").length,
    predictionCoverage: {
      matchedRaceCount: items.filter((item) => item.predictionEnrichment.status === "matched").length,
      totalRaceCount: items.length,
      coverageRate: items.length
        ? Number(((items.filter((item) => item.predictionEnrichment.status === "matched").length / items.length) * 100).toFixed(1))
        : 0,
      status: items.every((item) => item.predictionEnrichment.status === "matched") ? "complete" : "partial",
    },
    items,
  };
}

function schemaCompatibility(candidate) {
  const required = ["raceKey", "date", "venueKey", "venueName", "raceNumber", "operationStatus", "starterCount", "starters", "result", "quality"];
  const missing = candidate.items.flatMap((item) => required.filter((field) => item[field] == null || item[field] === ""));
  if (!missing.length) return "compatible";
  if (missing.length < candidate.items.length) return "partial";
  return "incompatible";
}

function normalizeBlockReasons(counter) {
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

function readinessStatus({ resultSummary, mappingDryRun, countComparison }) {
  const secondaryStatuses = [];
  if (resultSummary.resultCompleteness !== "complete") secondaryStatuses.push("NEEDS_RESULT_PARSER_FIX");
  if (mappingDryRun.candidateSchemaCompatibility === "incompatible") secondaryStatuses.push("NEEDS_HISTORY_SCHEMA_MAPPING");
  if (!countComparison.allCountsAligned) secondaryStatuses.push("NEEDS_COUNT_RECONCILIATION");
  if (mappingDryRun.candidateMissingPredictionRaceCount > 0) secondaryStatuses.push("NEEDS_PREDICTION_MAPPING");
  let status = "READY_FOR_HISTORY_DAILY_WRITE_SAFETY_AUDIT";
  if (resultSummary.resultRaceCount === 0 || resultSummary.resultCompleteness === "incomplete") status = "NEEDS_RESULT_PARSER_FIX";
  else if (!countComparison.allCountsAligned) status = "NEEDS_COUNT_RECONCILIATION";
  else if (mappingDryRun.candidateSchemaCompatibility === "incompatible") status = "NEEDS_HISTORY_SCHEMA_MAPPING";
  else if (mappingDryRun.candidateSchemaCompatibility === "partial") status = "READY_FOR_HISTORY_DAILY_DRY_RUN_SCRIPT";
  return { status, secondaryStatuses: [...new Set(secondaryStatuses)] };
}

function nextActionPlan(status) {
  const prohibitedFiles = ["public/data/races/**", "public/data/analytics/**", "public/data/reviews/**", "private-input/**", "src/**", "package.json"];
  return [
    ["history-daily-write-safety-audit", "history daily write safety audit"],
    ["history-daily-writer-target-date", "history daily writer targetDate implementation"],
    ["history-index-update-dry-run", "history index update dry-run"],
    ["history-index-write-safety-audit", "history index write safety audit"],
    ["same-date-bridge-dry-run", "same-date bridge dry-run再実行"],
    ["future-bridge-writer", "bridge writerは別工程"],
  ].map(([stepId, action], index) => ({
    stepId,
    action,
    prerequisiteStatus: status.status,
    allowedFiles: index === 0 ? ["scripts/audit-*.mjs", "scripts/check-*.mjs"] : ["別工程で明示されたwriter/checkerのみ"],
    prohibitedFiles,
    readiness: status.status === "READY_FOR_HISTORY_DAILY_WRITE_SAFETY_AUDIT" && index === 0 ? "ready" : "future-accumulation",
    notes: "このauditでは生成・書き込み・stageを行わない。",
  }));
}

function printSection(label, value) {
  console.log(`[${label}]`);
  console.log(JSON.stringify(value, null, 2));
}

export async function auditPrivateRawHistoryDailyMappingDryRun() {
  const blockReasonCounts = {};
  const scan = await privateRawScan(blockReasonCounts);
  const historyDailySchema = await extractHistoryDailySchema(blockReasonCounts);
  const parsedResults = await Promise.all(scan.filesByType.result.map(parseResultFile));
  const parsedPredictions = await Promise.all(scan.filesByType.prediction.map(parsePredictionFile));
  const parsedSummaryInfo = await parseSummaryFiles(scan.filesByType.summary);
  const parsedResultSummary = summarizeParsedResults(parsedResults, blockReasonCounts);
  const parsedPredictionSummary = summarizePredictions(parsedPredictions, blockReasonCounts);
  const startersPayload = await readJson(STARTERS_SOURCE_PATH);
  const startersByKey = new Map(asArray(startersPayload.races).map((race) => [
    `${race.date}:${race.venueName === "岐阜" ? "gifu" : Object.entries(VENUE_SLUG_TO_NAME).find(([, name]) => name === race.venueName)?.[0] ?? race.venueName}:${race.raceNumber}`,
    { starterCount: race.starterCount },
  ]));
  const candidate = buildCandidatePayload({
    results: parsedResultSummary.races,
    predictions: parsedPredictionSummary.races,
    startersByKey,
  });
  const candidateRaceKeys = candidate.items.map((item) => item.raceKey);
  const duplicateRaceKeyCount = candidateRaceKeys.length - new Set(candidateRaceKeys).size;
  const candidateMissingCoreFieldCounts = {
    raceKey: candidate.items.filter((item) => !item.raceKey).length,
    date: candidate.items.filter((item) => !item.date).length,
    venueName: candidate.items.filter((item) => !item.venueName).length,
    venueKey: candidate.items.filter((item) => !item.venueKey).length,
    raceNumber: candidate.items.filter((item) => !item.raceNumber).length,
    result: candidate.items.filter((item) => !item.result?.trifecta?.combination).length,
  };
  const candidateSchemaCompatibility = schemaCompatibility(candidate);
  if (candidateSchemaCompatibility === "incompatible") increment(blockReasonCounts, "CANDIDATE_SCHEMA_INCOMPATIBLE");
  const entrySnapshotRaceCount = await sourceRaceCount(ENTRY_SNAPSHOT_PATH, "raceCount");
  const exactStartersSourceRaceCount = startersPayload.summary?.raceCount ?? asArray(startersPayload.races).length;
  const predictionDailyRaceCount = existsSync(abs(PREDICTION_DAILY_PATH))
    ? await sourceRaceCount(PREDICTION_DAILY_PATH, "raceCount")
    : null;
  const countComparison = {
    resultRaceCount: parsedResultSummary.resultRaceCount,
    predictionRaceCount: parsedPredictionSummary.predictionRaceCount,
    entrySnapshotRaceCount,
    exactStartersSourceRaceCount,
    predictionDailyRaceCount,
    candidateMappedRaceCount: candidate.items.length,
    allCountsAligned: [
      parsedResultSummary.resultRaceCount,
      entrySnapshotRaceCount,
      exactStartersSourceRaceCount,
      candidate.items.length,
    ].every((count) => count === parsedResultSummary.resultRaceCount),
    mismatchReasons: [],
  };
  if (parsedPredictionSummary.predictionRaceCount !== parsedResultSummary.resultRaceCount) {
    countComparison.mismatchReasons.push("PREDICTION_RACE_COUNT_MISMATCH");
    increment(blockReasonCounts, "PREDICTION_RACE_COUNT_MISMATCH");
  }
  if (entrySnapshotRaceCount !== parsedResultSummary.resultRaceCount) {
    countComparison.mismatchReasons.push("ENTRY_SNAPSHOT_RACE_COUNT_MISMATCH");
    increment(blockReasonCounts, "ENTRY_SNAPSHOT_RACE_COUNT_MISMATCH");
  }
  if (exactStartersSourceRaceCount !== parsedResultSummary.resultRaceCount) {
    countComparison.mismatchReasons.push("STARTERS_SOURCE_RACE_COUNT_MISMATCH");
    increment(blockReasonCounts, "STARTERS_SOURCE_RACE_COUNT_MISMATCH");
  }
  const mappingDryRun = {
    targetDate: TARGET_DATE,
    outputPathCandidate: OUTPUT_PATH_CANDIDATE,
    candidateItemCount: candidate.items.length,
    candidateRaceCount: candidate.raceCount,
    candidateVenueCount: new Set(candidate.items.map((item) => item.venueKey)).size,
    candidateSettledRaceCount: candidate.settledRaceCount,
    candidateCancelledRaceCount: candidate.cancelledRaceCount,
    candidatePredictionLinkedRaceCount: candidate.predictionCoverage.matchedRaceCount,
    candidateMissingPredictionRaceCount: candidate.items.length - candidate.predictionCoverage.matchedRaceCount,
    candidateNoStartersMarkerCount: candidate.items.filter((item) => item.starterCount > 0 && item.starters.length === 0).length,
    candidateDuplicateRaceKeyCount: duplicateRaceKeyCount,
    candidateMissingCoreFieldCounts,
    candidateSchemaCompatibility,
    candidateWriteNeeded: false,
    candidatePayloadHash: stableHash(candidate),
    sampleMappedItems: limit(candidate.items.map((item) => ({
      raceKey: item.raceKey,
      venueName: item.venueName,
      raceNumber: item.raceNumber,
      starterCount: item.starterCount,
      startersLength: item.starters.length,
      result: item.result.trifecta,
      predictionStatus: item.predictionEnrichment.status,
      quality: item.quality,
    }))),
    notWritten: true,
  };
  const privateRawHistoryDailyMappingReadiness = readinessStatus({
    resultSummary: parsedResultSummary,
    mappingDryRun,
    countComparison,
  });
  const summary = {
    targetDate: TARGET_DATE,
    privateRawRootExists: scan.exists,
    resultFileCount: scan.resultFileCount,
    predictionFileCount: scan.predictionFileCount,
    summaryFileCount: scan.summaryFileCount,
    venueCount: scan.venueCount,
    resultRaceCount: parsedResultSummary.resultRaceCount,
    predictionRaceCount: parsedPredictionSummary.predictionRaceCount,
    entrySnapshotRaceCount,
    exactStartersSourceRaceCount,
    candidateMappedRaceCount: mappingDryRun.candidateMappedRaceCount,
    candidateVenueCount: mappingDryRun.candidateVenueCount,
    candidatePredictionLinkedRaceCount: mappingDryRun.candidatePredictionLinkedRaceCount,
    candidateNoStartersMarkerCount: mappingDryRun.candidateNoStartersMarkerCount,
    candidateSchemaCompatibility,
    allCountsAligned: countComparison.allCountsAligned,
    outputPathCandidate: OUTPUT_PATH_CANDIDATE,
    privateRawHistoryDailyMappingReadiness,
    blockReasonCounts: normalizeBlockReasons(blockReasonCounts),
    ...FLAGS,
  };
  return {
    summary,
    privateRawScan: { ...scan, filesByType: undefined },
    historyDailySchema,
    parsedResultSummary: { ...parsedResultSummary, races: undefined },
    parsedPredictionSummary: { ...parsedPredictionSummary, races: undefined },
    parsedSummaryInfo,
    mappingDryRun,
    countComparison,
    nextActionPlan: nextActionPlan(privateRawHistoryDailyMappingReadiness),
    jsonSummary: {
      targetDate: TARGET_DATE,
      status: privateRawHistoryDailyMappingReadiness.status,
      secondaryStatuses: privateRawHistoryDailyMappingReadiness.secondaryStatuses,
      resultRaceCount: parsedResultSummary.resultRaceCount,
      candidateMappedRaceCount: mappingDryRun.candidateMappedRaceCount,
      allCountsAligned: countComparison.allCountsAligned,
      ...FLAGS,
    },
  };
}

async function main() {
  const result = await auditPrivateRawHistoryDailyMappingDryRun();
  printSection("summary", result.summary);
  printSection("privateRawScan", result.privateRawScan);
  printSection("historyDailySchema", result.historyDailySchema);
  printSection("parsedResultSummary", result.parsedResultSummary);
  printSection("parsedPredictionSummary", result.parsedPredictionSummary);
  printSection("parsedSummaryInfo", result.parsedSummaryInfo);
  printSection("mappingDryRun", result.mappingDryRun);
  printSection("countComparison", result.countComparison);
  printSection("nextActionPlan", result.nextActionPlan);
  printSection("jsonSummary", result.jsonSummary);
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  main().catch((error) => {
    console.error("[kurari-ex private raw history daily mapping dry-run audit] failed");
    console.error(error);
    process.exitCode = 1;
  });
}
