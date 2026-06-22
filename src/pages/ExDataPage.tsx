import { useEffect, useMemo, useState } from "react";
import {
  formatKurariExMetric,
  formatKurariExRiderMetric,
  getKurariExRiderQualityLabel,
  loadKurariExExactInitialData,
  loadKurariExInitialData,
  loadKurariExMatchupExactByFile,
  loadKurariExMatchupExactInitialData,
  loadKurariExRiderExactByFile,
  loadKurariExRiderExactInitialData,
  loadKurariExVenueBundle,
  loadKurariExVenueExact,
} from "../lib/kurariExData";
import type {
  KurariExExactInitialData,
  KurariExMetric,
  KurariExInitialData,
  KurariExMatchupComparableStats,
  KurariExMatchupExact,
  KurariExMatchupExactIndexItem,
  KurariExMatchupExactInitialData,
  KurariExVenueBundle,
  KurariExVenueExact,
  KurariExRiderAggregate,
  KurariExRiderExact,
  KurariExRiderExactIndexItem,
  KurariExRiderExactInitialData,
  KurariExRiderQuality,
} from "../types/kurariEx";
import { SiteHeader, useIsMobile } from "./PageImplementations";

const serif = '"Yu Mincho", "Hiragino Mincho ProN", "Times New Roman", serif';
const sans = '"Helvetica Neue", Arial, "Hiragino Sans", "Yu Gothic", Meiryo, sans-serif';

function formatBytes(bytes?: number | null) {
  if (!Number.isFinite(bytes)) return "--";
  if ((bytes ?? 0) < 1000) return `${bytes} B`;
  if ((bytes ?? 0) < 1000 * 1000) return `${((bytes ?? 0) / 1000).toFixed(1)} KB`;
  return `${((bytes ?? 0) / 1000 / 1000).toFixed(2)} MB`;
}

function formatDate(value?: string | null) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function valueText(value?: number | null, suffix = "") {
  return Number.isFinite(value) ? `${Number(value).toLocaleString("ja-JP")}${suffix}` : "--";
}

function formatMatchupRate(value?: number | null) {
  return Number.isFinite(value) ? `${Number(value).toFixed(1)}%` : "未比較";
}

function formatMatchupLineStats(stats: KurariExMatchupComparableStats) {
  if (!stats.safeComparableRaceCount) return "比較なし";
  return `${formatMatchupRate(stats.selfAheadRate)}（${stats.selfAheadCount}-${stats.opponentAheadCount}）`;
}

function getMatchupQualityLabel(quality?: string | null) {
  const labels: Record<string, string> = {
    sufficient: "SUFFICIENT",
    "low-sample": "LOW SAMPLE",
    partial: "PARTIAL",
  };
  return quality ? labels[quality] ?? quality.toUpperCase() : "UNKNOWN";
}

function MetricCard({ label, value, note, warning }: {
  label: string;
  value: string;
  note?: string;
  warning?: boolean;
}) {
  return (
    <article className={`ex-metric-card${warning ? " is-warning" : ""}`}>
      <div className="ex-eyebrow">{label}</div>
      <div className="ex-metric-value">{value}</div>
      {note ? <div className="ex-muted">{note}</div> : null}
    </article>
  );
}

