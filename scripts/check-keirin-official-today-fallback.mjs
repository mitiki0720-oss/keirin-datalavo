import assert from "node:assert/strict";
import fs from "node:fs";
import { fetchWithRetry } from "./lib/fetch-with-retry.mjs";
import { attachKdreamsDetailLinks, buildOfficialTodayVenues, indexOfficialTodayRaces, indexOfficialTodayResults, isFreshOfficialResultSnapshot, mergeOfficialTodayRiders, officialResultToTodayRace, validateOfficialTodayEntries } from "./lib/official-today-source.mjs";
import { inspectIwakiTaira, inspectMaebashi } from "./lib/venue-official-sources.mjs";

const date = "2026-10-22";
const nowMs = Date.parse("2026-10-22T12:30:00.000Z");
assert.equal(isFreshOfficialResultSnapshot({ generatedAt: "2026-10-22T12:15:00.000Z" }, nowMs), true);
assert.equal(isFreshOfficialResultSnapshot({ generatedAt: "2026-10-22T12:09:00.000Z" }, nowMs), false);
assert.equal(isFreshOfficialResultSnapshot({ generatedAt: "2026-10-22T12:35:00.000Z" }, nowMs), false);
assert.equal(isFreshOfficialResultSnapshot({ generatedAt: "2026-10-22 21:15:00" }, nowMs), false);
const entry = { carNo: "1", registrationNo: "015672", name: "松本 詩乃", prefecture: "東 京", raceClass: "L1", stats: {} };
const official = {
  date,
  source: { provider: "KEIRIN.JP" },
  venues: [{ date, venueCode: "13", venueName: "いわき平競輪場", grade: "F2", races: [{ raceNumber: 1, entryStatus: "available", raceMeta: { startTime: "20:57", raceName: "L級" }, entries: [entry], lineup: "1" }] }],
};
const schedule = [{ venue: "いわき平", startDate: "2026-10-21", endDate: "2026-10-23", session: "midnight" }];

const originalFetch = globalThis.fetch;
try {
  let attempts = 0;
  globalThis.fetch = async () => { attempts += 1; return new Response("forbidden", { status: 403 }); };
  assert.equal((await fetchWithRetry("https://example.test", {}, { attempts: 3, retryDelayMs: 0 })).status, 403);
  assert.equal(attempts, 1);

  attempts = 0;
  globalThis.fetch = async () => { attempts += 1; return new Response("missing", { status: 404 }); };
  assert.equal((await fetchWithRetry("https://example.test", {}, { attempts: 3, retryDelayMs: 0 })).status, 404);
  assert.equal(attempts, 1);

  attempts = 0;
  globalThis.fetch = async () => { attempts += 1; return new Response("unavailable", { status: 500 }); };
  assert.equal((await fetchWithRetry("https://example.test", {}, { attempts: 3, retryDelayMs: 0 })).status, 500);
  assert.equal(attempts, 3);

  attempts = 0;
  globalThis.fetch = async () => { attempts += 1; throw new Error("timeout"); };
  await assert.rejects(fetchWithRetry("https://example.test", {}, { attempts: 3, retryDelayMs: 0 }), /timeout/);
  assert.equal(attempts, 3);
} finally {
  globalThis.fetch = originalFetch;
}

assert.deepEqual(validateOfficialTodayEntries(official, date), { venueCount: 1, raceCount: 1, riderCount: 1 });
assert.throws(() => validateOfficialTodayEntries(official, "2026-10-21"), /unavailable/);
assert.throws(() => validateOfficialTodayEntries({ ...official, venues: [...official.venues, official.venues[0]] }, date), /duplicate/);
assert.throws(() => validateOfficialTodayEntries({ ...official, venues: [{ ...official.venues[0], races: [{ ...official.venues[0].races[0], entries: [{ ...entry, registrationNo: "" }] }] }] }, date), /identity invalid/);
assert.throws(() => validateOfficialTodayEntries({ ...official, venues: [{ ...official.venues[0], races: [{ ...official.venues[0].races[0], raceMeta: { startTime: "" } }] }] }, date), /start time unavailable/);

const venue = buildOfficialTodayVenues(official, schedule, "2026-10-22T09:00:00+09:00")[0];
assert.equal(venue.venueCode, "13");
assert.equal(venue.slug, "iwakitaira");
assert.equal(venue.session, "midnight");
assert.equal(indexOfficialTodayRaces(official).size, 1);

