import { loadKurariExHistoricalResultTrendLabHistory } from "./kurariExHistoricalResultLab";
import type {
  KurariExHistoricalAvailabilitySummary,
  KurariExHistoricalRace,
} from "../types/kurariExHistoricalResult";

export type KurariExTrendSampleStatus = "low-sample" | "caution" | "usable";

export type KurariExTrendRankingRow = {
  key: string;
  label: string;
  count: number;
  rate: number;
};

export type KurariExTrendCarTop3Row = KurariExTrendRankingRow & {
  eligibleStarts: number;
};

export type KurariExTrifectaRankingSegmentSampleStatus = "strong" | "medium" | "weak";

export type KurariExTrifectaRaceClassKey = "s-class" | "a-class" | "l-class";

export type KurariExTrifectaRankingSegment = {
  key: string;
  label: string;
  segmentKey: string;
  segmentLabel: string;
  venueCode?: string;
  venueName?: string;
  raceClass?: KurariExTrifectaRaceClassKey;
  sampleSize: number;
  sampleStatus: KurariExTrifectaRankingSegmentSampleStatus;
  topTrifectaResults: KurariExTrendRankingRow[];
  firstCarRanking: KurariExTrendRankingRow[];
  secondCarRanking: KurariExTrendRankingRow[];
  thirdCarRanking: KurariExTrendRankingRow[];
  quinellaLikeTopPairs: KurariExTrendRankingRow[];
};

export type KurariExTrendFilterReadiness = {
  key: "all" | "7-car" | "9-car" | "a-class" | "s-class" | "g-race" | "venue" | "race-number";
  label: string;
  status: "ready" | "partial" | "future-accumulation";
  note: string;
};

export type KurariExTurbulenceCategoryKey =
  | "firm"
  | "mid-upset"
  | "upset"
  | "major-upset"
  | "extreme-upset";

export type KurariExTurbulenceCategory = {
  key: KurariExTurbulenceCategoryKey;
  label: string;
  count: number;
  rate: number;
  rangeLabel: string;
};

export type KurariExTurbulenceBreakdownRow = {
  key: string;
  label: string;
  sampleSize: number;
  sampleStatus: KurariExTrendSampleStatus;
  sampleLabel: string;
  averagePayoutYen: number;
  medianPayoutYen: number;
  maxPayoutYen: number;
  categories: KurariExTurbulenceCategory[];
};

export type KurariExTurbulenceSegmentSampleStatus = "strong" | "medium" | "weak";

export type KurariExTurbulenceSegment = {
  key: string;
  label: string;
  venueCode: string;
  venueName: string;
  segmentKey: string;
  segmentLabel: string;
  sampleSize: number;
  sampleStatus: KurariExTurbulenceSegmentSampleStatus;
  averageTrifectaPayoutYen: number;
  medianTrifectaPayoutYen: number;
  highPayoutRate: number;
  veryHighPayoutRate: number;
  ultraHighPayoutRate: number;
  maxTrifectaPayoutYen: number;
};

export type KurariExTurbulenceV1 = {
  status: "ready" | "no-eligible-data";
  sourcePolicy: "official result only";
  basis: "actual trifecta payout";
  oddsGapStatus: "future-accumulation";
  totalRaceCount: number;
  eligibleRaceCount: number;
  excludedRaceCount: number;
  exclusionReasons: Array<{ key: string; label: string; count: number }>;
  sampleStatus: KurariExTrendSampleStatus;
  sampleLabel: string;
  averagePayoutYen: number | null;
  medianPayoutYen: number | null;
  maxPayoutYen: number | null;
  categories: KurariExTurbulenceCategory[];
  highestPayoutRace: {
    date: string;
    venueCode: string;
    venueName: string;
    raceNumber: number;
    grade: string;
    combination: string;
    payoutYen: number;
  } | null;
  byRaceNumber: KurariExTurbulenceBreakdownRow[];
  byVenue: KurariExTurbulenceBreakdownRow[];
  byGrade: KurariExTurbulenceBreakdownRow[];
  byVenueRaceBand: KurariExTurbulenceSegment[];
  byVenueCarCount: KurariExTurbulenceSegment[];
  classGradeReadiness: Array<{
    key: "a-class" | "s-class" | "g-race";
    label: string;
    status: "partial" | "future-accumulation";
    note: string;
  }>;
};

export type KurariExRaceChainTypeKey =
  | "favorite-return"
  | "upset-chain"
  | "mid-upset-continues"
  | "upset-acceleration"
  | "firm-continues"
  | "other";

export type KurariExRaceChainSegmentSampleStatus = "strong" | "medium" | "weak";

export type KurariExRaceChainSegment = {
  key: string;
  label: string;
  venueCode: string;
  venueName: string;
  segmentKey: string;
  segmentLabel: string;
  sampleSize: number;
  sampleStatus: KurariExRaceChainSegmentSampleStatus;
  favoriteReturnRate: number;
  turbulenceContinueRate: number;
  middleContinueRate: number;
  turbulenceAccelerationRate: number;
  averageNextPayoutYen: number;
  highNextPayoutRate: number;
};

export type KurariExRaceChainV1 = {
  status: "ready" | "no-eligible-data";
  sourcePolicy: "official result only";
  eligiblePairCount: number;
  excludedPairCount: number;
  transitionCandidateCount: number;
  exclusionReasons: Array<{ key: string; label: string; count: number }>;
  sampleStatus: KurariExTrendSampleStatus;
  sampleLabel: string;
  chainTypes: Array<{
    key: KurariExRaceChainTypeKey;
    label: string;
    count: number;
    rate: number;
  }>;
  transitionMatrix: Array<{
    previousCategory: KurariExTurbulenceCategoryKey;
    previousLabel: string;
    nextCategory: KurariExTurbulenceCategoryKey;
    nextLabel: string;
    count: number;
    rate: number;
  }>;
  afterUpset: {
    sampleSize: number;
    favoriteReturnCount: number;
    favoriteReturnRate: number;
    upsetChainCount: number;
    upsetChainRate: number;
  };
  byVenue: KurariExRaceChainSegment[];
  byVenueRaceBand: KurariExRaceChainSegment[];
  examples: Array<{
    date: string;
    venueCode: string;
    venueName: string;
    previousRaceNumber: number;
    nextRaceNumber: number;
    previousCategory: KurariExTurbulenceCategoryKey;
    previousCategoryLabel: string;
    nextCategory: KurariExTurbulenceCategoryKey;
    nextCategoryLabel: string;
    previousPayoutYen: number;
    nextPayoutYen: number;
    chainType: KurariExRaceChainTypeKey;
    chainTypeLabel: string;
  }>;
};

export type KurariExWindBucketKey = "0-1m" | "1-3m" | "3-5m" | "5m-plus";
export type KurariExDecisionMethodKey = "escape" | "sprint" | "difference" | "mark";

export type KurariExWindDecisionSegmentSampleStatus = "strong" | "medium" | "weak";

export type KurariExWindDecisionSegment = {
  key: string;
  label: string;
  venueCode: string;
  venueName: string;
  windBucket: KurariExWindBucketKey;
  windBucketLabel: string;
  sampleSize: number;
  sampleStatus: KurariExWindDecisionSegmentSampleStatus;
  escapeRate: number;
  sprintRate: number;
  pursuitRate: number;
  highPayoutRate: number;
  averageTrifectaPayoutYen: number;
  medianTrifectaPayoutYen: number;
};

export type KurariExWindDecisionV1 = {
  status: "ready" | "no-eligible-data";
  sourcePolicy: "official result only";
  totalRaceCount: number;
  eligibleRaceCount: number;
  excludedRaceCount: number;
  exclusionReasons: Array<{ key: string; label: string; count: number }>;
  sampleStatus: KurariExTrendSampleStatus;
  sampleLabel: string;
  mostCommonWindBucket: { key: KurariExWindBucketKey; label: string; count: number } | null;
  mostCommonDecisionMethod: { key: KurariExDecisionMethodKey; label: string; count: number } | null;
  windBuckets: Array<{
    key: KurariExWindBucketKey;
    label: string;
    count: number;
    rate: number;
  }>;
  decisionMethods: Array<{
    key: KurariExDecisionMethodKey;
    label: string;
    count: number;
    rate: number;
  }>;
  matrix: Array<{
    windBucket: KurariExWindBucketKey;
    windBucketLabel: string;
    decisionMethod: KurariExDecisionMethodKey;
    decisionMethodLabel: string;
    count: number;
    rateWithinBucket: number;
  }>;
  byVenue: Array<{
    venueCode: string;
    venueName: string;
    sampleSize: number;
    sampleStatus: KurariExTrendSampleStatus;
    sampleLabel: string;
    leadingWindBucketLabel: string;
    leadingDecisionMethodLabel: string;
    matrix: Array<{
      windBucketLabel: string;
      decisionMethodLabel: string;
      count: number;
      rateWithinVenue: number;
    }>;
  }>;
  byVenueWindBucket: KurariExWindDecisionSegment[];
  examples: Array<{
    raceKey: string;
    date: string;
    venueName: string;
    raceNumber: number;
    windSpeedMps: number;
    windBucketLabel: string;
    decisionMethodLabel: string;
  }>;
  classReadiness: {
    status: "future-accumulation";
    note: string;
  };
};

export type KurariExVenueBiasMetrics = {
  sampleSize: number;
  decisionEligibleCount: number;
  oneCarEligibleCount: number;
  innerFrameRate: number;
  outsideInvolvementRate: number;
  oneCarOutRate: number;
  escapeRate: number;
  sprintRate: number;
  averageTrifectaPayoutYen: number | null;
  highPayoutRate: number;
};

export type KurariExVenueBiasSegmentSampleStatus = "strong" | "medium" | "weak";

export type KurariExVenueBiasSegment = KurariExVenueBiasMetrics & {
  key: string;
  label: string;
  venueCode: string;
  venueName: string;
  segmentKey: string;
  segmentLabel: string;
  sampleStatus: KurariExVenueBiasSegmentSampleStatus;
};

export type KurariExVenueBiasV1 = {
  status: "ready" | "no-eligible-data";
  sourcePolicy: "official result only";
  totalRaceCount: number;
  eligibleRaceCount: number;
  excludedRaceCount: number;
  exclusionReasons: Array<{ key: string; label: string; count: number }>;
  decisionExclusionReasons: Array<{ key: string; label: string; count: number }>;
  sampleStatus: KurariExTrendSampleStatus;
  sampleLabel: string;
  venueCount: number;
  overall: KurariExVenueBiasMetrics;
  highestOutsideInvolvementVenue: { venueName: string; rate: number } | null;
  highestAveragePayoutVenue: { venueName: string; averagePayoutYen: number } | null;
  byVenue: Array<KurariExVenueBiasMetrics & {
    venueCode: string;
    venueName: string;
    sampleStatus: KurariExTrendSampleStatus;
    sampleLabel: string;
    featureLabels: string[];
  }>;
  byVenueCarCount: KurariExVenueBiasSegment[];
  byVenueRaceBand: KurariExVenueBiasSegment[];
  byVenueGrade: KurariExVenueBiasSegment[];
  examples: Array<{
    raceKey: string;
    date: string;
    venueName: string;
    raceNumber: number;
    combination: string;
    payoutYen: number;
    decisionMethodLabel: string;
    featureReason: string;
  }>;
  refinement: {
    status: "partial";
    note: string;
  };
};

export type KurariExTodayFlowMetrics = {
  sampleSize: number;
  firmRate: number;
  midUpsetRate: number;
  upsetOrAboveRate: number;
  outsideInvolvementRate: number;
  oneCarOutRate: number;
  averageTrifectaPayoutYen: number | null;
  medianTrifectaPayoutYen: number | null;
  highPayoutRate: number;
  veryHighPayoutRate: number;
  ultraHighPayoutRate: number;
};

export type KurariExTodayFlowBaselineDiffLabel = "above" | "near" | "below";

export type KurariExTodayFlowBaselineComparison = {
  key:
    | "highPayoutRate"
    | "veryHighPayoutRate"
    | "ultraHighPayoutRate"
    | "outsideInvolvementRate"
    | "oneCarOutRate"
    | "averageTrifectaPayoutYen"
    | "medianTrifectaPayoutYen";
  label: string;
  metricType: "rate" | "payout";
  todayValue: number | null;
  baselineValue: number | null;
  diff: number | null;
  diffLabel: KurariExTodayFlowBaselineDiffLabel | "unavailable";
};

export type KurariExTodayFlowAttentionSignKey =
  | "high-payout-caution"
  | "very-high-payout-caution"
  | "outside-involvement-caution"
  | "one-car-out-caution"
  | "average-payout-above"
  | "average-payout-below"
  | "near-baseline";

export type KurariExTodayFlowAttentionSign = {
  key: KurariExTodayFlowAttentionSignKey;
  label: string;
  tone: "caution" | "ready" | "partial";
  metricKey: KurariExTodayFlowBaselineComparison["key"] | "summary";
  metricLabel: string;
  metricType: KurariExTodayFlowBaselineComparison["metricType"] | "summary";
  todayValue: number | null;
  baselineValue: number | null;
  diffLabel: KurariExTodayFlowBaselineComparison["diffLabel"] | "summary";
  note: string;
};

export type KurariExTodayFlowTransitionKey =
  | "favorite-return"
  | "upset-acceleration"
  | "mid-upset-repeat"
  | "firm-continues"
  | "upset-chain";

export type KurariExTodayFlowExclusionCategoryKey =
  | "not-confirmed"
  | "dead-heat"
  | "refund-no-trifecta"
  | "missing-payout"
  | "validation-mismatch"
  | "other";

export type KurariExTodayFlowV1 = {
  status: "ready" | "no-eligible-data";
  sourcePolicy: "official result only";
  targetDate: string;
  isToday: boolean;
  dateBasisLabel: "today" | "最新取得日ベース" | "unavailable";
  totalRaceCount: number;
  eligibleRaceCount: number;
  excludedRaceCount: number;
  exclusionReasons: Array<{ key: string; label: string; count: number }>;
  exclusionBreakdown: Array<{ key: KurariExTodayFlowExclusionCategoryKey; label: string; count: number }>;
  venueCount: number;
  sampleStatus: KurariExTrendSampleStatus;
  sampleLabel: string;
  dominantFlowLabel: string;
  cautionLabels: string[];
  overall: KurariExTodayFlowMetrics;
  baseline: {
    status: "ready" | "unavailable";
    label: "historical 60日 trendEligible";
    sampleSize: number;
    comparisons: KurariExTodayFlowBaselineComparison[];
  };
  attentionSigns: KurariExTodayFlowAttentionSign[];
  attentionSampleCaution: {
    enabled: boolean;
    label: string;
    note: string;
  };
  transitionHints: Array<{
    key: KurariExTodayFlowTransitionKey;
    label: string;
    count: number;
  }>;
  byVenue: Array<KurariExTodayFlowMetrics & {
    venueCode: string;
    venueName: string;
    sampleStatus: KurariExTrendSampleStatus;
    sampleLabel: string;
    currentFlowLabel: string;
    latestConfirmedRaceNumber: number | null;
    recentRaces: Array<{
      raceNumber: number;
      categoryLabel: string;
      payoutYen: number;
      combination: string;
    }>;
  }>;
  refinement: {
    status: "future-accumulation";
    note: string;
  };
};

export type KurariExPredictionSignal = {
  key: string;
  label: string;
  source: "turbulence" | "venue-bias" | "ranking" | "today-flow" | "race-chain" | "weather" | "sample" | "source";
  note: string;
  sampleStatus?: "strong" | "medium" | "weak" | KurariExTrendSampleStatus;
  sampleSize?: number;
  tone: "primary" | "caution" | "sample" | "source";
};

export type KurariExPredictionSignals = {
  primarySignals: KurariExPredictionSignal[];
  cautionSignals: KurariExPredictionSignal[];
  sampleWarnings: KurariExPredictionSignal[];
  conflictNotes: KurariExPredictionSignal[];
  sourcePolicy: {
    label: "official result only / fake補完なし / trendEligibleのみ";
    items: string[];
  };
};

export type KurariExCoverageStatus =
  | "implemented"
  | "partial"
  | "future-accumulation"
  | "unavailable"
  | "not-published";

export type KurariExPredictionStructureItem = {
  id: string;
  label: string;
  status: KurariExCoverageStatus;
  existingTabs: string[];
  requiredSources: string[];
  backfillPlan: string;
  fakeProhibition: string;
  backfillTarget: boolean;
};

