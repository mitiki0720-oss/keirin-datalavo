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
  const response = await fetch(toPublicPath(path), { cache: "no-cache" });
  if (!response.ok) throw new Error(`KURARI EX fetch failed: ${response.status} ${path}`);
  return response.json() as Promise<T>;
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

export async function loadKurariExInitialData(): Promise<KurariExInitialData> {
  const [index, status, globalKpi] = await Promise.all([
    fetchJson<KurariExIndex>(`${EX_ROOT}/index.generated.json`),
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
