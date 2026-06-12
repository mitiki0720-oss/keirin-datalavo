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
  KurariExMetric,
  KurariExPredictionContext,
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

function buildKurariExPredictionMaterialText(
  venue: KurariExVenue | null,
  guidance: KurariExGuidance | null,
  exact: KurariExVenueExact | null,
  context: KurariExPredictionContext | null | undefined,
  insightLimit: number,
  guidanceLimit: number,
) {
  if (!venue && !exact) {
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
  if (exact) lines.push("", ...buildExactLines(exact, context));
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
): string {
  const venue = bundle?.venue ?? null;
  const guidance = bundle?.guidance ?? null;
  for (let insightLimit = Math.min(8, venue?.seedInsights.length ?? 0); insightLimit >= 0; insightLimit -= 1) {
    const text = buildKurariExPredictionMaterialText(venue, guidance, exact, context, insightLimit, 8);
    if (text.length <= 4500) return text;
  }
  for (let guidanceLimit = 7; guidanceLimit >= 1; guidanceLimit -= 1) {
    const text = buildKurariExPredictionMaterialText(venue, guidance, exact, context, 0, guidanceLimit);
    if (text.length <= 4500) return text;
  }
  return buildKurariExPredictionMaterialText(venue, guidance, exact, context, 0, 1).slice(0, 4500);
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
  return fetchJson<KurariExRiderExactIndex>(`${RIDER_EXACT_ROOT}/index.generated.json`);
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

export function formatKurariExRiderMetric(metric?: KurariExRiderMetric | null) {
  if (!metric || metric.rate == null || metric.total == null) return "未取得";
  return `${metric.rate.toFixed(1)}%（${metric.count.toLocaleString("ja-JP")} / ${metric.total.toLocaleString("ja-JP")}）`;
}

export function getKurariExRiderQualityLabel(quality?: KurariExRiderQuality | null) {
  const labels: Record<KurariExRiderQuality, string> = {
    complete: "COMPLETE",
    partial: "PARTIAL",
    "low-sample": "LOW SAMPLE",
    "identity-only": "IDENTITY ONLY",
  };
  return quality ? labels[quality] : "UNKNOWN";
}