const goodLink = { slug: "iwakitaira", raceId: "1320261021020001", raceNo: 1 };
assert.equal(attachKdreamsDetailLinks([venue], [{ venue: "いわき平", venueCode: "13", raceDetailLinks: [goodLink] }], date)[0].raceDetailLinks.length, 1);
assert.equal(attachKdreamsDetailLinks([venue], [{ venue: "いわき平", venueCode: "13", raceDetailLinks: [{ ...goodLink, raceId: "1320261021010001" }] }], date)[0].raceDetailLinks.length, 0);
assert.equal(attachKdreamsDetailLinks([venue], [{ venue: "いわき平", venueCode: "13", raceDetailLinks: [{ ...goodLink, raceId: "1320261022010001" }] }], date)[0].raceDetailLinks.length, 0);
assert.equal(attachKdreamsDetailLinks([venue], [{ venue: "函館", venueCode: "13", raceDetailLinks: [goodLink] }], date)[0].raceDetailLinks.length, 0);
assert.deepEqual(attachKdreamsDetailLinks([{ ...venue, raceNos: [1, 2] }], [{ venue: "いわき平", venueCode: "13", raceDetailLinks: [goodLink] }], date)[0].raceNos, [1, 2]);
assert.equal(attachKdreamsDetailLinks([venue], [{ venue: "いわき平", venueCode: "13", raceDetailLinks: [goodLink, goodLink] }], date)[0].raceDetailLinks.length, 0);
assert.equal(attachKdreamsDetailLinks([{ ...venue, eventStartDate: "", eventDayNumber: null }], [{ venue: "いわき平", venueCode: "13", raceDetailLinks: [goodLink] }], date)[0].raceDetailLinks.length, 0);

assert.equal(mergeOfficialTodayRiders([entry], [{ carNo: "1", name: "松本 詩乃", score: "54", previousRaceResults: [] }])[0].registrationNo, "015672");
assert.throws(() => mergeOfficialTodayRiders([entry], [{ carNo: "1", name: "別人" }]), /identity conflict/);
assert.throws(() => mergeOfficialTodayRiders([entry], [{ carNo: "1", name: "松本 詩乃", registrationNo: "99999" }]), /identity conflict/);
assert.throws(() => mergeOfficialTodayRiders([entry], [{ carNo: "1", name: "松本 詩乃" }, { carNo: "1", name: "松本 詩乃" }]), /duplicate/);

const iwakiHtml = `<div id="area_0"><a href="https://keirin.jp/pc/dfw/dataplaza/guest/racelist?KCD=13&KBI=20261021">出走表</a><a href="/old.pdf">PDF出走表</a></div><div id="area_1"><a href="https://keirin.jp/pc/dfw/dataplaza/guest/racelist?KCD=13&KBI=20261022">出走表</a><a href="/new.pdf">PDF出走表</a></div>`;
assert.equal(inspectIwakiTaira(iwakiHtml, date).pdfUrl, "https://tairakeirin.com/new.pdf");
assert.equal(inspectIwakiTaira(iwakiHtml, "2026-10-23").status, "date-or-venue-mismatch");
assert.equal(inspectIwakiTaira(iwakiHtml.replace("KCD=13&KBI=20261022", "KCD=11&KBI=20261022"), date).status, "date-or-venue-mismatch");
const maebashi = inspectMaebashi('<a href="/wp-content/uploads/pdf/runtable.pdf">前橋競輪出走表</a>', date);
assert.equal(maebashi.status, "pdf-date-unverified");
assert.deepEqual(maebashi.adoptedFields, []);

const threeEntries = [entry, { ...entry, carNo: "2", registrationNo: "015673", name: "選手 二" }, { ...entry, carNo: "3", registrationNo: "015674", name: "選手 三" }];
const resultRows = threeEntries.map((rider, index) => ({ rank: String(index + 1), carNo: rider.carNo, registrationNo: rider.registrationNo, name: rider.name }));
const result = { resultStatus: "confirmed", finishOrder: resultRows, payouts: { trifecta: [{ combination: "1-2-3", payoutYen: 5000, popularity: 4 }] } };
assert.equal(officialResultToTodayRace(result, { entries: threeEntries }).result.payout3tan.payout, "5000円 (4)");
assert.equal(officialResultToTodayRace({ ...result, finishOrder: resultRows.map((row) => ({ ...row, rank: "1" })) }, { entries: threeEntries }), null);
assert.throws(() => officialResultToTodayRace({ ...result, finishOrder: [{ ...resultRows[0], registrationNo: "99999" }, ...resultRows.slice(1)] }, { entries: threeEntries }), /identity conflict/);
const resultsPayload = { date, source: { provider: "KEIRIN.JP" }, venues: [{ date, venueCode: "13", races: [{ ...result, raceNumber: 1 }] }] };
assert.equal(indexOfficialTodayResults(resultsPayload, date).size, 1);
assert.throws(() => indexOfficialTodayResults(resultsPayload, "2026-10-21"), /mismatch/);
assert.throws(() => indexOfficialTodayResults({ ...resultsPayload, venues: [resultsPayload.venues[0], resultsPayload.venues[0]] }, date), /duplicate/);

