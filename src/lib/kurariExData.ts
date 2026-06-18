import type {
  KurariExGlobalKpi,
  KurariExGuidance,
  KurariExExactGlobalKpi,
  KurariExExactIndex,
  KurariExExactInitialData,
  KurariExExactStatus,
  KurariExExactVenueListItem,
  KurariExIndex,
  KurariExInitialData,
  KurariExMatchupExact,
  KurariExMatchupExactIndex,
  KurariExMatchupExactInitialData,
  KurariExMatchupExactStatus,
  KurariExMetric,
  KurariExPredictionContext,
  KurariExRiderAggregate,
  KurariExRiderExact,
  KurariExRiderExactIndex,
  KurariExRiderExactInitialData,
  KurariExRiderExactStatus,
  KurariExRiderMetric,
  KurariExRiderQuality,
  KurariExStatus,
  KurariExVenue,
  KurariExVenueBundle,
  KurariExVenueExact,
  KurariExVenueListItem,
} from "../types/kurariEx";

const EX_ROOT = "/data/analytics/kurari-ex";
const EXACT_ROOT = `${EX_ROOT}/exact`;
const RIDER_EXACT_ROOT = `${EXACT_ROOT}/riders`;
const MATCHUP_EXACT_ROOT = `${EXACT_ROOT}/matchups`;
let riderExactIndexPromise: Promise<KurariExRiderExactIndex> | null = null;
let matchupExactIndexPromise: Promise<KurariExMatchupExactIndex> | null = null;

const venueNameMap: Record<string, string> = {
  aomori: "青森",
  beppu: "別府",
  gifu: "岐阜",
  hakodate: "函館",
  hiratsuka: "平塚",
  hiroshima: "広島",
  hofu: "防府",
  ito: "伊東",
  iwakitaira: "いわき平",
  keiokaku: "京王閣",
  kishiwada: "岸和田",
  kochi: "高知",
  kokura: "小倉",
  komatsushima: "小松島",
  kumamoto: "熊本",
  kurume: "久留米",
  maebashi: "前橋",
  matsudo: "松戸",
  matsusaka: "松阪",
  matsuyama: "松山",
  nagoya: "名古屋",
  nara: "奈良",
  odawara: "小田原",
  ogaki: "大垣",
  omiya: "大宮",
  seibuen: "西武園",
  shizuoka: "静岡",
  takeo: "武雄",
  tamano: "玉野",
  toride: "取手",
  toyama: "富山",
  toyohashi: "豊橋",
  utsunomiya: "宇都宮",
  wakayama: "和歌山",
  yahiko: "弥彦",
};

function toPublicPath(relativePath: string) {
  const base = import.meta.env.BASE_URL.replace(/\/$/u, "");
  const normalized = relativePath.startsWith("/") ? relativePath : `/${relativePath}`;
  return `${base}${normalized}`;
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(toPublicPath(path), { cache: "no-store" });
  if (!response.ok) throw new Error(`KURARI EX fetch failed: ${response.status} ${path}`);
  return response.json() as Promise<T>;
}

export async function loadKurariExIndex(): Promise<KurariExIndex> {
  return fetchJson<KurariExIndex>(`${EX_ROOT}/index.generated.json`);
}

export async function loadKurariExExactIndex(): Promise<KurariExExactIndex> {
  return fetchJson<KurariExExactIndex>(`${EXACT_ROOT}/index.generated.json`);
}

export function buildKurariExExactVenueList(index: KurariExExactIndex): KurariExExactVenueListItem[] {
  return index.files
    .reduce<KurariExExactVenueListItem[]>((items, file) => {
      const match = file.match(/\/exact\/venues\/([^/]+)\.generated\.json$/u);
      if (!match) return items;
      const venueKey = match[1];
      items.push({
        venueKey,
        venueName: venueNameMap[venueKey] ?? venueKey,
        exactFile: file,
      });
      return items;
    }, [])
    .sort((left, right) => left.venueName.localeCompare(right.venueName, "ja"));
}

export function findKurariExExactVenueEntryByVenueName(
  index: KurariExExactIndex,
  venueName?: string | null,
  venueKey?: string | null,
): KurariExExactVenueListItem | null {
  const venues = buildKurariExExactVenueList(index);
  const normalizedKey = String(venueKey ?? "").trim().toLowerCase();
  if (normalizedKey) {
    const byKey = venues.find((item) => item.venueKey.toLowerCase() === normalizedKey);
    if (byKey) return byKey;
  }
  const normalizedName = normalizeKurariExVenueName(venueName);
  return venues.find((item) => normalizeKurariExVenueName(item.venueName) === normalizedName) ?? null;
}

