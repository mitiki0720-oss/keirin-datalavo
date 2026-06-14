import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  exactOutputRoot,
  projectRoot,
  serializeJson,
  writeJson,
} from "./kurari-ex-history-common.mjs";

const args = process.argv.slice(2);

function getArgValue(name, fallback = "") {
  return (
    args
      .find((arg) => arg.startsWith(`${name}=`))
      ?.slice(name.length + 1) ?? fallback
  );
}

function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\s\u3000・･.．]/gu, "")
    .trim();
}

function normalizeRegistrationNo(value) {
  const digits = String(value ?? "").replace(/\D/gu, "");
  return /^\d{6}$/u.test(digits) ? digits : "";
}

function clean(value) {
  return String(value ?? "")
    .replace(/\s+/gu, " ")
    .trim();
}

async function readJsonIfPresent(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

function normalizeRiderItem(item) {
  const registrationNo = normalizeRegistrationNo(item.registrationNo ?? item.id);
  const name = clean(item.name);
  const nameKey = normalizeName(item.nameKey ?? item.name);
  if (!registrationNo || !nameKey) return null;

  return {
    registrationNo,
    id: registrationNo,
    name,
    nameKey,
    kana: clean(item.kana),
    class: clean(item.class ?? item.grade),
    grade: clean(item.grade ?? item.class),
    prefecture: clean(item.prefecture),
    region: clean(item.region),
    style: clean(item.style),
    updatedAt: clean(item.updatedAt),
    firstSeenAt: clean(item.firstSeenAt),
    lastSeenAt: clean(item.lastSeenAt),
    source: clean(item.source) || "KEIRIN.JP:JSJ006",
    sourceType: "OFFICIAL_ENTRY",
    status: "ready",
  };
}

async function main() {
  const officialEntriesPath = path.resolve(
    getArgValue("--entries", "public/data/races/keirin-jp-entries.generated.json"),
  );
  const outputPath = path.resolve(
    getArgValue(
      "--output",
      path.join(exactOutputRoot, "official-rider-identity.generated.json"),
    ),
  );

  const official = await readJsonIfPresent(officialEntriesPath, null);
  if (!official) {
    throw new Error(`official entries not found: ${officialEntriesPath}`);
  }

  const previous = await readJsonIfPresent(outputPath, {
    schemaVersion: 1,
    generatedAt: "",
    sourceType: "OFFICIAL_ENTRY",
    riderCount: 0,
    items: [],
    warnings: [],
  });

  const byRegistrationNo = new Map();

  for (const item of previous.items ?? []) {
    const normalized = normalizeRiderItem(item);
    if (normalized) byRegistrationNo.set(normalized.registrationNo, normalized);
  }

  const officialDate = clean(official.date);
  const nowIso = new Date().toISOString();
  let seenInCurrentEntries = 0;

  for (const venue of official.venues ?? []) {
    for (const race of venue.races ?? []) {
      for (const entry of race.entries ?? []) {
        const registrationNo = normalizeRegistrationNo(entry.registrationNo);
        const name = clean(entry.name);
        const nameKey = normalizeName(entry.name);
        if (!registrationNo || !nameKey) continue;

        seenInCurrentEntries += 1;

        const current = byRegistrationNo.get(registrationNo);
        const next = {
          registrationNo,
          id: registrationNo,
          name,
          nameKey,
          kana: current?.kana ?? "",
          class: clean(entry.raceClass) || current?.class || "",
          grade: clean(entry.raceClass) || current?.grade || "",
          prefecture: clean(entry.prefecture) || current?.prefecture || "",
          region: current?.region ?? "",
          style: clean(entry.style) || current?.style || "",
          updatedAt: officialDate || nowIso.slice(0, 10),
          firstSeenAt: current?.firstSeenAt || officialDate || nowIso.slice(0, 10),
          lastSeenAt: officialDate || nowIso.slice(0, 10),
          source: "KEIRIN.JP:JSJ006",
          sourceType: "OFFICIAL_ENTRY",
          status: "ready",
        };

        byRegistrationNo.set(registrationNo, next);
      }
    }
  }

  const items = [...byRegistrationNo.values()]
    .sort((left, right) => left.registrationNo.localeCompare(right.registrationNo));

  const duplicateNameKeys = [...items.reduce((map, item) => {
    const current = map.get(item.nameKey) ?? [];
    current.push(item.registrationNo);
    map.set(item.nameKey, current);
    return map;
  }, new Map()).entries()]
    .filter(([, registrationNos]) => registrationNos.length > 1)
    .map(([nameKey, registrationNos]) => ({ nameKey, registrationNos }));

  const payload = {
    schemaVersion: 1,
    generatedAt: previous.generatedAt || nowIso,
    sourceType: "OFFICIAL_ENTRY",
    source: "KEIRIN.JP:JSJ006",
    lastImportAt: nowIso,
    officialEntryDate: officialDate || null,
    riderCount: items.length,
    seenInCurrentEntries,
    duplicateNameKeyCount: duplicateNameKeys.length,
    items,
    warnings: [
      ...(duplicateNameKeys.length ? [`${duplicateNameKeys.length} duplicate official rider names`] : []),
    ],
  };

  const result = await writeJson(outputPath, payload, {
    reuseTimestamps: false,
  });

  const outputBytes = Buffer.byteLength(serializeJson(result.value));

  console.log("[kurari-ex official rider supplement]");
  console.log(`official date: ${officialDate || "--"}`);
  console.log(`seen in current entries: ${seenInCurrentEntries}`);
  console.log(`riders: ${result.value.riderCount}`);
  console.log(`duplicates: ${result.value.duplicateNameKeyCount}`);
  console.log(`changed: ${result.changed}`);
  console.log(`output: ${(outputBytes / 1024).toFixed(1)} KB`);
  console.log(`file: ${path.relative(projectRoot, outputPath).replaceAll(path.sep, "/")}`);
}

main().catch((error) => {
  console.error("[kurari-ex official rider supplement] failed");
  console.error(error);
  process.exitCode = 1;
});