import { readFile } from "node:fs/promises";
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
const ENTRIES_FILE = path.join(
  PUBLIC_ROOT,
  "data",
  "races",
  "keirin-jp-entries.generated.json",
);
const TODAY_FILE = path.join(
  PUBLIC_ROOT,
  "data",
  "races",
  "today.generated.json",
);

const SNAPSHOT_SCHEMA_VERSION =
  "kurari-ex-entry-snapshot/v1-dry-run";
const BRIDGE_VERSION = "kurari-ex-history-bridge/v1-dry-run";
const SOURCE_NAME = "keirin-jp-entries";
const EXAMPLE_LIMIT = 5;
const STARTER_SAMPLE_LIMIT = 3;

const JOIN_TYPES = [
  "raceId",
  "raceKey",
  "dateVenueKeyRaceNumber",
  "dateVenueNameRaceNumber",
];

const BLOCKED_REASON_TAXONOMY = [
  "ENTRY_SNAPSHOT_NOT_FOUND",
  "RACE_JOIN_KEY_MISSING",
  "AMBIGUOUS_ENTRY_MATCH",
  "TODAY_RIDERS_MISSING",
  "STARTER_COUNT_MISMATCH",
  "RIDER_COUNT_MISMATCH",
  "CAR_NO_INVALID",
  "CAR_NO_MISSING",
  "DUPLICATE_CAR_NO",
  "ENTRY_CAR_NO_NOT_IN_TODAY",
  "TODAY_CAR_NO_NOT_IN_ENTRY",
  "REGISTRATION_NO_MISSING",
  "REGISTRATION_NO_INVALID",
  "DUPLICATE_REGISTRATION_NO",
  "SOURCE_METADATA_MISSING",
  "UNSAFE_JOIN_KEY",
  "RESULT_OR_LINEUP_ONLY_SOURCE",
  "NAME_MATCH_REQUIRED_FAKE_PROHIBITED",
];

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

