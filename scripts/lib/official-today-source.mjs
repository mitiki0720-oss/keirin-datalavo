import { normalizeVenueName, venueMap } from "../kurari-ex-history-common.mjs";

const slugByName = new Map(Object.entries(venueMap).map(([slug, name]) => [normalizeVenueName(name), slug]));

function clean(value) {
  return String(value ?? "").trim();
}

function normalizedName(value) {
  return clean(value).normalize("NFKC").replace(/\s+/gu, "");
}

export function isFreshOfficialResultSnapshot(payload, nowMs = Date.now()) {
  const generatedAt = clean(payload?.generatedAt);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(generatedAt)) return false;
  const ageMs = nowMs - Date.parse(generatedAt);
  return Number.isFinite(ageMs) && ageMs >= -120_000 && ageMs <= 20 * 60_000;
}

export function validateOfficialTodayEntries(payload, targetDate) {
  if (payload?.source?.provider !== "KEIRIN.JP" || payload.date !== targetDate || !Array.isArray(payload.venues) || !payload.venues.length) {
    throw new Error(`official entries unavailable for ${targetDate}: source=${payload?.source?.provider ?? "missing"} date=${payload?.date ?? "missing"}`);
  }
  const raceKeys = new Set();
  const venueCodes = new Set();
  let riderCount = 0;
  for (const venue of payload.venues) {
    const code = clean(venue.venueCode);
    if (venue.date !== targetDate || !/^\d{2}$/.test(code) || !slugByName.has(normalizeVenueName(venue.venueName)) || !Array.isArray(venue.races) || !venue.races.length) {
      throw new Error(`invalid official venue: ${code} ${venue.venueName ?? ""}`);
    }
    if (venueCodes.has(code)) throw new Error(`duplicate official venue: ${code}`);
    venueCodes.add(code);
    for (const race of venue.races) {
      const raceNo = Number(race.raceNumber);
      const key = `${targetDate}:${code}:${raceNo}`;
      if (!Number.isInteger(raceNo) || raceNo < 1 || raceNo > 12 || raceKeys.has(key)) throw new Error(`duplicate or invalid official race: ${key}`);
      raceKeys.add(key);
      if (race.entryStatus !== "available" || !Array.isArray(race.entries) || !race.entries.length) throw new Error(`official entries incomplete: ${key}`);
      if (!/^\d{1,2}:\d{2}$/.test(clean(race.raceMeta?.startTime))) throw new Error(`official start time unavailable: ${key}`);
      const cars = new Set();
      const registrations = new Set();
      for (const entry of race.entries) {
        const car = clean(entry.carNo);
        const registration = clean(entry.registrationNo);
        if (!/^[1-9]$/.test(car) || !/^\d{5,6}$/.test(registration) || !clean(entry.name) || cars.has(car) || registrations.has(registration)) {
          throw new Error(`official rider identity invalid: ${key}:${car}`);
        }
        cars.add(car);
        registrations.add(registration);
        riderCount += 1;
      }
    }
  }
  return { venueCount: payload.venues.length, raceCount: raceKeys.size, riderCount };
}

export function officialEntryToTodayRider(entry) {
  return {
    carNo: clean(entry.carNo),
    registrationNo: clean(entry.registrationNo),
    registrationNoSource: "KEIRIN.JP:JSJ006",
    name: clean(entry.name),
    fullName: clean(entry.name),
    prefecture: clean(entry.prefecture).replace(/\s+/gu, ""),
    age: entry.age == null ? "" : String(entry.age),
    term: clean(entry.graduationTerm),
    grade: clean(entry.raceClass),
    style: clean(entry.style),
    score: entry.score == null ? "" : String(entry.score),
    s: entry.stats?.startCount == null ? "" : String(entry.stats.startCount),
    b: entry.stats?.backCount == null ? "" : String(entry.stats.backCount),
    nige: entry.stats?.escapeCount == null ? "" : String(entry.stats.escapeCount),
    escape: entry.stats?.escapeCount == null ? "" : String(entry.stats.escapeCount),
    makuri: entry.stats?.makuriCount == null ? "" : String(entry.stats.makuriCount),
    sashi: entry.stats?.sashiCount == null ? "" : String(entry.stats.sashiCount),
    mark: entry.stats?.markCount == null ? "" : String(entry.stats.markCount),
    winRate: entry.stats?.winRate == null ? "" : String(entry.stats.winRate),
    quinellaRate: entry.stats?.quinellaRate == null ? "" : String(entry.stats.quinellaRate),
    trifectaRate: entry.stats?.trioRate == null ? "" : String(entry.stats.trioRate),
  };
}

