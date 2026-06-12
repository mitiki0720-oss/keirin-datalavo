import path from "node:path";
import {
  getArgValue,
  loadDailySource,
  summarizeDailySource,
  todayFeedPath,
  savedPredictionsPath,
} from "./kurari-ex-daily-common.mjs";

const args = process.argv.slice(2);

async function main() {
  const feedFile = path.resolve(getArgValue(args, "--feed", todayFeedPath));
  const predictionsFile = path.resolve(
    getArgValue(args, "--predictions", savedPredictionsPath),
  );
  const source = await loadDailySource({ feedFile, predictionsFile });
  const summary = summarizeDailySource(source);

  console.log("[kurari-ex daily source audit]");
  for (const [key, value] of Object.entries(summary)) {
    console.log(`${key}: ${value}`);
  }

  const fatal = [];
  if (!summary.feedDate) fatal.push("feed date missing");
  if (summary.raceCount <= 0) fatal.push("race count is zero");
  if (summary.duplicateRaceKeyCount > 0) fatal.push("duplicate raceKey detected");
  if (summary.missingRaceIdCount > 0) fatal.push("raceId missing");
  if (summary.missingVenueKeyCount > 0) fatal.push("venue slug missing");
  if (summary.pendingRaceCount === 0 && summary.predictionCoverageRate < 95) {
    fatal.push(`saved prediction coverage below 95% (${summary.predictionCoverageRate}%)`);
  }
  for (const message of fatal) console.error(`ERROR: ${message}`);
  if (fatal.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error("[kurari-ex daily source audit] failed");
  console.error(error);
  process.exitCode = 1;
});
