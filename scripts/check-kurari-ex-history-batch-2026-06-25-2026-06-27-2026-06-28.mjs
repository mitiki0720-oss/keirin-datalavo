import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();
const INDEX_PATH = "public/data/analytics/kurari-ex/history/index.generated.json";
const DATES = ["2026-06-25", "2026-06-27", "2026-06-28", "2026-06-29"];
const NO_STARTERS_DATES = new Set(["2026-06-25", "2026-06-27", "2026-06-28"]);
const LATEST_PATH =
  "/data/analytics/kurari-ex/history/daily/2026-06/2026-06-29.generated.json";
const ALLOWED = new Set([
  INDEX_PATH,
  "docs/kurari-ex/2026-06-25-history-completion.md",
  "docs/kurari-ex/2026-06-27-history-completion.md",
  "docs/kurari-ex/2026-06-28-history-completion.md",
  "scripts/run-kurari-ex-history-no-starters-batch-2026-06-27-to-2026-06-28.mjs",
  "scripts/check-kurari-ex-history-batch-2026-06-25-2026-06-27-2026-06-28.mjs",
  ...["2026-06-27", "2026-06-28"].map(
    (date) =>
      `public/data/analytics/kurari-ex/history/daily/${date.slice(0, 7)}/${date}.generated.json`,
  ),
]);
const KNOWN_REVIEW_CHANGES = [
  "public/data/reviews/index.json",
  "public/data/reviews/2026-06-28/",
  "public/data/reviews/2026-06-29/",
  "public/data/reviews/2026-06-30/",
  "public/data/reviews/2026-07-01/",
];