function SectionTitle({ eyebrow, title, lead }: { eyebrow: string; title: string; lead?: string }) {
  return (
    <div className="ex-section-title">
      <div className="ex-eyebrow">{eyebrow}</div>
      <h2>{title}</h2>
      {lead ? <p>{lead}</p> : null}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="ex-empty">{text}</div>;
}

function ExactMetricCard({ label, metric }: { label: string; metric?: KurariExMetric }) {
  if (!metric || metric.rate == null) return null;
  return (
    <article className="ex-metric-card">
      <div className="ex-eyebrow">{label}</div>
      <div className="ex-metric-value">{metric.rate.toFixed(1)}%</div>
      <div className="ex-muted">{metric.count.toLocaleString("ja-JP")} / {metric.total.toLocaleString("ja-JP")}</div>
      {metric.quality === "low-sample" || metric.total < 5 ? <span className="ex-low-sample">母数少</span> : null}
    </article>
  );
}

function exactCategoryLabel(category: string, key: string) {
  const labels: Record<string, Record<string, string>> = {
    "時間帯別": { morning: "モーニング", day: "デイ", night: "ナイター", midnight: "ミッド", unknown: "未取得" },
    "級班別": { a: "A級", s: "S級", a3: "A3", girls: "ガールズ", other: "その他" },
    "分戦数別": { "2": "2分戦", "3": "3分戦", "4+": "4分戦以上", unknown: "未取得" },
    "風速帯別": { "0-2": "0〜2m/s", "2-4": "2〜4m/s", "4+": "4m/s以上", unknown: "未取得" },
  };
  return labels[category]?.[key] ?? key;
}

function RiderQualityBadge({ quality }: { quality: KurariExRiderQuality }) {
  return (
    <span className={`ex-quality is-${quality}`}>
      {getKurariExRiderQualityLabel(quality)}
    </span>
  );
}

function RiderAggregateCards({ aggregate }: { aggregate: KurariExRiderAggregate }) {
  const values = [
    ["出走数", aggregate.starts == null ? "未取得" : valueText(aggregate.starts)],
    ["1着", valueText(aggregate.wins)],
    ["2着", valueText(aggregate.seconds)],
    ["3着", valueText(aggregate.thirds)],
    ["着外", aggregate.outside == null ? "未取得" : valueText(aggregate.outside)],
    ["勝率", formatKurariExRiderMetric(aggregate.winRate)],
    ["2連対率", formatKurariExRiderMetric(aggregate.top2Rate)],
    ["3着以内率", formatKurariExRiderMetric(aggregate.top3Rate)],
  ];
  return (
    <div className="ex-kpi-grid">
      {values.map(([label, value]) => <MetricCard key={label} label={label} value={value} />)}
    </div>
  );
}

function normalizeSearchText(value: string) {
  return value.normalize("NFKC").replace(/[\s\u3000]/gu, "").toLowerCase();
}

const timeslotLabels: Record<string, string> = {
  morning: "モーニング",
  day: "デイ",
  night: "ナイター",
  midnight: "ミッド",
  unknown: "未取得",
};

const SHB_NAME_INDEX_URL = "/data/analytics/kurari-ex/exact/shb-name-index.generated.json";
const VENUE_SCORE_ANALYSIS_URL = "/data/analytics/kurari-ex/analysis/venue-score.generated.json";
const RIDER_SCORE_ANALYSIS_URL = "/data/analytics/kurari-ex/analysis/rider-score.generated.json";
const RIDER_CATEGORY_ANALYSIS_URL = "/data/analytics/kurari-ex/analysis/rider-category-analysis.generated.json";
const TODAY_RECOMMENDATION_URL = "/data/analytics/kurari-ex/analysis/today-recommendation.generated.json";

type KurariExShbNameEntry = {
  nameKey: string;
  displayName: string;
  registrationNo: string | null;
  quality: string;
  count: number;
  bCount: number;
  sCount: number;
  sameSAndBCount: number;
  bTop3Rate: number | null;
  bOutsideRate: number | null;
  sameSAndBRate: number | null;
  venues?: string[];
  sampleRaceKeys?: string[];
};

type KurariExShbNameIndex = {
  summary: {
    nameKeyCount: number;
    sameDateCollisionNameKeyCount: number;
    qualityCounts: Record<string, number>;
  };
  items: KurariExShbNameEntry[];
};

function toExPublicPath(relativePath: string) {
  const base = import.meta.env.BASE_URL.replace(/\/$/u, "");
  const normalized = relativePath.startsWith("/") ? relativePath : `/${relativePath}`;
  return `${base}${normalized}`;
}

async function loadKurariExShbNameIndex(): Promise<KurariExShbNameIndex> {
  const response = await fetch(toExPublicPath(SHB_NAME_INDEX_URL), { cache: "no-store" });
  if (!response.ok) throw new Error(`KURARI EX SHB name index fetch failed: ${response.status}`);
  return response.json() as Promise<KurariExShbNameIndex>;
}

type KurariExVenueScoreItem = {
  rank: number;
  venueKey: string;
  venueName: string;
  score: number;
  rankHint: string;
  riskLevel: string;
  period?: { from?: string | null; to?: string | null };
  kpi?: {
    sourceCount?: number | null;
    raceCount?: number | null;
    trifectaHitRate?: number | null;
    recoveryRate?: number | null;
  };
  topInsights?: Array<{ tag: string; label: string; evidenceCount: number; confidence: string }>;
};

type KurariExVenueScoreAnalysis = {
  schemaVersion: number;
  generatedAt: string;
  source: string;
  sourceType: string;
  period: { from?: string | null; to?: string | null };
  venueCount: number;
  inclusionPolicy?: Record<string, string>;
  items: KurariExVenueScoreItem[];
};

async function loadKurariExVenueScoreAnalysis(): Promise<KurariExVenueScoreAnalysis> {
  const response = await fetch(toExPublicPath(VENUE_SCORE_ANALYSIS_URL), { cache: "no-store" });
  if (!response.ok) throw new Error("KURARI EX venue score analysis fetch failed: " + response.status);
  return response.json() as Promise<KurariExVenueScoreAnalysis>;
}
function formatShbRate(value?: number | null) {
  return Number.isFinite(value) ? `${Number(value).toFixed(1)}%` : "--";
}

type KurariExRiderScoreItem = {
  rank: number;
  registrationNo: string;
  name: string;
  nameKey?: string;
  prefecture?: string;
  class?: string;
  file?: string;
  score: number;
  rankHint: string;
  quality: string;
  dataStatus: string;
  coverage?: {
    observedRaceCount?: number | null;
    confirmedStartCount?: number | null;
    roleEligibleCount?: number | null;
    venueCount?: number | null;
  };
  rates?: {
    winRate?: number | null;
    top2Rate?: number | null;
    top3Rate?: number | null;
  };
  tags?: string[];
};

type KurariExRiderScoreAnalysis = {
  schemaVersion: number;
  generatedAt: string;
  source: string;
  sourceType: string;
  period: { from?: string | null; to?: string | null };
  riderCount: number;
  riderMasterCount: number;
  identityOnlyRiderCount: number;
  qualityCounts: Record<string, number>;
  inclusionPolicy?: Record<string, string>;
  items: KurariExRiderScoreItem[];
};

async function loadKurariExRiderScoreAnalysis(): Promise<KurariExRiderScoreAnalysis> {
  const response = await fetch(toExPublicPath(RIDER_SCORE_ANALYSIS_URL), { cache: "no-store" });
  if (!response.ok) throw new Error("KURARI EX rider score analysis fetch failed: " + response.status);
  return response.json() as Promise<KurariExRiderScoreAnalysis>;
}

type KurariExRiderCategoryItem = {
  key: string;
  label: string;
  starts: number;
  wins: number;
  seconds: number;
  thirds: number;
  outside: number;
  winRate: number | null;
  top2Rate: number | null;
  top3Rate: number | null;
  quality: string;
};

type KurariExRiderCategoryDimension = {
  label: string;
  sourcePath: string;
  items: KurariExRiderCategoryItem[];
};

type KurariExRiderCategoryAnalysis = {
  schemaVersion: number;
  generatedAt: string;
  sourceType: string;
  sampleUnit: string;
  coverage: {
    riderFilesRead: number;
    riderFilesSkipped: number;
    confirmedStartCount: number;
  };
  dimensions: Record<string, KurariExRiderCategoryDimension>;
  unsupportedExactMetrics?: Array<{ label: string; status: string; reason: string }>;
};

async function loadKurariExRiderCategoryAnalysis(): Promise<KurariExRiderCategoryAnalysis> {
  const response = await fetch(toExPublicPath(RIDER_CATEGORY_ANALYSIS_URL), { cache: "no-store" });
  if (!response.ok) throw new Error("KURARI EX rider category analysis fetch failed: " + response.status);
  return response.json() as Promise<KurariExRiderCategoryAnalysis>;
}

type KurariExTodayVenue = {
  venueKey: string;
  venueName: string;
  score?: number | null;
  rankHint?: string | null;
  riskLevel?: string | null;
  raceCount?: number | null;
  recoveryRate?: number | null;
  trifectaHitRate?: number | null;
  sourceCount?: number | null;
  memo?: string | null;
  actions?: Array<{ priority?: number | null; text: string; sourceType?: string | null }>;
  tags?: Array<{ tag: string; label: string; evidenceCount?: number | null; confidence?: string | null }>;
};

type KurariExTodayRider = {
  rank?: number | null;
  registrationNo: string;
  name: string;
  prefecture?: string | null;
  class?: string | null;
  score?: number | null;
  rankHint?: string | null;
  confirmedStartCount?: number | null;
  winRate?: number | null;
  top2Rate?: number | null;
  top3Rate?: number | null;
  tags?: string[];
  memo?: string | null;
};

type KurariExTodayRecommendation = {
  schemaVersion: number;
  generatedAt: string;
  source: string;
  sourceType: string;
  period?: { from?: string | null; to?: string | null };
  sourceStatus?: {
    inputFileCount?: number | null;
    predictionFileCount?: number | null;
    resultFileCount?: number | null;
    summaryFileCount?: number | null;
    completeTripletCount?: number | null;
    venueCount?: number | null;
    riderCount?: number | null;
  };
  sections: {
    battleVenues: KurariExTodayVenue[];
    thirdGuardVenues: KurariExTodayVenue[];
    windCautionVenues: KurariExTodayVenue[];
    lowSampleVenues: KurariExTodayVenue[];
    topRiders: KurariExTodayRider[];
    globalTags: Array<{ tag: string; label: string; venueCount?: number | null; evidenceCount?: number | null; highConfidenceVenueCount?: number | null }>;
    predictionMemo: string[];
  };
};

async function loadKurariExTodayRecommendation(): Promise<KurariExTodayRecommendation> {
  const response = await fetch(toExPublicPath(TODAY_RECOMMENDATION_URL), { cache: "no-store" });
  if (!response.ok) throw new Error("KURARI EX today recommendation fetch failed: " + response.status);
  return response.json() as Promise<KurariExTodayRecommendation>;
}
function formatShbNameQuality(value?: string | null) {
  const labels: Record<string, string> = {
    "registration-resolved": "登録番号解決",
    "name-daily-safe": "名前安全",
    "name-collision-risk": "名前衝突注意",
  };
  return value ? labels[value] ?? value : "--";
}

function RiderDecisionMemo({ rider, shb }: { rider: KurariExRiderExact; shb?: KurariExShbNameEntry }) {
  const starts = rider.coverage.confirmedStartCount;
  const roleEligible = rider.coverage.roleEligibleCount;
  const usableNotes = rider.quality === "identity-only"
    ? ["登録番号と選手情報のみ。買い目根拠ではなく、出走確認用として扱う。"]
    : [
        starts >= 10 ? "確認出走10R以上。選手傾向の比較材料として使いやすい。" : starts >= 5 ? "確認出走5R以上。展開判断の補助として使える。" : "母数少。強い根拠にはせず、参考扱い。",
        "勝率 " + formatKurariExRiderMetric(rider.overall.winRate) + " / 2連対率 " + formatKurariExRiderMetric(rider.overall.top2Rate) + " / 3着以内率 " + formatKurariExRiderMetric(rider.overall.top3Rate),
      ];
  const cautionNotes = [
    starts < 5 ? "確認出走が5R未満。人気・格・並びと合わせて慎重に見る。" : "",
    roleEligible < 5 ? "役割解析の母数が少ないため、先行/番手/追込評価は固定しすぎない。" : "",
    rider.warnings.length ? "注意: " + rider.warnings[0] : "",
  ].filter(Boolean);
  const sampleNotes = [
    "確認出走 " + starts.toLocaleString("ja-JP") + "R",
    "役割解析 " + roleEligible.toLocaleString("ja-JP") + "R",
    "結果解析 " + rider.coverage.resultParsedCount.toLocaleString("ja-JP") + "R",
    "会場 " + rider.coverage.venueCount.toLocaleString("ja-JP") + "場",
  ];
  const shbNotes = shb
    ? [
        "SHB品質 " + formatShbNameQuality(shb.quality),
        "B側3着内率 " + formatShbRate(shb.bTop3Rate),
        "B側着外率 " + formatShbRate(shb.bOutsideRate),
        "S/B同日率 " + formatShbRate(shb.sameSAndBRate),
      ]
    : ["SHB名前指標はまだ未取得。"];

  return (
    <section className="ex-panel ex-section ex-guidance">
      <SectionTitle eyebrow="BETTING MEMO" title="買い目判断メモ" lead="選手を買い目に入れる前に見る実戦用の要約です。" />
      <div className="ex-note-grid">
        <article className="ex-note-card">
          <h4>使える根拠</h4>
          <ul>{usableNotes.map((note) => <li key={note}>{note}</li>)}</ul>
        </article>
        <article className="ex-note-card">
          <h4>注意点</h4>
          <ul>{(cautionNotes.length ? cautionNotes : ["大きな警告はありません。"]).map((note) => <li key={note}>{note}</li>)}</ul>
        </article>
        <article className="ex-note-card">
          <h4>母数</h4>
          <ul>{sampleNotes.map((note) => <li key={note}>{note}</li>)}</ul>
        </article>
        <article className="ex-note-card">
          <h4>SHB傾向</h4>
          <ul>{shbNotes.map((note) => <li key={note}>{note}</li>)}</ul>
        </article>
      </div>
    </section>
  );
}


export default function ExDataPage() {
  const isMobile = useIsMobile();
  const [initialData, setInitialData] = useState<KurariExInitialData | null>(null);
  const [initialStatus, setInitialStatus] = useState<"loading" | "ready" | "error">("loading");
  const [exactInitialData, setExactInitialData] = useState<KurariExExactInitialData | null>(null);
  const [exactInitialStatus, setExactInitialStatus] = useState<"loading" | "ready" | "error">("loading");
  const [activeView, setActiveView] = useState<"venue" | "player" | "matchup">("venue");
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [venueCache, setVenueCache] = useState<Record<string, KurariExVenueBundle>>({});
  const [venueStatus, setVenueStatus] = useState<Record<string, "loading" | "ready" | "error">>({});
  const [exactVenueCache, setExactVenueCache] = useState<Record<string, KurariExVenueExact>>({});
  const [exactVenueStatus, setExactVenueStatus] = useState<Record<string, "loading" | "ready" | "error">>({});
  const [riderInitialData, setRiderInitialData] = useState<KurariExRiderExactInitialData | null>(null);
  const [riderInitialStatus, setRiderInitialStatus] = useState<"loading" | "ready" | "error">("loading");
  const [riderQuery, setRiderQuery] = useState("");
  const [riderFilterMode, setRiderFilterMode] = useState<"all" | "practical" | "sample" | "identity">("all");
  const [selectedRiderNo, setSelectedRiderNo] = useState<string | null>(null);
  const [riderCache, setRiderCache] = useState<Record<string, KurariExRiderExact>>({});
  const [riderStatus, setRiderStatus] = useState<Record<string, "loading" | "ready" | "error">>({});
  const [matchupInitialData, setMatchupInitialData] = useState<KurariExMatchupExactInitialData | null>(null);
  const [matchupInitialStatus, setMatchupInitialStatus] = useState<"loading" | "ready" | "error">("loading");
  const [matchupQuery, setMatchupQuery] = useState("");
  const [selectedMatchupRiderNo, setSelectedMatchupRiderNo] = useState<string | null>(null);
  const [matchupFilterMode, setMatchupFilterMode] = useState<"all" | "advantage" | "danger" | "sample" | "strong" | "risk" | "sameLine" | "otherLine">("all");
  const [matchupCache, setMatchupCache] = useState<Record<string, KurariExMatchupExact>>({});
  const [matchupStatus, setMatchupStatus] = useState<Record<string, "loading" | "ready" | "error">>({});
  const [shbNameIndex, setShbNameIndex] = useState<KurariExShbNameIndex | null>(null);
  const [shbNameStatus, setShbNameStatus] = useState<"loading" | "ready" | "error">("loading");
  const [venueScoreAnalysis, setVenueScoreAnalysis] = useState<KurariExVenueScoreAnalysis | null>(null);
  const [venueScoreStatus, setVenueScoreStatus] = useState<"loading" | "ready" | "error">("loading");
  const [riderScoreAnalysis, setRiderScoreAnalysis] = useState<KurariExRiderScoreAnalysis | null>(null);
  const [riderScoreStatus, setRiderScoreStatus] = useState<"loading" | "ready" | "error">("loading");
  const [riderCategoryAnalysis, setRiderCategoryAnalysis] = useState<KurariExRiderCategoryAnalysis | null>(null);
  const [riderCategoryStatus, setRiderCategoryStatus] = useState<"loading" | "ready" | "error">("loading");
  const [todayRecommendation, setTodayRecommendation] = useState<KurariExTodayRecommendation | null>(null);
  const [todayRecommendationStatus, setTodayRecommendationStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;
    loadKurariExInitialData()
      .then((data) => {
        if (!active) return;
        setInitialData(data);
        setInitialStatus("ready");
      })
      .catch(() => {
        if (!active) return;
        setInitialStatus("error");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    loadKurariExRiderExactInitialData()
      .then((data) => {
        if (!active) return;
        setRiderInitialData(data);
        setRiderInitialStatus("ready");
      })
      .catch(() => {
        if (!active) return;
        setRiderInitialStatus("error");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    loadKurariExExactInitialData()
      .then((data) => {
        if (!active) return;
        setExactInitialData(data);
        setExactInitialStatus("ready");
      })
      .catch(() => {
        if (!active) return;
        setExactInitialStatus("error");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    loadKurariExMatchupExactInitialData()
      .then((data) => {
        if (!active) return;
        setMatchupInitialData(data);
        setMatchupInitialStatus("ready");
      })
      .catch(() => {
        if (!active) return;
        setMatchupInitialStatus("error");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    loadKurariExShbNameIndex()
      .then((data) => {
        if (!active) return;
        setShbNameIndex(data);
        setShbNameStatus("ready");
      })
      .catch(() => {
        if (!active) return;
        setShbNameStatus("error");
      });
    return () => {
      active = false;
    };
  }, []);


  useEffect(() => {
    let active = true;
    loadKurariExVenueScoreAnalysis()
      .then((data) => {
        if (!active) return;
        setVenueScoreAnalysis(data);
        setVenueScoreStatus("ready");
      })
      .catch(() => {
        if (!active) return;
        setVenueScoreStatus("error");
      });
    return () => {
      active = false;
    };
  }, []);


  useEffect(() => {
    let active = true;
    loadKurariExTodayRecommendation()
      .then((data) => {
        if (!active) return;
        setTodayRecommendation(data);
        setTodayRecommendationStatus("ready");
      })
      .catch(() => {
        if (!active) return;
        setTodayRecommendationStatus("error");
      });
    return () => {
      active = false;
    };
  }, []);


  const allVenues = useMemo(() => {
    const venues = new Map<string, { venueKey: string; venueName: string }>();
    for (const item of initialData?.venues ?? []) venues.set(item.venueKey, item);
    for (const item of exactInitialData?.venues ?? []) {
      if (!venues.has(item.venueKey)) venues.set(item.venueKey, item);
    }
    return [...venues.values()].sort((left, right) => left.venueName.localeCompare(right.venueName, "ja"));
  }, [exactInitialData?.venues, initialData?.venues]);

  const selectVenue = (item: { venueKey: string; venueName: string }) => {
    setSelectedKey(item.venueKey);
    const seedItem = initialData?.venues.find((entry) => entry.venueKey === item.venueKey);
    const exactItem = exactInitialData?.venues.find((entry) => entry.venueKey === item.venueKey);
    if (seedItem && !venueCache[item.venueKey] && venueStatus[item.venueKey] !== "loading") {
      setVenueStatus((current) => ({ ...current, [item.venueKey]: "loading" }));
      loadKurariExVenueBundle(seedItem)
        .then((bundle) => {
          setVenueCache((current) => ({ ...current, [item.venueKey]: bundle }));
          setVenueStatus((current) => ({ ...current, [item.venueKey]: "ready" }));
        })
        .catch(() => {
          setVenueStatus((current) => ({ ...current, [item.venueKey]: "error" }));
        });
    }
    if (exactItem && !exactVenueCache[item.venueKey] && exactVenueStatus[item.venueKey] !== "loading") {
      setExactVenueStatus((current) => ({ ...current, [item.venueKey]: "loading" }));
      loadKurariExVenueExact(exactItem)
        .then((exact) => {
          setExactVenueCache((current) => ({ ...current, [item.venueKey]: exact }));
          setExactVenueStatus((current) => ({ ...current, [item.venueKey]: "ready" }));
        })
        .catch(() => {
          setExactVenueStatus((current) => ({ ...current, [item.venueKey]: "error" }));
        });
    }
  };

  const filteredVenues = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return allVenues;
    return allVenues.filter((item) =>
      item.venueName.includes(query.trim()) || item.venueKey.includes(normalized)
    );
  }, [allVenues, query]);

  useEffect(() => {
    let active = true;
    loadKurariExRiderScoreAnalysis()
      .then((data) => {
        if (!active) return;
        setRiderScoreAnalysis(data);
        setRiderScoreStatus("ready");
      })
      .catch(() => {
        if (!active) return;
        setRiderScoreStatus("error");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    loadKurariExRiderCategoryAnalysis()
      .then((data) => {
        if (!active) return;
        setRiderCategoryAnalysis(data);
        setRiderCategoryStatus("ready");
      })
      .catch(() => {
        if (!active) return;
        setRiderCategoryStatus("error");
      });
    return () => {
      active = false;
    };
  }, []);

  const riderScoreItems = useMemo(() => riderScoreAnalysis?.items ?? [], [riderScoreAnalysis]);
  const topRiderScoreItems = useMemo(() => riderScoreItems.slice(0, 30), [riderScoreItems]);
  const riderScoreByRegistrationNo = useMemo(
    () => new Map(riderScoreItems.map((item) => [item.registrationNo, item])),
    [riderScoreItems],
  );


  const filteredRiders = useMemo(() => {
    const normalized = normalizeSearchText(riderQuery);
    return (riderInitialData?.index.items ?? [])
      .filter((item) => {
        const matchesQuery = !normalized || [item.name, item.nameKey, item.registrationNo, item.prefecture, item.class]
          .some((value) => normalizeSearchText(value).includes(normalized));
        if (!matchesQuery) return false;
        if (riderFilterMode === "practical") return item.quality !== "identity-only" && item.confirmedStartCount >= 5;
        if (riderFilterMode === "sample") return item.confirmedStartCount >= 10;
        if (riderFilterMode === "identity") return item.quality === "identity-only";
        return true;
      })
      .sort((left, right) => {
        if (riderFilterMode === "identity") return left.name.localeCompare(right.name, "ja");
        return right.confirmedStartCount - left.confirmedStartCount || right.roleEligibleCount - left.roleEligibleCount || left.name.localeCompare(right.name, "ja");
      });
  }, [riderFilterMode, riderInitialData?.index.items, riderQuery]);

  const selectRider = (item: KurariExRiderExactIndexItem) => {
    setSelectedRiderNo(item.registrationNo);
    if (riderCache[item.registrationNo] || riderStatus[item.registrationNo] === "loading") return;
    setRiderStatus((current) => ({ ...current, [item.registrationNo]: "loading" }));
    loadKurariExRiderExactByFile(item.file)
      .then((rider) => {
        setRiderCache((current) => ({ ...current, [item.registrationNo]: rider }));
        setRiderStatus((current) => ({ ...current, [item.registrationNo]: "ready" }));
      })
      .catch(() => {
        setRiderStatus((current) => ({ ...current, [item.registrationNo]: "error" }));
      });
  };

  const filteredMatchupRiders = useMemo(() => {
    const normalized = normalizeSearchText(matchupQuery);
    const items = matchupInitialData?.index.items ?? [];
    if (!normalized) return items;
    return items.filter((item) => (
      [item.name, item.registrationNo, item.quality]
        .some((value) => normalizeSearchText(value).includes(normalized))
    ));
  }, [matchupInitialData?.index.items, matchupQuery]);

  const selectMatchupRider = (item: KurariExMatchupExactIndexItem) => {
    setSelectedMatchupRiderNo(item.registrationNo);
    if (matchupCache[item.registrationNo] || matchupStatus[item.registrationNo] === "loading") return;
    setMatchupStatus((current) => ({ ...current, [item.registrationNo]: "loading" }));
    loadKurariExMatchupExactByFile(item.file)
      .then((matchup) => {
        setMatchupCache((current) => ({ ...current, [item.registrationNo]: matchup }));
        setMatchupStatus((current) => ({ ...current, [item.registrationNo]: "ready" }));
      })
      .catch(() => {
        setMatchupStatus((current) => ({ ...current, [item.registrationNo]: "error" }));
      });
  };

  const venueScoreItems = useMemo(() => venueScoreAnalysis?.items ?? [], [venueScoreAnalysis]);
  const sampleShortVenueCount = useMemo(
    () => venueScoreItems.filter((item) => item.riskLevel === "sample-short").length,
    [venueScoreItems],
  );


  const selectedBundle = selectedKey ? venueCache[selectedKey] : null;
  const selectedLoadStatus = selectedKey ? venueStatus[selectedKey] : undefined;
  const selectedExact = selectedKey ? exactVenueCache[selectedKey] : null;
  const selectedExactLoadStatus = selectedKey ? exactVenueStatus[selectedKey] : undefined;
  const status = initialData?.status;
  const global = initialData?.globalKpi.kpi;
  const exactStatus = exactInitialData?.status;
  const exactGlobal = exactInitialData?.globalKpi;
  const selectedRiderItem = riderInitialData?.index.items.find(
    (item) => item.registrationNo === selectedRiderNo,
  );
  const selectedRider = selectedRiderNo ? riderCache[selectedRiderNo] : null;
  const selectedRiderStatus = selectedRiderNo ? riderStatus[selectedRiderNo] : undefined;
  const selectedRiderScore = selectedRiderNo ? riderScoreByRegistrationNo.get(selectedRiderNo) : undefined;
  const shbNameByNameKey = useMemo(
    () => new Map((shbNameIndex?.items ?? []).map((item) => [item.nameKey, item])),
    [shbNameIndex],
  );
  const selectedRiderShb = selectedRider?.nameKey
    ? shbNameByNameKey.get(selectedRider.nameKey)
    : undefined;
  const matchupSummary = matchupInitialData?.status;
  const selectedMatchupItem = matchupInitialData?.index.items.find(
    (item) => item.registrationNo === selectedMatchupRiderNo,
  );
  const selectedMatchup = selectedMatchupRiderNo ? matchupCache[selectedMatchupRiderNo] : null;
  const selectedMatchupStatus = selectedMatchupRiderNo ? matchupStatus[selectedMatchupRiderNo] : undefined;
  const selectedRiderMatchupIndexItem = selectedRiderNo
    ? matchupInitialData?.index.items.find((item) => item.registrationNo === selectedRiderNo)
    : undefined;
  const openSelectedRiderMatchup = () => {
    if (!selectedRiderNo) return;

    setActiveView("matchup");

    const fallbackQuery = selectedRider?.name ?? selectedRiderItem?.name ?? selectedRiderNo;
    const matchupItem = matchupInitialData?.index.items.find((item) => item.registrationNo === selectedRiderNo);

    if (matchupItem) {
      setMatchupQuery("");
      selectMatchupRider(matchupItem);
      return;
    }

    setSelectedMatchupRiderNo(null);
    setMatchupQuery(fallbackQuery);
  };
  const selectedMatchupRows = [...(selectedMatchup?.matchups ?? [])]
    .filter((row) => {
      const selfAheadRate = row.selfAheadRate ?? null;
      if (matchupFilterMode === "advantage") {
        return row.safeComparableRaceCount >= 2 && selfAheadRate !== null && selfAheadRate >= 60;
      }
      if (matchupFilterMode === "danger") {
        return row.safeComparableRaceCount >= 2 && selfAheadRate !== null && selfAheadRate <= 40;
      }
      if (matchupFilterMode === "sample") {
        return row.safeComparableRaceCount >= 5;
      }
      if (matchupFilterMode === "strong") {
        return row.safeComparableRaceCount >= 5 && selfAheadRate !== null && selfAheadRate >= 70;
      }
      if (matchupFilterMode === "risk") {
        return row.safeComparableRaceCount >= 5 && selfAheadRate !== null && selfAheadRate <= 30;
      }
      if (matchupFilterMode === "sameLine") {
        return row.sameLine.safeComparableRaceCount >= 2;
      }
      if (matchupFilterMode === "otherLine") {
        return row.otherLine.safeComparableRaceCount >= 2;
      }
      return true;
    })
    .sort((left, right) => {
      if (matchupFilterMode === "advantage") {
        return (right.selfAheadRate ?? -1) - (left.selfAheadRate ?? -1) || right.safeComparableRaceCount - left.safeComparableRaceCount || left.opponentName.localeCompare(right.opponentName, "ja");
      }
      if (matchupFilterMode === "danger") {
        return (left.selfAheadRate ?? 101) - (right.selfAheadRate ?? 101) || right.safeComparableRaceCount - left.safeComparableRaceCount || left.opponentName.localeCompare(right.opponentName, "ja");
      }
      if (matchupFilterMode === "strong") {
        return (right.selfAheadRate ?? -1) - (left.selfAheadRate ?? -1) || right.safeComparableRaceCount - left.safeComparableRaceCount || left.opponentName.localeCompare(right.opponentName, "ja");
      }
      if (matchupFilterMode === "risk") {
        return (left.selfAheadRate ?? 101) - (right.selfAheadRate ?? 101) || right.safeComparableRaceCount - left.safeComparableRaceCount || left.opponentName.localeCompare(right.opponentName, "ja");
      }
      if (matchupFilterMode === "sameLine") {
        return right.sameLine.safeComparableRaceCount - left.sameLine.safeComparableRaceCount || (right.sameLine.selfAheadRate ?? -1) - (left.sameLine.selfAheadRate ?? -1) || left.opponentName.localeCompare(right.opponentName, "ja");
      }
      if (matchupFilterMode === "otherLine") {
        return right.otherLine.safeComparableRaceCount - left.otherLine.safeComparableRaceCount || (right.otherLine.selfAheadRate ?? -1) - (left.otherLine.selfAheadRate ?? -1) || left.opponentName.localeCompare(right.opponentName, "ja");
      }
      return right.safeComparableRaceCount - left.safeComparableRaceCount || right.sharedRaceCount - left.sharedRaceCount || left.opponentName.localeCompare(right.opponentName, "ja");
    });
  const riderFilterOptions = [
    { key: "all" as const, label: "全て", note: "全公開選手" },
    { key: "practical" as const, label: "実戦候補", note: "確認出走5R以上かつ素材蓄積中を除外" },
    { key: "sample" as const, label: "母数あり", note: "確認出走10R以上" },
    { key: "identity" as const, label: "素材蓄積中", note: "登録番号・選手情報のみ" },
  ];
  const matchupFilterOptions = [
    { key: "all" as const, label: "全て", note: "全対戦" },
    { key: "advantage" as const, label: "得意相手", note: "自己先着60%以上" },
    { key: "danger" as const, label: "苦手相手", note: "自己先着40%以下" },
    { key: "sample" as const, label: "母数あり", note: "比較可能5R以上" },
    { key: "strong" as const, label: "強く出る相手", note: "比較可能5R以上かつ自己先着70%以上" },
    { key: "risk" as const, label: "危険相手", note: "比較可能5R以上かつ自己先着30%以下" },
    { key: "sameLine" as const, label: "同ライン多め", note: "同ライン比較2R以上" },
    { key: "otherLine" as const, label: "別線多め", note: "別線比較2R以上" },
  ];
  const sizeWarning = (status?.outputBytes ?? 0) > 20 * 1024 * 1024;
  const healthMetrics = [
    ["PERIOD", status ? `${status.dateFrom ?? "--"}〜${status.dateTo ?? "--"}` : "--", "source range"],
    ["INPUT FILES", valueText(status?.rawInputFileCount), "raw scan"],
    ["公開予測", valueText(status?.predictionFileCount), "classified"],
    ["公開実測", valueText(status?.resultFileCount), "classified"],
    ["SUMMARIES", valueText(status?.summaryFileCount), "SEED source"],
    ["VENUES", valueText(status?.venueCount), "generated"],
    ["COMPLETE", valueText(status?.completeTripletCount), "triplets"],
    ["PUBLIC EX SIZE", formatBytes(status?.outputBytes), sizeWarning ? "20MB超過" : "lightweight"],
    ["WARNINGS", valueText(status?.warningCount), `${valueText(status?.missingSummaryCount)} missing summary`],
  ] as const;

  return (
    <div className="ex-page">
      <SiteHeader activeKey="ex-data" />
      <style>{`
        .ex-page { min-height: 100vh; overflow-x: hidden; color: #172239; font-family: ${sans}; background:
          radial-gradient(circle at 7% 4%, rgba(205,190,255,.48), transparent 24%),
          radial-gradient(circle at 91% 12%, rgba(181,224,255,.44), transparent 25%),
          radial-gradient(circle at 52% 80%, rgba(195,245,225,.42), transparent 32%),
          linear-gradient(180deg, #f7f5ff 0%, #f5faff 45%, #f7fffb 100%); }
        .ex-main { width: ${isMobile ? "calc(100vw - 32px)" : "min(1760px, calc(100vw - 48px))"}; margin: 0 auto; padding: ${isMobile ? "24px 0 64px" : "42px 0 92px"}; display: grid; gap: 24px; }
        .ex-panel { border: 1px solid rgba(190,194,224,.62); border-radius: 30px; background: rgba(255,255,255,.78); box-shadow: 0 22px 55px rgba(82,74,135,.09); backdrop-filter: blur(18px); }
        .ex-hero { padding: ${isMobile ? "26px 22px" : "46px 48px"}; display: grid; grid-template-columns: ${isMobile ? "1fr" : "minmax(0,1.35fr) minmax(300px,.65fr)"}; gap: 28px; align-items: center; overflow: hidden; position: relative; }
        .ex-hero:after { content: ""; position: absolute; width: 360px; height: 360px; right: -90px; top: -170px; border-radius: 50%; background: linear-gradient(145deg, rgba(183,161,255,.42), rgba(153,219,255,.28)); }
        .ex-eyebrow { color: #7866b5; font-size: 10px; font-weight: 900; letter-spacing: .18em; line-height: 1.3; }
        .ex-hero h1 { margin: 10px 0 8px; font: 800 ${isMobile ? "42px" : "72px"}/.98 ${serif}; letter-spacing: -.045em; color: #172239; }
        .ex-hero h2 { margin: 0; font: 700 ${isMobile ? "20px" : "28px"}/1.4 ${serif}; color: #4c5871; }
        .ex-hero p { max-width: 760px; margin: 22px 0 0; color: #5a6880; font-size: ${isMobile ? "14px" : "17px"}; line-height: 2; font-weight: 650; }
        .ex-phase { position: relative; z-index: 1; padding: 24px; border-radius: 25px; border: 1px solid rgba(180,170,225,.6); background: linear-gradient(145deg, rgba(251,248,255,.96), rgba(238,248,255,.94), rgba(239,255,248,.9)); }
        .ex-phase strong { display: block; margin: 8px 0; font: 800 28px/1.2 ${serif}; color: #59499c; }
        .ex-section { padding: ${isMobile ? "22px 18px" : "30px"}; display: grid; gap: 22px; }
        .ex-section-title h2 { margin: 6px 0 0; font: 800 ${isMobile ? "27px" : "36px"}/1.15 ${serif}; color: #172239; }
        .ex-section-title p { margin: 8px 0 0; color: #718096; line-height: 1.7; }
        .ex-health-grid { display: grid; grid-template-columns: repeat(${isMobile ? 2 : 4}, minmax(0,1fr)); gap: 13px; }
        .ex-metric-card { min-width: 0; padding: 20px; border: 1px solid #e5e3f2; border-radius: 22px; background: linear-gradient(150deg,#fff,#f7f4ff 58%,#f2fbff); }
        .ex-metric-card.is-warning { border-color: #f0c9a7; background: #fff9f1; }
        .ex-metric-value { margin: 8px 0 4px; color: #172239; font: 850 ${isMobile ? "25px" : "32px"}/1 ${serif}; overflow-wrap: anywhere; }
        .ex-muted { color: #8590a3; font-size: 11px; font-weight: 700; line-height: 1.5; }
        .ex-legend { display: grid; grid-template-columns: repeat(${isMobile ? 1 : 4}, minmax(0,1fr)); gap: 14px; }
        .ex-legend article { padding: 20px; border-radius: 21px; border: 1px solid #e4e1ef; background: rgba(255,255,255,.8); }
        .ex-legend strong { display: block; margin-bottom: 8px; color: #6d58ad; letter-spacing: .12em; }
        .ex-legend p { margin: 0; color: #66758a; font-size: 13px; line-height: 1.75; }
        .ex-kpi-grid { display: grid; grid-template-columns: repeat(${isMobile ? 2 : 5}, minmax(0,1fr)); gap: 13px; }
        .ex-workspace { display: grid; grid-template-columns: ${isMobile ? "1fr" : "minmax(300px,.72fr) minmax(0,1.28fr)"}; gap: 22px; align-items: start; }
        .ex-search { width: 100%; box-sizing: border-box; border: 1px solid #dcd9eb; border-radius: 16px; padding: 13px 15px; background: rgba(255,255,255,.9); color: #26354d; font: 700 14px ${sans}; outline: none; }
        .ex-view-tabs { display: flex; gap: 10px; padding: 8px; width: fit-content; border: 1px solid #dedbea; border-radius: 18px; background: rgba(255,255,255,.72); }
        .ex-view-tab { cursor: pointer; border: 0; border-radius: 13px; padding: 11px 18px; background: transparent; color: #748096; font: 900 12px ${sans}; letter-spacing: .08em; }
        .ex-view-tab.is-active { color: #554294; background: linear-gradient(135deg,#eee7ff,#eaf8ff); box-shadow: 0 7px 18px rgba(92,73,150,.12); }
        .ex-venue-list { display: grid; gap: 9px; max-height: ${isMobile ? "none" : "720px"}; overflow-y: ${isMobile ? "visible" : "auto"}; padding-right: 4px; }
        .ex-venue-button { width: 100%; text-align: left; cursor: pointer; border: 1px solid #e2e1ec; border-radius: 18px; padding: 15px; background: rgba(255,255,255,.76); color: #233149; }
        .ex-venue-button:hover, .ex-venue-button.is-active { border-color: #aa9ad9; background: linear-gradient(135deg,#f6f0ff,#eef9ff); box-shadow: 0 10px 24px rgba(102,83,157,.1); }
        .ex-venue-button strong { display: block; font: 800 19px/1.2 ${serif}; }
        .ex-detail { display: grid; gap: 18px; min-width: 0; }
        .ex-detail-head { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; align-items: flex-start; }
        .ex-detail-head h3 { margin: 5px 0 0; font: 850 ${isMobile ? "32px" : "44px"}/1 ${serif}; }
        .ex-badges { display: flex; flex-wrap: wrap; gap: 8px; }
        .ex-badge { display: inline-flex; padding: 7px 10px; border-radius: 999px; background: #eee9fb; color: #6653a4; font-size: 10px; font-weight: 900; letter-spacing: .08em; }
        .ex-badge.is-exact { background: #e7f8f0; color: #276b59; }
        .ex-quality { display: inline-flex; padding: 6px 9px; border-radius: 999px; font-size: 9px; font-weight: 950; letter-spacing: .08em; }
        .ex-quality.is-complete { color: #23664c; background: #daf5e8; }
        .ex-quality.is-sufficient { color: #23664c; background: #daf5e8; }
        .ex-quality.is-partial { color: #315f91; background: #e1efff; }
        .ex-quality.is-low-sample { color: #925711; background: #fff0d3; }
        .ex-quality.is-identity-only { color: #687184; background: #eceef2; }
        .ex-sample-alert { padding: 18px; border: 1px solid #f0c98e; border-radius: 19px; background: #fff8e9; color: #78501d; line-height: 1.75; }
        .ex-sample-alert strong { display: block; margin-bottom: 5px; letter-spacing: .12em; }
        .ex-data-table { width: 100%; border-collapse: collapse; min-width: 580px; color: #526078; font-size: 12px; }
        .ex-data-table th, .ex-data-table td { padding: 10px 9px; border-bottom: 1px solid #edf0f4; text-align: left; white-space: nowrap; }
        .ex-data-table th { color: #7765ae; font-size: 10px; letter-spacing: .08em; }
        .ex-table-wrap { max-width: 100%; overflow-x: auto; border: 1px solid #e4e7ee; border-radius: 18px; background: rgba(255,255,255,.7); }
        .ex-low-sample { display: inline-flex; margin-top: 8px; padding: 4px 7px; border-radius: 999px; background: #fff2dc; color: #985b15; font-size: 9px; font-weight: 900; }
        .ex-subsection { display: grid; gap: 13px; padding-top: 4px; }
        .ex-category-grid { display: grid; grid-template-columns: repeat(${isMobile ? 1 : 2}, minmax(0,1fr)); gap: 12px; }
        .ex-category-card { padding: 18px; border: 1px solid #e1e8ee; border-radius: 20px; background: linear-gradient(145deg,#fff,#f5fbf8); }
        .ex-category-card h4 { margin: 0 0 12px; color: #276b59; font-size: 12px; letter-spacing: .1em; }
        .ex-category-row { display: flex; justify-content: space-between; gap: 12px; padding: 7px 0; border-top: 1px solid #edf1f3; color: #59677d; font-size: 12px; }
        .ex-insights { display: grid; grid-template-columns: repeat(${isMobile ? 1 : 2}, minmax(0,1fr)); gap: 12px; }
        .ex-insight { padding: 17px; border: 1px solid #e5e3ef; border-radius: 19px; background: rgba(255,255,255,.85); }
        .ex-insight strong { display: block; color: #26344d; margin-bottom: 10px; }
        .ex-insight-meta { display: flex; gap: 7px; flex-wrap: wrap; color: #79859a; font-size: 11px; font-weight: 750; }
        .ex-note-grid { display: grid; grid-template-columns: repeat(${isMobile ? 1 : 3}, minmax(0,1fr)); gap: 12px; }
        .ex-note-card { border-radius: 20px; padding: 18px; border: 1px solid #e5e3ef; background: rgba(255,255,255,.82); min-width: 0; }
        .ex-note-card h4 { margin: 0 0 10px; color: #6451a1; font-size: 12px; letter-spacing: .12em; }
        .ex-note-card ul, .ex-guidance-list { margin: 0; padding-left: 20px; color: #59677d; line-height: 1.8; font-size: 13px; }
        .ex-guidance { border: 1px solid #dce9e4; background: linear-gradient(145deg,rgba(249,255,252,.96),rgba(240,249,255,.94)); }
        .ex-today { border-color: #d9e5ff; background: linear-gradient(145deg, rgba(255,255,255,.96), rgba(244,248,255,.95), rgba(240,255,249,.9)); }
        .ex-recommend-grid { display: grid; grid-template-columns: repeat(\${isMobile ? 1 : 3}, minmax(0,1fr)); gap: 12px; }
        .ex-recommend-card { min-width: 0; padding: 18px; border-radius: 20px; border: 1px solid #e3e8f5; background: rgba(255,255,255,.86); }
        .ex-recommend-card.is-main { border-color: #cfc5f4; background: linear-gradient(145deg,#fff,#f5f0ff); }
        .ex-recommend-card h4 { margin: 0 0 10px; color: #59499c; font-size: 12px; letter-spacing: .12em; }
        .ex-recommend-list { margin: 0; padding-left: 18px; display: grid; gap: 8px; color: #59677d; line-height: 1.65; font-size: 12px; }
        .ex-recommend-list li strong { color: #26344d; margin-right: 5px; }
        .ex-recommend-list li span { color: #718096; }
        .ex-empty { padding: 28px; border: 1px dashed #cbc7df; border-radius: 20px; color: #78859a; background: rgba(255,255,255,.48); line-height: 1.8; }
        .ex-raw summary { cursor: pointer; font-weight: 900; color: #6552a2; }
        .ex-raw-grid { margin-top: 18px; display: grid; grid-template-columns: repeat(${isMobile ? 1 : 3},minmax(0,1fr)); gap: 9px; }
        .ex-raw-item { padding: 12px 14px; border-radius: 14px; background: #f6f7fb; color: #5b687c; font-size: 12px; overflow-wrap: anywhere; }
        .ex-analysis { border-color: #d7e6f5; background: linear-gradient(145deg, rgba(252,254,255,.96), rgba(246,248,255,.94), rgba(243,255,250,.9)); }
        .ex-ranking-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; max-height: 560px; overflow-y: auto; padding-right: 4px; }
        .ex-ranking-card { cursor: pointer; text-align: left; border: 1px solid #e4e6f1; border-radius: 20px; padding: 16px; background: rgba(255,255,255,.84); color: #233149; display: grid; gap: 9px; box-shadow: 0 10px 22px rgba(70,80,120,.06); }
        .ex-ranking-card:hover { border-color: #a99adc; background: linear-gradient(135deg,#f8f2ff,#eef9ff); transform: translateY(-1px); }
        .ex-ranking-card.is-sample { border-color: #efd8ae; background: linear-gradient(145deg,#fffaf1,#ffffff); }
        .ex-ranking-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .ex-ranking-head span, .ex-ranking-head em { font-size: 10px; font-weight: 950; letter-spacing: .08em; color: #7866b5; font-style: normal; }
        .ex-ranking-head strong { font-weight: 850; font-size: 20px; line-height: 1.15; font-family: Georgia, "Times New Roman", serif; color: #172239; }
        .ex-ranking-score { font-weight: 900; font-size: 36px; line-height: 1; font-family: Georgia, "Times New Roman", serif; color: #554294; }
        .ex-ranking-tags { display: flex; flex-wrap: wrap; gap: 6px; }
        .ex-ranking-tags span { border-radius: 999px; padding: 4px 8px; background: #f1edff; color: #6552a2; font-size: 10px; font-weight: 900; }
        @media (max-width: 520px) { .ex-ranking-grid { max-height: none; overflow-y: visible; } }

        @media (max-width: 520px) { .ex-health-grid, .ex-kpi-grid { grid-template-columns: 1fr; } }
      `}</style>

      <main className="ex-main">
        <section className="ex-panel ex-hero">
          <div>
            <div className="ex-eyebrow">KURARI EX LAB</div>
            <h1>KURARI EX LAB</h1>
            <h2>独自展開指標・育成ラボ</h2>
            <p>外部サイトへ依存せず、<br />予想・結果・Summaryから独自の競輪データを育てる。</p>
          </div>
          <aside className="ex-phase">
            <div className="ex-eyebrow">CURRENT PHASE</div>
            <strong>SEED + EXACT</strong>
            <div className="ex-badges"><span className="ex-badge">SEED INSIGHT</span><span className="ex-badge is-exact">{exactInitialStatus === "ready" ? "EXACT ANALYTICS" : "EXACT：未生成"}</span><span className="ex-badge is-exact">{matchupInitialStatus === "ready" ? "MATCHUP EX" : "MATCHUP：未生成"}</span></div>
          </aside>
        </section>

        {initialStatus === "error" ? (
          <section className="ex-panel ex-section">
            <EmptyState text="KURARI EX DATAはまだ生成されていません。private-inputへ原本を追加し、importスクリプトを実行してください。" />
          </section>
        ) : null}

        <section className="ex-panel ex-section ex-today">
          <SectionTitle
            eyebrow="TODAY RECOMMENDATION"
            title={"\u4eca\u65e5\u306e\u63a8\u5968\u30e1\u30e2"}
            lead={todayRecommendation ? (todayRecommendation.period?.from ?? "--") + "\u301c" + (todayRecommendation.period?.to ?? "--") + " / " + todayRecommendation.sourceType : "\u4e88\u60f3\u4f5c\u6210\u524d\u306b\u898b\u308b\u8981\u70b9\u3092\u8868\u793a\u3057\u307e\u3059\u3002"}
          />
          {todayRecommendationStatus === "loading" ? <EmptyState text={"\u4eca\u65e5\u306e\u63a8\u5968\u30e1\u30e2\u3092\u8aad\u307f\u8fbc\u3093\u3067\u3044\u307e\u3059\u3002"} /> : null}
          {todayRecommendationStatus === "error" ? <EmptyState text={"\u4eca\u65e5\u306e\u63a8\u5968\u30e1\u30e2\u3092\u53d6\u5f97\u3067\u304d\u307e\u305b\u3093\u3067\u3057\u305f\u3002"} /> : null}
          {todayRecommendation ? (
            <>
              <div className="ex-health-grid">
                <MetricCard label={"\u52dd\u8ca0\u5019\u88dc"} value={valueText(todayRecommendation.sections.battleVenues.length)} note="score ranking" />
                <MetricCard label={"3\u7740\u4fdd\u8b77"} value={valueText(todayRecommendation.sections.thirdGuardVenues.length)} note="third guard" />
                <MetricCard label={"\u98a8\u6ce8\u610f"} value={valueText(todayRecommendation.sections.windCautionVenues.length)} note="wind sensitive" />
                <MetricCard label={"\u6ce8\u76ee\u9078\u624b"} value={valueText(todayRecommendation.sections.topRiders.length)} note="rider score" />
              </div>
              <div className="ex-recommend-grid">
                <article className="ex-recommend-card is-main">
                  <h4>{"\u52dd\u8ca0\u3057\u3084\u3059\u3044\u4f1a\u5834"}</h4>
                  <ul className="ex-recommend-list">
                    {todayRecommendation.sections.battleVenues.slice(0, 5).map((item) => (
                      <li key={item.venueKey}>
                        <strong>{item.venueName}</strong>
                        <span>score {item.score ?? "--"} / {item.memo}</span>
                      </li>
                    ))}
                  </ul>
                </article>
                <article className="ex-recommend-card">
                  <h4>{"3\u7740\u4fdd\u8b77\u304c\u5fc5\u8981\u306a\u4f1a\u5834"}</h4>
                  <ul className="ex-recommend-list">
                    {todayRecommendation.sections.thirdGuardVenues.slice(0, 5).map((item) => (
                      <li key={item.venueKey}>
                        <strong>{item.venueName}</strong>
                        <span>{item.tags?.slice(0, 2).map((tag) => tag.label).join(" / ") || item.memo}</span>
                      </li>
                    ))}
                  </ul>
                </article>
                <article className="ex-recommend-card">
                  <h4>{"\u4e88\u60f3\u4f5c\u6210\u30e1\u30e2"}</h4>
                  <ul className="ex-recommend-list">
                    {todayRecommendation.sections.predictionMemo.slice(0, 5).map((memo) => (
                      <li key={memo}>{memo}</li>
                    ))}
                  </ul>
                </article>
              </div>
              <div className="ex-recommend-grid">
                <article className="ex-recommend-card">
                  <h4>{"\u98a8\u6761\u4ef6\u306e\u6ce8\u610f"}</h4>
                  <ul className="ex-recommend-list">
                    {todayRecommendation.sections.windCautionVenues.slice(0, 5).map((item) => (
                      <li key={item.venueKey}>
                        <strong>{item.venueName}</strong>
                        <span>{item.memo}</span>
                      </li>
                    ))}
                  </ul>
                </article>
                <article className="ex-recommend-card">
                  <h4>{"\u4f4e\u30b5\u30f3\u30d7\u30eb\u6ce8\u610f"}</h4>
                  {todayRecommendation.sections.lowSampleVenues.length ? (
                    <ul className="ex-recommend-list">
                      {todayRecommendation.sections.lowSampleVenues.slice(0, 5).map((item) => (
                        <li key={item.venueKey}>
                          <strong>{item.venueName}</strong>
                          <span>{item.sourceCount ?? "--"} sources / {item.memo}</span>
                        </li>
                      ))}
                    </ul>
                  ) : <div className="ex-muted">sample-short??</div>}
                </article>
                <article className="ex-recommend-card">
                  <h4>{"\u9078\u624b\u30ab\u30eb\u30c6\u4e0a\u4f4d"}</h4>
                  <ul className="ex-recommend-list">
                    {todayRecommendation.sections.topRiders.slice(0, 5).map((item) => (
                      <li key={item.registrationNo}>
                        <strong>{item.name}</strong>
                        <span>score {item.score ?? "--"} / 3\u7740\u5185 {item.top3Rate ?? "--"}%</span>
                      </li>
                    ))}
                  </ul>
                </article>
              </div>
            </>
          ) : null}
        </section>

        <section className="ex-panel ex-section">
          <SectionTitle eyebrow="DATA HEALTH" title="公開データの生成状態" lead={`最終取込 ${formatDate(status?.lastImportAt)}`} />
          <div className="ex-health-grid">
            {healthMetrics.map(([label, value, note]) => (
              <MetricCard key={label} label={label} value={initialStatus === "loading" ? "…" : value} note={note} warning={label === "PUBLIC EX SIZE" && sizeWarning} />
            ))}
          </div>
          <div className="ex-subsection">
            <div className="ex-eyebrow">EXACT DATA HEALTH</div>
            <div className="ex-health-grid">
              {[
                ["NORMALIZED RACES", valueText(exactStatus?.normalizedRaceCount), "EXACT source"],
                ["EXACT VENUES", valueText(exactStatus?.venueCount), "generated"],
                ["EXACT FILES", valueText(exactStatus?.outputFileCount), "public JSON"],
                ["EXACT SIZE", formatBytes(exactStatus?.outputBytes), "lightweight"],
                ["LINEUP PARSED", valueText(exactGlobal?.coverage.lineupParsed), "available"],
                ["公開予測", valueText(exactGlobal?.coverage.predictionParsed), "available"],
                ["公開実測", valueText(exactGlobal?.coverage.resultParsed), "available"],
              ].map(([label, value, note]) => <MetricCard key={label} label={label} value={exactInitialStatus === "loading" ? "…" : value} note={note} />)}
            </div>
          </div>
          {sizeWarning ? <div className="ex-empty">WARNING: 公開EXデータ容量が20MBを超えています。</div> : null}
          {(initialData?.index.warnings.length ?? 0) > 0 ? (
            <div className="ex-muted">WARNINGS: {initialData?.index.warnings.join(" / ")}</div>
          ) : null}
        </section>

        <section className="ex-panel ex-section">
          <SectionTitle eyebrow="QUALITY LEGEND" title="データ品質の4段階" lead="SEEDとEXACTを分離して公開しています。" />
          <div className="ex-legend">
            {[
              ["SEED", "過去Summaryから抽出した初期知識"],
              ["EXACT", "正規化履歴から機械的に確定した集計"],
              ["PROXY", "既存データから近似した参考指数"],
              ["MANUAL", "Review時に人が確認して付けるタグ"],
            ].map(([label, description]) => <article key={label}><strong>{label}</strong><p>{description}</p></article>)}
          </div>
        </section>

        <section className="ex-panel ex-section">
          <SectionTitle eyebrow="GLOBAL KPI" title="全体傾向" lead="Summaryに明記された値だけを集計。" />
          <div className="ex-eyebrow">SEED / Summary由来の初期知識</div>
          <div className="ex-kpi-grid">
            {[
              ["SUMMARY SOURCES", valueText(global?.sourceCount)],
              ["RACES", valueText(global?.raceCount)],
              ["3連単的中", valueText(global?.trifectaHits)],
              ["3連単率", valueText(global?.trifectaHitRate, "%")],
              ["2車単的中", valueText(global?.exactaHits)],
              ["2車単率", valueText(global?.exactaHitRate, "%")],
              ["投資", valueText(global?.investmentYen, "円")],
              ["回収", valueText(global?.returnYen, "円")],
              ["回収率", valueText(global?.recoveryRate, "%")],
              ["SOURCE", initialData?.globalKpi.sourceType ?? "--"],
            ].filter(([, value]) => value !== "--").map(([label, value]) => (
              <MetricCard key={label} label={label} value={initialStatus === "loading" ? "…" : value} />
            ))}
          </div>
          <div className="ex-subsection">
            <div className="ex-eyebrow">EXACT / 正規化履歴からの確定集計</div>
            <div className="ex-kpi-grid">
              <ExactMetricCard label="3連単的中率" metric={exactGlobal?.predictionKpi.trifectaHitRate} />
              <ExactMetricCard label="2車単的中率" metric={exactGlobal?.predictionKpi.exactaHitRate} />
              <ExactMetricCard label="いずれか的中率" metric={exactGlobal?.predictionKpi.anyHitRate} />
              <ExactMetricCard label="2車単救済率" metric={exactGlobal?.predictionKpi.exactaSalvageRate} />
              <ExactMetricCard label="3着だけ抜け率" metric={exactGlobal?.predictionKpi.thirdOnlyMissRate} />
            </div>
          </div>
        </section>

        <div className="ex-view-tabs" role="tablist" aria-label="EX表示切替">
          <button className={`ex-view-tab${activeView === "venue" ? " is-active" : ""}`} type="button" role="tab" aria-selected={activeView === "venue"} onClick={() => setActiveView("venue")}>VENUE EX</button>
          <button className={`ex-view-tab${activeView === "player" ? " is-active" : ""}`} type="button" role="tab" aria-selected={activeView === "player"} onClick={() => setActiveView("player")}>PLAYER EX</button>
          <button className={`ex-view-tab${activeView === "matchup" ? " is-active" : ""}`} type="button" role="tab" aria-selected={activeView === "matchup"} onClick={() => setActiveView("matchup")}>MATCHUP EX</button>
        </div>

        <section className="ex-panel ex-section ex-analysis">
          <SectionTitle
            eyebrow="VENUE SCORE ANALYSIS"
            title="会場カルテランキング"
            lead="情報が少ない会場も除外せず、sample-shortとして残して育てます。"
          />
          {venueScoreStatus === "loading" ? <EmptyState text="会場カルテ分析を読み込んでいます。" /> : null}
          {venueScoreStatus === "error" ? <EmptyState text="会場カルテ分析を取得できませんでした。" /> : null}
          {venueScoreAnalysis ? (
            <>
              <div className="ex-health-grid">
                <MetricCard label="ANALYSIS PERIOD" value={venueScoreAnalysis.period.to ?? "--"} note={venueScoreAnalysis.period.from ? venueScoreAnalysis.period.from + " から" : "period"} />
                <MetricCard label="VENUE SCORES" value={valueText(venueScoreAnalysis.venueCount)} note="全会場を保持" />
                <MetricCard label="SAMPLE SHORT" value={valueText(sampleShortVenueCount)} note="育成中として残す" warning={sampleShortVenueCount > 0} />
                <MetricCard label="SOURCE TYPE" value={venueScoreAnalysis.sourceType} note={venueScoreAnalysis.source} />
              </div>
              <div className="ex-ranking-grid">
                {venueScoreItems.map((item) => (
                  <button
                    key={item.venueKey}
                    type="button"
                    className={"ex-ranking-card" + (item.riskLevel === "sample-short" ? " is-sample" : "")}
                    onClick={() => {
                      setActiveView("venue");
                      selectVenue({ venueKey: item.venueKey, venueName: item.venueName });
                    }}
                  >
                    <div className="ex-ranking-head">
                      <span>#{item.rank}</span>
                      <strong>{item.venueName}</strong>
                      <em>{item.rankHint}</em>
                    </div>
                    <div className="ex-ranking-score">{item.score}</div>
                    <div className="ex-muted">
                      {item.riskLevel} / 回収率 {valueText(item.kpi?.recoveryRate, "%")} / 3連単率 {valueText(item.kpi?.trifectaHitRate, "%")} / SEED {valueText(item.kpi?.sourceCount)}件
                    </div>
                    <div className="ex-ranking-tags">
                      {(item.topInsights ?? []).slice(0, 2).map((insight) => (
                        <span key={item.venueKey + "-" + insight.tag}>{insight.label}</span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </section>


        {activeView === "venue" ? (
          <section className="ex-workspace">
          <aside className="ex-panel ex-section">
            <SectionTitle eyebrow="VENUE EX LIST" title="会場別SEED / EXACT" lead="選択時に個別JSONだけを読み込みます。" />
            <input className="ex-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="会場名を検索" aria-label="会場名を検索" />
            <div className="ex-venue-list">
              {filteredVenues.map((item) => {
                const cached = venueCache[item.venueKey];
                const exactCached = exactVenueCache[item.venueKey];
                const hasSeed = initialData?.venues.some((entry) => entry.venueKey === item.venueKey);
                const hasExact = exactInitialData?.venues.some((entry) => entry.venueKey === item.venueKey);
                return (
                  <button key={item.venueKey} className={`ex-venue-button${selectedKey === item.venueKey ? " is-active" : ""}`} type="button" onClick={() => selectVenue(item)}>
                    <strong>{item.venueName}</strong>
                    <div className="ex-muted">
                      {cached ? `SEED ${cached.venue.quality.seedSources}件` : hasSeed ? "SEED 反映済み" : "SEED 未生成"} / {exactCached ? `EXACT ${exactCached.coverage.normalizedRaces}R` : hasExact ? "EXACT 反映済み" : "EXACT 未生成"}
                    </div>
                  </button>
                );
              })}
              {initialStatus === "ready" && filteredVenues.length === 0 ? <EmptyState text="該当する会場がありません。" /> : null}
            </div>
          </aside>

          <div className="ex-detail">
            <section className="ex-panel ex-section">
              <SectionTitle eyebrow="SELECTED VENUE EX" title={selectedBundle?.venue.venueName ?? selectedExact?.venueName ?? "会場を選択"} />
              {!selectedKey ? <EmptyState text="左の会場一覧から、確認する会場を選択してください。" /> : null}
              {selectedLoadStatus === "loading" ? <EmptyState text="会場EX SEEDを読み込んでいます。" /> : null}
              {selectedLoadStatus === "error" ? <EmptyState text="この会場のEX SEEDはまだ生成されていません。" /> : null}
              {selectedBundle ? (
                <>
                  <div className="ex-detail-head">
                    <div>
                      <div className="ex-eyebrow">{selectedBundle.venue.venueKey}</div>
                      <h3>{selectedBundle.venue.venueName}</h3>
                      <div className="ex-muted">{selectedBundle.venue.period.from ?? "--"} 〜 {selectedBundle.venue.period.to ?? "--"} / 更新 {selectedBundle.venue.updatedAt}</div>
                    </div>
                    <div className="ex-badges">
                      <span className="ex-badge">SEED {selectedBundle.venue.quality.seedSources}</span>
                      <span className="ex-badge">EXACT {selectedBundle.venue.quality.exactRaceCount}</span>
                      <span className="ex-badge">{selectedBundle.venue.quality.status.toUpperCase()}</span>
                    </div>
                  </div>
                  <div>
                    <div className="ex-eyebrow" style={{ marginBottom: 12 }}>SEED INSIGHTS</div>
                    <div className="ex-insights">
                      {selectedBundle.venue.seedInsights.map((insight) => (
                        <article className="ex-insight" key={insight.tag}>
                          <strong>{insight.label}</strong>
                          <div className="ex-insight-meta">
                            <span>{insight.sourceType}</span>
                            <span>confidence: {insight.confidence}</span>
                            <span>evidence: {insight.evidenceCount}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                  <div className="ex-note-grid">
                    {[
                      ["予想で使う狙い", selectedBundle.venue.seedNotes.targets],
                      ["警戒", selectedBundle.venue.seedNotes.cautions],
                      ["改善ルール", selectedBundle.venue.seedNotes.improvements],
                    ].map(([label, items]) => (
                      <article className="ex-note-card" key={label as string}>
                        <h4>{label as string}</h4>
                        {(items as string[]).length ? <ul>{(items as string[]).slice(0, 6).map((item) => <li key={item}>{item}</li>)}</ul> : <div className="ex-muted">抽出なし</div>}
                      </article>
                    ))}
                  </div>
                </>
              ) : null}
              {selectedKey && !selectedBundle && selectedLoadStatus !== "loading" ? <EmptyState text="この会場のSEEDは未生成です。" /> : null}
            </section>

            <section className="ex-panel ex-section">
              <SectionTitle eyebrow="EXACT ANALYTICS" title="会場別確定集計" lead="正規化履歴から機械的に算出した集計です。" />
              {selectedExactLoadStatus === "loading" ? <EmptyState text="会場別EXACTを読み込んでいます。" /> : null}
              {selectedExactLoadStatus === "error" || (selectedKey && !selectedExact && selectedExactLoadStatus !== "loading") ? <EmptyState text="この会場のEXACTは未生成です。" /> : null}
              {selectedExact ? (
                <>
                  <div className="ex-detail-head">
                    <div><div className="ex-eyebrow">{selectedExact.venueKey}</div><h3>{selectedExact.venueName}</h3><div className="ex-muted">{selectedExact.period.from ?? "--"} 〜 {selectedExact.period.to ?? "--"}</div></div>
                    <div className="ex-badges"><span className="ex-badge is-exact">EXACT</span><span className="ex-badge">{selectedExact.coverage.normalizedRaces} RACES</span></div>
                  </div>
                  <div className="ex-health-grid">
                    <MetricCard label="NORMALIZED" value={valueText(selectedExact.coverage.normalizedRaces)} />
                    <MetricCard label="公開予測" value={valueText(selectedExact.coverage.predictionParsed)} note="prediction parsed" />
                    <MetricCard label="公開実測" value={valueText(selectedExact.coverage.resultParsed)} note="result parsed" />
                    <MetricCard label="LINEUP PARSED" value={valueText(selectedExact.coverage.lineupParsed)} />
                  </div>
                  <div className="ex-subsection"><div className="ex-eyebrow">EXACT KPI</div><div className="ex-kpi-grid">
                    {Object.entries({
                      "3連単的中率": selectedExact.predictionKpi.trifectaHitRate,
                      "2車単的中率": selectedExact.predictionKpi.exactaHitRate,
                      "いずれか的中率": selectedExact.predictionKpi.anyHitRate,
                      "2車単救済率": selectedExact.predictionKpi.exactaSalvageRate,
                      "3着だけ抜け率": selectedExact.predictionKpi.thirdOnlyMissRate,
                      "1着候補不在率": selectedExact.predictionKpi.headMissRate,
                    }).map(([label, metric]) => <ExactMetricCard key={label} label={label} metric={metric} />)}
                  </div></div>
                  <div className="ex-subsection"><div className="ex-eyebrow">RACE PATTERN</div><div className="ex-kpi-grid">
                    {Object.entries({
                      "逃げ率": selectedExact.racePattern.escapeWinRate,
                      "捲り率": selectedExact.racePattern.makuriWinRate,
                      "差し率": selectedExact.racePattern.sashiWinRate,
                      "同ラインワンツー率": selectedExact.racePattern.sameLineTop2Rate,
                      "同ラインスリー率": selectedExact.racePattern.sameLineTop3Rate,
                      "別線3着混入率": selectedExact.racePattern.otherLineThirdRate,
                      "単騎3着率": selectedExact.racePattern.singleThirdRate,
                      "B選手車券内残り率": selectedExact.racePattern.bRiderInsideTop3Rate,
                      "3連単1番人気的中率": selectedExact.racePattern.favoriteTrifectaHitRate,
                    }).map(([label, metric]) => <ExactMetricCard key={label} label={label} metric={metric} />)}
                  </div></div>
                  <div className="ex-subsection"><div className="ex-eyebrow">CATEGORY BREAKDOWN</div><div className="ex-category-grid">
                    {Object.entries({
                      "時間帯別": selectedExact.dimensions.timeslot,
                      "級班別": selectedExact.dimensions.raceClass,
                      "分戦数別": selectedExact.dimensions.lineCount,
                      "風速帯別": selectedExact.dimensions.windSpeedMps,
                    }).map(([label, entries]) => (
                      <article className="ex-category-card" key={label}><h4>{label}</h4>
                        {Object.entries(entries).map(([key, entry]) => (
                          <div className="ex-category-row" key={key}>
                            <span>{exactCategoryLabel(label, key)} / {entry.raceCount}R {entry.predictionKpi.anyHitRate.quality === "low-sample" || entry.predictionKpi.anyHitRate.total < 5 ? <span className="ex-low-sample">母数少</span> : null}</span>
                            <span>{formatKurariExMetric(entry.predictionKpi.anyHitRate)}</span>
                          </div>
                        ))}
                      </article>
                    ))}
                  </div></div>
                </>
              ) : null}
            </section>

            <section className="ex-panel ex-section ex-guidance">
              <SectionTitle eyebrow="PREDICTION GUIDANCE" title="次回予想へ反映すること" />
              {selectedBundle?.guidance?.items.length ? (
                <ul className="ex-guidance-list">
                  {selectedBundle.guidance.items.map((item) => <li key={item.text}>{item.text}</li>)}
                </ul>
              ) : <EmptyState text={selectedKey ? "この会場のGuidanceはまだ生成されていません。" : "会場を選択するとGuidanceを表示します。"} />}
            </section>
          </div>
          </section>
        ) : activeView === "player" ? (
          <>
            <section className="ex-panel ex-section">
              <SectionTitle eyebrow="PLAYER EX" title="選手別確定集計" lead="登録番号へ安全に紐付いた選手だけを表示。母数が少ない指標は過信しないでください。" />
              <div className="ex-eyebrow">PLAYER DATA HEALTH</div>
              <div className="ex-health-grid">
                <MetricCard label="PUBLISHED RIDERS" value={riderInitialStatus === "loading" ? "…" : valueText(riderInitialData?.status.riderCount)} />
                <MetricCard label="素材蓄積中" value={riderInitialStatus === "loading" ? "…" : valueText(riderInitialData?.status.qualityCounts["identity-only"])} warning={(riderInitialData?.status.qualityCounts["identity-only"] ?? 0) > 0} />
                <MetricCard label="LOW SAMPLE" value={riderInitialStatus === "loading" ? "…" : valueText(riderInitialData?.status.qualityCounts["low-sample"])} warning={(riderInitialData?.status.qualityCounts["low-sample"] ?? 0) > 0} />
                <MetricCard label="CATEGORY ANALYSIS" value={riderCategoryStatus === "loading" ? "…" : riderCategoryStatus === "error" ? "取得不可" : valueText(Object.keys(riderCategoryAnalysis?.dimensions ?? {}).length)} note="条件別EXACT" warning={riderCategoryStatus === "error"} />
                <MetricCard label="PARTIAL" value={riderInitialStatus === "loading" ? "…" : valueText(riderInitialData?.status.qualityCounts.partial)} />
                <MetricCard label="COMPLETE" value={riderInitialStatus === "loading" ? "…" : valueText(riderInitialData?.status.qualityCounts.complete)} />
                <MetricCard label="MAX RIDER JSON" value={riderInitialStatus === "loading" ? "…" : formatBytes(riderInitialData?.status.maxFileBytes)} />
                <MetricCard label="TOTAL RIDER EX" value={riderInitialStatus === "loading" ? "…" : formatBytes(riderInitialData?.status.outputBytes)} />
                <MetricCard label="SHB NAME KEYS" value={shbNameStatus === "loading" ? "…" : valueText(shbNameIndex?.summary.nameKeyCount)} />
                <MetricCard label="SHB COLLISION" value={shbNameStatus === "loading" ? "…" : valueText(shbNameIndex?.summary.sameDateCollisionNameKeyCount)} warning={(shbNameIndex?.summary.sameDateCollisionNameKeyCount ?? 0) > 0} />
              </div>
              {riderInitialStatus === "error" ? <EmptyState text="PLAYER EXのindex / statusを取得できませんでした。" /> : null}
            </section>
            <section className="ex-panel ex-section ex-analysis">
              <SectionTitle
                eyebrow="PLAYER CATEGORY ANALYSIS"
                title="条件別選手ランキング"
                lead="会場・時間帯・級班・レース種別・天候・周長・ライン役割ごとのEXACT集計です。"
              />
              {riderCategoryStatus === "loading" ? <EmptyState text="条件別選手分析を読み込んでいます。" /> : null}
              {riderCategoryStatus === "error" ? <EmptyState text="条件別選手分析を取得できませんでした。" /> : null}
              {riderCategoryAnalysis ? (
                <>
                  <div className="ex-health-grid">
                    <MetricCard label="SOURCE TYPE" value={riderCategoryAnalysis.sourceType} note={riderCategoryAnalysis.sampleUnit} />
                    <MetricCard label="CONFIRMED STARTS" value={valueText(riderCategoryAnalysis.coverage.confirmedStartCount)} />
                    <MetricCard label="READ RIDERS" value={valueText(riderCategoryAnalysis.coverage.riderFilesRead)} />
                    <MetricCard label="SKIPPED" value={valueText(riderCategoryAnalysis.coverage.riderFilesSkipped)} warning={(riderCategoryAnalysis.coverage.riderFilesSkipped ?? 0) > 0} />
                  </div>
                  <div className="ex-category-grid">
                    {Object.entries(riderCategoryAnalysis.dimensions).map(([dimensionKey, dimension]) => (
                      <article className="ex-category-card" key={dimensionKey}>
                        <h4>{dimension.label}</h4>
                        {dimension.items.slice(0, 6).map((item) => (
                          <div className="ex-category-row" key={item.key}>
                            <span>{item.label} / {valueText(item.starts)}走 {item.quality === "low-sample" ? <span className="ex-low-sample">母数少</span> : null}</span>
                            <span>
                              勝 {Number.isFinite(item.winRate) ? `${Number(item.winRate).toFixed(1)}%` : "--"} / 2連 {Number.isFinite(item.top2Rate) ? `${Number(item.top2Rate).toFixed(1)}%` : "--"} / 3内 {Number.isFinite(item.top3Rate) ? `${Number(item.top3Rate).toFixed(1)}%` : "--"}
                            </span>
                          </div>
                        ))}
                      </article>
                    ))}
                  </div>
                  {riderCategoryAnalysis.unsupportedExactMetrics?.length ? (
                    <div className="ex-muted">
                      未生成指標: {riderCategoryAnalysis.unsupportedExactMetrics.map((item) => item.label).join(" / ")}
                    </div>
                  ) : null}
                </>
              ) : null}
            </section>
<section className="ex-panel ex-section ex-analysis">
              <SectionTitle
                eyebrow="PLAYER SCORE ANALYSIS"
                title="選手カルテランキング"
                lead="全選手を残し、complete / partial / low-sample / identity-only を育成状態として表示します。"
              />
              {riderScoreStatus === "loading" ? <EmptyState text="選手カルテ分析を読み込んでいます。" /> : null}
              {riderScoreStatus === "error" ? <EmptyState text="選手カルテ分析を取得できませんでした。" /> : null}
              {riderScoreAnalysis ? (
                <>
                  <div className="ex-health-grid">
                    <MetricCard label="RIDER SCORES" value={valueText(riderScoreAnalysis.riderCount)} note="全選手を保持" />
                    <MetricCard label="COMPLETE" value={valueText(riderScoreAnalysis.qualityCounts.complete)} />
                    <MetricCard label="LOW SAMPLE" value={valueText(riderScoreAnalysis.qualityCounts["low-sample"])} warning={(riderScoreAnalysis.qualityCounts["low-sample"] ?? 0) > 0} />
                    <MetricCard label="IDENTITY ONLY" value={valueText(riderScoreAnalysis.qualityCounts["identity-only"])} warning={(riderScoreAnalysis.qualityCounts["identity-only"] ?? 0) > 0} />
                  </div>
                  <div className="ex-ranking-grid">
                    {topRiderScoreItems.map((item) => (
                      <button
                        key={item.registrationNo}
                        type="button"
                        className={"ex-ranking-card" + (item.quality === "low-sample" || item.quality === "identity-only" ? " is-sample" : "")}
                        onClick={() => {
                          const riderItem = riderInitialData?.index.items.find((candidate) => candidate.registrationNo === item.registrationNo);
                          if (riderItem) {
                            setActiveView("player");
                            selectRider(riderItem);
                          }
                        }}
                      >
                        <div className="ex-ranking-head">
                          <span>#{item.rank}</span>
                          <strong>{item.name}</strong>
                          <em>{item.rankHint}</em>
                        </div>
                        <div className="ex-ranking-score">{item.score}</div>
                        <div className="ex-muted">
                          {item.quality} / {item.dataStatus} / 3着内率 {valueText(item.rates?.top3Rate, "%")} / 確認 {valueText(item.coverage?.confirmedStartCount)}R
                        </div>
                        <div className="ex-ranking-tags">
                          {(item.tags ?? []).slice(0, 3).map((tag) => (
                            <span key={item.registrationNo + "-" + tag}>{tag}</span>
                          ))}
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
            </section>


            <section className="ex-workspace">
              <aside className="ex-panel ex-section">
                <SectionTitle eyebrow="PLAYER EX LIST" title="公開選手" lead={`${filteredRiders.length.toLocaleString("ja-JP")} / ${(riderInitialData?.index.riderCount ?? 0).toLocaleString("ja-JP")}名`} />
                <input className="ex-search" value={riderQuery} onChange={(event) => setRiderQuery(event.target.value)} placeholder="選手名・登録番号・府県で検索" aria-label="選手名・登録番号・府県で検索" />
                <div className="ex-view-tabs" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
                  {riderFilterOptions.map((option) => (
                    <button
                      key={option.key}
                      className={`ex-view-tab${riderFilterMode === option.key ? " is-active" : ""}`}
                      type="button"
                      onClick={() => setRiderFilterMode(option.key)}
                      title={option.note}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <div className="ex-venue-list">
                  {filteredRiders.map((item) => (
                    <button key={item.registrationNo} className={`ex-venue-button${selectedRiderNo === item.registrationNo ? " is-active" : ""}`} type="button" onClick={() => selectRider(item)}>
                      <div className="ex-detail-head">
                        <div>
                          <strong>{item.name}</strong>
                          <div className="ex-muted">{item.registrationNo} / {item.prefecture || "府県未取得"} / {item.class || "級班未取得"}</div>
                        </div>
                        <RiderQualityBadge quality={item.quality} />
                      </div>
                      <div className="ex-muted">{item.quality === "identity-only" ? "素材蓄積中 / 登録番号・選手情報のみ" : `確認出走 ${item.confirmedStartCount}R / 役割解析 ${item.roleEligibleCount}R`}</div>
                    </button>
                  ))}
                  {riderInitialStatus === "ready" && filteredRiders.length === 0 ? <EmptyState text="該当する選手がいません。" /> : null}
                </div>
              </aside>

              <div className="ex-detail">
                <section className="ex-panel ex-section">
                  <SectionTitle eyebrow="PLAYER EXACT ANALYTICS" title={selectedRider?.name ?? selectedRiderItem?.name ?? "選手別確定集計"} />

                  {selectedRiderScore ? (
                    <div className="ex-health-grid" style={{ marginBottom: 16 }}>
                      <MetricCard label="KURARI SCORE" value={valueText(selectedRiderScore.score)} note={selectedRiderScore.rankHint} />
                      <MetricCard label="DATA STATUS" value={selectedRiderScore.dataStatus} note={selectedRiderScore.quality} warning={selectedRiderScore.quality !== "complete"} />
                      <MetricCard label="TOP2 RATE" value={valueText(selectedRiderScore.rates?.top2Rate, "%")} />
                      <MetricCard label="TOP3 RATE" value={valueText(selectedRiderScore.rates?.top3Rate, "%")} />
                    </div>
                  ) : null}
                  {!selectedRiderNo ? <EmptyState text="選手を選択すると、KURARI EX EXACTが表示されます。" /> : null}
                  {selectedRiderStatus === "loading" ? <EmptyState text="選手別EXACTを読み込んでいます。" /> : null}
                  {selectedRiderStatus === "error" ? <EmptyState text="この選手のEXACTデータを取得できませんでした。" /> : null}
                  {selectedRider ? (
                    <>
                      <div className="ex-detail-head">
                        <div>
                          <div className="ex-eyebrow">REGISTRATION {selectedRider.registrationNo}</div>
                          <h3>{selectedRider.name}</h3>
                          <div className="ex-muted">
                            {selectedRiderItem?.prefecture || "府県未取得"} / {selectedRiderItem?.class || "級班未取得"} / {selectedRider.quality === "identity-only" ? "素材蓄積中" : `${selectedRider.period.from ?? "--"}〜${selectedRider.period.to ?? "--"}`}
                          </div>
                        </div>
                        <div className="ex-badges">
                          <span className="ex-badge is-exact">EXACT</span>
                          <RiderQualityBadge quality={selectedRider.quality} />
                          <span className="ex-badge">IDENTITY 登録番号解決済み</span>
                          <span className="ex-badge">RESOLUTION {selectedRider.identity.status}</span>
                          <button
                            className="ex-badge is-exact"
                            type="button"
                            onClick={openSelectedRiderMatchup}
                            title={selectedRiderMatchupIndexItem ? "MATCHUP EXでこの選手を開く" : "MATCHUP EXで選手名検索を開く"}
                            style={{
                              border: "0",
                              cursor: "pointer",
                              fontWeight: 900,
                            }}
                          >
                            対戦成績を見る
                          </button>
                        </div>
                      </div>
                      {selectedRider.quality === "identity-only" ? (
                        <div className="ex-sample-alert"><strong>素材蓄積中</strong>登録番号と選手情報は公開済みです。成績データはまだ蓄積中のため、買い目根拠には使わず、出走確認用として扱ってください。</div>
                      ) : null}
                      {selectedRider.quality !== "identity-only" && (selectedRider.quality === "low-sample" || selectedRider.coverage.confirmedStartCount < 5) ? (
                        <div className="ex-sample-alert"><strong>LOW SAMPLE / 母数少</strong>母数が少ないため、確定的な評価には使わず、展開判断の補助として確認してください。</div>
                      ) : null}
                    </>
                  ) : null}
                </section>

                {selectedRider ? (
                  <>
                    <RiderDecisionMemo rider={selectedRider} shb={selectedRiderShb} />

                    <section className="ex-panel ex-section">
                      <SectionTitle eyebrow="COVERAGE" title="解析範囲" />
                      <div className="ex-health-grid">
                        <MetricCard label="OBSERVED RACES" value={valueText(selectedRider.coverage.observedRaceCount)} />
                        <MetricCard label="CONFIRMED STARTS" value={valueText(selectedRider.coverage.confirmedStartCount)} />
                        <MetricCard label="RESULT PARSED" value={valueText(selectedRider.coverage.resultParsedCount)} />
                        <MetricCard label="ROLE ELIGIBLE" value={valueText(selectedRider.coverage.roleEligibleCount)} />
                        <MetricCard label="VENUES" value={valueText(selectedRider.coverage.venueCount)} />
                      </div>
                    </section>

                    <section className="ex-panel ex-section">
                      <SectionTitle eyebrow="OVERALL" title="全体成績" lead="未取得と0%を区別して表示します。" />
                      <RiderAggregateCards aggregate={selectedRider.overall} />
                    </section>

                    <section className="ex-panel ex-section">
                      <SectionTitle eyebrow="SHB ROLE" title="S/B 先行役割" lead="結果TXTから抽出したS/B。母数少は展開判断の補助として扱ってください。" />
                      {shbNameStatus === "loading" ? <EmptyState text="SHB名前インデックスを読み込んでいます。" /> : null}
                      {shbNameStatus === "error" ? <EmptyState text="SHB名前インデックスを取得できませんでした。" /> : null}
                      {shbNameStatus === "ready" && !selectedRiderShb ? <EmptyState text="この選手のS/B履歴はまだありません。" /> : null}
                      {selectedRiderShb ? (
                        <div className="ex-kpi-grid">
                          <MetricCard label="B回数" value={valueText(selectedRiderShb.bCount)} note="最終バック主導" />
                          <MetricCard label="B車券内率" value={selectedRiderShb.bCount ? formatShbRate(selectedRiderShb.bTop3Rate) : "--"} note="Bから3着以内" />
                          <MetricCard label="B着外率" value={selectedRiderShb.bCount ? formatShbRate(selectedRiderShb.bOutsideRate) : "--"} warning={(selectedRiderShb.bOutsideRate ?? 0) >= 40} />
                          <MetricCard label="S回数" value={valueText(selectedRiderShb.sCount)} note="S取得" />
                          <MetricCard label="S/B同時" value={valueText(selectedRiderShb.sameSAndBCount)} note={selectedRiderShb.sCount ? formatShbRate(selectedRiderShb.sameSAndBRate) : "--"} />
                          <MetricCard label="名前解決" value={formatShbNameQuality(selectedRiderShb.quality)} note={selectedRiderShb.registrationNo ? "登録番号 " + selectedRiderShb.registrationNo : "名前キー参照"} />
                        </div>
                      ) : null}
                    </section>

                    <section className="ex-panel ex-section">
                      <SectionTitle eyebrow="WINNING METHODS" title="1着決まり手" />
                      <div className="ex-kpi-grid">
                        {([
                          ["逃", selectedRider.winningMethods.escape],
                          ["捲", selectedRider.winningMethods.sprint],
                          ["差", selectedRider.winningMethods.difference],
                        ] as const).map(([label, metric]) => <MetricCard key={label} label={label} value={formatKurariExRiderMetric(metric)} />)}
                      </div>
                    </section>

                    {selectedRider.byVenue.length ? (
                      <section className="ex-panel ex-section">
                        <SectionTitle eyebrow="BY VENUE" title="会場別" />
                        <div className="ex-table-wrap"><table className="ex-data-table"><thead><tr><th>会場</th><th>出走</th><th>1着</th><th>2着</th><th>3着</th><th>3着以内率</th></tr></thead><tbody>
                          {selectedRider.byVenue.map((row) => <tr key={row.venueKey}><td>{row.venueName ?? row.venueKey}</td><td>{row.starts ?? "未取得"}</td><td>{row.wins}</td><td>{row.seconds}</td><td>{row.thirds}</td><td>{formatKurariExRiderMetric(row.top3Rate)}</td></tr>)}
                        </tbody></table></div>
                      </section>
                    ) : null}

                    {selectedRider.byTimeslot.length ? (
                      <section className="ex-panel ex-section">
                        <SectionTitle eyebrow="BY TIMESLOT" title="時間帯別" />
                        <div className="ex-table-wrap"><table className="ex-data-table"><thead><tr><th>時間帯</th><th>出走</th><th>1着</th><th>2着</th><th>3着</th><th>3着以内率</th></tr></thead><tbody>
                          {selectedRider.byTimeslot.map((row) => <tr key={row.timeslot}><td>{timeslotLabels[row.timeslot ?? "unknown"] ?? row.timeslot}</td><td>{row.starts ?? "未取得"}</td><td>{row.wins}</td><td>{row.seconds}</td><td>{row.thirds}</td><td>{formatKurariExRiderMetric(row.top3Rate)}</td></tr>)}
                        </tbody></table></div>
                      </section>
                    ) : null}

                    {selectedRider.byClass.length ? (
                      <section className="ex-panel ex-section">
                        <SectionTitle eyebrow="BY CLASS" title="級班別" />
                        <div className="ex-table-wrap"><table className="ex-data-table"><thead><tr><th>級班</th><th>出走</th><th>1着</th><th>2着</th><th>3着</th><th>3着以内率</th></tr></thead><tbody>
                          {selectedRider.byClass.map((row, index) => <tr key={`${row.raceClass}-${index}`}><td>{row.raceClass === "unknown" ? "未取得" : row.raceClass}</td><td>{row.starts ?? "未取得"}</td><td>{row.wins}</td><td>{row.seconds}</td><td>{row.thirds}</td><td>{formatKurariExRiderMetric(row.top3Rate)}</td></tr>)}
                        </tbody></table></div>
                      </section>
                    ) : null}

                    {selectedRider.byRaceStage.length ? (
                      <section className="ex-panel ex-section">
                        <SectionTitle eyebrow="BY RACE STAGE" title="レース種別別" />
                        <div className="ex-table-wrap"><table className="ex-data-table"><thead><tr><th>種別</th><th>出走</th><th>1着</th><th>2着</th><th>3着</th><th>3着以内率</th></tr></thead><tbody>
                          {selectedRider.byRaceStage.map((row, index) => <tr key={`${row.raceStage}-${index}`}><td>{row.raceStageLabel ?? row.raceStage ?? "未取得"}</td><td>{row.starts ?? "未取得"}</td><td>{row.wins}</td><td>{row.seconds}</td><td>{row.thirds}</td><td>{formatKurariExRiderMetric(row.top3Rate)}</td></tr>)}
                        </tbody></table></div>
                      </section>
                    ) : null}

                    {selectedRider.byWeather.length ? (
                      <section className="ex-panel ex-section">
                        <SectionTitle eyebrow="BY WEATHER" title="天候別" />
                        <div className="ex-table-wrap"><table className="ex-data-table"><thead><tr><th>天候</th><th>出走</th><th>1着</th><th>2着</th><th>3着</th><th>3着以内率</th></tr></thead><tbody>
                          {selectedRider.byWeather.map((row, index) => <tr key={`${row.weatherCondition}-${index}`}><td>{row.weatherLabel ?? row.weatherCondition ?? "未取得"}</td><td>{row.starts ?? "未取得"}</td><td>{row.wins}</td><td>{row.seconds}</td><td>{row.thirds}</td><td>{formatKurariExRiderMetric(row.top3Rate)}</td></tr>)}
                        </tbody></table></div>
                      </section>
                    ) : null}

                    {selectedRider.byBankLength.length ? (
                      <section className="ex-panel ex-section">
                        <SectionTitle eyebrow="BY BANK LENGTH" title="周長別" />
                        <div className="ex-table-wrap"><table className="ex-data-table"><thead><tr><th>周長</th><th>出走</th><th>1着</th><th>2着</th><th>3着</th><th>3着以内率</th></tr></thead><tbody>
                          {selectedRider.byBankLength.map((row, index) => <tr key={`${row.bankLength ?? "unknown"}-${index}`}><td>{row.bankLengthLabel ?? (row.bankLength ? `${row.bankLength}m` : "未取得")}</td><td>{row.starts ?? "未取得"}</td><td>{row.wins}</td><td>{row.seconds}</td><td>{row.thirds}</td><td>{formatKurariExRiderMetric(row.top3Rate)}</td></tr>)}
                        </tbody></table></div>
                      </section>
                    ) : null}
                    <section className="ex-panel ex-section">
                      <SectionTitle eyebrow="BY ROLE" title="ライン役割別" />
                      {selectedRider.byRole && Object.values(selectedRider.byRole).some(Boolean) ? (
                        <div className="ex-category-grid">
                          {([
                            ["front", "ライン先頭"],
                            ["bante", "番手"],
                            ["third", "3番手"],
                            ["single", "単騎"],
                          ] as const).map(([key, label]) => {
                            const aggregate = selectedRider.byRole?.[key];
                            if (!aggregate) return null;
                            return <article className="ex-category-card" key={key}><h4>{label}</h4><div className="ex-category-row"><span>出走</span><span>{aggregate.starts ?? "未取得"}</span></div><div className="ex-category-row"><span>勝率</span><span>{formatKurariExRiderMetric(aggregate.winRate)}</span></div><div className="ex-category-row"><span>3着以内率</span><span>{formatKurariExRiderMetric(aggregate.top3Rate)}</span></div>{aggregate.differenceWinRate ? <div className="ex-category-row"><span>番手時差し</span><span>{formatKurariExRiderMetric(aggregate.differenceWinRate)}</span></div> : null}</article>;
                          })}
                        </div>
                      ) : <EmptyState text="役割別EXACTは、解析可能レースの蓄積後に表示されます。" />}
                    </section>

                    {selectedRider.warnings.length ? (
                      <section className="ex-panel ex-section">
                        <SectionTitle eyebrow="DATA QUALITY NOTES" title="データ品質上の注意" />
                        <ul className="ex-guidance-list">{selectedRider.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
                      </section>
                    ) : null}
                  </>
                ) : null}
              </div>
            </section>

          </>
        ) : (
          <>
            <section className="ex-panel ex-section">
              <SectionTitle eyebrow="MATCHUP EX" title="選手別対戦成績" lead="同走した相手ごとの自己先着・相手先着を比較します。母数が少ない対戦は参考扱いです。" />
              <div className="ex-eyebrow">MATCHUP DATA HEALTH</div>
              <div className="ex-health-grid">
                <MetricCard label="PUBLISHED RIDERS" value={matchupInitialStatus === "loading" ? "…" : valueText(matchupSummary?.riderFileCount ?? matchupInitialData?.index.riderCount)} />
                <MetricCard label="DISTINCT PAIRS" value={matchupInitialStatus === "loading" ? "…" : valueText(matchupSummary?.distinctPairCount)} />
                <MetricCard label="PAIR OBSERVATIONS" value={matchupInitialStatus === "loading" ? "…" : valueText(matchupSummary?.pairObservationCount)} />
                <MetricCard label="SAFE COMPARABLE" value={matchupInitialStatus === "loading" ? "…" : valueText(matchupSummary?.safeComparablePairObservationCount)} />
                <MetricCard label="SAME LINE" value={matchupInitialStatus === "loading" ? "…" : valueText(matchupSummary?.sameLinePairObservationCount)} />
                <MetricCard label="OTHER LINE" value={matchupInitialStatus === "loading" ? "…" : valueText(matchupSummary?.otherLinePairObservationCount)} />
                <MetricCard label="LOW SAMPLE" value={matchupInitialStatus === "loading" ? "…" : valueText(matchupSummary?.qualityCounts["low-sample"])} warning={(matchupSummary?.qualityCounts["low-sample"] ?? 0) > 0} />
                <MetricCard label="PARTIAL" value={matchupInitialStatus === "loading" ? "…" : valueText(matchupSummary?.qualityCounts.partial)} />
              </div>
              {matchupInitialStatus === "error" ? <EmptyState text="MATCHUP EXのindex / statusを取得できませんでした。" /> : null}
            </section>

            <section className="ex-workspace">
              <aside className="ex-panel ex-section">
                <SectionTitle eyebrow="MATCHUP EX LIST" title="公開選手" lead={`${filteredMatchupRiders.length.toLocaleString("ja-JP")} / ${(matchupInitialData?.index.riderCount ?? 0).toLocaleString("ja-JP")}名`} />
                <input className="ex-search" value={matchupQuery} onChange={(event) => setMatchupQuery(event.target.value)} placeholder="選手名・登録番号で検索" aria-label="選手名・登録番号で検索" />
                <div className="ex-venue-list">
                  {filteredMatchupRiders.map((item) => (
                    <button key={item.registrationNo} className={`ex-venue-button${selectedMatchupRiderNo === item.registrationNo ? " is-active" : ""}`} type="button" onClick={() => selectMatchupRider(item)}>
                      <div className="ex-detail-head">
                        <div>
                          <strong>{item.name}</strong>
                          <div className="ex-muted">{item.registrationNo} / 対戦相手 {item.distinctOpponentCount}名</div>
                        </div>
                        <span className={`ex-quality is-${item.quality}`}>{getMatchupQualityLabel(item.quality)}</span>
                      </div>
                      <div className="ex-muted">共走 {item.sharedRaceCount}R / 比較可能 {item.safeComparableRaceCount}R</div>
                    </button>
                  ))}
                  {matchupInitialStatus === "ready" && filteredMatchupRiders.length === 0 ? <EmptyState text="該当する選手がいません。" /> : null}
                </div>
              </aside>

              <div className="ex-detail">
                <section className="ex-panel ex-section">
                  <SectionTitle eyebrow="MATCHUP EXACT ANALYTICS" title={selectedMatchup?.name ?? selectedMatchupItem?.name ?? "対戦成績"} />
                  {!selectedMatchupRiderNo ? <EmptyState text="選手を選択すると、同走相手別の対戦成績を表示します。" /> : null}
                  {selectedMatchupStatus === "loading" ? <EmptyState text="MATCHUP EXを読み込んでいます。" /> : null}
                  {selectedMatchupStatus === "error" ? <EmptyState text="この選手のMATCHUP EXデータを取得できませんでした。" /> : null}
                  {selectedMatchup ? (
                    <>
                      <div className="ex-detail-head">
                        <div>
                          <div className="ex-eyebrow">REGISTRATION {selectedMatchup.registrationNo}</div>
                          <h3>{selectedMatchup.name}</h3>
                          <div className="ex-muted">{selectedMatchup.period.from ?? "--"}〜{selectedMatchup.period.to ?? "--"}</div>
                        </div>
                        <div className="ex-badges">
                          <span className="ex-badge is-exact">MATCHUP EX</span>
                          <span className={`ex-quality is-${selectedMatchup.quality}`}>{getMatchupQualityLabel(selectedMatchup.quality)}</span>
                          <span className="ex-badge">OPPONENTS {selectedMatchup.coverage.distinctOpponentCount}</span>
                        </div>
                      </div>
                      {selectedMatchup.quality === "low-sample" || selectedMatchup.coverage.safeComparableRaceCount < 5 ? (
                        <div className="ex-sample-alert"><strong>LOW SAMPLE / 母数少</strong>対戦母数が少ないため、上下評価を固定せず、展開判断の補助として確認してください。</div>
                      ) : null}
                    </>
                  ) : null}
                </section>

                {selectedMatchup ? (
                  <>
                    <section className="ex-panel ex-section">
                      <SectionTitle eyebrow="COVERAGE" title="対戦解析範囲" />
                      <div className="ex-health-grid">
                        <MetricCard label="OPPONENTS" value={valueText(selectedMatchup.coverage.distinctOpponentCount)} />
                        <MetricCard label="SHARED RACES" value={valueText(selectedMatchup.coverage.sharedRaceCount)} />
                        <MetricCard label="SAFE COMPARABLE" value={valueText(selectedMatchup.coverage.safeComparableRaceCount)} />
                        <MetricCard label="UNKNOWN ORDER" value={valueText(selectedMatchup.coverage.unknownOrderRaceCount)} />
                        <MetricCard label="LINE CLASSIFIED" value={valueText(selectedMatchup.coverage.lineClassifiedRaceCount)} />
                      </div>
                    </section>

                    <section className="ex-panel ex-section">
                      <SectionTitle eyebrow="OPPONENT TABLE" title="同走相手別" lead={`表示 ${selectedMatchupRows.length.toLocaleString("ja-JP")} / ${selectedMatchup.matchups.length.toLocaleString("ja-JP")}件。自己先着率は比較可能レースだけで算出します。`} />
                      <div className="ex-view-tabs" style={{ justifyContent: "flex-start", flexWrap: "wrap", marginBottom: 16 }}>
                        {matchupFilterOptions.map((option) => (
                          <button
                            key={option.key}
                            className={`ex-view-tab${matchupFilterMode === option.key ? " is-active" : ""}`}
                            type="button"
                            onClick={() => setMatchupFilterMode(option.key)}
                            title={option.note}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                      {selectedMatchupRows.length ? (
                        <div className="ex-table-wrap"><table className="ex-data-table"><thead><tr><th>相手</th><th>共走</th><th>比較可</th><th>自己先着</th><th>相手先着</th><th>自己先着率</th><th>同ライン</th><th>別線</th><th>品質</th></tr></thead><tbody>
                          {selectedMatchupRows
                            .map((row) => (
                              <tr key={row.pairKey}>
                                <td>{row.opponentName}<br /><span className="ex-muted">{row.opponentRegistrationNo}</span></td>
                                <td>{row.sharedRaceCount}</td>
                                <td>{row.safeComparableRaceCount}</td>
                                <td>{row.selfAheadCount}</td>
                                <td>{row.opponentAheadCount}</td>
                                <td>{formatMatchupRate(row.selfAheadRate)}</td>
                                <td>{formatMatchupLineStats(row.sameLine)}</td>
                                <td>{formatMatchupLineStats(row.otherLine)}</td>
                                <td><span className={`ex-quality is-${row.quality}`}>{getMatchupQualityLabel(row.quality)}</span></td>
                              </tr>
                            ))}
                        </tbody></table></div>
                      ) : <EmptyState text={selectedMatchup.matchups.length ? "条件に合う同走相手がありません。" : "同走相手別データはまだありません。"} />}
                    </section>

                    {selectedMatchup.warnings.length ? (
                      <section className="ex-panel ex-section">
                        <SectionTitle eyebrow="DATA QUALITY NOTES" title="データ品質上の注意" />
                        <ul className="ex-guidance-list">{selectedMatchup.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
                      </section>
                    ) : null}
                  </>
                ) : null}
              </div>
            </section>
          </>
        )}


        <details className="ex-panel ex-section ex-raw">
          <summary>RAW STATUS / 生成状態を見る</summary>
          <div className="ex-raw-grid">
            {status ? Object.entries(status).map(([key, value]) => (
              <div className="ex-raw-item" key={key}><strong>{key}</strong><br />{Array.isArray(value) ? value.join(", ") || "[]" : String(value ?? "--")}</div>
            )) : <div className="ex-muted">読み込み中</div>}
          </div>
        </details>
      </main>
    </div>
  );
}
