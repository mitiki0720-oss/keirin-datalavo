export type KeirinPredictionExportFeedRace = {
  raceNo: number;
  title?: string;
  isGirls?: boolean;
};

export type KeirinPredictionExportFeedVenue = {
  venue: string;
  slug?: string;
  grade?: string;
  session?: string;
  raceIds?: string[];
  races: KeirinPredictionExportFeedRace[];
};

export type KeirinPredictionExportFeed = {
  date: string;
  venues: KeirinPredictionExportFeedVenue[];
};

export type KeirinPredictionExportSlot = {
  raceId?: string;
  venue?: string;
  date?: string;
  raceNumber?: number;
  predictionText?: string;
  predictionJson?: {
    tickets?: Array<{
      betType?: string;
      combination?: string;
    }>;
  };
};

export type KeirinPredictionExportItem = {
  raceId: string;
  date: string;
  venueName: string;
  venueKey: string;
  raceNumber: number;
  raceTitle: string;
  grade: string;
  timeslot: string;
  predictionStatus: "structured";
  trifectaTickets: string[];
  exactaTickets: string[];
  confidence: string;
  raceType: string;
  tags: string[];
  isSpecialRace: boolean;
};

export type KeirinPredictionExportPayload = {
  schemaVersion: 1;
  generatedAt: string;
  date: string;
  source: "prediction-page-local-export";
  raceCount: number;
  items: KeirinPredictionExportItem[];
};

export type KeirinPredictionExportSummary = {
  date: string;
  savedRaceCount: number;
  structuredRaceCount: number;
  raceIdCount: number;
  exportRaceCount: number;
  excludedRaceCount: number;
  excludedReasons: Record<string, number>;
};

const normalizedUnique = (values: unknown[]) => (
  [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))].sort()
);

const normalizeTicket = (value: unknown, length: number) => {
  const numbers = String(value ?? "").match(/[1-9]/gu) ?? [];
  if (numbers.length !== length || new Set(numbers).size !== length) return "";
  return numbers.join("-");
};

const findFeedRace = (
  feed: KeirinPredictionExportFeed,
  slot: KeirinPredictionExportSlot,
) => {
  const raceId = String(slot.raceId ?? "").trim();
  for (const venue of feed.venues) {
    const raceIndex = venue.raceIds?.findIndex((value) => String(value ?? "").trim() === raceId) ?? -1;
    if (raceIndex >= 0) return { venue, race: venue.races[raceIndex] };
  }
  const venueName = String(slot.venue ?? "").trim();
  const venue = feed.venues.find((item) => item.venue === venueName);
  const race = venue?.races.find((item) => item.raceNo === Number(slot.raceNumber));
  return venue && race ? { venue, race } : null;
};

const parseMetadata = (text: string) => ({
  confidence: text.match(/自信度\s*[:：]?\s*([^\r\n]+)/u)?.[1]?.trim() ?? "",
  raceType: text.match(/レース(?:タイプ|型)\s*[:：]?\s*([^\r\n]+)/u)?.[1]?.trim() ?? "",
  tags: normalizedUnique(text.match(/#[^\s#]+/gu) ?? []),
});

export function buildKeirinPredictionExport(
  feed: KeirinPredictionExportFeed,
  slots: Record<string, KeirinPredictionExportSlot>,
  generatedAt = new Date().toISOString(),
) {
  const todaySlots = Object.values(slots).filter((slot) => slot?.date === feed.date);
  const excludedReasons: Record<string, number> = {};
  const exclude = (reason: string) => {
    excludedReasons[reason] = (excludedReasons[reason] ?? 0) + 1;
  };
  const items: KeirinPredictionExportItem[] = [];
  let structuredRaceCount = 0;
  let raceIdCount = 0;

  for (const slot of todaySlots) {
    const raceId = String(slot.raceId ?? "").trim();
    if (raceId) raceIdCount += 1;
    const tickets = Array.isArray(slot.predictionJson?.tickets)
      ? slot.predictionJson.tickets
      : [];
    const trifectaTickets = normalizedUnique(
      tickets
        .filter((ticket) => String(ticket?.betType ?? "").includes("3連単"))
        .map((ticket) => normalizeTicket(ticket?.combination, 3)),
    );
    const exactaTickets = normalizedUnique(
      tickets
        .filter((ticket) => String(ticket?.betType ?? "").includes("2車単"))
        .map((ticket) => normalizeTicket(ticket?.combination, 2)),
    );
    const structured = trifectaTickets.length + exactaTickets.length > 0;
    if (structured) structuredRaceCount += 1;
    if (!raceId) {
      exclude("raceId missing");
      continue;
    }
    if (!structured) {
      exclude("structured tickets missing");
      continue;
    }
    const context = findFeedRace(feed, slot);
    if (!context) {
      exclude("feed race not found");
      continue;
    }
    const metadata = parseMetadata(String(slot.predictionText ?? ""));
    items.push({
      raceId,
      date: feed.date,
      venueName: context.venue.venue,
      venueKey: context.venue.slug ?? "",
      raceNumber: context.race.raceNo,
      raceTitle: context.race.title ?? "",
      grade: context.venue.grade ?? "",
      timeslot: context.venue.session ?? "",
      predictionStatus: "structured",
      trifectaTickets,
      exactaTickets,
      confidence: metadata.confidence,
      raceType: metadata.raceType,
      tags: metadata.tags,
      isSpecialRace: Boolean(
        context.race.isGirls
        || /決勝|特選|優秀|記念|グランプリ|ダービー/u.test(context.race.title ?? ""),
      ),
    });
  }
  items.sort((left, right) => left.raceId.localeCompare(right.raceId));
  const payload: KeirinPredictionExportPayload = {
    schemaVersion: 1,
    generatedAt,
    date: feed.date,
    source: "prediction-page-local-export",
    raceCount: items.length,
    items,
  };
  const summary: KeirinPredictionExportSummary = {
    date: feed.date,
    savedRaceCount: todaySlots.length,
    structuredRaceCount,
    raceIdCount,
    exportRaceCount: items.length,
    excludedRaceCount: todaySlots.length - items.length,
    excludedReasons,
  };
  return { payload, summary };
}

export function downloadKeirinPredictionExport(payload: KeirinPredictionExportPayload) {
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
    type: "application/json;charset=utf-8",
  });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `keirin-predictions-${payload.date}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
}
