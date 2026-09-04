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

const legacyUnbracketedText = metrics.classifyReviewTickets(null, [
  "購入",
  "01 1-2-3",
  "SHADOW",
  "02 1-3-2",
].join("\n"));
assert.equal(legacyUnbracketedText.status, "classified");
assert.equal(legacyUnbracketedText.purchaseTickets.length, 1);
assert.equal(legacyUnbracketedText.shadowTickets.length, 1);

const combinations = [
  "1-4-5", "4-1-5", "1-4-7", "4-1-7", "1-5-4", "5-1-4",
  "1-7-4", "7-1-4", "4-5-1", "5-4-1", "4-1-2", "5-1-2",
  "7-4-1", "7-5-1", "4-7-1", "5-7-1", "1-4-2", "1-5-2",
];
const numberedRows = (rows, token = "") => rows.map((combination, index) => (
  `${String(index + 1).padStart(2, "0")}${token}${combination}${token ? "|detail" : " 13.9倍"}`
));
const toyamaText = ({ decision, points, investment, purchase, shadow, purchaseHeader = "【買い目】", shadowHeader = "【影買い目】" }) => [
  `purchaseDecision：${decision}`,
  `purchasePoints：${points}`,
  `investmentYen：${investment.toLocaleString("ja-JP")}円`,
  "",
  purchaseHeader,
  ...(purchase.length > 0 ? numberedRows(purchase) : ["なし"]),
  "",
  shadowHeader,
  ...numberedRows(shadow),
].join("\n");

const toyamaBuy8 = metrics.classifyReviewTickets(null, toyamaText({
  decision: "BUY",
  points: 8,
  investment: 800,
  purchase: combinations.slice(0, 8),
  shadow: combinations.slice(8, 18),
}));
assert.equal(toyamaBuy8.status, "classified");
assert.equal(toyamaBuy8.purchaseDecision, "buy");
assert.equal(toyamaBuy8.purchaseTickets.length, 8);
assert.equal(toyamaBuy8.shadowTickets.length, 10);
assert.equal(toyamaBuy8.unitStakeYen, 100);
assert.equal(metrics.evaluateReviewRacePerformance({
  predictionText: toyamaText({
    decision: "BUY",
    points: 8,
    investment: 800,
    purchase: combinations.slice(0, 8),
    shadow: combinations.slice(8, 18),
  }),
  settled: true,
  resultOrder: "9-8-7",
}).actualInvestment, 800);

const toyamaValue10Text = toyamaText({
  decision: "VALUE_BUY",
  points: 10,
  investment: 1000,
  purchase: combinations.slice(0, 10),
  shadow: combinations.slice(10, 18),
});
const toyamaValue10 = metrics.classifyReviewTickets(null, toyamaValue10Text);
assert.equal(toyamaValue10.status, "classified");
assert.equal(toyamaValue10.purchaseDecision, "value-buy");
assert.equal(toyamaValue10.purchaseTickets.length, 10);
assert.equal(toyamaValue10.unitStakeYen, 100);
assert.equal(metrics.evaluateReviewRacePerformance({
  predictionText: toyamaValue10Text,
  settled: true,
  resultOrder: "9-8-7",
}).actualInvestment, 1000);

const toyamaSkipText = toyamaText({
  decision: "SKIP",
  points: 0,
  investment: 0,
  purchase: [],
  shadow: combinations,
  purchaseHeader: "【購入買い目】",
  shadowHeader: "【18候補・すべて影買い目】",
});
const toyamaSkip = metrics.classifyReviewTickets(null, toyamaSkipText);
assert.equal(toyamaSkip.status, "classified");
assert.equal(toyamaSkip.explicitSkip, true);
assert.equal(toyamaSkip.purchaseTickets.length, 0);
assert.equal(toyamaSkip.shadowTickets.length, 18);

