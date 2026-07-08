import { useEffect, useMemo, useState } from "react";
import {
  formatKurariExMetric,
  formatKurariExRiderMetric,
  getKurariExRaceRegistrationNoStatus,
  getSameNameCandidateWarnings,
  getKurariExRiderQualityLabel,
  KURARI_EX_ACCUMULATION_RULES,
  KURARI_EX_DATA_INVENTORY,
  KURARI_EX_TACTIC_EVENT_RULES,
  loadKurariExExactInitialData,
  loadKurariExHistoryDailyByDate,
  loadKurariExHistoryIndex,
  loadKurariExIdentitySourceConnection,
  loadKurariExInitialData,
  loadKurariExMatchupExactByFile,
  loadKurariExMatchupExactInitialData,
  loadKurariExRiderExactByFile,
  loadKurariExRiderExactInitialData,
  loadKurariExVenueBundle,
  loadKurariExVenueExact,
  summarizeKurariExHistoryDaily,
  summarizeKurariExHistoryIndex,
} from "../lib/kurariExData";
import {
  KURARI_EX_ANALYSIS_INVENTORY,
  KURARI_EX_ANALYSIS_INVENTORY_STATUSES,
  KURARI_EX_ANALYSIS_INVENTORY_SUMMARY,
  KURARI_EX_ANALYSIS_STATUS_META,
} from "../data/kurariExAnalysisInventory";
import type {
  KurariExAnalysisInventoryItem,
  KurariExAnalysisInventoryStatus,
} from "../data/kurariExAnalysisInventory";
import {
  KURARI_EX_SOURCE_CAPABILITY_AUDIT,
  KURARI_EX_SOURCE_CAPABILITY_AUDIT_SUMMARY,
  KURARI_EX_SOURCE_CAPABILITY_FOCUS_IDS,
  KURARI_EX_SOURCE_CAPABILITY_STATUSES,
  KURARI_EX_SOURCE_CAPABILITY_STATUS_META,
} from "../data/kurariExSourceCapabilityAudit";
import type {
  KurariExSourceCapabilityStatus,
} from "../data/kurariExSourceCapabilityAudit";
import {
  KURARI_EX_AVAILABLE_ANALYSIS_FOCUS,
  KURARI_EX_PARTIAL_ANALYSIS_FOCUS,
} from "../data/kurariExAvailableAnalysisFocus";
import type {
  KurariExAvailableAnalysisFocusItem,
} from "../data/kurariExAvailableAnalysisFocus";
import {
  KURARI_EX_FUTURE_ACCUMULATION_PLAN,
  KURARI_EX_FUTURE_PLAN_CURRENT_STATUSES,
  KURARI_EX_FUTURE_PLAN_PRIORITIES,
  KURARI_EX_FUTURE_PLAN_PRIORITY_LABELS,
  KURARI_EX_FUTURE_PLAN_PRIORITY_SUMMARY,
  KURARI_EX_FUTURE_PLAN_STATUS_SUMMARY,
} from "../data/kurariExFutureAccumulationPlan";
import type {
  KurariExFutureAccumulationPlanItem,
  KurariExFuturePlanCurrentStatus,
} from "../data/kurariExFutureAccumulationPlan";
import {
  KURARI_EX_SOURCE_SCHEMA_CATEGORIES,
  KURARI_EX_SOURCE_SCHEMA_CATEGORY_SUMMARY,
  KURARI_EX_SOURCE_SCHEMA_PLAN,
  KURARI_EX_SOURCE_SCHEMA_PRIORITIES,
  KURARI_EX_SOURCE_SCHEMA_PRIORITY_SUMMARY,
  KURARI_EX_SOURCE_SCHEMA_STATUSES,
  KURARI_EX_SOURCE_SCHEMA_STATUS_SUMMARY,
} from "../data/kurariExSourceSchemaPlan";
import type {
  KurariExSourceSchemaPlanItem,
  KurariExSourceSchemaStatus,
} from "../data/kurariExSourceSchemaPlan";
import type {
  KurariExExactInitialData,
  KurariExHistoryDaily,
  KurariExHistoryIndex,
  KurariExIdentitySourceConnectionSummary,
  KurariExMetric,
  KurariExInitialData,
  KurariExMatchupComparableStats,
  KurariExMatchupEntry,
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
  KurariExStartersAvailabilitySummary,
} from "../types/kurariEx";
import {
  KURARI_EX_BACKFILL_CHECKLIST,
  KURARI_EX_EXISTING_TAB_MAP,
  KURARI_EX_PREDICTION_STRUCTURE_ITEMS,
  KURARI_EX_PREDICTION_STRUCTURE_SUMMARY,
  KURARI_EX_STRUCTURE_CATEGORIES,
  KURARI_EX_STRUCTURE_CATEGORY_COLUMNS,
  loadKurariExTrifectaTrendV1,
} from "../lib/kurariExResultTrendLab";
import type {
  KurariExCoverageStatus,
  KurariExTrendCarTop3Row,
  KurariExTrendRankingRow,
  KurariExTrifectaTrendV1,
  KurariExTurbulenceBreakdownRow,
  KurariExVenueBiasSegment,
} from "../lib/kurariExResultTrendLab";
import type {
  KurariExHistoricalAvailabilitySummary,
} from "../types/kurariExHistoricalResult";
import { SiteHeader, useIsMobile } from "./PageImplementations";

const serif = '"Yu Mincho", "Hiragino Mincho ProN", "Times New Roman", serif';
const sans = '"Helvetica Neue", Arial, "Hiragino Sans", "Yu Gothic", Meiryo, sans-serif';

type ExSectionTab =
  | "overview"
  | "identity"
  | "coverage"
  | "trend"
  | "ranking"
  | "turbulence"
  | "chain"
  | "weather"
  | "venue-bias"
  | "today-flow"
  | "structure-lab"
  | "analysis";

const EX_SECTION_TABS: Array<{
  key: ExSectionTab;
  label: string;
  sublabel: string;
}> = [
  { key: "overview", label: "OVERVIEW", sublabel: "全体サマリー" },
  { key: "identity", label: "IDENTITY", sublabel: "選手source" },
  { key: "coverage", label: "DATA COVERAGE", sublabel: "自動更新・source" },
  { key: "trend", label: "TREND LAB", sublabel: "ロードマップ" },
  { key: "ranking", label: "出目ランキング", sublabel: "3連単 v1" },
  { key: "turbulence", label: "荒れ指数", sublabel: "実払戻 v1" },
  { key: "chain", label: "レース連鎖", sublabel: "transition v1" },
  { key: "weather", label: "WEATHER", sublabel: "風速×決まり手" },
  { key: "venue-bias", label: "会場クセ", sublabel: "venue bias v1" },
  { key: "today-flow", label: "今日の流れ", sublabel: "today flow meter v1" },
  { key: "structure-lab", label: "予想構造LAB", sublabel: "analysis coverage map v1" },
  { key: "analysis", label: "EX ANALYSIS", sublabel: "会場・選手・対戦" },
];

const RESULT_TREND_LOAD_TABS: ExSectionTab[] = [
  "trend",
  "ranking",
  "turbulence",
  "chain",
  "weather",
  "venue-bias",
  "today-flow",
  "structure-lab",
];

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

