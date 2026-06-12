import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  collectFiles,
  evaluateRace,
  projectRoot,
  rateMetric,
} from "./kurari-ex-history-common.mjs";

const historyRoot = path.join(
  projectRoot,
  "public",
  "data",
  "analytics",
  "kurari-ex",
  "history",
);
const globalExactFile = path.join(
  projectRoot,
  "public",
  "data",
  "analytics",
  "kurari-ex",
  "exact",
  "global",
  "prediction-kpi.generated.json",
);
const metricNames = [
  "trifectaHitRate",
  "exactaHitRate",
  "anyHitRate",
  "exactaSalvageRate",
  "thirdOnlyMissRate",
];

async function readCompactRaces() {
  const files = await collectFiles(
    path.join(historyRoot, "daily"),
    (file) => file.endsWith(".generated.json"),
  );
  const races = [];
  for (const file of files) {
    const payload = JSON.parse(await readFile(file, "utf8"));
    races.push(...(payload.items ?? []));
  }
  return races;
}

function aggregatePredictionKpi(races) {
  const eligibleRaces = races.filter(
    (race) =>
      (race.predictionEnrichment?.status === "matched"
        || race.quality?.predictionParsed === true)
      && race.quality?.predictionParsed === true,
  );
  const evaluations = eligibleRaces.map((race) => evaluateRace(
    race.result,
    {
      trifectaTickets: race.prediction?.trifectaTickets ?? [],
      exactaTickets: race.prediction?.exactaTickets ?? [],
    },
    race.lineup,
  ).evaluation);
  return {
    trifectaHitRate: rateMetric(evaluations.map((value) => value.trifectaHit)),
    exactaHitRate: rateMetric(evaluations.map((value) => value.exactaHit)),
    anyHitRate: rateMetric(evaluations.map((value) => value.anyHit)),
    exactaSalvageRate: rateMetric(evaluations.map((value) => value.exactaSalvage)),
    thirdOnlyMissRate: rateMetric(evaluations.map((value) => value.thirdOnlyMiss)),
  };
}

async function main() {
  const [races, expected] = await Promise.all([
    readCompactRaces(),
    readFile(globalExactFile, "utf8").then(JSON.parse),
  ]);
  const actual = {
    raceCount: races.length,
    predictionParsedCount: races.filter((race) => race.quality?.predictionParsed).length,
    resultParsedCount: races.filter((race) => race.quality?.resultParsed).length,
    lineupParsedCount: races.filter((race) => race.quality?.lineupParsed).length,
    predictionKpi: aggregatePredictionKpi(races),
  };
  const expectedCoverage = {
    raceCount: expected.coverage.normalizedRaces,
    predictionParsedCount: expected.coverage.predictionParsed,
    resultParsedCount: expected.coverage.resultParsed,
    lineupParsedCount: expected.coverage.lineupParsed,
  };
  const differences = [];
  for (const key of Object.keys(expectedCoverage)) {
    if (actual[key] !== expectedCoverage[key]) {
      differences.push({
        field: key,
        expected: expectedCoverage[key],
        actual: actual[key],
        difference: actual[key] - expectedCoverage[key],
      });
    }
  }
  for (const metricName of metricNames) {
    const expectedMetric = expected.predictionKpi?.[metricName];
    if (!expectedMetric) continue;
    const actualMetric = actual.predictionKpi[metricName];
    for (const field of ["count", "total"]) {
      if (actualMetric[field] !== expectedMetric[field]) {
        differences.push({
          field: `${metricName}.${field}`,
          expected: expectedMetric[field],
          actual: actualMetric[field],
          difference: actualMetric[field] - expectedMetric[field],
        });
      }
    }
    if (actualMetric.rate !== expectedMetric.rate) {
      differences.push({
        field: `${metricName}.rate`,
        expected: expectedMetric.rate,
        actual: actualMetric.rate,
        difference: actualMetric.rate == null || expectedMetric.rate == null
          ? null
          : Number((actualMetric.rate - expectedMetric.rate).toFixed(1)),
      });
    }
  }

  console.log("[kurari-ex compact history replay]");
  console.log(`races: ${actual.raceCount}`);
  console.log(`prediction parsed: ${actual.predictionParsedCount}`);
  console.log(`result parsed: ${actual.resultParsedCount}`);
  console.log(`lineup parsed: ${actual.lineupParsedCount}`);
  console.log(`differences: ${differences.length}`);
  for (const difference of differences) {
    console.error(
      `MISMATCH ${difference.field}: expected=${difference.expected} actual=${difference.actual} difference=${difference.difference}`,
    );
  }
  if (differences.length) {
    console.error("FACTS may be missing structured result, ticket, lineup, or quality fields.");
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[kurari-ex compact history replay] failed");
  console.error(error);
  process.exitCode = 1;
});
