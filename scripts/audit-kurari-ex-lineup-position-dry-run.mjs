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

const SAFE_EXAMPLE_LIMIT = 5;
const BLOCKED_EXAMPLE_LIMIT = 10;

const REASON_CODES = {
  NO_STARTERS: "NO_STARTERS",
  NO_REGISTRATION_NO: "NO_REGISTRATION_NO",
  NO_LINEUP: "NO_LINEUP",
  NO_LINEUP_LINES: "NO_LINEUP_LINES",
  LINE_MEMBER_UNRESOLVED: "LINE_MEMBER_UNRESOLVED",
  LINE_MEMBER_DUPLICATE: "LINE_MEMBER_DUPLICATE",
  LINE_MEMBER_NOT_IN_STARTERS: "LINE_MEMBER_NOT_IN_STARTERS",
  STARTER_NOT_IN_ANY_LINE: "STARTER_NOT_IN_ANY_LINE",
  UNKNOWN_LINE_PRESENT: "UNKNOWN_LINE_PRESENT",
  UNKNOWN_STARTER: "UNKNOWN_STARTER",
  SAFE: "SAFE",
};

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim();
}

function normalizeRegistrationNo(value) {
  return normalizeText(value);
}

function isValidRegistrationNo(value) {
  return /^\d{6}$/.test(normalizeRegistrationNo(value));
}