const tachikawaText = ({ decision, points, investment, purchase, shadow }) => [
  `purchaseDecision：${decision}`,
  `purchasePoints：${points}`,
  `investmentYen：${investment}円`,
  "【買い目】",
  ...(purchase.length > 0 ? numberedRows(purchase, "|購入|") : ["購入なし"]),
  "【影買い目・購入しない】",
  ...numberedRows(shadow, "|影|"),
].join("\n");

const tachikawaBuy8 = metrics.classifyReviewTickets(null, tachikawaText({
  decision: "BUY",
  points: 8,
  investment: 800,
  purchase: combinations.slice(0, 8),
  shadow: combinations.slice(8, 18),
}));
assert.equal(tachikawaBuy8.status, "classified");
assert.equal(tachikawaBuy8.purchaseTickets.length, 8);
assert.equal(tachikawaBuy8.shadowTickets.length, 10);

const tachikawaValue12 = metrics.classifyReviewTickets(null, tachikawaText({
  decision: "VALUE_BUY",
  points: 12,
  investment: 1200,
  purchase: combinations.slice(0, 12),
  shadow: combinations.slice(12, 18),
}));
assert.equal(tachikawaValue12.status, "classified");
assert.equal(tachikawaValue12.purchaseTickets.length, 12);
assert.equal(tachikawaValue12.unitStakeYen, 100);
assert.equal(metrics.evaluateReviewRacePerformance({
  predictionText: tachikawaText({
    decision: "VALUE_BUY",
    points: 12,
    investment: 1200,
    purchase: combinations.slice(0, 12),
    shadow: combinations.slice(12, 18),
  }),
  settled: true,
  resultOrder: "9-8-7",
}).actualInvestment, 1200);

const tachikawaSkip = metrics.classifyReviewTickets(null, tachikawaText({
  decision: "SKIP",
  points: 0,
  investment: 0,
  purchase: [],
  shadow: combinations,
}));
assert.equal(tachikawaSkip.status, "classified");
assert.equal(tachikawaSkip.explicitSkip, true);
assert.equal(tachikawaSkip.shadowTickets.length, 18);

const mismatch = metrics.classifyReviewTickets(null, toyamaText({
  decision: "BUY",
  points: 10,
  investment: 1000,
  purchase: combinations.slice(0, 8),
  shadow: combinations.slice(8, 18),
}));
assert.equal(mismatch.status, "unknown");
assert.match(mismatch.warnings.join("\n"), /purchase-count-mismatch/u);

const invalidInvestment = metrics.classifyReviewTickets(null, toyamaText({
  decision: "BUY",
  points: 8,
  investment: 900,
  purchase: combinations.slice(0, 8),
  shadow: combinations.slice(8, 18),
}));
assert.equal(invalidInvestment.status, "unknown");
assert.match(invalidInvestment.warnings.join("\n"), /investment-points-mismatch/u);

const ambiguousShadowOnly = metrics.classifyReviewTickets(null, [
  "【影買い目】",
  "01 1-2-3",
].join("\n"));
assert.equal(ambiguousShadowOnly.status, "unknown");
assert.match(ambiguousShadowOnly.warnings.join("\n"), /shadow-only-without-explicit-skip/u);

const explicitLineTokens = metrics.classifyReviewTickets(null, [
  "purchaseDecision：BUY",
  "purchasePoints：2",
  "investmentYen：200円",
  "01｜購入｜1-2-3",
  "02|購入|1-3-2",
  "03｜影目｜2-1-3",
  "04｜影買い目｜2-3-1",
  "【影VALUE再評価】",
  "05 3-1-2",
].join("\n"));
assert.equal(explicitLineTokens.status, "classified");
assert.equal(explicitLineTokens.purchaseTickets.length, 2);
assert.equal(explicitLineTokens.shadowTickets.length, 2);
assert.equal(explicitLineTokens.shadowTickets.some((ticket) => ticket.combination === "3-1-2"), false);

