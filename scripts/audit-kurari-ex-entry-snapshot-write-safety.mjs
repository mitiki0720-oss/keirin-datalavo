import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const PUBLIC_ROOT = path.join(ROOT, "public");
const ENTRIES_FILE = path.join(
  PUBLIC_ROOT,
  "data",
  "races",
  "keirin-jp-entries.generated.json",
);
const SNAPSHOT_ROOT = path.join(
  PUBLIC_ROOT,
  "data",
  "races",
  "entries-history",
);
const INDEX_PATH = path.join(SNAPSHOT_ROOT, "index.generated.json");
const SNAPSHOT_SCHEMA_VERSION = "kurari-ex-entry-snapshot/v1";
const INDEX_SCHEMA_VERSION = "kurari-ex-entry-snapshot-index/v1";
const BRIDGE_VERSION = "kurari-ex-history-bridge/v1";
const SOURCE_NAME = "keirin-jp-entries";

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim();
}

function normalizeVenueName(value) {
  return normalizeText(value)
    .replace(/\s+/gu, "")
    .replace(/競輪場$/u, "")
    .replace(/競輪$/u, "");
}

function toInteger(value) {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  const text = normalizeText(value);
  if (!/^\d+$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function isValidRegistrationNo(value) {
  return /^\d{6}$/.test(normalizeText(value));
}

function increment(counter, key) {
  counter[key] = (counter[key] ?? 0) + 1;
}

function relativePath(file) {
  return path.relative(ROOT, file).replaceAll("\\", "/");
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function readJsonIfPresent(file) {
  if (!existsSync(file)) return null;
  return readJson(file);
}

function inspectEntries(entries, declaredCount) {
  const carNos = entries.map((entry) => toInteger(entry?.carNo));
  const registrationNos = entries.map((entry) =>
    normalizeText(entry?.registrationNo),
  );
  const blockedReasons = [];
  const entryParsed = entries.length > 0;
  const registrationComplete =
    entryParsed && registrationNos.every(isValidRegistrationNo);
  const carNoValid =
    entryParsed &&
    carNos.every(
      (carNo) => Number.isInteger(carNo) && carNo >= 1 && carNo <= 9,
    );
  const carNoUnique =
    carNoValid && new Set(carNos).size === entries.length;
  const registrationNoUnique =
    registrationComplete &&
    new Set(registrationNos).size === entries.length;
  const starterCountMatched =
    declaredCount > 0 && entries.length === declaredCount;

  if (!entryParsed) blockedReasons.push("ENTRIES_MISSING");
  if (!registrationComplete) {
    blockedReasons.push("REGISTRATION_NO_INCOMPLETE");
  }
  if (!carNoValid) blockedReasons.push("CAR_NO_INVALID");
  if (carNoValid && !carNoUnique) {
    blockedReasons.push("DUPLICATE_CAR_NO");
  }
  if (registrationComplete && !registrationNoUnique) {
    blockedReasons.push("DUPLICATE_REGISTRATION_NO");
  }
  if (!starterCountMatched) {
    blockedReasons.push("STARTER_COUNT_MISMATCH");
  }

  return {
    entryParsed,
    registrationComplete,
    carNoUnique,
    registrationNoUnique,
    starterCountMatched,
    joinKeyAvailable: false,
    blockedReasons,
    full: blockedReasons.length === 0,
  };
}

function flattenCurrentRaces(payload) {
  const races = [];
  for (const venue of Array.isArray(payload?.venues) ? payload.venues : []) {
    for (const race of Array.isArray(venue?.races) ? venue.races : []) {
      const entries = Array.isArray(race?.entries) ? race.entries : [];
      const starterCount =
        toInteger(race?.quality?.entryCount) ?? entries.length;
      const date = normalizeText(race?.date ?? venue?.date ?? payload?.date);
      const venueKey =
        normalizeText(
          race?.venueKey ?? venue?.venueKey ?? venue?.slug,
        ) || null;
      const venueName = normalizeVenueName(
        race?.venueName ?? venue?.venueName ?? venue?.venue,
      );
      const raceNumber = toInteger(race?.raceNumber ?? race?.raceNo);
      const quality = inspectEntries(entries, starterCount);
      quality.joinKeyAvailable = Boolean(
        (normalizeText(race?.raceId) ||
          normalizeText(race?.raceKey) ||
          (date && venueKey && raceNumber) ||
          (date && venueName && raceNumber)),
      );
      if (!quality.joinKeyAvailable) {
        quality.blockedReasons.push("SAFE_JOIN_KEY_MISSING");
        quality.full = false;
      }

      races.push({
        raceId: normalizeText(race?.raceId) || null,
        raceKey: normalizeText(race?.raceKey) || null,
        date,
        venueKey,
        venueName,
        raceNumber,
        starterCount,
        entries: entries.map((entry) => ({
          carNo: toInteger(entry?.carNo),
          name: normalizeText(entry?.name),
          registrationNo: normalizeText(entry?.registrationNo),
          prefecture: normalizeText(entry?.prefecture),
          age: toInteger(entry?.age),
          class: normalizeText(
            entry?.raceClass ?? entry?.previousClass,
          ),
          period: normalizeText(entry?.graduationTerm),
          style: normalizeText(entry?.style),
        })),
        quality: {
          entryParsed: quality.entryParsed,
          registrationComplete: quality.registrationComplete,
          carNoUnique: quality.carNoUnique,
          registrationNoUnique: quality.registrationNoUnique,
          starterCountMatched: quality.starterCountMatched,
          joinKeyAvailable: quality.joinKeyAvailable,
          blockedReasons: [...quality.blockedReasons],
          full: quality.full,
        },
      });
    }
  }
  return races;
}

function withoutGeneratedAt(value) {
  if (Array.isArray(value)) return value.map(withoutGeneratedAt);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "generatedAt")
      .map(([key, child]) => [key, withoutGeneratedAt(child)]),
  );
}

function canonicalString(value) {
  return JSON.stringify(withoutGeneratedAt(value));
}

function semanticHash(value) {
  return createHash("sha256").update(canonicalString(value)).digest("hex");
}

function hashPreview(value) {
  return `sha256:${semanticHash(value).slice(0, 20)}`;
}

function buildPayload(payload) {
  const races = flattenCurrentRaces(payload);
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    generatedAt: normalizeText(payload?.generatedAt),
    source: SOURCE_NAME,
    sourceMetadata: payload?.source ?? null,
    date: normalizeText(payload?.date),
    bridgeVersion: BRIDGE_VERSION,
    races,
  };
}

