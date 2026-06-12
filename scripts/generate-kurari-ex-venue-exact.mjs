import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  countMetric,
  exactOutputRoot as defaultExactOutputRoot,
  rateMetric,
  readKurariExRaces,
  serializeJson,
  writeJson,
} from "./kurari-ex-history-common.mjs";

const args = process.argv.slice(2);
const getArg = (name, fallback = "") => (
  args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1)
  ?? fallback
);
const source = getArg("--source", "history");
const exactOutputRoot = path.resolve(getArg("--output-root", defaultExactOutputRoot));
const baselineRoot = path.resolve(getArg("--baseline-root", defaultExactOutputRoot));
const requestedGeneratedAt = getArg("--generated-at");

async function readBaseline(relativePath) {
  if (source !== "history") return null;
  try {
    return JSON.parse(await readFile(path.join(baselineRoot, relativePath), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function mergeRateMetric(baseline, increment) {
  const count = (baseline?.count ?? 0) + (increment?.count ?? 0);
  const total = (baseline?.total ?? 0) + (increment?.total ?? 0);
  return {
    count,
    total,
    rate: total ? Number(((count / total) * 100).toFixed(1)) : null,
    sourceType: "EXACT",
    quality: total > 0 && total < 5 ? "low-sample" : "ok",
  };
}

// Legacy FACTS omit the B rider. Keep their exact baseline and add only newer,
// B-aware daily FACTS so history generation does not erase a published metric.
function preserveBRiderMetrics(target, baseline, races) {
  if (!target || !baseline) return;
  const newRaces = races.filter((race) => race.date > (baseline.period?.to ?? ""));
  const increment = aggregate(newRaces, target.generatedAt);
  if (baseline.racePattern?.bRiderInsideTop3Rate) {
    target.racePattern.bRiderInsideTop3Rate = mergeRateMetric(
      baseline.racePattern.bRiderInsideTop3Rate,
      increment.racePattern.bRiderInsideTop3Rate,
    );
  }
  for (const [dimension, groups] of Object.entries(target.dimensions ?? {})) {
    for (const [bucket, value] of Object.entries(groups)) {
      const baselineMetric = baseline.dimensions?.[dimension]?.[bucket]
        ?.racePattern?.bRiderInsideTop3Rate;
      if (baselineMetric) {
        value.racePattern.bRiderInsideTop3Rate = mergeRateMetric(
          baselineMetric,
          increment.dimensions?.[dimension]?.[bucket]
            ?.racePattern?.bRiderInsideTop3Rate,
        );
      }
    }
  }
}

function aggregatePredictionKpi(races) {
  const eligibleRaces = races.filter(
    (race) =>
      (race.predictionEnrichment?.status === "matched"
        || race.quality?.predictionParsed === true)
      && race.quality?.predictionParsed === true,
  );
  return {
    trifectaHitRate: rateMetric(eligibleRaces.map((race) => race.evaluation.trifectaHit)),
    exactaHitRate: rateMetric(eligibleRaces.map((race) => race.evaluation.exactaHit)),
    anyHitRate: rateMetric(eligibleRaces.map((race) => race.evaluation.anyHit)),
    exactaSalvageRate: rateMetric(eligibleRaces.map((race) => race.evaluation.exactaSalvage)),
    thirdOnlyMissRate: rateMetric(eligibleRaces.map((race) => race.evaluation.thirdOnlyMiss)),
    headMissRate: rateMetric(eligibleRaces.map((race) => race.evaluation.headMiss)),
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
  const { races, errors } = await readKurariExRaces(source);
  if (errors.length) throw new Error(`${source} contains ${errors.length} parse errors`);
  if (!races.length) throw new Error(`no ${source} races found`);

  const generatedAt = requestedGeneratedAt || new Date().toISOString();
  const venueGroups = new Map();
  for (const race of races) {
    const current = venueGroups.get(race.venueKey) ?? [];
    current.push(race);
    venueGroups.set(race.venueKey, current);
  }
  const baselinePayloads = new Map();
  if (source === "history") {
    const relativePaths = [
      "global/prediction-kpi.generated.json",
      ...[...venueGroups.keys()].map((venueKey) => `venues/${venueKey}.generated.json`),
    ];
    for (const relativePath of relativePaths) {
      baselinePayloads.set(relativePath, await readBaseline(relativePath));
    }
  }

  await Promise.all([
    rm(path.join(exactOutputRoot, "venues"), { recursive: true, force: true }),
    rm(path.join(exactOutputRoot, "global"), { recursive: true, force: true }),
    rm(path.join(exactOutputRoot, "index.generated.json"), { force: true }),
    rm(path.join(exactOutputRoot, "status.generated.json"), { force: true }),
  ]);
  await mkdir(path.join(exactOutputRoot, "venues"), { recursive: true });
  const files = [];
  let warningCount = 0;
  for (const [venueKey, venueRaces] of [...venueGroups.entries()].sort()) {
    const aggregatePayload = aggregate(venueRaces, generatedAt);
    preserveBRiderMetrics(
      aggregatePayload,
      baselinePayloads.get(`venues/${venueKey}.generated.json`),
      venueRaces,
    );
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
  preserveBRiderMetrics(
    globalAggregate,
    baselinePayloads.get("global/prediction-kpi.generated.json"),
    races,
  );
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
      content: null,
    })),
  ];
  for (const file of outputFiles.filter((item) => item.content == null)) {
    file.content = await readFile(path.join(exactOutputRoot, file.relativePath), "utf8");
  }
  const status = {
    schemaVersion: 1,
    generatedAt,
    sourceType: "EXACT",
    normalizedRaceCount: races.length,
    source: `${source}-history`,
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
  console.log(`source: ${source}`);
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
