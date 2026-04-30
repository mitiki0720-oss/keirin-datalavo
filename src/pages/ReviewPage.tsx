import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import { SiteHeader } from "./PageImplementations";

type PredictionSlotRecord = {
  raceKey: string;
  raceId?: string;
  venue: string;
  date: string;
  raceNumber: number;
  predictionText: string;
  savedAt?: string;
};

type PredictionResultHitStatus = "hit" | "miss" | "pending";

type PredictionResultRecord = {
  raceKey: string;
  raceId?: string;
  venue: string;
  date: string;
  raceNumber: number;
  resultOrder?: string;
  autoHitStatus?: PredictionResultHitStatus;
  manualHitStatus?: PredictionResultHitStatus;
  hitStatus: PredictionResultHitStatus;
  hitBetType?: "3連単" | "2車単";
  hitCombination?: string;
  investment?: number;
  payout?: number;
  profitLoss?: number;
  roi?: number;
　weatherActual?: PredictionRaceResultWeatherActual;
  memo?: string;
  savedAt?: string;
};

type PredictionRaceResultPayoutItem = {
  betType?: string;
  combination?: string;
  payout?: string;
  popularity?: string;
};

type PredictionRaceResultEntry = {
  place?: string;
  carNo?: string;
  name?: string;
  margin?: string;
  agari?: string;
  kimarite?: string;
  sMark?: boolean;
  hMark?: boolean;
  bMark?: boolean;
};

type PredictionRaceResultWeatherActual = {
  weather?: string;
  windDirection?: string;
  windSpeed?: string;
  temperature?: string;
};

type PredictionRaceResult = {
  status?: "pending" | "confirmed";
  finishOrder?: string[];
  kimarite?: string;
  secondKimarite?: string;
  payout2tan?: PredictionRaceResultPayoutItem | null;
  payout2fuku?: PredictionRaceResultPayoutItem[];
  payout3tan?: PredictionRaceResultPayoutItem | null;
  payout3fuku?: PredictionRaceResultPayoutItem | null;
  payoutWide?: PredictionRaceResultPayoutItem[];
  finalizedAt?: string;
  weatherActual?: PredictionRaceResultWeatherActual;
  sLeaderCarNo?: string;
  hLeaderCarNo?: string;
  bLeaderCarNo?: string;
};

type PredictionRaceItem = {
  raceNo: number;
  time?: string;
  title?: string;
  lineup?: string;
  isGirls?: boolean;
  oddsPreview?: { combo: string; odds: string; tag?: string }[];
  resultStatus?: "pending" | "confirmed";
  resultTop3?: PredictionRaceResultEntry[];
  payouts?: PredictionRaceResultPayoutItem[];
  result?: PredictionRaceResult;
};

type PredictionVenueItem = {
  venue: string;
  grade?: string;
  session?: string;
  title?: string;
  raceNos?: number[];
  races: PredictionRaceItem[];
};

type PredictionTodayFeed = {
  generatedAt?: string;
  date: string;
  venues: PredictionVenueItem[];
};

type ReviewRaceResultSnapshotMap = Record<string, PredictionRaceItem>;

type ReviewReportRecord = {
  id: string;
  date: string;
  venue: string;
  reportText: string;
  savedAt: string;
  predictionCopy: string;
  resultCopy: string;
};

type VenueReviewRace = {
  venue: string;
  date: string;
  raceNumber: number;
  raceKey: string;
  predictionText: string;
  savedAt?: string;
  predictionSummary: string;
  feedRace?: PredictionRaceItem;
  resultRecord?: PredictionResultRecord;
};

type VenueReviewGroup = {
  venue: string;
  date: string;
  races: VenueReviewRace[];
  grade?: string;
  session?: string;
  title?: string;
  totalInvestment: number;
  totalPayout: number;
  settledCount: number;
  hitCount: number;
};

type MonthCell = {
  iso: string;
  day: number;
  inMonth: boolean;
};

const PAGE_MAX_WIDTH = "2040px";
const PREDICTION_SLOT_STORAGE_KEY = "kurari-data-labo-prediction-slots";
const PREDICTION_RESULT_STORAGE_KEY = "kurari-data-labo-prediction-results";
const REVIEW_REPORT_STORAGE_KEY = "kurari-data-labo-review-reports";
const REVIEW_RACE_RESULT_SNAPSHOT_STORAGE_KEY = "kurari-data-labo-review-race-result-snapshots";
const REVIEW_RACE_RESULT_SNAPSHOT_MAX_ITEMS = 1200;

const toPublicPath = (path: string) => {
  const base = import.meta.env.BASE_URL || "/";
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  return `${normalizedBase}${path.replace(/^\/+/, "")}`;
};

const PREDICTION_TODAY_DATA_URL = toPublicPath("/data/races/today.generated.json");


const sessionLabelMap: Record<string, string> = {
  day: "🌞 デイ",
  night: "🌙 ナイター",
  midnight: "🌟 ミッドナイト",
  morning: "🐣 モーニング",
};

const venueColorMap: Record<string, { border: string; chip: string; text: string; accent: string }> = {
  別府: { border: "#d6c1fa", chip: "rgba(126, 91, 227, 0.12)", text: "#6a43c3", accent: "#7b5be3" },
  豊橋: { border: "#c6d8ff", chip: "rgba(103, 148, 255, 0.12)", text: "#2d5fc4", accent: "#5a8dff" },
  熊本: { border: "#f6c6d8", chip: "rgba(244, 122, 164, 0.12)", text: "#c14f7f", accent: "#ef6aa4" },
  大宮: { border: "#ffe0b4", chip: "rgba(255, 170, 54, 0.14)", text: "#b46a00", accent: "#f59e0b" },
  岐阜: { border: "#d2f1da", chip: "rgba(56, 167, 98, 0.13)", text: "#2e8751", accent: "#22c55e" },
  奈良: { border: "#e8ddfb", chip: "rgba(140, 104, 214, 0.12)", text: "#7857bc", accent: "#8b5cf6" },
  函館: { border: "#d4e6ff", chip: "rgba(110, 165, 255, 0.12)", text: "#376cc3", accent: "#3b82f6" },
};

function getJstNow() {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return {
    isoDate: `${get("year")}-${get("month")}-${get("day")}`,
    hhmmss: `${get("hour")}:${get("minute")}:${get("second")}`,
    dateLabel: `${get("year")}年${get("month")}月${get("day")}日`,
  };
}

function formatDateLabel(iso: string) {
  if (!iso) return "--";
  const date = new Date(`${iso}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).format(date);
}

function formatDateShort(iso: string) {
  if (!iso) return "--";
  const date = new Date(`${iso}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
  }).format(date);
}

function formatYen(value?: number) {
  if (value === undefined || Number.isNaN(value)) return "--";
  return `${value.toLocaleString()}円`;
}

function formatProfit(value?: number) {
  if (value === undefined || Number.isNaN(value)) return "--";
  if (value === 0) return "0円";
  return `${value > 0 ? "+" : "-"}${Math.abs(value).toLocaleString()}円`;
}

function formatRate(value?: number) {
  if (value === undefined || Number.isNaN(value)) return "--";
  return `${value.toFixed(1)}%`;
}

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function normalizeReviewPredictionResultRecord(record: PredictionResultRecord): PredictionResultRecord {
  const hitStatus = record.hitStatus ?? "pending";
  const normalizedInvestment =
    typeof record.investment === "number" && Number.isFinite(record.investment)
      ? record.investment
      : undefined;

  let normalizedPayout =
    typeof record.payout === "number" && Number.isFinite(record.payout)
      ? record.payout
      : undefined;

  if (hitStatus === "miss") {
    normalizedPayout = 0;
  }

  const profitLoss =
    normalizedInvestment !== undefined && normalizedPayout !== undefined
      ? normalizedPayout - normalizedInvestment
      : record.profitLoss;

  const roi =
    normalizedInvestment && normalizedPayout !== undefined
      ? (normalizedPayout / normalizedInvestment) * 100
      : undefined;

  return {
    ...record,
    hitStatus,
    investment: normalizedInvestment,
    payout: normalizedPayout,
    profitLoss,
    roi,
  };
}

function loadPredictionSlots() {
  if (typeof window === "undefined") return {} as Record<string, PredictionSlotRecord>;
  return safeJsonParse<Record<string, PredictionSlotRecord>>(window.localStorage.getItem(PREDICTION_SLOT_STORAGE_KEY), {});
}

