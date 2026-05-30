import { useEffect, useState } from "react";
import {
  SiteHeader,
  buildPredictionExportText,
  findPredictionResultRecord,
  getDisplayRidersForKeirinRace,
  getPredictionOddsUnavailableLabel,
  resolveRacePayoutByBetType,
  loadStoredPredictionResults,
  PREDICTION_RESULT_STORAGE_KEY,
  useIsMobile,
  type PredictionResultMap,
  type PredictionRaceItem,
  type PredictionRiderHistoricalRaceItem,
  type PredictionRiderStatsSummaryItem,
  type PredictionVenueItem,
  type PredictionVenueSummary,
  type PredictionWeatherData,
} from "./PageImplementations";
import type { ReactNode } from "react";
import { raceScheduleData } from "../data/raceScheduleData";
import type { RaceScheduleItem } from "../types/raceSchedule";
import { getRaceEventDayLabel } from "../utils/raceEventDay";
const PAGE_MAX_WIDTH = "2040px";
const OPEN_METEO_GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const WEATHER_CACHE_TTL_MS = 5 * 60 * 1000;
const toPublicPath = (path: string) => {
  const base = import.meta.env.BASE_URL || "/";
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  return `${normalizedBase}${path.replace(/^\/+/, "")}`;
};

type VenueCoordinate = {
  latitude: number;
  longitude: number;
};

type VenueWeatherData = {
  weatherLabel: string;
  temperatureText: string;
  apparentTemperatureText: string;
  windSpeedText: string;
  windDirectionText: string;
  precipitationText: string;
  updatedAtText: string;
  referenceText: string;
};

type VenueWeatherCacheEntry = {
  fetchedAt: number;
  data: VenueWeatherData;
};

type VenueWeatherRequestOptions = {
  isoDate?: string | null;
  raceTime?: string | null;
};

const VENUE_COORDINATE_MAP: Record<string, VenueCoordinate> = {
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
  "松戸": { latitude: 35.7843, longitude: 139.9120 },
  "名古屋": { latitude: 35.1850, longitude: 136.8990 },
  "奈良": { latitude: 34.6851, longitude: 135.8048 },
  "大垣": { latitude: 35.3606, longitude: 136.6122 },
  "佐世保": { latitude: 33.1590, longitude: 129.7154 },
  "西武園": { latitude: 35.7764, longitude: 139.4336 },
  "静岡": { latitude: 34.9756, longitude: 138.3828 },
  "立川": { latitude: 35.7101, longitude: 139.4124 },
  "玉野": { latitude: 34.4919, longitude: 133.9457 },
  "取手": { latitude: 35.9117, longitude: 140.0505 },
  "豊橋": { latitude: 34.7692, longitude: 137.3915 },
  "宇都宮": { latitude: 36.5551, longitude: 139.8828 },
  "和歌山": { latitude: 34.2260, longitude: 135.1675 },
  "弥彦": { latitude: 37.7004, longitude: 138.8327 },
  "四日市": { latitude: 34.9650, longitude: 136.6244 },
  "大宮": { latitude: 35.9067, longitude: 139.6233 },
  "小田原": { latitude: 35.2646, longitude: 139.1525 },
  "富山": { latitude: 36.6953, longitude: 137.2113 },
  "松阪": { latitude: 34.5779, longitude: 136.5276 },
  "武雄": { latitude: 33.1946, longitude: 130.0212 },
  "防府": { latitude: 34.0519, longitude: 131.5628 },
  "いわき平": { latitude: 37.0561, longitude: 140.8877 },
};

const venueWeatherCache = new Map<string, VenueWeatherCacheEntry>();

const normalizeVenueWeatherLookupName = (venue?: string | null) => {
  const normalized = (venue ?? "").normalize("NFKC").replace(/競輪場|競輪/g, "").replace(/[\s　]/g, "").trim();
  if (["伊東温泉", "ito", "ito-onsen", "itoonsen"].includes(normalized.toLowerCase())) return "伊東";
  return normalized;
};

VENUE_COORDINATE_MAP["伊東"] = { latitude: 34.9662, longitude: 139.0928 };
VENUE_COORDINATE_MAP["伊東温泉"] = VENUE_COORDINATE_MAP["伊東"];
VENUE_COORDINATE_MAP["ito"] = VENUE_COORDINATE_MAP["伊東"];
VENUE_COORDINATE_MAP["ito-onsen"] = VENUE_COORDINATE_MAP["伊東"];
VENUE_COORDINATE_MAP["itoonsen"] = VENUE_COORDINATE_MAP["伊東"];

const getWeatherLabelFromCode = (code?: number | null) => {
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
    case 56:
    case 57:
      return "着氷性の霧雨";
    case 61:
    case 63:
    case 65:
      return "雨";
    case 66:
    case 67:
      return "着氷性の雨";
    case 71:
    case 73:
    case 75:
      return "雪";
    case 77:
      return "雪粒";
    case 80:
    case 81:
    case 82:
      return "にわか雨";
    case 85:
    case 86:
      return "にわか雪";
    case 95:
      return "雷雨";
    case 96:
    case 99:
      return "雷雨とひょう";
    default:
      return "天気取得中";
  }
};

const getWindDirectionLabel = (degrees?: number | null) => {
  if (degrees === null || degrees === undefined || !Number.isFinite(degrees)) return "--";
  const directions = ["北", "北北東", "北東", "東北東", "東", "東南東", "南東", "南南東", "南", "南南西", "南西", "西南西", "西", "西北西", "北西", "北北西"];
  const index = Math.round((((degrees % 360) + 360) % 360) / 22.5) % 16;
  return directions[index];
};

const formatWeatherUpdatedAt = (isoText?: string | null) => {
  if (!isoText) return "--:--";
  const match = isoText.match(/T(\d{2}:\d{2})/);
  return match?.[1] ?? isoText;
};

const formatWeatherNumber = (value: unknown, unit: string, digits = 0) => {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return `-- ${unit}`;
  return `${number.toFixed(digits)} ${unit}`;
};

const formatWeatherTemperature = (value: unknown) => {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return "--℃";
  return `${Math.round(number)}℃`;
};

const getWeatherTimeMinutes = (value?: string | null) => {
  if (!value) return null;
  const match = value.match(/(?:T)?(\d{2}:\d{2})/);
  if (!match) return null;
  const [hourText, minuteText] = match[1].split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
};

const buildVenueWeatherReferenceText = ({
  raceTime,
  adoptedForecastTime,
  usedCurrentFallback,
}: {
  raceTime?: string | null;
  adoptedForecastTime?: string | null;
  usedCurrentFallback?: boolean;
}) => {
  const raceTimeLabel = raceTime?.trim();
  const adoptedLabel = adoptedForecastTime?.trim();
  if (raceTimeLabel && adoptedLabel) {
    return usedCurrentFallback
      ? `発走基準 ${raceTimeLabel} / 現在値 ${adoptedLabel}`
      : `発走基準 ${raceTimeLabel} / ${adoptedLabel}予報採用`;
  }
  if (raceTimeLabel) return `発走基準 ${raceTimeLabel}`;
  if (adoptedLabel) return usedCurrentFallback ? `現在値 ${adoptedLabel}` : `${adoptedLabel}予報採用`;
  return "基準時刻未取得";
};

const resolveVenueHourlyForecastIndex = ({
  hourlyTimes,
  isoDate,
  raceTime,
}: {
  hourlyTimes: string[];
  isoDate?: string | null;
  raceTime?: string | null;
}) => {
  const targetMinutes = getWeatherTimeMinutes(raceTime);
  if (targetMinutes === null || hourlyTimes.length === 0) return -1;

  const candidates = hourlyTimes
    .map((time, index) => ({ index, date: time.slice(0, 10), minutes: getWeatherTimeMinutes(time) }))
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

async function geocodeVenueCoordinate(venueName: string): Promise<VenueCoordinate | null> {
  const queries = [`${venueName} 競輪場`, `${venueName}, Japan`];
  for (const query of queries) {
    const url = new URL(OPEN_METEO_GEOCODING_URL);
    url.searchParams.set("name", query);
    url.searchParams.set("count", "1");
    url.searchParams.set("language", "ja");
    url.searchParams.set("format", "json");
    url.searchParams.set("countryCode", "JP");
    const response = await fetch(url.toString(), { cache: "force-cache" });
    if (!response.ok) continue;
    const payload = await response.json() as { results?: Array<{ latitude?: number; longitude?: number }> };
    const first = payload.results?.[0];
    if (typeof first?.latitude === "number" && typeof first?.longitude === "number") {
      return { latitude: first.latitude, longitude: first.longitude };
    }
  }
  return null;
}

async function fetchVenueWeather(venueName: string, options: VenueWeatherRequestOptions = {}): Promise<VenueWeatherData> {
  const normalizedVenueName = normalizeVenueWeatherLookupName(venueName);
  const coordinates = VENUE_COORDINATE_MAP[normalizedVenueName] ?? await geocodeVenueCoordinate(normalizedVenueName);
  if (!coordinates) throw new Error("coordinate-not-found");

  const url = new URL(OPEN_METEO_FORECAST_URL);
  url.searchParams.set("latitude", String(coordinates.latitude));
  url.searchParams.set("longitude", String(coordinates.longitude));
  url.searchParams.set("current", "temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,precipitation");
  url.searchParams.set("hourly", "temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,precipitation");
  url.searchParams.set("timezone", "Asia/Tokyo");
  url.searchParams.set("temperature_unit", "celsius");
  url.searchParams.set("wind_speed_unit", "kmh");
  url.searchParams.set("precipitation_unit", "mm");

  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) throw new Error(`weather-fetch-failed-${response.status}`);
  const payload = await response.json() as {
    current?: {
      time?: string;
      temperature_2m?: number;
      apparent_temperature?: number;
      weather_code?: number;
      wind_speed_10m?: number;
      wind_direction_10m?: number;
      precipitation?: number;
    };
    hourly?: {
      time?: string[];
      temperature_2m?: Array<number | null>;
      apparent_temperature?: Array<number | null>;
      weather_code?: Array<number | null>;
      wind_speed_10m?: Array<number | null>;
      wind_direction_10m?: Array<number | null>;
      precipitation?: Array<number | null>;
    };
  };
  const current = payload.current;
  if (!current) throw new Error("weather-current-missing");

  const hourlyTimes = payload.hourly?.time ?? [];
  const hourlyIndex = resolveVenueHourlyForecastIndex({
    hourlyTimes,
    isoDate: options.isoDate,
    raceTime: options.raceTime,
  });
  const useHourly = hourlyIndex >= 0;
  const adoptedTimeText = useHourly
    ? formatWeatherUpdatedAt(hourlyTimes[hourlyIndex])
    : formatWeatherUpdatedAt(current.time);
  const weatherCode = useHourly ? payload.hourly?.weather_code?.[hourlyIndex] : current.weather_code;
  const temperature = useHourly ? payload.hourly?.temperature_2m?.[hourlyIndex] : current.temperature_2m;
  const apparentTemperature = useHourly ? payload.hourly?.apparent_temperature?.[hourlyIndex] : current.apparent_temperature;
  const windSpeed = useHourly ? payload.hourly?.wind_speed_10m?.[hourlyIndex] : current.wind_speed_10m;
  const windDirection = useHourly ? payload.hourly?.wind_direction_10m?.[hourlyIndex] : current.wind_direction_10m;
  const precipitation = useHourly ? payload.hourly?.precipitation?.[hourlyIndex] : current.precipitation;

  return {
    weatherLabel: getWeatherLabelFromCode(typeof weatherCode === "number" ? weatherCode : undefined),
    temperatureText: formatWeatherTemperature(temperature),
    apparentTemperatureText: formatWeatherTemperature(apparentTemperature),
    windSpeedText: formatWeatherNumber(windSpeed, "km/h"),
    windDirectionText: getWindDirectionLabel(typeof windDirection === "number" ? windDirection : undefined),
    precipitationText: formatWeatherNumber(precipitation, "mm", 1),
    updatedAtText: adoptedTimeText,
    referenceText: buildVenueWeatherReferenceText({
      raceTime: options.raceTime,
      adoptedForecastTime: adoptedTimeText,
      usedCurrentFallback: !useHourly,
    }),
  };
}

const inferRaceGradeFromText = (value?: string | null) => {
  const normalized = (value ?? "")
    .trim()
    .replace(/[Ｇｇ]/g, "G")
    .replace(/[ⅠＩ]/g, "I")
    .replace(/[１]/g, "1")
    .replace(/[２]/g, "2")
    .replace(/[３]/g, "3")
    .toUpperCase();

  if (!normalized) return "";
  if (/(^|\s|[^A-Z])(GP)(?=$|\s|[^A-Z0-9])/.test(normalized)) return "GP";
  if (/(^|\s|[^A-Z])(GIII|G3)(?=$|\s|[^A-Z0-9])/.test(normalized)) return "GIII";
  if (/(^|\s|[^A-Z])(GII|G2)(?=$|\s|[^A-Z0-9])/.test(normalized)) return "GII";
  if (/(^|\s|[^A-Z])(GI|G1)(?=$|\s|[^A-Z0-9])/.test(normalized)) return "GI";
  if (/(^|\s|[^A-Z])(F1)(?=$|\s|[^A-Z0-9])/.test(normalized)) return "F1";
  if (/(^|\s|[^A-Z])(F2)(?=$|\s|[^A-Z0-9])/.test(normalized)) return "F2";
  return "";
};

const normalizeRaceGrade = (grade?: string | null, title?: string | null) => {
  return inferRaceGradeFromText(grade) || inferRaceGradeFromText(title) || "";
};

const formatRaceGradeLabel = (grade?: string | null) => {
  const normalized = normalizeRaceGrade(grade);
  if (normalized === "GI") return "G1";
  if (normalized === "GII") return "G2";
  if (normalized === "GIII") return "G3";
  return normalized;
};

