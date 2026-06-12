import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { projectRoot } from "./kurari-ex-history-common.mjs";

const execFileAsync = promisify(execFile);

async function generate(source, outputRoot) {
  await execFileAsync(
    process.execPath,
    [
      path.join(projectRoot, "scripts", "generate-kurari-ex-rider-exact.mjs"),
      `--source=${source}`,
      `--output-root=${outputRoot}`,
      "--generated-at=2000-01-01T00:00:00.000Z",
    ],
    { cwd: projectRoot, maxBuffer: 10 * 1024 * 1024 },
  );
}

function comparable(payload) {
  return {
    registrationNo: payload.registrationNo,
    quality: payload.quality,
    coverage: payload.coverage,
    overall: payload.overall,
    winningMethods: payload.winningMethods,
    byVenue: payload.byVenue,
    byTimeslot: payload.byTimeslot,
    byClass: payload.byClass,
    byRole: payload.byRole,
  };
}

async function riderFiles(root) {
  const files = [];
  const tails = await readdir(path.join(root, "by-tail"), { withFileTypes: true });
  for (const tail of tails.filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    for (const file of (await readdir(path.join(root, "by-tail", tail.name))).sort()) {
      if (file.endsWith(".generated.json")) files.push(`by-tail/${tail.name}/${file}`);
    }
  }
  return files;
}

async function main() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "kurari-rider-parity-"));
  const normalizedRoot = path.join(tempRoot, "normalized");
  const historyRoot = path.join(tempRoot, "history");
  const differences = [];
  try {
    await generate("normalized", normalizedRoot);
    await generate("history", historyRoot);
    const [normalizedIndex, historyIndex] = await Promise.all([
      readFile(path.join(normalizedRoot, "index.generated.json"), "utf8").then(JSON.parse),
      readFile(path.join(historyRoot, "index.generated.json"), "utf8").then(JSON.parse),
    ]);
    if (normalizedIndex.riderCount !== historyIndex.riderCount) {
      differences.push("riderCount");
    }
    const normalizedFiles = await riderFiles(normalizedRoot);
    const historyFiles = await riderFiles(historyRoot);
    if (JSON.stringify(normalizedFiles) !== JSON.stringify(historyFiles)) {
      differences.push("rider file list");
    }
    for (const relativeFile of normalizedFiles) {
      const [normalized, history] = await Promise.all([
        readFile(path.join(normalizedRoot, relativeFile), "utf8").then(JSON.parse),
        readFile(path.join(historyRoot, relativeFile), "utf8").then(JSON.parse),
      ]);
      if (JSON.stringify(comparable(normalized)) !== JSON.stringify(comparable(history))) {
        differences.push(relativeFile);
      }
    }
    console.log("[kurari-ex rider exact history parity]");
    console.log(`riders: ${normalizedFiles.length}`);
    console.log(`differences: ${differences.length}`);
    for (const difference of differences) console.error(`MISMATCH: ${difference}`);
    if (differences.length) process.exitCode = 1;
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("[kurari-ex rider exact history parity] failed");
  console.error(error);
  process.exitCode = 1;
});
