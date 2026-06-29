import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const PUBLIC_ROOT = path.join(ROOT, "public");
const HISTORY_ROOT = path.join(
  PUBLIC_ROOT,
  "data",
  "analytics",
  "kurari-ex",
  "history",
);
const HISTORY_INDEX_FILE = path.join(HISTORY_ROOT, "index.generated.json");
const HISTORY_STATUS_FILE = path.join(HISTORY_ROOT, "status.generated.json");
const SCRIPTS_ROOT = path.join(ROOT, "scripts");

const UPSTREAM_FILES = [
  {
    id: "keirin-jp-entries",
    file: path.join(
      PUBLIC_ROOT,
      "data",
      "races",
      "keirin-jp-entries.generated.json",
    ),
    kind: "entries",
  },
  {
    id: "keirin-jp-results",
    file: path.join(
      PUBLIC_ROOT,
      "data",
      "races",
      "keirin-jp-results.generated.json",
    ),
    kind: "results",
  },
  {
    id: "today",
    file: path.join(
      PUBLIC_ROOT,
      "data",
      "races",
      "today.generated.json",
    ),
    kind: "today",
  },
  {
    id: "upcoming-schedule",
    file: path.join(
      PUBLIC_ROOT,
      "data",
      "races",
      "upcoming-schedule.generated.json",
    ),
    kind: "schedule",
  },
  {
    id: "saved-predictions",
    file: path.join(
      PUBLIC_ROOT,
      "data",
      "predictions",
      "saved-predictions.generated.json",
    ),
    kind: "predictions",
  },
];

const RIDER_ARRAY_KEYS = new Set([
  "riders",
  "entries",
  "starters",
  "players",
  "competitors",
  "members",
  "contestants",
]);

const REGISTRATION_KEYS = [
  "registrationNo",
  "registrationNumber",
  "riderNo",
  "playerRegistrationNo",
];

const CLASSIFICATION = {
  FULL: "UPSTREAM_FULL_REGISTRATION_SOURCE",
  PARTIAL: "UPSTREAM_PARTIAL_REGISTRATION_SOURCE",
  NAME_CAR: "UPSTREAM_NAME_CAR_ONLY_SOURCE",
  RESULT_ONLY: "UPSTREAM_LINEUP_OR_RESULT_ONLY",
  MATCHED_UNSAFE: "UPSTREAM_MATCHED_BUT_UNSAFE",
  NOT_FOUND: "UPSTREAM_SOURCE_NOT_FOUND",
  AMBIGUOUS: "UPSTREAM_AMBIGUOUS_MATCH",
};

const EXAMPLE_LIMIT = 5;
const TOP_LIMIT = 15;

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

function extractRegistration(value) {
  if (!value || typeof value !== "object") {
    return { field: null, value: "" };
  }
  for (const key of REGISTRATION_KEYS) {
    if (Object.hasOwn(value, key)) {
      return { field: key, value: normalizeText(value[key]) };
    }
  }
  return { field: null, value: "" };
}

