import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  compactHistoryRoot,
  exactOutputRoot,
} from "./kurari-ex-history-common.mjs";
import {
  getArgValue,
  resolveJstDate,
} from "./kurari-ex-daily-common.mjs";

const args = process.argv.slice(2);

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function main() {
  const targetDate = resolveJstDate(getArgValue(args, "--date", "yesterday"));
  const dailyFile = path.join(
    compactHistoryRoot,
    "daily",
    targetDate.slice(0, 7),
    `${targetDate}.generated.json`,
  );
  const errors = [];
  let daily = null;
  try {
    await stat(dailyFile);
    daily = await readJson(dailyFile);
  } catch (error) {
    if (error?.code === "ENOENT") errors.push(`daily FACTS missing for ${targetDate}`);
    else throw error;
  }
  const [index, status, venueIndex, riderIndex] = await Promise.all([
    readJson(path.join(compactHistoryRoot, "index.generated.json")),
    readJson(path.join(compactHistoryRoot, "status.generated.json")),
    readJson(path.join(exactOutputRoot, "index.generated.json")),
    readJson(path.join(exactOutputRoot, "riders", "index.generated.json")),
  ]);

  if (daily?.raceCount <= 0) errors.push("daily raceCount is zero");
  if (
    daily
    && daily.settledRaceCount + daily.cancelledRaceCount !== daily.raceCount
  ) {
    errors.push("daily FACTS contains pending races");
  }
  if (!index.items?.some((item) => item.date === targetDate)) {
    errors.push("history index does not contain target date");
  }
  if (!status.lastArchiveDate || status.lastArchiveDate < targetDate) {
    errors.push(`status.lastArchiveDate is older than ${targetDate}`);
  }
  if (!venueIndex.period?.to || venueIndex.period.to < targetDate) {
    errors.push(`venue EXACT period is older than ${targetDate}`);
  }
  if (!riderIndex.period?.to || riderIndex.period.to < targetDate) {
    errors.push(`rider EXACT period is older than ${targetDate}`);
  }

  console.log("[kurari-ex nightly stale check]");
  console.log(`date: ${targetDate}`);
  console.log(`errors: ${errors.length}`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  if (errors.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error("[kurari-ex nightly stale check] failed");
  console.error(error);
  process.exitCode = 1;
});
