import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const PUBLIC_ROOT = path.join(ROOT, "public");
const KURARI_EX_ROOT = path.join(
  PUBLIC_ROOT,
  "data",
  "analytics",
  "kurari-ex",
);
const HISTORY_ROOT = path.join(KURARI_EX_ROOT, "history");
const EXACT_ROOT = path.join(KURARI_EX_ROOT, "exact");

const HISTORY_INDEX_FILE = path.join(HISTORY_ROOT, "index.generated.json");
const HISTORY_STATUS_FILE = path.join(HISTORY_ROOT, "status.generated.json");
const OFFICIAL_IDENTITY_FILE = path.join(
  EXACT_ROOT,
  "official-rider-identity.generated.json",
);
const RIDER_MASTER_FILE = path.join(
  EXACT_ROOT,
  "rider-master.generated.json",
);
const EXACT_INDEX_FILE = path.join(EXACT_ROOT, "index.generated.json");
const RIDER_INDEX_FILE = path.join(
  EXACT_ROOT,
  "riders",
  "index.generated.json",
);

const EXAMPLE_LIMIT = 5;
const TOP_LIMIT = 15;

const STARTER_LIKE_KEYS = new Set([
  "starters",
  "players",
  "riders",
  "entries",
  "lineupPlayers",
  "resultRows",
  "predictionPlayers",
  "members",
  "contestants",
]);

const REGISTRATION_LIKE_KEYS = new Set([
  "registrationNo",
  "registrationNumber",
  "playerRegistrationNo",
  "racerNo",
  "riderNo",
  "playerId",
  "playerID",
  "riderId",
  "racerId",
  "id",
]);

const SOURCE_CANDIDATE = {
  REGISTRATION_BEARING: "HAS_REGISTRATION_BEARING_STARTER_SOURCE",
  STARTER_NAMES_ONLY: "HAS_STARTER_NAMES_ONLY",
  LINEUP_CAR_NO_ONLY: "HAS_LINEUP_CAR_NO_ONLY",
  RESULT_NAMES_ONLY: "HAS_RESULT_NAMES_ONLY",
  PREDICTION_ONLY: "HAS_PREDICTION_PAYLOAD_ONLY",
  SOURCE_MISSING: "SOURCE_MISSING",
  UPSTREAM_FIX: "NEEDS_UPSTREAM_IMPORT_FIX",
  NOT_SAFE: "NOT_SAFE_FOR_BACKFILL",
};

const SAFETY_CLASS = {
  SAFE_BACKFILL: "safeBackfillCandidate",
  UPSTREAM_FIX: "upstreamImporterFixCandidate",
  IDENTITY_NEEDED: "identityResolutionNeeded",
  SOURCE_MISSING: "sourceMissing",
};

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim();
}

function isValidRegistrationNo(value) {
  return /^\d{6}$/.test(normalizeText(value));
}