function increment(counter, key, amount = 1) {
  counter[key] = (counter[key] ?? 0) + amount;
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

function inspectEntries(entries, expectedCount = null) {
  const carNos = entries.map((entry) => toInteger(entry?.carNo));
  const registrationNos = entries.map((entry) =>
    normalizeText(entry?.registrationNo),
  );
  const missingCarNo = carNos.some((carNo) => carNo === null);
  const invalidCarNo = carNos.some(
    (carNo) =>
      carNo !== null && (!Number.isInteger(carNo) || carNo < 1 || carNo > 9),
  );
  const duplicateCarNo =
    carNos.filter((carNo) => carNo !== null).length !==
    new Set(carNos.filter((carNo) => carNo !== null)).size;
  const missingRegistrationNo = registrationNos.some((value) => !value);
  const invalidRegistrationNo = registrationNos.some(
    (value) => value && !isValidRegistrationNo(value),
  );
  const validRegistrationNos = registrationNos.filter(
    isValidRegistrationNo,
  );
  const duplicateRegistrationNo =
    validRegistrationNos.length !== new Set(validRegistrationNos).size;
  const nameComplete = entries.every(
    (entry) => normalizeText(entry?.name).length > 0,
  );
  const starterCountMatched =
    expectedCount === null ||
    (expectedCount > 0 && entries.length === expectedCount);
  const blockedReasons = [];
  if (entries.length === 0) blockedReasons.push("ENTRY_SNAPSHOT_NOT_FOUND");
  if (!starterCountMatched) {
    blockedReasons.push("STARTER_COUNT_MISMATCH");
  }
  if (missingCarNo) blockedReasons.push("CAR_NO_MISSING");
  if (invalidCarNo) blockedReasons.push("CAR_NO_INVALID");
  if (duplicateCarNo) blockedReasons.push("DUPLICATE_CAR_NO");
  if (missingRegistrationNo) {
    blockedReasons.push("REGISTRATION_NO_MISSING");
  }
  if (invalidRegistrationNo) {
    blockedReasons.push("REGISTRATION_NO_INVALID");
  }
  if (duplicateRegistrationNo) {
    blockedReasons.push("DUPLICATE_REGISTRATION_NO");
  }

  return {
    entryParsed: entries.length > 0,
    registrationComplete:
      entries.length > 0 &&
      validRegistrationNos.length === entries.length,
    carNoUnique: !missingCarNo && !invalidCarNo && !duplicateCarNo,
    registrationNoUnique:
      !missingRegistrationNo &&
      !invalidRegistrationNo &&
      !duplicateRegistrationNo,
    starterCountMatched,
    nameComplete,
    entryCount: entries.length,
    registrationNoFilledCount: validRegistrationNos.length,
    carNos,
    registrationNos,
    blockedReasons,
    full:
      entries.length > 0 &&
      blockedReasons.length === 0 &&
      nameComplete &&
      validRegistrationNos.length === entries.length,
  };
}

function buildVirtualSnapshot(payload) {
  const races = [];
  const blockedReasonCounts = {};
  const venues = new Set();
  const dates = [];
  let riderCount = 0;
  let fullRaceCount = 0;
  let blockedRaceCount = 0;

  for (const venue of Array.isArray(payload?.venues) ? payload.venues : []) {
    for (const race of Array.isArray(venue?.races) ? venue.races : []) {
      const date = normalizeText(race?.date ?? venue?.date ?? payload?.date);
      const entries = Array.isArray(race?.entries) ? race.entries : [];
      const declaredCount =
        toInteger(race?.quality?.entryCount) ?? entries.length;
      const quality = inspectEntries(entries, declaredCount);
      if (
        !normalizeText(payload?.source) ||
        !normalizeText(payload?.generatedAt)
      ) {
        quality.blockedReasons.push("SOURCE_METADATA_MISSING");
        quality.full = false;
      }
      for (const reason of quality.blockedReasons) {
        increment(blockedReasonCounts, reason);
      }
      if (quality.full) fullRaceCount += 1;
      else blockedRaceCount += 1;
      riderCount += entries.length;
      if (date) dates.push(date);
      venues.add(
        normalizeVenueName(venue?.venueName ?? venue?.venue) ||
          normalizeText(venue?.venueCode),
      );

      races.push({
        raceId: normalizeText(race?.raceId) || null,
        raceKey: normalizeText(race?.raceKey) || null,
        date,
        venueKey:
          normalizeText(
            race?.venueKey ?? venue?.venueKey ?? venue?.slug,
          ) || null,
        venueName: normalizeVenueName(
          race?.venueName ?? venue?.venueName ?? venue?.venue,
        ),
        raceNumber: toInteger(race?.raceNumber ?? race?.raceNo),
        starterCount: declaredCount,
        entries: entries.map((entry) => ({
          carNo: toInteger(entry?.carNo),
          name: normalizeText(entry?.name),
          registrationNo: normalizeText(entry?.registrationNo),
          prefecture: normalizeText(entry?.prefecture),
          age: toInteger(entry?.age),
          raceClass: normalizeText(entry?.raceClass),
          previousClass: normalizeText(entry?.previousClass),
          graduationTerm: normalizeText(entry?.graduationTerm),
          style: normalizeText(entry?.style),
        })),
        quality: {
          entryParsed: quality.entryParsed,
          registrationComplete: quality.registrationComplete,
          carNoUnique: quality.carNoUnique,
          registrationNoUnique: quality.registrationNoUnique,
          starterCountMatched: quality.starterCountMatched,
          blockedReasons: [...quality.blockedReasons],
          full: quality.full,
        },
      });
    }
  }

  dates.sort();
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    source: SOURCE_NAME,
    sourceGeneratedAt: normalizeText(payload?.generatedAt),
    date: normalizeText(payload?.date),
    bridgeVersion: BRIDGE_VERSION,
    races,
    audit: {
      virtualSnapshotRaceCount: races.length,
      virtualSnapshotRiderCount: riderCount,
      virtualSnapshotFullRegistrationRaceCount: fullRaceCount,
      virtualSnapshotBlockedRaceCount: blockedRaceCount,
      virtualSnapshotBlockedReasons: blockedReasonCounts,
      virtualSnapshotDateRange: {
        from: dates[0] ?? null,
        to: dates.at(-1) ?? null,
      },
      virtualSnapshotVenueCount: venues.size,
    },
  };
}