function increment(counter, key, amount = 1) {
  const normalized = normalizeText(key) || "(unknown)";
  counter[normalized] = (counter[normalized] ?? 0) + amount;
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

function relativePath(file) {
  return path.relative(ROOT, file).replaceAll("\\", "/");
}

function toHistoryFile(fileValue) {
  const relative = normalizeText(fileValue).replace(/^\/+/, "");
  const resolved = path.resolve(PUBLIC_ROOT, relative);
  const dailyRoot = path.resolve(HISTORY_ROOT, "daily");
  if (
    resolved !== dailyRoot &&
    !resolved.startsWith(`${dailyRoot}${path.sep}`)
  ) {
    throw new Error(`history index contains out-of-scope file: ${fileValue}`);
  }
  return resolved;
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function readJsonIfFound(file) {
  try {
    return { found: true, value: await readJson(file) };
  } catch (error) {
    if (error?.code === "ENOENT") return { found: false, value: null };
    throw error;
  }
}

function historyRaceKey(race) {
  return normalizeText(race?.raceKey);
}

function historyVenueName(race) {
  return normalizeVenueName(race?.venueName);
}

function historyMonth(race) {
  const date = normalizeText(race?.date);
  return /^\d{4}-\d{2}/.test(date) ? date.slice(0, 7) : "(unknown month)";
}

function makeCandidate({
  fileId,
  filePath,
  kind,
  payload,
  venue,
  race,
  raceIndex,
}) {
  const date = normalizeText(
    race?.date ?? venue?.date ?? payload?.date,
  );
  const venueName = normalizeVenueName(
    race?.venueName ??
      race?.venue ??
      venue?.venueName ??
      venue?.venue,
  );
  const venueKey = normalizeText(
    race?.venueKey ?? race?.slug ?? venue?.venueKey ?? venue?.slug,
  );
  const raceNo = toInteger(
    race?.raceNumber ?? race?.raceNo ?? race?.number,
  );
  const venueRaceIds = Array.isArray(venue?.raceIds)
    ? venue.raceIds
    : [];
  const raceId = normalizeText(
    race?.raceId ?? race?.id ?? venueRaceIds[raceIndex],
  );
  const raceKey = normalizeText(race?.raceKey);

  return {
    fileId,
    upstreamFile: relativePath(filePath),
    kind,
    generatedAt: normalizeText(
      payload?.generatedAt ?? payload?.updatedAt,
    ),
    raceId,
    raceKey,
    date,
    venueKey,
    venueName,
    raceNo,
    race,
    riderArrays: [],
    resultArrays: [],
    hasLineupOrResultPayload: false,
  };
}

function addArray(
  candidate,
  pathName,
  items,
  role,
  shapeCounts,
  registrationFieldCounts,
) {
  if (!Array.isArray(items)) return;
  const inspection = inspectRiderArray(items);
  const descriptor = {
    path: pathName,
    role,
    items,
    inspection,
  };
  if (role === "starter") candidate.riderArrays.push(descriptor);
  else candidate.resultArrays.push(descriptor);

  increment(
    shapeCounts,
    `${candidate.fileId}:${pathName}:${inspection.shape}`,
  );
  for (const item of items) {
    const registration = extractRegistration(item);
    if (registration.field) {
      increment(
        registrationFieldCounts,
        `${candidate.fileId}:${pathName}.${registration.field}`,
      );
    }
  }
}

function inspectRiderArray(items) {
  const normalized = items
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const registration = extractRegistration(item);
      return {
        carNo: extractCarNo(item),
        name: normalizeText(item.name ?? item.fullName),
        registrationNo: registration.value,
      };
    });
  const carNos = normalized
    .map((item) => item.carNo)
    .filter(Number.isInteger);
  const registrationNos = normalized
    .map((item) => item.registrationNo)
    .filter(isValidRegistrationNo);
  const validCarNameCount = normalized.filter(
    (item) => Number.isInteger(item.carNo) && item.name,
  ).length;
  const invalidRegistrationCount = normalized.filter(
    (item) => item.registrationNo && !isValidRegistrationNo(item.registrationNo),
  ).length;
  const duplicateCarNo =
    new Set(carNos).size !== carNos.length;
  const duplicateRegistrationNo =
    new Set(registrationNos).size !== registrationNos.length;

  let shape = "empty";
  if (normalized.length > 0) {
    if (
      registrationNos.length === normalized.length &&
      validCarNameCount === normalized.length &&
      !duplicateCarNo &&
      !duplicateRegistrationNo
    ) {
      shape = "full-registration";
    } else if (registrationNos.length > 0) {
      shape = "partial-registration";
    } else if (validCarNameCount === normalized.length) {
      shape = "name-car-only";
    } else {
      shape = "unsafe";
    }
  }

  return {
    shape,
    riderCount: normalized.length,
    registrationNoFilledCount: registrationNos.length,
    validCarNameCount,
    invalidRegistrationCount,
    duplicateCarNo,
    duplicateRegistrationNo,
    carNos,
  };
}

