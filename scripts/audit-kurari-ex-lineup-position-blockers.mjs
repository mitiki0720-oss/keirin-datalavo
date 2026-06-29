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
const HISTORY_INDEX_FILE = path.join(HISTORY_ROOT, "index.generated.json");
const HISTORY_STATUS_FILE = path.join(HISTORY_ROOT, "status.generated.json");
const OFFICIAL_IDENTITY_FILE = path.join(
  KURARI_EX_ROOT,
  "exact",
  "official-rider-identity.generated.json",
);
const RIDER_MASTER_FILE = path.join(
  KURARI_EX_ROOT,
  "exact",
  "rider-master.generated.json",
);

const TOP_LIMIT = 10;
const EXAMPLE_LIMIT = 10;

const REASON = {
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

function extractLineRegistrationNo(value) {
  if (!value || typeof value !== "object") return "";
  return normalizeText(
    value.registrationNo ??
      value.registrationNumber ??
      value.riderRegistrationNo,
  );
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

function increment(counter, key, amount = 1) {
  const normalizedKey = normalizeText(key) || "(unknown)";
  counter[normalizedKey] = (counter[normalizedKey] ?? 0) + amount;
}

function sortedCounter(counter, limit = null) {
  const entries = Object.entries(counter).sort(
    ([leftKey, leftValue], [rightKey, rightValue]) =>
      rightValue - leftValue || leftKey.localeCompare(rightKey, "ja"),
  );
  const selected = limit === null ? entries : entries.slice(0, limit);
  return Object.fromEntries(selected);
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

function hasPrediction(race) {
  const prediction = race?.prediction;
  if (!prediction || typeof prediction !== "object") return false;
  return (
    (Array.isArray(prediction.trifectaTickets) &&
      prediction.trifectaTickets.length > 0) ||
    (Array.isArray(prediction.exactaTickets) &&
      prediction.exactaTickets.length > 0) ||
    normalizeText(prediction.confidence).length > 0 ||
    normalizeText(prediction.raceType).length > 0 ||
    (Array.isArray(prediction.tags) && prediction.tags.length > 0)
  );
}

function hasResult(race) {
  const result = race?.result;
  if (!result || typeof result !== "object") return false;
  return (
    normalizeText(result.status).length > 0 ||
    toInteger(result?.first?.carNo) !== null ||
    normalizeText(result?.trifecta?.combination).length > 0 ||
    Number.isFinite(result?.trifecta?.payoutYen)
  );
}

function hasLineupSourceText(race) {
  return [
    race?.lineupSourceText,
    race?.parsedLineup?.sourceText,
    race?.lineup?.lineupSourceText,
    race?.lineup?.sourceText,
    race?.lineup?.rawText,
  ].some((value) => normalizeText(value).length > 0);
}

function hasParsedLineupField(race) {
  return (
    race?.parsedLineup !== undefined ||
    race?.lineup?.parsedLineup !== undefined
  );
}

function hasExplicitUnknownLine(lineup) {
  if (!lineup || typeof lineup !== "object") return false;
  if (lineup.unknownLine === true) return true;
  if (Array.isArray(lineup.unknownLines) && lineup.unknownLines.length > 0) {
    return true;
  }
  return /(unknown|ambiguous|partial|blocked)/u.test(
    normalizeText(lineup.status).toLowerCase(),
  );
}

function normalizeStarters(race) {
  const raw = Array.isArray(race?.starters) ? race.starters : [];
  const starters = [];
  const carNos = new Set();
  const registrationNos = new Set();
  const issues = [];

  for (const starter of raw) {
    const carNo = extractCarNo(starter);
    const registrationNo = normalizeText(starter?.registrationNo);
    if (!Number.isInteger(carNo) || carNo <= 0) {
      issues.push("INVALID_CAR_NO");
      continue;
    }
    if (!isValidRegistrationNo(registrationNo)) {
      issues.push("NO_REGISTRATION_NO");
    }
    if (carNos.has(carNo)) issues.push("DUPLICATE_CAR_NO");
    if (
      isValidRegistrationNo(registrationNo) &&
      registrationNos.has(registrationNo)
    ) {
      issues.push("DUPLICATE_REGISTRATION_NO");
    }
    carNos.add(carNo);
    if (isValidRegistrationNo(registrationNo)) {
      registrationNos.add(registrationNo);
    }
    starters.push({
      carNo,
      name: normalizeText(starter?.name),
      registrationNo,
      source: starter,
    });
  }

  return {
    raw,
    starters,
    issues,
    complete:
      raw.length > 0 &&
      starters.length === raw.length &&
      issues.length === 0 &&
      starters.every((starter) =>
        isValidRegistrationNo(starter.registrationNo),
      ),
  };
}

function inspectRace(race) {
  const starterInfo = normalizeStarters(race);
  if (starterInfo.raw.length === 0) {
    return { safe: false, reason: REASON.NO_STARTERS, starterInfo };
  }

  if (!starterInfo.complete) {
    const hasMissingRegistration = starterInfo.starters.some(
      (starter) => !isValidRegistrationNo(starter.registrationNo),
    );
    return {
      safe: false,
      reason: hasMissingRegistration
        ? REASON.NO_REGISTRATION_NO
        : REASON.UNKNOWN_STARTER,
      starterInfo,
    };
  }

  const lineup = race?.lineup;
  if (!lineup || typeof lineup !== "object") {
    return { safe: false, reason: REASON.NO_LINEUP, starterInfo };
  }
  if (!Array.isArray(lineup.lines) || lineup.lines.length === 0) {
    return { safe: false, reason: REASON.NO_LINEUP_LINES, starterInfo };
  }
  if (hasExplicitUnknownLine(lineup)) {
    return {
      safe: false,
      reason: REASON.UNKNOWN_LINE_PRESENT,
      starterInfo,
    };
  }

  const starterByCarNo = new Map(
    starterInfo.starters.map((starter) => [starter.carNo, starter]),
  );
  const usedRegistrationNos = new Set();
  const normalizedLines = [];

  for (let lineIndex = 0; lineIndex < lineup.lines.length; lineIndex += 1) {
    const rawLine = lineup.lines[lineIndex];
    if (!Array.isArray(rawLine) || rawLine.length === 0) {
      return {
        safe: false,
        reason: REASON.UNKNOWN_LINE_PRESENT,
        starterInfo,
      };
    }

    const members = [];
    for (
      let memberIndex = 0;
      memberIndex < rawLine.length;
      memberIndex += 1
    ) {
      const rawMember = rawLine[memberIndex];
      const carNo = extractCarNo(rawMember);
      if (!Number.isInteger(carNo)) {
        return {
          safe: false,
          reason: REASON.LINE_MEMBER_UNRESOLVED,
          starterInfo,
          mismatch: { lineIndex, memberIndex, rawMember },
        };
      }
      const starter = starterByCarNo.get(carNo);
      if (!starter) {
        return {
          safe: false,
          reason: REASON.LINE_MEMBER_NOT_IN_STARTERS,
          starterInfo,
          mismatch: { lineIndex, memberIndex, rawMember, carNo },
        };
      }
      const directRegistrationNo = extractLineRegistrationNo(rawMember);
      if (
        directRegistrationNo &&
        directRegistrationNo !== starter.registrationNo
      ) {
        return {
          safe: false,
          reason: REASON.LINE_MEMBER_NOT_IN_STARTERS,
          starterInfo,
          mismatch: {
            lineIndex,
            memberIndex,
            rawMember,
            carNo,
            directRegistrationNo,
          },
        };
      }
      if (usedRegistrationNos.has(starter.registrationNo)) {
        return {
          safe: false,
          reason: REASON.LINE_MEMBER_DUPLICATE,
          starterInfo,
        };
      }
      usedRegistrationNos.add(starter.registrationNo);
      members.push(starter);
    }
    normalizedLines.push(members);
  }

  if (
    starterInfo.starters.some(
      (starter) => !usedRegistrationNos.has(starter.registrationNo),
    )
  ) {
    return {
      safe: false,
      reason: REASON.STARTER_NOT_IN_ANY_LINE,
      starterInfo,
    };
  }

  return {
    safe: true,
    reason: REASON.SAFE,
    starterInfo,
    normalizedLines,
  };
}

function lineupShape(race) {
  const lineup = race?.lineup;
  if (!lineup || typeof lineup !== "object") return "object-missing";
  if (lineup.lines === undefined) return "lines-undefined";
  if (!Array.isArray(lineup.lines)) return "lines-non-array";
  if (lineup.lines.length === 0) return "lines-empty-array";
  return "lines-non-empty";
}

function safeLineCarNoShape(race, expectedCarNos = null) {
  const lines = race?.lineup?.lines;
  if (!Array.isArray(lines) || lines.length === 0) return false;
  const members = lines.flatMap((line) => (Array.isArray(line) ? line : []));
  if (
    lines.some((line) => !Array.isArray(line) || line.length === 0) ||
    members.length === 0
  ) {
    return false;
  }
  const carNos = members.map(extractCarNo);
  if (carNos.some((carNo) => !Number.isInteger(carNo) || carNo <= 0)) {
    return false;
  }
  if (new Set(carNos).size !== carNos.length) return false;
  if (expectedCarNos) {
    if (expectedCarNos.size !== carNos.length) return false;
    if (carNos.some((carNo) => !expectedCarNos.has(carNo))) return false;
  }
  return !hasExplicitUnknownLine(race.lineup);
}

function missingRateBucket(missingCount, totalCount) {
  if (totalCount <= 0) return "unknown";
  const rate = missingCount / totalCount;
  if (rate === 1) return "100%";
  if (rate >= 0.75) return "75-99%";
  if (rate >= 0.5) return "50-74%";
  if (rate >= 0.25) return "25-49%";
  return "1-24%";
}

function createSummary(identityCount, riderMasterCount) {
  return {
    inspectedRaceCount: 0,
    safeRaceCount: 0,
    blockedRaceCount: 0,
    reasonCounts: {},
    noStartersBreakdown: {
      byMonth: {},
      topVenues: {},
      topDates: {},
      withDeclaredStarterCount: 0,
      withoutDeclaredStarterCount: 0,
      withLineupLines: 0,
      withPrediction: 0,
      withResult: 0,
      withResultRiderNames: 0,
      withRegistrationBearingRaceSource: 0,
      qualityShapeCounts: {},
      predictionMatchedBy: {},
      sourceFieldAvailability: {
        lineupCarNos: 0,
        resultCarNos: 0,
        resultRiderNames: 0,
        predictionPayload: 0,
        officialIdentityDatasetAvailable: identityCount > 0,
        riderMasterDatasetAvailable: riderMasterCount > 0,
      },
    },
    noRegistrationBreakdown: {
      byMonth: {},
      topVenues: {},
      topDates: {},
      missingAllStarters: 0,
      missingPartialStarters: 0,
      missingRateDistribution: {},
      topNames: {},
      missingStarterCount: 0,
      fieldAvailability: {
        carNo: 0,
        name: 0,
        playerIdLike: 0,
        identityStatus: 0,
        registrationNoFieldPresent: 0,
        registrationNoValueMissing: 0,
      },
    },
    noLineupLinesBreakdown: {
      byMonth: {},
      topVenues: {},
      topDates: {},
      byRaceClass: {},
      byRaceStage: {},
      shapeCounts: {},
      lineupObjectPresent: 0,
      lineupObjectMissing: 0,
      sourceTextPresent: 0,
      sourceTextMissing: 0,
      parsedLineupFieldPresent: 0,
      parsedLineupFieldMissing: 0,
    },
    lineMemberNotInStartersExamples: [],
    safeBreakdown: {
      byMonth: {},
      topVenues: {},
      topDates: {},
      starterCountDistribution: {},
      lineCountDistribution: {},
      lineSizeDistribution: {},
      roleCounts: {
        front: 0,
        bante: 0,
        third: 0,
        single: 0,
      },
      dataShapeSummary: {
        completeRegistrationNo: 0,
        nonEmptyLineupLines: 0,
        allLineMembersMappedExactlyOnce: 0,
        explicitUnknownLineAbsent: 0,
      },
    },
    improvementCandidates: {
      startersSavedAndRegistrationResolved: 0,
      registrationNoResolvedOnly: 0,
      lineupLinesSavedOnly: 0,
      note:
        "条件を満たす不足フィールドだけが安全に保存された場合の候補数。safe昇格を保証しない。",
    },
    sourceDatasets: {
      officialIdentityCount: identityCount,
      riderMasterCount,
      identityMatchingPerformed: false,
    },
    writesPerformed: false,
    identityFallbackUsed: false,
    fakeCompletionPerformed: false,
  };
}

function recordCommonBreakdown(target, race) {
  increment(target.byMonth, raceMonth(race));
  increment(target.topVenues, raceVenue(race));
  increment(target.topDates, normalizeText(race?.date) || "(unknown date)");
}

function recordNoStarters(summary, race) {
  const target = summary.noStartersBreakdown;
  recordCommonBreakdown(target, race);
  if ((toInteger(race?.starterCount) ?? 0) > 0) {
    target.withDeclaredStarterCount += 1;
  } else {
    target.withoutDeclaredStarterCount += 1;
  }
  if (
    Array.isArray(race?.lineup?.lines) &&
    race.lineup.lines.length > 0
  ) {
    target.withLineupLines += 1;
    target.sourceFieldAvailability.lineupCarNos += 1;
  }
  if (hasPrediction(race)) {
    target.withPrediction += 1;
    target.sourceFieldAvailability.predictionPayload += 1;
  }
  if (hasResult(race)) target.withResult += 1;
  increment(
    target.qualityShapeCounts,
    [
      `starterParsed=${race?.quality?.starterParsed === true}`,
      `lineupParsed=${race?.quality?.lineupParsed === true}`,
      `predictionParsed=${race?.quality?.predictionParsed === true}`,
      `resultParsed=${race?.quality?.resultParsed === true}`,
    ].join(","),
  );
  increment(
    target.predictionMatchedBy,
    normalizeText(race?.predictionEnrichment?.matchedBy) || "(missing)",
  );

  const resultRiders = [
    race?.result?.first,
    race?.result?.second,
    race?.result?.third,
    race?.result?.sRider,
    race?.result?.bRider,
  ].filter(Boolean);
  if (resultRiders.some((rider) => toInteger(rider?.carNo) !== null)) {
    target.sourceFieldAvailability.resultCarNos += 1;
  }
  if (resultRiders.some((rider) => normalizeText(rider?.name))) {
    target.withResultRiderNames += 1;
    target.sourceFieldAvailability.resultRiderNames += 1;
  }

  const registrationBearingSource = [
    race?.entry,
    race?.entries,
    race?.riders,
    race?.starterSource,
  ].some(
    (value) =>
      value &&
      JSON.stringify(value).includes("registrationNo"),
  );
  if (registrationBearingSource) {
    target.withRegistrationBearingRaceSource += 1;
  }

  const declaredCount = toInteger(race?.starterCount) ?? 0;
  const lineMemberCount = Array.isArray(race?.lineup?.lines)
    ? race.lineup.lines.reduce(
        (total, line) => total + (Array.isArray(line) ? line.length : 0),
        0,
      )
    : 0;
  if (
    declaredCount > 0 &&
    declaredCount === lineMemberCount &&
    safeLineCarNoShape(race)
  ) {
    summary.improvementCandidates.startersSavedAndRegistrationResolved += 1;
  }
}

function recordNoRegistration(summary, race, result) {
  const target = summary.noRegistrationBreakdown;
  recordCommonBreakdown(target, race);
  const starters = result.starterInfo.starters;
  const missing = starters.filter(
    (starter) => !isValidRegistrationNo(starter.registrationNo),
  );
  target.missingStarterCount += missing.length;
  if (missing.length === starters.length) target.missingAllStarters += 1;
  else target.missingPartialStarters += 1;
  increment(
    target.missingRateDistribution,
    missingRateBucket(missing.length, starters.length),
  );

  for (const starter of missing) {
    const raw = starter.source;
    if (Number.isInteger(starter.carNo)) target.fieldAvailability.carNo += 1;
    if (starter.name) {
      target.fieldAvailability.name += 1;
      increment(target.topNames, starter.name);
    }
    if (
      [raw?.playerId, raw?.playerID, raw?.riderId, raw?.id].some(
        (value) => normalizeText(value).length > 0,
      )
    ) {
      target.fieldAvailability.playerIdLike += 1;
    }
    if (normalizeText(raw?.identityStatus)) {
      target.fieldAvailability.identityStatus += 1;
    }
    if (Object.hasOwn(raw ?? {}, "registrationNo")) {
      target.fieldAvailability.registrationNoFieldPresent += 1;
    }
    if (!normalizeText(raw?.registrationNo)) {
      target.fieldAvailability.registrationNoValueMissing += 1;
    }
  }

  const expectedCarNos = new Set(starters.map((starter) => starter.carNo));
  if (safeLineCarNoShape(race, expectedCarNos)) {
    summary.improvementCandidates.registrationNoResolvedOnly += 1;
  }
}

function recordNoLineupLines(summary, race) {
  const target = summary.noLineupLinesBreakdown;
  recordCommonBreakdown(target, race);
  increment(target.shapeCounts, lineupShape(race));
  increment(
    target.byRaceClass,
    normalizeText(race?.raceClass) || "(missing)",
  );
  increment(
    target.byRaceStage,
    normalizeText(race?.raceStage ?? race?.result?.raceStage) || "(missing)",
  );

  if (race?.lineup && typeof race.lineup === "object") {
    target.lineupObjectPresent += 1;
  } else {
    target.lineupObjectMissing += 1;
  }
  if (hasLineupSourceText(race)) target.sourceTextPresent += 1;
  else target.sourceTextMissing += 1;
  if (hasParsedLineupField(race)) target.parsedLineupFieldPresent += 1;
  else target.parsedLineupFieldMissing += 1;

  summary.improvementCandidates.lineupLinesSavedOnly += 1;
}

function publicLineMember(value) {
  if (value && typeof value === "object") {
    return {
      carNo: extractCarNo(value),
      registrationNo: extractLineRegistrationNo(value) || null,
    };
  }
  return { carNo: extractCarNo(value), registrationNo: null };
}

function recordLineMemberMismatch(summary, race, result) {
  if (
    summary.lineMemberNotInStartersExamples.length >= EXAMPLE_LIMIT
  ) {
    return;
  }
  const starterRegistrationNos = result.starterInfo.starters.map(
    (starter) => ({
      carNo: starter.carNo,
      registrationNo: starter.registrationNo,
    }),
  );
  const lineMembers = Array.isArray(race?.lineup?.lines)
    ? race.lineup.lines.flatMap((line) =>
        Array.isArray(line) ? line.map(publicLineMember) : [],
      )
    : [];
  summary.lineMemberNotInStartersExamples.push({
    raceKey: raceReference(race),
    date: normalizeText(race?.date) || "(unknown date)",
    venue: raceVenue(race),
    mismatchedLineMember: publicLineMember(result.mismatch?.rawMember),
    starterRegistrationNos,
    lineRegistrationNos: lineMembers,
    detail: result.mismatch?.directRegistrationNo
      ? "line member registrationNo does not match the starter at the same carNo"
      : `line member carNo ${result.mismatch?.carNo ?? "unknown"} is absent from starters`,
  });
}

function recordSafe(summary, race, result) {
  const target = summary.safeBreakdown;
  recordCommonBreakdown(target, race);
  increment(target.starterCountDistribution, result.starterInfo.starters.length);
  increment(target.lineCountDistribution, result.normalizedLines.length);
  target.dataShapeSummary.completeRegistrationNo += 1;
  target.dataShapeSummary.nonEmptyLineupLines += 1;
  target.dataShapeSummary.allLineMembersMappedExactlyOnce += 1;
  target.dataShapeSummary.explicitUnknownLineAbsent += 1;

  for (const line of result.normalizedLines) {
    const lineSize = line.length;
    increment(
      target.lineSizeDistribution,
      lineSize >= 4 ? "4+" : String(lineSize),
    );
    if (lineSize === 1) {
      target.roleCounts.single += 1;
      continue;
    }
    target.roleCounts.front += 1;
    if (lineSize >= 2) target.roleCounts.bante += 1;
    if (lineSize >= 3) target.roleCounts.third += lineSize - 2;
  }
}

function finalizeSummary(summary) {
  const topLevelCounters = [
    summary.reasonCounts,
    summary.noStartersBreakdown.byMonth,
    summary.noRegistrationBreakdown.byMonth,
    summary.noLineupLinesBreakdown.byMonth,
    summary.safeBreakdown.byMonth,
  ];
  for (const counter of topLevelCounters) {
    Object.assign(counter, sortedCounter(counter));
  }

  for (const target of [
    summary.noStartersBreakdown,
    summary.noRegistrationBreakdown,
    summary.noLineupLinesBreakdown,
    summary.safeBreakdown,
  ]) {
    target.topVenues = sortedCounter(target.topVenues, TOP_LIMIT);
    target.topDates = sortedCounter(target.topDates, TOP_LIMIT);
  }
  summary.noRegistrationBreakdown.topNames = sortedCounter(
    summary.noRegistrationBreakdown.topNames,
    TOP_LIMIT,
  );
  summary.noRegistrationBreakdown.missingRateDistribution = sortedCounter(
    summary.noRegistrationBreakdown.missingRateDistribution,
  );
  summary.noLineupLinesBreakdown.shapeCounts = sortedCounter(
    summary.noLineupLinesBreakdown.shapeCounts,
  );
  summary.noLineupLinesBreakdown.byRaceClass = sortedCounter(
    summary.noLineupLinesBreakdown.byRaceClass,
    TOP_LIMIT,
  );
  summary.noLineupLinesBreakdown.byRaceStage = sortedCounter(
    summary.noLineupLinesBreakdown.byRaceStage,
    TOP_LIMIT,
  );
  summary.safeBreakdown.starterCountDistribution = sortedCounter(
    summary.safeBreakdown.starterCountDistribution,
  );
  summary.safeBreakdown.lineCountDistribution = sortedCounter(
    summary.safeBreakdown.lineCountDistribution,
  );
  summary.safeBreakdown.lineSizeDistribution = sortedCounter(
    summary.safeBreakdown.lineSizeDistribution,
  );
  summary.noStartersBreakdown.qualityShapeCounts = sortedCounter(
    summary.noStartersBreakdown.qualityShapeCounts,
  );
  summary.noStartersBreakdown.predictionMatchedBy = sortedCounter(
    summary.noStartersBreakdown.predictionMatchedBy,
  );
}

function printSection(label, value) {
  console.log(`\n[${label}]`);
  console.log(JSON.stringify(value, null, 2));
}

async function main() {
  const [historyIndex, historyStatus, officialIdentity, riderMaster] =
    await Promise.all([
      readJson(HISTORY_INDEX_FILE),
      readJson(HISTORY_STATUS_FILE),
      readJson(OFFICIAL_IDENTITY_FILE),
      readJson(RIDER_MASTER_FILE),
    ]);

  const summary = createSummary(
    Array.isArray(officialIdentity.items)
      ? officialIdentity.items.length
      : 0,
    Array.isArray(riderMaster.items) ? riderMaster.items.length : 0,
  );
  const files = Array.isArray(historyIndex.items)
    ? historyIndex.items.map((entry) => toHistoryFile(entry.file))
    : [];

  for (const file of files) {
    const daily = await readJson(file);
    const races = Array.isArray(daily.items) ? daily.items : [];
    for (const race of races) {
      summary.inspectedRaceCount += 1;
      const result = inspectRace(race);
      increment(summary.reasonCounts, result.reason);

      if (result.safe) {
        summary.safeRaceCount += 1;
        recordSafe(summary, race, result);
        continue;
      }

      summary.blockedRaceCount += 1;
      if (result.reason === REASON.NO_STARTERS) {
        recordNoStarters(summary, race);
      } else if (result.reason === REASON.NO_REGISTRATION_NO) {
        recordNoRegistration(summary, race, result);
      } else if (
        result.reason === REASON.NO_LINEUP ||
        result.reason === REASON.NO_LINEUP_LINES
      ) {
        recordNoLineupLines(summary, race);
      } else if (
        result.reason === REASON.LINE_MEMBER_NOT_IN_STARTERS
      ) {
        recordLineMemberMismatch(summary, race, result);
      }
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
  if (
    summary.safeRaceCount + summary.blockedRaceCount !==
    summary.inspectedRaceCount
  ) {
    throw new Error("safe and blocked totals do not match inspected races");
  }

  finalizeSummary(summary);

  console.log("[kurari-ex lineup / position blocker drilldown audit]");
  console.log(
    `historyStatusRaceCount: ${historyStatus.raceCount ?? "unknown"}`,
  );
  console.log("writesPerformed: false");
  console.log("identityFallbackUsed: false");
  console.log("fakeCompletionPerformed: false");
  console.log(
    "policy: 保存済みフィールドの存在と整合性だけを監査し、登録番号・lineup・positionを補完しない。",
  );

  console.log("\n[summary]");
  console.log(`inspectedRaceCount: ${summary.inspectedRaceCount}`);
  console.log(`safeRaceCount: ${summary.safeRaceCount}`);
  console.log(`blockedRaceCount: ${summary.blockedRaceCount}`);
  console.log(`reasonCounts: ${JSON.stringify(summary.reasonCounts)}`);

  printSection("noStartersBreakdown", summary.noStartersBreakdown);
  printSection(
    "noRegistrationBreakdown",
    summary.noRegistrationBreakdown,
  );
  printSection(
    "noLineupLinesBreakdown",
    summary.noLineupLinesBreakdown,
  );
  printSection(
    "lineMemberNotInStartersExamples",
    summary.lineMemberNotInStartersExamples,
  );
  printSection("safeBreakdown", summary.safeBreakdown);
  printSection("improvementCandidates", summary.improvementCandidates);
  printSection("jsonSummary", summary);
}

main().catch((error) => {
  console.error(
    "[kurari-ex lineup / position blocker drilldown audit] failed",
  );
  console.error(error);
  process.exitCode = 1;
});
