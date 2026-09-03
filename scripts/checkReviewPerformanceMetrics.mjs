import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import ts from "typescript";

const sourceUrl = new URL("../src/lib/reviewPerformanceMetrics.ts", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const metrics = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

const predictionJson = {
  tickets: [
    { index: "01", betType: "3連単", combination: "1-2-3" },
    { index: "02", betType: "3連単", combination: "1-3-2" },
  ],
  betPlan: {
    status: "structured",
    purchaseTicketIndices: ["01"],
    shadowTicketIndices: ["02"],
    unitStakeYen: 100,
  },
};

const evaluate = (resultOrder, settled = true) => metrics.evaluateReviewRacePerformance({
  predictionJson,
  settled,
  resultOrder,
  payoutByBetType: { "3連単": resultOrder === "1-2-3" ? 5000 : 8000 },
  manualActualInvestment: 1000,
});

const purchaseHit = evaluate("1-2-3");
assert.equal(purchaseHit.status, "purchase-hit");
assert.equal(purchaseHit.actualInvestment, 1000);
assert.equal(purchaseHit.actualPayout, 5000);

const shadowHit = evaluate("1-3-2");
assert.equal(shadowHit.status, "shadow-hit");
assert.equal(shadowHit.actualPayout, 0);
assert.equal(shadowHit.shadowReferencePayout, 8000);
assert.equal(shadowHit.actualProfit, -1000);

assert.equal(evaluate("2-1-3").status, "miss");
assert.equal(metrics.evaluateReviewRacePerformance({
  predictionJson: { tickets: predictionJson.tickets },
  settled: true,
  resultOrder: "1-2-3",
}).status, "unknown");
assert.equal(evaluate("", false).status, "pending");

const snapshotClassification = metrics.classifyReviewTickets({
  preRaceSnapshot: {
    ticketSnapshot: {
      purchaseClassification: "structured",
      tickets: predictionJson.tickets,
      betPlan: predictionJson.betPlan,
    },
  },
});
assert.equal(snapshotClassification.source, "pre-race-ticket-snapshot");
assert.equal(snapshotClassification.purchaseTickets.length, 1);
assert.equal(snapshotClassification.shadowTickets.length, 1);

const textClassification = metrics.classifyReviewTickets(null, [
  "【購入買い目】",
  "01 3連単 1-2-3",
  "【影買い目】",
  "02 3連単 1-3-2",
].join("\n"));
assert.equal(textClassification.source, "prediction-text-explicit");
assert.equal(textClassification.purchaseTickets[0].combination, "1-2-3");
assert.equal(textClassification.shadowTickets[0].combination, "1-3-2");

const overlapClassification = metrics.classifyReviewTickets({
  tickets: [
    { index: "01", betType: "3連単", combination: "1-2-3" },
    { index: "02", betType: "3連単", combination: "1-2-3" },
  ],
  betPlan: {
    status: "structured",
    purchaseTicketIndices: ["01"],
    shadowTicketIndices: ["02"],
  },
});
assert.equal(overlapClassification.purchaseTickets.length, 1);
assert.equal(overlapClassification.shadowTickets.length, 0);
assert.equal(overlapClassification.warnings.length, 1);

const aggregate = metrics.aggregateReviewPerformance([
  { hasPrediction: true, performance: purchaseHit },
  { hasPrediction: true, performance: shadowHit },
  { hasPrediction: true, performance: evaluate("2-1-3") },
  {
    hasPrediction: true,
    performance: metrics.evaluateReviewRacePerformance({
      predictionJson: { tickets: predictionJson.tickets },
      settled: true,
      resultOrder: "1-2-3",
    }),
  },
]);
assert.equal(aggregate.purchaseHitCount, 1);
assert.equal(aggregate.shadowHitCount, 1);
assert.equal(aggregate.classifiedSettledRaceCount, 3);
assert.equal(aggregate.actualInvestment, 3000);
assert.equal(aggregate.actualPayout, 5000);
assert.equal(aggregate.actualProfit, 2000);

const matching = metrics.compareReviewRaceReadiness([1, 2, 3, 4], [1, 2, 3, 4], [1, 2, 3, 4]);
assert.equal(matching.raceNumbersMatch, true);
const missing = metrics.compareReviewRaceReadiness([1, 2, 3, 4], [1, 2, 4], [1, 2, 3, 4]);
assert.deepEqual(missing.predictionMissingRaceNumbers, [3]);
assert.deepEqual(missing.resultOnlyRaceNumbers, [3]);

console.log(JSON.stringify({
  status: "PASS",
  fixtures: ["purchase-hit", "shadow-only", "miss", "unknown", "pending", "snapshot", "explicit-text", "overlap", "aggregate", "race-readiness"],
}, null, 2));
