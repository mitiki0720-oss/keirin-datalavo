import type {
  KurariExGlobalKpi,
  KurariExGuidance,
  KurariExHistoryDaily,
  KurariExHistoryIndex,
  KurariExHistoryMode,
  KurariExHistoryRace,
  KurariExIdentityMismatchDetail,
  KurariExIdentityMismatchReason,
  KurariExIdentitySourceConnectionSummary,
  KurariExIdentitySourceStarter,
  KurariExRegistrationNoStatus,
  KurariExSameNameCandidateWarning,
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
  KurariExMatchupEntry,
  KurariExMetric,
  KurariExPredictionContext,
  KurariExRiderAggregate,
  KurariExRiderExact,
  KurariExRiderExactIndex,
  KurariExRiderExactInitialData,
  KurariExRiderExactStatus,
  KurariExRiderMetric,
  KurariExRiderQuality,
  KurariExStarter,
  KurariExStarterRace,
  KurariExStartersAvailabilitySummary,
  KurariExStartersSource,
  KurariExStartersSourceIndex,
  KurariExStatus,
  KurariExVenue,
  KurariExVenueBundle,
  KurariExVenueExact,
  KurariExVenueListItem,
} from "../types/kurariEx";
import { findKurariForeignRiderAlias } from "./kurariForeignRiderAliases";

const EX_ROOT = "/data/analytics/kurari-ex";
const EXACT_ROOT = `${EX_ROOT}/exact`;
const RIDER_EXACT_ROOT = `${EXACT_ROOT}/riders`;
const MATCHUP_EXACT_ROOT = `${EXACT_ROOT}/matchups`;
const HISTORY_INDEX_PATH = `${EX_ROOT}/history/index.generated.json`;
const STARTERS_SOURCE_INDEX_PATH = `${EX_ROOT}/source/starters/index.generated.json`;
const TODAY_RACES_PATH = "/data/races/today.generated.json";
const OFFICIAL_ENTRIES_PATH = "/data/races/keirin-jp-entries.generated.json";
const STARTERS_SOURCE_INDEX_SCHEMA_VERSION = "kurari-ex-starters-source-index/v1";
const STARTERS_SOURCE_SCHEMA_VERSION = "kurari-ex-starters-from-today-registration/v1";

export const KURARI_EX_ACCUMULATION_RULES = [
  "fake補完は禁止。存在しない成績・対戦・登録番号は作らない。",
  "登録番号一致を最優先。名前一致・補助一致は参考扱い。",
  "未解決・曖昧候補は無理に紐付けず、監査対象として残す。",
  "LOW SAMPLEは参考扱い。買い目の主根拠にはしない。",
  "素材蓄積中は登録・識別のみ。成績根拠として固定しない。",
  "MATCHUP EXは既存対戦ペアのみ使用し、存在しない対戦は生成しない。",
  "ライン役割は安全に並びを解釈できる場合だけ使う。",
  "public/data/reviews/YYYY-MM-DD は蓄積データなので削除しない。",
] as const;

export const KURARI_EX_ACCUMULATION_RULES_UI_SUMMARY =
  "fake補完禁止 / 登録番号優先 / LOW SAMPLE参考扱い";

export const KURARI_EX_TACTIC_EVENT_RULES = [
  {
    key: "kamashi",
    label: "かまし",
    status: "rule-only",
    detection: "後方または中団から一気に踏み上げ、先行ラインより前へ出て主導権を取った展開メモ・振り返り・明示タグがある場合だけ認定。",
    success: "主導権を取り切り、本人またはラインが展開上の優位を維持した記録がある場合だけ成功候補。",
    prohibited: "逃げ1着・捲り1着・先行役という情報だけでは、かまし成功にしない。",
  },
  {
    key: "tsuppari",
    label: "つっぱり",
    status: "rule-only",
    detection: "前受けまたは先頭ラインが別線の上昇を出させず、主導権を維持した展開メモ・振り返り・明示タグがある場合だけ認定。",
    success: "別線を出さずに主導権を守り、ラインが崩れず展開上の優位を残した記録がある場合だけ成功候補。",
    prohibited: "逃げた結果や先行1着だけでは、つっぱり成功にしない。",
  },
  {
    key: "tobitsuki",
    label: "飛びつき",
    status: "rule-only",
    detection: "自力または単騎選手が別線の番手・3番手へ切り替えて追走した展開メモ・振り返り・明示タグがある場合だけ認定。",
    success: "切り替えた位置を確保し、位置確保後に着順・連対・3着絡みへつなげた記録がある場合だけ成功候補。",
    prohibited: "単騎3着だけ、または位置取り不明の状態では飛びつき成功にしない。",
  },
  {
    key: "seri",
    label: "競り",
    status: "rule-only",
    detection: "番手・3番手など同一位置を複数選手が取り合った展開メモ・振り返り・明示タグがある場合だけ認定。",
    success: "競った位置を最終的に確保し、相手を捌くか明確な位置優位を取った記録がある場合だけ勝ち候補。",
    prohibited: "番手の着外・1着だけでは競りの負け・勝ちにせず、競り発生記録がなければ未認定。",
  },
  {
    key: "chigiri",
    label: "ちぎり",
    status: "rule-only",
    detection: "ライン先頭や自力選手が踏み上げ、後続を明確に離した展開メモ・振り返り・明示タグがある場合だけ認定。",
    success: "後続を明確に離し、本人または主導権ラインが展開上の優位を作った記録がある場合だけ成功候補。",
    prohibited: "着差や先頭1着だけでは、ちぎり成功にしない。",
  },
  {
    key: "chigirare",
    label: "ちぎられ",
    status: "rule-only",
    detection: "番手または3番手以降が同ライン先頭へ追走できず離れた展開メモ・振り返り・明示タグがある場合だけ認定。",
    success: "ラインが分断され、対象選手が追走に失敗した明示記録がある場合だけ発生候補。",
    prohibited: "着外や3番手着外だけでは推測せず、ライン崩れの明示記録がなければ未認定。",
  },
] as const;

export const KURARI_EX_TACTIC_EVENT_RULES_UI_SUMMARY =
  "成功率は未生成 / 順位・脚質・役割からのfake補完なし";

export type KurariExDataInventoryStatus =
  | "ready"
  | "conditional"
  | "classifiable"
  | "needs-data";

export const KURARI_EX_DATA_INVENTORY = [
  { label: "1着", status: "ready", reason: "選手別EXACTのoverall.winsで集計済み。" },
  { label: "2着", status: "ready", reason: "選手別EXACTのoverall.secondsで集計済み。" },
  { label: "3着", status: "ready", reason: "選手別EXACTのoverall.thirdsで集計済み。" },
  { label: "着外", status: "ready", reason: "選手別EXACTのoverall.outsideで集計済み。" },
  { label: "勝率", status: "ready", reason: "選手別EXACTのoverall.winRateで集計済み。" },
  { label: "2連対率", status: "ready", reason: "選手別EXACTのoverall.top2Rateで集計済み。" },
  { label: "3連対率", status: "ready", reason: "選手別EXACTのoverall.top3Rateで集計済み。" },
  { label: "ラインの先頭の成績", status: "conditional", reason: "byRole.frontに実績あり。安全に並びを解釈できたレースだけを使い、母数不足時はLOW SAMPLE扱い。" },
  { label: "番手の成績", status: "conditional", reason: "byRole.banteに実績あり。安全に並びを解釈できたレースだけを使い、母数不足時はLOW SAMPLE扱い。" },
  { label: "3番手以降の成績", status: "conditional", reason: "byRole.thirdに実績あり。安全に並びを解釈できたレースだけを使い、母数不足時はLOW SAMPLE扱い。" },
  { label: "単騎の成績", status: "conditional", reason: "byRole.singleに実績あり。安全に並びを解釈できたレースだけを使い、母数不足時はLOW SAMPLE扱い。" },
  { label: "競りの成績", status: "needs-data", reason: "判定ルールは固定済みだが、競り発生と当事者を確定する展開イベントの新規蓄積が必要。" },
  { label: "競りの勝率", status: "needs-data", reason: "判定ルールは固定済みだが、競り発生・当事者・勝敗を確定する展開イベントの新規蓄積が必要。" },
  { label: "飛びつき成功率", status: "needs-data", reason: "判定ルールは固定済みだが、飛びつき発生と位置確保を確定する展開イベントの新規蓄積が必要。" },
  { label: "ちぎり率", status: "needs-data", reason: "判定ルールは固定済みだが、後続を離した事実を確定する展開イベントの新規蓄積が必要。" },
  { label: "ちぎられ率", status: "needs-data", reason: "判定ルールは固定済みだが、追走失敗を確定する展開イベントの新規蓄積が必要。" },
  { label: "かまし成功率", status: "needs-data", reason: "判定ルールは固定済みだが、かまし発生と主導権確保を確定する展開イベントの新規蓄積が必要。" },
  { label: "つっぱり成功率", status: "needs-data", reason: "判定ルールは固定済みだが、別線を出さず主導権を維持した展開イベントの新規蓄積が必要。" },
  { label: "予選の成績", status: "conditional", reason: "byRaceStage.qualifyingに実績あり。分類不能レースと選手別の母数不足に注意。" },
  { label: "準決勝の成績", status: "classifiable", reason: "レース名は保存済みだが、準決勝を決勝から厳密に分離する分類ルールの整備が必要。" },
  { label: "決勝の成績", status: "classifiable", reason: "レース名は保存済みだが、準決勝を混入させない厳密な分類ルールの整備が必要。" },
  { label: "敗者戦の成績", status: "conditional", reason: "byRaceStage.consolationに一般・敗者戦として実績あり。選手別の母数不足に注意。" },
  { label: "シード戦の成績", status: "conditional", reason: "byRaceStage.seed-specialに特選・シードとして実績あり。選手別の母数不足に注意。" },
  { label: "333mバンクの成績", status: "conditional", reason: "byBankLengthに実績あり。会場周長が確定できるレースだけを使用。" },
  { label: "400mバンクの成績", status: "conditional", reason: "byBankLengthに実績あり。会場周長が確定できるレースだけを使用。" },
  { label: "500mバンクの成績", status: "conditional", reason: "byBankLengthに実績あり。会場周長が確定できるレースだけを使用。" },
  { label: "晴れの成績", status: "conditional", reason: "byWeather.sunnyに実績あり。保存済み天候だけを使用。" },
  { label: "曇りの成績", status: "conditional", reason: "byWeather.cloudyに実績あり。保存済み天候だけを使用。" },
  { label: "雨の成績", status: "conditional", reason: "byWeather.rainに実績あり。保存済み天候だけを使用。" },
  { label: "雪の成績", status: "needs-data", reason: "分類ルールはあるが、現在のEXACT集計に雪の実績がなく新規蓄積が必要。" },
  { label: "モーニングの成績", status: "conditional", reason: "byTimeslot.morningに実績あり。選手別の母数不足に注意。" },
  { label: "デイの成績", status: "conditional", reason: "byTimeslot.dayに実績あり。選手別の母数不足に注意。" },
  { label: "ナイターの成績", status: "conditional", reason: "byTimeslot.nightに実績あり。選手別の母数不足に注意。" },
  { label: "ミッドナイトの成績", status: "conditional", reason: "byTimeslot.midnightに実績あり。選手別の母数不足に注意。" },
  { label: "G3", status: "classifiable", reason: "履歴にgradeが保存済み。推定値や不明値を除外する厳密な集計軸の追加が必要。" },
  { label: "F1", status: "classifiable", reason: "履歴にgradeが保存済み。推定値や不明値を除外する厳密な集計軸の追加が必要。" },
  { label: "F2", status: "classifiable", reason: "履歴にgradeが保存済み。推定値や不明値を除外する厳密な集計軸の追加が必要。" },
  { label: "グレード×レース種目", status: "classifiable", reason: "gradeとレース名は保存済み。両方が確定したレースだけを使う分類ルールが必要。" },
  { label: "同走相手との先着", status: "conditional", reason: "MATCHUP EXに安全比較可能な既存ペアの先着数・先着率あり。ペアごとの母数に注意。" },
  { label: "同県選手同乗時", status: "classifiable", reason: "一部選手に府県と登録番号がある。登録番号一致かつ府県取得済みのレースだけを使う分類ルールが必要。" },
  { label: "同ライン", status: "conditional", reason: "MATCHUP EXのsameLineに既存ペアの比較実績あり。ライン判定可能なレースだけを使用。" },
  { label: "別線比較", status: "conditional", reason: "MATCHUP EXのotherLineに既存ペアの比較実績あり。ライン判定可能なレースだけを使用。" },
] as const satisfies ReadonlyArray<{
  label: string;
  status: KurariExDataInventoryStatus;
  reason: string;
}>;

