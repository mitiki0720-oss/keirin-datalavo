import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { build } from "esbuild";
import { fetchVenue, validateOfficialResultIdentity, createRaceResult, mergeWithExisting } from "./update-keirin-jp-results.mjs";
import { indexOfficialTodayResults, officialResultToTodayRace } from "./lib/official-today-source.mjs";
import { buildReviewOfficialResultsFeed } from "../src/lib/reviewOfficialResults.ts";
import { evaluateReviewRacePerformance } from "../src/lib/reviewPerformanceMetrics.ts";
import { slackDeliveryTestApi as slack } from "./notify-slack-hits.mjs";
import { officialFinishForStarter } from "./kurari-ex-official-finish.mjs";

const evidence = path.resolve(process.env.RESULT_REFUND_RAW_DIR || ".tmp/refund-wait-evidence");
const output = fs.mkdtempSync(path.resolve(".tmp/refund-publication-test-"));
const read = file => JSON.parse(fs.readFileSync(path.join(evidence, file), "utf8"));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const copy = value => structuredClone(value);
const date = "2026-11-21";
const records = read("raw-acquisition-report.json").records;
const original = read("results-diagnostic.json");
const rawList = read("JSJ048.json");
const ids = ["51R4", "51R5", "81R3"];
function context(id) {
  const [venueCode, no] = id.split("R");
  return { raceNumber: Number(no), date, venueCode, data: read(id + "-JSJ012.json"),
    entries: read(id + "-JSJ006.json"), detail: read(id + "-JSJ001.json") };
}
function normalize(c) {
  return createRaceResult(c.raceNumber, c.detail.C0201data.C0201race[c.raceNumber - 1], c.data, validateOfficialResultIdentity(c));
}
const normalized = Object.fromEntries(ids.map(id => [id, normalize(context(id))]));
const replay = copy(original);
for (const venue of replay.venues) for (const [i, race] of venue.races.entries()) {
  const id = venue.venueCode + "R" + race.raceNumber;
  if (normalized[id]) venue.races[i] = normalized[id];
}
const candidate = mergeWithExisting(null, replay).payload;
// Recompute the existing schema counters through the actual merge/summarize path.
const replayed = mergeWithExisting({ ...candidate, venueCount: 0, raceCount: 0, venues: [] }, candidate).payload;
fs.writeFileSync(path.join(output, "57-race-replay.json"), JSON.stringify(replayed, null, 2));

test("recorded manifest and 57-race snapshot SHA are immutable", () => {
  assert.equal(sha(fs.readFileSync(path.join(evidence, "raw-acquisition-report.json"))), "073c240aa64946c718c7b32a9f2f47c073929d96c0982c5b9376aa4b3c9348ea");
  assert.equal(sha(fs.readFileSync(path.join(evidence, "results-diagnostic.json"))), "8665e3546f0b294dca0f92520c6538bd1e16774129c351701d22dd3d37619caa");
  for (const record of records) assert.equal(sha(fs.readFileSync(path.join(evidence, record.file))), record.sha256, record.file);
});
for (const id of ids.slice(0, 2)) test(`${id}: official cancellation, no invented winner or amount`, () => {
  const race = normalized[id];
  assert.equal(race.resultStatus, "pending"); assert.equal(race.operationStatus, "cancelled");
  assert.equal(race.officialPublicationState.kind, "cancelled");
  assert.equal(race.officialPublicationState.note, "4,5レースは中止となりました。");
  assert.deepEqual(race.finishOrder, []); assert.equal(race.payout3tan, null); assert.equal(race.payout2tan, null);
  assert.equal(race.payouts.trifecta[0].payoutDisplay, "【全返還】");
  assert.equal(race.payouts.trifecta[0].payoutYen, null);
  assert.equal(race.payouts.bracketExacta[0].payoutDisplay, "【未発売】");
});
test("81R3: official unpublished finish flag overrides numeric payout", () => {
  const race = normalized["81R3"];
  assert.equal(race.resultStatus, "pending"); assert.equal(race.operationStatus, "pending");
  assert.equal(race.officialPublicationState.kind, "awaiting-finish"); assert.deepEqual(race.finishOrder, []);
  assert.equal(race.payout3tan.combination, "2-3-5"); assert.equal(race.payout3tan.payoutYen, 19220);
  assert.equal(officialResultToTodayRace(race, { entries: [] }), null);
});
test("57 races: 27 confirmed, 28 awaiting, 2 cancelled, zero errors", () => {
  assert.equal(original.raceCount, 57); assert.equal(original.confirmedRaceCount, 27);
  assert.equal(original.pendingRaceCount, 27); assert.equal(original.errorCount, 3);
  assert.equal(replayed.raceCount, 57); assert.equal(replayed.confirmedRaceCount, 27);
  assert.equal(replayed.pendingRaceCount, 30); assert.equal(replayed.cancelledRaceCount, 2);
  assert.equal(replayed.pendingRaceCount - replayed.cancelledRaceCount, 28); assert.equal(replayed.errorCount, 0);
  assert.equal(indexOfficialTodayResults(replayed, date).size, 57);
});
test("all 54 unaffected normalized races remain byte-for-byte equal as JSON values", () => {
  let count = 0;
  for (const venue of original.venues) for (const race of venue.races) {
    if (race.resultStatus === "error") continue;
    const next = replayed.venues.find(v => v.venueCode === venue.venueCode).races.find(r => r.raceNumber === race.raceNumber);
    assert.equal(JSON.stringify(next), JSON.stringify(race)); count += 1;
  }
  assert.equal(count, 54);
});
test("existing result validator accepts the replay without disabling --require-no-errors", () => {
  const run = spawnSync(process.execPath, ["scripts/check-keirin-jp-results.mjs", "--file=" + path.join(output, "57-race-replay.json"), "--expect-date=" + date, "--require-no-errors"], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stdout + run.stderr);
});