function sourceFreshness(value?: string | null, freshHours = 48) {
  if (!value) return { status: "unavailable" as const, label: "UNAVAILABLE" };
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return { status: "unavailable" as const, label: "UNAVAILABLE" };
  const ageHours = (Date.now() - timestamp) / 36e5;
  return ageHours <= freshHours
    ? { status: "fresh" as const, label: "FRESH" }
    : { status: "stale" as const, label: "STALE" };
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

const MATCHUP_OVERVIEW_LIMIT = 50;
const MATCHUP_OVERVIEW_SOURCE_RIDER_LIMIT = 12;

type MatchupOverviewCategory = "practical" | "low-sample" | "insufficient" | "unavailable";

type MatchupOverviewRow = {
  pairKey: string;
  registrationNoA: string;
  nameA: string;
  registrationNoB: string;
  nameB: string;
  sharedRaceCount: number;
  safeComparableRaceCount: number;
  aAheadCount: number;
  bAheadCount: number;
  sameLine: KurariExMatchupComparableStats;
  otherLine: KurariExMatchupComparableStats;
  quality: string;
  category: MatchupOverviewCategory;
};

type RelationshipMemoCategory =
  | "同県連携候補"
  | "同一ライン候補"
  | "再戦材料"
  | "ライン先頭候補"
  | "番手候補"
  | "単騎傾向"
  | "ライン分断注意";

type RelationshipMemoRow = {
  id: string;
  category: RelationshipMemoCategory;
  target: string;
  evidenceType: string;
  count: number | null;
  quality: MatchupOverviewCategory;
  note: string;
};

function orientMatchupStats(stats: KurariExMatchupComparableStats, selfIsA: boolean): KurariExMatchupComparableStats {
  if (selfIsA) return stats;
  return {
    ...stats,
    selfAheadCount: stats.opponentAheadCount,
    opponentAheadCount: stats.selfAheadCount,
    selfAheadRate: stats.opponentAheadRate,
    opponentAheadRate: stats.selfAheadRate,
  };
}

function classifyMatchupOverview(
  matchup: KurariExMatchupEntry,
  selfQuality?: string,
  opponentQuality?: string,
): MatchupOverviewCategory {
  const pairQuality = String(matchup.quality ?? "").toLowerCase();
  const normalizedSelfQuality = String(selfQuality ?? "").toLowerCase();
  const normalizedOpponentQuality = String(opponentQuality ?? "").toLowerCase();
  const safeComparableRaceCount = matchup.safeComparableRaceCount ?? 0;

  if (pairQuality === "partial" || normalizedSelfQuality === "partial" || normalizedOpponentQuality === "partial") {
    return "insufficient";
  }
  if (
    pairQuality === "low-sample" ||
    normalizedSelfQuality === "low-sample" ||
    normalizedOpponentQuality === "low-sample" ||
    (safeComparableRaceCount >= 1 && safeComparableRaceCount <= 2)
  ) {
    return "low-sample";
  }

  const hasSameLineComparison = (matchup.sameLine?.safeComparableRaceCount ?? 0) > 0;
  const hasOtherLineComparison = (matchup.otherLine?.safeComparableRaceCount ?? 0) > 0;
  const hasOnlyOneLineCategory = hasSameLineComparison !== hasOtherLineComparison;
  const hasComparableRates = matchup.selfAheadRate != null && matchup.opponentAheadRate != null;
  if (
    safeComparableRaceCount < 3 ||
    pairQuality !== "sufficient" ||
    hasOnlyOneLineCategory ||
    !hasComparableRates
  ) {
    return "insufficient";
  }
  return "practical";
}

function getMatchupOverviewCategoryLabel(category: MatchupOverviewCategory) {
  const labels: Record<MatchupOverviewCategory, string> = {
    practical: "実戦参考",
    "low-sample": "LOW SAMPLE",
    insufficient: "比較不足 / 蓄積中",
    unavailable: "未取得",
  };
  return labels[category];
}

function MatchupOverviewBadge({ category }: { category: MatchupOverviewCategory }) {
  const className = category === "practical"
    ? "is-sufficient"
    : category === "low-sample"
      ? "is-low-sample"
      : category === "insufficient"
        ? "is-partial"
        : "is-identity-only";
  return <span className={`ex-quality ${className}`}>{getMatchupOverviewCategoryLabel(category)}</span>;
}

function formatMatchupOverviewLine(stats: KurariExMatchupComparableStats) {
  if (!stats.sharedRaceCount) return "未蓄積";
  if (!stats.safeComparableRaceCount) return `${stats.sharedRaceCount}R / 比較未取得`;
  return `${stats.sharedRaceCount}R / A先着${stats.selfAheadCount} / B先着${stats.opponentAheadCount}`;
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

function HistoricalTrendSourceSummary({
  trend,
  status,
}: {
  trend: KurariExTrifectaTrendV1 | null;
  status: "idle" | "loading" | "ready" | "error";
}) {
  const summary = trend?.sourceSummary;
  const historical = summary?.historical;
  if (!summary || !historical) {
    return (
      <div className="ex-empty" data-testid="result-trend-lab-source-summary">
        <strong>60日historical傾向 + 最新current</strong><br />
        {status === "error" ? "historical loader / current feedを取得できませんでした。" : "historical loaderを確認しています。"}
      </div>
    );
  }
  return (
    <div data-testid="result-trend-lab-source-summary">
      <div className="ex-overview-status">
        <span className="ex-trend-status-pill is-ready">60日historical傾向 + 最新current</span>
        <span className={`ex-trend-status-pill is-${historical.status === "implemented" ? "ready" : "partial"}`}>
          historical status: {historical.status}
          {historical.status === "partial" ? "（正常読込）" : ""}
        </span>
        <span className="ex-trend-status-pill is-ready">
          統合集計対象: {summary.analysisRaceCount.toLocaleString("ja-JP")}R
        </span>
        <span className="ex-trend-status-pill is-partial">
          今日の流れ: 最新日current {trend.sourceDate || "unavailable"}のみ
        </span>
      </div>
      <div className="ex-trend-basis-note" data-testid="result-trend-lab-basis-note">
        <strong>母数の見方</strong>
        <div className="ex-trend-basis-row">
          <span>historical読込 <b>{historical.acceptedRaceCount.toLocaleString("ja-JP")}R</b></span>
          <span>trend対象 <b>{historical.trendEligibleRaceCount.toLocaleString("ja-JP")}R</b></span>
          <span>最新current <b>{summary.currentIncludedRaceCount.toLocaleString("ja-JP")}R</b></span>
          <span>統合集計 <b>{summary.analysisRaceCount.toLocaleString("ja-JP")}R</b></span>
        </div>
        <div className="ex-trend-basis-row is-exclusion">
          <span>trend除外 <b>{historical.nonTrendRaceCount.toLocaleString("ja-JP")}R</b></span>
          <span>同着 <b>{historical.deadHeatTrendExcludedCount.toLocaleString("ja-JP")}R</b></span>
          <span>全返還・3連単なし <b>{summary.refundNoTrifectaExcludedCount.toLocaleString("ja-JP")}R</b></span>
          <span>未確定 <b>{summary.notFinalizedExcludedCount.toLocaleString("ja-JP")}R</b></span>
        </div>
        <small>
          partialは読込失敗ではありません。保存済み{historical.nonTrendRaceCount.toLocaleString("ja-JP")}Rをtrend対象外として保持しています。
        </small>
      </div>
      <div className="ex-health-grid">
        <MetricCard
          label="HISTORICAL RANGE"
          value={`${historical.dateRange.from ?? "--"} 〜 ${historical.dateRange.to ?? "--"}`}
          note={`${historical.shardCount.toLocaleString("ja-JP")}日 + current`}
        />
        <MetricCard
          label="LOADED SHARDS"
          value={`${historical.loadedShardCount.toLocaleString("ja-JP")} / ${historical.shardCount.toLocaleString("ja-JP")}`}
          warning={historical.loadedShardCount !== historical.shardCount}
        />
        <MetricCard
          label="HISTORICAL 読込"
          value={`${historical.acceptedRaceCount.toLocaleString("ja-JP")}R`}
          note={`accepted / index raceCount ${historical.raceCount.toLocaleString("ja-JP")}R`}
        />
        <MetricCard
          label="REJECTED RACES"
          value={historical.rejectedRaceCount.toLocaleString("ja-JP")}
          warning={historical.rejectedRaceCount > 0}
        />
        <MetricCard
          label="HISTORICAL TREND対象"
          value={`${historical.trendEligibleRaceCount.toLocaleString("ja-JP")}R`}
          note="60日historicalの6分析母数"
        />
        <MetricCard
          label="NON-TREND 除外"
          value={`${historical.nonTrendRaceCount.toLocaleString("ja-JP")}R`}
          note={`同着 ${historical.deadHeatTrendExcludedCount}R / 全返還等 ${summary.refundNoTrifectaExcludedCount}R / 未確定 ${summary.notFinalizedExcludedCount}R`}
          warning={historical.nonTrendRaceCount > 0}
        />
        <MetricCard
          label="DEAD HEAT EXCLUDED"
          value={historical.deadHeatTrendExcludedCount.toLocaleString("ja-JP")}
          warning={historical.deadHeatTrendExcludedCount > 0}
        />
        <MetricCard
          label="REFUND / NO TRIFECTA"
          value={summary.refundNoTrifectaExcludedCount.toLocaleString("ja-JP")}
          warning={summary.refundNoTrifectaExcludedCount > 0}
        />
        <MetricCard
          label="NOT FINALIZED"
          value={summary.notFinalizedExcludedCount.toLocaleString("ja-JP")}
          warning={summary.notFinalizedExcludedCount > 0}
        />
        <MetricCard
          label="SOURCE REJECTED"
          value={summary.sourceRejectedCount.toLocaleString("ja-JP")}
          warning={summary.sourceRejectedCount > 0}
        />
        <MetricCard
          label="最新 CURRENT TREND対象"
          value={`${summary.currentIncludedRaceCount.toLocaleString("ja-JP")} / ${summary.currentRaceCount.toLocaleString("ja-JP")}R`}
          note={`統合に採用 / current trend除外 ${summary.currentExcludedRaceCount.toLocaleString("ja-JP")}R`}
        />
        <MetricCard
          label="RACEKEY DEDUP"
          value={summary.crossSourceDuplicateCount.toLocaleString("ja-JP")}
          note="historical優先でcurrent重複を除外"
          warning={summary.crossSourceDuplicateCount > 0}
        />
      </div>
    </div>
  );
}

function TrendRankingCard({
  title,
  rows,
  top3Rate = false,
}: {
  title: string;
  rows: Array<KurariExTrendRankingRow | KurariExTrendCarTop3Row>;
  top3Rate?: boolean;
}) {
  return (
    <article className="ex-trend-ranking-card">
      <div className="ex-trend-ranking-head">
        <h3>{title}</h3>
        <span>TOP {Math.min(rows.length, 10)}</span>
      </div>
      {rows.length ? (
        <ol className="ex-trend-ranking-list">
          {rows.slice(0, 10).map((row, index) => (
            <li key={row.key}>
              <span className="ex-trend-rank">{index + 1}</span>
              <strong>{row.label}</strong>
              <span>{row.count.toLocaleString("ja-JP")}回</span>
              <b>{row.rate.toFixed(1)}%</b>
              {top3Rate && "eligibleStarts" in row ? (
                <small>{row.count.toLocaleString("ja-JP")} / {row.eligibleStarts.toLocaleString("ja-JP")}出走</small>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <div className="ex-muted">No eligible official result data</div>
      )}
    </article>
  );
}

function formatPayoutYen(value: number | null) {
  return value == null ? "未取得" : `${value.toLocaleString("ja-JP")}円`;
}

function venueBiasSegmentStatusClass(status: KurariExVenueBiasSegment["sampleStatus"]) {
  return status === "strong" ? "ready" : status === "medium" ? "partial" : "warning";
}

function VenueBiasSegmentCard({ segment }: { segment: KurariExVenueBiasSegment }) {
  return (
    <article className="ex-venue-bias-card">
      <div className="ex-venue-bias-card-head">
        <div>
          <div className="ex-eyebrow">{segment.venueCode || "VENUE"} / {segment.segmentLabel}</div>
          <h3>{segment.venueName}</h3>
        </div>
        <span className={`ex-location-status is-${venueBiasSegmentStatusClass(segment.sampleStatus)}`}>
          {segment.sampleSize.toLocaleString("ja-JP")}R / {segment.sampleStatus}
        </span>
      </div>
      <div className="ex-venue-bias-metrics">
        <div>外枠絡み率<strong>{segment.outsideInvolvementRate.toFixed(1)}%</strong></div>
        <div>1番車飛び率<strong>{segment.oneCarEligibleCount ? `${segment.oneCarOutRate.toFixed(1)}%` : "--"}</strong></div>
        <div>万車券率<strong>{segment.highPayoutRate.toFixed(1)}%</strong></div>
        <div>平均3連単<strong>{formatPayoutYen(segment.averageTrifectaPayoutYen)}</strong></div>
        <div>逃げ決着率<strong>{segment.decisionEligibleCount ? `${segment.escapeRate.toFixed(1)}%` : "--"}</strong></div>
        <div>捲り決着率<strong>{segment.decisionEligibleCount ? `${segment.sprintRate.toFixed(1)}%` : "--"}</strong></div>
      </div>
    </article>
  );
}

function TurbulenceBreakdownTable({
  title,
  rows,
  emptyText,
}: {
  title: string;
  rows: KurariExTurbulenceBreakdownRow[];
  emptyText: string;
}) {
  return (
    <article className="ex-turbulence-breakdown">
      <div className="ex-location-head">
        <h3>{title}</h3>
        <span className="ex-location-status is-partial">LOW SAMPLE AWARE</span>
      </div>
      {rows.length ? (
        <div className="ex-table-wrap">
          <table className="ex-data-table ex-turbulence-table">
            <thead>
              <tr>
                <th>区分</th>
                <th>sample</th>
                <th>平均3連単</th>
                <th>中央値</th>
                <th>最大</th>
                <th>sample status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td><strong>{row.label}</strong></td>
                  <td>{row.sampleSize.toLocaleString("ja-JP")}R</td>
                  <td>{formatPayoutYen(row.averagePayoutYen)}</td>
                  <td>{formatPayoutYen(row.medianPayoutYen)}</td>
                  <td>{formatPayoutYen(row.maxPayoutYen)}</td>
                  <td>
                    <span className={`ex-trend-status-pill is-${row.sampleStatus}`}>
                      {row.sampleLabel}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="ex-muted">{emptyText}</div>
      )}
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

const COVERAGE_STATUS_LABELS: Record<KurariExCoverageStatus, string> = {
  implemented: "implemented",
  partial: "partial",
  "future-accumulation": "future-accumulation",
  unavailable: "unavailable",
  "not-published": "データ未掲載",
};

function CoverageStatusPill({ status }: { status: KurariExCoverageStatus }) {
  return <span className={`ex-coverage-status is-${status}`}>{COVERAGE_STATUS_LABELS[status]}</span>;
}

const KURARI_EX_ANALYSIS_INVENTORY_BY_CATEGORY = Array.from(
  KURARI_EX_ANALYSIS_INVENTORY.reduce((categories, inventoryItem) => {
    const categoryItems = categories.get(inventoryItem.category) ?? [];
    categoryItems.push(inventoryItem);
    categories.set(inventoryItem.category, categoryItems);
    return categories;
  }, new Map<string, KurariExAnalysisInventoryItem[]>()),
);

function AnalysisInventoryStatusBadge({ status }: { status: KurariExAnalysisInventoryStatus }) {
  const className = status.replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "");
  return (
    <span className={`ex-analysis-inventory-status is-${className}`}>
      {KURARI_EX_ANALYSIS_STATUS_META[status].label}
    </span>
  );
}

const KURARI_EX_SOURCE_CAPABILITY_FOCUS_ITEMS = KURARI_EX_SOURCE_CAPABILITY_FOCUS_IDS
  .map((id) => KURARI_EX_SOURCE_CAPABILITY_AUDIT.find((auditItem) => auditItem.id === id))
  .filter((auditItem): auditItem is (typeof KURARI_EX_SOURCE_CAPABILITY_AUDIT)[number] => Boolean(auditItem));

function SourceCapabilityStatusBadge({ status }: { status: KurariExSourceCapabilityStatus }) {
  return (
    <span className={`ex-source-capability-status is-${status}`}>
      {KURARI_EX_SOURCE_CAPABILITY_STATUS_META[status].label}
    </span>
  );
}

function AvailableAnalysisFocusCard({ item }: { item: KurariExAvailableAnalysisFocusItem }) {
  return (
    <article className="ex-available-focus-card">
      <div className="ex-available-focus-head">
        <h3>{item.label}</h3>
        <SourceCapabilityStatusBadge status={item.capabilityStatus} />
      </div>
      <div className="ex-available-focus-section">
        sourceKey: {item.sourceKey.join(" / ")}<br />
        見る場所: {item.existingSection}
      </div>
      <p>{item.practicalUse}</p>
      <ul className="ex-available-focus-signals">
        {item.safeSignals.map((signal) => <li key={`${item.id}:${signal}`}>{signal}</li>)}
      </ul>
      <div className="ex-available-focus-caution">注意: {item.caution}</div>
      <div className="ex-available-focus-next">次の拡張: {item.nextUpgrade}</div>
    </article>
  );
}

const FUTURE_PLAN_STATUS_LABELS: Record<KurariExFuturePlanCurrentStatus, string> = {
  partial: "PARTIAL",
  "future-accumulation": "FUTURE",
  unavailable: "UNAVAILABLE",
  "fake-prohibited": "FAKE PROHIBITED",
};

function FutureAccumulationPlanCard({ item }: { item: KurariExFutureAccumulationPlanItem }) {
  return (
    <article className={`ex-future-plan-card is-${item.priority}`}>
      <div className="ex-future-plan-head">
        <div>
          <span>{KURARI_EX_FUTURE_PLAN_PRIORITY_LABELS[item.priority]}</span>
          <h3>{item.label}</h3>
        </div>
        <span className={`ex-future-plan-status is-${item.currentStatus}`}>
          {FUTURE_PLAN_STATUS_LABELS[item.currentStatus]}
        </span>
      </div>
      <div className="ex-future-plan-fields">
        <b>必要な保存項目</b>
        <span>{item.requiredSourceFields.join(" / ")}</span>
      </div>
      <p><b>fakeリスク</b>{item.fakeRisk}</p>
      <p><b>available昇格条件</b>{item.promotionCondition}</p>
      <p><b>次の実装ステップ</b>{item.nextImplementationStep}</p>
    </article>
  );
}

const SOURCE_SCHEMA_STATUS_LABELS: Record<KurariExSourceSchemaStatus, string> = {
  "design-only": "DESIGN ONLY",
  "ready-for-script": "READY FOR SCRIPT",
  "blocked-by-source": "BLOCKED BY SOURCE",
  "fake-prohibited": "FAKE PROHIBITED",
};

function SourceSchemaPlanCard({ item }: { item: KurariExSourceSchemaPlanItem }) {
  return (
    <article className={`ex-source-schema-card is-${item.priority}`}>
      <div className="ex-source-schema-head">
        <div>
          <span>{item.category} / {item.priority.toUpperCase()}</span>
          <h3>{item.label}</h3>
        </div>
        <span className={`ex-source-schema-status is-${item.schemaStatus}`}>
          {SOURCE_SCHEMA_STATUS_LABELS[item.schemaStatus]}
        </span>
      </div>
      <div className="ex-source-schema-target">
        <b>targetOutput</b>
        <span>{item.targetOutput.join(" / ")}</span>
      </div>
      <div className="ex-source-schema-columns">
        <div><b>requiredRawFields</b><span>{item.requiredRawFields.join(" / ")}</span></div>
        <div><b>normalizedFields</b><span>{item.normalizedFields.join(" / ")}</span></div>
      </div>
      <div className="ex-source-schema-rules">
        <div>
          <b>validationRules</b>
          <ul>{item.validationRules.map((rule) => <li key={`${item.id}:validation:${rule}`}>{rule}</li>)}</ul>
        </div>
        <div className="is-fake">
          <b>fakeProhibitedRules</b>
          <ul>{item.fakeProhibitedRules.map((rule) => <li key={`${item.id}:fake:${rule}`}>{rule}</li>)}</ul>
        </div>
      </div>
      <div className="ex-source-schema-script"><b>nextScriptCandidate</b>{item.nextScriptCandidate}</div>
    </article>
  );
}

type ExLocationTone = "ready" | "partial" | "pending" | "fixed" | "warning";

function ExLocationCard({
  title,
  status,
  tone,
  items,
  note,
}: {
  title: string;
  status: string;
  tone: ExLocationTone;
  items: Array<{ label: string; value: string }>;
  note?: string;
}) {
  return (
    <article className="ex-location-card">
      <div className="ex-location-head">
        <h3>{title}</h3>
        <span className={`ex-location-status is-${tone}`}>{status}</span>
      </div>
      <div className="ex-location-rows">
        {items.map((item) => (
          <div className="ex-location-row" key={`${title}:${item.label}`}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
      {note ? <p className="ex-location-note">{note}</p> : null}
    </article>
  );
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

const RIDER_EXACT_OVERVIEW_LIMIT = 50;

type RiderOverviewFilterKey =
  | "practical"
  | "low-sample"
  | "identity-only"
  | "registration-match"
  | "name-match"
  | "unresolved"
  | "matchup"
  | "condition"
  | "role"
  | "weather";

const RIDER_OVERVIEW_FILTERS: Array<{ key: RiderOverviewFilterKey; label: string; note: string }> = [
  { key: "practical", label: "実戦根拠あり", note: "identity-onlyとLOW SAMPLEを除き、確認出走5R以上" },
  { key: "low-sample", label: "LOW SAMPLE", note: "母数少・参考扱い" },
  { key: "identity-only", label: "素材蓄積中", note: "登録・識別中心で成績根拠にしない" },
  { key: "registration-match", label: "登録番号一致", note: "identity.statusがregistration-noの場合のみ" },
  { key: "name-match", label: "名前一致", note: "保存済みの名前一致・同一登録番号名寄せのみ" },
  { key: "unresolved", label: "未解決", note: "registrationNoResolvedがfalseの場合のみ" },
  { key: "matchup", label: "MATCHUPあり", note: "保存済みMATCHUP indexに存在" },
  { key: "condition", label: "条件別あり", note: "保存済みbyBankLength / byTimeslot / byRaceStageのいずれかあり" },
  { key: "role", label: "役割別あり", note: "保存済みbyRoleに対象実績あり" },
  { key: "weather", label: "天候別あり", note: "保存済みbyWeatherあり" },
];

const RIDER_OVERVIEW_INDEX_FILTERS = new Set<RiderOverviewFilterKey>([
  "practical",
  "low-sample",
  "identity-only",
  "matchup",
]);

function getRiderOverviewQualityRank(item: KurariExRiderExactIndexItem) {
  if (item.quality === "identity-only") return 2;
  if (item.quality === "low-sample" || item.confirmedStartCount < 5) return 1;
  return 0;
}

function getRiderOverviewQualityLabel(item: KurariExRiderExactIndexItem) {
  const rank = getRiderOverviewQualityRank(item);
  if (rank === 2) return "素材蓄積中";
  if (rank === 1) return "LOW SAMPLE";
  return "実戦根拠あり";
}

function getRiderIdentityLabel(rider?: KurariExRiderExact) {
  if (!rider) return "確認中";
  if (!rider.identity.registrationNoResolved) return "紐付け：確認中";
  const labels: Record<KurariExRiderExact["identity"]["status"], string> = {
    "registration-no": "登録番号一致",
    "unique-player-card-name": "名前一致 / 補助一致",
    "same-registration-name": "名前一致 / 同一登録番号",
    "manual-override": "補助一致 / 手動確認",
  };
  return labels[rider.identity.status] ?? "紐付け：確認中";
}

function formatRiderOverviewRate(rate?: number | null) {
  return rate == null ? "未取得" : `${rate.toFixed(1)}%`;
}

function RiderExactOverviewStats({ item, rider }: { item: KurariExRiderExactIndexItem; rider?: KurariExRiderExact }) {
  if (!rider) return <span className="ex-muted">読込中</span>;
  if (item.quality === "identity-only") return <span className="ex-muted">成績未蓄積</span>;
  return (
    <>
      <span>出走 {rider.overall.starts ?? "未取得"} / 1着 {rider.overall.wins} / 2着 {rider.overall.seconds} / 3着 {rider.overall.thirds} / 着外 {rider.overall.outside ?? "未取得"}</span>
      <span className="ex-rider-overview-rates">
        勝率 {formatRiderOverviewRate(rider.overall.winRate.rate)} / 2連対率 {formatRiderOverviewRate(rider.overall.top2Rate.rate)} / 3連対率 {formatRiderOverviewRate(rider.overall.top3Rate.rate)}
      </span>
    </>
  );
}

function RiderExactOverviewMethods({ item, rider }: { item: KurariExRiderExactIndexItem; rider?: KurariExRiderExact }) {
  if (!rider) return <span className="ex-muted">読込中</span>;
  if (item.quality === "identity-only") return <span className="ex-muted">未蓄積</span>;
  return (
    <span>
      逃げ {rider.winningMethods.escape.count} / 捲り {rider.winningMethods.sprint.count} / 差し {rider.winningMethods.difference.count} / マーク 未蓄積
    </span>
  );
}

function matchesRiderOverviewExactFilter(
  filter: RiderOverviewFilterKey,
  rider: KurariExRiderExact | undefined,
) {
  if (!rider) return false;
  if (filter === "registration-match") return rider.identity.registrationNoResolved && rider.identity.status === "registration-no";
  if (filter === "name-match") {
    return rider.identity.registrationNoResolved &&
      (rider.identity.status === "unique-player-card-name" || rider.identity.status === "same-registration-name");
  }
  if (filter === "unresolved") return !rider.identity.registrationNoResolved;
  if (filter === "condition") {
    return rider.byBankLength.length > 0 || rider.byTimeslot.length > 0 || rider.byRaceStage.length > 0;
  }
  if (filter === "role") {
    return Boolean(rider.byRole && Object.values(rider.byRole).some((aggregate) => (aggregate?.starts ?? 0) > 0));
  }
  if (filter === "weather") return rider.byWeather.length > 0;
  return true;
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
const RIDER_COVERAGE_AUDIT_URL = "/data/analytics/kurari-ex/audit/rider-coverage-audit.generated.json";

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

type KurariExConditionDataTab = "bankLength" | "timeslot" | "raceStage" | "weather";

const KURARI_EX_CONDITION_DATA_TABS: Array<{
  key: KurariExConditionDataTab;
  label: string;
  dimensionKey: string;
  items: Array<{ key: string; label: string }>;
  note: string;
}> = [
  {
    key: "bankLength",
    label: "周長別",
    dimensionKey: "bankLength",
    items: [
      { key: "333", label: "333m" },
      { key: "400", label: "400m" },
      { key: "500", label: "500m" },
    ],
    note: "会場周長を確定できた保存済みbyBankLengthだけを集計しています。",
  },
  {
    key: "timeslot",
    label: "時間帯別",
    dimensionKey: "timeslot",
    items: [
      { key: "morning", label: "モーニング" },
      { key: "day", label: "デイ" },
      { key: "night", label: "ナイター" },
      { key: "midnight", label: "ミッドナイト" },
    ],
    note: "不明時間帯を除き、保存済みbyTimeslotの確定分類だけを表示しています。",
  },
  {
    key: "raceStage",
    label: "レース種目別",
    dimensionKey: "raceStage",
    items: [
      { key: "qualifying", label: "予選" },
      { key: "consolation", label: "一般・敗者戦" },
      { key: "seed-special", label: "特選・シード" },
      { key: "final", label: "決勝" },
    ],
    note: "安全に分類済みのbyRaceStageだけを表示します。準決勝・不明・グレード×レース種目は混在させません。",
  },
  {
    key: "weather",
    label: "天候別",
    dimensionKey: "weather",
    items: [
      { key: "sunny", label: "晴れ" },
      { key: "cloudy", label: "曇り" },
      { key: "rain", label: "雨" },
      { key: "snow", label: "雪" },
    ],
    note: "保存済みbyWeatherのみ表示します。実結果天候を優先し、未取得時は取得済み予報だけを使用します。",
  },
];

type KurariExRoleDataTab = "front" | "bante" | "third" | "single";

const KURARI_EX_ROLE_DATA_TABS: Array<{
  key: KurariExRoleDataTab;
  label: string;
  description: string;
}> = [
  {
    key: "front",
    label: "ライン先頭",
    description: "安全な並び情報からライン先頭と判定できた場合だけ集計。主導権を取りに行く可能性は確認しますが、脚質だけでは断定しません。",
  },
  {
    key: "bante",
    label: "番手",
    description: "安全に解釈できる並び情報から、ライン先頭の直後と判定できた場合だけ集計します。",
  },
  {
    key: "third",
    label: "3番手以降",
    description: "安全に解釈できる並び情報から3番手以降と判定でき、保存済みbyRole.thirdがある場合だけ集計します。",
  },
  {
    key: "single",
    label: "単騎",
    description: "ラインに属さないと安全に判定できる場合だけ集計し、位置不明の選手を単騎に補完しません。",
  },
];

function formatRiderCategoryRate(value: number | null | undefined) {
  return Number.isFinite(value) ? `${Number(value).toFixed(1)}%` : "未取得";
}

function ConditionQualityBadge({ item }: { item: KurariExRiderCategoryItem | null }) {
  if (!item) return <span className="ex-quality is-identity-only">未蓄積</span>;
  if (item.quality === "low-sample" || item.starts < 5) {
    return <span className="ex-quality is-low-sample">LOW SAMPLE</span>;
  }
  return <span className="ex-quality is-complete">EXACT</span>;
}

function getRiderCategoryGeneratedAgeHours(generatedAt: string | null | undefined) {
  const generatedTime = Date.parse(generatedAt ?? "");
  if (!Number.isFinite(generatedTime)) return null;
  return (Date.now() - generatedTime) / 36e5;
}

function isRiderCategoryGeneratedStale(generatedAt: string | null | undefined) {
  const ageHours = getRiderCategoryGeneratedAgeHours(generatedAt);
  return ageHours === null || ageHours > 36;
}

function getRiderCategoryGeneratedNote(generatedAt: string | null | undefined) {
  const ageHours = getRiderCategoryGeneratedAgeHours(generatedAt);
  if (ageHours === null) return "生成時刻を確認できません";
  return ageHours > 36 ? "36時間超 / 更新注意" : "自動生成時刻";
}
function getRiderCategoryUseLabel(item: KurariExRiderCategoryItem) {
  if (item.quality === "low-sample" || item.starts < 5) return "参考";
  if (Number.isFinite(item.winRate) && Number(item.winRate) >= 20) return "頭候補";
  if (Number.isFinite(item.top2Rate) && Number(item.top2Rate) >= 40) return "連軸";
  if (Number.isFinite(item.top3Rate) && Number(item.top3Rate) >= 55) return "3着保護";
  return "確認";
}

function getRiderCategoryUseRank(item: KurariExRiderCategoryItem) {
  const label = getRiderCategoryUseLabel(item);
  if (label === "頭候補") return 1;
  if (label === "連軸") return 2;
  if (label === "3着保護") return 3;
  if (label === "確認") return 4;
  return 5;
}

async function loadKurariExRiderCategoryAnalysis(): Promise<KurariExRiderCategoryAnalysis> {
  const response = await fetch(toExPublicPath(RIDER_CATEGORY_ANALYSIS_URL), { cache: "no-store" });
  if (!response.ok) throw new Error("KURARI EX rider category analysis fetch failed: " + response.status);
  return response.json() as Promise<KurariExRiderCategoryAnalysis>;
}


type KurariExRiderCoverageAuditName = {
  nameKey: string;
  displayName: string;
  observationCount: number;
  raceCount?: number;
  carNos?: string[];
  sampleRaceKeys?: string[];
  candidates?: string[];
  coverageStatus?: string;
  sourceType?: string;
};

type KurariExRiderCoverageAudit = {
  schemaVersion: number;
  generatedAt: string;
  sourceType: string;
  coverageStatus: string;
  normalizedRaceCount: number;
  racesWithStarterArray: number;
  racesWithCompleteStarterArray: number;
  racesWithAnyRegistrationNo: number;
  racesWithCompleteRegistrationNo: number;
  eligiblePublicRiderCount: number;
  unresolvedNameCount: number;
  unresolvedObservationCount: number;
  ambiguousNameCount: number;
  ambiguousObservationCount: number;
  topUnresolvedNames: KurariExRiderCoverageAuditName[];
  unresolvedNames: KurariExRiderCoverageAuditName[];
  ambiguousNames: KurariExRiderCoverageAuditName[];
  warnings?: string[];
  policy?: {
    fakeProhibited?: boolean;
    unresolvedHandling?: string;
    note?: string;
  };
};

async function loadKurariExRiderCoverageAudit(): Promise<KurariExRiderCoverageAudit> {
  const response = await fetch(toExPublicPath(RIDER_COVERAGE_AUDIT_URL), { cache: "no-store" });
  if (!response.ok) throw new Error("KURARI EX rider coverage audit fetch failed: " + response.status);
  return response.json() as Promise<KurariExRiderCoverageAudit>;
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
  const [activeSectionTab, setActiveSectionTab] = useState<ExSectionTab>("overview");
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
  const [riderOverviewCache, setRiderOverviewCache] = useState<Record<string, KurariExRiderExact>>({});
  const [riderOverviewStatus, setRiderOverviewStatus] = useState<"loading" | "ready" | "error">("loading");
  const [riderOverviewQuery, setRiderOverviewQuery] = useState("");
  const [riderOverviewFilters, setRiderOverviewFilters] = useState<RiderOverviewFilterKey[]>([]);
  const [riderFilteredCache, setRiderFilteredCache] = useState<Record<string, KurariExRiderExact>>({});
  const [riderFilteredStatus, setRiderFilteredStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [matchupInitialData, setMatchupInitialData] = useState<KurariExMatchupExactInitialData | null>(null);
  const [matchupInitialStatus, setMatchupInitialStatus] = useState<"loading" | "ready" | "error">("loading");
  const [matchupQuery, setMatchupQuery] = useState("");
  const [selectedMatchupRiderNo, setSelectedMatchupRiderNo] = useState<string | null>(null);
  const [matchupFilterMode, setMatchupFilterMode] = useState<"all" | "advantage" | "danger" | "sample" | "strong" | "risk" | "sameLine" | "otherLine">("all");
  const [matchupCache, setMatchupCache] = useState<Record<string, KurariExMatchupExact>>({});
  const [matchupStatus, setMatchupStatus] = useState<Record<string, "loading" | "ready" | "error">>({});
  const [matchupOverviewRows, setMatchupOverviewRows] = useState<MatchupOverviewRow[]>([]);
  const [matchupOverviewStatus, setMatchupOverviewStatus] = useState<"loading" | "ready" | "error">("loading");
  const [shbNameIndex, setShbNameIndex] = useState<KurariExShbNameIndex | null>(null);
  const [shbNameStatus, setShbNameStatus] = useState<"loading" | "ready" | "error">("loading");
  const [venueScoreAnalysis, setVenueScoreAnalysis] = useState<KurariExVenueScoreAnalysis | null>(null);
  const [venueScoreStatus, setVenueScoreStatus] = useState<"loading" | "ready" | "error">("loading");
  const [riderScoreAnalysis, setRiderScoreAnalysis] = useState<KurariExRiderScoreAnalysis | null>(null);
  const [riderScoreStatus, setRiderScoreStatus] = useState<"loading" | "ready" | "error">("loading");
  const [riderCategoryAnalysis, setRiderCategoryAnalysis] = useState<KurariExRiderCategoryAnalysis | null>(null);
  const [riderCategoryStatus, setRiderCategoryStatus] = useState<"loading" | "ready" | "error">("loading");
  const [conditionDataTab, setConditionDataTab] = useState<KurariExConditionDataTab>("bankLength");
  const [roleDataTab, setRoleDataTab] = useState<KurariExRoleDataTab>("front");
  const [riderCoverageAudit, setRiderCoverageAudit] = useState<KurariExRiderCoverageAudit | null>(null);
  const [riderCoverageAuditStatus, setRiderCoverageAuditStatus] = useState<"loading" | "ready" | "error">("loading");
  const [todayRecommendation, setTodayRecommendation] = useState<KurariExTodayRecommendation | null>(null);
  const [todayRecommendationStatus, setTodayRecommendationStatus] = useState<"loading" | "ready" | "error">("loading");
  const [startersSourceSummary, setStartersSourceSummary] = useState<KurariExStartersAvailabilitySummary | null>(null);
  const [startersSourceStatus, setStartersSourceStatus] = useState<"loading" | "ready" | "error">("loading");
  const [identitySourceSummary, setIdentitySourceSummary] = useState<KurariExIdentitySourceConnectionSummary | null>(null);
  const [identitySourceStatus, setIdentitySourceStatus] = useState<"loading" | "ready" | "error">("loading");
  const [historyIndex, setHistoryIndex] = useState<KurariExHistoryIndex | null>(null);
  const [historyIndexStatus, setHistoryIndexStatus] = useState<"loading" | "ready" | "error">("loading");
  const [historyIndexError, setHistoryIndexError] = useState<string | null>(null);
  const [selectedHistoryDate, setSelectedHistoryDate] = useState("");
  const [historyDaily, setHistoryDaily] = useState<KurariExHistoryDaily | null>(null);
  const [historyDailyStatus, setHistoryDailyStatus] = useState<"idle" | "loading" | "ready" | "empty" | "error">("idle");
  const [historyDailyError, setHistoryDailyError] = useState<string | null>(null);
  const [trifectaTrend, setTrifectaTrend] = useState<KurariExTrifectaTrendV1 | null>(null);
  const [trifectaTrendStatus, setTrifectaTrendStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [historicalAvailability, setHistoricalAvailability] =
    useState<KurariExHistoricalAvailabilitySummary | null>(null);
  const [historicalAvailabilityStatus, setHistoricalAvailabilityStatus] =
    useState<"idle" | "loading" | "ready">("idle");

  useEffect(() => {
    if (!RESULT_TREND_LOAD_TABS.includes(activeSectionTab) || trifectaTrend) return;
    let active = true;
    loadKurariExTrifectaTrendV1()
      .then((trend) => {
        if (!active) return;
        setTrifectaTrend(trend);
        setTrifectaTrendStatus("ready");
        setHistoricalAvailability(trend.sourceSummary?.historical ?? null);
        setHistoricalAvailabilityStatus("ready");
      })
      .catch(() => {
        if (!active) return;
        setTrifectaTrend(null);
        setTrifectaTrendStatus("error");
        setHistoricalAvailability(null);
        setHistoricalAvailabilityStatus("ready");
      });
    return () => {
      active = false;
    };
  }, [activeSectionTab, trifectaTrend]);

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
    loadKurariExIdentitySourceConnection()
      .then(({ summary, startersSource }) => {
        if (!active) return;
        setIdentitySourceSummary(summary);
        setIdentitySourceStatus("ready");
        setStartersSourceSummary(startersSource?.summary ?? null);
        setStartersSourceStatus(startersSource ? "ready" : "error");
      })
      .catch(() => {
        if (!active) return;
        setIdentitySourceSummary(null);
        setIdentitySourceStatus("error");
        setStartersSourceSummary(null);
        setStartersSourceStatus("error");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    loadKurariExHistoryIndex()
      .then((index) => {
        if (!active) return;
        const summary = summarizeKurariExHistoryIndex(index);
        setHistoryIndex(index);
        setSelectedHistoryDate(summary.latestDate ?? "");
        setHistoryIndexStatus("ready");
        setHistoryIndexError(null);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setHistoryIndexStatus("error");
        setHistoryIndexError(error instanceof Error ? error.message : "History index load failed.");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!historyIndex || !selectedHistoryDate) return;
    let active = true;
    setHistoryDailyStatus("loading");
    setHistoryDailyError(null);
    loadKurariExHistoryDailyByDate(selectedHistoryDate, historyIndex)
      .then((daily) => {
        if (!active) return;
        setHistoryDaily(daily);
        setHistoryDailyStatus(daily ? "ready" : "empty");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setHistoryDaily(null);
        setHistoryDailyStatus("error");
        setHistoryDailyError(error instanceof Error ? error.message : "History daily load failed.");
      });
    return () => {
      active = false;
    };
  }, [historyIndex, selectedHistoryDate]);

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

  const historyIndexSummary = useMemo(
    () => historyIndex ? summarizeKurariExHistoryIndex(historyIndex) : null,
    [historyIndex],
  );
  const historyDailySummary = useMemo(
    () => historyDaily ? summarizeKurariExHistoryDaily(historyDaily) : null,
    [historyDaily],
  );
  const historyIdentityWarnings = useMemo(
    () => historyDaily ? getSameNameCandidateWarnings(historyDaily) : [],
    [historyDaily],
  );

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
  }, []);    useEffect(() => {
      let active = true;
      loadKurariExRiderCoverageAudit()
        .then((data) => {
          if (!active) return;
          setRiderCoverageAudit(data);
          setRiderCoverageAuditStatus("ready");
        })
        .catch(() => {
          if (!active) return;
          setRiderCoverageAuditStatus("error");
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

  const riderOverviewItems = useMemo(
    () => [...(riderInitialData?.index.items ?? [])]
      .sort((left, right) =>
        getRiderOverviewQualityRank(left) - getRiderOverviewQualityRank(right) ||
        left.name.localeCompare(right.name, "ja") ||
        left.registrationNo.localeCompare(right.registrationNo)
      )
      .slice(0, RIDER_EXACT_OVERVIEW_LIMIT),
    [riderInitialData?.index.items],
  );
  const riderOverviewFilterActive = riderOverviewQuery.trim().length > 0 || riderOverviewFilters.length > 0;
  const matchupRiderRegistrationNos = useMemo(
    () => new Set((matchupInitialData?.index.items ?? []).map((item) => item.registrationNo)),
    [matchupInitialData?.index.items],
  );
  const riderOverviewCandidateItems = useMemo(() => {
    const normalizedQuery = normalizeSearchText(riderOverviewQuery);
    return [...(riderInitialData?.index.items ?? [])]
      .filter((item) => {
        if (normalizedQuery) {
          const matchesQuery = [item.name, item.nameKey, item.registrationNo, item.prefecture, item.class]
            .some((value) => normalizeSearchText(value).includes(normalizedQuery));
          if (!matchesQuery) return false;
        }
        return riderOverviewFilters
          .filter((filter) => RIDER_OVERVIEW_INDEX_FILTERS.has(filter))
          .every((filter) => {
            if (filter === "practical") return getRiderOverviewQualityRank(item) === 0;
            if (filter === "low-sample") return getRiderOverviewQualityRank(item) === 1;
            if (filter === "identity-only") return getRiderOverviewQualityRank(item) === 2;
            if (filter === "matchup") return matchupRiderRegistrationNos.has(item.registrationNo);
            return true;
          });
      })
      .sort((left, right) =>
        getRiderOverviewQualityRank(left) - getRiderOverviewQualityRank(right) ||
        left.name.localeCompare(right.name, "ja") ||
        left.registrationNo.localeCompare(right.registrationNo)
      );
  }, [
    matchupRiderRegistrationNos,
    riderInitialData?.index.items,
    riderOverviewFilters,
    riderOverviewQuery,
  ]);
  const riderOverviewLoadItems = useMemo(
    () => (riderOverviewFilterActive ? riderOverviewCandidateItems.slice(0, RIDER_EXACT_OVERVIEW_LIMIT) : riderOverviewItems),
    [riderOverviewCandidateItems, riderOverviewFilterActive, riderOverviewItems],
  );
  const riderOverviewExactFilters = riderOverviewFilters.filter(
    (filter) => !RIDER_OVERVIEW_INDEX_FILTERS.has(filter),
  );

  useEffect(() => {
    if (riderInitialStatus !== "ready" || riderOverviewItems.length === 0) return;
    let active = true;
    setRiderOverviewStatus("loading");
    Promise.allSettled(
      riderOverviewItems.map(async (item) => ({
        registrationNo: item.registrationNo,
        rider: await loadKurariExRiderExactByFile(item.file),
      })),
    ).then((results) => {
      if (!active) return;
      const loaded: Record<string, KurariExRiderExact> = {};
      let rejectedCount = 0;
      results.forEach((result) => {
        if (result.status === "fulfilled") {
          loaded[result.value.registrationNo] = result.value.rider;
        } else {
          rejectedCount += 1;
        }
      });
      setRiderOverviewCache(loaded);
      setRiderOverviewStatus(rejectedCount === results.length ? "error" : "ready");
    });
    return () => {
      active = false;
    };
  }, [riderInitialStatus, riderOverviewItems]);

  useEffect(() => {
    if (!riderOverviewFilterActive) {
      setRiderFilteredCache({});
      setRiderFilteredStatus("idle");
      return;
    }
    if (riderInitialStatus !== "ready") return;
    if (riderOverviewLoadItems.length === 0) {
      setRiderFilteredCache({});
      setRiderFilteredStatus("ready");
      return;
    }
    let active = true;
    setRiderFilteredStatus("loading");
    Promise.allSettled(
      riderOverviewLoadItems.map(async (item) => ({
        registrationNo: item.registrationNo,
        rider: riderOverviewCache[item.registrationNo] ?? await loadKurariExRiderExactByFile(item.file),
      })),
    ).then((results) => {
      if (!active) return;
      const loaded: Record<string, KurariExRiderExact> = {};
      let rejectedCount = 0;
      results.forEach((result) => {
        if (result.status === "fulfilled") {
          loaded[result.value.registrationNo] = result.value.rider;
        } else {
          rejectedCount += 1;
        }
      });
      setRiderFilteredCache(loaded);
      setRiderFilteredStatus(rejectedCount === results.length ? "error" : "ready");
    });
    return () => {
      active = false;
    };
  }, [
    riderInitialStatus,
    riderOverviewFilterActive,
    riderOverviewLoadItems,
  ]);

  const riderOverviewDisplayCache = riderOverviewFilterActive
    ? { ...riderOverviewCache, ...riderFilteredCache }
    : riderOverviewCache;
  const riderOverviewDisplayItems = riderOverviewLoadItems.filter((item) =>
    riderOverviewExactFilters.every((filter) =>
      matchesRiderOverviewExactFilter(filter, riderOverviewDisplayCache[item.registrationNo])
    )
  );
  const toggleRiderOverviewFilter = (filter: RiderOverviewFilterKey) => {
    setRiderOverviewFilters((current) =>
      current.includes(filter)
        ? current.filter((item) => item !== filter)
        : [...current, filter]
    );
  };
  const clearRiderOverviewFilters = () => {
    setRiderOverviewQuery("");
    setRiderOverviewFilters([]);
  };

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

  useEffect(() => {
    if (matchupInitialStatus !== "ready" || !matchupInitialData?.index.items.length) return;
    let active = true;
    setMatchupOverviewStatus("loading");
    const indexItems = matchupInitialData.index.items;
    const qualityByRegistrationNo = new Map(indexItems.map((item) => [item.registrationNo, item.quality]));
    const sourceItems = [...indexItems]
      .sort((left, right) =>
        right.safeComparableRaceCount - left.safeComparableRaceCount ||
        right.sharedRaceCount - left.sharedRaceCount ||
        left.registrationNo.localeCompare(right.registrationNo)
      )
      .slice(0, MATCHUP_OVERVIEW_SOURCE_RIDER_LIMIT);

    Promise.allSettled(
      sourceItems.map(async (item) => ({
        indexItem: item,
        exact: await loadKurariExMatchupExactByFile(item.file),
      })),
    ).then((results) => {
      if (!active) return;
      const pairMap = new Map<string, MatchupOverviewRow>();
      let fulfilledCount = 0;
      results.forEach((result) => {
        if (result.status !== "fulfilled") return;
        fulfilledCount += 1;
        const { exact } = result.value;
        exact.matchups.forEach((matchup) => {
          if (pairMap.has(matchup.pairKey)) return;
          const [registrationNoA, registrationNoB] = matchup.pairKey.split(":");
          if (!registrationNoA || !registrationNoB) return;
          const selfIsA = exact.registrationNo === registrationNoA;
          pairMap.set(matchup.pairKey, {
            pairKey: matchup.pairKey,
            registrationNoA,
            nameA: selfIsA ? exact.name : matchup.opponentName,
            registrationNoB,
            nameB: selfIsA ? matchup.opponentName : exact.name,
            sharedRaceCount: matchup.sharedRaceCount,
            safeComparableRaceCount: matchup.safeComparableRaceCount,
            aAheadCount: selfIsA ? matchup.selfAheadCount : matchup.opponentAheadCount,
            bAheadCount: selfIsA ? matchup.opponentAheadCount : matchup.selfAheadCount,
            sameLine: orientMatchupStats(matchup.sameLine, selfIsA),
            otherLine: orientMatchupStats(matchup.otherLine, selfIsA),
            quality: matchup.quality,
            category: classifyMatchupOverview(
              matchup,
              exact.quality,
              qualityByRegistrationNo.get(matchup.opponentRegistrationNo),
            ),
          });
        });
      });
      const categoryRanks: Record<MatchupOverviewCategory, number> = {
        practical: 0,
        "low-sample": 1,
        insufficient: 2,
        unavailable: 3,
      };
      setMatchupOverviewRows([...pairMap.values()].sort((left, right) =>
        categoryRanks[left.category] - categoryRanks[right.category] ||
        right.safeComparableRaceCount - left.safeComparableRaceCount ||
        right.sharedRaceCount - left.sharedRaceCount ||
        left.pairKey.localeCompare(right.pairKey)
      ));
      setMatchupOverviewStatus(fulfilledCount > 0 ? "ready" : "error");
    });
    return () => {
      active = false;
    };
  }, [matchupInitialData, matchupInitialStatus]);

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
  const publicExFreshness = sourceFreshness(status?.lastImportAt);
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
  const riderQualityCounts = riderInitialData?.status.qualityCounts;
  const practicalRiderCount = (riderInitialData?.index.items ?? []).filter(
    (item) => item.quality !== "identity-only" && item.confirmedStartCount >= 5,
  ).length;
  const matchupQualityCounts = matchupSummary?.qualityCounts ?? {};
  const matchupOverviewVisibleRows = matchupOverviewRows.slice(0, MATCHUP_OVERVIEW_LIMIT);
  const matchupOverviewCategoryCounts = matchupOverviewRows.reduce<Record<MatchupOverviewCategory, number>>(
    (counts, row) => ({ ...counts, [row.category]: counts[row.category] + 1 }),
    { practical: 0, "low-sample": 0, insufficient: 0, unavailable: 0 },
  );
  const relationshipMemoRows = useMemo(() => {
    const rows: RelationshipMemoRow[] = [];
    const riderIndexByRegistrationNo = new Map(
      (riderInitialData?.index.items ?? []).map((item) => [item.registrationNo, item]),
    );
    const normalizedPrefecture = (registrationNo: string) =>
      (riderIndexByRegistrationNo.get(registrationNo)?.prefecture ?? "").replace(/\s+/gu, "");
    const sameLinePairs = [...matchupOverviewRows]
      .filter((row) => row.sameLine.sharedRaceCount > 0)
      .sort((left, right) =>
        right.sameLine.sharedRaceCount - left.sameLine.sharedRaceCount ||
        right.sameLine.safeComparableRaceCount - left.sameLine.safeComparableRaceCount ||
        left.pairKey.localeCompare(right.pairKey)
      );
    const samePrefecturePairs = sameLinePairs.filter((row) => {
      const prefectureA = normalizedPrefecture(row.registrationNoA);
      const prefectureB = normalizedPrefecture(row.registrationNoB);
      return Boolean(prefectureA && prefectureB && prefectureA === prefectureB);
    });

    samePrefecturePairs.slice(0, 3).forEach((row) => {
      const prefecture = riderIndexByRegistrationNo.get(row.registrationNoA)?.prefecture?.trim() || "府県取得済み";
      rows.push({
        id: `same-prefecture:${row.pairKey}`,
        category: "同県連携候補",
        target: `${row.nameA} × ${row.nameB}`,
        evidenceType: "保存済みMATCHUP EX / 保存済みライン情報",
        count: row.sameLine.sharedRaceCount,
        quality: row.category,
        note: `${prefecture}一致に加え、保存済み同ライン共走${row.sameLine.sharedRaceCount}R。連携を断定せず候補として表示。`,
      });
    });
    if (samePrefecturePairs.length === 0) {
      rows.push({
        id: "same-prefecture:unavailable",
        category: "同県連携候補",
        target: "未蓄積",
        evidenceType: "保存済みライン情報",
        count: null,
        quality: "unavailable",
        note: "府県一致だけでは表示せず、同ライン共走の保存実績があるペアのみ対象。",
      });
    }

    sameLinePairs.slice(0, 5).forEach((row) => {
      rows.push({
        id: `same-line:${row.pairKey}`,
        category: "同一ライン候補",
        target: `${row.nameA} × ${row.nameB}`,
        evidenceType: "保存済みMATCHUP EX / 保存済みライン情報",
        count: row.sameLine.sharedRaceCount,
        quality: row.category,
        note: `同ライン共走${row.sameLine.sharedRaceCount}R / 比較可能${row.sameLine.safeComparableRaceCount}R。今回の並びを固定する材料にはしない。`,
      });
    });
    if (sameLinePairs.length === 0) {
      rows.push({
        id: "same-line:unavailable",
        category: "同一ライン候補",
        target: "未蓄積",
        evidenceType: "保存済みライン情報",
        count: null,
        quality: "unavailable",
        note: "保存済み同ライン共走実績なし。",
      });
    }

    [...matchupOverviewRows]
      .filter((row) => row.sharedRaceCount >= 2)
      .sort((left, right) =>
        right.sharedRaceCount - left.sharedRaceCount ||
        right.safeComparableRaceCount - left.safeComparableRaceCount ||
        left.pairKey.localeCompare(right.pairKey)
      )
      .slice(0, 5)
      .forEach((row) => {
        rows.push({
          id: `rematch:${row.pairKey}`,
          category: "再戦材料",
          target: `${row.nameA} × ${row.nameB}`,
          evidenceType: "過去同走データ / 保存済みMATCHUP EX",
          count: row.sharedRaceCount,
          quality: row.category,
          note: `過去同走${row.sharedRaceCount}R / 比較可能${row.safeComparableRaceCount}R。因果関係や相性は補完しない。`,
        });
      });

    const roleSources: Array<{
      key: "front" | "bante" | "single";
      category: "ライン先頭候補" | "番手候補" | "単騎傾向";
      label: string;
    }> = [
      { key: "front", category: "ライン先頭候補", label: "byRole.front" },
      { key: "bante", category: "番手候補", label: "byRole.bante" },
      { key: "single", category: "単騎傾向", label: "byRole.single" },
    ];
    const exactRiders = Object.values(riderOverviewCache)
      .filter((rider) => rider.quality !== "identity-only");
    roleSources.forEach((source) => {
      const candidates = exactRiders
        .map((rider) => ({ rider, aggregate: rider.byRole?.[source.key] ?? null }))
        .filter((entry) => (entry.aggregate?.starts ?? 0) > 0)
        .sort((left, right) =>
          (right.aggregate?.starts ?? 0) - (left.aggregate?.starts ?? 0) ||
          left.rider.name.localeCompare(right.rider.name, "ja")
        )
        .slice(0, 3);
      candidates.forEach(({ rider, aggregate }) => {
        if (!aggregate?.starts) return;
        const quality: MatchupOverviewCategory =
          rider.quality === "low-sample" || aggregate.starts < 5 ? "low-sample" : "practical";
        rows.push({
          id: `${source.key}:${rider.registrationNo}`,
          category: source.category,
          target: rider.name,
          evidenceType: "保存済み役割別成績",
          count: aggregate.starts,
          quality,
          note: `${source.label} ${aggregate.starts}R / 3連対率 ${formatKurariExRiderMetric(aggregate.top3Rate)}。次走の役割を断定しない。`,
        });
      });
      if (candidates.length === 0) {
        rows.push({
          id: `${source.key}:unavailable`,
          category: source.category,
          target: "未蓄積",
          evidenceType: "保存済み役割別成績",
          count: null,
          quality: "unavailable",
          note: `${source.label}の保存実績なし。脚質から補完しない。`,
        });
      }
    });

    rows.push({
      id: "line-break:unavailable",
      category: "ライン分断注意",
      target: "未蓄積",
      evidenceType: "保存済み明示メモ",
      count: null,
      quality: "unavailable",
      note: "ライン分断の明示記録を一覧データから取得できないため、想像で注意対象を作らない。",
    });
    return rows;
  }, [matchupOverviewRows, riderInitialData?.index.items, riderOverviewCache]);
  const relationshipMemoCounts = relationshipMemoRows.reduce(
    (counts, row) => {
      if (row.quality === "unavailable") counts.unavailable += 1;
      else counts.saved += 1;
      if (row.category === "同県連携候補" && row.quality !== "unavailable") counts.samePrefecture += 1;
      if (row.category === "同一ライン候補" && row.quality !== "unavailable") counts.sameLine += 1;
      if (row.category === "再戦材料" && row.quality !== "unavailable") counts.rematch += 1;
      if (["ライン先頭候補", "番手候補", "単騎傾向"].includes(row.category) && row.quality !== "unavailable") counts.role += 1;
      return counts;
    },
    { saved: 0, samePrefecture: 0, sameLine: 0, rematch: 0, role: 0, unavailable: 0 },
  );
  const categoryDimensions = riderCategoryAnalysis?.dimensions ?? {};
  const selectedConditionTab = KURARI_EX_CONDITION_DATA_TABS.find((tab) => tab.key === conditionDataTab) ?? KURARI_EX_CONDITION_DATA_TABS[0];
  const selectedConditionDimension = categoryDimensions[selectedConditionTab.dimensionKey];
  const selectedConditionRows = selectedConditionTab.items.map((definition) => ({
    ...definition,
    item: selectedConditionDimension?.items.find((item) => item.key === definition.key) ?? null,
  }));
  const selectedRoleTab = KURARI_EX_ROLE_DATA_TABS.find((tab) => tab.key === roleDataTab) ?? KURARI_EX_ROLE_DATA_TABS[0];
  const roleDimension = categoryDimensions.role;
  const selectedRoleItem = roleDimension?.items.find((item) => item.key === selectedRoleTab.key) ?? null;
  const hasCategoryData = (key: string) => (categoryDimensions[key]?.items.length ?? 0) > 0;
  const hasSnowData = categoryDimensions.weather?.items.some((item) => item.key === "snow" && item.starts > 0) ?? false;
  const unresolvedWarning = riderCoverageAudit?.warnings?.[0]
    ?? (riderCoverageAuditStatus === "loading" ? "監査読込中" : "warningなし");
  const needsDataCount = KURARI_EX_DATA_INVENTORY.filter((item) => item.status === "needs-data").length;
  const conditionsReflected = [
    hasCategoryData("bankLength"),
    hasCategoryData("timeslot"),
    hasCategoryData("raceStage"),
    hasCategoryData("weather"),
  ].filter(Boolean).length;
  const roleReflected = hasCategoryData("role");
  const dashboardStatus = {
    rider: riderInitialStatus === "ready" ? "反映済み" : riderInitialStatus === "error" ? "取得失敗" : "読込中",
    matchup: matchupInitialStatus === "ready" ? "反映済み" : matchupInitialStatus === "error" ? "取得失敗" : "読込中",
    venue: exactInitialStatus === "ready" ? "反映済み" : exactInitialStatus === "error" ? "取得失敗" : "読込中",
    conditions: conditionsReflected > 0 ? "一部反映" : riderCategoryStatus === "error" ? "取得失敗" : "読込中",
    role: roleReflected ? "一部反映" : riderCategoryStatus === "error" ? "取得失敗" : "読込中",
    weather: hasCategoryData("weather") ? "一部反映" : riderCategoryStatus === "error" ? "取得失敗" : "読込中",
  };

  return (
    <div className="ex-page">
      <SiteHeader activeKey="ex-data" />
      <style>{`
        .ex-page { width: 100%; max-width: 100%; min-height: 100vh; overflow-x: clip; color: #172239; font-family: ${sans}; background:
          radial-gradient(circle at 7% 4%, rgba(205,190,255,.48), transparent 24%),
          radial-gradient(circle at 91% 12%, rgba(181,224,255,.44), transparent 25%),
          radial-gradient(circle at 52% 80%, rgba(195,245,225,.42), transparent 32%),
          linear-gradient(180deg, #f7f5ff 0%, #f5faff 45%, #f7fffb 100%); }
        .ex-main { box-sizing: border-box; width: min(1880px, calc(100% - ${isMobile ? "32px" : "40px"})); max-width: 1880px; min-width: 0; margin-inline: auto; padding: ${isMobile ? "24px 0 64px" : "42px 0 92px"}; display: grid; gap: 24px; }
        .ex-main > * { width: 100%; max-width: 100%; min-width: 0; box-sizing: border-box; }
        .ex-panel, .ex-section, .ex-subsection, .ex-detail, .ex-workspace, .ex-table-wrap { min-width: 0; max-width: 100%; box-sizing: border-box; }
        .ex-subsection, .ex-table-wrap { width: 100%; }
        .ex-main h1, .ex-main h2, .ex-main h3, .ex-main h4, .ex-main p, .ex-main li, .ex-main td, .ex-main th, .ex-main span, .ex-main strong { overflow-wrap: anywhere; }
        .ex-health-grid, .ex-kpi-grid, .ex-location-grid, .ex-category-grid, .ex-insights, .ex-note-grid, .ex-trend-ranking-grid, .ex-turbulence-category-grid, .ex-chain-type-grid, .ex-chain-examples, .ex-weather-bucket-grid, .ex-weather-venue-grid, .ex-venue-bias-grid, .ex-venue-definition-grid, .ex-today-flow-grid, .ex-today-flow-meter, .ex-coverage-tab-map, .ex-backfill-grid, .ex-definition-grid { width: 100%; min-width: 0; max-width: 100%; box-sizing: border-box; }
        .ex-health-grid > *, .ex-kpi-grid > *, .ex-location-grid > *, .ex-category-grid > *, .ex-insights > *, .ex-note-grid > *, .ex-trend-ranking-grid > *, .ex-turbulence-category-grid > *, .ex-chain-type-grid > *, .ex-chain-examples > *, .ex-venue-bias-grid > *, .ex-venue-definition-grid > *, .ex-today-flow-grid > *, .ex-today-flow-meter > *, .ex-coverage-tab-map > *, .ex-backfill-grid > *, .ex-definition-grid > * { min-width: 0; max-width: 100%; box-sizing: border-box; }
        .ex-main [hidden] { display: none !important; }
        .ex-section-tabs { display: grid; grid-template-columns: repeat(auto-fit,minmax(${isMobile ? "128px" : "150px"},1fr)); gap: 9px; padding: 12px; border: 1px solid rgba(190,194,224,.62); border-radius: 24px; background: rgba(255,255,255,.82); box-shadow: 0 16px 40px rgba(82,74,135,.08); }
        .ex-section-tab { min-width: 0; cursor: pointer; display: grid; gap: 4px; padding: 12px 13px; border: 1px solid #e2e2ed; border-radius: 16px; background: rgba(248,249,253,.9); color: #657187; text-align: left; }
        .ex-section-tab strong { overflow-wrap: anywhere; font-size: 11px; line-height: 1.25; letter-spacing: .06em; }
        .ex-section-tab span { color: #9099a9; font-size: 9px; line-height: 1.35; }
        .ex-section-tab.is-active { border-color: #9f8bd6; color: #4f3b8e; background: linear-gradient(135deg,#f2ecff,#edf8ff); box-shadow: 0 8px 20px rgba(91,75,151,.14); }
        .ex-section-tab.is-active span { color: #6e5ca8; }
        .ex-section-tab:focus-visible { outline: 3px solid rgba(112,90,179,.24); outline-offset: 2px; }
        .ex-overview-status { display: flex; flex-wrap: wrap; gap: 8px; }
        .ex-trend-basis-note { margin-top: 12px; padding: ${isMobile ? "16px" : "18px 20px"}; border: 1px dashed #cbc7df; border-radius: 20px; color: #657187; background: rgba(255,255,255,.58); }
        .ex-trend-basis-note > strong { display: block; color: #526176; font-size: 12px; }
        .ex-trend-basis-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
        .ex-trend-basis-row span { padding: 7px 10px; border-radius: 999px; color: #526176; background: #eef7f3; font-size: 10px; line-height: 1.35; white-space: nowrap; }
        .ex-trend-basis-row.is-exclusion span { color: #80591e; background: #fff3e1; }
        .ex-trend-basis-note small { display: block; margin-top: 12px; color: #78859a; font-size: 10px; line-height: 1.65; }
        .ex-panel { border: 1px solid rgba(190,194,224,.62); border-radius: 30px; background: rgba(255,255,255,.78); box-shadow: 0 22px 55px rgba(82,74,135,.09); backdrop-filter: blur(18px); }
        .ex-hero { padding: ${isMobile ? "26px 22px" : "46px 48px"}; display: grid; grid-template-columns: ${isMobile ? "1fr" : "minmax(0,1.35fr) minmax(300px,.65fr)"}; gap: 28px; align-items: center; overflow: hidden; position: relative; }
        .ex-hero:after { content: ""; position: absolute; width: 360px; height: 360px; right: -90px; top: -170px; border-radius: 50%; background: linear-gradient(145deg, rgba(183,161,255,.42), rgba(153,219,255,.28)); }
        .ex-eyebrow { color: #7866b5; font-size: 10px; font-weight: 900; letter-spacing: .18em; line-height: 1.3; }
        .ex-hero h1 { margin: 10px 0 8px; font: 800 ${isMobile ? "42px" : "72px"}/.98 ${serif}; letter-spacing: -.045em; color: #172239; }
        .ex-hero h2 { margin: 0; font: 700 ${isMobile ? "20px" : "28px"}/1.4 ${serif}; color: #4c5871; }
        .ex-hero p { max-width: 760px; margin: 22px 0 0; color: #5a6880; font-size: ${isMobile ? "14px" : "17px"}; line-height: 2; font-weight: 650; }
        .ex-phase { position: relative; z-index: 1; padding: 24px; border-radius: 25px; border: 1px solid rgba(180,170,225,.6); background: linear-gradient(145deg, rgba(251,248,255,.96), rgba(238,248,255,.94), rgba(239,255,248,.9)); }
        .ex-phase strong { display: block; margin: 8px 0; font: 800 28px/1.2 ${serif}; color: #59499c; }
        .ex-location { border-color: rgba(164,176,222,.72); background: linear-gradient(145deg,rgba(252,252,255,.96),rgba(244,249,255,.94),rgba(244,255,250,.92)); }
        .ex-location-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(${isMobile ? "240px" : "280px"},1fr)); gap: 14px; }
        .ex-location-card { min-width: 0; padding: 19px; border: 1px solid #e0e4ef; border-radius: 22px; background: rgba(255,255,255,.86); box-shadow: 0 12px 28px rgba(73,83,126,.06); }
        .ex-location-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin-bottom: 13px; }
        .ex-location-head h3 { margin: 0; color: #24324a; font: 800 18px/1.3 ${serif}; }
        .ex-location-status { flex: 0 0 auto; display: inline-flex; padding: 6px 9px; border-radius: 999px; font-size: 9px; font-weight: 950; letter-spacing: .06em; }
        .ex-location-status.is-ready { color: #1f6a50; background: #dcf7e9; }
        .ex-location-status.is-partial { color: #8a5a0a; background: #fff0cf; }
        .ex-location-status.is-pending { color: #667085; background: #edf0f4; }
        .ex-location-status.is-fixed { color: #59449b; background: #eee8ff; }
        .ex-location-status.is-warning { color: #9a3d4f; background: #ffe8ed; }
        .ex-location-rows { display: grid; gap: 8px; }
        .ex-location-row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding-top: 8px; border-top: 1px solid #eef0f5; color: #68758a; font-size: 11px; line-height: 1.5; }
        .ex-location-row strong { color: #35435a; text-align: right; overflow-wrap: anywhere; }
        .ex-location-note { margin: 13px 0 0; padding-top: 11px; border-top: 1px dashed #dfe3ec; color: #7a8497; font-size: 11px; line-height: 1.7; }
        .ex-location-policy { margin: 0; padding: 17px 19px; border-radius: 18px; border: 1px solid #dbe6e1; background: rgba(246,255,251,.86); color: #526779; font-size: 13px; line-height: 1.85; font-weight: 650; }
        .ex-rider-overview-summary { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; }
        .ex-rider-overview-summary strong { color: #263650; font-size: 14px; }
        .ex-rider-overview-legend { display: flex; flex-wrap: wrap; gap: 8px; }
        .ex-rider-overview-legend .ex-quality { gap: 5px; }
        .ex-rider-filter-panel { display: grid; gap: 14px; padding: ${isMobile ? "17px" : "20px"}; border: 1px solid #dfe4ef; border-radius: 21px; background: linear-gradient(145deg,rgba(250,252,255,.96),rgba(247,245,255,.94)); }
        .ex-rider-filter-head { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 10px; }
        .ex-rider-filter-head h3 { margin: 0; color: #263650; font: 800 20px/1.3 ${serif}; }
        .ex-rider-filter-search { display: grid; grid-template-columns: ${isMobile ? "1fr" : "minmax(260px,1fr) auto"}; gap: 10px; }
        .ex-rider-filter-input { width: 100%; box-sizing: border-box; padding: 12px 14px; border: 1px solid #d7deea; border-radius: 14px; background: #fff; color: #263650; font-size: 13px; outline: none; }
        .ex-rider-filter-input:focus { border-color: #7461b5; box-shadow: 0 0 0 3px rgba(116,97,181,.11); }
        .ex-rider-filter-clear { padding: 11px 15px; border: 1px solid #d7deea; border-radius: 14px; background: #fff; color: #657187; font-size: 11px; font-weight: 900; cursor: pointer; }
        .ex-rider-filter-clear:disabled { cursor: default; opacity: .45; }
        .ex-rider-filter-chips { display: flex; flex-wrap: wrap; gap: 8px; }
        .ex-rider-filter-chip { padding: 8px 11px; border: 1px solid #dce2ec; border-radius: 999px; background: #fff; color: #657187; font-size: 10px; font-weight: 900; cursor: pointer; }
        .ex-rider-filter-chip.is-active { border-color: #6d58ad; color: #fff; background: #6d58ad; }
        .ex-rider-filter-chip.is-unavailable { border-style: dashed; cursor: default; color: #8b93a2; background: #f3f4f6; }
        .ex-rider-filter-counts { display: grid; grid-template-columns: repeat(${isMobile ? 2 : 4},minmax(0,1fr)); gap: 8px; }
        .ex-rider-filter-counts div { padding: 10px 12px; border-radius: 13px; background: rgba(255,255,255,.85); color: #7a8598; font-size: 9px; }
        .ex-rider-filter-counts strong { display: block; margin-top: 3px; color: #263650; font-size: 15px; }
        .ex-rider-overview-table-wrap { overflow-x: auto; border: 1px solid #e0e5ef; border-radius: 20px; background: rgba(255,255,255,.88); }
        .ex-rider-overview-table { width: 100%; min-width: 1080px; border-collapse: collapse; }
        .ex-rider-overview-table th { padding: 12px 14px; color: #6d788c; background: #f6f8fc; font-size: 10px; letter-spacing: .06em; text-align: left; white-space: nowrap; }
        .ex-rider-overview-table td { padding: 14px; border-top: 1px solid #edf0f5; color: #3b4960; font-size: 11px; line-height: 1.65; vertical-align: top; }
        .ex-rider-overview-name { display: grid; gap: 3px; min-width: 150px; }
        .ex-rider-overview-name strong { color: #1f2d45; font: 800 15px/1.35 ${serif}; }
        .ex-rider-overview-stats { display: grid; gap: 4px; min-width: 310px; }
        .ex-rider-overview-rates { color: #536d92; font-weight: 800; }
        .ex-rider-overview-methods { min-width: 240px; }
        .ex-rider-overview-cards { display: grid; gap: 12px; }
        .ex-rider-overview-card { display: grid; gap: 13px; padding: 18px; border: 1px solid #e0e5ef; border-radius: 20px; background: rgba(255,255,255,.9); }
        .ex-rider-overview-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
        .ex-rider-overview-card-head h3 { margin: 0; color: #1f2d45; font: 800 18px/1.35 ${serif}; }
        .ex-rider-overview-card-block { display: grid; gap: 5px; padding-top: 11px; border-top: 1px solid #edf0f5; color: #435269; font-size: 11px; line-height: 1.65; }
        .ex-rider-overview-card-block b { color: #758197; font-size: 9px; letter-spacing: .08em; }
        .ex-rider-overview-link { display: inline-flex; width: fit-content; padding: 5px 8px; border-radius: 999px; background: #edf3ff; color: #365f99; font-size: 9px; font-weight: 900; }
        .ex-condition-tabs { display: flex; gap: 9px; overflow-x: auto; padding-bottom: 3px; }
        .ex-condition-tab { flex: 0 0 auto; padding: 10px 15px; border: 1px solid #dfe4ee; border-radius: 999px; background: #fff; color: #657187; font-size: 11px; font-weight: 900; cursor: pointer; }
        .ex-condition-tab.is-active { border-color: #6d58ad; color: #fff; background: linear-gradient(135deg,#705ab3,#4e7ca9); box-shadow: 0 8px 18px rgba(87,82,157,.18); }
        .ex-condition-source { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; padding: 13px 15px; border-radius: 16px; background: #f7f9fc; color: #68758a; font-size: 11px; line-height: 1.6; }
        .ex-condition-table-wrap { overflow-x: auto; border: 1px solid #e0e5ef; border-radius: 20px; background: rgba(255,255,255,.9); }
        .ex-condition-table { width: 100%; min-width: 920px; border-collapse: collapse; }
        .ex-condition-table th { padding: 12px 14px; color: #6d788c; background: #f6f8fc; font-size: 10px; text-align: left; white-space: nowrap; }
        .ex-condition-table td { padding: 14px; border-top: 1px solid #edf0f5; color: #3b4960; font-size: 11px; line-height: 1.55; vertical-align: middle; }
        .ex-condition-table td:first-child { color: #1f2d45; font: 800 15px/1.35 ${serif}; }
        .ex-condition-cards { display: grid; gap: 12px; }
        .ex-condition-card { display: grid; gap: 13px; padding: 18px; border: 1px solid #e0e5ef; border-radius: 20px; background: rgba(255,255,255,.9); }
        .ex-condition-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
        .ex-condition-card-head h3 { margin: 0; color: #1f2d45; font: 800 19px/1.3 ${serif}; }
        .ex-condition-card-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 8px; }
        .ex-condition-card-grid div { padding: 9px 10px; border-radius: 12px; background: #f7f9fc; color: #68758a; font-size: 10px; }
        .ex-condition-card-grid strong { display: block; margin-top: 3px; color: #263650; font-size: 13px; }
        .ex-condition-rate-row { display: grid; gap: 5px; color: #536d92; font-size: 11px; font-weight: 800; line-height: 1.6; }
        .ex-role-description { margin: 0; padding: 15px 17px; border-left: 4px solid #705ab3; border-radius: 0 16px 16px 0; background: #f7f5ff; color: #526279; font-size: 12px; line-height: 1.8; font-weight: 700; }
        .ex-matchup-overview-summary { display: grid; grid-template-columns: repeat(${isMobile ? 2 : 5},minmax(0,1fr)); gap: 10px; }
        .ex-matchup-overview-summary div { padding: 14px; border: 1px solid #e3e6ef; border-radius: 17px; background: rgba(255,255,255,.86); color: #748096; font-size: 10px; line-height: 1.5; }
        .ex-matchup-overview-summary strong { display: block; margin-top: 5px; color: #263650; font: 850 ${isMobile ? "20px" : "24px"}/1 ${serif}; }
        .ex-matchup-overview-table { min-width: 1420px; }
        .ex-matchup-overview-player { display: grid; gap: 3px; min-width: 125px; }
        .ex-matchup-overview-player strong { color: #1f2d45; font-size: 13px; }
        .ex-matchup-overview-line { min-width: 170px; color: #526987; font-weight: 750; }
        .ex-matchup-overview-note { min-width: 110px; color: #8590a3; }
        .ex-matchup-overview-cards { display: grid; gap: 12px; }
        .ex-matchup-overview-card { display: grid; gap: 13px; padding: 18px; border: 1px solid #e0e5ef; border-radius: 20px; background: rgba(255,255,255,.92); }
        .ex-matchup-overview-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
        .ex-matchup-overview-card-head h3 { margin: 0; color: #1f2d45; font: 800 17px/1.45 ${serif}; }
        .ex-matchup-overview-card-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 8px; }
        .ex-matchup-overview-card-grid div { padding: 9px; border-radius: 12px; background: #f7f9fc; color: #748096; font-size: 9px; }
        .ex-matchup-overview-card-grid strong { display: block; margin-top: 3px; color: #263650; font-size: 12px; }
        .ex-matchup-overview-card-line { display: grid; gap: 6px; padding-top: 11px; border-top: 1px solid #edf0f5; color: #526987; font-size: 11px; line-height: 1.6; }
        .ex-relationship-table { min-width: 1160px; }
        .ex-relationship-table td:first-child { min-width: 120px; font-size: 13px; }
        .ex-relationship-target { min-width: 190px; color: #263650; font-weight: 850; }
        .ex-relationship-evidence { min-width: 190px; color: #526987; font-weight: 750; }
        .ex-relationship-note { min-width: 300px; color: #657187; line-height: 1.75; }
        .ex-relationship-cards { display: grid; gap: 12px; }
        .ex-relationship-card { display: grid; gap: 12px; padding: 18px; border: 1px solid #e0e5ef; border-radius: 20px; background: rgba(255,255,255,.92); }
        .ex-relationship-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
        .ex-relationship-card-head h3 { margin: 0; color: #1f2d45; font: 800 18px/1.35 ${serif}; }
        .ex-relationship-card-target { color: #30425d; font-size: 13px; font-weight: 850; line-height: 1.6; }
        .ex-relationship-card-meta { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 8px; }
        .ex-relationship-card-meta div { padding: 9px 10px; border-radius: 12px; background: #f7f9fc; color: #748096; font-size: 9px; line-height: 1.45; }
        .ex-relationship-card-meta strong { display: block; margin-top: 3px; color: #263650; font-size: 11px; }
        .ex-relationship-card-note { margin: 0; padding-top: 10px; border-top: 1px solid #edf0f5; color: #657187; font-size: 11px; line-height: 1.75; }
        .ex-tactic-rule-grid { display: grid; grid-template-columns: repeat(${isMobile ? 1 : 2},minmax(0,1fr)); gap: 14px; }
        .ex-tactic-rule-card { display: grid; gap: 14px; padding: ${isMobile ? "18px" : "22px"}; border: 1px solid #dedff0; border-radius: 22px; background: linear-gradient(145deg,rgba(255,255,255,.95),rgba(248,246,255,.92)); box-shadow: 0 12px 28px rgba(73,83,126,.05); }
        .ex-tactic-rule-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
        .ex-tactic-rule-head h3 { margin: 0; color: #1f2d45; font: 800 21px/1.3 ${serif}; }
        .ex-tactic-rule-metrics { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 8px; }
        .ex-tactic-rule-metrics div { padding: 10px; border-radius: 13px; background: #f6f7fb; color: #778297; font-size: 9px; line-height: 1.45; }
        .ex-tactic-rule-metrics strong { display: block; margin-top: 4px; color: #8d5a15; font-size: 11px; }
        .ex-tactic-rule-detail { display: grid; gap: 10px; }
        .ex-tactic-rule-detail div { padding-top: 10px; border-top: 1px solid #ececf3; color: #5b687d; font-size: 11px; line-height: 1.75; }
        .ex-tactic-rule-detail b { display: block; margin-bottom: 3px; color: #625099; font-size: 10px; letter-spacing: .06em; }
        .ex-tactic-common-ban { display: grid; gap: 8px; padding: 17px 19px; border: 1px solid #f0d7c1; border-radius: 18px; background: #fff9f3; color: #735f52; font-size: 12px; line-height: 1.7; }
        .ex-tactic-common-ban strong { color: #9a5729; }
        .ex-tactic-common-ban ul { margin: 0; padding-left: 20px; }
        .ex-section { padding: ${isMobile ? "22px 18px" : "30px"}; display: grid; grid-template-columns: minmax(0,1fr); gap: 22px; }
        .ex-section-title h2 { margin: 6px 0 0; font: 800 ${isMobile ? "27px" : "36px"}/1.15 ${serif}; color: #172239; }
        .ex-section-title p { margin: 8px 0 0; color: #718096; line-height: 1.7; }
        .ex-health-grid { display: grid; grid-template-columns: repeat(${isMobile ? 2 : 4}, minmax(0,1fr)); gap: 13px; }
        .ex-metric-card { min-width: 0; padding: 20px; border: 1px solid #e5e3f2; border-radius: 22px; background: linear-gradient(150deg,#fff,#f7f4ff 58%,#f2fbff); }
        .ex-metric-card.is-warning { border-color: #f0c9a7; background: #fff9f1; }
        .ex-metric-value { margin: 8px 0 4px; color: #172239; font: 850 ${isMobile ? "25px" : "32px"}/1 ${serif}; overflow-wrap: anywhere; }
        .ex-panel[data-testid="result-trend-lab-roadmap"] .ex-metric-value { font-size: ${isMobile ? "22px" : "26px"}; line-height: 1.08; }
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
        .ex-trend-status-row { display: flex; flex-wrap: wrap; gap: 8px; }
        .ex-trend-status-pill { display: inline-flex; align-items: center; gap: 6px; padding: 7px 10px; border-radius: 999px; color: #40516c; background: #edf2fa; font-size: 10px; font-weight: 900; }
        .ex-trend-status-pill.is-ready { color: #23664c; background: #daf5e8; }
        .ex-trend-status-pill.is-partial { color: #925711; background: #fff0d3; }
        .ex-trend-status-pill.is-future-accumulation { color: #687184; background: #eceef2; }
        .ex-trend-status-pill.is-low-sample, .ex-trend-status-pill.is-caution { color: #925711; background: #fff0d3; }
        .ex-trend-status-pill.is-usable { color: #23664c; background: #daf5e8; }
        .ex-trend-ranking-grid { display: grid; grid-template-columns: repeat(${isMobile ? 1 : 2}, minmax(0,1fr)); gap: 13px; }
        .ex-trend-ranking-card { min-width: 0; padding: 18px; border: 1px solid #e1e4f0; border-radius: 21px; background: linear-gradient(145deg,rgba(255,255,255,.96),rgba(247,246,255,.9)); }
        .ex-trend-ranking-card:first-child { grid-column: ${isMobile ? "auto" : "1 / -1"}; }
        .ex-trend-ranking-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
        .ex-trend-ranking-head h3 { margin: 0; color: #263650; font: 800 18px/1.35 ${serif}; }
        .ex-trend-ranking-head span { color: #7866b5; font-size: 9px; font-weight: 950; letter-spacing: .1em; }
        .ex-trend-ranking-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 7px; }
        .ex-trend-ranking-list li { display: grid; grid-template-columns: 26px minmax(70px,1fr) auto auto; align-items: center; gap: 8px; padding: 9px 10px; border-radius: 13px; background: rgba(247,249,253,.92); color: #657187; font-size: 11px; }
        .ex-trend-ranking-list li strong { color: #273650; font-size: 13px; }
        .ex-trend-ranking-list li b { color: #5e4b9d; font-size: 12px; }
        .ex-trend-ranking-list li small { grid-column: 2 / -1; color: #8993a4; font-size: 9px; }
        .ex-trend-rank { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; color: #6451a1; background: #eee9fb; font-weight: 950; }
        .ex-trend-reasons { margin: 0; padding-left: 20px; color: #657187; font-size: 11px; line-height: 1.8; }
        .ex-turbulence-category-grid { display: grid; grid-template-columns: repeat(${isMobile ? 1 : 5},minmax(0,1fr)); gap: 10px; }
        .ex-turbulence-category { display: grid; gap: 6px; min-width: 0; padding: 16px; border: 1px solid #e3e5ed; border-radius: 18px; background: rgba(255,255,255,.88); }
        .ex-turbulence-category strong { color: #34435b; font: 800 17px/1.2 ${serif}; }
        .ex-turbulence-category b { color: #563f91; font: 850 27px/1 ${serif}; }
        .ex-turbulence-category span { color: #5d6b81; font-size: 12px; font-weight: 900; }
        .ex-turbulence-category small { color: #8a94a5; font-size: 9px; line-height: 1.45; }
        .ex-turbulence-category.is-firm { border-color: #cfe5dd; background: #f3fbf8; }
        .ex-turbulence-category.is-mid-upset { border-color: #d8e3f3; background: #f4f8fe; }
        .ex-turbulence-category.is-upset { border-color: #eadbbd; background: #fffaf0; }
        .ex-turbulence-category.is-major-upset { border-color: #edc9b5; background: #fff5ef; }
        .ex-turbulence-category.is-extreme-upset { border-color: #e6c4d2; background: #fff2f7; }
        .ex-turbulence-highlight { display: grid; gap: 8px; padding: 20px; border: 1px solid #e0c7d4; border-radius: 21px; background: linear-gradient(145deg,#fff8fb,#f8f4ff); }
        .ex-turbulence-highlight h3 { margin: 0; color: #713f5d; font: 800 20px/1.3 ${serif}; }
        .ex-turbulence-highlight strong { color: #572f72; font: 850 30px/1 ${serif}; }
        .ex-turbulence-highlight p { margin: 0; color: #657187; font-size: 12px; line-height: 1.7; }
        .ex-turbulence-breakdown { min-width: 0; padding: 18px; border: 1px solid #e2e5ed; border-radius: 21px; background: rgba(255,255,255,.76); }
        .ex-turbulence-breakdown h3 { margin: 0; color: #263650; font: 800 18px/1.35 ${serif}; }
        .ex-turbulence-table { min-width: 760px; }
        .ex-chain-type-grid { display: grid; grid-template-columns: repeat(${isMobile ? 2 : 6},minmax(0,1fr)); gap: 10px; }
        .ex-chain-type-card { min-width: 0; display: grid; gap: 6px; padding: 15px; border: 1px solid #dfe4ef; border-radius: 18px; background: linear-gradient(145deg,#fff,#f5f7fd); }
        .ex-chain-type-card strong { color: #34435b; font-size: 12px; }
        .ex-chain-type-card b { color: #5c4595; font: 850 25px/1 ${serif}; }
        .ex-chain-type-card span { color: #758197; font-size: 10px; font-weight: 850; }
        .ex-chain-matrix { min-width: 760px; }
        .ex-chain-matrix td, .ex-chain-matrix th { text-align: center; }
        .ex-chain-matrix td:first-child, .ex-chain-matrix th:first-child { text-align: left; }
        .ex-chain-examples { display: grid; grid-template-columns: repeat(${isMobile ? 1 : 2},minmax(0,1fr)); gap: 11px; }
        .ex-chain-example { min-width: 0; display: grid; gap: 7px; padding: 17px; border: 1px solid #e1ddeb; border-radius: 19px; background: linear-gradient(145deg,#fff,#f8f5ff); }
        .ex-weather-bucket-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(220px,100%),1fr)); gap: 11px; }
        .ex-weather-bucket-card { min-width: 0; display: grid; gap: 6px; padding: 17px; border: 1px solid #dfe5ef; border-radius: 19px; background: linear-gradient(145deg,#fff,#f3f9ff); }
        .ex-weather-bucket-card strong { color: #315f91; font: 800 19px/1.3 ${serif}; }
        .ex-weather-bucket-card b { color: #172239; font: 850 28px/1 ${serif}; }
        .ex-weather-venue-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(280px,100%),1fr)); gap: 11px; }
        .ex-weather-venue-card { min-width: 0; display: grid; gap: 8px; padding: 17px; border: 1px solid #e1e5ed; border-radius: 19px; background: rgba(255,255,255,.86); }
        .ex-weather-venue-card h3 { margin: 0; color: #263650; font: 800 18px/1.35 ${serif}; }
        .ex-weather-venue-card p { margin: 0; color: #657187; font-size: 11px; line-height: 1.7; }
        .ex-weather-example-list { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
        .ex-weather-example-list li { min-width: 0; padding: 11px 13px; border-radius: 13px; background: #f7f9fc; color: #58687e; font-size: 11px; line-height: 1.65; }
        .ex-venue-bias-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(330px,100%),1fr)); gap: 12px; }
        .ex-venue-bias-card { min-width: 0; display: grid; gap: 11px; padding: 18px; border: 1px solid #dfe5ef; border-radius: 20px; background: linear-gradient(145deg,#fff,#f7f5ff); }
        .ex-venue-bias-card h3 { margin: 0; color: #263650; font: 800 20px/1.35 ${serif}; }
        .ex-venue-bias-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
        .ex-venue-bias-metrics { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 7px; }
        .ex-venue-bias-metrics div { min-width: 0; padding: 9px 10px; border-radius: 12px; background: rgba(247,249,253,.96); color: #748096; font-size: 9px; line-height: 1.45; }
        .ex-venue-bias-metrics strong { display: block; margin-top: 3px; color: #263650; font-size: 13px; }
        .ex-venue-bias-tags { display: flex; flex-wrap: wrap; gap: 6px; }
        .ex-venue-bias-tags span { padding: 5px 8px; border-radius: 999px; background: #eee8ff; color: #5f4a99; font-size: 9px; font-weight: 900; }
        .ex-venue-definition-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(240px,100%),1fr)); gap: 9px; }
        .ex-venue-definition-grid article { min-width: 0; padding: 14px; border: 1px solid #e1e5ed; border-radius: 16px; background: rgba(255,255,255,.84); }
        .ex-venue-definition-grid h4 { margin: 0 0 6px; color: #4e4382; font-size: 12px; }
        .ex-venue-definition-grid p { margin: 0; color: #69768b; font-size: 10px; line-height: 1.7; }
        .ex-today-flow-meter { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(210px,100%),1fr)); gap: 10px; }
        .ex-today-flow-meter article { min-width: 0; display: grid; gap: 7px; padding: 16px; border: 1px solid #dce5ef; border-radius: 18px; background: linear-gradient(145deg,#fff,#f1f9ff); }
        .ex-today-flow-meter span { color: #708096; font-size: 9px; font-weight: 900; letter-spacing: .05em; }
        .ex-today-flow-meter strong { color: #21405e; font: 850 27px/1 ${serif}; }
        .ex-today-flow-meter small { color: #8490a2; font-size: 9px; line-height: 1.55; }
        .ex-today-flow-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(350px,100%),1fr)); gap: 12px; }
        .ex-today-flow-card { min-width: 0; display: grid; gap: 11px; padding: 18px; border: 1px solid #dfe5ed; border-radius: 20px; background: linear-gradient(145deg,#fff,#f5fbff); }
        .ex-today-flow-card h3 { margin: 0; color: #263650; font: 800 20px/1.35 ${serif}; }
        .ex-today-flow-recent { display: flex; flex-wrap: wrap; gap: 6px; }
        .ex-today-flow-recent span { min-width: 0; padding: 7px 8px; border-radius: 11px; background: #f2f5fa; color: #596a80; font-size: 9px; line-height: 1.45; }
        .ex-today-flow-hints { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(150px,100%),1fr)); gap: 9px; }
        .ex-today-flow-hints article { min-width: 0; padding: 14px; border: 1px solid #e0e4ed; border-radius: 16px; background: rgba(255,255,255,.86); }
        .ex-today-flow-hints strong { display: block; margin-top: 5px; color: #5b4794; font: 850 24px/1 ${serif}; }
        .ex-coverage-status { display: inline-flex; width: fit-content; max-width: 100%; padding: 5px 8px; border-radius: 999px; background: #edf0f4; color: #626d7e; font-size: 8px; font-weight: 950; line-height: 1.35; overflow-wrap: anywhere; }
        .ex-coverage-status.is-implemented { color: #23664c; background: #daf5e8; }
        .ex-coverage-status.is-partial { color: #315f91; background: #e1efff; }
        .ex-coverage-status.is-future-accumulation { color: #6a7280; background: #eceef2; }
        .ex-coverage-status.is-unavailable { color: #9a3d4f; background: #ffe8ed; }
        .ex-coverage-status.is-not-published { color: #925711; background: #fff0d3; }
        .ex-coverage-matrix { min-width: 1120px; }
        .ex-coverage-matrix td { white-space: normal; min-width: 150px; line-height: 1.65; vertical-align: top; }
        .ex-coverage-matrix td:first-child { min-width: 210px; color: #263650; font-weight: 850; }
        .ex-category-board { min-width: 1080px; }
        .ex-category-board td, .ex-category-board th { white-space: normal; text-align: center; }
        .ex-category-board td:first-child { min-width: 180px; text-align: left; color: #263650; font-weight: 850; }
        .ex-coverage-tab-map { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(260px,100%),1fr)); gap: 10px; }
        .ex-coverage-tab-map article { min-width: 0; padding: 15px; border: 1px solid #e0e5ed; border-radius: 17px; background: rgba(255,255,255,.86); }
        .ex-coverage-tab-map h3 { margin: 0 0 7px; color: #4f4383; font: 800 17px/1.35 ${serif}; }
        .ex-coverage-tab-map p { margin: 0; color: #69768b; font-size: 10px; line-height: 1.7; }
        .ex-backfill-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(210px,100%),1fr)); gap: 9px; }
        .ex-backfill-grid article { min-width: 0; display: grid; gap: 7px; padding: 13px; border: 1px solid #e1e5ed; border-radius: 15px; background: rgba(255,255,255,.84); }
        .ex-backfill-grid strong { color: #37465c; font-size: 11px; overflow-wrap: anywhere; }
        .ex-definition-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(250px,100%),1fr)); gap: 9px; }
        .ex-definition-grid article { min-width: 0; padding: 14px; border-left: 4px solid #8470bf; border-radius: 0 15px 15px 0; background: #f7f5ff; color: #5c687c; font-size: 10px; line-height: 1.75; }
        .ex-chain-example h3 { margin: 0; color: #30405a; font: 800 17px/1.35 ${serif}; }
        .ex-chain-example p { margin: 0; color: #68758a; font-size: 11px; line-height: 1.65; }
        .ex-data-table { width: 100%; border-collapse: collapse; min-width: 580px; color: #526078; font-size: 12px; }
        .ex-data-table th, .ex-data-table td { padding: 10px 9px; border-bottom: 1px solid #edf0f4; text-align: left; white-space: nowrap; }
        .ex-data-table th { color: #7765ae; font-size: 10px; letter-spacing: .08em; }
        .ex-table-wrap { max-width: 100%; overflow-x: auto; border: 1px solid #e4e7ee; border-radius: 18px; background: rgba(255,255,255,.7); }
        .ex-low-sample { display: inline-flex; margin-top: 8px; padding: 4px 7px; border-radius: 999px; background: #fff2dc; color: #985b15; font-size: 9px; font-weight: 900; }
        .ex-subsection { display: grid; grid-template-columns: minmax(0,1fr); gap: 13px; padding-top: 4px; }
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
        .ex-analysis-inventory-summary { display: grid; grid-template-columns: repeat(auto-fit,minmax(150px,1fr)); gap: 10px; }
        .ex-analysis-inventory-summary article { min-width: 0; padding: 15px; border: 1px solid #e1e5ee; border-radius: 17px; background: rgba(255,255,255,.86); }
        .ex-analysis-inventory-summary strong { display: block; margin-top: 6px; color: #263650; font: 850 25px/1 ${serif}; }
        .ex-analysis-inventory-summary span { color: #738097; font-size: 9px; font-weight: 900; letter-spacing: .06em; overflow-wrap: anywhere; }
        .ex-analysis-inventory-legend { display: grid; grid-template-columns: repeat(auto-fit,minmax(230px,1fr)); gap: 9px; }
        .ex-analysis-inventory-legend div { display: grid; gap: 6px; padding: 12px 14px; border-radius: 15px; background: #f7f9fc; color: #6b778d; font-size: 10px; line-height: 1.65; }
        .ex-analysis-inventory-categories { display: grid; gap: 16px; }
        .ex-analysis-inventory-category { display: grid; gap: 11px; padding-top: 4px; }
        .ex-analysis-inventory-category-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding-bottom: 9px; border-bottom: 1px solid #e4e8f0; }
        .ex-analysis-inventory-category-head h3 { margin: 0; color: #293851; font: 800 19px/1.3 ${serif}; }
        .ex-analysis-inventory-category-head span { color: #8290a4; font-size: 10px; font-weight: 850; }
        .ex-analysis-inventory-grid { display: grid; grid-template-columns: repeat(${isMobile ? 1 : 2},minmax(0,1fr)); gap: 10px; }
        .ex-analysis-inventory-item { min-width: 0; padding: 15px; border: 1px solid #e2e6ef; border-radius: 17px; background: rgba(255,255,255,.86); }
        .ex-analysis-inventory-item-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
        .ex-analysis-inventory-item h4 { margin: 0; color: #263650; font: 800 15px/1.4 ${serif}; }
        .ex-analysis-inventory-item p { margin: 9px 0 0; color: #69768b; font-size: 10px; line-height: 1.7; }
        .ex-analysis-inventory-meta { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 7px; margin-top: 10px; }
        .ex-analysis-inventory-meta div { padding: 8px 9px; border-radius: 11px; background: #f7f9fc; color: #7b8799; font-size: 9px; line-height: 1.55; overflow-wrap: anywhere; }
        .ex-analysis-inventory-meta b { display: block; margin-bottom: 2px; color: #56657b; }
        .ex-analysis-inventory-status { flex: 0 0 auto; display: inline-flex; max-width: 170px; padding: 5px 8px; border-radius: 999px; color: #546278; background: #edf0f4; font-size: 8px; font-weight: 950; letter-spacing: .04em; line-height: 1.35; text-align: center; }
        .ex-analysis-inventory-status.is-existing { color: #23664c; background: #daf5e8; }
        .ex-analysis-inventory-status.is-extend-existing { color: #315f91; background: #e1efff; }
        .ex-analysis-inventory-status.is-available-not-rendered { color: #59449b; background: #eee8ff; }
        .ex-analysis-inventory-status.is-partial { color: #315f91; background: #e7f0fb; }
        .ex-analysis-inventory-status.is-low-sample { color: #925711; background: #fff0d3; }
        .ex-analysis-inventory-status.is-future-accumulation { color: #6a7280; background: #eceef2; }
        .ex-analysis-inventory-status.is-not-generated-fake-prohibited { color: #9a3d4f; background: #ffe8ed; }
        .ex-source-capability-summary { display: grid; grid-template-columns: repeat(${isMobile ? 2 : 5},minmax(0,1fr)); gap: 9px; }
        .ex-source-capability-summary article { min-width: 0; padding: 13px; border: 1px solid #e1e5ee; border-radius: 15px; background: rgba(255,255,255,.86); }
        .ex-source-capability-summary span { color: #748097; font-size: 9px; font-weight: 900; letter-spacing: .05em; overflow-wrap: anywhere; }
        .ex-source-capability-summary strong { display: block; margin-top: 5px; color: #263650; font: 850 22px/1 ${serif}; }
        .ex-source-capability-grid { display: grid; grid-template-columns: repeat(${isMobile ? 1 : 2},minmax(0,1fr)); gap: 9px; }
        .ex-source-capability-item { display: grid; gap: 8px; min-width: 0; padding: 14px; border: 1px solid #e2e6ef; border-radius: 16px; background: rgba(255,255,255,.84); }
        .ex-source-capability-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 9px; }
        .ex-source-capability-head h3 { margin: 0; color: #293851; font: 800 15px/1.4 ${serif}; }
        .ex-source-capability-item p { margin: 0; color: #6a778c; font-size: 10px; line-height: 1.7; }
        .ex-source-capability-keys { color: #8390a3; font-size: 9px; line-height: 1.6; overflow-wrap: anywhere; }
        .ex-source-capability-status { flex: 0 0 auto; display: inline-flex; padding: 5px 8px; border-radius: 999px; color: #5d687a; background: #edf0f4; font-size: 8px; font-weight: 950; letter-spacing: .04em; }
        .ex-source-capability-status.is-available { color: #23664c; background: #daf5e8; }
        .ex-source-capability-status.is-partial { color: #315f91; background: #e1efff; }
        .ex-source-capability-status.is-unavailable { color: #6a7280; background: #eceef2; }
        .ex-source-capability-status.is-fake-prohibited { color: #9a3d4f; background: #ffe8ed; }
        .ex-available-focus-summary { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; padding: 15px 17px; border: 1px solid #dfe6ed; border-radius: 17px; background: linear-gradient(135deg,#f5fff9,#f5f9ff); }
        .ex-available-focus-summary strong { color: #245d4c; font: 850 24px/1 ${serif}; }
        .ex-available-focus-summary span { color: #69778c; font-size: 10px; line-height: 1.65; }
        .ex-available-focus-grid { display: grid; grid-template-columns: repeat(${isMobile ? 1 : 3},minmax(0,1fr)); gap: 10px; }
        .ex-available-focus-card { min-width: 0; padding: 15px; border: 1px solid #e0e6ec; border-radius: 17px; background: rgba(255,255,255,.88); }
        .ex-available-focus-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 9px; }
        .ex-available-focus-head h3 { margin: 0; color: #263650; font: 800 16px/1.4 ${serif}; }
        .ex-available-focus-section { margin-top: 9px; color: #596a80; font-size: 10px; font-weight: 850; line-height: 1.6; }
        .ex-available-focus-card p { margin: 8px 0 0; color: #69768b; font-size: 10px; line-height: 1.7; }
        .ex-available-focus-signals { margin: 9px 0 0; padding-left: 18px; color: #53677d; font-size: 10px; line-height: 1.65; }
        .ex-available-focus-caution { margin-top: 9px; padding: 9px 10px; border-radius: 11px; background: #fff8ed; color: #805e31; font-size: 9px; line-height: 1.65; }
        .ex-available-focus-next { margin-top: 8px; color: #7b8799; font-size: 9px; line-height: 1.6; }
        .ex-available-focus-partial { display: grid; grid-template-columns: repeat(${isMobile ? 1 : 2},minmax(0,1fr)); gap: 9px; padding-top: 4px; }
        .ex-future-plan-summary { display: grid; grid-template-columns: repeat(${isMobile ? 2 : 4},minmax(0,1fr)); gap: 9px; }
        .ex-future-plan-summary article { min-width: 0; padding: 13px; border: 1px solid #e1e5ee; border-radius: 15px; background: rgba(255,255,255,.86); }
        .ex-future-plan-summary span { color: #748097; font-size: 9px; font-weight: 900; letter-spacing: .05em; overflow-wrap: anywhere; }
        .ex-future-plan-summary strong { display: block; margin-top: 5px; color: #263650; font: 850 22px/1 ${serif}; }
        .ex-future-plan-status-summary { display: flex; flex-wrap: wrap; gap: 8px; }
        .ex-future-plan-status-summary span { padding: 7px 10px; border-radius: 999px; background: #f1f3f7; color: #657187; font-size: 9px; font-weight: 900; }
        .ex-future-plan-group { display: grid; gap: 10px; }
        .ex-future-plan-group-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding-bottom: 8px; border-bottom: 1px solid #e5e8ef; }
        .ex-future-plan-group-head h3 { margin: 0; color: #293851; font: 800 19px/1.3 ${serif}; }
        .ex-future-plan-group-head span { color: #8490a2; font-size: 10px; font-weight: 850; }
        .ex-future-plan-grid { display: grid; grid-template-columns: repeat(${isMobile ? 1 : 2},minmax(0,1fr)); gap: 10px; }
        .ex-future-plan-card { min-width: 0; padding: 15px; border: 1px solid #e1e5ed; border-radius: 17px; background: rgba(255,255,255,.88); }
        .ex-future-plan-card.is-high { border-color: #d4c9ef; background: linear-gradient(145deg,#fff,#f8f5ff); }
        .ex-future-plan-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
        .ex-future-plan-head > div > span { color: #765fae; font-size: 8px; font-weight: 950; letter-spacing: .1em; }
        .ex-future-plan-head h3 { margin: 3px 0 0; color: #263650; font: 800 16px/1.4 ${serif}; }
        .ex-future-plan-status { flex: 0 0 auto; display: inline-flex; padding: 5px 8px; border-radius: 999px; background: #edf0f4; color: #687184; font-size: 8px; font-weight: 950; }
        .ex-future-plan-status.is-partial { color: #315f91; background: #e1efff; }
        .ex-future-plan-status.is-future-accumulation { color: #6a7280; background: #eceef2; }
        .ex-future-plan-status.is-unavailable { color: #6a7280; background: #eceef2; }
        .ex-future-plan-status.is-fake-prohibited { color: #9a3d4f; background: #ffe8ed; }
        .ex-future-plan-fields { display: grid; gap: 4px; margin-top: 11px; padding: 10px; border-radius: 12px; background: #f7f9fc; color: #647187; font-size: 9px; line-height: 1.6; overflow-wrap: anywhere; }
        .ex-future-plan-fields b, .ex-future-plan-card p b { display: block; margin-bottom: 2px; color: #526176; }
        .ex-future-plan-card p { margin: 9px 0 0; color: #6c788c; font-size: 9px; line-height: 1.7; }
        .ex-source-schema-summary { display: grid; grid-template-columns: repeat(${isMobile ? 2 : 4},minmax(0,1fr)); gap: 9px; }
        .ex-source-schema-summary article { min-width: 0; padding: 13px; border: 1px solid #e1e5ee; border-radius: 15px; background: rgba(255,255,255,.86); }
        .ex-source-schema-summary span { color: #748097; font-size: 9px; font-weight: 900; letter-spacing: .05em; overflow-wrap: anywhere; }
        .ex-source-schema-summary strong { display: block; margin-top: 5px; color: #263650; font: 850 22px/1 ${serif}; }
        .ex-source-schema-meta-summary { display: flex; flex-wrap: wrap; gap: 8px; }
        .ex-source-schema-meta-summary span { padding: 7px 10px; border-radius: 999px; background: #f1f3f7; color: #657187; font-size: 9px; font-weight: 900; }
        .ex-source-schema-group { display: grid; gap: 10px; }
        .ex-source-schema-group-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding-bottom: 8px; border-bottom: 1px solid #e5e8ef; }
        .ex-source-schema-group-head h3 { margin: 0; color: #293851; font: 800 19px/1.3 ${serif}; }
        .ex-source-schema-group-head span { color: #8490a2; font-size: 10px; font-weight: 850; }
        .ex-source-schema-grid { display: grid; grid-template-columns: repeat(${isMobile ? 1 : 2},minmax(0,1fr)); gap: 10px; }
        .ex-source-schema-card { min-width: 0; padding: 16px; border: 1px solid #e1e5ed; border-radius: 18px; background: rgba(255,255,255,.88); }
        .ex-source-schema-card.is-high { border-color: #cbdde7; background: linear-gradient(145deg,#fff,#f2fbff); }
        .ex-source-schema-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
        .ex-source-schema-head > div > span { color: #4e7890; font-size: 8px; font-weight: 950; letter-spacing: .09em; }
        .ex-source-schema-head h3 { margin: 3px 0 0; color: #263650; font: 800 17px/1.4 ${serif}; }
        .ex-source-schema-status { flex: 0 0 auto; display: inline-flex; max-width: 145px; padding: 5px 8px; border-radius: 999px; background: #edf0f4; color: #687184; font-size: 8px; font-weight: 950; line-height: 1.35; text-align: center; }
        .ex-source-schema-status.is-ready-for-script { color: #23664c; background: #daf5e8; }
        .ex-source-schema-status.is-design-only { color: #315f91; background: #e1efff; }
        .ex-source-schema-status.is-blocked-by-source { color: #925711; background: #fff0d3; }
        .ex-source-schema-status.is-fake-prohibited { color: #9a3d4f; background: #ffe8ed; }
        .ex-source-schema-target { display: grid; gap: 4px; margin-top: 11px; padding: 10px; border-radius: 12px; background: #f4f9fb; color: #586b7e; font-size: 9px; line-height: 1.6; }
        .ex-source-schema-target b, .ex-source-schema-columns b, .ex-source-schema-rules b, .ex-source-schema-script b { display: block; color: #496174; }
        .ex-source-schema-columns { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 8px; margin-top: 9px; }
        .ex-source-schema-columns div { min-width: 0; padding: 9px; border-radius: 11px; background: #f7f9fc; color: #68758a; font-size: 9px; line-height: 1.6; overflow-wrap: anywhere; }
        .ex-source-schema-rules { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 8px; margin-top: 9px; }
        .ex-source-schema-rules > div { min-width: 0; padding: 10px; border-radius: 11px; background: #f7f9fc; color: #647187; font-size: 9px; line-height: 1.65; }
        .ex-source-schema-rules > div.is-fake { background: #fff6f6; color: #80545c; }
        .ex-source-schema-rules ul { margin: 5px 0 0; padding-left: 17px; }
        .ex-source-schema-script { margin-top: 9px; padding-top: 9px; border-top: 1px solid #e7eaf0; color: #7a8698; font-size: 9px; line-height: 1.65; overflow-wrap: anywhere; }
        @media (max-width: 520px) { .ex-ranking-grid { max-height: none; overflow-y: visible; } }

        @media (max-width: 520px) { .ex-health-grid, .ex-kpi-grid { grid-template-columns: 1fr; } }

        /* KURARI EX priority 21 visual polish */
        .ex-panel.ex-section { padding: ${isMobile ? "20px" : "28px"}; margin-top: ${isMobile ? "18px" : "24px"}; }
        .ex-panel.ex-section + .ex-panel.ex-section { margin-top: ${isMobile ? "18px" : "24px"}; }
        .ex-section-title { display: grid; gap: 7px; margin-bottom: ${isMobile ? "16px" : "20px"}; }
        .ex-section-title h2 { margin: 0; color: #1f2d45; letter-spacing: .01em; }
        .ex-section-title p { max-width: 980px; margin: 0; color: #6c7890; line-height: 1.75; }
        .ex-eyebrow { letter-spacing: .13em; }
        .ex-muted { line-height: 1.65; }
        .ex-location-grid, .ex-kpi-grid { align-items: stretch; }
        .ex-location-card, .ex-metric-card, .ex-rider-overview-card, .ex-condition-card, .ex-matchup-overview-card, .ex-relationship-card, .ex-tactic-event-card { transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease; }
        .ex-location-card:hover, .ex-metric-card:hover, .ex-rider-overview-card:hover, .ex-condition-card:hover, .ex-matchup-overview-card:hover, .ex-relationship-card:hover, .ex-tactic-event-card:hover { transform: translateY(-1px); box-shadow: 0 16px 34px rgba(39,54,84,.09); border-color: #d2d9e8; }
        .ex-rider-filter-panel { box-shadow: inset 0 1px 0 rgba(255,255,255,.72), 0 12px 26px rgba(52,65,96,.05); }
        .ex-rider-filter-input { min-height: 44px; }
        .ex-rider-filter-clear:not(:disabled), .ex-rider-filter-chip:not(.is-unavailable) { cursor: pointer; }
        .ex-rider-filter-chip { line-height: 1.35; }
        .ex-rider-filter-chip:focus-visible, .ex-rider-filter-clear:focus-visible, .ex-condition-tab:focus-visible, .ex-view-tab:focus-visible { outline: 3px solid rgba(112,90,179,.24); outline-offset: 2px; }
        .ex-rider-overview-table-wrap, .ex-condition-table-wrap { scrollbar-width: thin; scrollbar-color: #b9c2d4 #f3f6fb; }
        .ex-rider-overview-table th, .ex-condition-table th { position: sticky; top: 0; z-index: 1; }
        .ex-rider-overview-table tbody tr:nth-child(even), .ex-condition-table tbody tr:nth-child(even) { background: rgba(248,250,253,.66); }
        .ex-rider-overview-table tbody tr:hover, .ex-condition-table tbody tr:hover { background: rgba(239,244,255,.92); }
        .ex-rider-overview-table td, .ex-condition-table td, .ex-matchup-overview-note, .ex-relationship-note, .ex-relationship-target, .ex-relationship-evidence { overflow-wrap: anywhere; }
        .ex-rider-overview-legend { row-gap: 8px; }
        .ex-condition-source { line-height: 1.65; }
        .ex-condition-tabs { scroll-snap-type: x proximity; }
        .ex-condition-tab { scroll-snap-align: start; white-space: nowrap; }
        .ex-matchup-overview-summary div { min-width: 0; }
        .ex-matchup-overview-summary strong { overflow-wrap: anywhere; }
        .ex-role-description, .ex-location-policy { line-height: 1.75; }
        @media (max-width: 760px) {
          .ex-panel.ex-section { border-radius: 22px; }
          .ex-section-title { gap: 6px; }
          .ex-rider-filter-counts, .ex-matchup-overview-summary { grid-template-columns: 1fr 1fr; }
          .ex-rider-overview-card, .ex-condition-card, .ex-matchup-overview-card, .ex-relationship-card, .ex-tactic-event-card { padding: 16px; }
          .ex-matchup-overview-card-grid, .ex-condition-card-grid { grid-template-columns: 1fr 1fr; }
        }
        @media (min-width: 521px) and (max-width: 1100px) {
          .ex-workspace { grid-template-columns: 1fr; }
          .ex-health-grid { grid-template-columns: repeat(2,minmax(0,1fr)); }
          .ex-kpi-grid { grid-template-columns: repeat(2,minmax(0,1fr)); }
        }
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

        <nav className="ex-section-tabs" role="tablist" aria-label="KURARI EX内部ページ" data-testid="ex-section-tabs">
          {EX_SECTION_TABS.map((tab) => (
            <button
              key={tab.key}
              className={`ex-section-tab${activeSectionTab === tab.key ? " is-active" : ""}`}
              type="button"
              role="tab"
              aria-label={tab.label}
              aria-selected={activeSectionTab === tab.key}
              aria-controls={["trend", "ranking", "turbulence", "chain", "weather", "venue-bias", "today-flow", "structure-lab"].includes(tab.key)
                ? "ex-section-trend-lab"
                : `ex-section-${tab.key}`}
              onClick={() => {
                if (RESULT_TREND_LOAD_TABS.includes(tab.key) && !trifectaTrend) {
                  setTrifectaTrendStatus("loading");
                  setHistoricalAvailabilityStatus("loading");
                }
                setActiveSectionTab(tab.key);
              }}
            >
              <strong>{tab.label}</strong>
              <span>{tab.sublabel}</span>
            </button>
          ))}
        </nav>

        <section
          className="ex-panel ex-section"
          data-testid="ex-section-overview"
          id="ex-section-overview"
          hidden={activeSectionTab !== "overview"}
        >
          <SectionTitle
            eyebrow="KURARI EX OVERVIEW"
            title="EX全体サマリー"
            lead="identity・source・Result Trend Lab・既存EX分析の現在地を、保存済み値だけで簡潔に表示します。"
          />
          <div className="ex-health-grid">
            <MetricCard
              label="REGISTRATION NO COVERAGE"
              value={identitySourceStatus === "loading"
                ? "…"
                : `${valueText(identitySourceSummary?.registrationNoCompleteCount)} / ${valueText(identitySourceSummary?.starterCount)}`}
              note={`未取得 ${valueText(identitySourceSummary?.registrationNoMissingCount, "人")}`}
              warning={(identitySourceSummary?.registrationNoMissingCount ?? 0) > 0}
            />
            <MetricCard label="OFFICIAL ENTRIES" value={valueText(identitySourceSummary?.officialEntriesCount, "人")} note="KEIRIN.JP exact connection" />
            <MetricCard label="SOURCE-BACKED ALIAS" value={valueText(identitySourceSummary?.sourceBackedAliasCount, "人")} note="official directとは分離" />
            <MetricCard
              label="AUTO UPDATE"
              value={initialStatus === "loading" ? "CHECKING" : publicExFreshness.label}
              note={status?.lastImportAt ?? "取得日時 未取得"}
              warning={publicExFreshness.status !== "fresh"}
            />
          </div>
          <div className="ex-health-grid">
            <MetricCard
              label="TRIFECTA RANKING"
              value={trifectaTrend?.status === "ready" ? "IMPLEMENTED v1" : trifectaTrendStatus === "error" ? "UNAVAILABLE" : "CHECKING"}
              note={trifectaTrend ? `${trifectaTrend.eligibleRaceCount.toLocaleString("ja-JP")} eligible races` : "official result only"}
              warning={trifectaTrendStatus === "error"}
            />
            <MetricCard
              label="TURBULENCE INDEX"
              value={trifectaTrend ? "IMPLEMENTED v1" : trifectaTrendStatus === "error" ? "UNAVAILABLE" : "ON DEMAND"}
              note="actual trifecta payout / タブ表示時に集計"
              warning={trifectaTrendStatus === "error"}
            />
            <MetricCard
              label="RACE CHAIN"
              value={trifectaTrend ? "IMPLEMENTED v1" : trifectaTrendStatus === "error" ? "UNAVAILABLE" : "ON DEMAND"}
              note="official result only / タブ表示時に集計"
              warning={trifectaTrendStatus === "error"}
            />
            <MetricCard
              label="VENUE BIAS"
              value={trifectaTrend ? "IMPLEMENTED v1" : trifectaTrendStatus === "error" ? "UNAVAILABLE" : "ON DEMAND"}
              note="official result only / タブ表示時に集計"
              warning={trifectaTrendStatus === "error"}
            />
            <MetricCard
              label="TODAY FLOW"
              value={trifectaTrend ? "IMPLEMENTED v1" : trifectaTrendStatus === "error" ? "UNAVAILABLE" : "ON DEMAND"}
              note={trifectaTrend?.sourceDate ? `${trifectaTrend.sourceDate} / latest official result date` : "latest official result date"}
              warning={trifectaTrendStatus === "error"}
            />
            <MetricCard label="SLACK NOTIFICATION STATE" value="UNAVAILABLE" note="EX公開datasetに専用stateなし" warning />
          </div>
          <div className="ex-overview-status">
            <span className="ex-trend-status-pill is-ready">fake completion: なし</span>
            <span className="ex-trend-status-pill is-ready">fuzzy matching: なし</span>
            <span className="ex-trend-status-pill is-ready">official result only</span>
            <span className="ex-trend-status-pill is-caution">LOW SAMPLEは参考のみ</span>
            <span className="ex-trend-status-pill is-future-accumulation">unknown / unavailableは未実装扱い</span>
          </div>
        </section>

        <section
          className="ex-panel ex-section"
          data-testid="result-trend-lab-roadmap"
          id="ex-section-trend-lab"
          hidden={!["trend", "ranking", "turbulence", "chain", "weather", "venue-bias", "today-flow", "structure-lab"].includes(activeSectionTab)}
        >
          <SectionTitle
            eyebrow="KURARI EX RESULT TREND LAB"
            title="出目と流れを読む、次世代分析ラボ"
            lead="historical 60日とcurrent official feedをraceKeyで重複排除し、trendEligibleな確定結果だけで6分析を再集計します。今日の流れは統合母数の最新日だけを別スコープで表示します。"
          />
          <div hidden={!["ranking", "turbulence", "chain", "weather", "venue-bias", "today-flow"].includes(activeSectionTab)}>
            <HistoricalTrendSourceSummary trend={trifectaTrend} status={trifectaTrendStatus} />
          </div>
          <div className="ex-health-grid" hidden={activeSectionTab !== "trend"}>
            <MetricCard label="DATA AVAILABILITY AUDIT" value="IMPLEMENTED" note="schema / coverage / provenance監査" />
            <MetricCard label="RANKING / PAYOUT ENGINE" value="IMPLEMENTED v1" note="official 3連単結果・実払戻金のみ" />
            <MetricCard label="ODDS GAP ANALYSIS" value="FUTURE" note="最低オッズ未取得・fake prohibited" warning />
            <MetricCard
              label="WIND × FINISH TREND"
              value={trifectaTrend ? "IMPLEMENTED v1" : trifectaTrendStatus === "error" ? "UNAVAILABLE" : "CHECKING"}
              note="official result only / タブ表示時に集計"
              warning={trifectaTrendStatus === "error"}
            />
            <MetricCard
              label="VENUE BIAS"
              value={trifectaTrend ? "IMPLEMENTED v1" : trifectaTrendStatus === "error" ? "UNAVAILABLE" : "CHECKING"}
              note="official result only / タブ表示時に集計"
              warning={trifectaTrendStatus === "error"}
            />
            <MetricCard
              label="TODAY FLOW METER"
              value={trifectaTrend ? "IMPLEMENTED v1" : trifectaTrendStatus === "error" ? "UNAVAILABLE" : "CHECKING"}
              note={trifectaTrend?.sourceDate ? `${trifectaTrend.sourceDate} / latest official result date` : "latest official result date"}
              warning={trifectaTrendStatus === "error"}
            />
          </div>

          {activeSectionTab === "ranking" ? (
          <div className="ex-subsection" data-testid="result-trend-lab-ranking-v1">
            <SectionTitle
              eyebrow="TRIFECTA OUTCOME RANKING v1"
              title="3連単出目ランキング v1"
              lead="KEIRIN.JP official resultのうち、race key・確定着順・3連単結果が一致するレースだけを動的集計します。"
            />
            {trifectaTrendStatus === "loading" ? <EmptyState text="official resultを確認しています。" /> : null}
            {trifectaTrendStatus === "error" ? (
              <EmptyState text="No eligible official result data / official sourceを取得できませんでした。" />
            ) : null}
            {trifectaTrend ? (
              <>
                <div className="ex-health-grid">
                  <MetricCard
                    label="SOURCE"
                    value={trifectaTrend.sourceName}
                    note={trifectaTrend.sourceFetchedAt
                      ? `取得 ${new Date(trifectaTrend.sourceFetchedAt).toLocaleString("ja-JP")}`
                      : "source unavailable"}
                    warning={!trifectaTrend.sourceFetchedAt}
                  />
                  <MetricCard
                    label="統合集計対象"
                    value={`${trifectaTrend.eligibleRaceCount.toLocaleString("ja-JP")}R`}
                    note="60日historical trend対象 + 最新current"
                  />
                  <MetricCard
                    label="EXCLUDED RACES"
                    value={trifectaTrend.excludedRaceCount.toLocaleString("ja-JP")}
                    note="strict eligibilityで除外"
                    warning={trifectaTrend.excludedRaceCount > 0}
                  />
                  <MetricCard
                    label="SAMPLE STATUS"
                    value={trifectaTrend.sampleLabel}
                    note={trifectaTrend.sampleStatus === "low-sample"
                      ? "参考のみ"
                      : trifectaTrend.sampleStatus === "caution"
                        ? "傾向注意"
                        : "予想の主根拠ではなく補助"}
                    warning={trifectaTrend.sampleStatus !== "usable"}
                  />
                </div>

                {trifectaTrend.status === "ready" ? (
                  <div className="ex-trend-ranking-grid">
                    <TrendRankingCard title="3連単出目 TOP" rows={trifectaTrend.trifectaRanking} />
                    <TrendRankingCard title="1着車番 TOP" rows={trifectaTrend.firstCarRanking} />
                    <TrendRankingCard title="2着車番 TOP" rows={trifectaTrend.secondCarRanking} />
                    <TrendRankingCard title="3着車番 TOP" rows={trifectaTrend.thirdCarRanking} />
                    <TrendRankingCard title="車番別3着内率" rows={trifectaTrend.carTop3RateRanking} top3Rate />
                  </div>
                ) : (
                  <EmptyState text="No eligible official result data" />
                )}

                <div className="ex-location-grid">
                  <article className="ex-location-card">
                    <div className="ex-location-head">
                      <h3>除外理由</h3>
                      <span className="ex-location-status is-warning">EXCLUDED</span>
                    </div>
                    {trifectaTrend.exclusionReasons.length ? (
                      <ul className="ex-trend-reasons">
                        {trifectaTrend.exclusionReasons.map((reason) => (
                          <li key={reason.key}>{reason.label}: {reason.count.toLocaleString("ja-JP")}R</li>
                        ))}
                      </ul>
                    ) : (
                      <div className="ex-muted">除外なし</div>
                    )}
                  </article>
                  <article className="ex-location-card">
                    <div className="ex-location-head">
                      <h3>FILTER READINESS</h3>
                      <span className="ex-location-status is-partial">FOUNDATION</span>
                    </div>
                    <div className="ex-trend-status-row">
                      {trifectaTrend.filterReadiness.map((filter) => (
                        <span
                          className={`ex-trend-status-pill is-${filter.status}`}
                          key={filter.key}
                          title={filter.note}
                        >
                          {filter.label}: {filter.status}
                        </span>
                      ))}
                    </div>
                  </article>
                </div>
              </>
            ) : null}
          </div>
          ) : null}

          {activeSectionTab === "turbulence" ? (
          <div className="ex-subsection" data-testid="result-trend-lab-turbulence-v1">
            <SectionTitle
              eyebrow="KURARI EX TURBULENCE INDEX v1"
              title="荒れ指数 v1"
              lead="official resultに保存された3連単実払戻金だけで、堅め / 中穴 / 荒れ / 大荒れ / 超荒れを分類します。"
            />
            {trifectaTrendStatus === "loading" ? <EmptyState text="official payoutを確認しています。" /> : null}
            {trifectaTrendStatus === "error" ? (
              <EmptyState text="No eligible official payout data / official sourceを取得できませんでした。" />
            ) : null}
            {trifectaTrend ? (
              <>
                <div className="ex-health-grid">
                  <MetricCard label="SOURCE" value="official result only" note={trifectaTrend.sourceName} />
                  <MetricCard label="BASIS" value="3連単実払戻金" note="actual trifecta payout" />
                  <MetricCard label="ODDS GAP" value="FUTURE" note="future-accumulation / 最低オッズ未取得" warning />
                  <MetricCard
                    label="SAMPLE STATUS"
                    value={trifectaTrend.turbulence.sampleLabel}
                    note={trifectaTrend.turbulence.sampleStatus === "low-sample"
                      ? "参考のみ"
                      : trifectaTrend.turbulence.sampleStatus === "caution"
                        ? "傾向注意"
                        : "予想の主根拠ではなく補助"}
                    warning={trifectaTrend.turbulence.sampleStatus !== "usable"}
                  />
                </div>

                {trifectaTrend.turbulence.status === "ready" ? (
                  <>
                    <div className="ex-kpi-grid">
                      <MetricCard
                        label="統合集計対象"
                        value={`${trifectaTrend.turbulence.eligibleRaceCount.toLocaleString("ja-JP")}R`}
                        note="60日historical trend対象 + 最新current"
                      />
                      <MetricCard
                        label="EXCLUDED RACES"
                        value={trifectaTrend.turbulence.excludedRaceCount.toLocaleString("ja-JP")}
                        note="strict eligibilityで除外"
                        warning={trifectaTrend.turbulence.excludedRaceCount > 0}
                      />
                      <MetricCard
                        label="AVERAGE TRIFECTA"
                        value={formatPayoutYen(trifectaTrend.turbulence.averagePayoutYen)}
                        note="eligible official payout平均"
                      />
                      <MetricCard
                        label="MEDIAN"
                        value={formatPayoutYen(trifectaTrend.turbulence.medianPayoutYen)}
                        note="eligible official payout中央値"
                      />
                      <MetricCard
                        label="MAX PAYOUT"
                        value={formatPayoutYen(trifectaTrend.turbulence.maxPayoutYen)}
                        note="eligible official payout最大"
                      />
                    </div>

                    <div className="ex-turbulence-category-grid">
                      {trifectaTrend.turbulence.categories.map((category) => (
                        <article
                          className={`ex-turbulence-category is-${category.key}`}
                          key={category.key}
                        >
                          <strong>{category.label}</strong>
                          <b>{category.count.toLocaleString("ja-JP")}R</b>
                          <span>{category.rate.toFixed(1)}%</span>
                          <small>{category.rangeLabel}</small>
                        </article>
                      ))}
                    </div>

                    <div className="ex-location-grid">
                      {trifectaTrend.turbulence.highestPayoutRace ? (
                        <article className="ex-turbulence-highlight">
                          <div className="ex-eyebrow">HIGHEST OFFICIAL PAYOUT</div>
                          <h3>
                            {trifectaTrend.turbulence.highestPayoutRace.date}{" "}
                            {trifectaTrend.turbulence.highestPayoutRace.venueName}{" "}
                            {trifectaTrend.turbulence.highestPayoutRace.raceNumber}R
                          </h3>
                          <strong>{formatPayoutYen(trifectaTrend.turbulence.highestPayoutRace.payoutYen)}</strong>
                          <p>
                            3連単 {trifectaTrend.turbulence.highestPayoutRace.combination}
                            {trifectaTrend.turbulence.highestPayoutRace.grade
                              ? ` / ${trifectaTrend.turbulence.highestPayoutRace.grade}`
                              : ""}
                          </p>
                        </article>
                      ) : null}
                      <article className="ex-location-card">
                        <div className="ex-location-head">
                          <h3>荒れ指数 excluded理由</h3>
                          <span className="ex-location-status is-warning">EXCLUDED</span>
                        </div>
                        {trifectaTrend.turbulence.exclusionReasons.length ? (
                          <ul className="ex-trend-reasons">
                            {trifectaTrend.turbulence.exclusionReasons.map((reason) => (
                              <li key={reason.key}>{reason.label}: {reason.count.toLocaleString("ja-JP")}R</li>
                            ))}
                          </ul>
                        ) : (
                          <div className="ex-muted">除外なし</div>
                        )}
                      </article>
                    </div>

                    <TurbulenceBreakdownTable
                      title="R別 荒れ傾向"
                      rows={trifectaTrend.turbulence.byRaceNumber}
                      emptyText="R別に安全集計できるofficial payoutはありません。"
                    />
                    <TurbulenceBreakdownTable
                      title="会場別 荒れ傾向"
                      rows={trifectaTrend.turbulence.byVenue}
                      emptyText="会場別に安全集計できるofficial payoutはありません。"
                    />

                    <article className="ex-turbulence-breakdown">
                      <div className="ex-location-head">
                        <h3>A級 / S級 / Gレース readiness</h3>
                        <span className="ex-location-status is-partial">PARTIAL</span>
                      </div>
                      <div className="ex-trend-status-row">
                        {trifectaTrend.turbulence.classGradeReadiness.map((item) => (
                          <span
                            className={`ex-trend-status-pill is-${item.status}`}
                            key={item.key}
                            title={item.note}
                          >
                            {item.label}: {item.status}
                          </span>
                        ))}
                      </div>
                      <div className="ex-muted" style={{ marginTop: 10 }}>
                        A級 / S級はraceClass未保存のため推測分類しません。Gレースはvenue gradeが明示されたraceだけを対象にします。
                      </div>
                    </article>
                    <TurbulenceBreakdownTable
                      title="Gレース別 荒れ傾向"
                      rows={trifectaTrend.turbulence.byGrade}
                      emptyText="gradeが明示されたeligible Gレースはありません。"
                    />
                  </>
                ) : (
                  <EmptyState text="No eligible official payout data" />
                )}
              </>
            ) : null}
          </div>
          ) : null}

          {activeSectionTab === "chain" ? (
          <div className="ex-subsection" data-testid="result-trend-lab-chain-v1">
            <SectionTitle
              eyebrow="KURARI EX RACE CHAIN v1"
              title="レース連鎖分析 v1"
              lead="同日・同会場でraceNumberが1つ違い、前後ともeligibleなofficial 3連単実払戻金を持つpairだけを集計します。"
            />
            {trifectaTrendStatus === "loading" ? <EmptyState text="official transition pairを確認しています。" /> : null}
            {trifectaTrendStatus === "error" ? (
              <EmptyState text="No eligible official transition data / official sourceを取得できませんでした。" />
            ) : null}
            {trifectaTrend ? (
              <>
                <div className="ex-health-grid">
                  <MetricCard label="SOURCE" value="official result only" note={trifectaTrend.sourceName} />
                  <MetricCard
                    label="統合・連続R PAIR対象"
                    value={`${trifectaTrend.chain.eligiblePairCount.toLocaleString("ja-JP")} pairs`}
                    note={`60日historical + 最新current / candidate ${trifectaTrend.chain.transitionCandidateCount.toLocaleString("ja-JP")} pairs`}
                  />
                  <MetricCard
                    label="EXCLUDED PAIRS"
                    value={trifectaTrend.chain.excludedPairCount.toLocaleString("ja-JP")}
                    note="strict pair eligibilityで除外"
                    warning={trifectaTrend.chain.excludedPairCount > 0}
                  />
                  <MetricCard
                    label="SAMPLE STATUS"
                    value={trifectaTrend.chain.sampleLabel}
                    note={trifectaTrend.chain.sampleStatus === "low-sample"
                      ? "参考のみ"
                      : trifectaTrend.chain.sampleStatus === "caution"
                        ? "傾向注意"
                        : "予想の主根拠ではなく補助"}
                    warning={trifectaTrend.chain.sampleStatus !== "usable"}
                  />
                </div>

                {trifectaTrend.chain.status === "ready" ? (
                  <>
                    <div className="ex-chain-type-grid">
                      {trifectaTrend.chain.chainTypes.map((item) => (
                        <article className="ex-chain-type-card" key={item.key}>
                          <strong>{item.label}</strong>
                          <b>{item.count.toLocaleString("ja-JP")}組</b>
                          <span>{item.rate.toFixed(1)}%</span>
                        </article>
                      ))}
                    </div>

                    <div className="ex-health-grid">
                      <MetricCard
                        label="AFTER UPSET SAMPLE"
                        value={`${trifectaTrend.chain.afterUpset.sampleSize.toLocaleString("ja-JP")}組`}
                        note="前Rが荒れ以上"
                        warning={trifectaTrend.chain.afterUpset.sampleSize < 30}
                      />
                      <MetricCard
                        label="FAVORITE RETURN"
                        value={`${trifectaTrend.chain.afterUpset.favoriteReturnRate.toFixed(1)}%`}
                        note={`${trifectaTrend.chain.afterUpset.favoriteReturnCount.toLocaleString("ja-JP")} / ${trifectaTrend.chain.afterUpset.sampleSize.toLocaleString("ja-JP")}組`}
                        warning={trifectaTrend.chain.afterUpset.sampleSize < 30}
                      />
                      <MetricCard
                        label="UPSET CHAIN"
                        value={`${trifectaTrend.chain.afterUpset.upsetChainRate.toFixed(1)}%`}
                        note={`${trifectaTrend.chain.afterUpset.upsetChainCount.toLocaleString("ja-JP")} / ${trifectaTrend.chain.afterUpset.sampleSize.toLocaleString("ja-JP")}組`}
                        warning={trifectaTrend.chain.afterUpset.sampleSize < 30}
                      />
                      <MetricCard label="PAIR RULE" value="R → R+1" note="同日 / 同会場 / 一意race key" />
                    </div>

                    <div className="ex-location-grid">
                      <article className="ex-location-card">
                        <div className="ex-location-head">
                          <h3>連鎖 excluded理由</h3>
                          <span className="ex-location-status is-warning">EXCLUDED</span>
                        </div>
                        {trifectaTrend.chain.exclusionReasons.length ? (
                          <ul className="ex-trend-reasons">
                            {trifectaTrend.chain.exclusionReasons.map((reason) => (
                              <li key={reason.key}>{reason.label}: {reason.count.toLocaleString("ja-JP")}組</li>
                            ))}
                          </ul>
                        ) : (
                          <div className="ex-muted">除外なし</div>
                        )}
                      </article>
                      <article className="ex-location-card">
                        <div className="ex-location-head">
                          <h3>SAFETY CONTRACT</h3>
                          <span className="ex-location-status is-ready">STRICT</span>
                        </div>
                        <div className="ex-overview-status">
                          <span className="ex-trend-status-pill is-ready">date一致</span>
                          <span className="ex-trend-status-pill is-ready">venueCode一致</span>
                          <span className="ex-trend-status-pill is-ready">confirmed</span>
                          <span className="ex-trend-status-pill is-ready">実払戻金</span>
                          <span className="ex-trend-status-pill is-ready">fakeなし</span>
                        </div>
                      </article>
                    </div>

                    <article className="ex-turbulence-breakdown">
                      <div className="ex-location-head">
                        <h3>category transition matrix</h3>
                        <span className="ex-location-status is-partial">COUNT</span>
                      </div>
                      <div className="ex-table-wrap">
                        <table className="ex-data-table ex-chain-matrix">
                          <thead>
                            <tr>
                              <th>前R ＼ 次R</th>
                              {trifectaTrend.turbulence.categories.map((category) => (
                                <th key={category.key}>{category.label}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {trifectaTrend.turbulence.categories.map((previous) => (
                              <tr key={previous.key}>
                                <td><strong>{previous.label}</strong></td>
                                {trifectaTrend.turbulence.categories.map((next) => {
                                  const cell = trifectaTrend.chain.transitionMatrix.find(
                                    (item) => item.previousCategory === previous.key && item.nextCategory === next.key,
                                  );
                                  return <td key={`${previous.key}-${next.key}`}>{cell?.count ?? 0}</td>;
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </article>

                    <div className="ex-subsection">
                      <div className="ex-eyebrow">REPRESENTATIVE EXAMPLES / MAX 5</div>
                      <div className="ex-chain-examples">
                        {trifectaTrend.chain.examples.map((example) => (
                          <article
                            className="ex-chain-example"
                            key={`${example.date}-${example.venueCode}-${example.previousRaceNumber}`}
                          >
                            <div className="ex-trend-status-pill is-partial">{example.chainTypeLabel}</div>
                            <h3>{example.date} {example.venueName} {example.previousRaceNumber}R → {example.nextRaceNumber}R</h3>
                            <p>
                              {example.previousCategoryLabel} {formatPayoutYen(example.previousPayoutYen)}
                              {" → "}
                              {example.nextCategoryLabel} {formatPayoutYen(example.nextPayoutYen)}
                            </p>
                          </article>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <EmptyState text="No eligible official transition data" />
                )}
              </>
            ) : null}
          </div>
          ) : null}

          {activeSectionTab === "weather" ? (
          <div className="ex-subsection" data-testid="result-trend-lab-weather-v1">
            <SectionTitle
              eyebrow="WEATHER / WIND × DECISION METHOD v1"
              title="風速×決まり手分析 v1"
              lead="KEIRIN.JP official result内で、確定レースの風速と決まり手を同じrace key・provenanceで確認できたレースだけを動的集計します。"
            />
            <div className="ex-overview-status">
              <span className="ex-trend-status-pill is-ready">official result only</span>
              <span className="ex-trend-status-pill is-ready">fake wind prohibited</span>
              <span className="ex-trend-status-pill is-ready">fake decision prohibited</span>
              <span className="ex-trend-status-pill is-caution">LOW SAMPLE</span>
            </div>
            {trifectaTrendStatus === "loading" ? <EmptyState text="official wind / decision methodを確認しています。" /> : null}
            {trifectaTrendStatus === "error" ? (
              <EmptyState text="No eligible official weather result data / official sourceを取得できませんでした。" />
            ) : null}
            {trifectaTrend ? (
              <>
                <div className="ex-kpi-grid">
                  <MetricCard
                    label="統合集計対象"
                    value={`${trifectaTrend.weather.eligibleRaceCount.toLocaleString("ja-JP")}R`}
                    note="60日historical trend対象 + 最新current"
                  />
                  <MetricCard
                    label="EXCLUDED RACES"
                    value={trifectaTrend.weather.excludedRaceCount.toLocaleString("ja-JP")}
                    note="strict eligibilityで除外"
                    warning={trifectaTrend.weather.excludedRaceCount > 0}
                  />
                  <MetricCard
                    label="SAMPLE STATUS"
                    value={trifectaTrend.weather.sampleLabel}
                    note={trifectaTrend.weather.sampleStatus === "low-sample" ? "参考のみ" : "傾向注意 / 主根拠にしない"}
                    warning={trifectaTrend.weather.sampleStatus !== "usable"}
                  />
                  <MetricCard
                    label="MOST COMMON WIND"
                    value={trifectaTrend.weather.mostCommonWindBucket?.label ?? "--"}
                    note={trifectaTrend.weather.mostCommonWindBucket
                      ? `${trifectaTrend.weather.mostCommonWindBucket.count.toLocaleString("ja-JP")}R`
                      : "unavailable"}
                  />
                  <MetricCard
                    label="MOST COMMON DECISION"
                    value={trifectaTrend.weather.mostCommonDecisionMethod?.label ?? "--"}
                    note={trifectaTrend.weather.mostCommonDecisionMethod
                      ? `${trifectaTrend.weather.mostCommonDecisionMethod.count.toLocaleString("ja-JP")}R`
                      : "unavailable"}
                  />
                </div>

                {trifectaTrend.weather.status === "ready" ? (
                  <>
                    <div>
                      <SectionTitle eyebrow="WIND BUCKETS" title="風速bucket別" />
                      <div className="ex-weather-bucket-grid">
                        {trifectaTrend.weather.windBuckets.map((bucket) => (
                          <article className="ex-weather-bucket-card" key={bucket.key}>
                            <strong>{bucket.label}</strong>
                            <b>{bucket.count.toLocaleString("ja-JP")}R</b>
                            <span>{bucket.rate.toFixed(1)}%</span>
                          </article>
                        ))}
                      </div>
                    </div>

                    <div>
                      <SectionTitle eyebrow="WIND × DECISION MATRIX" title="風速bucket × 決まり手" />
                      <div className="ex-table-wrap">
                        <table className="ex-data-table">
                          <thead>
                            <tr>
                              <th>風速bucket</th>
                              {trifectaTrend.weather.decisionMethods.map((method) => <th key={method.key}>{method.label}</th>)}
                              <th>bucket計</th>
                            </tr>
                          </thead>
                          <tbody>
                            {trifectaTrend.weather.windBuckets.map((bucket) => (
                              <tr key={bucket.key}>
                                <td><strong>{bucket.label}</strong></td>
                                {trifectaTrend.weather.decisionMethods.map((method) => {
                                  const cell = trifectaTrend.weather.matrix.find(
                                    (row) => row.windBucket === bucket.key && row.decisionMethod === method.key,
                                  );
                                  return (
                                    <td key={method.key}>
                                      {cell?.count.toLocaleString("ja-JP") ?? "0"}R
                                      <div className="ex-muted">{(cell?.rateWithinBucket ?? 0).toFixed(1)}%</div>
                                    </td>
                                  );
                                })}
                                <td>{bucket.count.toLocaleString("ja-JP")}R</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div>
                      <SectionTitle eyebrow="DECISION METHOD TOTAL" title="決まり手別の全体傾向" />
                      <div className="ex-weather-bucket-grid">
                        {trifectaTrend.weather.decisionMethods.map((method) => (
                          <article className="ex-weather-bucket-card" key={method.key}>
                            <strong>{method.label}</strong>
                            <b>{method.count.toLocaleString("ja-JP")}R</b>
                            <span>{method.rate.toFixed(1)}%</span>
                          </article>
                        ))}
                      </div>
                    </div>

                    <div>
                      <SectionTitle eyebrow="BY VENUE" title="会場別傾向" lead="各会場もLOW SAMPLEを前提に、保存済みeligible raceだけを表示します。" />
                      <div className="ex-weather-venue-grid">
                        {trifectaTrend.weather.byVenue.map((venue) => (
                          <article className="ex-weather-venue-card" key={venue.venueCode}>
                            <div className="ex-location-head">
                              <h3>{venue.venueName}</h3>
                              <span className={`ex-location-status is-${venue.sampleStatus === "usable" ? "ready" : "warning"}`}>
                                {venue.sampleSize.toLocaleString("ja-JP")}R
                              </span>
                            </div>
                            <p>最多風速: {venue.leadingWindBucketLabel}</p>
                            <p>最多決まり手: {venue.leadingDecisionMethodLabel}</p>
                            <div className="ex-muted">{venue.sampleLabel}</div>
                          </article>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <EmptyState text="No eligible official wind / decision method data" />
                )}

                <div className="ex-location-grid">
                  <article className="ex-location-card">
                    <div className="ex-location-head">
                      <h3>除外理由</h3>
                      <span className="ex-location-status is-warning">EXCLUDED</span>
                    </div>
                    {trifectaTrend.weather.exclusionReasons.length ? (
                      <ul className="ex-trend-reasons">
                        {trifectaTrend.weather.exclusionReasons.map((reason) => (
                          <li key={reason.key}>{reason.label}: {reason.count.toLocaleString("ja-JP")}R</li>
                        ))}
                      </ul>
                    ) : <div className="ex-muted">除外なし</div>}
                  </article>
                  <article className="ex-location-card">
                    <div className="ex-location-head">
                      <h3>代表例</h3>
                      <span className="ex-location-status is-partial">MAX 5</span>
                    </div>
                    <ul className="ex-weather-example-list">
                      {trifectaTrend.weather.examples.map((example) => (
                        <li key={example.raceKey}>
                          {example.date} {example.venueName} {example.raceNumber}R /
                          {" "}{example.windSpeedMps}m/s（{example.windBucketLabel}）/ {example.decisionMethodLabel}
                        </li>
                      ))}
                    </ul>
                  </article>
                </div>
                <div className="ex-empty">
                  <strong>級班別: {trifectaTrend.weather.classReadiness.status}</strong><br />
                  {trifectaTrend.weather.classReadiness.note}。partial / future-accumulationとして扱います。
                </div>
              </>
            ) : null}
          </div>
          ) : null}

          {activeSectionTab === "venue-bias" ? (
          <div className="ex-subsection" data-testid="result-trend-lab-venue-bias-v1">
            <SectionTitle
              eyebrow="VENUE BIAS / OFFICIAL RESULT v1"
              title="会場クセ分析 v1"
              lead="一意race keyを持つconfirmed official resultだけから、会場ごとの枠・決まり手・3連単配当傾向を動的集計します。"
            />
            <div className="ex-overview-status">
              <span className="ex-trend-status-pill is-ready">official result only</span>
              <span className="ex-trend-status-pill is-ready">confirmed only</span>
              <span className="ex-trend-status-pill is-ready">fake prohibited</span>
              <span className="ex-trend-status-pill is-caution">LOW SAMPLE</span>
              <span className="ex-trend-status-pill is-partial">definitions fixed v1</span>
            </div>
            {trifectaTrendStatus === "loading" ? <EmptyState text="official venue resultを確認しています。" /> : null}
            {trifectaTrendStatus === "error" ? (
              <EmptyState text="No eligible official venue result data / official sourceを取得できませんでした。" />
            ) : null}
            {trifectaTrend ? (
              <>
                <div className="ex-kpi-grid">
                  <MetricCard
                    label="統合集計対象"
                    value={`${trifectaTrend.venueBias.eligibleRaceCount.toLocaleString("ja-JP")}R`}
                    note="60日historical trend対象 + 最新current"
                  />
                  <MetricCard
                    label="EXCLUDED RACES"
                    value={trifectaTrend.venueBias.excludedRaceCount.toLocaleString("ja-JP")}
                    note="strict eligibilityで除外"
                    warning={trifectaTrend.venueBias.excludedRaceCount > 0}
                  />
                  <MetricCard
                    label="SAMPLE STATUS"
                    value={trifectaTrend.venueBias.sampleLabel}
                    note="LOW SAMPLEは主根拠にしない"
                    warning={trifectaTrend.venueBias.sampleStatus !== "usable"}
                  />
                  <MetricCard
                    label="VENUE COUNT"
                    value={trifectaTrend.venueBias.venueCount.toLocaleString("ja-JP")}
                    note="eligible venue"
                  />
                  <MetricCard
                    label="HIGHEST OUTSIDE"
                    value={trifectaTrend.venueBias.highestOutsideInvolvementVenue?.venueName ?? "--"}
                    note={trifectaTrend.venueBias.highestOutsideInvolvementVenue
                      ? `${trifectaTrend.venueBias.highestOutsideInvolvementVenue.rate.toFixed(1)}%`
                      : "unavailable"}
                    warning={trifectaTrend.venueBias.byVenue.every((venue) => venue.sampleStatus !== "usable")}
                  />
                  <MetricCard
                    label="HIGHEST TRIFECTA AVG"
                    value={trifectaTrend.venueBias.highestAveragePayoutVenue?.venueName ?? "--"}
                    note={formatPayoutYen(trifectaTrend.venueBias.highestAveragePayoutVenue?.averagePayoutYen ?? null)}
                    warning={trifectaTrend.venueBias.byVenue.every((venue) => venue.sampleStatus !== "usable")}
                  />
                </div>

                {trifectaTrend.venueBias.status === "ready" ? (
                  <>
                    <div>
                      <SectionTitle eyebrow="OVERALL TREND" title="全体傾向" />
                      <div className="ex-health-grid">
                        <MetricCard label="内枠決着率" value={`${trifectaTrend.venueBias.overall.innerFrameRate.toFixed(1)}%`} note="1〜3着がすべて1〜3番車" />
                        <MetricCard label="外枠絡み率" value={`${trifectaTrend.venueBias.overall.outsideInvolvementRate.toFixed(1)}%`} note="1〜3着に5番車以上" />
                        <MetricCard
                          label="1番車飛び率"
                          value={trifectaTrend.venueBias.overall.oneCarEligibleCount
                            ? `${trifectaTrend.venueBias.overall.oneCarOutRate.toFixed(1)}%`
                            : "--"}
                          note={`1番車確認 ${trifectaTrend.venueBias.overall.oneCarEligibleCount.toLocaleString("ja-JP")}R`}
                          warning={!trifectaTrend.venueBias.overall.oneCarEligibleCount}
                        />
                        <MetricCard
                          label="逃げ決着率"
                          value={trifectaTrend.venueBias.overall.decisionEligibleCount
                            ? `${trifectaTrend.venueBias.overall.escapeRate.toFixed(1)}%`
                            : "--"}
                          note={`決まり手取得 ${trifectaTrend.venueBias.overall.decisionEligibleCount.toLocaleString("ja-JP")}R`}
                          warning={!trifectaTrend.venueBias.overall.decisionEligibleCount}
                        />
                        <MetricCard
                          label="捲り決着率"
                          value={trifectaTrend.venueBias.overall.decisionEligibleCount
                            ? `${trifectaTrend.venueBias.overall.sprintRate.toFixed(1)}%`
                            : "--"}
                          note={`決まり手取得 ${trifectaTrend.venueBias.overall.decisionEligibleCount.toLocaleString("ja-JP")}R`}
                          warning={!trifectaTrend.venueBias.overall.decisionEligibleCount}
                        />
                        <MetricCard label="平均3連単配当" value={formatPayoutYen(trifectaTrend.venueBias.overall.averageTrifectaPayoutYen)} note="eligible official payout平均" />
                        <MetricCard label="万車券率" value={`${trifectaTrend.venueBias.overall.highPayoutRate.toFixed(1)}%`} note="3連単10,000円以上" />
                      </div>
                    </div>

                    <div>
                      <SectionTitle
                        eyebrow="BY VENUE"
                        title="会場別傾向"
                        lead="特徴ラベルは固定閾値から算出し、LOW SAMPLE会場では「参考」として表示します。"
                      />
                      <div className="ex-venue-bias-grid">
                        {trifectaTrend.venueBias.byVenue.map((venue) => (
                          <article className="ex-venue-bias-card" key={venue.venueCode}>
                            <div className="ex-venue-bias-card-head">
                              <div>
                                <div className="ex-eyebrow">{venue.venueCode || "VENUE"}</div>
                                <h3>{venue.venueName}</h3>
                              </div>
                              <span className={`ex-location-status is-${venue.sampleStatus === "usable" ? "ready" : "warning"}`}>
                                {venue.sampleSize.toLocaleString("ja-JP")}R
                              </span>
                            </div>
                            <div className="ex-muted">{venue.sampleLabel}</div>
                            <div className="ex-venue-bias-metrics">
                              <div>内枠決着率<strong>{venue.innerFrameRate.toFixed(1)}%</strong></div>
                              <div>外枠絡み率<strong>{venue.outsideInvolvementRate.toFixed(1)}%</strong></div>
                              <div>1番車飛び率<strong>{venue.oneCarEligibleCount ? `${venue.oneCarOutRate.toFixed(1)}%` : "--"}</strong></div>
                              <div>逃げ決着率<strong>{venue.decisionEligibleCount ? `${venue.escapeRate.toFixed(1)}%` : "--"}</strong></div>
                              <div>捲り決着率<strong>{venue.decisionEligibleCount ? `${venue.sprintRate.toFixed(1)}%` : "--"}</strong></div>
                              <div>平均3連単<strong>{formatPayoutYen(venue.averageTrifectaPayoutYen)}</strong></div>
                              <div>万車券率<strong>{venue.highPayoutRate.toFixed(1)}%</strong></div>
                              <div>決まり手分母<strong>{venue.decisionEligibleCount.toLocaleString("ja-JP")}R</strong></div>
                            </div>
                            <div className="ex-venue-bias-tags">
                              {venue.featureLabels.map((label) => <span key={label}>{label}</span>)}
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>

                    <div>
                      <SectionTitle
                        eyebrow="VENUE BIAS SEGMENTS v2"
                        title="条件別クセ"
                        lead="trend対象だけを使い、会場 × 車数 / 会場 × R番号帯 / source-backedグレードで切った補助指標です。strong >= 80R、medium >= 30R、weak < 30R。"
                      />
                      <div className="ex-note-grid">
                        <MetricCard
                          label="会場 × 車数"
                          value={trifectaTrend.venueBias.byVenueCarCount.length.toLocaleString("ja-JP")}
                          note="carCountがsourceにあるレースのみ"
                          warning={!trifectaTrend.venueBias.byVenueCarCount.length}
                        />
                        <MetricCard
                          label="会場 × R番号帯"
                          value={trifectaTrend.venueBias.byVenueRaceBand.length.toLocaleString("ja-JP")}
                          note="early 1〜4R / middle 5〜8R / late 9R以降"
                          warning={!trifectaTrend.venueBias.byVenueRaceBand.length}
                        />
                        <MetricCard
                          label="会場 × グレード"
                          value={trifectaTrend.venueBias.byVenueGrade.length.toLocaleString("ja-JP")}
                          note="gradeがsource-backedで取れる場合のみ"
                          warning={!trifectaTrend.venueBias.byVenueGrade.length}
                        />
                      </div>

                      <div className="ex-location-grid">
                        <article className="ex-location-card">
                          <div className="ex-location-head">
                            <h3>会場 × 車数</h3>
                            <span className="ex-location-status is-partial">TOP 6</span>
                          </div>
                          {trifectaTrend.venueBias.byVenueCarCount.length ? (
                            <div className="ex-venue-bias-grid">
                              {trifectaTrend.venueBias.byVenueCarCount.slice(0, 6).map((segment) => (
                                <VenueBiasSegmentCard key={segment.key} segment={segment} />
                              ))}
                            </div>
                          ) : <div className="ex-muted">source-backed carCount segmentなし</div>}
                        </article>

                        <article className="ex-location-card">
                          <div className="ex-location-head">
                            <h3>会場 × R番号帯</h3>
                            <span className="ex-location-status is-partial">TOP 6</span>
                          </div>
                          {trifectaTrend.venueBias.byVenueRaceBand.length ? (
                            <div className="ex-venue-bias-grid">
                              {trifectaTrend.venueBias.byVenueRaceBand.slice(0, 6).map((segment) => (
                                <VenueBiasSegmentCard key={segment.key} segment={segment} />
                              ))}
                            </div>
                          ) : <div className="ex-muted">race band segmentなし</div>}
                        </article>

                        <article className="ex-location-card">
                          <div className="ex-location-head">
                            <h3>会場 × グレード</h3>
                            <span className="ex-location-status is-partial">TOP 6</span>
                          </div>
                          {trifectaTrend.venueBias.byVenueGrade.length ? (
                            <div className="ex-venue-bias-grid">
                              {trifectaTrend.venueBias.byVenueGrade.slice(0, 6).map((segment) => (
                                <VenueBiasSegmentCard key={segment.key} segment={segment} />
                              ))}
                            </div>
                          ) : <div className="ex-muted">source-backed grade segmentなし</div>}
                        </article>
                      </div>
                    </div>
                  </>
                ) : <EmptyState text="No eligible official venue bias data" />}

                <div className="ex-location-grid">
                  <article className="ex-location-card">
                    <div className="ex-location-head">
                      <h3>除外理由</h3>
                      <span className="ex-location-status is-warning">EXCLUDED</span>
                    </div>
                    {trifectaTrend.venueBias.exclusionReasons.length ? (
                      <ul className="ex-trend-reasons">
                        {trifectaTrend.venueBias.exclusionReasons.map((reason) => (
                          <li key={reason.key}>{reason.label}: {reason.count.toLocaleString("ja-JP")}R</li>
                        ))}
                      </ul>
                    ) : <div className="ex-muted">除外なし</div>}
                    {trifectaTrend.venueBias.decisionExclusionReasons.length ? (
                      <>
                        <h4>決まり手系のみ除外</h4>
                        <ul className="ex-trend-reasons">
                          {trifectaTrend.venueBias.decisionExclusionReasons.map((reason) => (
                            <li key={reason.key}>{reason.label}: {reason.count.toLocaleString("ja-JP")}R</li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                  </article>
                  <article className="ex-location-card">
                    <div className="ex-location-head">
                      <h3>代表例</h3>
                      <span className="ex-location-status is-partial">MAX 5</span>
                    </div>
                    <ul className="ex-weather-example-list">
                      {trifectaTrend.venueBias.examples.map((example) => (
                        <li key={example.raceKey}>
                          {example.date} {example.venueName} {example.raceNumber}R /
                          {" "}3連単 {example.combination} / {formatPayoutYen(example.payoutYen)} /
                          {" "}{example.decisionMethodLabel} / {example.featureReason}
                        </li>
                      ))}
                    </ul>
                  </article>
                </div>

                <div>
                  <SectionTitle eyebrow="DEFINITIONS FIXED v1" title="定義メモ" />
                  <div className="ex-venue-definition-grid">
                    <article><h4>内枠決着率</h4><p>1〜3着がすべて1〜3番車のrace割合。4番車以上が1台でも入れば対象外。</p></article>
                    <article><h4>外枠絡み率</h4><p>1〜3着のどこかに5番車以上が入るrace割合。4番車は中枠。</p></article>
                    <article><h4>1番車飛び率</h4><p>1番車出走をresult行で確認でき、3連単1〜3着に1番車を含まない割合。欠車の厳密化はfuture refinement。</p></article>
                    <article><h4>逃げ / 捲り決着率</h4><p>明確に正規化できる決まり手取得raceだけを分母にする。着順から推測しない。</p></article>
                    <article><h4>万車券率</h4><p>eligibleな3連単払戻金が10,000円以上のrace割合。</p></article>
                    <article><h4>特徴ラベル閾値</h4><p>内枠35%以上、外枠70%以上、1番車飛び60%以上、逃げ25%以上、捲り35%以上、平均2万円以上または万車券25%以上。</p></article>
                  </div>
                </div>
                <div className="ex-empty">
                  <strong>{trifectaTrend.venueBias.refinement.status} / future refinement</strong><br />
                  {trifectaTrend.venueBias.refinement.note}。
                </div>
              </>
            ) : null}
          </div>
          ) : null}

          {activeSectionTab === "today-flow" ? (
          <div className="ex-subsection" data-testid="result-trend-lab-today-flow-v1">
            <SectionTitle
              eyebrow="LATEST OFFICIAL RESULT / TODAY FLOW METER v1"
              title="今日の流れメーター v1"
              lead="official confirmed resultの最新日だけを対象に、配当カテゴリ・枠絡み・連続R transitionから結果の流れを可視化します。未来Rは推測しません。"
            />
            <div className="ex-overview-status">
              <span className="ex-trend-status-pill is-ready">official result only</span>
              <span className="ex-trend-status-pill is-ready">confirmed only</span>
              <span className="ex-trend-status-pill is-ready">fake prohibited</span>
              <span className={`ex-trend-status-pill is-${trifectaTrend?.todayFlow.isToday ? "ready" : "partial"}`}>
                今日の流れ: 最新日currentのみで集計
              </span>
              <span className="ex-trend-status-pill is-caution">LOW SAMPLE</span>
            </div>
            {trifectaTrendStatus === "loading" ? <EmptyState text="latest official result dateを確認しています。" /> : null}
            {trifectaTrendStatus === "error" ? (
              <EmptyState text="No eligible latest official result data / official sourceを取得できませんでした。" />
            ) : null}
            {trifectaTrend ? (
              <>
                <div className="ex-kpi-grid">
                  <MetricCard
                    label="最新 CURRENT 対象日"
                    value={trifectaTrend.todayFlow.targetDate || "--"}
                    note={`${trifectaTrend.todayFlow.dateBasisLabel} / historical全期間とは分離`}
                    warning={!trifectaTrend.todayFlow.isToday}
                  />
                  <MetricCard
                    label="最新 CURRENT 集計対象"
                    value={`${trifectaTrend.todayFlow.eligibleRaceCount.toLocaleString("ja-JP")}R`}
                    note={`最新日currentのみ / 対象${trifectaTrend.todayFlow.totalRaceCount.toLocaleString("ja-JP")}R`}
                  />
                  <MetricCard
                    label="EXCLUDED RACES"
                    value={trifectaTrend.todayFlow.excludedRaceCount.toLocaleString("ja-JP")}
                    note="strict eligibilityで除外"
                    warning={trifectaTrend.todayFlow.excludedRaceCount > 0}
                  />
                  <MetricCard
                    label="VENUE COUNT"
                    value={trifectaTrend.todayFlow.venueCount.toLocaleString("ja-JP")}
                    note="latest official date"
                  />
                  <MetricCard
                    label="DOMINANT FLOW"
                    value={trifectaTrend.todayFlow.dominantFlowLabel}
                    note="公式結果からの補助傾向"
                    warning={trifectaTrend.todayFlow.sampleStatus !== "usable"}
                  />
                  <MetricCard
                    label="SAMPLE STATUS"
                    value={trifectaTrend.todayFlow.sampleLabel}
                    note="LOW SAMPLEは断定しない"
                    warning={trifectaTrend.todayFlow.sampleStatus !== "usable"}
                  />
                </div>

                {trifectaTrend.todayFlow.cautionLabels.length ? (
                  <div className="ex-overview-status">
                    {trifectaTrend.todayFlow.cautionLabels.map((label) => (
                      <span className="ex-trend-status-pill is-caution" key={label}>{label}</span>
                    ))}
                  </div>
                ) : null}

                {trifectaTrend.todayFlow.status === "ready" ? (
                  <>
                    <div>
                      <SectionTitle eyebrow="OVERALL FLOW METER" title="最新日 全体フロー" />
                      <div className="ex-today-flow-meter">
                        <article><span>堅め率</span><strong>{trifectaTrend.todayFlow.overall.firmRate.toFixed(1)}%</strong><small>3連単1〜2,999円</small></article>
                        <article><span>中穴率</span><strong>{trifectaTrend.todayFlow.overall.midUpsetRate.toFixed(1)}%</strong><small>3,000〜9,999円</small></article>
                        <article><span>荒れ以上率</span><strong>{trifectaTrend.todayFlow.overall.upsetOrAboveRate.toFixed(1)}%</strong><small>10,000円以上</small></article>
                        <article><span>外枠絡み率</span><strong>{trifectaTrend.todayFlow.overall.outsideInvolvementRate.toFixed(1)}%</strong><small>1〜3着に5番車以上</small></article>
                        <article><span>1番車飛び率</span><strong>{trifectaTrend.todayFlow.overall.oneCarOutRate.toFixed(1)}%</strong><small>3連単に1番車なし</small></article>
                        <article><span>平均3連単配当</span><strong>{formatPayoutYen(trifectaTrend.todayFlow.overall.averageTrifectaPayoutYen)}</strong><small>eligible平均</small></article>
                        <article><span>中央値3連単配当</span><strong>{formatPayoutYen(trifectaTrend.todayFlow.overall.medianTrifectaPayoutYen)}</strong><small>eligible中央値</small></article>
                        <article><span>万車券率</span><strong>{trifectaTrend.todayFlow.overall.highPayoutRate.toFixed(1)}%</strong><small>3連単10,000円以上</small></article>
                      </div>
                    </div>

                    <div>
                      <SectionTitle
                        eyebrow="VENUE FLOW"
                        title="会場別 最新日の流れ"
                        lead="各会場の最新confirmed Rと、eligibleな直近最大5RをraceNumber順で表示します。"
                      />
                      <div className="ex-today-flow-grid">
                        {trifectaTrend.todayFlow.byVenue.map((venue) => (
                          <article className="ex-today-flow-card" key={venue.venueCode || venue.venueName}>
                            <div className="ex-venue-bias-card-head">
                              <div>
                                <div className="ex-eyebrow">{venue.venueCode || "VENUE"}</div>
                                <h3>{venue.venueName}</h3>
                              </div>
                              <span className="ex-location-status is-warning">{venue.sampleSize.toLocaleString("ja-JP")}R</span>
                            </div>
                            <div className="ex-venue-bias-tags">
                              <span>{venue.currentFlowLabel}</span>
                              <span>{venue.sampleLabel}</span>
                              <span>latest {venue.latestConfirmedRaceNumber == null ? "--" : `${venue.latestConfirmedRaceNumber}R`}</span>
                            </div>
                            <div className="ex-venue-bias-metrics">
                              <div>堅め率<strong>{venue.firmRate.toFixed(1)}%</strong></div>
                              <div>中穴率<strong>{venue.midUpsetRate.toFixed(1)}%</strong></div>
                              <div>荒れ以上率<strong>{venue.upsetOrAboveRate.toFixed(1)}%</strong></div>
                              <div>外枠絡み率<strong>{venue.outsideInvolvementRate.toFixed(1)}%</strong></div>
                              <div>1番車飛び率<strong>{venue.oneCarOutRate.toFixed(1)}%</strong></div>
                              <div>平均3連単<strong>{formatPayoutYen(venue.averageTrifectaPayoutYen)}</strong></div>
                              <div>万車券率<strong>{venue.highPayoutRate.toFixed(1)}%</strong></div>
                              <div>eligible<strong>{venue.sampleSize.toLocaleString("ja-JP")}R</strong></div>
                            </div>
                            <div className="ex-today-flow-recent">
                              {venue.recentRaces.map((race) => (
                                <span key={race.raceNumber}>
                                  {race.raceNumber}R {race.categoryLabel}<br />
                                  {race.combination} / {formatPayoutYen(race.payoutYen)}
                                </span>
                              ))}
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>

                    <div>
                      <SectionTitle eyebrow="TRANSITION HINTS" title="連続R transition" lead="同日同会場でraceNumberが連続し、前後ともeligibleなpairだけを集計します。" />
                      <div className="ex-today-flow-hints">
                        {trifectaTrend.todayFlow.transitionHints.map((hint) => (
                          <article key={hint.key}>
                            <span className="ex-eyebrow">{hint.label}</span>
                            <strong>{hint.count.toLocaleString("ja-JP")}組</strong>
                          </article>
                        ))}
                      </div>
                    </div>
                  </>
                ) : <EmptyState text="No eligible latest official flow data" />}

                <div className="ex-location-grid">
                  <article className="ex-location-card">
                    <div className="ex-location-head">
                      <h3>除外理由</h3>
                      <span className="ex-location-status is-warning">EXCLUDED</span>
                    </div>
                    {trifectaTrend.todayFlow.exclusionReasons.length ? (
                      <ul className="ex-trend-reasons">
                        {trifectaTrend.todayFlow.exclusionReasons.map((reason) => (
                          <li key={reason.key}>{reason.label}: {reason.count.toLocaleString("ja-JP")}R</li>
                        ))}
                      </ul>
                    ) : <div className="ex-muted">除外なし</div>}
                  </article>
                  <article className="ex-location-card">
                    <div className="ex-location-head">
                      <h3>定義メモ</h3>
                      <span className="ex-location-status is-partial">v1</span>
                    </div>
                    <ul className="ex-trend-reasons">
                      <li>official confirmed result内の最新dateを動的抽出</li>
                      <li>実日付と不一致なら「最新取得日ベース」でありtodayと断定しない</li>
                      <li>LOW SAMPLEは参考のみ。未取得の未来Rを推測しない</li>
                      <li>堅め45%以上かつ平均1万円以下・万車券20%以下、荒れ30%以上または平均2万円以上・万車券30%以上</li>
                      <li>中穴35%以上または中穴連続、外枠70%以上、1番車飛び55%以上を補助signalにする</li>
                    </ul>
                  </article>
                </div>
                <div className="ex-empty">
                  <strong>{trifectaTrend.todayFlow.refinement.status}</strong><br />
                  {trifectaTrend.todayFlow.refinement.note}。
                </div>
              </>
            ) : null}
          </div>
          ) : null}

          <div className="ex-subsection" data-testid="result-trend-lab-structure-coverage-v1" hidden={activeSectionTab !== "structure-lab"}>
            <SectionTitle
              eyebrow="ANALYSIS COVERAGE MAP / PREDICTION STRUCTURE LAB v1"
              title="分析カバレッジMAP / 予想構造LAB v1"
              lead="新規数値分析を重複実装せず、既存タブの所在、現在のsource availability、2か月backfill後の検証対象を整理します。"
            />
            <div className="ex-overview-status">
              <span className="ex-trend-status-pill is-ready">no duplicate metrics</span>
              <span className="ex-trend-status-pill is-ready">official/source-backed only</span>
              <span className="ex-trend-status-pill is-ready">fake prohibited</span>
              <span className="ex-trend-status-pill is-caution">no inferred favorite</span>
              <span className="ex-trend-status-pill is-caution">no inferred line</span>
              <span className="ex-trend-status-pill is-caution">no inferred B/SB</span>
              <span className="ex-trend-status-pill is-partial">availability-first</span>
              <span className="ex-trend-status-pill is-partial">backfill-ready</span>
            </div>

            <div
              className="ex-empty"
              data-testid="historical-result-schema-loader-status"
            >
              <strong>HISTORICAL SCHEMA / LOADER: CONNECTED</strong><br />
              <span>historical data: {historicalAvailabilityStatus === "loading" ? "checking" : historicalAvailability?.indexFound ? "index found" : "not generated yet"}</span>
              {" / "}
              <span>status: {historicalAvailability?.status ?? "unavailable"}</span>
              {" / "}
              <span>{historicalAvailability?.dateRange.from ?? "--"} 〜 {historicalAvailability?.dateRange.to ?? "--"}</span>
              <div className="ex-overview-status" style={{ marginTop: 12 }}>
                <CoverageStatusPill status={historicalAvailability?.status ?? "unavailable"} />
                <span className="ex-trend-status-pill is-ready">localStorage not used</span>
                <span className="ex-trend-status-pill is-ready">public/data/reviews untouched</span>
                <span className="ex-trend-status-pill is-partial">
                  {historicalAvailability?.acceptedRaceCount ?? 0} accepted / {historicalAvailability?.rejectedRaceCount ?? 0} rejected
                </span>
              </div>
            </div>

            <div className="ex-kpi-grid">
              <MetricCard
                label="COVERED BY EXISTING TABS"
                value={KURARI_EX_PREDICTION_STRUCTURE_SUMMARY.coveredByExistingTabs.toLocaleString("ja-JP")}
                note="数値は既存タブで確認"
              />
              <MetricCard
                label="FUTURE-ACCUMULATION"
                value={KURARI_EX_PREDICTION_STRUCTURE_SUMMARY.futureAccumulation.toLocaleString("ja-JP")}
                note="source蓄積待ち"
                warning
              />
              <MetricCard
                label="UNAVAILABLE"
                value={KURARI_EX_PREDICTION_STRUCTURE_SUMMARY.unavailable.toLocaleString("ja-JP")}
                note="unknownをimplementedにしない"
                warning={KURARI_EX_PREDICTION_STRUCTURE_SUMMARY.unavailable > 0}
              />
              <MetricCard
                label="BACKFILL TARGETS"
                value={KURARI_EX_PREDICTION_STRUCTURE_SUMMARY.backfillTargets.toLocaleString("ja-JP")}
                note="2か月backfill後に再検証"
              />
              <MetricCard
                label="SOURCE-NEEDED"
                value={KURARI_EX_PREDICTION_STRUCTURE_SUMMARY.sourceNeeded.toLocaleString("ja-JP")}
                note="requiredSourcesから動的count"
                warning
              />
            </div>

            <div>
              <SectionTitle
                eyebrow="COVERAGE MATRIX"
                title="希望分析11項目"
                lead="実装済み数値はコピーせず「既存タブで確認」とし、未取得sourceは空欄にせずstatusを明記します。"
              />
              <div className="ex-table-wrap">
                <table className="ex-data-table ex-coverage-matrix">
                  <thead>
                    <tr>
                      <th>分析項目</th>
                      <th>現在status</th>
                      <th>既存タブとの関係</th>
                      <th>必要source</th>
                      <th>backfill後の予定</th>
                      <th>fake禁止メモ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {KURARI_EX_PREDICTION_STRUCTURE_ITEMS.map((item) => (
                      <tr key={item.id}>
                        <td>{item.label}</td>
                        <td><CoverageStatusPill status={item.status} /></td>
                        <td>{item.existingTabs.length ? `既存タブで確認: ${item.existingTabs.join(" / ")}` : "重複なし / 新規source待ち"}</td>
                        <td>{item.requiredSources.join(" / ") || "データ未掲載"}</td>
                        <td>{item.backfillPlan}</td>
                        <td>{item.fakeProhibition}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <SectionTitle
                eyebrow="CATEGORY BOARD"
                title="カテゴリ別 availability"
                lead="raceClass / grade / carCount / timeBandを推測せず、各セルをsource readinessとして表示します。"
              />
              <div className="ex-table-wrap">
                <table className="ex-data-table ex-category-board">
                  <thead>
                    <tr>
                      <th>カテゴリ</th>
                      {KURARI_EX_STRUCTURE_CATEGORY_COLUMNS.map((column) => <th key={column.key}>{column.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {KURARI_EX_STRUCTURE_CATEGORIES.map((category) => (
                      <tr key={category}>
                        <td>{category}</td>
                        {KURARI_EX_STRUCTURE_CATEGORY_COLUMNS.map((column) => (
                          <td key={column.key}><CoverageStatusPill status={column.status} /></td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <SectionTitle eyebrow="EXISTING TAB MAP" title="既存分析の所在" />
              <div className="ex-coverage-tab-map">
                {KURARI_EX_EXISTING_TAB_MAP.map((item) => (
                  <article key={item.tab}>
                    <h3>{item.tab}</h3>
                    <p>{item.coverage}</p>
                    <div style={{ marginTop: 9 }}><CoverageStatusPill status="implemented" /></div>
                  </article>
                ))}
              </div>
            </div>

            <div>
              <SectionTitle
                eyebrow="BACKFILL CHECKLIST"
                title="2か月historical backfill source"
                lead="source取得日時とprovenanceを含め、再集計前にsource-backed contractを確認します。"
              />
              <div className="ex-backfill-grid">
                {KURARI_EX_BACKFILL_CHECKLIST.map((item) => (
                  <article key={item.source}>
                    <strong>{item.source}</strong>
                    <CoverageStatusPill status={item.status} />
                  </article>
                ))}
              </div>
            </div>

            <div>
              <SectionTitle eyebrow="DEFINITION NOTES" title="推測禁止と分類ルール" />
              <div className="ex-definition-grid">
                <article><strong>バック基準の風向</strong><br />バック線方向に対する向かい / 追い / 横2種 / 無風 / 不明をsource-backedで定義し、風向を推測しない。</article>
                <article><strong>1番人気と1番車</strong><br />別概念として扱い、1番車飛び率から1番人気の着順や人気を推測しない。</article>
                <article><strong>B/SB</strong><br />officialまたは検証済みsourceだけを使い、逃げ決まり手や着順からB/SBを補完しない。</article>
                <article><strong>ライン構成</strong><br />構造化された並びsourceのみ。地区、選手名、脚質からラインやコマ数を作らない。</article>
                <article><strong>カテゴリ分類</strong><br />raceClass / grade / carCount / timeBandが揃う範囲のみ。開催名から推測しない。</article>
                <article><strong>LOW SAMPLE</strong><br />backfill後も参考情報であり、予想の主根拠やimplemented判定には使わない。</article>
              </div>
            </div>
          </div>

          <div className="ex-empty" hidden={activeSectionTab !== "trend"}>
            <strong>ROADMAP / FUTURE-ACCUMULATION</strong><br />
            最低オッズ比
          </div>
          <div className="ex-muted" hidden={activeSectionTab !== "trend"}>
            official result only / fake prohibited / LOW SAMPLE aware。
            30R未満は参考のみ、30〜99Rは傾向注意、100R以上でも予想の主根拠ではなく補助として扱います。
          </div>
        </section>

        <section
          className="ex-panel ex-section"
          data-testid="ex-section-coverage"
          id="ex-section-coverage"
          hidden={activeSectionTab !== "coverage"}
        >
          <SectionTitle
            eyebrow="DATA COVERAGE / AUTO UPDATE"
            title="自動更新・source現在地"
            lead="today.generated、official entries、starter source、EX history、official resultsの保存済み状態と取得日時を表示します。"
          />
          <div className="ex-health-grid">
            <MetricCard
              label="TODAY.GENERATED"
              value={identitySourceStatus === "loading" ? "…" : formatDate(identitySourceSummary?.todayDate)}
              note={identitySourceSummary?.todayGeneratedAt ?? "取得日時 未取得"}
              warning={!identitySourceSummary?.todayDate}
            />
            <MetricCard
              label="OFFICIAL ENTRIES"
              value={identitySourceStatus === "loading" ? "…" : valueText(identitySourceSummary?.officialEntriesCount, "人")}
              note={identitySourceSummary?.officialEntriesFetchedAt ?? "取得日時 未取得"}
              warning={!identitySourceSummary?.officialEntriesDate}
            />
            <MetricCard
              label="STARTER SOURCE"
              value={startersSourceStatus === "loading" ? "…" : startersSourceSummary?.status ?? "unavailable"}
              note={identitySourceSummary?.starterSourceFetchedAt ?? "取得日時 未取得"}
              warning={startersSourceStatus === "error"}
            />
            <MetricCard
              label="EX HISTORY"
              value={historyIndexStatus === "loading" ? "…" : valueText(historyIndexSummary?.registeredDays, "日")}
              note={historyIndexSummary?.latestDate ?? "latest 未取得"}
              warning={historyIndexStatus === "error"}
            />
            <MetricCard
              label="OFFICIAL RESULTS"
              value={trifectaTrendStatus === "loading" ? "…" : trifectaTrend?.sourceName ?? "unavailable"}
              note={trifectaTrend?.sourceFetchedAt ?? "取得日時 未取得"}
              warning={trifectaTrendStatus === "error"}
            />
            <MetricCard
              label="PUBLIC EX IMPORT"
              value={initialStatus === "loading" ? "CHECKING" : publicExFreshness.label}
              note={status?.lastImportAt ?? "取得日時 未取得"}
              warning={publicExFreshness.status !== "fresh"}
            />
            <MetricCard label="SLACK NOTIFICATION STATE" value="UNAVAILABLE" note="EX公開datasetに専用stateなし" warning />
            <MetricCard
              label="COVERAGE STATUS"
              value={identitySourceSummary?.status ?? (identitySourceStatus === "loading" ? "CHECKING" : "unavailable")}
              note="unknown / unavailableは補完しない"
              warning={identitySourceSummary?.status !== "ready"}
            />
          </div>
          <div className="ex-overview-status">
            <span className="ex-trend-status-pill is-ready">public/data: read-only</span>
            <span className="ex-trend-status-pill is-ready">fake completion: なし</span>
            <span className="ex-trend-status-pill is-ready">fuzzy matching: なし</span>
            <span className="ex-trend-status-pill is-future-accumulation">専用Slack state: unavailable</span>
          </div>
        </section>

        <section className="ex-panel ex-section" data-testid="kurari-ex-history-overview" hidden={activeSectionTab !== "coverage"}>
          <SectionTitle
            eyebrow="HISTORY INDEX / DAILY CONSUMER"
            title="KURARI EX History Overview"
            lead="保存済み history index と選択日の daily を読み取り専用で表示します。欠損 identity の生成・補完・名寄せは行いません。"
          />
          <div className="ex-health-grid">
            <MetricCard
              label="INDEX STATUS"
              value={historyIndexStatus === "loading" ? "LOADING" : historyIndexStatus.toUpperCase()}
              note="/history/index.generated.json"
              warning={historyIndexStatus === "error"}
            />
            <MetricCard
              label="REGISTERED DAYS"
              value={valueText(historyIndexSummary?.registeredDays)}
              note={historyIndexSummary ? `${historyIndexSummary.periodFrom} – ${historyIndexSummary.periodTo}` : "index period"}
            />
            <MetricCard
              label="RACES"
              value={valueText(historyIndexSummary?.raceCount)}
              note="registered history races"
            />
            <MetricCard
              label="LATEST DATE"
              value={historyIndexSummary?.latestDate ?? "--"}
              note="latest index item"
            />
          </div>

          {historyIndexStatus === "error" ? (
            <EmptyState text={`History index を読み込めませんでした。${historyIndexError ?? ""}`} />
          ) : historyIndexStatus === "loading" ? (
            <EmptyState text="History index を読み込み中です。" />
          ) : historyIndex && historyIndex.items.length ? (
            <>
              <div className="ex-empty" style={{ marginTop: 14 }}>
                <strong>latestPath:</strong> {historyIndexSummary?.latestPath ?? "--"}
              </div>
              <div className="ex-muted" style={{ marginTop: 10 }}>
                Mode: STARTERS_PARSED = 全 race に保存済み starters あり / NO_STARTERS = starters なし（正常な履歴状態） /
                MIXED = 同日内で混在 / UNKNOWN = race なし。既存監査では STARTERS_PARSED 5日、NO_STARTERS 39日、
                MIXED 14日、source 不足 4日です。
              </div>
              <div className="ex-muted" style={{ marginTop: 8 }}>
                Data policy: fake completion なし / fuzzy matching なし / registrationNo・選手名・carNo の生成なし /
                同姓同名候補の自動統合なし。
              </div>

              <div style={{ display: "grid", gap: 14, marginTop: 20 }}>
                <label style={{ display: "grid", gap: 7, maxWidth: 360 }}>
                  <span className="ex-eyebrow">HISTORY DATE SELECTOR</span>
                  <select
                    aria-label="History date"
                    value={selectedHistoryDate}
                    onChange={(event) => setSelectedHistoryDate(event.target.value)}
                    style={{ padding: "11px 12px", border: "1px solid #dfe4eb", borderRadius: 10, background: "#fff" }}
                  >
                    {[...historyIndex.items]
                      .sort((left, right) => right.date.localeCompare(left.date))
                      .map((item) => (
                        <option key={item.date} value={item.date}>
                          {item.date} — {item.raceCount.toLocaleString("ja-JP")}R
                        </option>
                      ))}
                  </select>
                </label>
              </div>
            </>
          ) : (
            <EmptyState text="History index に登録日がありません。" />
          )}

          <div style={{ marginTop: 24 }}>
            <SectionTitle
              eyebrow="SELECTED DAILY SUMMARY"
              title={selectedHistoryDate || "日付未選択"}
              lead="index の file path を使用して daily を読み込みます。"
            />
            {historyDailyStatus === "loading" ? (
              <EmptyState text="選択日の daily を読み込み中です。" />
            ) : historyDailyStatus === "error" ? (
              <EmptyState text={`選択日の daily を読み込めませんでした。${historyDailyError ?? ""}`} />
            ) : historyDailyStatus === "empty" ? (
              <EmptyState text="選択日は index にありません。" />
            ) : historyDaily && historyDailySummary ? (
              <>
                <div className="ex-health-grid">
                  <MetricCard label="DATE / MODE" value={historyDailySummary.date} note={historyDailySummary.mode} />
                  <MetricCard label="RACES / VENUES" value={`${historyDailySummary.raceCount} / ${historyDailySummary.venueCount}`} note="daily / unique venues" />
                  <MetricCard label="STARTERS" value={valueText(historyDailySummary.starterTotal)} note={`no-starters races: ${historyDailySummary.noStartersRaceCount}`} />
                  <MetricCard label="REGISTRATION NO" value={valueText(historyDailySummary.hasRegistrationNoCount)} note={`missing: ${historyDailySummary.missingRegistrationNoCount}`} warning={historyDailySummary.missingRegistrationNoCount > 0} />
                  <MetricCard label="RESULT LINKED" value={valueText(historyDailySummary.resultLinkedCount)} note="parsed or present" />
                  <MetricCard label="PREDICTION LINKED" value={valueText(historyDailySummary.predictionLinkedCount)} note="parsed or matched" />
                  <MetricCard label="REVIEW LINKED" value={valueText(historyDailySummary.reviewLinkedCount)} note="matched enrichment only" />
                  <MetricCard label="WARNINGS" value={valueText(historyDailySummary.warningCount)} note="source quality notices" warning={historyDailySummary.warningCount > 0} />
                </div>

                <div className="ex-table-wrap" style={{ marginTop: 16 }}>
                  <table className="ex-data-table">
                    <thead><tr><th>会場</th><th>race count</th></tr></thead>
                    <tbody>
                      {historyDailySummary.venues.map((venue) => (
                        <tr key={venue.venueKey}><td>{venue.venueName}</td><td>{venue.raceCount}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <h3 style={{ margin: "22px 0 10px", fontFamily: serif }}>Venue / Race Preview</h3>
                <div className="ex-table-wrap">
                  <table className="ex-data-table">
                    <thead>
                      <tr><th>date</th><th>会場</th><th>R</th><th>result</th><th>prediction</th><th>review</th><th>starters</th><th>registrationNo</th></tr>
                    </thead>
                    <tbody>
                      {historyDaily.items.slice(0, 20).map((race) => (
                        <tr key={race.raceKey}>
                          <td>{race.date}</td>
                          <td>{race.venueName}</td>
                          <td>{race.raceNumber}R</td>
                          <td>{race.quality?.resultParsed || (race.result && race.result.status !== "missing") ? "linked" : "missing"}</td>
                          <td>{race.quality?.predictionParsed || race.predictionEnrichment?.status === "matched" ? "linked" : "missing"}</td>
                          <td>{race.reviewEnrichment?.status === "matched" ? "linked" : "missing"}</td>
                          <td>{race.starters.length}</td>
                          <td>{getKurariExRaceRegistrationNoStatus(race)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ marginTop: 24 }} data-testid="kurari-ex-identity-safety-notes">
                  <SectionTitle
                    eyebrow="IDENTITY SAFETY"
                    title="Identity Safety Notes"
                    lead="registrationNo がない starter は削除せず「選手名ベース参考」として扱い、別選手との同一視には使用しません。"
                  />
                  <div className="ex-empty">
                    同一 race 内 duplicate carNo: 0 / duplicate registrationNo: 0 / cross-date・venue・race mix: 0 /
                    generated・fake identity: 0（2026-05-01〜2026-07-01 監査結果）
                  </div>
                  <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                    {historyIdentityWarnings.map((warning) => (
                      <div className="ex-empty" key={warning.name}>
                        <strong>{warning.name}</strong> — registrationNo {warning.registrationNos.join(" / ")} —
                        {warning.status === "MANUAL_REVIEW_REQUIRED"
                          ? ` ${warning.unresolvedRecordCount}件は未割当・手動確認対象`
                          : " registrationNo 別の選手として分離維持"}
                        {warning.selectedDailyOccurrenceCount ? `（選択日 ${warning.selectedDailyOccurrenceCount}件）` : ""}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <EmptyState text="日付を選択すると daily summary を表示します。" />
            )}
          </div>
        </section>

        <section className="ex-panel ex-section" data-testid="ex-section-identity" id="ex-section-identity" hidden={activeSectionTab !== "identity"}>
          <SectionTitle
            eyebrow="IDENTITY SOURCE CONNECTION"
            title="出走選手・登録番号 source coverage"
            lead="official entries → 検証済み starter source → today.generated の順で接続します。日付・会場・R・車番・選手名が安全に一致しない場合は推測せず未取得として扱います。"
          />
          <div className="ex-health-grid">
            <MetricCard
              label="CONNECTION"
              value={identitySourceStatus === "loading" ? "…" : identitySourceSummary?.status ?? "unavailable"}
              note="read-only"
              warning={identitySourceStatus === "error" || identitySourceSummary?.status === "unavailable"}
            />
            <MetricCard
              label="TODAY.GENERATED"
              value={identitySourceStatus === "loading" ? "…" : formatDate(identitySourceSummary?.todayDate)}
              note={identitySourceSummary?.todayGeneratedAt ?? "取得日時 未取得"}
              warning={identitySourceStatus === "error" || !identitySourceSummary?.todayDate}
            />
            <MetricCard
              label="OFFICIAL ENTRIES"
              value={identitySourceStatus === "loading" ? "…" : formatDate(identitySourceSummary?.officialEntriesDate)}
              note={identitySourceSummary?.officialEntriesFetchedAt ?? "取得日時 未取得"}
              warning={identitySourceStatus === "error" || !identitySourceSummary?.officialEntriesDate}
            />
            <MetricCard
              label="STARTER SOURCE"
              value={identitySourceStatus === "loading" ? "…" : formatDate(identitySourceSummary?.starterSourceDate)}
              note={identitySourceSummary?.starterSourceFetchedAt ?? "取得日時 未取得"}
              warning={identitySourceStatus === "error" || !identitySourceSummary?.starterSourceDate}
            />
            <MetricCard
              label="EX HISTORY"
              value={historyIndexStatus === "loading" ? "…" : formatDate(historyIndex ? summarizeKurariExHistoryIndex(historyIndex).latestDate : null)}
              note="history latest"
              warning={historyIndexStatus === "error"}
            />
            <MetricCard
              label="REGISTRATION NO"
              value={identitySourceStatus === "loading"
                ? "…"
                : `${valueText(identitySourceSummary?.registrationNoCompleteCount)} / ${valueText(identitySourceSummary?.starterCount)}`}
              note={`未取得 ${valueText(identitySourceSummary?.registrationNoMissingCount, "人")}`}
              warning={(identitySourceSummary?.registrationNoMissingCount ?? 0) > 0}
            />
          </div>

          <div className="ex-health-grid" style={{ marginTop: 14 }}>
            <MetricCard label="OFFICIAL" value={valueText(identitySourceSummary?.officialEntriesCount, "人")} note="KEIRIN.JP entries" />
            <MetricCard label="SOURCE-BACKED" value={valueText(identitySourceSummary?.starterSourceCount, "人")} note="validated starter source" />
            <MetricCard label="SOURCE-BACKED ALIAS" value={valueText(identitySourceSummary?.sourceBackedAliasCount, "人")} note="official直接接続とは別集計" />
            <MetricCard label="TODAY ONLY" value={valueText(identitySourceSummary?.todayGeneratedOnlyCount, "人")} note="registrationNo 未取得" warning={(identitySourceSummary?.todayGeneratedOnlyCount ?? 0) > 0} />
            <MetricCard label="MISMATCH STOPPED" value={valueText(identitySourceSummary?.blockedNameMismatchCount, "人")} note="未解決alias" warning={(identitySourceSummary?.blockedNameMismatchCount ?? 0) > 0} />
            <MetricCard label="ADOPTED MISMATCH" value={valueText(identitySourceSummary?.adoptedMismatchAliasCount, "人")} note="strict条件全PASS" />
            <MetricCard label="ALIAS REGISTERED" value={valueText(identitySourceSummary?.aliasRegistryRegisteredCount, "人")} note="registry照合済み" />
            <MetricCard label="ALIAS ADOPTED" value={valueText(identitySourceSummary?.aliasRegistryAdoptedCount, "人")} note="source-backed-alias" />
            <MetricCard label="STRICT ELIGIBLE" value={valueText(identitySourceSummary?.strictAdoptionEligibleCount, "人")} note="採用条件通過" />
            <MetricCard label="STRICT NOT ELIGIBLE" value={valueText(identitySourceSummary?.strictAdoptionNotEligibleCount, "人")} note="条件不一致" warning={(identitySourceSummary?.strictAdoptionNotEligibleCount ?? 0) > 0} />
            <MetricCard label="CANDIDATE NOT ADOPTED" value={valueText(identitySourceSummary?.officialCandidateNotAdoptedCount, "人")} note="strict未通過のみ" warning={(identitySourceSummary?.officialCandidateNotAdoptedCount ?? 0) > 0} />
            <MetricCard label="HISTORICAL" value={valueText(identitySourceSummary?.historicalIdentityCount, "人")} note="31-08 current接続では不使用" />
            <MetricCard label="MANUAL OVERRIDE" value={valueText(identitySourceSummary?.manualOverrideCount, "人")} note="official扱い禁止" />
            <MetricCard label="UNKNOWN" value={valueText(identitySourceSummary?.unknownCount, "人")} note="unknownのまま" warning={(identitySourceSummary?.unknownCount ?? 0) > 0} />
            <MetricCard label="UNAVAILABLE" value={valueText(identitySourceSummary?.unavailableCount, "人")} note="推測補完なし" warning={(identitySourceSummary?.unavailableCount ?? 0) > 0} />
          </div>

          <div className="ex-empty" style={{ marginTop: 14 }}>
            today.generated はレース・車番・選手名の基礎情報であり、登録番号完全データとして扱いません。
            official entries は date + venueCode + R + carNo と選手名完全一致時だけ使用します。
            starter source はPASS・fake補完なし・fuzzy matchingなしの既存contractを満たし、対象日が一致する場合だけ使用します。
            historical identity / unique-name / manual override はcurrent出走表の確定sourceには使いません。
            {(identitySourceSummary?.blockedNameMismatchCount ?? 0) > 0
              ? ` 表記不一致で接続を止めた選手: ${identitySourceSummary?.blockedNameMismatchCount.toLocaleString("ja-JP")}人。`
              : ""}
            {(identitySourceSummary?.adoptedMismatchAliasCount ?? 0) > 0
              ? ` 表記不一致検出後にsource-backed-aliasとして採用: ${identitySourceSummary?.adoptedMismatchAliasCount.toLocaleString("ja-JP")}人。`
              : ""}
            {identitySourceSummary?.sourceErrors.length
              ? ` 未取得source: ${identitySourceSummary.sourceErrors.join(" / ")}。`
              : ""}
          </div>

          <div style={{ marginTop: 24 }}>
            <SectionTitle
              eyebrow="IDENTITY MISMATCH AUDIT"
              title="表記不一致チェック"
              lead="playerName完全一致を満たさなかったofficial candidateを監査履歴として表示します。strict条件を全件通過したforeign rider aliasだけをsource-backed-aliasとして採用し、official直接接続とは分離します。"
            />
            <div className="ex-health-grid">
              <MetricCard
                label="MISMATCH DETECTED"
                value={valueText(identitySourceSummary?.mismatchDetectedCount, "人")}
                note="監査履歴"
              />
              <MetricCard
                label="MISMATCH STOPPED"
                value={valueText(identitySourceSummary?.blockedNameMismatchCount, "人")}
                note="未解決"
                warning={(identitySourceSummary?.blockedNameMismatchCount ?? 0) > 0}
              />
              <MetricCard
                label="ADOPTED FROM MISMATCH"
                value={valueText(identitySourceSummary?.adoptedMismatchAliasCount, "人")}
                note="source-backed-alias"
              />
              <MetricCard
                label="MISMATCH CANDIDATE"
                value={valueText(identitySourceSummary?.mismatchCandidateCount, "人")}
                note="official candidate検出数"
              />
              <MetricCard
                label="ALIAS REGISTRY REGISTERED"
                value={valueText(identitySourceSummary?.aliasRegistryRegisteredCount, "人")}
                note="exact-alias-pair"
              />
              <MetricCard
                label="FOREIGN RIDER ALIAS"
                value={valueText(identitySourceSummary?.foreignRiderAliasRegisteredCount, "人")}
                note="source-backed-manual"
              />
              <MetricCard label="FAKE COMPLETION" value="なし" note="strict一致したregistry値のみ" />
              <MetricCard label="FUZZY MATCHING" value="なし" note="部分一致による採用なし" />
              <MetricCard label="REGISTRATION REFLECTION" value={valueText(identitySourceSummary?.aliasRegistryAdoptedCount, "人")} note="source-backed-alias採用済み" />
            </div>

            <div style={{ marginTop: 24 }}>
              <SectionTitle
                eyebrow="FOREIGN RIDER ALIAS ADOPTION POLICY"
                title="外国人alias採用条件"
                lead="31-11の15条件にadoptionEligibilityとallStrictConditionsPassedを加えた17条件を再確認し、全PASSの候補だけをsource-backed-aliasとして採用します。"
              />
              <div className="ex-health-grid">
                <MetricCard
                  label="STRICT ADOPTION ELIGIBLE"
                  value={valueText(identitySourceSummary?.strictAdoptionEligibleCount, "人")}
                  note="採用条件通過"
                />
                <MetricCard
                  label="NOT ELIGIBLE"
                  value={valueText(identitySourceSummary?.strictAdoptionNotEligibleCount, "人")}
                  note="reasonを個別表示"
                  warning={(identitySourceSummary?.strictAdoptionNotEligibleCount ?? 0) > 0}
                />
                <MetricCard label="ALIAS ADOPTED" value={valueText(identitySourceSummary?.aliasRegistryAdoptedCount, "人")} note="adoptionStatus: adopted" />
                <MetricCard label="FAKE COMPLETION" value="なし" note="名前・登録番号の推測なし" />
                <MetricCard label="FUZZY MATCHING" value="なし" note="完全一致条件のみ" />
              </div>
              <div className="ex-empty" style={{ marginTop: 14 }}>
                採用source:
                registrationNoSource = foreign-rider-alias-registry /
                registrationNoTrustStatus = source-backed-alias /
                sourceType = source-backed-alias /
                matchMethod = exact-alias-pair /
                provenance = KEIRIN.JP official entries + foreign rider alias registry + strict keys matched。
                official direct matchではありません。
              </div>
            </div>

            {identitySourceSummary?.nameMismatchDetails.length ? (
              <div className="ex-table-wrap" style={{ marginTop: 14 }}>
                <table className="ex-data-table">
                  <thead>
                    <tr>
                      <th>会場 / R / 車番</th>
                      <th>today.generated名</th>
                      <th>official candidate名</th>
                      <th>official candidate登録番号</th>
                      <th>alias registry</th>
                      <th>strict adoption</th>
                      <th>停止理由</th>
                      <th>差分診断</th>
                      <th>sourceFetchedAt</th>
                      <th>処理結果</th>
                    </tr>
                  </thead>
                  <tbody>
                    {identitySourceSummary.nameMismatchDetails.map((detail) => (
                      <tr key={`${detail.rawKey}-${detail.todayName}-${detail.officialCandidateName}`}>
                        <td>
                          <strong>{detail.venueName} {detail.raceNumber}R {detail.carNo}番車</strong>
                          <div className="ex-muted">
                            date {detail.date} / venueCode {detail.venueCode} / race_id {detail.raceId ?? "未取得"}
                          </div>
                          <div className="ex-muted">
                            raw key {detail.rawKey} / {detail.safeKeyStatus}
                          </div>
                        </td>
                        <td>{detail.todayName || "未取得"}</td>
                        <td>
                          {detail.officialCandidateName || "未取得"}
                          <div className="ex-muted">
                            {detail.officialCandidatePrefecture ?? "府県未取得"} /
                            {detail.officialCandidateAge == null ? "年齢未取得" : `${detail.officialCandidateAge}歳`} /
                            {detail.officialCandidateTerm ? `${detail.officialCandidateTerm}期` : "期未取得"} /
                            {detail.officialCandidateClassName ?? "級班未取得"}
                          </div>
                        </td>
                        <td>
                          {detail.officialCandidateRegistrationNo ?? "未取得"}
                          <div className="ex-muted">
                            official candidate /
                            {detail.processingResult === "adopted-source-backed-alias"
                              ? " source-backed-alias採用元"
                              : " 未採用"}
                          </div>
                        </td>
                        <td>
                          <strong>
                            {detail.aliasRegistryStatus === "registered" ? "登録済み" : "未登録"}
                          </strong>
                          {detail.aliasRegistryEntry ? (
                            <>
                              <div className="ex-muted">registryId: {detail.aliasRegistryEntry.registryId}</div>
                              <div className="ex-muted">category: {detail.aliasRegistryEntry.category}</div>
                              <div className="ex-muted">sourceType: {detail.aliasRegistryEntry.sourceType}</div>
                              <div className="ex-muted">matchMethod: {detail.aliasRegistryEntry.matchMethod}</div>
                              <div className="ex-muted">trustStatus: {detail.aliasRegistryEntry.trustStatus}</div>
                              <div className="ex-muted">
                                provenance: {detail.aliasRegistryEntry.provenance.join(" / ")}
                              </div>
                            </>
                          ) : null}
                        </td>
                        <td>
                          <strong>{detail.aliasAdoptionAssessment.adoptionEligibility}</strong>
                          <div className="ex-muted">
                            adoptionStatus: {detail.aliasAdoptionAssessment.adoptionStatus}
                          </div>
                          <div className="ex-muted">
                            allStrictConditionsPassed: {String(detail.aliasAdoptionAssessment.allStrictConditionsPassed)}
                          </div>
                          <div className="ex-muted">
                            eligibilityReason: {detail.aliasAdoptionAssessment.eligibilityReason}
                          </div>
                          <div className="ex-muted">
                            required keys:
                            date={detail.aliasAdoptionAssessment.requiredKeys.date} /
                            venueCode={detail.aliasAdoptionAssessment.requiredKeys.venueCode} /
                            raceNumber={detail.aliasAdoptionAssessment.requiredKeys.raceNumber} /
                            carNo={detail.aliasAdoptionAssessment.requiredKeys.carNo} /
                            todayGeneratedName={detail.aliasAdoptionAssessment.requiredKeys.todayGeneratedName} /
                            officialEntryName={detail.aliasAdoptionAssessment.requiredKeys.officialEntryName} /
                            registrationNo={detail.aliasAdoptionAssessment.requiredKeys.registrationNo ?? "未取得"}
                          </div>
                          <div className="ex-muted">
                            strict conditions:
                            {" "}
                            {detail.aliasAdoptionAssessment.strictConditions
                              .map((condition) => `${condition.id}.${condition.key}=${condition.passed ? "PASS" : "FAIL"}`)
                              .join(" / ")}
                          </div>
                          <div className="ex-muted">
                            nextAction: {detail.aliasAdoptionAssessment.nextAction}
                          </div>
                        </td>
                        <td>{detail.reason}</td>
                        <td>{detail.differenceNote}</td>
                        <td>
                          {detail.sourceFetchedAt ?? "未取得"}
                          <div className="ex-muted">{detail.sourceType}</div>
                        </td>
                        <td>
                          {detail.processingResult === "adopted-source-backed-alias"
                            ? "source-backed-alias採用済み"
                            : "未採用 / registrationNo本体へ未接続"}
                          {detail.processingResult === "adopted-source-backed-alias" ? (
                            <>
                              <div className="ex-muted">official candidateから採用 / official direct matchではない</div>
                              <div className="ex-muted">
                                sourceType: {detail.aliasAdoptionAssessment.plannedSourceDesign.sourceType}
                              </div>
                              <div className="ex-muted">
                                registrationNoSource: {detail.aliasAdoptionAssessment.plannedSourceDesign.registrationNoSource}
                              </div>
                              <div className="ex-muted">
                                trustStatus: {detail.aliasAdoptionAssessment.plannedSourceDesign.registrationNoTrustStatus}
                              </div>
                              <div className="ex-muted">
                                provenance: {detail.aliasAdoptionAssessment.plannedSourceDesign.provenance}
                              </div>
                            </>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : identitySourceStatus === "loading" ? (
              <EmptyState text="表記不一致候補を確認中です。" />
            ) : (
              <EmptyState text="表記不一致で接続停止したofficial candidateはありません。" />
            )}
          </div>

          {identitySourceSummary?.starters.length ? (
            <>
              <div className="ex-table-wrap" style={{ marginTop: 14 }}>
                <table className="ex-data-table">
                  <thead>
                    <tr>
                      <th>会場 / R</th>
                      <th>車番</th>
                      <th>選手名</th>
                      <th>登録番号</th>
                      <th>府県</th>
                      <th>年齢</th>
                      <th>期</th>
                      <th>級班</th>
                      <th>source名</th>
                      <th>source取得日時</th>
                      <th>source種別</th>
                      <th>registrationNoSource</th>
                      <th>registrationNoTrustStatus</th>
                      <th>identitySource</th>
                      <th>matchMethod</th>
                      <th>adoptionStatus</th>
                      <th>provenance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {identitySourceSummary.starters.slice(0, 12).map((starter) => (
                      <tr key={`${starter.date}-${starter.venueCode}-${starter.venueName}-${starter.raceNumber}-${starter.carNo}`}>
                        <td>{starter.venueName} {starter.raceNumber}R</td>
                        <td>{starter.carNo}</td>
                        <td>{starter.name || "未取得"}</td>
                        <td>{starter.registrationNo ?? "未取得"}</td>
                        <td>{starter.prefecture ?? "未取得"}</td>
                        <td>{starter.age ?? "未取得"}</td>
                        <td>{starter.term ?? "未取得"}</td>
                        <td>{starter.className ?? "未取得"}</td>
                        <td>{starter.sourceName || "unknown"}</td>
                        <td>{starter.sourceFetchedAt ?? "未取得"}</td>
                        <td>{starter.sourceType}</td>
                        <td>{starter.registrationNoSource}</td>
                        <td>{starter.registrationNoTrustStatus}</td>
                        <td>{starter.identitySource}</td>
                        <td>{starter.matchMethod}</td>
                        <td>{starter.adoptionStatus ?? "対象外"}</td>
                        <td>{starter.provenance ?? "対象外"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="ex-muted">
                先頭12人を表示 / 全{identitySourceSummary.starterCount.toLocaleString("ja-JP")}人。
                詳細値が不明な場合も空欄にせず未取得・unknown・unavailableを維持します。
              </div>
            </>
          ) : identitySourceStatus === "loading" ? (
            <EmptyState text="identity source connectionを確認中です。" />
          ) : (
            <EmptyState text="接続可能な出走選手sourceは未取得です。fake補完は行いません。" />
          )}
        </section>

        <section className="ex-panel ex-section" hidden={activeSectionTab !== "coverage"}>
          <SectionTitle
            eyebrow="EXACT STARTERS SOURCE"
            title="正確出走選手ソース"
            lead="保存済み starters source を読み取り専用で表示します。current today から再生成せず、登録番号を identityKey として扱います。"
          />
          <div className="ex-health-grid">
            <MetricCard
              label="SOURCE STATUS"
              value={startersSourceStatus === "loading" ? "…" : startersSourceStatus === "ready" ? startersSourceSummary?.status ?? "unavailable" : "unavailable"}
              note="saved source"
              warning={startersSourceStatus === "error"}
            />
            <MetricCard
              label="LATEST DATE"
              value={startersSourceStatus === "loading" ? "…" : formatDate(startersSourceSummary?.latestDate)}
              note="index.latest"
              warning={startersSourceStatus === "error"}
            />
            <MetricCard
              label="RACES"
              value={startersSourceStatus === "loading" ? "…" : valueText(startersSourceSummary?.raceCount)}
              note="saved source"
            />
            <MetricCard
              label="STARTERS"
              value={startersSourceStatus === "loading" ? "…" : valueText(startersSourceSummary?.starterCount)}
              note="registrationNo source"
            />
            <MetricCard
              label="REGISTRATION NO"
              value={startersSourceStatus === "loading" ? "…" : startersSourceSummary?.registrationNoCoverageLabel ?? "--"}
              note="identityKey"
              warning={startersSourceStatus === "error"}
            />
            <MetricCard
              label="IDENTITY KEY"
              value={startersSourceStatus === "loading" ? "…" : startersSourceSummary?.identityKey ?? "--"}
              note="no fuzzy matching"
            />
          </div>
          {startersSourceStatus === "error" ? (
            <EmptyState text="Exact starters source は取得不可です。保存済みindex/sourceがPASSでない場合は unavailable として表示します。" />
          ) : (
            <>
              <div className="ex-empty">
                {startersSourceSummary?.warning ?? "保存済み starters source を確認中です。fake補完・fuzzy matching・result/lineup/prediction source 由来のidentity生成は行いません。"}
              </div>
              <div className="ex-muted">
                source path: {startersSourceSummary?.sourcePath ?? "--"} / compatibility: {startersSourceSummary?.currentTodayCompatibilityStatus ?? "SAVED_SOURCE_SEPARATED_FROM_CURRENT_TODAY"}
              </div>
              {startersSourceSummary?.previewRaces.length ? (
                <div className="ex-table-wrap" style={{ marginTop: 14 }}>
                  <table className="ex-data-table">
                    <thead>
                      <tr>
                        <th>日付</th>
                        <th>会場</th>
                        <th>R</th>
                        <th>出走数</th>
                        <th>preview</th>
                      </tr>
                    </thead>
                    <tbody>
                      {startersSourceSummary.previewRaces.map((race) => (
                        <tr key={`${race.date}-${race.venueName}-${race.raceNumber}`}>
                          <td>{race.date}</td>
                          <td>{race.venueName}</td>
                          <td>{race.raceNumber}R</td>
                          <td>{race.starterCount.toLocaleString("ja-JP")}</td>
                          <td>
                            {race.starters.map((starter) => (
                              <span key={`${race.date}-${race.venueName}-${race.raceNumber}-${starter.carNo}`} className="ex-badge">
                                {starter.carNo}番車 {starter.name} / {starter.registrationNo}
                              </span>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : startersSourceStatus === "loading" ? (
                <EmptyState text="Exact starters source を読み込み中です。" />
              ) : (
                <EmptyState text="preview可能な starters source がありません。" />
              )}
            </>
          )}
        </section>

        <section className="ex-panel ex-section ex-location" hidden={activeSectionTab !== "overview"}>
          <SectionTitle
            eyebrow="KURARI EX POSITION"
            title="KURARI EX 現在地"
            lead="実装済み・一部反映・未蓄積・ルール固定済みを、既存データと監査結果から整理します。"
          />
          <div className="ex-location-grid">
            <ExLocationCard
              title="EXデータ概要"
              status="育成中"
              tone="partial"
              items={[
                { label: "選手別EXACT", value: dashboardStatus.rider },
                { label: "MATCHUP EX", value: dashboardStatus.matchup },
                { label: "会場EX", value: dashboardStatus.venue },
                { label: "予想ページ反映素材", value: "反映済み" },
                { label: "EXページ整備状況", value: "現在地を追加" },
              ]}
              note={`蓄積ルール ${KURARI_EX_ACCUMULATION_RULES.length}項目固定 / 要蓄積 ${needsDataCount}項目`}
            />
            <ExLocationCard
              title="選手別EXACT"
              status={dashboardStatus.rider}
              tone={riderInitialStatus === "ready" ? "ready" : riderInitialStatus === "error" ? "warning" : "pending"}
              items={[
                { label: "実戦根拠あり", value: riderInitialStatus === "ready" ? `${practicalRiderCount.toLocaleString("ja-JP")}人` : "集計準備中" },
                { label: "LOW SAMPLE", value: riderInitialStatus === "ready" ? `${(riderQualityCounts?.["low-sample"] ?? 0).toLocaleString("ja-JP")}人` : "集計準備中" },
                { label: "素材蓄積中", value: riderInitialStatus === "ready" ? `${(riderQualityCounts?.["identity-only"] ?? 0).toLocaleString("ja-JP")}人` : "集計準備中" },
                { label: "登録番号一致", value: "最優先" },
                { label: "名前一致", value: "補助・参考扱い" },
              ]}
              note="PLAYER EXは実戦根拠 / LOW SAMPLE / identity-onlyを分離し、母数不足を強い根拠にしません。"
            />
            <ExLocationCard
              title="MATCHUP EX"
              status={dashboardStatus.matchup}
              tone={matchupInitialStatus === "ready" ? "ready" : matchupInitialStatus === "error" ? "warning" : "pending"}
              items={[
                { label: "既存対戦ペア", value: matchupInitialStatus === "ready" ? valueText(matchupSummary?.distinctPairCount) : "集計準備中" },
                { label: "実戦参考", value: matchupInitialStatus === "ready" ? valueText(matchupQualityCounts.sufficient) : "集計準備中" },
                { label: "LOW SAMPLE", value: matchupInitialStatus === "ready" ? valueText(matchupQualityCounts["low-sample"]) : "集計準備中" },
                { label: "比較不足・蓄積中", value: matchupInitialStatus === "ready" ? valueText(matchupQualityCounts.partial) : "集計準備中" },
                { label: "ペア生成方針", value: "存在する対戦のみ" },
              ]}
              note="直接対戦の保存済みペアだけを使用し、存在しない対戦ペアは生成しません。"
            />
            <ExLocationCard
              title="条件別データ"
              status={dashboardStatus.conditions}
              tone={conditionsReflected > 0 ? "partial" : riderCategoryStatus === "error" ? "warning" : "pending"}
              items={[
                { label: "周長別", value: hasCategoryData("bankLength") ? "333m / 400m / 500m" : "未蓄積" },
                { label: "時間帯別", value: hasCategoryData("timeslot") ? "朝 / デイ / ナイター / ミッド" : "未蓄積" },
                { label: "レース種目別", value: hasCategoryData("raceStage") ? "安全分類のみ" : "未蓄積" },
                { label: "天候別", value: hasCategoryData("weather") ? "晴れ / 曇り / 雨" : "未蓄積" },
                { label: "雪", value: hasSnowData ? "保存実績あり" : "未蓄積" },
              ]}
              note="未保存条件は分類せず、準決勝など安全に分離できない項目は確定値として扱いません。"
            />
            <ExLocationCard
              title="役割別データ"
              status={dashboardStatus.role}
              tone={roleReflected ? "partial" : riderCategoryStatus === "error" ? "warning" : "pending"}
              items={[
                { label: "ライン先頭", value: roleReflected ? "一部反映" : "未蓄積" },
                { label: "番手", value: roleReflected ? "一部反映" : "未蓄積" },
                { label: "3番手以降", value: roleReflected ? "一部反映" : "未蓄積" },
                { label: "単騎", value: roleReflected ? "一部反映" : "未蓄積" },
              ]}
              note="安全に並びを解釈できる場合だけ使用し、脚質だけでは役割を断定しません。"
            />
            <ExLocationCard
              title="戦法イベント"
              status="ルール固定済み"
              tone="fixed"
              items={KURARI_EX_TACTIC_EVENT_RULES.map((rule) => ({
                label: rule.label,
                value: "成功率未蓄積",
              }))}
              note="順位・脚質・役割だけではイベント判定せず、成功率・失敗率・発生回数をfake補完しません。"
            />
            <ExLocationCard
              title="紐付け監査"
              status={(riderCoverageAudit?.warnings?.length ?? 0) > 0 ? "warningあり" : riderCoverageAuditStatus === "ready" ? "確認済み" : "読込中"}
              tone={(riderCoverageAudit?.warnings?.length ?? 0) > 0 ? "warning" : riderCoverageAuditStatus === "ready" ? "ready" : "pending"}
              items={[
                { label: "登録番号一致", value: "最優先" },
                { label: "名前一致", value: "補助扱い" },
                { label: "未解決", value: riderCoverageAuditStatus === "ready" ? `${valueText(riderCoverageAudit?.unresolvedNameCount)}名 / ${valueText(riderCoverageAudit?.unresolvedObservationCount)} observations` : "集計準備中" },
                { label: "曖昧候補", value: riderCoverageAuditStatus === "ready" ? `${valueText(riderCoverageAudit?.ambiguousNameCount)}名` : "集計準備中" },
                { label: "既知warning", value: unresolvedWarning },
              ]}
              note="未解決・曖昧候補は無理に紐付けず、改善対象として監査に残します。"
            />
          </div>
          <p className="ex-location-policy">
            KURARI EXは、実データを蓄積しながら育てる分析ページです。未蓄積の数値は作らず、LOW SAMPLEや素材蓄積中を明示します。
            netkeirin / WINTICKETのような分析感を目指しつつ、ぬらくら用のオリジナルEXとして育成中です。fake補完は禁止です。
          </p>
        </section>

        <section className="ex-panel ex-section" hidden={activeSectionTab !== "analysis"}>
          <SectionTitle
            eyebrow="PLAYER EXACT OVERVIEW"
            title="選手別EXACT一覧"
            lead="KURARI EXに保存されている選手別データです。未蓄積の数値は作らず、LOW SAMPLE・素材蓄積中を明示します。"
          />
          <div className="ex-rider-filter-panel">
            <div className="ex-rider-filter-head">
              <div>
                <div className="ex-eyebrow">PLAYER SEARCH / FILTER</div>
                <h3>検索・フィルタ</h3>
              </div>
              <span className="ex-muted">選択した条件はすべてANDで適用</span>
            </div>
            <div className="ex-rider-filter-search">
              <input
                className="ex-rider-filter-input"
                type="search"
                value={riderOverviewQuery}
                onChange={(event) => setRiderOverviewQuery(event.target.value)}
                placeholder="選手名・登録番号・府県・級班で検索"
                aria-label="選手別EXACT一覧を検索"
              />
              <button
                className="ex-rider-filter-clear"
                type="button"
                onClick={clearRiderOverviewFilters}
                disabled={!riderOverviewFilterActive}
              >
                フィルタ解除
              </button>
            </div>
            <div className="ex-rider-filter-chips" aria-label="選手別EXACTフィルタ">
              {RIDER_OVERVIEW_FILTERS.map((filter) => {
                const active = riderOverviewFilters.includes(filter.key);
                return (
                  <button
                    key={filter.key}
                    className={`ex-rider-filter-chip${active ? " is-active" : ""}`}
                    type="button"
                    aria-pressed={active}
                    title={filter.note}
                    onClick={() => toggleRiderOverviewFilter(filter.key)}
                  >
                    {filter.label}
                  </button>
                );
              })}
              <span className="ex-rider-filter-chip is-unavailable" title="車番はレースごとの情報で、選手別EXACT indexには固定値として保存されていません。">
                車番：未蓄積
              </span>
            </div>
            <div className="ex-rider-filter-counts">
              <div>全選手<strong>{(riderInitialData?.index.riderCount ?? 0).toLocaleString("ja-JP")}</strong></div>
              <div>index該当候補<strong>{riderOverviewCandidateItems.length.toLocaleString("ja-JP")}</strong></div>
              <div>個別EXACT読込<strong>{riderOverviewLoadItems.length.toLocaleString("ja-JP")}</strong></div>
              <div>一覧表示<strong>{riderOverviewDisplayItems.length.toLocaleString("ja-JP")}</strong></div>
            </div>
            <div className="ex-muted">
              検索・フィルタは保存済みKURARI EXデータのみが対象です。紐付け・条件別・役割別・天候別フィルタは、index条件で絞った先頭50件の個別EXACT内で判定します。
              未取得・未蓄積は補完せず該当なしとして扱います。
            </div>
          </div>
          <div className="ex-rider-overview-summary">
            <strong>
              表示：{riderOverviewDisplayItems.length.toLocaleString("ja-JP")}件 / index該当候補 {riderOverviewCandidateItems.length.toLocaleString("ja-JP")}件 / 全件数 {(riderInitialData?.index.riderCount ?? 0).toLocaleString("ja-JP")}件
            </strong>
            <span className="ex-muted">先頭最大50件 / 実戦根拠あり → LOW SAMPLE → 素材蓄積中 → 選手名順</span>
          </div>
          <div className="ex-rider-overview-legend" aria-label="EX品質の全件内訳">
            <span className="ex-quality is-complete">実戦根拠あり {practicalRiderCount.toLocaleString("ja-JP")}人</span>
            <span className="ex-quality is-low-sample">LOW SAMPLE {(riderQualityCounts?.["low-sample"] ?? 0).toLocaleString("ja-JP")}人</span>
            <span className="ex-quality is-identity-only">素材蓄積中 {(riderQualityCounts?.["identity-only"] ?? 0).toLocaleString("ja-JP")}人</span>
          </div>
          {riderInitialStatus === "loading" ? <EmptyState text="選手別EXACT一覧を読み込んでいます。" /> : null}
          {riderInitialStatus === "error" || riderOverviewStatus === "error" ? <EmptyState text="選手別EXACT一覧を取得できませんでした。" /> : null}
          {riderOverviewFilterActive && riderFilteredStatus === "loading" ? <EmptyState text="検索条件に一致する個別EXACTを読み込んでいます。" /> : null}
          {riderFilteredStatus === "error" ? <EmptyState text="検索対象の個別EXACTを取得できませんでした。" /> : null}
          {riderInitialStatus === "ready" && riderOverviewDisplayItems.length > 0 && !isMobile ? (
            <div className="ex-rider-overview-table-wrap">
              <table className="ex-rider-overview-table">
                <thead>
                  <tr>
                    <th>選手</th>
                    <th>基本情報</th>
                    <th>総合成績</th>
                    <th>決まり手</th>
                    <th>EX品質</th>
                    <th>紐付け</th>
                  </tr>
                </thead>
                <tbody>
                  {riderOverviewDisplayItems.map((item) => {
                    const rider = riderOverviewDisplayCache[item.registrationNo];
                    return (
                      <tr key={item.registrationNo}>
                        <td>
                          <div className="ex-rider-overview-name">
                            <strong>{item.name}</strong>
                            <span>登録番号 {item.registrationNo}</span>
                          </div>
                        </td>
                        <td>
                          <div>{item.prefecture || "府県未取得"} / {item.class || "級班未取得"}</div>
                          <div className="ex-muted">期・年齢・脚質：未取得</div>
                        </td>
                        <td>
                          <div className="ex-rider-overview-stats">
                            <RiderExactOverviewStats item={item} rider={rider} />
                          </div>
                        </td>
                        <td className="ex-rider-overview-methods">
                          <RiderExactOverviewMethods item={item} rider={rider} />
                        </td>
                        <td>
                          <span className={`ex-quality is-${item.quality}`}>{getRiderOverviewQualityLabel(item)}</span>
                        </td>
                        <td><span className="ex-rider-overview-link">{getRiderIdentityLabel(rider)}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
          {riderInitialStatus === "ready" && riderOverviewDisplayItems.length > 0 && isMobile ? (
            <div className="ex-rider-overview-cards">
              {riderOverviewDisplayItems.map((item) => {
                const rider = riderOverviewDisplayCache[item.registrationNo];
                return (
                  <article className="ex-rider-overview-card" key={item.registrationNo}>
                    <div className="ex-rider-overview-card-head">
                      <div>
                        <h3>{item.name}</h3>
                        <div className="ex-muted">登録番号 {item.registrationNo}</div>
                      </div>
                      <span className={`ex-quality is-${item.quality}`}>{getRiderOverviewQualityLabel(item)}</span>
                    </div>
                    <div className="ex-rider-overview-card-block">
                      <b>基本情報</b>
                      <span>{item.prefecture || "府県未取得"} / {item.class || "級班未取得"}</span>
                      <span className="ex-muted">期・年齢・脚質：未取得</span>
                    </div>
                    <div className="ex-rider-overview-card-block">
                      <b>総合成績</b>
                      <RiderExactOverviewStats item={item} rider={rider} />
                    </div>
                    <div className="ex-rider-overview-card-block">
                      <b>決まり手</b>
                      <RiderExactOverviewMethods item={item} rider={rider} />
                    </div>
                    <span className="ex-rider-overview-link">{getRiderIdentityLabel(rider)}</span>
                  </article>
                );
              })}
            </div>
          ) : null}
          {riderInitialStatus === "ready" && riderFilteredStatus !== "loading" && riderOverviewDisplayItems.length === 0 ? (
            <EmptyState text="検索・フィルタ条件に一致する保存済み選手別EXACTはありません。" />
          ) : null}
          <p className="ex-location-policy">
            KURARI EXの選手別EXACTは、蓄積済みデータだけを表示します。未蓄積の成績・決まり手・登録番号は作りません。
            LOW SAMPLEは参考扱い、素材蓄積中は成績根拠にしません。fake補完は禁止です。
          </p>
        </section>

        <section className="ex-panel ex-section" hidden={activeSectionTab !== "analysis"}>
          <SectionTitle
            eyebrow="CONDITION EXACT DATA"
            title="条件別データ"
            lead="優先9〜11で生成済みの選手別EXACT条件集計を、保存済みデータの範囲だけで表示します。"
          />
          <div className="ex-condition-tabs" role="tablist" aria-label="条件別データの分類">
            {KURARI_EX_CONDITION_DATA_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={conditionDataTab === tab.key}
                className={`ex-condition-tab${conditionDataTab === tab.key ? " is-active" : ""}`}
                onClick={() => setConditionDataTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="ex-condition-source">
            <strong>{selectedConditionTab.label}</strong>
            <span>{selectedConditionTab.note}</span>
            <span>参照元: {selectedConditionDimension?.sourcePath ?? "未取得"}</span>
          </div>
          {riderCategoryStatus === "loading" ? <EmptyState text="保存済み条件別データを読み込んでいます。" /> : null}
          {riderCategoryStatus === "error" ? <EmptyState text="条件別データを取得できませんでした。" /> : null}
          {riderCategoryStatus === "ready" && !isMobile ? (
            <div className="ex-condition-table-wrap">
              <table className="ex-condition-table">
                <thead>
                  <tr>
                    <th>条件名</th>
                    <th>対象件数</th>
                    <th>1着</th>
                    <th>2着</th>
                    <th>3着</th>
                    <th>着外</th>
                    <th>勝率</th>
                    <th>2連対率</th>
                    <th>3連対率</th>
                    <th>品質</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedConditionRows.map(({ key, label, item }) => (
                    <tr key={`${selectedConditionTab.key}-${key}`}>
                      <td>{label}</td>
                      <td>{item ? item.starts.toLocaleString("ja-JP") : "未蓄積"}</td>
                      <td>{item ? item.wins.toLocaleString("ja-JP") : "-"}</td>
                      <td>{item ? item.seconds.toLocaleString("ja-JP") : "-"}</td>
                      <td>{item ? item.thirds.toLocaleString("ja-JP") : "-"}</td>
                      <td>{item ? item.outside.toLocaleString("ja-JP") : "-"}</td>
                      <td>{item ? formatRiderCategoryRate(item.winRate) : "-"}</td>
                      <td>{item ? formatRiderCategoryRate(item.top2Rate) : "-"}</td>
                      <td>{item ? formatRiderCategoryRate(item.top3Rate) : "-"}</td>
                      <td><ConditionQualityBadge item={item} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {riderCategoryStatus === "ready" && isMobile ? (
            <div className="ex-condition-cards">
              {selectedConditionRows.map(({ key, label, item }) => (
                <article className="ex-condition-card" key={`${selectedConditionTab.key}-${key}`}>
                  <div className="ex-condition-card-head">
                    <div>
                      <h3>{label}</h3>
                      <div className="ex-muted">対象件数 {item ? item.starts.toLocaleString("ja-JP") : "未蓄積"}</div>
                    </div>
                    <ConditionQualityBadge item={item} />
                  </div>
                  <div className="ex-condition-card-grid">
                    {[
                      ["1着", item ? item.wins.toLocaleString("ja-JP") : "-"],
                      ["2着", item ? item.seconds.toLocaleString("ja-JP") : "-"],
                      ["3着", item ? item.thirds.toLocaleString("ja-JP") : "-"],
                      ["着外", item ? item.outside.toLocaleString("ja-JP") : "-"],
                    ].map(([metricLabel, value]) => (
                      <div key={metricLabel}><span>{metricLabel}</span><strong>{value}</strong></div>
                    ))}
                  </div>
                  <div className="ex-condition-rate-row">
                    <span>勝率 {item ? formatRiderCategoryRate(item.winRate) : "-"}</span>
                    <span>2連対率 {item ? formatRiderCategoryRate(item.top2Rate) : "-"}</span>
                    <span>3連対率 {item ? formatRiderCategoryRate(item.top3Rate) : "-"}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
          {conditionDataTab === "raceStage" ? (
            <div className="ex-sample-alert">
              <strong>安全分類のみ</strong>準決勝は決勝へ混ぜず未蓄積扱いです。不明分類とグレード×レース種目も推測では生成しません。
            </div>
          ) : null}
          {conditionDataTab === "weather" ? (
            <div className="ex-sample-alert">
              <strong>保存済みbyWeatherのみ</strong>雪は保存実績がない限り未蓄積です。過去天候を後付けせず、実結果天候を優先します。
            </div>
          ) : null}
          <p className="ex-location-policy">
            条件別データは、既存の保存済みEXACT集計だけを表示します。LOW SAMPLEは参考扱い、identity-onlyは成績集計の根拠にせず、
            未取得条件・未保存数値・曖昧分類をfake補完しません。
          </p>
        </section>

        <section className="ex-panel ex-section" hidden={activeSectionTab !== "analysis"}>
          <SectionTitle
            eyebrow="POSITION / ROLE EXACT"
            title="位置・役割別成績"
            lead="優先10で生成済みの保存済みbyRoleを、安全に並びを解釈できたレースの範囲だけで表示します。"
          />
          <div className="ex-condition-tabs" role="tablist" aria-label="位置・役割別成績の分類">
            {KURARI_EX_ROLE_DATA_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={roleDataTab === tab.key}
                className={`ex-condition-tab${roleDataTab === tab.key ? " is-active" : ""}`}
                onClick={() => setRoleDataTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <p className="ex-role-description">
            <strong>{selectedRoleTab.label}：</strong>{selectedRoleTab.description}
          </p>
          <div className="ex-condition-source">
            <strong>保存済みbyRole</strong>
            <span>脚質ではなく、安全に解釈できた並び情報を使用</span>
            <span>参照元: {roleDimension?.sourcePath ?? "未取得"}</span>
          </div>
          <div className="ex-rider-overview-legend" aria-label="役割別成績の品質区分">
            <span className="ex-quality is-complete">EXACT 蓄積済み</span>
            <span className="ex-quality is-low-sample">LOW SAMPLE 参考扱い</span>
            <span className="ex-quality is-identity-only">未蓄積</span>
          </div>
          {riderCategoryStatus === "loading" ? <EmptyState text="保存済み役割別データを読み込んでいます。" /> : null}
          {riderCategoryStatus === "error" ? <EmptyState text="位置・役割別成績を取得できませんでした。" /> : null}
          {riderCategoryStatus === "ready" && !isMobile ? (
            <div className="ex-condition-table-wrap">
              <table className="ex-condition-table">
                <thead>
                  <tr>
                    <th>役割名</th>
                    <th>対象件数</th>
                    <th>1着</th>
                    <th>2着</th>
                    <th>3着</th>
                    <th>着外</th>
                    <th>勝率</th>
                    <th>2連対率</th>
                    <th>3連対率</th>
                    <th>品質</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{selectedRoleTab.label}</td>
                    <td>{selectedRoleItem ? selectedRoleItem.starts.toLocaleString("ja-JP") : "未蓄積"}</td>
                    <td>{selectedRoleItem ? selectedRoleItem.wins.toLocaleString("ja-JP") : "-"}</td>
                    <td>{selectedRoleItem ? selectedRoleItem.seconds.toLocaleString("ja-JP") : "-"}</td>
                    <td>{selectedRoleItem ? selectedRoleItem.thirds.toLocaleString("ja-JP") : "-"}</td>
                    <td>{selectedRoleItem ? selectedRoleItem.outside.toLocaleString("ja-JP") : "-"}</td>
                    <td>{selectedRoleItem ? formatRiderCategoryRate(selectedRoleItem.winRate) : "-"}</td>
                    <td>{selectedRoleItem ? formatRiderCategoryRate(selectedRoleItem.top2Rate) : "-"}</td>
                    <td>{selectedRoleItem ? formatRiderCategoryRate(selectedRoleItem.top3Rate) : "-"}</td>
                    <td><ConditionQualityBadge item={selectedRoleItem} /></td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : null}
          {riderCategoryStatus === "ready" && isMobile ? (
            <article className="ex-condition-card">
              <div className="ex-condition-card-head">
                <div>
                  <h3>{selectedRoleTab.label}</h3>
                  <div className="ex-muted">対象件数 {selectedRoleItem ? selectedRoleItem.starts.toLocaleString("ja-JP") : "未蓄積"}</div>
                </div>
                <ConditionQualityBadge item={selectedRoleItem} />
              </div>
              <div className="ex-condition-card-grid">
                {[
                  ["1着", selectedRoleItem ? selectedRoleItem.wins.toLocaleString("ja-JP") : "-"],
                  ["2着", selectedRoleItem ? selectedRoleItem.seconds.toLocaleString("ja-JP") : "-"],
                  ["3着", selectedRoleItem ? selectedRoleItem.thirds.toLocaleString("ja-JP") : "-"],
                  ["着外", selectedRoleItem ? selectedRoleItem.outside.toLocaleString("ja-JP") : "-"],
                ].map(([metricLabel, value]) => (
                  <div key={metricLabel}><span>{metricLabel}</span><strong>{value}</strong></div>
                ))}
              </div>
              <div className="ex-condition-rate-row">
                <span>勝率 {selectedRoleItem ? formatRiderCategoryRate(selectedRoleItem.winRate) : "-"}</span>
                <span>2連対率 {selectedRoleItem ? formatRiderCategoryRate(selectedRoleItem.top2Rate) : "-"}</span>
                <span>3連対率 {selectedRoleItem ? formatRiderCategoryRate(selectedRoleItem.top3Rate) : "-"}</span>
              </div>
            </article>
          ) : null}
          <div className="ex-sample-alert">
            <strong>安全な役割判定のみ</strong>脚質だけで役割を断定せず、並び未取得・曖昧な役割・4番手以降は未蓄積扱いです。
          </div>
          <p className="ex-location-policy">
            位置・役割別成績は、既存の保存済みbyRoleだけを表示します。LOW SAMPLEは参考扱い、identity-onlyは成績根拠にせず、
            未保存の役割・件数・成績をfake補完しません。
          </p>
        </section>

        <section className="ex-panel ex-section" hidden={activeSectionTab !== "analysis"}>
          <SectionTitle
            eyebrow="MATCHUP EXACT OVERVIEW"
            title="MATCHUP / 相性データ一覧"
            lead="既存MATCHUP EXに保存済みのpairKeyだけを表示します。存在しない対戦ペアや相性メモは生成しません。"
          />
          <div className="ex-matchup-overview-summary">
            <div>保存済み対戦ペア数<strong>{valueText(matchupSummary?.distinctPairCount)}</strong></div>
            <div>実戦参考・候補内<strong>{matchupOverviewCategoryCounts.practical.toLocaleString("ja-JP")}</strong></div>
            <div>LOW SAMPLE・候補内<strong>{matchupOverviewCategoryCounts["low-sample"].toLocaleString("ja-JP")}</strong></div>
            <div>比較不足・候補内<strong>{matchupOverviewCategoryCounts.insufficient.toLocaleString("ja-JP")}</strong></div>
            <div>表示件数<strong>{matchupOverviewVisibleRows.length.toLocaleString("ja-JP")}</strong></div>
          </div>
          <div className="ex-condition-source">
            <strong>表示：先頭{matchupOverviewVisibleRows.length.toLocaleString("ja-JP")}件 / 全件数 {valueText(matchupSummary?.distinctPairCount)}件</strong>
            <span>分類数はindex上位{MATCHUP_OVERVIEW_SOURCE_RIDER_LIMIT}選手から読み込んだ重複なし候補 {matchupOverviewRows.length.toLocaleString("ja-JP")}件内</span>
            <span>参照元: exact/matchups/by-rider-tail/*</span>
          </div>
          <div className="ex-rider-overview-legend" aria-label="MATCHUP品質区分">
            <span className="ex-quality is-sufficient">実戦参考</span>
            <span className="ex-quality is-low-sample">LOW SAMPLE / 低母数</span>
            <span className="ex-quality is-partial">比較不足 / 蓄積中</span>
            <span className="ex-quality is-identity-only">未取得</span>
          </div>
          {matchupOverviewStatus === "loading" ? <EmptyState text="保存済みMATCHUP EXを読み込んでいます。" /> : null}
          {matchupOverviewStatus === "error" ? <EmptyState text="MATCHUP / 相性データ一覧を取得できませんでした。" /> : null}
          {matchupOverviewStatus === "ready" && !isMobile ? (
            <div className="ex-condition-table-wrap">
              <table className="ex-condition-table ex-matchup-overview-table">
                <thead>
                  <tr>
                    <th>選手A</th>
                    <th>選手B</th>
                    <th>直接対戦数</th>
                    <th>A先着</th>
                    <th>B先着</th>
                    <th>同ライン時</th>
                    <th>別ライン時</th>
                    <th>品質</th>
                    <th>再戦材料</th>
                  </tr>
                </thead>
                <tbody>
                  {matchupOverviewVisibleRows.map((row) => (
                    <tr key={row.pairKey}>
                      <td>
                        <div className="ex-matchup-overview-player">
                          <strong>{row.nameA || "未取得"}</strong>
                          <span>{row.registrationNoA}</span>
                        </div>
                      </td>
                      <td>
                        <div className="ex-matchup-overview-player">
                          <strong>{row.nameB || "未取得"}</strong>
                          <span>{row.registrationNoB}</span>
                        </div>
                      </td>
                      <td>{row.sharedRaceCount}R<br /><span className="ex-muted">比較可能 {row.safeComparableRaceCount}R</span></td>
                      <td>{row.safeComparableRaceCount ? row.aAheadCount : "-"}</td>
                      <td>{row.safeComparableRaceCount ? row.bAheadCount : "-"}</td>
                      <td className="ex-matchup-overview-line">{formatMatchupOverviewLine(row.sameLine)}</td>
                      <td className="ex-matchup-overview-line">{formatMatchupOverviewLine(row.otherLine)}</td>
                      <td><MatchupOverviewBadge category={row.category} /></td>
                      <td className="ex-matchup-overview-note">未蓄積</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {matchupOverviewStatus === "ready" && isMobile ? (
            <div className="ex-matchup-overview-cards">
              {matchupOverviewVisibleRows.map((row) => (
                <article className="ex-matchup-overview-card" key={row.pairKey}>
                  <div className="ex-matchup-overview-card-head">
                    <div>
                      <h3>{row.nameA || "未取得"} × {row.nameB || "未取得"}</h3>
                      <div className="ex-muted">{row.registrationNoA} / {row.registrationNoB}</div>
                    </div>
                    <MatchupOverviewBadge category={row.category} />
                  </div>
                  <div className="ex-matchup-overview-card-grid">
                    <div>直接対戦<strong>{row.sharedRaceCount}R</strong></div>
                    <div>A先着<strong>{row.safeComparableRaceCount ? row.aAheadCount : "-"}</strong></div>
                    <div>B先着<strong>{row.safeComparableRaceCount ? row.bAheadCount : "-"}</strong></div>
                  </div>
                  <div className="ex-matchup-overview-card-line">
                    <span>比較可能：{row.safeComparableRaceCount}R</span>
                    <span>同ライン時：{formatMatchupOverviewLine(row.sameLine)}</span>
                    <span>別ライン時：{formatMatchupOverviewLine(row.otherLine)}</span>
                    <span>再戦材料：未蓄積</span>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
          <div className="ex-sample-alert">
            <strong>保存済みMATCHUP EXのみ</strong>LOW SAMPLEは参考扱い、比較不足は蓄積中として表示します。同ライン・別ラインや直接対戦数を推測しません。
          </div>
          <p className="ex-location-policy">
            A先着・B先着は保存済みの比較可能レースだけを表示します。順位・府県・脚質から因果関係や再戦材料を作らず、
            identity-onlyを成績根拠にせず、未保存項目は未蓄積として扱います。fake補完は禁止です。
          </p>
        </section>

        <section className="ex-panel ex-section" hidden={activeSectionTab !== "analysis"}>
          <SectionTitle
            eyebrow="LINE / RELATIONSHIP NOTES"
            title="ライン・関係性メモ"
            lead="保存済みMATCHUP EXの過去同走・同ライン実績と、保存済みbyRoleだけを事実ベースで整理します。"
          />
          <div className="ex-matchup-overview-summary">
            <div>保存済み材料<strong>{relationshipMemoCounts.saved.toLocaleString("ja-JP")}</strong></div>
            <div>同県連携候補<strong>{relationshipMemoCounts.samePrefecture.toLocaleString("ja-JP")}</strong></div>
            <div>同一ライン候補<strong>{relationshipMemoCounts.sameLine.toLocaleString("ja-JP")}</strong></div>
            <div>再戦材料<strong>{relationshipMemoCounts.rematch.toLocaleString("ja-JP")}</strong></div>
            <div>役割材料<strong>{relationshipMemoCounts.role.toLocaleString("ja-JP")}</strong></div>
            <div>未蓄積<strong>{relationshipMemoCounts.unavailable.toLocaleString("ja-JP")}</strong></div>
          </div>
          <div className="ex-condition-source">
            <strong>表示：{relationshipMemoRows.length.toLocaleString("ja-JP")}件</strong>
            <span>MATCHUP候補 {matchupOverviewRows.length.toLocaleString("ja-JP")}件 / 選手別EXACT先頭{Object.keys(riderOverviewCache).length.toLocaleString("ja-JP")}件を参照</span>
            <span>同県一致だけ・脚質だけ・順位だけでは関係性を作成しません</span>
          </div>
          <div className="ex-rider-overview-legend" aria-label="関係性メモの品質区分">
            <span className="ex-quality is-sufficient">保存済み実績</span>
            <span className="ex-quality is-low-sample">LOW SAMPLE / 参考</span>
            <span className="ex-quality is-partial">比較不足 / 蓄積中</span>
            <span className="ex-quality is-identity-only">未蓄積</span>
          </div>
          {matchupOverviewStatus === "loading" || riderOverviewStatus === "loading" ? <EmptyState text="保存済みライン・関係性材料を読み込んでいます。" /> : null}
          {matchupOverviewStatus === "error" ? <EmptyState text="ライン・関係性メモのMATCHUP材料を取得できませんでした。" /> : null}
          {matchupOverviewStatus === "ready" && riderOverviewStatus !== "loading" && !isMobile ? (
            <div className="ex-condition-table-wrap">
              <table className="ex-condition-table ex-relationship-table">
                <thead>
                  <tr>
                    <th>カテゴリ</th>
                    <th>対象選手 / 対象ペア</th>
                    <th>根拠タイプ</th>
                    <th>件数</th>
                    <th>品質</th>
                    <th>メモ</th>
                  </tr>
                </thead>
                <tbody>
                  {relationshipMemoRows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.category}</td>
                      <td className="ex-relationship-target">{row.target}</td>
                      <td className="ex-relationship-evidence">{row.evidenceType}</td>
                      <td>{row.count == null ? "未蓄積" : `${row.count.toLocaleString("ja-JP")}R`}</td>
                      <td><MatchupOverviewBadge category={row.quality} /></td>
                      <td className="ex-relationship-note">{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {matchupOverviewStatus === "ready" && riderOverviewStatus !== "loading" && isMobile ? (
            <div className="ex-relationship-cards">
              {relationshipMemoRows.map((row) => (
                <article className="ex-relationship-card" key={row.id}>
                  <div className="ex-relationship-card-head">
                    <h3>{row.category}</h3>
                    <MatchupOverviewBadge category={row.quality} />
                  </div>
                  <div className="ex-relationship-card-target">{row.target}</div>
                  <div className="ex-relationship-card-meta">
                    <div>根拠タイプ<strong>{row.evidenceType}</strong></div>
                    <div>件数<strong>{row.count == null ? "未蓄積" : `${row.count.toLocaleString("ja-JP")}R`}</strong></div>
                  </div>
                  <p className="ex-relationship-card-note">{row.note}</p>
                </article>
              ))}
            </div>
          ) : null}
          <div className="ex-sample-alert">
            <strong>関係性の断定禁止</strong>同県だけでは連携候補にせず、保存済み同ライン実績もある場合だけ表示します。次走の並び・役割は固定しません。
          </div>
          <p className="ex-location-policy">
            ライン先頭・番手・単騎は保存済みbyRoleの過去成績であり、脚質から推測した役割ではありません。ライン分断注意は明示記録を取得できないため未蓄積です。
            LOW SAMPLEは参考扱い、identity-onlyは成績根拠にせず、保存されていない関係性をfake補完しません。
          </p>
        </section>

        <section className="ex-panel ex-section" hidden={activeSectionTab !== "analysis"}>
          <SectionTitle
            eyebrow="TACTIC EVENT RULE MANAGEMENT"
            title="戦法イベント管理欄"
            lead="優先12で固定した判定ルールを表示します。発生・成功・失敗の数値は、明示記録が蓄積されるまで生成しません。"
          />
          <div className="ex-matchup-overview-summary">
            <div>対象イベント数<strong>{KURARI_EX_TACTIC_EVENT_RULES.length}</strong></div>
            <div>ルール固定済み<strong>{KURARI_EX_TACTIC_EVENT_RULES.length}</strong></div>
            <div>成功率未蓄積<strong>{KURARI_EX_TACTIC_EVENT_RULES.length}</strong></div>
            <div>失敗率未蓄積<strong>{KURARI_EX_TACTIC_EVENT_RULES.length}</strong></div>
            <div>発生回数未蓄積<strong>{KURARI_EX_TACTIC_EVENT_RULES.length}</strong></div>
          </div>
          <div className="ex-condition-source">
            <strong>後付け分類：禁止</strong>
            <span>参照元: KURARI_EX_TACTIC_EVENT_RULES</span>
            <span>展開メモ・振り返り・明示タグがある場合だけ認定</span>
          </div>
          <div className="ex-tactic-rule-grid">
            {KURARI_EX_TACTIC_EVENT_RULES.map((rule) => (
              <article className="ex-tactic-rule-card" key={rule.key}>
                <div className="ex-tactic-rule-head">
                  <div>
                    <div className="ex-eyebrow">{rule.key.toUpperCase()}</div>
                    <h3>{rule.label}</h3>
                  </div>
                  <span className="ex-location-status is-fixed">ルール固定済み</span>
                </div>
                <div className="ex-tactic-rule-metrics">
                  <div>成功率<strong>未蓄積</strong></div>
                  <div>失敗率<strong>未蓄積</strong></div>
                  <div>発生回数<strong>未蓄積</strong></div>
                </div>
                <div className="ex-tactic-rule-detail">
                  <div><b>認定条件</b>{rule.detection}</div>
                  <div><b>成功候補条件</b>{rule.success}</div>
                  <div><b>個別禁止条件</b>{rule.prohibited}</div>
                </div>
                <span className="ex-quality is-identity-only">品質：RULE ONLY / 数値未蓄積</span>
              </article>
            ))}
          </div>
          <div className="ex-tactic-common-ban">
            <strong>共通禁止条件</strong>
            <ul>
              <li>順位だけでは認定しない</li>
              <li>脚質だけでは認定しない</li>
              <li>ライン役割だけでは認定しない</li>
              <li>保存済みメモ・振り返り・明示タグなしでは認定しない</li>
            </ul>
          </div>
          <p className="ex-location-policy">
            戦法イベントはルール固定段階です。成功率・失敗率・発生回数を作らず、保存されていないイベントを過去レースへ後付け分類しません。
            判定元が揃うまで未蓄積のまま扱い、fake補完は禁止です。
          </p>
        </section>

        {initialStatus === "error" ? (
          <section className="ex-panel ex-section" hidden={activeSectionTab !== "analysis"}>
            <EmptyState text="KURARI EX DATAはまだ生成されていません。private-inputへ原本を追加し、importスクリプトを実行してください。" />
          </section>
        ) : null}

        <section className="ex-panel ex-section ex-today" hidden={activeSectionTab !== "analysis"}>
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
                  ) : <div className="ex-muted">sample-shortなし</div>}
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

        <section className="ex-panel ex-section" hidden={activeSectionTab !== "coverage"}>
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

        <section className="ex-panel ex-section" hidden={activeSectionTab !== "trend"}>
          <SectionTitle eyebrow="EX ANALYSIS COVERAGE" title="分析項目チェックリスト" lead="実装済み・一部・蓄積予定・fake禁止を分けて管理します。" />
          <div className="ex-subsection">
            <div className="ex-eyebrow">COVERAGE MAP</div>
            <div className="ex-legend">
              {[
                ["☑ 実装済み", "条件別EXACT", "競輪場別 / 時間帯別 / 車番別 / グレード別 / レース種目別 / 周長 / 天候 / 着順別は、現在のPLAYER CATEGORY ANALYSISで利用できます。"],
                ["☑ 一部実装", "位置別・日程別", "ライン先頭 / 番手 / 3番手以降 / 単騎はrole集計で扱います。競り・細かい日程判定は未確定項目として管理します。"],
                ["☐ 蓄積予定", "今後増やす分析", "グレード×レース種目 / 見なし直線 / 同県選手同乗時 / 同一ライン / ライン長別 / ライン決着率を追加候補にします。"],
                ["☒ fake禁止", "展開動作系", "かまし成功率 / つっぱり成功率 / ちぎり率 / ちぎられ率 / 飛びつき成功率 / 競りの勝率は、判定元が揃うまで未生成のまま扱います。"],
              ].map(([status, title, description]) => (
                <article key={title}>
                  <strong>{status}</strong>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </article>
              ))}
            </div>
          </div>
          <div className="ex-subsection">
            <div className="ex-eyebrow">NEXT ANALYSIS CANDIDATES</div>
            <div className="ex-legend">
              {[
                ["会場×車番", "会場ごとの内枠有利・外枠穴を確認し、車番別をさらに実戦向けに細分化する。"],
                ["グレード×レース種目", "F1準決・F2決勝・敗者戦など、開催格と番組条件を掛け合わせる。"],
                ["見なし直線", "会場マスタを使い、短走路/長走路で先行残り・差し傾向を確認する。"],
                ["ライン決着率", "同ライン1-2着 / 同ライン1-2-3着を集計し、本線厚め判断に使う。"],
                ["番手差し率", "番手が1着まで抜けるか、2着まで残るかを買い目設計に使う。"],
                ["直近トレンド", "直近5走/10走で調子上げ・調子落ちを見分ける。"],
              ].map(([title, description]) => (
                <article key={title}>
                  <strong>BACKLOG</strong>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </article>
              ))}
            </div>
          </div>
          <div className="ex-empty">POLICY: 未確定指標は推定で補完しません。正確に蓄積できるデータだけをEXACTとして昇格します。</div>
        </section>

        <section className="ex-panel ex-section" hidden={activeSectionTab !== "trend"}>
          <SectionTitle
            eyebrow="EX ANALYSIS INVENTORY"
            title="分析項目マップ / 重複防止"
            lead="これは新しい分析数値の実装ではなく、既存項目・拡張候補・要蓄積・生成禁止項目の棚卸しです。既存セクションへの別名での重複追加を防ぎます。"
          />
          <div className="ex-analysis-inventory-summary" aria-label="分析項目マップ集計">
            <article>
              <span>TOTAL</span>
              <strong>{KURARI_EX_ANALYSIS_INVENTORY.length.toLocaleString("ja-JP")}</strong>
            </article>
            {KURARI_EX_ANALYSIS_INVENTORY_STATUSES.map((status) => (
              <article key={status}>
                <span>{KURARI_EX_ANALYSIS_STATUS_META[status].label}</span>
                <strong>{KURARI_EX_ANALYSIS_INVENTORY_SUMMARY[status].toLocaleString("ja-JP")}</strong>
              </article>
            ))}
          </div>
          <div className="ex-analysis-inventory-legend">
            {KURARI_EX_ANALYSIS_INVENTORY_STATUSES.map((status) => (
              <div key={status}>
                <AnalysisInventoryStatusBadge status={status} />
                <span>{KURARI_EX_ANALYSIS_STATUS_META[status].description}</span>
              </div>
            ))}
          </div>
          <div className="ex-analysis-inventory-categories">
            {KURARI_EX_ANALYSIS_INVENTORY_BY_CATEGORY.map(([category, categoryItems]) => (
              <section className="ex-analysis-inventory-category" key={category}>
                <div className="ex-analysis-inventory-category-head">
                  <h3>{category}</h3>
                  <span>{categoryItems.length.toLocaleString("ja-JP")}項目</span>
                </div>
                <div className="ex-analysis-inventory-grid">
                  {categoryItems.map((inventoryItem) => (
                    <article className="ex-analysis-inventory-item" key={inventoryItem.id}>
                      <div className="ex-analysis-inventory-item-head">
                        <h4>{inventoryItem.label}</h4>
                        <AnalysisInventoryStatusBadge status={inventoryItem.status} />
                      </div>
                      <p>{inventoryItem.note}</p>
                      <div className="ex-analysis-inventory-meta">
                        <div><b>現在地</b>{inventoryItem.currentSection}</div>
                        <div><b>sourceKeys</b>{inventoryItem.sourceKeys.length ? inventoryItem.sourceKeys.join(" / ") : "未蓄積"}</div>
                        <div><b>重複先</b>{inventoryItem.duplicateOf ?? "なし"}</div>
                        <div><b>表示方針</b>{inventoryItem.displayPlan}</div>
                        <div><b>必要データ</b>{inventoryItem.dataRequirement}</div>
                        <div><b>ID</b>{inventoryItem.id}</div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
          <div className="ex-empty">
            POLICY: existing / extend-existing は既存セクションを拡張し、別名の重複実装をしません。
            根拠が未蓄積の項目は future-accumulation、推測するとfakeになる指標は not-generated / fake-prohibited のまま管理します。
          </div>
        </section>

        <section className="ex-panel ex-section" hidden={activeSectionTab !== "trend"}>
          <SectionTitle
            eyebrow="SOURCE CAPABILITY AUDIT"
            title="データ根拠監査 / 生成可能性"
            lead="保存済みJSONに根拠フィールドがあるかを監査した結果です。これは新しい率・指数の生成ではなく、根拠なしの数値を作らないための確認表です。"
          />
          <div className="ex-source-capability-summary" aria-label="データ根拠監査集計">
            <article>
              <span>AUDIT TARGETS</span>
              <strong>{KURARI_EX_SOURCE_CAPABILITY_AUDIT.length.toLocaleString("ja-JP")}</strong>
            </article>
            {KURARI_EX_SOURCE_CAPABILITY_STATUSES.map((status) => (
              <article key={status}>
                <span>{KURARI_EX_SOURCE_CAPABILITY_STATUS_META[status].label}</span>
                <strong>{KURARI_EX_SOURCE_CAPABILITY_AUDIT_SUMMARY[status].toLocaleString("ja-JP")}</strong>
              </article>
            ))}
          </div>
          <div className="ex-source-capability-grid">
            {KURARI_EX_SOURCE_CAPABILITY_FOCUS_ITEMS.map((auditItem) => (
              <article className="ex-source-capability-item" key={auditItem.id}>
                <div className="ex-source-capability-head">
                  <h3>{auditItem.label}</h3>
                  <SourceCapabilityStatusBadge status={auditItem.capabilityStatus} />
                </div>
                <p>{auditItem.implementationNote}</p>
                <div className="ex-source-capability-keys">
                  根拠: {auditItem.confirmedSourceKeys.length ? auditItem.confirmedSourceKeys.join(" / ") : "未蓄積"}
                  {auditItem.missingSourceKeys.length ? ` / 不足: ${auditItem.missingSourceKeys.join(" / ")}` : ""}
                </div>
              </article>
            ))}
          </div>
          <div className="ex-empty">
            AUDIT POLICY: byGrade / byRaceType / 見なし直線 / 同県同乗 / 戦法イベント生データが存在しない状態では、
            推測による成功率・指数・補正値を生成しません。保存済みキーと安全に分類できる範囲だけを利用します。
          </div>
        </section>

        <section className="ex-panel ex-section" hidden={activeSectionTab !== "trend"}>
          <SectionTitle
            eyebrow="AVAILABLE ANALYSIS FOCUS"
            title="実データで使える分析"
            lead="availableと監査済みの保存データを、どの既存セクションで何に使うか整理します。新しい数値は作らず、条件別・役割別・MATCHUPの既存表示へ案内します。"
          />
          <div className="ex-available-focus-summary">
            <strong>{KURARI_EX_AVAILABLE_ANALYSIS_FOCUS.length.toLocaleString("ja-JP")}項目</strong>
            <span>
              {KURARI_EX_AVAILABLE_ANALYSIS_FOCUS.map((item) => item.sourceKey[0]).join(" / ")}
            </span>
          </div>
          <div className="ex-available-focus-grid">
            {KURARI_EX_AVAILABLE_ANALYSIS_FOCUS.map((item) => (
              <AvailableAnalysisFocusCard item={item} key={item.id} />
            ))}
          </div>
          <div className="ex-subsection">
            <div className="ex-eyebrow">PARTIAL / 要注意</div>
            <div className="ex-available-focus-partial">
              {KURARI_EX_PARTIAL_ANALYSIS_FOCUS.map((item) => (
                <AvailableAnalysisFocusCard item={item} key={item.id} />
              ))}
            </div>
          </div>
          <div className="ex-empty">
            SAFE USE: LOW SAMPLEは参考扱いです。byGrade / byRaceTypeはpartialのまま数値化せず、
            見なし直線・同県同乗・競りや戦法イベント成功率などfake-prohibited項目をこのビューへ混ぜません。
          </div>
        </section>

        <section className="ex-panel ex-section" hidden={activeSectionTab !== "trend"}>
          <SectionTitle
            eyebrow="FUTURE ACCUMULATION PLAN"
            title="蓄積設計 / available昇格条件"
            lead="partial・未蓄積・fake禁止項目について、将来何を保存し、どう検証すれば昇格できるかを定義した設計表です。実数値・率・指数・点数ではありません。"
          />
          <div className="ex-future-plan-summary" aria-label="蓄積設計priority集計">
            <article>
              <span>PLAN ITEMS</span>
              <strong>{KURARI_EX_FUTURE_ACCUMULATION_PLAN.length.toLocaleString("ja-JP")}</strong>
            </article>
            {KURARI_EX_FUTURE_PLAN_PRIORITIES.map((priority) => (
              <article key={priority}>
                <span>{KURARI_EX_FUTURE_PLAN_PRIORITY_LABELS[priority]}</span>
                <strong>{KURARI_EX_FUTURE_PLAN_PRIORITY_SUMMARY[priority].toLocaleString("ja-JP")}</strong>
              </article>
            ))}
          </div>
          <div className="ex-future-plan-status-summary" aria-label="蓄積設計currentStatus集計">
            {KURARI_EX_FUTURE_PLAN_CURRENT_STATUSES.map((status) => (
              <span key={status}>
                {FUTURE_PLAN_STATUS_LABELS[status]}: {KURARI_EX_FUTURE_PLAN_STATUS_SUMMARY[status].toLocaleString("ja-JP")}
              </span>
            ))}
          </div>
          {KURARI_EX_FUTURE_PLAN_PRIORITIES.map((priority) => {
            const priorityItems = KURARI_EX_FUTURE_ACCUMULATION_PLAN.filter((item) => item.priority === priority);
            return (
              <div className="ex-future-plan-group" key={priority}>
                <div className="ex-future-plan-group-head">
                  <h3>{KURARI_EX_FUTURE_PLAN_PRIORITY_LABELS[priority]} PRIORITY</h3>
                  <span>{priorityItems.length.toLocaleString("ja-JP")}項目</span>
                </div>
                <div className="ex-future-plan-grid">
                  {priorityItems.map((item) => <FutureAccumulationPlanCard item={item} key={item.id} />)}
                </div>
              </div>
            );
          })}
          <div className="ex-empty">
            DESIGN ONLY: byGrade / byRaceType / 見なし直線 / 同県同乗 / lineSize / position / 戦法イベント / 将来指数は、
            必要な生データと検証条件が揃うまでavailableへ昇格させません。生成スクリプトと数値計算は今回実装していません。
          </div>
        </section>

        <section className="ex-panel ex-section" hidden={activeSectionTab !== "trend"}>
          <SectionTitle
            eyebrow="RAW FIELD SCHEMA PLAN"
            title="生成前スキーマ設計 / RAW FIELD"
            lead="将来の生成処理が保存すべきRAW FIELD、正規化キー、source、validation、fake禁止条件を固定した設計です。これは生成前のスキーマ定義であり、集計値ではありません。"
          />
          <div className="ex-source-schema-summary" aria-label="RAW FIELDスキーマpriority集計">
            <article>
              <span>SCHEMA ITEMS</span>
              <strong>{KURARI_EX_SOURCE_SCHEMA_PLAN.length.toLocaleString("ja-JP")}</strong>
            </article>
            {KURARI_EX_SOURCE_SCHEMA_PRIORITIES.map((priority) => (
              <article key={priority}>
                <span>{priority.toUpperCase()}</span>
                <strong>{KURARI_EX_SOURCE_SCHEMA_PRIORITY_SUMMARY[priority].toLocaleString("ja-JP")}</strong>
              </article>
            ))}
          </div>
          <div className="ex-source-schema-meta-summary" aria-label="RAW FIELDスキーマstatus集計">
            {KURARI_EX_SOURCE_SCHEMA_STATUSES.map((status) => (
              <span key={status}>
                {SOURCE_SCHEMA_STATUS_LABELS[status]}: {KURARI_EX_SOURCE_SCHEMA_STATUS_SUMMARY[status].toLocaleString("ja-JP")}
              </span>
            ))}
          </div>
          <div className="ex-source-schema-meta-summary" aria-label="RAW FIELDスキーマcategory集計">
            {KURARI_EX_SOURCE_SCHEMA_CATEGORIES.map((category) => (
              <span key={category}>
                {category}: {KURARI_EX_SOURCE_SCHEMA_CATEGORY_SUMMARY[category].toLocaleString("ja-JP")}
              </span>
            ))}
          </div>
          {KURARI_EX_SOURCE_SCHEMA_PRIORITIES.map((priority) => {
            const priorityItems = KURARI_EX_SOURCE_SCHEMA_PLAN.filter((item) => item.priority === priority);
            return (
              <div className="ex-source-schema-group" key={priority}>
                <div className="ex-source-schema-group-head">
                  <h3>{priority.toUpperCase()} PRIORITY</h3>
                  <span>{priorityItems.length.toLocaleString("ja-JP")}項目</span>
                </div>
                <div className="ex-source-schema-grid">
                  {priorityItems.map((item) => <SourceSchemaPlanCard item={item} key={item.id} />)}
                </div>
              </div>
            );
          })}
          <div className="ex-empty">
            SCHEMA ONLY: grade / raceType / venueCondition / lineup / position / samePrefecture / tacticEvent / futureIndexの
            RAW保存形式だけを定義しています。既存JSONの変更、生成スクリプト実装、勝率・成功率・指数計算は行っていません。
          </div>
        </section>

        <section className="ex-panel ex-section" hidden={activeSectionTab !== "overview"}>
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

        <section className="ex-panel ex-section" hidden={activeSectionTab !== "overview"}>
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

        <div hidden={activeSectionTab !== "analysis"} style={{ display: activeSectionTab === "analysis" ? "contents" : "none" }}>
        <div className="ex-view-tabs" role="tablist" aria-label="EX表示切替">
          <button className={`ex-view-tab${activeView === "venue" ? " is-active" : ""}`} type="button" role="tab" aria-selected={activeView === "venue"} onClick={() => setActiveView("venue")}>VENUE EX</button>
          <button className={`ex-view-tab${activeView === "player" ? " is-active" : ""}`} type="button" role="tab" aria-selected={activeView === "player"} onClick={() => setActiveView("player")}>PLAYER EX</button>
          <button className={`ex-view-tab${activeView === "matchup" ? " is-active" : ""}`} type="button" role="tab" aria-selected={activeView === "matchup"} onClick={() => setActiveView("matchup")}>MATCHUP EX</button>
        </div>

        <section className="ex-panel ex-section ex-analysis" id="ex-section-analysis" hidden={activeSectionTab !== "analysis"}>
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
                <MetricCard label="RESOLVED RIDERS" value={riderCoverageAuditStatus === "loading" ? "…" : riderCoverageAuditStatus === "error" ? "取得不可" : valueText(riderCoverageAudit?.eligiblePublicRiderCount)} note="audit exact" warning={riderCoverageAuditStatus === "error"} />
                <MetricCard label="未解決選手名" value={riderCoverageAuditStatus === "loading" ? "…" : riderCoverageAuditStatus === "error" ? "取得不可" : valueText(riderCoverageAudit?.unresolvedNameCount)} note={riderCoverageAudit ? valueText(riderCoverageAudit.unresolvedObservationCount) + " observations" : "registration no"} warning={(riderCoverageAudit?.unresolvedNameCount ?? 0) > 0 || riderCoverageAuditStatus === "error"} />
                <MetricCard label="曖昧選手名" value={riderCoverageAuditStatus === "loading" ? "…" : riderCoverageAuditStatus === "error" ? "取得不可" : valueText(riderCoverageAudit?.ambiguousNameCount)} note={riderCoverageAudit ? valueText(riderCoverageAudit.ambiguousObservationCount) + " observations" : "manual check"} warning={(riderCoverageAudit?.ambiguousNameCount ?? 0) > 0 || riderCoverageAuditStatus === "error"} />
                <MetricCard label="登録番号完全R" value={riderCoverageAuditStatus === "loading" ? "…" : riderCoverageAuditStatus === "error" ? "取得不可" : valueText(riderCoverageAudit?.racesWithCompleteRegistrationNo)} note={riderCoverageAudit ? "of " + valueText(riderCoverageAudit.normalizedRaceCount) + " races" : "coverage"} />
                <MetricCard label="PARTIAL" value={riderInitialStatus === "loading" ? "…" : valueText(riderInitialData?.status.qualityCounts.partial)} />
                <MetricCard label="COMPLETE" value={riderInitialStatus === "loading" ? "…" : valueText(riderInitialData?.status.qualityCounts.complete)} />
                <MetricCard label="MAX RIDER JSON" value={riderInitialStatus === "loading" ? "…" : formatBytes(riderInitialData?.status.maxFileBytes)} />
                <MetricCard label="TOTAL RIDER EX" value={riderInitialStatus === "loading" ? "…" : formatBytes(riderInitialData?.status.outputBytes)} />
                <MetricCard label="SHB NAME KEYS" value={shbNameStatus === "loading" ? "…" : valueText(shbNameIndex?.summary.nameKeyCount)} />
                <MetricCard label="SHB COLLISION" value={shbNameStatus === "loading" ? "…" : valueText(shbNameIndex?.summary.sameDateCollisionNameKeyCount)} warning={(shbNameIndex?.summary.sameDateCollisionNameKeyCount ?? 0) > 0} />
              </div>
              {riderCoverageAuditStatus === "error" ? <EmptyState text="RIDER COVERAGE AUDITを取得できませんでした。" /> : null}
              {riderCoverageAudit ? (
                <div className="ex-sample-alert">
                  <strong>RIDER COVERAGE AUDIT / 選手データ網羅率</strong>
                  選手ファイル生成漏れは0件。未解決選手名は登録番号を一意に確認できないため、fake補完せず監査対象として保持しています。
                  {riderCoverageAudit.ambiguousNames.length ? " 曖昧候補: " + riderCoverageAudit.ambiguousNames.map((item) => item.displayName + " [" + (item.candidates ?? []).join(" / ") + "]").join(" / ") : ""}
                  {riderCoverageAudit.topUnresolvedNames.length ? " 未解決上位: " + riderCoverageAudit.topUnresolvedNames.slice(0, 3).map((item) => item.displayName + " " + item.observationCount + "件").join(" / ") : ""}
                </div>
              ) : null}
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
              <div className="ex-muted">
                ラベル基準: 頭候補=勝率20%以上 / 連軸=2連対率40%以上 / 3着保護=3着以内率55%以上 / 確認=通常確認 / 参考=母数少
              </div>
              {riderCategoryAnalysis ? (
                <>
                  <div className="ex-health-grid">
                    <MetricCard label="SOURCE TYPE" value={riderCategoryAnalysis.sourceType} note={riderCategoryAnalysis.sampleUnit} />
                    <MetricCard label="CONFIRMED STARTS" value={valueText(riderCategoryAnalysis.coverage.confirmedStartCount)} />
                    <MetricCard label="READ RIDERS" value={valueText(riderCategoryAnalysis.coverage.riderFilesRead)} />
                    <MetricCard label="SKIPPED" value={valueText(riderCategoryAnalysis.coverage.riderFilesSkipped)} warning={(riderCategoryAnalysis.coverage.riderFilesSkipped ?? 0) > 0} />
                    <MetricCard label="GENERATED AT" value={riderCategoryAnalysis.generatedAt ? new Date(riderCategoryAnalysis.generatedAt).toLocaleString("ja-JP") : "--"} note={getRiderCategoryGeneratedNote(riderCategoryAnalysis.generatedAt)} warning={isRiderCategoryGeneratedStale(riderCategoryAnalysis.generatedAt)} />
                  </div>
                  {isRiderCategoryGeneratedStale(riderCategoryAnalysis.generatedAt) ? (
                    <div className="ex-sample-alert">
                      <strong>UPDATE CHECK / 更新注意</strong>条件別選手分析の生成時刻が古い可能性があります。nightly更新の失敗またはPages反映遅延を確認してください。
                    </div>
                  ) : null}
                  {(() => {
                    const practicalItems = Object.entries(riderCategoryAnalysis.dimensions)
                      .flatMap(([dimensionKey, dimension]) =>
                        dimension.items.map((item) => ({
                          dimensionKey,
                          dimensionLabel: dimension.label,
                          item,
                          useLabel: getRiderCategoryUseLabel(item),
                          useRank: getRiderCategoryUseRank(item),
                        })),
                      )
                      .filter((entry) => entry.useRank <= 3);
                    const practicalGroups = (["頭候補", "連軸", "3着保護"] as const)
                      .map((label) => ({
                        label,
                        items: practicalItems
                          .filter((entry) => entry.useLabel === label)
                          .sort((a, b) => b.item.starts - a.item.starts)
                          .slice(0, 3),
                      }))
                      .filter((group) => group.items.length > 0);
                    return practicalGroups.length ? (
                      <div className="ex-category-grid">
                        {practicalGroups.map((group) => (
                          <article className="ex-category-card" key={group.label}>
                            <h4>実戦候補まとめ / {group.label}</h4>
                            <div className="ex-muted">全カテゴリ横断で、{group.label}を最大3件まで優先表示します。</div>
                            {group.items.map((entry) => (
                              <div className="ex-category-row" key={`${group.label}-${entry.dimensionKey}-${entry.item.key}`}>
                                <span>
                                  {entry.dimensionLabel}: {entry.item.label} / {valueText(entry.item.starts)}走
                                  <span className="ex-badge">{entry.useLabel}</span>
                                </span>
                                <span>
                                  勝 {Number.isFinite(entry.item.winRate) ? `${Number(entry.item.winRate).toFixed(1)}%` : "--"} / 2連 {Number.isFinite(entry.item.top2Rate) ? `${Number(entry.item.top2Rate).toFixed(1)}%` : "--"} / 3内 {Number.isFinite(entry.item.top3Rate) ? `${Number(entry.item.top3Rate).toFixed(1)}%` : "--"}
                                </span>
                              </div>
                            ))}
                          </article>
                        ))}
                      </div>
                    ) : null;
                  })()}
                  <div className="ex-category-grid">
                    {Object.entries(riderCategoryAnalysis.dimensions).map(([dimensionKey, dimension]) => (
                      <article className="ex-category-card" key={dimensionKey}>
                        <h4>{dimension.label}</h4>
                        <div className="ex-muted">
                          頭候補 {dimension.items.filter((item) => getRiderCategoryUseLabel(item) === "頭候補").length} / 連軸 {dimension.items.filter((item) => getRiderCategoryUseLabel(item) === "連軸").length} / 3着保護 {dimension.items.filter((item) => getRiderCategoryUseLabel(item) === "3着保護").length}
                        </div>
                        {[...dimension.items].sort((a, b) => getRiderCategoryUseRank(a) - getRiderCategoryUseRank(b) || b.starts - a.starts).slice(0, 6).map((item) => (
                          <div className="ex-category-row" key={item.key}>
                            <span>
                              {item.label} / {valueText(item.starts)}走 {item.quality === "low-sample" ? <span className="ex-low-sample">母数少</span> : null}
                              <span className="ex-badge">{getRiderCategoryUseLabel(item)}</span>
                            </span>
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

        </div>

        <details className="ex-panel ex-section ex-raw" hidden={activeSectionTab !== "coverage"}>
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