export const KURARI_EX_DATA_INVENTORY_SUMMARY = {
  ready: "基本着順・勝率 / 選手別EXACT / 会場EX",
  conditional: "MATCHUP EX / ライン役割別 / 周長別 / 天候別 / 時間帯別",
  classifiable: "レース種目別 / グレード別 / グレード×レース種目 / 同県同乗時",
  needsData: "かまし / つっぱり / 飛びつき / 競り / ちぎり・ちぎられ / 雪",
} as const;

export const KURARI_EX_DATA_INVENTORY_UI_SUMMARY =
  "今すぐ使える / 条件付き / 要蓄積 を分類";

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

export function getKurariExAssetPath(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/u, "");
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalized}`;
}

function toPublicPath(relativePath: string) {
  return getKurariExAssetPath(relativePath);
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(toPublicPath(path), { cache: "no-store" });
  if (!response.ok) throw new Error(`KURARI EX fetch failed: ${response.status} ${path}`);
  return response.json() as Promise<T>;
}

function normalizePublicDataPath(path: string) {
  const normalized = path.replaceAll("\\", "/");
  if (normalized.startsWith("public/")) return `/${normalized.slice("public/".length)}`;
  if (normalized.startsWith("/public/")) return `/${normalized.slice("/public/".length)}`;
  if (normalized.startsWith("data/")) return `/${normalized}`;
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function assertKurariExStartersSourceIndex(index: KurariExStartersSourceIndex) {
  if (index.schemaVersion !== STARTERS_SOURCE_INDEX_SCHEMA_VERSION) {
    throw new Error(`KURARI EX starters source index schema mismatch: ${index.schemaVersion}`);
  }
  if (index.quality.checkStatus !== "PASS") {
    throw new Error("KURARI EX starters source index checkStatus is not PASS");
  }
  if (!index.latest?.path) {
    throw new Error("KURARI EX starters source latest path is missing");
  }
  if (index.latest.checkStatus !== "PASS") {
    throw new Error("KURARI EX starters source latest checkStatus is not PASS");
  }
}

function assertKurariExStartersSource(source: KurariExStartersSource) {
  if (source.schemaVersion !== STARTERS_SOURCE_SCHEMA_VERSION) {
    throw new Error(`KURARI EX starters source schema mismatch: ${source.schemaVersion}`);
  }
  if (source.quality.checkStatus !== "PASS") {
    throw new Error("KURARI EX starters source checkStatus is not PASS");
  }
  if (source.summary.starterCount <= 0) {
    throw new Error("KURARI EX starters source has no starters");
  }
  if (source.summary.registrationNoCompleteCount !== source.summary.starterCount) {
    throw new Error("KURARI EX starters source registrationNo coverage is incomplete");
  }
  if (source.summary.blockedStarterRaceCount !== 0) {
    throw new Error("KURARI EX starters source has blocked races");
  }
  if (source.quality.fakeCompletionPerformed) {
    throw new Error("KURARI EX starters source performed fake completion");
  }
  if (source.quality.fuzzyMatchingPerformed) {
    throw new Error("KURARI EX starters source performed fuzzy matching");
  }
  if (source.quality.resultLineupPredictionUsedAsStarterSource) {
    throw new Error("KURARI EX starters source used result/lineup/prediction source");
  }
}

export async function loadKurariExIndex(): Promise<KurariExIndex> {
  return fetchJson<KurariExIndex>(`${EX_ROOT}/index.generated.json`);
}

export async function loadKurariExHistoryIndex(): Promise<KurariExHistoryIndex> {
  return fetchJson<KurariExHistoryIndex>(HISTORY_INDEX_PATH);
}

export async function loadKurariExHistoryDailyByPath(
  publicPath: string,
): Promise<KurariExHistoryDaily> {
  return fetchJson<KurariExHistoryDaily>(normalizePublicDataPath(publicPath));
}

export async function loadKurariExHistoryDailyByDate(
  date: string,
  index?: KurariExHistoryIndex,
): Promise<KurariExHistoryDaily | null> {
  const historyIndex = index ?? await loadKurariExHistoryIndex();
  const entry = historyIndex.items.find((item) => item.date === date);
  return entry ? loadKurariExHistoryDailyByPath(entry.file) : null;
}

export function summarizeKurariExHistoryIndex(index: KurariExHistoryIndex) {
  const latest = [...index.items].sort((left, right) => right.date.localeCompare(left.date))[0] ?? null;
  return {
    registeredDays: index.dayCount,
    raceCount: index.raceCount,
    settledRaceCount: index.settledRaceCount,
    cancelledRaceCount: index.cancelledRaceCount,
    totalBytes: index.totalBytes,
    periodFrom: index.period.from,
    periodTo: index.period.to,
    latestDate: latest?.date ?? null,
    latestPath: latest?.file ?? null,
  };
}

export function classifyKurariExHistoryDailyMode(
  daily: KurariExHistoryDaily,
): KurariExHistoryMode {
  if (!daily.items.length) return "UNKNOWN";
  const racesWithStarters = daily.items.filter((race) => race.starters.length > 0).length;
  if (racesWithStarters === daily.items.length) return "STARTERS_PARSED";
  if (racesWithStarters === 0) return "NO_STARTERS";
  return "MIXED";
}

export function summarizeRegistrationNoCoverage(daily: KurariExHistoryDaily) {
  let hasRegistrationNoCount = 0;
  let missingRegistrationNoCount = 0;
  let noStartersRaceCount = 0;
  for (const race of daily.items) {
    if (!race.starters.length) noStartersRaceCount += 1;
    for (const starter of race.starters) {
      if (starter.registrationNo) hasRegistrationNoCount += 1;
      else missingRegistrationNoCount += 1;
    }
  }
  return {
    hasRegistrationNoCount,
    missingRegistrationNoCount,
    noStartersRaceCount,
    starterTotal: hasRegistrationNoCount + missingRegistrationNoCount,
  };
}

export function getKurariExRaceRegistrationNoStatus(
  race: KurariExHistoryRace,
): KurariExRegistrationNoStatus {
  if (!race.starters.length) return "NO_STARTERS";
  return race.starters.every((starter) => Boolean(starter.registrationNo))
    ? "HAS_REGISTRATION_NO"
    : "MISSING_REGISTRATION_NO";
}

const KURARI_EX_SAME_NAME_CANDIDATES = [
  {
    name: "石井貴子",
    registrationNos: ["014962", "015023"],
    unresolvedRecordCount: 0,
  },
  {
    name: "山中貴雄",
    registrationNos: ["013264", "014108"],
    unresolvedRecordCount: 0,
  },
  {
    name: "山口貴弘",
    registrationNos: ["013615", "014268"],
    unresolvedRecordCount: 9,
  },
] as const;

export function getSameNameCandidateWarnings(
  daily: KurariExHistoryDaily,
): KurariExSameNameCandidateWarning[] {
  const selectedNames = daily.items.flatMap((race) => race.starters.map((starter) => starter.name));
  return KURARI_EX_SAME_NAME_CANDIDATES.map((candidate) => ({
    name: candidate.name,
    registrationNos: candidate.registrationNos,
    selectedDailyOccurrenceCount: selectedNames.filter((name) => name === candidate.name).length,
    unresolvedRecordCount: candidate.unresolvedRecordCount,
    status: candidate.unresolvedRecordCount
      ? "MANUAL_REVIEW_REQUIRED" as const
      : "SEPARATED_BY_REGISTRATION_NO" as const,
    message: candidate.unresolvedRecordCount
      ? `${candidate.unresolvedRecordCount} records remain unassigned and require manual review.`
      : "Distinct players remain separated by registrationNo.",
  }));
}

export function summarizeKurariExHistoryDaily(daily: KurariExHistoryDaily) {
  const registrationNo = summarizeRegistrationNoCoverage(daily);
  const venues = new Map<string, { venueKey: string; venueName: string; raceCount: number }>();
  let resultLinkedCount = 0;
  let predictionLinkedCount = 0;
  let reviewLinkedCount = 0;
  let warningCount = 0;
  for (const race of daily.items) {
    const venue = venues.get(race.venueKey);
    if (venue) venue.raceCount += 1;
    else venues.set(race.venueKey, {
      venueKey: race.venueKey,
      venueName: race.venueName,
      raceCount: 1,
    });
    if (race.quality?.resultParsed || (race.result && race.result.status !== "missing")) resultLinkedCount += 1;
    if (race.quality?.predictionParsed || race.predictionEnrichment?.status === "matched") predictionLinkedCount += 1;
    if (race.reviewEnrichment?.status === "matched") reviewLinkedCount += 1;
    warningCount += race.quality?.warnings?.length ?? 0;
  }
  return {
    date: daily.date,
    raceCount: daily.raceCount,
    venueCount: venues.size,
    mode: classifyKurariExHistoryDailyMode(daily),
    ...registrationNo,
    resultLinkedCount,
    predictionLinkedCount,
    reviewLinkedCount,
    warningCount,
    venues: [...venues.values()].sort((left, right) => left.venueName.localeCompare(right.venueName, "ja")),
  };
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
  matchupMaterial: string,
  confidenceMaterial: string,
  conditionMaterial: string,
  insightLimit: number,
  guidanceLimit: number,
) {
  if (!venue && !exact && !riderMaterial && !matchupMaterial && !confidenceMaterial && !conditionMaterial) {
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
  if (confidenceMaterial) lines.push("", confidenceMaterial);
  if (exact) {
    lines.push("", ...buildExactLines(exact, context));
    const practicalMemo = buildKurariExPracticalMemo(exact, context);
    if (practicalMemo.length) lines.push("", ...practicalMemo);
  }
  if (riderMaterial) lines.push("", riderMaterial);
  if (matchupMaterial) lines.push("", matchupMaterial);
  if (conditionMaterial) lines.push("", conditionMaterial);
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
  lines.push("", "【KURARI EX 戦法イベント判定ルール】");
  lines.push(
    "- 状態: ルール固定段階。発生回数・成功率・失敗率は未生成。",
    "- 扱い: 順位・脚質・今回役割だけで戦法イベントを推測しない。展開メモ・振り返り・明示タグがある場合だけ認定する。",
    "",
    "■ 判定対象",
    ...KURARI_EX_TACTIC_EVENT_RULES.map(
      (rule) => `- ${rule.label}: 認定=${rule.detection} / ${rule.success} / 禁止=${rule.prohibited}`,
    ),
    "",
    "- 禁止: 保存されていないイベントを過去レースへ後付けせず、着順だけで数値を作らない。fake補完しない。",
  );
  lines.push("", "【KURARI EX データ棚卸し】");
  lines.push(
    `- 今すぐ使える: ${KURARI_EX_DATA_INVENTORY_SUMMARY.ready}`,
    `- 条件付きで使える: ${KURARI_EX_DATA_INVENTORY_SUMMARY.conditional}`,
    `- 分類ルール整備で作れる: ${KURARI_EX_DATA_INVENTORY_SUMMARY.classifiable}`,
    `- 新規蓄積が必要: ${KURARI_EX_DATA_INVENTORY_SUMMARY.needsData}`,
    "- 扱い: 未蓄積・分類不能の項目は作らず、LOW SAMPLEと素材蓄積中を強い根拠にしない。fake補完は禁止。",
  );
  lines.push("", "【KURARI EX 蓄積ルール】");
  lines.push(...KURARI_EX_ACCUMULATION_RULES.map((rule) => `- ${rule}`));
  return lines.join("\n");
}

export function buildKurariExPredictionMaterial(
  bundle: KurariExVenueBundle | null,
  exact: KurariExVenueExact | null = null,
  context?: KurariExPredictionContext | null,
  riderMaterial = "",
  matchupMaterial = "",
  confidenceMaterial = "",
  conditionMaterial = "",
): string {
  const venue = bundle?.venue ?? null;
  const guidance = bundle?.guidance ?? null;
  const maxLength = conditionMaterial
    ? 15000
    : riderMaterial || matchupMaterial || confidenceMaterial
      ? 9500
      : 4500;
  for (let insightLimit = Math.min(8, venue?.seedInsights.length ?? 0); insightLimit >= 0; insightLimit -= 1) {
    const text = buildKurariExPredictionMaterialText(venue, guidance, exact, context, riderMaterial, matchupMaterial, confidenceMaterial, conditionMaterial, insightLimit, 8);
    if (text.length <= maxLength) return text;
  }
  for (let guidanceLimit = 7; guidanceLimit >= 1; guidanceLimit -= 1) {
    const text = buildKurariExPredictionMaterialText(venue, guidance, exact, context, riderMaterial, matchupMaterial, confidenceMaterial, conditionMaterial, 0, guidanceLimit);
    if (text.length <= maxLength) return text;
  }
  const fallbackText = buildKurariExPredictionMaterialText(
    venue,
    guidance,
    exact,
    context,
    riderMaterial,
    matchupMaterial,
    confidenceMaterial,
    conditionMaterial,
    0,
    1,
  );
  if (fallbackText.length <= maxLength) return fallbackText;

  const footerMarker = "\n\n【KURARI EX 戦法イベント判定ルール】";
  const footerStart = fallbackText.lastIndexOf(footerMarker);
  if (footerStart < 0) return fallbackText.slice(0, maxLength);

  const footerSection = fallbackText.slice(footerStart);
  const bodyLimit = Math.max(0, maxLength - footerSection.length);
  return `${fallbackText.slice(0, bodyLimit).trimEnd()}${footerSection}`;
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

export async function loadKurariExStartersSourceIndex(): Promise<KurariExStartersSourceIndex> {
  const index = await fetchJson<KurariExStartersSourceIndex>(STARTERS_SOURCE_INDEX_PATH);
  assertKurariExStartersSourceIndex(index);
  return index;
}

export function summarizeKurariExStartersAvailability(
  index: KurariExStartersSourceIndex,
  source: KurariExStartersSource,
): KurariExStartersAvailabilitySummary {
  const starterCount = source.summary.starterCount;
  const registrationNoCompleteCount = source.summary.registrationNoCompleteCount;
  return {
    status: "PASS",
    latestDate: source.date,
    raceCount: source.summary.raceCount,
    starterCount,
    registrationNoCompleteCount,
    registrationNoCoverageLabel: `${registrationNoCompleteCount.toLocaleString("ja-JP")} / ${starterCount.toLocaleString("ja-JP")}`,
    sourcePath: index.latest?.path ?? null,
    identityKey: "registrationNo",
    currentTodayCompatibilityStatus: "SAVED_SOURCE_SEPARATED_FROM_CURRENT_TODAY",
    warning: "保存済み starters source を読み取り専用で表示しています。current today.generated.json との差分や古さはこのカードでは非ブロッキングです。",
    previewRaces: source.races.slice(0, 3).map((race) => ({
      date: race.date,
      venueName: race.venueName,
      raceNumber: race.raceNumber,
      starterCount: race.starterCount,
      starters: race.starters.slice(0, 2).map((starter) => ({
        carNo: starter.carNo,
        name: starter.name,
        registrationNo: starter.registrationNo,
      })),
    })),
  };
}

export async function loadLatestKurariExStartersSource(): Promise<{
  index: KurariExStartersSourceIndex;
  source: KurariExStartersSource;
  summary: KurariExStartersAvailabilitySummary;
}> {
  const index = await loadKurariExStartersSourceIndex();
  const sourcePath = normalizePublicDataPath(index.latest?.path ?? "");
  const source = await fetchJson<KurariExStartersSource>(sourcePath);
  assertKurariExStartersSource(source);
  return {
    index,
    source,
    summary: summarizeKurariExStartersAvailability(index, source),
  };
}

type KurariExTodayRiderSource = {
  carNo?: string | number;
  name?: string | null;
  fullName?: string | null;
  prefecture?: string | null;
  age?: string | number | null;
  term?: string | number | null;
  grade?: string | null;
};

type KurariExTodaySource = {
  date?: string;
  generatedAt?: string;
  venues?: {
    venueCode?: string | number;
    venue?: string;
    raceIds?: Array<string | null>;
    races?: {
      raceNo?: string | number;
      raceId?: string | null;
      riders?: KurariExTodayRiderSource[];
    }[];
  }[];
};

type KurariExOfficialEntrySource = {
  carNo?: string | number;
  registrationNo?: string | number | null;
  name?: string | null;
  prefecture?: string | null;
  age?: number | null;
  graduationTerm?: string | number | null;
  raceClass?: string | null;
  previousClass?: string | null;
  source?: string | null;
};

type KurariExOfficialEntriesSource = {
  date?: string;
  generatedAt?: string;
  venues?: {
    date?: string;
    venueCode?: string | number;
    venueName?: string;
    races?: {
      raceNumber?: string | number;
      entries?: KurariExOfficialEntrySource[];
    }[];
  }[];
};

function normalizeKurariExVenueCode(value?: string | number | null) {
  const digits = String(value ?? "").replace(/\D/gu, "");
  return digits ? digits.padStart(2, "0") : "";
}

function normalizeKurariExIdentityVenueName(value?: string | null) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/競輪場|競輪/gu, "")
    .replace(/[\s\u3000]/gu, "")
    .trim();
}

function normalizeKurariExSourceNumber(value?: string | number | null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function buildOfficialEntryJoinKey(
  date: string,
  venueCode: string,
  raceNumber: number,
  carNo: string,
) {
  return [date, venueCode, raceNumber, carNo].join("|");
}

function buildStarterSourceJoinKey(
  date: string,
  venueName: string,
  raceNumber: number,
  carNo: string,
) {
  return [date, normalizeKurariExIdentityVenueName(venueName), raceNumber, carNo].join("|");
}

function addUniqueSourceEntry<T>(map: Map<string, T | null>, key: string, entry: T) {
  if (!key || map.has(key)) {
    map.set(key, null);
    return;
  }
  map.set(key, entry);
}

function officialEntryToIdentityStarter(
  payload: KurariExOfficialEntriesSource,
  venue: NonNullable<KurariExOfficialEntriesSource["venues"]>[number],
  raceNumber: number,
  entry: KurariExOfficialEntrySource,
  matchMethod: KurariExIdentitySourceStarter["matchMethod"],
): KurariExIdentitySourceStarter {
  const registrationNo = normalizeKurariExRiderRegistrationNo(entry.registrationNo);
  return {
    date: String(venue.date || payload.date || ""),
    venueCode: normalizeKurariExVenueCode(venue.venueCode),
    venueName: String(venue.venueName ?? "").trim(),
    raceNumber,
    carNo: String(entry.carNo ?? "").trim(),
    name: String(entry.name ?? "").trim(),
    registrationNo: /^\d{6}$/u.test(registrationNo) ? registrationNo : null,
    prefecture: String(entry.prefecture ?? "").trim() || null,
    age: normalizeKurariExSourceNumber(entry.age),
    term: String(entry.graduationTerm ?? "").trim() || null,
    className: String(entry.raceClass || entry.previousClass || "").trim() || null,
    sourceName: String(entry.source || "KEIRIN.JP:JSJ006"),
    sourceFetchedAt: payload.generatedAt ?? null,
    sourceType: "official",
    registrationNoSource: String(entry.source || "KEIRIN.JP:JSJ006"),
    registrationNoTrustStatus: /^\d{6}$/u.test(registrationNo)
      ? "direct-official-entry"
      : "unavailable",
    matchMethod,
  };
}

function starterSourceToIdentityStarter(
  source: KurariExStartersSource,
  race: KurariExStarterRace,
  starter: KurariExStarter,
  matchMethod: KurariExIdentitySourceStarter["matchMethod"],
): KurariExIdentitySourceStarter {
  const registrationNo = normalizeKurariExRiderRegistrationNo(starter.registrationNo);
  return {
    date: race.date,
    venueCode: "",
    venueName: race.venueName,
    raceNumber: race.raceNumber,
    carNo: String(starter.carNo),
    name: starter.name,
    registrationNo: /^\d{6}$/u.test(registrationNo) ? registrationNo : null,
    prefecture: starter.prefecture?.trim() || null,
    age: normalizeKurariExSourceNumber(starter.age),
    term: starter.term?.trim() || null,
    className: starter.className?.trim() || null,
    sourceName: starter.source || source.source,
    sourceFetchedAt: source.sourceGeneratedAt ?? null,
    sourceType: "source-backed",
    registrationNoSource: starter.registrationNoSource || source.source,
    registrationNoTrustStatus: /^\d{6}$/u.test(registrationNo)
      ? "validated-starter-source"
      : "unavailable",
    matchMethod,
  };
}

function todayRiderToIdentityStarter(
  payload: KurariExTodaySource,
  venue: NonNullable<KurariExTodaySource["venues"]>[number],
  raceNumber: number,
  rider: KurariExTodayRiderSource,
): KurariExIdentitySourceStarter {
  return {
    date: String(payload.date ?? ""),
    venueCode: normalizeKurariExVenueCode(venue.venueCode),
    venueName: String(venue.venue ?? "").trim(),
    raceNumber,
    carNo: String(rider.carNo ?? "").trim(),
    name: String(rider.fullName || rider.name || "").trim(),
    registrationNo: null,
    prefecture: String(rider.prefecture ?? "").trim() || null,
    age: normalizeKurariExSourceNumber(rider.age),
    term: String(rider.term ?? "").trim() || null,
    className: String(rider.grade ?? "").trim() || null,
    sourceName: "today.generated",
    sourceFetchedAt: payload.generatedAt ?? null,
    sourceType: "today-generated-only",
    registrationNoSource: "none",
    registrationNoTrustStatus: "unavailable",
    matchMethod: "today-roster-only",
  };
}

function normalizeKurariExNameWithoutWhitespace(value?: string | null) {
  return String(value ?? "").replace(/[\s\u3000]/gu, "");
}

function normalizeKurariExNameSymbols(value?: string | null) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\s\u3000・･·.\-‐‑‒–—―]/gu, "");
}

function normalizeKurariExOldNewKanji(value?: string | null) {
  return normalizeKurariExRiderName(value)
    .replace(/[髙﨑濵邊邉澤國廣齋齊嶋]/gu, (character) => ({
      髙: "高",
      﨑: "崎",
      濵: "浜",
      邊: "辺",
      邉: "辺",
      澤: "沢",
      國: "国",
      廣: "広",
      齋: "斎",
      齊: "斉",
      嶋: "島",
    })[character] ?? character);
}

function classifyKurariExIdentityNameMismatch(
  todayName: string,
  officialName: string,
): KurariExIdentityMismatchReason {
  if (
    normalizeKurariExNameWithoutWhitespace(todayName)
    === normalizeKurariExNameWithoutWhitespace(officialName)
  ) {
    return "whitespace-only-difference";
  }
  if (
    normalizeKurariExRiderName(todayName)
    === normalizeKurariExRiderName(officialName)
  ) {
    return "fullwidth-halfwidth-difference";
  }
  if (
    normalizeKurariExOldNewKanji(todayName)
    === normalizeKurariExOldNewKanji(officialName)
  ) {
    return "old-new-kanji-difference";
  }
  if (
    normalizeKurariExNameSymbols(todayName)
    === normalizeKurariExNameSymbols(officialName)
  ) {
    return "middle-dot-or-symbol-difference";
  }
  return "playerName-exact-mismatch";
}

function describeKurariExIdentityNameMismatch(todayName: string, officialName: string) {
  const todayKey = normalizeKurariExRiderName(todayName);
  const officialKey = normalizeKurariExRiderName(officialName);
  const todayWithoutForeignLabel = todayKey.replace(/外国$/u, "");
  if (todayWithoutForeignLabel === officialKey) {
    return "today.generated側に「外国」ラベルがあり、official candidateにはありません。";
  }
  if (
    todayKey.endsWith("外国")
    && todayWithoutForeignLabel.startsWith(officialKey)
    && todayWithoutForeignLabel !== officialKey
  ) {
    return "today.generated側に「外国」ラベルがあり、official candidate名はそれを除いた名前より短い表記です。";
  }
  if (todayKey.startsWith(officialKey) || officialKey.startsWith(todayKey)) {
    return "一方の候補名が他方より短い表記です。";
  }
  return "安全キーの選手名完全一致条件を満たしません。";
}

export function summarizeKurariExIdentitySourceConnection(
  today: KurariExTodaySource | null,
  officialEntries: KurariExOfficialEntriesSource | null,
  starterSource: KurariExStartersSource | null,
  sourceErrors: string[] = [],
): KurariExIdentitySourceConnectionSummary {
  const officialByKey = new Map<string, KurariExIdentitySourceStarter | null>();
  if (officialEntries?.date && (!today?.date || officialEntries.date === today.date)) {
    for (const venue of officialEntries.venues ?? []) {
      const date = String(venue.date || officialEntries.date);
      const venueCode = normalizeKurariExVenueCode(venue.venueCode);
      for (const race of venue.races ?? []) {
        const raceNumber = normalizeKurariExSourceNumber(race.raceNumber);
        if (!date || !venueCode || raceNumber == null) continue;
        for (const entry of race.entries ?? []) {
          const carNo = String(entry.carNo ?? "").trim();
          if (!carNo) continue;
          addUniqueSourceEntry(
            officialByKey,
            buildOfficialEntryJoinKey(date, venueCode, raceNumber, carNo),
            officialEntryToIdentityStarter(
              officialEntries,
              venue,
              raceNumber,
              entry,
              "date-venue-code-race-car-name",
            ),
          );
        }
      }
    }
  }

  const starterByKey = new Map<string, KurariExIdentitySourceStarter | null>();
  if (starterSource?.date && (!today?.date || starterSource.date === today.date)) {
    for (const race of starterSource.races) {
      for (const starter of race.starters) {
        addUniqueSourceEntry(
          starterByKey,
          buildStarterSourceJoinKey(
            race.date,
            race.venueName,
            race.raceNumber,
            String(starter.carNo),
          ),
          starterSourceToIdentityStarter(
            starterSource,
            race,
            starter,
            "date-venue-name-race-car-name",
          ),
        );
      }
    }
  }

  const starters: KurariExIdentitySourceStarter[] = [];
  const nameMismatchDetails: KurariExIdentityMismatchDetail[] = [];
  let blockedNameMismatchCount = 0;
  const todayRiders = (today?.venues ?? []).flatMap((venue) =>
    (venue.races ?? []).flatMap((race) => {
      const raceNumber = normalizeKurariExSourceNumber(race.raceNo);
      if (raceNumber == null) return [];
      const raceId = String(
        race.raceId
        || venue.raceIds?.[Math.max(0, raceNumber - 1)]
        || "",
      ).trim() || null;
      return (race.riders ?? []).map((rider) => ({ venue, raceNumber, raceId, rider }));
    }),
  );

  if (today?.date && todayRiders.length > 0) {
    for (const { venue, raceNumber, raceId, rider } of todayRiders) {
      const todayStarter = todayRiderToIdentityStarter(today, venue, raceNumber, rider);
      const officialKey = buildOfficialEntryJoinKey(
        todayStarter.date,
        todayStarter.venueCode,
        raceNumber,
        todayStarter.carNo,
      );
      const officialStarter = officialByKey.get(officialKey) ?? null;
      if (officialStarter) {
        const playerNameMatches =
          normalizeKurariExRiderName(officialStarter.name)
          === normalizeKurariExRiderName(todayStarter.name);
        if (playerNameMatches && officialStarter.registrationNo) {
          starters.push(officialStarter);
          continue;
        }
        if (!playerNameMatches) {
          const aliasRegistryEntry = findKurariForeignRiderAlias(
            todayStarter.name,
            officialStarter.name,
            officialStarter.registrationNo,
          );
          blockedNameMismatchCount += 1;
          nameMismatchDetails.push({
            date: todayStarter.date,
            venueName: todayStarter.venueName,
            venueCode: todayStarter.venueCode,
            raceNumber,
            raceId,
            carNo: todayStarter.carNo,
            todayName: todayStarter.name,
            officialCandidateName: officialStarter.name,
            officialCandidateRegistrationNo: officialStarter.registrationNo,
            officialCandidatePrefecture: officialStarter.prefecture,
            officialCandidateAge: officialStarter.age,
            officialCandidateTerm: officialStarter.term,
            officialCandidateClassName: officialStarter.className,
            reason: classifyKurariExIdentityNameMismatch(
              todayStarter.name,
              officialStarter.name,
            ),
            differenceNote: describeKurariExIdentityNameMismatch(
              todayStarter.name,
              officialStarter.name,
            ),
            sourceFetchedAt: officialStarter.sourceFetchedAt,
            sourceType: "official-candidate",
            rawKey: officialKey,
            safeKeyStatus: "key-fields-matched-name-mismatch",
            processingResult: "not-connected-registration-unavailable",
            aliasRegistryStatus: aliasRegistryEntry ? "registered" : "not-registered",
            aliasRegistryEntry,
          });
        }
      }

      const starterKey = buildStarterSourceJoinKey(
        todayStarter.date,
        todayStarter.venueName,
        raceNumber,
        todayStarter.carNo,
      );
      const savedStarter = starterByKey.get(starterKey) ?? null;
      if (savedStarter) {
        if (
          normalizeKurariExRiderName(savedStarter.name)
          === normalizeKurariExRiderName(todayStarter.name)
          && savedStarter.registrationNo
        ) {
          starters.push({
            ...savedStarter,
            venueCode: todayStarter.venueCode,
            venueName: todayStarter.venueName,
          });
          continue;
        }
      }

      starters.push(todayStarter);
    }
  } else if (officialEntries?.date) {
    for (const venue of officialEntries.venues ?? []) {
      for (const race of venue.races ?? []) {
        const raceNumber = normalizeKurariExSourceNumber(race.raceNumber);
        if (raceNumber == null) continue;
        for (const entry of race.entries ?? []) {
          starters.push(
            officialEntryToIdentityStarter(
              officialEntries,
              venue,
              raceNumber,
              entry,
              "official-entry-direct",
            ),
          );
        }
      }
    }
  } else if (starterSource) {
    for (const race of starterSource.races) {
      for (const starter of race.starters) {
        starters.push(
          starterSourceToIdentityStarter(
            starterSource,
            race,
            starter,
            "starter-source-direct",
          ),
        );
      }
    }
  }

  starters.sort((left, right) =>
    left.date.localeCompare(right.date)
    || left.venueCode.localeCompare(right.venueCode)
    || left.venueName.localeCompare(right.venueName, "ja")
    || left.raceNumber - right.raceNumber
    || Number(left.carNo) - Number(right.carNo),
  );

  const countSource = (sourceType: KurariExIdentitySourceStarter["sourceType"]) =>
    starters.filter((starter) => starter.sourceType === sourceType).length;
  const registrationNoCompleteCount = starters.filter((starter) => starter.registrationNo).length;
  const aliasRegistryRegisteredCount = nameMismatchDetails.filter(
    (detail) => detail.aliasRegistryStatus === "registered",
  ).length;
  const foreignRiderAliasRegisteredCount = nameMismatchDetails.filter(
    (detail) => detail.aliasRegistryEntry?.category === "foreign-rider-alias",
  ).length;
  const raceKeys = new Set(
    starters.map((starter) =>
      [starter.date, starter.venueCode || normalizeKurariExIdentityVenueName(starter.venueName), starter.raceNumber].join("|"),
    ),
  );

  return {
    status: starters.length === 0
      ? "unavailable"
      : registrationNoCompleteCount === starters.length
        ? "ready"
        : "partial",
    todayDate: today?.date ?? null,
    todayGeneratedAt: today?.generatedAt ?? null,
    officialEntriesDate: officialEntries?.date ?? null,
    officialEntriesFetchedAt: officialEntries?.generatedAt ?? null,
    starterSourceDate: starterSource?.date ?? null,
    starterSourceFetchedAt: starterSource?.sourceGeneratedAt ?? null,
    raceCount: raceKeys.size,
    starterCount: starters.length,
    registrationNoCompleteCount,
    registrationNoMissingCount: starters.length - registrationNoCompleteCount,
    officialEntriesCount: countSource("official"),
    starterSourceCount: countSource("source-backed"),
    todayGeneratedOnlyCount: Math.max(
      0,
      countSource("today-generated-only") - nameMismatchDetails.length,
    ),
    historicalIdentityCount: countSource("historical-identity"),
    manualOverrideCount: countSource("manual-override"),
    unknownCount: countSource("unknown"),
    unavailableCount: starters.length - registrationNoCompleteCount,
    blockedNameMismatchCount,
    mismatchCandidateCount: nameMismatchDetails.length,
    aliasRegistryRegisteredCount,
    foreignRiderAliasRegisteredCount,
    officialCandidateNotAdoptedCount: nameMismatchDetails.length,
    nameMismatchDetails,
    sourceErrors,
    starters,
  };
}

export async function loadKurariExIdentitySourceConnection(): Promise<{
  summary: KurariExIdentitySourceConnectionSummary;
  startersSource: Awaited<ReturnType<typeof loadLatestKurariExStartersSource>> | null;
}> {
  const [todayResult, officialResult, startersResult] = await Promise.allSettled([
    fetchJson<KurariExTodaySource>(TODAY_RACES_PATH),
    fetchJson<KurariExOfficialEntriesSource>(OFFICIAL_ENTRIES_PATH),
    loadLatestKurariExStartersSource(),
  ]);
  const sourceErrors: string[] = [];
  if (todayResult.status === "rejected") sourceErrors.push("today.generated: unavailable");
  if (officialResult.status === "rejected") sourceErrors.push("official entries: unavailable");
  if (startersResult.status === "rejected") sourceErrors.push("starter source: unavailable");
  const startersSource = startersResult.status === "fulfilled" ? startersResult.value : null;
  return {
    summary: summarizeKurariExIdentitySourceConnection(
      todayResult.status === "fulfilled" ? todayResult.value : null,
      officialResult.status === "fulfilled" ? officialResult.value : null,
      startersSource?.source ?? null,
      sourceErrors,
    ),
    startersSource,
  };
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
  totalRiderCount?: number;
};

export type KurariExRiderPredictionEntry = KurariExRiderExactMatch & {
  exact: KurariExRiderExact;
};

export type KurariExRiderPredictionMaterial = {
  text: string;
  reflectedCount: number;
};

export type KurariExConditionContext = {
  bankLength?: number | null;
  timeslot?: string | null;
  grade?: string | null;
  raceTitle?: string | null;
};

export type KurariExConditionMaterial = {
  text: string;
  status: "ready" | "partial" | "missing";
  reflectedCategoryCount: number;
  reflectedRiderCount: number;
};

export type KurariExRoleStatsMaterial = {
  text: string;
  status: "ready" | "partial" | "missing";
  assignedRiderCount: number;
  reflectedRiderCount: number;
  lowSampleCount: number;
  missingCount: number;
};

export type KurariExWeatherMaterial = {
  text: string;
  status: "ready" | "partial" | "missing";
  weatherKey: "sunny" | "cloudy" | "rain" | "snow" | null;
  weatherLabel: string;
  reflectedRiderCount: number;
  lowSampleCount: number;
  missingCount: number;
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

export type KurariExMatchupExactMatch = {
  carNo: string;
  riderName: string;
  registrationNo: string;
  matchMethod: "registrationNo" | "name";
  indexItem: KurariExMatchupExactIndex["items"][number];
};

export type KurariExMatchupPredictionEntry = KurariExMatchupExactMatch & {
  exact: KurariExMatchupExact;
};

export type KurariExMatchupPredictionMaterial = {
  text: string;
  reflectedCount: number;
};

type KurariExMatchupMaterialCategory = "practical" | "low-sample" | "insufficient";

type KurariExMatchupMaterialPair = {
  self: KurariExMatchupPredictionEntry;
  opponent: KurariExMatchupPredictionEntry;
  matchup: KurariExMatchupEntry;
  category: KurariExMatchupMaterialCategory;
};

export function matchKurariExMatchupsForRace(
  index: KurariExMatchupExactIndex,
  riders: KurariExRaceRiderLike[],
): KurariExMatchupExactMatch[] {
  const byRegistrationNo = new Map(
    index.items.map((item) => [normalizeKurariExRiderRegistrationNo(item.registrationNo), item]),
  );
  const byName = new Map<string, KurariExMatchupExactIndex["items"][number]>();
  const duplicateNames = new Set<string>();

  for (const item of index.items) {
    const nameKey = normalizeKurariExRiderName(item.name);
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
    .map((rider): KurariExMatchupExactMatch | null => {
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
    .filter((item): item is KurariExMatchupExactMatch => Boolean(item))
    .sort((left, right) => Number(left.carNo) - Number(right.carNo));
}

function buildKurariExMatchupSignal(
  selfName: string,
  opponentName: string,
  matchup: KurariExMatchupEntry,
) {
  const selfAheadRate = matchup.selfAheadRate ?? 0;
  const opponentAheadRate = matchup.opponentAheadRate ?? 0;
  if (selfAheadRate >= 65) return selfName + "の先着優勢。序列上位評価。";
  if (opponentAheadRate >= 65) return opponentName + "が優勢。" + selfName + "の過信注意。";
  if (selfAheadRate >= 55) return selfName + "やや優勢。";
  if (opponentAheadRate >= 55) return opponentName + "やや優勢。";
  return "拮抗。展開・ライン構成を優先。";
}

function classifyKurariExMatchupMaterialPair(
  self: KurariExMatchupPredictionEntry,
  opponent: KurariExMatchupPredictionEntry,
  matchup: KurariExMatchupEntry,
): KurariExMatchupMaterialCategory {
  const pairQuality = String(matchup.quality ?? "").toLowerCase();
  const selfQuality = String(self.exact.quality ?? "").toLowerCase();
  const opponentQuality = String(opponent.exact.quality ?? "").toLowerCase();
  const safeComparableRaceCount = matchup.safeComparableRaceCount ?? 0;

  if (
    pairQuality === "partial" ||
    selfQuality === "partial" ||
    opponentQuality === "partial"
  ) {
    return "insufficient";
  }

  if (
    pairQuality === "low-sample" ||
    selfQuality === "low-sample" ||
    opponentQuality === "low-sample" ||
    (safeComparableRaceCount >= 1 && safeComparableRaceCount <= 2)
  ) {
    return "low-sample";
  }

  const hasSameLineComparison = (matchup.sameLine?.safeComparableRaceCount ?? 0) > 0;
  const hasOtherLineComparison = (matchup.otherLine?.safeComparableRaceCount ?? 0) > 0;
  const hasOnlyOneLineCategory = hasSameLineComparison !== hasOtherLineComparison;
  const hasComparableRates =
    matchup.selfAheadRate != null &&
    matchup.opponentAheadRate != null;

  if (
    safeComparableRaceCount < 3 ||
    pairQuality !== "sufficient" ||
    hasOnlyOneLineCategory ||
    !hasComparableRates
  ) {
    return "insufficient";
  }

  return "practical";
}

function buildKurariExMatchupMaterialLine(pair: KurariExMatchupMaterialPair) {
  const { self, opponent, matchup, category } = pair;
  const selfName = self.carNo + "番 " + (self.riderName || self.exact.name);
  const opponentName = opponent.carNo + "番 " + (opponent.riderName || matchup.opponentName);
  const safeComparableRaceCount = matchup.safeComparableRaceCount ?? 0;
  const comparison = safeComparableRaceCount > 0
    ? `${safeComparableRaceCount}R比較 / ${self.carNo}番先着${matchup.selfAheadCount} / ${opponent.carNo}番先着${matchup.opponentAheadCount}`
    : `安全比較0R / 共有${matchup.sharedRaceCount ?? 0}R`;

  if (category === "practical") {
    return `- ${selfName} vs ${opponentName}: ${comparison}。${buildKurariExMatchupSignal(selfName, opponentName, matchup)}`;
  }

  if (category === "low-sample") {
    const sampleNote = safeComparableRaceCount === 1
      ? "1Rだけの比較のため過信しない"
      : "LOW SAMPLE・母数少のため参考扱い";
    return `- ${selfName} vs ${opponentName}: ${comparison}。${sampleNote}。強い根拠にはせず、展開・ライン・近況を優先`;
  }

  const qualityLabel = matchup.quality === "partial" ||
    self.exact.quality === "partial" ||
    opponent.exact.quality === "partial"
    ? "partial品質"
    : "比較項目不足";
  return `- ${selfName} vs ${opponentName}: ${comparison}。${qualityLabel}のため比較不足・蓄積中。買い目根拠には固定しない`;
}

export function buildKurariExMatchupPredictionMaterial(
  entries: KurariExMatchupPredictionEntry[],
  state: "ready" | "missing" | "error" = "ready",
): KurariExMatchupPredictionMaterial {
  const heading = "【MATCHUP EX / 対戦相性】";

  if (state === "error") {
    return {
      text: [heading, "MATCHUP EXを取得できませんでした。", "会場別EXACT・選手別EXACTと既存素材を主として予想してください。"].join("\n"),
      reflectedCount: 0,
    };
  }

  if (state === "missing" || entries.length < 2) {
    return {
      text: [heading, "今回出走メンバー同士で使えるMATCHUP EXはありません。"].join("\n"),
      reflectedCount: 0,
    };
  }

  const entryByRegistrationNo = new Map(entries.map((entry) => [entry.registrationNo, entry]));
  const usedPairKeys = new Set<string>();
  const pairs: KurariExMatchupMaterialPair[] = [];

  for (const entry of entries) {
    for (const matchup of entry.exact.matchups ?? []) {
      const opponent = entryByRegistrationNo.get(matchup.opponentRegistrationNo);
      if (!opponent) continue;

      const pairKey = [entry.registrationNo, opponent.registrationNo].sort().join(":");
      if (usedPairKeys.has(pairKey)) continue;
      usedPairKeys.add(pairKey);

      pairs.push({
        self: entry,
        opponent,
        matchup,
        category: classifyKurariExMatchupMaterialPair(entry, opponent, matchup),
      });
    }
  }

  if (!pairs.length) {
    return {
      text: [
        heading,
        "今回出走メンバー同士で使えるMATCHUP EXはありません。",
      ].join("\n"),
      reflectedCount: 0,
    };
  }

  const maxPairsPerCategory = 5;
  const practicalPairs = pairs.filter((pair) => pair.category === "practical");
  const lowSamplePairs = pairs.filter((pair) => pair.category === "low-sample");
  const insufficientPairs = pairs.filter((pair) => pair.category === "insufficient");
  const displayedPracticalPairs = practicalPairs.slice(0, maxPairsPerCategory);
  const displayedLowSamplePairs = lowSamplePairs.slice(0, maxPairsPerCategory);
  const displayedInsufficientPairs = insufficientPairs.slice(0, maxPairsPerCategory);
  const reflectedCount =
    displayedPracticalPairs.length +
    displayedLowSamplePairs.length +
    displayedInsufficientPairs.length;

  const text = [
    heading,
    "",
    `- 反映状況: MATCHUP EX ${reflectedCount}組`,
    `- 実戦参考: ${displayedPracticalPairs.length}組`,
    `- LOW SAMPLE / 低母数: ${displayedLowSamplePairs.length}組`,
    `- 比較不足 / 蓄積中: ${displayedInsufficientPairs.length}組`,
    "",
    "扱い:",
    "- MATCHUP EXは同走時の先着傾向を補助材料として扱ってください。",
    "- 1Rだけの比較は過信せず、LOW SAMPLEは参考扱い、partial品質は比較不足・蓄積中として扱います。",
    "- 会場別EXACT・選手別EXACT・KDreams素材、ライン構成・近況を優先してください。",
    "",
    "■ 実戦参考にできる対戦",
    ...(displayedPracticalPairs.length
      ? displayedPracticalPairs.map(buildKurariExMatchupMaterialLine)
      : ["- 該当なし"]),
    ...(practicalPairs.length > displayedPracticalPairs.length
      ? [`- ほか${practicalPairs.length - displayedPracticalPairs.length}組（表示上限）`]
      : []),
    "",
    "■ LOW SAMPLE / 低母数",
    ...(displayedLowSamplePairs.length
      ? displayedLowSamplePairs.map(buildKurariExMatchupMaterialLine)
      : ["- 該当なし"]),
    ...(lowSamplePairs.length > displayedLowSamplePairs.length
      ? [`- ほか${lowSamplePairs.length - displayedLowSamplePairs.length}組（表示上限）`]
      : []),
    "",
    "■ 比較不足 / 蓄積中",
    ...(displayedInsufficientPairs.length
      ? displayedInsufficientPairs.map(buildKurariExMatchupMaterialLine)
      : ["- 該当なし"]),
    ...(insufficientPairs.length > displayedInsufficientPairs.length
      ? [`- ほか${insufficientPairs.length - displayedInsufficientPairs.length}組（表示上限）`]
      : []),
  ].join("\n");

  return { text, reflectedCount };
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

function normalizeKurariExConditionGrade(value?: string | null) {
  const normalized = String(value ?? "").normalize("NFKC").trim().toUpperCase();
  if (normalized === "G3" || normalized === "GIII") return "G3";
  if (normalized === "F1" || normalized === "F2") return normalized;
  return null;
}

function resolveKurariExConditionRaceStage(value?: string | null) {
  const normalized = String(value ?? "").normalize("NFKC");
  if (!normalized) return null;
  if (/準決/u.test(normalized)) return { key: "semi-final", label: "準決勝", safe: false } as const;
  if (/決勝/u.test(normalized)) return { key: "final", label: "決勝", safe: false } as const;
  if (/一般|特一般|敗者|負け戦/u.test(normalized)) return { key: "consolation", label: "敗者戦", safe: true } as const;
  if (/特選|優秀|選抜|シード/u.test(normalized)) return { key: "seed-special", label: "シード戦", safe: true } as const;
  if (/予選|一予|二予|一次予選|二次予選|特予選/u.test(normalized)) return { key: "qualifying", label: "予選", safe: true } as const;
  return null;
}

function getKurariExConditionSampleNote(starts: number) {
  if (starts < 5) return "LOW SAMPLE・参考扱い。強い根拠にはしない";
  if (starts < 10) return "低母数・参考扱い";
  return "条件別の補助材料として使用可";
}

function formatKurariExConditionAggregate(
  entry: KurariExRiderPredictionEntry,
  label: string,
  aggregate?: KurariExRiderAggregate | null,
) {
  if (!aggregate || aggregate.starts == null || aggregate.starts <= 0) return "";
  const parts = [
    `${aggregate.starts}走`,
    `1着${aggregate.wins}`,
    `2着${aggregate.seconds}`,
    `3着${aggregate.thirds}`,
    aggregate.outside != null ? `着外${aggregate.outside}` : "",
    aggregate.winRate.rate != null ? `勝率${aggregate.winRate.rate.toFixed(1)}%` : "",
    aggregate.top2Rate.rate != null ? `2連対${aggregate.top2Rate.rate.toFixed(1)}%` : "",
    aggregate.top3Rate.rate != null ? `3連対${aggregate.top3Rate.rate.toFixed(1)}%` : "",
  ].filter(Boolean);
  return `- ${entry.carNo}番 ${entry.riderName || entry.exact.name}: ${label} ${parts.join(" / ")} / ${getKurariExConditionSampleNote(aggregate.starts)}`;
}

export function buildKurariExConditionMaterial(
  entries: KurariExRiderPredictionEntry[],
  context?: KurariExConditionContext | null,
): KurariExConditionMaterial {
  const heading = "【KURARI EX 条件別成績】";
  const bankLength = context?.bankLength === 333 || context?.bankLength === 400 || context?.bankLength === 500
    ? context.bankLength
    : null;
  const timeslotLabels: Record<string, string> = {
    morning: "モーニング",
    day: "デイ",
    night: "ナイター",
    midnight: "ミッドナイト",
  };
  const timeslot = context?.timeslot && timeslotLabels[context.timeslot] ? context.timeslot : null;
  const grade = normalizeKurariExConditionGrade(context?.grade);
  const raceStage = resolveKurariExConditionRaceStage(context?.raceTitle);
  const targetLabels = [
    bankLength ? `${bankLength}m` : "",
    timeslot ? timeslotLabels[timeslot] : "",
    grade ?? "",
    raceStage?.label ?? "",
    grade && raceStage?.safe ? `${grade}×${raceStage.label}` : "",
  ].filter(Boolean);
  const eligibleEntries = entries
    .filter((entry) => entry.exact.quality !== "identity-only")
    .sort((left, right) => Number(left.carNo) - Number(right.carNo))
    .slice(0, 9);
  const lines = [
    heading,
    `- 対象条件: ${targetLabels.length ? targetLabels.join(" / ") : "安全に取得できた条件なし"}`,
    "- 扱い: 既存の選手別EXACTに保存済みの条件別成績だけを表示。未保存条件はfake補完しない。",
  ];
  let reflectedCategoryCount = 0;
  const reflectedRiders = new Set<string>();

  const appendCategory = (
    title: string,
    rows: string[],
    emptyMessage: string,
  ) => {
    lines.push("", `■ ${title}`);
    if (rows.length) {
      lines.push(...rows);
      reflectedCategoryCount += 1;
      rows.forEach((row) => {
        const match = row.match(/^- (\d+)番/u);
        if (match) reflectedRiders.add(match[1]);
      });
    } else {
      lines.push(`- ${emptyMessage}`);
    }
  };

  appendCategory(
    "周長別",
    bankLength
      ? eligibleEntries
        .map((entry) => formatKurariExConditionAggregate(
          entry,
          `${bankLength}m`,
          entry.exact.byBankLength.find((item) => item.bankLength === bankLength),
        ))
        .filter(Boolean)
      : [],
    bankLength ? "該当する保存済み選手成績なし。fake補完しない。" : "今回周長を安全に取得できないため表示対象外。",
  );
  appendCategory(
    "時間帯別",
    timeslot
      ? eligibleEntries
        .map((entry) => formatKurariExConditionAggregate(
          entry,
          timeslotLabels[timeslot],
          entry.exact.byTimeslot.find((item) => item.timeslot === timeslot),
        ))
        .filter(Boolean)
      : [],
    timeslot ? "該当する保存済み選手成績なし。fake補完しない。" : "今回時間帯を安全に取得できないため表示対象外。",
  );
  appendCategory(
    "グレード別",
    [],
    grade
      ? `${grade}の選手別集計は現在のEXACTに未蓄積。現在レースのグレードを過去成績へ後付けしない。`
      : "今回グレードを安全に取得できないため表示対象外。",
  );
  appendCategory(
    "レース種目別",
    raceStage?.safe
      ? eligibleEntries
        .map((entry) => formatKurariExConditionAggregate(
          entry,
          raceStage.label,
          entry.exact.byRaceStage.find((item) => item.raceStage === raceStage.key),
        ))
        .filter(Boolean)
      : [],
    raceStage?.key === "semi-final"
      ? "準決勝は分類整備中のため今回は表示対象外。決勝へ混ぜない。"
      : raceStage?.key === "final"
        ? "決勝は既存集計から準決勝を安全に分離できるまで表示対象外。"
        : raceStage
          ? "該当する保存済み選手成績なし。fake補完しない。"
          : "今回レース種目を安全に分類できないため表示対象外。",
  );
  appendCategory(
    "グレード×レース種目",
    [],
    grade && raceStage?.safe
      ? `${grade}×${raceStage.label}の選手別交差集計は現在のEXACTに未蓄積。fake補完しない。`
      : "両条件を安全に取得できない、または交差集計未蓄積のため表示対象外。",
  );

  return {
    text: lines.join("\n"),
    status: reflectedCategoryCount >= 5
      ? "ready"
      : reflectedCategoryCount > 0
        ? "partial"
        : "missing",
    reflectedCategoryCount,
    reflectedRiderCount: reflectedRiders.size,
  };
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

function formatKurariExRoleStatsAggregate(
  entry: KurariExRiderPredictionEntry,
  roleLabel: string,
  aggregate?: KurariExRiderAggregate | null,
) {
  if (!aggregate || aggregate.starts == null || aggregate.starts <= 0) return "";
  const sampleNote = aggregate.starts < 5
    ? "LOW SAMPLE・参考扱い。強い根拠にはしない"
    : aggregate.starts < 10
      ? "低母数・参考扱い"
      : "役割別の補助材料として使用可";
  const parts = [
    `${aggregate.starts}走`,
    `1着${aggregate.wins}`,
    `2着${aggregate.seconds}`,
    `3着${aggregate.thirds}`,
    aggregate.outside != null ? `着外${aggregate.outside}` : "",
    aggregate.winRate.rate != null ? `勝率${aggregate.winRate.rate.toFixed(1)}%` : "",
    aggregate.top2Rate.rate != null ? `2連対${aggregate.top2Rate.rate.toFixed(1)}%` : "",
    aggregate.top3Rate.rate != null ? `3連対${aggregate.top3Rate.rate.toFixed(1)}%` : "",
  ].filter(Boolean);
  return `- ${entry.carNo}番 ${entry.riderName || entry.exact.name}: ${roleLabel} ${parts.join(" / ")} / ${sampleNote}`;
}

export function buildKurariExRoleStatsMaterial(
  entries: KurariExRiderPredictionEntry[],
  context?: KurariExRiderPredictionContext | null,
): KurariExRoleStatsMaterial {
  const heading = "【KURARI EX 役割別成績】";
  const groups = (context?.lineupGroups ?? []).map((group) =>
    group
      .split("-")
      .map((value) => value.replace(/\D/gu, ""))
      .filter(Boolean),
  );
  const lineupCarNumbers = groups.flat();
  const lineupIsSafe = Boolean(
    context?.allowRole
    && groups.length > 0
    && groups.every((group) => group.length > 0)
    && lineupCarNumbers.length > 0
    && new Set(lineupCarNumbers).size === lineupCarNumbers.length
    && (!context.totalRiderCount || lineupCarNumbers.length === context.totalRiderCount),
  );
  if (!lineupIsSafe) {
    return {
      text: [
        heading,
        "- 並び未取得、または車番を安全に解釈できないため、今回役割に固定した成績表示は行いません。",
        "- 選手別EXACTの総合成績・条件別成績を優先してください。",
      ].join("\n"),
      status: "missing",
      assignedRiderCount: 0,
      reflectedRiderCount: 0,
      lowSampleCount: 0,
      missingCount: 0,
    };
  }

  const roleLabels: Record<keyof NonNullable<KurariExRiderExact["byRole"]>, string> = {
    front: "ライン先頭",
    bante: "番手",
    third: "3番手以降",
    single: "単騎",
  };
  const eligibleEntries = entries
    .filter((entry) => entry.exact.quality !== "identity-only")
    .sort((left, right) => Number(left.carNo) - Number(right.carNo))
    .slice(0, 9);
  const rows: string[] = [];
  let lowSampleCount = 0;
  for (const entry of eligibleEntries) {
    const role = resolveKurariExRiderRole(entry.carNo, context);
    if (!role) continue;
    const aggregate = entry.exact.byRole?.[role] ?? null;
    const row = formatKurariExRoleStatsAggregate(entry, roleLabels[role], aggregate);
    if (!row) continue;
    rows.push(row);
    if ((aggregate?.starts ?? 0) < 10) lowSampleCount += 1;
  }

  const assignedRiderCount = lineupCarNumbers.length;
  const reflectedRiderCount = rows.length;
  const missingCount = Math.max(0, assignedRiderCount - reflectedRiderCount);
  const lines = [
    heading,
    "- 扱い: 既存の選手別EXACTに保存済みのbyRole成績だけを表示。並び未取得時は今回役割に固定しない。",
    `- 今回並び: ${groups.map((group) => group.join("-")).join(" / ")}`,
    "",
    "■ 今回役割別の過去成績",
    ...(rows.length
      ? rows
      : ["- 今回役割に対応する保存済みbyRole成績なし。fake補完しない。"]),
    ...(missingCount > 0
      ? [`- 未蓄積・対象外: ${missingCount}人（identity-only、byRole未蓄積、または既存集計対象外の4番手以降を含む）`]
      : []),
    "",
    "■ 役割別の見方",
    "- ライン先頭: 逃げ・捲りの押し切り、主導権時の残り目を確認。",
    "- 番手: 差し・同ラインワンツー、逆転差しを確認。",
    "- 3番手以降: 保存済みbyRole.thirdがある場合だけ、同ラインスリーと3連単3着保護を確認。",
    "- 単騎: 単騎3着、別線3着、展開待ちの差し込みを参考扱い。",
  ];
  return {
    text: lines.join("\n"),
    status: reflectedRiderCount === 0
      ? "missing"
      : reflectedRiderCount === assignedRiderCount && lowSampleCount === 0
        ? "ready"
        : "partial",
    assignedRiderCount,
    reflectedRiderCount,
    lowSampleCount,
    missingCount,
  };
}

function normalizeKurariExWeather(value?: string | null) {
  const normalized = String(value ?? "").normalize("NFKC").trim().toLowerCase();
  if (!normalized || /不明|取得待ち|未取得|天気情報なし|観測値未提供|なし|unknown|pending/u.test(normalized)) {
    return null;
  }
  if (/雪|snow|snowy/u.test(normalized)) return { key: "snow", label: "雪" } as const;
  if (/雨|霧雨|にわか雨|雷雨|rain|rainy/u.test(normalized)) return { key: "rain", label: "雨" } as const;
  if (/曇|くもり|cloudy|cloud/u.test(normalized)) return { key: "cloudy", label: "曇り" } as const;
  if (/晴|快晴|sunny|clear/u.test(normalized)) return { key: "sunny", label: "晴れ" } as const;
  return null;
}

function formatKurariExWeatherAggregate(
  entry: KurariExRiderPredictionEntry,
  weatherLabel: string,
  aggregate?: KurariExRiderAggregate | null,
) {
  if (!aggregate || aggregate.starts == null || aggregate.starts <= 0) return "";
  const sampleNote = aggregate.starts < 5
    ? "LOW SAMPLE・参考扱い。強い根拠にはしない"
    : aggregate.starts < 10
      ? "低母数・参考扱い"
      : "天候別の補助材料として使用可";
  const parts = [
    `${aggregate.starts}走`,
    `1着${aggregate.wins}`,
    `2着${aggregate.seconds}`,
    `3着${aggregate.thirds}`,
    aggregate.outside != null ? `着外${aggregate.outside}` : "",
    aggregate.winRate.rate != null ? `勝率${aggregate.winRate.rate.toFixed(1)}%` : "",
    aggregate.top2Rate.rate != null ? `2連対${aggregate.top2Rate.rate.toFixed(1)}%` : "",
    aggregate.top3Rate.rate != null ? `3連対${aggregate.top3Rate.rate.toFixed(1)}%` : "",
  ].filter(Boolean);
  return `- ${entry.carNo}番 ${entry.riderName || entry.exact.name}: ${weatherLabel} ${parts.join(" / ")} / ${sampleNote}`;
}

export function buildKurariExWeatherMaterial(
  entries: KurariExRiderPredictionEntry[],
  currentWeather?: string | null,
  totalRiderCount = entries.length,
): KurariExWeatherMaterial {
  const heading = "【KURARI EX 天候別成績】";
  const weather = normalizeKurariExWeather(currentWeather);
  const readingLines = [
    "",
    "■ 天候別の見方",
    "- 晴れ: 通常条件の再現性を見る。",
    "- 曇り: 晴れとの差が大きい選手だけ参考。",
    "- 雨: バンクが重い・滑る可能性があるため、LOW SAMPLE時は過信しない。",
    "- 雪: 現在は要蓄積。保存済み実績がない場合は使わない。",
  ];
  if (!weather) {
    return {
      text: [
        heading,
        "- 今回天候を安全に取得できないため、天候別成績は表示対象外。",
        "- 選手別EXACTの総合成績・条件別成績を優先し、過去天気を後付けしない。",
        ...readingLines,
      ].join("\n"),
      status: "missing",
      weatherKey: null,
      weatherLabel: "",
      reflectedRiderCount: 0,
      lowSampleCount: 0,
      missingCount: totalRiderCount,
    };
  }

  const eligibleEntries = entries
    .filter((entry) => entry.exact.quality !== "identity-only")
    .sort((left, right) => Number(left.carNo) - Number(right.carNo))
    .slice(0, 9);
  const rows: string[] = [];
  let lowSampleCount = 0;
  for (const entry of eligibleEntries) {
    const aggregate = entry.exact.byWeather.find(
      (item) => item.weatherCondition === weather.key,
    );
    const row = formatKurariExWeatherAggregate(entry, weather.label, aggregate);
    if (!row) continue;
    rows.push(row);
    if ((aggregate?.starts ?? 0) < 10) lowSampleCount += 1;
  }

  const reflectedRiderCount = rows.length;
  const missingCount = Math.max(0, totalRiderCount - reflectedRiderCount);
  const missingMessage = weather.key === "snow"
    ? "雪の成績は現在のEXACTに未蓄積。fake補完しない。"
    : "今回天候に対応する保存済みbyWeather成績なし。過去天気を後付けしない。";
  return {
    text: [
      heading,
      `- 対象天候: ${weather.label}`,
      "- 扱い: 既存の選手別EXACTに保存済みの天候別成績だけを表示。過去天気の後付け・fake補完は禁止。",
      "",
      "■ 今回天候の過去成績",
      ...(rows.length ? rows : [`- ${missingMessage}`]),
      ...(missingCount > 0 && rows.length
        ? [`- 未蓄積: ${missingCount}人（identity-only、未紐付け、または該当天候のbyWeather未蓄積）`]
        : []),
      ...readingLines,
    ].join("\n"),
    status: reflectedRiderCount === 0
      ? "missing"
      : reflectedRiderCount === totalRiderCount && lowSampleCount === 0
        ? "ready"
        : "partial",
    weatherKey: weather.key,
    weatherLabel: weather.label,
    reflectedRiderCount,
    lowSampleCount,
    missingCount,
  };
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

function buildKurariExRiderSummaryLine(
  entry: KurariExRiderPredictionEntry,
  category: "practical" | "low-sample" | "identity-only",
) {
  const { exact } = entry;
  const name = entry.riderName || exact.name;

  if (category === "identity-only") {
    return `- ${entry.carNo}番 ${name}: 素材蓄積中。登録・識別のみ。買い目根拠には固定しない`;
  }

  const metrics = [
    `確定出走${exact.coverage.confirmedStartCount}`,
    exact.overall.winRate.rate != null ? `1着率${exact.overall.winRate.rate.toFixed(1)}%` : "",
    exact.overall.top3Rate.rate != null ? `3着以内率${exact.overall.top3Rate.rate.toFixed(1)}%` : "",
  ].filter(Boolean);
  const suffix = category === "low-sample"
    ? "母数少・参考扱い。強い根拠にはせず、展開・並びを優先"
    : "実戦根拠として買い目検討の補助に使用";

  return `- ${entry.carNo}番 ${name}: ${metrics.join(" / ")} / ${suffix}`;
}

export function buildKurariExRiderPredictionMaterial(
  entries: KurariExRiderPredictionEntry[],
  context?: KurariExRiderPredictionContext | null,
  state: "ready" | "missing" | "error" = "ready",
): KurariExRiderPredictionMaterial {
  const heading = "【PLAYER EX / 選手別EXACT】";
  const totalRiderCount = context?.totalRiderCount ?? entries.length;
  if (state === "error") {
    return {
      text: [
        heading,
        `- 反映状況: 選手別EXACT 0/${totalRiderCount}`,
        "選手別EXACTを取得できませんでした。",
        "会場別EXACTと既存素材を主として予想してください。",
      ].join("\n"),
      reflectedCount: 0,
    };
  }
  if (state === "missing" || entries.length === 0) {
    return {
      text: [
        heading,
        `- 反映状況: 選手別EXACT 0/${totalRiderCount}`,
        "- 実戦根拠: 0人",
        "- LOW SAMPLE: 0人",
        "- 素材蓄積中: 0人",
        "",
        "該当する公開済み選手別EXACTはありません。",
        "会場別EXACTと既存素材を主として予想してください。",
      ].join("\n"),
      reflectedCount: 0,
    };
  }

  const maxRidersPerCategory = 7;
  const practicalEntries = entries.filter(
    (entry) =>
      entry.exact.quality !== "identity-only" &&
      entry.exact.quality !== "low-sample" &&
      entry.exact.coverage.confirmedStartCount >= 5,
  );
  const identityOnlyEntries = entries.filter(
    (entry) => entry.exact.quality === "identity-only",
  );
  const lowSampleEntries = entries.filter(
    (entry) =>
      entry.exact.quality !== "identity-only" &&
      (entry.exact.quality === "low-sample" || entry.exact.coverage.confirmedStartCount < 5),
  );
  const displayedPracticalEntries = practicalEntries.slice(0, maxRidersPerCategory);
  const displayedLowSampleEntries = lowSampleEntries.slice(0, maxRidersPerCategory);
  const displayedIdentityOnlyEntries = identityOnlyEntries.slice(0, maxRidersPerCategory);
  const headerLines = [
    heading,
    "",
    `- 反映状況: 選手別EXACT ${entries.length}/${totalRiderCount}`,
    `- 実戦根拠: ${practicalEntries.length}人`,
    `- LOW SAMPLE: ${lowSampleEntries.length}人`,
    `- 素材蓄積中: ${identityOnlyEntries.length}人`,
    "",
    "扱い: 実戦根拠は買い目検討に使用し、LOW SAMPLEは参考扱い、素材蓄積中は将来の蓄積対象とします。",
  ];

  const categoryLines = [
    "",
    "■ 実戦根拠として使える選手",
    ...(displayedPracticalEntries.length
      ? displayedPracticalEntries.map((entry) => buildKurariExRiderSummaryLine(entry, "practical"))
      : ["- 該当なし"]),
    ...(practicalEntries.length > displayedPracticalEntries.length
      ? [`- ほか${practicalEntries.length - displayedPracticalEntries.length}人（表示上限）`]
      : []),
    "",
    "■ LOW SAMPLE / 参考扱い",
    ...(displayedLowSampleEntries.length
      ? displayedLowSampleEntries.map((entry) => buildKurariExRiderSummaryLine(entry, "low-sample"))
      : ["- 該当なし"]),
    ...(lowSampleEntries.length > displayedLowSampleEntries.length
      ? [`- ほか${lowSampleEntries.length - displayedLowSampleEntries.length}人（表示上限）`]
      : []),
    "",
    "■ 素材蓄積中 / identity-only",
    ...(displayedIdentityOnlyEntries.length
      ? displayedIdentityOnlyEntries.map((entry) => buildKurariExRiderSummaryLine(entry, "identity-only"))
      : ["- 該当なし"]),
    ...(identityOnlyEntries.length > displayedIdentityOnlyEntries.length
      ? [`- ほか${identityOnlyEntries.length - displayedIdentityOnlyEntries.length}人（表示上限）`]
      : []),
  ];

  const cards: string[] = [];
  const includedEntries: KurariExRiderPredictionEntry[] = [];
  for (const entry of displayedPracticalEntries) {
    const card = buildKurariExRiderCard(entry, context);
    const candidate = [
      ...headerLines,
      ...categoryLines,
      "",
      "【実戦根拠選手の詳細】",
      ...cards.flatMap((item) => ["", item]),
      "",
      card,
    ].join("\n");
    if (candidate.length > 3350) break;
    cards.push(card);
    includedEntries.push(entry);
  }

  const notes = uniqueStrings(includedEntries.flatMap((entry) => {
    const venue = context?.venueKey
      ? entry.exact.byVenue.find((item) => item.venueKey === context.venueKey)
      : null;
    return [
      venue?.starts != null && venue.starts < 3 ? "当場データは母数3R未満のため参考扱い" : "",
      entry.exact.coverage.roleEligibleCount < 3 ? "役割解析可能数が少ないため、番手差し評価を固定しない" : "",
    ];
  }));
  const noteLines = notes.length
    ? ["", "【登録選手EXACTからの注意】", ...notes.map((note) => `- ${note}`)]
    : [];
  const text = fitKurariExMaterialLines(
    [
      ...headerLines,
      ...categoryLines,
      ...(cards.length ? ["", "【実戦根拠選手の詳細】", ...cards.flatMap((card) => ["", card])] : []),
      ...noteLines,
    ],
    3500,
  );
  const reflectedCount =
    displayedPracticalEntries.length +
    displayedLowSampleEntries.length +
    displayedIdentityOnlyEntries.length;
  return { text, reflectedCount };
}
