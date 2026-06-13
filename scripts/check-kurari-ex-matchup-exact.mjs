import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

const MATCHUP_DIR = path.join(
  ROOT,
  "public",
  "data",
  "analytics",
  "kurari-ex",
  "exact",
  "matchups",
);

const RIDER_DIR = path.join(
  MATCHUP_DIR,
  "by-rider-tail",
);

const INDEX_FILE = path.join(
  MATCHUP_DIR,
  "index.generated.json",
);

const STATUS_FILE = path.join(
  MATCHUP_DIR,
  "status.generated.json",
);

const VALID_QUALITIES = new Set([
  "sufficient",
  "low-sample",
  "partial",
]);

const MAX_RIDER_FILE_BYTES = 100 * 1024;

const MAX_TOTAL_BYTES = 5 * 1024 * 1024;

const MAX_INDEX_BYTES = 300 * 1024;

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim();
}

function isValidRegistrationNo(value) {
  return /^\d{6}$/.test(
    normalizeText(value),
  );
}

function isObject(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value),
  );
}

function createPairKey(a, b) {
  return [
    normalizeText(a),
    normalizeText(b),
  ]
    .sort((left, right) =>
      left.localeCompare(right),
    )
    .join(":");
}

function calculateRate(count, total) {
  if (
    !Number.isFinite(total) ||
    total <= 0
  ) {
    return null;
  }

  return Number(
    ((count / total) * 100).toFixed(1),
  );
}

function sameValue(a, b) {
  return JSON.stringify(a) ===
    JSON.stringify(b);
}

function addError(errors, type, detail = {}) {
  errors.push({
    type,
    ...detail,
  });
}

function addWarning(
  warnings,
  type,
  detail = {},
) {
  warnings.push({
    type,
    ...detail,
  });
}

function ensureNonNegativeInteger({
  errors,
  value,
  field,
  context,
}) {
  if (
    !Number.isInteger(value) ||
    value < 0
  ) {
    addError(
      errors,
      "invalid-non-negative-integer",
      {
        field,
        value,
        ...context,
      },
    );

    return false;
  }

  return true;
}

function ensureRate({
  errors,
  count,
  total,
  actual,
  field,
  context,
}) {
  const expected =
    calculateRate(count, total);

  if (actual !== expected) {
    addError(
      errors,
      "invalid-rate",
      {
        field,
        expected,
        actual,
        count,
        total,
        ...context,
      },
    );
  }
}

function inspectForbiddenContent({
  value,
  errors,
  file,
  currentPath = "",
}) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      inspectForbiddenContent({
        value: item,
        errors,
        file,
        currentPath:
          `${currentPath}[${index}]`,
      });
    });

    return;
  }

  if (!isObject(value)) {
    if (typeof value === "string") {
      const lowered =
        value.toLowerCase();

      if (
        lowered.includes("<html") ||
        lowered.includes("<!doctype html")
      ) {
        addError(
          errors,
          "html-content-detected",
          {
            file,
            path: currentPath,
          },
        );
      }
    }

    return;
  }

  const forbiddenKeys = new Set([
    "rawtext",
    "rawhtml",
    "html",
    "sourcerefs",
    "sourcehtml",
    "fullodds",
    "oddsmatrix",
    "commenttext",
    "commentbody",
    "localstoragedump",
    "jsonl",
  ]);

  for (
    const [key, childValue] of
    Object.entries(value)
  ) {
    const normalizedKey =
      normalizeText(key)
        .replaceAll("-", "")
        .replaceAll("_", "")
        .toLowerCase();

    if (forbiddenKeys.has(normalizedKey)) {
      addError(
        errors,
        "forbidden-key-detected",
        {
          file,
          path:
            currentPath
              ? `${currentPath}.${key}`
              : key,
        },
      );
    }

    inspectForbiddenContent({
      value: childValue,
      errors,
      file,
      currentPath:
        currentPath
          ? `${currentPath}.${key}`
          : key,
    });
  }
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

async function readJson(filePath) {
  return JSON.parse(
    await fs.readFile(
      filePath,
      "utf8",
    ),
  );
}

function toRelative(filePath) {
  return path
    .relative(ROOT, filePath)
    .replaceAll("\\", "/");
}

function publicUrlToLocalPath(file) {
  const normalized =
    normalizeText(file)
      .replace(/^\/+/, "");

  return path.join(
    ROOT,
    "public",
    normalized,
  );
}

