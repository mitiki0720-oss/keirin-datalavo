import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PRIMARY_CLASSES = [
  "UNCLASSIFIABLE",
  "EXACT_HIT",
  "THIRD_PLACE_SHADOW_DROP",
  "SHADOW_ONLY_HIT",
  "THIRD_PLACE_MISS",
  "HEAD_MISS",
  "TOP3_ORDER_MISS",
  "OTHER_STRUCTURE_MISS",
];

export const POINT_RANGES = [8, 10, 12, 14];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(__dirname, "..", "..");
export const outputPath = path.join(
  projectRoot,
  "public",
  "data",
  "analytics",
  "kurari-ex",
  "prediction-failure",
  "index.generated.json",
);

const REVIEW_SOURCE_PREFIX = "public/data/reviews/";

export function formatJstDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function enumerateDates(from, to) {
  const dates = [];
  for (let current = from; current <= to; current = addDays(current, 1)) dates.push(current);
  return dates;
}

export function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    if (key === "write" || key === "dry-run") {
      args[key] = true;
      continue;
    }
    args[key] = argv[index + 1];
    index += 1;
  }
  return args;
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replaceAll("−", "-")
    .replaceAll("ー", "-")
    .replaceAll("―", "-")
    .replaceAll("→", "-")
    .replaceAll("⇒", "-")
    .replaceAll(">", "-");
}

function normalizeTicket(ticket) {
  const text = normalizeText(ticket);
  const match = text.match(/(?<!\d)([1-9])\s*[-=]\s*([1-9])\s*[-=]\s*([1-9])(?!\d)/u);
  if (!match) return null;
  const cars = [match[1], match[2], match[3]];
  if (new Set(cars).size !== 3) return null;
  return cars.join("-");
}

function uniqueTickets(tickets) {
  return [...new Set(tickets.filter(Boolean))];
}

function parseTicketsFromSection(section, mode) {
  const lines = section.split(/\r?\n/u);
  const tickets = [];
  const ambiguous = [];
  for (const line of lines) {
    const normalized = normalizeText(line);
    if (mode === "purchase" && /影買い目/u.test(normalized)) break;
    const ticket = normalizeTicket(normalized);
    if (!ticket) continue;
    if (mode === "purchase" && /(?:2車単|2車複|3連複|ワイド|払戻|照合キー)/u.test(normalized)) {
      ambiguous.push(normalized.trim());
      continue;
    }
    tickets.push(ticket);
  }
  return { tickets: uniqueTickets(tickets), ambiguous };
}

function sectionBetween(block, startPattern, endPatterns) {
  const startMatch = block.match(startPattern);
  if (!startMatch?.index && startMatch?.index !== 0) return null;
  const start = startMatch.index + startMatch[0].length;
  let end = block.length;
  for (const pattern of endPatterns) {
    const afterStart = block.slice(start);
    const match = afterStart.match(pattern);
    if (match?.index !== undefined) end = Math.min(end, start + match.index);
  }
  return block.slice(start, end);
}

function parsePointRange(block) {
  const candidates = [
    ...block.matchAll(/(?:可変点数|推奨点数|標準|拡張|最大|価値条件)[^\n]{0,40}?(\d{1,2})\s*点/gu),
  ].map((match) => Number(match[1]));
  return candidates.find((value) => POINT_RANGES.includes(value)) ?? null;
}

function parseDeclaredHeadCandidates(block) {
  const lines = block.split(/\r?\n/u);
  const line = lines.find((value) => /頭候補|頭は/u.test(value));
  if (!line) return [];
  const headText = line.replace(/3着[^。]*$/u, "");
  return [...new Set([...headText.matchAll(/(?<!\d)([1-9])(?!\d)/gu)].map((match) => match[1]))];
}

function parseYen(block, label) {
  const pattern = new RegExp(`${label}\\s*[:：]\\s*([0-9,]+)\\s*円`, "u");
  const match = block.match(pattern);
  return match ? Number(match[1].replaceAll(",", "")) : null;
}

function parseResultPayout(block) {
  const match = block.match(/3連単\s*[:：]\s*[1-9][-=][1-9][-=][1-9]\s+([0-9,]+)\s*円/u);
  return match ? Number(match[1].replaceAll(",", "")) : null;
}

