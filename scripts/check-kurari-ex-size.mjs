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
  total: 20 * 1024 * 1024,
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

  for (const file of files) {
    const relativePath = path.relative(outputRoot, file).replaceAll(path.sep, "/");
    const { size } = await stat(file);
    totalBytes += size;
    const extension = path.extname(file).toLowerCase();

    if (extension === ".txt" || extension === ".md") {
      prohibited.push(`original text under public output: ${relativePath}`);
    }
    if (extension === ".zip") prohibited.push(`source ZIP under public output: ${relativePath}`);
    if (extension === ".html" || extension === ".htm") prohibited.push(`HTML under public output: ${relativePath}`);
    if (relativePath === "index.generated.json" && size > thresholds.index) {
      warnings.push(`index exceeds 100 KB: ${relativePath} (${formatBytes(size)})`);
    }
    if (relativePath.startsWith("venues/") && size > thresholds.venue) {
      warnings.push(`venue JSON exceeds 100 KB: ${relativePath} (${formatBytes(size)})`);
    }
    if (relativePath.startsWith("guidance/") && size > thresholds.guidance) {
      warnings.push(`guidance JSON exceeds 100 KB: ${relativePath} (${formatBytes(size)})`);
    }
  }

  if (totalBytes > thresholds.total) {
    warnings.push(`KURARI EX output exceeds 20 MB: ${formatBytes(totalBytes)}`);
  }

  const importerSource = await readFile(importerPath, "utf8");
  const browserStorageIdentifier = ["local", "Storage"].join("");
  if (importerSource.includes(browserStorageIdentifier)) {
    prohibited.push("import script contains browser local storage usage");
  }

  console.log("[kurari-ex size check]");
  console.log(`files: ${files.length}`);
  console.log(`total: ${formatBytes(totalBytes)}`);
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
