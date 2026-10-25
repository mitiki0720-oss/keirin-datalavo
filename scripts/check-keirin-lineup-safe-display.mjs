import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { hasUsableLineup, validateLineupEvidence } from "./lib/lineup-evidence.mjs";

const cars = ["1", "2", "3", "4", "5", "6", "7"];
const riders = cars.map((carNo) => ({ carNo }));
const lineup = "4-6 / 1-3 / 2-5-7";
const race = { date: "2026-10-25", venueCode: "53", raceNo: 1, time: "15:00", title: "A級一般", lineup: "4 6 1 3 2 5 7", riders };
const lineupObservation = { date: "2026-10-25", venueCode: "53", raceNo: 1, provider: "kdreams", fetchedAt: "2026-10-25T05:00:00.000Z" };
assert.equal(validateLineupEvidence(lineup, { riderCars: cars }).valid, true);
assert.deepEqual(validateLineupEvidence(lineup, { riderCars: cars }).groups, ["46", "13", "257"]);
for (const raw of [race.lineup, "4-6 / 1-3 / 2-5-5", "4-6 / 1-3 / 2-5-8", "4-6 / 1-3 / 2-5"]) {
  assert.equal(validateLineupEvidence(raw, { riderCars: cars }).valid, false);
}
assert.equal(hasUsableLineup(race), false);
assert.equal(hasUsableLineup({ ...race, kdreamsLineupRaw: lineup }, { kdreams: true }), false);
assert.equal(hasUsableLineup({ ...race, kdreamsLineupRaw: lineup, lineupObservation }, { kdreams: true }), true);
assert.equal(hasUsableLineup({ ...race, kdreamsLineupRaw: race.lineup }, { kdreams: true }), false);
assert.equal(hasUsableLineup({ ...race, title: "L級ガ予２", kdreamsLineupRaw: lineup, lineupObservation }, { kdreams: true }), false);
assert.equal(hasUsableLineup({ ...race, charilotoLineupRaw: lineup, lineupObservation: { ...lineupObservation, provider: "chariloto" } }, { chariloto: true }), true);
for (const invalidObservation of [
  { ...lineupObservation, date: "2026-10-24" },
  { ...lineupObservation, venueCode: "54" },
  { ...lineupObservation, raceNo: 2 },
  { ...lineupObservation, fetchedAt: "2026-10-25T07:00:00.000Z" },
]) {
  assert.equal(hasUsableLineup({ ...race, kdreamsLineupRaw: lineup, lineupObservation: invalidObservation }, { kdreams: true }), false);
}

const page = fs.readFileSync(new URL("../src/pages/PageImplementations.tsx", import.meta.url), "utf8");
function compileSection(start, end, context, exposedName) {
  const from = page.indexOf(start);
  const to = page.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `missing section: ${start}`);
  vm.runInNewContext(ts.transpileModule(page.slice(from, to), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText + (exposedName ? `\nexports.${exposedName} = ${exposedName};` : ""), context);
}
const lineupContext = { exports: {} };
compileSection("const isPredictionGirlsRace =", "export const extractPredictionLineupCarNos =", lineupContext, "resolvePredictionLineup");
assert.match(lineupContext.exports.buildPredictionLineupDisplay(race), /車番順（ライン未確認）/u);
assert.equal(lineupContext.exports.buildPredictionLineupGroups(race).length, 0);
assert.equal(lineupContext.exports.buildPredictionLineupGroups({ ...race, kdreamsLineupRaw: lineup }).length, 0);
assert.equal(lineupContext.exports.buildPredictionLineupDisplay({ ...race, kdreamsLineupRaw: lineup, lineupObservation }), "ライン区切り候補: 4-6 / 1-3 / 2-5-7");
assert.equal(lineupContext.exports.buildPredictionLineupGroups({ ...race, kdreamsLineupRaw: lineup, lineupObservation }).length, 3);
assert.equal(lineupContext.exports.buildPredictionLineupGroups({ ...race, title: "L級ガ予２", kdreamsLineupRaw: lineup, lineupObservation }).length, 0);
assert.equal(lineupContext.exports.buildPredictionLineupGroups({ ...race, kdreamsLineupRaw: "4-6 / 1-3 / 2-5-5" }).length, 0);

