import { build as buildModule } from "esbuild";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import process from "node:process";

const VERSION = "kurari-ex-result-trend-lab-history/v1";
const WINDOW_DAYS = 60;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "../..");
const BUILDER_PATH = path.join(
  REPO_ROOT,
  "scripts",
  "kurari-ex",
  "build-keirin-jp-historical-result-shard.mjs",
);
const PUBLIC_NAMESPACE = "/data/analytics/kurari-ex-result-trend-lab-history";
const CONFIRMED_NAMESPACE = "kurari-ex-result-trend-lab-history";
const PUBLIC_ROOT = path.join(
  REPO_ROOT,
  "public",
  "data",
  "analytics",
  "kurari-ex-result-trend-lab-history",
);
const INDEX_PATH = path.join(PUBLIC_ROOT, "index.generated.json");
const DRY_RUN_PROTECTED_PATHS = [
  "public/data",
  "src/data",
];
const FORBIDDEN_PATHS = [
  "public/data/reviews",
  "public/data/races",
  "public/data/venues",
  "src/data",
];
const ALLOWED_HISTORY_PATH =
  "public/data/analytics/kurari-ex-result-trend-lab-history";
const COVERAGE_FIELDS = [
  "result",
  "payout",
  "kimarite",
  "weather",
  "odds",
  "entries",
  "lineup",
  "bSb",
];

function parseArgs(argv) {
  const options = {
    targetDate: "",
    write: false,
    confirmNamespace: "",
    confirmRollingWindow: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--target-date") {
      options.targetDate = argv[index + 1] ?? "";
      index += 1;
    } else if (arg === "--write") {
      options.write = true;
    } else if (arg === "--confirm-namespace") {
      options.confirmNamespace = argv[index + 1] ?? "";
      index += 1;
    } else if (arg === "--confirm-rolling-window") {
      options.confirmRollingWindow = argv[index + 1] ?? "";
      index += 1;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!isValidDate(options.targetDate)) {
    throw new Error("--target-date YYYY-MM-DD is required");
  }
  return options;
}

function isValidDate(value) {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime())
    && parsed.toISOString().slice(0, 10) === value;
}

function addDays(date, days) {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function expandDateRange(from, to) {
  if (!isValidDate(from) || !isValidDate(to) || from > to) return [];
  const dates = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    dates.push(date);
  }
  return dates;
}

function isChildPath(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return Boolean(relative)
    && !relative.startsWith("..")
    && !path.isAbsolute(relative);
}

function canonicalShardPath(date) {
  return `${PUBLIC_NAMESPACE}/daily/${date.slice(0, 7)}/${date}.generated.json`;
}

function publicShardFile(date) {
  return path.join(
    PUBLIC_ROOT,
    "daily",
    date.slice(0, 7),
    `${date}.generated.json`,
  );
}

function tempShardFile(tempRoot, date) {
  return path.join(
    tempRoot,
    "daily",
    date.slice(0, 7),
    `${date}.generated.json`,
  );
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: REPO_ROOT,
      windowsHide: true,
      ...options,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({ exitCode: exitCode ?? 1, stdout, stderr });
    });
  });
}

async function gitStatus(paths) {
  const result = await run("git", [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
    "--",
    ...paths,
  ]);
  if (result.exitCode !== 0) {
    throw new Error(`git status failed: ${result.stderr.trim()}`);
  }
  return result.stdout
    .split(/\r?\n/u)
    .map((line) => line.trimEnd())
    .filter(Boolean);
}

