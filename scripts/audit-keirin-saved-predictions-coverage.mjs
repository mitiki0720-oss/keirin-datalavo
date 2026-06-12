import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  getArgValue,
  normalizeVenueName,
  predictionCompositeKey,
  predictionRecords,
  savedPredictionsPath,
  todayFeedPath,
} from "./kurari-ex-daily-common.mjs";
import { projectRoot, serializeJson } from "./kurari-ex-history-common.mjs";

function parseJson(text) {
  return JSON.parse(String(text).replace(/^\uFEFF/u, ""));
}

function feedRecords(feed) {
  const records = [];
  for (const venue of feed.venues ?? []) {
    for (let index = 0; index < (venue.races ?? []).length; index += 1) {
      const race = venue.races[index];
      records.push({
        date: String(feed.date ?? ""),
        venueName: String(venue.venue ?? ""),
        venueKey: String(venue.slug ?? ""),
        raceNumber: Number(race?.raceNo),
        raceId: String(
          race?.raceId
          ?? race?.kdreamsRaceId
          ?? venue?.raceIds?.[index]
          ?? "",
        ).trim(),
      });
    }
  }
  return records;
}

function uniquePredictionRecords(payload) {
  const lookup = predictionRecords(payload);
  const records = [...lookup.byRaceId.values()];
  const withoutRaceId = lookup.candidates.filter(
    (record) => !String(record?.raceId ?? "").trim(),
  );
  return {
    lookup,
    records: [...records, ...withoutRaceId],
  };
}

function latestDate(values) {
  return values.filter((value) => /^\d{4}-\d{2}-\d{2}$/u.test(value)).sort().at(-1) ?? null;
}

function diagnose({
  feed,
  predictions,
  predictionRecords: records,
  exactRaceIdMatchCount,
  uniqueCompositeMatchCount,
}) {
  const diagnosis = [];
  const predictionDates = [...new Set(records.map((record) => String(record?.date ?? "")))];
  const archiveDate = latestDate(predictionDates);
  if (!records.length) diagnosis.push("EMPTY");
  if (records.length && (!archiveDate || archiveDate < String(feed.date ?? ""))) {
    diagnosis.push("STALE_DATE");
  }
  if (records.some((record) => !String(record?.raceId ?? "").trim())) {
    diagnosis.push("MISSING_RACE_ID");
  }
  if (uniqueCompositeMatchCount > 0 && exactRaceIdMatchCount === 0) {
    diagnosis.push("RACE_ID_FORMAT_MISMATCH");
  }
  if (
    predictions?.source === "kurari-prediction-page"
    && !predictionDates.includes(String(feed.date ?? ""))
  ) {
    diagnosis.push("LOCAL_STORAGE_ONLY");
    diagnosis.push("EXPORT_NOT_RUNNING");
  }
  if (!Array.isArray(predictions?.recordList) && !predictions?.records) {
    diagnosis.push("WRONG_SOURCE_FILE");
  }
  if (!diagnosis.length) diagnosis.push("OTHER");
  return [...new Set(diagnosis)];
}

