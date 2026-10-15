import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { compactHistoryRoot, normalizeVenueName } from "./kurari-ex-history-common.mjs";
import { compareExplicitFinishOrder, explicitFinishRank } from "./kurari-ex-official-finish.mjs";
import { loadRiderIdentitySources, normalizeRiderName } from "./kurari-ex-rider-common.mjs";

const rootArg = process.argv.find((arg) => arg.startsWith("--root="))?.slice(7);
if (!rootArg) throw new Error("--root=<isolated candidate history directory> is required");
const root = path.resolve(rootArg);
const getArg = (name) => process.argv.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);
const baselineRoot = path.resolve(getArg("--baseline-root") ?? compactHistoryRoot);
const incrementalDay = getArg("--baseline-root") ? "2026-10-13" : "2026-10-12";
const riderRoot = path.resolve(getArg("--rider-root") ?? path.join(root, "riders"));
const matchupRoot = path.resolve(getArg("--matchup-root") ?? path.join(root, "exact", "matchups"));
const venueRoot = path.resolve(getArg("--venue-root") ?? path.join(root, "exact"));
const analysisRoot = path.resolve(getArg("--analysis-root") ?? path.join(root, "analysis"));
const json = async (file) => JSON.parse(await readFile(file, "utf8"));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const dailyPath = (base, date) => path.join(base, "daily", date.slice(0, 7), `${date}.generated.json`);