export const KURARI_EX_PREDICTION_STRUCTURE_ITEMS: KurariExPredictionStructureItem[] = [
  {
    id: "decision-method-total",
    label: "決まり手の総合計（1着 / 2着）",
    status: "partial",
    existingTabs: ["WEATHER", "会場クセ"],
    requiredSources: ["1着決まり手", "2着決まり手", "source取得日時", "provenance"],
    backfillPlan: "1着は既存タブで確認。2着決まり手sourceを2か月backfill後に再検証",
    fakeProhibition: "着順や3連単から2着決まり手を推測しない",
    backfillTarget: true,
  },
  {
    id: "decision-by-category",
    label: "決まり手 × カテゴリ（1着 / 2着）",
    status: "not-published",
    existingTabs: [],
    requiredSources: ["raceClass", "grade", "carCount", "timeBand", "1着 / 2着決まり手"],
    backfillPlan: "カテゴリsource contract確立後に8カテゴリを再検証",
    fakeProhibition: "開催時刻やgradeから級班・車立てを推測分類しない",
    backfillTarget: true,
  },
  {
    id: "wind-vector-decision",
    label: "風向ベクトル × 決まり手",
    status: "future-accumulation",
    existingTabs: ["WEATHER（風速のみ）"],
    requiredSources: ["風向", "バック基準方向", "決まり手", "provenance"],
    backfillPlan: "バック基準ルールとofficial風向sourceを整備後に再検証",
    fakeProhibition: "風向を会場形状や天候から推測しない",
    backfillTarget: true,
  },
  {
    id: "wind-band-decision-payout",
    label: "風速帯 × 決まり手 ＆ 平均配当",
    status: "partial",
    existingTabs: ["WEATHER", "荒れ指数", "会場クセ"],
    requiredSources: ["風速", "決まり手", "3連単払戻", "長期provenance"],
    backfillPlan: "別bucket再集計と配当結合はbackfill後のfuture refinement",
    fakeProhibition: "既存数値を別bucketへ按分・補間しない",
    backfillTarget: true,
  },
  {
    id: "line-shape-hit",
    label: "並び形 × ヒット構造",
    status: "future-accumulation",
    existingTabs: [],
    requiredSources: ["構造化された並び", "ラインID", "コマ数", "provenance"],
    backfillPlan: "source-backed並び構造を蓄積後に再検証",
    fakeProhibition: "地区・選手名・脚質からライン形やコマ数を推測しない",
    backfillTarget: true,
  },
  {
    id: "payout-band-category",
    label: "配当帯 × カテゴリ",
    status: "not-published",
    existingTabs: ["荒れ指数", "今日の流れ"],
    requiredSources: ["3連単払戻", "raceClass", "grade", "carCount", "timeBand"],
    backfillPlan: "配当帯定義とカテゴリsource確立後のfuture refinement",
    fakeProhibition: "既存の荒れカテゴリをカテゴリ別分析としてコピーしない",
    backfillTarget: true,
  },
  {
    id: "sb-second-optimization",
    label: "SB有無 × 2着の最適化",
    status: "future-accumulation",
    existingTabs: [],
    requiredSources: ["B/SB", "2着決まり手", "2着車番", "provenance"],
    backfillPlan: "official B/SBと2着sourceの安定取得後に再検証",
    fakeProhibition: "逃げ決まり手からSBや2着最適化を推測しない",
    backfillTarget: true,
  },
  {
    id: "trifecta-ranking-grade",
    label: "3連単 出目ランキング（グレード別）",
    status: "not-published",
    existingTabs: ["出目ランキング"],
    requiredSources: ["raceClass", "grade", "carCount", "3連単結果"],
    backfillPlan: "A級 / S級 / Gレースのsource-backed分類後に再検証",
    fakeProhibition: "F1/F2等からA級 / S級を推測しない",
    backfillTarget: true,
  },
  {
    id: "favorite-rank-pattern",
    label: "1番人気の着順 or 飛びパターン",
    status: "future-accumulation",
    existingTabs: [],
    requiredSources: ["人気順", "締切前オッズ", "オッズ変動", "確定着順"],
    backfillPlan: "締切前official odds contract確立後に再検証",
    fakeProhibition: "1番車と1番人気を混同せず、体感人気を作らない",
    backfillTarget: true,
  },
  {
    id: "line-size-advantage",
    label: "ライン構成（コマ数）有利・不利",
    status: "not-published",
    existingTabs: [],
    requiredSources: ["構造化された並び", "ラインID", "コマ数", "結果"],
    backfillPlan: "source-backedライン構成蓄積後に再検証",
    fakeProhibition: "地区・選手名からライン構成や有利不利を推測しない",
    backfillTarget: true,
  },
  {
    id: "b-rider-survival",
    label: "Bを取った選手が残ったか",
    status: "future-accumulation",
    existingTabs: [],
    requiredSources: ["B選手", "最終着順", "race key", "provenance"],
    backfillPlan: "official B選手sourceの安定取得後に再検証",
    fakeProhibition: "逃げ決まり手や着順からB選手を推測しない",
    backfillTarget: true,
  },
];

export const KURARI_EX_STRUCTURE_CATEGORIES = [
  "モーニング（A級 7車）",
  "デイ（A級 7車）",
  "デイ（S級 7車）",
  "ナイター（A級 7車）",
  "ナイター（S級 7車）",
  "ミッドナイト（A級 7車）",
  "ミッドナイト（S級 7車）",
  "Gレース（S級 9車）",
] as const;

export const KURARI_EX_STRUCTURE_CATEGORY_COLUMNS: Array<{
  key: string;
  label: string;
  status: KurariExCoverageStatus;
}> = [
  { key: "decision", label: "決まり手", status: "not-published" },
  { key: "wind-direction", label: "風向", status: "future-accumulation" },
  { key: "wind-band", label: "風速帯", status: "partial" },
  { key: "payout-band", label: "配当帯", status: "not-published" },
  { key: "sb-b", label: "SB/B", status: "future-accumulation" },
  { key: "popularity", label: "人気順", status: "future-accumulation" },
  { key: "line", label: "ライン構成", status: "future-accumulation" },
  { key: "trifecta-grade", label: "出目グレード別", status: "not-published" },
];

export const KURARI_EX_EXISTING_TAB_MAP = [
  { tab: "出目ランキング", coverage: "3連単 / 1〜3着車番 / 車番別3着内率" },
  { tab: "荒れ指数", coverage: "配当カテゴリ / 平均・中央値・最大 / R・会場・G別" },
  { tab: "レース連鎖", coverage: "本命戻り / 波乱加速 / 荒れ連鎖 / 中穴・堅め継続" },
  { tab: "WEATHER", coverage: "風速bucket / 決まり手 / matrix / 会場別" },
  { tab: "会場クセ", coverage: "内外枠 / 1番車 / 逃げ・捲り / 配当" },
  { tab: "今日の流れ", coverage: "最新結果日 / 会場別直近R / transition" },
  { tab: "EX ANALYSIS", coverage: "会場 / 選手 / 対戦 / 条件 / 役割 / SHB / recommendation" },
];

export const KURARI_EX_BACKFILL_CHECKLIST: Array<{
  source: string;
  status: KurariExCoverageStatus;
}> = [
  { source: "confirmed official result", status: "implemented" },
  { source: "3連単払戻", status: "implemented" },
  { source: "1〜3着車番", status: "implemented" },
  { source: "決まり手", status: "partial" },
  { source: "風速", status: "partial" },
  { source: "風向", status: "future-accumulation" },
  { source: "raceClass", status: "future-accumulation" },
  { source: "grade", status: "partial" },
  { source: "carCount", status: "partial" },
  { source: "timeBand", status: "future-accumulation" },
  { source: "B/SB", status: "future-accumulation" },
  { source: "並び構造", status: "future-accumulation" },
  { source: "人気順", status: "future-accumulation" },
  { source: "締切前オッズ", status: "future-accumulation" },
  { source: "オッズ変動", status: "future-accumulation" },
  { source: "source取得日時", status: "implemented" },
  { source: "provenance", status: "partial" },
];

export const KURARI_EX_PREDICTION_STRUCTURE_SUMMARY = {
  coveredByExistingTabs: KURARI_EX_PREDICTION_STRUCTURE_ITEMS.filter((item) => item.existingTabs.length > 0).length,
  futureAccumulation: KURARI_EX_PREDICTION_STRUCTURE_ITEMS.filter((item) => item.status === "future-accumulation").length,
  unavailable: KURARI_EX_PREDICTION_STRUCTURE_ITEMS.filter((item) => item.status === "unavailable").length,
  backfillTargets: KURARI_EX_PREDICTION_STRUCTURE_ITEMS.filter((item) => item.backfillTarget).length,
  sourceNeeded: KURARI_EX_PREDICTION_STRUCTURE_ITEMS.filter((item) => item.requiredSources.length > 0).length,
};

export type KurariExTrifectaTrendV1 = {
  status: "ready" | "no-eligible-data";
  sourcePolicy: "official result only";
  sourceName: string;
  sourceFetchedAt: string;
  sourceDate: string;
  sourceSummary?: {
    label: "historical 60日 + current";
    historical: KurariExHistoricalAvailabilitySummary;
    sourceRejectedCount: number;
    refundNoTrifectaExcludedCount: number;
    notFinalizedExcludedCount: number;
    currentRaceCount: number;
    currentIncludedRaceCount: number;
    currentExcludedRaceCount: number;
    crossSourceDuplicateCount: number;
    analysisRaceCount: number;
  };
  totalRaceCount: number;
  eligibleRaceCount: number;
  excludedRaceCount: number;
  exclusionReasons: Array<{ key: string; label: string; count: number }>;
  sampleStatus: KurariExTrendSampleStatus;
  sampleLabel: string;
  trifectaRanking: KurariExTrendRankingRow[];
  firstCarRanking: KurariExTrendRankingRow[];
  secondCarRanking: KurariExTrendRankingRow[];
  thirdCarRanking: KurariExTrendRankingRow[];
  carTop3RateRanking: KurariExTrendCarTop3Row[];
  filterReadiness: KurariExTrendFilterReadiness[];
  rankingSegments: {
    byVenue: KurariExTrifectaRankingSegment[];
    byRaceClass: KurariExTrifectaRankingSegment[];
    byVenueRaceClass: KurariExTrifectaRankingSegment[];
    raceClassSummary: {
      sourceBackedCount: number;
      unknownCount: number;
      sClassCount: number;
      aClassCount: number;
      lClassCount: number;
    };
  };
  turbulence: KurariExTurbulenceV1;
  chain: KurariExRaceChainV1;
  weather: KurariExWindDecisionV1;
  venueBias: KurariExVenueBiasV1;
  todayFlow: KurariExTodayFlowV1;
  predictionSignals: KurariExPredictionSignals;
};

type OfficialFinishRow = {
  rank?: unknown;
  carNo?: unknown;
  kimarite?: unknown;
};

type OfficialResultRace = {
  raceNumber?: unknown;
  resultStatus?: unknown;
  operationStatus?: unknown;
  finishOrder?: OfficialFinishRow[];
  kimarite?: unknown;
  secondKimarite?: unknown;
  bLeaderCarNo?: unknown;
  carCount?: unknown;
  raceClass?: unknown;
  weatherActual?: {
    condition?: unknown;
    windSpeedMps?: unknown;
  } | null;
  payout3tan?: {
    combination?: unknown;
    payoutYen?: unknown;
  } | null;
};

type OfficialResultVenue = {
  date?: unknown;
  venueCode?: unknown;
  venueName?: unknown;
  grade?: unknown;
  races?: OfficialResultRace[];
};

type OfficialResultFeed = {
  date?: unknown;
  generatedAt?: unknown;
  source?: {
    provider?: unknown;
    listType?: unknown;
  };
  venues?: OfficialResultVenue[];
};

const RESULT_FEED_PATH = "/data/races/keirin-jp-results.generated.json";

const EXCLUSION_LABELS: Record<string, string> = {
  "source-unavailable": "official sourceまたはsource取得日時が未取得",
  "race-key-missing": "date / venueCode / Rから一意race keyを作れない",
  "duplicate-race-key": "同一race keyが重複",
  "cancelled-or-no-race": "cancelled / no race",
  "not-confirmed": "resultStatusがconfirmedではない",
  "finish-order-missing": "1〜3着車番が不足",
  "invalid-car-number": "車番が1〜9の整数ではない、または上位3車が重複",
  "trifecta-missing-or-mismatch": "3連単結果が未取得、または1〜3着車番と不一致",
  "payout-missing-or-invalid": "3連単払戻金が欠損、不正、または0円以下",
};

const TURBULENCE_CATEGORY_DEFINITIONS: Array<{
  key: KurariExTurbulenceCategoryKey;
  label: string;
  min: number;
  max: number | null;
  rangeLabel: string;
}> = [
  { key: "firm", label: "堅め", min: 1, max: 2_999, rangeLabel: "1〜2,999円" },
  { key: "mid-upset", label: "中穴", min: 3_000, max: 9_999, rangeLabel: "3,000〜9,999円" },
  { key: "upset", label: "荒れ", min: 10_000, max: 29_999, rangeLabel: "10,000〜29,999円" },
  { key: "major-upset", label: "大荒れ", min: 30_000, max: 99_999, rangeLabel: "30,000〜99,999円" },
  { key: "extreme-upset", label: "超荒れ", min: 100_000, max: null, rangeLabel: "100,000円以上" },
];

const CHAIN_TYPE_LABELS: Record<KurariExRaceChainTypeKey, string> = {
  "favorite-return": "本命戻り",
  "upset-chain": "荒れ連鎖",
  "mid-upset-continues": "中穴継続",
  "upset-acceleration": "波乱加速",
  "firm-continues": "堅め継続",
  other: "その他",
};

const CHAIN_EXCLUSION_LABELS: Record<string, string> = {
  "date-or-venue-unavailable": "dateまたはvenueCodeが未取得",
  "race-number-missing": "raceNumberが未取得・不正",
  "race-number-not-contiguous": "前Rと次Rが連続していない",
  "duplicate-race-key": "同一race keyが重複",
  "source-unavailable": "official source条件を満たさない",
  "not-confirmed": "前後いずれかがconfirmedではない",
  "cancelled-or-no-race": "前後いずれかがcancelled / no race",
  "payout-or-category-unavailable": "前後いずれかの3連単払戻金・荒れカテゴリが未取得",
  "race-result-unavailable": "前後いずれかの着順・3連単結果が不正または未取得",
};

const WIND_BUCKETS: Array<{
  key: KurariExWindBucketKey;
  label: string;
  includes: (windSpeedMps: number) => boolean;
}> = [
  { key: "0-1m", label: "0〜1m", includes: (value) => value >= 0 && value < 1 },
  { key: "1-3m", label: "1〜3m", includes: (value) => value >= 1 && value < 3 },
  { key: "3-5m", label: "3〜5m", includes: (value) => value >= 3 && value < 5 },
  { key: "5m-plus", label: "5m以上", includes: (value) => value >= 5 },
];

const DECISION_METHODS: Array<{ key: KurariExDecisionMethodKey; label: string }> = [
  { key: "escape", label: "逃げ" },
  { key: "sprint", label: "捲り" },
  { key: "difference", label: "差し" },
  { key: "mark", label: "マーク" },
];

const DECISION_ALIASES = new Map<string, KurariExDecisionMethodKey>([
  ["逃", "escape"],
  ["逃げ", "escape"],
  ["捲", "sprint"],
  ["捲り", "sprint"],
  ["差", "difference"],
  ["差し", "difference"],
  ["マ", "mark"],
  ["マーク", "mark"],
]);

const VENUE_BIAS_FEATURE_THRESHOLDS = {
  innerFrameRate: 35,
  outsideInvolvementRate: 70,
  oneCarOutRate: 60,
  escapeRate: 25,
  sprintRate: 35,
  averageTrifectaPayoutYen: 20_000,
  highPayoutRate: 25,
} as const;

const VENUE_BIAS_EXCLUSION_LABELS: Record<string, string> = {
  "source-unavailable": "official source / provenanceを確認できない",
  "race-key-missing": "date / venue / raceNumberから一意race keyを作れない",
  "duplicate-race-key": "同一race keyが重複",
  "cancelled-or-no-race": "cancelled / no race",
  "not-confirmed": "resultStatusがconfirmedではない",
  "finish-order-missing": "1〜3着車番が不足",
  "invalid-car-number": "1〜3着車番が不正または重複",
  "trifecta-missing-or-mismatch": "3連単結果が未取得、または1〜3着車番と不一致",
  "payout-missing-or-invalid": "3連単払戻金が欠損、不正、または0円以下",
};

const TODAY_FLOW_LABEL_THRESHOLDS = {
  firmRate: 45,
  firmAveragePayoutYen: 10_000,
  firmHighPayoutRate: 20,
  upsetOrAboveRate: 30,
  upsetAveragePayoutYen: 20_000,
  upsetHighPayoutRate: 30,
  midUpsetRate: 35,
  outsideInvolvementRate: 70,
  oneCarOutRate: 55,
} as const;

const TODAY_FLOW_TRANSITION_LABELS: Record<KurariExTodayFlowTransitionKey, string> = {
  "favorite-return": "本命戻り",
  "upset-acceleration": "波乱加速",
  "mid-upset-repeat": "中穴反復",
  "firm-continues": "堅め継続",
  "upset-chain": "荒れ連鎖",
};

const TODAY_FLOW_EXCLUSION_CATEGORY_LABELS: Record<KurariExTodayFlowExclusionCategoryKey, string> = {
  "not-confirmed": "未確定",
  "dead-heat": "同着",
  "refund-no-trifecta": "全返還・3連単なし",
  "missing-payout": "払戻欠損",
  "validation-mismatch": "検証不一致",
  other: "その他",
};

function todayFlowExclusionCategory(reason: string): KurariExTodayFlowExclusionCategoryKey {
  if (reason === "not-confirmed") return "not-confirmed";
  if (reason === "payout-missing-or-invalid") return "missing-payout";
  if (reason === "trifecta-missing-or-mismatch") return "refund-no-trifecta";
  if (reason === "finish-order-missing" || reason === "invalid-car-number" || reason === "duplicate-race-key") {
    return "validation-mismatch";
  }
  return "other";
}