function flattenTodayRaces(payload) {
  const races = [];
  for (const venue of Array.isArray(payload?.venues) ? payload.venues : []) {
    const venueRaces = Array.isArray(venue?.races) ? venue.races : [];
    const raceIds = Array.isArray(venue?.raceIds) ? venue.raceIds : [];
    venueRaces.forEach((race, index) => {
      races.push({
        raceId:
          normalizeText(race?.raceId ?? raceIds[index]) || null,
        raceKey: normalizeText(race?.raceKey) || null,
        date: normalizeText(race?.date ?? venue?.date ?? payload?.date),
        venueKey:
          normalizeText(
            race?.venueKey ?? race?.slug ?? venue?.venueKey ?? venue?.slug,
          ) || null,
        venueName: normalizeVenueName(
          race?.venueName ??
            race?.venue ??
            venue?.venueName ??
            venue?.venue,
        ),
        raceNumber: toInteger(race?.raceNumber ?? race?.raceNo),
        riders: Array.isArray(race?.riders) ? race.riders : [],
      });
    });
  }
  return races;
}

function joinKey(item, type) {
  if (type === "raceId") return normalizeText(item?.raceId);
  if (type === "raceKey") return normalizeText(item?.raceKey);
  if (type === "dateVenueKeyRaceNumber") {
    return item?.date && item?.venueKey && item?.raceNumber
      ? `${item.date}|${item.venueKey}|${item.raceNumber}`
      : "";
  }
  if (type === "dateVenueNameRaceNumber") {
    return item?.date && item?.venueName && item?.raceNumber
      ? `${item.date}|${item.venueName}|${item.raceNumber}`
      : "";
  }
  return "";
}

function createSnapshotIndexes(races) {
  return Object.fromEntries(
    JOIN_TYPES.map((type) => {
      const index = new Map();
      for (const race of races) {
        const key = joinKey(race, type);
        if (!key) continue;
        const values = index.get(key) ?? [];
        values.push(race);
        index.set(key, values);
      }
      return [type, index];
    }),
  );
}

function findSnapshotMatch(todayRace, indexes) {
  for (const type of JOIN_TYPES) {
    const key = joinKey(todayRace, type);
    if (!key) continue;
    const matches = indexes[type].get(key) ?? [];
    if (matches.length > 0) return { type, key, matches };
  }
  return { type: null, key: "", matches: [] };
}

function addBlocked(
  summary,
  reason,
  todayRace,
  phase,
  detail,
) {
  increment(summary.blockedReasonCounts, reason);
  if (summary.blockedExamples.length < EXAMPLE_LIMIT) {
    summary.blockedExamples.push({
      date: todayRace?.date ?? null,
      venue: todayRace?.venueName ?? null,
      raceNumber: todayRace?.raceNumber ?? null,
      phase,
      reason,
      detail,
    });
  }
}

