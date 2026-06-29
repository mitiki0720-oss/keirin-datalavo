import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  SNAPSHOT_ROOT,
  snapshotPathForDate,
  validateSnapshot,
} from "./lib/kurari-ex-entry-snapshot.mjs";

const ROOT = process.cwd();
const CURRENT_SOURCE_PATH = path.join(
  ROOT,
  "public",
  "data",
  "races",
  "keirin-jp-entries.generated.json",
);

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function assertCheckerPath(file) {
  const root = path.resolve(ROOT, SNAPSHOT_ROOT);
  const resolved = path.resolve(file);
  if (
    resolved !== root &&
    !resolved.startsWith(`${root}${path.sep}`)
  ) {
    throw new Error(
      `snapshot checker path is outside ${SNAPSHOT_ROOT}: ${resolved}`,
    );
  }
  return resolved;
}

async function defaultTargetPath() {
  const current = await readJson(CURRENT_SOURCE_PATH);
  return path.resolve(ROOT, snapshotPathForDate(String(current?.date ?? "")));
}

async function main() {
  const argument = process.argv[2];
  const target = assertCheckerPath(
    argument ? path.resolve(ROOT, argument) : await defaultTargetPath(),
  );
  if (!existsSync(target)) {
    throw new Error(`snapshot does not exist: ${target}`);
  }

  const payload = await readJson(target);
  const result = validateSnapshot(payload);
  console.log("[kurari-ex entry snapshot check]");
  console.log(
    `path: ${path.relative(ROOT, target).replaceAll("\\", "/")}`,
  );
  console.log(`checkStatus: ${result.checkStatus}`);
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
  console.error("[kurari-ex entry snapshot check] failed");
  console.error(error);
  process.exitCode = 1;
});
