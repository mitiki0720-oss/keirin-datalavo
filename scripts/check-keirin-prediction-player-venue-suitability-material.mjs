import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
const readText = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const normalizeRegistrationNo = (value) => {
  const digits = String(value ?? "").replace(/\D/gu, "");
  return digits && digits.length <= 6 ? digits.padStart(6, "0") : digits;
};
const normalizeVenueKey = (value) => String(value ?? "").trim().toLowerCase();
const issues = [];
const assert = (condition, message) => {
  if (!condition) issues.push(message);
};

const pageSource = readText("src/pages/PageImplementations.tsx");
const dataSource = readText("src/lib/kurariExData.ts");
const formatterStart = dataSource.indexOf("function formatKurariExVenueSuitabilityRate(");
const formatterEnd = dataSource.indexOf("export function buildKurariExRiderPredictionMaterial(", formatterStart);
const formatterSource = formatterStart >= 0 && formatterEnd > formatterStart
  ? dataSource.slice(formatterStart, formatterEnd)
  : "";

assert(formatterSource.length > 0, "shared venue suitability formatter is missing");
assert(formatterSource.includes('entry.matchMethod !== "registrationNo"'), "registrationNo exact match guard is missing");
assert(formatterSource.includes("entry.exact.identity.registrationNoResolved"), "resolved registration identity guard is missing");
assert(formatterSource.includes("=== canonicalVenueKey"), "canonical venue key exact guard is missing");
assert(!formatterSource.includes("normalizeKurariExRiderName"), "name matching leaked into venue suitability formatter");
assert(!formatterSource.includes("normalizeKurariExVenueName"), "venue name matching leaked into venue suitability formatter");
assert(formatterSource.includes("LOW SAMPLE") && formatterSource.includes("予想の加点・減点根拠にはしない"), "LOW SAMPLE safeguard is missing");
assert(formatterSource.includes('item.sampleQuality === "limited"') && formatterSource.includes("予想の補助材料としてのみ利用"), "LIMITED safeguard is missing");
assert(formatterSource.includes("venue suitability unavailable for current venue"), "missing venue data is not explicit");
assert(formatterSource.includes("exact rider identity unavailable"), "missing exact rider is not explicit");
assert(formatterSource.includes("identity conflict除外"), "identity conflict exclusion provenance is missing");
assert(formatterSource.includes('value == null ? "未取得"'), "null rates may be coerced to zero");
assert(pageSource.includes("selectedKurariExVenueSuitabilityMaterial"), "single-race material connection is missing");
assert(pageSource.includes("riderVenueSuitabilityText"), "range material connection is missing");
assert(pageSource.includes("predictionBatchKurariExRiderStatus"), "range rider exact loading guard is missing");
assert(pageSource.includes("riderVenueSuitabilityText,\n        \"\",\n        extractPredictionBatchMonthlyMeta"), "range venue suitability placement is missing");