function toInteger(value) {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  const text = normalizeText(value);
  if (!/^\d+$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function extractCarNo(value) {
  if (typeof value === "number" || typeof value === "string") {
    return toInteger(value);
  }
  if (!value || typeof value !== "object") return null;
  return (
    toInteger(value.carNo) ??
    toInteger(value.vehicleNo) ??
    toInteger(value.number) ??
    null
  );
}

function increment(counter, key, amount = 1) {
  const normalized = normalizeText(key) || "(unknown)";
  counter[normalized] = (counter[normalized] ?? 0) + amount;
}

function incrementNested(counter, outerKey, innerKey) {
  const normalizedOuter = normalizeText(outerKey) || "(unknown)";
  counter[normalizedOuter] ??= {};
  increment(counter[normalizedOuter], innerKey);
}

function sortedCounter(counter, limit = null) {
  const entries = Object.entries(counter).sort(
    ([leftKey, leftValue], [rightKey, rightValue]) =>
      rightValue - leftValue || leftKey.localeCompare(rightKey, "ja"),
  );
  return Object.fromEntries(
    limit === null ? entries : entries.slice(0, limit),
  );
}

function sortNestedCounters(counter, outerLimit = null) {
  const sortedOuter = Object.entries(counter).sort(([left], [right]) =>
    left.localeCompare(right, "ja"),
  );
  return Object.fromEntries(
    (outerLimit === null ? sortedOuter : sortedOuter.slice(0, outerLimit)).map(
      ([key, value]) => [key, sortedCounter(value)],
    ),
  );
}

function toPublicFile(fileValue, requiredRoot) {
  const relative = normalizeText(fileValue).replace(/^\/+/, "");
  const resolved = path.resolve(PUBLIC_ROOT, relative);
  const scope = path.resolve(requiredRoot);
  if (resolved !== scope && !resolved.startsWith(`${scope}${path.sep}`)) {
    throw new Error(`out-of-scope source file: ${fileValue}`);
  }
  return resolved;
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function raceReference(race) {
  return (
    normalizeText(race?.raceId) ||
    normalizeText(race?.raceKey) ||
    "(missing race reference)"
  );
}

function raceVenue(race) {
  return (
    normalizeText(race?.venueName) ||
    normalizeText(race?.venueKey) ||
    "(unknown venue)"
  );
}

function raceMonth(race) {
  const date = normalizeText(race?.date);
  return /^\d{4}-\d{2}/.test(date) ? date.slice(0, 7) : "(unknown month)";
}

function hasPrediction(race) {
  const prediction = race?.prediction;
  if (!prediction || typeof prediction !== "object") return false;
  return (
    (Array.isArray(prediction.trifectaTickets) &&
      prediction.trifectaTickets.length > 0) ||
    (Array.isArray(prediction.exactaTickets) &&
      prediction.exactaTickets.length > 0) ||
    (Array.isArray(prediction.tags) && prediction.tags.length > 0) ||
    normalizeText(prediction.confidence).length > 0 ||
    normalizeText(prediction.raceType).length > 0
  );
}

function hasResult(race) {
  const result = race?.result;
  if (!result || typeof result !== "object") return false;
  return (
    normalizeText(result.status).length > 0 ||
    extractCarNo(result.first) !== null ||
    normalizeText(result?.trifecta?.combination).length > 0 ||
    Number.isFinite(result?.trifecta?.payoutYen)
  );
}

function resultRiders(race) {
  return [
    race?.result?.first,
    race?.result?.second,
    race?.result?.third,
    race?.result?.sRider,
    race?.result?.bRider,
  ].filter((value) => value && typeof value === "object");
}

function hasResultNames(race) {
  return resultRiders(race).some(
    (rider) =>
      extractCarNo(rider) !== null && normalizeText(rider.name).length > 0,
  );
}

function hasLineupCarNos(race) {
  const lines = race?.lineup?.lines;
  if (!Array.isArray(lines) || lines.length === 0) return false;
  const members = lines.flatMap((line) => (Array.isArray(line) ? line : []));
  return (
    members.length > 0 &&
    members.every((member) => {
      const carNo = extractCarNo(member);
      return Number.isInteger(carNo) && carNo > 0;
    })
  );
}

function collectObjectShape(
  value,
  pathPrefix,
  shape,
  visited = new Set(),
) {
  if (!value || typeof value !== "object" || visited.has(value)) return;
  visited.add(value);

  for (const [key, child] of Object.entries(value)) {
    const childPath = pathPrefix ? `${pathPrefix}.${key}` : key;
    if (STARTER_LIKE_KEYS.has(key)) {
      increment(shape.starterLikeKeyCounts, childPath);
    }
    if (REGISTRATION_LIKE_KEYS.has(key)) {
      increment(shape.registrationLikeKeyCounts, childPath);
    }
    if (Array.isArray(child)) {
      const arrayState =
        child.length === 0 ? "empty" : `non-empty(${child.length})`;
      increment(shape.arrayShapeCounts, `${childPath}:${arrayState}`);
      for (const item of child) {
        collectObjectShape(item, `${childPath}[]`, shape, visited);
      }
    } else {
      collectObjectShape(child, childPath, shape, visited);
    }
  }
}

function collectSectionKeys(race, summary) {
  for (const key of Object.keys(race)) {
    increment(summary.noStartersTopLevelKeyCounts, key);
  }
  for (const key of Object.keys(race?.quality ?? {})) {
    increment(summary.noStartersCoverageKeyCounts, `quality.${key}`);
  }
  for (const key of Object.keys(race?.predictionEnrichment ?? {})) {
    increment(
      summary.noStartersCoverageKeyCounts,
      `predictionEnrichment.${key}`,
    );
  }
  for (const key of Object.keys(race?.prediction ?? {})) {
    increment(summary.noStartersPredictionKeyCounts, key);
  }
  for (const key of Object.keys(race?.result ?? {})) {
    increment(summary.noStartersResultKeyCounts, key);
  }
  for (const key of Object.keys(race?.lineup ?? {})) {
    increment(summary.noStartersLineupKeyCounts, key);
  }
  collectObjectShape(race, "", {
    starterLikeKeyCounts: summary.noStartersStarterLikeKeyCounts,
    registrationLikeKeyCounts:
      summary.noStartersRegistrationLikeKeyCounts,
    arrayShapeCounts: summary.noStartersArrayShapeCounts,
  });
}

function findStarterLikeArrays(value, pathPrefix = "", found = []) {
  if (!value || typeof value !== "object") return found;
  for (const [key, child] of Object.entries(value)) {
    const childPath = pathPrefix ? `${pathPrefix}.${key}` : key;
    if (
      STARTER_LIKE_KEYS.has(key) &&
      Array.isArray(child) &&
      key !== "starters"
    ) {
      found.push({ path: childPath, items: child });
    }
    if (Array.isArray(child)) {
      for (const item of child) {
        findStarterLikeArrays(item, `${childPath}[]`, found);
      }
    } else {
      findStarterLikeArrays(child, childPath, found);
    }
  }
  return found;
}

function inspectStarterLikeArray(candidate, declaredStarterCount) {
  const items = candidate.items.filter(
    (item) => item && typeof item === "object",
  );
  const normalized = items.map((item) => ({
    carNo: extractCarNo(item),
    name: normalizeText(item.name ?? item.fullName),
    registrationNo: normalizeText(
      item.registrationNo ??
        item.registrationNumber ??
        item.playerRegistrationNo ??
        item.racerNo ??
        item.riderNo,
    ),
  }));
  const hasNamesAndCarNos =
    normalized.length > 0 &&
    normalized.every(
      (item) => Number.isInteger(item.carNo) && item.name.length > 0,
    );
  const completeRegistration =
    normalized.length > 0 &&
    normalized.every(
      (item) =>
        Number.isInteger(item.carNo) &&
        isValidRegistrationNo(item.registrationNo),
    );
  const uniqueCarNos =
    new Set(normalized.map((item) => item.carNo)).size === normalized.length;
  const completeCount =
    declaredStarterCount > 0 &&
    normalized.length === declaredStarterCount;
  return {
    path: candidate.path,
    itemCount: normalized.length,
    hasNamesAndCarNos,
    completeRegistration,
    safeComplete:
      completeRegistration && uniqueCarNos && completeCount,
  };
}

function classifyRace(race) {
  const declaredStarterCount = toInteger(race?.starterCount) ?? 0;
  const candidateArrays = findStarterLikeArrays(race).map((candidate) =>
    inspectStarterLikeArray(candidate, declaredStarterCount),
  );
  const safeRegistrationSource = candidateArrays.find(
    (candidate) => candidate.safeComplete,
  );
  const namesOnlySource = candidateArrays.find(
    (candidate) =>
      candidate.hasNamesAndCarNos && !candidate.completeRegistration,
  );
  const lineupCarNos = hasLineupCarNos(race);
  const resultNames = hasResultNames(race);
  const predictionPayload = hasPrediction(race);
  const resultPayload = hasResult(race);
  const hasAnySourceShape =
    candidateArrays.length > 0 ||
    lineupCarNos ||
    resultNames ||
    predictionPayload ||
    resultPayload;

  const sourceTypes = [];
  if (safeRegistrationSource) {
    sourceTypes.push(SOURCE_CANDIDATE.REGISTRATION_BEARING);
  }
  if (namesOnlySource) {
    sourceTypes.push(SOURCE_CANDIDATE.STARTER_NAMES_ONLY);
  }
  if (lineupCarNos) {
    sourceTypes.push(SOURCE_CANDIDATE.LINEUP_CAR_NO_ONLY);
  }
  if (resultNames) {
    sourceTypes.push(SOURCE_CANDIDATE.RESULT_NAMES_ONLY);
  }
  if (predictionPayload) {
    sourceTypes.push(SOURCE_CANDIDATE.PREDICTION_ONLY);
  }
  if (!hasAnySourceShape) {
    sourceTypes.push(SOURCE_CANDIDATE.SOURCE_MISSING);
  }

  let safetyClass;
  if (safeRegistrationSource) {
    safetyClass = SAFETY_CLASS.SAFE_BACKFILL;
  } else if (namesOnlySource || resultNames) {
    safetyClass = SAFETY_CLASS.IDENTITY_NEEDED;
  } else if (hasAnySourceShape) {
    safetyClass = SAFETY_CLASS.UPSTREAM_FIX;
  } else {
    safetyClass = SAFETY_CLASS.SOURCE_MISSING;
  }

  if (!safeRegistrationSource && hasAnySourceShape) {
    sourceTypes.push(SOURCE_CANDIDATE.UPSTREAM_FIX);
  }
  if (!safeRegistrationSource) {
    sourceTypes.push(SOURCE_CANDIDATE.NOT_SAFE);
  }

  return {
    declaredStarterCount,
    candidateArrays,
    safeRegistrationSource,
    namesOnlySource,
    lineupCarNos,
    resultNames,
    predictionPayload,
    resultPayload,
    sourceTypes,
    safetyClass,
  };
}

function createExample(race, classification) {
  const availableFields = [
    classification.candidateArrays.length > 0
      ? `starter-like:${classification.candidateArrays
          .map((candidate) => candidate.path)
          .join(",")}`
      : null,
    classification.lineupCarNos ? "lineup.lines.carNo" : null,
    classification.resultNames ? "result carNo/name" : null,
    classification.predictionPayload ? "prediction payload" : null,
    classification.resultPayload ? "result payload" : null,
  ].filter(Boolean);

  const explanations = {
    [SAFETY_CLASS.SAFE_BACKFILL]:
      "同一race内に全車分の車番・保存済みregistrationNoを持つ配列がある。今回は保存しない。",
    [SAFETY_CLASS.IDENTITY_NEEDED]:
      "車番・名前はあるが保存済みregistrationNoがない。名前照合は禁止のためbackfill不可。",
    [SAFETY_CLASS.UPSTREAM_FIX]:
      "予想・結果・lineup等はあるが、全出走者のregistrationNo付きsourceがない。",
    [SAFETY_CLASS.SOURCE_MISSING]:
      "starter候補として確認できるsource fieldがrace内にない。",
  };
  const nextActions = {
    [SAFETY_CLASS.SAFE_BACKFILL]:
      "専用のwrite前検証を別工程で設計する。",
    [SAFETY_CLASS.IDENTITY_NEEDED]:
      "上流取得時に公式registrationNo付き全出走者を保存する。",
    [SAFETY_CLASS.UPSTREAM_FIX]:
      "上流race.riders相当の取得・history受け渡しを確認する。",
    [SAFETY_CLASS.SOURCE_MISSING]:
      "登録番号付き公式出走表sourceの取得工程を追加する。",
  };

  return {
    raceKey: raceReference(race),
    date: normalizeText(race?.date) || "(unknown date)",
    venue: raceVenue(race),
    raceNo: toInteger(race?.raceNumber),
    declaredStarterCount: classification.declaredStarterCount,
    detectedCandidateType: classification.safetyClass,
    availableFields,
    whySafeOrBlocked: explanations[classification.safetyClass],
    nextAction: nextActions[classification.safetyClass],
  };
}

function addExample(summary, race, classification) {
  const targets = {
    [SAFETY_CLASS.SAFE_BACKFILL]: summary.safeBackfillExamples,
    [SAFETY_CLASS.UPSTREAM_FIX]: summary.upstreamImporterFixExamples,
    [SAFETY_CLASS.IDENTITY_NEEDED]:
      summary.identityResolutionNeededExamples,
    [SAFETY_CLASS.SOURCE_MISSING]: summary.sourceMissingExamples,
  };
  const target = targets[classification.safetyClass];
  if (target.length < EXAMPLE_LIMIT) {
    target.push(createExample(race, classification));
  }
}

function recursiveKeyExists(value, keyName) {
  if (!value || typeof value !== "object") return false;
  if (Object.hasOwn(value, keyName)) return true;
  return Object.values(value).some((child) =>
    recursiveKeyExists(child, keyName),
  );
}

async function inspectExactSources(exactIndex, riderIndex) {
  const riderFiles = Array.isArray(riderIndex.items)
    ? riderIndex.items
        .slice(0, 3)
        .map((item) => toPublicFile(item.file, path.join(EXACT_ROOT, "riders")))
    : [];
  const venueFiles = Array.isArray(exactIndex.files)
    ? exactIndex.files
        .filter((file) => normalizeText(file).includes("/exact/venues/"))
        .slice(0, 3)
        .map((file) => toPublicFile(file, path.join(EXACT_ROOT, "venues")))
    : [];
  const samples = await Promise.all(
    [...riderFiles, ...venueFiles].map(readJson),
  );
  return {
    riderSampleCount: riderFiles.length,
    venueSampleCount: venueFiles.length,
    sampleWithRaceKey: samples.filter((sample) =>
      recursiveKeyExists(sample, "raceKey"),
    ).length,
    sampleWithStarters: samples.filter((sample) =>
      recursiveKeyExists(sample, "starters"),
    ).length,
    conclusion:
      "EXACTサンプルは登録番号別・会場別の集計であり、NO_STARTERS raceへ全出走者を安全に結合するraceKey付きstarter配列は確認できない。",
  };
}

function createSummary(sourceDatasetAudit) {
  return {
    inspectedRaceCount: 0,
    noStartersRaceCount: 0,
    noStartersByMonth: {},
    noStartersByVenue: {},
    noStartersByDate: {},
    noStartersCoverage: {
      declaredStarterCountPresent: 0,
      declaredStarterCountMissing: 0,
      lineupLinesPresent: 0,
      lineupLinesMissing: 0,
      predictionPresent: 0,
      predictionMissing: 0,
      resultPresent: 0,
      resultMissing: 0,
    },
    sourceCandidateCounts: {},
    improvementSafetyCounts: {
      safeBackfillCandidate: 0,
      upstreamImporterFixCandidate: 0,
      identityResolutionNeeded: 0,
      sourceMissing: 0,
    },
    byMonthSourceCandidateCounts: {},
    byVenueSourceCandidateCounts: {},
    noStartersTopLevelKeyCounts: {},
    noStartersCoverageKeyCounts: {},
    noStartersPredictionKeyCounts: {},
    noStartersResultKeyCounts: {},
    noStartersLineupKeyCounts: {},
    noStartersStarterLikeKeyCounts: {},
    noStartersRegistrationLikeKeyCounts: {},
    noStartersArrayShapeCounts: {},
    qualityShapeCounts: {},
    dateBoundaries: {
      noStartersFirstDate: null,
      noStartersLastDate: null,
      starterArrayFirstDate: null,
      starterArrayLastDate: null,
    },
    safeBackfillExamples: [],
    upstreamImporterFixExamples: [],
    identityResolutionNeededExamples: [],
    sourceMissingExamples: [],
    exactSourceAudit: sourceDatasetAudit,
    upstreamFixHints: {},
    writesPerformed: false,
    identityFallbackUsed: false,
    fakeCompletionPerformed: false,
    productionJsonGenerated: false,
  };
}

function updateDateBoundary(summary, date, isNoStarters) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  const prefix = isNoStarters ? "noStarters" : "starterArray";
  const firstKey = `${prefix}FirstDate`;
  const lastKey = `${prefix}LastDate`;
  if (!summary.dateBoundaries[firstKey] || date < summary.dateBoundaries[firstKey]) {
    summary.dateBoundaries[firstKey] = date;
  }
  if (!summary.dateBoundaries[lastKey] || date > summary.dateBoundaries[lastKey]) {
    summary.dateBoundaries[lastKey] = date;
  }
}

function finalizeSummary(summary, historyStatus, identity, riderMaster) {
  const fullCounters = [
    "noStartersByMonth",
    "sourceCandidateCounts",
    "noStartersTopLevelKeyCounts",
    "noStartersCoverageKeyCounts",
    "noStartersPredictionKeyCounts",
    "noStartersResultKeyCounts",
    "noStartersLineupKeyCounts",
    "noStartersStarterLikeKeyCounts",
    "noStartersRegistrationLikeKeyCounts",
    "qualityShapeCounts",
  ];
  for (const key of fullCounters) {
    summary[key] = sortedCounter(summary[key]);
  }
  summary.noStartersByVenue = sortedCounter(
    summary.noStartersByVenue,
    TOP_LIMIT,
  );
  summary.noStartersByDate = sortedCounter(
    summary.noStartersByDate,
    TOP_LIMIT,
  );
  summary.noStartersArrayShapeCounts = sortedCounter(
    summary.noStartersArrayShapeCounts,
    30,
  );
  summary.byMonthSourceCandidateCounts = sortNestedCounters(
    summary.byMonthSourceCandidateCounts,
  );
  summary.byVenueSourceCandidateCounts = Object.fromEntries(
    Object.entries(summary.byVenueSourceCandidateCounts)
      .sort(([, left], [, right]) => {
        const leftTotal = Object.values(left).reduce(
          (total, value) => total + value,
          0,
        );
        const rightTotal = Object.values(right).reduce(
          (total, value) => total + value,
          0,
        );
        return rightTotal - leftTotal;
      })
      .slice(0, TOP_LIMIT)
      .map(([key, value]) => [key, sortedCounter(value)]),
  );

  const dominantShape =
    Object.entries(summary.qualityShapeCounts)[0] ?? ["(none)", 0];
  summary.upstreamFixHints = {
    observedDominantShape: {
      shape: dominantShape[0],
      raceCount: dominantShape[1],
    },
    historyStatusStarterParsedCount:
      historyStatus.starterParsedCount ?? null,
    historyStatusRaceCount: historyStatus.raceCount ?? null,
    officialIdentityCount: Array.isArray(identity.items)
      ? identity.items.length
      : 0,
    riderMasterCount: Array.isArray(riderMaster.items)
      ? riderMaster.items.length
      : 0,
    likelyMissingPipelineStep: {
      fact:
        "NO_STARTERS raceではhistory.startersが空で、同一race内にregistrationNo付き全出走者配列が確認できない。",
      hypothesis:
        "history生成より上流のrace.riders取得またはその受け渡し工程が、対象期間の多くでstartersを供給していない可能性を次に監査する。",
    },
    suggestedNextScript:
      "scripts/audit-kurari-ex-upstream-rider-source-coverage.mjs（候補・未実装）",
    suggestedDataField:
      "race.riders[].{carNo,name,registrationNo} を公式出走表sourceから取得し、raceKey単位で完全性を検証する。",
    cannotDoWithoutSource:
      "result上位者・lineup車番・選手名だけでは全出走者とregistrationNoを確定できず、安全なbackfillはできない。",
  };
}

function printSection(label, value) {
  console.log(`\n[${label}]`);
  console.log(JSON.stringify(value, null, 2));
}

async function main() {
  const [
    historyIndex,
    historyStatus,
    identity,
    riderMaster,
    exactIndex,
    riderIndex,
  ] = await Promise.all([
    readJson(HISTORY_INDEX_FILE),
    readJson(HISTORY_STATUS_FILE),
    readJson(OFFICIAL_IDENTITY_FILE),
    readJson(RIDER_MASTER_FILE),
    readJson(EXACT_INDEX_FILE),
    readJson(RIDER_INDEX_FILE),
  ]);
  const exactSourceAudit = await inspectExactSources(
    exactIndex,
    riderIndex,
  );
  const summary = createSummary(exactSourceAudit);
  const dailyFiles = Array.isArray(historyIndex.items)
    ? historyIndex.items.map((item) =>
        toPublicFile(item.file, path.join(HISTORY_ROOT, "daily")),
      )
    : [];

  for (const file of dailyFiles) {
    const daily = await readJson(file);
    for (const race of Array.isArray(daily.items) ? daily.items : []) {
      summary.inspectedRaceCount += 1;
      const date = normalizeText(race?.date);
      const starters = Array.isArray(race?.starters) ? race.starters : [];
      if (starters.length > 0) {
        updateDateBoundary(summary, date, false);
        continue;
      }

      summary.noStartersRaceCount += 1;
      updateDateBoundary(summary, date, true);
      increment(summary.noStartersByMonth, raceMonth(race));
      increment(summary.noStartersByVenue, raceVenue(race));
      increment(summary.noStartersByDate, date || "(unknown date)");

      const declaredStarterCount = toInteger(race?.starterCount) ?? 0;
      if (declaredStarterCount > 0) {
        summary.noStartersCoverage.declaredStarterCountPresent += 1;
      } else {
        summary.noStartersCoverage.declaredStarterCountMissing += 1;
      }
      if (hasLineupCarNos(race)) {
        summary.noStartersCoverage.lineupLinesPresent += 1;
      } else {
        summary.noStartersCoverage.lineupLinesMissing += 1;
      }
      if (hasPrediction(race)) {
        summary.noStartersCoverage.predictionPresent += 1;
      } else {
        summary.noStartersCoverage.predictionMissing += 1;
      }
      if (hasResult(race)) {
        summary.noStartersCoverage.resultPresent += 1;
      } else {
        summary.noStartersCoverage.resultMissing += 1;
      }

      increment(
        summary.qualityShapeCounts,
        [
          `starterParsed=${race?.quality?.starterParsed === true}`,
          `lineupParsed=${race?.quality?.lineupParsed === true}`,
          `predictionParsed=${race?.quality?.predictionParsed === true}`,
          `resultParsed=${race?.quality?.resultParsed === true}`,
        ].join(","),
      );
      collectSectionKeys(race, summary);

      const classification = classifyRace(race);
      for (const sourceType of classification.sourceTypes) {
        increment(summary.sourceCandidateCounts, sourceType);
        incrementNested(
          summary.byMonthSourceCandidateCounts,
          raceMonth(race),
          sourceType,
        );
        incrementNested(
          summary.byVenueSourceCandidateCounts,
          raceVenue(race),
          sourceType,
        );
      }
      summary.improvementSafetyCounts[classification.safetyClass] += 1;
      addExample(summary, race, classification);
    }
  }

  if (
    Number(historyIndex.raceCount) > 0 &&
    Number(historyIndex.raceCount) !== summary.inspectedRaceCount
  ) {
    throw new Error(
      `history raceCount mismatch: expected ${historyIndex.raceCount}, inspected ${summary.inspectedRaceCount}`,
    );
  }
  const safetyTotal = Object.values(summary.improvementSafetyCounts).reduce(
    (total, value) => total + value,
    0,
  );
  if (safetyTotal !== summary.noStartersRaceCount) {
    throw new Error(
      `safety classification mismatch: ${safetyTotal} != ${summary.noStartersRaceCount}`,
    );
  }

  finalizeSummary(summary, historyStatus, identity, riderMaster);

  console.log("[kurari-ex NO_STARTERS source candidate audit]");
  console.log("writesPerformed: false");
  console.log("identityFallbackUsed: false");
  console.log("fakeCompletionPerformed: false");
  console.log("productionJsonGenerated: false");
  console.log(
    "policy: source fieldの存在だけを監査し、starter・registrationNo・lineup・positionを生成または補完しない。",
  );

  console.log("\n[summary]");
  console.log(`inspectedRaceCount: ${summary.inspectedRaceCount}`);
  console.log(`noStartersRaceCount: ${summary.noStartersRaceCount}`);
  console.log(
    `sourceCandidateCounts: ${JSON.stringify(summary.sourceCandidateCounts)}`,
  );
  console.log(
    `improvementSafetyCounts: ${JSON.stringify(summary.improvementSafetyCounts)}`,
  );

  printSection("noStartersCoverage", summary.noStartersCoverage);
  printSection(
    "noStartersTopLevelKeyCounts",
    summary.noStartersTopLevelKeyCounts,
  );
  printSection(
    "noStartersStarterLikeKeyCounts",
    summary.noStartersStarterLikeKeyCounts,
  );
  printSection(
    "noStartersRegistrationLikeKeyCounts",
    summary.noStartersRegistrationLikeKeyCounts,
  );
  printSection(
    "noStartersArrayShapeCounts",
    summary.noStartersArrayShapeCounts,
  );
  printSection("safeBackfillExamples", summary.safeBackfillExamples);
  printSection(
    "upstreamImporterFixExamples",
    summary.upstreamImporterFixExamples,
  );
  printSection(
    "identityResolutionNeededExamples",
    summary.identityResolutionNeededExamples,
  );
  printSection("sourceMissingExamples", summary.sourceMissingExamples);
  printSection("upstreamFixHints", summary.upstreamFixHints);
  printSection("jsonSummary", summary);
}

main().catch((error) => {
  console.error("[kurari-ex NO_STARTERS source candidate audit] failed");
  console.error(error);
  process.exitCode = 1;
});
