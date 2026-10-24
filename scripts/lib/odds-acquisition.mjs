const STATUSES = new Set([
  "outside-phase",
  "cached-verified",
  "racecard-maintenance",
  "transport-error",
  "http-error",
  "format-changed",
  "race-id-unresolved",
  "individual-odds-unavailable",
  "sale-state-unverified",
  "odds-verified",
  "identity-conflict-blocked",
]);

export function classifyRacecardFailure({ httpStatus = null, html = "", error = null } = {}) {
  if (error) return { status: "transport-error", httpStatus: null, reason: "racecard transport failed" };
  if (httpStatus !== 200) return { status: "http-error", httpStatus, reason: `racecard HTTP ${httpStatus}` };
  if (/DERUCA\s+MAINTENANCE|緊急メンテナンス|全てのサービスを停止/i.test(html)) {
    return { status: "racecard-maintenance", httpStatus, reason: "racecard maintenance page" };
  }
  return { status: "format-changed", httpStatus, reason: "current racecard table unavailable" };
}

export function classifyOddsPage({ html = "", oddsCount = 0, valid = false } = {}) {
  if (classifyRacecardFailure({ httpStatus: 200, html }).status === "racecard-maintenance") return "individual-odds-unavailable";
  if (oddsCount > 0) return valid ? "odds-verified" : "identity-conflict-blocked";
  return "sale-state-unverified";
}

export function createOddsAcquisition({ date, venueCode, raceNo, phase, status, racecard = null,
  provider = "kdreams", requestedAt = null, fetchedAt = null, httpAttempted = false,
  httpStatus = null, reason = "" }) {
  if (!STATUSES.has(status)) throw new Error(`unsupported odds status: ${status}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || !/^\d{2}$/.test(String(venueCode)) ||
      !Number.isInteger(Number(raceNo)) || Number(raceNo) < 1) throw new Error("odds race identity invalid");
  if (!httpAttempted && (requestedAt || fetchedAt)) throw new Error("unrequested odds cannot have fetch timestamps");
  if (httpAttempted && !requestedAt) throw new Error("requestedAt required for HTTP attempt");
  if (requestedAt && !Number.isFinite(Date.parse(requestedAt))) throw new Error("requestedAt invalid");
  if (fetchedAt && !Number.isFinite(Date.parse(fetchedAt))) throw new Error("fetchedAt invalid");
  if (requestedAt && fetchedAt && Date.parse(fetchedAt) < Date.parse(requestedAt)) throw new Error("fetchedAt precedes request");
  if (status === "odds-verified" && (!httpAttempted || !fetchedAt)) throw new Error("verified odds require fetch evidence");
  if (status !== "odds-verified" && fetchedAt) throw new Error("only verified odds may have fetchedAt");
  return { date, venueCode: String(venueCode), raceNo: Number(raceNo), phase, provider, status,
    racecard, httpAttempted, requestedAt, fetchedAt, httpStatus, reason };
}

export function validateKdreamsRaceLink(link, venue, raceNo, targetDate) {
  const code = String(venue?.venueCode ?? "");
  const eventStart = String(venue?.eventStartDate ?? "").replaceAll("-", "");
  const eventDay = Number(venue?.eventDayNumber);
  const id = String(link?.raceId ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate) || !/^\d{2}$/.test(code) ||
      !/^\d{8}$/.test(eventStart) || !Number.isInteger(eventDay) || eventDay < 1 || eventDay > 99 ||
      !/^\d{1,2}$/.test(String(raceNo)) || Number(link?.raceNo) !== Number(raceNo) ||
      !/^[a-z0-9-]+$/i.test(String(link?.slug ?? "")) ||
      (venue.slug && venue.slug !== link.slug)) return false;
  const startMs = Date.parse(`${venue.eventStartDate}T00:00:00+09:00`);
  const targetMs = Date.parse(`${targetDate}T00:00:00+09:00`);
  if (!Number.isFinite(startMs) || !Number.isFinite(targetMs) ||
      Math.floor((targetMs - startMs) / 86400000) + 1 !== eventDay) return false;
  return id === `${code}${eventStart}${String(eventDay).padStart(2, "0")}${String(raceNo).padStart(4, "0")}`;
}

export function validateTrifectaOdds(items, riderCars, provider = "kdreams") {
  if (!Array.isArray(items) || items.length === 0) return { valid: false, reason: "no trifecta odds" };
  const cars = new Set((riderCars ?? []).map((car) => String(car)));
  if (cars.size < 3) return { valid: false, reason: "entry cars unavailable" };
  const seen = new Set();
  for (const item of items) {
    const parts = String(item?.combination ?? "").split("-");
    if (parts.length !== 3 || parts.some((part) => !/^[1-9]$/.test(part) || !cars.has(part)) ||
        new Set(parts).size !== 3 || seen.has(item.combination) ||
        !Number.isFinite(item.odds) || item.odds <= 0 || item.source !== provider) {
      return { valid: false, reason: "trifecta combination, price, or source conflict" };
    }
    seen.add(item.combination);
  }
  return { valid: true, reason: "" };
}

export function hasConflictingTrifectaPrices(items) {
  const prices = new Map();
  for (const item of items) {
    const previous = prices.get(item.combination);
    if (previous !== undefined && previous !== item.odds) return true;
    prices.set(item.combination, item.odds);
  }
  return false;
}

export function reusableVerifiedOdds(race, { date, venueCode, raceNo, riderCars }) {
  const evidence = race?.oddsObservation;
  const fetchedAt = String(evidence?.fetchedAt ?? "");
  const fetchedMs = Date.parse(fetchedAt);
  const fetchedJstDate = Number.isFinite(fetchedMs)
    ? new Date(fetchedMs + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
    : null;
  if (!evidence || evidence.date !== date || String(evidence.venueCode) !== String(venueCode) ||
      Number(evidence.raceNo) !== Number(raceNo) || evidence.provider !== "kdreams" ||
      !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(fetchedAt) ||
      fetchedJstDate !== date) return null;
  if (!validateTrifectaOdds(race.oddsTrifecta, riderCars).valid) return null;
  const favorite = race.finalTrifectaFavorite;
  if (favorite && !race.oddsTrifecta.some((item) => item.combination === favorite.combination && item.odds === favorite.odds)) return null;
  return {
    oddsPreview: race.oddsPreview ?? [], oddsTrifecta: race.oddsTrifecta,
    finalTrifectaFavorite: race.finalTrifectaFavorite ?? null,
    topOdds: race.topOdds ?? null, topTrifectaOdds: race.topTrifectaOdds ?? null,
    favoriteOdds: race.favoriteOdds ?? null, favoriteCombination: race.favoriteCombination ?? "",
    oddsObservation: evidence,
  };
}
