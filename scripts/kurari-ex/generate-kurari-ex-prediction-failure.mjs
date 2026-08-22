import path from "node:path";
import {
  addDays,
  buildPredictionFailureArtifact,
  formatJstDate,
  outputPath,
  parseArgs,
  projectRoot,
  sampleDistribution,
  writePredictionFailureArtifact,
} from "./prediction-failure-common.mjs";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const targetDate = args["target-date"] ?? formatJstDate();
  const historicalFrom = args.from ?? "2026-07-14";
  const historicalTo = args.to ?? addDays(targetDate, -1);
  const reviewsRoot = args["reviews-root"]
    ? path.resolve(args["reviews-root"])
    : path.join(projectRoot, "public", "data", "reviews");
  const write = Boolean(args.write);

  const artifact = await buildPredictionFailureArtifact({
    reviewsRoot,
    historicalFrom,
    historicalTo,
    targetDate,
  });
  const sample = sampleDistribution(artifact, "2026-08-14", "2026-08-21");

  console.log("[kurari-ex-prediction-failure] mode:", write ? "write" : "dry-run");
  console.log("[kurari-ex-prediction-failure] targetDate:", targetDate);
  console.log("[kurari-ex-prediction-failure] historical:", `${historicalFrom}..${historicalTo}`);
  console.log("[kurari-ex-prediction-failure] reviewsRoot:", reviewsRoot);
  console.log("[kurari-ex-prediction-failure] raceCount:", artifact.raceCount);
  console.log("[kurari-ex-prediction-failure] classifiableRaceCount:", artifact.classifiableRaceCount);
  console.log("[kurari-ex-prediction-failure] summary:", JSON.stringify(artifact.summary));
  console.log("[kurari-ex-prediction-failure] sourceCoverage:", JSON.stringify(artifact.sourceCoverage));
  console.log("[kurari-ex-prediction-failure] sample 2026-08-14..2026-08-21:", JSON.stringify(sample));
  console.log("[kurari-ex-prediction-failure] output:", outputPath);

  if (artifact.duplicateRaceKeys.length > 0) {
    console.error("[kurari-ex-prediction-failure] duplicateRaceKeys:", artifact.duplicateRaceKeys.join(", "));
    process.exitCode = 1;
    return;
  }
  if (artifact.leakageGuard.currentOrFutureResultUsed) {
    console.error("[kurari-ex-prediction-failure] current/future result leakage detected");
    process.exitCode = 1;
    return;
  }
  if (write) await writePredictionFailureArtifact(artifact);
}

main().catch((error) => {
  console.error("[kurari-ex-prediction-failure] failed:", error);
  process.exitCode = 1;
});
