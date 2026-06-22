import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ANALYSIS_DIR = path.join(ROOT, "public", "data", "analytics", "kurari-ex", "analysis");
const OUTPUT_FILE = path.join(ANALYSIS_DIR, "today-recommendation.generated.json");

const TEXT = {
  battleMemo: "\u0073\u0063\u006f\u0072\u0065\u4e0a\u4f4d\u3002\u307e\u305a\u5c55\u958b\u4e88\u60f3\u306e\u8ef8\u5019\u88dc\u3068\u3057\u3066\u78ba\u8a8d\u3002",
  thirdGuardMemo: "\u0033\u7740\u3092\u672c\u7dda\u3060\u3051\u3067\u56fa\u5b9a\u3057\u306a\u3044\u3002\u5225\u7dda\u30fb\u5358\u9a0e\u30fb\u756a\u624b\u5dee\u3057\u3092\u4fdd\u8b77\u3002",
  windMemo: "\u98a8\u5411\u30fb\u98a8\u901f\u3067\u5148\u884c\u6b8b\u308a\u002f\u5dee\u3057\u5c4a\u304d\u306e\u8a55\u4fa1\u3092\u56fa\u5b9a\u3057\u306a\u3044\u3002",
  lowSampleMemo: "\u4f4e\u30b5\u30f3\u30d7\u30eb\u3002\u8868\u793a\u304b\u3089\u6d88\u3055\u305a\u3001\u904e\u4fe1\u305b\u305a\u80b2\u6210\u6271\u3044\u3002",
  riderMemo: "\u9078\u624b\u30ab\u30eb\u30c6\u4e0a\u4f4d\u3002\u51fa\u8d70\u8868\u306b\u51fa\u305f\u3089\u76f8\u624b\u30fb\u8ef8\u5019\u88dc\u3068\u3057\u3066\u78ba\u8a8d\u3002",
  predictionMemo: [
    "\u0073\u0063\u006f\u0072\u0065\u4e0a\u4f4d\u4f1a\u5834\u306f\u8ef8\u5019\u88dc\u3068\u3057\u3066\u898b\u308b\u3002\u305f\u3060\u3057\u56de\u53ce\u7387\u3068\u0033\u7740\u4fdd\u8b77\u3092\u540c\u6642\u306b\u78ba\u8a8d\u3059\u308b\u3002",
    "\u0054\u0048\u0049\u0052\u0044\u005f\u0050\u004c\u0041\u0043\u0045\u005f\u0053\u0050\u0052\u0045\u0041\u0044\u0020\u002f\u0020\u0053\u004f\u004c\u004f\u005f\u0052\u0049\u0044\u0045\u0052\u005f\u0041\u004c\u0045\u0052\u0054\u0020\u002f\u0020\u0042\u0041\u004e\u0054\u0045\u005f\u0053\u0041\u0053\u0048\u0049\u005f\u0041\u004c\u0045\u0052\u0054\u0020\u304c\u51fa\u308b\u4f1a\u5834\u306f\u0033\u7740\u3092\u56fa\u5b9a\u3057\u306a\u3044\u3002",
    "\u0057\u0049\u004e\u0044\u005f\u0053\u0045\u004e\u0053\u0049\u0054\u0049\u0056\u0045\u0020\u304c\u51fa\u308b\u4f1a\u5834\u306f\u98a8\u5411\u30fb\u98a8\u901f\u3067\u5148\u884c\u6b8b\u308a\u3068\u5dee\u3057\u5c4a\u304d\u3092\u518d\u8a55\u4fa1\u3059\u308b\u3002",
    "\u0073\u0061\u006d\u0070\u006c\u0065\u002d\u0073\u0068\u006f\u0072\u0074\u0020\u306f\u6d88\u3055\u305a\u306b\u6b8b\u3059\u3002\u305f\u3060\u3057\u52dd\u8ca0\u5ea6\u306f\u4e0b\u3052\u3066\u3001\u80b2\u6210\u30c7\u30fc\u30bf\u3068\u3057\u3066\u6271\u3046\u3002",
    "\u9078\u624b\u30ab\u30eb\u30c6\u4e0a\u4f4d\u306f\u51fa\u8d70\u8868\u306b\u51fa\u305f\u6642\u3060\u3051\u4f7f\u3046\u3002\u540d\u524d\u3060\u3051\u3067\u904e\u4fe1\u305b\u305a\u3001\u30e9\u30a4\u30f3\u3068\u756a\u624b\u4f4d\u7f6e\u3092\u5408\u308f\u305b\u308b\u3002",
  ],
};

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function pct(value) {
  return Number.isFinite(value) ? Math.round(Number(value) * 10) / 10 : null;
}

