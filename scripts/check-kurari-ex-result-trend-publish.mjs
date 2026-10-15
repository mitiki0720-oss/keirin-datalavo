import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataRoot = path.join(root, "public/data/analytics/kurari-ex-result-trend-lab-history");
const namespace = "/data/analytics/kurari-ex-result-trend-lab-history";
const index = JSON.parse(await readFile(path.join(dataRoot, "index.generated.json"), "utf8"));
const dates = [];
const dailyRoot = path.join(dataRoot, "daily");
for (const month of await readdir(dailyRoot)) {
  for (const file of await readdir(path.join(dailyRoot, month))) {
    if (file.endsWith(".generated.json")) dates.push(file.slice(0, 10));
  }
}
dates.sort();
assert.equal(dates.length, 60, "physical shard count");
assert.equal(index.shardCount, 60);
assert.equal(index.shards.length, 60);
assert.deepEqual(dates, index.shards.map((shard) => shard.date));
assert.equal(index.range.from, dates[0], "range start matches physical shards");
assert.equal(index.range.to, dates.at(-1), "range end matches physical shards");
for (let day = 0; day < 60; day += 1) {
  const date = new Date(`${index.range.from}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + day);
  assert.equal(dates[day], date.toISOString().slice(0, 10), "continuous dates");
}

const documents = new Map([[`${namespace}/index.generated.json`, index]]);
let physicalRaceCount = 0;
for (const shard of index.shards) {
  assert.equal(shard.path, `${namespace}/daily/${shard.date.slice(0, 7)}/${shard.date}.generated.json`);
  const document = JSON.parse(await readFile(path.join(dataRoot, "daily", shard.date.slice(0, 7), `${shard.date}.generated.json`), "utf8"));
  assert.equal(document.date, shard.date, "shard date matches filename");
  assert.equal(document.races.length, shard.raceCount, "shard race count matches index");
  physicalRaceCount += document.races.length;
  documents.set(shard.path, document);
}
const bundle = await build({
  entryPoints: [path.join(root, "src/lib/kurariExHistoricalResultLab.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  write: false,
  define: { "import.meta.env.BASE_URL": '"/"' },
});
const validator = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input) => {
  const value = documents.get(String(input));
  return value === undefined
    ? new Response("", { status: 404 })
    : new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
};
let loaded;
try {
  loaded = await validator.loadKurariExHistoricalResultTrendLabHistory();
} finally {
  globalThis.fetch = originalFetch;
}
const availability = loaded.availability;
const validatorIssues = loaded.shards.reduce((count, shard) => count + shard.issues.length, 0);
assert.equal(availability.loadedShardCount, 60);
assert.equal(availability.raceCount, physicalRaceCount, "loader and physical race counts");
assert.equal(availability.acceptedRaceCount, availability.raceCount);
assert.equal(availability.trendEligibleRaceCount + availability.nonTrendRaceCount, availability.acceptedRaceCount);
assert.equal(index.raceCount, physicalRaceCount, "index and physical race counts");
assert.equal(index.summary.storageEligibleRaceCount, availability.acceptedRaceCount);
assert.equal(index.summary.trendEligibleRaceCount, availability.trendEligibleRaceCount);
assert.equal(index.summary.nonTrendRaceCount, availability.nonTrendRaceCount);
assert.equal(availability.rejectedRaceCount, 0);
assert.equal(index.summary.sourceRejectedCount, 0);
assert.equal(validatorIssues, 0);
assert.equal(availability.productionBackfillReady, true);
assert.equal(index.summary.productionBackfillReady, true);
assert.equal(new Set(loaded.races.map((race) => race.raceKey)).size, loaded.races.length);
const expected = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, value] = arg.split("=");
  return [key, value];
}));
if (expected["--expect-to"]) assert.equal(index.range.to, expected["--expect-to"]);
if (expected["--expect-races"]) assert.equal(physicalRaceCount, Number(expected["--expect-races"]));
if (expected["--expect-eligible"]) assert.equal(availability.trendEligibleRaceCount, Number(expected["--expect-eligible"]));
if (expected["--expect-nontrend"]) assert.equal(availability.nonTrendRaceCount, Number(expected["--expect-nontrend"]));
console.log(JSON.stringify({ range: index.range, physicalShardCount: dates.length,
  loadedShardCount: availability.loadedShardCount, raceCount: availability.acceptedRaceCount,
  trendEligible: availability.trendEligibleRaceCount, nonTrend: availability.nonTrendRaceCount,
  sourceRejected: index.summary.sourceRejectedCount, rejected: availability.rejectedRaceCount,
  validatorIssues,
  productionBackfillReady: availability.productionBackfillReady }));