function bridgeToday(todayRaces, snapshot) {
  const indexes = createSnapshotIndexes(snapshot.races);
  const summary = {
    todayRaceCount: todayRaces.length,
    todayRidersRaceCount: 0,
    todayRidersWithRegistrationNoBeforeCount: 0,
    todayMatchedRaceCount: 0,
    todayUnmatchedRaceCount: 0,
    todayAmbiguousMatchCount: 0,
    todayJoinKeyCounts: Object.fromEntries(
      JOIN_TYPES.map((type) => [type, 0]),
    ),
    todayFullBridgeCandidateRaceCount: 0,
    todayPartialBridgeCandidateRaceCount: 0,
    todayBlockedRaceCount: 0,
    todayBlockedReasons: {},
    riderEnrichmentCandidateRaceCount: 0,
    riderEnrichmentCandidateRiderCount: 0,
    riderRegistrationNoBeforeCount: 0,
    riderRegistrationNoAfterCandidateCount: 0,
    riderEnrichmentBlockedRaceCount: 0,
    riderEnrichmentBlockedReasons: {},
    carNoJoinMismatchCount: 0,
    duplicateCarNoCount: 0,
    duplicateRegistrationNoCount: 0,
    startersCandidateRaceCount: 0,
    startersCandidateRiderCount: 0,
    startersCandidateFullRaceCount: 0,
    startersCandidateBlockedRaceCount: 0,
    startersCandidateBlockedReasons: {},
    sampleStartersCandidates: [],
    blockedReasonCounts: {},
    blockedExamples: [],
    fullCandidates: [],
  };

  for (const todayRace of todayRaces) {
    if (todayRace.riders.length > 0) {
      summary.todayRidersRaceCount += 1;
    }
    const beforeCount = todayRace.riders.filter((rider) =>
      isValidRegistrationNo(rider?.registrationNo),
    ).length;
    summary.riderRegistrationNoBeforeCount += beforeCount;
    if (
      todayRace.riders.length > 0 &&
      beforeCount === todayRace.riders.length
    ) {
      summary.todayRidersWithRegistrationNoBeforeCount += 1;
    }

    const match = findSnapshotMatch(todayRace, indexes);
    if (match.matches.length === 0) {
      summary.todayUnmatchedRaceCount += 1;
      summary.todayBlockedRaceCount += 1;
      increment(
        summary.todayBlockedReasons,
        "ENTRY_SNAPSHOT_NOT_FOUND",
      );
      addBlocked(
        summary,
        "ENTRY_SNAPSHOT_NOT_FOUND",
        todayRace,
        "today-join",
        "same-race virtual snapshot was not found",
      );
      continue;
    }
    summary.todayMatchedRaceCount += 1;
    summary.todayJoinKeyCounts[match.type] += 1;
    if (match.matches.length > 1) {
      summary.todayAmbiguousMatchCount += 1;
      summary.todayBlockedRaceCount += 1;
      increment(
        summary.todayBlockedReasons,
        "AMBIGUOUS_ENTRY_MATCH",
      );
      addBlocked(
        summary,
        "AMBIGUOUS_ENTRY_MATCH",
        todayRace,
        "today-join",
        `${match.matches.length} snapshot races share the join key`,
      );
      continue;
    }

    const snapshotRace = match.matches[0];
    if (!snapshotRace.quality.full) {
      summary.todayPartialBridgeCandidateRaceCount += 1;
      summary.todayBlockedRaceCount += 1;
      for (const reason of snapshotRace.quality.blockedReasons) {
        increment(summary.todayBlockedReasons, reason);
        addBlocked(
          summary,
          reason,
          todayRace,
          "snapshot-quality",
          "virtual snapshot race failed full-quality validation",
        );
      }
      continue;
    }
    if (todayRace.riders.length === 0) {
      summary.todayBlockedRaceCount += 1;
      summary.riderEnrichmentBlockedRaceCount += 1;
      increment(summary.todayBlockedReasons, "TODAY_RIDERS_MISSING");
      increment(
        summary.riderEnrichmentBlockedReasons,
        "TODAY_RIDERS_MISSING",
      );
      addBlocked(
        summary,
        "TODAY_RIDERS_MISSING",
        todayRace,
        "rider-enrichment",
        "today.riders is empty",
      );
      continue;
    }

    const todayCarNos = todayRace.riders.map((rider) =>
      toInteger(rider?.carNo),
    );
    const entryCarNos = snapshotRace.entries.map((entry) => entry.carNo);
    if (todayRace.riders.length !== snapshotRace.entries.length) {
      summary.todayBlockedRaceCount += 1;
      summary.riderEnrichmentBlockedRaceCount += 1;
      increment(summary.todayBlockedReasons, "RIDER_COUNT_MISMATCH");
      increment(
        summary.riderEnrichmentBlockedReasons,
        "RIDER_COUNT_MISMATCH",
      );
      addBlocked(
        summary,
        "RIDER_COUNT_MISMATCH",
        todayRace,
        "rider-enrichment",
        `${todayRace.riders.length} today riders vs ${snapshotRace.entries.length} entries`,
      );
      continue;
    }
    if (new Set(todayCarNos).size !== todayCarNos.length) {
      summary.duplicateCarNoCount += 1;
      summary.todayBlockedRaceCount += 1;
      summary.riderEnrichmentBlockedRaceCount += 1;
      increment(summary.todayBlockedReasons, "DUPLICATE_CAR_NO");
      increment(
        summary.riderEnrichmentBlockedReasons,
        "DUPLICATE_CAR_NO",
      );
      addBlocked(
        summary,
        "DUPLICATE_CAR_NO",
        todayRace,
        "rider-enrichment",
        "today.riders contains duplicate carNo",
      );
      continue;
    }
    const missingInEntries = todayCarNos.filter(
      (carNo) => !entryCarNos.includes(carNo),
    );
    const missingInToday = entryCarNos.filter(
      (carNo) => !todayCarNos.includes(carNo),
    );
    if (missingInEntries.length > 0 || missingInToday.length > 0) {
      summary.carNoJoinMismatchCount += 1;
      summary.todayBlockedRaceCount += 1;
      summary.riderEnrichmentBlockedRaceCount += 1;
      if (missingInEntries.length > 0) {
        increment(
          summary.todayBlockedReasons,
          "TODAY_CAR_NO_NOT_IN_ENTRY",
        );
        increment(
          summary.riderEnrichmentBlockedReasons,
          "TODAY_CAR_NO_NOT_IN_ENTRY",
        );
        addBlocked(
          summary,
          "TODAY_CAR_NO_NOT_IN_ENTRY",
          todayRace,
          "rider-enrichment",
          `today-only carNos: ${missingInEntries.join(",")}`,
        );
      }
      if (missingInToday.length > 0) {
        increment(
          summary.todayBlockedReasons,
          "ENTRY_CAR_NO_NOT_IN_TODAY",
        );
        increment(
          summary.riderEnrichmentBlockedReasons,
          "ENTRY_CAR_NO_NOT_IN_TODAY",
        );
        addBlocked(
          summary,
          "ENTRY_CAR_NO_NOT_IN_TODAY",
          todayRace,
          "rider-enrichment",
          `entry-only carNos: ${missingInToday.join(",")}`,
        );
      }
      continue;
    }

    const entryByCarNo = new Map(
      snapshotRace.entries.map((entry) => [entry.carNo, entry]),
    );
    const enrichedRiders = todayRace.riders.map((rider) => {
      const entry = entryByCarNo.get(toInteger(rider?.carNo));
      return {
        ...rider,
        registrationNo: entry.registrationNo,
        registrationSource: SOURCE_NAME,
        bridgeStatus: "dry-run-full",
      };
    });
    const afterCount = enrichedRiders.filter((rider) =>
      isValidRegistrationNo(rider.registrationNo),
    ).length;
    summary.riderEnrichmentCandidateRaceCount += 1;
    summary.riderEnrichmentCandidateRiderCount += enrichedRiders.length;
    summary.riderRegistrationNoAfterCandidateCount += afterCount;

    const starters = snapshotRace.entries.map((entry) => ({
      carNo: entry.carNo,
      name: entry.name,
      registrationNo: entry.registrationNo,
      prefecture: entry.prefecture,
      class: entry.raceClass || entry.previousClass,
      period: entry.graduationTerm,
      source: SOURCE_NAME,
      bridgeStatus: "dry-run-full",
      joinKeyType: match.type,
      bridgeVersion: BRIDGE_VERSION,
    }));
    summary.startersCandidateRaceCount += 1;
    summary.startersCandidateRiderCount += starters.length;
    const starterInspection = inspectEntries(
      starters,
      todayRace.riders.length,
    );
    const sourceMetadataComplete = starters.every(
      (starter) =>
        starter.source === SOURCE_NAME &&
        starter.bridgeStatus === "dry-run-full" &&
        starter.joinKeyType === match.type &&
        starter.bridgeVersion === BRIDGE_VERSION,
    );
    if (starterInspection.full && sourceMetadataComplete) {
      summary.todayFullBridgeCandidateRaceCount += 1;
      summary.startersCandidateFullRaceCount += 1;
      summary.fullCandidates.push({
        date: todayRace.date,
        venueName: todayRace.venueName,
        venueKey: todayRace.venueKey,
        raceNumber: todayRace.raceNumber,
        joinKeyType: match.type,
        starters,
      });
      if (
        summary.sampleStartersCandidates.length <
        STARTER_SAMPLE_LIMIT
      ) {
        summary.sampleStartersCandidates.push({
          date: todayRace.date,
          venue: todayRace.venueName,
          raceNumber: todayRace.raceNumber,
          joinKeyType: match.type,
          starterCount: starters.length,
          starters: starters.slice(0, 2).map((starter) => ({
            carNo: starter.carNo,
            name: starter.name,
            registrationNo: starter.registrationNo,
            source: starter.source,
          })),
          omittedRiderCount: Math.max(0, starters.length - 2),
        });
      }
    } else {
      summary.todayBlockedRaceCount += 1;
      summary.startersCandidateBlockedRaceCount += 1;
      const reasons = sourceMetadataComplete
        ? starterInspection.blockedReasons
        : ["SOURCE_METADATA_MISSING"];
      for (const reason of reasons) {
        increment(summary.startersCandidateBlockedReasons, reason);
        addBlocked(
          summary,
          reason,
          todayRace,
          "starters-candidate",
          "starters candidate failed final validation",
        );
      }
    }
  }
  return summary;
}

