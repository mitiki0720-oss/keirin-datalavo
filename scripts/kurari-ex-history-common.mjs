import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const projectRoot = path.resolve(__dirname, "..");
export const privateRoot = path.join(projectRoot, "private-input", "kurari-ex");
export const rawRoot = path.join(privateRoot, "raw");
export const auditRoot = path.join(privateRoot, "audit");
export const normalizedRoot = path.join(privateRoot, "normalized");
export const normalizedRacesRoot = path.join(normalizedRoot, "races");
export const exactOutputRoot = path.join(
  projectRoot,
  "public",
  "data",
  "analytics",
  "kurari-ex",
  "exact",
);
export const compactHistoryRoot = path.join(
  projectRoot,
  "public",
  "data",
  "analytics",
  "kurari-ex",
  "history",
);
export const compactHistoryDailyRoot = path.join(compactHistoryRoot, "daily");

export const venueMap = {
  aomori: "青森",
  hakodate: "函館",
  iwakitaira: "いわき平",
  yahiko: "弥彦",
  maebashi: "前橋",
  toride: "取手",
  utsunomiya: "宇都宮",
  omiya: "大宮",
  seibuen: "西武園",
  keiokaku: "京王閣",
  tachikawa: "立川",
  matsudo: "松戸",
  chiba: "千葉",
  kawasaki: "川崎",
  hiratsuka: "平塚",
  odawara: "小田原",
  ito: "伊東",
  shizuoka: "静岡",
  nagoya: "名古屋",
  gifu: "岐阜",
  ogaki: "大垣",
  toyohashi: "豊橋",
  toyama: "富山",
  matsusaka: "松阪",
  yokkaichi: "四日市",
  fukui: "福井",
  nara: "奈良",
  wakayama: "和歌山",
  kishiwada: "岸和田",
  tamano: "玉野",
  hiroshima: "広島",
  hofu: "防府",
  takamatsu: "高松",
  komatsushima: "小松島",
  kochi: "高知",
  matsuyama: "松山",
  kokura: "小倉",
  kurume: "久留米",
  takeo: "武雄",
  sasebo: "佐世保",
  beppu: "別府",
  kumamoto: "熊本",
};

export const slugAliases = {
  gihu: "gifu",
  hirosima: "hiroshima",
  houfu: "hofu",
  hukui: "fukui",
  itou: "ito",
  "iwaki-daira": "iwakitaira",
  keioukaku: "keiokaku",
  kisaiwada: "kishiwada",
  komatujima: "komatsushima",
  kouchi: "kochi",
  matudo: "matsudo",
  matuzaka: "matsusaka",
  oogaki: "ogaki",
  oomiya: "omiya",
  utunomiya: "utsunomiya",
};

export function normalizeText(value) {
  return String(value ?? "")
    .replace(/^\uFEFF/u, "")
    .replace(/\r\n?/g, "\n")
    .normalize("NFKC");
}

export function normalizeVenueName(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/gu, "")
    .replace(/競輪場|競輪$/u, "");
}

export function parseYenBeforeSymbol(value) {
  const text = normalizeText(value);
  const match = text.match(/([+-]?[\d,]+)\s*円/u);
  if (!match) return null;
  const number = Number(match[1].replaceAll(",", ""));
  return Number.isFinite(number) ? number : null;
}

export function parseNumber(value) {
  if (value == null || value === "") return null;
  const match = normalizeText(value).match(/[+-]?[\d,.]+/u);
  if (!match) return null;
  const number = Number(match[0].replaceAll(",", ""));
  return Number.isFinite(number) ? number : null;
}

export function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1] != null) return match[1].trim();
  }
  return null;
}

export function canonicalCombination(value, expectedLength) {
  const numbers = String(value ?? "").match(/\d+/gu)?.map(Number) ?? [];
  if (numbers.length < expectedLength) return "";
  return numbers.slice(0, expectedLength).join("-");
}

