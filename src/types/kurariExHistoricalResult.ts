export const KURARI_EX_HISTORICAL_RESULT_VERSION =
  "kurari-ex-result-trend-lab-history/v1" as const;

export type KurariExHistoricalAvailabilityStatus =
  | "unavailable"
  | "partial"
  | "implemented";

export type KurariExHistoricalSourceStatus =
  | "official"
  | "partial"
  | "unavailable"
  | "invalid";

export type KurariExHistoricalShardStatus =
  | "ready"
  | "partial"
  | "unavailable"
  | "invalid";

export type KurariExHistoricalFieldProvenanceStatus =
  | "present"
  | "absent-in-source"
  | "not-collected"
  | "source-unavailable"
  | "invalid"
  | "conflict";

export type KurariExHistoricalCoverageField =
  | "result"
  | "payout"
  | "kimarite"
  | "weather"
  | "odds"
  | "entries"
  | "lineup"
  | "bSb";

export const KURARI_EX_HISTORICAL_COVERAGE_FIELDS: readonly KurariExHistoricalCoverageField[] = [
  "result",
  "payout",
  "kimarite",
  "weather",
  "odds",
  "entries",
  "lineup",
  "bSb",
];

export type KurariExHistoricalFieldProvenance = {
  status: KurariExHistoricalFieldProvenanceStatus;
  sourceRef?: string | null;
  note?: string | null;
};

export type KurariExHistoricalRaceProvenance = Record<
  KurariExHistoricalCoverageField,
  KurariExHistoricalFieldProvenance
>;

export type KurariExHistoricalSource = {
  provider: string;
  endpoint: string | null;
  sourceUrl: string | null;
  listType: string | null;
  detailType: string | null;
  fetchedAt: string;
  sourceDate: string;
  responseHash: string;
  parserVersion: string;
};

export type KurariExHistoricalRace = {
  raceKey: string;
  date: string;
  venue: string;
  venueCode: string;
  raceNumber: number;
  status: "confirmed" | "cancelled" | "unavailable";
  result: {
    firstCarNo: number | null;
    secondCarNo: number | null;
    thirdCarNo: number | null;
    trifecta: string | null;
    trifectaPayoutYen: number | null;
  };
  kimarite: {
    first: string | null;
    second: string | null;
  };
  weather: {
    weather: string | null;
    windSpeed: number | null;
    windDirection: string | null;
    windDirectionBackstretchVector: string | null;
  };
  category: {
    grade: string | null;
    raceClass: string | null;
    carCount: number | null;
    timeBand: "morning" | "day" | "night" | "midnight" | null;
  };
  odds: {
    favoriteRank: number | null;
    firstFavoriteCombination: string | null;
    closingOddsAvailable: boolean | null;
    oddsMovementAvailable: boolean | null;
  };
  lineup: {
    raw: string | null;
    structured: number[][] | null;
    lineCount: number | null;
    sourceStatus: KurariExHistoricalFieldProvenanceStatus;
  };
  bSb: {
    bRider: string | null;
    bCarNo: number | null;
    sbAvailable: boolean | null;
  };
  source: KurariExHistoricalSource;
  provenance: KurariExHistoricalRaceProvenance;
};

export type KurariExHistoricalCoverageEntry = {
  status: KurariExHistoricalAvailabilityStatus;
  availableRaceCount: number;
  totalRaceCount: number;
};

export type KurariExHistoricalCoverage = Record<
  KurariExHistoricalCoverageField,
  KurariExHistoricalCoverageEntry
>;

export type KurariExHistoricalIndexShard = {
  date: string;
  path: string;
  raceCount: number;
  status: KurariExHistoricalShardStatus;
  sourceSummary: {
    providers: string[];
    fetchedAtFrom: string | null;
    fetchedAtTo: string | null;
  };
};

export type KurariExHistoricalIndex = {
  version: typeof KURARI_EX_HISTORICAL_RESULT_VERSION;
  generatedAt: string;
  sourceStatus: KurariExHistoricalSourceStatus;
  range: {
    from: string;
    to: string;
  };
  shardCount: number;
  raceCount: number;
  shards: KurariExHistoricalIndexShard[];
  provenance: {
    provider: string;
    generator: string;
    parserVersion: string;
    generatedAt: string;
  };
  coverage: KurariExHistoricalCoverage;
};

export type KurariExHistoricalDailyShard = {
  version: typeof KURARI_EX_HISTORICAL_RESULT_VERSION;
  date: string;
  generatedAt: string;
  sourceStatus: KurariExHistoricalSourceStatus;
  races: KurariExHistoricalRace[];
};

export type KurariExHistoricalRejectedReason = {
  reason: string;
  count: number;
};

export type KurariExHistoricalAvailabilitySummary = {
  status: KurariExHistoricalAvailabilityStatus;
  indexFound: boolean;
  shardCount: number;
  loadedShardCount: number;
  raceCount: number;
  acceptedRaceCount: number;
  rejectedRaceCount: number;
  rejectedReasons: KurariExHistoricalRejectedReason[];
  dateRange: {
    from: string | null;
    to: string | null;
  };
  sourceProviders: string[];
  coverageByField: KurariExHistoricalCoverage;
  canUseForTrendLab: boolean;
  notes: string[];
};

export type KurariExHistoricalValidationIssue = {
  scope: "index" | "shard" | "race";
  reason: string;
  path: string;
  raceKey?: string;
};

export type KurariExHistoricalIndexLoadResult = {
  status: "loaded" | "not-found" | "invalid" | "unavailable";
  index: KurariExHistoricalIndex | null;
  issues: KurariExHistoricalValidationIssue[];
};

export type KurariExHistoricalShardLoadResult = {
  date: string;
  path: string;
  status: "loaded" | "missing" | "invalid" | "unavailable";
  shard: KurariExHistoricalDailyShard | null;
  acceptedRaces: KurariExHistoricalRace[];
  rejectedRaces: unknown[];
  issues: KurariExHistoricalValidationIssue[];
};

export type KurariExHistoricalHistoryLoadResult = {
  index: KurariExHistoricalIndex | null;
  shards: KurariExHistoricalShardLoadResult[];
  races: KurariExHistoricalRace[];
  availability: KurariExHistoricalAvailabilitySummary;
};