async function main() {
  const args = process.argv.slice(2);
  const feedFile = path.resolve(getArgValue(args, "--feed", todayFeedPath));
  const predictionsFile = path.resolve(
    getArgValue(args, "--predictions", savedPredictionsPath),
  );
  const [feed, predictions] = await Promise.all([
    readFile(feedFile, "utf8").then(parseJson),
    readFile(predictionsFile, "utf8").then(parseJson),
  ]);
  const feedItems = feedRecords(feed);
  const { lookup, records } = uniquePredictionRecords(predictions);
  const feedRaceIds = new Set(feedItems.map((item) => item.raceId).filter(Boolean));
  const predictionRaceIds = new Set(
    records.map((record) => String(record?.raceId ?? "").trim()).filter(Boolean),
  );
  const exactMatchedFeedIds = new Set();
  const compositeMatchedFeedKeys = new Set();
  const matchDetails = [];

  for (const item of feedItems) {
    if (item.raceId && lookup.byRaceId.has(item.raceId)) {
      exactMatchedFeedIds.add(item.raceId);
      matchDetails.push({
        ...item,
        matchedBy: "raceId",
        predictionRaceId: item.raceId,
      });
      continue;
    }
    const composite = predictionCompositeKey(
      item.date,
      item.venueName,
      item.raceNumber,
    );
    const candidates = (lookup.byComposite.get(composite) ?? []).filter(
      (record) =>
        String(record?.date ?? "") === item.date
        && normalizeVenueName(record?.venue) === normalizeVenueName(item.venueName)
        && Number(record?.raceNumber) === item.raceNumber,
    );
    if (candidates.length === 1) {
      compositeMatchedFeedKeys.add(composite);
      matchDetails.push({
        ...item,
        matchedBy: "unique-composite-key",
        predictionRaceId: String(candidates[0]?.raceId ?? "").trim(),
      });
    }
  }

  const matchedFeedKeys = new Set(
    matchDetails.map((item) => `${item.date}:${item.venueKey}:${item.raceNumber}`),
  );
  const matchedPredictionIds = new Set(
    matchDetails
      .map((item) => item.predictionRaceId)
      .filter(Boolean),
  );
  const predictionArchiveDate = latestDate(
    records.map((record) => String(record?.date ?? "")),
  );
  const exactRaceIdMatchCount = exactMatchedFeedIds.size;
  const uniqueCompositeMatchCount = compositeMatchedFeedKeys.size;
  const audit = {
    feedDate: String(feed.date ?? ""),
    feedRaceCount: feedItems.length,
    predictionArchiveDate,
    predictionCount: records.length,
    feedRaceIdCount: feedRaceIds.size,
    predictionRaceIdCount: predictionRaceIds.size,
    exactRaceIdMatchCount,
    uniqueCompositeMatchCount,
    unmatchedFeedRaceCount: feedItems.length - matchedFeedKeys.size,
    unmatchedPredictionCount: records.filter((record) => {
      const raceId = String(record?.raceId ?? "").trim();
      if (raceId) return !matchedPredictionIds.has(raceId);
      return !compositeMatchedFeedKeys.has(predictionCompositeKey(
        record?.date,
        record?.venue,
        record?.raceNumber,
      ));
    }).length,
    coverageRate: feedItems.length
      ? Number(((matchedFeedKeys.size / feedItems.length) * 100).toFixed(1))
      : 0,
    diagnosis: diagnose({
      feed,
      predictions,
      predictionRecords: records,
      exactRaceIdMatchCount,
      uniqueCompositeMatchCount,
    }),
    examples: {
      feedRaceIds: [...feedRaceIds].slice(0, 5),
      predictionRaceIds: [...predictionRaceIds].slice(0, 5),
      unmatchedFeed: feedItems
        .filter((item) => !matchedFeedKeys.has(
          `${item.date}:${item.venueKey}:${item.raceNumber}`,
        ))
        .slice(0, 5),
      predictionMetadata: {
        source: predictions?.source ?? null,
        generatedAt: predictions?.generatedAt ?? null,
        updatedAt: predictions?.updatedAt ?? null,
      },
    },
  };
  const outputFile = path.join(
    projectRoot,
    ".tmp",
    "kurari-ex-saved-predictions-audit.json",
  );
  await mkdir(path.dirname(outputFile), { recursive: true });
  await writeFile(outputFile, serializeJson(audit), "utf8");

  console.log("[keirin saved predictions coverage audit]");
  for (const [key, value] of Object.entries(audit)) {
    if (key === "examples") continue;
    console.log(`${key}: ${Array.isArray(value) ? value.join(", ") : value}`);
  }
  console.log(`output: ${path.relative(projectRoot, outputFile)}`);
}

main().catch((error) => {
  console.error("[keirin saved predictions coverage audit] failed");
  console.error(error);
  process.exitCode = 1;
});
