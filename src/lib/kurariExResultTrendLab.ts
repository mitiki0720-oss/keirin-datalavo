export type KurariExTrendSampleStatus = "low-sample" | "caution" | "usable";

export type KurariExTrendRankingRow = {
  key: string;
  label: string;
  count: number;
  rate: number;
};

export type KurariExTrendCarTop3Row = KurariExTrendRankingRow & {
  eligibleStarts: number;
};

export type KurariExTrendFilterReadiness = {
  key: "all" | "7-car" | "9-car" | "a-class" | "s-class" | "g-race" | "venue" | "race-number";
  label: string;
  status: "ready" | "partial" | "future-accumulation";
  note: string;
};

export type KurariExTrifectaTrendV1 = {
  status: "ready" | "no-eligible-data";
  sourcePolicy: "official result only";
  sourceName: string;
  sourceFetchedAt: string;
  sourceDate: string;
  totalRaceCount: number;
  eligibleRaceCount: number;
  excludedRaceCount: number;
  exclusionReasons: Array<{ key: string; label: string; count: number }>;
  sampleStatus: KurariExTrendSampleStatus;
  sampleLabel: string;
  trifectaRanking: KurariExTrendRankingRow[];
  firstCarRanking: KurariExTrendRankingRow[];
  secondCarRanking: KurariExTrendRankingRow[];
  thirdCarRanking: KurariExTrendRankingRow[];
  carTop3RateRanking: KurariExTrendCarTop3Row[];
  filterReadiness: KurariExTrendFilterReadiness[];
};

type OfficialFinishRow = {
  rank?: unknown;
  carNo?: unknown;
};

type OfficialResultRace = {
  raceNumber?: unknown;
  resultStatus?: unknown;
  operationStatus?: unknown;
  finishOrder?: OfficialFinishRow[];
  payout3tan?: {
    combination?: unknown;
    payoutYen?: unknown;
  } | null;
};

type OfficialResultVenue = {
  date?: unknown;
  venueCode?: unknown;
  venueName?: unknown;
  grade?: unknown;
  races?: OfficialResultRace[];
};

type OfficialResultFeed = {
  date?: unknown;
  generatedAt?: unknown;
  source?: {
    provider?: unknown;
    listType?: unknown;
  };
  venues?: OfficialResultVenue[];
};

const RESULT_FEED_PATH = "/data/races/keirin-jp-results.generated.json";

