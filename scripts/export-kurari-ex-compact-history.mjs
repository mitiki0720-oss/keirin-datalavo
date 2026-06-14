import { mkdir, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import {
  projectRoot,
  readNormalizedRaces,
  serializeJson,
  writeJson,
} from "./kurari-ex-history-common.mjs";
import { writeTextIfChanged } from "./lib/write-json-if-changed.mjs";

const historyRoot = path.join(
  projectRoot,
  "public",
  "data",
  "analytics",
  "kurari-ex",
  "history",
);
const dailyRoot = path.join(historyRoot, "daily");

function normalizeRegistrationNo(value) {
  const digits = String(value ?? "").replace(/\D/gu, "");
  return /^\d{6}$/u.test(digits) ? digits : null;
}

function compactStarter(starter) {
  const identityStatus = [
    "registration-no",
    "unique-player-card-name",
    "manual-override",
    "unresolved",
    "ambiguous",
  ].includes(starter?.identityStatus)
    ? starter.identityStatus
    : "unresolved";
  const registrationNo = ["unresolved", "ambiguous"].includes(identityStatus)
    ? null
    : normalizeRegistrationNo(starter?.registrationNo);
  return {
    carNo: starter?.carNo ?? null,
    name: String(starter?.name ?? "").trim(),
    registrationNo,
    identityStatus: registrationNo ? identityStatus : "unresolved",
  };
}

function compactPlacement(placement, includeWinningMethod = false) {
  return {
    carNo: placement?.carNo ?? null,
    name: String(placement?.name ?? "").trim(),
    ...(includeWinningMethod
      ? { winningMethod: String(placement?.winningMethod ?? "").trim() }
      : {}),
  };
}

function compactShbRider(rider) {
  const carNo = Number(rider?.carNo);
  if (!Number.isFinite(carNo) || carNo <= 0) return null;
  return {
    carNo,
    name: String(rider?.name ?? "").trim(),
  };
}

function compactRace(race) {
  const starters = [...(race.starters ?? [])]
    .map(compactStarter)
    .sort((left, right) => Number(left.carNo) - Number(right.carNo));
  const resultStatus = race.result?.status === "finished" ? "finished" : "unknown";
  const predictionMatched = race.quality?.predictionParsed === true;
  return {
    raceKey: race.raceKey,
    raceId: String(race.raceId ?? ""),
    date: race.date,
    venueKey: race.venueKey,
    venueName: race.venueName,
    raceNumber: race.raceNumber,
    grade: String(race.grade ?? ""),
    timeslot: String(race.timeslot ?? ""),
    raceClass: String(race.raceClass ?? ""),
    operationStatus: resultStatus,
    starters,
    lineup: {
      lines: race.lineup?.status === "parsed" ? race.lineup.lines : [],
      status: race.lineup?.status === "parsed" ? "parsed" : "missing",
    },
    weather: {
      condition: String(race.weather?.condition ?? ""),
      windDirection: String(race.weather?.windDirection ?? ""),
      windSpeedMps: race.weather?.windSpeedMps ?? null,
    },
    result: {
      status: resultStatus,
      first: compactPlacement(race.result?.first, true),
      second: compactPlacement(race.result?.second),
      third: compactPlacement(race.result?.third),
      trifecta: {
        combination: String(race.result?.trifecta?.combination ?? ""),
        payoutYen: race.result?.trifecta?.payoutYen ?? null,
      },
      exacta: {
        combination: String(race.result?.exacta?.combination ?? ""),
        payoutYen: race.result?.exacta?.payoutYen ?? null,
      },
      favoriteTrifecta: {
        combination: String(race.result?.favoriteTrifecta?.combination ?? ""),
        odds: race.result?.favoriteTrifecta?.odds ?? null,
      },
      ...(compactShbRider(race.result?.sRider)
        ? { sRider: compactShbRider(race.result.sRider) }
        : {}),
      ...(compactShbRider(race.result?.bRider)
        ? { bRider: compactShbRider(race.result.bRider) }
        : {}),
    },
    prediction: predictionMatched
      ? {
          trifectaTickets: [...new Set(race.prediction?.trifectaTickets ?? [])].sort(),
          exactaTickets: [...new Set(race.prediction?.exactaTickets ?? [])].sort(),
          confidence: String(race.prediction?.confidence ?? ""),
          raceType: String(race.prediction?.raceType ?? ""),
          tags: [...new Set(race.prediction?.tags ?? [])].sort(),
        }
      : null,
    predictionEnrichment: {
      status: predictionMatched ? "matched" : "missing",
      matchedBy: predictionMatched ? "raceId" : null,
    },
    quality: {
      resultParsed: race.quality?.resultParsed === true,
      predictionParsed: race.quality?.predictionParsed === true,
      lineupParsed: race.quality?.lineupParsed === true,
      starterParsed: starters.length > 0,
      warnings: [...new Set(race.quality?.warnings ?? [])].sort(),
    },
  };
}

async function removeStaleDailyFiles(expectedFiles) {
  async function visit(directory) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(target);
      if (entry.isFile() && !expectedFiles.has(target)) await unlink(target);
    }
  }
  await visit(dailyRoot);
}

