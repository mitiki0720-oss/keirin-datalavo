import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_TARGET_PATH as SOURCE_INDEX_PATH,
  INDEX_SCHEMA_VERSION,
  checkStartersSourceIndex,
  startersSourceIndexContentHash,
} from "./check-kurari-ex-starters-source-index.mjs";
import {
  SCHEMA_VERSION as STARTERS_SOURCE_SCHEMA_VERSION,
  startersSourceContentHash,
} from "./check-kurari-ex-starters-from-today-registration.mjs";
import {
  normalizeText,
  toInteger,
} from "./lib/kurari-ex-entry-snapshot.mjs";

const ROOT = process.cwd();
const TODAY_PATH = "public/data/races/today.generated.json";
const BLOCK_REASONS = new Set([
  "INDEX_FILE_MISSING",
  "INDEX_SCHEMA_MISMATCH",
  "INDEX_CONTENT_HASH_MISMATCH",
  "INDEX_CHECK_FAILED",
  "INDEX_LATEST_MISSING",
  "INDEX_LATEST_NOT_IN_SOURCES",
  "INDEX_HAS_FAILED_SOURCES",
  "DUPLICATE_DATE",
  "DUPLICATE_PATH",
  "LATEST_SOURCE_FILE_MISSING",
  "LATEST_SOURCE_SCHEMA_MISMATCH",
  "LATEST_SOURCE_CONTENT_HASH_MISMATCH",
  "LATEST_SOURCE_QUALITY_FAIL",
  "LATEST_SOURCE_DATE_MISMATCH",
  "LATEST_SOURCE_RACES_MISSING",
  "LATEST_SOURCE_STARTERS_MISSING",
  "REGISTRATION_NO_MISSING",
  "REGISTRATION_NO_INVALID",
  "DUPLICATE_REGISTRATION_NO",
  "DUPLICATE_CAR_NO",
  "SOURCE_METADATA_MISSING",
  "FAKE_COMPLETION_FOUND",
  "FUZZY_MATCHING_FOUND",
  "RESULT_LINEUP_PREDICTION_SOURCE_FOUND",
  "DOWNSTREAM_TARGET_UNKNOWN",
]);

async function readJson(relativePath) {
  return JSON.parse(
    await readFile(path.resolve(ROOT, relativePath), "utf8"),
  );
}

function sha256(buffer) {
  return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
}

function increment(counter, reason) {
  if (!BLOCK_REASONS.has(reason)) {
    throw new Error(`unknown block reason: ${reason}`);
  }
  counter[reason] = (counter[reason] ?? 0) + 1;
}

function validateIndexPayload(index, indexCheck, blockReasonCounts) {
  if (!existsSync(path.resolve(ROOT, SOURCE_INDEX_PATH))) {
    increment(blockReasonCounts, "INDEX_FILE_MISSING");
  }
  if (index?.schemaVersion !== INDEX_SCHEMA_VERSION) {
    increment(blockReasonCounts, "INDEX_SCHEMA_MISMATCH");
  }
  if (index?.contentHash !== startersSourceIndexContentHash(index)) {
    increment(blockReasonCounts, "INDEX_CONTENT_HASH_MISMATCH");
  }
  if (indexCheck.checkStatus !== "PASS") {
    increment(blockReasonCounts, "INDEX_CHECK_FAILED");
  }
  if (!index?.latest) {
    increment(blockReasonCounts, "INDEX_LATEST_MISSING");
  }
  const sources = Array.isArray(index?.sources) ? index.sources : [];
  if (
    index?.latest &&
    !sources.some(
      (source) =>
        source?.date === index.latest.date &&
        source?.path === index.latest.path &&
        source?.contentHash === index.latest.contentHash,
    )
  ) {
    increment(blockReasonCounts, "INDEX_LATEST_NOT_IN_SOURCES");
  }
  if (index?.summary?.failSourceCount !== 0) {
    increment(blockReasonCounts, "INDEX_HAS_FAILED_SOURCES");
  }
  if (index?.summary?.duplicateDateCount !== 0) {
    increment(blockReasonCounts, "DUPLICATE_DATE");
  }
  if (index?.summary?.duplicatePathCount !== 0) {
    increment(blockReasonCounts, "DUPLICATE_PATH");
  }
}

