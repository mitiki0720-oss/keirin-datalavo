import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const outputRoot = path.join(projectRoot, "public", "data", "analytics", "kurari-ex");
const importerPath = path.join(projectRoot, "scripts", "import-kurari-ex-seeds.mjs");
const thresholds = {
  index: 100 * 1024,
  venue: 100 * 1024,
  guidance: 100 * 1024,
  total: 120 * 1024 * 1024,
  exactIndex: 100 * 1024,
  exactVenue: 100 * 1024,
  exactTotal: 10 * 1024 * 1024,
  riderIndex: 500 * 1024,
  riderFile: 20 * 1024,
  riderTotal: 5 * 1024 * 1024,
  historyIndex: 200 * 1024,
  historyDaily: 300 * 1024,
  historyTotal: 100 * 1024 * 1024,
  historyProjectedAnnual: 100 * 1024 * 1024,
};

async function collectFiles(directory) {
  const files = [];
  async function visit(current) {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const target = path.join(current, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) await visit(target);
      if (entry.isFile()) files.push(target);
    }
  }
  await visit(directory);
  return files;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

async function main() {
  const files = await collectFiles(outputRoot);
  const warnings = [];
  const prohibited = [];
  let totalBytes = 0;
  let exactBytes = 0;
  let riderBytes = 0;
  let historyBytes = 0;
  let historyDailyBytes = 0;
  let historyDayCount = 0;
  let historyFilesOver300KbCount = 0;

  for (const file of files) {
    const relativePath = path.relative(outputRoot, file).replaceAll(path.sep, "/");
    const { size } = await stat(file);
    totalBytes += size;
    if (relativePath.startsWith("exact/")) exactBytes += size;
    if (relativePath.startsWith("exact/riders/")) riderBytes += size;
    if (relativePath.startsWith("history/")) historyBytes += size;
    const extension = path.extname(file).toLowerCase();

    if (extension === ".txt" || extension === ".md") {
      prohibited.push(`original text under public output: ${relativePath}`);
    }
    if (extension === ".zip") prohibited.push(`source ZIP under public output: ${relativePath}`);
    if (extension === ".html" || extension === ".htm") prohibited.push(`HTML under public output: ${relativePath}`);
    if (extension === ".jsonl") prohibited.push(`JSONL under public output: ${relativePath}`);
    if (relativePath === "index.generated.json" && size > thresholds.index) {
      warnings.push(`index exceeds 100 KB: ${relativePath} (${formatBytes(size)})`);
    }
    if (relativePath.startsWith("venues/") && size > thresholds.venue) {
      warnings.push(`venue JSON exceeds 100 KB: ${relativePath} (${formatBytes(size)})`);
    }
    if (relativePath.startsWith("guidance/") && size > thresholds.guidance) {
      warnings.push(`guidance JSON exceeds 100 KB: ${relativePath} (${formatBytes(size)})`);
    }
    if (relativePath === "exact/index.generated.json" && size > thresholds.exactIndex) {
      warnings.push(`exact index exceeds 100 KB: ${relativePath} (${formatBytes(size)})`);
    }
    if (relativePath.startsWith("exact/venues/") && size > thresholds.exactVenue) {
      warnings.push(`exact venue JSON exceeds 100 KB: ${relativePath} (${formatBytes(size)})`);
    }
    if (
      relativePath === "exact/riders/index.generated.json"
      && size > thresholds.riderIndex
    ) {
      warnings.push(`rider index exceeds 500 KB: ${relativePath} (${formatBytes(size)})`);
    }
    if (
      /^exact\/riders\/by-tail\/\d{2}\/\d{6}\.generated\.json$/u.test(relativePath)
      && size > thresholds.riderFile
    ) {
      warnings.push(`rider JSON exceeds 20 KB: ${relativePath} (${formatBytes(size)})`);
    }
    if (relativePath.startsWith("exact/riders/") && extension === ".json") {
      const content = await readFile(file, "utf8");
      if (
        /WINTICKET|かまし成功率|つっぱり成功率|ちぎり率|ちぎられ率|飛びつき成功率|競りの勝率/u
          .test(content)
      ) {
        prohibited.push(`WINTICKET-derived field under rider output: ${relativePath}`);
      }
      if (/"(?:raw|rawText|summary|html)"\s*:/u.test(content)) {
        prohibited.push(`raw text field under rider output: ${relativePath}`);
      }
      if (/<(?:html|body|script|div|table)\b/iu.test(content)) {
        prohibited.push(`embedded HTML under rider output: ${relativePath}`);
      }
    }
    if (
      relativePath === "history/index.generated.json"
      && size > thresholds.historyIndex
    ) {
      warnings.push(`history index exceeds 200 KB: ${relativePath} (${formatBytes(size)})`);
    }
    if (
      /^history\/daily\/\d{4}-\d{2}\/\d{4}-\d{2}-\d{2}\.generated\.json$/u.test(relativePath)
    ) {
      historyDayCount += 1;
      historyDailyBytes += size;
      if (size > thresholds.historyDaily) {
        historyFilesOver300KbCount += 1;
        warnings.push(`history daily JSON exceeds 300 KB: ${relativePath} (${formatBytes(size)})`);
      }
    }
    if (relativePath.startsWith("history/") && extension === ".json") {
      const content = await readFile(file, "utf8");
      if (/"(?:raw|rawText)"\s*:/iu.test(content)) {
        prohibited.push(`raw text field under history output: ${relativePath}`);
      }
      if (/"(?:sourceRef|sourceRefs|summaryFile|predictionFile|resultFile)"\s*:/iu.test(content)) {
        prohibited.push(`source reference under history output: ${relativePath}`);
      }
      if (/<(?:html|body|script|div|table)\b/iu.test(content)) {
        prohibited.push(`embedded HTML under history output: ${relativePath}`);
      }
    }
  }

  if (totalBytes > thresholds.total) {
    warnings.push(`KURARI EX output exceeds 120 MB: ${formatBytes(totalBytes)}`);
  }
  if (exactBytes > thresholds.exactTotal) {
    warnings.push(`KURARI EX exact output exceeds 10 MB: ${formatBytes(exactBytes)}`);
  }
  if (riderBytes > thresholds.riderTotal) {
    warnings.push(`KURARI EX rider output exceeds 5 MB: ${formatBytes(riderBytes)}`);
  }
  if (historyBytes > thresholds.historyTotal) {
    warnings.push(`KURARI EX compact history exceeds 100 MB: ${formatBytes(historyBytes)}`);
  }
  const historyAverageDailyBytes = historyDayCount
    ? Math.round(historyDailyBytes / historyDayCount)
    : 0;
  const historyProjectedAnnualBytes = historyAverageDailyBytes * 365;
  if (historyProjectedAnnualBytes > thresholds.historyProjectedAnnual) {
    warnings.push(
      `KURARI EX projected annual history exceeds 100 MB: ${formatBytes(historyProjectedAnnualBytes)}`,
    );
  }

  const importerSource = await readFile(importerPath, "utf8");
  const browserStorageIdentifier = ["local", "Storage"].join("");
  if (importerSource.includes(browserStorageIdentifier)) {
    prohibited.push("import script contains browser local storage usage");
  }

  console.log("[kurari-ex size check]");
  console.log(`files: ${files.length}`);
  console.log(`total: ${formatBytes(totalBytes)}`);
  console.log(`exact: ${formatBytes(exactBytes)}`);
  console.log(`riders: ${formatBytes(riderBytes)}`);
  console.log(`history: ${formatBytes(historyBytes)}`);
  console.log(`history dayCount: ${historyDayCount}`);
  console.log(`history averageDailyBytes: ${historyAverageDailyBytes}`);
  console.log(`history projectedAnnualBytes: ${historyProjectedAnnualBytes}`);
  console.log(`history filesOver300KbCount: ${historyFilesOver300KbCount}`);
  console.log(`warnings: ${warnings.length}`);
  console.log(`prohibited: ${prohibited.length}`);
  for (const warning of warnings) console.warn(`WARNING: ${warning}`);
  for (const error of prohibited) console.error(`ERROR: ${error}`);

  if (prohibited.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error("[kurari-ex size check] failed");
  console.error(error);
  process.exitCode = 1;
});