function auditEligibility(currentPayload, proposedPayload) {
  const dates = new Set(
    proposedPayload.races.map((race) => race.date).filter(Boolean),
  );
  const blockedReasonCounts = {};
  const sourceMetadataPresent =
    currentPayload?.source &&
    typeof currentPayload.source === "object" &&
    Object.keys(currentPayload.source).length > 0;
  const generatedAtPresent = Boolean(
    normalizeText(currentPayload?.generatedAt),
  );
  const passedChecks = [];
  const failedChecks = [];
  const check = (label, passed, reason) => {
    (passed ? passedChecks : failedChecks).push(label);
    if (!passed && reason) increment(blockedReasonCounts, reason);
  };

  check("entries date is exactly one day", dates.size === 1, "DATE_NOT_SINGLE");
  check(
    "race count > 0",
    proposedPayload.races.length > 0,
    "RACE_COUNT_ZERO",
  );
  const riderCount = proposedPayload.races.reduce(
    (total, race) => total + race.entries.length,
    0,
  );
  check("rider count > 0", riderCount > 0, "RIDER_COUNT_ZERO");
  check(
    "source metadata exists",
    Boolean(sourceMetadataPresent),
    "SOURCE_METADATA_MISSING",
  );
  check(
    "generatedAt exists",
    generatedAtPresent,
    "GENERATED_AT_MISSING",
  );
  check("fake completion is not used", true);

  let eligibleRaceCount = 0;
  let blockedRaceCount = 0;
  for (const race of proposedPayload.races) {
    if (race.quality.full) {
      eligibleRaceCount += 1;
    } else {
      blockedRaceCount += 1;
      for (const reason of race.quality.blockedReasons) {
        increment(blockedReasonCounts, reason);
      }
    }
  }
  check(
    "all races pass entry completeness",
    blockedRaceCount === 0,
    blockedRaceCount === 0 ? null : "RACE_QUALITY_BLOCKED",
  );

  return {
    writeEligibilityStatus:
      failedChecks.length === 0 ? "ELIGIBLE" : "BLOCKED",
    eligibleRaceCount,
    blockedRaceCount,
    blockedReasonCounts,
    eligibilityPassedChecks: passedChecks,
    eligibilityFailedChecks: failedChecks,
  };
}

