import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const analysisDir = path.join(
  ROOT,
  "public/data/analytics/kurari-ex/analysis"
);

const scoreFile = path.join(analysisDir, "rider-score.generated.json");
const tagsFile = path.join(analysisDir, "rider-tags.generated.json");
const guidanceFile = path.join(analysisDir, "rider-guidance.generated.json");

const score = JSON.parse(fs.readFileSync(scoreFile, "utf8"));

const tagLabels = {
  COMPLETE_PROFILE: "分析可能",
  PARTIAL_DATA: "部分データ",
  LOW_SAMPLE_GROWING: "低サンプル育成中",
  IDENTITY_ONLY_GROWING: "IDのみ育成中",
  CONFIRMED_START_SHORT: "出走数不足",
  TOP3_CANDIDATE: "3着候補",
  TOP2_CANDIDATE: "2着候補",
  ROLE_MISSING: "役割欠損あり"
};

const tagMemo = {
  COMPLETE_PROFILE: "出走実績があり、条件別評価に使いやすい。",
  PARTIAL_DATA: "一部データ不足があるため評価を弱めて扱う。",
  LOW_SAMPLE_GROWING: "出走数が少ないため、消さずに育成中として保持する。",
  IDENTITY_ONLY_GROWING: "選手IDのみ保持。出走実績が入ったら評価を育てる。",
  CONFIRMED_START_SHORT: "confirmedStartCount が5未満。",
  TOP3_CANDIDATE: "3連対率が高く、3着保護候補に使える。",
  TOP2_CANDIDATE: "2連対率が一定以上で、2着候補に使える。",
  ROLE_MISSING: "ライン・役割情報が一部不足している。"
};

const tagCounts = {};

for (const rider of score.items) {
  for (const tag of rider.tags ?? []) {
    if (!tagCounts[tag]) {
      tagCounts[tag] = {
        tag,
        label: tagLabels[tag] ?? tag,
        memo: tagMemo[tag] ?? "",
        riderCount: 0
      };
    }

    tagCounts[tag].riderCount += 1;
  }
}

const tags = Object.values(tagCounts).sort(
  (a, b) => b.riderCount - a.riderCount
);

const topRiders = score.items.slice(0, 30).map((rider) => ({
  rank: rider.rank,
  registrationNo: rider.registrationNo,
  name: rider.name,
  score: rider.score,
  rankHint: rider.rankHint,
  quality: rider.quality,
  dataStatus: rider.dataStatus,
  top2Rate: rider.rates?.top2Rate ?? null,
  top3Rate: rider.rates?.top3Rate ?? null
}));

const sampleRiders = score.items
  .filter((rider) => rider.quality === "low-sample" || rider.quality === "identity-only")
  .slice(0, 50)
  .map((rider) => ({
    registrationNo: rider.registrationNo,
    name: rider.name,
    score: rider.score,
    quality: rider.quality,
    dataStatus: rider.dataStatus,
    confirmedStartCount: rider.coverage?.confirmedStartCount ?? 0
  }));

const base = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: "kurari-ex-rider-score-v1",
  sourceType: "EXACT_RIDER_SCORE",
  period: score.period,
  riderCount: score.riderCount,
  qualityCounts: score.qualityCounts,
  inclusionPolicy: score.inclusionPolicy
};

fs.writeFileSync(
  tagsFile,
  JSON.stringify(
    {
      ...base,
      tagCount: tags.length,
      items: tags
    },
    null,
    2
  ) + "\n",
  "utf8"
);

fs.writeFileSync(
  guidanceFile,
  JSON.stringify(
    {
      ...base,
      guidance: [
        {
          title: "全選手を保持",
          body: "complete / partial / low-sample / identity-only をすべて残す。"
        },
        {
          title: "低サンプルは削除しない",
          body: "confirmedStartCount が少ない選手も low-sample-growing として育てる。"
        },
        {
          title: "予想への使い方",
          body: "TOP3_CANDIDATE は3着保護、TOP2_CANDIDATE は2着候補、ROLE_MISSING は注意扱いにする。"
        }
      ],
      topRiders,
      sampleRiders
    },
    null,
    2
  ) + "\n",
  "utf8"
);

console.log("[kurari-ex rider tags/guidance]");
console.log("riders:", score.riderCount);
console.log("tags:", tags.length);
console.log("outputs:");
console.log("-", path.relative(ROOT, tagsFile));
console.log("-", path.relative(ROOT, guidanceFile));