function validateLatestSource(source, index, blockReasonCounts) {
  const summary = source?.summary ?? {};
  const quality = source?.quality ?? {};
  const races = Array.isArray(source?.races) ? source.races : [];
  if (source?.schemaVersion !== STARTERS_SOURCE_SCHEMA_VERSION) {
    increment(blockReasonCounts, "LATEST_SOURCE_SCHEMA_MISMATCH");
  }
  if (source?.contentHash !== startersSourceContentHash(source)) {
    increment(blockReasonCounts, "LATEST_SOURCE_CONTENT_HASH_MISMATCH");
  }
  if (quality?.checkStatus !== "PASS") {
    increment(blockReasonCounts, "LATEST_SOURCE_QUALITY_FAIL");
  }
  if (source?.date !== index?.latest?.date) {
    increment(blockReasonCounts, "LATEST_SOURCE_DATE_MISMATCH");
  }
  if (summary?.raceCount !== index?.latest?.raceCount) {
    increment(blockReasonCounts, "LATEST_SOURCE_DATE_MISMATCH");
  }
  if (summary?.starterCount !== index?.latest?.starterCount) {
    increment(blockReasonCounts, "LATEST_SOURCE_STARTERS_MISSING");
  }
  if (summary?.fullStarterRaceCount !== summary?.raceCount) {
    increment(blockReasonCounts, "LATEST_SOURCE_RACES_MISSING");
  }
  if (summary?.blockedStarterRaceCount !== 0) {
    increment(blockReasonCounts, "LATEST_SOURCE_RACES_MISSING");
  }
  if (summary?.registrationNoCompleteCount !== summary?.starterCount) {
    increment(blockReasonCounts, "REGISTRATION_NO_MISSING");
  }
  if (summary?.sourceMetadataCompleteCount !== summary?.starterCount) {
    increment(blockReasonCounts, "SOURCE_METADATA_MISSING");
  }
  if (races.length === 0 || summary?.raceCount <= 0) {
    increment(blockReasonCounts, "LATEST_SOURCE_RACES_MISSING");
  }
  if (summary?.starterCount <= 0) {
    increment(blockReasonCounts, "LATEST_SOURCE_STARTERS_MISSING");
  }
  if (quality?.fakeCompletionPerformed !== false) {
    increment(blockReasonCounts, "FAKE_COMPLETION_FOUND");
  }
  if (quality?.fuzzyMatchingPerformed !== false) {
    increment(blockReasonCounts, "FUZZY_MATCHING_FOUND");
  }
  if (quality?.resultLineupPredictionUsedAsStarterSource !== false) {
    increment(blockReasonCounts, "RESULT_LINEUP_PREDICTION_SOURCE_FOUND");
  }

  for (const race of races) {
    const starters = Array.isArray(race?.starters) ? race.starters : [];
    if (starters.length === 0) {
      increment(blockReasonCounts, "LATEST_SOURCE_STARTERS_MISSING");
      continue;
    }
    const carNos = starters.map((starter) => toInteger(starter?.carNo));
    const registrationNos = starters.map((starter) =>
      normalizeText(starter?.registrationNo),
    );
    if (new Set(carNos).size !== carNos.length) {
      increment(blockReasonCounts, "DUPLICATE_CAR_NO");
    }
    if (registrationNos.some((registrationNo) => !registrationNo)) {
      increment(blockReasonCounts, "REGISTRATION_NO_MISSING");
    }
    if (
      registrationNos.some(
        (registrationNo) => registrationNo && !/^\d{6}$/.test(registrationNo),
      )
    ) {
      increment(blockReasonCounts, "REGISTRATION_NO_INVALID");
    }
    if (new Set(registrationNos).size !== registrationNos.length) {
      increment(blockReasonCounts, "DUPLICATE_REGISTRATION_NO");
    }
    for (const starter of starters) {
      const sourceFields = [
        starter?.source,
        starter?.registrationNoSource,
        starter?.registrationNoSourceDate,
        starter?.registrationNoSourcePath,
        starter?.registrationNoSourceHash,
      ];
      if (sourceFields.some((value) => !normalizeText(value))) {
        increment(blockReasonCounts, "SOURCE_METADATA_MISSING");
      }
    }
  }
}

