import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const RIDER_DIR = path.join(ROOT, "public", "data", "analytics", "kurari-ex", "exact", "riders");
const OUT_DIR = path.join(ROOT, "public", "data", "analytics", "kurari-ex", "analysis");
const OUT_FILE = path.join(OUT_DIR, "rider-category-analysis.generated.json");

function walk(dir) {
  const files = [];
  function scan(current) {
    if (!fs.existsSync(current)) return;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) scan(full);
      if (entry.isFile() && entry.name.endsWith(".generated.json")) files.push(full);
    }
  }
  scan(dir);
  return files.sort();
}

function rate(count, total) {
  return total ? Math.round((count / total) * 1000) / 10 : null;
}

function bucket(key, label) {
  return { key, label, starts: 0, wins: 0, seconds: 0, thirds: 0, outside: 0 };
}

function add(map, key, label, item) {
  const safeItem = item && typeof item === "object" ? item : {};
  const k = String(key || "unknown");
  if (!map.has(k)) map.set(k, bucket(k, label || k));

  const b = map.get(k);
  b.starts += Number(safeItem.starts || 0);
  b.wins += Number(safeItem.wins || 0);
  b.seconds += Number(safeItem.seconds || 0);
  b.thirds += Number(safeItem.thirds || 0);
  b.outside += Number(safeItem.outside || 0);
}

function finish(map) {
  return [...map.values()]
    .map((b) => ({
      ...b,
      winRate: rate(b.wins, b.starts),
      top2Rate: rate(b.wins + b.seconds, b.starts),
      top3Rate: rate(b.wins + b.seconds + b.thirds, b.starts),
      quality: b.starts >= 5 ? "ok" : "low-sample",
      sourceType: "EXACT",
    }))
    .sort((a, b) => b.starts - a.starts);
}

function timeslotLabel(value) {
  return {
    morning: "モーニング",
    day: "デイ",
    night: "ナイター",
    midnight: "ミッドナイト",
    unknown: "不明",
  }[value] || value || "不明";
}

function roleLabel(value) {
  return {
    front: "ライン先頭",
    bante: "番手",
    third: "3番手以降",
    single: "単騎",
  }[value] || value || "不明";
}

const venue = new Map();
const timeslot = new Map();
const raceClass = new Map();
const raceStage = new Map();
const weather = new Map();
const bankLength = new Map();
const role = new Map();

let read = 0;
let skipped = 0;
let confirmedStarts = 0;

for (const file of walk(RIDER_DIR)) {
  try {
    const rider = JSON.parse(fs.readFileSync(file, "utf8"));
    read += 1;
    confirmedStarts += Number(rider.coverage?.confirmedStartCount || 0);

    for (const item of rider.byVenue || []) {
      add(venue, item.venueKey, item.venueName, item);
    }

    for (const item of rider.byTimeslot || []) {
      add(timeslot, item.timeslot, timeslotLabel(item.timeslot), item);
    }

    for (const item of rider.byClass || []) {
      add(raceClass, item.raceClass, item.raceClass || "\u4e0d\u660e", item);
    }

    for (const item of rider.byRaceStage || []) {
      add(raceStage, item.raceStage, item.raceStageLabel || item.raceStage || "\u4e0d\u660e", item);
    }

    for (const item of rider.byWeather || []) {
      add(weather, item.weatherCondition, item.weatherLabel || item.weatherCondition || "\u4e0d\u660e", item);
    }

    for (const item of rider.byBankLength || []) {
      add(bankLength, item.bankLength, item.bankLengthLabel || String(item.bankLength || "\u4e0d\u660e"), item);
    }

    for (const [roleKey, stats] of Object.entries(rider.byRole || {})) {
      add(role, roleKey, roleLabel(roleKey), stats);
    } } catch {
    skipped += 1;
  }
}

const output = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: "kurari-ex-rider-category-analysis-v1",
  sourceType: "EXACT",
  sampleUnit: "riderStart",
  coverage: {
    riderFilesRead: read,
    riderFilesSkipped: skipped,
    confirmedStartCount: confirmedStarts,
  },
  dimensions: {
    venue: {
      label: "競輪場別",
      sourcePath: "exact/riders/*/byVenue",
      items: finish(venue),
    },
    timeslot: {
      label: "時間帯別",
      sourcePath: "exact/riders/*/byTimeslot",
      items: finish(timeslot),
    },
    raceClass: {
      label: "級班・レース種目別",
      sourcePath: "exact/riders/*/byClass",
      items: finish(raceClass),
    },
    raceStage: {
      label: "レースステージ別",
      sourcePath: "exact/riders/*/byRaceStage",
      items: finish(raceStage),
    },
    weather: {
      label: "天候別",
      sourcePath: "exact/riders/*/byWeather",
      items: finish(weather),
    },
    bankLength: {
      label: "バンク周長別",
      sourcePath: "exact/riders/*/byBankLength",
      items: finish(bankLength),
    },
    role: {
      label: "並び位置別",
      sourcePath: "exact/riders/*/byRole",
      items: finish(role),
    },
  },
  unsupportedExactMetrics: [
    { key: "kamashiSuccessRate", label: "かまし成功率", status: "not-generated", reason: "EXACTデータに発生判定がないため未生成" },
    { key: "tsuppariSuccessRate", label: "つっぱり成功率", status: "not-generated", reason: "EXACTデータに発生判定がないため未生成" },
    { key: "seriWinRate", label: "競りの勝率", status: "not-generated", reason: "競り発生・勝敗の確定タグが必要なため未生成" }
  ],
};

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2) + "\n", "utf8");

console.log("generated:", path.relative(ROOT, OUT_FILE));
console.log("read:", read);
console.log("skipped:", skipped);
console.log("confirmed starts:", confirmedStarts);
console.log("venue items:", output.dimensions.venue.items.length);
console.log("timeslot items:", output.dimensions.timeslot.items.length);