export function mergeOfficialTodayRiders(officialEntries, candidateRiders) {
  const candidates = new Map();
  for (const rider of Array.isArray(candidateRiders) ? candidateRiders : []) {
    const car = clean(rider?.carNo);
    if (candidates.has(car)) throw new Error(`duplicate supplemental rider car: ${car}`);
    candidates.set(car, rider);
  }
  return officialEntries.map((entry) => {
    const base = officialEntryToTodayRider(entry);
    const candidate = candidates.get(base.carNo);
    if (!candidate) return base;
    if (normalizedName(candidate.name ?? candidate.fullName) !== normalizedName(base.name) || (candidate.registrationNo && clean(candidate.registrationNo) !== base.registrationNo)) {
      throw new Error(`supplemental identity conflict: car=${base.carNo} official=${base.registrationNo} ${base.name}`);
    }
    return { ...candidate, ...base };
  });
}

export function buildOfficialTodayVenues(payload, scheduleItems, operationUpdatedAt) {
  validateOfficialTodayEntries(payload, payload.date);
  return payload.venues.map((venue) => {
    const venueName = normalizeVenueName(venue.venueName);
    const code = clean(venue.venueCode);
    const schedule = scheduleItems.find((item) =>
      normalizeVenueName(item.venueName ?? item.venue) === venueName &&
      item.startDate <= payload.date && item.endDate >= payload.date &&
      (!item.venueCode || clean(item.venueCode) === code));
    const raceNos = venue.races.map((race) => Number(race.raceNumber));
    const startDate = schedule?.startDate ?? "";
    const endDate = schedule?.endDate ?? "";
    const eventDayNumber = startDate ? Math.round((Date.parse(`${payload.date}T00:00:00+09:00`) - Date.parse(`${startDate}T00:00:00+09:00`)) / 86400000) + 1 : null;
    return {
      id: `live-${payload.date.replaceAll("-", "")}${code}`,
      venue: venueName,
      venueCode: code,
      slug: slugByName.get(venueName),
      title: `${venueName} 出走表一覧`,
      grade: clean(venue.grade),
      startDate,
      endDate,
      eventStartDate: startDate,
      eventEndDate: endDate,
      eventDayNumber,
      eventDayLabel: eventDayNumber ? `${eventDayNumber}日目${endDate === payload.date ? "・最終日" : ""}` : null,
      session: ["day", "night", "midnight"].includes(schedule?.session) ? schedule.session : "unknown",
      hasGirls: Boolean(schedule?.hasGirls) || venue.races.some((race) => race.entries.some((entry) => /^L[12]$/.test(clean(entry.raceClass)))),
      note: "KEIRIN.JP公式出走表から生成",
      raceNos,
      venueOperationStatus: "scheduled",
      venueOperationLabel: "",
      venueOperationReason: "",
      venueOperationSource: "KEIRIN.JP:JSJ048/JSJ001",
      venueOperationUpdatedAt: operationUpdatedAt,
      venueOperationRaw: "",
      raceIds: raceNos.map(() => ""),
      raceDetailLinks: [],
      races: [],
    };
  });
}

export function indexOfficialTodayRaces(payload) {
  return new Map(payload.venues.flatMap((venue) => venue.races.map((race) => [`${venue.venueCode}:${race.raceNumber}`, race])));
}

export function indexOfficialTodayResults(payload, targetDate) {
  if (payload?.source?.provider !== "KEIRIN.JP" || payload.date !== targetDate || !Array.isArray(payload.venues) || !payload.venues.length) throw new Error("official result date/source mismatch");
  const races = new Map();
  for (const venue of payload.venues) {
    if (venue.date !== targetDate || !/^\d{2}$/.test(clean(venue.venueCode)) || !Array.isArray(venue.races)) throw new Error("official result venue mismatch");
    for (const race of venue.races) {
      const raceNo = Number(race.raceNumber);
      const key = `${venue.venueCode}:${raceNo}`;
      if (!Number.isInteger(raceNo) || raceNo < 1 || raceNo > 12 || races.has(key)) throw new Error(`official result duplicate/invalid race ${key}`);
      races.set(key, race);
    }
  }
  return races;
}

const payoutLabels = {
  quinella: "2車複",
  exacta: "2車単",
  trio: "3連複",
  trifecta: "3連単",
  wide: "ワイド",
};

