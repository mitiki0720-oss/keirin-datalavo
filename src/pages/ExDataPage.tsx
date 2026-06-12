import { useEffect, useMemo, useState } from "react";
import { loadKurariExInitialData, loadKurariExVenueBundle } from "../lib/kurariExData";
import type {
  KurariExInitialData,
  KurariExVenueBundle,
  KurariExVenueListItem,
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

export default function ExDataPage() {
  const isMobile = useIsMobile();
  const [initialData, setInitialData] = useState<KurariExInitialData | null>(null);
  const [initialStatus, setInitialStatus] = useState<"loading" | "ready" | "error">("loading");
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [venueCache, setVenueCache] = useState<Record<string, KurariExVenueBundle>>({});
  const [venueStatus, setVenueStatus] = useState<Record<string, "loading" | "ready" | "error">>({});

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

  const selectVenue = (item: KurariExVenueListItem) => {
    setSelectedKey(item.venueKey);
    if (venueCache[item.venueKey] || venueStatus[item.venueKey] === "loading") return;
    setVenueStatus((current) => ({ ...current, [item.venueKey]: "loading" }));
    loadKurariExVenueBundle(item)
      .then((bundle) => {
        setVenueCache((current) => ({ ...current, [item.venueKey]: bundle }));
        setVenueStatus((current) => ({ ...current, [item.venueKey]: "ready" }));
      })
      .catch(() => {
        setVenueStatus((current) => ({ ...current, [item.venueKey]: "error" }));
      });
  };

  const filteredVenues = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return initialData?.venues ?? [];
    return (initialData?.venues ?? []).filter((item) =>
      item.venueName.includes(query.trim()) || item.venueKey.includes(normalized)
    );
  }, [initialData?.venues, query]);

  const selectedBundle = selectedKey ? venueCache[selectedKey] : null;
  const selectedLoadStatus = selectedKey ? venueStatus[selectedKey] : undefined;
  const status = initialData?.status;
  const global = initialData?.globalKpi.kpi;
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
        .ex-venue-list { display: grid; gap: 9px; max-height: ${isMobile ? "none" : "720px"}; overflow-y: ${isMobile ? "visible" : "auto"}; padding-right: 4px; }
        .ex-venue-button { width: 100%; text-align: left; cursor: pointer; border: 1px solid #e2e1ec; border-radius: 18px; padding: 15px; background: rgba(255,255,255,.76); color: #233149; }
        .ex-venue-button:hover, .ex-venue-button.is-active { border-color: #aa9ad9; background: linear-gradient(135deg,#f6f0ff,#eef9ff); box-shadow: 0 10px 24px rgba(102,83,157,.1); }
        .ex-venue-button strong { display: block; font: 800 19px/1.2 ${serif}; }
        .ex-detail { display: grid; gap: 18px; min-width: 0; }
        .ex-detail-head { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; align-items: flex-start; }
        .ex-detail-head h3 { margin: 5px 0 0; font: 850 ${isMobile ? "32px" : "44px"}/1 ${serif}; }
        .ex-badges { display: flex; flex-wrap: wrap; gap: 8px; }
        .ex-badge { display: inline-flex; padding: 7px 10px; border-radius: 999px; background: #eee9fb; color: #6653a4; font-size: 10px; font-weight: 900; letter-spacing: .08em; }
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
            <strong>SEED INSIGHT</strong>
            <div className="ex-muted">EXACT / PROXY / MANUALへ段階的に育成</div>
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
          {sizeWarning ? <div className="ex-empty">WARNING: 公開EXデータ容量が20MBを超えています。</div> : null}
          {(initialData?.index.warnings.length ?? 0) > 0 ? (
            <div className="ex-muted">WARNINGS: {initialData?.index.warnings.join(" / ")}</div>
          ) : null}
        </section>

        <section className="ex-panel ex-section">
          <SectionTitle eyebrow="QUALITY LEGEND" title="データ品質の4段階" lead="現在の公開データは主にSEED段階です。" />
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
        </section>

        <section className="ex-workspace">
          <aside className="ex-panel ex-section">
            <SectionTitle eyebrow="VENUE EX LIST" title="会場別SEED" lead="選択時に個別JSONだけを読み込みます。" />
            <input className="ex-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="会場名を検索" aria-label="会場名を検索" />
            <div className="ex-venue-list">
              {filteredVenues.map((item) => {
                const cached = venueCache[item.venueKey];
                return (
                  <button key={item.venueKey} className={`ex-venue-button${selectedKey === item.venueKey ? " is-active" : ""}`} type="button" onClick={() => selectVenue(item)}>
                    <strong>{item.venueName}</strong>
                    <div className="ex-muted">
                      {cached ? `SEED ${cached.venue.quality.seedSources}件 / Guidance ${cached.guidance?.items.length ?? 0}件 / ${cached.venue.period.from ?? "--"}〜${cached.venue.period.to ?? "--"} / ${cached.venue.quality.status.toUpperCase()}` : "選択してSEED情報を取得"}
                    </div>
                  </button>
                );
              })}
              {initialStatus === "ready" && filteredVenues.length === 0 ? <EmptyState text="該当する会場がありません。" /> : null}
            </div>
          </aside>

          <div className="ex-detail">
            <section className="ex-panel ex-section">
              <SectionTitle eyebrow="SELECTED VENUE EX" title={selectedBundle?.venue.venueName ?? "会場を選択"} />
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
