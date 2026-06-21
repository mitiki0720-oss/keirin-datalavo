import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const outputRoot = path.join(projectRoot, "public", "data", "analytics", "kurari-ex");
const topStatusPath = path.join(outputRoot, "status.generated.json");
const historyIndexPath = path.join(outputRoot, "history", "index.generated.json");
const historyStatusPath = path.join(outputRoot, "history", "status.generated.json");

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function serializeJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function main() {
  const [topStatus, historyIndex, historyStatus] = await Promise.all([
    readJson(topStatusPath),
    readJson(historyIndexPath),
    readJson(historyStatusPath),
  ]);

  const items = Array.isArray(historyIndex.items) ? historyIndex.items : [];
  if (!items.length) {
    throw new Error("history index has no items");
  }

  const first = items[0];
  const latest = items[items.length - 1];
  if (!first?.date || !latest?.date) {
    throw new Error("history index items are missing date fields");
  }

  const nextStatus = {
    ...topStatus,
    dateFrom: first.date,
    dateTo: latest.date,
  };

  if (topStatus.dateTo !== latest.date || topStatus.dateFrom !== first.date) {
    nextStatus.lastImportAt = historyIndex.generatedAt ?? historyStatus.generatedAt ?? topStatus.lastImportAt;
  }

  const before = serializeJson(topStatus);
  const after = serializeJson(nextStatus);

  console.log("[kurari-ex status sync]");
  console.log(`history dateFrom: ${first.date}`);
  console.log(`history dateTo  : ${latest.date}`);
  console.log(`top dateFrom    : ${topStatus.dateFrom ?? "--"}`);
  console.log(`top dateTo      : ${topStatus.dateTo ?? "--"}`);

  if (before === after) {
    console.log("status: unchanged");
    return;
  }

  await writeFile(topStatusPath, after, "utf8");
  console.log("status: updated");
}

main().catch((error) => {
  console.error("[kurari-ex status sync] failed");
  console.error(error);
  process.exitCode = 1;
});