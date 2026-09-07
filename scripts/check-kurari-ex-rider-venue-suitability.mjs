import path from "node:path";
import { readFile } from "node:fs/promises";
import {
  collectFiles,
  projectRoot,
} from "./kurari-ex-history-common.mjs";

const riderRoot = path.join(
  projectRoot,
  "public",
  "data",
  "analytics",
  "kurari-ex",
  "exact",
  "riders",
);
const pagePath = path.join(projectRoot, "src", "pages", "ExDataPage.tsx");
const expectedTabs = [
  "OVERVIEW",
  "IDENTITY",
  "DATA COVERAGE",
  "TREND LAB",
  "出目ランキング",
  "荒れ指数",
  "レース連鎖",
  "WEATHER",
  "会場クセ",
  "今日の流れ",
  "予想構造LAB",
  "EX ANALYSIS",
];

function closeEnough(left, right) {
  return Math.abs(left - right) <= 0.11;
}

function expectedRate(count, total) {
  return total > 0 ? Number(((count / total) * 100).toFixed(1)) : null;
}

function validPeriod(period) {
  if (!period || period.from == null || period.to == null) return false;
  return /^\d{4}-\d{2}-\d{2}$/u.test(period.from)
    && /^\d{4}-\d{2}-\d{2}$/u.test(period.to)
    && period.from <= period.to;
}

function expectedQuality(sample) {
  if (sample <= 0) return "unavailable";
  if (sample < 5) return "low-sample";
  if (sample < 10) return "limited";
  if (sample < 20) return "moderate";
  return "strong";
}

function validatePerformance(performance, label, errors) {
  const total = performance.settledStarts;
  const top2 = performance.wins + performance.seconds;
  const top3 = top2 + performance.thirds;
  if (!Number.isInteger(total) || total < 0) errors.push(`${label}: invalid settledStarts`);
  if (performance.wins > total) errors.push(`${label}: wins exceeds starts`);
  if (top2 < performance.wins || top2 > total) errors.push(`${label}: invalid top2 count`);
  if (top3 < top2 || top3 > total) errors.push(`${label}: invalid top3 count`);
  const expectedOutside = total > 0 ? total - top3 : null;
  if (performance.outside !== expectedOutside) errors.push(`${label}: outside mismatch`);
  for (const [key, count] of [["winRate", performance.wins], ["top2Rate", top2], ["top3Rate", top3]]) {
    const rate = performance[key];
    if (rate != null && (rate < 0 || rate > 100)) errors.push(`${label}: ${key} out of range`);
    const expected = expectedRate(count, total);
    if (rate !== expected) errors.push(`${label}: ${key} mismatch`);
  }
}

