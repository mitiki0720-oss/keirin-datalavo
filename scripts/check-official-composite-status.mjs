import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { build } from "esbuild";
import { createRaceResult } from "./update-keirin-jp-results.mjs";
import { isOfficialNonFinisherStatus, officialResultToTodayRace, assertCurrentDayWriteDate } from "./lib/official-today-source.mjs";
import { buildReviewOfficialResultsFeed } from "../src/lib/reviewOfficialResults.ts";
import { todayUpdateTestApi } from "./update-today-races.mjs";

const entries = { entries: Array.from({ length: 7 }, (_, i) => ({ carNo: String(i + 1), registrationNo: `00000${i + 1}`, name: `選手${i + 1}` })) };
const rawFixture = (status) => ({
  tyakujyunItemSubData: entries.entries.map((entry, i) => ({
    tyaku: i === 6 && status !== undefined ? "" : String(i + 1), syaban: entry.carNo,
    sensyuName: entry.name, sensyuRegistNo: entry.registrationNo,
    kojinStateItemSubData: i === 6 && status ? status.split(" / ").map(kojinState => ({ kojinState })) : [],
  })),
  haraiGakuSubData: { ST2HaraiGakuDispItemSubData: [{ kumiBan: "1-2", haraiGaku: "300" }], RT3HaraiGakuDispItemSubData: [{ kumiBan: "1-2-3", haraiGaku: "1000" }] },
});
for (const status of ["失格", "失格 / 落再入", "落再入 / 失格", "失格（外帯線内進入） / 落再入", "失 / 落再入", "落車棄権", "落車", "棄権", "欠場", "欠車", "失", "落", "棄", "欠", "失格 / 落車棄権"]) {
  test(`known terminal status: ${status}`, () => {
    assert.equal(isOfficialNonFinisherStatus(status), true);
    const result = createRaceResult(1, { flgRaceEnd: true }, rawFixture(status));
    assert.equal(result.resultStatus, "confirmed");
    const today = officialResultToTodayRace(result, entries);
    assert.equal(today.resultStatus, "confirmed");
    assert.equal(today.result.finishOrder[6].rank, "");
    assert.equal(today.result.finishOrder[6].status, status);
  });
}
for (const status of ["落再入", "", "調査中", "失格 / 調査中", "失格 / 未知", "失格 / 落再入 / 未知", "落車 / 落再入", "失格らしい / 落再入"]) {
  test(`unresolved status remains partial: ${status || "empty"}`, () => {
    assert.equal(isOfficialNonFinisherStatus(status), false);
    const result = createRaceResult(1, {}, rawFixture(status));
    assert.equal(result.resultStatus, "partial");
    assert.equal(officialResultToTodayRace(result, entries), null);
    assert.equal(officialResultToTodayRace({ ...result, resultStatus: "confirmed" }, entries), null);
  });
}
test("normal ranks and ranked re-entry remain valid", () => {
  const raw = rawFixture();
  raw.tyakujyunItemSubData[6].kojinStateItemSubData = [{ kojinState: "落再入" }];
  const result = createRaceResult(1, {}, raw);
  assert.equal(result.resultStatus, "confirmed");
  const today = officialResultToTodayRace(result, entries);
  assert.deepEqual(today.result.finishOrder.map(r => r.rank), ["1", "2", "3", "4", "5", "6", "7"]);
});
test("disqualified rider cannot receive an invented rank", () => {
  const result = createRaceResult(1, {}, rawFixture("失格 / 落再入"));
  result.finishOrder[6].rank = "7";
  assert.equal(officialResultToTodayRace(result, entries), null);
});
test("missing payout remains partial", () => {
  const raw = rawFixture("失格 / 落再入"); raw.haraiGakuSubData = {};
  assert.equal(createRaceResult(1, {}, raw).resultStatus, "partial");
});
test("all refund is not fabricated as a normal result", () => {
  const raw = rawFixture("失格 / 落再入");
  raw.haraiGakuSubData.RT3HaraiGakuDispItemSubData = [{ kumiBan: "全返還", haraiGaku: "全返還" }];
  assert.equal(createRaceResult(1, {}, raw).resultStatus, "partial");
});
for (const field of ["carNo", "registrationNo", "name"]) test(`identity safety: ${field}`, () => {
  const result = createRaceResult(1, {}, rawFixture("失格 / 落再入"));
  result.finishOrder[6][field] = field === "carNo" ? "1" : "invalid";
  assert.throws(() => officialResultToTodayRace(result, entries), /identity conflict/);
});
test("payout contradicting official top three is rejected", () => {
  const result = createRaceResult(1, {}, rawFixture("失格 / 落再入"));
  result.payouts.trifecta[0].combination = "2-1-3";
  assert.equal(officialResultToTodayRace(result, entries), null);
});
test("midnight current-day overwrite remains prohibited", () => {
  assert.doesNotThrow(() => assertCurrentDayWriteDate("2026-11-19", "2026-11-19", "result"));
  assert.throws(() => assertCurrentDayWriteDate("2026-11-19", "2026-11-20", "result"), /date boundary/);
});