function abs(file) {
  return path.isAbsolute(file) ? file : path.resolve(ROOT, file);
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function hashBuffer(buffer) {
  return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
}

function hashPayload(payload) {
  return hashBuffer(Buffer.from(JSON.stringify(payload), "utf8"));
}

function knownReview(file) {
  return KNOWN_REVIEW_CHANGES.some(
    (known) => file === known || (known.endsWith("/") && file.startsWith(known)),
  );
}

function protectedChanges() {
  const output = execFileSync(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=all"],
    { cwd: ROOT, encoding: "utf8" },
  );
  return output.split(/\r?\n/u).filter(Boolean).map((line) => ({
    status: line.slice(0, 2),
    file: line.slice(3).replace(/^"|"$/gu, "").replaceAll("\\", "/"),
  })).filter(({ file }) => !ALLOWED.has(file) && !knownReview(file));
}

function countDuplicates(values) {
  return values.length - new Set(values).size;
}

function sameEntry(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function headIndex() {
  const text = execFileSync(
    "git",
    ["show", `HEAD:${INDEX_PATH}`],
    { cwd: ROOT, encoding: "utf8" },
  );
  return JSON.parse(text);
}

function printSection(label, value) {
  console.log(`[${label}]`);
  console.log(JSON.stringify(value, null, 2));
}

export async function checkKurariExHistoryBatch20260625To20260628() {
  const blocks = {};
  const addBlock = (reason, count = 1) => {
    blocks[reason] = (blocks[reason] ?? 0) + count;
  };
  if (!existsSync(abs(INDEX_PATH))) addBlock("INDEX_MISSING");
  let index = null;
  let indexBuffer = null;
  try {
    indexBuffer = await readFile(abs(INDEX_PATH));
    index = JSON.parse(indexBuffer.toString("utf8"));
  } catch {
    addBlock("INDEX_PARSE_FAILED");
  }
  const items = array(index?.items);
  const head = await headIndex();
  const head20260625 = array(head.items).find((item) => item.date === "2026-06-25");
  const head20260629 = array(head.items).find((item) => item.date === "2026-06-29");
  const current20260625 = items.find((item) => item.date === "2026-06-25");
  const current20260629 = items.find((item) => item.date === "2026-06-29");
  const currentByDate = new Map(items.map((item) => [item.date, item]));
  const changedExistingEntryCount =
    array(head.items).filter(
      (item) => !sameEntry(item, currentByDate.get(item.date)),
    ).length;
  const perDateSummary = [];

  if (countDuplicates(items.map((item) => item.date)) > 0) addBlock("DUPLICATE_DATE");
  if (countDuplicates(items.map((item) => item.file)) > 0) addBlock("DUPLICATE_PATH");
  if (index?.dayCount !== items.length) addBlock("DAY_COUNT_MISMATCH");
  if (index?.raceCount !== items.reduce((sum, item) => sum + item.raceCount, 0)) {
    addBlock("RACE_COUNT_MISMATCH");
  }
  const itemBytesSum = items.reduce((sum, item) => sum + item.bytes, 0);
  if (index?.totalBytes !== itemBytesSum) addBlock("TOTAL_BYTES_MISMATCH");
  if (index?.period?.to !== "2026-06-29") addBlock("LATEST_DATE_CHANGED");
  if (items.at(-1)?.date !== "2026-06-29" || items.at(-1)?.file !== LATEST_PATH) {
    addBlock("LATEST_POINTER_CHANGED");
  }
  if (changedExistingEntryCount > 0) {
    addBlock("EXISTING_INDEX_ENTRY_CHANGED", changedExistingEntryCount);
  }
  if (!sameEntry(head20260625, current20260625)) addBlock("ENTRY_2026_06_25_CHANGED");
  if (!sameEntry(head20260629, current20260629)) addBlock("ENTRY_2026_06_29_CHANGED");

  for (const date of DATES) {
    const entry = items.find((item) => item.date === date);
    if (!entry) {
      addBlock("TARGET_ENTRY_MISSING");
      perDateSummary.push({ date, status: "MISSING" });
      continue;
    }
    const resolvedPath = entry.file.startsWith("/data/") ? `public${entry.file}` : entry.file;
    if (!existsSync(abs(resolvedPath))) {
      addBlock("TARGET_DAILY_MISSING");
      perDateSummary.push({ date, status: "DAILY_MISSING", resolvedPath });
      continue;
    }
    try {
      const buffer = await readFile(abs(resolvedPath));
      const daily = JSON.parse(buffer.toString("utf8"));
      const races = array(daily.items);
      const starters = races.flatMap((race) => array(race.starters));
      const noStartersRaceCount = races.filter((race) => (
        race.starterCount === 0
        && array(race.starters).length === 0
        && race.quality?.starterParsed === false
        && race.quality?.marker === "NO_STARTERS"
      )).length;
      const generatedRegistrationNoCount =
        starters.filter((starter) => starter?.registrationNo && date !== "2026-06-29").length;
      const publicPathResolved = abs(resolvedPath);
      const valid = [
        daily.date === date,
        daily.raceCount === races.length,
        entry.raceCount === daily.raceCount,
        entry.settledRaceCount === daily.settledRaceCount,
        entry.cancelledRaceCount === daily.cancelledRaceCount,
        entry.bytes === buffer.length,
        existsSync(publicPathResolved),
        new Set(races.map((race) => race.raceKey)).size === races.length,
      ].every(Boolean);
      if (!valid) addBlock("DAILY_INDEX_INCONSISTENT");
      if (NO_STARTERS_DATES.has(date)) {
        if (starters.length !== 0 || noStartersRaceCount !== races.length) {
          addBlock("NO_STARTERS_POLICY_FAILED");
        }
        if (generatedRegistrationNoCount > 0) addBlock("GENERATED_IDENTITY_FOUND");
      } else if (date === "2026-06-29" && starters.length === 0) {
        addBlock("ENTRY_2026_06_29_STARTERS_LOST");
      }
      perDateSummary.push({
        date,
        status: valid ? "OK" : "FAIL",
        dailyPath: resolvedPath,
        publicPath: entry.file,
        publicPathResolved,
        dailyHash: hashPayload(daily),
        dailyBytes: buffer.length,
        raceCount: daily.raceCount,
        venueCount: new Set(races.map((race) => race.venueKey)).size,
        noStartersRaceCount,
        starterTotalCount: starters.length,
        indexEntryExists: true,
        memoExists: NO_STARTERS_DATES.has(date)
          ? existsSync(abs(`docs/kurari-ex/${date}-history-completion.md`))
          : existsSync(abs("docs/kurari-ex/2026-06-29-history-completion.md")),
      });
    } catch {
      addBlock("DAILY_PARSE_FAILED");
      perDateSummary.push({ date, status: "PARSE_FAILED" });
    }
  }

  const dirtyProtected = protectedChanges();
  if (dirtyProtected.length > 0) addBlock("PROTECTED_MODIFICATION_FOUND", dirtyProtected.length);
  const pass = Object.keys(blocks).length === 0;
  const processedOptionalDates =
    perDateSummary.filter((item) => ["2026-06-27", "2026-06-28"].includes(item.date));
  const finalStatus = pass
    ? "BATCH_CHECK_PASS_2026_06_25_2026_06_27_2026_06_28"
    : processedOptionalDates.some((item) => item.status === "OK")
      ? "BATCH_CHECK_PARTIAL_PASS"
      : "BATCH_CHECK_FAIL";
  const summary = {
    finalStatus,
    indexHash: index ? hashPayload(index) : null,
    indexBytes: indexBuffer?.length ?? null,
    sourceCount: items.length,
    dayCount: index?.dayCount ?? null,
    raceCount: index?.raceCount ?? null,
    totalBytes: index?.totalBytes ?? null,
    itemBytesSum,
    latestDate: items.at(-1)?.date ?? null,
    latestPath: items.at(-1)?.file ?? null,
    duplicateDateCount: countDuplicates(items.map((item) => item.date)),
    duplicatePathCount: countDuplicates(items.map((item) => item.file)),
    changedExistingEntryCount,
    entry20260625Unchanged: sameEntry(head20260625, current20260625),
    entry20260629Unchanged: sameEntry(head20260629, current20260629),
    perDateSummary,
    fakeCompletionPerformed: false,
    fuzzyMatchingPerformed: false,
    generatedStarterIdentityPerformed: false,
    protectedChanges: dirtyProtected,
    blockReasonCounts: blocks,
    writePerformed: false,
  };
  printSection("summary", summary);
  if (!pass) process.exitCode = 1;
  return summary;
}

const isMain =
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  checkKurariExHistoryBatch20260625To20260628().catch((error) => {
    console.error("[kurari-ex history batch checker] failed");
    console.error(error);
    process.exitCode = 1;
  });
}
