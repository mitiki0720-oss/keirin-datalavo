import type { KurariExRiderRecentForm } from "../types/kurariEx";

export type RiderFormChange = {
  recent: KurariExRiderRecentForm;
  previousStarts: number;
  previousWins: number;
  previousTop2: number;
  previousTop3: number;
  winRateChange: number;
  top2RateChange: number;
  top3RateChange: number;
};

export function getRiderFormChange(rows: KurariExRiderRecentForm[]): RiderFormChange | null {
  const recent = rows.find((row) => row.windowSize === 5);
  const ten = rows.find((row) => row.windowSize === 10);
  if (!recent?.windowComplete || !ten?.windowComplete || recent.sampleSize !== 5 || ten.sampleSize !== 10) return null;
  const validPlaces = (row: KurariExRiderRecentForm) =>
    [row.wins, row.seconds, row.thirds].every((count) => Number.isInteger(count) && count >= 0)
    && row.wins + row.seconds + row.thirds <= row.sampleSize;
  if (!validPlaces(recent) || !validPlaces(ten)) return null;
  const previousStarts = ten.sampleSize - recent.sampleSize;
  const previousWins = ten.wins - recent.wins;
  const previousTop2 = ten.wins + ten.seconds - recent.wins - recent.seconds;
  const previousTop3 = ten.wins + ten.seconds + ten.thirds - recent.wins - recent.seconds - recent.thirds;
  if (previousStarts !== 5 || previousWins < 0 || previousWins > 5 || previousTop2 < previousWins || previousTop3 < previousTop2 || previousTop3 > 5) return null;
  const rate = (count: number, starts: number) => count * 100 / starts;
  return {
    recent,
    previousStarts,
    previousWins,
    previousTop2,
    previousTop3,
    winRateChange: rate(recent.wins, 5) - rate(previousWins, 5),
    top2RateChange: rate(recent.wins + recent.seconds, 5) - rate(previousTop2, 5),
    top3RateChange: rate(recent.wins + recent.seconds + recent.thirds, 5) - rate(previousTop3, 5),
  };
}

export function getRiderFormFreshness(periodTo: string | null, generatedAt: string | null, today: string): "STALE" | "UNAVAILABLE" | "CURRENT" {
  const validDate = (value: string | null) => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  };
  if (!validDate(periodTo) || !validDate(today) || !generatedAt || !Number.isFinite(Date.parse(generatedAt)) || !periodTo || periodTo > today) return "UNAVAILABLE";
  const previousDay = new Date(`${today}T00:00:00Z`);
  previousDay.setUTCDate(previousDay.getUTCDate() - 1);
  return periodTo < previousDay.toISOString().slice(0, 10) ? "STALE" : "CURRENT";
}