for (const [label, change] of [
  ["wrong date", c => { c.detail.C0201data.selKaisai = "20261120"; }],
  ["wrong venue", c => { c.detail.C0201data.selKjyoCd = "81"; }],
  ["wrong race", c => { c.detail.C0201data.selRaceNo = 6; }],
  ["wrong entry venue", c => { c.entries.bKeirinjyoCd = "81"; }],
  ["registration mismatch", c => { c.entries.sensyuTypeInfo[0].sensyuRegistNo = "999999"; }],
  ["duplicate car", c => { c.entries.sensyuTypeInfo[1].syaban = c.entries.sensyuTypeInfo[0].syaban; }],
  ["missing cancellation note", c => { c.detail.C0201data.hhMessage = ""; }],
  ["different cancelled race", c => { c.detail.C0201data.hhMessage = "6レースは中止となりました。"; }],
  ["missing cancellation flag", c => { c.detail.C0201data.flgSectionCancel = false; }],
  ["unknown display", c => { c.data.haraiGakuSubData.ST2HaraiGakuDispItemSubData[0].haraiGaku = "確認中"; }],
  ["refund with combination", c => { c.data.haraiGakuSubData.ST2HaraiGakuDispItemSubData[0].kumiBan = "1-2"; }],
  ["refund with visible combination", c => { c.data.haraiGakuSubData.ST2HaraiGakuDispItemSubData[0].kumiDispFlg = true; }],
  ["missing wager group", c => { delete c.data.haraiGakuSubData.ST2HaraiGakuDispItemSubData; }],
  ["empty wager group", c => { c.data.haraiGakuSubData.ST2HaraiGakuDispItemSubData = []; }],
  ["unknown wager group", c => { c.data.haraiGakuSubData.UNKNOWN = []; }],
  ["partial refund mixed in", c => { c.data.haraiGakuSubData.APartReturnDispFlg = true; }],
  ["numeric and refund mixed", c => { c.data.haraiGakuSubData.ST2HaraiGakuDispItemSubData = copy(context("81R3").data.haraiGakuSubData.ST2HaraiGakuDispItemSubData); }],
  ["all unoffered with no refund", c => { for (const rows of Object.values(c.data.haraiGakuSubData)) if (Array.isArray(rows)) rows[0].haraiGaku = "【未発売】"; }],
  ["published flag but empty finish", c => { c.data.tyakujyunDispFlg = true; }],
  ["invalid result code", c => { c.data.resultCd = 1; }],
]) test(`cancellation refuses ${label}`, () => {
  const c = context("51R4"); change(c); assert.throws(() => normalize(c), /OFFICIAL_/);
});
for (const [label, change] of [
  ["wrong date", c => { c.detail.C0201data.selKaisai = "20261120"; }],
  ["wrong entry identity", c => { c.entries.sensyuTypeInfo[0].sensyuRegistNo = "999999"; }],
  ["finish already received", c => { c.detail.C0201data.C0201race[2].rcvKekka = "1"; }],
  ["payout not received", c => { c.detail.C0201data.C0201race[2].rcvRefund = "0"; }],
  ["unknown payout", c => { c.data.haraiGakuSubData.RT3HaraiGakuDispItemSubData[0].haraiGaku = "未確認"; }],
  ["duplicate winning cars", c => { c.data.haraiGakuSubData.RT3HaraiGakuDispItemSubData[0].kumiBan = "2-2-5"; }],
  ["payout unpublished contradiction", c => { c.data.haraiGakuDispFlg = false; }],
]) test(`awaiting finish refuses ${label}`, () => {
  const c = context("81R3"); change(c); assert.throws(() => normalize(c), /OFFICIAL_/);
});

