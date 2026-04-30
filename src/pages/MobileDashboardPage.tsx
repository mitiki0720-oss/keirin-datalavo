import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  TODAY,
  PREDICTION_RESULT_STORAGE_KEY,
  PREDICTION_TODAY_DATA_URL,
  getGradeBadgeTone,
  getPredictionResultAggregate,
  getSessionLabel,
  loadStoredPredictionResults,
  mergeTodayRaceCardItems,
  normalizePredictionVenueName,
  openPredictionPageForVenue,
  todayRaces,
  type DashboardTodayRaceCard,
  type PredictionResultMap,
  type PredictionTodayFeed,
  type PredictionVenueItem,
} from "./PageImplementations";

const mobilePageShellStyle: CSSProperties = {
  width: "100%",
  maxWidth: "100vw",
  minHeight: "100vh",
  boxSizing: "border-box",
  overflowX: "hidden",
  background: "linear-gradient(180deg, #ffffff 0%, #fbf9fe 52%, #ffffff 100%)",
  padding: "18px 14px 82px",
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
  borderRadius: "28px",
  background: "linear-gradient(180deg, #ffffff 0%, #faf7fd 100%)",
  border: "1px solid #ebe3f3",
  boxShadow: "0 14px 34px rgba(15, 23, 42, 0.06)",
  padding: "18px",
  boxSizing: "border-box",
  minWidth: 0,
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

const pillButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "42px",
  borderRadius: "9999px",
  padding: "10px 14px",
  fontSize: "12px",
  fontWeight: 900,
  textDecoration: "none",
  boxSizing: "border-box",
  whiteSpace: "nowrap",
};

const primaryButtonStyle: CSSProperties = {
  ...pillButtonStyle,
  background: "linear-gradient(135deg, #081224 0%, #162745 100%)",
  color: "#ffffff",
  border: "1px solid #081224",
  boxShadow: "0 12px 24px rgba(8, 18, 36, 0.14)",
};

