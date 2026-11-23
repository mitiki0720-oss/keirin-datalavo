import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { loadOfficialConflictProof, createOfficialConflictProof, mergeOfficialResultsWithConflictIsolation, verifyStoredOfficialConflict, persistOfficialConflictEvidence, verifyConflictRegistryImport } from "./plan-official-result-conflict-isolation.mjs";
import { summarize, raceResultSignature, mergeWithExisting } from "./update-keirin-jp-results.mjs";
import { officialResultToTodayRace, indexOfficialTodayResults } from "./lib/official-today-source.mjs";
import { todayUpdateTestApi } from "./update-today-races.mjs";
import { buildReviewOfficialResultsFeed } from "../src/lib/reviewOfficialResults.ts";
import { isOfficialResultOnHold, attachOfficialConflictHolds, withOfficialResultHold } from "../src/lib/officialResultConflict.mjs";
import { slackDeliveryTestApi as slack } from "./notify-slack-hits.mjs";
import { normalizeCurrentResultRace, overlayOfficialPerformanceHolds, evaluatePredictionPerformance } from "./kurari-ex/evaluate-kurari-ex-prediction-performance.mjs";
import { checkPredictionPerformance } from "./check-kurari-ex-prediction-performance.mjs";
import { verifyOfficialDailySource } from "./kurari-ex-official-daily-guard.mjs";
import { verifyReviewOfficialArchive } from "./archive-keirin-review-official-results.mjs";

const clone = structuredClone, sha = value => createHash("sha256").update(value).digest("hex");
const read = file => JSON.parse(fs.readFileSync(file, "utf8"));
const root = path.resolve(".tmp/continuation");
const output = fs.mkdtempSync(path.join(root, "test-"));
const stored = read(".tmp/odawara/stored-snapshot.json");
const proof = await loadOfficialConflictProof(path.resolve(".tmp/odawara/acquisition.json"));
const { date, venueCode, raceNumber } = proof.target;
const raceId = `${date}:${venueCode}:${raceNumber}`;
const venueOf = snapshot => snapshot.venues.find(venue => venue.venueCode === venueCode);
const targetOf = snapshot => venueOf(snapshot).races.find(race => race.raceNumber === raceNumber);
const incoming = clone(stored); Object.assign(targetOf(incoming), clone(proof.result));
const integrated = mergeOfficialResultsWithConflictIsolation(stored, incoming, [proof]);
const held = targetOf(integrated.payload), marker = held.officialResultConflict;
const previous = targetOf(stored);
const entries = { entries: proof.raw.JSJ006.sensyuTypeInfo.map(row => ({ carNo: String(row.syaban), name: row.sensyuName, registrationNo: row.sensyuRegistNo, source: "KEIRIN.JP:JSJ006" })) };
const projection = officialResultToTodayRace(held, entries);
const normalProjection = officialResultToTodayRace(previous, entries);
const slot = { date, venue: "小田原", raceNumber, raceNo: raceNumber, raceKey: "fixture:odawara:4", raceId: "fixture",
  predictionText: "", predictionJson: { tickets: [{ index: "01", betType: "3連単", combination: "7-2-6", note: "本線" }],
    betPlan: { status: "structured", purchaseDecision: "BUY", purchaseTicketIndices: ["01"], shadowTicketIndices: [], unitStakeYen: 100, declaredPurchasePoints: 1, declaredInvestmentYen: 100 } } };
const oldRecord = { ...slot, resultOrder: "7-2-6", hitStatus: "hit", autoHitStatus: "hit", investment: 100, investmentSource: "manual", payout: 22540, profitLoss: 22440, roi: 22540 };
globalThis.__conflictGlob = () => ({});
const bundle = await build({ stdin: { contents: fs.readFileSync("src/pages/ReviewPage.tsx", "utf8")
  + "\nexport { resolveReviewRacePerformance, isResultReviewReady, mergeReviewRaceWithSnapshot, buildVenueGroups, buildResultCopy, getReviewResultStatusLabel }; export { resolvePredictionRaceGeneratedResult } from './PageImplementations';",
  resolveDir: path.resolve("src/pages"), sourcefile: "ReviewPage.tsx", loader: "tsx" },
  bundle: true, platform: "node", format: "esm", write: false,
  define: { "import.meta.env.BASE_URL": '"/keirin-datalavo/"', "import.meta.env.DEV": "false", "import.meta.glob": "__conflictGlob" } });