function extractVenueRaceCandidates(
  spec,
  payload,
  shapeCounts,
  registrationFieldCounts,
) {
  const candidates = [];
  for (const venue of Array.isArray(payload?.venues) ? payload.venues : []) {
    const races = Array.isArray(venue?.races) ? venue.races : [];
    races.forEach((race, raceIndex) => {
      const candidate = makeCandidate({
        fileId: spec.id,
        filePath: spec.file,
        kind: spec.kind,
        payload,
        venue,
        race,
        raceIndex,
      });

      if (spec.kind === "entries") {
        addArray(
          candidate,
          "entries",
          race?.entries,
          "starter",
          shapeCounts,
          registrationFieldCounts,
        );
        candidate.hasLineupOrResultPayload =
          normalizeText(race?.lineup).length > 0 ||
          (Array.isArray(race?.officialLineup?.positions) &&
            race.officialLineup.positions.length > 0);
      } else if (spec.kind === "results") {
        addArray(
          candidate,
          "finishOrder",
          race?.finishOrder,
          "result",
          shapeCounts,
          registrationFieldCounts,
        );
        candidate.hasLineupOrResultPayload =
          Array.isArray(race?.finishOrder) && race.finishOrder.length > 0;
      } else if (spec.kind === "today") {
        addArray(
          candidate,
          "riders",
          race?.riders,
          "starter",
          shapeCounts,
          registrationFieldCounts,
        );
        addArray(
          candidate,
          "result.finishOrder",
          race?.result?.finishOrder,
          "result",
          shapeCounts,
          registrationFieldCounts,
        );
        candidate.hasLineupOrResultPayload =
          normalizeText(race?.lineup).length > 0 ||
          normalizeText(race?.resultStatus).length > 0 ||
          (Array.isArray(race?.resultTop3) && race.resultTop3.length > 0);
      }
      candidates.push(candidate);
    });
  }
  return candidates;
}

function extractPredictionCandidates(spec, payload) {
  const records =
    Array.isArray(payload?.recordList) && payload.recordList.length > 0
      ? payload.recordList
      : Object.values(payload?.records ?? {});
  return records
    .filter((record) => record && typeof record === "object")
    .map((record) => {
      const candidate = makeCandidate({
        fileId: spec.id,
        filePath: spec.file,
        kind: spec.kind,
        payload,
        venue: null,
        race: record,
        raceIndex: 0,
      });
      candidate.hasLineupOrResultPayload =
        normalizeText(record?.predictionText).length > 0 ||
        Boolean(record?.predictionJson);
      return candidate;
    });
}

function extractCandidates(
  spec,
  payload,
  shapeCounts,
  registrationFieldCounts,
) {
  if (["entries", "results", "today"].includes(spec.kind)) {
    return extractVenueRaceCandidates(
      spec,
      payload,
      shapeCounts,
      registrationFieldCounts,
    );
  }
  if (spec.kind === "predictions") {
    return extractPredictionCandidates(spec, payload);
  }
  return [];
}

function candidateScanClass(candidate) {
  const starterArray = candidate.riderArrays[0];
  if (!starterArray) return null;
  return starterArray.inspection.shape;
}

function makeMatchKey(candidate, type) {
  if (type === "raceId") {
    return candidate.raceId || "";
  }
  if (type === "raceKey") {
    return candidate.raceKey || "";
  }
  if (type === "dateVenueKeyRaceNo") {
    if (!candidate.date || !candidate.venueKey || !candidate.raceNo) return "";
    return `${candidate.date}|${candidate.venueKey}|${candidate.raceNo}`;
  }
  if (type === "dateVenueNameRaceNo") {
    if (!candidate.date || !candidate.venueName || !candidate.raceNo) return "";
    return `${candidate.date}|${candidate.venueName}|${candidate.raceNo}`;
  }
  return "";
}

function makeHistoryMatchKey(race, type) {
  if (type === "raceId") return normalizeText(race?.raceId);
  if (type === "raceKey") return historyRaceKey(race);
  const date = normalizeText(race?.date);
  const raceNo = toInteger(race?.raceNumber ?? race?.raceNo);
  if (type === "dateVenueKeyRaceNo") {
    const venueKey = normalizeText(race?.venueKey);
    return date && venueKey && raceNo
      ? `${date}|${venueKey}|${raceNo}`
      : "";
  }
  if (type === "dateVenueNameRaceNo") {
    const venueName = historyVenueName(race);
    return date && venueName && raceNo
      ? `${date}|${venueName}|${raceNo}`
      : "";
  }
  return "";
}

