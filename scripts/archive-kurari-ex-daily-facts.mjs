import path from "node:path";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { evaluateRace, projectRoot } from "./kurari-ex-history-common.mjs";
import {
  getArgValue,
  loadDailySource,
  normalizeVenueName,
  parsePrediction,
  predictionCompositeKey,
  predictionCoverageForRaces,
  predictionRecords,
  readDailyPayload,
  rebuildHistoryMetadata,
  resolvePredictionInput,
  resolveJstDate,
  summarizeDailySource,
  todayFeedPath,
  writeArchiveStatus,
  writeDailyPayload,
} from "./kurari-ex-daily-common.mjs";

function parseJson(text) {
  return JSON.parse(String(text).replace(/^\uFEFF/u, ""));
}

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

export async function enrichExistingDailyFacts(options = {}) {
  const targetDate = resolveJstDate(options.date ?? "today");
  const existing = await readDailyPayload(targetDate);
  if (!existing.payload) {
    return {
      status: "missing-facts",
      message: `daily FACTS does not exist for ${targetDate}`,
      targetDate,
      changed: false,
    };
  }
  const predictionInput = await resolvePredictionInput(
    targetDate,
    options.predictionsFile ?? "",
  );
  console.log(`prediction source: ${predictionInput.source}`);
  if (!predictionInput.file) {
    return {
      status: "missing-predictions",
      message: `prediction input does not exist for ${targetDate}`,
      targetDate,
      predictionSource: predictionInput.source,
      changed: false,
    };
  }
  const predictions = parseJson(await readFile(predictionInput.file, "utf8"));
  const lookup = predictionRecords(predictions);
  if (lookup.ambiguous.length) {
    throw new Error(`prediction input has ambiguous raceId values: ${lookup.ambiguous.join(", ")}`);
  }
  const existingItems = (existing.payload.items ?? []).map(normalizeExistingRace);
  const existingCoverage = existing.payload.predictionCoverage
    ?? predictionCoverageForRaces(existingItems);
  const items = existingItems.map((race) => {
    if (race.predictionEnrichment?.status === "matched") return race;
    let record = lookup.byRaceId.get(String(race.raceId ?? "").trim()) ?? null;
    let matchedBy = record ? "raceId" : null;
    if (!record) {
      const composite = predictionCompositeKey(race.date, race.venueName, race.raceNumber);
      const candidates = (lookup.byComposite.get(composite) ?? []).filter(
        (candidate) =>
          String(candidate?.date ?? "") === race.date
          && normalizeVenueName(candidate?.venue) === normalizeVenueName(race.venueName)
          && Number(candidate?.raceNumber) === race.raceNumber,
      );
      if (candidates.length === 1) {
        record = candidates[0];
        matchedBy = "unique-composite-key";
      }
    }
    if (!record) return race;
    const prediction = parsePrediction(record);
    const predictionParsed = Boolean(
      prediction.trifectaTickets.length || prediction.exactaTickets.length,
    );
    return {
      ...race,
      prediction,
      predictionEnrichment: { status: "matched", matchedBy },
      quality: {
        ...race.quality,
        predictionParsed,
        warnings: (race.quality?.warnings ?? []).filter(
          (warning) => warning !== "saved prediction missing",
        ),
      },
    };
  });
  const predictionCoverage = predictionCoverageForRaces(items);
  if (predictionCoverage.matchedRaceCount < existingCoverage.matchedRaceCount) {
    throw new Error("prediction coverage would decrease");
  }
  const payload = { ...existing.payload, predictionCoverage, items };
  const changed = JSON.stringify(payload) !== JSON.stringify({
    ...existing.payload,
    predictionCoverage: existingCoverage,
    items: existingItems,
  });
  if (options.dryRun || !changed) {
    return {
      status: changed ? "ready" : "unchanged",
      message: `prediction enrichment ${existingCoverage.matchedRaceCount} -> ${predictionCoverage.matchedRaceCount}`,
      targetDate,
      predictionSource: predictionInput.source,
      payload,
      changed: false,
    };
  }
  await writeDailyPayload(payload);
  const attemptedAt = new Date().toISOString();
  await rebuildHistoryMetadata({
    lastArchiveAttemptAt: attemptedAt,
    lastArchiveSuccessAt: attemptedAt,
    lastArchiveDate: targetDate,
    lastArchiveStatus: `prediction-enrichment-${predictionCoverage.status}`,
    lastArchiveMessage: `enriched predictions ${existingCoverage.matchedRaceCount}/${predictionCoverage.totalRaceCount} -> ${predictionCoverage.matchedRaceCount}/${predictionCoverage.totalRaceCount}`,
    lastPredictionCoverageRate: predictionCoverage.coverageRate,
    lastPredictionMatchedRaceCount: predictionCoverage.matchedRaceCount,
    lastPredictionTotalRaceCount: predictionCoverage.totalRaceCount,
    lastPredictionCoverageStatus: predictionCoverage.status,
    predictionArchiveWarningCount: predictionCoverage.status === "complete" ? 0 : 1,
  });
  return {
    status: "enriched",
    message: `prediction enrichment ${existingCoverage.matchedRaceCount} -> ${predictionCoverage.matchedRaceCount}`,
    targetDate,
    predictionSource: predictionInput.source,
    changed: true,
  };
}

export async function archiveDailyFacts(options = {}) {
  const targetDate = resolveJstDate(options.date ?? "today");
  const dryRun = options.dryRun === true;
  const predictionInput = await resolvePredictionInput(
    targetDate,
    options.predictionsFile ?? "",
  );
  console.log(`prediction source: ${predictionInput.source}`);
  const source = await loadDailySource({
    feedFile: options.feedFile ?? todayFeedPath,
    predictionsFile: predictionInput.file,
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
    return {
      status: "skipped",
      message,
      targetDate,
      summary,
      predictionSource: predictionInput.source,
      changed: false,
    };
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
      predictionSource: predictionInput.source,
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
      predictionSource: predictionInput.source,
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
    predictionSource: predictionInput.source,
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
      : "";
  const result = await archiveDailyFacts({
    date: fixture ? "2026-06-12" : getArgValue(args, "--date", "today"),
    dryRun: fixture ? true : args.includes("--dry-run"),
    onlyIfMissing: args.includes("--only-if-missing"),
    feedFile: path.resolve(getArgValue(args, "--feed", fixtureFeed)),
    predictionsFile: fixture
      ? path.resolve(getArgValue(args, "--predictions", fixturePredictions))
      : getArgValue(args, "--predictions", ""),
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
