import { execFile } from "node:child_process";
import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  archiveDailyFacts,
  enrichExistingDailyFacts,
} from "./archive-kurari-ex-daily-facts.mjs";
import {
  compactHistoryRoot,
  exactOutputRoot,
  projectRoot,
} from "./kurari-ex-history-common.mjs";
import {
  getArgValue,
  todayFeedPath,
} from "./kurari-ex-daily-common.mjs";

const execFileAsync = promisify(execFile);
const resultTrendIndexPath = path.join(
  projectRoot,
  "public",
  "data",
  "analytics",
  "kurari-ex-result-trend-lab-history",
  "index.generated.json",
);
const predictionFailureIndexPath = path.join(
  projectRoot,
  "public",
  "data",
  "analytics",
  "kurari-ex",
  "prediction-failure",
  "index.generated.json",
);

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function runScript(script, args = []) {
  const result = await execFileAsync(
    process.execPath,
    [path.join(projectRoot, "scripts", script), ...args],
    { cwd: projectRoot, maxBuffer: 20 * 1024 * 1024 },
  );
  const { stdout, stderr } = result;
  if (stdout.trim()) console.log(stdout.trim());
  if (stderr.trim()) console.error(stderr.trim());
  return result;
}

function parseJsonReport(stdout, label) {
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`${label} did not return a JSON report: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assertResultTrendReport(report, expectedDecision, targetDate) {
  const summary = report?.candidateSummary ?? {};
  const target = report?.targetSummary ?? {};
  const failures = [];
  if (report?.targetDate !== targetDate) failures.push(`targetDate=${report?.targetDate}`);
  if (report?.promotion?.decision !== expectedDecision) failures.push(`decision=${report?.promotion?.decision}`);
  if (target.sourceRejectedCount !== 0) failures.push(`targetSourceRejected=${target.sourceRejectedCount}`);
  if (target.notFinalizedCount !== 0) failures.push(`targetNotFinalized=${target.notFinalizedCount}`);
  if (summary.sourceRejectedCount !== 0) failures.push(`sourceRejected=${summary.sourceRejectedCount}`);
  if (summary.rejectedRaceCount !== 0) failures.push(`loaderRejected=${summary.rejectedRaceCount}`);
  if (summary.validatorIssueCount !== 0) failures.push(`validatorIssues=${summary.validatorIssueCount}`);
  if (summary.duplicateRaceKeyCount !== 0) failures.push(`duplicateRaceKeys=${summary.duplicateRaceKeyCount}`);
  if (summary.dateSourceDateMismatchCount !== 0) failures.push(`dateSourceDateMismatch=${summary.dateSourceDateMismatchCount}`);
  if (summary.loadedShardCount !== 60) failures.push(`loadedShards=${summary.loadedShardCount}`);
  if (summary.productionBackfillReady !== true) failures.push("productionBackfillReady=false");
  if (report?.windowAudit?.missingDates?.length) failures.push(`missingDates=${report.windowAudit.missingDates.length}`);
  if (report?.windowAudit?.unexpectedDates?.length) failures.push(`unexpectedDates=${report.windowAudit.unexpectedDates.length}`);
  if (expectedDecision === "PROMOTION_READY" && report?.publicDataWritePerformed !== false) {
    failures.push("dry-run wrote public data");
  }
  if (expectedDecision === "PROMOTED" && report?.publicDataWritePerformed !== true) {
    failures.push("write did not update public data");
  }
  if (failures.length) {
    throw new Error(`Result Trend ${targetDate} safety gate failed: ${failures.join(", ")}`);
  }
}

async function updateResultTrendThrough(targetDate) {
  let index = await readJson(resultTrendIndexPath);
  while (index.range?.to < targetDate) {
    const nextDate = addDays(index.range.to, 1);
    const baseArgs = [
      "--target-date",
      nextDate,
      "--allow-existing-kurari-ex-baseline",
    ];
    const dryRun = await runScript(
      "kurari-ex/update-keirin-jp-historical-result-window.mjs",
      baseArgs,
    );
    assertResultTrendReport(parseJsonReport(dryRun.stdout, "Result Trend dry-run"), "PROMOTION_READY", nextDate);

    const writeRun = await runScript(
      "kurari-ex/update-keirin-jp-historical-result-window.mjs",
      [
        ...baseArgs,
        "--write",
        "--confirm-namespace",
        "kurari-ex-result-trend-lab-history",
        "--confirm-rolling-window",
        "60",
      ],
    );
    assertResultTrendReport(parseJsonReport(writeRun.stdout, "Result Trend write"), "PROMOTED", nextDate);
    index = await readJson(resultTrendIndexPath);
    if (index.range?.to !== nextDate) {
      throw new Error(`Result Trend index did not advance to ${nextDate}`);
    }
  }
  if (index.range?.to !== targetDate) {
    throw new Error(`Result Trend is ahead of compact history: ${index.range?.to} > ${targetDate}`);
  }
  return index;
}

async function updatePredictionFailureGuidance(historyDate) {
  let failure = await readJson(predictionFailureIndexPath);
  while (failure.historicalTo < historyDate) {
    const nextHistoryDate = addDays(failure.historicalTo, 1);
    await runScript("kurari-ex/generate-kurari-ex-prediction-failure.mjs", [
      "--target-date",
      addDays(nextHistoryDate, 1),
      "--incremental-history-date",
      nextHistoryDate,
      "--write",
    ]);
    failure = await readJson(predictionFailureIndexPath);
    if (failure.historicalTo !== nextHistoryDate) {
      throw new Error(`prediction failure did not advance to ${nextHistoryDate}`);
    }
  }
  if (failure.historicalTo !== historyDate) {
    throw new Error(`prediction failure is ahead of compact history: ${failure.historicalTo} > ${historyDate}`);
  }
  await runScript("check-kurari-ex-prediction-failure.mjs");
  const targetDate = addDays(historyDate, 1);
  await runScript("kurari-ex/generate-kurari-ex-prediction-failure-guidance.mjs", [
    "--target-date",
    targetDate,
    "--write",
  ]);
  await runScript("check-kurari-ex-prediction-failure-guidance.mjs");
}

async function updatePreRaceArtifacts(historyDate) {
  const todayFeed = await readJson(todayFeedPath);
  if (typeof todayFeed.date !== "string") {
    throw new Error("today feed date is unavailable");
  }
  if (todayFeed.date > historyDate) {
    await runScript("kurari-ex/generate-kurari-ex-race-risk.mjs");
    await runScript("check-kurari-ex-race-risk.mjs");
    await runScript("kurari-ex/archive-kurari-ex-race-risk.mjs");
    await runScript("check-kurari-ex-race-risk-history.mjs");
  } else {
    console.log(`[nightly] race-risk deferred: today=${todayFeed.date} historicalTo=${historyDate}`);
  }
  await runScript("check-kurari-ex-freshness.mjs", [
    "--historical-date",
    historyDate,
    "--target-date",
    todayFeed.date,
  ]);
}

async function publishVenueExact(tempRoot) {
  await Promise.all([
    rm(path.join(exactOutputRoot, "global"), { recursive: true, force: true }),
    rm(path.join(exactOutputRoot, "venues"), { recursive: true, force: true }),
  ]);
  await Promise.all([
    cp(path.join(tempRoot, "global"), path.join(exactOutputRoot, "global"), { recursive: true }),
    cp(path.join(tempRoot, "venues"), path.join(exactOutputRoot, "venues"), { recursive: true }),
    cp(path.join(tempRoot, "index.generated.json"), path.join(exactOutputRoot, "index.generated.json")),
    cp(path.join(tempRoot, "status.generated.json"), path.join(exactOutputRoot, "status.generated.json")),
  ]);
}

async function publishRiderExact(tempRoot) {
  const target = path.join(exactOutputRoot, "riders");
  await rm(target, { recursive: true, force: true });
  await cp(tempRoot, target, { recursive: true });
}

export async function runNightly(options = {}) {
  const enrichment = options.allowEnrichmentUpgrade
    ? await enrichExistingDailyFacts({
        date: options.date ?? "today",
        dryRun: options.dryRun === true,
        predictionsFile: options.predictionsFile ?? "",
      })
    : null;
  const archive = enrichment && !["missing-facts", "missing-predictions"].includes(enrichment.status)
    ? enrichment
    : await archiveDailyFacts({
        date: options.date ?? "today",
        dryRun: options.dryRun === true,
        onlyIfMissing: options.onlyIfMissing === true,
        feedFile: options.feedFile ?? todayFeedPath,
        predictionsFile: options.predictionsFile ?? "",
      });
  console.log(`[nightly] archive ${archive.status}: ${archive.message}`);
  if (options.allowEnrichmentUpgrade) {
    console.log("[nightly] enrichment upgrade enabled");
  }
  if (archive.status === "skipped") return { status: "skipped", archive };
  if (options.dryRun) return { status: "dry-run", archive };
  if (["exists", "unchanged"].includes(archive.status)) {
    await runScript("check-kurari-ex-compact-history.mjs");
    const historyIndex = JSON.parse(
      await readFile(path.join(compactHistoryRoot, "index.generated.json"), "utf8"),
    );
    const generatedAt = historyIndex.generatedAt;
    const historyDate = historyIndex.period.to;
    await updateResultTrendThrough(historyDate);

    await runScript("update-kurari-ex-official-rider-supplement.mjs");
    await runScript("update-kurari-ex-rider-master.mjs");
    await runScript("check-kurari-ex-rider-master.mjs");
    await runScript("generate-kurari-ex-rider-exact.mjs", [
      "--source=history",
      `--generated-at=${generatedAt}`,
    ]);
    await runScript("check-kurari-ex-rider-exact.mjs");
    await runScript("check-kurari-ex-rider-venue-suitability.mjs");
    await runScript("generate-kurari-ex-matchup-exact.mjs");
    await runScript("check-kurari-ex-matchup-exact.mjs");
    await runScript("check-kurari-ex-size.mjs");
    await runScript("sync-kurari-ex-status-from-history.mjs");
    await runScript("generate-kurari-ex-analysis.mjs");
    await runScript("generate-kurari-ex-rider-score.mjs");
    await runScript("generate-kurari-ex-rider-category-analysis.mjs");
    await runScript("generate-kurari-ex-rider-tags-guidance.mjs");
    await runScript("generate-kurari-ex-today-recommendation.mjs");
    await updatePredictionFailureGuidance(historyDate);
    await updatePreRaceArtifacts(historyDate);
    return { status: archive.status, archive };
  }

  await runScript("check-kurari-ex-compact-history.mjs");
  const historyIndex = JSON.parse(
    await readFile(path.join(compactHistoryRoot, "index.generated.json"), "utf8"),
  );
  const generatedAt = historyIndex.generatedAt;
  const historyDate = historyIndex.period.to;
  await updateResultTrendThrough(historyDate);
  const tempRoot = path.join(projectRoot, ".tmp", "kurari-ex-nightly");
  const venueTemp = path.join(tempRoot, "exact");
  const riderTemp = path.join(tempRoot, "riders");
  await rm(tempRoot, { recursive: true, force: true });
  await mkdir(tempRoot, { recursive: true });
  try {
    await runScript("generate-kurari-ex-venue-exact.mjs", [
      "--source=history",
      `--output-root=${venueTemp}`,
      `--generated-at=${generatedAt}`,
    ]);
    await publishVenueExact(venueTemp);
    await runScript("check-kurari-ex-compact-history-replay.mjs");

    await runScript("update-kurari-ex-official-rider-supplement.mjs");
    await runScript("update-kurari-ex-rider-master.mjs");
    await runScript("check-kurari-ex-rider-master.mjs");

    await runScript("generate-kurari-ex-rider-exact.mjs", [
      "--source=history",
      `--output-root=${riderTemp}`,
      `--generated-at=${generatedAt}`,
    ]);
    await publishRiderExact(riderTemp);
    await runScript("check-kurari-ex-rider-exact.mjs");
    await runScript("check-kurari-ex-rider-venue-suitability.mjs");
    await runScript("generate-kurari-ex-matchup-exact.mjs");
    await runScript("check-kurari-ex-matchup-exact.mjs");
    await runScript("check-kurari-ex-size.mjs");
    await runScript("sync-kurari-ex-status-from-history.mjs");
    await runScript("generate-kurari-ex-analysis.mjs");
    await runScript("generate-kurari-ex-rider-score.mjs");
    await runScript("generate-kurari-ex-rider-category-analysis.mjs");
    await runScript("generate-kurari-ex-rider-tags-guidance.mjs");
    await runScript("generate-kurari-ex-today-recommendation.mjs");
    await updatePredictionFailureGuidance(historyDate);
    await updatePreRaceArtifacts(historyDate);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
  return { status: "success", archive };
}

async function main() {
  const args = process.argv.slice(2);
  const result = await runNightly({
    date: getArgValue(args, "--date", "today"),
    dryRun: args.includes("--dry-run"),
    onlyIfMissing: args.includes("--only-if-missing"),
    allowEnrichmentUpgrade: args.includes("--allow-enrichment-upgrade"),
    feedFile: path.resolve(getArgValue(args, "--feed", todayFeedPath)),
    predictionsFile: getArgValue(args, "--predictions", ""),
  });
  console.log("[kurari-ex nightly update]");
  console.log(`status: ${result.status}`);
  if (result.status === "skipped") process.exitCode = 2;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("[kurari-ex nightly update] failed");
    console.error(error);
    process.exitCode = 1;
  });
}
