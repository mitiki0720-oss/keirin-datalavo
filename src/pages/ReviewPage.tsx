import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import {
  SiteHeader,
  findPayoutByBetType,
  fetchPredictionVenueWeather,
  getPredictionOddsUnavailableLabel,
  getPredictionVenueStageLabel,
  normalizeBetTypeLabel,
  resolvePredictionResultMetrics,
  resolveRacePayoutByBetType,
  type PredictionWeatherData,
} from "./PageImplementations";

type PredictionSlotRecord = {
  raceKey: string;
  raceId: string;
  venue: string;
  date: string;
  raceNumber: number;
  predictionText: string;
  savedAt: string;
};

type PredictionResultHitStatus = "hit" | "miss" | "pending";

type PredictionResultRecord = {
  raceKey: string;
  raceId: string;
  venue: string;
  date: string;
  raceNumber: number;
  resultOrder: string;
  autoHitStatus: PredictionResultHitStatus;
  manualHitStatus?: PredictionResultHitStatus;
  hitStatus: PredictionResultHitStatus;
  hitBetType?: "3連単" | "2車単";
  hitCombination?: string;
  investment?: number;
  payout?: number;
  profitLoss?: number;
  roi?: number;
  weatherActual?: PredictionRaceResultWeatherActual;
  memo: string;
  savedAt: string;
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
  precipitation?: string;
  fetchedAt?: string;
  referenceText?: string;
  source?: string;
};

type PredictionRaceFinishOrderItem = {
  rank: string;
  carNo: string;
  name: string;
  agari?: string;
  gap?: string;
  kimarite?: string;
  mark?: string;
  status?: string;
};