export function buildKurariExVenueList(index: KurariExIndex): KurariExVenueListItem[] {
  const guidanceFiles = new Map<string, string>();
  for (const file of index.files) {
    const match = file.match(/\/guidance\/([^/]+)\.generated\.json$/u);
    if (match) guidanceFiles.set(match[1], file);
  }

  return index.files
    .reduce<KurariExVenueListItem[]>((items, file) => {
      const match = file.match(/\/venues\/([^/]+)\.generated\.json$/u);
      if (!match) return items;
      const venueKey = match[1];
      items.push({
        venueKey,
        venueName: venueNameMap[venueKey] ?? venueKey,
        venueFile: file,
        guidanceFile: guidanceFiles.get(venueKey),
      });
      return items;
    }, [])
    .sort((left, right) => left.venueName.localeCompare(right.venueName, "ja"));
}

function normalizeKurariExVenueName(value?: string | null) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/競輪場|競輪/gu, "")
    .replace(/\s*(?:G[1-3]|F[12])\s*$/iu, "")
    .replace(/\s+/gu, "")
    .trim();
}

export function findKurariExVenueEntryByVenueName(
  index: KurariExIndex,
  venueName?: string | null,
  venueKey?: string | null,
): KurariExVenueListItem | null {
  const venues = buildKurariExVenueList(index);
  const normalizedKey = String(venueKey ?? "").trim().toLowerCase();
  if (normalizedKey) {
    const byKey = venues.find((item) => item.venueKey.toLowerCase() === normalizedKey);
    if (byKey) return byKey;
  }
  const normalizedName = normalizeKurariExVenueName(venueName);
  if (!normalizedName) return null;
  return venues.find((item) => normalizeKurariExVenueName(item.venueName) === normalizedName) ?? null;
}

const KURARI_EX_PREDICTION_CHECKS = [
  "本線ラインの3番手だけに固定しない",
  "3着候補を同じ役割だけへ偏らせない",
  "OTHER_SELF / OTHER_MARK / SINGLE の必要性を確認する",
  "番手差しの逆目を残すべきか確認する",
  "2車単 SALVAGE_REVERSE / SALVAGE_BREAK の必要性を確認する",
];

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export function formatKurariExMetric(metric?: KurariExMetric | null) {
  if (!metric || metric.rate == null) return "--";
  return `${metric.rate.toFixed(1)}%（${metric.count.toLocaleString("ja-JP")} / ${metric.total.toLocaleString("ja-JP")}）`;
}

const predictionMetricLabels = {
  trifectaHitRate: "3連単的中率",
  exactaHitRate: "2車単的中率",
  anyHitRate: "いずれか的中率",
  exactaSalvageRate: "2車単救済率",
  thirdOnlyMissRate: "3着だけ抜け率",
  headMissRate: "1着候補不在率",
} as const;

const racePatternLabels = {
  escapeWinRate: "逃げ率",
  makuriWinRate: "捲り率",
  sashiWinRate: "差し率",
  sameLineTop2Rate: "同ラインワンツー率",
  sameLineTop3Rate: "同ラインスリー率",
  otherLineThirdRate: "別線3着混入率",
  singleThirdRate: "単騎3着率",
  bRiderInsideTop3Rate: "B選手車券内残り率",
  favoriteTrifectaHitRate: "3連単1番人気的中率",
} as const;

function resolvePredictionDimensionKeys(context?: KurariExPredictionContext | null) {
  const time = String(context?.raceTime ?? "").match(/^(\d{1,2}):/u);
  const hour = time ? Number(time[1]) : null;
  const timeslot = context?.timeslot === "midnight"
    ? "midnight"
    : context?.timeslot === "night"
      ? "night"
      : context?.timeslot === "morning" || (context?.timeslot === "day" && hour != null && hour < 12)
        ? "morning"
        : context?.timeslot === "day"
          ? "day"
          : null;
  const title = String(context?.raceTitle ?? "");
  const raceClass = context?.isGirls || /ガールズ|L級/u.test(title)
    ? "girls"
    : /チャレンジ|A級3班|A3/u.test(title)
      ? "a3"
      : /S級/u.test(title)
        ? "s"
        : /A級/u.test(title)
          ? "a"
          : null;
  const lineup = String(context?.lineup ?? "").trim();
  const lineCount = lineup && !/未取得|未掲載|不明/u.test(lineup)
    ? lineup.split(/[\s/／|｜]+/u).filter(Boolean).length
    : null;
  const lineCountKey = lineCount == null ? null : lineCount <= 2 ? "2" : lineCount === 3 ? "3" : "4+";
  const windMps = Number.isFinite(context?.windSpeedKmh)
    ? Number(context?.windSpeedKmh) / 3.6
    : null;
  const windSpeedKey = windMps == null ? null : windMps < 2 ? "0-2" : windMps < 4 ? "2-4" : "4+";
  return { timeslot, raceClass, lineCount: lineCountKey, windSpeedMps: windSpeedKey };
}

