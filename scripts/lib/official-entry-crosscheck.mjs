/**
 * Internal, deterministic JSJ001 vs JSJ006 comparison. It does not attest to
 * an independent live browser inspection of any rider's registration record.
 * The caller must have obtained the raw responses from KEIRIN.JP itself.
 */
const asText = (x) => String(x ?? "").trim();
const dateText = (x) => {
  const numbers = asText(x).replace(/\D/gu, "");
  return /^\d{8}$/u.test(numbers)
    ? `${numbers.slice(0,4)}-${numbers.slice(4,6)}-${numbers.slice(6,8)}` : "";
};
const regNo = (x) => /^[0-9]{5,6}$/u.test(asText(x));
const carNo = (x) => /^[1-9]$/u.test(asText(x));
const raceNo = (x) => /^(?:[1-9]|1[0-2])$/u.test(asText(x));
const problem = (reason) => {throw new Error(`JSJ001/JSJ006 identity check failed: ${reason}`);};

export function assertJsj001Jsj006Exact({
  date, venueCode, raceNumber, entryVenueCode, detailDate,
  detailVenueCode, detailRaceNumber, entries, detailRiders,
}) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(asText(date)) || !asText(venueCode) || !raceNo(raceNumber))
    problem("missing/invalid parent race identity");
  if (dateText(detailDate) !== date || asText(detailVenueCode) !== asText(venueCode)
    || asText(entryVenueCode) !== asText(venueCode) || Number(detailRaceNumber) !== Number(raceNumber))
    problem("JSJ001 parent date/venue/race disagreement");
  if (!Array.isArray(entries) || !entries.length || !Array.isArray(detailRiders)
    || detailRiders.length !== entries.length)
    problem("entry and detail row counts differ");
  const officialEntries = new Map();
  const registrations = new Set();
  for (const entry of entries) {
    const car = asText(entry?.carNo), registration = asText(entry?.registrationNo);
    if (!carNo(car) || !regNo(registration) || !asText(entry?.name)
      || officialEntries.has(car) || registrations.has(registration))
      problem("JSJ006 missing or duplicated car/number/name");
    officialEntries.set(car, registration);
    registrations.add(registration);
  }
  const details = new Map();
  const detailRegistrations = new Set();
  for (const row of detailRiders) {
    const car = asText(row?.carNum), registration = asText(row?.numPlayer);
    if (!carNo(car) || !regNo(registration) || details.has(car) || detailRegistrations.has(registration))
      problem("JSJ001 missing or duplicated car/number");
    details.set(car, registration);
    detailRegistrations.add(registration);
  }
  if (details.size !== officialEntries.size ||
      [...officialEntries].some(([car, registration]) => details.get(car) !== registration))
    problem("different car-number to rider-number mappings");
  return {
    status: "PASS_JSJ001_JSJ006_EXACT",
    date, venueCode: asText(venueCode), raceNo: Number(raceNumber),
    rowCount: entries.length, entryType: "JSJ006", detailType: "JSJ001",
    checkMethod: "exact-date-venue-race-car-registration-pair",
  };
}

/** Bind the SHA256 of the exact on-disk official bytes to the parsed object.
 * The non-enumerable property never changes that official JSON's serialization.
 * Not an assertion that a third-party website was independently inspected.
 */
export async function readOfficialEntriesWithDigest(file, date, validate) {
  const {readFile} = await import('node:fs/promises');
  const {createHash} = await import('node:crypto');
  const bytes = await readFile(file);
  const payload = JSON.parse(bytes.toString('utf8'));
  const counts = validate(payload, date);
  Object.defineProperty(payload, '__verifiedOfficialEntriesSha256', {
    configurable: false, enumerable: false, writable: false,
    value: createHash('sha256').update(bytes).digest('hex'),
  });
  return {payload, counts};
}
