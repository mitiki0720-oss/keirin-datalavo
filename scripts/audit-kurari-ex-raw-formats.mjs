import path from "node:path";
import {
  auditRoot,
  readInput,
  scanRawInputs,
  splitRaceBlocks,
  writeJson,
} from "./kurari-ex-history-common.mjs";

function increment(target, key) {
  if (!key) return;
  target[key] = (target[key] ?? 0) + 1;
}

function headingVariant(heading, type) {
  if (type === "summary") {
    return heading
      .replace(/20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}日?/u, "<DATE>")
      .replace(/\d{1,2}R/u, "<R>")
      .replace(/[（(].*[）)]/u, "(<META>)");
  }
  return heading.replace(/\d{1,2}R/u, "<R>");
}

async function main() {
  const scan = await scanRawInputs();
  const counts = { prediction: 0, result: 0, summary: 0 };
  const dates = [];
  const venues = new Set();
  const labelVariants = {};
  const headingVariants = {};
  const venueNameVariants = {};
  const warnings = [];

  for (const item of scan.recognized) {
    counts[item.type] += 1;
    if (item.date) dates.push(item.date);
    if (item.venueKey) venues.add(item.venueKey);
    const text = await readInput(item);
    const blocks = splitRaceBlocks(text, item.type);
    if (!blocks.length) warnings.push(`race headings not found: ${item.relativePath}`);
    for (const block of blocks) {
      increment(headingVariants, `${item.type}: ${headingVariant(block.heading, item.type)}`);
      increment(venueNameVariants, `${block.venueLabel} -> ${item.venueKey}`);
    }
    for (const line of text.split("\n")) {
      const match = line.match(
        /^\s*[-・]?\s*(並び|ライン|想定ライン|SHB|SB|1着|2着|3着|三連単|3連単|二車単|2車単|三連単1番人気|3連単1番人気|レースタイプ|レース型|自信度|勝負レース印|天気|天候|風速|風向)\s*[:：]/u,
      );
      if (match) increment(labelVariants, match[1]);
    }
  }

  const missingPrediction = scan.groups.filter((group) => !group.prediction.length);
  const missingResult = scan.groups.filter((group) => !group.result.length);
  const missingSummary = scan.groups.filter((group) => !group.summary.length);
  for (const group of missingPrediction) warnings.push(`${group.key}: prediction missing`);
  for (const group of missingResult) warnings.push(`${group.key}: result missing`);
  for (const group of missingSummary) warnings.push(`${group.key}: summary missing`);
  for (const item of scan.unclassified) warnings.push(`unclassified file: ${item.relativePath}`);

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    inputFileCount: scan.files.length,
    predictionFileCount: counts.prediction,
    resultFileCount: counts.result,
    summaryFileCount: counts.summary,
    completeTripletCount: scan.groups.filter(
      (group) => group.prediction.length && group.result.length && group.summary.length,
    ).length,
    missingPredictionCount: missingPrediction.length,
    missingResultCount: missingResult.length,
    missingSummaryCount: missingSummary.length,
    dateFrom: dates.sort()[0] ?? null,
    dateTo: dates.sort().at(-1) ?? null,
    venueCount: venues.size,
    labelVariants,
    headingVariants,
    venueNameVariants,
    irregularFilenames: scan.recognized
      .filter((item) => item.irregular)
      .map((item) => item.relativePath),
    warnings,
  };
  const output = path.join(auditRoot, "raw-format-audit.generated.json");
  await writeJson(output, report);

  console.log("[kurari-ex raw format audit]");
  console.log(`input files: ${report.inputFileCount}`);
  console.log(`prediction: ${report.predictionFileCount}`);
  console.log(`result: ${report.resultFileCount}`);
  console.log(`summary: ${report.summaryFileCount}`);
  console.log(`complete triplets: ${report.completeTripletCount}`);
  console.log(`missing summary: ${report.missingSummaryCount}`);
  console.log(`period: ${report.dateFrom} to ${report.dateTo}`);
  console.log(`venues: ${report.venueCount}`);
  console.log(`warnings: ${report.warnings.length}`);
}

main().catch((error) => {
  console.error("[kurari-ex raw format audit] failed");
  console.error(error);
  process.exitCode = 1;
});