function toFiniteInteger(value) {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  const normalized = normalizeText(value);
  if (!/^\d+$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function extractCarNo(value) {
  if (typeof value === "number" || typeof value === "string") {
    return toFiniteInteger(value);
  }
  if (!value || typeof value !== "object") return null;
  return (
    toFiniteInteger(value.carNo) ??
    toFiniteInteger(value.vehicleNo) ??
    toFiniteInteger(value.number) ??
    null
  );
}

function extractLineRegistrationNo(value) {
  if (!value || typeof value !== "object") return "";
  return normalizeRegistrationNo(
    value.registrationNo ??
    value.registrationNumber ??
    value.riderRegistrationNo,
  );
}

function toPublicFile(fileValue) {
  const relative = normalizeText(fileValue).replace(/^\/+/, "");
  const resolved = path.resolve(PUBLIC_ROOT, relative);
  const dailyRoot = path.resolve(HISTORY_ROOT, "daily");
  const withinDailyRoot =
    resolved === dailyRoot ||
    resolved.startsWith(`${dailyRoot}${path.sep}`);
  if (!withinDailyRoot) {
    throw new Error(`history index contains out-of-scope file: ${fileValue}`);
  }
  return resolved;
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function createSummary() {
  return {
    inspectedRaceCount: 0,
    racesWithRaceId: 0,
    racesUsingRaceKeyReference: 0,
    racesWithStarterArray: 0,
    racesWithCompleteRegistrationNo: 0,
    racesWithLineup: 0,
    racesWithLineupLines: 0,
    racesWithSafeLineup: 0,
    racesBlockedByMissingLineup: 0,
    racesBlockedByUnresolvedMember: 0,
    racesBlockedByDuplicateMember: 0,
    racesBlockedByUnknownStarter: 0,
    racesWithCompletePositionDerivation: 0,
    dryRunLineFactCount: 0,
    dryRunPositionFactCount: 0,
    roleCounts: {
      front: 0,
      bante: 0,
      third: 0,
      single: 0,
      unknown: 0,
      blocked: 0,
    },
    lineSizeCounts: {
      "1": 0,
      "2": 0,
      "3": 0,
      "4+": 0,
      unknown: 0,
    },
    statusCounts: {
      safe: 0,
      partial: 0,
      "source-missing": 0,
      "unresolved-member": 0,
      "duplicate-member": 0,
      "unknown-starter": 0,
      "incomplete-lineup": 0,
      blocked: 0,
    },
    blockedReasonCounts: {},
    safeExamples: [],
    blockedExamples: [],
  };
}

function raceReference(race) {
  const raceId = normalizeText(race?.raceId);
  const raceKey = normalizeText(race?.raceKey);
  return raceId || raceKey || "(missing race reference)";
}

function raceVenue(race) {
  const venueName = normalizeText(race?.venueName);
  const venueKey = normalizeText(race?.venueKey);
  return venueName || venueKey || "(unknown venue)";
}

function exampleFor(race, reason, detail) {
  return {
    raceId: raceReference(race),
    reason,
    venue: raceVenue(race),
    date: normalizeText(race?.date) || "(unknown date)",
    detail,
  };
}

function incrementReason(summary, reason) {
  summary.blockedReasonCounts[reason] =
    (summary.blockedReasonCounts[reason] ?? 0) + 1;
}

function classifyBlockedStatus(reason) {
  if (
    reason === REASON_CODES.NO_LINEUP ||
    reason === REASON_CODES.NO_LINEUP_LINES
  ) {
    return "source-missing";
  }
  if (
    reason === REASON_CODES.LINE_MEMBER_UNRESOLVED ||
    reason === REASON_CODES.NO_REGISTRATION_NO
  ) {
    return "unresolved-member";
  }
  if (reason === REASON_CODES.LINE_MEMBER_DUPLICATE) {
    return "duplicate-member";
  }
  if (
    reason === REASON_CODES.NO_STARTERS ||
    reason === REASON_CODES.UNKNOWN_STARTER ||
    reason === REASON_CODES.LINE_MEMBER_NOT_IN_STARTERS
  ) {
    return "unknown-starter";
  }
  if (
    reason === REASON_CODES.STARTER_NOT_IN_ANY_LINE ||
    reason === REASON_CODES.UNKNOWN_LINE_PRESENT
  ) {
    return "incomplete-lineup";
  }
  return "blocked";
}

function roleFor(positionInLine, lineSize) {
  if (lineSize === 1) return "single";
  if (positionInLine === 1) return "front";
  if (positionInLine === 2) return "bante";
  return "third";
}

function detectExplicitUnknownLine(lineup) {
  if (!lineup || typeof lineup !== "object") return false;
  if (lineup.unknownLine === true) return true;
  if (Array.isArray(lineup.unknownLines) && lineup.unknownLines.length > 0) {
    return true;
  }
  const status = normalizeText(lineup.status).toLowerCase();
  return /(unknown|ambiguous|partial|blocked)/u.test(status);
}

function normalizeStarters(race) {
  const rawStarters = Array.isArray(race?.starters) ? race.starters : [];
  const starters = [];
  const carNos = new Set();
  const registrationNos = new Set();
  const issues = [];

  for (const starter of rawStarters) {
    const carNo = extractCarNo(starter);
    const registrationNo = normalizeRegistrationNo(starter?.registrationNo);

    if (!Number.isInteger(carNo) || carNo <= 0) {
      issues.push(`invalid carNo for ${normalizeText(starter?.name) || "unknown starter"}`);
      continue;
    }
    if (!isValidRegistrationNo(registrationNo)) {
      issues.push(`registrationNo missing for carNo ${carNo}`);
    }
    if (carNos.has(carNo)) {
      issues.push(`duplicate starter carNo ${carNo}`);
    }
    if (isValidRegistrationNo(registrationNo) && registrationNos.has(registrationNo)) {
      issues.push(`duplicate starter registrationNo ${registrationNo}`);
    }

    carNos.add(carNo);
    if (isValidRegistrationNo(registrationNo)) {
      registrationNos.add(registrationNo);
    }
    starters.push({
      carNo,
      registrationNo,
      name: normalizeText(starter?.name),
    });
  }

  return {
    rawStarters,
    starters,
    issues,
    completeRegistrationNo:
      rawStarters.length > 0 &&
      starters.length === rawStarters.length &&
      issues.length === 0 &&
      starters.every((starter) => isValidRegistrationNo(starter.registrationNo)),
  };
}

function inspectRace(race) {
  const starterInfo = normalizeStarters(race);
  const declaredStarterCount = toFiniteInteger(race?.starterCount) ?? 0;

  if (starterInfo.rawStarters.length === 0) {
    return {
      safe: false,
      reason: REASON_CODES.NO_STARTERS,
      detail: `starter array missing or empty; declared starterCount=${declaredStarterCount}`,
      starterInfo,
    };
  }

  if (!starterInfo.completeRegistrationNo) {
    const hasInvalidRegistration = starterInfo.starters.some(
      (starter) => !isValidRegistrationNo(starter.registrationNo),
    );
    return {
      safe: false,
      reason: hasInvalidRegistration
        ? REASON_CODES.NO_REGISTRATION_NO
        : REASON_CODES.UNKNOWN_STARTER,
      detail: starterInfo.issues.join("; ") || "starter identity is incomplete",
      starterInfo,
    };
  }

  const lineup = race?.lineup;
  if (!lineup || typeof lineup !== "object") {
    return {
      safe: false,
      reason: REASON_CODES.NO_LINEUP,
      detail: "lineup object missing",
      starterInfo,
    };
  }

  const rawLines = lineup.lines;
  if (!Array.isArray(rawLines) || rawLines.length === 0) {
    return {
      safe: false,
      reason: REASON_CODES.NO_LINEUP_LINES,
      detail: `lineup.lines missing or empty; status=${normalizeText(lineup.status) || "unknown"}`,
      starterInfo,
    };
  }

  if (detectExplicitUnknownLine(lineup)) {
    return {
      safe: false,
      reason: REASON_CODES.UNKNOWN_LINE_PRESENT,
      detail: `lineup status indicates unknown or partial; status=${normalizeText(lineup.status) || "unknown"}`,
      starterInfo,
    };
  }

  const starterByCarNo = new Map(
    starterInfo.starters.map((starter) => [starter.carNo, starter]),
  );
  const usedRegistrationNos = new Set();
  const lineFacts = [];
  const positionFacts = [];

  for (let lineIndex = 0; lineIndex < rawLines.length; lineIndex += 1) {
    const rawLine = rawLines[lineIndex];
    if (!Array.isArray(rawLine) || rawLine.length === 0) {
      return {
        safe: false,
        reason: REASON_CODES.UNKNOWN_LINE_PRESENT,
        detail: `line ${lineIndex + 1} is not a non-empty array`,
        starterInfo,
      };
    }

    const memberRegistrationNos = [];
    for (let memberIndex = 0; memberIndex < rawLine.length; memberIndex += 1) {
      const rawMember = rawLine[memberIndex];
      const carNo = extractCarNo(rawMember);
      if (!Number.isInteger(carNo)) {
        return {
          safe: false,
          reason: REASON_CODES.LINE_MEMBER_UNRESOLVED,
          detail: `line ${lineIndex + 1} member ${memberIndex + 1} has no safe carNo`,
          starterInfo,
        };
      }

      const starter = starterByCarNo.get(carNo);
      if (!starter) {
        return {
          safe: false,
          reason: REASON_CODES.LINE_MEMBER_NOT_IN_STARTERS,
          detail: `line ${lineIndex + 1} contains carNo ${carNo}, absent from starters`,
          starterInfo,
        };
      }

      const directRegistrationNo = extractLineRegistrationNo(rawMember);
      if (
        directRegistrationNo &&
        directRegistrationNo !== starter.registrationNo
      ) {
        return {
          safe: false,
          reason: REASON_CODES.LINE_MEMBER_NOT_IN_STARTERS,
          detail: `line ${lineIndex + 1} carNo ${carNo} registrationNo mismatch`,
          starterInfo,
        };
      }

      if (!isValidRegistrationNo(starter.registrationNo)) {
        return {
          safe: false,
          reason: REASON_CODES.LINE_MEMBER_UNRESOLVED,
          detail: `line ${lineIndex + 1} carNo ${carNo} has unresolved registrationNo`,
          starterInfo,
        };
      }

      if (usedRegistrationNos.has(starter.registrationNo)) {
        return {
          safe: false,
          reason: REASON_CODES.LINE_MEMBER_DUPLICATE,
          detail: `registrationNo ${starter.registrationNo} appears in multiple line positions`,
          starterInfo,
        };
      }

      usedRegistrationNos.add(starter.registrationNo);
      memberRegistrationNos.push(starter.registrationNo);
    }

    const lineSize = memberRegistrationNos.length;
    const lineId = `line-${lineIndex + 1}`;
    lineFacts.push({
      raceReference: raceReference(race),
      lineId,
      lineOrder: lineIndex + 1,
      lineSize,
      memberRegistrationNos,
      unknownLine: false,
      parseConfidence: "confirmed-from-complete-history-lineup",
    });

    memberRegistrationNos.forEach((registrationNo, memberIndex) => {
      const positionInLine = memberIndex + 1;
      positionFacts.push({
        raceReference: raceReference(race),
        registrationNo,
        lineId,
        positionInLine,
        roleKey: roleFor(positionInLine, lineSize),
        roleStatus: "available",
        roleConfidence: "confirmed-from-complete-history-lineup",
      });
    });
  }

  const missingStarters = starterInfo.starters
    .filter((starter) => !usedRegistrationNos.has(starter.registrationNo))
    .map((starter) => `${starter.carNo}:${starter.registrationNo}`);

  if (missingStarters.length > 0) {
    return {
      safe: false,
      reason: REASON_CODES.STARTER_NOT_IN_ANY_LINE,
      detail: `starters missing from lineup: ${missingStarters.join(", ")}`,
      starterInfo,
    };
  }

  return {
    safe: true,
    reason: REASON_CODES.SAFE,
    detail: `${lineFacts.length} lines / ${positionFacts.length} positions`,
    starterInfo,
    lineFacts,
    positionFacts,
  };
}

function recordBlocked(summary, race, result) {
  const reason = result.reason;
  incrementReason(summary, reason);
  const status = classifyBlockedStatus(reason);
  summary.statusCounts[status] += 1;

  if (
    reason === REASON_CODES.NO_LINEUP ||
    reason === REASON_CODES.NO_LINEUP_LINES
  ) {
    summary.racesBlockedByMissingLineup += 1;
  }
  if (
    reason === REASON_CODES.LINE_MEMBER_UNRESOLVED ||
    reason === REASON_CODES.NO_REGISTRATION_NO
  ) {
    summary.racesBlockedByUnresolvedMember += 1;
  }
  if (reason === REASON_CODES.LINE_MEMBER_DUPLICATE) {
    summary.racesBlockedByDuplicateMember += 1;
  }
  if (
    reason === REASON_CODES.NO_STARTERS ||
    reason === REASON_CODES.UNKNOWN_STARTER ||
    reason === REASON_CODES.LINE_MEMBER_NOT_IN_STARTERS ||
    reason === REASON_CODES.STARTER_NOT_IN_ANY_LINE
  ) {
    summary.racesBlockedByUnknownStarter += 1;
  }

  const parsedStarterCount = result.starterInfo?.rawStarters?.length ?? 0;
  const declaredStarterCount = toFiniteInteger(race?.starterCount) ?? 0;
  if (parsedStarterCount > 0) {
    summary.roleCounts.blocked += parsedStarterCount;
  } else {
    summary.roleCounts.unknown += declaredStarterCount;
  }
  summary.lineSizeCounts.unknown += 1;

  if (summary.blockedExamples.length < BLOCKED_EXAMPLE_LIMIT) {
    summary.blockedExamples.push(
      exampleFor(race, reason, result.detail),
    );
  }
}

function recordSafe(summary, race, result) {
  summary.racesWithSafeLineup += 1;
  summary.racesWithCompletePositionDerivation += 1;
  summary.dryRunLineFactCount += result.lineFacts.length;
  summary.dryRunPositionFactCount += result.positionFacts.length;
  summary.statusCounts.safe += 1;

  for (const fact of result.lineFacts) {
    if (fact.lineSize === 1) summary.lineSizeCounts["1"] += 1;
    else if (fact.lineSize === 2) summary.lineSizeCounts["2"] += 1;
    else if (fact.lineSize === 3) summary.lineSizeCounts["3"] += 1;
    else if (fact.lineSize >= 4) summary.lineSizeCounts["4+"] += 1;
  }
  for (const fact of result.positionFacts) {
    summary.roleCounts[fact.roleKey] += 1;
  }

  if (summary.safeExamples.length < SAFE_EXAMPLE_LIMIT) {
    summary.safeExamples.push(
      exampleFor(race, REASON_CODES.SAFE, result.detail),
    );
  }
}

async function main() {
  const [historyIndex, historyStatus] = await Promise.all([
    readJson(HISTORY_INDEX_FILE),
    readJson(HISTORY_STATUS_FILE),
  ]);

  const summary = createSummary();
  const files = Array.isArray(historyIndex.items)
    ? historyIndex.items.map((entry) => toPublicFile(entry.file))
    : [];

  for (const file of files) {
    const daily = await readJson(file);
    const races = Array.isArray(daily.items) ? daily.items : [];

    for (const race of races) {
      summary.inspectedRaceCount += 1;
      if (normalizeText(race?.raceId)) summary.racesWithRaceId += 1;
      else if (normalizeText(race?.raceKey)) {
        summary.racesUsingRaceKeyReference += 1;
      }

      const starters = Array.isArray(race?.starters) ? race.starters : [];
      if (starters.length > 0) summary.racesWithStarterArray += 1;
      if (
        starters.length > 0 &&
        starters.every((starter) =>
          isValidRegistrationNo(starter?.registrationNo),
        )
      ) {
        summary.racesWithCompleteRegistrationNo += 1;
      }
      if (race?.lineup && typeof race.lineup === "object") {
        summary.racesWithLineup += 1;
      }
      if (
        Array.isArray(race?.lineup?.lines) &&
        race.lineup.lines.length > 0
      ) {
        summary.racesWithLineupLines += 1;
      }

      const result = inspectRace(race);
      if (result.safe) recordSafe(summary, race, result);
      else recordBlocked(summary, race, result);
    }
  }

  const expectedRaceCount = Number(historyIndex.raceCount ?? 0);
  if (
    Number.isFinite(expectedRaceCount) &&
    expectedRaceCount > 0 &&
    expectedRaceCount !== summary.inspectedRaceCount
  ) {
    throw new Error(
      `history index raceCount mismatch: expected ${expectedRaceCount}, inspected ${summary.inspectedRaceCount}`,
    );
  }

  console.log("[kurari-ex lineup / position dry-run audit]");
  console.log(`historyIndex: ${path.relative(ROOT, HISTORY_INDEX_FILE).replaceAll("\\", "/")}`);
  console.log(`historyStatus: ${path.relative(ROOT, HISTORY_STATUS_FILE).replaceAll("\\", "/")}`);
  console.log(`historyStatusLineupParsedCount: ${historyStatus.lineupParsedCount ?? "unknown"}`);
  console.log("identityFallbackUsed: false");
  console.log("writesPerformed: false");
  console.log("");

  const scalarKeys = [
    "inspectedRaceCount",
    "racesWithRaceId",
    "racesUsingRaceKeyReference",
    "racesWithStarterArray",
    "racesWithCompleteRegistrationNo",
    "racesWithLineup",
    "racesWithLineupLines",
    "racesWithSafeLineup",
    "racesBlockedByMissingLineup",
    "racesBlockedByUnresolvedMember",
    "racesBlockedByDuplicateMember",
    "racesBlockedByUnknownStarter",
    "racesWithCompletePositionDerivation",
    "dryRunLineFactCount",
    "dryRunPositionFactCount",
  ];
  for (const key of scalarKeys) {
    console.log(`${key}: ${summary[key]}`);
  }

  console.log("");
  console.log(`roleCounts: ${JSON.stringify(summary.roleCounts)}`);
  console.log(`lineSizeCounts: ${JSON.stringify(summary.lineSizeCounts)}`);
  console.log(`statusCounts: ${JSON.stringify(summary.statusCounts)}`);
  console.log(`blockedReasonCounts: ${JSON.stringify(summary.blockedReasonCounts)}`);
  console.log("");
  console.log(`safeExamples: ${JSON.stringify(summary.safeExamples, null, 2)}`);
  console.log(`blockedExamples: ${JSON.stringify(summary.blockedExamples, null, 2)}`);
}

main().catch((error) => {
  console.error("[kurari-ex lineup / position dry-run audit] failed");
  console.error(error);
  process.exitCode = 1;
});
