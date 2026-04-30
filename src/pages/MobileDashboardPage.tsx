import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  TODAY,
  PREDICTION_RESULT_STORAGE_KEY,
  PREDICTION_SLOT_STORAGE_KEY,
  PREDICTION_TODAY_DATA_URL,
  findPredictionSlotRecord,
  getGradeBadgeTone,
  getPredictionResultAggregate,
  getSessionLabel,
  loadStoredPredictionResults,
  loadStoredPredictionSlots,
  mergeTodayRaceCardItems,
  normalizePredictionVenueName,
  todayRaces,
  type DashboardTodayRaceCard,
  type PredictionRaceItem,
  type PredictionResultMap,
  type PredictionSlotMap,
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

const mobileGlassPanelStyle: CSSProperties = {
  borderRadius: "24px",
  background: "linear-gradient(135deg, rgba(255,255,255,0.92) 0%, rgba(248,243,255,0.96) 100%)",
  border: "1px solid rgba(222, 211, 244, 0.95)",
  boxShadow: "0 14px 30px rgba(122, 103, 184, 0.08)",
  boxSizing: "border-box",
  minWidth: 0,
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
    <section id="mobile-hit-log" style={{ ...mobileCardStyle, overflow: "hidden" }}>
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
            padding: "12px 0",
            position: "relative",
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
                  color: hasHits ? "#705eb0" : "#64748b",
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
  isOpen,
  onToggle,
}: {
  race: DashboardTodayRaceCard;
  predictionVenue?: PredictionVenueItem;
  savedRaceCount?: number;
  profitLoss?: number;
  predictionResultMap: PredictionResultMap;
  predictionSlotMap: PredictionSlotMap;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const gradeTone = getGradeBadgeTone(race.displayGradeLabel ?? race.grade);
  const venueResultLabel = getVenueResultLabel(predictionVenue);
  const raceCountLabel = getVenueRaceCountLabel(predictionVenue);
  const firstRaceTimeLabel = getFirstRaceTimeLabel(predictionVenue);
  const normalizedVenue = normalizePredictionVenueName(race.venue);
  const venueRaceRows = predictionVenue?.races ?? [];
  const savedResultsForVenue = Object.values(predictionResultMap).filter(
    (item) =>
      item.date === TODAY &&
      normalizePredictionVenueName(item.venue) === normalizedVenue
  );

  const getSavedResultForRace = (raceNumber: number) =>
    savedResultsForVenue.find((item) => item.raceNumber === raceNumber);

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

      <div
        style={{
          ...mobileGlassPanelStyle,
          padding: "12px",
          display: "grid",
          gap: "10px",
        }}
      >
        <button
          type="button"
          onClick={onToggle}
          style={{
            width: "100%",
            minHeight: "42px",
            borderRadius: "9999px",
            border: "1px solid #ded3f4",
            background: isOpen
              ? "linear-gradient(135deg, #f4effc 0%, #ffffff 100%)"
              : "linear-gradient(135deg, #081224 0%, #162745 100%)",
            color: isOpen ? "#6f5aa9" : "#ffffff",
            fontSize: "12px",
            fontWeight: 950,
            letterSpacing: "0.04em",
            cursor: "pointer",
            boxShadow: isOpen
              ? "0 10px 20px rgba(122, 103, 184, 0.07)"
              : "0 12px 24px rgba(8, 18, 36, 0.14)",
          }}
        >
          {isOpen ? "レース一覧を閉じる" : "レース一覧を開く"}
        </button>

        {isOpen && (
          <div style={{ display: "grid", gap: "8px" }}>
            {venueRaceRows.length > 0 ? (
              venueRaceRows.map((venueRace) => {
                const resultTone = getMobileRaceResultTone(venueRace);
                const savedResult = getSavedResultForRace(venueRace.raceNo);
                const savedSlotLookup = findPredictionSlotRecord(
                  predictionSlotMap,
                  TODAY,
                  predictionVenue,
                  venueRace
                );
                const savedPredictionText = clipMobilePredictionText(savedSlotLookup.record?.predictionText);
                const hasSavedPrediction = Boolean(savedPredictionText);
                const savedTone = getMobileSavedResultTone(savedResult?.hitStatus, hasSavedPrediction);
                const resultOrderText =
                  venueRace.result?.finishOrder?.length
                    ? venueRace.result.finishOrder.join("-")
                    : savedResult?.resultOrder || "";

                return (
                  <div
                    key={`${normalizedVenue}-${venueRace.raceNo}`}
                    style={{
                      borderRadius: "18px",
                      padding: "11px 12px",
                      background: "rgba(255,255,255,0.88)",
                      border: "1px solid #ece4f6",
                      display: "grid",
                      gap: "8px",
                      minWidth: 0,
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
                      <div style={{ minWidth: 0, display: "grid", gap: "3px" }}>
                        <div
                          style={{
                            fontSize: "15px",
                            fontWeight: 950,
                            color: "#081224",
                            letterSpacing: "-0.02em",
                          }}
                        >
                          {venueRace.raceNo}R
                          <span
                            style={{
                              marginLeft: "8px",
                              fontSize: "12px",
                              fontWeight: 850,
                              color: "#64748b",
                            }}
                          >
                            {venueRace.time ?? "時刻未取得"}
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
                          {venueRace.title ?? `${race.venue} ${venueRace.raceNo}R`}
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
                            background: resultTone.background,
                            color: resultTone.color,
                            border: `1px solid ${resultTone.border}`,
                          }}
                        >
                          {getMobileRaceResultLabel(venueRace)}
                        </span>

                        <span
                          style={{
                            borderRadius: "9999px",
                            padding: "4px 8px",
                            fontSize: "10px",
                            fontWeight: 900,
                            background: savedTone.background,
                            color: savedTone.color,
                            border: `1px solid ${savedTone.border}`,
                          }}
                        >
                          {savedTone.label}
                        </span>
                      </div>
                    </div>

                    {savedPredictionText && (
                      <div
                        style={{
                          borderRadius: "14px",
                          padding: "10px",
                          background: "linear-gradient(180deg, #ffffff 0%, #faf7fd 100%)",
                          border: "1px solid #e7dbf7",
                          display: "grid",
                          gap: "6px",
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
                        <pre
                          style={{
                            margin: 0,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            color: "#334155",
                            fontSize: "11px",
                            lineHeight: 1.65,
                            fontFamily: "inherit",
                            fontWeight: 750,
                          }}
                        >
                          {savedPredictionText}
                        </pre>
                      </div>
                    )}

                    {(savedResult || venueRace.result) && (
                      <div
                        style={{
                          borderRadius: "14px",
                          padding: "9px 10px",
                          background: "#faf8fd",
                          border: "1px solid #ede7f5",
                          display: "grid",
                          gap: "7px",
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
                          RESULT CHECK
                        </div>

                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                            gap: "6px",
                            fontSize: "11px",
                            fontWeight: 850,
                            color: "#334155",
                          }}
                        >
                          <span>着順 {resultOrderText || "—"}</span>
                          <span>投資 {formatYen(savedResult?.investment)}</span>
                          <span>払戻 {formatYen(savedResult?.payout)}</span>
                          <span>収支 {formatYen(savedResult?.profitLoss)}</span>
                          <span>回収 {formatPercent(savedResult?.roi)}</span>
                          <span>決まり手 {venueRace.result?.kimarite ?? "—"}</span>
                        </div>

                        {(venueRace.result?.payout3tan || venueRace.result?.payout2tan) && (
                          <div
                            style={{
                              display: "grid",
                              gap: "5px",
                              borderTop: "1px solid #ebe3f3",
                              paddingTop: "7px",
                              color: "#475569",
                              fontSize: "11px",
                              lineHeight: 1.6,
                              fontWeight: 800,
                            }}
                          >
                            {venueRace.result?.payout3tan && (
                              <span>
                                3連単 {venueRace.result.payout3tan.combination} / {venueRace.result.payout3tan.payout}
                              </span>
                            )}
                            {venueRace.result?.payout2tan && (
                              <span>
                                2車単 {venueRace.result.payout2tan.combination} / {venueRace.result.payout2tan.payout}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
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
  const [todayPredictionFeed, setTodayPredictionFeed] = useState<PredictionTodayFeed | null>(null);
  const [predictionResultMap, setPredictionResultMap] = useState<PredictionResultMap>(() => loadStoredPredictionResults());
  const [predictionSlotMap, setPredictionSlotMap] = useState<PredictionSlotMap>(() => loadStoredPredictionSlots());
  const [feedStatus, setFeedStatus] = useState<"loading" | "ready" | "error">("loading");
  const [openVenueKey, setOpenVenueKey] = useState<string | null>(null);

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
    const refreshStoredPredictionData = () => {
      setPredictionResultMap(loadStoredPredictionResults());
      setPredictionSlotMap(loadStoredPredictionSlots());
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
              <a href="#mobile-today-races" style={{ ...primaryButtonStyle, width: "100%" }}>
                Today
              </a>
              <a href="#mobile-results" style={{ ...lightButtonStyle, width: "100%" }}>
                Results
              </a>
              <a href="#mobile-hit-log" style={{ ...lightButtonStyle, width: "100%" }}>
                Hit Log
              </a>
              <a href="#mobile-calendar" style={{ ...lightButtonStyle, width: "100%" }}>
                Calendar
              </a>
            </div>
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
              <p style={eyebrowStyle}>TODAY RACES</p>
              <h2 style={sectionTitleStyle}>今日の開催レース</h2>
              <p style={mutedTextStyle}>
                今日の開催をスマホ用カードで確認します。次の修正で、各会場カード内にレース一覧・結果・保存済み予想を展開します。
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
                      predictionResultMap={predictionResultMap}
                      predictionSlotMap={predictionSlotMap}
                      isOpen={openVenueKey === venueKey}
                      onToggle={() => {
                        setOpenVenueKey((current) => (current === venueKey ? null : venueKey));
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

        <section id="mobile-calendar" style={mobileCardStyle}>
          <div style={{ display: "grid", gap: "12px" }}>
            <div style={{ display: "grid", gap: "5px" }}>
              <p style={eyebrowStyle}>MOBILE CALENDAR</p>
              <h2 style={sectionTitleStyle}>簡易カレンダー</h2>
              <p style={mutedTextStyle}>
                ここには次の修正で、今日・明日・今週のGレースをスマホ用カードとして表示します。
                PC版の大きなカレンダーへ飛ばさず、このページ内で軽く確認できる形にします。
              </p>
            </div>

            <div
              style={{
                ...mobileGlassPanelStyle,
                padding: "14px",
                display: "grid",
                gap: "8px",
              }}
            >
              <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.16em", color: "#8c63c7" }}>
                NEXT STEP
              </div>
              <p style={{ ...mutedTextStyle, fontSize: "12px" }}>
                次に、会場カードをタップした時のレース一覧展開と、簡易カレンダーの今日・明日・今週表示を追加します。
              </p>
            </div>

            <a href="#top" style={{ ...lightButtonStyle, width: "100%" }}>
              PC版トップへ戻る
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}