function parseRaceBlocks(text) {
  const blocks = [];
  const pattern = /^■\s*([^\n]*?)\s+(\d{1,2})R\s*$/gmu;
  const matches = [...text.matchAll(pattern)];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? text.length;
    blocks.push({ raceNo: Number(match[2]), venue: match[1].trim() || null, body: text.slice(start, end) });
  }
  return blocks;
}

function parseResultBlocks(text) {
  const blocks = [];
  const pattern = /^【(\d{1,2})R】\s*$/gmu;
  const matches = [...text.matchAll(pattern)];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? text.length;
    blocks.push({ raceNo: Number(match[1]), body: text.slice(start, end) });
  }
  return blocks;
}

function sourcePathFor(date, fileName) {
  return `${REVIEW_SOURCE_PREFIX}${date}/${fileName}`;
}

function sourceKey(date, venueSlug, raceNo) {
  return `${date}|${venueSlug}|${raceNo}`;
}

export function isAllowedReviewSourcePath(sourcePath) {
  return sourcePath === null || (
    sourcePath.startsWith(REVIEW_SOURCE_PREFIX)
    && /\/[^/]+-(?:prediction|result)\.txt$/u.test(sourcePath)
  );
}

export async function collectReviewSources({ reviewsRoot, from, to }) {
  const predictionSources = new Map();
  const resultSources = new Map();
  for (const date of enumerateDates(from, to)) {
    const directory = path.join(reviewsRoot, date);
    let entries = [];
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const filePath = path.join(directory, entry.name);
      if (entry.name.endsWith("-prediction.txt")) {
        predictionSources.set(sourcePathFor(date, entry.name), {
          date,
          fileName: entry.name,
          venueSlug: entry.name.replace(/-prediction\.txt$/u, ""),
          text: await readFile(filePath, "utf8"),
        });
      }
      if (entry.name.endsWith("-result.txt")) {
        resultSources.set(sourcePathFor(date, entry.name), {
          date,
          fileName: entry.name,
          venueSlug: entry.name.replace(/-result\.txt$/u, ""),
          text: await readFile(filePath, "utf8"),
        });
      }
    }
  }
  return { predictionSources, resultSources };
}

export function parsePredictionSource(sourcePath, source) {
  const records = [];
  const sourceWarnings = [];
  const blocks = parseRaceBlocks(source.text);
  if (blocks.length === 0) sourceWarnings.push("prediction-race-blocks-not-found");
  for (const block of blocks) {
    const buySection = sectionBetween(block.body, /【買い目】/u, [
      /【影買い目】/u,
      /【買目設計メモ】/u,
      /【買い目設計メモ】/u,
      /^■\s/gmu,
    ]);
    const shadowSection = sectionBetween(block.body, /【影買い目】/u, [
      /【買目設計メモ】/u,
      /【買い目設計メモ】/u,
      /^■\s/gmu,
    ]);
    const buyParse = buySection ? parseTicketsFromSection(buySection, "purchase") : { tickets: [], ambiguous: [] };
    const shadowParse = shadowSection ? parseTicketsFromSection(shadowSection, "shadow") : { tickets: [], ambiguous: [] };
    const observedPurchaseHeads = [...new Set(buyParse.tickets.map((ticket) => ticket.split("-")[0]))];
    const declaredHeadCandidates = parseDeclaredHeadCandidates(block.body);
    const venue = block.venue
      || block.body.match(/会場=([^｜\n]+)/u)?.[1]?.trim()
      || block.body.match(/会場[:：]\s*([^\n]+)/u)?.[1]?.trim()
      || source.venueSlug;
    records.push({
      key: sourceKey(source.date, source.venueSlug, block.raceNo),
      date: source.date,
      venueCode: null,
      venue,
      venueSlug: source.venueSlug,
      raceNo: block.raceNo,
      purchaseTickets: buyParse.tickets,
      purchaseTicketCount: buyParse.tickets.length,
      shadowTickets: shadowParse.tickets,
      shadowTicketCount: shadowParse.tickets.length,
      shadowAvailability: shadowSection ? "observed" : "unavailable",
      explicitPointRange: parsePointRange(block.body),
      declaredHeadCandidates,
      declaredHeadCandidateCount: declaredHeadCandidates.length,
      observedPurchaseHeads,
      observedPurchaseHeadCount: observedPurchaseHeads.length,
      parseWarnings: [
        ...sourceWarnings,
        ...(buySection ? [] : ["prediction-buy-section-missing"]),
        ...buyParse.ambiguous.map(() => "ambiguous-ticket"),
        ...shadowParse.ambiguous.map(() => "ambiguous-shadow-ticket"),
      ],
      sourcePath,
    });
  }
  return records;
}

