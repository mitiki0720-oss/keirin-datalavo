const carNumber = (value) => String(value ?? "").trim();

export function verifiedLineupForRace({ race, entryRace, entries, date, venueCode, raceNo }) {
  const rawLineup = String(race.lineup || entryRace?.lineup || entryRace?.officialLineup?.lineup || "").trim();
  const rawCars = rawLineup.split(/\s+/u);
  const entryCars = entries.map((entry) => carNumber(entry.carNo));
  const carOrder = entries.length > 0 && rawCars.length === entries.length &&
    rawCars.every((car) => /^[1-9]\d?$/u.test(car) && entryCars.includes(car)) &&
    new Set(rawCars).size === rawCars.length && new Set(entryCars).size === entries.length
    ? rawLineup : null;
  const isGirls = race.isGirls === true || entries.some((entry) => /^(?:L[12]$|L級)/iu.test(String(entry.raceClass ?? "").trim()));
  const candidate = race.verifiedLineup ?? entryRace?.verifiedLineup;
  const unavailable = (reason) => ({ carOrder, groups: null, source: "unavailable", reason });
  if (isGirls) return unavailable("not-applicable-girls");
  if (!candidate) return unavailable(rawLineup ? "boundaries-unverified" : "lineup-unavailable");
  if (candidate.status !== "verified" || candidate.boundaryEvidence !== "explicit-source-groups" ||
      !candidate.source || /JSJ005.*narabiyoso|position-only/iu.test(candidate.source) || candidate.date !== date ||
      String(candidate.venueCode) !== venueCode || Number(candidate.raceNo) !== raceNo ||
      !Array.isArray(candidate.groups) || candidate.groups.length < 2 || entries.length < 5) {
    return unavailable("invalid-verification");
  }
  const groups = candidate.groups.map((group) => Array.isArray(group) ? group.map(carNumber) : []);
  const groupedCars = groups.flat();
  if (groups.some((group) => group.length === 0) ||
      entryCars.some((car) => !/^[1-9]\d?$/u.test(car)) ||
      groupedCars.some((car) => !/^[1-9]\d?$/u.test(car)) ||
      new Set(entryCars).size !== entryCars.length ||
      new Set(groupedCars).size !== groupedCars.length ||
      groupedCars.length !== entryCars.length ||
      groupedCars.some((car) => !entryCars.includes(car))) {
    return unavailable("car-mismatch");
  }
  return { carOrder, groups, source: String(candidate.source), reason: "verified" };
}