function buildExactLines(exact: KurariExVenueExact, context?: KurariExPredictionContext | null) {
  const lines = [
    "【会場別EXACT】",
    `- 対象会場: ${exact.venueName}`,
    `- 対象期間: ${exact.period.from ?? "--"}〜${exact.period.to ?? "--"}`,
    `- 正規化レース数: ${exact.coverage.normalizedRaces}`,
    `- Prediction解析可能: ${exact.coverage.predictionParsed}`,
    `- 結果解析可能: ${exact.coverage.resultParsed}`,
    `- ライン解析可能: ${exact.coverage.lineupParsed}`,
    "",
    "【予想精度】",
    ...Object.entries(predictionMetricLabels).map(([key, label]) =>
      `- ${label}: ${formatKurariExMetric(exact.predictionKpi[key as keyof typeof exact.predictionKpi])}`
    ),
    "",
    "【展開傾向】",
    ...(["sameLineTop2Rate", "sameLineTop3Rate", "otherLineThirdRate", "singleThirdRate", "escapeWinRate", "makuriWinRate", "sashiWinRate"] as const)
      .map((key) => `- ${racePatternLabels[key]}: ${formatKurariExMetric(exact.racePattern[key])}`),
  ];
  const keys = resolvePredictionDimensionKeys(context);
  const dimensionLabels = {
    timeslot: { label: "時間帯", names: { morning: "モーニング", day: "デイ", night: "ナイター", midnight: "ミッド" } },
    raceClass: { label: "級班", names: { a: "A級", s: "S級", a3: "A3", girls: "ガールズ", other: "その他" } },
    lineCount: { label: "分戦数", names: { "2": "2分戦", "3": "3分戦", "4+": "4分戦以上" } },
    windSpeedMps: { label: "風速帯", names: { "0-2": "0〜2m/s", "2-4": "2〜4m/s", "4+": "4m/s以上" } },
  } as const;
  const dimensionLines: string[] = [];
  for (const dimension of Object.keys(keys) as Array<keyof typeof keys>) {
    const key = keys[dimension];
    if (!key) continue;
    const entry = exact.dimensions[dimension][key];
    if (!entry) continue;
    const label = dimensionLabels[dimension].label;
    const name = (dimensionLabels[dimension].names as Record<string, string>)[key] ?? key;
    dimensionLines.push(`- ${label}: ${name} / いずれか的中 ${formatKurariExMetric(entry.predictionKpi.anyHitRate)} / 同ライン1-2 ${formatKurariExMetric(entry.racePattern.sameLineTop2Rate)}`);
  }
  if (dimensionLines.length) lines.push("", "【今回条件に近いカテゴリ】", ...dimensionLines);
  return lines;
}

function isKurariExUsefulMetric(metric?: KurariExMetric | null, minTotal = 20, minRate = 0) {
  return !!metric && metric.rate != null && metric.total >= minTotal && metric.rate >= minRate;
}