function checkLineBucket({
  errors,
  bucket,
  field,
  context,
}) {
  if (!isObject(bucket)) {
    addError(
      errors,
      "missing-line-bucket",
      {
        field,
        ...context,
      },
    );

    return;
  }

  const countFields = [
    "sharedRaceCount",
    "safeComparableRaceCount",
    "selfAheadCount",
    "opponentAheadCount",
  ];

  for (const countField of countFields) {
    ensureNonNegativeInteger({
      errors,
      value: bucket[countField],
      field: `${field}.${countField}`,
      context,
    });
  }

  if (
    bucket.safeComparableRaceCount >
    bucket.sharedRaceCount
  ) {
    addError(
      errors,
      "line-safe-count-exceeds-shared-count",
      {
        field,
        ...context,
      },
    );
  }

  if (
    bucket.selfAheadCount +
      bucket.opponentAheadCount !==
    bucket.safeComparableRaceCount
  ) {
    addError(
      errors,
      "line-comparison-count-mismatch",
      {
        field,
        ...context,
      },
    );
  }

  ensureRate({
    errors,
    count: bucket.selfAheadCount,
    total:
      bucket.safeComparableRaceCount,
    actual: bucket.selfAheadRate,
    field: `${field}.selfAheadRate`,
    context,
  });

  ensureRate({
    errors,
    count:
      bucket.opponentAheadCount,
    total:
      bucket.safeComparableRaceCount,
    actual:
      bucket.opponentAheadRate,
    field:
      `${field}.opponentAheadRate`,
    context,
  });
}

function normalizeVenueSummary(item) {
  return {
    venueKey: item.venueKey,
    venueName: item.venueName,

    sharedRaceCount:
      item.sharedRaceCount,

    safeComparableRaceCount:
      item.safeComparableRaceCount,

    selfAheadCount:
      item.selfAheadCount,

    opponentAheadCount:
      item.opponentAheadCount,

    selfAheadRate:
      item.selfAheadRate,

    opponentAheadRate:
      item.opponentAheadRate,
  };
}

function mirrorVenueSummary(item) {
  return {
    venueKey: item.venueKey,
    venueName: item.venueName,

    sharedRaceCount:
      item.sharedRaceCount,

    safeComparableRaceCount:
      item.safeComparableRaceCount,

    selfAheadCount:
      item.opponentAheadCount,

    opponentAheadCount:
      item.selfAheadCount,

    selfAheadRate:
      item.opponentAheadRate,

    opponentAheadRate:
      item.selfAheadRate,
  };
}

function checkVenueBuckets({
  errors,
  byVenue,
  context,
}) {
  if (!Array.isArray(byVenue)) {
    addError(
      errors,
      "invalid-by-venue",
      context,
    );

    return;
  }

  const venueKeys = new Set();

  for (const venue of byVenue) {
    const venueKey =
      normalizeText(venue?.venueKey);

    if (!venueKey) {
      addError(
        errors,
        "missing-venue-key",
        context,
      );

      continue;
    }

    if (venueKeys.has(venueKey)) {
      addError(
        errors,
        "duplicate-venue-key",
        {
          venueKey,
          ...context,
        },
      );
    }

    venueKeys.add(venueKey);

    const countFields = [
      "sharedRaceCount",
      "safeComparableRaceCount",
      "selfAheadCount",
      "opponentAheadCount",
    ];

    for (
      const countField of
      countFields
    ) {
      ensureNonNegativeInteger({
        errors,
        value:
          venue[countField],
        field:
          `byVenue.${venueKey}.${countField}`,
        context,
      });
    }

    if (
      venue.safeComparableRaceCount >
      venue.sharedRaceCount
    ) {
      addError(
        errors,
        "venue-safe-count-exceeds-shared-count",
        {
          venueKey,
          ...context,
        },
      );
    }

    if (
      venue.selfAheadCount +
        venue.opponentAheadCount !==
      venue.safeComparableRaceCount
    ) {
      addError(
        errors,
        "venue-comparison-count-mismatch",
        {
          venueKey,
          ...context,
        },
      );
    }

    ensureRate({
      errors,
      count: venue.selfAheadCount,
      total:
        venue.safeComparableRaceCount,
      actual: venue.selfAheadRate,
      field:
        `byVenue.${venueKey}.selfAheadRate`,
      context,
    });

    ensureRate({
      errors,
      count:
        venue.opponentAheadCount,
      total:
        venue.safeComparableRaceCount,
      actual:
        venue.opponentAheadRate,
      field:
        `byVenue.${venueKey}.opponentAheadRate`,
      context,
    });
  }
}

