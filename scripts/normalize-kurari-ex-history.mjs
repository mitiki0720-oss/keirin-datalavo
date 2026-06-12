import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  evaluateRace,
  extractLabeledValue,
  mergePrediction,
  mergeResult,
  normalizedRacesRoot,
  normalizedRoot,
  parseLineupFromBlocks,
  parsePredictionBlock,
  parseRaceMeta,
  parseResultBlock,
  readInput,
  relativeProjectPath,
  scanRawInputs,
  serializeJson,
  splitRaceBlocks,
  venueMap,
  writeJson,
} from "./kurari-ex-history-common.mjs";
import {
  loadRiderIdentitySources,
  normalizeRiderName,
  parseExplicitStarterTable,
  resolveRiderIdentity,
} from "./kurari-ex-rider-common.mjs";

function mapBlocks(items, type) {
  const map = new Map();
  for (const item of items) {
    for (const block of splitRaceBlocks(item.text, type)) {
      map.set(block.raceNumber, { ...block, source: item.source });
    }
  }
  return map;
}

function normalizeWinningMethod(value) {
  const text = String(value ?? "");
  if (/逃/u.test(text)) return "逃";
  if (/捲/u.test(text)) return "捲";
  if (/差/u.test(text)) return "差";
  if (/ク|マーク/u.test(text)) return "ク";
  return "";
}

