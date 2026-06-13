import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  dailyPredictionFile,
  parseJson,
  rebuildDailyPredictionIndex,
  validateDailyPredictionExport,
  writeIfChanged,
} from "./keirin-daily-predictions-common.mjs";
import { getArgValue } from "./kurari-ex-daily-common.mjs";
import { serializeJson } from "./kurari-ex-history-common.mjs";

export async function importDailyPredictions(options = {}) {
  const file = path.resolve(String(options.file ?? ""));
  if (!options.file) throw new Error("--file is required");
  const raw = parseJson(await readFile(file, "utf8"));
  const validation = validateDailyPredictionExport(raw);
  if (!validation.valid) {
    return {
      status: "rejected",
      file,
      errors: validation.errors,
      payload: validation.payload,
      changed: false,
    };
  }
  if (options.dryRun) {
    return {
      status: "ready",
      file,
      outputFile: dailyPredictionFile(validation.payload.date),
      errors: [],
      payload: validation.payload,
      changed: false,
    };
  }
  const outputFile = dailyPredictionFile(validation.payload.date);
  const changed = await writeIfChanged(outputFile, serializeJson(validation.payload));
  const index = await rebuildDailyPredictionIndex();
  return {
    status: changed ? "imported" : "unchanged",
    file,
    outputFile,
    errors: [],
    payload: validation.payload,
    index,
    changed,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const result = await importDailyPredictions({
    file: getArgValue(args, "--file", ""),
    dryRun: args.includes("--dry-run"),
  });
  console.log("[keirin daily predictions import]");
  console.log(`status: ${result.status}`);
  console.log(`date: ${result.payload?.date ?? ""}`);
  console.log(`races: ${result.payload?.raceCount ?? 0}`);
  if (result.outputFile) console.log(`output: ${result.outputFile}`);
  for (const error of result.errors ?? []) console.error(`ERROR: ${error}`);
  if (result.status === "rejected") process.exitCode = 2;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("[keirin daily predictions import] failed");
    console.error(error);
    process.exitCode = 1;
  });
}
