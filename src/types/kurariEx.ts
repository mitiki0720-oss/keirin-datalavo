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