const review = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);
const previousSourceRoot = read(".tmp/continuation/before.json").source;
const baselineBundle = await build({ stdin: { contents: fs.readFileSync(path.join(previousSourceRoot, "src/pages/ReviewPage.tsx"), "utf8")
  + "\nexport { resolveReviewRacePerformance };", resolveDir: path.resolve("src/pages"), sourcefile: "ReviewPage.tsx", loader: "tsx" },
  bundle: true, platform: "node", format: "esm", write: false,
  define: { "import.meta.env.BASE_URL": '"/keirin-datalavo/"', "import.meta.env.DEV": "false", "import.meta.glob": "__conflictGlob" } });
const baselineReview = await import(`data:text/javascript;base64,${Buffer.from(baselineBundle.outputFiles[0].contents).toString("base64")}`);
const trendBundle = await build({ entryPoints: ["src/lib/kurariExResultTrendLab.ts"], bundle: true,
  platform: "node", format: "esm", write: false, define: { "import.meta.env.BASE_URL": '"/keirin-datalavo/"' } });
const trend = await import(`data:text/javascript;base64,${Buffer.from(trendBundle.outputFiles[0].contents).toString("base64")}`);
const approval = { raceId, conflictId: marker.conflictId, evidenceSha256: marker.evidenceSha256,
  action: "accept-candidate", approvedBy: "artificial fixture approval; not production authorization", approvedAt: new Date().toISOString() };
function alteredProof(mutate) {
  const raw = clone(proof.raw); mutate(raw);
  const records = proof.records.map(record => {
    const bytes = Buffer.from(JSON.stringify(raw[record.type]));
    return { ...record, bodyBase64: bytes.toString("base64"), sha256: sha(bytes) };
  });
  return createOfficialConflictProof(proof.target, raw, records);
}
function withProof(value) { const candidate = clone(incoming); Object.assign(targetOf(candidate), clone(value.result)); return candidate; }

