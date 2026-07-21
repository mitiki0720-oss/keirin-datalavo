import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
import {
  readDailyPredictionFiles,
  savedPredictionsPath,
  toLegacyPredictionRecord,
  writeIfChanged,
} from "./keirin-daily-predictions-common.mjs";
import { serializeJson } from "./kurari-ex-history-common.mjs";

const JST_OPERATION_DATE_FORMATTER = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hour12: false,
});

function getJstOperationalDate(base = new Date()) {
  const parts = JST_OPERATION_DATE_FORMATTER.formatToParts(base);
  const get = (type) => parts.find((part) => part.type === type)?.value ?? "00";
  const isoDate = `${get("year")}-${get("month")}-${get("day")}`;
  if (Number(get("hour")) >= 6) return isoDate;

  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function keepTodayDedupeKeys(keys, activeDate) {
  if (!activeDate) return [];
  return [...new Set(
    (Array.isArray(keys) ? keys : [])
      .map((key) => String(key ?? "").trim())
      .filter((key) => key.startsWith(`${activeDate}:`)),
  )];
}

export async function rebuildSavedPredictions() {
  const entries = await readDailyPredictionFiles();
  const activeDate = getJstOperationalDate();
  const retained = entries.filter(({ payload }) => payload.date === activeDate);
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
    notifiedSlackResultKeys: keepTodayDedupeKeys(previous.notifiedSlackResultKeys, activeDate),
    slackResultNotifiedAt: previous.slackResultNotifiedAt ?? null,
  };
  const changed = await writeIfChanged(savedPredictionsPath, serializeJson(payload));
  return {
    changed,
    activeDate,
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
