import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const exRoot = path.join(projectRoot, "public", "data", "analytics", "kurari-ex");
const venueRoot = path.join(exRoot, "venues");
const analysisRoot = path.join(exRoot, "analysis");

const now = new Date().toISOString();

function round(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return null;
  const unit = 10 ** digits;
  return Math.round(Number(value) * unit) / unit;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function scoreRecovery(rate) {
  const v = numberOrNull(rate);
  if (v === null) return 20;
  if (v >= 100) return 40;
  if (v >= 80) return 34;
  if (v >= 65) return 28;
  if (v >= 50) return 22;
  if (v >= 35) return 16;
  return 10;
}

function scoreHitRate(rate) {
  const v = numberOrNull(rate);
  if (v === null) return 12;
  if (v >= 35) return 25;
  if (v >= 28) return 22;
  if (v >= 22) return 18;
  if (v >= 16) return 14;
  return 10;
}

function scoreSourceCount(count) {
  const v = numberOrNull(count) ?? 0;
  if (v >= 20) return 20;
  if (v >= 14) return 17;
  if (v >= 10) return 14;
  if (v >= 7) return 11;
  return 8;
}

function scoreInsightStrength(insights) {
  if (!Array.isArray(insights) || insights.length === 0) return 5;
  const high = insights.filter((item) => item.confidence === "high").length;
  const medium = insights.filter((item) => item.confidence === "medium").length;
  return Math.min(15, high * 2 + medium);
}

function riskLevel(recoveryRate, hitRate, sourceCount) {
  const recovery = numberOrNull(recoveryRate);
  const hit = numberOrNull(hitRate);
  const sources = numberOrNull(sourceCount) ?? 0;

  if (sources < 7) return "sample-short";
  if ((recovery ?? 0) < 45) return "high-risk";
  if ((recovery ?? 0) < 65) return "caution";
  if ((recovery ?? 0) >= 80 || (hit ?? 0) >= 30) return "positive";
  return "watch";
}

function topInsights(insights) {
  return [...(insights ?? [])]
    .sort((a, b) => {
      const ac = a.confidence === "high" ? 2 : a.confidence === "medium" ? 1 : 0;
      const bc = b.confidence === "high" ? 2 : b.confidence === "medium" ? 1 : 0;
      if (bc !== ac) return bc - ac;
      return (b.evidenceCount ?? 0) - (a.evidenceCount ?? 0);
    })
    .slice(0, 6)
    .map((item) => ({
      tag: item.tag,
      label: item.label,
      evidenceCount: item.evidenceCount ?? 0,
      confidence: item.confidence ?? "unknown",
    }));
}

function guidancePriority(venue) {
  const insights = topInsights(venue.seedInsights);
  const guidance = Array.isArray(venue.predictionGuidance) ? venue.predictionGuidance : [];
  const notes = venue.seedNotes ?? {};

  const cautionNotes = Array.isArray(notes.cautions) ? notes.cautions : [];
  const improvementNotes = Array.isArray(notes.improvements) ? notes.improvements : [];

  const merged = [
    ...guidance.slice(0, 5),
    ...cautionNotes.slice(0, 3),
    ...improvementNotes.slice(0, 3),
  ];

  return [...new Set(merged)].slice(0, 8).map((text, index) => ({
    priority: index + 1,
    text,
    sourceType: index < guidance.slice(0, 5).length ? "predictionGuidance" : "seedNotes",
  }));
}

function buildVenueScore(venue) {
  const kpi = venue.seedKpi ?? {};
  const recoveryRate = numberOrNull(kpi.recoveryRate);
  const trifectaHitRate = numberOrNull(kpi.trifectaHitRate);
  const hitRate = numberOrNull(kpi.hitRate);
  const sourceCount = numberOrNull(kpi.sourceCount) ?? 0;

  const score =
    scoreRecovery(recoveryRate) +
    scoreHitRate(trifectaHitRate ?? hitRate) +
    scoreSourceCount(sourceCount) +
    scoreInsightStrength(venue.seedInsights);

  const normalizedScore = Math.max(0, Math.min(100, score));

  return {
    venueKey: venue.venueKey,
    venueName: venue.venueName,
    period: venue.period,
    sourceType: venue.sourceType,
    quality: venue.quality,
    score: normalizedScore,
    rankHint:
      normalizedScore >= 80 ? "A" :
      normalizedScore >= 68 ? "B" :
      normalizedScore >= 55 ? "C" :
      normalizedScore >= 42 ? "D" : "E",
    riskLevel: riskLevel(recoveryRate, trifectaHitRate ?? hitRate, sourceCount),
    kpi: {
      sourceCount,
      raceCount: numberOrNull(kpi.raceCount),
      trifectaHits: numberOrNull(kpi.trifectaHits),
      trifectaHitRate: round(kpi.trifectaHitRate),
      exactaHits: numberOrNull(kpi.exactaHits),
      exactaHitRate: round(kpi.exactaHitRate),
      anyTicketHits: numberOrNull(kpi.anyTicketHits),
      hitRate: round(kpi.hitRate),
      investmentYen: numberOrNull(kpi.investmentYen),
      returnYen: numberOrNull(kpi.returnYen),
      recoveryRate: round(kpi.recoveryRate),
      kimarite: kpi.kimarite ?? {},
    },
    topInsights: topInsights(venue.seedInsights),
    guidance: guidancePriority(venue),
  };
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function writeJson(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function main() {
  const [status, globalKpi] = await Promise.all([
    readJson(path.join(exRoot, "status.generated.json")),
    readJson(path.join(exRoot, "global", "prediction-kpi.generated.json")),
  ]);

  const venueFiles = (await readdir(venueRoot))
    .filter((name) => name.endsWith(".generated.json"))
    .sort();

  const venues = [];
  for (const fileName of venueFiles) {
    const venue = await readJson(path.join(venueRoot, fileName));
    venues.push(venue);
  }

  const venueScores = venues
    .map(buildVenueScore)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.venueName.localeCompare(b.venueName, "ja");
    })
    .map((item, index) => ({
      rank: index + 1,
      ...item,
    }));

  const tagMap = new Map();
  for (const venue of venues) {
    for (const insight of venue.seedInsights ?? []) {
      const current = tagMap.get(insight.tag) ?? {
        tag: insight.tag,
        label: insight.label,
        venueCount: 0,
        evidenceCount: 0,
        highConfidenceVenueCount: 0,
        venues: [],
      };

      current.venueCount += 1;
      current.evidenceCount += insight.evidenceCount ?? 0;
      if (insight.confidence === "high") current.highConfidenceVenueCount += 1;
      current.venues.push({
        venueKey: venue.venueKey,
        venueName: venue.venueName,
        evidenceCount: insight.evidenceCount ?? 0,
        confidence: insight.confidence ?? "unknown",
      });

      tagMap.set(insight.tag, current);
    }
  }

  const insightTags = [...tagMap.values()]
    .map((tag) => ({
      ...tag,
      venues: tag.venues
        .sort((a, b) => (b.evidenceCount ?? 0) - (a.evidenceCount ?? 0))
        .slice(0, 12),
    }))
    .sort((a, b) => b.evidenceCount - a.evidenceCount);

  const nextGuidance = venueScores.map((venue) => ({
    venueKey: venue.venueKey,
    venueName: venue.venueName,
    score: venue.score,
    rankHint: venue.rankHint,
    riskLevel: venue.riskLevel,
    period: venue.period,
    keyWarnings: venue.topInsights.slice(0, 4),
    nextActions: venue.guidance.slice(0, 6),
  }));

  const metadata = {
    schemaVersion: 1,
    generatedAt: now,
    source: "kurari-ex-analysis-v1",
    sourceType: "SEED_ANALYSIS",
    period: {
      from: status.dateFrom,
      to: status.dateTo,
    },
    sourceStatus: {
      inputFileCount: status.inputFileCount,
      predictionFileCount: status.predictionFileCount,
      resultFileCount: status.resultFileCount,
      summaryFileCount: status.summaryFileCount,
      completeTripletCount: status.completeTripletCount,
      warningCount: status.warningCount,
    },
    globalKpi: globalKpi.kpi,
    inclusionPolicy: {
      venues: "include-all-generated-venues",
      riders: "include-all-known-riders-when-rider-analysis-is-generated",
      sparseDataHandling: "keep-and-mark-as-sample-short-or-growing",
      deletionPolicy: "never-drop-low-sample-entities",
    },
  };

  await writeJson(path.join(analysisRoot, "venue-score.generated.json"), {
    ...metadata,
    venueCount: venueScores.length,
    items: venueScores,
  });

  await writeJson(path.join(analysisRoot, "insight-tags.generated.json"), {
    ...metadata,
    tagCount: insightTags.length,
    items: insightTags,
  });

  await writeJson(path.join(analysisRoot, "next-guidance.generated.json"), {
    ...metadata,
    venueCount: nextGuidance.length,
    items: nextGuidance,
  });

  console.log("[kurari-ex analysis]");
  console.log(`period: ${metadata.period.from} to ${metadata.period.to}`);
  console.log(`venues: ${venueScores.length}`);
  console.log(`insight tags: ${insightTags.length}`);
  console.log("outputs:");
  console.log("- public/data/analytics/kurari-ex/analysis/venue-score.generated.json");
  console.log("- public/data/analytics/kurari-ex/analysis/insight-tags.generated.json");
  console.log("- public/data/analytics/kurari-ex/analysis/next-guidance.generated.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
