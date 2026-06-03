import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const readJson = (relativePath) => {
  const filePath = path.join(repoRoot, relativePath);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
};

const existsPublicFile = (publicPath) => {
  if (!publicPath) return false;
  const relativePath = String(publicPath).replace(/^\/+/, "");
  return fs.existsSync(path.join(repoRoot, "public", relativePath));
};

const normalizeVenueName = (value) =>
  String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/競輪場|競輪/g, "")
    .replace(/[\s　]/g, "")
    .replace(/[()（）]/g, "")
    .trim();

const normalizeVenueAlias = (value) => {
  const normalized = normalizeVenueName(value);
  if (["伊東温泉", "ito-onsen", "itoonsen", "ito"].includes(normalized)) return "伊東";
  return normalized;
};

const findVenueBankTarget = (bankIndex, venue) => {
  const normalizedVenueName = normalizeVenueAlias(venue.venue ?? venue.venueName);
  const venueSlug = String(venue.slug ?? "").trim();
  return bankIndex.find((item) => {
    if (item.venueKey === venueSlug) return true;
    if (Array.isArray(item.aliases) && item.aliases.some((alias) => normalizeVenueAlias(alias) === normalizedVenueName)) return true;
    return normalizeVenueAlias(item.venueName) === normalizedVenueName;
  }) ?? null;
};

const findVenueInsightTargets = (insightIndex, venue) => {
  const normalizedVenueName = normalizeVenueAlias(venue.venue ?? venue.venueName);
  const venueSlug = String(venue.slug ?? "").trim();
  const matches = insightIndex.filter((item) => {
    if (item.venueKey === venueSlug) return true;
    if (Array.isArray(item.aliases) && item.aliases.some((alias) => normalizeVenueAlias(alias) === normalizedVenueName)) return true;
    return normalizeVenueAlias(item.venueName) === normalizedVenueName;
  });
  return {
    bankMaster: matches.find((item) => item.source === "bank-master") ?? null,
    reviewSummary: matches.find((item) => item.source === "review-summary") ?? null,
  };
};

const parseLineFallbackParts = (sourceNote) => {
  const source = String(sourceNote ?? "");
  return Array.from(source.matchAll(/lineFallback\s*:\s*([^/]+)(?=\s\/\s|$)/gi))
    .map((match) => match[1]?.trim() ?? "")
    .filter(Boolean);
};

const hasUsableLineup = (race) =>
  Boolean(
    String(race.kdreamsLineupRaw ?? "").trim() ||
    String(race.lineup ?? "").trim() ||
    String(race.charilotoLineupRaw ?? "").trim() ||
    String(race.oddsparkLineupRaw ?? "").trim() ||
    String(race.netkeirinLineupRaw ?? "").trim() ||
    String(race.winticketLineupRaw ?? "").trim()
  );

const getLineupStatus = (race) => {
  const fallbackParts = parseLineFallbackParts(race.sourceNote);
  if (String(race.kdreamsLineupRaw ?? "").trim()) return "kdreams lineup accepted";
  if (hasUsableLineup(race)) return "fallback lineup accepted";
  if (fallbackParts.length > 0) return fallbackParts.join(" / ");
  return "lineup not checked";
};

const OPERATION_SKIP_STATUSES = new Set(["cancelled", "postponed", "suspended"]);

const isVenueOperationSkipped = (venue) => OPERATION_SKIP_STATUSES.has(String(venue?.venueOperationStatus ?? ""));
const isRaceOperationSkipped = (race) => OPERATION_SKIP_STATUSES.has(String(race?.raceOperationStatus ?? ""));
const isRaceSkippedByOperation = (venue, race) => isVenueOperationSkipped(venue) || isRaceOperationSkipped(race);

const getRiderHistoryCount = (rider) => {
  const previousRaceResults = Array.isArray(rider.previousRaceResults) ? rider.previousRaceResults.length : 0;
  const summaryCount = String(rider.previousRaceSummary ?? "").trim()
    ? String(rider.previousRaceSummary).split(/\s*\|\s*/).filter(Boolean).length
    : 0;
  return Math.max(previousRaceResults, summaryCount);
};

const today = readJson("public/data/races/today.generated.json");
const bankIndex = readJson("public/data/venues/banks/index.json");
const insightIndex = readJson("public/data/venues/bank-insights/index.json");

const rows = [];
const warnings = [];