function isStrongEnoughSample(status: "strong" | "medium" | "weak") {
  return status === "strong" || status === "medium";
}

const WEATHER_EXCLUSION_LABELS: Record<string, string> = {
  "source-unavailable": "official source / provenanceを確認できない",
  "race-key-missing": "date / venue / raceNumberから一意race keyを作れない",
  "duplicate-race-key": "同一race keyが重複",
  "cancelled-or-no-race": "cancelled / no race",
  "not-confirmed": "resultStatusがconfirmedではない",
  "wind-missing": "風速が欠損",
  "wind-not-numeric": "風速を数値化できない",
  "wind-out-of-range": "風速が負数または異常値",
  "decision-missing": "決まり手が欠損",
  "decision-unknown": "決まり手を許可カテゴリへ正規化できない",
  "decision-conflict": "raceと1着行の決まり手が不一致",
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function validCarNo(value: unknown) {
  const normalized = clean(value);
  if (!/^\d+$/u.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isInteger(number) && number >= 1 && number <= 9 ? number : null;
}

function positiveYen(value: unknown) {
  if (value == null) return null;
  const normalized = clean(value).replace(/[,\s円￥¥]/gu, "");
  if (!/^\d+$/u.test(normalized)) return null;
  const payout = Number(normalized);
  return Number.isSafeInteger(payout) && payout > 0 ? payout : null;
}

function normalizedDecisionMethod(race: OfficialResultRace): {
  method: KurariExDecisionMethodKey | null;
  reason: "decision-missing" | "decision-unknown" | "decision-conflict" | null;
} {
  const winnerKimarite = clean(
    (race.finishOrder ?? []).find((row) => Number(clean(row.rank)) === 1)?.kimarite,
  );
  const raceKimarite = clean(race.kimarite);
  if (!raceKimarite && !winnerKimarite) return { method: null, reason: "decision-missing" };
  const raceDecision = raceKimarite ? DECISION_ALIASES.get(raceKimarite) : undefined;
  const winnerDecision = winnerKimarite ? DECISION_ALIASES.get(winnerKimarite) : undefined;
  if ((raceKimarite && !raceDecision) || (winnerKimarite && !winnerDecision)) {
    return { method: null, reason: "decision-unknown" };
  }
  if (raceDecision && winnerDecision && raceDecision !== winnerDecision) {
    return { method: null, reason: "decision-conflict" };
  }
  return { method: raceDecision ?? winnerDecision ?? null, reason: null };
}

function rate(count: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((count / total) * 1000) / 10;
}

function memoizeOnce<T>(factory: () => T) {
  let initialized = false;
  let value: T;
  return () => {
    if (!initialized) {
      value = factory();
      initialized = true;
    }
    return value;
  };
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function payoutCategoryKey(payoutYen: number) {
  return TURBULENCE_CATEGORY_DEFINITIONS.find(
    (definition) => payoutYen >= definition.min
      && (definition.max == null || payoutYen <= definition.max),
  )?.key ?? "extreme-upset";
}

function payoutCategoryLabel(key: KurariExTurbulenceCategoryKey) {
  return TURBULENCE_CATEGORY_DEFINITIONS.find((definition) => definition.key === key)?.label ?? key;
}

function normalizeRaceClass(value: unknown): {
  key: KurariExTrifectaRaceClassKey | null;
  label: string;
} {
  const normalized = clean(value).normalize("NFKC");
  if (!normalized) return { key: null, label: "" };
  if (/^S級/u.test(normalized) || /\bS級/u.test(normalized)) {
    return { key: "s-class", label: "S級" };
  }
  if (/^A級/u.test(normalized) || /\bA級/u.test(normalized)) {
    return { key: "a-class", label: "A級" };
  }
  if (/^L級/u.test(normalized) || /\bL級/u.test(normalized) || /ガールズ/u.test(normalized)) {
    return { key: "l-class", label: "L級" };
  }
  return { key: null, label: "" };
}

function isUpsetOrAbove(key: KurariExTurbulenceCategoryKey) {
  return key === "upset" || key === "major-upset" || key === "extreme-upset";
}

function chainType(
  previous: KurariExTurbulenceCategoryKey,
  next: KurariExTurbulenceCategoryKey,
): KurariExRaceChainTypeKey {
  if (isUpsetOrAbove(previous) && next === "firm") return "favorite-return";
  if (isUpsetOrAbove(previous) && isUpsetOrAbove(next)) return "upset-chain";
  if (previous === "mid-upset" && next === "mid-upset") return "mid-upset-continues";
  if ((previous === "firm" || previous === "mid-upset") && isUpsetOrAbove(next)) {
    return "upset-acceleration";
  }
  if (previous === "firm" && next === "firm") return "firm-continues";
  return "other";
}

function payoutCategories(payouts: number[]): KurariExTurbulenceCategory[] {
  const counts = new Map<KurariExTurbulenceCategoryKey, number>();
  payouts.forEach((payout) => {
    const key = payoutCategoryKey(payout);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return TURBULENCE_CATEGORY_DEFINITIONS.map((definition) => {
    const count = counts.get(definition.key) ?? 0;
    return {
      key: definition.key,
      label: definition.label,
      count,
      rate: rate(count, payouts.length),
      rangeLabel: definition.rangeLabel,
    };
  });
}

function payoutSummary(
  key: string,
  label: string,
  payouts: number[],
): KurariExTurbulenceBreakdownRow {
  const sample = sampleStatus(payouts.length);
  return {
    key,
    label,
    sampleSize: payouts.length,
    sampleStatus: sample.status,
    sampleLabel: sample.label,
    averagePayoutYen: Math.round(payouts.reduce((sum, payout) => sum + payout, 0) / payouts.length),
    medianPayoutYen: median(payouts),
    maxPayoutYen: Math.max(...payouts),
    categories: payoutCategories(payouts),
  };
}

function sampleStatus(sampleSize: number): {
  status: KurariExTrendSampleStatus;
  label: string;
} {
  if (sampleSize < 30) return { status: "low-sample", label: "LOW SAMPLE / 参考のみ" };
  if (sampleSize < 100) return { status: "caution", label: "caution / 傾向注意" };
  return { status: "usable", label: "usable trend / 予想の補助" };
}

function buildKurariExPredictionSignals(trend: KurariExTrifectaTrendV1): KurariExPredictionSignals {
  const primarySignals: KurariExPredictionSignal[] = [];
  const cautionSignals: KurariExPredictionSignal[] = [];
  const sampleWarnings: KurariExPredictionSignal[] = [];
  const conflictNotes: KurariExPredictionSignal[] = [];

  const turbulenceSegment = [...trend.turbulence.byVenueRaceBand, ...trend.turbulence.byVenueCarCount]
    .filter((segment) => isStrongEnoughSample(segment.sampleStatus))
    .sort((left, right) =>
      right.veryHighPayoutRate - left.veryHighPayoutRate
      || right.highPayoutRate - left.highPayoutRate
      || right.sampleSize - left.sampleSize,
    )[0];
  if (turbulenceSegment) {
    primarySignals.push({
      key: `turbulence:${turbulenceSegment.key}`,
      label: "荒れ注意",
      source: "turbulence",
      note: `${turbulenceSegment.label}: 万車券率${turbulenceSegment.highPayoutRate.toFixed(1)}% / 大荒れ率${turbulenceSegment.veryHighPayoutRate.toFixed(1)}%`,
      sampleStatus: turbulenceSegment.sampleStatus,
      sampleSize: turbulenceSegment.sampleSize,
      tone: "primary",
    });
  }

  const venueBiasSegment = [...trend.venueBias.byVenueRaceBand, ...trend.venueBias.byVenueCarCount, ...trend.venueBias.byVenueGrade]
    .filter((segment) => isStrongEnoughSample(segment.sampleStatus))
    .sort((left, right) =>
      right.outsideInvolvementRate - left.outsideInvolvementRate
      || right.oneCarOutRate - left.oneCarOutRate
      || right.sampleSize - left.sampleSize,
    )[0];
  if (venueBiasSegment) {
    primarySignals.push({
      key: `venue-bias:${venueBiasSegment.key}`,
      label: venueBiasSegment.oneCarOutRate >= 45 ? "1番車飛び注意" : "外枠絡み注意",
      source: "venue-bias",
      note: `${venueBiasSegment.label}: 外枠絡み${venueBiasSegment.outsideInvolvementRate.toFixed(1)}% / 1番車飛び${venueBiasSegment.oneCarOutRate.toFixed(1)}%`,
      sampleStatus: venueBiasSegment.sampleStatus,
      sampleSize: venueBiasSegment.sampleSize,
      tone: "primary",
    });
  }

  const rankingSegment = [...trend.rankingSegments.byVenueRaceClass, ...trend.rankingSegments.byRaceClass, ...trend.rankingSegments.byVenue]
    .filter((segment) => isStrongEnoughSample(segment.sampleStatus) && segment.topTrifectaResults.length > 0)
    .sort((left, right) =>
      (right.topTrifectaResults[0]?.rate ?? 0) - (left.topTrifectaResults[0]?.rate ?? 0)
      || right.sampleSize - left.sampleSize,
    )[0];
  const topTrifecta = rankingSegment?.topTrifectaResults[0];
  if (rankingSegment && topTrifecta) {
    primarySignals.push({
      key: `ranking:${rankingSegment.key}:${topTrifecta.key}`,
      label: "よく出る出目形",
      source: "ranking",
      note: `${rankingSegment.label}: ${topTrifecta.label} ${topTrifecta.rate.toFixed(1)}%`,
      sampleStatus: rankingSegment.sampleStatus,
      sampleSize: rankingSegment.sampleSize,
      tone: "primary",
    });
  }

  trend.todayFlow.attentionSigns.slice(0, 2).forEach((sign) => {
    cautionSignals.push({
      key: `today-flow:${sign.key}`,
      label: sign.label,
      source: "today-flow",
      note: sign.note,
      sampleStatus: trend.todayFlow.sampleStatus,
      sampleSize: trend.todayFlow.eligibleRaceCount,
      tone: "caution",
    });
  });

  const chainSegment = trend.chain.byVenue
    .filter((segment) => isStrongEnoughSample(segment.sampleStatus))
    .sort((left, right) =>
      right.turbulenceAccelerationRate - left.turbulenceAccelerationRate
      || right.turbulenceContinueRate - left.turbulenceContinueRate
      || right.sampleSize - left.sampleSize,
    )[0];
  if (chainSegment) {
    cautionSignals.push({
      key: `race-chain:${chainSegment.key}`,
      label: "連鎖は参考",
      source: "race-chain",
      note: `${chainSegment.label}: 波乱加速${chainSegment.turbulenceAccelerationRate.toFixed(1)}% / 荒れ連鎖${chainSegment.turbulenceContinueRate.toFixed(1)}%`,
      sampleStatus: chainSegment.sampleStatus,
      sampleSize: chainSegment.sampleSize,
      tone: "caution",
    });
  }

  const weatherSegment = trend.weather.byVenueWindBucket
    .filter((segment) => isStrongEnoughSample(segment.sampleStatus))
    .sort((left, right) =>
      right.highPayoutRate - left.highPayoutRate
      || Math.max(right.escapeRate, right.sprintRate) - Math.max(left.escapeRate, left.sprintRate)
      || right.sampleSize - left.sampleSize,
    )[0];
  if (weatherSegment) {
    cautionSignals.push({
      key: `weather:${weatherSegment.key}`,
      label: "風速条件は補助",
      source: "weather",
      note: `${weatherSegment.label}: 万車券率${weatherSegment.highPayoutRate.toFixed(1)}% / 逃げ${weatherSegment.escapeRate.toFixed(1)}% / 捲り${weatherSegment.sprintRate.toFixed(1)}%`,
      sampleStatus: weatherSegment.sampleStatus,
      sampleSize: weatherSegment.sampleSize,
      tone: "caution",
    });
  }

  const weakSegments = [
    ...[...trend.rankingSegments.byVenue, ...trend.rankingSegments.byRaceClass, ...trend.rankingSegments.byVenueRaceClass]
      .filter((segment) => segment.sampleStatus === "weak" && segment.sampleSize < 30)
      .map((segment) => ({ key: `ranking:${segment.key}`, label: "出目ランキング", segmentLabel: segment.label, sampleSize: segment.sampleSize })),
    ...[...trend.turbulence.byVenueRaceBand, ...trend.turbulence.byVenueCarCount]
      .filter((segment) => segment.sampleStatus === "weak" && segment.sampleSize < 30)
      .map((segment) => ({ key: `turbulence:${segment.key}`, label: "荒れ指数", segmentLabel: segment.label, sampleSize: segment.sampleSize })),
    ...[...trend.venueBias.byVenueCarCount, ...trend.venueBias.byVenueRaceBand, ...trend.venueBias.byVenueGrade]
      .filter((segment) => segment.sampleStatus === "weak" && segment.sampleSize < 30)
      .map((segment) => ({ key: `venue-bias:${segment.key}`, label: "会場クセ", segmentLabel: segment.label, sampleSize: segment.sampleSize })),
    ...[...trend.chain.byVenue, ...trend.chain.byVenueRaceBand]
      .filter((segment) => segment.sampleStatus === "weak" && segment.sampleSize < 30)
      .map((segment) => ({ key: `race-chain:${segment.key}`, label: "レース連鎖", segmentLabel: segment.label, sampleSize: segment.sampleSize })),
    ...trend.weather.byVenueWindBucket
      .filter((segment) => segment.sampleStatus === "weak" && segment.sampleSize < 30)
      .map((segment) => ({ key: `weather:${segment.key}`, label: "WEATHER", segmentLabel: segment.label, sampleSize: segment.sampleSize })),
  ].sort((left, right) => left.sampleSize - right.sampleSize || left.key.localeCompare(right.key, "ja", { numeric: true }));
  weakSegments.slice(0, 3).forEach((segment) => {
    sampleWarnings.push({
      key: `sample:${segment.key}`,
      label: `${segment.label} weak sample`,
      source: "sample",
      note: `${segment.segmentLabel}: ${segment.sampleSize.toLocaleString("ja-JP")}件。weak sampleは参考扱い、medium以上を主に扱う`,
      sampleStatus: "weak",
      sampleSize: segment.sampleSize,
      tone: "sample",
    });
  });
  if (trend.todayFlow.attentionSampleCaution.enabled) {
    sampleWarnings.unshift({
      key: "sample:today-flow",
      label: "単日current参考",
      source: "sample",
      note: `単日currentのため参考扱い。${trend.todayFlow.attentionSampleCaution.note}`,
      sampleStatus: trend.todayFlow.sampleStatus,
      sampleSize: trend.todayFlow.eligibleRaceCount,
      tone: "sample",
    });
  }

  const todayHighPayout = trend.todayFlow.baseline.comparisons.find((row) => row.key === "highPayoutRate");
  const todayAveragePayout = trend.todayFlow.baseline.comparisons.find((row) => row.key === "averageTrifectaPayoutYen");
  const todayOutside = trend.todayFlow.baseline.comparisons.find((row) => row.key === "outsideInvolvementRate");
  if (turbulenceSegment && turbulenceSegment.highPayoutRate >= 30 && (todayHighPayout?.diffLabel === "below" || todayAveragePayout?.diffLabel === "below")) {
    conflictNotes.push({
      key: "conflict:turbulence-vs-today",
      label: "60日荒れ傾向 vs 今日の下振れ",
      source: "today-flow",
      note: "60日条件別傾向を主、今日の流れは補正として扱う",
      sampleStatus: turbulenceSegment.sampleStatus,
      sampleSize: turbulenceSegment.sampleSize,
      tone: "caution",
    });
  }
  if (venueBiasSegment && venueBiasSegment.outsideInvolvementRate >= 85 && todayOutside?.diffLabel === "below") {
    conflictNotes.push({
      key: "conflict:venue-bias-vs-today",
      label: "60日外枠傾向 vs 今日の下振れ",
      source: "today-flow",
      note: "会場クセを主、今日の流れは注意サインに留める",
      sampleStatus: venueBiasSegment.sampleStatus,
      sampleSize: venueBiasSegment.sampleSize,
      tone: "caution",
    });
  }

  return {
    primarySignals: primarySignals.slice(0, 3),
    cautionSignals: cautionSignals.slice(0, 3),
    sampleWarnings: sampleWarnings.slice(0, 3),
    conflictNotes: conflictNotes.slice(0, 2),
    sourcePolicy: {
      label: "official result only / fake補完なし / trendEligibleのみ",
      items: [
        "KEIRIN.JP official result only",
        "trendEligible=trueのみを主母数に使用",
        "dead heat / refund-no-trifecta / not-finalized はtrend集計から除外",
        "fake補完・推測補完なし",
      ],
    },
  };
}

function countRanking(
  counts: Map<string, number>,
  denominator: number,
  label: (key: string) => string,
) {
  return [...counts.entries()]
    .map(([key, count]) => ({ key, label: label(key), count, rate: rate(count, denominator) }))
    .sort((left, right) =>
      right.count - left.count
      || left.key.localeCompare(right.key, "ja", { numeric: true }),
    );
}

function publicPath(relativePath: string) {
  const base = import.meta.env.BASE_URL.replace(/\/$/u, "");
  return `${base}${relativePath}`;
}

function buildKurariExWindDecisionV1(
  feed: OfficialResultFeed,
  sourceIsOfficial: boolean,
  sourceDate: string,
): KurariExWindDecisionV1 {
  const candidates = (feed.venues ?? []).flatMap((venue) =>
    (venue.races ?? []).map((race) => ({ venue, race })),
  );
  const raceKeys = candidates.map(({ venue, race }) => {
    const date = clean(venue.date || sourceDate);
    const venueKey = clean(venue.venueCode) || clean(venue.venueName);
    const raceNumber = Number(race.raceNumber);
    return date && venueKey && Number.isInteger(raceNumber) && raceNumber > 0
      ? `${date}|${venueKey}|${raceNumber}`
      : "";
  });
  const keyCounts = new Map<string, number>();
  raceKeys.filter(Boolean).forEach((key) => keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1));
  const exclusionCounts = new Map<string, number>();
  const eligible: Array<{
    raceKey: string;
    date: string;
    venueCode: string;
    venueName: string;
    raceNumber: number;
    windSpeedMps: number;
    windBucket: KurariExWindBucketKey;
    decisionMethod: KurariExDecisionMethodKey;
    payoutYen: number | null;
  }> = [];
  const exclude = (reason: string) => {
    exclusionCounts.set(reason, (exclusionCounts.get(reason) ?? 0) + 1);
  };

  candidates.forEach(({ venue, race }, index) => {
    const raceKey = raceKeys[index];
    if (!sourceIsOfficial) {
      exclude("source-unavailable");
      return;
    }
    if (!raceKey) {
      exclude("race-key-missing");
      return;
    }
    if ((keyCounts.get(raceKey) ?? 0) !== 1) {
      exclude("duplicate-race-key");
      return;
    }
    if (["cancelled", "no-race"].includes(clean(race.operationStatus).toLowerCase())) {
      exclude("cancelled-or-no-race");
      return;
    }
    if (clean(race.resultStatus) !== "confirmed") {
      exclude("not-confirmed");
      return;
    }
    const rawWind = race.weatherActual?.windSpeedMps;
    if (rawWind == null || clean(rawWind) === "") {
      exclude("wind-missing");
      return;
    }
    const windSpeedMps = typeof rawWind === "number" ? rawWind : Number(clean(rawWind));
    if (!Number.isFinite(windSpeedMps)) {
      exclude("wind-not-numeric");
      return;
    }
    if (windSpeedMps < 0 || windSpeedMps > 100) {
      exclude("wind-out-of-range");
      return;
    }
    const decision = normalizedDecisionMethod(race);
    if (!decision.method) {
      exclude(decision.reason ?? "decision-unknown");
      return;
    }
    const decisionMethod = decision.method;
    const windBucket = WIND_BUCKETS.find((bucket) => bucket.includes(windSpeedMps))?.key;
    if (!decisionMethod || !windBucket) {
      exclude("decision-unknown");
      return;
    }
    eligible.push({
      raceKey,
      date: clean(venue.date || sourceDate),
      venueCode: clean(venue.venueCode),
      venueName: clean(venue.venueName) || clean(venue.venueCode),
      raceNumber: Number(race.raceNumber),
      windSpeedMps,
      windBucket,
      decisionMethod,
      payoutYen: positiveYen(race.payout3tan?.payoutYen),
    });
  });

  const bucketCount = (key: KurariExWindBucketKey, rows = eligible) =>
    rows.filter((row) => row.windBucket === key).length;
  const decisionCount = (key: KurariExDecisionMethodKey, rows = eligible) =>
    rows.filter((row) => row.decisionMethod === key).length;
  const mostCommon = <T extends { count: number }>(rows: T[]) =>
    [...rows].sort((left, right) => right.count - left.count)[0] ?? null;
  const windBuckets = WIND_BUCKETS.map((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    count: bucketCount(bucket.key),
    rate: rate(bucketCount(bucket.key), eligible.length),
  }));
  const decisionMethods = DECISION_METHODS.map((method) => ({
    key: method.key,
    label: method.label,
    count: decisionCount(method.key),
    rate: rate(decisionCount(method.key), eligible.length),
  }));
  const venueGroups = new Map<string, typeof eligible>();
  eligible.forEach((row) => {
    const key = row.venueCode || row.venueName;
    const group = venueGroups.get(key) ?? [];
    group.push(row);
    venueGroups.set(key, group);
  });
  const windSegmentSampleStatus = (sampleSize: number): KurariExWindDecisionSegmentSampleStatus => {
    if (sampleSize >= 80) return "strong";
    if (sampleSize >= 30) return "medium";
    return "weak";
  };
  const byVenueWindBucketGroups = new Map<string, typeof eligible>();
  eligible.forEach((row) => {
    if (row.payoutYen == null) return;
    const venueKey = row.venueCode || row.venueName;
    const key = `${venueKey}|${row.windBucket}`;
    const group = byVenueWindBucketGroups.get(key) ?? [];
    group.push(row);
    byVenueWindBucketGroups.set(key, group);
  });
  const byVenueWindBucket = [...byVenueWindBucketGroups.entries()]
    .map(([key, rows]): KurariExWindDecisionSegment => {
      const first = rows[0];
      const payouts = rows
        .map((row) => row.payoutYen)
        .filter((payout): payout is number => payout != null);
      const windBucketLabel = WIND_BUCKETS.find((bucket) => bucket.key === first.windBucket)?.label ?? first.windBucket;
      return {
        key,
        label: `${first.venueName} / ${windBucketLabel}`,
        venueCode: first.venueCode,
        venueName: first.venueName,
        windBucket: first.windBucket,
        windBucketLabel,
        sampleSize: rows.length,
        sampleStatus: windSegmentSampleStatus(rows.length),
        escapeRate: rate(rows.filter((row) => row.decisionMethod === "escape").length, rows.length),
        sprintRate: rate(rows.filter((row) => row.decisionMethod === "sprint").length, rows.length),
        pursuitRate: rate(rows.filter((row) => row.decisionMethod === "difference").length, rows.length),
        highPayoutRate: rate(rows.filter((row) => (row.payoutYen ?? 0) >= 10_000).length, rows.length),
        averageTrifectaPayoutYen: Math.round(payouts.reduce((sum, payout) => sum + payout, 0) / payouts.length),
        medianTrifectaPayoutYen: median(payouts),
      };
    })
    .sort((left, right) =>
      right.sampleSize - left.sampleSize
      || left.venueCode.localeCompare(right.venueCode, "ja", { numeric: true })
      || left.windBucket.localeCompare(right.windBucket, "ja", { numeric: true }),
    );
  const sample = sampleStatus(eligible.length);

  return {
    status: eligible.length ? "ready" : "no-eligible-data",
    sourcePolicy: "official result only",
    totalRaceCount: candidates.length,
    eligibleRaceCount: eligible.length,
    excludedRaceCount: candidates.length - eligible.length,
    exclusionReasons: [...exclusionCounts.entries()].map(([key, count]) => ({
      key,
      label: WEATHER_EXCLUSION_LABELS[key] ?? key,
      count,
    })),
    sampleStatus: sample.status,
    sampleLabel: sample.label,
    mostCommonWindBucket: mostCommon(windBuckets),
    mostCommonDecisionMethod: mostCommon(decisionMethods),
    windBuckets,
    decisionMethods,
    matrix: WIND_BUCKETS.flatMap((bucket) => {
      const denominator = bucketCount(bucket.key);
      return DECISION_METHODS.map((method) => {
        const count = eligible.filter(
          (row) => row.windBucket === bucket.key && row.decisionMethod === method.key,
        ).length;
        return {
          windBucket: bucket.key,
          windBucketLabel: bucket.label,
          decisionMethod: method.key,
          decisionMethodLabel: method.label,
          count,
          rateWithinBucket: rate(count, denominator),
        };
      });
    }),
    byVenue: [...venueGroups.entries()]
      .map(([venueCode, rows]) => {
        const venueSample = sampleStatus(rows.length);
        const leadingBucket = mostCommon(WIND_BUCKETS.map((bucket) => ({
          label: bucket.label,
          count: bucketCount(bucket.key, rows),
        })));
        const leadingDecision = mostCommon(DECISION_METHODS.map((method) => ({
          label: method.label,
          count: decisionCount(method.key, rows),
        })));
        return {
          venueCode,
          venueName: rows[0]?.venueName ?? venueCode,
          sampleSize: rows.length,
          sampleStatus: venueSample.status,
          sampleLabel: venueSample.label,
          leadingWindBucketLabel: leadingBucket?.label ?? "--",
          leadingDecisionMethodLabel: leadingDecision?.label ?? "--",
          matrix: WIND_BUCKETS.flatMap((bucket) =>
            DECISION_METHODS.map((method) => {
              const count = rows.filter(
                (row) => row.windBucket === bucket.key && row.decisionMethod === method.key,
              ).length;
              return {
                windBucketLabel: bucket.label,
                decisionMethodLabel: method.label,
                count,
                rateWithinVenue: rate(count, rows.length),
              };
            }),
          ).filter((row) => row.count > 0),
        };
      })
      .sort((left, right) => right.sampleSize - left.sampleSize || left.venueCode.localeCompare(right.venueCode)),
    byVenueWindBucket,
    examples: eligible.slice(0, 5).map((row) => ({
      raceKey: row.raceKey,
      date: row.date,
      venueName: row.venueName,
      raceNumber: row.raceNumber,
      windSpeedMps: row.windSpeedMps,
      windBucketLabel: WIND_BUCKETS.find((bucket) => bucket.key === row.windBucket)?.label ?? row.windBucket,
      decisionMethodLabel: DECISION_METHODS.find((method) => method.key === row.decisionMethod)?.label ?? row.decisionMethod,
    })),
    classReadiness: {
      status: "future-accumulation",
      note: "current official resultではraceClassを安定取得できないため未集計",
    },
  };
}

function buildKurariExVenueBiasV1(
  feed: OfficialResultFeed,
  sourceIsOfficial: boolean,
  sourceDate: string,
): KurariExVenueBiasV1 {
  const candidates = (feed.venues ?? []).flatMap((venue) =>
    (venue.races ?? []).map((race) => ({ venue, race })),
  );
  const raceKeys = candidates.map(({ venue, race }) => {
    const date = clean(venue.date || sourceDate);
    const venueKey = clean(venue.venueCode) || clean(venue.venueName);
    const raceNumber = Number(race.raceNumber);
    return date && venueKey && Number.isInteger(raceNumber) && raceNumber > 0
      ? `${date}|${venueKey}|${raceNumber}`
      : "";
  });
  const keyCounts = new Map<string, number>();
  raceKeys.filter(Boolean).forEach((key) => keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1));
  const exclusionCounts = new Map<string, number>();
  const decisionExclusionCounts = new Map<string, number>();
  const eligible: Array<{
    raceKey: string;
    date: string;
    venueCode: string;
    venueName: string;
    raceNumber: number;
    carCount: number | null;
    grade: string;
    raceBand: "early" | "middle" | "late";
    top3: number[];
    oneCarConfirmed: boolean;
    combination: string;
    payoutYen: number;
    decisionMethod: KurariExDecisionMethodKey | null;
  }> = [];
  const exclude = (reason: string) => {
    exclusionCounts.set(reason, (exclusionCounts.get(reason) ?? 0) + 1);
  };

  candidates.forEach(({ venue, race }, index) => {
    const raceKey = raceKeys[index];
    if (!sourceIsOfficial) {
      exclude("source-unavailable");
      return;
    }
    if (!raceKey) {
      exclude("race-key-missing");
      return;
    }
    if ((keyCounts.get(raceKey) ?? 0) !== 1) {
      exclude("duplicate-race-key");
      return;
    }
    if (["cancelled", "no-race"].includes(clean(race.operationStatus).toLowerCase())) {
      exclude("cancelled-or-no-race");
      return;
    }
    if (clean(race.resultStatus) !== "confirmed") {
      exclude("not-confirmed");
      return;
    }
    const ranked = (race.finishOrder ?? [])
      .map((row) => ({ rank: Number(clean(row.rank)), carNo: validCarNo(row.carNo) }))
      .filter((row) => Number.isInteger(row.rank) && row.rank >= 1 && row.rank <= 3)
      .sort((left, right) => left.rank - right.rank);
    if (ranked.length !== 3 || ranked.some((row, position) => row.rank !== position + 1)) {
      exclude("finish-order-missing");
      return;
    }
    if (ranked.some((row) => row.carNo == null)) {
      exclude("invalid-car-number");
      return;
    }
    const top3 = ranked.map((row) => row.carNo as number);
    if (new Set(top3).size !== 3) {
      exclude("invalid-car-number");
      return;
    }
    const combination = top3.join("-");
    if (clean(race.payout3tan?.combination) !== combination) {
      exclude("trifecta-missing-or-mismatch");
      return;
    }
    const payoutYen = positiveYen(race.payout3tan?.payoutYen);
    if (payoutYen == null) {
      exclude("payout-missing-or-invalid");
      return;
    }
    const decision = normalizedDecisionMethod(race);
    if (!decision.method) {
      const reason = decision.reason ?? "decision-unknown";
      decisionExclusionCounts.set(reason, (decisionExclusionCounts.get(reason) ?? 0) + 1);
    }
    const recordedCars = new Set(
      (race.finishOrder ?? [])
        .map((row) => validCarNo(row.carNo))
        .filter((carNo): carNo is number => carNo != null),
    );
    const explicitCarCount = Number(race.carCount);
    const carCount = Number.isInteger(explicitCarCount) && explicitCarCount >= 1 && explicitCarCount <= 9
      ? explicitCarCount
      : null;
    const raceNumber = Number(race.raceNumber);
    const raceBand = raceNumber <= 4 ? "early" : raceNumber <= 8 ? "middle" : "late";
    eligible.push({
      raceKey,
      date: clean(venue.date || sourceDate),
      venueCode: clean(venue.venueCode),
      venueName: clean(venue.venueName) || clean(venue.venueCode),
      raceNumber,
      carCount,
      grade: clean(venue.grade),
      raceBand,
      top3,
      oneCarConfirmed: recordedCars.has(1),
      combination,
      payoutYen,
      decisionMethod: decision.method,
    });
  });

  const summarize = (rows: typeof eligible): KurariExVenueBiasMetrics => {
    const decisionRows = rows.filter((row) => row.decisionMethod != null);
    const oneCarRows = rows.filter((row) => row.oneCarConfirmed);
    const payoutTotal = rows.reduce((sum, row) => sum + row.payoutYen, 0);
    return {
      sampleSize: rows.length,
      decisionEligibleCount: decisionRows.length,
      oneCarEligibleCount: oneCarRows.length,
      innerFrameRate: rate(rows.filter((row) => row.top3.every((carNo) => carNo <= 3)).length, rows.length),
      outsideInvolvementRate: rate(rows.filter((row) => row.top3.some((carNo) => carNo >= 5)).length, rows.length),
      oneCarOutRate: rate(oneCarRows.filter((row) => !row.top3.includes(1)).length, oneCarRows.length),
      escapeRate: rate(decisionRows.filter((row) => row.decisionMethod === "escape").length, decisionRows.length),
      sprintRate: rate(decisionRows.filter((row) => row.decisionMethod === "sprint").length, decisionRows.length),
      averageTrifectaPayoutYen: rows.length ? Math.round(payoutTotal / rows.length) : null,
      highPayoutRate: rate(rows.filter((row) => row.payoutYen >= 10_000).length, rows.length),
    };
  };
  const featureLabels = (metrics: KurariExVenueBiasMetrics, status: KurariExTrendSampleStatus) => {
    const labels: string[] = [];
    if (metrics.innerFrameRate >= VENUE_BIAS_FEATURE_THRESHOLDS.innerFrameRate) labels.push("内枠寄り");
    if (metrics.outsideInvolvementRate >= VENUE_BIAS_FEATURE_THRESHOLDS.outsideInvolvementRate) labels.push("外枠絡み注意");
    if (metrics.oneCarEligibleCount && metrics.oneCarOutRate >= VENUE_BIAS_FEATURE_THRESHOLDS.oneCarOutRate) {
      labels.push("1番車飛び多め");
    }
    if (metrics.decisionEligibleCount && metrics.escapeRate >= VENUE_BIAS_FEATURE_THRESHOLDS.escapeRate) labels.push("逃げ寄り");
    if (metrics.decisionEligibleCount && metrics.sprintRate >= VENUE_BIAS_FEATURE_THRESHOLDS.sprintRate) labels.push("捲り寄り");
    if (
      (metrics.averageTrifectaPayoutYen ?? 0) >= VENUE_BIAS_FEATURE_THRESHOLDS.averageTrifectaPayoutYen
      || metrics.highPayoutRate >= VENUE_BIAS_FEATURE_THRESHOLDS.highPayoutRate
    ) {
      labels.push("配当荒れ寄り");
    }
    if (status === "low-sample") labels.push("LOW SAMPLE / 参考");
    return labels.length ? labels : ["明確な閾値超えなし"];
  };
  const venueGroups = new Map<string, typeof eligible>();
  eligible.forEach((row) => {
    const key = row.venueCode || row.venueName;
    const group = venueGroups.get(key) ?? [];
    group.push(row);
    venueGroups.set(key, group);
  });
  const byVenue = [...venueGroups.entries()]
    .map(([venueCode, rows]) => {
      const metrics = summarize(rows);
      const sample = sampleStatus(rows.length);
      return {
        venueCode,
        venueName: rows[0]?.venueName ?? venueCode,
        ...metrics,
        sampleStatus: sample.status,
        sampleLabel: sample.label,
        featureLabels: featureLabels(metrics, sample.status),
      };
    })
    .sort((left, right) => right.sampleSize - left.sampleSize || left.venueCode.localeCompare(right.venueCode));
  const segmentSampleStatus = (sampleSize: number): KurariExVenueBiasSegmentSampleStatus => {
    if (sampleSize >= 80) return "strong";
    if (sampleSize >= 30) return "medium";
    return "weak";
  };
  const raceBandLabels: Record<typeof eligible[number]["raceBand"], string> = {
    early: "early 1〜4R",
    middle: "middle 5〜8R",
    late: "late 9R以降",
  };
  const buildSegments = (
    segmentKey: "carCount" | "raceBand" | "grade",
    segmentLabel: (row: typeof eligible[number]) => string,
    segmentValue: (row: typeof eligible[number]) => string,
  ): KurariExVenueBiasSegment[] => {
    const groups = new Map<string, typeof eligible>();
    eligible.forEach((row) => {
      const value = segmentValue(row);
      if (!value) return;
      const venueKey = row.venueCode || row.venueName;
      const key = `${venueKey}|${segmentKey}|${value}`;
      const group = groups.get(key) ?? [];
      group.push(row);
      groups.set(key, group);
    });
    return [...groups.entries()]
      .map(([key, rows]) => {
        const metrics = summarize(rows);
        const first = rows[0];
        const value = segmentValue(first);
        const label = segmentLabel(first);
        return {
          key,
          label: `${first.venueName} / ${label}`,
          venueCode: first.venueCode,
          venueName: first.venueName,
          segmentKey: value,
          segmentLabel: label,
          sampleStatus: segmentSampleStatus(rows.length),
          ...metrics,
        };
      })
      .sort((left, right) =>
        right.sampleSize - left.sampleSize
        || left.venueCode.localeCompare(right.venueCode, "ja", { numeric: true })
        || left.segmentKey.localeCompare(right.segmentKey, "ja", { numeric: true }),
      );
  };
  const byVenueCarCount = buildSegments(
    "carCount",
    (row) => `${row.carCount}車`,
    (row) => row.carCount == null ? "" : String(row.carCount),
  );
  const byVenueRaceBand = buildSegments(
    "raceBand",
    (row) => raceBandLabels[row.raceBand],
    (row) => row.raceBand,
  );
  const byVenueGrade = buildSegments(
    "grade",
    (row) => row.grade,
    (row) => row.grade,
  );
  const highestOutside = [...byVenue].sort(
    (left, right) => right.outsideInvolvementRate - left.outsideInvolvementRate || right.sampleSize - left.sampleSize,
  )[0];
  const highestAverage = [...byVenue].sort(
    (left, right) => (right.averageTrifectaPayoutYen ?? 0) - (left.averageTrifectaPayoutYen ?? 0)
      || right.sampleSize - left.sampleSize,
  )[0];
  const sample = sampleStatus(eligible.length);

  return {
    status: eligible.length ? "ready" : "no-eligible-data",
    sourcePolicy: "official result only",
    totalRaceCount: candidates.length,
    eligibleRaceCount: eligible.length,
    excludedRaceCount: candidates.length - eligible.length,
    exclusionReasons: [...exclusionCounts.entries()].map(([key, count]) => ({
      key,
      label: VENUE_BIAS_EXCLUSION_LABELS[key] ?? key,
      count,
    })),
    decisionExclusionReasons: [...decisionExclusionCounts.entries()].map(([key, count]) => ({
      key,
      label: WEATHER_EXCLUSION_LABELS[key] ?? key,
      count,
    })),
    sampleStatus: sample.status,
    sampleLabel: sample.label,
    venueCount: byVenue.length,
    overall: summarize(eligible),
    highestOutsideInvolvementVenue: highestOutside
      ? { venueName: highestOutside.venueName, rate: highestOutside.outsideInvolvementRate }
      : null,
    highestAveragePayoutVenue: highestAverage?.averageTrifectaPayoutYen != null
      ? { venueName: highestAverage.venueName, averagePayoutYen: highestAverage.averageTrifectaPayoutYen }
      : null,
    byVenue,
    byVenueCarCount,
    byVenueRaceBand,
    byVenueGrade,
    examples: [...eligible]
      .sort((left, right) => right.payoutYen - left.payoutYen || left.raceKey.localeCompare(right.raceKey))
      .slice(0, 5)
      .map((row) => {
        const reasons = [
          row.payoutYen >= 10_000 ? "万車券" : "",
          row.top3.some((carNo) => carNo >= 5) ? "外枠絡み" : "",
          row.oneCarConfirmed && !row.top3.includes(1) ? "1番車3着外" : "",
        ].filter(Boolean);
        return {
          raceKey: row.raceKey,
          date: row.date,
          venueName: row.venueName,
          raceNumber: row.raceNumber,
          combination: row.combination,
          payoutYen: row.payoutYen,
          decisionMethodLabel: DECISION_METHODS.find((method) => method.key === row.decisionMethod)?.label ?? "unavailable",
          featureReason: reasons.join(" / ") || "eligible official result",
        };
      }),
    refinement: {
      status: "partial",
      note: "1番車欠車・出走確認の厳密化、級班別、7車/9車別はfuture refinement / future-accumulation",
    },
  };
}

function buildKurariExTodayFlowV1(
  feed: OfficialResultFeed,
  sourceIsOfficial: boolean,
  sourceDate: string,
  baselineFeed?: OfficialResultFeed,
): KurariExTodayFlowV1 {
  const candidates = (feed.venues ?? []).flatMap((venue) =>
    (venue.races ?? []).map((race) => ({
      venue,
      race,
      date: clean(venue.date || sourceDate),
    })),
  );
  const confirmedDates = sourceIsOfficial
    ? candidates
      .filter(({ race, date }) =>
        clean(race.resultStatus) === "confirmed"
        && !["cancelled", "no-race"].includes(clean(race.operationStatus).toLowerCase())
        && /^\d{4}-\d{2}-\d{2}$/u.test(date),
      )
      .map(({ date }) => date)
    : [];
  const targetDate = [...new Set(confirmedDates)].sort().at(-1) ?? "";
  const targetCandidates = candidates.filter(({ date }) => date === targetDate);
  const raceKeys = targetCandidates.map(({ venue, race, date }) => {
    const venueKey = clean(venue.venueCode) || clean(venue.venueName);
    const raceNumber = Number(race.raceNumber);
    return date && venueKey && Number.isInteger(raceNumber) && raceNumber > 0
      ? `${date}|${venueKey}|${raceNumber}`
      : "";
  });
  const keyCounts = new Map<string, number>();
  raceKeys.filter(Boolean).forEach((key) => keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1));
  const exclusionCounts = new Map<string, number>();
  const latestConfirmedByVenue = new Map<string, number>();
  const eligible: Array<{
    raceKey: string;
    date: string;
    venueCode: string;
    venueName: string;
    raceNumber: number;
    top3: number[];
    combination: string;
    payoutYen: number;
    category: KurariExTurbulenceCategoryKey;
  }> = [];
  const exclude = (reason: string) => {
    exclusionCounts.set(reason, (exclusionCounts.get(reason) ?? 0) + 1);
  };

  targetCandidates.forEach(({ venue, race, date }, index) => {
    const raceKey = raceKeys[index];
    const venueKey = clean(venue.venueCode) || clean(venue.venueName);
    const raceNumber = Number(race.raceNumber);
    if (!sourceIsOfficial) {
      exclude("source-unavailable");
      return;
    }
    if (!date || !venueKey || !Number.isInteger(raceNumber) || raceNumber <= 0 || !raceKey) {
      exclude("race-key-missing");
      return;
    }
    if ((keyCounts.get(raceKey) ?? 0) !== 1) {
      exclude("duplicate-race-key");
      return;
    }
    if (["cancelled", "no-race"].includes(clean(race.operationStatus).toLowerCase())) {
      exclude("cancelled-or-no-race");
      return;
    }
    if (clean(race.resultStatus) !== "confirmed") {
      exclude("not-confirmed");
      return;
    }
    latestConfirmedByVenue.set(
      venueKey,
      Math.max(latestConfirmedByVenue.get(venueKey) ?? 0, raceNumber),
    );
    const ranked = (race.finishOrder ?? [])
      .map((row) => ({ rank: Number(clean(row.rank)), carNo: validCarNo(row.carNo) }))
      .filter((row) => Number.isInteger(row.rank) && row.rank >= 1 && row.rank <= 3)
      .sort((left, right) => left.rank - right.rank);
    if (ranked.length !== 3 || ranked.some((row, position) => row.rank !== position + 1)) {
      exclude("finish-order-missing");
      return;
    }
    if (ranked.some((row) => row.carNo == null)) {
      exclude("invalid-car-number");
      return;
    }
    const top3 = ranked.map((row) => row.carNo as number);
    if (new Set(top3).size !== 3) {
      exclude("invalid-car-number");
      return;
    }
    const combination = top3.join("-");
    if (clean(race.payout3tan?.combination) !== combination) {
      exclude("trifecta-missing-or-mismatch");
      return;
    }
    const payoutYen = positiveYen(race.payout3tan?.payoutYen);
    if (payoutYen == null) {
      exclude("payout-missing-or-invalid");
      return;
    }
    const category = payoutCategoryKey(payoutYen);
    eligible.push({
      raceKey,
      date,
      venueCode: clean(venue.venueCode),
      venueName: clean(venue.venueName) || venueKey,
      raceNumber,
      top3,
      combination,
      payoutYen,
      category,
    });
  });

  const summarize = (rows: typeof eligible): KurariExTodayFlowMetrics => {
    const payouts = rows.map((row) => row.payoutYen);
    return {
      sampleSize: rows.length,
      firmRate: rate(rows.filter((row) => row.category === "firm").length, rows.length),
      midUpsetRate: rate(rows.filter((row) => row.category === "mid-upset").length, rows.length),
      upsetOrAboveRate: rate(
        rows.filter((row) => ["upset", "major-upset", "extreme-upset"].includes(row.category)).length,
        rows.length,
      ),
      outsideInvolvementRate: rate(rows.filter((row) => row.top3.some((carNo) => carNo >= 5)).length, rows.length),
      oneCarOutRate: rate(rows.filter((row) => !row.top3.includes(1)).length, rows.length),
      averageTrifectaPayoutYen: payouts.length
        ? Math.round(payouts.reduce((sum, payout) => sum + payout, 0) / payouts.length)
        : null,
      medianTrifectaPayoutYen: payouts.length ? median(payouts) : null,
      highPayoutRate: rate(rows.filter((row) => row.payoutYen >= 10_000).length, rows.length),
      veryHighPayoutRate: rate(rows.filter((row) => row.payoutYen >= 30_000).length, rows.length),
      ultraHighPayoutRate: rate(rows.filter((row) => row.payoutYen >= 100_000).length, rows.length),
    };
  };
  const extractBaselineEligible = (baseline: OfficialResultFeed | undefined) => {
    if (!baseline) return [];
    const baselineSourceDate = clean(baseline.date);
    const baselineSourceIsOfficial =
      clean(baseline.source?.provider) === "KEIRIN.JP"
      && clean(baseline.source?.listType) === "JSJ048"
      && /^\d{4}-\d{2}-\d{2}$/u.test(baselineSourceDate)
      && !Number.isNaN(Date.parse(clean(baseline.generatedAt)));
    if (!baselineSourceIsOfficial) return [];
    const baselineCandidates = (baseline.venues ?? []).flatMap((venue) =>
      (venue.races ?? []).map((race) => ({
        venue,
        race,
        date: clean(venue.date || baselineSourceDate),
      })),
    );
    const baselineRaceKeys = baselineCandidates.map(({ venue, race, date }) => {
      const venueKey = clean(venue.venueCode) || clean(venue.venueName);
      const raceNumber = Number(race.raceNumber);
      return date && venueKey && Number.isInteger(raceNumber) && raceNumber > 0
        ? `${date}|${venueKey}|${raceNumber}`
        : "";
    });
    const baselineKeyCounts = new Map<string, number>();
    baselineRaceKeys.filter(Boolean).forEach((key) => {
      baselineKeyCounts.set(key, (baselineKeyCounts.get(key) ?? 0) + 1);
    });
    const rows: typeof eligible = [];
    baselineCandidates.forEach(({ venue, race, date }, index) => {
      const raceKey = baselineRaceKeys[index];
      const venueKey = clean(venue.venueCode) || clean(venue.venueName);
      const raceNumber = Number(race.raceNumber);
      if (!date || !venueKey || !Number.isInteger(raceNumber) || raceNumber <= 0 || !raceKey) return;
      if ((baselineKeyCounts.get(raceKey) ?? 0) !== 1) return;
      if (["cancelled", "no-race"].includes(clean(race.operationStatus).toLowerCase())) return;
      if (clean(race.resultStatus) !== "confirmed") return;
      const ranked = (race.finishOrder ?? [])
        .map((row) => ({ rank: Number(clean(row.rank)), carNo: validCarNo(row.carNo) }))
        .filter((row) => Number.isInteger(row.rank) && row.rank >= 1 && row.rank <= 3)
        .sort((left, right) => left.rank - right.rank);
      if (ranked.length !== 3 || ranked.some((row, position) => row.rank !== position + 1)) return;
      if (ranked.some((row) => row.carNo == null)) return;
      const top3 = ranked.map((row) => row.carNo as number);
      if (new Set(top3).size !== 3) return;
      const combination = top3.join("-");
      if (clean(race.payout3tan?.combination) !== combination) return;
      const payoutYen = positiveYen(race.payout3tan?.payoutYen);
      if (payoutYen == null) return;
      rows.push({
        raceKey,
        date,
        venueCode: clean(venue.venueCode),
        venueName: clean(venue.venueName) || venueKey,
        raceNumber,
        top3,
        combination,
        payoutYen,
        category: payoutCategoryKey(payoutYen),
      });
    });
    return rows;
  };
  const baselineRows = extractBaselineEligible(baselineFeed);
  const baselineMetrics = summarize(baselineRows);
  const rateDiffLabel = (diff: number | null): KurariExTodayFlowBaselineDiffLabel | "unavailable" => {
    if (diff == null) return "unavailable";
    if (Math.abs(diff) <= 5) return "near";
    return diff > 0 ? "above" : "below";
  };
  const payoutDiffLabel = (
    todayValue: number | null,
    baselineValue: number | null,
    diff: number | null,
  ): KurariExTodayFlowBaselineDiffLabel | "unavailable" => {
    if (todayValue == null || baselineValue == null || diff == null || baselineValue <= 0) return "unavailable";
    if (Math.abs(diff) / baselineValue <= 0.1) return "near";
    return diff > 0 ? "above" : "below";
  };
  const baselineComparison = (
    key: KurariExTodayFlowBaselineComparison["key"],
    label: string,
    metricType: KurariExTodayFlowBaselineComparison["metricType"],
    todayValue: number | null,
    baselineValue: number | null,
  ): KurariExTodayFlowBaselineComparison => {
    const diff = todayValue == null || baselineValue == null ? null : todayValue - baselineValue;
    return {
      key,
      label,
      metricType,
      todayValue,
      baselineValue,
      diff,
      diffLabel: metricType === "rate"
        ? rateDiffLabel(diff)
        : payoutDiffLabel(todayValue, baselineValue, diff),
    };
  };
  const isUpset = (category: KurariExTurbulenceCategoryKey) =>
    ["upset", "major-upset", "extreme-upset"].includes(category);
  const transitionCounts = new Map<KurariExTodayFlowTransitionKey, number>();
  const venueGroups = new Map<string, typeof eligible>();
  eligible.forEach((row) => {
    const key = row.venueCode || row.venueName;
    const group = venueGroups.get(key) ?? [];
    group.push(row);
    venueGroups.set(key, group);
  });
  venueGroups.forEach((rows) => {
    const sorted = [...rows].sort((left, right) => left.raceNumber - right.raceNumber);
    for (let index = 0; index < sorted.length - 1; index += 1) {
      const previous = sorted[index];
      const next = sorted[index + 1];
      if (next.raceNumber !== previous.raceNumber + 1) continue;
      let key: KurariExTodayFlowTransitionKey | null = null;
      if (isUpset(previous.category) && next.category === "firm") key = "favorite-return";
      else if (["firm", "mid-upset"].includes(previous.category) && isUpset(next.category)) key = "upset-acceleration";
      else if (previous.category === "mid-upset" && next.category === "mid-upset") key = "mid-upset-repeat";
      else if (previous.category === "firm" && next.category === "firm") key = "firm-continues";
      else if (isUpset(previous.category) && isUpset(next.category)) key = "upset-chain";
      if (key) transitionCounts.set(key, (transitionCounts.get(key) ?? 0) + 1);
    }
  });
  const flowLabel = (
    metrics: KurariExTodayFlowMetrics,
    transitions: Map<KurariExTodayFlowTransitionKey, number>,
  ) => {
    const firm =
      metrics.firmRate >= TODAY_FLOW_LABEL_THRESHOLDS.firmRate
      && (metrics.averageTrifectaPayoutYen ?? Infinity) <= TODAY_FLOW_LABEL_THRESHOLDS.firmAveragePayoutYen
      && metrics.highPayoutRate <= TODAY_FLOW_LABEL_THRESHOLDS.firmHighPayoutRate;
    const upset =
      metrics.upsetOrAboveRate >= TODAY_FLOW_LABEL_THRESHOLDS.upsetOrAboveRate
      || (metrics.averageTrifectaPayoutYen ?? 0) >= TODAY_FLOW_LABEL_THRESHOLDS.upsetAveragePayoutYen
      || metrics.highPayoutRate >= TODAY_FLOW_LABEL_THRESHOLDS.upsetHighPayoutRate;
    const midRepeat =
      metrics.midUpsetRate >= TODAY_FLOW_LABEL_THRESHOLDS.midUpsetRate
      || (transitions.get("mid-upset-repeat") ?? 0) > 0;
    if (upset) return "荒れ寄り";
    if (firm) return "堅め寄り";
    if (midRepeat) return "中穴反復";
    if (metrics.outsideInvolvementRate >= TODAY_FLOW_LABEL_THRESHOLDS.outsideInvolvementRate) return "外枠絡み多め";
    if (metrics.oneCarOutRate >= TODAY_FLOW_LABEL_THRESHOLDS.oneCarOutRate) return "1番車飛び気味";
    return "mixed / 判定保留";
  };
  const overall = summarize(eligible);
  const sample = sampleStatus(eligible.length);
  const todayInJapan = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const isToday = Boolean(targetDate && targetDate === todayInJapan);
  const cautionLabels = [
    sample.status === "low-sample" ? "LOW SAMPLE / 参考" : "",
    !isToday && targetDate ? "最新取得日ベース" : "",
    overall.outsideInvolvementRate >= TODAY_FLOW_LABEL_THRESHOLDS.outsideInvolvementRate ? "外枠絡み多め" : "",
    overall.oneCarOutRate >= TODAY_FLOW_LABEL_THRESHOLDS.oneCarOutRate ? "1番車飛び気味" : "",
    (transitionCounts.get("favorite-return") ?? 0) > 0 ? "本命戻りあり" : "",
    (transitionCounts.get("upset-acceleration") ?? 0) > 0 ? "波乱加速あり" : "",
  ].filter(Boolean);
  const byVenue = [...venueGroups.entries()]
    .map(([venueKey, rows]) => {
      const sorted = [...rows].sort((left, right) => left.raceNumber - right.raceNumber);
      const metrics = summarize(sorted);
      const venueSample = sampleStatus(sorted.length);
      const venueTransitions = new Map<KurariExTodayFlowTransitionKey, number>();
      for (let index = 0; index < sorted.length - 1; index += 1) {
        const previous = sorted[index];
        const next = sorted[index + 1];
        if (next.raceNumber !== previous.raceNumber + 1) continue;
        if (isUpset(previous.category) && next.category === "firm") venueTransitions.set("favorite-return", 1);
        if (["firm", "mid-upset"].includes(previous.category) && isUpset(next.category)) venueTransitions.set("upset-acceleration", 1);
        if (previous.category === "mid-upset" && next.category === "mid-upset") venueTransitions.set("mid-upset-repeat", 1);
      }
      const baseLabel = flowLabel(metrics, venueTransitions);
      return {
        venueCode: sorted[0]?.venueCode ?? venueKey,
        venueName: sorted[0]?.venueName ?? venueKey,
        ...metrics,
        sampleStatus: venueSample.status,
        sampleLabel: venueSample.label,
        currentFlowLabel: venueSample.status === "low-sample" ? `${baseLabel} / 参考` : baseLabel,
        latestConfirmedRaceNumber: latestConfirmedByVenue.get(venueKey) ?? null,
        recentRaces: sorted.slice(-5).map((row) => ({
          raceNumber: row.raceNumber,
          categoryLabel: payoutCategoryLabel(row.category),
          payoutYen: row.payoutYen,
          combination: row.combination,
        })),
      };
    })
    .sort((left, right) => right.sampleSize - left.sampleSize || left.venueCode.localeCompare(right.venueCode));
  const exclusionCategoryCounts = new Map<KurariExTodayFlowExclusionCategoryKey, number>();
  exclusionCounts.forEach((count, reason) => {
    const category = todayFlowExclusionCategory(reason);
    exclusionCategoryCounts.set(category, (exclusionCategoryCounts.get(category) ?? 0) + count);
  });
  const exclusionBreakdown = ([
    "not-confirmed",
    "dead-heat",
    "refund-no-trifecta",
    "missing-payout",
    "validation-mismatch",
    "other",
  ] as KurariExTodayFlowExclusionCategoryKey[])
    .map((key) => ({
      key,
      label: TODAY_FLOW_EXCLUSION_CATEGORY_LABELS[key],
      count: exclusionCategoryCounts.get(key) ?? 0,
    }))
    .filter((row) => row.count > 0);
  const baselineComparisons = baselineRows.length ? [
    baselineComparison("highPayoutRate", "万車券率", "rate", overall.highPayoutRate, baselineMetrics.highPayoutRate),
    baselineComparison("veryHighPayoutRate", "大荒れ率", "rate", overall.veryHighPayoutRate, baselineMetrics.veryHighPayoutRate),
    baselineComparison("ultraHighPayoutRate", "超荒れ率", "rate", overall.ultraHighPayoutRate, baselineMetrics.ultraHighPayoutRate),
    baselineComparison("outsideInvolvementRate", "外枠絡み率", "rate", overall.outsideInvolvementRate, baselineMetrics.outsideInvolvementRate),
    baselineComparison("oneCarOutRate", "1番車飛び率", "rate", overall.oneCarOutRate, baselineMetrics.oneCarOutRate),
    baselineComparison("averageTrifectaPayoutYen", "平均3連単配当", "payout", overall.averageTrifectaPayoutYen, baselineMetrics.averageTrifectaPayoutYen),
    baselineComparison("medianTrifectaPayoutYen", "中央値3連単配当", "payout", overall.medianTrifectaPayoutYen, baselineMetrics.medianTrifectaPayoutYen),
  ] : [];
  const comparisonByKey = new Map(baselineComparisons.map((row) => [row.key, row]));
  const attentionSigns: KurariExTodayFlowAttentionSign[] = [];
  const pushAttentionSign = (
    key: KurariExTodayFlowAttentionSignKey,
    label: string,
    row: KurariExTodayFlowBaselineComparison,
    note: string,
    tone: KurariExTodayFlowAttentionSign["tone"] = "caution",
  ) => {
    attentionSigns.push({
      key,
      label,
      tone,
      metricKey: row.key,
      metricLabel: row.label,
      metricType: row.metricType,
      todayValue: row.todayValue,
      baselineValue: row.baselineValue,
      diffLabel: row.diffLabel,
      note,
    });
  };
  const highPayoutComparison = comparisonByKey.get("highPayoutRate");
  if (highPayoutComparison?.diffLabel === "above") {
    pushAttentionSign("high-payout-caution", "荒れ注意", highPayoutComparison, "万車券率が60日平均との差で上振れ傾向");
  }
  const ultraHighPayoutComparison = comparisonByKey.get("ultraHighPayoutRate");
  const veryHighPayoutComparison = comparisonByKey.get("veryHighPayoutRate");
  if (ultraHighPayoutComparison?.diffLabel === "above") {
    pushAttentionSign("very-high-payout-caution", "超荒れ注意", ultraHighPayoutComparison, "超荒れ率が60日平均との差で上振れ傾向");
  } else if (veryHighPayoutComparison?.diffLabel === "above") {
    pushAttentionSign("very-high-payout-caution", "超荒れ注意", veryHighPayoutComparison, "大荒れ率が60日平均との差で上振れ傾向");
  }
  const outsideComparison = comparisonByKey.get("outsideInvolvementRate");
  if (outsideComparison?.diffLabel === "above") {
    pushAttentionSign("outside-involvement-caution", "外枠絡み注意", outsideComparison, "外枠絡み率が60日平均との差で上振れ傾向");
  }
  const oneCarOutComparison = comparisonByKey.get("oneCarOutRate");
  if (oneCarOutComparison?.diffLabel === "above") {
    pushAttentionSign("one-car-out-caution", "1番車飛び注意", oneCarOutComparison, "1番車飛び率が60日平均との差で上振れ傾向");
  }
  const averagePayoutComparison = comparisonByKey.get("averageTrifectaPayoutYen");
  if (averagePayoutComparison?.diffLabel === "above") {
    pushAttentionSign("average-payout-above", "平均配当上振れ", averagePayoutComparison, "平均3連単配当が60日平均との差で上振れ傾向");
  } else if (averagePayoutComparison?.diffLabel === "below") {
    pushAttentionSign("average-payout-below", "平均配当下振れ", averagePayoutComparison, "平均3連単配当が60日平均との差で下振れ傾向", "partial");
  }
  if (
    baselineComparisons.length
    && attentionSigns.length === 0
    && baselineComparisons.some((row) => row.diffLabel === "near")
    && baselineComparisons.every((row) => row.diffLabel === "near" || row.diffLabel === "unavailable")
  ) {
    attentionSigns.push({
      key: "near-baseline",
      label: "平常寄り",
      tone: "ready",
      metricKey: "summary",
      metricLabel: "60日平均との差分",
      metricType: "summary",
      todayValue: null,
      baselineValue: null,
      diffLabel: "summary",
      note: "主要指標は60日平均のnear範囲が中心",
    });
  }
  const attentionSampleCaution = {
    enabled: sample.status !== "usable",
    label: sample.label,
    note: `current対象${eligible.length.toLocaleString("ja-JP")}Rのため、注意サインは参考扱い`,
  };

  return {
    status: eligible.length ? "ready" : "no-eligible-data",
    sourcePolicy: "official result only",
    targetDate,
    isToday,
    dateBasisLabel: !targetDate ? "unavailable" : isToday ? "today" : "最新取得日ベース",
    totalRaceCount: targetCandidates.length,
    eligibleRaceCount: eligible.length,
    excludedRaceCount: targetCandidates.length - eligible.length,
    exclusionReasons: [...exclusionCounts.entries()].map(([key, count]) => ({
      key,
      label: VENUE_BIAS_EXCLUSION_LABELS[key] ?? key,
      count,
    })),
    exclusionBreakdown,
    venueCount: byVenue.length,
    sampleStatus: sample.status,
    sampleLabel: sample.label,
    dominantFlowLabel: flowLabel(overall, transitionCounts),
    cautionLabels,
    overall,
    baseline: {
      status: baselineRows.length ? "ready" : "unavailable",
      label: "historical 60日 trendEligible",
      sampleSize: baselineRows.length,
      comparisons: baselineComparisons,
    },
    attentionSigns,
    attentionSampleCaution,
    transitionHints: (Object.entries(TODAY_FLOW_TRANSITION_LABELS) as Array<[KurariExTodayFlowTransitionKey, string]>)
      .map(([key, label]) => ({ key, label, count: transitionCounts.get(key) ?? 0 })),
    byVenue,
    refinement: {
      status: "future-accumulation",
      note: "最新日の流れだけを表示。60日傾向は出目・荒れ・連鎖・WEATHER・会場クセで確認",
    },
  };
}

type KurariExTrifectaTrendBuildOptions = {
  todayFlowFeed?: OfficialResultFeed;
  todayFlowBaselineFeed?: OfficialResultFeed;
};

export function buildKurariExTrifectaTrendV1(
  feed: OfficialResultFeed,
  options: KurariExTrifectaTrendBuildOptions = {},
): KurariExTrifectaTrendV1 {
  const sourceDate = clean(feed.date);
  const sourceFetchedAt = clean(feed.generatedAt);
  const provider = clean(feed.source?.provider);
  const listType = clean(feed.source?.listType);
  const sourceIsOfficial =
    provider === "KEIRIN.JP"
    && listType === "JSJ048"
    && /^\d{4}-\d{2}-\d{2}$/u.test(sourceDate)
    && !Number.isNaN(Date.parse(sourceFetchedAt));
  const candidates = (feed.venues ?? []).flatMap((venue) =>
    (venue.races ?? []).map((race) => ({ venue, race })),
  );
  const raceKeys = candidates.map(({ venue, race }) => {
    const date = clean(venue.date || sourceDate);
    const venueCode = clean(venue.venueCode);
    const raceNumber = Number(race.raceNumber);
    return date && venueCode && Number.isInteger(raceNumber) && raceNumber > 0
      ? `${date}|${venueCode}|${raceNumber}`
      : "";
  });
  const keyCounts = new Map<string, number>();
  raceKeys.filter(Boolean).forEach((key) => keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1));

  const exclusionCounts = new Map<string, number>();
  const trifectaCounts = new Map<string, number>();
  const positionCounts = [new Map<string, number>(), new Map<string, number>(), new Map<string, number>()];
  const top3Counts = new Map<string, number>();
  const recordedStartCounts = new Map<string, number>();
  const candidateExclusionReasons: Array<string | null> = candidates.map(() => null);
  const eligiblePayoutRaces: Array<{
    raceKey: string;
    date: string;
    venueCode: string;
    venueName: string;
    raceNumber: number;
    raceBand: "early" | "middle" | "late";
    carCount: number | null;
    grade: string;
    raceClass: KurariExTrifectaRaceClassKey | null;
    raceClassLabel: string;
    combination: string;
    firstCarNo: number;
    secondCarNo: number;
    thirdCarNo: number;
    quinellaLikePair: string;
    payoutYen: number;
  }> = [];
  let eligibleRaceCount = 0;

  const exclude = (reason: string, candidateIndex: number) => {
    exclusionCounts.set(reason, (exclusionCounts.get(reason) ?? 0) + 1);
    candidateExclusionReasons[candidateIndex] = reason;
  };

  candidates.forEach(({ venue, race }, index) => {
    const raceKey = raceKeys[index];
    if (!sourceIsOfficial) {
      exclude("source-unavailable", index);
      return;
    }
    if (!raceKey) {
      exclude("race-key-missing", index);
      return;
    }
    if ((keyCounts.get(raceKey) ?? 0) !== 1) {
      exclude("duplicate-race-key", index);
      return;
    }
    if (["cancelled", "no-race"].includes(clean(race.operationStatus).toLowerCase())) {
      exclude("cancelled-or-no-race", index);
      return;
    }
    if (clean(race.resultStatus) !== "confirmed") {
      exclude("not-confirmed", index);
      return;
    }
    const ranked = (race.finishOrder ?? [])
      .map((row) => ({ rank: Number(clean(row.rank)), carNo: validCarNo(row.carNo) }))
      .filter((row) => Number.isInteger(row.rank) && row.rank >= 1 && row.rank <= 3)
      .sort((left, right) => left.rank - right.rank);
    if (ranked.length !== 3 || ranked.some((row, position) => row.rank !== position + 1)) {
      exclude("finish-order-missing", index);
      return;
    }
    if (ranked.some((row) => row.carNo == null)) {
      exclude("invalid-car-number", index);
      return;
    }
    const top3 = ranked.map((row) => row.carNo as number);
    if (new Set(top3).size !== 3) {
      exclude("invalid-car-number", index);
      return;
    }
    const combination = top3.join("-");
    if (clean(race.payout3tan?.combination) !== combination) {
      exclude("trifecta-missing-or-mismatch", index);
      return;
    }
    const payoutYen = positiveYen(race.payout3tan?.payoutYen);
    if (payoutYen == null) {
      exclude("payout-missing-or-invalid", index);
      return;
    }
    const raceNumber = Number(race.raceNumber);
    const explicitCarCountForSegment = Number(race.carCount);
    const segmentCarCount = Number.isInteger(explicitCarCountForSegment)
      && explicitCarCountForSegment >= 1
      && explicitCarCountForSegment <= 9
      ? explicitCarCountForSegment
      : null;
    const raceBand = raceNumber <= 4 ? "early" : raceNumber <= 8 ? "middle" : "late";
    const raceClass = normalizeRaceClass(race.raceClass);
    const quinellaLikePair = [...top3.slice(0, 2)].sort((left, right) => left - right).join("=");

    eligibleRaceCount += 1;
    eligiblePayoutRaces.push({
      raceKey,
      date: clean(venue.date || sourceDate),
      venueCode: clean(venue.venueCode),
      venueName: clean(venue.venueName) || clean(venue.venueCode),
      raceNumber,
      raceBand,
      carCount: segmentCarCount,
      grade: clean(venue.grade),
      raceClass: raceClass.key,
      raceClassLabel: raceClass.label,
      combination,
      firstCarNo: top3[0],
      secondCarNo: top3[1],
      thirdCarNo: top3[2],
      quinellaLikePair,
      payoutYen,
    });
    trifectaCounts.set(combination, (trifectaCounts.get(combination) ?? 0) + 1);
    top3.forEach((carNo, position) => {
      const key = String(carNo);
      positionCounts[position].set(key, (positionCounts[position].get(key) ?? 0) + 1);
      top3Counts.set(key, (top3Counts.get(key) ?? 0) + 1);
    });
    const explicitCarCount = Number(race.carCount);
    const carCount = Number.isInteger(explicitCarCount) && explicitCarCount >= 1 && explicitCarCount <= 9
      ? explicitCarCount
      : (race.finishOrder ?? []).length;
    const recordedCars = new Set(
      carCount >= 1 && carCount <= 9
        ? Array.from({ length: carCount }, (_, carNo) => carNo + 1)
        : (race.finishOrder ?? [])
          .map((row) => validCarNo(row.carNo))
          .filter((carNo): carNo is number => carNo != null),
    );
    recordedCars.forEach((carNo) => {
      const key = String(carNo);
      recordedStartCounts.set(key, (recordedStartCounts.get(key) ?? 0) + 1);
    });
  });

  const sample = sampleStatus(eligibleRaceCount);
  const carTop3RateRanking = [...recordedStartCounts.entries()]
    .map(([key, eligibleStarts]) => {
      const count = top3Counts.get(key) ?? 0;
      return {
        key,
        label: `${key}番車`,
        count,
        eligibleStarts,
        rate: rate(count, eligibleStarts),
      };
    })
    .sort((left, right) =>
      right.rate - left.rate
      || right.count - left.count
      || Number(left.key) - Number(right.key),
    );
  const rankingSegmentSampleStatus = (sampleSize: number): KurariExTrifectaRankingSegmentSampleStatus => {
    if (sampleSize >= 80) return "strong";
    if (sampleSize >= 30) return "medium";
    return "weak";
  };
  const summarizeRankingSegment = (
    key: string,
    rows: typeof eligiblePayoutRaces,
    segmentKey: (race: typeof eligiblePayoutRaces[number]) => string,
    segmentLabel: (race: typeof eligiblePayoutRaces[number]) => string,
  ): KurariExTrifectaRankingSegment => {
    const first = rows[0];
    const segmentTrifectaCounts = new Map<string, number>();
    const segmentPositionCounts = [new Map<string, number>(), new Map<string, number>(), new Map<string, number>()];
    const segmentPairCounts = new Map<string, number>();
    rows.forEach((race) => {
      segmentTrifectaCounts.set(race.combination, (segmentTrifectaCounts.get(race.combination) ?? 0) + 1);
      [race.firstCarNo, race.secondCarNo, race.thirdCarNo].forEach((carNo, position) => {
        const carKey = String(carNo);
        segmentPositionCounts[position].set(carKey, (segmentPositionCounts[position].get(carKey) ?? 0) + 1);
      });
      segmentPairCounts.set(race.quinellaLikePair, (segmentPairCounts.get(race.quinellaLikePair) ?? 0) + 1);
    });
    return {
      key,
      label: segmentLabel(first),
      segmentKey: segmentKey(first),
      segmentLabel: segmentLabel(first),
      venueCode: first.venueCode,
      venueName: first.venueName,
      raceClass: first.raceClass ?? undefined,
      sampleSize: rows.length,
      sampleStatus: rankingSegmentSampleStatus(rows.length),
      topTrifectaResults: countRanking(segmentTrifectaCounts, rows.length, (combination) => combination),
      firstCarRanking: countRanking(segmentPositionCounts[0], rows.length, (carNo) => `${carNo}番車`),
      secondCarRanking: countRanking(segmentPositionCounts[1], rows.length, (carNo) => `${carNo}番車`),
      thirdCarRanking: countRanking(segmentPositionCounts[2], rows.length, (carNo) => `${carNo}番車`),
      quinellaLikeTopPairs: countRanking(segmentPairCounts, rows.length, (pair) => pair),
    };
  };
  const rankingSegments = (
    axis: "venue" | "raceClass" | "venueRaceClass",
    segmentKey: (race: typeof eligiblePayoutRaces[number]) => string,
    segmentLabel: (race: typeof eligiblePayoutRaces[number]) => string,
  ): KurariExTrifectaRankingSegment[] => {
    const groups = new Map<string, typeof eligiblePayoutRaces>();
    eligiblePayoutRaces.forEach((race) => {
      const value = segmentKey(race);
      if (!value) return;
      const key = axis === "venueRaceClass"
        ? `${race.venueCode || race.venueName}|${value}`
        : value;
      const group = groups.get(key) ?? [];
      group.push(race);
      groups.set(key, group);
    });
    return [...groups.entries()]
      .map(([key, rows]) => summarizeRankingSegment(key, rows, segmentKey, segmentLabel))
      .sort((left, right) =>
        right.sampleSize - left.sampleSize
        || (left.venueCode ?? "").localeCompare(right.venueCode ?? "", "ja", { numeric: true })
        || left.segmentKey.localeCompare(right.segmentKey, "ja", { numeric: true }),
      );
  };
  const byRankingVenue = rankingSegments(
    "venue",
    (race) => race.venueCode || race.venueName,
    (race) => race.venueName,
  );
  const byRankingRaceClass = rankingSegments(
    "raceClass",
    (race) => race.raceClass ?? "",
    (race) => race.raceClassLabel,
  );
  const byRankingVenueRaceClass = rankingSegments(
    "venueRaceClass",
    (race) => race.raceClass ?? "",
    (race) => `${race.venueName} / ${race.raceClassLabel}`,
  );
  const raceClassSourceBackedCount = eligiblePayoutRaces.filter((race) => race.raceClass != null).length;
  const raceClassSummary = {
    sourceBackedCount: raceClassSourceBackedCount,
    unknownCount: eligiblePayoutRaces.length - raceClassSourceBackedCount,
    sClassCount: eligiblePayoutRaces.filter((race) => race.raceClass === "s-class").length,
    aClassCount: eligiblePayoutRaces.filter((race) => race.raceClass === "a-class").length,
    lClassCount: eligiblePayoutRaces.filter((race) => race.raceClass === "l-class").length,
  };
  const payouts = eligiblePayoutRaces.map((race) => race.payoutYen);
  const breakdown = (
    key: (race: typeof eligiblePayoutRaces[number]) => string,
    label: (race: typeof eligiblePayoutRaces[number]) => string,
  ) => {
    const groups = new Map<string, { label: string; payouts: number[] }>();
    eligiblePayoutRaces.forEach((race) => {
      const groupKey = key(race);
      if (!groupKey) return;
      const group = groups.get(groupKey) ?? { label: label(race), payouts: [] };
      group.payouts.push(race.payoutYen);
      groups.set(groupKey, group);
    });
    return [...groups.entries()]
      .map(([groupKey, group]) => payoutSummary(groupKey, group.label, group.payouts))
      .sort((left, right) =>
        Number(left.key) - Number(right.key)
        || left.label.localeCompare(right.label, "ja", { numeric: true }),
      );
  };
  const turbulenceSegmentSampleStatus = (sampleSize: number): KurariExTurbulenceSegmentSampleStatus => {
    if (sampleSize >= 80) return "strong";
    if (sampleSize >= 30) return "medium";
    return "weak";
  };
  const turbulenceThreshold = (key: KurariExTurbulenceCategoryKey) =>
    TURBULENCE_CATEGORY_DEFINITIONS.find((definition) => definition.key === key)?.min ?? Number.POSITIVE_INFINITY;
  const highPayoutThreshold = turbulenceThreshold("upset");
  const veryHighPayoutThreshold = turbulenceThreshold("major-upset");
  const ultraHighPayoutThreshold = turbulenceThreshold("extreme-upset");
  const raceBandLabels: Record<typeof eligiblePayoutRaces[number]["raceBand"], string> = {
    early: "early 1〜4R",
    middle: "middle 5〜8R",
    late: "late 9R以降",
  };
  const summarizeTurbulenceSegment = (
    key: string,
    rows: typeof eligiblePayoutRaces,
    segmentValue: (race: typeof eligiblePayoutRaces[number]) => string,
    segmentLabel: (race: typeof eligiblePayoutRaces[number]) => string,
  ): KurariExTurbulenceSegment => {
    const first = rows[0];
    const payoutsForSegment = rows.map((race) => race.payoutYen);
    return {
      key,
      label: `${first.venueName} / ${segmentLabel(first)}`,
      venueCode: first.venueCode,
      venueName: first.venueName,
      segmentKey: segmentValue(first),
      segmentLabel: segmentLabel(first),
      sampleSize: rows.length,
      sampleStatus: turbulenceSegmentSampleStatus(rows.length),
      averageTrifectaPayoutYen: Math.round(payoutsForSegment.reduce((sum, payout) => sum + payout, 0) / rows.length),
      medianTrifectaPayoutYen: median(payoutsForSegment),
      highPayoutRate: rate(rows.filter((race) => race.payoutYen >= highPayoutThreshold).length, rows.length),
      veryHighPayoutRate: rate(rows.filter((race) => race.payoutYen >= veryHighPayoutThreshold).length, rows.length),
      ultraHighPayoutRate: rate(rows.filter((race) => race.payoutYen >= ultraHighPayoutThreshold).length, rows.length),
      maxTrifectaPayoutYen: Math.max(...payoutsForSegment),
    };
  };
  const turbulenceSegments = (
    segmentKey: "raceBand" | "carCount",
    segmentValue: (race: typeof eligiblePayoutRaces[number]) => string,
    segmentLabel: (race: typeof eligiblePayoutRaces[number]) => string,
  ): KurariExTurbulenceSegment[] => {
    const groups = new Map<string, typeof eligiblePayoutRaces>();
    eligiblePayoutRaces.forEach((race) => {
      const value = segmentValue(race);
      if (!value) return;
      const venueKey = race.venueCode || race.venueName;
      const key = `${venueKey}|${segmentKey}|${value}`;
      const group = groups.get(key) ?? [];
      group.push(race);
      groups.set(key, group);
    });
    return [...groups.entries()]
      .map(([key, rows]) => summarizeTurbulenceSegment(key, rows, segmentValue, segmentLabel))
      .sort((left, right) =>
        right.sampleSize - left.sampleSize
        || left.venueCode.localeCompare(right.venueCode, "ja", { numeric: true })
        || left.segmentKey.localeCompare(right.segmentKey, "ja", { numeric: true }),
      );
  };
  const byVenueRaceBand = turbulenceSegments(
    "raceBand",
    (race) => race.raceBand,
    (race) => raceBandLabels[race.raceBand],
  );
  const byVenueCarCount = turbulenceSegments(
    "carCount",
    (race) => race.carCount == null ? "" : String(race.carCount),
    (race) => `${race.carCount}車`,
  );
  const highestPayoutRace = eligiblePayoutRaces.reduce<typeof eligiblePayoutRaces[number] | null>(
    (highest, race) => !highest || race.payoutYen > highest.payoutYen ? race : highest,
    null,
  );
  const turbulenceSample = sampleStatus(eligibleRaceCount);
  const getChainResult = memoizeOnce((): KurariExRaceChainV1 => {
  const eligibleRaceByKey = new Map(eligiblePayoutRaces.map((race) => [race.raceKey, race]));
  const chainExclusionCounts = new Map<string, number>();
  const chainPairs: Array<{
    previous: typeof eligiblePayoutRaces[number];
    next: typeof eligiblePayoutRaces[number];
    previousCategory: KurariExTurbulenceCategoryKey;
    nextCategory: KurariExTurbulenceCategoryKey;
    type: KurariExRaceChainTypeKey;
  }> = [];
  let transitionCandidateCount = 0;
  const excludeChain = (reason: string) => {
    chainExclusionCounts.set(reason, (chainExclusionCounts.get(reason) ?? 0) + 1);
  };
  const chainReasonForRace = (reason: string | null) => {
    if (reason === "source-unavailable") return "source-unavailable";
    if (reason === "duplicate-race-key") return "duplicate-race-key";
    if (reason === "cancelled-or-no-race") return "cancelled-or-no-race";
    if (reason === "not-confirmed") return "not-confirmed";
    if (reason === "payout-missing-or-invalid") return "payout-or-category-unavailable";
    if (reason) return "race-result-unavailable";
    return null;
  };
  const chainGroups = new Map<string, Array<{
    index: number;
    raceKey: string;
    raceNumber: number;
  }>>();
  candidates.forEach(({ venue, race }, index) => {
    const date = clean(venue.date || sourceDate);
    const venueCode = clean(venue.venueCode);
    const raceNumber = Number(race.raceNumber);
    if (!date || !venueCode) {
      transitionCandidateCount += 1;
      excludeChain("date-or-venue-unavailable");
      return;
    }
    if (!Number.isInteger(raceNumber) || raceNumber <= 0) {
      transitionCandidateCount += 1;
      excludeChain("race-number-missing");
      return;
    }
    const groupKey = `${date}|${venueCode}`;
    const group = chainGroups.get(groupKey) ?? [];
    group.push({ index, raceKey: raceKeys[index], raceNumber });
    chainGroups.set(groupKey, group);
  });
  chainGroups.forEach((group) => {
    const sorted = [...group].sort((left, right) => left.raceNumber - right.raceNumber);
    for (let index = 0; index < sorted.length - 1; index += 1) {
      transitionCandidateCount += 1;
      const previousCandidate = sorted[index];
      const nextCandidate = sorted[index + 1];
      const previousReason = chainReasonForRace(candidateExclusionReasons[previousCandidate.index]);
      const nextReason = chainReasonForRace(candidateExclusionReasons[nextCandidate.index]);
      if (previousReason === "duplicate-race-key" || nextReason === "duplicate-race-key") {
        excludeChain("duplicate-race-key");
        continue;
      }
      if (nextCandidate.raceNumber !== previousCandidate.raceNumber + 1) {
        excludeChain("race-number-not-contiguous");
        continue;
      }
      if (previousReason || nextReason) {
        excludeChain(previousReason ?? nextReason ?? "race-result-unavailable");
        continue;
      }
      const previous = eligibleRaceByKey.get(previousCandidate.raceKey);
      const next = eligibleRaceByKey.get(nextCandidate.raceKey);
      if (!previous || !next) {
        excludeChain("payout-or-category-unavailable");
        continue;
      }
      const previousCategory = payoutCategoryKey(previous.payoutYen);
      const nextCategory = payoutCategoryKey(next.payoutYen);
      chainPairs.push({
        previous,
        next,
        previousCategory,
        nextCategory,
        type: chainType(previousCategory, nextCategory),
      });
    }
  });
  const chainSample = sampleStatus(chainPairs.length);
  const chainTypeCounts = new Map<KurariExRaceChainTypeKey, number>();
  const matrixCounts = new Map<string, number>();
  chainPairs.forEach((pair) => {
    chainTypeCounts.set(pair.type, (chainTypeCounts.get(pair.type) ?? 0) + 1);
    const matrixKey = `${pair.previousCategory}|${pair.nextCategory}`;
    matrixCounts.set(matrixKey, (matrixCounts.get(matrixKey) ?? 0) + 1);
  });
  const afterUpsetPairs = chainPairs.filter((pair) => isUpsetOrAbove(pair.previousCategory));
  const favoriteReturnCount = afterUpsetPairs.filter((pair) => pair.nextCategory === "firm").length;
  const upsetChainCount = afterUpsetPairs.filter((pair) => isUpsetOrAbove(pair.nextCategory)).length;
  const categoryKeys = TURBULENCE_CATEGORY_DEFINITIONS.map((definition) => definition.key);
  const chainSegmentSampleStatus = (sampleSize: number): KurariExRaceChainSegmentSampleStatus => {
    if (sampleSize >= 80) return "strong";
    if (sampleSize >= 30) return "medium";
    return "weak";
  };
  const summarizeChainSegment = (
    key: string,
    pairs: typeof chainPairs,
    segmentKey: (pair: typeof chainPairs[number]) => string,
    segmentLabel: (pair: typeof chainPairs[number]) => string,
  ): KurariExRaceChainSegment => {
    const first = pairs[0];
    const favoriteReturnCountInSegment = pairs.filter((pair) => pair.type === "favorite-return").length;
    const turbulenceContinueCount = pairs.filter((pair) => pair.type === "upset-chain").length;
    const middleContinueCount = pairs.filter((pair) => pair.type === "mid-upset-continues").length;
    const turbulenceAccelerationCount = pairs.filter((pair) => pair.type === "upset-acceleration").length;
    const nextPayouts = pairs.map((pair) => pair.next.payoutYen);
    return {
      key,
      label: `${first.previous.venueName} / ${segmentLabel(first)}`,
      venueCode: first.previous.venueCode,
      venueName: first.previous.venueName,
      segmentKey: segmentKey(first),
      segmentLabel: segmentLabel(first),
      sampleSize: pairs.length,
      sampleStatus: chainSegmentSampleStatus(pairs.length),
      favoriteReturnRate: rate(favoriteReturnCountInSegment, pairs.length),
      turbulenceContinueRate: rate(turbulenceContinueCount, pairs.length),
      middleContinueRate: rate(middleContinueCount, pairs.length),
      turbulenceAccelerationRate: rate(turbulenceAccelerationCount, pairs.length),
      averageNextPayoutYen: Math.round(nextPayouts.reduce((sum, payout) => sum + payout, 0) / pairs.length),
      highNextPayoutRate: rate(pairs.filter((pair) => pair.next.payoutYen >= highPayoutThreshold).length, pairs.length),
    };
  };
  const chainSegments = (
    axis: "venue" | "venueRaceBand",
    segmentKey: (pair: typeof chainPairs[number]) => string,
    segmentLabel: (pair: typeof chainPairs[number]) => string,
  ): KurariExRaceChainSegment[] => {
    const groups = new Map<string, typeof chainPairs>();
    chainPairs.forEach((pair) => {
      const value = segmentKey(pair);
      if (!value) return;
      const venueKey = pair.previous.venueCode || pair.previous.venueName;
      const key = `${venueKey}|${axis}|${value}`;
      const group = groups.get(key) ?? [];
      group.push(pair);
      groups.set(key, group);
    });
    return [...groups.entries()]
      .map(([key, pairs]) => summarizeChainSegment(key, pairs, segmentKey, segmentLabel))
      .sort((left, right) =>
        right.sampleSize - left.sampleSize
        || left.venueCode.localeCompare(right.venueCode, "ja", { numeric: true })
        || left.segmentKey.localeCompare(right.segmentKey, "ja", { numeric: true }),
      );
  };
  const byVenue = chainSegments(
    "venue",
    (pair) => pair.previous.venueCode || pair.previous.venueName,
    () => "全連続R",
  );
  const byVenueRaceBand = chainSegments(
    "venueRaceBand",
    (pair) => pair.previous.raceBand,
    (pair) => `前R ${raceBandLabels[pair.previous.raceBand]}`,
  );
  const chainResult: KurariExRaceChainV1 = {
    status: chainPairs.length ? "ready" : "no-eligible-data",
    sourcePolicy: "official result only",
    eligiblePairCount: chainPairs.length,
    excludedPairCount: transitionCandidateCount - chainPairs.length,
    transitionCandidateCount,
    exclusionReasons: [...chainExclusionCounts.entries()].map(([key, count]) => ({
      key,
      label: CHAIN_EXCLUSION_LABELS[key] ?? key,
      count,
    })),
    sampleStatus: chainSample.status,
    sampleLabel: chainSample.label,
    chainTypes: (Object.entries(CHAIN_TYPE_LABELS) as Array<[KurariExRaceChainTypeKey, string]>)
      .map(([key, label]) => {
        const count = chainTypeCounts.get(key) ?? 0;
        return { key, label, count, rate: rate(count, chainPairs.length) };
      }),
    transitionMatrix: categoryKeys.flatMap((previousCategory) =>
      categoryKeys.map((nextCategory) => {
        const count = matrixCounts.get(`${previousCategory}|${nextCategory}`) ?? 0;
        return {
          previousCategory,
          previousLabel: payoutCategoryLabel(previousCategory),
          nextCategory,
          nextLabel: payoutCategoryLabel(nextCategory),
          count,
          rate: rate(count, chainPairs.length),
        };
      }),
    ),
    afterUpset: {
      sampleSize: afterUpsetPairs.length,
      favoriteReturnCount,
      favoriteReturnRate: rate(favoriteReturnCount, afterUpsetPairs.length),
      upsetChainCount,
      upsetChainRate: rate(upsetChainCount, afterUpsetPairs.length),
    },
    byVenue,
    byVenueRaceBand,
    examples: [...chainPairs]
      .sort((left, right) =>
        Math.max(right.previous.payoutYen, right.next.payoutYen)
        - Math.max(left.previous.payoutYen, left.next.payoutYen)
        || left.previous.raceKey.localeCompare(right.previous.raceKey, "ja", { numeric: true }),
      )
      .slice(0, 5)
      .map((pair) => ({
        date: pair.previous.date,
        venueCode: pair.previous.venueCode,
        venueName: pair.previous.venueName,
        previousRaceNumber: pair.previous.raceNumber,
        nextRaceNumber: pair.next.raceNumber,
        previousCategory: pair.previousCategory,
        previousCategoryLabel: payoutCategoryLabel(pair.previousCategory),
        nextCategory: pair.nextCategory,
        nextCategoryLabel: payoutCategoryLabel(pair.nextCategory),
        previousPayoutYen: pair.previous.payoutYen,
        nextPayoutYen: pair.next.payoutYen,
        chainType: pair.type,
        chainTypeLabel: CHAIN_TYPE_LABELS[pair.type],
      })),
  };
  return chainResult;
  });

  const getWeather = memoizeOnce(
    () => buildKurariExWindDecisionV1(feed, sourceIsOfficial, sourceDate),
  );
  const getVenueBias = memoizeOnce(
    () => buildKurariExVenueBiasV1(feed, sourceIsOfficial, sourceDate),
  );
  const getTodayFlow = memoizeOnce(
    () => {
      const todayFeed = options.todayFlowFeed ?? feed;
      const todaySourceDate = clean(todayFeed.date);
      const todaySourceIsOfficial =
        clean(todayFeed.source?.provider) === "KEIRIN.JP"
        && clean(todayFeed.source?.listType) === "JSJ048"
        && /^\d{4}-\d{2}-\d{2}$/u.test(todaySourceDate)
        && !Number.isNaN(Date.parse(clean(todayFeed.generatedAt)));
      return buildKurariExTodayFlowV1(
        todayFeed,
        todaySourceIsOfficial,
        todaySourceDate,
        options.todayFlowBaselineFeed,
      );
    },
  );
  const getPredictionSignals = memoizeOnce(
    () => buildKurariExPredictionSignals(result),
  );
  const result: KurariExTrifectaTrendV1 = {
    status: eligibleRaceCount > 0 ? "ready" : "no-eligible-data",
    sourcePolicy: "official result only",
    sourceName: sourceIsOfficial ? `${provider} ${listType}` : "unknown",
    sourceFetchedAt: sourceIsOfficial ? sourceFetchedAt : "",
    sourceDate: sourceIsOfficial ? sourceDate : "",
    totalRaceCount: candidates.length,
    eligibleRaceCount,
    excludedRaceCount: candidates.length - eligibleRaceCount,
    exclusionReasons: [...exclusionCounts.entries()].map(([key, count]) => ({
      key,
      label: EXCLUSION_LABELS[key] ?? key,
      count,
    })),
    sampleStatus: sample.status,
    sampleLabel: sample.label,
    trifectaRanking: countRanking(trifectaCounts, eligibleRaceCount, (key) => key),
    firstCarRanking: countRanking(positionCounts[0], eligibleRaceCount, (key) => `${key}番車`),
    secondCarRanking: countRanking(positionCounts[1], eligibleRaceCount, (key) => `${key}番車`),
    thirdCarRanking: countRanking(positionCounts[2], eligibleRaceCount, (key) => `${key}番車`),
    carTop3RateRanking,
    rankingSegments: {
      byVenue: byRankingVenue,
      byRaceClass: byRankingRaceClass,
      byVenueRaceClass: byRankingVenueRaceClass,
      raceClassSummary,
    },
    filterReadiness: [
      { key: "all", label: "all", status: "ready", note: "eligible official result全件" },
      { key: "7-car", label: "7車", status: "partial", note: "official finishOrder記録から判定可能" },
      { key: "9-car", label: "9車", status: "partial", note: "official finishOrder記録から判定可能" },
      { key: "a-class", label: "A級", status: raceClassSummary.aClassCount > 0 ? "partial" : "future-accumulation", note: "historical category.raceClassが明示されたraceのみ" },
      { key: "s-class", label: "S級", status: raceClassSummary.sClassCount > 0 ? "partial" : "future-accumulation", note: "historical category.raceClassが明示されたraceのみ" },
      { key: "g-race", label: "Gレース", status: "partial", note: "venue grade確定時のみ" },
      { key: "venue", label: "会場", status: "ready", note: "venueCode / venueNameあり" },
      { key: "race-number", label: "R", status: "ready", note: "raceNumberあり" },
    ],
    turbulence: {
      status: eligibleRaceCount > 0 ? "ready" : "no-eligible-data",
      sourcePolicy: "official result only",
      basis: "actual trifecta payout",
      oddsGapStatus: "future-accumulation",
      totalRaceCount: candidates.length,
      eligibleRaceCount,
      excludedRaceCount: candidates.length - eligibleRaceCount,
      exclusionReasons: [...exclusionCounts.entries()].map(([key, count]) => ({
        key,
        label: EXCLUSION_LABELS[key] ?? key,
        count,
      })),
      sampleStatus: turbulenceSample.status,
      sampleLabel: turbulenceSample.label,
      averagePayoutYen: payouts.length
        ? Math.round(payouts.reduce((sum, payout) => sum + payout, 0) / payouts.length)
        : null,
      medianPayoutYen: payouts.length ? median(payouts) : null,
      maxPayoutYen: payouts.length ? Math.max(...payouts) : null,
      categories: payoutCategories(payouts),
      highestPayoutRace,
      byRaceNumber: breakdown((race) => String(race.raceNumber), (race) => `${race.raceNumber}R`),
      byVenue: breakdown((race) => race.venueCode, (race) => race.venueName),
      byGrade: breakdown(
        (race) => /^G\d*$/iu.test(race.grade) ? race.grade : "",
        (race) => `${race.grade} / Gレース`,
      ),
      byVenueRaceBand,
      byVenueCarCount,
      classGradeReadiness: [
        {
          key: "a-class",
          label: "A級",
          status: "future-accumulation",
          note: "current official resultにraceClassがなく、安全に判定できない",
        },
        {
          key: "s-class",
          label: "S級",
          status: "future-accumulation",
          note: "current official resultにraceClassがなく、安全に判定できない",
        },
        {
          key: "g-race",
          label: "Gレース",
          status: "partial",
          note: "venue gradeがG1〜G3等と明示されたraceだけ集計",
        },
      ],
    },
    chain: undefined as unknown as KurariExRaceChainV1,
    weather: undefined as unknown as KurariExWindDecisionV1,
    venueBias: undefined as unknown as KurariExVenueBiasV1,
    todayFlow: undefined as unknown as KurariExTodayFlowV1,
    predictionSignals: undefined as unknown as KurariExPredictionSignals,
  };
  Object.defineProperties(result, {
    chain: { enumerable: true, get: getChainResult },
    weather: { enumerable: true, get: getWeather },
    venueBias: { enumerable: true, get: getVenueBias },
    todayFlow: { enumerable: true, get: getTodayFlow },
    predictionSignals: { enumerable: true, get: getPredictionSignals },
  });
  return result;
}