const bundle = await build({
  entryPoints: [path.join(root, "src", "lib", "kurariExData.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  logLevel: "silent",
  define: { "import.meta.env.BASE_URL": '"/"' },
});
const formatterModule = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const buildMaterial = formatterModule.buildKurariExRiderVenueSuitabilityMaterial;
assert(typeof buildMaterial === "function", "bundled formatter export is unavailable");

const fixtureItem = (sampleQuality, top2Delta, top3Delta, top3Rate = 50, recentTop3Rate = 50) => ({
  venueKey: "hiratsuka",
  venueName: "平塚",
  observedStarts: sampleQuality === "low-sample" ? 3 : sampleQuality === "limited" ? 7 : 12,
  settledStarts: sampleQuality === "low-sample" ? 3 : sampleQuality === "limited" ? 7 : 12,
  wins: 2,
  seconds: 2,
  thirds: 2,
  outside: 1,
  winRate: 28.6,
  top2Rate: 42.9,
  top3Rate,
  period: { from: "2026-06-01", to: "2026-09-01" },
  latestRaceDate: "2026-09-01",
  recent: {
    windowSize: 5,
    sampleSize: 5,
    windowComplete: true,
    period: { from: "2026-08-01", to: "2026-09-01" },
    settledStarts: 5,
    wins: 1,
    seconds: 1,
    thirds: 1,
    outside: 2,
    winRate: 20,
    top2Rate: 40,
    top3Rate: recentTop3Rate,
  },
  delta: { winRate: 5, top2Rate: top2Delta, top3Rate: top3Delta },
  sampleQuality,
});
const fixtureEntry = (registrationNo, carNo, items, conflictCount = 0) => ({
  carNo,
  riderName: `fixture-${carNo}`,
  registrationNo,
  matchMethod: "registrationNo",
  indexItem: { registrationNo, name: `fixture-${carNo}`, file: "fixture" },
  exact: {
    registrationNo,
    name: `fixture-${carNo}`,
    identity: { registrationNoResolved: true },
    venueSuitability: {
      excludedIdentityConflictCount: conflictCount,
      excludedSettledIdentityConflictCount: conflictCount,
      items,
    },
  },
});
const renderFixture = (entries, riders, venueKey = "hiratsuka") => buildMaterial(
  entries,
  { venueKey, venueName: "平塚", riders },
  "ready",
).text;
const oneRider = (registrationNo = "000001", carNo = "1") => ({ carNo, name: `fixture-${carNo}`, registrationNo });
const lowSampleText = renderFixture([fixtureEntry("000001", "1", [fixtureItem("low-sample", 20, 30)])], [oneRider()]);
const limitedText = renderFixture([fixtureEntry("000001", "1", [fixtureItem("limited", 0, 0)])], [oneRider()]);
const bestReferenceText = renderFixture([fixtureEntry("000001", "1", [fixtureItem("moderate", 8, 12, 50, 50)])], [oneRider()]);
const weakReferenceText = renderFixture([fixtureEntry("000001", "1", [fixtureItem("limited", -8, -12, 50, 50)])], [oneRider()]);
const recentReversalText = renderFixture([fixtureEntry("000001", "1", [fixtureItem("moderate", 8, 12, 60, 40)])], [oneRider()]);
const currentVenueMissingText = renderFixture([fixtureEntry("000001", "1", [fixtureItem("limited", 8, 12)])], [oneRider()], "odawara");
const riderExactMissingText = renderFixture([], [oneRider()]);
const conflictText = renderFixture([fixtureEntry("000001", "1", [fixtureItem("low-sample", 0, 0)], 2)], [oneRider()]);
const sevenRiders = Array.from({ length: 7 }, (_, index) => oneRider(String(index + 1).padStart(6, "0"), String(index + 1)));
const sevenEntries = sevenRiders.map((rider) => fixtureEntry(rider.registrationNo, rider.carNo, [fixtureItem("low-sample", 0, 0)]));
const sevenRiderText = renderFixture(sevenEntries, sevenRiders);
const fixtures = {
  lowSample: lowSampleText.includes("判定: LOW SAMPLE"),
  limited: limitedText.includes("sample quality: LIMITED") && limitedText.includes("判定: REFERENCE HOLD"),
  bestReference: bestReferenceText.includes("判定: BEST REFERENCE"),
  weakReference: weakReferenceText.includes("判定: WEAK REFERENCE"),
  recentReversalHold: recentReversalText.includes("判定: REFERENCE HOLD") && recentReversalText.includes("適性評価は保留"),
  riderExactMissing: riderExactMissingText.includes("reason: exact rider identity unavailable"),
  currentVenueMissing: currentVenueMissingText.includes("reason: venue suitability unavailable for current venue"),
  identityConflictProvenance: conflictText.includes("identity conflict除外: 観測2 / 確定2"),
  sevenUniqueRiders: (sevenRiderText.match(/^■ \d+番 /gmu) ?? []).length,
};
assert(fixtures.lowSample, "LOW SAMPLE fixture failed");
assert(fixtures.limited, "LIMITED fixture failed");
assert(fixtures.bestReference, "BEST REFERENCE fixture failed");
assert(fixtures.weakReference, "WEAK REFERENCE fixture failed");
assert(fixtures.recentReversalHold, "recent reversal safeguard fixture failed");
assert(fixtures.riderExactMissing, "missing rider exact fixture failed");
assert(fixtures.currentVenueMissing, "missing current venue fixture failed");
assert(fixtures.identityConflictProvenance, "identity conflict fixture failed");
assert(fixtures.sevenUniqueRiders === 7, "seven-rider uniqueness fixture failed");

const today = readJson("public/data/races/today.generated.json");
const officialEntries = readJson("public/data/races/keirin-jp-entries.generated.json");
const riderIndex = readJson("public/data/analytics/kurari-ex/exact/riders/index.generated.json");
const riderIndexByRegistrationNo = new Map(
  riderIndex.items.map((item) => [normalizeRegistrationNo(item.registrationNo), item]),
);
const officialByRaceCar = new Map();
for (const venue of officialEntries.venues ?? []) {
  for (const race of venue.races ?? []) {
    for (const entry of race.entries ?? []) {
      officialByRaceCar.set(
        [venue.date ?? officialEntries.date, String(venue.venueCode ?? ""), Number(race.raceNumber), String(entry.carNo)].join("|"),
        entry,
      );
    }
  }
}

const leakageTerms = ["current result", "current payout", "確定着順", "払戻", "決まり手"];
let starterCount = 0;
let officialRegistrationCount = 0;
let exactRiderCount = 0;
let currentVenueItemCount = 0;
let lowSampleCount = 0;
let limitedCount = 0;
let bestReferenceCount = 0;
let weakReferenceCount = 0;
let unavailableCount = 0;
let duplicateRiderCount = 0;
let duplicateVenueItemCount = 0;
let otherVenueWouldBeSelectedCount = 0;
let maxEstimatedMaterialChars = 0;
let maxRenderedMaterialChars = 0;
let auditedSingleRaceMaterialCount = 0;
let duplicateSuitabilityBlockCount = 0;
let singleRaceRiderMismatchCount = 0;
let singleRaceVenueMismatchCount = 0;
let singleRaceLeakageCount = 0;
let resultLeakageCount = 0;
let payoutLeakageCount = 0;
let kimariteLeakageCount = 0;
const raceAudit = [];
const singleRaceMaterials = new Map();

for (const venue of today.venues ?? []) {
  const venueKey = normalizeVenueKey(venue.slug);
  assert(Boolean(venueKey), `${venue.venue}: canonical venue slug missing`);
  for (const race of venue.races ?? []) {
    const seenRegistrationNos = new Set();
    const raceRiders = [];
    const raceEntries = [];
    let raceExactCount = 0;
    let raceVenueCount = 0;
    let raceUnavailableCount = 0;
    for (const rider of race.riders ?? []) {
      starterCount += 1;
      const official = officialByRaceCar.get(
        [today.date, String(venue.venueCode ?? ""), Number(race.raceNo), String(rider.carNo)].join("|"),
      );
      const registrationNo = normalizeRegistrationNo(official?.registrationNo);
      raceRiders.push({ carNo: rider.carNo, name: rider.name, fullName: rider.fullName, registrationNo });
      if (registrationNo) officialRegistrationCount += 1;
      if (!registrationNo || seenRegistrationNos.has(registrationNo)) {
        if (registrationNo) duplicateRiderCount += 1;
        raceUnavailableCount += 1;
        continue;
      }
      seenRegistrationNos.add(registrationNo);
      const indexItem = riderIndexByRegistrationNo.get(registrationNo);
      if (!indexItem) {
        raceUnavailableCount += 1;
        continue;
      }
      exactRiderCount += 1;
      raceExactCount += 1;
      const riderPayload = readJson(indexItem.file.replace(/^\//u, "public/"));
      assert(normalizeRegistrationNo(riderPayload.registrationNo) === registrationNo, `${registrationNo}: rider file identity mismatch`);
      assert(riderPayload.identity?.registrationNoResolved === true, `${registrationNo}: exact identity is unresolved`);
      raceEntries.push({
        carNo: String(rider.carNo),
        riderName: String(rider.fullName || rider.name || indexItem.name),
        registrationNo,
        matchMethod: "registrationNo",
        indexItem,
        exact: riderPayload,
      });
      const currentItems = (riderPayload.venueSuitability?.items ?? []).filter(
        (item) => normalizeVenueKey(item.venueKey) === venueKey,
      );
      if (currentItems.length > 1) duplicateVenueItemCount += currentItems.length - 1;
      if (currentItems.length !== 1) {
        raceUnavailableCount += 1;
        continue;
      }
      currentVenueItemCount += 1;
      raceVenueCount += 1;
      const item = currentItems[0];
      if (item.sampleQuality === "low-sample") lowSampleCount += 1;
      if (item.sampleQuality === "limited") limitedCount += 1;
      if (item.sampleQuality === "unavailable") raceUnavailableCount += 1;
      const selectedKeys = [item.venueKey];
      if (selectedKeys.some((key) => normalizeVenueKey(key) !== venueKey)) otherVenueWouldBeSelectedCount += 1;
    }
    const estimatedChars = raceVenueCount * 650 + raceUnavailableCount * 190 + 240;
    maxEstimatedMaterialChars = Math.max(maxEstimatedMaterialChars, estimatedChars);
    const material = buildMaterial(
      raceEntries,
      { venueKey, venueName: venue.venue, riders: raceRiders },
      "ready",
    ).text;
    auditedSingleRaceMaterialCount += 1;
    maxRenderedMaterialChars = Math.max(maxRenderedMaterialChars, material.length);
    const suitabilityBlockCount = (material.match(/【PLAYER EX \/ 会場別適性】/gu) ?? []).length;
    if (suitabilityBlockCount !== 1) duplicateSuitabilityBlockCount += Math.abs(suitabilityBlockCount - 1);
    const renderedRiderCount = (material.match(/^■ \d+番 /gmu) ?? []).length;
    if (renderedRiderCount !== raceRiders.length) singleRaceRiderMismatchCount += 1;
    const renderedVenueKeys = [...material.matchAll(/^- 対象会場: .*?\(([^)]+)\)/gmu)].map((match) => normalizeVenueKey(match[1]));
    if (renderedVenueKeys.some((key) => key !== venueKey)) singleRaceVenueMismatchCount += 1;
    const leakageHits = leakageTerms.filter((term) => material.includes(term));
    if (leakageHits.length > 0) singleRaceLeakageCount += 1;
    if (material.includes("current result") || material.includes("確定着順")) resultLeakageCount += 1;
    if (material.includes("current payout") || material.includes("払戻")) payoutLeakageCount += 1;
    if (material.includes("決まり手")) kimariteLeakageCount += 1;
    bestReferenceCount += (material.match(/^- 判定: BEST REFERENCE$/gmu) ?? []).length;
    weakReferenceCount += (material.match(/^- 判定: WEAK REFERENCE$/gmu) ?? []).length;
    singleRaceMaterials.set(`${venueKey}|${race.raceNo}`, {
      material,
      registrationNos: raceRiders.map((rider) => normalizeRegistrationNo(rider.registrationNo)).filter(Boolean),
    });
    raceAudit.push({
      venue: venue.venue,
      venueKey,
      raceNo: race.raceNo,
      exactRiders: raceExactCount,
      venueItems: raceVenueCount,
      unavailable: raceUnavailableCount,
      estimatedChars,
      renderedChars: material.length,
      renderedRiders: renderedRiderCount,
      leakageHits,
    });
  }
}

assert(today.date === officialEntries.date, `today/official date mismatch: ${today.date}/${officialEntries.date}`);
assert(duplicateRiderCount === 0, `duplicate rider identities: ${duplicateRiderCount}`);
assert(duplicateVenueItemCount === 0, `duplicate current venue items: ${duplicateVenueItemCount}`);
assert(otherVenueWouldBeSelectedCount === 0, `other venue selection count: ${otherVenueWouldBeSelectedCount}`);
assert(maxEstimatedMaterialChars <= 7000, `estimated per-race material is too large: ${maxEstimatedMaterialChars}`);
assert(auditedSingleRaceMaterialCount === raceAudit.length, "not every single-race material was rendered");
assert(duplicateSuitabilityBlockCount === 0, `duplicate suitability block count: ${duplicateSuitabilityBlockCount}`);
assert(singleRaceRiderMismatchCount === 0, `single-race rider block mismatch count: ${singleRaceRiderMismatchCount}`);
assert(singleRaceVenueMismatchCount === 0, `single-race current venue mismatch count: ${singleRaceVenueMismatchCount}`);
assert(singleRaceLeakageCount === 0, `single-race leakage count: ${singleRaceLeakageCount}`);
assert(maxRenderedMaterialChars <= 7000, `rendered per-race material is too large: ${maxRenderedMaterialChars}`);

const rangeTargets = [
  { venue: "富山", venueKey: "toyama", raceNos: [1, 2, 3, 4, 5, 6] },
  { venue: "前橋", venueKey: "maebashi", raceNos: [7, 8, 9] },
];
const rangeAudits = rangeTargets.map((target) => {
  const races = target.raceNos.map((raceNo) => ({ raceNo, ...singleRaceMaterials.get(`${target.venueKey}|${raceNo}`) }));
  const foundRaceCount = races.filter((race) => typeof race.material === "string").length;
  const combinedMaterial = races.map((race) => `【${race.raceNo}R】\n${race.material ?? ""}`).join("\n\n");
  const suitabilityBlockCount = (combinedMaterial.match(/【PLAYER EX \/ 会場別適性】/gu) ?? []).length;
  const wrongVenueCount = [...combinedMaterial.matchAll(/^- 対象会場: .*?\(([^)]+)\)/gmu)]
    .filter((match) => normalizeVenueKey(match[1]) !== target.venueKey).length;
  const exactRegistrationCount = races.reduce((count, race) => count + (race.registrationNos?.length ?? 0), 0);
  const missingRegistrationCount = races.reduce((count, race) => {
    if (!race.material) return count + (race.registrationNos?.length ?? 0);
    return count + (race.registrationNos ?? []).filter(
      (registrationNo) => !race.material.includes(`登録番号: ${registrationNo}`),
    ).length;
  }, 0);
  return {
    venue: target.venue,
    venueKey: target.venueKey,
    raceRange: `${target.raceNos[0]}-${target.raceNos.at(-1)}`,
    expectedRaceCount: target.raceNos.length,
    foundRaceCount,
    suitabilityBlockCount,
    exactRegistrationCount,
    missingRegistrationCount,
    wrongVenueCount,
  };
});
for (const audit of rangeAudits) {
  assert(audit.foundRaceCount === audit.expectedRaceCount, `${audit.venue}: range race identity mismatch`);
  assert(audit.suitabilityBlockCount === audit.expectedRaceCount, `${audit.venue}: range suitability block mismatch`);
  assert(audit.missingRegistrationCount === 0, `${audit.venue}: range registration identity mismatch`);
  assert(audit.wrongVenueCount === 0, `${audit.venue}: range venue identity mismatch`);
}

const formatterLeakageTerms = leakageTerms.filter((term) => formatterSource.includes(term));
assert(formatterLeakageTerms.length === 0, `current race leakage terms in formatter: ${formatterLeakageTerms.join(", ")}`);

const report = {
  date: today.date,
  venueCount: today.venues?.length ?? 0,
  raceCount: raceAudit.length,
  starterCount,
  officialRegistrationCount,
  exactRiderCount,
  currentVenueItemCount,
  lowSampleCount,
  limitedCount,
  bestReferenceCount,
  weakReferenceCount,
  unavailableCount: starterCount - currentVenueItemCount + unavailableCount,
  duplicateRiderCount,
  duplicateVenueItemCount,
  otherVenueWouldBeSelectedCount,
  maxEstimatedMaterialChars,
  maxRenderedMaterialChars,
  auditedSingleRaceMaterialCount,
  duplicateSuitabilityBlockCount,
  singleRaceRiderMismatchCount,
  singleRaceVenueMismatchCount,
  singleRaceLeakageCount,
  resultLeakageCount,
  payoutLeakageCount,
  kimariteLeakageCount,
  rangeAudits,
  fixtureResults: fixtures,
  formatterLeakageTerms,
  issueCount: issues.length,
  issues: issues.slice(0, 50),
  sampleRaces: raceAudit.slice(0, 3),
};
console.log(JSON.stringify(report, null, 2));
if (issues.length > 0) process.exitCode = 1;