function buildKurariExPracticalMemo(exact: KurariExVenueExact, context?: KurariExPredictionContext | null) {
  if (exact.coverage.normalizedRaces < 30) return [];

  const lines: string[] = ["【EX実戦メモ / 採用できるものだけ】"];
  const checks: string[] = [];

  if (isKurariExUsefulMetric(exact.predictionKpi.thirdOnlyMissRate, 20, 25)) {
    checks.push("3着だけ抜け率が高い。3着保護を削らず、別線・単騎・ライン3番手を分散する。");
  }
  if (isKurariExUsefulMetric(exact.racePattern.sameLineTop2Rate, 20, 60)) {
    checks.push("同ラインワンツー率が高い。本線ラインの1-2、番手差し逆目を優先確認する。");
  }
  if (isKurariExUsefulMetric(exact.racePattern.sameLineTop3Rate, 20, 50)) {
    checks.push("同ラインスリー率が高い。3番手まで機能するラインは3着に残す。");
  }
  if (isKurariExUsefulMetric(exact.racePattern.otherLineThirdRate, 20, 10)) {
    checks.push("別線3着混入が一定以上。3着を本線内だけで固定しない。");
  }
  if (isKurariExUsefulMetric(exact.racePattern.singleThirdRate, 20, 10)) {
    checks.push("単騎3着が一定以上。単騎・イン溜めの3着差し込みを残す。");
  }
  if (isKurariExUsefulMetric(exact.racePattern.escapeWinRate, 30, 40)) {
    checks.push("逃げ1着率が高め。主導権ラインの押し切りを本線候補に残す。");
  }
  if (isKurariExUsefulMetric(exact.racePattern.makuriWinRate, 30, 40)) {
    checks.push("捲り1着率が高め。別線自力の頭・2着を消しすぎない。");
  }
  if (isKurariExUsefulMetric(exact.racePattern.sashiWinRate, 30, 40)) {
    checks.push("差し1着率が高め。番手差し・3番手強襲・逆目を確認する。");
  }

  const keys = resolvePredictionDimensionKeys(context);
  const dimensionLabels = {
    timeslot: { label: "時間帯", names: { morning: "モーニング", day: "デイ", night: "ナイター", midnight: "ミッド" } },
    raceClass: { label: "級班", names: { a: "A級", s: "S級", a3: "A3", girls: "ガールズ", other: "その他" } },
    lineCount: { label: "分戦数", names: { "2": "2分戦", "3": "3分戦", "4+": "4分戦以上" } },
    windSpeedMps: { label: "風速帯", names: { "0-2": "0〜2m/s", "2-4": "2〜4m/s", "4+": "4m/s以上" } },
  } as const;

  for (const dimension of Object.keys(keys) as Array<keyof typeof keys>) {
    const key = keys[dimension];
    if (!key) continue;
    const entry = exact.dimensions[dimension][key];
    if (!entry) continue;
    const label = dimensionLabels[dimension].label;
    const name = (dimensionLabels[dimension].names as Record<string, string>)[key] ?? key;
    if (isKurariExUsefulMetric(entry.racePattern.sameLineTop2Rate, 8, 60)) {
      checks.push("今回条件EX: " + label + "「" + name + "」は同ライン1-2が強め。ライン決着を軽視しない。");
    }
    if (isKurariExUsefulMetric(entry.predictionKpi.thirdOnlyMissRate, 8, 25)) {
      checks.push("今回条件EX: " + label + "「" + name + "」は3着だけ抜け注意。3着候補を広げる。");
    }
  }

  if (!checks.length) return [];
  lines.push(...uniqueStrings(checks).slice(0, 8).map((item) => "- " + item));
  return lines;
}

function buildKurariExPredictionMaterialText(
  venue: KurariExVenue | null,
  guidance: KurariExGuidance | null,
  exact: KurariExVenueExact | null,
  context: KurariExPredictionContext | null | undefined,
  riderMaterial: string,
  insightLimit: number,
  guidanceLimit: number,
) {
  if (!venue && !exact && !riderMaterial) {
    return [
      "[P. KURARI EX DATA / 独自展開指標]",
      "",
      "KURARI EX DATAは未登録です。",
      "既存のKDreams素材・会場別マスター分析・Summary学習メモを主として予想してください。",
    ].join("\n");
  }
  const lines = [
    "[P. KURARI EX DATA / 独自展開指標]",
    "",
    "現在の育成段階:",
    venue && exact ? "SEED + EXACT" : exact ? "EXACT ANALYTICS" : "SEED INSIGHT",
    "",
    "扱い:",
    ...(exact ? ["EXACTは正規化履歴から機械的に算出した確定集計です。", "母数が少ない指標は過信しないでください。"] : []),
    ...(venue ? ["SEEDは過去Summaryから抽出した初期知識です。"] : []),
  ];
  if (exact) {
    lines.push("", ...buildExactLines(exact, context));
    const practicalMemo = buildKurariExPracticalMemo(exact, context);
    if (practicalMemo.length) lines.push("", ...practicalMemo);
  }
  if (riderMaterial) lines.push("", riderMaterial);
  if (venue) {
    lines.push("", "【会場別SEED】", `- 対象会場: ${venue.venueName}`);
  }
  if (venue && (venue.period.from || venue.period.to)) {
    lines.push(`- 対象期間: ${venue.period.from ?? "--"}〜${venue.period.to ?? "--"}`);
  }
  if (venue && Number.isFinite(venue.quality.seedSources)) {
    lines.push(`- Summary取込件数: ${venue.quality.seedSources}`);
  }
  if (venue?.quality.status) lines.push(`- データ品質: ${venue.quality.status.toUpperCase()}`);
  if (venue?.updatedAt) lines.push(`- 最終更新: ${venue.updatedAt}`);

  const insights = [...(venue?.seedInsights ?? [])]
    .sort((left, right) => {
      const leftAlert = /ALERT|警戒/u.test(`${left.tag} ${left.label}`) ? 1 : 0;
      const rightAlert = /ALERT|警戒/u.test(`${right.tag} ${right.label}`) ? 1 : 0;
      return rightAlert - leftAlert || right.evidenceCount - left.evidenceCount;
    })
    .slice(0, insightLimit);
  if (insights.length) {
    lines.push("", "【SEED INSIGHTS】");
    for (const insight of insights) {
      lines.push(`- ${insight.label}`);
      if (insight.sourceType) lines.push(`  - sourceType: ${insight.sourceType}`);
      if (insight.confidence) lines.push(`  - confidence: ${insight.confidence}`);
      if (Number.isFinite(insight.evidenceCount)) lines.push(`  - evidenceCount: ${insight.evidenceCount}`);
    }
  }

  const guidanceItems = uniqueStrings([
    ...(guidance?.items.map((item) => item.text) ?? []),
    ...(venue?.predictionGuidance ?? []),
  ]).slice(0, guidanceLimit);
  if (guidanceItems.length) {
    lines.push("", "【PREDICTION GUIDANCE】");
    lines.push(...guidanceItems.map((item) => `- ${item}`));
  }

  lines.push("", "【今回の買い目設計で確認すること】");
  lines.push(...KURARI_EX_PREDICTION_CHECKS.map((item) => `- ${item}`));
  return lines.join("\n");
}