function loadPredictionResults() {
  if (typeof window === "undefined") return {} as Record<string, PredictionResultRecord>;
  const raw = safeJsonParse<Record<string, PredictionResultRecord>>(window.localStorage.getItem(PREDICTION_RESULT_STORAGE_KEY), {});
  return Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [key, normalizeReviewPredictionResultRecord(value)]),
  );
}

function loadReviewReports() {
  if (typeof window === "undefined") return [] as ReviewReportRecord[];
  const parsed = safeJsonParse<ReviewReportRecord[] | Record<string, ReviewReportRecord>>(window.localStorage.getItem(REVIEW_REPORT_STORAGE_KEY), []);
  return Array.isArray(parsed) ? parsed : Object.values(parsed ?? {});
}

function saveReviewReports(records: ReviewReportRecord[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(REVIEW_REPORT_STORAGE_KEY, JSON.stringify(records));
}

function normalizeVenueName(value: string) {
  return value.normalize("NFKC").replace(/競輪場|競輪/g, "").trim();
}

function parseReviewRaceTimeMinutes(value?: string) {
  if (!value) return null;

  const match = value.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;

  return hour * 60 + minute;
}

function resolveReviewSessionFromTimes(times: Array<string | undefined>) {
  const minutes = times
    .map((time) => parseReviewRaceTimeMinutes(time))
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);

  if (minutes.length === 0) return undefined;

  const first = minutes[0];
  const last = minutes[minutes.length - 1];

  // 20時台以降に始まる / 23時前後まで続くものはミッドナイト扱い
  if (first >= 20 * 60 || last >= 22 * 60 + 30) return "midnight";

  // 15時台以降に始まるものはナイター扱い
  if (first >= 15 * 60) return "night";

  // 10:30より前に始まるものはモーニング扱い
  if (first < 10 * 60 + 30) return "morning";

  return "day";
}

function resolveReviewVenueSession(
  feedSession: string | undefined,
  times: Array<string | undefined>,
) {
  const timeSession = resolveReviewSessionFromTimes(times);

  // 発走時刻から分かる場合は、そちらを優先する
  return timeSession ?? feedSession;
}

function buildReviewRaceResultSnapshotKey(date: string, venue: string, raceNumber: number) {
  return `${date}:${normalizeVenueName(venue)}:${raceNumber}`;
}

function compactReviewRaceResultSnapshot(race: PredictionRaceItem): PredictionRaceItem {
  return {
    raceNo: race.raceNo,
    time: race.time,
    title: race.title,
    lineup: race.lineup,
    isGirls: race.isGirls,
    oddsPreview: race.oddsPreview?.slice(0, 20),
    resultStatus: race.resultStatus,
    resultTop3: race.resultTop3,
    payouts: race.payouts,
    result: race.result,
  };
}

function loadReviewRaceResultSnapshots() {
  if (typeof window === "undefined") return {} as ReviewRaceResultSnapshotMap;

  return safeJsonParse<ReviewRaceResultSnapshotMap>(
    window.localStorage.getItem(REVIEW_RACE_RESULT_SNAPSHOT_STORAGE_KEY),
    {},
  );
}

function saveReviewRaceResultSnapshots(records: ReviewRaceResultSnapshotMap) {
  if (typeof window === "undefined") return records;

  const compactRecords = Object.fromEntries(
    Object.entries(records)
      .filter(([key, race]) => Boolean(key) && Boolean(race?.raceNo))
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, REVIEW_RACE_RESULT_SNAPSHOT_MAX_ITEMS),
  ) as ReviewRaceResultSnapshotMap;

  window.localStorage.setItem(REVIEW_RACE_RESULT_SNAPSHOT_STORAGE_KEY, JSON.stringify(compactRecords));

  return compactRecords;
}

function mergePredictionRaceResult(
  feedResult?: PredictionRaceResult,
  snapshotResult?: PredictionRaceResult,
): PredictionRaceResult | undefined {
  if (!feedResult && !snapshotResult) return undefined;
  if (!feedResult) return snapshotResult;
  if (!snapshotResult) return feedResult;

  return {
    ...snapshotResult,
    ...feedResult,
    finishOrder: feedResult.finishOrder?.length ? feedResult.finishOrder : snapshotResult.finishOrder,
    payout2tan: feedResult.payout2tan ?? snapshotResult.payout2tan,
    payout2fuku: feedResult.payout2fuku?.length ? feedResult.payout2fuku : snapshotResult.payout2fuku,
    payout3tan: feedResult.payout3tan ?? snapshotResult.payout3tan,
    payout3fuku: feedResult.payout3fuku ?? snapshotResult.payout3fuku,
    payoutWide: feedResult.payoutWide?.length ? feedResult.payoutWide : snapshotResult.payoutWide,
    weatherActual: feedResult.weatherActual ?? snapshotResult.weatherActual,
    sLeaderCarNo: feedResult.sLeaderCarNo || snapshotResult.sLeaderCarNo,
    hLeaderCarNo: feedResult.hLeaderCarNo || snapshotResult.hLeaderCarNo,
    bLeaderCarNo: feedResult.bLeaderCarNo || snapshotResult.bLeaderCarNo,
  };
}

function mergeReviewRaceWithSnapshot(
  feedRace: PredictionRaceItem | undefined,
  snapshotRace: PredictionRaceItem | undefined,
): PredictionRaceItem | undefined {
  if (!feedRace && !snapshotRace) return undefined;
  if (!feedRace) return snapshotRace;
  if (!snapshotRace) return feedRace;

  return {
    ...snapshotRace,
    ...feedRace,
    time: feedRace.time || snapshotRace.time,
    title: feedRace.title || snapshotRace.title,
    lineup: feedRace.lineup || snapshotRace.lineup,
    isGirls: feedRace.isGirls ?? snapshotRace.isGirls,
    oddsPreview: feedRace.oddsPreview?.length ? feedRace.oddsPreview : snapshotRace.oddsPreview,
    resultStatus: feedRace.resultStatus || snapshotRace.resultStatus,
    resultTop3: feedRace.resultTop3?.length ? feedRace.resultTop3 : snapshotRace.resultTop3,
    payouts: feedRace.payouts?.length ? feedRace.payouts : snapshotRace.payouts,
    result: mergePredictionRaceResult(feedRace.result, snapshotRace.result),
  };
}

function extractPredictionSummary(text: string) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return "予想本文なし";
  const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const lineup = extractLineup(trimmed);
  const target =
    lines.find((line) => /本線|展開予想|狙い|想定|主導権/.test(line)) ??
    (lineup ? `並び ${lineup}` : undefined) ??
    lines.find((line) => /^【/.test(line) === false) ??
    lines[0] ??
    "予想本文なし";
  return target.slice(0, 96);
}

function extractTextSection(source: string, labels: string[]) {
  const text = String(source ?? "").replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  let startIndex = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const plain = lines[i].replace(/[【】]/g, "").trim();
    if (labels.some((label) => plain.startsWith(label))) {
      startIndex = i;
      break;
    }
  }
  if (startIndex < 0) return "";

  const bucket: string[] = [];
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const plain = lines[i].replace(/[【】]/g, "").trim();
    if (/^(タグ|結果|メモ|振り返り|買い目|読み込み証跡|選手情報|想定並び|ライン|展開予想|天候|天候\/風|読み込み証跡)$/.test(plain)) {
      if (bucket.length > 0) break;
      continue;
    }
    bucket.push(lines[i]);
  }
  return bucket.join("\n").trim();
}

function extractLineup(text: string) {
  return extractTextSection(text, ["ライン", "想定並び", "並び（仮）"]);
}

function buildMonthMatrix(baseIso: string): MonthCell[] {
  const current = new Date(`${baseIso}T00:00:00+09:00`);
  const year = current.getFullYear();
  const month = current.getMonth();
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());

  return Array.from({ length: 35 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return {
      iso: `${y}-${m}-${d}`,
      day: date.getDate(),
      inMonth: date.getMonth() === month,
    };
  });
}