async function loadHistory(index) {
  const races = [];
  for (const item of Array.isArray(index.items) ? index.items : []) {
    const daily = await readJson(toHistoryFile(item.file));
    races.push(...(Array.isArray(daily.items) ? daily.items : []));
  }
  return races;
}

function auditHistorySameDate(historyRaces, snapshot, bridgeSummary) {
  const snapshotDates = new Set(
    snapshot.races.map((race) => race.date).filter(Boolean),
  );
  const sameDate = historyRaces.filter((race) =>
    snapshotDates.has(normalizeText(race?.date)),
  );
  const noStarters = sameDate.filter(
    (race) =>
      !Array.isArray(race?.starters) ||
      race.starters.length === 0 ||
      race?.quality?.starterParsed === false,
  );
  const starterParsed = sameDate.filter(
    (race) =>
      Array.isArray(race?.starters) &&
      race.starters.length > 0 &&
      race?.quality?.starterParsed === true,
  );
  const fullCandidateKeys = new Set(
    bridgeSummary.fullCandidates.map(
      (race) =>
        `${race.date}|${race.venueName}|${race.raceNumber}`,
    ),
  );
  const potential = noStarters.filter((race) =>
    fullCandidateKeys.has(
      `${normalizeText(race?.date)}|${normalizeVenueName(
        race?.venueName,
      )}|${toInteger(race?.raceNumber)}`,
    ),
  );

  return {
    historyRaceCount: historyRaces.length,
    historySameDateRaceCount: sameDate.length,
    historySameDateNoStartersRaceCount: noStarters.length,
    historySameDateStarterParsedRaceCount: starterParsed.length,
    historySameDatePotentialBridgeRaceCount: potential.length,
    historySameDateBridgeBlockedCount:
      noStarters.length - potential.length,
    historySameDateNote:
      sameDate.length === 0
        ? "virtual snapshot日付は現行history期間外。historyへの候補生成・書き込みは行わない。"
        : "同日historyのNO_STARTERSに対し、一意なFULL候補だけを件数評価した。書き込みは行わない。",
  };
}

