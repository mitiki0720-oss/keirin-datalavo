export function validateLineupEvidence(rawText, { riderCars = [], isGirls = false } = {}) {
  const raw = String(rawText ?? "").normalize("NFKC").replace(/\u3000/g, " ").replace(/\s+/g, " ").trim();
  const cars = [...raw.matchAll(/[1-9]/gu)].map((match) => match[0]);
  const entrants = riderCars.map(String);
  const groups = (/[\/／|｜・]/u.test(raw) ? raw.split(/[\/／|｜・]+/u) : raw.split(/\s+/u))
    .map((part) => part.replace(/[^1-9]/gu, ""))
    .filter(Boolean);
  if (!raw || isGirls || !/^[1-9\s・/／|｜\-－ー―]+$/u.test(raw)) return { valid: false, groups: [] };
  if (!entrants.length || cars.length !== entrants.length || new Set(cars).size !== cars.length) return { valid: false, groups: [] };
  if (entrants.some((car) => !cars.includes(car))) return { valid: false, groups: [] };
  if (groups.length < 2 || groups.every((group) => group.length === 1) || groups.join("") !== cars.join("")) {
    return { valid: false, groups: [] };
  }
  return { valid: true, groups };
}

export function isGirlsRace(race) {
  const riders = Array.isArray(race?.riders) ? race.riders : [];
  return Boolean(race?.isGirls || /ガールズ|[ＬL]級/u.test(String(race?.title ?? ""))
    || riders.some((rider) => /^L[12]$/iu.test(String(rider.grade ?? rider.raceClass ?? "").trim())));
}

export function hasUsableLineup(race, policy = {}) {
  const riders = Array.isArray(race?.riders) ? race.riders : [];
  const riderCars = riders.map((rider) => String(rider.carNo ?? "").trim());
  if (!riderCars.length || riderCars.some((car) => !/^[1-9]$/u.test(car))) return false;
  const isGirls = isGirlsRace(race);
  const observation = race?.lineupObservation;
  const providerFields = {
    netkeirin: race?.netkeirinLineupRaw,
    kdreams: race?.kdreamsLineupRaw,
    chariloto: race?.charilotoLineupRaw,
    oddspark: race?.oddsparkLineupRaw,
    winticket: race?.winticketLineupRaw,
  };
  const provider = String(observation?.provider ?? "");
  const observedAt = String(observation?.fetchedAt ?? "");
  const observedMs = Date.parse(observedAt);
  const observedJstDate = Number.isFinite(observedMs)
    ? new Date(observedMs + 9 * 60 * 60 * 1000).toISOString().slice(0, 10) : "";
  const startAt = /^\d{1,2}:\d{2}$/u.test(String(race?.time ?? "")) && /^\d{4}-\d{2}-\d{2}$/u.test(String(observation?.date ?? ""))
    ? Date.parse(`${observation.date}T${String(race.time).padStart(5, "0")}:00+09:00`) : NaN;
  return Object.hasOwn(providerFields, provider)
    && policy[provider] !== false
    && observation?.date === race?.date
    && observation?.venueCode === race?.venueCode
    && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/u.test(observedAt)
    && /^\d{2}$/u.test(String(observation?.venueCode ?? ""))
    && Number(observation?.raceNo) === Number(race?.raceNo)
    && observedJstDate === observation?.date
    && Number.isFinite(startAt) && observedMs < startAt
    && validateLineupEvidence(providerFields[provider], { riderCars, isGirls }).valid;
}
