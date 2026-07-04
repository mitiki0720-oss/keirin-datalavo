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

export type KurariExTrifectaTrendV1 = {
  status: "ready" | "no-eligible-data";
  sourcePolicy: "official result only";
  sourceName: string;
  sourceFetchedAt: string;
  sourceDate: string;
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
  turbulence: KurariExTurbulenceV1;
  chain: KurariExRaceChainV1;
  weather: KurariExWindDecisionV1;
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
  weatherActual?: {
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

function rate(count: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((count / total) * 1000) / 10;
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
  }> = [];
  const decisionAliases = new Map<string, KurariExDecisionMethodKey>([
    ["逃", "escape"],
    ["逃げ", "escape"],
    ["捲", "sprint"],
    ["捲り", "sprint"],
    ["差", "difference"],
    ["差し", "difference"],
    ["マ", "mark"],
    ["マーク", "mark"],
  ]);
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
    const winnerKimarite = clean(
      (race.finishOrder ?? []).find((row) => Number(clean(row.rank)) === 1)?.kimarite,
    );
    const raceKimarite = clean(race.kimarite);
    if (!raceKimarite && !winnerKimarite) {
      exclude("decision-missing");
      return;
    }
    const raceDecision = raceKimarite ? decisionAliases.get(raceKimarite) : undefined;
    const winnerDecision = winnerKimarite ? decisionAliases.get(winnerKimarite) : undefined;
    if ((raceKimarite && !raceDecision) || (winnerKimarite && !winnerDecision)) {
      exclude("decision-unknown");
      return;
    }
    if (raceDecision && winnerDecision && raceDecision !== winnerDecision) {
      exclude("decision-conflict");
      return;
    }
    const decisionMethod = raceDecision ?? winnerDecision;
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

export function buildKurariExTrifectaTrendV1(
  feed: OfficialResultFeed,
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
    grade: string;
    combination: string;
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

    eligibleRaceCount += 1;
    eligiblePayoutRaces.push({
      raceKey,
      date: clean(venue.date || sourceDate),
      venueCode: clean(venue.venueCode),
      venueName: clean(venue.venueName) || clean(venue.venueCode),
      raceNumber: Number(race.raceNumber),
      grade: clean(venue.grade),
      combination,
      payoutYen,
    });
    trifectaCounts.set(combination, (trifectaCounts.get(combination) ?? 0) + 1);
    top3.forEach((carNo, position) => {
      const key = String(carNo);
      positionCounts[position].set(key, (positionCounts[position].get(key) ?? 0) + 1);
      top3Counts.set(key, (top3Counts.get(key) ?? 0) + 1);
    });
    const recordedCars = new Set(
      (race.finishOrder ?? []).map((row) => validCarNo(row.carNo)).filter((carNo): carNo is number => carNo != null),
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
  const highestPayoutRace = eligiblePayoutRaces.reduce<typeof eligiblePayoutRaces[number] | null>(
    (highest, race) => !highest || race.payoutYen > highest.payoutYen ? race : highest,
    null,
  );
  const turbulenceSample = sampleStatus(eligibleRaceCount);
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

  return {
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
    filterReadiness: [
      { key: "all", label: "all", status: "ready", note: "eligible official result全件" },
      { key: "7-car", label: "7車", status: "partial", note: "official finishOrder記録から判定可能" },
      { key: "9-car", label: "9車", status: "partial", note: "official finishOrder記録から判定可能" },
      { key: "a-class", label: "A級", status: "future-accumulation", note: "current resultにraceClassなし" },
      { key: "s-class", label: "S級", status: "future-accumulation", note: "current resultにraceClassなし" },
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
    chain: chainResult,
    weather: buildKurariExWindDecisionV1(feed, sourceIsOfficial, sourceDate),
  };
}

export async function loadKurariExTrifectaTrendV1() {
  const response = await fetch(publicPath(RESULT_FEED_PATH), { cache: "no-store" });
  if (!response.ok) throw new Error(`official result fetch failed: ${response.status}`);
  return buildKurariExTrifectaTrendV1(await response.json() as OfficialResultFeed);
}
