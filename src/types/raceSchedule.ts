export type RaceGrade = "GP" | "GI" | "GII" | "GIII" | "F1" | "F2";

export type RaceSession = "day" | "night" | "midnight";

export type RaceScheduleSource = "ctc" | "manual";

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
  note?: string;
};