const getGradeBadgeTone = (grade: RaceScheduleItem["grade"] | string) => {
  const normalizedGrade = normalizeRaceGrade(grade);

  if (normalizedGrade === "F1") {
    return {
      background: "#fff4e8",
      text: "#c46a1a",
      border: "#f6cfad",
      shadow: "0 4px 12px rgba(196,106,26,0.10)",
    };
  }

  if (normalizedGrade === "GP" || normalizedGrade === "GI" || normalizedGrade === "GII" || normalizedGrade === "GIII") {
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

const toIsoDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const getKeirinNumberColor = (value?: number | string) => {
  const carNo = Number(value);
  const colorMap: Record<number, string> = {
    1: "#ffffff",
    2: "#111111",
    3: "#ef4444",
    4: "#2563eb",
    5: "#facc15",
    6: "#16a34a",
    7: "#f59e0b",
    8: "#f472b6",
    9: "#8b5cf6",
  };
  return colorMap[carNo] ?? "#e5e7eb";
};

const getContrastTextColor = (background: string) => {
  const normalized = background.trim().toLowerCase();
  if (["#ffffff", "#facc15", "#f59e0b", "#e5e7eb"].includes(normalized)) {
    return "#081224";
  }
  return "#ffffff";
};
const compareRaces = (a: RaceScheduleItem, b: RaceScheduleItem) => {
  const gradePriority: Record<string, number> = {
    GP: 0,
    GI: 1,
    GII: 2,
    GIII: 3,
    F1: 4,
    F2: 5,
  };

  const normalizedGradeA = normalizeRaceGrade(a.grade, a.title);
  const normalizedGradeB = normalizeRaceGrade(b.grade, b.title);
  const diff = (gradePriority[normalizedGradeA] ?? 99) - (gradePriority[normalizedGradeB] ?? 99);
  if (diff !== 0) return diff;
  if (a.startDate !== b.startDate) return a.startDate.localeCompare(b.startDate);
  return a.venue.localeCompare(b.venue, "ja");
};

const compareTodayRacesBySession = (a: RaceScheduleItem, b: RaceScheduleItem) => {
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
const todayDate = new Date();
const TODAY = toIsoDateString(todayDate);
const todayRaces = raceScheduleData
  .filter((item) => item.startDate <= TODAY && item.endDate >= TODAY)
  .sort(compareTodayRacesBySession);




type LiveRaceRider = {
  carNo: string;
  name: string;
  style: string;
  score: string;
  comment: string;
  prefecture?: string;
  age?: string | number;
  term?: string | number;
  grade?: string;
  s?: string | number;
  b?: string | number;
  nige?: string | number;
  makuri?: string | number;
  sashi?: string | number;
  mark?: string | number;
  wins?: string | number;
  seconds?: string | number;
  thirds?: string | number;
  loses?: string | number;
  winRate?: string;
  quinellaRate?: string;
  trifectaRate?: string;
  gear?: string | number;
  previousRaceSummary?: string;
  previousRaceResults?: PredictionRiderHistoricalRaceItem[];
  yearlyStats?: PredictionRiderStatsSummaryItem | null;
  sameTrackYearlyStats?: PredictionRiderStatsSummaryItem | null;
  localFiveYearStats?: PredictionRiderStatsSummaryItem | null;
  kdreamsRiderNote?: string;
};

type LiveRaceOddsPreviewItem = {
  combo: string;
  odds: string;
  tag?: string;
};

type LiveRaceTrifectaOddsItem = {
  combination: string;
  odds: number;
  popularity?: number;
  source?: string;
};

type LiveRaceResultPayoutItem = {
  betType?: string;
  combination: string;
  payout: string;
  popularity?: string;
};

type LiveRaceResultEntry = {
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

type LiveRaceResultWeatherActual = {
  weather?: string;
  windDirection?: string;
  windSpeed?: string;
  temperature?: string;
};

type LiveRaceFinishOrderItem = {
  rank: string;
  carNo: string;
  name: string;
  agari?: string;
  gap?: string;
  kimarite?: string;
  mark?: string;
  status?: string;
};

type LiveRaceResult = {
  status?: "pending" | "confirmed";
  finishOrder?: Array<string | LiveRaceFinishOrderItem>;
  kimarite?: string;
  secondKimarite?: string;
  payout2tan?: LiveRaceResultPayoutItem | null;
  payout2fuku?: LiveRaceResultPayoutItem[];
  payout3tan?: LiveRaceResultPayoutItem | null;
  payout3fuku?: LiveRaceResultPayoutItem | null;
  payoutWide?: LiveRaceResultPayoutItem[];
  finalizedAt?: string;
  weatherActual?: LiveRaceResultWeatherActual;
  sLeaderCarNo?: string;
  hLeaderCarNo?: string;
  bLeaderCarNo?: string;
};

type LiveRaceDetail = {
  raceNo: number;
  time: string;
  title?: string;
  lineup?: string;
  sourceNote?: string;
  resultNote?: string;
  weather?: string;
  lead?: string;
  coreBuy?: string;
  coreFade?: string;
  oddsPreview?: LiveRaceOddsPreviewItem[];
  oddsTrifecta?: LiveRaceTrifectaOddsItem[];
  favoriteOdds?: number | null;
  favoriteCombination?: string;
  oddsNote?: string;
  riders?: LiveRaceRider[];
  resultStatus?: "pending" | "confirmed";
  resultTop3?: LiveRaceResultEntry[];
  payouts?: LiveRaceResultPayoutItem[];
  result?: LiveRaceResult;
};

type LiveTodayVenueItem = {
  id: string;
  venue: string;
  title: string;
  grade: string;
  startDate: string;
  endDate: string;
  session: RaceScheduleItem["session"];
  hasGirls: boolean;
  note?: string;
  races?: LiveRaceDetail[];
};

type GeneratedTodayRacesPayload = {
  generatedAt?: string;
  source?: string;
  date?: string;
  venues?: LiveTodayVenueItem[];
};

const normalizeRacesPageStageVenueName = (value?: string | null) =>
  (value ?? "")
    .normalize("NFKC")
    .replace(/競輪場|競輪/g, "")
    .replace(/[\s　]/g, "")
    .replace(/[()（）]/g, "")
    .trim();

const LOCAL_GENERATED_TODAY_RACES_URL = toPublicPath("/scripts/debug/today.generated.local.json");
const GENERATED_TODAY_RACES_URL = toPublicPath("/data/races/today.generated.json");
const GENERATED_TODAY_RACES_URL_CANDIDATES = import.meta.env.DEV
  ? [LOCAL_GENERATED_TODAY_RACES_URL, GENERATED_TODAY_RACES_URL]
  : [GENERATED_TODAY_RACES_URL];

async function fetchGeneratedTodayRacesPayload(dateKey: string) {
  let lastError: unknown = null;
  const payloads: GeneratedTodayRacesPayload[] = [];

  for (const url of GENERATED_TODAY_RACES_URL_CANDIDATES) {
    try {
      const response = await fetch(`${url}?date=${dateKey}`, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`failed to load generated races: ${response.status}`);
      }
      payloads.push(await response.json() as GeneratedTodayRacesPayload);
    } catch (error) {
      lastError = error;
    }
  }

  if (payloads.length > 0) {
    return payloads
      .sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")))[0];
  }

  throw lastError ?? new Error("failed to load generated races");
}

function normalizeGeneratedSession(value: unknown): RaceScheduleItem["session"] {
  if (value === "night" || value === "midnight") return value;
  return "day";
}

function formatRacesPageResultOrder(value?: string[] | null) {
  if (!Array.isArray(value) || value.length < 3) return "未確定";
  return value.slice(0, 3).join("-");
}

function mapRacesPageFinishOrderToRows(items?: Array<string | LiveRaceFinishOrderItem> | null) {
  if (!Array.isArray(items) || items.length === 0) return [] as LiveRaceResultEntry[];
  return items
    .map((item): LiveRaceResultEntry | null => {
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
    .filter((item): item is LiveRaceResultEntry => item !== null);
}

function extractRacesPageFinishOrderCarNos(items?: Array<string | LiveRaceFinishOrderItem> | null) {
  return (items ?? []).map((item) => typeof item === "string" ? item : item?.carNo).filter((item): item is string => Boolean(item));
}

function formatRacesPageResultPayout(item?: {
  combination?: string | null;
  payout?: string | null;
} | string | number | null) {
  if (item === null || item === undefined || item === "") return "--";
  if (typeof item === "string") return item;
  if (typeof item === "number") return `${item.toLocaleString()}円`;
  const combination = typeof item.combination === "string" && item.combination.trim()
    ? item.combination.trim()
    : "";
  const payout = typeof item.payout === "string" && item.payout.trim()
    ? item.payout.trim()
    : "";
  if (combination && payout) return `${combination} ${payout}`;
  if (combination) return combination;
  if (payout) return payout;
  return "--";
}

function formatRacesPageResultPayoutList(items?: LiveRaceResultPayoutItem[] | string | number | null) {
  if (items === null || items === undefined || items === "") return "--";
  if (typeof items === "string") return items;
  if (typeof items === "number") return `${items.toLocaleString()}円`;
  if (!Array.isArray(items) || items.length === 0) return "--";
  const seen = new Set<string>();
  return items
    .map((item) => formatRacesPageResultPayout(item))
    .filter((item) => item !== "--")
    .filter((item) => {
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    })
    .join(" / ") || "--";
}

function getRacesPageFullResultScopeNote(race?: LiveRaceDetail) {
  return String(race?.sourceNote ?? race?.resultNote ?? "").includes("KDreamsでは3着まで")
    ? "注記: KDreamsでは3着まで"
    : "";
}

function cleanRacesPageRiderName(value?: string) {
  return String(value ?? "")
    .replace(/お気に入り選手\s*-->/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function findRacesPageResultEntryByCarNo(race: LiveRaceDetail | undefined, carNo?: string) {
  if (!carNo) return undefined;
  return (race?.resultTop3 ?? []).find((entry) => entry.carNo === carNo);
}

function getRacesPageLeaderCarNoFromEntries(
  entries: LiveRaceResultEntry[],
  mark: "sMark" | "hMark" | "bMark"
) {
  return entries.find((entry) => entry[mark])?.carNo;
}

function resolveRacesPageLeaderCarNos(race: LiveRaceDetail | undefined) {
  const entries = race?.resultTop3 ?? [];

  return {
    sLeaderCarNo:
      race?.result?.sLeaderCarNo || getRacesPageLeaderCarNoFromEntries(entries, "sMark"),
    hLeaderCarNo:
      race?.result?.hLeaderCarNo || getRacesPageLeaderCarNoFromEntries(entries, "hMark"),
    bLeaderCarNo:
      race?.result?.bLeaderCarNo || getRacesPageLeaderCarNoFromEntries(entries, "bMark"),
  };
}

function normalizeRacesPageRaceWithLeaderMarks(race: LiveRaceDetail): LiveRaceDetail {
  const leaders = resolveRacesPageLeaderCarNos(race);

  if (!leaders.sLeaderCarNo && !leaders.hLeaderCarNo && !leaders.bLeaderCarNo) {
    return race;
  }

  return {
    ...race,
    result: {
      ...(race.result ?? { status: race.resultStatus ?? "pending" }),
      sLeaderCarNo: leaders.sLeaderCarNo,
      hLeaderCarNo: leaders.hLeaderCarNo,
      bLeaderCarNo: leaders.bLeaderCarNo,
    },
  };
}

function normalizeRacesPageVenueWithLeaderMarks(venue: LiveTodayVenueItem): LiveTodayVenueItem {
  return {
    ...venue,
    races: (venue.races ?? []).map(normalizeRacesPageRaceWithLeaderMarks),
  };
}

function formatRacesPageLeaderText(race: LiveRaceDetail | undefined) {
  const leaders = resolveRacesPageLeaderCarNos(race);

  const sEntry = findRacesPageResultEntryByCarNo(race, leaders.sLeaderCarNo);
  const hEntry = findRacesPageResultEntryByCarNo(race, leaders.hLeaderCarNo);
  const bEntry = findRacesPageResultEntryByCarNo(race, leaders.bLeaderCarNo);
  const sName = cleanRacesPageRiderName(sEntry?.name);
  const hName = cleanRacesPageRiderName(hEntry?.name);
  const bName = cleanRacesPageRiderName(bEntry?.name);

  const parts = [
  leaders.sLeaderCarNo
    ? `S: ${leaders.sLeaderCarNo}${sName ? ` ${sName}` : ""}`
    : "",
  leaders.hLeaderCarNo
    ? `H: ${leaders.hLeaderCarNo}${hName ? ` ${hName}` : ""}`
    : "",
  leaders.bLeaderCarNo
    ? `B: ${leaders.bLeaderCarNo}${bName ? ` ${bName}` : ""}`
    : "",
].filter(Boolean);

  return parts.length > 0 ? parts.join(" / ") : "S/H/B 未取得";
}

function findStaticRaceForLiveVenue(
  venue: string,
  targetIsoDate: string,
  session: RaceScheduleItem["session"],
  grade?: string,
) {
  const normalizedVenue = normalizeRacesPageStageVenueName(venue);
  const normalizedGrade = normalizeRaceGrade(grade);

  return raceScheduleData.find((race) =>
    normalizeRacesPageStageVenueName(race.venue) === normalizedVenue &&
    race.startDate <= targetIsoDate &&
    race.endDate >= targetIsoDate &&
    race.session === session &&
    (!normalizedGrade || normalizeRaceGrade(race.grade, race.title) === normalizedGrade),
  );
}

function mapStaticRaceToLiveVenue(race: RaceScheduleItem): LiveTodayVenueItem {
  return {
    id: race.id,
    venue: race.venue,
    title: race.title,
    grade: normalizeRaceGrade(race.grade, race.title),
    startDate: race.startDate,
    endDate: race.endDate,
    session: race.session,
    hasGirls: race.hasGirls,
    note: race.note,
    races: [],
  };
}

function useGeneratedTodayRaces() {
  const [generatedTodayRaces, setGeneratedTodayRaces] = useState<LiveTodayVenueItem[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string>("");
  const [generatedDate, setGeneratedDate] = useState<string>(TODAY);

  useEffect(() => {
    let isMounted = true;

    const today = new Date();
    const dateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    fetchGeneratedTodayRacesPayload(dateKey)
      .then((payload) => {
        if (!isMounted) return;
        const feedDate = typeof payload.date === "string" && payload.date ? payload.date : dateKey;
        const venues = Array.isArray(payload.venues)
          ? payload.venues.map((item) => {
              const session = normalizeGeneratedSession(item.session);
              const fallbackRace = findStaticRaceForLiveVenue(item.venue, feedDate, session, item.grade);
              return {
                ...item,
  session,
  title: item.title || fallbackRace?.title || item.venue,
  grade: normalizeRaceGrade(item.grade || fallbackRace?.grade, item.title || fallbackRace?.title),
  startDate: item.startDate || fallbackRace?.startDate || "",
  endDate: item.endDate || fallbackRace?.endDate || "",
  races: Array.isArray(item.races)
                  ? item.races.map((race) => ({
                      ...race,
                      oddsPreview: Array.isArray(race.oddsPreview)
                        ? race.oddsPreview.filter(
                            (item): item is LiveRaceOddsPreviewItem =>
                              Boolean(item) &&
                              typeof item.combo === "string" &&
                              typeof item.odds === "string"
                          )
                        : [],
                      oddsTrifecta: Array.isArray(race.oddsTrifecta)
                        ? race.oddsTrifecta.filter(
                            (item): item is LiveRaceTrifectaOddsItem =>
                              Boolean(item) &&
                              typeof item.combination === "string" &&
                              typeof item.odds === "number"
                          )
                        : [],
                      riders: Array.isArray(race.riders) ? race.riders : [],
                      resultNote: typeof race.resultNote === "string" ? race.resultNote : "",
                      resultTop3: Array.isArray(race.resultTop3)
                        ? race.resultTop3.filter(
                            (item): item is LiveRaceResultEntry =>
                              Boolean(item) &&
                              typeof item.place === "string" &&
                              typeof item.carNo === "string" &&
                              typeof item.name === "string"
                          )
                        : [],
                      payouts: Array.isArray(race.payouts)
                        ? race.payouts.filter(
                            (item): item is LiveRaceResultPayoutItem =>
                              Boolean(item) &&
                              typeof item.combination === "string" &&
                              typeof item.payout === "string"
                          )
                        : [],
                      result: race.result && typeof race.result === "object"
                        ? {
                            status: race.result.status === "confirmed"
                              ? "confirmed" as const
                              : "pending" as const,
                            finishOrder: Array.isArray(race.result.finishOrder)
                              ? race.result.finishOrder.filter((item): item is string | LiveRaceFinishOrderItem => {
                                  if (typeof item === "string") return true;
                                  return Boolean(item) && typeof item.rank === "string" && typeof item.carNo === "string" && typeof item.name === "string";
                                })
                              : [],
                            kimarite: typeof race.result.kimarite === "string" ? race.result.kimarite : "",
                            secondKimarite: typeof race.result.secondKimarite === "string" ? race.result.secondKimarite : "",
                            payout2tan: race.result.payout2tan && typeof race.result.payout2tan === "object" && typeof race.result.payout2tan.combination === "string" && typeof race.result.payout2tan.payout === "string"
                              ? race.result.payout2tan as LiveRaceResultPayoutItem
                              : null,
                            payout2fuku: Array.isArray(race.result.payout2fuku)
                              ? race.result.payout2fuku.filter(
                                  (item): item is LiveRaceResultPayoutItem => Boolean(item) && typeof item.combination === "string" && typeof item.payout === "string"
                                )
                              : [],
                            payout3tan: race.result.payout3tan && typeof race.result.payout3tan === "object" && typeof race.result.payout3tan.combination === "string" && typeof race.result.payout3tan.payout === "string"
                              ? race.result.payout3tan as LiveRaceResultPayoutItem
                              : null,
                            payout3fuku: race.result.payout3fuku && typeof race.result.payout3fuku === "object" && typeof race.result.payout3fuku.combination === "string" && typeof race.result.payout3fuku.payout === "string"
                              ? race.result.payout3fuku as LiveRaceResultPayoutItem
                              : null,
                            payoutWide: Array.isArray(race.result.payoutWide)
                              ? race.result.payoutWide.filter(
                                  (item): item is LiveRaceResultPayoutItem => Boolean(item) && typeof item.combination === "string" && typeof item.payout === "string"
                                )
                              : [],
                            finalizedAt: typeof race.result.finalizedAt === "string" ? race.result.finalizedAt : "",
                            weatherActual: race.result.weatherActual && typeof race.result.weatherActual === "object"
                              ? {
                                  weather: typeof race.result.weatherActual.weather === "string" ? race.result.weatherActual.weather : undefined,
                                  windDirection: typeof race.result.weatherActual.windDirection === "string" ? race.result.weatherActual.windDirection : undefined,
                                  windSpeed: typeof race.result.weatherActual.windSpeed === "string" ? race.result.weatherActual.windSpeed : undefined,
                                  temperature: typeof race.result.weatherActual.temperature === "string" ? race.result.weatherActual.temperature : undefined,
                                }
                              : undefined,
                            sLeaderCarNo: typeof race.result.sLeaderCarNo === "string" ? race.result.sLeaderCarNo : "",
                            hLeaderCarNo: typeof race.result.hLeaderCarNo === "string" ? race.result.hLeaderCarNo : "",
                            bLeaderCarNo: typeof race.result.bLeaderCarNo === "string" ? race.result.bLeaderCarNo : "",
                          }
                        : undefined,
                    }))
                  : [],
              };
            })
          : [];
        setGeneratedTodayRaces(venues.map(normalizeRacesPageVenueWithLeaderMarks));
        setGeneratedAt(payload.generatedAt ?? "");
        setGeneratedDate(feedDate);
      })
      .catch(() => {
        if (!isMounted) return;
        setGeneratedTodayRaces([]);
        setGeneratedAt("");
        setGeneratedDate(TODAY);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return { generatedTodayRaces, generatedAt, generatedDate };
}




const normalizeRacesPageSessionLabel = (value?: string | null) => {
  const normalized = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/　/g, " ");

  if (
    normalized.includes("midnight") ||
    normalized.includes("ミッドナイト")
  ) {
    return "🌟ミッドナイト";
  }

  if (
    normalized.includes("night") ||
    normalized.includes("ナイター")
  ) {
    return "🌙ナイター";
  }

  if (
    normalized.includes("morning") ||
    normalized.includes("モーニング") ||
    normalized.includes("あさレース") ||
    normalized.includes("朝")
  ) {
    return "🐣モーニング";
  }

  return "🌞デイ";
};

const getRacesPageVenueSessionLabel = (venue: LiveTodayVenueItem | null | undefined) => {
  const band = getVenueTimeBand(venue);
  if (band === "morning") return normalizeRacesPageSessionLabel("morning");
  if (band === "day") return normalizeRacesPageSessionLabel("day");
  if (band === "night") return normalizeRacesPageSessionLabel("night");
  if (band === "midnight") return normalizeRacesPageSessionLabel("midnight");
  return normalizeRacesPageSessionLabel("day");
};

const getRacesPageCarTone = (carNo: string) => {
  const tones: Record<string, { bg: string; text: string; border: string }> = {
    "1": { bg: "#ffffff", text: "#111827", border: "#d1d5db" },
    "2": { bg: "#111827", text: "#ffffff", border: "#111827" },
    "3": { bg: "#ef4444", text: "#ffffff", border: "#ef4444" },
    "4": { bg: "#2563eb", text: "#ffffff", border: "#2563eb" },
    "5": { bg: "#facc15", text: "#111827", border: "#eab308" },
    "6": { bg: "#16a34a", text: "#ffffff", border: "#16a34a" },
    "7": { bg: "#f97316", text: "#ffffff", border: "#f97316" },
    "8": { bg: "#ec4899", text: "#ffffff", border: "#ec4899" },
    "9": { bg: "#8b5cf6", text: "#ffffff", border: "#8b5cf6" },
  };

  return tones[carNo] ?? { bg: "#f3f4f6", text: "#111827", border: "#d1d5db" };
};

const getRacesPageStageLabel = (venue: LiveTodayVenueItem | null | undefined, targetIsoDate = TODAY) => {
  return getRaceEventDayLabel({
    startDate: venue?.startDate,
    endDate: venue?.endDate,
    targetDate: targetIsoDate,
  });
};

const parseRaceTimeToMinutes = (time?: string) => {
  if (!time) return null;
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
};

const getVenueFirstRaceMinutes = (venue: LiveTodayVenueItem | null | undefined) => {
  if (!venue?.races?.length) return null;
  const minutes = venue.races
    .map((race) => parseRaceTimeToMinutes(race.time))
    .filter((value): value is number => value !== null);
  if (!minutes.length) return null;
  return Math.min(...minutes);
};

const getVenueTimeBand = (venue: LiveTodayVenueItem | null | undefined) => {
  const firstRaceMinutes = getVenueFirstRaceMinutes(venue);
  if (firstRaceMinutes === null) return "day";
  if (firstRaceMinutes < 600) return "morning";
  if (firstRaceMinutes < 900) return "day";
  if (firstRaceMinutes < 1200) return "night";
  return "midnight";
};



const getVenueSessionSortRank = (venue: LiveTodayVenueItem | null | undefined) => {
  const band = getVenueTimeBand(venue);
  if (band === "morning") return 0;
  if (band === "day") return 1;
  if (band === "night") return 2;
  if (band === "midnight") return 3;
  return 9;
};

const FAVORITE_RIDER_NAMES = ["眞杉匠", "恩田淳平", "片岡迪之"] as const;

const hasFavoriteRiderInVenue = (venue: LiveTodayVenueItem | null | undefined): boolean => {
  if (!venue?.races?.length) return false;
  return venue.races.some(
    (race) =>
      Array.isArray(race.riders) &&
      race.riders.some((rider) =>
        FAVORITE_RIDER_NAMES.some((favName) => rider.name?.includes(favName))
      )
  );
};

type VenueBankIndexItem = {
  venueKey: string;
  venueName: string;
  file: string;
  aliases?: string[];
};

type RacesPageVenueBankSummary = {
  venueType: string;
  venueMemo: string;
  bankLength: string;
  feature: string;
  target: string;
  caution: string;
  volatilityLabel: string;
  volatilityNote: string;
  source: string;
};

type RacesPageVenueGuideSummary = {
  venueType: string;
  venueMemo: string;
  bankLength: string;
  bankCharacter: string;
  target: string;
  caution: string;
  volatility: {
    label: string;
    note: string;
  };
  statusLabel: string;
  hasData: boolean;
};

const VENUE_BANK_INDEX_URL = toPublicPath("/data/venues/banks/index.json");

const DEFAULT_RACES_PAGE_VENUE_BANK_SUMMARY: RacesPageVenueBankSummary = {
  venueType: "未登録",
  venueMemo: "",
  bankLength: "未登録",
  feature: "会場特徴データ未接続",
  target: "確認中",
  caution: "確認中",
  volatilityLabel: "確認中",
  volatilityNote: "確認中",
  source: "bank file pending",
};

const normalizeVenueNameForBankLookup = (value?: string | null) =>
  (value ?? "")
    .normalize("NFKC")
    .replace(/競輪場|競輪/g, "")
    .replace(/[\u3000\s]+/g, "")
    .replace(/[()（）]/g, "")
    .trim();

const normalizeVenueBankAlias = (value?: string | null) => {
  const normalized = normalizeVenueNameForBankLookup(value).replace(/競輪場|競輪/g, "");
  if (["伊東温泉", "ito", "ito-onsen", "itoonsen"].includes(normalized.toLowerCase())) return "伊東";
  return normalized;
};

const resolveRacesPageVenueBankFetchPath = (venueName?: string | null, file?: string | null) => {
  const normalizedVenueKey = normalizeVenueNameForBankLookup(venueName);
  if (normalizedVenueKey === "いわき平") return toPublicPath("/data/venues/banks/iwaki-daira.md");
  return file ? toPublicPath(file) : "";
};

const toCompactSingleLine = (value?: string | null) =>
  (value ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[>*#-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const clipVenueBankText = (value: string, max = 78) => {
  if (value.length <= max) return value;
  return `${value.slice(0, max).trim()}…`;
};

const normalizeVenueGuideComparisonText = (value?: string | null) =>
  (value ?? "")
    .replace(/[。．、,，・｜|／/→]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const isNearDuplicateVenueGuideText = (left?: string | null, right?: string | null) => {
  const normalizedLeft = normalizeVenueGuideComparisonText(left);
  const normalizedRight = normalizeVenueGuideComparisonText(right);
  if (!normalizedLeft || !normalizedRight) return false;
  if (normalizedLeft === normalizedRight) return true;
  if (normalizedLeft.length >= 12 && normalizedRight.includes(normalizedLeft)) return true;
  if (normalizedRight.length >= 12 && normalizedLeft.includes(normalizedRight)) return true;
  return false;
};

const findFirstVenueBankLine = (markdown: string, patterns: RegExp[]) => {
  const lines = markdown.split(/\r?\n/);
  for (const line of lines) {
    const compact = line.trim();
    if (!compact) continue;
    for (const pattern of patterns) {
      const match = compact.match(pattern);
      if (match?.[1]) return toCompactSingleLine(match[1]);
    }
  }
  return "";
};

const findVenueBankParagraph = (markdown: string, labels: string[]) => {
  const lines = markdown.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const compact = lines[index].trim();
    if (!compact) continue;
    if (!labels.some((label) => compact.includes(label))) continue;

    const inlineValue = toCompactSingleLine(
      compact
        .replace(/^[-*#>\s]+/, "")
        .replace(/\*\*/g, "")
        .replace(new RegExp(`^(${labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\s*[:：]?\s*`, "i"), "")
    );
    if (inlineValue && !labels.some((label) => inlineValue === label)) return inlineValue;

    const blockLines = [];
    for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
      const nextLine = lines[nextIndex].trim();
      if (!nextLine) {
        if (blockLines.length) break;
        continue;
      }
      if (/^#{1,6}\s/.test(nextLine) || /^---+$/.test(nextLine) || /^\|/.test(nextLine) || /^\*\*.+\*\*$/.test(nextLine)) break;
      blockLines.push(nextLine.replace(/^[-*]\s*/, ""));
      if (blockLines.length >= 2) break;
    }
    const blockValue = toCompactSingleLine(blockLines.join(" "));
    if (blockValue) return blockValue;
  }
  return "";
};

const formatVenueBankSpecValue = (value?: string | null, unit = "") => {
  if (!value) return "";
  const compact = toCompactSingleLine(value);
  if (!compact) return "";
  const match = compact.match(/\d+(?:\.\d+)?(?:°[^\s]*)?/);
  if (!match?.[0]) return compact;
  return `${match[0]}${unit}`;
};

const deriveVenueBankLengthSummary = (markdown: string, fallback: string) => {
  const circumference =
    formatVenueBankSpecValue(findFirstVenueBankLine(markdown, [/周長\s*[:：]\s*([^\n]+)/i]), "m") ||
    formatVenueBankSpecValue(findFirstVenueBankLine(markdown, [/バンク長\s*[:：]\s*([^\n]+)/i]), "m");
  const straight = formatVenueBankSpecValue(findFirstVenueBankLine(markdown, [/見なし直線\s*[:：]\s*([^\n]+)/i]), "m");
  const bank =
    formatVenueBankSpecValue(findFirstVenueBankLine(markdown, [/カント\s*[:：]\s*([^\n]+)/i])) ||
    formatVenueBankSpecValue(findFirstVenueBankLine(markdown, [/センター\s*[:：]\s*([^\n]+)/i]));

  const parts = [
    circumference ? `周長${circumference}` : "",
    straight ? `見なし直線${straight}` : "",
    bank ? `カント${bank}` : "",
  ].filter(Boolean);

  return parts.length ? parts.join(" / ") : fallback;
};

const deriveVenueBankType = (bankLength: string, feature: string, venueMemo: string) => {
  const source = `${bankLength} ${feature} ${venueMemo}`;
  if (/333|335/.test(source)) return "短走路・小回り";
  if (/500/.test(source)) return "500m・持久力型";
  if (/400/.test(source) && /差し|追込|直線/.test(source)) return "400m・差し注意";
  if (/400/.test(source) && /軽い|高速|捲り|カマシ/.test(source)) return "400m・高速寄り";
  if (/400/.test(source)) return "400m・標準寄り";
  return "標準寄り";
};

const deriveVenueTypeNote = (venueType: string, feature: string, bankProfile: RacesPageBankProfile) => {
  const source = `${venueType} ${feature}`;
  if (/差し|追込|直線/.test(source)) return "標準寄りでも、差し脚の届き方まで見たい。";
  if (/高速|捲り|カマシ/.test(source)) return "スピードに乗りやすく、早めの仕掛けが効きやすい。";
  if (/短走路|小回り/.test(source)) return "仕掛けが早まりやすく、位置取りの巧拙が出やすい。";
  if (/500m|持久力/.test(source)) return "持久力勝負になりやすく、先行ラインの粘りを見たい。";
  return clipVenueBankText(bankProfile.paceMemo || "主導権候補と番手の質を見たい。", 34);
};

const deriveVenueBankMemo = (feature: string, markdown: string) => {
  const source = `${feature} ${markdown}`;
  if (/時間帯.*変|モーニング|ナイター|ミッド/.test(source)) return "時間帯ごとの差を見ながら組み立てたい会場。";
  if (/風|向かい風|追い風|横風/.test(source)) return "バック側の風向きで仕掛け所が変わりやすい。";
  if (/単騎|4分戦|隊列/.test(source)) return "隊列が崩れると3着のズレまで見たい。";
  if (/差し|追込/.test(source)) return "番手からの差し込みまで見ておきたい。";
  if (/捲り|カマシ|先行/.test(source)) return "自力型の仕掛けタイミングが結果を動かしやすい。";
  return "並びと主導権候補を先に見ておきたい会場。";
};

const deriveVenueBankVolatility = (markdown: string, chaosHint: string) => {
  const source = markdown.replace(/,/g, "");
  const mankenMatch = source.match(/万車[^\d]{0,8}(\d+(?:\.\d+)?)\s*%/i);
  const mankenRate = mankenMatch ? Number(mankenMatch[1]) : null;

  if (mankenRate !== null && Number.isFinite(mankenRate)) {
    if (mankenRate >= 30) {
      return { label: "高め", note: `万車率${mankenRate.toFixed(1)}%前後。相手ズレまで見たい。` };
    }
    if (mankenRate >= 20) {
      return { label: "中くらい", note: `万車率${mankenRate.toFixed(1)}%前後。3着の抜けに注意。` };
    }
    return { label: "低め", note: `万車率${mankenRate.toFixed(1)}%前後。まずは本線優先。` };
  }

  if (/波乱|単騎|4分戦|着ズレ/.test(source)) return { label: "高め", note: "隊列が崩れると配当が跳ねやすい。" };
  if (/差し|追込|風/.test(source)) return { label: "中くらい", note: "番手差しと相手ズレを両方見たい。" };
  return { label: "低め", note: clipVenueBankText(chaosHint || "まずは本線ラインの完成度を優先。", 34) };
};

const deriveVenueBankTarget = (feature: string, markdown: string) => {
  const source = `${feature} ${markdown}`;
  if (/番手差し|差し届|差し優勢|追込/.test(source)) return "番手差し・差し脚上位を優先。";
  if (/三番手残り|直列残り/.test(source)) return "ライン3番手まで残り目を押さえたい。";
  if (/捲り|機動力|カマシ/.test(source)) return "機動力上位の捲り・カマシを高め評価。";
  if (/先行|逃げ/.test(source)) return "主導権を取れる先行ラインから組み立て。";
  return "主導権ラインと番手差しをセットで確認。";
};

const deriveVenueBankCaution = (feature: string, markdown: string) => {
  const source = `${feature} ${markdown}`;
  if (/強風|風が強い|風向/.test(source)) return "風向きが強い日は傾向変動あり。直前気配を優先。";
  if (/波乱|荒れ/.test(source)) return "人気一本より、相手ズレと3着穴を残したい。";
  if (/直線長|差し届/.test(source)) return "逃げ一本の押し切り決め打ちはやや危険。";
  if (/ミッド|ナイター/.test(source)) return "時間帯で流れが変わりやすい。位置取りも要確認。";
  return "当日の並びと主導権候補がズレたら印を寄せ直す。";
};

const parseVenueBankSummary = (markdown: string): RacesPageVenueBankSummary => {
  const summaryBlockMatch = markdown.match(/##\s*SUMMARY([\s\S]*?)(?=\n##\s|$)/i);
  const summaryBlock = summaryBlockMatch?.[1] ?? "";

  const fromSummary = (label: string) => {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = summaryBlock.match(new RegExp(`(?:^|\\n)\\s*[-*]?\\s*${escaped}\\s*[:：]\\s*(.+)`, "i"));
    return toCompactSingleLine(match?.[1]);
  };

  const rawBankLength =
    fromSummary("バンク長") ||
    findFirstVenueBankLine(markdown, [
      /バンク長\s*[:：]\s*([^\n]+)/i,
      /会場[:：].*?[（(]\s*(\d{3,4})\s*[）)]/i,
    ]) ||
    "確認中";
  const bankLength = deriveVenueBankLengthSummary(markdown, rawBankLength);

  const venueMemo =
    fromSummary("会場メモ") ||
    findVenueBankParagraph(markdown, ["時間帯別バイアス", "時間帯別の組み立て", "風・天候 → 展開の法則"]) ||
    deriveVenueBankMemo("", markdown);

  const feature =
    fromSummary("バンク特徴") ||
    fromSummary("ひとこと特徴") ||
    findVenueBankParagraph(markdown, ["直線係数", "遠心力バイアス", "重力・抵抗", "特徴メモ"]) ||
    findFirstVenueBankLine(markdown, [
      /バンク特性\s*[:：]\s*([^\n]+)/i,
      /バンク体感[^:：]*[:：]\s*([^\n]+)/i,
      /所感\s*[:：]\s*([^\n]+)/i,
    ]) ||
    DEFAULT_RACES_PAGE_VENUE_BANK_SUMMARY.feature;

  const target = fromSummary("狙いどころ") || deriveVenueBankTarget(feature, markdown);
  const caution = fromSummary("注意点") || deriveVenueBankCaution(feature, markdown);
  const venueType = fromSummary("会場タイプ") || deriveVenueBankType(bankLength, feature, venueMemo);
  const volatility = deriveVenueBankVolatility(markdown, "");

  return {
    venueType: clipVenueBankText(venueType, 26),
    venueMemo: clipVenueBankText(venueMemo, 72),
    bankLength: clipVenueBankText(bankLength, 36),
    feature: clipVenueBankText(feature, 92),
    target: clipVenueBankText(target, 72),
    caution: clipVenueBankText(caution, 72),
    volatilityLabel: volatility.label,
    volatilityNote: clipVenueBankText(volatility.note, 48),
    source: summaryBlockMatch ? "SUMMARY" : "auto-extract",
  };
};

const buildRacesPageVenueGuideSummary = (options: {
  bankSummary: RacesPageVenueBankSummary | null;
  bankProfile: RacesPageBankProfile;
  hasBankDataFile: boolean;
  isBankDataLoading: boolean;
}): RacesPageVenueGuideSummary => {
  const { bankSummary, bankProfile, hasBankDataFile, isBankDataLoading } = options;
  const hasData = Boolean(bankSummary && bankSummary.source !== DEFAULT_RACES_PAGE_VENUE_BANK_SUMMARY.source);

  if (hasData && bankSummary) {
    const venueType = bankSummary.venueType || bankProfile.shortLabel;
    const venueTypeNote = deriveVenueTypeNote(venueType, bankSummary.feature, bankProfile);
    const venueMemo =
      isNearDuplicateVenueGuideText(bankSummary.venueMemo, bankSummary.feature) ||
      isNearDuplicateVenueGuideText(bankSummary.venueMemo, venueTypeNote)
        ? ""
        : bankSummary.venueMemo;

    return {
      venueType,
      venueMemo: venueMemo || venueTypeNote,
      bankLength: bankSummary.bankLength,
      bankCharacter: bankSummary.feature,
      target: bankSummary.target,
      caution: bankSummary.caution,
      volatility: {
        label: bankSummary.volatilityLabel || "中くらい",
        note: bankSummary.volatilityNote || clipVenueBankText(bankProfile.chaosHint, 48),
      },
      statusLabel: `会場特徴連携済み：${bankSummary.source}`,
      hasData: true,
    };
  }

  if (isBankDataLoading) {
    return {
      venueType: "確認中",
      venueMemo: "",
      bankLength: "確認中",
      bankCharacter: "会場特徴データ読込中",
      target: "確認中",
      caution: "確認中",
      volatility: {
        label: "確認中",
        note: "確認中",
      },
      statusLabel: "会場特徴データ読込中",
      hasData: false,
    };
  }

  if (!hasBankDataFile) {
    return {
      venueType: "未登録",
      venueMemo: "",
      bankLength: "未登録",
      bankCharacter: "会場特徴データ未接続",
      target: "確認中",
      caution: "確認中",
      volatility: {
        label: "確認中",
        note: "確認中",
      },
      statusLabel: "別ページ側データ未登録",
      hasData: false,
    };
  }

  return {
    venueType: "未登録",
    venueMemo: "",
    bankLength: "未登録",
    bankCharacter: "会場特徴データ未接続",
    target: "確認中",
    caution: "確認中",
    volatility: {
      label: "確認中",
      note: "確認中",
    },
    statusLabel: "会場特徴データ未接続",
    hasData: false,
  };
};

type RacesPageStyleBucket = "front" | "attack" | "mark" | "chase" | "balanced";

type RacesPageBankProfile = {
  shortLabel: string;
  bankFeature: string;
  paceMemo: string;
  chaosHint: string;
  favorBuckets: RacesPageStyleBucket[];
  holeBuckets: RacesPageStyleBucket[];
  mainMemo: string;
  cautionMemo: string;
};

const DEFAULT_RACES_PAGE_BANK_PROFILE: RacesPageBankProfile = {
  shortLabel: "標準バンク",
  bankFeature: "標準寄り。極端な決め打ちより、先行力と番手のバランス確認が先。",
  paceMemo: "主導権候補と番手の質をセットで確認したい会場。",
  chaosHint: "ラインの質と得点差を優先して組み立て。",
  favorBuckets: ["front", "mark"],
  holeBuckets: ["attack", "balanced"],
  mainMemo: "先行ラインの残り目と番手差しを基本線に置きやすい。",
  cautionMemo: "単騎の一発より、まずラインの完成度を優先。",
};

const RACES_PAGE_BANK_PROFILE_MAP: Record<string, RacesPageBankProfile> = {
  "取手": {
    shortLabel: "モーニング寄り標準",
    bankFeature: "朝開催でも流れは素直寄り。先行ラインの残り目と番手差しを基本線に。",
    paceMemo: "主導権を取り切れる自力型がいるかを先に確認。",
    chaosHint: "前が強いとそのまま残りやすく、無理な穴狙いは広がりやすい。",
    favorBuckets: ["front", "mark"],
    holeBuckets: ["attack"],
    mainMemo: "先行選手の踏み直しと番手の差し脚をセット評価。",
    cautionMemo: "単騎の捲りを本命固定しすぎない。",
  },
  "伊東": {
    shortLabel: "デイ・直線意識",
    bankFeature: "直線の使い方を見たい会場。番手・追込みの差し込みが届きやすい組み立て。",
    paceMemo: "前受けからの番手有利、または捲り追込みの差し込みに注意。",
    chaosHint: "前が踏み合うと差しが浮上しやすく、人気一本被りは崩れやすい。",
    favorBuckets: ["mark", "chase"],
    holeBuckets: ["attack"],
    mainMemo: "先行一車なら番手本線、主導権争いなら差し筋まで見る。",
    cautionMemo: "逃げ一本の押し切り決め打ちはやや危険。",
  },
  "高知": {
    shortLabel: "デイ・機動力勝負",
    bankFeature: "自力型の踏み合いが形を作りやすい。先行・捲りの機動力を高めに評価。",
    paceMemo: "前を取りに行く自力型が複数いると、主導権争いから波乱も。",
    chaosHint: "機動力比較がズレると一気に裏目へ。穴は自力型の3番手候補。",
    favorBuckets: ["front", "attack"],
    holeBuckets: ["balanced", "mark"],
    mainMemo: "先行力と捲り脚の両方がある選手を上位に。",
    cautionMemo: "追込み型だけで印を固めすぎない。",
  },
  "小倉": {
    shortLabel: "ミッドナイト巧者",
    bankFeature: "ミッドは位置取りと番手差しを丁寧に見たい。人気筋でも並び次第で逆転あり。",
    paceMemo: "位置取りの上手さと番手のキープ力が重要。",
    chaosHint: "隊列が短いと差し比べになりやすい。",
    favorBuckets: ["mark", "balanced"],
    holeBuckets: ["attack"],
    mainMemo: "脚質単体より並びと位置取り重視。",
    cautionMemo: "自力一点の押し切り想定だけでは危ない。",
  },
  "玉野": {
    shortLabel: "機動力バランス",
    bankFeature: "自力と番手のバランス型。主導権を取るラインの完成度を優先。",
    paceMemo: "ライン3車なら先頭の粘りと番手の差しを両取りしたい。",
    chaosHint: "縦脚型の単騎がいると3着穴の価値が上がる。",
    favorBuckets: ["front", "mark"],
    holeBuckets: ["attack"],
    mainMemo: "先行ライン中心の素直な組み立て向き。",
    cautionMemo: "追込みだけの評価で前を軽視しすぎない。",
  },
  "静岡": {
    shortLabel: "差し脚注意",
    bankFeature: "番手・追込みの精度を見たい会場。人気の先行を差し切る筋に注意。",
    paceMemo: "主導権候補が強くても番手差しまでセットで確認。",
    chaosHint: "得点差が小さいと差し脚上位の逆転が起きやすい。",
    favorBuckets: ["mark", "chase"],
    holeBuckets: ["attack"],
    mainMemo: "差し有利寄りの目線で本命と対抗を組む。",
    cautionMemo: "前の踏み直しだけで完結させない。",
  },
  "西武園": {
    shortLabel: "隊列重視",
    bankFeature: "ラインの形が結果に直結しやすい。番手〜3番手の恩恵を意識。",
    paceMemo: "主導権よりも、隊列が長く作れるラインを評価。",
    chaosHint: "中団取りが巧い選手が穴で浮上しやすい。",
    favorBuckets: ["mark", "balanced"],
    holeBuckets: ["attack"],
    mainMemo: "番手〜3番手の残り目を軽視しない。",
    cautionMemo: "逃げ選手だけを並べて終わらせない。",
  },
};

const getRacesPageBankProfile = (venueName?: string | null): RacesPageBankProfile => {
  if (!venueName) return DEFAULT_RACES_PAGE_BANK_PROFILE;
  return RACES_PAGE_BANK_PROFILE_MAP[venueName] ?? DEFAULT_RACES_PAGE_BANK_PROFILE;
};

const VENUE_SPOTLIGHT_IMAGE_MAP: Record<string, string> = {
  "青森": "/venues/hero/aomori-hero-mini.png",
  "別府": "/venues/hero/beppu-hero-mini.png",
  "福井": "/venues/hero/fukui-hero-mini.png",
  "岐阜": "/venues/hero/gifu-hero-mini.png",
  "函館": "/venues/hero/hakodate-hero-mini.png",
  "平塚": "/venues/hero/hiratsuka-hero-mini.png",
  "広島": "/venues/hero/hiroshima-hero-mini.png",
  "防府": "/venues/hero/hofu-hero-mini.png",
  "伊東": "/venues/hero/ito-hero-mini.png",
  "いわき平": "/venues/hero/iwaki-taira-mini.png",
  "川崎": "/venues/hero/kawasaki-hero-mini.png",
  "京王閣": "/venues/hero/keiokaku-hero-mini.png",
  "岸和田": "/venues/hero/kishiwada-hero-mini.png",
  "高知": "/venues/hero/kochi-hero-mini.png",
  "小倉": "/venues/hero/kokura-hero-mini.png",
  "小松島": "/venues/hero/komatsushima-hero-mini.png",
  "久留米": "/venues/hero/kurume-hero-mini.png",
  "前橋": "/venues/hero/maebashi-hero-mini.png",
  "松戸": "/venues/hero/matsudo-hero-mini.png",
  "松阪": "/venues/hero/matsusaka-hero-mini.png",
  "松山": "/venues/hero/matsuyama-hero-mini.png",
  "名古屋": "/venues/hero/nagoya-hero-mini.png",
  "奈良": "/venues/hero/nara-hero-mini.png",
  "小田原": "/venues/hero/odawara-hero-mini.png",
  "大垣": "/venues/hero/ogaki-hero-mini.png",
  "大宮": "/venues/hero/omiya-hero-mini.png",
  "佐世保": "/venues/hero/sasebo-hero-mini.png",
  "西武園": "/venues/hero/seibuen-hero-mini.png",
  "静岡": "/venues/hero/shizuoka-hero-mini.png",
  "立川": "/venues/hero/tachikawa-hero-mini.png",
  "高松": "/venues/hero/takamatsu-hero-mini.png",
  "武雄": "/venues/hero/takeo-hero-mini.png",
  "玉野": "/venues/hero/tamano-hero-mini.png",
  "取手": "/venues/hero/toride-hero-mini.png",
  "富山": "/venues/hero/toyama-hero-mini.png",
  "豊橋": "/venues/hero/toyohashi-hero-mini.png",
  "宇都宮": "/venues/hero/utsunomiya-hero-mini.png",
  "和歌山": "/venues/hero/wakayama-hero-mini.png",
  "弥彦": "/venues/hero/yahiko-hero-mini.png",
  "四日市": "/venues/hero/yokkaichi-hero-mini.png",
};

const normalizeRacesPageStyleBucket = (style?: string): RacesPageStyleBucket => {
  const value = (style ?? "").trim();
  if (!value) return "balanced";
  if (value.includes("逃")) return "front";
  if (value.includes("捲")) return "attack";
  if (value.includes("両")) return "balanced";
  if (value.includes("追")) return "chase";
  if (value.includes("差")) return "mark";
  return "balanced";
};

type RacesPageLineupSegment =
  | { kind: "plain"; cars: string[] }
  | { kind: "battle"; head: string[]; crosser: string[] };

type ParsedRacesPageLineup = {
  raw: string;
  display: string;
  segments: RacesPageLineupSegment[];
};

const normalizeRacesPageLineupRaw = (lineupText?: string | null) =>
  (lineupText ?? "")
    .replace(/\r/g, "")
    .replace(/　/g, " ")
    .trim();

const formatRacesPageLineupSegment = (segment: RacesPageLineupSegment) =>
  segment.kind === "plain"
    ? segment.cars.join("")
    : `${segment.head.join("")}（${segment.crosser.join("")}）`;

const flattenRacesPageLineupSegmentCars = (segment: RacesPageLineupSegment) =>
  segment.kind === "plain" ? segment.cars : [...segment.head, ...segment.crosser];

const parseRacesPageLineupRowTokens = (row: string) => {
  const tokens: Array<{ text: string; start: number; cars: string[] }> = [];
  for (const match of row.matchAll(/\d+/g)) {
    const text = match[0];
    const start = match.index ?? -1;
    if (!text || start < 0) continue;
    tokens.push({ text, start, cars: text.split("").filter(Boolean) });
  }
  return tokens;
};

const parseRacesPageLineup = (lineupText?: string | null): ParsedRacesPageLineup | null => {
  const normalizedRaw = normalizeRacesPageLineupRaw(lineupText);
  if (!normalizedRaw) return null;

  const rows = normalizedRaw
    .split(/\n+/)
    .map((row) => row.replace(/\s+$/g, ""))
    .filter((row) => /\d/.test(row));

  if (rows.length === 0) return null;

  const topTokens = parseRacesPageLineupRowTokens(rows[0]);
  if (topTokens.length === 0) return null;

  const segments: RacesPageLineupSegment[] = topTokens.map((token) => ({ kind: "plain", cars: [...token.cars] }));

  if (rows.length > 1) {
    for (const row of rows.slice(1)) {
      const rowTokens = parseRacesPageLineupRowTokens(row);
      for (const token of rowTokens) {
        const topIndex = topTokens.findIndex(
          (topToken) => token.start >= topToken.start && token.start < topToken.start + topToken.text.length,
        );

        if (topIndex < 0) return null;

        const topToken = topTokens[topIndex];
        const offset = token.start - topToken.start;
        if (offset <= 0 || offset >= topToken.cars.length) return null;

        const current = segments[topIndex];
        if (current.kind === "plain") {
          const head = current.cars.slice(0, offset);
          const crosser = current.cars.slice(offset);
          if (head.length === 0 || crosser.length === 0) return null;
          segments[topIndex] = { kind: "battle", head, crosser: [...crosser, ...token.cars] };
        } else {
          segments[topIndex] = {
            kind: "battle",
            head: current.head,
            crosser: [...current.crosser, ...token.cars],
          };
        }
      }
    }
  }

  return {
    raw: normalizedRaw,
    display: segments.map(formatRacesPageLineupSegment).join("－"),
    segments,
  };
};

const buildRacesPageLineupGroups = (lineupText?: string) => {
  const parsed = parseRacesPageLineup(lineupText);
  if (!parsed) return [] as string[][];
  return parsed.segments.map((segment) => flattenRacesPageLineupSegmentCars(segment));
};

const doesLineupEntryMatchRider = (entry: string, rider: { carNo?: string; name?: string }) => {
  const normalizedEntry = entry.trim();
  if (!normalizedEntry) return false;
  return normalizedEntry === (rider.carNo ?? "") || normalizedEntry === (rider.name ?? "") || normalizedEntry.includes(rider.name ?? "");
};

const getRacesPageRiderRoleBonus = (
  rider: { carNo?: string; name?: string; style?: string },
  lineupText: string | undefined,
  profile: RacesPageBankProfile
) => {
  const groups = buildRacesPageLineupGroups(lineupText);
  let frontBonus = 0;
  let secondaryBonus = 0;
  let tailBonus = 0;
  groups.forEach((group) => {
    if (group[0] && doesLineupEntryMatchRider(group[0], rider)) frontBonus = 1;
    if (group[1] && doesLineupEntryMatchRider(group[1], rider)) secondaryBonus = 1;
    if (group.slice(2).some((entry) => doesLineupEntryMatchRider(entry, rider))) tailBonus = 1;
  });

  const bucket = normalizeRacesPageStyleBucket(rider.style);
  let bonus = 0;
  if (frontBonus) bonus += bucket === "front" || bucket === "attack" ? 1.8 : 0.8;
  if (secondaryBonus) bonus += profile.favorBuckets.includes(bucket) ? 1.8 : 1.1;
  if (tailBonus) bonus += profile.holeBuckets.includes(bucket) ? 1.0 : 0.4;
  return { frontBonus, secondaryBonus, tailBonus, bonus };
};

const getRacesPageLeadBonus = (rider: { name?: string; carNo?: string; style?: string }, lead?: string) => {
  const text = (lead ?? "").trim();
  if (!text) return 0;
  if ((rider.name && text.includes(rider.name)) || (rider.carNo && text.includes(rider.carNo))) return 2.4;
  const bucket = normalizeRacesPageStyleBucket(rider.style);
  if ((text.includes("先行") || text.includes("主導権")) && (bucket === "front" || bucket === "attack")) return 1.2;
  if (text.includes("番手") && (bucket === "mark" || bucket === "chase")) return 1.1;
  return 0;
};

const buildRacesPagePredictionCandidates = (
  riders: Array<{ carNo: string; name: string; style: string; score?: string; comment?: string }>,
  options: { lineup?: string; lead?: string; venueName?: string }
) => {
  const profile = getRacesPageBankProfile(options.venueName);
  const parseScore = (value?: string) => {
    if (!value) return null;
    const normalized = value.replace(/[^\d.]/g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const scored = riders.map((rider) => {
    const numericScore = parseScore(rider.score) ?? 0;
    const bucket = normalizeRacesPageStyleBucket(rider.style);
    const styleBonus = profile.favorBuckets.includes(bucket) ? 1.6 : profile.holeBuckets.includes(bucket) ? 0.8 : 0.3;
    const role = getRacesPageRiderRoleBonus(rider, options.lineup, profile);
    const leadBonus = getRacesPageLeadBonus(rider, options.lead);
    const commentText = `${rider.comment ?? ""}${rider.style ?? ""}`;
    const commentBonus = /自力|仕掛|先行|捲|差し|追込/.test(commentText) ? 0.4 : 0;
    const adjustedScore = numericScore + styleBonus + role.bonus + leadBonus + commentBonus;
    const holeScore = numericScore * 0.55 + (profile.holeBuckets.includes(bucket) ? 2.4 : 0.6) + (role.tailBonus ? 1.4 : 0) + (bucket === "attack" ? 0.8 : 0);
    return { ...rider, numericScore, adjustedScore, holeScore, bucket, role };
  }).sort((a, b) => b.adjustedScore - a.adjustedScore);

  const honmei = scored[0] ?? null;
  const taikou = scored.find((item) => item.name !== honmei?.name) ?? null;
  const ana = [...scored]
    .filter((item) => item.name !== honmei?.name && item.name !== taikou?.name)
    .sort((a, b) => b.holeScore - a.holeScore)[0] ?? null;

  return { honmei, taikou, ana, profile, ranked: scored };
};

export default function RacesPage() {
  const { generatedTodayRaces, generatedAt, generatedDate } = useGeneratedTodayRaces();
  const isMobile = useIsMobile();

  const effectiveTodayRaces = generatedTodayRaces.length > 0
    ? generatedTodayRaces
    : todayRaces.map(mapStaticRaceToLiveVenue);

  const sortedTodayVenues = [...effectiveTodayRaces].sort((a, b) => {
    const sessionDiff = getVenueSessionSortRank(a) - getVenueSessionSortRank(b);
    if (sessionDiff !== 0) return sessionDiff;

    const firstRaceDiff = (getVenueFirstRaceMinutes(a) ?? 9999) - (getVenueFirstRaceMinutes(b) ?? 9999);
    if (firstRaceDiff !== 0) return firstRaceDiff;

    return a.venue.localeCompare(b.venue, "ja");
  });

  const [selectedVenueId, setSelectedVenueId] = useState<string>(effectiveTodayRaces[0]?.id ?? "");
  const [selectedRaceNo, setSelectedRaceNo] = useState<number>(effectiveTodayRaces[0]?.races?.[0]?.raceNo ?? 1);
  const [activeRaceInfoTab, setActiveRaceInfoTab] = useState<"card" | "recent" | "previous" | "yearly" | "sameTrack" | "local" | "gpt">("card");
  const [oddsSortMode, setOddsSortMode] = useState<"popularity" | "odds">("popularity");
  const [oddsDisplayLimit, setOddsDisplayLimit] = useState<50 | 100 | "all">("all");
  const [venueBankIndex, setVenueBankIndex] = useState<VenueBankIndexItem[]>([]);
  const [venueBankSummaryMap, setVenueBankSummaryMap] = useState<Record<string, RacesPageVenueBankSummary>>({});
  const [venueWeather, setVenueWeather] = useState<VenueWeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState("");
  const [predictionResultMap, setPredictionResultMap] = useState<PredictionResultMap>(() => loadStoredPredictionResults());



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

  useEffect(() => {
    if (!sortedTodayVenues.length) return;
    if (!sortedTodayVenues.some((venue) => venue.id === selectedVenueId)) {
      setSelectedVenueId(sortedTodayVenues[0].id);
    }
  }, [sortedTodayVenues, selectedVenueId]);

  useEffect(() => {
    const selectedVenue = sortedTodayVenues.find((venue) => venue.id === selectedVenueId) ?? sortedTodayVenues[0] ?? null;
    if (!selectedVenue) return;
    const firstRaceNo = selectedVenue.races?.[0]?.raceNo ?? 1;
    if (!selectedVenue.races?.some((race) => race.raceNo === selectedRaceNo)) {
      setSelectedRaceNo(firstRaceNo);
    }
  }, [sortedTodayVenues, selectedVenueId, selectedRaceNo]);

  useEffect(() => {
    let isActive = true;

    const loadVenueBankIndex = async () => {
      try {
        const response = await fetch(`${VENUE_BANK_INDEX_URL}?v=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) return;
        const json = (await response.json()) as VenueBankIndexItem[];
        if (!isActive || !Array.isArray(json)) return;
        setVenueBankIndex(json.filter((item) => item && typeof item.venueName === "string" && typeof item.file === "string"));
      } catch {
        if (isActive) setVenueBankIndex([]);
      }
    };

    loadVenueBankIndex();
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    const venueName = normalizeVenueBankAlias(selectedVenueId ? (sortedTodayVenues.find((venue) => venue.id === selectedVenueId)?.venue ?? "") : "");
    if (!venueName || !venueBankIndex.length) return;
    if (venueBankSummaryMap[venueName]) return;

    const target = venueBankIndex.find((item) =>
      normalizeVenueBankAlias(item.venueName) === venueName ||
      item.aliases?.some((alias) => normalizeVenueBankAlias(alias) === venueName)
    );
    const fetchPath = resolveRacesPageVenueBankFetchPath(target?.venueName ?? venueName, target?.file ?? "");
    if (!target?.file) {
      console.debug("[BANK/PACE] venue feature lookup", {
        selectedVenue: sortedTodayVenues.find((venue) => venue.id === selectedVenueId)?.venue ?? "",
        normalizedVenueKey: venueName,
        candidateKeys: venueBankIndex.map((item) => normalizeVenueNameForBankLookup(item.venueName)),
        matchedVenueFeatureKey: null,
        fetchPath: "",
        fallbackReason: "no-index-match",
      });
      setVenueBankSummaryMap((current) => ({
        ...current,
        [venueName]: DEFAULT_RACES_PAGE_VENUE_BANK_SUMMARY,
      }));
      return;
    }

    let isActive = true;

    const loadVenueBankMarkdown = async () => {
      try {
        const response = await fetch(`${fetchPath}?v=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) {
          if (!isActive) return;
          console.debug("[BANK/PACE] venue feature lookup", {
            selectedVenue: sortedTodayVenues.find((venue) => venue.id === selectedVenueId)?.venue ?? "",
            normalizedVenueKey: venueName,
            candidateKeys: venueBankIndex.map((item) => normalizeVenueNameForBankLookup(item.venueName)),
            matchedVenueFeatureKey: normalizeVenueNameForBankLookup(target.venueName),
            fetchPath,
            fallbackReason: `markdown-fetch-not-ok:${response.status}`,
          });
          setVenueBankSummaryMap((current) => ({
            ...current,
            [venueName]: DEFAULT_RACES_PAGE_VENUE_BANK_SUMMARY,
          }));
          return;
        }
        const markdown = await response.text();
        if (!isActive) return;
        const summary = parseVenueBankSummary(markdown);
        console.debug("[BANK/PACE] venue feature lookup", {
          selectedVenue: sortedTodayVenues.find((venue) => venue.id === selectedVenueId)?.venue ?? "",
          normalizedVenueKey: venueName,
          candidateKeys: venueBankIndex.map((item) => normalizeVenueNameForBankLookup(item.venueName)),
          matchedVenueFeatureKey: normalizeVenueNameForBankLookup(target.venueName),
          fetchPath,
          fallbackReason: summary.source === DEFAULT_RACES_PAGE_VENUE_BANK_SUMMARY.source ? "summary-fallback" : "none",
        });
        setVenueBankSummaryMap((current) => ({ ...current, [venueName]: summary }));
      } catch (error) {
        if (!isActive) return;
        console.debug("[BANK/PACE] venue feature lookup", {
          selectedVenue: sortedTodayVenues.find((venue) => venue.id === selectedVenueId)?.venue ?? "",
          normalizedVenueKey: venueName,
          candidateKeys: venueBankIndex.map((item) => normalizeVenueNameForBankLookup(item.venueName)),
          matchedVenueFeatureKey: normalizeVenueNameForBankLookup(target.venueName),
          fetchPath,
          fallbackReason: error instanceof Error ? error.message : "markdown-fetch-error",
        });
        setVenueBankSummaryMap((current) => ({
          ...current,
          [venueName]: DEFAULT_RACES_PAGE_VENUE_BANK_SUMMARY,
        }));
      }
    };

    loadVenueBankMarkdown();

    return () => {
      isActive = false;
    };
  }, [selectedVenueId, sortedTodayVenues, venueBankIndex, venueBankSummaryMap]);

  const selectedVenue =
    sortedTodayVenues.find((venue) => venue.id === selectedVenueId) ??
    sortedTodayVenues[0] ??
    null;

const selectedVenueRaces = selectedVenue?.races ?? [];

const selectedRace =
  selectedVenueRaces.find((race) => race.raceNo === selectedRaceNo) ??
  selectedVenueRaces[0] ??
  null;

const selectedRaceResult = selectedRace?.result;
const selectedRaceFinishOrderItems = extractRacesPageFinishOrderCarNos(selectedRaceResult?.finishOrder);

const selectedRaceFinishOrder =
  selectedRaceFinishOrderItems.length > 0
    ? selectedRaceFinishOrderItems
    : (selectedRace?.resultTop3?.map((item) => item.carNo).filter(Boolean) ?? []);

const selectedRaceResultStatus =
  selectedRaceResult?.status ?? selectedRace?.resultStatus ?? "pending";

const selectedRaceResultKimarite =
  selectedRaceResult?.kimarite || selectedRace?.resultTop3?.[0]?.kimarite || "";

const selectedRaceSecondKimarite =
  selectedRaceResult?.secondKimarite || selectedRace?.resultTop3?.[1]?.kimarite || "";

const selectedSavedPredictionResultLookup = findPredictionResultRecord(
  predictionResultMap,
  TODAY,
  selectedVenue as any,
  selectedRace as any,
);

const selectedSavedPredictionResult = selectedSavedPredictionResultLookup.record;

const selectedRaceWeatherFallbackActual: LiveRaceResultWeatherActual | undefined = venueWeather
  ? {
      weather: venueWeather.weatherLabel,
      windDirection: venueWeather.windDirectionText,
      windSpeed: venueWeather.windSpeedText,
      temperature: venueWeather.temperatureText,
    }
  : undefined;

const selectedRaceWeatherActual =
  selectedSavedPredictionResult?.weatherActual ??
  selectedRaceResult?.weatherActual ??
  selectedRaceWeatherFallbackActual;


  if (import.meta.env.DEV) {
  console.debug("[RacesPage WEATHER ACTUAL debug]", {
    selectedVenueName: selectedVenue?.venue,
    selectedRaceNo: selectedRace?.raceNo,
    lookupKey: selectedSavedPredictionResultLookup.key,
    hasSavedResult: Boolean(selectedSavedPredictionResult),
    savedWeatherActual: selectedSavedPredictionResult?.weatherActual,
    raceResultWeatherActual: selectedRaceResult?.weatherActual,
    finalWeatherActual: selectedRaceWeatherActual,
  });
}

useEffect(() => {
  if (!selectedVenue?.venue) {
    setVenueWeather(null);
    setWeatherLoading(false);
    setWeatherError("");
    return;
  }

  const venueName = selectedVenue.venue;
  const raceTime = selectedRace?.time ?? "";
  const cacheKey = `${TODAY}:${venueName}:${raceTime}`;

  const cached = venueWeatherCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < WEATHER_CACHE_TTL_MS) {
    setVenueWeather(cached.data);
    setWeatherLoading(false);
    setWeatherError("");
    return;
  }

  let isActive = true;

  setWeatherLoading(true);
  setWeatherError("");

  fetchVenueWeather(venueName, {
    isoDate: TODAY,
    raceTime,
  })
    .then((data) => {
      if (!isActive) return;

      venueWeatherCache.set(cacheKey, {
        fetchedAt: Date.now(),
        data,
      });

      setVenueWeather(data);
      setWeatherError("");
    })
    .catch(() => {
      if (!isActive) return;

      setVenueWeather(null);
      setWeatherError("天気取得待ち");
    })
    .finally(() => {
      if (!isActive) return;

      setWeatherLoading(false);
    });

  return () => {
    isActive = false;
  };
}, [selectedVenue?.venue, selectedRace?.time]);

const selectedRaceSLeaderCarNo = selectedRaceResult?.sLeaderCarNo ?? "";
const selectedRaceHLeaderCarNo = selectedRaceResult?.hLeaderCarNo ?? "";
const selectedRaceBLeaderCarNo = selectedRaceResult?.bLeaderCarNo ?? "";
const selectedRaceFinishOrderRows = mapRacesPageFinishOrderToRows(selectedRace?.result?.finishOrder);
const selectedRaceAllRows = selectedRaceFinishOrderRows.length > 0 ? selectedRaceFinishOrderRows : (selectedRace?.resultTop3 ?? []);
const selectedRaceFullResultScopeNote = getRacesPageFullResultScopeNote(selectedRace ?? undefined);
const selectedRaceLeaderText = formatRacesPageLeaderText(selectedRace ?? undefined);
const selectedRacePayout2tan = resolveRacePayoutByBetType(selectedRace as never, "2車単");
const selectedRacePayout3tan = resolveRacePayoutByBetType(selectedRace as never, "3連単");
const selectedRacePayout3fuku = resolveRacePayoutByBetType(selectedRace as never, "3連複");

const selectedRaceResultCards = [
  {
    label: "着順",
    value: formatRacesPageResultOrder(selectedRaceFinishOrder),
    sub: selectedRaceResultStatus === "confirmed" ? "3連単照合キー" : "未確定",
  },
  {
    label: "決まり手",
    value: selectedRaceResultKimarite || "--",
    sub: "1着の決まり手",
  },
  {
    label: "2着決まり手",
    value: selectedRaceSecondKimarite || "--",
    sub: "2着の決まり手",
  },
{
  label: "S/H/B",
  value:
    selectedRaceLeaderText && selectedRaceLeaderText !== "S/H/B 未取得"
      ? selectedRaceLeaderText
      : selectedRaceAllRows
          .filter((row) => row.sMark || row.hMark || row.bMark)
          .map((row) => {
            const marks = [
              row.sMark ? "S" : "",
              row.hMark ? "H" : "",
              row.bMark ? "B" : "",
            ].filter(Boolean).join("");

            const riderName = cleanRacesPageRiderName(row.name);
            return `${marks}: ${row.carNo}${riderName ? ` ${riderName}` : ""}`;
          })
          .join(" / ") || "S/H/B 未取得",
  sub:
    selectedRaceAllRows.some((row) => row.sMark || row.hMark || row.bMark)
      ? "全着順マーク"
      : "全着順データ待ち",
},
  {
    label: "3連単",
    value: formatRacesPageResultPayout(selectedRacePayout3tan),
    sub: "払戻",
  },
];

  const leadLabel = selectedRace?.lead?.trim() || "当日反映予定";
  const coreBuyLabel = selectedRace?.coreBuy?.trim() || "整理中";
  const coreFadeLabel = selectedRace?.coreFade?.trim() || "整理中";
  const raceTitleLabel = selectedRace?.title?.trim() || "レース名反映待ち";
  const hasRawRaceLineup = Boolean(selectedRace?.lineup?.trim());
  const parsedRaceLineup = parseRacesPageLineup(selectedRace?.lineup);
  const raceLineupLabel = selectedRace?.lineup?.trim()
    ? parsedRaceLineup?.display ?? normalizeRacesPageLineupRaw(selectedRace.lineup)
    : "並び予想未登録";
  const raceLineupFixedLabel = !hasRawRaceLineup
    ? "並び予想未登録"
    : parsedRaceLineup?.display ?? "並び要確認";
  const raceLineupFixedCaption = !hasRawRaceLineup
    ? "ライン: 未登録"
    : parsedRaceLineup
      ? `ライン: ${parsedRaceLineup.display}`
      : "ライン: 並び要確認";
  const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"] as const;
  const todayDisplayLabel = `${todayDate.getFullYear()}/${todayDate.getMonth() + 1}/${todayDate.getDate()}（${WEEKDAY_JA[todayDate.getDay()]}）`;
  const updatedTimeLabel = generatedAt
    ? `更新 ${generatedAt.includes(" ") ? generatedAt.split(" ")[1] : generatedAt}`
    : "更新 --:--:--";
  const weatherCardValue: ReactNode = weatherLoading
    ? "天気を取得中…"
    : weatherError
      ? weatherError
      : venueWeather
        ? `${venueWeather.weatherLabel} ${venueWeather.temperatureText} / ${venueWeather.updatedAtText}予報`
        : "整理中";
  const weatherCardNote: ReactNode = weatherLoading
    ? "発走時刻基準の風向・風速を確認しています"
    : weatherError
      ? "風向・風速は再取得待ち"
      : venueWeather
        ? (
          <span style={{ display: "grid", gap: "2px" }}>
            <span>{venueWeather.referenceText}</span>
            <span>{`体感 ${venueWeather.apparentTemperatureText}`}</span>
            <span>{`風速 ${venueWeather.windSpeedText}`}</span>
            <span>{`風向 ${venueWeather.windDirectionText}`}</span>
            <span>{`降水 ${venueWeather.precipitationText}`}</span>
            <span>{`採用予報 ${venueWeather.updatedAtText}`}</span>
          </span>
        )
        : "会場切替で発走時刻基準の天気を取得します";
  const weatherCardIcon = weatherLoading
    ? "◌"
    : weatherError
      ? "☁️"
      : venueWeather?.weatherLabel.includes("雷")
        ? "⛈️"
        : venueWeather?.weatherLabel.includes("雪")
          ? "❄️"
          : venueWeather?.weatherLabel.includes("雨")
            ? "🌧️"
            : venueWeather?.weatherLabel.includes("くもり") || venueWeather?.weatherLabel.includes("霧")
              ? "☁️"
              : "☀️";
  const weatherMetricItems = weatherLoading
    ? [
        { label: "体感", value: "--℃" },
        { label: "風速", value: "-- km/h" },
        { label: "風向", value: "--" },
        { label: "降水", value: "-- mm" },
      ]
    : venueWeather
      ? [
          { label: "体感", value: venueWeather.apparentTemperatureText },
          { label: "風速", value: venueWeather.windSpeedText },
          { label: "風向", value: venueWeather.windDirectionText },
          { label: "降水", value: venueWeather.precipitationText },
        ]
      : [
          { label: "体感", value: "--℃" },
          { label: "風速", value: "-- km/h" },
          { label: "風向", value: "--" },
          { label: "降水", value: "-- mm" },
        ];
  const isCoreBuyEmpty = coreBuyLabel === "整理中";
  const isCoreFadeEmpty = coreFadeLabel === "整理中";
  const parseOddsNumber = (value?: string) => {
    if (!value) return null;
    const normalized = value.replace(/[^\d.]/g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const heroRecommendedRaces = sortedTodayVenues
    .flatMap((v) =>
      (v.races ?? []).map((r) => ({
        venue: v.venue,
        raceNo: r.raceNo,
        time: r.time,
        oddsPreview: r.oddsPreview ?? [],
      }))
    )
    .filter((r) => {
      const match = r.time?.match(/^(\d{1,2}):(\d{2})$/);
      if (!match) return false;
      const raceMinutes = Number(match[1]) * 60 + Number(match[2]);
      if (raceMinutes <= nowMinutes) return false;
      return r.oddsPreview.some((o) => (parseOddsNumber(o.odds) ?? 0) >= 11);
    })
    .sort((a, b) => {
      const toMin = (t?: string) => {
        const m = t?.match(/^(\d{1,2}):(\d{2})$/);
        return m ? Number(m[1]) * 60 + Number(m[2]) : 9999;
      };
      return toMin(a.time) - toMin(b.time);
    })
    .slice(0, 3);
  const selectedRiders = getDisplayRidersForKeirinRace(selectedRace as never, selectedVenue as never) as LiveRaceRider[];
  const totalRiderCount = selectedRiders.length;

  const parseScoreValue = (value?: string) => {
    if (!value) return null;
    const normalized = value.replace(/[^\d.]/g, "");
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const parseIntegerLike = (value: unknown) => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const normalized = value.replace(/[^\d.-]/g, "");
      if (!normalized) return null;
      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };

  const formatRateValue = (value: unknown, fallbackNumerator?: number | null, fallbackDenominator?: number | null) => {
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number" && Number.isFinite(value)) return `${value.toFixed(1)}%`;
    if (
      fallbackNumerator !== undefined &&
      fallbackDenominator !== undefined &&
      fallbackNumerator !== null &&
      fallbackDenominator !== null &&
      fallbackDenominator > 0
    ) {
      return `${((fallbackNumerator / fallbackDenominator) * 100).toFixed(1)}%`;
    }
    return "—";
  };

  const normalizeRacesPageMaterialValue = (value: unknown, fallback = "未取得") => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed || fallback;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
    return fallback;
  };

  const buildRacesPageStatsSummaryLine = (stats?: PredictionRiderStatsSummaryItem | null) => {
    if (!stats) return "未取得";
    if (stats.summary?.trim()) return stats.summary.trim();
    const starts = normalizeRacesPageMaterialValue(stats.starts, "");
    const wins = normalizeRacesPageMaterialValue(stats.wins, "");
    const seconds = normalizeRacesPageMaterialValue(stats.seconds, "");
    const thirds = normalizeRacesPageMaterialValue(stats.thirds, "");
    const losses = normalizeRacesPageMaterialValue(stats.losses, "");
    const parts = [
      starts ? `出走${starts}` : "",
      wins ? `1着${wins}` : "",
      seconds ? `2着${seconds}` : "",
      thirds ? `3着${thirds}` : "",
      losses ? `着外${losses}` : "",
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(" / ") : "未取得";
  };

  const buildRacesPageStatsCategoryLine = (stats?: PredictionRiderStatsSummaryItem | null) => {
    const categories = stats?.categories;
    if (!categories) return "";
    return Object.entries(categories)
      .map(([label, value]) => {
        const wins = normalizeRacesPageMaterialValue(value?.wins, "");
        const seconds = normalizeRacesPageMaterialValue(value?.seconds, "");
        const thirds = normalizeRacesPageMaterialValue(value?.thirds, "");
        const losses = normalizeRacesPageMaterialValue(value?.losses, "");
        if (![wins, seconds, thirds, losses].some(Boolean)) return "";
        return `${label}:${[wins, seconds, thirds, losses].map((item) => item || "-").join("-")}`;
      })
      .filter(Boolean)
      .join(" / ");
  };

  const buildRacesPageHistoricalRaceLine = (item: PredictionRiderHistoricalRaceItem, index: number) => {
    const pieces = [
      item.date?.trim(),
      item.venue?.trim(),
      item.raceName?.trim(),
      item.place ? `${item.place}着` : "",
      item.agari?.trim() ? `上がり ${item.agari.trim()}` : "",
      item.summary?.trim(),
    ].filter(Boolean);
    return pieces.length > 0 ? pieces.join(" / ") : `${index + 1}. 前回出走データ未取得`;
  };

  const deriveRiderProfileLine = (rider: LiveRaceRider) => {
    const parts = [
      rider.prefecture?.trim(),
      rider.age !== undefined && rider.age !== null && String(rider.age).trim() ? `${rider.age}歳` : "",
      rider.term !== undefined && rider.term !== null && String(rider.term).trim() ? `${rider.term}期` : "",
      rider.grade?.trim() || "",
    ].filter(Boolean);
    return parts.length ? parts.join(" ") : "府県・年齢・期別・級班は後から連携";
  };

  const buildEnhancedRiderMetrics = (rider: LiveRaceRider, index: number) => {
    const wins = parseIntegerLike(rider.wins) ?? Math.max(Math.round(((parseScoreValue(rider.score) ?? 92) - 90) / 2), 0);
    const seconds = parseIntegerLike(rider.seconds) ?? ((index + wins) % 5);
    const thirds = parseIntegerLike(rider.thirds) ?? ((index + 2) % 4);
    const loses = parseIntegerLike(rider.loses) ?? (14 + index * 2);
    const totalStarts = Math.max(wins + seconds + thirds + loses, 1);

    return {
      s: parseIntegerLike(rider.s) ?? ((index + 1) % 5),
      b: parseIntegerLike(rider.b) ?? (rider.style.includes("逃") ? 4 + (index % 3) : index % 3),
      nige: parseIntegerLike(rider.nige) ?? (rider.style.includes("逃") ? 3 + (index % 4) : index % 2),
      makuri: parseIntegerLike(rider.makuri) ?? (rider.style.includes("捲") ? 2 + (index % 3) : (index + 1) % 2),
      sashi: parseIntegerLike(rider.sashi) ?? (rider.style.includes("両") || rider.style.includes("追") ? 2 + (index % 4) : index % 3),
      mark: parseIntegerLike(rider.mark) ?? (rider.style.includes("追") ? 2 + (index % 2) : index % 2),
      wins,
      seconds,
      thirds,
      loses,
      totalStarts,
      gear: rider.gear !== undefined && rider.gear !== null && String(rider.gear).trim() ? String(rider.gear) : "3.92",
      winRate: formatRateValue(rider.winRate, wins, totalStarts),
      quinellaRate: formatRateValue(rider.quinellaRate, wins + seconds, totalStarts),
      trifectaRate: formatRateValue(rider.trifectaRate, wins + seconds + thirds, totalStarts),
    };
  };

  const predictionCandidates = buildRacesPagePredictionCandidates(selectedRiders, {
    lineup: selectedRace?.lineup,
    lead: selectedRace?.lead,
    venueName: selectedVenue?.venue,
  });

  const topCandidate = predictionCandidates.honmei;
  const secondCandidate = predictionCandidates.taikou;
  const darkHorseCandidate = predictionCandidates.ana;
  const bankProfile = predictionCandidates.profile;
  const ridersWithScore = predictionCandidates.ranked;
  const selectedVenueBankLookupName = selectedVenue ? normalizeVenueBankAlias(selectedVenue.venue) : "";
  const selectedVenueBankIndexTarget = selectedVenueBankLookupName
    ? venueBankIndex.find((item) =>
        normalizeVenueBankAlias(item.venueName) === selectedVenueBankLookupName ||
        item.aliases?.some((alias) => normalizeVenueBankAlias(alias) === selectedVenueBankLookupName)
      ) ?? null
    : null;
  const selectedVenueBankFetchPath = resolveRacesPageVenueBankFetchPath(selectedVenue?.venue, selectedVenueBankIndexTarget?.file ?? "");
  const selectedVenueBankSummary = selectedVenue
    ? venueBankSummaryMap[selectedVenueBankLookupName] ?? null
    : null;
  const selectedVenueGuideSummary = buildRacesPageVenueGuideSummary({
    bankSummary: selectedVenueBankSummary,
    bankProfile,
    hasBankDataFile: Boolean(selectedVenueBankIndexTarget?.file),
    isBankDataLoading: Boolean(selectedVenueBankIndexTarget?.file) && !selectedVenueBankSummary,
  });

  useEffect(() => {
    if (!selectedVenue) return;

    const fallbackReason = !selectedVenueBankLookupName
      ? "no-selected-venue"
      : !venueBankIndex.length
      ? "index-not-loaded"
      : !selectedVenueBankIndexTarget
      ? "no-index-match"
      : !selectedVenueBankSummary
      ? "markdown-loading"
      : selectedVenueBankSummary.source === DEFAULT_RACES_PAGE_VENUE_BANK_SUMMARY.source
      ? "summary-fallback"
      : "none";

    console.debug("[BANK/PACE] venue feature state", {
      selectedVenue: selectedVenue.venue,
      normalizedVenueKey: selectedVenueBankLookupName,
      candidateKeys: venueBankIndex.map((item) => normalizeVenueNameForBankLookup(item.venueName)),
      matchedVenueFeatureKey: selectedVenueBankIndexTarget ? normalizeVenueNameForBankLookup(selectedVenueBankIndexTarget.venueName) : null,
      fetchPath: selectedVenueBankFetchPath,
      fallbackReason,
    });
  }, [selectedVenue, selectedVenueBankLookupName, venueBankIndex, selectedVenueBankIndexTarget, selectedVenueBankFetchPath, selectedVenueBankSummary]);

  const scoreValues = ridersWithScore
    .map((rider) => rider.numericScore)
    .filter((value): value is number => Number.isFinite(value));
  const scoreSpread = scoreValues.length > 1 ? Math.max(...scoreValues) - Math.min(...scoreValues) : null;
  const averageScore = scoreValues.length
    ? (scoreValues.reduce((sum, value) => sum + value, 0) / scoreValues.length).toFixed(1)
    : "—";
  const aggressiveCount = selectedRiders.filter((rider) => ["逃", "捲"].some((keyword) => rider.style.includes(keyword))).length;

  const chaosLabel =
    scoreSpread === null
      ? "判定保留"
      : aggressiveCount >= 3 || scoreSpread <= 2
      ? "高め"
      : aggressiveCount >= 2 || scoreSpread <= 4
      ? "中くらい"
      : "落ち着き寄り";
  const chaosTone =
    chaosLabel === "高め"
      ? { bg: "#fff2f2", text: "#c35b68", border: "#f5ccd1" }
      : chaosLabel === "中くらい"
      ? { bg: "#fff7ed", text: "#b45309", border: "#fed7aa" }
      : { bg: "#eef8ff", text: "#3d6b98", border: "#cfe6fb" };

  const raceCompassItems = [
    { label: "発走", value: selectedRace?.time || "—", sub: `${selectedRace?.raceNo ?? "-"}R` },
    { label: "出走", value: totalRiderCount ? `${totalRiderCount}車` : "未反映", sub: totalRiderCount ? "実データ" : "整理中" },
    { label: "平均得点", value: `${averageScore}`, sub: scoreValues.length ? "競走得点ベース" : "整理中" },
    { label: "脚質気配", value: aggressiveCount ? `${aggressiveCount}人` : "静かめ", sub: aggressiveCount ? "逃・捲タイプ" : "追込寄り" },
  ];

  const sideInsightCards = [
    {
      label: "当日天気",
      eyebrow: "LIVE WEATHER",
      kind: "weather" as const,
      value: weatherCardValue,
      note: weatherCardNote,
      icon: weatherCardIcon,
      updatedAt: venueWeather ? venueWeather.referenceText : weatherLoading ? "発走基準を照合中" : "発走基準 --:--",
      metrics: weatherMetricItems,
      tone: {
        border: "1px solid rgba(216,208,240,0.78)",
        backgroundImage: `linear-gradient(135deg, rgba(255,255,255,0.48) 0%, rgba(248,242,255,0.42) 48%, rgba(238,248,255,0.46) 100%), url("${toPublicPath("/races-page/races-page-hero-bg-soft-pastel.png")}")`,
        accent: "#7e6ab8",
        accentSoft: "rgba(126,106,184,0.12)",
        label: "#7c6ab2",
      },
    },
    {
      label: "主導権候補",
      eyebrow: "FOCUS",
      kind: "text" as const,
      value: leadLabel,
      note: "展開パターンと合わせて確認",
      badge: "PICK",
      tone: {
        border: "1px solid rgba(228,216,238,0.92)",
        background: "linear-gradient(180deg, rgba(255,255,255,0.97) 0%, rgba(252,247,255,0.93) 100%)",
        accent: "#b07c54",
        accentSoft: "rgba(176,124,84,0.12)",
        label: "#8f6f9f",
      },
    },
    {
      label: "買いの芯",
      eyebrow: "BUY CORE",
      kind: "text" as const,
      value: coreBuyLabel,
      note: isCoreBuyEmpty ? "本線に置きたい軸を次回反映予定" : "本線に置きたい軸",
      badge: isCoreBuyEmpty ? "STANDBY" : "BUY",
      muted: isCoreBuyEmpty,
      tone: {
        border: "1px solid rgba(214,223,241,0.94)",
        background: "linear-gradient(180deg, rgba(255,255,255,0.97) 0%, rgba(244,248,255,0.94) 100%)",
        accent: "#617ba6",
        accentSoft: "rgba(97,123,166,0.12)",
        label: "#7485a7",
      },
    },
    {
      label: "消しの芯",
      eyebrow: "FADE CORE",
      kind: "text" as const,
      value: coreFadeLabel,
      note: isCoreFadeEmpty ? "割引したい選手を次回反映予定" : "割引したい選手",
      badge: isCoreFadeEmpty ? "STANDBY" : "FADE",
      muted: isCoreFadeEmpty,
      tone: {
        border: "1px solid rgba(223,221,235,0.94)",
        background: "linear-gradient(180deg, rgba(255,255,255,0.97) 0%, rgba(247,244,250,0.94) 100%)",
        accent: "#7d7693",
        accentSoft: "rgba(125,118,147,0.12)",
        label: "#837a99",
      },
    },
  ];

  const bankGuideItems = [
    { label: "バンク長", value: selectedVenueGuideSummary.bankLength },
    { label: "バンク特徴", value: selectedVenueGuideSummary.bankCharacter },
    { label: "狙いどころ", value: selectedVenueGuideSummary.target },
    { label: "注意点", value: selectedVenueGuideSummary.caution },
    { label: "荒れそう度", value: `${selectedVenueGuideSummary.volatility.label}｜${selectedVenueGuideSummary.volatility.note}` },
  ];

  const predictionMarks = [
    {
      label: "本命",
      rider: topCandidate,
      note: topCandidate
        ? `${topCandidate.numericScore.toFixed(1)}点ベース。${topCandidate.role.secondaryBonus ? "番手恩恵あり。" : topCandidate.role.frontBonus ? "主導権を握れる形。" : "得点上位で軸向き。"}`
        : "整理中",
      tone: { bg: "#f5efff", border: "#ddd1f3", text: "#6f5aa9" },
    },
    {
      label: "対抗",
      rider: secondCandidate,
      note: secondCandidate
        ? `${secondCandidate.numericScore.toFixed(1)}点ベース。${secondCandidate.role.secondaryBonus ? "番手差しまで届く形。" : secondCandidate.bucket === "attack" ? "捲り脚で逆転候補。" : "相手本線で置きやすい。"}`
        : "整理中",
      tone: { bg: "#eef8ff", border: "#cfe6fb", text: "#3d6b98" },
    },
    {
      label: "穴",
      rider: darkHorseCandidate,
      note: darkHorseCandidate
        ? `${darkHorseCandidate.numericScore.toFixed(1)}点ベース。${darkHorseCandidate.role.tailBonus ? "3番手以降で浮上余地。" : darkHorseCandidate.bucket === "attack" ? "一撃の捲りで食い込み注意。" : "展開がもつれた時の押さえ。"}`
        : "整理中",
      tone: { bg: "#fff7ed", border: "#fed7aa", text: "#b45309" },
    },
  ];

  const explicitOddsPreview = Array.isArray(selectedRace?.oddsPreview)
    ? selectedRace.oddsPreview.filter(
        (item): item is LiveRaceOddsPreviewItem =>
          Boolean(item) &&
          typeof item.combo === "string" &&
          typeof item.odds === "string"
      )
    : [];
  const explicitTrifectaOdds = Array.isArray(selectedRace?.oddsTrifecta)
    ? selectedRace.oddsTrifecta.filter(
        (item): item is LiveRaceTrifectaOddsItem =>
          Boolean(item) &&
          typeof item.combination === "string" &&
          typeof item.odds === "number"
      )
    : [];
  const normalizeOddsPreviewText = (value?: string) =>
    (value ?? "")
      .replace(/&#xFF5E;|&#65374;|&sim;|&nbsp;~/gi, "〜")
      .replace(/&gt;/gi, ">")
      .replace(/&lt;/gi, "<")
      .replace(/&amp;/gi, "&")
      .trim();
  const parseOddsFloorValue = (value?: string) => {
    const normalized = normalizeOddsPreviewText(value);
    const match = normalized.match(/\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : null;
  };
  const parseOddsRangeValues = (value?: string) => {
    const normalized = normalizeOddsPreviewText(value).replace(/計\s*\d+点/g, "");
    return Array.from(normalized.matchAll(/\d+(?:\.\d+)?/g))
      .map((match) => Number(match[0]))
      .filter((number) => Number.isFinite(number));
  };
  const normalizeTrifectaComboText = (value?: string) => normalizeOddsPreviewText(value).replace(/>/g, "-");
  const formatGroupedTrifectaCombo = (comboText: string, pointCount: number) => {
    const segments = comboText.split("-").filter(Boolean);
    if (segments.length !== 3) return comboText;

    const variableIndex = segments.findIndex((segment) => segment.length > 1);
    if (variableIndex < 0 || segments.filter((segment) => segment.length > 1).length > 1) return comboText;
    if (segments[variableIndex].length !== pointCount) return comboText;

    return segments[variableIndex]
      .split("")
      .map((digit) => segments.map((segment, index) => (index === variableIndex ? digit : segment)).join("-"))
      .join(" / ");
  };
  const getOddsBandMeta = (value: number | null) => {
    if (value !== null && value <= 20) {
      return { label: "本線", tone: { bg: "#eef6ff", text: "#2f5f91", border: "#cfe0f3" } };
    }
    if (value !== null && value <= 80) {
      return { label: "中穴", tone: { bg: "#f7f1ff", text: "#7b5db5", border: "#e3d8f5" } };
    }
    return { label: "穴", tone: { bg: "#fff4ea", text: "#b45309", border: "#f8d7b8" } };
  };
  const trifectaOddsRows = (explicitTrifectaOdds.length
    ? explicitTrifectaOdds.map((item) => ({
        combo: normalizeTrifectaComboText(item.combination),
        comboDisplay: normalizeTrifectaComboText(item.combination),
        floorOdds: item.odds,
        ceilingOdds: item.odds,
        oddsText: `${item.odds.toFixed(1)}倍`,
        points: 1,
        band: getOddsBandMeta(item.odds),
        popularityRank: item.popularity,
      }))
    : explicitOddsPreview
        .filter((item) => normalizeOddsPreviewText(item.tag).includes("3連単"))
        .map((item) => {
          const oddsText = normalizeOddsPreviewText(item.odds);
          const comboText = normalizeTrifectaComboText(item.combo);
          const pointMatch = oddsText.match(/計\s*(\d+)点/);
          const pointCount = Number(pointMatch?.[1] ?? 0);
          const rangeValues = parseOddsRangeValues(oddsText);
          const floorOdds = rangeValues[0] ?? parseOddsFloorValue(oddsText);
          const ceilingOdds = rangeValues[1] ?? floorOdds;
          return {
            combo: comboText,
            comboDisplay: pointCount >= 2 ? formatGroupedTrifectaCombo(comboText, pointCount) : comboText,
            floorOdds,
            ceilingOdds,
            oddsText,
            points: pointCount,
            band: getOddsBandMeta(floorOdds),
            popularityRank: undefined,
          };
        }))
    .sort((a, b) => {
      if ((a.popularityRank ?? Number.MAX_SAFE_INTEGER) !== (b.popularityRank ?? Number.MAX_SAFE_INTEGER)) {
        return (a.popularityRank ?? Number.MAX_SAFE_INTEGER) - (b.popularityRank ?? Number.MAX_SAFE_INTEGER);
      }
      if (a.floorOdds === null && b.floorOdds === null) return 0;
      if (a.floorOdds === null) return 1;
      if (b.floorOdds === null) return -1;
      return a.floorOdds - b.floorOdds;
    })
    .map((item, index) => ({
      ...item,
      popularityRank: item.popularityRank ?? index + 1,
    }));
  const formatOddsValue = (value: number | null) =>
    value !== null
      ? `${value.toLocaleString("ja-JP", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}倍`
      : "--.-倍";
  const sortedTrifectaOddsRows = [...trifectaOddsRows].sort((a, b) => {
    if (oddsSortMode === "odds") {
      if (a.floorOdds === null && b.floorOdds === null) {
        return (a.popularityRank ?? Number.MAX_SAFE_INTEGER) - (b.popularityRank ?? Number.MAX_SAFE_INTEGER);
      }
      if (a.floorOdds === null) return 1;
      if (b.floorOdds === null) return -1;
      if (a.floorOdds !== b.floorOdds) return a.floorOdds - b.floorOdds;
      return (a.popularityRank ?? Number.MAX_SAFE_INTEGER) - (b.popularityRank ?? Number.MAX_SAFE_INTEGER);
    }

    if ((a.popularityRank ?? Number.MAX_SAFE_INTEGER) !== (b.popularityRank ?? Number.MAX_SAFE_INTEGER)) {
      return (a.popularityRank ?? Number.MAX_SAFE_INTEGER) - (b.popularityRank ?? Number.MAX_SAFE_INTEGER);
    }
    if (a.floorOdds === null && b.floorOdds === null) return 0;
    if (a.floorOdds === null) return 1;
    if (b.floorOdds === null) return -1;
    return a.floorOdds - b.floorOdds;
  });
  const displayedTrifectaOddsRows =
    oddsDisplayLimit === "all" ? sortedTrifectaOddsRows : sortedTrifectaOddsRows.slice(0, oddsDisplayLimit);
  const oddsFetchedCount = trifectaOddsRows.length;
  const oddsVisibleCount = displayedTrifectaOddsRows.length;
  const oddsDataSourceLabel = explicitTrifectaOdds.length ? "3連単取得件数" : "取得件数";
  const oddsSectionBadge =
    chaosLabel === "高め"
      ? "穴含み"
      : chaosLabel === "中くらい"
      ? "中穴混在"
      : "本線中心";
  const oddsSummaryLabel =
    selectedRace?.oddsNote?.trim() ||
    (trifectaOddsRows.length
      ? "Kドリ系の見やすさを意識して、取得済みの3連単を低オッズ順で一覧表示"
      : "3連単オッズ未取得");

  const markSymbolMap: Record<string, string> = { 本命: "◎", 対抗: "○", 穴: "▲" };
  const riderMarkLookup = new Map(
    predictionMarks
      .filter((item) => item.rider)
      .map((item) => [
        item.rider!.carNo,
        {
          label: item.label,
          symbol: markSymbolMap[item.label] ?? "注",
          note: item.note,
          tone: item.tone,
        },
      ])
  );

  const enhancedRiderRows = selectedRiders.map((rider, index) => {
    const metrics = buildEnhancedRiderMetrics(rider, index);
    const markInfo = riderMarkLookup.get(rider.carNo);

    return {
      rider,
      metrics,
      markInfo,
      profileLine: deriveRiderProfileLine(rider),
      commentLabel: rider.comment?.trim() || "コメント未掲載",
    };
  });



  const raceHeroLead =
    topCandidate && secondCandidate
      ? `${topCandidate.name}を軸に、${secondCandidate.name}が相手本線。${darkHorseCandidate ? `${darkHorseCandidate.name}の食い込みまでを警戒。` : ""}`
      : "本命・対抗・穴の見立てはデータ反映後にここへ表示します。";

  const raceHeroSub =
    topCandidate
      ? `${topCandidate.role.secondaryBonus ? "番手恩恵" : topCandidate.role.frontBonus ? "主導権" : "得点優位"}を評価して軸候補に設定。${chaosLabel === "高め" ? "波乱気配もあるので相手広め推奨。" : chaosLabel === "中くらい" ? "相手線は広げすぎず整理。": "本線寄りで組みやすいレース。"}`
      : "選手評価は整理中です。";

  const gptTemplate = `【会場】${selectedVenue?.venue ?? "○○"}
【レース】${selectedRace?.raceNo ?? "○"}R
【発走】${selectedRace?.time ?? "○○:○○"}
【並び予想】${raceLineupFixedLabel}
【主導権候補】${leadLabel}
【本命候補】${topCandidate?.name ?? "整理中"}
【対抗候補】${secondCandidate?.name ?? "整理中"}
【穴候補】${darkHorseCandidate?.name ?? "整理中"}
【買いの芯】${coreBuyLabel}
【消しの芯】${coreFadeLabel}
【展開メモ】${selectedRace?.sourceNote?.trim() || "整理中"}`;

  const predictionVenueSummary: PredictionVenueSummary = {
    bankFeature: selectedVenueGuideSummary.bankCharacter,
    target: selectedVenueGuideSummary.target,
    caution: selectedVenueGuideSummary.caution,
    volatility: selectedVenueGuideSummary.volatility.label,
    bankLength: selectedVenueGuideSummary.bankLength,
    bankMemo: selectedVenueGuideSummary.venueMemo,
    source: selectedVenueGuideSummary.hasData ? "linked" : "missing",
  };

  const predictionWeather: PredictionWeatherData | null = venueWeather
    ? {
        weatherLabel: venueWeather.weatherLabel,
        temperatureText: venueWeather.temperatureText,
        windSpeedText: venueWeather.windSpeedText,
        windDirectionText: venueWeather.windDirectionText,
        precipitationText: venueWeather.precipitationText,
        updatedAtText: venueWeather.updatedAtText,
        referenceText: venueWeather.referenceText,
      }
    : null;

  const gptMaterialText = selectedVenue && selectedRace
    ? buildPredictionExportText({
        date: TODAY,
        venue: { ...selectedVenue, races: (selectedVenue.races ?? []) as PredictionRaceItem[] } as PredictionVenueItem,
        race: selectedRace as PredictionRaceItem,
        materialRace: selectedRace as PredictionRaceItem,
        materialRiders: selectedRiders as never,
        gradeLabel: formatRaceGradeLabel(selectedVenue.grade),
        venueSummary: predictionVenueSummary,
        weather: predictionWeather,
        weatherFallbackText: weatherLoading ? "天気取得中" : weatherError || "天気未取得",
        memo: "",
        riderBasicText: "",
        recentPerformanceText: "",
        recentRaceText: "",
        matchupText: "",
        trackAffinityText: "",
        dataAnalysisText: "",
        oddsText: "",
      })
    : gptTemplate;

  const raceInfoTabs = [
    { key: "card" as const, label: "出走表", sub: "基本データ" },
    { key: "recent" as const, label: "近況成績", sub: "コメント要約" },
    { key: "previous" as const, label: "前回出走", sub: "レース成績" },
    { key: "yearly" as const, label: "年間勝利度数", sub: "年間成績" },
    { key: "sameTrack" as const, label: "同走路年間勝利度数", sub: "走路別成績" },
    { key: "local" as const, label: "当所5年", sub: "会場実績" },
    { key: "gpt" as const, label: "GPT素材", sub: "貼り付け用" },
  ];

  const riderCardTableRows = enhancedRiderRows.map(({ rider, metrics, markInfo, profileLine }) => ([
    <span style={{ display: "inline-flex", minWidth: "30px", height: "30px", alignItems: "center", justifyContent: "center", borderRadius: "9999px", background: getKeirinNumberColor(rider.carNo), color: getContrastTextColor(getKeirinNumberColor(rider.carNo)), fontWeight: 900 }}>{rider.carNo}</span>,
    rider.name,
    profileLine,
    rider.score || "—",
    rider.style || "—",
    metrics.s,
    metrics.b,
    metrics.wins,
    metrics.seconds,
    metrics.thirds,
    metrics.loses,
    metrics.winRate,
    metrics.quinellaRate,
    metrics.trifectaRate,
    markInfo?.symbol || "—",
  ]));

  const yearlyStatsRows = selectedRiders.map((rider) => ({
    rider,
    stats: rider.yearlyStats,
    summary: buildRacesPageStatsSummaryLine(rider.yearlyStats),
    categories: buildRacesPageStatsCategoryLine(rider.yearlyStats),
  }));

  const sameTrackStatsRows = selectedRiders.map((rider) => ({
    rider,
    stats: rider.sameTrackYearlyStats,
    summary: buildRacesPageStatsSummaryLine(rider.sameTrackYearlyStats),
    categories: buildRacesPageStatsCategoryLine(rider.sameTrackYearlyStats),
  }));

  const localFiveYearRows = selectedRiders.map((rider) => ({
    rider,
    stats: rider.localFiveYearStats,
    summary: buildRacesPageStatsSummaryLine(rider.localFiveYearStats),
    categories: buildRacesPageStatsCategoryLine(rider.localFiveYearStats),
  }));

const renderMiniTable = (headers: string[], rows: ReactNode[][]) => (
  <div
    style={{
      overflowX: "auto",
      borderRadius: isMobile ? "16px" : "18px",
      border: "1px solid #ebe3f3",
      background: "rgba(255,255,255,0.96)",
      WebkitOverflowScrolling: "touch",
    }}
  >
    <table
      style={{
        width: "100%",
        borderCollapse: "separate",
        borderSpacing: 0,
        minWidth: isMobile
          ? `${Math.max(620, headers.length * 96)}px`
          : `${Math.max(720, headers.length * 110)}px`,
      }}
    >
      <thead>
        <tr style={{ background: "#faf7fd" }}>
          {headers.map((header, index) => (
            <th
              key={`${header}-${index}`}
              style={{
                padding: isMobile ? "10px 8px" : "12px 10px",
                fontSize: isMobile ? "10px" : "11px",
                fontWeight: 900,
                color: "#6b5f91",
                borderBottom: "1px solid #ece5f6",
                textAlign: index === 0 ? "left" : "center",
                whiteSpace: "nowrap",
              }}
            >
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={`row-${rowIndex}`}>
            {row.map((cell, cellIndex) => (
              <td
                key={`cell-${rowIndex}-${cellIndex}`}
                style={{
                  padding: isMobile ? "10px 8px" : "12px 10px",
                  borderBottom: rowIndex === rows.length - 1 ? "none" : "1px solid #f2edf8",
                  textAlign: cellIndex === 0 ? "left" : "center",
                  fontSize: isMobile ? "12px" : "13px",
                  color: "#081224",
                  whiteSpace: cellIndex === 0 ? "nowrap" : "normal",
                  lineHeight: 1.55,
                }}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

  return (
    <div
      style={{
        minHeight: "100vh",
        position: "relative",
        overflowX: "hidden",
        isolation: "isolate",
        background: "transparent",
        color: "#111827",
      }}
    >
      <div
        aria-hidden="true"
        data-races-bg-layer="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          backgroundColor: "#dff5ff",
          backgroundImage: [
            "linear-gradient(180deg, rgba(255,255,255,0.00) 0%, rgba(255,255,255,0.04) 42%, rgba(255,255,255,0.10) 100%)",
            `url("${toPublicPath("/races-page/races-page-bg-keirin-soft-light.png")}")`,
          ].join(", "),
          backgroundRepeat: "no-repeat, no-repeat",
          backgroundSize: "cover, cover",
          backgroundPosition: "center top, center top",
          opacity: 1,
          filter: "saturate(1.2) contrast(1.08)",
        }}
      />

      <div style={{ position: "relative", zIndex: 1 }}>
    <SiteHeader activeKey="races" />

    <section
  id="races-page"
  style={{
    maxWidth: PAGE_MAX_WIDTH,
    margin: "0 auto",
    padding: isMobile ? "16px 12px 80px" : "26px 24px 120px",
    display: "grid",
    gap: isMobile ? "14px" : "18px",
  }}
>
      <section
  style={{
    position: "relative",
    overflow: "hidden",
    borderRadius: isMobile ? "28px" : "40px",
    padding: isMobile ? "22px 18px 22px" : "34px 34px 30px",
    border: "1px solid #ebe3f3",
          backgroundImage:
            'linear-gradient(135deg, rgba(255,255,255,0.48) 0%, rgba(248,242,255,0.42) 48%, rgba(238,248,255,0.46) 100%), url("/races-page/races-page-hero-bg-soft-pastel.png")',
          backgroundSize: "112% auto",
          backgroundPosition: "center 38%",
          backgroundRepeat: "no-repeat",
          boxShadow: "0 24px 52px rgba(15, 23, 42, 0.07)",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(90deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.00) 36%, rgba(255,255,255,0.06) 100%)",
            pointerEvents: "none",
          }}
        />
        <div style={{ position: "absolute", right: "-60px", top: "-74px", width: "210px", height: "210px", borderRadius: "50%", background: "radial-gradient(circle, rgba(122,103,184,0.12), rgba(122,103,184,0))", pointerEvents: "none" }} />
        <div style={{ position: "absolute", left: "-40px", bottom: "-76px", width: "200px", height: "200px", borderRadius: "50%", background: "radial-gradient(circle, rgba(126,196,255,0.14), rgba(126,196,255,0))", pointerEvents: "none" }} />

        <img
          src={toPublicPath("/races-page/races-page-hero-bg-charigon-peek.png")}
          alt="ちゃりごん"
          style={{
            position: "absolute",
            left: isMobile ? "-34px" : "-8px",
            bottom: isMobile ? "-4px" : "0px",
            width: isMobile ? "260px" : "520px",
            maxWidth: isMobile ? "72vw" : "46vw",
            opacity: isMobile ? 0.72 : 1,
            objectFit: "contain",
            pointerEvents: "none",
            zIndex: 1,
          }}
        />

        <div
  style={{
    position: "relative",
    zIndex: 2,
    display: "grid",
    gap: isMobile ? "16px" : "22px",
  }}
>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "14px", flexWrap: "wrap" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "10px", borderRadius: "9999px", padding: "8px 12px", background: "rgba(255,255,255,0.82)", border: "1px solid #e8dff4", boxShadow: "0 8px 16px rgba(15, 23, 42, 0.04)" }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "9999px", background: "#8c63c7", display: "inline-block" }} />
              <span style={{ fontSize: "11px", fontWeight: 900, letterSpacing: "0.18em", color: "#8c63c7" }}>RACES PAGE</span>
            </div>

            <a
              href="#top"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "9999px",
                padding: "11px 16px",
                background: "linear-gradient(180deg, #fffefe 0%, #fff6fb 48%, #f6fbff 100%)",
                color: "#081224",
                textDecoration: "none",
                fontSize: "12px",
                fontWeight: 900,
                border: "1px solid #e7e3ef",
                boxShadow: "0 10px 20px rgba(15, 23, 42, 0.05)",
              }}
            >
              ← トップに戻る
            </a>
          </div>

          <div
  style={{
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "1.18fr 0.82fr",
    gap: isMobile ? "16px" : "20px",
    alignItems: "stretch",
  }}
>
            <div style={{ display: "grid", gap: "14px", paddingRight: "8px", minHeight: "248px" }}>
              <div
  style={{
    display: "flex",
    alignItems: isMobile ? "flex-start" : "center",
    justifyContent: "space-between",
    gap: isMobile ? "10px" : "18px",
    flexWrap: isMobile ? "wrap" : "nowrap",
  }}
>
                <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                  <img
                    src={toPublicPath("/races-page/races-page-title-todays-venues-logo.png")}
                    alt="今日の開催を、会場バーから気持ちよく選ぶ。"
                    style={{
                      display: "block",
                      width: "min(100%, 860px)",
                      maxWidth: "100%",
                      height: "auto",
                      objectFit: "contain",
                      filter: "drop-shadow(0 10px 24px rgba(255,255,255,0.55))",
                      transform: isMobile ? "translateY(-8px)" : "translateY(-20px)",
                    }}
                  />
                </div>

                <div
  style={{
    position: "relative",
    width: isMobile ? "100%" : "392px",
    minWidth: isMobile ? 0 : "392px",
    height: isMobile ? "190px" : "344px",
    flexShrink: 0,
    overflow: "visible",
    marginTop: isMobile ? "-8px" : 0,
  }}
>
                  <img
                    src={toPublicPath("/races-page/races-page-side-naughty-stand.png")}
                    alt="ノーティ"
                    style={{
                      position: "absolute",
                      left: isMobile ? "42%" : "122px",
                      bottom: isMobile ? "-8px" : "-15px",
                      width: "auto",
                      height: isMobile ? "218px" : "443px",
                      objectFit: "contain",
                      filter: "drop-shadow(0 16px 24px rgba(15,23,42,0.14))",
                      zIndex: 1,
                    }}
                  />
                  <img
                    src={toPublicPath("/races-page/races-page-side-kurari-stand.png")}
                    alt="くらり"
                    style={{
                      position: "absolute",
                      left: isMobile ? "6%" : "18px",
                      bottom: isMobile ? "-8px" : "-20px",
                      width: "auto",
                      height: isMobile ? "196px" : "390px",
                      objectFit: "contain",
                      filter: "drop-shadow(0 18px 26px rgba(15,23,42,0.16))",
                      zIndex: 3,
                    }}
                  />
                  <img
                    src={toPublicPath("/races-page/races-page-side-charigon-stand.png")}
                    alt="ちゃりごん"
                    style={{
                      position: "absolute",
                      left: isMobile ? "63%" : "200px",
                      bottom: isMobile ? "-8px" : "-20px",
                      width: "auto",
                      height: isMobile ? "196px" : "390px",
                      objectFit: "contain",
                      filter: "drop-shadow(0 18px 26px rgba(15,23,42,0.16))",
                      zIndex: 3,
                    }}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: "grid", alignContent: "start" }}>
<div
  style={{
    borderRadius: isMobile ? "24px" : "30px",
    border: "1px solid rgba(235,227,243,0.78)",
    background: "rgba(255,255,255,0.72)",
    padding: isMobile ? "20px 18px 20px" : "26px 24px 24px",
    boxShadow: "0 10px 22px rgba(15, 23, 42, 0.035)",
    minHeight: isMobile ? "auto" : "276px",
    display: "grid",
    alignContent: "start",
    gap: "0",
    backdropFilter: "blur(8px)",
  }}
>
                {/* 英字小見出し */}
                <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.22em", color: "rgba(140,99,199,0.82)", marginBottom: "8px" }}>TODAY'S VENUES</div>

                {/* 主役タイトル */}
                <div
  style={{
    fontSize: isMobile ? "24px" : "28px",
    fontWeight: 900,
    lineHeight: 1.25,
    letterSpacing: "-0.03em",
    color: "#081224",
    marginBottom: isMobile ? "12px" : "16px",
  }}
>
  今日の開催一覧
</div>

                {/* 日付・更新・開催数 */}
                <div style={{ display: "grid", gap: "0", marginBottom: "20px" }}>
                  <div style={{ fontSize: "13px", fontWeight: 800, lineHeight: 1.8, color: "#526072" }}>{todayDisplayLabel}</div>
                  <div style={{ fontSize: "13px", fontWeight: 700, lineHeight: 1.8, color: "#526072" }}>{updatedTimeLabel}</div>
                  <div style={{ fontSize: "13px", fontWeight: 700, lineHeight: 1.8, color: "#526072" }}>全{sortedTodayVenues.length}開催</div>
                </div>

                {/* 区切り線 */}
                <div style={{ height: "1px", background: "linear-gradient(90deg, rgba(224,214,244,0) 0%, rgba(224,214,244,0.6) 28%, rgba(224,214,244,0.6) 72%, rgba(224,214,244,0) 100%)", marginBottom: "20px" }} />

                {/* おすすめレース 小見出し */}
                <div style={{ fontSize: "11px", fontWeight: 900, letterSpacing: "0.16em", color: "rgba(140,99,199,0.86)", marginBottom: "12px" }}>オッズから見るおすすめのレース</div>

                {/* おすすめレース 本文 */}
                {heroRecommendedRaces.length === 0 ? (
                  <div style={{ fontSize: "13px", color: "#94a3b8", lineHeight: 1.9 }}>11倍以上の未発走レースは現在ありません</div>
                ) : (
                  <div style={{ display: "grid", gap: "0" }}>
                    {heroRecommendedRaces.map((r, i) => {
                      const bestOdds = r.oddsPreview
                        .map((o) => parseOddsNumber(o.odds))
                        .filter((v): v is number => v !== null && v >= 11)
                        .sort((a, b) => b - a)[0];
                      return (
                        <div
                          key={`hero-rec-${i}`}
style={{
  display: "grid",
  gridTemplateColumns: isMobile ? "1fr auto" : "1fr auto auto",
  alignItems: "baseline",
  columnGap: isMobile ? "8px" : "10px",
  rowGap: "2px",
  padding: "4px 0",
}}
                        >
                          <div style={{ fontSize: "14px", fontWeight: 800, color: "#081224" }}>{r.venue} {r.raceNo}R</div>
<div
  style={{
    display: isMobile ? "none" : "block",
    fontSize: "13px",
    fontWeight: 700,
    color: "#64748b",
  }}
>
  {r.time}
</div>
                          <div style={{ fontSize: "16px", fontWeight: 900, color: "#6f5aa9" }}>{bestOdds?.toFixed(1)}倍</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
<section
  style={{
    borderRadius: isMobile ? "26px" : "36px",
    padding: isMobile ? "14px" : "20px",
    border: "1px solid #ebe3f3",
    background: "linear-gradient(180deg, #fffefe 0%, #fbf9fe 100%)",
    boxShadow: "0 18px 34px rgba(15, 23, 42, 0.05)",
    display: "grid",
    gap: isMobile ? "12px" : "16px",
  }}
>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "11px", fontWeight: 900, letterSpacing: "0.18em", color: "#8c63c7", marginBottom: "4px" }}>TODAY'S VENUES · PICK A TRACK</div>
          </div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", borderRadius: "9999px", padding: "8px 12px", background: "#ffffff", border: "1px solid #ebe3f3", boxShadow: "0 8px 16px rgba(15, 23, 42, 0.03)" }}>
            <span style={{ width: "7px", height: "7px", borderRadius: "9999px", background: "#8c63c7", display: "inline-block" }} />
            <span style={{ fontSize: "11px", fontWeight: 900, color: "#5f6f84" }}>会場タブ</span>
          </div>
        </div>

        {(() => {
          const _total = sortedTodayVenues.length;
          const _venueRows: LiveTodayVenueItem[][] =
            _total <= 4
              ? [sortedTodayVenues]
              : [
                  sortedTodayVenues.slice(0, Math.ceil(_total / 2)),
                  sortedTodayVenues.slice(Math.ceil(_total / 2)),
                ];
          return (
            <div style={{ display: "grid", gap: "12px" }}>
              {_venueRows.map((row, rowIdx) => (
                <div
                  key={`venue-row-${rowIdx}`}
                  style={{
                    display: "grid",
gridTemplateColumns: isMobile ? "1fr" : `repeat(${row.length}, minmax(0, 1fr))`,
gap: isMobile ? "10px" : "12px",
                  }}
                >
                  {row.map((venue: LiveTodayVenueItem) => {
            const active = venue.id === selectedVenue?.id;
            const stage = getRacesPageStageLabel(venue, generatedDate);
            const venueBand = getVenueTimeBand(venue);
            const venueCardSessionLabel = normalizeRacesPageSessionLabel(venueBand);
            const venueCardSessionTone =
              venueBand === "morning"
                ? { background: "#fff7cc", color: "#9a6a00", border: "#f3df8a" }
                : venueBand === "day"
                ? { background: "#eaf6ff", color: "#3d6b98", border: "#cfe6fb" }
                : venueBand === "night"
                ? { background: "#fff1e6", color: "#c46a1a", border: "#f6cfad" }
                : venueBand === "midnight"
                ? { background: "#f2ecfb", color: "#7a67b8", border: "#e0d6f4" }
                : { background: "#eaf6ff", color: "#3d6b98", border: "#cfe6fb" };
            const firstTime = venue.races?.[0]?.time || "—";
            const lastTime = venue.races?.[venue.races.length - 1]?.time || "—";

            return (
              <button
                key={venue.id}
                type="button"
                onClick={() => setSelectedVenueId(venue.id)}
                style={{
                  textAlign: "left",
                  borderRadius: isMobile ? "22px" : "28px",
                  border: active ? "1.5px solid #d3c2f0" : "1px solid #ebe3f3",
                  background: active
                    ? "linear-gradient(180deg, #f8f1ff 0%, #ffffff 54%, #f2f9ff 100%)"
                    : "linear-gradient(180deg, #ffffff 0%, #fcfbfe 100%)",
                  padding: isMobile ? "14px 14px 13px" : "17px 17px 15px",
                  boxShadow: active
                    ? "0 16px 32px rgba(122,103,184,0.11)"
                    : "0 10px 20px rgba(15, 23, 42, 0.04)",
                  cursor: "pointer",
                  display: "grid",
                  gap: isMobile ? "8px" : "10px",
                  transition: "transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease",
                }}
                onMouseEnter={(event) => {
                  event.currentTarget.style.transform = "translateY(-2px)";
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.transform = "translateY(0)";
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: isMobile ? "5px" : "6px", minWidth: 0 }}>
                      <span style={{ fontSize: "20px", fontWeight: 900, color: "#081224", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0, flex: "1 1 auto" }}>{venue.venue}</span>
                      {hasFavoriteRiderInVenue(venue) && (
                        <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", borderRadius: "9999px", padding: "4px 8px", fontSize: "10px", fontWeight: 900, background: "#fff4f7", color: "#c35b68", border: "1px solid #f3c8cf" }}>❤ 推し</span>
                      )}
                    </div>
                    <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{venue.title}</div>
                  </div>
                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "9999px", padding: "6px 10px", fontSize: "11px", fontWeight: 900, background: getGradeBadgeTone(venue.grade).background, color: getGradeBadgeTone(venue.grade).text, border: `1px solid ${getGradeBadgeTone(venue.grade).border}`, boxShadow: getGradeBadgeTone(venue.grade).shadow }}>
                    {formatRaceGradeLabel(venue.grade)}
                  </span>
                </div>

                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "9999px", padding: "5px 9px", fontSize: "10px", fontWeight: 900, background: venueCardSessionTone.background, color: venueCardSessionTone.color, border: `1px solid ${venueCardSessionTone.border}` }}>{venueCardSessionLabel}</span>
                  {stage ? (
                    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "9999px", padding: "5px 9px", fontSize: "10px", fontWeight: 900, background: "#eef8ff", color: "#3d6b98", border: "1px solid #cfe6fb" }}>{stage}</span>
                  ) : null}
                </div>

<div
  style={{
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: isMobile ? "6px" : "8px",
  }}
>
                  <div style={{ borderRadius: "16px", padding: isMobile ? "8px 8px 7px" : "10px 10px 9px", background: "rgba(255,255,255,0.82)", border: "1px solid #ece5f6" }}>
                    <div style={{ fontSize: "9px", fontWeight: 900, color: "#7b8a9d", letterSpacing: "0.14em", marginBottom: "5px" }}>1R</div>
                    <div style={{ fontSize: "14px", fontWeight: 900, color: "#081224" }}>{firstTime}</div>
                  </div>
                  <div style={{ borderRadius: "16px", padding: isMobile ? "8px 8px 7px" : "10px 10px 9px", background: "rgba(255,255,255,0.82)", border: "1px solid #ece5f6" }}>
                    <div style={{ fontSize: "9px", fontWeight: 900, color: "#7b8a9d", letterSpacing: "0.14em", marginBottom: "5px" }}>LAST</div>
                    <div style={{ fontSize: "14px", fontWeight: 900, color: "#081224" }}>{lastTime}</div>
                  </div>
                  <div style={{ borderRadius: "16px", padding: isMobile ? "8px 8px 7px" : "10px 10px 9px", background: "rgba(255,255,255,0.82)", border: "1px solid #ece5f6" }}>
                    <div style={{ fontSize: "9px", fontWeight: 900, color: "#7b8a9d", letterSpacing: "0.14em", marginBottom: "5px" }}>RACE</div>
                    <div style={{ fontSize: "14px", fontWeight: 900, color: "#081224" }}>{venue.races?.length ?? 0}R</div>
                  </div>
                </div>
              </button>
            );
          })}
                </div>
              ))}
            </div>
          );
        })()}
      </section>

      {selectedVenue && (() => {
        const _spotlightImagePath = VENUE_SPOTLIGHT_IMAGE_MAP[selectedVenue.venue] ?? null;
        const _spotlightImage = _spotlightImagePath ? toPublicPath(_spotlightImagePath) : null;
        if (import.meta.env.DEV && !_spotlightImage) {
          console.debug("[RacesPage] venue spotlight image missing", {
            venueName: selectedVenue.venue,
            imagePath: "not found",
          });
        }
        const _spotlightProfile = getRacesPageBankProfile(selectedVenue.venue);
        const _spotlightCatch = selectedVenueBankSummary?.feature || _spotlightProfile.bankFeature;
        const _spotlightSub = selectedVenueBankSummary?.target || _spotlightProfile.mainMemo;
        const _spotlightSessionLabel = getRacesPageVenueSessionLabel(selectedVenue);
        return (
<section
  style={{
    borderRadius: isMobile ? "26px" : "32px",
    border: "1px solid #ebe3f3",
    background: "linear-gradient(135deg, #ffffff 0%, #faf7ff 55%, #f4f9ff 100%)",
    boxShadow: "0 12px 28px rgba(15, 23, 42, 0.045)",
    padding: isMobile ? "20px 18px" : "26px 28px",
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "1fr 380px",
    gap: isMobile ? "18px" : "28px",
    alignItems: "center",
  }}
>
            {/* 左側：テキスト */}
            <div style={{ display: "grid", alignContent: "start", gap: "0" }}>
              <div style={{ fontSize: "11px", fontWeight: 900, letterSpacing: "0.18em", color: "#8c63c7", marginBottom: "10px" }}>VENUE SPOTLIGHT</div>
              <div
  style={{
    fontSize: isMobile ? "28px" : "34px",
    fontWeight: 900,
    lineHeight: 1.2,
    color: "#081224",
    letterSpacing: "-0.02em",
    marginBottom: isMobile ? "10px" : "14px",
  }}
>
  {selectedVenue.venue}
</div>
              <div style={{ fontSize: "16px", fontWeight: 800, color: "#425266", lineHeight: 1.8, marginBottom: "10px" }}>{_spotlightCatch}</div>
              <div style={{ fontSize: "13px", color: "#64748b", lineHeight: 1.9, marginBottom: "16px" }}>{_spotlightSub}</div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <span style={{ display: "inline-flex", alignItems: "center", borderRadius: "9999px", padding: "5px 10px", fontSize: "11px", fontWeight: 900, background: getGradeBadgeTone(selectedVenue.grade).background, color: getGradeBadgeTone(selectedVenue.grade).text, border: `1px solid ${getGradeBadgeTone(selectedVenue.grade).border}` }}>{formatRaceGradeLabel(selectedVenue.grade)}</span>
                <span style={{ display: "inline-flex", alignItems: "center", borderRadius: "9999px", padding: "5px 10px", fontSize: "11px", fontWeight: 800, background: "rgba(242,236,251,0.7)", color: "#7a67b8", border: "1px solid #e0d6f4" }}>{_spotlightSessionLabel}</span>
              </div>
            </div>

            {/* 右側：画像 */}
<div
  style={{
    borderRadius: isMobile ? "20px" : "24px",
    overflow: "hidden",
    background: "linear-gradient(135deg, #f4effe 0%, #eef5ff 100%)",
    border: "1px solid rgba(224,214,244,0.6)",
    height: isMobile ? "170px" : "220px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  }}
>
              {_spotlightImage ? (
                <img
                  src={_spotlightImage}
                  alt={selectedVenue.venue}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block",
                  }}
                />
              ) : (
                <div style={{ fontSize: "28px", fontWeight: 900, color: "rgba(140,99,199,0.18)", letterSpacing: "-0.02em", userSelect: "none" }}>{selectedVenue.venue}</div>
              )}
            </div>
          </section>
        );
      })()}

      <section
  style={{
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "1fr auto",
    gap: isMobile ? "10px" : "14px",
    alignItems: isMobile ? "start" : "center",
  }}
>
        <div>
          <div style={{ fontSize: "11px", fontWeight: 900, letterSpacing: "0.18em", color: "#8c63c7", marginBottom: "6px" }}>RACE SELECTOR · QUICK JUMP</div>
          <div style={{ fontSize: "14px", color: "#64748b", fontWeight: 700 }}>{selectedVenue ? `${selectedVenue.venue} のRバー` : "会場選択待ち"}</div>
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", borderRadius: "9999px", padding: "8px 12px", background: "#ffffff", border: "1px solid #ebe3f3", boxShadow: "0 8px 16px rgba(15, 23, 42, 0.03)" }}>
          <span style={{ width: "7px", height: "7px", borderRadius: "9999px", background: "#7a67b8", display: "inline-block" }} />
          <span style={{ fontSize: "11px", fontWeight: 900, color: "#5f6f84" }}>今見ているのは {selectedRace?.raceNo ?? "-"}R</span>
        </div>
      </section>

      <section
  style={{
    display: "grid",
    gap: isMobile ? "10px" : "12px",
    gridTemplateColumns: isMobile
      ? "repeat(auto-fit, minmax(72px, 1fr))"
      : "repeat(auto-fit, minmax(94px, 1fr))",
  }}
>
        {selectedVenueRaces.map((race) => {
          const active = race.raceNo === selectedRace?.raceNo;
          return (
            <button
              key={`${selectedVenue?.id}-${race.raceNo}`}
              type="button"
              onClick={() => setSelectedRaceNo(race.raceNo)}
              style={{
                borderRadius: isMobile ? "18px" : "22px",
                border: active ? "1.5px solid #cdbff0" : "1px solid #ebe3f3",
                background: active
                  ? "linear-gradient(180deg, #f7f0ff 0%, #ffffff 55%, #f3f9ff 100%)"
                  : "linear-gradient(180deg, #ffffff 0%, #fbf9fe 100%)",
                padding: isMobile ? "12px 9px" : "15px 12px",
                boxShadow: active ? "0 14px 28px rgba(122,103,184,0.10)" : "0 10px 20px rgba(15, 23, 42, 0.04)",
                cursor: "pointer",
                display: "grid",
                gap: isMobile ? "5px" : "6px",
              }}
            >
              <div style={{ fontSize: "17px", fontWeight: 900, color: "#081224", lineHeight: 1 }}>{race.raceNo}R</div>
              <div style={{ fontSize: "12px", fontWeight: 800, color: active ? "#7a67b8" : "#607086" }}>{race.time || "—"}</div>
              <div style={{ fontSize: "10px", color: "#7b8a9d", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{race.title?.trim() || "レース詳細"}</div>
            </button>
          );
        })}
      </section>

      <section
  style={{
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.2fr) minmax(330px, 0.8fr)",
    gap: isMobile ? "16px" : "20px",
    alignItems: "start",
  }}
>
        <article style={{ display: "grid", gap: "20px" }}>
          <section
  style={{
    borderRadius: isMobile ? "26px" : "36px",
    border: "1px solid #ebe3f3",
    background: "linear-gradient(180deg, #fffefe 0%, #fbf8fe 100%)",
    boxShadow: "0 18px 40px rgba(15, 23, 42, 0.06)",
    padding: isMobile ? "18px" : "26px",
  }}
>
<div
  style={{
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(320px, 1fr))",
    gap: isMobile ? "16px" : "24px",
    alignItems: "center",
    marginBottom: isMobile ? "14px" : "18px",
  }}
>
              <div style={{ display: "grid", gap: "18px", minWidth: 0 }}>
                <div style={{ display: "grid", gap: "10px" }}>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "9999px", padding: "6px 10px", fontSize: "11px", fontWeight: 900, background: "#f2ecfb", color: "#7a67b8", border: "1px solid #e0d6f4" }}>{selectedVenue?.venue ?? "会場"}</span>
                    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "9999px", padding: "6px 10px", fontSize: "11px", fontWeight: 900, background: "#ffffff", color: "#526072", border: "1px solid #ebe3f3" }}>{selectedRace?.raceNo ?? "-"}R</span>
                    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "9999px", padding: "6px 10px", fontSize: "11px", fontWeight: 900, background: "#eef8ff", color: "#3d6b98", border: "1px solid #cfe6fb" }}>{selectedRace?.time || "—"} 発走</span>
                  </div>
                  <h2
  style={{
    margin: 0,
    fontSize: isMobile ? "28px" : "38px",
    lineHeight: isMobile ? 1.18 : 1.08,
    letterSpacing: isMobile ? "-0.02em" : "-0.03em",
    color: "#081224",
    wordBreak: "keep-all",
    overflowWrap: "break-word",
  }}
>
  {raceTitleLabel}
</h2>
<p
  style={{
    margin: 0,
    fontSize: isMobile ? "13px" : "15px",
    lineHeight: isMobile ? 1.75 : 1.9,
    color: "#64748b",
    maxWidth: "820px",
  }}
>
                    レースの軸情報を大きく見せて、判断材料は下と右に整理。カード・タブ・情報パネルの見せ方はスポーツダッシュボード系のレイアウトを参考に、競輪向けにやわらかく寄せています。
                  </p>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(120px, 1fr))", gap: "10px", minWidth: "260px", maxWidth: "560px" }}>
                  {raceCompassItems.map((item) => (
                    <div key={item.label} style={{ borderRadius: isMobile ? "18px" : "22px", border: "1px solid #ece5f6", background: "linear-gradient(180deg, #ffffff 0%, #faf8fd 100%)", padding: "14px 14px 12px", boxShadow: "0 8px 18px rgba(15, 23, 42, 0.04)" }}>
                      <div style={{ fontSize: "9px", fontWeight: 900, letterSpacing: "0.16em", color: "#7b8a9d", marginBottom: "8px" }}>{item.label}</div>
                      <div style={{ fontSize: "20px", fontWeight: 900, color: "#081224", lineHeight: 1.1 }}>{item.value}</div>
                      <div style={{ marginTop: "6px", fontSize: "11px", fontWeight: 700, color: "#64748b" }}>{item.sub}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", minWidth: 0, paddingRight: "10px" }}>
                <img
                  src={toPublicPath("/races-page/races-page-right-hero-kurari-charigon-study.png")}
                  alt="くらりとちゃりごんがノートを見ている様子"
                  style={{
                    width: "100%",
                    maxWidth: "500px",
                    height: "auto",
                    objectFit: "contain",
                    display: "block",
                    justifySelf: "end",
                    alignSelf: "center",
                  }}
                />
              </div>
            </div>

            <section style={{ borderRadius: "30px", border: "1px solid #e7ddf4", background: "linear-gradient(135deg, rgba(248,240,255,0.96) 0%, rgba(255,255,255,1) 58%, rgba(240,249,255,0.98) 100%)", padding: "22px", boxShadow: "0 14px 28px rgba(122,103,184,0.08)", marginBottom: "16px", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", right: "-28px", top: "-28px", width: "120px", height: "120px", borderRadius: "50%", background: "radial-gradient(circle, rgba(122,103,184,0.12), rgba(122,103,184,0))" }} />
              <div style={{ position: "relative", zIndex: 1, display: "grid", gap: "14px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "14px", flexWrap: "wrap" }}>
                  <div style={{ display: "grid", gap: "8px" }}>
                    <div style={{ fontSize: "11px", fontWeight: 900, letterSpacing: "0.18em", color: "#8c63c7" }}>RACE SPOTLIGHT</div>
                    <h3 style={{ margin: 0, fontSize: "24px", lineHeight: 1.28, letterSpacing: "-0.02em", color: "#081224" }}>{raceHeroLead}</h3>
                    <p style={{ margin: 0, fontSize: "13px", lineHeight: 1.9, color: "#5f6f84", maxWidth: "760px" }}>{raceHeroSub}</p>
                  </div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                    {predictionMarks.map((item) => (
                      <div key={`hero-${item.label}`} style={{ minWidth: "112px", borderRadius: "18px", border: `1px solid ${item.tone.border}`, background: "rgba(255,255,255,0.92)", padding: "10px 12px", boxShadow: "0 8px 18px rgba(15, 23, 42, 0.04)" }}>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: isMobile ? "5px" : "6px", marginBottom: "6px", fontSize: "10px", fontWeight: 900, letterSpacing: "0.12em", color: item.tone.text }}>
                          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "20px", height: "20px", borderRadius: "9999px", background: item.tone.bg, border: `1px solid ${item.tone.border}` }}>{markSymbolMap[item.label] ?? "注"}</span>
                          <span>{item.label}</span>
                        </div>
                        <div style={{ fontSize: "14px", fontWeight: 900, color: "#081224", lineHeight: 1.35 }}>{item.rider?.name ?? "整理中"}</div>
                        <div style={{ marginTop: "5px", fontSize: "11px", color: "#64748b", fontWeight: 800 }}>{item.rider?.carNo ? `${item.rider.carNo}番車` : "—"} {item.rider?.score ? ` / ${item.rider.score}` : ""}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section style={{ borderRadius: "30px", border: selectedRaceResultStatus === "confirmed" ? "1px solid #d7eadf" : "1px solid #ebe3f3", background: selectedRaceResultStatus === "confirmed" ? "linear-gradient(180deg, #f7fff8 0%, #ffffff 100%)" : "linear-gradient(180deg, #ffffff 0%, #fbf8fe 100%)", padding: "18px", boxShadow: "0 12px 24px rgba(15, 23, 42, 0.04)", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", marginBottom: "14px" }}>
                <div>
                  <div style={{ fontSize: "11px", fontWeight: 900, letterSpacing: "0.18em", color: selectedRaceResultStatus === "confirmed" ? "#0f766e" : "#8c63c7", marginBottom: "6px" }}>RESULT</div>
                  <div style={{ fontSize: "13px", color: "#64748b", fontWeight: 700 }}>{selectedRaceResultStatus === "confirmed" ? "自動取得した結果を表示中" : "結果の確定待ち"}</div>
                </div>
                <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", borderRadius: "9999px", padding: "8px 12px", background: "#ffffff", border: selectedRaceResultStatus === "confirmed" ? "1px solid #cfe9d8" : "1px solid #ebe3f3" }}>
                  <span style={{ width: "7px", height: "7px", borderRadius: "9999px", background: selectedRaceResultStatus === "confirmed" ? "#0f766e" : "#7a67b8", display: "inline-block" }} />
                  <span style={{ fontSize: "11px", fontWeight: 900, color: "#5f6f84" }}>{selectedRaceResult?.finalizedAt ? `確定 ${selectedRaceResult.finalizedAt}` : selectedRaceResultStatus === "confirmed" ? "結果確定" : "未確定"}</span>
                </div>
              </div>

              <div
  style={{
    display: "grid",
    gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(5, minmax(0, 1fr))",
    gap: isMobile ? "10px" : "12px",
    marginBottom: "14px",
  }}
>
                {selectedRaceResultCards.map((item) => (
                  <div key={item.label} style={{ borderRadius: "18px", border: "1px solid #e5edf5", background: "#ffffff", padding: "12px 13px" }}>
                    <div style={{ fontSize: "9px", fontWeight: 900, letterSpacing: "0.16em", color: "#7b8a9d", marginBottom: "6px" }}>{item.label}</div>
                    <div style={{ fontSize: "16px", fontWeight: 900, color: "#081224", lineHeight: 1.35, wordBreak: "break-word" }}>{item.value}</div>
                    <div style={{ marginTop: "6px", fontSize: "11px", fontWeight: 700, color: "#64748b" }}>{item.sub}</div>
                  </div>
                ))}
              </div>

              <div
  style={{
    display: "grid",
    gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))",
    gap: isMobile ? "8px" : "10px",
    marginBottom: "14px",
  }}
>
                {[
                  { label: "天候", value: selectedRaceWeatherActual?.weather || "--" },
                  { label: "風向", value: selectedRaceWeatherActual?.windDirection || "--" },
                  { label: "風速", value: selectedRaceWeatherActual?.windSpeed || "--" },
                  { label: "気温", value: selectedRaceWeatherActual?.temperature || "--" },
                ].map((item) => (
                  <div key={item.label} style={{ borderRadius: "14px", border: "1px solid #e0eefb", background: "#f7faff", padding: "10px 12px", display: "flex", flexDirection: "column", gap: "4px" }}>
                    <div style={{ fontSize: "9px", fontWeight: 900, letterSpacing: "0.14em", color: "#7b8a9d" }}>WEATHER ACTUAL</div>
                    <div style={{ fontSize: "10px", fontWeight: 900, color: "#5f6f84" }}>{item.label}</div>
                    <div style={{ fontSize: "14px", fontWeight: 900, color: item.value === "--" ? "#b0bec5" : "#081224" }}>{item.value}</div>
                  </div>
                ))}
              </div>

<div
  style={{
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.05fr) minmax(260px, 0.95fr)",
    gap: "12px",
  }}
>
                <div style={{ borderRadius: "18px", border: "1px solid #ece5f6", background: "#fffefe", padding: "14px" }}>
                  <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.16em", color: "#7b8a9d", marginBottom: "8px" }}>全着順</div>
                  {selectedRaceAllRows.length > 0 ? (
                    <div style={{ display: "grid", gap: "8px" }}>
{selectedRaceAllRows.map((item) => {
  const hasSMark = item.sMark || (selectedRaceSLeaderCarNo !== "" && item.carNo === selectedRaceSLeaderCarNo);
  const hasHMark = item.hMark || (selectedRaceHLeaderCarNo !== "" && item.carNo === selectedRaceHLeaderCarNo);
  const hasBMark = item.bMark || (selectedRaceBLeaderCarNo !== "" && item.carNo === selectedRaceBLeaderCarNo);
  const displayResultName = item.name.replace(/\s*お気に入り選手\s*[-ー−–—]*>\s*/g, "").trim();

  return (
                          <div
  key={`${item.place}-${item.carNo}-${item.name}`}
  style={{
    display: "grid",
    gridTemplateColumns: isMobile ? "38px 42px minmax(0, 1fr) auto" : "44px 52px minmax(0, 1fr) auto",
    gap: isMobile ? "7px" : "10px",
    alignItems: "center",
    borderRadius: "14px",
    border: "1px solid #edf2f7",
    background: "#ffffff",
    padding: isMobile ? "9px 9px" : "10px 12px",
  }}
>
                            <div style={{ fontSize: "15px", fontWeight: 900, color: "#081224" }}>{/^\d+$/.test(item.place) ? `${item.place}着` : item.place}</div>
                            <div>
                              <div style={{ fontSize: "15px", fontWeight: 900, color: "#7a67b8" }}>{item.carNo}</div>
                              {(hasSMark || hasHMark || hasBMark) && (
                                <div style={{ display: "flex", gap: "3px", flexWrap: "wrap", marginTop: "3px" }}>
                                  {hasSMark && <span style={{ fontSize: "9px", fontWeight: 900, color: "#0f766e", background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: "4px", padding: "1px 4px" }}>S</span>}
                                  {hasHMark && <span style={{ fontSize: "9px", fontWeight: 900, color: "#7c3aed", background: "#f5f3ff", border: "1px solid #c4b5fd", borderRadius: "4px", padding: "1px 4px" }}>H</span>}
                                  {hasBMark && <span style={{ fontSize: "9px", fontWeight: 900, color: "#b45309", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "4px", padding: "1px 4px" }}>B</span>}
                                </div>
                              )}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: "13px", fontWeight: 900, color: "#081224", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{displayResultName || item.name}</div>
                              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "2px" }}>
                                {item.agari && <span style={{ fontSize: "12px", fontWeight: 900, color: "#1e40af" }}>{item.agari}</span>}
                                {item.margin && <span style={{ fontSize: "11px", color: "#64748b" }}>{item.margin}</span>}
                              </div>
                            </div>
                            <div style={{ fontSize: "11px", fontWeight: 800, color: "#526072" }}>{item.kimarite || "--"}</div>
                          </div>
                        );
                      })}
                      {selectedRaceFullResultScopeNote ? (
                        <div style={{ fontSize: "12px", color: "#8b5e3c", lineHeight: 1.7 }}>{selectedRaceFullResultScopeNote}</div>
                      ) : null}
                    </div>
                  ) : (
                    <div style={{ fontSize: "13px", color: "#64748b", lineHeight: 1.8 }}>結果確定後に着順と決まり手を表示します。</div>
                  )}
                </div>
                <div style={{ borderRadius: "18px", border: "1px solid #ece5f6", background: "#fffefe", padding: "14px" }}>
                  <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.16em", color: "#7b8a9d", marginBottom: "8px" }}>払戻</div>
                  <div style={{ display: "grid", gap: "8px" }}>
                    {[
                      { label: "2車単", value: formatRacesPageResultPayout(selectedRacePayout2tan) },
                      { label: "2車複", value: formatRacesPageResultPayoutList(selectedRaceResult?.payout2fuku) },
                      { label: "3連単", value: formatRacesPageResultPayout(selectedRacePayout3tan) },
                      { label: "3連複", value: formatRacesPageResultPayout(selectedRacePayout3fuku) },
                      { label: "ワイド", value: formatRacesPageResultPayoutList(selectedRaceResult?.payoutWide) },
                    ].map((item) => (
                      <div key={item.label} style={{ display: "grid", gridTemplateColumns: "56px minmax(0, 1fr)", gap: "10px", alignItems: "start", borderRadius: "12px", border: "1px solid #edf2f7", background: "#ffffff", padding: "9px 10px" }}>
                        <div style={{ fontSize: "11px", fontWeight: 900, color: "#7b8a9d" }}>{item.label}</div>
                        <div style={{ fontSize: "12px", fontWeight: 800, color: "#081224", lineHeight: 1.7, wordBreak: "break-word" }}>{item.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section style={{ borderRadius: "30px", border: "1px solid #ebe3f3", background: "linear-gradient(180deg, #ffffff 0%, #fbf8fe 100%)", padding: "18px", boxShadow: "0 12px 24px rgba(15, 23, 42, 0.04)", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", marginBottom: "14px" }}>
                <div>
                  <div style={{ fontSize: "11px", fontWeight: 900, letterSpacing: "0.18em", color: "#8c63c7", marginBottom: "6px" }}>RACE DATA TABS</div>
                  <div style={{ fontSize: "13px", color: "#64748b", fontWeight: 700 }}>KDreams で取得できている出走表・近況・成績系データだけを切り替えて確認できます。</div>
                </div>
                <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", borderRadius: "9999px", padding: "8px 12px", background: "#ffffff", border: "1px solid #ebe3f3" }}>
                  <span style={{ width: "7px", height: "7px", borderRadius: "9999px", background: "#7a67b8", display: "inline-block" }} />
                  <span style={{ fontSize: "11px", fontWeight: 900, color: "#5f6f84" }}>KDreams取得データのみ表示</span>
                </div>
              </div>

              <div
  style={{
    display: isMobile ? "flex" : "grid",
    gridTemplateColumns: isMobile ? undefined : `repeat(${raceInfoTabs.length}, minmax(0, 1fr))`,
    gap: isMobile ? "8px" : "10px",
    marginBottom: "16px",
    overflowX: isMobile ? "auto" : "visible",
    paddingBottom: isMobile ? "2px" : 0,
  }}
>
                {raceInfoTabs.map((tab) => {
                  const active = activeRaceInfoTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setActiveRaceInfoTab(tab.key)}
                      style={{
                        textAlign: "left",
                        borderRadius: isMobile ? "18px" : "20px",
                        border: active ? "1.5px solid #ccbaf0" : "1px solid #ebe3f3",
                        background: active ? "linear-gradient(180deg, #f7f0ff 0%, #ffffff 60%, #f3f9ff 100%)" : "linear-gradient(180deg, #ffffff 0%, #fbf9fe 100%)",
                        padding: isMobile ? "11px 12px" : "13px 12px",
                        boxShadow: active ? "0 12px 24px rgba(122,103,184,0.10)" : "0 6px 14px rgba(15, 23, 42, 0.03)",
                        cursor: "pointer",
                        display: "grid",
                        gap: "4px",
                        minWidth: isMobile ? "112px" : undefined,
                        flexShrink: isMobile ? 0 : undefined,
                      }}
                    >
                      <div style={{ fontSize: "13px", fontWeight: 900, color: "#081224" }}>{tab.label}</div>
                      <div style={{ fontSize: "10px", fontWeight: 700, color: active ? "#7a67b8" : "#7b8a9d" }}>{tab.sub}</div>
                    </button>
                  );
                })}
              </div>

              {activeRaceInfoTab === "card" && (
                <div style={{ display: "grid", gap: "14px" }}>
                  <div
  style={{
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "1.05fr 0.95fr",
    gap: "12px",
  }}
>
                    <div style={{ borderRadius: "18px", border: "1px solid #ece5f6", background: "#fffefe", padding: "14px" }}>
                      <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.16em", color: "#7b8a9d", marginBottom: "8px" }}>並び予想</div>
                      <div style={{ display: "grid", gap: "10px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                          <span style={{ fontSize: "18px", color: "#f2a600" }}>⬅</span>
                          {raceLineupLabel === "並び予想未登録" || !parsedRaceLineup ? (
                            <div style={{ fontSize: "15px", fontWeight: 900, color: "#081224" }}>{raceLineupLabel}</div>
                          ) : (
                            parsedRaceLineup.segments.map((segment, groupIndex) => {
                              const cars = flattenRacesPageLineupSegmentCars(segment);
                              return (
                                <div key={`lineup-group-${groupIndex}`} style={{ display: "flex", alignItems: "flex-end", gap: "6px" }}>
                                  {cars.map((carNo) => {
                                    const tone = getRacesPageCarTone(carNo);
                                    const markInfo = riderMarkLookup.get(carNo);
                                    return (
                                      <div key={`lineup-car-${groupIndex}-${carNo}`} style={{ display: "grid", justifyItems: "center", gap: "4px" }}>
                                        <div style={{ minHeight: "18px", fontSize: "13px", fontWeight: 900, color: markInfo?.tone.text ?? "#a3afbf", lineHeight: 1 }}>
                                          {markInfo?.symbol ?? "☆"}
                                        </div>
                                        <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: "34px", height: "30px", borderRadius: "0px", background: tone.bg, color: tone.text, border: `1px solid ${tone.border}`, fontSize: "16px", fontWeight: 900, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35)" }}>
                                          {carNo}
                                        </div>
                                      </div>
                                    );
                                  })}
                                  {segment.kind === "battle" ? (
                                    <div style={{ paddingBottom: "2px", fontSize: "11px", fontWeight: 900, color: "#7b5db5", letterSpacing: "0.08em" }}>
                                      {formatRacesPageLineupSegment(segment)}
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })
                          )}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", color: "#64748b", fontSize: "11px", fontWeight: 800 }}>
                          {["本命", "対抗", "穴"].map((label) => {
                            const item = predictionMarks.find((mark) => mark.label === label);
                            return (
                              <div key={`legend-${label}`} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                                <span style={{ color: item?.tone.text ?? "#94a3b8", fontWeight: 900 }}>{item ? markSymbolMap[item.label] : "☆"}</span>
                                <span>{label}</span>
                              </div>
                            );
                          })}
                        </div>
                        <div style={{ fontSize: "12px", fontWeight: 900, color: parsedRaceLineup ? "#5b4b89" : "#b45309", letterSpacing: "0.04em" }}>
                          {raceLineupFixedCaption}
                        </div>
                      </div>
                    </div>
                    <div style={{ borderRadius: "18px", border: "1px solid #ece5f6", background: "#fffefe", padding: "14px" }}>
                      <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.16em", color: "#7b8a9d", marginBottom: "8px" }}>展開メモ</div>
                      <div style={{ fontSize: "13px", lineHeight: 1.85, color: "#425266", whiteSpace: "pre-wrap" }}>{selectedRace?.sourceNote?.trim() || "展開メモは当日反映予定"}</div>
                    </div>
                  </div>

                  <div
  style={{
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "repeat(4, minmax(0, 1fr))",
    gap: "12px",
  }}
>
                    {enhancedRiderRows.slice(0, 4).map(({ rider, metrics, markInfo, profileLine }) => {
                      const tone = getRacesPageCarTone(rider.carNo);
                      return (
                        <div key={`rider-summary-${rider.carNo}`} style={{ borderRadius: "18px", border: "1px solid #ebe3f3", background: "linear-gradient(180deg, #ffffff 0%, #faf8fd 100%)", padding: "14px", boxShadow: "0 8px 18px rgba(15, 23, 42, 0.04)" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginBottom: "10px" }}>
                            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "34px", height: "34px", borderRadius: "9999px", background: tone.bg, color: tone.text, border: `1px solid ${tone.border}`, fontWeight: 900 }}>{rider.carNo}</span>
                            <div style={{ display: "flex", gap: isMobile ? "5px" : "6px", alignItems: "center", flexWrap: "wrap" }}>
                              {markInfo && <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: "28px", height: "28px", borderRadius: "9999px", fontSize: "12px", fontWeight: 900, background: markInfo.tone.bg, color: markInfo.tone.text, border: `1px solid ${markInfo.tone.border}` }}>{markInfo.symbol}</span>}
                              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "9999px", padding: "4px 8px", fontSize: "10px", fontWeight: 800, background: "#f8fafc", color: "#526072", border: "1px solid #e5edf5" }}>{rider.style || "脚質待ち"}</span>
                            </div>
                          </div>
                          <div style={{ fontSize: "15px", fontWeight: 900, color: "#081224", marginBottom: "4px" }}>{rider.name}</div>
                          <div style={{ fontSize: "11px", color: "#7b8a9d", lineHeight: 1.7, marginBottom: "10px" }}>{profileLine}</div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "8px" }}>
                            {[{label: "得点", value: rider.score || "—"}, {label: "S/B", value: `${metrics.s}/${metrics.b}`}, {label: "3連対", value: metrics.trifectaRate}].map((item) => (
                              <div key={item.label} style={{ borderRadius: "12px", border: "1px solid #ebe3f3", background: "#ffffff", padding: "8px 9px" }}>
                                <div style={{ fontSize: "9px", fontWeight: 900, letterSpacing: "0.12em", color: "#7b8a9d", marginBottom: "4px" }}>{item.label}</div>
                                <div style={{ fontSize: "12px", fontWeight: 900, color: "#081224" }}>{item.value}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ display: "grid", gap: "10px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.16em", color: "#8c63c7", marginBottom: "4px" }}>出走表詳細</div>
                        <div style={{ fontSize: "13px", color: "#526072" }}>KDreams の出走表から取得した選手基本情報と年間成績の基礎値です。</div>
                      </div>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", borderRadius: "9999px", padding: "8px 12px", background: "#ffffff", border: "1px solid #ebe3f3", fontSize: "11px", fontWeight: 800, color: "#64748b" }}>
                        <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "9999px", background: "#7b67ba" }} /> 選手データ一覧
                      </div>
                    </div>
                    {renderMiniTable(
                      ["車", "選手名", "府県・年齢・期別・級班", "競走得点", "脚質", "S", "B", "1着", "2着", "3着", "着外", "勝率", "2連対率", "3連対率", "印"],
                      riderCardTableRows,
                    )}
                  </div>
                </div>
              )}

              {activeRaceInfoTab === "recent" && (
                <div style={{ display: "grid", gap: "12px", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))" }}>
                  {enhancedRiderRows.map(({ rider, commentLabel }) => (
                    <div key={`recent-${rider.carNo}`} style={{ borderRadius: "20px", border: "1px solid #ebe3f3", background: "rgba(255,255,255,0.94)", padding: "14px 16px", display: "grid", gap: "10px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                        <span style={{ display: "inline-flex", minWidth: "30px", height: "30px", alignItems: "center", justifyContent: "center", borderRadius: "9999px", background: getKeirinNumberColor(rider.carNo), color: getContrastTextColor(getKeirinNumberColor(rider.carNo)), fontWeight: 900 }}>{rider.carNo}</span>
                        <div style={{ fontSize: "15px", fontWeight: 900, color: "#081224" }}>{rider.name}</div>
                        <span style={{ fontSize: "11px", fontWeight: 800, color: "#64748b" }}>{rider.style || "脚質未掲載"}</span>
                      </div>
                      <div style={{ display: "grid", gap: "6px" }}>
                        <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.14em", color: "#8c63c7" }}>COMMENT</div>
                        <div style={{ fontSize: "13px", lineHeight: 1.8, color: commentLabel === "コメント未掲載" ? "#94a3b8" : "#425266" }}>{commentLabel}</div>
                      </div>
                      <div style={{ display: "grid", gap: "6px" }}>
                        <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.14em", color: "#8c63c7" }}>前回出走要約</div>
                        <div style={{ fontSize: "13px", lineHeight: 1.8, color: rider.previousRaceSummary?.trim() ? "#425266" : "#94a3b8" }}>{rider.previousRaceSummary?.trim() || "前回出走要約未掲載"}</div>
                      </div>
                      {rider.kdreamsRiderNote?.trim() ? (
                        <div style={{ fontSize: "12px", lineHeight: 1.7, color: "#8b5e3c", background: "#fffaf2", border: "1px solid #f4dfb3", borderRadius: "12px", padding: "8px 10px" }}>{rider.kdreamsRiderNote.trim()}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}

              {activeRaceInfoTab === "previous" && (
                <div style={{ display: "grid", gap: "12px", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))" }}>
                  {selectedRiders.map((rider) => {
                    const previousRaceLines = (rider.previousRaceResults ?? []).map((item, index) => buildRacesPageHistoricalRaceLine(item, index));
                    return (
                      <div key={`previous-${rider.carNo}`} style={{ borderRadius: "20px", border: "1px solid #ebe3f3", background: "rgba(255,255,255,0.94)", padding: "14px 16px", display: "grid", gap: "10px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                          <span style={{ display: "inline-flex", minWidth: "30px", height: "30px", alignItems: "center", justifyContent: "center", borderRadius: "9999px", background: getKeirinNumberColor(rider.carNo), color: getContrastTextColor(getKeirinNumberColor(rider.carNo)), fontWeight: 900 }}>{rider.carNo}</span>
                          <div style={{ fontSize: "15px", fontWeight: 900, color: "#081224" }}>{rider.name}</div>
                        </div>
                        <div style={{ display: "grid", gap: "8px" }}>
                          {previousRaceLines.length > 0 ? previousRaceLines.map((line, index) => (
                            <div key={`previous-line-${rider.carNo}-${index}`} style={{ fontSize: "13px", lineHeight: 1.8, color: "#425266", padding: "8px 10px", borderRadius: "12px", background: "#faf8fd", border: "1px solid #f0e9f8" }}>{line}</div>
                          )) : (
                            <div style={{ fontSize: "13px", lineHeight: 1.8, color: "#94a3b8" }}>前回出走レース成績未掲載</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {activeRaceInfoTab === "yearly" && (
                renderMiniTable(
                  ["車", "選手名", "競走得点", "出走", "1着", "2着", "3着", "着外", "サマリー", "内訳"],
                  yearlyStatsRows.map(({ rider, stats, summary, categories }) => [
                    <span style={{ display: "inline-flex", minWidth: "30px", height: "30px", alignItems: "center", justifyContent: "center", borderRadius: "9999px", background: getKeirinNumberColor(rider.carNo), color: getContrastTextColor(getKeirinNumberColor(rider.carNo)), fontWeight: 900 }}>{rider.carNo}</span>,
                    rider.name,
                    normalizeRacesPageMaterialValue(stats?.score, rider.score || "—"),
                    normalizeRacesPageMaterialValue(stats?.starts),
                    normalizeRacesPageMaterialValue(stats?.wins),
                    normalizeRacesPageMaterialValue(stats?.seconds),
                    normalizeRacesPageMaterialValue(stats?.thirds),
                    normalizeRacesPageMaterialValue(stats?.losses),
                    summary,
                    categories || "—",
                  ])
                )
              )}

              {activeRaceInfoTab === "sameTrack" && (
                renderMiniTable(
                  ["車", "選手名", "走路", "出走", "1着", "2着", "3着", "着外", "サマリー", "内訳"],
                  sameTrackStatsRows.map(({ rider, stats, summary, categories }) => [
                    <span style={{ display: "inline-flex", minWidth: "30px", height: "30px", alignItems: "center", justifyContent: "center", borderRadius: "9999px", background: getKeirinNumberColor(rider.carNo), color: getContrastTextColor(getKeirinNumberColor(rider.carNo)), fontWeight: 900 }}>{rider.carNo}</span>,
                    rider.name,
                    normalizeRacesPageMaterialValue(stats?.trackLength, selectedVenueGuideSummary.bankLength),
                    normalizeRacesPageMaterialValue(stats?.starts),
                    normalizeRacesPageMaterialValue(stats?.wins),
                    normalizeRacesPageMaterialValue(stats?.seconds),
                    normalizeRacesPageMaterialValue(stats?.thirds),
                    normalizeRacesPageMaterialValue(stats?.losses),
                    summary,
                    categories || "—",
                  ])
                )
              )}

              {activeRaceInfoTab === "local" && (
                renderMiniTable(
                  ["車", "選手名", "会場", "出走", "1着", "2着", "3着", "着外", "サマリー", "内訳"],
                  localFiveYearRows.map(({ rider, stats, summary, categories }) => [
                    <span style={{ display: "inline-flex", minWidth: "30px", height: "30px", alignItems: "center", justifyContent: "center", borderRadius: "9999px", background: getKeirinNumberColor(rider.carNo), color: getContrastTextColor(getKeirinNumberColor(rider.carNo)), fontWeight: 900 }}>{rider.carNo}</span>,
                    rider.name,
                    selectedVenue?.venue || "会場未選択",
                    normalizeRacesPageMaterialValue(stats?.starts),
                    normalizeRacesPageMaterialValue(stats?.wins),
                    normalizeRacesPageMaterialValue(stats?.seconds),
                    normalizeRacesPageMaterialValue(stats?.thirds),
                    normalizeRacesPageMaterialValue(stats?.losses),
                    summary,
                    categories || "—",
                  ])
                )
              )}

              {activeRaceInfoTab === "gpt" && (
                <div style={{ display: "grid", gap: "12px" }}>
                  <div style={{ borderRadius: "20px", border: "1px solid #ebe3f3", background: "rgba(255,255,255,0.94)", padding: "14px 16px" }}>
                    <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.16em", color: "#7b8a9d", marginBottom: "8px" }}>貼り付け用テンプレ</div>
                    <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "inherit", fontSize: "13px", lineHeight: 1.85, color: "#425266" }}>{gptMaterialText}</pre>
                  </div>
                  <div style={{ borderRadius: "20px", border: "1px solid #ebe3f3", background: "rgba(255,255,255,0.94)", padding: "14px 16px", fontSize: "13px", lineHeight: 1.85, color: "#526072" }}>
                    PredictionPage と同じ KDreams 基準の素材をそのまま確認できます。独自集計の旧分析タブはここから外しています。
                  </div>
                </div>
              )}
            </section>

            <section style={{ borderRadius: "28px", border: "1px solid #ebe3f3", background: "linear-gradient(180deg, #ffffff 0%, #fbf8fe 100%)", padding: "18px", boxShadow: "0 10px 22px rgba(15, 23, 42, 0.04)", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "14px", flexWrap: "wrap", marginBottom: "16px" }}>
                <div style={{ display: "grid", gap: "6px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 900, letterSpacing: "0.18em", color: "#8c63c7" }}>ODDS PREVIEW</div>
                  <div style={{ fontSize: "22px", fontWeight: 900, color: "#081224", lineHeight: 1.2 }}>買う前に見たい3連単オッズ一覧</div>
                  <div style={{ fontSize: "13px", lineHeight: 1.8, color: "#64748b", maxWidth: "720px" }}>{trifectaOddsRows.length ? oddsSummaryLabel : getPredictionOddsUnavailableLabel(selectedRace?.oddsNote)}</div>
                </div>
                <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", borderRadius: "9999px", padding: "8px 12px", background: chaosTone.bg, border: `1px solid ${chaosTone.border}` }}>
                  <span style={{ width: "7px", height: "7px", borderRadius: "9999px", background: chaosTone.text, display: "inline-block" }} />
                  <span style={{ fontSize: "11px", fontWeight: 900, color: chaosTone.text }}>{oddsSectionBadge}</span>
                </div>
              </div>

              {trifectaOddsRows.length === 0 ? (
                <div style={{ borderRadius: isMobile ? "18px" : "22px", border: "1px dashed #ddd1f3", background: "linear-gradient(180deg, #fffefe 0%, #faf8fd 100%)", padding: "18px", fontSize: "13px", lineHeight: 1.9, color: "#64748b" }}>
                  3連単オッズ未取得
                </div>
              ) : (
                <div style={{ borderRadius: isMobile ? "18px" : "22px", border: "1px solid #ddd5ee", background: "rgba(255,255,255,0.96)", overflow: "hidden", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", padding: "12px 14px", borderBottom: "1px solid #ece5f6", background: "linear-gradient(180deg, #fbf8fe 0%, #f6f1fb 100%)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.14em", color: "#7a67b8" }}>並び順</span>
                        {[
                          { key: "popularity", label: "人気順" },
                          { key: "odds", label: "オッズ順" },
                        ].map((option) => {
                          const isActive = oddsSortMode === option.key;
                          return (
                            <button
                              key={option.key}
                              type="button"
                              onClick={() => setOddsSortMode(option.key as "popularity" | "odds")}
style={{
  borderRadius: "9999px",
  border: `1px solid ${isActive ? "#cfc0eb" : "#dfd6ef"}`,
  background: isActive ? "#efe7fb" : "rgba(255,255,255,0.9)",
  color: isActive ? "#6b54a4" : "#66758a",
  fontSize: isMobile ? "11px" : "12px",
  fontWeight: 800,
  padding: isMobile ? "6px 10px" : "6px 11px",
  lineHeight: 1,
  cursor: "pointer",
  whiteSpace: "nowrap",
}}
                            >
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.14em", color: "#7a67b8" }}>表示件数</span>
                        {[
                          { key: 50, label: "50件" },
                          { key: 100, label: "100件" },
                          { key: "all", label: "全件" },
                        ].map((option) => {
                          const isActive = oddsDisplayLimit === option.key;
                          return (
                            <button
                              key={String(option.key)}
                              type="button"
                              onClick={() => setOddsDisplayLimit(option.key as 50 | 100 | "all")}
style={{
  borderRadius: "9999px",
  border: `1px solid ${isActive ? "#cfc0eb" : "#dfd6ef"}`,
  background: isActive ? "#efe7fb" : "rgba(255,255,255,0.9)",
  color: isActive ? "#6b54a4" : "#66758a",
  fontSize: isMobile ? "11px" : "12px",
  fontWeight: 800,
  padding: isMobile ? "6px 10px" : "6px 11px",
  lineHeight: 1,
  cursor: "pointer",
  whiteSpace: "nowrap",
}}
                            >
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  <div
  style={{
    display: "flex",
    alignItems: "center",
    gap: isMobile ? "6px" : "8px",
    flexWrap: "wrap",
    justifyContent: isMobile ? "flex-start" : "flex-end",
  }}
>
<span
  style={{
    fontSize: isMobile ? "10.5px" : "11px",
    fontWeight: 800,
    color: "#6b7280",
  }}
>
  {`${oddsDataSourceLabel}: ${oddsFetchedCount}件`}
</span>
<span style={{ width: "4px", height: "4px", borderRadius: "9999px", background: "#c8bbdf", display: "inline-block" }} />
<span
  style={{
    fontSize: isMobile ? "10.5px" : "11px",
    fontWeight: 800,
    color: "#6b7280",
  }}
>
  {`表示: ${oddsVisibleCount}件`}
</span>
</div>
</div>

<div
  style={{
    maxHeight: isMobile ? "420px" : "480px",
    overflow: "auto",
    background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(252,249,255,0.98) 100%)",
    WebkitOverflowScrolling: "touch",
  }}
>
<table
  style={{
    width: "100%",
    borderCollapse: "separate",
    borderSpacing: 0,
    minWidth: isMobile ? "560px" : "620px",
    tableLayout: "fixed",
  }}
>
                      <thead>
                        <tr style={{ background: "#f7f2fc" }}>
                          {[
                            { label: "人気", align: "center" as const },
                            { label: "組み合わせ", align: "left" as const },
                            { label: "オッズ", align: "left" as const },
                            { label: "帯", align: "center" as const },
                          ].map((column) => (
                            <th
                              key={column.label}
style={{
  position: "sticky",
  top: 0,
  zIndex: 2,
  padding: isMobile ? "9px 9px" : "10px 12px",
  fontSize: isMobile ? "9.5px" : "10px",
  fontWeight: 900,
  letterSpacing: "0.16em",
  color: "#7a67b8",
  textAlign: column.align,
  borderBottom: "1px solid #e6ddf4",
  background: "#f7f2fc",
  whiteSpace: "nowrap",
}}
                            >
                              {column.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {displayedTrifectaOddsRows.map((item, index) => (
                          <tr key={`trifecta-odds-${item.combo}-${index}`} style={{ background: index % 2 === 0 ? "rgba(255,255,255,0.98)" : "#fcfaff" }}>
<td
  style={{
    width: isMobile ? "70px" : "86px",
    padding: isMobile ? "7px 9px" : "8px 12px",
    borderBottom: "1px solid #f0e8f8",
    textAlign: "center",
    verticalAlign: "middle",
  }}
>
<span
  style={{
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: isMobile ? "30px" : "34px",
    height: isMobile ? "24px" : "26px",
    borderRadius: "9999px",
    background: "#f3ecfb",
    color: "#6f5aa9",
    fontSize: isMobile ? "11px" : "12px",
    fontWeight: 900,
    border: "1px solid #e2d8f4",
  }}
>
{item.popularityRank}
</span>
</td>
<td
  style={{
    width: "44%",
    padding: isMobile ? "7px 9px" : "8px 12px",
    borderBottom: "1px solid #f0e8f8",
    verticalAlign: "middle",
  }}
>
<div
  style={{
    fontSize: isMobile ? "15px" : "17px",
    fontWeight: 900,
    color: "#12213c",
    lineHeight: 1.12,
    letterSpacing: "0.01em",
  }}
>
  {item.comboDisplay}
</div>
{item.points >= 2 ? (
<div
  style={{
    marginTop: "3px",
    fontSize: isMobile ? "9.5px" : "10px",
    fontWeight: 800,
    color: "#7b8a9d",
    letterSpacing: "0.08em",
  }}
>
  {`${item.points}点まとめ表示`}
</div>
) : null}
</td>
<td
  style={{
    width: "28%",
    padding: isMobile ? "7px 9px" : "8px 12px",
    borderBottom: "1px solid #f0e8f8",
    verticalAlign: "middle",
  }}
>
<div style={{ display: "grid", gap: "3px" }}>
<div
  style={{
    fontSize: isMobile ? "18px" : "21px",
    fontWeight: 900,
    color: "#5b4698",
    lineHeight: 1.04,
    fontVariantNumeric: "tabular-nums",
  }}
>
  {formatOddsValue(item.floorOdds)}
</div>
{item.ceilingOdds !== null && item.ceilingOdds !== item.floorOdds ? (
<div
  style={{
    fontSize: isMobile ? "10px" : "11px",
    fontWeight: 800,
    color: "#8b78bc",
    lineHeight: 1.25,
    fontVariantNumeric: "tabular-nums",
  }}
>
  {`最高 ${formatOddsValue(item.ceilingOdds)}`}
</div>
) : null}
</div>
</td>
<td
  style={{
    width: isMobile ? "86px" : "100px",
    padding: isMobile ? "7px 9px" : "8px 12px",
    borderBottom: "1px solid #f0e8f8",
    textAlign: "center",
    verticalAlign: "middle",
  }}
>
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: "9999px",
      padding: isMobile ? "4px 8px" : "4px 9px",
      fontSize: isMobile ? "9.5px" : "10px",
      fontWeight: 900,
      color: item.band.tone.text,
      background: item.band.tone.bg,
      border: `1px solid ${item.band.tone.border}`,
      whiteSpace: "nowrap",
    }}
  >
    {item.band.label}
  </span>
</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
<div
  style={{
    display: "flex",
    alignItems: isMobile ? "flex-start" : "center",
    justifyContent: isMobile ? "flex-start" : "space-between",
    gap: isMobile ? "6px 10px" : "12px",
    flexWrap: "wrap",
    padding: isMobile ? "9px 12px" : "10px 14px",
    borderTop: "1px solid #ece5f6",
    background: "#fbf9fe",
  }}
>
  <span
    style={{
      fontSize: isMobile ? "10.5px" : "11px",
      fontWeight: 800,
      color: "#66758a",
      lineHeight: 1.5,
      whiteSpace: "nowrap",
    }}
  >
    {`${oddsDataSourceLabel}: ${oddsFetchedCount}件`}
  </span>
  <span
    style={{
      fontSize: isMobile ? "10.5px" : "11px",
      fontWeight: 800,
      color: "#66758a",
      lineHeight: 1.5,
      whiteSpace: "nowrap",
    }}
  >
    {oddsDisplayLimit === "all" ? `全件表示中: ${oddsVisibleCount}件` : `${oddsVisibleCount}件を表示中`}
  </span>
  </div>
  </div>
   )}
  </section>

  </section>

  </article>

<aside
  style={{
    display: "grid",
    gap: isMobile ? "14px" : "18px",
  }}
>
<article
  style={{
    borderRadius: isMobile ? "24px" : "32px",
    border: "1px solid #ebe3f3",
    background: "linear-gradient(180deg, #fffefe 0%, #f8f0ff 56%, #f3f9ff 100%)",
    boxShadow: "0 18px 40px rgba(15, 23, 42, 0.06)",
    padding: isMobile ? "18px 16px" : "24px 22px",
  }}
>
<div style={{ fontSize: "11px", fontWeight: 900, letterSpacing: "0.18em", color: "#8c63c7", marginBottom: "14px" }}>INFORMATION SIDE</div>
<div
  style={{
    display: "grid",
    gap: isMobile ? "10px" : "12px",
  }}
>
              {sideInsightCards.map((item) => (
                item.kind === "weather" ? (
<div
  key={item.label}
  style={{
    borderRadius: isMobile ? "20px" : "24px",
    border: item.tone.border,
    background: item.tone.background,
    padding: isMobile ? "14px 13px" : "16px 16px 15px",
    boxShadow: "0 10px 22px rgba(15, 23, 42, 0.04)",
    display: "grid",
    gap: isMobile ? "11px" : "14px",
  }}
>
<div
  style={{
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: isMobile ? "9px" : "12px",
  }}
>
<div
  style={{
    display: "grid",
    gridTemplateColumns: isMobile ? "38px 1fr" : "42px 1fr",
    gap: isMobile ? "9px" : "12px",
    alignItems: "center",
    minWidth: 0,
  }}
>
<div
  style={{
    width: isMobile ? "38px" : "42px",
    height: isMobile ? "38px" : "42px",
    borderRadius: isMobile ? "12px" : "14px",
    background: item.tone.accentSoft,
    border: `1px solid ${item.tone.accentSoft}`,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: isMobile ? "20px" : "22px",
  }}
>
                          {item.icon}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: "9.5px", fontWeight: 900, letterSpacing: "0.18em", color: item.tone.label, marginBottom: "5px" }}>{item.eyebrow}</div>
                          <div style={{ fontSize: "20px", fontWeight: 900, color: "#0f172a", lineHeight: 1.18, letterSpacing: "-0.02em" }}>{item.value}</div>
                        </div>
                      </div>
                      <div style={{ flexShrink: 0, display: "grid", justifyItems: "end", gap: "4px" }}>
                        <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.14em", color: item.tone.label }}>{item.label}</div>
                        <div style={{ fontSize: "10.5px", color: "#7b8a9d", fontWeight: 700 }}>{item.updatedAt}</div>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px" }}>
                      {item.metrics.map((metric) => (
                        <div key={`${item.label}-${metric.label}`} style={{ borderRadius: "16px", border: "1px solid rgba(226,220,241,0.88)", background: "rgba(255,255,255,0.74)", padding: "10px 11px 9px", display: "grid", gap: "4px" }}>
                          <div style={{ fontSize: "9px", fontWeight: 900, letterSpacing: "0.14em", color: "#8b96a9" }}>{metric.label}</div>
                          <div style={{ fontSize: "12px", fontWeight: 800, color: "#31445d", lineHeight: 1.35 }}>{metric.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
<div
  key={item.label}
  style={{
    borderRadius: isMobile ? "18px" : "22px",
    border: item.tone.border,
    background: item.tone.background,
    padding: isMobile ? "14px 13px" : "16px 16px 15px",
    boxShadow: "0 10px 22px rgba(15, 23, 42, 0.035)",
    display: "grid",
    gap: isMobile ? "8px" : "10px",
  }}
>
<div
  style={{
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: isMobile ? "8px" : "10px",
  }}
>
<div
  style={{
    display: "inline-flex",
    alignItems: "center",
    gap: isMobile ? "7px" : "8px",
    minWidth: 0,
  }}
>
<span
  style={{
    width: isMobile ? "8px" : "9px",
    height: isMobile ? "8px" : "9px",
    borderRadius: "9999px",
    background: item.tone.accent,
    boxShadow: `0 0 0 ${isMobile ? "4px" : "6px"} ${item.tone.accentSoft}`,
    flexShrink: 0,
  }}
/>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: "9.5px", fontWeight: 900, letterSpacing: "0.18em", color: item.tone.label, marginBottom: "3px" }}>{item.eyebrow}</div>
                          <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.14em", color: "#7b8a9d" }}>{item.label}</div>
                        </div>
                      </div>
<span
  style={{
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "9999px",
    padding: isMobile ? "4px 7px" : "4px 8px",
    fontSize: isMobile ? "9.5px" : "10px",
    fontWeight: 800,
    background: "rgba(255,255,255,0.82)",
    color: item.tone.accent,
    border: `1px solid ${item.tone.accentSoft}`,
    whiteSpace: "nowrap",
    flexShrink: 0,
  }}
>
  {item.badge}
</span>
                    </div>
<div
  style={{
    fontSize: isMobile ? "14.5px" : "16px",
    fontWeight: 900,
    color: item.muted ? "#6d798d" : "#081224",
    lineHeight: isMobile ? 1.62 : 1.72,
    letterSpacing: item.muted ? "0.01em" : "-0.01em",
    wordBreak: "break-word",
  }}
>
  {item.value}
</div>
<div
  style={{
    fontSize: isMobile ? "11px" : "11.5px",
    color: item.muted ? "#8b95a7" : "#64748b",
    lineHeight: isMobile ? 1.65 : 1.8,
  }}
>
  {item.note}
</div>
</div>
)
))}
</div>
</article>

<article
  style={{
    borderRadius: isMobile ? "24px" : "32px",
    border: "1px solid #ebe3f3",
    background: "linear-gradient(180deg, #fffefe 0%, #fbf8fe 100%)",
    boxShadow: "0 18px 40px rgba(15, 23, 42, 0.05)",
    padding: isMobile ? "18px 16px" : "22px",
  }}
>
<div
  style={{
    display: "flex",
    alignItems: isMobile ? "flex-start" : "center",
    justifyContent: "space-between",
    gap: isMobile ? "8px" : "10px",
    marginBottom: isMobile ? "10px" : "12px",
    flexWrap: "wrap",
  }}
>
<div
  style={{
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: isMobile ? "7px" : "10px",
    flexWrap: "wrap",
    minWidth: 0,
  }}
>
              <div style={{ fontSize: "11px", fontWeight: 900, letterSpacing: "0.18em", color: "#8c63c7" }}>BANK / PACE</div>
              <span
  style={{
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "9999px",
    padding: isMobile ? "5px 8px" : "5px 9px",
    fontSize: isMobile ? "9.5px" : "10px",
    fontWeight: 800,
    background: "#fffafc",
    color: "#8a3557",
    border: "1px solid #f3d7e2",
    whiteSpace: "nowrap",
    maxWidth: isMobile ? "100%" : undefined,
    overflow: "hidden",
    textOverflow: "ellipsis",
  }}
>
  {selectedVenueGuideSummary.statusLabel}
</span>
</div>
<span
  style={{
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "9999px",
    padding: isMobile ? "5px 8px" : "5px 9px",
    fontSize: isMobile ? "9.5px" : "10px",
    fontWeight: 900,
    background: chaosTone.bg,
    color: chaosTone.text,
    border: `1px solid ${chaosTone.border}`,
    whiteSpace: "nowrap",
    flexShrink: 0,
  }}
>
  {selectedVenueGuideSummary.volatility.label}
</span>
</div>
<div
  style={{
    display: "grid",
    gap: isMobile ? "8px" : "10px",
    marginBottom: isMobile ? "10px" : "12px",
  }}
>
<div
  style={{
    borderRadius: isMobile ? "18px" : "20px",
    border: "1px solid #e8def4",
    background: "rgba(255,255,255,0.94)",
    padding: isMobile ? "12px 12px 11px" : "14px 14px 13px",
  }}
>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", marginBottom: "8px" }}>
                  <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.14em", color: "#7b8a9d" }}>会場タイプ</div>
                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "9999px", padding: "5px 9px", fontSize: "10px", fontWeight: 900, background: "#f5efff", color: "#6f5aa9", border: "1px solid #ddd1f3" }}>{selectedVenueGuideSummary.venueType}</span>
                </div>
                <div style={{ fontSize: "13px", lineHeight: 1.85, color: "#425266" }}>{selectedVenueGuideSummary.venueMemo}</div>
              </div>
{bankGuideItems.map((item) => (
  <div
    key={item.label}
    style={{
      borderRadius: isMobile ? "16px" : "18px",
      border: "1px solid #e8def4",
      background: "rgba(255,255,255,0.92)",
      padding: isMobile ? "11px 12px" : "13px 14px",
    }}
  >
    <div
      style={{
        fontSize: isMobile ? "9.5px" : "10px",
        fontWeight: 900,
        letterSpacing: "0.14em",
        color: "#7b8a9d",
        marginBottom: isMobile ? "5px" : "6px",
      }}
    >
      {item.label}
    </div>
    <div
      style={{
        fontSize: isMobile ? "12.5px" : "13px",
        lineHeight: isMobile ? 1.7 : 1.85,
        color: "#425266",
        wordBreak: "break-word",
      }}
    >
      {item.value}
    </div>
  </div>
))}
</div>
</article>

<article
  style={{
    borderRadius: isMobile ? "24px" : "32px",
    border: "1px solid #ebe3f3",
    background: "linear-gradient(180deg, #fffefe 0%, #fbf8fe 100%)",
    boxShadow: "0 18px 40px rgba(15, 23, 42, 0.05)",
    padding: isMobile ? "18px 16px" : "22px",
  }}
>
<div
  style={{
    fontSize: isMobile ? "10.5px" : "11px",
    fontWeight: 900,
    letterSpacing: "0.18em",
    color: "#8c63c7",
    marginBottom: isMobile ? "8px" : "10px",
  }}
>
  GPT用素材テンプレ
</div>
<div
  style={{
    fontSize: isMobile ? "11.5px" : "12px",
    fontWeight: 900,
    color: parsedRaceLineup ? "#5b4b89" : "#b45309",
    marginBottom: isMobile ? "8px" : "10px",
    lineHeight: 1.6,
  }}
>
  {raceLineupFixedCaption}
</div>
<div
  style={{
    borderRadius: isMobile ? "18px" : "22px",
    border: "1px solid #e8def4",
    background: "rgba(255,255,255,0.9)",
    padding: isMobile ? "13px 12px" : "16px",
    fontSize: isMobile ? "12px" : "13px",
    lineHeight: isMobile ? 1.75 : 1.9,
    color: "#425266",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
  }}
>
  {gptTemplate}
</div>
</article>
</aside>
</section>
      </section>
      </div>
    </div>
  );
}
