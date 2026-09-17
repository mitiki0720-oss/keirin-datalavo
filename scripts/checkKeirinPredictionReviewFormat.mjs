import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import ts from "typescript";

async function importTypeScriptModule(relativePath) {
  const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
}

const canonical = await importTypeScriptModule("../src/lib/keirinPredictionCanonicalFormat.ts");
const review = await importTypeScriptModule("../src/lib/reviewPerformanceMetrics.ts");
const pageSource = await readFile(new URL("../src/pages/PageImplementations.tsx", import.meta.url), "utf8");

const allCombinations = [];
for (let first = 1; first <= 9; first += 1) {
  for (let second = 1; second <= 9; second += 1) {
    for (let third = 1; third <= 9; third += 1) {
      if (new Set([first, second, third]).size === 3) allCombinations.push(`${first}-${second}-${third}`);
    }
  }
}

function buildBlock({ raceNo, grade, decision, points, purchaseOffset = 0, shadowCount = 3 }) {
  const purchase = allCombinations.slice(purchaseOffset, purchaseOffset + points);
  const shadow = allCombinations
    .slice(purchaseOffset + points, purchaseOffset + points + shadowCount);
  return [
    `【2026-09-17 青森 ${raceNo}R】`,
    "date: 2026-09-17",
    "venue: 青森",
    `race: ${raceNo}R`,
    `raceSelectGrade: ${grade}`,
    `purchaseDecision: ${decision}`,
    `purchasePoints: ${points}`,
    `investmentYen: ${points * 100}`,
    "",
    "【出走表】",
    "source-backed fixture",
    "【並び】",
    "1-2-3 / 4-5 / 6-7",
    "【展開】",
    "fixture",
    "【買い目】",
    ...(purchase.length > 0
      ? purchase.map((combination, index) => `${String(index + 1).padStart(2, "0")} | 3連単 | ${combination} | ${index === 0 ? "厚め" : "本線"}`)
      : ["なし"]),
    "【影目】",
    ...shadow.map((combination, index) => `${String(index + 1).padStart(2, "0")} | 3連単 | ${combination} | 影`),
    "【設計メモ】",
    "fixture",
  ].join("\n");
}

function toPredictionJson(parsed) {
  const tickets = [...parsed.purchaseTickets, ...parsed.shadowTickets].map((ticket) => ({
    index: ticket.structuredIndex,
    betType: ticket.betType,
    combination: ticket.combination,
  }));
  return {
    tickets,
    betPlan: {
      status: "structured",
      purchaseTicketIndices: parsed.purchaseTickets.map((ticket) => ticket.structuredIndex),
      shadowTicketIndices: parsed.shadowTickets.map((ticket) => ticket.structuredIndex),
      unitStakeYen: 100,
      purchaseDecision: parsed.purchaseDecision,
      declaredPurchasePoints: parsed.purchasePoints,
      declaredInvestmentYen: parsed.investmentYen,
    },
  };
}

function checkFixture(input, expected) {
  const parsed = canonical.parseKeirinCanonicalPredictionBlock(input);
  assert.equal(parsed.isCanonical, true);
  assert.equal(parsed.isValid, true, parsed.errors.join("\n"));
  assert.equal(parsed.headerRaceNumber, expected.raceNo);
  assert.equal(parsed.metadataRaceNumber, expected.raceNo);
  assert.equal(parsed.purchaseTickets.length, expected.purchaseCount);
  assert.equal(parsed.shadowTickets.length, expected.shadowCount);
  assert.equal(new Set([...parsed.purchaseTickets, ...parsed.shadowTickets].map((ticket) => `${ticket.betType}:${ticket.combination}`)).size, expected.purchaseCount + expected.shadowCount);

  const classification = review.classifyReviewTickets(toPredictionJson(parsed), input);
  assert.equal(classification.status, "classified");
  assert.equal(classification.purchaseDecision, expected.reviewDecision);
  assert.equal(classification.explicitSkip, expected.reviewDecision === "skip");
  assert.equal(classification.purchaseTickets.length, expected.purchaseCount);
  assert.equal(classification.shadowTickets.length, expected.shadowCount);
  assert.equal(classification.declaredPurchasePoints, expected.purchaseCount);
  assert.equal(classification.declaredInvestmentYen, expected.purchaseCount * 100);
  return { parsed, classification };
}

const buy8Text = buildBlock({ raceNo: 1, grade: "A", decision: "BUY", points: 8 });
const value14Text = buildBlock({ raceNo: 2, grade: "B", decision: "VALUE_BUY", points: 14, purchaseOffset: 20 });
const skipText = buildBlock({ raceNo: 3, grade: "C", decision: "SKIP", points: 0, purchaseOffset: 60 });
const buy8 = checkFixture(buy8Text, { raceNo: 1, purchaseCount: 8, shadowCount: 3, reviewDecision: "buy" });
checkFixture(value14Text, { raceNo: 2, purchaseCount: 14, shadowCount: 3, reviewDecision: "value-buy" });
const skip = checkFixture(skipText, { raceNo: 3, purchaseCount: 0, shadowCount: 3, reviewDecision: "skip" });
const skipWithoutShadowText = buildBlock({ raceNo: 4, grade: "C", decision: "SKIP", points: 0, purchaseOffset: 80, shadowCount: 0 });
checkFixture(skipWithoutShadowText, { raceNo: 4, purchaseCount: 0, shadowCount: 0, reviewDecision: "skip" });

