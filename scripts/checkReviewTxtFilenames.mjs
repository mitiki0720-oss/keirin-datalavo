import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildReviewTextFilename,
  getReviewVenueSlugFromSourceFiles,
} from "../src/lib/reviewTextFilename.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reviewPageSource = fs.readFileSync(path.join(root, "src/pages/ReviewPage.tsx"), "utf8");

const fixtures = [
  { date: "2026-09-05", venue: "青森", venueSlug: "aomori", type: "predictions", expected: "2026-09-05-aomori-predictions.txt" },
  { date: "2026-09-05", venue: "青森", venueSlug: "aomori", type: "results", expected: "2026-09-05-aomori-results.txt" },
  { date: "2026-09-05", venue: "防府", venueSlug: "hofu", type: "predictions", expected: "2026-09-05-hofu-predictions.txt" },
  { date: "2026-09-05", venue: "武雄", venueSlug: "takeo", type: "results", expected: "2026-09-05-takeo-results.txt" },
];

for (const fixture of fixtures) {
  const actual = buildReviewTextFilename(fixture);
  assert.equal(actual, fixture.expected, `${fixture.venue} ${fixture.type}`);
  assert.doesNotMatch(actual, /[\s()（）]|\.txt\.txt$/u);
  assert.doesNotMatch(actual, /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u);
}

const reviewDate = "2026-09-05";
const savedAtDate = "2026-09-06";
assert.notEqual(reviewDate, savedAtDate);
assert.equal(
  buildReviewTextFilename({ date: reviewDate, venueSlug: "aomori", type: "results" }),
  "2026-09-05-aomori-results.txt",
  "The filename must use the selected review date, not the save date.",
);

assert.equal(
  getReviewVenueSlugFromSourceFiles("data/reviews/2026-09-05/hofu-prediction.txt"),
  "hofu",
);
assert.equal(
  getReviewVenueSlugFromSourceFiles(undefined, "data\\reviews\\2026-09-05\\takeo-result.txt"),
  "takeo",
);

assert.equal((reviewPageSource.match(/buildReviewTextFilename\(\{/gu) ?? []).length, 2);
assert.doesNotMatch(reviewPageSource, /kurari-review-/u);
assert.doesNotMatch(reviewPageSource, /buildReviewDownloadFileName/u);

console.log(JSON.stringify({
  ok: true,
  fixtureCount: fixtures.length + 1,
  sourceFileSlugChecks: 2,
  filenames: fixtures.map(({ venue, expected }) => ({ venue, filename: expected })),
}, null, 2));