for (const venue of today.venues ?? []) {
  const bankTarget = findVenueBankTarget(bankIndex, venue);
  const insightTargets = findVenueInsightTargets(insightIndex, venue);
  if (isVenueOperationSkipped(venue)) {
    warnings.push(`[cancelled-venue] ${venue.venue ?? venue.venueName ?? ""} ${venue.venueOperationLabel || venue.venueOperationStatus}`);
  }
  const venueBaseSummaryStatus = bankTarget
    ? existsPublicFile(bankTarget.file) ? "ready" : "index-file-missing"
    : "missing";
  const venueMasterInsightStatus = insightTargets.bankMaster
    ? `${insightTargets.bankMaster.status ?? "unknown"}${existsPublicFile(insightTargets.bankMaster.file) ? "" : ":file-missing"}`
    : "missing";

  for (const race of venue.races ?? []) {
    if (isRaceSkippedByOperation(venue, race)) {
      const label = isVenueOperationSkipped(venue)
        ? venue.venueOperationLabel || venue.venueOperationStatus
        : race.raceOperationLabel || race.raceOperationStatus;
      warnings.push(`[${isVenueOperationSkipped(venue) ? "skipped-cancelled" : "cancelled-race"}] ${venue.venue ?? venue.venueName ?? ""} ${race.raceNo}R: ${label}`);
      continue;
    }
    const riders = Array.isArray(race.riders) ? race.riders : [];
    const riderCount = riders.length;
    const expectedTrifectaCount = riderCount >= 3 ? riderCount * (riderCount - 1) * (riderCount - 2) : 0;
    const actualTrifectaCount = Array.isArray(race.oddsTrifecta) ? race.oddsTrifecta.length : 0;
    const riderDetailCount = riders.filter((rider) => {
      if (rider.materialMissing) return false;
      return Boolean(String(rider.carNo ?? "").trim() && String(rider.name ?? rider.fullName ?? "").trim());
    }).length;
    const historyCountByRider = Object.fromEntries(
      riders.map((rider) => [`${rider.carNo ?? "?"}:${rider.name ?? rider.fullName ?? ""}`, getRiderHistoryCount(rider)])
    );
    const lineupStatus = getLineupStatus(race);
    const lineFallbackParts = parseLineFallbackParts(race.sourceNote);
    const row = {
      date: today.date,
      venueName: venue.venue ?? venue.venueName ?? "",
      raceNumber: race.raceNo,
      raceTitle: race.title ?? "",
      riderCount,
      expectedTrifectaCount,
      actualTrifectaCount,
      lineupStatus,
      riderDetailCount,
      historyCountByRider,
      venueBaseSummaryStatus,
      venueMasterInsightStatus,
    };
    rows.push(row);

    const prefix = `${row.date} ${row.venueName} ${row.raceNumber}R`;
    if (actualTrifectaCount !== expectedTrifectaCount) {
      warnings.push(`${prefix}: odds count mismatch expected=${expectedTrifectaCount} actual=${actualTrifectaCount}`);
    }
    if (riderDetailCount !== riderCount) {
      warnings.push(`${prefix}: rider detail count mismatch riders=${riderCount} details=${riderDetailCount}`);
    }
    if (riderCount >= 3 && actualTrifectaCount === 0) {
      warnings.push(`${prefix}: odds missing for riderCount=${riderCount}`);
    }
    if (lineFallbackParts.some((part) => /accepted/i.test(part)) && !hasUsableLineup(race)) {
      warnings.push(`${prefix}: source note says lineup accepted but parsed lineup is empty`);
    }
    if (!hasUsableLineup(race) && lineFallbackParts.some((part) => /unavailable/i.test(part))) {
      warnings.push(`${prefix}: lineup unavailable (${lineFallbackParts.join(" / ")})`);
    }
    if (venueBaseSummaryStatus !== "ready") {
      warnings.push(`${prefix}: venue base summary unresolved (${venueBaseSummaryStatus})`);
    }
    if (insightTargets.bankMaster?.status === "ready" && venueMasterInsightStatus !== "ready") {
      warnings.push(`${prefix}: bank-master ready but file cannot be resolved (${venueMasterInsightStatus})`);
    }
  }
}

console.log(JSON.stringify({
  generatedAt: new Date().toISOString(),
  date: today.date,
  raceCount: rows.length,
  warningCount: warnings.length,
  rows,
  warnings,
}, null, 2));

if (warnings.length > 0) {
  console.error(`\n[check-today-race-material-completeness] warnings=${warnings.length}`);
  for (const warning of warnings) {
    console.error(`- ${warning}`);
  }
}