export function buildKurariExPredictionMaterial(
  bundle: KurariExVenueBundle | null,
  exact: KurariExVenueExact | null = null,
  context?: KurariExPredictionContext | null,
  riderMaterial = "",
): string {
  const venue = bundle?.venue ?? null;
  const guidance = bundle?.guidance ?? null;
  const maxLength = riderMaterial ? 8000 : 4500;
  for (let insightLimit = Math.min(8, venue?.seedInsights.length ?? 0); insightLimit >= 0; insightLimit -= 1) {
    const text = buildKurariExPredictionMaterialText(venue, guidance, exact, context, riderMaterial, insightLimit, 8);
    if (text.length <= maxLength) return text;
  }
  for (let guidanceLimit = 7; guidanceLimit >= 1; guidanceLimit -= 1) {
    const text = buildKurariExPredictionMaterialText(venue, guidance, exact, context, riderMaterial, 0, guidanceLimit);
    if (text.length <= maxLength) return text;
  }
  return buildKurariExPredictionMaterialText(venue, guidance, exact, context, riderMaterial, 0, 1).slice(0, maxLength);
}

export async function loadKurariExInitialData(): Promise<KurariExInitialData> {
  const [index, status, globalKpi] = await Promise.all([
    loadKurariExIndex(),
    fetchJson<KurariExStatus>(`${EX_ROOT}/status.generated.json`),
    fetchJson<KurariExGlobalKpi>(`${EX_ROOT}/global/prediction-kpi.generated.json`),
  ]);
  return { index, status, globalKpi, venues: buildKurariExVenueList(index) };
}

export async function loadKurariExVenueBundle(
  item: KurariExVenueListItem,
): Promise<KurariExVenueBundle> {
  const venuePromise = fetchJson<KurariExVenue>(item.venueFile);
  const guidancePromise = item.guidanceFile
    ? fetchJson<KurariExGuidance>(item.guidanceFile).catch(() => null)
    : Promise.resolve(null);
  const [venue, guidance] = await Promise.all([venuePromise, guidancePromise]);
  return { venue, guidance };
}

export async function loadKurariExExactInitialData(): Promise<KurariExExactInitialData> {
  const [index, status, globalKpi] = await Promise.all([
    loadKurariExExactIndex(),
    fetchJson<KurariExExactStatus>(`${EXACT_ROOT}/status.generated.json`),
    fetchJson<KurariExExactGlobalKpi>(`${EXACT_ROOT}/global/prediction-kpi.generated.json`),
  ]);
  return { index, status, globalKpi, venues: buildKurariExExactVenueList(index) };
}

export async function loadKurariExVenueExact(
  item: KurariExExactVenueListItem | string,
): Promise<KurariExVenueExact> {
  const path = typeof item === "string"
    ? `${EXACT_ROOT}/venues/${item}.generated.json`
    : item.exactFile;
  return fetchJson<KurariExVenueExact>(path);
}

export async function loadKurariExRiderExactIndex(): Promise<KurariExRiderExactIndex> {
  if (!riderExactIndexPromise) {
    riderExactIndexPromise = fetchJson<KurariExRiderExactIndex>(`${RIDER_EXACT_ROOT}/index.generated.json`)
      .catch((error) => {
        riderExactIndexPromise = null;
        throw error;
      });
  }
  return riderExactIndexPromise;
}

export async function loadKurariExRiderExactStatus(): Promise<KurariExRiderExactStatus> {
  return fetchJson<KurariExRiderExactStatus>(`${RIDER_EXACT_ROOT}/status.generated.json`);
}

export async function loadKurariExRiderExactInitialData(): Promise<KurariExRiderExactInitialData> {
  const [index, status] = await Promise.all([
    loadKurariExRiderExactIndex(),
    loadKurariExRiderExactStatus(),
  ]);
  return { index, status };
}

export async function loadKurariExRiderExactByFile(file: string): Promise<KurariExRiderExact> {
  return fetchJson<KurariExRiderExact>(file);
}