async function main() {
  const scan = await scanRawInputs();
  const riderIdentitySources = await loadRiderIdentitySources();
  const races = [];
  const warnings = [];

  for (const group of scan.groups) {
    if (!group.venueName || !venueMap[group.venueKey]) {
      warnings.push({ level: "error", code: "UNRESOLVED_VENUE", group: group.key });
      continue;
    }
    const loaded = {};
    for (const type of ["summary", "prediction", "result"]) {
      loaded[type] = [];
      for (const source of group[type]) {
        loaded[type].push({ source, text: await readInput(source) });
      }
    }
    const summaryBlocks = mapBlocks(loaded.summary, "summary");
    const predictionBlocks = mapBlocks(loaded.prediction, "prediction");
    const resultBlocks = mapBlocks(loaded.result, "result");
    const raceNumbers = [...new Set([
      ...summaryBlocks.keys(),
      ...predictionBlocks.keys(),
      ...resultBlocks.keys(),
    ])].sort((left, right) => left - right);

    if (!raceNumbers.length) {
      warnings.push({ level: "warning", code: "NO_RACE_BLOCKS", group: group.key });
      continue;
    }

    for (const raceNumber of raceNumbers) {
      const summaryBlock = summaryBlocks.get(raceNumber);
      const predictionBlock = predictionBlocks.get(raceNumber);
      const resultBlock = resultBlocks.get(raceNumber);
      const raceWarnings = [];
      if (!summaryBlock) raceWarnings.push("summary missing");
      if (!predictionBlock) raceWarnings.push("prediction missing");
      if (!resultBlock) raceWarnings.push("result missing");

      const summaryPrediction = summaryBlock ? parsePredictionBlock(summaryBlock.text) : null;
      const sourcePrediction = predictionBlock ? parsePredictionBlock(predictionBlock.text) : null;
      const prediction = mergePrediction(summaryPrediction, sourcePrediction);
      if (prediction.status !== "parsed") raceWarnings.push("prediction parse incomplete");

      const summaryResult = summaryBlock ? parseResultBlock(summaryBlock.text) : null;
      const sourceResult = resultBlock ? parseResultBlock(resultBlock.text) : null;
      const mergedResult = mergeResult(summaryResult, sourceResult);
      const result = mergedResult ?? {
        status: "missing",
        first: { carNo: null, name: "", winningMethod: "" },
        second: { carNo: null, name: "", winningMethod: "" },
        third: { carNo: null, name: "", winningMethod: "" },
        trifecta: { combination: "", payoutYen: null },
        exacta: { combination: "", payoutYen: null },
        favoriteTrifecta: { combination: "", odds: null },
        bRider: null,
        weather: { condition: "", windDirection: "", windSpeedMps: null },
      };
      result.first.winningMethod = normalizeWinningMethod(result.first.winningMethod);
      result.second.winningMethod = normalizeWinningMethod(result.second.winningMethod);
      if (result.status !== "finished") raceWarnings.push("result parse incomplete");

      const lineup = parseLineupFromBlocks(
        summaryBlock?.text ?? "",
        predictionBlock?.text ?? "",
      );
      if (lineup.status !== "parsed") raceWarnings.push("lineup parse incomplete");
      const meta = parseRaceMeta(summaryBlock, predictionBlock?.text ?? resultBlock?.text ?? "");
      const explicitStarters = parseExplicitStarterTable(predictionBlock?.text ?? "");
      const starters = explicitStarters.map((starter) => {
        const identity = resolveRiderIdentity(starter, riderIdentitySources);
        return {
          carNo: starter.carNo,
          name: starter.name,
          nameKey: normalizeRiderName(starter.name),
          registrationNo: identity.registrationNo,
          prefecture: identity.card?.prefecture ?? "",
          class: identity.card?.class ?? identity.card?.grade ?? "",
          period: null,
          style: identity.card?.style ?? "",
          identityStatus: identity.status,
        };
      });
      const weather = result.weather;
      const calculated = evaluateRace(result, prediction, lineup);
      const sourceRefs = {
        summaryFile: summaryBlock ? relativeProjectPath(summaryBlock.source.file) : "",
        predictionFile: predictionBlock ? relativeProjectPath(predictionBlock.source.file) : "",
        resultFile: resultBlock ? relativeProjectPath(resultBlock.source.file) : "",
      };
      const date = group.date ?? summaryBlock?.date;
      if (summaryBlock?.date && group.date && summaryBlock.date !== group.date) {
        raceWarnings.push(`summary date mismatch: ${summaryBlock.date}`);
      }
      const record = {
        schemaVersion: 1,
        raceKey: `${date}:${group.venueKey}:${raceNumber}`,
        date,
        venueKey: group.venueKey,
        venueName: group.venueName,
        raceNumber,
        grade: meta.grade,
        timeslot: meta.timeslot,
        raceClass: meta.raceClass,
        raceTitle: meta.raceTitle,
        starterCount: meta.starters ?? (starters.length || null),
        starters,
        lineup,
        weather,
        result: {
          status: result.status,
          first: result.first,
          second: result.second,
          third: result.third,
          trifecta: result.trifecta,
          exacta: result.exacta,
          favoriteTrifecta: result.favoriteTrifecta,
        },
        prediction,
        evaluation: calculated.evaluation,
        derived: calculated.derived,
        quality: {
          summaryFound: Boolean(summaryBlock),
          predictionFound: Boolean(predictionBlock),
          resultFound: Boolean(resultBlock),
          lineupParsed: lineup.status === "parsed",
          resultParsed: result.status === "finished",
          predictionParsed: prediction.status === "parsed",
          warnings: raceWarnings,
        },
        sourceRefs,
      };
      races.push(record);
      for (const warning of raceWarnings) {
        warnings.push({ level: "warning", raceKey: record.raceKey, message: warning });
      }
    }
  }

  races.sort((left, right) => left.raceKey.localeCompare(right.raceKey));
  const byMonth = new Map();
  for (const race of races) {
    const month = race.date?.slice(0, 7) ?? "unknown";
    const current = byMonth.get(month) ?? [];
    current.push(race);
    byMonth.set(month, current);
  }

  await rm(normalizedRacesRoot, { recursive: true, force: true });
  await mkdir(normalizedRacesRoot, { recursive: true });
  for (const [month, monthRaces] of [...byMonth.entries()].sort()) {
    const content = `${monthRaces.map((race) => JSON.stringify(race)).join("\n")}\n`;
    await writeFile(path.join(normalizedRacesRoot, `${month}.jsonl`), content, "utf8");
  }

  const dates = races.map((race) => race.date).filter(Boolean).sort();
  const index = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    raceCount: races.length,
    dateFrom: dates[0] ?? null,
    dateTo: dates.at(-1) ?? null,
    venueCount: new Set(races.map((race) => race.venueKey)).size,
    files: [...byMonth.keys()].sort().map((month) => `races/${month}.jsonl`),
  };
  const status = {
    ...index,
    inputGroupCount: scan.groups.length,
    warningCount: warnings.length,
    summaryMissingRaceCount: races.filter((race) => !race.quality.summaryFound).length,
    predictionParsedCount: races.filter((race) => race.quality.predictionParsed).length,
    resultParsedCount: races.filter((race) => race.quality.resultParsed).length,
    lineupParsedCount: races.filter((race) => race.quality.lineupParsed).length,
  };
  await Promise.all([
    writeJson(path.join(normalizedRoot, "index.generated.json"), index),
    writeJson(path.join(normalizedRoot, "status.generated.json"), status),
    writeJson(path.join(normalizedRoot, "warnings.generated.json"), {
      schemaVersion: 1,
      generatedAt: index.generatedAt,
      warnings,
    }),
  ]);

  console.log("[kurari-ex history normalize]");
  console.log(`races: ${races.length}`);
  console.log(`period: ${index.dateFrom} to ${index.dateTo}`);
  console.log(`venues: ${index.venueCount}`);
  console.log(`prediction parsed: ${status.predictionParsedCount}`);
  console.log(`result parsed: ${status.resultParsedCount}`);
  console.log(`lineup parsed: ${status.lineupParsedCount}`);
  console.log(`warnings: ${warnings.length}`);
}

main().catch((error) => {
  console.error("[kurari-ex history normalize] failed");
  console.error(error);
  process.exitCode = 1;
});
