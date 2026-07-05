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

function parseArgs(argv) {
  const options = {
    dates: [],
    venueCode: "",
    allVenues: false,
    dryRun: false,
    output: DEFAULT_OUTPUT,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--date") {
      options.dates.push(argv[index + 1] ?? "");
      index += 1;
    } else if (arg === "--venue-code") {
      options.venueCode = argv[index + 1] ?? "";
      index += 1;
    } else if (arg === "--all-venues") {
      options.allVenues = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
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

function validateOptions(options) {
  const uniqueDates = [...new Set(options.dates)];
  if (!options.dryRun) throw new Error("--dry-run is required");
  if (uniqueDates.length === 0 || uniqueDates.length > 3 || !uniqueDates.every(isValidDate)) {
    throw new Error("one to three valid --date YYYY-MM-DD values are required");
  }
  if (options.venueCode && !/^\d{2}$/u.test(options.venueCode)) {
    throw new Error("--venue-code must be a two-digit KEIRIN.JP venue code");
  }
  if (options.venueCode && options.allVenues) {
    throw new Error("--venue-code and --all-venues are mutually exclusive");
  }
  if (!options.venueCode && !options.allVenues) {
    throw new Error("--venue-code or --all-venues is required");
  }

  const output = path.resolve(options.output);
  const tempRoot = path.resolve(tmpdir());
  const relative = path.relative(tempRoot, output);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`output must be a child of the OS temp directory: ${tempRoot}`);
  }
  return {
    ...options,
    dates: uniqueDates.sort(),
    output,
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
  };
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function buildDryRun(options) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
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
        sourceRejectedCount > 0 || races.some((race) => race.status !== "confirmed")
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

  const validator = await loadActualValidator(repoRoot);
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
    trendEligibleRaceCount,
    nonTrendRaceCount,
    partialReason:
      index.sourceStatus === "partial"
        ? "one or more days contain source-backed non-confirmed records or unresolved source rejects"
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

  return {
    mode: "temp-only-dry-run",
    output: options.output,
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
    trendEligibleRaceCount,
    nonTrendRaceCount,
    productionBackfillReady,
    productionBackfillBlockedReasons,
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
    process.exitCode = report.productionBackfillReady ? 0 : 1;
  } catch (error) {
    console.error(JSON.stringify({
      mode: "temp-only-dry-run",
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