const purchaseHit = review.evaluateReviewRacePerformance({
  predictionJson: toPredictionJson(buy8.parsed),
  predictionText: buy8Text,
  settled: true,
  resultOrder: buy8.parsed.purchaseTickets[0].combination,
  payoutByBetType: { "3連単": 5000 },
});
assert.equal(purchaseHit.status, "purchase-hit");
assert.equal(purchaseHit.actualInvestment, 800);
assert.equal(purchaseHit.actualPayout, 5000);
assert.equal(purchaseHit.actualProfit, 4200);
assert.equal(purchaseHit.actualRoi, 625);

const skipShadowHit = review.evaluateReviewRacePerformance({
  predictionJson: toPredictionJson(skip.parsed),
  predictionText: skipText,
  settled: true,
  resultOrder: skip.parsed.shadowTickets[0].combination,
  payoutByBetType: { "3連単": 12000 },
});
assert.equal(skipShadowHit.status, "shadow-hit");
assert.equal(skipShadowHit.actualInvestment, 0);
assert.equal(skipShadowHit.actualPayout, 0);
assert.equal(skipShadowHit.actualProfit, 0);
assert.equal(skipShadowHit.shadowReferencePayout, 12000);

function checkRange(targetRaceNumbers) {
  const blocks = targetRaceNumbers.map((raceNo, index) => buildBlock({
    raceNo,
    grade: index % 3 === 2 ? "C" : index % 2 === 0 ? "A" : "B",
    decision: index % 3 === 2 ? "SKIP" : index % 2 === 0 ? "BUY" : "VALUE_BUY",
    points: index % 3 === 2 ? 0 : index % 2 === 0 ? 8 : 10,
    purchaseOffset: index * 25,
  }));
  const predictionRaceNumbers = blocks.map((block) => {
    const parsed = canonical.parseKeirinCanonicalPredictionBlock(block);
    assert.equal(parsed.isValid, true, parsed.errors.join("\n"));
    return parsed.metadataRaceNumber;
  });
  assert.equal(new Set(predictionRaceNumbers).size, targetRaceNumbers.length);
  assert.deepEqual(predictionRaceNumbers, targetRaceNumbers);
  const readiness = review.compareReviewRaceReadiness(targetRaceNumbers, predictionRaceNumbers, targetRaceNumbers);
  assert.equal(readiness.raceNumbersMatch, true);
  assert.deepEqual(readiness.predictionMissingRaceNumbers, []);
  assert.deepEqual(readiness.predictionOnlyRaceNumbers, []);
  assert.deepEqual(readiness.resultOnlyRaceNumbers, []);
  return readiness;
}

checkRange([1, 2, 3, 4, 5, 6]);
checkRange([7, 8, 9, 10, 11, 12]);

const mismatch = canonical.parseKeirinCanonicalPredictionBlock(buy8Text.replace("race: 1R", "race: 2R"));
assert.equal(mismatch.isValid, false);
assert.ok(mismatch.errors.includes("header-race-mismatch"));
const overlap = canonical.parseKeirinCanonicalPredictionBlock(buy8Text.replace(
  /01 \| 3連単 \| [1-9]-[1-9]-[1-9] \| 影/u,
  `01 | 3連単 | ${buy8.parsed.purchaseTickets[0].combination} | 影`,
));
assert.equal(overlap.isValid, false);
assert.ok(overlap.errors.some((error) => error.startsWith("purchase-shadow-overlap:")));

const contract = canonical.buildKeirinPredictionOutputFormatContract({
  date: "2026-09-17",
  venue: "青森",
  targetRaceNumbers: [1, 2, 3, 4, 5, 6],
});
assert.equal((contract.match(/【予想出力フォーマット契約 \/ COPY RANGE】/gu) ?? []).length, 1);
assert.match(contract, /必須対象R: 1R, 2R, 3R, 4R, 5R, 6R/u);
assert.match(contract, /18点固定購入は禁止/u);
assert.equal((pageSource.match(/buildKeirinPredictionOutputFormatContract\(\{/gu) ?? []).length, 1);
assert.match(pageSource, /parseKeirinCanonicalPredictionBlock\(text\)/u);

console.log(JSON.stringify({
  status: "PASS",
  fixtures: {
    buy8: { purchase: 8, investment: 800, payout: 5000, profit: 4200, roi: 625 },
    valueBuy14: { purchase: 14, investment: 1400 },
    skip: { purchase: 0, investment: 0, shadow: 3, shadowPurchaseConversion: false },
    ranges: ["1R-6R", "7R-12R"],
  },
  checks: {
    canonicalFormatParse: true,
    headerMetadataMatch: true,
    purchaseDecision: true,
    purchasePoints: true,
    investmentYen: true,
    purchaseTicketCount: true,
    shadowTicketCount: true,
    duplicateCombinationCount: 0,
    buySkipConflictCount: 0,
    rangeRaceMismatchCount: 0,
    reviewClassification: "classified",
    representativeSettlement: true,
  },
}, null, 2));