test("known conflict: old signature retained, never auto-overwritten", () => assert.equal(raceResultSignature(held), raceResultSignature(previous)));
test("known conflict: new official status stored separately", () => assert.equal(marker.candidate.finishOrder.find(row => row.carNo === "1").status, "失格（外帯線内進入） / 落車棄権"));
test("all changed fields and race identity logged", () => { assert.equal(integrated.conflicts[0].raceId, raceId); assert.deepEqual(marker.changedFields, ["finishOrder"]); });
test("raw HTTP response bytes and SHA retained privately", () => { for (const row of integrated.evidenceBundles[0].bundle.records) { assert.equal(sha(Buffer.from(row.bodyBase64, "base64")), row.sha256); assert.match(row.url, /^https:\/\/keirin.jp\/pc\/json/u); assert.ok(Date.parse(row.fetchedAt)); } });
test("stored conflict verifies from private raw response bytes", () => assert.equal(verifyStoredOfficialConflict(held, raceId, integrated.evidenceBundles[0].bundle).conflictId, marker.conflictId));
test("public snapshot contains no internal API parameters or hidden raw bodies", () => { const text = JSON.stringify(integrated.payload); assert.doesNotMatch(text, /encp=|encPara|touhyouLivePara|bodyBase64/u); });
test("strict legacy merge remains strict", () => assert.throws(() => mergeWithExisting(stored, incoming), /settled official result conflict/u));
test("identical repeat is idempotent", () => assert.deepEqual(mergeOfficialResultsWithConflictIsolation(integrated.payload, incoming, [proof]).payload, integrated.payload));
test("incoming reversion cannot silently clear hold", () => assert.equal(isOfficialResultOnHold(targetOf(mergeOfficialResultsWithConflictIsolation(integrated.payload, stored).payload)), true));
test("incoming pending cannot clear hold", () => { const next = clone(incoming); targetOf(next).resultStatus = "pending"; assert.equal(isOfficialResultOnHold(targetOf(mergeOfficialResultsWithConflictIsolation(integrated.payload, next).payload)), true); });
test("other confirmed facts unchanged", () => { for (const venue of stored.venues) for (const race of venue.races) if (`${date}:${venue.venueCode}:${race.raceNumber}` !== raceId) assert.deepEqual(integrated.payload.venues.find(row => row.venueCode === venue.venueCode).races.find(row => row.raceNumber === race.raceNumber), race); });
test("synthetic earlier pending other race can progress normally", () => { const before = clone(stored), race = venueOf(before).races.find(row => row.raceNumber !== raceNumber && row.resultStatus === "confirmed"); Object.assign(race, { resultStatus: "pending", finishOrder: [], payouts: {} }); const result = mergeOfficialResultsWithConflictIsolation(before, incoming, [proof]); assert.equal(venueOf(result.payload).races.find(row => row.raceNumber === race.raceNumber).resultStatus, "confirmed"); assert.equal(result.conflicts.length, 1); });
test("conflict not counted as fresh confirmed", () => assert.equal(integrated.payload.verifiedConfirmedRaceCount, integrated.payload.confirmedRaceCount - 1));
test("same-race synthetic payout correction is quarantined", () => { const value = alteredProof(raw => { raw.JSJ012.haraiGakuSubData.RT3HaraiGakuDispItemSubData[0].haraiGaku = "22,550"; }); const result = mergeOfficialResultsWithConflictIsolation(stored, withProof(value), [value]); assert.equal(raceResultSignature(targetOf(result.payload)), raceResultSignature(previous)); assert.ok(result.conflicts[0].changedFields.includes("payouts")); });
test("synthetic placing correction with consistent payout is quarantined", () => {
  const value = alteredProof(raw => {
    for (const row of raw.JSJ012.tyakujyunItemSubData) if (row.tyaku === "1") row.tyaku = "2"; else if (row.tyaku === "2") row.tyaku = "1";
    raw.JSJ012.tyakujyunItemSubData.sort((a, b) => Number(a.tyaku || 99) - Number(b.tyaku || 99));
    raw.JSJ012.haraiGakuSubData.ST2HaraiGakuDispItemSubData[0].kumiBan = "2-7";
    raw.JSJ012.haraiGakuSubData.RT3HaraiGakuDispItemSubData[0].kumiBan = "2-7-6";
  });
  assert.equal(mergeOfficialResultsWithConflictIsolation(stored, withProof(value), [value]).conflicts.length, 1);
});
test("payout/placing contradiction is a true failure, not quarantine success", () => assert.throws(() => alteredProof(raw => { raw.JSJ012.haraiGakuSubData.RT3HaraiGakuDispItemSubData[0].kumiBan = "1-2-3"; }), /OFFICIAL_PAYOUT_ORDER_CONTRADICTION/u));
test("entry registration mismatch remains fatal", () => assert.throws(() => alteredProof(raw => { raw.JSJ006.sensyuTypeInfo[0].sensyuRegistNo = "999999"; })));
test("result registration mismatch remains fatal", () => assert.throws(() => alteredProof(raw => { raw.JSJ012.tyakujyunItemSubData[0].sensyuRegistNo = "999999"; })));
test("wrong venue remains fatal", () => assert.throws(() => alteredProof(raw => { raw.JSJ001.C0201data.selKjyoCd = "37"; })));
test("wrong date remains fatal", () => assert.throws(() => alteredProof(raw => { raw.JSJ001.C0201data.selKaisai = "20261121"; })));
test("unknown F state is not guessed as a confirmed keirin result", () => assert.throws(() => alteredProof(raw => { raw.JSJ012.tyakujyunItemSubData.find(row => row.syaban === "1").kojinStateItemSubData = [{ kojinState: "F" }]; })));
test("explicit disqualification plus re-entry remains valid", () => { const value = alteredProof(raw => { raw.JSJ012.tyakujyunItemSubData.find(row => row.syaban === "1").kojinStateItemSubData[1].kojinState = "落再入"; }); assert.equal(value.result.resultStatus, "confirmed"); });
test("re-entry alone remains unconfirmed", () => assert.throws(() => alteredProof(raw => { raw.JSJ012.tyakujyunItemSubData.find(row => row.syaban === "1").kojinStateItemSubData = [{ kojinState: "落再入" }]; })));
test("true fetch error blocks all writes", () => { const changed = clone(incoming); changed.errorCount = 1; assert.throws(() => mergeOfficialResultsWithConflictIsolation(stored, changed, [proof])); });
test("proof missing or forged remains fatal", () => { assert.throws(() => mergeOfficialResultsWithConflictIsolation(stored, incoming)); assert.throws(() => mergeOfficialResultsWithConflictIsolation(stored, incoming, [clone(proof)])); });
test("tampered stored proof remains fatal", () => { const before = clone(integrated.payload); targetOf(before).officialResultConflict.evidence[0].sha256 = "0".repeat(64); assert.throws(() => mergeOfficialResultsWithConflictIsolation(before, incoming, [proof])); });
test("today projection clears all settlement fields", () => { assert.equal(projection.resultStatus, "pending"); assert.deepEqual(projection.resultTop3, []); assert.deepEqual(projection.payouts, []); assert.equal(projection.result.reviewSettlementEligible, false); assert.equal(projection.result.payout3tan, undefined); });
test("today cache cannot bypass official hold", () => { const result = todayUpdateTestApi.applyOfficialResultToRace({ ...normalProjection, raceNo: raceNumber, raceOperationSource: "KEIRIN.JP:JSJ012" }, held, entries, "小田原"); assert.equal(result.resultStatus, "pending"); assert.deepEqual(result.resultTop3, []); });
test("normal today result remains confirmed", () => assert.equal(todayUpdateTestApi.applyOfficialResultToRace({ raceNo: raceNumber }, previous, entries, "小田原").resultStatus, "confirmed"));
test("prediction auto-settlement cannot use retained held placing", () => {
  assert.equal(review.resolvePredictionRaceGeneratedResult(date, { venue: "小田原", venueCode }, { ...normalProjection, raceNo: raceNumber, officialResultConflict: marker }, "3連単 7-2-6"), null);
});
test("Review official conversion carries hold", () => { const feed = buildReviewOfficialResultsFeed(integrated.payload, date); const race = feed.venues.find(row => row.venueCode === venueCode).races.find(row => row.raceNo === raceNumber); assert.equal(race.resultStatus, "pending"); assert.equal(isOfficialResultOnHold(race), true); });
test("Review stale snapshot cannot revive settled result", () => { const result = review.mergeReviewRaceWithSnapshot({ ...projection, raceNo: raceNumber }, { ...normalProjection, raceNo: raceNumber }); assert.equal(result.resultStatus, "pending"); assert.equal(result.result.payout3tan, undefined); });
test("Review old manual HIT cannot override hold", () => { const value = review.resolveReviewRacePerformance(slot, oldRecord, { ...projection, raceNo: raceNumber }); assert.equal(value.status, "pending"); assert.equal(value.actualProfit, undefined); assert.equal(value.actualRoi, undefined); });
test("Review old manual MISS cannot create loss", () => { const saved = { ...oldRecord, hitStatus: "miss", payout: 0, profitLoss: -100 }; const value = review.resolveReviewRacePerformance(slot, saved, { ...projection, raceNo: raceNumber }); assert.equal(value.status, "pending"); assert.equal(value.actualPayout, undefined); });
test("Review readiness cannot use text fallback", () => assert.equal(review.isResultReviewReady({ feedRace: { ...projection, raceNo: raceNumber } }, "7-2-6 22,540円"), false));
test("Review hold label is explicit", () => assert.match(review.getReviewResultStatusLabel(projection), /衝突.*保留/u));
test("Review original records and investment history untouched", () => { const before = JSON.stringify({ slot, oldRecord }); review.resolveReviewRacePerformance(slot, oldRecord, projection); assert.equal(JSON.stringify({ slot, oldRecord }), before); });
test("Review normal race settlement unchanged from inherited source", () => { const race = { ...normalProjection, raceNo: raceNumber }; const value = review.resolveReviewRacePerformance(slot, oldRecord, race); assert.deepEqual(value, baselineReview.resolveReviewRacePerformance(slot, oldRecord, race)); assert.equal(value.status, "purchase-hit"); assert.equal(value.actualPayout, 22540); });
test("current official hold overrides stale today in Review", () => { const feed = { date, venues: [{ venueCode, venue: "小田原", races: [{ ...normalProjection, raceNo: raceNumber }] }] }; assert.equal(attachOfficialConflictHolds(feed, integrated.payload).venues[0].races[0].resultStatus, "pending"); });
test("Review copy excludes held result but names the hold", () => {
  const feed = buildReviewOfficialResultsFeed(integrated.payload, date);
  const groups = review.buildVenueGroups(date, { fixture: slot }, { fixture: oldRecord }, feed, {}, []);
  const group = groups.find(row => row.venue.replace(/競輪場$/u, "") === "小田原"); assert.ok(group);
  const text = review.buildResultCopy(group); assert.match(text, /保留R: 4R/u); assert.doesNotMatch(text, /【4R】/u); assert.match(text, /【1R】/u);
});
test("Slack retained confirmed fields cannot bypass hold", () => { const info = { date, venueName: "小田原", venueCode, raceNo: raceNumber, race: { ...normalProjection, officialResultConflict: marker } }; assert.equal(slack.resolveSettledResult(slot, info), null); });
test("Slack normal other race remains eligible", () => { const info = { date, venueName: "小田原", venueCode, raceNo: 1, race: normalProjection }; assert.equal(slack.resolveSettledResult(slot, info)?.status, "hit"); });
test("EX performance excludes held result and payouts", () => { const value = normalizeCurrentResultRace(venueOf(stored), held, "artificial-replay.json", date); assert.equal(value.confirmed, false); assert.equal(value.storageEligible, false); assert.deepEqual(value.officialTrifectaResults, []); });
test("EX screen statistics exclude held race while retaining normal races", () => {
  const before = trend.buildKurariExTrifectaTrendV1(stored), after = trend.buildKurariExTrifectaTrendV1(integrated.payload);
  assert.ok(before.eligibleRaceCount > 1); assert.equal(after.eligibleRaceCount, before.eligibleRaceCount - 1);
});
test("EX history fallback cannot bypass same-day official hold", () => { const normal = normalizeCurrentResultRace(venueOf(stored), previous, "fixture", date), map = new Map([[normal.raceKey, normal]]); overlayOfficialPerformanceHolds(map, integrated.payload, "fixture", [date]); assert.equal(map.get(normal.raceKey).confirmed, false); });
test("EX historical performance of another date is untouched", () => { const normal = normalizeCurrentResultRace(venueOf(stored), previous, "fixture", date), map = new Map([[normal.raceKey, normal]]); overlayOfficialPerformanceHolds(map, integrated.payload, "fixture", ["2026-11-23"]); assert.equal(map.get(normal.raceKey).confirmed, true); });
const otherRace = venueOf(stored).races.find(row => row.raceNumber !== raceNumber && row.resultStatus === "confirmed");
const twoRaces = [held, otherRace];
const twoResults = summarize({ ...integrated.payload, venues: [{ ...venueOf(stored), races: twoRaces }] });
const twoEntries = { date, source: { provider: "KEIRIN.JP", endpoint: "/pc/json", entryType: "JSJ006", fetchCompletedAt: stored.source.fetchCompletedAt },
  errorCount: 0, raceCount: 2, entryRaceCount: 2, missingRaceCount: 0, venueCount: 1,
  venues: [{ ...venueOf(stored), races: twoRaces.map(race => ({ raceNumber: race.raceNumber, entryStatus: "available", entries: race.finishOrder.map(row => ({
    carNo: row.carNo, name: row.name, registrationNo: row.registrationNo, source: "KEIRIN.JP:JSJ006" })) })) }] };