export function parseResultSource(sourcePath, source) {
  const records = [];
  const sourceWarnings = [];
  const blocks = parseResultBlocks(source.text);
  const fallbackVenue = source.text.match(/対象会場[:：]\s*([^\n]+)/u)?.[1]?.trim() ?? source.venueSlug;
  if (blocks.length === 0) sourceWarnings.push("result-race-blocks-not-found");
  for (const block of blocks) {
    const trifecta = normalizeTicket(
      block.body.match(/3連単照合キー[:：]\s*([^\n]+)/u)?.[1]
      ?? block.body.match(/着順[:：]\s*([^\n]+)/u)?.[1]
      ?? "",
    );
    const venue = block.body.match(/会場[:：]\s*([^\n]+)/u)?.[1]?.trim() ?? fallbackVenue;
    const stake = parseYen(block.body, "投資");
    const returnAmount = parseYen(block.body, "払戻");
    records.push({
      key: sourceKey(source.date, source.venueSlug, block.raceNo),
      date: source.date,
      venueCode: null,
      venue,
      venueSlug: source.venueSlug,
      raceNo: block.raceNo,
      actualTrifecta: trifecta,
      actualFirst: trifecta?.split("-")[0] ?? null,
      actualSecond: trifecta?.split("-")[1] ?? null,
      actualThird: trifecta?.split("-")[2] ?? null,
      stake,
      return: returnAmount,
      net: stake !== null && returnAmount !== null ? returnAmount - stake : null,
      payout: parseResultPayout(block.body),
      parseWarnings: [...sourceWarnings, ...(trifecta ? [] : ["result-trifecta-missing"])],
      sourcePath,
    });
  }
  return records;
}

function classifyPredictionFailure(prediction, result) {
  if (!prediction && !result) return { primaryClass: "UNCLASSIFIABLE", reasons: ["missing-prediction", "missing-result"] };
  if (!prediction) return { primaryClass: "UNCLASSIFIABLE", reasons: ["missing-prediction"] };
  if (!result) return { primaryClass: "UNCLASSIFIABLE", reasons: ["missing-result"] };
  if (prediction.purchaseTicketCount <= 0) return { primaryClass: "UNCLASSIFIABLE", reasons: ["prediction-parse-failed"] };
  if (!result.actualTrifecta) return { primaryClass: "UNCLASSIFIABLE", reasons: ["result-parse-failed"] };

  const [first, second, third] = result.actualTrifecta.split("-");
  const purchase = new Set(prediction.purchaseTickets);
  const shadow = new Set(prediction.shadowTickets);
  const exactHit = purchase.has(result.actualTrifecta);
  const correctTop2Tickets = prediction.purchaseTickets
    .map((ticket) => ticket.split("-"))
    .filter((cars) => cars[0] === first && cars[1] === second);
  const correctTop2ThirdCandidates = [...new Set(correctTop2Tickets.map((cars) => cars[2]))];
  const correctTop2PairCovered = correctTop2ThirdCandidates.length > 0;
  const actualThirdCoveredForCorrectTop2 = correctTop2ThirdCandidates.includes(third);
  const shadowExactCovered = prediction.shadowAvailability === "observed" ? shadow.has(result.actualTrifecta) : null;
  const shadowActualThirdCoveredForCorrectTop2 = prediction.shadowAvailability === "observed"
    ? prediction.shadowTickets
      .map((ticket) => ticket.split("-"))
      .some((cars) => cars[0] === first && cars[1] === second && cars[2] === third)
    : null;
  const actualWinnerCovered = prediction.purchaseTickets.some((ticket) => ticket.split("-")[0] === first);
  const sortedActual = result.actualTrifecta.split("-").sort().join("-");
  const actualTop3PermutationCovered = prediction.purchaseTickets.some((ticket) => ticket.split("-").sort().join("-") === sortedActual);

  let primaryClass = "OTHER_STRUCTURE_MISS";
  if (exactHit) primaryClass = "EXACT_HIT";
  else if (correctTop2PairCovered && !actualThirdCoveredForCorrectTop2 && prediction.shadowAvailability === "observed" && shadowExactCovered) {
    primaryClass = "THIRD_PLACE_SHADOW_DROP";
  } else if (prediction.shadowAvailability === "observed" && shadowExactCovered) primaryClass = "SHADOW_ONLY_HIT";
  else if (correctTop2PairCovered && !actualThirdCoveredForCorrectTop2) primaryClass = "THIRD_PLACE_MISS";
  else if (!actualWinnerCovered) primaryClass = "HEAD_MISS";
  else if (actualTop3PermutationCovered) primaryClass = "TOP3_ORDER_MISS";

  return {
    primaryClass,
    reasons: [],
    exactHit,
    actualWinnerCovered,
    correctTop2PairCovered,
    correctTop2ThirdCandidates,
    correctTop2ThirdCandidateCount: correctTop2ThirdCandidates.length,
    actualThirdCoveredForCorrectTop2,
    actualTop3PermutationCovered,
    shadowExactCovered,
    shadowActualThirdCoveredForCorrectTop2,
  };
}

