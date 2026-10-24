type OfficialPayout = {
  combination?: string;
  payoutYen?: number | null;
  popularity?: number | null;
};

type OfficialRace = {
  raceNumber: number;
  resultStatus: string;
  finishOrder?: Array<{
    rank: string;
    carNo: string;
    name: string;
    registrationNo?: string;
    gap?: string;
    agari?: string;
    kimarite?: string;
    mark?: string;
    status?: string;
  }>;
  payouts?: Record<string, OfficialPayout[]>;
  kimarite?: string;
  secondKimarite?: string;
  weatherActual?: { condition?: string; windSpeedMps?: number | null };
  lastUpdateTime?: string;
  sLeaderCarNo?: string;
  hLeaderCarNo?: string;
  bLeaderCarNo?: string;
};

type OfficialSnapshot = {
  date?: string;
  generatedAt?: string;
  source?: { provider?: string; fetchCompletedAt?: string };
  venues?: Array<{
    date?: string;
    venueCode?: string;
    venueName?: string;
    grade?: string;
    raceName?: string;
    races?: OfficialRace[];
  }>;
};

function toPayout(item: OfficialPayout | undefined, betType: string) {
  if (!item?.combination || !Number.isFinite(item.payoutYen) || (item.payoutYen ?? 0) <= 0) return null;
  return {
    betType,
    combination: item.combination,
    payout: String(item.payoutYen),
    popularity: item.popularity == null ? undefined : String(item.popularity),
  };
}

export function buildReviewOfficialResultsFeed(payload: OfficialSnapshot, expectedDate: string) {
  if (payload?.date !== expectedDate || payload.source?.provider !== "KEIRIN.JP" || !Array.isArray(payload.venues)) {
    throw new Error("review-official-results-source-mismatch");
  }
  const seen = new Set<string>();
  const venues = payload.venues.map((venue) => {
    if (venue.date !== expectedDate || !/^\d{2}$/.test(venue.venueCode ?? "") || !venue.venueName || !Array.isArray(venue.races)) {
      throw new Error("review-official-results-venue-mismatch");
    }
    return {
      venue: venue.venueName,
      venueCode: venue.venueCode,
      grade: venue.grade,
      title: venue.raceName,
      races: venue.races.map((race) => {
        const key = `${venue.venueCode}:${race.raceNumber}`;
        if (!Number.isInteger(race.raceNumber) || race.raceNumber < 1 || seen.has(key)) {
          throw new Error("review-official-results-duplicate-race");
        }
        seen.add(key);
        const confirmed = race.resultStatus === "confirmed";
        const finishOrder = confirmed && Array.isArray(race.finishOrder)
          ? race.finishOrder.map((entry) => ({
            ...entry,
            registrationNoSource: entry.registrationNo ? "result" : undefined,
            registrationNoTrustStatus: entry.registrationNo ? "explicit-result-registration" : undefined,
          }))
          : [];
        const trifectaRows = confirmed ? race.payouts?.trifecta ?? [] : [];
        const trifecta = trifectaRows.length === 1 ? toPayout(trifectaRows[0], "3連単") : null;
        const exactaRows = confirmed ? race.payouts?.exacta ?? [] : [];
        const exacta = exactaRows.length === 1 ? toPayout(exactaRows[0], "2車単") : null;
        const topThree = finishOrder.slice(0, 3);
        const reviewSettlementEligible = topThree.length === 3
          && topThree.every((entry, index) => entry.rank === String(index + 1))
          && trifecta?.combination === topThree.map((entry) => entry.carNo).join("-");
        const sourceFetchedAt = payload.source?.fetchCompletedAt;
        return {
          raceNo: race.raceNumber,
          resultStatus: confirmed ? "confirmed" as const : "pending" as const,
          resultNote: confirmed
            ? (reviewSettlementEligible ? undefined : "公式結果あり・購入照合保留")
            : `公式結果: ${race.resultStatus || "未取得"}`,
          officialResultSource: "KEIRIN.JP",
          sourceName: "KEIRIN.JP",
          sourceType: "OFFICIAL",
          sourceFetchedAt,
          riders: finishOrder.map((entry) => ({
            carNo: entry.carNo,
            name: entry.name,
            registrationNo: entry.registrationNo,
            registrationNoSource: entry.registrationNoSource,
            registrationNoTrustStatus: entry.registrationNoTrustStatus,
          })),
          result: confirmed ? {
            status: "confirmed" as const,
            finishOrder,
            kimarite: race.kimarite,
            secondKimarite: race.secondKimarite,
            payout3tan: trifecta,
            payout2tan: exacta,
            payout2fuku: (race.payouts?.quinella ?? []).map((item) => toPayout(item, "2車複")).filter((item) => item !== null),
            payout3fuku: race.payouts?.trio?.length === 1 ? toPayout(race.payouts.trio[0], "3連複") : null,
            payoutWide: (race.payouts?.wide ?? []).map((item) => toPayout(item, "ワイド")).filter((item) => item !== null),
            reviewSettlementEligible,
            weatherActual: race.weatherActual ? {
              weather: race.weatherActual.condition,
              windSpeed: race.weatherActual.windSpeedMps == null ? undefined : String(race.weatherActual.windSpeedMps),
              source: "KEIRIN.JP",
              fetchedAt: sourceFetchedAt,
            } : undefined,
            sLeaderCarNo: race.sLeaderCarNo,
            hLeaderCarNo: race.hLeaderCarNo,
            bLeaderCarNo: race.bLeaderCarNo,
            officialResultSource: "KEIRIN.JP",
            sourceName: "KEIRIN.JP",
            sourceType: "OFFICIAL",
            sourceFetchedAt,
          } : { status: "pending" as const },
        };
      }),
    };
  });
  return { date: expectedDate, generatedAt: payload.generatedAt, venues };
}