function cleanReviewRiderName(value?: string) {
  const cleaned = (value ?? "")
    .replace(/\s*お気に入り選手\s*(?:-->|→|＞|->)?\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || "選手名未取得";
}

function getResultOrder(record?: PredictionResultRecord, feedRace?: PredictionRaceItem) {
  if (record?.resultOrder) return record.resultOrder;
  const finish = feedRace?.result?.finishOrder?.filter(Boolean) ?? [];
  if (finish.length >= 3) return finish.slice(0, 3).join("-");
  const top3 = feedRace?.resultTop3?.map((item) => item.carNo).filter(Boolean) ?? [];
  if (top3.length >= 3) return top3.slice(0, 3).join("-");
  return "--";
}

function getKimarite(record?: PredictionResultRecord, feedRace?: PredictionRaceItem) {
  const memoKimarite = record?.memo?.match(/決まり手[:：]\s*([^\n]+)/)?.[1]?.trim();
  return memoKimarite || feedRace?.result?.kimarite || feedRace?.resultTop3?.[0]?.kimarite || "接続待ち";
}

function getSecondKimarite(feedRace?: PredictionRaceItem) {
  return feedRace?.result?.secondKimarite || feedRace?.resultTop3?.[1]?.kimarite || "";
}

function getSBMarkText(feedRace?: PredictionRaceItem) {
  const entries = feedRace?.resultTop3 ?? [];
  const sEntry = entries.find((item) => item.sMark);
  const hEntry = entries.find((item) => item.hMark);
  const bEntry = entries.find((item) => item.bMark);
  const parts: string[] = [];

  if (sEntry) parts.push(`S: ${sEntry.carNo}${sEntry.name ? " " + cleanReviewRiderName(sEntry.name) : ""}`);
  if (hEntry) parts.push(`H: ${hEntry.carNo}${hEntry.name ? " " + cleanReviewRiderName(hEntry.name) : ""}`);
  if (bEntry) parts.push(`B: ${bEntry.carNo}${bEntry.name ? " " + cleanReviewRiderName(bEntry.name) : ""}`);

  return parts.join(" / ");
}

function formatReviewPayoutItem(item?: PredictionRaceResultPayoutItem | null) {
  if (!item) return "";
  const combination = item.combination ?? "--";
  const payout = item.payout ?? "--";
  const popularity = item.popularity ? ` / ${item.popularity}` : "";
  return `${combination} ${payout}${popularity}`;
}

function buildReviewPayoutLines(feedRace?: PredictionRaceItem) {
  const result = feedRace?.result;
  const lines: string[] = [];

  if (result?.payout2tan) {
    lines.push(`2車単: ${formatReviewPayoutItem(result.payout2tan)}`);
  }

  if (result?.payout2fuku?.length) {
    lines.push(`2車複: ${result.payout2fuku.map(formatReviewPayoutItem).filter(Boolean).join(" / ")}`);
  }

  if (result?.payout3tan) {
    lines.push(`3連単: ${formatReviewPayoutItem(result.payout3tan)}`);
  }

  if (result?.payout3fuku) {
    lines.push(`3連複: ${formatReviewPayoutItem(result.payout3fuku)}`);
  }

  if (result?.payoutWide?.length) {
    lines.push(`ワイド: ${result.payoutWide.map(formatReviewPayoutItem).filter(Boolean).join(" / ")}`);
  }

  if (lines.length === 0 && feedRace?.payouts?.length) {
    feedRace.payouts.forEach((item) => {
      lines.push(`${item.betType ?? "払戻"}: ${formatReviewPayoutItem(item)}`);
    });
  }

  return lines.length > 0 ? lines : ["払戻情報なし"];
}

function buildReviewFullResultLines(feedRace?: PredictionRaceItem) {
  const entries = feedRace?.resultTop3 ?? [];
  if (entries.length === 0) return ["全着順: 接続待ち"];

  return entries.map((entry) => {
    const marks = [
      entry.sMark ? "S" : "",
      entry.hMark ? "H" : "",
      entry.bMark ? "B" : "",
    ].filter(Boolean);

    const markText = marks.length > 0 ? ` ${marks.join("")}` : "";
    const place = entry.place ? `${entry.place}着` : "着順不明";
    const carNo = entry.carNo ?? "--";
    const name = cleanReviewRiderName(entry.name);
    const agari = entry.agari ? ` / 上がり ${entry.agari}` : "";
    const margin = entry.margin ? ` / ${entry.margin}` : "";
    const kimarite = entry.kimarite ? ` / 決まり手 ${entry.kimarite}` : "";

    return `${place}: ${carNo}${markText} ${name}${agari}${margin}${kimarite}`;
  });
}

function buildReviewWeatherLines(
  feedRace?: PredictionRaceItem,
  record?: PredictionResultRecord,
  fallbackWeatherActual?: PredictionRaceResultWeatherActual,
) {
  const weatherActual =
    record?.weatherActual ??
    feedRace?.result?.weatherActual ??
    fallbackWeatherActual;

  if (weatherActual) {
    return [
      `天候: ${weatherActual.weather ?? "--"}`,
      `風向: ${weatherActual.windDirection ?? "--"}`,
      `風速: ${weatherActual.windSpeed ?? "--"}`,
      `気温: ${weatherActual.temperature ?? "--"}`,
    ];
  }

  return [`実天気/実風: ${getResultWeatherText(record)}`];
}

function buildReviewFinalOddsLines(feedRace?: PredictionRaceItem) {
  const odds = feedRace?.oddsPreview ?? [];
  if (odds.length === 0) return ["最終オッズ参考: 接続待ち"];

  return [
    "最終オッズ参考:",
    ...odds.slice(0, 10).map((item, index) => {
      const tag = item.tag ? ` / ${item.tag}` : "";
      return `${String(index + 1).padStart(2, "0")}. ${item.combo} ${item.odds}${tag}`;
    }),
  ];
}

function getResultWeatherText(record?: PredictionResultRecord) {
  const memo = record?.memo ?? "";
  const weather = memo.match(/(?:実天気|天気)[:：]\s*([^\n]+)/)?.[1]?.trim();
  const wind = memo.match(/(?:実風|風)[:：]\s*([^\n]+)/)?.[1]?.trim();
  if (!weather && !wind) return "接続待ち";
  return [weather, wind].filter(Boolean).join(" / ");
}

function sortRaces(a: VenueReviewRace, b: VenueReviewRace) {
  return a.raceNumber - b.raceNumber;
}

function buildVenueGroups(
  date: string,
  slotMap: Record<string, PredictionSlotRecord>,
  resultMap: Record<string, PredictionResultRecord>,
  feed: PredictionTodayFeed | null,
  raceResultSnapshotMap: ReviewRaceResultSnapshotMap,
): VenueReviewGroup[] {
  const slots = Object.values(slotMap).filter((item) => item.date === date && item.predictionText?.trim());
  const feedVenueMap = new Map((feed?.venues ?? []).map((venue) => [normalizeVenueName(venue.venue), venue]));
  const resultValues = Object.values(resultMap).filter((item) => item.date === date);
  const groups = new Map<string, VenueReviewGroup>();

  for (const slot of slots) {
    const key = normalizeVenueName(slot.venue);
    const feedVenue = feedVenueMap.get(key);
    const liveFeedRace = feedVenue?.races?.find((item) => item.raceNo === slot.raceNumber);
    const snapshotKey = buildReviewRaceResultSnapshotKey(date, slot.venue, slot.raceNumber);
    const snapshotRace = raceResultSnapshotMap[snapshotKey];
    const feedRace = mergeReviewRaceWithSnapshot(liveFeedRace, snapshotRace);
    const matchedResults = resultValues
      .filter((item) => normalizeVenueName(item.venue) === key && item.raceNumber === slot.raceNumber)
      .sort((a, b) => (b.savedAt ?? "").localeCompare(a.savedAt ?? ""));
    const resultRecord = matchedResults[0];

    const feedVenueSession = resolveReviewVenueSession(
  feedVenue?.session,
  feedVenue?.races?.map((race) => race.time) ?? [],
);

const current = groups.get(key) ?? {
  venue: slot.venue,
  date: slot.date,
  races: [],
  grade: feedVenue?.grade,
  session: feedVenueSession,
  title: feedVenue?.title,
  totalInvestment: 0,
  totalPayout: 0,
  settledCount: 0,
  hitCount: 0,
};

    current.races.push({
      venue: slot.venue,
      date: slot.date,
      raceNumber: slot.raceNumber,
      raceKey: slot.raceKey,
      predictionText: slot.predictionText,
      savedAt: slot.savedAt,
      predictionSummary: extractPredictionSummary(slot.predictionText),
      feedRace,
      resultRecord,
    });

    current.totalInvestment += resultRecord?.investment ?? 0;
    current.totalPayout += resultRecord?.payout ?? 0;
    if (resultRecord?.hitStatus === "hit" || resultRecord?.hitStatus === "miss") {
      current.settledCount += 1;
      if (resultRecord.hitStatus === "hit") current.hitCount += 1;
    }
    if (!current.grade && feedVenue?.grade) current.grade = feedVenue.grade;

const resolvedCurrentSession = resolveReviewVenueSession(
  current.session ?? feedVenue?.session,
  current.races.map((race) => race.feedRace?.time),
);

if (resolvedCurrentSession) current.session = resolvedCurrentSession;

if (!current.title && feedVenue?.title) current.title = feedVenue.title;
groups.set(key, current);
  }

  return Array.from(groups.values())
    .map((group) => ({ ...group, races: [...group.races].sort(sortRaces) }))
    .sort((a, b) => a.venue.localeCompare(b.venue, "ja"));
}

function buildPredictionCopy(group: VenueReviewGroup) {
  const lines = [`${group.venue}｜${formatDateLabel(group.date)}｜予想まとめ`];
  lines.push("");
  group.races.forEach((race) => {
    lines.push(`■ ${group.venue} ${race.raceNumber}R`);
    lines.push(race.predictionText.trim());
    lines.push("");
  });
  return lines.join("\n").trim();
}

function buildResultCopy(group: VenueReviewGroup) {
  const lines = [`${group.venue}｜${formatDateLabel(group.date)}｜結果照合用`];
  lines.push("");

  const groupFallbackWeatherActual =
    group.races
      .map((race) => race.resultRecord?.weatherActual ?? race.feedRace?.result?.weatherActual)
      .find((weatherActual) => Boolean(weatherActual?.weather || weatherActual?.windDirection || weatherActual?.windSpeed || weatherActual?.temperature));

  group.races.forEach((race) => {
    const resultOrder = getResultOrder(race.resultRecord, race.feedRace);
    const hitStatus = race.resultRecord?.hitStatus ?? "保留";
    const investment = formatYen(race.resultRecord?.investment);
    const payout = formatYen(race.resultRecord?.payout);
    const profit = formatProfit(race.resultRecord?.profitLoss);
    const roi = formatRate(race.resultRecord?.roi);
    const kimarite = getKimarite(race.resultRecord, race.feedRace);
    const secondKimarite = getSecondKimarite(race.feedRace);
    const sbText = getSBMarkText(race.feedRace);

    lines.push(`■ ${group.venue} ${race.raceNumber}R`);
    lines.push(`レース名: ${race.feedRace?.title ?? group.title ?? "レース名未取得"}`);
    lines.push(`発走時刻: ${race.feedRace?.time ?? "--"}`);
    lines.push(`結果確定: ${race.feedRace?.result?.status ?? race.feedRace?.resultStatus ?? "接続待ち"}`);
    lines.push(`着順: ${resultOrder}`);
    lines.push(`3連単照合キー: ${resultOrder}`);
    lines.push(`最終判定: ${hitStatus}`);
    lines.push(`的中券種: ${race.resultRecord?.hitBetType ?? "--"}`);
    lines.push(`的中組み合わせ: ${race.resultRecord?.hitCombination ?? "--"}`);
    lines.push(`投資: ${investment}`);
    lines.push(`払戻: ${payout}`);
    lines.push(`収支: ${profit}`);
    lines.push(`回収率: ${roi}`);
    lines.push("");

    lines.push("【決まり手】");
    lines.push(`決まり手: ${kimarite}`);
    lines.push(`1着の決まり手: ${kimarite}`);
    lines.push(`2着決まり手: ${secondKimarite || "--"}`);
    lines.push(`SHB: ${sbText || "--"}`);
    lines.push("");

    lines.push("【WEATHER ACTUAL】");
    buildReviewWeatherLines(race.feedRace, race.resultRecord, groupFallbackWeatherActual).forEach((line) => lines.push(line));
    lines.push("");

    lines.push("【全着順】");
    buildReviewFullResultLines(race.feedRace).forEach((line) => lines.push(line));
    lines.push("");

    lines.push("【払戻】");
    buildReviewPayoutLines(race.feedRace).forEach((line) => lines.push(line));
    lines.push("");

    lines.push("【最終オッズ参考】");
    buildReviewFinalOddsLines(race.feedRace).forEach((line) => lines.push(line));
    lines.push("");

    if (race.resultRecord?.memo?.trim()) {
      lines.push("【結果メモ】");
      lines.push(race.resultRecord.memo.trim());
      lines.push("");
    }

    lines.push("----");
    lines.push("");
  });

  return lines.join("\n").trim();
}

async function copyText(value: string) {
  const text = value.trim();
  if (!text) throw new Error("empty-copy");
  await navigator.clipboard.writeText(text);
}

function downloadTextFile(filename: string, text: string) {
  if (typeof window === "undefined") return;

  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  window.URL.revokeObjectURL(url);
}

function buildReviewDownloadFileName(group: VenueReviewGroup, kind: "prediction" | "result") {
  const kindLabel = kind === "prediction" ? "prediction" : "result";
  const safeVenue = group.venue.replace(/[\\/:*?"<>|]/g, "");
  return `kurari-review-${group.date}-${safeVenue}-${kindLabel}.txt`;
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <article
      style={{
        borderRadius: "24px",
        border: "1px solid rgba(229, 221, 241, 0.95)",
        background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(249,245,253,0.96) 100%)",
        boxShadow: "0 16px 36px rgba(18, 24, 38, 0.05)",
        padding: "22px 22px 20px",
      }}
    >
      <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.18em", color: "#9b7cd8", marginBottom: "10px" }}>{label}</div>
      <div style={{ fontSize: "34px", fontWeight: 900, color: "#0f172a", marginBottom: "8px", lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: "12px", lineHeight: 1.7, color: "#6a7282" }}>{sub}</div>
    </article>
  );
}

function SummaryChip({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        borderRadius: "18px",
        border: "1px solid rgba(229, 221, 241, 0.92)",
        background: "rgba(255,255,255,0.82)",
        padding: "12px 14px",
      }}
    >
      <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.18em", color: "#9a7ad9", marginBottom: "6px" }}>{label}</div>
      <div style={{ fontSize: "14px", fontWeight: 800, color: "#111827", lineHeight: 1.6 }}>{value}</div>
    </div>
  );
}

