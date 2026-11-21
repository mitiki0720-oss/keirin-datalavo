import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { build } from "esbuild";
import { validateOfficialResultIdentity, createRaceResult, mergeWithExisting } from "./update-keirin-jp-results.mjs";
import { buildReviewOfficialResultsFeed } from "../src/lib/reviewOfficialResults.ts";
import { aggregateReviewPerformance } from "../src/lib/reviewPerformanceMetrics.ts";

const root = path.resolve(".tmp/refund-wait-evidence");
const output = fs.mkdtempSync(path.resolve(".tmp/review-refund-test-"));
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));
const copy = value => structuredClone(value);
const date = "2026-11-21";
const original = read("results-diagnostic.json"), candidate = copy(original);
for (const venue of candidate.venues) for (const [i, race] of venue.races.entries()) {
  if (race.resultStatus !== "error") continue;
  const id = venue.venueCode + "R" + race.raceNumber;
  const context = { date, venueCode: venue.venueCode, raceNumber: race.raceNumber,
    data: read(id + "-JSJ012.json"), entries: read(id + "-JSJ006.json"), detail: read(id + "-JSJ001.json") };
  venue.races[i] = createRaceResult(race.raceNumber, context.detail.C0201data.C0201race[race.raceNumber - 1], context.data, validateOfficialResultIdentity(context));
}
const snapshot = mergeWithExisting({ date, venueCount: 0, raceCount: 0, venues: [] }, candidate).payload;
const baseFeed = buildReviewOfficialResultsFeed(snapshot, date);
globalThis.__refundSettlementGlob = () => ({});
async function reviewModule(source, extra = "") {
  const result = await build({
    stdin: { contents: source + `\nexport { resolveReviewRacePerformance, buildVenueGroups, buildResultCopy, isResultReviewReady, isReviewAllRefundRace ${extra} };`,
      resolveDir: path.resolve("src/pages"), sourcefile: "ReviewPage.tsx", loader: "tsx" },
    bundle: true, platform: "node", format: "esm", write: false,
    define: { "import.meta.env.BASE_URL": '"/keirin-datalavo/"', "import.meta.env.DEV": "false", "import.meta.glob": "__refundSettlementGlob" },
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`);
}
const api = await reviewModule(fs.readFileSync("src/pages/ReviewPage.tsx", "utf8"), ", attachReviewOfficialRefundEvidence, fetchReviewTodayFeed");
const beforeSource = spawnSync("git", ["show", "HEAD:src/pages/ReviewPage.tsx"], { encoding: "utf8" });
assert.equal(beforeSource.status, 0);
const before = await reviewModule(beforeSource.stdout);
function attached() { return api.attachReviewOfficialRefundEvidence(copy(baseFeed), copy(snapshot)); }
function refundRace(n = 4, feed = attached()) { return feed.venues.find(v => v.venueCode === "51").races.find(r => r.raceNo === n); }
function slot(venue = "福井", raceNumber = 4, combination = "1-2-3") {
  return { raceKey: `fixture:${venue}:${raceNumber}`, raceId: "fixture-race", date, venue, raceNumber, predictionText: "", savedAt: "2026-11-21T00:00:00Z",
    predictionJson: { tickets: [{ index: "01", betType: "3連単", combination, note: "本線" }],
      betPlan: { status: "structured", purchaseDecision: "BUY", purchaseTicketIndices: ["01"], shadowTicketIndices: [], unitStakeYen: 100, declaredPurchasePoints: 1, declaredInvestmentYen: 100 } } };
}
function record(n = 4) {
  return { date, venue: "福井", raceNumber: n, raceKey: "old-miss", raceId: "fixture-race", resultOrder: "1-2-3", hitStatus: "miss", autoHitStatus: "miss",
    investment: 100, investmentSource: "manual", payout: 0, profitLoss: -100, roi: 0, memo: "履歴は保持", savedAt: "2026-11-21T03:00:00Z" };
}
function confirmation() {
  return { status: "confirmed", sourceType: "OFFICIAL", sourceName: "official purchase/refund fixture", sourceUrl: "https://example.test/official-refund-receipt",
    purchaseId: "artificial-receipt-1", date, venueCode: "51", raceNumber: 4, purchaseAmountYen: 100, refundAmountYen: 100, refundedAt: "2026-11-21T04:00:00Z" };
}

for (const n of [4, 5]) test(`Fukui ${n}R: official cancellation visible, purchase invalid and settlement pending`, () => {
  const race = refundRace(n), saved = record(n), input = slot("福井", n);
  const originalRecord = JSON.stringify(saved), originalPrediction = JSON.stringify(input);
  const result = api.resolveReviewRacePerformance(input, saved, race);
  assert.equal(api.isReviewAllRefundRace(race), true); assert.equal(api.isResultReviewReady({ feedRace: race }), true);
  assert.equal(result.status, "pending"); assert.equal(result.purchaseHit, false); assert.equal(result.shadowOnlyHit, false);
  assert.equal(result.actualInvestment, undefined); assert.equal(result.actualPayout, undefined); assert.equal(result.actualProfit, undefined); assert.equal(result.actualRoi, undefined);
  assert.equal(result.refund.status, "pending"); assert.equal(result.refund.recordedInvestmentYen, 100); assert.equal(result.refund.refundAmountYen, undefined);
  assert.equal(JSON.stringify(saved), originalRecord); assert.equal(JSON.stringify(input), originalPrediction);
});
test("all-refund-only venue has zero settled purchases/hits and no fabricated 0% ROI", () => {
  const performance = aggregateReviewPerformance([4, 5].map(n => ({ hasPrediction: true, performance: api.resolveReviewRacePerformance(slot("福井", n), record(n), refundRace(n)) })));
  assert.equal(performance.purchasedSettledRaceCount, 0); assert.equal(performance.settledRaceCount, 0); assert.equal(performance.purchaseHitCount, 0);
  assert.equal(performance.actualHitRate, undefined); assert.equal(performance.actualRoi, undefined);
  assert.equal(performance.purchasedSettledRaceCount - performance.purchaseHitCount, 0);
  assert.equal(performance.actualInvestment, 0); assert.equal(performance.actualPayout, 0);
});
test("explicitly confirmed full refund has separate zero net profit, never ordinary ROI", () => {
  const saved = { ...record(), refundConfirmation: confirmation() };
  const result = api.resolveReviewRacePerformance(slot(), saved, refundRace());
  assert.equal(result.status, "pending"); assert.equal(result.refund.status, "confirmed");
  assert.equal(result.refund.refundAmountYen, 100); assert.equal(result.refund.netProfitYen, 0);
  assert.equal(result.actualInvestment, undefined); assert.equal(result.actualProfit, undefined); assert.equal(result.actualRoi, undefined);
});
test("recorded investment or old payout alone never proves receipt of a refund", () => {
  const saved = { ...record(), payout: 100, profitLoss: 0, roi: 100 };
  assert.equal(api.resolveReviewRacePerformance(slot(), saved, refundRace()).refund.status, "pending");
});
for (const [label, mutate] of [
  ["wrong date", r => { r.refundConfirmation.date = "2026-11-20"; }],
  ["wrong venue", r => { r.refundConfirmation.venueCode = "81"; }],
  ["wrong race", r => { r.refundConfirmation.raceNumber = 5; }],
  ["partial refund", r => { r.refundConfirmation.refundAmountYen = 50; }],
  ["unknown source", r => { r.refundConfirmation.sourceType = "unknown"; }],
  ["malformed source", r => { r.refundConfirmation.sourceName = 42; }],
  ["missing purchase reference", r => { r.refundConfirmation.purchaseId = ""; }],
  ["malformed purchase reference", r => { r.refundConfirmation.purchaseId = {}; }],
  ["unconfirmed investment", r => { r.investmentSource = "auto"; }],
  ["amount mismatch", r => { r.refundConfirmation.purchaseAmountYen = 200; }],
  ["HTTP source", r => { r.refundConfirmation.sourceUrl = "http://example.test/receipt"; }],
  ["URL credentials", r => { r.refundConfirmation.sourceUrl = "https://secret@example.test/receipt"; }],
  ["invalid timestamp", r => { r.refundConfirmation.refundedAt = "unknown"; }],
  ["future timestamp", r => { r.refundConfirmation.refundedAt = "2099-01-01T00:00:00Z"; }],
  ["nonexistent timestamp", r => { r.refundConfirmation.refundedAt = "2026-02-30T00:00:00Z"; }],
  ["receipt predates race day", r => { r.refundConfirmation.refundedAt = "2026-11-19T00:00:00Z"; }],
]) test(`refund amount remains unconfirmed: ${label}`, () => {
  const saved = { ...record(), refundConfirmation: confirmation() }; mutate(saved);
  const result = api.resolveReviewRacePerformance(slot(), saved, refundRace());
  assert.equal(result.refund.status, "pending"); assert.equal(result.refund.netProfitYen, undefined); assert.equal(result.actualRoi, undefined);
});

for (const [label, mutate] of [
  ["provider", p => { p.source.provider = "CTC"; }],
  ["source URL", p => { p.source.listUrl = "https://example.test/pc/json?type=JSJ048"; }],
  ["API type", p => { p.source.listType = "JSJ012"; }],
  ["expected date", p => { p.source.expectedDate = "2026-11-20"; }],
  ["mixed venue date", p => { p.venues[0].date = "2026-11-20"; }],
  ["future fetched timestamp", p => { p.source.fetchCompletedAt = "2099-01-01T00:00:00Z"; }],
  ["invalid fetched timestamp", p => { p.source.fetchCompletedAt = "unknown"; }],
  ["nonexistent fetched timestamp", p => { p.source.fetchCompletedAt = "2026-02-30T00:00:00Z"; }],
  ["fetched before race day", p => { p.source.fetchCompletedAt = "2026-11-19T00:00:00Z"; }],
  ["duplicate race", p => { const v = p.venues.find(v => v.venueCode === "51"); v.races.push(copy(v.races[0])); }],
  ["missing cancellation note", p => { p.venues.find(v => v.venueCode === "51").races[3].officialPublicationState.note = ""; }],
  ["another cancelled race", p => { p.venues.find(v => v.venueCode === "51").races[3].officialPublicationState.note = "6レースは中止となりました。"; }],
  ["partial payout mixed in", p => { p.venues.find(v => v.venueCode === "51").races[3].payouts.exacta[0].payoutDisplay = "一部返還"; }],
  ["numeric payout mixed in", p => { p.venues.find(v => v.venueCode === "51").races[3].payouts.exacta[0].payoutYen = 100; }],
  ["finish order contradiction", p => { p.venues.find(v => v.venueCode === "51").races[3].finishOrder = [{ rank: "1", carNo: "1" }]; }],
  ["unknown wager", p => { p.venues.find(v => v.venueCode === "51").races[3].payouts.unknown = []; }],
  ["prototype-named wager", p => { p.venues.find(v => v.venueCode === "51").races[3].payouts.constructor = []; }],
  ["fetch error", p => { p.errorCount = 1; }],
]) test(`official all-refund evidence is rejected: ${label}`, () => {
  const raw = copy(snapshot); mutate(raw);
  const feed = api.attachReviewOfficialRefundEvidence(copy(baseFeed), raw);
  assert.equal(api.isReviewAllRefundRace(refundRace(4, feed)), false);
});
test("free text cannot turn an ordinary confirmed race into all-refund", () => {
  const race = copy(baseFeed.venues.find(v => v.venueCode === "81").races.find(r => r.resultStatus === "confirmed"));
  const input = slot("小倉", race.raceNo, race.result.payout3tan.combination);
  race.resultNote = "全返還という記述があっても公式証拠ではない";
  assert.equal(api.isReviewAllRefundRace(race), false); assert.equal(api.resolveReviewRacePerformance(input, undefined, race).status, "purchase-hit");
});
test("unverified refund markers are held, not promoted to official all-refund", () => {
  const race = { raceNo: 4, resultStatus: "confirmed", payouts: [{ betType: "3連単", combination: "全返還", payout: "全返還" }], result: { status: "confirmed", finishOrder: [] } };
  assert.equal(api.isReviewAllRefundRace(race), false); assert.equal(api.isResultReviewReady({ feedRace: race, resultRecord: record() }), false);
  const result = api.resolveReviewRacePerformance(slot(), record(), race); assert.equal(result.status, "pending"); assert.equal(result.refund, undefined);
});
test("a partial refund cannot become an all-refund result", () => {
  const race = { raceNo: 4, resultStatus: "confirmed", payouts: [{ betType: "3連単", combination: "1-2-3", payout: "一部返還" }], result: { status: "confirmed" } };
  assert.equal(api.isReviewAllRefundRace(race), false); assert.equal(api.resolveReviewRacePerformance(slot(), record(), race).status, "pending");
});
test("serialized or reassigned evidence is not trusted", () => {
  assert.equal(api.isReviewAllRefundRace(copy(refundRace())), false);
  assert.equal(api.isReviewAllRefundRace({ ...refundRace(), raceNo: 6 }), false);
});
test("venue code/name/date must match the actual target feed", () => {
  for (const mutate of [f => { f.date = "2026-11-20"; }, f => { f.venues.find(v => v.venueCode === "51").venue = "小倉"; }, f => { f.venues.find(v => v.venueCode === "51").venueCode = "81"; }]) {
    const feed = copy(baseFeed); mutate(feed);
    const result = api.attachReviewOfficialRefundEvidence(feed, snapshot);
    assert.equal(result.venues.flatMap(v => v.races).some(r => api.isReviewAllRefundRace(r)), false);
  }
});
test("old snapshot finish/order/miss cannot override official cancellation", () => {
  const feed = attached(), input = slot();
  const oldSnapshot = copy(baseFeed.venues.find(v => v.venueCode === "81").races.find(r => r.resultStatus === "confirmed")); oldSnapshot.raceNo = 4;
  const groups = api.buildVenueGroups(date, { fixture: input }, { old: record() }, feed, { [`${date}:福井競輪場:4`]: oldSnapshot }, []);
  const race = groups.find(g => /福井/.test(g.venue)).races.find(r => r.raceNumber === 4);
  assert.equal(race.performance.status, "pending"); assert.equal(race.performance.actualProfit, undefined);
  assert.deepEqual(race.feedRace.result.finishOrder, []);
});
test("copy retains cancellation, purchase history and explicit settlement hold", () => {
  const input = slot(), saved = record(), feed = attached();
  const group = api.buildVenueGroups(date, { fixture: input }, { old: saved }, feed, {}, []).find(g => /福井/.test(g.venue));
  const text = api.buildResultCopy(group, {}, feed); fs.writeFileSync(path.join(output, "fukui-result-copy.txt"), text);
  assert.match(text, /4R/); assert.match(text, /5R/); assert.match(text, /レース中止・全返還/); assert.match(text, /購入無効/); assert.match(text, /精算保留/);
  assert.match(text, /記録済み投資額（履歴）: 100円/); assert.match(text, /返還額: 未確認/);
  const block = text.split("【4R】")[1].split("【5R】")[0];
  assert.doesNotMatch(block, /収支: -100円|回収率: 0(?:\.0)?%|最終判定: 不的中|実購入的中/);
});
test("confirmed refund copy has separate zero net profit and no ordinary ROI", () => {
  const input = slot(), saved = { ...record(), refundConfirmation: confirmation() }, feed = attached();
  const group = api.buildVenueGroups(date, { fixture: input }, { old: saved }, feed, {}, []).find(g => /福井/.test(g.venue));
  const text = api.buildResultCopy(group, {}, feed);
  assert.match(text, /返還後の正味収支: 0円（購入・全額返還確認済み）/); assert.match(text, /回収率: 対象外/);
});
test("all 27 normal confirmed races retain exact win/loss/ROI calculations", () => {
  let count = 0;
  for (const venue of baseFeed.venues) for (const race of venue.races) if (race.resultStatus === "confirmed") {
    for (const combination of [race.result.payout3tan.combination, "9-8-7"]) {
      const input = slot(venue.venue, race.raceNo, combination);
      assert.deepEqual(api.resolveReviewRacePerformance(input, undefined, race), before.resolveReviewRacePerformance(input, undefined, race));
    }
    count += 1;
  }
  assert.equal(count, 27);
});
test("mixed normal/refund venue aggregation excludes only refunds", () => {
  const normal = baseFeed.venues.find(v => v.venueCode === "81").races.find(r => r.resultStatus === "confirmed");
  const performance = api.resolveReviewRacePerformance(slot("小倉", normal.raceNo, normal.result.payout3tan.combination), undefined, normal);
  const single = aggregateReviewPerformance([{ hasPrediction: true, performance }]);
  const mixed = aggregateReviewPerformance([{ hasPrediction: true, performance }, { hasPrediction: true, performance: api.resolveReviewRacePerformance(slot(), record(), refundRace()) }]);
  for (const field of ["actualInvestment", "actualPayout", "actualProfit", "actualHitRate", "actualRoi", "purchaseHitCount", "purchasedSettledRaceCount"]) assert.equal(mixed[field], single[field]);
});
test("Kokura 3R remains publication-waiting, not an all-refund result", () => {
  const race = attached().venues.find(v => v.venueCode === "81").races.find(r => r.raceNo === 3);
  assert.equal(api.isReviewAllRefundRace(race), false); assert.equal(race.resultStatus, "pending");
  assert.equal(api.resolveReviewRacePerformance(slot("小倉", 3), undefined, race).status, "pending");
  assert.equal(api.isResultReviewReady({ feedRace: race }), false);
});
test("57-race replay and all 54 original unaffected records are unchanged", () => {
  assert.equal(snapshot.confirmedRaceCount, 27); assert.equal(snapshot.pendingRaceCount, 30); assert.equal(snapshot.cancelledRaceCount, 2); assert.equal(snapshot.errorCount, 0);
  let count = 0;
  for (const v of original.venues) for (const r of v.races) if (r.resultStatus !== "error") {
    assert.deepEqual(snapshot.venues.find(x => x.venueCode === v.venueCode).races.find(x => x.raceNumber === r.raceNumber), r); count += 1;
  }
  assert.equal(count, 54);
});
test("actual Review loader fetches and binds official evidence read-only", async () => {
  const old = globalThis.fetch, urls = [];
  globalThis.fetch = async input => { const url = String(input); urls.push(url); return new Response(JSON.stringify(url.includes("keirin-jp-results") ? snapshot : baseFeed), { status: 200 }); };
  try { const feed = await api.fetchReviewTodayFeed("no-store"); assert.equal(api.isReviewAllRefundRace(refundRace(4, feed)), true); assert.equal(urls.length, 2); }
  finally { globalThis.fetch = old; }
});
test("official evidence HTTP failure cannot authorize all-refund", async () => {
  const old = globalThis.fetch;
  globalThis.fetch = async input => String(input).includes("keirin-jp-results") ? new Response("forbidden", { status: 403 }) : new Response(JSON.stringify(baseFeed), { status: 200 });
  try { assert.equal(api.isReviewAllRefundRace(refundRace(4, await api.fetchReviewTodayFeed("no-store"))), false); }
  finally { globalThis.fetch = old; }
});
fs.writeFileSync(path.join(output, "57-race-replay.json"), JSON.stringify(snapshot, null, 2));
console.log("Review refund evidence: " + output);
