import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { raceScheduleData } from "../data/raceScheduleData";
import type { RaceScheduleItem } from "../types/raceSchedule";
import {
  TODAY,
  EMPTY_FAVORITE_RIDER_FEED,
  FAVORITE_RIDER_FEED_POLL_INTERVAL_MS,
  PREDICTION_RESULT_STORAGE_KEY,
  PREDICTION_SLOT_STORAGE_KEY,
  PREDICTION_TODAY_DATA_URL,
  fetchFavoriteRiderFeedFile,
  findPredictionSlotRecord,
  getFavoriteRiderRaceLabel,
  getGradeBadgeTone,
  getPredictionResultAggregate,
  getSessionLabel,
  loadCachedFavoriteRiderFeed,
  loadStoredPredictionResults,
  loadStoredPredictionSlots,
  compareRaces,
  isRaceOnDate,
  mergeTodayRaceCardItems,
  normalizePredictionVenueName,
  todayRaces,
  toPublicPath,
  type DashboardTodayRaceCard,
  type FavoriteRiderFeedItem,
  type PredictionRaceItem,
  type PredictionResultMap,
  type PredictionSlotMap,
  type PredictionTodayFeed,
  type PredictionVenueItem,
} from "./PageImplementations";

type PublicPredictionSlotsFile = {
  version?: number;
  updatedAt?: string;
  source?: string;
  records?: PredictionSlotMap;
  recordList?: unknown[];
};

const PUBLIC_PREDICTION_SLOTS_URL = toPublicPath("/data/predictions/saved-predictions.generated.json");

const mobilePageShellStyle: CSSProperties = {
  width: "100%",
  maxWidth: "100vw",
  minHeight: "100vh",
  boxSizing: "border-box",
  overflowX: "hidden",
  background:
    "radial-gradient(circle at 12% 0%, rgba(140, 99, 199, 0.18) 0%, rgba(140, 99, 199, 0) 28%), radial-gradient(circle at 92% 8%, rgba(56, 189, 248, 0.16) 0%, rgba(56, 189, 248, 0) 26%), linear-gradient(180deg, #fffefe 0%, #f7f2ff 36%, #f7fbff 68%, #ffffff 100%)",
  padding: "18px 14px 118px",
};

const mobileContentStyle: CSSProperties = {
  width: "100%",
  maxWidth: "520px",
  margin: "0 auto",
  display: "grid",
  gap: "16px",
  boxSizing: "border-box",
};

const mobileCardStyle: CSSProperties = {
  borderRadius: "30px",
  background: "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(250,247,255,0.94) 100%)",
  border: "1px solid rgba(224, 214, 244, 0.95)",
  boxShadow: "0 18px 42px rgba(39, 33, 72, 0.08)",
  padding: "18px",
  boxSizing: "border-box",
  minWidth: 0,
  backdropFilter: "blur(10px)",
};

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "18px",
  lineHeight: 1.35,
  fontWeight: 900,
  letterSpacing: "-0.02em",
  color: "#081224",
};

const eyebrowStyle: CSSProperties = {
  margin: 0,
  fontSize: "10px",
  fontWeight: 900,
  letterSpacing: "0.22em",
  color: "#8c63c7",
};

const mutedTextStyle: CSSProperties = {
  margin: 0,
  color: "#526072",
  fontSize: "13px",
  lineHeight: 1.8,
  fontWeight: 650,
};

const mobileGlassPanelStyle: CSSProperties = {
  borderRadius: "24px",
  background: "linear-gradient(135deg, rgba(255,255,255,0.92) 0%, rgba(248,243,255,0.96) 100%)",
  border: "1px solid rgba(222, 211, 244, 0.95)",
  boxShadow: "0 14px 30px rgba(122, 103, 184, 0.08)",
  boxSizing: "border-box",
  minWidth: 0,
};