function ReviewVenueMetric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div
      style={{
        borderRadius: "18px",
        border: "1px solid rgba(229, 221, 241, 0.9)",
        background: "rgba(255,255,255,0.88)",
        padding: "11px 10px",
        minHeight: "78px",
        overflow: "hidden",
      }}
    >
      <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.16em", color: "#9a7ad9", marginBottom: "7px" }}>{label}</div>
      <div
        style={{
          fontSize: "15px",
          fontWeight: 900,
          color: "#111827",
          lineHeight: 1.05,
          whiteSpace: "nowrap",
          letterSpacing: "-0.04em",
        }}
      >
        {value}
      </div>
      {sub ? <div style={{ marginTop: "6px", fontSize: "10px", lineHeight: 1.5, color: "#6d7687" }}>{sub}</div> : null}
    </div>
  );
}

export default function ReviewPage() {
  const [now, setNow] = useState(getJstNow());
  const [selectedDate, setSelectedDate] = useState(now.isoDate);
  const [slotMap, setSlotMap] = useState<Record<string, PredictionSlotRecord>>({});
  const [resultMap, setResultMap] = useState<Record<string, PredictionResultRecord>>({});
  const [reportRecords, setReportRecords] = useState<ReviewReportRecord[]>([]);
  const [todayFeed, setTodayFeed] = useState<PredictionTodayFeed | null>(null);
  const [raceResultSnapshotMap, setRaceResultSnapshotMap] = useState<ReviewRaceResultSnapshotMap>({});
  const [venueQuery, setVenueQuery] = useState("");
  const [playerQuery, setPlayerQuery] = useState("");
  const [keywordQuery, setKeywordQuery] = useState("");
  const [selectedVenueName, setSelectedVenueName] = useState("");
  const [reviewVenueTickerDuration, setReviewVenueTickerDuration] = useState(95);
  const [reportDraft, setReportDraft] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [reportStatus, setReportStatus] = useState("");

  useEffect(() => {
    const timer = window.setInterval(() => setNow(getJstNow()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setSlotMap(loadPredictionSlots());
    setResultMap(loadPredictionResults());
    setReportRecords(loadReviewReports());
    setRaceResultSnapshotMap(loadReviewRaceResultSnapshots());

    const handleStorage = () => {
  setSlotMap(loadPredictionSlots());
  setResultMap(loadPredictionResults());
  setReportRecords(loadReviewReports());
  setRaceResultSnapshotMap(loadReviewRaceResultSnapshots());
};

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

const handleReviewVenueTickerMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
  const rect = event.currentTarget.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const ratio = Math.max(0, Math.min(1, x / rect.width));

  const nextDuration = 58 + ratio * 42;

  setReviewVenueTickerDuration(Math.round(nextDuration));
};

const handleReviewVenueTickerMouseLeave = () => {
  setReviewVenueTickerDuration(95);
};

  useEffect(() => {
    let cancelled = false;
    fetch(PREDICTION_TODAY_DATA_URL, { cache: "no-cache" })
      .then((response) => {
        if (!response.ok) throw new Error(`review-feed-${response.status}`);
        return response.json() as Promise<PredictionTodayFeed>;
      })
      .then((feed) => {
        if (!cancelled) setTodayFeed(feed);
      })
      .catch(() => {
        if (!cancelled) setTodayFeed(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
  if (!todayFeed?.date || !todayFeed.venues?.length) return;

  setRaceResultSnapshotMap((current) => {
    const next: ReviewRaceResultSnapshotMap = { ...current };

    todayFeed.venues.forEach((venue) => {
      venue.races?.forEach((race) => {
        const hasUsefulResultData =
          Boolean(race.title) ||
          Boolean(race.time) ||
          Boolean(race.result) ||
          Boolean(race.resultTop3?.length) ||
          Boolean(race.payouts?.length) ||
          Boolean(race.oddsPreview?.length);

        if (!hasUsefulResultData) return;

        const key = buildReviewRaceResultSnapshotKey(todayFeed.date, venue.venue, race.raceNo);
        const existing = next[key];

        next[key] =
          mergeReviewRaceWithSnapshot(
            compactReviewRaceResultSnapshot(race),
            existing,
          ) ?? compactReviewRaceResultSnapshot(race);
      });
    });

    return saveReviewRaceResultSnapshots(next);
  });
}, [todayFeed]);

  useEffect(() => {
    if (!copyStatus) return;
    const timer = window.setTimeout(() => setCopyStatus(""), 1800);
    return () => window.clearTimeout(timer);
  }, [copyStatus]);

  useEffect(() => {
    if (!reportStatus) return;
    const timer = window.setTimeout(() => setReportStatus(""), 2200);
    return () => window.clearTimeout(timer);
  }, [reportStatus]);

  const monthCells = useMemo(() => buildMonthMatrix(selectedDate), [selectedDate]);
  const venueGroups = useMemo(
  () =>
    buildVenueGroups(
      selectedDate,
      slotMap,
      resultMap,
      todayFeed && todayFeed.date === selectedDate ? todayFeed : null,
      raceResultSnapshotMap,
    ),
  [selectedDate, slotMap, resultMap, todayFeed, raceResultSnapshotMap],
);

  const filteredVenueGroups = useMemo(() => {
    const venueNeedle = venueQuery.trim();
    const playerNeedle = playerQuery.trim();
    const keywordNeedle = keywordQuery.trim();

    return venueGroups.filter((group) => {
      if (venueNeedle && !group.venue.includes(venueNeedle)) return false;
      const joinedPrediction = group.races.map((race) => race.predictionText).join("\n");
      const joinedResultMemo = group.races.map((race) => race.resultRecord?.memo ?? "").join("\n");
      const haystack = `${group.venue}\n${group.title ?? ""}\n${joinedPrediction}\n${joinedResultMemo}`;
      if (playerNeedle && !haystack.includes(playerNeedle)) return false;
      if (keywordNeedle && !haystack.includes(keywordNeedle)) return false;
      return true;
    });
  }, [keywordQuery, playerQuery, venueGroups, venueQuery]);

  useEffect(() => {
    if (filteredVenueGroups.length === 0) {
      setSelectedVenueName("");
      return;
    }
    if (!selectedVenueName || !filteredVenueGroups.some((group) => group.venue === selectedVenueName)) {
      setSelectedVenueName(filteredVenueGroups[0].venue);
    }
  }, [filteredVenueGroups, selectedVenueName]);

  const selectedVenueGroup = useMemo(
    () => filteredVenueGroups.find((group) => group.venue === selectedVenueName) ?? filteredVenueGroups[0] ?? null,
    [filteredVenueGroups, selectedVenueName],
  );

  const selectedPredictionCopy = useMemo(
    () => (selectedVenueGroup ? buildPredictionCopy(selectedVenueGroup) : ""),
    [selectedVenueGroup],
  );
  const selectedResultCopy = useMemo(
    () => (selectedVenueGroup ? buildResultCopy(selectedVenueGroup) : ""),
    [selectedVenueGroup],
  );

  const selectedReportRecord = useMemo(() => {
    if (!selectedVenueGroup) return null;
    return reportRecords.find((item) => item.date === selectedVenueGroup.date && item.venue === selectedVenueGroup.venue) ?? null;
  }, [reportRecords, selectedVenueGroup]);

  useEffect(() => {
    setReportDraft(selectedReportRecord?.reportText ?? "");
  }, [selectedReportRecord?.reportText, selectedVenueGroup?.venue, selectedVenueGroup?.date]);

  const todaySummary = useMemo(() => {
    const groups = venueGroups;
    const totalInvestment = groups.reduce((sum, group) => sum + group.totalInvestment, 0);
    const totalPayout = groups.reduce((sum, group) => sum + group.totalPayout, 0);
    const settledCount = groups.reduce((sum, group) => sum + group.settledCount, 0);
    const hitCount = groups.reduce((sum, group) => sum + group.hitCount, 0);
    const raceCount = groups.reduce((sum, group) => sum + group.races.length, 0);
    return {
      venueCount: groups.length,
      raceCount,
      totalInvestment,
      totalPayout,
      profitLoss: totalPayout - totalInvestment,
      roi: totalInvestment > 0 ? (totalPayout / totalInvestment) * 100 : undefined,
      hitRate: settledCount > 0 ? (hitCount / settledCount) * 100 : undefined,
    };
  }, [venueGroups]);

  const archiveItems = useMemo(() => {
    const venueNeedle = venueQuery.trim();
    const playerNeedle = playerQuery.trim();
    const keywordNeedle = keywordQuery.trim();
    return [...reportRecords]
      .sort((a, b) => `${b.date} ${b.savedAt}`.localeCompare(`${a.date} ${a.savedAt}`))
      .filter((item) => {
        if (venueNeedle && !item.venue.includes(venueNeedle)) return false;
        const haystack = `${item.venue}\n${item.date}\n${item.reportText}\n${item.predictionCopy}\n${item.resultCopy}`;
        if (playerNeedle && !haystack.includes(playerNeedle)) return false;
        if (keywordNeedle && !haystack.includes(keywordNeedle)) return false;
        return true;
      });
  }, [keywordQuery, playerQuery, reportRecords, venueQuery]);

const handleReportTextFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
  const file = event.currentTarget.files?.[0];
  event.currentTarget.value = "";

  if (!file) return;

  const isTextFile =
    file.type === "text/plain" ||
    file.name.toLowerCase().endsWith(".txt");

  if (!isTextFile) {
    setReportStatus("TXTファイルだけ読み込めます");
    return;
  }

  try {
    const text = await file.text();
    setReportDraft(text);
    setReportStatus(`${file.name} を読み込みました`);
  } catch {
    setReportStatus("TXTファイルを読み込めませんでした");
  }
};

  const saveCurrentReport = () => {
    if (!selectedVenueGroup) return;
    const nextRecord: ReviewReportRecord = {
      id: `${selectedVenueGroup.date}:${selectedVenueGroup.venue}`,
      date: selectedVenueGroup.date,
      venue: selectedVenueGroup.venue,
      reportText: reportDraft,
      savedAt: new Date().toISOString(),
      predictionCopy: selectedPredictionCopy,
      resultCopy: selectedResultCopy,
    };
    const next = [
      nextRecord,
      ...reportRecords.filter((item) => !(item.date === nextRecord.date && item.venue === nextRecord.venue)),
    ];
    setReportRecords(next);
    saveReviewReports(next);
    setReportStatus("保存しました");
  };

  const deleteCurrentReport = () => {
    if (!selectedVenueGroup) return;
    const next = reportRecords.filter((item) => !(item.date === selectedVenueGroup.date && item.venue === selectedVenueGroup.venue));
    setReportRecords(next);
    saveReviewReports(next);
    setReportDraft("");
    setReportStatus("削除しました");
  };

  const heroTone =
    venueColorMap[selectedVenueGroup?.venue ?? ""] ?? {
      border: "#d8c9f5",
      chip: "rgba(126, 91, 227, 0.12)",
      text: "#6a43c3",
      accent: "#7b5be3",
    };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #fffefe 0%, #fff6fb 46%, #f6fbff 100%)", color: "#111827" }}>
<SiteHeader activeKey="review" />


      <main style={{ width: "100%", maxWidth: PAGE_MAX_WIDTH, margin: "0 auto", padding: "18px 24px 96px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.12fr) minmax(320px, 440px)", gap: "22px", alignItems: "start", marginBottom: "22px" }}>
          <article
            style={{
              borderRadius: "36px",
              border: `1px solid ${heroTone.border}`,
              background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(250,247,253,0.98) 100%)",
              boxShadow: "0 24px 50px rgba(17,24,39,0.06)",
              padding: "34px 34px 30px",
            }}
          >
            <div style={{ fontSize: "11px", letterSpacing: "0.24em", fontWeight: 900, color: "#9a7ad9", marginBottom: "14px" }}>
              REVIEW ARCHIVE
            </div>
            <div
  style={{
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(260px, 360px) minmax(170px, 190px)",
    alignItems: "center",
    gap: "22px",
    marginBottom: "20px",
  }}
>
  <div style={{ minWidth: 0 }}>
    <h1 style={{ margin: 0, fontSize: "40px", lineHeight: 1.12, fontWeight: 900, color: "#111827", marginBottom: "14px" }}>
      予想と結果を、会場ごとに振り返る。
    </h1>
    <p style={{ margin: 0, maxWidth: "920px", fontSize: "15px", lineHeight: 1.95, color: "#5f6676" }}>
      次の予想に使える検索ベースに育てていくページ。
    </p>
  </div>

  <div
    aria-hidden="true"
    style={{
      position: "relative",
      minHeight: "190px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      alignSelf: "stretch",
      pointerEvents: "none",
      overflow: "visible",
    }}
  >
    <img
      src={toPublicPath("/review-page/review-page-hero-kurari-charigon-thinking.png")}
      alt=""
      style={{
        width: "min(380px, 100%)",
        maxHeight: "280px",
        objectFit: "contain",
        objectPosition: "center bottom",
        filter: "drop-shadow(0 18px 26px rgba(122, 103, 184, 0.12))",
        transform: "translate(-20px) translateY(-10px)",
      }}
    />
  </div>

  <div style={{ minWidth: "170px", borderRadius: "24px", border: `1px solid ${heroTone.border}`, background: heroTone.chip, padding: "16px 18px" }}>
    <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.16em", color: heroTone.text, marginBottom: "8px" }}>CURRENT</div>
    <div style={{ fontSize: "28px", fontWeight: 900, color: "#101828", lineHeight: 1.1 }}>{selectedVenueGroup?.venue ?? "未選択"}</div>
    <div style={{ fontSize: "12px", color: "#6c7687", marginTop: "8px", lineHeight: 1.7 }}>
      {selectedVenueGroup ? `${selectedVenueGroup.races.length}R / ${formatDateLabel(selectedVenueGroup.date)}` : "会場を選ぶと詳細が開きます"}
    </div>
  </div>
</div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "14px" }}>
              <StatCard label="TODAY VENUES" value={`${todaySummary.venueCount}会場`} sub="今日予想した会場数" />
              <StatCard label="TARGET RACES" value={`${todaySummary.raceCount}R`} sub="Reviewに取り込んだ予想レース数" />
              <StatCard label="PROFIT" value={formatProfit(todaySummary.profitLoss)} sub={`投資 ${formatYen(todaySummary.totalInvestment)} / 払戻 ${formatYen(todaySummary.totalPayout)}`} />
              <StatCard label="HIT RATE" value={formatRate(todaySummary.hitRate)} sub={`ROI ${formatRate(todaySummary.roi)} / レポート保存の起点`} />
            </div>
          </article>

          <article
            style={{
              borderRadius: "32px",
              border: "1px solid rgba(233, 223, 244, 0.95)",
              background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,245,252,0.98) 100%)",
              boxShadow: "0 18px 40px rgba(17,24,39,0.05)",
              padding: "24px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
              <div>
                <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.18em", color: "#9a7ad9", marginBottom: "8px" }}>MINI CALENDAR</div>
                <div style={{ fontSize: "26px", fontWeight: 900, color: "#101828" }}>{formatDateLabel(selectedDate)}</div>
              </div>
              <div style={{ fontSize: "12px", lineHeight: 1.7, color: "#6b7280", textAlign: "right" }}>
                <div>日付を切り替えて、</div>
                <div>その日の会場レビューを表示します。</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "8px", marginBottom: "18px" }}>
              {monthCells.map((cell) => {
                const active = cell.iso === selectedDate;
                const hasData = venueGroups.some((group) => group.date === cell.iso);
                return (
                  <button
                    key={cell.iso}
                    onClick={() => setSelectedDate(cell.iso)}
                    style={{
                      border: active ? "1px solid rgba(123,91,227,0.66)" : "1px solid rgba(228,220,241,0.9)",
                      background: active
                        ? "linear-gradient(180deg, rgba(123,91,227,0.14) 0%, rgba(123,91,227,0.08) 100%)"
                        : cell.inMonth
                        ? "rgba(255,255,255,0.92)"
                        : "rgba(247,244,250,0.8)",
                      borderRadius: "16px",
                      padding: "10px 0 8px",
                      cursor: "pointer",
                      boxShadow: active ? "0 12px 24px rgba(123,91,227,0.10)" : "none",
                    }}
                  >
                    <div style={{ fontSize: "10px", fontWeight: 900, color: active ? "#5f3bc1" : cell.inMonth ? "#111827" : "#a0a7b5" }}>{cell.day}</div>
                    <div style={{ marginTop: "5px", fontSize: "8px", fontWeight: 800, color: hasData ? "#7b5be3" : "#c6cbd6" }}>{hasData ? "REVIEW" : "—"}</div>
                  </button>
                );
              })}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "10px" }}>
              <SummaryChip label="開催日" value={formatDateLabel(selectedDate)} />
              <SummaryChip label="対象会場" value={`${filteredVenueGroups.length}会場`} />
              <SummaryChip label="保存済みレポート" value={`${archiveItems.filter((item) => item.date === selectedDate).length}件`} />
            </div>
          </article>
        </div>

        <section
          style={{
            borderRadius: "34px",
            border: "1px solid rgba(229,221,241,0.92)",
            background: "linear-gradient(180deg, rgba(252,249,255,0.96) 0%, rgba(246,249,255,0.96) 100%)",
            boxShadow: "0 24px 46px rgba(20, 28, 44, 0.05)",
            padding: "26px",
            marginBottom: "24px",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "20px", marginBottom: "18px" }}>
            <div>
              <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.18em", color: "#9a7ad9", marginBottom: "8px" }}>SEARCH & FILTER</div>
              <h2 style={{ margin: 0, fontSize: "30px", fontWeight: 900, color: "#101828" }}>日付・会場・選手でレビューを絞り込む</h2>
            </div>
            <div style={{ fontSize: "12px", color: "#6d7687", lineHeight: 1.7, textAlign: "right" }}>
              <div>Predictionの保存内容と結果の照合、</div>
              <div>GPTレポート保存までここで扱う想定です。</div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "14px" }}>
            <label style={{ display: "grid", gap: "8px" }}>
              <span style={{ fontSize: "11px", fontWeight: 900, letterSpacing: "0.14em", color: "#8f72ca" }}>会場検索</span>
              <input value={venueQuery} onChange={(event) => setVenueQuery(event.target.value)} placeholder="例：別府 / 熊本 / 豊橋" style={{ borderRadius: "18px", border: "1px solid rgba(224,216,238,0.92)", padding: "16px 18px", fontSize: "14px", outline: "none", background: "rgba(255,255,255,0.95)" }} />
            </label>
            <label style={{ display: "grid", gap: "8px" }}>
              <span style={{ fontSize: "11px", fontWeight: 900, letterSpacing: "0.14em", color: "#8f72ca" }}>選手検索</span>
              <input value={playerQuery} onChange={(event) => setPlayerQuery(event.target.value)} placeholder="例：荒川 / 中川 / 室井" style={{ borderRadius: "18px", border: "1px solid rgba(224,216,238,0.92)", padding: "16px 18px", fontSize: "14px", outline: "none", background: "rgba(255,255,255,0.95)" }} />
            </label>
            <label style={{ display: "grid", gap: "8px" }}>
              <span style={{ fontSize: "11px", fontWeight: 900, letterSpacing: "0.14em", color: "#8f72ca" }}>キーワード</span>
              <input value={keywordQuery} onChange={(event) => setKeywordQuery(event.target.value)} placeholder="例：差し / 横風 / 3着荒れ / ガールズ" style={{ borderRadius: "18px", border: "1px solid rgba(224,216,238,0.92)", padding: "16px 18px", fontSize: "14px", outline: "none", background: "rgba(255,255,255,0.95)" }} />
            </label>
          </div>
        </section>

        <section style={{ marginBottom: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "20px", marginBottom: "16px" }}>
            <div>
              <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.18em", color: "#9a7ad9", marginBottom: "8px" }}>VENUE REVIEW CARDS</div>
              <h2 style={{ margin: 0, fontSize: "30px", fontWeight: 900, color: "#101828" }}>今日予想した会場を、見やすいカードで振り返る</h2>
            </div>
            <div style={{ fontSize: "12px", color: "#6d7687", lineHeight: 1.7, textAlign: "right" }}>
              <div>会場を押すと、左のコピー素材と</div>
              <div>右のレポート保存欄が切り替わります。</div>
            </div>
          </div>

