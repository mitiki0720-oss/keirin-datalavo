import fs from "node:fs";
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

const inputPath = path.resolve(
  getArgValue(
    "--input",
    "public/data/races/keirin-jp-entries.generated.json",
  ),
);

const expectedDate = getArgValue("--expect-date", "");
const requireComplete = args.includes("--require-complete");

if (!fs.existsSync(inputPath)) {
  throw new Error(`[check:keirin-jp-entries] missing file: ${inputPath}`);
}

const payload = JSON.parse(fs.readFileSync(inputPath, "utf8"));

const venues = Array.isArray(payload.venues) ? payload.venues : [];
const races = venues.flatMap((venue) =>
  Array.isArray(venue.races) ? venue.races : [],
);
const entries = races.flatMap((race) =>
  Array.isArray(race.entries) ? race.entries : [],
);

const failures = [];

function fail(message) {
  failures.push(message);
}

if (payload.schemaVersion !== 1) {
  fail(`schemaVersion must be 1: actual=${payload.schemaVersion}`);
}

if (!payload.date) {
  fail("date is missing");
}

if (expectedDate && payload.date !== expectedDate) {
  fail(`date mismatch: expected=${expectedDate}, actual=${payload.date}`);
}

if (venues.length <= 0) {
  fail("venues are empty");
}

if (races.length <= 0) {
  fail("races are empty");
}

if (entries.length <= 0) {
  fail("entries are empty");
}

if (Number(payload.venueCount) !== venues.length) {
  fail(`venueCount mismatch: declared=${payload.venueCount}, actual=${venues.length}`);
}

if (Number(payload.raceCount) !== races.length) {
  fail(`raceCount mismatch: declared=${payload.raceCount}, actual=${races.length}`);
}

if (Number(payload.totalEntryCount) !== entries.length) {
  fail(`totalEntryCount mismatch: declared=${payload.totalEntryCount}, actual=${entries.length}`);
}

for (const venue of venues) {
  if (!venue.date) fail(`venue date missing: ${venue.venueName ?? venue.venueCode ?? "(unknown)"}`);
  if (!venue.venueName) fail(`venueName missing: ${venue.venueCode ?? "(unknown)"}`);

  for (const race of venue.races ?? []) {
    if (!race.raceNumber) {
      fail(`raceNumber missing: ${venue.venueName ?? venue.venueCode ?? "(unknown)"}`);
    }

    if (race.entryStatus === "available") {
      if (!Array.isArray(race.entries) || race.entries.length <= 0) {
        fail(`available race has no entries: ${venue.venueName} ${race.raceNumber}R`);
      }
    }
  }
}

if (requireComplete) {
  if (Number(payload.errorCount) !== 0) {
    fail(`errorCount must be 0: actual=${payload.errorCount}`);
  }

  if (Number(payload.missingRaceCount) !== 0) {
    fail(`missingRaceCount must be 0: actual=${payload.missingRaceCount}`);
  }

  if (Number(payload.entryRaceCount) !== races.length) {
    fail(`entryRaceCount must equal raceCount: entryRaceCount=${payload.entryRaceCount}, races=${races.length}`);
  }

  const missingRegistration = entries.filter((entry) => !entry.registrationNo);
  const missingName = entries.filter((entry) => !entry.name);
  const missingCarNo = entries.filter((entry) => !entry.carNo);

  if (missingRegistration.length) {
    fail(`registrationNo missing entries: ${missingRegistration.length}`);
  }

  if (missingName.length) {
    fail(`name missing entries: ${missingName.length}`);
  }

  if (missingCarNo.length) {
    fail(`carNo missing entries: ${missingCarNo.length}`);
  }

  if (Number(payload.lineupRaceCount) <= 0) {
    console.warn("[check:keirin-jp-entries] warning: lineupRaceCount is 0; official lineup may be unavailable.");
  }
}

console.log("[check:keirin-jp-entries]");
console.log(`input: ${inputPath}`);
console.log(`date: ${payload.date}`);
console.log(`venues: ${venues.length}`);
console.log(`races: ${races.length}`);
console.log(`entry races: ${payload.entryRaceCount}`);
console.log(`lineup races: ${payload.lineupRaceCount}`);
console.log(`entries: ${entries.length}`);
console.log(`missing: ${payload.missingRaceCount}`);
console.log(`errors: ${payload.errorCount}`);
console.log(`require complete: ${requireComplete}`);

if (failures.length) {
  console.error("[check:keirin-jp-entries] failed");
  for (const message of failures) {
    console.error(`- ${message}`);
  }
  process.exitCode = 1;
}
else {
  console.log("[check:keirin-jp-entries] ok");
}