let trendLoadPromise: Promise<KurariExTrifectaTrendV1> | null = null;

export function loadKurariExTrifectaTrendV1() {
  if (!trendLoadPromise) {
    trendLoadPromise = loadKurariExTrifectaTrendV1Uncached().catch((error: unknown) => {
      trendLoadPromise = null;
      throw error;
    });
  }
  return trendLoadPromise;
}

async function loadKurariExTrifectaTrendV1Uncached() {
  const [response, history] = await Promise.all([
    fetch(publicPath(RESULT_FEED_PATH), { cache: "no-store" }),
    loadKurariExHistoricalResultTrendLabHistory(),
  ]);
  if (!response.ok) throw new Error(`official result fetch failed: ${response.status}`);
  const currentFeed = await response.json() as OfficialResultFeed;
  const currentSourceDate = clean(currentFeed.date);
  const historicalKeys = new Set(history.races.map((race) => race.raceKey));
  const currentCandidates = (currentFeed.venues ?? []).flatMap((venue) =>
    (venue.races ?? []).map((race) => ({
      venue,
      race,
      raceKey: officialRaceKey(venue, race, currentSourceDate),
    })),
  );
  const currentKeyCounts = new Map<string, number>();
  currentCandidates.forEach(({ raceKey }) => {
    if (raceKey) currentKeyCounts.set(raceKey, (currentKeyCounts.get(raceKey) ?? 0) + 1);
  });
  const currentSourceIsOfficial =
    clean(currentFeed.source?.provider) === "KEIRIN.JP"
    && clean(currentFeed.source?.listType) === "JSJ048"
    && /^\d{4}-\d{2}-\d{2}$/u.test(currentSourceDate)
    && !Number.isNaN(Date.parse(clean(currentFeed.generatedAt)));
  let crossSourceDuplicateCount = 0;
  const currentVenues = (currentFeed.venues ?? []).map((venue) => ({
    ...venue,
    races: (venue.races ?? []).filter((race) => {
      const raceKey = officialRaceKey(venue, race, currentSourceDate);
      if (raceKey && historicalKeys.has(raceKey)) {
        crossSourceDuplicateCount += 1;
        return false;
      }
      return currentSourceIsOfficial
        && Boolean(raceKey)
        && currentKeyCounts.get(raceKey) === 1
        && isCurrentTrendEligible(race);
    }),
  }));
  const currentRaceCount = (currentFeed.venues ?? [])
    .reduce((sum, venue) => sum + (venue.races ?? []).length, 0);
  const currentIncludedRaceCount = currentVenues
    .reduce((sum, venue) => sum + (venue.races ?? []).length, 0);
  const currentExcludedRaceCount =
    currentRaceCount - currentIncludedRaceCount - crossSourceDuplicateCount;

  const historicalTrendRaces = history.races.filter(isHistoricalTrendEligible);
  const historicalVenueGroups = new Map<string, OfficialResultVenue>();
  historicalTrendRaces.forEach((race) => {
    const grade = clean(race.category.grade);
    const groupKey = `${race.date}|${race.venueCode}|${grade}`;
    const venue = historicalVenueGroups.get(groupKey) ?? {
      date: race.date,
      venueCode: race.venueCode,
      venueName: race.venue,
      grade,
      races: [],
    };
    venue.races?.push(historicalRaceToOfficialRace(race));
    historicalVenueGroups.set(groupKey, venue);
  });

  const sourceDate = [currentSourceDate, history.availability.dateRange.to ?? ""]
    .filter(Boolean)
    .sort()
    .at(-1) ?? "";
  const mergedFeed: OfficialResultFeed = {
    date: sourceDate,
    generatedAt: currentFeed.generatedAt,
    source: {
      provider: "KEIRIN.JP",
      listType: "JSJ048",
    },
    venues: [...historicalVenueGroups.values(), ...currentVenues],
  };
  const historicalBaselineFeed: OfficialResultFeed = {
    date: history.availability.dateRange.to ?? sourceDate,
    generatedAt: currentFeed.generatedAt,
    source: {
      provider: "KEIRIN.JP",
      listType: "JSJ048",
    },
    venues: [...historicalVenueGroups.values()],
  };
  const trend = buildKurariExTrifectaTrendV1(mergedFeed, {
    todayFlowFeed: currentFeed,
    todayFlowBaselineFeed: historicalBaselineFeed,
  });
  const classificationCount = history.index?.summary?.classificationCount ?? {};
  trend.sourceName = "historical 60日 + current";
  trend.sourceSummary = {
    label: "historical 60日 + current",
    historical: history.availability,
    sourceRejectedCount: history.index?.summary?.sourceRejectedCount ?? 0,
    refundNoTrifectaExcludedCount: classificationCount["refund-no-trifecta"] ?? 0,
    notFinalizedExcludedCount: classificationCount["not-finalized"] ?? 0,
    currentRaceCount,
    currentIncludedRaceCount,
    currentExcludedRaceCount,
    crossSourceDuplicateCount,
    analysisRaceCount: trend.eligibleRaceCount,
  };
  return trend;
}

