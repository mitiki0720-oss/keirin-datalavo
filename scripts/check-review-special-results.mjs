import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import { createRaceResult, mergeWithExisting } from "./update-keirin-jp-results.mjs";
import { normalizeOfficialFinishStatus, officialResultToTodayRace } from "./lib/official-today-source.mjs";

const rawRace = (cars, ranks, states, combination) => ({
  tyakujyunItemSubData: cars.map((car, index) => ({
    tyaku: ranks[index], syaban: String(car), sensyuName: `選手${car}`,
    sensyuRegistNo: `00000${car}`, kojinStateItemSubData: states[car] ?? [],
  })),
  haraiGakuSubData: { RT3HaraiGakuDispItemSubData: [{ kumiBan: combination, haraiGaku: "1000" }] },
});
const raw2 = rawRace([4, 2, 6, 1, 3, 5, 7], ["1", "2", "3", "4", "5", "6", ""], {
  5: [{ kojinState: "落再入" }],
  7: [{ kojinState: "失格", tyakuNote: "過失走行" }, { kojinState: "落車棄権" }],
}, "4-2-6");
const raw5 = rawRace([7, 3, 2, 5, 4, 1, 6], ["1", "2", "3", "4", "5", "", ""], {
  1: [{ kojinState: "落車棄権" }], 6: [{ kojinState: "落車棄権" }],
}, "7-3-2");
const entries = { entries: Array.from({ length: 7 }, (_, i) => ({ carNo: String(i + 1), name: `選手${i + 1}`, registrationNo: `00000${i + 1}` })) };
const second = createRaceResult(2, { flgRaceEnd: true }, raw2);
const fifth = createRaceResult(5, { flgRaceEnd: true }, raw5);
assert.equal(second.finishOrder[6].rank, "");
assert.equal(second.finishOrder[6].status, "失格（過失走行） / 落車棄権");
assert.equal(second.finishOrder[5].rank, "6");
assert.equal(second.finishOrder[5].status, "落再入");
assert.equal(fifth.finishOrder.filter((row) => row.status === "落車棄権").length, 2);
for (const result of [second, fifth]) {
  const converted = officialResultToTodayRace(result, entries);
  assert.equal(converted.resultStatus, "confirmed");
  assert.equal(converted.result.reviewSettlementEligible, true);
  assert.deepEqual(converted.result.finishOrder.map((row) => row.status), result.finishOrder.map((row) => row.status));
}
assert.equal(normalizeOfficialFinishStatus({ tyaku: "", kojinState: "失格", tyakuNote: "過失走行" }), "失格（過失走行）");
const unresolvedRaw = structuredClone(raw5);
unresolvedRaw.tyakujyunItemSubData[6].kojinStateItemSubData = [];
assert.equal(createRaceResult(5, {}, unresolvedRaw).resultStatus, "partial");
const unknown = structuredClone(fifth);
unknown.finishOrder[6].status = "調査中";
assert.equal(officialResultToTodayRace(unknown, entries), null);
const contradiction = structuredClone(second);
contradiction.finishOrder[6].rank = "7";
assert.equal(officialResultToTodayRace(contradiction, entries), null);
const badIdentity = structuredClone(fifth);
badIdentity.finishOrder[6].registrationNo = "999999";
assert.throws(() => officialResultToTodayRace(badIdentity, entries), /identity conflict/);
const duplicate = structuredClone(fifth);
duplicate.finishOrder[6].carNo = "1";
assert.throws(() => officialResultToTodayRace(duplicate, entries), /identity conflict/);
const snapshot = (race) => ({ date: "2026-11-08", venueCount: 1, raceCount: 1,
  venues: [{ date: "2026-11-08", venueCode: "12", races: [race] }] });
const old = structuredClone(second);
old.finishOrder.forEach((row) => { row.status = ""; });
assert.equal(mergeWithExisting(snapshot(old), snapshot(second)).payload.venues[0].races[0].finishOrder[6].status, second.finishOrder[6].status);
for (const change of [
  (race) => { race.finishOrder[0].rank = "2"; },
  (race) => { race.payouts.trifecta[0].payoutYen = 2000; },
  (race) => { race.finishOrder[6].status = "棄権"; },
]) {
  const changed = structuredClone(second); change(changed);
  assert.throws(() => mergeWithExisting(snapshot(second), snapshot(changed)), /settled official result conflict/);
}

globalThis.__reviewTestGlob = () => ({});
const reviewSource = readFileSync("src/pages/ReviewPage.tsx", "utf8") + "\nexport { buildVenueGroups, buildResultCopy };";
const bundled = await build({ stdin: { contents: reviewSource, resolveDir: path.resolve("src/pages"), loader: "tsx" },
  bundle: true, platform: "node", format: "esm", write: false,
  define: { "import.meta.env.BASE_URL": '"/keirin-datalavo/"', "import.meta.env.DEV": "false", "import.meta.glob": "__reviewTestGlob" } });
const { buildVenueGroups, buildResultCopy } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].contents).toString("base64")}`);
const races = Array.from({ length: 7 }, (_, index) => ({ raceNo: index + 1,
  ...officialResultToTodayRace(index === 4 ? fifth : second, entries), riders: entries.entries }));
const feed = { date: "2026-11-08", venues: [{ venue: "青森", venueCode: "12", races }] };
const [group] = buildVenueGroups(feed.date, {}, {}, feed, {}, []);
const copy = buildResultCopy(group, {}, feed);
assert.equal(group.races.length, 7);
assert.equal((copy.match(/^【\d+R】$/gmu) ?? []).length, 7);
assert.match(copy, /状態 失格（過失走行） \/ 落車棄権/);
assert.match(copy, /6着: 車番 5.*状態 落再入/);
assert.match(copy, /【5R】[\s\S]*?落車棄権: 車番 1[\s\S]*?落車棄権: 車番 6/);
const actual = JSON.parse(readFileSync("public/data/races/today.generated.json", "utf8"));
if (actual.date === "2026-11-08") {
  const venue = actual.venues.find((item) => item.venueCode === "12");
  assert.ok(venue);
  const [actualGroup] = buildVenueGroups(actual.date, {}, {}, { ...actual, venues: [venue] }, {}, []);
  const actualCopy = buildResultCopy(actualGroup, {}, actual);
  assert.equal((actualCopy.match(/^【\d+R】$/gmu) ?? []).length, 7);
  assert.match(actualCopy, /失格（過失走行） \/ 落車棄権: 車番 7.*015947/);
  assert.match(actualCopy, /【5R】[\s\S]*?落車棄権: 車番 1.*015644[\s\S]*?落車棄権: 車番 6.*012719/);
  assert.match(actualCopy, /3連単: 4-2-6.*535510/);
  assert.match(actualCopy, /3連単: 7-3-2.*13000/);
  console.log("Official Aomori 2026-11-08 result-copy 7/7 PASS");
}
console.log("Special-result normalization, identity, pending, merge protection and Review copy fixtures PASS");