async function currentTodayCompatibilityStatus(source) {
  const todayFile = path.resolve(ROOT, TODAY_PATH);
  if (!existsSync(todayFile)) return "CURRENT_TODAY_FILE_MISSING_NON_BLOCKING";
  const todayHash = sha256(await readFile(todayFile));
  return todayHash === source?.sourceTodayHash
    ? "CURRENT_TODAY_HASH_MATCH"
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
  if (races.length > 0 && races.every((race) => race?.raceId)) {
    keys.push("raceId");
  }
  if (races.length > 0 && races.every((race) => race?.raceKey)) {
    keys.push("raceKey");
  }
  return keys;
}

function buildPreviewCandidates(source) {
  return (Array.isArray(source?.races) ? source.races : [])
    .slice(0, 3)
    .map((race) => ({
      date: race.date,
      venueName: race.venueName,
      raceNumber: race.raceNumber,
      starterCount: race.starterCount,
      joinKeyType: race.joinKeyType,
      starters: (Array.isArray(race?.starters) ? race.starters : [])
        .slice(0, 2)
        .map((starter) => ({
          carNo: starter.carNo,
          name: starter.name,
          registrationNo: starter.registrationNo,
          source: starter.source,
          registrationNoSource: starter.registrationNoSource,
        })),
      omittedStarterCount: Math.max(
        (Array.isArray(race?.starters) ? race.starters.length : 0) - 2,
        0,
      ),
    }));
}

function downstreamInventory() {
  const candidates = [
    {
      filePath: "src/pages/ExDataPage.tsx",
      role: "KURARI EX data page / dashboard component",
      expectedIntegration: "starters source indexを画面表示へ接続可能",
      risk: "UI接続時に保存済みsourceとcurrent todayを混同しない",
      recommendedNextAction: "別工程で読み取り専用fetchを追加",
    },
    {
      filePath: "src/lib/kurariExData.ts",
      role: "KURARI EX source/material utilities",
      expectedIntegration: "registrationNoをidentity keyとして参照可能",
      risk: "GPT素材や予想ロジックへ今回直接接続しない",
      recommendedNextAction: "必要時にsource fetch helperを追加",
    },
    {
      filePath: "src/types/kurariEx.ts",
      role: "KURARI EX type definitions",
      expectedIntegration: "starter source/index型の追加候補",
      risk: "既存型の大幅変更は不要",
      recommendedNextAction: "UI接続時に型定義を最小追加",
    },
    {
      filePath: "src/pages/PageImplementations.tsx",
      role: "protected prediction/review page implementation",
      expectedIntegration: "今回は接続しない",
      risk: "予想ページ・GPT素材への誤接続",
      recommendedNextAction: "protected-no-changeを維持",
      forcedStatus: "protected-no-change",
    },
    {
      filePath: "src/data/kurariExAnalysisInventory.ts",
      role: "KURARI EX source inventory / analysis inventory",
      expectedIntegration: "starters source availabilityの記録候補",
      risk: "今回のdry-runでは分類変更しない",
      recommendedNextAction: "別工程でinventoryにsource-readyを追記",
    },
    {
      filePath: "scripts/check-kurari-ex-starters-source-index.mjs",
      role: "KURARI EX audit scripts",
      expectedIntegration: "index検証の既存入口",
      risk: "なし。読み取り検証として再利用済み",
      recommendedNextAction: "継続利用",
    },
    {
      filePath: "public/data/analytics/kurari-ex/source/starters/index.generated.json",
      role: "KURARI EX generated analytics files",
      expectedIntegration: "downstreamの参照入口",
      risk: "generated analyticsを今回変更しない",
      recommendedNextAction: "読み取り専用参照",
    },
    {
      filePath:
        "public/data/analytics/kurari-ex/source/starters/2026-06-29/today-registration-starters.generated.json",
      role: "latest exact starters source",
      expectedIntegration: "registrationNoベースのstarter identity source",
      risk: "current today再生成とは分離する",
      recommendedNextAction: "latest.pathから読み取り",
    },
    {
      filePath: "public/data/analytics/kurari-ex/history/index.generated.json",
      role: "existing lineup / role / condition / matchup / relationship related analytics",
      expectedIntegration: "history bridgeへの将来接続候補",
      risk: "既存historyを今回更新しない",
      recommendedNextAction: "別工程でNO_STARTERS解消候補として利用",
    },
  ];
  return candidates.map((candidate) => {
    const exists = existsSync(path.resolve(ROOT, candidate.filePath));
    const currentStatus =
      candidate.forcedStatus ??
      (exists ? "source-ready" : "source-missing");
    return {
      filePath: candidate.filePath,
      role: candidate.role,
      currentStatus,
      expectedIntegration: candidate.expectedIntegration,
      risk: candidate.risk,
      recommendedNextAction: candidate.recommendedNextAction,
    };
  });
}