function officialRaceKey(
  venue: OfficialResultVenue,
  race: OfficialResultRace,
  fallbackDate: string,
) {
  const date = clean(venue.date || fallbackDate);
  const venueCode = clean(venue.venueCode);
  const raceNumber = Number(race.raceNumber);
  return date && venueCode && Number.isInteger(raceNumber) && raceNumber > 0
    ? `${date}|${venueCode}|${raceNumber}`
    : "";
}

function isCurrentTrendEligible(race: OfficialResultRace) {
  if (["cancelled", "no-race"].includes(clean(race.operationStatus).toLowerCase())) return false;
  if (clean(race.resultStatus) !== "confirmed") return false;
  const ranked = (race.finishOrder ?? [])
    .map((row) => ({ rank: Number(clean(row.rank)), carNo: validCarNo(row.carNo) }))
    .filter((row) => Number.isInteger(row.rank) && row.rank >= 1 && row.rank <= 3)
    .sort((left, right) => left.rank - right.rank);
  if (ranked.length !== 3 || ranked.some((row, position) => row.rank !== position + 1)) {
    return false;
  }
  const top3 = ranked.map((row) => row.carNo);
  return top3.every((carNo): carNo is number => carNo !== null)
    && new Set(top3).size === 3
    && clean(race.payout3tan?.combination) === top3.join("-")
    && positiveYen(race.payout3tan?.payoutYen) !== null;
}