export function parseDate(value) {
  const match = normalizeText(value).match(
    /(20\d{2})[年/.-](\d{1,2})[月/.-](\d{1,2})日?/u,
  );
  if (!match) return null;
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

export function classifyInputFile(file, root = rawRoot) {
  const relativePath = path.relative(root, file).replaceAll(path.sep, "/");
  const fileName = path.basename(file).toLowerCase();
  const match = fileName.match(
    /^(?<slug>[a-z0-9-]+?)-(?<type>prediction|result|summary)(?<suffix>\d{4})?\.(?:txt|md)$/u,
  );
  if (!match?.groups) {
    return { file, relativePath, classified: false };
  }
  const venueKey = slugAliases[match.groups.slug] ?? match.groups.slug;
  const folderDate = relativePath.split("/").find((part) => /^\d{4}-\d{2}-\d{2}$/u.test(part));
  return {
    file,
    relativePath,
    classified: true,
    venueKey,
    venueName: venueMap[venueKey] ?? null,
    type: match.groups.type,
    date: folderDate ?? null,
    irregular: Boolean(match.groups.suffix),
  };
}

export async function collectFiles(directory, predicate = () => true) {
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
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) await visit(target);
      if (entry.isFile() && predicate(target)) files.push(target);
    }
  }
  await visit(directory);
  return files.sort((left, right) => left.localeCompare(right));
}

export async function scanRawInputs() {
  const files = await collectFiles(rawRoot, (file) => /\.(?:txt|md)$/iu.test(file));
  const classified = files.map((file) => classifyInputFile(file));
  const recognized = classified.filter((item) => item.classified);
  const groups = new Map();
  for (const item of recognized) {
    const key = `${item.date ?? "unknown"}:${item.venueKey}`;
    const group = groups.get(key) ?? {
      key,
      date: item.date,
      venueKey: item.venueKey,
      venueName: item.venueName,
      prediction: [],
      result: [],
      summary: [],
    };
    group[item.type].push(item);
    groups.set(key, group);
  }
  return {
    files,
    classified,
    recognized,
    unclassified: classified.filter((item) => !item.classified),
    groups: [...groups.values()].sort((left, right) => left.key.localeCompare(right.key)),
  };
}

export async function readInput(item) {
  return normalizeText(await readFile(item.file, "utf8"));
}

export function splitRaceBlocks(text, type) {
  const normalized = normalizeText(text);
  const matches = [];
  if (type === "summary") {
    const fullPattern = /^\s*#{2,3}\s+(20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}日?)\s+(.+?)\s+(\d{1,2})R(?:\s*[（(](.*?)[）)])?(?:\s*[｜|].*)?\s*$/gmu;
    for (const match of normalized.matchAll(fullPattern)) {
      matches.push({
        index: match.index,
        heading: match[0].trim(),
        date: parseDate(match[1]),
        venueLabel: match[2].trim(),
        raceNumber: Number(match[3]),
        meta: (match[4] ?? "").trim(),
      });
    }
    const shortPattern = /^\s*#{2,3}\s+(\d{1,2})R\s*[｜|]\s*(.+)$/gmu;
    for (const match of normalized.matchAll(shortPattern)) {
      matches.push({
        index: match.index,
        heading: match[0].trim(),
        date: null,
        venueLabel: "",
        raceNumber: Number(match[1]),
        meta: match[2].trim(),
      });
    }
  } else {
    const headingPattern = /^■\s+(.+?)\s+(\d{1,2})R\s*$/gmu;
    for (const match of normalized.matchAll(headingPattern)) {
      matches.push({
        index: match.index,
        heading: match[0].trim(),
        date: null,
        venueLabel: match[1].trim(),
        raceNumber: Number(match[2]),
        meta: "",
      });
    }
  }
  matches.sort((left, right) => left.index - right.index);
  return matches.map((match, index) => ({
    ...match,
    text: normalized.slice(match.index, matches[index + 1]?.index ?? normalized.length).trim(),
  }));
}

