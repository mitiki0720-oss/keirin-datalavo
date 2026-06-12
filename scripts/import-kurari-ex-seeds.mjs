import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const inputRoot = path.join(projectRoot, "private-input", "kurari-ex");
const summariesRoot = path.join(inputRoot, "summaries");
const outputRoot = path.join(projectRoot, "public", "data", "analytics", "kurari-ex");
const dryRun = process.argv.includes("--dry-run");
const generatedAt = new Date().toISOString();
const updatedAt = generatedAt.slice(0, 10);

const venueMap = {
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

const slugAliases = {
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

const insightRules = [
  {
    tag: "BANTE_SASHI_ALERT",
    label: "番手差しを警戒",
    pattern: /番手差し|番手.*差し|差し逆転/u,
    guidance: "先行軸だけで固定せず、番手差しの逆目を残す",
  },
  {
    tag: "THIRD_PLACE_SPREAD",
    label: "3着候補を分散",
    pattern: /3着(?:ズレ|荒れ|抜け|混入|候補)|三着(?:ズレ|荒れ|抜け|混入|候補)/u,
    guidance: "本線ラインの3番手だけに固定せず、別線と単騎を3着候補に残す",
  },
  {
    tag: "OTHER_LINE_ALERT",
    label: "別線の浮上を警戒",
    pattern: /別線|ライン崩れ|本線崩れ/u,
    guidance: "本線が崩れた場合の別線頭と別線3着を保護する",
  },
  {
    tag: "SOLO_RIDER_ALERT",
    label: "単騎の差し込みを警戒",
    pattern: /単騎|単騎一撃|単騎差し/u,
    guidance: "踏み合い時は単騎の差し込みを3着候補に加える",
  },
  {
    tag: "WIND_SENSITIVE",
    label: "風条件を確認",
    pattern: /強風|風影響|風向|風速|横風|向かい風|追い風/u,
    guidance: "風向と風速を確認し、先行残りと差し届きを固定評価しない",
  },
  {
    tag: "MAKURI_ALERT",
    label: "捲り展開を警戒",
    pattern: /捲り|捲=/u,
    guidance: "先行争いがある場合は別線の捲り筋を残す",
  },
  {
    tag: "LINE_COHESION",
    label: "同ライン決着を評価",
    pattern: /同ライン|ラインワンツー|ズブズブ|ライン決着/u,
    guidance: "ラインの長さと追走力を確認し、同ライン決着を評価する",
  },
  {
    tag: "TIME_SLOT_BIAS",
    label: "時間帯差を確認",
    pattern: /モーニング|デイ|ナイター|ミッドナイト|時間帯/u,
    guidance: "開催時間帯ごとの傾向を他時間帯へそのまま転用しない",
  },
  {
    tag: "CLASS_CONTEXT",
    label: "級班条件を分離",
    pattern: /S級|Ａ級|A級|L級|チャレンジ|ガールズ/u,
    guidance: "級班とレース種別を分けて傾向を評価する",
  },
];

function normalizeText(value) {
  return String(value ?? "").replace(/^\uFEFF/u, "").replace(/\r\n?/g, "\n");
}

function cleanMarkdown(value, maxLength = 180) {
  return String(value ?? "")
    .replace(/<!--[\s\S]*?-->/gu, " ")
    .replace(/[`*_>#|]/g, " ")
    .replace(/\[(.*?)\]\(.*?\)/gu, "$1")
    .replace(/\s+/g, " ")
    .replace(/^[-:：・\s]+|[-:：・\s]+$/g, "")
    .trim()
    .slice(0, maxLength);
}

function parseNumber(value) {
  if (value == null) return null;
  const normalized = String(value).replace(/[,\s]/g, "");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1] != null) return match[1];
  }
  return null;
}

function extractDate(text, relativePath) {
  const match = `${text.slice(0, 6000)}\n${relativePath}`.match(
    /(?:20\d{2})[-/.年](?:0?[1-9]|1[0-2])[-/.月](?:0?[1-9]|[12]\d|3[01])日?/u,
  );
  if (!match) return null;
  const parts = match[0].match(/\d+/g);
  if (!parts || parts.length < 3) return null;
  return `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
}

function extractVenue(text, relativePath) {
  const fileSlug = path.basename(relativePath).toLowerCase().match(/^([a-z0-9-]+?)(?:[-_](?:summary|review)|\.)/u)?.[1];
  const canonicalSlug = slugAliases[fileSlug] ?? fileSlug;
  if (canonicalSlug && venueMap[canonicalSlug]) {
    return { venueKey: canonicalSlug, venueName: venueMap[canonicalSlug] };
  }

  const header = text.slice(0, 5000);
  const match = Object.entries(venueMap).find(([, venueName]) =>
    new RegExp(`${venueName}(?:競輪場|競輪)?`, "u").test(header),
  );
  return match ? { venueKey: match[0], venueName: match[1] } : null;
}

function extractSummaryWindow(text) {
  const detailedSection = text.search(/\n##\s+(?:3\)|3\.|3\s|20\d{2}-\d{2}-\d{2})/u);
  return (detailedSection >= 0 ? text.slice(0, detailedSection) : text.slice(0, 12000)).replace(/\*\*/g, "");
}

function extractKpi(text) {
  const summary = extractSummaryWindow(text);
  const raceCount = parseNumber(firstMatch(summary, [
    /対象レース数\s*[:：]\s*(\d+)\s*R?/u,
    /対象レース範囲\s*[:：]\s*\d+R\s*[〜～~-]\s*(\d+)R/u,
  ]));
  const trifectaHits = parseNumber(firstMatch(summary, [/3連単的中\s*[:：]\s*(\d+)\s*R?/u]));
  const exactaHits = parseNumber(firstMatch(summary, [/2車単的中\s*[:：]\s*(\d+)\s*R?/u]));
  const anyTicketHits = parseNumber(firstMatch(summary, [
    /(?:いずれか|レース)的中\s*[:：]\s*(\d+)\s*R?/u,
  ]));
  const investmentYen = parseNumber(firstMatch(summary, [
    /(?:総)?投資(?:額)?\s*[:：]\s*([\d,]+)\s*円/u,
  ]));
  const returnYen = parseNumber(firstMatch(summary, [
    /(?:総)?回収(?:額)?\s*[:：]\s*([\d,]+)\s*円/u,
    /払戻(?:額)?\s*[:：]\s*([\d,]+)\s*円/u,
  ]));
  const statedHitRate = parseNumber(firstMatch(summary, [
    /(?:レース)?的中率\s*[:：]\s*([\d.]+)\s*%/u,
    /3連単的中[^\n]*的中率\s*[:：]\s*([\d.]+)\s*%/u,
  ]));
  const statedRecoveryRate = parseNumber(firstMatch(summary, [/回収率\s*[:：]\s*([\d.]+)\s*%/u]));

  const kimarite = { escape: null, makuri: null, sashi: null };
  const kimariteLine = summary.match(/(?:主な)?決まり手[^\n]*/u)?.[0] ?? "";
  kimarite.escape = parseNumber(firstMatch(kimariteLine, [/逃\s*[=:：]\s*(\d+)/u]));
  kimarite.makuri = parseNumber(firstMatch(kimariteLine, [/捲\s*[=:：]\s*(\d+)/u]));
  kimarite.sashi = parseNumber(firstMatch(kimariteLine, [/差\s*[=:：]\s*(\d+)/u]));

  return {
    raceCount,
    trifectaHits,
    exactaHits,
    anyTicketHits,
    investmentYen,
    returnYen,
    statedHitRate,
    statedRecoveryRate,
    kimarite,
  };
}

function extractNotes(text) {
  const notes = { features: [], targets: [], cautions: [], improvements: [] };
  const categories = [
    ["features", /特徴|傾向|ポイント/u],
    ["targets", /狙い|重視|買い|有効/u],
    ["cautions", /警戒|注意|リスク|危険/u],
    ["improvements", /改善|次回|見直|修正|反映/u],
  ];

  for (const rawLine of text.split("\n")) {
    const line = cleanMarkdown(rawLine);
    if (line.length < 8 || line.length > 240) continue;
    for (const [key, pattern] of categories) {
      if (!pattern.test(line) || notes[key].length >= 3) continue;
      if (!notes[key].includes(line)) notes[key].push(line);
    }
  }
  return notes;
}

function confidenceFromEvidence(count) {
  if (count >= 10) return "high";
  if (count >= 3) return "medium";
  return "low";
}

function uniqueLimited(values, limit = 12) {
  return [...new Set(values.filter(Boolean))].slice(0, limit);
}

async function collectInputFiles(directory) {
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
      if (entry.isFile() && /\.(?:txt|md)$/iu.test(entry.name)) files.push(target);
    }
  }
  await visit(directory);
  return files.sort((left, right) => left.localeCompare(right));
}

function mergeKpi(records) {
  const sumKnown = (selector) => {
    const values = records.map(selector).filter((value) => Number.isFinite(value));
    return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
  };
  const raceCount = sumKnown((record) => record.kpi.raceCount);
  const trifectaHits = sumKnown((record) => record.kpi.trifectaHits);
  const exactaHits = sumKnown((record) => record.kpi.exactaHits);
  const anyTicketHits = sumKnown((record) => record.kpi.anyTicketHits);
  const investmentYen = sumKnown((record) => record.kpi.investmentYen);
  const returnYen = sumKnown((record) => record.kpi.returnYen);
  const sumRaceCountFor = (selector) => records
    .filter((record) => Number.isFinite(record.kpi.raceCount) && Number.isFinite(selector(record)))
    .reduce((sum, record) => sum + record.kpi.raceCount, 0);
  const trifectaRaceCount = sumRaceCountFor((record) => record.kpi.trifectaHits);
  const exactaRaceCount = sumRaceCountFor((record) => record.kpi.exactaHits);
  const anyTicketRaceCount = sumRaceCountFor((record) => record.kpi.anyTicketHits);
  return {
    sourceType: "SEED",
    sourceCount: records.length,
    raceCount,
    trifectaHits,
    trifectaHitRate: trifectaRaceCount > 0
      ? Number(((trifectaHits / trifectaRaceCount) * 100).toFixed(1))
      : null,
    exactaHits,
    exactaHitRate: exactaRaceCount > 0
      ? Number(((exactaHits / exactaRaceCount) * 100).toFixed(1))
      : null,
    anyTicketHits,
    hitRate: anyTicketRaceCount > 0
      ? Number(((anyTicketHits / anyTicketRaceCount) * 100).toFixed(1))
      : null,
    investmentYen,
    returnYen,
    recoveryRate: investmentYen > 0 && Number.isFinite(returnYen)
      ? Number(((returnYen / investmentYen) * 100).toFixed(1))
      : null,
    kimarite: {
      escape: sumKnown((record) => record.kpi.kimarite.escape),
      makuri: sumKnown((record) => record.kpi.kimarite.makuri),
      sashi: sumKnown((record) => record.kpi.kimarite.sashi),
    },
  };
}

function buildVenuePayload(venueKey, records) {
  const venueName = records[0].venueName;
  const dates = records.map((record) => record.date).filter(Boolean).sort();
  const seedInsights = insightRules
    .map((rule) => {
      const evidenceCount = records.filter((record) => rule.pattern.test(record.text)).length;
      if (!evidenceCount) return null;
      return {
        tag: rule.tag,
        label: rule.label,
        evidenceCount,
        confidence: confidenceFromEvidence(evidenceCount),
        sourceType: "SEED",
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.evidenceCount - left.evidenceCount || left.tag.localeCompare(right.tag));
  const notes = {
    features: uniqueLimited(records.flatMap((record) => record.notes.features)),
    targets: uniqueLimited(records.flatMap((record) => record.notes.targets)),
    cautions: uniqueLimited(records.flatMap((record) => record.notes.cautions)),
    improvements: uniqueLimited(records.flatMap((record) => record.notes.improvements)),
  };
  const predictionGuidance = uniqueLimited(
    seedInsights
      .map((insight) => insightRules.find((rule) => rule.tag === insight.tag)?.guidance)
      .concat(notes.improvements.slice(0, 3)),
    8,
  );

  return {
    schemaVersion: 1,
    venueKey,
    venueName,
    updatedAt,
    source: "review-summary-import",
    sourceType: "SEED",
    period: { from: dates[0] ?? null, to: dates.at(-1) ?? null },
    quality: {
      seedSources: records.length,
      parsedDateSources: dates.length,
      exactRaceCount: 0,
      status: "seed",
    },
    seedKpi: mergeKpi(records),
    seedInsights,
    seedNotes: notes,
    predictionGuidance,
  };
}

function serialize(payload) {
  return `${JSON.stringify(payload, null, 2)}\n`;
}

function calculateOutputBytes(outputs) {
  return outputs.reduce((sum, output) => sum + Buffer.byteLength(output.content), 0);
}

async function buildOutputs(records, warnings, stats) {
  const venueGroups = records.reduce((groups, record) => {
    const current = groups.get(record.venueKey) ?? [];
    current.push(record);
    groups.set(record.venueKey, current);
    return groups;
  }, new Map());
  const venuePayloads = [...venueGroups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([venueKey, venueRecords]) => buildVenuePayload(venueKey, venueRecords));

  const outputs = [];
  for (const venue of venuePayloads) {
    outputs.push({
      relativePath: `venues/${venue.venueKey}.generated.json`,
      content: serialize(venue),
    });
    outputs.push({
      relativePath: `guidance/${venue.venueKey}.generated.json`,
      content: serialize({
        schemaVersion: 1,
        venueKey: venue.venueKey,
        venueName: venue.venueName,
        updatedAt,
        source: "review-summary-import",
        sourceType: "SEED",
        period: venue.period,
        items: venue.predictionGuidance.map((text) => ({ text, sourceType: "SEED" })),
      }),
    });
  }

  outputs.push({
    relativePath: "global/prediction-kpi.generated.json",
    content: serialize({
      schemaVersion: 1,
      generatedAt,
      source: "review-summary-import",
      sourceType: "SEED",
      period: {
        from: records.map((record) => record.date).filter(Boolean).sort()[0] ?? null,
        to: records.map((record) => record.date).filter(Boolean).sort().at(-1) ?? null,
      },
      kpi: mergeKpi(records),
    }),
  });

  const dataFiles = outputs.map((output) => `/data/analytics/kurari-ex/${output.relativePath}`);
  const index = {
    schemaVersion: 1,
    generatedAt,
    venueCount: venuePayloads.length,
    seedSourceCount: records.length,
    exactRaceCount: 0,
    manualTagCount: 0,
    files: [
      "/data/analytics/kurari-ex/status.generated.json",
      "/data/analytics/kurari-ex/global/prediction-kpi.generated.json",
      ...dataFiles.filter((file) => !file.endsWith("prediction-kpi.generated.json")),
    ],
    warnings,
  };
  outputs.push({ relativePath: "index.generated.json", content: serialize(index) });

  const oversizedFiles = outputs
    .filter((output) => Buffer.byteLength(output.content) > 100 * 1024)
    .map((output) => output.relativePath);
  const statusBase = {
    schemaVersion: 1,
    lastImportAt: generatedAt,
    inputFileCount: stats.inputFileCount,
    parsedFileCount: stats.parsedFileCount,
    skippedFileCount: stats.skippedFileCount,
    warningCount: warnings.length,
    outputBytes: 0,
    oversizedFiles,
  };
  let statusContent = serialize(statusBase);
  for (let index = 0; index < 3; index += 1) {
    statusBase.outputBytes = calculateOutputBytes(outputs) + Buffer.byteLength(statusContent);
    statusContent = serialize(statusBase);
  }
  outputs.push({ relativePath: "status.generated.json", content: statusContent });
  return { outputs, venueCount: venuePayloads.length };
}

async function writeOutputs(outputs) {
  await mkdir(outputRoot, { recursive: true });
  await Promise.all([
    rm(path.join(outputRoot, "venues"), { recursive: true, force: true }),
    rm(path.join(outputRoot, "guidance"), { recursive: true, force: true }),
    rm(path.join(outputRoot, "global", "prediction-kpi.generated.json"), { force: true }),
    rm(path.join(outputRoot, "index.generated.json"), { force: true }),
    rm(path.join(outputRoot, "status.generated.json"), { force: true }),
  ]);
  for (const output of outputs) {
    const target = path.join(outputRoot, output.relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, output.content, "utf8");
  }
}

async function main() {
  await Promise.all([
    mkdir(path.join(summariesRoot, "2026-04"), { recursive: true }),
    mkdir(path.join(summariesRoot, "2026-05"), { recursive: true }),
    mkdir(path.join(summariesRoot, "2026-06"), { recursive: true }),
    mkdir(path.join(inputRoot, "predictions"), { recursive: true }),
    mkdir(path.join(inputRoot, "results"), { recursive: true }),
  ]);

  const inputFiles = await collectInputFiles(summariesRoot);
  const warnings = [];
  const records = [];

  for (const inputFile of inputFiles) {
    const relativePath = path.relative(summariesRoot, inputFile).replaceAll(path.sep, "/");
    const text = normalizeText(await readFile(inputFile, "utf8"));
    if (!text.trim()) {
      warnings.push(`empty input skipped: ${relativePath}`);
      continue;
    }
    const venue = extractVenue(text, relativePath);
    if (!venue) {
      warnings.push(`venue not found: ${relativePath}`);
      continue;
    }
    const date = extractDate(text, relativePath);
    if (!date) warnings.push(`date not found: ${relativePath}`);
    records.push({
      ...venue,
      date,
      text,
      kpi: extractKpi(text),
      notes: extractNotes(text),
    });
  }

  const stats = {
    inputFileCount: inputFiles.length,
    parsedFileCount: records.length,
    skippedFileCount: inputFiles.length - records.length,
  };
  const { outputs, venueCount } = await buildOutputs(records, warnings, stats);
  const outputBytes = calculateOutputBytes(outputs);

  if (!dryRun) await writeOutputs(outputs);

  console.log("[kurari-ex seed import]");
  console.log(`mode: ${dryRun ? "dry-run" : "write"}`);
  console.log(`input files: ${stats.inputFileCount}`);
  console.log(`parsed: ${stats.parsedFileCount}`);
  console.log(`skipped: ${stats.skippedFileCount}`);
  console.log(`venues: ${venueCount}`);
  console.log(`warnings: ${warnings.length}`);
  console.log(`output estimate: ${(outputBytes / 1024).toFixed(1)} KB`);
}

main().catch((error) => {
  console.error("[kurari-ex seed import] failed");
  console.error(error);
  process.exitCode = 1;
});
