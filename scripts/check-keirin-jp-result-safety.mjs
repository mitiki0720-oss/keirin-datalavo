import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fetchWithRetry } from "./lib/fetch-with-retry.mjs";
import { assertCurrentDayWriteDate, fetchOfficialResultJson, indexOfficialTodayResults, officialResultToTodayRace } from "./lib/official-today-source.mjs";

const entries = {
  entries: [1, 2, 3].map((carNo) => ({
    carNo: String(carNo), registrationNo: `00000${carNo}`, name: `選手${carNo}`,
  })),
};
const result = () => ({
  resultStatus: "confirmed",
  finishOrder: entries.entries.map((entry, index) => ({
    rank: String(index + 1), ...entry,
  })),
  payouts: { trifecta: [{ combination: "1-2-3", payoutYen: 5000, popularity: 1 }] },
});

assert.equal(officialResultToTodayRace(result(), entries)?.result.payout3tan.combination, "1-2-3");

for (const mutate of [
  (race) => { race.finishOrder[1].rank = "1"; },
  (race) => { race.finishOrder[2].rank = ""; },
  (race) => { race.payouts.trifecta.push({ combination: "1-3-2", payoutYen: 5000 }); },
  (race) => { race.payouts.trifecta[0].combination = "1-3-2"; },
]) {
  const race = result();
  mutate(race);
  assert.equal(officialResultToTodayRace(race, entries), null);
}

const duplicateCar = result();
duplicateCar.finishOrder[1].carNo = "1";
assert.throws(() => officialResultToTodayRace(duplicateCar, entries), /identity conflict/);

const duplicateRider = result();
duplicateRider.finishOrder.push({ ...duplicateRider.finishOrder[0], rank: "4" });
assert.throws(() => officialResultToTodayRace(duplicateRider, entries), /identity conflict/);

const wrongIdentity = result();
wrongIdentity.finishOrder[0].registrationNo = "999999";
assert.throws(() => officialResultToTodayRace(wrongIdentity, entries), /identity conflict/);
assert.equal(officialResultToTodayRace({ ...result(), resultStatus: "pending" }, entries), null);

const tiedFourth = result();
tiedFourth.finishOrder.push(
  { rank: "4", carNo: "4", registrationNo: "000004", name: "選手4" },
  { rank: "4", carNo: "5", registrationNo: "000005", name: "選手5" },
);
const fiveEntries = { entries: [...entries.entries, ...tiedFourth.finishOrder.slice(3)] };
assert.equal(officialResultToTodayRace(tiedFourth, fiveEntries), null);

for (const status of ["失格", "落車", "棄権"]) {
  const special = result();
  special.finishOrder.push({ rank: status, carNo: "4", registrationNo: "000004", name: "選手4", status });
  assert.equal(officialResultToTodayRace(special, { entries: [...entries.entries, special.finishOrder[3]] }), null);
}

const allRefund = { resultStatus: "confirmed", finishOrder: [], payouts: { trifecta: [{ combination: "全返還", payoutDisplay: "全返還" }] } };
assert.equal(officialResultToTodayRace(allRefund, entries), null);

for (const phase of ["result", "final", "backfill"]) {
  assert.doesNotThrow(() => assertCurrentDayWriteDate("2026-10-23", "2026-10-23", phase));
  assert.throws(() => assertCurrentDayWriteDate("2026-10-23", "2026-10-24", phase), /JST date boundary/);
}

const jstDateAt = (instant) => new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date(instant));
assert.equal(jstDateAt("2026-10-23T14:47:00Z"), "2026-10-23");
assert.doesNotThrow(() => assertCurrentDayWriteDate("2026-10-23", jstDateAt("2026-10-23T14:59:00Z"), "final"));
assert.equal(jstDateAt("2026-10-23T14:53:00Z"), "2026-10-23");
assert.throws(() => assertCurrentDayWriteDate("2026-10-23", jstDateAt("2026-10-23T15:02:00Z"), "backfill"), /JST date boundary/);
assert.throws(() => assertCurrentDayWriteDate("2026-10-23", jstDateAt("2026-10-23T15:02:00Z"), "workflow publish"), /JST date boundary/);

