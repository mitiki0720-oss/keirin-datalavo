export type DailyMetricItem = {
  date: string; // YYYY-MM-DD
  profitLoss?: number;
  hitRate?: number;
  recoveryRate?: number;
  note?: string;
};

export type DailyMetricInput = Omit<DailyMetricItem, "date">;

export type DailyMetricsMonthBlock = {
  month: string; // YYYY-MM
  items: Record<string, DailyMetricInput>;
};