const loadPublicPredictionSlots = async (): Promise<PredictionSlotMap> => {
  try {
    const response = await fetch(`${PUBLIC_PREDICTION_SLOTS_URL}?t=${Date.now()}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return {};
    }

    const payload = (await response.json()) as PublicPredictionSlotsFile;

    if (!payload.records || typeof payload.records !== "object") {
      return {};
    }

    return payload.records;
  } catch {
    return {};
  }
};

const mergePredictionSlotMaps = (
  publicSlots: PredictionSlotMap,
  localSlots: PredictionSlotMap
): PredictionSlotMap => {
  return {
    ...publicSlots,
    ...localSlots,
  };
};

const formatYen = (value?: number) => {
  if (value === undefined) return "—";
  if (value === 0) return "0円";
  return `${value > 0 ? "+" : "-"}${Math.abs(value).toLocaleString("ja-JP")}円`;
};

const formatPercent = (value?: number) => {
  if (value === undefined) return "—";
  return `${value.toFixed(1)}%`;
};

const getVenueRaceCountLabel = (venue?: PredictionVenueItem) => {
  if (!venue) return "レース数確認中";
  return `${venue.races.length}R`;
};

const getVenueResultLabel = (venue?: PredictionVenueItem) => {
  if (!venue) return "結果取得待ち";
  const confirmedCount = venue.races.filter((race) => race.resultStatus === "confirmed" || race.result?.status === "confirmed").length;
  if (confirmedCount === 0) return "結果待ち";
  if (confirmedCount >= venue.races.length) return "全結果あり";
  return `${confirmedCount}R結果あり`;
};

const getFirstRaceTimeLabel = (venue?: PredictionVenueItem) => {
  const firstRaceTime = venue?.races?.[0]?.time;
  if (!firstRaceTime) return "時刻確認中";
  return `${firstRaceTime}開始`;
};

const clipMobilePredictionText = (value?: string | null) => {
  const lines = String(value ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return "";

  const pickedLines = lines.slice(0, 8);
  const text = pickedLines.join("\n");

  if (text.length <= 260) return text;
  return `${text.slice(0, 260).replace(/[、。・,\s]+$/g, "")}…`;
};

const getMobileRaceResultLabel = (race: PredictionRaceItem) => {
  if (race.resultStatus === "confirmed" || race.result?.status === "confirmed") return "結果あり";
  return "結果待ち";
};

const getMobileRaceResultTone = (race: PredictionRaceItem) => {
  if (race.resultStatus === "confirmed" || race.result?.status === "confirmed") {
    return {
      background: "#f0fbf9",
      color: "#0f766e",
      border: "#cdece6",
    };
  }

  return {
    background: "#faf8fd",
    color: "#64748b",
    border: "#ede7f5",
  };
};

type MobileCalendarCell = {
  key: string;
  label: string;
  iso: string | null;
  isCurrentMonth: boolean;
  isToday: boolean;
  events: RaceScheduleItem[];
};

const mobileCalendarWeekLabels = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

const buildMobileMonthCalendar = (baseIso: string, schedules: RaceScheduleItem[] = []) => {
  const baseDate = new Date(`${baseIso}T00:00:00`);
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  const startOffset = firstDay.getDay();
  const totalDays = lastDay.getDate();

  const cells: MobileCalendarCell[] = [];

  for (let i = 0; i < startOffset; i += 1) {
    const date = new Date(year, month, 1 - (startOffset - i));
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
      date.getDate()
    ).padStart(2, "0")}`;

    cells.push({
      key: `prev-${iso}`,
      label: String(date.getDate()),
      iso,
      isCurrentMonth: false,
      isToday: iso === baseIso,
      events: schedules.filter((race) => isRaceOnDate(race, iso)).sort(compareRaces),
    });
  }

  for (let day = 1; day <= totalDays; day += 1) {
    const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    cells.push({
      key: `current-${iso}`,
      label: String(day),
      iso,
      isCurrentMonth: true,
      isToday: iso === baseIso,
      events: schedules.filter((race) => isRaceOnDate(race, iso)).sort(compareRaces),
    });
  }

  while (cells.length % 7 !== 0) {
    const nextIndex = cells.length - (startOffset + totalDays) + 1;
    const date = new Date(year, month + 1, nextIndex);
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
      date.getDate()
    ).padStart(2, "0")}`;

    cells.push({
      key: `next-${iso}`,
      label: String(date.getDate()),
      iso,
      isCurrentMonth: false,
      isToday: iso === baseIso,
      events: schedules.filter((race) => isRaceOnDate(race, iso)).sort(compareRaces),
    });
  }

  const weeks: MobileCalendarCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  return {
    monthLabel: `${year}.${String(month + 1).padStart(2, "0")}`,
    weeks,
  };
};


const mobileFavoriteRiderNames = ["眞杉匠", "恩田淳平", "片岡迪之"];

const formatMobileCalendarDateLabel = (iso: string) => {
  const date = new Date(`${iso}T00:00:00`);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const week = ["日", "月", "火", "水", "木", "金", "土"][date.getDay()];
  return `${month}/${day}(${week})`;
};

type MobileCalendarFavoriteEntry = {
  key: string;
  venue: string;
  raceNo?: number;
  time?: string;
  riderName: string;
  carNo?: string;
  raceLabel?: string;
  status?: string;
  source: "today-feed" | "favorite-feed";
};

type MobileRaceDetailTab = "entry" | "prediction" | "result" | "info";

const mobileRaceDetailTabs: Array<{ key: MobileRaceDetailTab; label: string; icon: string }> = [
  { key: "entry", label: "出走表", icon: "🚴" },
  { key: "prediction", label: "予想", icon: "✍️" },
  { key: "result", label: "結果", icon: "🏆" },
  { key: "info", label: "情報", icon: "📌" },
];

const getMobileSavedResultTone = (hitStatus?: string, hasSavedPrediction = false) => {
  if (hitStatus === "hit") {
    return {
      label: "的中",
      background: "#f4effc",
      color: "#705eb0",
      border: "#ded3f4",
    };
  }

  if (hitStatus === "miss") {
    return {
      label: "不的中",
      background: "#fff7ed",
      color: "#b45309",
      border: "#fed7aa",
    };
  }

  if (hitStatus === "pending") {
    return {
      label: "保留",
      background: "#f8fafc",
      color: "#475569",
      border: "#e2e8f0",
    };
  }

  if (hasSavedPrediction) {
    return {
      label: "予想保存",
      background: "#f2ecfb",
      color: "#7a67b8",
      border: "#e0d6f4",
    };
  }

  return {
    label: "保存なし",
    background: "#ffffff",
    color: "#94a3b8",
    border: "#edf1f7",
  };
};

const getMobileCarColorStyle = (carNo?: string) => {
  switch (String(carNo ?? "")) {
    case "1":
      return { background: "#ffffff", color: "#081224", border: "#cbd5e1" };
    case "2":
      return { background: "#111827", color: "#ffffff", border: "#111827" };
    case "3":
      return { background: "#dc2626", color: "#ffffff", border: "#dc2626" };
    case "4":
      return { background: "#2563eb", color: "#ffffff", border: "#2563eb" };
    case "5":
      return { background: "#facc15", color: "#422006", border: "#eab308" };
    case "6":
      return { background: "#16a34a", color: "#ffffff", border: "#16a34a" };
    case "7":
      return { background: "#f97316", color: "#ffffff", border: "#f97316" };
    case "8":
      return { background: "#ec4899", color: "#ffffff", border: "#ec4899" };
    case "9":
      return { background: "#7c3aed", color: "#ffffff", border: "#7c3aed" };
    default:
      return { background: "#081224", color: "#ffffff", border: "#081224" };
  }
};

const findTodayFavoriteEntriesFromPredictionFeed = (
  feed: PredictionTodayFeed | null,
): MobileCalendarFavoriteEntry[] => {
  return (feed?.venues ?? []).flatMap((venue) =>
    venue.races.flatMap((race) =>
      (race.riders ?? [])
        .filter((rider) =>
          mobileFavoriteRiderNames.some((favoriteName) => rider.name?.includes(favoriteName))
        )
        .map((rider) => ({
          key: `today-feed-${venue.venue}-${race.raceNo}-${rider.carNo}-${rider.name}`,
          venue: venue.venue,
          raceNo: race.raceNo,
          time: race.time,
          riderName: rider.name,
          carNo: rider.carNo,
          raceLabel: `${race.raceNo}R`,
          source: "today-feed" as const,
        }))
    )
  );
};

const findFavoriteEntriesFromFeedForDate = (
  favoriteRiderFeed: FavoriteRiderFeedItem[],
  isoDate: string,
): MobileCalendarFavoriteEntry[] => {
  return favoriteRiderFeed
    .filter((entry) => entry.startDate <= isoDate && entry.endDate >= isoDate)
    .map((entry) => ({
      key: `favorite-feed-${isoDate}-${entry.rider}-${entry.venue}-${entry.raceNumber ?? "pending"}`,
      venue: entry.venue,
      raceNo: entry.raceNumber,
      riderName: entry.rider,
      raceLabel: getFavoriteRiderRaceLabel(entry),
      status: entry.status,
      source: "favorite-feed" as const,
    }));
};

type MobileSelectedCalendarVenue = DashboardTodayRaceCard | RaceScheduleItem;

const getMobileSelectedVenueKey = (venue: MobileSelectedCalendarVenue) => {
  if ("id" in venue && venue.id) return String(venue.id);
  return `${venue.venue}-${venue.startDate}-${venue.endDate}-${venue.grade}`;
};

const getMobileSelectedVenueGradeLabel = (venue: MobileSelectedCalendarVenue) => {
  if ("displayGradeLabel" in venue && venue.displayGradeLabel) {
    return venue.displayGradeLabel;
  }

  return venue.grade ?? "開催";
};

const getMobileSelectedVenueTitle = (venue: MobileSelectedCalendarVenue) => {
  if ("title" in venue && venue.title) return venue.title;
  return `${venue.venue} 開催`;
};

const getMobileSelectedVenuePeriodLabel = (venue: MobileSelectedCalendarVenue) => {
  if (!venue.startDate || !venue.endDate) return "日程確認中";
  if (venue.startDate === venue.endDate) return "単日開催";

  const start = venue.startDate.slice(5).replace("-", "/");
  const end = venue.endDate.slice(5).replace("-", "/");
  return `${start}〜${end}`;
};

const mobileFloatingNavItems = [
  { targetId: "mobile-calendar", label: "Calendar", icon: "📅" },
  { targetId: "mobile-results", label: "Summary", icon: "📊" },
  { targetId: "mobile-hit-log", label: "Hit", icon: "🎯" },
  { targetId: "mobile-today-races", label: "Venues", icon: "🚴" },
];

function MobileFloatingNav({
  activeTargetId,
  onNavigate,
}: {
  activeTargetId: string;
  onNavigate: (targetId: string) => void;
}) {
  return (
    <nav
      aria-label="Mobile page navigation"
      style={{
        position: "fixed",
        left: "50%",
        bottom: "14px",
        transform: "translateX(-50%)",
        width: "min(92vw, 470px)",
        borderRadius: "9999px",
        padding: "8px",
        background: "linear-gradient(135deg, rgba(255,255,255,0.92) 0%, rgba(248,243,255,0.9) 100%)",
        border: "1px solid rgba(216, 201, 244, 0.92)",
        boxShadow: "0 18px 42px rgba(39, 33, 72, 0.18)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        zIndex: 50,
        display: "grid",
        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
        gap: "6px",
        boxSizing: "border-box",
      }}
    >
      {mobileFloatingNavItems.map((item) => {
        const isPrimary = activeTargetId === item.targetId;

        return (
          <button
            key={item.targetId}
            type="button"
            onClick={() => onNavigate(item.targetId)}
            style={{
              minHeight: "48px",
              borderRadius: "9999px",
              display: "grid",
              placeItems: "center",
              gap: "2px",
              textDecoration: "none",
              background: isPrimary
                ? "linear-gradient(135deg, #081224 0%, #24365f 100%)"
                : "rgba(255,255,255,0.7)",
              color: isPrimary ? "#ffffff" : "#59468c",
              border: isPrimary ? "1px solid rgba(255,255,255,0.48)" : "1px solid rgba(231,221,245,0.95)",
              boxShadow: isPrimary ? "0 10px 22px rgba(8, 18, 36, 0.2)" : "0 8px 16px rgba(39, 33, 72, 0.06)",
              fontSize: "10px",
              fontWeight: 950,
              letterSpacing: "0.01em",
              boxSizing: "border-box",
              cursor: "pointer",
              fontFamily: "inherit",
              appearance: "none",
              WebkitAppearance: "none",
              transition: "background 0.18s ease, color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease",
              transform: isPrimary ? "translateY(-1px)" : "translateY(0)",
            }}
          >
            <span style={{ fontSize: "15px", lineHeight: 1 }}>{item.icon}</span>
            <span style={{ lineHeight: 1 }}>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function MobileMetricCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "plus" | "minus" | "hit";
}) {
  const toneStyle =
    tone === "plus"
      ? {
          color: "#5f43a5",
          background: "linear-gradient(135deg, #f6f0ff 0%, #ffffff 100%)",
          border: "#d8c9f4",
          shadow: "0 12px 24px rgba(112, 94, 176, 0.12)",
        }
      : tone === "minus"
        ? {
            color: "#b45309",
            background: "linear-gradient(135deg, #fff7ed 0%, #ffffff 100%)",
            border: "#fed7aa",
            shadow: "0 12px 24px rgba(180, 83, 9, 0.1)",
          }
        : tone === "hit"
          ? {
              color: "#047857",
              background: "linear-gradient(135deg, #ecfdf5 0%, #ffffff 100%)",
              border: "#bfeadd",
              shadow: "0 12px 24px rgba(15, 118, 110, 0.1)",
            }
          : {
              color: "#081224",
              background: "linear-gradient(135deg, #ffffff 0%, #f8f5ff 100%)",
              border: "#e7ddf5",
              shadow: "0 10px 20px rgba(39, 33, 72, 0.06)",
            };

  return (
    <div
      style={{
        borderRadius: "22px",
        padding: "14px 13px",
        background: toneStyle.background,
        border: `1px solid ${toneStyle.border}`,
        boxSizing: "border-box",
        minWidth: 0,
        boxShadow: toneStyle.shadow,
      }}
    >
      <div
        style={{
          marginBottom: "7px",
          fontSize: "9px",
          fontWeight: 900,
          letterSpacing: "0.14em",
          color: "#64748b",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: "18px",
          lineHeight: 1.08,
          fontWeight: 950,
          color: toneStyle.color,
          letterSpacing: "-0.02em",
          overflowWrap: "anywhere",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function MobileHitTicker({
  hitItems,
}: {
  hitItems: Array<{
    id: string;
    venue: string;
    raceNumber: number;
    hitBetType?: string;
    hitCombination?: string;
    profitLoss?: number;
  }>;
}) {
  const hasHits = hitItems.length > 0;
  const tickerText = hasHits
    ? hitItems
        .map((item) => {
          const betType = item.hitBetType ?? "的中";
          const combo = item.hitCombination ? ` ${item.hitCombination}` : "";
          const profit = item.profitLoss !== undefined ? ` ${formatYen(item.profitLoss)}` : "";
          return `🎯 ${item.venue} ${item.raceNumber}R ${betType}${combo}${profit}`;
        })
        .join("　　")
    : "今日はまだ的中ログがありません。結果が反映されると、ここに的中レースが流れます。";

  return (
    <section
      id="mobile-hit-log"
      style={{
        ...mobileCardStyle,
        overflow: "hidden",
        background:
          "linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(246,240,255,0.96) 48%, rgba(240,253,250,0.92) 100%)",
        border: "1px solid rgba(216, 201, 244, 0.95)",
      }}
    >
      <style>
        {`
          @keyframes kurariMobileHitTicker {
            0% { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }
        `}
      </style>

      <div style={{ display: "grid", gap: "12px" }}>
        <div style={{ display: "grid", gap: "5px" }}>
          <p style={eyebrowStyle}>HIT LOG</p>
          <h2 style={sectionTitleStyle}>的中ログ</h2>
        </div>

        <div
          style={{
            ...mobileGlassPanelStyle,
            overflow: "hidden",
            padding: "13px 0",
            position: "relative",
            background: "linear-gradient(90deg, #081224 0%, #30235a 48%, #0f766e 100%)",
            border: "1px solid rgba(255,255,255,0.72)",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: "42px",
              background: "linear-gradient(90deg, rgba(255,255,255,1) 0%, rgba(255,255,255,0) 100%)",
              zIndex: 2,
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              bottom: 0,
              width: "42px",
              background: "linear-gradient(270deg, rgba(255,255,255,1) 0%, rgba(255,255,255,0) 100%)",
              zIndex: 2,
              pointerEvents: "none",
            }}
          />

          <div
            style={{
              display: "flex",
              width: "max-content",
              animation: hasHits ? "kurariMobileHitTicker 34s linear infinite" : "none",
              whiteSpace: "nowrap",
            }}
          >
            {[tickerText, tickerText].map((text, index) => (
              <div
                key={`hit-log-${index}`}
                style={{
                  padding: "0 24px",
                  fontSize: "13px",
                  lineHeight: 1.7,
                  fontWeight: 900,
                  color: "#ffffff",
                  letterSpacing: "0.01em",
                }}
              >
                {text}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function MobileVenueCard({
  race,
  predictionVenue,
  savedRaceCount,
  profitLoss,
  predictionResultMap,
  predictionSlotMap,
  hasFavoriteVenue,
  isOpen,
  onToggle,
}: {
  race: DashboardTodayRaceCard;
  predictionVenue?: PredictionVenueItem;
  savedRaceCount?: number;
  profitLoss?: number;
  predictionResultMap: PredictionResultMap;
  predictionSlotMap: PredictionSlotMap;
  hasFavoriteVenue: boolean;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const gradeTone = getGradeBadgeTone(race.displayGradeLabel ?? race.grade);
  const venueResultLabel = getVenueResultLabel(predictionVenue);
  const raceCountLabel = getVenueRaceCountLabel(predictionVenue);
  const firstRaceTimeLabel = getFirstRaceTimeLabel(predictionVenue);
  const normalizedVenue = normalizePredictionVenueName(race.venue);
  const mobileVenueCardDomId = `mobile-venue-card-${normalizedVenue}`;
  const venueRaceRows = predictionVenue?.races ?? [];
  const savedResultsForVenue = Object.values(predictionResultMap).filter(
    (item) =>
      item.date === TODAY &&
      normalizePredictionVenueName(item.venue) === normalizedVenue
  );

  const getSavedResultForRace = (raceNumber: number) =>
    savedResultsForVenue.find((item) => item.raceNumber === raceNumber);

  const [selectedRaceNo, setSelectedRaceNo] = useState<number | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<MobileRaceDetailTab>("entry");

  const selectedVenueRace =
    venueRaceRows.find((item) => item.raceNo === selectedRaceNo) ??
    venueRaceRows[0];

  const selectedSavedResult = selectedVenueRace
    ? getSavedResultForRace(selectedVenueRace.raceNo)
    : undefined;

  const selectedSavedSlotLookup = selectedVenueRace
    ? findPredictionSlotRecord(predictionSlotMap, TODAY, predictionVenue, selectedVenueRace)
    : { record: undefined };

  const selectedSavedPredictionText = clipMobilePredictionText(selectedSavedSlotLookup.record?.predictionText);
  const selectedStructuredPrediction = selectedSavedSlotLookup.record?.predictionJson;
  const selectedHasSavedPrediction = Boolean(
  selectedSavedPredictionText || (selectedStructuredPrediction?.tickets.length ?? 0) > 0
  );
  const selectedSavedTone = getMobileSavedResultTone(selectedSavedResult?.hitStatus, selectedHasSavedPrediction);
  const selectedResultTone = selectedVenueRace
    ? getMobileRaceResultTone(selectedVenueRace)
    : { background: "#faf8fd", color: "#64748b", border: "#ede7f5" };

  const selectedResultOrderText =
    selectedVenueRace?.result?.finishOrder?.length
      ? selectedVenueRace.result.finishOrder.join("-")
      : selectedSavedResult?.resultOrder || "";

  const selectedResultTop2Text = selectedResultOrderText
    ? selectedResultOrderText.split("-").slice(0, 2).join("-")
    : "";

  const selectedStructuredHitTicket = selectedStructuredPrediction?.tickets.find((ticket) => {
    if (!selectedResultOrderText) return false;

    if (ticket.betType === "3連単") {
      return ticket.combination === selectedResultOrderText;
    }

    if (ticket.betType === "2車単") {
      return ticket.combination === selectedResultTop2Text;
    }

    return false;
  });

  const selectedStructuredPredictionResultLabel =
    !selectedStructuredPrediction || selectedStructuredPrediction.tickets.length === 0
      ? "JSON予想なし"
      : !selectedResultOrderText
        ? "結果待ち"
        : selectedStructuredHitTicket
          ? "的中"
          : "不的中";

  const selectedStructuredPredictionResultTone =
    selectedStructuredPredictionResultLabel === "的中"
      ? {
          background: "linear-gradient(135deg, #ecfdf5 0%, #ffffff 100%)",
          border: "#99f6e4",
          color: "#0f766e",
        }
      : selectedStructuredPredictionResultLabel === "不的中"
        ? {
            background: "linear-gradient(135deg, #fff7ed 0%, #ffffff 100%)",
            border: "#fed7aa",
            color: "#b45309",
          }
        : selectedStructuredPredictionResultLabel === "結果待ち"
          ? {
              background: "linear-gradient(135deg, #f8fafc 0%, #ffffff 100%)",
              border: "#e2e8f0",
              color: "#475569",
            }
          : {
              background: "linear-gradient(135deg, #ffffff 0%, #f6f0ff 100%)",
              border: "#d8c9f4",
              color: "#6f5aa9",
            };

  const hasConfirmedVenueResult = Boolean(
    predictionVenue?.races.some(
      (venueRace) => venueRace.resultStatus === "confirmed" || venueRace.result?.status === "confirmed"
    )
  );

  const mobileVenueAttentionBadges: Array<{
    label: string;
    background: string;
    color: string;
    border: string;
    shadow?: string;
  }> = [];

  if (hasFavoriteVenue) {
    mobileVenueAttentionBadges.push({
      label: "❤ PUSH",
      background: "linear-gradient(135deg, #fff7fb 0%, #f6f0ff 100%)",
      color: "#e56b93",
      border: "#e9bfd0",
      shadow: "0 8px 16px rgba(229,107,147,0.12)",
    });
  }

  if ((savedRaceCount ?? 0) > 0) {
    mobileVenueAttentionBadges.push({
      label: `予想 ${savedRaceCount}R`,
      background: "linear-gradient(135deg, #f6f0ff 0%, #ffffff 100%)",
      color: "#6f5aa9",
      border: "#d8c9f4",
    });
  }

  if (hasConfirmedVenueResult) {
    mobileVenueAttentionBadges.push({
      label: "結果あり",
      background: "linear-gradient(135deg, #ecfdf5 0%, #ffffff 100%)",
      color: "#047857",
      border: "#bfeadd",
    });
  }

  if (profitLoss !== undefined && profitLoss > 0) {
    mobileVenueAttentionBadges.push({
      label: `PLUS ${formatYen(profitLoss)}`,
      background: "linear-gradient(135deg, #f4effc 0%, #ffffff 100%)",
      color: "#5f43a5",
      border: "#d8c9f4",
      shadow: "0 8px 16px rgba(112,94,176,0.12)",
    });
  }

  return (
    <article
      id={mobileVenueCardDomId}
      style={{
        borderRadius: "28px",
        padding: "16px",
        background:
          isOpen
            ? "linear-gradient(180deg, #ffffff 0%, #faf6ff 52%, #f3fbff 100%)"
            : "linear-gradient(180deg, #ffffff 0%, #fbf9ff 100%)",
        border: isOpen ? "1px solid rgba(140, 99, 199, 0.28)" : "1px solid #edf0f5",
        boxShadow: isOpen
          ? "0 18px 42px rgba(89, 70, 140, 0.14)"
          : "0 12px 28px rgba(15, 23, 42, 0.06)",
        boxSizing: "border-box",
        minWidth: 0,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          right: "-34px",
          top: "-42px",
          width: "128px",
          height: "128px",
          borderRadius: "9999px",
          background: isOpen
            ? "radial-gradient(circle, rgba(140,99,199,0.22) 0%, rgba(140,99,199,0) 68%)"
            : "radial-gradient(circle, rgba(56,189,248,0.14) 0%, rgba(56,189,248,0) 70%)",
          pointerEvents: "none",
        }}
      />      
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) auto",
          gap: "14px",
          alignItems: "center",
          marginBottom: "14px",
          position: "relative",
          zIndex: 2,
        }}
      >
        <div style={{ minWidth: 0, display: "grid", gap: "7px" }}>
          <h3
            style={{
              margin: 0,
              fontSize: "20px",
              lineHeight: 1.15,
              fontWeight: 950,
              color: "#081224",
              letterSpacing: "-0.02em",
              overflowWrap: "anywhere",
            }}
          >
            {race.venue}
          </h3>

          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "7px",
                padding: "3px 7px",
                fontSize: "11px",
                fontWeight: 950,
                background: gradeTone.background,
                color: gradeTone.text,
                border: `1px solid ${gradeTone.border}`,
                boxShadow: gradeTone.shadow,
              }}
            >
              {race.displayGradeLabel ?? race.grade}
            </span>

            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "7px",
                padding: "3px 7px",
                fontSize: "10px",
                fontWeight: 900,
                background: "#f8fafc",
                color: "#64748b",
                border: "1px solid #edf1f7",
              }}
            >
              {race.startDate === race.endDate ? "初日" : `${race.startDate.slice(5).replace("-", "/")}〜`}
            </span>
          </div>
          <p
            style={{
              margin: 0,
              fontSize: "12px",
              lineHeight: 1.55,
              color: "#526072",
              fontWeight: 750,
              overflowWrap: "anywhere",
            }}
          >
            {isOpen
              ? race.title
              : `${getSessionLabel(race.session)} ・ ${firstRaceTimeLabel} ・ ${raceCountLabel}`}
          </p>
        </div>

        <button
          type="button"
          onClick={onToggle}
          style={{
            width: "78px",
            minHeight: "44px",
            borderRadius: "9999px",
            border: isOpen ? "1px solid #d8c9f4" : "1px solid rgba(255,255,255,0.72)",
            background: isOpen
              ? "linear-gradient(135deg, #f6f0ff 0%, #ffffff 100%)"
              : "linear-gradient(135deg, #00856f 0%, #13a88d 100%)",
            color: isOpen ? "#6f5aa9" : "#ffffff",
            fontSize: "13px",
            fontWeight: 950,
            letterSpacing: "0.02em",
            cursor: "pointer",
            boxShadow: isOpen
              ? "0 10px 22px rgba(122,103,184,0.12)"
              : "0 12px 26px rgba(0,133,111,0.24)",
            flexShrink: 0,
          }}
        >
          {isOpen ? "閉じる" : "詳細"}
        </button>
      </div>

      {isOpen ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: "8px",
            marginBottom: "12px",
          }}
        >
          {[
            { label: "時間帯", value: getSessionLabel(race.session) },
            { label: "開始", value: firstRaceTimeLabel },
            { label: "レース", value: raceCountLabel },
            { label: "結果", value: venueResultLabel },
          ].map((item) => (
            <div
              key={`${normalizedVenue}-${item.label}`}
              style={{
                borderRadius: "18px",
                padding: "10px 11px",
                background: "linear-gradient(135deg, #ffffff 0%, #f7f3ff 100%)",
                border: "1px solid #e7ddf5",
                minWidth: 0,
                boxShadow: "0 8px 16px rgba(39, 33, 72, 0.045)",
              }}
            >
              <div style={{ fontSize: "9px", fontWeight: 900, letterSpacing: "0.14em", color: "#64748b", marginBottom: "4px" }}>
                {item.label}
              </div>
              <div style={{ fontSize: "12px", fontWeight: 850, color: "#081224", overflowWrap: "anywhere" }}>
                {item.value}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "7px",
            marginBottom: "12px",
          }}
        >
          {[
            { label: firstRaceTimeLabel },
            { label: raceCountLabel },
            { label: venueResultLabel },
          ].map((item) => (
            <span
              key={`${normalizedVenue}-compact-${item.label}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                borderRadius: "9999px",
                padding: "6px 9px",
                background: "linear-gradient(135deg, #ffffff 0%, #f8f5ff 100%)",
                border: "1px solid #e7ddf5",
                color: "#334155",
                fontSize: "11px",
                lineHeight: 1.2,
                fontWeight: 900,
                boxShadow: "0 6px 12px rgba(39,33,72,0.045)",
              }}
            >
              {item.label}
            </span>
          ))}
        </div>
      )}

      {mobileVenueAttentionBadges.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "7px",
            marginBottom: "12px",
          }}
        >
          {mobileVenueAttentionBadges.map((badge) => (
            <span
              key={`${normalizedVenue}-attention-${badge.label}`}
              style={{
                borderRadius: "9999px",
                padding: "6px 9px",
                fontSize: "10px",
                lineHeight: 1.2,
                fontWeight: 950,
                background: badge.background,
                color: badge.color,
                border: `1px solid ${badge.border}`,
                boxShadow: badge.shadow ?? "0 6px 12px rgba(39,33,72,0.045)",
                whiteSpace: "nowrap",
              }}
            >
              {badge.label}
            </span>
          ))}
        </div>
      )}

      <div
        style={{
          ...mobileGlassPanelStyle,
          padding: "12px",
          display: "grid",
          gap: "10px",
          background:
            isOpen
              ? "linear-gradient(135deg, rgba(255,255,255,0.96) 0%, rgba(246,240,255,0.96) 100%)"
              : "linear-gradient(135deg, rgba(255,255,255,0.92) 0%, rgba(248,251,255,0.96) 100%)",
          border: isOpen ? "1px solid rgba(216, 201, 244, 0.95)" : "1px solid rgba(226,232,240,0.95)",
          boxShadow: isOpen ? "0 12px 26px rgba(122, 103, 184, 0.1)" : "0 8px 18px rgba(15, 23, 42, 0.045)",
          position: "relative",
          zIndex: 2,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px",
            borderBottom: isOpen ? "1px solid #ebe3f3" : "none",
            paddingBottom: isOpen ? "10px" : 0,
          }}
        >
          <span
            style={{
              fontSize: "10px",
              fontWeight: 950,
              letterSpacing: "0.18em",
              color: "#8c63c7",
            }}
          >
            RACE STATUS
          </span>
          <span
            style={{
              borderRadius: "9999px",
              padding: "5px 9px",
              fontSize: "10px",
              fontWeight: 950,
              color: isOpen ? "#ffffff" : "#0f766e",
              background: isOpen
                ? "linear-gradient(135deg, #00856f 0%, #13a88d 100%)"
                : "#f0fbf9",
              border: isOpen ? "1px solid rgba(255,255,255,0.72)" : "1px solid #cdece6",
              boxShadow: isOpen ? "0 8px 16px rgba(0,133,111,0.18)" : "none",
            }}
          >
            {isOpen ? "詳細表示中" : "詳細ボタンで展開"}
          </span>
        </div>

        {isOpen && (
          <div style={{ display: "grid", gap: "10px" }}>
            {venueRaceRows.length > 0 && selectedVenueRace ? (
              <>
                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    overflowX: "auto",
                    padding: "2px 2px 8px",
                    WebkitOverflowScrolling: "touch",
                  }}
                >
                  {venueRaceRows.map((venueRace) => {
                    const isSelectedRace = venueRace.raceNo === selectedVenueRace.raceNo;
                    const raceSavedResult = getSavedResultForRace(venueRace.raceNo);
                    const raceSlotLookup = findPredictionSlotRecord(
                      predictionSlotMap,
                      TODAY,
                      predictionVenue,
                      venueRace
                    );
                    const hasPrediction = Boolean(clipMobilePredictionText(raceSlotLookup.record?.predictionText));
                    const raceHasResult = venueRace.resultStatus === "confirmed" || venueRace.result?.status === "confirmed";

                    return (
                      <button
                        key={`${normalizedVenue}-selector-${venueRace.raceNo}`}
                        type="button"
                        onClick={() => {
                          setSelectedRaceNo(venueRace.raceNo);
                        }}
                        style={{
                          flex: "0 0 auto",
                          minWidth: "78px",
                          borderRadius: "20px",
                          border: isSelectedRace ? "1px solid rgba(255,255,255,0.72)" : "1px solid #e5e7ef",
                          background: isSelectedRace
                            ? "linear-gradient(135deg, #081224 0%, #24365f 100%)"
                            : "linear-gradient(180deg, #ffffff 0%, #f8f5ff 100%)",
                          color: isSelectedRace ? "#ffffff" : "#081224",
                          padding: "11px 10px",
                          display: "grid",
                          gap: "4px",
                          textAlign: "center",
                          cursor: "pointer",
                          boxShadow: isSelectedRace
                            ? "0 12px 24px rgba(8,18,36,0.22)"
                            : "0 8px 18px rgba(39,33,72,0.06)",
                        }}
                      >
                        <span style={{ fontSize: "15px", fontWeight: 950, lineHeight: 1 }}>
                          {venueRace.raceNo}R
                        </span>
                        <span style={{ fontSize: "10px", fontWeight: 850, opacity: 0.82 }}>
                          {venueRace.time ?? "--:--"}
                        </span>
                        <span
                          style={{
                            display: "inline-flex",
                            justifyContent: "center",
                            gap: "3px",
                            fontSize: "9px",
                            fontWeight: 900,
                            opacity: 0.9,
                          }}
                        >
                          {raceHasResult ? "結果" : "待ち"}
                          {raceSavedResult || hasPrediction ? "・予想" : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>

                  <div
                    style={{
                      borderRadius: "24px",
                      background: "linear-gradient(180deg, #ffffff 0%, #fbf8ff 100%)",
                      border: "1px solid rgba(216, 201, 244, 0.92)",
                      overflow: "hidden",
                      boxShadow: "0 16px 34px rgba(39, 33, 72, 0.1)",
                    }}
                  >
                  <div
                    style={{
                      padding: "15px 14px 13px",
                      borderBottom: "1px solid rgba(237, 240, 245, 0.95)",
                      display: "grid",
                      gap: "8px",
                      background: "linear-gradient(135deg, #ffffff 0%, #f7f2ff 100%)",
                    }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                        justifyContent: "space-between",
                        gap: "10px",
                      }}
                    >
                      <div style={{ minWidth: 0, display: "grid", gap: "4px" }}>
                        <div
                          style={{
                            fontSize: "18px",
                            fontWeight: 950,
                            color: "#081224",
                            letterSpacing: "-0.02em",
                          }}
                        >
                          {selectedVenueRace.raceNo}R
                          <span
                            style={{
                              marginLeft: "8px",
                              fontSize: "12px",
                              fontWeight: 850,
                              color: "#64748b",
                            }}
                          >
                            {selectedVenueRace.time ?? "時刻未取得"}
                          </span>
                        </div>

                        <div
                          style={{
                            fontSize: "12px",
                            lineHeight: 1.55,
                            fontWeight: 750,
                            color: "#526072",
                            overflowWrap: "anywhere",
                          }}
                        >
                          {selectedVenueRace.title ?? `${race.venue} ${selectedVenueRace.raceNo}R`}
                        </div>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gap: "5px",
                          justifyItems: "end",
                          flexShrink: 0,
                        }}
                      >
                        <span
                          style={{
                            borderRadius: "9999px",
                            padding: "4px 8px",
                            fontSize: "10px",
                            fontWeight: 900,
                            background: selectedResultTone.background,
                            color: selectedResultTone.color,
                            border: `1px solid ${selectedResultTone.border}`,
                          }}
                        >
                          {getMobileRaceResultLabel(selectedVenueRace)}
                        </span>

                        <span
                          style={{
                            borderRadius: "9999px",
                            padding: "4px 8px",
                            fontSize: "10px",
                            fontWeight: 900,
                            background: selectedSavedTone.background,
                            color: selectedSavedTone.color,
                            border: `1px solid ${selectedSavedTone.border}`,
                          }}
                        >
                          {selectedSavedTone.label}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                      background: "linear-gradient(135deg, #171821 0%, #2a2440 52%, #1e293b 100%)",
                      borderTop: "1px solid rgba(255,255,255,0.08)",
                      borderBottom: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    {mobileRaceDetailTabs.map((tab) => {
                      const isActive = activeDetailTab === tab.key;

                      return (
                        <button
                          key={tab.key}
                          type="button"
                          onClick={() => setActiveDetailTab(tab.key)}
                          style={{
                            minHeight: "56px",
                            border: "none",
                            background: isActive
                              ? "linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(140,99,199,0.18) 100%)"
                              : "transparent",
                            color: "#ffffff",
                            fontSize: "10px",
                            fontWeight: 950,
                            display: "grid",
                            gap: "3px",
                            placeItems: "center",
                            cursor: "pointer",
                            borderBottom: isActive ? "3px solid #d8b4fe" : "3px solid transparent",
                            opacity: isActive ? 1 : 0.72,
                          }}
                        >
                          <span style={{ fontSize: "15px", lineHeight: 1 }}>{tab.icon}</span>
                          <span>{tab.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div
                    style={{
                      padding: "14px",
                      background:
                        "radial-gradient(circle at 10% 0%, rgba(140,99,199,0.1) 0%, rgba(140,99,199,0) 28%), linear-gradient(180deg, #ffffff 0%, #fbf9fe 100%)",
                    }}
                  >
                    {activeDetailTab === "entry" && (
                      <div style={{ display: "grid", gap: "10px" }}>
                        <div
                          style={{
                            fontSize: "10px",
                            fontWeight: 900,
                            letterSpacing: "0.14em",
                            color: "#8c63c7",
                          }}
                        >
                          ENTRY
                        </div>

                        {(selectedVenueRace.riders?.length ?? 0) > 0 ? (
                          <div style={{ display: "grid", gap: "8px" }}>
{selectedVenueRace.riders?.map((rider) => {
  const carColorStyle = getMobileCarColorStyle(rider.carNo);

  return (
    <div
      key={`${normalizedVenue}-${selectedVenueRace.raceNo}-${rider.carNo}`}
      style={{
        display: "grid",
        gridTemplateColumns: "36px minmax(0, 1fr) auto",
        alignItems: "center",
        gap: "10px",
        borderRadius: "18px",
        padding: "10px 11px",
        background: "linear-gradient(135deg, #ffffff 0%, #f8f5ff 100%)",
        border: "1px solid #e7ddf5",
        boxShadow: "0 8px 16px rgba(39, 33, 72, 0.045)",
      }}
    >
      <div
        style={{
          width: "32px",
          height: "32px",
          borderRadius: "10px",
          display: "grid",
          placeItems: "center",
          background: carColorStyle.background,
          color: carColorStyle.color,
          border: `1px solid ${carColorStyle.border}`,
          fontSize: "13px",
          fontWeight: 950,
          boxShadow: "0 6px 12px rgba(15,23,42,0.12)",
        }}
      >
        {rider.carNo}
      </div>

      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: "13px",
            fontWeight: 950,
            color: "#081224",
            overflowWrap: "anywhere",
          }}
        >
          {rider.name}
        </div>
        <div
          style={{
            fontSize: "10px",
            color: "#64748b",
            fontWeight: 800,
            marginTop: "2px",
          }}
        >
          {rider.prefecture ?? "地区不明"} / {rider.age ?? "年齢不明"}歳 / {rider.grade ?? "級班不明"}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gap: "2px",
          justifyItems: "end",
          fontSize: "10px",
          fontWeight: 900,
          color: "#334155",
        }}
      >
        <span>{rider.style ?? "脚質—"}</span>
        <span>{rider.score ?? "得点—"}</span>
      </div>
    </div>
  );
})}
                          </div>
                        ) : (
                          <p style={{ ...mutedTextStyle, fontSize: "12px" }}>
                            このレースの出走表はまだ取得待ちです。
                          </p>
                        )}
                      </div>
                    )}

                    {activeDetailTab === "prediction" && (
                      <div style={{ display: "grid", gap: "10px" }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "10px",
                          }}
                        >
                          <div
                            style={{
                              fontSize: "10px",
                              fontWeight: 900,
                              letterSpacing: "0.14em",
                              color: "#8c63c7",
                            }}
                          >
                            SAVED PREDICTION
                          </div>

                          {selectedStructuredPrediction && (
                            <span
                              style={{
                                borderRadius: "999px",
                                padding: "5px 9px",
                                background: "#f6f0ff",
                                border: "1px solid #d8c9f4",
                                color: "#6f5aa9",
                                fontSize: "11px",
                                fontWeight: 950,
                                whiteSpace: "nowrap",
                              }}
                            >
                              JSON {selectedStructuredPrediction.tickets.length}点
                            </span>
                          )}
                        </div>

                        {selectedStructuredPrediction && selectedStructuredPrediction.tickets.length > 0 ? (
                          <div style={{ display: "grid", gap: "10px" }}>
                            {selectedStructuredPrediction.summary.title && (
                              <div
                                style={{
                                  borderRadius: "16px",
                                  padding: "11px 12px",
                                  background: "linear-gradient(135deg, #ffffff 0%, #fbf8ff 100%)",
                                  border: "1px solid #e7dbf7",
                                  color: "#334155",
                                  fontSize: "12px",
                                  lineHeight: 1.65,
                                  fontWeight: 850,
                                }}
                              >
                                {selectedStructuredPrediction.summary.title}
                              </div>
                            )}

                            <div
                              style={{
                                display: "grid",
                                gap: "7px",
                              }}
                            >
                              {selectedStructuredPrediction.tickets.map((ticket) => {
                                const isHit =
                                  selectedSavedResult?.hitStatus === "hit" &&
                                  selectedSavedResult.hitBetType === ticket.betType &&
                                  selectedSavedResult.hitCombination === ticket.combination;

                                return (
                                  <div
                                    key={`${ticket.index}-${ticket.betType}-${ticket.combination}`}
                                    style={{
                                      display: "grid",
                                      gridTemplateColumns: "auto 1fr auto",
                                      alignItems: "center",
                                      gap: "8px",
                                      borderRadius: "16px",
                                      padding: "10px",
                                      background: isHit
                                        ? "linear-gradient(135deg, #ecfdf5 0%, #ffffff 100%)"
                                        : "#ffffff",
                                      border: isHit ? "1px solid #99f6e4" : "1px solid #e7dbf7",
                                      boxShadow: isHit
                                        ? "0 10px 24px rgba(20, 184, 166, 0.10)"
                                        : "0 8px 18px rgba(15, 23, 42, 0.035)",
                                    }}
                                  >
                                    <span
                                      style={{
                                        width: "28px",
                                        height: "28px",
                                        borderRadius: "10px",
                                        display: "inline-flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        background:
                                          ticket.betType === "2車単"
                                            ? "#eff6ff"
                                            : "#f6f0ff",
                                        color:
                                          ticket.betType === "2車単"
                                            ? "#2554ad"
                                            : "#6542be",
                                        border:
                                          ticket.betType === "2車単"
                                            ? "1px solid #d6e6fb"
                                            : "1px solid #d8c9f4",
                                        fontSize: "10px",
                                        fontWeight: 950,
                                      }}
                                    >
                                      {ticket.index}
                                    </span>

                                    <div style={{ minWidth: 0, display: "grid", gap: "3px" }}>
                                      <div
                                        style={{
                                          display: "flex",
                                          gap: "6px",
                                          alignItems: "center",
                                          flexWrap: "wrap",
                                        }}
                                      >
                                        <span
                                          style={{
                                            fontSize: "11px",
                                            fontWeight: 950,
                                            color: ticket.betType === "2車単" ? "#2554ad" : "#6542be",
                                          }}
                                        >
                                          {ticket.betType}
                                        </span>
                                        <span
                                          style={{
                                            fontSize: "15px",
                                            fontWeight: 950,
                                            color: "#081224",
                                            letterSpacing: "0.02em",
                                          }}
                                        >
                                          {ticket.combination}
                                        </span>
                                      </div>

                                      <div
                                        style={{
                                          display: "flex",
                                          gap: "6px",
                                          flexWrap: "wrap",
                                          alignItems: "center",
                                        }}
                                      >
                                        <span
                                          style={{
                                            width: "fit-content",
                                            borderRadius: "999px",
                                            padding: "3px 7px",
                                            background:
                                              ticket.group === "厚め"
                                                ? "#f6f0ff"
                                                : ticket.group === "穴狙い"
                                                  ? "#fff7ed"
                                                  : "#f8fafc",
                                            color:
                                              ticket.group === "厚め"
                                                ? "#6542be"
                                                : ticket.group === "穴狙い"
                                                  ? "#b45309"
                                                  : "#64748b",
                                            border:
                                              ticket.group === "厚め"
                                                ? "1px solid #d8c9f4"
                                                : ticket.group === "穴狙い"
                                                  ? "1px solid #fed7aa"
                                                  : "1px solid #e2e8f0",
                                            fontSize: "10px",
                                            fontWeight: 900,
                                          }}
                                        >
                                          {ticket.group}
                                        </span>

                                        {isHit && (
                                          <span
                                            style={{
                                              width: "fit-content",
                                              borderRadius: "999px",
                                              padding: "3px 7px",
                                              background: "#ccfbf1",
                                              color: "#0f766e",
                                              border: "1px solid #99f6e4",
                                              fontSize: "10px",
                                              fontWeight: 950,
                                            }}
                                          >
                                            的中
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    <span
                                      style={{
                                        fontSize: "11px",
                                        fontWeight: 950,
                                        color: isHit ? "#0f766e" : "#94a3b8",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      {isHit ? "HIT" : "—"}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>

                            {(selectedStructuredPrediction.summary.lineup ||
                              selectedStructuredPrediction.summary.scenario ||
                              selectedStructuredPrediction.summary.memo) && (
                              <div
                                style={{
                                  display: "grid",
                                  gap: "7px",
                                  borderRadius: "16px",
                                  padding: "12px",
                                  background: "linear-gradient(135deg, #ffffff 0%, #f8fbff 100%)",
                                  border: "1px solid #e2e8f0",
                                }}
                              >
                                {selectedStructuredPrediction.summary.lineup && (
                                  <p style={{ ...mutedTextStyle, margin: 0, fontSize: "12px" }}>
                                    <strong style={{ color: "#334155" }}>並び：</strong>
                                    {selectedStructuredPrediction.summary.lineup}
                                  </p>
                                )}
                                {selectedStructuredPrediction.summary.scenario && (
                                  <p style={{ ...mutedTextStyle, margin: 0, fontSize: "12px" }}>
                                    <strong style={{ color: "#334155" }}>展開：</strong>
                                    {selectedStructuredPrediction.summary.scenario}
                                  </p>
                                )}
                                {selectedStructuredPrediction.summary.memo && (
                                  <p style={{ ...mutedTextStyle, margin: 0, fontSize: "12px" }}>
                                    <strong style={{ color: "#334155" }}>メモ：</strong>
                                    {selectedStructuredPrediction.summary.memo}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        ) : selectedSavedPredictionText ? (
                          <pre
                            style={{
                              margin: 0,
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                              color: "#334155",
                              fontSize: "12px",
                              lineHeight: 1.75,
                              fontFamily: "inherit",
                              fontWeight: 750,
                              borderRadius: "16px",
                              padding: "12px",
                              background: "#ffffff",
                              border: "1px solid #e7dbf7",
                            }}
                          >
                            {selectedSavedPredictionText}
                          </pre>
                        ) : (
                          <div
                            style={{
                              borderRadius: "18px",
                              padding: "14px",
                              background: "linear-gradient(135deg, #ffffff 0%, #f6f0ff 100%)",
                              border: "1px dashed #d8c9f4",
                              display: "grid",
                              gap: "6px",
                            }}
                          >
                            <div
                              style={{
                                fontSize: "12px",
                                fontWeight: 950,
                                color: "#6f5aa9",
                              }}
                            >
                              まだ保存済み予想はありません
                            </div>
                            <p style={{ ...mutedTextStyle, fontSize: "12px" }}>
                              PC版PredictionPageで公開JSONを書き出すと、ここに買い目カードとして表示されます。
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {activeDetailTab === "result" && (
                      <div style={{ display: "grid", gap: "10px" }}>
                        <div
                          style={{
                            fontSize: "10px",
                            fontWeight: 900,
                            letterSpacing: "0.14em",
                            color: "#8c63c7",
                          }}
                        >
                          RESULT CHECK
                        </div>

                        {(selectedSavedResult || selectedVenueRace.result) ? (
                          <>
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                                gap: "7px",
                                fontSize: "11px",
                                fontWeight: 850,
                                color: "#334155",
                              }}
                            >
                              <span>着順 {selectedResultOrderText || "—"}</span>
                              <span>投資 {formatYen(selectedSavedResult?.investment)}</span>
                              <span>払戻 {formatYen(selectedSavedResult?.payout)}</span>
                              <span>収支 {formatYen(selectedSavedResult?.profitLoss)}</span>
                              <span>回収 {formatPercent(selectedSavedResult?.roi)}</span>
                              <span>決まり手 {selectedVenueRace.result?.kimarite ?? "—"}</span>
                            </div>

                                                        <div
                              style={{
                                borderRadius: "18px",
                                padding: "12px",
                                background: selectedStructuredPredictionResultTone.background,
                                border: `1px solid ${selectedStructuredPredictionResultTone.border}`,
                                display: "grid",
                                gap: "9px",
                                boxShadow:
                                  selectedStructuredPredictionResultLabel === "的中"
                                    ? "0 10px 22px rgba(20, 184, 166, 0.10)"
                                    : "0 8px 18px rgba(15, 23, 42, 0.035)",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  gap: "10px",
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: "10px",
                                    fontWeight: 950,
                                    letterSpacing: "0.14em",
                                    color: "#8c63c7",
                                  }}
                                >
                                  JSON RESULT CHECK
                                </div>

                                <span
                                  style={{
                                    borderRadius: "999px",
                                    padding: "5px 9px",
                                    background: "#ffffff",
                                    border: `1px solid ${selectedStructuredPredictionResultTone.border}`,
                                    color: selectedStructuredPredictionResultTone.color,
                                    fontSize: "11px",
                                    fontWeight: 950,
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {selectedStructuredPredictionResultLabel}
                                </span>
                              </div>

                              <div
                                style={{
                                  display: "grid",
                                  gap: "6px",
                                  color: "#334155",
                                  fontSize: "12px",
                                  lineHeight: 1.65,
                                  fontWeight: 800,
                                }}
                              >
                                {selectedStructuredPrediction && selectedStructuredPrediction.tickets.length > 0 ? (
                                  <>
                                    <div>
                                      保存買い目：
                                      <strong style={{ color: "#081224" }}>
                                        {selectedStructuredPrediction.tickets.length}点
                                      </strong>
                                    </div>

                                    <div>
                                      結果：
                                      <strong style={{ color: "#081224" }}>
                                        {selectedResultOrderText || "結果待ち"}
                                      </strong>
                                      {selectedResultTop2Text && (
                                        <span style={{ color: "#64748b" }}>
                                          {" "}
                                          / 2車単判定 {selectedResultTop2Text}
                                        </span>
                                      )}
                                    </div>

                                    {selectedStructuredHitTicket ? (
                                      <div
                                        style={{
                                          borderRadius: "14px",
                                          padding: "9px 10px",
                                          background: "#ffffff",
                                          border: "1px solid #99f6e4",
                                          color: "#0f766e",
                                          fontWeight: 950,
                                        }}
                                      >
                                        的中買い目：{selectedStructuredHitTicket.betType}{" "}
                                        {selectedStructuredHitTicket.combination}
                                        <span style={{ marginLeft: "6px", color: "#64748b" }}>
                                          / {selectedStructuredHitTicket.group}
                                        </span>
                                      </div>
                                    ) : selectedResultOrderText ? (
                                      <div
                                        style={{
                                          borderRadius: "14px",
                                          padding: "9px 10px",
                                          background: "#ffffff",
                                          border: "1px solid #fed7aa",
                                          color: "#b45309",
                                          fontWeight: 900,
                                        }}
                                      >
                                        JSON買い目内に一致はありません。
                                      </div>
                                    ) : (
                                      <div
                                        style={{
                                          borderRadius: "14px",
                                          padding: "9px 10px",
                                          background: "#ffffff",
                                          border: "1px solid #e2e8f0",
                                          color: "#475569",
                                          fontWeight: 900,
                                        }}
                                      >
                                        結果確定後に、保存買い目と自動照合します。
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <div
                                    style={{
                                      borderRadius: "14px",
                                      padding: "9px 10px",
                                      background: "#ffffff",
                                      border: "1px solid #e7dbf7",
                                      color: "#6f5aa9",
                                      fontWeight: 900,
                                    }}
                                  >
                                    公開JSONの予想がまだありません。PC版PredictionPageで公開JSONを書き出してください。
                                  </div>
                                )}
                              </div>
                            </div>

                            {(selectedVenueRace.result?.payout3tan || selectedVenueRace.result?.payout2tan) && (
                              <div
                                style={{
                                  display: "grid",
                                  gap: "6px",
                                  borderTop: "1px solid #ebe3f3",
                                  paddingTop: "8px",
                                  color: "#475569",
                                  fontSize: "11px",
                                  lineHeight: 1.6,
                                  fontWeight: 800,
                                }}
                              >
                                {selectedVenueRace.result?.payout3tan && (
                                  <span>
                                    3連単 {selectedVenueRace.result.payout3tan.combination} / {selectedVenueRace.result.payout3tan.payout}
                                  </span>
                                )}
                                {selectedVenueRace.result?.payout2tan && (
                                  <span>
                                    2車単 {selectedVenueRace.result.payout2tan.combination} / {selectedVenueRace.result.payout2tan.payout}
                                  </span>
                                )}
                              </div>
                            )}
                          </>
                        ) : (
                          <div
                            style={{
                              borderRadius: "18px",
                              padding: "14px",
                              background: "linear-gradient(135deg, #ffffff 0%, #f0fbf9 100%)",
                              border: "1px dashed #cdece6",
                              display: "grid",
                              gap: "6px",
                            }}
                          >
                            <div
                              style={{
                                fontSize: "12px",
                                fontWeight: 950,
                                color: "#0f766e",
                              }}
                            >
                              結果はまだ反映待ちです
                            </div>
                            <p style={{ ...mutedTextStyle, fontSize: "12px" }}>
                              レース結果と払戻が取得されると、このタブに着順・決まり手・払戻が表示されます。
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {activeDetailTab === "info" && (
                      <div style={{ display: "grid", gap: "10px" }}>
                        <div
                          style={{
                            fontSize: "10px",
                            fontWeight: 900,
                            letterSpacing: "0.14em",
                            color: "#8c63c7",
                          }}
                        >
                          RACE INFO
                        </div>

                        <div
                          style={{
                            display: "grid",
                            gap: "8px",
                            fontSize: "12px",
                            lineHeight: 1.7,
                            color: "#334155",
                            fontWeight: 750,
                          }}
                        >
                          <div>会場：{race.venue}</div>
                          <div>レース：{selectedVenueRace.raceNo}R</div>
                          <div>発走：{selectedVenueRace.time ?? "時刻未取得"}</div>
                          <div>タイトル：{selectedVenueRace.title ?? "レース名未取得"}</div>
                          <div>並び：{selectedVenueRace.lineup ?? selectedVenueRace.netkeirinLineupRaw ?? selectedVenueRace.winticketLineupRaw ?? "並び未取得"}</div>
                          <div>メモ：{selectedVenueRace.sourceNote ?? selectedVenueRace.oddsNote ?? "補足情報なし"}</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <p style={{ ...mutedTextStyle, fontSize: "12px" }}>
                この会場のレース一覧はまだ取得待ちです。
              </p>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

export default function MobileDashboardPage() {
  const [favoriteRiderFeed, setFavoriteRiderFeed] = useState<FavoriteRiderFeedItem[]>(
    () => loadCachedFavoriteRiderFeed()?.feed ?? EMPTY_FAVORITE_RIDER_FEED
  );
  const [todayPredictionFeed, setTodayPredictionFeed] = useState<PredictionTodayFeed | null>(null);
  const [predictionResultMap, setPredictionResultMap] = useState<PredictionResultMap>(() => loadStoredPredictionResults());
  const [localPredictionSlotMap, setLocalPredictionSlotMap] = useState<PredictionSlotMap>(() => loadStoredPredictionSlots());
  const [publicPredictionSlotMap, setPublicPredictionSlotMap] = useState<PredictionSlotMap>({});
  const [feedStatus, setFeedStatus] = useState<"loading" | "ready" | "error">("loading");
  const [openVenueKey, setOpenVenueKey] = useState<string | null>(null);
  const [selectedCalendarIso, setSelectedCalendarIso] = useState(TODAY);
  const [activeMobileSection, setActiveMobileSection] = useState("mobile-calendar");
    const predictionSlotMap = useMemo(
    () => mergePredictionSlotMaps(publicPredictionSlotMap, localPredictionSlotMap),
    [publicPredictionSlotMap, localPredictionSlotMap]
  );

  useEffect(() => {
    let isActive = true;

    const applyLatestFavoriteFeed = async () => {
      const result = await fetchFavoriteRiderFeedFile();
      if (!isActive) return;

      if (!result) {
        setFavoriteRiderFeed(EMPTY_FAVORITE_RIDER_FEED);
        return;
      }

      setFavoriteRiderFeed(result.feed);
    };

    applyLatestFavoriteFeed();

    const intervalId = window.setInterval(applyLatestFavoriteFeed, FAVORITE_RIDER_FEED_POLL_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        applyLatestFavoriteFeed();
      }
    };

    const handleFocus = () => {
      applyLatestFavoriteFeed();
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
    let isActive = true;

    const loadTodayFeed = async () => {
      try {
        const response = await fetch(`${PREDICTION_TODAY_DATA_URL}?t=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) throw new Error(`mobile-dashboard-feed-${response.status}`);
        const feed = (await response.json()) as PredictionTodayFeed;
        if (!isActive) return;
        setTodayPredictionFeed(feed);
        setFeedStatus("ready");
      } catch {
        if (!isActive) return;
        setTodayPredictionFeed(null);
        setFeedStatus("error");
      }
    };

    loadTodayFeed();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (visibleEntry?.target.id) {
          setActiveMobileSection(visibleEntry.target.id);
        }
      },
      {
        root: null,
        rootMargin: "-18% 0px -58% 0px",
        threshold: [0.08, 0.2, 0.4],
      }
    );

    mobileFloatingNavItems.forEach((item) => {
      const target = document.getElementById(item.targetId);
      if (target) {
        observer.observe(target);
      }
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const refreshStoredPredictionData = () => {
      setPredictionResultMap(loadStoredPredictionResults());
      setLocalPredictionSlotMap(loadStoredPredictionSlots());
    };

    const handleStorage = (event: StorageEvent) => {
      if (
        !event.key ||
        event.key === PREDICTION_RESULT_STORAGE_KEY ||
        event.key === PREDICTION_SLOT_STORAGE_KEY
      ) {
        refreshStoredPredictionData();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshStoredPredictionData();
      }
    };

    window.addEventListener("storage", handleStorage);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("storage", handleStorage);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

    useEffect(() => {
    let isActive = true;

    const loadPublicSlots = async () => {
      const publicSlots = await loadPublicPredictionSlots();
      if (!isActive) return;
      setPublicPredictionSlotMap(publicSlots);
    };

    loadPublicSlots();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        loadPublicSlots();
      }
    };

    window.addEventListener("focus", loadPublicSlots);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isActive = false;
      window.removeEventListener("focus", loadPublicSlots);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const dashboardTodayRaces = useMemo(
    () => mergeTodayRaceCardItems(todayRaces, todayPredictionFeed?.venues ?? []),
    [todayPredictionFeed]
  );

  const predictionVenueMap = useMemo(
    () =>
      new Map(
        (todayPredictionFeed?.venues ?? []).map((venue) => [
          normalizePredictionVenueName(venue.venue),
          venue,
        ])
      ),
    [todayPredictionFeed]
  );

  const predictionAggregate = useMemo(
    () => getPredictionResultAggregate(predictionResultMap, TODAY),
    [predictionResultMap]
  );

  const todaySummary = predictionAggregate.dailySummary;
  const todayVenueSummaryMap = predictionAggregate.venueSummaryMap ?? {};
  const todayHitLogItems = useMemo(
    () =>
      Object.values(predictionResultMap)
        .filter((item) => item.date === TODAY && item.hitStatus === "hit")
        .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
        .slice(0, 12)
        .map((item) => ({
          id: item.raceKey,
          venue: item.venue,
          raceNumber: item.raceNumber,
          hitBetType: item.hitBetType,
          hitCombination: item.hitCombination,
          profitLoss: item.profitLoss,
        })),
    [predictionResultMap]
  );
  const totalRaceCount = todayPredictionFeed?.venues.reduce((sum, venue) => sum + venue.races.length, 0) ?? 0;

  const mobileMonthCalendar = useMemo(() => buildMobileMonthCalendar(TODAY, raceScheduleData), []);
  const mobileCalendarVenuePreview = dashboardTodayRaces.slice(0, 4).map((item) => item.venue);

  const selectedCalendarLabel = formatMobileCalendarDateLabel(selectedCalendarIso);
  const selectedCalendarIsToday = selectedCalendarIso === TODAY;
  const selectedCalendarScheduleEvents =
    mobileMonthCalendar.weeks.flat().find((cell) => cell.iso === selectedCalendarIso)?.events ?? [];
  const selectedCalendarVenueCards = selectedCalendarIsToday ? dashboardTodayRaces : selectedCalendarScheduleEvents;

  const selectedCalendarFavoriteEntries = useMemo(() => {
    if (selectedCalendarIsToday) {
      const todayFeedEntries = findTodayFavoriteEntriesFromPredictionFeed(todayPredictionFeed);
      if (todayFeedEntries.length > 0) return todayFeedEntries;
    }

    return findFavoriteEntriesFromFeedForDate(favoriteRiderFeed, selectedCalendarIso);
  }, [favoriteRiderFeed, selectedCalendarIsToday, selectedCalendarIso, todayPredictionFeed]);
  const todayFavoriteEntries = useMemo(() => {
    const todayFeedEntries = findTodayFavoriteEntriesFromPredictionFeed(todayPredictionFeed);
    if (todayFeedEntries.length > 0) return todayFeedEntries;

    return findFavoriteEntriesFromFeedForDate(favoriteRiderFeed, TODAY);
  }, [favoriteRiderFeed, todayPredictionFeed]);
  const confirmedRaceCount =
    todayPredictionFeed?.venues.reduce(
      (sum, venue) =>
        sum +
        venue.races.filter((race) => race.resultStatus === "confirmed" || race.result?.status === "confirmed").length,
      0
    ) ?? 0;

  const profitTone =
    todaySummary?.profitLoss === undefined
      ? "default"
      : todaySummary.profitLoss >= 0
        ? "plus"
        : "minus";

  const scrollToMobileVenueCard = (venueKey: string) => {
    window.setTimeout(() => {
      const target = document.getElementById(`mobile-venue-card-${venueKey}`);
      if (!target) return;

      target.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 120);
  };

    const handleMobileNavNavigate = (targetId: string) => {
    setActiveMobileSection(targetId);

    const target = document.getElementById(targetId);
    if (!target) return;

    target.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  return (
    <main style={mobilePageShellStyle}>
      <div style={mobileContentStyle}>
        <section
          id="mobile-calendar"
          style={{
            borderRadius: "30px",
            padding: "18px 16px 16px",
            background: "linear-gradient(180deg, #ffffff 0%, #faf6ff 52%, #f8fbff 100%)",
            border: "1px solid #ebe3f3",
            boxShadow: "0 16px 34px rgba(15, 23, 42, 0.06)",
            display: "grid",
            gap: "14px",
            overflow: "hidden",
            position: "relative",
            isolation: "isolate",
          }}
        >
          <div
            style={{
              position: "absolute",
              right: "0px",
              top: "-70px",
              width: "350px",
              height: "360px",
              backgroundImage: `url("${toPublicPath("/mobile/mobile-calendar-charigon-peek.png")}")`,
              backgroundSize: "contain",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right top",
              pointerEvents: "none",
              filter: "drop-shadow(0 14px 22px rgba(8, 18, 36, 0.14))",
              opacity: 0.96,
              zIndex: 1,
            }}
          />

          <div style={{ display: "grid", gap: "6px", position: "relative", zIndex: 2 }}>
            <p
              style={{
                margin: 0,
                fontSize: "11px",
                fontWeight: 900,
                letterSpacing: "0.18em",
                color: "#8c63c7",
              }}
            >
              MONTHLY CALENDAR
            </p>

            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "space-between",
                gap: "12px",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <h1
                  style={{
                    margin: 0,
                    fontSize: "28px",
                    lineHeight: 1.08,
                    fontWeight: 950,
                    letterSpacing: "-0.04em",
                    color: "#081224",
                  }}
                >
                  {mobileMonthCalendar.monthLabel}
                </h1>
                <p
                  style={{
                    margin: "6px 0 0",
                    fontSize: "12px",
                    lineHeight: 1.7,
                    color: "#526072",
                    fontWeight: 700,
                  }}
                >
                  {mobileCalendarVenuePreview.length > 0
                    ? `本日開催：${mobileCalendarVenuePreview.join(" ・ ")}${dashboardTodayRaces.length > 4 ? " ほか" : ""}`
                    : "今月の開催カレンダー"}
                </p>
              </div>

              <div
                style={{
                  flexShrink: 0,
                  borderRadius: "18px",
                  padding: "10px 12px",
                  background: "linear-gradient(135deg, #081224 0%, #162745 100%)",
                  color: "#ffffff",
                  boxShadow: "0 10px 20px rgba(8, 18, 36, 0.16)",
                  display: "grid",
                  gap: "3px",
                  textAlign: "center",
                }}
              >
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: 900,
                    letterSpacing: "0.14em",
                    opacity: 0.82,
                  }}
                >
                  TODAY
                </span>
                <span
                  style={{
                    fontSize: "20px",
                    fontWeight: 950,
                    lineHeight: 1,
                  }}
                >
                  {Number(TODAY.slice(8, 10))}
                </span>
              </div>
            </div>
          </div>

          <div
            style={{
              borderRadius: "24px",
              padding: "14px 12px 12px",
              background: "rgba(255,255,255,0.84)",
              border: "1px solid #eee5f6",
              display: "grid",
              gap: "10px",
              position: "relative",
              zIndex: 2,
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                gap: "6px",
              }}
            >
              {mobileCalendarWeekLabels.map((label) => (
                <div
                  key={label}
                  style={{
                    textAlign: "center",
                    fontSize: "9px",
                    fontWeight: 900,
                    letterSpacing: "0.12em",
                    color: "#8c63c7",
                  }}
                >
                  {label}
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gap: "6px" }}>
              {mobileMonthCalendar.weeks.map((week, weekIndex) => (
                <div
                  key={`week-${weekIndex}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                    gap: "6px",
                  }}
                >
                  {week.map((cell) => {
                    const isSelected = cell.iso === selectedCalendarIso;
                    const hasFavorite = Boolean(
                      cell.iso &&
                        favoriteRiderFeed.some((entry) => entry.startDate <= cell.iso! && entry.endDate >= cell.iso!)
                    );

                    return (
                      <button
                        key={cell.key}
                        type="button"
                        onClick={() => {
                          if (cell.iso) {
                            setSelectedCalendarIso(cell.iso);
                          }
                        }}
                        style={{
                          minHeight: "46px",
                          borderRadius: "14px",
                          padding: "6px 4px",
                          background: cell.isToday
                            ? "linear-gradient(135deg, #0d1630 0%, #1b2b4d 100%)"
                            : isSelected
                              ? "linear-gradient(135deg, #f3ecff 0%, #ffffff 100%)"
                              : cell.isCurrentMonth
                                ? "#ffffff"
                                : "#f7f4fb",
                          border: cell.isToday
                            ? "1px solid #081224"
                            : isSelected
                              ? "1px solid #8c63c7"
                              : cell.isCurrentMonth
                                ? "1px solid #ece3f5"
                                : "1px solid #f1eaf8",
                          boxShadow: cell.isToday
                            ? "0 10px 20px rgba(8, 18, 36, 0.14)"
                            : isSelected
                              ? "0 8px 18px rgba(140, 99, 199, 0.16)"
                              : "none",
                          display: "grid",
                          alignContent: "space-between",
                          justifyItems: "center",
                          boxSizing: "border-box",
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "12px",
                            fontWeight: 900,
                            color: cell.isToday ? "#ffffff" : cell.isCurrentMonth ? "#081224" : "#a9a2b7",
                            lineHeight: 1,
                          }}
                        >
                          {cell.label}
                        </span>

                        {cell.isToday ? (
                          <span
                            style={{
                              fontSize: "8px",
                              fontWeight: 900,
                              letterSpacing: "0.08em",
                              color: "#d6e4ff",
                              lineHeight: 1,
                            }}
                          >
                            TODAY
                          </span>
                        ) : (
                          <span
                            style={{
                              minWidth: isSelected ? "18px" : hasFavorite ? "15px" : "6px",
                              height: "6px",
                              borderRadius: "9999px",
                              background: isSelected
                                ? "linear-gradient(90deg, #8c63c7 0%, #38bdf8 100%)"
                                : hasFavorite
                                  ? "linear-gradient(90deg, #e56b93 0%, #8c63c7 100%)"
                                  : cell.events.length > 0
                                    ? "#8c63c7"
                                    : cell.isCurrentMonth
                                      ? "#e8dcfa"
                                      : "transparent",
                              boxShadow: hasFavorite ? "0 0 0 3px rgba(229,107,147,0.12)" : "none",
                            }}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              borderRadius: "24px",
              padding: "14px",
              background: "linear-gradient(135deg, rgba(255,255,255,0.94) 0%, rgba(246,240,255,0.9) 100%)",
              border: "1px solid rgba(216, 201, 244, 0.88)",
              boxShadow: "0 12px 26px rgba(39, 33, 72, 0.08)",
              display: "grid",
              gap: "10px",
              position: "relative",
              zIndex: 2,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "10px",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <p style={{ ...eyebrowStyle, marginBottom: "5px" }}>SELECTED DATE</p>
                <h2
                  style={{
                    margin: 0,
                    fontSize: "18px",
                    lineHeight: 1.25,
                    fontWeight: 950,
                    color: "#081224",
                    letterSpacing: "-0.02em",
                  }}
                >
                  {selectedCalendarLabel}
                </h2>
              </div>

              <span
                style={{
                  borderRadius: "9999px",
                  padding: "6px 10px",
                  background: selectedCalendarIsToday
                    ? "linear-gradient(135deg, #081224 0%, #24365f 100%)"
                    : "linear-gradient(135deg, #f3ecff 0%, #ffffff 100%)",
                  color: selectedCalendarIsToday ? "#ffffff" : "#6f5aa9",
                  border: selectedCalendarIsToday ? "1px solid rgba(255,255,255,0.48)" : "1px solid #d8c9f4",
                  fontSize: "10px",
                  fontWeight: 950,
                  whiteSpace: "nowrap",
                  boxShadow: selectedCalendarIsToday ? "0 8px 16px rgba(8,18,36,0.18)" : "none",
                }}
              >
                {selectedCalendarIsToday ? "本日データ" : "開催予定"}
              </span>
            </div>

            {selectedCalendarVenueCards.length > 0 || selectedCalendarFavoriteEntries.length > 0 ? (
              <div style={{ display: "grid", gap: "10px" }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    gap: "8px",
                  }}
                >
                  <div
                    style={{
                      borderRadius: "18px",
                      padding: "11px 12px",
                      background: "#ffffff",
                      border: "1px solid #e7ddf5",
                    }}
                  >
                    <div style={{ fontSize: "9px", fontWeight: 900, letterSpacing: "0.14em", color: "#8c63c7", marginBottom: "5px" }}>
                      VENUES
                    </div>
                    <div style={{ fontSize: "18px", lineHeight: 1, fontWeight: 950, color: "#081224" }}>
                      {selectedCalendarVenueCards.length}場
                    </div>
                  </div>

                  <div
                    style={{
                      borderRadius: "18px",
                      padding: "11px 12px",
                      background: "#ffffff",
                      border: "1px solid #dbeafe",
                    }}
                  >
                    <div style={{ fontSize: "9px", fontWeight: 900, letterSpacing: "0.14em", color: "#2563eb", marginBottom: "5px" }}>
                      FAVORITE
                    </div>
                    <div style={{ fontSize: "18px", lineHeight: 1, fontWeight: 950, color: "#081224" }}>
                      {selectedCalendarFavoriteEntries.length}件
                    </div>
                  </div>
                </div>

                {selectedCalendarVenueCards.length > 0 && (
                  <div style={{ display: "grid", gap: "8px" }}>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                        gap: "8px",
                      }}
                    >
                      {selectedCalendarVenueCards.slice(0, 10).map((venue) => {
                        const gradeLabel = getMobileSelectedVenueGradeLabel(venue);
                        const gradeTone = getGradeBadgeTone(gradeLabel);
                        const hasFavoriteVenue = selectedCalendarFavoriteEntries.some(
                          (entry) =>
                            normalizePredictionVenueName(entry.venue) ===
                            normalizePredictionVenueName(venue.venue)
                        );

                        return (
                          <div
                            key={`selected-date-venue-${getMobileSelectedVenueKey(venue)}`}
                            style={{
                              borderRadius: "18px",
                              padding: "11px 12px",
                              background: hasFavoriteVenue
                                ? "linear-gradient(135deg, #fff7fb 0%, #f6f0ff 100%)"
                                : "linear-gradient(135deg, #ffffff 0%, #f8f5ff 100%)",
                              border: hasFavoriteVenue ? "1px solid #e9bfd0" : "1px solid #e7ddf5",
                              boxShadow: hasFavoriteVenue
                                ? "0 10px 20px rgba(229, 107, 147, 0.12)"
                                : "0 8px 16px rgba(39,33,72,0.05)",
                              display: "grid",
                              gap: "7px",
                              minWidth: 0,
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: "7px",
                              }}
                            >
                              <div
                                style={{
                                  minWidth: 0,
                                  color: "#081224",
                                  fontSize: "13px",
                                  lineHeight: 1.25,
                                  fontWeight: 950,
                                  overflowWrap: "anywhere",
                                }}
                              >
                                {venue.venue}
                              </div>

                              <span
                                style={{
                                  flexShrink: 0,
                                  borderRadius: "8px",
                                  padding: "3px 7px",
                                  fontSize: "10px",
                                  lineHeight: 1.2,
                                  fontWeight: 950,
                                  background: gradeTone.background,
                                  color: gradeTone.text,
                                  border: `1px solid ${gradeTone.border}`,
                                  boxShadow: gradeTone.shadow,
                                }}
                              >
                                {gradeLabel}
                              </span>
                            </div>

                            <div
                              style={{
                                color: "#526072",
                                fontSize: "10px",
                                lineHeight: 1.5,
                                fontWeight: 800,
                                overflowWrap: "anywhere",
                              }}
                            >
                              {getMobileSelectedVenueTitle(venue)}
                            </div>

                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: "6px",
                                color: "#64748b",
                                fontSize: "10px",
                                fontWeight: 900,
                              }}
                            >
                              <span>{getMobileSelectedVenuePeriodLabel(venue)}</span>
                              {hasFavoriteVenue && (
                                <span
                                  style={{
                                    color: "#e56b93",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  ❤ 推しあり
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {selectedCalendarVenueCards.length > 10 && (
                      <div
                        style={{
                          color: "#64748b",
                          fontSize: "11px",
                          fontWeight: 850,
                          textAlign: "center",
                        }}
                      >
                        ほか {selectedCalendarVenueCards.length - 10}場
                      </div>
                    )}
                  </div>
                )}

                {selectedCalendarFavoriteEntries.length > 0 ? (
                  <div style={{ display: "grid", gap: "7px" }}>
                    {selectedCalendarFavoriteEntries.map((entry) => (
                      <div
                        key={entry.key}
                        style={{
                          borderRadius: "18px",
                          padding: "11px 12px",
                          background: "linear-gradient(135deg, #ffffff 0%, #f6f0ff 100%)",
                          border: "1px solid #d8c9f4",
                          display: "grid",
                          gap: "4px",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "12px",
                            fontWeight: 950,
                            color: "#081224",
                          }}
                        >
                          ❤ {entry.riderName}
                        </div>
                        <div
                          style={{
                            fontSize: "11px",
                            fontWeight: 800,
                            color: "#526072",
                          }}
                        >
                          {entry.venue}
                          {entry.raceNo ? ` ${entry.raceNo}R` : entry.raceLabel ? ` ${entry.raceLabel}` : ""}
                          {entry.time ? ` / ${entry.time}` : ""}
                          {entry.carNo ? ` / ${entry.carNo}番車` : ""}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ ...mutedTextStyle, fontSize: "12px" }}>
                    この日付では、推し選手の出走予定はまだ確認できていません。
                  </p>
                )}
              </div>
            ) : (
              <p style={{ ...mutedTextStyle, fontSize: "12px" }}>
                この日付の開催予定はありません。
              </p>
            )}
          </div>
        </section>

        <section id="mobile-results" style={mobileCardStyle}>
          <div style={{ display: "grid", gap: "12px" }}>
            <div style={{ display: "grid", gap: "5px" }}>
              <p style={eyebrowStyle}>TODAY SUMMARY</p>
              <h2 style={sectionTitleStyle}>本日の状況</h2>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: "9px",
              }}
            >
              <MobileMetricCard label="開催" value={`${dashboardTodayRaces.length}場`} />
              <MobileMetricCard label="総レース" value={feedStatus === "loading" ? "取得中" : `${totalRaceCount}R`} />
              <MobileMetricCard label="結果" value={feedStatus === "loading" ? "取得中" : `${confirmedRaceCount}R`} tone="hit" />
              <MobileMetricCard label="保存予想" value={`${todaySummary?.savedRaceCount ?? 0}R`} />
              <MobileMetricCard label="的中" value={`${todaySummary?.hitCount ?? 0}R`} tone="hit" />
              <MobileMetricCard label="収支" value={formatYen(todaySummary?.profitLoss)} tone={profitTone} />
              <MobileMetricCard label="的中率" value={formatPercent(todaySummary?.hitRate)} />
              <MobileMetricCard label="回収率" value={formatPercent(todaySummary?.roi)} />
            </div>

            {feedStatus === "error" && (
              <p style={{ ...mutedTextStyle, color: "#b45309" }}>
                今日のレースデータを取得できませんでした。通信状況を確認して、時間を置いて再読み込みしてください。
              </p>
            )}
          </div>
        </section>

        <MobileHitTicker hitItems={todayHitLogItems} />

        <section id="mobile-today-races" style={mobileCardStyle}>
          <div style={{ display: "grid", gap: "12px" }}>
            <div style={{ display: "grid", gap: "5px" }}>
              <div
                style={{
                  borderRadius: "24px",
                  padding: "16px 110px 14px 16px",
                  minHeight: "126px",
                  background: "linear-gradient(135deg, #ffffff 0%, #faf5ff 48%, #f4fbff 100%)",
                  border: "1px solid #ebe3f3",
                  boxShadow: "0 10px 24px rgba(122, 103, 184, 0.07)",
                  display: "grid",
                  gap: "10px",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    right: "10px",
                    bottom: "-25px",
                    width: "200px",
                    height: "200px",
                    backgroundImage: `url("${toPublicPath("/mobile/mobile-venues-kurari-guide.png")}")`,
                    backgroundSize: "contain",
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right bottom",
                    pointerEvents: "none",
                    filter: "drop-shadow(0 12px 20px rgba(8, 18, 36, 0.12))",
                    opacity: 0.96,
                    zIndex: 1,
                  }}
                />

                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: "12px",
                    position: "relative",
                    zIndex: 2,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <p style={{ ...eyebrowStyle, marginBottom: "6px" }}>TODAY&apos;S VENUES</p>
                    <h2
                      style={{
                        margin: 0,
                        fontSize: "24px",
                        lineHeight: 1.15,
                        fontWeight: 950,
                        letterSpacing: "-0.03em",
                        color: "#081224",
                      }}
                    >
                      本日開催
                    </h2>
                  </div>

                  <div
                    style={{
                      flexShrink: 0,
                      borderRadius: "18px",
                      padding: "10px 12px",
                      background: "linear-gradient(135deg, #f3ecff 0%, #ffffff 100%)",
                      border: "1px solid #e4d8f6",
                      display: "grid",
                      gap: "3px",
                      justifyItems: "center",
                      minWidth: "76px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "9px",
                        fontWeight: 900,
                        letterSpacing: "0.14em",
                        color: "#8c63c7",
                      }}
                    >
                      VENUES
                    </span>
                    <span
                      style={{
                        fontSize: "22px",
                        lineHeight: 1,
                        fontWeight: 950,
                        color: "#081224",
                      }}
                    >
                      {dashboardTodayRaces.length}
                    </span>
                  </div>
                </div>

                <p
                  style={{
                    margin: 0,
                    color: "#526072",
                    fontSize: "13px",
                    lineHeight: 1.8,
                    fontWeight: 700,
                    position: "relative",
                    zIndex: 2,
                  }}
                >
                  会場カードを開くと、レース一覧・保存済み予想・結果をこのページ内で確認できます。
                </p>
              </div>
            </div>

            <div style={{ display: "grid", gap: "12px" }}>
              {dashboardTodayRaces.length > 0 ? (
                dashboardTodayRaces.map((race) => {
                  const venueKey = normalizePredictionVenueName(race.venue);
                  const predictionVenue = predictionVenueMap.get(venueKey);
                  const venueSummary = todayVenueSummaryMap[venueKey];
                  const hasFavoriteVenue = todayFavoriteEntries.some(
                    (entry) => normalizePredictionVenueName(entry.venue) === venueKey
                  );

                  return (
                    <MobileVenueCard
                      key={race.id}
                      race={race}
                      predictionVenue={predictionVenue}
                      savedRaceCount={venueSummary?.savedRaceCount}
                      profitLoss={venueSummary?.profitLoss}
                      predictionResultMap={predictionResultMap}
                      predictionSlotMap={predictionSlotMap}
                      hasFavoriteVenue={hasFavoriteVenue}
                      isOpen={openVenueKey === venueKey}
                      onToggle={() => {
                        setOpenVenueKey((current) => {
                          const nextVenueKey = current === venueKey ? null : venueKey;

                          if (nextVenueKey) {
                            scrollToMobileVenueCard(nextVenueKey);
                          }

                          return nextVenueKey;
                        });
                      }}
                    />
                  );
                })
              ) : (
                <div
                  style={{
                    borderRadius: "22px",
                    padding: "16px",
                    background: "#ffffff",
                    border: "1px solid #ebe3f3",
                    color: "#526072",
                    fontSize: "13px",
                    lineHeight: 1.8,
                    fontWeight: 700,
                  }}
                >
                  今日の開催データはまだありません。
                </div>
              )}
            </div>
          </div>
        </section>

        <a
          href="#top"
          style={{
            display: "inline-flex",
            justifyContent: "center",
            alignItems: "center",
            width: "fit-content",
            margin: "4px auto 0",
            color: "#8c63c7",
            fontSize: "12px",
            fontWeight: 900,
            textDecoration: "none",
            letterSpacing: "0.06em",
          }}
        >
          PC版トップへ戻る
        </a>
      </div>

      <MobileFloatingNav
        activeTargetId={activeMobileSection}
        onNavigate={handleMobileNavNavigate}
      />
    </main>
  );
}