export function splitLineup(rawValue) {
  const raw = normalizeText(rawValue)
    .replace(/^.*?(?:並び|ライン|周回予想)\s*[:：]\s*/u, "")
    .replace(/[（(]単騎[）)]/gu, "")
    .replace(/\s+/gu, "");
  if (!raw || /不明|未掲載|取得不可|なし/u.test(raw)) {
    return { raw: rawValue?.trim() ?? "", lines: [], lineCount: null, singleCount: null, status: "missing" };
  }
  const groups = raw.split(/[\/／|｜]/u).filter(Boolean);
  const lines = groups
    .map((group) => {
      const compact = group.replace(/[^\d-]/gu, "");
      if (/^\d{2,9}$/u.test(compact)) return compact.split("").map(Number);
      return compact.match(/\d+/gu)?.map(Number) ?? [];
    })
    .filter((line) => line.length > 0);
  const allCars = lines.flat();
  const uniqueCars = new Set(allCars);
  const parsed = lines.length > 0 && allCars.length === uniqueCars.size;
  return {
    raw: rawValue?.trim() ?? "",
    lines: parsed ? lines : [],
    lineCount: parsed ? lines.length : null,
    singleCount: parsed ? lines.filter((line) => line.length === 1).length : null,
    status: parsed ? "parsed" : "missing",
  };
}

export function extractLabeledValue(text, labels) {
  const escaped = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"));
  const match = text.match(new RegExp(`^\\s*[-・]?\\s*(?:${escaped.join("|")})\\s*[:：]\\s*(.+)$`, "mu"));
  return match?.[1]?.trim() ?? null;
}

export function parseTicketLines(text, expectedLength) {
  const combinations = [];
  for (const line of normalizeText(text).split("\n")) {
    const withoutOrdinal = line
      .replace(/^\s*[-・]?\s*\d{1,2}\s*[）).、]\s*/u, "")
      .replace(/^\s*[-・]?\s*(?:3連単|三連単|2車単|二車単)\s*/u, "");
    const pattern = expectedLength === 3
      ? /(?:^|\s)(\d+)\s*[-=]\s*(\d+)\s*[-=]\s*(\d+)(?:\s|$|[^\d-])/u
      : /(?:^|\s)(\d+)\s*[-=]\s*(\d+)(?!\s*[-=]\s*\d)(?:\s|$|[^\d-])/u;
    const match = withoutOrdinal.match(pattern);
    if (!match) continue;
    const combination = match.slice(1, expectedLength + 1).join("-");
    if (combination && !combinations.includes(combination)) combinations.push(combination);
  }
  return combinations;
}