const confirmed = copy(original.venues.find(v => v.venueCode === "81").races.find(r => r.resultStatus === "confirmed"));
function snapshot(race, snapshotDate = date) {
  return { schemaVersion: 1, date: snapshotDate, source: { provider: "KEIRIN.JP" }, venueCount: 1, raceCount: 1,
    venues: [{ date: snapshotDate, venueCode: "81", venueName: "小倉競輪場", races: [race] }] };
}
test("awaiting finish can transition to a real recorded confirmed result without mutating it", () => {
  const waiting = { ...normalized["81R3"], raceNumber: confirmed.raceNumber };
  const next = mergeWithExisting(snapshot(waiting), snapshot(confirmed));
  assert.deepEqual(next.payload.venues[0].races[0], confirmed);
});
test("same-day confirmed data survives awaiting finish", () => {
  const waiting = { ...normalized["81R3"], raceNumber: confirmed.raceNumber };
  const next = mergeWithExisting(snapshot(confirmed), snapshot(waiting));
  assert.deepEqual(next.payload.venues[0].races[0], confirmed); assert.equal(next.preservedSettledRaceCount, 1);
});
test("conflicting confirmed payout is still rejected", () => {
  const changed = copy(confirmed); changed.payouts.trifecta[0].payoutYen += 100;
  assert.throws(() => mergeWithExisting(snapshot(confirmed), snapshot(changed)), /settled official result conflict/);
});
test("different day never imports yesterday's confirmed result", () => {
  const waiting = { ...normalized["81R3"], raceNumber: confirmed.raceNumber };
  assert.equal(mergeWithExisting(snapshot(confirmed, "2026-11-20"), snapshot(waiting)).payload.venues[0].races[0].resultStatus, "pending");
});
test("Review, Slack and EX do not settle unpublished numeric payouts or cancellations", () => {
  const feed = buildReviewOfficialResultsFeed(replayed, date);
  const selection = { predictionJson: { tickets: [{ index: "01", betType: "3連単", combination: "2-3-5", note: "本線" }], betPlan: { status: "structured", purchaseDecision: "BUY", purchaseTicketIndices: ["01"], shadowTicketIndices: [], unitStakeYen: 100, declaredPurchasePoints: 1, declaredInvestmentYen: 100 } } };
  for (const id of ids) {
    const [code, n] = id.split("R"); const race = feed.venues.find(v => v.venueCode === code).races.find(r => r.raceNo === Number(n));
    assert.equal(race.resultStatus, "pending"); assert.deepEqual(race.payouts, []); assert.equal(race.result.finishOrder, undefined);
    assert.equal(slack.resolveSettledResult(selection, { date, venueCode: code, venueName: "test", raceNo: Number(n), race }), null);
    const p = evaluateReviewRacePerformance({ settled: false }); assert.equal(p.actualPayout, undefined); assert.equal(p.actualRoi, undefined);
    assert.equal(officialFinishForStarter({ status: normalized[id].operationStatus, finishOrder: [] }, { carNo: 1, registrationNo: "000001", name: "test" }).observed, false);
  }
});

