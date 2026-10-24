import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  classifyRacecardFailure,
  classifyOddsPage,
  createOddsAcquisition,
  hasConflictingTrifectaPrices,
  reusableVerifiedOdds,
  validateKdreamsRaceLink,
  validateTrifectaOdds,
} from "./lib/odds-acquisition.mjs";
import { fetchWithRetry } from "./lib/fetch-with-retry.mjs";

const date = "2026-10-23";
const venueCode = "44";
const raceNo = 5;
const base = { date, venueCode, raceNo, phase: "odds", provider: "kdreams" };
const requestedAt = "2026-10-23T01:00:00.000Z";
const fetchedAt = "2026-10-23T01:00:01.000Z";
const odds = [{ combination: "1-2-3", odds: 15.2, source: "kdreams" }];
const cars = [1, 2, 3, 4, 5, 6, 7];

function runOddsHtmlFixture(html) {
  const preload = `globalThis.fetch = async () => new Response(${JSON.stringify(html)}, { status: 200 });`;
  const importUrl = `data:text/javascript,${encodeURIComponent(preload)}`;
  const result = spawnSync(process.execPath, ["--import", importUrl, "scripts/update-today-races.mjs",
    "--debug-kdreams-odds", "--slug", "ogaki", "--race-id", "4420261021030005"],
  { encoding: "utf8", timeout: 15_000 });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

const normalHtml = `<div class="odds_contents none" id="JS_ODDSCONTENTS_3rentan">
<p class="header">人気順</p><table>
<tr><th>1</th><td><span class="num">1-2-3</span><span class="odds">12.3</span></td></tr>
<tr><th>2</th><td><span class="num">1-3-2</span><span class="odds">18.4</span></td></tr>
</table></div><!-- 3連複 Start -->`;
const normalOutput = runOddsHtmlFixture(normalHtml);
assert.match(normalOutput, /1 1-2-3 12\.3/);
assert.match(normalOutput, /2 1-3-2 18\.4/);
assert.match(normalOutput, /"combination": "1-2-3"/);
assert.match(normalOutput, /"popularity": 1/);
const conflictHtml = normalHtml.replace('</table>',
  '<tr><th>3</th><td><span class="num">1-2-3</span><span class="odds">99.9</span></td></tr></table>');
assert.doesNotMatch(runOddsHtmlFixture(conflictHtml), /1 1-2-3 12\.3/);
assert.match(runOddsHtmlFixture(conflictHtml), /finalTrifectaFavorite null/);
assert.match(runOddsHtmlFixture(`DERUCA MAINTENANCE ${normalHtml}`), /finalTrifectaFavorite null/);

assert.equal(classifyRacecardFailure({ httpStatus: 200, html: "DERUCA MAINTENANCE" }).status, "racecard-maintenance");
assert.equal(classifyRacecardFailure({ httpStatus: 200, html: "<html>unknown layout</html>" }).status, "format-changed");
for (const status of [403, 429, 503]) {
  assert.deepEqual(classifyRacecardFailure({ httpStatus: status }).status, "http-error");
}
assert.equal(classifyRacecardFailure({ error: new Error("timeout") }).status, "transport-error");
assert.equal(classifyOddsPage({ html: "DERUCA MAINTENANCE" }), "individual-odds-unavailable");
assert.equal(classifyOddsPage({ html: "<table></table>" }), "sale-state-unverified");
assert.equal(classifyOddsPage({ oddsCount: 1, valid: true }), "odds-verified");
assert.equal(classifyOddsPage({ oddsCount: 1, valid: false }), "identity-conflict-blocked");

const unrequested = createOddsAcquisition({ ...base, status: "racecard-maintenance" });
assert.equal(unrequested.httpAttempted, false);
assert.equal(unrequested.requestedAt, null);
assert.equal(unrequested.fetchedAt, null);
assert.throws(() => createOddsAcquisition({ ...base, status: "outside-phase", fetchedAt }), /unrequested/);
assert.throws(() => createOddsAcquisition({ ...base, status: "odds-verified", httpAttempted: true, requestedAt }), /fetch evidence/);
const success = createOddsAcquisition({ ...base, status: "odds-verified", httpAttempted: true, requestedAt, fetchedAt, httpStatus: 200 });
assert.equal(success.fetchedAt, fetchedAt);
assert.throws(() => createOddsAcquisition({ ...base, status: "http-error", httpAttempted: true, requestedAt, fetchedAt }), /only verified/);

const venue = { venueCode, eventStartDate: "2026-10-21", eventDayNumber: 3 };
const link = { raceNo, slug: "ogaki", raceId: "4420261021030005" };
assert.equal(validateKdreamsRaceLink(link, venue, raceNo, date), true);
for (const invalid of [
  [link, venue, raceNo, "2026-10-22"],
  [link, { ...venue, venueCode: "45" }, raceNo, date],
  [{ ...link, raceNo: 6 }, venue, raceNo, date],
  [{ ...link, raceId: "4420261021030006" }, venue, raceNo, date],
]) assert.equal(validateKdreamsRaceLink(...invalid), false);

assert.equal(validateTrifectaOdds(odds, cars).valid, true);
assert.equal(hasConflictingTrifectaPrices([odds[0], { ...odds[0], odds: 16 }]), true);
assert.equal(hasConflictingTrifectaPrices([odds[0], { ...odds[0] }]), false);
for (const invalid of [
  [{ combination: "1-1-3", odds: 15.2, source: "kdreams" }],
  [{ combination: "1-2-8", odds: 15.2, source: "kdreams" }],
  [{ combination: "1-2-3", odds: 0, source: "kdreams" }],
  [{ combination: "1-2-3", odds: 15.2, source: "payout" }],
  [odds[0], odds[0]],
]) assert.equal(validateTrifectaOdds(invalid, cars).valid, false);

const cached = { oddsTrifecta: odds, oddsObservation: { date, venueCode, raceNo, provider: "kdreams", fetchedAt } };
assert.ok(reusableVerifiedOdds(cached, { date, venueCode, raceNo, riderCars: cars }));
for (const identity of [
  { date: "2026-10-24", venueCode, raceNo, riderCars: cars },
  { date, venueCode: "45", raceNo, riderCars: cars },
  { date, venueCode, raceNo: 6, riderCars: cars },
]) assert.equal(reusableVerifiedOdds(cached, identity), null);
assert.equal(reusableVerifiedOdds({ ...cached, oddsObservation: { ...cached.oddsObservation, provider: "unknown" } }, { ...base, riderCars: cars }), null);
assert.equal(reusableVerifiedOdds({ ...cached, oddsObservation: { ...cached.oddsObservation, fetchedAt: "2026-10-22T14:59:59.000Z" } }, { ...base, riderCars: cars }), null);
assert.ok(reusableVerifiedOdds({ ...cached, oddsObservation: { ...cached.oddsObservation, fetchedAt: "2026-10-22T15:00:00.000Z" } }, { ...base, riderCars: cars }));
assert.equal(reusableVerifiedOdds({ ...cached, finalTrifectaFavorite: { combination: "1-3-2", odds: 3 } }, { ...base, riderCars: cars }), null);

const originalFetch = globalThis.fetch;
try {
  let attempts = 0;
  globalThis.fetch = async () => { attempts += 1; return { status: attempts === 1 ? 503 : 200, body: { cancel: async () => {} } }; };
  assert.equal((await fetchWithRetry("https://fixture.invalid", {}, { attempts: 2, retryDelayMs: 0 })).status, 200);
  assert.equal(attempts, 2);
  attempts = 0;
  globalThis.fetch = async () => { attempts += 1; return { status: 403, body: { cancel: async () => {} } }; };
  assert.equal((await fetchWithRetry("https://fixture.invalid", {}, { attempts: 3, retryDelayMs: 0 })).status, 403);
  assert.equal(attempts, 1);
  attempts = 0;
  globalThis.fetch = async () => { attempts += 1; return { status: attempts === 1 ? 429 : 200, body: { cancel: async () => {} } }; };
  assert.equal((await fetchWithRetry("https://fixture.invalid", {}, { attempts: 2, retryDelayMs: 0 })).status, 200);
  assert.equal(attempts, 2);
  attempts = 0;
  globalThis.fetch = async () => { attempts += 1; throw new Error("timeout"); };
  await assert.rejects(fetchWithRetry("https://fixture.invalid", {}, { attempts: 2, retryDelayMs: 0 }), /timeout/);
  assert.equal(attempts, 2);
} finally {
  globalThis.fetch = originalFetch;
}

for (const [phase, targeted, outside] of [["day", 37, 45], ["night", 24, 58], ["midnight", 21, 61]]) {
  const states = Array.from({ length: 82 }, (_, index) => createOddsAcquisition({
    ...base, raceNo: index + 1, phase,
    status: index < targeted ? "racecard-maintenance" : "outside-phase",
  }));
  assert.equal(states.filter((item) => item.status === "racecard-maintenance").length, targeted);
  assert.equal(states.filter((item) => item.status === "outside-phase").length, outside);
  assert.equal(states.filter((item) => item.httpAttempted).length, 0);
}
console.log("PASS: odds status, identity, cache evidence, bounded retry, and synthetic phase-count fixtures");
