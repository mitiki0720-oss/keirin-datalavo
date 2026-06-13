import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);

function getArgValue(name, fallback = "") {
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1] ?? fallback;

  return (
    args
      .find((arg) => arg.startsWith(`${name}=`))
      ?.slice(name.length + 1) ?? fallback
  );
}

function clean(value) {
  return String(value ?? "").trim();
}

function numberValue(value) {
  if (value == null || value === "") return null;

  const match = String(value)
    .replaceAll(",", "")
    .match(/[+-]?\d+(?:\.\d+)?/u);

  if (!match) return null;

  const number = Number(match[0]);
  return Number.isFinite(number) ? number : null;
}

function parseJson(text) {
  return JSON.parse(String(text).replace(/^\uFEFF/u, ""));
}

function pushError(errors, condition, message) {
  if (!condition) errors.push(message);
}

const file = path.resolve(
  getArgValue(
    "--file",
    "public/data/races/keirin-jp-results.generated.json",
  ),
);

const requireComplete = args.includes("--require-complete");
const expectedVenueCount = numberValue(
  getArgValue("--expect-venues", ""),
);
const expectedRaceCount = numberValue(
  getArgValue("--expect-races", ""),
);

const raw = await readFile(file, "utf8");
const payload = parseJson(raw);
const fileStat = await stat(file);

const errors = [];
const warnings = [];

const venues = Array.isArray(payload.venues)
  ? payload.venues
  : [];

const races = venues.flatMap((venue) =>
  (Array.isArray(venue.races) ? venue.races : [])
    .map((race) => ({ venue, race })),
);

pushError(
  errors,
  payload.schemaVersion === 1,
  `unexpected schemaVersion: ${payload.schemaVersion}`,
);

pushError(
  errors,
  clean(payload.source?.provider) === "KEIRIN.JP",
  `unexpected provider: ${clean(payload.source?.provider) || "(missing)"}`,
);

pushError(
  errors,
  /^\d{4}-\d{2}-\d{2}$/u.test(clean(payload.date)),
  `invalid payload date: ${clean(payload.date) || "(missing)"}`,
);

pushError(
  errors,
  venues.length > 0,
  "venue list is empty",
);

pushError(
  errors,
  races.length > 0,
  "race list is empty",
);

pushError(
  errors,
  payload.venueCount === venues.length,
  `venueCount mismatch: payload=${payload.venueCount} actual=${venues.length}`,
);

pushError(
  errors,
  payload.raceCount === races.length,
  `raceCount mismatch: payload=${payload.raceCount} actual=${races.length}`,
);

if (expectedVenueCount != null) {
  pushError(
    errors,
    venues.length === expectedVenueCount,
    `expected venue count ${expectedVenueCount}, actual ${venues.length}`,
  );
}

if (expectedRaceCount != null) {
  pushError(
    errors,
    races.length === expectedRaceCount,
    `expected race count ${expectedRaceCount}, actual ${races.length}`,
  );
}

const forbiddenPattern =
  /encp=|encPara|touhyouLivePara|fnI91TdVAK41Vyxrjvt6v/iu;

pushError(
  errors,
  !forbiddenPattern.test(raw),
  "encrypted or internal communication parameter detected",
);

const venueCodes = venues.map((venue) =>
  clean(venue.venueCode),
);

pushError(
  errors,
  venueCodes.every(Boolean),
  "one or more venue codes are missing",
);

pushError(
  errors,
  new Set(venueCodes).size === venueCodes.length,
  "duplicate venue code detected",
);

const raceKeys = [];
let confirmedRaceCount = 0;
let partialRaceCount = 0;
let pendingRaceCount = 0;
let errorRaceCount = 0;
let fullFinishOrderRaceCount = 0;
let finishOrderRowCount = 0;
let registrationNoCount = 0;
let missingRegistrationNoCount = 0;
let trifectaPayoutCount = 0;

