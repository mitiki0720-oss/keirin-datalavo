export type RaceGrade = "GP" | "GI" | "GII" | "GIII" | "F1" | "F2";

export type RaceSession = "morning" | "day" | "night" | "midnight" | "unknown";

export type RaceScheduleSource = "ctc" | "manual" | "keirin-jp" | "unknown";

export type RaceScheduleProvenance = {
  provider?: string;
  url?: string;
  requestedMonth?: string;
  fetchedAt?: string;
  rawSha256?: string;
  rawBytes?: number;
};

export type RaceScheduleItem = {
  id: string;
  venue: string;
  title: string;
  grade: RaceGrade;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  session: RaceSession;
  hasGirls: boolean;
  source: RaceScheduleSource;
  venueCode?: string;
  provenance?: RaceScheduleProvenance[];
  operationStatus?: string;
  periodStatus?: string;
  validationStatus?: string;
  note?: string;
};
