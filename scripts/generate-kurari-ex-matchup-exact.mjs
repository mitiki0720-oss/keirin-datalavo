import fs from "node:fs/promises";
import path from "node:path";
import {
  loadRiderIdentitySources,
  resolveRiderIdentity,
} from "./kurari-ex-rider-common.mjs";

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

const OUTPUT_DIR = path.join(
  ROOT,
  "public",
  "data",
  "analytics",
  "kurari-ex",
  "exact",
  "matchups",
);

const RIDER_OUTPUT_DIR = path.join(
  OUTPUT_DIR,
  "by-rider-tail",
);

const TMP_DIR = path.join(ROOT, ".tmp");

const PREVIEW_FILE = path.join(
  TMP_DIR,
  "kurari-ex-matchup-exact-preview.json",
);

const NOW = new Date().toISOString();

const DRY_RUN = process.argv.includes("--dry-run");

const SAFE_IDENTITY_STATUSES = new Set([
  "registration-no",
  "unique-player-card-name",
  "same-registration-name",
  "manual-override",
]);

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim();
}

function normalizeRegistrationNo(value) {
  return normalizeText(value);
}

function isValidRegistrationNo(value) {
  return /^\d{6}$/.test(
    normalizeRegistrationNo(value),
  );
}

function normalizeLf(value) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

function formatJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function toFiniteNumber(value) {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  const normalized = normalizeText(value);

  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function extractCarNo(value) {
  if (typeof value === "number") {
    return Number.isFinite(value)
      ? value
      : null;
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

function extractIdentityStatus(starter) {
  return normalizeText(
    starter?.identityStatus ??
      starter?.identity?.status ??
      "",
  );
}

function isResolvedStarter(starter) {
  const registrationNo =
    normalizeRegistrationNo(
      starter?.registrationNo,
    );

  return (
    isValidRegistrationNo(registrationNo) &&
    SAFE_IDENTITY_STATUSES.has(
      extractIdentityStatus(starter),
    )
  );
}

function resolveStarterForMatchup(starter, identitySources) {
  if (isResolvedStarter(starter)) {
    return starter;
  }

  const identity = resolveRiderIdentity(starter, identitySources);

  if (
    !identity.registrationNo ||
    !SAFE_IDENTITY_STATUSES.has(identity.status)
  ) {
    return null;
  }

  return {
    ...starter,
    registrationNo: identity.registrationNo,
    identityStatus: identity.status,
    name: normalizeText(starter?.name || identity.name || identity.card?.name || ""),
    nameKey: identity.nameKey,
  };
}

function createPairKey(
  registrationNoA,
  registrationNoB,
) {
  return [
    normalizeRegistrationNo(registrationNoA),
    normalizeRegistrationNo(registrationNoB),
  ]
    .sort((a, b) => a.localeCompare(b))
    .join(":");
}

function createEmptyLineBucket() {
  return {
    sharedRaceCount: 0,
    safeComparableRaceCount: 0,
    aAheadCount: 0,
    bAheadCount: 0,
  };
}

function createEmptyVenueBucket({
  venueKey,
  venueName,
}) {
  return {
    venueKey,
    venueName,
    sharedRaceCount: 0,
    safeComparableRaceCount: 0,
    aAheadCount: 0,
    bAheadCount: 0,
  };
}

function calculateRate(count, total) {
  if (!Number.isFinite(total) || total <= 0) {
    return null;
  }

  return Number(
    ((count / total) * 100).toFixed(1),
  );
}

function getQuality({
  sharedRaceCount,
  safeComparableRaceCount,
}) {
  if (safeComparableRaceCount >= 5) {
    return "sufficient";
  }

  if (safeComparableRaceCount >= 1) {
    return "low-sample";
  }

  if (sharedRaceCount >= 1) {
    return "partial";
  }

  return "partial";
}

async function walkFiles(dir) {
  const results = [];

  async function visit(currentDir) {
    let entries = [];

    try {
      entries = await fs.readdir(
        currentDir,
        {
          withFileTypes: true,
        },
      );
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(
        currentDir,
        entry.name,
      );

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

function normalizeLine(line) {
  if (!Array.isArray(line)) {
    return [];
  }

  return line
    .map((item) => extractCarNo(item))
    .filter((carNo) =>
      Number.isFinite(carNo),
    );
}

function extractLines(race) {
  if (
    normalizeText(race?.lineup?.status) !==
    "parsed"
  ) {
    return [];
  }

  const rawLines = race?.lineup?.lines;

  if (!Array.isArray(rawLines)) {
    return [];
  }

  return rawLines
    .map((line) => normalizeLine(line))
    .filter((line) => line.length > 0);
}

function classifyLine({
  carNoA,
  carNoB,
  lines,
}) {
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

  return lineIndexesA[0] ===
    lineIndexesB[0]
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
    if (
      !Array.isArray(candidate) ||
      candidate.length === 0
    ) {
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
  const fullA =
    fullFinishPositions.get(carNoA);

  const fullB =
    fullFinishPositions.get(carNoB);

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

  const podiumA =
    podiumPositions.get(carNoA);

  const podiumB =
    podiumPositions.get(carNoB);

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

  if (
    Number.isFinite(podiumA) &&
    !Number.isFinite(podiumB)
  ) {
    return "a-ahead";
  }

  if (
    Number.isFinite(podiumB) &&
    !Number.isFinite(podiumA)
  ) {
    return "b-ahead";
  }

  return "unknown-order";
}

function createPairAggregate({
  registrationNoA,
  registrationNoB,
  nameA,
  nameB,
}) {
  return {
    pairKey: createPairKey(
      registrationNoA,
      registrationNoB,
    ),

    registrationNoA,
    registrationNoB,

    nameA,
    nameB,

    sharedRaceCount: 0,
    safeComparableRaceCount: 0,

    aAheadCount: 0,
    bAheadCount: 0,

    unknownOrderCount: 0,

    sameLine: createEmptyLineBucket(),
    otherLine: createEmptyLineBucket(),

    unknownLineRaceCount: 0,

    byVenue: new Map(),
  };
}

function addComparison({
  bucket,
  comparison,
}) {
  bucket.sharedRaceCount += 1;

  if (comparison === "a-ahead") {
    bucket.safeComparableRaceCount += 1;
    bucket.aAheadCount += 1;
  }

  if (comparison === "b-ahead") {
    bucket.safeComparableRaceCount += 1;
    bucket.bAheadCount += 1;
  }
}

function addVenueComparison({
  pair,
  venueKey,
  venueName,
  comparison,
}) {
  const safeVenueKey =
    normalizeText(venueKey) || "unknown";

  const existing =
    pair.byVenue.get(safeVenueKey) ??
    createEmptyVenueBucket({
      venueKey: safeVenueKey,
      venueName: normalizeText(venueName),
    });

  existing.sharedRaceCount += 1;

  if (comparison === "a-ahead") {
    existing.safeComparableRaceCount += 1;
    existing.aAheadCount += 1;
  }

  if (comparison === "b-ahead") {
    existing.safeComparableRaceCount += 1;
    existing.bAheadCount += 1;
  }

  pair.byVenue.set(
    safeVenueKey,
    existing,
  );
}

function mirrorLineBucket(
  bucket,
  selfIsA,
) {
  const selfAheadCount = selfIsA
    ? bucket.aAheadCount
    : bucket.bAheadCount;

  const opponentAheadCount = selfIsA
    ? bucket.bAheadCount
    : bucket.aAheadCount;

  return {
    sharedRaceCount:
      bucket.sharedRaceCount,

    safeComparableRaceCount:
      bucket.safeComparableRaceCount,

    selfAheadCount,
    opponentAheadCount,

    selfAheadRate: calculateRate(
      selfAheadCount,
      bucket.safeComparableRaceCount,
    ),

    opponentAheadRate: calculateRate(
      opponentAheadCount,
      bucket.safeComparableRaceCount,
    ),
  };
}

function mirrorVenueBucket(
  bucket,
  selfIsA,
) {
  const selfAheadCount = selfIsA
    ? bucket.aAheadCount
    : bucket.bAheadCount;

  const opponentAheadCount = selfIsA
    ? bucket.bAheadCount
    : bucket.aAheadCount;

  return {
    venueKey: bucket.venueKey,
    venueName: bucket.venueName,

    sharedRaceCount:
      bucket.sharedRaceCount,

    safeComparableRaceCount:
      bucket.safeComparableRaceCount,

    selfAheadCount,
    opponentAheadCount,

    selfAheadRate: calculateRate(
      selfAheadCount,
      bucket.safeComparableRaceCount,
    ),

    opponentAheadRate: calculateRate(
      opponentAheadCount,
      bucket.safeComparableRaceCount,
    ),
  };
}

function mirrorPairForRider({
  pair,
  registrationNo,
}) {
  const selfIsA =
    registrationNo ===
    pair.registrationNoA;

  const selfAheadCount = selfIsA
    ? pair.aAheadCount
    : pair.bAheadCount;

  const opponentAheadCount = selfIsA
    ? pair.bAheadCount
    : pair.aAheadCount;

  const opponentRegistrationNo = selfIsA
    ? pair.registrationNoB
    : pair.registrationNoA;

  const opponentName = selfIsA
    ? pair.nameB
    : pair.nameA;

  const byVenue = Array
    .from(pair.byVenue.values())
    .filter((bucket) =>
      bucket.sharedRaceCount >= 2,
    )
    .map((bucket) =>
      mirrorVenueBucket(
        bucket,
        selfIsA,
      ),
    )
    .sort((a, b) =>
      b.sharedRaceCount -
        a.sharedRaceCount ||
      a.venueKey.localeCompare(
        b.venueKey,
      ),
    )
    .slice(0, 10);

  return {
    pairKey: pair.pairKey,

    opponentRegistrationNo,
    opponentName,

    sharedRaceCount:
      pair.sharedRaceCount,

    safeComparableRaceCount:
      pair.safeComparableRaceCount,

    selfAheadCount,
    opponentAheadCount,

    unknownOrderCount:
      pair.unknownOrderCount,

    selfAheadRate: calculateRate(
      selfAheadCount,
      pair.safeComparableRaceCount,
    ),

    opponentAheadRate: calculateRate(
      opponentAheadCount,
      pair.safeComparableRaceCount,
    ),

    sameLine: mirrorLineBucket(
      pair.sameLine,
      selfIsA,
    ),

    otherLine: mirrorLineBucket(
      pair.otherLine,
      selfIsA,
    ),

    unknownLineRaceCount:
      pair.unknownLineRaceCount,

    byVenue,

    quality: getQuality({
      sharedRaceCount:
        pair.sharedRaceCount,

      safeComparableRaceCount:
        pair.safeComparableRaceCount,
    }),
  };
}

async function tryReadJson(filePath) {
  try {
    return JSON.parse(
      await fs.readFile(
        filePath,
        "utf8",
      ),
    );
  } catch {
    return null;
  }
}

function withoutGeneratedAt(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return value;
  }

  const copy = {
    ...value,
  };

  delete copy.generatedAt;

  return copy;
}

async function prepareJsonWrite({
  filePath,
  payload,
}) {
  const previous =
    await tryReadJson(filePath);

  const sameSemanticContent =
    previous &&
    JSON.stringify(
      withoutGeneratedAt(previous),
    ) ===
      JSON.stringify(
        withoutGeneratedAt(payload),
      );

  const finalPayload = {
    ...payload,

    generatedAt:
      sameSemanticContent &&
      previous?.generatedAt
        ? previous.generatedAt
        : NOW,
  };

  const nextText =
    formatJson(finalPayload);

  let previousText = null;

  try {
    previousText = normalizeLf(
      await fs.readFile(
        filePath,
        "utf8",
      ),
    );
  } catch {
    previousText = null;
  }

  return {
    filePath,
    payload: finalPayload,
    text: nextText,
    changed:
      previousText !== nextText,
  };
}

async function writePreparedFile(
  prepared,
) {
  if (!prepared.changed) {
    return false;
  }

  await fs.mkdir(
    path.dirname(prepared.filePath),
    {
      recursive: true,
    },
  );

  await fs.writeFile(
    prepared.filePath,
    prepared.text,
    "utf8",
  );

  return true;
}

function toPublicFileUrl(filePath) {
  return `/${path
    .relative(
      path.join(ROOT, "public"),
      filePath,
    )
    .replaceAll("\\", "/")}`;
}

function createRiderFilePath(
  registrationNo,
) {
  const tail =
    registrationNo.slice(-2);

  return path.join(
    RIDER_OUTPUT_DIR,
    tail,
    `${registrationNo}.generated.json`,
  );
}

async function main() {
  const identitySources = await loadRiderIdentitySources();

  const historyFiles =
    (await walkFiles(HISTORY_DIR))
      .filter((filePath) =>
        /\.generated\.json$/i.test(
          filePath,
        ),
      )
      .sort((a, b) =>
        a.localeCompare(b),
      );

  if (historyFiles.length === 0) {
    throw new Error(
      "compact historyの日別JSONが見つかりません。",
    );
  }

  const pairs = new Map();

  const riderNames = new Map();

  let periodFrom = null;
  let periodTo = null;

  const status = {
    schemaVersion: 1,
    sourceType: "EXACT",

    historyRaceCount: 0,

    racesWithAtLeastTwoResolvedRiders: 0,

    distinctResolvedRiderCount: 0,

    distinctPairCount: 0,
    pairObservationCount: 0,

    safeComparablePairObservationCount: 0,
    unknownOrderPairObservationCount: 0,

    sameLinePairObservationCount: 0,
    otherLinePairObservationCount: 0,
    unknownLinePairObservationCount: 0,

    riderFileCount: 0,

    totalBytes: 0,
    maxRiderFileBytes: 0,

    warningCount: 0,
  };

  for (const historyFile of historyFiles) {
    const daily = JSON.parse(
      await fs.readFile(
        historyFile,
        "utf8",
      ),
    );

    const races =
      Array.isArray(daily?.items)
        ? daily.items
        : [];

    for (const race of races) {
      status.historyRaceCount += 1;

      const date =
        normalizeText(race?.date);

      if (date) {
        periodFrom =
          !periodFrom ||
          date < periodFrom
            ? date
            : periodFrom;

        periodTo =
          !periodTo ||
          date > periodTo
            ? date
            : periodTo;
      }

      const starters =
        Array.isArray(race?.starters)
          ? race.starters
          : [];

      const resolvedStarters =
        starters
          .map((starter) =>
            resolveStarterForMatchup(starter, identitySources),
          )
          .filter(Boolean);

      for (
        const starter of resolvedStarters
      ) {
        const registrationNo =
          normalizeRegistrationNo(
            starter.registrationNo,
          );

        const name =
          normalizeText(starter.name);

        if (!riderNames.has(registrationNo)) {
          riderNames.set(
            registrationNo,
            name,
          );
        }
      }

      if (resolvedStarters.length < 2) {
        continue;
      }

      status.racesWithAtLeastTwoResolvedRiders +=
        1;

      const lines =
        extractLines(race);

      const podiumPositions =
        extractPodiumPositionMap(
          race?.result,
        );

      const fullFinishPositions =
        extractFullFinishPositionMap(
          race?.result,
        );

      for (
        let indexA = 0;
        indexA <
        resolvedStarters.length;
        indexA += 1
      ) {
        for (
          let indexB = indexA + 1;
          indexB <
          resolvedStarters.length;
          indexB += 1
        ) {
          const starterOne =
            resolvedStarters[indexA];

          const starterTwo =
            resolvedStarters[indexB];

          const registrationNoOne =
            normalizeRegistrationNo(
              starterOne.registrationNo,
            );

          const registrationNoTwo =
            normalizeRegistrationNo(
              starterTwo.registrationNo,
            );

          if (
            registrationNoOne ===
            registrationNoTwo
          ) {
            status.warningCount += 1;
            continue;
          }

          const sortedRegistrationNos = [
            registrationNoOne,
            registrationNoTwo,
          ].sort((a, b) =>
            a.localeCompare(b),
          );

          const registrationNoA =
            sortedRegistrationNos[0];

          const registrationNoB =
            sortedRegistrationNos[1];

          const starterA =
            registrationNoOne ===
            registrationNoA
              ? starterOne
              : starterTwo;

          const starterB =
            registrationNoOne ===
            registrationNoA
              ? starterTwo
              : starterOne;

          const nameA =
            riderNames.get(
              registrationNoA,
            ) ?? "";

          const nameB =
            riderNames.get(
              registrationNoB,
            ) ?? "";

          const pairKey =
            createPairKey(
              registrationNoA,
              registrationNoB,
            );

          const pair =
            pairs.get(pairKey) ??
            createPairAggregate({
              registrationNoA,
              registrationNoB,
              nameA,
              nameB,
            });

          pair.sharedRaceCount += 1;

          status.pairObservationCount += 1;

          const carNoA =
            extractCarNo(starterA);

          const carNoB =
            extractCarNo(starterB);

          const lineClass =
            classifyLine({
              carNoA,
              carNoB,
              lines,
            });

          const comparison =
            comparePair({
              carNoA,
              carNoB,
              fullFinishPositions,
              podiumPositions,
            });

          if (
            comparison === "a-ahead"
          ) {
            pair.safeComparableRaceCount +=
              1;

            pair.aAheadCount += 1;

            status.safeComparablePairObservationCount +=
              1;
          }

          if (
            comparison === "b-ahead"
          ) {
            pair.safeComparableRaceCount +=
              1;

            pair.bAheadCount += 1;

            status.safeComparablePairObservationCount +=
              1;
          }

          if (
            comparison ===
            "unknown-order"
          ) {
            pair.unknownOrderCount +=
              1;

            status.unknownOrderPairObservationCount +=
              1;
          }

          if (
            lineClass === "same-line"
          ) {
            addComparison({
              bucket:
                pair.sameLine,

              comparison,
            });

            status.sameLinePairObservationCount +=
              1;
          } else if (
            lineClass === "other-line"
          ) {
            addComparison({
              bucket:
                pair.otherLine,

              comparison,
            });

            status.otherLinePairObservationCount +=
              1;
          } else {
            pair.unknownLineRaceCount +=
              1;

            status.unknownLinePairObservationCount +=
              1;
          }

          addVenueComparison({
            pair,
            venueKey: race?.venueKey,
            venueName: race?.venueName,
            comparison,
          });

          pairs.set(pairKey, pair);
        }
      }
    }
  }

  const riderMatchups = new Map();

  for (const pair of pairs.values()) {
    for (const registrationNo of [
      pair.registrationNoA,
      pair.registrationNoB,
    ]) {
      const current =
        riderMatchups.get(
          registrationNo,
        ) ?? [];

      current.push(
        mirrorPairForRider({
          pair,
          registrationNo,
        }),
      );

      riderMatchups.set(
        registrationNo,
        current,
      );
    }
  }

  const riderWritePlans = [];

  const indexItems = [];

  const qualityCounts = {
    sufficient: 0,
    "low-sample": 0,
    partial: 0,
  };

  const sortedRegistrationNos =
    Array.from(
      riderMatchups.keys(),
    ).sort((a, b) =>
      a.localeCompare(b),
    );

  for (
    const registrationNo of
    sortedRegistrationNos
  ) {
    const matchups = riderMatchups
      .get(registrationNo)
      .sort((a, b) =>
        b.sharedRaceCount -
          a.sharedRaceCount ||
        b.safeComparableRaceCount -
          a.safeComparableRaceCount ||
        a.opponentRegistrationNo.localeCompare(
          b.opponentRegistrationNo,
        ),
      );

    const coverage = {
      distinctOpponentCount:
        matchups.length,

      sharedRaceCount:
        matchups.reduce(
          (total, item) =>
            total +
            item.sharedRaceCount,
          0,
        ),

      safeComparableRaceCount:
        matchups.reduce(
          (total, item) =>
            total +
            item.safeComparableRaceCount,
          0,
        ),

      unknownOrderRaceCount:
        matchups.reduce(
          (total, item) =>
            total +
            item.unknownOrderCount,
          0,
        ),

      lineClassifiedRaceCount:
        matchups.reduce(
          (total, item) =>
            total +
            item.sameLine
              .sharedRaceCount +
            item.otherLine
              .sharedRaceCount,
          0,
        ),
    };

    const quality = getQuality({
      sharedRaceCount:
        coverage.sharedRaceCount,

      safeComparableRaceCount:
        coverage.safeComparableRaceCount,
    });

    qualityCounts[quality] += 1;

    const filePath =
      createRiderFilePath(
        registrationNo,
      );

    const payload = {
      schemaVersion: 1,

      sourceType: "EXACT",

      generatedAt: NOW,

      registrationNo,

      name:
        riderNames.get(
          registrationNo,
        ) ?? "",

      period: {
        from: periodFrom,
        to: periodTo,
      },

      quality,

      coverage,

      matchups,

      warnings: [],
    };

    const prepared =
      await prepareJsonWrite({
        filePath,
        payload,
      });

    riderWritePlans.push(
      prepared,
    );

    indexItems.push({
      registrationNo,

      name: payload.name,

      file:
        toPublicFileUrl(filePath),

      quality,

      distinctOpponentCount:
        coverage.distinctOpponentCount,

      sharedRaceCount:
        coverage.sharedRaceCount,

      safeComparableRaceCount:
        coverage.safeComparableRaceCount,
    });
  }

  status.distinctResolvedRiderCount =
    riderNames.size;

  status.distinctPairCount =
    pairs.size;

  status.riderFileCount =
    riderWritePlans.length;

  const indexFilePath =
    path.join(
      OUTPUT_DIR,
      "index.generated.json",
    );

  const indexPayload = {
    schemaVersion: 1,

    sourceType: "EXACT",

    generatedAt: NOW,

    period: {
      from: periodFrom,
      to: periodTo,
    },

    riderCount:
      riderWritePlans.length,

    distinctPairCount:
      pairs.size,

    pairObservationCount:
      status.pairObservationCount,

    safeComparablePairObservationCount:
      status.safeComparablePairObservationCount,

    qualityCounts,

    items: indexItems,
  };

  const indexWritePlan =
    await prepareJsonWrite({
      filePath: indexFilePath,
      payload: indexPayload,
    });

  const riderBytes =
    riderWritePlans.reduce(
      (total, plan) =>
        total +
        Buffer.byteLength(
          plan.text,
          "utf8",
        ),
      0,
    );

  const indexBytes =
    Buffer.byteLength(
      indexWritePlan.text,
      "utf8",
    );

  status.totalBytes =
    riderBytes + indexBytes;

  status.maxRiderFileBytes =
    riderWritePlans.reduce(
      (maximum, plan) =>
        Math.max(
          maximum,
          Buffer.byteLength(
            plan.text,
            "utf8",
          ),
        ),
      0,
    );

  const statusFilePath =
    path.join(
      OUTPUT_DIR,
      "status.generated.json",
    );

  const statusPayload = {
    ...status,

    generatedAt: NOW,

    period: {
      from: periodFrom,
      to: periodTo,
    },

    qualityCounts,
  };

  const statusWritePlan =
    await prepareJsonWrite({
      filePath: statusFilePath,
      payload: statusPayload,
    });

  const allWritePlans = [
    ...riderWritePlans,
    indexWritePlan,
    statusWritePlan,
  ];

  const changedPlans =
    allWritePlans.filter(
      (plan) => plan.changed,
    );

  const summary = {
    schemaVersion: 1,

    generatedAt: NOW,

    dryRun: DRY_RUN,

    historyFileCount:
      historyFiles.length,

    period: {
      from: periodFrom,
      to: periodTo,
    },

    historyRaceCount:
      status.historyRaceCount,

    racesWithAtLeastTwoResolvedRiders:
      status.racesWithAtLeastTwoResolvedRiders,

    distinctResolvedRiderCount:
      status.distinctResolvedRiderCount,

    distinctPairCount:
      status.distinctPairCount,

    pairObservationCount:
      status.pairObservationCount,

    safeComparablePairObservationCount:
      status.safeComparablePairObservationCount,

    unknownOrderPairObservationCount:
      status.unknownOrderPairObservationCount,

    sameLinePairObservationCount:
      status.sameLinePairObservationCount,

    otherLinePairObservationCount:
      status.otherLinePairObservationCount,

    unknownLinePairObservationCount:
      status.unknownLinePairObservationCount,

    riderFileCount:
      status.riderFileCount,

    qualityCounts,

    totalBytes:
      status.totalBytes,

    maxRiderFileBytes:
      status.maxRiderFileBytes,

    checkedFileCount:
      allWritePlans.length,

    semanticChanges:
      changedPlans.length,

    changedFiles:
      changedPlans.map(
        (plan) =>
          path
            .relative(
              ROOT,
              plan.filePath,
            )
            .replaceAll(
              "\\",
              "/",
            ),
      ),
  };

  await fs.mkdir(
    TMP_DIR,
    {
      recursive: true,
    },
  );

  await fs.writeFile(
    PREVIEW_FILE,
    formatJson(summary),
    "utf8",
  );

  if (!DRY_RUN) {
    for (const plan of changedPlans) {
      await writePreparedFile(plan);
    }
  }

  console.log("");
  console.log(
    "[KURARI EX MATCHUP EXACT]",
  );

  console.log("");

  for (
    const [key, value] of
    Object.entries(summary)
  ) {
    if (key === "changedFiles") {
      continue;
    }

    if (
      typeof value === "object" &&
      value !== null
    ) {
      console.log(
        `${key}: ${JSON.stringify(value)}`,
      );

      continue;
    }

    console.log(`${key}: ${value}`);
  }

  console.log("");

  console.log("[changedFiles]");

  for (
    const filePath of
    summary.changedFiles
  ) {
    console.log(`- ${filePath}`);
  }

  console.log("");

  console.log(
    `preview: ${path
      .relative(ROOT, PREVIEW_FILE)
      .replaceAll("\\", "/")}`,
  );

  if (DRY_RUN) {
    console.log("");
    console.log(
      "dry-run: public files were not written",
    );
  }
}

main().catch((error) => {
  console.error("");
  console.error(
    "[KURARI EX MATCHUP EXACT FAILED]",
  );

  console.error(error);

  process.exitCode = 1;
});