function createIndexes(candidates) {
  const types = [
    "raceId",
    "raceKey",
    "dateVenueKeyRaceNo",
    "dateVenueNameRaceNo",
  ];
  const indexes = Object.fromEntries(types.map((type) => [type, new Map()]));
  for (const candidate of candidates) {
    for (const type of types) {
      const key = makeMatchKey(candidate, type);
      if (!key) continue;
      const values = indexes[type].get(key) ?? [];
      values.push(candidate);
      indexes[type].set(key, values);
    }
  }
  return indexes;
}

function findMatch(race, indexes) {
  const types = [
    "raceId",
    "raceKey",
    "dateVenueKeyRaceNo",
    "dateVenueNameRaceNo",
  ];
  for (const type of types) {
    const key = makeHistoryMatchKey(race, type);
    if (!key) continue;
    const candidates = indexes[type].get(key) ?? [];
    if (candidates.length > 0) {
      return { matchKeyUsed: type, key, candidates };
    }
  }
  return { matchKeyUsed: null, key: "", candidates: [] };
}

function validateAgainstHistory(descriptor, declaredStarterCount) {
  const inspection = descriptor.inspection;
  if (
    declaredStarterCount <= 0 ||
    inspection.riderCount !== declaredStarterCount ||
    inspection.duplicateCarNo ||
    inspection.duplicateRegistrationNo ||
    inspection.invalidRegistrationCount > 0
  ) {
    return CLASSIFICATION.MATCHED_UNSAFE;
  }
  if (inspection.shape === "full-registration") {
    return CLASSIFICATION.FULL;
  }
  if (inspection.shape === "partial-registration") {
    return CLASSIFICATION.PARTIAL;
  }
  if (inspection.shape === "name-car-only") {
    return CLASSIFICATION.NAME_CAR;
  }
  return CLASSIFICATION.MATCHED_UNSAFE;
}

function classifyMatch(race, match) {
  if (match.candidates.length === 0) {
    return {
      classification: CLASSIFICATION.NOT_FOUND,
      candidate: null,
      descriptor: null,
    };
  }
  if (match.candidates.length > 1) {
    return {
      classification: CLASSIFICATION.AMBIGUOUS,
      candidate: null,
      descriptor: null,
    };
  }

  const candidate = match.candidates[0];
  const starterDescriptor = candidate.riderArrays[0] ?? null;
  if (starterDescriptor) {
    return {
      classification: validateAgainstHistory(
        starterDescriptor,
        toInteger(race?.starterCount) ?? 0,
      ),
      candidate,
      descriptor: starterDescriptor,
    };
  }
  if (
    candidate.resultArrays.length > 0 ||
    candidate.hasLineupOrResultPayload
  ) {
    return {
      classification: CLASSIFICATION.RESULT_ONLY,
      candidate,
      descriptor: candidate.resultArrays[0] ?? null,
    };
  }
  return {
    classification: CLASSIFICATION.MATCHED_UNSAFE,
    candidate,
    descriptor: null,
  };
}

