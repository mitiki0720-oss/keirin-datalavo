import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  projectRoot,
  readKurariExRaces,
} from "./kurari-ex-history-common.mjs";
import {
  loadRiderIdentitySources,
  normalizeRiderName,
  resolveRiderIdentity,
} from "./kurari-ex-rider-common.mjs";

const outputPath = path.join(
  projectRoot,
  "public",
  "data",
  "analytics",
  "kurari-ex",
  "exact",
  "shb-name-index.generated.json",
);

function pct(numerator, denominator) {
  if (!denominator) return null;
  return Number(((numerator / denominator) * 100).toFixed(1));
}

function resultCarNo(race, place) {
  return Number(race.result?.[place]?.carNo ?? 0);
}

function addSet(map, key, value) {
  const current = map.get(key) ?? new Set();
  current.add(value);
  map.set(key, current);
}

function isLikelyRiderName(name, nameKey) {
  const text = String(name ?? "").trim();
  const key = String(nameKey ?? "").trim();
  if (!text || !key) return false;
  if (/^[【[]/.test(text) || /[】\]]/.test(text)) return false;
  if (/^(WEATHER ACTUAL|最終オッズ参考|結果メモ|払戻|全着順|決まり手|天候|風向|風速|気温|降水|基準)$/u.test(key)) return false;
  if (!/[一-龯々〆ヵヶぁ-んァ-ヴー]/u.test(key)) return false;
  if (key.length > 12) return false;
  return true;
}

function ensureEntry(entries, rider, identitySources) {
  const name = String(rider?.name ?? "").trim();
  const nameKey = normalizeRiderName(name);
  if (!isLikelyRiderName(name, nameKey)) return null;

  const resolved = resolveRiderIdentity(
    {
      carNo: rider.carNo,
      name,
      registrationNo: "",
    },
    identitySources,
  );

  const current = entries.get(nameKey) ?? {
    nameKey,
    displayName: name,
    registrationNo: resolved.registrationNo ?? null,
    identityStatus: resolved.status ?? "unresolved",
    bCount: 0,
    bWin: 0,
    bTop2: 0,
    bTop3: 0,
    bOutside: 0,
    sCount: 0,
    sameSAndBCount: 0,
    venueKeys: new Set(),
    venueNames: new Set(),
    dates: new Set(),
    raceKeys: [],
    dateRaceKeys: new Map(),
  };

  if (!current.displayName && name) current.displayName = name;
  if (!current.registrationNo && resolved.registrationNo) {
    current.registrationNo = resolved.registrationNo;
    current.identityStatus = resolved.status ?? "resolved";
  }

  entries.set(nameKey, current);
  return current;
}

function compactEntry(entry) {
  const dateDuplicateRows = [...entry.dateRaceKeys.entries()]
    .map(([date, raceKeys]) => ({
      date,
      raceKeys: [...raceKeys].sort(),
    }))
    .filter((row) => row.raceKeys.length > 1)
    .sort((left, right) => left.date.localeCompare(right.date));

  const sameDateDuplicateRaceDateCount = dateDuplicateRows.length;
  const safeDailyNameIdentity = sameDateDuplicateRaceDateCount === 0;

  const quality = entry.registrationNo
    ? "registration-resolved"
    : safeDailyNameIdentity
      ? "name-daily-safe"
      : "name-collision-risk";

  return {
    nameKey: entry.nameKey,
    displayName: entry.displayName,
    registrationNo: entry.registrationNo,
    identityStatus: entry.identityStatus,
    quality,

    count: entry.bCount + entry.sCount,
    bCount: entry.bCount,
    sCount: entry.sCount,
    sameSAndBCount: entry.sameSAndBCount,

    bWin: entry.bWin,
    bTop2: entry.bTop2,
    bTop3: entry.bTop3,
    bOutside: entry.bOutside,
    bWinRate: pct(entry.bWin, entry.bCount),
    bTop2Rate: pct(entry.bTop2, entry.bCount),
    bTop3Rate: pct(entry.bTop3, entry.bCount),
    bOutsideRate: pct(entry.bOutside, entry.bCount),
    sameSAndBRate: pct(entry.sameSAndBCount, entry.sCount),

    dateCount: entry.dates.size,
    venueCount: entry.venueNames.size,
    venues: [...entry.venueNames].sort(),
    sampleRaceKeys: entry.raceKeys.slice(0, 12),

    safeDailyNameIdentity,
    sameDateDuplicateRaceDateCount,
    sameDateDuplicateSamples: dateDuplicateRows.slice(0, 20),
  };
}

const { races, errors } = await readKurariExRaces("history");
if (errors.length) {
  console.error("[kurari-ex shb name index] history read errors");
  console.error(errors.slice(0, 20));
  process.exit(1);
}

const identitySources = await loadRiderIdentitySources();

