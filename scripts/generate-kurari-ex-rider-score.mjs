import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const riderIndexPath = path.join(
  ROOT,
  "public/data/analytics/kurari-ex/exact/riders/index.generated.json"
);

const outDir = path.join(
  ROOT,
  "public/data/analytics/kurari-ex/analysis"
);

const outFile = path.join(outDir, "rider-score.generated.json");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function safeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function rateValue(rateObject) {
  const value = rateObject?.rate;
  return Number.isFinite(value) ? value : null;
}

function qualityWeight(quality) {
  if (quality === "complete") return 1.0;
  if (quality === "partial") return 0.82;
  if (quality === "low-sample") return 0.58;
  if (quality === "identity-only") return 0.12;
  return 0.4;
}

function dataStatus(quality) {
  if (quality === "complete") return "complete";
  if (quality === "partial") return "partial-growing";
  if (quality === "low-sample") return "low-sample-growing";
  if (quality === "identity-only") return "identity-only-growing";
  return "growing";
}

function rankHint(score, quality) {
  if (quality === "identity-only") return "ID";
  if (score >= 82) return "A";
  if (score >= 70) return "B";
  if (score >= 56) return "C";
  return "D";
}

function makeTags(quality, confirmedStartCount, top2Rate, top3Rate, warnings) {
  const tags = [];

  if (quality === "complete") {
    tags.push("COMPLETE_PROFILE");
  }

  if (quality === "partial") {
    tags.push("PARTIAL_DATA");
  }

  if (quality === "low-sample") {
    tags.push("LOW_SAMPLE_GROWING");
  }

  if (quality === "identity-only") {
    tags.push("IDENTITY_ONLY_GROWING");
  }

  if (confirmedStartCount < 5) {
    tags.push("CONFIRMED_START_SHORT");
  }

  if (Number.isFinite(top3Rate) && top3Rate >= 30) {
    tags.push("TOP3_CANDIDATE");
  }

  if (Number.isFinite(top2Rate) && top2Rate >= 20) {
    tags.push("TOP2_CANDIDATE");
  }

  if ((warnings ?? []).some((x) => String(x).includes("role unavailable"))) {
    tags.push("ROLE_MISSING");
  }

  return tags;
}

function buildItem(indexItem) {
  const detailPath = path.join(
    ROOT,
    "public",
    String(indexItem.file || "").replace(/^\/+/, "")
  );

  const detail = fs.existsSync(detailPath) ? readJson(detailPath) : null;

  const quality = indexItem.quality || detail?.quality || "identity-only";

  const coverage = detail?.coverage ?? {};
  const overall = detail?.overall ?? {};

  const confirmedStartCount = safeNumber(
    coverage.confirmedStartCount,
    safeNumber(indexItem.confirmedStartCount, 0)
  );

  const observedRaceCount = safeNumber(
    coverage.observedRaceCount,
    safeNumber(indexItem.observedRaceCount, 0)
  );

  const roleEligibleCount = safeNumber(
    coverage.roleEligibleCount,
    safeNumber(indexItem.roleEligibleCount, 0)
  );

  const venueCount = safeNumber(coverage.venueCount, 0);

  const winRate = rateValue(overall.winRate);
  const top2Rate = rateValue(overall.top2Rate);
  const top3Rate = rateValue(overall.top3Rate);

  const volumeScore = Math.min(confirmedStartCount, 12) * 2.2;
  const venueScore = Math.min(venueCount, 5) * 2.2;
  const roleScore = Math.min(roleEligibleCount, 8) * 1.4;

  const resultScore =
    safeNumber(winRate, 0) * 0.20 +
    safeNumber(top2Rate, 0) * 0.32 +
    safeNumber(top3Rate, 0) * 0.48;

  let score = 24 + volumeScore + venueScore + roleScore + resultScore;
  score = score * qualityWeight(quality);

  if (quality === "identity-only") score = Math.min(score, 18);
  if (quality === "low-sample") score = Math.min(score, 58);
  if (quality === "partial") score = Math.min(score, 78);

  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    registrationNo: indexItem.registrationNo,
    name: indexItem.name,
    nameKey: indexItem.nameKey,
    prefecture: indexItem.prefecture ?? "",
    class: indexItem.class ?? "",
    file: indexItem.file,

    score,
    rankHint: rankHint(score, quality),
    quality,
    dataStatus: dataStatus(quality),

    coverage: {
      observedRaceCount,
      confirmedStartCount,
      roleEligibleCount,
      venueCount
    },

    rates: {
      winRate,
      top2Rate,
      top3Rate
    },

    tags: makeTags(
      quality,
      confirmedStartCount,
      top2Rate,
      top3Rate,
      detail?.warnings ?? []
    ),

    warnings: detail?.warnings ?? []
  };
}

fs.mkdirSync(outDir, { recursive: true });

const riderIndex = readJson(riderIndexPath);

const items = riderIndex.items.map(buildItem);

items.sort((a, b) => {
  if (b.score !== a.score) return b.score - a.score;
  return b.coverage.confirmedStartCount - a.coverage.confirmedStartCount;
});

items.forEach((item, index) => {
  item.rank = index + 1;
});

const qualityCounts = {};

for (const item of items) {
  qualityCounts[item.quality] = (qualityCounts[item.quality] ?? 0) + 1;
}

const output = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: "kurari-ex-rider-score-v1",
  sourceType: "EXACT_RIDER_SCORE",
  period: riderIndex.period,

  inclusionPolicy: {
    riders: "include-all-known-riders",
    sparseDataHandling: "keep-and-mark-as-identity-only-low-sample-or-growing",
    deletionPolicy: "never-drop-low-sample-riders"
  },

  riderCount: items.length,
  riderMasterCount: riderIndex.riderMasterCount,
  identityOnlyRiderCount: riderIndex.identityOnlyRiderCount,
  qualityCounts,
  items
};

fs.writeFileSync(outFile, JSON.stringify(output, null, 2) + "\n", "utf8");

console.log("[kurari-ex rider score]");
console.log("period:", riderIndex.period?.from, "to", riderIndex.period?.to);
console.log("riders:", items.length);
console.log("qualityCounts:", JSON.stringify(qualityCounts));
console.log("output:", path.relative(ROOT, outFile));
console.log("top:");
for (const item of items.slice(0, 10)) {
  console.log(`${item.rank}. ${item.name} / score=${item.score} / ${item.quality}`);
}
