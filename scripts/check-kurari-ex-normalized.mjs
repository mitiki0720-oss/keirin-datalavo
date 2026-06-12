import path from "node:path";
import {
  normalizedRoot,
  readNormalizedRaces,
  venueMap,
  writeJson,
} from "./kurari-ex-history-common.mjs";

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/u.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

async function main() {
  const { races, errors } = await readNormalizedRaces();
  const raceKeys = new Set();
  const duplicateKeys = [];
  const unresolvedVenueKeys = [];
  const warnings = [...errors.map((message) => ({ level: "error", message }))];

  for (const race of races) {
    if (raceKeys.has(race.raceKey)) duplicateKeys.push(race.raceKey);
    raceKeys.add(race.raceKey);
    if (!venueMap[race.venueKey]) unresolvedVenueKeys.push(race.raceKey);
    if (!isValidDate(race.date)) warnings.push({ level: "error", raceKey: race.raceKey, message: "invalid date" });
    if (!Number.isInteger(race.raceNumber) || race.raceNumber < 1 || race.raceNumber > 12) {
      warnings.push({ level: "error", raceKey: race.raceKey, message: "invalid race number" });
    }
    if (
      race.result.trifecta.combination
      && !/^\d+-\d+-\d+$/u.test(race.result.trifecta.combination)
    ) {
      warnings.push({ level: "warning", raceKey: race.raceKey, message: "invalid trifecta result format" });
    }
    if (
      race.result.exacta.combination
      && !/^\d+-\d+$/u.test(race.result.exacta.combination)
    ) {
      warnings.push({ level: "warning", raceKey: race.raceKey, message: "invalid exacta result format" });
    }
    if (!race.quality.lineupParsed) warnings.push({ level: "warning", raceKey: race.raceKey, message: "lineup not parsed" });
    if (!race.quality.predictionParsed) warnings.push({ level: "warning", raceKey: race.raceKey, message: "prediction not parsed" });
    if (!race.quality.resultParsed) warnings.push({ level: "warning", raceKey: race.raceKey, message: "result not parsed" });
  }

  const dates = races.map((race) => race.date).filter(isValidDate).sort();
  const audit = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    raceCount: races.length,
    dateFrom: dates[0] ?? null,
    dateTo: dates.at(-1) ?? null,
    venueCount: new Set(races.map((race) => race.venueKey)).size,
    duplicateRaceKeyCount: duplicateKeys.length,
    unresolvedVenueKeyCount: unresolvedVenueKeys.length,
    summaryMissingCount: races.filter((race) => !race.quality.summaryFound).length,
    predictionMissingCount: races.filter((race) => !race.quality.predictionFound).length,
    resultMissingCount: races.filter((race) => !race.quality.resultFound).length,
    lineupParsedCount: races.filter((race) => race.quality.lineupParsed).length,
    lineupMissingCount: races.filter((race) => !race.quality.lineupParsed).length,
    resultParsedCount: races.filter((race) => race.quality.resultParsed).length,
    predictionParsedCount: races.filter((race) => race.quality.predictionParsed).length,
    evaluationAvailableCount: races.filter((race) => race.evaluation.anyHit != null).length,
    trifectaHitAvailableCount: races.filter((race) => race.evaluation.trifectaHit != null).length,
    exactaHitAvailableCount: races.filter((race) => race.evaluation.exactaHit != null).length,
    thirdOnlyMissAvailableCount: races.filter((race) => race.evaluation.thirdOnlyMiss != null).length,
    headMissAvailableCount: races.filter((race) => race.evaluation.headMiss != null).length,
    sameLineAvailableCount: races.filter((race) => race.derived.sameLineTop2 != null).length,
    weatherAvailableCount: races.filter(
      (race) => race.weather.condition || race.weather.windSpeedMps != null,
    ).length,
    warningCount: warnings.length,
    errors: {
      jsonl: errors,
      duplicateRaceKeys: duplicateKeys,
      unresolvedVenueKeys,
    },
    warnings,
  };
  await writeJson(path.join(normalizedRoot, "audit.generated.json"), audit);

  console.log("[kurari-ex normalized check]");
  for (const key of [
    "raceCount",
    "dateFrom",
    "dateTo",
    "venueCount",
    "duplicateRaceKeyCount",
    "unresolvedVenueKeyCount",
    "predictionParsedCount",
    "resultParsedCount",
    "lineupParsedCount",
    "warningCount",
  ]) {
    console.log(`${key}: ${audit[key]}`);
  }

  if (errors.length || duplicateKeys.length || unresolvedVenueKeys.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[kurari-ex normalized check] failed");
  console.error(error);
  process.exitCode = 1;
});
