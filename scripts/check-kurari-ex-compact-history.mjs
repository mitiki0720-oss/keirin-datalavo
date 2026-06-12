import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  collectFiles,
  projectRoot,
  venueMap,
} from "./kurari-ex-history-common.mjs";

const historyRoot = path.join(
  projectRoot,
  "public",
  "data",
  "analytics",
  "kurari-ex",
  "history",
);
const dailyPattern = /^daily\/\d{4}-\d{2}\/\d{4}-\d{2}-\d{2}\.generated\.json$/u;

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/u.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function containsKey(value, pattern) {
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) => (
    pattern.test(key) || containsKey(child, pattern)
  ));
}

async function main() {
  const files = await collectFiles(historyRoot);
  const dayFiles = files.filter((file) => dailyPattern.test(
    path.relative(historyRoot, file).replaceAll(path.sep, "/"),
  ));
  const raceKeys = new Set();
  const metrics = {
    dayFileCount: dayFiles.length,
    raceCount: 0,
    duplicateRaceKeyCount: 0,
    invalidDateCount: 0,
    invalidVenueKeyCount: 0,
    invalidRaceNumberCount: 0,
    invalidRegistrationNoCount: 0,
    rawTextDetected: false,
    htmlDetected: false,
    sourceRefDetected: false,
    fullOddsDetected: false,
    commentTextDetected: false,
    jsonlDetected: files.some((file) => path.extname(file).toLowerCase() === ".jsonl"),
    txtDetected: files.some((file) => [".txt", ".md"].includes(path.extname(file).toLowerCase())),
    maxDailyFileBytes: 0,
    totalBytes: 0,
    filesOver300KbCount: 0,
    warningCount: 0,
  };

  for (const file of files) metrics.totalBytes += (await stat(file)).size;
  for (const file of dayFiles) {
    const bytes = (await stat(file)).size;
    metrics.maxDailyFileBytes = Math.max(metrics.maxDailyFileBytes, bytes);
    if (bytes > 300 * 1024) metrics.filesOver300KbCount += 1;
    const content = await readFile(file, "utf8");
    if (/<(?:html|body|script|div|table)\b/iu.test(content)) metrics.htmlDetected = true;
    const payload = JSON.parse(content);
    if (containsKey(payload, /^(?:raw|rawText)$/iu)) metrics.rawTextDetected = true;
    if (containsKey(payload, /^(?:sourceRef|sourceRefs|summaryFile|predictionFile|resultFile)$/iu)) {
      metrics.sourceRefDetected = true;
    }
    if (containsKey(payload, /^(?:allOdds|oddsMatrix|oddsRows|trifectaOdds|top50Odds)$/iu)) {
      metrics.fullOddsDetected = true;
    }
    if (containsKey(payload, /^(?:comment|comments|commentText|riderComment)$/iu)) {
      metrics.commentTextDetected = true;
    }
    for (const race of payload.items ?? []) {
      metrics.raceCount += 1;
      if (raceKeys.has(race.raceKey)) metrics.duplicateRaceKeyCount += 1;
      raceKeys.add(race.raceKey);
      if (!isValidDate(race.date)) metrics.invalidDateCount += 1;
      if (!venueMap[race.venueKey]) metrics.invalidVenueKeyCount += 1;
      if (!Number.isInteger(race.raceNumber) || race.raceNumber < 1 || race.raceNumber > 12) {
        metrics.invalidRaceNumberCount += 1;
      }
      for (const starter of race.starters ?? []) {
        if (starter.registrationNo != null && !/^\d{6}$/u.test(starter.registrationNo)) {
          metrics.invalidRegistrationNoCount += 1;
        }
      }
    }
  }

  const indexFile = path.join(historyRoot, "index.generated.json");
  const indexBytes = (await stat(indexFile)).size;
  const warnings = [];
  if (metrics.filesOver300KbCount) warnings.push(`${metrics.filesOver300KbCount} daily files exceed 300 KB`);
  if (indexBytes > 200 * 1024) warnings.push("history index exceeds 200 KB");
  if (metrics.totalBytes > 10 * 1024 * 1024) warnings.push("compact history exceeds 10 MB");
  if (metrics.invalidRegistrationNoCount) warnings.push("invalid registration numbers detected");
  metrics.warningCount = warnings.length;

  console.log("[kurari-ex compact history check]");
  for (const [key, value] of Object.entries(metrics)) console.log(`${key}: ${value}`);
  for (const warning of warnings) console.warn(`WARNING: ${warning}`);

  const fatal = [
    metrics.duplicateRaceKeyCount > 0,
    metrics.invalidDateCount > 0,
    metrics.invalidVenueKeyCount > 0,
    metrics.invalidRaceNumberCount > 0,
    metrics.rawTextDetected,
    metrics.htmlDetected,
    metrics.sourceRefDetected,
    metrics.fullOddsDetected,
    metrics.commentTextDetected,
    metrics.jsonlDetected,
    metrics.txtDetected,
  ].some(Boolean);
  if (fatal) process.exitCode = 1;
}

main().catch((error) => {
  console.error("[kurari-ex compact history check] failed");
  console.error(error);
  process.exitCode = 1;
});