function summarizePayload(payload) {
  const riderCount = payload.races.reduce(
    (total, race) => total + race.entries.length,
    0,
  );
  const fullRegistrationRaceCount = payload.races.filter(
    (race) => race.quality.full,
  ).length;
  return {
    raceCount: payload.races.length,
    riderCount,
    fullRegistrationRaceCount,
    blockedRaceCount: payload.races.length - fullRegistrationRaceCount,
  };
}

function compareGeneratedAt(currentValue, existingValue) {
  const current = Date.parse(normalizeText(currentValue));
  const existing = Date.parse(normalizeText(existingValue));
  if (!Number.isFinite(current) || !Number.isFinite(existing)) {
    return "unknown";
  }
  if (current < existing) return "older";
  if (current > existing) return "newer";
  return "same";
}

async function auditExistingSnapshot(
  snapshotPath,
  proposedPayload,
  eligibility,
) {
  const existing = await readJsonIfPresent(snapshotPath);
  if (!existing) {
    return {
      exists: false,
      existingRaceCount: null,
      existingRiderCount: null,
      existingFullRegistrationRaceCount: null,
      currentCompletenessVsExisting: "not-applicable",
      overwriteSafetyStatus: "NOT_APPLICABLE",
      overwriteBlockedReasons: [],
      writeIfChangedWouldWrite:
        eligibility.writeEligibilityStatus === "ELIGIBLE",
    };
  }

  const currentSummary = summarizePayload(proposedPayload);
  const existingSummary = summarizePayload({
    races: Array.isArray(existing.races) ? existing.races : [],
  });
  const reasons = [];
  if (existing.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
    reasons.push("SCHEMA_VERSION_MISMATCH");
  }
  if (currentSummary.raceCount < existingSummary.raceCount) {
    reasons.push("RACE_COUNT_REGRESSION");
  }
  if (
    currentSummary.fullRegistrationRaceCount <
    existingSummary.fullRegistrationRaceCount
  ) {
    reasons.push("FULL_REGISTRATION_RACE_COUNT_REGRESSION");
  }
  if (
    currentSummary.blockedRaceCount >
    existingSummary.blockedRaceCount
  ) {
    reasons.push("COMPLETENESS_DOWNGRADE");
  }
  if (
    compareGeneratedAt(
      proposedPayload.generatedAt,
      existing.generatedAt,
    ) === "older"
  ) {
    reasons.push("CURRENT_SOURCE_OLDER_THAN_EXISTING");
  }
  if (eligibility.writeEligibilityStatus !== "ELIGIBLE") {
    reasons.push("CURRENT_FEED_NOT_ELIGIBLE");
  }

  const sameHash = semanticHash(existing) === semanticHash(proposedPayload);
  let status = "SAFE_TO_WRITE";
  if (reasons.length > 0) status = "BLOCKED";
  else if (sameHash) status = "NO_WRITE_NEEDED";

  return {
    exists: true,
    existingRaceCount: existingSummary.raceCount,
    existingRiderCount: existingSummary.riderCount,
    existingFullRegistrationRaceCount:
      existingSummary.fullRegistrationRaceCount,
    currentCompletenessVsExisting:
      currentSummary.fullRegistrationRaceCount ===
        existingSummary.fullRegistrationRaceCount &&
      currentSummary.raceCount === existingSummary.raceCount
        ? "equal"
        : currentSummary.fullRegistrationRaceCount >=
              existingSummary.fullRegistrationRaceCount &&
            currentSummary.raceCount >= existingSummary.raceCount
          ? "current-equal-or-better"
          : "current-worse",
    overwriteSafetyStatus: status,
    overwriteBlockedReasons: reasons,
    writeIfChangedWouldWrite: status === "SAFE_TO_WRITE" && !sameHash,
  };
}

