import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

const HISTORY_DIR = path.join(
  ROOT,
  "public",
  "data",
  "analytics",
  "kurari-ex",
  "history",
  "daily",
);

const OUTPUT_DIR = path.join(ROOT, ".tmp");

const OUTPUT_FILE = path.join(
  OUTPUT_DIR,
  "kurari-ex-matchup-coverage-audit.json",
);

const SAFE_IDENTITY_STATUSES = new Set([
  "registration-no",
  "unique-player-card-name",
  "manual-override",
]);

async function walkFiles(dir) {
  const results = [];

  async function visit(currentDir) {
    let entries = [];

    try {
      entries = await fs.readdir(currentDir, {
        withFileTypes: true,
      });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        await visit(fullPath);
        continue;
      }

      results.push(fullPath);
    }
  }

  await visit(dir);

  return results;
}

function toRelative(filePath) {
  return path
    .relative(ROOT, filePath)
    .replaceAll("\\", "/");
}

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

function toFiniteNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const normalized = normalizeText(value);

  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

function extractCarNo(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    return toFiniteNumber(value);
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  return (
    toFiniteNumber(value.carNo) ??
    toFiniteNumber(value.vehicleNo) ??
    toFiniteNumber(value.number) ??
    toFiniteNumber(value.frameNo) ??
    null
  );
}

function extractStarterIdentityStatus(starter) {
  return normalizeText(
    starter?.identityStatus ??
      starter?.identity?.status ??
      "",
  );
}

function isResolvedStarter(starter) {
  const registrationNo = normalizeRegistrationNo(
    starter?.registrationNo,
  );

  const identityStatus = extractStarterIdentityStatus(starter);

  return (
    isValidRegistrationNo(registrationNo) &&
    SAFE_IDENTITY_STATUSES.has(identityStatus)
  );
}

function normalizeLine(line) {
  if (!Array.isArray(line)) {
    return [];
  }

  return line
    .map((item) => extractCarNo(item))
    .filter((carNo) => Number.isFinite(carNo));
}

function extractLines(race) {
  const rawLines = race?.lineup?.lines;

  if (!Array.isArray(rawLines)) {
    return [];
  }

  return rawLines
    .map((line) => normalizeLine(line))
    .filter((line) => line.length > 0);
}

function classifyPairLine(carNoA, carNoB, lines) {
  if (
    !Number.isFinite(carNoA) ||
    !Number.isFinite(carNoB) ||
    lines.length === 0
  ) {
    return "unknown-line";
  }

  const lineIndexesA = [];
  const lineIndexesB = [];

  lines.forEach((line, index) => {
    if (line.includes(carNoA)) {
      lineIndexesA.push(index);
    }

    if (line.includes(carNoB)) {
      lineIndexesB.push(index);
    }
  });

  if (
    lineIndexesA.length !== 1 ||
    lineIndexesB.length !== 1
  ) {
    return "unknown-line";
  }

  return lineIndexesA[0] === lineIndexesB[0]
    ? "same-line"
    : "other-line";
}

function extractPodiumPositionMap(result) {
  const positions = new Map();

  const entries = [
    [1, result?.first],
    [2, result?.second],
    [3, result?.third],
  ];

  for (const [position, rider] of entries) {
    const carNo = extractCarNo(rider);

    if (Number.isFinite(carNo)) {
      positions.set(carNo, position);
    }
  }

  return positions;
}

function extractFullFinishPositionMap(result) {
  const candidates = [
    result?.finishOrder,
    result?.finishers,
    result?.ranking,
    result?.order,
    result?.results,
  ];

  for (const candidate of candidates) {
    if (!Array.isArray(candidate) || candidate.length === 0) {
      continue;
    }

    const positions = new Map();

    candidate.forEach((item, index) => {
      const carNo = extractCarNo(item);

      const position =
        toFiniteNumber(item?.position) ??
        toFiniteNumber(item?.rank) ??
        toFiniteNumber(item?.place) ??
        index + 1;

      if (
        Number.isFinite(carNo) &&
        Number.isFinite(position)
      ) {
        positions.set(carNo, position);
      }
    });

    if (positions.size > 0) {
      return positions;
    }
  }

  return new Map();
}