<>
  <style>{`
    @keyframes reviewVenueTickerScroll {
      0% {
        transform: translateX(0);
      }
      100% {
        transform: translateX(-50%);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .review-venue-ticker-track {
        animation: none;
      }
    }
  `}</style>

  {filteredVenueGroups.length === 0 ? (
    <div
      style={{
        borderRadius: "24px",
        border: "1px dashed rgba(220,211,237,0.96)",
        padding: "22px",
        background: "rgba(255,255,255,0.7)",
        color: "#6c7687",
        fontSize: "14px",
      }}
    >
      この日付にはまだ読み込める予想データがありません。
    </div>
  ) : (
    <div
  className="review-venue-ticker"
  onMouseMove={handleReviewVenueTickerMouseMove}
  onMouseLeave={handleReviewVenueTickerMouseLeave}
  style={{
    overflow: "hidden",
    borderRadius: "30px",
    padding: "2px 0 8px",
  }}
>
      <div
  className="review-venue-ticker-track"
  style={{
    display: "flex",
    gap: "14px",
    width: "max-content",
    willChange: "transform",
    animation: `reviewVenueTickerScroll ${reviewVenueTickerDuration}s linear infinite`,
  }}
>
        {[...filteredVenueGroups, ...filteredVenueGroups].map((group, index) => {
          const tone = venueColorMap[group.venue] ?? heroTone;
          const selected = selectedVenueGroup?.venue === group.venue;
          const profitLoss = group.totalPayout - group.totalInvestment;
          const hitRate = group.settledCount > 0 ? `${((group.hitCount / group.settledCount) * 100).toFixed(1)}%` : "--";
          const hitSub = group.settledCount > 0 ? `${group.hitCount}-${group.settledCount}` : "接続待ち";

          return (
            <button
              key={`${group.date}:${group.venue}:${index}`}
              onClick={() => setSelectedVenueName(group.venue)}
              style={{
                textAlign: "left",
                width: "360px",
                flex: "0 0 360px",
                borderRadius: "24px",
                border: `1px solid ${selected ? tone.border : "rgba(229,221,241,0.9)"}`,
                background: selected
                  ? `linear-gradient(180deg, ${tone.chip} 0%, rgba(255,255,255,0.99) 100%)`
                  : "linear-gradient(180deg, rgba(255,255,255,0.99) 0%, rgba(248,245,252,0.96) 100%)",
                boxShadow: selected ? "0 18px 34px rgba(17,24,39,0.08)" : "0 12px 28px rgba(17,24,39,0.05)",
                padding: "18px 18px 16px",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", marginBottom: "14px" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "11px", fontWeight: 900, letterSpacing: "0.16em", color: tone.text, marginBottom: "8px" }}>{formatDateShort(group.date)}</div>
                  <div style={{ fontSize: "22px", fontWeight: 900, color: "#111827", lineHeight: 1.08 }}>{group.venue}</div>
                  <div style={{ fontSize: "12px", color: "#6d7687", marginTop: "7px", lineHeight: 1.6 }}>{group.title ?? "Prediction保存データ読み込み"}</div>
                </div>

                <div style={{ display: "grid", gap: "8px", justifyItems: "end", flexShrink: 0 }}>
                  <span style={{ fontSize: "10px", fontWeight: 900, color: tone.text, background: tone.chip, border: `1px solid ${tone.border}`, padding: "6px 9px", borderRadius: "999px" }}>{group.grade ?? "--"}</span>
                  <span style={{ fontSize: "10px", fontWeight: 900, color: "#748092" }}>{sessionLabelMap[group.session ?? ""] ?? group.session ?? "接続待ち"}</span>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "10px" }}>
                <ReviewVenueMetric label="払戻" value={formatYen(group.totalPayout)} sub={group.settledCount > 0 ? "払い戻し合計" : "結果待ち"} />
                <ReviewVenueMetric label="収支" value={formatProfit(profitLoss)} sub={profitLoss >= 0 ? "プラス収支" : "マイナス収支"} />
                <ReviewVenueMetric label="的中率" value={hitRate} sub={hitSub} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  )}
</>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.16fr) minmax(380px, 0.84fr)", gap: "22px", alignItems: "start", marginBottom: "24px" }}>
          <article style={{ borderRadius: "32px", border: `1px solid ${heroTone.border}`, background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,245,252,0.98) 100%)", boxShadow: "0 20px 40px rgba(17,24,39,0.05)", padding: "26px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", marginBottom: "18px" }}>
              <div>
                <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.18em", color: "#9a7ad9", marginBottom: "8px" }}>COPY MATERIAL</div>
                <h2 style={{ margin: 0, fontSize: "30px", fontWeight: 900, color: "#101828" }}>会場ごとの GPT 連携素材</h2>
              </div>
              <div style={{ fontSize: "12px", color: "#6d7687", lineHeight: 1.7, textAlign: "right" }}>
                <div>左に予想まとめ、下に結果まとめ。</div>
                <div>コピーボタンですぐ GPT に渡せます。</div>
              </div>
            </div>

            {selectedVenueGroup ? (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px", marginBottom: "18px" }}>
                  <SummaryChip label="対象会場" value={`${selectedVenueGroup.venue} / ${formatDateShort(selectedVenueGroup.date)}`} />
                  <SummaryChip label="対象R数" value={`${selectedVenueGroup.races.length}R`} />
                  <SummaryChip label="レポート状態" value={selectedReportRecord ? "保存済み" : "未保存"} />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "16px" }}>
                  <div style={{ borderRadius: "24px", border: "1px solid rgba(229,221,241,0.95)", background: "rgba(255,255,255,0.92)", padding: "18px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                      <div>
                        <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.16em", color: "#9a7ad9", marginBottom: "8px" }}>PREDICTION COPY</div>
                        <div style={{ fontSize: "22px", fontWeight: 900, color: "#111827" }}>予想まとめをコピー</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
  <button
    onClick={() =>
      copyText(selectedPredictionCopy)
        .then(() => setCopyStatus("予想まとめをコピーしました"))
        .catch(() => setCopyStatus("コピーできませんでした"))
    }
    style={{
      border: "none",
      cursor: "pointer",
      borderRadius: "999px",
      padding: "12px 18px",
      background: "linear-gradient(135deg, #15233b 0%, #0a1330 100%)",
      color: "white",
      fontWeight: 900,
    }}
  >
    コピー
  </button>

  <button
    onClick={() => {
      if (!selectedVenueGroup) return;
      downloadTextFile(
        buildReviewDownloadFileName(selectedVenueGroup, "prediction"),
        selectedPredictionCopy
      );
      setCopyStatus("予想まとめTXTをダウンロードしました");
    }}
    style={{
      border: "1px solid rgba(122,96,194,0.24)",
      cursor: "pointer",
      borderRadius: "999px",
      padding: "12px 18px",
      background: "white",
      color: "#6542be",
      fontWeight: 900,
    }}
  >
    TXT
  </button>
</div>
                    </div>
                    <textarea value={selectedPredictionCopy} readOnly style={{ width: "100%", minHeight: "280px", resize: "vertical", borderRadius: "20px", border: "1px solid rgba(224,216,238,0.92)", padding: "18px", fontSize: "13px", lineHeight: 1.8, background: "#ffffff" }} />
                  </div>

                  <div style={{ borderRadius: "24px", border: "1px solid rgba(229,221,241,0.95)", background: "rgba(255,255,255,0.92)", padding: "18px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                      <div>
                        <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.16em", color: "#9a7ad9", marginBottom: "8px" }}>RESULT COPY</div>
                        <div style={{ fontSize: "22px", fontWeight: 900, color: "#111827" }}>結果まとめをコピー</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
  <button
    onClick={() =>
      copyText(selectedResultCopy)
        .then(() => setCopyStatus("結果まとめをコピーしました"))
        .catch(() => setCopyStatus("コピーできませんでした"))
    }
    style={{
      border: "1px solid rgba(122,96,194,0.24)",
      cursor: "pointer",
      borderRadius: "999px",
      padding: "12px 18px",
      background: "white",
      color: "#6542be",
      fontWeight: 900,
    }}
  >
    コピー
  </button>

  <button
    onClick={() => {
      if (!selectedVenueGroup) return;
      downloadTextFile(
        buildReviewDownloadFileName(selectedVenueGroup, "result"),
        selectedResultCopy
      );
      setCopyStatus("結果まとめTXTをダウンロードしました");
    }}
    style={{
      border: "none",
      cursor: "pointer",
      borderRadius: "999px",
      padding: "12px 18px",
      background: "linear-gradient(135deg, #15233b 0%, #0a1330 100%)",
      color: "white",
      fontWeight: 900,
    }}
  >
    TXT
  </button>
</div>
                    </div>
                    <textarea value={selectedResultCopy} readOnly style={{ width: "100%", minHeight: "300px", resize: "vertical", borderRadius: "20px", border: "1px solid rgba(224,216,238,0.92)", padding: "18px", fontSize: "13px", lineHeight: 1.8, background: "#ffffff" }} />
                  </div>
                </div>
              </>
            ) : (
              <div style={{ borderRadius: "24px", border: "1px dashed rgba(219,211,236,0.95)", padding: "22px", color: "#6d7687", background: "rgba(255,255,255,0.7)" }}>
                会場を選ぶとコピー素材が表示されます。
              </div>
            )}

            {copyStatus ? <div style={{ marginTop: "12px", fontSize: "13px", fontWeight: 800, color: heroTone.text }}>{copyStatus}</div> : null}
          </article>

          <article style={{ borderRadius: "32px", border: `1px solid ${heroTone.border}`, background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,245,252,0.98) 100%)", boxShadow: "0 20px 40px rgba(17,24,39,0.05)", padding: "26px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", marginBottom: "18px" }}>
              <div>
                <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.18em", color: "#9a7ad9", marginBottom: "8px" }}>GPT REVIEW</div>
                <h2 style={{ margin: 0, fontSize: "30px", fontWeight: 900, color: "#101828" }}>レポートを貼り付けて保存</h2>
              </div>
              <div style={{ fontSize: "12px", color: "#6d7687", lineHeight: 1.7, textAlign: "right" }}>
                <div>GPTに質問して返ってきた反省や</div>
                <div>次回活用メモを保存します。</div>
              </div>
            </div>

            {selectedVenueGroup ? (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px", marginBottom: "18px" }}>
                  <SummaryChip label="会場" value={selectedVenueGroup.venue} />
                  <SummaryChip label="日付" value={formatDateLabel(selectedVenueGroup.date)} />
                  <SummaryChip label="保存日時" value={selectedReportRecord?.savedAt ? new Date(selectedReportRecord.savedAt).toLocaleString("ja-JP") : "未保存"} />
                </div>
                
                <div
  style={{
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    flexWrap: "wrap",
    marginBottom: "12px",
  }}
>
  <div style={{ fontSize: "12px", color: "#6d7687", lineHeight: 1.7 }}>
    TXTファイルを読み込むか、下の欄に直接貼り付けて保存できます。
  </div>

  <label
    style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: "999px",
      border: "1px solid rgba(122,96,194,0.24)",
      background: "white",
      color: "#6542be",
      fontSize: "12px",
      fontWeight: 900,
      padding: "12px 18px",
      cursor: "pointer",
      boxShadow: "0 10px 20px rgba(17,24,39,0.04)",
    }}
  >
    TXTを読み込む
    <input
      type="file"
      accept=".txt,text/plain"
      onChange={handleReportTextFileUpload}
      style={{ display: "none" }}
    />
  </label>
</div>

                <textarea
                  value={reportDraft}
                  onChange={(event) => setReportDraft(event.target.value)}
                  placeholder="ここに GPT で作成した振り返りレポートを貼り付けます。会場傾向、当たりパターン、外した理由、次回への修正点などを丁寧に残してください。"
                  style={{
  width: "100%",
  minHeight: "420px",
  resize: "vertical",
  borderRadius: "22px",
  border: "1px solid rgba(224,216,238,0.92)",
  padding: "18px",
  fontSize: "13px",
  lineHeight: 1.8,
  background: "#ffffff",
  marginBottom: "16px",
  color: "#1f2937",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  whiteSpace: "pre-wrap",
}}
                />

                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                  <button onClick={saveCurrentReport} style={{ border: "none", cursor: "pointer", borderRadius: "999px", padding: "14px 22px", background: "linear-gradient(135deg, #7b5be3 0%, #5d79e8 100%)", color: "white", fontWeight: 900 }}>レポートを保存</button>
                  <button onClick={deleteCurrentReport} style={{ border: "1px solid rgba(122,96,194,0.24)", cursor: "pointer", borderRadius: "999px", padding: "14px 22px", background: "white", color: "#6542be", fontWeight: 900 }}>この会場のレポート削除</button>
                </div>
              </>
            ) : (
              <div style={{ borderRadius: "24px", border: "1px dashed rgba(219,211,236,0.95)", padding: "22px", color: "#6d7687", background: "rgba(255,255,255,0.7)" }}>
                会場を選ぶとレポート保存欄が使えます。
              </div>
            )}

            {reportStatus ? <div style={{ marginTop: "14px", fontSize: "13px", fontWeight: 800, color: heroTone.text }}>{reportStatus}</div> : null}
          </article>
        </section>

        <section style={{ borderRadius: "34px", border: "1px solid rgba(229,221,241,0.92)", background: "linear-gradient(180deg, rgba(252,249,255,0.96) 0%, rgba(246,249,255,0.96) 100%)", boxShadow: "0 24px 46px rgba(20, 28, 44, 0.05)", padding: "28px" }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "20px", marginBottom: "18px" }}>
            <div>
              <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.18em", color: "#9a7ad9", marginBottom: "8px" }}>ARCHIVE</div>
              <h2 style={{ margin: 0, fontSize: "30px", fontWeight: 900, color: "#101828" }}>保存済みレビューを見返す</h2>
            </div>
            <div style={{ fontSize: "12px", color: "#6d7687", lineHeight: 1.7, textAlign: "right" }}>
              <div>日付・会場・選手・キーワードで検索し、</div>
              <div>以前の振り返りを次の予想に使えるようにします。</div>
            </div>
          </div>

          <div style={{ display: "grid", gap: "14px" }}>
            {archiveItems.length === 0 ? (
              <div style={{ borderRadius: "24px", border: "1px dashed rgba(219,211,236,0.95)", padding: "22px", color: "#6d7687", background: "rgba(255,255,255,0.7)" }}>
                まだ保存済みレビューはありません。
              </div>
            ) : (
              archiveItems.map((item) => {
                const tone = venueColorMap[item.venue] ?? heroTone;
                return (
                  <article key={item.id} style={{ borderRadius: "26px", border: `1px solid ${tone.border}`, background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,245,252,0.98) 100%)", padding: "22px", boxShadow: "0 14px 28px rgba(17,24,39,0.05)" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", marginBottom: "12px" }}>
                      <div>
                        <div style={{ fontSize: "30px", fontWeight: 900, color: "#111827", lineHeight: 1.05 }}>{item.venue}</div>
                        <div style={{ marginTop: "8px", fontSize: "13px", color: "#6d7687" }}>{formatDateLabel(item.date)} / 保存 {new Date(item.savedAt).toLocaleString("ja-JP")}</div>
                      </div>
                      <span style={{ fontSize: "11px", fontWeight: 900, color: tone.text, background: tone.chip, border: `1px solid ${tone.border}`, padding: "6px 10px", borderRadius: "999px" }}>
                        REVIEW SAVED
                      </span>
                    </div>
                    <div
  style={{
    marginTop: "14px",
    borderRadius: "22px",
    border: "1px solid rgba(229,221,241,0.95)",
    background: "linear-gradient(180deg, #ffffff 0%, #fbf9fe 100%)",
    padding: "18px",
    maxHeight: "360px",
    overflowY: "auto",
    whiteSpace: "pre-wrap",
    fontSize: "13px",
    lineHeight: 1.85,
    color: "#374151",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8)",
  }}
>
  {item.reportText?.trim() || "レポート本文なし"}
</div>
                  </article>
                );
              })
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
