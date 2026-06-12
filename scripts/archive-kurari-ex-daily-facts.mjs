import path from "node:path";
import { pathToFileURL } from "node:url";
import { evaluateRace, projectRoot } from "./kurari-ex-history-common.mjs";
import {
  getArgValue,
  loadDailySource,
  predictionCoverageForRaces,
  readDailyPayload,
  rebuildHistoryMetadata,
  resolveJstDate,
  savedPredictionsPath,
  summarizeDailySource,
  todayFeedPath,
  writeArchiveStatus,
  writeDailyPayload,
} from "./kurari-ex-daily-common.mjs";

function inferredEnrichment(race) {
  if (race.predictionEnrichment) return race.predictionEnrichment;
  return race.quality?.predictionParsed === true
    ? { status: "matched", matchedBy: "raceId" }
    : { status: "missing", matchedBy: null };
}

function normalizeExistingRace(race) {
  const enrichment = inferredEnrichment(race);
  return {
    ...race,
    prediction: enrichment.status === "matched" ? race.prediction ?? null : null,
    predictionEnrichment: enrichment,
  };
}

function resultSignature(race) {
  return JSON.stringify({
    operationStatus: race.operationStatus,
    result: race.result ?? null,
  });
}

export function mergeDailyFacts(existingPayload, candidatePayload) {
  if (!existingPayload) return { payload: candidatePayload, changed: true, mode: "created" };
  const existingItems = (existingPayload.items ?? []).map(normalizeExistingRace);
  const candidateItems = candidatePayload.items ?? [];
  const existingKeys = existingItems.map((race) => race.raceKey).sort();
  const candidateKeys = candidateItems.map((race) => race.raceKey).sort();
  if (JSON.stringify(existingKeys) !== JSON.stringify(candidateKeys)) {
    throw new Error("existing FACTS raceKey set does not match current feed");
  }
  const candidateByKey = new Map(candidateItems.map((race) => [race.raceKey, race]));
  for (const existing of existingItems) {
    const candidate = candidateByKey.get(existing.raceKey);
    if (
      ["finished", "cancelled"].includes(existing.operationStatus)
      && !["finished", "cancelled"].includes(candidate.operationStatus)
    ) {
      throw new Error(`settled result would be overwritten by pending data: ${existing.raceKey}`);
    }
    if (
      ["finished", "cancelled"].includes(existing.operationStatus)
      && resultSignature(existing) !== resultSignature(candidate)
    ) {
      throw new Error(`settled result conflicts with current feed: ${existing.raceKey}`);
    }
  }
  const existingCoverage = existingPayload.predictionCoverage
    ?? predictionCoverageForRaces(existingItems);
  const candidateCoverage = candidatePayload.predictionCoverage;
  if (candidateCoverage.matchedRaceCount < existingCoverage.matchedRaceCount) {
    throw new Error(
      `prediction coverage would decrease from ${existingCoverage.matchedRaceCount} to ${candidateCoverage.matchedRaceCount}`,
    );
  }
  const mergedItems = existingItems.map((existing) => {
    const candidate = candidateByKey.get(existing.raceKey);
    if (
      candidate.predictionEnrichment?.status === "matched"
      && existing.predictionEnrichment?.status !== "matched"
    ) {
      return {
        ...existing,
        prediction: candidate.prediction,
        predictionEnrichment: candidate.predictionEnrichment,
        quality: {
          ...existing.quality,
          predictionParsed: candidate.quality?.predictionParsed === true,
          warnings: (existing.quality?.warnings ?? []).filter(
            (warning) => warning !== "saved prediction missing",
          ),
        },
      };
    }
    return existing;
  });
  const mergedCoverage = predictionCoverageForRaces(mergedItems);
  const payload = {
    ...existingPayload,
    predictionCoverage: mergedCoverage,
    items: mergedItems,
  };
  return {
    payload,
    changed: JSON.stringify(payload) !== JSON.stringify({
      ...existingPayload,
      predictionCoverage: existingCoverage,
      items: existingItems,
    }),
    mode: mergedCoverage.matchedRaceCount > existingCoverage.matchedRaceCount
      ? "enriched"
      : "unchanged",
  };
}

