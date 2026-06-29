import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  rename,
  rm,
} from "node:fs/promises";
import path from "node:path";

export const SNAPSHOT_SCHEMA_VERSION =
  "kurari-ex-entry-snapshot/v1";
export const BRIDGE_VERSION = "kurari-ex-history-bridge/v1";
export const SOURCE_NAME = "keirin-jp-entries";
export const SOURCE_PATH =
  "public/data/races/keirin-jp-entries.generated.json";
export const SNAPSHOT_ROOT =
  "public/data/races/entries-history";

export function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim();
}

export function normalizeVenueName(value) {
  return normalizeText(value)
    .replace(/\s+/gu, "")
    .replace(/競輪場$/u, "")
    .replace(/競輪$/u, "");
}

export function toInteger(value) {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  const text = normalizeText(value);
  if (!/^\d+$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function isValidRegistrationNo(value) {
  return /^\d{6}$/.test(normalizeText(value));
}

function increment(counter, key) {
  counter[key] = (counter[key] ?? 0) + 1;
}

function sortedObject(value, excludedKeys = new Set()) {
  if (Array.isArray(value)) {
    return value.map((item) => sortedObject(item, excludedKeys));
  }
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => !excludedKeys.has(key))
      .sort()
      .map((key) => [
        key,
        sortedObject(value[key], excludedKeys),
      ]),
  );
}

