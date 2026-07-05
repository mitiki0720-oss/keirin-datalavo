import type {
  KurariExHistoricalAvailabilitySummary,
  KurariExHistoricalCoverage,
  KurariExHistoricalCoverageEntry,
  KurariExHistoricalCoverageField,
  KurariExHistoricalDailyShard,
  KurariExHistoricalFieldProvenance,
  KurariExHistoricalFieldProvenanceStatus,
  KurariExHistoricalHistoryLoadResult,
  KurariExHistoricalIndex,
  KurariExHistoricalIndexLoadResult,
  KurariExHistoricalRace,
  KurariExHistoricalRaceProvenance,
  KurariExHistoricalShardLoadResult,
  KurariExHistoricalSource,
  KurariExHistoricalValidationIssue,
} from "../types/kurariExHistoricalResult";
import {
  KURARI_EX_HISTORICAL_COVERAGE_FIELDS,
  KURARI_EX_HISTORICAL_RESULT_VERSION,
} from "../types/kurariExHistoricalResult";

export const KURARI_EX_HISTORICAL_RESULT_TREND_LAB_ROOT =
  "/data/analytics/kurari-ex-result-trend-lab-history";
export const KURARI_EX_HISTORICAL_RESULT_TREND_LAB_INDEX_PATH =
  `${KURARI_EX_HISTORICAL_RESULT_TREND_LAB_ROOT}/index.generated.json`;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const SHA256_PATTERN = /^(?:sha256:)?[a-f0-9]{64}$/iu;
const RACE_STATUSES = new Set(["confirmed", "cancelled", "unavailable"]);
const SOURCE_STATUSES = new Set(["official", "partial", "unavailable", "invalid"]);
const SHARD_STATUSES = new Set(["ready", "partial", "unavailable", "invalid"]);
const AVAILABILITY_STATUSES = new Set(["unavailable", "partial", "implemented"]);
const PROVENANCE_STATUSES = new Set([
  "present",
  "absent-in-source",
  "not-collected",
  "source-unavailable",
  "invalid",
  "conflict",
]);
const TIME_BANDS = new Set(["morning", "day", "night", "midnight"]);

type ValidationResult<T> = {
  value: T | null;
  issues: KurariExHistoricalValidationIssue[];
};

type FetchResult =
  | { status: "loaded"; value: unknown }
  | { status: "missing" | "invalid" | "unavailable"; detail: string };

type CurrentOfficialRaceContext = {
  date: string;
  venue: string;
  venueCode: string;
  source: KurariExHistoricalSource;
  provenance: KurariExHistoricalRaceProvenance;
};