const structuredPriority = metrics.classifyReviewTickets(predictionJson, toyamaValue10Text);
assert.equal(structuredPriority.source, "prediction-json-bet-plan");
assert.equal(structuredPriority.purchaseTickets.length, 1);

const skipShadowHit = metrics.evaluateReviewRacePerformance({
  predictionText: toyamaSkipText,
  settled: true,
  resultOrder: combinations[8],
  payoutByBetType: { "3連単": 12000 },
  manualActualInvestment: 1800,
});
assert.equal(skipShadowHit.status, "shadow-hit");
assert.equal(skipShadowHit.actualInvestment, 0);
assert.equal(skipShadowHit.actualPayout, 0);
assert.equal(skipShadowHit.actualProfit, 0);
assert.equal(skipShadowHit.shadowReferencePayout, 12000);

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
assert.equal(aggregate.purchasedSettledRaceCount, 3);
assert.equal(aggregate.actualInvestment, 3000);
assert.equal(aggregate.actualPayout, 5000);
assert.equal(aggregate.actualProfit, 2000);

const purchasedInvestments = [800, 800, 800, 1000, 1000, 1000].map((investment, index) => {
  const points = investment / 100;
  return {
    hasPrediction: true,
    performance: metrics.evaluateReviewRacePerformance({
      predictionText: toyamaText({
        decision: points === 8 ? "BUY" : "VALUE_BUY",
        points,
        investment,
        purchase: combinations.slice(0, points),
        shadow: combinations.slice(points, 18),
      }),
      settled: true,
      resultOrder: index === 0 ? combinations[0] : "9-8-7",
      payoutByBetType: { "3連単": 7000 },
    }),
  };
});
const financialWithSkip = metrics.aggregateReviewPerformance([
  ...purchasedInvestments,
  { hasPrediction: true, performance: skipShadowHit },
]);
assert.equal(financialWithSkip.classifiedSettledRaceCount, 7);
assert.equal(financialWithSkip.purchasedSettledRaceCount, 6);
assert.equal(financialWithSkip.actualInvestment, 5400);
assert.equal(financialWithSkip.actualPayout, 7000);
assert.equal(financialWithSkip.actualProfit, 1600);
assert.ok(Math.abs(financialWithSkip.actualHitRate - (100 / 6)) < 1e-9);
assert.ok(Math.abs(financialWithSkip.actualRoi - ((7000 / 5400) * 100)) < 1e-9);

assert.equal(metrics.getReviewMetricValueFontSize("0円"), "18px");
assert.equal(metrics.getReviewMetricValueFontSize("123.3%"), "16px");
assert.equal(metrics.getReviewMetricValueFontSize("-123,400円"), "12px");
assert.equal(metrics.getReviewMetricValueFontSize("+1,234,500円"), "11px");

const matching = metrics.compareReviewRaceReadiness([1, 2, 3, 4], [1, 2, 3, 4], [1, 2, 3, 4]);
assert.equal(matching.raceNumbersMatch, true);
const missing = metrics.compareReviewRaceReadiness([1, 2, 3, 4], [1, 2, 4], [1, 2, 3, 4]);
assert.deepEqual(missing.predictionMissingRaceNumbers, [3]);
assert.deepEqual(missing.resultOnlyRaceNumbers, [3]);

console.log(JSON.stringify({
  status: "PASS",
  fixtures: [
    "purchase-hit", "shadow-only", "miss", "unknown", "pending", "snapshot", "explicit-text", "legacy-unbracketed-text", "overlap",
    "toyama-buy-8", "toyama-value-10", "toyama-skip", "tachikawa-buy-8", "tachikawa-value-12",
    "tachikawa-skip", "purchase-count-mismatch", "investment-mismatch", "ambiguous-shadow-only",
    "explicit-line-tokens", "shadow-value-header-exclusion", "structured-source-priority", "skip-shadow-hit",
    "aggregate", "financial-six-purchases-one-skip", "large-metric-values", "race-readiness",
  ],
}, null, 2));
