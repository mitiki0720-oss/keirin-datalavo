import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RESULT_FILE = "public/data/races/keirin-jp-results.generated.json";
const ENTRIES_FILE = "public/data/races/keirin-jp-entries.generated.json";
const OUTPUT_ROOT = "public/data/review-page/official-results";
const cleanName = (value) => String(value ?? "").normalize("NFKC").replace(/\s+/gu, "");

function assertSource(document, date, label, type) {
  if (document?.date !== date || document.source?.provider !== "KEIRIN.JP"
    || document.source.endpoint !== "/pc/json" || document.source[type] !== (type === "entryType" ? "JSJ006" : "JSJ048")
    || !Number.isFinite(Date.parse(document.source.fetchCompletedAt ?? ""))
    || document.errorCount !== 0 || !Array.isArray(document.venues)
    || document.venueCount !== document.venues.length || !Number.isInteger(document.raceCount)
    || document.raceCount <= 0) {
    throw new Error(`${label}: official source, date, fetch, or count unavailable`);
  }
}

function raceMap(document, date, label) {
  const races = new Map();
  const venues = new Set();
  for (const venue of document.venues) {
    const code = String(venue.venueCode ?? "");
    if (venue.date !== date || !/^\d{2}$/u.test(code) || !cleanName(venue.venueName)
      || venues.has(code) || !Array.isArray(venue.races)) {
      throw new Error(`${label}: venue identity or date mismatch`);
    }
    venues.add(code);
    for (const race of venue.races) {
      const key = `${code}:${race.raceNumber}`;
      if (!Number.isInteger(race.raceNumber) || race.raceNumber < 1 || races.has(key)) {
        throw new Error(`${label}: duplicate or invalid race ${key}`);
      }
      races.set(key, { venue, race });
    }
  }
  if (races.size !== document.raceCount) throw new Error(`${label}: race count mismatch`);
  return races;
}

function riderMap(rows, label) {
  if (!Array.isArray(rows) || rows.length < 5) throw new Error(`${label}: rider rows incomplete`);
  const byCar = new Map();
  const registrations = new Set();
  for (const row of rows) {
    const car = String(row.carNo ?? "");
    const reg = String(row.registrationNo ?? "");
    if (!/^[1-9]$/u.test(car) || !/^\d{6}$/u.test(reg) || !cleanName(row.name)
      || byCar.has(car) || registrations.has(reg)) {
      throw new Error(`${label}: duplicate or unidentified rider`);
    }
    byCar.set(car, row);
    registrations.add(reg);
  }
  return byCar;
}

export function verifyReviewOfficialArchive(results, entries, date) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) throw new Error("--expect-date=YYYY-MM-DD is required");
  assertSource(results, date, "results", "listType");
  assertSource(entries, date, "entries", "entryType");
  if (results.confirmedRaceCount !== results.raceCount || results.pendingRaceCount !== 0
    || results.partialRaceCount !== 0 || entries.entryRaceCount !== entries.raceCount
    || entries.missingRaceCount !== 0 || entries.raceCount !== results.raceCount) {
    throw new Error("official results or entries are not complete");
  }
  const resultRaces = raceMap(results, date, "results");
  const entryRaces = raceMap(entries, date, "entries");
  if (resultRaces.size !== entryRaces.size) throw new Error("official race sets differ");
  for (const [key, { venue, race }] of resultRaces) {
    const officialEntry = entryRaces.get(key);
    if (!officialEntry || cleanName(venue.venueName) !== cleanName(officialEntry.venue.venueName)
      || race.resultStatus !== "confirmed" || race.operationStatus !== "finished"
      || officialEntry.race.entryStatus !== "available") {
      throw new Error(`official race identity or status mismatch: ${key}`);
    }
    const starters = riderMap(officialEntry.race.entries, `entries ${key}`);
    const finishers = riderMap(race.finishOrder, `results ${key}`);
    if (starters.size !== finishers.size) throw new Error(`official rider count mismatch: ${key}`);
    for (const [car, finisher] of finishers) {
      const starter = starters.get(car);
      if (!starter || starter.source !== "KEIRIN.JP:JSJ006"
        || starter.registrationNo !== finisher.registrationNo
        || cleanName(starter.name) !== cleanName(finisher.name)) {
        throw new Error(`official rider identity mismatch: ${key} car ${car}`);
      }
    }
  }
  return { raceCount: resultRaces.size, venueCount: results.venueCount };
}

export async function archiveReviewOfficialResults({ date, resultFile = RESULT_FILE,
  entriesFile = ENTRIES_FILE, outputRoot = OUTPUT_ROOT } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date ?? "")) throw new Error("--expect-date=YYYY-MM-DD is required");
  const [bytes, entryBytes] = await Promise.all([readFile(resultFile), readFile(entriesFile)]);
  const summary = verifyReviewOfficialArchive(JSON.parse(bytes.toString("utf8")),
    JSON.parse(entryBytes.toString("utf8")), date);
  const output = path.join(outputRoot, `${date}.generated.json`);
  const compareExisting = async () => {
    const existing = await readFile(output).catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (existing && !existing.equals(bytes)) throw new Error(`archive conflict; existing file preserved: ${output}`);
    return existing;
  };
  let status = "unchanged";
  if (!(await compareExisting())) {
    await mkdir(outputRoot, { recursive: true });
    try {
      await writeFile(output, bytes, { flag: "wx" });
      status = "created";
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      if (!(await compareExisting())) throw new Error(`archive race while writing: ${output}`);
    }
  }
  return { status, output, date, ...summary, sha256: createHash("sha256").update(bytes).digest("hex") };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const date = process.argv.find((arg) => arg.startsWith("--expect-date="))?.slice("--expect-date=".length);
  const resultFile = process.argv.find((arg) => arg.startsWith("--file="))?.slice("--file=".length);
  const entriesFile = process.argv.find((arg) => arg.startsWith("--entries-file="))?.slice("--entries-file=".length);
  archiveReviewOfficialResults({ date, resultFile, entriesFile })
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => { console.error(error); process.exitCode = 1; });
}