type PredictionRaceResult = {
  status?: "pending" | "confirmed";
  finishOrder?: Array<string | PredictionRaceFinishOrderItem>;
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

type PredictionOddsPreviewItem = {
  combo: string;
  odds: string;
  tag?: string;
};

type PredictionTrifectaItem = {
  combination: string;
  odds: number;
  popularity?: number;
  source?: string;
};

type PredictionRaceItem = {
  raceNo: number;
  time?: string;
  title?: string;
  lineup?: string;
  isGirls?: boolean;
  sourceNote?: string;
  resultNote?: string;
  oddsNote?: string;
  oddsPreview?: PredictionOddsPreviewItem[];
  oddsTrifecta?: PredictionTrifectaItem[];
  favoriteOdds?: number | null;
  favoriteCombination?: string;
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
  startDate?: string;
  endDate?: string;
  raceNos?: number[];
  races: PredictionRaceItem[];
};

type PredictionTodayFeed = {
  generatedAt?: string;
  date: string;
  venues: PredictionVenueItem[];
};

type ReviewRaceResultSnapshotMap = Record<string, PredictionRaceItem>;
type ReviewWeatherActualMap = Record<string, PredictionRaceResultWeatherActual>;

type ReviewReportRecord = {
  id: string;
  date: string;
  venue: string;
  reportText: string;
  savedAt: string;
  predictionCopy: string;
  resultCopy: string;
};

type ReviewFileIndexItem = {
  date: string;
  venue: string;
  predictionFile?: string;
  resultFile?: string;
  summaryFile?: string;
};

type ReviewFileIndex = {
  version: number;
  items: ReviewFileIndexItem[];
};

type ReviewFileVenueGroup = {
  date: string;
  venue: string;
  predictionFile?: string;
  resultFile?: string;
  summaryFile?: string;
  predictionText: string;
  resultText: string;
  summaryText: string;
};

type ReviewFileCardMetrics = {
  hitRate: string;
  hitSub: string;
  roi: string;
  roiSub: string;
  profit: string;
  profitSub: string;
  checkedCount: string;
  checkedSub: string;
  predictionReady: boolean;
  resultReady: boolean;
  summaryReady: boolean;
};

type MonthCell = {
  isoDate: string;
  dayNumber: number;
  inCurrentMonth: boolean;
  isSelected: boolean;
  isToday: boolean;
  isDisabled: boolean;
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
  startDate?: string;
  endDate?: string;
  totalInvestment: number;
  totalPayout: number;
  settledCount: number;
  hitCount: number;
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
const REVIEW_FILE_INDEX_URL = toPublicPath("/data/reviews/index.json");
const REVIEW_CALENDAR_WEEKDAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"];


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

const REVIEW_JST_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function getReviewJstDateTimeParts(base: Date = new Date()) {
  const parts = REVIEW_JST_DATE_TIME_FORMATTER.formatToParts(base);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
    isoDate: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

function shiftReviewIsoDateByDays(isoDate: string, days: number) {
  const base = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(base.getTime())) return isoDate;
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function getJstOperationalDate(base: Date = new Date()) {
  const parts = getReviewJstDateTimeParts(base);
  return Number(parts.hour) >= 6 ? parts.isoDate : shiftReviewIsoDateByDays(parts.isoDate, -1);
}

function getReviewLocalKeepFromDate() {
  return shiftReviewIsoDateByDays(getJstOperationalDate(), -1);
}

function shouldKeepRecentReviewDate(date?: string) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return true;
  return date >= getReviewLocalKeepFromDate();
}

function prunePredictionSlotsMap(map: Record<string, PredictionSlotRecord>) {
  let changed = false;

  const records = Object.entries(map).reduce<Record<string, PredictionSlotRecord>>((accumulator, [key, value]) => {
    if (!value || typeof value !== "object") {
      changed = true;
      return accumulator;
    }

    if (!shouldKeepRecentReviewDate(value.date)) {
      changed = true;
      return accumulator;
    }

    accumulator[key] = value;
    return accumulator;
  }, {});

  return { records, changed };
}

function prunePredictionResultsMap(map: Record<string, PredictionResultRecord>) {
  let changed = false;

  const records = Object.entries(map).reduce<Record<string, PredictionResultRecord>>((accumulator, [key, value]) => {
    if (!value || typeof value !== "object") {
      changed = true;
      return accumulator;
    }

    if (!shouldKeepRecentReviewDate(value.date)) {
      changed = true;
      return accumulator;
    }

    accumulator[key] = value;
    return accumulator;
  }, {});

  return { records, changed };
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

function formatMonthLabel(isoMonth: string) {
  if (!/^\d{4}-\d{2}$/.test(isoMonth)) return isoMonth;
  const date = new Date(`${isoMonth}-01T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return isoMonth;
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
  }).format(date);
}

function shiftReviewIsoMonth(isoMonth: string, months: number) {
  const base = new Date(`${isoMonth}-01T00:00:00Z`);
  if (Number.isNaN(base.getTime())) return isoMonth;
  base.setUTCMonth(base.getUTCMonth() + months);
  return base.toISOString().slice(0, 7);
}

function buildReviewMonthMatrix(isoMonth: string, selectedDate: string, todayDate: string) {
  const firstDayIso = `${isoMonth}-01`;
  const firstDay = new Date(`${firstDayIso}T00:00:00Z`);
  if (Number.isNaN(firstDay.getTime())) return [] as MonthCell[][];

  const startOffset = (firstDay.getUTCDay() + 6) % 7;
  const startIso = shiftReviewIsoDateByDays(firstDayIso, -startOffset);
  const cells = Array.from({ length: 42 }, (_, index) => {
    const isoDate = shiftReviewIsoDateByDays(startIso, index);
    return {
      isoDate,
      dayNumber: Number(isoDate.slice(8, 10)),
      inCurrentMonth: isoDate.startsWith(isoMonth),
      isSelected: isoDate === selectedDate,
      isToday: isoDate === todayDate,
      isDisabled: isoDate > todayDate,
    } satisfies MonthCell;
  });

  return Array.from({ length: 6 }, (_, rowIndex) => cells.slice(rowIndex * 7, rowIndex * 7 + 7));
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

function extractReviewSummaryValue(source: string, label: string) {
  const normalized = source.replace(/\*\*/g, "");
  const pattern = new RegExp(`${label}[:：]\\s*([^\n\r]+)`);
  const match = normalized.match(pattern);
  return match?.[1]?.trim() || undefined;
}

function extractReviewSummaryNumber(source: string, label: string) {
  const raw = extractReviewSummaryValue(source, label);
  if (!raw) return undefined;
  const match = raw.match(/-?[0-9,]+(?:\.[0-9]+)?/);
  if (!match) return undefined;
  const value = Number(match[0].replace(/,/g, ""));
  return Number.isFinite(value) ? value : undefined;
}

function extractReviewSummaryPercentage(source: string, label: string) {
  const raw = extractReviewSummaryValue(source, label);
  if (!raw) return undefined;
  const match = raw.match(/([0-9]+(?:\.[0-9]+)?)\s*%?/);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

function extractReviewHitRatePercentage(source: string) {
  const directValue = extractReviewSummaryPercentage(source, "的中率");
  if (directValue !== undefined) return directValue;
  const normalized = source.replace(/\*\*/g, "");
  const match = normalized.match(/3連単的中[:：][^\n\r]*?([0-9]+(?:\.[0-9]+)?)\s*%/);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

function buildReviewFileCardMetrics(group: ReviewFileVenueGroup): ReviewFileCardMetrics {
  const source = group.summaryText;
  const hitRateValue = extractReviewHitRatePercentage(source);
  const roiValue = extractReviewSummaryPercentage(source, "回収率");
  const checkedCount = extractReviewSummaryNumber(source, "照合数");
  const investment = extractReviewSummaryNumber(source, "投資");
    const payout =
      extractReviewSummaryNumber(source, "払戻") ??
      extractReviewSummaryNumber(source, "回収");
  const profit = extractReviewSummaryNumber(source, "収支") ?? (
    investment !== undefined && payout !== undefined
      ? payout - investment
      : undefined
  );

  return {
    hitRate: hitRateValue !== undefined ? `${hitRateValue.toFixed(1)}%` : "--",
    hitSub: hitRateValue !== undefined ? "summary" : "未登録",
    roi: roiValue !== undefined ? `${roiValue.toFixed(1)}%` : "--",
    roiSub: roiValue !== undefined ? "summary" : "未登録",
    profit: profit !== undefined ? formatProfit(profit) : "--",
    profitSub: profit !== undefined ? "summary" : "未登録",
    checkedCount: checkedCount !== undefined ? `${checkedCount}R` : "--",
    checkedSub: checkedCount !== undefined ? "照合レース数" : "まとめTXT未登録",
    predictionReady: Boolean(group.predictionFile),
    resultReady: Boolean(group.resultFile),
    summaryReady: Boolean(group.summaryFile && group.summaryText.trim()),
  };
}

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function getReviewFallbackSavedAt(date?: string, savedAt?: string) {
  if (savedAt) return savedAt;
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return `${date}T08:00:00+09:00`;
  }
  return new Date().toISOString();
}

function normalizeReviewPredictionSlotRecord(record: Partial<PredictionSlotRecord>): PredictionSlotRecord {
  const date = record.date ?? "";
  const venue = record.venue ?? "";
  const raceNumber =
    typeof record.raceNumber === "number" && Number.isFinite(record.raceNumber)
      ? record.raceNumber
      : Number(record.raceNumber ?? 0);

  return {
    raceKey: record.raceKey ?? `prediction-slot:${date}:${normalizeVenueName(venue)}:${raceNumber || 0}`,
    raceId: record.raceId ?? "",
    venue,
    date,
    raceNumber: Number.isFinite(raceNumber) ? raceNumber : 0,
    predictionText: record.predictionText ?? "",
    savedAt: getReviewFallbackSavedAt(date, record.savedAt),
  };
}

function normalizeReviewPredictionResultRecord(record: Partial<PredictionResultRecord>): PredictionResultRecord {
  const hitStatus = record.hitStatus ?? "pending";
  const raceNumber =
    typeof record.raceNumber === "number" && Number.isFinite(record.raceNumber)
      ? record.raceNumber
      : Number(record.raceNumber ?? 0);
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
    raceKey: record.raceKey ?? "",
    raceId: record.raceId ?? "",
    venue: record.venue ?? "",
    date: record.date ?? "",
    raceNumber: Number.isFinite(raceNumber) ? raceNumber : 0,
    resultOrder: record.resultOrder ?? "",
    autoHitStatus: record.autoHitStatus ?? "pending",
    hitStatus,
    memo: record.memo ?? "",
    savedAt: getReviewFallbackSavedAt(record.date, record.savedAt),
    investment: normalizedInvestment,
    payout: normalizedPayout,
    profitLoss,
    roi,
  };
}

function loadPredictionSlots() {
  if (typeof window === "undefined") return {} as Record<string, PredictionSlotRecord>;
  const parsed = safeJsonParse<Record<string, Partial<PredictionSlotRecord>>>(window.localStorage.getItem(PREDICTION_SLOT_STORAGE_KEY), {});
  const normalized = Object.fromEntries(
    Object.entries(parsed).map(([key, value]) => [
      key,
      normalizeReviewPredictionSlotRecord(value),
    ]),
  ) as Record<string, PredictionSlotRecord>;
  const { records, changed } = prunePredictionSlotsMap(normalized);
  if (changed) {
    try {
      window.localStorage.setItem(PREDICTION_SLOT_STORAGE_KEY, JSON.stringify(records));
    } catch {
      // localStorage write failure is non-fatal
    }
  }
  return records;
}

function loadPredictionResults() {
  if (typeof window === "undefined") return {} as Record<string, PredictionResultRecord>;
  const parsed = safeJsonParse<Record<string, Partial<PredictionResultRecord>>>(window.localStorage.getItem(PREDICTION_RESULT_STORAGE_KEY), {});
  const normalized = Object.fromEntries(
    Object.entries(parsed).map(([key, value]) => [key, normalizeReviewPredictionResultRecord(value)]),
  ) as Record<string, PredictionResultRecord>;
  const { records, changed } = prunePredictionResultsMap(normalized);
  if (changed) {
    try {
      window.localStorage.setItem(PREDICTION_RESULT_STORAGE_KEY, JSON.stringify(records));
    } catch {
      // localStorage write failure is non-fatal
    }
  }
  return records;
}

function loadReviewReports() {
  if (typeof window === "undefined") return [] as ReviewReportRecord[];
  const parsed = safeJsonParse<ReviewReportRecord[] | Record<string, ReviewReportRecord>>(window.localStorage.getItem(REVIEW_REPORT_STORAGE_KEY), []);
  const records = Array.isArray(parsed) ? parsed : Object.values(parsed ?? {});
  const activeRecords = records.filter((record) => shouldKeepRecentReviewDate(record.date));
  if (activeRecords.length !== records.length) {
    try {
      window.localStorage.setItem(REVIEW_REPORT_STORAGE_KEY, JSON.stringify(activeRecords));
    } catch {
      // localStorage write failure is non-fatal
    }
  }
  return activeRecords;
}

function normalizeReviewFileIndexItem(record: Partial<ReviewFileIndexItem>): ReviewFileIndexItem | null {
  const date = typeof record.date === "string" ? record.date : "";
  const venue = typeof record.venue === "string" ? record.venue : "";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !venue) return null;

  return {
    date,
    venue,
    predictionFile: typeof record.predictionFile === "string" ? record.predictionFile : undefined,
    resultFile: typeof record.resultFile === "string" ? record.resultFile : undefined,
    summaryFile: typeof record.summaryFile === "string" ? record.summaryFile : undefined,
  };
}

async function fetchReviewTextFile(path?: string) {
  if (!path) return "";

  try {
    const response = await fetch(toPublicPath(path), { cache: "no-cache" });
    if (!response.ok) return "";

    const contentType = response.headers.get("content-type") ?? "";
    const text = await response.text();
    const normalized = text.trim().toLowerCase();

    if (contentType.includes("text/html")) return "";
    if (normalized.startsWith("<!doctype html") || normalized.startsWith("<html")) return "";

    return text;
  } catch {
    return "";
  }
}

function saveReviewReports(records: ReviewReportRecord[]) {
  if (typeof window === "undefined") return;
  const activeRecords = records.filter((record) => shouldKeepRecentReviewDate(record.date));
  try {
    window.localStorage.setItem(REVIEW_REPORT_STORAGE_KEY, JSON.stringify(activeRecords));
  } catch {
    // localStorage write failure is non-fatal
  }
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
    sourceNote: race.sourceNote,
    resultNote: race.resultNote,
    oddsNote: race.oddsNote,
    oddsPreview: normalizeReviewOddsPreviewList(race.oddsPreview),
    oddsTrifecta: normalizeReviewTrifectaOddsList(race.oddsTrifecta),
    favoriteOdds: race.favoriteOdds,
    favoriteCombination: race.favoriteCombination,
    resultStatus: race.resultStatus,
    resultTop3: race.resultTop3,
    payouts: race.payouts,
    result: race.result,
  };
}

function loadReviewRaceResultSnapshots() {
  if (typeof window === "undefined") return {} as ReviewRaceResultSnapshotMap;

  const raw = safeJsonParse<ReviewRaceResultSnapshotMap>(
    window.localStorage.getItem(REVIEW_RACE_RESULT_SNAPSHOT_STORAGE_KEY),
    {},
  );

  const activeDate = getJstOperationalDate();
  const keepFromDate = shiftReviewIsoDateByDays(activeDate, -1);
  let changed = false;

  const records = Object.fromEntries(
    Object.entries(raw)
      .filter(([key]) => {
        const [snapshotDate] = key.split(":");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate)) return true;
        const keep = snapshotDate >= keepFromDate;
        if (!keep) changed = true;
        return keep;
      })
      .map(([key, race]) => [
        key,
        {
          ...race,
          oddsPreview: normalizeReviewOddsPreviewList(race.oddsPreview),
          oddsTrifecta: normalizeReviewTrifectaOddsList(race.oddsTrifecta),
        },
      ])
  ) as ReviewRaceResultSnapshotMap;

  if (changed) {
    try {
      window.localStorage.setItem(REVIEW_RACE_RESULT_SNAPSHOT_STORAGE_KEY, JSON.stringify(records));
    } catch {
      // localStorage write failure is non-fatal
    }
  }

  return records;
}

function saveReviewRaceResultSnapshots(records: ReviewRaceResultSnapshotMap) {
  if (typeof window === "undefined") return records;

  const activeDate = getJstOperationalDate();
  const keepFromDate = shiftReviewIsoDateByDays(activeDate, -1);

  const compactRecords = Object.fromEntries(
    Object.entries(records)
      .filter(([key]) => {
        const [snapshotDate] = key.split(":");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate)) return true;
        return snapshotDate >= keepFromDate;
      })
      .filter(([key, race]) => Boolean(key) && Boolean(race?.raceNo))
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, REVIEW_RACE_RESULT_SNAPSHOT_MAX_ITEMS),
  ) as ReviewRaceResultSnapshotMap;

  try {
    window.localStorage.setItem(REVIEW_RACE_RESULT_SNAPSHOT_STORAGE_KEY, JSON.stringify(compactRecords));
  } catch {
    // localStorage write failure is non-fatal
  }

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
    oddsPreview: pickReviewOddsPreview(feedRace, snapshotRace),
    oddsTrifecta: pickReviewTrifectaOdds(feedRace, snapshotRace),
    favoriteOdds: feedRace.favoriteOdds ?? snapshotRace.favoriteOdds,
    favoriteCombination: feedRace.favoriteCombination || snapshotRace.favoriteCombination,
    resultStatus: feedRace.resultStatus || snapshotRace.resultStatus,
    resultTop3: feedRace.resultTop3?.length ? feedRace.resultTop3 : snapshotRace.resultTop3,
    payouts: feedRace.payouts ?? snapshotRace.payouts,
    result: mergePredictionRaceResult(feedRace.result, snapshotRace.result),
    sourceNote: feedRace.sourceNote || snapshotRace.sourceNote,
    resultNote: feedRace.resultNote || snapshotRace.resultNote,
    oddsNote: feedRace.oddsNote || snapshotRace.oddsNote,
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

function cleanReviewRiderName(value?: string) {
  const cleaned = (value ?? "")
    .replace(/\s*お気に入り選手\s*(?:-->|→|＞|->)?\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || "選手名未取得";
}

function getResultOrder(record?: PredictionResultRecord, feedRace?: PredictionRaceItem) {
  if (record?.resultOrder) return record.resultOrder;
  const finish = (feedRace?.result?.finishOrder ?? [])
    .map((item) => typeof item === "string" ? item : item?.carNo)
    .filter(Boolean);
  if (finish.length >= 3) return finish.slice(0, 3).join("-");
  const top3 = feedRace?.resultTop3?.map((item) => item.carNo).filter(Boolean) ?? [];
  if (top3.length >= 3) return top3.slice(0, 3).join("-");
  return "--";
}

function getReviewFinishOrderRows(feedRace?: PredictionRaceItem) {
  const items = feedRace?.result?.finishOrder ?? [];
  const rows = items
    .map((item): PredictionRaceResultEntry | null => {
      if (!item || typeof item === "string") return null;
      return {
        place: item.rank || item.status || "",
        carNo: item.carNo,
        name: item.name,
        margin: item.gap,
        agari: item.agari,
        kimarite: item.kimarite,
        sMark: String(item.mark ?? "").includes("S"),
        hMark: String(item.mark ?? "").includes("H"),
        bMark: String(item.mark ?? "").includes("B"),
      };
    })
    .filter((item): item is PredictionRaceResultEntry => item !== null);

  return rows.length > 0 ? rows : (feedRace?.resultTop3 ?? []);
}

function getKimarite(record?: PredictionResultRecord, feedRace?: PredictionRaceItem) {
  const memoKimarite = record?.memo?.match(/決まり手[:：]\s*([^\n]+)/)?.[1]?.trim();
  return memoKimarite || feedRace?.result?.kimarite || feedRace?.resultTop3?.[0]?.kimarite || "接続待ち";
}

function getSecondKimarite(feedRace?: PredictionRaceItem) {
  return feedRace?.result?.secondKimarite || feedRace?.resultTop3?.[1]?.kimarite || "";
}

function findReviewResultEntryByCarNo(feedRace: PredictionRaceItem | undefined, carNo?: string) {
  if (!carNo) return undefined;
  return (feedRace?.resultTop3 ?? []).find((entry) => entry.carNo === carNo);
}

function formatReviewLeaderMark(
  label: "S" | "H" | "B",
  carNo?: string,
  entry?: PredictionRaceResultEntry
) {
  if (!carNo) return "";

  const riderName = entry?.name ? ` ${cleanReviewRiderName(entry.name)}` : "";
  return `${label}: ${carNo}${riderName}`;
}

function getReviewLeaderCarNoFromEntries(
  entries: PredictionRaceResultEntry[],
  mark: "sMark" | "hMark" | "bMark"
) {
  return entries.find((entry) => entry[mark])?.carNo;
}

function getSBMarkText(feedRace?: PredictionRaceItem) {
  const entries = feedRace?.resultTop3 ?? [];

  const sLeaderCarNo =
    feedRace?.result?.sLeaderCarNo || getReviewLeaderCarNoFromEntries(entries, "sMark");
  const hLeaderCarNo =
    feedRace?.result?.hLeaderCarNo || getReviewLeaderCarNoFromEntries(entries, "hMark");
  const bLeaderCarNo =
    feedRace?.result?.bLeaderCarNo || getReviewLeaderCarNoFromEntries(entries, "bMark");

  const parts = [
    formatReviewLeaderMark("S", sLeaderCarNo, findReviewResultEntryByCarNo(feedRace, sLeaderCarNo)),
    formatReviewLeaderMark("H", hLeaderCarNo, findReviewResultEntryByCarNo(feedRace, hLeaderCarNo)),
    formatReviewLeaderMark("B", bLeaderCarNo, findReviewResultEntryByCarNo(feedRace, bLeaderCarNo)),
  ].filter(Boolean);

  return parts.join(" / ");
}

function formatReviewPayoutItem(item?: {
  combination?: string | null;
  payout?: string | null;
  popularity?: string | null;
} | null) {
  if (!item) return "";
  const combination = item.combination ?? "--";
  const payout = item.payout ?? "--";
  const popularity = item.popularity ? ` / ${item.popularity}` : "";
  return `${combination} ${payout}${popularity}`;
}

function dedupeReviewPayoutItems(items?: Array<{
  combination?: string | null;
  payout?: string | null;
  popularity?: string | null;
}> | null) {
  if (!Array.isArray(items) || items.length === 0) return [];

  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item?.combination ?? ""}|${item?.payout ?? ""}|${item?.popularity ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getReviewFullResultScopeNote(feedRace?: PredictionRaceItem) {
  return String(feedRace?.sourceNote ?? feedRace?.resultNote ?? "").includes("KDreamsでは3着まで")
    ? "注記: KDreamsでは3着まで"
    : "";
}

function decodeReviewHtmlEntities(value?: string) {
  const text = String(value ?? "");

  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#xFF5E;/gi, "〜")
    .replace(/&#xFFE5;/gi, "￥")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const codePoint = Number.parseInt(hex, 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : "";
    })
    .replace(/&#(\d+);/g, (_, decimal) => {
      const codePoint = Number.parseInt(decimal, 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : "";
    });
}

function cleanReviewOddsText(value?: string) {
  return decodeReviewHtmlEntities(value)
    .replace(/\s+/g, " ")
    .replace(/[▲△▼▽]/g, "")
    .replace(/^\s*[\d０-９]+[.)．、]\s*/, "")
    .trim();
}

function normalizeReviewOddsPreviewItem(
  item?: Partial<PredictionOddsPreviewItem> | null
): PredictionOddsPreviewItem | null {
  if (!item) return null;

  const combo = cleanReviewOddsText(item.combo);
  const odds = cleanReviewOddsText(item.odds);
  const tag = cleanReviewOddsText(item.tag);

  if (!combo || !odds) return null;

  const looksBroken =
    /&[#a-zA-Z0-9]+;/.test(`${combo} ${odds} ${tag}`) ||
    combo.length > 32 ||
    odds.length > 24;

  if (looksBroken) return null;

  const normalized: PredictionOddsPreviewItem = {
    combo,
    odds,
  };

  if (tag) {
    normalized.tag = tag;
  }

  return normalized;
}

function normalizeReviewOddsPreviewList(
  oddsPreview?: Array<Partial<PredictionOddsPreviewItem> | null>
): PredictionOddsPreviewItem[] {
  const seen = new Set<string>();
  const normalizedItems: PredictionOddsPreviewItem[] = [];

  (oddsPreview ?? []).forEach((rawItem) => {
    const item = normalizeReviewOddsPreviewItem(rawItem);
    if (!item) return;

    const key = `${item.combo}:${item.odds}:${item.tag ?? ""}`;
    if (seen.has(key)) return;

    seen.add(key);
    normalizedItems.push(item);
  });

  return normalizedItems.slice(0, 20);
}

function normalizeReviewPopularity(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }

  const text = String(value ?? "").replace(/[^\d]/g, "");
  if (!text) return undefined;

  const parsed = Number(text);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function normalizeReviewTrifectaOddsList(
  oddsTrifecta?: Array<Partial<PredictionTrifectaItem> | null>
): PredictionTrifectaItem[] {
  const seen = new Set<string>();

  return (oddsTrifecta ?? [])
    .map((item): PredictionTrifectaItem | null => {
      if (!item) return null;

      const combination = cleanReviewOddsText(item.combination).replace(/[>＞→]/g, "-");

      const odds =
        typeof item.odds === "number"
          ? item.odds
          : Number(String(item.odds ?? "").replace(/[^\d.]/g, ""));

      const popularity = normalizeReviewPopularity(item.popularity);

      if (!combination || !Number.isFinite(odds) || odds <= 0) {
        return null;
      }

      const key = `${combination}:${odds}`;
      if (seen.has(key)) return null;
      seen.add(key);

      const normalizedItem: PredictionTrifectaItem = {
        combination,
        odds,
      };

      if (popularity !== undefined) {
        normalizedItem.popularity = popularity;
      }

      const source = cleanReviewOddsText(item.source);
      if (source) {
        normalizedItem.source = source;
      }

      return normalizedItem;
    })
    .filter((item): item is PredictionTrifectaItem => item !== null)
    .sort((a, b) => {
      const popularityA = a.popularity ?? 9999;
      const popularityB = b.popularity ?? 9999;

      if (popularityA !== popularityB) {
        return popularityA - popularityB;
      }

      return a.odds - b.odds;
    })
    .slice(0, 120);
}

function pickReviewOddsPreview(
  feedRace?: PredictionRaceItem,
  snapshotRace?: PredictionRaceItem
): PredictionOddsPreviewItem[] {
  const feedOdds = normalizeReviewOddsPreviewList(feedRace?.oddsPreview);
  const snapshotOdds = normalizeReviewOddsPreviewList(snapshotRace?.oddsPreview);

  if (feedOdds.length > 0) return feedOdds;
  if (snapshotOdds.length > 0) return snapshotOdds;

  return [];
}

function pickReviewTrifectaOdds(
  feedRace?: PredictionRaceItem,
  snapshotRace?: PredictionRaceItem
): PredictionTrifectaItem[] {
  const feedOdds = normalizeReviewTrifectaOddsList(feedRace?.oddsTrifecta);
  const snapshotOdds = normalizeReviewTrifectaOddsList(snapshotRace?.oddsTrifecta);

  if (feedOdds.length > 0) return feedOdds;
  if (snapshotOdds.length > 0) return snapshotOdds;

  return [];
}

function buildReviewPayoutLines(feedRace?: PredictionRaceItem) {
  const result = feedRace?.result;
  const lines: string[] = [];
  const fallbackPayouts = feedRace?.payouts;
  const payoutWide = dedupeReviewPayoutItems(result?.payoutWide);

  const payout2tan = resolveRacePayoutByBetType(feedRace, "2車単");
  if (payout2tan) {
    lines.push(`2車単: ${formatReviewPayoutItem(payout2tan)}`);
  }

  if (result?.payout2fuku?.length) {
    lines.push(`2車複: ${result.payout2fuku.map(formatReviewPayoutItem).filter(Boolean).join(" / ")}`);
  }

  const payout3tan = resolveRacePayoutByBetType(feedRace, "3連単");
  if (payout3tan) {
    lines.push(`3連単: ${formatReviewPayoutItem(payout3tan)}`);
  }

  const payout3fuku = resolveRacePayoutByBetType(feedRace, "3連複");
  if (payout3fuku) {
    lines.push(`3連複: ${formatReviewPayoutItem(payout3fuku)}`);
  }

  if (payoutWide.length) {
    lines.push(`ワイド: ${payoutWide.map(formatReviewPayoutItem).filter(Boolean).join(" / ")}`);
  }

  if (lines.length === 0 && fallbackPayouts?.length) {
    fallbackPayouts.forEach((item) => {
      const label = normalizeBetTypeLabel(item.betType) || item.betType || "払戻";
      lines.push(`${label}: ${formatReviewPayoutItem(item)}`);
    });
  } else if (fallbackPayouts?.length) {
    fallbackPayouts.forEach((item) => {
      const normalizedBetType = normalizeBetTypeLabel(item.betType);
      if (!normalizedBetType) return;
      if (normalizedBetType === "2車単" || normalizedBetType === "3連単" || normalizedBetType === "3連複") return;
      const fallbackItem = findPayoutByBetType(fallbackPayouts, normalizedBetType);
      if (!fallbackItem) return;
      const label = normalizedBetType || item.betType || "払戻";
      const line = `${label}: ${formatReviewPayoutItem(fallbackItem)}`;
      if (!lines.includes(line)) lines.push(line);
    });
  }

  return lines.length > 0 ? lines : ["払戻情報なし"];
}

function buildReviewFullResultLines(feedRace?: PredictionRaceItem) {
  const entries = getReviewFinishOrderRows(feedRace);
  if (entries.length === 0) return ["全着順: 接続待ち"];

  const lines = entries.map((entry) => {
    const marks = [
     entry.sMark || feedRace?.result?.sLeaderCarNo === entry.carNo ? "S" : "",
     entry.hMark || feedRace?.result?.hLeaderCarNo === entry.carNo ? "H" : "",
     entry.bMark || feedRace?.result?.bLeaderCarNo === entry.carNo ? "B" : "",
     ].filter(Boolean);

    const markText = marks.length > 0 ? ` ${marks.join("")}` : "";
    const place = entry.place ? (/^\d+$/.test(entry.place) ? `${entry.place}着` : entry.place) : "着順不明";
    const carNo = entry.carNo ?? "--";
    const name = cleanReviewRiderName(entry.name);
    const agari = entry.agari ? ` / 上がり ${entry.agari}` : "";
    const margin = entry.margin ? ` / ${entry.margin}` : "";
    const kimarite = entry.kimarite ? ` / 決まり手 ${entry.kimarite}` : "";

    return `${place}: ${carNo}${markText} ${name}${agari}${margin}${kimarite}`;
  });

  const scopeNote = getReviewFullResultScopeNote(feedRace);
  if (scopeNote) lines.push(scopeNote);

  return lines;
}

function convertReviewWeatherToActual(weather: PredictionWeatherData): PredictionRaceResultWeatherActual {
  return {
    weather: weather.weatherLabel,
    windDirection: weather.windDirectionText,
    windSpeed: weather.windSpeedText,
    temperature: weather.temperatureText,
    precipitation: weather.precipitationText,
    fetchedAt: weather.updatedAtText,
    referenceText: weather.referenceText,
    source: "review-open-meteo",
  };
}

function hasReviewWeatherActual(
  weatherActual?: PredictionRaceResultWeatherActual | null,
): weatherActual is PredictionRaceResultWeatherActual {
  return Boolean(
    weatherActual?.weather ||
      weatherActual?.windDirection ||
      weatherActual?.windSpeed ||
      weatherActual?.temperature ||
      weatherActual?.precipitation ||
      weatherActual?.referenceText
  );
}

function formatReviewWeatherActualLines(weatherActual: PredictionRaceResultWeatherActual) {
  return [
    `天候: ${weatherActual.weather ?? "--"}`,
    `風向: ${weatherActual.windDirection ?? "--"}`,
    `風速: ${weatherActual.windSpeed ?? "--"}`,
    `気温: ${weatherActual.temperature ?? "--"}`,
    weatherActual.precipitation ? `降水: ${weatherActual.precipitation}` : "",
    weatherActual.referenceText ? `基準: ${weatherActual.referenceText}` : "",
  ].filter(Boolean);
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

  if (hasReviewWeatherActual(weatherActual)) {
    return formatReviewWeatherActualLines(weatherActual);
  }

  const memoWeatherText = getResultWeatherText(record);

  if (memoWeatherText && memoWeatherText !== "接続待ち") {
    return [`実天気/実風: ${memoWeatherText}`];
  }

  const resultStatus = feedRace?.result?.status ?? feedRace?.resultStatus;
  const finalizedAt = feedRace?.result?.finalizedAt;

  if (resultStatus === "confirmed") {
    return [
      "実天気/実風: 結果確定済み・天気スナップショット未保存",
      finalizedAt ? `確定時刻: ${finalizedAt}` : "",
    ].filter(Boolean);
  }

  return ["実天気/実風: 結果待ち / 天気取得待ち"];
}

function buildReviewFinalOddsLines(feedRace?: PredictionRaceItem) {
  const trifectaOdds = normalizeReviewTrifectaOddsList(feedRace?.oddsTrifecta);
  if (feedRace?.favoriteCombination && typeof feedRace.favoriteOdds === "number") {
    return [
      "最終オッズ参考",
      `3連単人気1: ${feedRace.favoriteCombination} ${feedRace.favoriteOdds.toFixed(1)}倍`,
    ];
  }

  const trifectaFavorite = trifectaOdds.find((item) => item.popularity === 1);

  if (trifectaFavorite) {
    return [
      "最終オッズ参考:",
      `3連単 1番人気: ${trifectaFavorite.combination}　${trifectaFavorite.odds.toFixed(1)}倍`,
    ];
  }

  if (!trifectaOdds.length) {
    return [
      "最終オッズ参考",
      getPredictionOddsUnavailableLabel(feedRace?.oddsNote),
    ];
  }

  const lowestOdds = [...trifectaOdds].sort((a, b) => a.odds - b.odds)[0];

  if (lowestOdds) {
    return [
      "最終オッズ参考:",
      "3連単 1番人気: 人気順位未取得",
      `参考（最低オッズ）: ${lowestOdds.combination}　${lowestOdds.odds.toFixed(1)}倍`,
    ];
  }

  return [
    "最終オッズ参考:",
    "3連単 1番人気: 保存なし",
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

function getReviewSessionSortOrder(session?: string) {
  const value = String(session ?? "");

  if (value === "morning" || value.includes("モーニング")) return 0;
  if (value === "day" || value.includes("デイ")) return 1;
  if (value === "night" || value.includes("ナイター")) return 2;
  if (value === "midnight" || value.includes("ミッドナイト")) return 3;

  return 9;
}

function getReviewGroupFirstRaceTimeMinutes(group: VenueReviewGroup) {
  const minutes = group.races
    .map((race) => parseReviewRaceTimeMinutes(race.feedRace?.time))
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);

  return minutes[0] ?? 9999;
}

function sortReviewVenueGroupsForCards(a: VenueReviewGroup, b: VenueReviewGroup) {
  const sessionDiff = getReviewSessionSortOrder(a.session) - getReviewSessionSortOrder(b.session);
  if (sessionDiff !== 0) return sessionDiff;

  const timeDiff = getReviewGroupFirstRaceTimeMinutes(a) - getReviewGroupFirstRaceTimeMinutes(b);
  if (timeDiff !== 0) return timeDiff;

  return a.venue.localeCompare(b.venue, "ja");
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
  startDate: feedVenue?.startDate,
  endDate: feedVenue?.endDate,
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

    const resolvedMetrics = resolvePredictionResultMetrics({
      record: resultRecord,
      race: feedRace,
      predictionText: slot.predictionText,
    });

    current.totalInvestment += resolvedMetrics.investment ?? 0;
    current.totalPayout += resolvedMetrics.payout ?? 0;
    if (resultRecord?.hitStatus === "hit" || resultRecord?.hitStatus === "miss") {
      current.settledCount += 1;
      if (resultRecord.hitStatus === "hit") current.hitCount += 1;
    }
    if (!current.startDate && feedVenue?.startDate) current.startDate = feedVenue.startDate;
    if (!current.endDate && feedVenue?.endDate) current.endDate = feedVenue.endDate;

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

function buildResultCopy(group: VenueReviewGroup, reviewWeatherActualMap: ReviewWeatherActualMap = {}) {
  const lines = [`${group.venue}｜${formatDateLabel(group.date)}｜結果照合用`];
  lines.push("");

  const groupFallbackWeatherActual =
    group.races
      .map((race) => {
        const key = buildReviewRaceResultSnapshotKey(race.date, race.venue, race.raceNumber);
        return (
          race.resultRecord?.weatherActual ??
          race.feedRace?.result?.weatherActual ??
          reviewWeatherActualMap[key]
        );
      })
      .find((weatherActual) => hasReviewWeatherActual(weatherActual));

  group.races.forEach((race) => {
    const resolvedMetrics = resolvePredictionResultMetrics({
      record: race.resultRecord,
      race: race.feedRace,
      predictionText: race.predictionText,
    });
    const resultOrder = getResultOrder(race.resultRecord, race.feedRace);
    const hitStatus = race.resultRecord?.hitStatus ?? "保留";
    const investment = formatYen(resolvedMetrics.investment);
    const payout = formatYen(resolvedMetrics.payout);
    const profit = formatProfit(resolvedMetrics.profitLoss);
    const roi = formatRate(resolvedMetrics.roi);
    const kimarite = getKimarite(race.resultRecord, race.feedRace);
    const secondKimarite = getSecondKimarite(race.feedRace);
    const sbText = getSBMarkText(race.feedRace);
    const raceWeatherKey = buildReviewRaceResultSnapshotKey(race.date, race.venue, race.raceNumber);
    const raceWeatherActual =
      race.resultRecord?.weatherActual ??
      race.feedRace?.result?.weatherActual ??
      reviewWeatherActualMap[raceWeatherKey];    

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
    buildReviewWeatherLines(
      race.feedRace,
      race.resultRecord,
      raceWeatherActual ?? groupFallbackWeatherActual
    ).forEach((line) => lines.push(line));
    lines.push("");

    lines.push("【全着順】");
    buildReviewFullResultLines(race.feedRace).forEach((line) => lines.push(line));
    lines.push("");

    lines.push("【払戻】");
    buildReviewPayoutLines(race.feedRace).forEach((line) => lines.push(line));
    lines.push("");

    lines.push("【最終オッズ参考】");
    lines.push("※レビュー保存時点で保持している3連単オッズスナップショットです。");
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

function buildReviewDownloadFileName(date: string, venue: string, kind: "prediction" | "result") {
  const kindLabel = kind === "prediction" ? "prediction" : "result";
  const safeVenue = venue.replace(/[\\/:*?"<>|]/g, "");
  return `kurari-review-${date}-${safeVenue}-${kindLabel}.txt`;
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <article
      style={{
        borderRadius: "22px",
        border: "1px solid rgba(223, 210, 245, 0.96)",
        background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(247,242,252,0.98) 100%)",
        boxShadow: "0 16px 34px rgba(40, 32, 76, 0.06)",
        padding: "13px 14px",
        minHeight: "96px",
      }}
    >
      <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.18em", color: "#9475d3", marginBottom: "6px" }}>{label}</div>
      <div style={{ fontSize: "24px", fontWeight: 900, color: "#0f172a", marginBottom: "4px", lineHeight: 1.06, letterSpacing: "-0.04em" }}>{value}</div>
      <div style={{ fontSize: "12px", lineHeight: 1.7, color: "#687385" }}>{sub}</div>
    </article>
  );
}

function SummaryChip({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        borderRadius: "18px",
        border: "1px solid rgba(226, 216, 242, 0.95)",
        background: "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(248,244,252,0.92) 100%)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.65)",
        padding: "10px 12px",
      }}
    >
      <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.18em", color: "#9a7ad9", marginBottom: "6px" }}>{label}</div>
      <div style={{ fontSize: "13px", fontWeight: 800, color: "#111827", lineHeight: 1.6 }}>{value}</div>
    </div>
  );
}

function ReviewVenueMetric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div
      style={{
        borderRadius: "18px",
        border: "1px solid rgba(225, 214, 242, 0.96)",
        background: "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(247,242,252,0.94) 100%)",
        boxShadow: "0 10px 24px rgba(27, 33, 52, 0.04)",
        padding: "12px 12px 11px",
        minHeight: "88px",
        overflow: "visible",
      }}
    >
      <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.16em", color: "#9a7ad9", marginBottom: "7px" }}>{label}</div>
      <div
        style={{
          fontSize: "18px",
          fontWeight: 900,
          color: "#111827",
          lineHeight: 1.08,
          letterSpacing: "-0.04em",
        }}
      >
        {value}
      </div>
      {sub ? <div style={{ marginTop: "7px", fontSize: "10px", lineHeight: 1.45, color: "#6d7687", whiteSpace: "nowrap" }}>{sub}</div> : null}
    </div>
  );
}

export default function ReviewPage() {
  const operationalToday = getJstOperationalDate();
  const yesterdayReviewDate = shiftReviewIsoDateByDays(operationalToday, -1);
  const [slotMap, setSlotMap] = useState<Record<string, PredictionSlotRecord>>({});
  const [resultMap, setResultMap] = useState<Record<string, PredictionResultRecord>>({});
  const [reportRecords, setReportRecords] = useState<ReviewReportRecord[]>([]);
  const [todayFeed, setTodayFeed] = useState<PredictionTodayFeed | null>(null);
  const [raceResultSnapshotMap, setRaceResultSnapshotMap] = useState<ReviewRaceResultSnapshotMap>({});
  const [reviewWeatherActualMap, setReviewWeatherActualMap] = useState<ReviewWeatherActualMap>({});
  const [reviewFileIndexItems, setReviewFileIndexItems] = useState<ReviewFileIndexItem[]>([]);
  const [reviewFileGroups, setReviewFileGroups] = useState<ReviewFileVenueGroup[]>([]);
  const [reviewFileLoadStatus, setReviewFileLoadStatus] = useState<"idle" | "loading" | "ready">("idle");
  const [venueQuery, setVenueQuery] = useState("");
  const [playerQuery, setPlayerQuery] = useState("");
  const [keywordQuery, setKeywordQuery] = useState("");
  const [selectedVenueName, setSelectedVenueName] = useState("");
  const [reportDraft, setReportDraft] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [reportStatus, setReportStatus] = useState("");
  const [selectedDate, setSelectedDate] = useState(operationalToday);
  const [calendarMonth, setCalendarMonth] = useState(operationalToday.slice(0, 7));
  const isTodaySelected = selectedDate === operationalToday;
  const isYesterdaySelected = selectedDate === yesterdayReviewDate;
  const isLocalReviewSelected = isTodaySelected || isYesterdaySelected;
  const reviewModeLabel = isTodaySelected ? "TODAY REVIEW" : isYesterdaySelected ? "YESTERDAY REVIEW" : "FILE REVIEW";
  const workbenchLabel = isTodaySelected ? "LIVE WORKBENCH" : isYesterdaySelected ? "YESTERDAY WORKBENCH" : "FILE ARCHIVE";

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
    let cancelled = false;

    fetch(REVIEW_FILE_INDEX_URL, { cache: "no-cache" })
      .then((response) => {
        if (!response.ok) throw new Error(`review-file-index-${response.status}`);
        return response.json() as Promise<ReviewFileIndex>;
      })
      .then((payload) => {
        if (cancelled) return;
        const items = Array.isArray(payload?.items)
          ? payload.items
              .map((item) => normalizeReviewFileIndexItem(item))
              .filter((item): item is ReviewFileIndexItem => item !== null)
              .sort((a, b) => `${a.date}:${a.venue}`.localeCompare(`${b.date}:${b.venue}`, "ja"))
          : [];
        setReviewFileIndexItems(items);
      })
      .catch(() => {
        if (!cancelled) setReviewFileIndexItems([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isTodaySelected) return;
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
          Boolean(race.oddsPreview?.length) ||
          Boolean(race.oddsTrifecta?.length);

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
}, [isTodaySelected, todayFeed]);

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

  useEffect(() => {
    if (isLocalReviewSelected) {
      setReviewFileGroups([]);
      setReviewFileLoadStatus("idle");
      return;
    }

    const targets = reviewFileIndexItems.filter((item) => item.date === selectedDate);

    if (targets.length === 0) {
      setReviewFileGroups([]);
      setReviewFileLoadStatus("ready");
      return;
    }

    let cancelled = false;
    setReviewFileLoadStatus("loading");

    Promise.all(
      targets.map(async (item) => ({
        ...item,
        predictionText: await fetchReviewTextFile(item.predictionFile),
        resultText: await fetchReviewTextFile(item.resultFile),
        summaryText: await fetchReviewTextFile(item.summaryFile),
      }))
    )
      .then((groups) => {
        if (cancelled) return;

        const visibleGroups = groups
          .filter((group) =>
            Boolean(
              group.predictionText.trim() ||
              group.resultText.trim() ||
              group.summaryText.trim()
            )
          )
          .sort((a, b) => a.venue.localeCompare(b.venue, "ja"));

        setReviewFileGroups(visibleGroups);
        setReviewFileLoadStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setReviewFileGroups([]);
        setReviewFileLoadStatus("ready");
      });

    return () => {
      cancelled = true;
    };
  }, [isLocalReviewSelected, reviewFileIndexItems, selectedDate]);

  useEffect(() => {
    if (venueGroups.length === 0) return;

    let cancelled = false;

    const targets = venueGroups.flatMap((group) =>
      group.races
        .map((race) => {
          const key = buildReviewRaceResultSnapshotKey(race.date, race.venue, race.raceNumber);
          const alreadyHasWeather =
            hasReviewWeatherActual(race.resultRecord?.weatherActual) ||
            hasReviewWeatherActual(race.feedRace?.result?.weatherActual) ||
            hasReviewWeatherActual(reviewWeatherActualMap[key]);

          if (alreadyHasWeather) return null;

          return {
            key,
            venue: race.venue,
            date: race.date,
            time: race.feedRace?.time,
          };
        })
        .filter(
          (item): item is {
            key: string;
            venue: string;
            date: string;
            time: string | undefined;
          } => item !== null
        )
    );

    if (targets.length === 0) return;

    Promise.allSettled(
      targets.map(async (target) => {
        const weather = await fetchPredictionVenueWeather(target.venue, {
          isoDate: target.date,
          raceTime: target.time,
        });

        return {
          key: target.key,
          weatherActual: convertReviewWeatherToActual(weather),
        };
      })
    ).then((results) => {
      if (cancelled) return;

      const fulfilled = results
        .filter(
          (
            result
          ): result is PromiseFulfilledResult<{
            key: string;
            weatherActual: PredictionRaceResultWeatherActual;
          }> => result.status === "fulfilled"
        )
        .map((result) => result.value);

      if (fulfilled.length === 0) return;

      setReviewWeatherActualMap((current) => {
        const next = { ...current };
        fulfilled.forEach((item) => {
          if (!hasReviewWeatherActual(next[item.key])) {
            next[item.key] = item.weatherActual;
          }
        });
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [reviewWeatherActualMap, venueGroups]);

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

  const filteredReviewFileGroups = useMemo(() => {
    const venueNeedle = venueQuery.trim();
    const playerNeedle = playerQuery.trim();
    const keywordNeedle = keywordQuery.trim();

    return reviewFileGroups.filter((group) => {
      if (venueNeedle && !group.venue.includes(venueNeedle)) return false;
      const haystack = `${group.venue}\n${group.predictionText}\n${group.resultText}`;
      if (playerNeedle && !haystack.includes(playerNeedle)) return false;
      if (keywordNeedle && !haystack.includes(keywordNeedle)) return false;
      return true;
    });
  }, [keywordQuery, playerQuery, reviewFileGroups, venueQuery]);

  const sortedVenueGroupsForCards = useMemo(
  () => [...filteredVenueGroups].sort(sortReviewVenueGroupsForCards),
  [filteredVenueGroups],
);

  useEffect(() => {
    const targetGroups = isLocalReviewSelected ? filteredVenueGroups.map((group) => group.venue) : filteredReviewFileGroups.map((group) => group.venue);

    if (targetGroups.length === 0) {
      setSelectedVenueName("");
      return;
    }
    if (!selectedVenueName || !targetGroups.includes(selectedVenueName)) {
      setSelectedVenueName(targetGroups[0]);
    }
  }, [filteredReviewFileGroups, filteredVenueGroups, isLocalReviewSelected, selectedVenueName]);

  const selectedVenueGroup = useMemo(
    () => filteredVenueGroups.find((group) => group.venue === selectedVenueName) ?? filteredVenueGroups[0] ?? null,
    [filteredVenueGroups, selectedVenueName],
  );

  const selectedReviewFileGroup = useMemo(
    () => filteredReviewFileGroups.find((group) => group.venue === selectedVenueName) ?? filteredReviewFileGroups[0] ?? null,
    [filteredReviewFileGroups, selectedVenueName],
  );

  const selectedDisplayVenueName = isLocalReviewSelected
    ? selectedVenueGroup?.venue
    : selectedReviewFileGroup?.venue;

  const selectedPredictionCopy = useMemo(
    () => {
      if (isLocalReviewSelected) return selectedVenueGroup ? buildPredictionCopy(selectedVenueGroup) : "";
      return selectedReviewFileGroup?.predictionText ?? "";
    },
    [isLocalReviewSelected, selectedReviewFileGroup, selectedVenueGroup],
  );
  const selectedResultCopy = useMemo(
    () => {
      if (isLocalReviewSelected) return selectedVenueGroup ? buildResultCopy(selectedVenueGroup, reviewWeatherActualMap) : "";
      return selectedReviewFileGroup?.resultText ?? "";
    },
    [isLocalReviewSelected, reviewWeatherActualMap, selectedReviewFileGroup, selectedVenueGroup],
  );

  const selectedReportRecord = useMemo(() => {
    if (!isLocalReviewSelected) return null;
    if (!selectedVenueGroup) return null;
    return reportRecords.find((item) => item.date === selectedVenueGroup.date && item.venue === selectedVenueGroup.venue) ?? null;
  }, [isLocalReviewSelected, reportRecords, selectedVenueGroup]);

  useEffect(() => {
    if (!isLocalReviewSelected) {
      setReportDraft("");
      return;
    }
    setReportDraft(selectedReportRecord?.reportText ?? "");
  }, [isLocalReviewSelected, selectedReportRecord?.reportText, selectedVenueGroup?.venue, selectedVenueGroup?.date]);

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
      hitCount,
      settledCount,
    };
  }, [venueGroups]);

  const reviewFileSummary = useMemo(() => {
    const fileCount = reviewFileGroups.reduce((sum, group) => {
      let count = sum;
      if (group.predictionFile) count += 1;
      if (group.resultFile) count += 1;
      if (group.summaryFile) count += 1;
      return count;
    }, 0);

    const loadedTextCount = reviewFileGroups.reduce((sum, group) => {
      let count = sum;
      if (group.predictionText.trim()) count += 1;
      if (group.resultText.trim()) count += 1;
      if (group.summaryText.trim()) count += 1;
      return count;
    }, 0);

    return {
      venueCount: reviewFileGroups.length,
      fileCount,
      loadedTextCount,
    };
  }, [reviewFileGroups]);

  const reviewFileDateSet = useMemo(
    () => new Set(reviewFileIndexItems.map((item) => item.date)),
    [reviewFileIndexItems],
  );

  const calendarWeeks = useMemo(
    () => buildReviewMonthMatrix(calendarMonth, selectedDate, operationalToday),
    [calendarMonth, operationalToday, selectedDate],
  );

  const nextCalendarMonth = shiftReviewIsoMonth(calendarMonth, 1);

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
    if (!isLocalReviewSelected) return;
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
    if (!isLocalReviewSelected) return;
    if (!selectedVenueGroup) return;
    const next = reportRecords
      .filter((item) => !(item.date === selectedVenueGroup.date && item.venue === selectedVenueGroup.venue));
    setReportRecords(next);
    saveReviewReports(next);
    setReportDraft("");
    setReportStatus("削除しました");
  };

  const heroTone =
    venueColorMap[selectedDisplayVenueName ?? ""] ?? {
      border: "#d8c9f5",
      chip: "rgba(126, 91, 227, 0.12)",
      text: "#6a43c3",
      accent: "#7b5be3",
    };

  const openTodayReview = () => {
    setSelectedDate(operationalToday);
    setCalendarMonth(operationalToday.slice(0, 7));
    setSelectedVenueName("");
  };

  const openYesterdayReview = () => {
    setSelectedDate(yesterdayReviewDate);
    setCalendarMonth(yesterdayReviewDate.slice(0, 7));
    setSelectedVenueName("");
  };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #fffefe 0%, #fff6fb 46%, #f6fbff 100%)", color: "#111827" }}>
<SiteHeader activeKey="review" />


      <main style={{ width: "100%", maxWidth: PAGE_MAX_WIDTH, margin: "0 auto", padding: "18px 24px 96px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.18fr) minmax(360px, 460px)", gap: "22px", alignItems: "stretch", marginBottom: "22px" }}>
          <article
            style={{
              borderRadius: "36px",
              border: `1px solid ${heroTone.border}`,
              background: "linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(252,246,252,0.98) 42%, rgba(243,247,255,0.98) 100%)",
              boxShadow: "0 28px 54px rgba(17,24,39,0.07)",
              padding: "28px 30px",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: "auto -80px -120px auto",
                width: "300px",
                height: "300px",
                borderRadius: "999px",
                background: "radial-gradient(circle, rgba(198,177,250,0.22) 0%, rgba(198,177,250,0) 72%)",
                pointerEvents: "none",
              }}
            />
            <div style={{ fontSize: "11px", letterSpacing: "0.24em", fontWeight: 900, color: "#9a7ad9", marginBottom: "14px" }}>
              {reviewModeLabel}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(360px, 0.95fr) minmax(420px, 1.05fr)",
                alignItems: "stretch",
                gap: "24px",
                marginBottom: "6px",
                position: "relative",
              }}
            >
              <div style={{ minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "flex-start", gap: "16px", paddingTop: "4px" }}>
                <div>
                  <h1 style={{ margin: 0, fontSize: "40px", lineHeight: 1.08, fontWeight: 900, color: "#111827", marginBottom: "16px", letterSpacing: "-0.05em" }}>
                    {workbenchLabel}
                  </h1>
                  <p style={{ margin: 0, maxWidth: "560px", fontSize: "15px", lineHeight: 1.95, color: "#5f6676" }}>
                    {isTodaySelected
                      ? "今日予想した会場を、見やすいカードで振り返る"
                      : isYesterdaySelected
                        ? "昨日予想した会場を、朝に振り返る"
                        : "保存ファイルがある会場を、見やすいカードで振り返る"}
                  </p>
                </div>

                <div style={{ display: "grid", gap: "12px" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                    <span style={{ borderRadius: "999px", border: "1px solid rgba(231, 220, 242, 0.95)", background: "rgba(255,255,255,0.82)", color: "#6f5bb0", padding: "8px 12px", fontSize: "11px", fontWeight: 900, letterSpacing: "0.12em" }}>
                      {isTodaySelected ? "TODAY MODE" : isYesterdaySelected ? "YESTERDAY MODE" : "FILE MODE"}
                    </span>
                    <span style={{ borderRadius: "999px", border: `1px solid ${heroTone.border}`, background: heroTone.chip, color: heroTone.text, padding: "8px 12px", fontSize: "11px", fontWeight: 900, letterSpacing: "0.12em" }}>
                      {isTodaySelected ? "LOCAL STORAGE + TODAY FEED" : isYesterdaySelected ? "LOCAL STORAGE + SNAPSHOT" : "INDEX JSON + TXT + SUMMARY"}
                    </span>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px", marginTop: "260px" }}>
                  <StatCard label="OPERATION DAY" value={formatDateShort(selectedDate)} sub={isTodaySelected ? "本日のレビュー対象日" : isYesterdaySelected ? "昨日のレビュー対象日" : "表示中の保存レビュー日付"} />
                  <StatCard label="TARGETS" value={isLocalReviewSelected ? `${todaySummary.venueCount}会場 / ${todaySummary.raceCount}R` : `${reviewFileSummary.venueCount}会場`} sub={isTodaySelected ? "当日保存済み予想から作業台を構成" : isYesterdaySelected ? "昨日保存済み予想から作業台を構成" : "index.json に登録された会場ファイルを表示"} />
                  <StatCard label="FILE STATUS" value={isLocalReviewSelected ? `${todaySummary.hitCount}的中 / ${todaySummary.settledCount}照合` : `${reviewFileSummary.loadedTextCount}件読込`} sub={isLocalReviewSelected ? `レポート一時保存 ${reportRecords.length}件` : `登録ファイル ${reviewFileSummary.fileCount}件`} />
                  <StatCard label="MODE" value={isLocalReviewSelected ? "LOCAL / SNAPSHOT" : "TXT / FETCH"} sub={isTodaySelected ? "当日レビューは localStorage と today.generated.json を利用" : isYesterdaySelected ? "昨日レビューは localStorage と snapshot を利用" : "過去レビューは localStorage に保存しません"} />
                </div>
              </div>

              <div
                style={{
                  borderRadius: "0px",
                  border: "none",
                  background: "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: "600px",
                  maxHeight: "600px",
                  padding: "0px",
                  minWidth: 0,
                  overflow: "visible",
                }}
              >
                <div
                  aria-hidden="true"
                  style={{
                    position: "relative",
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    borderRadius: "26px",
                    background: "radial-gradient(circle at 18% 18%, rgba(243, 232, 255, 0.95) 0%, rgba(248, 244, 252, 0.72) 38%, rgba(255,255,255,0) 72%), radial-gradient(circle at 82% 24%, rgba(255, 233, 241, 0.86) 0%, rgba(255,255,255,0) 54%), linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.02) 100%)",
                    pointerEvents: "none",
                  }}
                >
<img
  src={toPublicPath("/review-page/review-page-hero-kurari-charigon-thinking.png")}
  alt=""
  style={{
    width: "min(900px, 108%)",
    maxHeight: "500px",
    objectFit: "contain",
    objectPosition: "center bottom",
    filter: "drop-shadow(0 24px 28px rgba(122, 103, 184, 0.16))",
    transform: "translateY(10px)",
  }}
/>
                </div>
              </div>
            </div>
          </article>

          <article
            style={{
              borderRadius: "32px",
              border: "1px solid rgba(223, 209, 244, 0.98)",
              background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(247,242,252,0.98) 56%, rgba(255,248,250,0.98) 100%)",
              boxShadow: "0 24px 48px rgba(32, 30, 67, 0.06)",
              padding: "20px",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                top: "-48px",
                right: "-52px",
                width: "170px",
                height: "170px",
                borderRadius: "999px",
                background: "radial-gradient(circle, rgba(209,189,250,0.24) 0%, rgba(209,189,250,0) 74%)",
                pointerEvents: "none",
              }}
            />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
              <div>
                <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.18em", color: "#9a7ad9", marginBottom: "8px" }}>REVIEW CALENDAR</div>
                <div style={{ fontSize: "26px", fontWeight: 900, color: "#101828" }}>レビュー日付を選ぶ</div>
              </div>
              <div style={{ fontSize: "12px", lineHeight: 1.7, color: "#6b7280", textAlign: "right" }}>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "14px" }}>
              <button
                onClick={() => setCalendarMonth((current) => shiftReviewIsoMonth(current, -1))}
                style={{ border: "1px solid rgba(200, 184, 246, 0.82)", background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(246,240,252,0.98) 100%)", color: "#6542be", borderRadius: "999px", padding: "11px 16px", cursor: "pointer", fontWeight: 900, boxShadow: "0 10px 20px rgba(34, 33, 68, 0.05)" }}
              >
                前月
              </button>
              <div style={{ fontSize: "20px", fontWeight: 900, color: "#101828", letterSpacing: "-0.03em", padding: "0 12px", textAlign: "center" }}>{formatMonthLabel(calendarMonth)}</div>
              <button
                onClick={() => setCalendarMonth((current) => shiftReviewIsoMonth(current, 1))}
                disabled={nextCalendarMonth > operationalToday.slice(0, 7)}
                style={{ border: "1px solid rgba(200, 184, 246, 0.82)", background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(246,240,252,0.98) 100%)", color: nextCalendarMonth > operationalToday.slice(0, 7) ? "#b7b8c4" : "#6542be", borderRadius: "999px", padding: "11px 16px", cursor: nextCalendarMonth > operationalToday.slice(0, 7) ? "not-allowed" : "pointer", fontWeight: 900, boxShadow: "0 10px 20px rgba(34, 33, 68, 0.05)", opacity: nextCalendarMonth > operationalToday.slice(0, 7) ? 0.72 : 1 }}
              >
                次月
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "6px", marginBottom: "10px", padding: "0 4px" }}>
              {REVIEW_CALENDAR_WEEKDAY_LABELS.map((label) => (
                <div key={label} style={{ textAlign: "center", fontSize: "11px", fontWeight: 900, color: "#8f84ab", letterSpacing: "0.12em" }}>
                  {label}
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gap: "6px" }}>
              {calendarWeeks.map((week, weekIndex) => (
                <div key={`${calendarMonth}:${weekIndex}`} style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "6px" }}>
                  {week.map((cell) => (
                    (() => {
                      const hasReviewFiles = reviewFileDateSet.has(cell.isoDate);

                      return (
                        <button
                          key={cell.isoDate}
                          onClick={() => {
                            setSelectedDate(cell.isoDate);
                            setCalendarMonth(cell.isoDate.slice(0, 7));
                          }}
                          disabled={cell.isDisabled}
                          style={{
                            minHeight: "56px",
                            borderRadius: "18px",
                            border: cell.isSelected ? "1px solid rgba(123,91,227,0.96)" : cell.isToday ? "1px solid rgba(199, 182, 246, 0.96)" : "1px solid rgba(229,221,241,0.92)",
                            background: cell.isSelected
                              ? "linear-gradient(135deg, rgba(123,91,227,0.18) 0%, rgba(233,222,255,0.92) 100%)"
                              : cell.isToday
                                ? "linear-gradient(180deg, rgba(250,247,255,0.98) 0%, rgba(255,250,252,0.98) 100%)"
                                : "linear-gradient(180deg, rgba(255,255,255,0.97) 0%, rgba(248,244,252,0.92) 100%)",
                            color: cell.isDisabled ? "#c6c8d5" : cell.inCurrentMonth ? "#111827" : "#a7adbb",
                            cursor: cell.isDisabled ? "not-allowed" : "pointer",
                            fontWeight: cell.isSelected || cell.isToday ? 900 : 700,
                            opacity: cell.isDisabled ? 0.55 : cell.inCurrentMonth ? 1 : 0.78,
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "space-between",
                            alignItems: "stretch",
                            padding: "8px 8px 7px",
                            boxShadow: cell.isSelected ? "0 12px 26px rgba(84, 64, 154, 0.14)" : "0 8px 18px rgba(31, 34, 57, 0.04)",
                            overflow: "hidden",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "6px" }}>
                            <span style={{ fontSize: "15px", lineHeight: 1, fontWeight: cell.isSelected ? 900 : 800 }}>{cell.dayNumber}</span>
                              {cell.isSelected ? <span style={{ width: "8px", height: "8px", borderRadius: "999px", background: "#8b5cf6", boxShadow: "0 0 0 3px rgba(139, 92, 246, 0.12)", flexShrink: 0, marginTop: "2px" }} /> : null}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: "14px" }}>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                                {cell.isToday ? <span style={{ width: "6px", height: "6px", borderRadius: "999px", background: "#8b5cf6", opacity: 0.9 }} /> : null}
                              </span>
                              {hasReviewFiles ? <span style={{ width: "7px", height: "7px", borderRadius: "999px", background: "#d06e9b", boxShadow: "0 0 0 3px rgba(240, 221, 231, 0.45)", flexShrink: 0 }} /> : null}
                          </div>
                        </button>
                      );
                    })()
                  ))}
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "10px", marginTop: "16px" }}>
              <SummaryChip label="対象日" value={formatDateLabel(selectedDate)} />
              <SummaryChip label="表示モード" value={workbenchLabel} />
              <SummaryChip label="対象会場" value={isLocalReviewSelected ? `${filteredVenueGroups.length}会場` : `${filteredReviewFileGroups.length}会場`} />
            </div>
            <div style={{ marginTop: "16px", fontSize: "12px", lineHeight: 1.8, color: "#6b7280" }}>
              {isTodaySelected
                ? "当日分は localStorage と today.generated.json を使います。"
                : isYesterdaySelected
                  ? "昨日分は localStorage と保存済み snapshot を使います。"
                  : "過去日付は public/data/reviews/index.json と TXT ファイルを fetch して表示します。"}
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
              <h2 style={{ margin: 0, fontSize: "30px", fontWeight: 900, color: "#101828" }}>{isLocalReviewSelected ? "レビュー対象の会場とメモを絞り込む" : "保存ファイルの会場と文面を絞り込む"}</h2>
            </div>
            <div style={{ fontSize: "12px", color: "#6d7687", lineHeight: 1.7, textAlign: "right" }}>
              <div>{isLocalReviewSelected ? "localStorage に残っている予想と結果だけを対象に、" : "選択日付の保存レビューTXTだけを対象に、"}</div>
              <div>{isLocalReviewSelected ? "会場カードとレポート貼り付け欄を切り替えます。" : "会場カードと表示テキストを切り替えます。"}</div>
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
              <h2 style={{ margin: 0, fontSize: "30px", fontWeight: 900, color: "#101828" }}>{isTodaySelected ? "今日予想した会場を、見やすいカードで振り返る" : isYesterdaySelected ? "昨日予想した会場を、朝に振り返る" : "保存ファイルがある会場を、見やすいカードで振り返る"}</h2>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginTop: "14px" }}>
                {!isYesterdaySelected ? (
                  <button
                    onClick={openYesterdayReview}
                    style={{
                      border: "1px solid rgba(122,96,194,0.24)",
                      cursor: "pointer",
                      borderRadius: "999px",
                      padding: "11px 18px",
                      background: "white",
                      color: "#6542be",
                      fontWeight: 900,
                    }}
                  >
                    昨日のレビューを見る
                  </button>
                ) : null}
                {!isTodaySelected ? (
                  <button
                    onClick={openTodayReview}
                    style={{
                      border: "none",
                      cursor: "pointer",
                      borderRadius: "999px",
                      padding: "11px 18px",
                      background: "linear-gradient(135deg, #7b5be3 0%, #5d79e8 100%)",
                      color: "white",
                      fontWeight: 900,
                    }}
                  >
                    今日のレビューに戻る
                  </button>
                ) : null}
              </div>
            </div>
            <div style={{ fontSize: "12px", color: "#6d7687", lineHeight: 1.7, textAlign: "right" }}>
              <div>会場を押すと、左のコピー素材と</div>
              <div>{isLocalReviewSelected ? "右のレポート保存欄が切り替わります。" : "右の保存ファイル情報が切り替わります。"}</div>
            </div>
          </div>

{(isLocalReviewSelected
  ? sortedVenueGroupsForCards.length === 0
  : reviewFileLoadStatus !== "loading" && filteredReviewFileGroups.length === 0) ? (
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
    <div style={{ fontWeight: 900, color: "#4b5563", marginBottom: "8px" }}>{isLocalReviewSelected ? (isTodaySelected ? "本日の保存済み予想はまだありません" : "昨日の保存済み予想はまだありません") : "この日付の保存レビューTXTはまだ登録されていません"}</div>
    <div>{isLocalReviewSelected ? "PredictionPageで予想を保存すると、ここにレビュー素材が表示されます。" : "public/data/reviews/index.json に対象日付と TXT ファイルを登録すると表示されます。"}</div>
  </div>
) : (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
      gap: "14px",
      alignItems: "stretch",
    }}
  >
    {isLocalReviewSelected
      ? sortedVenueGroupsForCards.map((group) => {
          const tone = venueColorMap[group.venue] ?? heroTone;
          const selected = selectedVenueGroup?.venue === group.venue;
          const profitLoss = group.totalPayout - group.totalInvestment;
          const hitRate = group.settledCount > 0 ? `${((group.hitCount / group.settledCount) * 100).toFixed(1)}%` : "--";
          const hitSub = group.settledCount > 0 ? `${group.hitCount}-${group.settledCount}` : "接続待ち";
          const stageLabel = getPredictionVenueStageLabel(group, group.date);

          return (
            <button
              key={`${group.date}:${group.venue}`}
              onClick={() => setSelectedVenueName(group.venue)}
              style={{
                textAlign: "left",
                width: "100%",
                minHeight: "220px",
                borderRadius: "24px",
                border: `1px solid ${selected ? tone.border : "rgba(229,221,241,0.9)"}`,
                background: selected
                  ? `linear-gradient(180deg, ${tone.chip} 0%, rgba(255,255,255,0.99) 100%)`
                  : "linear-gradient(180deg, rgba(255,255,255,0.99) 0%, rgba(248,245,252,0.96) 100%)",
                boxShadow: selected
                  ? "0 18px 34px rgba(17,24,39,0.08)"
                  : "0 12px 28px rgba(17,24,39,0.05)",
                padding: "18px 18px 16px",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", marginBottom: "14px" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "11px", fontWeight: 900, letterSpacing: "0.16em", color: tone.text, marginBottom: "8px" }}>
                    {formatDateShort(group.date)}
                  </div>
                  <div style={{ fontSize: "22px", fontWeight: 900, color: "#111827", lineHeight: 1.08 }}>
                    {group.venue}
                  </div>
                  <div style={{ fontSize: "12px", color: "#6d7687", marginTop: "7px", lineHeight: 1.6 }}>
                    {group.title ?? "Prediction保存データ読み込み"}
                  </div>
                </div>

                <div style={{ display: "grid", gap: "8px", justifyItems: "end", flexShrink: 0 }}>
                  <span
                    style={{
                      fontSize: "10px",
                      fontWeight: 900,
                      color: tone.text,
                      background: tone.chip,
                      border: `1px solid ${tone.border}`,
                      padding: "6px 9px",
                      borderRadius: "999px",
                    }}
                  >
                    {group.grade ?? "--"}
                  </span>

                  <span
                    style={{
                      fontSize: "10px",
                      fontWeight: 900,
                      color: "#6d4fc2",
                      background: "rgba(250,247,255,0.96)",
                      border: "1px solid rgba(196, 181, 253, 0.75)",
                      padding: "6px 9px",
                      borderRadius: "999px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {stageLabel}
                  </span>
                  <span style={{ fontSize: "10px", fontWeight: 900, color: "#748092" }}>
                    {sessionLabelMap[group.session ?? ""] ?? group.session ?? "接続待ち"}
                  </span>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "10px" }}>
                <ReviewVenueMetric label="払戻" value={formatYen(group.totalPayout)} sub={group.settledCount > 0 ? "払い戻し合計" : "結果待ち"} />
                <ReviewVenueMetric label="収支" value={formatProfit(profitLoss)} sub={profitLoss >= 0 ? "プラス収支" : "マイナス収支"} />
                <ReviewVenueMetric label="的中率" value={hitRate} sub={hitSub} />
              </div>
            </button>
          );
        })
      : filteredReviewFileGroups.map((group) => {
          const tone = venueColorMap[group.venue] ?? heroTone;
          const selected = selectedReviewFileGroup?.venue === group.venue;
          const metrics = buildReviewFileCardMetrics(group);

          return (
            <button
              key={`${group.date}:${group.venue}`}
              onClick={() => setSelectedVenueName(group.venue)}
              style={{
                textAlign: "left",
                width: "100%",
                minHeight: "220px",
                borderRadius: "24px",
                border: `1px solid ${selected ? tone.border : "rgba(229,221,241,0.9)"}`,
                background: selected
                  ? `linear-gradient(180deg, ${tone.chip} 0%, rgba(255,255,255,0.99) 100%)`
                  : "linear-gradient(180deg, rgba(255,255,255,0.99) 0%, rgba(248,245,252,0.96) 100%)",
                boxShadow: selected
                  ? "0 18px 34px rgba(17,24,39,0.08)"
                  : "0 12px 28px rgba(17,24,39,0.05)",
                padding: "18px 18px 16px",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", marginBottom: "14px" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "11px", fontWeight: 900, letterSpacing: "0.16em", color: tone.text, marginBottom: "8px" }}>
                    {formatDateShort(group.date)}
                  </div>
                  <div style={{ fontSize: "22px", fontWeight: 900, color: "#111827", lineHeight: 1.08 }}>
                    {group.venue}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "9px" }}>
                    {metrics.predictionReady ? <span style={{ fontSize: "10px", fontWeight: 900, color: "#7b5be3", background: "rgba(123,91,227,0.1)", border: "1px solid rgba(196, 181, 253, 0.8)", borderRadius: "999px", padding: "4px 8px" }}>予想あり</span> : null}
                    {metrics.resultReady ? <span style={{ fontSize: "10px", fontWeight: 900, color: "#7b5be3", background: "rgba(123,91,227,0.1)", border: "1px solid rgba(196, 181, 253, 0.8)", borderRadius: "999px", padding: "4px 8px" }}>結果あり</span> : null}
                    <span style={{ fontSize: "10px", fontWeight: 900, color: metrics.summaryReady ? "#bf4f7f" : "#8a8fa1", background: metrics.summaryReady ? "rgba(244, 122, 164, 0.1)" : "rgba(238, 240, 245, 0.9)", border: `1px solid ${metrics.summaryReady ? "rgba(244, 122, 164, 0.26)" : "rgba(219, 223, 232, 0.92)"}`, borderRadius: "999px", padding: "4px 8px" }}>
                      {metrics.summaryReady ? "まとめあり" : "まとめTXT未登録"}
                    </span>
                  </div>
                </div>

                <div style={{ display: "grid", gap: "8px", justifyItems: "end", flexShrink: 0 }}>
                  <span
                    style={{
                      fontSize: "10px",
                      fontWeight: 900,
                      color: tone.text,
                      background: tone.chip,
                      border: `1px solid ${tone.border}`,
                      padding: "6px 9px",
                      borderRadius: "999px",
                    }}
                  >
                    --
                  </span>

                  <span
                    style={{
                      fontSize: "10px",
                      fontWeight: 900,
                      color: "#6d4fc2",
                      background: "rgba(250,247,255,0.96)",
                      border: "1px solid rgba(196, 181, 253, 0.75)",
                      padding: "6px 9px",
                      borderRadius: "999px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    保存ファイル
                  </span>
                  <span style={{ fontSize: "10px", fontWeight: 900, color: "#748092" }}>
                    file mode
                  </span>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "10px" }}>
                <ReviewVenueMetric label="的中率" value={metrics.hitRate} sub={metrics.hitSub} />
                <ReviewVenueMetric label="回収率" value={metrics.roi} sub={metrics.roiSub} />
                <ReviewVenueMetric label="収支" value={metrics.profit} sub={metrics.profitSub} />
              </div>
            </button>
          );
        })}
  </div>
)}

        </section>

        <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.16fr) minmax(380px, 0.84fr)", gap: "22px", alignItems: "start", marginBottom: "24px" }}>
          <article style={{ borderRadius: "32px", border: `1px solid ${heroTone.border}`, background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,245,252,0.98) 100%)", boxShadow: "0 20px 40px rgba(17,24,39,0.05)", padding: "26px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", marginBottom: "18px" }}>
              <div>
                <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.18em", color: "#9a7ad9", marginBottom: "8px" }}>COPY MATERIAL</div>
                <h2 style={{ margin: 0, fontSize: "30px", fontWeight: 900, color: "#101828" }}>{isTodaySelected ? "会場ごとの GPT 連携素材" : isYesterdaySelected ? "昨日の GPT 連携素材" : "保存ファイルのテキスト表示"}</h2>
              </div>
              <div style={{ fontSize: "12px", color: "#6d7687", lineHeight: 1.7, textAlign: "right" }}>
                <div>{isTodaySelected ? "左に予想まとめ、下に結果まとめ。" : isYesterdaySelected ? "昨日分の予想まとめと結果まとめを表示します。" : "保存された予想TXTと結果TXTを表示します。"}</div>
                <div>コピーボタンですぐ GPT に渡せます。</div>
              </div>
            </div>

            {(isLocalReviewSelected ? selectedVenueGroup : selectedReviewFileGroup) ? (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px", marginBottom: "18px" }}>
                  <SummaryChip label="対象会場" value={`${selectedDisplayVenueName ?? "--"} / ${formatDateShort(selectedDate)}`} />
                  <SummaryChip label={isLocalReviewSelected ? "対象R数" : "表示モード"} value={isLocalReviewSelected ? `${selectedVenueGroup?.races.length ?? 0}R` : "FILE ARCHIVE"} />
                  <SummaryChip label={isLocalReviewSelected ? "レポート状態" : "保存方式"} value={isLocalReviewSelected ? selectedReportRecord ? "保存済み" : "未保存" : "fetch only"} />
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
      if (!selectedDisplayVenueName) return;
      downloadTextFile(
        buildReviewDownloadFileName(selectedDate, selectedDisplayVenueName, "prediction"),
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
      if (!selectedDisplayVenueName) return;
      downloadTextFile(
        buildReviewDownloadFileName(selectedDate, selectedDisplayVenueName, "result"),
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
                <h2 style={{ margin: 0, fontSize: "30px", fontWeight: 900, color: "#101828" }}>{isTodaySelected ? "当日レポート貼り付け欄" : isYesterdaySelected ? "昨日レポート貼り付け欄" : "ファイル保存レビュー"}</h2>
              </div>
              <div style={{ fontSize: "12px", color: "#6d7687", lineHeight: 1.7, textAlign: "right" }}>
                <div>{isTodaySelected ? "当日の振り返りを一時保存します。" : isYesterdaySelected ? "昨日の振り返りを朝まで一時保存します。" : "この日付はTXT/Markdown保存データを表示しています。"}</div>
                <div>{isLocalReviewSelected ? "保存版はTXT/Markdownで別管理してください。" : "localStorageには保存しません。"}</div>
              </div>
            </div>

            {isLocalReviewSelected ? selectedVenueGroup ? (
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
            ) : selectedReviewFileGroup ? (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px", marginBottom: "18px" }}>
                  <SummaryChip label="会場" value={selectedReviewFileGroup.venue} />
                  <SummaryChip label="日付" value={formatDateLabel(selectedReviewFileGroup.date)} />
                  <SummaryChip label="保存方式" value="fetch only" />
                </div>
                <div style={{ borderRadius: "24px", border: "1px solid rgba(229,221,241,0.95)", background: "rgba(255,255,255,0.92)", padding: "18px", marginBottom: "14px" }}>
                  <div style={{ fontSize: "13px", lineHeight: 1.9, color: "#5f6676" }}>
                    この日付はTXT/Markdown保存データを表示しています。localStorageには保存しません。
                  </div>
                </div>
                <div style={{ display: "grid", gap: "12px" }}>
                  <div style={{ borderRadius: "22px", border: "1px solid rgba(229,221,241,0.92)", background: "rgba(255,255,255,0.95)", padding: "16px" }}>
                    <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.16em", color: "#9a7ad9", marginBottom: "8px" }}>PREDICTION FILE</div>
                    <div style={{ fontSize: "13px", lineHeight: 1.8, color: "#374151" }}>{selectedReviewFileGroup.predictionFile ?? "未登録"}</div>
                  </div>
                  <div style={{ borderRadius: "22px", border: "1px solid rgba(229,221,241,0.92)", background: "rgba(255,255,255,0.95)", padding: "16px" }}>
                    <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.16em", color: "#9a7ad9", marginBottom: "8px" }}>RESULT FILE</div>
                    <div style={{ fontSize: "13px", lineHeight: 1.8, color: "#374151" }}>{selectedReviewFileGroup.resultFile ?? "未登録"}</div>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ borderRadius: "24px", border: "1px dashed rgba(219,211,236,0.95)", padding: "22px", color: "#6d7687", background: "rgba(255,255,255,0.7)" }}>
                会場を選ぶと保存ファイル情報が表示されます。
              </div>
            )}

            {reportStatus ? <div style={{ marginTop: "14px", fontSize: "13px", fontWeight: 800, color: heroTone.text }}>{reportStatus}</div> : null}
          </article>
        </section>

        <div style={{ fontSize: "12px", lineHeight: 1.8, color: "#6d7687", textAlign: "center" }}>
          {isTodaySelected ? "過去レビューはTXT/Markdownで別保存してください。このページは当日作業用です。" : isYesterdaySelected ? "昨日レビューは localStorage と snapshot を使う朝用作業枠です。" : "この日付はファイル保存レビューです。過去レビューは public/data/reviews 配下のTXTを参照します。"}
        </div>

      </main>
    </div>
  );
}
