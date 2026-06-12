import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  countMetric,
  exactOutputRoot,
  rateMetric,
  readNormalizedRaces,
  serializeJson,
  writeJson,
} from "./kurari-ex-history-common.mjs";

function aggregatePredictionKpi(races) {
  return {
    trifectaHitRate: rateMetric(races.map((race) => race.evaluation.trifectaHit)),
    exactaHitRate: rateMetric(races.map((race) => race.evaluation.exactaHit)),
    anyHitRate: rateMetric(races.map((race) => race.evaluation.anyHit)),
    exactaSalvageRate: rateMetric(races.map((race) => race.evaluation.exactaSalvage)),
    thirdOnlyMissRate: rateMetric(races.map((race) => race.evaluation.thirdOnlyMiss)),
    headMissRate: rateMetric(races.map((race) => race.evaluation.headMiss)),
  };
}

function aggregateRacePattern(races) {
  return {
    escapeWinRate: countMetric(races.map((race) => race.derived.firstWinningMethod), (value) => value === "逃"),
    makuriWinRate: countMetric(races.map((race) => race.derived.firstWinningMethod), (value) => value === "捲"),
    sashiWinRate: countMetric(races.map((race) => race.derived.firstWinningMethod), (value) => value === "差"),
    sameLineTop2Rate: rateMetric(races.map((race) => race.derived.sameLineTop2)),
    sameLineTop3Rate: rateMetric(races.map((race) => race.derived.sameLineTop3)),
    otherLineThirdRate: rateMetric(races.map((race) => race.derived.otherLineThird)),
    singleThirdRate: rateMetric(races.map((race) => race.derived.singleThird)),
    bRiderInsideTop3Rate: rateMetric(races.map((race) => race.derived.bRiderInsideTop3)),
    favoriteTrifectaHitRate: rateMetric(races.map((race) => race.derived.favoriteTrifectaHit)),
  };
}

function classBucket(raceClass) {
  const value = String(raceClass ?? "").toUpperCase();
  if (/ガールズ|L級/u.test(value)) return "girls";
  if (/チャレンジ|A3/u.test(value)) return "a3";
  if (/S級/u.test(value)) return "s";
  if (/A級/u.test(value)) return "a";
  return "other";
}

function lineCountBucket(race) {
  const count = race.lineup.lineCount;
  if (count == null) return "unknown";
  if (count <= 2) return "2";
  if (count === 3) return "3";
  return "4+";
}

function windBucket(race) {
  const speed = race.weather.windSpeedMps;
  if (speed == null) return "unknown";
  if (speed < 2) return "0-2";
  if (speed < 4) return "2-4";
  return "4+";
}

function aggregateDimensions(races) {
  const definitions = {
    timeslot: (race) => race.timeslot || "unknown",
    raceClass: (race) => classBucket(race.raceClass),
    lineCount: lineCountBucket,
    windSpeedMps: windBucket,
  };
  return Object.fromEntries(
    Object.entries(definitions).map(([dimension, selector]) => {
      const groups = new Map();
      for (const race of races) {
        const key = selector(race);
        const current = groups.get(key) ?? [];
        current.push(race);
        groups.set(key, current);
      }
      return [
        dimension,
        Object.fromEntries(
          [...groups.entries()]
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, groupedRaces]) => [
              key,
              {
                raceCount: groupedRaces.length,
                predictionKpi: aggregatePredictionKpi(groupedRaces),
                racePattern: aggregateRacePattern(groupedRaces),
              },
            ]),
        ),
      ];
    }),
  );
}

function collectLowSampleWarnings(payload) {
  const warnings = [];
  function visit(value, pointer) {
    if (!value || typeof value !== "object") return;
    if (value.quality === "low-sample") {
      warnings.push(`${pointer}: low sample (${value.total})`);
    }
    for (const [key, child] of Object.entries(value)) {
      visit(child, pointer ? `${pointer}.${key}` : key);
    }
  }
  visit(payload, "");
  return warnings;
}

