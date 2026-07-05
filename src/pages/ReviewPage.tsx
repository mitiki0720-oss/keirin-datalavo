import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import {
  SiteHeader,
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
  registrationNo?: string | number;
  registration?: string | number;
  registrationNumber?: string | number;
  registrationNoSource?: string;
  registrationNoTrustStatus?: string;
  prefecture?: string;
  age?: string | number;
  term?: string | number;
  grade?: string;
  className?: string;
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
  registrationNo?: string | number;
  registration?: string | number;
  registrationNumber?: string | number;
  registrationNoSource?: string;
  registrationNoTrustStatus?: string;
  prefecture?: string;
  age?: string | number;
  term?: string | number;
  grade?: string;
  className?: string;
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
  officialResultSource?: string;
  sourceName?: string;
  sourceType?: string;
  sourceFetchedAt?: string;
  sourceHash?: string;
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

type PredictionFinalTrifectaFavorite = {
  combination?: string;
  odds?: number | string;
  oddsText?: string;
  popularity?: number;
  source?: string;
  sort?: string;
  capturedAt?: string;
};

type PredictionRaceItem = {
  raceNo: number;
  time?: string;
  title?: string;
  lineup?: string;
  raceOperationStatus?: "scheduled" | "cancelled" | "postponed" | "suspended" | "unknown" | "finished";
  isGirls?: boolean;
  sourceNote?: string;
  resultNote?: string;
  oddsNote?: string;
  oddsPreview?: PredictionOddsPreviewItem[];
  oddsTrifecta?: PredictionTrifectaItem[];
  finalTrifectaFavorite?: PredictionFinalTrifectaFavorite | null;
  topOdds?: number | null;
  topTrifectaOdds?: number | null;
  favoriteOdds?: number | null;
  favoriteCombination?: string;
  resultStatus?: "pending" | "confirmed";
  resultTop3?: PredictionRaceResultEntry[];
  payouts?: PredictionRaceResultPayoutItem[];
  result?: PredictionRaceResult;
  riders?: Array<{
    carNo?: string;
    name?: string;
    fullName?: string;
    registrationNo?: string | number;
    registration?: string | number;
    registrationNumber?: string | number;
    registrationId?: string | number;
    registrationNoSource?: string;
    registrationNoTrustStatus?: string;
    prefecture?: string;
    age?: string | number;
    term?: string | number;
    grade?: string;
    className?: string;
  }>;
  officialResultSource?: string;
  sourceName?: string;
  sourceType?: string;
  sourceFetchedAt?: string;
  sourceHash?: string;
};

type ReviewFinalTrifectaFavoriteOdds = {
  combination: string;
  oddsText: string;
  source: string;
};

type ReviewFinalOddsReference = {
  favorite: ReviewFinalTrifectaFavoriteOdds | null;
  source: "feed" | "snapshot" | "none";
  oddsNote?: string;
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

type ReviewCopySection = {
  raceNumber: number;
  text: string;
};

const PAGE_MAX_WIDTH = "2040px";
const PREDICTION_SLOT_STORAGE_KEY = "kurari-data-labo-prediction-slots";
const PREDICTION_RESULT_STORAGE_KEY = "kurari-data-labo-prediction-results";
const REVIEW_REPORT_STORAGE_KEY = "kurari-data-labo-review-reports";
const REVIEW_RACE_RESULT_SNAPSHOT_STORAGE_KEY = "kurari-data-labo-review-race-result-snapshots";

const toPublicPath = (path: string) => {
  const base = import.meta.env.BASE_URL || "/";
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  return `${normalizedBase}${path.replace(/^\/+/, "")}`;
};

const PREDICTION_TODAY_DATA_URL = toPublicPath("/data/races/today.generated.json");
const REVIEW_FILE_INDEX_URL = toPublicPath("/data/reviews/index.json");
const REVIEW_PAGE_BACKGROUND_URL = toPublicPath("/review-page/backgrounds/review-page-bg-sky-water.png");

async function fetchReviewTodayFeed(cacheMode: RequestCache = "no-cache") {
  const suffix = cacheMode === "no-store" ? `?v=${Date.now()}` : "";
  const response = await fetch(`${PREDICTION_TODAY_DATA_URL}${suffix}`, { cache: cacheMode });
  if (!response.ok) throw new Error(`review-feed-${response.status}`);
  return response.json() as Promise<PredictionTodayFeed>;
}


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
type ReviewFileCalculatedMetrics = {
  hitRateValue?: number;
  roiValue?: number;
  profit?: number;
  checkedCount?: number;
  investment?: number;
  payout?: number;
};

const REVIEW_FILE_FINAL_JUDGEMENT_LABEL = "\u6700\u7d42\u5224\u5b9a";
const REVIEW_FILE_HIT_TEXT = "\u7684\u4e2d";
const REVIEW_FILE_MISS_TEXT = "\u4e0d\u7684\u4e2d";
const REVIEW_FILE_ALL_REFUND_TEXT = "\u5168\u8fd4\u9084";
const REVIEW_FILE_PURCHASE_VOID_TEXT = "\u8cfc\u5165\u7121\u52b9";
const REVIEW_FILE_INVESTMENT_LABEL = "\u6295\u8cc7";
const REVIEW_FILE_PAYOUT_LABEL = "\u6255\u623b";
const REVIEW_FILE_PROFIT_LABEL = "\u53ce\u652f";

function normalizeReviewFileMetricNumber(value: string) {
  const normalized = value.replace(/,/g, "").replace(/\u2212/g, "-").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function extractReviewFileNumbersByLabel(source: string, label: string) {
  const values: number[] = [];
  for (const line of source.split(/\n+/u)) {
    const index = line.indexOf(label);
    if (index < 0) continue;
    const tail = line.slice(index + label.length);
    const match = tail.match(/[:?]\s*([+\-\u2212]?[\d,]+)/u);
    const parsed = normalizeReviewFileMetricNumber(match?.[1] ?? "");
    if (parsed !== undefined) values.push(parsed);
  }
  return values;
}

function sumReviewFileMetricNumbers(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function calculateReviewFileMetricsFromResultText(source: string): ReviewFileCalculatedMetrics {
  const lines = source.split(/\n+/u);
  let hitCount = 0;
  let settledCount = 0;

  for (const line of lines) {
    if (!line.includes(REVIEW_FILE_FINAL_JUDGEMENT_LABEL)) continue;
    if (line.includes(REVIEW_FILE_ALL_REFUND_TEXT) || line.includes(REVIEW_FILE_PURCHASE_VOID_TEXT)) continue;

    const normalized = line.toLowerCase();
    if (line.includes(REVIEW_FILE_MISS_TEXT) || normalized.includes("miss")) {
      settledCount += 1;
      continue;
    }

    if (line.includes(REVIEW_FILE_HIT_TEXT) || normalized.includes("hit")) {
      hitCount += 1;
      settledCount += 1;
    }
  }

  const investmentValues = extractReviewFileNumbersByLabel(source, REVIEW_FILE_INVESTMENT_LABEL);
  const payoutValues = extractReviewFileNumbersByLabel(source, REVIEW_FILE_PAYOUT_LABEL);
  const profitValues = extractReviewFileNumbersByLabel(source, REVIEW_FILE_PROFIT_LABEL);

  const investment = investmentValues.length > 0 ? sumReviewFileMetricNumbers(investmentValues) : undefined;
  const payout = payoutValues.length > 0 ? sumReviewFileMetricNumbers(payoutValues) : undefined;
  const directProfit = profitValues.length > 0 ? sumReviewFileMetricNumbers(profitValues) : undefined;
  const profit = directProfit ?? (investment !== undefined && payout !== undefined ? payout - investment : undefined);

  return {
    hitRateValue: settledCount > 0 ? (hitCount / settledCount) * 100 : undefined,
    roiValue: investment !== undefined && investment > 0 && payout !== undefined ? (payout / investment) * 100 : undefined,
    profit,
    checkedCount: settledCount > 0 ? settledCount : undefined,
    investment,
    payout,
  };
}


function buildReviewFileCardMetrics(group: ReviewFileVenueGroup): ReviewFileCardMetrics {
  const summarySource = group.summaryText;
  const calculated = summarySource.trim()
    ? {}
    : calculateReviewFileMetricsFromResultText(group.resultText);

  const summaryHitRateValue = extractReviewHitRatePercentage(summarySource);
  const summaryRoiValue = extractReviewSummaryPercentage(summarySource, "\u56de\u53ce\u7387");
  const summaryCheckedCount = extractReviewSummaryNumber(summarySource, "\u7167\u5408\u6570");
  const summaryInvestment = extractReviewSummaryNumber(summarySource, "\u6295\u8cc7");
  const summaryPayout =
    extractReviewSummaryNumber(summarySource, "\u6255\u623b") ??
    extractReviewSummaryNumber(summarySource, "\u56de\u53ce");
  const summaryProfit = extractReviewSummaryNumber(summarySource, "\u53ce\u652f") ?? (
    summaryInvestment !== undefined && summaryPayout !== undefined
      ? summaryPayout - summaryInvestment
      : undefined
  );

  const hitRateValue = summaryHitRateValue ?? calculated.hitRateValue;
  const roiValue = summaryRoiValue ?? calculated.roiValue;
  const checkedCount = summaryCheckedCount ?? calculated.checkedCount;
  const profit = summaryProfit ?? calculated.profit;

  const hitSource = summaryHitRateValue !== undefined ? "summary" : calculated.hitRateValue !== undefined ? "\u7d50\u679cTXT" : "\u672a\u767b\u9332";
  const roiSource = summaryRoiValue !== undefined ? "summary" : calculated.roiValue !== undefined ? "\u7d50\u679cTXT" : "\u672a\u767b\u9332";
  const profitSource = summaryProfit !== undefined ? "summary" : calculated.profit !== undefined ? "\u7d50\u679cTXT" : "\u672a\u767b\u9332";
  const checkedSource = summaryCheckedCount !== undefined ? "\u7167\u5408\u30ec\u30fc\u30b9\u6570" : calculated.checkedCount !== undefined ? "\u7d50\u679cTXT\u304b\u3089\u7b97\u51fa" : "\u307e\u3068\u3081TXT\u672a\u767b\u9332";

  return {
    hitRate: hitRateValue !== undefined ? hitRateValue.toFixed(1) + "%" : "--",
    hitSub: hitSource,
    roi: roiValue !== undefined ? roiValue.toFixed(1) + "%" : "--",
    roiSub: roiSource,
    profit: profit !== undefined ? formatProfit(profit) : "--",
    profitSub: profitSource,
    checkedCount: checkedCount !== undefined ? String(checkedCount) + "R" : "--",
    checkedSub: checkedSource,
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
    raceOperationStatus: race.raceOperationStatus,
    isGirls: race.isGirls,
    sourceNote: race.sourceNote,
    resultNote: race.resultNote,
    oddsNote: race.oddsNote,
    oddsPreview: normalizeReviewOddsPreviewList(race.oddsPreview),
    oddsTrifecta: normalizeReviewTrifectaOddsList(race.oddsTrifecta),
    finalTrifectaFavorite: race.finalTrifectaFavorite ?? null,
    topOdds: race.topOdds,
    topTrifectaOdds: race.topTrifectaOdds,
    favoriteOdds: race.favoriteOdds,
    favoriteCombination: race.favoriteCombination,
    resultStatus: race.resultStatus,
    resultTop3: race.resultTop3,
    payouts: race.payouts,
    result: race.result,
    riders: race.riders,
    officialResultSource: race.officialResultSource,
    sourceName: race.sourceName,
    sourceType: race.sourceType,
    sourceFetchedAt: race.sourceFetchedAt,
    sourceHash: race.sourceHash,
  };
}

function loadReviewRaceResultSnapshots() {
  if (typeof window === "undefined") return {} as ReviewRaceResultSnapshotMap;

  try {
    window.localStorage.removeItem(REVIEW_RACE_RESULT_SNAPSHOT_STORAGE_KEY);
  } catch {
    // localStorage cleanup failure is non-fatal
  }

  return {} as ReviewRaceResultSnapshotMap;
}

function saveReviewRaceResultSnapshots(records: ReviewRaceResultSnapshotMap) {
  const activeDate = getJstOperationalDate();
  return Object.fromEntries(
    Object.entries(records)
      .filter(([key]) => {
        const [snapshotDate] = key.split(":");
        return snapshotDate === activeDate;
      })
      .filter(([key, race]) => Boolean(key) && Boolean(race?.raceNo)),
  ) as ReviewRaceResultSnapshotMap;
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
    raceOperationStatus: feedRace.raceOperationStatus || snapshotRace.raceOperationStatus,
    isGirls: feedRace.isGirls ?? snapshotRace.isGirls,
    oddsPreview: pickReviewOddsPreview(feedRace, snapshotRace),
    oddsTrifecta: pickReviewTrifectaOdds(feedRace, snapshotRace),
    finalTrifectaFavorite: feedRace.finalTrifectaFavorite ?? snapshotRace.finalTrifectaFavorite ?? null,
    topOdds: feedRace.topOdds ?? snapshotRace.topOdds ?? null,
    topTrifectaOdds: feedRace.topTrifectaOdds ?? snapshotRace.topTrifectaOdds ?? null,
    favoriteOdds: feedRace.favoriteOdds ?? snapshotRace.favoriteOdds,
    favoriteCombination: feedRace.favoriteCombination || snapshotRace.favoriteCombination,
    resultStatus: feedRace.resultStatus || snapshotRace.resultStatus,
    resultTop3: feedRace.resultTop3?.length ? feedRace.resultTop3 : snapshotRace.resultTop3,
    payouts: feedRace.payouts ?? snapshotRace.payouts,
    result: mergePredictionRaceResult(feedRace.result, snapshotRace.result),
    riders: feedRace.riders?.length ? feedRace.riders : snapshotRace.riders,
    officialResultSource: feedRace.officialResultSource || snapshotRace.officialResultSource,
    sourceName: feedRace.sourceName || snapshotRace.sourceName,
    sourceType: feedRace.sourceType || snapshotRace.sourceType,
    sourceFetchedAt: feedRace.sourceFetchedAt || snapshotRace.sourceFetchedAt,
    sourceHash: feedRace.sourceHash || snapshotRace.sourceHash,
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
    .map((item, index): PredictionRaceResultEntry | null => {
      if (!item) return null;
      if (typeof item === "string") {
        return {
          place: String(index + 1),
          carNo: item,
        };
      }
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
        registrationNo: item.registrationNo,
        registration: item.registration,
        registrationNumber: item.registrationNumber,
        registrationNoSource: item.registrationNoSource,
        registrationNoTrustStatus: item.registrationNoTrustStatus,
        prefecture: item.prefecture,
        age: item.age,
        term: item.term,
        grade: item.grade,
        className: item.className,
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

      const oddsText = parseOddsText(item.odds);
      const odds = oddsText ? Number(oddsText.replace("倍", "")) : Number.NaN;

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

function normalizeTrifectaCombination(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;

  const text = String(value)
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .trim();

  const separated = text.match(/(?:^|[^\d])([1-9])\s*[-‐‑‒–—―ー=－>＞]\s*([1-9])\s*[-‐‑‒–—―ー=－>＞]\s*([1-9])(?:[^\d]|$)/);
  if (separated) return `${separated[1]}-${separated[2]}-${separated[3]}`;

  const compact = text.match(/(?:^|[^\d])([1-9]{3})(?:[^\d]|$)/);
  if (compact) return compact[1].split("").join("-");

  return null;
}

function parseOddsText(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `${value.toFixed(1)}倍`;
  }

  if (typeof value !== "string") return null;
  if (value.includes("円")) return null;

  const match = value.match(/(\d+(?:\.\d+)?)\s*倍/);
  if (match) return `${match[1]}倍`;

  const numeric = value.trim().match(/^(\d+(?:\.\d+)?)$/);
  if (numeric) return `${numeric[1]}倍`;

  return null;
}

function normalizeReviewStructuredTrifectaCandidate(
  item: unknown,
  source: string,
): ReviewFinalTrifectaFavoriteOdds | null {
  if (!item || typeof item !== "object") return null;
  const record = item as Record<string, unknown>;
  const popularity = normalizeReviewPopularity(record.popularity ?? record.rank ?? record.popularRank ?? record.ninki);
  const labelText = String(record.tag ?? record.label ?? record.name ?? "");
  const isFavorite = popularity === 1 || /(?:人気|rank|Rank|RANK)\s*1|1\s*(?:人気|番人気)/.test(labelText);
  if (!isFavorite) return null;

  const combination = normalizeTrifectaCombination(
    record.combination ?? record.combo ?? record.line ?? record.numbers ?? record.ticket,
  );
  const oddsText = parseOddsText(record.odds ?? record.oddsText ?? record.value ?? record.payout);

  if (!combination || !oddsText) return null;

  return { combination, oddsText, source };
}

function resolveFinalTrifectaFavoriteOdds(
  race?: PredictionRaceItem,
): ReviewFinalTrifectaFavoriteOdds | null {
  if (!race) return null;

  const raceRecord = race as PredictionRaceItem & Record<string, unknown>;
  const finalFavorite = normalizeReviewStructuredTrifectaCandidate(
    raceRecord.finalTrifectaFavorite,
    "finalTrifectaFavorite",
  );
  if (finalFavorite) return finalFavorite;

  const nestedOdds = raceRecord.odds && typeof raceRecord.odds === "object"
    ? raceRecord.odds as Record<string, unknown>
    : {};
  const structuredSources: Array<[string, unknown]> = [
    ["oddsTrifecta", raceRecord.oddsTrifecta],
    ["oddsTrifectaPopular", raceRecord.oddsTrifectaPopular],
    ["trifectaOdds", raceRecord.trifectaOdds],
    ["odds.trifecta", nestedOdds.trifecta],
  ];

  for (const [source, value] of structuredSources) {
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      const candidate = normalizeReviewStructuredTrifectaCandidate(item, source);
      if (candidate) return candidate;
    }
  }

  const favoriteCombination = normalizeTrifectaCombination(raceRecord.favoriteCombination);
  const favoriteOdds = parseOddsText(raceRecord.favoriteOdds);
  if (favoriteCombination && favoriteOdds) {
    return {
      combination: favoriteCombination,
      oddsText: favoriteOdds,
      source: "favoriteCombination/favoriteOdds",
    };
  }

  const topTrifecta = parseReviewLooseFavoriteOdds(raceRecord.topTrifectaOdds, "topTrifectaOdds");
  if (topTrifecta) return topTrifecta;

  const topOdds = parseReviewLooseFavoriteOdds(raceRecord.topOdds, "topOdds");
  if (topOdds) return topOdds;

  const oddsPreview = raceRecord.oddsPreview;
  if (Array.isArray(oddsPreview)) {
    for (const item of oddsPreview) {
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      const combinedText = `${String(record.tag ?? "")} ${String(record.combo ?? "")} ${String(record.odds ?? "")}`;
      if (!/3\s*連\s*単/.test(combinedText) || !/(人気\s*1|1\s*(?:人気|番人気))/.test(combinedText)) continue;

      const combination = normalizeTrifectaCombination(record.combo ?? combinedText);
      const oddsText = parseOddsText(record.odds ?? combinedText);
      if (combination && oddsText) {
        return { combination, oddsText, source: "oddsPreview" };
      }
    }
  }

  return null;
}

function parseReviewLooseFavoriteOdds(
  value: unknown,
  source: string,
): ReviewFinalTrifectaFavoriteOdds | null {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const combination = normalizeTrifectaCombination(
      record.combination ?? record.combo ?? record.line ?? record.numbers ?? record.ticket,
    );
    const oddsText = parseOddsText(record.odds ?? record.oddsText ?? record.value);
    if (combination && oddsText) return { combination, oddsText, source };
    return null;
  }

  if (typeof value !== "string") return null;

  const combination = normalizeTrifectaCombination(value);
  const oddsText = parseOddsText(value);
  if (!combination || !oddsText) return null;

  return { combination, oddsText, source };
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
  const fallbackPayouts = feedRace?.payouts ?? [];
  const payout2tan = resolveRacePayoutByBetType(feedRace, "2車単");
  const payout2fuku = dedupeReviewPayoutItems(
    result?.payout2fuku?.length
      ? result.payout2fuku
      : fallbackPayouts.filter((item) => normalizeBetTypeLabel(item.betType) === "2車複"),
  );
  const payout3tan = resolveRacePayoutByBetType(feedRace, "3連単");
  const payout3fuku = resolveRacePayoutByBetType(feedRace, "3連複");
  const payoutWide = dedupeReviewPayoutItems(
    result?.payoutWide?.length
      ? result.payoutWide
      : fallbackPayouts.filter((item) => normalizeBetTypeLabel(item.betType) === "ワイド"),
  );
  const formatItems = (items: Array<{
    combination?: string | null;
    payout?: string | null;
    popularity?: string | null;
  }>) =>
    items.map(formatReviewPayoutItem).filter(Boolean).join(" / ") || "未取得";

  return [
    `2車単: ${payout2tan ? formatReviewPayoutItem(payout2tan) : "未取得"}`,
    `2車複: ${formatItems(payout2fuku)}`,
    `3連単: ${payout3tan ? formatReviewPayoutItem(payout3tan) : "未取得"}`,
    `3連複: ${payout3fuku ? formatReviewPayoutItem(payout3fuku) : "未取得"}`,
    `ワイド: ${formatItems(payoutWide)}`,
  ];
}

const REVIEW_ALL_REFUND_TEXT = "\u5168\u8fd4\u9084";
const REVIEW_CANCEL_TEXT = "\u30ec\u30fc\u30b9\u4e2d\u6b62";
const REVIEW_ALL_REFUND_STATUS_LABEL = "\u30ec\u30fc\u30b9\u4e2d\u6b62\u30fb\u5168\u8fd4\u9084";
const REVIEW_ALL_REFUND_ORDER_LABEL = "\u5168\u8fd4\u9084\uff08\u7740\u9806\u7167\u5408\u306a\u3057\uff09";
const REVIEW_ALL_REFUND_HIT_LABEL = "\u5168\u8fd4\u9084\uff08\u8cfc\u5165\u7121\u52b9\uff09";

function isReviewAllRefundRace(feedRace?: PredictionRaceItem) {
  const noteText = String(feedRace?.resultNote ?? "");
  if (noteText.includes(REVIEW_ALL_REFUND_TEXT) || noteText.includes(REVIEW_CANCEL_TEXT)) return true;

  const payoutText = JSON.stringify([
    feedRace?.payouts,
    feedRace?.result?.payout2tan,
    feedRace?.result?.payout2fuku,
    feedRace?.result?.payout3tan,
    feedRace?.result?.payout3fuku,
    feedRace?.result?.payoutWide,
  ]);

  return payoutText.includes(REVIEW_ALL_REFUND_TEXT);
}

const EMPTY_REVIEW_VALUES = new Set([
  "",
  "-",
  "--",
  "---",
  "pending",
  "未保存",
  "未入力",
  "未反映",
  "保留",
  "接続待ち",
  "未取得",
  "情報なし",
]);

function normalizeReviewValue(value: unknown): string {
  return String(value ?? "").trim();
}

function hasRealReviewValue(value: unknown): boolean {
  const text = normalizeReviewValue(value);
  return text.length > 0 && !EMPTY_REVIEW_VALUES.has(text.toLowerCase());
}

function parseReviewCopySections(copyText: string): ReviewCopySection[] {
  const matches = Array.from(copyText.matchAll(/^■\s+.*?\s+(\d{1,2})R\s*$/gm));

  return matches.flatMap((match, index) => {
    const raceNumber = Number(match[1]);
    if (!Number.isFinite(raceNumber)) return [];

    const contentStart = (match.index ?? 0) + match[0].length;
    const contentEnd = matches[index + 1]?.index ?? copyText.length;
    return [{
      raceNumber,
      text: copyText.slice(contentStart, contentEnd).trim(),
    }];
  });
}

function isPredictionTextReady(value: unknown): boolean {
  const text = normalizeReviewValue(value);
  if (!hasRealReviewValue(text)) return false;

  return text.split(/\r?\n/).some((line) => {
    const normalizedLine = line.trim();
    if (!normalizedLine || /^【[^】]+】$/.test(normalizedLine)) return false;

    const labelAndValue = normalizedLine.match(/^[^:：]+[:：]\s*(.*)$/);
    return hasRealReviewValue(labelAndValue ? labelAndValue[1] : normalizedLine);
  });
}

function isPredictionReviewReady(race?: VenueReviewRace, fallbackText = ""): boolean {
  return isPredictionTextReady(race?.predictionText) || isPredictionTextReady(fallbackText);
}

function isResultTextReady(value: unknown): boolean {
  const text = normalizeReviewValue(value);
  if (!hasRealReviewValue(text)) return false;
  if (/^(?:結果確定|結果ステータス)\s*[:：]\s*(?:pending|接続待ち)\s*$/im.test(text)) return false;
  if (/^(?:結果確定|結果ステータス)\s*[:：]\s*confirmed\s*$/im.test(text)) return true;

  return Array.from(
    text.matchAll(/^(?:着順|3連単(?:照合キー|結果|組合せキー)|払戻)\s*[:：]\s*(.+)$/gim),
  ).some((match) => hasRealReviewValue(match[1]));
}

function isResultReviewReady(race?: VenueReviewRace, fallbackText = ""): boolean {
  const feedRace = race?.feedRace;
  const resultStatus = feedRace?.result?.status ?? feedRace?.resultStatus;
  if (resultStatus === "pending") return false;
  if (isReviewAllRefundRace(feedRace) || resultStatus === "confirmed") return true;

  if (hasRealReviewValue(race?.resultRecord?.resultOrder)) return true;

  const hasFinishOrder = Boolean(
    feedRace?.result?.finishOrder?.some((item) =>
      typeof item === "string"
        ? hasRealReviewValue(item)
        : hasRealReviewValue(item.rank) || hasRealReviewValue(item.carNo)
    ) ||
    feedRace?.resultTop3?.some((item) =>
      hasRealReviewValue(item.place) || hasRealReviewValue(item.carNo)
    )
  );
  if (hasFinishOrder) return true;

  const payoutItems = [
    ...(feedRace?.payouts ?? []),
    feedRace?.result?.payout2tan,
    ...(feedRace?.result?.payout2fuku ?? []),
    feedRace?.result?.payout3tan,
    feedRace?.result?.payout3fuku,
    ...(feedRace?.result?.payoutWide ?? []),
  ].filter((item): item is PredictionRaceResultPayoutItem => Boolean(item));
  if (payoutItems.some((item) =>
    hasRealReviewValue(item.combination) || hasRealReviewValue(item.payout)
  )) return true;

  const resultRecord = race?.resultRecord;
  if (
    (resultRecord?.hitStatus === "hit" || resultRecord?.hitStatus === "miss") &&
    (typeof resultRecord.payout === "number" || typeof resultRecord.investment === "number")
  ) {
    return true;
  }

  return isResultTextReady(fallbackText);
}

function getReviewResultStatusLabel(feedRace?: PredictionRaceItem) {
  if (isReviewAllRefundRace(feedRace)) return REVIEW_ALL_REFUND_STATUS_LABEL;
  return feedRace?.result?.status ?? feedRace?.resultStatus ?? "\u63a5\u7d9a\u5f85\u3061";
}

function getReviewResultOrderLabel(feedRace?: PredictionRaceItem, resultOrder?: string) {
  if (isReviewAllRefundRace(feedRace)) return REVIEW_ALL_REFUND_ORDER_LABEL;
  return resultOrder || "--";
}

function getReviewHitStatusLabelForCopy(feedRace?: PredictionRaceItem, hitStatus?: string) {
  if (isReviewAllRefundRace(feedRace)) return REVIEW_ALL_REFUND_HIT_LABEL;
  return hitStatus || "pending";
}


function buildReviewFullResultLines(feedRace?: PredictionRaceItem) {
  if (isReviewAllRefundRace(feedRace)) return ["\u5168\u7740\u9806: \u30ec\u30fc\u30b9\u4e2d\u6b62\u30fb\u5168\u8fd4\u9084\uff08\u7740\u9806\u7167\u5408\u306a\u3057\uff09"];

  const entries = getReviewFinishOrderRows(feedRace);
  if (entries.length === 0) return ["全着順: 接続待ち"];

  const lines = entries.map((entry) => {
    const rider = feedRace?.riders?.find((item) => String(item.carNo ?? "") === String(entry.carNo ?? ""));
    const marks = [
     entry.sMark || feedRace?.result?.sLeaderCarNo === entry.carNo ? "S" : "",
     entry.hMark || feedRace?.result?.hLeaderCarNo === entry.carNo ? "H" : "",
     entry.bMark || feedRace?.result?.bLeaderCarNo === entry.carNo ? "B" : "",
     ].filter(Boolean);

    const markText = marks.length > 0 ? ` ${marks.join("")}` : "";
    const place = entry.place ? (/^\d+$/.test(entry.place) ? `${entry.place}着` : entry.place) : "着順不明";
    const registrationNo =
      entry.registrationNo
      ?? entry.registration
      ?? entry.registrationNumber
      ?? rider?.registrationNo
      ?? rider?.registration
      ?? rider?.registrationNumber
      ?? rider?.registrationId;
    const fields = [
      `車番 ${entry.carNo ?? "未取得"}${markText}`,
      `選手名 ${cleanReviewRiderName(entry.name || rider?.fullName || rider?.name)}`,
      `登録番号 ${hasRealReviewValue(registrationNo) ? String(registrationNo) : "未取得"}`,
      `府県 ${entry.prefecture || rider?.prefecture || "未取得"}`,
      `年齢 ${entry.age ?? rider?.age ?? "未取得"}`,
      `期 ${entry.term ?? rider?.term ?? "未取得"}`,
      `級班 ${entry.className || entry.grade || rider?.className || rider?.grade || "未取得"}`,
      `上がり ${entry.agari || "未取得"}`,
      `着差 ${entry.margin || "未取得"}`,
      `決まり手 ${entry.kimarite || "未取得"}`,
    ];

    return `${place}: ${fields.join(" / ")}`;
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
    "区分: WEATHER ACTUAL",
    `天候: ${weatherActual.weather ?? "--"}`,
    `風向: ${weatherActual.windDirection ?? "--"}`,
    `風速: ${weatherActual.windSpeed ?? "--"}`,
    `気温: ${weatherActual.temperature ?? "--"}`,
    `降水: ${weatherActual.precipitation ?? "--"}`,
    `基準時刻: ${weatherActual.referenceText ?? "--"}`,
    `採用情報: ${weatherActual.source ?? "未取得"}`,
    `取得日時: ${weatherActual.fetchedAt ?? "未取得"}`,
  ];
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

function resolveReviewFinalOddsReference(
  latestFeedRace?: PredictionRaceItem,
  snapshotRace?: PredictionRaceItem,
): ReviewFinalOddsReference {
  const latestFavorite = resolveFinalTrifectaFavoriteOdds(latestFeedRace);
  if (latestFavorite) {
    return {
      favorite: latestFavorite,
      source: "feed",
      oddsNote: latestFeedRace?.oddsNote,
    };
  }

  const snapshotFavorite = resolveFinalTrifectaFavoriteOdds(snapshotRace);
  if (snapshotFavorite) {
    return {
      favorite: snapshotFavorite,
      source: "snapshot",
      oddsNote: snapshotRace?.oddsNote,
    };
  }

  return {
    favorite: null,
    source: "none",
    oddsNote: latestFeedRace?.oddsNote ?? snapshotRace?.oddsNote,
  };
}

function buildReviewFinalOddsLines(reference: ReviewFinalOddsReference) {
  if (reference.source === "feed" && reference.favorite) {
    return [
      "※結果確定後に取得したKDreams 3連単人気順1位です。",
      `最終1番人気オッズ: ${reference.favorite.combination} ${reference.favorite.oddsText}`,
    ];
  }

  if (reference.source === "snapshot" && reference.favorite) {
    return [
      "※KDreams最終人気順を取得できなかったため、保存済みスナップショットを参考表示しています。",
      `最終1番人気オッズ: ${reference.favorite.combination} ${reference.favorite.oddsText}`,
    ];
  }

  return [
    "※KDreams最終3連単オッズは未取得です。",
    "最終1番人気オッズ: 未取得",
    getPredictionOddsUnavailableLabel(reference.oddsNote),
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
  fileGroups: ReviewFileVenueGroup[],
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

  for (const feedVenue of feed?.venues ?? []) {
    const key = normalizeVenueName(feedVenue.venue);
    if (groups.has(key)) continue;

    const races = (feedVenue.races ?? []).map((liveFeedRace) => {
      const snapshotKey = buildReviewRaceResultSnapshotKey(date, feedVenue.venue, liveFeedRace.raceNo);
      const feedRace = mergeReviewRaceWithSnapshot(liveFeedRace, raceResultSnapshotMap[snapshotKey]);
      const resultRecord = resultValues
        .filter(
          (item) =>
            normalizeVenueName(item.venue) === key &&
            item.raceNumber === liveFeedRace.raceNo
        )
        .sort((a, b) => (b.savedAt ?? "").localeCompare(a.savedAt ?? ""))[0];

      return {
        venue: feedVenue.venue,
        date,
        raceNumber: liveFeedRace.raceNo,
        raceKey: `feed:${date}:${key}:${liveFeedRace.raceNo}`,
        predictionText: "",
        predictionSummary: "",
        feedRace,
        resultRecord,
      };
    });
    const feedResultRecords = races
      .map((race) => race.resultRecord)
      .filter((record): record is PredictionResultRecord => Boolean(record));

    groups.set(key, {
      venue: feedVenue.venue,
      date,
      races,
      grade: feedVenue.grade,
      session: resolveReviewVenueSession(
        feedVenue.session,
        feedVenue.races?.map((race) => race.time) ?? [],
      ),
      title: feedVenue.title,
      startDate: feedVenue.startDate,
      endDate: feedVenue.endDate,
      totalInvestment: feedResultRecords.reduce((sum, record) => sum + (record.investment ?? 0), 0),
      totalPayout: feedResultRecords.reduce((sum, record) => sum + (record.payout ?? 0), 0),
      settledCount: feedResultRecords.filter(
        (record) => record.hitStatus === "hit" || record.hitStatus === "miss",
      ).length,
      hitCount: feedResultRecords.filter((record) => record.hitStatus === "hit").length,
    });
  }

  for (const fileGroup of fileGroups) {
    const key = normalizeVenueName(fileGroup.venue);
    if (groups.has(key)) continue;

    groups.set(key, {
      venue: fileGroup.venue,
      date,
      races: [],
      totalInvestment: 0,
      totalPayout: 0,
      settledCount: 0,
      hitCount: 0,
    });
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

function findReviewFeedRace(
  feed: PredictionTodayFeed | null | undefined,
  race: VenueReviewRace,
): PredictionRaceItem | undefined {
  if (!feed || feed.date !== race.date) return undefined;

  const venue = (feed.venues ?? []).find((item) => normalizeVenueName(item.venue) === normalizeVenueName(race.venue));
  return venue?.races?.find((item) => item.raceNo === race.raceNumber);
}

function buildResultCopy(
  group: VenueReviewGroup,
  reviewWeatherActualMap: ReviewWeatherActualMap = {},
  latestFeed?: PredictionTodayFeed | null,
) {
  const raceNumbers = group.races.map((race) => race.raceNumber);
  const targetRaceLabel = raceNumbers.length > 0
    ? raceNumbers.map((raceNumber) => `${raceNumber}R`).join(", ")
    : "対象なし";
  const lines = [
    "====================",
    "【Review結果まとめ】",
    `対象日: ${group.date || "未取得"}`,
    `対象会場: ${group.venue || "未取得"}`,
    `対象R: ${targetRaceLabel}`,
    "用途: summary作成用",
    "fake補完禁止: 素材にない結果・登録番号・source情報は未取得のまま扱う",
    "====================",
    "",
  ];

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
    const latestFeedRace = findReviewFeedRace(latestFeed, race);
    const finalOddsReference = resolveReviewFinalOddsReference(latestFeedRace, race.feedRace);
    const resultStatusLabel = getReviewResultStatusLabel(race.feedRace);
    const resultOrderLabel = getReviewResultOrderLabel(race.feedRace, resultOrder);
    const hitStatusLabel = getReviewHitStatusLabelForCopy(race.feedRace, hitStatus);
    const hitBetTypeLabel = isReviewAllRefundRace(race.feedRace) ? REVIEW_ALL_REFUND_TEXT : race.resultRecord?.hitBetType ?? "--";
    const hitCombinationLabel = isReviewAllRefundRace(race.feedRace) ? REVIEW_ALL_REFUND_TEXT : race.resultRecord?.hitCombination ?? "--";
    const hitMeaning = hitStatusLabel === "hit"
      ? "的中"
      : hitStatusLabel === "miss"
        ? "不的中"
        : hitStatusLabel;
    const finishRows = getReviewFinishOrderRows(race.feedRace);
    const topResultLabel = (index: number) => {
      const entry = finishRows[index];
      if (!entry) return "未取得";
      const rider = race.feedRace?.riders?.find((item) => String(item.carNo ?? "") === String(entry.carNo ?? ""));
      return `${entry.carNo ?? "未取得"} ${cleanReviewRiderName(entry.name || rider?.fullName || rider?.name)}`;
    };
    const officialResultSource =
      race.feedRace?.result?.officialResultSource
      ?? race.feedRace?.officialResultSource;
    const sourceName =
      race.feedRace?.result?.sourceName
      ?? race.feedRace?.sourceName;
    const sourceType =
      race.feedRace?.result?.sourceType
      ?? race.feedRace?.sourceType;
    const sourceFetchedAt =
      race.feedRace?.result?.sourceFetchedAt
      ?? race.feedRace?.sourceFetchedAt;

    lines.push("====================");
    lines.push(`【${race.raceNumber}R】`);
    lines.push("【結果判定】");
    lines.push(`日付: ${race.date || "未取得"}`);
    lines.push(`会場: ${race.venue || "未取得"}`);
    lines.push(`R: ${race.raceNumber}R`);
    lines.push(`race_id: ${race.resultRecord?.raceId || "未取得"}`);
    lines.push(`レース名: ${race.feedRace?.title ?? group.title ?? "未取得"}`);
    lines.push(`発走: ${race.feedRace?.time ?? "未取得"}`);
    lines.push("結果確定ステータス: " + resultStatusLabel);
    lines.push(`最終判定: ${hitStatusLabel}${hitMeaning !== hitStatusLabel ? `（${hitMeaning}）` : ""}`);
    lines.push("的中券種: " + hitBetTypeLabel);
    lines.push("的中組み合わせ: " + hitCombinationLabel);
    lines.push("3連単照合キー: " + (isReviewAllRefundRace(race.feedRace) ? REVIEW_ALL_REFUND_TEXT : resultOrderLabel));
    lines.push(`投資: ${investment}`);
    lines.push(`払戻: ${payout}`);
    lines.push(`収支: ${profit}`);
    lines.push(`回収率: ${roi}`);
    lines.push("");

    lines.push("【実際の結果】");
    lines.push(`着順: ${resultOrderLabel}`);
    lines.push(`1着: ${topResultLabel(0)}`);
    lines.push(`2着: ${topResultLabel(1)}`);
    lines.push(`3着: ${topResultLabel(2)}`);
    lines.push(`決まり手: ${kimarite}`);
    lines.push(`1着の決まり手: ${kimarite}`);
    lines.push(`2着の決まり手: ${secondKimarite || "未取得"}`);
    lines.push(`S/H/B/SB: ${sbText || "未取得"}`);
    lines.push("");

    lines.push("【全着順】");
    buildReviewFullResultLines(race.feedRace).forEach((line) => lines.push(line));
    lines.push("");

    lines.push("【払戻】");
    buildReviewPayoutLines(race.feedRace).forEach((line) => lines.push(line));
    lines.push("");

    lines.push("【天気・風 / WEATHER ACTUAL】");
    buildReviewWeatherLines(
      race.feedRace,
      race.resultRecord,
      raceWeatherActual
    ).forEach((line) => lines.push(line));
    lines.push("");

    lines.push("【source】");
    lines.push(`source名: ${sourceName || "未取得"}`);
    lines.push(`source取得日時: ${sourceFetchedAt || "未取得"}`);
    lines.push(`source種別: ${sourceType || "unknown"}`);
    lines.push(`official source: ${officialResultSource || "未取得"}`);
    lines.push("");

    lines.push("【最終オッズ参考】");
    buildReviewFinalOddsLines(finalOddsReference).forEach((line) => lines.push(line));
    lines.push("");

    if (race.resultRecord?.memo?.trim()) {
      lines.push("【結果メモ】");
      lines.push(race.resultRecord.memo.trim());
      lines.push("");
    }

    lines.push("====================");
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
  const [selectedDate] = useState(operationalToday);
  const isTodaySelected = selectedDate === operationalToday;
  const isYesterdaySelected = selectedDate === yesterdayReviewDate;
  const isLocalReviewSelected = isTodaySelected || isYesterdaySelected;
  const reviewModeLabel = isLocalReviewSelected
    ? (isTodaySelected ? "TODAY REVIEW" : "YESTERDAY REVIEW")
    : "FILE REVIEW";
  const workbenchLabel = isLocalReviewSelected
    ? (isTodaySelected ? "LIVE WORKBENCH" : "YESTERDAY WORKBENCH")
    : "FILE ARCHIVE";

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
    fetchReviewTodayFeed("no-cache")
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
      reviewFileGroups,
    ),
  [selectedDate, slotMap, resultMap, todayFeed, raceResultSnapshotMap, reviewFileGroups],
);

  useEffect(() => {
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
  }, [reviewFileIndexItems, selectedDate]);

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
    () => {
      const matched = filteredReviewFileGroups.find(
        (group) => normalizeVenueName(group.venue) === normalizeVenueName(selectedVenueName),
      );
      if (matched) return matched;
      return isLocalReviewSelected ? null : filteredReviewFileGroups[0] ?? null;
    },
    [filteredReviewFileGroups, isLocalReviewSelected, selectedVenueName],
  );

  const selectedFileFallbackVenueGroup = useMemo(
    () => {
      const targetVenue = selectedReviewFileGroup?.venue ?? selectedVenueName;
      if (!targetVenue) return null;
      return filteredVenueGroups.find((group) => normalizeVenueName(group.venue) === normalizeVenueName(targetVenue)) ?? null;
    },
    [filteredVenueGroups, selectedReviewFileGroup?.venue, selectedVenueName],
  );

  const selectedDisplayVenueName = isLocalReviewSelected
    ? selectedVenueGroup?.venue
    : selectedReviewFileGroup?.venue;

  const selectedPredictionCopy = useMemo(
    () => {
      if (isLocalReviewSelected) {
        if (selectedVenueGroup?.races.some((race) => race.predictionText.trim())) {
          return buildPredictionCopy(selectedVenueGroup);
        }
        return selectedReviewFileGroup?.predictionText ?? "";
      }
      return selectedReviewFileGroup?.predictionText ?? "";
    },
    [isLocalReviewSelected, selectedReviewFileGroup, selectedVenueGroup],
  );
  const selectedResultCopy = useMemo(
    () => {
      if (isLocalReviewSelected) {
        if (selectedVenueGroup?.races.length) {
          return buildResultCopy(
            selectedVenueGroup,
            reviewWeatherActualMap,
            todayFeed,
          );
        }
        return selectedReviewFileGroup?.resultText ?? "";
      }

      const fileResultText = selectedReviewFileGroup?.resultText ?? "";
      if (fileResultText.trim()) return fileResultText;

      return selectedFileFallbackVenueGroup
        ? buildResultCopy(
            selectedFileFallbackVenueGroup,
            reviewWeatherActualMap,
            todayFeed,
          )
        : fileResultText;
    },
    [isLocalReviewSelected, reviewWeatherActualMap, selectedFileFallbackVenueGroup, selectedReviewFileGroup, selectedVenueGroup, todayFeed],
  );

  const selectedReviewReadiness = useMemo(() => {
    const sourceGroup = isLocalReviewSelected ? selectedVenueGroup : selectedFileFallbackVenueGroup;
    const sourceRaces = sourceGroup?.races ?? [];
    const predictionSections = parseReviewCopySections(selectedReviewFileGroup?.predictionText ?? "");
    const resultSections = parseReviewCopySections(selectedReviewFileGroup?.resultText ?? "");
    const targetVenue = selectedDisplayVenueName ?? sourceGroup?.venue;
    const feedVenue = todayFeed?.date === selectedDate && targetVenue
      ? todayFeed.venues.find((venue) => normalizeVenueName(venue.venue) === normalizeVenueName(targetVenue))
      : undefined;
    const savedResultRecords = targetVenue
      ? Object.values(resultMap).filter(
          (record) =>
            record.date === selectedDate &&
            normalizeVenueName(record.venue) === normalizeVenueName(targetVenue),
        )
      : [];
    const targetRaceNumbers = new Set<number>();

    sourceRaces.forEach((race) => targetRaceNumbers.add(race.raceNumber));
    feedVenue?.races?.forEach((race) => targetRaceNumbers.add(race.raceNo));
    savedResultRecords.forEach((record) => targetRaceNumbers.add(record.raceNumber));
    predictionSections.forEach((section) => targetRaceNumbers.add(section.raceNumber));
    resultSections.forEach((section) => targetRaceNumbers.add(section.raceNumber));

    const predictionSectionMap = new Map(
      predictionSections.map((section) => [section.raceNumber, section.text]),
    );
    const resultSectionMap = new Map(
      resultSections.map((section) => [section.raceNumber, section.text]),
    );
    const racesByNumber = new Map(sourceRaces.map((race) => [race.raceNumber, race]));
    const feedRacesByNumber = new Map((feedVenue?.races ?? []).map((race) => [race.raceNo, race]));
    const resultRecordsByNumber = new Map(
      [...savedResultRecords]
        .sort((a, b) => (a.savedAt ?? "").localeCompare(b.savedAt ?? ""))
        .map((record) => [record.raceNumber, record]),
    );
    const raceNumbers = [...targetRaceNumbers].sort((a, b) => a - b);
    const predictionMissingRaceNumbers: number[] = [];
    const resultMissingRaceNumbers: number[] = [];
    let predictionReadyCount = 0;
    let resultReadyCount = 0;

    raceNumbers.forEach((raceNumber) => {
      const sourceRace = racesByNumber.get(raceNumber);
      const latestFeedRace = feedRacesByNumber.get(raceNumber);
      const savedResultRecord = resultRecordsByNumber.get(raceNumber);
      const race = sourceRace
        ? {
            ...sourceRace,
            feedRace: mergeReviewRaceWithSnapshot(latestFeedRace, sourceRace.feedRace),
            resultRecord: savedResultRecord ?? sourceRace.resultRecord,
          }
        : targetVenue
          ? {
              venue: targetVenue,
              date: selectedDate,
              raceNumber,
              raceKey: `readiness:${selectedDate}:${normalizeVenueName(targetVenue)}:${raceNumber}`,
              predictionText: "",
              predictionSummary: "",
              feedRace: latestFeedRace,
              resultRecord: savedResultRecord,
            }
          : undefined;

      if (isPredictionReviewReady(race, predictionSectionMap.get(raceNumber))) {
        predictionReadyCount += 1;
      } else {
        predictionMissingRaceNumbers.push(raceNumber);
      }

      if (isResultReviewReady(race, resultSectionMap.get(raceNumber))) {
        resultReadyCount += 1;
      } else {
        resultMissingRaceNumbers.push(raceNumber);
      }
    });

    return {
      totalRaceCount: raceNumbers.length,
      predictionReadyCount,
      resultReadyCount,
      predictionMissingRaceNumbers,
      resultMissingRaceNumbers,
    };
  }, [
    isLocalReviewSelected,
    resultMap,
    selectedDate,
    selectedDisplayVenueName,
    selectedFileFallbackVenueGroup,
    selectedReviewFileGroup,
    selectedVenueGroup,
    todayFeed,
  ]);

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

  const workbenchResultReadyCount = useMemo(
    () => venueGroups.reduce(
      (total, group) => total + group.races.filter((race) => isResultReviewReady(race)).length,
      0,
    ),
    [venueGroups],
  );
  const workbenchSummaryReadyCount = useMemo(
    () => reviewFileGroups.filter((group) => Boolean(group.summaryText.trim())).length,
    [reviewFileGroups],
  );
  const workbenchMissingCount = Math.max(0, todaySummary.raceCount - workbenchResultReadyCount);

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

  return (
    <div
      style={{
        minHeight: "100vh",
        color: "#111827",
        backgroundColor: "#f6fbff",
        backgroundImage: `
          linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,246,251,0.30) 44%, rgba(246,251,255,0.54) 100%),
          url("${REVIEW_PAGE_BACKGROUND_URL}")
        `,
        backgroundSize: "cover",
        backgroundPosition: "center top",
        backgroundRepeat: "no-repeat",
        backgroundAttachment: "fixed",
      }}
    >
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
                  <div style={{ marginBottom: "10px", fontSize: "14px", fontWeight: 900, color: "#6f52b2" }}>
                    対象日: {selectedDate.replaceAll("-", "/")}
                    <span style={{ marginLeft: "8px", fontSize: "11px", fontWeight: 700, color: "#8b8495" }}>JST 6:00切替</span>
                  </div>
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
                      {isTodaySelected ? "LOCAL STORAGE + TODAY FEED + REVIEW FILES" : isYesterdaySelected ? "LOCAL STORAGE + SNAPSHOT + REVIEW FILES" : "INDEX JSON + TXT + SUMMARY"}
                    </span>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px", marginTop: "260px" }}>
                  <StatCard label="OPERATION DAY" value={formatDateShort(selectedDate)} sub={isTodaySelected ? "本日のレビュー対象日" : isYesterdaySelected ? "昨日のレビュー対象日" : "表示中の保存レビュー日付"} />
                  <StatCard label="TARGETS" value={isLocalReviewSelected ? `${todaySummary.venueCount}会場 / ${todaySummary.raceCount}R` : `${reviewFileSummary.venueCount}会場`} sub={isTodaySelected ? "予想素材・当日フィード・保存ファイルから構成" : isYesterdaySelected ? "昨日の予想素材・スナップショット・保存ファイルから構成" : "index.json に登録された会場ファイルを表示"} />
                  <StatCard label="FILE STATUS" value={isLocalReviewSelected ? `${todaySummary.hitCount}的中 / ${todaySummary.settledCount}照合` : `${reviewFileSummary.loadedTextCount}件読込`} sub={isLocalReviewSelected ? `レポート一時保存 ${reportRecords.length}件` : `登録ファイル ${reviewFileSummary.fileCount}件`} />
                  <StatCard label="MODE" value={isLocalReviewSelected ? "MERGED SOURCES" : "TXT / FETCH"} sub={isTodaySelected ? "localStorage・today.generated.json・review TXTを統合" : isYesterdaySelected ? "localStorage・snapshot・review TXTを統合" : "過去レビューは localStorage に保存しません"} />
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
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.18em", color: "#9a7ad9", marginBottom: "8px" }}>REVIEW WORKBENCH</div>
              <div style={{ fontSize: "26px", fontWeight: 900, color: "#101828" }}>今日の結果整理</div>
              <div style={{ marginTop: "8px", fontSize: "12px", lineHeight: 1.75, color: "#6b7280" }}>
                summary作成に使う結果素材を整理・コピーします。
              </div>
            </div>

            <div style={{ fontSize: "11px", fontWeight: 900, letterSpacing: "0.12em", color: "#8065bd", marginBottom: "10px" }}>今日のレビュー状況</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))", gap: "9px", marginBottom: "16px" }}>
              {[
                { label: "対象日", value: formatDateLabel(selectedDate) },
                { label: "読込モード", value: "MERGED SOURCES" },
                { label: "読込件数", value: `${todaySummary.raceCount}件` },
                { label: "対象会場数", value: `${todaySummary.venueCount}会場` },
                { label: "結果あり件数", value: `${workbenchResultReadyCount}件` },
                { label: "summaryあり件数", value: `${workbenchSummaryReadyCount}件` },
                { label: "未取得件数", value: `${workbenchMissingCount}件` },
              ].map((item) => (
                <div key={item.label} style={{ borderRadius: "17px", border: "1px solid rgba(225,216,240,0.95)", background: "rgba(255,255,255,0.9)", padding: "11px 12px", minWidth: 0 }}>
                  <div style={{ fontSize: "9px", fontWeight: 900, letterSpacing: "0.1em", color: "#9384ae", marginBottom: "5px" }}>{item.label}</div>
                  <div style={{ fontSize: "13px", fontWeight: 900, color: "#172033", lineHeight: 1.45, overflowWrap: "anywhere" }}>{item.value}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gap: "10px" }}>
              <div style={{ borderRadius: "20px", border: "1px solid rgba(213,201,239,0.92)", background: "linear-gradient(135deg, rgba(250,247,255,0.96) 0%, rgba(247,250,255,0.96) 100%)", padding: "14px" }}>
                <div style={{ fontSize: "11px", fontWeight: 900, color: "#6f52b2", marginBottom: "8px" }}>コピー素材</div>
                <div style={{ fontSize: "12px", lineHeight: 1.8, color: "#5f6676" }}>
                  結果まとめコピー / summary用素材 / 予想差分確認
                  <br />
                  払戻・全着順・上がり・着差・決まり手・天気・source情報を保持
                </div>
              </div>
              <div style={{ borderRadius: "20px", border: "1px solid rgba(231,211,222,0.92)", background: "rgba(255,250,252,0.92)", padding: "14px" }}>
                <div style={{ fontSize: "11px", fontWeight: 900, color: "#a44f76", marginBottom: "8px" }}>保護ルール</div>
                <div style={{ fontSize: "12px", lineHeight: 1.8, color: "#685e67" }}>
                  過去レビュー日付フォルダは削除禁止
                  <br />
                  public/data/reviews/** は保護対象
                  <br />
                  fake補完禁止 / source不明は unknown・未取得のまま扱う
                </div>
              </div>
              <div style={{ borderRadius: "16px", background: "rgba(244,240,252,0.72)", padding: "10px 12px", fontSize: "10px", fontWeight: 800, lineHeight: 1.6, color: "#76658f" }}>
                FILE ARCHIVE / INDEX JSON + TXT + SUMMARY の読み込み機能は維持
              </div>
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
              <div>{isLocalReviewSelected ? "予想素材・当日フィード・保存レビューTXTを対象に、" : "選択日付の保存レビューTXTだけを対象に、"}</div>
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
          const fileGroup = reviewFileGroups.find(
            (item) => normalizeVenueName(item.venue) === normalizeVenueName(group.venue),
          );
          const predictionReady =
            group.races.some((race) => race.predictionText.trim()) ||
            Boolean(fileGroup?.predictionText.trim());
          const resultReady =
            group.races.some((race) =>
              Boolean(
                race.resultRecord ||
                race.feedRace?.resultStatus === "confirmed" ||
                race.feedRace?.result?.status === "confirmed"
              )
            ) ||
            Boolean(fileGroup?.resultText.trim());
          const summaryReady = Boolean(fileGroup?.summaryText.trim());
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
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "9px" }}>
                    <span style={{ fontSize: "10px", fontWeight: 900, color: predictionReady ? "#7b5be3" : "#8a8fa1", background: predictionReady ? "rgba(123,91,227,0.1)" : "rgba(238, 240, 245, 0.9)", border: `1px solid ${predictionReady ? "rgba(196, 181, 253, 0.8)" : "rgba(219, 223, 232, 0.92)"}`, borderRadius: "999px", padding: "4px 8px" }}>
                      {predictionReady ? "予想あり" : "予想未登録"}
                    </span>
                    <span style={{ fontSize: "10px", fontWeight: 900, color: resultReady ? "#7b5be3" : "#8a8fa1", background: resultReady ? "rgba(123,91,227,0.1)" : "rgba(238, 240, 245, 0.9)", border: `1px solid ${resultReady ? "rgba(196, 181, 253, 0.8)" : "rgba(219, 223, 232, 0.92)"}`, borderRadius: "999px", padding: "4px 8px" }}>
                      {resultReady ? "結果あり" : "結果なし"}
                    </span>
                    <span style={{ fontSize: "10px", fontWeight: 900, color: summaryReady ? "#bf4f7f" : "#8a8fa1", background: summaryReady ? "rgba(244, 122, 164, 0.1)" : "rgba(238, 240, 245, 0.9)", border: `1px solid ${summaryReady ? "rgba(244, 122, 164, 0.26)" : "rgba(219, 223, 232, 0.92)"}`, borderRadius: "999px", padding: "4px 8px" }}>
                      {summaryReady ? "まとめあり" : "まとめなし"}
                    </span>
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
                        <div style={{ fontSize: "22px", fontWeight: 900, color: "#111827" }}>
                          予想まとめをコピー
                          <span style={{
                            marginLeft: "4px",
                            color: selectedReviewReadiness.totalRaceCount === 0
                              ? "#8a8fa1"
                              : selectedReviewReadiness.predictionReadyCount === selectedReviewReadiness.totalRaceCount
                                ? "#16835b"
                                : selectedReviewReadiness.predictionReadyCount === 0
                                  ? "#c2415d"
                                  : "#b76a12",
                          }}>
                            （{selectedReviewReadiness.predictionReadyCount}/{selectedReviewReadiness.totalRaceCount}）
                          </span>
                        </div>
                        {selectedReviewReadiness.predictionMissingRaceNumbers.length > 0 ? (
                          <div style={{ marginTop: "6px", fontSize: "12px", fontWeight: 700, color: "#b76a12" }}>
                            未入力: {selectedReviewReadiness.predictionMissingRaceNumbers.map((raceNumber) => `${raceNumber}R`).join(", ")}
                          </div>
                        ) : null}
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
                        <div style={{ fontSize: "22px", fontWeight: 900, color: "#111827" }}>
                          結果まとめをコピー
                          <span style={{
                            marginLeft: "4px",
                            color: selectedReviewReadiness.totalRaceCount === 0
                              ? "#8a8fa1"
                              : selectedReviewReadiness.resultReadyCount === selectedReviewReadiness.totalRaceCount
                                ? "#16835b"
                                : selectedReviewReadiness.resultReadyCount === 0
                                  ? "#c2415d"
                                  : "#b76a12",
                          }}>
                            （{selectedReviewReadiness.resultReadyCount}/{selectedReviewReadiness.totalRaceCount}）
                          </span>
                        </div>
                        {selectedReviewReadiness.resultMissingRaceNumbers.length > 0 ? (
                          <div style={{ marginTop: "6px", fontSize: "12px", fontWeight: 700, color: "#b76a12" }}>
                            未反映: {selectedReviewReadiness.resultMissingRaceNumbers.map((raceNumber) => `${raceNumber}R`).join(", ")}
                          </div>
                        ) : null}
                        <div style={{ marginTop: "6px", fontSize: "11px", lineHeight: 1.6, color: "#6d7687" }}>
                          summary用・重要結果情報を保持。内部JSONを除外し、払戻・全着順・上がり・天気を残します。
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
  <button
    onClick={async () => {
      try {
        let copyValue = selectedResultCopy;
        const latestFeed = isTodaySelected ? await fetchReviewTodayFeed("no-store").catch(() => null) : null;
        if (latestFeed) setTodayFeed(latestFeed);

        if (isLocalReviewSelected && selectedVenueGroup) {
          copyValue = buildResultCopy(selectedVenueGroup, reviewWeatherActualMap, latestFeed ?? todayFeed);
        } else if (!copyValue.trim() && selectedFileFallbackVenueGroup) {
          copyValue = buildResultCopy(selectedFileFallbackVenueGroup, reviewWeatherActualMap, latestFeed ?? todayFeed);
        }

        await copyText(copyValue);
        setCopyStatus("結果まとめをコピーしました");
      } catch {
        setCopyStatus("コピーできませんでした");
      }
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