function top(items, count) {
  return items.slice(0, count);
}

function hasInsight(item, tags) {
  const insights = Array.isArray(item.topInsights) ? item.topInsights : [];
  return insights.some((insight) => tags.includes(insight.tag));
}

function pickGuidance(guidanceItem) {
  const actions = Array.isArray(guidanceItem?.nextActions) ? guidanceItem.nextActions : [];
  return actions.slice(0, 4).map((action) => ({
    priority: action.priority ?? null,
    text: action.text,
    sourceType: action.sourceType ?? "unknown",
  }));
}

const status = readJson(path.join(ROOT, "public", "data", "analytics", "kurari-ex", "status.generated.json"));
const venueScore = readJson(path.join(ANALYSIS_DIR, "venue-score.generated.json"));
const nextGuidance = readJson(path.join(ANALYSIS_DIR, "next-guidance.generated.json"));
const insightTags = readJson(path.join(ANALYSIS_DIR, "insight-tags.generated.json"));
const riderScore = readJson(path.join(ANALYSIS_DIR, "rider-score.generated.json"));

const venues = Array.isArray(venueScore.items) ? venueScore.items : [];
const guidanceByVenue = new Map((nextGuidance.items ?? []).map((item) => [item.venueKey, item]));

const stableVenues = venues
  .filter((item) => item.riskLevel !== "sample-short")
  .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

const battleVenues = stableVenues
  .filter((item) => (item.score ?? 0) >= 70 || item.rankHint === "A")
  .map((item) => ({
    venueKey: item.venueKey,
    venueName: item.venueName,
    score: item.score,
    rankHint: item.rankHint,
    riskLevel: item.riskLevel,
    raceCount: item.kpi?.raceCount ?? null,
    recoveryRate: pct(item.kpi?.recoveryRate),
    trifectaHitRate: pct(item.kpi?.trifectaHitRate),
    memo: TEXT.battleMemo,
    actions: pickGuidance(guidanceByVenue.get(item.venueKey)),
  }));

const thirdTags = ["THIRD_PLACE_SPREAD", "SOLO_RIDER_ALERT", "BANTE_SASHI_ALERT"];

const thirdGuardVenues = venues
  .filter((item) => hasInsight(item, thirdTags))
  .sort((a, b) => {
    const aCount = (a.topInsights ?? []).reduce((sum, insight) => sum + (thirdTags.includes(insight.tag) ? insight.evidenceCount ?? 0 : 0), 0);
    const bCount = (b.topInsights ?? []).reduce((sum, insight) => sum + (thirdTags.includes(insight.tag) ? insight.evidenceCount ?? 0 : 0), 0);
    return bCount - aCount;
  })
  .map((item) => ({
    venueKey: item.venueKey,
    venueName: item.venueName,
    score: item.score,
    rankHint: item.rankHint,
    riskLevel: item.riskLevel,
    tags: (item.topInsights ?? [])
      .filter((insight) => thirdTags.includes(insight.tag))
      .map((insight) => ({
        tag: insight.tag,
        label: insight.label,
        evidenceCount: insight.evidenceCount,
        confidence: insight.confidence,
      })),
    memo: TEXT.thirdGuardMemo,
    actions: pickGuidance(guidanceByVenue.get(item.venueKey)),
  }));