export type KurariExCurrentOfficialNormalizationResult = ValidationResult<KurariExHistoricalRace>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoDate(value: unknown): value is string {
  if (!isNonEmptyString(value) || !ISO_DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isIsoDateTime(value: unknown): value is string {
  return isNonEmptyString(value) && !Number.isNaN(Date.parse(value));
}

function isNullableString(value: unknown) {
  return value === null || typeof value === "string";
}

function isNullableBoolean(value: unknown) {
  return value === null || typeof value === "boolean";
}

function isNullableFiniteNumber(value: unknown) {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isNullablePositiveInteger(value: unknown) {
  return value === null || (Number.isInteger(value) && Number(value) > 0);
}

function issue(
  scope: KurariExHistoricalValidationIssue["scope"],
  reason: string,
  path: string,
  raceKey?: string,
): KurariExHistoricalValidationIssue {
  return { scope, reason, path, ...(raceKey ? { raceKey } : {}) };
}

function publicPath(path: string) {
  const base = import.meta.env.BASE_URL.replace(/\/$/u, "");
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalized}`;
}

function normalizeShardPath(path: string) {
  const normalized = path.replaceAll("\\", "/");
  if (normalized.startsWith("public/")) return `/${normalized.slice("public/".length)}`;
  if (normalized.startsWith("/public/")) return `/${normalized.slice("/public/".length)}`;
  if (normalized.startsWith("data/")) return `/${normalized}`;
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

async function fetchHistoricalJson(path: string): Promise<FetchResult> {
  try {
    const response = await fetch(publicPath(path), { cache: "no-store" });
    if (response.status === 404) {
      return { status: "missing", detail: `${path}: not found` };
    }
    if (!response.ok) {
      return { status: "unavailable", detail: `${path}: HTTP ${response.status}` };
    }
    try {
      return { status: "loaded", value: await response.json() as unknown };
    } catch {
      return { status: "invalid", detail: `${path}: malformed JSON` };
    }
  } catch {
    return { status: "unavailable", detail: `${path}: fetch unavailable` };
  }
}

export function buildKurariExHistoricalRaceKey(input: {
  date: string;
  venue: string;
  venueCode: string;
  raceNumber: number;
}) {
  const venueKey = input.venueCode.trim() || input.venue.trim();
  if (!isIsoDate(input.date) || !venueKey || !Number.isInteger(input.raceNumber) || input.raceNumber <= 0) {
    return null;
  }
  return `${input.date}|${venueKey}|${input.raceNumber}`;
}

function validateProvenanceEntry(
  value: unknown,
  path: string,
  scope: KurariExHistoricalValidationIssue["scope"],
  raceKey?: string,
) {
  const issues: KurariExHistoricalValidationIssue[] = [];
  if (!isRecord(value)) {
    issues.push(issue(scope, "provenance-entry-missing", path, raceKey));
    return issues;
  }
  if (!PROVENANCE_STATUSES.has(String(value.status))) {
    issues.push(issue(scope, "provenance-status-invalid", `${path}.status`, raceKey));
  }
  if (value.sourceRef !== undefined && !isNullableString(value.sourceRef)) {
    issues.push(issue(scope, "provenance-source-ref-invalid", `${path}.sourceRef`, raceKey));
  }
  if (value.note !== undefined && !isNullableString(value.note)) {
    issues.push(issue(scope, "provenance-note-invalid", `${path}.note`, raceKey));
  }
  return issues;
}

function validateRaceProvenance(
  value: unknown,
  path: string,
  raceKey?: string,
) {
  if (!isRecord(value)) {
    return [issue("race", "provenance-object-missing", path, raceKey)];
  }
  return KURARI_EX_HISTORICAL_COVERAGE_FIELDS.flatMap((field) =>
    validateProvenanceEntry(value[field], `${path}.${field}`, "race", raceKey)
  );
}

function validateSource(
  value: unknown,
  path: string,
  raceDate: string,
  raceKey?: string,
) {
  const issues: KurariExHistoricalValidationIssue[] = [];
  if (!isRecord(value)) {
    return [issue("race", "source-object-missing", path, raceKey)];
  }
  if (!isNonEmptyString(value.provider)) {
    issues.push(issue("race", "source-provider-missing", `${path}.provider`, raceKey));
  }
  if (!isIsoDateTime(value.fetchedAt)) {
    issues.push(issue("race", "source-fetched-at-invalid", `${path}.fetchedAt`, raceKey));
  }
  if (!isIsoDate(value.sourceDate)) {
    issues.push(issue("race", "source-date-invalid", `${path}.sourceDate`, raceKey));
  } else if (raceDate && value.sourceDate !== raceDate) {
    issues.push(issue("race", "source-date-race-date-mismatch", `${path}.sourceDate`, raceKey));
  }
  if (!isNonEmptyString(value.responseHash) || !SHA256_PATTERN.test(value.responseHash)) {
    issues.push(issue("race", "source-response-hash-invalid", `${path}.responseHash`, raceKey));
  }
  if (!isNonEmptyString(value.parserVersion)) {
    issues.push(issue("race", "source-parser-version-missing", `${path}.parserVersion`, raceKey));
  }
  for (const field of ["endpoint", "sourceUrl", "listType", "detailType"] as const) {
    if (!isNullableString(value[field])) {
      issues.push(issue("race", `source-${field}-invalid`, `${path}.${field}`, raceKey));
    }
  }
  return issues;
}

function provenanceStatus(
  provenance: Record<string, unknown>,
  field: KurariExHistoricalCoverageField,
) {
  const entry = provenance[field];
  return isRecord(entry) ? String(entry.status) : "";
}

function validateConfirmedRace(
  race: Record<string, unknown>,
  path: string,
  raceKey: string,
) {
  const issues: KurariExHistoricalValidationIssue[] = [];
  if (race.status !== "confirmed") return issues;

  const result = isRecord(race.result) ? race.result : {};
  const provenance = isRecord(race.provenance) ? race.provenance : {};
  const carFields = ["firstCarNo", "secondCarNo", "thirdCarNo"] as const;
  for (const field of carFields) {
    if (!Number.isInteger(result[field]) || Number(result[field]) <= 0) {
      issues.push(issue("race", `confirmed-${field}-missing`, `${path}.result.${field}`, raceKey));
    }
  }
  if (!isNonEmptyString(result.trifecta)) {
    issues.push(issue("race", "confirmed-trifecta-missing", `${path}.result.trifecta`, raceKey));
  }
  if (!Number.isInteger(result.trifectaPayoutYen) || Number(result.trifectaPayoutYen) <= 0) {
    issues.push(issue("race", "confirmed-trifecta-payout-invalid", `${path}.result.trifectaPayoutYen`, raceKey));
  }
  if (provenanceStatus(provenance, "result") !== "present") {
    issues.push(issue("race", "confirmed-result-provenance-not-present", `${path}.provenance.result`, raceKey));
  }
  if (provenanceStatus(provenance, "payout") !== "present") {
    issues.push(issue("race", "confirmed-payout-provenance-not-present", `${path}.provenance.payout`, raceKey));
  }

  const dataGroups: Array<{
    field: KurariExHistoricalCoverageField;
    hasData: boolean;
  }> = [
    {
      field: "kimarite",
      hasData: isRecord(race.kimarite)
        && (isNonEmptyString(race.kimarite.first) || isNonEmptyString(race.kimarite.second)),
    },
    {
      field: "weather",
      hasData: isRecord(race.weather)
        && Object.values(race.weather).some((value) => value !== null && value !== ""),
    },
    {
      field: "odds",
      hasData: isRecord(race.odds)
        && Object.values(race.odds).some((value) => value !== null),
    },
    {
      field: "lineup",
      hasData: isRecord(race.lineup)
        && (isNonEmptyString(race.lineup.raw) || Array.isArray(race.lineup.structured)),
    },
    {
      field: "bSb",
      hasData: isRecord(race.bSb)
        && Object.values(race.bSb).some((value) => value !== null && value !== ""),
    },
  ];
  for (const group of dataGroups) {
    if (group.hasData && provenanceStatus(provenance, group.field) !== "present") {
      issues.push(issue(
        "race",
        `${group.field}-data-without-present-provenance`,
        `${path}.provenance.${group.field}`,
        raceKey,
      ));
    }
  }
  return issues;
}

export function validateKurariExHistoricalResultRace(
  value: unknown,
  path = "race",
): ValidationResult<KurariExHistoricalRace> {
  const issues: KurariExHistoricalValidationIssue[] = [];
  if (!isRecord(value)) {
    return { value: null, issues: [issue("race", "race-object-invalid", path)] };
  }

  const raceKey = isNonEmptyString(value.raceKey) ? value.raceKey : "";
  const date = isIsoDate(value.date) ? value.date : "";
  const venue = typeof value.venue === "string" ? value.venue.trim() : "";
  const venueCode = typeof value.venueCode === "string" ? value.venueCode.trim() : "";
  const raceNumber = Number(value.raceNumber);

  if (!raceKey) issues.push(issue("race", "race-key-missing", `${path}.raceKey`));
  if (!date) issues.push(issue("race", "race-date-invalid", `${path}.date`, raceKey));
  if (!venue && !venueCode) {
    issues.push(issue("race", "race-venue-missing", `${path}.venue`, raceKey));
  }
  if (!Number.isInteger(raceNumber) || raceNumber <= 0) {
    issues.push(issue("race", "race-number-invalid", `${path}.raceNumber`, raceKey));
  }
  if (!RACE_STATUSES.has(String(value.status))) {
    issues.push(issue("race", "race-status-invalid", `${path}.status`, raceKey));
  }

  const expectedRaceKey = buildKurariExHistoricalRaceKey({
    date,
    venue,
    venueCode,
    raceNumber,
  });
  if (raceKey && expectedRaceKey && raceKey !== expectedRaceKey) {
    issues.push(issue("race", "race-key-canonical-mismatch", `${path}.raceKey`, raceKey));
  }

  issues.push(...validateSource(value.source, `${path}.source`, date, raceKey));
  issues.push(...validateRaceProvenance(value.provenance, `${path}.provenance`, raceKey));

  const result = value.result;
  if (!isRecord(result)) {
    issues.push(issue("race", "result-object-missing", `${path}.result`, raceKey));
  } else {
    for (const field of ["firstCarNo", "secondCarNo", "thirdCarNo"] as const) {
      if (!isNullablePositiveInteger(result[field])) {
        issues.push(issue("race", `result-${field}-invalid`, `${path}.result.${field}`, raceKey));
      }
    }
    if (!isNullableString(result.trifecta)) {
      issues.push(issue("race", "result-trifecta-invalid", `${path}.result.trifecta`, raceKey));
    }
    if (!isNullablePositiveInteger(result.trifectaPayoutYen)) {
      issues.push(issue("race", "result-payout-invalid", `${path}.result.trifectaPayoutYen`, raceKey));
    }
  }

  const kimarite = value.kimarite;
  if (!isRecord(kimarite) || !isNullableString(kimarite.first) || !isNullableString(kimarite.second)) {
    issues.push(issue("race", "kimarite-object-invalid", `${path}.kimarite`, raceKey));
  }

  const weather = value.weather;
  if (
    !isRecord(weather)
    || !isNullableString(weather.weather)
    || !isNullableFiniteNumber(weather.windSpeed)
    || !isNullableString(weather.windDirection)
    || !isNullableString(weather.windDirectionBackstretchVector)
  ) {
    issues.push(issue("race", "weather-object-invalid", `${path}.weather`, raceKey));
  }

  const category = value.category;
  if (
    !isRecord(category)
    || !isNullableString(category.grade)
    || !isNullableString(category.raceClass)
    || !isNullablePositiveInteger(category.carCount)
    || !(category.timeBand === null || TIME_BANDS.has(String(category.timeBand)))
  ) {
    issues.push(issue("race", "category-object-invalid", `${path}.category`, raceKey));
  }

  const odds = value.odds;
  if (
    !isRecord(odds)
    || !isNullablePositiveInteger(odds.favoriteRank)
    || !isNullableString(odds.firstFavoriteCombination)
    || !isNullableBoolean(odds.closingOddsAvailable)
    || !isNullableBoolean(odds.oddsMovementAvailable)
  ) {
    issues.push(issue("race", "odds-object-invalid", `${path}.odds`, raceKey));
  }

  const lineup = value.lineup;
  const structuredValid = isRecord(lineup)
    && (
      lineup.structured === null
      || (
        Array.isArray(lineup.structured)
        && lineup.structured.every((line) =>
          Array.isArray(line)
          && line.every((carNo) => Number.isInteger(carNo) && Number(carNo) > 0)
        )
      )
    );
  if (
    !isRecord(lineup)
    || !isNullableString(lineup.raw)
    || !structuredValid
    || !isNullablePositiveInteger(lineup.lineCount)
    || !PROVENANCE_STATUSES.has(String(lineup.sourceStatus))
  ) {
    issues.push(issue("race", "lineup-object-invalid", `${path}.lineup`, raceKey));
  }

  const bSb = value.bSb;
  if (
    !isRecord(bSb)
    || !isNullableString(bSb.bRider)
    || !isNullablePositiveInteger(bSb.bCarNo)
    || !isNullableBoolean(bSb.sbAvailable)
  ) {
    issues.push(issue("race", "b-sb-object-invalid", `${path}.bSb`, raceKey));
  }

  issues.push(...validateConfirmedRace(value, path, raceKey));
  return {
    value: issues.length ? null : value as KurariExHistoricalRace,
    issues,
  };
}

function validateCoverage(value: unknown, path: string, scope: "index" | "shard") {
  const issues: KurariExHistoricalValidationIssue[] = [];
  if (!isRecord(value)) {
    return [issue(scope, "coverage-object-missing", path)];
  }
  for (const field of KURARI_EX_HISTORICAL_COVERAGE_FIELDS) {
    const entry = value[field];
    if (
      !isRecord(entry)
      || !AVAILABILITY_STATUSES.has(String(entry.status))
      || !Number.isInteger(entry.availableRaceCount)
      || Number(entry.availableRaceCount) < 0
      || !Number.isInteger(entry.totalRaceCount)
      || Number(entry.totalRaceCount) < 0
      || Number(entry.availableRaceCount) > Number(entry.totalRaceCount)
    ) {
      issues.push(issue(scope, "coverage-entry-invalid", `${path}.${field}`));
    }
  }
  return issues;
}

export function validateKurariExHistoricalResultTrendLabIndex(
  value: unknown,
): ValidationResult<KurariExHistoricalIndex> {
  const issues: KurariExHistoricalValidationIssue[] = [];
  if (!isRecord(value)) {
    return { value: null, issues: [issue("index", "index-object-invalid", "index")] };
  }
  if (value.version !== KURARI_EX_HISTORICAL_RESULT_VERSION) {
    issues.push(issue("index", "index-version-invalid", "index.version"));
  }
  if (!isIsoDateTime(value.generatedAt)) {
    issues.push(issue("index", "index-generated-at-invalid", "index.generatedAt"));
  }
  if (!SOURCE_STATUSES.has(String(value.sourceStatus))) {
    issues.push(issue("index", "index-source-status-invalid", "index.sourceStatus"));
  }

  const range = value.range;
  if (
    !isRecord(range)
    || !isIsoDate(range.from)
    || !isIsoDate(range.to)
    || String(range.from).localeCompare(String(range.to)) > 0
  ) {
    issues.push(issue("index", "index-range-invalid", "index.range"));
  }
  if (!Array.isArray(value.shards)) {
    issues.push(issue("index", "index-shards-invalid", "index.shards"));
  }
  if (!Number.isInteger(value.shardCount) || Number(value.shardCount) < 0) {
    issues.push(issue("index", "index-shard-count-invalid", "index.shardCount"));
  } else if (Array.isArray(value.shards) && value.shardCount !== value.shards.length) {
    issues.push(issue("index", "index-shard-count-mismatch", "index.shardCount"));
  }
  if (!Number.isInteger(value.raceCount) || Number(value.raceCount) < 0) {
    issues.push(issue("index", "index-race-count-invalid", "index.raceCount"));
  }

  const dates = new Set<string>();
  const paths = new Set<string>();
  if (Array.isArray(value.shards)) {
    value.shards.forEach((rawShard, shardIndex) => {
      const shardPath = `index.shards[${shardIndex}]`;
      if (!isRecord(rawShard)) {
        issues.push(issue("index", "index-shard-invalid", shardPath));
        return;
      }
      if (!isIsoDate(rawShard.date)) {
        issues.push(issue("index", "index-shard-date-invalid", `${shardPath}.date`));
      } else {
        if (dates.has(rawShard.date)) {
          issues.push(issue("index", "index-shard-date-duplicate", `${shardPath}.date`));
        }
        dates.add(rawShard.date);
        if (
          isRecord(range)
          && isIsoDate(range.from)
          && isIsoDate(range.to)
          && (rawShard.date < range.from || rawShard.date > range.to)
        ) {
          issues.push(issue("index", "index-shard-date-out-of-range", `${shardPath}.date`));
        }
      }
      if (!isNonEmptyString(rawShard.path)) {
        issues.push(issue("index", "index-shard-path-missing", `${shardPath}.path`));
      } else {
        const normalized = normalizeShardPath(rawShard.path);
        if (!normalized.startsWith(`${KURARI_EX_HISTORICAL_RESULT_TREND_LAB_ROOT}/daily/`)) {
          issues.push(issue("index", "index-shard-path-outside-namespace", `${shardPath}.path`));
        }
        if (paths.has(normalized)) {
          issues.push(issue("index", "index-shard-path-duplicate", `${shardPath}.path`));
        }
        paths.add(normalized);
      }
      if (!Number.isInteger(rawShard.raceCount) || Number(rawShard.raceCount) < 0) {
        issues.push(issue("index", "index-shard-race-count-invalid", `${shardPath}.raceCount`));
      }
      if (!SHARD_STATUSES.has(String(rawShard.status))) {
        issues.push(issue("index", "index-shard-status-invalid", `${shardPath}.status`));
      }
      const sourceSummary = rawShard.sourceSummary;
      if (
        !isRecord(sourceSummary)
        || !Array.isArray(sourceSummary.providers)
        || !sourceSummary.providers.every(isNonEmptyString)
        || !isNullableString(sourceSummary.fetchedAtFrom)
        || !isNullableString(sourceSummary.fetchedAtTo)
      ) {
        issues.push(issue("index", "index-shard-source-summary-invalid", `${shardPath}.sourceSummary`));
      }
    });
  }

  const provenance = value.provenance;
  if (
    !isRecord(provenance)
    || !isNonEmptyString(provenance.provider)
    || !isNonEmptyString(provenance.generator)
    || !isNonEmptyString(provenance.parserVersion)
    || !isIsoDateTime(provenance.generatedAt)
  ) {
    issues.push(issue("index", "index-provenance-invalid", "index.provenance"));
  }
  issues.push(...validateCoverage(value.coverage, "index.coverage", "index"));
  return {
    value: issues.length ? null : value as KurariExHistoricalIndex,
    issues,
  };
}

export function validateKurariExHistoricalResultTrendLabDailyShard(
  value: unknown,
  expectedDate?: string,
): ValidationResult<KurariExHistoricalDailyShard> {
  const issues: KurariExHistoricalValidationIssue[] = [];
  if (!isRecord(value)) {
    return { value: null, issues: [issue("shard", "shard-object-invalid", "shard")] };
  }
  if (value.version !== KURARI_EX_HISTORICAL_RESULT_VERSION) {
    issues.push(issue("shard", "shard-version-invalid", "shard.version"));
  }
  const shardDate = isIsoDate(value.date) ? value.date : "";
  if (!shardDate) issues.push(issue("shard", "shard-date-invalid", "shard.date"));
  if (expectedDate && shardDate !== expectedDate) {
    issues.push(issue("shard", "index-shard-date-mismatch", "shard.date"));
  }
  if (!isIsoDateTime(value.generatedAt)) {
    issues.push(issue("shard", "shard-generated-at-invalid", "shard.generatedAt"));
  }
  if (!SOURCE_STATUSES.has(String(value.sourceStatus))) {
    issues.push(issue("shard", "shard-source-status-invalid", "shard.sourceStatus"));
  }
  if (!Array.isArray(value.races)) {
    issues.push(issue("shard", "shard-races-invalid", "shard.races"));
  } else {
    value.races.forEach((race, index) => {
      if (isRecord(race) && shardDate && race.date !== shardDate) {
        issues.push(issue(
          "race",
          "race-date-shard-date-mismatch",
          `shard.races[${index}].date`,
          isNonEmptyString(race.raceKey) ? race.raceKey : undefined,
        ));
      }
    });
  }
  return {
    value: issues.length ? null : value as KurariExHistoricalDailyShard,
    issues,
  };
}

export async function loadKurariExHistoricalResultTrendLabIndex():
Promise<KurariExHistoricalIndexLoadResult> {
  const fetched = await fetchHistoricalJson(KURARI_EX_HISTORICAL_RESULT_TREND_LAB_INDEX_PATH);
  if (fetched.status !== "loaded") {
    const status = fetched.status === "missing" ? "not-found" : fetched.status;
    return {
      status,
      index: null,
      issues: [issue(
        "index",
        fetched.status === "missing" ? "index-not-found" : `index-${fetched.status}`,
        KURARI_EX_HISTORICAL_RESULT_TREND_LAB_INDEX_PATH,
      )],
    };
  }
  const validated = validateKurariExHistoricalResultTrendLabIndex(fetched.value);
  return {
    status: validated.value ? "loaded" : "invalid",
    index: validated.value,
    issues: validated.issues,
  };
}

async function loadShard(
  indexShard: KurariExHistoricalIndex["shards"][number],
): Promise<KurariExHistoricalShardLoadResult> {
  const path = normalizeShardPath(indexShard.path);
  const fetched = await fetchHistoricalJson(path);
  if (fetched.status !== "loaded") {
    return {
      date: indexShard.date,
      path,
      status: fetched.status,
      shard: null,
      acceptedRaces: [],
      rejectedRaces: [],
      issues: [issue(
        "shard",
        fetched.status === "missing" ? "shard-missing" : `shard-${fetched.status}`,
        path,
      )],
    };
  }

  const validatedShard = validateKurariExHistoricalResultTrendLabDailyShard(
    fetched.value,
    indexShard.date,
  );
  if (!validatedShard.value) {
    return {
      date: indexShard.date,
      path,
      status: "invalid",
      shard: null,
      acceptedRaces: [],
      rejectedRaces: isRecord(fetched.value) && Array.isArray(fetched.value.races)
        ? fetched.value.races
        : [],
      issues: validatedShard.issues,
    };
  }

  const acceptedRaces: KurariExHistoricalRace[] = [];
  const rejectedRaces: unknown[] = [];
  const issues = [...validatedShard.issues];
  validatedShard.value.races.forEach((race, raceIndex) => {
    const validatedRace = validateKurariExHistoricalResultRace(
      race,
      `${path}.races[${raceIndex}]`,
    );
    if (validatedRace.value) acceptedRaces.push(validatedRace.value);
    else {
      rejectedRaces.push(race);
      issues.push(...validatedRace.issues);
    }
  });
  if (validatedShard.value.races.length !== indexShard.raceCount) {
    issues.push(issue("shard", "shard-race-count-index-mismatch", path));
  }
  return {
    date: indexShard.date,
    path,
    status: issues.length ? "invalid" : "loaded",
    shard: validatedShard.value,
    acceptedRaces,
    rejectedRaces,
    issues,
  };
}

export async function loadKurariExHistoricalResultTrendLabShards(
  index: KurariExHistoricalIndex,
) {
  return Promise.all(index.shards.map((shard) => loadShard(shard)));
}

function emptyCoverage(): KurariExHistoricalCoverage {
  return Object.fromEntries(
    KURARI_EX_HISTORICAL_COVERAGE_FIELDS.map((field) => [
      field,
      {
        status: "unavailable",
        availableRaceCount: 0,
        totalRaceCount: 0,
      } satisfies KurariExHistoricalCoverageEntry,
    ]),
  ) as KurariExHistoricalCoverage;
}

function summarizeCoverage(races: KurariExHistoricalRace[]): KurariExHistoricalCoverage {
  return Object.fromEntries(
    KURARI_EX_HISTORICAL_COVERAGE_FIELDS.map((field) => {
      const availableRaceCount = races.filter(
        (race) => race.provenance[field].status === "present",
      ).length;
      const status =
        availableRaceCount === 0
          ? "unavailable"
          : availableRaceCount === races.length
            ? "implemented"
            : "partial";
      return [
        field,
        {
          status,
          availableRaceCount,
          totalRaceCount: races.length,
        } satisfies KurariExHistoricalCoverageEntry,
      ];
    }),
  ) as KurariExHistoricalCoverage;
}

function canRaceBeUsedForTrendLab(race: KurariExHistoricalRace) {
  return race.status === "confirmed"
    && race.provenance.result.status === "present"
    && race.provenance.payout.status === "present"
    && race.result.firstCarNo !== null
    && race.result.secondCarNo !== null
    && race.result.thirdCarNo !== null
    && Boolean(race.result.trifecta)
    && race.result.trifectaPayoutYen !== null
    && race.result.trifectaPayoutYen > 0;
}

function countReasons(issues: KurariExHistoricalValidationIssue[]) {
  const counts = new Map<string, number>();
  issues.forEach((item) => counts.set(item.reason, (counts.get(item.reason) ?? 0) + 1));
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason));
}

function unavailableSummary(
  notes: string[],
  issues: KurariExHistoricalValidationIssue[] = [],
): KurariExHistoricalAvailabilitySummary {
  return {
    status: "unavailable",
    indexFound: false,
    shardCount: 0,
    loadedShardCount: 0,
    raceCount: 0,
    acceptedRaceCount: 0,
    rejectedRaceCount: 0,
    rejectedReasons: countReasons(issues),
    dateRange: { from: null, to: null },
    sourceProviders: [],
    coverageByField: emptyCoverage(),
    canUseForTrendLab: false,
    notes,
  };
}

export async function loadKurariExHistoricalResultTrendLabHistory():
Promise<KurariExHistoricalHistoryLoadResult> {
  const indexResult = await loadKurariExHistoricalResultTrendLabIndex();
  if (!indexResult.index) {
    return {
      index: null,
      shards: [],
      races: [],
      availability: unavailableSummary(
        [
          indexResult.status === "not-found"
            ? "historical data is not generated yet"
            : "historical index is unavailable or invalid",
          "schema/loader prepared",
          "localStorage not used",
        ],
        indexResult.issues,
      ),
    };
  }

  const shards = await loadKurariExHistoricalResultTrendLabShards(indexResult.index);
  const allAccepted = shards.flatMap((shard) => shard.acceptedRaces);
  const keyCounts = new Map<string, number>();
  allAccepted.forEach((race) =>
    keyCounts.set(race.raceKey, (keyCounts.get(race.raceKey) ?? 0) + 1)
  );
  const duplicateIssues = allAccepted
    .filter((race) => (keyCounts.get(race.raceKey) ?? 0) > 1)
    .map((race) => issue("race", "duplicate-race-key", "history.races", race.raceKey));
  const races = allAccepted.filter((race) => (keyCounts.get(race.raceKey) ?? 0) === 1);
  const allIssues = [
    ...indexResult.issues,
    ...shards.flatMap((shard) => shard.issues),
    ...duplicateIssues,
  ];
  const rejectedRaceCount =
    shards.reduce((sum, shard) => sum + shard.rejectedRaces.length, 0)
    + duplicateIssues.length;
  const coverageByField = summarizeCoverage(races);
  const trendRaceCount = races.filter(canRaceBeUsedForTrendLab).length;
  const loadedShardCount = shards.filter((shard) => shard.status === "loaded").length;
  const sourceProviders = [...new Set(races.map((race) => race.source.provider))].sort();
  const allCoverageImplemented = KURARI_EX_HISTORICAL_COVERAGE_FIELDS.every(
    (field) => coverageByField[field].status === "implemented",
  );
  const status =
    trendRaceCount === 0
      ? "unavailable"
      : loadedShardCount === indexResult.index.shardCount
        && rejectedRaceCount === 0
        && allCoverageImplemented
        ? "implemented"
        : "partial";
  const notes = [
    "aggregate values must be calculated from accepted races",
    "unknown and unavailable fields are not implemented",
    "localStorage not used",
    ...(loadedShardCount < indexResult.index.shardCount ? ["one or more shards are missing or invalid"] : []),
    ...(rejectedRaceCount > 0 ? ["rejected races are excluded from all aggregates"] : []),
  ];

  return {
    index: indexResult.index,
    shards,
    races,
    availability: {
      status,
      indexFound: true,
      shardCount: indexResult.index.shardCount,
      loadedShardCount,
      raceCount: indexResult.index.raceCount,
      acceptedRaceCount: races.length,
      rejectedRaceCount,
      rejectedReasons: countReasons(allIssues),
      dateRange: {
        from: indexResult.index.range.from,
        to: indexResult.index.range.to,
      },
      sourceProviders,
      coverageByField,
      canUseForTrendLab: trendRaceCount > 0,
      notes,
    },
  };
}

function cleanString(value: unknown) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function positiveNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function normalizeKurariExCurrentOfficialResultRace(
  value: unknown,
  context: CurrentOfficialRaceContext,
): KurariExCurrentOfficialNormalizationResult {
  if (!isRecord(value)) {
    return {
      value: null,
      issues: [issue("race", "current-official-race-invalid", "currentOfficialRace")],
    };
  }
  const raceNumber = positiveInteger(value.raceNumber) ?? 0;
  const raceKey = buildKurariExHistoricalRaceKey({
    date: context.date,
    venue: context.venue,
    venueCode: context.venueCode,
    raceNumber,
  }) ?? "";
  const finishOrder = Array.isArray(value.finishOrder)
    ? value.finishOrder.filter(isRecord)
    : [];
  const carAtRank = (rank: number) =>
    positiveInteger(finishOrder.find((row) => Number(row.rank) === rank)?.carNo);
  const payout = isRecord(value.payout3tan) ? value.payout3tan : {};
  const weatherActual = isRecord(value.weatherActual) ? value.weatherActual : {};
  const operationStatus = String(value.operationStatus ?? "").toLowerCase();
  const status =
    value.resultStatus === "confirmed"
      ? "confirmed"
      : ["cancelled", "no-race"].includes(operationStatus)
        ? "cancelled"
        : "unavailable";

  const candidate: KurariExHistoricalRace = {
    raceKey,
    date: context.date,
    venue: context.venue,
    venueCode: context.venueCode,
    raceNumber,
    status,
    result: {
      firstCarNo: carAtRank(1),
      secondCarNo: carAtRank(2),
      thirdCarNo: carAtRank(3),
      trifecta: cleanString(payout.combination),
      trifectaPayoutYen: positiveInteger(payout.payoutYen),
    },
    kimarite: {
      first: cleanString(value.kimarite)
        ?? cleanString(finishOrder.find((row) => Number(row.rank) === 1)?.kimarite),
      second: cleanString(value.secondKimarite),
    },
    weather: {
      weather: cleanString(weatherActual.condition),
      windSpeed: positiveNumber(weatherActual.windSpeedMps),
      windDirection: cleanString(weatherActual.windDirection),
      windDirectionBackstretchVector: null,
    },
    category: {
      grade: null,
      raceClass: null,
      carCount: finishOrder.length || null,
      timeBand: null,
    },
    odds: {
      favoriteRank: null,
      firstFavoriteCombination: null,
      closingOddsAvailable: null,
      oddsMovementAvailable: null,
    },
    lineup: {
      raw: null,
      structured: null,
      lineCount: null,
      sourceStatus: "not-collected",
    },
    bSb: {
      bRider: null,
      bCarNo: positiveInteger(value.bLeaderCarNo),
      sbAvailable: null,
    },
    source: context.source,
    provenance: context.provenance,
  };
  return validateKurariExHistoricalResultRace(candidate, "currentOfficialRace");
}

export function createKurariExHistoricalFieldProvenance(
  status: KurariExHistoricalFieldProvenanceStatus,
  sourceRef?: string | null,
  note?: string | null,
): KurariExHistoricalFieldProvenance {
  return {
    status,
    ...(sourceRef !== undefined ? { sourceRef } : {}),
    ...(note !== undefined ? { note } : {}),
  };
}