// Evaluate the existing today refund overlay verbatim, without changing or running the updater CLI.
const todayText = fs.readFileSync("scripts/update-today-races.mjs", "utf8");
const parsed = ts.createSourceFile("today.mjs", todayText, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const functions = new Set(["splitNoteParts", "joinUniqueNoteParts", "appendNote", "normalizeOfficialRefundVenueName", "extractOfficialAllRefundPayoutItems", "applyOfficialAllRefundResults"]);
const constants = new Set(["KEIRIN_LABEL_KEIRINJO", "KEIRIN_LABEL_KEIRIN", "ALL_REFUND_TEXT", "ALL_REFUND_NOTE"]);
const snippets = parsed.statements.filter(node => ts.isFunctionDeclaration(node) ? functions.has(node.name?.text)
  : ts.isVariableStatement(node) && node.declarationList.declarations.some(d => constants.has(d.name?.text))).map(n => n.getText(parsed));
const todayApi = vm.runInNewContext(snippets.join("\n") + "\n({extractOfficialAllRefundPayoutItems,applyOfficialAllRefundResults})");
test("existing today overlay handles only official refunds, without rank, numeric payout or hit", () => {
  const feed = { venues: [{ venue: "福井", races: [{ raceNo: 4, resultStatus: "pending", result: { status: "pending" } }, { raceNo: 5, resultStatus: "pending", result: { status: "pending" } }] }] };
  const map = new Map(ids.slice(0, 2).map(id => ["福井:" + id.split("R")[1], { payouts: todayApi.extractOfficialAllRefundPayoutItems(normalized[id]) }]));
  assert.equal(todayApi.applyOfficialAllRefundResults(feed, map).appliedCount, 2);
  for (const race of feed.venues[0].races) {
    assert.equal(race.resultStatus, "confirmed"); assert.equal(race.result.finishOrder.length, 0);
    assert.equal(race.result.payout3tan.payout, "全返還"); assert.match(race.resultNote, /中止/);
    assert.equal(slack.resolveSettledResult({}, { date, raceNo: race.raceNo, venueName: "福井", race }), null);
  }
});

globalThis.__refundReviewGlob = () => ({});
const reviewBundle = await build({
  stdin: { contents: fs.readFileSync("src/pages/ReviewPage.tsx", "utf8") + "\nexport { resolveReviewRacePerformance, attachReviewOfficialRefundEvidence };",
    resolveDir: path.resolve("src/pages"), sourcefile: "ReviewPage.tsx", loader: "tsx" },
  bundle: true, platform: "node", format: "esm", write: false,
  define: { "import.meta.env.BASE_URL": '"/keirin-datalavo/"', "import.meta.env.DEV": "false", "import.meta.glob": "__refundReviewGlob" },
});
const reviewApi = await import(`data:text/javascript;base64,${Buffer.from(reviewBundle.outputFiles[0].contents).toString("base64")}`);
test("real Review must not charge cancelled all-refund purchases as normal losses", () => {
  let feed = { date, venues: [{ venue: "福井", venueCode: "51", races: [{ raceNo: 4, resultStatus: "pending", result: { status: "pending" } }] }] };
  const refunds = new Map([["福井:4", { payouts: todayApi.extractOfficialAllRefundPayoutItems(normalized["51R4"]) }]]);
  todayApi.applyOfficialAllRefundResults(feed, refunds);
  feed = reviewApi.attachReviewOfficialRefundEvidence(feed, replayed);
  const slot = { predictionText: "", predictionJson: { tickets: [{ index: "01", betType: "3連単", combination: "1-2-3", note: "本線" }],
    betPlan: { status: "structured", purchaseDecision: "BUY", purchaseTicketIndices: ["01"], shadowTicketIndices: [], unitStakeYen: 100, declaredPurchasePoints: 1, declaredInvestmentYen: 100 } } };
  const performance = reviewApi.resolveReviewRacePerformance(slot, undefined, feed.venues[0].races[0]);
  fs.writeFileSync(path.join(output, "review-refund-contract.json"), JSON.stringify({ actual: performance,
    required: "No normal loss/ROI; refund amount must not be invented", source: "unchanged ReviewPage.tsx + actual today refund overlay" }, null, 2));
  assert.notEqual(performance.status, "miss", "cancelled purchase is invalid, not a normal losing ticket");
  assert.equal(performance.actualRoi, undefined, "unverified refund amount cannot produce an ordinary ROI");
});

function service(id, mutation) {
  const c = context(id); if (mutation) mutation(c);
  const v = copy(rawList.RaceList.find(v => v.naibuKeirinCd === c.venueCode));
  const index = read(c.venueCode + "-index-JSJ001.json");
  index.C0201data.C0201race = [{ ...index.C0201data.C0201race[c.raceNumber - 1], raceNo: String(c.raceNumber) }];
  return { c, v, index, fetch: async url => {
    const type = url.searchParams.get("type");
    if (type === "JSJ001") return copy(url.searchParams.get("encp") === v.touhyouLivePara ? index : c.detail);
    if (type === "JSJ012") return copy(c.data); if (type === "JSJ006") return copy(c.entries);
    throw new Error("unexpected fixture API");
  } };
}
for (const id of ids) test(`${id}: actual fetchVenue path validates the extra APIs offline`, async () => {
  const s = service(id), calls = [];
  const v = await fetchVenue(s.v, { targetDate: date, sleepImpl: async () => {}, fetchImpl: async url => { calls.push(url.searchParams.get("type")); return s.fetch(url); } });
  assert.deepEqual(v.races[0], normalized[id]); assert.deepEqual(calls, ["JSJ001", "JSJ012", "JSJ006", "JSJ001"]);
});
for (const [name, error] of [["HTTP 403", new Error("KEIRIN.JP request failed: 403 Forbidden")], ["timeout", new DOMException("timeout", "TimeoutError")], ["parse", new SyntaxError("invalid JSON")], ["network", new TypeError("fetch failed")]]) {
  test(`fetch failure remains an error with race/API diagnostic: ${name}`, async () => {
    const s = service("81R3"), messages = [], old = console.error;
    console.error = message => messages.push(JSON.parse(message));
    try {
      const v = await fetchVenue(s.v, { targetDate: date, sleepImpl: async () => {}, fetchImpl: url => { if (url.searchParams.get("type") === "JSJ012") throw error; return s.fetch(url); } });
      assert.equal(v.races[0].resultStatus, "error"); assert.equal(messages[0].raceId, "2026-11-21:81:3");
      assert.equal(messages[0].apiType, "JSJ012"); assert.notEqual(messages[0].category, "UNKNOWN_ERROR");
      assert.throws(() => indexOfficialTodayResults(snapshot(v.races[0]), date), /fetch errors/);
    } finally { console.error = old; }
  });
}

const preload = path.join(output, "offline-fetch.mjs");
fs.writeFileSync(preload, `import fs from 'node:fs';const config=JSON.parse(fs.readFileSync(process.env.REFUND_TEST_CONFIG,'utf8'));globalThis.fetch=async input=>{const u=new URL(input);const key=u.searchParams.get('type')+':'+(u.searchParams.get('encp')||'list');const value=config.responses[key];if(!value)throw new Error('unmapped offline request '+key);return new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});};`);
function cli(errorCase) {
  const s = service("81R3", errorCase ? c => { c.detail.C0201data.selRaceNo = 4; } : undefined);
  const responses = { "JSJ048:list": { resultCd: 0, RaceList: [s.v] }, ["JSJ001:" + s.v.touhyouLivePara]: s.index,
    ["JSJ012:" + s.index.C0201data.C0201race[0].encParaR]: s.c.data,
    ["JSJ006:" + s.index.C0201data.C0201race[0].encParaR]: s.c.entries,
    ["JSJ001:" + s.index.C0201data.C0201race[0].encParaR]: s.c.detail };
  const config = path.join(output, errorCase ? "bad-config.json" : "good-config.json"); fs.writeFileSync(config, JSON.stringify({ responses }));
  const file = path.join(output, errorCase ? "protected-output.json" : "good-output.json");
  if (errorCase) fs.writeFileSync(file, "existing value must survive");
  const run = spawnSync(process.execPath, ["--import=" + pathToFileURL(preload).href, "scripts/update-keirin-jp-results.mjs", "--expect-date=" + date, "--output=" + file],
    { encoding: "utf8", env: { ...process.env, GITHUB_ACTIONS: "true", REFUND_TEST_CONFIG: config } });
  return { ...run, file };
}
test("production error gate still refuses write and logs stage counts", () => {
  const r = cli(true); assert.notEqual(r.status, 0); assert.match(r.stderr, /public output was not written/);
  assert.equal(fs.readFileSync(r.file, "utf8"), "existing value must survive");
  assert.match(r.stderr, /IDENTITY_MISMATCH/); assert.match(r.stderr, /official-result-summary/); assert.match(r.stderr, /"errors":1/);
});
test("production gate accepts verified awaiting publication, not a fake confirmed result", () => {
  const r = cli(false); assert.equal(r.status, 0, r.stderr); const data = JSON.parse(fs.readFileSync(r.file));
  assert.equal(data.pendingRaceCount, 1); assert.equal(data.confirmedRaceCount, 0); assert.equal(data.errorCount, 0);
  assert.match(r.stdout, /"pending":1/); assert.match(r.stdout, /"cancelled":0/);
});
console.log("Refund/publication evidence: " + output);
