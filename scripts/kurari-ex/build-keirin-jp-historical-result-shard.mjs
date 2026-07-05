import { build as buildModule } from "esbuild";
import {
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import process from "node:process";
import {
  discoverKeirinJpHistoricalResults,
  listKeirinJpHistoricalVenueCandidates,
} from "./discover-keirin-jp-historical-results.mjs";

const VERSION = "kurari-ex-result-trend-lab-history/v1";
const PARSER_VERSION = "kurari-ex-keirin-jp-historical-shard/v1";
const GENERATOR = "scripts/kurari-ex/build-keirin-jp-historical-result-shard.mjs";
const PUBLIC_NAMESPACE = "/data/analytics/kurari-ex-result-trend-lab-history";
const DEFAULT_OUTPUT = path.join(tmpdir(), "kurari-ex-backfill-dry-run");
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PUBLIC_OUTPUT_ROOT = path.join(
  REPO_ROOT,
  "public",
  "data",
  "analytics",
  "kurari-ex-result-trend-lab-history",
);
const CONFIRMED_NAMESPACE = "kurari-ex-result-trend-lab-history";
const C8_WRITE_FROM = "2026-06-15";
const C8_WRITE_TO = "2026-06-28";
const C8_WRITE_DATES = expandDateRange(C8_WRITE_FROM, C8_WRITE_TO);
const C7_EXISTING_DATES = expandDateRange("2026-06-22", "2026-06-28");
const C6_EXISTING_DATE = "2026-06-28";

function parseArgs(argv) {
  const options = {
    dates: [],
    from: "",
    to: "",
    venueCode: "",
    allVenues: false,
    dryRun: false,
    write: false,
    allowPublicOutput: false,
    confirmNamespace: "",
    outputTemp: false,
    outputPublic: false,
    output: DEFAULT_OUTPUT,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--date") {
      options.dates.push(argv[index + 1] ?? "");
      index += 1;
    } else if (arg === "--from") {
      options.from = argv[index + 1] ?? "";
      index += 1;
    } else if (arg === "--to") {
      options.to = argv[index + 1] ?? "";
      index += 1;
    } else if (arg === "--venue-code") {
      options.venueCode = argv[index + 1] ?? "";
      index += 1;
    } else if (arg === "--all-venues") {
      options.allVenues = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--write") {
      options.write = true;
    } else if (arg === "--allow-public-output") {
      options.allowPublicOutput = true;
    } else if (arg === "--confirm-namespace") {
      options.confirmNamespace = argv[index + 1] ?? "";
      index += 1;
    } else if (arg === "--output-temp") {
      options.outputTemp = true;
    } else if (arg === "--output-public") {
      options.outputPublic = true;
    } else if (arg === "--output") {
      options.output = argv[index + 1] ?? "";
      index += 1;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return options;
}

function isValidDate(value) {
  if (!DATE_PATTERN.test(value)) return false;
  return new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function expandDateRange(from, to) {
  if (!isValidDate(from) || !isValidDate(to) || from > to) {
    throw new Error("--from and --to must be a valid ascending YYYY-MM-DD range");
  }
  const dates = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (dates.length > 62) throw new Error("date range must not exceed 62 days");
  }
  return dates;
}

function isChildPath(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return Boolean(relative)
    && !relative.startsWith("..")
    && !path.isAbsolute(relative);
}

function validateTempOutputPath(output) {
  const tempRoot = path.resolve(tmpdir());
  const resolved = path.resolve(output);
  if (!isChildPath(tempRoot, resolved)) {
    throw new Error(`temp output must be a child of the OS temp directory: ${tempRoot}`);
  }
  return resolved;
}

function validatePublicOutputPath(output) {
  const resolved = path.resolve(output);
  const forbiddenRoots = [
    path.join(REPO_ROOT, "public", "data", "reviews"),
    path.join(REPO_ROOT, "public", "data", "races"),
    path.join(REPO_ROOT, "public", "data", "venues"),
    path.join(REPO_ROOT, "private-input"),
    path.join(REPO_ROOT, "src", "data"),
  ];
  if (forbiddenRoots.some((root) => resolved === root || isChildPath(root, resolved))) {
    throw new Error(`public output target is forbidden: ${resolved}`);
  }
  if (resolved !== path.resolve(PUBLIC_OUTPUT_ROOT)) {
    throw new Error(`public output target is outside the allowed namespace: ${resolved}`);
  }
  return resolved;
}

function validateOptions(options) {
  if (options.outputTemp && options.outputPublic) {
    throw new Error("--output-temp and --output-public are mutually exclusive");
  }
  const outputMode = options.outputPublic ? "public" : "temp";
  const rangeDates = options.from || options.to
    ? expandDateRange(options.from, options.to)
    : [];
  if (rangeDates.length > 0 && options.dates.length > 0) {
    throw new Error("--date cannot be combined with --from/--to");
  }
  const uniqueDates = [...new Set(rangeDates.length ? rangeDates : options.dates)];
  if (
    uniqueDates.length === 0
    || uniqueDates.length > 62
    || !uniqueDates.every(isValidDate)
  ) {
    throw new Error("one to 62 valid dates are required");
  }
  if (!options.dryRun && !options.write) {
    throw new Error("--dry-run is required unless --write is specified");
  }
  if (options.venueCode && !/^\d{2}$/u.test(options.venueCode)) {
    throw new Error("--venue-code must be a two-digit KEIRIN.JP venue code");
  }
  if (options.venueCode && options.allVenues) {
    throw new Error("--venue-code and --all-venues are mutually exclusive");
  }
  if (options.write) {
    if (!options.outputPublic) throw new Error("--write requires --output-public");
    if (!options.allowPublicOutput) throw new Error("--write requires --allow-public-output");
    if (options.confirmNamespace !== CONFIRMED_NAMESPACE) {
      throw new Error(`--write requires --confirm-namespace ${CONFIRMED_NAMESPACE}`);
    }
    if (
      options.from !== C8_WRITE_FROM
      || options.to !== C8_WRITE_TO
      || uniqueDates.length !== C8_WRITE_DATES.length
      || uniqueDates.some((date, index) => date !== C8_WRITE_DATES[index])
    ) {
      throw new Error(
        `C8 public write is restricted to --from ${C8_WRITE_FROM} --to ${C8_WRITE_TO}`,
      );
    }
    if (options.venueCode) {
      throw new Error("C8 public write requires all venues; --venue-code is not allowed");
    }
    validatePublicOutputPath(PUBLIC_OUTPUT_ROOT);
  }

  if (options.outputPublic && !options.dryRun && !options.write) {
    throw new Error("--output-public is path-validation only unless --dry-run is specified");
  }
  const output = validateTempOutputPath(
    options.outputPublic
      ? path.join(tmpdir(), "kurari-ex-backfill-public-candidate")
      : options.output,
  );
  const publicTarget = options.outputPublic
    ? validatePublicOutputPath(PUBLIC_OUTPUT_ROOT)
    : null;
  return {
    ...options,
    dates: uniqueDates.sort(),
    allVenues: options.venueCode ? false : true,
    outputMode,
    output,
    publicTarget,
  };
}

function nullableText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function positiveInteger(value) {
  const parsed = Number(String(value ?? "").replaceAll(/[^\d]/gu, ""));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function finiteNumber(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function provenance(status, sourceRef, note = null) {
  return {
    status,
    sourceRef: sourceRef ?? null,
    note,
  };
}

function normalizeProbe(report, probe) {
  const detailUrl = probe.sourceUrl;
  const entryUrl = detailUrl.replace("type=JSJ012", "type=JSJ006");
  const lineupUrl = detailUrl.replace("type=JSJ012", "type=JSJ005");
  const first = probe.topThree[0];
  const second = probe.topThree[1];
  const third = probe.topThree[2];
  const entryRows = Array.isArray(probe.entries?.sensyuTypeInfo)
    ? probe.entries.sensyuTypeInfo
    : [];
  const bRow = probe.finishRows.find((row) =>
    String(row.BH ?? "").includes("B")
  ) ?? null;
  const hasKimarite = Boolean(nullableText(first?.kimarite) || nullableText(second?.kimarite));
  const hasWeather = Boolean(
    nullableText(probe.detail?.tenki) || finiteNumber(probe.detail?.husoku) !== null,
  );
  const favoriteRank = positiveInteger(probe.trifecta?.ninki);
  const hasEntries = entryRows.length > 0;
  const hasB = Boolean(bRow);

  return {
    raceKey: probe.raceKey,
    date: report.requestedDate,
    venue: report.venue,
    venueCode: report.venueCode,
    raceNumber: probe.raceNumber,
    status: "confirmed",
    storageEligible: true,
    trendEligible: true,
    sourceClassification: "confirmed-accepted",
    sourceStatusHint: probe.rawStatusHint,
    nextAction: "accept",
    result: {
      firstCarNo: positiveInteger(first?.syaban),
      secondCarNo: positiveInteger(second?.syaban),
      thirdCarNo: positiveInteger(third?.syaban),
      trifecta: nullableText(probe.trifecta?.kumiBan),
      trifectaPayoutYen: positiveInteger(probe.trifecta?.haraiGaku),
    },
    kimarite: {
      first: nullableText(first?.kimarite),
      second: nullableText(second?.kimarite),
    },
    weather: {
      weather: nullableText(probe.detail?.tenki),
      windSpeed: finiteNumber(probe.detail?.husoku),
      windDirection: null,
      windDirectionBackstretchVector: null,
    },
    category: {
      grade: nullableText(probe.grade),
      raceClass: nullableText(probe.raceClass),
      carCount: hasEntries ? entryRows.length : probe.finishRows.length || null,
      timeBand: null,
    },
    odds: {
      favoriteRank,
      firstFavoriteCombination: null,
      closingOddsAvailable: null,
      oddsMovementAvailable: null,
    },
    lineup: {
      raw: null,
      structured: null,
      lineCount: null,
      sourceStatus: "source-unavailable",
    },
    bSb: {
      bRider: nullableText(bRow?.sensyuName),
      bCarNo: positiveInteger(bRow?.syaban),
      sbAvailable: null,
    },
    source: {
      provider: "KEIRIN.JP",
      endpoint: "/pc/json",
      sourceUrl: detailUrl,
      listType: "raceschedule/racelist",
      detailType: "JSJ012",
      fetchedAt: report.fetchedAt,
      sourceDate: report.sourceDate,
      responseHash: probe.responseHash,
      parserVersion: PARSER_VERSION,
    },
    provenance: {
      result: provenance("present", detailUrl),
      payout: provenance("present", detailUrl),
      kimarite: provenance(
        hasKimarite ? "present" : "absent-in-source",
        detailUrl,
      ),
      weather: provenance(
        hasWeather ? "present" : "absent-in-source",
        detailUrl,
        "wind direction is absent in JSJ012",
      ),
      odds: provenance(
        favoriteRank ? "present" : "not-collected",
        detailUrl,
        "winning-combination popularity only; first favorite and odds history unavailable",
      ),
      entries: provenance(
        hasEntries ? "present" : "source-unavailable",
        entryUrl,
      ),
      lineup: provenance(
        "source-unavailable",
        lineupUrl,
        "historical JSJ005 returned no official lineup rows; no inference applied",
      ),
      bSb: provenance(
        hasB ? "present" : "absent-in-source",
        detailUrl,
        "B comes from the official BH marker; no separate SB field",
      ),
    },
  };
}

function normalizeDeadHeatProbe(report, probe) {
  const normalized = normalizeProbe(report, probe);
  const placements = [1, 2, 3].map((place) => ({
    place,
    carNos: probe.finishRows
      .filter((row) => positiveInteger(row.tyaku) === place)
      .map((row) => positiveInteger(row.syaban))
      .filter((carNo) => carNo !== null),
  }));
  const trifectaResults = probe.trifectas.map((result) => ({
    combination: nullableText(result.kumiBan),
    payoutYen: positiveInteger(result.haraiGaku),
    popularityRank: positiveInteger(result.ninki),
  }));
  return {
    ...normalized,
    status: "confirmed",
    storageEligible: true,
    trendEligible: false,
    sourceClassification: "confirmed-dead-heat",
    sourceStatusHint: probe.rawStatusHint,
    nextAction: probe.nextAction,
    result: {
      firstCarNo: null,
      secondCarNo: null,
      thirdCarNo: null,
      trifecta: null,
      trifectaPayoutYen: null,
    },
    kimarite: {
      first: null,
      second: null,
    },
    odds: {
      favoriteRank: null,
      firstFavoriteCombination: null,
      closingOddsAvailable: null,
      oddsMovementAvailable: null,
    },
    deadHeat: {
      detected: true,
      placements,
      trifectaResults,
      sourceStatus: "present",
      trendEligible: false,
      excludedReason: "dead-heat-multiple-payout",
      notes: [
        "official placements and all trifecta payouts are preserved",
        "scalar result fields are null to avoid selecting one of multiple official outcomes",
      ],
    },
    provenance: {
      ...normalized.provenance,
      result: provenance(
        "present",
        probe.sourceUrl,
        "lossless dead-heat placements stored in deadHeat.placements",
      ),
      payout: provenance(
        "present",
        probe.sourceUrl,
        "all official trifecta payouts stored in deadHeat.trifectaResults",
      ),
      kimarite: provenance(
        "not-collected",
        probe.sourceUrl,
        "scalar kimarite is withheld because tied placement is not scalar",
      ),
      odds: provenance(
        "present",
        probe.sourceUrl,
        "popularity rank is stored per dead-heat trifecta result",
      ),
    },
  };
}

function normalizeNonTrendProbe(report, probe) {
  const normalized = normalizeProbe(report, probe);
  const conflict = probe.classification === "parser-gap";
  return {
    ...normalized,
    status: probe.normalizedStatus === "cancelled" ? "cancelled" : "unavailable",
    trendEligible: false,
    sourceClassification: probe.classification,
    sourceStatusHint: probe.rawStatusHint,
    nextAction: probe.nextAction,
    result: {
      firstCarNo: null,
      secondCarNo: null,
      thirdCarNo: null,
      trifecta: null,
      trifectaPayoutYen: null,
    },
    kimarite: {
      first: null,
      second: null,
    },
    odds: {
      favoriteRank: null,
      firstFavoriteCombination: null,
      closingOddsAvailable: null,
      oddsMovementAvailable: null,
    },
    provenance: {
      ...normalized.provenance,
      result: provenance(
        conflict ? "conflict" : "source-unavailable",
        probe.sourceUrl,
        probe.reason ?? probe.rawStatusHint,
      ),
      payout: provenance(
        conflict ? "conflict" : "source-unavailable",
        probe.sourceUrl,
        probe.reason ?? probe.rawStatusHint,
      ),
      kimarite: provenance(
        conflict ? "conflict" : "not-collected",
        probe.sourceUrl,
        "not exposed to trend aggregation for a non-confirmed record",
      ),
      odds: provenance(
        conflict ? "conflict" : "not-collected",
        probe.sourceUrl,
        "not exposed to trend aggregation for a non-confirmed record",
      ),
    },
  };
}

function coverageFor(races) {
  const fields = [
    "result",
    "payout",
    "kimarite",
    "weather",
    "odds",
    "entries",
    "lineup",
    "bSb",
  ];
  return Object.fromEntries(fields.map((field) => {
    const availableRaceCount = races.filter(
      (race) => race.provenance[field].status === "present",
    ).length;
    return [
      field,
      {
        status: availableRaceCount === 0
          ? "unavailable"
          : availableRaceCount === races.length
            ? "implemented"
            : "partial",
        availableRaceCount,
        totalRaceCount: races.length,
      },
    ];
  }));
}

function countReasons(reasons) {
  const counts = new Map();
  for (const reason of reasons) {
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason));
}

function evaluatePublicOutputGuard(report, {
  target = PUBLIC_OUTPUT_ROOT,
  write = false,
  allowPublicOutput = false,
  confirmNamespace = "",
} = {}) {
  const reasons = [];
  try {
    validatePublicOutputPath(target);
  } catch (error) {
    reasons.push(error instanceof Error ? error.message : String(error));
  }
  if (write) {
    if (!allowPublicOutput) reasons.push("--write requires --allow-public-output");
    if (confirmNamespace !== CONFIRMED_NAMESPACE) {
      reasons.push(`--write requires --confirm-namespace ${CONFIRMED_NAMESPACE}`);
    }
  }
  if (report.productionBackfillReady !== true) {
    reasons.push("productionBackfillReady is false");
  }
  if (Number(report.sourceRejectedCount) > 0) {
    reasons.push(`sourceRejectedCount is ${report.sourceRejectedCount}`);
  }
  if (Number(report.availability?.rejectedRaceCount) > 0) {
    reasons.push(`rejectedRaceCount is ${report.availability.rejectedRaceCount}`);
  }
  if (Number(report.validator?.issueCount) > 0) {
    reasons.push(`validator issueCount is ${report.validator.issueCount}`);
  }
  for (const classification of [
    "parser-gap",
    "validation-failed",
    "network-or-rate-limit",
    "source-conflict",
  ]) {
    const count = Number(report.classificationCount?.[classification] ?? 0);
    if (count > 0) reasons.push(`${classification} remains: ${count}`);
  }
  const rejectedReasons = report.availability?.rejectedReasons ?? [];
  for (const reason of [
    "source-date-race-date-mismatch",
    "race-date-shard-date-mismatch",
    "duplicate-race-key",
    "confirmed-result-provenance-not-present",
    "confirmed-payout-provenance-not-present",
    "dead-heat-scalar-result-must-be-null",
  ]) {
    if (rejectedReasons.some((entry) => entry.reason === reason && entry.count > 0)) {
      reasons.push(`${reason} remains`);
    }
  }
  const summary = report.indexSummary;
  if (!summary) {
    reasons.push("index summary is missing");
  } else {
    if (summary.productionBackfillReady !== true) {
      reasons.push("index productionBackfillReady is false");
    }
    if (summary.deadHeatRaceCount > 0) {
      if (summary.deadHeatTrendExcludedCount !== summary.deadHeatRaceCount) {
        reasons.push("dead heat trend exclusion count mismatch");
      }
      if (!String(summary.partialReason ?? "").includes("dead heat excluded from trend")) {
        reasons.push("dead heat partialReason is missing");
      }
    }
    if (summary.storageEligibleRaceCount !== report.availability?.acceptedRaceCount) {
      reasons.push("storageEligibleRaceCount does not match acceptedRaceCount");
    }
  }
  if (report.availability?.productionBackfillReady !== true) {
    reasons.push("actual loader productionBackfillReady is false");
  }
  return {
    passed: reasons.length === 0,
    target: path.resolve(target),
    writeRequested: write,
    reasons,
  };
}

function isRejected(action) {
  try {
    action();
    return false;
  } catch {
    return true;
  }
}

function runPublicOutputGuardControls(report) {
  const clone = () => structuredClone(report);
  const productionFalse = clone();
  productionFalse.productionBackfillReady = false;
  productionFalse.indexSummary.productionBackfillReady = false;
  const duplicateRace = clone();
  duplicateRace.availability.rejectedRaceCount = 1;
  duplicateRace.availability.rejectedReasons = [{ reason: "duplicate-race-key", count: 1 }];
  const malformedShard = clone();
  malformedShard.validator.issueCount = 1;
  malformedShard.validator.issues = [{ reason: "shard-object-invalid" }];
  const deadHeatScalar = clone();
  deadHeatScalar.availability.rejectedRaceCount = 1;
  deadHeatScalar.availability.rejectedReasons = [{
    reason: "dead-heat-scalar-result-must-be-null",
    count: 1,
  }];
  const sourceRejected = clone();
  sourceRejected.sourceRejectedCount = 1;

  return {
    positive: {
      osTempOutput:
        path.resolve(validateTempOutputPath(DEFAULT_OUTPUT)) === path.resolve(DEFAULT_OUTPUT),
      publicTargetDryRun:
        evaluatePublicOutputGuard(report, { target: PUBLIC_OUTPUT_ROOT }).passed,
    },
    negative: {
      publicReviewsRejected: isRejected(() =>
        validatePublicOutputPath(path.join(REPO_ROOT, "public/data/reviews/test"))
      ),
      publicRacesRejected: isRejected(() =>
        validatePublicOutputPath(path.join(REPO_ROOT, "public/data/races/test"))
      ),
      wrongAnalyticsNamespaceRejected: isRejected(() =>
        validatePublicOutputPath(path.join(REPO_ROOT, "public/data/analytics/kurari-ex/history"))
      ),
      missingConfirmNamespaceRejected:
        !evaluatePublicOutputGuard(report, {
          target: PUBLIC_OUTPUT_ROOT,
          write: true,
          allowPublicOutput: true,
          confirmNamespace: "",
        }).passed,
      writeWithoutAllowRejected:
        !evaluatePublicOutputGuard(report, {
          target: PUBLIC_OUTPUT_ROOT,
          write: true,
          allowPublicOutput: false,
          confirmNamespace: CONFIRMED_NAMESPACE,
        }).passed,
      productionNotReadyRejected:
        !evaluatePublicOutputGuard(productionFalse).passed,
      duplicateRaceKeyRejected:
        !evaluatePublicOutputGuard(duplicateRace).passed,
      malformedShardRejected:
        !evaluatePublicOutputGuard(malformedShard).passed,
      deadHeatScalarRejected:
        !evaluatePublicOutputGuard(deadHeatScalar).passed,
      sourceRejectedCountRejected:
        !evaluatePublicOutputGuard(sourceRejected).passed,
    },
  };
}

async function loadActualValidator(repoRoot) {
  const validatorPath = path.join(repoRoot, "src/lib/kurariExHistoricalResultLab.ts");
  const built = await buildModule({
    entryPoints: [validatorPath],
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
    write: false,
    define: {
      "import.meta.env.BASE_URL": '"/"',
    },
  });
  const source = built.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

async function loadThroughActualLoader(validator, index, shards) {
  const documents = new Map([
    [`${PUBLIC_NAMESPACE}/index.generated.json`, index],
    ...index.shards.map((entry) => [entry.path, shards.get(entry.date)]),
  ]);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const requested = String(input);
    const value = documents.get(requested);
    if (!value) return new Response("", { status: 404 });
    return new Response(JSON.stringify(value), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    return await validator.loadKurariExHistoricalResultTrendLabHistory();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function runNegativeControls(validator, index, shards) {
  const firstShard = structuredClone(shards.values().next().value);
  const firstRace = firstShard?.races?.[0];
  if (!firstRace) return {};

  const dateMismatch = structuredClone(firstShard);
  dateMismatch.races[0].date = "2000-01-01";
  const sourceDateMismatch = structuredClone(firstRace);
  sourceDateMismatch.source.sourceDate = "2000-01-01";
  const missingResult = structuredClone(firstRace);
  missingResult.result.firstCarNo = null;
  const missingProvenance = structuredClone(firstRace);
  delete missingProvenance.provenance.payout;
  const namespaceMismatch = structuredClone(index);
  namespaceMismatch.shards[0].path = "/data/outside/daily.json";

  const duplicateShard = structuredClone(firstShard);
  duplicateShard.races.push(structuredClone(duplicateShard.races[0]));
  const duplicateIndex = structuredClone(index);
  duplicateIndex.shards = [structuredClone(duplicateIndex.shards[0])];
  duplicateIndex.shardCount = 1;
  duplicateIndex.raceCount = duplicateShard.races.length;
  duplicateIndex.shards[0].raceCount = duplicateShard.races.length;
  duplicateIndex.range = {
    from: duplicateShard.date,
    to: duplicateShard.date,
  };
  const duplicateHistory = await loadThroughActualLoader(
    validator,
    duplicateIndex,
    new Map([[duplicateShard.date, duplicateShard]]),
  );
  const deadHeatRace = [...shards.values()]
    .flatMap((shard) => shard.races)
    .find((race) => race.deadHeat?.detected === true);
  const incompleteDeadHeat = deadHeatRace ? structuredClone(deadHeatRace) : null;
  if (incompleteDeadHeat) {
    incompleteDeadHeat.deadHeat.trifectaResults =
      incompleteDeadHeat.deadHeat.trifectaResults.slice(0, 1);
  }
  const scalarDeadHeat = deadHeatRace ? structuredClone(deadHeatRace) : null;
  if (scalarDeadHeat) scalarDeadHeat.result.firstCarNo = 1;

  return {
    raceDateMismatchRejected:
      validator.validateKurariExHistoricalResultTrendLabDailyShard(
        dateMismatch,
        firstShard.date,
      ).issues.some((issue) => issue.reason === "race-date-shard-date-mismatch"),
    sourceDateMismatchRejected:
      validator.validateKurariExHistoricalResultRace(sourceDateMismatch).issues
        .some((issue) => issue.reason === "source-date-race-date-mismatch"),
    confirmedMissingResultRejected:
      validator.validateKurariExHistoricalResultRace(missingResult).issues
        .some((issue) => issue.reason === "confirmed-firstCarNo-missing"),
    missingProvenanceRejected:
      validator.validateKurariExHistoricalResultRace(missingProvenance).issues
        .some((issue) => issue.reason === "provenance-entry-missing"),
    namespaceOutsideRejected:
      validator.validateKurariExHistoricalResultTrendLabIndex(namespaceMismatch).issues
        .some((issue) => issue.reason === "index-shard-path-outside-namespace"),
    duplicateRaceKeyRejected:
      duplicateHistory.availability.rejectedReasons
        .some((entry) => entry.reason === "duplicate-race-key"),
    incompleteDeadHeatRejected:
      !incompleteDeadHeat
      || validator.validateKurariExHistoricalResultRace(incompleteDeadHeat).issues
        .some((item) => item.reason === "dead-heat-trifecta-results-invalid"),
    scalarDeadHeatRejected:
      !scalarDeadHeat
      || validator.validateKurariExHistoricalResultRace(scalarDeadHeat).issues
        .some((item) => item.reason === "dead-heat-scalar-result-must-be-null"),
  };
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function buildDryRun(options) {
  const generatedAt = new Date().toISOString();
  const shards = new Map();
  const sourceRejectedReasons = [];
  const sourceRejectedDetails = [];
  const resultListResolutionCounts = new Map();
  const resultListResolutionDetails = [];
  const dayReports = [];

  for (const date of options.dates) {
    const candidates = await listKeirinJpHistoricalVenueCandidates(date);
    const venueCodes = options.allVenues
      ? [...new Set(candidates.map((candidate) => candidate.venueCode))]
      : [options.venueCode];
    const races = [];
    let sourceRejectedCount = 0;

    for (const venueCode of venueCodes) {
      try {
        const report = await discoverKeirinJpHistoricalResults({
          date,
          venueCode,
          includeInternal: true,
          delayMs: 75,
        });
        resultListResolutionCounts.set(
          report.resultListResolution,
          (resultListResolutionCounts.get(report.resultListResolution) ?? 0) + 1,
        );
        resultListResolutionDetails.push({
          date,
          venue: report.venue,
          venueCode: report.venueCode,
          resolution: report.resultListResolution,
          raceCount: report._internal.probes.length,
          endpoint: report.resultListSource.endpoint,
          eventToken: report.resultListSource.eventToken,
          targetDayToken: report.resultListSource.targetDayToken,
        });
        for (const probe of report._internal.probes) {
          if (probe.accepted) races.push(normalizeProbe(report, probe));
          else if (probe.classification === "confirmed-dead-heat") {
            races.push(normalizeDeadHeatProbe(report, probe));
          }
          else if (
            ["cancelled", "unavailable", "not-finalized", "parser-gap"].includes(
              probe.classification,
            )
          ) {
            races.push(normalizeNonTrendProbe(report, probe));
          }
          else {
            sourceRejectedCount += 1;
            sourceRejectedReasons.push(probe.rejectionReason ?? "source probe rejected");
            sourceRejectedDetails.push({
              date,
              venue: report.venue,
              venueCode: report.venueCode,
              raceNumber: probe.raceNumber,
              token: probe.token,
              endpoint: probe.endpoint,
              sourceUrl: probe.sourceUrl,
              classification: probe.classification,
              reason: probe.rejectionReason,
              rawStatusHint: probe.rawStatusHint,
              nextAction: probe.nextAction,
            });
          }
        }
      } catch (error) {
        sourceRejectedCount += 1;
        sourceRejectedReasons.push(
          error instanceof Error ? error.message : String(error),
        );
        sourceRejectedDetails.push({
          date,
          venue: candidates.find((candidate) => candidate.venueCode === venueCode)?.venue ?? null,
          venueCode,
          raceNumber: null,
          token: error?.token ?? null,
          endpoint: error?.endpoint ?? null,
          sourceUrl: null,
          classification: error?.classification ?? "validation-failed",
          reason: error instanceof Error ? error.message : String(error),
          rawStatusHint: error?.rawStatusHint ?? null,
          nextAction: error?.nextAction ?? "inspect",
        });
      }
    }

    races.sort((left, right) =>
      left.venueCode.localeCompare(right.venueCode)
      || left.raceNumber - right.raceNumber
    );
    const shard = {
      version: VERSION,
      date,
      generatedAt,
      sourceStatus:
        sourceRejectedCount > 0
          || races.some((race) => race.status !== "confirmed" || !race.trendEligible)
          ? "partial"
          : "official",
      races,
    };
    shards.set(date, shard);
    dayReports.push({
      date,
      requestedVenueCount: venueCodes.length,
      raceCount: races.length,
      sourceRejectedCount,
      statusCount: Object.fromEntries(
        ["confirmed", "cancelled", "unavailable"].map((status) => [
          status,
          races.filter((race) => race.status === status).length,
        ]),
      ),
      trendEligibleRaceCount: races.filter((race) => race.trendEligible).length,
      nonTrendRaceCount: races.filter((race) => !race.trendEligible).length,
    });
  }

  const allRaces = [...shards.values()].flatMap((shard) => shard.races);
  const statusCount = Object.fromEntries(
    ["confirmed", "cancelled", "unavailable"].map((status) => [
      status,
      allRaces.filter((race) => race.status === status).length,
    ]),
  );
  const classificationCount = Object.fromEntries(
    [...new Set(allRaces.map((race) => race.sourceClassification))]
      .sort()
      .map((classification) => [
        classification,
        allRaces.filter((race) => race.sourceClassification === classification).length,
      ]),
  );
  const trendEligibleRaceCount = allRaces.filter((race) => race.trendEligible).length;
  const nonTrendRaceCount = allRaces.length - trendEligibleRaceCount;
  const deadHeatRaceCount = allRaces.filter(
    (race) => race.deadHeat?.detected === true,
  ).length;
  const deadHeatTrendExcludedCount = allRaces.filter(
    (race) => race.deadHeat?.detected === true && race.trendEligible === false,
  ).length;
  const storageEligibleRaceCount = allRaces.filter(
    (race) => race.storageEligible === true,
  ).length;
  const index = {
    version: VERSION,
    generatedAt,
    sourceStatus:
      sourceRejectedReasons.length > 0 || nonTrendRaceCount > 0
        ? "partial"
        : "official",
    range: {
      from: options.dates[0],
      to: options.dates.at(-1),
    },
    shardCount: shards.size,
    raceCount: allRaces.length,
    shards: [...shards.values()].map((shard) => ({
      date: shard.date,
      path:
        `${PUBLIC_NAMESPACE}/daily/${shard.date.slice(0, 7)}/${shard.date}.generated.json`,
      raceCount: shard.races.length,
      status: shard.sourceStatus === "official" ? "ready" : "partial",
      sourceSummary: {
        providers: ["KEIRIN.JP"],
        fetchedAtFrom: shard.races[0]?.source.fetchedAt ?? null,
        fetchedAtTo: shard.races.at(-1)?.source.fetchedAt ?? null,
      },
    })),
    provenance: {
      provider: "KEIRIN.JP",
      generator: GENERATOR,
      parserVersion: PARSER_VERSION,
      generatedAt,
    },
    coverage: coverageFor(allRaces),
  };

  const validator = await loadActualValidator(REPO_ROOT);
  const indexValidation =
    validator.validateKurariExHistoricalResultTrendLabIndex(index);
  const validationIssues = [...indexValidation.issues];
  for (const shard of shards.values()) {
    validationIssues.push(
      ...validator.validateKurariExHistoricalResultTrendLabDailyShard(
        shard,
        shard.date,
      ).issues,
    );
    shard.races.forEach((race, raceIndex) => {
      validationIssues.push(
        ...validator.validateKurariExHistoricalResultRace(
          race,
          `${shard.date}.races[${raceIndex}]`,
        ).issues,
      );
    });
  }

  const negativeControls = await runNegativeControls(validator, index, shards);
  const productionBackfillBlockedReasons = [];
  if (sourceRejectedDetails.length > 0) {
    productionBackfillBlockedReasons.push(
      `unresolved source rejects: ${sourceRejectedDetails.length}`,
    );
  }
  for (const classification of [
    "validation-failed",
    "parser-gap",
    "network-or-rate-limit",
    "source-conflict",
  ]) {
    const count = Number(classificationCount[classification] ?? 0)
      + sourceRejectedDetails.filter(
        (detail) => detail.classification === classification,
      ).length;
    if (count > 0) {
      productionBackfillBlockedReasons.push(`${classification}: ${count}`);
    }
  }
  if (validationIssues.length > 0) {
    productionBackfillBlockedReasons.push(
      `schema/validator issues: ${validationIssues.length}`,
    );
  }
  const failedNegativeControls = Object.entries(negativeControls)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  if (failedNegativeControls.length > 0) {
    productionBackfillBlockedReasons.push(
      `validator negative controls failed: ${failedNegativeControls.join(", ")}`,
    );
  }
  const productionBackfillReady =
    allRaces.length > 0 && productionBackfillBlockedReasons.length === 0;
  index.summary = {
    sourceRejectedCount: sourceRejectedDetails.length,
    sourceRejectByReason: countReasons(sourceRejectedReasons),
    statusCount,
    classificationCount,
    deadHeatRaceCount,
    deadHeatTrendExcludedCount,
    storageEligibleRaceCount,
    trendEligibleRaceCount,
    nonTrendRaceCount,
    partialReason:
      index.sourceStatus === "partial"
        ? deadHeatTrendExcludedCount > 0
          ? `dead heat excluded from trend: ${deadHeatTrendExcludedCount}`
          : "one or more days contain source-backed non-confirmed records or unresolved source rejects"
        : null,
    blockedReason: productionBackfillBlockedReasons,
    productionBackfillReady,
    productionBackfillReadyReason: productionBackfillReady
      ? "all production gates passed"
      : productionBackfillBlockedReasons.join("; "),
  };

  await rm(options.output, { recursive: true, force: true });
  for (const shard of shards.values()) {
    await writeJson(
      path.join(
        options.output,
        "daily",
        shard.date.slice(0, 7),
        `${shard.date}.generated.json`,
      ),
      shard,
    );
  }
  await writeJson(path.join(options.output, "index.generated.json"), index);

  const writtenFiles = [
    path.join(options.output, "index.generated.json"),
    ...[...shards.values()].map((shard) =>
      path.join(
        options.output,
        "daily",
        shard.date.slice(0, 7),
        `${shard.date}.generated.json`,
      )
    ),
  ];
  const writtenIndex = JSON.parse(await readFile(writtenFiles[0], "utf8"));
  const writtenShards = new Map();
  for (let index = 1; index < writtenFiles.length; index += 1) {
    const shard = JSON.parse(await readFile(writtenFiles[index], "utf8"));
    writtenShards.set(shard.date, shard);
  }
  const history = await loadThroughActualLoader(
    validator,
    writtenIndex,
    writtenShards,
  );

  const report = {
    mode: options.write
      ? "public-fourteen-day-write"
      : options.outputMode === "public"
        ? "public-target-preflight-dry-run"
      : "temp-only-dry-run",
    output: options.output,
    publicTarget: options.publicTarget,
    publicDataWritePerformed: false,
    localStorageUsed: false,
    files: writtenFiles,
    days: dayReports,
    sourceRejectedCount: sourceRejectedDetails.length,
    sourceRejectByReason: countReasons(sourceRejectedReasons),
    sourceRejectedDetails,
    resultListResolutionCount: Object.fromEntries(resultListResolutionCounts),
    resultListResolutionDetails,
    statusCount,
    classificationCount,
    deadHeatRaceCount,
    deadHeatTrendExcludedCount,
    storageEligibleRaceCount,
    trendEligibleRaceCount,
    nonTrendRaceCount,
    productionBackfillReady,
    productionBackfillBlockedReasons,
    indexSummary: writtenIndex.summary,
    validator: {
      implementation:
        "src/lib/kurariExHistoricalResultLab.ts bundled and executed in memory",
      issueCount: validationIssues.length,
      issues: validationIssues,
      negativeControls,
    },
    availability: history.availability,
    schemaUnavailableFields: [
      "odds.firstFavoriteCombination",
      "odds.closingOddsAvailable",
      "odds.oddsMovementAvailable",
      "weather.windDirection",
      "weather.windDirectionBackstretchVector",
      "category.timeBand",
      "lineup.raw",
      "lineup.structured",
      "lineup.lineCount",
      "bSb.sbAvailable",
    ],
  };
  const outputGuardControls = runPublicOutputGuardControls(report);
  const publicOutputGuard = options.outputMode === "public"
    ? evaluatePublicOutputGuard(report, {
        target: options.publicTarget,
        write: options.write,
        allowPublicOutput: options.allowPublicOutput,
        confirmNamespace: options.confirmNamespace,
      })
    : null;
  let publicWrittenFiles = [];
  let publicFinalFiles = [];
  let existingShardsPreserved = [];
  let publicPostWriteAvailability = null;
  if (options.write) {
    if (!publicOutputGuard?.passed) {
      throw new Error(
        `public output guard rejected write: ${publicOutputGuard?.reasons.join("; ")}`,
      );
    }
    if (
      writtenShards.size !== C8_WRITE_DATES.length
      || C8_WRITE_DATES.some((date) => !writtenShards.has(date))
      || writtenIndex.shardCount !== C8_WRITE_DATES.length
      || writtenIndex.range.from !== C8_WRITE_FROM
      || writtenIndex.range.to !== C8_WRITE_TO
    ) {
      throw new Error(
        `C8 write candidate must contain only ${C8_WRITE_FROM} through ${C8_WRITE_TO}`,
      );
    }
    const publicIndexPath = path.join(options.publicTarget, "index.generated.json");
    const publicShardPaths = new Map(C8_WRITE_DATES.map((date) => [
      date,
      path.join(
        options.publicTarget,
        "daily",
        date.slice(0, 7),
        `${date}.generated.json`,
      ),
    ]));
    publicFinalFiles = [
      publicIndexPath,
      ...C8_WRITE_DATES.map((date) => publicShardPaths.get(date)),
    ];
    if (
      publicFinalFiles.some(
        (filePath) => !isChildPath(options.publicTarget, filePath),
      )
    ) {
      throw new Error("C8 planned write escaped the allowed public namespace");
    }

    const finalPublicShards = new Map(writtenShards);
    for (const date of C7_EXISTING_DATES) {
      const existingShardPath = publicShardPaths.get(date);
      let existingShard;
      try {
        existingShard = JSON.parse(await readFile(existingShardPath, "utf8"));
      } catch (error) {
        throw new Error(
          `C8 requires the existing C7 shard at ${existingShardPath}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      const existingValidation =
        validator.validateKurariExHistoricalResultTrendLabDailyShard(
          existingShard,
          date,
        );
      if (
        existingValidation.issues.length > 0
        || existingShard.races?.length !== writtenShards.get(date)?.races?.length
      ) {
        throw new Error(`C8 existing shard must remain valid: ${date}`);
      }
      if (date === C6_EXISTING_DATE && existingShard.races.length !== 59) {
        throw new Error(
          "C8 existing 2026-06-28 shard must remain valid with raceCount 59",
        );
      }
      finalPublicShards.set(date, existingShard);
      existingShardsPreserved.push(date);
    }

    const finalAllRaces = [...finalPublicShards.values()]
      .flatMap((shard) => shard.races);
    const finalTrendEligibleRaceCount = finalAllRaces.filter(
      (race) => race.trendEligible,
    ).length;
    const finalDeadHeatRaceCount = finalAllRaces.filter(
      (race) => race.deadHeat?.detected === true,
    ).length;
    writtenIndex.sourceStatus =
      finalAllRaces.some((race) => !race.trendEligible) ? "partial" : "official";
    writtenIndex.raceCount = finalAllRaces.length;
    writtenIndex.coverage = coverageFor(finalAllRaces);
    writtenIndex.shards = writtenIndex.shards.map((entry) => {
      const shard = finalPublicShards.get(entry.date);
      return {
        ...entry,
        raceCount: shard.races.length,
        status: shard.sourceStatus === "official" ? "ready" : "partial",
        sourceSummary: {
          providers: ["KEIRIN.JP"],
          fetchedAtFrom: shard.races[0]?.source.fetchedAt ?? null,
          fetchedAtTo: shard.races.at(-1)?.source.fetchedAt ?? null,
        },
      };
    });
    writtenIndex.summary = {
      ...writtenIndex.summary,
      statusCount: Object.fromEntries(
        ["confirmed", "cancelled", "unavailable"].map((status) => [
          status,
          finalAllRaces.filter((race) => race.status === status).length,
        ]),
      ),
      classificationCount: Object.fromEntries(
        [...new Set(finalAllRaces.map((race) => race.sourceClassification))]
          .sort()
          .map((classification) => [
            classification,
            finalAllRaces.filter(
              (race) => race.sourceClassification === classification,
            ).length,
          ]),
      ),
      deadHeatRaceCount: finalDeadHeatRaceCount,
      deadHeatTrendExcludedCount: finalAllRaces.filter(
        (race) => race.deadHeat?.detected === true && !race.trendEligible,
      ).length,
      storageEligibleRaceCount: finalAllRaces.filter(
        (race) => race.storageEligible,
      ).length,
      trendEligibleRaceCount: finalTrendEligibleRaceCount,
      nonTrendRaceCount: finalAllRaces.length - finalTrendEligibleRaceCount,
      partialReason:
        finalDeadHeatRaceCount > 0
          ? `dead heat excluded from trend: ${finalDeadHeatRaceCount}`
          : finalAllRaces.some((race) => !race.trendEligible)
            ? "one or more days contain source-backed non-confirmed records"
            : null,
    };
    report.statusCount = writtenIndex.summary.statusCount;
    report.classificationCount = writtenIndex.summary.classificationCount;
    report.deadHeatRaceCount = writtenIndex.summary.deadHeatRaceCount;
    report.deadHeatTrendExcludedCount =
      writtenIndex.summary.deadHeatTrendExcludedCount;
    report.storageEligibleRaceCount =
      writtenIndex.summary.storageEligibleRaceCount;
    report.trendEligibleRaceCount =
      writtenIndex.summary.trendEligibleRaceCount;
    report.nonTrendRaceCount = writtenIndex.summary.nonTrendRaceCount;
    report.indexSummary = writtenIndex.summary;
    const preWriteHistory = await loadThroughActualLoader(
      validator,
      writtenIndex,
      finalPublicShards,
    );
    const expectedAcceptedRaceCount = [...finalPublicShards.values()]
      .reduce((count, shard) => count + shard.races.length, 0);
    if (
      !preWriteHistory.availability.productionBackfillReady
      || preWriteHistory.availability.rejectedRaceCount !== 0
      || preWriteHistory.availability.acceptedRaceCount !== expectedAcceptedRaceCount
    ) {
      throw new Error("C7 merged public candidate failed pre-write loader validation");
    }

    publicWrittenFiles = [publicIndexPath];
    for (const date of C8_WRITE_DATES) {
      if (C7_EXISTING_DATES.includes(date)) continue;
      const publicShardPath = publicShardPaths.get(date);
      await writeJson(publicShardPath, writtenShards.get(date));
      publicWrittenFiles.push(publicShardPath);
    }
    await writeJson(publicIndexPath, writtenIndex);

    const publicIndex = JSON.parse(await readFile(publicIndexPath, "utf8"));
    const publicShards = new Map();
    for (const date of C8_WRITE_DATES) {
      const publicShard = JSON.parse(
        await readFile(publicShardPaths.get(date), "utf8"),
      );
      publicShards.set(date, publicShard);
    }
    const publicHistory = await loadThroughActualLoader(
      validator,
      publicIndex,
      publicShards,
    );
    publicPostWriteAvailability = publicHistory.availability;
    if (
      !publicPostWriteAvailability.productionBackfillReady
      || publicPostWriteAvailability.rejectedRaceCount !== 0
      || publicPostWriteAvailability.acceptedRaceCount !== expectedAcceptedRaceCount
      || publicIndex.range.from !== C8_WRITE_FROM
      || publicIndex.range.to !== C8_WRITE_TO
      || publicIndex.shardCount !== C8_WRITE_DATES.length
      || publicShards.get(C6_EXISTING_DATE)?.races?.length !== 59
    ) {
      throw new Error("C8 public post-write loader validation failed");
    }
  }
  return {
    ...report,
    publicDataWritePerformed: options.write,
    publicWrittenFiles,
    publicFinalFiles,
    existingShardsPreserved,
    publicPostWriteAvailability,
    publicOutputGuard,
    outputGuardControls,
  };
}

async function main() {
  let options;
  try {
    options = validateOptions(parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
    return;
  }

  try {
    const report = await buildDryRun(options);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode =
      report.productionBackfillReady
        && (report.publicOutputGuard?.passed ?? true)
        && Object.values(report.outputGuardControls.positive).every(Boolean)
        && Object.values(report.outputGuardControls.negative).every(Boolean)
        ? 0
        : 1;
  } catch (error) {
      console.error(JSON.stringify({
      mode: options.outputMode === "public"
        ? options.write
          ? "public-fourteen-day-write"
          : "public-target-preflight-dry-run"
        : "temp-only-dry-run",
      output: options.output,
      publicDataWritePerformed: false,
      localStorageUsed: false,
      result: "failed",
      reason: error instanceof Error ? error.stack : String(error),
    }, null, 2));
    process.exitCode = 1;
  }
}

const executedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === executedPath) {
  await main();
}