function aggregate(races, generatedAt) {
  const dates = races.map((race) => race.date).filter(Boolean).sort();
  const payload = {
    sourceType: "EXACT",
    generatedAt,
    period: { from: dates[0] ?? null, to: dates.at(-1) ?? null },
    coverage: {
      normalizedRaces: races.length,
      resultParsed: races.filter((race) => race.quality.resultParsed).length,
      predictionParsed: races.filter((race) => race.quality.predictionParsed).length,
      lineupParsed: races.filter((race) => race.quality.lineupParsed).length,
    },
    predictionKpi: aggregatePredictionKpi(races),
    racePattern: aggregateRacePattern(races),
    dimensions: aggregateDimensions(races),
  };
  return { ...payload, warnings: collectLowSampleWarnings(payload) };
}

async function main() {
  const { races, errors } = await readNormalizedRaces();
  if (errors.length) throw new Error(`normalized JSONL contains ${errors.length} parse errors`);
  if (!races.length) throw new Error("no normalized races found");

  const generatedAt = new Date().toISOString();
  const venueGroups = new Map();
  for (const race of races) {
    const current = venueGroups.get(race.venueKey) ?? [];
    current.push(race);
    venueGroups.set(race.venueKey, current);
  }

  await rm(exactOutputRoot, { recursive: true, force: true });
  await mkdir(path.join(exactOutputRoot, "venues"), { recursive: true });
  const files = [];
  let warningCount = 0;
  for (const [venueKey, venueRaces] of [...venueGroups.entries()].sort()) {
    const aggregatePayload = aggregate(venueRaces, generatedAt);
    const payload = {
      schemaVersion: 1,
      venueKey,
      venueName: venueRaces[0].venueName,
      ...aggregatePayload,
    };
    const relativePath = `venues/${venueKey}.generated.json`;
    await writeJson(path.join(exactOutputRoot, relativePath), payload);
    files.push(relativePath);
    warningCount += payload.warnings.length;
  }

  const globalAggregate = aggregate(races, generatedAt);
  const globalPayload = {
    schemaVersion: 1,
    ...globalAggregate,
  };
  const globalPath = "global/prediction-kpi.generated.json";
  await writeJson(path.join(exactOutputRoot, globalPath), globalPayload);
  files.unshift(globalPath);
  warningCount += globalPayload.warnings.length;

  const dates = races.map((race) => race.date).filter(Boolean).sort();
  const index = {
    schemaVersion: 1,
    generatedAt,
    sourceType: "EXACT",
    period: { from: dates[0] ?? null, to: dates.at(-1) ?? null },
    venueCount: venueGroups.size,
    normalizedRaceCount: races.length,
    files: [
      "/data/analytics/kurari-ex/exact/status.generated.json",
      ...files.map((file) => `/data/analytics/kurari-ex/exact/${file}`),
    ],
    warningCount,
  };
  await writeJson(path.join(exactOutputRoot, "index.generated.json"), index);

  const outputFiles = [
    { relativePath: "index.generated.json", content: serializeJson(index) },
    { relativePath: globalPath, content: serializeJson(globalPayload) },
    ...[...venueGroups.entries()].map(([venueKey, venueRaces]) => ({
      relativePath: `venues/${venueKey}.generated.json`,
      content: serializeJson({
        schemaVersion: 1,
        venueKey,
        venueName: venueRaces[0].venueName,
        ...aggregate(venueRaces, generatedAt),
      }),
    })),
  ];
  const status = {
    schemaVersion: 1,
    generatedAt,
    sourceType: "EXACT",
    normalizedRaceCount: races.length,
    venueCount: venueGroups.size,
    warningCount,
    outputFileCount: outputFiles.length + 1,
    outputBytes: outputFiles.reduce(
      (sum, file) => sum + Buffer.byteLength(file.content),
      0,
    ),
  };
  const statusContent = serializeJson(status);
  status.outputBytes += Buffer.byteLength(statusContent);
  await writeFile(
    path.join(exactOutputRoot, "status.generated.json"),
    serializeJson(status),
    "utf8",
  );

  console.log("[kurari-ex venue exact generate]");
  console.log(`races: ${races.length}`);
  console.log(`venues: ${venueGroups.size}`);
  console.log(`period: ${index.period.from} to ${index.period.to}`);
  console.log(`warnings: ${warningCount}`);
  console.log(`output: ${(status.outputBytes / 1024).toFixed(1)} KB`);
}

main().catch((error) => {
  console.error("[kurari-ex venue exact generate] failed");
  console.error(error);
  process.exitCode = 1;
});