function comparePair({
  carNoA,
  carNoB,
  fullFinishPositions,
  podiumPositions,
}) {
  const fullA = fullFinishPositions.get(carNoA);
  const fullB = fullFinishPositions.get(carNoB);

  if (
    Number.isFinite(fullA) &&
    Number.isFinite(fullB)
  ) {
    if (fullA < fullB) {
      return "a-ahead";
    }

    if (fullB < fullA) {
      return "b-ahead";
    }

    return "unknown-order";
  }

  const podiumA = podiumPositions.get(carNoA);
  const podiumB = podiumPositions.get(carNoB);

  if (
    Number.isFinite(podiumA) &&
    Number.isFinite(podiumB)
  ) {
    if (podiumA < podiumB) {
      return "a-ahead";
    }

    if (podiumB < podiumA) {
      return "b-ahead";
    }

    return "unknown-order";
  }

  if (Number.isFinite(podiumA) && !Number.isFinite(podiumB)) {
    return "a-ahead";
  }

  if (Number.isFinite(podiumB) && !Number.isFinite(podiumA)) {
    return "b-ahead";
  }

  return "unknown-order";
}

function createPairKey(registrationNoA, registrationNoB) {
  return [
    normalizeRegistrationNo(registrationNoA),
    normalizeRegistrationNo(registrationNoB),
  ]
    .sort()
    .join(":");
}

function addCount(target, key, amount = 1) {
  target[key] = (target[key] ?? 0) + amount;
}

