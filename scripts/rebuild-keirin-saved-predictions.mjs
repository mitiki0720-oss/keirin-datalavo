import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
import {
  readDailyPredictionFiles,
  savedPredictionsPath,
  toLegacyPredictionRecord,
  writeIfChanged,
} from "./keirin-daily-predictions-common.mjs";
import { serializeJson } from "./kurari-ex-history-common.mjs";

export async function rebuildSavedPredictions() {
  const entries = await readDailyPredictionFiles();
  const retained = entries.slice(-14);
  const recordList = retained
    .flatMap(({ payload }) => (payload.items ?? []).map(
      (item) => toLegacyPredictionRecord(item, payload.generatedAt),
    ))
    .sort((left, right) => (
      right.date.localeCompare(left.date)
      || left.venue.localeCompare(right.venue, "ja")
      || left.raceNumber - right.raceNumber
    ));
  const records = Object.fromEntries(recordList.map((record) => [record.raceKey, record]));
  const updatedAt = retained.map(({ payload }) => payload.generatedAt).filter(Boolean).sort().at(-1)
    ?? new Date().toISOString();
  let previous = {};
  try {
    previous = JSON.parse(await readFile(savedPredictionsPath, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const payload = {
    version: 1,
    updatedAt,
    source: "keirin-daily-predictions-rebuild",
    records,
    recordList,
    notifiedSlackResultKeys: Array.isArray(previous.notifiedSlackResultKeys)
      ? previous.notifiedSlackResultKeys
      : [],
    slackResultNotifiedAt: previous.slackResultNotifiedAt ?? null,
  };
  const changed = await writeIfChanged(savedPredictionsPath, serializeJson(payload));
  return {
    changed,
    dayCount: retained.length,
    predictionCount: recordList.length,
    from: retained[0]?.payload.date ?? null,
    to: retained.at(-1)?.payload.date ?? null,
  };
}

async function main() {
  const result = await rebuildSavedPredictions();
  console.log("[keirin saved predictions rebuild]");
  for (const [key, value] of Object.entries(result)) console.log(`${key}: ${value}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("[keirin saved predictions rebuild] failed");
    console.error(error);
    process.exitCode = 1;
  });
}
