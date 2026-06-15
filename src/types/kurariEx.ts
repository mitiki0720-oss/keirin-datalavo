export type KurariExSourceType = "SEED" | "EXACT" | "PROXY" | "MANUAL";

export type KurariExPeriod = {
  from: string | null;
  to: string | null;
};

export type KurariExIndex = {
  schemaVersion: number;
  generatedAt: string;
  venueCount: number;
  seedSourceCount: number;
  exactRaceCount: number;
  manualTagCount: number;
  files: string[];
  warnings: string[];
};

export type KurariExStatus = {
  schemaVersion: number;
  lastImportAt: string;
  archiveCount: number;
  rawInputFileCount: number;
  predictionFileCount: number;
  resultFileCount: number;
  summaryFileCount: number;
  dateFrom: string | null;
  dateTo: string | null;
  venueCount: number;
  completeTripletCount: number;
  missingSummaryCount: number;
  irregularFilenameCount: number;
  parsedSummaryCount: number;
  skippedSummaryCount: number;
  inputFileCount: number;
  parsedFileCount: number;
  skippedFileCount: number;
  warningCount: number;
  outputBytes: number;
  oversizedFiles: string[];
};

export type KurariExKpi = {
  sourceType: KurariExSourceType;
  sourceCount: number | null;
  raceCount: number | null;
  trifectaHits: number | null;
  trifectaHitRate: number | null;
  exactaHits: number | null;
  exactaHitRate: number | null;
  anyTicketHits: number | null;
  hitRate: number | null;
  investmentYen: number | null;
  returnYen: number | null;
  recoveryRate: number | null;
  kimarite?: {
    escape: number | null;
    makuri: number | null;
    sashi: number | null;
  };
};

export type KurariExGlobalKpi = {
  schemaVersion: number;
  generatedAt: string;
  source: string;
  sourceType: KurariExSourceType;
  period: KurariExPeriod;
  kpi: KurariExKpi;
};

export type KurariExSeedInsight = {
  tag: string;
  label: string;
  evidenceCount: number;
  confidence: "low" | "medium" | "high" | string;
  sourceType: KurariExSourceType;
};

export type KurariExVenue = {
  schemaVersion: number;
  venueKey: string;
  venueName: string;
  updatedAt: string;
  source: string;
  sourceType: KurariExSourceType;
  period: KurariExPeriod;
  quality: {
    seedSources: number;
    parsedDateSources: number;
    exactRaceCount: number;
    status: string;
  };
  seedKpi?: KurariExKpi;
  seedInsights: KurariExSeedInsight[];
  seedNotes: {
    features: string[];
    targets: string[];
    cautions: string[];
    improvements: string[];
  };
  predictionGuidance: string[];
};

export type KurariExGuidance = {
  schemaVersion: number;
  venueKey: string;
  venueName: string;
  updatedAt: string;
  source: string;
  sourceType: KurariExSourceType;
  period: KurariExPeriod;
  items: Array<{
    text: string;
    sourceType: KurariExSourceType;
  }>;
};

export type KurariExVenueListItem = {
  venueKey: string;
  venueName: string;
  venueFile: string;
  guidanceFile?: string;
};

export type KurariExInitialData = {
  index: KurariExIndex;
  status: KurariExStatus;
  globalKpi: KurariExGlobalKpi;
  venues: KurariExVenueListItem[];
};

export type KurariExVenueBundle = {
  venue: KurariExVenue;
  guidance: KurariExGuidance | null;
};

export type KurariExMetric = {
  count: number;
  total: number;
  rate: number | null;
  sourceType: "EXACT";
  quality: "ok" | "low-sample";
};

export type KurariExExactMetricGroup = {
  trifectaHitRate: KurariExMetric;
  exactaHitRate: KurariExMetric;
  anyHitRate: KurariExMetric;
  exactaSalvageRate: KurariExMetric;
  thirdOnlyMissRate: KurariExMetric;
  headMissRate: KurariExMetric;
};

export type KurariExExactRacePattern = {
  escapeWinRate: KurariExMetric;
  makuriWinRate: KurariExMetric;
  sashiWinRate: KurariExMetric;
  sameLineTop2Rate: KurariExMetric;
  sameLineTop3Rate: KurariExMetric;
  otherLineThirdRate: KurariExMetric;
  singleThirdRate: KurariExMetric;
  bRiderInsideTop3Rate: KurariExMetric;
  favoriteTrifectaHitRate: KurariExMetric;
};