async function main() {
  const [baseline, index, audit, riders, venue, matchups, oldRiders, identitySources, riderScore, riderCategory] = await Promise.all([
    json(path.join(baselineRoot, "index.generated.json")),
    json(path.join(root, "index.generated.json")),
    json(path.join(root, "official-increment-audit.json")),
    json(path.join(riderRoot, "index.generated.json")),
    json(path.join(venueRoot, "index.generated.json")),
    json(path.join(matchupRoot, "index.generated.json")),
    json(path.join(compactHistoryRoot, "..", "exact", "riders", "index.generated.json")),
    loadRiderIdentitySources(),
    json(path.join(analysisRoot, "rider-score.generated.json")),
    json(path.join(analysisRoot, "rider-category-analysis.generated.json")),
  ]);
  assert.equal(baseline.raceCount, incrementalDay === "2026-10-13" ? 11141 : 10490);
  assert.equal(index.period.to, incrementalDay);
  assert.equal(index.raceCount, incrementalDay === "2026-10-13" ? 11201 : 11141);
  assert.equal(index.dayCount, baseline.dayCount + (incrementalDay === "2026-10-13" ? 1 : 9));
  assert.equal(index.items.length, index.dayCount);
  assert.equal(riders.period.to, incrementalDay);
  assert.equal(venue.period.to, incrementalDay);
  assert.equal(matchups.period.to, incrementalDay);
  assert.equal(riderScore.period.to, incrementalDay);
  assert.equal(riderScore.riderCount, riders.riderCount);
  assert.equal(riderCategory.coverage.riderFilesRead, riders.riderCount);
  assert.equal(riderCategory.coverage.riderFilesSkipped, 0);

  const keys = new Set();
  let baselineRaceCount = 0;
  for (const item of baseline.items) {
    const original = await readFile(dailyPath(baselineRoot, item.date));
    const candidate = await readFile(dailyPath(root, item.date));
    assert.equal(hash(candidate), hash(original), `baseline daily changed: ${item.date}`);
    const payload = JSON.parse(candidate.toString("utf8"));
    baselineRaceCount += payload.items.length;
    for (const race of payload.items) {
      assert(!keys.has(race.raceKey), `duplicate baseline raceKey: ${race.raceKey}`);
      keys.add(race.raceKey);
    }
  }
  assert.equal(baselineRaceCount, baseline.raceCount);
  let added = 0;
  let finished = 0;
  let cancelled = 0;
  let finishedRows = 0;
  let unknownRankRaces = 0;
  let tiedRaces = 0;
  let resultOnly = 0;
  let unknownRankRows = 0;
  let sourceMatchedRows = 0;
  let entryRows = 0;
  let registryMissingRows = 0;
  let identityConflicts = 0;
  const daily = [];
  for (const day of audit.days) {
    const payload = await json(dailyPath(root, day.date));
    assert.equal(payload.raceCount, day.raceCount);
    assert.equal(payload.items.length, day.raceCount);
    assert.equal(payload.settledRaceCount, day.confirmedCount);
    assert.equal(payload.cancelledRaceCount, day.cancelledCount);
    sourceMatchedRows += day.sourceMatchedRows;
    entryRows += day.entryRowCount;
    let dayRegistryMissing = 0;
    for (const race of payload.items) {
      assert(!keys.has(race.raceKey), `duplicate increment raceKey: ${race.raceKey}`);
      keys.add(race.raceKey);
      assert.equal(race.date, day.date);
      assert(race.date <= incrementalDay, "current-day leakage");
      assert.equal(race.sourceEvidence?.provider, "KEIRIN.JP");
      assert.equal(race.sourceEvidence?.result?.sha256, day.resultEvidence.sha256);
      assert.equal(race.sourceEvidence?.entry?.sha256, day.entryEvidence.sha256);
      assert.equal(race.sourceEvidence?.result?.actualFetchedAt, null);
      assert.equal(race.sourceEvidence?.entry?.actualFetchedAt, null);
      const cars = new Set();
      const regs = new Set();
      for (const starter of race.starters) {
        assert(/^\d{6}$/u.test(starter.registrationNo));
        assert(!cars.has(starter.carNo), `duplicate car: ${race.raceKey}`);
        assert(!regs.has(starter.registrationNo), `duplicate registration: ${race.raceKey}`);
        cars.add(starter.carNo);
        regs.add(starter.registrationNo);
        const card = identitySources.cardsByRegistrationNo.get(starter.registrationNo);
        if (!card) {
          registryMissingRows += 1;
          dayRegistryMissing += 1;
        } else if (normalizeRiderName(card.name) !== normalizeRiderName(starter.name)) {
          identityConflicts += 1;
        }
      }
      const finish = race.result.finishOrder;
      if (race.operationStatus === "cancelled") {
        cancelled += 1;
        assert.equal(race.result.status, "cancelled");
        assert.equal(finish.length, 0);
        assert.equal(race.quality.resultParsed, false);
        assert(race.sourceEvidence.cancellation?.url);
      } else {
        finished += 1;
        assert.equal(race.result.status, "finished");
        assert.equal(race.quality.resultParsed, true);
        if (race.predictionEnrichment.status === "missing"
          && !day.predictionSourceRaceCount) resultOnly += 1;
        const ranks = [];
        for (const row of finish) {
          const starter = race.starters.find((item) => item.carNo === row.carNo);
          assert(starter, `no entry for finisher: ${race.raceKey}`);
          assert.equal(row.registrationNo, starter.registrationNo);
          assert.equal(normalizeVenueName(row.name), normalizeVenueName(starter.name));
          const rank = explicitFinishRank(row);
          if (rank != null) ranks.push(rank);
          else unknownRankRows += 1;
        }
        unknownRankRaces += Number(finish.some((row) => row.rank == null));
        tiedRaces += Number(new Set(ranks).size !== ranks.length);
        if (ranks.length >= 2) {
          const [a, b] = finish.filter((row) => row.rank != null);
          const comparison = compareExplicitFinishOrder(race.result, a.carNo, b.carNo);
          assert(["a-ahead", "b-ahead", "unknown-order"].includes(comparison));
        }
        finishedRows += finish.length;
      }
      added += 1;
    }
    daily.push({ date: day.date, venues: day.venueCount, races: day.raceCount,
      confirmed: day.confirmedCount, fullyRanked: day.confirmedCount - day.unknownRankRaceCount,
      partiallyRanked: day.unknownRankRaceCount, ties: day.tiedRaceCount,
      cancelled: day.cancelledCount, entryRows: day.entryRowCount,
      officialResultRows: day.sourceMatchedRows, registryMissingRows: dayRegistryMissing,
      resultOnly: day.resultOnlyRaceCount, adopted: day.raceCount, held: 0 });
  }
  const expected = incrementalDay === "2026-10-13"
    ? { added: 60, finished: 60, cancelled: 0, finishedRows: 418,
      sourceMatchedRows: 418, entryRows: 418, tiedRaces: 1,
      unknownRankRaces: 5, resultOnly: 60 }
    : { added: 651, finished: 650, cancelled: 1, finishedRows: 4628,
      sourceMatchedRows: 4629, entryRows: 4635, tiedRaces: 8,
      unknownRankRaces: 47, resultOnly: 144 };
  for (const [key, value] of Object.entries(expected)) {
    assert.equal(({ added, finished, cancelled, finishedRows, sourceMatchedRows,
      entryRows, tiedRaces, unknownRankRaces, resultOnly })[key], value, key);
  }
  assert.equal(identityConflicts, 0);
  assert.equal(keys.size, baselineRaceCount + added);

  const oldSet = new Set(oldRiders.items.map((item) => item.registrationNo));
  const newSet = new Set(riders.items.map((item) => item.registrationNo));
  const removedRiders = [...oldSet].filter((no) => !newSet.has(no));
  const addedRiders = [...newSet].filter((no) => !oldSet.has(no));
  assert.equal(removedRiders.length, 0);
  let unevaluableStarts = 0;
  let evaluableStarts = 0;
  for (const item of riders.items) {
    const file = path.join(riderRoot, "by-tail", item.registrationNo.slice(-2), `${item.registrationNo}.generated.json`);
    const rider = await json(file);
    const coverage = rider.coverage;
    assert.equal(coverage.evaluableStartCount + coverage.unknownRankStartCount,
      coverage.observedRaceCount, `rider denominator mismatch: ${item.registrationNo}`);
    assert.equal(item.evaluableStartCount, coverage.evaluableStartCount);
    assert.equal(rider.overall.evaluableStarts, coverage.evaluableStartCount);
    assert.equal(rider.overall.unknownRankStarts, coverage.unknownRankStartCount);
    if (coverage.evaluableStartCount > 0) {
      assert.equal(rider.overall.outside, coverage.evaluableStartCount
        - rider.overall.wins - rider.overall.seconds - rider.overall.thirds);
      for (const field of ["winRate", "top2Rate", "top3Rate"]) {
        assert.equal(rider.overall[field].total, coverage.evaluableStartCount);
      }
    }
    for (const row of rider.recentForm ?? []) {
      assert([5, 10, 20].includes(row.windowSize));
      assert(row.sampleSize <= row.windowSize);
      assert((row.period.to ?? "") <= incrementalDay);
      if (row.sampleSize > 0) {
        assert.equal(row.wins + row.seconds + row.thirds + row.outside, row.sampleSize);
      }
    }
    for (const group of [...(rider.byVenue ?? []), ...(rider.byTimeslot ?? []),
      ...Object.values(rider.byRole ?? {}).filter(Boolean)]) {
      const evaluable = group.evaluableStarts ?? group.top3Rate.total ?? 0;
      assert(evaluable <= group.starts);
      assert.equal(group.top3Rate.total ?? 0, evaluable);
      if (evaluable > 0) assert.equal(group.wins + group.seconds + group.thirds + group.outside, evaluable);
    }
    evaluableStarts += coverage.evaluableStartCount;
    unevaluableStarts += coverage.unknownRankStartCount;
  }
  const summary = {
    baselineRaceCount, addedRaceCount: added, totalRaceCount: keys.size,
    finished, cancelled, finishedRows, sourceMatchedRows, entryRows,
    tiedRaces, unknownRankRaces, unknownRankRows,
    resultOnly, registryMissingRows, identityConflicts,
    riderBefore: oldRiders.riderCount, riderAfter: riders.riderCount,
    addedRiders, removedRiders, riderEvaluableStarts: evaluableStarts,
    riderUnknownRankStarts: unevaluableStarts,
    venueCount: venue.venueCount, matchupPairCount: matchups.distinctPairCount,
    riderScoreCount: riderScore.riderCount, riderCategoryRead: riderCategory.coverage.riderFilesRead,
    daily,
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