function createMirrorBucket(bucket) {
  return {
    sharedRaceCount:
      bucket.sharedRaceCount,

    safeComparableRaceCount:
      bucket.safeComparableRaceCount,

    selfAheadCount:
      bucket.opponentAheadCount,

    opponentAheadCount:
      bucket.selfAheadCount,

    selfAheadRate:
      bucket.opponentAheadRate,

    opponentAheadRate:
      bucket.selfAheadRate,
  };
}

function createMirrorMatchup(
  matchup,
) {
  return {
    pairKey:
      matchup.pairKey,

    sharedRaceCount:
      matchup.sharedRaceCount,

    safeComparableRaceCount:
      matchup.safeComparableRaceCount,

    selfAheadCount:
      matchup.opponentAheadCount,

    opponentAheadCount:
      matchup.selfAheadCount,

    unknownOrderCount:
      matchup.unknownOrderCount,

    selfAheadRate:
      matchup.opponentAheadRate,

    opponentAheadRate:
      matchup.selfAheadRate,

    sameLine:
      createMirrorBucket(
        matchup.sameLine,
      ),

    otherLine:
      createMirrorBucket(
        matchup.otherLine,
      ),

    unknownLineRaceCount:
      matchup.unknownLineRaceCount,

    byVenue:
      Array.isArray(matchup.byVenue)
        ? matchup.byVenue
            .map(mirrorVenueSummary)
            .sort((a, b) =>
              a.venueKey.localeCompare(
                b.venueKey,
              ),
            )
        : [],
  };
}

function createComparableMatchup(
  matchup,
) {
  return {
    pairKey:
      matchup.pairKey,

    sharedRaceCount:
      matchup.sharedRaceCount,

    safeComparableRaceCount:
      matchup.safeComparableRaceCount,

    selfAheadCount:
      matchup.selfAheadCount,

    opponentAheadCount:
      matchup.opponentAheadCount,

    unknownOrderCount:
      matchup.unknownOrderCount,

    selfAheadRate:
      matchup.selfAheadRate,

    opponentAheadRate:
      matchup.opponentAheadRate,

    sameLine:
      matchup.sameLine,

    otherLine:
      matchup.otherLine,

    unknownLineRaceCount:
      matchup.unknownLineRaceCount,

    byVenue:
      Array.isArray(matchup.byVenue)
        ? matchup.byVenue
            .map(
              normalizeVenueSummary,
            )
            .sort((a, b) =>
              a.venueKey.localeCompare(
                b.venueKey,
              ),
            )
        : [],
  };
}

function calculateQuality({
  sharedRaceCount,
  safeComparableRaceCount,
}) {
  if (
    safeComparableRaceCount >= 5
  ) {
    return "sufficient";
  }

  if (
    safeComparableRaceCount >= 1
  ) {
    return "low-sample";
  }

  if (sharedRaceCount >= 1) {
    return "partial";
  }

  return "partial";
}

