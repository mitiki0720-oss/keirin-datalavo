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
