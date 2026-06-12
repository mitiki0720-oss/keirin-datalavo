import path from "node:path";
import { access } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { compactHistoryDailyRoot } from "./kurari-ex-history-common.mjs";
import {
  getArgValue,
  loadDailySource,
  rebuildHistoryMetadata,
  resolveJstDate,
  savedPredictionsPath,
  summarizeDailySource,
  todayFeedPath,
  writeArchiveStatus,
  writeDailyPayload,
} from "./kurari-ex-daily-common.mjs";

export async function archiveDailyFacts(options = {}) {
  const targetDate = resolveJstDate(options.date ?? "today");
  const dryRun = options.dryRun === true;
  const onlyIfMissing = options.onlyIfMissing === true;
  if (onlyIfMissing && !dryRun) {
    const file = path.join(
      compactHistoryDailyRoot,
      targetDate.slice(0, 7),
      `${targetDate}.generated.json`,
    );
    try {
      await access(file);
      return {
        status: "exists",
        message: `daily FACTS already exists for ${targetDate}`,
        targetDate,
        summary: null,
        changed: false,
      };
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
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
  if (summary.predictionCoverageRate < 95) {
    return skip(
      `saved prediction coverage ${summary.predictionCoverageRate}% is below 95%`,
    );
  }

  const payload = {
    schemaVersion: 1,
    date: targetDate,
    raceCount: summary.raceCount,
    settledRaceCount: summary.settledRaceCount,
    cancelledRaceCount: summary.cancelledRaceCount,
    items: source.races,
  };

  if (dryRun) {
    return {
      status: "ready",
      message: "dry-run: daily FACTS passed all archive conditions",
      targetDate,
      summary,
      payload,
      changed: false,
    };
  }

  const writeResult = await writeDailyPayload(payload);
  if (!writeResult.changed) {
    return {
      status: "unchanged",
      message: `daily FACTS is unchanged for ${targetDate}`,
      targetDate,
      summary,
      changed: false,
    };
  }
  await rebuildHistoryMetadata({
    lastArchiveAttemptAt: attemptedAt,
    lastArchiveSuccessAt: attemptedAt,
    lastArchiveDate: targetDate,
    lastArchiveStatus: "success",
    lastArchiveMessage: `archived ${summary.raceCount} races`,
  });
  return {
    status: "success",
    message: `archived ${summary.raceCount} races`,
    targetDate,
    summary,
    changed: true,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const result = await archiveDailyFacts({
    date: getArgValue(args, "--date", "today"),
    dryRun: args.includes("--dry-run"),
    onlyIfMissing: args.includes("--only-if-missing"),
    feedFile: path.resolve(getArgValue(args, "--feed", todayFeedPath)),
    predictionsFile: path.resolve(
      getArgValue(args, "--predictions", savedPredictionsPath),
    ),
  });
  console.log("[kurari-ex daily FACTS archive]");
  console.log(`date: ${result.targetDate}`);
  console.log(`status: ${result.status}`);
  console.log(`message: ${result.message}`);
  for (const [key, value] of Object.entries(result.summary ?? {})) {
    console.log(`${key}: ${value}`);
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
