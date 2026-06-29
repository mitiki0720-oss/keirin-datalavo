import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  INDEX_PATH,
  validateSnapshotIndex,
} from "./lib/kurari-ex-entry-snapshot.mjs";

const ROOT = process.cwd();
const DEFAULT_INDEX_PATH = path.resolve(ROOT, INDEX_PATH);

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function resolveIndexPath(argument) {
  const resolved = path.resolve(ROOT, argument || INDEX_PATH);
  if (resolved !== DEFAULT_INDEX_PATH) {
    throw new Error(
      `index checker path must be the exact entries-history index: ${resolved}`,
    );
  }
  return resolved;
}

async function main() {
  const target = resolveIndexPath(process.argv[2]);
  if (!existsSync(target)) {
    throw new Error(`entry snapshot index does not exist: ${target}`);
  }
  const payload = await readJson(target);
  const result = await validateSnapshotIndex(ROOT, payload);

  console.log("[kurari-ex entry snapshot index check]");
  console.log(
    `path: ${path.relative(ROOT, target).replaceAll("\\", "/")}`,
  );
  console.log(`checkStatus: ${result.checkStatus}`);
  console.log(`snapshotCount: ${result.snapshotCount}`);
  console.log(`raceCount: ${result.raceCount}`);
  console.log(`riderCount: ${result.riderCount}`);
  console.log(
    `fullRegistrationRaceCount: ${result.fullRegistrationRaceCount}`,
  );
  console.log(`blockedRaceCount: ${result.blockedRaceCount}`);
  console.log(`contentHash: ${result.contentHash}`);
  console.log(`recomputedHash: ${result.recomputedHash}`);
  console.log(`hashMatched: ${result.hashMatched}`);
  console.log(`failedReasons: ${JSON.stringify(result.failedReasons)}`);
  if (result.checkStatus !== "PASS") process.exitCode = 1;
}

main().catch((error) => {
  console.error("[kurari-ex entry snapshot index check] failed");
  console.error(error);
  process.exitCode = 1;
});