const exSource = { feed: { date, venues: [{ venue: "小田原", venueCode, slug: "odawara" }] }, races: twoRaces.map(race => ({
  raceKey: `${date}:odawara:${race.raceNumber}`, date, venueKey: "odawara", raceNumber: race.raceNumber,
  operationStatus: "finished", starters: race.finishOrder.map(row => ({ carNo: Number(row.carNo), name: row.name, registrationNo: row.registrationNo })),
  result: { status: "finished", trifecta: { combination: race.payout3tan.combination, payoutYen: race.payout3tan.payoutYen },
    exacta: { combination: race.payout2tan.combination, payoutYen: race.payout2tan.payoutYen } }, quality: { resultParsed: true, warnings: [] } })) };
test("formal EX completeness does not silently admit held race", () => assert.throws(() => verifyOfficialDailySource(exSource, twoResults, twoEntries, date), /formal EX archive withheld/u));
test("EX normal-race preview continues but cannot claim complete publication", () => {
  const result = verifyOfficialDailySource(exSource, twoResults, twoEntries, date, { allowConflictExclusion: true });
  assert.equal(result.races.length, 1); assert.equal(result.races[0].raceNumber, otherRace.raceNumber);
  assert.equal(result.incomplete, true); assert.equal(result.publicationAllowed, false); assert.equal(result.excludedRaceIds[0].raceId, raceId);
});
test("formal Review archive cannot include unresolved confirmed value", () => assert.throws(() => verifyReviewOfficialArchive(twoResults, twoEntries, date), /unresolved official result conflict/u));
test("held EX rider mismatch still fails rather than being skipped", () => {
  const wrong = clone(twoEntries); wrong.venues[0].races[0].entries[0].registrationNo = "999999";
  assert.throws(() => verifyOfficialDailySource(exSource, twoResults, wrong, date, { allowConflictExclusion: true }));
});
test("resolved bit without explicit approval remains held", () => assert.equal(isOfficialResultOnHold({ officialResultConflict: { ...marker, status: "resolved" } }), true));
test("matching explicit approval releases hold", () => { const result = mergeOfficialResultsWithConflictIsolation(integrated.payload, incoming, [proof], [approval]); const race = targetOf(result.payload); assert.equal(isOfficialResultOnHold(race), false); assert.equal(raceResultSignature(race), raceResultSignature(proof.result)); verifyStoredOfficialConflict(race, raceId); });
test("resolved candidate regains Review and Slack eligibility", () => {
  const result = mergeOfficialResultsWithConflictIsolation(integrated.payload, incoming, [proof], [approval]);
  const race = officialResultToTodayRace(targetOf(result.payload), entries);
  assert.equal(review.isResultReviewReady({ feedRace: { ...race, raceNo: raceNumber } }), true);
  assert.equal(slack.resolveSettledResult(slot, { date, venueName: "小田原", venueCode, raceNo: raceNumber, race })?.status, "hit");
  const merged = review.mergeReviewRaceWithSnapshot({ ...race, raceNo: raceNumber }, { ...projection, raceNo: raceNumber });
  assert.equal(isOfficialResultOnHold(merged), false);
  assert.equal(review.isResultReviewReady({ feedRace: merged }), true);
});
test("missing server conflict metadata alone cannot release cached hold", () => {
  const merged = review.mergeReviewRaceWithSnapshot({ ...normalProjection, raceNo: raceNumber }, { ...projection, raceNo: raceNumber });
  assert.equal(isOfficialResultOnHold(merged), true);
});
test("approval tied to stable evidence survives a repeated observation", () => {
  const later = createOfficialConflictProof(proof.target, clone(proof.raw), proof.records.map(row => ({ ...row, fetchedAt: new Date().toISOString() })));
  const result = mergeOfficialResultsWithConflictIsolation(integrated.payload, incoming, [later], [approval]);
  assert.equal(isOfficialResultOnHold(targetOf(result.payload)), false);
});
test("wrong approval SHA cannot release hold", () => assert.throws(() => mergeOfficialResultsWithConflictIsolation(integrated.payload, incoming, [proof], [{ ...approval, evidenceSha256: "0".repeat(64) }])));
test("approval cannot release a different candidate", () => assert.throws(() => mergeOfficialResultsWithConflictIsolation(integrated.payload, stored, [], [approval])));
test("approval duplicate and unknown race are rejected", () => { assert.throws(() => mergeOfficialResultsWithConflictIsolation(integrated.payload, incoming, [proof], [approval, approval])); assert.throws(() => mergeOfficialResultsWithConflictIsolation(integrated.payload, incoming, [proof], [{ ...approval, raceId: `${date}:36:1` }])); });
test("new day does not inherit previous-day hold", () => { const next = clone(stored); next.date = "2026-11-23"; for (const venue of next.venues) venue.date = next.date; const result = mergeOfficialResultsWithConflictIsolation(integrated.payload, next); assert.equal(result.conflicts.length, 0); assert.equal(targetOf(result.payload).officialResultConflict, undefined); });
test("new day Review never receives previous-day hold", () => { const feed = { date: "2026-11-23", venues: [{ venue: "小田原", venueCode, races: [{ raceNo: raceNumber, ...normalProjection }] }] }; assert.deepEqual(attachOfficialConflictHolds(feed, integrated.payload), feed); });
function nextDayCandidate() { const next = clone(stored); next.date = "2026-11-23"; for (const venue of next.venues) venue.date = next.date; return next; }
const nextDayState = mergeOfficialResultsWithConflictIsolation(integrated.payload, nextDayCandidate()).payload;
test("next-day registry preserves only prior-date hold metadata", () => {
  assert.equal(nextDayState.date, "2026-11-23"); assert.ok(nextDayState.venues.every(venue => venue.date === "2026-11-23"));
  assert.equal(nextDayState.officialResultConflictRegistry[0].raceId, raceId);
  assert.doesNotMatch(JSON.stringify(nextDayState.officialResultConflictRegistry), /"(?:finishOrder|payouts|bodyBase64)":/u);
});
test("prior-date Review remains held using next-day registry", () => {
  const archive = buildReviewOfficialResultsFeed(stored, date);
  const result = attachOfficialConflictHolds(archive, nextDayState);
  assert.equal(isOfficialResultOnHold(result.venues.find(row => row.venueCode === venueCode).races.find(row => row.raceNo === raceNumber)), true);
});
test("prior-date EX performance remains held after current-day rollover", () => {
  const normal = normalizeCurrentResultRace(venueOf(stored), previous, "fixture", date), map = new Map([[normal.raceKey, normal]]);
  overlayOfficialPerformanceHolds(map, nextDayState, "fixture", [date]); assert.equal(map.get(normal.raceKey).confirmed, false);
});
test("historical known conflict can seed a new-day metadata registry with raw proof", async () => {
  await persistOfficialConflictEvidence(integrated.evidenceBundles);
  assert.equal(await verifyConflictRegistryImport(integrated.payload, "2026-11-23"), 1);
  const seeded = mergeOfficialResultsWithConflictIsolation(nextDayCandidate(), nextDayCandidate(), [], [], { resolutionSnapshot: integrated.payload }).payload;
  assert.equal(seeded.officialResultConflictRegistry[0].raceId, raceId);
  assert.deepEqual(seeded.venues, nextDayCandidate().venues);
});
test("explicit historical resolution changes registry, never current-day results", () => {
  const resolvedPast = mergeOfficialResultsWithConflictIsolation(integrated.payload, incoming, [proof], [approval]).payload;
  const resolvedNextDay = mergeOfficialResultsWithConflictIsolation(nextDayState, nextDayCandidate(), [], [], { resolutionSnapshot: resolvedPast }).payload;
  assert.deepEqual(resolvedNextDay.venues, nextDayState.venues);
  assert.equal(resolvedNextDay.officialResultConflictRegistry[0].status, "resolved");
  const stale = attachOfficialConflictHolds(buildReviewOfficialResultsFeed(stored, date), resolvedNextDay);
  assert.equal(isOfficialResultOnHold(stale.venues.find(row => row.venueCode === venueCode).races.find(row => row.raceNo === raceNumber)), true);
  const refreshed = attachOfficialConflictHolds(buildReviewOfficialResultsFeed(resolvedPast, date), resolvedNextDay);
  assert.equal(isOfficialResultOnHold(refreshed.venues.find(row => row.venueCode === venueCode).races.find(row => row.raceNo === raceNumber)), false);
});
test("past-day official result cannot be indexed as today", () => assert.throws(() => indexOfficialTodayResults(integrated.payload, "2026-11-23"), /date\/source mismatch/u));