async function main() {
  const files = (await collectFiles(riderRoot)).filter((file) =>
    /by-tail[/\\]\d{2}[/\\]\d{6}\.generated\.json$/u.test(file),
  );
  const registrationNos = new Set();
  const errors = [];
  let riderWithVenueCount = 0;
  let venueRecordCount = 0;
  let lowSampleCount = 0;
  let comparableCount = 0;
  let excludedIdentityConflictCount = 0;
  let excludedSettledIdentityConflictCount = 0;
  let leakageFieldCount = 0;

  for (const file of files) {
    const payload = JSON.parse(await readFile(file, "utf8"));
    const registrationNo = String(payload.registrationNo ?? "");
    if (!/^\d{6}$/u.test(registrationNo)) errors.push(`${file}: invalid registrationNo`);
    if (registrationNos.has(registrationNo)) errors.push(`${file}: duplicate rider identity`);
    registrationNos.add(registrationNo);
    if (!payload.identity?.registrationNoResolved) errors.push(`${file}: identity is not exact-resolved`);
    for (const key of ["overall", "recentForm", "winningMethods", "byVenue", "byTimeslot", "byRole", "quality"]) {
      if (!(key in payload)) errors.push(`${file}: existing PLAYER EX field missing: ${key}`);
    }

    const suitability = payload.venueSuitability;
    if (!suitability || suitability.identityKey !== "registrationNo" || suitability.sourceType !== "EXACT") {
      errors.push(`${file}: venue suitability source contract missing`);
      continue;
    }
    validatePerformance(suitability.overall, `${registrationNo}/overall`, errors);
    const venueKeys = new Set();
    let observedStarts = 0;
    let settledStarts = 0;
    if (suitability.items.length) riderWithVenueCount += 1;
    if (!Number.isInteger(suitability.excludedIdentityConflictCount) || suitability.excludedIdentityConflictCount < 0) {
      errors.push(`${registrationNo}: invalid excluded identity conflict count`);
    } else {
      excludedIdentityConflictCount += suitability.excludedIdentityConflictCount;
    }
    if (!Number.isInteger(suitability.excludedSettledIdentityConflictCount) || suitability.excludedSettledIdentityConflictCount < 0) {
      errors.push(`${registrationNo}: invalid excluded settled identity conflict count`);
    } else {
      excludedSettledIdentityConflictCount += suitability.excludedSettledIdentityConflictCount;
    }
    for (const item of suitability.items) {
      const label = `${registrationNo}/${item.venueKey}`;
      venueRecordCount += 1;
      if (!item.venueKey || venueKeys.has(item.venueKey)) errors.push(`${label}: duplicate or missing venue`);
      venueKeys.add(item.venueKey);
      if (!validPeriod(item.period) || item.latestRaceDate !== item.period.to) errors.push(`${label}: invalid period/latest date`);
      if (item.observedStarts < item.settledStarts) errors.push(`${label}: settled exceeds observed`);
      validatePerformance(item, label, errors);
      validatePerformance(item.recent, `${label}/recent`, errors);
      if (item.recent.sampleSize !== item.recent.settledStarts || item.recent.sampleSize > 5) errors.push(`${label}: recent sample mismatch`);
      if (item.recent.windowComplete !== (item.recent.sampleSize === 5)) errors.push(`${label}: recent window flag mismatch`);
      if (item.recent.sampleSize > 0 && !validPeriod(item.recent.period)) errors.push(`${label}: invalid recent period`);
      if (item.sampleQuality !== expectedQuality(item.settledStarts)) errors.push(`${label}: sample safeguard mismatch`);
      if (["low-sample", "unavailable"].includes(item.sampleQuality)) lowSampleCount += 1;
      else comparableCount += 1;
      for (const key of ["winRate", "top2Rate", "top3Rate"]) {
        const expected = item[key] == null || suitability.overall[key] == null
          ? null
          : Number((item[key] - suitability.overall[key]).toFixed(1));
        const actual = item.delta[key];
        if (expected == null ? actual != null : actual == null || !closeEnough(actual, expected)) {
          errors.push(`${label}: ${key} delta mismatch`);
        }
      }
      observedStarts += item.observedStarts;
      settledStarts += item.settledStarts;
      const encoded = JSON.stringify(item);
      if (/currentResult|finishOrder|payout|refund|predictionText/iu.test(encoded)) leakageFieldCount += 1;
    }
    if (observedStarts + suitability.excludedIdentityConflictCount !== payload.coverage.confirmedStartCount) {
      errors.push(`${registrationNo}: venue observed starts mismatch`);
    }
    if (settledStarts + suitability.excludedSettledIdentityConflictCount !== payload.coverage.resultParsedCount) {
      errors.push(`${registrationNo}: venue settled starts mismatch`);
    }
  }

  const page = await readFile(pagePath, "utf8");
  const missingTabs = expectedTabs.filter((tab) => !page.includes(`label: "${tab}"`));
  if (missingTabs.length) errors.push(`12-tab structure missing: ${missingTabs.join(", ")}`);
  if (!page.includes("RiderVenueSuitability") || !page.includes("ex-venue-fit-grid")) {
    errors.push("PLAYER EX venue suitability UI missing");
  }
  if (!page.includes("grid-template-columns: repeat(${isMobile ? 1 : 2}")) {
    errors.push("responsive venue suitability grid missing");
  }
  if (leakageFieldCount > 0) errors.push(`result leakage fields detected: ${leakageFieldCount}`);

  const report = {
    riderFileCount: files.length,
    uniqueRegistrationNoCount: registrationNos.size,
    duplicateRiderIdentityCount: files.length - registrationNos.size,
    riderWithVenueCount,
    venueRecordCount,
    comparableCount,
    lowSampleCount,
    excludedIdentityConflictCount,
    excludedSettledIdentityConflictCount,
    missingTabCount: missingTabs.length,
    leakageFieldCount,
    errorCount: errors.length,
  };
  console.log("[kurari-ex rider venue suitability check]");
  for (const [key, value] of Object.entries(report)) console.log(`${key}: ${value}`);
  for (const error of errors.slice(0, 100)) console.error(`ERROR: ${error}`);
  if (errors.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error("[kurari-ex rider venue suitability check] failed");
  console.error(error);
  process.exitCode = 1;
});