export async function archiveDailyFacts(options = {}) {
  const targetDate = resolveJstDate(options.date ?? "today");
  const dryRun = options.dryRun === true;
  const source = await loadDailySource({
    feedFile: options.feedFile ?? todayFeedPath,
    predictionsFile: options.predictionsFile ?? savedPredictionsPath,
  });
  const summary = summarizeDailySource(source);
  const attemptedAt = new Date().toISOString();
  const skip = async (message) => {
    if (!dryRun) {
      await writeArchiveStatus({
        lastArchiveAttemptAt: attemptedAt,
        lastArchiveStatus: "skipped",
        lastArchiveMessage: message,
      });
    }
    return { status: "skipped", message, targetDate, summary, changed: false };
  };

  if (summary.feedDate !== targetDate) {
    return skip(`feed date ${summary.feedDate || "(missing)"} does not match ${targetDate}`);
  }
  if (summary.raceCount <= 0) return skip("feed contains no races");
  if (summary.duplicateRaceKeyCount > 0) return skip("duplicate raceKey detected");
  if (summary.missingRaceIdCount > 0) return skip("one or more raceId values are missing");
  if (summary.missingVenueKeyCount > 0) return skip("one or more venue slugs are missing");
  if (summary.pendingRaceCount > 0) {
    return skip(`${summary.pendingRaceCount} races are still pending`);
  }
  if (summary.resultUnparsedCount > 0) {
    return skip(`${summary.resultUnparsedCount} settled results could not be parsed`);
  }
  const candidatePayload = {
    schemaVersion: 1,
    date: targetDate,
    raceCount: summary.raceCount,
    settledRaceCount: summary.settledRaceCount,
    cancelledRaceCount: summary.cancelledRaceCount,
    predictionCoverage: predictionCoverageForRaces(source.races),
    items: source.races,
  };
  const existing = await readDailyPayload(targetDate);
  let merged;
  try {
    merged = mergeDailyFacts(existing.payload, candidatePayload);
  } catch (error) {
    return skip(error.message);
  }

  if (dryRun) {
    return {
      status: "ready",
      message: `dry-run: result FACTS passed; prediction coverage ${candidatePayload.predictionCoverage.coverageRate}% (${merged.mode})`,
      targetDate,
      summary,
      payload: merged.payload,
      changed: false,
    };
  }

  const writeResult = await writeDailyPayload(merged.payload);
  if (!writeResult.changed) {
    return {
      status: "unchanged",
      message: `daily FACTS is unchanged for ${targetDate}`,
      targetDate,
      summary,
      changed: false,
    };
  }
  const coverage = merged.payload.predictionCoverage;
  const archiveStatus = coverage.status === "complete"
    ? "result-facts-saved-predictions-complete"
    : coverage.status === "partial"
      ? "result-facts-saved-predictions-partial"
      : "result-facts-saved-predictions-missing";
  await rebuildHistoryMetadata({
    lastArchiveAttemptAt: attemptedAt,
    lastArchiveSuccessAt: attemptedAt,
    lastArchiveDate: targetDate,
    lastArchiveStatus: archiveStatus,
    lastArchiveMessage: `archived ${summary.raceCount} result races; predictions ${coverage.matchedRaceCount}/${coverage.totalRaceCount}`,
    lastPredictionCoverageRate: coverage.coverageRate,
    lastPredictionMatchedRaceCount: coverage.matchedRaceCount,
    lastPredictionTotalRaceCount: coverage.totalRaceCount,
    lastPredictionCoverageStatus: coverage.status,
    predictionArchiveWarningCount: coverage.status === "complete" ? 0 : 1,
  });
  return {
    status: merged.mode === "enriched" ? "enriched" : "success",
    message: `archived ${summary.raceCount} result races; predictions ${coverage.matchedRaceCount}/${coverage.totalRaceCount}`,
    targetDate,
    summary,
    changed: true,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const fixture = getArgValue(args, "--fixture", "");
  const fixtureFeed = fixture
    ? path.join(projectRoot, "scripts", "fixtures", "kurari-ex-daily-feed-partial-predictions.json")
    : todayFeedPath;
  const fixturePredictions = fixture === "partial"
    ? path.join(projectRoot, "scripts", "fixtures", "kurari-ex-daily-predictions-partial.json")
    : fixture === "missing"
      ? path.join(projectRoot, "scripts", "fixtures", "kurari-ex-daily-predictions-missing.json")
      : savedPredictionsPath;
  const result = await archiveDailyFacts({
    date: fixture ? "2026-06-12" : getArgValue(args, "--date", "today"),
    dryRun: fixture ? true : args.includes("--dry-run"),
    onlyIfMissing: args.includes("--only-if-missing"),
    feedFile: path.resolve(getArgValue(args, "--feed", fixtureFeed)),
    predictionsFile: path.resolve(
      getArgValue(args, "--predictions", fixturePredictions),
    ),
  });
  console.log("[kurari-ex daily FACTS archive]");
  console.log(`date: ${result.targetDate}`);
  console.log(`status: ${result.status}`);
  console.log(`message: ${result.message}`);
  for (const [key, value] of Object.entries(result.summary ?? {})) {
    console.log(`${key}: ${value}`);
  }
  if (fixture && result.payload) {
    const eligible = result.payload.items.filter(
      (race) =>
        race.predictionEnrichment?.status === "matched"
        && race.quality?.predictionParsed === true,
    );
    const missingEvaluations = result.payload.items
      .filter((race) => race.predictionEnrichment?.status === "missing")
      .map((race) => evaluateRace(
        race.result,
        { trifectaTickets: [], exactaTickets: [] },
        race.lineup,
      ).evaluation);
    console.log(`fixturePredictionKpiDenominator: ${eligible.length}`);
    console.log(
      `fixtureMissingPredictionsEvaluateAsNull: ${missingEvaluations.every(
        (evaluation) =>
          evaluation.trifectaHit == null
          && evaluation.exactaHit == null
          && evaluation.anyHit == null
          && evaluation.thirdOnlyMiss == null
          && evaluation.headMiss == null,
      )}`,
    );
  }
  if (result.status === "skipped") process.exitCode = 2;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("[kurari-ex daily FACTS archive] failed");
    console.error(error);
    process.exitCode = 1;
  });
}