function classToBucketField(primaryClass) {
  return ({
    EXACT_HIT: "exactHit",
    THIRD_PLACE_SHADOW_DROP: "thirdPlaceShadowDrop",
    SHADOW_ONLY_HIT: "shadowOnlyHit",
    THIRD_PLACE_MISS: "thirdPlaceMiss",
    HEAD_MISS: "headMiss",
    TOP3_ORDER_MISS: "top3OrderMiss",
    OTHER_STRUCTURE_MISS: "otherMiss",
    UNCLASSIFIABLE: "unclassifiable",
  })[primaryClass];
}

function createEmptyPointBucket() {
  return {
    raceCount: 0,
    classifiableRaceCount: 0,
    exactHit: 0,
    thirdPlaceMiss: 0,
    thirdPlaceShadowDrop: 0,
    shadowOnlyHit: 0,
    headMiss: 0,
    top3OrderMiss: 0,
    otherMiss: 0,
    unclassifiable: 0,
    observedPurchaseHeadAverage: null,
    correctTop2ThirdCandidateAverage: null,
    thirdProtectionRate: null,
  };
}

function average(values) {
  if (values.length === 0) return null;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3));
}

function summarize(records) {
  const summary = Object.fromEntries(PRIMARY_CLASSES.map((key) => [classToSummaryKey(key), 0]));
  const byPointRange = {
    8: createEmptyPointBucket(),
    10: createEmptyPointBucket(),
    12: createEmptyPointBucket(),
    14: createEmptyPointBucket(),
    unknown: createEmptyPointBucket(),
  };
  const helpers = Object.fromEntries(Object.keys(byPointRange).map((key) => [key, {
    heads: [],
    thirdCandidates: [],
    protected: 0,
    correctTop2: 0,
  }]));
  let correctTop2PairCount = 0;
  let protectedThirdCount = 0;
  const correctTop2ThirdCounts = [];
  for (const record of records) {
    summary[classToSummaryKey(record.primaryClass)] += 1;
    const bucketKey = record.explicitPointRange === null ? "unknown" : String(record.explicitPointRange);
    const bucket = byPointRange[bucketKey];
    const helper = helpers[bucketKey];
    bucket.raceCount += 1;
    bucket[classToBucketField(record.primaryClass)] += 1;
    if (record.primaryClass !== "UNCLASSIFIABLE") bucket.classifiableRaceCount += 1;
    helper.heads.push(record.observedPurchaseHeadCount);
    if (record.correctTop2PairCovered) {
      correctTop2PairCount += 1;
      helper.correctTop2 += 1;
      helper.thirdCandidates.push(record.correctTop2ThirdCandidateCount);
      correctTop2ThirdCounts.push(record.correctTop2ThirdCandidateCount);
      if (record.actualThirdCoveredForCorrectTop2) {
        protectedThirdCount += 1;
        helper.protected += 1;
      }
    }
  }
  for (const [key, bucket] of Object.entries(byPointRange)) {
    const helper = helpers[key];
    bucket.observedPurchaseHeadAverage = average(helper.heads);
    bucket.correctTop2ThirdCandidateAverage = average(helper.thirdCandidates);
    bucket.thirdProtectionRate = helper.correctTop2 === 0 ? null : Number((helper.protected / helper.correctTop2).toFixed(4));
  }
  return {
    summary,
    byPointRange,
    thirdPlaceProtection: {
      correctTop2PairCount,
      thirdPlaceMissCount: summary.thirdPlaceMiss,
      thirdPlaceShadowDropCount: summary.thirdPlaceShadowDrop,
      thirdCandidateAverage: average(correctTop2ThirdCounts),
      thirdProtectionRate: correctTop2PairCount === 0 ? null : Number((protectedThirdCount / correctTop2PairCount).toFixed(4)),
    },
  };
}

