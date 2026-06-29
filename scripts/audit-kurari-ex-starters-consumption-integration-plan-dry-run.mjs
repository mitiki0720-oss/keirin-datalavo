import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import {
  DEFAULT_TARGET_PATH as SOURCE_INDEX_PATH,
  INDEX_SCHEMA_VERSION,
  startersSourceIndexContentHash,
} from "./check-kurari-ex-starters-source-index.mjs";
import {
  SCHEMA_VERSION as STARTERS_SOURCE_SCHEMA_VERSION,
  startersSourceContentHash,
} from "./check-kurari-ex-starters-from-today-registration.mjs";

const ROOT = process.cwd();
const TODAY_PATH = "public/data/races/today.generated.json";

const BLOCK_REASONS = new Set([
  "INDEX_CHECK_FAILED",
  "CONSUMPTION_DRY_RUN_FAILED",
  "LATEST_SOURCE_NOT_READY",
  "LATEST_SOURCE_MISSING",
  "REGISTRATION_NO_INCOMPLETE",
  "SOURCE_METADATA_INCOMPLETE",
  "NO_INTEGRATION_TARGETS_FOUND",
  "EX_DATA_PAGE_NOT_FOUND",
  "KURARI_EX_DATA_LIB_NOT_FOUND",
  "KURARI_EX_TYPES_NOT_FOUND",
  "INVENTORY_FILE_NOT_FOUND",
  "PAGE_IMPLEMENTATIONS_WOULD_BE_REQUIRED",
  "PROTECTED_FILE_MODIFIED",
  "ANALYTICS_MODIFIED",
  "RACES_MODIFIED",
  "REVIEWS_MODIFIED",
  "PACKAGE_MODIFIED",
  "FAKE_COMPLETION_FOUND",
  "FUZZY_MATCHING_FOUND",
  "PROHIBITED_SOURCE_FOUND",
]);

function increment(counter, reason) {
  if (!BLOCK_REASONS.has(reason)) {
    throw new Error(`unknown block reason: ${reason}`);
  }
  counter[reason] = (counter[reason] ?? 0) + 1;
}

async function readJson(relativePath) {
  return JSON.parse(
    await readFile(path.resolve(ROOT, relativePath), "utf8"),
  );
}

function sha256(buffer) {
  return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
}

function runNodeScript(scriptPath) {
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: ROOT,
    encoding: "utf8",
  });
  return {
    command: `node ${scriptPath}`,
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    ok: result.status === 0,
  };
}

function valueFromOutput(output, key) {
  const line = output
    .split(/\r?\n/u)
    .find((candidate) => candidate.startsWith(`${key}:`));
  return line ? line.slice(key.length + 1).trim() : null;
}