function buildReadiness(summary, blockReasonCounts) {
  const checks = {
    indexCheckerPass: summary.indexCheckStatus === "PASS",
    latestSourcePass: summary.latestSourceCheckStatus === "PASS",
    latestSourceRaceCountPositive: summary.latestRaceCount > 0,
    latestSourceStarterCountPositive: summary.latestStarterCount > 0,
    registrationNoComplete:
      summary.registrationNoCompleteCount === summary.latestStarterCount,
    blockedStarterRaceCountZero: summary.blockedStarterRaceCount === 0,
    fakeCompletionNotPerformed: !summary.fakeCompletionPerformed,
    fuzzyMatchingNotPerformed: !summary.fuzzyMatchingPerformed,
    prohibitedSourcesNotUsed:
      !summary.resultLineupPredictionUsedAsStarterSource,
    writesNotPerformed: summary.writesPerformed === false,
    noBlockingReasons: Object.keys(blockReasonCounts).length === 0,
  };
  const passedChecks = Object.keys(checks).filter((key) => checks[key]);
  const failedChecks = Object.keys(checks).filter((key) => !checks[key]);
  return {
    status:
      failedChecks.length === 0
        ? "READY_FOR_KURARI_EX_STARTERS_CONSUMPTION_INTEGRATION"
        : "BLOCKED",
    passedChecks,
    failedChecks,
    nextRecommendedAction:
      failedChecks.length === 0
        ? "UI・analyticsへの本接続を別工程で読み取り専用から実装する。"
        : "blockReasonCountsとfailedChecksを解消してから再実行する。",
  };
}

