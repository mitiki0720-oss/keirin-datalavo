import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();

const officialIdentityPath = path.join(
  projectRoot,
  "public",
  "data",
  "analytics",
  "kurari-ex",
  "exact",
  "official-rider-identity.generated.json",
);

const playerCardIndexPath = path.join(
  projectRoot,
  "public",
  "data",
  "player-cards",
  "index.json",
);

const riderMasterPath = path.join(
  projectRoot,
  "public",
  "data",
  "analytics",
  "kurari-ex",
  "exact",
  "rider-master.generated.json",
);

const dryRun = process.argv.includes("--dry-run");

function nowIso() {
  return new Date().toISOString();
}

function compactText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim();
}

function normalizeNameKey(value) {
  return compactText(value).replace(/\s+/gu, "");
}

function normalizeRegistrationNo(value) {
  const text = String(value ?? "").replace(/[^\d]/gu, "");
  return /^\d{5,6}$/u.test(text) ? text.padStart(6, "0") : "";
}

async function readJsonIfExists(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

function payloadItems(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.items)) {
    return payload.items;
  }

  return [];
}

function uniqueByKey(items, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function upsertValueHistory(history, value, seenAt, source) {
  const normalized = compactText(value);
  if (!normalized) return history ?? [];

  const list = Array.isArray(history) ? [...history] : [];
  const existing = list.find((item) => item.value === normalized);

  if (existing) {
    existing.lastSeenAt = seenAt || existing.lastSeenAt || "";
    if (source && !existing.sources.includes(source)) {
      existing.sources.push(source);
      existing.sources.sort();
    }
    return list;
  }

  list.push({
    value: normalized,
    firstSeenAt: seenAt || "",
    lastSeenAt: seenAt || "",
    sources: source ? [source] : [],
  });

  return list.sort((left, right) =>
    `${left.firstSeenAt}:${left.value}`.localeCompare(
      `${right.firstSeenAt}:${right.value}`,
    ),
  );
}

function upsertNameAlias(aliases, name, seenAt, source) {
  const normalized = compactText(name);
  const nameKey = normalizeNameKey(normalized);

  if (!normalized || !nameKey) return aliases ?? [];

  const list = Array.isArray(aliases) ? [...aliases] : [];
  const existing = list.find((item) => item.nameKey === nameKey);

  if (existing) {
    existing.name = normalized;
    existing.lastSeenAt = seenAt || existing.lastSeenAt || "";
    if (source && !existing.sources.includes(source)) {
      existing.sources.push(source);
      existing.sources.sort();
    }
    return list;
  }

  list.push({
    name: normalized,
    nameKey,
    firstSeenAt: seenAt || "",
    lastSeenAt: seenAt || "",
    sources: source ? [source] : [],
  });

  return list.sort((left, right) =>
    `${left.firstSeenAt}:${left.nameKey}`.localeCompare(
      `${right.firstSeenAt}:${right.nameKey}`,
    ),
  );
}

function createEmptyRider(registrationNo) {
  return {
    registrationNo,
    id: registrationNo,

    currentName: "",
    currentNameKey: "",
    nameAliases: [],

    currentClass: "",
    classHistory: [],

    currentPrefecture: "",
    prefectureHistory: [],

    currentStyle: "",
    styleHistory: [],

    currentKana: "",
    kanaHistory: [],

    currentRegion: "",
    regionHistory: [],

    firstSeenAt: "",
    lastSeenAt: "",

    seenInLatestOfficialImport: false,
    sources: [],

    status: "unknown",
  };
}

function mergeRider(base, sourceItem, options) {
  const seenAt = options.seenAt || "";
  const source = options.source || "";
  const fromOfficial = options.fromOfficial === true;

  const next = {
    ...base,
    nameAliases: [...(base.nameAliases ?? [])],
    classHistory: [...(base.classHistory ?? [])],
    prefectureHistory: [...(base.prefectureHistory ?? [])],
    styleHistory: [...(base.styleHistory ?? [])],
    kanaHistory: [...(base.kanaHistory ?? [])],
    regionHistory: [...(base.regionHistory ?? [])],
    sources: [...(base.sources ?? [])],
  };

  const name = compactText(sourceItem.name || sourceItem.currentName);
  const classValue = compactText(sourceItem.class || sourceItem.grade || sourceItem.currentClass);
  const prefecture = compactText(sourceItem.prefecture || sourceItem.currentPrefecture);
  const style = compactText(sourceItem.style || sourceItem.currentStyle);
  const kana = compactText(sourceItem.kana || sourceItem.currentKana);
  const region = compactText(sourceItem.region || sourceItem.currentRegion);

  if (name) {
    next.currentName = name;
    next.currentNameKey = normalizeNameKey(name);
    next.nameAliases = upsertNameAlias(next.nameAliases, name, seenAt, source);
  }

  if (classValue) {
    next.currentClass = classValue;
    next.classHistory = upsertValueHistory(next.classHistory, classValue, seenAt, source);
  }

  if (prefecture) {
    next.currentPrefecture = prefecture;
    next.prefectureHistory = upsertValueHistory(next.prefectureHistory, prefecture, seenAt, source);
  }

  if (style) {
    next.currentStyle = style;
    next.styleHistory = upsertValueHistory(next.styleHistory, style, seenAt, source);
  }

  if (kana) {
    next.currentKana = kana;
    next.kanaHistory = upsertValueHistory(next.kanaHistory, kana, seenAt, source);
  }

  if (region) {
    next.currentRegion = region;
    next.regionHistory = upsertValueHistory(next.regionHistory, region, seenAt, source);
  }

  if (seenAt) {
    next.firstSeenAt = next.firstSeenAt || seenAt;
    next.lastSeenAt = fromOfficial ? seenAt : next.lastSeenAt || seenAt;
  }

  if (source && !next.sources.includes(source)) {
    next.sources.push(source);
    next.sources.sort();
  }

  if (fromOfficial) {
    next.seenInLatestOfficialImport = true;
    if (next.status !== "retired") {
      next.status = "active";
    }
  }

  if (!next.status) {
    next.status = "unknown";
  }

  return next;
}

function statusCounts(items) {
  const counts = {};
  for (const item of items) {
    counts[item.status] = (counts[item.status] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function sourceCounts(items) {
  const counts = {};
  for (const item of items) {
    for (const source of item.sources ?? []) {
      counts[source] = (counts[source] ?? 0) + 1;
    }
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
  );
}

async function main() {
  const generatedAt = nowIso();

  const official = await readJsonIfExists(officialIdentityPath, {
    officialEntryDate: "",
    items: [],
  });

  const playerCardIndex = await readJsonIfExists(playerCardIndexPath, {
    items: [],
  });

  const previous = await readJsonIfExists(riderMasterPath, {
    items: [],
  });

  const byRegistrationNo = new Map();

  for (const rider of previous.items ?? []) {
    const registrationNo = normalizeRegistrationNo(rider.registrationNo);
    if (!registrationNo) continue;

    byRegistrationNo.set(registrationNo, {
      ...createEmptyRider(registrationNo),
      ...rider,
      registrationNo,
      id: registrationNo,
      seenInLatestOfficialImport: false,
      sources: Array.isArray(rider.sources) ? rider.sources : [],
    });
  }

  const officialItems = uniqueByKey(
    payloadItems(official),
    (item) => normalizeRegistrationNo(item.registrationNo),
  );

  for (const item of officialItems) {
    const registrationNo = normalizeRegistrationNo(item.registrationNo);
    if (!registrationNo) continue;

    const current = byRegistrationNo.get(registrationNo) ?? createEmptyRider(registrationNo);

    byRegistrationNo.set(
      registrationNo,
      mergeRider(current, item, {
        seenAt: item.lastSeenAt || official.officialEntryDate || "",
        source: item.source || official.source || "KEIRIN.JP:JSJ006",
        fromOfficial: true,
      }),
    );
  }

  const playerCards = uniqueByKey(
    payloadItems(playerCardIndex),
    (item) => normalizeRegistrationNo(item.registrationNo),
  );

  for (const item of playerCards) {
    const registrationNo = normalizeRegistrationNo(item.registrationNo);
    if (!registrationNo) continue;

    const current = byRegistrationNo.get(registrationNo) ?? createEmptyRider(registrationNo);

    byRegistrationNo.set(
      registrationNo,
      mergeRider(current, item, {
        seenAt: item.updatedAt || "",
        source: item.source || "player-card-index",
        fromOfficial: false,
      }),
    );
  }

  const items = [...byRegistrationNo.values()].sort((left, right) =>
    left.registrationNo.localeCompare(right.registrationNo),
  );

  const payload = {
    schemaVersion: 1,
    generatedAt,
    sourceType: "RIDER_MASTER",
    officialEntryDate: official.officialEntryDate ?? "",
    officialRiderCount: officialItems.length,
    playerCardIndexCount: playerCards.length,
    riderCount: items.length,
    activeCount: items.filter((item) => item.status === "active").length,
    seenInLatestOfficialImportCount: items.filter(
      (item) => item.seenInLatestOfficialImport,
    ).length,
    statusCounts: statusCounts(items),
    sourceCounts: sourceCounts(items),
    items,
  };

  const text = `${JSON.stringify(payload, null, 2)}\n`;

  if (!dryRun) {
    await mkdir(path.dirname(riderMasterPath), { recursive: true });
    await writeFile(riderMasterPath, text, "utf8");
  }

  console.log("");
  console.log("[KURARI EX RIDER MASTER]");
  console.log(`dryRun: ${dryRun}`);
  console.log(`officialEntryDate: ${payload.officialEntryDate}`);
  console.log(`officialRiderCount: ${payload.officialRiderCount}`);
  console.log(`playerCardIndexCount: ${payload.playerCardIndexCount}`);
  console.log(`riderCount: ${payload.riderCount}`);
  console.log(`activeCount: ${payload.activeCount}`);
  console.log(`seenInLatestOfficialImportCount: ${payload.seenInLatestOfficialImportCount}`);
  console.log(`statusCounts: ${JSON.stringify(payload.statusCounts)}`);
  console.log(`sourceCounts: ${JSON.stringify(payload.sourceCounts)}`);
  console.log(`outputBytes: ${Buffer.byteLength(text, "utf8")}`);
  console.log(`file: ${path.relative(projectRoot, riderMasterPath).replaceAll(path.sep, "/")}`);

  if (dryRun) {
    console.log("dry-run: public file was not written");
  }
}

main().catch((error) => {
  console.error("[KURARI EX RIDER MASTER] failed");
  console.error(error);
  process.exitCode = 1;
});