function evaluateReadiness(snapshotAudit, bridgeSummary) {
  const checks = [
    {
      label:
        "virtualSnapshotFullRegistrationRaceCount === virtualSnapshotRaceCount",
      passed:
        snapshotAudit.virtualSnapshotFullRegistrationRaceCount ===
        snapshotAudit.virtualSnapshotRaceCount,
    },
    {
      label: "todayFullBridgeCandidateRaceCount === todayRaceCount",
      passed:
        bridgeSummary.todayFullBridgeCandidateRaceCount ===
        bridgeSummary.todayRaceCount,
    },
    {
      label: "riderRegistrationNoAfterCandidateCount > 0",
      passed:
        bridgeSummary.riderRegistrationNoAfterCandidateCount > 0,
    },
    {
      label: "todayBlockedRaceCount === 0",
      passed: bridgeSummary.todayBlockedRaceCount === 0,
    },
    {
      label: "startersCandidateFullRaceCount === todayRaceCount",
      passed:
        bridgeSummary.startersCandidateFullRaceCount ===
        bridgeSummary.todayRaceCount,
    },
    { label: "fakeCompletionPerformed === false", passed: true },
    { label: "writesPerformed === false", passed: true },
  ];
  const passedChecks = checks
    .filter((check) => check.passed)
    .map((check) => check.label);
  const failedChecks = checks
    .filter((check) => !check.passed)
    .map((check) => check.label);
  const ready = failedChecks.length === 0;
  return {
    status: ready ? "READY_FOR_SNAPSHOT_WRITE_DESIGN" : "BLOCKED",
    passedChecks,
    failedChecks,
    nextRecommendedAction: ready
      ? "snapshot write実装の前に、write-if-changed・既存完全snapshot保護・再実行不変性を含む書き込み設計を固定する。"
      : "failedChecksの原因を上流sourceまたはjoin keyで解消し、dry-runを再実行する。",
  };
}