const EXCLUSION_LABELS: Record<string, string> = {
  "source-unavailable": "official sourceまたはsource取得日時が未取得",
  "race-key-missing": "date / venueCode / Rから一意race keyを作れない",
  "duplicate-race-key": "同一race keyが重複",
  "cancelled-or-no-race": "cancelled / no race",
  "not-confirmed": "resultStatusがconfirmedではない",
  "finish-order-missing": "1〜3着車番が不足",
  "invalid-car-number": "車番が1〜9の整数ではない、または上位3車が重複",
  "trifecta-missing-or-mismatch": "3連単結果が未取得、または1〜3着車番と不一致",
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function validCarNo(value: unknown) {
  const normalized = clean(value);
  if (!/^\d+$/u.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isInteger(number) && number >= 1 && number <= 9 ? number : null;
}

function rate(count: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((count / total) * 1000) / 10;
}

function sampleStatus(sampleSize: number): {
  status: KurariExTrendSampleStatus;
  label: string;
} {
  if (sampleSize < 30) return { status: "low-sample", label: "LOW SAMPLE / 参考のみ" };
  if (sampleSize < 100) return { status: "caution", label: "caution / 傾向注意" };
  return { status: "usable", label: "usable trend / 予想の補助" };
}

function countRanking(
  counts: Map<string, number>,
  denominator: number,
  label: (key: string) => string,
) {
  return [...counts.entries()]
    .map(([key, count]) => ({ key, label: label(key), count, rate: rate(count, denominator) }))
    .sort((left, right) =>
      right.count - left.count
      || left.key.localeCompare(right.key, "ja", { numeric: true }),
    );
}

function publicPath(relativePath: string) {
  const base = import.meta.env.BASE_URL.replace(/\/$/u, "");
  return `${base}${relativePath}`;
}

export function buildKurariExTrifectaTrendV1(
  feed: OfficialResultFeed,
): KurariExTrifectaTrendV1 {
  const sourceDate = clean(feed.date);
  const sourceFetchedAt = clean(feed.generatedAt);
  const provider = clean(feed.source?.provider);
  const listType = clean(feed.source?.listType);
  const sourceIsOfficial =
    provider === "KEIRIN.JP"
    && listType === "JSJ048"
    && /^\d{4}-\d{2}-\d{2}$/u.test(sourceDate)
    && !Number.isNaN(Date.parse(sourceFetchedAt));
  const candidates = (feed.venues ?? []).flatMap((venue) =>
    (venue.races ?? []).map((race) => ({ venue, race })),
  );
  const raceKeys = candidates.map(({ venue, race }) => {
    const date = clean(venue.date || sourceDate);
    const venueCode = clean(venue.venueCode);
    const raceNumber = Number(race.raceNumber);
    return date && venueCode && Number.isInteger(raceNumber) && raceNumber > 0
      ? `${date}|${venueCode}|${raceNumber}`
      : "";
  });
  const keyCounts = new Map<string, number>();
  raceKeys.filter(Boolean).forEach((key) => keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1));

  const exclusionCounts = new Map<string, number>();
  const trifectaCounts = new Map<string, number>();
  const positionCounts = [new Map<string, number>(), new Map<string, number>(), new Map<string, number>()];
  const top3Counts = new Map<string, number>();
  const recordedStartCounts = new Map<string, number>();
  let eligibleRaceCount = 0;

  const exclude = (reason: string) => {
    exclusionCounts.set(reason, (exclusionCounts.get(reason) ?? 0) + 1);
  };

  candidates.forEach(({ race }, index) => {
    const raceKey = raceKeys[index];
    if (!sourceIsOfficial) {
      exclude("source-unavailable");
      return;
    }
    if (!raceKey) {
      exclude("race-key-missing");
      return;
    }
    if ((keyCounts.get(raceKey) ?? 0) !== 1) {
      exclude("duplicate-race-key");
      return;
    }
    if (["cancelled", "no-race"].includes(clean(race.operationStatus).toLowerCase())) {
      exclude("cancelled-or-no-race");
      return;
    }
    if (clean(race.resultStatus) !== "confirmed") {
      exclude("not-confirmed");
      return;
    }
    const ranked = (race.finishOrder ?? [])
      .map((row) => ({ rank: Number(clean(row.rank)), carNo: validCarNo(row.carNo) }))
      .filter((row) => Number.isInteger(row.rank) && row.rank >= 1 && row.rank <= 3)
      .sort((left, right) => left.rank - right.rank);
    if (ranked.length !== 3 || ranked.some((row, position) => row.rank !== position + 1)) {
      exclude("finish-order-missing");
      return;
    }
    if (ranked.some((row) => row.carNo == null)) {
      exclude("invalid-car-number");
      return;
    }
    const top3 = ranked.map((row) => row.carNo as number);
    if (new Set(top3).size !== 3) {
      exclude("invalid-car-number");
      return;
    }
    const combination = top3.join("-");
    const payoutYen = race.payout3tan?.payoutYen;
    if (
      clean(race.payout3tan?.combination) !== combination
      || payoutYen == null
      || clean(payoutYen) === ""
      || !Number.isFinite(Number(payoutYen))
    ) {
      exclude("trifecta-missing-or-mismatch");
      return;
    }

    eligibleRaceCount += 1;
    trifectaCounts.set(combination, (trifectaCounts.get(combination) ?? 0) + 1);
    top3.forEach((carNo, position) => {
      const key = String(carNo);
      positionCounts[position].set(key, (positionCounts[position].get(key) ?? 0) + 1);
      top3Counts.set(key, (top3Counts.get(key) ?? 0) + 1);
    });
    const recordedCars = new Set(
      (race.finishOrder ?? []).map((row) => validCarNo(row.carNo)).filter((carNo): carNo is number => carNo != null),
    );
    recordedCars.forEach((carNo) => {
      const key = String(carNo);
      recordedStartCounts.set(key, (recordedStartCounts.get(key) ?? 0) + 1);
    });
  });

  const sample = sampleStatus(eligibleRaceCount);
  const carTop3RateRanking = [...recordedStartCounts.entries()]
    .map(([key, eligibleStarts]) => {
      const count = top3Counts.get(key) ?? 0;
      return {
        key,
        label: `${key}番車`,
        count,
        eligibleStarts,
        rate: rate(count, eligibleStarts),
      };
    })
    .sort((left, right) =>
      right.rate - left.rate
      || right.count - left.count
      || Number(left.key) - Number(right.key),
    );

  return {
    status: eligibleRaceCount > 0 ? "ready" : "no-eligible-data",
    sourcePolicy: "official result only",
    sourceName: sourceIsOfficial ? `${provider} ${listType}` : "unknown",
    sourceFetchedAt: sourceIsOfficial ? sourceFetchedAt : "",
    sourceDate: sourceIsOfficial ? sourceDate : "",
    totalRaceCount: candidates.length,
    eligibleRaceCount,
    excludedRaceCount: candidates.length - eligibleRaceCount,
    exclusionReasons: [...exclusionCounts.entries()].map(([key, count]) => ({
      key,
      label: EXCLUSION_LABELS[key] ?? key,
      count,
    })),
    sampleStatus: sample.status,
    sampleLabel: sample.label,
    trifectaRanking: countRanking(trifectaCounts, eligibleRaceCount, (key) => key),
    firstCarRanking: countRanking(positionCounts[0], eligibleRaceCount, (key) => `${key}番車`),
    secondCarRanking: countRanking(positionCounts[1], eligibleRaceCount, (key) => `${key}番車`),
    thirdCarRanking: countRanking(positionCounts[2], eligibleRaceCount, (key) => `${key}番車`),
    carTop3RateRanking,
    filterReadiness: [
      { key: "all", label: "all", status: "ready", note: "eligible official result全件" },
      { key: "7-car", label: "7車", status: "partial", note: "official finishOrder記録から判定可能" },
      { key: "9-car", label: "9車", status: "partial", note: "official finishOrder記録から判定可能" },
      { key: "a-class", label: "A級", status: "future-accumulation", note: "current resultにraceClassなし" },
      { key: "s-class", label: "S級", status: "future-accumulation", note: "current resultにraceClassなし" },
      { key: "g-race", label: "Gレース", status: "partial", note: "venue grade確定時のみ" },
      { key: "venue", label: "会場", status: "ready", note: "venueCode / venueNameあり" },
      { key: "race-number", label: "R", status: "ready", note: "raceNumberあり" },
    ],
  };
}

export async function loadKurariExTrifectaTrendV1() {
  const response = await fetch(publicPath(RESULT_FEED_PATH), { cache: "no-store" });
  if (!response.ok) throw new Error(`official result fetch failed: ${response.status}`);
  return buildKurariExTrifectaTrendV1(await response.json() as OfficialResultFeed);
}