export type KurariExExactDimensionEntry = {
  raceCount: number;
  predictionKpi: KurariExExactMetricGroup;
  racePattern: KurariExExactRacePattern;
};

export type KurariExExactDimensions = {
  timeslot: Record<string, KurariExExactDimensionEntry>;
  raceClass: Record<string, KurariExExactDimensionEntry>;
  lineCount: Record<string, KurariExExactDimensionEntry>;
  windSpeedMps: Record<string, KurariExExactDimensionEntry>;
};

export type KurariExExactIndex = {
  schemaVersion: number;
  generatedAt: string;
  sourceType: "EXACT";
  period: KurariExPeriod;
  venueCount: number;
  normalizedRaceCount: number;
  files: string[];
  warningCount: number;
};

export type KurariExExactStatus = {
  schemaVersion: number;
  generatedAt: string;
  sourceType: "EXACT";
  normalizedRaceCount: number;
  venueCount: number;
  warningCount: number;
  outputFileCount: number;
  outputBytes: number;
};

export type KurariExExactAnalytics = {
  schemaVersion: number;
  sourceType: "EXACT";
  generatedAt: string;
  period: KurariExPeriod;
  coverage: {
    normalizedRaces: number;
    resultParsed: number;
    predictionParsed: number;
    lineupParsed: number;
  };
  predictionKpi: KurariExExactMetricGroup;
  racePattern: KurariExExactRacePattern;
  dimensions: KurariExExactDimensions;
  warnings: string[];
};

export type KurariExExactGlobalKpi = KurariExExactAnalytics;

export type KurariExVenueExact = KurariExExactAnalytics & {
  venueKey: string;
  venueName: string;
};

export type KurariExExactVenueListItem = {
  venueKey: string;
  venueName: string;
  exactFile: string;
};

export type KurariExExactInitialData = {
  index: KurariExExactIndex;
  status: KurariExExactStatus;
  globalKpi: KurariExExactGlobalKpi;
  venues: KurariExExactVenueListItem[];
};

export type KurariExPredictionContext = {
  timeslot?: string | null;
  raceTime?: string | null;
  raceTitle?: string | null;
  isGirls?: boolean;
  lineup?: string | null;
  windSpeedKmh?: number | null;
};

export type KurariExRiderQuality =
  | "complete"
  | "partial"
  | "low-sample"
  | "identity-only";

export type KurariExRiderMetric = {
  count: number;
  total: number | null;
  rate: number | null;
  sourceType: "EXACT";
  quality?: "ok" | "low-sample" | "unavailable";
};

export type KurariExRiderAggregate = {
  starts: number | null;
  wins: number;
  seconds: number;
  thirds: number;
  outside: number | null;
  winRate: KurariExRiderMetric;
  top2Rate: KurariExRiderMetric;
  top3Rate: KurariExRiderMetric;
  sourceType: "EXACT";
  differenceWinRate?: KurariExRiderMetric;
};

export type KurariExRiderExactIndexItem = {
  registrationNo: string;
  name: string;
  nameKey: string;
  prefecture: string;
  class: string;
  file: string;
  observedRaceCount: number;
  confirmedStartCount: number;
  roleEligibleCount: number;
  quality: KurariExRiderQuality;
};

export type KurariExRiderExactIndex = {
  schemaVersion: number;
  generatedAt: string;
  sourceType: "EXACT";
  riderCount: number;
  period: KurariExPeriod;
  items: KurariExRiderExactIndexItem[];
};

export type KurariExRiderExactStatus = {
  schemaVersion: number;
  generatedAt: string;
  sourceType: "EXACT";
  normalizedRaceCount: number;
  riderCount: number;
  qualityCounts: Record<KurariExRiderQuality, number>;
  outputFileCount: number;
  outputBytes: number;
  maxFileBytes: number;
  source: string;
};

export type KurariExRiderDimension = KurariExRiderAggregate & {
  venueKey?: string;
  venueName?: string;
  timeslot?: string;
  raceClass?: string;
  raceStage?: string;
  raceStageLabel?: string;
  weatherCondition?: string;
  weatherLabel?: string;
  bankLength?: number | null;
  bankLengthLabel?: string;
};

