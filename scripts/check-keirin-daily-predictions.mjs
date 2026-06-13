import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  dailyPredictionsIndexPath,
  dailyPredictionsRoot,
  readDailyPredictionFiles,
  validateDailyPredictionExport,
} from "./keirin-daily-predictions-common.mjs";

function containsKey(value, pattern) {
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) => (
    pattern.test(key) || containsKey(child, pattern)
  ));
}

async function main() {
  const entries = await readDailyPredictionFiles();
  const metrics = {
    dailyDayCount: entries.length,
    dailyPredictionCount: 0,
    duplicateRaceIdCount: 0,
    invalidRaceIdCount: 0,
    invalidDateCount: 0,
    invalidTicketCount: 0,
    missingVenueNameCount: 0,
    missingRaceNumberCount: 0,
    rawTextDetected: false,
    htmlDetected: false,
    commentTextDetected: false,
    fullOddsDetected: false,
    localStorageDumpDetected: false,
    maxDailyFileBytes: 0,
    totalBytes: 0,
    warningCount: 0,
  };
  const globalRaceIds = new Set();
  for (const { file, payload, bytes } of entries) {
    metrics.totalBytes += bytes;
    metrics.maxDailyFileBytes = Math.max(metrics.maxDailyFileBytes, bytes);
    metrics.dailyPredictionCount += payload.items?.length ?? 0;
    const content = await readFile(file, "utf8");
    if (/<(?:html|body|script|table|div)\b/iu.test(content)) metrics.htmlDetected = true;
    if (containsKey(payload, /^(?:raw|rawText|predictionText|gptMaterial|summaryText)$/iu)) {
      metrics.rawTextDetected = true;
    }
    if (containsKey(payload, /^(?:comment|comments|riderComment|commentText)$/iu)) {
      metrics.commentTextDetected = true;
    }
    if (containsKey(payload, /^(?:odds|allOdds|oddsMatrix|oddsRows|trifectaOdds)$/iu)) {
      metrics.fullOddsDetected = true;
    }
    if (
      containsKey(payload, /^(?:localStorage|storageDump|predictionSlots|predictionResults)$/iu)
      || content.includes("kurari-data-labo-prediction-slots")
    ) {
      metrics.localStorageDumpDetected = true;
    }
    const validation = validateDailyPredictionExport(payload);
    metrics.invalidRaceIdCount += validation.errors.filter(
      (error) => error.includes(".raceId") && !error.includes("duplicated"),
    ).length;
    metrics.invalidDateCount += validation.errors.filter((error) => error.includes("date")).length;
    metrics.invalidTicketCount += validation.errors.filter(
      (error) => error.includes("ticket") || error.includes("no valid tickets"),
    ).length;
    metrics.missingVenueNameCount += validation.errors.filter(
      (error) => error.includes("venueName"),
    ).length;
    metrics.missingRaceNumberCount += validation.errors.filter(
      (error) => error.includes("raceNumber"),
    ).length;
    const fileRaceIds = new Set();
    for (const item of payload.items ?? []) {
      const scopedId = `${payload.date}:${String(item.raceId ?? "").trim()}`;
      if (fileRaceIds.has(scopedId) || globalRaceIds.has(scopedId)) {
        metrics.duplicateRaceIdCount += 1;
      }
      fileRaceIds.add(scopedId);
      globalRaceIds.add(scopedId);
    }
  }
  try {
    metrics.totalBytes += (await stat(dailyPredictionsIndexPath)).size;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const warnings = [];
  if (metrics.maxDailyFileBytes > 100 * 1024) warnings.push("daily prediction file exceeds 100 KB");
  if (metrics.totalBytes > 5 * 1024 * 1024) warnings.push("daily predictions exceed 5 MB");
  metrics.warningCount = warnings.length;

  console.log("[keirin daily predictions check]");
  console.log(`root: ${path.relative(process.cwd(), dailyPredictionsRoot)}`);
  for (const [key, value] of Object.entries(metrics)) console.log(`${key}: ${value}`);
  for (const warning of warnings) console.warn(`WARNING: ${warning}`);
  const fatal = [
    metrics.duplicateRaceIdCount,
    metrics.invalidRaceIdCount,
    metrics.invalidDateCount,
    metrics.invalidTicketCount,
    metrics.rawTextDetected,
    metrics.htmlDetected,
    metrics.commentTextDetected,
    metrics.fullOddsDetected,
    metrics.localStorageDumpDetected,
  ].some(Boolean);
  if (fatal) process.exitCode = 1;
}

main().catch((error) => {
  console.error("[keirin daily predictions check] failed");
  console.error(error);
  process.exitCode = 1;
});