export async function loadKurariExMatchupExactIndex(): Promise<KurariExMatchupExactIndex> {
  if (!matchupExactIndexPromise) {
    matchupExactIndexPromise = fetchJson<KurariExMatchupExactIndex>(`${MATCHUP_EXACT_ROOT}/index.generated.json`)
      .catch((error) => {
        matchupExactIndexPromise = null;
        throw error;
      });
  }
  return matchupExactIndexPromise;
}

export async function loadKurariExMatchupExactStatus(): Promise<KurariExMatchupExactStatus> {
  return fetchJson<KurariExMatchupExactStatus>(`${MATCHUP_EXACT_ROOT}/status.generated.json`);
}

export async function loadKurariExMatchupExactInitialData(): Promise<KurariExMatchupExactInitialData> {
  const [index, status] = await Promise.all([
    loadKurariExMatchupExactIndex(),
    loadKurariExMatchupExactStatus(),
  ]);
  return { index, status };
}

export async function loadKurariExMatchupExactByFile(file: string): Promise<KurariExMatchupExact> {
  return fetchJson<KurariExMatchupExact>(file);
}

export function formatKurariExRiderMetric(metric?: KurariExRiderMetric | null) {
  if (!metric || metric.rate == null || metric.total == null) return "未取得";
  return `${metric.rate.toFixed(1)}%（${metric.count.toLocaleString("ja-JP")} / ${metric.total.toLocaleString("ja-JP")}）`;
}

export function getKurariExRiderQualityLabel(quality?: KurariExRiderQuality | null) {
  const labels: Record<KurariExRiderQuality, string> = {
    complete: "COMPLETE",
    partial: "PARTIAL",
    "low-sample": "LOW SAMPLE",
    "identity-only": "素材蓄積中",
  };
  return quality ? labels[quality] : "UNKNOWN";
}

export type KurariExRaceRiderLike = {
  carNo: string;
  name?: string | null;
  fullName?: string | null;
  registrationNo?: string | number | null;
};

export type KurariExRiderExactMatch = {
  carNo: string;
  riderName: string;
  registrationNo: string;
  matchMethod: "registrationNo" | "name";
  indexItem: KurariExRiderExactIndex["items"][number];
};

export type KurariExRiderPredictionContext = {
  venueKey?: string | null;
  venueName?: string | null;
  timeslot?: string | null;
  raceTitle?: string | null;
  isGirls?: boolean;
  lineupGroups?: string[];
  allowRole?: boolean;
};

export type KurariExRiderPredictionEntry = KurariExRiderExactMatch & {
  exact: KurariExRiderExact;
};

export type KurariExRiderPredictionMaterial = {
  text: string;
  reflectedCount: number;
};

function normalizeKurariExRiderRegistrationNo(value?: string | number | null) {
  const digits = String(value ?? "").replace(/\D/gu, "");
  if (!digits) return "";
  return digits.length <= 6 ? digits.padStart(6, "0") : digits;
}

function normalizeKurariExRiderName(value?: string | null) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\s\u3000・]/gu, "")
    .trim();
}

export function matchKurariExRidersForRace(
  index: KurariExRiderExactIndex,
  riders: KurariExRaceRiderLike[],
): KurariExRiderExactMatch[] {
  const byRegistrationNo = new Map(
    index.items.map((item) => [normalizeKurariExRiderRegistrationNo(item.registrationNo), item]),
  );
  const byName = new Map<string, KurariExRiderExactIndex["items"][number]>();
  const duplicateNames = new Set<string>();
  for (const item of index.items) {
    const nameKey = normalizeKurariExRiderName(item.nameKey || item.name);
    if (!nameKey) continue;
    if (byName.has(nameKey)) {
      duplicateNames.add(nameKey);
      byName.delete(nameKey);
      continue;
    }
    if (!duplicateNames.has(nameKey)) byName.set(nameKey, item);
  }

  const matchedRegistrationNos = new Set<string>();
  return riders
    .map((rider): KurariExRiderExactMatch | null => {
      const registrationNo = normalizeKurariExRiderRegistrationNo(rider.registrationNo);
      const registrationMatch = registrationNo ? byRegistrationNo.get(registrationNo) ?? null : null;
      const nameKey = normalizeKurariExRiderName(rider.fullName || rider.name);
      const nameMatch = !registrationNo && nameKey ? byName.get(nameKey) ?? null : null;
      const indexItem = registrationMatch ?? nameMatch;
      if (!indexItem || matchedRegistrationNos.has(indexItem.registrationNo)) return null;
      matchedRegistrationNos.add(indexItem.registrationNo);
      return {
        carNo: String(rider.carNo),
        riderName: String(rider.fullName || rider.name || indexItem.name).trim(),
        registrationNo: indexItem.registrationNo,
        matchMethod: registrationMatch ? "registrationNo" : "name",
        indexItem,
      };
    })
    .filter((item): item is KurariExRiderExactMatch => Boolean(item))
    .sort((left, right) => Number(left.carNo) - Number(right.carNo));
}

