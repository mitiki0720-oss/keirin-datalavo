import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { projectRoot } from "./kurari-ex-history-common.mjs";

const execFileAsync = promisify(execFile);
const metricNames = [
  "trifectaHitRate",
  "exactaHitRate",
  "anyHitRate",
  "exactaSalvageRate",
  "thirdOnlyMissRate",
  "headMissRate",
];
const patternNames = [
  "escapeWinRate",
  "makuriWinRate",
  "sashiWinRate",
  "sameLineTop2Rate",
  "sameLineTop3Rate",
  "otherLineThirdRate",
  "singleThirdRate",
];

function metric(value) {
  return {
    count: value?.count ?? null,
    total: value?.total ?? null,
    rate: value?.rate ?? null,
  };
}

function comparable(payload) {
  const dimensions = {};
  for (const [dimension, groups] of Object.entries(payload.dimensions ?? {})) {
    dimensions[dimension] = {};
    for (const [bucket, value] of Object.entries(groups)) {
      dimensions[dimension][bucket] = {
        raceCount: value.raceCount,
        predictionKpi: Object.fromEntries(
          metricNames.map((name) => [name, metric(value.predictionKpi?.[name])]),
        ),
        racePattern: Object.fromEntries(
          patternNames.map((name) => [name, metric(value.racePattern?.[name])]),
        ),
      };
    }
  }
  return {
    venueKey: payload.venueKey ?? null,
    period: payload.period,
    coverage: payload.coverage,
    predictionKpi: Object.fromEntries(
      metricNames.map((name) => [name, metric(payload.predictionKpi?.[name])]),
    ),
    racePattern: Object.fromEntries(
      patternNames.map((name) => [name, metric(payload.racePattern?.[name])]),
    ),
    dimensions,
  };
}

async function generate(source, outputRoot) {
  await execFileAsync(
    process.execPath,
    [
      path.join(projectRoot, "scripts", "generate-kurari-ex-venue-exact.mjs"),
      `--source=${source}`,
      `--output-root=${outputRoot}`,
      "--generated-at=2000-01-01T00:00:00.000Z",
    ],
    { cwd: projectRoot, maxBuffer: 10 * 1024 * 1024 },
  );
}

async function main() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "kurari-venue-parity-"));
  const normalizedRoot = path.join(tempRoot, "normalized");
  const historyRoot = path.join(tempRoot, "history");
  const differences = [];
  try {
    await generate("normalized", normalizedRoot);
    await generate("history", historyRoot);
    const normalizedFiles = (await readdir(path.join(normalizedRoot, "venues")))
      .filter((file) => file.endsWith(".generated.json"))
      .sort();
    const historyFiles = (await readdir(path.join(historyRoot, "venues")))
      .filter((file) => file.endsWith(".generated.json"))
      .sort();
    if (JSON.stringify(normalizedFiles) !== JSON.stringify(historyFiles)) {
      differences.push("venue file list");
    }
    for (const relativeFile of [
      "global/prediction-kpi.generated.json",
      ...normalizedFiles.map((file) => `venues/${file}`),
    ]) {
      const [normalized, history] = await Promise.all([
        readFile(path.join(normalizedRoot, relativeFile), "utf8").then(JSON.parse),
        readFile(path.join(historyRoot, relativeFile), "utf8").then(JSON.parse),
      ]);
      if (JSON.stringify(comparable(normalized)) !== JSON.stringify(comparable(history))) {
        differences.push(relativeFile);
      }
    }
    console.log("[kurari-ex venue exact history parity]");
    console.log(`venues: ${normalizedFiles.length}`);
    console.log(`differences: ${differences.length}`);
    for (const difference of differences) console.error(`MISMATCH: ${difference}`);
    if (differences.length) process.exitCode = 1;
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("[kurari-ex venue exact history parity] failed");
  console.error(error);
  process.exitCode = 1;
});
