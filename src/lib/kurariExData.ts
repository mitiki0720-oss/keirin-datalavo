import type {
  KurariExGlobalKpi,
  KurariExGuidance,
  KurariExIndex,
  KurariExInitialData,
  KurariExStatus,
  KurariExVenue,
  KurariExVenueBundle,
  KurariExVenueListItem,
} from "../types/kurariEx";

const EX_ROOT = "/data/analytics/kurari-ex";

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

function buildKurariExPredictionMaterialText(
  venue: KurariExVenue,
  guidance: KurariExGuidance | null,
  insightLimit: number,
  guidanceLimit: number,
) {
  const lines = [
    "[P. KURARI EX DATA / 独自展開指標]",
    "",
    "現在の育成段階:",
    "SEED INSIGHT",
    "",
    "扱い:",
    "過去の予想・結果・Summaryから抽出した初期知識です。",
    "確定集計ではなく、展開判断と買い目設計の補助として使用してください。",
    "",
    "【会場別SEED】",
    `- 対象会場: ${venue.venueName}`,
  ];
  if (venue.period.from || venue.period.to) {
    lines.push(`- 対象期間: ${venue.period.from ?? "--"}〜${venue.period.to ?? "--"}`);
  }
  if (Number.isFinite(venue.quality.seedSources)) {
    lines.push(`- Summary取込件数: ${venue.quality.seedSources}`);
  }
  if (venue.quality.status) lines.push(`- データ品質: ${venue.quality.status.toUpperCase()}`);
  if (venue.updatedAt) lines.push(`- 最終更新: ${venue.updatedAt}`);

  const insights = [...venue.seedInsights]
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
    ...(venue.predictionGuidance ?? []),
  ]).slice(0, guidanceLimit);
  if (guidanceItems.length) {
    lines.push("", "【PREDICTION GUIDANCE】");
    lines.push(...guidanceItems.map((item) => `- ${item}`));
  }

  lines.push("", "【今回の買い目設計で確認すること】");
  lines.push(...KURARI_EX_PREDICTION_CHECKS.map((item) => `- ${item}`));
  return lines.join("\n");
}

export function buildKurariExPredictionMaterial(bundle: KurariExVenueBundle | null): string {
  if (!bundle) {
    return [
      "[P. KURARI EX DATA / 独自展開指標]",
      "",
      "KURARI EX SEEDは未登録です。",
      "既存のKDreams素材・会場別マスター分析・Summary学習メモを主として予想してください。",
    ].join("\n");
  }

  for (let insightLimit = Math.min(8, bundle.venue.seedInsights.length); insightLimit >= 0; insightLimit -= 1) {
    const text = buildKurariExPredictionMaterialText(bundle.venue, bundle.guidance, insightLimit, 10);
    if (text.length <= 2500) return text;
  }
  for (let guidanceLimit = 9; guidanceLimit >= 1; guidanceLimit -= 1) {
    const text = buildKurariExPredictionMaterialText(bundle.venue, bundle.guidance, 0, guidanceLimit);
    if (text.length <= 2500) return text;
  }
  return buildKurariExPredictionMaterialText(bundle.venue, bundle.guidance, 0, 1);
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
