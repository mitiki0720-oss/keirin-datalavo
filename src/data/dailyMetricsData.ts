import type {
  DailyMetricInput,
  DailyMetricItem,
  DailyMetricsMonthBlock,
} from "../types/dailyMetrics";

const createDailyMetricItem = (
  month: string,
  day: string,
  input: DailyMetricInput
): DailyMetricItem => ({
  date: `${month}-${day}`,
  ...input,
});

export const dailyMetricsMonthBlocks: DailyMetricsMonthBlock[] = [
  {
    month: "2026-03",
    items: {
      "31": {
        profitLoss: 8200,
        hitRate: 46,
        recoveryRate: 138,
        note: "準決・決勝の本線が噛み合った日。",
      },
    },
  },
  {
    month: "2026-04",
    items: {
      "01": {
        profitLoss: 2600,
        hitRate: 33,
        recoveryRate: 112,
        note: "本命寄りで小幅プラス。",
      },
      "05": {
        profitLoss: -1200,
        hitRate: 24,
        recoveryRate: 86,
        note: "やや荒れて取り切れず。",
      },
      "10": {
        profitLoss: 5400,
        hitRate: 41,
        recoveryRate: 127,
        note: "注目グレード中心に回収。",
      },

      // 追加例
      // "12": {
      //   profitLoss: 0,
      //   hitRate: 0,
      //   recoveryRate: 0,
      //   note: "",
      // },
    },
  },
];

export const dailyMetricsData: DailyMetricItem[] = dailyMetricsMonthBlocks
  .flatMap((block) =>
    Object.entries(block.items).map(([day, input]) =>
      createDailyMetricItem(block.month, day, input)
    )
  )
  .sort((a, b) => a.date.localeCompare(b.date));

export const dailyMetricsMap = Object.fromEntries(
  dailyMetricsData.map((item) => [item.date, item])
) as Record<string, DailyMetricItem>;

export const dailyMetricsMonths = dailyMetricsMonthBlocks.map((block) => block.month);
