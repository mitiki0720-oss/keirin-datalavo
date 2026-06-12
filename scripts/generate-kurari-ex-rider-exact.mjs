import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import {
  rateMetric,
  readNormalizedRaces,
  relativeProjectPath,
  writeJson,
} from "./kurari-ex-history-common.mjs";
import {
  isCompleteStarterArray,
  loadRiderIdentitySources,
  resolveLineupRole,
  resolveRiderIdentity,
  riderExactRoot,
} from "./kurari-ex-rider-common.mjs";

function emptyAggregate() {
  return {
    starts: 0,
    wins: 0,
    seconds: 0,
    thirds: 0,
    resultParsedCount: 0,
    escapeWins: 0,
    sprintWins: 0,
    differenceWins: 0,
  };
}

function addObservation(aggregate, observation) {
  aggregate.starts += 1;
  if (observation.resultParsed) aggregate.resultParsedCount += 1;
  if (observation.placement === 1) aggregate.wins += 1;
  if (observation.placement === 2) aggregate.seconds += 1;
  if (observation.placement === 3) aggregate.thirds += 1;
  if (observation.placement === 1 && observation.winningMethod === "逃") {
    aggregate.escapeWins += 1;
  }
  if (observation.placement === 1 && observation.winningMethod === "捲") {
    aggregate.sprintWins += 1;
  }
  if (observation.placement === 1 && observation.winningMethod === "差") {
    aggregate.differenceWins += 1;
  }
}

function unavailableMetric(count) {
  return {
    count,
    total: null,
    rate: null,
    sourceType: "EXACT",
    quality: "unavailable",
  };
}

function summarizeAggregate(aggregate, key = {}) {
  const podiums = aggregate.wins + aggregate.seconds + aggregate.thirds;
  const completeResults = aggregate.resultParsedCount === aggregate.starts;
  const outside = completeResults ? aggregate.starts - podiums : null;
  return {
    ...key,
    starts: aggregate.starts,
    wins: aggregate.wins,
    seconds: aggregate.seconds,
    thirds: aggregate.thirds,
    outside,
    winRate: completeResults
      ? rateMetric([
          ...Array(aggregate.wins).fill(true),
          ...Array(aggregate.starts - aggregate.wins).fill(false),
        ])
      : unavailableMetric(aggregate.wins),
    top2Rate: completeResults
      ? rateMetric([
          ...Array(aggregate.wins + aggregate.seconds).fill(true),
          ...Array(aggregate.starts - aggregate.wins - aggregate.seconds).fill(false),
        ])
      : unavailableMetric(aggregate.wins + aggregate.seconds),
    top3Rate: completeResults
      ? rateMetric([
          ...Array(podiums).fill(true),
          ...Array(outside).fill(false),
        ])
      : unavailableMetric(podiums),
    sourceType: "EXACT",
  };
}

function aggregateBy(observations, selector, keyBuilder) {
  const groups = new Map();
  for (const observation of observations) {
    const key = selector(observation);
    if (!key) continue;
    const aggregate = groups.get(key) ?? emptyAggregate();
    addObservation(aggregate, observation);
    groups.set(key, aggregate);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, aggregate]) => summarizeAggregate(aggregate, keyBuilder(key, observations)));
}

function buildRoleMetric(observations, role) {
  const roleObservations = observations.filter((item) => item.role === role);
  if (!roleObservations.length) return null;
  const aggregate = emptyAggregate();
  for (const observation of roleObservations) addObservation(aggregate, observation);
  const metric = summarizeAggregate(aggregate);
  if (role === "bante") {
    metric.differenceWinRate = rateMetric(
      roleObservations.map(
        (item) => item.placement === 1 && item.winningMethod === "差",
      ),
    );
  }
  return metric;
}