const entries = new Map();
const summary = {
  raceCount: races.length,
  bKnown: 0,
  sKnown: 0,
  bNamePresent: 0,
  sNamePresent: 0,
  bNameMissing: 0,
  sNameMissing: 0,
};

for (const race of races) {
  const bRider = race.result?.bRider ?? null;
  const sRider = race.result?.sRider ?? null;

  if (bRider?.carNo) {
    summary.bKnown += 1;

    if (String(bRider.name ?? "").trim()) {
      summary.bNamePresent += 1;
      const entry = ensureEntry(entries, bRider, identitySources);
      if (entry) {
        entry.bCount += 1;
        entry.dates.add(race.date);
        entry.venueKeys.add(race.venueKey);
        entry.venueNames.add(race.venueName);
        if (entry.raceKeys.length < 30) entry.raceKeys.push(race.raceKey);
        addSet(entry.dateRaceKeys, race.date, race.raceKey);

        const bCarNo = Number(bRider.carNo);
        const firstCarNo = resultCarNo(race, "first");
        const secondCarNo = resultCarNo(race, "second");
        const thirdCarNo = resultCarNo(race, "third");

        if (bCarNo === firstCarNo) entry.bWin += 1;
        if (bCarNo === firstCarNo || bCarNo === secondCarNo) entry.bTop2 += 1;
        if (bCarNo === firstCarNo || bCarNo === secondCarNo || bCarNo === thirdCarNo) {
          entry.bTop3 += 1;
        } else {
          entry.bOutside += 1;
        }
      }
    } else {
      summary.bNameMissing += 1;
    }
  }

  if (sRider?.carNo) {
    summary.sKnown += 1;

    if (String(sRider.name ?? "").trim()) {
      summary.sNamePresent += 1;
      const entry = ensureEntry(entries, sRider, identitySources);
      if (entry) {
        entry.sCount += 1;
        entry.dates.add(race.date);
        entry.venueKeys.add(race.venueKey);
        entry.venueNames.add(race.venueName);
        if (entry.raceKeys.length < 30) entry.raceKeys.push(race.raceKey);
        addSet(entry.dateRaceKeys, race.date, race.raceKey);
      }
    } else {
      summary.sNameMissing += 1;
    }
  }

  if (
    bRider?.carNo
    && sRider?.carNo
    && Number(bRider.carNo) === Number(sRider.carNo)
    && String(bRider.name ?? sRider.name ?? "").trim()
  ) {
    const riderForSame = String(bRider.name ?? "").trim() ? bRider : sRider;
    const entry = ensureEntry(entries, riderForSame, identitySources);
    if (entry) entry.sameSAndBCount += 1;
  }
}

const items = [...entries.values()]
  .map(compactEntry)
  .sort((left, right) => (
    right.count - left.count
    || right.bCount - left.bCount
    || right.sCount - left.sCount
    || left.nameKey.localeCompare(right.nameKey)
  ));

const qualityCounts = items.reduce((acc, item) => {
  acc[item.quality] = (acc[item.quality] ?? 0) + 1;
  return acc;
}, {});

const payload = {
  schemaVersion: 1,
  source: "kurari-ex-history-shb-name",
  summary: {
    ...summary,
    nameKeyCount: items.length,
    qualityCounts,
    safeDailyNameKeyCount: items.filter((item) => item.safeDailyNameIdentity).length,
    sameDateCollisionNameKeyCount: items.filter((item) => !item.safeDailyNameIdentity).length,
  },
  items,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

console.log("[kurari-ex shb name index export]");
console.log(`races: ${summary.raceCount}`);
console.log(`B known: ${summary.bKnown}`);
console.log(`S known: ${summary.sKnown}`);
console.log(`B name present: ${summary.bNamePresent}`);
console.log(`S name present: ${summary.sNamePresent}`);
console.log(`name keys: ${items.length}`);
console.log(`quality: ${JSON.stringify(qualityCounts)}`);
console.log(`same-date collision name keys: ${payload.summary.sameDateCollisionNameKeyCount}`);
console.log(`output: ${path.relative(projectRoot, outputPath)}`);

console.log("\nTOP ITEMS:");
console.table(items.slice(0, 30).map((item) => ({
  name: item.displayName,
  quality: item.quality,
  count: item.count,
  bCount: item.bCount,
  bTop3Rate: item.bTop3Rate,
  sCount: item.sCount,
  sameSAndBCount: item.sameSAndBCount,
  safeDaily: item.safeDailyNameIdentity,
})));

if (payload.summary.sameDateCollisionNameKeyCount > 0) {
  console.log("\nCOLLISION SAMPLES:");
  console.table(
    items
      .filter((item) => !item.safeDailyNameIdentity)
      .slice(0, 30)
      .map((item) => ({
        name: item.displayName,
        quality: item.quality,
        sameDateDuplicateRaceDateCount: item.sameDateDuplicateRaceDateCount,
        sample: JSON.stringify(item.sameDateDuplicateSamples.slice(0, 3)),
      })),
  );
}