const rawList = read(".tmp/odawara/raw/JSJ048-kbn0.json"); rawList.RaceList = rawList.RaceList.filter(row => String(row.naibuKeirinCd) === venueCode);
const venueRaw = read(".tmp/odawara/raw/JSJ001-venue.json");
const responseMap = { list: rawList };
const venueParameter = rawList.RaceList[0].touhyouLivePara;
responseMap[`JSJ001:${venueParameter}`] = venueRaw;
for (const [index, meta] of venueRaw.C0201data.C0201race.entries()) {
  responseMap[`JSJ012:${meta.encParaR}`] = index + 1 === raceNumber ? proof.raw.JSJ012
    : { resultCd: 0, tyakujyunDispFlg: false, haraiGakuDispFlg: false, tyakujyunItemSubData: [] };
  if (index + 1 === raceNumber) { responseMap[`JSJ006:${meta.encParaR}`] = proof.raw.JSJ006; responseMap[`JSJ001:${meta.encParaR}`] = proof.raw.JSJ001; }
}
const preload = path.join(output, "offline-fetch.mjs"), config = path.join(output, "responses.json");
fs.writeFileSync(config, JSON.stringify(responseMap));
fs.writeFileSync(preload, `import fs from 'node:fs';const responses=JSON.parse(fs.readFileSync(process.env.CONFLICT_TEST_RESPONSES,'utf8'));const write=fs.promises.writeFile;fs.promises.writeFile=async(file,...args)=>{if(process.env.FAIL_CONFLICT_EVIDENCE==='true'&&String(file).includes('official-result-conflicts'))throw Error('injected evidence persistence failure');return write(file,...args);};globalThis.fetch=async input=>{const u=new URL(input);const key=u.searchParams.get('type')==='JSJ048'?'list':u.searchParams.get('type')+':'+u.searchParams.get('encp');if(!responses[key])throw Error('unmapped offline request');return new Response(JSON.stringify(responses[key]),{status:200});};`);
const cliFile = path.join(output, "past-day-results.json");
const miniStored = summarize({ ...stored, venues: [clone(venueOf(stored))] });
fs.writeFileSync(cliFile, JSON.stringify(miniStored));
const cli = (env = {}) => spawnSync(process.execPath, ["--import=" + pathToFileURL(preload).href, "scripts/update-keirin-jp-results.mjs", "--expect-date=" + date, "--output=" + cliFile, "--delay-ms=0"],
  { encoding: "utf8", timeout: 30000, env: { ...process.env, GITHUB_ACTIONS: "true", CONFLICT_TEST_RESPONSES: config, ...env } });