function payloadQualitySummary(payload) {
  const flags = [
    "entryParsed",
    "registrationComplete",
    "carNoUnique",
    "registrationNoUnique",
    "starterCountMatched",
    "joinKeyAvailable",
  ];
  return Object.fromEntries(
    flags.map((flag) => [
      flag,
      payload.races.filter((race) => race.quality[flag] === true).length,
    ]),
  );
}

function createIndexSchema(
  proposedSnapshotPath,
  proposedPayload,
  payloadSummary,
) {
  return {
    schemaVersion: INDEX_SCHEMA_VERSION,
    generatedAt: "<index update timestamp>",
    snapshots: [
      {
        date: proposedPayload.date,
        path: relativePath(proposedSnapshotPath),
        raceCount: payloadSummary.raceCount,
        riderCount: payloadSummary.riderCount,
        fullRegistrationRaceCount:
          payloadSummary.fullRegistrationRaceCount,
        blockedRaceCount: payloadSummary.blockedRaceCount,
        contentHash: semanticHash(proposedPayload),
        sourceGeneratedAt: proposedPayload.generatedAt,
      },
    ],
  };
}

const EXISTING_SNAPSHOT_PROTECTION_RULES = [
  "registrationCompleteな既存snapshotを不完全current feedで上書きしない。",
  "existing raceCount > current raceCountならblockedまたはmanual確認。",
  "current full race count < existing full race countならblocked。",
  "current generatedAtがexistingより古ければblocked。",
  "schemaVersion不一致はmigrationなしで上書きしない。",
  "semantic content hashが同一ならwriteしない。",
  "hashが異なる場合もcurrent完全性が同等以上のときだけwrite候補にする。",
];

const WRITE_INVARIANTS = [
  "same semantic input produces the same canonical payload; generatedAt is excluded from semantic hash comparison",
  "semantic content hash is stable",
  "no write when semantic content is unchanged",
  "no completeness downgrade overwrite",
  "no incomplete current feed overwrite",
  "no fake completion",
  "no write under public/data/analytics, public/data/reviews, private-input, dog/reviews, or scripts/debug",
  "snapshot stores explicit source metadata",
  "snapshot stores explicit bridgeVersion",
  "each race stores explicit quality flags and blockedReasons",
  "snapshot write uses a same-directory temporary file plus atomic rename; direct partial write is prohibited",
];

const INDEX_UPDATE_RULES = [
  "snapshot write成功後だけindex候補を更新する。",
  "dateは一意とし、同日entryは置換前に完全性を比較する。",
  "snapshot path・件数・semantic content hash・sourceGeneratedAtを保存する。",
  "snapshotがNO_WRITE_NEEDEDならindexも不要なtimestamp更新をしない。",
];

const INDEX_OVERWRITE_PROTECTION_RULES = [
  "既存日付entryを低いrace/full countで置換しない。",
  "存在しないsnapshot pathをindexへ追加しない。",
  "snapshot hashとindex hashが不一致ならblocked。",
  "index全体をwrite-if-changedし、既存他日entryを削除しない。",
];

