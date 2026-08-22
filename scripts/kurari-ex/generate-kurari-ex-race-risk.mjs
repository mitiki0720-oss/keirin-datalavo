import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const VERSION = "kurari-ex-race-risk/v1";
const OUTPUT_DIR = path.join(ROOT, "public/data/analytics/kurari-ex/race-risk");
const OUTPUT_PATH = path.join(OUTPUT_DIR, "index.generated.json");

const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
const finite = (value) => Number.isFinite(Number(value));
const rate = (count, total) => total > 0 ? (count / total) * 100 : null;
const round = (value) => value == null || !Number.isFinite(value) ? null : Math.round(value * 10) / 10;
const toDateOnly = (value) => {
  const text = String(value ?? "");
  const match = text.match(/\d{4}-\d{2}-\d{2}/u);
  return match ? match[0] : null;
};
const dateDiffDays = (from, to) => {
  const fromDate = toDateOnly(from);
  const toDate = toDateOnly(to);
  if (!fromDate || !toDate) return null;
  const ms = Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`);
  return Math.round(ms / 86400000);
};

const today = readJson("public/data/races/today.generated.json");
const entriesFeed = readJson("public/data/races/keirin-jp-entries.generated.json");
const historicalIndex = readJson("public/data/analytics/kurari-ex-result-trend-lab-history/index.generated.json");
const riderIndex = readJson("public/data/analytics/kurari-ex/exact/riders/index.generated.json");
const matchupIndex = readJson("public/data/analytics/kurari-ex/exact/matchups/index.generated.json");

const normalizeVenueName = (value) => String(value ?? "").replace(/競輪場$/u, "").trim();
const raceBand = (raceNo) => raceNo <= 4 ? "early" : raceNo <= 8 ? "middle" : "late";
const timeBand = (time) => {
  const hour = Number(String(time ?? "").split(":")[0]);
  if (!Number.isFinite(hour)) return "unknown";
  if (hour < 11) return "morning";
  if (hour < 16) return "day";
  if (hour < 20) return "night";
  return "midnight";
};

const entriesByKey = new Map();
for (const venue of entriesFeed.venues ?? []) {
  for (const race of venue.races ?? []) {
    entriesByKey.set(`${entriesFeed.date}|${venue.venueCode}|${Number(race.raceNumber)}`, { venue, race });
  }
}

const riderByRegistrationNo = new Map((riderIndex.items ?? []).map((item) => [String(item.registrationNo), item]));
const matchupByRegistrationNo = new Map((matchupIndex.items ?? []).map((item) => [String(item.registrationNo), item]));

const historicalRows = [];
for (const shard of historicalIndex.shards ?? []) {
  const publicPath = String(shard.path).replace(/^\//u, "");
  const shardPath = path.join(ROOT, publicPath.startsWith("data/") ? `public/${publicPath}` : publicPath);
  if (!fs.existsSync(shardPath)) continue;
  const daily = JSON.parse(fs.readFileSync(shardPath, "utf8"));
  for (const race of daily.races ?? []) {
    if (!race.trendEligible) continue;
    const payout = race.result?.trifectaPayoutYen;
    if (!finite(payout)) continue;
    historicalRows.push({
      venueCode: String(race.venueCode ?? ""),
      venueName: normalizeVenueName(race.venue),
      raceNumber: Number(race.raceNumber),
      payout: Number(payout),
    });
  }
}

const summarizeHistorical = (predicate) => {
  const rows = historicalRows.filter(predicate);
  const total = rows.length;
  const high = rows.filter((row) => row.payout >= 10000).length;
  const veryHigh = rows.filter((row) => row.payout >= 30000).length;
  return { sampleSize: total, highPayoutRate: round(rate(high, total)), veryHighPayoutRate: round(rate(veryHigh, total)) };
};

const globalHistorical = summarizeHistorical(() => true);
const historicalFreshnessLagDays = dateDiffDays(historicalIndex.range?.to, today.date) == null
  ? null
  : Math.max(0, dateDiffDays(historicalIndex.range?.to, today.date) - 1);

const signal = ({ key, label, value, contribution, source, confidence, note }) => ({
  key,
  label,
  value,
  contribution,
  source,
  confidence,
  ...(note ? { note } : {}),
});

const confidenceFromSample = (sampleSize) => sampleSize >= 30 ? "high" : sampleSize >= 10 ? "medium" : "low";
const contributionFromHighPayoutRate = (highPayoutRate, sampleSize) => {
  if (sampleSize < 10 || highPayoutRate == null) return 0;
  const baseline = globalHistorical.highPayoutRate ?? 0;
  if (highPayoutRate >= Math.max(40, baseline + 12)) return 2;
  if (highPayoutRate >= Math.max(34, baseline + 6)) return 1;
  if (highPayoutRate <= 8) return -1;
  return 0;
};

const isSelfPowerStarter = (entry) => {
  const style = String(entry.style ?? "");
  const stats = entry.stats ?? {};
  const backCount = Number(stats.backCount ?? 0);
  const homeCount = Number(stats.homeCount ?? 0);
  return style.includes("逃") ||
    backCount >= 3 ||
    homeCount >= 3 ||
    (style.includes("両") && (backCount >= 2 || homeCount >= 2));
};

const pointRangeForRisk = (riskLevel) => {
  if (riskLevel === "INSUFFICIENT") return { label: "SKIP / 判断材料不足", min: null, max: null, action: "SKIP" };
  if (riskLevel === "LOW") return { label: "8", min: 8, max: 8, action: "BASE_8" };
  if (riskLevel === "MEDIUM") return { label: "8〜10", min: 8, max: 10, action: "VALUE_10" };
  if (riskLevel === "HIGH") return { label: "10〜12", min: 10, max: 12, action: "STRONG_VALUE_12" };
  return { label: "12〜14", min: 12, max: 14, action: "MAX_14" };
};

const records = [];
for (const venue of today.venues ?? []) {
  const venueCode = String(venue.venueCode ?? "");
  for (const race of venue.races ?? []) {
    const raceNo = Number(race.raceNo);
    const raceKey = `${today.date}|${venueCode}|${raceNo}`;
    const entriesBundle = entriesByKey.get(raceKey);
    const entryRace = entriesBundle?.race ?? null;
    const entries = entryRace?.entries ?? [];
    const lineupRaw = race.lineup || entryRace?.lineup || entryRace?.officialLineup?.lineup || "";
    const lineGroups = String(lineupRaw).trim().split(/\s+/u).filter(Boolean);
    const lineCount = lineGroups.length;
    const singleCount = lineGroups.filter((group) => group.length === 1).length;
    const carCount = entries.length || race.riders?.length || 0;
    const selfPowerCount = entries.filter(isSelfPowerStarter).length;
    const grade = String(venue.grade ?? "");
    const raceClassCounts = entries.reduce((counts, entry) => {
      const raceClass = String(entry.raceClass ?? "unknown").replace(/\s+/gu, "");
      counts[raceClass] = (counts[raceClass] ?? 0) + 1;
      return counts;
    }, {});
    const raceClassLabel = Object.entries(raceClassCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";
    const venueHistorical = summarizeHistorical((row) => row.venueCode === venueCode || row.venueName === normalizeVenueName(venue.venue));
    const raceNoHistorical = summarizeHistorical((row) => row.raceNumber === raceNo);
    const starterRegistrations = entries.map((entry) => String(entry.registrationNo ?? "")).filter(Boolean);
    const riderCoverage = starterRegistrations.map((registrationNo) => riderByRegistrationNo.get(registrationNo)).filter(Boolean);
    const lowSampleRiderCount = riderCoverage.filter((item) => item.quality === "identity-only" || item.quality === "low-sample" || Number(item.confirmedStartCount ?? 0) < 5).length;
    const matchupCoverage = starterRegistrations.map((registrationNo) => matchupByRegistrationNo.get(registrationNo)).filter(Boolean);
    const matchupSafeComparableTotal = matchupCoverage.reduce((sum, item) => sum + Number(item.safeComparableRaceCount ?? 0), 0);
    const matchupAverage = matchupCoverage.length ? matchupSafeComparableTotal / matchupCoverage.length : null;

    const signals = [];
    if (entries.length) {
      signals.push(signal({
        key: "line-count",
        label: "分戦数",
        value: `${lineCount || "未取得"}分戦`,
        contribution: lineCount >= 4 ? 1 : lineCount <= 2 && lineCount > 0 ? -1 : 0,
        source: race.lineup ? "today.generated.lineup" : "keirin-jp-entries.lineup",
        confidence: lineCount ? "high" : "low",
      }));
      signals.push(signal({
        key: "self-power-contest",
        label: "自力/先行役の競合",
        value: `${selfPowerCount}人`,
        contribution: selfPowerCount >= 5 ? 2 : selfPowerCount >= 4 ? 1 : 0,
        source: "keirin-jp-entries.entries.style/stats",
        confidence: "medium",
        note: "逃げ、B/H回数、B/Hを伴う両だけを事前sourceとして使用",
      }));
      if (singleCount > 0) {
        signals.push(signal({
          key: "single-line",
          label: "単騎/短ライン",
          value: `${singleCount}本`,
          contribution: singleCount >= 2 ? 1 : 0,
          source: race.lineup ? "today.generated.lineup" : "keirin-jp-entries.lineup",
          confidence: "medium",
        }));
      }
    }
    signals.push(signal({
      key: "venue-historical-turbulence",
      label: "会場historical荒れ",
      value: venueHistorical.highPayoutRate == null ? "未蓄積" : `万車券率 ${venueHistorical.highPayoutRate}%`,
      contribution: contributionFromHighPayoutRate(venueHistorical.highPayoutRate, venueHistorical.sampleSize),
      source: "kurari-ex-result-trend-lab-history",
      confidence: confidenceFromSample(venueHistorical.sampleSize),
      note: `sample ${venueHistorical.sampleSize}R / global ${globalHistorical.highPayoutRate ?? "--"}% / 過去結果のみ`,
    }));
    signals.push(signal({
      key: "race-number-historical-turbulence",
      label: "R番号historical荒れ",
      value: raceNoHistorical.highPayoutRate == null ? "未蓄積" : `万車券率 ${raceNoHistorical.highPayoutRate}%`,
      contribution: contributionFromHighPayoutRate(raceNoHistorical.highPayoutRate, raceNoHistorical.sampleSize),
      source: "kurari-ex-result-trend-lab-history",
      confidence: confidenceFromSample(raceNoHistorical.sampleSize),
      note: `sample ${raceNoHistorical.sampleSize}R / global ${globalHistorical.highPayoutRate ?? "--"}% / 過去結果のみ`,
    }));
    signals.push(signal({
      key: "rider-ex-coverage",
      label: "rider EX母数",
      value: `${riderCoverage.length}/${starterRegistrations.length}人 / LOW SAMPLE ${lowSampleRiderCount}人`,
      contribution: 0,
      source: "kurari-ex-exact-riders-index",
      confidence: starterRegistrations.length && riderCoverage.length / starterRegistrations.length >= 0.8 && lowSampleRiderCount <= Math.ceil(starterRegistrations.length / 3) ? "high" : "low",
      note: "LOW SAMPLEはrisk上昇ではなくconfidence低下として扱う",
    }));
    signals.push(signal({
      key: "matchup-coverage",
      label: "MATCHUP coverage",
      value: matchupAverage == null ? "未蓄積" : `平均比較可能 ${round(matchupAverage)}R`,
      contribution: 0,
      source: "kurari-ex-exact-matchups-index",
      confidence: matchupAverage != null && matchupAverage >= 10 ? "high" : matchupAverage != null && matchupAverage >= 3 ? "medium" : "low",
    }));

    if (grade.startsWith("G") || raceClassLabel.startsWith("S")) {
      signals.push(signal({
        key: "grade-value-context",
        label: "価値条件",
        value: `${grade || "grade未取得"} / ${raceClassLabel}`,
        contribution: 1,
        source: "today.generated/keirin-jp-entries.raceClass",
        confidence: "medium",
      }));
    }

    const score = signals.reduce((sum, item) => sum + item.contribution, 0);
    const essentialReady = entries.length >= 5 && lineCount > 0;
    const confidenceScore = signals.reduce((sum, item) => sum + (item.confidence === "high" ? 2 : item.confidence === "medium" ? 1 : 0), 0);
    const confidence = !essentialReady ? "low" : confidenceScore >= 7 ? "high" : confidenceScore >= 4 ? "medium" : "low";
    const riskLevel = !essentialReady
      ? "INSUFFICIENT"
      : score >= 5
        ? "VERY_HIGH"
        : score >= 3
          ? "HIGH"
          : score >= 1
            ? "MEDIUM"
            : "LOW";

    records.push({
      raceKey,
      date: today.date,
      venueCode,
      venueName: normalizeVenueName(venue.venue),
      venueSlug: venue.slug ?? null,
      raceNo,
      title: race.title ?? "",
      time: race.time ?? null,
      timeBand: timeBand(race.time),
      grade,
      raceClass: raceClassLabel,
      carCount,
      line: {
        source: race.lineup ? "today.generated.lineup" : entries.length ? "keirin-jp-entries.lineup" : "unavailable",
        lineup: lineupRaw || null,
        lineCount: lineCount || null,
        singleCount,
        selfPowerCount,
      },
      riskScore: score,
      riskLevel,
      confidence,
      pointRange: pointRangeForRisk(riskLevel),
      signals,
      protectionGuide: {
        mode: "second-third-correction",
        note: "RISKが高い場合も頭数追加ではなく、2着・3着補正と別線3着保護を優先して検討する。",
        allowedRoles: ["OTHER_SELF", "OTHER_MARK", "SINGLE", "LINE_THIRD_OUTSIDE", "OTHER_LINE_THIRD"],
      },
      sourceAvailability: {
        todayRace: true,
        officialEntries: entries.length > 0,
        officialLineup: lineCount > 0,
        venueHistoricalSampleSize: venueHistorical.sampleSize,
        raceNumberHistoricalSampleSize: raceNoHistorical.sampleSize,
        riderCoverageCount: riderCoverage.length,
        matchupCoverageCount: matchupCoverage.length,
      },
      leakageGuard: {
        currentResultUsed: false,
        currentPayoutUsed: false,
        oddsUsedAsRiskDriver: false,
        fuzzyMatchingUsed: false,
        fakeCompletionUsed: false,
      },
    });
  }
}

const countBy = (items, getter) => items.reduce((counts, item) => {
  const key = getter(item);
  counts[key] = (counts[key] ?? 0) + 1;
  return counts;
}, {});

const payload = {
  version: VERSION,
  generatedAt: new Date().toISOString(),
  sourceType: "PRE_RACE_SOURCE_BACKED_EX_SIGNAL",
  period: {
    date: today.date,
    historicalFrom: historicalIndex.range?.from ?? null,
    historicalTo: historicalIndex.range?.to ?? null,
  },
  raceCount: records.length,
  coverage: {
    venueCount: new Set(records.map((record) => record.venueCode)).size,
    officialEntryRaceCount: records.filter((record) => record.sourceAvailability.officialEntries).length,
    officialLineupRaceCount: records.filter((record) => record.sourceAvailability.officialLineup).length,
    insufficientRaceCount: records.filter((record) => record.riskLevel === "INSUFFICIENT").length,
    lowConfidenceRaceCount: records.filter((record) => record.confidence === "low").length,
  },
  freshness: {
    targetDate: today.date,
    historicalTo: historicalIndex.range?.to ?? null,
    lagDays: historicalFreshnessLagDays,
    status: historicalFreshnessLagDays == null ? "unknown" : historicalFreshnessLagDays > 0 ? "stale" : "fresh",
    warning: historicalFreshnessLagDays == null
      ? "historical dateToを確認できません"
      : historicalFreshnessLagDays > 0
        ? `historicalがtargetDate-1より${historicalFreshnessLagDays}日古いです`
        : "historicalはtargetDate-1まで到達しています",
  },
  riskLevelCounts: countBy(records, (record) => record.riskLevel),
  confidenceCounts: countBy(records, (record) => record.confidence),
  pointRangeCounts: countBy(records, (record) => record.pointRange.action),
  records,
};

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`);
console.log(JSON.stringify({
  output: path.relative(ROOT, OUTPUT_PATH),
  raceCount: payload.raceCount,
  riskLevelCounts: payload.riskLevelCounts,
  confidenceCounts: payload.confidenceCounts,
}, null, 2));