function createExample(race, match, result) {
  const inspection = result.descriptor?.inspection;
  const candidate = result.candidate;
  const reasons = {
    [CLASSIFICATION.FULL]:
      "同一upstream raceに全車分のcarNo/name/registrationNoがあり、宣言人数と一致する。今回は書き込まない。",
    [CLASSIFICATION.PARTIAL]:
      "upstream rider配列のregistrationNoが一部だけ保存されている。",
    [CLASSIFICATION.NAME_CAR]:
      "upstream rider配列にcarNo/nameはあるがregistrationNoがない。",
    [CLASSIFICATION.RESULT_ONLY]:
      "照合先は結果・lineup・予想系であり、公式出走者sourceとしては使用しない。",
    [CLASSIFICATION.MATCHED_UNSAFE]:
      "照合できたが、人数不一致・重複・必須field不足のいずれかがある。",
    [CLASSIFICATION.NOT_FOUND]:
      "現在保存されているupstream候補に同一レースがない。",
    [CLASSIFICATION.AMBIGUOUS]:
      "同一照合キーに複数upstream候補があり、一意に選べない。",
  };
  const nextActions = {
    [CLASSIFICATION.FULL]:
      "write前のrace identity・完全性検証を別工程で設計する。",
    [CLASSIFICATION.PARTIAL]:
      "公式entry取得時のregistrationNo欠落を確認する。",
    [CLASSIFICATION.NAME_CAR]:
      "名前照合せず、公式entry sourceからregistrationNoを取得する。",
    [CLASSIFICATION.RESULT_ONLY]:
      "結果・予想をstarter sourceへ転用せず、公式entry sourceを保存する。",
    [CLASSIFICATION.MATCHED_UNSAFE]:
      "上流配列の人数・車番・登録番号重複を修正する。",
    [CLASSIFICATION.NOT_FOUND]:
      "history対象日の公式entry snapshot保存可否を確認する。",
    [CLASSIFICATION.AMBIGUOUS]:
      "raceIdまたは一意なraceKeyをupstream側へ保存する。",
  };

  return {
    raceKey: historyRaceKey(race) || "(missing raceKey)",
    date: normalizeText(race?.date) || "(unknown date)",
    venue: normalizeText(race?.venueName) || "(unknown venue)",
    raceNo: toInteger(race?.raceNumber),
    matchKeyUsed: match.matchKeyUsed,
    upstreamFile:
      candidate?.upstreamFile ??
      (match.candidates.length > 1
        ? match.candidates.map((item) => item.upstreamFile)
        : null),
    candidateType: result.classification,
    declaredStarterCount: toInteger(race?.starterCount) ?? 0,
    upstreamRiderCount: inspection?.riderCount ?? 0,
    registrationNoFilledCount:
      inspection?.registrationNoFilledCount ?? 0,
    carNos: inspection?.carNos ?? [],
    whySafeOrBlocked: reasons[result.classification],
    nextAction: nextActions[result.classification],
  };
}

function addExample(summary, race, match, result) {
  const target = summary.examples[result.classification];
  if (target.length < EXAMPLE_LIMIT) {
    target.push(createExample(race, match, result));
  }
}

async function collectScriptFiles(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name === "debug") continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      output.push(...(await collectScriptFiles(file)));
    } else if (entry.isFile() && entry.name.endsWith(".mjs")) {
      output.push(file);
    }
  }
  return output;
}

async function inspectPipelineScripts() {
  const files = await collectScriptFiles(SCRIPTS_ROOT);
  const categories = {
    scriptsMentioningHistory: [],
    scriptsMentioningEntries: [],
    scriptsMentioningStarters: [],
    scriptsMentioningRegistrationNo: [],
  };
  const contentByFile = new Map();
  for (const file of files) {
    const content = await readFile(file, "utf8");
    const relative = relativePath(file);
    contentByFile.set(relative, content);
    if (/history/iu.test(content)) {
      categories.scriptsMentioningHistory.push(relative);
    }
    if (/keirin-jp-entries|race\.entries|\.entries\b/iu.test(content)) {
      categories.scriptsMentioningEntries.push(relative);
    }
    if (/starterParsed|\bstarters\b|race\?*\.riders/iu.test(content)) {
      categories.scriptsMentioningStarters.push(relative);
    }
    if (
      /registrationNo|registrationNumber|playerRegistrationNo|riderNo/iu.test(
        content,
      )
    ) {
      categories.scriptsMentioningRegistrationNo.push(relative);
    }
  }

  const hasText = (file, pattern) =>
    pattern.test(contentByFile.get(file) ?? "");
  const likelyHistoryGeneratorScripts = [...contentByFile.keys()].filter(
    (file) =>
      /(?:archive|export|normalize).*kurari-ex.*history|kurari-ex-(?:daily|history)-common/u.test(
        file,
      ) ||
      /archive-kurari-ex-daily-facts/u.test(file),
  );
  const likelyEntryGeneratorScripts = [...contentByFile.keys()].filter(
    (file) => /(?:update|check)-keirin-jp-entries/u.test(file),
  );
  const dailyCommon = "scripts/kurari-ex-daily-common.mjs";
  const entryUpdater = "scripts/update-keirin-jp-entries.mjs";

  return {
    ...categories,
    likelyHistoryGeneratorScripts,
    likelyEntryGeneratorScripts,
    possibleDropPointHints: [
      {
        fact:
          hasText(dailyCommon, /today\.generated\.json/u) &&
          hasText(dailyCommon, /race\?*\.riders/u)
            ? `${dailyCommon} は today.generated.json を入力にし、race.ridersからstartersを構成する。`
            : `${dailyCommon} の入力・starters構築箇所を再確認する必要がある。`,
      },
      {
        fact: hasText(entryUpdater, /registrationNo/u)
          ? `${entryUpdater} はregistrationNo付きentriesを生成する。`
          : `${entryUpdater} ではregistrationNo生成を確認できない。`,
      },
      {
        fact: !hasText(dailyCommon, /keirin-jp-entries\.generated\.json/u)
          ? `${dailyCommon} にkeirin-jp-entries.generated.jsonの直接参照文字列はない。`
          : `${dailyCommon} はkeirin-jp-entries.generated.jsonを参照する。`,
      },
      {
        hypothesis:
          "公式entriesとhistory用race.ridersの間に、registrationNoをrace単位で受け渡す接続がない可能性を次に検証する。",
      },
    ],
  };
}