const windCautionVenues = venues
  .filter((item) => hasInsight(item, ["WIND_SENSITIVE"]))
  .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  .map((item) => ({
    venueKey: item.venueKey,
    venueName: item.venueName,
    score: item.score,
    rankHint: item.rankHint,
    riskLevel: item.riskLevel,
    memo: TEXT.windMemo,
    actions: pickGuidance(guidanceByVenue.get(item.venueKey)),
  }));

const lowSampleVenues = venues
  .filter((item) => item.riskLevel === "sample-short" || (item.kpi?.sourceCount ?? 0) < 5)
  .sort((a, b) => (a.kpi?.sourceCount ?? 0) - (b.kpi?.sourceCount ?? 0))
  .map((item) => ({
    venueKey: item.venueKey,
    venueName: item.venueName,
    score: item.score,
    rankHint: item.rankHint,
    riskLevel: item.riskLevel,
    sourceCount: item.kpi?.sourceCount ?? null,
    raceCount: item.kpi?.raceCount ?? null,
    memo: TEXT.lowSampleMemo,
  }));

const topRiders = (riderScore.items ?? [])
  .filter((item) => item.quality === "complete")
  .slice(0, 20)
  .map((item) => ({
    rank: item.rank,
    registrationNo: item.registrationNo,
    name: item.name,
    prefecture: item.prefecture,
    class: item.class,
    score: item.score,
    rankHint: item.rankHint,
    confirmedStartCount: item.coverage?.confirmedStartCount ?? null,
    winRate: pct(item.rates?.winRate),
    top2Rate: pct(item.rates?.top2Rate),
    top3Rate: pct(item.rates?.top3Rate),
    tags: item.tags ?? [],
    memo: TEXT.riderMemo,
  }));

const globalTags = (insightTags.items ?? []).slice(0, 6).map((item) => ({
  tag: item.tag,
  label: item.label,
  venueCount: item.venueCount,
  evidenceCount: item.evidenceCount,
  highConfidenceVenueCount: item.highConfidenceVenueCount,
}));

const output = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: "kurari-ex-today-recommendation-v1",
  sourceType: "SEED_ANALYSIS_PLUS_RIDER_SCORE",
  period: {
    from: venueScore.period?.from ?? status.dateFrom ?? null,
    to: venueScore.period?.to ?? status.dateTo ?? null,
  },
  sourceStatus: {
    inputFileCount: status.inputFileCount ?? status.rawInputFileCount ?? null,
    predictionFileCount: status.predictionFileCount ?? null,
    resultFileCount: status.resultFileCount ?? null,
    summaryFileCount: status.summaryFileCount ?? null,
    completeTripletCount: status.completeTripletCount ?? null,
    venueCount: status.venueCount ?? null,
    riderCount: riderScore.riderCount ?? null,
  },
  sections: {
    battleVenues: top(battleVenues, 10),
    thirdGuardVenues: top(thirdGuardVenues, 10),
    windCautionVenues: top(windCautionVenues, 10),
    lowSampleVenues: top(lowSampleVenues, 10),
    topRiders,
    globalTags,
    predictionMemo: TEXT.predictionMemo,
  },
};

ensureDir(ANALYSIS_DIR);
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2) + "\n", "utf8");

console.log("generated:", path.relative(ROOT, OUTPUT_FILE));
console.log("battleVenues:", output.sections.battleVenues.length);
console.log("thirdGuardVenues:", output.sections.thirdGuardVenues.length);
console.log("windCautionVenues:", output.sections.windCautionVenues.length);
console.log("lowSampleVenues:", output.sections.lowSampleVenues.length);
console.log("topRiders:", output.sections.topRiders.length);