function qualityFor(observations) {
  if (!observations.length) return "identity-only";
  if (observations.length < 5) return "low-sample";
  const completeResults = observations.every((item) => item.resultParsed);
  const roleEligible = observations.every((item) => item.roleEligible);
  return completeResults && roleEligible ? "complete" : "partial";
}

async function main() {
  const [{ races, errors }, identitySources] = await Promise.all([
    readNormalizedRaces(),
    loadRiderIdentitySources(),
  ]);
  if (errors.length) {
    throw new Error(`normalized JSONL contains ${errors.length} parse errors`);
  }

  const observationsByRider = new Map();
  for (const race of races) {
    if (!isCompleteStarterArray(race)) continue;
    for (const starter of race.starters) {
      const identity = resolveRiderIdentity(starter, identitySources);
      if (!identity.registrationNo || ["unresolved", "ambiguous"].includes(identity.status)) {
        continue;
      }
      const placement = ["first", "second", "third"]
        .findIndex((key) => race.result?.[key]?.carNo === starter.carNo) + 1;
      const observations = observationsByRider.get(identity.registrationNo) ?? {
        identity,
        observations: [],
      };
      observations.observations.push({
        date: race.date,
        venueKey: race.venueKey,
        venueName: race.venueName,
        timeslot: race.timeslot || "unknown",
        raceClass: race.raceClass || "unknown",
        resultParsed: race.quality?.resultParsed === true,
        placement: placement || null,
        winningMethod: placement === 1 ? race.result.first.winningMethod : "",
        role: resolveLineupRole(race, starter.carNo),
        roleEligible: resolveLineupRole(race, starter.carNo) != null,
      });
      observationsByRider.set(identity.registrationNo, observations);
    }
  }

  if (!observationsByRider.size) {
    throw new Error("no safely resolved riders with confirmed starts");
  }

  await rm(riderExactRoot, { recursive: true, force: true });
  await mkdir(path.join(riderExactRoot, "by-tail"), { recursive: true });
  const generatedAt = new Date().toISOString();
  const indexItems = [];
  const qualityCounts = {
    complete: 0,
    partial: 0,
    "low-sample": 0,
    "identity-only": 0,
  };
  let totalBytes = 0;
  let maxFileBytes = 0;

  for (const [registrationNo, entry] of [...observationsByRider.entries()].sort()) {
    const { identity, observations } = entry;
    const dates = observations.map((item) => item.date).filter(Boolean).sort();
    const overallAggregate = emptyAggregate();
    for (const observation of observations) addObservation(overallAggregate, observation);
    const roleEligibleCount = observations.filter((item) => item.roleEligible).length;
    const quality = qualityFor(observations);
    qualityCounts[quality] += 1;
    const card = identity.card;
    const payload = {
      schemaVersion: 1,
      registrationNo,
      name: card?.name ?? identity.name,
      nameKey: identity.nameKey,
      sourceType: "EXACT",
      generatedAt,
      period: { from: dates[0] ?? null, to: dates.at(-1) ?? null },
      identity: {
        status: identity.status,
        registrationNoResolved: true,
      },
      coverage: {
        observedRaceCount: observations.length,
        confirmedStartCount: observations.length,
        resultParsedCount: observations.filter((item) => item.resultParsed).length,
        roleEligibleCount,
        venueCount: new Set(observations.map((item) => item.venueKey)).size,
      },
      overall: summarizeAggregate(overallAggregate),
      winningMethods: {
        escape: {
          count: overallAggregate.escapeWins,
          total: overallAggregate.wins,
          rate: overallAggregate.wins
            ? Number(((overallAggregate.escapeWins / overallAggregate.wins) * 100).toFixed(1))
            : null,
          sourceType: "EXACT",
        },
        sprint: {
          count: overallAggregate.sprintWins,
          total: overallAggregate.wins,
          rate: overallAggregate.wins
            ? Number(((overallAggregate.sprintWins / overallAggregate.wins) * 100).toFixed(1))
            : null,
          sourceType: "EXACT",
        },
        difference: {
          count: overallAggregate.differenceWins,
          total: overallAggregate.wins,
          rate: overallAggregate.wins
            ? Number(((overallAggregate.differenceWins / overallAggregate.wins) * 100).toFixed(1))
            : null,
          sourceType: "EXACT",
        },
      },
      byVenue: aggregateBy(
        observations,
        (item) => item.venueKey,
        (venueKey, source) => ({
          venueKey,
          venueName: source.find((item) => item.venueKey === venueKey)?.venueName ?? "",
        }),
      ),
      byTimeslot: aggregateBy(
        observations,
        (item) => item.timeslot,
        (timeslot) => ({ timeslot }),
      ),
      byClass: aggregateBy(
        observations,
        (item) => item.raceClass,
        (raceClass) => ({ raceClass }),
      ),
      byRole: {
        front: buildRoleMetric(observations, "front"),
        bante: buildRoleMetric(observations, "bante"),
        third: buildRoleMetric(observations, "third"),
        single: buildRoleMetric(observations, "single"),
      },
      quality,
      warnings: [
        ...(observations.length < 5 ? ["confirmedStartCount below 5"] : []),
        ...(roleEligibleCount < observations.length ? ["role unavailable for some starts"] : []),
      ],
    };
    const tail = registrationNo.slice(-2);
    const relativeFile = `by-tail/${tail}/${registrationNo}.generated.json`;
    const file = path.join(riderExactRoot, relativeFile);
    await writeJson(file, payload);
    const bytes = (await stat(file)).size;
    totalBytes += bytes;
    maxFileBytes = Math.max(maxFileBytes, bytes);
    indexItems.push({
      registrationNo,
      name: payload.name,
      nameKey: payload.nameKey,
      prefecture: card?.prefecture ?? "",
      class: card?.class ?? card?.grade ?? "",
      file: `/data/analytics/kurari-ex/exact/riders/${relativeFile}`,
      observedRaceCount: observations.length,
      confirmedStartCount: observations.length,
      roleEligibleCount,
      quality,
    });
  }

  const allDates = [...observationsByRider.values()]
    .flatMap((entry) => entry.observations.map((item) => item.date))
    .filter(Boolean)
    .sort();
  const index = {
    schemaVersion: 1,
    generatedAt,
    sourceType: "EXACT",
    riderCount: indexItems.length,
    period: { from: allDates[0] ?? null, to: allDates.at(-1) ?? null },
    items: indexItems,
  };
  await writeJson(path.join(riderExactRoot, "index.generated.json"), index);
  const indexBytes = (await stat(path.join(riderExactRoot, "index.generated.json"))).size;
  totalBytes += indexBytes;

  const status = {
    schemaVersion: 1,
    generatedAt,
    sourceType: "EXACT",
    normalizedRaceCount: races.length,
    riderCount: indexItems.length,
    qualityCounts,
    outputFileCount: indexItems.length + 2,
    outputBytes: totalBytes,
    maxFileBytes,
    source: "normalized-history",
  };
  await writeJson(path.join(riderExactRoot, "status.generated.json"), status);
  status.outputBytes += (await stat(path.join(riderExactRoot, "status.generated.json"))).size;
  await writeJson(path.join(riderExactRoot, "status.generated.json"), status);

  console.log("[kurari-ex rider exact generate]");
  console.log(`riders: ${indexItems.length}`);
  console.log(`period: ${index.period.from} to ${index.period.to}`);
  console.log(`quality: ${JSON.stringify(qualityCounts)}`);
  console.log(`output: ${(status.outputBytes / 1024).toFixed(1)} KB`);
  console.log(`max file: ${(maxFileBytes / 1024).toFixed(1)} KB`);
  console.log(`root: ${relativeProjectPath(riderExactRoot)}`);
}

main().catch((error) => {
  console.error("[kurari-ex rider exact generate] failed");
  console.error(error);
  process.exitCode = 1;
});