export function officialResultToTodayRace(officialResult, officialEntries) {
  if (officialResult?.resultStatus !== "confirmed") return null;
  const rows = Array.isArray(officialResult.finishOrder) ? officialResult.finishOrder : [];
  const top3 = rows.filter((row) => /^[123]$/.test(clean(row.rank)));
  if (top3.length !== 3 || top3.map((row) => clean(row.rank)).join("") !== "123") return null;
  const entries = new Map((officialEntries?.entries ?? []).map((entry) => [clean(entry.carNo), entry]));
  if (!entries.size || rows.some((row) => {
    const entry = entries.get(clean(row.carNo));
    return !entry || clean(row.registrationNo) !== clean(entry.registrationNo) || normalizedName(row.name) !== normalizedName(entry.name);
  })) throw new Error("official result/entry identity conflict");
  const payouts = Object.entries(payoutLabels).flatMap(([key, betType]) =>
    (officialResult.payouts?.[key] ?? []).filter((row) => Number.isFinite(row.payoutYen) && row.payoutYen > 0).map((row) => ({
      betType,
      combination: clean(row.combination),
      payout: `${row.payoutYen}円${row.popularity == null ? "" : ` (${row.popularity})`}`,
      popularity: row.popularity == null ? null : String(row.popularity),
    })));
  const trifectas = payouts.filter((item) => item.betType === "3連単");
  if (trifectas.length !== 1 || !/^\d-\d-\d$/.test(trifectas[0].combination)) return null;
  const finishOrder = rows.map((row) => ({
    rank: clean(row.rank), carNo: clean(row.carNo), name: clean(row.name),
    agari: clean(row.agari), gap: clean(row.gap), kimarite: clean(row.kimarite),
    mark: clean(row.mark), status: clean(row.status),
  }));
  const resultTop3 = top3.map((row) => ({
    place: clean(row.rank), carNo: clean(row.carNo), name: clean(row.name),
    margin: clean(row.gap), agari: clean(row.agari), kimarite: clean(row.kimarite),
    sMark: clean(row.mark).includes("S"), hMark: clean(row.mark).includes("H"), bMark: clean(row.mark).includes("B"),
  }));
  const byType = (betType) => payouts.filter((item) => item.betType === betType);
  return {
    resultStatus: "confirmed",
    resultTop3,
    payouts,
    result: {
      status: "confirmed", finishOrder,
      kimarite: clean(officialResult.kimarite), secondKimarite: clean(officialResult.secondKimarite),
      sLeaderCarNo: clean(officialResult.sLeaderCarNo), hLeaderCarNo: clean(officialResult.hLeaderCarNo), bLeaderCarNo: clean(officialResult.bLeaderCarNo),
      payout2tan: byType("2車単")[0] ?? null, payout2fuku: byType("2車複"),
      payout3tan: trifectas[0], payout3fuku: byType("3連複")[0] ?? null,
      payoutWide: byType("ワイド"), finalizedAt: clean(officialResult.lastUpdateTime),
    },
  };
}

export function attachKdreamsDetailLinks(officialVenues, kdreamsVenues, targetDate) {
  const byCode = new Map(kdreamsVenues.map((venue) => [clean(venue.venueCode), venue]));
  return officialVenues.map((venue) => {
    const supplemental = byCode.get(venue.venueCode);
    if (!supplemental || normalizeVenueName(supplemental.venue) !== normalizeVenueName(venue.venue)) return venue;
    const allowedRaces = new Set(venue.raceNos);
    const eventStart = clean(venue.eventStartDate).replaceAll("-", "");
    const eventDay = Number(venue.eventDayNumber);
    if (!/^\d{8}$/.test(eventStart) || !Number.isInteger(eventDay) || eventDay < 1 || eventDay > 99 ||
        new Date(`${venue.eventStartDate}T00:00:00+09:00`) > new Date(`${targetDate}T00:00:00+09:00`)) return venue;
    const expectedPrefix = `${venue.venueCode}${eventStart}${String(eventDay).padStart(2, "0")}`;
    const links = (supplemental.raceDetailLinks ?? []).filter((link) =>
      allowedRaces.has(link.raceNo) &&
      clean(link.raceId) === `${expectedPrefix}${String(link.raceNo).padStart(4, "0")}`);
    const counts = new Map();
    for (const link of links) counts.set(link.raceNo, (counts.get(link.raceNo) ?? 0) + 1);
    const uniqueLinks = links.filter((link) => counts.get(link.raceNo) === 1);
    return { ...venue, raceDetailLinks: uniqueLinks, raceIds: venue.raceNos.map((raceNo) => uniqueLinks.find((link) => link.raceNo === raceNo)?.raceId ?? "") };
  });
}