function printSection(label, value) {
  console.log(`\n[${label}]`);
  console.log(JSON.stringify(value, null, 2));
}

async function main() {
  const [
    entriesPayload,
    todayPayload,
    historyIndex,
    historyStatus,
  ] = await Promise.all([
    readJson(ENTRIES_FILE),
    readJson(TODAY_FILE),
    readJson(HISTORY_INDEX_FILE),
    readJson(HISTORY_STATUS_FILE),
  ]);
  const virtualSnapshot = buildVirtualSnapshot(entriesPayload);
  const todayRaces = flattenTodayRaces(todayPayload);
  const bridgeSummary = bridgeToday(todayRaces, virtualSnapshot);
  const historyRaces = await loadHistory(historyIndex);
  const historyImpact = auditHistorySameDate(
    historyRaces,
    virtualSnapshot,
    bridgeSummary,
  );
  const writeDesignReadiness = evaluateReadiness(
    virtualSnapshot.audit,
    bridgeSummary,
  );

  if (
    Number(historyIndex.raceCount) > 0 &&
    Number(historyIndex.raceCount) !== historyRaces.length
  ) {
    throw new Error(
      `history raceCount mismatch: ${historyIndex.raceCount} != ${historyRaces.length}`,
    );
  }
  if (
    Number(historyStatus.raceCount) > 0 &&
    Number(historyStatus.raceCount) !== historyRaces.length
  ) {
    throw new Error(
      `history status raceCount mismatch: ${historyStatus.raceCount} != ${historyRaces.length}`,
    );
  }
  if (
    bridgeSummary.todayMatchedRaceCount +
      bridgeSummary.todayUnmatchedRaceCount !==
    bridgeSummary.todayRaceCount
  ) {
    throw new Error("today match totals are inconsistent");
  }

  const {
    fullCandidates: _fullCandidates,
    ...publicBridgeSummary
  } = bridgeSummary;
  const summary = {
    ...virtualSnapshot.audit,
    ...publicBridgeSummary,
    ...historyImpact,
    blockedReasonTaxonomy: BLOCKED_REASON_TAXONOMY,
    writeDesignReadiness,
    nextRecommendedAction:
      writeDesignReadiness.nextRecommendedAction,
    writesPerformed: false,
    identityFallbackUsed: false,
    fakeCompletionPerformed: false,
    productionJsonGenerated: false,
  };

  console.log("[kurari-ex entry snapshot bridge dry-run]");
  console.log("writesPerformed: false");
  console.log("identityFallbackUsed: false");
  console.log("fakeCompletionPerformed: false");
  console.log("productionJsonGenerated: false");
  console.log(
    "policy: 公式entriesだけをregistrationNo sourceとし、全候補をメモリ上で検証してファイル保存しない。",
  );

  console.log("\n[summary]");
  const scalarKeys = [
    "virtualSnapshotRaceCount",
    "virtualSnapshotRiderCount",
    "virtualSnapshotFullRegistrationRaceCount",
    "virtualSnapshotBlockedRaceCount",
    "todayRaceCount",
    "todayMatchedRaceCount",
    "todayFullBridgeCandidateRaceCount",
    "todayBlockedRaceCount",
    "riderEnrichmentCandidateRaceCount",
    "riderRegistrationNoBeforeCount",
    "riderRegistrationNoAfterCandidateCount",
    "startersCandidateRaceCount",
    "startersCandidateRiderCount",
    "startersCandidateFullRaceCount",
    "historyRaceCount",
    "historySameDateRaceCount",
    "historySameDatePotentialBridgeRaceCount",
  ];
  for (const key of scalarKeys) {
    console.log(`${key}: ${summary[key]}`);
  }
  console.log(
    `todayJoinKeyCounts: ${JSON.stringify(summary.todayJoinKeyCounts)}`,
  );
  console.log(
    `blockedReasonCounts: ${JSON.stringify(summary.blockedReasonCounts)}`,
  );

  printSection("virtualSnapshotAudit", virtualSnapshot.audit);
  printSection("todayBridgeDryRun", {
    todayRaceCount: summary.todayRaceCount,
    todayRidersRaceCount: summary.todayRidersRaceCount,
    todayRidersWithRegistrationNoBeforeCount:
      summary.todayRidersWithRegistrationNoBeforeCount,
    todayMatchedRaceCount: summary.todayMatchedRaceCount,
    todayUnmatchedRaceCount: summary.todayUnmatchedRaceCount,
    todayAmbiguousMatchCount: summary.todayAmbiguousMatchCount,
    todayJoinKeyCounts: summary.todayJoinKeyCounts,
    todayFullBridgeCandidateRaceCount:
      summary.todayFullBridgeCandidateRaceCount,
    todayPartialBridgeCandidateRaceCount:
      summary.todayPartialBridgeCandidateRaceCount,
    todayBlockedRaceCount: summary.todayBlockedRaceCount,
    todayBlockedReasons: summary.todayBlockedReasons,
  });
  printSection("riderEnrichmentDryRun", {
    riderEnrichmentCandidateRaceCount:
      summary.riderEnrichmentCandidateRaceCount,
    riderEnrichmentCandidateRiderCount:
      summary.riderEnrichmentCandidateRiderCount,
    riderRegistrationNoBeforeCount:
      summary.riderRegistrationNoBeforeCount,
    riderRegistrationNoAfterCandidateCount:
      summary.riderRegistrationNoAfterCandidateCount,
    riderEnrichmentBlockedRaceCount:
      summary.riderEnrichmentBlockedRaceCount,
    riderEnrichmentBlockedReasons:
      summary.riderEnrichmentBlockedReasons,
    carNoJoinMismatchCount: summary.carNoJoinMismatchCount,
    duplicateCarNoCount: summary.duplicateCarNoCount,
    duplicateRegistrationNoCount:
      summary.duplicateRegistrationNoCount,
  });
  printSection("startersCandidateDryRun", {
    startersCandidateRaceCount: summary.startersCandidateRaceCount,
    startersCandidateRiderCount: summary.startersCandidateRiderCount,
    startersCandidateFullRaceCount:
      summary.startersCandidateFullRaceCount,
    startersCandidateBlockedRaceCount:
      summary.startersCandidateBlockedRaceCount,
    startersCandidateBlockedReasons:
      summary.startersCandidateBlockedReasons,
    sampleStartersCandidates: summary.sampleStartersCandidates,
  });
  printSection("historySameDateImpact", historyImpact);
  printSection("writeDesignReadiness", writeDesignReadiness);
  printSection("jsonSummary", summary);
}

main().catch((error) => {
  console.error("[kurari-ex entry snapshot bridge dry-run] failed");
  console.error(error);
  process.exitCode = 1;
});