function gitStatusPaths(lines) {
  return lines.flatMap((line) => {
    const value = line.slice(3).trim().replaceAll("\\", "/");
    if (!value) return [];
    if (value.includes(" -> ")) {
      return value.split(" -> ").map((item) => item.replace(/^"|"$/gu, ""));
    }
    return [value.replace(/^"|"$/gu, "")];
  });
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function parseBuilderReport(result) {
  const text = result.stdout.trim();
  if (!text) {
    throw new Error(
      `single-day builder returned no report: ${result.stderr.trim() || `exit ${result.exitCode}`}`,
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `single-day builder returned invalid JSON: ${result.stderr.trim() || text.slice(0, 500)}`,
    );
  }
}

async function loadActualValidator() {
  const validatorPath = path.join(
    REPO_ROOT,
    "src",
    "lib",
    "kurariExHistoricalResultLab.ts",
  );
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
    const value = documents.get(String(input));
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

function countBy(values) {
  const counts = new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Object.fromEntries(
    [...counts.entries()]
      .sort(([left], [right]) => String(left).localeCompare(String(right))),
  );
}

function summarizeCoverage(races) {
  return Object.fromEntries(COVERAGE_FIELDS.map((field) => {
    const availableRaceCount = races.filter(
      (race) => race.provenance?.[field]?.status === "present",
    ).length;
    const status = availableRaceCount === 0
      ? "unavailable"
      : availableRaceCount === races.length
        ? "implemented"
        : "partial";
    return [field, {
      status,
      availableRaceCount,
      totalRaceCount: races.length,
    }];
  }));
}

function buildCandidateIndex({
  currentIndex,
  entries,
  shards,
  generatedAt,
  sourceRejectedCount,
  sourceRejectByReason,
  preflightBlockedReasons,
}) {
  const races = [...shards.values()].flatMap((shard) => shard.races);
  const trendEligibleRaceCount = races.filter(
    (race) => race.trendEligible === true,
  ).length;
  const deadHeatRaceCount = races.filter(
    (race) => race.deadHeat?.detected === true,
  ).length;
  const deadHeatTrendExcludedCount = races.filter(
    (race) => race.deadHeat?.detected === true
      && race.trendEligible === false,
  ).length;
  const nonTrendRaceCount = races.length - trendEligibleRaceCount;
  const productionBackfillReady =
    sourceRejectedCount === 0 && preflightBlockedReasons.length === 0;

  return {
    version: VERSION,
    generatedAt,
    sourceStatus: nonTrendRaceCount > 0 ? "partial" : "official",
    range: {
      from: entries[0].date,
      to: entries.at(-1).date,
    },
    shardCount: entries.length,
    raceCount: races.length,
    shards: entries,
    provenance: {
      provider: "KEIRIN.JP",
      generator:
        "scripts/kurari-ex/update-keirin-jp-historical-result-window.mjs",
      parserVersion:
        currentIndex.provenance?.parserVersion
        ?? "kurari-ex-keirin-jp-historical-shard/v1",
      generatedAt,
    },
    coverage: summarizeCoverage(races),
    summary: {
      sourceRejectedCount,
      sourceRejectByReason,
      statusCount: countBy(races.map((race) => race.status)),
      classificationCount: countBy(
        races.map((race) => race.sourceClassification ?? "unclassified"),
      ),
      deadHeatRaceCount,
      deadHeatTrendExcludedCount,
      storageEligibleRaceCount: races.filter(
        (race) => race.storageEligible === true,
      ).length,
      trendEligibleRaceCount,
      nonTrendRaceCount,
      partialReason: nonTrendRaceCount > 0
        ? deadHeatTrendExcludedCount > 0
          ? `dead heat excluded from trend: ${deadHeatTrendExcludedCount}`
          : "one or more days contain source-backed non-trend records"
        : null,
      blockedReason: preflightBlockedReasons,
      productionBackfillReady,
      productionBackfillReadyReason: productionBackfillReady
        ? "all production gates passed"
        : preflightBlockedReasons.join("; "),
    },
  };
}

async function validatePublicState(validator, expectedIndex) {
  const publicIndex = JSON.parse(await readFile(INDEX_PATH, "utf8"));
  const publicShards = new Map();
  for (const entry of publicIndex.shards) {
    publicShards.set(
      entry.date,
      JSON.parse(await readFile(publicShardFile(entry.date), "utf8")),
    );
  }
  const validatorIssues = [
    ...validator.validateKurariExHistoricalResultTrendLabIndex(publicIndex).issues,
  ];
  for (const [date, shard] of publicShards) {
    validatorIssues.push(
      ...validator.validateKurariExHistoricalResultTrendLabDailyShard(
        shard,
        date,
      ).issues,
    );
    shard.races.forEach((race, raceIndex) => {
      validatorIssues.push(
        ...validator.validateKurariExHistoricalResultRace(
          race,
          `${date}.races[${raceIndex}]`,
        ).issues,
      );
    });
  }
  const history = await loadThroughActualLoader(
    validator,
    publicIndex,
    publicShards,
  );
  const reasons = [];
  if (
    publicIndex.range.from !== expectedIndex.range.from
    || publicIndex.range.to !== expectedIndex.range.to
    || publicIndex.shardCount !== WINDOW_DAYS
  ) {
    reasons.push("post-write index range or shard count mismatch");
  }
  if (publicIndex.raceCount !== expectedIndex.raceCount) {
    reasons.push("post-write raceCount mismatch");
  }
  if (Number(publicIndex.summary?.sourceRejectedCount ?? 0) > 0) {
    reasons.push("post-write sourceRejectedCount is not zero");
  }
  if (validatorIssues.length > 0) {
    reasons.push(`post-write validator issue count is ${validatorIssues.length}`);
  }
  if (history.availability.rejectedRaceCount > 0) {
    reasons.push(
      `post-write loader rejected count is ${history.availability.rejectedRaceCount}`,
    );
  }
  if (!history.availability.productionBackfillReady) {
    reasons.push(
      `post-write production gate failed: ${history.availability.productionBackfillReadyReason}`,
    );
  }
  return {
    passed: reasons.length === 0,
    reasons,
    validatorIssueCount: validatorIssues.length,
    availability: history.availability,
  };
}

async function promoteCandidate({
  options,
  rollingIndex,
  targetShard,
  removalDate,
  validator,
}) {
  const targetPath = publicShardFile(options.targetDate);
  const removalPath = publicShardFile(removalDate);
  const targetTempPath = `${targetPath}.rolling-${process.pid}.tmp`;
  const indexTempPath = `${INDEX_PATH}.rolling-${process.pid}.tmp`;
  const plannedPaths = [
    targetPath,
    targetTempPath,
    INDEX_PATH,
    indexTempPath,
    removalPath,
  ];
  const namespaceEscape = plannedPaths.some(
    (filePath) => !isChildPath(PUBLIC_ROOT, filePath),
  );
  if (namespaceEscape) {
    return {
      completed: false,
      phase: "pre-write",
      reasons: ["planned write escaped the allowed historical namespace"],
      indexCommitted: false,
      newShardCreated: false,
      oldShardDeleted: false,
      rollback: {
        attempted: false,
        newShardRemoved: false,
        manualRecoveryRequired: false,
      },
    };
  }
  if (await pathExists(targetPath)) {
    return {
      completed: false,
      phase: "pre-write",
      reasons: [`target shard already exists: ${options.targetDate}`],
      indexCommitted: false,
      newShardCreated: false,
      oldShardDeleted: false,
      rollback: {
        attempted: false,
        newShardRemoved: false,
        manualRecoveryRequired: false,
      },
    };
  }
  if (!await pathExists(removalPath)) {
    return {
      completed: false,
      phase: "pre-write",
      reasons: [`oldest shard does not exist: ${removalDate}`],
      indexCommitted: false,
      newShardCreated: false,
      oldShardDeleted: false,
      rollback: {
        attempted: false,
        newShardRemoved: false,
        manualRecoveryRequired: false,
      },
    };
  }

  let phase = "create-new-shard";
  let newShardCreated = false;
  let indexCommitted = false;
  let oldShardDeleted = false;
  try {
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(
      targetTempPath,
      `${JSON.stringify(targetShard, null, 2)}\n`,
      { encoding: "utf8", flag: "wx" },
    );
    await rename(targetTempPath, targetPath);
    newShardCreated = true;

    phase = "create-index-temp";
    await writeFile(
      indexTempPath,
      `${JSON.stringify(rollingIndex, null, 2)}\n`,
      { encoding: "utf8", flag: "wx" },
    );

    phase = "commit-index";
    await rename(indexTempPath, INDEX_PATH);
    indexCommitted = true;

    phase = "delete-old-shard";
    await rm(removalPath, { force: false });
    oldShardDeleted = true;

    phase = "post-write-loader-validation";
    const postWrite = await validatePublicState(validator, rollingIndex);
    if (!postWrite.passed) {
      throw new Error(postWrite.reasons.join("; "));
    }

    const forbiddenAfter = await gitStatus(FORBIDDEN_PATHS);
    if (forbiddenAfter.length > 0) {
      throw new Error("forbidden paths changed during promotion");
    }
    const allowedAfter = await gitStatus([ALLOWED_HISTORY_PATH]);
    const allowedPaths = new Set([
      path.relative(REPO_ROOT, INDEX_PATH).replaceAll("\\", "/"),
      path.relative(REPO_ROOT, targetPath).replaceAll("\\", "/"),
      path.relative(REPO_ROOT, removalPath).replaceAll("\\", "/"),
    ]);
    const unexpectedPaths = gitStatusPaths(allowedAfter)
      .filter((filePath) => !allowedPaths.has(filePath));
    if (unexpectedPaths.length > 0) {
      throw new Error(
        `unexpected historical paths changed: ${unexpectedPaths.join(", ")}`,
      );
    }

    return {
      completed: true,
      phase: "complete",
      reasons: [],
      indexCommitted,
      newShardCreated,
      oldShardDeleted,
      postWrite: {
        acceptedRaceCount: postWrite.availability.acceptedRaceCount,
        rejectedRaceCount: postWrite.availability.rejectedRaceCount,
        trendEligibleRaceCount:
          postWrite.availability.trendEligibleRaceCount,
        loadedShardCount: postWrite.availability.loadedShardCount,
        productionBackfillReady:
          postWrite.availability.productionBackfillReady,
      },
      rollback: {
        attempted: false,
        newShardRemoved: false,
        manualRecoveryRequired: false,
      },
    };
  } catch (error) {
    await rm(targetTempPath, { force: true }).catch(() => {});
    await rm(indexTempPath, { force: true }).catch(() => {});
    let rollbackAttempted = false;
    let newShardRemoved = false;
    let rollbackError = null;
    // Before the index commit, removing the new shard restores the old window.
    // After the index commit, never guess a rollback: stop and require inspection.
    if (!indexCommitted && newShardCreated) {
      rollbackAttempted = true;
      try {
        await rm(targetPath, { force: true });
        newShardRemoved = !await pathExists(targetPath);
      } catch (rollbackFailure) {
        rollbackError = rollbackFailure instanceof Error
          ? rollbackFailure.message
          : String(rollbackFailure);
      }
    }
    return {
      completed: false,
      phase,
      reasons: [
        error instanceof Error ? error.message : String(error),
        ...(rollbackError ? [`rollback failed: ${rollbackError}`] : []),
      ],
      indexCommitted,
      newShardCreated,
      oldShardDeleted,
      rollback: {
        attempted: rollbackAttempted,
        newShardRemoved,
        manualRecoveryRequired: indexCommitted || rollbackError !== null,
        policy: indexCommitted
          ? "STOP: index was committed; inspect index, new shard, and old shard before any retry"
          : "new shard is removed when failure occurs before index commit",
      },
    };
  }
}

async function inspectCandidate(options, tempRoot, protectedBefore) {
  const currentIndex = JSON.parse(await readFile(INDEX_PATH, "utf8"));
  const expectedTargetDate = addDays(currentIndex.range.to, 1);
  const targetDateNotNext = options.targetDate !== expectedTargetDate;
  const removalDate = currentIndex.range.from;
  const newRange = {
    from: addDays(removalDate, 1),
    to: options.targetDate,
  };
  const expectedDates = expandDateRange(newRange.from, newRange.to);
  const currentDates = currentIndex.shards.map((entry) => entry.date);
  const currentExpectedDates = expandDateRange(
    currentIndex.range.from,
    currentIndex.range.to,
  );
  const currentWindowInvalid =
    currentIndex.version !== VERSION
    || currentIndex.shardCount !== WINDOW_DAYS
    || currentDates.length !== WINDOW_DAYS
    || currentExpectedDates.length !== WINDOW_DAYS
    || currentDates.some((date, index) => date !== currentExpectedDates[index]);

  const namespaceEscape =
    path.resolve(PUBLIC_ROOT) !== path.resolve(
      REPO_ROOT,
      "public",
      "data",
      "analytics",
      "kurari-ex-result-trend-lab-history",
    )
    || !isChildPath(tmpdir(), tempRoot);
  const writeConfirmationMissing =
    options.write
    && (
      options.confirmNamespace !== CONFIRMED_NAMESPACE
      || options.confirmRollingWindow !== String(WINDOW_DAYS)
    );

  const initialStopReasons = [];
  if (writeConfirmationMissing) {
    initialStopReasons.push(
      `--write requires --confirm-namespace ${CONFIRMED_NAMESPACE} `
      + `and --confirm-rolling-window ${WINDOW_DAYS}`,
    );
  }
  if (targetDateNotNext) {
    initialStopReasons.push(
      `target-date must be current range.to + 1 day: expected ${expectedTargetDate}`,
    );
  }
  if (currentWindowInvalid) {
    initialStopReasons.push("current historical index is not a contiguous 60-day window");
  }
  if (namespaceEscape) {
    initialStopReasons.push("candidate or planned public path escaped the allowed namespace");
  }
  if (options.write && protectedBefore.length > 0) {
    initialStopReasons.push("protected paths are not clean before execution");
  }
  if (initialStopReasons.length > 0) {
    return {
      mode: options.write
        ? "historical-rolling-window-write"
        : "historical-rolling-window-dry-run",
      targetDate: options.targetDate,
      currentRange: currentIndex.range,
      candidateRange: newRange,
      additionCandidate: options.targetDate,
      removalCandidate: removalDate,
      promotion: {
        possible: false,
        decision: "STOP",
        reasons: initialStopReasons,
      },
      stopConditions: {
        writeConfirmationMissing,
        targetDateNotNext,
        sourceRejected: false,
        loaderRejected: false,
        validatorIssues: false,
        duplicateRaceKey: false,
        dateSourceDateMismatch: false,
        windowDateMissing: currentWindowInvalid,
        targetNotFinalized: false,
        namespaceEscape,
        protectedPathDiff: protectedBefore.length > 0,
        protectedPathBaselineDirty: protectedBefore.length > 0,
        protectedPathChangedDuringExecution: false,
      },
      protectedPathDiff: protectedBefore,
      writeRequested: options.write,
      publicDataWritePerformed: false,
      oldShardDeleted: false,
      localStorageUsed: false,
    };
  }

  const builderResult = await run(process.execPath, [
    BUILDER_PATH,
    "--date",
    options.targetDate,
    "--dry-run",
    "--output-temp",
    "--output",
    tempRoot,
  ]);
  const builderReport = parseBuilderReport(builderResult);
  const candidateIndex = JSON.parse(
    await readFile(path.join(tempRoot, "index.generated.json"), "utf8"),
  );
  const targetShard = JSON.parse(
    await readFile(tempShardFile(tempRoot, options.targetDate), "utf8"),
  );

  const candidateFiles = [
    ...(builderReport.files ?? []),
    path.join(tempRoot, "index.generated.json"),
    tempShardFile(tempRoot, options.targetDate),
  ];
  const candidatePathEscape = candidateFiles.some(
    (file) => !isChildPath(tempRoot, file),
  );

  const retainedEntries = currentIndex.shards.filter(
    (entry) => entry.date !== removalDate,
  );
  const retainedShards = new Map();
  for (const entry of retainedEntries) {
    retainedShards.set(
      entry.date,
      JSON.parse(await readFile(publicShardFile(entry.date), "utf8")),
    );
  }
  const shards = new Map([
    ...retainedShards,
    [options.targetDate, targetShard],
  ]);
  const targetEntry = candidateIndex.shards.find(
    (entry) => entry.date === options.targetDate,
  ) ?? {
    date: options.targetDate,
    path: canonicalShardPath(options.targetDate),
    raceCount: targetShard.races.length,
    status: targetShard.sourceStatus === "official" ? "ready" : "partial",
    sourceSummary: {
      providers: ["KEIRIN.JP"],
      fetchedAtFrom: targetShard.races[0]?.source?.fetchedAt ?? null,
      fetchedAtTo: targetShard.races.at(-1)?.source?.fetchedAt ?? null,
    },
  };
  const entries = [
    ...retainedEntries,
    {
      ...targetEntry,
      path: canonicalShardPath(options.targetDate),
    },
  ].sort((left, right) => left.date.localeCompare(right.date));

  const allRaces = [...shards.values()].flatMap((shard) => shard.races);
  const raceKeyCounts = new Map();
  for (const race of allRaces) {
    raceKeyCounts.set(race.raceKey, (raceKeyCounts.get(race.raceKey) ?? 0) + 1);
  }
  const duplicateRaceKeys = [...raceKeyCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([raceKey, count]) => ({ raceKey, count }));
  const dateSourceDateMismatches = [...shards.entries()].flatMap(
    ([shardDate, shard]) => shard.races
      .filter(
        (race) => race.date !== shardDate
          || race.source?.sourceDate !== race.date,
      )
      .map((race) => ({
        raceKey: race.raceKey,
        shardDate,
        raceDate: race.date,
        sourceDate: race.source?.sourceDate ?? null,
      })),
  );
  const actualDates = [...shards.keys()].sort();
  const missingDates = expectedDates.filter((date) => !shards.has(date));
  const unexpectedDates = actualDates.filter(
    (date) => !expectedDates.includes(date),
  );
  const targetNotFinalizedCount = targetShard.races.filter(
    (race) => race.sourceClassification === "not-finalized",
  ).length;
  const sourceRejectedCount =
    Number(currentIndex.summary?.sourceRejectedCount ?? 0)
    + Number(builderReport.sourceRejectedCount ?? 0);
  const preflightBlockedReasons = [];
  if (sourceRejectedCount > 0) {
    preflightBlockedReasons.push(`sourceRejectedCount is ${sourceRejectedCount}`);
  }
  if (duplicateRaceKeys.length > 0) {
    preflightBlockedReasons.push(
      `duplicate raceKey count is ${duplicateRaceKeys.length}`,
    );
  }
  if (dateSourceDateMismatches.length > 0) {
    preflightBlockedReasons.push(
      `date/sourceDate mismatch count is ${dateSourceDateMismatches.length}`,
    );
  }
  if (
    expectedDates.length !== WINDOW_DAYS
    || actualDates.length !== WINDOW_DAYS
    || missingDates.length > 0
    || unexpectedDates.length > 0
  ) {
    preflightBlockedReasons.push("60-day candidate window has missing or unexpected dates");
  }
  if (targetNotFinalizedCount > 0) {
    preflightBlockedReasons.push(
      `target date contains not-finalized races: ${targetNotFinalizedCount}`,
    );
  }
  if (candidatePathEscape) {
    preflightBlockedReasons.push("temp candidate escaped the OS temp directory");
  }
  if (builderResult.exitCode !== 0 && sourceRejectedCount === 0) {
    preflightBlockedReasons.push(
      `single-day builder stopped with exit code ${builderResult.exitCode}`,
    );
  }

  const generatedAt =
    candidateIndex.generatedAt
    ?? builderReport.indexSummary?.generatedAt
    ?? new Date().toISOString();
  const sourceRejectByReason = [
    ...(currentIndex.summary?.sourceRejectByReason ?? []),
    ...(builderReport.sourceRejectByReason ?? []),
  ];
  const rollingIndex = buildCandidateIndex({
    currentIndex,
    entries,
    shards,
    generatedAt,
    sourceRejectedCount,
    sourceRejectByReason,
    preflightBlockedReasons,
  });

  const validator = await loadActualValidator();
  const validatorIssues = [
    ...validator.validateKurariExHistoricalResultTrendLabIndex(rollingIndex).issues,
  ];
  for (const [date, shard] of shards) {
    validatorIssues.push(
      ...validator.validateKurariExHistoricalResultTrendLabDailyShard(
        shard,
        date,
      ).issues,
    );
    shard.races.forEach((race, raceIndex) => {
      validatorIssues.push(
        ...validator.validateKurariExHistoricalResultRace(
          race,
          `${date}.races[${raceIndex}]`,
        ).issues,
      );
    });
  }
  const loaderResult = await loadThroughActualLoader(
    validator,
    rollingIndex,
    shards,
  );
  const loaderRejectedCount = loaderResult.availability.rejectedRaceCount;
  const protectedAfter = await gitStatus(DRY_RUN_PROTECTED_PATHS);
  const protectedDiff = [
    ...new Set([...protectedBefore, ...protectedAfter]),
  ];
  const protectedChangedDuringExecution =
    JSON.stringify([...protectedBefore].sort())
    !== JSON.stringify([...protectedAfter].sort());

  const stopReasons = [...preflightBlockedReasons];
  if (validatorIssues.length > 0) {
    stopReasons.push(`validator issue count is ${validatorIssues.length}`);
  }
  if (loaderRejectedCount > 0) {
    stopReasons.push(`loader rejected count is ${loaderRejectedCount}`);
  }
  if (!loaderResult.availability.productionBackfillReady) {
    stopReasons.push(
      `loader production gate failed: ${loaderResult.availability.productionBackfillReadyReason}`,
    );
  }
  if (protectedBefore.length > 0) {
    stopReasons.push("protected paths were not clean before dry-run");
  }
  if (protectedChangedDuringExecution) {
    stopReasons.push("protected paths changed during dry-run");
  }
  const preWritePromotionPossible = stopReasons.length === 0;
  const writeResult =
    options.write && preWritePromotionPossible
      ? await promoteCandidate({
          options,
          rollingIndex,
          targetShard,
          removalDate,
          validator,
        })
      : null;
  if (writeResult && !writeResult.completed) {
    stopReasons.push(
      `write promotion stopped at ${writeResult.phase}: ${writeResult.reasons.join("; ")}`,
    );
  }
  const promotionPossible = options.write
    ? preWritePromotionPossible && writeResult?.completed === true
    : preWritePromotionPossible;

  return {
    mode: options.write
      ? "historical-rolling-window-write"
      : "historical-rolling-window-dry-run",
    targetDate: options.targetDate,
    currentRange: currentIndex.range,
    candidateRange: rollingIndex.range,
    windowDays: WINDOW_DAYS,
    additionCandidate: options.targetDate,
    removalCandidate: removalDate,
    promotion: {
      possible: promotionPossible,
      decision: promotionPossible
        ? options.write
          ? "PROMOTED"
          : "PROMOTION_READY"
        : "STOP",
      reasons: stopReasons,
      writeResult,
    },
    stopConditions: {
      writeConfirmationMissing,
      targetDateNotNext,
      sourceRejected: sourceRejectedCount > 0,
      loaderRejected: loaderRejectedCount > 0,
      validatorIssues: validatorIssues.length > 0,
      duplicateRaceKey: duplicateRaceKeys.length > 0,
      dateSourceDateMismatch: dateSourceDateMismatches.length > 0,
      windowDateMissing:
        expectedDates.length !== WINDOW_DAYS
        || actualDates.length !== WINDOW_DAYS
        || missingDates.length > 0
        || unexpectedDates.length > 0,
      targetNotFinalized: targetNotFinalizedCount > 0,
      namespaceEscape: namespaceEscape || candidatePathEscape,
      protectedPathDiff: protectedDiff.length > 0,
      protectedPathBaselineDirty: protectedBefore.length > 0,
      protectedPathChangedDuringExecution: protectedChangedDuringExecution,
      partialStatusOnly:
        rollingIndex.sourceStatus === "partial"
        && stopReasons.length === 0,
    },
    targetSummary: {
      builderExitCode: builderResult.exitCode,
      raceCount: targetShard.races.length,
      sourceStatus: targetShard.sourceStatus,
      sourceRejectedCount: Number(builderReport.sourceRejectedCount ?? 0),
      trendEligibleRaceCount: targetShard.races.filter(
        (race) => race.trendEligible === true,
      ).length,
      nonTrendRaceCount: targetShard.races.filter(
        (race) => race.trendEligible !== true,
      ).length,
      deadHeatCount: targetShard.races.filter(
        (race) => race.sourceClassification === "confirmed-dead-heat",
      ).length,
      refundNoTrifectaCount: targetShard.races.filter(
        (race) => race.sourceClassification === "refund-no-trifecta",
      ).length,
      notFinalizedCount: targetNotFinalizedCount,
    },
    candidateSummary: {
      shardCount: rollingIndex.shardCount,
      raceCount: rollingIndex.raceCount,
      acceptedRaceCount: loaderResult.availability.acceptedRaceCount,
      rejectedRaceCount: loaderRejectedCount,
      trendEligibleRaceCount:
        loaderResult.availability.trendEligibleRaceCount,
      nonTrendRaceCount: loaderResult.availability.nonTrendRaceCount,
      sourceRejectedCount,
      duplicateRaceKeyCount: duplicateRaceKeys.length,
      dateSourceDateMismatchCount: dateSourceDateMismatches.length,
      validatorIssueCount: validatorIssues.length,
      loadedShardCount: loaderResult.availability.loadedShardCount,
      productionBackfillReady:
        loaderResult.availability.productionBackfillReady,
      status: loaderResult.availability.status,
    },
    windowAudit: {
      expectedDates: {
        from: expectedDates[0] ?? null,
        to: expectedDates.at(-1) ?? null,
        count: expectedDates.length,
      },
      actualDateCount: actualDates.length,
      missingDates,
      unexpectedDates,
    },
    protectedPathDiff: protectedDiff,
    writeRequested: options.write,
    publicDataWritePerformed: writeResult?.completed === true,
    oldShardDeleted: writeResult?.oldShardDeleted === true,
    localStorageUsed: false,
  };
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(JSON.stringify({
      mode: "historical-rolling-window-dry-run",
      result: "STOP",
      reason: error instanceof Error ? error.message : String(error),
      publicDataWritePerformed: false,
      oldShardDeleted: false,
      localStorageUsed: false,
    }, null, 2));
    process.exitCode = 2;
    return;
  }

  let tempRoot = null;
  try {
    const protectedBefore = await gitStatus(DRY_RUN_PROTECTED_PATHS);
    tempRoot = await mkdtemp(
      path.join(tmpdir(), "kurari-ex-historical-window-"),
    );
    const report = await inspectCandidate(options, tempRoot, protectedBefore);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.promotion.possible ? 0 : 1;
  } catch (error) {
    console.error(JSON.stringify({
      mode: options.write
        ? "historical-rolling-window-write"
        : "historical-rolling-window-dry-run",
      targetDate: options.targetDate,
      result: "STOP",
      reason: error instanceof Error ? error.stack : String(error),
      publicDataWritePerformed: false,
      oldShardDeleted: false,
      localStorageUsed: false,
    }, null, 2));
    process.exitCode = 1;
  } finally {
    if (tempRoot) {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }
}

const executedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === executedPath) {
  await main();
}