test("actual updater CLI: explicit historical output continues with held conflict", () => {
  const result = cli(); fs.writeFileSync(path.join(output, "cli.log"), result.stdout + result.stderr);
  assert.equal(result.status, 0, result.stderr); assert.match(result.stderr, /official-result-quarantined/u);
  const value = read(cliFile); assert.equal(value.date, date); assert.equal(value.errorCount, 0); assert.equal(value.conflictRaceCount, 1);
  assert.equal(raceResultSignature(targetOf(value)), raceResultSignature(previous));
  verifyStoredOfficialConflict(targetOf(value), raceId);
});
test("ordinary validation accepts valid hold while reporting it", () => { const run = spawnSync(process.execPath, ["scripts/check-keirin-jp-results.mjs", "--file=" + cliFile, "--expect-date=" + date, "--require-no-errors"], { encoding: "utf8" }); assert.equal(run.status, 0, run.stdout + run.stderr); assert.match(run.stdout, /unresolved conflicts.*1/u); });
test("complete archive validation rejects unresolved hold", () => { const run = spawnSync(process.execPath, ["scripts/check-keirin-jp-results.mjs", "--file=" + cliFile, "--require-complete"], { encoding: "utf8" }); assert.equal(run.status, 1); assert.match(run.stderr, /unresolved conflicts=1/u); });
test("raw evidence persistence failure leaves normalized output untouched", () => {
  const before = fs.readFileSync(cliFile); const result = cli({ FAIL_CONFLICT_EVIDENCE: "true" });
  assert.equal(result.status, 1); assert.match(result.stderr, /injected evidence persistence failure/u);
  assert.deepEqual(fs.readFileSync(cliFile), before);
});
test("past day cannot write default current public JSON", () => { const run = spawnSync(process.execPath, ["scripts/update-keirin-jp-results.mjs", "--expect-date=" + date, "--write-public"], { encoding: "utf8", env: { ...process.env, GITHUB_ACTIONS: "true" } }); assert.equal(run.status, 1); assert.match(run.stderr, /PAST_DATE_PUBLIC_OUTPUT_PROHIBITED/u); });
test("EX ordinary performance fixture retains valid normal calculations", async () => {
  const result = await evaluatePredictionPerformance({ predictionFile: "scripts/fixtures/kurari-ex-prediction-performance-predictions.json", resultFile: "scripts/fixtures/kurari-ex-prediction-performance-results.json", write: false });
  const file = path.join(output, "performance-fixture.json"); fs.writeFileSync(file, JSON.stringify(result));
  assert.deepEqual((await checkPredictionPerformance(file)).errors, []);
  assert.ok(result.summary.plannedRoiEvaluableCount > 0);
});

process.on("exit", () => console.log(`Conflict continuation evidence: ${output}`));