const lineupExportContext = {
  exports: {},
  resolvePredictionLineup: lineupContext.exports.resolvePredictionLineup,
  parsePredictionLineupRaw: (raw) => ({ orderLabel: raw.replace(/[^1-9]/gu, "").split("").join(" → "), groupedGroups: ["4-6", "1-3", "2-5-7"] }),
  detectPredictionRookieRaceCategory: () => "other",
  getPredictionRookieLineupNote: () => "",
};
compileSection("function buildPredictionKdreamsLineupExport(", "function buildPredictionSourceSupplementExport(", lineupExportContext, "buildPredictionKdreamsLineupExport");
const fallbackLineup = lineupExportContext.exports.buildPredictionKdreamsLineupExport({ ...race,
  kdreamsLineupRaw: race.lineup, charilotoLineupRaw: lineup,
  lineupObservation: { ...lineupObservation, provider: "chariloto" },
});
assert.match(fallbackLineup, /区切り候補の証跡: chariloto/u);
assert.match(fallbackLineup, /ライン区切り: 4-6 \/ 1-3 \/ 2-5-7/u);

const oddsContext = {
  exports: {},
  isPredictionRaceExcludedByOperation: () => false,
  buildPredictionLineupDisplay: () => "ライン区切り候補",
  dedupePredictionNoteParts: (parts) => parts,
  splitPredictionNoteParts: (note) => note ? [note] : [],
  getPredictionOddsUnavailableLabel: () => "事前オッズ未取得",
};
compileSection("function hasVerifiedPredictionOdds(", "export const getFeaturedRaceOddsTone =", oddsContext, "hasVerifiedPredictionOdds");
compileSection("export const getFeaturedRaceOddsTone =", "export const getFeaturedRaceOddsToneLabel =", oddsContext, "getFeaturedRaceOddsTone");
compileSection("export const getPredictionMaterialReady =", "const OPERATION_EXCLUDED_STATUSES", oddsContext, "getPredictionMaterialReady");
compileSection("export const buildPredictionOddsBuckets =", "const appendPredictionVenueExportField", oddsContext, "buildPredictionOddsBuckets");
compileSection("function buildPredictionOddsExport(", "function buildPredictionMemoExport(", oddsContext, "buildPredictionOddsExport");
const oddsRace = {
  ...race,
  time: "15:00",
  oddsTrifecta: [{ combination: "1-2-3", odds: 12.3, popularity: 1, source: "kdreams" }],
  oddsPreview: [{ combo: "1-2-3", odds: "12.3倍" }],
  favoriteCombination: "1-2-3",
  favoriteOdds: 12.3,
  oddsObservation: { date: "2026-10-25", venueCode: "53", raceNo: 1, provider: "kdreams", fetchedAt: "2026-10-25T05:00:00.000Z" },
  oddsAcquisition: { date: "2026-10-25", venueCode: "53", raceNo: 1, provider: "kdreams", status: "odds-verified", fetchedAt: "2026-10-25T05:00:00.000Z" },
};
const exportOdds = (value, date = "2026-10-25") => oddsContext.exports.buildPredictionOddsExport(value, date, "53");
assert.match(exportOdds(oddsRace), /1-2-3 12\.3倍/u);
assert.match(exportOdds(oddsRace), /1人気/u);
assert.match(exportOdds(oddsRace), /オッズプレビュー/u);
assert.match(exportOdds(oddsRace), /一番人気オッズ/u);
assert.notEqual(oddsContext.exports.getFeaturedRaceOddsTone(oddsRace, "2026-10-25", "53").tone, "pending");
assert.equal(oddsContext.exports.getPredictionMaterialReady(oddsRace, "2026-10-25", "53"), true);
assert.equal(oddsContext.exports.buildPredictionOddsBuckets(oddsRace, "2026-10-25", "53")[0].items.length, 1);
assert.equal(oddsContext.exports.getFeaturedRaceOddsTone({ ...oddsRace, oddsObservation: null }, "2026-10-25", "53").tone, "pending");
assert.equal(oddsContext.exports.getFeaturedRaceOddsTone(oddsRace, "2026-10-24", "53").tone, "pending");
for (const unsafe of [
  { ...oddsRace, oddsObservation: null },
  { ...oddsRace, oddsObservation: { ...oddsRace.oddsObservation, venueCode: "54" } },
  { ...oddsRace, oddsObservation: { ...oddsRace.oddsObservation, raceNo: 2 } },
  { ...oddsRace, oddsAcquisition: { ...oddsRace.oddsAcquisition, venueCode: "54" } },
  { ...oddsRace, oddsAcquisition: { ...oddsRace.oddsAcquisition, fetchedAt: "2026-10-25T05:01:00.000Z" } },
  { ...oddsRace, oddsAcquisition: { ...oddsRace.oddsAcquisition, status: "identity-conflict-blocked" } },
  { ...oddsRace, oddsObservation: { ...oddsRace.oddsObservation, fetchedAt: "2026-10-24T05:00:00.000Z" } },
  { ...oddsRace, oddsObservation: { ...oddsRace.oddsObservation, fetchedAt: "2026-10-25T07:00:00.000Z" }, oddsAcquisition: { status: "odds-verified", fetchedAt: "2026-10-25T07:00:00.000Z" } },
  { ...oddsRace, time: "" },
  { ...oddsRace, oddsTrifecta: [{ ...oddsRace.oddsTrifecta[0], source: "unknown" }] },
  { ...oddsRace, oddsTrifecta: [oddsRace.oddsTrifecta[0], oddsRace.oddsTrifecta[0]] },
  { ...race, payouts: [{ betType: "3連単", combination: "1-2-3", payout: "1,230円" }] },
]) {
  assert.doesNotMatch(exportOdds(unsafe), /\[3連単上位15件\]/u);
}
for (const conflicting of [
  { ...oddsRace, oddsPreview: [{ combo: "1-2-3", odds: "99.9倍" }] },
  { ...oddsRace, favoriteOdds: 99.9 },
]) {
  assert.doesNotMatch(exportOdds(conflicting), /\[3連単上位15件\]/u);
  assert.equal(oddsContext.exports.getFeaturedRaceOddsTone(conflicting, "2026-10-25", "53").tone, "pending");
  assert.equal(oddsContext.exports.getPredictionMaterialReady(conflicting, "2026-10-25", "53"), false);
  assert.equal(oddsContext.exports.buildPredictionOddsBuckets(conflicting, "2026-10-25", "53")[0].items.length, 0);
}
assert.doesNotMatch(exportOdds(oddsRace, "2026-10-24"), /\[3連単上位15件\]/u);
assert.match(exportOdds({ ...race, oddsAcquisition: { status: "sale-state-unverified" } }), /事前オッズ未取得/u);

const feed = JSON.parse(fs.readFileSync(new URL("../public/data/races/today.generated.json", import.meta.url), "utf8"));
const savedRaces = feed.venues.flatMap((venue) => venue.races);
const carOrderOnly = savedRaces.filter((item) => item.lineup && ![
  item.kdreamsLineupRaw, item.netkeirinLineupRaw, item.charilotoLineupRaw, item.oddsparkLineupRaw, item.winticketLineupRaw,
].some(Boolean));
assert.ok(carOrderOnly.every((item) => !hasUsableLineup(item)));
console.log(`PASS safe display: ${carOrderOnly.length}/${savedRaces.length} saved car-order-only races withheld; sourced fixture retained`);