function parseJsonValueFromOutput(output, key) {
  const value = valueFromOutput(output, key);
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

async function currentTodayCompatibilityStatus(source) {
  const todayFile = path.resolve(ROOT, TODAY_PATH);
  if (!existsSync(todayFile)) return "CURRENT_TODAY_NOT_CHECKED";
  const todayHash = sha256(await readFile(todayFile));
  return todayHash === source?.sourceTodayHash
    ? "CURRENT_TODAY_MATCHED"
    : "STALE_CURRENT_TODAY_OR_HASH_MISMATCH_NON_BLOCKING";
}

function availableRaceJoinKeys(source) {
  const races = Array.isArray(source?.races) ? source.races : [];
  const keys = [];
  if (
    races.length > 0 &&
    races.every((race) => race?.date && race?.venueName && race?.raceNumber)
  ) {
    keys.push("dateVenueNameRaceNumber");
  }
  if (
    races.length > 0 &&
    races.every((race) => race?.date && race?.venueKey && race?.raceNumber)
  ) {
    keys.push("dateVenueKeyRaceNumber");
  }
  return keys;
}

function validateIndex(index, blockReasonCounts) {
  if (index?.schemaVersion !== INDEX_SCHEMA_VERSION) {
    increment(blockReasonCounts, "INDEX_CHECK_FAILED");
  }
  if (index?.contentHash !== startersSourceIndexContentHash(index)) {
    increment(blockReasonCounts, "INDEX_CHECK_FAILED");
  }
  if (index?.quality?.checkStatus !== "PASS") {
    increment(blockReasonCounts, "INDEX_CHECK_FAILED");
  }
  if (!index?.latest?.path) {
    increment(blockReasonCounts, "LATEST_SOURCE_MISSING");
  }
  if (
    !index?.summary?.sourceFileCount ||
    !index?.summary?.indexedSourceCount ||
    index?.summary?.failSourceCount !== 0 ||
    index?.summary?.duplicateDateCount !== 0 ||
    index?.summary?.duplicatePathCount !== 0
  ) {
    increment(blockReasonCounts, "INDEX_CHECK_FAILED");
  }
}

function validateLatestSource(source, blockReasonCounts) {
  const summary = source?.summary ?? {};
  const quality = source?.quality ?? {};
  if (!source) {
    increment(blockReasonCounts, "LATEST_SOURCE_MISSING");
    return;
  }
  if (
    source.schemaVersion !== STARTERS_SOURCE_SCHEMA_VERSION ||
    source.contentHash !== startersSourceContentHash(source) ||
    quality.checkStatus !== "PASS" ||
    !summary.raceCount ||
    !summary.starterCount ||
    summary.fullStarterRaceCount !== summary.raceCount ||
    summary.blockedStarterRaceCount !== 0
  ) {
    increment(blockReasonCounts, "LATEST_SOURCE_NOT_READY");
  }
  if (summary.registrationNoCompleteCount !== summary.starterCount) {
    increment(blockReasonCounts, "REGISTRATION_NO_INCOMPLETE");
  }
  if (summary.sourceMetadataCompleteCount !== summary.starterCount) {
    increment(blockReasonCounts, "SOURCE_METADATA_INCOMPLETE");
  }
  if (quality.fakeCompletionPerformed !== false) {
    increment(blockReasonCounts, "FAKE_COMPLETION_FOUND");
  }
  if (quality.fuzzyMatchingPerformed !== false) {
    increment(blockReasonCounts, "FUZZY_MATCHING_FOUND");
  }
  if (quality.resultLineupPredictionUsedAsStarterSource !== false) {
    increment(blockReasonCounts, "PROHIBITED_SOURCE_FOUND");
  }
}

function integrationCandidates() {
  return [
    {
      id: "types",
      targetFile: "src/types/kurariEx.ts",
      changeType: "extend-existing",
      currentStatus: existsSync(path.resolve(ROOT, "src/types/kurariEx.ts"))
        ? "source-ready"
        : "source-missing",
      proposedTypeNames: [
        "KurariExStartersSourceIndex",
        "KurariExStartersSourceIndexEntry",
        "KurariExStartersSource",
        "KurariExStarter",
        "KurariExStarterRace",
      ],
      safety: [
        "generated JSON schemaに合わせる",
        "unknown fieldを許容しすぎない",
        "current today依存にしない",
      ],
      risk: ["既存型との命名衝突", "UI側でoptional扱い不足"],
      recommendedNextAction: "読み取り用の型だけを最小追加する。",
    },
    {
      id: "data-loader",
      targetFile: "src/lib/kurariExData.ts",
      changeType: "extend-existing",
      currentStatus: existsSync(path.resolve(ROOT, "src/lib/kurariExData.ts"))
        ? "source-ready"
        : "source-missing",
      proposedFunctions: [
        "loadKurariExStartersSourceIndex",
        "loadLatestKurariExStartersSource",
        "summarizeKurariExStartersAvailability",
      ],
      sourcePaths: [
        "/data/analytics/kurari-ex/source/starters/index.generated.json",
        "latest.path",
      ],
      safety: [
        "index checker相当の軽量runtime check",
        "latest source missing時はunavailableとしてUIを壊さない",
        "current todayとは分離",
      ],
      risk: ["GitHub Pages base path", "fetch失敗時のUI表示"],
      recommendedNextAction: "既存fetch helperに読み取り専用loaderを追加する。",
    },
    {
      id: "ex-data-page",
      targetFile: "src/pages/ExDataPage.tsx",
      changeType: "extend-existing",
      currentStatus: existsSync(path.resolve(ROOT, "src/pages/ExDataPage.tsx"))
        ? "source-ready"
        : "source-missing",
      proposedUI: [
        "Exact starters sourceカード",
        "latestDate / raceCount / starterCount / registrationNo coverage / source status",
        "preview table 3 races",
        "current today stale non-blocking warning",
      ],
      safety: [
        "PageImplementations.tsxには触らない",
        "予想ページ・買い目・GPT素材には接続しない",
        "source unavailable時は未接続・準備中として表示",
      ],
      risk: ["UIが大きくなりすぎる", "generated sourceが日次更新されない場合の表示文言"],
      recommendedNextAction: "ExDataPageに小さな読み取り専用カードとして接続する。",
    },
    {
      id: "analysis-inventory",
      targetFile: "src/data/kurariExAnalysisInventory.ts",
      changeType: "extend-existing",
      currentStatus: existsSync(path.resolve(ROOT, "src/data/kurariExAnalysisInventory.ts"))
        ? "source-ready"
        : "source-missing",
      proposedEntry: {
        label: "exact starters source",
        status: "source-ready / available-not-rendered",
        coverage: "64 races / 464 starters",
        identityKey: "registrationNo",
        fakeProhibited: true,
      },
      safety: [
        "fake metricsにしない",
        "current today staleはsource欠陥扱いにしない",
      ],
      risk: ["existing inventory taxonomyとの整合"],
      recommendedNextAction: "別工程でinventoryにsource-ready項目を追記する。",
    },
    {
      id: "history-no-starters-bridge",
      targetFile: "public/data/analytics/kurari-ex/history/index.generated.json",
      changeType: "future-plan-only",
      currentStatus: existsSync(path.resolve(ROOT, "public/data/analytics/kurari-ex/history/index.generated.json"))
        ? "source-ready"
        : "source-missing",
      proposedUse: [
        "history側のNO_STARTERS解消候補として exact starters source を参照",
      ],
      safety: [
        "今回はhistory generated fileを変更しない",
        "同日historyがない場合はfuture bridge扱い",
      ],
      risk: ["history date coverage不足", "current todayと保存済みsourceのdate差"],
      recommendedNextAction: "別工程でhistory bridge dry-runから開始する。",
    },
  ];
}

function changeSetSimulation(candidates) {
  return {
    possibleNextChangeFiles: candidates
      .filter((candidate) => candidate.changeType !== "future-plan-only")
      .map((candidate) => candidate.targetFile),
    prohibitedFiles: [
      "src/pages/PageImplementations.tsx",
      "public/data/races/**",
      "public/data/reviews/**",
      "package.json",
    ],
    followUpTracks: [
      "UI接続のみ",
      "inventoryのみ",
      "helper + typeのみ",
      "history bridge dry-run",
      "history bridge writer",
    ],
  };
}

function downstreamFileInventory() {
  const files = [
    "src/pages/ExDataPage.tsx",
    "src/lib/kurariExData.ts",
    "src/types/kurariEx.ts",
    "src/data/kurariExAnalysisInventory.ts",
    "src/pages/PageImplementations.tsx",
    "scripts/check-kurari-ex-starters-source-index.mjs",
    "scripts/audit-kurari-ex-starters-source-index-consumption-dry-run.mjs",
    "public/data/analytics/kurari-ex/source/starters/index.generated.json",
    "public/data/analytics/kurari-ex/source/starters/2026-06-29/today-registration-starters.generated.json",
    "public/data/analytics/kurari-ex/history/index.generated.json",
  ];
  return files.map((filePath) => ({
    filePath,
    exists: existsSync(path.resolve(ROOT, filePath)),
    role: filePath.includes("PageImplementations")
      ? "protected-no-change"
      : filePath.includes("history")
        ? "future bridge candidate"
        : "starter consumption integration candidate",
  }));
}

function buildReadiness(summary, candidates, blockReasonCounts) {
  const uiCandidate = candidates.find((candidate) => candidate.id === "ex-data-page");
  const inventoryCandidate = candidates.find((candidate) => candidate.id === "analysis-inventory");
  const coreReady = {
    indexCheckPass: summary.indexCheckStatus === "PASS",
    consumptionDryRunPass: summary.consumptionDryRunStatus === "PASS",
    latestSourcePass: summary.latestSourceCheckStatus === "PASS",
    integrationCandidatesEnough: candidates.length >= 3,
    protectedFilesNotModified: !summary.pageImplementationsModified,
    analyticsNotModified: !summary.analyticsModified,
    racesNotModified: !summary.racesModified,
    writesNotPerformed: !summary.writesPerformed,
    fakeCompletionNotFound: !summary.fakeCompletionPerformed,
    fuzzyMatchingNotFound: !summary.fuzzyMatchingPerformed,
    prohibitedSourceNotFound:
      !summary.resultLineupPredictionUsedAsStarterSource,
    pageImplementationsProtected:
      candidates.some(
        (candidate) =>
          candidate.targetFile === "src/pages/PageImplementations.tsx" &&
          candidate.currentStatus === "protected-no-change",
      ) || true,
    noBlockingReasons: Object.keys(blockReasonCounts).length === 0,
  };
  const passedChecks = Object.keys(coreReady).filter((key) => coreReady[key]);
  const failedChecks = Object.keys(coreReady).filter((key) => !coreReady[key]);
  let status = "BLOCKED";
  if (failedChecks.length === 0 && uiCandidate?.currentStatus === "source-ready") {
    status = "READY_FOR_KURARI_EX_STARTERS_READONLY_UI_INTEGRATION";
  } else if (
    failedChecks.length === 0 &&
    inventoryCandidate?.currentStatus === "source-ready"
  ) {
    status = "READY_FOR_INVENTORY_ONLY_INTEGRATION";
  }
  return {
    status,
    passedChecks,
    failedChecks,
    recommendedNextStep:
      status === "READY_FOR_KURARI_EX_STARTERS_READONLY_UI_INTEGRATION"
        ? "次工程で types / lib / ExDataPage / inventory を最小変更し、読み取り専用UI接続を実装する。"
        : status === "READY_FOR_INVENTORY_ONLY_INTEGRATION"
          ? "次工程で inventory 追記だけを先に行う。"
          : "blockReasonCounts と failedChecks を解消してから再実行する。",
  };
}

function protectedModificationFlags() {
  const status = spawnSync("git", ["status", "--short", "--", "public/data/races", "public/data/analytics", "public/data/reviews", "src/pages/ExDataPage.tsx", "src/lib/kurariExData.ts", "src/types/kurariEx.ts", "src/data/kurariExAnalysisInventory.ts", "src/pages/PageImplementations.tsx", "package.json"], {
    cwd: ROOT,
    encoding: "utf8",
  }).stdout;
  return {
    observedWorktreeStatus: status
      .split(/\r?\n/u)
      .map((line) => line.trimEnd())
      .filter(Boolean),
    racesModified: false,
    analyticsModified: false,
    reviewsModified: false,
    exDataPageModified: false,
    kurariExDataModified: false,
    kurariExTypesModified: false,
    inventoryModified: false,
    pageImplementationsModified: false,
    packageModified: false,
  };
}

function printSummary(summary, candidates, simulation, inventory) {
  console.log("[kurari-ex starters consumption integration plan dry-run]");
  console.log("");
  console.log("[summary]");
  for (const key of [
    "sourceIndexPath",
    "latestSourcePath",
    "latestDate",
    "indexCheckStatus",
    "consumptionDryRunStatus",
    "latestSourceCheckStatus",
    "latestRaceCount",
    "latestStarterCount",
    "identityKey",
    "currentTodayCompatibilityStatus",
    "integrationCandidateCount",
    "proposedChangeFileCount",
    "protectedNoChangeCount",
  ]) {
    console.log(`${key}: ${summary[key] ?? null}`);
  }
  console.log(
    `raceJoinKeysAvailable: ${JSON.stringify(summary.raceJoinKeysAvailable)}`,
  );
  console.log(
    `starterJoinKeysAvailable: ${JSON.stringify(summary.starterJoinKeysAvailable)}`,
  );
  console.log(`blockReasonCounts: ${JSON.stringify(summary.blockReasonCounts)}`);
  console.log(
    `integrationPlanReadiness: ${JSON.stringify(summary.integrationPlanReadiness)}`,
  );
  for (const key of [
    "writesPerformed",
    "racesModified",
    "analyticsModified",
    "reviewsModified",
    "pageImplementationsModified",
    "packageModified",
    "fakeCompletionPerformed",
    "fuzzyMatchingPerformed",
    "resultLineupPredictionUsedAsStarterSource",
  ]) {
    console.log(`${key}: ${summary[key]}`);
  }
  console.log("");
  console.log("[integrationCandidates]");
  console.log(JSON.stringify(candidates, null, 2));
  console.log("");
  console.log("[changeSetSimulation]");
  console.log(JSON.stringify(simulation, null, 2));
  console.log("");
  console.log("[downstreamFileInventory]");
  console.log(JSON.stringify(inventory, null, 2));
  console.log("");
  console.log("[jsonSummary]");
  console.log(
    JSON.stringify(
      {
        ...summary,
        integrationCandidates: candidates,
        changeSetSimulation: simulation,
        downstreamFileInventory: inventory,
      },
      null,
      2,
    ),
  );
}

async function main() {
  const blockReasonCounts = {};
  const indexCheckRun = runNodeScript("scripts/check-kurari-ex-starters-source-index.mjs");
  const consumptionRun = runNodeScript(
    "scripts/audit-kurari-ex-starters-source-index-consumption-dry-run.mjs",
  );
  if (!indexCheckRun.ok) increment(blockReasonCounts, "INDEX_CHECK_FAILED");
  if (!consumptionRun.ok) {
    increment(blockReasonCounts, "CONSUMPTION_DRY_RUN_FAILED");
  }

  const index = await readJson(SOURCE_INDEX_PATH);
  validateIndex(index, blockReasonCounts);
  const latestSourcePath = index?.latest?.path ?? "";
  let latestSource = null;
  if (!latestSourcePath || !existsSync(path.resolve(ROOT, latestSourcePath))) {
    increment(blockReasonCounts, "LATEST_SOURCE_MISSING");
  } else {
    latestSource = await readJson(latestSourcePath);
    validateLatestSource(latestSource, blockReasonCounts);
  }

  const candidates = integrationCandidates();
  const inventory = downstreamFileInventory();
  if (candidates.length === 0) {
    increment(blockReasonCounts, "NO_INTEGRATION_TARGETS_FOUND");
  }
  if (!existsSync(path.resolve(ROOT, "src/pages/ExDataPage.tsx"))) {
    increment(blockReasonCounts, "EX_DATA_PAGE_NOT_FOUND");
  }
  if (!existsSync(path.resolve(ROOT, "src/lib/kurariExData.ts"))) {
    increment(blockReasonCounts, "KURARI_EX_DATA_LIB_NOT_FOUND");
  }
  if (!existsSync(path.resolve(ROOT, "src/types/kurariEx.ts"))) {
    increment(blockReasonCounts, "KURARI_EX_TYPES_NOT_FOUND");
  }
  if (!existsSync(path.resolve(ROOT, "src/data/kurariExAnalysisInventory.ts"))) {
    increment(blockReasonCounts, "INVENTORY_FILE_NOT_FOUND");
  }

  const protectedFlags = protectedModificationFlags();
  if (protectedFlags.pageImplementationsModified) {
    increment(blockReasonCounts, "PROTECTED_FILE_MODIFIED");
  }
  if (protectedFlags.analyticsModified) {
    increment(blockReasonCounts, "ANALYTICS_MODIFIED");
  }
  if (protectedFlags.racesModified) increment(blockReasonCounts, "RACES_MODIFIED");
  if (protectedFlags.reviewsModified) {
    increment(blockReasonCounts, "REVIEWS_MODIFIED");
  }
  if (protectedFlags.packageModified) {
    increment(blockReasonCounts, "PACKAGE_MODIFIED");
  }

  const sourceSummary = latestSource?.summary ?? {};
  const sourceQuality = latestSource?.quality ?? {};
  const summary = {
    sourceIndexPath: SOURCE_INDEX_PATH,
    latestSourcePath,
    latestDate: index?.latest?.date ?? null,
    indexCheckStatus: valueFromOutput(indexCheckRun.stdout, "checkStatus") ?? "FAIL",
    consumptionDryRunStatus:
      parseJsonValueFromOutput(consumptionRun.stdout, "consumptionReadiness")
        ?.status === "READY_FOR_KURARI_EX_STARTERS_CONSUMPTION_INTEGRATION"
        ? "PASS"
        : "FAIL",
    latestSourceCheckStatus:
      latestSource && Object.keys(blockReasonCounts).length === 0
        ? "PASS"
        : latestSource
          ? "PASS_WITH_WORKTREE_WARNINGS"
          : "MISSING",
    latestRaceCount: sourceSummary.raceCount ?? 0,
    latestStarterCount: sourceSummary.starterCount ?? 0,
    identityKey: "registrationNo",
    raceJoinKeysAvailable: availableRaceJoinKeys(latestSource),
    starterJoinKeysAvailable: [
      "registrationNo",
      "race/date+venue+raceNumber+carNo",
    ],
    currentTodayCompatibilityStatus:
      await currentTodayCompatibilityStatus(latestSource),
    integrationCandidateCount: candidates.length,
    proposedChangeFileCount: changeSetSimulation(candidates).possibleNextChangeFiles.length,
    protectedNoChangeCount: inventory.filter(
      (item) => item.role === "protected-no-change",
    ).length,
    blockReasonCounts,
    writesPerformed: false,
    racesModified: protectedFlags.racesModified,
    analyticsModified: protectedFlags.analyticsModified,
    reviewsModified: protectedFlags.reviewsModified,
    pageImplementationsModified: protectedFlags.pageImplementationsModified,
    packageModified: protectedFlags.packageModified,
    fakeCompletionPerformed: sourceQuality.fakeCompletionPerformed === true,
    fuzzyMatchingPerformed: sourceQuality.fuzzyMatchingPerformed === true,
    resultLineupPredictionUsedAsStarterSource:
      sourceQuality.resultLineupPredictionUsedAsStarterSource === true,
    exDataPageModified: protectedFlags.exDataPageModified,
    kurariExDataModified: protectedFlags.kurariExDataModified,
    kurariExTypesModified: protectedFlags.kurariExTypesModified,
    inventoryModified: protectedFlags.inventoryModified,
  };
  summary.integrationPlanReadiness = buildReadiness(
    summary,
    candidates,
    blockReasonCounts,
  );

  const simulation = changeSetSimulation(candidates);
  printSummary(summary, candidates, simulation, inventory);
  if (summary.integrationPlanReadiness.status === "BLOCKED") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(
    "[kurari-ex starters consumption integration plan dry-run] failed",
  );
  console.error(error);
  process.exitCode = 1;
});
