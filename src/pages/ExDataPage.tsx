import { useEffect, useMemo, useState } from "react";
import {
  formatKurariExMetric,
  formatKurariExRiderMetric,
  getKurariExRiderQualityLabel,
  loadKurariExExactInitialData,
  loadKurariExInitialData,
  loadKurariExRiderExactByFile,
  loadKurariExRiderExactInitialData,
  loadKurariExVenueBundle,
  loadKurariExVenueExact,
} from "../lib/kurariExData";
import type {
  KurariExExactInitialData,
  KurariExMetric,
  KurariExInitialData,
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

export default function ExDataPage() {
  const isMobile = useIsMobile();
  const [initialData, setInitialData] = useState<KurariExInitialData | null>(null);
  const [initialStatus, setInitialStatus] = useState<"loading" | "ready" | "error">("loading");
  const [exactInitialData, setExactInitialData] = useState<KurariExExactInitialData | null>(null);
  const [exactInitialStatus, setExactInitialStatus] = useState<"loading" | "ready" | "error">("loading");
  const [activeView, setActiveView] = useState<"venue" | "player">("venue");
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [venueCache, setVenueCache] = useState<Record<string, KurariExVenueBundle>>({});
  const [venueStatus, setVenueStatus] = useState<Record<string, "loading" | "ready" | "error">>({});
  const [exactVenueCache, setExactVenueCache] = useState<Record<string, KurariExVenueExact>>({});
  const [exactVenueStatus, setExactVenueStatus] = useState<Record<string, "loading" | "ready" | "error">>({});
  const [riderInitialData, setRiderInitialData] = useState<KurariExRiderExactInitialData | null>(null);
  const [riderInitialStatus, setRiderInitialStatus] = useState<"loading" | "ready" | "error">("loading");
  const [riderQuery, setRiderQuery] = useState("");
  const [selectedRiderNo, setSelectedRiderNo] = useState<string | null>(null);
  const [riderCache, setRiderCache] = useState<Record<string, KurariExRiderExact>>({});
  const [riderStatus, setRiderStatus] = useState<Record<string, "loading" | "ready" | "error">>({});

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

  const filteredRiders = useMemo(() => {
    const normalized = normalizeSearchText(riderQuery);
    if (!normalized) return riderInitialData?.index.items ?? [];
    return (riderInitialData?.index.items ?? []).filter((item) => (
      [item.name, item.nameKey, item.registrationNo, item.prefecture, item.class]
        .some((value) => normalizeSearchText(value).includes(normalized))
    ));
  }, [riderInitialData?.index.items, riderQuery]);

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
  const sizeWarning = (status?.outputBytes ?? 0) > 20 * 1024 * 1024;
  const healthMetrics = [
    ["PERIOD", status ? `${status.dateFrom ?? "--"}〜${status.dateTo ?? "--"}` : "--", "source range"],
    ["INPUT FILES", valueText(status?.rawInputFileCount), "raw scan"],
    ["PREDICTIONS", valueText(status?.predictionFileCount), "classified"],
    ["RESULTS", valueText(status?.resultFileCount), "classified"],
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
        .ex-empty { padding: 28px; border: 1px dashed #cbc7df; border-radius: 20px; color: #78859a; background: rgba(255,255,255,.48); line-height: 1.8; }
        .ex-raw summary { cursor: pointer; font-weight: 900; color: #6552a2; }
        .ex-raw-grid { margin-top: 18px; display: grid; grid-template-columns: repeat(${isMobile ? 1 : 3},minmax(0,1fr)); gap: 9px; }
        .ex-raw-item { padding: 12px 14px; border-radius: 14px; background: #f6f7fb; color: #5b687c; font-size: 12px; overflow-wrap: anywhere; }
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
            <div className="ex-badges"><span className="ex-badge">SEED INSIGHT</span><span className="ex-badge is-exact">{exactInitialStatus === "ready" ? "EXACT ANALYTICS" : "EXACT：未生成"}</span></div>
          </aside>
        </section>

        {initialStatus === "error" ? (
          <section className="ex-panel ex-section">
            <EmptyState text="KURARI EX DATAはまだ生成されていません。private-inputへ原本を追加し、importスクリプトを実行してください。" />
          </section>
        ) : null}

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
                ["PREDICTION PARSED", valueText(exactGlobal?.coverage.predictionParsed), "available"],
                ["RESULT PARSED", valueText(exactGlobal?.coverage.resultParsed), "available"],
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
        </div>

        {activeView === "venue" ? <section className="ex-workspace">
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
                    <MetricCard label="PREDICTION PARSED" value={valueText(selectedExact.coverage.predictionParsed)} />
                    <MetricCard label="RESULT PARSED" value={valueText(selectedExact.coverage.resultParsed)} />
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
        </section> : (
          <>
            <section className="ex-panel ex-section">
              <SectionTitle eyebrow="PLAYER EX" title="選手別確定集計" lead="登録番号へ安全に紐付いた選手だけを表示。母数が少ない指標は過信しないでください。" />
              <div className="ex-eyebrow">PLAYER DATA HEALTH</div>
              <div className="ex-health-grid">
                <MetricCard label="PUBLISHED RIDERS" value={riderInitialStatus === "loading" ? "…" : valueText(riderInitialData?.status.riderCount)} />
                <MetricCard label="LOW SAMPLE" value={riderInitialStatus === "loading" ? "…" : valueText(riderInitialData?.status.qualityCounts["low-sample"])} warning={(riderInitialData?.status.qualityCounts["low-sample"] ?? 0) > 0} />
                <MetricCard label="PARTIAL" value={riderInitialStatus === "loading" ? "…" : valueText(riderInitialData?.status.qualityCounts.partial)} />
                <MetricCard label="COMPLETE" value={riderInitialStatus === "loading" ? "…" : valueText(riderInitialData?.status.qualityCounts.complete)} />
                <MetricCard label="MAX RIDER JSON" value={riderInitialStatus === "loading" ? "…" : formatBytes(riderInitialData?.status.maxFileBytes)} />
                <MetricCard label="TOTAL RIDER EX" value={riderInitialStatus === "loading" ? "…" : formatBytes(riderInitialData?.status.outputBytes)} />
              </div>
              {riderInitialStatus === "error" ? <EmptyState text="PLAYER EXのindex / statusを取得できませんでした。" /> : null}
            </section>

            <section className="ex-workspace">
              <aside className="ex-panel ex-section">
                <SectionTitle eyebrow="PLAYER EX LIST" title="公開選手" lead={`${filteredRiders.length.toLocaleString("ja-JP")} / ${(riderInitialData?.index.riderCount ?? 0).toLocaleString("ja-JP")}名`} />
                <input className="ex-search" value={riderQuery} onChange={(event) => setRiderQuery(event.target.value)} placeholder="選手名・登録番号・府県で検索" aria-label="選手名・登録番号・府県で検索" />
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
                      <div className="ex-muted">確認出走 {item.confirmedStartCount}R / 役割解析 {item.roleEligibleCount}R</div>
                    </button>
                  ))}
                  {riderInitialStatus === "ready" && filteredRiders.length === 0 ? <EmptyState text="該当する選手がいません。" /> : null}
                </div>
              </aside>

              <div className="ex-detail">
                <section className="ex-panel ex-section">
                  <SectionTitle eyebrow="PLAYER EXACT ANALYTICS" title={selectedRider?.name ?? selectedRiderItem?.name ?? "選手別確定集計"} />
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
                            {selectedRiderItem?.prefecture || "府県未取得"} / {selectedRiderItem?.class || "級班未取得"} / {selectedRider.period.from ?? "--"}〜{selectedRider.period.to ?? "--"}
                          </div>
                        </div>
                        <div className="ex-badges">
                          <span className="ex-badge is-exact">EXACT</span>
                          <RiderQualityBadge quality={selectedRider.quality} />
                          <span className="ex-badge">IDENTITY 登録番号解決済み</span>
                          <span className="ex-badge">RESOLUTION {selectedRider.identity.status}</span>
                        </div>
                      </div>
                      {selectedRider.quality === "low-sample" || selectedRider.coverage.confirmedStartCount < 5 ? (
                        <div className="ex-sample-alert"><strong>LOW SAMPLE / 母数少</strong>母数が少ないため、確定的な評価には使わず、展開判断の補助として確認してください。</div>
                      ) : null}
                    </>
                  ) : null}
                </section>

                {selectedRider ? (
                  <>
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