function formatKurariExRiderAggregate(label: string, aggregate?: KurariExRiderAggregate | null, prefix = "") {
  if (!aggregate) return "";
  const parts = [
    aggregate.starts != null ? `${aggregate.starts}走` : "",
    Number.isFinite(aggregate.wins) ? `1着${aggregate.wins}` : "",
    Number.isFinite(aggregate.seconds) ? `2着${aggregate.seconds}` : "",
    Number.isFinite(aggregate.thirds) ? `3着${aggregate.thirds}` : "",
    aggregate.top3Rate?.rate != null ? `3着以内率${aggregate.top3Rate.rate.toFixed(1)}%` : "",
  ].filter(Boolean);
  return parts.length ? `- ${label}: ${prefix}${parts.join(" / ")}` : "";
}

function resolveKurariExRiderRole(
  carNo: string,
  context?: KurariExRiderPredictionContext | null,
): keyof NonNullable<KurariExRiderExact["byRole"]> | null {
  if (!context?.allowRole || !context.lineupGroups?.length) return null;
  for (const rawGroup of context.lineupGroups) {
    const cars = rawGroup.split("-").map((value) => value.replace(/\D/gu, "")).filter(Boolean);
    const position = cars.indexOf(carNo);
    if (position < 0) continue;
    if (cars.length === 1) return "single";
    if (position === 0) return "front";
    if (position === 1) return "bante";
    if (position === 2) return "third";
    return null;
  }
  return null;
}

function findKurariExRiderClassDimension(
  exact: KurariExRiderExact,
  context?: KurariExRiderPredictionContext | null,
) {
  const title = normalizeKurariExRiderName(context?.raceTitle);
  if (!title) return null;
  const candidates = exact.byClass
    .filter((item) => item.raceClass && item.raceClass !== "unknown")
    .filter((item) => title.includes(normalizeKurariExRiderName(item.raceClass)))
    .sort((left, right) => String(right.raceClass).length - String(left.raceClass).length);
  return candidates[0] ?? null;
}

function fitKurariExMaterialLines(lines: string[], maxLength: number) {
  const fitted: string[] = [];
  for (const line of lines) {
    const candidate = [...fitted, line].join("\n");
    if (candidate.length > maxLength) break;
    fitted.push(line);
  }
  return fitted.join("\n").trimEnd();
}

function buildKurariExRiderCard(
  entry: KurariExRiderPredictionEntry,
  context?: KurariExRiderPredictionContext | null,
) {
  const { exact } = entry;
  const lines = [
    `### ${entry.carNo}番 ${entry.riderName || exact.name}`,
    `- 登録番号: ${exact.registrationNo}`,
    `- quality: ${getKurariExRiderQualityLabel(exact.quality)}`,
    ...(exact.quality === "identity-only" ? ["- 状態: 素材蓄積中 / 登録番号・選手情報のみ登録済み", "- 注意: 成績指標は未蓄積のため、買い目根拠には使わない"] : []),
    ...(exact.quality === "low-sample" ? ["- 注意: LOW SAMPLE / 母数少"] : []),
    ...(exact.period.from || exact.period.to ? [`- 対象期間: ${exact.period.from ?? "--"}〜${exact.period.to ?? "--"}`] : []),
    `- 確認出走数: ${exact.coverage.observedRaceCount}`,
    `- 確定出走数: ${exact.coverage.confirmedStartCount}`,
    `- 結果解析数: ${exact.coverage.resultParsedCount}`,
    `- 役割解析可能数: ${exact.coverage.roleEligibleCount}`,
    `- 観測会場数: ${exact.coverage.venueCount}`,
    ...(exact.overall.starts != null ? [`- 集計出走数: ${exact.overall.starts}`] : []),
    `- 1着: ${exact.overall.wins}`,
    `- 2着: ${exact.overall.seconds}`,
    `- 3着: ${exact.overall.thirds}`,
    ...(exact.overall.outside != null ? [`- 着外: ${exact.overall.outside}`] : []),
    ...(exact.overall.winRate.rate != null ? [`- 1着率: ${exact.overall.winRate.rate.toFixed(1)}%`] : []),
    ...(exact.overall.top2Rate.rate != null ? [`- 2着以内率: ${exact.overall.top2Rate.rate.toFixed(1)}%`] : []),
    ...(exact.overall.top3Rate.rate != null ? [`- 3着以内率: ${exact.overall.top3Rate.rate.toFixed(1)}%`] : []),
  ];

  const venue = context?.venueKey
    ? exact.byVenue.find((item) => item.venueKey === context.venueKey)
    : null;
  const venueLine = formatKurariExRiderAggregate("当場成績", venue, venue ? `${venue.venueName || context?.venueName || ""} ` : "");
  if (venueLine) lines.push(venueLine);

  const timeslot = context?.timeslot
    ? exact.byTimeslot.find((item) => item.timeslot === context.timeslot)
    : null;
  const timeslotLabels: Record<string, string> = {
    morning: "モーニング",
    day: "デイ",
    night: "ナイター",
    midnight: "ミッド",
  };
  const timeslotLine = formatKurariExRiderAggregate(
    "今回時間帯の成績",
    timeslot,
    timeslot ? `${timeslotLabels[timeslot.timeslot ?? ""] ?? timeslot.timeslot ?? ""} ` : "",
  );
  if (timeslotLine) lines.push(timeslotLine);

  const raceClass = findKurariExRiderClassDimension(exact, context);
  const classLine = formatKurariExRiderAggregate(
    "今回級班の成績",
    raceClass,
    raceClass ? `${raceClass.raceClass} ` : "",
  );
  if (classLine) lines.push(classLine);

  const role = resolveKurariExRiderRole(entry.carNo, context);
  const roleAggregate = role && exact.byRole ? exact.byRole[role] : null;
  const roleLabels = { front: "ライン先頭", bante: "番手", third: "3番手", single: "単騎" };
  const roleLine = formatKurariExRiderAggregate(
    "今回役割の成績",
    roleAggregate,
    role ? `${roleLabels[role]} ` : "",
  );
  if (roleLine) lines.push(roleLine);

  return fitKurariExMaterialLines(lines, 700);
}

