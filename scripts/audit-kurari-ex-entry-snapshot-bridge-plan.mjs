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

const PIPELINE_FILES = [
  "scripts/update-keirin-jp-entries.mjs",
  "scripts/check-keirin-jp-entries.mjs",
  "scripts/update-today-races.mjs",
  "scripts/kurari-ex-daily-common.mjs",
  "scripts/archive-kurari-ex-daily-facts.mjs",
  "scripts/export-kurari-ex-compact-history.mjs",
  "scripts/kurari-ex-history-common.mjs",
  "scripts/normalize-kurari-ex-history.mjs",
  "scripts/run-kurari-ex-nightly-update.mjs",
  "scripts/run-kurari-ex-raw-refresh.mjs",
];

const RIDER_FIELDS = [
  "carNo",
  "name",
  "registrationNo",
  "prefecture",
  "age",
  "previousClass",
  "raceClass",
  "graduationTerm",
  "style",
  "gearRatio",
];

const SAFE_JOIN_KEY_PRIORITY = [
  "raceId exact match",
  "raceKey exact match",
  "date + venueKey + raceNumber exact match",
  "date + normalized venueName + raceNumber exact match",
];

const UNSAFE_JOIN_KEYS = [
  "name only",
  "venueName only",
  "result only",
  "lineup only",
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
  const normalized = normalizeText(key) || "(unknown)";
  counter[normalized] = (counter[normalized] ?? 0) + amount;
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

function flattenEntryRaces(payload) {
  const races = [];
  for (const venue of Array.isArray(payload?.venues) ? payload.venues : []) {
    for (const race of Array.isArray(venue?.races) ? venue.races : []) {
      races.push({
        payload,
        venue,
        race,
        raceId: normalizeText(race?.raceId),
        raceKey: normalizeText(race?.raceKey),
        date: normalizeText(race?.date ?? venue?.date ?? payload?.date),
        venueKey: normalizeText(
          race?.venueKey ?? venue?.venueKey ?? venue?.slug,
        ),
        venueName: normalizeVenueName(
          race?.venueName ?? venue?.venueName ?? venue?.venue,
        ),
        raceNumber: toInteger(race?.raceNumber ?? race?.raceNo),
        entries: Array.isArray(race?.entries) ? race.entries : [],
      });
    }
  }
  return races;
}

function flattenTodayRaces(payload) {
  const races = [];
  for (const venue of Array.isArray(payload?.venues) ? payload.venues : []) {
    const venueRaces = Array.isArray(venue?.races) ? venue.races : [];
    const raceIds = Array.isArray(venue?.raceIds) ? venue.raceIds : [];
    venueRaces.forEach((race, index) => {
      races.push({
        payload,
        venue,
        race,
        raceId: normalizeText(race?.raceId ?? raceIds[index]),
        raceKey: normalizeText(race?.raceKey),
        date: normalizeText(race?.date ?? venue?.date ?? payload?.date),
        venueKey: normalizeText(
          race?.venueKey ?? race?.slug ?? venue?.venueKey ?? venue?.slug,
        ),
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

function inspectEntryArray(entries, expectedCount = null) {
  const carNos = entries.map((entry) => toInteger(entry?.carNo));
  const registrationNos = entries.map((entry) =>
    normalizeText(entry?.registrationNo),
  );
  const validRegistrationCount = registrationNos.filter(
    isValidRegistrationNo,
  ).length;
  const validNameCount = entries.filter(
    (entry) => normalizeText(entry?.name).length > 0,
  ).length;
  const validCarNoCount = carNos.filter(
    (carNo) => Number.isInteger(carNo) && carNo >= 1 && carNo <= 9,
  ).length;
  const carNoUnique =
    validCarNoCount === entries.length &&
    new Set(carNos).size === entries.length;
  const registrationNoUnique =
    validRegistrationCount === entries.length &&
    new Set(registrationNos).size === entries.length;
  const expectedCountMatched =
    expectedCount === null ||
    (expectedCount > 0 && entries.length === expectedCount);
  const full =
    entries.length > 0 &&
    validCarNoCount === entries.length &&
    validNameCount === entries.length &&
    validRegistrationCount === entries.length &&
    carNoUnique &&
    registrationNoUnique &&
    expectedCountMatched;
  const partial =
    !full &&
    entries.length > 0 &&
    validRegistrationCount > 0;

  return {
    entryCount: entries.length,
    validCarNoCount,
    validNameCount,
    validRegistrationCount,
    carNoUnique,
    registrationNoUnique,
    duplicateCarNo: !carNoUnique,
    duplicateRegistrationNo: !registrationNoUnique,
    expectedCountMatched,
    full,
    partial,
    carNos,
  };
}

function currentEntryKeyAvailability(entryRaces) {
  const fields = {
    raceId: 0,
    raceKey: 0,
    date: 0,
    venueKey: 0,
    venueName: 0,
    raceNumber: 0,
    sourceAtRoot: 0,
    generatedAtAtRoot: 0,
  };
  for (const item of entryRaces) {
    if (item.raceId) fields.raceId += 1;
    if (item.raceKey) fields.raceKey += 1;
    if (item.date) fields.date += 1;
    if (item.venueKey) fields.venueKey += 1;
    if (item.venueName) fields.venueName += 1;
    if (item.raceNumber) fields.raceNumber += 1;
    if (normalizeText(item.payload?.source)) fields.sourceAtRoot += 1;
    if (normalizeText(item.payload?.generatedAt)) {
      fields.generatedAtAtRoot += 1;
    }
  }
  return fields;
}

function entryRiderFieldAvailability(entryRaces) {
  const output = Object.fromEntries(
    RIDER_FIELDS.map((field) => [field, 0]),
  );
  for (const { entries } of entryRaces) {
    for (const entry of entries) {
      for (const field of RIDER_FIELDS) {
        if (
          Object.hasOwn(entry ?? {}, field) &&
          entry[field] !== null &&
          normalizeText(entry[field]).length > 0
        ) {
          output[field] += 1;
        }
      }
    }
  }
  return output;
}

function createIndex(items, keyFactory) {
  const index = new Map();
  for (const item of items) {
    const key = keyFactory(item);
    if (!key) continue;
    const matches = index.get(key) ?? [];
    matches.push(item);
    index.set(key, matches);
  }
  return index;
}

function joinKey(item, type) {
  if (type === "raceId") return item.raceId || "";
  if (type === "raceKey") return item.raceKey || "";
  if (type === "dateVenueKeyRaceNumber") {
    return item.date && item.venueKey && item.raceNumber
      ? `${item.date}|${item.venueKey}|${item.raceNumber}`
      : "";
  }
  if (type === "dateVenueNameRaceNumber") {
    return item.date && item.venueName && item.raceNumber
      ? `${item.date}|${item.venueName}|${item.raceNumber}`
      : "";
  }
  return "";
}

function findMatch(item, indexes) {
  const types = [
    "raceId",
    "raceKey",
    "dateVenueKeyRaceNumber",
    "dateVenueNameRaceNumber",
  ];
  for (const type of types) {
    const key = joinKey(item, type);
    if (!key) continue;
    const matches = indexes[type].get(key) ?? [];
    if (matches.length > 0) return { type, matches };
  }
  return { type: null, matches: [] };
}

function auditCurrentEntries(entryRaces) {
  const output = {
    currentEntriesRaceCount: entryRaces.length,
    currentEntriesRiderCount: 0,
    currentEntriesFullRegistrationRaceCount: 0,
    currentEntriesPartialRegistrationRaceCount: 0,
    currentEntriesMissingRegistrationRaceCount: 0,
    currentEntriesDateRange: { from: null, to: null },
    currentEntriesVenueCount: 0,
    currentEntriesKeyAvailability:
      currentEntryKeyAvailability(entryRaces),
    currentEntriesRiderFieldAvailability:
      entryRiderFieldAvailability(entryRaces),
  };
  const dates = entryRaces.map((item) => item.date).filter(Boolean).sort();
  const venues = new Set();
  for (const item of entryRaces) {
    venues.add(item.venueName || item.venueKey);
    const inspection = inspectEntryArray(item.entries);
    output.currentEntriesRiderCount += inspection.entryCount;
    if (inspection.full) {
      output.currentEntriesFullRegistrationRaceCount += 1;
    } else if (inspection.partial) {
      output.currentEntriesPartialRegistrationRaceCount += 1;
    } else {
      output.currentEntriesMissingRegistrationRaceCount += 1;
    }
  }
  output.currentEntriesDateRange = {
    from: dates[0] ?? null,
    to: dates.at(-1) ?? null,
  };
  output.currentEntriesVenueCount = venues.size;
  return output;
}

function auditTodayBridge(todayRaces, entryRaces) {
  const types = [
    "raceId",
    "raceKey",
    "dateVenueKeyRaceNumber",
    "dateVenueNameRaceNumber",
  ];
  const indexes = Object.fromEntries(
    types.map((type) => [
      type,
      createIndex(entryRaces, (item) => joinKey(item, type)),
    ]),
  );
  const output = {
    todayRaceCount: todayRaces.length,
    todayRidersRaceCount: 0,
    todayRidersWithRegistrationNoCount: 0,
    todayEntriesMatchedRaceCount: 0,
    todayEntriesUnmatchedRaceCount: 0,
    todayEntriesMatchKeyCounts: Object.fromEntries(
      types.map((type) => [type, 0]),
    ),
    todayBridgeFullCandidateCount: 0,
    todayBridgePartialCandidateCount: 0,
    todayBridgeBlockedCount: 0,
    todayBridgeBlockReasons: {},
  };

  for (const today of todayRaces) {
    if (today.riders.length > 0) output.todayRidersRaceCount += 1;
    if (
      today.riders.length > 0 &&
      today.riders.every((rider) =>
        isValidRegistrationNo(rider?.registrationNo),
      )
    ) {
      output.todayRidersWithRegistrationNoCount += 1;
    }

    const match = findMatch(today, indexes);
    if (match.matches.length === 0) {
      output.todayEntriesUnmatchedRaceCount += 1;
      output.todayBridgeBlockedCount += 1;
      increment(output.todayBridgeBlockReasons, "ENTRY_RACE_NOT_FOUND");
      continue;
    }
    output.todayEntriesMatchedRaceCount += 1;
    output.todayEntriesMatchKeyCounts[match.type] += 1;
    if (match.matches.length > 1) {
      output.todayBridgeBlockedCount += 1;
      increment(output.todayBridgeBlockReasons, "AMBIGUOUS_ENTRY_MATCH");
      continue;
    }

    const entryRace = match.matches[0];
    const inspection = inspectEntryArray(
      entryRace.entries,
      today.riders.length,
    );
    const todayCarNos = today.riders.map((rider) =>
      toInteger(rider?.carNo),
    );
    const sameCarNos =
      todayCarNos.length === inspection.carNos.length &&
      todayCarNos.every((carNo) => inspection.carNos.includes(carNo));
    if (inspection.full && sameCarNos) {
      output.todayBridgeFullCandidateCount += 1;
    } else if (inspection.partial && sameCarNos) {
      output.todayBridgePartialCandidateCount += 1;
    } else {
      output.todayBridgeBlockedCount += 1;
      if (!inspection.expectedCountMatched) {
        increment(
          output.todayBridgeBlockReasons,
          "STARTER_COUNT_MISMATCH",
        );
      } else if (!sameCarNos) {
        increment(output.todayBridgeBlockReasons, "CAR_NO_SET_MISMATCH");
      } else if (inspection.duplicateCarNo) {
        increment(output.todayBridgeBlockReasons, "DUPLICATE_CAR_NO");
      } else if (!inspection.registrationNoUnique) {
        increment(
          output.todayBridgeBlockReasons,
          "REGISTRATION_NO_INCOMPLETE_OR_DUPLICATE",
        );
      } else {
        increment(output.todayBridgeBlockReasons, "ENTRY_SOURCE_UNSAFE");
      }
    }
  }
  return output;
}

async function loadHistoryRaces(historyIndex) {
  const races = [];
  for (const item of Array.isArray(historyIndex.items)
    ? historyIndex.items
    : []) {
    const daily = await readJson(toHistoryFile(item.file));
    races.push(...(Array.isArray(daily.items) ? daily.items : []));
  }
  return races;
}

function auditHistoryKeys(historyRaces) {
  const keyChecks = {
    raceKey: (race) => normalizeText(race?.raceKey),
    raceId: (race) => normalizeText(race?.raceId),
    date: (race) => normalizeText(race?.date),
    venueKey: (race) => normalizeText(race?.venueKey),
    venueName: (race) => normalizeText(race?.venueName),
    raceNumber: (race) => toInteger(race?.raceNumber),
    starterCount: (race) => toInteger(race?.starterCount),
    qualityStarterParsed: (race) =>
      typeof race?.quality?.starterParsed === "boolean"
        ? String(race.quality.starterParsed)
        : "",
  };
  return Object.fromEntries(
    Object.entries(keyChecks).map(([key, checker]) => [
      key,
      historyRaces.filter((race) => checker(race) !== "" && checker(race) !== null)
        .length,
    ]),
  );
}

async function auditPipelineEvidence() {
  const contents = Object.fromEntries(
    await Promise.all(
      PIPELINE_FILES.map(async (relative) => [
        relative,
        await readFile(path.join(ROOT, relative), "utf8"),
      ]),
    ),
  );
  const includes = (file, pattern) =>
    pattern.test(contents[file] ?? "");
  return {
    filesChecked: PIPELINE_FILES,
    facts: [
      {
        script: "scripts/update-keirin-jp-entries.mjs",
        observation: includes(
          "scripts/update-keirin-jp-entries.mjs",
          /registrationNo:\s*clean\(row\.sensyuRegistNo\)/u,
        )
          ? "公式row.sensyuRegistNoからentries[].registrationNoを生成する。"
          : "registrationNo生成式を確認できない。",
      },
      {
        script: "scripts/update-today-races.mjs",
        observation: includes(
          "scripts/update-today-races.mjs",
          /registrationNo/iu,
        )
          ? "registrationNo文字列を含む。"
          : "today生成処理にregistrationNo文字列がなく、現行today.ridersにもfieldがない。",
      },
      {
        script: "scripts/kurari-ex-daily-common.mjs",
        observation:
          includes(
            "scripts/kurari-ex-daily-common.mjs",
            /today\.generated\.json/u,
          ) &&
          includes(
            "scripts/kurari-ex-daily-common.mjs",
            /race\?\.riders/u,
          )
            ? "today.generated.jsonのrace.ridersからstartersを構成する。"
            : "today.ridersからstartersを構成する証拠を確認できない。",
      },
      {
        script: "scripts/kurari-ex-daily-common.mjs",
        observation: includes(
          "scripts/kurari-ex-daily-common.mjs",
          /keirin-jp-entries\.generated\.json/u,
        )
          ? "keirin-jp entriesを直接参照する。"
          : "keirin-jp-entries.generated.jsonの直接参照はない。",
      },
      {
        script: "scripts/export-kurari-ex-compact-history.mjs",
        observation:
          includes(
            "scripts/export-kurari-ex-compact-history.mjs",
            /race\.starters/u,
          ) &&
          includes(
            "scripts/export-kurari-ex-compact-history.mjs",
            /starterParsed:\s*starters\.length\s*>\s*0/u,
          )
            ? "既存race.startersをcompact化し、配列が非空ならstarterParsed=trueとする。"
            : "compact historyのstarterParsed決定式を確認できない。",
      },
    ],
    hypothesis:
      "公式entries出力とtoday.riders/history startersの間に、登録番号をrace単位で受け渡すbridgeが未接続である可能性を、write前dry-runで検証する。",
  };
}

const REQUIRED_HISTORY_BRIDGE_KEYS = [
  "raceKey",
  "raceId",
  "date",
  "venueKey",
  "venueName",
  "raceNumber",
  "starterCount",
  "quality.starterParsed",
];

const REQUIRED_ENTRY_SNAPSHOT_KEYS = [
  "raceKey",
  "raceId",
  "date",
  "venueKey",
  "venueName",
  "raceNumber",
  "source",
  "generatedAt",
  "entries[]",
  "entries[].carNo",
  "entries[].name",
  "entries[].registrationNo",
];

const SNAPSHOT_PATH_OPTIONS = [
  {
    path:
      "public/data/races/entries-history/YYYY-MM-DD/keirin-jp-entries.generated.json",
    assessment:
      "推奨。既存race source配下で日付単位に分離でき、current feedの上書きとanalytics保護領域を避けられる。",
  },
  {
    path:
      "public/data/races/keirin-jp-entries/YYYY-MM-DD.generated.json",
    assessment:
      "利用可能だが、現行keirin-jp-entries.generated.jsonと名称が近く、運用時の取り違えに注意が必要。",
  },
  {
    path:
      "public/data/analytics/kurari-ex/source/entries/YYYY-MM-DD.generated.json",
    assessment:
      "非推奨。analytics保護領域へsource snapshotを混在させるため、生成物との境界が曖昧になる。",
  },
];

const PROPOSED_SNAPSHOT_SCHEMA = {
  schemaVersion: "kurari-ex-entry-snapshot/v1",
  generatedAt: "<ISO-8601 source capture timestamp>",
  source: "keirin-jp-entries",
  date: "YYYY-MM-DD",
  bridgeVersion: "kurari-ex-history-bridge/v1",
  races: [
    {
      raceId: "<saved source raceId or empty>",
      raceKey: "<canonical raceKey>",
      date: "YYYY-MM-DD",
      venueKey: "<canonical venue key>",
      venueName: "<saved venue name>",
      raceNumber: 1,
      starterCount: 7,
      entries: [
        {
          carNo: 1,
          name: "<saved official name>",
          registrationNo: "<saved official 6-digit value>",
          prefecture: "<saved value or empty>",
          age: null,
          class: "<saved race class or empty>",
          period: "<saved graduation term or empty>",
        },
      ],
      quality: {
        entryParsed: true,
        registrationComplete: true,
        carNoUnique: true,
        registrationNoUnique: true,
        starterCountMatched: true,
      },
    },
  ],
};

const BRIDGE_VALIDATION_RULES = [
  "raceId完全一致、またはsafeJoinKeyPriorityの先頭から一意に一致すること。",
  "history.starterCountとsnapshot.entries.lengthが一致すること。",
  "entries[].carNoが1..9の整数で重複しないこと。",
  "entries[].registrationNoが全員分の6桁値で重複しないこと。",
  "entries[].nameは補助表示に限定し、join主キーに使わないこと。",
  "result・lineup・predictionをstarter sourceとして使わないこと。",
  "snapshot source・generatedAt・bridgeVersionを保存すること。",
  "複数候補・不一致・欠落raceは補完せずblockedにすること。",
];

const BRIDGE_BLOCKED_REASONS = [
  "ENTRY_SNAPSHOT_NOT_FOUND",
  "RACE_JOIN_KEY_MISSING",
  "AMBIGUOUS_ENTRY_MATCH",
  "STARTER_COUNT_MISMATCH",
  "CAR_NO_INVALID",
  "DUPLICATE_CAR_NO",
  "REGISTRATION_NO_MISSING",
  "REGISTRATION_NO_INVALID",
  "DUPLICATE_REGISTRATION_NO",
  "SOURCE_METADATA_MISSING",
];

const BRIDGE_QUALITY_FLAGS = [
  "entryParsed",
  "registrationComplete",
  "carNoUnique",
  "registrationNoUnique",
  "starterCountMatched",
  "joinKeyType",
  "bridgeStatus",
];

const FAKE_PROHIBITED_RULES = [
  "選手名からregistrationNoを補完しない。",
  "resultの着順・車番・名前から全starter配列を生成しない。",
  "lineup.carNoからstarter identityを生成しない。",
  "venue名だけ・選手名だけではraceを結合しない。",
  "欠落entryや人数不一致を推測で埋めない。",
];

function createDesign(historyAvailability, currentEntryAvailability) {
  const missingForBridge = {
    history: REQUIRED_HISTORY_BRIDGE_KEYS.filter(
      (key) =>
        key === "raceId" && historyAvailability.raceId === 0,
    ),
    currentEntries: [
      ...(currentEntryAvailability.raceId === 0 ? ["raceId"] : []),
      ...(currentEntryAvailability.raceKey === 0 ? ["raceKey"] : []),
      ...(currentEntryAvailability.venueKey === 0 ? ["venueKey"] : []),
    ],
    note:
      "raceIdは両側で未保存でも、canonical raceKeyまたはdate+venueKey+raceNumberが一意ならbridge可能。現行はdate+venueName+raceNumberのみ。",
  };

  return {
    requiredHistoryBridgeKeys: REQUIRED_HISTORY_BRIDGE_KEYS,
    requiredEntrySnapshotKeys: REQUIRED_ENTRY_SNAPSHOT_KEYS,
    currentlyAvailableHistoryKeys: historyAvailability,
    currentlyAvailableCurrentEntryKeys: currentEntryAvailability,
    missingForBridge,
    safeJoinKeyPriority: SAFE_JOIN_KEY_PRIORITY,
    unsafeJoinKeys: UNSAFE_JOIN_KEYS,
    proposedSnapshotPathOptions: SNAPSHOT_PATH_OPTIONS,
    recommendedSnapshotPath:
      "public/data/races/entries-history/YYYY-MM-DD/keirin-jp-entries.generated.json",
    snapshotPathAssessment: {
      reason:
        "公式race sourceとして日別保持でき、current feed上書きとanalytics保護領域を避けられる。",
      protectedPathRisk:
        "public/data/analytics/kurari-ex/**を使わないため低い。public/data/races/**の新規運用ルールは必要。",
      gitSizeRisk:
        "日次・全出走者データのため継続増加する。サイズ監査と保持方針が必要。",
      dailyOverwriteRisk:
        "日付固定pathにwrite-if-changedと既存完全snapshot保護を設ければ抑制可能。",
      historyReplayBenefit:
        "history対象日と同日の公式entriesをrace単位で再検証でき、現在feed上書きに依存しない。",
    },
    proposedSnapshotSchema: PROPOSED_SNAPSHOT_SCHEMA,
    requiredFields: REQUIRED_ENTRY_SNAPSHOT_KEYS,
    optionalFields: [
      "entries[].prefecture",
      "entries[].age",
      "entries[].class",
      "entries[].period",
      "entries[].style",
    ],
    qualityFlags: PROPOSED_SNAPSHOT_SCHEMA.races[0].quality,
    bridgeValidationRules: BRIDGE_VALIDATION_RULES,
    bridgeBlockedReasons: BRIDGE_BLOCKED_REASONS,
    bridgeQualityFlags: BRIDGE_QUALITY_FLAGS,
    fakeProhibitedRules: FAKE_PROHIBITED_RULES,
    minimalChangeSteps: [
      "1. update-keirin-jp-entries.mjsの検証済み出力を、current feedに加えて日別snapshotへwrite-if-changedで保存する。",
      "2. update-today-races.mjsで同日snapshotをrace単位に一意照合し、検証済みregistrationNoだけをridersへ渡す。",
      "3. kurari-ex-daily-common.mjsはtoday.riders.registrationNoを入力し、既存identity解決状態と完全性を記録する。",
      "4. history replayは同日entries-history snapshotだけを読み、全検証通過raceだけをdry-run候補にする。",
      "5. 既存historyは即再生成せず、bridge dry-runの件数一致・blocked理由確認後にwrite工程を別依頼で設計する。",
    ],
    scriptsToChangeLater: [
      "scripts/update-keirin-jp-entries.mjs",
      "scripts/check-keirin-jp-entries.mjs",
      "scripts/update-today-races.mjs",
      "scripts/kurari-ex-daily-common.mjs",
      "scripts/archive-kurari-ex-daily-facts.mjs",
    ],
    scriptsNotToChangeNow: PIPELINE_FILES,
    dataFilesToCreateLater: [
      "public/data/races/entries-history/YYYY-MM-DD/keirin-jp-entries.generated.json",
      "public/data/races/entries-history/index.generated.json（必要性を別途監査）",
    ],
    dryRunBeforeWritePlan: [
      "同日snapshotとtoday/historyをsafeJoinKeyPriorityで照合する。",
      "人数・車番・registrationNo完全性と重複を検証する。",
      "FULL/PARTIAL/BLOCKEDをconsole出力し、ファイル保存しない。",
      "FULL候補件数と既存starterParsed件数への影響を確認する。",
    ],
    riskAudit: {
      overwriteRisk:
        "current entriesは毎回上書きされる。日別snapshotは既存完全版を不完全取得で置換しない制御が必要。",
      oldHistoryReplayRisk:
        "過去日のsnapshotが存在しない2,882件は、設計追加だけでは復元できない。",
      identityMismatchRisk:
        "名前照合は禁止し、公式registrationNoと車番・人数の完全一致を必須にする。",
      venueNameMismatchRisk:
        "会場名表記差があるためcanonical venueKeyをsnapshotへ保存し、名称joinは最終fallbackに限定する。",
      raceNumberMismatchRisk:
        "raceNumber欠落・文字列差・開催日の取り違えをblockedにする。",
      protectedPathRisk:
        "analytics・reviewsへ保存しない。推奨pathはpublic/data/races配下だが、今回は作成しない。",
      fakeCompletionRisk:
        "欠落登録番号・人数不一致・曖昧joinをblockedにし、結果・lineup・名前から補完しない。",
      mitigation:
        "write前dry-run、source metadata、bridgeVersion、quality flags、write-if-changed、既存完全snapshot保護を必須にする。",
    },
    nextRecommendedAction:
      "日別snapshotを書かないbridge dry-runを先に追加し、現行64レースでFULL候補64件・blocked 0件を再現できるか検証する。",
  };
}

function printSection(label, value) {
  console.log(`\n[${label}]`);
  console.log(JSON.stringify(value, null, 2));
}

async function main() {
  const [historyIndex, entriesPayload, todayPayload, pipelineEvidence] =
    await Promise.all([
      readJson(HISTORY_INDEX_FILE),
      readJson(ENTRIES_FILE),
      readJson(TODAY_FILE),
      auditPipelineEvidence(),
    ]);
  const [historyRaces] = await Promise.all([
    loadHistoryRaces(historyIndex),
  ]);
  const entryRaces = flattenEntryRaces(entriesPayload);
  const todayRaces = flattenTodayRaces(todayPayload);
  const currentEntriesAudit = auditCurrentEntries(entryRaces);
  const todayBridgeAudit = auditTodayBridge(todayRaces, entryRaces);
  const historyAvailability = auditHistoryKeys(historyRaces);
  const design = createDesign(
    historyAvailability,
    currentEntriesAudit.currentEntriesKeyAvailability,
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
    todayBridgeAudit.todayEntriesMatchedRaceCount +
      todayBridgeAudit.todayEntriesUnmatchedRaceCount !==
    todayBridgeAudit.todayRaceCount
  ) {
    throw new Error("today match totals are inconsistent");
  }

  const summary = {
    ...currentEntriesAudit,
    ...todayBridgeAudit,
    historyRaceCount: historyRaces.length,
    pipelineEvidence,
    ...design,
    writesPerformed: false,
    identityFallbackUsed: false,
    fakeCompletionPerformed: false,
    productionJsonGenerated: false,
  };

  console.log("[kurari-ex entry snapshot bridge plan audit]");
  console.log("writesPerformed: false");
  console.log("identityFallbackUsed: false");
  console.log("fakeCompletionPerformed: false");
  console.log("productionJsonGenerated: false");
  console.log(
    "policy: snapshot・today・historyを変更せず、保存済みfieldと設計条件だけを監査する。",
  );

  console.log("\n[summary]");
  console.log(
    `currentEntriesRaceCount: ${summary.currentEntriesRaceCount}`,
  );
  console.log(
    `currentEntriesFullRegistrationRaceCount: ${summary.currentEntriesFullRegistrationRaceCount}`,
  );
  console.log(`todayRaceCount: ${summary.todayRaceCount}`);
  console.log(
    `todayEntriesMatchedRaceCount: ${summary.todayEntriesMatchedRaceCount}`,
  );
  console.log(
    `todayBridgeFullCandidateCount: ${summary.todayBridgeFullCandidateCount}`,
  );
  console.log(
    `recommendedSnapshotPath: ${summary.recommendedSnapshotPath}`,
  );

  printSection(
    "currentEntriesKeyAvailability",
    summary.currentEntriesKeyAvailability,
  );
  printSection(
    "currentEntriesRiderFieldAvailability",
    summary.currentEntriesRiderFieldAvailability,
  );
  printSection("todayBridgeAudit", todayBridgeAudit);
  printSection(
    "requiredHistoryBridgeKeys",
    summary.requiredHistoryBridgeKeys,
  );
  printSection(
    "requiredEntrySnapshotKeys",
    summary.requiredEntrySnapshotKeys,
  );
  printSection("missingForBridge", summary.missingForBridge);
  printSection(
    "proposedSnapshotPathOptions",
    summary.proposedSnapshotPathOptions,
  );
  printSection(
    "proposedSnapshotSchema",
    summary.proposedSnapshotSchema,
  );
  printSection(
    "bridgeValidationRules",
    summary.bridgeValidationRules,
  );
  printSection("minimalChangeSteps", summary.minimalChangeSteps);
  printSection("scriptsToChangeLater", summary.scriptsToChangeLater);
  printSection("dataFilesToCreateLater", summary.dataFilesToCreateLater);
  printSection("riskAudit", summary.riskAudit);
  printSection("nextRecommendedAction", summary.nextRecommendedAction);
  printSection("jsonSummary", summary);
}

main().catch((error) => {
  console.error("[kurari-ex entry snapshot bridge plan audit] failed");
  console.error(error);
  process.exitCode = 1;
});
