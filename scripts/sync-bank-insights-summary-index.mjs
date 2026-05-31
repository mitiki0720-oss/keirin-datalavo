import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const insightsDir = path.join(repoRoot, "public", "data", "venues", "bank-insights");
const indexPath = path.join(insightsDir, "index.json");

const toIsoDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const normalizeDateText = (value) => {
  const match = String(value ?? "").match(/(20\d{2})[\/年.\-](\d{1,2})[\/月.\-](\d{1,2})/u);
  if (!match) return "";
  const [, year, month, day] = match;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

const resolveSummaryUpdatedAt = (filePath) => {
  const markdown = fs.readFileSync(filePath, "utf8");
  const preferredLine = markdown
    .split(/\r?\n/)
    .find((line) => /作成日|更新日|最終更新|updated/i.test(line));
  const preferredDate = normalizeDateText(preferredLine);
  if (preferredDate) return preferredDate;

  const periodLine = markdown
    .split(/\r?\n/)
    .find((line) => /反映期間|対象期間/u.test(line));
  const periodDate = normalizeDateText(periodLine);
  if (periodDate) return periodDate;

  return toIsoDate(fs.statSync(filePath).mtime);
};

const summaryFiles = new Map(
  fs.readdirSync(insightsDir)
    .filter((fileName) => fileName.endsWith("-summary.md"))
    .map((fileName) => [fileName.replace(/-summary\.md$/u, ""), fileName]),
);

const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
let readyCount = 0;
let plannedCount = 0;
let changed = false;

const nextIndex = index.map((entry) => {
  if (entry?.source !== "review-summary") return entry;

  const venueKey = String(entry.venueKey ?? "").trim();
  const summaryFileName = summaryFiles.get(venueKey);
  const expectedFile = `/data/venues/bank-insights/${venueKey}-summary.md`;
  const nextEntry = { ...entry, file: expectedFile };

  if (summaryFileName) {
    const summaryPath = path.join(insightsDir, summaryFileName);
    nextEntry.status = "ready";
    nextEntry.updatedAt = resolveSummaryUpdatedAt(summaryPath);
    readyCount += 1;
  } else {
    nextEntry.status = "planned";
    nextEntry.updatedAt = "";
    plannedCount += 1;
  }

  if (JSON.stringify(nextEntry) !== JSON.stringify(entry)) changed = true;
  return nextEntry;
});

const knownReviewKeys = new Set(
  nextIndex
    .filter((entry) => entry?.source === "review-summary")
    .map((entry) => entry.venueKey),
);

for (const venueKey of summaryFiles.keys()) {
  if (!knownReviewKeys.has(venueKey)) {
    console.warn(`[bank-insights-summary] skipped unknown venueKey: ${venueKey}`);
  }
}

if (changed) {
  fs.writeFileSync(indexPath, `${JSON.stringify(nextIndex, null, 2)}\n`, "utf8");
}

console.log(`[bank-insights-summary] ready: ${readyCount}`);
console.log(`[bank-insights-summary] planned: ${plannedCount}`);
console.log(`[bank-insights-summary] index ${changed ? "updated" : "unchanged"}`);
