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

async function runScript(script, args = []) {
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    [path.join(projectRoot, "scripts", script), ...args],
    { cwd: projectRoot, maxBuffer: 20 * 1024 * 1024 },
  );
  if (stdout.trim()) console.log(stdout.trim());
  if (stderr.trim()) console.error(stderr.trim());
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

    await runScript("update-kurari-ex-official-rider-supplement.mjs");
    await runScript("update-kurari-ex-rider-master.mjs");
    await runScript("check-kurari-ex-rider-master.mjs");
    await runScript("generate-kurari-ex-rider-exact.mjs", [
      "--source=history",
      `--generated-at=${generatedAt}`,
    ]);
    await runScript("check-kurari-ex-rider-exact.mjs");
    await runScript("generate-kurari-ex-matchup-exact.mjs");
    await runScript("check-kurari-ex-matchup-exact.mjs");
    await runScript("check-kurari-ex-size.mjs");
    await runScript("sync-kurari-ex-status-from-history.mjs");
    await runScript("generate-kurari-ex-analysis.mjs");
    await runScript("generate-kurari-ex-rider-score.mjs");
    await runScript("generate-kurari-ex-rider-tags-guidance.mjs");
    return { status: archive.status, archive };
  }

  await runScript("check-kurari-ex-compact-history.mjs");
  const historyIndex = JSON.parse(
    await readFile(path.join(compactHistoryRoot, "index.generated.json"), "utf8"),
  );
  const generatedAt = historyIndex.generatedAt;
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
    await runScript("generate-kurari-ex-matchup-exact.mjs");
    await runScript("check-kurari-ex-matchup-exact.mjs");
    await runScript("check-kurari-ex-size.mjs");
    await runScript("sync-kurari-ex-status-from-history.mjs");
    await runScript("generate-kurari-ex-analysis.mjs");
    await runScript("generate-kurari-ex-rider-score.mjs");
    await runScript("generate-kurari-ex-rider-tags-guidance.mjs");
await runScript("generate-kurari-ex-today-recommendation.mjs");
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