function evaluateReadiness(
  eligibility,
  payloadSummary,
  payloadRaceCount,
  protectionRules,
  invariants,
) {
  const checks = [
    {
      label: "writeEligibilityStatus === ELIGIBLE",
      passed: eligibility.writeEligibilityStatus === "ELIGIBLE",
    },
    {
      label:
        "proposedPayloadFullRegistrationRaceCount === proposedPayloadRaceCount",
      passed:
        payloadSummary.fullRegistrationRaceCount === payloadRaceCount,
    },
    {
      label: "proposedPayloadBlockedRaceCount === 0",
      passed: payloadSummary.blockedRaceCount === 0,
    },
    { label: "fakeCompletionPerformed === false", passed: true },
    { label: "writesPerformed === false", passed: true },
    {
      label: "existing snapshot protection rules are defined",
      passed: protectionRules.length > 0,
    },
    {
      label: "write-if-changed invariants are defined",
      passed: invariants.length > 0,
    },
  ];
  const passedChecks = checks
    .filter((check) => check.passed)
    .map((check) => check.label);
  const failedChecks = checks
    .filter((check) => !check.passed)
    .map((check) => check.label);
  return {
    status:
      failedChecks.length === 0
        ? "READY_FOR_SNAPSHOT_WRITE_IMPLEMENTATION"
        : "BLOCKED",
    passedChecks,
    failedChecks,
    nextRecommendedAction:
      failedChecks.length === 0
        ? "snapshot専用payload builder・完全性比較・atomic write-if-changedを最小実装し、current feedとは別pathへ1日分だけ保存する実装を次優先で行う。"
        : "eligibilityまたは保護ルールのfailed checkを解消し、writeなし監査を再実行する。",
  };
}

function printSection(label, value) {
  console.log(`\n[${label}]`);
  console.log(JSON.stringify(value, null, 2));
}