export type KurariExRiderExact = {
  schemaVersion: number;
  registrationNo: string;
  name: string;
  nameKey: string;
  sourceType: "EXACT";
  generatedAt: string;
  period: KurariExPeriod;
  identity: {
    status: "registration-no" | "unique-player-card-name" | "same-registration-name" | "manual-override";
    registrationNoResolved: boolean;
  };
  coverage: {
    observedRaceCount: number;
    confirmedStartCount: number;
    resultParsedCount: number;
    roleEligibleCount: number;
    venueCount: number;
  };
  overall: KurariExRiderAggregate;
  winningMethods: {
    escape: KurariExRiderMetric;
    sprint: KurariExRiderMetric;
    difference: KurariExRiderMetric;
  };
  byVenue: KurariExRiderDimension[];
  byTimeslot: KurariExRiderDimension[];
  byClass: KurariExRiderDimension[];
  byRaceStage: KurariExRiderDimension[];
  byWeather: KurariExRiderDimension[];
  byBankLength: KurariExRiderDimension[];
  byRole: {
    front: KurariExRiderAggregate | null;
    bante: KurariExRiderAggregate | null;
    third: KurariExRiderAggregate | null;
    single: KurariExRiderAggregate | null;
  } | null;
  quality: KurariExRiderQuality;
  warnings: string[];
};

export type KurariExRiderExactInitialData = {
  index: KurariExRiderExactIndex;
  status: KurariExRiderExactStatus;
};

export type KurariExMatchupQuality =
  | "sufficient"
  | "low-sample"
  | "partial"
  | string;

export type KurariExMatchupComparableStats = {
  sharedRaceCount: number;
  safeComparableRaceCount: number;
  selfAheadCount: number;
  opponentAheadCount: number;
  selfAheadRate: number | null;
  opponentAheadRate: number | null;
};

export type KurariExMatchupVenueStats = KurariExMatchupComparableStats & {
  venueKey: string;
  venueName: string;
};

export type KurariExMatchupEntry = KurariExMatchupComparableStats & {
  pairKey: string;
  opponentRegistrationNo: string;
  opponentName: string;
  unknownOrderCount: number;
  sameLine: KurariExMatchupComparableStats;
  otherLine: KurariExMatchupComparableStats;
  unknownLineRaceCount: number;
  byVenue: KurariExMatchupVenueStats[];
  quality: KurariExMatchupQuality;
};

export type KurariExMatchupExact = {
  schemaVersion: number;
  sourceType: "EXACT";
  generatedAt: string;
  registrationNo: string;
  name: string;
  period: KurariExPeriod;
  quality: KurariExMatchupQuality;
  coverage: {
    distinctOpponentCount: number;
    sharedRaceCount: number;
    safeComparableRaceCount: number;
    unknownOrderRaceCount: number;
    lineClassifiedRaceCount: number;
  };
  matchups: KurariExMatchupEntry[];
  warnings: string[];
};

export type KurariExMatchupExactIndexItem = {
  registrationNo: string;
  name: string;
  file: string;
  quality: KurariExMatchupQuality;
  distinctOpponentCount: number;
  sharedRaceCount: number;
  safeComparableRaceCount: number;
};

export type KurariExMatchupExactIndex = {
  schemaVersion: number;
  sourceType: "EXACT";
  generatedAt: string;
  period: KurariExPeriod;
  riderCount: number;
  distinctPairCount: number;
  pairObservationCount: number;
  safeComparablePairObservationCount: number;
  qualityCounts: Record<string, number>;
  items: KurariExMatchupExactIndexItem[];
};

export type KurariExMatchupExactStatus = {
  schemaVersion: number;
  sourceType: "EXACT";
  historyRaceCount: number;
  racesWithAtLeastTwoResolvedRiders: number;
  distinctResolvedRiderCount: number;
  distinctPairCount: number;
  pairObservationCount: number;
  safeComparablePairObservationCount: number;
  unknownOrderPairObservationCount: number;
  sameLinePairObservationCount: number;
  otherLinePairObservationCount: number;
  unknownLinePairObservationCount: number;
  riderFileCount: number;
  totalBytes: number;
  maxRiderFileBytes: number;
  warningCount: number;
  generatedAt: string;
  period: KurariExPeriod;
  qualityCounts: Record<string, number>;
};

export type KurariExMatchupExactInitialData = {
  index: KurariExMatchupExactIndex;
  status: KurariExMatchupExactStatus;
};
