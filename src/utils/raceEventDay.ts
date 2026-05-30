export type RaceEventDayLabelOptions = {
  feedDate?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  targetDate?: string | null;
};

export type RaceEventDayInfo = {
  label: string | null;
  dayNumber: number | null;
  currentDay: number;
  totalDays: number;
  isFinalDay: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const parseJstDate = (iso?: string | null) => {
  if (!iso) return null;

  const date = new Date(`${iso}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return null;

  return date;
};

const diffDays = (from: Date, to: Date) => {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
};

export const getRaceEventDayInfo = ({
  feedDate,
  startDate,
  endDate,
  targetDate,
}: RaceEventDayLabelOptions): RaceEventDayInfo | null => {
  const start = parseJstDate(startDate);
  const end = parseJstDate(endDate);
  const target = parseJstDate(feedDate ?? targetDate);

  if (!start || !end || !target) return null;
  if (end.getTime() < start.getTime()) return null;

  const totalDays = Math.max(1, diffDays(start, end) + 1);
  const currentDay = diffDays(start, target) + 1;

  if (currentDay < 1 || currentDay > totalDays) return null;

  const isFinalDay = target.getTime() === end.getTime();
  const label = currentDay === 1
    ? isFinalDay
      ? "初日・最終日"
      : "初日"
    : isFinalDay
      ? `${currentDay}日目・最終日`
      : `${currentDay}日目`;

  return {
    label,
    dayNumber: currentDay,
    currentDay,
    totalDays,
    isFinalDay,
  };
};

export const getRaceEventDayLabel = (options: RaceEventDayLabelOptions) => {
  return getRaceEventDayInfo(options)?.label ?? null;
};

export const resolveRaceEventDay = getRaceEventDayInfo;