function duplicateKeyCount(items, keyFactory) {
  const counts = {};
  for (const item of items) {
    const key = keyFactory(item);
    if (key) increment(counts, key);
  }
  return Object.values(counts).filter((count) => count > 1).length;
}

function createSummary() {
  return {
    historyRaceCount: 0,
    historyNoStartersRaceCount: 0,
    historyStarterParsedRaceCount: 0,
    noStartersByMonth: {},
    noStartersByVenue: {},
    upstreamFilesScanned: UPSTREAM_FILES.map((spec) =>
      relativePath(spec.file),
    ),
    upstreamFilesFound: [],
    upstreamRaceCandidateCountByFile: {},
    upstreamRiderArrayShapeCounts: {},
    upstreamRegistrationFieldCounts: {},
    upstreamFullStarterSourceCountByFile: {},
    upstreamPartialStarterSourceCountByFile: {},
    upstreamNameCarOnlySourceCountByFile: {},
    matchCountsByKey: {
      raceId: 0,
      raceKey: 0,
      dateVenueKeyRaceNo: 0,
      dateVenueNameRaceNo: 0,
    },
    noStartersMatchedToUpstreamCount: 0,
    noStartersUnmatchedToUpstreamCount: 0,
    matchAmbiguityCount: 0,
    duplicatedUpstreamRaceKeyCount: 0,
    duplicatedHistoryRaceKeyCount: 0,
    upstreamSafetyClassificationCounts: {},
    fullRegistrationSourceCandidateCount: 0,
    partialRegistrationSourceCandidateCount: 0,
    nameCarOnlyCandidateCount: 0,
    ambiguousMatchCount: 0,
    sourceNotFoundCount: 0,
    pipelineScriptHints: {},
    examples: Object.fromEntries(
      Object.values(CLASSIFICATION).map((classification) => [
        classification,
        [],
      ]),
    ),
    nextRecommendedAction: "",
    writesPerformed: false,
    identityFallbackUsed: false,
    fakeCompletionPerformed: false,
    productionJsonGenerated: false,
  };
}

function finalizeSummary(summary) {
  summary.noStartersByMonth = sortedCounter(summary.noStartersByMonth);
  summary.noStartersByVenue = sortedCounter(
    summary.noStartersByVenue,
    TOP_LIMIT,
  );
  summary.upstreamRiderArrayShapeCounts = sortedCounter(
    summary.upstreamRiderArrayShapeCounts,
  );
  summary.upstreamRegistrationFieldCounts = sortedCounter(
    summary.upstreamRegistrationFieldCounts,
  );
  summary.upstreamSafetyClassificationCounts = sortedCounter(
    summary.upstreamSafetyClassificationCounts,
  );
  summary.nextRecommendedAction =
    summary.fullRegistrationSourceCandidateCount > 0
      ? "FULL候補についてrace identityと完全性を再監査する。今回はhistoryへ保存しない。"
      : "history対象日のkeirin-jp entries snapshotを保存し、today.ridersまたはhistory入力へregistrationNo付きentriesを安全に受け渡す設計を監査する。";
}

