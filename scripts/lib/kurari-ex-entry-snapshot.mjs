import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
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
export const INDEX_SCHEMA_VERSION =
  "kurari-ex-entry-snapshot-index/v1";
export const INDEX_SOURCE = "kurari-ex-entry-snapshot-index";
export const INDEX_PATH =
  "public/data/races/entries-history/index.generated.json";

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

export function indexSemanticHash(payload) {
  const {
    generatedAt: _generatedAt,
    contentHash: _contentHash,
    ...semantic
  } = payload ?? {};
  const canonical = JSON.stringify(sortedObject(semantic));
  return `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
}

function countDuplicates(values) {
  const counts = new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.values()].filter((count) => count > 1).length;
}

function summarizeIndexSnapshots(snapshots) {
  return {
    snapshotCount: snapshots.length,
    raceCount: snapshots.reduce(
      (total, snapshot) => total + Number(snapshot.raceCount ?? 0),
      0,
    ),
    riderCount: snapshots.reduce(
      (total, snapshot) => total + Number(snapshot.riderCount ?? 0),
      0,
    ),
    fullRegistrationRaceCount: snapshots.reduce(
      (total, snapshot) =>
        total + Number(snapshot.fullRegistrationRaceCount ?? 0),
      0,
    ),
    blockedRaceCount: snapshots.reduce(
      (total, snapshot) =>
        total + Number(snapshot.blockedRaceCount ?? 0),
      0,
    ),
    passCount: snapshots.filter(
      (snapshot) => snapshot.checkStatus === "PASS",
    ).length,
    failCount: snapshots.filter(
      (snapshot) => snapshot.checkStatus !== "PASS",
    ).length,
  };
}

export function buildSnapshotIndexPayload(snapshotRecords) {
  const snapshots = [...snapshotRecords]
    .map((record) => ({
      date: record.date,
      path: record.path,
      schemaVersion: record.schemaVersion,
      source: record.source,
      sourceGeneratedAt: record.sourceGeneratedAt,
      contentHash: record.contentHash,
      raceCount: record.raceCount,
      riderCount: record.riderCount,
      fullRegistrationRaceCount:
        record.fullRegistrationRaceCount,
      blockedRaceCount: record.blockedRaceCount,
      checkStatus: record.checkStatus,
      hashMatched: record.hashMatched,
      sizeBytes: record.sizeBytes,
    }))
    .sort(
      (left, right) =>
        left.date.localeCompare(right.date) ||
        left.path.localeCompare(right.path),
    );
  const duplicateDateCount = countDuplicates(
    snapshots.map((snapshot) => snapshot.date),
  );
  const duplicatePathCount = countDuplicates(
    snapshots.map((snapshot) => snapshot.path),
  );
  const missingSnapshotFileCount = snapshotRecords.filter(
    (record) => record.fileExists === false,
  ).length;
  const hashMismatchCount = snapshotRecords.filter(
    (record) => record.hashMatched !== true,
  ).length;
  const summary = summarizeIndexSnapshots(snapshots);
  const blockedReasons = [];
  if (snapshots.length === 0) blockedReasons.push("SNAPSHOT_COUNT_ZERO");
  if (summary.failCount > 0) blockedReasons.push("SNAPSHOT_CHECK_FAILED");
  if (duplicateDateCount > 0) blockedReasons.push("DUPLICATE_DATE");
  if (duplicatePathCount > 0) blockedReasons.push("DUPLICATE_PATH");
  if (missingSnapshotFileCount > 0) {
    blockedReasons.push("SNAPSHOT_FILE_MISSING");
  }
  if (hashMismatchCount > 0) {
    blockedReasons.push("SNAPSHOT_HASH_MISMATCH");
  }
  const generatedAt = snapshots
    .map((snapshot) => snapshot.sourceGeneratedAt)
    .filter(Boolean)
    .sort()
    .at(-1);
  if (!generatedAt) blockedReasons.push("GENERATED_AT_UNAVAILABLE");

  const withoutHash = {
    schemaVersion: INDEX_SCHEMA_VERSION,
    generatedAt: generatedAt ?? "",
    source: INDEX_SOURCE,
    basePath: SNAPSHOT_ROOT,
    contentHash: "",
    summary,
    snapshots,
    quality: {
      allSnapshotsPass:
        snapshots.length > 0 &&
        summary.failCount === 0 &&
        hashMismatchCount === 0 &&
        missingSnapshotFileCount === 0,
      duplicateDateCount,
      duplicatePathCount,
      missingSnapshotFileCount,
      hashMismatchCount,
      blockedReasons,
    },
  };
  return {
    payload: {
      ...withoutHash,
      contentHash: indexSemanticHash(withoutHash),
    },
    eligible: blockedReasons.length === 0,
    blockedReasons,
  };
}

export function validateSnapshotIndexMetadata(payload) {
  const failedReasons = [];
  if (payload?.schemaVersion !== INDEX_SCHEMA_VERSION) {
    failedReasons.push("SCHEMA_VERSION_MISMATCH");
  }
  if (payload?.source !== INDEX_SOURCE) {
    failedReasons.push("SOURCE_MISMATCH");
  }
  if (payload?.basePath !== SNAPSHOT_ROOT) {
    failedReasons.push("BASE_PATH_MISMATCH");
  }
  if (!normalizeText(payload?.generatedAt)) {
    failedReasons.push("GENERATED_AT_MISSING");
  }
  if (!Array.isArray(payload?.snapshots)) {
    failedReasons.push("SNAPSHOTS_NOT_ARRAY");
  }
  const snapshots = Array.isArray(payload?.snapshots)
    ? payload.snapshots
    : [];
  const expectedSummary = summarizeIndexSnapshots(snapshots);
  if (
    JSON.stringify(payload?.summary) !==
    JSON.stringify(expectedSummary)
  ) {
    failedReasons.push("SUMMARY_MISMATCH");
  }
  const duplicateDateCount = countDuplicates(
    snapshots.map((snapshot) => snapshot.date),
  );
  const duplicatePathCount = countDuplicates(
    snapshots.map((snapshot) => snapshot.path),
  );
  const sorted = [...snapshots].sort(
    (left, right) =>
      String(left.date).localeCompare(String(right.date)) ||
      String(left.path).localeCompare(String(right.path)),
  );
  if (JSON.stringify(snapshots) !== JSON.stringify(sorted)) {
    failedReasons.push("SNAPSHOTS_NOT_DATE_SORTED");
  }
  const expectedQuality = {
    allSnapshotsPass:
      snapshots.length > 0 &&
      expectedSummary.failCount === 0 &&
      snapshots.every((snapshot) => snapshot.hashMatched === true),
    duplicateDateCount,
    duplicatePathCount,
    missingSnapshotFileCount: Number(
      payload?.quality?.missingSnapshotFileCount ?? 0,
    ),
    hashMismatchCount: Number(
      payload?.quality?.hashMismatchCount ?? 0,
    ),
    blockedReasons: payload?.quality?.blockedReasons ?? [],
  };
  if (
    JSON.stringify(payload?.quality) !==
    JSON.stringify(expectedQuality)
  ) {
    failedReasons.push("QUALITY_MISMATCH");
  }
  if (duplicateDateCount > 0) failedReasons.push("DUPLICATE_DATE");
  if (duplicatePathCount > 0) failedReasons.push("DUPLICATE_PATH");
  const recomputedHash = indexSemanticHash(payload);
  const hashMatched = payload?.contentHash === recomputedHash;
  if (!hashMatched) failedReasons.push("CONTENT_HASH_MISMATCH");

  return {
    checkStatus: failedReasons.length === 0 ? "PASS" : "FAIL",
    snapshotCount: expectedSummary.snapshotCount,
    raceCount: expectedSummary.raceCount,
    riderCount: expectedSummary.riderCount,
    fullRegistrationRaceCount:
      expectedSummary.fullRegistrationRaceCount,
    blockedRaceCount: expectedSummary.blockedRaceCount,
    contentHash: payload?.contentHash ?? null,
    recomputedHash,
    hashMatched,
    failedReasons: [...new Set(failedReasons)],
  };
}

export async function validateSnapshotIndex(root, payload) {
  const metadata = validateSnapshotIndexMetadata(payload);
  const failedReasons = [...metadata.failedReasons];
  const snapshots = Array.isArray(payload?.snapshots)
    ? payload.snapshots
    : [];
  const snapshotRoot = path.resolve(root, SNAPSHOT_ROOT);
  let missingSnapshotFileCount = 0;
  let hashMismatchCount = 0;

  for (const item of snapshots) {
    const file = path.resolve(root, normalizeText(item?.path));
    if (
      !file.startsWith(`${snapshotRoot}${path.sep}`) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(
        path.basename(path.dirname(file)),
      ) ||
      path.basename(file) !== "keirin-jp-entries.generated.json"
    ) {
      failedReasons.push("SNAPSHOT_PATH_OUT_OF_SCOPE");
      missingSnapshotFileCount += 1;
      continue;
    }
    let snapshot;
    let fileStat;
    try {
      [snapshot, fileStat] = await Promise.all([
        JSON.parse(await readFile(file, "utf8")),
        stat(file),
      ]);
    } catch {
      failedReasons.push("SNAPSHOT_FILE_MISSING");
      missingSnapshotFileCount += 1;
      continue;
    }
    const validation = validateSnapshot(snapshot);
    if (validation.checkStatus !== "PASS") {
      failedReasons.push("SNAPSHOT_CHECK_FAILED");
    }
    if (
      item.contentHash !== snapshot.contentHash ||
      validation.hashMatched !== true
    ) {
      failedReasons.push("SNAPSHOT_HASH_MISMATCH");
      hashMismatchCount += 1;
    }
    const expectedItem = {
      date: snapshot.date,
      path: item.path,
      schemaVersion: snapshot.schemaVersion,
      source: snapshot.source,
      sourceGeneratedAt: snapshot.sourceGeneratedAt,
      contentHash: snapshot.contentHash,
      raceCount: validation.raceCount,
      riderCount: validation.riderCount,
      fullRegistrationRaceCount:
        validation.fullRegistrationRaceCount,
      blockedRaceCount: validation.blockedRaceCount,
      checkStatus: validation.checkStatus,
      hashMatched: validation.hashMatched,
      sizeBytes: fileStat.size,
    };
    if (JSON.stringify(item) !== JSON.stringify(expectedItem)) {
      failedReasons.push("SNAPSHOT_INDEX_ENTRY_MISMATCH");
    }
  }

  const duplicateDateCount = countDuplicates(
    snapshots.map((snapshot) => snapshot.date),
  );
  const duplicatePathCount = countDuplicates(
    snapshots.map((snapshot) => snapshot.path),
  );
  const expectedBlockedReasons = [];
  if (snapshots.length === 0) {
    expectedBlockedReasons.push("SNAPSHOT_COUNT_ZERO");
  }
  if (snapshots.some((snapshot) => snapshot.checkStatus !== "PASS")) {
    expectedBlockedReasons.push("SNAPSHOT_CHECK_FAILED");
  }
  if (duplicateDateCount > 0) {
    expectedBlockedReasons.push("DUPLICATE_DATE");
  }
  if (duplicatePathCount > 0) {
    expectedBlockedReasons.push("DUPLICATE_PATH");
  }
  if (missingSnapshotFileCount > 0) {
    expectedBlockedReasons.push("SNAPSHOT_FILE_MISSING");
  }
  if (hashMismatchCount > 0) {
    expectedBlockedReasons.push("SNAPSHOT_HASH_MISMATCH");
  }
  const expectedQuality = {
    allSnapshotsPass:
      snapshots.length > 0 &&
      snapshots.every(
        (snapshot) =>
          snapshot.checkStatus === "PASS" &&
          snapshot.hashMatched === true,
      ) &&
      missingSnapshotFileCount === 0 &&
      hashMismatchCount === 0,
    duplicateDateCount,
    duplicatePathCount,
    missingSnapshotFileCount,
    hashMismatchCount,
    blockedReasons: expectedBlockedReasons,
  };
  if (
    JSON.stringify(payload?.quality) !==
    JSON.stringify(expectedQuality)
  ) {
    failedReasons.push("QUALITY_FILE_AUDIT_MISMATCH");
  }

  return {
    ...metadata,
    checkStatus: failedReasons.length === 0 ? "PASS" : "FAIL",
    failedReasons: [...new Set(failedReasons)],
    quality: expectedQuality,
  };
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