async function main() {
  const currentPayload = await readJson(ENTRIES_FILE);
  const proposedPayload = buildPayload(currentPayload);
  const proposedDate = proposedPayload.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(proposedDate)) {
    throw new Error(`invalid current entries date: ${proposedDate}`);
  }

  const proposedSnapshotPath = path.join(
    SNAPSHOT_ROOT,
    proposedDate,
    "keirin-jp-entries.generated.json",
  );
  const parentDirectory = path.dirname(proposedSnapshotPath);
  const pathAudit = {
    proposedSnapshotDate: proposedDate,
    proposedSnapshotPath: relativePath(proposedSnapshotPath),
    proposedIndexPath: relativePath(INDEX_PATH),
    pathAlreadyExists: existsSync(proposedSnapshotPath),
    indexAlreadyExists: existsSync(INDEX_PATH),
    parentDirAlreadyExists: existsSync(parentDirectory),
    wouldCreateDirectory: !existsSync(parentDirectory),
    wouldCreateSnapshotFile: !existsSync(proposedSnapshotPath),
    wouldUpdateIndexFile: false,
  };

  const eligibility = auditEligibility(
    currentPayload,
    proposedPayload,
  );
  const existingSnapshotAudit = await auditExistingSnapshot(
    proposedSnapshotPath,
    proposedPayload,
    eligibility,
  );
  const payloadSummary = summarizePayload(proposedPayload);
  const proposedPayloadHashPreview = hashPreview(proposedPayload);
  const proposedPayloadSample = proposedPayload.races
    .slice(0, 2)
    .map((race) => ({
      ...race,
      entries: race.entries.slice(0, 2),
      omittedEntryCount: Math.max(0, race.entries.length - 2),
    }));
  const proposedIndexSchema = createIndexSchema(
    proposedSnapshotPath,
    proposedPayload,
    payloadSummary,
  );
  const snapshotWriteReadiness = evaluateReadiness(
    eligibility,
    payloadSummary,
    proposedPayload.races.length,
    EXISTING_SNAPSHOT_PROTECTION_RULES,
    WRITE_INVARIANTS,
  );

  const summary = {
    ...pathAudit,
    ...eligibility,
    existingSnapshotAudit,
    proposedPayloadSchemaVersion: proposedPayload.schemaVersion,
    proposedPayloadRaceCount: payloadSummary.raceCount,
    proposedPayloadRiderCount: payloadSummary.riderCount,
    proposedPayloadFullRegistrationRaceCount:
      payloadSummary.fullRegistrationRaceCount,
    proposedPayloadBlockedRaceCount: payloadSummary.blockedRaceCount,
    proposedPayloadQualitySummary:
      payloadQualitySummary(proposedPayload),
    proposedPayloadSample,
    proposedPayloadHashPreview,
    indexRecommended: true,
    proposedIndexPath: relativePath(INDEX_PATH),
    proposedIndexSchema,
    indexUpdateRules: INDEX_UPDATE_RULES,
    indexOverwriteProtectionRules:
      INDEX_OVERWRITE_PROTECTION_RULES,
    existingSnapshotProtectionRules:
      EXISTING_SNAPSHOT_PROTECTION_RULES,
    writeInvariants: WRITE_INVARIANTS,
    existingWriteHelperAudit: {
      semanticTimestampReuseAvailable: true,
      writeIfChangedAvailable: true,
      createsParentDirectory: true,
      atomicRenameAvailable: false,
      observation:
        "scripts/lib/write-json-if-changed.mjsは内容比較・generatedAt再利用に対応するが、writeFileSyncによる直接writeでatomic renameは行わない。",
    },
    scriptsToChangeNext: [
      "scripts/update-keirin-jp-entries.mjs",
      "scripts/check-keirin-jp-entries.mjs",
      "scripts/lib/write-json-if-changed.mjs（atomic helperを追加する場合のみ）",
    ],
    functionsToAddNext: [
      "buildEntrySnapshotPayload",
      "validateEntrySnapshotPayload",
      "compareSnapshotCompleteness",
      "writeAtomicJsonIfChanged",
    ],
    dataFilesToCreateNext: [
      relativePath(proposedSnapshotPath),
      `${relativePath(INDEX_PATH)}（index実装は別優先でも可）`,
    ],
    dataFilesNotToTouch: [
      "public/data/races/keirin-jp-entries.generated.json（current feedの既存挙動）",
      "public/data/analytics/kurari-ex/**",
      "public/data/reviews/**",
      "private-input/**",
      "dog/reviews/**",
      "scripts/debug/**",
    ],
    dryRunCommandToKeep:
      "node scripts/audit-kurari-ex-entry-snapshot-write-safety.mjs",
    checksToRunAfterImplementation: [
      "snapshot checker",
      "same input rerun => NO_WRITE_NEEDED",
      "incomplete fixture => overwrite BLOCKED",
      "older generatedAt fixture => overwrite BLOCKED",
      "Node22 TypeScript/Vite build",
      "git diff --check",
    ],
    riskAudit: {
      incompleteCurrentFeedRisk:
        "取得失敗raceを含むcurrent feedをsnapshot化すると履歴sourceが欠落する。",
      overwriteCompleteSnapshotRisk:
        "既存完全snapshotをrace/full countの低いpayloadで置換すると不可逆な退行になる。",
      generatedAtHashInstabilityRisk:
        "generatedAtをsemantic hashへ含めると同一内容でも毎回差分になるため、hash比較から除外する。",
      gitSizeGrowthRisk:
        "日別entriesは継続増加するため、indexとサイズ監査が必要。",
      venueKeyMissingRisk:
        "現行entriesにvenueKeyがなく、会場名fallback依存。snapshot実装時に公式codeからcanonical keyを安全に保存する設計が必要。",
      raceIdMissingRisk:
        "現行entriesにraceId/raceKeyがなく、date+venueName+raceNumberより強いjoin keyを保存できていない。",
      currentFeedVsSnapshotConfusionRisk:
        "current feedと日別snapshotを別path・別schemaVersionで明確に分離する。",
      protectedPathRisk:
        "snapshotはpublic/data/races/entries-history配下だけに限定し、analytics/reviews等へ書かない。",
      atomicWriteRisk:
        "既存helperは直接writeするため、中断時の部分ファイルを避けるatomic temp+rename helperが必要。",
      mitigation:
        "完全性比較、semantic hash、no-downgrade、write-if-changed、same-directory atomic rename、source/bridgeVersion/quality保存を必須にする。",
    },
    snapshotWriteReadiness,
    nextRecommendedAction:
      snapshotWriteReadiness.nextRecommendedAction,
    writesPerformed: false,
    identityFallbackUsed: false,
    fakeCompletionPerformed: false,
    productionJsonGenerated: false,
  };

  console.log("[kurari-ex entry snapshot write safety audit]");
  console.log("writesPerformed: false");
  console.log("identityFallbackUsed: false");
  console.log("fakeCompletionPerformed: false");
  console.log("productionJsonGenerated: false");
  console.log(
    "policy: 仮想payload・hash・overwrite判定だけを行い、directory・snapshot・indexを作成しない。",
  );

  console.log("\n[summary]");
  const summaryKeys = [
    "proposedSnapshotDate",
    "proposedSnapshotPath",
    "pathAlreadyExists",
    "writeEligibilityStatus",
    "eligibleRaceCount",
    "blockedRaceCount",
    "proposedPayloadRaceCount",
    "proposedPayloadRiderCount",
    "proposedPayloadFullRegistrationRaceCount",
    "proposedPayloadBlockedRaceCount",
    "proposedPayloadHashPreview",
    "indexRecommended",
    "proposedIndexPath",
  ];
  for (const key of summaryKeys) {
    console.log(`${key}: ${summary[key]}`);
  }
  console.log(
    `blockedReasonCounts: ${JSON.stringify(summary.blockedReasonCounts)}`,
  );

  printSection("proposedWriteTarget", pathAudit);
  printSection("writeEligibility", eligibility);
  printSection("existingSnapshotAudit", existingSnapshotAudit);
  printSection("proposedPayloadDryBuild", {
    proposedPayloadSchemaVersion:
      summary.proposedPayloadSchemaVersion,
    proposedPayloadRaceCount: summary.proposedPayloadRaceCount,
    proposedPayloadRiderCount: summary.proposedPayloadRiderCount,
    proposedPayloadFullRegistrationRaceCount:
      summary.proposedPayloadFullRegistrationRaceCount,
    proposedPayloadBlockedRaceCount:
      summary.proposedPayloadBlockedRaceCount,
    proposedPayloadQualitySummary:
      summary.proposedPayloadQualitySummary,
    proposedPayloadSample: summary.proposedPayloadSample,
    proposedPayloadHashPreview:
      summary.proposedPayloadHashPreview,
  });
  printSection("indexDesign", {
    indexRecommended: summary.indexRecommended,
    proposedIndexPath: summary.proposedIndexPath,
    proposedIndexSchema: summary.proposedIndexSchema,
    indexUpdateRules: summary.indexUpdateRules,
    indexOverwriteProtectionRules:
      summary.indexOverwriteProtectionRules,
  });
  printSection("writeInvariants", summary.writeInvariants);
  printSection("scriptChangePlan", {
    scriptsToChangeNext: summary.scriptsToChangeNext,
    functionsToAddNext: summary.functionsToAddNext,
    dataFilesToCreateNext: summary.dataFilesToCreateNext,
    dataFilesNotToTouch: summary.dataFilesNotToTouch,
    dryRunCommandToKeep: summary.dryRunCommandToKeep,
    checksToRunAfterImplementation:
      summary.checksToRunAfterImplementation,
  });
  printSection("riskAudit", summary.riskAudit);
  printSection("snapshotWriteReadiness", snapshotWriteReadiness);
  printSection("jsonSummary", summary);
}

main().catch((error) => {
  console.error("[kurari-ex entry snapshot write safety audit] failed");
  console.error(error);
  process.exitCode = 1;
});