export function parsePredictionBlock(text) {
  const normalized = normalizeText(text);
  const trifectaSection = firstMatch(normalized, [
    /(?:3連単|三連単)[^\n]*\n([\s\S]*?)(?=\n\s*(?:2車単|二車単|【|#|タグ|$))/u,
  ]) ?? normalized;
  const exactaSection = firstMatch(normalized, [
    /(?:2車単|二車単)[^\n]*\n([\s\S]*?)(?=\n\s*(?:【|#|タグ|$))/u,
  ]) ?? "";
  const trifectaTickets = parseTicketLines(trifectaSection, 3);
  const exactaTickets = parseTicketLines(exactaSection, 2);
  const confidence = firstMatch(normalized, [
    /【自信度】\s*\n([^\n]+)/u,
    /自信度\s*[:：]\s*([^\n#]+)/u,
  ]) ?? "";
  const raceType = firstMatch(normalized, [
    /【レース型】\s*\n([^\n]+)/u,
    /レースタイプ\s*[:：]\s*([^\n]+)/u,
  ]) ?? "";
  const tags = [...normalized.matchAll(/#[^\s#]+/gu)].map((match) => match[0]).slice(0, 30);
  return {
    status: trifectaTickets.length || exactaTickets.length ? "parsed" : "missing",
    trifectaTickets,
    exactaTickets,
    confidence,
    raceType,
    isSpecialRace: /特選|決勝|記念|G[123]|GI|GII|GIII/u.test(normalized),
    tags: [...new Set(tags)],
  };
}

function parseCarPlacement(text, placement) {
  const line = text.match(new RegExp(`^\\s*[-・]?\\s*${placement}着\\s*[:：]\\s*(.+)$`, "mu"))?.[1] ?? "";
  const carNo = parseNumber(line);
  const name = line
    .replace(/^\s*\d+\s*(?:番)?\s*/u, "")
    .replace(/[（(].*$/u, "")
    .replace(/\s*\/.*$/u, "")
    .trim();
  const winningMethod = firstMatch(line, [
    /決まり手\s*[:：]\s*([逃捲差クマーク])/u,
  ]) ?? "";
  return { carNo, name, winningMethod };
}

export function parseResultBlock(text) {
  const normalized = normalizeText(text);
  const order = canonicalCombination(
    firstMatch(normalized, [
      /^着順\s*[:：]\s*([^\n]+)/mu,
      /^3連単照合キー\s*[:：]\s*([^\n]+)/mu,
      /^三連単\s*[:：]\s*([^\n]+)/mu,
    ]),
    3,
  );
  const orderCars = order ? order.split("-").map(Number) : [];
  const first = parseCarPlacement(normalized, 1);
  const second = parseCarPlacement(normalized, 2);
  const third = parseCarPlacement(normalized, 3);
  first.carNo ??= orderCars[0] ?? null;
  second.carNo ??= orderCars[1] ?? null;
  third.carNo ??= orderCars[2] ?? null;
  first.winningMethod ||= firstMatch(normalized, [
    /1着(?:の)?決まり手\s*[:：]\s*([^\n]+)/u,
    /^決まり手\s*[:：]\s*([^\n]+)/mu,
  ]) ?? "";
  second.winningMethod ||= firstMatch(normalized, [/2着決まり手\s*[:：]\s*([^\n]+)/u]) ?? "";

  const trifectaLine = normalized.match(/^(?:\s*[-・]?\s*)?(?:3連単|三連単)\s*[:：]\s*(.+)$/mu)?.[1] ?? "";
  const exactaLine = normalized.match(/^(?:\s*[-・]?\s*)?(?:2車単|二車単)\s*[:：]\s*(.+)$/mu)?.[1] ?? "";
  const trifectaCombination = canonicalCombination(trifectaLine, 3) || order;
  const exactaCombination = canonicalCombination(exactaLine, 2)
    || (orderCars.length >= 2 ? orderCars.slice(0, 2).join("-") : "");
  const favoriteLine = firstMatch(normalized, [
    /(?:三連単1番人気|最終1番人気オッズ)\s*[:：]\s*([^\n]+)/u,
  ]) ?? "";
  const favoriteOdds = parseNumber(favoriteLine.match(/([\d.]+)\s*倍/u)?.[1]);
  const bLine = firstMatch(normalized, [
    /Bを取った選手\s*[:：]\s*([^\n]+)/u,
    /SHB\s*[:：]\s*([^\n]+)/u,
  ]) ?? "";
  const bMatch = bLine.match(/(?:^|[/\s])B\s*[:：]?\s*(\d+)\s*(.*?)(?:\s*\/|$)/u);
  const windLine = firstMatch(normalized, [/風速\s*[:：]\s*([^\n]+)/u]) ?? "";
  let windSpeedMps = parseNumber(windLine.match(/([\d.]+)\s*m\/s/u)?.[1]);
  if (windSpeedMps == null) {
    const kmh = parseNumber(windLine.match(/([\d.]+)\s*km\/h/u)?.[1]);
    if (kmh != null) windSpeedMps = Number((kmh / 3.6).toFixed(1));
  }

  return {
    status: trifectaCombination ? "finished" : "missing",
    first,
    second,
    third,
    trifecta: {
      combination: trifectaCombination,
      payoutYen: parseYenBeforeSymbol(trifectaLine),
    },
    exacta: {
      combination: exactaCombination,
      payoutYen: parseYenBeforeSymbol(exactaLine),
    },
    favoriteTrifecta: {
      combination: canonicalCombination(favoriteLine, 3),
      odds: favoriteOdds,
    },
    bRider: bMatch
      ? { carNo: Number(bMatch[1]), name: bMatch[2].trim() }
      : null,
    weather: {
      condition: extractLabeledValue(normalized, ["天気", "天候"]) ?? "",
      windDirection: extractLabeledValue(normalized, ["風向", "風向(バック基準)"]) ?? "",
      windSpeedMps,
    },
  };
}

export function mergePrediction(primary, fallback) {
  const candidates = [primary, fallback].filter(Boolean);
  return {
    status: candidates.some((item) => item.status === "parsed") ? "parsed" : "missing",
    trifectaTickets: [...new Set(candidates.flatMap((item) => item.trifectaTickets ?? []))],
    exactaTickets: [...new Set(candidates.flatMap((item) => item.exactaTickets ?? []))],
    confidence: candidates.find((item) => item.confidence)?.confidence ?? "",
    raceType: candidates.find((item) => item.raceType)?.raceType ?? "",
    isSpecialRace: candidates.some((item) => item.isSpecialRace),
    tags: [...new Set(candidates.flatMap((item) => item.tags ?? []))],
  };
}

export function mergeResult(primary, fallback) {
  const selected = primary?.status === "finished" ? primary : fallback ?? primary;
  if (!selected) return null;
  const other = selected === primary ? fallback : primary;
  return {
    ...selected,
    first: { ...selected.first, name: selected.first.name || other?.first?.name || "" },
    second: { ...selected.second, name: selected.second.name || other?.second?.name || "" },
    third: { ...selected.third, name: selected.third.name || other?.third?.name || "" },
    trifecta: {
      combination: selected.trifecta.combination || other?.trifecta?.combination || "",
      payoutYen: selected.trifecta.payoutYen ?? other?.trifecta?.payoutYen ?? null,
    },
    exacta: {
      combination: selected.exacta.combination || other?.exacta?.combination || "",
      payoutYen: selected.exacta.payoutYen ?? other?.exacta?.payoutYen ?? null,
    },
    favoriteTrifecta: {
      combination: selected.favoriteTrifecta.combination || other?.favoriteTrifecta?.combination || "",
      odds: selected.favoriteTrifecta.odds ?? other?.favoriteTrifecta?.odds ?? null,
    },
    bRider: selected.bRider ?? other?.bRider ?? null,
    weather: {
      condition: selected.weather.condition || other?.weather?.condition || "",
      windDirection: selected.weather.windDirection || other?.weather?.windDirection || "",
      windSpeedMps: selected.weather.windSpeedMps ?? other?.weather?.windSpeedMps ?? null,
    },
  };
}

export function parseRaceMeta(summaryBlock, fallbackText = "") {
  const text = summaryBlock?.text ?? fallbackText;
  const meta = summaryBlock?.meta ?? "";
  const grade = extractLabeledValue(text, ["グレード"])
    ?? firstMatch(meta, [/\b(G[123]|F[12])\b/u])
    ?? "";
  const timeslotRaw = extractLabeledValue(text, ["カテゴリ"]) ?? meta;
  const timeslot = /モーニング/u.test(timeslotRaw)
    ? "morning"
    : /ミッドナイト/u.test(timeslotRaw)
      ? "midnight"
      : /ナイター/u.test(timeslotRaw)
        ? "night"
        : /デイ/u.test(timeslotRaw)
          ? "day"
          : "";
  const classAndStarters = extractLabeledValue(text, ["級班・車番数", "級班"]) ?? meta;
  const starters = parseNumber(classAndStarters.match(/(\d+)\s*車/u)?.[1]);
  const raceClass = classAndStarters
    .replace(/[（(]?\d+\s*車[）)]?/gu, "")
    .replace(/\b(?:G[123]|F[12])\b/gu, "")
    .replace(/[／/|｜]+(?:モーニング|ミッドナイト|ナイター|デイ).*/u, "")
    .replace(/^[／/|｜\s]+|[／/|｜\s]+$/gu, "")
    .trim();
  const raceTitle = extractLabeledValue(text, ["レース名", "開催名"]) ?? "";
  return { grade, timeslot, raceClass, raceTitle, starters };
}

export function parseLineupFromBlocks(summaryText, predictionText) {
  const candidates = [
    extractLabeledValue(summaryText, ["並び", "ライン", "想定ライン", "周回予想"]),
    extractLabeledValue(predictionText, ["並び", "ライン", "想定ライン", "KDreams並び予想", "代替周回予想"]),
  ].filter(Boolean);
  for (const candidate of candidates) {
    const lineup = splitLineup(candidate);
    if (lineup.status === "parsed") return lineup;
  }
  return splitLineup(candidates[0] ?? "");
}

export function evaluateRace(result, prediction, lineup) {
  const trifectaAvailable = Boolean(result?.trifecta?.combination && prediction.trifectaTickets.length);
  const exactaAvailable = Boolean(result?.exacta?.combination && prediction.exactaTickets.length);
  const trifectaHit = trifectaAvailable
    ? prediction.trifectaTickets.includes(result.trifecta.combination)
    : null;
  const exactaHit = exactaAvailable
    ? prediction.exactaTickets.includes(result.exacta.combination)
    : null;
  const resultParts = result?.trifecta?.combination?.split("-") ?? [];
  const thirdOnlyMiss = trifectaAvailable && trifectaHit === false
    ? prediction.trifectaTickets.some((ticket) => {
        const parts = ticket.split("-");
        return parts[0] === resultParts[0] && parts[1] === resultParts[1] && parts[2] !== resultParts[2];
      })
    : trifectaAvailable ? false : null;
  const headMiss = trifectaAvailable
    ? !prediction.trifectaTickets.some((ticket) => ticket.split("-")[0] === resultParts[0])
    : null;
  const topCars = [
    result?.first?.carNo,
    result?.second?.carNo,
    result?.third?.carNo,
  ];
  const lineFor = (carNo) => lineup.lines.findIndex((line) => line.includes(carNo));
  const lineIndexes = topCars.map(lineFor);
  const lineupAvailable = lineup.status === "parsed"
    && topCars.every(Number.isFinite)
    && lineIndexes.every((index) => index >= 0);
  const sameLineTop2 = lineupAvailable ? lineIndexes[0] === lineIndexes[1] : null;
  const sameLineTop3 = lineupAvailable
    ? lineIndexes[0] === lineIndexes[1] && lineIndexes[1] === lineIndexes[2]
    : null;
  const otherLineThird = lineupAvailable
    ? lineIndexes[0] === lineIndexes[1] && lineIndexes[2] !== lineIndexes[0]
    : null;
  const thirdLine = lineupAvailable ? lineup.lines[lineIndexes[2]] : null;
  const singleThird = thirdLine ? thirdLine.length === 1 : lineupAvailable ? false : null;
  const bRiderInsideTop3 = result?.bRider?.carNo
    ? topCars.includes(result.bRider.carNo)
    : null;
  const favoriteTrifectaHit = result?.favoriteTrifecta?.combination
    ? result.favoriteTrifecta.combination === result.trifecta.combination
    : null;
  return {
    evaluation: {
      trifectaHit,
      exactaHit,
      anyHit: trifectaHit == null && exactaHit == null
        ? null
        : trifectaHit === true || exactaHit === true,
      exactaSalvage: trifectaHit == null || exactaHit == null
        ? null
        : trifectaHit === false && exactaHit === true,
      thirdOnlyMiss,
      headMiss,
    },
    derived: {
      firstWinningMethod: result?.first?.winningMethod ?? "",
      bRiderInsideTop3,
      favoriteTrifectaHit,
      sameLineTop2,
      sameLineTop3,
      otherLineThird,
      singleThird,
    },
  };
}

export function relativeProjectPath(file) {
  return path.relative(projectRoot, file).replaceAll(path.sep, "/");
}

export function serializeJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, serializeJson(value), "utf8");
}

export async function readNormalizedRaces() {
  const files = await collectFiles(normalizedRacesRoot, (file) => file.endsWith(".jsonl"));
  const races = [];
  const errors = [];
  for (const file of files) {
    const lines = (await readFile(file, "utf8")).split(/\r?\n/u);
    for (let index = 0; index < lines.length; index += 1) {
      if (!lines[index].trim()) continue;
      try {
        races.push(JSON.parse(lines[index]));
      } catch (error) {
        errors.push(`${relativeProjectPath(file)}:${index + 1}: ${error.message}`);
      }
    }
  }
  return { files, races, errors };
}

export async function readCompactHistoryRaces() {
  const files = await collectFiles(
    compactHistoryDailyRoot,
    (file) => file.endsWith(".generated.json"),
  );
  const races = [];
  const errors = [];
  for (const file of files) {
    try {
      const payload = JSON.parse(await readFile(file, "utf8"));
      for (const compact of payload.items ?? []) {
        const predictionEnrichment = compact.predictionEnrichment ?? (
          compact.quality?.predictionParsed === true
            ? { status: "matched", matchedBy: "raceId" }
            : { status: "missing", matchedBy: null }
        );
        const lineup = {
          raw: "",
          lines: compact.lineup?.status === "parsed" ? compact.lineup.lines ?? [] : [],
          lineCount: compact.lineup?.status === "parsed"
            ? compact.lineup.lines?.length ?? null
            : null,
          singleCount: compact.lineup?.status === "parsed"
            ? (compact.lineup.lines ?? []).filter((line) => line.length === 1).length
            : null,
          status: compact.lineup?.status === "parsed" ? "parsed" : "missing",
        };
        const prediction = {
          status: predictionEnrichment.status === "matched"
            && compact.quality?.predictionParsed
            ? "parsed"
            : "missing",
          trifectaTickets: compact.prediction?.trifectaTickets ?? [],
          exactaTickets: compact.prediction?.exactaTickets ?? [],
          confidence: compact.prediction?.confidence ?? "",
          raceType: compact.prediction?.raceType ?? "",
          isSpecialRace: false,
          tags: compact.prediction?.tags ?? [],
        };
        const result = {
          ...compact.result,
          status: compact.result?.status === "finished" ? "finished" : "missing",
          bRider: compact.result?.bRider ?? null,
        };
        const evaluated = evaluateRace(result, prediction, lineup);
        races.push({
          schemaVersion: compact.schemaVersion ?? 1,
          raceKey: compact.raceKey,
          raceId: compact.raceId ?? "",
          date: compact.date,
          venueKey: compact.venueKey,
          venueName: compact.venueName,
          raceNumber: compact.raceNumber,
          grade: compact.grade ?? "",
          timeslot: compact.timeslot ?? "",
          raceClass: compact.raceClass ?? "",
          raceTitle: "",
          starterCount: compact.starters?.length ?? 0,
          starters: compact.starters ?? [],
          lineup,
          weather: compact.weather ?? {
            condition: "",
            windDirection: "",
            windSpeedMps: null,
          },
          result,
          prediction,
          predictionEnrichment,
          evaluation: evaluated.evaluation,
          derived: evaluated.derived,
          quality: {
            summaryFound: false,
            predictionFound: compact.quality?.predictionParsed === true,
            resultFound: compact.quality?.resultParsed === true,
            lineupParsed: compact.quality?.lineupParsed === true,
            resultParsed: compact.quality?.resultParsed === true,
            predictionParsed: compact.quality?.predictionParsed === true,
            warnings: compact.quality?.warnings ?? [],
          },
          sourceRefs: {},
        });
      }
    } catch (error) {
      errors.push(`${relativeProjectPath(file)}: ${error.message}`);
    }
  }
  return { files, races, errors };
}

export async function readKurariExRaces(source = "history") {
  if (source === "normalized") return readNormalizedRaces();
  if (source === "history") return readCompactHistoryRaces();
  throw new Error(`unsupported KURARI EX source: ${source}`);
}

export function rateMetric(values) {
  const known = values.filter((value) => typeof value === "boolean");
  const count = known.filter(Boolean).length;
  return {
    count,
    total: known.length,
    rate: known.length ? Number(((count / known.length) * 100).toFixed(1)) : null,
    sourceType: "EXACT",
    quality: known.length > 0 && known.length < 5 ? "low-sample" : "ok",
  };
}

export function countMetric(values, predicate) {
  const known = values.filter((value) => value != null && value !== "");
  const count = known.filter(predicate).length;
  return {
    count,
    total: known.length,
    rate: known.length ? Number(((count / known.length) * 100).toFixed(1)) : null,
    sourceType: "EXACT",
    quality: known.length > 0 && known.length < 5 ? "low-sample" : "ok",
  };
}
