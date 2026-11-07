import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import { indexOfficialTodayRaces, indexOfficialTodayResults, officialResultToTodayRace } from "./lib/official-today-source.mjs";
import { buildReviewOfficialResultsFeed } from "../src/lib/reviewOfficialResults.ts";

// Bundle the existing Review functions without adding test-only exports to the app.
globalThis.__reviewTestGlob = () => ({});
const reviewSource = readFileSync("src/pages/ReviewPage.tsx", "utf8")
  + "\nexport { buildVenueGroups, buildResultCopy };";
const bundle = await build({
  stdin: { contents: reviewSource, resolveDir: path.resolve("src/pages"), sourcefile: "ReviewPage.tsx", loader: "tsx" },
  bundle: true, platform: "node", format: "esm", write: false,
  define: {
    "import.meta.env.BASE_URL": '"/keirin-datalavo/"',
    "import.meta.env.DEV": "false",
    "import.meta.glob": "__reviewTestGlob",
  },
});
const { buildVenueGroups, buildResultCopy } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`
);

const kochiEntries = [
  ["5", "015169", "野口 裕史", "1"], ["3", "014576", "中田 雄喜", "2"],
  ["7", "014835", "窓場 千加頼", "3"], ["1", "014053", "鈴木 謙太郎", "4"],
  ["6", "014137", "房州 輝也", "4"], ["2", "015186", "南 潤", "6"],
  ["4", "014232", "柴田 洋輔", "7"],
].map(([carNo, registrationNo, name, rank]) => ({ carNo, registrationNo, name, rank }));
const sourceFetchedAt = "2026-11-07T12:21:22.986Z";
const kochiResult = officialResultToTodayRace({
  resultStatus: "confirmed", finishOrder: kochiEntries,
  kimarite: "逃げ", secondKimarite: "マーク",
  weatherActual: { condition: "晴", windSpeedMps: 1 },
  payouts: { trifecta: [{ combination: "5-3-7", payoutYen: 2660, popularity: 9 }] },
}, { entries: kochiEntries }, sourceFetchedAt);
assert.ok(kochiResult);
const kochiFeed = { date: "2026-11-07", venues: [{
  venue: "高知", venueCode: "74", races: [{ raceNo: 9, ...kochiResult,
    riders: kochiEntries.map((entry) => ({ ...entry, fullName: entry.name })) }],
}] };
const [kochiGroup] = buildVenueGroups("2026-11-07", {}, {}, kochiFeed, {}, []);
assert.equal(kochiGroup.races.length, 1);
const kochiCopy = buildResultCopy(kochiGroup, {}, kochiFeed);
assert.match(kochiCopy, /対象R: 9R/);
assert.match(kochiCopy, /1着: 5 野口 裕史/);
assert.match(kochiCopy, /2着: 3 中田 雄喜/);
assert.match(kochiCopy, /3着: 7 窓場 千加頼/);
assert.match(kochiCopy, /4着: 車番 1 .*鈴木 謙太郎/);
assert.match(kochiCopy, /4着: 車番 6 .*房州 輝也/);
assert.match(kochiCopy, /3連単: 5-3-7.*2660円/);
assert.match(kochiCopy, /決まり手: 逃げ/);
assert.match(kochiCopy, /天気・風 \/ WEATHER ACTUAL[\s\S]*?晴/);
assert.match(kochiCopy, /天気・風 \/ WEATHER ACTUAL[\s\S]*?風速: 1/);
assert.match(kochiCopy, /source取得日時: 2026-11-07T12:21:22.986Z/);
assert.match(kochiCopy, /official source: KEIRIN.JP/);

const tiedEntries = [
  { rank: "1", carNo: "1", registrationNo: "000001", name: "選手1" },
  { rank: "1", carNo: "2", registrationNo: "000002", name: "選手2" },
  { rank: "3", carNo: "3", registrationNo: "000003", name: "選手3" },
];
const tiedResult = officialResultToTodayRace({
  resultStatus: "confirmed", finishOrder: tiedEntries,
  payouts: {
    exacta: [{ combination: "1-2", payoutYen: 170 }, { combination: "2-1", payoutYen: 160 }],
    trifecta: [{ combination: "1-2-3", payoutYen: 340 }, { combination: "2-1-3", payoutYen: 330 }],
  },
}, { entries: tiedEntries });
assert.equal(tiedResult.result.reviewSettlementEligible, false);
const tiedFeed = { date: "2026-11-07", venues: [{ venue: "高知", venueCode: "74", races: [
  { raceNo: 1, ...tiedResult, riders: tiedEntries.map((entry) => ({ ...entry, fullName: entry.name })) },
] }] };
const tiedGroup = buildVenueGroups("2026-11-07", {
  "fixture:1": { raceKey: "fixture:1", date: "2026-11-07", venue: "高知", raceNumber: 1,
    predictionText: "買い目: 1-2-3", savedAt: "2026-11-07T01:00:00Z" },
}, {}, tiedFeed, {}, [])[0];
assert.notEqual(tiedGroup.races[0].performance.status, "purchase-hit");
const tiedCopy = buildResultCopy(tiedGroup, {}, tiedFeed);
assert.match(tiedCopy, /1着: 1 選手1 \/ 2 選手2/);
assert.match(tiedCopy, /2着: 該当なし（公式着順）/);
assert.match(tiedCopy, /2車単: 1-2.*170.* \/ 2-1.*160/);
assert.match(tiedCopy, /3連単: 1-2-3.*340.* \/ 2-1-3.*330/);
assert.match(tiedCopy, /全着順/);
assert.doesNotMatch(tiedCopy, /実購入的中/);
const archivedTie = buildReviewOfficialResultsFeed({
  date: "2026-11-07", source: { provider: "KEIRIN.JP", fetchCompletedAt: sourceFetchedAt },
  venues: [{ date: "2026-11-07", venueCode: "74", venueName: "高知", races: [{
    raceNumber: 1, resultStatus: "confirmed", finishOrder: tiedEntries,
    payouts: {
      exacta: [{ combination: "1-2", payoutYen: 170 }, { combination: "2-1", payoutYen: 160 }],
      trifecta: [{ combination: "1-2-3", payoutYen: 340 }, { combination: "2-1-3", payoutYen: 330 }],
    },
  }] }],
}, "2026-11-07").venues[0].races[0];
assert.equal(archivedTie.result.reviewSettlementEligible, false);
assert.deepEqual(archivedTie.payouts.filter((item) => item.betType === "3連単")
  .map((item) => item.combination), ["1-2-3", "2-1-3"]);
assert.equal(archivedTie.payouts.filter((item) => item.betType === "2車単").length, 2);

const liveResults = JSON.parse(readFileSync("public/data/races/keirin-jp-results.generated.json", "utf8"));
const liveEntries = JSON.parse(readFileSync("public/data/races/keirin-jp-entries.generated.json", "utf8"));
if (liveResults.date === "2026-11-07" && liveEntries.date === liveResults.date) {
  const results = indexOfficialTodayResults(liveResults, liveResults.date);
  const entries = indexOfficialTodayRaces(liveEntries);
  const races = Array.from({ length: 12 }, (_, index) => {
    const raceNo = index + 1;
    const result = officialResultToTodayRace(results.get(`74:${raceNo}`), entries.get(`74:${raceNo}`), liveResults.source.fetchCompletedAt);
    assert.ok(result, `official Kochi ${raceNo}R must convert`);
    return { raceNo, ...result, riders: entries.get(`74:${raceNo}`).entries };
  });
  const feed = { date: liveResults.date, venues: [{ venue: "高知", venueCode: "74", races }] };
  const [group] = buildVenueGroups(liveResults.date, {}, {}, feed, {}, []);
  const copy = buildResultCopy(group, {}, feed);
  assert.equal(group.races.length, 12);
  assert.equal((copy.match(/^【\d+R】$/gmu) ?? []).length, 12);
  assert.match(copy, /【9R】[\s\S]*?4着: 車番 1[\s\S]*?4着: 車番 6/);
  assert.match(copy, /【9R】[\s\S]*?3連単: 5-3-7.*2660円/);
  console.log("Official 2026-11-07 Kochi 12/12 result-copy reproduction PASS");
}
console.log("Review result-copy fixtures: Kochi 9R and top-tie multiple payouts PASS");