function printSection(label, value) {
  console.log(`\n[${label}]`);
  console.log(JSON.stringify(value, null, 2));
}

async function main() {
  const [historyIndex, historyStatus, pipelineScriptHints] =
    await Promise.all([
      readJson(HISTORY_INDEX_FILE),
      readJson(HISTORY_STATUS_FILE),
      inspectPipelineScripts(),
    ]);
  const summary = createSummary();
  summary.pipelineScriptHints = pipelineScriptHints;

  const historyRaces = [];
  for (const item of Array.isArray(historyIndex.items)
    ? historyIndex.items
    : []) {
    const daily = await readJson(toHistoryFile(item.file));
    historyRaces.push(
      ...(Array.isArray(daily.items) ? daily.items : []),
    );
  }
  summary.historyRaceCount = historyRaces.length;
  summary.historyStarterParsedRaceCount = historyRaces.filter(
    (race) =>
      Array.isArray(race?.starters) &&
      race.starters.length > 0 &&
      race?.quality?.starterParsed === true,
  ).length;
  const noStarterRaces = historyRaces.filter(
    (race) =>
      !Array.isArray(race?.starters) ||
      race.starters.length === 0 ||
      race?.quality?.starterParsed === false,
  );
  summary.historyNoStartersRaceCount = noStarterRaces.length;
  for (const race of noStarterRaces) {
    increment(summary.noStartersByMonth, historyMonth(race));
    increment(
      summary.noStartersByVenue,
      normalizeText(race?.venueName) || "(unknown venue)",
    );
  }

  const upstreamCandidates = [];
  for (const spec of UPSTREAM_FILES) {
    const source = await readJsonIfFound(spec.file);
    if (!source.found) {
      summary.upstreamRaceCandidateCountByFile[spec.id] = 0;
      continue;
    }
    summary.upstreamFilesFound.push(relativePath(spec.file));
    const candidates = extractCandidates(
      spec,
      source.value,
      summary.upstreamRiderArrayShapeCounts,
      summary.upstreamRegistrationFieldCounts,
    );
    upstreamCandidates.push(...candidates);
    summary.upstreamRaceCandidateCountByFile[spec.id] =
      candidates.length;

    for (const candidate of candidates) {
      const scanClass = candidateScanClass(candidate);
      if (scanClass === "full-registration") {
        increment(summary.upstreamFullStarterSourceCountByFile, spec.id);
      } else if (scanClass === "partial-registration") {
        increment(summary.upstreamPartialStarterSourceCountByFile, spec.id);
      } else if (scanClass === "name-car-only") {
        increment(summary.upstreamNameCarOnlySourceCountByFile, spec.id);
      }
    }
  }

  summary.duplicatedUpstreamRaceKeyCount = duplicateKeyCount(
    upstreamCandidates,
    (candidate) => candidate.raceKey,
  );
  summary.duplicatedHistoryRaceKeyCount = duplicateKeyCount(
    historyRaces,
    historyRaceKey,
  );
  const indexes = createIndexes(upstreamCandidates);

  for (const race of noStarterRaces) {
    const match = findMatch(race, indexes);
    const result = classifyMatch(race, match);
    if (match.candidates.length > 0) {
      summary.noStartersMatchedToUpstreamCount += 1;
      if (match.matchKeyUsed) {
        summary.matchCountsByKey[match.matchKeyUsed] += 1;
      }
    } else {
      summary.noStartersUnmatchedToUpstreamCount += 1;
    }
    if (match.candidates.length > 1) {
      summary.matchAmbiguityCount += 1;
    }

    increment(
      summary.upstreamSafetyClassificationCounts,
      result.classification,
    );
    if (result.classification === CLASSIFICATION.FULL) {
      summary.fullRegistrationSourceCandidateCount += 1;
    } else if (result.classification === CLASSIFICATION.PARTIAL) {
      summary.partialRegistrationSourceCandidateCount += 1;
    } else if (result.classification === CLASSIFICATION.NAME_CAR) {
      summary.nameCarOnlyCandidateCount += 1;
    } else if (result.classification === CLASSIFICATION.AMBIGUOUS) {
      summary.ambiguousMatchCount += 1;
    } else if (result.classification === CLASSIFICATION.NOT_FOUND) {
      summary.sourceNotFoundCount += 1;
    }
    addExample(summary, race, match, result);
  }

  if (
    Number(historyIndex.raceCount) > 0 &&
    Number(historyIndex.raceCount) !== summary.historyRaceCount
  ) {
    throw new Error(
      `history raceCount mismatch: ${historyIndex.raceCount} != ${summary.historyRaceCount}`,
    );
  }
  if (
    Number(historyStatus.starterParsedCount) !==
    summary.historyStarterParsedRaceCount
  ) {
    throw new Error(
      `starterParsedCount mismatch: ${historyStatus.starterParsedCount} != ${summary.historyStarterParsedRaceCount}`,
    );
  }
  const classifiedCount = Object.values(
    summary.upstreamSafetyClassificationCounts,
  ).reduce((total, value) => total + value, 0);
  if (classifiedCount !== summary.historyNoStartersRaceCount) {
    throw new Error(
      `classification mismatch: ${classifiedCount} != ${summary.historyNoStartersRaceCount}`,
    );
  }

  finalizeSummary(summary);

  console.log("[kurari-ex upstream rider source coverage audit]");
  console.log("writesPerformed: false");
  console.log("identityFallbackUsed: false");
  console.log("fakeCompletionPerformed: false");
  console.log("productionJsonGenerated: false");
  console.log(
    "policy: upstream sourceの存在と完全性だけを監査し、starter・registrationNo・lineup・positionを補完しない。",
  );

  console.log("\n[summary]");
  console.log(`historyRaceCount: ${summary.historyRaceCount}`);
  console.log(
    `historyNoStartersRaceCount: ${summary.historyNoStartersRaceCount}`,
  );
  console.log(
    `historyStarterParsedRaceCount: ${summary.historyStarterParsedRaceCount}`,
  );
  console.log(
    `upstreamFilesScanned: ${JSON.stringify(summary.upstreamFilesScanned)}`,
  );
  console.log(
    `upstreamRaceCandidateCountByFile: ${JSON.stringify(summary.upstreamRaceCandidateCountByFile)}`,
  );
  console.log(
    `matchCountsByKey: ${JSON.stringify(summary.matchCountsByKey)}`,
  );
  console.log(
    `upstreamSafetyClassificationCounts: ${JSON.stringify(summary.upstreamSafetyClassificationCounts)}`,
  );
  console.log(
    `fullRegistrationSourceCandidateCount: ${summary.fullRegistrationSourceCandidateCount}`,
  );
  console.log(
    `partialRegistrationSourceCandidateCount: ${summary.partialRegistrationSourceCandidateCount}`,
  );
  console.log(
    `nameCarOnlyCandidateCount: ${summary.nameCarOnlyCandidateCount}`,
  );
  console.log(`ambiguousMatchCount: ${summary.ambiguousMatchCount}`);
  console.log(`sourceNotFoundCount: ${summary.sourceNotFoundCount}`);

  printSection(
    "upstreamRiderArrayShapeCounts",
    summary.upstreamRiderArrayShapeCounts,
  );
  printSection(
    "upstreamRegistrationFieldCounts",
    summary.upstreamRegistrationFieldCounts,
  );
  printSection("pipelineScriptHints", summary.pipelineScriptHints);
  printSection("examples", summary.examples);
  printSection("nextRecommendedAction", summary.nextRecommendedAction);
  printSection("jsonSummary", summary);
}

main().catch((error) => {
  console.error("[kurari-ex upstream rider source coverage audit] failed");
  console.error(error);
  process.exitCode = 1;
});