export function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function semanticHash(payload) {
  const canonical = JSON.stringify(
    sortedObject(
      payload,
      new Set(["generatedAt", "contentHash"]),
    ),
  );
  return `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
}

export function snapshotPathForDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`invalid snapshot date: ${date}`);
  }
  return path.join(
    SNAPSHOT_ROOT,
    date,
    "keirin-jp-entries.generated.json",
  );
}

function inspectEntryRace(entries, starterCount, joinKeyAvailable) {
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
    starterCount > 0 && starterCount === entries.length;

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
  if (!joinKeyAvailable) {
    blockedReasons.push("SAFE_JOIN_KEY_MISSING");
  }

  return {
    entryParsed,
    registrationComplete,
    carNoUnique,
    registrationNoUnique,
    starterCountMatched,
    joinKeyAvailable,
    blockedReasons,
    full: blockedReasons.length === 0,
  };
}

function buildRace(payload, venue, race) {
  const entries = Array.isArray(race?.entries) ? race.entries : [];
  const date = normalizeText(race?.date ?? venue?.date ?? payload?.date);
  const venueKey =
    normalizeText(
      race?.venueKey ?? venue?.venueKey ?? venue?.slug,
    ) || null;
  const venueName = normalizeVenueName(
    race?.venueName ?? venue?.venueName ?? venue?.venue,
  );
  const raceNumber = toInteger(race?.raceNumber ?? race?.raceNo);
  const starterCount =
    toInteger(race?.quality?.entryCount) ?? entries.length;
  const raceId = normalizeText(race?.raceId) || null;
  const raceKey = normalizeText(race?.raceKey) || null;
  const joinKeyAvailable = Boolean(
    raceId ||
      raceKey ||
      (date && venueKey && raceNumber) ||
      (date && venueName && raceNumber),
  );
  const quality = inspectEntryRace(
    entries,
    starterCount,
    joinKeyAvailable,
  );

  return {
    raceId,
    raceKey,
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
    quality,
  };
}

function summarizeRaces(races) {
  const riderCount = races.reduce(
    (total, race) => total + race.entries.length,
    0,
  );
  const fullRegistrationRaceCount = races.filter(
    (race) => race.quality.full,
  ).length;
  return {
    raceCount: races.length,
    riderCount,
    fullRegistrationRaceCount,
    blockedRaceCount: races.length - fullRegistrationRaceCount,
  };
}

export function buildSnapshotPayload(sourcePayload) {
  const sourceGeneratedAt = normalizeText(sourcePayload?.generatedAt);
  const sourceDate = normalizeText(sourcePayload?.date);
  const sourceMetadataPresent =
    sourcePayload?.source &&
    typeof sourcePayload.source === "object" &&
    Object.keys(sourcePayload.source).length > 0;
  const dates = new Set();
  const races = [];

  for (const venue of Array.isArray(sourcePayload?.venues)
    ? sourcePayload.venues
    : []) {
    for (const race of Array.isArray(venue?.races) ? venue.races : []) {
      const builtRace = buildRace(sourcePayload, venue, race);
      races.push(builtRace);
      if (builtRace.date) dates.add(builtRace.date);
    }
  }

  const globalBlockedReasons = [];
  if (!sourceGeneratedAt) {
    globalBlockedReasons.push("SOURCE_GENERATED_AT_MISSING");
  }
  if (!sourceMetadataPresent) {
    globalBlockedReasons.push("SOURCE_METADATA_MISSING");
  }
  if (dates.size !== 1 || !dates.has(sourceDate)) {
    globalBlockedReasons.push("SOURCE_DATE_NOT_SINGLE");
  }
  if (races.length === 0) globalBlockedReasons.push("RACE_COUNT_ZERO");

  const summary = summarizeRaces(races);
  if (summary.riderCount === 0) {
    globalBlockedReasons.push("RIDER_COUNT_ZERO");
  }
  for (const race of races) {
    globalBlockedReasons.push(...race.quality.blockedReasons);
  }

  const payloadWithoutHash = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    generatedAt: sourceGeneratedAt,
    source: SOURCE_NAME,
    sourcePath: SOURCE_PATH,
    sourceGeneratedAt,
    date: sourceDate,
    bridgeVersion: BRIDGE_VERSION,
    contentHash: "",
    summary,
    races,
  };
  const contentHash = semanticHash(payloadWithoutHash);
  const payload = { ...payloadWithoutHash, contentHash };

  return {
    payload,
    globalBlockedReasons,
    eligible: globalBlockedReasons.length === 0,
  };
}

function validateRace(race, snapshotDate) {
  const reasons = [];
  const entries = Array.isArray(race?.entries) ? race.entries : [];
  if (race?.date !== snapshotDate) reasons.push("RACE_DATE_MISMATCH");
  const expectedQuality = inspectEntryRace(
    entries,
    toInteger(race?.starterCount) ?? 0,
    Boolean(race?.quality?.joinKeyAvailable),
  );
  const qualityKeys = [
    "entryParsed",
    "registrationComplete",
    "carNoUnique",
    "registrationNoUnique",
    "starterCountMatched",
    "joinKeyAvailable",
    "full",
  ];
  for (const key of qualityKeys) {
    if (race?.quality?.[key] !== expectedQuality[key]) {
      reasons.push(`QUALITY_${key.toUpperCase()}_MISMATCH`);
    }
  }
  if (
    JSON.stringify(race?.quality?.blockedReasons ?? []) !==
    JSON.stringify(expectedQuality.blockedReasons)
  ) {
    reasons.push("QUALITY_BLOCKED_REASONS_MISMATCH");
  }
  return { reasons, expectedQuality };
}

export function validateSnapshot(payload) {
  const failedReasons = [];
  if (payload?.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
    failedReasons.push("SCHEMA_VERSION_MISMATCH");
  }
  if (payload?.source !== SOURCE_NAME) {
    failedReasons.push("SOURCE_MISMATCH");
  }
  if (payload?.sourcePath !== SOURCE_PATH) {
    failedReasons.push("SOURCE_PATH_MISMATCH");
  }
  if (!normalizeText(payload?.sourceGeneratedAt)) {
    failedReasons.push("SOURCE_GENERATED_AT_MISSING");
  }
  if (payload?.generatedAt !== payload?.sourceGeneratedAt) {
    failedReasons.push("GENERATED_AT_NOT_SOURCE_GENERATED_AT");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizeText(payload?.date))) {
    failedReasons.push("DATE_INVALID");
  }
  if (payload?.bridgeVersion !== BRIDGE_VERSION) {
    failedReasons.push("BRIDGE_VERSION_MISMATCH");
  }
  if (!Array.isArray(payload?.races)) {
    failedReasons.push("RACES_NOT_ARRAY");
  }

  const races = Array.isArray(payload?.races) ? payload.races : [];
  const reasonCounts = {};
  for (const race of races) {
    const result = validateRace(race, payload?.date);
    for (const reason of result.reasons) {
      failedReasons.push(reason);
      increment(reasonCounts, reason);
    }
  }

  const actualSummary = summarizeRaces(races);
  if (
    JSON.stringify(payload?.summary) !== JSON.stringify(actualSummary)
  ) {
    failedReasons.push("SUMMARY_MISMATCH");
  }
  const recomputedHash = semanticHash(payload);
  const hashMatched = payload?.contentHash === recomputedHash;
  if (!hashMatched) failedReasons.push("CONTENT_HASH_MISMATCH");

  return {
    checkStatus: failedReasons.length === 0 ? "PASS" : "FAIL",
    raceCount: actualSummary.raceCount,
    riderCount: actualSummary.riderCount,
    fullRegistrationRaceCount:
      actualSummary.fullRegistrationRaceCount,
    blockedRaceCount: actualSummary.blockedRaceCount,
    contentHash: payload?.contentHash ?? null,
    recomputedHash,
    hashMatched,
    failedReasons: [...new Set(failedReasons)],
    failedReasonCounts: reasonCounts,
  };
}

function parseTimestamp(value) {
  const parsed = Date.parse(normalizeText(value));
  return Number.isFinite(parsed) ? parsed : null;
}

export function evaluateExistingSnapshot(existing, current) {
  if (!existing) {
    return {
      targetAlreadyExists: false,
      existingSnapshotStatus: "NOT_FOUND",
      writeStatus: "WRITE_CANDIDATE",
      blockedReasons: [],
    };
  }

  const existingValidation = validateSnapshot(existing);
  if (existingValidation.checkStatus !== "PASS") {
    return {
      targetAlreadyExists: true,
      existingSnapshotStatus: "INVALID",
      writeStatus: "BLOCKED",
      blockedReasons: [
        "EXISTING_SNAPSHOT_INVALID",
        ...existingValidation.failedReasons,
      ],
    };
  }
  if (existing.schemaVersion !== current.schemaVersion) {
    return {
      targetAlreadyExists: true,
      existingSnapshotStatus: "SCHEMA_MISMATCH",
      writeStatus: "BLOCKED",
      blockedReasons: ["SCHEMA_VERSION_MISMATCH"],
    };
  }
  if (existing.contentHash === current.contentHash) {
    return {
      targetAlreadyExists: true,
      existingSnapshotStatus: "SEMANTIC_HASH_MATCHED",
      writeStatus: "NO_WRITE_NEEDED",
      blockedReasons: [],
    };
  }

  const blockedReasons = [];
  if (existing.summary.raceCount > current.summary.raceCount) {
    blockedReasons.push("RACE_COUNT_REGRESSION");
  }
  if (
    existing.summary.fullRegistrationRaceCount >
    current.summary.fullRegistrationRaceCount
  ) {
    blockedReasons.push("FULL_REGISTRATION_RACE_COUNT_REGRESSION");
  }
  if (
    existing.summary.blockedRaceCount === 0 &&
    current.summary.blockedRaceCount > 0
  ) {
    blockedReasons.push("INCOMPLETE_OVERWRITE_PROHIBITED");
  }
  const existingTime = parseTimestamp(existing.sourceGeneratedAt);
  const currentTime = parseTimestamp(current.sourceGeneratedAt);
  if (existingTime === null || currentTime === null) {
    blockedReasons.push("SOURCE_GENERATED_AT_UNCOMPARABLE");
  } else if (currentTime < existingTime) {
    blockedReasons.push("SOURCE_GENERATED_AT_REGRESSION");
  }

  return {
    targetAlreadyExists: true,
    existingSnapshotStatus:
      blockedReasons.length > 0
        ? "PROTECTED_FROM_DOWNGRADE"
        : "CURRENT_EQUAL_OR_BETTER",
    writeStatus:
      blockedReasons.length > 0 ? "BLOCKED" : "WRITE_CANDIDATE",
    blockedReasons,
  };
}

export async function atomicWriteJson(targetPath, payload) {
  const directory = path.dirname(targetPath);
  await mkdir(directory, { recursive: true });
  const tempPath = path.join(
    directory,
    `.tmp-${path.basename(targetPath)}-${process.pid}-${randomUUID()}`,
  );
  let handle = null;
  try {
    handle = await open(tempPath, "wx");
    await handle.writeFile(stableJson(payload), "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(tempPath, targetPath);
  } catch (error) {
    if (handle) {
      await handle.close().catch(() => {});
    }
    await rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}

export function assertSnapshotTarget(root, targetPath, date) {
  const resolvedRoot = path.resolve(root, SNAPSHOT_ROOT);
  const expected = path.resolve(root, snapshotPathForDate(date));
  const resolvedTarget = path.resolve(targetPath);
  if (
    resolvedTarget !== expected ||
    !resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)
  ) {
    throw new Error(
      `snapshot target is outside the exact allowed path: ${resolvedTarget}`,
    );
  }
}
