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
  (race) => { race.finishOrder[2].rank = ""; },
  (race) => { race.payouts.trifecta.push({ combination: "1-3-2", payoutYen: 5000 }); },
  (race) => { race.payouts.trifecta[0].combination = "1-3-2"; },
  (race) => { race.finishOrder[2].rank = "4"; },
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
const tiedFourthResult = officialResultToTodayRace(tiedFourth, fiveEntries);
assert.deepEqual(tiedFourthResult.result.finishOrder.map((row) => row.rank), ["1", "2", "3", "4", "4"]);
assert.equal(tiedFourthResult.result.reviewSettlementEligible, true);

const topTie = result();
topTie.finishOrder[1].rank = "1";
topTie.finishOrder[2].rank = "3";
topTie.payouts.trifecta.push({ combination: "2-1-3", payoutYen: 6200, popularity: 2 });
topTie.payouts.exacta = [
  { combination: "1-2", payoutYen: 400 },
  { combination: "2-1", payoutYen: 520 },
];
const topTieResult = officialResultToTodayRace(topTie, entries);
assert.equal(topTieResult.resultStatus, "confirmed");
assert.equal(topTieResult.result.reviewSettlementEligible, false);
assert.equal(topTieResult.result.payout3tan, null);
assert.deepEqual(topTieResult.payouts.filter((row) => row.betType === "3連単")
  .map((row) => [row.combination, row.payout]), [["1-2-3", "5000円 (1)"], ["2-1-3", "6200円 (2)"]]);
assert.equal(topTieResult.payouts.filter((row) => row.betType === "2車単").length, 2);
const tiedSecond = result();
tiedSecond.finishOrder[2].rank = "2";
tiedSecond.payouts.trifecta.push({ combination: "1-3-2", payoutYen: 7100 });
assert.equal(officialResultToTodayRace(tiedSecond, entries)?.result.reviewSettlementEligible, false);
const tiedThird = result();
tiedThird.finishOrder.push({ rank: "3", carNo: "4", registrationNo: "000004", name: "選手4" });
tiedThird.payouts.trifecta.push({ combination: "1-2-4", payoutYen: 8100 });
assert.equal(officialResultToTodayRace(tiedThird, {
  entries: [...entries.entries, tiedThird.finishOrder[3]],
})?.payouts.filter((row) => row.betType === "3連単").length, 2);
const duplicatePayout = structuredClone(topTie);
duplicatePayout.payouts.trifecta.push({ combination: "1-2-3", payoutYen: 5000 });
assert.equal(officialResultToTodayRace(duplicatePayout, entries), null);
const missingPayout = result();
missingPayout.payouts.trifecta = [];
assert.equal(officialResultToTodayRace(missingPayout, entries)?.result.reviewSettlementEligible, false);

const kochiEntries = [
  ["5", "015169", "野口 裕史", "1"], ["3", "014576", "中田 雄喜", "2"],
  ["7", "014835", "窓場 千加頼", "3"], ["1", "014053", "鈴木 謙太郎", "4"],
  ["6", "014137", "房州 輝也", "4"], ["2", "015186", "南 潤", "6"],
  ["4", "014232", "柴田 洋輔", "7"],
].map(([carNo, registrationNo, name, rank]) => ({ carNo, registrationNo, name, rank }));
const kochi = {
  resultStatus: "confirmed", finishOrder: kochiEntries,
  kimarite: "逃げ", secondKimarite: "マーク",
  payouts: { trifecta: [{ combination: "5-3-7", payoutYen: 2660, popularity: 9 }] },
};
const kochiResult = officialResultToTodayRace(kochi, { entries: kochiEntries }, "2026-11-07T12:21:22.986Z");
assert.equal(kochiResult.resultStatus, "confirmed");
assert.deepEqual(kochiResult.result.finishOrder.map((row) => row.rank), ["1", "2", "3", "4", "4", "6", "7"]);
assert.deepEqual(kochiResult.result.finishOrder.filter((row) => row.rank === "4").map((row) => row.carNo), ["1", "6"]);
assert.equal(kochiResult.result.payout3tan.combination, "5-3-7");
assert.equal(kochiResult.result.payout3tan.payout, "2660円 (9)");
assert.equal(kochiResult.result.reviewSettlementEligible, true);
assert.equal(kochiResult.sourceFetchedAt, "2026-11-07T12:21:22.986Z");

for (const status of ["失格", "落車", "棄権"]) {
  const special = result();
  special.finishOrder.push({ rank: status, carNo: "4", registrationNo: "000004", name: "選手4", status });
  const converted = officialResultToTodayRace(special, { entries: [...entries.entries, special.finishOrder[3]] });
  assert.equal(converted.resultStatus, "confirmed");
  assert.equal(converted.result.finishOrder[3].status, status);
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