const checkerDir = await mkdtemp(path.join(tmpdir(), "keirin-result-safety-"));
const fixturePath = path.join(checkerDir, "results.generated.json");
try {
  const confirmed = {
    raceNumber: 1, resultStatus: "confirmed", operationStatus: "finished",
    finishOrder: result().finishOrder, payout3tan: { combination: "1-2-3", payoutYen: 5000 },
  };
  const pending = { raceNumber: 2, resultStatus: "pending", operationStatus: "pending", finishOrder: [] };
  const venue = {
    date: "2026-10-23", venueCode: "53", venueName: "奈良", raceCount: 2,
    confirmedRaceCount: 1, partialRaceCount: 0, pendingRaceCount: 1, errorCount: 0,
    races: [confirmed, pending],
  };
  const payload = {
    schemaVersion: 1, generatedAt: "2026-10-23T14:53:00.000Z",
    source: { provider: "KEIRIN.JP", listType: "JSJ048" }, date: venue.date,
    venueCount: 1, raceCount: 2, confirmedRaceCount: 1, partialRaceCount: 0, pendingRaceCount: 1, errorCount: 0,
    venues: [venue],
  };
  const check = (...flags) => spawnSync(process.execPath, ["scripts/check-keirin-jp-results.mjs", `--file=${fixturePath}`, ...flags], {
    cwd: process.cwd(), encoding: "utf8",
  });
  await writeFile(fixturePath, JSON.stringify(payload));
  assert.equal(check("--expect-date=2026-10-23", "--require-no-errors").status, 0);
  assert.notEqual(check("--expect-date=2026-10-23", "--require-complete").status, 0);
  assert.notEqual(check("--expect-date=2026-10-24", "--require-no-errors").status, 0);
  pending.resultStatus = "error";
  venue.pendingRaceCount = payload.pendingRaceCount = 0;
  venue.errorCount = payload.errorCount = 1;
  assert.throws(() => indexOfficialTodayResults(payload, payload.date), /fetch errors/);
  await writeFile(fixturePath, JSON.stringify(payload));
  const errorCheck = check("--expect-date=2026-10-23", "--require-no-errors");
  assert.notEqual(errorCheck.status, 0);
  assert.match(errorCheck.stderr, /fetch errors are not allowed/);
} finally {
  await unlink(fixturePath).catch((error) => { if (error.code !== "ENOENT") throw error; });
  await rmdir(checkerDir);
}

const originalFetch = globalThis.fetch;
try {
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts += 1;
    return new Response("unavailable", { status: attempts === 1 ? 503 : 200 });
  };
  assert.equal((await fetchWithRetry("https://keirin.jp/pc/json", {}, { retryDelayMs: 0 })).status, 200);
  assert.equal(attempts, 2);

  attempts = 0;
  globalThis.fetch = async () => {
    attempts += 1;
    return new Response("missing", { status: 404 });
  };
  assert.equal((await fetchWithRetry("https://keirin.jp/pc/json", {}, { retryDelayMs: 0 })).status, 404);
  assert.equal(attempts, 1);

  attempts = 0;
  globalThis.fetch = async () => {
    attempts += 1;
    if (attempts === 1) throw new TypeError("temporary disconnect");
    return Response.json({ ok: true });
  };
  assert.deepEqual(await fetchOfficialResultJson("https://keirin.jp/pc/json", {}, { retryDelayMs: 0 }), { ok: true });
  assert.equal(attempts, 2);

  attempts = 0;
  globalThis.fetch = async () => {
    attempts += 1;
    return new Response(attempts === 1 ? "broken JSON" : '{"ok":true}');
  };
  assert.deepEqual(await fetchOfficialResultJson("https://keirin.jp/pc/json", {}, { retryDelayMs: 0 }), { ok: true });
  assert.equal(attempts, 2);

  attempts = 0;
  globalThis.fetch = async () => {
    attempts += 1;
    return new Response("broken JSON");
  };
  await assert.rejects(fetchOfficialResultJson("https://keirin.jp/pc/json", {}, { retryDelayMs: 0 }), SyntaxError);
  assert.equal(attempts, 3);

  attempts = 0;
  globalThis.fetch = async () => {
    attempts += 1;
    return new Response("forbidden", { status: 403 });
  };
  await assert.rejects(fetchOfficialResultJson("https://keirin.jp/pc/json", {}, { retryDelayMs: 0 }), /403/);
  assert.equal(attempts, 1);

  attempts = 0;
  globalThis.fetch = async (_url, { signal }) => {
    attempts += 1;
    return new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout fixture was not aborted")), 1_000);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(signal.reason);
      }, { once: true });
    });
  };
  await assert.rejects(fetchOfficialResultJson("https://keirin.jp/pc/json", {}, { retryDelayMs: 0, timeoutMs: 10 }), { name: "TimeoutError" });
  assert.equal(attempts, 3);
} finally {
  globalThis.fetch = originalFetch;
}

console.log("KEIRIN.JP result safety fixtures: PASS");
