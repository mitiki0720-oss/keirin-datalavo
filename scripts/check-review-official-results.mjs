import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { buildReviewOfficialResultsFeed } from "../src/lib/reviewOfficialResults.ts";
import { evaluateReviewRacePerformance } from "../src/lib/reviewPerformanceMetrics.ts";
import { resolvePredictionGptSourceMetadata } from "../src/lib/predictionGptSourceContract.ts";

const archive = await readFile("public/data/review-page/official-results/2026-10-23.generated.json");
assert.equal(createHash("sha256").update(archive).digest("hex"), "163d0d202605dbbd97d7b46fe552fd9b10dfcacd5b612e4219cc77815f677733");
const snapshot = JSON.parse(archive.toString("utf8"));
const feed = buildReviewOfficialResultsFeed(snapshot, "2026-10-23");
assert.equal(feed.date, "2026-10-23");
assert.equal(feed.venues.length, 9);
assert.equal(feed.venues.reduce((sum, venue) => sum + venue.races.length, 0), 82);
assert.equal(feed.venues.flatMap((venue) => venue.races).filter((race) => race.result.reviewSettlementEligible).length, 82);
const nara = feed.venues.find((venue) => venue.venue === "奈良競輪場")?.races.find((race) => race.raceNo === 12);
assert.ok(nara);
assert.equal(feed.venues.find((venue) => venue.venue === "奈良競輪場")?.venueCode, "53");
assert.equal(nara.resultStatus, "confirmed");
assert.equal(nara.result.reviewSettlementEligible, true);
assert.deepEqual(nara.result.finishOrder.map((entry) => entry.rank), ["1", "2", "3", "4", "4", "6", "7"]);
assert.deepEqual(nara.result.finishOrder.map((entry) => entry.carNo), ["6", "2", "5", "1", "3", "7", "4"]);
assert.equal(nara.result.payout3tan.combination, "6-2-5");
assert.equal(nara.result.payout3tan.payout, "20340");
assert.equal(nara.result.finishOrder.filter((entry) => entry.rank === "4").length, 2);
assert.ok(nara.result.finishOrder.every((entry) => /^\d{6}$/.test(entry.registrationNo)));
const unpredicted = evaluateReviewRacePerformance({ settled: true, resultOrder: "6-2-5", payoutByBetType: { "3連単": 20340 } });
assert.equal(unpredicted.status, "unknown");
assert.equal(unpredicted.actualInvestment, undefined);
assert.equal(unpredicted.actualPayout, undefined);
assert.equal(unpredicted.actualRoi, undefined);
const sourceWithoutFetch = resolvePredictionGptSourceMetadata({
  feed: { generatedAt: "2026-10-24T01:00:00Z" },
  venue: { venue: "奈良" },
  race: { raceNo: 12 },
});
assert.notEqual(sourceWithoutFetch.sourceFetchedAt, "2026-10-24T01:00:00Z");
assert.throws(() => buildReviewOfficialResultsFeed(snapshot, "2026-10-24"), /source-mismatch/);
assert.throws(() => buildReviewOfficialResultsFeed({ ...snapshot, venues: [snapshot.venues[0], snapshot.venues[0]] }, "2026-10-23"), /duplicate-race/);
const pending = buildReviewOfficialResultsFeed({
  ...snapshot,
  venues: [{ ...snapshot.venues[0], races: [{ ...snapshot.venues[0].races[0], resultStatus: "pending" }] }],
}, "2026-10-23");
assert.equal(pending.venues[0].races[0].resultStatus, "pending");
assert.equal(pending.venues[0].races[0].result.finishOrder, undefined);
const multiplePayout = buildReviewOfficialResultsFeed({
  ...snapshot,
  venues: [{ ...snapshot.venues[0], races: [{
    ...snapshot.venues[0].races[0],
    payouts: { ...snapshot.venues[0].races[0].payouts, trifecta: [
      snapshot.venues[0].races[0].payouts.trifecta[0],
      snapshot.venues[0].races[0].payouts.trifecta[0],
    ] },
  }] }],
}, "2026-10-23");
assert.equal(multiplePayout.venues[0].races[0].result.reviewSettlementEligible, false);
assert.equal(multiplePayout.venues[0].races[0].result.payout3tan, null);
const topTie = buildReviewOfficialResultsFeed({
  ...snapshot,
  venues: [{ ...snapshot.venues[0], races: [{
    ...snapshot.venues[0].races[0],
    finishOrder: snapshot.venues[0].races[0].finishOrder.map((entry, index) => index === 1 ? { ...entry, rank: "1" } : entry),
  }] }],
}, "2026-10-23");
assert.equal(topTie.venues[0].races[0].result.reviewSettlementEligible, false);
const today = JSON.parse(await readFile("public/data/races/today.generated.json", "utf8"));
if (today.date === "2026-10-24") {
  assert.equal(today.venues.reduce((sum, venue) => sum + venue.races.length, 0), 90);
  assert.notEqual(feed.date, today.date);
}
const reviewSource = await readFile("src/pages/ReviewPage.tsx", "utf8");
assert.match(reviewSource, /const matchingLatestFeed = latestFeed\?\.date === selectedDate \? latestFeed : null/u);
for (const functionName of ["loadPredictionSlots", "loadPredictionResults"]) {
  const body = reviewSource.match(new RegExp(`function ${functionName}\\(\\) \\{([\\s\\S]*?)\\n\\}`))?.[1];
  assert.ok(body, `${functionName} exists`);
  assert.doesNotMatch(body, /localStorage\.(?:setItem|removeItem)/);
}
console.log(`Review official result archive: 9 venues / 82 races; Nara 12R tie, payout, identity, date isolation, unknown performance, pending guard, storage read-only PASS; live 2026-10-24 feed ${today.date === "2026-10-24" ? "90 races / separate date PASS" : "not current, skipped"}`);
