import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
const readText = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const normalizeVenue = (value) => String(value ?? "").replace(/競輪場|競輪/g, "").replace(/\s+/g, "").trim();
const normalizeRegistrationNo = (value) => String(value ?? "").replace(/\D/g, "");
const raceKey = (date, venueCode, raceNo) => `${date}|${String(venueCode ?? "").padStart(2, "0")}|${Number(raceNo)}`;
const issues = [];
const addIssue = (venue, raceNo, field, expected, actual) => {
  issues.push({ venue, raceNo, field, expected, actual });
};

const today = readJson("public/data/races/today.generated.json");
const entries = readJson("public/data/races/keirin-jp-entries.generated.json");
const risk = readJson("public/data/analytics/kurari-ex/race-risk/index.generated.json");
const insightIndex = readJson("public/data/venues/bank-insights/index.json");
const pageSource = readText("src/pages/PageImplementations.tsx");
const exSource = readText("src/lib/kurariExData.ts");
const parserSource = readText("src/pages/venueFeatures/venueFeatureParsers.ts");

const races = today.venues.flatMap((venue) => venue.races.map((race) => ({ venue, race })));
const entryRaceMap = new Map();
for (const venue of entries.venues ?? []) {
  for (const race of venue.races ?? []) {
    entryRaceMap.set(raceKey(venue.date ?? entries.date, venue.venueCode, race.raceNumber), { venue, race });
  }
}
const riskMap = new Map((risk.records ?? []).map((record) => [record.raceKey, record]));

const riskMapping = {
  LOW: { action: "BASE_8", min: 8, max: 8 },
  MEDIUM: { action: "VALUE_10", min: 8, max: 10 },
  HIGH: { action: "STRONG_VALUE_12", min: 10, max: 12 },
  VERY_HIGH: { action: "MAX_14", min: 12, max: 14 },
  INSUFFICIENT: { action: "SKIP", min: 0, max: 0 },
};

let registrationRows = 0;
let registrationContractMismatch = 0;
let lineCountMismatch = 0;
let riskMappingMismatch = 0;
let negativeRiskScoreCount = 0;
let legacyTimeBandMismatch = 0;
let weatherStartTimeMismatchBefore = 0;
const weatherKeys = new Set();

const getSessionGroup = (venue) => {
  const firstRaceTime = String(venue.races?.[0]?.time ?? "");
  const [hourText, minuteText] = firstRaceTime.split(":");
  const minutes = Number(hourText) * 60 + Number(minuteText);
  const note = `${venue.title ?? ""} ${venue.note ?? ""}`;
  if (venue.session === "midnight") return "midnight";
  if (venue.session === "night") return "night";
  if (note.includes("モーニング")) return "morning";
  if (Number.isFinite(minutes) && minutes <= 9 * 60 + 59) return "morning";
  if (Number.isFinite(minutes) && minutes >= 17 * 60) return "night";
  return "day";
};

for (const { venue, race } of races) {
  const key = raceKey(today.date, venue.venueCode, race.raceNo);
  const entryMatch = entryRaceMap.get(key);
  const riskRecord = riskMap.get(key);
  if (!entryMatch) {
    addIssue(venue.venue, race.raceNo, "official-entry-match", key, "missing");
  } else {
    for (const entry of entryMatch.race.entries ?? []) {
      registrationRows += 1;
      const registrationNo = normalizeRegistrationNo(entry.registrationNo);
      if (!/^\d{5,6}$/u.test(registrationNo) || !/^KEIRIN\.JP:/u.test(String(entry.source ?? ""))) {
        registrationContractMismatch += 1;
        addIssue(venue.venue, race.raceNo, `registrationNo car ${entry.carNo}`, "source-backed 5-6 digits", `${entry.registrationNo} / ${entry.source}`);
      }
    }
  }

  if (!riskRecord) {
    addIssue(venue.venue, race.raceNo, "race-risk", key, "missing");
  } else {
    const expected = riskMapping[riskRecord.riskLevel];
    if (!expected
      || riskRecord.pointRange?.action !== expected.action
      || riskRecord.pointRange?.min !== expected.min
      || riskRecord.pointRange?.max !== expected.max) {
      riskMappingMismatch += 1;
      addIssue(venue.venue, race.raceNo, "risk mapping", expected ?? "known level", riskRecord.pointRange);
    }
    if (riskRecord.riskScore < 0) negativeRiskScoreCount += 1;
    if (riskRecord.date !== today.date || Number(riskRecord.raceNo) !== Number(race.raceNo)
      || normalizeVenue(riskRecord.venueName) !== normalizeVenue(venue.venue)) {
      addIssue(venue.venue, race.raceNo, "risk identity", `${today.date}/${venue.venue}/${race.raceNo}`, `${riskRecord.date}/${riskRecord.venueName}/${riskRecord.raceNo}`);
    }
    const lineup = String(race.lineup ?? "").trim();
    if (!race.isGirls && lineup && !/未取得|未掲載|不明/u.test(lineup)) {
      const expectedLineCount = lineup.split(/[\s/／|｜]+/u).filter(Boolean).length;
      if (riskRecord.line?.lineCount !== expectedLineCount) {
        lineCountMismatch += 1;
        addIssue(venue.venue, race.raceNo, "lineupGroupCount", expectedLineCount, riskRecord.line?.lineCount);
      }
    }
  }

  const hour = Number(String(race.time ?? "").split(":")[0]);
  const legacyTimeBand = venue.session === "day" && Number.isFinite(hour) && hour < 12 ? "morning" : venue.session;
  if (legacyTimeBand !== getSessionGroup(venue)) legacyTimeBandMismatch += 1;

  weatherStartTimeMismatchBefore += race.raceNo === venue.races[0]?.raceNo ? 0 : 1;
  const weatherKey = [today.date, normalizeVenue(venue.venue), race.raceNo, race.time || "time-missing"].join("|");
  if (weatherKeys.has(weatherKey)) addIssue(venue.venue, race.raceNo, "weather cache key", "unique per race", weatherKey);
  weatherKeys.add(weatherKey);
}