const lightButtonStyle: CSSProperties = {
  ...pillButtonStyle,
  background: "linear-gradient(180deg, #ffffff 0%, #faf7fd 100%)",
  color: "#6f5aa9",
  border: "1px solid #ded3f4",
  boxShadow: "0 10px 20px rgba(122, 103, 184, 0.07)",
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
      ? { color: "#705eb0", background: "#f4effc", border: "#ded3f4" }
      : tone === "minus"
        ? { color: "#b45309", background: "#fff7ed", border: "#fed7aa" }
        : tone === "hit"
          ? { color: "#0f766e", background: "#f0fbf9", border: "#cdece6" }
          : { color: "#081224", background: "#ffffff", border: "#ebe3f3" };

  return (
    <div
      style={{
        borderRadius: "20px",
        padding: "13px 12px",
        background: toneStyle.background,
        border: `1px solid ${toneStyle.border}`,
        boxSizing: "border-box",
        minWidth: 0,
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

function MobileVenueCard({
  race,
  predictionVenue,
  savedRaceCount,
  profitLoss,
}: {
  race: DashboardTodayRaceCard;
  predictionVenue?: PredictionVenueItem;
  savedRaceCount?: number;
  profitLoss?: number;
}) {
  const gradeTone = getGradeBadgeTone(race.displayGradeLabel ?? race.grade);
  const venueResultLabel = getVenueResultLabel(predictionVenue);
  const raceCountLabel = getVenueRaceCountLabel(predictionVenue);
  const firstRaceTimeLabel = getFirstRaceTimeLabel(predictionVenue);
  const normalizedVenue = normalizePredictionVenueName(race.venue);

  return (
    <article
      style={{
        borderRadius: "26px",
        padding: "16px",
        background: "linear-gradient(180deg, #ffffff 0%, #fbfdff 100%)",
        border: "1px solid #ebe3f3",
        boxShadow: "0 12px 26px rgba(15, 23, 42, 0.045)",
        boxSizing: "border-box",
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "flex-start", marginBottom: "10px" }}>
        <div style={{ minWidth: 0, display: "grid", gap: "4px" }}>
          <h3
            style={{
              margin: 0,
              fontSize: "20px",
              lineHeight: 1.2,
              fontWeight: 950,
              color: "#081224",
              letterSpacing: "-0.02em",
              overflowWrap: "anywhere",
            }}
          >
            {race.venue}
          </h3>
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
            {race.title}
          </p>
        </div>

        <span
          style={{
            flexShrink: 0,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "9999px",
            padding: "5px 9px",
            fontSize: "10px",
            fontWeight: 900,
            background: gradeTone.background,
            color: gradeTone.text,
            border: `1px solid ${gradeTone.border}`,
            boxShadow: gradeTone.shadow,
          }}
        >
          {race.displayGradeLabel ?? race.grade}
        </span>
      </div>

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
              borderRadius: "16px",
              padding: "9px 10px",
              background: "#faf8fd",
              border: "1px solid #ede7f5",
              minWidth: 0,
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

      {(savedRaceCount !== undefined || profitLoss !== undefined) && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "8px",
            marginBottom: "12px",
          }}
        >
          {savedRaceCount !== undefined && (
            <span
              style={{
                borderRadius: "9999px",
                padding: "5px 9px",
                fontSize: "10px",
                fontWeight: 900,
                background: "#f2ecfb",
                color: "#7a67b8",
                border: "1px solid #e0d6f4",
              }}
            >
              保存 {savedRaceCount}R
            </span>
          )}
          {profitLoss !== undefined && (
            <span
              style={{
                borderRadius: "9999px",
                padding: "5px 9px",
                fontSize: "10px",
                fontWeight: 900,
                background: profitLoss >= 0 ? "#f4effc" : "#fff7ed",
                color: profitLoss >= 0 ? "#705eb0" : "#b45309",
                border: profitLoss >= 0 ? "1px solid #ded3f4" : "1px solid #fed7aa",
              }}
            >
              収支 {formatYen(profitLoss)}
            </span>
          )}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
        <button
          type="button"
          onClick={() => openPredictionPageForVenue(race.venue)}
          style={{
            ...primaryButtonStyle,
            width: "100%",
            border: "none",
            cursor: "pointer",
          }}
        >
          予想を見る
        </button>

        <a href="#races-page" style={{ ...lightButtonStyle, width: "100%" }}>
          レース内容
        </a>
      </div>
    </article>
  );
}

export default function MobileDashboardPage() {
  const [todayPredictionFeed, setTodayPredictionFeed] = useState<PredictionTodayFeed | null>(null);
  const [predictionResultMap, setPredictionResultMap] = useState<PredictionResultMap>(() => loadStoredPredictionResults());
  const [feedStatus, setFeedStatus] = useState<"loading" | "ready" | "error">("loading");

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
    const refreshResults = () => {
      setPredictionResultMap(loadStoredPredictionResults());
    };

    const handleStorage = (event: StorageEvent) => {
      if (!event.key || event.key === PREDICTION_RESULT_STORAGE_KEY) {
        refreshResults();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshResults();
      }
    };

    window.addEventListener("storage", handleStorage);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("storage", handleStorage);
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
  const totalRaceCount = todayPredictionFeed?.venues.reduce((sum, venue) => sum + venue.races.length, 0) ?? 0;
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

  return (
    <main style={mobilePageShellStyle}>
      <div style={mobileContentStyle}>
        <section style={{ ...mobileCardStyle, padding: "20px 18px" }}>
          <div style={{ display: "grid", gap: "12px" }}>
            <p style={eyebrowStyle}>KURARI MOBILE</p>

            <div style={{ display: "grid", gap: "8px" }}>
              <h1
                style={{
                  margin: 0,
                  fontSize: "30px",
                  lineHeight: 1.18,
                  fontWeight: 950,
                  letterSpacing: "-0.04em",
                  color: "#081224",
                }}
              >
                今日の競輪チェック
              </h1>

              <p style={mutedTextStyle}>
                今日の開催・予想・結果・的中状況を、携帯で見やすい形にまとめた専用ページです。
              </p>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: "8px",
              }}
            >
              <a href="#prediction-page" style={{ ...primaryButtonStyle, width: "100%" }}>
                Prediction
              </a>
              <a href="#races-page" style={{ ...lightButtonStyle, width: "100%" }}>
                Races
              </a>
              <a href="#calendar" style={{ ...lightButtonStyle, width: "100%" }}>
                Calendar
              </a>
              <a href="#top" style={{ ...lightButtonStyle, width: "100%" }}>
                PC Top
              </a>
            </div>
          </div>
        </section>

        <section style={mobileCardStyle}>
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

        <section style={mobileCardStyle}>
          <div style={{ display: "grid", gap: "12px" }}>
            <div style={{ display: "grid", gap: "5px" }}>
              <p style={eyebrowStyle}>TODAY RACES</p>
              <h2 style={sectionTitleStyle}>今日の開催レース</h2>
              <p style={mutedTextStyle}>
                予想を見る場合は各会場カードの「予想を見る」から、詳細確認は「レース内容」から進めます。
              </p>
            </div>

            <div style={{ display: "grid", gap: "12px" }}>
              {dashboardTodayRaces.length > 0 ? (
                dashboardTodayRaces.map((race) => {
                  const venueKey = normalizePredictionVenueName(race.venue);
                  const predictionVenue = predictionVenueMap.get(venueKey);
                  const venueSummary = todayVenueSummaryMap[venueKey];

                  return (
                    <MobileVenueCard
                      key={race.id}
                      race={race}
                      predictionVenue={predictionVenue}
                      savedRaceCount={venueSummary?.savedRaceCount}
                      profitLoss={venueSummary?.profitLoss}
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

        <section style={mobileCardStyle}>
          <div style={{ display: "grid", gap: "12px" }}>
            <div style={{ display: "grid", gap: "5px" }}>
              <p style={eyebrowStyle}>SHORTCUTS</p>
              <h2 style={sectionTitleStyle}>よく使うページ</h2>
            </div>

            <div style={{ display: "grid", gap: "8px" }}>
              <a href="#prediction-page" style={{ ...primaryButtonStyle, width: "100%" }}>
                予想・保存済み予想を見る
              </a>
              <a href="#races-page" style={{ ...lightButtonStyle, width: "100%" }}>
                出走表・結果・払戻を見る
              </a>
              <a href="#calendar" style={{ ...lightButtonStyle, width: "100%" }}>
                開催カレンダーを見る
              </a>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}