import { useEffect, useMemo, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { raceScheduleData } from "../data/raceScheduleData";
import type { DailyMetricItem } from "../types/dailyMetrics";
import type { RaceScheduleItem } from "../types/raceSchedule";
import { getRaceEventDayLabel } from "../utils/raceEventDay";

export type CalendarDay = {
  iso: string;
  day: number;
  isCurrentMonth: boolean;
  events: RaceScheduleItem[];
};

export const PAGE_MAX_WIDTH = "2040px";

export const DAILY_METRICS_STORAGE_KEY = "keirin-quartet-daily-metrics";
export const RECENT_PLAYER_IDS_STORAGE_KEY = "kurari-data-labo-recent-player-ids";
export const FAVORITE_PLAYER_IDS_STORAGE_KEY = "kurari-data-labo-favorite-player-ids";
export const COMPARE_PLAYER_IDS_STORAGE_KEY = "kurari-data-labo-compare-player-ids";
export const PREDICTION_SLOT_STORAGE_KEY = "kurari-data-labo-prediction-slots";
export const PREDICTION_RESULT_STORAGE_KEY = "kurari-data-labo-prediction-results";
export const HIT_NOTIFICATION_STORAGE_KEY = "kurari-data-labo-hit-notifications";
export const HIT_NOTIFICATION_NOTIFIED_KEYS_STORAGE_KEY = "kurari-data-labo-hit-notified-keys";
export const PREDICTION_SELECTED_VENUE_STORAGE_KEY = "kurari-data-labo-selected-prediction-venue";
export const PREDICTION_SCROLL_RESET_STORAGE_KEY = "kurari-data-labo-prediction-scroll-reset";
export const PREDICTION_NAVIGATION_TARGET_STORAGE_KEY = "kurari-data-labo-prediction-navigation-target";
export const FAVORITE_RIDER_FEED_CACHE_STORAGE_KEY = "kurari-data-labo-favorite-rider-feed-cache";

const ENABLE_PREDICTION_DEBUG_LOGS = false;
export const toPublicPath = (path: string) => {
  const base = import.meta.env.BASE_URL || "/";
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  return `${normalizedBase}${path.replace(/^\/+/, "")}`;
};

export type DailyMetricsMap = Record<string, DailyMetricItem>;
export type FavoriteRiderMap = Record<string, string[]>;

export const FAVORITE_RIDERS_STORAGE_KEY = "kurari-data-labo-favorite-riders";
export const FAVORITE_RIDER_OPTIONS = ["眞杉匠", "恩田淳平", "片岡迪之"] as const;
export type FavoriteRiderName = (typeof FAVORITE_RIDER_OPTIONS)[number];
export type FavoriteRiderFeedStatus = "scheduled" | "lineup-pending" | "race-fixed";

export const FAVORITE_RIDER_PRIORITY: Record<FavoriteRiderName, number> = {
  "眞杉匠": 0,
  "恩田淳平": 1,
  "片岡迪之": 2,
};


export type FavoriteRiderFeedItem = {
  rider: FavoriteRiderName;
  venue: string;
  startDate: string;
  endDate: string;
  raceNumber?: number;
  status?: FavoriteRiderFeedStatus;
  updatedAt?: string;
};

export type FavoriteRiderDisplayItem = {
  rider: FavoriteRiderName;
  venue: string;
  raceLabel?: string;
  status?: FavoriteRiderFeedStatus;
  updatedAt?: string;
};

export type FavoriteRiderFeedFile = {
  version?: string;
  cachedDate?: string;
  items?: FavoriteRiderLineupOverride[];
};

export const FAVORITE_RIDER_AUTO_REFRESH_DAYS = [1, 15] as const;
export const FAVORITE_RIDER_FEED_JSON_PATH = toPublicPath("/data/favorite-rider-lineup.json");
export const FAVORITE_RIDER_FEED_POLL_INTERVAL_MS = 60 * 1000;
export const FAVORITE_RIDER_FALLBACK_VERSION = "ローカル補完データ";
export const DASHBOARD_CLOCK_TICK_MS = 1000;

const JST_EXPIRY_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const getJstDateTimeParts = (base: Date = new Date()) => {
  const parts = JST_EXPIRY_DATE_TIME_FORMATTER.formatToParts(base);
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
};

const shiftIsoDateByDays = (isoDate: string, days: number) => {
  const base = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(base.getTime())) return isoDate;
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
};

export const getJstNowDate = () => {
  const parts = getJstDateTimeParts();
  return new Date(`${parts.isoDate}T${parts.hour}:${parts.minute}:${parts.second}+09:00`);
};

export const getNextJstSixAMFromSavedAt = (savedAt?: string) => {
  if (!savedAt) return undefined;

  const base = new Date(savedAt);
  if (Number.isNaN(base.getTime())) return undefined;

  const parts = getJstDateTimeParts(base);
  const expireIsoDate = Number(parts.hour) < 6 ? parts.isoDate : shiftIsoDateByDays(parts.isoDate, 1);

  return new Date(`${expireIsoDate}T06:00:00+09:00`);
};

export const isExpiredByJstSixAM = (savedAt?: string) => {
  const expireAt = getNextJstSixAMFromSavedAt(savedAt);
  if (!expireAt) return false;
  return getJstNowDate().getTime() >= expireAt.getTime();
};

export const getJstOperationalDate = (base: Date = new Date()) => {
  const parts = getJstDateTimeParts(base);
  return Number(parts.hour) >= 6 ? parts.isoDate : shiftIsoDateByDays(parts.isoDate, -1);
};

export const getPredictionReviewKeepFromDate = () => {
  return shiftIsoDateByDays(getJstOperationalDate(), -1);
};

export const shouldKeepPredictionReviewDate = (date?: string) => {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return true;
  return date >= getPredictionReviewKeepFromDate();
};

export const DASHBOARD_JST_DATE_FORMATTER = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  weekday: "short",
});

export const DASHBOARD_JST_TIME_FORMATTER = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export type FavoriteRiderLineupOverride = {
  rider: FavoriteRiderName;
  venue: string;
  startDate: string;
  endDate: string;
  raceNumber?: number;
  status?: FavoriteRiderFeedStatus;
  updatedAt?: string;
};

export function formatDashboardDateInJst(date: Date) {
  const parts = DASHBOARD_JST_DATE_FORMATTER.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
  return `${year}年${month}月${day}日（${weekday}）`;
}

export function formatDashboardTimeInJst(date: Date) {
  return DASHBOARD_JST_TIME_FORMATTER.format(date);
}

export function useDashboardNow() {
  const [dashboardNow, setDashboardNow] = useState(() => new Date());

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setDashboardNow(new Date());
    }, DASHBOARD_CLOCK_TICK_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  return dashboardNow;
}

export function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth <= breakpoint;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= breakpoint);
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [breakpoint]);

  return isMobile;
}
export type PredictionTodayFeed = {
  generatedAt?: string;
  date: string;
  venues: PredictionVenueItem[];
};

export type PredictionVenueItem = {
  id: string;
  venue: string;
  venueCode?: string;
  slug?: string;
  title?: string;
  grade?: string;
  startDate?: string;
  endDate?: string;
  session: "day" | "night" | "midnight";
  hasGirls?: boolean;
  note?: string;
  raceNos?: number[];
  raceIds?: string[];
  races: PredictionRaceItem[];
};

export type PredictionRaceItem = {
  raceNo: number;
  time?: string;
  title?: string;
  lineup?: string;
  charilotoLineupRaw?: string;
  oddsparkLineupRaw?: string;
  winticketLineupRaw?: string;
  netkeirinLineupRaw?: string;
  kdreamsLineupRaw?: string;
  isGirls?: boolean;
  sourceNote?: string;
  oddsNote?: string;
  resultNote?: string;
  lead?: string;
  coreBuy?: string;
  coreFade?: string;
  riders?: PredictionRiderItem[];
  oddsPreview?: PredictionOddsPreviewItem[];
  oddsTrifecta?: PredictionTrifectaItem[];
  topOdds?: number | null;
  topTrifectaOdds?: number | null;
  favoriteOdds?: number | null;
  favoriteCombination?: string;
  resultStatus?: "pending" | "confirmed";
  resultTop3?: PredictionRaceResultEntry[];
  payouts?: PredictionRaceResultPayoutItem[];
  result?: PredictionRaceResult;
};

export type PredictionRaceResultPayoutItem = {
  betType?: string;
  combination: string;
  payout: string;
  popularity?: string;
};

export type PredictionRaceResultEntry = {
  place: string;
  carNo: string;
  name: string;
  margin?: string;
  agari?: string;
  kimarite?: string;
  sMark?: boolean;
  hMark?: boolean;
  bMark?: boolean;
};

export type PredictionRaceResultWeatherActual = {
  weather?: string;
  windDirection?: string;
  windSpeed?: string;
  temperature?: string;
  // 追加フィールド: 降水量、取得時刻、参照テキスト、データソース
  precipitation?: string;
  fetchedAt?: string;
  referenceText?: string;
  source?: string;
};

export type PredictionRaceFinishOrderItem = {
  rank: string;
  carNo: string;
  name: string;
  agari?: string;
  gap?: string;
  kimarite?: string;
  mark?: string;
  status?: string;
};

export type PredictionRaceResult = {
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

export const normalizeBetTypeLabel = (value?: string | null) => {
  const normalized = String(value ?? "")
    .replace(/[\s\u3000]+/g, "")
    .replace(/三連単/g, "3連単")
    .replace(/三連複/g, "3連複")
    .replace(/二車単/g, "2車単")
    .replace(/二車複/g, "2車複")
    .trim();

  return normalized;
};

export const findPayoutByBetType = <T extends { betType?: string | null }>(
  payouts?: readonly T[] | null,
  betType?: string | null,
): T | undefined => {
  const normalizedBetType = normalizeBetTypeLabel(betType);
  if (!normalizedBetType || !Array.isArray(payouts)) return undefined;

  return payouts.find((item) => normalizeBetTypeLabel(item?.betType) === normalizedBetType);
};

type RacePayoutLikeItem = {
  betType?: string | null;
  combination?: string | null;
  payout?: string | null;
  amountYen?: number | string | null;
  payoutYen?: number | string | null;
  amount?: number | string | null;
  refund?: number | string | null;
  value?: number | string | null;
  text?: string | null;
  label?: string | null;
  popularity?: string | null;
};

type RacePayoutLikeResult = {
  payout2tan?: RacePayoutLikeItem | string | null;
  payout3tan?: RacePayoutLikeItem | string | null;
  payout3fuku?: RacePayoutLikeItem | string | null;
};

const normalizeRacePayoutItem = (
  payout: RacePayoutLikeItem | string | null | undefined,
  betType: string,
): RacePayoutLikeItem | undefined => {
  if (!payout) return undefined;
  if (typeof payout === "string") {
    return {
      betType,
      payout,
    };
  }
  return payout;
};

export const resolveRacePayoutByBetType = (
  race?: {
    payouts?: readonly RacePayoutLikeItem[] | null;
    result?: RacePayoutLikeResult | null;
  } | null,
  betType?: string | null,
): RacePayoutLikeItem | undefined => {
  const normalizedBetType = normalizeBetTypeLabel(betType);
  if (!race || !normalizedBetType) return undefined;

  if (normalizedBetType === "2車単") {
    return normalizeRacePayoutItem(race.result?.payout2tan, normalizedBetType) ?? findPayoutByBetType(race.payouts, normalizedBetType);
  }

  if (normalizedBetType === "3連単") {
    return normalizeRacePayoutItem(race.result?.payout3tan, normalizedBetType) ?? findPayoutByBetType(race.payouts, normalizedBetType);
  }

  if (normalizedBetType === "3連複") {
    return normalizeRacePayoutItem(race.result?.payout3fuku, normalizedBetType) ?? findPayoutByBetType(race.payouts, normalizedBetType);
  }

  return findPayoutByBetType(race.payouts, normalizedBetType);
};

export type PredictionRiderItem = {
  carNo: string;
  name: string;
  fullName?: string;
  materialMissing?: boolean;
  isPlaceholder?: boolean;
  source?: string;
  style?: string;
  score?: string;
  totalScore?: string | number;
  gearRatio?: string | number;
  comment?: string;
  prefecture?: string;
  age?: string | number;
  term?: string | number;
  grade?: string;
  s?: string | number;
  b?: string | number;
  escape?: string | number;
  nige?: string | number;
  makuri?: string | number;
  sashi?: string | number;
  mark?: string | number;
  wins?: string | number;
  seconds?: string | number;
  thirds?: string | number;
  loses?: string | number;
  starts?: string | number;
  winRate?: string | number;
  quinellaRate?: string | number;
  trifectaRate?: string | number;
  previousRaceSummary?: string;
  previousRaceResults?: PredictionRiderHistoricalRaceItem[];
  yearlyStats?: PredictionRiderStatsSummaryItem | null;
  sameTrackYearlyStats?: PredictionRiderStatsSummaryItem | null;
  localFiveYearStats?: PredictionRiderStatsSummaryItem | null;
  kdreamsRiderNote?: string;
};

export type PredictionRiderHistoricalRaceItem = {
  venue?: string;
  date?: string;
  raceName?: string;
  place?: string;
  agari?: string;
  summary?: string;
};

export type PredictionRiderStatsSummaryItem = {
  score?: string | number;
  starts?: string | number;
  wins?: string | number;
  seconds?: string | number;
  thirds?: string | number;
  losses?: string | number;
  trackLength?: string;
  summary?: string;
  categories?: Record<string, {
    wins?: string | number;
    seconds?: string | number;
    thirds?: string | number;
    losses?: string | number;
  }>;
};

export type PredictionOddsPreviewItem = {
  combo: string;
  odds: string;
  tag?: string;
};

export type PredictionTrifectaItem = {
  combination: string;
  odds: number;
  popularity?: number;
  source?: string;
};

export type PredictionVenueBankIndexItem = {
  venueKey: string;
  venueName: string;
  file: string;
  aliases?: string[];
};

export type PredictionVenueSummary = {
  bankFeature: string;
  target: string;
  caution: string;
  volatility: string;
  bankLength: string;
  bankMemo: string;
  source: "linked" | "loading" | "missing";
};

export type PredictionWeatherData = {
  weatherLabel: string;
  temperatureText: string;
  windSpeedText: string;
  windDirectionText: string;
  precipitationText: string;
  updatedAtText: string;
  referenceText: string;
};

export type PredictionSlotRecord = {
  raceKey: string;
  raceId: string;
  venue: string;
  date: string;
  raceNumber: number;
  predictionText: string;
  predictionJson?: StructuredPrediction;
  savedAt: string;
};

export type PredictionSlotMap = Record<string, PredictionSlotRecord>;

export type PredictionResultHitStatus = "hit" | "miss" | "pending";

export type PredictionResultRecord = {
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
  investmentSource?: "auto" | "manual";
  payout?: number;
  profitLoss?: number;
  roi?: number;
  // 結果確定時に保存した会場天気スナップショット
  weatherActual?: PredictionRaceResultWeatherActual;
  memo: string;
  savedAt: string;
};

export type PredictionResultDraft = {
  manualHitStatus: "auto" | PredictionResultHitStatus;
  resultOrder: string;
  investmentInput: string;
  investmentInputMode: "auto" | "manual";
  payoutInput: string;
  memo: string;
};

export type PredictionBetEntry = {
  index: string;
  betType: "3連単" | "2車単" | string;
  combination: string;
};

export type StructuredPredictionTicketGroup = "厚め" | "本線" | "穴狙い" | "その他";

export type StructuredPredictionTicket = {
  index: string;
  betType: "3連単" | "2車単" | string;
  combination: string;
  group: StructuredPredictionTicketGroup;
  note?: string;
};

export type StructuredPrediction = {
  version: 1;
  source: "manual-jsonize";
  generatedAt: string;
  summary: {
    title?: string;
    lineup?: string;
    scenario?: string;
    memo?: string;
  };
  tickets: StructuredPredictionTicket[];
};

export type PredictionResultMap = Record<string, PredictionResultRecord>;

export type HitNotificationRecord = {
  id: string;
  raceKey: string;
  date: string;
  venue: string;
  raceNumber: number;
  hitBetType?: "3連単" | "2車単";
  hitCombination?: string;
  payout?: number;
  profitLoss?: number;
  payoutAmountYen?: number;
  payoutPopularity?: number;
  payoutText?: string;
  investmentYen?: number;
  roiPercent?: number;
  warningNote?: string;
  createdAt: string;
  read?: boolean;
};

type HitNotificationLookupItem = {
  race?: PredictionRaceItem;
  venue?: PredictionVenueItem;
  predictionText?: string;
  resultRecord?: PredictionResultRecord;
};

const normalizePredictionPayoutCombination = (value?: string | null) => {
  return normalizePredictionTrifectaText(String(value ?? "").replace(/[=＝]/g, "-"));
};

const parsePayoutPopularity = (value: unknown): number | undefined => {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const candidates = [record.popularity, record.rank, record.text, record.label, record.payout, record.value];
    for (const candidate of candidates) {
      const parsed = parsePayoutPopularity(candidate);
      if (parsed !== undefined) return parsed;
    }
  }

  const text = String(value ?? "").trim();
  if (!text) return undefined;

  const parenMatch = text.match(/[（(]\s*(\d+)\s*[)）]/u);
  if (parenMatch?.[1]) {
    const parsed = Number(parenMatch[1]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }

  const exactMatch = text.match(/^\d+$/u);
  if (!exactMatch) return undefined;
  const parsed = Number(exactMatch[0]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const findPayoutByBetTypeAndCombination = <T extends { betType?: string | null; combination?: string | null }>(
  payouts: readonly T[] | null | undefined,
  betType?: string | null,
  combination?: string | null,
): T | undefined => {
  const normalizedBetType = normalizeBetTypeLabel(betType);
  const normalizedCombination = normalizePredictionPayoutCombination(combination);
  if (!normalizedBetType || !normalizedCombination || !Array.isArray(payouts)) return undefined;

  return payouts.find((item) => {
    return normalizeBetTypeLabel(item?.betType) === normalizedBetType
      && normalizePredictionPayoutCombination(item?.combination) === normalizedCombination;
  });
};

const resolveRacePayoutForHit = (
  race?: {
    payouts?: readonly RacePayoutLikeItem[] | null;
    result?: RacePayoutLikeResult | null;
  } | null,
  betType?: string | null,
  combination?: string | null,
): RacePayoutLikeItem | undefined => {
  if (!race || !betType) return undefined;

  const exactPayout = findPayoutByBetTypeAndCombination(race.payouts, betType, combination);
  if (exactPayout) return exactPayout;

  const fallbackPayout = resolveRacePayoutByBetType(race, betType);
  if (!fallbackPayout) return undefined;
  if (!combination) return fallbackPayout;

  const normalizedFallbackCombination = normalizePredictionPayoutCombination(fallbackPayout.combination);
  const normalizedTargetCombination = normalizePredictionPayoutCombination(combination);
  if (!normalizedFallbackCombination || normalizedFallbackCombination === normalizedTargetCombination) {
    return fallbackPayout;
  }

  return undefined;
};

const buildHitNotificationLookup = (
  feed: PredictionTodayFeed | null,
  slotMap: PredictionSlotMap,
  resultMap: PredictionResultMap,
) => {
  const lookup = new Map<string, HitNotificationLookupItem>();
  if (!feed) return lookup;

  feed.venues.forEach((venue) => {
    venue.races.forEach((race) => {
      const slotLookup = findPredictionSlotRecord(slotMap, feed.date, venue, race);
      const resultLookup = findPredictionResultRecord(resultMap, feed.date, venue, race);
      const item: HitNotificationLookupItem = {
        race,
        venue,
        predictionText: slotLookup.record?.predictionText ?? "",
        resultRecord: resultLookup.record,
      };

      getPredictionSlotKeysForLookup(feed.date, venue, race).forEach((key) => {
        lookup.set(key, item);
      });
    });
  });

  return lookup;
};

const resolveHitNotificationRecord = (
  notification: HitNotificationRecord,
  lookupItem?: HitNotificationLookupItem,
): HitNotificationRecord => {
  const resultRecord = lookupItem?.resultRecord;
  const race = lookupItem?.race;
  const hitBetType = resultRecord?.hitBetType ?? notification.hitBetType;
  const hitCombination = resultRecord?.hitCombination ?? notification.hitCombination;
  const payoutItem = resolveRacePayoutForHit(race, hitBetType, hitCombination);
  const canonicalPayout = parsePayoutAmountYen(payoutItem);
  const savedPayoutFromText = parsePayoutAmountYen(notification.payoutText);
  const savedPayout = notification.payoutAmountYen ?? notification.payout;
  const fallbackPayout = canonicalPayout ?? savedPayoutFromText ?? savedPayout;

  const baseRecord: Partial<PredictionResultRecord> = resultRecord ?? {
    raceKey: notification.raceKey,
    raceId: "",
    venue: notification.venue,
    date: notification.date,
    raceNumber: notification.raceNumber,
    resultOrder: race ? extractPredictionRaceResultOrder(race) : "",
    autoHitStatus: "hit",
    hitStatus: "hit",
    hitBetType,
    hitCombination,
    investment: notification.investmentYen,
    payout: fallbackPayout,
    memo: "",
    savedAt: notification.createdAt,
  };

  const resolvedMetrics = resolvePredictionResultMetrics({
    record: {
      ...baseRecord,
      hitBetType,
      hitCombination,
      payout: fallbackPayout,
    },
    race,
    predictionText: lookupItem?.predictionText ?? "",
  });

  const payout = resolvedMetrics.payout ?? fallbackPayout;
  const savedProfitLoss = typeof notification.profitLoss === "number" && Number.isFinite(notification.profitLoss)
    ? notification.profitLoss
    : undefined;
  const savedRoi = typeof notification.roiPercent === "number" && Number.isFinite(notification.roiPercent)
    ? notification.roiPercent
    : undefined;
  const suspiciousSavedPayout = savedPayout !== undefined && savedPayoutFromText !== undefined && savedPayout !== savedPayoutFromText;

  return {
    ...notification,
    hitBetType,
    hitCombination,
    payout,
    profitLoss: resolvedMetrics.profitLoss ?? savedProfitLoss,
    payoutAmountYen: payout,
    payoutPopularity: parsePayoutPopularity(payoutItem?.popularity ?? payoutItem?.payout ?? notification.payoutPopularity),
    payoutText: payoutItem?.payout ?? notification.payoutText,
    investmentYen: resolvedMetrics.investment ?? notification.investmentYen,
    roiPercent: resolvedMetrics.roi ?? savedRoi,
    warningNote: canonicalPayout === undefined && suspiciousSavedPayout
      ? "保存済み払戻を補正して表示中"
      : undefined,
  };
};

export type PredictionResultDailySummary = {
  date: string;
  savedRaceCount: number;
  hitCount: number;
  missCount: number;
  settledRaceCount: number;
  pendingCount: number;
  investment: number;
  payout: number;
  profitLoss: number;
  roi?: number;
  hitRate?: number;
};

export type PredictionResultDailySummaryMap = Record<string, PredictionResultDailySummary>;

export type PredictionResultVenueSummary = {
  venue: string;
  savedRaceCount: number;
  hitCount: number;
  missCount: number;
  settledRaceCount: number;
  pendingCount: number;
  investment: number;
  payout: number;
  profitLoss: number;
  roi?: number;
  hitRate?: number;
};

export type PredictionResultVenueSummaryMap = Record<string, PredictionResultVenueSummary>;

export const PREDICTION_TODAY_DATA_URL = toPublicPath("/data/races/today.generated.json");
export const LOCAL_PREDICTION_TODAY_DATA_URL = toPublicPath("/scripts/debug/today.generated.local.json");
export const PREDICTION_TODAY_DATA_URL_CANDIDATES = import.meta.env.DEV
  ? [LOCAL_PREDICTION_TODAY_DATA_URL, PREDICTION_TODAY_DATA_URL]
  : [PREDICTION_TODAY_DATA_URL];
export const PREDICTION_VENUE_BANK_INDEX_URL = toPublicPath("/data/venues/banks/index.json");
export const PREDICTION_OPEN_METEO_GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
export const PREDICTION_OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
export const PREDICTION_WEATHER_CACHE_TTL_MS = 5 * 60 * 1000;
export const DEFAULT_PREDICTION_MEMO = "・主導権候補:\n・差し注意:\n・荒れ筋:\n・3着抜け注意:";
export const DEFAULT_PREDICTION_VENUE_SUMMARY: PredictionVenueSummary = {
  bankFeature: "",
  target: "",
  caution: "",
  volatility: "",
  bankLength: "",
  bankMemo: "",
  source: "loading",
};

export const EMPTY_FAVORITE_RIDER_FEED: FavoriteRiderFeedItem[] = [];

export const MISSING_PREDICTION_VENUE_SUMMARY: PredictionVenueSummary = {
  bankFeature: "",
  target: "",
  caution: "",
  volatility: "",
  bankLength: "",
  bankMemo: "",
  source: "missing",
};

export const prunePredictionSlotsMap = (map: PredictionSlotMap) => {
  let changed = false;

  const records = Object.entries(map).reduce<PredictionSlotMap>((accumulator, [key, value]) => {
    if (!value || typeof value !== "object") {
      changed = true;
      return accumulator;
    }

    if (!shouldKeepPredictionReviewDate(value.date)) {
      changed = true;
      return accumulator;
     }

    accumulator[key] = value;
    return accumulator;
  }, {});

  return { records, changed };
};

export const prunePredictionResultsMap = (map: PredictionResultMap) => {
  let changed = false;

  const records = Object.entries(map).reduce<PredictionResultMap>((accumulator, [key, value]) => {
    if (!value || typeof value !== "object") {
      changed = true;
      return accumulator;
    }

    if (!shouldKeepPredictionReviewDate(value.date)) {
      changed = true;
      return accumulator;
    }

    accumulator[key] = value;
    return accumulator;
  }, {});

  return { records, changed };
};

export const loadStoredPredictionSlots = (): PredictionSlotMap => {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(PREDICTION_SLOT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const { records, changed } = prunePredictionSlotsMap(parsed as PredictionSlotMap);
    if (changed) {
      try {
        window.localStorage.setItem(PREDICTION_SLOT_STORAGE_KEY, JSON.stringify(records));
      } catch {
        // localStorage write failure is non-fatal
      }
    }
    return records;
  } catch {
    return {};
  }
};

export const saveStoredPredictionSlots = (map: PredictionSlotMap): boolean => {
  if (typeof window === "undefined") return false;
  try {
    const { records } = prunePredictionSlotsMap(map);
    window.localStorage.setItem(PREDICTION_SLOT_STORAGE_KEY, JSON.stringify(records));
    return true;
  } catch (error) {
    console.error("[PredictionSlotStorage] save failed", error);
    return false;
  }
};

export const createDefaultPredictionResultDraft = (): PredictionResultDraft => ({
  manualHitStatus: "auto",
  resultOrder: "",
  investmentInput: "",
  investmentInputMode: "auto",
  payoutInput: "",
  memo: "",
});

export const normalizePredictionResultRecord = (record: PredictionResultRecord): PredictionResultRecord => {
  const investment = typeof record.investment === "number" && Number.isFinite(record.investment)
    ? record.investment
    : undefined;
  const rawPayout = typeof record.payout === "number" && Number.isFinite(record.payout)
    ? record.payout
    : undefined;
  const payout = resolvePredictionEffectivePayout(record.hitStatus, rawPayout);
  const profitLoss = investment !== undefined && payout !== undefined
    ? payout - investment
    : undefined;
  const roi = investment !== undefined && payout !== undefined && investment > 0
    ? (payout / investment) * 100
    : undefined;

  return {
    ...record,
    investment,
    payout,
    profitLoss,
    roi,
  };
};

export const loadStoredPredictionResults = (): PredictionResultMap => {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(PREDICTION_RESULT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const pruned = prunePredictionResultsMap(parsed as PredictionResultMap);

    let missingInvestmentCount = 0;
    let missingPayoutCount = 0;
    let needsResave = pruned.changed;

    const normalized = Object.entries(pruned.records).reduce<PredictionResultMap>((accumulator, [key, value]) => {
      if (!value || typeof value !== "object") return accumulator;
      const raw = value as PredictionResultRecord;

if (raw.hitStatus !== "pending" && raw.investment === undefined) {
  missingInvestmentCount += 1;
  if (ENABLE_PREDICTION_DEBUG_LOGS) {
    console.warn("[PredictionResultMigration] missing investment", {
      raceKey: raw.raceKey,
      venue: raw.venue,
      raceNumber: raw.raceNumber,
      date: raw.date,
    });
  }
  needsResave = true;
}

if (raw.hitStatus === "miss" && raw.payout && raw.payout > 0) {
  missingPayoutCount += 1;
  needsResave = true;
}

accumulator[key] = normalizePredictionResultRecord(raw);
      return accumulator;
    }, {});

if (missingInvestmentCount > 0 || missingPayoutCount > 0) {
  if (ENABLE_PREDICTION_DEBUG_LOGS) {
    console.info("[PredictionResultMigration] 補正件数", {
      missingInvestmentCount,
      missPayoutCorrectedCount: missingPayoutCount,
    });
  }
}

    if (needsResave) {
      try {
        window.localStorage.setItem(PREDICTION_RESULT_STORAGE_KEY, JSON.stringify(normalized));
      } catch {
        // localStorage write failure is non-fatal
      }
    }

    return normalized;
  } catch {
    return {};
  }
};

export const saveStoredPredictionResults = (map: PredictionResultMap): boolean => {
  if (typeof window === "undefined") return false;
  try {
    const { records } = prunePredictionResultsMap(map);
    window.localStorage.setItem(PREDICTION_RESULT_STORAGE_KEY, JSON.stringify(records));
    return true;
  } catch (error) {
    console.error("[PredictionResultStorage] save failed", error);
    return false;
  }
};

export const loadHitNotifications = (): HitNotificationRecord[] => {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(HIT_NOTIFICATION_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const validItems = parsed.filter((item: unknown): item is HitNotificationRecord => {
      if (!item || typeof item !== "object") return false;

      const record = item as Partial<HitNotificationRecord>;

      return (
        typeof record.id === "string" &&
        typeof record.raceKey === "string" &&
        typeof record.date === "string" &&
        typeof record.venue === "string" &&
        typeof record.raceNumber === "number" &&
        typeof record.createdAt === "string"
      );
    });

    const records = validItems.filter((item) => shouldKeepPredictionReviewDate(item.date)).slice(0, 200);

    if (records.length !== validItems.length) {
      try {
        window.localStorage.setItem(HIT_NOTIFICATION_STORAGE_KEY, JSON.stringify(records));
      } catch {
        // localStorage write failure is non-fatal
      }
    }

    return records;
  } catch {
    return [];
  }
};

export const saveHitNotifications = (items: HitNotificationRecord[]) => {
  if (typeof window === "undefined") return;
  const records = items.filter((item) => shouldKeepPredictionReviewDate(item.date)).slice(0, 200);
  try {
    window.localStorage.setItem(HIT_NOTIFICATION_STORAGE_KEY, JSON.stringify(records));
  } catch (error) {
    console.warn("[HitNotificationStorage] save failed", error);
  }
};

export const loadHitNotificationKeys = (): string[] => {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(HIT_NOTIFICATION_NOTIFIED_KEYS_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const activeKeySet = new Set(loadHitNotifications().map((item) => item.raceKey));
    const normalized = parsed.filter((item: unknown): item is string => typeof item === "string");
    const keys = normalized.filter((key) => activeKeySet.has(key));

    if (keys.length !== normalized.length) {
      try {
        window.localStorage.setItem(HIT_NOTIFICATION_NOTIFIED_KEYS_STORAGE_KEY, JSON.stringify(keys));
      } catch {
        // localStorage write failure is non-fatal
      }
    }

    return keys;
  } catch {
    return [];
  }
};

export const saveHitNotificationKeys = (keys: string[]) => {
  if (typeof window === "undefined") return;
  const activeKeySet = new Set(loadHitNotifications().map((item) => item.raceKey));
  const records = Array.from(new Set(keys.filter((key) => activeKeySet.has(key))));
  try {
    window.localStorage.setItem(HIT_NOTIFICATION_NOTIFIED_KEYS_STORAGE_KEY, JSON.stringify(records));
  } catch (error) {
    console.warn("[HitNotificationStorage] key save failed", error);
  }
};

export const resolvePredictionEffectivePayout = (hitStatus: PredictionResultHitStatus, payout?: number) => {
  if (hitStatus === "miss") return 0;
  return payout;
};

export const getPredictionResultAggregate = (map: PredictionResultMap, targetDate?: string) => {
  const dailySummaryMap = aggregatePredictionResultsByDate(map);
  return {
    dailySummaryMap,
    dailySummary: targetDate ? dailySummaryMap[targetDate] : undefined,
    venueSummaryMap: targetDate ? aggregatePredictionResultsByVenueForDate(map, targetDate) : undefined,
  };
};

export const buildPredictionResultMapWithBackfilledInvestment = (
  resultMap: PredictionResultMap,
  slotMap: PredictionSlotMap,
): PredictionResultMap => {
  return Object.fromEntries(
    Object.entries(resultMap).map(([key, rawRecord]) => {
      const record = normalizePredictionResultRecord(rawRecord);

      if (record.investment !== undefined) {
        return [key, record];
      }

      const slot = slotMap[key];
      const ticketCount = slot?.predictionText
        ? extractPredictionBetEntriesWithFallback(slot.predictionText).length
        : 0;

      const backfilledInvestment = ticketCount > 0 ? ticketCount * 100 : undefined;
      const payout = resolvePredictionEffectivePayout(record.hitStatus, record.payout);
      const profitLoss =
        backfilledInvestment !== undefined && payout !== undefined
          ? payout - backfilledInvestment
          : record.profitLoss;
      const roi =
        backfilledInvestment !== undefined && payout !== undefined && backfilledInvestment > 0
          ? (payout / backfilledInvestment) * 100
          : record.roi;

      return [
        key,
        {
          ...record,
          investment: backfilledInvestment,
          payout,
          profitLoss,
          roi,
        },
      ];
    }),
  );
};

export const aggregatePredictionResultsByDate = (map: PredictionResultMap): PredictionResultDailySummaryMap => {
  return Object.values(map).reduce<PredictionResultDailySummaryMap>((accumulator, rawItem) => {
    const item = normalizePredictionResultRecord(rawItem);
    const current = accumulator[item.date] ?? {
      date: item.date,
      savedRaceCount: 0,
      hitCount: 0,
      missCount: 0,
      settledRaceCount: 0,
      pendingCount: 0,
      investment: 0,
      payout: 0,
      profitLoss: 0,
    };
    const effectivePayout = resolvePredictionEffectivePayout(item.hitStatus, item.payout);

    current.savedRaceCount += 1;
    current.investment += item.investment ?? 0;
    current.payout += item.hitStatus === "pending" ? 0 : effectivePayout ?? 0;

    if (item.hitStatus === "hit") {
      current.hitCount += 1;
      current.settledRaceCount += 1;
    } else if (item.hitStatus === "miss") {
      current.missCount += 1;
      current.settledRaceCount += 1;
    } else {
      current.pendingCount += 1;
    }

    current.profitLoss = current.payout - current.investment;
    current.hitRate = current.settledRaceCount > 0 ? (current.hitCount / current.settledRaceCount) * 100 : undefined;
    current.roi = current.investment > 0 ? (current.payout / current.investment) * 100 : undefined;
    accumulator[item.date] = current;
    return accumulator;
  }, {});
};

export const resolveCalendarMetricsDisplay = (summary?: PredictionResultDailySummary, fallback?: DailyMetricItem) => {
  if (summary) {
    return {
      source: "prediction" as const,
      raceCount: summary.savedRaceCount,
      profitLoss: summary.profitLoss,
      hitRate: summary.hitRate,
      recoveryRate: summary.roi,
    };
  }

  return {
    source: fallback ? "daily-metrics" as const : "empty" as const,
    raceCount: undefined,
    profitLoss: fallback?.profitLoss,
    hitRate: fallback?.hitRate,
    recoveryRate: fallback?.recoveryRate,
  };
};

export const buildPredictionSlotRaceKey = (date: string, venue: PredictionVenueItem | null | undefined, race: PredictionRaceItem | null | undefined) => {
  if (!venue || !race) return "";
  const raceId = venue.raceIds?.[race.raceNo - 1] ?? "";
  if (raceId) return `prediction-slot:${raceId}`;
  return `prediction-slot:${date}:${normalizePredictionVenueName(venue.venue)}:${race.raceNo}`;
};

export const buildLegacyPredictionSlotRaceKey = (date: string, venue: PredictionVenueItem | null | undefined, race: PredictionRaceItem | null | undefined) => {
  if (!venue || !race) return "";
  return `prediction-slot:${date}:${normalizePredictionVenueName(venue.venue)}:${race.raceNo}`;
};

export const getPredictionSlotKeysForLookup = (date: string, venue: PredictionVenueItem | null | undefined, race: PredictionRaceItem | null | undefined) => {
  const keys = new Set<string>();
  const currentKey = buildPredictionSlotRaceKey(date, venue, race);
  const legacyKey = buildLegacyPredictionSlotRaceKey(date, venue, race);
  if (currentKey) keys.add(currentKey);
  if (legacyKey) keys.add(legacyKey);
  return Array.from(keys);
};

export const findPredictionSlotRecord = (
  map: PredictionSlotMap,
  date: string,
  venue: PredictionVenueItem | null | undefined,
  race: PredictionRaceItem | null | undefined,
) => {
  const keys = getPredictionSlotKeysForLookup(date, venue, race);
  for (const key of keys) {
    if (map[key]) return { key, record: map[key] };
  }
  return { key: keys[0] ?? "", record: undefined };
};

export const findPredictionResultRecord = (
  map: PredictionResultMap,
  date: string,
  venue: PredictionVenueItem | null | undefined,
  race: PredictionRaceItem | null | undefined,
) => {
  const keys = getPredictionSlotKeysForLookup(date, venue, race);
  for (const key of keys) {
    if (map[key]) return { key, record: map[key] };
  }
  return { key: keys[0] ?? "", record: undefined };
};

export const extractPredictionRaceResultOrder = (race: PredictionRaceItem | null | undefined) => {
  const order = (race?.result?.finishOrder ?? [])
    .map((item) => typeof item === "string" ? item : item?.carNo)
    .filter(Boolean);
  if (order.length >= 3) return normalizePredictionTrifectaText(order.slice(0, 3).join("-"));
  const top3Order = race?.resultTop3?.map((item) => item.carNo).filter(Boolean) ?? [];
  if (top3Order.length >= 3) return normalizePredictionTrifectaText(top3Order.slice(0, 3).join("-"));
  return "";
};

export const parsePayoutAmountYen = (value: unknown): number | undefined => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const candidates = [
      record.amountYen,
      record.payoutYen,
      record.amount,
      record.payout,
      record.refund,
      record.value,
      record.text,
      record.label,
    ];

    for (const candidate of candidates) {
      const parsed = parsePayoutAmountYen(candidate);
      if (parsed !== undefined) return parsed;
    }
  }

  const text = String(value ?? "").trim();
  if (!text) return undefined;

  const yenMatch = text.match(/([\d,]+)\s*円/u);
  if (yenMatch?.[1]) {
    const amount = Number(yenMatch[1].replace(/,/g, ""));
    return Number.isFinite(amount) ? amount : undefined;
  }

  const beforePopularity = text.split(/[（(]/u)[0] ?? text;
  const amountMatch = beforePopularity.match(/([\d,]+)\s*$/u);
  if (amountMatch?.[1]) {
    const amount = Number(amountMatch[1].replace(/,/g, ""));
    return Number.isFinite(amount) ? amount : undefined;
  }

  return undefined;
};

export const parsePredictionPayoutAmount = (value?: string | null) => parsePayoutAmountYen(value);

export const resolvePredictionRaceGeneratedResult = (
  date: string,
  venue: PredictionVenueItem | null | undefined,
  race: PredictionRaceItem | null | undefined,
  predictionText: string,
) => {
  if (!venue || !race) return null;
  const raceKey = buildPredictionSlotRaceKey(date, venue, race);
  if (!raceKey) return null;
  const resultOrder = extractPredictionRaceResultOrder(race);
  const resultStatus = race.result?.status ?? race.resultStatus ?? (resultOrder ? "confirmed" : "pending");
const autoHitDetail = resolvePredictionAutoHitDetail(predictionText, resultOrder);
const matchedMetrics = resolvePredictionResultMetrics({
  record: {
    resultOrder,
    autoHitStatus: autoHitDetail.status,
    hitStatus: autoHitDetail.status,
    hitBetType: autoHitDetail.hitBetType,
    hitCombination: autoHitDetail.hitCombination,
    investment: extractPredictionBetEntriesWithFallback(predictionText).length * 100,
  },
  race,
  predictionText,
});

return {
  raceKey,
  raceId: venue.raceIds?.[race.raceNo - 1] ?? "",
  venue: venue.venue,
  date,
  raceNumber: race.raceNo,
  resultStatus,
  resultOrder,
  autoHitStatus: autoHitDetail.status,
  payout: matchedMetrics.payout,
  kimarite: race.result?.kimarite ?? race.resultTop3?.[0]?.kimarite ?? "",
  finalizedAt: race.result?.finalizedAt ?? "",
};
};

export const buildPredictionGeneratedResultMemo = (generatedResult: ReturnType<typeof resolvePredictionRaceGeneratedResult>, predictionText = "") => {
  if (!generatedResult) return "";
  const autoHitDetail = resolvePredictionAutoHitDetail(predictionText, generatedResult.resultOrder);
  const lines = ["自動取得結果"];
  if (autoHitDetail.status === "hit" && autoHitDetail.hitBetType) {
    lines.push(`${autoHitDetail.hitBetType}的中`);
  }
  if (generatedResult.kimarite) {
    lines.push(`決まり手: ${generatedResult.kimarite}`);
  }
  if (generatedResult.finalizedAt) {
    lines.push(`確定: ${generatedResult.finalizedAt}`);
  }
  return lines.join("\n");
};

export const mergePredictionResultMemo = (savedMemo: string, generatedMemo: string) => {
  const normalizedSavedMemo = String(savedMemo ?? "").trim();
  const normalizedGeneratedMemo = String(generatedMemo ?? "").trim();
  if (!normalizedSavedMemo) return normalizedGeneratedMemo;
  if (!normalizedGeneratedMemo) return normalizedSavedMemo;
  if (normalizedSavedMemo.includes(normalizedGeneratedMemo)) return normalizedSavedMemo;
  return `${normalizedSavedMemo}\n\n${normalizedGeneratedMemo}`;
};

export const mergeGeneratedResultsIntoSavedPredictionResults = (
  currentMap: PredictionResultMap,
  feed: PredictionTodayFeed | null,
  savedSlots: PredictionSlotMap,
): { nextMap: PredictionResultMap; updatedCount: number; hitCount: number; missCount: number; pendingCount: number; missingPredictionTextCount: number } => {
  if (!feed) return { nextMap: currentMap, updatedCount: 0, hitCount: 0, missCount: 0, pendingCount: 0, missingPredictionTextCount: 0 };

  let updatedCount = 0;
  let hitCount = 0;
  let missCount = 0;
  let pendingCount = 0;
  let missingPredictionTextCount = 0;
  let hasChange = false;
  const nextMap = { ...currentMap };

  for (const venue of feed.venues) {
    for (const race of venue.races) {
      const raceKey = buildPredictionSlotRaceKey(feed.date, venue, race);
      if (!raceKey) continue;
      const saved = currentMap[raceKey];
      if (!saved) continue;

      const slotLookup = findPredictionSlotRecord(savedSlots, feed.date, venue, race);
      const predictionText = resolvePredictionSourceText(slotLookup.record?.predictionText ?? "", "");
      const resolvedSlotKey = slotLookup.key;
      if (!predictionText.trim()) {
  missingPredictionTextCount += 1;
  if (ENABLE_PREDICTION_DEBUG_LOGS) {
    console.warn("[PredictionAutoSettle] missing predictionText for raceKey", {
      raceKey,
      resolvedSlotKey,
      venue: venue.venue,
      raceNo: race.raceNo,
    });
  }
}
      const generated = resolvePredictionRaceGeneratedResult(feed.date, venue, race, predictionText);
const needsUpdate = saved.hitStatus === "pending" || !saved.resultOrder;
const autoHitDetail: { status: PredictionResultHitStatus; hitBetType?: "3連単" | "2車単"; hitCombination?: string } = generated?.resultOrder
  ? resolvePredictionAutoHitDetail(predictionText, generated.resultOrder)
  : { status: "pending" };
const autoHitStatus = autoHitDetail.status;

const effectiveHitStatusPreview: PredictionResultHitStatus =
  saved.manualHitStatus !== undefined ? saved.manualHitStatus : autoHitStatus;

const expectedMetrics = resolvePredictionResultMetrics({
  record: {
    ...saved,
    resultOrder: generated?.resultOrder ?? saved.resultOrder,
    hitStatus: effectiveHitStatusPreview,
    hitBetType: autoHitDetail.status === "hit" ? autoHitDetail.hitBetType : saved.hitBetType,
    hitCombination: autoHitDetail.status === "hit" ? autoHitDetail.hitCombination : saved.hitCombination,
  },
  race,
  predictionText,
});

const expectedPayout = expectedMetrics.payout;

const needsPayoutResync =
  Boolean(generated?.resultOrder) &&
  effectiveHitStatusPreview !== "pending" &&
  saved.payout !== expectedPayout;

      if (ENABLE_PREDICTION_DEBUG_LOGS) {
  console.info("[PredictionAutoSettleRace]", {
    raceKey,
    resolvedSlotKey,
    venue: venue.venue,
    raceNo: race.raceNo,
    hasSavedResult: Boolean(saved),
    hasSavedSlot: Boolean(slotLookup.record),
    hasPredictionText: Boolean(predictionText.trim()),
    hasGeneratedResultOrder: Boolean(generated?.resultOrder),
    autoHitStatus,
    needsUpdate,
  });
}

      if (!generated || !generated.resultOrder) {
        if (saved.hitStatus === "pending") pendingCount += 1;
        continue;
      }

      if (!needsUpdate && !needsPayoutResync) continue;

      // Case: has resultOrder but no predictionText → update result fields only, keep hitStatus pending
      if (!predictionText.trim()) {
        const generatedMemoNoPred = buildPredictionGeneratedResultMemo(generated, "");
        const mergedMemoNoPred = mergePredictionResultMemo(saved.memo ?? "", generatedMemoNoPred);
        nextMap[raceKey] = normalizePredictionResultRecord({
          ...saved,
          resultOrder: generated.resultOrder,
          memo: mergedMemoNoPred,
          savedAt: new Date().toISOString(),
        });
        hasChange = true;
        updatedCount += 1;
        pendingCount += 1;
        continue;
      }

      // Normal path: has predictionText → full resolution
      // Respect manual override; undefined means "auto"
      const effectiveHitStatus: PredictionResultHitStatus =
        saved.manualHitStatus !== undefined ? saved.manualHitStatus : autoHitStatus;

      const generatedMemo = buildPredictionGeneratedResultMemo(generated, predictionText);
      const mergedMemo = mergePredictionResultMemo(saved.memo ?? "", generatedMemo);

      nextMap[raceKey] = normalizePredictionResultRecord({
        ...saved,
        resultOrder: generated.resultOrder,
        autoHitStatus,
        hitStatus: effectiveHitStatus,
        hitBetType: autoHitDetail.status === "hit" ? autoHitDetail.hitBetType : undefined,
        hitCombination: autoHitDetail.status === "hit" ? autoHitDetail.hitCombination : undefined,
        payout: expectedMetrics.payout,
        profitLoss: expectedMetrics.profitLoss,
        roi: expectedMetrics.roi,
        memo: mergedMemo,
        savedAt: new Date().toISOString(),
      });

      hasChange = true;
      updatedCount += 1;
      if (effectiveHitStatus === "hit") hitCount += 1;
      else if (effectiveHitStatus === "miss") missCount += 1;
    }
  }

  return { nextMap: hasChange ? nextMap : currentMap, updatedCount, hitCount, missCount, pendingCount, missingPredictionTextCount };
};

export const formatPredictionSlotSavedAt = (value?: string | null) => {
  if (!value) return "未保存";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const parsePredictionResultAmount = (value: string) => {
  // "1,000"  "1,000円"  "1000円"  " 1000 円 " など安全に数値化する
  const normalized = value.replace(/[,，¥￥]/g, "").replace(/円/g, "").trim();
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const formatPredictionResultYen = (value?: number) => {
  if (value === undefined) return "--";
  return `${value.toLocaleString()}円`;
};

export const formatPredictionResultProfitLoss = (value?: number) => {
  if (value === undefined) return "--";
  if (value === 0) return "0円";
  return `${value > 0 ? "+" : "-"}${Math.abs(value).toLocaleString()}円`;
};

export const formatPredictionResultRoi = (value?: number) => {
  if (value === undefined) return "--";
  return `${value.toFixed(1)}%`;
};

export const getPredictionResultHitStatusLabel = (status: PredictionResultHitStatus) => {
  switch (status) {
    case "hit":
      return "的中";
    case "miss":
      return "不的中";
    default:
      return "保留";
  }
};

export const normalizePredictionTrifectaText = (value: string) => value.normalize("NFKC").replace(/[→＞ー−–]/g, "-").replace(/\s+/g, "").trim();

export const extractPredictionBetEntries = (predictionText: string): PredictionBetEntry[] => {
  const normalizedText = String(predictionText ?? "").replace(/\r\n/g, "\n").normalize("NFKC");
  const isPredictionBetBlockStart = (line: string) => {
    const normalizedLine = line.replace(/[【】]/g, "").trim();
    return /^買い目/.test(normalizedLine);
  };
  const isPredictionBetBlockEnd = (line: string) => {
    const normalizedLine = line.replace(/[【】]/g, "").trim();
    return /^(タグ|結果|メモ|振り返り)/.test(normalizedLine);
  };

  const blockLines: string[] = [];
  let inBetBlock = false;

  for (const rawLine of normalizedText.split("\n")) {
    const line = rawLine.trim();
    if (!inBetBlock) {
      if (isPredictionBetBlockStart(line)) {
        inBetBlock = true;
      }
      continue;
    }

    if (isPredictionBetBlockEnd(line)) {
      break;
    }

    blockLines.push(line);
  }

  if (blockLines.length === 0) return [];

  const lines = blockLines
    .map((line) => line.replace(/（[^）]*）|\([^)]*\)/g, " ").trim());

  const entries: PredictionBetEntry[] = [];
  const seen = new Set<string>();
  let currentBetType: string = "3連単"; // default until a heading overrides it

  for (const line of lines) {
    if (!line) continue;

    // Bet-type heading line: strip 【】 before checking so 【3連単（厚め）】 and 3連単（厚め）
    // are both recognised as headings. Must NOT be a numbered ticket line.
    const lineWithoutBrackets = line.replace(/[【】]/g, "").trim();
    if (/3連単/.test(lineWithoutBrackets) && !/^\d{1,2}\s/.test(lineWithoutBrackets)) {
      currentBetType = "3連単";
      continue;
    }
    if (/2車単/.test(lineWithoutBrackets) && !/^\d{1,2}\s/.test(lineWithoutBrackets)) {
      currentBetType = "2車単";
      continue;
    }

    // Numbered ticket line: "NN [betType] combination" or "NN combination"
    // combination can be X-Y-Z (trifecta) or X-Y (exacta)
    const withType = line.match(/^(\d{1,2})\s+(3連単|2車単)\s+([1-9]\s*[-→＞ー−–]\s*[1-9](?:\s*[-→＞ー−–]\s*[1-9])?)(?:\s|$)/);
    if (withType) {
      const betType = withType[2];
      const combination = normalizePredictionTrifectaText(withType[3]);
      const index = withType[1].padStart(2, "0");
      const key = `${index}:${betType}:${combination}`;
      if (!seen.has(key)) { seen.add(key); entries.push({ index, betType, combination }); }
      continue;
    }

    const noType = line.match(/^(\d{1,2})\s+([1-9]\s*[-→＞ー−–]\s*[1-9](?:\s*[-→＞ー−–]\s*[1-9])?)(?:\s|$)/);
    if (noType) {
      const betType = currentBetType;
      const combination = normalizePredictionTrifectaText(noType[2]);
      const index = noType[1].padStart(2, "0");
      const key = `${index}:${betType}:${combination}`;
      if (!seen.has(key)) { seen.add(key); entries.push({ index, betType, combination }); }
    }
  }

  return entries;
};

export const extractPredictionTrifectaCandidates = (value: string) => {
  const normalized = value.replace(/[→＞ー−–]/g, "-");
  const matches = normalized.match(/\b[1-9]\s*-\s*[1-9]\s*-\s*[1-9]\b/g) ?? [];
  return Array.from(new Set(matches.map((item) => normalizePredictionTrifectaText(item)).filter(Boolean)));
};

export const extractPredictionBetEntriesWithFallback = (predictionText: string): PredictionBetEntry[] => {
  const entries = extractPredictionBetEntries(predictionText);
  if (entries.length > 0) return entries;
  return extractPredictionTrifectaCandidates(predictionText).map((combination, index) => ({
    index: String(index + 1).padStart(2, "0"),
    betType: "3連単",
    combination,
  }));
};

export const detectStructuredPredictionTicketGroup = (sourceLine: string): StructuredPredictionTicketGroup => {
  const normalized = sourceLine.normalize("NFKC");

  if (/厚め/.test(normalized)) return "厚め";
  if (/本線/.test(normalized)) return "本線";
  if (/穴|穴狙い|大穴/.test(normalized)) return "穴狙い";

  return "その他";
};

export const extractStructuredPredictionSummary = (predictionText: string) => {
  const text = String(predictionText ?? "").replace(/\r\n/g, "\n").normalize("NFKC");
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const title =
    lines.find((line) => /予想|買い目|結論/.test(line) && line.length <= 60) ??
    lines[0] ??
    "";

  const lineup =
    lines.find((line) => /並び|ライン/.test(line)) ??
    "";

  const scenario =
    lines.find((line) => /展開|シナリオ|主導権|逃げ|捲り|差し/.test(line)) ??
    "";

  const memo =
    lines.find((line) => /メモ|ひとこと|注意|狙い|ポイント/.test(line)) ??
    "";

  return {
    title,
    lineup,
    scenario,
    memo,
  };
};

export const parsePredictionTextToStructuredPrediction = (
  predictionText: string,
): StructuredPrediction => {
  const text = String(predictionText ?? "").replace(/\r\n/g, "\n").normalize("NFKC");
  const betEntries = extractPredictionBetEntriesWithFallback(text);

  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const tickets: StructuredPredictionTicket[] = betEntries.map((entry) => {
    const relatedLine =
      lines.find((line) => line.includes(entry.combination)) ??
      lines.find((line) => line.includes(entry.index)) ??
      "";

    return {
      index: entry.index,
      betType: entry.betType,
      combination: entry.combination,
      group: detectStructuredPredictionTicketGroup(relatedLine),
      note: relatedLine.replace(entry.combination, "").trim() || undefined,
    };
  });

  return {
    version: 1,
    source: "manual-jsonize",
    generatedAt: new Date().toISOString(),
    summary: extractStructuredPredictionSummary(text),
    tickets,
  };
};

export const scorePredictionBetEntries = (entries: PredictionBetEntry[]) => {
  const trifectaCount = entries.filter((item) => item.betType === "3連単").length;
  const exactaCount = entries.filter((item) => item.betType === "2車単").length;
  return trifectaCount * 10 + exactaCount * 20 + entries.length;
};

export const resolvePredictionSourceText = (
  slotText: string,
  draftText: string,
): string => {
  const normalizedSlot = String(slotText ?? "").trim();
  const normalizedDraft = String(draftText ?? "").trim();

  const slotEntries = extractPredictionBetEntries(normalizedSlot);
  const draftEntries = extractPredictionBetEntries(normalizedDraft);
  const slotExacta = slotEntries.filter((item) => item.betType === "2\u8eca\u5358").length;
  const draftExacta = draftEntries.filter((item) => item.betType === "2\u8eca\u5358").length;

  // Priority: more exacta (2車単) → more total → draft → slot
  if (draftExacta > slotExacta) return normalizedDraft;
  if (slotExacta > draftExacta) return normalizedSlot;
  if (draftEntries.length > slotEntries.length) return normalizedDraft;
  if (slotEntries.length > draftEntries.length) return normalizedSlot;
  return normalizedDraft || normalizedSlot;
};

export const resolvePredictionAutoHitDetail = (predictionText: string, resultOrder: string): {
  status: PredictionResultHitStatus;
  hitBetType?: "3連単" | "2車単";
  hitCombination?: string;
} => {
  const normalizedOrder = normalizePredictionTrifectaText(resultOrder);
  if (!normalizedOrder) return { status: "pending" };

  const resultTop2 = normalizedOrder.split("-").slice(0, 2).join("-");
  const entries = extractPredictionBetEntriesWithFallback(predictionText);
  if (entries.length === 0) return { status: "pending" };

  const supportedEntries = entries.filter((entry) => entry.betType === "3連単" || entry.betType === "2車単");
  if (supportedEntries.length === 0) return { status: "pending" };

  const hitEntry = supportedEntries.find((entry) => {
    if (entry.betType === "3連単") return entry.combination === normalizedOrder;
    if (entry.betType === "2車単") return entry.combination === resultTop2;
    return false;
  });

  if (!hitEntry) return { status: "miss" };

  return {
    status: "hit",
    hitBetType: hitEntry.betType as "3連単" | "2車単",
    hitCombination: hitEntry.combination,
  };
};

export const resolvePredictionAutoHitStatus = (predictionText: string, resultOrder: string): PredictionResultHitStatus => {
  return resolvePredictionAutoHitDetail(predictionText, resultOrder).status;
};

export const resolvePredictionResultMetrics = ({
  record,
  race,
  predictionText,
  manualPayout,
}: {
  record?: Partial<PredictionResultRecord> | null;
  race?: {
    payouts?: readonly RacePayoutLikeItem[] | null;
    result?: RacePayoutLikeResult | null;
  } | null;
  predictionText?: string;
  manualPayout?: number;
}) => {
  const sourceRecord = record ?? {};
  const entries = predictionText ? extractPredictionBetEntriesWithFallback(predictionText) : [];
  const ticketCount = entries.length;
  const investment = typeof sourceRecord.investment === "number" && Number.isFinite(sourceRecord.investment)
    ? sourceRecord.investment
    : ticketCount > 0
      ? ticketCount * 100
      : undefined;
  const hitStatus = sourceRecord.hitStatus ?? sourceRecord.autoHitStatus ?? "pending";
  const derivedHitDetail = sourceRecord.resultOrder
    ? resolvePredictionAutoHitDetail(predictionText ?? "", sourceRecord.resultOrder)
    : { status: "pending" as const };
  const hitBetType = sourceRecord.hitBetType ?? (derivedHitDetail.status === "hit" ? derivedHitDetail.hitBetType : undefined);
  const hitCombination = sourceRecord.hitCombination ?? (derivedHitDetail.status === "hit" ? derivedHitDetail.hitCombination : undefined);
  const racePayout = parsePayoutAmountYen(resolveRacePayoutByBetType(race, hitBetType));
  const perTicketStake = ticketCount > 0 && investment !== undefined
    ? investment / ticketCount
    : undefined;
  const normalizedHitCombination = hitCombination ? normalizePredictionTrifectaText(hitCombination) : "";
  const hitTicketCount = hitBetType && normalizedHitCombination
    ? entries.filter((entry) => entry.betType === hitBetType && normalizePredictionTrifectaText(entry.combination) === normalizedHitCombination).length
    : 0;

  let payout = typeof manualPayout === "number" && Number.isFinite(manualPayout)
    ? manualPayout
    : typeof sourceRecord.payout === "number" && Number.isFinite(sourceRecord.payout)
      ? sourceRecord.payout
      : undefined;

  if (hitStatus === "miss") {
    payout = 0;
  } else if (hitStatus === "hit" && racePayout !== undefined) {
    const effectiveStake = perTicketStake ?? 100;
    const effectiveHitTicketCount = Math.max(hitTicketCount, hitBetType && normalizedHitCombination ? 1 : 0);
    payout = Math.round(racePayout * (effectiveStake / 100) * (effectiveHitTicketCount || 1));
  } else if (hitStatus === "pending") {
    payout = undefined;
  }

  const effectivePayout = resolvePredictionEffectivePayout(hitStatus, payout);
  const profitLoss = investment !== undefined && effectivePayout !== undefined
    ? effectivePayout - investment
    : undefined;
  const roi = investment !== undefined && effectivePayout !== undefined && investment > 0
    ? (effectivePayout / investment) * 100
    : undefined;

  return {
    investment,
    payout: effectivePayout,
    profitLoss,
    roi,
    ticketCount,
    hitTicketCount,
    perTicketStake,
    racePayout,
    hitBetType,
    hitCombination,
  };
};

export const getNormalizedPredictionResultDisplay = (
  record?: PredictionResultRecord | null,
  race?: {
    payouts?: readonly RacePayoutLikeItem[] | null;
    result?: RacePayoutLikeResult | null;
  } | null,
  predictionText?: string,
) => {
  if (!record) {
    return {
      investment: undefined,
      payout: undefined,
      profitLoss: undefined,
      roi: undefined,
    };
  }

  const normalizedRecord = resolvePredictionResultMetrics({
    record: normalizePredictionResultRecord(record),
    race,
    predictionText,
  });

  return {
    investment: normalizedRecord.investment,
    payout: normalizedRecord.payout,
    profitLoss: normalizedRecord.profitLoss,
    roi: normalizedRecord.roi,
  };
};

export const getPredictionHitBadgeTone = (betType?: "3連単" | "2車単") => {
  if (betType === "2車単") {
    return {
      background: "linear-gradient(135deg, rgba(231,243,255,0.98) 0%, rgba(244,249,255,0.98) 100%)",
      border: "#cfe2fb",
      text: "#2959b8",
    };
  }
  return {
    background: "linear-gradient(135deg, rgba(244,236,255,0.98) 0%, rgba(251,246,255,0.98) 100%)",
    border: "#e2d4fb",
    text: "#6d3fc2",
  };
};

export const getPredictionTicketChipTone = (betType?: string, hit?: boolean) => {
  if (betType === "2車単") {
    return hit
      ? { background: "linear-gradient(135deg, rgba(217,235,255,0.98) 0%, rgba(236,246,255,0.98) 100%)", border: "#bfd9fb", text: "#2554ad" }
      : { background: "linear-gradient(135deg, rgba(239,247,255,0.98) 0%, rgba(249,252,255,0.98) 100%)", border: "#d6e6fb", text: "#3b5f95" };
  }
  return hit
    ? { background: "linear-gradient(135deg, rgba(237,227,255,0.98) 0%, rgba(247,241,255,0.98) 100%)", border: "#d9caf8", text: "#633db2" }
    : { background: "linear-gradient(135deg, rgba(248,242,255,0.98) 0%, rgba(253,250,255,0.98) 100%)", border: "#e7dbf7", text: "#6f5a9f" };
};

export type PredictionVenueCoordinate = {
  latitude: number;
  longitude: number;
};

export type PredictionWeatherCacheEntry = {
  fetchedAt: number;
  data: PredictionWeatherData;
};

export type PredictionWeatherRequestOptions = {
  isoDate?: string | null;
  raceTime?: string | null;
};

export const PREDICTION_VENUE_COORDINATE_MAP: Record<string, PredictionVenueCoordinate> = {
  "青森": { latitude: 40.8222, longitude: 140.7474 },
  "別府": { latitude: 33.2797, longitude: 131.4975 },
  "福井": { latitude: 36.0652, longitude: 136.2216 },
  "岐阜": { latitude: 35.4233, longitude: 136.7607 },
  "函館": { latitude: 41.7687, longitude: 140.7288 },
  "平塚": { latitude: 35.3356, longitude: 139.3495 },
  "川崎": { latitude: 35.5309, longitude: 139.7056 },
  "京王閣": { latitude: 35.6518, longitude: 139.5436 },
  "岸和田": { latitude: 34.4625, longitude: 135.3741 },
  "高知": { latitude: 33.5597, longitude: 133.5311 },
  "小倉": { latitude: 33.8833, longitude: 130.8752 },
  "小松島": { latitude: 34.0043, longitude: 134.5908 },
  "久留米": { latitude: 33.3193, longitude: 130.5084 },
  "前橋": { latitude: 36.3911, longitude: 139.0608 },
  "松戸": { latitude: 35.7843, longitude: 139.912 },
  "名古屋": { latitude: 35.185, longitude: 136.899 },
  "奈良": { latitude: 34.6851, longitude: 135.8048 },
  "大垣": { latitude: 35.3606, longitude: 136.6122 },
  "佐世保": { latitude: 33.159, longitude: 129.7154 },
  "西武園": { latitude: 35.7764, longitude: 139.4336 },
  "静岡": { latitude: 34.9756, longitude: 138.3828 },
  "立川": { latitude: 35.7101, longitude: 139.4124 },
  "玉野": { latitude: 34.4919, longitude: 133.9457 },
  "取手": { latitude: 35.9117, longitude: 140.0505 },
  "豊橋": { latitude: 34.7692, longitude: 137.3915 },
  "宇都宮": { latitude: 36.5551, longitude: 139.8828 },
  "和歌山": { latitude: 34.226, longitude: 135.1675 },
  "弥彦": { latitude: 37.7004, longitude: 138.8327 },
  "四日市": { latitude: 34.965, longitude: 136.6244 },
  "大宮": { latitude: 35.9067, longitude: 139.6233 },
  "小田原": { latitude: 35.2646, longitude: 139.1525 },
  "富山": { latitude: 36.6953, longitude: 137.2113 },
  "松阪": { latitude: 34.5779, longitude: 136.5276 },
  "武雄": { latitude: 33.1946, longitude: 130.0212 },
  "防府": { latitude: 34.0519, longitude: 131.5628 },
  "いわき平": { latitude: 37.0561, longitude: 140.8877 },
  "伊東": { latitude: 34.9662, longitude: 139.0928 },
  "伊東温泉": { latitude: 34.9662, longitude: 139.0928 },
  "ito": { latitude: 34.9662, longitude: 139.0928 },
  "ito-onsen": { latitude: 34.9662, longitude: 139.0928 },
  "itoonsen": { latitude: 34.9662, longitude: 139.0928 },
};

export const predictionWeatherCache = new Map<string, PredictionWeatherCacheEntry>();
export const missingVenueWarningKeys = new Set<string>();
export const favoriteFeedWarningKeys = new Set<string>();
export const progressWarningKeys = new Set<string>();
export const gradeMismatchWarningKeys = new Set<string>();

export const normalizePredictionVenueName = (value?: string | null) =>
  (value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/競輪場|競輪/g, "")
    .replace(/[\s　]/g, "")
    .replace(/[()（）]/g, "")
    .trim();

export const normalizePredictionVenueAlias = (value?: string | null) => {
  const normalized = normalizePredictionVenueName(value);
  if (["伊東温泉", "ito-onsen", "itoonsen", "ito"].includes(normalized)) return "伊東";
  return normalized;
};

export const isPredictionOddsSkippedOutsideWindow = (oddsNote?: string | null) =>
  /odds skipped outside/i.test(String(oddsNote ?? ""));

export const getPredictionOddsUnavailableLabel = (oddsNote?: string | null) =>
  isPredictionOddsSkippedOutsideWindow(oddsNote)
    ? "KDreamsオッズ未取得（取得対象時間外でスキップ）"
    : "KDreams未掲載";

export const findPredictionVenueBankTarget = (
  bankIndex: PredictionVenueBankIndexItem[],
  venue?: Pick<PredictionVenueItem, "venue" | "slug"> | Pick<RaceScheduleItem, "venue">
) => {
  if (!venue) return null;

  const normalizedVenueName = normalizePredictionVenueAlias(venue.venue);
  const venueSlug = "slug" in venue ? venue.slug?.trim() : undefined;

  return bankIndex.find((item) => {
    if (item.venueKey === venueSlug) return true;
    if (Array.isArray(item.aliases) && item.aliases.some((alias) => normalizePredictionVenueAlias(alias) === normalizedVenueName)) return true;
    return normalizePredictionVenueAlias(item.venueName) === normalizedVenueName;
  }) ?? null;
};

export const filterFavoriteRiderFeedForDate = (feed: FavoriteRiderFeedItem[], isoDate: string) => {
  return feed.filter((entry) => entry.startDate <= isoDate && entry.endDate >= isoDate);
};

export const aggregatePredictionResultsByVenueForDate = (map: PredictionResultMap, targetDate: string): PredictionResultVenueSummaryMap => {
  return Object.values(map)
    .map((item) => normalizePredictionResultRecord(item))
    .filter((item) => item.date === targetDate)
    .reduce<PredictionResultVenueSummaryMap>((accumulator, item) => {
      const venueKey = normalizePredictionVenueName(item.venue);
      const current = accumulator[venueKey] ?? {
        venue: item.venue,
        savedRaceCount: 0,
        hitCount: 0,
        missCount: 0,
        settledRaceCount: 0,
        pendingCount: 0,
        investment: 0,
        payout: 0,
        profitLoss: 0,
      };
      const effectivePayout = resolvePredictionEffectivePayout(item.hitStatus, item.payout);

      current.savedRaceCount += 1;
      current.investment += item.investment ?? 0;
      current.payout += item.hitStatus === "pending" ? 0 : effectivePayout ?? 0;

      if (item.hitStatus === "hit") {
        current.hitCount += 1;
        current.settledRaceCount += 1;
      } else if (item.hitStatus === "miss") {
        current.missCount += 1;
        current.settledRaceCount += 1;
      } else {
        current.pendingCount += 1;
      }

      current.profitLoss = current.payout - current.investment;
      current.hitRate = current.settledRaceCount > 0 ? (current.hitCount / current.settledRaceCount) * 100 : undefined;
      current.roi = current.investment > 0 ? (current.payout / current.investment) * 100 : undefined;

      accumulator[venueKey] = current;
      return accumulator;
    }, {});
};

export const normalizePredictionWeatherLookupName = (venue?: string | null) =>
  normalizePredictionVenueAlias(venue);

export const compactPredictionGuideText = (value?: string | null) =>
  (value ?? "")
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
    .replace(/[*`>#]/g, "")
    .replace(/\r/g, "")
    .replace(/\s+/g, " ")
    .trim();

export const clipPredictionGuideText = (value?: string | null, maxLength = 56) => {
  const text = compactPredictionGuideText(value);
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).replace(/[、。・,\s]+$/g, "")}…`;
};

export const summarizePredictionGuideText = (value?: string | null, maxLength = 56) => {
  const text = compactPredictionGuideText(value);
  if (!text) return "";
  const firstSentence = text.match(/^.*?[。！？]/)?.[0] ?? text;
  return firstSentence.length <= maxLength ? firstSentence : clipPredictionGuideText(firstSentence, maxLength);
};

export const extractPredictionVenueField = (source: string, patterns: RegExp[], fallback = "") => {
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match?.[1]) return compactPredictionGuideText(match[1]);
  }
  return fallback;
};

export const extractPredictionVenueBulletBlock = (markdown: string, label: string) => {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = markdown.match(new RegExp(`\\*\\*${escaped}\\*\\*([\\s\\S]*?)(?=\\n\\*\\*[^\\n]+\\*\\*|\\n##\\s|\\n###\\s|\\n---|$)`, "i"))?.[1] ?? "";
  const bullets = [...block.matchAll(/^\s*-\s+(.+)$/gm)].map((match) => compactPredictionGuideText(match[1])).filter(Boolean);
  return compactPredictionGuideText(bullets.join(" "));
};

export const findPredictionVenueParagraph = (markdown: string, labels: string[]) => {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const block = markdown.match(new RegExp(`(?:^|\\n)(?:##+\\s*[^\\n]*${escaped}[^\\n]*|\\*\\*${escaped}\\*\\*)([\\s\\S]*?)(?=\\n##\\s|\\n###\\s|\\n\\*\\*[^\\n]+\\*\\*|\\n---|$)`, "i"))?.[1] ?? "";
    const lines = block
      .split(/\n/)
      .map((line) => line.trim())
      .filter((line) => line && !/^\|/.test(line) && !/^>/.test(line) && !/^[-:]+$/.test(line));
    if (lines.length > 0) {
      return compactPredictionGuideText(lines.slice(0, 4).join(" "));
    }
  }

  return "";
};

export const findFirstPredictionVenueLine = (markdown: string, patterns: RegExp[]) => {
  for (const pattern of patterns) {
    const match = markdown.match(pattern);
    if (match?.[1]) return compactPredictionGuideText(match[1]);
  }
  return "";
};

export const derivePredictionVenueBankLength = (markdown: string, rawBankLength: string) => {
  const source = `${rawBankLength} ${markdown}`;
  if (/333\s*m?/i.test(source)) return "333m・短走路";
  if (/335\s*m?/i.test(source)) return "335m・短走路";
  if (/400\s*m?/i.test(source)) return "400m・標準寄り";
  if (/500\s*m?/i.test(source)) return "500m・長走路";
  return rawBankLength || "";
};

export const derivePredictionVenueBankTarget = (feature: string, markdown: string) => {
  const source = `${feature} ${markdown}`;
  if (/番手差し|差し届|差し優勢|追込/.test(source)) return "番手差しと差し脚上位を軸に組み立てたい。";
  if (/三番手残り|直列残り/.test(source)) return "ライン3番手までの残り目を押さえたい。";
  if (/捲り|機動力|カマシ/.test(source)) return "機動力上位の捲りとカマシを高めに評価したい。";
  if (/先行|逃げ/.test(source)) return "主導権を取れる先行ラインから入るのが基本。";
  return "主導権ラインと番手差しをセットで確認したい。";
};

export const derivePredictionVenueBankCaution = (feature: string, markdown: string) => {
  const source = `${feature} ${markdown}`;
  if (/強風|風が強い|風向|巻き風/.test(source)) return "風向きで脚質評価が変わりやすいので直前気配を優先。";
  if (/波乱|荒れ|万車/.test(source)) return "人気一本ではなく相手ズレや3着穴まで残したい。";
  if (/直線長|差し届/.test(source)) return "逃げ一本の押し切り決め打ちはやや危険。";
  if (/ミッド|ナイター|モーニング/.test(source)) return "時間帯で流れが変わりやすく位置取りも要確認。";
  return "並びと主導権候補がズレたら印を寄せ直したい。";
};

export const derivePredictionVenueVolatility = (markdown: string) => {
  const source = markdown.replace(/,/g, "");
  const mankenMatch = source.match(/万車[^\d]{0,8}(\d+(?:\.\d+)?)\s*%/i);
  const mankenRate = mankenMatch ? Number(mankenMatch[1]) : null;

  if (mankenRate !== null && Number.isFinite(mankenRate)) {
    if (mankenRate >= 30) return `高め｜万車率${mankenRate.toFixed(1)}%前後。相手ズレまで見たい。`;
    if (mankenRate >= 20) return `中くらい｜万車率${mankenRate.toFixed(1)}%前後。3着の抜けに注意。`;
    return `低め｜万車率${mankenRate.toFixed(1)}%前後。まずは本線優先。`;
  }

  if (/波乱|単騎|4分戦|着ズレ/.test(source)) return "高め｜隊列が崩れると配当が跳ねやすい。";
  if (/差し|追込|風/.test(source)) return "中くらい｜番手差しと相手ズレを両方見たい。";
  return "低め｜まずは本線ラインの完成度を優先。";
};

export const parsePredictionVenueSummary = (markdown: string): PredictionVenueSummary => {
  const summaryBlock = markdown.match(/##\s*SUMMARY([\s\S]*?)(?:\n##\s|\n#\s|$)/i)?.[1] ?? markdown;
  const rawBankLength =
    extractPredictionVenueField(summaryBlock, [/[-*]\s*バンク長[:：]\s*(.+)/i, /バンク長[:：]\s*(.+)/i]) ||
    findFirstPredictionVenueLine(markdown, [/周長\s*[:：]\s*([^\n]+)/i, /会場[:：].*?[（(]\s*(\d{3,4})\s*[）)]/i]);
  const bankFeature =
    extractPredictionVenueField(summaryBlock, [/[-*]\s*バンク特徴[:：]\s*(.+)/i, /[-*]\s*ひとこと特徴[:：]\s*(.+)/i, /バンク特徴[:：]\s*(.+)/i]) ||
    extractPredictionVenueBulletBlock(markdown, "特徴メモ") ||
    findPredictionVenueParagraph(markdown, ["直線係数", "遠心力バイアス", "重力・抵抗", "特徴メモ"]) ||
    MISSING_PREDICTION_VENUE_SUMMARY.bankFeature;
  const target =
    extractPredictionVenueField(summaryBlock, [/[-*]\s*狙いどころ[:：]\s*(.+)/i, /狙いどころ[:：]\s*(.+)/i]) ||
    derivePredictionVenueBankTarget(bankFeature, markdown);
  const caution =
    extractPredictionVenueField(summaryBlock, [/[-*]\s*注意点[:：]\s*(.+)/i, /注意点[:：]\s*(.+)/i]) ||
    derivePredictionVenueBankCaution(bankFeature, markdown);
  const volatility =
    extractPredictionVenueField(summaryBlock, [/[-*]\s*荒れそう度[:：]\s*(.+)/i, /荒れそう度[:：]\s*(.+)/i]) ||
    derivePredictionVenueVolatility(markdown);
  const bankLength = derivePredictionVenueBankLength(markdown, rawBankLength);
  const bankMemo =
    extractPredictionVenueField(summaryBlock, [/[-*]\s*会場タイプ[:：]\s*(.+)/i, /会場タイプ[:：]\s*(.+)/i, /[-*]\s*会場メモ[:：]\s*(.+)/i]) ||
    findPredictionVenueParagraph(markdown, ["時間帯別バイアス", "時間帯別の組み立て", "風・天候 → 展開の法則"]) ||
    MISSING_PREDICTION_VENUE_SUMMARY.bankMemo;

  const hasData =
    bankFeature !== MISSING_PREDICTION_VENUE_SUMMARY.bankFeature ||
    target !== MISSING_PREDICTION_VENUE_SUMMARY.target ||
    caution !== MISSING_PREDICTION_VENUE_SUMMARY.caution ||
    volatility !== MISSING_PREDICTION_VENUE_SUMMARY.volatility ||
    bankLength !== MISSING_PREDICTION_VENUE_SUMMARY.bankLength ||
    bankMemo !== MISSING_PREDICTION_VENUE_SUMMARY.bankMemo;

  return {
    bankFeature,
    target,
    caution,
    volatility,
    bankLength,
    bankMemo,
    source: hasData ? "linked" : "missing",
  };
};

const PREDICTION_LINEUP_SEPARATOR_PATTERN = /[\s/・-]+/;

const getPredictionLineupCandidates = (race?: PredictionRaceItem | null) => [
  { source: "lineup", raw: race?.lineup },
  { source: "netkeirin", raw: race?.netkeirinLineupRaw },
  { source: "kdreams", raw: race?.kdreamsLineupRaw },
  { source: "chariloto", raw: race?.charilotoLineupRaw },
  { source: "oddspark", raw: race?.oddsparkLineupRaw },
  { source: "winticket", raw: race?.winticketLineupRaw },
].map((item) => ({ ...item, raw: (item.raw ?? "").trim() })).filter((item) => Boolean(item.raw));

const parsePredictionLineupRaw = (raw: string) => {
  const normalized = (raw ?? "").trim();
  const groups = normalized
    .split(PREDICTION_LINEUP_SEPARATOR_PATTERN)
    .map((group) => group.replace(/[^0-9]/g, ""))
    .filter(Boolean);
  const orderCars = groups.join("").split("").filter(Boolean);
  const hasExplicitGroups = groups.length >= 2 && groups.some((group) => group.length > 1);
  const groupedGroups = hasExplicitGroups ? groups.map((group) => group.split("").join("-")) : [];

  return {
    raw: normalized,
    orderCars,
    orderLabel: orderCars.length > 0 ? orderCars.join(" → ") : "",
    hasExplicitGroups,
    groupedGroups,
    groupedLabel: groupedGroups.length > 0 ? groupedGroups.join(" / ") : "",
    leadCarNo: orderCars[0] ?? "",
  };
};

const resolvePredictionLineup = (race?: PredictionRaceItem | null) => {
  const candidates = getPredictionLineupCandidates(race).map((candidate) => ({
    ...candidate,
    parsed: parsePredictionLineupRaw(candidate.raw),
  }));
  const groupedCandidate = candidates.find((candidate) => candidate.parsed.hasExplicitGroups) ?? null;
  const orderCandidate = candidates.find((candidate) => candidate.parsed.orderCars.length > 0) ?? null;

  return {
    groupedCandidate,
    orderCandidate,
    groupedGroups: groupedCandidate?.parsed.groupedGroups ?? [],
    groupedLabel: groupedCandidate?.parsed.groupedLabel ?? "",
    orderLabel: orderCandidate?.parsed.orderLabel ?? "",
    leadCarNo: groupedCandidate?.parsed.leadCarNo ?? orderCandidate?.parsed.leadCarNo ?? "",
    hasAnyLineup: Boolean(groupedCandidate || orderCandidate),
  };
};

export const buildPredictionLineupDisplay = (race?: PredictionRaceItem | null) => {
  const lineup = resolvePredictionLineup(race);
  if (lineup.groupedLabel) return lineup.groupedLabel;
  if (lineup.orderLabel) return lineup.orderLabel;
  return "並び未取得";
};

export const buildPredictionLineupGroups = (race?: PredictionRaceItem | null) => {
  return resolvePredictionLineup(race).groupedGroups;
};

export const extractPredictionLineupCarNos = (race?: PredictionRaceItem | null) => {
  const lineup = resolvePredictionLineup(race);
  return lineup.orderLabel
    ? lineup.orderLabel.split(" → ").map((value) => value.trim()).filter(Boolean)
    : [];
};

export const getDisplayRidersForKeirinRace = (
  race?: PredictionRaceItem | null,
  venue?: PredictionVenueItem | null,
): PredictionRiderItem[] => {
  void venue;
  const realRiders = Array.isArray(race?.riders)
    ? race.riders.filter((rider): rider is PredictionRiderItem => Boolean(rider?.carNo))
    : [];
  const ridersByCarNo = new Map(realRiders.map((rider) => [String(rider.carNo), rider]));
  const lineupCarNos = extractPredictionLineupCarNos(race);
  const orderedCarNos = lineupCarNos.length > 0
    ? Array.from(new Set([...lineupCarNos, ...realRiders.map((rider) => String(rider.carNo))]))
    : realRiders.map((rider) => String(rider.carNo)).sort((a, b) => Number(a) - Number(b));

  return orderedCarNos
    .map((carNo) => ridersByCarNo.get(carNo) ?? {
      carNo,
      name: "未取得",
      fullName: "未取得",
      source: "lineup-placeholder",
      style: "",
      score: "",
      prefecture: "",
      term: "",
      age: "",
      grade: "",
      gearRatio: "",
      s: "",
      b: "",
      nige: "",
      escape: "",
      makuri: "",
      sashi: "",
      mark: "",
      comment: "出走表: 未取得",
      materialMissing: true,
      isPlaceholder: true,
    })
    .sort((a, b) => Number(a.carNo) - Number(b.carNo));
};

export const getPredictionMaterialRidersForKeirinRace = (
  race?: PredictionRaceItem | null,
  venue?: PredictionVenueItem | null,
): PredictionRiderItem[] => {
  void venue;
  const realRiders = Array.isArray(race?.riders)
    ? race.riders.filter((rider): rider is PredictionRiderItem => Boolean(rider?.carNo) && rider.isPlaceholder !== true)
    : [];
  if (realRiders.length === 0) return [];

  const ridersByCarNo = new Map(realRiders.map((rider) => [String(rider.carNo), rider]));
  const lineupCarNos = extractPredictionLineupCarNos(race);
  const orderedCarNos = lineupCarNos.length > 0
    ? [
        ...lineupCarNos.filter((carNo, index) => lineupCarNos.indexOf(carNo) === index && ridersByCarNo.has(carNo)),
        ...realRiders.map((rider) => String(rider.carNo)).filter((carNo) => !lineupCarNos.includes(carNo)),
      ]
    : realRiders.map((rider) => String(rider.carNo)).sort((a, b) => Number(a) - Number(b));

  return orderedCarNos
    .map((carNo) => ridersByCarNo.get(carNo))
    .filter((rider): rider is PredictionRiderItem => Boolean(rider));
};

export const getMissingDisplayRiderCarNos = (race?: PredictionRaceItem | null) => {
  const lineupCarNos = extractPredictionLineupCarNos(race);
  if (lineupCarNos.length === 0) return [];
  const riderCarNos = new Set((race?.riders ?? []).map((rider) => String(rider.carNo)));
  return lineupCarNos.filter((carNo) => !riderCarNos.has(carNo));
};

export const getPredictionWeatherLabelFromCode = (code?: number | null) => {
  switch (code) {
    case 0:
      return "快晴";
    case 1:
      return "晴れ";
    case 2:
      return "晴れ時々くもり";
    case 3:
      return "くもり";
    case 45:
    case 48:
      return "霧";
    case 51:
    case 53:
    case 55:
      return "霧雨";
    case 61:
    case 63:
    case 65:
      return "雨";
    case 71:
    case 73:
    case 75:
      return "雪";
    case 80:
    case 81:
    case 82:
      return "にわか雨";
    case 95:
    case 96:
    case 99:
      return "雷雨";
    default:
      return "天気情報なし";
  }
};

export const getPredictionWindDirectionLabel = (degrees?: number | null) => {
  if (degrees === null || degrees === undefined || !Number.isFinite(degrees)) return "観測値未提供";
  const directions = ["北", "北北東", "北東", "東北東", "東", "東南東", "南東", "南南東", "南", "南南西", "南西", "西南西", "西", "西北西", "北西", "北北西"];
  const index = Math.round((((degrees % 360) + 360) % 360) / 22.5) % 16;
  return directions[index];
};

export const formatPredictionWeatherTemperature = (value: unknown) => {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return "観測値未提供";
  return `${Math.round(number)}℃`;
};

export const formatPredictionWeatherNumber = (value: unknown, unit: string, digits = 0) => {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return "観測値未提供";
  return `${number.toFixed(digits)} ${unit}`;
};

export const formatPredictionWeatherUpdatedAt = (isoText?: string | null) => {
  if (!isoText) return "時刻未取得";
  const match = isoText.match(/T(\d{2}:\d{2})/);
  return match?.[1] ?? isoText;
};

export const buildPredictionWeatherReferenceText = ({
  raceTime,
  adoptedForecastTime,
  usedCurrentFallback,
}: {
  raceTime?: string | null;
  adoptedForecastTime?: string | null;
  usedCurrentFallback?: boolean;
}) => {
  const raceTimeLabel = raceTime?.trim();
  const forecastLabel = adoptedForecastTime?.trim();
  if (raceTimeLabel && forecastLabel) {
    return usedCurrentFallback
      ? `基準時刻: ${raceTimeLabel}発走 / 現在値(${forecastLabel})フォールバック`
      : `基準時刻: ${raceTimeLabel}発走 / ${forecastLabel}予報採用`;
  }
  if (forecastLabel) {
    return usedCurrentFallback ? `基準時刻: 現在値 ${forecastLabel}` : `基準時刻: ${forecastLabel}予報採用`;
  }
  if (raceTimeLabel) return `発走時刻基準: ${raceTimeLabel}近辺`;
  return "基準時刻未取得";
};

export const getPredictionWeatherMinutesFromIso = (isoText?: string | null) => {
  if (!isoText) return null;
  const match = isoText.match(/T(\d{2}:\d{2})/);
  return getPredictionTimeMinutes(match?.[1] ?? "");
};

export const resolvePredictionHourlyForecastIndex = ({
  hourlyTimes,
  isoDate,
  raceTime,
}: {
  hourlyTimes: string[];
  isoDate?: string | null;
  raceTime?: string | null;
}) => {
  const targetMinutes = getPredictionTimeMinutes(raceTime ?? "");
  if (targetMinutes === null || hourlyTimes.length === 0) return -1;

  const candidates = hourlyTimes
    .map((time, index) => ({ index, time, date: time.slice(0, 10), minutes: getPredictionWeatherMinutesFromIso(time) }))
    .filter((item) => item.minutes !== null);
  if (candidates.length === 0) return -1;

  const sameDateCandidates = isoDate ? candidates.filter((item) => item.date === isoDate) : candidates;
  const activeCandidates = sameDateCandidates.length > 0 ? sameDateCandidates : candidates;

  return activeCandidates.reduce((bestIndex, current) => {
    if (bestIndex === -1) return current.index;
    const best = activeCandidates.find((item) => item.index === bestIndex);
    if (!best || best.minutes === null || current.minutes === null) return current.index;
    const bestDiff = Math.abs(best.minutes - targetMinutes);
    const currentDiff = Math.abs(current.minutes - targetMinutes);
    return currentDiff < bestDiff ? current.index : bestIndex;
  }, -1);
};

async function geocodePredictionVenue(venueName: string) {
  const queries = [`${venueName} 競輪場`, `${venueName}, Japan`];

  for (const query of queries) {
    const url = new URL(PREDICTION_OPEN_METEO_GEOCODING_URL);
    url.searchParams.set("name", query);
    url.searchParams.set("count", "1");
    url.searchParams.set("language", "ja");
    url.searchParams.set("format", "json");
    url.searchParams.set("countryCode", "JP");

    const response = await fetch(url.toString(), { cache: "force-cache" });
    if (!response.ok) continue;
    const payload = await response.json() as { results?: Array<{ latitude?: number; longitude?: number }> };
    const result = payload.results?.[0];
    if (typeof result?.latitude === "number" && typeof result?.longitude === "number") {
      return result;
    }
  }

  return null;
}

export async function fetchPredictionVenueWeather(venueName: string, options: PredictionWeatherRequestOptions = {}): Promise<PredictionWeatherData> {
  const normalizedVenueName = normalizePredictionWeatherLookupName(venueName);
  const cacheKey = `${normalizedVenueName}::${options.isoDate ?? "current"}::${options.raceTime ?? "current"}`;
  const cached = predictionWeatherCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < PREDICTION_WEATHER_CACHE_TTL_MS) {
    return cached.data;
  }

  const coordinates = PREDICTION_VENUE_COORDINATE_MAP[normalizedVenueName]
    ?? PREDICTION_VENUE_COORDINATE_MAP[normalizePredictionVenueAlias(normalizedVenueName)]
    ?? await geocodePredictionVenue(normalizedVenueName);
  if (!coordinates) throw new Error("prediction-coordinate-not-found");

  const url = new URL(PREDICTION_OPEN_METEO_FORECAST_URL);
  url.searchParams.set("latitude", String(coordinates.latitude));
  url.searchParams.set("longitude", String(coordinates.longitude));
  url.searchParams.set("current", "temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,precipitation");
  url.searchParams.set("hourly", "temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,precipitation");
  url.searchParams.set("timezone", "Asia/Tokyo");
  url.searchParams.set("temperature_unit", "celsius");
  url.searchParams.set("wind_speed_unit", "kmh");
  url.searchParams.set("precipitation_unit", "mm");

  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) throw new Error(`prediction-weather-failed-${response.status}`);
  const payload = await response.json() as {
    current?: {
      time?: string;
      temperature_2m?: number;
      weather_code?: number;
      wind_speed_10m?: number;
      wind_direction_10m?: number;
      precipitation?: number;
    };
    hourly?: {
      time?: string[];
      temperature_2m?: Array<number | null>;
      weather_code?: Array<number | null>;
      wind_speed_10m?: Array<number | null>;
      wind_direction_10m?: Array<number | null>;
      precipitation?: Array<number | null>;
    };
  };
  const current = payload.current;
  if (!current) throw new Error("prediction-weather-missing");

  const hourlyTimes = payload.hourly?.time ?? [];
  const hourlyIndex = resolvePredictionHourlyForecastIndex({
    hourlyTimes,
    isoDate: options.isoDate,
    raceTime: options.raceTime,
  });
  const selectedHourlyTime = hourlyIndex >= 0 ? hourlyTimes[hourlyIndex] : undefined;
  const selectedHourlyTimeLabel = formatPredictionWeatherUpdatedAt(selectedHourlyTime);
  const useHourly = hourlyIndex >= 0;

  const weatherCode = useHourly ? payload.hourly?.weather_code?.[hourlyIndex] : current.weather_code;
  const temperature = useHourly ? payload.hourly?.temperature_2m?.[hourlyIndex] : current.temperature_2m;
  const windSpeed = useHourly ? payload.hourly?.wind_speed_10m?.[hourlyIndex] : current.wind_speed_10m;
  const windDirection = useHourly ? payload.hourly?.wind_direction_10m?.[hourlyIndex] : current.wind_direction_10m;
  const precipitation = useHourly ? payload.hourly?.precipitation?.[hourlyIndex] : current.precipitation;
  const adoptedTimeText = useHourly ? selectedHourlyTimeLabel : formatPredictionWeatherUpdatedAt(current.time);

  const data = {
    weatherLabel: getPredictionWeatherLabelFromCode(typeof weatherCode === "number" ? weatherCode : undefined),
    temperatureText: formatPredictionWeatherTemperature(temperature),
    windSpeedText: formatPredictionWeatherNumber(windSpeed, "km/h"),
    windDirectionText: getPredictionWindDirectionLabel(typeof windDirection === "number" ? windDirection : undefined),
    precipitationText: formatPredictionWeatherNumber(precipitation, "mm", 1),
    updatedAtText: adoptedTimeText,
    referenceText: buildPredictionWeatherReferenceText({
      raceTime: options.raceTime,
      adoptedForecastTime: adoptedTimeText,
      usedCurrentFallback: !useHourly,
    }),
  };

  predictionWeatherCache.set(cacheKey, { fetchedAt: Date.now(), data });
  return data;
}

// convert helper: PredictionWeatherData -> 保存用 PredictionRaceResultWeatherActual
export const convertPredictionWeatherToResultWeatherActual = (
  weather?: PredictionWeatherData | null,
): PredictionRaceResultWeatherActual | undefined => {
  if (!weather) return undefined;

  return {
    weather: weather.weatherLabel ?? "",
    windDirection: weather.windDirectionText ?? "",
    windSpeed: weather.windSpeedText ?? "",
    temperature: weather.temperatureText ?? "",
    precipitation: weather.precipitationText ?? "",
    fetchedAt: weather.updatedAtText ?? new Date().toISOString(),
    referenceText: weather.referenceText ?? "",
    source: "open-meteo",
  };
};

export const getPredictionSessionBadge = (venue: PredictionVenueItem) => {
  const note = `${venue.title ?? ""} ${venue.note ?? ""}`;
  const firstRaceTime = venue.races[0]?.time ?? "";
  const [hourText = "", minuteText = ""] = firstRaceTime.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const firstRaceMinutes = Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : null;

  if (venue.session === "midnight") return "🌟 ミッドナイト";
  if (venue.session === "night") return "🌙 ナイター";

  if (note.includes("モーニング")) return "🐣 モーニング";

  if (firstRaceMinutes !== null) {
    if (firstRaceMinutes <= 9 * 60 + 59) return "🐣 モーニング";
    if (firstRaceMinutes >= 17 * 60) return "🌙 ナイター";
    return "🌞 デイ";
  }

  return "🌞 デイ";
};

export const getPredictionSessionBadgeTone = (venue: PredictionVenueItem) => {
  const badge = getPredictionSessionBadge(venue);

  if (badge.includes("モーニング")) {
    return {
      background: "linear-gradient(180deg, #fff8dd 0%, #fff1bf 100%)",
      text: "#9a6a00",
      border: "#f3de8e",
    };
  }

  if (badge.includes("ミッドナイト")) {
    return {
      background: "linear-gradient(180deg, #f5efff 0%, #ede1ff 100%)",
      text: "#6c4eb2",
      border: "#dac8fb",
    };
  }

  if (badge.includes("ナイター")) {
    return {
      background: "linear-gradient(180deg, #eef1ff 0%, #e4e7fb 100%)",
      text: "#4e5ea9",
      border: "#ced7f4",
    };
  }

  return {
    background: "linear-gradient(180deg, #fff4ea 0%, #ffe9d8 100%)",
    text: "#b0662b",
    border: "#f3cfb0",
  };
};

export type PredictionSessionGroupKey = "morning" | "day" | "night" | "midnight";

export const getPredictionTimeMinutes = (timeText?: string) => {
  if (!timeText) return null;
  const [hourText = "", minuteText = ""] = timeText.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
};

export const getPredictionSessionGroupKey = (venue: PredictionVenueItem): PredictionSessionGroupKey => {
  const note = `${venue.title ?? ""} ${venue.note ?? ""}`;
  const firstRaceMinutes = getPredictionTimeMinutes(venue.races[0]?.time);

  if (venue.session === "midnight") return "midnight";
  if (venue.session === "night") return "night";
  if (note.includes("モーニング")) return "morning";

  if (firstRaceMinutes !== null) {
    if (firstRaceMinutes <= 9 * 60 + 59) return "morning";
    if (firstRaceMinutes >= 17 * 60) return "night";
  }

  return "day";
};

export const getPredictionVenueLastRaceMinutes = (venue: PredictionVenueItem) => {
  const lastRace = venue.races[venue.races.length - 1];
  return getPredictionTimeMinutes(lastRace?.time);
};

export const getPredictionVenueProgressLabel = (venue: PredictionVenueItem, now: Date) => {
  const raceTimes = venue.races
    .map((race) => ({
      raceNo: race.raceNo,
      minutes: getPredictionTimeMinutes(race.time),
      resultStatus: race.resultStatus ?? "pending",
    }))
    .filter((item): item is { raceNo: number; minutes: number; resultStatus: "pending" | "confirmed" } => item.minutes !== null);

  if (raceTimes.length === 0) {
    const warningKey = `${normalizePredictionVenueName(venue.venue)}:${venue.startDate ?? TODAY}`;
    if (!progressWarningKeys.has(warningKey)) {
      progressWarningKeys.add(warningKey);
      console.warn("[dashboard] progress source missing race times", {
        venue: venue.venue,
        date: venue.startDate ?? TODAY,
      });
    }
    return "進行情報なし";
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const first = raceTimes[0];
  const last = raceTimes[raceTimes.length - 1];
  const confirmedCount = raceTimes.filter((item) => item.resultStatus === "confirmed").length;
  const firstPendingIndex = raceTimes.findIndex((item) => item.resultStatus !== "confirmed");
  const firstPending = firstPendingIndex === -1 ? null : raceTimes[firstPendingIndex];
  const confirmedBoundaryReady = firstPendingIndex <= 0
    ? true
    : raceTimes.slice(0, firstPendingIndex).every((item) => item.resultStatus === "confirmed");

  if (confirmedCount >= raceTimes.length) return "終了済み";
  if (firstPending?.raceNo === first.raceNo && nowMinutes < first.minutes - 10) return "開始前";

  if (firstPending && confirmedBoundaryReady) {
    const minutesUntilFirstPending = firstPending.minutes - nowMinutes;
    const isFinalRace = firstPending.raceNo === last.raceNo;

    if (minutesUntilFirstPending > 20) {
      if (confirmedCount === 0 && firstPending.raceNo === first.raceNo) return "開始前";
      if (isFinalRace && confirmedCount >= Math.max(raceTimes.length - 2, 1)) return "最終盤";
      if (firstPendingIndex >= Math.max(raceTimes.length - 2, 1)) return "終盤";
      return `${firstPending.raceNo}R目付近`;
    }

    if (minutesUntilFirstPending > 0) {
      return `${firstPending.raceNo}R発売中`;
    }

    if (minutesUntilFirstPending >= -25) {
      return `${firstPending.raceNo}R進行中`;
    }

    if (isFinalRace) return "最終盤";
    if (firstPendingIndex >= Math.max(raceTimes.length - 2, 1)) return "終盤";
    return `${firstPending.raceNo}R目付近`;
  }

  const activeIndex = raceTimes.findIndex((item, index) => {
    if (item.resultStatus === "confirmed") return false;
    const next = raceTimes[index + 1];
    return nowMinutes >= item.minutes && (!next || nowMinutes < next.minutes);
  });

  if (activeIndex !== -1) {
    const activeRace = raceTimes[activeIndex];
    if (activeRace.raceNo === last.raceNo && nowMinutes >= activeRace.minutes + 20) return "最終盤";
    return `${activeRace.raceNo}R目付近`;
  }

  const nextPendingIndex = raceTimes.findIndex((item) => item.resultStatus !== "confirmed" && nowMinutes < item.minutes);
  if (nextPendingIndex !== -1) {
    const nextRace = raceTimes[nextPendingIndex];
    if (confirmedCount === 0 && nextRace.raceNo === first.raceNo) return "開始前";
    if (nextRace.minutes - nowMinutes <= 8) return `${nextRace.raceNo}R発売中`;
    if (nextPendingIndex >= Math.max(raceTimes.length - 1, 1)) return "最終盤";
    if (nextPendingIndex >= Math.max(raceTimes.length - 2, 1)) return "終盤";
    return `${nextRace.raceNo}R目付近`;
  }

  if (confirmedCount >= Math.max(raceTimes.length - 1, 1) && nowMinutes > last.minutes) return "最終盤";
  return confirmedCount > 0 ? "終盤" : `${last.raceNo}R目付近`;
};

export const getDashboardVenueWeatherSummary = (weather?: PredictionWeatherData | null) => {
  if (weather === undefined) {
    return {
      headline: "天気 取得中",
      detail: "風 取得中",
    };
  }

  if (weather === null) {
    return {
      headline: "天気情報なし",
      detail: "風情報なし",
    };
  }

  return {
    headline: `${weather.weatherLabel} ${weather.temperatureText}`,
    detail: `風 ${weather.windDirectionText} / ${weather.windSpeedText}`,
  };
};

export const openPredictionPageForTarget = (target: PredictionNavigationTarget) => {
  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(PREDICTION_SELECTED_VENUE_STORAGE_KEY, target.venueName);
    window.sessionStorage.setItem(PREDICTION_NAVIGATION_TARGET_STORAGE_KEY, JSON.stringify(target));
    window.sessionStorage.setItem(PREDICTION_SCROLL_RESET_STORAGE_KEY, "1");
    window.location.hash = "#prediction-page";
  }
};

export const openPredictionPageForVenue = (venueName: string) => {
  openPredictionPageForTarget({ venueName });
};

export const getPredictionVenueStatusRank = (venue: PredictionVenueItem, now: Date) => {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const firstRaceMinutes = getPredictionTimeMinutes(venue.races[0]?.time);
  const lastRaceMinutes = getPredictionVenueLastRaceMinutes(venue);

  if (firstRaceMinutes === null || lastRaceMinutes === null) return 2;
  if (nowMinutes < firstRaceMinutes) return 0;
  if (nowMinutes <= lastRaceMinutes) return 1;
  return 2;
};

export const normalizePredictionGradeForBadge = (value?: string | null) => {
  const normalized = (value ?? "")
    .trim()
    .normalize("NFKC")
    .replace(/[Ｇｇ]/g, "G")
    .replace(/[ⅠＩ]/g, "I")
    .replace(/[１]/g, "1")
    .replace(/[２]/g, "2")
    .replace(/[３]/g, "3")
    .toUpperCase();

  if (normalized === "G1" || normalized === "GI") return "GI";
  if (normalized === "G2" || normalized === "GII") return "GII";
  if (normalized === "G3" || normalized === "GIII") return "GIII";
  if (normalized === "GP") return "GP";
  if (normalized === "F1") return "F1";
  if (normalized === "F2") return "F2";
  return normalized;
};

export const formatPredictionGradeBadgeLabel = (normalizedGrade?: string | null) => {
  if (normalizedGrade === "GI") return "G1";
  if (normalizedGrade === "GII") return "G2";
  if (normalizedGrade === "GIII") return "G3";
  return normalizedGrade ?? "";
};

export const derivePredictionVenueGradeFromRaces = (venue: PredictionVenueItem) => {
  const source = [
    venue.title ?? "",
    venue.note ?? "",
    ...(venue.races ?? []).flatMap((race) => [race.title ?? "", race.sourceNote ?? ""]),
  ].join(" ");

  const normalizedFromText = normalizePredictionGradeForBadge(source);
  if (normalizedFromText === "GP" || normalizedFromText === "GI" || normalizedFromText === "GII" || normalizedFromText === "GIII") {
    return normalizedFromText;
  }

  if (/Ｓ級|S級/.test(source)) return "F1";
  if (/Ａ級|A級|Ｌ級|L級|チャレンジ|ガールズ/.test(source)) return "F2";
  return "";
};

export const findPredictionVenueScheduleGrade = (venue: PredictionVenueItem, isoDate: string) => {
  const candidates = raceScheduleData
    .filter((item) => item.venue === venue.venue && item.startDate <= isoDate && item.endDate >= isoDate)
    .sort((a, b) => b.startDate.localeCompare(a.startDate) || b.endDate.localeCompare(a.endDate));

  return normalizePredictionGradeForBadge(candidates[0]?.grade);
};



export const resolvePredictionVenueGradeBadge = (venue: PredictionVenueItem, isoDate: string) => {
  const normalizedOwnGrade = normalizePredictionGradeForBadge(venue.grade);
  const raceDerivedGrade = derivePredictionVenueGradeFromRaces(venue);
  const scheduleGrade = findPredictionVenueScheduleGrade(venue, isoDate);

  if (normalizedOwnGrade && scheduleGrade && normalizedOwnGrade !== scheduleGrade) {
    const warningKey = `${isoDate}:${normalizePredictionVenueName(venue.venue)}:${normalizedOwnGrade}:${scheduleGrade}`;
    if (!gradeMismatchWarningKeys.has(warningKey)) {
      gradeMismatchWarningKeys.add(warningKey);
      console.warn("[dashboard] generated/schedule grade mismatch", {
        venue: venue.venue,
        date: isoDate,
        generatedGrade: normalizedOwnGrade,
        scheduleGrade,
      });
    }
  }

  if (normalizedOwnGrade) return normalizedOwnGrade;
  if (raceDerivedGrade) return raceDerivedGrade;
  if (scheduleGrade) return scheduleGrade;

  return "";
};

export const getPredictionGradeDisplayLabel = (venue: PredictionVenueItem | null, isoDate: string) => {
  if (!venue) return "開催データ参照待ち";
  const normalizedGrade = resolvePredictionVenueGradeBadge(venue, isoDate);
  return formatPredictionGradeBadgeLabel(normalizedGrade) || "開催データ参照待ち";
};

export type PredictionVenueStageSource = {
  venue?: string | null;
  grade?: string | null;
  title?: string | null;
  startDate?: string | null;
  endDate?: string | null;
};

const getPredictionStageDateTime = (iso?: string | null) => {
  if (!iso) return null;

  const date = new Date(`${iso}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return null;

  return date;
};

const getPredictionStageDayDiff = (from: Date, to: Date) => {
  return Math.floor((to.getTime() - from.getTime()) / 86400000);
};

const resolvePredictionVenueStageSchedule = (
  venue?: PredictionVenueStageSource | null,
  targetIsoDate = TODAY,
) => {
  const normalizedVenue = normalizePredictionVenueName(venue?.venue ?? "");
  if (!normalizedVenue || !targetIsoDate) return null;

  const sameVenueSchedules = raceScheduleData
    .filter((item) => normalizePredictionVenueName(item.venue) === normalizedVenue)
    .filter((item) => item.startDate <= targetIsoDate && item.endDate >= targetIsoDate)
    .sort((a, b) => {
      const aDuration =
        getPredictionStageDayDiff(
          getPredictionStageDateTime(a.startDate) ?? new Date(0),
          getPredictionStageDateTime(a.endDate) ?? new Date(0),
        );
      const bDuration =
        getPredictionStageDayDiff(
          getPredictionStageDateTime(b.startDate) ?? new Date(0),
          getPredictionStageDateTime(b.endDate) ?? new Date(0),
        );

      return bDuration - aDuration || a.startDate.localeCompare(b.startDate);
    });

  return sameVenueSchedules[0] ?? null;
};

export const getPredictionVenueStageLabel = (
  venue?: PredictionVenueStageSource | null,
  targetIsoDate = TODAY,
) => {
  const schedule = resolvePredictionVenueStageSchedule(venue, targetIsoDate);
  return getRaceEventDayLabel({
    startDate: venue?.startDate || schedule?.startDate,
    endDate: venue?.endDate || schedule?.endDate,
    targetDate: targetIsoDate,
  }) ?? "日目未取得";
};

export const comparePredictionVenues = (a: PredictionVenueItem, b: PredictionVenueItem) => {
  const sessionPriority: Record<PredictionSessionGroupKey, number> = {
    morning: 0,
    day: 1,
    night: 2,
    midnight: 3,
  };

  const sessionDiff = (sessionPriority[getPredictionSessionGroupKey(a)] ?? 99) - (sessionPriority[getPredictionSessionGroupKey(b)] ?? 99);
  if (sessionDiff !== 0) return sessionDiff;

  const aFirstRaceMinutes = getPredictionTimeMinutes(a.races[0]?.time);
  const bFirstRaceMinutes = getPredictionTimeMinutes(b.races[0]?.time);
  if (aFirstRaceMinutes !== null && bFirstRaceMinutes !== null && aFirstRaceMinutes !== bFirstRaceMinutes) {
    return aFirstRaceMinutes - bFirstRaceMinutes;
  }

  return a.venue.localeCompare(b.venue, "ja");
};

export const getPredictionMaterialReady = (race?: PredictionRaceItem | null) => {
  if (!race) return false;
  const hasRiders = (race.riders?.length ?? 0) > 0;
  const hasLineup = buildPredictionLineupDisplay(race) !== "並び未取得";
  const hasOdds = (race.oddsTrifecta?.length ?? 0) > 0 || (race.oddsPreview?.length ?? 0) > 0;
  return hasRiders && hasLineup && hasOdds;
};

const getPredictionRaceExternalId = (race?: PredictionRaceItem | null) => {
  const source = race as (PredictionRaceItem & { race_id?: unknown; raceId?: unknown; id?: unknown }) | null | undefined;
  return String(source?.race_id ?? source?.raceId ?? source?.id ?? "").trim();
};

const getPredictionRaceIdForVenue = (venue?: PredictionVenueItem | null, race?: PredictionRaceItem | null) => {
  return getPredictionRaceExternalId(race) || (race ? String(venue?.raceIds?.[race.raceNo - 1] ?? "").trim() : "");
};

const getPredictionVenueCode = (venue?: PredictionVenueItem | null) => String(venue?.venueCode ?? "").trim();

const preferPredictionNonEmpty = <T,>(primary: T | null | undefined, fallback: T | null | undefined): T | undefined => {
  if (primary === null || primary === undefined) return fallback === null ? undefined : fallback;
  if (typeof primary === "string" && primary.trim() === "") return fallback === null ? undefined : fallback;
  if (Array.isArray(primary) && primary.length === 0) return fallback === null ? undefined : fallback;
  return primary;
};

const preferPredictionLongerArray = <T,>(primary?: T[] | null, fallback?: T[] | null): T[] | undefined => {
  const primaryItems = Array.isArray(primary) ? primary : [];
  const fallbackItems = Array.isArray(fallback) ? fallback : [];
  return primaryItems.length > fallbackItems.length ? primaryItems : fallbackItems;
};

const scoreRiderMaterial = (riders?: PredictionRiderItem[] | null) => {
  if (!Array.isArray(riders)) return 0;
  return riders.reduce((sum, rider) => {
    if (!rider || rider.materialMissing) return sum;
    return sum
      + (rider.carNo ? 1 : 0)
      + (rider.name ? 2 : 0)
      + (rider.prefecture ? 1 : 0)
      + (rider.term ? 1 : 0)
      + (rider.age ? 1 : 0)
      + (rider.grade ? 1 : 0)
      + (rider.style ? 1 : 0)
      + (rider.score || rider.totalScore ? 2 : 0)
      + (rider.gearRatio ? 1 : 0)
      + (rider.s ? 1 : 0)
      + (rider.b ? 1 : 0)
      + (rider.nige || rider.escape ? 1 : 0)
      + (rider.makuri ? 1 : 0)
      + (rider.sashi ? 1 : 0)
      + (rider.mark ? 1 : 0);
  }, 0);
};

const preferBetterRiders = (
  primary?: PredictionRiderItem[] | null,
  fallback?: PredictionRiderItem[] | null,
): PredictionRiderItem[] | undefined => {
  const primaryItems = Array.isArray(primary) ? primary : [];
  const fallbackItems = Array.isArray(fallback) ? fallback : [];
  if (primaryItems.length === 0) return fallbackItems;
  if (fallbackItems.length === 0) return primaryItems;

  const primaryScore = scoreRiderMaterial(primaryItems);
  const fallbackScore = scoreRiderMaterial(fallbackItems);
  if (primaryScore !== fallbackScore) return primaryScore > fallbackScore ? primaryItems : fallbackItems;
  return primaryItems.length >= fallbackItems.length ? primaryItems : fallbackItems;
};

const mergePredictionSourceNote = (primary?: string | null, fallback?: string | null) => {
  return normalizePredictionNoteText([primary, fallback].filter(Boolean).join(" / "));
};

const mergePredictionRaceResultPreserveRichData = (
  baseResult?: PredictionRaceResult | null,
  overlayResult?: PredictionRaceResult | null,
): PredictionRaceResult | undefined => {
  if (!baseResult && !overlayResult) return undefined;
  const merged: PredictionRaceResult = { ...(baseResult ?? {}) };
  const overlay = overlayResult ?? {};

  (Object.keys(overlay) as Array<keyof PredictionRaceResult>).forEach((key) => {
    const value = overlay[key];
    if (key === "finishOrder") return;
    if (key === "payout2fuku" || key === "payoutWide") return;
    (merged as Record<string, unknown>)[key] = preferPredictionNonEmpty(value, merged[key]);
  });

  merged.finishOrder = preferPredictionLongerArray(overlay.finishOrder, merged.finishOrder) as PredictionRaceResult["finishOrder"];
  merged.payout2fuku = preferPredictionLongerArray(overlay.payout2fuku, merged.payout2fuku);
  merged.payoutWide = preferPredictionLongerArray(overlay.payoutWide, merged.payoutWide);
  return merged;
};

export const mergeRacePreserveRichData = (
  baseRace?: PredictionRaceItem | null,
  overlayRace?: Partial<PredictionRaceItem> | null,
): PredictionRaceItem => {
  const base = baseRace ?? { raceNo: overlayRace?.raceNo ?? 0 };
  const overlay = overlayRace ?? {};
  const merged: PredictionRaceItem = { ...base };

  (Object.keys(overlay) as Array<keyof PredictionRaceItem>).forEach((key) => {
    const value = overlay[key];
    if (
      key === "riders" ||
      key === "oddsPreview" ||
      key === "oddsTrifecta" ||
      key === "resultTop3" ||
      key === "payouts" ||
      key === "result" ||
      key === "sourceNote"
    ) {
      return;
    }
    (merged as Record<string, unknown>)[key] = preferPredictionNonEmpty(value, merged[key]);
  });

  merged.riders = preferBetterRiders(overlay.riders, merged.riders);
  merged.oddsPreview = preferPredictionLongerArray(overlay.oddsPreview, merged.oddsPreview);
  merged.oddsTrifecta = preferPredictionLongerArray(overlay.oddsTrifecta, merged.oddsTrifecta);
  merged.resultTop3 = preferPredictionLongerArray(overlay.resultTop3, merged.resultTop3);
  merged.payouts = preferPredictionLongerArray(overlay.payouts, merged.payouts);
  merged.result = mergePredictionRaceResultPreserveRichData(merged.result, overlay.result);
  merged.sourceNote = mergePredictionSourceNote(merged.sourceNote, overlay.sourceNote);

  return merged;
};

export const resolveHydratedRaceForPredictionMaterial = ({
  feed,
  selectedVenue,
  selectedRace,
  savedPrediction,
}: {
  feed?: PredictionTodayFeed | null;
  selectedVenue?: PredictionVenueItem | null;
  selectedRace?: PredictionRaceItem | null;
  savedPrediction?: { raceId?: string; raceNumber?: number; venue?: string } | null;
}) => {
  const venues = feed?.venues ?? [];
  const selectedRaceNo = selectedRace?.raceNo ?? savedPrediction?.raceNumber;
  const selectedRaceId = getPredictionRaceIdForVenue(selectedVenue, selectedRace) || String(savedPrediction?.raceId ?? "").trim();
  const selectedVenueCode = getPredictionVenueCode(selectedVenue);
  const selectedVenueName = normalizePredictionVenueName(selectedVenue?.venue ?? savedPrediction?.venue ?? "");
  const selectedSlug = String(selectedVenue?.slug ?? "").trim();

  const allRaceEntries = venues.flatMap((venue) => (venue.races ?? []).map((race) => ({ venue, race })));

  const byRaceId = selectedRaceId
    ? allRaceEntries.find(({ venue, race }) => getPredictionRaceIdForVenue(venue, race) === selectedRaceId)
    : undefined;
  if (byRaceId) return { hydratedRace: byRaceId.race, sourceVenue: byRaceId.venue, reason: "race_id" };

  const byVenueCode = selectedVenueCode && selectedRaceNo
    ? allRaceEntries.find(({ venue, race }) => getPredictionVenueCode(venue) === selectedVenueCode && race.raceNo === selectedRaceNo)
    : undefined;
  if (byVenueCode) return { hydratedRace: byVenueCode.race, sourceVenue: byVenueCode.venue, reason: "venueCode+raceNo" };

  const byVenueName = selectedVenueName && selectedRaceNo
    ? allRaceEntries.find(({ venue, race }) => normalizePredictionVenueName(venue.venue) === selectedVenueName && race.raceNo === selectedRaceNo)
    : undefined;
  if (byVenueName) return { hydratedRace: byVenueName.race, sourceVenue: byVenueName.venue, reason: "normalizedVenueName+raceNo" };

  const bySlug = selectedSlug && selectedRaceNo
    ? allRaceEntries.find(({ venue, race }) => venue.slug === selectedSlug && race.raceNo === selectedRaceNo)
    : undefined;
  if (bySlug) return { hydratedRace: bySlug.race, sourceVenue: bySlug.venue, reason: "slug+raceNo" };

  return { hydratedRace: selectedRace ?? null, sourceVenue: selectedVenue ?? null, reason: "selectedRace fallback" };
};

const findPredictionVenueMatch = (venues: PredictionVenueItem[], target: PredictionVenueItem) => {
  const targetCode = getPredictionVenueCode(target);
  const targetName = normalizePredictionVenueName(target.venue);
  return venues.find((venue) => {
    if (targetCode && getPredictionVenueCode(venue) === targetCode) return true;
    if (target.slug && venue.slug === target.slug) return true;
    return normalizePredictionVenueName(venue.venue) === targetName;
  });
};

const mergePredictionVenuePreserveRichData = (baseVenue: PredictionVenueItem, overlayVenue: PredictionVenueItem): PredictionVenueItem => {
  const merged: PredictionVenueItem = {
    ...baseVenue,
    id: preferPredictionNonEmpty(baseVenue.id, overlayVenue.id) ?? baseVenue.id,
    venue: preferPredictionNonEmpty(baseVenue.venue, overlayVenue.venue) ?? baseVenue.venue,
    venueCode: preferPredictionNonEmpty(baseVenue.venueCode, overlayVenue.venueCode),
    slug: preferPredictionNonEmpty(baseVenue.slug, overlayVenue.slug),
    title: preferPredictionNonEmpty(baseVenue.title, overlayVenue.title),
    grade: preferPredictionNonEmpty(baseVenue.grade, overlayVenue.grade),
    startDate: preferPredictionNonEmpty(baseVenue.startDate, overlayVenue.startDate),
    endDate: preferPredictionNonEmpty(baseVenue.endDate, overlayVenue.endDate),
    session: preferPredictionNonEmpty(baseVenue.session, overlayVenue.session) ?? baseVenue.session,
    hasGirls: baseVenue.hasGirls ?? overlayVenue.hasGirls,
    note: mergePredictionSourceNote(baseVenue.note, overlayVenue.note),
    raceNos: preferPredictionLongerArray(baseVenue.raceNos, overlayVenue.raceNos),
    raceIds: preferPredictionLongerArray(baseVenue.raceIds, overlayVenue.raceIds),
    races: [...(baseVenue.races ?? [])],
  };

  for (const overlayRace of overlayVenue.races ?? []) {
    const overlayRaceId = getPredictionRaceIdForVenue(overlayVenue, overlayRace);
    const raceIndex = merged.races.findIndex((race) => {
      const raceId = getPredictionRaceIdForVenue(merged, race);
      if (overlayRaceId && raceId === overlayRaceId) return true;
      return race.raceNo === overlayRace.raceNo;
    });

    if (raceIndex >= 0) {
      merged.races[raceIndex] = mergeRacePreserveRichData(merged.races[raceIndex], overlayRace);
    } else {
      merged.races.push(overlayRace);
    }
  }

  merged.races = merged.races.sort((a, b) => a.raceNo - b.raceNo);
  return merged;
};

export const mergePredictionTodayFeedsPreserveRichData = (feeds: PredictionTodayFeed[]): PredictionTodayFeed => {
  const [firstFeed, ...restFeeds] = feeds;
  const merged: PredictionTodayFeed = {
    generatedAt: firstFeed.generatedAt,
    date: firstFeed.date,
    venues: [...(firstFeed.venues ?? [])],
  };

  for (const feed of restFeeds) {
    merged.generatedAt = preferPredictionNonEmpty(merged.generatedAt, feed.generatedAt);
    merged.date = preferPredictionNonEmpty(merged.date, feed.date) ?? merged.date;

    for (const overlayVenue of feed.venues ?? []) {
      const existingVenue = findPredictionVenueMatch(merged.venues, overlayVenue);
      if (!existingVenue) {
        merged.venues.push(overlayVenue);
        continue;
      }
      const venueIndex = merged.venues.indexOf(existingVenue);
      merged.venues[venueIndex] = mergePredictionVenuePreserveRichData(existingVenue, overlayVenue);
    }
  }

  return merged;
};

export const buildPredictionOddsBuckets = (race?: PredictionRaceItem | null) => {
  const trifecta = [...(race?.oddsTrifecta ?? [])]
    .sort((a, b) => (a.popularity ?? 999) - (b.popularity ?? 999) || a.odds - b.odds);
  const picked = new Set<string>();
  const popular = trifecta.slice(0, 5);
  popular.forEach((item) => picked.add(item.combination));
  const middle = trifecta.filter((item) => item.odds >= 30 && item.odds < 100 && !picked.has(item.combination)).slice(0, 4);
  middle.forEach((item) => picked.add(item.combination));
  const longshot = trifecta.filter((item) => item.odds >= 100 && !picked.has(item.combination)).slice(0, 4);

  return [
    { label: "人気上位", items: popular },
    { label: "中穴帯", items: middle.length > 0 ? middle : trifecta.filter((item) => !picked.has(item.combination)).slice(0, 4) },
    { label: "大穴帯", items: longshot.length > 0 ? longshot : trifecta.filter((item) => !picked.has(item.combination)).slice(4, 8) },
  ];
};

export const buildPredictionExportText = ({
  date,
  venue,
  race,
  materialRace,
  materialRiders,
  gradeLabel,
  venueSummary,
  weather,
  weatherFallbackText,
  memo,
  riderBasicText,
  recentPerformanceText,
  recentRaceText,
  matchupText,
  trackAffinityText,
  dataAnalysisText,
  oddsText,
}: {
  date: string;
  venue: PredictionVenueItem;
  race: PredictionRaceItem;
  materialRace?: PredictionRaceItem;
  materialRiders?: PredictionRiderItem[];
  gradeLabel: string;
  venueSummary: PredictionVenueSummary;
  weather: PredictionWeatherData | null;
  weatherFallbackText: string;
  memo: string;
  riderBasicText: string;
  recentPerformanceText: string;
  recentRaceText: string;
  matchupText: string;
  trackAffinityText: string;
  dataAnalysisText: string;
  oddsText: string;
}) => {
  const exportRace = materialRace ?? race;
  const exportRiders = materialRiders?.length
    ? materialRiders
    : getPredictionMaterialRidersForKeirinRace(exportRace, venue);
  const exportContexts = buildPredictionExportContextsFromRiders(exportRiders);
  const resolvedRiderBasicText = riderBasicText.trim() || buildPredictionBasicRiderExport(exportContexts, exportRace);
  const resolvedRecentPerformanceText = recentPerformanceText.trim() || buildPredictionRecentPerformanceExport(exportContexts);
  const resolvedRecentRaceText = recentRaceText.trim() || buildPredictionRecentRaceExport(exportContexts, venue, gradeLabel);
  const resolvedMatchupText = matchupText.trim() || buildPredictionMatchupExport(exportContexts, exportRace);
  const resolvedTrackAffinityText = trackAffinityText.trim() || buildPredictionTrackAffinityExport(exportContexts, venue);
  const resolvedDataAnalysisText = dataAnalysisText.trim() || buildPredictionDataAnalysisExport(exportContexts, venue, exportRace, venueSummary);
  const resolvedOddsText = oddsText.trim() || buildPredictionOddsExport(exportRace);
  const raceIdLabel = normalizePredictionExportValue(getPredictionRaceIdForVenue(venue, exportRace) || exportRace.sourceNote, "race_idなし");
  const raceTitleLabel = normalizePredictionExportValue(
    exportRace.title || exportRace.sourceNote || (venue.title ? `${venue.title} ${exportRace.raceNo}R` : ""),
    "レース名なし"
  );
  const venueFallbackLabel = venueSummary.source === "missing" ? "未登録" : "未取得";
  const lineupText = buildPredictionKdreamsLineupExport(exportRace);
  void memo;

  return [
    "[A. レース基本情報]",
    `会場名: ${normalizePredictionExportValue(venue.venue, "会場情報なし")}`,
    `日付: ${normalizePredictionExportValue(date, "日付情報なし")}`,
    `レース番号: ${exportRace.raceNo}R`,
    `発走時刻: ${normalizePredictionExportValue(exportRace.time, "時刻情報なし")}`,
    `時間帯: ${normalizePredictionExportValue(getPredictionSessionBadge(venue), "時間帯情報なし")}`,
    `グレード: ${normalizePredictionExportValue(gradeLabel, "グレード情報なし")}`,
    `race_id: ${raceIdLabel}`,
    `レースタイトル: ${raceTitleLabel}`,
    "",
    "[B. KDreams 並び予想 / 周回予想]",
    lineupText,
    "",
    "[C. 会場特徴 / バンク傾向]",
    `バンク特徴: ${normalizePredictionMaterialValue(venueSummary.bankFeature, venueFallbackLabel)}`,
    `狙いどころ: ${normalizePredictionMaterialValue(venueSummary.target, venueFallbackLabel)}`,
    `注意点: ${normalizePredictionMaterialValue(venueSummary.caution, venueFallbackLabel)}`,
    `荒れそう度: ${normalizePredictionMaterialValue(venueSummary.volatility, venueFallbackLabel)}`,
    `バンク長: ${normalizePredictionMaterialValue(venueSummary.bankLength, venueFallbackLabel)}`,
    `会場メモ: ${normalizePredictionMaterialValue(venueSummary.bankMemo, venueFallbackLabel)}`,
    "",
    "[D. 天気 / 風]",
    `基準時刻: ${normalizePredictionExportValue(weather?.referenceText ?? weatherFallbackText, "時刻情報なし")}`,
    `天候: ${normalizePredictionExportValue(weather?.weatherLabel ?? weatherFallbackText, "天気情報なし")}`,
    `気温: ${normalizePredictionExportValue(weather?.temperatureText ?? weatherFallbackText, "気温情報なし")}`,
    `風速: ${normalizePredictionExportValue(weather?.windSpeedText ?? weatherFallbackText, "風速情報なし")}`,
    `風向: ${normalizePredictionExportValue(weather?.windDirectionText ?? weatherFallbackText, "風向情報なし")}`,
    `降水: ${normalizePredictionExportValue(weather?.precipitationText ?? weatherFallbackText, "降水情報なし")}`,
    `採用予報: ${normalizePredictionExportValue(weather?.updatedAtText ?? weatherFallbackText, "時刻情報なし")}`,
    "",
    "[E. KDreams 出走表詳細]",
    resolvedRiderBasicText,
    "",
    "[F. KDreams 選手コメント / 前回出走レース成績]",
    resolvedRecentPerformanceText,
    "",
    "[G. KDreams 年間勝利度数]",
    resolvedRecentRaceText,
    "",
    "[H. KDreams 同走路年間勝利度数]",
    resolvedMatchupText,
    "",
    "[I. KDreams 当所5年]",
    resolvedTrackAffinityText,
    "",
    "[J. KDreams取得データまとめ]",
    resolvedDataAnalysisText,
    "",
    "[K. KDreams オッズ]",
    resolvedOddsText,
    "",
    "[L. 補足ソース]",
    buildPredictionMemoExport(exportRace, memo),
  ].join("\n");
};

export type FeaturedSupplementRiderInfo = {
  rider: string;
  branch?: string;
};

export const getFeaturedSupplementRiders = (
  race?: PredictionRaceItem | null,
  favorites: FavoriteRiderDisplayItem[] = []
): FeaturedSupplementRiderInfo[] => {
  if (!race?.riders?.length) return [];

  const favoriteNameSet = new Set(favorites.map((item) => item.rider));
  const leadText = compactPredictionGuideText(race.lead ?? "");

  return [...race.riders]
    .map((rider) => ({
      rider,
      score: parsePredictionNumber(rider.score) ?? -1,
      trifectaRate: parsePredictionNumber(rider.trifectaRate) ?? -1,
      leadRank: leadText && leadText.includes(rider.name) ? 2 : 0,
      styleRank: rider.style?.includes("逃") || rider.style?.includes("捲") ? 2 : rider.style?.includes("両") ? 1 : 0,
      favoriteRank: favoriteNameSet.has(rider.name as FavoriteRiderName) ? 1 : 0,
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.trifectaRate !== a.trifectaRate) return b.trifectaRate - a.trifectaRate;
      if (b.leadRank !== a.leadRank) return b.leadRank - a.leadRank;
      if (b.styleRank !== a.styleRank) return b.styleRank - a.styleRank;
      if (b.favoriteRank !== a.favoriteRank) return b.favoriteRank - a.favoriteRank;
      return Number(a.rider.carNo) - Number(b.rider.carNo);
    })
    .slice(0, 4)
    .map(({ rider }) => ({
      rider: rider.name,
      branch: compactPredictionGuideText(rider.prefecture ?? "") || undefined,
    }));
};

export const normalizeFavoriteRiderLineupOverrides = (items: FavoriteRiderLineupOverride[]): FavoriteRiderLineupOverride[] => {
  return items.filter((entry) => {
    return (
      FAVORITE_RIDER_OPTIONS.includes(entry.rider) &&
      typeof entry.venue === "string" &&
      typeof entry.startDate === "string" &&
      typeof entry.endDate === "string"
    );
  });
};

export const buildFavoriteRiderFeed = (
  lineupOverrides: FavoriteRiderLineupOverride[] = []
): FavoriteRiderFeedItem[] => {
  return normalizeFavoriteRiderLineupOverrides(lineupOverrides).map((entry) => ({
    ...entry,
    status: entry.status ?? (typeof entry.raceNumber === "number" ? "race-fixed" : "lineup-pending"),
    updatedAt: compactPredictionGuideText(entry.updatedAt ?? "") || undefined,
  }));
};

export const FAVORITE_RIDER_FALLBACK_FEED: FavoriteRiderFeedItem[] = buildFavoriteRiderFeed();

export const loadCachedFavoriteRiderFeed = (): { feed: FavoriteRiderFeedItem[]; version: string } | null => {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(FAVORITE_RIDER_FEED_CACHE_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as FavoriteRiderFeedFile;
    if (parsed.cachedDate !== TODAY) return null;

    const lineupOverrides = Array.isArray(parsed.items) ? normalizeFavoriteRiderLineupOverrides(parsed.items) : [];
    const feed = buildFavoriteRiderFeed(lineupOverrides);
    const activeFeed = filterFavoriteRiderFeedForDate(feed, TODAY);
    if (activeFeed.length === 0) return null;

    return {
      feed,
      version: parsed.version?.trim() || FAVORITE_RIDER_FALLBACK_VERSION,
    };
  } catch {
    return null;
  }
};

export const saveCachedFavoriteRiderFeed = (payload: FavoriteRiderFeedFile) => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(FAVORITE_RIDER_FEED_CACHE_STORAGE_KEY, JSON.stringify({ ...payload, cachedDate: TODAY }));
  } catch {
    // ignore cache write errors
  }
};

export const fetchFavoriteRiderFeedFile = async (): Promise<{
  feed: FavoriteRiderFeedItem[];
  version: string;
} | null> => {
  if (typeof window === "undefined") return null;

  const warnEmptyFavoriteFeed = (reason: "response-empty" | "stale-cache") => {
    const warningKey = `${TODAY}:${reason}`;
    if (favoriteFeedWarningKeys.has(warningKey)) return;
    favoriteFeedWarningKeys.add(warningKey);
    console.warn("[dashboard] favorite rider feed has no active items for today", {
      date: TODAY,
      reason,
      fallbackEntries: FAVORITE_RIDER_FALLBACK_FEED.length,
    });
  };

  try {
    const response = await fetch(`${FAVORITE_RIDER_FEED_JSON_PATH}?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return loadCachedFavoriteRiderFeed();

    const json = (await response.json()) as FavoriteRiderFeedFile;
    const lineupOverrides = Array.isArray(json.items) ? normalizeFavoriteRiderLineupOverrides(json.items) : [];
    saveCachedFavoriteRiderFeed({ version: json.version, items: lineupOverrides });
    const feed = buildFavoriteRiderFeed(lineupOverrides);
    const activeFeed = filterFavoriteRiderFeedForDate(feed, TODAY);

    if (activeFeed.length === 0) {
      warnEmptyFavoriteFeed("response-empty");
      return {
        feed: EMPTY_FAVORITE_RIDER_FEED,
        version: json.version?.trim() || FAVORITE_RIDER_FALLBACK_VERSION,
      };
    }

    return {
      feed,
      version: json.version?.trim() || FAVORITE_RIDER_FALLBACK_VERSION,
    };
  } catch {
    const cached = loadCachedFavoriteRiderFeed();
    if (!cached) return null;
    if (filterFavoriteRiderFeedForDate(cached.feed, TODAY).length === 0) {
      warnEmptyFavoriteFeed("stale-cache");
      return {
        feed: EMPTY_FAVORITE_RIDER_FEED,
        version: cached.version,
      };
    }
    return cached;
  }
};

export type DailyMetricFormState = {
  profitLoss: string;
  hitRate: string;
  recoveryRate: string;
  note: string;
};

export const createMetricFormState = (item?: DailyMetricItem): DailyMetricFormState => ({
  profitLoss: item?.profitLoss !== undefined ? String(item.profitLoss) : "",
  hitRate: item?.hitRate !== undefined ? String(item.hitRate) : "",
  recoveryRate: item?.recoveryRate !== undefined ? String(item.recoveryRate) : "",
  note: item?.note ?? "",
});

export const sanitizeMetricInput = (value: string) => value.replace(/[^\d-]/g, "");

export const parseOptionalNumber = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const loadStoredDailyMetrics = (): DailyMetricsMap => {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(DAILY_METRICS_STORAGE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};

    return parsed as DailyMetricsMap;
  } catch {
    return {};
  }
};

export const saveStoredDailyMetrics = (map: DailyMetricsMap) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DAILY_METRICS_STORAGE_KEY, JSON.stringify(map));
  } catch (error) {
    console.warn("[DailyMetricsStorage] save failed", error);
  }
};

export const loadStoredFavoriteRiders = (): FavoriteRiderMap => {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(FAVORITE_RIDERS_STORAGE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};

    const nextMap: FavoriteRiderMap = {};

    Object.entries(parsed).forEach(([key, value]) => {
      if (!Array.isArray(value)) return;
      nextMap[key] = value.filter(
        (name): name is string => typeof name === "string" && FAVORITE_RIDER_OPTIONS.includes(name as FavoriteRiderName)
      );
    });

    return nextMap;
  } catch {
    return {};
  }
};

export const saveStoredFavoriteRiders = (map: FavoriteRiderMap) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FAVORITE_RIDERS_STORAGE_KEY, JSON.stringify(map));
  } catch (error) {
    console.warn("[FavoriteRiderStorage] save failed", error);
  }
};

export const isFavoriteRidersEmpty = (names?: string[]) => !names || names.length === 0;

export const expandDateRange = (startDate: string, endDate: string) => {
  const dates: string[] = [];
  const current = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  while (current <= end) {
    dates.push(toIsoDateString(current));
    current.setDate(current.getDate() + 1);
  }

  return dates;
};

export const buildAutoFavoriteRiderMap = (favoriteRiderFeed: FavoriteRiderFeedItem[] = EMPTY_FAVORITE_RIDER_FEED) => {
  const map: FavoriteRiderMap = {};

  favoriteRiderFeed.forEach((entry) => {
    expandDateRange(entry.startDate, entry.endDate).forEach((iso) => {
      if (!map[iso]) map[iso] = [];
      if (!map[iso].includes(entry.rider)) {
        map[iso].push(entry.rider);
      }
    });
  });

  return map;
};

export const getFavoriteRiderRaceLabel = (entry: FavoriteRiderFeedItem) => {
  if (entry.raceNumber) return `${entry.raceNumber}R予定`;
  if (entry.status === "race-fixed") return "番組確定待ち";
  if (entry.status === "lineup-pending") return "前日夜更新待ち";
  return "開催登録済み";
};

export const mergeFavoriteRiderMaps = (baseMap: FavoriteRiderMap, overrideMap: FavoriteRiderMap): FavoriteRiderMap => {
  const merged: FavoriteRiderMap = { ...baseMap };

  Object.entries(overrideMap).forEach(([iso, riders]) => {
    if (!Array.isArray(riders) || riders.length === 0) {
      delete merged[iso];
      return;
    }

    merged[iso] = Array.from(new Set([...(merged[iso] ?? []), ...riders]));
  });

  return merged;
};

export const getFavoriteRiderDisplayItems = (isoDate: string, riderNames: string[], favoriteRiderFeed: FavoriteRiderFeedItem[] = EMPTY_FAVORITE_RIDER_FEED): FavoriteRiderDisplayItem[] => {
  const autoItems = favoriteRiderFeed.filter(
    (entry) => entry.startDate <= isoDate && entry.endDate >= isoDate && riderNames.includes(entry.rider)
  ).map((entry) => ({
    rider: entry.rider,
    venue: entry.venue,
    raceLabel: getFavoriteRiderRaceLabel(entry),
    status: entry.status,
    updatedAt: entry.updatedAt,
  }));

  const manualOnlyItems = riderNames
    .filter((name) => !autoItems.some((item) => item.rider === name))
    .map((name) => ({ rider: name as FavoriteRiderName, venue: "開催未設定", raceLabel: undefined }));

  return [...autoItems, ...manualOnlyItems];
};


export const getFavoriteDisplayItemsForRace = (race: RaceScheduleItem, isoDate: string, favoriteRiderFeed: FavoriteRiderFeedItem[] = EMPTY_FAVORITE_RIDER_FEED) => {
  return favoriteRiderFeed.filter(
    (entry) => entry.venue === race.venue && entry.startDate <= isoDate && entry.endDate >= isoDate
  ).map((entry) => ({ rider: entry.rider, venue: entry.venue, raceLabel: getFavoriteRiderRaceLabel(entry), status: entry.status, updatedAt: entry.updatedAt }));
};

export const getFavoriteDisplayItemsForScheduleRace = (race: RaceScheduleItem, favoriteRiderFeed: FavoriteRiderFeedItem[] = EMPTY_FAVORITE_RIDER_FEED) => {
  return favoriteRiderFeed.filter(
    (entry) => entry.venue === race.venue && entry.startDate <= race.endDate && entry.endDate >= race.startDate
  ).map((entry) => ({ rider: entry.rider, venue: entry.venue, raceLabel: getFavoriteRiderRaceLabel(entry), status: entry.status, updatedAt: entry.updatedAt }));
};

export const hasFavoriteForRace = (
  race: RaceScheduleItem,
  isoDate: string,
  favoriteRiderFeed: FavoriteRiderFeedItem[] = EMPTY_FAVORITE_RIDER_FEED
) => getFavoriteDisplayItemsForRace(race, isoDate, favoriteRiderFeed).length > 0;


export const getFeaturedRaceGradeBucket = (grade: RaceScheduleItem["grade"]) => {
  if (grade === "GP" || grade === "GI" || grade === "GII" || grade === "GIII") return 0;
  if (grade === "F1") return 1;
  return 2;
};

export const getFavoritePriorityForRace = (
  race: RaceScheduleItem,
  isoDate: string,
  favoriteRiderFeed: FavoriteRiderFeedItem[] = EMPTY_FAVORITE_RIDER_FEED
) => {
  const favoriteItems = getFavoriteDisplayItemsForRace(race, isoDate, favoriteRiderFeed);
  if (favoriteItems.length === 0) return 99;

  return Math.min(
    ...favoriteItems.map((item) => FAVORITE_RIDER_PRIORITY[item.rider] ?? 99)
  );
};

export const compareFeaturedTodayRaces = (
  a: RaceScheduleItem,
  b: RaceScheduleItem,
  isoDate: string,
  favoriteRiderFeed: FavoriteRiderFeedItem[] = EMPTY_FAVORITE_RIDER_FEED
) => {
  const gradeBucketDiff =
    getFeaturedRaceGradeBucket(a.grade) - getFeaturedRaceGradeBucket(b.grade);
  if (gradeBucketDiff !== 0) return gradeBucketDiff;

  const aHasFavorite = hasFavoriteForRace(a, isoDate, favoriteRiderFeed) ? 0 : 1;
  const bHasFavorite = hasFavoriteForRace(b, isoDate, favoriteRiderFeed) ? 0 : 1;
  if (aHasFavorite !== bHasFavorite) return aHasFavorite - bHasFavorite;

  const favoritePriorityDiff =
    getFavoritePriorityForRace(a, isoDate, favoriteRiderFeed) -
    getFavoritePriorityForRace(b, isoDate, favoriteRiderFeed);
  if (favoritePriorityDiff !== 0) return favoritePriorityDiff;

  if (a.hasGirls !== b.hasGirls) return a.hasGirls ? -1 : 1;

  return compareTodayRacesBySession(a, b);
};

export const pickFeaturedTodayRace = <T extends RaceScheduleItem>(
  races: T[],
  isoDate: string,
  favoriteRiderFeed: FavoriteRiderFeedItem[] = EMPTY_FAVORITE_RIDER_FEED
) => {
  return [...races].sort((a, b) => compareFeaturedTodayRaces(a, b, isoDate, favoriteRiderFeed))[0] ?? null;
};

export type DashboardTodayRaceCard = RaceScheduleItem & {
  displayGradeLabel?: string;
};

export type PredictionNavigationTarget = {
  venueName: string;
  venueSlug?: string;
  raceNumber?: number;
  raceId?: string;
  date?: string;
  title?: string;
};

export type FeaturedRaceOddsTone = "favorite" | "balanced" | "chaotic" | "pending";

export type FeaturedRaceRiderCard = {
  role: "主役候補" | "相手本線" | "穴候補";
  name: string;
  style: string;
  scoreText: string;
  comment: string;
  tags: string[];
};

export type FeaturedRaceData = {
  venue: string;
  venueSlug?: string;
  date: string;
  raceNumber?: string;
  raceId?: string;
  grade: string;
  sessionLabel: string;
  title: string;
  subtitle: string;
  viewPoint: string;
  reason: string;
  memo: string;
  oddsTone: FeaturedRaceOddsTone;
  oddsComment: string;
  membersLead: string;
  primaryRiders: FeaturedRaceRiderCard[];
};

export const clipFeaturedText = (value: string, maxLength = 84) => {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength).replace(/[、。・,\s]+$/g, "")}…`;
};

export const isRaceScheduleGrade = (value?: string | null): value is RaceScheduleItem["grade"] => {
  return value === "GP" || value === "GI" || value === "GII" || value === "GIII" || value === "F1" || value === "F2";
};

export const resolveDashboardRaceGrade = (value?: string | null, fallback?: RaceScheduleItem["grade"]): RaceScheduleItem["grade"] | undefined => {
  const normalized = normalizePredictionGradeForBadge(value);
  if (isRaceScheduleGrade(normalized)) return normalized;
  return fallback;
};

export const deriveDashboardRaceGradeFromPredictionVenue = (venue: PredictionVenueItem): RaceScheduleItem["grade"] | undefined => {
  const source = [
    venue.title ?? "",
    venue.note ?? "",
    ...(venue.races ?? []).flatMap((race) => [race.title ?? "", race.sourceNote ?? ""]),
  ].join(" ");

  const normalized = normalizePredictionGradeForBadge(source);
  if (isRaceScheduleGrade(normalized)) return normalized;
  if (/Ｓ級|S級/.test(source)) return "F1";
  if (/Ａ級|A級|Ｌ級|L級|チャレンジ|ガールズ/.test(source)) return "F2";
  return undefined;
};

export const buildTodayRaceCardFromPredictionVenue = (venue: PredictionVenueItem, fallback?: DashboardTodayRaceCard): DashboardTodayRaceCard => {
  const title = (venue.title ?? "").replace(/\s*出走表一覧$/g, "").trim();
  const generatedGrade = resolveDashboardRaceGrade(venue.grade);
  const derivedGrade = deriveDashboardRaceGradeFromPredictionVenue(venue);
  const resolvedGrade = generatedGrade ?? derivedGrade ?? fallback?.grade ?? "F2";
  const displayGradeLabel = generatedGrade ?? derivedGrade ?? fallback?.displayGradeLabel ?? fallback?.grade;

  return {
    id: fallback?.id ?? `generated-${venue.id}`,
    venue: venue.venue,
    title: title || fallback?.title || `${venue.venue} 開催`,
    grade: resolvedGrade,
    displayGradeLabel,
    startDate: venue.startDate ?? fallback?.startDate ?? TODAY,
    endDate: venue.endDate ?? fallback?.endDate ?? TODAY,
    session: venue.session ?? fallback?.session ?? "day",
    hasGirls: venue.hasGirls ?? fallback?.hasGirls ?? false,
    source: fallback?.source ?? "manual",
    note: fallback?.note ?? venue.note,
  };
};

export const mergeTodayRaceCardItems = (staticRaces: RaceScheduleItem[], generatedVenues: PredictionVenueItem[]) => {
  const merged = new Map<string, DashboardTodayRaceCard>();

  staticRaces.forEach((race) => {
    merged.set(normalizePredictionVenueName(race.venue), {
      ...race,
      displayGradeLabel: race.grade,
    });
  });

  generatedVenues.forEach((venue) => {
    const key = normalizePredictionVenueName(venue.venue);
    const fallback = merged.get(key);
    merged.set(key, buildTodayRaceCardFromPredictionVenue(venue, fallback));
  });

  return Array.from(merged.values()).sort(compareTodayRacesBySession);
};

export const getFeaturedPredictionRaceTarget = (venue: PredictionVenueItem, now: Date) => {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const racesWithMinutes = venue.races
    .map((race) => ({ race, minutes: getPredictionTimeMinutes(race.time) }))
    .filter((item): item is { race: PredictionRaceItem; minutes: number } => item.minutes !== null);

  if (racesWithMinutes.length === 0) return venue.races[0] ?? null;

  return racesWithMinutes.find((item) => item.minutes >= nowMinutes)?.race ?? racesWithMinutes[racesWithMinutes.length - 1].race;
};

export const parsePredictionNumber = (value?: string | number | null) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

export const getFeaturedRaceOddsTone = (race?: PredictionRaceItem | null): { tone: FeaturedRaceOddsTone; comment: string } => {
  const trifecta = [...(race?.oddsTrifecta ?? [])]
    .map((item) => item.odds)
    .filter((value): value is number => Number.isFinite(value))
    .sort((a, b) => a - b);

  if (trifecta.length === 0) {
    return {
      tone: "pending",
      comment: "オッズ情報なし。",
    };
  }

  const top3 = trifecta.slice(0, 3);
  const topAverage = top3.reduce((sum, value) => sum + value, 0) / top3.length;
  const tenthOdds = trifecta[Math.min(9, trifecta.length - 1)] ?? trifecta[trifecta.length - 1];

  if (topAverage <= 18 && tenthOdds <= 45) {
    return {
      tone: "favorite",
      comment: "本命寄り。人気上位の3連単オッズが低く、買い目を絞りやすい構図です。",
    };
  }

  if (topAverage <= 40 && tenthOdds <= 90) {
    return {
      tone: "balanced",
      comment: "中穴混在。人気帯と中穴帯が重なっていて、相手探しの精度が必要です。",
    };
  }

  return {
    tone: "chaotic",
    comment: "荒れ気配。上位オッズも割れていて、買い目が広がりやすい一戦です。",
  };
};

export const getFeaturedRaceOddsToneLabel = (tone: FeaturedRaceOddsTone) => {
  switch (tone) {
    case "favorite":
      return "本命寄り";
    case "balanced":
      return "中穴混在";
    case "chaotic":
      return "荒れ気配";
    default:
      return "オッズ情報なし";
  }
};

export const getFeaturedRaceWeatherComment = (weather?: PredictionWeatherData | null) => {
  if (!weather) return "";

  const windSpeed = parsePredictionNumber(weather.windSpeedText);
  if (windSpeed !== null && windSpeed <= 4) {
    return `風は${weather.windDirectionText} ${weather.windSpeedText}で弱め。天候は${weather.weatherLabel}、並びの確認に集中しやすい条件です。`;
  }
  if (windSpeed !== null && windSpeed >= 9) {
    return `風は${weather.windDirectionText} ${weather.windSpeedText}。風向きの影響を見ながら組み立てたい条件です。`;
  }
  return `天候は${weather.weatherLabel}、風は${weather.windDirectionText} ${weather.windSpeedText}。コンディションは標準域です。`;
};

export const getFeaturedRaceLineupComment = (race?: PredictionRaceItem | null) => {
  const groups = buildPredictionLineupGroups(race);
  if (groups.length === 0) return "並び情報なし。";
  if (groups.length === 1) return `並びは ${groups[0]}。単一路線の構成です。`;
  return `並びは${groups.length}分戦。${groups.join(" / ")}のライン構成です。`;
};

export const getFeaturedRaceSeriesComment = (race: DashboardTodayRaceCard) => {
  const facts = [race.displayGradeLabel ?? race.grade ?? "—", getSessionLabel(race.session)];
  if (race.hasGirls) facts.push("ガールズ開催を含みます");
  if (race.note && !/Kドリームス出走表一覧から自動生成/.test(race.note)) facts.push(race.note);
  return facts.join(" / ");
};

export const getFeaturedRaceVenueComment = (summary?: PredictionVenueSummary | null) => {
  if (!summary || summary.source === "missing") return "";
  const bankFeature = clipFeaturedText(summary.bankFeature, 44);
  const target = clipFeaturedText(summary.target, 44);
  const volatility = clipFeaturedText(summary.volatility, 36);
  return `${bankFeature} ${target} ${volatility}`.trim();
};

export const getFeaturedRaceLeadComment = (race?: PredictionRaceItem | null) => {
  const lead = clipFeaturedText(race?.lead ?? "", 52);
  const coreBuy = clipFeaturedText(race?.coreBuy ?? "", 46);
  const coreFade = clipFeaturedText(race?.coreFade ?? "", 46);

  if (lead && coreBuy) return `主導権候補は ${lead}。本線は ${coreBuy}。`;
  if (lead) return `主導権候補は ${lead}。`;
  if (coreBuy) return `本線メモは ${coreBuy}。`;
  if (coreFade) return `消し候補メモは ${coreFade}。`;
  return "";
};

export const getFeaturedRaceFavoriteComment = (favorites: FavoriteRiderDisplayItem[]) => {
  if (favorites.length === 0) return "推し出走情報なし。";
  return `推し出走は ${favorites.map((item) => item.rider).join(" / ")}。`;
};

export const getFeaturedRaceScoreLeaders = (race?: PredictionRaceItem | null) => {
  return [...(race?.riders ?? [])]
    .map((rider) => ({ rider, score: parsePredictionNumber(rider.score) }))
    .filter((item): item is { rider: PredictionRiderItem; score: number } => item.score !== null)
    .sort((a, b) => b.score - a.score);
};

export const formatFeaturedRiderTag = (rider: PredictionRiderItem, isFavorite: boolean, raceLabel?: string) => {
  const tags = [rider.style ? `脚質 ${rider.style}` : "脚質未取得"];
  const trifectaRate = parsePredictionNumber(rider.trifectaRate);
  if (trifectaRate !== null) {
    tags.push(`3連対率 ${trifectaRate.toFixed(1)}%`);
  }
  if (isFavorite) {
    tags.push("推し登録");
  }
  if (raceLabel) {
    tags.push(raceLabel);
  }
  return tags;
};

export const buildFeaturedRacePrimaryRiders = ({
  race,
  favorites,
  gradeLabel,
  weather,
  oddsTone,
  leadComment,
}: {
  race?: PredictionRaceItem | null;
  favorites: FavoriteRiderDisplayItem[];
  gradeLabel: string;
  weather?: PredictionWeatherData | null;
  oddsTone: FeaturedRaceOddsTone;
  leadComment: string;
}): FeaturedRaceRiderCard[] => {
  const scoredRiders = getFeaturedRaceScoreLeaders(race);
  const favoriteNameSet = new Set(favorites.map((item) => item.rider));
  const remaining = [...scoredRiders];

  const takeRider = () => remaining.shift()?.rider;
  const primary = takeRider();
  const rival = takeRider();
  const hole = remaining.find((item) => !favoriteNameSet.has(item.rider.name as FavoriteRiderName))?.rider ?? takeRider();

  const makeCard = (
    rider: PredictionRiderItem | undefined,
    role: FeaturedRaceRiderCard["role"],
    fallbackComment: string
  ): FeaturedRaceRiderCard => {
    if (!rider) {
      return {
        role,
        name: "出走データなし",
        style: "—",
        scoreText: "—",
        comment: fallbackComment,
        tags: [gradeLabel],
      };
    }

    const score = parsePredictionNumber(rider.score);
    const trifectaRate = parsePredictionNumber(rider.trifectaRate);
    const isFavorite = favoriteNameSet.has(rider.name as FavoriteRiderName);
    const weatherTag = weather ? `${weather.weatherLabel}` : undefined;
    const styleComment = rider.style ? `脚質は${rider.style}` : "脚質情報なし";
    const popularityComment = oddsTone === "favorite"
      ? "本命寄りの一戦で軸に据えやすい存在です。"
      : oddsTone === "balanced"
        ? "人気の盲点まで含めて相手候補に残したい存在です。"
        : oddsTone === "chaotic"
          ? "人気が割れる構図で一発の目も拾いたい存在です。"
          : "オッズ情報なし。";
    const lineComment = leadComment && rider.name && leadComment.includes(rider.name)
      ? "主導権の中心候補として扱いやすいです。"
      : role === "相手本線"
        ? "番手差しや相手本線に据えやすい位置です。"
        : role === "穴候補"
          ? "相手ズレの拾いどころとして見ておきたい枠です。"
          : "軸候補として最初に確認したい存在です。";

    let comment = `${score !== null ? `競走得点 ${score.toFixed(1)}。` : "競走得点データなし。"} ${styleComment}。`;
    if (trifectaRate !== null) {
      comment += ` 3連対率は${trifectaRate.toFixed(1)}%。`;
    }
    comment += ` ${lineComment} ${popularityComment}`;

    return {
      role,
      name: rider.name,
      style: rider.style ?? "—",
      scoreText: score !== null ? score.toFixed(1) : "—",
      comment,
      tags: [
        ...formatFeaturedRiderTag(rider, isFavorite),
        ...(leadComment.includes(rider.name) ? ["主導権候補"] : []),
        ...(weatherTag ? [weatherTag] : []),
      ],
    };
  };

  return [
    makeCard(primary, "主役候補", "出走データなし。"),
    makeCard(rival, "相手本線", "出走データなし。"),
    makeCard(hole, "穴候補", "出走データなし。"),
  ];
};

export const buildFeaturedPredictionNavigationTarget = (
  race: DashboardTodayRaceCard | null,
  predictionVenue: PredictionVenueItem | null,
  now: Date
): PredictionNavigationTarget | null => {
  if (!race) return null;

  const targetRace = predictionVenue ? getFeaturedPredictionRaceTarget(predictionVenue, now) : null;

  return {
    venueName: race.venue,
    venueSlug: predictionVenue?.slug,
    raceNumber: targetRace?.raceNo,
    raceId: targetRace && predictionVenue ? predictionVenue.raceIds?.[targetRace.raceNo - 1] ?? targetRace.sourceNote ?? undefined : undefined,
    date: predictionVenue?.startDate ?? race.startDate,
    title: targetRace?.title ?? race.title,
  };
};

export const buildFeaturedRaceData = ({
  race,
  predictionVenue,
  predictionRace,
  venueSummary,
  weather,
  favorites,
  navigationTarget,
}: {
  race: DashboardTodayRaceCard | null;
  predictionVenue: PredictionVenueItem | null;
  predictionRace: PredictionRaceItem | null;
  venueSummary?: PredictionVenueSummary | null;
  weather?: PredictionWeatherData | null;
  favorites: FavoriteRiderDisplayItem[];
  navigationTarget: PredictionNavigationTarget | null;
}): FeaturedRaceData => {
  if (!race) {
    return {
      venue: "—",
      date: TODAY,
      grade: "—",
      sessionLabel: "—",
      title: "本日の注目開催はありません",
      subtitle: "本日の対象開催はありません。",
      viewPoint: "注目理由なし。",
      reason: "表示できる開催データがありません。",
      memo: "開催データなし。",
      oddsTone: "pending",
      oddsComment: "オッズ情報なし。",
      membersLead: "出走データなし。",
      primaryRiders: [],
    };
  }

  const gradeLabel = race.displayGradeLabel ?? race.grade ?? "—";
  const sessionLabel = getSessionLabel(race.session);
  const oddsTone = getFeaturedRaceOddsTone(predictionRace);
  const lineupComment = getFeaturedRaceLineupComment(predictionRace);
  const weatherComment = getFeaturedRaceWeatherComment(weather);
  const venueComment = getFeaturedRaceVenueComment(venueSummary);
  const leadComment = getFeaturedRaceLeadComment(predictionRace);
  const favoriteComment = getFeaturedRaceFavoriteComment(favorites);
  const scoreLeaders = getFeaturedRaceScoreLeaders(predictionRace);
  const hasOddsMaterial = (predictionRace?.oddsTrifecta?.length ?? 0) > 0;
  const topLeaderText = scoreLeaders.length > 0
    ? `${scoreLeaders.slice(0, 2).map((item) => `${item.rider.name} ${item.score.toFixed(1)}`).join(" / ")} が得点上位です。`
    : "得点上位データなし。";
  const title = predictionRace?.title ? `${race.venue} ${predictionRace.title}` : `${race.venue}の注目開催`;
  const subtitle = `${getFeaturedRaceSeriesComment(race)}。${predictionRace?.time ? `${predictionRace.time}発走予定です。` : `${race.title} の開催です。`}`;
  const viewPoint = predictionRace
    ? [lineupComment, leadComment].filter(Boolean).join(" ") || lineupComment
    : favoriteComment !== "推し出走情報なし。"
      ? favoriteComment
      : "注目理由なし。";
  const reason = !predictionRace
    ? venueComment || "当日素材は一部未取得です。"
    : hasOddsMaterial
      ? [oddsTone.comment, venueComment, weatherComment].filter(Boolean).join(" ")
      : oddsTone.comment;
  const memo = predictionRace
    ? `${topLeaderText} ${favoriteComment}${navigationTarget?.raceNumber ? ` 対象は ${navigationTarget.raceNumber}R。` : ""}`.trim()
    : favoriteComment !== "推し出走情報なし。"
      ? favoriteComment
      : navigationTarget?.raceNumber
        ? `対象は ${navigationTarget.raceNumber}R。`
        : "対象レース情報なし。";
  const membersLead = predictionRace?.title ? `${predictionRace.title} の出走メンバーから、得点・脚質・ラインをもとに3枠を抽出しています。` : "出走データなし。";

  return {
    venue: race.venue,
    venueSlug: predictionVenue?.slug,
    date: navigationTarget?.date ?? race.startDate,
    raceNumber: navigationTarget?.raceNumber ? `${navigationTarget.raceNumber}R` : undefined,
    raceId: navigationTarget?.raceId,
    grade: gradeLabel,
    sessionLabel,
    title,
    subtitle,
    viewPoint,
    reason,
    memo,
    oddsTone: oddsTone.tone,
    oddsComment: oddsTone.comment,
    membersLead,
    primaryRiders: buildFeaturedRacePrimaryRiders({ race: predictionRace, favorites, gradeLabel, weather, oddsTone: oddsTone.tone, leadComment }),
  };
};


export const isDailyMetricItemEmpty = (item: DailyMetricItem) =>
  item.profitLoss === undefined &&
  item.hitRate === undefined &&
  item.recoveryRate === undefined &&
  !item.note;

export const formatDateRange = (startDate: string, endDate: string) => {
  if (startDate === endDate) return startDate;
  return `${startDate} - ${endDate}`;
};

export const formatShortDateRange = (startDate: string, endDate: string) => {
  const start = startDate.slice(5).replace("-", ".");
  const end = endDate.slice(5).replace("-", ".");
  if (start === end) return start;
  return `${start} - ${end}`;
};

export const getSessionLabel = (session: "day" | "night" | "midnight") => {
  if (session === "day") return "デイ";
  if (session === "night") return "ナイター";
  return "ミッドナイト";
};

export const getGradeBadgeTone = (grade: RaceScheduleItem["grade"] | string) => {
  if (grade === "F1") {
    return {
      background: "#fff4e8",
      text: "#c46a1a",
      border: "#f6cfad",
      shadow: "0 4px 12px rgba(196,106,26,0.10)",
    };
  }

  if (grade === "GP" || grade === "GI" || grade === "GII" || grade === "GIII") {
    return {
      background: "#fdeeee",
      text: "#c35b68",
      border: "#f3c8cf",
      shadow: "0 4px 12px rgba(195,91,104,0.10)",
    };
  }

  return {
    background: "#f2ecfb",
    text: "#7a67b8",
    border: "#e0d6f4",
    shadow: "0 4px 12px rgba(122,103,184,0.08)",
  };
};

export const toIsoDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const monthTitleJa = (date: Date) => `${date.getFullYear()}年${date.getMonth() + 1}月`;


export const getJapanDateParts = (isoDate: string) => {
  const [year, month, day] = isoDate.split("-").map(Number);
  return { year, month, day };
};

export const getWeekdayFromIso = (isoDate: string) => {
  const { year, month, day } = getJapanDateParts(isoDate);
  return new Date(year, month - 1, day).getDay();
};

export const getNthWeekdayOfMonth = (year: number, month: number, weekday: number, nth: number) => {
  const firstDay = new Date(year, month - 1, 1).getDay();
  const offset = (weekday - firstDay + 7) % 7;
  return 1 + offset + (nth - 1) * 7;
};

export const getSpringEquinoxDay = (year: number) =>
  Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));

export const getAutumnEquinoxDay = (year: number) =>
  Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));

export const isJapaneseHoliday = (isoDate: string) => {
  const { year, month, day } = getJapanDateParts(isoDate);

  const fixedHolidays = new Set([
    `${year}-01-01`,
    `${year}-02-11`,
    `${year}-02-23`,
    `${year}-04-29`,
    `${year}-05-03`,
    `${year}-05-04`,
    `${year}-05-05`,
    `${year}-08-11`,
    `${year}-11-03`,
    `${year}-11-23`,
  ]);

  const pad = (value: number) => String(value).padStart(2, "0");
  const makeIso = (m: number, d: number) => `${year}-${pad(m)}-${pad(d)}`;

  fixedHolidays.add(makeIso(3, getSpringEquinoxDay(year)));
  fixedHolidays.add(makeIso(9, getAutumnEquinoxDay(year)));

  fixedHolidays.add(makeIso(1, getNthWeekdayOfMonth(year, 1, 1, 2)));
  fixedHolidays.add(makeIso(7, getNthWeekdayOfMonth(year, 7, 1, 3)));
  fixedHolidays.add(makeIso(9, getNthWeekdayOfMonth(year, 9, 1, 3)));
  fixedHolidays.add(makeIso(10, getNthWeekdayOfMonth(year, 10, 1, 2)));

  if (fixedHolidays.has(isoDate)) return true;

  const weekday = getWeekdayFromIso(isoDate);

  if (weekday === 1) {
    const previousDate = new Date(year, month - 1, day - 1);
    const previousIso = toIsoDateString(previousDate);
    if (fixedHolidays.has(previousIso)) return true;
  }

  const prevDate = new Date(year, month - 1, day - 1);
  const nextDate = new Date(year, month - 1, day + 1);
  const prevIso = toIsoDateString(prevDate);
  const nextIso = toIsoDateString(nextDate);

  if (
    weekday !== 0 &&
    weekday !== 6 &&
    fixedHolidays.has(prevIso) &&
    fixedHolidays.has(nextIso)
  ) {
    return true;
  }

  return false;
};

export const getCalendarDayNumberColor = (isoDate: string) => {
  const weekday = getWeekdayFromIso(isoDate);

  if (isJapaneseHoliday(isoDate) || weekday === 0) return "#dc2626";
  if (weekday === 6) return "#2563eb";
  return "#081224";
};
export const isRaceOnDate = (race: RaceScheduleItem, isoDate: string) =>
  race.startDate <= isoDate && race.endDate >= isoDate;

export const compareRaces = (a: RaceScheduleItem, b: RaceScheduleItem) => {
  const gradePriority: Record<string, number> = {
    GP: 0,
    GI: 1,
    GII: 2,
    GIII: 3,
    F1: 4,
    F2: 5,
  };

  const diff = (gradePriority[a.grade] ?? 99) - (gradePriority[b.grade] ?? 99);
  if (diff !== 0) return diff;
  if (a.startDate !== b.startDate) return a.startDate.localeCompare(b.startDate);
  return a.venue.localeCompare(b.venue, "ja");
};

export const compareTodayRacesBySession = (a: RaceScheduleItem, b: RaceScheduleItem) => {
  const sessionPriority: Record<RaceScheduleItem["session"], number> = {
    day: 1,
    night: 2,
    midnight: 3,
  };

  const morningBoost = (race: RaceScheduleItem) =>
    race.note?.includes("モーニング") ? 0 : 1;

  const aMorning = morningBoost(a);
  const bMorning = morningBoost(b);
  if (aMorning !== bMorning) return aMorning - bMorning;

  const sessionDiff = (sessionPriority[a.session] ?? 99) - (sessionPriority[b.session] ?? 99);
  if (sessionDiff !== 0) return sessionDiff;

  const gradeDiff = compareRaces(a, b);
  if (gradeDiff !== 0) return gradeDiff;

  return a.venue.localeCompare(b.venue, "ja");
};

export const getProfitTone = (value?: number) => {
  if (value === undefined) {
    return {
      text: "#94a3b8",
      bg: "#faf8fd",
      border: "#ede7f5",
    };
  }

  if (value > 0) {
    return {
      text: "#705eb0",
      bg: "#f2ecfb",
      border: "#ded3f4",
    };
  }

  if (value < 0) {
    return {
      text: "#b45309",
      bg: "#fff7ed",
      border: "#fed7aa",
    };
  }

  return {
    text: "#334155",
    bg: "#faf8fd",
    border: "#ede7f5",
  };
};

export const formatProfitLossCompact = (value?: number) => {
  if (value === undefined) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "±";
  const absValue = Math.abs(value);

  if (absValue >= 10000) {
    return `${sign}${(absValue / 10000).toFixed(absValue >= 100000 ? 0 : 1)}万`;
  }

  return `${sign}${absValue.toLocaleString()}`;
};

export const getProfitMiniTone = (value?: number) => {
  if (value === undefined) {
    return {
      text: "#94a3b8",
      bg: "rgba(248,250,252,0.92)",
      border: "#e9eef5",
    };
  }

  if (value > 0) {
    return {
      text: "#7a67b8",
      bg: "rgba(242,236,251,0.96)",
      border: "#e0d6f4",
    };
  }

  if (value < 0) {
    return {
      text: "#b45309",
      bg: "rgba(255,247,237,0.96)",
      border: "#fed7aa",
    };
  }

  return {
    text: "#475569",
    bg: "rgba(248,250,252,0.96)",
    border: "#ede7f5",
  };
};

export const getMetricCardTone = (kind: "default" | "profit", profitLoss?: number) => {
  if (kind === "profit") {
    const tone = getProfitTone(profitLoss);

    return {
      value: tone.text,
      label: profitLoss === undefined ? "#7b8a9d" : tone.text,
      bg:
        profitLoss === undefined
          ? "linear-gradient(180deg, #ffffff 0%, #fbf9fe 100%)"
          : `linear-gradient(180deg, ${tone.bg} 0%, #ffffff 100%)`,
      border: tone.border,
      glow:
        profitLoss === undefined
          ? "0 10px 22px rgba(15, 23, 42, 0.04)"
          : "0 14px 28px rgba(122, 103, 184, 0.08)",
    };
  }

  return {
    value: "#081224",
    label: "#64748b",
    bg: "linear-gradient(180deg, #ffffff 0%, #fbf9fe 100%)",
    border: "#ebe5f4",
    glow: "0 10px 22px rgba(15, 23, 42, 0.04)",
  };
};

export const todayDate = new Date();
export const oneMonthLaterDate = new Date();
oneMonthLaterDate.setMonth(oneMonthLaterDate.getMonth() + 1);

export const TODAY = toIsoDateString(todayDate);
export const ONE_MONTH_LATER = toIsoDateString(oneMonthLaterDate);

export const featuredScheduleRaces = raceScheduleData
  .filter((item) => {
    const isTargetGrade =
      item.grade === "GP" ||
      item.grade === "GI" ||
      item.grade === "GII" ||
      item.grade === "GIII" ||
      item.grade === "F1";

    const overlapsOneMonth =
      item.endDate >= TODAY && item.startDate <= ONE_MONTH_LATER;

    return isTargetGrade && overlapsOneMonth;
  })
  .sort(compareRaces)
  .slice(0, 10);

export const todayRaces = raceScheduleData
  .filter((item) => item.startDate <= TODAY && item.endDate >= TODAY)
  .sort(compareTodayRacesBySession);


export const getTodayRacesGridTemplateColumns = (count: number) => {
  if (count <= 1) return "repeat(1, minmax(0, 1fr))";
  if (count === 2) return "repeat(2, minmax(0, 1fr))";
  if (count <= 4) return "repeat(4, minmax(0, 1fr))";
  if (count <= 6) return "repeat(3, minmax(0, 1fr))";
  if (count <= 8) return "repeat(4, minmax(0, 1fr))";
  return "repeat(5, minmax(0, 1fr))";
};


export const hasFinderFilters = false;

export function buildCalendarDays(baseDate: Date, schedules: RaceScheduleItem[]): CalendarDay[] {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();

  const firstDay = new Date(year, month, 1);
  const lastDate = new Date(year, month + 1, 0).getDate();

  const jsDay = firstDay.getDay();
  const startWeekday = jsDay === 0 ? 6 : jsDay - 1;

  const totalCells = startWeekday + lastDate;
  const weeks = Math.ceil(totalCells / 7);
  const cells = weeks * 7;

  const startDate = new Date(year, month, 1 - startWeekday);
  const days: CalendarDay[] = [];

  for (let i = 0; i < cells; i++) {
    const cellDate = new Date(startDate);
    cellDate.setDate(startDate.getDate() + i);
    const iso = toIsoDateString(cellDate);

    days.push({
      iso,
      day: cellDate.getDate(),
      isCurrentMonth: cellDate.getMonth() === month,
      events: schedules.filter((race) => isRaceOnDate(race, iso)).sort(compareRaces),
    });
  }

  return days;
}

export function CalendarSectionInApp({ favoriteRiderFeed }: { favoriteRiderFeed: FavoriteRiderFeedItem[] }) {
  const [viewDate, setViewDate] = useState(new Date(todayDate.getFullYear(), todayDate.getMonth(), 1));
  const [selectedIso, setSelectedIso] = useState(TODAY);
  const [customMetricsMap, setCustomMetricsMap] = useState<DailyMetricsMap>({});
  const [predictionResultMap, setPredictionResultMap] = useState<PredictionResultMap>({});
  const [favoriteRiderMap, setFavoriteRiderMap] = useState<FavoriteRiderMap>({});
  const [isMetricModalOpen, setIsMetricModalOpen] = useState(false);
  const [metricFormState, setMetricFormState] = useState<DailyMetricFormState>(createMetricFormState());
  const [favoriteRiderFormState, setFavoriteRiderFormState] = useState<FavoriteRiderName[]>([]);
  const isMobile = useIsMobile();

  useEffect(() => {
    setCustomMetricsMap(loadStoredDailyMetrics());
    setPredictionResultMap(loadStoredPredictionResults());
    setFavoriteRiderMap(loadStoredFavoriteRiders());
  }, []);

  useEffect(() => {
    const todayDay = todayDate.getDate();
    if (!FAVORITE_RIDER_AUTO_REFRESH_DAYS.includes(todayDay as (typeof FAVORITE_RIDER_AUTO_REFRESH_DAYS)[number])) return;

    const mergedAutoMap = mergeFavoriteRiderMaps(buildAutoFavoriteRiderMap(favoriteRiderFeed), loadStoredFavoriteRiders());
    saveStoredFavoriteRiders(mergedAutoMap);
  }, []);

  const resolvedDailyMetricsMap = useMemo(() => customMetricsMap, [customMetricsMap]);
  const predictionAggregate = useMemo(() => getPredictionResultAggregate(predictionResultMap, selectedIso), [predictionResultMap, selectedIso]);
  const predictionDailySummaryMap = predictionAggregate.dailySummaryMap;
  const resolvedFavoriteRiderMap = useMemo(
    () => mergeFavoriteRiderMaps(buildAutoFavoriteRiderMap(favoriteRiderFeed), favoriteRiderMap),
    [favoriteRiderFeed, favoriteRiderMap]
  );

  const nextMonthDate = useMemo(() => new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1), [viewDate]);
  const primaryCalendarDays = useMemo(() => buildCalendarDays(viewDate, raceScheduleData), [viewDate]);
  const secondaryCalendarDays = useMemo(() => buildCalendarDays(nextMonthDate, raceScheduleData), [nextMonthDate]);
  const visibleCalendarDays = useMemo(() => [...primaryCalendarDays, ...secondaryCalendarDays], [primaryCalendarDays, secondaryCalendarDays]);

  const selectedDay =
    visibleCalendarDays.find((day) => day.iso === selectedIso) ??
    primaryCalendarDays.find((day) => day.isCurrentMonth) ??
    secondaryCalendarDays.find((day) => day.isCurrentMonth) ??
    primaryCalendarDays[0] ??
    secondaryCalendarDays[0];

  const selectedMetrics = selectedDay ? resolvedDailyMetricsMap[selectedDay.iso] : undefined;
  const selectedPredictionSummary = selectedDay ? predictionDailySummaryMap[selectedDay.iso] : undefined;
  const selectedCalendarMetrics = resolveCalendarMetricsDisplay(selectedPredictionSummary, selectedMetrics);
  const selectedVenuePredictionSummaryMap = predictionAggregate.venueSummaryMap ?? {};
  const selectedFavoriteRiders = selectedDay ? resolvedFavoriteRiderMap[selectedDay.iso] ?? [] : [];
  const selectedFavoriteRiderItems = selectedDay ? getFavoriteRiderDisplayItems(selectedDay.iso, selectedFavoriteRiders, favoriteRiderFeed) : [];
  const profitMetricTone = getMetricCardTone("profit", selectedCalendarMetrics.profitLoss);
  const defaultMetricTone = getMetricCardTone("default");

  const goPrevMonth = () => {
    const next = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1);
    setViewDate(next);
    setSelectedIso(toIsoDateString(next));
  };

  const goNextMonth = () => {
    const next = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1);
    setViewDate(next);
    setSelectedIso(toIsoDateString(next));
  };

  const renderCalendarMonth = (days: CalendarDay[], monthDate: Date) => (
    <section key={`${monthDate.getFullYear()}-${monthDate.getMonth()}`} style={{ display: "grid", gap: "14px" }}>
      <div style={{ display: "grid", gap: "8px" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", width: "fit-content", borderRadius: "9999px", padding: "6px 10px", background: "rgba(255,255,255,0.82)", border: "1px solid #ede5f6", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8)" }}>
          <span style={{ width: "6px", height: "6px", borderRadius: "9999px", background: "#7a67b8", display: "inline-block" }} />
          <span style={{ fontSize: hasFinderFilters ? "10px" : "11px", fontWeight: 800, color: "#64748b" }}>日付ごとに開催・収支・推しを整理</span>
        </div>
        <h3 style={{ margin: 0, fontSize: "28px", fontWeight: 900, color: "#081224" }}>{monthTitleJa(monthDate)}</h3>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "9px", marginBottom: "2px" }}>
        {["月", "火", "水", "木", "金", "土", "日"].map((label) => (
          <div key={`${monthDate.getMonth()}-${label}`} style={{ textAlign: "center", fontSize: "12px", fontWeight: 800, color: "#64748b", padding: "6px 4px" }}>
            {label}
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "9px" }}>
        {days.map((d) => {
          const isSelected = d.iso === selectedIso;
          const isToday = d.iso === TODAY;
          const hasEvent = d.events.length > 0;
          const hasGRace = d.events.some(
            (event) =>
              event.grade === "GP" ||
              event.grade === "GI" ||
              event.grade === "GII" ||
              event.grade === "GIII"
          );
          const metrics = resolvedDailyMetricsMap[d.iso];
          const predictionSummary = predictionDailySummaryMap[d.iso];
          const calendarMetrics = resolveCalendarMetricsDisplay(predictionSummary, metrics);
          const favoriteRiders = resolvedFavoriteRiderMap[d.iso] ?? [];
          const favoriteRiderItems = getFavoriteRiderDisplayItems(d.iso, favoriteRiders, favoriteRiderFeed);
          const hasMetrics = Boolean(metrics);
          const hasPredictionResults = Boolean(predictionSummary);
          const hasPredictionHit = (predictionSummary?.hitCount ?? 0) > 0;
          const profitMiniTone = getProfitMiniTone(calendarMetrics.profitLoss);
          const profitMiniLabel = formatProfitLossCompact(calendarMetrics.profitLoss);
          const topMarkers: Array<{ key: string; type: "dot" | "heart"; color: string; glow?: string }> = [];

          if (hasPredictionHit) {
            topMarkers.push({ key: "hit", type: "dot", color: "#14b8a6", glow: "0 0 0 3px rgba(20,184,166,0.16)" });
          }

          if (hasPredictionResults) {
            topMarkers.push({ key: "saved", type: "dot", color: "#7a67b8" });
          }

          if (hasGRace) {
            topMarkers.push({ key: "g-race", type: "dot", color: "#e77979", glow: "0 0 0 3px rgba(231,121,121,0.16)" });
          }

          if (favoriteRiderItems.length > 0 && topMarkers.length < 3) {
            topMarkers.push({ key: "favorite", type: "heart", color: "#e56b93" });
          }
          return (
            <button
              key={d.iso}
              type="button"
              onClick={() => {
                setSelectedIso(d.iso);
              }}
              style={{
                aspectRatio: "1 / 1",
                minHeight: "0",
                borderRadius: "22px",
                padding: "12px",
                border: isSelected
                  ? "1.5px solid #cdbff0"
                  : hasPredictionResults
                  ? "1.5px solid #d8cbf0"
                  : isToday
                  ? "1.5px solid #c6b8ea"
                  : "1px solid #ebe5f4",
                background: d.isCurrentMonth
                  ? isSelected
                    ? "linear-gradient(180deg, #f6f2fc 0%, #ffffff 100%)"
                    : hasPredictionResults
                    ? "linear-gradient(180deg, rgba(247,242,252,0.94) 0%, rgba(255,255,255,0.99) 100%)"
                    : isToday
                    ? "linear-gradient(180deg, rgba(242,236,251,0.96) 0%, rgba(255,255,255,0.98) 100%)"
                    : "rgba(255,255,255,0.96)"
                  : "#faf8fd",
                boxShadow: isSelected
                  ? "0 12px 28px rgba(122,103,184,0.10)"
                  : hasPredictionResults
                  ? "0 10px 22px rgba(122,103,184,0.07)"
                  : isToday
                  ? "0 10px 24px rgba(20, 184, 166, 0.10)"
                  : "0 8px 18px rgba(15, 23, 42, 0.03)",
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                opacity: d.isCurrentMonth ? 1 : 0.58,
                transition: "transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease",
                overflow: "hidden",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-2px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
                <span
                  style={{
                    fontSize: "15px",
                    fontWeight: 900,
                    color: getCalendarDayNumberColor(d.iso),
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  {d.day}
                  {isToday && (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: "9999px",
                        padding: "2px 5px",
                        fontSize: "8px",
                        lineHeight: 1,
                        fontWeight: 800,
                        color: "#8c63c7",
                        background: "rgba(242,236,251,0.96)",
                        border: "1px solid #ddd1f3",
                      }}
                    >
                      TODAY
                    </span>
                  )}
                </span>

                <div style={{ display: "flex", gap: "5px", minHeight: "10px" }}>
                  {topMarkers.map((marker) => marker.type === "heart" ? (
                    <span
                      key={marker.key}
                      style={{
                        fontSize: "10px",
                        lineHeight: 1,
                        color: marker.color,
                        display: "inline-block",
                        transform: "translateY(-1px)",
                      }}
                    >
                      ❤
                    </span>
                  ) : (
                    <span
                      key={marker.key}
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "9999px",
                        background: marker.color,
                        boxShadow: marker.glow,
                        display: "inline-block",
                      }}
                    />
                  ))}
                </div>
              </div>

              <div style={{ display: "grid", gap: "5px" }}>
                <div style={{ display: "grid", gap: "5px" }}>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    {hasEvent ? (
                      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "9999px", padding: "4px 8px", fontSize: "10px", fontWeight: 900, background: isToday ? "#f2ecfb" : "#f3effc", color: isToday ? "#7a67b8" : "#8b79c8", border: isToday ? "1px solid #e0d6f4" : "1px solid #e9e2f8" }}>
                        {d.events.length}開催
                      </span>
                    ) : (
                      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "9999px", padding: "4px 8px", fontSize: "10px", fontWeight: 700, background: "#faf8fd", color: "#94a3b8", border: "1px solid #eef2f7" }}>
                        開催なし
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ minHeight: "14px" }} />

                <div style={{ minHeight: "34px", display: "flex", alignItems: "flex-end" }}>
                  {hasPredictionResults ? (
                    <div style={{ display: "grid", gap: "4px", width: "100%" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: "9999px",
                          padding: "3px 7px",
                          fontSize: "9px",
                          fontWeight: 900,
                          letterSpacing: "0.01em",
                          color: profitMiniTone.text,
                          background: profitMiniTone.bg,
                          border: `1px solid ${profitMiniTone.border}`,
                          boxShadow: "0 4px 10px rgba(15, 23, 42, 0.03)",
                          width: "fit-content",
                        }}
                      >
                        {profitMiniLabel}
                      </span>
                      <span style={{ fontSize: "9px", fontWeight: 800, color: hasPredictionHit ? "#0f766e" : "#7a67b8" }}>
                        {predictionSummary?.settledRaceCount ? `${predictionSummary.hitCount}/${predictionSummary.settledRaceCount}` : `${predictionSummary?.savedRaceCount ?? 0}R`}
                      </span>
                    </div>
                  ) : favoriteRiderItems.length > 0 ? (
                    <div style={{ display: "grid", gap: "4px", width: "100%" }}>
                      {favoriteRiderItems.slice(0, 2).map((item) => (
                        <div
                          key={`${d.iso}-${item.rider}-${item.venue}`}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                            minWidth: 0,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          <span style={{ fontSize: "9px", lineHeight: 1, color: "#e56b93", flexShrink: 0 }}>❤</span>
                          <span
                            style={{
                              fontSize: "9px",
                              fontWeight: 800,
                              color: "#7c4f62",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {item.rider}
                          </span>
                          <span
                            style={{
                              fontSize: "8px",
                              fontWeight: 700,
                              color: "#9a7a88",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {item.venue}
                          </span>
                        </div>
                      ))}
                      {favoriteRiderItems.length > 2 && (
                        <span style={{ fontSize: "9px", fontWeight: 800, color: "#9a7a88" }}>
                          +{favoriteRiderItems.length - 2}
                        </span>
                      )}
                    </div>
                  ) : hasMetrics ? (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: "9999px",
                        padding: "3px 7px",
                        fontSize: "9px",
                        fontWeight: 900,
                        letterSpacing: "0.01em",
                        color: profitMiniTone.text,
                        background: profitMiniTone.bg,
                        border: `1px solid ${profitMiniTone.border}`,
                        boxShadow: "0 4px 10px rgba(15, 23, 42, 0.03)",
                      }}
                    >
                      {profitMiniLabel}
                    </span>
                  ) : (
                    <span
                      style={{
                        display: "inline-block",
                        width: "18px",
                        height: "6px",
                        borderRadius: "9999px",
                        background: "rgba(203,213,225,0.32)",
                      }}
                    />
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );

  const openMetricModal = (iso: string) => {
    const existing = resolvedDailyMetricsMap[iso];
    const existingFavoriteRiders = resolvedFavoriteRiderMap[iso] ?? [];
    setSelectedIso(iso);
    setMetricFormState(createMetricFormState(existing));
    setFavoriteRiderFormState(existingFavoriteRiders.filter((name): name is FavoriteRiderName => FAVORITE_RIDER_OPTIONS.includes(name as FavoriteRiderName)));
    setIsMetricModalOpen(true);
  };

  const closeMetricModal = () => {
    setIsMetricModalOpen(false);
  };

  const handleMetricInputChange =
    (field: keyof DailyMetricFormState) =>
    (event: { target: { value: string } }) => {
      const rawValue = event.target.value;
      const nextValue =
        field === "note" ? rawValue : sanitizeMetricInput(rawValue);

      setMetricFormState((current) => ({
        ...current,
        [field]: nextValue,
      }));
    };

  const handleFavoriteRiderToggle = (name: FavoriteRiderName) => {
    setFavoriteRiderFormState((current) =>
      current.includes(name) ? current.filter((item) => item !== name) : [...current, name]
    );
  };

  const handleMetricSave = () => {
    const nextItem: DailyMetricItem = {
      date: selectedIso,
      profitLoss: parseOptionalNumber(metricFormState.profitLoss),
      hitRate: parseOptionalNumber(metricFormState.hitRate),
      recoveryRate: parseOptionalNumber(metricFormState.recoveryRate),
      note: metricFormState.note.trim() || undefined,
    };

    const nextMetricsMap: DailyMetricsMap = {
      ...customMetricsMap,
    };

    if (isDailyMetricItemEmpty(nextItem)) {
      delete nextMetricsMap[selectedIso];
    } else {
      nextMetricsMap[selectedIso] = nextItem;
    }

    const nextFavoriteRiderMap: FavoriteRiderMap = {
      ...favoriteRiderMap,
    };

    if (isFavoriteRidersEmpty(favoriteRiderFormState)) {
      delete nextFavoriteRiderMap[selectedIso];
    } else {
      nextFavoriteRiderMap[selectedIso] = favoriteRiderFormState;
    }

    setCustomMetricsMap(nextMetricsMap);
    setFavoriteRiderMap(nextFavoriteRiderMap);
    saveStoredDailyMetrics(nextMetricsMap);
    saveStoredFavoriteRiders(nextFavoriteRiderMap);
    setIsMetricModalOpen(false);
  };

  const handleMetricReset = () => {
    const nextMetricsMap: DailyMetricsMap = {
      ...customMetricsMap,
    };
    const nextFavoriteRiderMap: FavoriteRiderMap = {
      ...favoriteRiderMap,
    };

    delete nextMetricsMap[selectedIso];
    delete nextFavoriteRiderMap[selectedIso];

    setCustomMetricsMap(nextMetricsMap);
    setFavoriteRiderMap(nextFavoriteRiderMap);
    saveStoredDailyMetrics(nextMetricsMap);
    saveStoredFavoriteRiders(nextFavoriteRiderMap);
    setMetricFormState(createMetricFormState());
    setFavoriteRiderFormState([]);
    setIsMetricModalOpen(false);
  };

  


  return (
    <section
      style={{
        maxWidth: PAGE_MAX_WIDTH,
        margin: "0 auto",
        padding: "22px 24px 146px",
      }}
    >
      <div style={{ marginBottom: "36px", position: "relative", paddingRight: "0", minHeight: "0" }}>
        <p style={{ margin: "0 0 10px 0", fontSize: hasFinderFilters ? "10px" : "11px", fontWeight: 900, letterSpacing: "0.24em", color: "#8c63c7" }}>
          RACE CALENDAR
        </p>

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "20px", marginBottom: "10px", flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: hasFinderFilters ? "8px" : "10px" }}>
            <h2 style={{ margin: 0, fontSize: "36px", lineHeight: 1.14, color: "#081224", letterSpacing: "-0.02em" }}>開催カレンダー</h2>
            <p style={{ margin: 0, maxWidth: "980px", color: "#5b6b7f", fontSize: "16px", lineHeight: 1.95 }}>
              CTC由来の開催データを日付単位で確認できるカレンダーです。
              日付を選ぶと、その日に開催されているレース一覧と成績メモを右側に表示します。
            </p>
          </div>

          <div style={{ display: "inline-flex", alignItems: "center", gap: "10px", borderRadius: "9999px", padding: "10px 14px", background: "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(250,247,253,0.98) 100%)", border: "1px solid #e9e1f2", boxShadow: "0 10px 24px rgba(15, 23, 42, 0.04)" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "9999px", background: "#7a67b8", display: "inline-block" }} />
            <span style={{ fontSize: hasFinderFilters ? "10px" : "11px", fontWeight: 800, letterSpacing: "0.12em", color: "#6f5aa9" }}>
              1日 / 15日 更新ベース
            </span>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(980px, 1.65fr) minmax(420px, 0.78fr)", gap: "30px", alignItems: "stretch" }}>
        <div
          style={{
            backgroundColor: "#ffffff",
            backgroundImage: `url("${toPublicPath("/calendar-accent-bg.png")}")`,
            backgroundSize: "cover",
            backgroundPosition: "center bottom",
            backgroundRepeat: "no-repeat",
            border: "1px solid #ebe3f3",
            borderRadius: "44px",
            padding: "34px",
            boxShadow: "0 18px 46px rgba(15, 23, 42, 0.06)",
            overflow: "hidden",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "22px", gap: "18px" }}>
            <div style={{ display: "grid", gap: "10px" }}>
              <div>
                <p style={{ margin: "0 0 6px 0", fontSize: "12px", fontWeight: 800, letterSpacing: "0.22em", color: "#8c63c7" }}>
                  MONTHLY VIEW
                </p>
                <h3 style={{ margin: 0, fontSize: "28px", fontWeight: 900, color: "#081224" }}>
                  {monthTitleJa(viewDate)} / {monthTitleJa(nextMonthDate)}
                </h3>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
              <div style={{ display: "flex", gap: "10px", paddingTop: "2px" }}>
                <button type="button" onClick={goPrevMonth} style={{ width: "44px", height: "44px", borderRadius: "9999px", border: "1px solid #e7e1ef", background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(249,247,252,0.98) 100%)", cursor: "pointer", fontWeight: 900, color: "#081224", boxShadow: "0 8px 18px rgba(15, 23, 42, 0.05)" }}>
                  ←
                </button>
                <button type="button" onClick={goNextMonth} style={{ width: "44px", height: "44px", borderRadius: "9999px", border: "1px solid #e7e1ef", background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(249,247,252,0.98) 100%)", cursor: "pointer", fontWeight: 900, color: "#081224", boxShadow: "0 8px 18px rgba(15, 23, 42, 0.05)" }}>
                  →
                </button>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: "18px", padding: "14px 16px", borderRadius: "24px", background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(250,248,253,0.98) 100%)", border: "1px solid #ebe3f3", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "#475569", fontWeight: 700 }}>
              <span style={{ width: "10px", height: "10px", borderRadius: "9999px", background: "#e77979", display: "inline-block" }} />
              Gレースあり
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "#475569", fontWeight: 700 }}>
              <span style={{ width: "10px", height: "10px", borderRadius: "9999px", background: "#7a67b8", display: "inline-block" }} />
              結果入力済み
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "#475569", fontWeight: 700 }}>
              <span style={{ width: "10px", height: "10px", borderRadius: "9999px", background: "#14b8a6", display: "inline-block" }} />
              的中あり
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "#475569", fontWeight: 700 }}>
              <span style={{ width: "10px", height: "10px", borderRadius: "9999px", background: "#22c55e", display: "inline-block" }} />
              収支プラス
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "#475569", fontWeight: 700 }}>
              <span style={{ fontSize: "13px", lineHeight: 1, color: "#e56b93" }}>❤</span>
              推し
            </div>
          </div>

          <div style={{ display: "grid", gap: "34px" }}>
            {renderCalendarMonth(primaryCalendarDays, viewDate)}
            {renderCalendarMonth(secondaryCalendarDays, nextMonthDate)}
          </div>
        </div>

        <aside style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.99) 0%, #faf7fd 58%, #ffffff 100%)", border: "1px solid #ebe3f3", borderRadius: "42px", padding: "32px", boxShadow: "0 26px 60px rgba(15, 23, 42, 0.072)", height: "100%", maxHeight: "none", overflowY: "auto", position: "relative", overflowX: "hidden" }}>
          <div style={{ position: "absolute", right: "-56px", top: "-56px", width: "170px", height: "170px", borderRadius: "50%", background: "radial-gradient(circle, rgba(122,103,184,0.08), rgba(15,118,110,0))", pointerEvents: "none" }} />
          <p style={{ margin: "0 0 10px 0", fontSize: "12px", fontWeight: 800, letterSpacing: "0.24em", color: "#8c63c7", position: "relative", zIndex: 1 }}>SELECTED DAY</p>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", borderRadius: "9999px", padding: hasFinderFilters ? "6px 10px" : "8px 12px", marginBottom: "16px", background: "rgba(255,255,255,0.82)", border: "1px solid #ebe3f3", boxShadow: "0 8px 18px rgba(15, 23, 42, 0.03)", position: "relative", zIndex: 1 }}>
            <span style={{ width: "6px", height: "6px", borderRadius: "9999px", background: "#7a67b8", display: "inline-block" }} />
            <span style={{ fontSize: hasFinderFilters ? "10px" : "11px", fontWeight: 800, color: "#64748b" }}>選択日の開催・収支・推し情報</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "20px", position: "relative", zIndex: 1 }}>
            <h3 style={{ margin: 0, fontSize: "30px", lineHeight: 1.2, color: "#081224", fontWeight: 900, letterSpacing: "-0.02em" }}>
              {selectedDay?.iso ?? "日付を選択してください"}
            </h3>

            <button
              type="button"
              onClick={() => openMetricModal(selectedDay?.iso ?? TODAY)}
              style={{
                border: "1px solid #e7e1ef",
                background: "linear-gradient(180deg, #fffefe 0%, #fff6fb 48%, #f6fbff 100%)",
                color: "#081224",
                borderRadius: "9999px",
                padding: "10px 16px",
                fontSize: "12px",
                fontWeight: 900,
                cursor: "pointer",
                boxShadow: "0 8px 18px rgba(15, 23, 42, 0.05)",
                whiteSpace: "nowrap",
              }}
            >
              収支を入力
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: "10px",
              marginBottom: "18px",
            }}
          >
            <div style={{ borderRadius: "22px", background: selectedPredictionSummary ? "linear-gradient(180deg, rgba(248,244,252,0.96) 0%, rgba(255,255,255,0.98) 100%)" : defaultMetricTone.bg, border: `1px solid ${selectedPredictionSummary ? "#e3d8f4" : defaultMetricTone.border}`, padding: "15px 13px", boxShadow: selectedPredictionSummary ? "0 10px 22px rgba(122,103,184,0.06)" : defaultMetricTone.glow }}>
              <div style={{ fontSize: "10px", fontWeight: 800, letterSpacing: "0.16em", color: defaultMetricTone.label, marginBottom: "8px" }}>開催数</div>
              <div style={{ fontSize: "23px", fontWeight: 900, color: defaultMetricTone.value, lineHeight: 1.05 }}>{selectedPredictionSummary ? selectedCalendarMetrics.raceCount ?? 0 : selectedDay?.events.length ?? 0}</div>
            </div>

            <div
              style={{
                borderRadius: "22px",
                background: profitMetricTone.bg,
                border: `1px solid ${profitMetricTone.border}`,
                padding: "15px 13px",
                boxShadow: profitMetricTone.glow,
              }}
            >
              <div style={{ fontSize: "10px", fontWeight: 800, letterSpacing: "0.16em", color: profitMetricTone.label, marginBottom: "8px" }}>収支</div>
              <div style={{ fontSize: "21px", fontWeight: 900, color: profitMetricTone.value, lineHeight: 1.05 }}>
                {selectedCalendarMetrics.profitLoss !== undefined
                  ? `${selectedCalendarMetrics.profitLoss > 0 ? "+" : ""}${selectedCalendarMetrics.profitLoss.toLocaleString()}`
                  : "—"}
              </div>
            </div>

            <div style={{ borderRadius: "22px", background: selectedPredictionSummary ? "linear-gradient(180deg, rgba(240,251,249,0.96) 0%, rgba(255,255,255,0.98) 100%)" : defaultMetricTone.bg, border: `1px solid ${selectedPredictionSummary ? "#cdece6" : defaultMetricTone.border}`, padding: "15px 13px", boxShadow: selectedPredictionSummary ? "0 10px 22px rgba(20,184,166,0.05)" : defaultMetricTone.glow }}>
              <div style={{ fontSize: "10px", fontWeight: 800, letterSpacing: "0.16em", color: selectedPredictionSummary ? "#0f766e" : defaultMetricTone.label, marginBottom: "8px" }}>的中率</div>
              <div style={{ fontSize: "21px", fontWeight: 900, color: selectedPredictionSummary ? "#0f766e" : defaultMetricTone.value, lineHeight: 1.05 }}>
                {selectedCalendarMetrics.hitRate !== undefined ? `${selectedCalendarMetrics.hitRate.toFixed(1)}%` : "—"}
              </div>
            </div>

            <div style={{ borderRadius: "22px", background: selectedPredictionSummary ? "linear-gradient(180deg, rgba(246,250,255,0.96) 0%, rgba(255,255,255,0.98) 100%)" : defaultMetricTone.bg, border: `1px solid ${selectedPredictionSummary ? "#dce7fb" : defaultMetricTone.border}`, padding: "15px 13px", boxShadow: selectedPredictionSummary ? "0 10px 22px rgba(79,106,168,0.05)" : defaultMetricTone.glow }}>
              <div style={{ fontSize: "10px", fontWeight: 800, letterSpacing: "0.16em", color: selectedPredictionSummary ? "#4f6aa8" : defaultMetricTone.label, marginBottom: "8px" }}>回収率</div>
              <div style={{ fontSize: "21px", fontWeight: 900, color: selectedPredictionSummary ? "#334155" : defaultMetricTone.value, lineHeight: 1.05 }}>
                {selectedCalendarMetrics.recoveryRate !== undefined ? `${selectedCalendarMetrics.recoveryRate.toFixed(1)}%` : "—"}
              </div>
            </div>
          </div>

          <div style={{ borderRadius: "22px", background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, #fbfdfe 100%)", border: "1px solid #ebe3f3", padding: "16px 18px", color: "#475569", fontSize: "12px", lineHeight: 1.9, marginBottom: "16px", boxShadow: "0 10px 22px rgba(15, 23, 42, 0.04)" }}>
            <div style={{ fontSize: hasFinderFilters ? "10px" : "11px", fontWeight: 800, letterSpacing: "0.16em", color: "#64748b", marginBottom: "8px" }}>DAY NOTE</div>
            <div style={{ marginBottom: selectedFavoriteRiders.length > 0 ? "10px" : 0 }}><strong style={{ color: "#081224" }}>メモ：</strong> {selectedMetrics?.note ?? "ここにその日の振り返りメモを入れられるようにする想定です。"}</div>
            {selectedPredictionSummary && (
              <div style={{ marginBottom: selectedFavoriteRiderItems.length > 0 ? "10px" : 0 }}><strong style={{ color: "#081224" }}>結果：</strong> {selectedPredictionSummary.savedRaceCount}レース保存 / 的中 {selectedPredictionSummary.hitCount} / 不的中 {selectedPredictionSummary.missCount}</div>
            )}
            {selectedFavoriteRiderItems.length > 0 && (
              <div style={{ display: "flex", gap: hasFinderFilters ? "6px" : "8px", flexWrap: "wrap" }}>
                {selectedFavoriteRiderItems.map((item) => (
                  <span
                    key={`selected-favorite-${item.rider}-${item.venue}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                      borderRadius: "9999px",
                      padding: "4px 10px",
                      fontSize: hasFinderFilters ? "10px" : "11px",
                      fontWeight: 800,
                      color: "#7c4f62",
                      background: "#fff1f5",
                      border: "1px solid #f5c6d4",
                    }}
                  >
                    <span style={{ color: "#e56b93" }}>❤</span>
                    <span>{item.rider}</span>
                    <span style={{ fontSize: "10px", color: "#9a7a88" }}>{item.venue}</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div
            style={{
              borderRadius: "24px",
              background: "linear-gradient(135deg, rgba(244,239,252,0.82) 0%, rgba(251,249,254,1) 100%)",
              border: "1px solid #e7dff3",
              padding: "17px 18px",
              color: "#64748b",
              fontSize: "13px",
              lineHeight: 1.9,
              marginBottom: "18px",
              boxShadow: "0 10px 22px rgba(122, 103, 184, 0.05)",
            }}
          >
            <div style={{ fontSize: hasFinderFilters ? "10px" : "11px", fontWeight: 800, letterSpacing: "0.16em", color: "#8c63c7", marginBottom: "8px" }}>OPERATION NOTE</div>
            <strong style={{ color: "#081224" }}>運用メモ：</strong>
            PredictionPage の結果保存がある日は、その集計を優先表示します。
            PredictionPage 側の保存がない日だけ、既存の手入力メトリクスをそのまま使います。
          </div>

          {selectedDay && selectedDay.events.length > 0 ? (
            <div style={{ display: "grid", gap: "14px" }}>
              {selectedDay.events.map((event) => {
                const venueSummary = selectedVenuePredictionSummaryMap[normalizePredictionVenueName(event.venue)];
                const hasVenueResult = Boolean(venueSummary);
                const venueProfitTone = getProfitMiniTone(venueSummary?.profitLoss);

                return (
                <article key={`${selectedDay.iso}-${event.id}`} style={{ borderRadius: "28px", background: hasVenueResult ? "linear-gradient(180deg, #ffffff 0%, #faf7fd 100%)" : "linear-gradient(180deg, #ffffff 0%, #fbfdfe 100%)", border: hasVenueResult ? "1px solid #e3d8f4" : "1px solid #ebe3f3", padding: "17px", boxShadow: hasVenueResult ? "0 12px 26px rgba(122, 103, 184, 0.05)" : "0 12px 26px rgba(15, 23, 42, 0.04)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", marginBottom: "12px" }}>
                    <div style={{ display: "grid", gap: "6px" }}>
                      <div style={{ fontSize: "18px", fontWeight: 900, color: "#081224", letterSpacing: "-0.01em" }}>{event.venue}</div>
                      {hasVenueResult ? <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "fit-content", borderRadius: "9999px", padding: "3px 8px", fontSize: "9px", fontWeight: 900, letterSpacing: "0.08em", background: "#f2ecfb", color: "#7a67b8", border: "1px solid #e0d6f4" }}>{venueSummary?.savedRaceCount}R保存済み</span> : null}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      {hasVenueResult ? <span style={{ width: "8px", height: "8px", borderRadius: "9999px", background: "#7a67b8", display: "inline-block" }} /> : null}
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: "9999px",
                          padding: "4px 8px",
                          fontSize: "10px",
                          fontWeight: 800,
                          background: getGradeBadgeTone(event.grade).background,
                          color: getGradeBadgeTone(event.grade).text,
                          border: `1px solid ${getGradeBadgeTone(event.grade).border}`,
                          boxShadow: getGradeBadgeTone(event.grade).shadow,
                        }}
                      >
                        {event.grade}
                      </span>
                    </div>
                  </div>

                  <div style={{ color: "#334155", fontSize: hasFinderFilters ? "13px" : "14px", fontWeight: 700, lineHeight: 1.8, marginBottom: "10px" }}>
                    {event.title}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
                    <div style={{ borderRadius: "16px", padding: hasFinderFilters ? "8px 10px" : "10px 12px", background: "#faf8fd", border: "1px solid #ede7f5" }}>
                      <div style={{ fontSize: "10px", fontWeight: 800, letterSpacing: "0.16em", color: "#64748b", marginBottom: "4px" }}>時間帯</div>
                      <div style={{ fontSize: "12px", fontWeight: 700, color: "#081224" }}>{getSessionLabel(event.session)}</div>
                    </div>

                    <div style={{ borderRadius: "16px", padding: hasFinderFilters ? "8px 10px" : "10px 12px", background: "#faf8fd", border: "1px solid #ede7f5" }}>
                      <div style={{ fontSize: "10px", fontWeight: 800, letterSpacing: "0.16em", color: "#64748b", marginBottom: "4px" }}>シリーズ</div>
                      <div style={{ fontSize: "12px", fontWeight: 700, color: "#081224" }}>{event.hasGirls ? "ガールズあり" : "通常開催"}</div>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px", marginBottom: "10px" }}>
                    {[
                      { label: "投資", value: hasVenueResult ? formatPredictionResultYen(venueSummary?.investment) : "—", color: "#081224" },
                      { label: "収支", value: hasVenueResult ? formatPredictionResultProfitLoss(venueSummary?.profitLoss) : "—", color: hasVenueResult ? venueProfitTone.text : "#94a3b8" },
                      { label: "的中率", value: hasVenueResult ? formatPredictionResultRoi(venueSummary?.hitRate) : "—", color: hasVenueResult && (venueSummary?.hitRate ?? 0) > 0 ? "#0f766e" : "#081224" },
                      { label: "回収率", value: hasVenueResult ? formatPredictionResultRoi(venueSummary?.roi) : "—", color: hasVenueResult && (venueSummary?.roi ?? 0) >= 100 ? "#4f46e5" : "#081224" },
                    ].map((item) => (
                      <div key={`${event.id}-${item.label}`} style={{ borderRadius: "14px", padding: "9px 10px", background: hasVenueResult ? "rgba(255,255,255,0.86)" : "#faf8fd", border: hasVenueResult ? "1px solid #ece4f6" : "1px solid #ede7f5" }}>
                        <div style={{ fontSize: "9px", fontWeight: 800, letterSpacing: "0.14em", color: "#64748b", marginBottom: "4px" }}>{item.label}</div>
                        <div style={{ fontSize: "12px", fontWeight: 800, color: item.color }}>{item.value}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ color: "#475569", fontSize: "13px", lineHeight: 1.8 }}>
                    {event.note ?? formatDateRange(event.startDate, event.endDate)}
                  </div>
                </article>
              );})}
            </div>
          ) : (
            <div style={{ borderRadius: "28px", padding: "18px 18px", background: "rgba(255,255,255,0.88)", border: "1px solid #ece7f5", color: "#475569", fontSize: "14px", lineHeight: 1.9 }}>
              この日は開催予定がありません。
            </div>
          )}
        </aside>
      </div>
      {isMetricModalOpen && (
        <div
          onClick={closeMetricModal}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(8, 18, 36, 0.34)",
            backdropFilter: "blur(8px)",
            zIndex: 60,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "30px",
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "560px",
              borderRadius: "42px",
              background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, #fbf9fe 100%)",
              border: "1px solid #e3ecf2",
              boxShadow: "0 28px 80px rgba(15, 23, 42, 0.18)",
              padding: "30px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", marginBottom: "20px" }}>
              <div>
                <p style={{ margin: "0 0 8px 0", fontSize: hasFinderFilters ? "10px" : "11px", fontWeight: 800, letterSpacing: "0.2em", color: "#8c63c7" }}>
                  DAILY METRICS
                </p>
                <h3 style={{ margin: 0, fontSize: "28px", lineHeight: 1.2, color: "#081224" }}>
                  {selectedIso}
                </h3>
              </div>

              <button
                type="button"
                onClick={closeMetricModal}
                style={{
                  width: "38px",
                  height: "38px",
                  borderRadius: "9999px",
                  border: "1px solid #e4dcf0",
                  background: "linear-gradient(180deg, #fffefe 0%, #fff6fb 48%, #f6fbff 100%)",
                  color: "#081224",
                  fontSize: "18px",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                {"\u00d7"}
              </button>
            </div>

            <div style={{ display: "grid", gap: "14px" }}>
              <div
  style={{
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
    gap: isMobile ? "10px" : "12px",
    alignItems: "start",
  }}
>
                <label style={{ display: "grid", gap: "8px", minWidth: 0 }}>
                  <span style={{ fontSize: hasFinderFilters ? "10px" : "11px", fontWeight: 800, letterSpacing: "0.14em", color: "#64748b" }}>収支</span>
                  <input
                    value={metricFormState.profitLoss}
                    onChange={handleMetricInputChange("profitLoss")}
                    placeholder="2600"
                    style={{
                      width: "100%",
                      minWidth: 0,
                      height: hasFinderFilters ? "40px" : "46px",
                      borderRadius: "14px",
                      border: "1px solid #e4dcf0",
                      background: "linear-gradient(180deg, #fffefe 0%, #fff6fb 48%, #f6fbff 100%)",
                      padding: "0 14px",
                      fontSize: "14px",
                      color: "#081224",
                      outline: "none",
                    }}
                  />
                </label>

                <label style={{ display: "grid", gap: "8px", minWidth: 0 }}>
                  <span style={{ fontSize: hasFinderFilters ? "10px" : "11px", fontWeight: 800, letterSpacing: "0.14em", color: "#64748b" }}>的中率</span>
                  <input
                    value={metricFormState.hitRate}
                    onChange={handleMetricInputChange("hitRate")}
                    placeholder="33"
                    style={{
                      width: "100%",
                      minWidth: 0,
                      height: hasFinderFilters ? "40px" : "46px",
                      borderRadius: "14px",
                      border: "1px solid #e4dcf0",
                      background: "linear-gradient(180deg, #fffefe 0%, #fff6fb 48%, #f6fbff 100%)",
                      padding: "0 14px",
                      fontSize: "14px",
                      color: "#081224",
                      outline: "none",
                    }}
                  />
                </label>

                <label style={{ display: "grid", gap: "8px", minWidth: 0 }}>
                  <span style={{ fontSize: "11px", fontWeight: 800, letterSpacing: "0.14em", color: "#64748b" }}>回収率</span>
                  <input
                    value={metricFormState.recoveryRate}
                    onChange={handleMetricInputChange("recoveryRate")}
                    placeholder="112"
                    style={{
                      width: "100%",
                      minWidth: 0,
                      height: hasFinderFilters ? "40px" : "46px",
                      borderRadius: "14px",
                      border: "1px solid #e4dcf0",
                      background: "linear-gradient(180deg, #fffefe 0%, #fff6fb 48%, #f6fbff 100%)",
                      padding: "0 14px",
                      fontSize: "14px",
                      color: "#081224",
                      outline: "none",
                    }}
                  />
                </label>
              </div>

              <label style={{ display: "grid", gap: "8px" }}>
                <span style={{ fontSize: "11px", fontWeight: 800, letterSpacing: "0.14em", color: "#64748b" }}>メモ</span>
                <textarea
                  value={metricFormState.note}
                  onChange={handleMetricInputChange("note")}
                  placeholder="その日の振り返りをメモ"
                  rows={5}
                  style={{
                    borderRadius: "16px",
                    border: "1px solid #e4dcf0",
                    background: "linear-gradient(180deg, #fffefe 0%, #fff6fb 48%, #f6fbff 100%)",
                    padding: "14px",
                    fontSize: "14px",
                    color: "#081224",
                    outline: "none",
                    resize: "vertical",
                    fontFamily: "inherit",
                    lineHeight: 1.8,
                  }}
                />
              </label>

              <div style={{ borderRadius: "22px", border: "1px solid #ebe3f3", background: "linear-gradient(180deg, #fffefe 0%, #f8f0ff 56%, #f3f9ff 100%)", padding: "16px 16px 14px" }}>
                <div style={{ fontSize: "11px", fontWeight: 800, letterSpacing: "0.14em", color: "#64748b", marginBottom: "10px" }}>推し選手</div>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  {FAVORITE_RIDER_OPTIONS.map((name) => {
                    const isActive = favoriteRiderFormState.includes(name);

                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => handleFavoriteRiderToggle(name)}
                        style={{
                          borderRadius: "9999px",
                          border: isActive ? "1px solid #f4d8b8" : "1px solid #e4dcf0",
                          background: isActive ? "#fff7ec" : "#ffffff",
                          color: isActive ? "#8b5a2b" : "#526072",
                          padding: "10px 16px",
                          fontSize: "13px",
                          fontWeight: 800,
                          cursor: "pointer",
                          boxShadow: isActive ? "0 8px 16px rgba(180, 83, 9, 0.08)" : "none",
                        }}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
                <div style={{ marginTop: "10px", fontSize: "11px", color: "#64748b", lineHeight: 1.7 }}>
                  推しは毎月1日・15日の更新タイミングで自動反映しつつ、手動での追加調整もできます。
                </div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "22px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={handleMetricReset}
                style={{
                  border: "1px solid #f2d4da",
                  background: "#fff7f8",
                  color: "#c35b68",
                  borderRadius: "9999px",
                  padding: "12px 18px",
                  fontSize: "13px",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                入力をリセット
              </button>

              <button
                type="button"
                onClick={closeMetricModal}
                style={{
                  border: "1px solid #e4dcf0",
                  background: "linear-gradient(180deg, #fffefe 0%, #fff6fb 48%, #f6fbff 100%)",
                  color: "#081224",
                  borderRadius: "9999px",
                  padding: "12px 18px",
                  fontSize: "13px",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                キャンセル
              </button>

              <button
                type="button"
                onClick={handleMetricSave}
                style={{
                  border: "none",
                  background: "#081224",
                  color: "#ffffff",
                  borderRadius: "9999px",
                  padding: "12px 18px",
                  fontSize: "13px",
                  fontWeight: 800,
                  cursor: "pointer",
                  boxShadow: "0 14px 28px rgba(8, 18, 36, 0.14)",
                }}
              >
                保存する
              </button>
            </div>
          </div>
        </div>
      )}
      </section>
  );
}



export function DashboardPage() {
  const [favoriteRiderFeed, setFavoriteRiderFeed] = useState<FavoriteRiderFeedItem[]>(() => loadCachedFavoriteRiderFeed()?.feed ?? EMPTY_FAVORITE_RIDER_FEED);
  const [todayPredictionFeed, setTodayPredictionFeed] = useState<PredictionTodayFeed | null>(null);
  const [todayWeatherByVenue, setTodayWeatherByVenue] = useState<Record<string, PredictionWeatherData | null>>({});
  const [dashboardPredictionBankIndex, setDashboardPredictionBankIndex] = useState<PredictionVenueBankIndexItem[]>([]);
  const [dashboardVenueSummaryMap, setDashboardVenueSummaryMap] = useState<Record<string, PredictionVenueSummary>>({});
  const [predictionResultMap, setPredictionResultMap] = useState<PredictionResultMap>(() => loadStoredPredictionResults());
  const dashboardNow = useDashboardNow();
  const isMobile = useIsMobile();

  useEffect(() => {
    let isActive = true;

    const applyLatestFeed = async () => {
      const result = await fetchFavoriteRiderFeedFile();
      if (!isActive) return;

      if (!result) {
        setFavoriteRiderFeed(EMPTY_FAVORITE_RIDER_FEED);
        return;
      }

      setFavoriteRiderFeed(result.feed);
    };

    applyLatestFeed();

    const intervalId = window.setInterval(applyLatestFeed, FAVORITE_RIDER_FEED_POLL_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        applyLatestFeed();
      }
    };
    const handleFocus = () => {
      applyLatestFeed();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (!event.key || event.key === PREDICTION_RESULT_STORAGE_KEY) {
        setPredictionResultMap(loadStoredPredictionResults());
      }
    };

    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const todayPredictionVenueMap = useMemo(
    () => new Map((todayPredictionFeed?.venues ?? []).map((venue) => [normalizePredictionVenueName(venue.venue), venue])),
    [todayPredictionFeed]
  );
  const dashboardTodayRaces = useMemo(
    () => mergeTodayRaceCardItems(todayRaces, todayPredictionFeed?.venues ?? []),
    [todayPredictionFeed]
  );
  const dashboardPredictionAggregate = useMemo(() => getPredictionResultAggregate(predictionResultMap, TODAY), [predictionResultMap]);
  const todayVenuePredictionSummaryMap = dashboardPredictionAggregate.venueSummaryMap ?? {};
  const activeVenueNames = useMemo(
    () => Array.from(new Set(dashboardTodayRaces.map((race) => race.venue).filter(Boolean))),
    [dashboardTodayRaces]
  );
  const activeVenueKeys = useMemo(
    () => activeVenueNames.map((venue) => normalizePredictionVenueName(venue)),
    [activeVenueNames]
  );

  useEffect(() => {
    let isActive = true;

    const loadTodayPredictionFeed = async () => {
      try {
        const [feedResponse, bankIndexResponse] = await Promise.all([
          fetch(`${PREDICTION_TODAY_DATA_URL}?t=${Date.now()}`, { cache: "no-store" }),
          fetch(PREDICTION_VENUE_BANK_INDEX_URL, { cache: "force-cache" }),
        ]);
        if (!feedResponse.ok) throw new Error(`dashboard-prediction-feed-${feedResponse.status}`);
        const feed = await feedResponse.json() as PredictionTodayFeed;
        const bankIndex = bankIndexResponse.ok
          ? await bankIndexResponse.json() as PredictionVenueBankIndexItem[]
          : [];
        if (!isActive) return;
        setTodayPredictionFeed(feed);
        setDashboardPredictionBankIndex(bankIndex);
      } catch {
        if (!isActive) return;
        setTodayPredictionFeed(null);
        setDashboardPredictionBankIndex([]);
      }
    };

    loadTodayPredictionFeed();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    const unresolved = activeVenueNames.filter((venue) => !(venue in todayWeatherByVenue));
    if (unresolved.length === 0) return;

    let isActive = true;

    Promise.all(unresolved.map(async (venue) => {
      try {
        const weather = await fetchPredictionVenueWeather(venue);
        return { venue, weather };
      } catch {
        return { venue, weather: null };
      }
    })).then((results) => {
      if (!isActive) return;
      setTodayWeatherByVenue((current) => {
        const next = { ...current };
        results.forEach(({ venue, weather }) => {
          next[venue] = weather;
        });
        return next;
      });
    });

    return () => {
      isActive = false;
    };
  }, [activeVenueNames, todayWeatherByVenue]);

  useEffect(() => {
    setTodayWeatherByVenue((current) => {
      const validVenueSet = new Set(activeVenueNames);
      const next = Object.fromEntries(Object.entries(current).filter(([venue]) => validVenueSet.has(venue)));
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [activeVenueNames]);

  useEffect(() => {
    setDashboardVenueSummaryMap((current) => {
      const validVenueKeySet = new Set(activeVenueKeys);
      const next = Object.fromEntries(Object.entries(current).filter(([venueKey]) => validVenueKeySet.has(venueKey)));
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [activeVenueKeys]);

  useEffect(() => {
    if (dashboardPredictionBankIndex.length === 0 || activeVenueNames.length === 0) return;

    const missingVenueKeys = activeVenueKeys.filter((venueKey) => {
      const race = dashboardTodayRaces.find((item) => normalizePredictionVenueName(item.venue) === venueKey);
      const predictionVenue = todayPredictionVenueMap.get(venueKey) ?? null;
      return !findPredictionVenueBankTarget(dashboardPredictionBankIndex, predictionVenue ?? race);
    });

    if (missingVenueKeys.length === 0) return;

    const warningKey = `${TODAY}:${missingVenueKeys.join(",")}`;
    if (missingVenueWarningKeys.has(warningKey)) return;
    missingVenueWarningKeys.add(warningKey);
    console.warn("[dashboard] bank index missing venues", {
      date: TODAY,
      venues: missingVenueKeys,
    });
  }, [activeVenueKeys, activeVenueNames.length, dashboardPredictionBankIndex, dashboardTodayRaces, todayPredictionVenueMap]);

  const featuredScheduleFavoriteRaceMap = useMemo(
    () => new Map(featuredScheduleRaces.map((race) => [race.id, getFavoriteDisplayItemsForScheduleRace(race, favoriteRiderFeed)])),
    [favoriteRiderFeed]
  );
  const todayFavoriteRaceMap = useMemo(
    () => new Map(dashboardTodayRaces.map((race) => [race.id, getFavoriteDisplayItemsForRace(race, TODAY, favoriteRiderFeed)])),
    [dashboardTodayRaces, favoriteRiderFeed]
  );
  const featuredTodayRace = useMemo(
    () => pickFeaturedTodayRace(dashboardTodayRaces, TODAY, favoriteRiderFeed),
    [dashboardTodayRaces, favoriteRiderFeed]
  );
  const featuredTodayRaceFavorites = useMemo(
    () => (featuredTodayRace ? getFavoriteDisplayItemsForRace(featuredTodayRace, TODAY, favoriteRiderFeed) : []),
    [featuredTodayRace, favoriteRiderFeed]
  );
  const featuredPredictionVenue = useMemo(
    () => (featuredTodayRace ? todayPredictionVenueMap.get(normalizePredictionVenueName(featuredTodayRace.venue)) ?? null : null),
    [featuredTodayRace, todayPredictionVenueMap]
  );
  const featuredPredictionRace = useMemo(
    () => (featuredPredictionVenue ? getFeaturedPredictionRaceTarget(featuredPredictionVenue, dashboardNow) : null),
    [dashboardNow, featuredPredictionVenue]
  );
  const featuredSupplementRiders = useMemo(
    () => getFeaturedSupplementRiders(featuredPredictionRace, featuredTodayRaceFavorites),
    [featuredPredictionRace, featuredTodayRaceFavorites]
  );
  const featuredPredictionTarget = useMemo(
    () => buildFeaturedPredictionNavigationTarget(featuredTodayRace, featuredPredictionVenue, dashboardNow),
    [dashboardNow, featuredPredictionVenue, featuredTodayRace]
  );
  const featuredVenueSummary = useMemo(
    () => (featuredTodayRace ? dashboardVenueSummaryMap[normalizePredictionVenueName(featuredTodayRace.venue)] ?? null : null),
    [dashboardVenueSummaryMap, featuredTodayRace]
  );
  const featuredRaceData = useMemo(
    () => buildFeaturedRaceData({
      race: featuredTodayRace,
      predictionVenue: featuredPredictionVenue,
      predictionRace: featuredPredictionRace,
      venueSummary: featuredVenueSummary,
      weather: featuredTodayRace && featuredTodayRace.venue in todayWeatherByVenue ? todayWeatherByVenue[featuredTodayRace.venue] : undefined,
      favorites: featuredTodayRaceFavorites,
      navigationTarget: featuredPredictionTarget,
    }),
    [featuredPredictionRace, featuredPredictionTarget, featuredPredictionVenue, featuredTodayRace, featuredTodayRaceFavorites, featuredVenueSummary, todayWeatherByVenue]
  );

  useEffect(() => {
    if (dashboardPredictionBankIndex.length === 0 || dashboardTodayRaces.length === 0) return;

    const unresolvedVenues = dashboardTodayRaces.filter((race) => {
      const summaryKey = normalizePredictionVenueName(race.venue);
      return !dashboardVenueSummaryMap[summaryKey];
    });

    if (unresolvedVenues.length === 0) return;

    let isActive = true;

    const loadDashboardVenueSummaries = async () => {
      const loadedEntries = await Promise.all(unresolvedVenues.map(async (race) => {
        const summaryKey = normalizePredictionVenueName(race.venue);
        const predictionVenue = todayPredictionVenueMap.get(summaryKey) ?? null;
        const target = findPredictionVenueBankTarget(dashboardPredictionBankIndex, predictionVenue ?? race);
        if (!target) {
          return [summaryKey, MISSING_PREDICTION_VENUE_SUMMARY] as const;
        }

        try {
          const response = await fetch(toPublicPath(target.file), { cache: "force-cache" });
          if (!response.ok) throw new Error(`dashboard-bank-${response.status}`);
          const markdown = await response.text();
          return [summaryKey, parsePredictionVenueSummary(markdown)] as const;
        } catch {
          return [summaryKey, MISSING_PREDICTION_VENUE_SUMMARY] as const;
        }
      }));

      if (!isActive) return;

      setDashboardVenueSummaryMap((current) => {
        const next = { ...current };
        loadedEntries.forEach(([summaryKey, summary]) => {
          next[summaryKey] = summary;
        });
        return next;
      });
    };

    loadDashboardVenueSummaries();

    return () => {
      isActive = false;
    };
  }, [dashboardPredictionBankIndex, dashboardTodayRaces, dashboardVenueSummaryMap, todayPredictionVenueMap]);


  const overviewStats = [
    { label: "本日開催", value: `${todayRaces.length}開催`, sub: "当日開催中のシリーズ数" },
    { label: "直近注目", value: `${featuredScheduleRaces.length}件`, sub: "1か月以内のG・F1対象" },
    {
      label: "本日の主役",
      value: featuredTodayRace ? featuredTodayRace.venue : "—",
      sub: featuredTodayRace ? `${featuredTodayRace.grade} / ${getSessionLabel(featuredTodayRace.session)}` : "開催データ待機中",
    },
  ];

  const navigateDashboardHashTop = (href: string) => {
    window.location.hash = href;
    if (href === "#races-page" || href === "#players-page" || href === "#prediction-page" || href === "#review-page" || href === "#venue-features-page") {
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: "auto" });
      });
    }
  };

    return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #f8fcff 0%, #fff8fd 48%, #f6fbff 100%)",
        color: "#111827",
        position: "relative",
        isolation: "isolate",
        overflowX: "hidden",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `url("${toPublicPath("/dashboard-page/dashboard-bottom-bg-keirin-soft-light.png")}")`,
            backgroundRepeat: "no-repeat",
            backgroundSize: "cover",
            backgroundPosition: isMobile ? "center top" : "center top",
            opacity: 0.9,
            transform: "scale(1.02)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.52) 0%, rgba(255,255,255,0.38) 42%, rgba(255,255,255,0.58) 100%)",
          }}
        />
      </div>

      <SiteHeader activeKey="dashboard" />

      <main style={{ scrollBehavior: "smooth", position: "relative", zIndex: 1 }}>
        <section
  style={{
    maxWidth: PAGE_MAX_WIDTH,
    margin: "0 auto",
    padding: isMobile ? "32px 14px 8px" : "88px 24px 12px",
  }}
>
<div
  style={{
    borderRadius: isMobile ? "28px" : "40px",
    border: "1px solid #eee8f6",
    background: "linear-gradient(180deg, #fffefe 0%, #faf1ff 40%, #edf8ff 78%, #fff5fb 100%)",
    boxShadow: "0 18px 44px rgba(15, 23, 42, 0.045)",
    padding: isMobile ? "26px 20px 24px" : "38px 34px 34px",
  }}
>
<div
  style={{
    marginBottom: isMobile ? "22px" : "32px",
    display: "flex",
    flexDirection: isMobile ? "column" : "row",
    alignItems: isMobile ? "flex-start" : "flex-end",
    justifyContent: "space-between",
    gap: isMobile ? "14px" : "24px",
  }}
>
<div>
                <p style={{ margin: "0 0 12px 0", fontSize: "12px", fontWeight: 800, letterSpacing: "0.28em", color: "#8c63c7" }}>RACE SCHEDULE</p>
                <h2
  style={{
    margin: 0,
    fontSize: isMobile ? "30px" : "36px",
    lineHeight: isMobile ? 1.22 : 1.14,
    color: "#081224",
    letterSpacing: isMobile ? "-0.01em" : "-0.02em",
    wordBreak: "keep-all",
    overflowWrap: "normal",
  }}
>
  直近の開催スケジュール
</h2>
<p
  style={{
    margin: "14px 0 0 0",
    maxWidth: isMobile ? "100%" : "760px",
    fontSize: isMobile ? "13px" : "15px",
    lineHeight: isMobile ? 1.8 : 1.95,
    color: "#5b6b7f",
  }}
>
                  グレード開催と注目日程を先に確認できる、上品で見やすいスケジュール一覧です。推しがいる開催もここでひと目で追えます。
                </p>
              </div>
              <div style={{ padding: "12px 16px", borderRadius: "20px", background: "linear-gradient(180deg, #ffffff 0%, #f9f6fd 100%)", border: "1px solid #ece4f6", minWidth: "230px", boxShadow: "0 8px 20px rgba(15, 23, 42, 0.035)" }}>
                <div style={{ fontSize: "11px", fontWeight: 800, letterSpacing: "0.16em", color: "#8c63c7", marginBottom: "6px" }}>UPCOMING PICKUP</div>
                <div style={{ fontSize: "22px", fontWeight: 900, color: "#081224", lineHeight: 1.1 }}>{featuredScheduleRaces.length}開催</div>
                <div style={{ marginTop: "6px", fontSize: "12px", lineHeight: 1.7, color: "#64748b" }}>1か月以内のG・F1対象を上品に一覧表示・下部パーツも統一調整</div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: "20px" }}>
            {featuredScheduleRaces.map((item) => {
              const scheduleFavoriteItems = featuredScheduleFavoriteRaceMap.get(item.id) ?? [];
              const hasScheduleFavorite = scheduleFavoriteItems.length > 0;

              return (
              <article key={item.id} style={{ background: hasScheduleFavorite ? "linear-gradient(180deg, #fffdfd 0%, #ffffff 100%)" : "linear-gradient(180deg, #ffffff 0%, #fcfbfe 100%)", border: hasScheduleFavorite ? "1px solid #f1cada" : "1px solid #ece6f5", borderRadius: "32px", padding: "24px", boxShadow: hasScheduleFavorite ? "0 18px 38px rgba(176, 74, 120, 0.08)" : "0 16px 34px rgba(15, 23, 42, 0.05)", minHeight: "188px", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", inset: "0 auto auto 0", width: "100%", height: "4px", background: hasScheduleFavorite ? "linear-gradient(90deg, rgba(235,149,181,0.9) 0%, rgba(255,255,255,0) 72%)" : "linear-gradient(90deg, rgba(122,103,184,0.22) 0%, rgba(255,255,255,0) 72%)" }} />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", marginBottom: "10px", position: "relative" }}>
                  <div style={{ fontSize: "20px", fontWeight: 800, color: "#081224" }}>{item.venue}</div>
                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "9999px", padding: "4px 8px", fontSize: "10px", fontWeight: 800, background: getGradeBadgeTone(item.grade).background, color: getGradeBadgeTone(item.grade).text, border: `1px solid ${getGradeBadgeTone(item.grade).border}`, boxShadow: getGradeBadgeTone(item.grade).shadow, whiteSpace: "nowrap" }}>{item.grade}</span>
                </div>

                <div style={{ fontSize: "14px", fontWeight: 700, color: "#334155", marginBottom: "10px", minHeight: "48px", lineHeight: 1.7 }}>{item.title}</div>

                <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: "36px", borderRadius: "9999px", padding: hasFinderFilters ? "6px 10px" : "8px 12px", fontSize: "11px", fontWeight: 800, color: "#526072", lineHeight: 1.2, background: "linear-gradient(180deg, #ffffff 0%, #fbf8fe 100%)", border: "1px solid #e9e1f2", boxShadow: "0 6px 14px rgba(15, 23, 42, 0.03)" }}>
                  {formatShortDateRange(item.startDate, item.endDate)}
                </div>

                {item.note && <div style={{ marginTop: "10px", fontSize: "12px", color: "#475569", lineHeight: 1.7 }}>{item.note}</div>}

                {hasScheduleFavorite && (
                  <div style={{ marginTop: hasFinderFilters ? "8px" : "14px", borderRadius: "18px", padding: "12px 13px", background: "linear-gradient(180deg, #fff5f8 0%, #ffffff 100%)", border: "1px solid #f6cfde" }}>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", marginBottom: "8px", fontSize: "10px", fontWeight: 900, color: "#b04a78", letterSpacing: "0.08em" }}>
                      <span style={{ fontSize: "12px", lineHeight: 1 }}>❤</span>
                      推しいるよっ！
                    </div>
                    <div style={{ display: "grid", gap: "6px" }}>
                      {scheduleFavoriteItems.map((favoriteItem) => (
                        <div key={`${item.id}-${favoriteItem.rider}-${favoriteItem.venue}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" }}>
                          <div style={{ fontSize: "12px", fontWeight: 800, color: "#7b214f" }}>❤ {favoriteItem.rider}</div>
                          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "9999px", padding: "4px 8px", fontSize: "10px", fontWeight: 800, background: "linear-gradient(180deg, #fffefe 0%, #fff6fb 48%, #f6fbff 100%)", color: "#8a3d64", border: "1px solid #f3c4d7" }}>
                            {favoriteItem.venue}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </article>
              );
            })}
            </div>
          </div>
        </section>

<section
  id="dashboard"
  style={{
    background: "linear-gradient(180deg, #ffffff 0%, #fbf9fe 55%, #ffffff 100%)",
    scrollMarginTop: "110px",
    overflowX: "hidden",
  }}
>
  <div
    style={{
      maxWidth: PAGE_MAX_WIDTH,
      width: "100%",
      boxSizing: "border-box",
      margin: "0 auto",
      padding: isMobile ? "52px 16px 72px" : "156px 24px 132px",
      display: "grid",
      gridTemplateColumns: isMobile ? "1fr" : "1.06fr 0.94fr",
      alignItems: "center",
      gap: isMobile ? "34px" : "72px",
    }}
  >
            <div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: "10px", borderRadius: "9999px", padding: "8px 14px", background: "rgba(244,239,252,0.92)", border: "1px solid #e0d6f4", marginBottom: "20px" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "9999px", background: "#7a67b8", display: "inline-block" }} />
                <span style={{ fontSize: "11px", fontWeight: 800, letterSpacing: "0.18em", color: "#8c63c7" }}>
                  KEIRIN DATA PLATFORM
                </span>
              </div>

<h1
  style={{
    margin: 0,
    fontSize: isMobile ? "42px" : "74px",
    lineHeight: isMobile ? 1.12 : 1.02,
    fontWeight: 900,
    letterSpacing: isMobile ? "-0.025em" : "-0.04em",
    color: "#081224",
    maxWidth: isMobile ? "100%" : "820px",
    wordBreak: "keep-all",
    overflowWrap: "normal",
  }}
>
                勝てる根拠で、
                <br />
                レースを見る。
              </h1>

<p
  style={{
    marginTop: isMobile ? "22px" : "34px",
    maxWidth: isMobile ? "100%" : "720px",
    fontSize: isMobile ? "14px" : "18px",
    lineHeight: isMobile ? 1.9 : 2.0,
    color: "#526072",
  }}
>
                ライン、脚質、直近成績、開催場傾向まで。
                感覚だけに頼らず、根拠で比較し、展開を読み、
                自分の予想スタイルを磨ける競輪サイトへ。
              </p>

              <div
                style={{
                  marginTop: isMobile ? "28px" : "50px",
                  display: "flex",
                  gap: isMobile ? "12px" : "18px",
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <a href="#prediction-page" onClick={(event) => { event.preventDefault(); navigateDashboardHashTop("#prediction-page"); }} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #081224 0%, #162745 100%)", color: "white", border: "none", borderRadius: "9999px", padding: "16px 32px", fontWeight: 900, fontSize: "13px", letterSpacing: "0.04em", boxShadow: "0 18px 32px rgba(8, 18, 36, 0.18)", cursor: "pointer", textDecoration: "none" }}>レース予想を見る</a>
                <a href="#players-page" onClick={(event) => { event.preventDefault(); navigateDashboardHashTop("#players-page"); }} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.96)", color: "#081224", border: "1px solid #d9e0ec", borderRadius: "9999px", padding: "16px 32px", fontWeight: 900, fontSize: "13px", letterSpacing: "0.04em", boxShadow: "0 14px 28px rgba(15, 23, 42, 0.05)", cursor: "pointer", textDecoration: "none" }}>選手データを見る</a>
                <a href="#venue-features-page" onClick={(event) => { event.preventDefault(); navigateDashboardHashTop("#venue-features-page"); }} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", background: "rgba(242,236,251,0.9)", color: "#7a67b8", border: "1px solid #e0d6f4", borderRadius: "9999px", padding: "16px 32px", fontWeight: 900, fontSize: "13px", letterSpacing: "0.04em", boxShadow: "0 14px 28px rgba(122, 103, 184, 0.08)", cursor: "pointer", textDecoration: "none" }}>会場の特徴を見る</a>
              </div>

              <div
  style={{
    marginTop: isMobile ? "28px" : "46px",
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
    gap: isMobile ? "14px" : "18px",
    maxWidth: "880px",
  }}
>
                {overviewStats.map((item) => (
                  <div
                    key={item.label}
                    style={{
                      background: "rgba(255,255,255,0.84)",
                      border: "1px solid #e5edf3",
                      borderRadius: "28px",
                      padding: "22px 24px",
                      boxShadow: "0 16px 34px rgba(15, 23, 42, 0.052)",
                    }}
                  >
                    <div style={{ fontSize: "11px", fontWeight: 800, letterSpacing: "0.18em", color: "#64748b", marginBottom: "10px" }}>
                      {item.label}
                    </div>
                    <div style={{ fontSize: "28px", fontWeight: 900, color: "#081224", lineHeight: 1.1, marginBottom: "8px" }}>
                      {item.value}
                    </div>
                    <div style={{ fontSize: "13px", color: "#64748b", lineHeight: 1.75 }}>
                      {item.sub}
                    </div>
                  </div>
                ))}
              </div>
            </div>

<div
  style={{
    minHeight: isMobile ? 0 : "560px",
    display: "flex",
    alignItems: "center",
    width: "100%",
    minWidth: 0,
  }}
>
              <div
                style={{
                  width: "100%",
                  height: isMobile ? "300px" : "576px",
                  borderRadius: isMobile ? "30px" : "42px",
                  backgroundImage: `url("${toPublicPath("/hero-bg-keirin.jpg")}")`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  border: "1px solid rgba(15, 23, 42, 0.08)",
                  boxShadow: isMobile ? "0 18px 42px rgba(15, 23, 42, 0.08)" : "0 30px 92px rgba(15, 23, 42, 0.11)",
                  position: "relative",
                  overflow: "visible",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: "42px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background:
                        "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.00) 35%, rgba(8,18,36,0.06) 100%)",
                    }}
                  />
                </div>

                <div
                  style={{
                    position: "absolute",
                    right: isMobile ? "8px" : "18px",
                    bottom: isMobile ? "8px" : "14px",
                    width: isMobile ? "176px" : "286px",
                    height: isMobile ? "218px" : "338px",
                    backgroundImage: `url("${toPublicPath("/kurari-hero-chibi.png")}")`,
                    backgroundSize: "contain",
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right bottom",
                    pointerEvents: "none",
                    filter: "drop-shadow(0 16px 28px rgba(8, 18, 36, 0.16))",
                    zIndex: 2,
                  }}
                />
              </div>
            </div>
          </div>
        </section>

        <section id="players" style={{ maxWidth: PAGE_MAX_WIDTH, margin: "0 auto", padding: "40px 24px 120px", scrollMarginTop: "110px" }}>
<div
  style={{
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
    gap: isMobile ? "16px" : "22px",
  }}
>
            {[
              {
                label: "RACES",
                title: "開催レースから探す",
                body: "今日の開催、注目レース、グレード別比較から、狙うべき一戦を整理する。",
                accent: "linear-gradient(135deg, rgba(244,239,252,0.92) 0%, rgba(255,255,255,1) 62%)",
                eyebrowBg: "#f2ecfb",
                eyebrowBorder: "#e0d6f4",
                cta: "開催一覧を見る",
                href: "#races-page",
              },
              {
                label: "PLAYERS",
                title: "選手カルテを見る",
                body: "脚質、決まり手、バック数、直近成績をまとめて、選手の武器を見抜く。",
                accent: "linear-gradient(135deg, rgba(248,250,252,0.96) 0%, rgba(255,255,255,1) 62%)",
                eyebrowBg: "#f8fafc",
                eyebrowBorder: "#e2e8f0",
                cta: "カルテを見る",
                href: "#players-page",
              },
              {
                label: "ANALYSIS",
                title: "展開分析を読む",
                body: "ライン予想、主導権争い、番手有利、不発パターンまで含めて展開を読む。",
                accent: "linear-gradient(135deg, rgba(243,237,252,0.96) 0%, rgba(255,255,255,1) 62%)",
                eyebrowBg: "#f2ecfb",
                eyebrowBorder: "#e0d6f4",
                cta: "展開を読む",
                href: "#prediction-page",
              },
            ].map((card, index) => (
              <article
                key={card.label}
                role="link"
                tabIndex={0}
                onClick={() => {
                  navigateDashboardHashTop(card.href);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    navigateDashboardHashTop(card.href);
                  }
                }}
                style={{
                  background: card.accent,
                  border: "1px solid #ebe3f3",
                  borderRadius: "42px",
                  padding: "30px 30px 28px",
                  boxShadow: "0 20px 44px rgba(15, 23, 42, 0.055)",
                  position: "relative",
                  overflow: "hidden",
                  minHeight: "236px",
                  transition: "transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-4px)";
                  e.currentTarget.style.boxShadow = "0 22px 48px rgba(15, 23, 42, 0.09)";
                  e.currentTarget.style.borderColor = "#ddd1f3";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "0 18px 42px rgba(15, 23, 42, 0.06)";
                  e.currentTarget.style.borderColor = "#ebe5f4";
                }}
              >
                <div style={{ position: "absolute", right: "-28px", top: "-28px", width: "128px", height: "128px", borderRadius: "50%", background: "radial-gradient(circle, rgba(122,103,184,0.12), rgba(122,103,184,0))" }} />
                <div style={{ position: "absolute", left: "-48px", bottom: "-60px", width: "160px", height: "160px", borderRadius: "50%", background: "radial-gradient(circle, rgba(255,255,255,0.88), rgba(255,255,255,0))" }} />
                <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", height: "100%" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" }}>
                    <p style={{ margin: 0, fontSize: "11px", letterSpacing: "0.24em", fontWeight: 900, color: "#8c63c7" }}>{card.label}</p>
                    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: "40px", height: "34px", padding: "0 12px", borderRadius: "9999px", background: card.eyebrowBg, color: "#8c63c7", border: `1px solid ${card.eyebrowBorder}`, fontSize: "12px", fontWeight: 900, boxShadow: "0 4px 12px rgba(122,103,184,0.06)" }}>
                      0{index + 1}
                    </span>
                  </div>

                  <h2 style={{ margin: "0 0 14px", fontSize: "30px", color: "#081224", lineHeight: 1.24, letterSpacing: "-0.02em", maxWidth: "280px" }}>
                    {card.title}
                  </h2>

                  <p style={{ margin: 0, color: "#526072", lineHeight: 1.9, fontSize: "15px", maxWidth: "332px" }}>
                    {card.body}
                  </p>

                  <div style={{ marginTop: "auto", paddingTop: "24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
                    <a
                      href={card.href}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        navigateDashboardHashTop(card.href);
                      }}
                      style={{ display: "inline-flex", alignItems: "center", gap: "10px", fontSize: "14px", fontWeight: 800, color: "#081224", textDecoration: "none" }}
                    >
                      <span>{card.cta}</span>
                      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "26px", height: "26px", borderRadius: "9999px", background: "linear-gradient(180deg, #fffefe 0%, #fff6fb 48%, #f6fbff 100%)", border: "1px solid #e0d6f4", color: "#8c63c7", boxShadow: "0 4px 10px rgba(15, 23, 42, 0.05)" }}>
                        →
                      </span>
                    </a>

                    {card.label === "ANALYSIS" && (
                      <div
                        style={{
                          width: "118px",
                          height: "118px",
                          backgroundImage: `url("${toPublicPath("/naughty-guide-card.png")}")`,
                          backgroundSize: "contain",
                          backgroundRepeat: "no-repeat",
                          backgroundPosition: "right bottom",
                          filter: "drop-shadow(0 12px 18px rgba(8, 18, 36, 0.12))",
                          pointerEvents: "none",
                          transform: "translate(12px, 8px)",
                          flexShrink: 0,
                        }}
                      />
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="races" style={{ maxWidth: PAGE_MAX_WIDTH, margin: "0 auto", padding: "16px 24px 126px", scrollMarginTop: "110px" }}>
          <div style={{ marginBottom: "34px" }}>
            <p style={{ margin: "0 0 10px 0", fontSize: "11px", fontWeight: 900, letterSpacing: "0.24em", color: "#8c63c7" }}>TODAY&apos;S RACES</p>
            <h2 style={{ margin: 0, fontSize: "36px", lineHeight: 1.14, color: "#081224", letterSpacing: "-0.02em" }}>今日の開催レース</h2>
            <p style={{ marginTop: "14px", maxWidth: "880px", color: "#5f6b7c", fontSize: "15px", lineHeight: 1.9 }}>当日開催のレースを一覧で確認。会場ごとの特徴や注目開催を整理して、今日どこを見るかをすぐ決められるトップページに。</p>
          </div>

          {dashboardTodayRaces.length === 0 ? (
            <div style={{ borderRadius: "42px", border: "1px solid #ebe3f3", background: "linear-gradient(180deg, #fffefe 0%, #fff6fb 48%, #f6fbff 100%)", padding: "34px", color: "#475569", lineHeight: 1.95, boxShadow: "0 18px 36px rgba(15, 23, 42, 0.055)" }}>
              {TODAY} 時点で開催中のレースはありません。
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : getTodayRacesGridTemplateColumns(dashboardTodayRaces.length),
                gap: isMobile ? "14px" : "20px",
              }}
            >
              {dashboardTodayRaces.map((race) => {
                const favoriteItems = todayFavoriteRaceMap.get(race.id) ?? [];
                const hasFavorite = favoriteItems.length > 0;
                const predictionVenue = todayPredictionVenueMap.get(normalizePredictionVenueName(race.venue)) ?? null;
                const venueWeather = race.venue in todayWeatherByVenue ? todayWeatherByVenue[race.venue] : undefined;
                const weatherSummary = getDashboardVenueWeatherSummary(venueWeather);
                const progressLabel = predictionVenue ? getPredictionVenueProgressLabel(predictionVenue, dashboardNow) : `${getSessionLabel(race.session)}開催中`;
                const favoriteSummaryLabel = hasFavorite ? `推し ${favoriteItems.length}名` : "推し —";
                const venueSummary = todayVenuePredictionSummaryMap[normalizePredictionVenueName(race.venue)];
                const hasVenueResult = Boolean(venueSummary);
                const venueProfitTone = getProfitMiniTone(venueSummary?.profitLoss);
                const venueResultStatus = hasVenueResult
                  ? `${venueSummary?.savedRaceCount ?? 0}R入力 / ${venueSummary?.settledRaceCount ?? 0}R判定 / ${venueSummary?.hitCount ?? 0}R的中`
                  : "未入力";

                return (
                  <article
                    key={race.id}
                    role="link"
                    tabIndex={0}
                    onClick={() => openPredictionPageForVenue(race.venue)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openPredictionPageForVenue(race.venue);
                      }
                    }}
                    style={{
                      background: "linear-gradient(180deg, #fffefe 0%, #f8f0ff 56%, #f3f9ff 100%)",
                      border: "1px solid #ebe3f3",
                      borderRadius: "42px",
                      padding: "20px",
                      boxShadow: "0 20px 44px rgba(15, 23, 42, 0.055)",
                      position: "relative",
                      overflow: "hidden",
                      minHeight: hasFavorite ? "500px" : hasVenueResult ? "422px" : "354px",
                      display: "flex",
                      flexDirection: "column",
                      transition: "transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease",
                      cursor: "pointer",
                    }}
                    onMouseEnter={(event) => {
                      event.currentTarget.style.transform = "translateY(-4px)";
                      event.currentTarget.style.boxShadow = "0 24px 50px rgba(15, 23, 42, 0.08)";
                      event.currentTarget.style.borderColor = "#ddd1f3";
                    }}
                    onMouseLeave={(event) => {
                      event.currentTarget.style.transform = "translateY(0)";
                      event.currentTarget.style.boxShadow = "0 20px 44px rgba(15, 23, 42, 0.055)";
                      event.currentTarget.style.borderColor = "#ebe3f3";
                    }}
                  >
                    <div style={{ position: "absolute", right: "-36px", top: "-36px", width: "104px", height: "104px", borderRadius: "50%", background: "radial-gradient(circle, rgba(122,103,184,0.10), rgba(122,103,184,0))", pointerEvents: "none" }} />

                    <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "14px", marginBottom: "16px" }}>
                        <div>
                          <p style={{ margin: "0 0 8px 0", fontSize: "10px", fontWeight: 900, letterSpacing: "0.18em", color: "#8c63c7" }}>VENUE</p>
                          <h3 style={{ margin: 0, fontSize: "30px", lineHeight: 1.08, color: "#081224", fontWeight: 900, letterSpacing: "-0.02em" }}>{race.venue}</h3>
                        </div>

                        <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "9999px", padding: "10px 14px", fontSize: "12px", fontWeight: 900, background: getGradeBadgeTone(race.grade).background, color: getGradeBadgeTone(race.grade).text, border: `1px solid ${getGradeBadgeTone(race.grade).border}`, boxShadow: getGradeBadgeTone(race.grade).shadow, whiteSpace: "nowrap" }}>
                          {race.displayGradeLabel ?? "—"}
                        </div>
                      </div>

                      <div style={{ marginBottom: "16px", fontSize: "14px", fontWeight: 800, color: "#334155", lineHeight: 1.7, minHeight: "46px", maxWidth: "94%" }}>
                        {race.title}
                      </div>

                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "9999px", padding: "6px 10px", fontSize: "10px", fontWeight: 900, background: "linear-gradient(180deg, #fffefe 0%, #fff6fb 48%, #f6fbff 100%)", color: "#526072", border: "1px solid #e7e3ef" }}>
                          {race.note?.includes("モーニング") ? "モーニング" : getSessionLabel(race.session)}
                        </span>

                        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "9999px", padding: "6px 10px", fontSize: "10px", fontWeight: 900, background: race.hasGirls ? "#fdf0f7" : "#ffffff", color: race.hasGirls ? "#b04a78" : "#526072", border: race.hasGirls ? "1px solid #f6c7dc" : "1px solid #e7e3ef" }}>
                          {race.hasGirls ? "ガールズあり" : "通常開催"}
                        </span>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "10px", marginBottom: "16px" }}>
                        {[
                          { label: "天気", value: weatherSummary.headline, tone: "#526072" },
                          { label: "風", value: weatherSummary.detail, tone: "#526072" },
                          { label: "進行", value: progressLabel, tone: "#081224" },
                          { label: "推し", value: favoriteSummaryLabel, tone: hasFavorite ? "#8a3d64" : "#64748b" },
                        ].map((item) => (
                          <div key={`${race.id}-${item.label}`} style={{ borderRadius: "18px", padding: "10px 12px", background: "rgba(255,255,255,0.72)", border: "1px solid #ebe3f3", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.72)" }}>
                            <div style={{ fontSize: "9px", fontWeight: 900, letterSpacing: "0.14em", color: "#7b889b", marginBottom: "5px" }}>{item.label}</div>
                            <div style={{ fontSize: "12px", fontWeight: 800, color: item.tone, lineHeight: 1.6 }}>{item.value}</div>
                          </div>
                        ))}
                      </div>

                      <div style={{ borderRadius: "20px", padding: "12px 14px", background: hasVenueResult ? "linear-gradient(180deg, rgba(250,247,253,0.98) 0%, rgba(255,255,255,1) 100%)" : "rgba(255,255,255,0.68)", border: hasVenueResult ? "1px solid #e4daf3" : "1px solid #ebe3f3", boxShadow: hasVenueResult ? "0 8px 20px rgba(122,103,184,0.05)" : "none", marginBottom: "16px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", marginBottom: "10px", flexWrap: "wrap" }}>
                          <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.14em", color: "#7a67b8" }}>PREDICTION RESULT</div>
                          <div style={{ fontSize: "10px", fontWeight: 800, color: hasVenueResult ? "#64748b" : "#94a3b8" }}>{venueResultStatus}</div>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px" }}>
                          {[
                            { label: "投資", value: hasVenueResult ? formatPredictionResultYen(venueSummary?.investment) : "—", color: "#081224" },
                            { label: "収支", value: hasVenueResult ? formatPredictionResultProfitLoss(venueSummary?.profitLoss) : "—", color: hasVenueResult ? venueProfitTone.text : "#94a3b8" },
                            { label: "的中率", value: hasVenueResult ? formatPredictionResultRoi(venueSummary?.hitRate) : "—", color: hasVenueResult && (venueSummary?.hitRate ?? 0) > 0 ? "#0f766e" : "#081224" },
                            { label: "回収率", value: hasVenueResult ? formatPredictionResultRoi(venueSummary?.roi) : "—", color: hasVenueResult && (venueSummary?.roi ?? 0) >= 100 ? "#4f46e5" : "#081224" },
                          ].map((item) => (
                            <div key={`${race.id}-${item.label}`} style={{ borderRadius: "14px", padding: "9px 10px", background: hasVenueResult ? "rgba(255,255,255,0.84)" : "rgba(255,255,255,0.62)", border: hasVenueResult ? "1px solid #ece4f6" : "1px solid #ebe3f3" }}>
                              <div style={{ fontSize: "9px", fontWeight: 800, letterSpacing: "0.14em", color: "#64748b", marginBottom: "4px" }}>{item.label}</div>
                              <div style={{ fontSize: "12px", fontWeight: 800, color: item.color }}>{item.value}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {hasFavorite && (
                        <div
                          style={{
                            marginTop: "12px",
                            borderRadius: "20px",
                            padding: "12px 14px",
                            background: "linear-gradient(180deg, #fff4f8 0%, #ffffff 100%)",
                            border: "1px solid #f7cadc",
                            boxShadow: "0 8px 20px rgba(176,74,120,0.08)",
                          }}
                        >
                          <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", marginBottom: "10px", fontSize: "11px", fontWeight: 900, color: "#b04a78", letterSpacing: "0.08em" }}>
                            <span style={{ fontSize: "13px", lineHeight: 1 }}>❤</span>
                            推しいるよっ！
                          </div>

                          <div style={{ display: "grid", gap: "7px" }}>
                            {favoriteItems.map((item) => (
                              <div key={`${race.id}-${item.rider}-${item.venue}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
                                <div style={{ fontSize: "12px", fontWeight: 800, color: "#7b214f", lineHeight: 1.6 }}>
                                  ❤ {item.rider}
                                </div>
                                <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "9999px", padding: "4px 8px", fontSize: "10px", fontWeight: 800, background: "linear-gradient(180deg, #fffefe 0%, #fff6fb 48%, #f6fbff 100%)", color: "#8a3d64", border: "1px solid #f3c4d7" }}>
                                    {item.venue}
                                  </span>
                                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "9999px", padding: "4px 8px", fontSize: "10px", fontWeight: 800, background: "linear-gradient(180deg, #fffefe 0%, #fff6fb 48%, #f6fbff 100%)", color: "#8a3d64", border: "1px solid #f3c4d7" }}>
                                    {item.raceLabel ?? "前日夜に反映"}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "14px", marginTop: "auto", paddingTop: "20px" }}>
                      <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "9999px", minHeight: "38px", padding: hasFinderFilters ? "6px 10px" : "8px 12px", fontSize: "11px", fontWeight: 800, color: "#526072", background: "linear-gradient(180deg, #ffffff 0%, #fbf8fe 100%)", border: "1px solid #e9e1f2", boxShadow: "0 6px 14px rgba(15, 23, 42, 0.03)" }}>
                        {formatShortDateRange(race.startDate, race.endDate)}
                      </div>

                      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "38px", height: "38px", borderRadius: "9999px", background: "linear-gradient(180deg, #ffffff 0%, #fbf8fe 100%)", border: "1px solid #e0d6f4", color: "#8c63c7", boxShadow: "0 6px 14px rgba(15, 23, 42, 0.05)" }}>
                        →
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
  <section id="featured-race" style={{ maxWidth: PAGE_MAX_WIDTH, margin: "0 auto", padding: "30px 24px 146px", scrollMarginTop: "110px" }}>
          <div style={{ marginBottom: "34px", display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "24px", flexWrap: "wrap" }}>
            <div>
              <p style={{ margin: "0 0 10px 0", fontSize: "11px", fontWeight: 900, letterSpacing: "0.24em", color: "#8c63c7" }}>FEATURED RACE</p>
              <h2 style={{ margin: 0, fontSize: "36px", lineHeight: 1.14, color: "#081224", letterSpacing: "-0.02em" }}>今日の注目レース</h2>
              <p style={{ marginTop: "14px", maxWidth: "880px", color: "#5f6b7c", fontSize: "15px", lineHeight: 1.95 }}>開催一覧の中でも、展開やシリーズの見どころが特に目立つ注目開催をピックアップ。まず最初に深く見たい一開催をここから確認できます。</p>
            </div>
            <div style={{ padding: "12px 16px", borderRadius: "20px", background: "linear-gradient(180deg, #ffffff 0%, #f9f6fd 100%)", border: "1px solid #ece4f6", minWidth: "220px", boxShadow: "0 8px 20px rgba(15, 23, 42, 0.035)" }}>
              <div style={{ fontSize: "11px", fontWeight: 800, letterSpacing: "0.16em", color: "#8c63c7", marginBottom: "6px" }}>TODAY'S PICK</div>
              <div style={{ fontSize: "22px", fontWeight: 900, color: "#081224", lineHeight: 1.1 }}>{featuredRaceData.venue}</div>
              <div style={{ marginTop: "6px", fontSize: "12px", lineHeight: 1.7, color: "#64748b" }}>{featuredTodayRace ? `${featuredRaceData.grade} / ${featuredRaceData.sessionLabel}` : "表示対象なし"}</div>
            </div>
          </div>

          <article style={{ position: "relative", overflow: "hidden", borderRadius: "44px", border: "1px solid #ebe3f3", background: "linear-gradient(135deg, rgba(244,239,252,0.96) 0%, rgba(250,248,253,1) 52%, rgba(255,255,255,1) 100%)", boxShadow: "0 30px 64px rgba(15, 23, 42, 0.078)", padding: "32px", display: "grid", gridTemplateColumns: "1.02fr 0.98fr", gap: "22px", alignItems: "stretch" }}>
            <div style={{ position: "absolute", right: "-84px", top: "-84px", width: "250px", height: "250px", borderRadius: "50%", background: "radial-gradient(circle, rgba(122,103,184,0.10), rgba(122,103,184,0))", pointerEvents: "none" }} />

            <div
              role={featuredPredictionTarget ? "link" : undefined}
              tabIndex={featuredPredictionTarget ? 0 : -1}
              onClick={() => {
                if (featuredPredictionTarget) {
                  openPredictionPageForTarget(featuredPredictionTarget);
                }
              }}
              onKeyDown={(event) => {
                if (!featuredPredictionTarget) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openPredictionPageForTarget(featuredPredictionTarget);
                }
              }}
              style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", borderRadius: "42px", background: "linear-gradient(180deg, #fbfcff 0%, #ffffff 100%)", border: "1px solid #ebe3f3", padding: "30px", minHeight: "258px", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.75)", transition: featuredPredictionTarget ? "transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease" : undefined, cursor: featuredPredictionTarget ? "pointer" : "default" }}
              onMouseEnter={(event) => {
                if (!featuredPredictionTarget) return;
                event.currentTarget.style.transform = "translateY(-2px)";
                event.currentTarget.style.boxShadow = "inset 0 1px 0 rgba(255,255,255,0.75), 0 18px 36px rgba(15, 23, 42, 0.06)";
                event.currentTarget.style.borderColor = "#ddd1f3";
              }}
              onMouseLeave={(event) => {
                if (!featuredPredictionTarget) return;
                event.currentTarget.style.transform = "translateY(0)";
                event.currentTarget.style.boxShadow = "inset 0 1px 0 rgba(255,255,255,0.75)";
                event.currentTarget.style.borderColor = "#ebe3f3";
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "18px" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "9999px", padding: "6px 10px", fontSize: "11px", fontWeight: 900, background: getGradeBadgeTone(featuredTodayRace?.grade ?? "").background, color: getGradeBadgeTone(featuredTodayRace?.grade ?? "").text, border: `1px solid ${getGradeBadgeTone(featuredTodayRace?.grade ?? "").border}`, boxShadow: getGradeBadgeTone(featuredTodayRace?.grade ?? "").shadow }}>{featuredTodayRace?.displayGradeLabel ?? "—"}</span>
                  <span style={{ borderRadius: "9999px", padding: "6px 10px", fontSize: "11px", fontWeight: 800, color: "#475569", background: "linear-gradient(180deg, #fffefe 0%, #fff6fb 48%, #f6fbff 100%)", border: "1px solid #e7e3ef" }}>{featuredTodayRace ? featuredTodayRace.venue : "本日開催なし"}</span>
                  <span style={{ borderRadius: "9999px", padding: "6px 10px", fontSize: "11px", fontWeight: 800, color: "#475569", background: "linear-gradient(180deg, #fffefe 0%, #fff6fb 48%, #f6fbff 100%)", border: "1px solid #e7e3ef" }}>{featuredTodayRace ? formatShortDateRange(featuredTodayRace.startDate, featuredTodayRace.endDate) : "開催データなし"}</span>
                  <span style={{ borderRadius: "9999px", padding: "6px 10px", fontSize: "11px", fontWeight: 800, color: "#475569", background: "linear-gradient(180deg, #fffefe 0%, #fff6fb 48%, #f6fbff 100%)", border: "1px solid #e7e3ef" }}>{featuredTodayRace ? `${getSessionLabel(featuredTodayRace.session)}開催` : "時間帯 —"}</span>
                  {featuredPredictionTarget?.raceNumber ? <span style={{ borderRadius: "9999px", padding: "6px 10px", fontSize: "11px", fontWeight: 800, color: "#475569", background: "linear-gradient(180deg, #fffefe 0%, #fff6fb 48%, #f6fbff 100%)", border: "1px solid #e7e3ef" }}>{featuredPredictionTarget.raceNumber}R目線</span> : null}
                </div>

                <div style={{ marginBottom: "8px", fontSize: "11px", fontWeight: 900, letterSpacing: "0.18em", color: "#8c63c7" }}>{featuredRaceData.raceNumber ? `${featuredRaceData.venue} ${featuredRaceData.raceNumber}` : `${featuredRaceData.venue} FEATURE`}</div>

                <h3 style={{ margin: "0 0 12px 0", fontSize: "36px", lineHeight: 1.18, color: "#081224", fontWeight: 900, letterSpacing: "-0.03em", maxWidth: "620px" }}>{featuredRaceData.title}</h3>

                <p style={{ margin: "0 0 18px 0", color: "#526072", fontSize: "15px", lineHeight: 1.95, maxWidth: "640px" }}>{featuredRaceData.subtitle}</p>

                <div style={{ display: "grid", gap: "12px", maxWidth: "700px" }}>
                  {[
                    { label: "見どころ", body: featuredRaceData.viewPoint },
                    { label: "注目理由", body: featuredRaceData.reason },
                    { label: "ひとことメモ", body: featuredRaceData.memo },
                  ].map((section) => (
                    <div key={section.label} style={{ borderRadius: "20px", padding: "15px 16px", background: "linear-gradient(180deg, #fffefe 0%, #f8f0ff 56%, #f3f9ff 100%)", border: "1px solid #ebe3f3", color: "#5f6b7c", fontSize: "13px", lineHeight: 1.9, boxShadow: "0 8px 20px rgba(15, 23, 42, 0.03)" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", marginBottom: "6px", flexWrap: "wrap" }}>
                        <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.16em", color: "#8c63c7" }}>{section.label}</div>
                        {section.label === "注目理由" ? <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "9999px", padding: "4px 8px", fontSize: "10px", fontWeight: 800, background: "#ffffff", color: featuredRaceData.oddsTone === "favorite" ? "#0f766e" : featuredRaceData.oddsTone === "balanced" ? "#8c63c7" : featuredRaceData.oddsTone === "chaotic" ? "#b45309" : "#64748b", border: "1px solid #e7e3ef" }}>{getFeaturedRaceOddsToneLabel(featuredRaceData.oddsTone)}</span> : null}
                      </div>
                      <div>{section.body}</div>
                    </div>
                  ))}
                </div>

                {featuredSupplementRiders.length > 0 && (
                  <div style={{ marginTop: "14px", borderRadius: "22px", padding: "15px 16px", background: "linear-gradient(180deg, #fff8f8 0%, #ffffff 100%)", border: "1px solid #f2d7dc", boxShadow: "0 10px 24px rgba(195,91,104,0.07)", maxWidth: "700px" }}>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", marginBottom: "10px", fontSize: "11px", fontWeight: 900, color: "#c35b68", letterSpacing: "0.08em" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "18px", height: "18px", borderRadius: "9999px", background: "#fdeeee", border: "1px solid #f3c8cf", fontSize: "10px", fontWeight: 900 }}>SS</span>
                      注目メンバー
                    </div>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {featuredSupplementRiders.map((item) => (
                        <span
                          key={`featured-supplement-${item.rider}`}
                          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "9999px", padding: "6px 10px", fontSize: "11px", fontWeight: 800, background: "linear-gradient(180deg, #fffefe 0%, #fff6fb 48%, #f6fbff 100%)", color: "#a33f52", border: "1px solid #f1c8d0" }}
                        >
                          {item.rider}{item.branch ? `（${item.branch}）` : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {featuredTodayRaceFavorites.length > 0 && (
                  <div style={{ marginTop: "14px", borderRadius: "22px", padding: "15px 16px", background: "linear-gradient(180deg, #fff4f8 0%, #ffffff 100%)", border: "1px solid #f7cadc", boxShadow: "0 10px 24px rgba(176,74,120,0.08)", maxWidth: "700px" }}>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", marginBottom: "10px", fontSize: "11px", fontWeight: 900, color: "#b04a78", letterSpacing: "0.08em" }}>
                      <span style={{ fontSize: "13px", lineHeight: 1 }}>❤</span>
                      推しいるよっ！
                    </div>
                    <div style={{ display: "grid", gap: "8px" }}>
                      {featuredTodayRaceFavorites.map((item) => (
                        <div key={`featured-${item.rider}-${item.venue}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
                          <div style={{ fontSize: "13px", fontWeight: 800, color: "#7b214f" }}>❤ {item.rider}</div>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "9999px", padding: "5px 9px", fontSize: "11px", fontWeight: 800, background: "linear-gradient(180deg, #fffefe 0%, #fff6fb 48%, #f6fbff 100%)", color: "#8a3d64", border: "1px solid #f3c4d7" }}>
                              {item.venue}
                            </span>
                            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "9999px", padding: "5px 9px", fontSize: "11px", fontWeight: 800, background: "linear-gradient(180deg, #fffefe 0%, #fff6fb 48%, #f6fbff 100%)", color: "#8a3d64", border: "1px solid #f3c4d7" }}>
                              {item.raceLabel ?? "前日夜に反映"}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div style={{ marginTop: "22px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    if (featuredPredictionTarget) {
                      openPredictionPageForTarget(featuredPredictionTarget);
                    }
                  }}
                  style={{ border: "none", borderRadius: "9999px", background: "linear-gradient(135deg, #081224 0%, #14213d 100%)", color: "white", padding: "13px 22px", fontWeight: 900, fontSize: "13px", cursor: featuredPredictionTarget ? "pointer" : "default", boxShadow: "0 14px 28px rgba(8, 18, 36, 0.16)", alignSelf: "flex-start", opacity: featuredPredictionTarget ? 1 : 0.7 }}
                >
                  予想を見る
                </button>
                <span style={{ fontSize: "12px", color: "#6b7280", fontWeight: 800 }}>{featuredRaceData.raceId ? `race_id: ${featuredRaceData.raceId}` : featuredRaceData.oddsComment}</span>
              </div>
            </div>

            <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", justifyContent: "stretch", gap: "0", height: "100%" }}>
              <div style={{ position: "relative", borderRadius: "42px", padding: "30px 30px 28px", background: "linear-gradient(135deg, #2a2247 0%, #5d4aa0 48%, #8b78cf 100%)", color: "white", boxShadow: "0 18px 44px rgba(8, 18, 36, 0.22)", overflow: "hidden", minHeight: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <div style={{ position: "absolute", right: "-30px", top: "-30px", width: "190px", height: "190px", borderRadius: "50%", background: "radial-gradient(circle, rgba(255,255,255,0.18), rgba(255,255,255,0))", pointerEvents: "none" }} />
                <div style={{ position: "absolute", left: "-46px", bottom: "-56px", width: "180px", height: "180px", borderRadius: "50%", background: "radial-gradient(circle, rgba(255,255,255,0.12), rgba(255,255,255,0))", pointerEvents: "none" }} />
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0) 35%, rgba(10,8,28,0.14) 100%)", pointerEvents: "none" }} />
                <div
                  style={{
                    position: "absolute",
                    right: "18px",
                    bottom: "22px",
                    width: "312px",
                    height: "312px",
                    backgroundImage: `url("${toPublicPath("/charigon-featured-race-chibi.png")}")`,
                    backgroundSize: "contain",
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right bottom",
                    filter: "drop-shadow(0 16px 28px rgba(8, 18, 36, 0.22))",
                    pointerEvents: "none",
                    zIndex: 1,
                  }}
                />

                <div style={{ position: "relative", zIndex: 2, paddingRight: "300px", display: "flex", flexDirection: "column", minHeight: "100%" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
                    <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "9999px", padding: "6px 10px", fontSize: "11px", fontWeight: 900, background: "rgba(255,255,255,0.13)", border: "1px solid rgba(255,255,255,0.18)", backdropFilter: "blur(6px)" }}>G RACE MEMBERS</div>
                    {featuredTodayRaceFavorites.length > 0 && (
                      <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "9999px", padding: "6px 10px", fontSize: "11px", fontWeight: 900, background: "rgba(255,228,238,0.18)", border: "1px solid rgba(255,214,229,0.32)", color: "#ffe4ee", backdropFilter: "blur(6px)" }}>❤ 推しいるよっ！</div>
                    )}
                  </div>

                  <div style={{ marginBottom: "8px", fontSize: "15px", fontWeight: 800, lineHeight: 1.4, color: "rgba(255,255,255,0.78)", letterSpacing: "0.06em" }}>
                    {featuredRaceData.membersLead}
                  </div>

                  <div style={{ marginBottom: "12px", fontSize: "32px", fontWeight: 900, lineHeight: 1.1, letterSpacing: "-0.03em", maxWidth: "420px" }}>Gレースの注目選手</div>

                  <div style={{ display: "inline-flex", alignItems: "center", gap: "10px", borderRadius: "9999px", padding: "10px 14px", background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.18)", backdropFilter: "blur(8px)", marginBottom: "16px" }}>
                    <span style={{ fontSize: "13px", fontWeight: 900, color: "#ffffff" }}>{featuredTodayRace?.displayGradeLabel ?? "—"}</span>
                    <span style={{ width: "4px", height: "4px", borderRadius: "9999px", background: "rgba(255,255,255,0.6)" }} />
                    <span style={{ fontSize: "13px", fontWeight: 700, color: "rgba(255,255,255,0.92)" }}>{featuredTodayRace ? featuredTodayRace.venue : "会場 —"}</span>
                    {featuredPredictionTarget?.raceNumber ? <><span style={{ width: "4px", height: "4px", borderRadius: "9999px", background: "rgba(255,255,255,0.6)" }} /><span style={{ fontSize: "13px", fontWeight: 700, color: "rgba(255,255,255,0.92)" }}>{featuredPredictionTarget.raceNumber}R</span></> : null}
                  </div>

                  <p style={{ margin: 0, color: "rgba(255,255,255,0.88)", lineHeight: 1.8, fontSize: "14px", maxWidth: "420px" }}>{featuredRaceData.membersLead}</p>

                  {featuredRaceData.primaryRiders.length > 0 && (
                    <div style={{ marginTop: "18px", display: "grid", gap: "10px", maxWidth: "440px" }}>
                      {featuredRaceData.primaryRiders.map((member) => (
                        <div key={`${member.role}-${member.name}`} style={{ borderRadius: "18px", padding: "12px 14px", background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.16)", display: "grid", gap: "8px" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
                            <div style={{ fontSize: "11px", fontWeight: 900, color: "#ffe7eb", letterSpacing: "0.08em" }}>{member.role}</div>
                            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                              {member.tags.map((tag) => (
                                <span key={`${member.role}-${member.name}-${tag}`} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "9999px", padding: "4px 8px", fontSize: "10px", fontWeight: 800, background: "rgba(255,255,255,0.12)", color: "#ffffff", border: "1px solid rgba(255,255,255,0.16)" }}>{tag}</span>
                              ))}
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
                            <div style={{ fontSize: "18px", fontWeight: 900, color: "#ffffff", lineHeight: 1.2 }}>{member.name}</div>
                            <div style={{ fontSize: "11px", fontWeight: 800, color: "rgba(255,255,255,0.82)" }}>脚質 {member.style} / 得点 {member.scoreText}</div>
                          </div>
                          <div style={{ fontSize: "13px", lineHeight: 1.8, color: "rgba(255,255,255,0.88)" }}>{member.comment}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {featuredTodayRaceFavorites.length > 0 && (
                    <div style={{ marginTop: "18px", display: "grid", gap: "8px", maxWidth: "420px" }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "11px", fontWeight: 900, color: "#ffe4ee", letterSpacing: "0.08em" }}>
                        <span style={{ fontSize: "13px", lineHeight: 1 }}>❤</span>
                        推し出走
                      </div>
                      {featuredTodayRaceFavorites.map((item) => (
                        <div key={`featured-right-fav-${item.rider}-${item.venue}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap", borderRadius: "16px", padding: "10px 12px", background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.16)" }}>
                          <div style={{ fontSize: "13px", fontWeight: 800, color: "#ffffff" }}>❤ {item.rider}</div>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "9999px", padding: "5px 9px", fontSize: "11px", fontWeight: 800, background: "rgba(255,255,255,0.12)", color: "#ffffff", border: "1px solid rgba(255,255,255,0.18)" }}>{item.venue}</span>
                            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "9999px", padding: "5px 9px", fontSize: "11px", fontWeight: 800, background: "rgba(255,255,255,0.12)", color: "#ffffff", border: "1px solid rgba(255,255,255,0.18)" }}>{item.raceLabel ?? "前日夜に反映"}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ position: "relative", zIndex: 2, display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px", marginTop: "28px", paddingRight: "300px" }}>
                  <button style={{ background: "rgba(8,18,36,0.92)", color: "white", border: "1px solid rgba(255,255,255,0.16)", borderRadius: "9999px", padding: "13px 22px", fontWeight: 900, fontSize: "12px", cursor: "pointer", boxShadow: "0 10px 22px rgba(8, 18, 36, 0.16)", flexShrink: 0 }}>注目選手を見る</button>
                  <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.76)", fontWeight: 800, textAlign: "right" }}>この開催の注目メンバー</span>
                </div>
              </div>
            </div>
          </article>
        </section>

        <div id="calendar" style={{ scrollMarginTop: "110px" }}><CalendarSectionInApp favoriteRiderFeed={favoriteRiderFeed} /></div>

        <section style={{ maxWidth: PAGE_MAX_WIDTH, margin: "0 auto", padding: "0 24px 138px" }}>
          <div style={{ borderRadius: "42px", border: "1px solid #ebe3f3", background: "linear-gradient(180deg, #ffffff 0%, #fbf8fd 100%)", boxShadow: "0 18px 44px rgba(15, 23, 42, 0.05)", padding: "30px 34px", display: "grid", gridTemplateColumns: "1.05fr 0.95fr", gap: "26px", alignItems: "center" }}>
            <div>
              <p style={{ margin: "0 0 10px 0", fontSize: "11px", fontWeight: 900, letterSpacing: "0.22em", color: "#8c63c7" }}>BRAND NOTE</p>
              <h2 style={{ margin: 0, fontSize: "30px", lineHeight: 1.2, color: "#081224", letterSpacing: "-0.02em" }}>展開を読み、勝負の軸をつくる。</h2>
              <p style={{ margin: "14px 0 0 0", maxWidth: "760px", fontSize: "15px", lineHeight: 1.95, color: "#64748b" }}>
                直近開催、今日の開催、注目レース、開催カレンダーまで。必要な情報をすっきりまとめて、見やすく追えるトップページに整えています。
              </p>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", flexWrap: "wrap" }}>
              {[
                "RACE SCHEDULE",
                "TODAY'S RACES",
                "FEATURED RACE",
                "RACE CALENDAR",
              ].map((label) => (
                <span key={label} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: "42px", padding: "0 16px", borderRadius: "9999px", background: "linear-gradient(180deg, #ffffff 0%, #f8f5fc 100%)", border: "1px solid #ebe3f3", color: "#5f4a96", fontSize: "11px", fontWeight: 900, letterSpacing: "0.12em", boxShadow: "0 8px 18px rgba(15, 23, 42, 0.035)" }}>
                  {label}
                </span>
              ))}
            </div>
          </div>
        </section>
        <a
          href="https://lit.link/kurari221"
          target="_blank"
          rel="noreferrer"
          aria-label="くらりのHPへ移動"
          style={{
            position: "fixed",
            right: "-12px",
            bottom: "-14px",
            width: "190px",
            height: "190px",
            backgroundImage: `url("${toPublicPath("/charigon-fixed-guide.png")}")`,
            backgroundSize: "contain",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "center",
            zIndex: 30,
            display: "block",
            filter: "drop-shadow(0 12px 22px rgba(8, 18, 36, 0.14))",
            animation: "charigonFloat 3.4s ease-in-out infinite",
            cursor: "pointer",
          }}
        />

        <style>{`
          @keyframes charigonFloat {
            0% { transform: translateY(0px); }
            50% { transform: translateY(-8px); }
            100% { transform: translateY(0px); }
          }
        `}</style>

      </main>
    </div>
  );
}

type PlayerIndexItem = {
  id: string;
  name: string;
  kana?: string;
  prefecture?: string;
  region?: string;
  grade?: string;
  style?: string;
  updatedAt?: string;
  file: string;
  summary?: string;
  tags?: string[];
};

type ParsedPlayerCard = {
  id: string;
  markdown: string;
  sections: { title: string; content: string }[];
  profile: Record<string, string>;
  summary: Record<string, string>;
  schedule: Record<string, string>;
};

type PredictionExportRiderContext = {
  rider: PredictionRiderItem;
  indexItem: PlayerIndexItem | null;
  card: ParsedPlayerCard | null;
};

const buildPredictionExportContextsFromRiders = (riders: PredictionRiderItem[]): PredictionExportRiderContext[] =>
  riders.map((rider) => ({ rider, indexItem: null, card: null }));


const PLAYER_INDEX_URL = toPublicPath("/data/player-cards/index.json");
const PLAYER_CARD_BASE = toPublicPath("/data/player-cards/");

const resolvePlayerCardUrl = (file: string) => {
  const normalized = file.trim();

  if (!normalized) return PLAYER_CARD_BASE;

  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    return normalized;
  }

  if (normalized.startsWith("/")) {
    return toPublicPath(normalized);
  }

  return `${PLAYER_CARD_BASE}${normalized.replace(/^\/+/, "")}`;
};
const parseTableBlock = (block: string) => {
  const lines = block
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const tableLines = lines.filter((line) => line.startsWith("|") && line.endsWith("|"));
  if (tableLines.length < 2) return null;

  const rows = tableLines.map((line) =>
    line
      .slice(1, -1)
      .split("|")
      .map((cell) => cell.trim())
  );

  if (rows.length < 2) return null;

  const header = rows[0];
  const body = rows.slice(2);

  if (!body.length) return null;

  return { header, body };
};

const extractKeyValueSection = (markdown: string, heading: string) => {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = markdown.match(new RegExp(`${escaped}[\\s\\S]*?(?=\\n## |$)`));
  const block = match?.[0] ?? "";
  const table = parseTableBlock(block);
  if (!table) return {} as Record<string, string>;

  const map: Record<string, string> = {};
  table.body.forEach((row) => {
    if (row.length >= 2) {
      map[row[0]] = row[1];
    }
  });
  return map;
};

const extractSections = (markdown: string) => {
  const normalized = markdown.replace(/\r\n/g, "\n");
  const matches = [...normalized.matchAll(/^##\s+(.+)$/gm)];
  return matches.map((match, index) => {
    const title = match[1].trim();
    const start = match.index! + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index! : normalized.length;
    return {
      title,
      content: normalized.slice(start, end).trim(),
    };
  });
};

const parsePlayerCard = (id: string, markdown: string): ParsedPlayerCard => ({
  id,
  markdown,
  sections: extractSections(markdown),
  profile: extractKeyValueSection(markdown, "## 5）基本プロフィール"),
  summary: extractKeyValueSection(markdown, "## 3）1ページ要約（まずここだけ見ればOK）"),
  schedule: extractKeyValueSection(markdown, "## 2）更新スケジュール（4ヶ月ローテ前提）"),
});

function normalizePredictionPlayerName(value?: string | null) {
  return (value ?? "")
    .normalize("NFKC")
    .replace(/[\s　]/g, "")
    .trim();
}

function normalizePredictionExportValue(value: unknown, fallback = "情報なし") {
  if (typeof value === "string") {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (!normalized) return fallback;
    if (/^(?:--+|—+|未接続|接続待ち|整理中|取得中|反映待ち|当日反映予定|再取得待ち|観測値未提供|並び未取得|天気取得待ち|天気API応答待機中|会場選択待ち|準備中|開催データ参照待ち)$/.test(normalized)) {
      return fallback;
    }
    return normalized;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

function normalizePredictionMaterialValue(value: unknown, fallback = "未取得") {
  const normalized = normalizePredictionExportValue(value, fallback);
  return normalized === "情報なし" ? fallback : normalized;
}

function splitPredictionNoteParts(value?: string | null) {
  return String(value ?? "")
    .split(/\s+\/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function dedupePredictionNoteParts(parts: string[]) {
  return Array.from(new Set(parts.map((part) => part.trim()).filter(Boolean)));
}

function normalizePredictionNoteText(value?: string | null, maxParts = Number.POSITIVE_INFINITY) {
  const parts = dedupePredictionNoteParts(splitPredictionNoteParts(value));
  return parts.slice(0, maxParts).join(" / ");
}

function getPredictionRiderScoreValue(rider: PredictionRiderItem) {
  return rider.totalScore ?? rider.score;
}

function buildPredictionStatsSummaryLine(stats?: PredictionRiderStatsSummaryItem | null) {
  if (!stats) return "未取得";
  if (stats.summary) return stats.summary;
  const starts = normalizePredictionMaterialValue(stats.starts, "");
  const wins = normalizePredictionMaterialValue(stats.wins, "");
  const seconds = normalizePredictionMaterialValue(stats.seconds, "");
  const thirds = normalizePredictionMaterialValue(stats.thirds, "");
  const losses = normalizePredictionMaterialValue(stats.losses, "");
  const parts = [
    starts ? `出走${starts}` : "",
    wins ? `1着${wins}` : "",
    seconds ? `2着${seconds}` : "",
    thirds ? `3着${thirds}` : "",
    losses ? `着外${losses}` : "",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" / ") : "未取得";
}

function buildPredictionStatsCategoryLine(stats?: PredictionRiderStatsSummaryItem | null) {
  const categories = stats?.categories;
  if (!categories) return "";
  const parts = Object.entries(categories)
    .map(([label, value]) => {
      const wins = normalizePredictionMaterialValue(value?.wins, "");
      const seconds = normalizePredictionMaterialValue(value?.seconds, "");
      const thirds = normalizePredictionMaterialValue(value?.thirds, "");
      const losses = normalizePredictionMaterialValue(value?.losses, "");
      if (![wins, seconds, thirds, losses].some(Boolean)) return "";
      return `${label}:${[wins, seconds, thirds, losses].map((item) => item || "-").join("-")}`;
    })
    .filter(Boolean);
  return parts.length > 0 ? parts.join(" / ") : "";
}

function getPredictionKdreamsSectionStatus(availableCount: number, totalCount: number) {
  if (totalCount <= 0) return "未掲載";
  if (availableCount <= 0) return "未掲載";
  if (availableCount >= totalCount) return "取得済み";
  return "一部未掲載";
}

function buildPredictionKdreamsLineupExport(race?: PredictionRaceItem | null) {
  const rawLineup = String(race?.kdreamsLineupRaw ?? race?.lineup ?? "").trim();
  if (!rawLineup) return "KDreams未掲載";

  const parsed = parsePredictionLineupRaw(rawLineup);
  return [
    `- KDreams raw: ${rawLineup}`,
    `- 周回予想: ${parsed.orderLabel || rawLineup}`,
    ...(parsed.groupedGroups.length > 0
      ? [`- ライン区切り: ${parsed.groupedGroups.join(" / ")}`]
      : race?.isGirls && parsed.orderLabel
        ? ["- ライン区切り: 周回予想のみ。ライン区切りなし"]
        : parsed.orderLabel
          ? ["- ライン区切り: KDreams未掲載"]
          : []),
  ].join("\n");
}

function buildPredictionSourceSupplementExport(race?: PredictionRaceItem | null) {
  const sourceNote = String(race?.sourceNote ?? "");
  const oddsNote = String(race?.oddsNote ?? "");
  const lines: string[] = [];
  const racedetailUrl = sourceNote.match(/https?:\/\/keirin\.kdreams\.jp\/[^\s]+/i)?.[0] ?? "";
  const lineFallbackParts = dedupePredictionNoteParts(
    Array.from(sourceNote.matchAll(/lineFallback\s*:\s*([^/]+)(?=\s\/\s|$)/gi)).map((match) => match[1]?.trim() ?? "")
  );
  const oddsParts = dedupePredictionNoteParts(splitPredictionNoteParts(oddsNote))
    .filter((part) => !/netkeirin/i.test(part))
    .slice(0, 3);

  if (racedetailUrl) lines.push(`- kdreams racedetail: ${racedetailUrl}`);
  if (lineFallbackParts.length > 0) lines.push(`- lineFallback: ${lineFallbackParts.join(" / ")}`);
  if (oddsParts.length > 0) lines.push(`- oddsNote: ${oddsParts.join(" / ")}`);

  return lines.length > 0 ? lines.join("\n") : "- 補足ソース: 情報なし";
}

function buildPredictionHistoricalRaceLine(item: PredictionRiderHistoricalRaceItem, index: number) {
  const summary = item.summary
    || [
      item.venue,
      item.date,
      item.raceName,
      item.place,
      item.agari ? `上がり${item.agari}` : "",
    ].filter(Boolean).join(" / ");
  return `- ${index + 1}走前: ${normalizePredictionExportValue(summary, "未取得")}`;
}

function buildPredictionRiderProfileLine(context: PredictionExportRiderContext) {
  if (context.rider.materialMissing) {
    return [
      `### ${context.rider.carNo}番`,
      "- 出走表詳細: KDreams未掲載",
    ].join("\n");
  }

  return [
    `### ${context.rider.carNo}番 ${context.rider.name}`,
    `- 府県: ${normalizePredictionMaterialValue(context.rider.prefecture)}`,
    `- 年齢: ${normalizePredictionMaterialValue(context.rider.age)}`,
    `- 期別: ${normalizePredictionMaterialValue(context.rider.term)}`,
    `- 級班: ${normalizePredictionMaterialValue(context.rider.grade)}`,
    `- 脚質: ${normalizePredictionMaterialValue(context.rider.style)}`,
    `- 競走得点: ${normalizePredictionMaterialValue(getPredictionRiderScoreValue(context.rider))}`,
    `- ギア倍率: ${normalizePredictionMaterialValue(context.rider.gearRatio)}`,
    `- S:${normalizePredictionMaterialValue(context.rider.s)} / B:${normalizePredictionMaterialValue(context.rider.b)} / 逃:${normalizePredictionMaterialValue(context.rider.nige ?? context.rider.escape)} / 捲:${normalizePredictionMaterialValue(context.rider.makuri)} / 差:${normalizePredictionMaterialValue(context.rider.sashi)} / マ:${normalizePredictionMaterialValue(context.rider.mark)}`,
  ].join("\n");
}

function buildPredictionBasicRiderExport(contexts: PredictionExportRiderContext[], race?: PredictionRaceItem | null) {
  const missingCarNos = getMissingDisplayRiderCarNos(race);
  if (contexts.length === 0) {
    const lineupCarNos = extractPredictionLineupCarNos(race);
    const causeParts = [
      Array.isArray(race?.riders) && race.riders.length === 0 ? "public JSON riders欠損" : "",
      /riderFallback:\s*kdreams detail lacks stats/i.test(String(race?.sourceNote ?? "")) ? "KDreams rider parser未反映" : "",
      race ? "materialRace merge不備" : "",
    ].filter(Boolean);
    return [
      "出走表データ未取得。",
      lineupCarNos.length > 0 ? `lineup上の車番: ${lineupCarNos.join(",")}` : "lineup上の車番: 未取得",
      `原因候補: ${causeParts.length > 0 ? causeParts.join(" / ") : "public JSON riders欠損 / materialRace merge不備"}`,
    ].join("\n");
  }
  const missingNote = missingCarNos.length > 0
    ? [`※出走表データに不足があります: 車番${missingCarNos.join(",")}が未取得`, ""]
    : [];
  return [...missingNote, contexts.map((context) => buildPredictionRiderProfileLine(context)).join("\n\n")].join("\n");
}

function buildPredictionRecentPerformanceExport(contexts: PredictionExportRiderContext[]) {
  if (contexts.length === 0) return "KDreams未掲載";
  return contexts.map((context) => {
    const comment = normalizePredictionMaterialValue(context.rider.comment, "");
    const previousRaceSummary = normalizePredictionMaterialValue(context.rider.previousRaceSummary, "");
    const previousRaceLines = (context.rider.previousRaceResults ?? []).map((item, index) => buildPredictionHistoricalRaceLine(item, index));
    const sectionLines = [
      ...(comment ? [`- コメント: ${comment}`] : []),
      ...(previousRaceSummary ? [`- 前回出走要約: ${previousRaceSummary}`] : []),
      ...(previousRaceLines.length > 0 ? ["- 前回出走レース成績:", ...previousRaceLines] : []),
    ];

    return [
      `### ${context.rider.carNo}番 ${context.rider.name}`,
      ...(sectionLines.length > 0 ? sectionLines : ["- KDreams未掲載"]),
    ].join("\n");
  }).join("\n\n");
}

function buildPredictionRecentRaceExport(contexts: PredictionExportRiderContext[], venue?: PredictionVenueItem | null, gradeLabel?: string) {
  void venue;
  void gradeLabel;
  if (contexts.length === 0) return "KDreams未掲載";
  return contexts.map((context) => {
    const yearlySummary = buildPredictionStatsSummaryLine(context.rider.yearlyStats);
    const yearlyCategories = buildPredictionStatsCategoryLine(context.rider.yearlyStats);
    return [
      `### ${context.rider.carNo}番 ${context.rider.name}`,
      context.rider.yearlyStats
        ? `- 年間勝利度数: ${yearlySummary}`
        : "- 年間勝利度数: KDreams未掲載",
      ...(context.rider.yearlyStats && yearlyCategories ? [`- 内訳: ${yearlyCategories}`] : []),
    ].join("\n");
  }).join("\n\n");
}

function buildPredictionMatchupExport(contexts: PredictionExportRiderContext[], race: PredictionRaceItem) {
  void race;
  if (contexts.length === 0) return "KDreams未掲載";
  return contexts.map((context) => {
    const summary = buildPredictionStatsSummaryLine(context.rider.sameTrackYearlyStats);
    const trackLength = normalizePredictionMaterialValue(context.rider.sameTrackYearlyStats?.trackLength, "");
    return [
      `### ${context.rider.carNo}番 ${context.rider.name}`,
      context.rider.sameTrackYearlyStats
        ? `- 同走路年間勝利度数${trackLength ? `(${trackLength})` : ""}: ${summary}`
        : "- 同走路年間勝利度数: KDreams未掲載",
    ].join("\n");
  }).join("\n\n");
}

function buildPredictionTrackAffinityExport(contexts: PredictionExportRiderContext[], venue: PredictionVenueItem) {
  void venue;
  if (contexts.length === 0) return "KDreams未掲載";
  return contexts.map((context) => {
    const localFiveYearSummary = buildPredictionStatsSummaryLine(context.rider.localFiveYearStats);
    return [
      `### ${context.rider.carNo}番 ${context.rider.name}`,
      context.rider.localFiveYearStats
        ? `- 当所5年: ${localFiveYearSummary}`
        : "- 当所5年: KDreams未掲載",
    ].join("\n");
  }).join("\n\n");
}

function buildPredictionDataAnalysisExport(contexts: PredictionExportRiderContext[], venue: PredictionVenueItem, race: PredictionRaceItem, venueSummary: PredictionVenueSummary) {
  void venue;
  void venueSummary;
  const riders = contexts.map((context) => context.rider);
  const totalCount = riders.length;
  const missingCarNos = getMissingDisplayRiderCarNos(race).length;
  const riderDetailCount = riders.filter((rider) => !rider.materialMissing).length;
  const previousRaceCount = riders.filter((rider) => Boolean(String(rider.comment ?? "").trim()) || Boolean(String(rider.previousRaceSummary ?? "").trim()) || (rider.previousRaceResults?.length ?? 0) > 0).length;
  const yearlyCount = riders.filter((rider) => Boolean(rider.yearlyStats)).length;
  const sameTrackCount = riders.filter((rider) => Boolean(rider.sameTrackYearlyStats)).length;
  const localFiveYearCount = riders.filter((rider) => Boolean(rider.localFiveYearStats)).length;

  return [
    `- 出走表詳細: ${totalCount <= 0 ? "未掲載" : missingCarNos > 0 ? "一部未掲載" : getPredictionKdreamsSectionStatus(riderDetailCount, totalCount)}`,
    `- 前回出走レース成績: ${getPredictionKdreamsSectionStatus(previousRaceCount, totalCount)}`,
    `- 年間勝利度数: ${getPredictionKdreamsSectionStatus(yearlyCount, totalCount)}`,
    `- 同走路年間勝利度数: ${getPredictionKdreamsSectionStatus(sameTrackCount, totalCount)}`,
    `- 当所5年: ${getPredictionKdreamsSectionStatus(localFiveYearCount, totalCount)}`,
  ].join("\n");
}

function buildPredictionOddsExport(race: PredictionRaceItem) {
  const normalizedOddsNote = dedupePredictionNoteParts(splitPredictionNoteParts(race.oddsNote))
    .filter((part) => /kdreams/i.test(part))
    .slice(0, 2)
    .join(" / ");
  const previewText = (race.oddsPreview ?? []).length > 0
    ? (race.oddsPreview ?? []).map((item) => `- ${item.tag ?? "オッズ"}: ${item.combo} ${item.odds}`).join("\n")
    : "";
  const popularText = (race.oddsTrifecta ?? []).slice(0, 15)
    .map((item) => `- ${item.combination} ${item.odds.toFixed(1)}倍${item.popularity ? ` / ${item.popularity}人気` : ""}`)
    .join("\n");
  const favoriteText =
    race.favoriteCombination && typeof race.favoriteOdds === "number"
      ? `- 一番人気オッズ: ${race.favoriteCombination} ${race.favoriteOdds.toFixed(1)}倍`
      : "";
  const hasOddsMaterial = Boolean(favoriteText || (race.oddsPreview ?? []).length > 0 || (race.oddsTrifecta ?? []).length > 0);
  const missingStatusText = hasOddsMaterial ? "" : `- ${getPredictionOddsUnavailableLabel(race.oddsNote)}`;
  const blocks = [
    ...(normalizedOddsNote ? [`- オッズ注記: ${normalizedOddsNote}`] : []),
    ...(missingStatusText ? [missingStatusText] : []),
    ...(favoriteText ? [favoriteText] : []),
    ...((race.oddsPreview ?? []).length > 0 ? ["[オッズプレビュー]", previewText] : []),
    ...((race.oddsTrifecta ?? []).length > 0 ? ["[3連単上位15件]", popularText] : []),
  ].filter(Boolean);

  return blocks.length > 0 ? blocks.join("\n\n") : getPredictionOddsUnavailableLabel(race.oddsNote);
}

function buildPredictionMemoExport(race: PredictionRaceItem, memo: string) {
  void memo;
  return buildPredictionSourceSupplementExport(race);
}





export function PlayersPage() {
  const isMobile = useIsMobile();

  useEffect(() => {
    try {
      window.localStorage.removeItem("kq_players_v1");
    } catch (error) {
      console.warn("[PlayersPage] failed to remove legacy player cache", error);
    }
  }, []);

  const navigateToHash = (hash: string) => (event: ReactMouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    window.location.hash = hash;
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "auto" });
    });
  };

  const hubCards = [
    {
      label: "Today",
      title: "今日の出走表・並び・オッズを見る",
      body: "当日の開催とレース単位データを優先表示。選手情報も必要な粒度だけ都度参照します。",
      href: "#races-page",
      accent: "linear-gradient(135deg, #fff5fb 0%, #eef7ff 100%)",
      border: "#e8dff3",
      badge: "RACES",
    },
    {
      label: "Prediction",
      title: "GPT貼り付け用素材を作る",
      body: "予想組み立てに必要な並び、メモ、入力素材を軽量なレース基準で扱います。",
      href: "#prediction-page",
      accent: "linear-gradient(135deg, #f8efff 0%, #eef6ff 100%)",
      border: "#e2daf6",
      badge: "PROMPT",
    },
    {
      label: "Venues",
      title: "会場特徴・バンク傾向を見る",
      body: "脚質相性や風・周長の読みは会場軸で確認。選手一覧を持たずに予想精度へつなげます。",
      href: "#venue-features-page",
      accent: "linear-gradient(135deg, #fff7f8 0%, #f0f7ff 100%)",
      border: "#e7e3f4",
      badge: "BANK DATA",
    },
    {
      label: "Review",
      title: "当日・昨日の結果照合を見る",
      body: "過去レビューと結果照合は localStorage に溜め込まず、必要時に保存ファイルから読み込みます。",
      href: "#review-page",
      accent: "linear-gradient(135deg, #fff4fa 0%, #f5f3ff 48%, #eef8ff 100%)",
      border: "#eadcf3",
      badge: "VERIFY",
    },
  ] as const;

  const statusCards = [
    { label: "localStorage", value: "heavy player cache disabled", tone: "#7a67b8" },
    { label: "primary data path", value: "Today / Prediction / Review", tone: "#5c86c8" },
    { label: "storage policy", value: "public/data を必要時に読む", tone: "#b04a78" },
  ] as const;

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #fff9fe 0%, #f6efff 24%, #eff6ff 58%, #fff3f8 100%)", color: "#111827", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
        <div style={{ position: "absolute", left: "-180px", top: "90px", width: "520px", height: "520px", borderRadius: "50%", background: "radial-gradient(circle, rgba(176,146,246,0.34) 0%, rgba(176,146,246,0.16) 34%, rgba(186,167,236,0) 72%)" }} />
        <div style={{ position: "absolute", right: "-180px", top: "140px", width: "560px", height: "560px", borderRadius: "50%", background: "radial-gradient(circle, rgba(126,196,255,0.30) 0%, rgba(126,196,255,0.14) 36%, rgba(164,206,255,0) 74%)" }} />
        <div style={{ position: "absolute", right: "-120px", bottom: "90px", width: "500px", height: "500px", borderRadius: "50%", background: "radial-gradient(circle, rgba(255,167,205,0.28) 0%, rgba(255,167,205,0.12) 36%, rgba(255,188,211,0) 74%)" }} />
        <div style={{ position: "absolute", left: "30%", bottom: "-220px", width: "620px", height: "620px", borderRadius: "50%", background: "radial-gradient(circle, rgba(218,179,255,0.24) 0%, rgba(218,179,255,0.10) 34%, rgba(214,190,245,0) 76%)" }} />
      </div>

      <SiteHeader activeKey="players" />

      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          left: isMobile ? "8px" : "18px",
          top: isMobile ? "96px" : "92px",
          width: isMobile ? "92px" : "150px",
          height: isMobile ? "92px" : "150px",
          backgroundImage: `url("${toPublicPath("/kurari-charigon-float.png")}")`,
          backgroundSize: "contain",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "left top",
          pointerEvents: "none",
          filter: "drop-shadow(0 16px 26px rgba(130, 93, 193, 0.22))",
          animation: "playersHubFloat 4.8s ease-in-out infinite",
          zIndex: 1,
          opacity: isMobile ? 0.78 : 1,
        }}
      />

      <main style={{ position: "relative", zIndex: 1, maxWidth: PAGE_MAX_WIDTH, margin: "0 auto", padding: isMobile ? "20px 16px 72px" : "32px 24px 84px", display: "grid", gap: "24px" }}>
        <section style={{ position: "relative", overflow: "hidden", borderRadius: isMobile ? "30px" : "42px", border: "1px solid #ebe4f5", background: "linear-gradient(118deg, #fffafd 0%, #f1e7ff 34%, #e9f4ff 66%, #fff0f6 100%)", boxShadow: "0 34px 78px rgba(121, 99, 189, 0.16), 0 12px 28px rgba(80, 136, 214, 0.10)", padding: isMobile ? "24px 20px" : "38px" }}>
          <div style={{ position: "absolute", right: "-60px", top: "-70px", width: "220px", height: "220px", borderRadius: "9999px", background: "radial-gradient(circle, rgba(191,164,255,0.42) 0%, rgba(191,164,255,0.16) 38%, rgba(191,164,255,0) 76%)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", left: "-40px", bottom: "-70px", width: "180px", height: "180px", borderRadius: "9999px", background: "radial-gradient(circle, rgba(255,191,220,0.34) 0%, rgba(255,191,220,0.14) 38%, rgba(255,191,220,0) 76%)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(176,146,246,0.10) 0%, rgba(126,196,255,0.10) 52%, rgba(255,167,205,0.10) 100%)", pointerEvents: "none" }} />

          <div style={{ position: "relative", display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.2fr) minmax(320px, 0.8fr)", gap: isMobile ? "20px" : "28px", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: "11px", fontWeight: 900, letterSpacing: "0.18em", color: "#8c63c7", marginBottom: "12px" }}>PLAYERS HUB</div>
              <h1 style={{ margin: 0, fontSize: isMobile ? "42px" : "64px", lineHeight: 1.02, fontWeight: 900, letterSpacing: "-0.05em", color: "#081224" }}>
                Players Hub
              </h1>
              <div style={{ marginTop: "14px", fontSize: isMobile ? "18px" : "24px", fontWeight: 800, lineHeight: 1.4, color: "#4f5f77" }}>
                選手データは軽量版へ再設計中
              </div>
              <p style={{ margin: "18px 0 0", maxWidth: "760px", fontSize: "15px", lineHeight: 1.95, color: "#526072" }}>
                これまでの選手一覧キャッシュは localStorage 容量を大きく使うため、現在は保存方式を見直しています。
                予想に必要な選手情報は Today / Prediction / Review の各ページで、レース単位のデータとして扱う構成へ寄せています。
              </p>
              <div style={{ marginTop: "20px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
                {[
                  "重い選手一覧キャッシュは停止",
                  "public/data は必要時のみ読込",
                  "同一 origin の容量圧迫を回避",
                ].map((item) => (
                  <span key={item} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "9999px", padding: "8px 12px", fontSize: "11px", fontWeight: 900, color: "#5f6f84", background: "rgba(255,255,255,0.86)", border: "1px solid #e8e2f0", boxShadow: "0 6px 14px rgba(15, 23, 42, 0.03)" }}>
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <aside style={{ borderRadius: "30px", border: "1px solid #e7def3", background: "linear-gradient(180deg, rgba(255,251,254,0.98) 0%, rgba(245,239,255,0.98) 54%, rgba(241,248,255,0.98) 100%)", boxShadow: "0 18px 40px rgba(123, 102, 193, 0.12), 0 10px 24px rgba(73, 151, 224, 0.08)", padding: isMobile ? "18px" : "22px" }}>
              <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.16em", color: "#7a67b8", marginBottom: "12px" }}>STORAGE STATUS</div>
              <div style={{ display: "grid", gap: "12px" }}>
                {statusCards.map((item) => (
                  <div key={item.label} style={{ borderRadius: "22px", border: "1px solid #ecdff5", background: "linear-gradient(180deg, #fffefe 0%, #f8f0ff 56%, #f3f9ff 100%)", padding: "16px", boxShadow: "0 8px 20px rgba(15, 23, 42, 0.04)" }}>
                    <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.16em", color: item.tone, marginBottom: "8px" }}>{item.label}</div>
                    <div style={{ fontSize: isMobile ? "16px" : "18px", fontWeight: 900, lineHeight: 1.45, color: "#081224" }}>{item.value}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: "14px", borderRadius: "20px", border: "1px solid #ebe4f5", background: "rgba(248,245,252,0.9)", padding: "14px 16px", fontSize: "12px", lineHeight: 1.85, color: "#5b6880" }}>
                過去レビュー・過去結果は localStorage に貯めず、public/data 配下の保存ファイルから必要時に読み込みます。
              </div>
            </aside>
          </div>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(4, minmax(0, 1fr))", gap: "16px" }}>
          {hubCards.map((card) => (
            <a
              key={card.label}
              href={card.href}
              onClick={navigateToHash(card.href)}
              style={{
                textDecoration: "none",
                color: "inherit",
                display: "grid",
                gap: "12px",
                borderRadius: "28px",
                border: `1px solid ${card.border}`,
                background: card.accent,
                boxShadow: "0 18px 40px rgba(15, 23, 42, 0.06)",
                padding: isMobile ? "20px" : "22px",
                minHeight: isMobile ? "unset" : "250px",
                transition: "transform 0.18s ease, box-shadow 0.18s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "9999px", padding: "6px 10px", fontSize: "10px", fontWeight: 900, letterSpacing: "0.14em", color: "#6b5aa8", background: "rgba(255,255,255,0.8)", border: "1px solid rgba(224,214,244,0.9)" }}>
                  {card.badge}
                </span>
                <span style={{ fontSize: "20px", color: "#8c63c7" }}>→</span>
              </div>
              <div style={{ fontSize: "24px", lineHeight: 1.2, fontWeight: 900, letterSpacing: "-0.03em", color: "#081224" }}>{card.label}</div>
              <div style={{ fontSize: "15px", lineHeight: 1.65, fontWeight: 800, color: "#3f4d63" }}>{card.title}</div>
              <div style={{ fontSize: "13px", lineHeight: 1.85, color: "#5c6b82" }}>{card.body}</div>
            </a>
          ))}
        </section>

        <section style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.1fr) minmax(320px, 0.9fr)", gap: "18px" }}>
          <article style={{ position: "relative", overflow: "hidden", borderRadius: "32px", border: "1px solid #eadff6", background: "linear-gradient(135deg, rgba(255,248,252,0.98) 0%, rgba(246,241,255,0.98) 52%, rgba(239,248,255,0.98) 100%)", boxShadow: "0 22px 48px rgba(15, 23, 42, 0.06)", padding: isMobile ? "22px 20px" : "28px" }}>
            <div style={{ position: "absolute", right: "-34px", top: "-34px", width: "140px", height: "140px", borderRadius: "50%", background: "radial-gradient(circle, rgba(176,146,246,0.22), rgba(176,146,246,0))" }} />
            <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.16em", color: "#8c63c7", marginBottom: "10px" }}>REDESIGN NOTE</div>
            <h2 style={{ margin: 0, fontSize: isMobile ? "28px" : "34px", lineHeight: 1.15, fontWeight: 900, letterSpacing: "-0.03em", color: "#081224" }}>
              重い選手一覧より、レース単位の判断材料を優先します。
            </h2>
            <p style={{ margin: "16px 0 0", fontSize: "14px", lineHeight: 1.9, color: "#526072" }}>
              このページでは大規模な一覧検索や詳細キャッシュを持たず、導線と運用方針だけをまとめます。
              実際の判断材料は各ページで必要な分だけ読み込むため、同じ GitHub Pages origin を共有する他サイトへの影響も抑えます。
            </p>
            <div style={{ marginTop: "18px", display: "grid", gap: "10px" }}>
              {[
                "PlayersPage では重い選手一覧 index.json を読まない",
                "PlayersPage では選手詳細 markdown を事前 fetch しない",
                "PlayersPage では localStorage に選手一覧や詳細を保存しない",
              ].map((item) => (
                <div key={item} style={{ borderRadius: "18px", border: "1px solid #eadff6", background: "rgba(255,255,255,0.82)", padding: "12px 14px", fontSize: "13px", lineHeight: 1.8, color: "#445267", fontWeight: 700 }}>
                  {item}
                </div>
              ))}
            </div>
          </article>

          <article style={{ borderRadius: "32px", border: "1px solid #e7def3", background: "linear-gradient(180deg, rgba(255,251,254,0.98) 0%, rgba(245,239,255,0.98) 54%, rgba(241,248,255,0.98) 100%)", boxShadow: "0 18px 40px rgba(123, 102, 193, 0.10)", padding: isMobile ? "20px" : "24px" }}>
            <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.16em", color: "#5c86c8", marginBottom: "10px" }}>WHAT CHANGED</div>
            <div style={{ display: "grid", gap: "12px" }}>
              {[
                { title: "Legacy cleanup", body: "旧キー kq_players_v1 は mount 時に removeItem だけ実行し、他キーには触れません。" },
                { title: "Shared origin safe", body: "keirin-datalavo と boatrace-datalavo が同一 origin でも、Players 起因の大容量キャッシュを残しません。" },
                { title: "UI focus", body: "検索 UI の代わりに、Today / Prediction / Venues / Review への導線をエディトリアル寄りに再構成しました。" },
              ].map((item) => (
                <div key={item.title} style={{ borderRadius: "20px", border: "1px solid #ecdff5", background: "linear-gradient(180deg, #fffefe 0%, #f8f0ff 56%, #f3f9ff 100%)", padding: "16px" }}>
                  <div style={{ fontSize: "13px", fontWeight: 900, color: "#081224", marginBottom: "8px" }}>{item.title}</div>
                  <div style={{ fontSize: "13px", lineHeight: 1.8, color: "#56657c" }}>{item.body}</div>
                </div>
              ))}
            </div>
          </article>
        </section>
      </main>

      <style>{`
        @keyframes playersHubFloat {
          0% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
          100% { transform: translateY(0px); }
        }
      `}</style>
    </div>
  );
}

export type SiteHeaderActiveKey =
  | "dashboard"
  | "prediction"
  | "review"
  | "analysis"
  | "races"
  | "venues"
  | "players"
  | "calendar"
  | "mobile";

export type SiteHeaderProps = {
  activeKey: SiteHeaderActiveKey;
};

export function SiteHeader({ activeKey }: SiteHeaderProps) {
  const headerNow = useDashboardNow();
  const isMobile = useIsMobile();
  const headerFontFamily = '"KurariHeaderCraft", "Helvetica Neue", Arial, "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif';
  const clockFontFamily = headerFontFamily;

  const getNavStyle = (key: SiteHeaderActiveKey): CSSProperties => {
    const isActive = activeKey === key;

    return {
      color: isActive ? "white" : "rgba(255,255,255,0.78)",
      textDecoration: "none",
      padding: isMobile ? "8px 11px" : "10px 16px",
      borderRadius: "9999px",
      fontSize: isMobile ? "11px" : "12px",
      fontWeight: 800,
      fontFamily: headerFontFamily,
      border: isActive
        ? "1px solid rgba(255,255,255,0.18)"
        : "1px solid rgba(255,255,255,0.10)",
      background: isActive
        ? "linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.08) 100%)"
        : "rgba(255,255,255,0.02)",
      boxShadow: isActive
        ? "inset 0 1px 0 rgba(255,255,255,0.18), 0 10px 20px rgba(8,18,36,0.14)"
        : "none",
      lineHeight: 1,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "36px",
      whiteSpace: "nowrap",
    };
  };

  const goHashTop = (hash: string) => (event: ReactMouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    window.location.hash = hash;
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "auto" });
    });
  };

return (
  <header
    style={{
      background: "rgba(7, 17, 31, 0.82)",
      color: "white",
      borderBottom: "1px solid rgba(255,255,255,0.08)",
      position: "sticky",
      top: 0,
      zIndex: 20,
      backdropFilter: "blur(16px)",
      boxShadow: "0 16px 40px rgba(8,18,36,0.12)",
      fontFamily: '"Helvetica Neue", Arial, "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif',
      WebkitFontSmoothing: "antialiased",
    }}
  >
      <style>{`
        @font-face {
          font-family: "KurariHeaderCraft";
          src: url("${toPublicPath("/fonts/kurari-header-craftmincho.otf")}") format("opentype");
          font-display: swap;
        }
      `}</style>

      <div
        style={{
          maxWidth: PAGE_MAX_WIDTH,
          margin: "0 auto",
          padding: isMobile ? "12px 16px" : "14px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: isMobile ? "14px" : "24px",
          flexWrap: "wrap",
        }}
      >
        <a
          href="#top"
          onClick={goHashTop("#top")}
          style={{
            color: "white",
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: "12px",
            minWidth: isMobile ? "100%" : "auto",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: "30px",
              height: "30px",
              borderRadius: "9999px",
              background: "linear-gradient(135deg, #c4b5fd 0%, #7c3aed 100%)",
              boxShadow: "0 0 0 5px rgba(196,181,253,0.22)",
              transform: "translateX(-5px)",
              flexShrink: 0,
            }}
          />
          <span style={{ display: "grid", gap: "2px" }}>
            <span
              style={{
                fontSize: isMobile ? "20px" : "24px",
                fontWeight: 950,
                letterSpacing: "0.04em",
                lineHeight: 1.5,
                fontFamily: headerFontFamily,
              }}
            >
              KURARI DATA LAVO
            </span>
            <span
              style={{
                fontSize: "10px",
                fontWeight: 900,
                letterSpacing: "0.18em",
                color: "rgba(255,255,255,0.62)",
                lineHeight: 1,
                fontFamily: headerFontFamily,
              }}
            >
              RACE DATA & ANALYSIS
            </span>
          </span>
        </a>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: isMobile ? "10px" : "16px",
            flexWrap: "wrap",
            justifyContent: isMobile ? "flex-start" : "flex-end",
            width: isMobile ? "100%" : "auto",
          }}
        >
          <div
            style={{
              display: "grid",
              gap: "2px",
              padding: isMobile ? "8px 12px" : "10px 16px",
              borderRadius: "14px",
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.05)",
              color: "rgba(255,255,255,0.86)",
              minWidth: isMobile ? "auto" : "132px",
            }}
          >
            <span
              style={{
                fontSize: "9px",
                fontWeight: 900,
                letterSpacing: "0.16em",
                color: "rgba(255,255,255,0.55)",
                lineHeight: 1,
              }}
            >
              LIVE JST
            </span>
            <span
              style={{
                fontSize: isMobile ? "12px" : "13px",
                fontWeight: 800,
                lineHeight: 1,
                fontFamily: clockFontFamily,
              }}
            >
              {formatDashboardDateInJst(headerNow)}
            </span>
            <span
              style={{
                fontSize: isMobile ? "16px" : "20px",
                fontWeight: 950,
                lineHeight: 1,
                fontFamily: clockFontFamily,
              }}
            >
              {formatDashboardTimeInJst(headerNow)}
            </span>
          </div>

          <nav
            style={{
              display: "flex",
              gap: isMobile ? "8px" : "12px",
              alignItems: "center",
              flexWrap: "wrap",
              width: isMobile ? "100%" : "auto",
              justifyContent: isMobile ? "flex-start" : "flex-end",
            }}
          >
            <a href="#top" onClick={goHashTop("#top")} style={getNavStyle("dashboard")}>
              Dashboard
            </a>
            <a href="#races-page" onClick={goHashTop("#races-page")} style={getNavStyle("races")}>
              Today
            </a>
            <a href="#prediction-page" onClick={goHashTop("#prediction-page")} style={getNavStyle("prediction")}>
              Prediction
            </a>
            <a href="#review-page" onClick={goHashTop("#review-page")} style={getNavStyle("review")}>
              Review
            </a>
            <a href="#venue-features-page" onClick={goHashTop("#venue-features-page")} style={getNavStyle("venues")}>
              Venues
            </a>
            <a href="#players-page" onClick={goHashTop("#players-page")} style={getNavStyle("players")}>
              Players
            </a>
            <a href="#mobile-dashboard" onClick={goHashTop("#mobile-dashboard")} style={getNavStyle("mobile")}>
              Mobile
            </a>
          </nav>
        </div>
      </div>
    </header>
  );
}

function SubPageShell({
  eyebrow,
  title,
  lead,
  heroAccessory,
  heroCardStyle,
  children,
}: {
  eyebrow: string;
  title: string;
  lead: string;
  headerAccessory?: ReactNode;
  heroAccessory?: ReactNode;
  heroCardStyle?: CSSProperties;
  children: ReactNode;
}) {
  const routePrefix = typeof window === "undefined"
    ? "dashboard"
    : window.location.hash.replace(/^#/, "").trim() || "dashboard";

const subPageActiveKey: SiteHeaderActiveKey =
  routePrefix === "prediction-page"
    ? "prediction"
    : routePrefix === "review-page"
      ? "review"
      : routePrefix === "races-page"
        ? "races"
        : routePrefix === "venue-features-page"
          ? "venues"
          : routePrefix === "players-page"
            ? "players"
            : routePrefix === "mobile-dashboard"
              ? "mobile"
              : routePrefix === "calendar"
                ? "calendar"
                : routePrefix === "featured-race"
                  ? "analysis"
                  : "dashboard";

    const isRacesSubPage = subPageActiveKey === "races";

  return (
  <div
    style={{
      minHeight: "100vh",
      background: isRacesSubPage
        ? "linear-gradient(180deg, #fffefe 0%, #f7fbff 42%, #fff8ff 100%)"
        : "linear-gradient(180deg, #fffefe 0%, #fff6fb 48%, #f6fbff 100%)",
      color: "#111827",
      overflowX: "hidden",
      position: "relative",
      isolation: "isolate",
    }}
  >
    <SiteHeader activeKey={subPageActiveKey} />

    {isRacesSubPage && (
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          top: "72px",
          bottom: 0,
          zIndex: 0,
          pointerEvents: "none",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `url("${toPublicPath("/races-page/races-page-bg-keirin-soft-light.png")}")`,
            backgroundRepeat: "no-repeat",
            backgroundSize:"cover",
            backgroundPosition: "center top",
            opacity: 0.95,
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
  "linear-gradient(180deg, rgba(255,255,255,0.00) 0%, rgba(255,255,255,0.03) 42%, rgba(255,255,255,0.08) 100%)",
          }}
        />
      </div>
    )}

      <main
  style={{
    maxWidth: PAGE_MAX_WIDTH,
    margin: "0 auto",
    padding: "56px 24px 120px",
    display: "grid",
    gap: "28px",
    position: "relative",
    zIndex: 1,
  }}
>
        <section style={{ borderRadius: "40px", border: "1px solid #ebe3f3", background: "linear-gradient(135deg, rgba(244,239,252,0.96) 0%, rgba(250,248,253,1) 52%, rgba(255,255,255,1) 100%)", boxShadow: "0 24px 54px rgba(15, 23, 42, 0.07)", padding: "34px", position: "relative", ...heroCardStyle }}>
          {heroAccessory && (
            <div style={{ position: "absolute", top: "26px", right: "30px" }}>
              {heroAccessory}
            </div>
          )}
          <div
  style={{
    fontSize: "11px",
    fontWeight: 950,
    letterSpacing: "0.24em",
    color: "#7c3aed",
    marginBottom: "10px",
    textShadow: "0 1px 6px rgba(255,255,255,0.85)",
  }}
>
  {eyebrow}
</div>
<h1
  style={{
    margin: 0,
    fontSize: "42px",
    lineHeight: 1.12,
    color: "#111827",
    letterSpacing: "-0.03em",
    fontWeight: 950,
    textShadow: "0 2px 8px rgba(255,255,255,0.92)",
  }}
>
  {title}
</h1>
<p
  style={{
    margin: "16px 0 0",
    maxWidth: "920px",
    color: "#334155",
    fontSize: "15px",
    lineHeight: 1.95,
    fontWeight: 700,
    textShadow: "0 1px 6px rgba(255,255,255,0.9)",
  }}
>
  {lead}
</p>
        </section>
        {children}
      </main>
    </div>
  );
}

function PredictionHeaderClock() {
  const dashboardNow = useDashboardNow();
  const isMobile = useIsMobile();

  return (
    <div
      style={{
        display: "grid",
        gap: isMobile ? "1px" : "2px",
        justifyItems: isMobile ? "start" : "end",
        padding: isMobile ? "7px 10px" : "8px 12px",
        borderRadius: "16px",
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
        flexShrink: 0,
        maxWidth: isMobile ? "100%" : undefined,
      }}
    >
      <div
        style={{
          fontSize: isMobile ? "8px" : "9px",
          fontWeight: 900,
          letterSpacing: isMobile ? "0.14em" : "0.18em",
          color: "rgba(214, 201, 245, 0.82)",
        }}
      >
        LIVE JST
      </div>

      <div
        style={{
          fontSize: isMobile ? "10px" : "11px",
          fontWeight: 700,
          color: "rgba(255,255,255,0.72)",
          lineHeight: 1.35,
          whiteSpace: "nowrap",
        }}
      >
        {formatDashboardDateInJst(dashboardNow)}
      </div>

      <div
        style={{
          fontSize: isMobile ? "15px" : "16px",
          fontWeight: 900,
          letterSpacing: isMobile ? "0.06em" : "0.08em",
          color: "rgba(255,255,255,0.96)",
          lineHeight: 1,
          whiteSpace: "nowrap",
        }}
      >
        {formatDashboardTimeInJst(dashboardNow)}
      </div>
    </div>
  );
}


export function PredictionPage() {
  const [isPredictionCompactLayout, setIsPredictionCompactLayout] = useState(() => (typeof window !== "undefined" ? window.innerWidth < 1080 : false));
  const [predictionFeed, setPredictionFeed] = useState<PredictionTodayFeed | null>(null);
  const [predictionError, setPredictionError] = useState<string | null>(null);
  const [selectedVenueId, setSelectedVenueId] = useState("");
  const [selectedRaceNo, setSelectedRaceNo] = useState<number>(1);
  const [predictionMemo, setPredictionMemo] = useState(DEFAULT_PREDICTION_MEMO);
  const [predictionSlotDraft, setPredictionSlotDraft] = useState("");
  const [predictionResultDraft, setPredictionResultDraft] = useState<PredictionResultDraft>(() => createDefaultPredictionResultDraft());
  const [predictionSlotStatus, setPredictionSlotStatus] = useState("");
  const [predictionResultStatus, setPredictionResultStatus] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [savedPredictionSlots, setSavedPredictionSlots] = useState<PredictionSlotMap>(() => loadStoredPredictionSlots());
  const [savedPredictionResults, setSavedPredictionResults] = useState<PredictionResultMap>(() => loadStoredPredictionResults());
  const [hitNotifications, setHitNotifications] = useState<HitNotificationRecord[]>(() => loadHitNotifications());
  const [predictionBankIndex, setPredictionBankIndex] = useState<PredictionVenueBankIndexItem[]>([]);
  const [predictionPlayerIndex, setPredictionPlayerIndex] = useState<PlayerIndexItem[]>([]);
  const [predictionPlayerCards, setPredictionPlayerCards] = useState<Record<string, ParsedPlayerCard | null>>({});
  const [venueSummaryMap, setVenueSummaryMap] = useState<Record<string, PredictionVenueSummary>>({});
  const [weatherByVenue, setWeatherByVenue] = useState<Record<string, PredictionWeatherData | null>>({});
  const [weatherStatusByVenue, setWeatherStatusByVenue] = useState<Record<string, string>>({});
  const [weatherLoadingVenue, setWeatherLoadingVenue] = useState("");
  const hitNotificationLookup = useMemo(
    () => buildHitNotificationLookup(predictionFeed, savedPredictionSlots, savedPredictionResults),
    [predictionFeed, savedPredictionSlots, savedPredictionResults]
  );

  useEffect(() => {
  if (typeof window === "undefined") return;

  const hitRecords = Object.values(savedPredictionResults)
    .map((record) => normalizePredictionResultRecord(record))
    .filter((record) => {
      if (!record.raceKey) return false;
      return record.hitStatus === "hit" || record.autoHitStatus === "hit";
    });

  if (hitRecords.length === 0) return;

  const notifiedKeySet = new Set(loadHitNotificationKeys());
  const currentNotifications = loadHitNotifications();
  const nextNotifications = [...currentNotifications];
  const currentNotificationIdSet = new Set(currentNotifications.map((item) => item.id));

  let hasChange = false;

  hitRecords.forEach((record) => {
    const raceKey = record.raceKey.trim();
    if (!raceKey) return;
    if (notifiedKeySet.has(raceKey)) return;

    const notification = resolveHitNotificationRecord({
      id: `hit:${raceKey}`,
      raceKey,
      date: record.date,
      venue: record.venue,
      raceNumber: record.raceNumber,
      hitBetType: record.hitBetType,
      hitCombination: record.hitCombination,
      payout: record.payout,
      payoutAmountYen: record.payout,
      payoutText: resolveRacePayoutForHit(hitNotificationLookup.get(raceKey)?.race, record.hitBetType, record.hitCombination)?.payout ?? undefined,
      payoutPopularity: parsePayoutPopularity(resolveRacePayoutForHit(hitNotificationLookup.get(raceKey)?.race, record.hitBetType, record.hitCombination)?.popularity),
      investmentYen: record.investment,
      profitLoss: record.profitLoss,
      roiPercent: record.roi,
      createdAt: new Date().toISOString(),
      read: false,
    }, hitNotificationLookup.get(raceKey));

    const existingIndex = nextNotifications.findIndex((item) => item.id === notification.id);

    if (existingIndex >= 0) {
      const currentNotification = nextNotifications[existingIndex];
      const updatedNotification = resolveHitNotificationRecord({
        ...currentNotification,
        ...notification,
        createdAt: currentNotification.createdAt,
        read: currentNotification.read,
      }, hitNotificationLookup.get(raceKey));

      if (JSON.stringify(currentNotification) !== JSON.stringify(updatedNotification)) {
        nextNotifications[existingIndex] = updatedNotification;
        hasChange = true;
      }
    }

    if (existingIndex < 0 && !currentNotificationIdSet.has(notification.id)) {
      nextNotifications.unshift(notification);
      currentNotificationIdSet.add(notification.id);
      hasChange = true;
    }

    notifiedKeySet.add(raceKey);
  });

  if (!hasChange) return;

  const storedNotifications = nextNotifications.slice(0, 200);
  saveHitNotifications(storedNotifications);
  setHitNotifications(storedNotifications);
  saveHitNotificationKeys(Array.from(notifiedKeySet));
}, [hitNotificationLookup, savedPredictionResults]);

useEffect(() => {
  if (typeof window === "undefined") return;

  const refreshHitNotifications = () => {
    setHitNotifications(loadHitNotifications());
  };

  refreshHitNotifications();

  const handleStorage = (event: StorageEvent) => {
    if (!event.key || event.key === HIT_NOTIFICATION_STORAGE_KEY) {
      refreshHitNotifications();
    }
  };

  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener("storage", handleStorage);
  };
}, []);

const todayHitNotifications = useMemo(
  () => hitNotifications.filter((item) => item.date === TODAY),
  [hitNotifications]
);

const resolvedTodayHitNotifications = useMemo(
  () => todayHitNotifications.map((item) => resolveHitNotificationRecord(item, hitNotificationLookup.get(item.raceKey))),
  [hitNotificationLookup, todayHitNotifications]
);

useEffect(() => {
  if (typeof window === "undefined") return;

  const handleResize = () => {
      setIsPredictionCompactLayout(window.innerWidth < 1080);
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    const loadPredictionData = async () => {
      try {
        const [feed, bankIndexResponse] = await Promise.all([
          (async () => {
            let lastError: unknown = null;
            const feeds: PredictionTodayFeed[] = [];
            for (const url of PREDICTION_TODAY_DATA_URL_CANDIDATES) {
              try {
                const response = await fetch(`${url}?t=${Date.now()}`, { cache: "no-store" });
                if (!response.ok) throw new Error(`prediction-feed-${response.status}`);
                feeds.push((await response.json()) as PredictionTodayFeed);
              } catch (error) {
                lastError = error;
              }
            }
            if (feeds.length > 0) return mergePredictionTodayFeedsPreserveRichData(feeds);
            throw lastError ?? new Error("prediction-feed-missing");
          })(),
          fetch(PREDICTION_VENUE_BANK_INDEX_URL, { cache: "force-cache" }),
        ]);

        const bankIndex = bankIndexResponse.ok
          ? (await bankIndexResponse.json()) as PredictionVenueBankIndexItem[]
          : [];

        if (!isActive) return;

        const sortedVenues = [...(feed.venues ?? [])].sort(comparePredictionVenues);

        setPredictionFeed({ ...feed, venues: sortedVenues });
        setPredictionBankIndex(bankIndex);
        setSelectedVenueId((current) => current || sortedVenues[0]?.id || "");
        setPredictionError(null);
      } catch {
        if (!isActive) return;
        setPredictionError("本日の開催データを読み込めませんでした。");
      }
    };

    loadPredictionData();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleStorage = (event: StorageEvent) => {
      if (!event.key || event.key === PREDICTION_RESULT_STORAGE_KEY) {
        setSavedPredictionResults(loadStoredPredictionResults());
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    if (!predictionFeed) return;

    const { nextMap, updatedCount, hitCount, missCount, pendingCount, missingPredictionTextCount } =
      mergeGeneratedResultsIntoSavedPredictionResults(savedPredictionResults, predictionFeed, savedPredictionSlots);

    if (updatedCount === 0) return;

    if (ENABLE_PREDICTION_DEBUG_LOGS) {
  console.info("[PredictionAutoSettle]", {
    updatedCount,
    hitCount,
    missCount,
    pendingCount,
    missingPredictionTextCount,
  });
}
saveStoredPredictionResults(nextMap);
setSavedPredictionResults(nextMap);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [predictionFeed, savedPredictionSlots]);

  // 旧キー → 新キー migration: raceId ベースの正規キーへ統一する
  useEffect(() => {
    if (!predictionFeed) return;

    let slotMigrationCount = 0;
    let resultMigrationCount = 0;
    let nextSlots = prunePredictionSlotsMap(savedPredictionSlots).records;
    let nextResults = prunePredictionResultsMap(savedPredictionResults).records;

    for (const venue of predictionFeed.venues) {
      for (const race of venue.races) {
        const raceId = venue.raceIds?.[race.raceNo - 1] ?? "";
        if (!raceId) continue; // raceId がない場合は正規キーと旧キーが同一なのでスキップ

        const currentKey = buildPredictionSlotRaceKey(predictionFeed.date, venue, race);
        const legacyKey = buildLegacyPredictionSlotRaceKey(predictionFeed.date, venue, race);
        if (currentKey === legacyKey) continue;

        // Slot migration
if (!nextSlots[currentKey] && nextSlots[legacyKey]) {
  nextSlots = { ...nextSlots, [currentKey]: nextSlots[legacyKey] };
  slotMigrationCount += 1;
  if (ENABLE_PREDICTION_DEBUG_LOGS) {
    console.info("[PredictionMigration] slot migrated", {
      from: legacyKey,
      to: currentKey,
    });
  }
}

        // Result migration
        if (!nextResults[currentKey] && nextResults[legacyKey]) {
          nextResults = { ...nextResults, [currentKey]: { ...nextResults[legacyKey], savedAt: new Date().toISOString() } };
          resultMigrationCount += 1;
          if (ENABLE_PREDICTION_DEBUG_LOGS) {
            console.info("[PredictionMigration] result migrated", { from: legacyKey, to: currentKey });
          }
        }
      }
    }

    if (slotMigrationCount > 0) {
      saveStoredPredictionSlots(nextSlots);
      setSavedPredictionSlots(nextSlots);
    }
    if (resultMigrationCount > 0) {
      saveStoredPredictionResults(nextResults);
      setSavedPredictionResults(nextResults);
    }
    if (slotMigrationCount > 0 || resultMigrationCount > 0) {
  if (ENABLE_PREDICTION_DEBUG_LOGS) {
    console.info("[PredictionMigration] done", {
      slotMigrationCount,
      resultMigrationCount,
    });
  }
}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [predictionFeed]);

  useEffect(() => {
    let isActive = true;

    const loadPredictionPlayerIndex = async () => {
      try {
        const response = await fetch(`${PLAYER_INDEX_URL}?v=${Date.now()}`);
        if (!response.ok) throw new Error(`prediction-player-index-${response.status}`);
        const data = (await response.json()) as PlayerIndexItem[];
        if (!isActive) return;
        setPredictionPlayerIndex(data);
      } catch {
        if (!isActive) return;
        setPredictionPlayerIndex([]);
      }
    };

    loadPredictionPlayerIndex();

    return () => {
      isActive = false;
    };
  }, []);

  const selectedVenue = useMemo(
    () => predictionFeed?.venues.find((venue) => venue.id === selectedVenueId) ?? predictionFeed?.venues[0] ?? null,
    [predictionFeed, selectedVenueId]
  );

  useEffect(() => {
    if (!predictionFeed?.venues.length) return;
    if (typeof window === "undefined") return;

    const requestedVenue = window.sessionStorage.getItem(PREDICTION_SELECTED_VENUE_STORAGE_KEY);
    const rawNavigationTarget = window.sessionStorage.getItem(PREDICTION_NAVIGATION_TARGET_STORAGE_KEY);
    const shouldResetScroll = window.sessionStorage.getItem(PREDICTION_SCROLL_RESET_STORAGE_KEY) === "1";
    if (!requestedVenue && !rawNavigationTarget) return;

    let navigationTarget: PredictionNavigationTarget | null = null;
    if (rawNavigationTarget) {
      try {
        navigationTarget = JSON.parse(rawNavigationTarget) as PredictionNavigationTarget;
      } catch {
        navigationTarget = null;
      }
    }

    const normalizedRequestedVenue = normalizePredictionVenueName(navigationTarget?.venueName ?? requestedVenue ?? "");
    const matchedVenue = predictionFeed.venues.find(
      (venue) => normalizePredictionVenueName(venue.venue) === normalizedRequestedVenue || venue.slug === navigationTarget?.venueSlug || venue.slug === requestedVenue
    );

    window.sessionStorage.removeItem(PREDICTION_SELECTED_VENUE_STORAGE_KEY);
    window.sessionStorage.removeItem(PREDICTION_NAVIGATION_TARGET_STORAGE_KEY);
    window.sessionStorage.removeItem(PREDICTION_SCROLL_RESET_STORAGE_KEY);

    if (!matchedVenue) return;

    setSelectedVenueId(matchedVenue.id);
    if (navigationTarget?.raceId) {
      const raceIndex = matchedVenue.raceIds?.findIndex((raceId) => raceId === navigationTarget?.raceId) ?? -1;
      if (raceIndex >= 0) {
        setSelectedRaceNo(matchedVenue.races[raceIndex]?.raceNo ?? matchedVenue.races[0]?.raceNo ?? 1);
      } else if (navigationTarget.raceNumber && matchedVenue.races.some((race) => race.raceNo === navigationTarget.raceNumber)) {
        setSelectedRaceNo(navigationTarget.raceNumber);
      } else {
        setSelectedRaceNo(matchedVenue.races[0]?.raceNo ?? 1);
      }
    } else if (navigationTarget?.raceNumber && matchedVenue.races.some((race) => race.raceNo === navigationTarget.raceNumber)) {
      setSelectedRaceNo(navigationTarget.raceNumber);
    } else {
      setSelectedRaceNo(matchedVenue.races[0]?.raceNo ?? 1);
    }

    if (shouldResetScroll) {
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: "auto" });
      });
    }
  }, [predictionFeed]);

  useEffect(() => {
    if (!selectedVenue) return;
    setSelectedRaceNo((current) => selectedVenue.races.some((race) => race.raceNo === current) ? current : selectedVenue.races[0]?.raceNo ?? 1);
  }, [selectedVenue]);

  const selectedRace = useMemo(
    () => selectedVenue?.races.find((race) => race.raceNo === selectedRaceNo) ?? selectedVenue?.races[0] ?? null,
    [selectedVenue, selectedRaceNo]
  );

  useEffect(() => {
    if (!selectedVenue || predictionBankIndex.length === 0) return;
    const summaryKey = normalizePredictionVenueName(selectedVenue.venue);
    if (venueSummaryMap[summaryKey]) return;

    let isActive = true;

    const loadVenueSummary = async () => {
      const target = findPredictionVenueBankTarget(predictionBankIndex, selectedVenue);
      if (!target) {
        if (isActive) {
          setVenueSummaryMap((current) => ({ ...current, [summaryKey]: MISSING_PREDICTION_VENUE_SUMMARY }));
        }
        return;
      }

      try {
        const response = await fetch(toPublicPath(target.file), { cache: "force-cache" });
        if (!response.ok) throw new Error(`prediction-bank-${response.status}`);
        const markdown = await response.text();
        if (!isActive) return;
        setVenueSummaryMap((current) => ({ ...current, [summaryKey]: parsePredictionVenueSummary(markdown) }));
      } catch {
        if (!isActive) return;
        setVenueSummaryMap((current) => ({ ...current, [summaryKey]: MISSING_PREDICTION_VENUE_SUMMARY }));
      }
    };

    loadVenueSummary();

    return () => {
      isActive = false;
    };
  }, [predictionBankIndex, selectedVenue, venueSummaryMap]);

  useEffect(() => {
    if (!selectedVenue) return;

    let isActive = true;
    setWeatherLoadingVenue(selectedVenue.venue);
    setWeatherStatusByVenue((current) => ({ ...current, [selectedVenue.venue]: "取得中" }));

    fetchPredictionVenueWeather(selectedVenue.venue, {
      isoDate: predictionFeed?.date ?? TODAY,
      raceTime: selectedRace?.time,
    })
      .then((weather) => {
        if (!isActive) return;
        setWeatherByVenue((current) => ({ ...current, [selectedVenue.venue]: weather }));
        setWeatherStatusByVenue((current) => ({ ...current, [selectedVenue.venue]: "" }));
      })
      .catch((error: unknown) => {
        if (!isActive) return;
        setWeatherByVenue((current) => ({ ...current, [selectedVenue.venue]: null }));
        const statusText = error instanceof Error && error.message === "prediction-coordinate-not-found"
          ? "天気情報なし"
          : "天気情報なし";
        setWeatherStatusByVenue((current) => ({ ...current, [selectedVenue.venue]: statusText }));
      })
      .finally(() => {
        if (!isActive) return;
        setWeatherLoadingVenue("");
      });

    return () => {
      isActive = false;
    };
  }, [predictionFeed?.date, selectedRace?.time, selectedVenue]);

  useEffect(() => {
    if (!copyStatus) return;
    const timeoutId = window.setTimeout(() => setCopyStatus(""), 1800);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [copyStatus]);

  useEffect(() => {
    if (!predictionSlotStatus) return;
    const timeoutId = window.setTimeout(() => setPredictionSlotStatus(""), 2200);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [predictionSlotStatus]);

  useEffect(() => {
    if (!predictionResultStatus) return;
    const timeoutId = window.setTimeout(() => setPredictionResultStatus(""), 2200);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [predictionResultStatus]);

  const summaryKey = selectedVenue ? normalizePredictionVenueName(selectedVenue.venue) : "";
  const selectedVenueSummary = summaryKey ? venueSummaryMap[summaryKey] ?? DEFAULT_PREDICTION_VENUE_SUMMARY : DEFAULT_PREDICTION_VENUE_SUMMARY;
  const selectedWeather = selectedVenue ? weatherByVenue[selectedVenue.venue] ?? null : null;
  const selectedWeatherFallbackText = selectedVenue
    ? weatherStatusByVenue[selectedVenue.venue] || (weatherLoadingVenue === selectedVenue.venue ? "取得中" : "天気情報なし")
    : "天気情報なし";

  

  const lineupDisplay = buildPredictionLineupDisplay(selectedRace);
  const leadLabel = compactPredictionGuideText(selectedRace?.lead ?? "") || "未取得";
  const venueMemoLabel = useMemo(() => {
    const candidates = [
      selectedVenueSummary.source === "linked" ? selectedVenueSummary.bankMemo : "",
      selectedVenue?.note,
    ]
      .map((value) => compactPredictionGuideText(value ?? ""))
      .filter(Boolean);
    return candidates[0] ?? "";
  }, [selectedVenue?.note, selectedVenueSummary.bankMemo, selectedVenueSummary.source]);
    const selectedSavedPredictionResult = useMemo(
      () => findPredictionResultRecord(savedPredictionResults, predictionFeed?.date ?? TODAY, selectedVenue, selectedRace).record ?? null,
      [savedPredictionResults, predictionFeed?.date, selectedVenue, selectedRace]
    );

    const weatherCardValue = useMemo(() => {
      const savedWeatherActual = selectedSavedPredictionResult?.weatherActual;

      if (savedWeatherActual) {
        return [
          savedWeatherActual.weather ?? "",
          savedWeatherActual.temperature ?? "",
          savedWeatherActual.referenceText ?? "",
        ]
          .filter(Boolean)
          .join(" / ");
      }

      if (selectedWeather) {
        return [
          selectedWeather.weatherLabel,
          selectedWeather.temperatureText,
          selectedWeather.updatedAtText ? `${selectedWeather.updatedAtText}予報` : "",
        ]
          .filter(Boolean)
          .join(" / ");
      }

      return weatherLoadingVenue === selectedVenue?.venue ? "取得中" : "未取得";
    }, [selectedSavedPredictionResult?.weatherActual, selectedWeather, selectedVenue?.venue, weatherLoadingVenue]);
  const bankGuideItems = useMemo(
    () => [
      { label: "バンク長", value: summarizePredictionGuideText(selectedVenueSummary.bankLength, 42) || (selectedVenueSummary.source === "missing" ? "未登録" : "未取得") },
      { label: "バンク特徴", value: summarizePredictionGuideText(selectedVenueSummary.bankFeature, 60) || (selectedVenueSummary.source === "missing" ? "未登録" : "未取得") },
      { label: "狙いどころ", value: summarizePredictionGuideText(selectedVenueSummary.target, 58) || (selectedVenueSummary.source === "missing" ? "未登録" : "未取得") },
      { label: "注意点", value: summarizePredictionGuideText(selectedVenueSummary.caution, 58) || (selectedVenueSummary.source === "missing" ? "未登録" : "未取得") },
      { label: "会場メモ", value: summarizePredictionGuideText(venueMemoLabel, 58) || (selectedVenueSummary.source === "missing" ? "未登録" : "未取得") },
    ],
    [selectedVenueSummary, venueMemoLabel]
  );
  const selectedVenueGradeLabel = useMemo(
    () => getPredictionGradeDisplayLabel(selectedVenue, predictionFeed?.date ?? TODAY),
    [predictionFeed?.date, selectedVenue]
  );
  const selectedPredictionSlotRaceKey = useMemo(
    () => buildPredictionSlotRaceKey(predictionFeed?.date ?? TODAY, selectedVenue, selectedRace),
    [predictionFeed?.date, selectedRace, selectedVenue]
  );
  const selectedPredictionSlotLookup = useMemo(
    () => findPredictionSlotRecord(savedPredictionSlots, predictionFeed?.date ?? TODAY, selectedVenue, selectedRace),
    [savedPredictionSlots, predictionFeed?.date, selectedVenue, selectedRace]
  );
  const selectedSavedPredictionSlot = selectedPredictionSlotLookup.record ?? null;
  const hydratedPredictionMaterialRace = useMemo(
    () => resolveHydratedRaceForPredictionMaterial({
      feed: predictionFeed,
      selectedVenue,
      selectedRace,
      savedPrediction: selectedSavedPredictionSlot,
    }),
    [predictionFeed, selectedRace, selectedSavedPredictionSlot, selectedVenue]
  );
  const selectedPredictionMaterialRace = useMemo(() => {
    const fullRace = mergeRacePreserveRichData(hydratedPredictionMaterialRace.hydratedRace, selectedRace);
    return mergeRacePreserveRichData(fullRace, selectedSavedPredictionSlot as Partial<PredictionRaceItem> | null);
  }, [hydratedPredictionMaterialRace.hydratedRace, selectedRace, selectedSavedPredictionSlot]);
  const selectedPredictionMaterialVenue = hydratedPredictionMaterialRace.sourceVenue ?? selectedVenue;
  useEffect(() => {
    if (!selectedPredictionMaterialRace) return;
    console.log("[GPT MATERIAL DEBUG]", {
      venue: selectedPredictionMaterialVenue?.venue,
      raceNo: selectedPredictionMaterialRace?.raceNo,
      raceId: getPredictionRaceIdForVenue(selectedPredictionMaterialVenue, selectedPredictionMaterialRace),
      lineup: selectedPredictionMaterialRace.lineup,
      kdreamsLineupRaw: selectedPredictionMaterialRace.kdreamsLineupRaw,
      ridersCount: Array.isArray(selectedPredictionMaterialRace?.riders) ? selectedPredictionMaterialRace.riders.length : 0,
      firstRider: selectedPredictionMaterialRace.riders?.[0],
      oddsCount: Array.isArray(selectedPredictionMaterialRace?.oddsTrifecta) ? selectedPredictionMaterialRace.oddsTrifecta.length : 0,
      sourceNote: selectedPredictionMaterialRace.sourceNote,
      resultStatus: selectedPredictionMaterialRace.resultStatus,
      source: `hydrated generated feed (${hydratedPredictionMaterialRace.reason})`,
    });
  }, [hydratedPredictionMaterialRace.reason, selectedPredictionMaterialRace, selectedPredictionMaterialVenue]);
  const materialRace = selectedPredictionMaterialRace;
  const materialVenue = selectedPredictionMaterialVenue;
  if (ENABLE_PREDICTION_DEBUG_LOGS) {
  console.log("[selectedSavedPredictionResult checkpoint]", selectedSavedPredictionResult);
}
const resolvedPredictionSourceText = useMemo(
    () => resolvePredictionSourceText(selectedPredictionSlotLookup.record?.predictionText ?? "", predictionSlotDraft ?? ""),
    [predictionSlotDraft, selectedPredictionSlotLookup.record?.predictionText]
  );
  const selectedPredictionTickets = useMemo(
    () => extractPredictionBetEntriesWithFallback(resolvedPredictionSourceText),
    [resolvedPredictionSourceText]
  );
  const autoInvestmentFromTickets = useMemo(() => {
    if (selectedPredictionTickets.length === 0) return "";
    return String(selectedPredictionTickets.length * 100);
  }, [selectedPredictionTickets]);
  const predictionAutoHitDetail = useMemo(
    () => resolvePredictionAutoHitDetail(resolvedPredictionSourceText, predictionResultDraft.resultOrder),
    [predictionResultDraft.resultOrder, resolvedPredictionSourceText]
  );
  const selectedGeneratedPredictionResult = useMemo(
    () => resolvePredictionRaceGeneratedResult(predictionFeed?.date ?? TODAY, materialVenue, materialRace, resolvedPredictionSourceText),
    [predictionFeed?.date, resolvedPredictionSourceText, materialRace, materialVenue]
  );


  useEffect(() => {
    setPredictionSlotDraft(selectedPredictionSlotLookup.record?.predictionText ?? "");
  }, [selectedPredictionSlotLookup.record?.predictionText, selectedPredictionSlotRaceKey]);

  useEffect(() => {
    if (ENABLE_PREDICTION_DEBUG_LOGS) {
  console.log("[weatherActual guard check]", {
    selectedPredictionSlotRaceKey,
    selectedSavedPredictionResult,
    selectedWeather,
  });
}
if (!selectedPredictionSlotRaceKey) return;
if (!selectedSavedPredictionResult) return;
if (!selectedSavedPredictionResult.resultOrder) return;
if (!selectedSavedPredictionResult.resultOrder?.trim()) return;
if (!selectedWeather) return;

    const nextWeatherActual = convertPredictionWeatherToResultWeatherActual(selectedWeather);
if (ENABLE_PREDICTION_DEBUG_LOGS) {
  console.log("[nextWeatherActual checkpoint]", nextWeatherActual);
}
if (!nextWeatherActual) return;

  const activeSavedPredictionResults = prunePredictionResultsMap(savedPredictionResults).records;
  const current = activeSavedPredictionResults[selectedPredictionSlotRaceKey];
    if (ENABLE_PREDICTION_DEBUG_LOGS) {
  console.log("[weatherActual save callback]", {
    selectedPredictionSlotRaceKey,
    current,
    hasWeatherActual: Boolean(current?.weatherActual),
  });
}
if (!current) return;
if (current.weatherActual) return;

    const updated = normalizePredictionResultRecord({
      ...current,
      weatherActual: nextWeatherActual,
      savedAt: new Date().toISOString(),
    });

    const next = {
      ...activeSavedPredictionResults,
      [selectedPredictionSlotRaceKey]: updated,
    };

    const resultSaved = saveStoredPredictionResults(next);
    if (!resultSaved) {
      setPredictionResultStatus("保存できませんでした。ブラウザ保存容量の可能性があります");
      return;
    }

    setSavedPredictionResults(next);
  }, [
    savedPredictionResults,
    setPredictionResultStatus,
    selectedPredictionSlotRaceKey,
    selectedSavedPredictionResult,
    selectedWeather,
  ]);

  // Warn when the extracted bet set is incomplete (expected: 3連単×8 + 2車単×2 = 10)
  useEffect(() => {
    if (selectedPredictionTickets.length === 0) return;
const trifectaCount = selectedPredictionTickets.filter((t) => t.betType === "3連単").length;
const exactaCount = selectedPredictionTickets.filter((t) => t.betType === "2車単").length;
if (
  ENABLE_PREDICTION_DEBUG_LOGS &&
  (selectedPredictionTickets.length < 10 || trifectaCount < 8 || exactaCount < 2)
) {
  console.warn("[PredictionBetParser] incomplete bet set", {
    venue: selectedVenue?.venue,
    raceNo: selectedRace?.raceNo,
    trifectaCount,
    exactaCount,
    total: selectedPredictionTickets.length,
    sourcePreview: resolvedPredictionSourceText.slice(0, 800),
  });
}
  }, [resolvedPredictionSourceText, selectedPredictionTickets, selectedRace?.raceNo, selectedVenue?.venue]);

  const applyAutoInvestmentInput = (autoInvestment: string) => {
    if (!autoInvestment) return;
    setPredictionResultDraft((current) => {
      if (current.investmentInputMode === "manual") return current;
      return { ...current, investmentInput: autoInvestment, investmentInputMode: "auto" };
    });
  };

  // Auto-fill investment amount: 100 yen × ticket count, only when field is empty
  useEffect(() => {
    applyAutoInvestmentInput(autoInvestmentFromTickets);
  }, [autoInvestmentFromTickets]);

  useEffect(() => {
    if (ENABLE_PREDICTION_DEBUG_LOGS) {
    console.info("[PredictionInvestmentOverwriteDebug]", {
      venue: selectedVenue?.venue,
      raceNo: selectedRace?.raceNo,
      hasSavedResult: Boolean(selectedSavedPredictionResult),
      hasGeneratedResult: Boolean(selectedGeneratedPredictionResult),
      currentInvestmentInput: predictionResultDraft.investmentInput,
  });
}

    if (!selectedSavedPredictionResult) {
      if (selectedGeneratedPredictionResult && (selectedGeneratedPredictionResult.resultOrder || selectedGeneratedPredictionResult.payout !== undefined)) {
        setPredictionResultDraft((current) => ({
          manualHitStatus: "auto",
          resultOrder: selectedGeneratedPredictionResult.resultOrder,
          investmentInput: current.investmentInput,
          investmentInputMode: current.investmentInputMode,
          payoutInput: selectedGeneratedPredictionResult.payout?.toString() ?? "",
          memo: buildPredictionGeneratedResultMemo(selectedGeneratedPredictionResult, resolvedPredictionSourceText),
        }));
        return;
      }
      setPredictionResultDraft((current) => ({
        ...createDefaultPredictionResultDraft(),
        investmentInput: current.investmentInput,
        investmentInputMode: current.investmentInputMode,
      }));
      return;
    }

    const shouldMergeGeneratedResult = (selectedSavedPredictionResult.manualHitStatus ?? "auto") === "auto"
      && (!selectedSavedPredictionResult.resultOrder || selectedSavedPredictionResult.payout === undefined)
      && !!selectedGeneratedPredictionResult;

    const generatedMemo = buildPredictionGeneratedResultMemo(selectedGeneratedPredictionResult, resolvedPredictionSourceText);

    setPredictionResultDraft((current) => ({
      manualHitStatus: selectedSavedPredictionResult.manualHitStatus ?? "auto",
      resultOrder: shouldMergeGeneratedResult && !selectedSavedPredictionResult.resultOrder
        ? selectedGeneratedPredictionResult?.resultOrder ?? ""
        : selectedSavedPredictionResult.resultOrder,
      investmentInput: selectedSavedPredictionResult.investment !== undefined
        ? selectedSavedPredictionResult.investment.toString()
        : current.investmentInput,
      investmentInputMode: selectedSavedPredictionResult.investmentSource === "manual" ? "manual" : current.investmentInputMode,
      payoutInput: shouldMergeGeneratedResult && selectedSavedPredictionResult.payout === undefined
        ? selectedGeneratedPredictionResult?.payout?.toString() ?? ""
        : selectedSavedPredictionResult.payout?.toString() ?? "",
      memo: shouldMergeGeneratedResult
        ? mergePredictionResultMemo(selectedSavedPredictionResult.memo, generatedMemo)
        : selectedSavedPredictionResult.memo,
    }));
  }, [predictionResultDraft.investmentInput, resolvedPredictionSourceText, selectedGeneratedPredictionResult, selectedPredictionSlotRaceKey, selectedRace?.raceNo, selectedSavedPredictionResult, selectedVenue?.venue]);

  const predictionAutoHitStatus = predictionAutoHitDetail.status;
  const predictionFinalHitStatus = useMemo<PredictionResultHitStatus>(
    () => (predictionResultDraft.manualHitStatus === "auto" ? predictionAutoHitStatus : predictionResultDraft.manualHitStatus),
    [predictionAutoHitStatus, predictionResultDraft.manualHitStatus]
  );
  const predictionResolvedHitDetail = useMemo(() => {
    if (predictionFinalHitStatus !== "hit") return undefined;
    if (predictionAutoHitDetail.status === "hit") return predictionAutoHitDetail;
    if (selectedSavedPredictionResult?.hitStatus === "hit" && selectedSavedPredictionResult.hitBetType && selectedSavedPredictionResult.hitCombination) {
      return {
        status: "hit" as const,
        hitBetType: selectedSavedPredictionResult.hitBetType,
        hitCombination: selectedSavedPredictionResult.hitCombination,
      };
    }
    return undefined;
  }, [predictionAutoHitDetail, predictionFinalHitStatus, selectedSavedPredictionResult]);

  const predictionResultInvestment = useMemo(
    () => parsePredictionResultAmount(predictionResultDraft.investmentInput),
    [predictionResultDraft.investmentInput]
  );
  const normalizedPredictionResultOrder = useMemo(
    () => normalizePredictionTrifectaText(predictionResultDraft.resultOrder),
    [predictionResultDraft.resultOrder]
  );
  const normalizedPredictionResultTop2 = useMemo(
    () => normalizedPredictionResultOrder.split("-").slice(0, 2).join("-"),
    [normalizedPredictionResultOrder]
  );
  const predictionResultOrderParts = useMemo(
    () => normalizedPredictionResultOrder ? normalizedPredictionResultOrder.split("-").filter(Boolean).slice(0, 3) : [],
    [normalizedPredictionResultOrder]
  );
  const predictionResolvedDraftMetrics = useMemo(
    () => resolvePredictionResultMetrics({
      record: {
        resultOrder: normalizedPredictionResultOrder,
        autoHitStatus: predictionAutoHitStatus,
        hitStatus: predictionFinalHitStatus,
        hitBetType: predictionResolvedHitDetail?.hitBetType,
        hitCombination: predictionResolvedHitDetail?.hitCombination,
        investment: predictionResultInvestment,
      },
      race: materialRace,
      predictionText: resolvedPredictionSourceText,
      manualPayout: parsePredictionResultAmount(predictionResultDraft.payoutInput),
    }),
    [normalizedPredictionResultOrder, predictionAutoHitStatus, predictionFinalHitStatus, predictionResolvedHitDetail, predictionResultInvestment, materialRace, resolvedPredictionSourceText, predictionResultDraft.payoutInput]
  );
  const predictionResultPayout = predictionResolvedDraftMetrics.payout;
  const predictionResultProfitLoss = predictionResolvedDraftMetrics.profitLoss;
  const predictionResultRoi = predictionResolvedDraftMetrics.roi;
  const predictionResultTone = useMemo(() => {
    if (predictionFinalHitStatus === "hit") {
      return {
        border: "#d7d9fb",
        background: "linear-gradient(135deg, rgba(238,242,255,0.98) 0%, rgba(247,250,255,0.98) 100%)",
        chipBackground: "#e2e8ff",
        chipText: "#4f46e5",
      };
    }
    if (predictionFinalHitStatus === "miss") {
      return {
        border: "#f0d8df",
        background: "linear-gradient(135deg, rgba(255,247,249,0.98) 0%, rgba(255,252,252,0.98) 100%)",
        chipBackground: "#fbe8ee",
        chipText: "#9f3858",
      };
    }
    return {
      border: "#e5dcf4",
      background: "linear-gradient(135deg, rgba(251,247,255,0.98) 0%, rgba(248,251,255,0.98) 100%)",
      chipBackground: "#f2ecfb",
      chipText: "#7a67b8",
    };
  }, [predictionFinalHitStatus]);
  const predictionProfitTone = useMemo(() => {
    if (predictionResultProfitLoss === undefined) {
      return { background: "rgba(255,255,255,0.88)", border: "#ece4f6", text: "#94a3b8" };
    }
    if (predictionResultProfitLoss > 0) {
      return { background: "linear-gradient(135deg, rgba(240,247,255,0.98) 0%, rgba(246,251,255,0.98) 100%)", border: "#d4defa", text: "#2959b8" };
    }
    if (predictionResultProfitLoss < 0) {
      return { background: "linear-gradient(135deg, rgba(255,246,248,0.98) 0%, rgba(255,250,251,0.98) 100%)", border: "#eed6de", text: "#8f314c" };
    }
    return { background: "rgba(255,255,255,0.92)", border: "#ece4f6", text: "#081224" };
  }, [predictionResultProfitLoss]);
  const predictionResultMetricCards = useMemo(
    () => [
      { label: "投資金額", value: formatPredictionResultYen(predictionResultInvestment), note: "投入した合計", tone: { background: "rgba(255,255,255,0.94)", border: "#ece4f6", text: "#081224" } },
      { label: "払戻金額", value: formatPredictionResultYen(predictionResultPayout), note: "回収した合計", tone: { background: "linear-gradient(135deg, rgba(245,240,255,0.98) 0%, rgba(250,248,255,0.98) 100%)", border: "#ddd2f6", text: "#6947b3" } },
      { label: "収支", value: formatPredictionResultProfitLoss(predictionResultProfitLoss), note: "払戻 - 投資", tone: predictionProfitTone },
      { label: "回収率", value: formatPredictionResultRoi(predictionResultRoi), note: "投資比の回収効率", tone: { background: "linear-gradient(135deg, rgba(248,245,255,0.98) 0%, rgba(255,255,255,0.98) 100%)", border: "#e4daf4", text: "#5f5690" } },
    ],
    [predictionProfitTone, predictionResultInvestment, predictionResultPayout, predictionResultProfitLoss, predictionResultRoi]
  );
  const predictionTicketChipItems = useMemo(
    () => selectedPredictionTickets.map((ticket) => ({
      ...ticket,
      label: `${ticket.index} ${ticket.betType} ${ticket.combination}`,
      hit: ticket.betType === "2車単"
        ? Boolean(normalizedPredictionResultTop2) && ticket.combination === normalizedPredictionResultTop2
        : Boolean(normalizedPredictionResultOrder) && ticket.combination === normalizedPredictionResultOrder,
    })),
    [normalizedPredictionResultOrder, normalizedPredictionResultTop2, selectedPredictionTickets]
  );

  useEffect(() => {
    const lookupKeys = getPredictionSlotKeysForLookup(predictionFeed?.date ?? TODAY, selectedVenue, selectedRace);
    const extractedEntries = extractPredictionBetEntriesWithFallback(resolvedPredictionSourceText);
    const parsedEntries = extractPredictionBetEntries(resolvedPredictionSourceText);
    const extractedExactaCount = parsedEntries.filter((item) => item.betType === "2車単").length;

    // 詳細デバッグログ
    if (ENABLE_PREDICTION_DEBUG_LOGS) {
  console.info("[PredictionTicketsDebug]", {
    venue: selectedVenue?.venue,
    raceNo: selectedRace?.raceNo,
    lookupKeys,
    resolvedSlotKey: selectedPredictionSlotLookup.key,
    hasSavedSlot: Boolean(selectedPredictionSlotLookup.record),
    predictionTextLength: resolvedPredictionSourceText.length,
    hasExactaWord: /2車単/.test(resolvedPredictionSourceText),
    extractedExactaCount,
    extractedEntries,
  });
}

    // predictionText が無い場合の warning
    if (ENABLE_PREDICTION_DEBUG_LOGS && !resolvedPredictionSourceText.trim()) {
  console.warn("[PredictionTickets] missing saved slot predictionText", {
    raceKey: selectedPredictionSlotRaceKey,
    venue: selectedVenue?.venue,
    raceNo: selectedRace?.raceNo,
  });
}

    // 2車単テキストがあるのに抽出 0 件 = parser/入力異常
if (
  ENABLE_PREDICTION_DEBUG_LOGS &&
  /買い目/.test(resolvedPredictionSourceText) &&
  /2車単/.test(resolvedPredictionSourceText) &&
  extractedExactaCount === 0
) {
  console.warn("[PredictionBetParser] exacta section missing after parse", {
    venue: selectedVenue?.venue,
    raceNo: selectedRace?.raceNo,
    entryCount: extractedEntries.length,
    exactaCount: extractedExactaCount,
    preview: resolvedPredictionSourceText.slice(0, 800),
  });
}
  }, [predictionFeed?.date, resolvedPredictionSourceText, selectedPredictionSlotLookup, selectedPredictionSlotRaceKey, selectedRace, selectedVenue]);

  const getPredictionResultCarTone = (carNo: string) => {
    const toneMap: Record<string, { background: string; border: string; text: string }> = {
      "1": { background: "#ffffff", border: "#d6dde7", text: "#111827" },
      "2": { background: "#111827", border: "#111827", text: "#ffffff" },
      "3": { background: "#ef4444", border: "#dc2626", text: "#ffffff" },
      "4": { background: "#2563eb", border: "#1d4ed8", text: "#ffffff" },
      "5": { background: "#facc15", border: "#eab308", text: "#4a3410" },
      "6": { background: "#16a34a", border: "#15803d", text: "#ffffff" },
      "7": { background: "#f97316", border: "#ea580c", text: "#ffffff" },
      "8": { background: "#f9a8d4", border: "#f472b6", text: "#6b2149" },
      "9": { background: "#8b5cf6", border: "#7c3aed", text: "#ffffff" },
    };
    return toneMap[carNo] ?? { background: "#e5e7eb", border: "#cbd5e1", text: "#334155" };
  };
  const predictionSlotMap = savedPredictionSlots;
  const predictionResultMap = useMemo(
    () => buildPredictionResultMapWithBackfilledInvestment(savedPredictionResults, predictionSlotMap),
    [savedPredictionResults, predictionSlotMap]
  );
  const predictionTodaySlotCount = useMemo(
    () => Object.values(predictionSlotMap).filter((slot) => slot.date === TODAY && slot.predictionText?.trim()).length,
    [predictionSlotMap]
  );
  const predictionTodaySummary = useMemo(() => {
    const dailySummaryMap = aggregatePredictionResultsByDate(predictionResultMap);
    return dailySummaryMap[TODAY];
  }, [predictionResultMap]);
  const todayPredictionResultCount = predictionTodaySummary?.savedRaceCount ?? 0;
  const todaySettledPredictionResultCount = predictionTodaySummary?.settledRaceCount ?? 0;
  const todayHitPredictionResultCount = predictionTodaySummary?.hitCount ?? 0;
  const todayPredictionHitRate = predictionTodaySummary?.hitRate;
  const todayPredictionInvestment = predictionTodaySummary?.investment ?? 0;
  const todayPredictionPayout = predictionTodaySummary?.payout ?? 0;

  // slot のみ（result record なし）の投資金額も含めた当日集計
  const todaySavedInvestmentTotal = useMemo(() => {
    let total = todayPredictionInvestment;
    for (const [key, slot] of Object.entries(predictionSlotMap)) {
      if (slot.date !== TODAY) continue;
      if (!slot.predictionText?.trim()) continue;
      if (key in predictionResultMap) continue; // result record 側で既に集計済み
      const ticketCount = extractPredictionBetEntriesWithFallback(slot.predictionText).length;
      if (ticketCount > 0) total += ticketCount * 100;
    }
    return total;
  }, [predictionResultMap, predictionSlotMap, todayPredictionInvestment]);
  const todaySavedProfitLoss = todayPredictionPayout - todaySavedInvestmentTotal;
  const todaySavedRoi: number | undefined = todaySavedInvestmentTotal > 0
    ? (todayPredictionPayout / todaySavedInvestmentTotal) * 100
    : undefined;
  const normalizedSelectedSavedPredictionResult = useMemo(
    () => getNormalizedPredictionResultDisplay(selectedSavedPredictionResult, materialRace, resolvedPredictionSourceText),
    [resolvedPredictionSourceText, materialRace, selectedSavedPredictionResult]
  );
  const predictionHitBadgeDetail = useMemo(() => {
    if (predictionFinalHitStatus !== "hit") return null;
    if (selectedSavedPredictionResult?.hitStatus === "hit" && selectedSavedPredictionResult.hitBetType) {
      return {
        hitBetType: selectedSavedPredictionResult.hitBetType,
        hitCombination: selectedSavedPredictionResult.hitCombination,
      };
    }
    if (predictionAutoHitDetail.status === "hit" && predictionAutoHitDetail.hitBetType) {
      return {
        hitBetType: predictionAutoHitDetail.hitBetType,
        hitCombination: predictionAutoHitDetail.hitCombination,
      };
    }
    return null;
  }, [predictionAutoHitDetail, predictionFinalHitStatus, selectedSavedPredictionResult]);
  const selectedPredictionMaterialRiders = useMemo(
    () => getPredictionMaterialRidersForKeirinRace(selectedPredictionMaterialRace, selectedPredictionMaterialVenue),
    [selectedPredictionMaterialRace, selectedPredictionMaterialVenue]
  );
  const selectedPredictionRiderContexts = useMemo<PredictionExportRiderContext[]>(() => {
    return selectedPredictionMaterialRiders.map((rider) => {
      const normalizedName = normalizePredictionPlayerName(rider.name);
      const indexItem = predictionPlayerIndex.find((item) => normalizePredictionPlayerName(item.name) === normalizedName) ?? null;
      return {
        rider,
        indexItem,
        card: indexItem ? predictionPlayerCards[indexItem.id] ?? null : null,
      };
    });
  }, [predictionPlayerCards, predictionPlayerIndex, selectedPredictionMaterialRiders]);

  useEffect(() => {
    if (selectedPredictionRiderContexts.length === 0) return;

    let isActive = true;
    const unresolved = selectedPredictionRiderContexts.filter((context) => context.indexItem && !(context.indexItem.id in predictionPlayerCards));
    if (unresolved.length === 0) return;

    const loadPredictionPlayerCards = async () => {
      await Promise.all(unresolved.map(async (context) => {
        const indexItem = context.indexItem;
        if (!indexItem) return;
        try {
          const response = await fetch(resolvePlayerCardUrl(indexItem.file), { cache: "force-cache" });
          if (!response.ok) throw new Error(`prediction-player-card-${response.status}`);
          const markdown = await response.text();
          if (!isActive) return;
          setPredictionPlayerCards((current) => ({ ...current, [indexItem.id]: parsePlayerCard(indexItem.id, markdown) }));
        } catch {
          if (!isActive) return;
          setPredictionPlayerCards((current) => ({ ...current, [indexItem.id]: null }));
        }
      }));
    };

    loadPredictionPlayerCards();

    return () => {
      isActive = false;
    };
  }, [predictionPlayerCards, selectedPredictionRiderContexts]);

  const selectedPredictionRiderBasicText = useMemo(
    () => buildPredictionBasicRiderExport(selectedPredictionRiderContexts, selectedPredictionMaterialRace),
    [selectedPredictionMaterialRace, selectedPredictionRiderContexts]
  );
  const selectedPredictionRecentPerformanceText = useMemo(
    () => buildPredictionRecentPerformanceExport(selectedPredictionRiderContexts),
    [selectedPredictionRiderContexts]
  );
  const selectedPredictionRecentRaceText = useMemo(
    () => buildPredictionRecentRaceExport(selectedPredictionRiderContexts, selectedPredictionMaterialVenue, selectedVenueGradeLabel),
    [selectedPredictionMaterialVenue, selectedPredictionRiderContexts, selectedVenueGradeLabel]
  );
  const selectedPredictionMatchupText = useMemo(
    () => buildPredictionMatchupExport(selectedPredictionRiderContexts, selectedPredictionMaterialRace ?? { raceNo: 0, riders: [] }),
    [selectedPredictionMaterialRace, selectedPredictionRiderContexts]
  );
  const selectedPredictionTrackAffinityText = useMemo(
    () => buildPredictionTrackAffinityExport(selectedPredictionRiderContexts, selectedPredictionMaterialVenue ?? { id: "", venue: "", session: "day", races: [] }),
    [selectedPredictionMaterialVenue, selectedPredictionRiderContexts]
  );
  const selectedPredictionDataAnalysisText = useMemo(
    () => buildPredictionDataAnalysisExport(selectedPredictionRiderContexts, selectedPredictionMaterialVenue ?? { id: "", venue: "", session: "day", races: [] }, selectedPredictionMaterialRace ?? { raceNo: 0, riders: [] }, selectedVenueSummary),
    [selectedPredictionMaterialRace, selectedPredictionMaterialVenue, selectedPredictionRiderContexts, selectedVenueSummary]
  );
  const selectedPredictionOddsText = useMemo(
    () => buildPredictionOddsExport(selectedPredictionMaterialRace ?? { raceNo: 0 }),
    [selectedPredictionMaterialRace]
  );
  const selectedPredictionMemoText = useMemo(
    () => buildPredictionMemoExport(selectedPredictionMaterialRace ?? { raceNo: 0 }, predictionMemo),
    [predictionMemo, selectedPredictionMaterialRace]
  );
  const sortedPredictionVenues = useMemo(
    () => [...(predictionFeed?.venues ?? [])].sort(comparePredictionVenues),
    [predictionFeed]
  );

  const todayVenueCount = predictionFeed?.venues.length ?? 0;
  const todayRaceCount = predictionFeed?.venues.reduce((sum, venue) => sum + venue.races.length, 0) ?? 0;
  const readyRaceCount = predictionFeed?.venues.reduce((sum, venue) => sum + venue.races.filter((race) => getPredictionMaterialReady(race)).length, 0) ?? 0;
  const copyableRaceCount = readyRaceCount;
  const reflectedWeatherCount = Object.values(weatherByVenue).filter((item) => item !== null).length;

  const gptExportText = useMemo(() => {
    if (!predictionFeed || !selectedPredictionMaterialVenue || !selectedPredictionMaterialRace) return "対象レースを選択してください。";
    return buildPredictionExportText({
      date: predictionFeed.date,
      venue: selectedPredictionMaterialVenue,
      race: selectedPredictionMaterialRace,
      materialRace: selectedPredictionMaterialRace,
      materialRiders: selectedPredictionMaterialRiders,
      gradeLabel: selectedVenueGradeLabel,
      venueSummary: selectedVenueSummary,
      weather: selectedWeather,
      weatherFallbackText: selectedWeatherFallbackText,
      memo: selectedPredictionMemoText,
      riderBasicText: selectedPredictionRiderBasicText,
      recentPerformanceText: selectedPredictionRecentPerformanceText,
      recentRaceText: selectedPredictionRecentRaceText,
      matchupText: selectedPredictionMatchupText,
      trackAffinityText: selectedPredictionTrackAffinityText,
      dataAnalysisText: selectedPredictionDataAnalysisText,
      oddsText: selectedPredictionOddsText,
    });
  }, [predictionFeed, selectedPredictionDataAnalysisText, selectedPredictionMatchupText, selectedPredictionMaterialRace, selectedPredictionMaterialRiders, selectedPredictionMaterialVenue, selectedPredictionMemoText, selectedPredictionOddsText, selectedPredictionRecentPerformanceText, selectedPredictionRecentRaceText, selectedPredictionRiderBasicText, selectedPredictionTrackAffinityText, selectedVenueGradeLabel, selectedVenueSummary, selectedWeather, selectedWeatherFallbackText]);
  const gptExportLineCount = useMemo(() => gptExportText.split(/\r?\n/).length, [gptExportText]);
  const gptExportCharCount = useMemo(() => gptExportText.length, [gptExportText]);
  const selectedPredictionTargetLabel = selectedVenue && selectedRace ? `${selectedVenue.venue} ${selectedRace.raceNo}R` : "レース選択待ち";
  const selectedPredictionVenueStageLabel = selectedVenue
  ? getPredictionVenueStageLabel(selectedVenue, predictionFeed?.date ?? TODAY)
  : "日程確認中";
  const predictionMaterialStateLabel = !selectedVenue || !selectedRace
    ? "対象未選択"
    : getPredictionMaterialReady(materialRace)
      ? "素材生成済み"
      : "素材補完中";
  const predictionSlotSaveStateLabel = selectedSavedPredictionSlot ? "保存済み" : "未保存";
  const predictionResultLinkStateLabel = selectedGeneratedPredictionResult?.resultStatus === "confirmed"
    ? "結果反映済み"
    : selectedSavedPredictionResult
      ? "手動結果保存済み"
      : "未確定";

  const handlePredictionCopy = async () => {
    try {
      await navigator.clipboard.writeText(gptExportText);
      setCopyStatus("コピーしました");
    } catch {
      setCopyStatus("コピーに失敗しました");
    }
  };

  const handlePredictionDownload = () => {
    if (!predictionFeed || !selectedVenue || !selectedRace) return;
    const blob = new Blob([gptExportText], { type: "text/plain;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${predictionFeed.date}_${selectedVenue.slug ?? normalizePredictionVenueName(selectedVenue.venue)}_${selectedRace.raceNo}R_prediction-material.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.URL.revokeObjectURL(url);
  };

  const downloadPredictionPublicJsonFile = (records: PredictionSlotMap) => {
    const payload = {
      version: 1,
      updatedAt: new Date().toISOString(),
      source: "kurari-prediction-page",
      records,
      recordList: Object.values(records).sort((a, b) => {
        const dateCompare = b.date.localeCompare(a.date);
        if (dateCompare !== 0) return dateCompare;

        const venueCompare = a.venue.localeCompare(b.venue, "ja");
        if (venueCompare !== 0) return venueCompare;

        return a.raceNumber - b.raceNumber;
      }),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });

    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "saved-predictions.generated.json";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.URL.revokeObjectURL(url);
  };

  const handlePredictionPublicJsonExport = () => {
    if (!predictionFeed || !selectedVenue || !selectedRace || !selectedPredictionSlotRaceKey) {
      setPredictionSlotStatus("レースを選択してから公開JSONを書き出してください");
      return;
    }

    try {
      const predictionJson = parsePredictionTextToStructuredPrediction(predictionSlotDraft);

      const record: PredictionSlotRecord = {
        raceKey: selectedPredictionSlotRaceKey,
        raceId: selectedVenue.raceIds?.[selectedRace.raceNo - 1] ?? "",
        venue: selectedVenue.venue,
        date: predictionFeed.date,
        raceNumber: selectedRace.raceNo,
        predictionText: predictionSlotDraft,
        predictionJson,
        savedAt: new Date().toISOString(),
      };

      const activeSavedPredictionSlots = prunePredictionSlotsMap(savedPredictionSlots).records;
      const nextSlots = {
        ...activeSavedPredictionSlots,
        [selectedPredictionSlotRaceKey]: record,
      };

      const slotSaved = saveStoredPredictionSlots(nextSlots);
      if (!slotSaved) {
        setPredictionSlotStatus("公開JSONを書き出せませんでした。ブラウザ保存容量の可能性があります");
        return;
      }

      setSavedPredictionSlots(nextSlots);
      downloadPredictionPublicJsonFile(nextSlots);

      setPredictionSlotStatus(
        `公開JSONを書き出しました：${Object.keys(nextSlots).length}件 / 次に自動push用スクリプトでiPhone側へ反映します`
      );
    } catch (error) {
      console.error("[PredictionPage] public json export failed", error);
      setPredictionSlotStatus("公開JSONを書き出せませんでした。ブラウザ保存容量の可能性があります");
    }
  };

  const handlePredictionSlotSave = () => {
    if (!predictionFeed || !selectedVenue || !selectedRace || !selectedPredictionSlotRaceKey) return;
    if (!predictionSlotDraft.trim()) {
      setPredictionSlotStatus("予想本文を貼り付けてから保存してください");
      return;
    }

    try {
      const activeSavedPredictionSlots = prunePredictionSlotsMap(savedPredictionSlots).records;
      const activeSavedPredictionResults = prunePredictionResultsMap(savedPredictionResults).records;
      const savedPredictionTickets = extractPredictionBetEntriesWithFallback(predictionSlotDraft);
      const autoInvestmentForSavedPrediction = savedPredictionTickets.length > 0
        ? String(savedPredictionTickets.length * 100)
        : "";
      const record: PredictionSlotRecord = {
        raceKey: selectedPredictionSlotRaceKey,
        raceId: selectedVenue.raceIds?.[selectedRace.raceNo - 1] ?? "",
        venue: selectedVenue.venue,
        date: predictionFeed.date,
        raceNumber: selectedRace.raceNo,
        predictionText: predictionSlotDraft,
        predictionJson: parsePredictionTextToStructuredPrediction(predictionSlotDraft),
        savedAt: new Date().toISOString(),
      };
      const nextSlots = {
        ...activeSavedPredictionSlots,
        [selectedPredictionSlotRaceKey]: record,
      };

      const slotSaved = saveStoredPredictionSlots(nextSlots);
      if (!slotSaved) {
        setPredictionSlotStatus("保存できませんでした。ブラウザ保存容量の可能性があります");
        return;
      }

      setSavedPredictionSlots(nextSlots);

      // 投資金額を KPI に即時反映するため、result record に investment を upsert する
      // 分岐: 1) 既存なし→新規作成, 2) pending→auto で上書き, 3) 確定済み→investmentSource="auto" のときのみ更新
      if (savedPredictionTickets.length > 0) {
        const calculatedInvestment = savedPredictionTickets.length * 100;
        const raceIdForResult = selectedVenue.raceIds?.[selectedRace.raceNo - 1] ?? "";
        const existing = activeSavedPredictionResults[selectedPredictionSlotRaceKey];
        let nextRecord: PredictionResultRecord | undefined;

        if (!existing) {
          nextRecord = normalizePredictionResultRecord({
            raceKey: selectedPredictionSlotRaceKey,
            raceId: raceIdForResult,
            venue: selectedVenue.venue,
            date: predictionFeed.date,
            raceNumber: selectedRace.raceNo,
            resultOrder: "",
            autoHitStatus: "pending" as const,
            hitStatus: "pending" as const,
            investment: calculatedInvestment,
            investmentSource: "auto",
            memo: "",
            savedAt: new Date().toISOString(),
          });
        } else if (existing.hitStatus === "pending") {
          nextRecord = normalizePredictionResultRecord({
            ...existing,
            investment: calculatedInvestment,
            investmentSource: "auto",
          });
        } else if (existing.investmentSource !== "manual") {
          nextRecord = normalizePredictionResultRecord({
            ...existing,
            investment: calculatedInvestment,
            investmentSource: "auto",
          });
        }

        if (nextRecord) {
          const nextMap = {
            ...activeSavedPredictionResults,
            [selectedPredictionSlotRaceKey]: nextRecord,
          };
          const resultSaved = saveStoredPredictionResults(nextMap);
          if (!resultSaved) {
            setPredictionSlotStatus("保存できませんでした。ブラウザ保存容量の可能性があります");
            return;
          }
          setSavedPredictionResults(nextMap);
        }
      }

      applyAutoInvestmentInput(autoInvestmentForSavedPrediction);
      setPredictionSlotStatus("保存済み");
    } catch (error) {
      console.error("[PredictionPage] slot save failed", error);
      setPredictionSlotStatus("保存できませんでした。ブラウザ保存容量の可能性があります");
    }
  };

  const handlePredictionSlotClear = () => {
    if (!selectedPredictionSlotRaceKey) return;
    const next = { ...prunePredictionSlotsMap(savedPredictionSlots).records };
    delete next[selectedPredictionSlotRaceKey];
    const slotSaved = saveStoredPredictionSlots(next);
    if (!slotSaved) {
      setPredictionSlotStatus("保存できませんでした。ブラウザ保存容量の可能性があります");
      return;
    }
    setSavedPredictionSlots(next);
    setPredictionSlotDraft("");
    setPredictionSlotStatus("削除しました");
  };

  const handlePredictionResultSave = () => {
    if (!predictionFeed || !selectedVenue || !selectedRace || !selectedPredictionSlotRaceKey) return;
    const normalizedPayout = predictionResolvedDraftMetrics.payout;
    const normalizedProfitLoss = predictionResolvedDraftMetrics.profitLoss;
    const normalizedRoi = predictionResolvedDraftMetrics.roi;
    const normalizedHitDetail = predictionResolvedHitDetail;
    if (predictionResultInvestment === undefined) {
    if (ENABLE_PREDICTION_DEBUG_LOGS) {
    console.warn("[PredictionPage] investment missing", {
      venue: selectedVenue.venue,
      raceNumber: selectedRace.raceNo,
      raceKey: selectedPredictionSlotRaceKey,
    });
  }
}
const isPending = predictionFinalHitStatus === "pending";
const record = normalizePredictionResultRecord({
      raceKey: selectedPredictionSlotRaceKey,
      raceId: selectedVenue.raceIds?.[selectedRace.raceNo - 1] ?? "",
      venue: selectedVenue.venue,
      date: predictionFeed.date,
      raceNumber: selectedRace.raceNo,
      resultOrder: normalizePredictionTrifectaText(predictionResultDraft.resultOrder),
      autoHitStatus: predictionAutoHitStatus,
      manualHitStatus: predictionResultDraft.manualHitStatus === "auto" ? undefined : predictionResultDraft.manualHitStatus,
      hitStatus: predictionFinalHitStatus,
      hitBetType: normalizedHitDetail?.hitBetType,
      hitCombination: normalizedHitDetail?.hitCombination,
      investment: predictionResultInvestment,
      investmentSource: predictionResultDraft.investmentInputMode === "manual" ? "manual" : "auto",
      payout: isPending ? undefined : normalizedPayout,
      profitLoss: isPending ? undefined : normalizedProfitLoss,
      roi: isPending ? undefined : normalizedRoi,
      memo: predictionResultDraft.memo,
      savedAt: new Date().toISOString(),
    });
    const activeSavedPredictionResults = prunePredictionResultsMap(savedPredictionResults).records;
    const nextMap = {
      ...activeSavedPredictionResults,
      [selectedPredictionSlotRaceKey]: record,
    };
    const resultSaved = saveStoredPredictionResults(nextMap);
    if (!resultSaved) {
      setPredictionResultStatus("保存できませんでした。ブラウザ保存容量の可能性があります");
      return;
    }
    setSavedPredictionResults(nextMap);
    setPredictionResultStatus("保存済み");
  };

  const handlePredictionResultClear = () => {
    if (!selectedPredictionSlotRaceKey) return;
    const nextMap = { ...prunePredictionResultsMap(savedPredictionResults).records };
    delete nextMap[selectedPredictionSlotRaceKey];
    const resultSaved = saveStoredPredictionResults(nextMap);
    if (!resultSaved) {
      setPredictionResultStatus("保存できませんでした。ブラウザ保存容量の可能性があります");
      return;
    }
    setSavedPredictionResults(nextMap);
    setPredictionResultDraft(createDefaultPredictionResultDraft());
    setPredictionResultStatus("削除しました");
  };

  const predictionExportFileName = predictionFeed && selectedVenue && selectedRace
    ? `${predictionFeed.date}_${selectedVenue.slug ?? normalizePredictionVenueName(selectedVenue.venue)}_${selectedRace.raceNo}R_prediction-material.txt`
    : "prediction-material.txt";

  const handlePredictionVenueSelect = (venueId: string) => {
    setSelectedVenueId(venueId);
  };

  const handlePredictionRaceSelect = (raceNo: number) => {
    setSelectedRaceNo(raceNo);
  };

  return (
    <SubPageShell
      eyebrow="PREDICTION"
      title="今日の1R素材を整える"
      lead="会場特徴・天気・出走表・並び・オッズをまとめ、GPTへそのまま渡せる予想素材を整えるページです。"
      heroCardStyle={{
  position: "relative",
  zIndex: 5,
  background: "#ffffff",
  border: "1px solid #ded6f2",
  boxShadow: "0 22px 58px rgba(15, 23, 42, 0.09)",
  backdropFilter: "none",
  WebkitBackdropFilter: "none",
  opacity: 1,
}}
      headerAccessory={<PredictionHeaderClock />}
    >
      <style>{`
        @keyframes predictionPageFloatCheer {
          0% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
          100% { transform: translateY(0px); }
        }
      `}</style>
      <div
        style={{
          position: "relative",
          isolation: "isolate",
          borderRadius: "42px",
        }}
      >
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          top: isPredictionCompactLayout ? "88px" : "72px",
          bottom: 0,
          zIndex: 0,
          pointerEvents: "none",
          overflow: "hidden",
        }}
      >
<div
  style={{
    position: "absolute",
    inset: 0,
    backgroundImage: `url("${toPublicPath("/prediction-page/prediction-page-editorial-bg-soft-lavender.png")}")`,
    backgroundRepeat: "no-repeat",
    backgroundSize: isPredictionCompactLayout ? "50% auto" : "100% auto",
    backgroundPosition: isPredictionCompactLayout ? "center top" : "center top",
    opacity: 0.66,
  }}
/>
<div
  style={{
    position: "absolute",
    inset: 0,
    background: "linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.08) 38%, rgba(255,255,255,0.18) 100%)",
  }}
/>
      </div>
 
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "grid",
          gap: "18px",
          borderRadius: "36px",
          padding: isPredictionCompactLayout ? "8px" : "10px",
        }}
      >
      {predictionError ? (
        <section style={{ borderRadius: "32px", border: "1px solid #f2d6de", background: "linear-gradient(180deg, #fff7f9 0%, #ffffff 100%)", boxShadow: "0 18px 42px rgba(176, 74, 120, 0.06)", padding: "24px", color: "#9f1239", fontWeight: 700 }}>
          {predictionError}
        </section>
      ) : (
        <>
          <section style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "16px" }}>
            {[
              { label: "TODAY VENUES", value: `${todayVenueCount}会場`, sub: "今日の開催会場数" },
              { label: "TARGET RACES", value: `${todayRaceCount}R`, sub: "素材確認の対象レース数" },
              { label: "READY MATERIAL", value: `${readyRaceCount}R`, sub: "並び・選手・オッズが揃う仮基準" },
              { label: "COPY READY", value: `${copyableRaceCount}R`, sub: weatherLoadingVenue ? `${weatherLoadingVenue} の天気取得中` : `天気反映 ${reflectedWeatherCount}/${todayVenueCount || 0}会場` },
            ].map((item) => (
              <article key={item.label} style={{ borderRadius: "28px", border: "1px solid #ebe3f3", background: "linear-gradient(180deg, #ffffff 0%, #fcfafe 100%)", boxShadow: "0 16px 34px rgba(15, 23, 42, 0.05)", padding: "20px 22px" }}>
                <div style={{ fontSize: "11px", fontWeight: 900, letterSpacing: "0.18em", color: "#8c63c7", marginBottom: "10px" }}>{item.label}</div>
                <div style={{ fontSize: "30px", fontWeight: 900, color: "#081224", lineHeight: 1.05, marginBottom: "8px" }}>{item.value}</div>
                <div style={{ fontSize: "12px", color: "#64748b", lineHeight: 1.75 }}>{item.sub}</div>
              </article>
            ))}
          </section>

          <section style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "16px" }}>
            {[
              { label: "TODAY RESULTS", value: `${predictionTodaySlotCount}R`, sub: `予想保存 ${predictionTodaySlotCount}R / 結果保存 ${todayPredictionResultCount}R` },
              { label: "HIT RATE", value: formatPredictionResultRoi(todayPredictionHitRate), sub: todaySettledPredictionResultCount > 0 ? `結果保存済み ${todaySettledPredictionResultCount}R 中 ${todayHitPredictionResultCount}R 的中` : "結果保存済みレースなし" },
              { label: "ROI", value: formatPredictionResultRoi(todaySavedRoi), sub: `保存済み投資 ${formatPredictionResultYen(todaySavedInvestmentTotal)} / 払戻 ${formatPredictionResultYen(todayPredictionPayout)}` },
              { label: "PROFIT", value: formatPredictionResultProfitLoss(todaySavedProfitLoss), sub: "当日保存済み結果データを集計" },
            ].map((item) => (
              <article key={item.label} style={{ borderRadius: "28px", border: "1px solid #ebe3f3", background: "linear-gradient(180deg, #ffffff 0%, #fcfafe 100%)", boxShadow: "0 16px 34px rgba(15, 23, 42, 0.05)", padding: "20px 22px" }}>
                <div style={{ fontSize: "11px", fontWeight: 900, letterSpacing: "0.18em", color: "#8c63c7", marginBottom: "10px" }}>{item.label}</div>
                <div style={{ fontSize: "30px", fontWeight: 900, color: "#081224", lineHeight: 1.05, marginBottom: "8px" }}>{item.value}</div>
                <div style={{ fontSize: "12px", color: "#64748b", lineHeight: 1.75 }}>{item.sub}</div>
              </article>
            ))}
          </section>

          {resolvedTodayHitNotifications.length > 0 && (
            <section
              style={{
                borderRadius: "30px",
                border: "1px solid #e6ddf4",
                background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(250,247,253,0.98) 100%)",
                boxShadow: "0 16px 34px rgba(15, 23, 42, 0.05)",
                padding: "22px 24px",
                display: "grid",
                gap: "14px",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: "11px", fontWeight: 900, letterSpacing: "0.2em", color: "#8c63c7", marginBottom: "8px" }}>
                    HIT NOTIFICATIONS
                  </div>
                  <h3 style={{ margin: 0, fontSize: "22px", fontWeight: 900, color: "#081224", letterSpacing: "-0.02em" }}>
                    的中通知ログ
                  </h3>
                  <p style={{ margin: "8px 0 0", fontSize: "12px", lineHeight: 1.8, color: "#64748b" }}>
                    的中したレースを自動で記録しています。将来のスマホ通知・Slack通知・PWA通知の土台になります。
                  </p>
                </div>

                <div
                  style={{
                    borderRadius: "9999px",
                    padding: "8px 12px",
                    background: "#f2ecfb",
                    border: "1px solid #e0d6f4",
                    color: "#6d3fc2",
                    fontSize: "12px",
                    fontWeight: 900,
                    whiteSpace: "nowrap",
                  }}
                >
                  {resolvedTodayHitNotifications.length}件
                </div>
              </div>

<>
  <style>{`
    @keyframes hitNotificationTickerScroll {
      0% {
        transform: translateX(0);
      }
      100% {
        transform: translateX(-50%);
      }
    }

    .hit-notification-ticker-track {
      animation: hitNotificationTickerScroll 90s linear infinite;
    }

    .hit-notification-ticker:hover .hit-notification-ticker-track {
      animation-play-state: paused;
    }

    @media (prefers-reduced-motion: reduce) {
      .hit-notification-ticker-track {
        animation: none;
      }
    }
  `}</style>

  <div
    className="hit-notification-ticker"
    style={{
      overflow: "hidden",
      borderRadius: "26px",
      border: "1px solid #ebe3f3",
      background: "linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(250,247,253,0.96) 100%)",
      padding: "12px",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.86)",
    }}
  >
    <div
      className="hit-notification-ticker-track"
      style={{
        display: "flex",
        gap: "12px",
        width: "max-content",
        willChange: "transform",
      }}
    >
      {[...resolvedTodayHitNotifications.slice(0, 12), ...resolvedTodayHitNotifications.slice(0, 12)].map((item, index) => {
        const isProfitPlus = (item.profitLoss ?? 0) > 0;
        const isProfitMinus = (item.profitLoss ?? 0) < 0;
        const hitTone = getPredictionHitBadgeTone(item.hitBetType);

        return (
          <article
            key={`${item.id}-${index}`}
            style={{
              width: "330px",
              flex: "0 0 auto",
              borderRadius: "22px",
              border: "1px solid #e6def3",
              background: "linear-gradient(180deg, #ffffff 0%, #fbf8ff 100%)",
              padding: "13px 14px",
              display: "grid",
              gap: "9px",
              boxShadow: "0 12px 26px rgba(15, 23, 42, 0.045)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                <span
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "9999px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "linear-gradient(135deg, #f2ecfb 0%, #e9ddff 100%)",
                    border: "1px solid #ded0f6",
                    fontSize: "16px",
                    flexShrink: 0,
                    boxShadow: "0 8px 18px rgba(122,103,184,0.10)",
                  }}
                >
                  🎯
                </span>

                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: 900,
                      color: "#081224",
                      lineHeight: 1.35,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {item.venue} {item.raceNumber}R 的中
                  </div>
                  <div
                    style={{
                      marginTop: "2px",
                      fontSize: "10px",
                      color: "#64748b",
                      lineHeight: 1.5,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {item.date} / {formatPredictionSlotSavedAt(item.createdAt)}
                  </div>
                </div>
              </div>

              <span
                style={{
                  borderRadius: "9999px",
                  padding: "5px 9px",
                  fontSize: "10px",
                  fontWeight: 900,
                  background: hitTone.background,
                  color: hitTone.text,
                  border: `1px solid ${hitTone.border}`,
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                {item.hitBetType ?? "的中"}
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
              <span
                style={{
                  borderRadius: "9999px",
                  padding: "5px 9px",
                  fontSize: "11px",
                  fontWeight: 900,
                  background: "#f6f0ff",
                  color: "#633db2",
                  border: "1px solid #e2d4fb",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: "150px",
                }}
              >
                {item.hitCombination ?? "組み合わせ未取得"}
              </span>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "11px",
                  fontWeight: 900,
                  whiteSpace: "nowrap",
                }}
              >
                <span style={{ color: "#475569" }}>
                  払戻 {formatPredictionResultYen(item.payout)}
                </span>
                <span
                  style={{
                    color: isProfitPlus ? "#2563eb" : isProfitMinus ? "#b45309" : "#64748b",
                  }}
                >
                  収支 {formatPredictionResultProfitLoss(item.profitLoss)}
                </span>
              </div>
            </div>

            {item.warningNote ? (
              <div
                style={{
                  fontSize: "10px",
                  color: "#8a5a00",
                  lineHeight: 1.45,
                  background: "rgba(255,247,214,0.75)",
                  border: "1px solid #f4d99b",
                  borderRadius: "10px",
                  padding: "6px 8px",
                }}
              >
                {item.warningNote}
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  </div>
</>
            </section>
          )}

          <section style={{ borderRadius: "38px", border: "1px solid #ebe3f3", background: "linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(250,243,255,0.98) 52%, rgba(244,250,255,0.98) 100%)", boxShadow: "0 22px 46px rgba(15, 23, 42, 0.06)", padding: "30px 30px 30px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "20px", alignItems: "start", marginBottom: "24px" }}>
              <div>
                <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.16em", color: "#8c63c7", marginBottom: "8px" }}>QUICK SELECT</div>
                <div style={{ fontSize: "14px", color: "#526072", lineHeight: 1.8 }}>会場とレースを選び、そのまま下の予想素材確認へ進めます。</div>
              </div>
              <div style={{ justifySelf: "end", borderRadius: "24px", border: "1px solid #eadcf5", background: "linear-gradient(180deg, rgba(255,255,255,0.94) 0%, rgba(249,245,254,0.93) 100%)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7)", padding: "15px 16px", minWidth: "190px" }}>
                <div style={{ fontSize: "9px", fontWeight: 900, letterSpacing: "0.16em", color: "#8c63c7", marginBottom: "6px" }}>CURRENT</div>
                <div style={{ fontSize: "16px", fontWeight: 900, color: "#081224", lineHeight: 1.25 }}>{selectedVenue?.venue ?? "会場選択待ち"}{selectedRace ? ` / ${selectedRace.raceNo}R` : ""}</div>
                <div style={{ marginTop: "4px", fontSize: "12px", color: "#7b889b", lineHeight: 1.7 }}>{selectedRace?.time ? `発走 ${selectedRace.time}` : "レース選択待ち"}</div>
              </div>
            </div>

            <div style={{ display: "grid", gap: "20px" }}>
              <div style={{ display: "grid", gap: "14px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                  <div style={{ fontSize: "9px", fontWeight: 900, letterSpacing: "0.18em", color: "#7b8a9d" }}>VENUE</div>
                  <div style={{ fontSize: "11px", color: "#7b889b", fontWeight: 700 }}>グレードと時間帯を見ながら、今日の会場をすばやく選択</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "12px" }}>
                  {sortedPredictionVenues.map((venue) => {
                    const venueStageLabel = getPredictionVenueStageLabel(venue, predictionFeed?.date ?? TODAY);
                    const isActive = venue.id === selectedVenue?.id;
                    const gradeForBadge = resolvePredictionVenueGradeBadge(venue, predictionFeed?.date ?? TODAY);
                    const tone = getGradeBadgeTone(gradeForBadge);
                    const gradeLabel = getPredictionGradeDisplayLabel(venue, predictionFeed?.date ?? TODAY);
                    const sessionBadge = getPredictionSessionBadge(venue);
                    <span
  style={{
    display: "inline-flex",
    alignItems: "center",
    width: "fit-content",
    borderRadius: "999px",
    border: "1px solid rgba(196, 181, 253, 0.75)",
    background: "linear-gradient(180deg, rgba(250,247,255,0.98) 0%, rgba(243,238,255,0.96) 100%)",
    color: "#6d4fc2",
    padding: "5px 9px",
    fontSize: "10px",
    fontWeight: 900,
    letterSpacing: "0.04em",
    boxShadow: "0 6px 14px rgba(124, 96, 196, 0.08)",
  }}
>
  {venueStageLabel}
</span>
                    const sessionTone = getPredictionSessionBadgeTone(venue);
                    const representativeRace = isActive ? selectedRace?.raceNo ?? venue.races[0]?.raceNo : venue.races[0]?.raceNo;
                    const representativeTime = isActive ? selectedRace?.time ?? venue.races[0]?.time : venue.races[0]?.time;

                    return (
                      <button
                        key={`quick-venue-${venue.id}`}
                        type="button"
                        onClick={() => handlePredictionVenueSelect(venue.id)}
                        style={{ textAlign: "left", borderRadius: "24px", border: isActive ? "1px solid #cdb8ef" : "1px solid #ebe3f3", background: isActive ? "linear-gradient(135deg, rgba(250,245,255,0.98) 0%, rgba(244,239,255,0.98) 52%, rgba(241,247,255,0.98) 100%)" : "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(252,248,254,0.96) 100%)", padding: "16px 16px 15px", cursor: "pointer", boxShadow: isActive ? "0 14px 26px rgba(122,103,184,0.10)" : "0 8px 18px rgba(15, 23, 42, 0.04)", transition: "transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease" }}
                        onMouseEnter={(event) => {
                          event.currentTarget.style.transform = "translateY(-2px)";
                          event.currentTarget.style.boxShadow = isActive ? "0 16px 28px rgba(122,103,184,0.12)" : "0 10px 22px rgba(15, 23, 42, 0.06)";
                        }}
                        onMouseLeave={(event) => {
                          event.currentTarget.style.transform = "translateY(0)";
                          event.currentTarget.style.boxShadow = isActive ? "0 14px 26px rgba(122,103,184,0.10)" : "0 8px 18px rgba(15, 23, 42, 0.04)";
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px", marginBottom: "12px" }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: "18px", fontWeight: 900, color: "#081224", lineHeight: 1.2, marginBottom: "2px" }}>{venue.venue}</div>
                            <div style={{ fontSize: "11px", color: "#7b889b", fontWeight: 700, lineHeight: 1.6 }}>{venue.races.length}R 開催</div>
                          </div>
                          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "9999px", padding: "5px 9px", fontSize: "10px", fontWeight: 900, background: tone.background, color: tone.text, border: `1px solid ${tone.border}`, boxShadow: tone.shadow, whiteSpace: "nowrap" }}>{gradeLabel}</span>
                          <span
  style={{
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "999px",
    border: "1px solid rgba(196, 181, 253, 0.75)",
    background: "rgba(250,247,255,0.96)",
    color: "#6d4fc2",
    padding: "5px 9px",
    fontSize: "10px",
    fontWeight: 900,
    letterSpacing: "0.04em",
    whiteSpace: "nowrap",
  }}
>
  {venueStageLabel}
</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "9999px", padding: "6px 10px", fontSize: "10px", fontWeight: 900, background: sessionTone.background, color: sessionTone.text, border: `1px solid ${sessionTone.border}` }}>{sessionBadge}</span>
                          <div style={{ fontSize: "12px", fontWeight: 800, color: isActive ? "#5f4ea0" : "#526072", lineHeight: 1.5 }}>{representativeRace ? `${representativeRace}R` : "--R"}{representativeTime ? `  ${representativeTime}` : ""}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: "grid", gap: "14px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                  <div style={{ fontSize: "9px", fontWeight: 900, letterSpacing: "0.18em", color: "#7b8a9d" }}>RACE</div>
                  <div style={{ fontSize: "11px", color: "#7b889b", fontWeight: 700 }}>{selectedVenue ? `${selectedVenue.venue} のレースを選択` : "会場を選ぶとレース一覧が出ます"}</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))", gap: "10px" }}>
                  {(selectedVenue?.races ?? []).map((race) => {
                    const isActive = race.raceNo === selectedRace?.raceNo;
                    return (
                      <button
                        key={`quick-race-${selectedVenue?.id}-${race.raceNo}`}
                        type="button"
                        onClick={() => handlePredictionRaceSelect(race.raceNo)}
                        style={{ display: "grid", gap: "4px", justifyItems: "start", borderRadius: "20px", border: isActive ? "1px solid #cbb9f0" : "1px solid #ebe3f3", background: isActive ? "linear-gradient(135deg, #7a67b8 0%, #526cc8 100%)" : "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(251,247,254,0.96) 100%)", color: isActive ? "#ffffff" : "#425266", padding: "12px 14px", cursor: "pointer", boxShadow: isActive ? "0 14px 28px rgba(122,103,184,0.18)" : "0 8px 18px rgba(15, 23, 42, 0.04)", transition: "transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease" }}
                        onMouseEnter={(event) => {
                          event.currentTarget.style.transform = "translateY(-1px)";
                          event.currentTarget.style.boxShadow = isActive ? "0 16px 30px rgba(122,103,184,0.20)" : "0 10px 20px rgba(15, 23, 42, 0.07)";
                        }}
                        onMouseLeave={(event) => {
                          event.currentTarget.style.transform = "translateY(0)";
                          event.currentTarget.style.boxShadow = isActive ? "0 14px 28px rgba(122,103,184,0.18)" : "0 8px 18px rgba(15, 23, 42, 0.04)";
                        }}
                      >
                        <span style={{ fontSize: "14px", fontWeight: 900, lineHeight: 1.2 }}>{race.raceNo}R</span>
                        <span style={{ fontSize: "11px", fontWeight: 800, color: isActive ? "rgba(255,255,255,0.84)" : "#7b889b", lineHeight: 1.2 }}>{race.time ?? "--:--"}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          <section style={{ display: "grid", gap: "24px" }}>
            <div style={{ display: "grid", gridTemplateColumns: isPredictionCompactLayout ? "1fr" : "minmax(0, 1.58fr) minmax(340px, 1fr)", gap: "24px", alignItems: "start" }}>
              <article style={{ borderRadius: "34px", border: "1px solid #e7dcf4", background: "linear-gradient(180deg, rgba(255,255,255,0.99) 0%, rgba(252,248,255,0.98) 56%, rgba(246,249,255,0.98) 100%)", boxShadow: "0 24px 52px rgba(15, 23, 42, 0.06)", padding: isPredictionCompactLayout ? "22px" : "28px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "14px" }}>
                  <div>
                    <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.18em", color: "#8c63c7", marginBottom: "6px" }}>GPT MATERIAL</div>
                    <div style={{ fontSize: isPredictionCompactLayout ? "26px" : "32px", fontWeight: 900, color: "#081224", lineHeight: 1.15 }}>GPT貼り付け用素材</div>
                    <div style={{ marginTop: "8px", fontSize: "13px", color: "#5f6f84", lineHeight: 1.9, maxWidth: "780px" }}>選択中レースの会場特徴・天気・並び・出走表・分析素材を、そのままGPTへ渡せる形で整えています。</div>
                  </div>
                  {copyStatus ? <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "9999px", padding: "5px 9px", fontSize: "10px", fontWeight: 900, background: "#f2ecfb", color: "#7a67b8", border: "1px solid #e0d6f4" }}>{copyStatus}</span> : null}
                </div>
                <div style={{ display: "grid", gap: "12px", marginBottom: "16px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                      <button type="button" onClick={handlePredictionCopy} style={{ minWidth: "160px", border: "none", borderRadius: "9999px", padding: "13px 18px", background: "linear-gradient(135deg, #081224 0%, #162745 100%)", color: "white", fontWeight: 900, fontSize: "12px", letterSpacing: "0.04em", cursor: "pointer", boxShadow: "0 12px 26px rgba(8, 18, 36, 0.14)" }}>コピー</button>
                      <button type="button" onClick={handlePredictionDownload} style={{ minWidth: "180px", border: "1px solid #e0d6f4", borderRadius: "9999px", padding: "13px 18px", background: "linear-gradient(180deg, #fffefe 0%, #fff6fb 48%, #f6fbff 100%)", color: "#7a67b8", fontWeight: 900, fontSize: "12px", letterSpacing: "0.04em", cursor: "pointer" }}>TXTダウンロード</button>
                    </div>
{(() => {
  if (ENABLE_PREDICTION_DEBUG_LOGS) {
    console.log("[WEATHER ACTUAL render values]", {
      savedWeatherActual: selectedSavedPredictionResult?.weatherActual,
      liveWeather: selectedWeather,
    });
  }
  return null;
})()}
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "9999px", padding: "7px 12px", fontSize: "10px", fontWeight: 900, letterSpacing: "0.12em", background: "linear-gradient(135deg, rgba(242,236,251,1) 0%, rgba(232,241,255,1) 100%)", color: "#6b57a8", border: "1px solid #ddd3f0", boxShadow: "0 8px 18px rgba(122,103,184,0.08)" }}>{predictionMaterialStateLabel}</span>
                      {[selectedPredictionTargetLabel, `${gptExportCharCount.toLocaleString()} chars`, `${gptExportLineCount.toLocaleString()} lines`].map((item) => (
                        <span key={item} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "9999px", padding: "6px 11px", fontSize: "10px", fontWeight: 800, letterSpacing: "0.06em", background: "rgba(255,255,255,0.82)", color: "#7a8090", border: "1px solid #ebe3f3" }}>{item}</span>
                      ))}
                    </div>
                  </div>
                </div>
                <div style={{ marginBottom: "10px", fontSize: "10px", color: "#8b94a5", lineHeight: 1.7 }}>出力ファイル名: {predictionExportFileName}</div>
                <div style={{ borderRadius: "28px", border: "1px solid #e7def3", background: "linear-gradient(180deg, rgba(252,251,255,0.99) 0%, rgba(247,248,252,0.98) 100%)", padding: "16px", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.74)" }}>
                  <textarea readOnly value={gptExportText} style={{ width: "100%", minHeight: "540px", borderRadius: "22px", border: "1px solid #e7def3", background: "rgba(255,255,255,0.94)", padding: "21px 24px", resize: "vertical", fontSize: "13px", lineHeight: 2, color: "#334155", outline: "none", fontFamily: '"SFMono-Regular", "Consolas", "BIZ UDPGothic", monospace' }} />
                </div>
                <div style={{ marginTop: "18px", display: "grid", gridTemplateColumns: isPredictionCompactLayout ? "1fr" : "minmax(0, 1fr) minmax(260px, 320px)", gap: "14px" }}>
                  <div style={{ borderRadius: "24px", border: "1px solid #eadff6", background: "linear-gradient(180deg, rgba(255,255,255,0.88) 0%, rgba(250,247,253,0.9) 100%)", padding: "17px 18px" }}>
                    <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.16em", color: "#8c63c7", marginBottom: "8px" }}>ANALYST MEMO</div>
                    <div style={{ fontSize: "13px", color: "#5f6f84", lineHeight: 1.8, marginBottom: "10px" }}>展開メモや補足コメントをここへ集約します。素材テキストにはそのまま反映されます。</div>
                    <textarea value={predictionMemo} onChange={(event) => setPredictionMemo(event.target.value)} style={{ width: "100%", minHeight: "172px", borderRadius: "18px", border: "1px solid #e7def3", background: "rgba(255,255,255,0.95)", padding: "15px 16px", resize: "vertical", fontSize: "13px", lineHeight: 1.88, color: "#425266", outline: "none" }} />
                  </div>
                  <div style={{ display: "grid", gap: "10px" }}>
                    {[
                      { label: "会場特徴", value: bankGuideItems[1]?.value ?? (selectedVenueSummary.source === "missing" ? "未登録" : "未取得") },
                      { label: "天気", value: weatherCardValue },
                      { label: "並び", value: lineupDisplay },
                      { label: "主導権候補", value: leadLabel },
                    ].map((item) => (
                      <div key={item.label} style={{ borderRadius: "18px", border: "1px solid #ece4f6", background: "rgba(255,255,255,0.84)", padding: "12px 14px", minHeight: "78px", display: "grid", alignContent: "start" }}>
                        <div style={{ fontSize: "9px", fontWeight: 900, letterSpacing: "0.16em", color: "#7b8a9d", marginBottom: "6px" }}>{item.label}</div>
                        <div style={{ fontSize: "12px", color: "#425266", lineHeight: 1.8 }}>{item.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </article>

              <div style={{ display: "grid", gap: "18px" }}>
              <article style={{ borderRadius: "34px", border: "1px solid #e7dcf4", background: "linear-gradient(180deg, rgba(255,255,255,0.99) 0%, rgba(252,247,255,0.98) 56%, rgba(247,249,255,0.98) 100%)", boxShadow: "0 24px 52px rgba(15, 23, 42, 0.06)", padding: "24px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", marginBottom: "14px" }}>
                  <div>
                    <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.18em", color: "#8c63c7", marginBottom: "10px" }}>GPT PREDICTION</div>
                    <div style={{ fontSize: "28px", fontWeight: 900, color: "#081224", marginBottom: "8px", lineHeight: 1.15 }}>GPT予想貼り付け欄</div>
                    <div style={{ fontSize: "13px", color: "#526072", lineHeight: 1.9 }}>GPTから返ってきた予想文を貼り付けて保存します。保存後は結果・的中・回収率との連動に使います。</div>
                  </div>
                  {predictionSlotStatus ? <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "9999px", padding: "6px 10px", fontSize: "10px", fontWeight: 900, background: "#f2ecfb", color: "#7a67b8", border: "1px solid #e0d6f4", whiteSpace: "nowrap" }}>{predictionSlotStatus}</span> : null}
                </div>
                <div style={{ display: "grid", gap: "14px" }}>
                  <div
  style={{
    display: "grid",
    gridTemplateColumns:"repeat(3, minmax(0, 1fr))",
    gap:"10px",
  }}
>
                    <div style={{ borderRadius: "18px", border: "1px solid #ece4f6", background: "rgba(255,255,255,0.90)", padding: "11px 12px" }}>
                      <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.14em", color: "#7b8a9d", marginBottom: "5px" }}>対象レース</div>
                      <div style={{ fontSize: "13px", fontWeight: 800, color: "#081224", lineHeight: 1.8 }}>{selectedPredictionTargetLabel}</div>

<span
  style={{
    display: "inline-flex",
    alignItems: "center",
    width: "fit-content",
    borderRadius: "999px",
    border: "1px solid rgba(196, 181, 253, 0.75)",
    background: "rgba(250,247,255,0.96)",
    color: "#6d4fc2",
    padding: "5px 9px",
    fontSize: "10px",
    fontWeight: 900,
    letterSpacing: "0.04em",
  }}
>
  {selectedPredictionVenueStageLabel}
</span>

                    </div>
                    <div style={{ borderRadius: "18px", border: "1px solid #ece4f6", background: "rgba(255,255,255,0.90)", padding: "11px 12px" }}>
                      <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.14em", color: "#7b8a9d", marginBottom: "5px" }}>保存状態</div>
                      <div style={{ fontSize: "13px", fontWeight: 800, color: "#081224", lineHeight: 1.8 }}>{predictionSlotSaveStateLabel}</div>
                    </div>
                    <div style={{ borderRadius: "18px", border: "1px solid #ece4f6", background: "rgba(255,255,255,0.90)", padding: "11px 12px" }}>
                      <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.14em", color: "#7b8a9d", marginBottom: "5px" }}>結果連動</div>
                      <div style={{ fontSize: "13px", fontWeight: 800, color: "#081224", lineHeight: 1.8 }}>{predictionResultLinkStateLabel}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: "11px", color: "#7b8a9d", lineHeight: 1.8 }}>最終保存: {formatPredictionSlotSavedAt(selectedSavedPredictionSlot?.savedAt)}</div>
                  <div style={{ borderRadius: "24px", border: "1px solid #e7def3", background: "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(249,246,253,0.96) 100%)", padding: "13px" }}>
                    <textarea
                      value={predictionSlotDraft}
                      onChange={(event) => setPredictionSlotDraft(event.target.value)}
                      placeholder={"ここにGPTの予想文を貼り付け\n例：\n本命：2 木村皆斗\n対抗：5 山岸佳太\n穴：1 纐纈洸翔\n展開：\n...\n買い目：\n..."}
                      style={{ width: "100%", minHeight: "360px", maxHeight: "560px", borderRadius: "20px", border: "1px solid #e7def3", background: "rgba(255,255,255,0.97)", padding: "17px 18px", resize: "vertical", overflow: "auto", fontSize: "13px", lineHeight: 1.92, color: "#334155", outline: "none" }}
                    />
                  </div>
                  <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={handlePredictionPublicJsonExport}
                      style={{
                        minWidth: "120px",
                        border: "1px solid rgba(122,96,194,0.24)",
                        borderRadius: "9999px",
                        padding: "12px 16px",
                        background: "linear-gradient(135deg, #ffffff 0%, #f6f0ff 100%)",
                        color: "#6542be",
                        fontWeight: 900,
                        fontSize: "12px",
                        letterSpacing: "0.03em",
                        cursor: "pointer",
                        boxShadow: "0 10px 20px rgba(103, 96, 184, 0.08)",
                      }}
                    >
                      公開JSONを書き出す
                    </button>

                    <button
                      type="button"
                      onClick={handlePredictionSlotSave}
                      style={{
                        flex: 1,
                        minWidth: "180px",
                        border: "none",
                        borderRadius: "9999px",
                        padding: "13px 16px",
                        background: "linear-gradient(135deg, #7a67b8 0%, #526cc8 100%)",
                        color: "white",
                        fontWeight: 900,
                        fontSize: "12px",
                        letterSpacing: "0.04em",
                        cursor: "pointer",
                        boxShadow: "0 12px 24px rgba(103, 96, 184, 0.18)",
                      }}
                    >
                      保存
                    </button>

                    <button
                      type="button"
                      onClick={handlePredictionSlotClear}
                      style={{
                        minWidth: "120px",
                        border: "1px solid #e0d6f4",
                        borderRadius: "9999px",
                        padding: "12px 16px",
                        background: "linear-gradient(180deg, #fffefe 0%, #fff6fb 48%, #f6fbff 100%)",
                        color: "#7a67b8",
                        fontWeight: 800,
                        fontSize: "12px",
                        letterSpacing: "0.03em",
                        cursor: "pointer",
                      }}
                    >
                      クリア
                    </button>
                  </div>
                  <div style={{ borderRadius: "20px", border: "1px solid #ece4f6", background: "rgba(255,255,255,0.90)", padding: "14px 16px" }}>
                    <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.14em", color: "#7b8a9d", marginBottom: "8px" }}>保存済みプレビュー</div>
                    <div style={{ whiteSpace: "pre-wrap", fontSize: "12px", lineHeight: 1.9, color: "#526072", maxHeight: "220px", overflow: "auto" }}>{selectedSavedPredictionSlot?.predictionText || "このレースの保存済み予想はまだありません。"}</div>
                  </div>
                  
                </div>
              </article>
              </div>
            </div>

              <article style={{ borderRadius: "34px", border: `1px solid ${predictionResultTone.border}`, background: predictionResultTone.background, boxShadow: "0 24px 52px rgba(15, 23, 42, 0.06)", padding: isPredictionCompactLayout ? "22px" : "26px 28px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", marginBottom: "20px" }}>
                  <div>
                    <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.18em", color: "#8c63c7", marginBottom: "10px" }}>RESULT & BALANCE</div>
                    <div style={{ fontSize: "28px", fontWeight: 900, color: "#081224", marginBottom: "8px", lineHeight: 1.15 }}>実戦結果・収支確認パネル</div>
                    <div style={{ fontSize: "13px", color: "#526072", lineHeight: 1.9 }}>保存済み予想と実着順を照合して、結果と収支を確認します。</div>
                  </div>
                  {predictionResultStatus ? <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "9999px", padding: "6px 10px", fontSize: "10px", fontWeight: 900, background: "#f2ecfb", color: "#7a67b8", border: "1px solid #e0d6f4", whiteSpace: "nowrap" }}>{predictionResultStatus}</span> : null}
                </div>
                <div style={{ display: "grid", gap: "18px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: isPredictionCompactLayout ? "1fr" : "minmax(0, 1.2fr) minmax(260px, 0.8fr)", gap: "14px" }}>
                    <div style={{ borderRadius: "28px", border: `1px solid ${predictionResultTone.border}`, background: "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.88) 100%)", padding: isPredictionCompactLayout ? "20px" : "24px 24px 22px", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.76), 0 14px 28px rgba(15, 23, 42, 0.04)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "14px" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "9999px", padding: "5px 10px", fontSize: "10px", fontWeight: 900, letterSpacing: "0.1em", background: predictionResultTone.chipBackground, color: predictionResultTone.chipText, border: `1px solid ${predictionResultTone.border}` }}>{selectedPredictionTargetLabel}</span>
                        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "9999px", padding: "5px 10px", fontSize: "10px", fontWeight: 900, letterSpacing: "0.1em", background: predictionResultTone.chipBackground, color: predictionResultTone.chipText, border: `1px solid ${predictionResultTone.border}` }}>{getPredictionResultHitStatusLabel(predictionFinalHitStatus)}</span>
                        {predictionHitBadgeDetail?.hitBetType ? (() => {
                          const tone = getPredictionHitBadgeTone(predictionHitBadgeDetail.hitBetType);
                          return (
                            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "9999px", padding: "5px 10px", fontSize: "10px", fontWeight: 900, letterSpacing: "0.08em", background: tone.background, color: tone.text, border: `1px solid ${tone.border}` }}>
                              {`${predictionHitBadgeDetail.hitBetType}的中`}
                            </span>
                          );
                        })() : null}
                      </div>
                      <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.18em", color: "#7b8a9d", marginBottom: "10px" }}>RESULT ORDER</div>
                      <div style={{ fontSize: isPredictionCompactLayout ? "38px" : "48px", fontWeight: 900, color: "#081224", lineHeight: 1, letterSpacing: "0.06em", marginBottom: "16px" }}>{normalizedPredictionResultOrder || "--"}</div>
                      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "stretch" }}>
                        {(predictionResultOrderParts.length > 0 ? predictionResultOrderParts : ["-", "-", "-"]).map((carNo, index) => {
                          const tone = getPredictionResultCarTone(carNo);
                          return (
                            <div key={`result-order-${index}-${carNo}`} style={{ minWidth: isPredictionCompactLayout ? "84px" : "96px", borderRadius: "20px", border: `1px solid ${tone.border}`, background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,255,0.92) 100%)", padding: "12px 12px 10px", display: "grid", justifyItems: "center", gap: "7px", boxShadow: "0 10px 22px rgba(15, 23, 42, 0.04), inset 0 1px 0 rgba(255,255,255,0.78)" }}>
                              <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.14em", color: "#7b8a9d" }}>{`${index + 1}着`}</div>
                              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: isPredictionCompactLayout ? "40px" : "44px", height: isPredictionCompactLayout ? "40px" : "44px", borderRadius: "9999px", background: tone.background, color: tone.text, border: `1px solid ${tone.border}`, fontSize: isPredictionCompactLayout ? "20px" : "22px", fontWeight: 900, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.42), 0 6px 14px rgba(15, 23, 42, 0.10)" }}>{carNo}</span>
                              <div style={{ fontSize: "9px", fontWeight: 800, letterSpacing: "0.12em", color: "#97a3b6" }}>CAR NO.</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div style={{ borderRadius: "24px", border: "1px solid #e6def3", background: "linear-gradient(180deg, rgba(255,255,255,0.94) 0%, rgba(250,247,253,0.9) 100%)", padding: "14px 16px", display: "grid", gap: "12px", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.76)" }}>
                      <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.18em", color: "#8c63c7" }}>STATUS PANEL</div>
                      {[
                        { label: "最終保存", value: formatPredictionSlotSavedAt(selectedSavedPredictionResult?.savedAt) },
                        { label: "自動判定", value: getPredictionResultHitStatusLabel(predictionAutoHitStatus) },
                        { label: "最終判定", value: getPredictionResultHitStatusLabel(predictionFinalHitStatus) },
                        { label: "的中券種", value: predictionHitBadgeDetail?.hitBetType ? `${predictionHitBadgeDetail.hitBetType}${predictionHitBadgeDetail.hitCombination ? ` / ${predictionHitBadgeDetail.hitCombination}` : ""}` : "—" },
                      ].map((item, index, list) => (
                        <div key={item.label} style={{ paddingBottom: index === list.length - 1 ? "0" : "12px", borderBottom: index === list.length - 1 ? "none" : "1px solid rgba(224, 214, 244, 0.72)" }}>
                          <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.14em", color: "#7b8a9d", marginBottom: "6px" }}>{item.label}</div>
                          <div style={{ fontSize: "15px", fontWeight: 900, color: "#081224", lineHeight: 1.45 }}>{item.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ borderRadius: "24px", border: "1px solid #e7def3", background: "linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(249,246,253,0.88) 100%)", padding: "14px 16px" }}>
                    <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.14em", color: "#7b8a9d", marginBottom: "8px" }}>判定上書き</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "4px", borderRadius: "9999px", border: "1px solid #ddd3f0", background: "linear-gradient(180deg, rgba(246,242,252,0.98) 0%, rgba(255,255,255,0.94) 100%)", padding: "5px", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.72)" }}>
                      {([
                        { value: "auto", label: "自動" },
                        { value: "hit", label: "的中" },
                        { value: "miss", label: "不的中" },
                        { value: "pending", label: "保留" },
                      ] as const).map((option) => {
                        const isActive = predictionResultDraft.manualHitStatus === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setPredictionResultDraft((current) => ({ ...current, manualHitStatus: option.value }))}
                            style={{ border: "none", borderRadius: "9999px", padding: "10px 8px", background: isActive ? "linear-gradient(135deg, #664ea8 0%, #4c43de 100%)" : "transparent", color: isActive ? "#ffffff" : "#526072", fontSize: "12px", fontWeight: 900, letterSpacing: "0.03em", cursor: "pointer", boxShadow: isActive ? "0 8px 18px rgba(94, 85, 173, 0.16), inset 0 1px 0 rgba(255,255,255,0.16)" : "none", lineHeight: 1.2 }}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: isPredictionCompactLayout ? "1fr" : "minmax(0, 1fr) minmax(280px, 0.9fr)", gap: "14px" }}>
                    <div style={{ borderRadius: "24px", border: "1px solid #e7def3", background: "rgba(255,255,255,0.9)", padding: "16px" }}>
                      <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.14em", color: "#7b8a9d", marginBottom: "8px" }}>保存済み予想の買い目</div>
                      {predictionTicketChipItems.length > 0 ? (
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                          {predictionTicketChipItems.map((item) => {
                            const tone = getPredictionTicketChipTone(item.betType, item.hit);
                            return (
                              <div key={`${item.index}-${item.betType}-${item.combination}`} style={{ display: "inline-flex", alignItems: "center", gap: "6px", borderRadius: "9999px", padding: "8px 12px", background: tone.background, border: `1px solid ${tone.border}`, color: tone.text, fontSize: "12px", fontWeight: 800, lineHeight: 1.4, boxShadow: item.hit ? "0 8px 16px rgba(79,70,229,0.08)" : "none" }}>
                                <span>{item.label}</span>
                                {item.hit ? <span style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.08em" }}>HIT</span> : null}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ fontSize: "12px", lineHeight: 1.85, color: "#64748b" }}>このレースの保存済み予想から 買い目一覧 をまだ抽出できません。</div>
                      )}
                    </div>
                    <div style={{ borderRadius: "24px", border: "1px solid #e7def3", background: "rgba(255,255,255,0.9)", padding: "16px" }}>
                      <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.14em", color: "#7b8a9d", marginBottom: "8px" }}>実着順編集</div>
                      <input
                        type="text"
                        value={predictionResultDraft.resultOrder}
                        onChange={(event) => setPredictionResultDraft((current) => ({ ...current, resultOrder: event.target.value }))}
                        placeholder={"例: 2-5-9"}
                        style={{ width: "100%", border: "1px solid #e4daf4", borderRadius: "18px", background: "rgba(255,255,255,0.98)", padding: "15px 16px", fontSize: "16px", fontWeight: 900, color: "#081224", outline: "none", letterSpacing: "0.05em", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.72)" }}
                      />
                      <div style={{ marginTop: "8px", fontSize: "11px", color: "#64748b", lineHeight: 1.7 }}>競輪の実着順をここで確認・更新します。</div>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: isPredictionCompactLayout ? "1fr" : "repeat(4, minmax(0, 1fr))", gap: "12px" }}>
                    {predictionResultMetricCards.map((item) => (
                      <div key={item.label} style={{ borderRadius: "24px", border: `1px solid ${item.tone.border}`, background: item.tone.background, padding: "18px 17px 16px", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.74), 0 10px 24px rgba(15, 23, 42, 0.03)" }}>
                        <div style={{ fontSize: "9px", fontWeight: 900, letterSpacing: "0.18em", color: "#8a95a8", marginBottom: "12px" }}>{item.label}</div>
                        <div style={{ fontSize: item.label === "収支" ? "31px" : item.label === "払戻金額" ? "29px" : "27px", fontWeight: 900, color: item.tone.text, lineHeight: 1.05, letterSpacing: "0.01em", marginBottom: "8px" }}>{item.value}</div>
                        <div style={{ fontSize: "10px", color: "#8c97a8", lineHeight: 1.6 }}>{item.note}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ borderRadius: "24px", border: "1px solid #e4daf4", background: "linear-gradient(180deg, rgba(255,255,255,0.93) 0%, rgba(249,246,253,0.9) 100%)", padding: isPredictionCompactLayout ? "16px" : "18px", display: "grid", gap: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", paddingBottom: "10px", borderBottom: "1px solid rgba(224, 214, 244, 0.72)" }}>
                      <div>
                        <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.18em", color: "#8c63c7", marginBottom: "4px" }}>EDIT / SAVE</div>
                        <div style={{ fontSize: "13px", color: "#5f6f84", lineHeight: 1.7 }}>結果の数値入力とメモ編集</div>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: isPredictionCompactLayout ? "1fr" : "minmax(0, 1fr) auto", gap: "14px", alignItems: "start" }}>
                    <div style={{ display: "grid", gridTemplateColumns: isPredictionCompactLayout ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: "10px" }}>
                      <label style={{ borderRadius: "22px", border: "1px solid #e7def3", background: "rgba(255,255,255,0.92)", padding: "15px", display: "grid", gap: "8px" }}>
                        <span style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.14em", color: "#7b8a9d" }}>投資金額</span>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <input
                            type="number"
                            inputMode="numeric"
                            min="0"
                            step="1"
                            value={predictionResultDraft.investmentInput}
                            onChange={(event) => setPredictionResultDraft((current) => ({ ...current, investmentInput: event.target.value, investmentInputMode: "manual" }))}
                            placeholder="1000"
                            style={{ width: "100%", border: "1px solid #e4daf4", borderRadius: "16px", background: "rgba(255,255,255,0.98)", padding: "12px 14px", fontSize: "14px", fontWeight: 800, color: "#081224", outline: "none" }}
                          />
                          <span style={{ fontSize: "12px", fontWeight: 800, color: "#64748b" }}>円</span>
                        </div>
                      </label>
                      <label style={{ borderRadius: "22px", border: "1px solid #e7def3", background: "rgba(255,255,255,0.92)", padding: "15px", display: "grid", gap: "8px" }}>
                        <span style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.14em", color: "#7b8a9d" }}>払戻金額</span>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <input
                            type="number"
                            inputMode="numeric"
                            min="0"
                            step="1"
                            value={predictionResultDraft.payoutInput}
                            onChange={(event) => setPredictionResultDraft((current) => ({ ...current, payoutInput: event.target.value }))}
                            placeholder="3250"
                            style={{ width: "100%", border: "1px solid #e4daf4", borderRadius: "16px", background: "rgba(255,255,255,0.98)", padding: "12px 14px", fontSize: "14px", fontWeight: 800, color: "#081224", outline: "none" }}
                          />
                          <span style={{ fontSize: "12px", fontWeight: 800, color: "#64748b" }}>円</span>
                        </div>
                      </label>
                      <div style={{ gridColumn: isPredictionCompactLayout ? "auto" : "1 / -1", borderRadius: "22px", border: "1px solid #e7def3", background: "rgba(255,255,255,0.92)", padding: "15px" }}>
                        <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.14em", color: "#7b8a9d", marginBottom: "8px" }}>結果メモ</div>
                        <textarea
                          value={predictionResultDraft.memo}
                          onChange={(event) => setPredictionResultDraft((current) => ({ ...current, memo: event.target.value }))}
                          placeholder={"的中理由、外れ方、あとで見返すポイント"}
                          style={{ width: "100%", minHeight: "136px", borderRadius: "18px", border: "1px solid #e4daf4", background: "rgba(255,255,255,0.97)", padding: "15px 16px", resize: "vertical", fontSize: "13px", lineHeight: 1.9, color: "#334155", outline: "none" }}
                        />
                      </div>
                    </div>

                    <div style={{ display: "grid", gap: "9px", minWidth: isPredictionCompactLayout ? "auto" : "188px", paddingTop: "2px" }}>
                      <button type="button" onClick={handlePredictionResultSave} style={{ border: "none", borderRadius: "9999px", padding: "13px 18px", background: "linear-gradient(135deg, #7a67b8 0%, #526cc8 100%)", color: "white", fontWeight: 900, fontSize: "12px", letterSpacing: "0.04em", cursor: "pointer" }}>結果を保存</button>
                      <button type="button" onClick={handlePredictionResultClear} style={{ border: "1px solid #e0d6f4", borderRadius: "9999px", padding: "12px 18px", background: "linear-gradient(180deg, #fffefe 0%, #fff6fb 48%, #f6fbff 100%)", color: "#7a67b8", fontWeight: 900, fontSize: "12px", letterSpacing: "0.04em", cursor: "pointer" }}>削除</button>
                    </div>
                  </div>
                  </div>

                  <div style={{ borderRadius: "22px", border: "1px solid #e7def3", background: "linear-gradient(180deg, rgba(248,246,251,0.96) 0%, rgba(244,247,251,0.92) 100%)", padding: "15px 16px", display: "grid", gap: "10px", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.62)" }}>
                    <div>
                      <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.18em", color: "#8c63c7", marginBottom: "4px" }}>RECORDED SUMMARY</div>
                      <div style={{ fontSize: "13px", color: "#5f6f84", lineHeight: 1.7 }}>保存済みの結果記録サマリー</div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: isPredictionCompactLayout ? "1fr" : "repeat(4, minmax(0, 1fr))", gap: "10px" }}>
                      {[
                        { label: "最終判定", value: selectedSavedPredictionResult ? getPredictionResultHitStatusLabel(selectedSavedPredictionResult.hitStatus) : "未保存" },
                        { label: "自動判定", value: selectedSavedPredictionResult ? getPredictionResultHitStatusLabel(selectedSavedPredictionResult.autoHitStatus) : "未保存" },
                        { label: "投資", value: formatPredictionResultYen(normalizedSelectedSavedPredictionResult.investment) },
                        { label: "払戻", value: formatPredictionResultYen(normalizedSelectedSavedPredictionResult.payout) },
                        { label: "実着順", value: selectedSavedPredictionResult?.resultOrder || "--" },
                        { label: "上書き", value: selectedSavedPredictionResult?.manualHitStatus ? getPredictionResultHitStatusLabel(selectedSavedPredictionResult.manualHitStatus) : "自動" },
                        { label: "収支", value: formatPredictionResultProfitLoss(normalizedSelectedSavedPredictionResult.profitLoss) },
                        { label: "回収率", value: formatPredictionResultRoi(normalizedSelectedSavedPredictionResult.roi) },
                      ].map((item) => (
                        <div key={item.label} style={{ borderRadius: "16px", border: "1px solid rgba(228, 218, 244, 0.9)", background: "rgba(255,255,255,0.66)", padding: "11px 12px" }}>
                          <div style={{ fontSize: "9px", fontWeight: 900, letterSpacing: "0.16em", color: "#8a95a8", marginBottom: "6px" }}>{item.label}</div>
                          <div style={{ fontSize: "14px", fontWeight: 900, color: "#081224", lineHeight: 1.45 }}>{item.value}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ borderRadius: "16px", border: "1px solid rgba(228, 218, 244, 0.9)", background: "rgba(255,255,255,0.66)", padding: "11px 13px" }}>
                      <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.14em", color: "#7b8a9d", marginBottom: "6px" }}>結果メモ</div>
                      <div style={{ whiteSpace: "pre-wrap", fontSize: "12px", lineHeight: 1.85, color: "#526072", maxHeight: "120px", overflow: "auto" }}>{selectedSavedPredictionResult?.memo || "このレースの結果メモはまだありません。"}</div>
                    </div>
                  </div>
                </div>
              </article>
          </section>
        </>
      )}
      </div>
      </div>

      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          top: isPredictionCompactLayout ? "96px" : "92px",
          right: isPredictionCompactLayout ? "14px" : "28px",
          width: isPredictionCompactLayout ? "108px" : "200px",
          pointerEvents: "none",
          zIndex: 99999,
          opacity: 1,
          animation: "predictionPageFloatCheer 5.2s ease-in-out infinite",
          filter: "drop-shadow(0 14px 22px rgba(86, 87, 170, 0.18))",
        }}
      >
        <img
          src={toPublicPath("/prediction-page/prediction-page-float-cheer-duo.png")}
          alt=""
          style={{ display: "block", width: "100%", height: "auto" }}
        />
      </div>

    </SubPageShell>
  );
}

export function ReviewPage() {
  return (
    <SubPageShell
      eyebrow="REVIEW"
      title="予想の振り返りをまとめる"
      lead="保存した予想結果・的中率・回収率・メモを整理し、次の予想に活かすための振り返りページです。"
    >
      <section
        style={{
          width: "100%",
          maxWidth: "1400px",
          margin: "0 auto",
          padding: "0 0 96px",
        }}
      >
        <div
          style={{
            borderRadius: "32px",
            border: "1px solid #e9def5",
            background: "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(250,247,253,0.98) 100%)",
            boxShadow: "0 18px 40px rgba(15, 23, 42, 0.06)",
            padding: "40px 36px",
          }}
        >
          <div
            style={{
              fontSize: "11px",
              letterSpacing: "0.22em",
              fontWeight: 800,
              color: "#9a7ad9",
              marginBottom: "12px",
            }}
          >
            REVIEW
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: "42px",
              lineHeight: 1.15,
              fontWeight: 900,
              color: "#111827",
              marginBottom: "14px",
            }}
          >
            予想の振り返りをまとめる
          </h1>

          <p
            style={{
              margin: 0,
              fontSize: "15px",
              lineHeight: 1.9,
              color: "#6b7280",
              maxWidth: "980px",
            }}
          >
            Predictionページで作成した予想、実際の結果、払い戻し、決まり手、天候・風、
            GPTによる振り返りレポートを今後ここへ蓄積して確認していくページです。
          </p>
        </div>
      </section>
    </SubPageShell>
  );
}

export function AnalysisMaterialPage() {
  return (
    <SubPageShell
      eyebrow="ANALYSIS MATERIAL"
      title="展開分析の素材置き場"
      lead="ライン、主導権、番手、位置取り、飛びつきなどの分析素材をまとめるページ予定地です。いまはルート切替で落ちないための安定ページとして置いています。"
    >
<section
  style={{
    display: "grid",
    gridTemplateColumns:"repeat(3, minmax(0, 1fr))",
    gap:"20px",
  }}
>
        {[
          { title: "ライン想定", body: "並び予想と別線の並走ポイントを整理" },
          { title: "主導権争い", body: "先行争い・叩き合い・カマシの可能性を置く枠" },
          { title: "番手有利度", body: "番手差し / 捲り追込み / 不発パターンのメモ枠" },
        ].map((card) => (
          <article key={card.title} style={{ borderRadius: "30px", border: "1px solid #ebe3f3", background: "linear-gradient(180deg, #ffffff 0%, #fbf8fd 100%)", boxShadow: "0 16px 34px rgba(15, 23, 42, 0.05)", padding: "24px" }}>
            <div style={{ fontSize: "11px", fontWeight: 900, letterSpacing: "0.18em", color: "#8c63c7", marginBottom: "10px" }}>{card.title}</div>
            <div style={{ fontSize: "18px", fontWeight: 900, color: "#081224", marginBottom: "10px" }}>{card.title}</div>
            <div style={{ fontSize: "14px", lineHeight: 1.9, color: "#5f6b7c" }}>{card.body}</div>
          </article>
        ))}
      </section>
    </SubPageShell>
  );
}