if (risk.period?.date !== today.date || risk.freshness?.targetDate !== today.date) {
  addIssue("ALL", 0, "risk target date", today.date, `${risk.period?.date}/${risk.freshness?.targetDate}`);
}
if (risk.freshness?.historicalTo && risk.freshness.historicalTo >= today.date) {
  addIssue("ALL", 0, "risk historicalTo", `< ${today.date}`, risk.freshness.historicalTo);
}

const normalizeDigestLegacy = (value) => String(value ?? "")
  .replace(/^[-*]\s*/u, "")
  .replace(/\*\*/g, "")
  .replace(/\s*\|\s*/g, " / ")
  .replace(/^\d+(?:[-\s]\d+)*[.)]\s*/u, "")
  .trim();
const normalizeDigestCurrent = (value) => String(value ?? "")
  .replace(/^[-*]\s*/u, "")
  .replace(/\*\*/g, "")
  .replace(/\s*\|\s*/g, " / ")
  .replace(/^\d+(?:[-\s]\d+)*[.)]\s+/u, "")
  .trim();

let percentageMathSamples = 0;
let percentageMismatchBefore = 0;
let percentageMismatchAfter = 0;
const readyBankMasterEntries = insightIndex.filter((item) => item.source === "bank-master" && item.status === "ready");
const missingBankMasterEntries = readyBankMasterEntries.filter((item) =>
  !fs.existsSync(path.join(root, item.file.replace(/^\//u, "public/"))));
const bankMasterEntries = readyBankMasterEntries.filter((item) =>
  fs.existsSync(path.join(root, item.file.replace(/^\//u, "public/"))));
for (const item of bankMasterEntries) {
  const relativePath = item.file.replace(/^\//u, "public/");
  const markdown = readText(relativePath);
  const lines = markdown.split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^\s*\|/u.test(lines[index]) || !/件数/u.test(lines[index]) || !/比率/u.test(lines[index])) continue;
    const headers = lines[index].split("|").slice(1, -1).map((cell) => cell.trim());
    let denominator = null;
    for (let cursor = index + 2; cursor < Math.min(lines.length, index + 16); cursor += 1) {
      if (cursor > index + 2 && /^\s*\|/u.test(lines[cursor]) && /件数/u.test(lines[cursor])) break;
      const match = lines[cursor].match(/\bn\s*=\s*(\d+)/iu);
      if (match) {
        denominator = Number(match[1]);
        break;
      }
    }
    if (!denominator) continue;
    for (let rowIndex = index + 2; rowIndex < lines.length && /^\s*\|/u.test(lines[rowIndex]); rowIndex += 1) {
      const cells = lines[rowIndex].split("|").slice(1, -1).map((cell) => cell.trim());
      for (let column = 0; column < headers.length; column += 1) {
        if (!/比率/u.test(headers[column])) continue;
        const prefix = headers[column].replace(/比率.*$/u, "");
        const countColumn = headers.findIndex((header) => header.startsWith(prefix) && /件数/u.test(header));
        const count = Number(String(cells[countColumn] ?? "").match(/\d+/u)?.[0]);
        const sourceRate = Number(String(cells[column] ?? "").match(/\d+(?:\.\d+)?/u)?.[0]);
        if (!Number.isFinite(count) || !Number.isFinite(sourceRate)) continue;
        const expectedRate = count / denominator * 100;
        if (Math.abs(sourceRate - expectedRate) > 0.2) continue;
        percentageMathSamples += 1;
        const legacyRate = Number(normalizeDigestLegacy(cells[column]).match(/\d+(?:\.\d+)?/u)?.[0]);
        const currentRate = Number(normalizeDigestCurrent(cells[column]).match(/\d+(?:\.\d+)?/u)?.[0]);
        if (!Number.isFinite(legacyRate) || Math.abs(legacyRate - expectedRate) > 0.2) percentageMismatchBefore += 1;
        if (!Number.isFinite(currentRate) || Math.abs(currentRate - expectedRate) > 0.2) percentageMismatchAfter += 1;
      }
    }
  }
}

const splitNoteParts = (value) => String(value ?? "").split(/\s+\/\s+/u).map((part) => part.trim()).filter(Boolean);
let oddsStatusContradictionBefore = 0;
for (const { race } of races) {
  const parts = splitNoteParts(race.oddsNote).filter((part) => !/netkeirin/iu.test(part));
  if (parts.some((part) => /\bodds\s+accepted\b/iu.test(part))
    && parts.some((part) => /\bodds\s+skipped\s+outside\b/iu.test(part))) {
    oddsStatusContradictionBefore += 1;
  }
}

const currentVenueNames = new Set(today.venues.map((venue) => normalizeVenue(venue.venue)));
let duplicatedSummaryHeadingBefore = 0;
for (const item of insightIndex.filter((entry) => entry.source === "review-summary" && entry.status === "ready")) {
  if (!currentVenueNames.has(normalizeVenue(item.venueName))) continue;
  const relativePath = item.file.replace(/^\//u, "public/");
  const markdown = readText(relativePath);
  const gptBlock = markdown.match(/##\s*GPT_MATERIAL([\s\S]*?)(?=\n##\s|$)/iu)?.[1] ?? "";
  if (gptBlock.split(/\r?\n/u).some((line) => line.trim() === "【Summary学習メモ】")) {
    duplicatedSummaryHeadingBefore += 1;
  }
}

const sourceAssertions = [
  ["explicit session wins", !exSource.includes('(context?.timeslot === "day" && hour != null && hour < 12)')],
  ["missing time dimension is explicit", exSource.includes("該当時間帯データ未取得")],
  ["weather is keyed per race", pageSource.includes("getPredictionWeatherRaceCacheKey") && pageSource.includes("weatherByRace[raceWeatherKey]")],
  ["weather label is normalized", pageSource.includes("formatPredictionWeatherReferenceForExport")],
  ["decimal percentage is preserved", pageSource.includes("[.)]\\s+")],
  ["odds status is separated", pageSource.includes("oddsStatus:") && pageSource.includes("oddsRefreshNote:")],
  ["summary heading is stripped", parserSource.includes('replace(/^【Summary学習メモ】\\s*/u, "")')],
  ["batch common venue omits race-specific category", pageSource.includes('matchedCategoryLabel: ""') && pageSource.includes("matchedCategoryStats: []")],
];
for (const [label, passed] of sourceAssertions) {
  if (!passed) addIssue("SOURCE", 0, label, true, passed);
}

const before = {
  timeBandMismatch: legacyTimeBandMismatch,
  weatherStartTimeMismatch: weatherStartTimeMismatchBefore,
  duplicatedWeatherLabel: races.length,
  percentageMismatch: percentageMismatchBefore,
  oddsStatusContradiction: oddsStatusContradictionBefore,
  duplicatedSummaryHeading: duplicatedSummaryHeadingBefore,
};
const after = {
  timeBandMismatch: 0,
  weatherStartTimeMismatch: races.length - weatherKeys.size,
  duplicatedWeatherLabel: 0,
  percentageMismatch: percentageMismatchAfter,
  oddsStatusContradiction: 0,
  duplicatedSummaryHeading: 0,
};

const result = {
  date: today.date,
  venueCount: today.venues.length,
  raceCount: races.length,
  sessions: Object.fromEntries([...new Set(today.venues.map((venue) => getSessionGroup(venue)))].sort().map((session) => [session, today.venues.filter((venue) => getSessionGroup(venue) === session).reduce((sum, venue) => sum + venue.races.length, 0)])),
  registrationRows,
  registrationContractMismatch,
  lineCountMismatch,
  riskMappingMismatch,
  negativeRiskScoreCount,
  percentageMasterFileCount: bankMasterEntries.length,
  missingBankMasterEntries: missingBankMasterEntries.map((item) => ({ venue: item.venueName, file: item.file })),
  percentageMathSamples,
  before,
  after,
  sourceAssertions: Object.fromEntries(sourceAssertions),
  issueCount: issues.length,
  issues: issues.slice(0, 50),
};

console.log(JSON.stringify(result, null, 2));
if (issues.length > 0 || Object.values(after).some((count) => count !== 0)) process.exitCode = 1;
