import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFile(path.join(root, file), "utf8");
const source = await read("src/pages/ExDataPage.tsx");
const tabs = source.match(/const EX_SECTION_TABS:[\s\S]*?= \[([\s\S]*?)\];/u)?.[1];
assert.ok(tabs, "EX tab list missing");
const keys = [...tabs.matchAll(/\{ key: "([^"]+)"/gu)].map((match) => match[1]);
assert.deepEqual(keys, [
  "overview", "rider-form", "analysis", "today-flow", "venue-bias", "weather", "ranking",
  "turbulence", "chain", "structure-lab", "identity", "coverage", "trend",
]);
assert.match(source, /id="ex-section-rider-form"[\s\S]*?hidden=\{activeSectionTab !== "rider-form"\}/u);
assert.match(source, /loadKurariExRiderExactByFile\(item\.file\)/u);
assert.match(source, /<RiderRecentForm rider=\{selectedRider\}/u);
assert.match(source, /<RiderVenueSuitability rider=\{selectedRider\}/u);
assert.match(source, /<PlayerConditionTable rows=\{riderFormConditionRows\}/u);
assert.match(source, /selectedRiderShb\?\.registrationNo === selectedRider\.registrationNo/u);
assert.match(source, /<RiderRecentForm rider=\{selectedRider\} referenceOnly=\{riderFormFreshness !== "CURRENT"\}/u);
assert.match(source, /monthlyReviewStatus !== "idle"/u);

const helperSource = await read("src/lib/kurariExRiderForm.ts");
const helperJs = ts.transpileModule(helperSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { getRiderFormChange, getRiderFormFreshness } = await import(`data:text/javascript;base64,${Buffer.from(helperJs).toString("base64")}`);
const row = (windowSize, sampleSize, wins, seconds, thirds, complete = true) => ({
  windowSize, sampleSize, windowComplete: complete, wins, seconds, thirds,
  period: { from: "2026-09-01", to: "2026-10-03" },
});
const comparison = getRiderFormChange([row(5, 5, 2, 1, 1), row(10, 10, 3, 2, 2)]);
assert.ok(comparison);
assert.equal(comparison.previousStarts, 5);
assert.equal(comparison.previousWins, 1);
assert.equal(comparison.previousTop2, 2);
assert.equal(comparison.previousTop3, 3);
assert.equal(comparison.winRateChange, 20);
assert.equal(comparison.top2RateChange, 20);
assert.equal(comparison.top3RateChange, 20);
assert.equal(getRiderFormChange([row(5, 5, 2, 1, 1), row(10, 9, 3, 2, 2, false)]), null);
assert.equal(getRiderFormChange([row(5, 5, 2, 1, 1), row(10, 10, 1, 2, 2)]), null);
assert.equal(getRiderFormChange([row(5, 5, 4, 3, 0), row(10, 10, 5, 3, 1)]), null);
assert.equal(getRiderFormFreshness("2026-10-03", "2026-10-03T18:42:56.349Z", "2026-10-13"), "STALE");
assert.equal(getRiderFormFreshness(null, null, "2026-10-13"), "UNAVAILABLE");
assert.equal(getRiderFormFreshness("2026-13-03", "2026-10-03T18:42:56.349Z", "2026-10-13"), "UNAVAILABLE");
assert.equal(getRiderFormFreshness("2026-10-14", "2026-10-03T18:42:56.349Z", "2026-10-13"), "UNAVAILABLE");

const report = await read("public/data/monthly-review/2026-10/keirin-monthly-review-2026-10-12.txt");
for (const expected of ["9月照合採用：2,075R", "816R／2,006R＝40.68%", "ROI 69.27%", "third_missing: 502R", "same_3_wrong_order: 242R", "third_missing: 119R", "same_3_wrong_order: 60R"]) {
  assert.ok(report.includes(expected), `monthly audit source missing: ${expected}`);
}
const riderStatus = JSON.parse(await read("public/data/analytics/kurari-ex/exact/riders/status.generated.json"));
assert.equal(riderStatus.sourceType, "EXACT");
assert.equal(getRiderFormFreshness("2026-10-03", riderStatus.generatedAt, "2026-10-13"), "STALE");
console.log(JSON.stringify({ tabs: keys.length, sampleComparison: comparison, riderCount: riderStatus.riderCount, generatedAt: riderStatus.generatedAt, octoberAudit: true, staleGuard: true }));