function isHistoricalTrendEligible(race: KurariExHistoricalRace) {
  const top3 = [
    race.result.firstCarNo,
    race.result.secondCarNo,
    race.result.thirdCarNo,
  ];
  return race.trendEligible === true
    && race.status === "confirmed"
    && race.deadHeat?.detected !== true
    && race.provenance.result.status === "present"
    && race.provenance.payout.status === "present"
    && top3.every((carNo) => Number.isInteger(carNo) && Number(carNo) >= 1 && Number(carNo) <= 9)
    && new Set(top3).size === 3
    && race.result.trifecta === top3.join("-")
    && Number.isInteger(race.result.trifectaPayoutYen)
    && Number(race.result.trifectaPayoutYen) > 0;
}

function historicalRaceToOfficialRace(race: KurariExHistoricalRace): OfficialResultRace {
  return {
    raceNumber: race.raceNumber,
    resultStatus: "confirmed",
    operationStatus: "finished",
    finishOrder: [
      { rank: 1, carNo: race.result.firstCarNo, kimarite: race.kimarite.first },
      { rank: 2, carNo: race.result.secondCarNo, kimarite: race.kimarite.second },
      { rank: 3, carNo: race.result.thirdCarNo },
    ],
    kimarite: race.kimarite.first,
    secondKimarite: race.kimarite.second,
    bLeaderCarNo: race.bSb.bCarNo,
    carCount: race.category.carCount,
    raceClass: race.category.raceClass,
    weatherActual: {
      condition: race.weather.weather,
      windSpeedMps: race.weather.windSpeed,
    },
    payout3tan: {
      combination: race.result.trifecta,
      payoutYen: race.result.trifectaPayoutYen,
    },
  };
}