// Optional real evidence is supplied explicitly; default fixtures are synthetic, not official originals.
const officialDir = process.argv.find(a => a.startsWith("--official-dir="))?.slice("--official-dir=".length);
if (officialDir) {
  const read = name => JSON.parse(fs.readFileSync(path.join(officialDir, name), "utf8"));
  const manifest = read("manifest.json");
  const officialEntries = JSON.parse(fs.readFileSync("public/data/races/keirin-jp-entries.generated.json", "utf8"));
  const index = read("JSJ001-kokura.json").C0201data;
  test("official raw hashes, URLs and dates match", () => {
    assert.equal(manifest.status, "ACQUIRED"); assert.equal(manifest.targetDate, "2026-11-19"); assert.equal(manifest.records.length, 8);
    for (const record of manifest.records) {
      const url = new URL(record.url);
      assert.equal(url.origin, "https://keirin.jp"); assert.equal(url.pathname, "/pc/json");
      assert.equal(record.httpStatus, 200);
      assert.equal(createHash("sha256").update(fs.readFileSync(path.join(officialDir, record.file))).digest("hex"), record.sha256);
    }
    assert.equal(index.selKaisai, "20261119"); assert.equal(index.selKjyoCd, "81");
    assert.equal(officialEntries.date, "2026-11-19"); assert.equal(officialEntries.source.provider, "KEIRIN.JP");
  });
  const results = [], todayRaces = [];
  for (const raceNo of [5, 11]) {
    const raw = read(`JSJ012-81R${raceNo}.json`), entry = read(`JSJ006-81R${raceNo}.json`), detail = read(`JSJ001-81R${raceNo}.json`).C0201data;
    const storedEntry = officialEntries.venues.find(v => v.venueCode === "81").races.find(r => r.raceNumber === raceNo);
    const result = createRaceResult(raceNo, index.C0201race[raceNo - 1], raw);
    const fetchedAt = manifest.records.find(r => r.file === `JSJ012-81R${raceNo}.json`).fetchedAt;
    const today = officialResultToTodayRace(result, storedEntry, fetchedAt);
    results.push(result); todayRaces.push({ raceNo, ...today, riders: storedEntry.entries });
    test(`official ${raceNo}R: all car / registration / name / rank identities`, () => {
      assert.equal(detail.selKaisai, "20261119"); assert.equal(detail.selKjyoCd, "81"); assert.equal(detail.selRaceNo, raceNo);
      assert.equal(entry.bKeirinjyoCd, "81"); assert.equal(raw.resultCd, 0); assert.equal(raw.tyakujyunDispFlg, true); assert.equal(raw.haraiGakuDispFlg, true);
      assert.equal(entry.sensyuTypeInfo.length, 7); assert.equal(result.finishOrder.length, 7);
      for (const row of result.finishOrder) {
        const e = storedEntry.entries.find(e => e.carNo === row.carNo);
        const rawEntry = entry.sensyuTypeInfo.find(e => String(e.syaban) === row.carNo);
        const rawResult = raw.tyakujyunItemSubData.find(e => e.syaban === row.carNo);
        assert.ok(rawEntry);
        assert.equal(row.registrationNo, e.registrationNo);
        assert.equal(row.registrationNo, detail.C0201racedtl.C0201sensyu.find(e => String(e.carNum) === row.carNo).numPlayer);
        assert.equal(row.registrationNo, String(rawEntry.sensyuRegistNo));
        assert.equal(row.name.replace(/\s/gu, ""), rawEntry.sensyuName.replace(/\s/gu, ""));
        assert.equal(row.name.replace(/\s/gu, ""), e.name.replace(/\s/gu, ""));
        assert.equal(row.rank, rawResult.tyaku);
      }
    });
    test(`official ${raceNo}R: confirmed today feed and all payouts retained`, () => {
      assert.equal(result.resultStatus, "confirmed"); assert.deepEqual(result.quality.warnings, []);
      assert.equal(today.resultStatus, "confirmed"); assert.equal(today.result.reviewSettlementEligible, true);
      const expected = raceNo === 11 ? ["2-5", 2740, "2-5-1", 7130] : ["7-2", 18250, "7-2-1", 59820];
      assert.deepEqual([result.payout2tan.combination, result.payout2tan.payoutYen, result.payout3tan.combination, result.payout3tan.payoutYen], expected);
      assert.deepEqual(today.resultTop3.map(r => r.carNo), expected[2].split("-"));
      assert.equal(today.result.payout2tan.combination, expected[0]); assert.match(today.result.payout2tan.payout, new RegExp(`^${expected[1]}円`));
      assert.equal(today.result.payout3tan.combination, expected[2]); assert.match(today.result.payout3tan.payout, new RegExp(`^${expected[3]}円`));
      assert.deepEqual(today.result.finishOrder.map(r => [r.rank, r.carNo, r.registrationNo, r.status]), result.finishOrder.map(r => [r.rank, r.carNo, r.registrationNo, r.status]));
    });
  }
  test("official 11R disqualification / re-entry and reason are not lost", () => {
    const row = results[1].finishOrder.find(r => r.carNo === "7");
    assert.equal(row.registrationNo, "015859"); assert.equal(row.rank, ""); assert.equal(row.status, "失格（外帯線内進入） / 落再入");
  });
  test("actual today update attachment changes only Kokura 11R", () => {
    const original = JSON.parse(fs.readFileSync("public/data/races/today.generated.json", "utf8"));
    const candidate = structuredClone(original);
    assert.equal(candidate.date, "2026-11-19");
    const venue = candidate.venues.find(v => v.venueCode === "81");
    const i = venue.races.findIndex(r => r.raceNo === 11);
    const stored = officialEntries.venues.find(v => v.venueCode === "81").races.find(r => r.raceNumber === 11);
    venue.races[i] = todayUpdateTestApi.applyOfficialResultToRace(venue.races[i], results[1], stored, "小倉", manifest.records.find(r => r.file === "JSJ012-81R11.json").fetchedAt);
    assert.equal(venue.races[i].resultStatus, "confirmed");
    assert.deepEqual(venue.races[i].resultTop3.map(r => r.carNo), ["2", "5", "1"]);
    assert.match(venue.races[i].result.payout3tan.payout, /^7130円/);
    for (const [vi, v] of candidate.venues.entries()) for (const [ri, r] of v.races.entries()) {
      if (v.venueCode === "81" && r.raceNo === 11) continue;
      assert.deepEqual(r, original.venues[vi].races[ri]);
    }
  });
  test("real Review transformation and result-copy include both official races", async () => {
    const snapshot = { date: "2026-11-19", source: { provider: "KEIRIN.JP", fetchCompletedAt: manifest.records.at(-1).fetchedAt }, venues: [{ date: "2026-11-19", venueCode: "81", venueName: "小倉競輪場", races: results }] };
    const feed = buildReviewOfficialResultsFeed(snapshot, snapshot.date);
    assert.equal(feed.venues[0].races.filter(r => r.resultStatus === "confirmed").length, 2);
    globalThis.__reviewTestGlob = () => ({});
    const source = fs.readFileSync("src/pages/ReviewPage.tsx", "utf8") + "\nexport { buildVenueGroups, buildResultCopy };";
    const bundle = await build({ stdin: { contents: source, resolveDir: path.resolve("src/pages"), loader: "tsx" }, bundle: true, platform: "node", format: "esm", write: false,
      define: { "import.meta.env.BASE_URL": '"/keirin-datalavo/"', "import.meta.env.DEV": "false", "import.meta.glob": "__reviewTestGlob" } });
    const { buildVenueGroups, buildResultCopy } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);
    const todayFeed = { date: snapshot.date, venues: [{ venue: "小倉", venueCode: "81", races: todayRaces }] };
    const [group] = buildVenueGroups(snapshot.date, {}, {}, todayFeed, {}, []);
    const copy = buildResultCopy(group, {}, todayFeed);
    assert.match(copy, /対象R: 5R, 11R/); assert.equal((copy.match(/^【\d+R】$/gmu) ?? []).length, 2);
    assert.match(copy, /3連単: 2-5-1.*7130円/); assert.match(copy, /2車単: 2-5.*2740円/);
    assert.match(copy, /失格（外帯線内進入） \/ 落再入: 車番 7.*015859/);
  });
}