for (const venue of venues) {
  const venueName = clean(venue.venueName);
  const venueCode = clean(venue.venueCode);
  const venueRaces = Array.isArray(venue.races)
    ? venue.races
    : [];

  pushError(
    errors,
    Boolean(venueName),
    `venueName missing: venueCode=${venueCode || "(missing)"}`,
  );

  pushError(
    errors,
    clean(venue.date) === clean(payload.date),
    `venue date mismatch: ${venueName || venueCode}`,
  );

  pushError(
    errors,
    venue.raceCount === venueRaces.length,
    `venue raceCount mismatch: ${venueName || venueCode}`,
  );

  for (const race of venueRaces) {
    const raceNumber = Number(race.raceNumber);
    const raceKey =
      `${clean(payload.date)}:${venueCode}:${raceNumber}`;

    raceKeys.push(raceKey);

    pushError(
      errors,
      Number.isInteger(raceNumber) && raceNumber > 0,
      `invalid race number: ${raceKey}`,
    );

    const finishOrder = Array.isArray(race.finishOrder)
      ? race.finishOrder
      : [];

    finishOrderRowCount += finishOrder.length;

    if (finishOrder.length >= 5) {
      fullFinishOrderRaceCount += 1;
    }

    const carNos = finishOrder
      .map((row) => clean(row.carNo))
      .filter(Boolean);

    pushError(
      errors,
      new Set(carNos).size === carNos.length,
      `duplicate car number in finish order: ${raceKey}`,
    );

    for (const row of finishOrder) {
      const registrationNo = clean(row.registrationNo);

      if (registrationNo) {
        registrationNoCount += 1;

        pushError(
          errors,
          /^\d{6}$/u.test(registrationNo),
          `invalid registrationNo ${registrationNo}: ${raceKey}`,
        );
      }
      else {
        missingRegistrationNoCount += 1;
      }
    }

    const trifecta = race.payout3tan;

    if (
      trifecta?.combination &&
      Number.isFinite(trifecta?.payoutYen)
    ) {
      trifectaPayoutCount += 1;
    }

    if (race.resultStatus === "confirmed") {
      confirmedRaceCount += 1;

      pushError(
        errors,
        race.operationStatus === "finished",
        `confirmed race is not finished: ${raceKey}`,
      );

      pushError(
        errors,
        finishOrder.length >= 3,
        `confirmed race finish order is incomplete: ${raceKey}`,
      );

      pushError(
        errors,
        Boolean(trifecta?.combination),
        `confirmed race trifecta combination missing: ${raceKey}`,
      );

      pushError(
        errors,
        Number.isFinite(trifecta?.payoutYen),
        `confirmed race trifecta payout missing: ${raceKey}`,
      );
    }
    else if (race.resultStatus === "partial") {
      partialRaceCount += 1;
    }
    else if (race.resultStatus === "pending") {
      pendingRaceCount += 1;
    }
    else if (race.resultStatus === "error") {
      errorRaceCount += 1;
    }
    else {
      errors.push(
        `unexpected resultStatus ${race.resultStatus}: ${raceKey}`,
      );
    }
  }
}

pushError(
  errors,
  new Set(raceKeys).size === raceKeys.length,
  "duplicate race key detected",
);

pushError(
  errors,
  payload.confirmedRaceCount === confirmedRaceCount,
  `confirmedRaceCount mismatch: payload=${payload.confirmedRaceCount} actual=${confirmedRaceCount}`,
);

pushError(
  errors,
  payload.partialRaceCount === partialRaceCount,
  `partialRaceCount mismatch: payload=${payload.partialRaceCount} actual=${partialRaceCount}`,
);

pushError(
  errors,
  payload.pendingRaceCount === pendingRaceCount,
  `pendingRaceCount mismatch: payload=${payload.pendingRaceCount} actual=${pendingRaceCount}`,
);

pushError(
  errors,
  payload.errorCount === errorRaceCount,
  `errorCount mismatch: payload=${payload.errorCount} actual=${errorRaceCount}`,
);

if (requireComplete) {
  pushError(
    errors,
    confirmedRaceCount === races.length,
    `complete feed required: confirmed=${confirmedRaceCount} races=${races.length}`,
  );

  pushError(
    errors,
    partialRaceCount === 0,
    `complete feed required: partial=${partialRaceCount}`,
  );

  pushError(
    errors,
    pendingRaceCount === 0,
    `complete feed required: pending=${pendingRaceCount}`,
  );

  pushError(
    errors,
    errorRaceCount === 0,
    `complete feed required: errors=${errorRaceCount}`,
  );
}

if (fileStat.size > 1024 * 1024) {
  warnings.push(
    `public JSON exceeds 1MB: ${fileStat.size} bytes`,
  );
}

console.log("[keirin-jp results check]");
console.log(`file: ${file}`);
console.log(`date: ${clean(payload.date)}`);
console.log(`venues: ${venues.length}`);
console.log(`races: ${races.length}`);
console.log(`confirmed: ${confirmedRaceCount}`);
console.log(`partial: ${partialRaceCount}`);
console.log(`pending: ${pendingRaceCount}`);
console.log(`errors: ${errorRaceCount}`);
console.log(`finish order rows: ${finishOrderRowCount}`);
console.log(`full finish order races: ${fullFinishOrderRaceCount}`);
console.log(`registration numbers: ${registrationNoCount}`);
console.log(`missing registration numbers: ${missingRegistrationNoCount}`);
console.log(`trifecta payouts: ${trifectaPayoutCount}`);
console.log(`bytes: ${fileStat.size}`);
console.log(`warnings: ${warnings.length}`);
console.log(`audit errors: ${errors.length}`);

for (const warning of warnings) {
  console.warn(`[warning] ${warning}`);
}

for (const error of errors) {
  console.error(`[error] ${error}`);
}

if (errors.length > 0) {
  process.exitCode = 1;
}