export function classToSummaryKey(primaryClass) {
  return ({
    UNCLASSIFIABLE: "unclassifiable",
    EXACT_HIT: "exactHit",
    THIRD_PLACE_SHADOW_DROP: "thirdPlaceShadowDrop",
    SHADOW_ONLY_HIT: "shadowOnlyHit",
    THIRD_PLACE_MISS: "thirdPlaceMiss",
    HEAD_MISS: "headMiss",
    TOP3_ORDER_MISS: "top3OrderMiss",
    OTHER_STRUCTURE_MISS: "otherMiss",
  })[primaryClass];
}

export async function buildPredictionFailureArtifact({
  reviewsRoot = path.join(projectRoot, "public", "data", "reviews"),
  historicalFrom,
  historicalTo,
  targetDate,
  generatedAt = new Date().toISOString(),
}) {
  const sources = await collectReviewSources({ reviewsRoot, from: historicalFrom, to: historicalTo });
  const predictions = new Map();
  const results = new Map();
  const duplicateRaceKeys = [];
  for (const [sourcePath, source] of sources.predictionSources) {
    for (const record of parsePredictionSource(sourcePath, source)) {
      if (predictions.has(record.key)) duplicateRaceKeys.push(record.key);
      predictions.set(record.key, record);
    }
  }
  for (const [sourcePath, source] of sources.resultSources) {
    for (const record of parseResultSource(sourcePath, source)) {
      if (results.has(record.key)) duplicateRaceKeys.push(record.key);
      results.set(record.key, record);
    }
  }
  const keys = [...new Set([...predictions.keys(), ...results.keys()])].sort();
  const records = keys.map((key) => {
    const prediction = predictions.get(key) ?? null;
    const result = results.get(key) ?? null;
    const classification = classifyPredictionFailure(prediction, result);
    const base = prediction ?? result;
    return {
      key,
      date: base.date,
      venueCode: base.venueCode,
      venue: base.venue,
      raceNo: base.raceNo,
      primaryClass: classification.primaryClass,
      actualTrifecta: result?.actualTrifecta ?? null,
      purchaseTicketCount: prediction?.purchaseTicketCount ?? 0,
      shadowTicketCount: prediction?.shadowTicketCount ?? 0,
      shadowAvailability: prediction?.shadowAvailability ?? "unavailable",
      explicitPointRange: prediction?.explicitPointRange ?? null,
      declaredHeadCandidateCount: prediction?.declaredHeadCandidateCount ?? 0,
      observedPurchaseHeadCount: prediction?.observedPurchaseHeadCount ?? 0,
      correctTop2PairCovered: classification.correctTop2PairCovered ?? false,
      correctTop2ThirdCandidateCount: classification.correctTop2ThirdCandidateCount ?? 0,
      actualThirdCoveredForCorrectTop2: classification.actualThirdCoveredForCorrectTop2 ?? false,
      shadowExactCovered: classification.shadowExactCovered ?? null,
      shadowActualThirdCoveredForCorrectTop2: classification.shadowActualThirdCoveredForCorrectTop2 ?? null,
      actualWinnerCovered: classification.actualWinnerCovered ?? false,
      actualTop3PermutationCovered: classification.actualTop3PermutationCovered ?? false,
      stake: result?.stake ?? null,
      return: result?.return ?? null,
      net: result?.net ?? null,
      payout: result?.payout ?? null,
      sourceStatus: {
        classifiable: classification.primaryClass !== "UNCLASSIFIABLE",
        reasons: classification.reasons,
        fakeCompletionUsed: false,
        fuzzyMatchingUsed: false,
        resultBackfilledPrediction: false,
        shadowGeneratedFromResult: false,
      },
      parseWarnings: [
        ...(prediction?.parseWarnings ?? []),
        ...(result?.parseWarnings ?? []),
        ...classification.reasons,
      ],
      predictionSource: prediction?.sourcePath ?? null,
      resultSource: result?.sourcePath ?? null,
      leakageGuard: {
        recordDateBeforeTargetDate: base.date < targetDate,
        resultDateBeforeTargetDate: result ? result.date < targetDate : null,
        resultDateWithinHistoricalWindow: result ? result.date <= historicalTo : null,
      },
    };
  });
  const aggregate = summarize(records);
  return {
    version: "kurari-ex-prediction-failure/v1",
    generatedAt,
    targetDate,
    historicalFrom,
    historicalTo,
    sourcePolicy: {
      primarySource: "public/data/reviews/YYYY-MM-DD/*-prediction.txt and *-result.txt",
      reviewsRootMode: path.resolve(reviewsRoot) === path.resolve(path.join(projectRoot, "public", "data", "reviews"))
        ? "project"
        : "external-read-only",
      fakeCompletionUsed: false,
      fuzzyMatchingUsed: false,
      resultBackfilledPrediction: false,
      shadowGeneratedFromResult: false,
      pointRangeInferredFromTicketCount: false,
      stakeInferredFromTicketCount: false,
    },
    leakageGuard: {
      targetDate,
      resultDataAllowedThrough: historicalTo,
      resultDateBeforeTargetDate: historicalTo < targetDate,
      currentOrFutureResultUsed: records.some((record) => record.date >= targetDate),
    },
    duplicateRaceKeys,
    raceCount: records.length,
    classifiableRaceCount: records.length - aggregate.summary.unclassifiable,
    summary: aggregate.summary,
    sourceCoverage: {
      predictionSourceCount: predictions.size,
      resultSourceCount: results.size,
      shadowObservedCount: records.filter((record) => record.shadowAvailability === "observed").length,
      pointRangeObservedCount: records.filter((record) => record.explicitPointRange !== null).length,
      declaredHeadCandidateObservedCount: records.filter((record) => record.declaredHeadCandidateCount > 0).length,
      stakeObservedCount: records.filter((record) => record.stake !== null).length,
      returnObservedCount: records.filter((record) => record.return !== null).length,
    },
    byPointRange: aggregate.byPointRange,
    thirdPlaceProtection: aggregate.thirdPlaceProtection,
    records,
  };
}

export async function writePredictionFailureArtifact(artifact, targetPath = outputPath) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
}

export function sampleDistribution(artifact, from, to) {
  const records = artifact.records.filter((record) => record.date >= from && record.date <= to);
  const summary = Object.fromEntries(PRIMARY_CLASSES.map((key) => [classToSummaryKey(key), 0]));
  for (const record of records) summary[classToSummaryKey(record.primaryClass)] += 1;
  return {
    from,
    to,
    raceCount: records.length,
    classifiableRaceCount: records.length - summary.unclassifiable,
    summary,
    shadowObservedCount: records.filter((record) => record.shadowAvailability === "observed").length,
    pointRangeObservedCount: records.filter((record) => record.explicitPointRange !== null).length,
    declaredHeadCandidateObservedCount: records.filter((record) => record.declaredHeadCandidateCount > 0).length,
  };
}