function printSummary(summary, preview, inventory) {
  console.log("[kurari-ex starters source index consumption dry-run]");
  console.log("");
  console.log("[summary]");
  for (const key of [
    "sourceIndexPath",
    "latestSourcePath",
    "latestDate",
    "indexCheckStatus",
    "latestSourceCheckStatus",
    "sourceFileCount",
    "indexedSourceCount",
    "totalRaceCount",
    "totalStarterCount",
    "latestRaceCount",
    "latestStarterCount",
    "identityKey",
    "currentTodayCompatibilityStatus",
    "downstreamInventoryCount",
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
    `consumptionReadiness: ${JSON.stringify(summary.consumptionReadiness)}`,
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
  console.log("[previewConsumptionCandidates]");
  console.log(JSON.stringify(preview, null, 2));
  console.log("");
  console.log("[downstreamInventory]");
  console.log(JSON.stringify(inventory, null, 2));
  console.log("");
  console.log("[jsonSummary]");
  console.log(JSON.stringify({ ...summary, previewConsumptionCandidates: preview, downstreamInventory: inventory }, null, 2));
}

async function main() {
  const blockReasonCounts = {};
  const indexCheck = await checkStartersSourceIndex(SOURCE_INDEX_PATH, ROOT);
  let index = null;
  let latestSource = null;
  if (!existsSync(path.resolve(ROOT, SOURCE_INDEX_PATH))) {
    increment(blockReasonCounts, "INDEX_FILE_MISSING");
  } else {
    index = await readJson(SOURCE_INDEX_PATH);
    validateIndexPayload(index, indexCheck, blockReasonCounts);
  }

  const latestSourcePath = index?.latest?.path ?? null;
  if (!latestSourcePath) {
    increment(blockReasonCounts, "INDEX_LATEST_MISSING");
  } else if (!existsSync(path.resolve(ROOT, latestSourcePath))) {
    increment(blockReasonCounts, "LATEST_SOURCE_FILE_MISSING");
  } else {
    latestSource = await readJson(latestSourcePath);
    validateLatestSource(latestSource, index, blockReasonCounts);
  }

  const sourceSummary = latestSource?.summary ?? {};
  const sourceQuality = latestSource?.quality ?? {};
  const inventory = downstreamInventory();
  const summary = {
    sourceIndexPath: SOURCE_INDEX_PATH,
    latestSourcePath,
    latestDate: index?.latest?.date ?? null,
    indexCheckStatus: indexCheck.checkStatus,
    latestSourceCheckStatus:
      latestSource && Object.keys(blockReasonCounts).length === 0
        ? "PASS"
        : latestSource
          ? "FAIL"
          : "MISSING",
    sourceFileCount: index?.summary?.sourceFileCount ?? 0,
    indexedSourceCount: index?.summary?.indexedSourceCount ?? 0,
    totalRaceCount: index?.summary?.totalRaceCount ?? 0,
    totalStarterCount: index?.summary?.totalStarterCount ?? 0,
    latestRaceCount: sourceSummary.raceCount ?? 0,
    latestStarterCount: sourceSummary.starterCount ?? 0,
    registrationNoCompleteCount:
      sourceSummary.registrationNoCompleteCount ?? 0,
    blockedStarterRaceCount: sourceSummary.blockedStarterRaceCount ?? 0,
    identityKey: "registrationNo",
    raceJoinKeysAvailable: availableRaceJoinKeys(latestSource),
    starterJoinKeysAvailable: [
      "registrationNo",
      "race/date+venue+raceNumber+carNo",
    ],
    currentTodayCompatibilityStatus:
      await currentTodayCompatibilityStatus(latestSource),
    downstreamInventoryCount: inventory.length,
    blockReasonCounts,
    writesPerformed: false,
    racesModified: false,
    analyticsModified: false,
    reviewsModified: false,
    pageImplementationsModified: false,
    packageModified: false,
    fakeCompletionPerformed:
      sourceQuality.fakeCompletionPerformed === true,
    fuzzyMatchingPerformed:
      sourceQuality.fuzzyMatchingPerformed === true,
    resultLineupPredictionUsedAsStarterSource:
      sourceQuality.resultLineupPredictionUsedAsStarterSource === true,
  };
  summary.consumptionReadiness = buildReadiness(
    summary,
    blockReasonCounts,
  );
  const preview = buildPreviewCandidates(latestSource);
  printSummary(summary, preview, inventory);
  if (summary.consumptionReadiness.status !== "READY_FOR_KURARI_EX_STARTERS_CONSUMPTION_INTEGRATION") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(
    "[kurari-ex starters source index consumption dry-run] failed",
  );
  console.error(error);
  process.exitCode = 1;
});