async function main() {
  const { races, errors } = await readNormalizedRaces();
  if (errors.length) {
    throw new Error(`normalized JSONL contains ${errors.length} parse errors`);
  }
  const uniqueRaces = new Map();
  for (const race of races) uniqueRaces.set(race.raceKey, race);
  const compactRaces = [...uniqueRaces.values()]
    .map(compactRace)
    .sort((left, right) => (
      left.date.localeCompare(right.date)
      || left.venueKey.localeCompare(right.venueKey)
      || left.raceNumber - right.raceNumber
    ));
  const byDate = new Map();
  for (const race of compactRaces) {
    const current = byDate.get(race.date) ?? [];
    current.push(race);
    byDate.set(race.date, current);
  }

  await mkdir(dailyRoot, { recursive: true });
  const expectedFiles = new Set();
  const indexItems = [];
  let changedDailyFileCount = 0;
  let totalDailyBytes = 0;
  let maxDailyFileBytes = 0;
  for (const [date, items] of [...byDate.entries()].sort()) {
    const settledRaceCount = items.filter((race) => race.operationStatus === "finished").length;
    const cancelledRaceCount = items.filter((race) => race.operationStatus === "cancelled").length;
    const payload = {
      schemaVersion: 1,
      date,
      raceCount: items.length,
      settledRaceCount,
      cancelledRaceCount,
      predictionCoverage: {
        matchedRaceCount: items.filter(
          (race) => race.predictionEnrichment.status === "matched",
        ).length,
        totalRaceCount: items.length,
        coverageRate: Number((
          (items.filter((race) => race.predictionEnrichment.status === "matched").length
            / items.length)
          * 100
        ).toFixed(1)),
        status: items.filter((race) => race.predictionEnrichment.status === "matched").length
          / items.length >= 0.95
          ? "complete"
          : items.some((race) => race.predictionEnrichment.status === "matched")
            ? "partial"
            : "missing",
      },
      items,
    };
    const content = serializeJson(payload);
    const month = date.slice(0, 7);
    const file = path.join(dailyRoot, month, `${date}.generated.json`);
    expectedFiles.add(file);
    if (writeTextIfChanged(file, content).changed) changedDailyFileCount += 1;
    const bytes = Buffer.byteLength(content);
    totalDailyBytes += bytes;
    maxDailyFileBytes = Math.max(maxDailyFileBytes, bytes);
    indexItems.push({
      date,
      file: `/data/analytics/kurari-ex/history/daily/${month}/${date}.generated.json`,
      raceCount: items.length,
      settledRaceCount,
      cancelledRaceCount,
      bytes,
    });
  }
  await removeStaleDailyFiles(expectedFiles);

  const generatedAt = new Date().toISOString();
  const settledRaceCount = compactRaces.filter((race) => race.operationStatus === "finished").length;
  const cancelledRaceCount = compactRaces.filter((race) => race.operationStatus === "cancelled").length;
  const starterParsedCount = compactRaces.filter((race) => race.quality.starterParsed).length;
  const registrationResolvedStarterCount = compactRaces
    .flatMap((race) => race.starters)
    .filter((starter) => starter.registrationNo != null).length;
  const index = {
    schemaVersion: 1,
    generatedAt,
    period: {
      from: indexItems[0]?.date ?? null,
      to: indexItems.at(-1)?.date ?? null,
    },
    dayCount: indexItems.length,
    raceCount: compactRaces.length,
    settledRaceCount,
    cancelledRaceCount,
    totalBytes: totalDailyBytes,
    items: indexItems,
  };
  const indexResult = await writeJson(
    path.join(historyRoot, "index.generated.json"),
    index,
  );
  index.generatedAt = indexResult.value.generatedAt;
  const status = {
    schemaVersion: 1,
    generatedAt,
    source: "private-normalized-export",
    dayCount: indexItems.length,
    raceCount: compactRaces.length,
    settledRaceCount,
    cancelledRaceCount,
    starterParsedCount,
    lineupParsedCount: compactRaces.filter((race) => race.quality.lineupParsed).length,
    predictionParsedCount: compactRaces.filter((race) => race.quality.predictionParsed).length,
    resultParsedCount: compactRaces.filter((race) => race.quality.resultParsed).length,
    registrationResolvedStarterCount,
    totalBytes: totalDailyBytes,
    maxDailyFileBytes,
    warningCount: compactRaces.reduce((sum, race) => sum + race.quality.warnings.length, 0),
    prohibitedDetected: false,
  };
  const statusResult = await writeJson(
    path.join(historyRoot, "status.generated.json"),
    status,
  );

  console.log("[kurari-ex compact history export]");
  console.log(`days: ${status.dayCount}`);
  console.log(`period: ${index.period.from} to ${index.period.to}`);
  console.log(`races: ${status.raceCount}`);
  console.log(`settled: ${status.settledRaceCount}`);
  console.log(`cancelled: ${status.cancelledRaceCount}`);
  console.log(`daily files changed: ${changedDailyFileCount}`);
  console.log(`metadata files changed: ${Number(indexResult.changed) + Number(statusResult.changed)}`);
  console.log(`output: ${(totalDailyBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`max daily: ${(maxDailyFileBytes / 1024).toFixed(1)} KB`);
}

main().catch((error) => {
  console.error("[kurari-ex compact history export] failed");
  console.error(error);
  process.exitCode = 1;
});