export function buildKurariExRiderPredictionMaterial(
  entries: KurariExRiderPredictionEntry[],
  context?: KurariExRiderPredictionContext | null,
  state: "ready" | "missing" | "error" = "ready",
): KurariExRiderPredictionMaterial {
  const heading = "【登録選手別EXACT】";
  if (state === "error") {
    return {
      text: [heading, "選手別EXACTを取得できませんでした。", "会場別EXACTと既存素材を主として予想してください。"].join("\n"),
      reflectedCount: 0,
    };
  }
  if (state === "missing" || entries.length === 0) {
    return {
      text: [heading, "該当する公開済み選手別EXACTはありません。", "会場別EXACTと既存素材を主として予想してください。"].join("\n"),
      reflectedCount: 0,
    };
  }

  const maxRiders = entries.length >= 8 ? 9 : 7;
  const headerLines = [
    heading,
    "",
    "扱い:",
    "選手別EXACTは自前履歴から算出した確定集計です。",
    "ただし、母数が少ない選手は強い根拠として固定せず、",
    "展開判断の補助として確認してください。",
  ];
  const usableEntries = entries.filter((entry) =>
    entry.exact.quality !== "identity-only" && entry.exact.coverage.confirmedStartCount >= 5
  );
  if (!usableEntries.length) {
    return {
      text: [
        ...headerLines,
        "",
        "【登録選手EXACTからの注意】",
        "- 今回は確認出走5R以上の選手別EXACTがないため、選手別EXACTは買い目根拠から外してください。",
        "- LOW SAMPLE選手・素材蓄積中の選手は詳細カードを省略しています。",
      ].join("\n"),
      reflectedCount: 0,
    };
  }

  const skippedLowSampleCount = entries.length - usableEntries.length;
  const cards: string[] = [];
  const includedEntries: KurariExRiderPredictionEntry[] = [];
  for (const entry of usableEntries.slice(0, maxRiders)) {
    const card = buildKurariExRiderCard(entry, context);
    const candidate = [...headerLines, "", ...cards.flatMap((item) => [item, ""]), card].join("\n");
    if (candidate.length > 3150) break;
    cards.push(card);
    includedEntries.push(entry);
  }

  const notes = uniqueStrings(includedEntries.flatMap((entry) => {
    const venue = context?.venueKey
      ? entry.exact.byVenue.find((item) => item.venueKey === context.venueKey)
      : null;
    return [
      skippedLowSampleCount > 0 ? "確認出走5R未満・素材蓄積中の選手は詳細カードから除外" : "",
      venue?.starts != null && venue.starts < 3 ? "当場データは母数3R未満のため参考扱い" : "",
      entry.exact.coverage.roleEligibleCount < 3 ? "役割解析可能数が少ないため、番手差し評価を固定しない" : "",
    ];
  }));
  const noteLines = notes.length
    ? ["", "【登録選手EXACTからの注意】", ...notes.map((note) => `- ${note}`)]
    : [];
  const text = fitKurariExMaterialLines(
    [...headerLines, ...cards.flatMap((card) => ["", card]), ...noteLines],
    3500,
  );
  return { text, reflectedCount: includedEntries.length };
}
