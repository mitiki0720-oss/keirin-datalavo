import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const helperUrl = new URL("../src/lib/reviewRaceSourceUnion.ts", import.meta.url);
const pageUrl = new URL("../src/pages/ReviewPage.tsx", import.meta.url);
const [helperSource, pageSource] = await Promise.all([
  readFile(helperUrl, "utf8"),
  readFile(pageUrl, "utf8"),
]);
const compiled = ts.transpileModule(helperSource, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { buildReviewRaceSourceUnion } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

const venueKey = "aomori";
const refs = Array.from({ length: 12 }, (_, index) => ({
  venueKey,
  raceNumber: index + 1,
}));
const feedRaces = refs.map((ref) => ({ ...ref, value: { raceNo: ref.raceNumber } }));
const results = refs.map((ref) => ({ ...ref, value: { confirmed: true } }));
const predictions = (count) => refs.slice(0, count).map((ref) => ({
  ...ref,
  value: { predictionText: `prediction ${ref.raceNumber}` },
}));

const summarize = ({ predictionCount, resultCount, includeFeed = true }) => {
  const union = buildReviewRaceSourceUnion({
    predictions: predictions(predictionCount),
    feedRaces: includeFeed ? feedRaces : [],
    results: results.slice(0, resultCount),
  });
  return {
    total: union.length,
    predictions: union.filter((race) => race.prediction).length,
    results: union.filter((race) => race.result?.confirmed).length,
    duplicateRaceCount: union.length - new Set(union.map((race) => race.raceNumber)).size,
  };
};

assert.deepEqual(summarize({ predictionCount: 0, resultCount: 12 }), {
  total: 12,
  predictions: 0,
  results: 12,
  duplicateRaceCount: 0,
});
assert.deepEqual(summarize({ predictionCount: 3, resultCount: 12 }), {
  total: 12,
  predictions: 3,
  results: 12,
  duplicateRaceCount: 0,
});
assert.deepEqual(summarize({ predictionCount: 12, resultCount: 12 }), {
  total: 12,
  predictions: 12,
  results: 12,
  duplicateRaceCount: 0,
});
assert.deepEqual(summarize({ predictionCount: 12, resultCount: 5 }), {
  total: 12,
  predictions: 12,
  results: 5,
  duplicateRaceCount: 0,
});
assert.deepEqual(summarize({ predictionCount: 0, resultCount: 0 }), {
  total: 12,
  predictions: 0,
  results: 0,
  duplicateRaceCount: 0,
});

const reviewOnly = buildReviewRaceSourceUnion({
  predictions: [],
  feedRaces: [],
  results: [],
  reviewResults: [{ venueKey, raceNumber: 4 }],
});
assert.equal(reviewOnly.length, 1);
assert.equal(reviewOnly[0].hasReviewResult, true);

assert.doesNotMatch(pageSource, /if \(groups\.has\(key\)\) continue;/u);
assert.match(pageSource, /group\.races\.filter\(\(race\) => isPredictionReviewReady\(race\)\)/u);
assert.match(pageSource, /group\.races\.filter\(\(race\) => isResultReviewReady\(race\)\)/u);
assert.match(pageSource, /predictionText: slot\?\.predictionText \?\? ""/u);
assert.match(pageSource, /hasPrediction,/u);
assert.match(pageSource, /予想と結果のRを確認/u);
assert.match(pageSource, /予想不足:/u);
assert.match(pageSource, /結果不足:/u);

console.log(JSON.stringify({
  cases: {
    A: summarize({ predictionCount: 0, resultCount: 12 }),
    B: summarize({ predictionCount: 3, resultCount: 12 }),
    C: summarize({ predictionCount: 12, resultCount: 12 }),
    D: summarize({ predictionCount: 12, resultCount: 5 }),
    E: summarize({ predictionCount: 0, resultCount: 0 }),
  },
  reviewResultOnlyRaceIncluded: true,
  predictionAndResultCopiesFilteredIndependently: true,
}, null, 2));
console.log("REVIEW_RACE_SOURCE_UNION_CHECK_PASS");