const candidatePath = process.argv.find((arg) => arg.startsWith("--candidate="))?.slice("--candidate=".length);
const entriesPath = process.argv.find((arg) => arg.startsWith("--entries="))?.slice("--entries=".length);
const resultCandidatePath = process.argv.find((arg) => arg.startsWith("--result-candidate="))?.slice("--result-candidate=".length);
const resultsPath = process.argv.find((arg) => arg.startsWith("--results="))?.slice("--results=".length);
if (candidatePath) {
  const payload = JSON.parse(fs.readFileSync(candidatePath, "utf8"));
  const keys = new Set();
  let riders = 0;
  let times = 0;
  for (const currentVenue of payload.venues) {
    for (const race of currentVenue.races) {
      const key = `${payload.date}:${currentVenue.venueCode}:${race.raceNo}`;
      assert(!keys.has(key), `duplicate ${key}`);
      keys.add(key);
      assert(/^\d{1,2}:\d{2}$/.test(race.time), `start time missing ${key}`);
      times += 1;
      for (const rider of race.riders) {
        assert(/^\d{5,6}$/.test(rider.registrationNo), `registration missing ${key}:${rider.carNo}`);
        assert.equal(rider.registrationNoSource, "KEIRIN.JP:JSJ006");
        riders += 1;
      }
    }
  }
  assert(keys.size > 0);
  if (entriesPath) {
    const officialEntries = JSON.parse(fs.readFileSync(entriesPath, "utf8"));
    const counts = validateOfficialTodayEntries(officialEntries, payload.date);
    assert.equal(payload.venues.length, counts.venueCount);
    assert.equal(keys.size, counts.raceCount);
    assert.equal(riders, counts.riderCount);
    const officialRaces = indexOfficialTodayRaces(officialEntries);
    for (const currentVenue of payload.venues) for (const race of currentVenue.races) {
      const key = `${currentVenue.venueCode}:${race.raceNo}`;
      const sourceRace = officialRaces.get(key);
      assert(sourceRace, `official race missing ${key}`);
      assert.equal(race.time, sourceRace.raceMeta.startTime);
      const byCar = new Map(sourceRace.entries.map((rider) => [String(rider.carNo), rider]));
      assert.equal(race.riders.length, byCar.size);
      for (const rider of race.riders) {
        const sourceRider = byCar.get(String(rider.carNo));
        assert(sourceRider, `official car missing ${key}:${rider.carNo}`);
        assert.equal(rider.registrationNo, sourceRider.registrationNo);
        assert.equal(rider.name.replace(/\s+/gu, ""), sourceRider.name.replace(/\s+/gu, ""));
      }
    }
  }
  console.log(`candidate: venues=${payload.venues.length} races=${keys.size} riders=${riders} officialTimes=${times} duplicateRaceKeys=0`);
}
if (resultCandidatePath && resultsPath) {
  const candidate = JSON.parse(fs.readFileSync(resultCandidatePath, "utf8"));
  const source = JSON.parse(fs.readFileSync(resultsPath, "utf8"));
  const officialResults = indexOfficialTodayResults(source, candidate.date);
  let adopted = 0;
  let complex = 0;
  for (const venue of candidate.venues) for (const race of venue.races) {
    const officialRace = officialResults.get(`${venue.venueCode}:${race.raceNo}`);
    if (race.resultNote?.includes("official result: KEIRIN.JP JSJ012")) {
      assert.equal(officialRace.resultStatus, "confirmed");
      assert.equal(race.resultStatus, "confirmed");
      assert.equal(race.resultTop3.map((row) => row.carNo).join("-"), officialRace.finishOrder.filter((row) => ["1", "2", "3"].includes(String(row.rank))).map((row) => String(row.carNo)).join("-"));
      assert.equal(race.result.payout3tan.combination, officialRace.payouts.trifecta[0].combination);
      adopted += 1;
    }
    if (race.sourceNote?.includes("official complex result")) {
      assert.equal(officialRace.resultStatus, "confirmed");
      assert.notEqual(race.resultStatus, "confirmed");
      assert.equal(race.result?.status, "pending");
      assert.equal(race.resultTop3.length, 0);
      assert.equal(race.payouts.length, 0);
      assert.equal(race.result?.payout3tan, null);
      complex += 1;
    }
  }
  assert.equal(adopted + complex, source.confirmedRaceCount);
  console.log(`official results: confirmed=${source.confirmedRaceCount} adopted=${adopted} complexWithheld=${complex}`);
}
console.log("official today fallback fixtures: PASS");