async function main() {
  const errors = [];
  const warnings = [];

  const index =
    await readJson(INDEX_FILE);

  const status =
    await readJson(STATUS_FILE);

  const allFiles =
    (await walkFiles(MATCHUP_DIR))
      .sort((a, b) =>
        a.localeCompare(b),
      );

  const riderFiles =
    allFiles
      .filter((filePath) =>
        /by-rider-tail[\\/]\d{2}[\\/]\d{6}\.generated\.json$/i.test(
          filePath,
        ),
      )
      .sort((a, b) =>
        a.localeCompare(b),
      );

  const unexpectedFiles =
    allFiles.filter((filePath) => {
      const relative =
        toRelative(filePath);

      return !(
        relative.endsWith(
          "/index.generated.json",
        ) ||
        relative.endsWith(
          "/status.generated.json",
        ) ||
        /by-rider-tail\/\d{2}\/\d{6}\.generated\.json$/i.test(
          relative,
        )
      );
    });

  for (
    const unexpectedFile of
    unexpectedFiles
  ) {
    addError(
      errors,
      "unexpected-file",
      {
        file:
          toRelative(
            unexpectedFile,
          ),
      },
    );
  }

  const indexItems =
    Array.isArray(index?.items)
      ? index.items
      : [];

  if (
    index.riderCount !==
    indexItems.length
  ) {
    addError(
      errors,
      "index-rider-count-mismatch",
      {
        expected:
          indexItems.length,
        actual:
          index.riderCount,
      },
    );
  }

  if (
    indexItems.length !==
    riderFiles.length
  ) {
    addError(
      errors,
      "index-file-count-mismatch",
      {
        indexItems:
          indexItems.length,
        riderFiles:
          riderFiles.length,
      },
    );
  }

  if (
    status.riderFileCount !==
    riderFiles.length
  ) {
    addError(
      errors,
      "status-rider-file-count-mismatch",
      {
        expected:
          riderFiles.length,
        actual:
          status.riderFileCount,
      },
    );
  }

  const indexRegistrationNos =
    new Set();

  const indexItemByRegistrationNo =
    new Map();

  for (const item of indexItems) {
    const registrationNo =
      normalizeText(
        item?.registrationNo,
      );

    if (
      !isValidRegistrationNo(
        registrationNo,
      )
    ) {
      addError(
        errors,
        "invalid-index-registration-no",
        {
          registrationNo,
        },
      );

      continue;
    }

    if (
      indexRegistrationNos.has(
        registrationNo,
      )
    ) {
      addError(
        errors,
        "duplicate-index-registration-no",
        {
          registrationNo,
        },
      );
    }

    indexRegistrationNos.add(
      registrationNo,
    );

    indexItemByRegistrationNo.set(
      registrationNo,
      item,
    );

    const localFilePath =
      publicUrlToLocalPath(
        item.file,
      );

    try {
      await fs.access(localFilePath);
    } catch {
      addError(
        errors,
        "missing-index-rider-file",
        {
          registrationNo,
          file:
            item.file,
        },
      );
    }
  }

  const riderByRegistrationNo =
    new Map();

  const pairSides = new Map();

  let riderPayloadBytes = 0;

  let maxRiderFileBytes = 0;

  let filesOver100KbCount = 0;

  for (const riderFile of riderFiles) {
    const file =
      toRelative(riderFile);

    const fileBytes =
      (await fs.stat(riderFile))
        .size;

    riderPayloadBytes +=
      fileBytes;

    maxRiderFileBytes =
      Math.max(
        maxRiderFileBytes,
        fileBytes,
      );

    if (
      fileBytes >
      MAX_RIDER_FILE_BYTES
    ) {
      filesOver100KbCount += 1;

      addWarning(
        warnings,
        "rider-file-over-100kb",
        {
          file,
          bytes:
            fileBytes,
        },
      );
    }

    const rider =
      await readJson(riderFile);

    inspectForbiddenContent({
      value: rider,
      errors,
      file,
    });

    const registrationNo =
      normalizeText(
        rider?.registrationNo,
      );

    const fileRegistrationNo =
      path
        .basename(riderFile)
        .replace(
          /\.generated\.json$/i,
          "",
        );

    if (
      !isValidRegistrationNo(
        registrationNo,
      )
    ) {
      addError(
        errors,
        "invalid-rider-registration-no",
        {
          file,
          registrationNo,
        },
      );
    }

    if (
      registrationNo !==
      fileRegistrationNo
    ) {
      addError(
        errors,
        "rider-file-registration-no-mismatch",
        {
          file,
          registrationNo,
          fileRegistrationNo,
        },
      );
    }

    const expectedTail =
      registrationNo.slice(-2);

    const actualTail =
      path.basename(
        path.dirname(
          riderFile,
        ),
      );

    if (
      expectedTail !==
      actualTail
    ) {
      addError(
        errors,
        "rider-tail-directory-mismatch",
        {
          file,
          registrationNo,
          expectedTail,
          actualTail,
        },
      );
    }

    if (
      riderByRegistrationNo.has(
        registrationNo,
      )
    ) {
      addError(
        errors,
        "duplicate-rider-file",
        {
          registrationNo,
        },
      );
    }

    riderByRegistrationNo.set(
      registrationNo,
      {
        file,
        rider,
      },
    );

    const matchups =
      Array.isArray(
        rider?.matchups,
      )
        ? rider.matchups
        : [];

    const opponentRegistrationNos =
      new Set();

    let sharedRaceCount = 0;

    let safeComparableRaceCount = 0;

    let unknownOrderRaceCount = 0;

    let lineClassifiedRaceCount = 0;

    for (const matchup of matchups) {
      const opponentRegistrationNo =
        normalizeText(
          matchup
            ?.opponentRegistrationNo,
        );

      const context = {
        file,
        registrationNo,
        opponentRegistrationNo,
      };

      if (
        !isValidRegistrationNo(
          opponentRegistrationNo,
        )
      ) {
        addError(
          errors,
          "invalid-opponent-registration-no",
          context,
        );

        continue;
      }

      if (
        opponentRegistrationNo ===
        registrationNo
      ) {
        addError(
          errors,
          "self-matchup-detected",
          context,
        );
      }

      if (
        opponentRegistrationNos.has(
          opponentRegistrationNo,
        )
      ) {
        addError(
          errors,
          "duplicate-opponent-in-rider-file",
          context,
        );
      }

      opponentRegistrationNos.add(
        opponentRegistrationNo,
      );

      const expectedPairKey =
        createPairKey(
          registrationNo,
          opponentRegistrationNo,
        );

      if (
        matchup.pairKey !==
        expectedPairKey
      ) {
        addError(
          errors,
          "invalid-pair-key",
          {
            expectedPairKey,
            actual:
              matchup.pairKey,
            ...context,
          },
        );
      }

      const countFields = [
        "sharedRaceCount",
        "safeComparableRaceCount",
        "selfAheadCount",
        "opponentAheadCount",
        "unknownOrderCount",
        "unknownLineRaceCount",
      ];

      for (
        const countField of
        countFields
      ) {
        ensureNonNegativeInteger({
          errors,
          value:
            matchup[countField],
          field:
            countField,
          context,
        });
      }

      if (
        matchup.safeComparableRaceCount >
        matchup.sharedRaceCount
      ) {
        addError(
          errors,
          "safe-count-exceeds-shared-count",
          context,
        );
      }

      if (
        matchup.selfAheadCount +
          matchup.opponentAheadCount !==
        matchup.safeComparableRaceCount
      ) {
        addError(
          errors,
          "comparison-count-mismatch",
          context,
        );
      }

      if (
        matchup.safeComparableRaceCount +
          matchup.unknownOrderCount !==
        matchup.sharedRaceCount
      ) {
        addError(
          errors,
          "known-and-unknown-count-mismatch",
          context,
        );
      }

      ensureRate({
        errors,
        count:
          matchup.selfAheadCount,
        total:
          matchup.safeComparableRaceCount,
        actual:
          matchup.selfAheadRate,
        field:
          "selfAheadRate",
        context,
      });

      ensureRate({
        errors,
        count:
          matchup.opponentAheadCount,
        total:
          matchup.safeComparableRaceCount,
        actual:
          matchup.opponentAheadRate,
        field:
          "opponentAheadRate",
        context,
      });

      checkLineBucket({
        errors,
        bucket:
          matchup.sameLine,
        field:
          "sameLine",
        context,
      });

      checkLineBucket({
        errors,
        bucket:
          matchup.otherLine,
        field:
          "otherLine",
        context,
      });

      if (
        matchup.sameLine
          .sharedRaceCount +
          matchup.otherLine
            .sharedRaceCount +
          matchup
            .unknownLineRaceCount !==
        matchup.sharedRaceCount
      ) {
        addError(
          errors,
          "line-classification-count-mismatch",
          context,
        );
      }

      checkVenueBuckets({
        errors,
        byVenue:
          matchup.byVenue,
        context,
      });

      const expectedQuality =
        calculateQuality({
          sharedRaceCount:
            matchup.sharedRaceCount,

          safeComparableRaceCount:
            matchup.safeComparableRaceCount,
        });

      if (
        matchup.quality !==
        expectedQuality
      ) {
        addError(
          errors,
          "invalid-matchup-quality",
          {
            expectedQuality,
            actual:
              matchup.quality,
            ...context,
          },
        );
      }

      sharedRaceCount +=
        matchup.sharedRaceCount;

      safeComparableRaceCount +=
        matchup.safeComparableRaceCount;

      unknownOrderRaceCount +=
        matchup.unknownOrderCount;

      lineClassifiedRaceCount +=
        matchup.sameLine
          .sharedRaceCount +
        matchup.otherLine
          .sharedRaceCount;

      const sides =
        pairSides.get(
          expectedPairKey,
        ) ?? [];

      sides.push({
        registrationNo,
        opponentRegistrationNo,
        matchup,
      });

      pairSides.set(
        expectedPairKey,
        sides,
      );
    }

    const coverage =
      rider?.coverage ?? {};

    const expectedCoverage = {
      distinctOpponentCount:
        matchups.length,

      sharedRaceCount,

      safeComparableRaceCount,

      unknownOrderRaceCount,

      lineClassifiedRaceCount,
    };

    if (
      !sameValue(
        coverage,
        expectedCoverage,
      )
    ) {
      addError(
        errors,
        "rider-coverage-mismatch",
        {
          file,
          registrationNo,
          expected:
            expectedCoverage,
          actual:
            coverage,
        },
      );
    }

    const expectedRiderQuality =
      calculateQuality({
        sharedRaceCount,
        safeComparableRaceCount,
      });

    if (
      rider.quality !==
      expectedRiderQuality
    ) {
      addError(
        errors,
        "invalid-rider-quality",
        {
          file,
          registrationNo,
          expected:
            expectedRiderQuality,
          actual:
            rider.quality,
        },
      );
    }

    if (
      !VALID_QUALITIES.has(
        rider.quality,
      )
    ) {
      addError(
        errors,
        "unknown-rider-quality",
        {
          file,
          registrationNo,
          quality:
            rider.quality,
        },
      );
    }

    const indexItem =
      indexItemByRegistrationNo.get(
        registrationNo,
      );

    if (!indexItem) {
      addError(
        errors,
        "rider-missing-from-index",
        {
          file,
          registrationNo,
        },
      );
    } else {
      const expectedIndexSummary = {
        registrationNo,

        name:
          rider.name,

        file:
          `/${file
            .replace(
              /^public\//,
              "",
            )}`,

        quality:
          rider.quality,

        distinctOpponentCount:
          coverage
            .distinctOpponentCount,

        sharedRaceCount:
          coverage
            .sharedRaceCount,

        safeComparableRaceCount:
          coverage
            .safeComparableRaceCount,
      };

      if (
        !sameValue(
          indexItem,
          expectedIndexSummary,
        )
      ) {
        addError(
          errors,
          "index-rider-summary-mismatch",
          {
            file,
            registrationNo,
            expected:
              expectedIndexSummary,
            actual:
              indexItem,
          },
        );
      }
    }
  }

  let symmetricMismatchCount = 0;

  let distinctPairCount = 0;

  let pairObservationCount = 0;

  let safeComparablePairObservationCount =
    0;

  let unknownOrderPairObservationCount =
    0;

  let sameLinePairObservationCount = 0;

  let otherLinePairObservationCount = 0;

  let unknownLinePairObservationCount = 0;

  for (
    const [pairKey, sides] of
    pairSides.entries()
  ) {
    distinctPairCount += 1;

    if (sides.length !== 2) {
      addError(
        errors,
        "pair-does-not-have-two-sides",
        {
          pairKey,
          sideCount:
            sides.length,
        },
      );

      symmetricMismatchCount += 1;

      continue;
    }

    const [sideA, sideB] =
      sides;

    const expectedMirror =
      createMirrorMatchup(
        sideA.matchup,
      );

    const actualMirror =
      createComparableMatchup(
        sideB.matchup,
      );

    if (
      !sameValue(
        expectedMirror,
        actualMirror,
      )
    ) {
      addError(
        errors,
        "symmetric-matchup-mismatch",
        {
          pairKey,
          leftRegistrationNo:
            sideA.registrationNo,
          rightRegistrationNo:
            sideB.registrationNo,
          expectedMirror,
          actualMirror,
        },
      );

      symmetricMismatchCount += 1;
    }

    pairObservationCount +=
      sideA.matchup
        .sharedRaceCount;

    safeComparablePairObservationCount +=
      sideA.matchup
        .safeComparableRaceCount;

    unknownOrderPairObservationCount +=
      sideA.matchup
        .unknownOrderCount;

    sameLinePairObservationCount +=
      sideA.matchup
        .sameLine
        .sharedRaceCount;

    otherLinePairObservationCount +=
      sideA.matchup
        .otherLine
        .sharedRaceCount;

    unknownLinePairObservationCount +=
      sideA.matchup
        .unknownLineRaceCount;
  }

  const indexBytes =
    (await fs.stat(INDEX_FILE))
      .size;

  const statusBytes =
    (await fs.stat(STATUS_FILE))
      .size;

  const totalBytes =
    riderPayloadBytes +
    indexBytes +
    statusBytes;

  if (
    indexBytes >
    MAX_INDEX_BYTES
  ) {
    addWarning(
      warnings,
      "index-file-over-300kb",
      {
        bytes:
          indexBytes,
      },
    );
  }

  if (
    totalBytes >
    MAX_TOTAL_BYTES
  ) {
    addWarning(
      warnings,
      "matchup-total-over-5mb",
      {
        bytes:
          totalBytes,
      },
    );
  }

  const expectedStatusValues = {
    distinctPairCount,

    pairObservationCount,

    safeComparablePairObservationCount,

    unknownOrderPairObservationCount,

    sameLinePairObservationCount,

    otherLinePairObservationCount,

    unknownLinePairObservationCount,

    riderFileCount:
      riderFiles.length,

    maxRiderFileBytes,

    totalBytes:
      riderPayloadBytes +
      indexBytes,
  };

  for (
    const [key, expected] of
    Object.entries(
      expectedStatusValues,
    )
  ) {
    if (
      status[key] !== expected
    ) {
      addError(
        errors,
        "status-value-mismatch",
        {
          key,
          expected,
          actual:
            status[key],
        },
      );
    }
  }

  if (
    index.distinctPairCount !==
    distinctPairCount
  ) {
    addError(
      errors,
      "index-distinct-pair-count-mismatch",
      {
        expected:
          distinctPairCount,
        actual:
          index.distinctPairCount,
      },
    );
  }

  if (
    index.pairObservationCount !==
    pairObservationCount
  ) {
    addError(
      errors,
      "index-pair-observation-count-mismatch",
      {
        expected:
          pairObservationCount,
        actual:
          index.pairObservationCount,
      },
    );
  }

  if (
    index.safeComparablePairObservationCount !==
    safeComparablePairObservationCount
  ) {
    addError(
      errors,
      "index-safe-comparable-count-mismatch",
      {
        expected:
          safeComparablePairObservationCount,
        actual:
          index
            .safeComparablePairObservationCount,
      },
    );
  }

  const summary = {
    riderIndexCount:
      indexItems.length,

    riderFileCount:
      riderFiles.length,

    distinctPairCount,

    pairObservationCount,

    safeComparablePairObservationCount,

    unknownOrderPairObservationCount,

    sameLinePairObservationCount,

    otherLinePairObservationCount,

    unknownLinePairObservationCount,

    duplicatePairKeyCount:
      Array.from(
        pairSides.values(),
      ).filter(
        (sides) =>
          sides.length !== 2,
      ).length,

    symmetricMismatchCount,

    invalidRegistrationNoCount:
      errors.filter((error) =>
        error.type.includes(
          "registration-no",
        ),
      ).length,

    invalidRateCount:
      errors.filter(
        (error) =>
          error.type ===
          "invalid-rate",
      ).length,

    negativeCountDetected:
      errors.some(
        (error) =>
          error.type ===
          "invalid-non-negative-integer",
      ),

    indexBytes,

    totalBytes,

    maxRiderFileBytes,

    filesOver100KbCount,

    errorCount:
      errors.length,

    warningCount:
      warnings.length,
  };

  console.log("");
  console.log(
    "[KURARI EX MATCHUP EXACT AUDIT]",
  );

  console.log("");

  for (
    const [key, value] of
    Object.entries(summary)
  ) {
    console.log(`${key}: ${value}`);
  }

  if (warnings.length > 0) {
    console.log("");
    console.log("[WARNINGS]");

    for (
      const warning of
      warnings.slice(0, 30)
    ) {
      console.log(
        JSON.stringify(
          warning,
        ),
      );
    }
  }

  if (errors.length > 0) {
    console.log("");
    console.log("[ERRORS]");

    for (
      const error of
      errors.slice(0, 50)
    ) {
      console.log(
        JSON.stringify(
          error,
        ),
      );
    }

    process.exitCode = 1;

    return;
  }

  console.log("");
  console.log(
    "audit passed",
  );
}

main().catch((error) => {
  console.error("");
  console.error(
    "[KURARI EX MATCHUP EXACT AUDIT FAILED]",
  );

  console.error(error);

  process.exitCode = 1;
});