async function main() {
  const historyFiles = (await walkFiles(HISTORY_DIR))
    .filter((filePath) =>
      /\.generated\.json$/i.test(filePath),
    )
    .sort((a, b) => a.localeCompare(b));

  if (historyFiles.length === 0) {
    throw new Error(
      "compact historyの日別JSONが見つかりません。",
    );
  }

  const stats = {
    historyFileCount: historyFiles.length,
    historyRaceCount: 0,
    racesWithStarterArray: 0,
    racesWithAtLeastTwoResolvedRiders: 0,
    racesWithParsedLineup: 0,
    racesWithFullFinishOrder: 0,
    racesWithPodiumOnlyResult: 0,

    resolvedStarterObservationCount: 0,
    distinctResolvedRiderCount: 0,

    pairObservationCount: 0,
    distinctPairCount: 0,

    safeComparablePairObservationCount: 0,
    unknownOrderPairObservationCount: 0,

    sameLinePairObservationCount: 0,
    otherLinePairObservationCount: 0,
    unknownLinePairObservationCount: 0,

    safeSameLineComparableCount: 0,
    safeOtherLineComparableCount: 0,

    invalidResolvedStarterCount: 0,
    warningCount: 0,
  };

  const warnings = [];
  const resolvedRiderNos = new Set();
  const distinctPairKeys = new Set();

  const lineClassCounts = {};
  const comparisonCounts = {};

  for (const historyFile of historyFiles) {
    const rawText = await fs.readFile(historyFile, "utf8");

    const daily = JSON.parse(rawText);

    const races = Array.isArray(daily?.items)
      ? daily.items
      : [];

    for (const race of races) {
      stats.historyRaceCount += 1;

      const starters = Array.isArray(race?.starters)
        ? race.starters
        : [];

      if (starters.length > 0) {
        stats.racesWithStarterArray += 1;
      }

      const resolvedStarters = starters.filter((starter) => {
        const registrationNo = normalizeRegistrationNo(
          starter?.registrationNo,
        );

        const identityStatus = extractStarterIdentityStatus(
          starter,
        );

        const registrationNoExists = Boolean(registrationNo);

        const identityClaimsResolved =
          SAFE_IDENTITY_STATUSES.has(identityStatus);

        if (
          registrationNoExists &&
          identityClaimsResolved &&
          !isValidRegistrationNo(registrationNo)
        ) {
          stats.invalidResolvedStarterCount += 1;

          warnings.push({
            type: "invalid-resolved-registration-no",
            file: toRelative(historyFile),
            raceKey: race?.raceKey ?? "",
            carNo: starter?.carNo ?? null,
            name: starter?.name ?? "",
            registrationNo,
            identityStatus,
          });
        }

        return isResolvedStarter(starter);
      });

      for (const starter of resolvedStarters) {
        stats.resolvedStarterObservationCount += 1;

        resolvedRiderNos.add(
          normalizeRegistrationNo(starter.registrationNo),
        );
      }

      if (resolvedStarters.length >= 2) {
        stats.racesWithAtLeastTwoResolvedRiders += 1;
      }

      const lines = extractLines(race);

      if (lines.length > 0) {
        stats.racesWithParsedLineup += 1;
      }

      const fullFinishPositions =
        extractFullFinishPositionMap(race?.result);

      const podiumPositions =
        extractPodiumPositionMap(race?.result);

      if (
        starters.length > 0 &&
        fullFinishPositions.size >= starters.length
      ) {
        stats.racesWithFullFinishOrder += 1;
      } else if (podiumPositions.size > 0) {
        stats.racesWithPodiumOnlyResult += 1;
      }

      for (let indexA = 0; indexA < resolvedStarters.length; indexA += 1) {
        for (
          let indexB = indexA + 1;
          indexB < resolvedStarters.length;
          indexB += 1
        ) {
          const starterA = resolvedStarters[indexA];
          const starterB = resolvedStarters[indexB];

          const registrationNoA =
            normalizeRegistrationNo(
              starterA.registrationNo,
            );

          const registrationNoB =
            normalizeRegistrationNo(
              starterB.registrationNo,
            );

          if (registrationNoA === registrationNoB) {
            warnings.push({
              type: "duplicate-registration-no-in-race",
              file: toRelative(historyFile),
              raceKey: race?.raceKey ?? "",
              registrationNo: registrationNoA,
            });

            continue;
          }

          const pairKey = createPairKey(
            registrationNoA,
            registrationNoB,
          );

          distinctPairKeys.add(pairKey);

          stats.pairObservationCount += 1;

          const carNoA = extractCarNo(starterA);
          const carNoB = extractCarNo(starterB);

          const lineClass = classifyPairLine(
            carNoA,
            carNoB,
            lines,
          );

          addCount(lineClassCounts, lineClass);

          if (lineClass === "same-line") {
            stats.sameLinePairObservationCount += 1;
          } else if (lineClass === "other-line") {
            stats.otherLinePairObservationCount += 1;
          } else {
            stats.unknownLinePairObservationCount += 1;
          }

          const comparison = comparePair({
            carNoA,
            carNoB,
            fullFinishPositions,
            podiumPositions,
          });

          addCount(comparisonCounts, comparison);

          if (comparison === "unknown-order") {
            stats.unknownOrderPairObservationCount += 1;
            continue;
          }

          stats.safeComparablePairObservationCount += 1;

          if (lineClass === "same-line") {
            stats.safeSameLineComparableCount += 1;
          }

          if (lineClass === "other-line") {
            stats.safeOtherLineComparableCount += 1;
          }
        }
      }
    }
  }

  stats.distinctResolvedRiderCount =
    resolvedRiderNos.size;

  stats.distinctPairCount =
    distinctPairKeys.size;

  stats.warningCount = warnings.length;

  const stopReasons = [];

  if (stats.distinctResolvedRiderCount < 2) {
    stopReasons.push(
      "登録番号解決済みの選手が2名未満です。",
    );
  }

  if (stats.pairObservationCount === 0) {
    stopReasons.push(
      "同一レース内の選手ペアを作成できません。",
    );
  }

  if (stats.safeComparablePairObservationCount === 0) {
    stopReasons.push(
      "安全に先着比較できる選手ペアがありません。",
    );
  }

  const output = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: "public-compact-history",
    historyDir: toRelative(HISTORY_DIR),
    stats,
    lineClassCounts,
    comparisonCounts,
    stopConditionMatched: stopReasons.length > 0,
    stopReasons,
    warningExamples: warnings.slice(0, 50),
  };

  await fs.mkdir(OUTPUT_DIR, {
    recursive: true,
  });

  await fs.writeFile(
    OUTPUT_FILE,
    JSON.stringify(output, null, 2) + "\n",
    "utf8",
  );

  console.log("");
  console.log("[KURARI EX MATCHUP COVERAGE AUDIT]");
  console.log("");

  for (const [key, value] of Object.entries(stats)) {
    console.log(`${key}: ${value}`);
  }

  console.log("");
  console.log("[lineClassCounts]");
  console.log(lineClassCounts);

  console.log("");
  console.log("[comparisonCounts]");
  console.log(comparisonCounts);

  console.log("");
  console.log(
    `stopConditionMatched: ${output.stopConditionMatched}`,
  );

  if (stopReasons.length > 0) {
    console.log("");

    console.log("[STOP REASONS]");

    for (const reason of stopReasons) {
      console.log(`- ${reason}`);
    }
  }

  console.log("");
  console.log(`output: ${toRelative(OUTPUT_FILE)}`);

  if (stopReasons.length > 0) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error("");
  console.error("[KURARI EX MATCHUP COVERAGE AUDIT FAILED]");
  console.error(error);

  process.exitCode = 1;
});