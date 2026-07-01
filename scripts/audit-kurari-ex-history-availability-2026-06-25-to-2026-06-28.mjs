import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const TARGET_DATES = [
  "2026-06-25",
  "2026-06-26",
  "2026-06-27",
  "2026-06-28",
];
const THIS_SCRIPT =
  "scripts/audit-kurari-ex-history-availability-2026-06-25-to-2026-06-28.mjs";
const HISTORY_INDEX_PATH =
  "public/data/analytics/kurari-ex/history/index.generated.json";
const STARTERS_INDEX_PATH =
  "public/data/analytics/kurari-ex/source/starters/index.generated.json";
const ENTRIES_INDEX_PATH =
  "public/data/races/entries-history/index.generated.json";
const REVIEW_INDEX_PATH = "public/data/reviews/index.json";
const NORMALIZED_RACES_PATH =
  "private-input/kurari-ex/normalized/races/2026-06.jsonl";
const OFFICIAL_RESULTS_PATH =
  "public/data/races/keirin-jp-results.generated.json";
const KNOWN_REVIEWS = [
  "public/data/reviews/index.json",
  "public/data/reviews/2026-06-28/",
  "public/data/reviews/2026-06-29/",
  "public/data/reviews/2026-06-30/",
];
const BLOCK_REASON_KEYS = [
  "HISTORY_INDEX_MISSING",
  "HISTORY_INDEX_PARSE_FAILED",
  "HISTORY_DAILY_ALREADY_EXISTS",
  "HISTORY_DAILY_PARSE_FAILED",
  "RESULT_SOURCE_MISSING",
  "RESULT_SOURCE_PARTIAL",
  "RESULT_SOURCE_PARSE_FAILED",
  "PREDICTION_SOURCE_MISSING",
  "PREDICTION_SOURCE_PARTIAL",
  "REVIEW_SOURCE_MISSING",
  "REVIEW_SOURCE_PARTIAL",
  "STARTERS_SOURCE_MISSING",
  "STARTERS_SOURCE_PARTIAL",
  "STARTERS_SOURCE_REGISTRATION_NO_MISSING",
  "ENTRIES_SNAPSHOT_MISSING",
  "ENTRIES_SNAPSHOT_PARTIAL",
  "JOIN_KEY_INSUFFICIENT",
  "EXACT_JOIN_NOT_AVAILABLE",
  "CROSS_DATE_JOIN_FOUND",
  "CROSS_VENUE_JOIN_FOUND",
  "FAKE_COMPLETION_REQUIRED",
  "FUZZY_MATCHING_REQUIRED",
  "PREDICTION_USED_AS_RESULT_SOURCE",
  "REVIEW_USED_AS_RESULT_SOURCE_UNSAFELY",
  "GENERATED_REGISTRATION_NO_REQUIRED",
  "GENERATED_STARTER_IDENTITY_REQUIRED",
  "WRITE_PERFORMED_IN_AUDIT",
  "PUBLIC_ANALYTICS_MODIFIED",
  "PUBLIC_RACES_MODIFIED",
  "PUBLIC_REVIEWS_MODIFIED_BY_THIS_STEP",
  "PRIVATE_INPUT_MODIFIED",
  "SRC_MODIFIED",
  "PACKAGE_MODIFIED",
  "EXISTING_SCRIPT_MODIFIED",
  "DOCS_MODIFIED",
  "UNEXPECTED_FILE_STAGED",
];

const rel = (file) =>
  path.relative(ROOT, file).replaceAll("\\", "/");
const abs = (file) => path.resolve(ROOT, file);
const array = (value) => (Array.isArray(value) ? value : []);
const text = (value) => String(value ?? "").trim();
const increment = (counts, key, by = 1) => {
  counts[key] = (counts[key] ?? 0) + by;
};
const hashPayload = (value) =>
  `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;

async function readJson(file) {
  try {
    const raw = await readFile(abs(file), "utf8");
    return {
      exists: true,
      parseStatus: "ok",
      payload: JSON.parse(raw),
      raw,
      hash: hashPayload(JSON.parse(raw)),
    };
  } catch (error) {
    return {
      exists: error?.code !== "ENOENT",
      parseStatus: error?.code === "ENOENT" ? "missing" : "failed",
      payload: null,
      raw: null,
      hash: null,
    };
  }
}

async function readText(file) {
  try {
    return await readFile(abs(file), "utf8");
  } catch {
    return null;
  }
}

async function filesIn(directory) {
  try {
    const entries = await readdir(abs(directory), { withFileTypes: true });
    const nested = await Promise.all(entries.map(async (entry) => {
      const file = path.join(directory, entry.name);
      return entry.isDirectory() ? filesIn(file) : [file.replaceAll("\\", "/")];
    }));
    return nested.flat();
  } catch {
    return [];
  }
}

function countRaceHeaders(content) {
  if (!content) return 0;
  return [...content.matchAll(/^■\s+.+?\s+(\d+)R\s*$/gmu)].length;
}

function countResultRows(content) {
  if (!content) return 0;
  return [...content.matchAll(/^着順:\s*\S+/gmu)].length;
}

function countConfirmed(content) {
  if (!content) return 0;
  return [...content.matchAll(/^結果確定:\s*confirmed\s*$/gmu)].length;
}

function countCancelled(content) {
  if (!content) return 0;
  return [...content.matchAll(/^(?:結果確定:\s*)?(?:cancelled|中止)\s*$/gmu)].length;
}

function venueFromFilename(file) {
  return path.basename(file).replace(/-(?:result|prediction|summary)\.[^.]+$/u, "");
}

async function analyzeTextFiles(files) {
  const rows = await Promise.all(files.map(async (file) => {
    const content = await readText(file);
    return {
      file,
      content,
      raceCount: countRaceHeaders(content),
      resultRowCount: countResultRows(content),
      confirmedCount: countConfirmed(content),
      cancelledCount: countCancelled(content),
      venue: venueFromFilename(file),
    };
  }));
  return {
    rows,
    fileCount: rows.length,
    raceCount: rows.reduce((total, row) => total + row.raceCount, 0),
    resultRowCount: rows.reduce((total, row) => total + row.resultRowCount, 0),
    confirmedCount: rows.reduce((total, row) => total + row.confirmedCount, 0),
    cancelledCount: rows.reduce((total, row) => total + row.cancelledCount, 0),
    venueCount: new Set(rows.map((row) => row.venue).filter(Boolean)).size,
  };
}

function countDuplicates(values) {
  const seen = new Set();
  let duplicateCount = 0;
  for (const value of values.filter(Boolean)) {
    if (seen.has(value)) duplicateCount += 1;
    seen.add(value);
  }
  return duplicateCount;
}

function reviewIndexItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.entries)) return payload.entries;
  return [];
}

function expectedDailyPath(date) {
  return `public/data/analytics/kurari-ex/history/daily/${date.slice(0, 7)}/${date}.generated.json`;
}

function expectedPublicPath(date) {
  return `/data/analytics/kurari-ex/history/daily/${date.slice(0, 7)}/${date}.generated.json`;
}

function startersPath(date) {
  return `public/data/analytics/kurari-ex/source/starters/${date}/today-registration-starters.generated.json`;
}

function entriesPath(date) {
  return `public/data/races/entries-history/${date}/keirin-jp-entries.generated.json`;
}

function gitLines(args) {
  try {
    return execFileSync("git", args, {
      cwd: ROOT,
      encoding: "utf8",
      windowsHide: true,
    }).split(/\r?\n/).filter(Boolean);
  } catch {
    return [];
  }
}

function statusPath(line) {
  const raw = line.slice(3).trim().replaceAll("\\", "/").replace(/^"|"$/g, "");
  return raw.includes(" -> ") ? raw.split(" -> ").at(-1) : raw;
}

function protectedGuard() {
  const lines = gitLines(["status", "--porcelain=v1", "--untracked-files=normal"]);
  const files = lines.map(statusPath);
  const stagedFiles = gitLines(["diff", "--cached", "--name-only"]);
  const knownReview = (file) => KNOWN_REVIEWS.some(
    (known) => known.endsWith("/") ? file.startsWith(known) : file === known,
  );
  const unexpected = files.filter(
    (file) => file !== THIS_SCRIPT && !knownReview(file),
  );
  const result = {
    allowedNewScriptOnly:
      files.includes(THIS_SCRIPT) && unexpected.length === 0,
    publicAnalyticsModified:
      files.some((file) => file.startsWith("public/data/analytics/")),
    publicRacesModified:
      files.some((file) => file.startsWith("public/data/races/")),
    publicReviewsTouchedByThisStep: files.some(
      (file) => file.startsWith("public/data/reviews/") && !knownReview(file),
    ),
    privateInputModified:
      files.some((file) => file.startsWith("private-input/")),
    srcModified: files.some((file) => file.startsWith("src/")),
    packageModified: files.includes("package.json"),
    docsModified: files.some((file) => file.startsWith("docs/")),
    existingScriptModified: files.some(
      (file) => file.startsWith("scripts/") && file !== THIS_SCRIPT,
    ),
    unexpectedModifiedFiles: unexpected.filter((file) =>
      !lines.some((line) => line.startsWith("??") && statusPath(line) === file)),
    unexpectedUntrackedFiles: unexpected.filter((file) =>
      lines.some((line) => line.startsWith("??") && statusPath(line) === file)),
    stagedFiles,
  };
  result.guardStatus =
    result.allowedNewScriptOnly
    && !result.publicAnalyticsModified
    && !result.publicRacesModified
    && !result.publicReviewsTouchedByThisStep
    && !result.privateInputModified
    && !result.srcModified
    && !result.packageModified
    && !result.docsModified
    && !result.existingScriptModified
    && stagedFiles.length === 0
      ? "pass"
      : "fail";
  return result;
}

function printSection(name, value) {
  console.log(`\n[${name}]`);
  console.log(JSON.stringify(value, null, 2));
}

function nextActionPlan(bestNextDate, ready) {
  const actions = [
    "bestNextDate private raw mapping dry-run",
    "bestNextDate history daily write safety audit",
    "bestNextDate history daily writer/checker",
    "bestNextDate history index update policy",
    "bestNextDate same-date starters bridge",
    "optional batch processing design",
    "reviews差分の別管理・別commit",
  ];
  return actions.map((action, index) => ({
    stepId: index + 1,
    action,
    targetDate: index < 5 ? bestNextDate : null,
    prerequisiteStatus:
      index === 0 ? (ready ? "availability audit passed" : "blocked") : "previous step or separate scope",
    allowedFiles: ["separate-step scoped files"],
    prohibitedFiles: [
      "fake/fuzzy completion",
      "cross-date joins",
      "reviews mutation in this task",
    ],
    readiness: index === 0 && ready ? "ready" : "future",
    notes: index === 4
      ? "same-date starters/entries sources are currently missing and must be acquired first"
      : "not performed by this audit",
  }));
}

export async function auditHistoryAvailability() {
  const watchedFiles = [
    HISTORY_INDEX_PATH,
    STARTERS_INDEX_PATH,
    ENTRIES_INDEX_PATH,
    REVIEW_INDEX_PATH,
    NORMALIZED_RACES_PATH,
  ];
  const beforeHashes = Object.fromEntries(await Promise.all(
    watchedFiles.map(async (file) => {
      const read = await readJson(file);
      return [file, read.hash];
    }),
  ));
  const [
    historyIndexRead,
    startersIndexRead,
    entriesIndexRead,
    reviewIndexRead,
    normalizedText,
    officialResultsText,
  ] = await Promise.all([
    readJson(HISTORY_INDEX_PATH),
    readJson(STARTERS_INDEX_PATH),
    readJson(ENTRIES_INDEX_PATH),
    readJson(REVIEW_INDEX_PATH),
    readText(NORMALIZED_RACES_PATH),
    readText(OFFICIAL_RESULTS_PATH),
  ]);
  const historyIndex = historyIndexRead.payload ?? {};
  const historyItems = array(historyIndex.items);
  const startersIndexItems = array(startersIndexRead.payload?.sources);
  const entriesIndexItems = array(entriesIndexRead.payload?.snapshots);
  const reviewItems = reviewIndexItems(reviewIndexRead.payload);
  const latest = [...historyItems].sort((a, b) =>
    text(a?.date).localeCompare(text(b?.date)),
  ).at(-1) ?? null;

  const targetDateCoverage = TARGET_DATES.map((date) => {
    const matches = historyItems.filter((item) => item?.date === date);
    const item = matches[0] ?? null;
    const resolved = item?.file?.startsWith("/data/")
      ? `public${item.file}`
      : null;
    return {
      date,
      indexEntryExists: matches.length === 1,
      indexEntryCount: matches.length,
      indexPath: item?.file ?? null,
      indexRaceCount: item?.raceCount ?? null,
      indexBytes: item?.bytes ?? null,
      dailyFileResolvedFromIndex: resolved,
      dailyFileExistsFromIndex: Boolean(resolved && existsSync(abs(resolved))),
      duplicateDate: matches.length > 1,
      duplicatePath:
        item ? historyItems.filter((candidate) => candidate.file === item.file).length > 1 : false,
    };
  });
  const historyIndexCoverage = {
    indexExists: historyIndexRead.exists,
    indexParseStatus: historyIndexRead.parseStatus,
    schemaVersion: historyIndex.schemaVersion ?? null,
    sourceCount: historyItems.length,
    dayCount: historyIndex.dayCount ?? null,
    raceCount: historyIndex.raceCount ?? null,
    latestDate: latest?.date ?? null,
    latestPath: latest?.file ?? null,
    totalBytes: historyIndex.totalBytes ?? null,
    targetDateCoverage,
    duplicateDateCount: countDuplicates(historyItems.map((item) => item.date)),
    duplicatePathCount: countDuplicates(historyItems.map((item) => item.file)),
  };
  historyIndexCoverage.historyIndexCoverageStatus =
    !historyIndexRead.exists || historyIndexRead.parseStatus !== "ok"
      ? "FAIL"
      : targetDateCoverage.every((item) => !item.indexEntryExists)
        ? "PARTIAL"
        : "OK";

  const historyDailyExistingCheckByDate = await Promise.all(
    TARGET_DATES.map(async (date) => {
      const file = expectedDailyPath(date);
      const read = await readJson(file);
      const items = array(read.payload?.items);
      const coverage = items.length > 0
        ? items.every((item) => array(item.starters).length > 0)
          ? "complete"
          : items.some((item) => array(item.starters).length > 0)
            ? "partial"
            : "none"
        : "absent";
      const indexEntryExists =
        targetDateCoverage.find((item) => item.date === date)?.indexEntryExists ?? false;
      let dailyStatus = "ABSENT_READY_TO_CREATE";
      if (read.exists && read.parseStatus === "failed") {
        dailyStatus = "EXISTS_PARSE_FAILED";
      } else if (read.exists && indexEntryExists) {
        dailyStatus = "EXISTS_NEEDS_SKIP_OR_VERIFY";
      } else if (read.exists) {
        dailyStatus = "EXISTS_BUT_NOT_INDEXED";
      }
      return {
        date,
        expectedDailyPath: file,
        expectedPublicPath: expectedPublicPath(date),
        dailyExists: read.exists,
        parseStatus: read.parseStatus,
        dailyHash: read.hash,
        dailyBytes: read.raw ? Buffer.byteLength(read.raw, "utf8") : null,
        raceCount: items.length,
        venueCount:
          new Set(items.map((item) => item.venueName).filter(Boolean)).size,
        starterCoverage: coverage,
        startersNonEmptyRaceCount:
          items.filter((item) => array(item.starters).length > 0).length,
        startersEmptyRaceCount:
          items.filter((item) => array(item.starters).length === 0).length,
        starterTotalCount:
          items.flatMap((item) => array(item.starters)).length,
        indexEntryExists,
        dailyStatus,
      };
    }),
  );

  const rawAnalyses = {};
  const reviewAnalyses = {};
  for (const date of TARGET_DATES) {
    const rawFiles = await filesIn(`private-input/kurari-ex/raw/${date}`);
    const reviewFiles = await filesIn(`public/data/reviews/${date}`);
    const rawResultFiles =
      rawFiles.filter((file) => /-result\.(?:txt|md|json)$/u.test(file));
    const rawPredictionFiles =
      rawFiles.filter((file) => /-prediction\.(?:txt|md|json)$/u.test(file));
    const rawSummaryFiles =
      rawFiles.filter((file) => /-summary\.(?:txt|md|json)$/u.test(file));
    const reviewResultFiles =
      reviewFiles.filter((file) => /-result\.(?:txt|md|json)$/u.test(file));
    const reviewPredictionFiles =
      reviewFiles.filter((file) => /-prediction\.(?:txt|md|json)$/u.test(file));
    const reviewSummaryFiles =
      reviewFiles.filter((file) => /-summary\.(?:txt|md|json)$/u.test(file));
    rawAnalyses[date] = {
      allFiles: rawFiles,
      resultFiles: rawResultFiles,
      predictionFiles: rawPredictionFiles,
      summaryFiles: rawSummaryFiles,
      result: await analyzeTextFiles(rawResultFiles),
      prediction: await analyzeTextFiles(rawPredictionFiles),
      summary: await analyzeTextFiles(rawSummaryFiles),
    };
    reviewAnalyses[date] = {
      allFiles: reviewFiles,
      resultFiles: reviewResultFiles,
      predictionFiles: reviewPredictionFiles,
      summaryFiles: reviewSummaryFiles,
      result: await analyzeTextFiles(reviewResultFiles),
      prediction: await analyzeTextFiles(reviewPredictionFiles),
      summary: await analyzeTextFiles(reviewSummaryFiles),
    };
  }

  const resultSourceAvailabilityByDate = TARGET_DATES.map((date) => {
    const raw = rawAnalyses[date];
    const reviews = reviewAnalyses[date];
    const normalizedCount =
      normalizedText ? [...normalizedText.matchAll(new RegExp(date, "g"))].length : 0;
    const officialCount =
      officialResultsText ? [...officialResultsText.matchAll(new RegExp(date, "g"))].length : 0;
    const complete =
      raw.result.fileCount > 0
      && raw.result.raceCount > 0
      && raw.result.resultRowCount === raw.result.raceCount;
    return {
      date,
      candidateFileCount:
        raw.allFiles.length + reviews.allFiles.length + normalizedCount + officialCount,
      privateRawCandidateCount: raw.result.fileCount,
      privateNormalizedCandidateCount: normalizedCount,
      publicAnalyticsCandidateCount: 0,
      publicRaceCandidateCount: officialCount,
      reviewResultCandidateCount: reviews.result.fileCount,
      officialFeedCandidateCount: officialCount,
      bestResultSourceCandidate: raw.result.rows[0]?.file
        ?? reviews.result.rows[0]?.file
        ?? null,
      bestResultSourceType: raw.result.fileCount > 0
        ? "private-raw"
        : reviews.result.fileCount > 0
          ? "review-result"
          : null,
      resultRaceCount: raw.result.raceCount || reviews.result.raceCount,
      venueCount: raw.result.venueCount || reviews.result.venueCount,
      settledRaceCount: raw.result.confirmedCount,
      cancelledRaceCount: raw.result.cancelledCount,
      resultCompleteness: complete
        ? "complete"
        : raw.result.raceCount > 0 || reviews.result.raceCount > 0
          ? "partial"
          : "missing",
      predictionUsedAsResultSource: false,
      reviewUsedAsResultSource: false,
      fakeCompletionPerformed: false,
      fuzzyMatchingPerformed: false,
      resultSourceStatus: complete
        ? "READY_WITH_PRIVATE_RAW_SOURCE"
        : raw.result.raceCount > 0 || reviews.result.raceCount > 0
          ? "PARTIAL_RESULT_SOURCE"
          : "MISSING_RESULT_SOURCE",
    };
  });

  const predictionSourceAvailabilityByDate = TARGET_DATES.map((date) => {
    const raw = rawAnalyses[date];
    const reviews = reviewAnalyses[date];
    const raceCount = raw.prediction.raceCount || reviews.prediction.raceCount;
    const venueCount = raw.prediction.venueCount || reviews.prediction.venueCount;
    return {
      date,
      candidateFileCount:
        raw.prediction.fileCount + reviews.prediction.fileCount,
      predictionFileCount: raw.prediction.fileCount,
      reviewPredictionFileCount: reviews.prediction.fileCount,
      privatePredictionFileCount: raw.prediction.fileCount,
      venueCount,
      raceCount,
      predictionLinkedRaceCountCandidate: raceCount,
      bestPredictionSourceCandidate:
        raw.prediction.rows[0]?.file ?? reviews.prediction.rows[0]?.file ?? null,
      predictionSourceStatus:
        raceCount > 0
          ? raw.prediction.resultRowCount === 0 && raceCount > 0
            ? "READY"
            : "READY"
          : "MISSING",
    };
  });

  const reviewSourceAvailabilityByDate = TARGET_DATES.map((date) => {
    const reviews = reviewAnalyses[date];
    const indexed = reviewItems.filter((item) => item?.date === date);
    const raceCount = Math.max(
      reviews.result.raceCount,
      reviews.prediction.raceCount,
    );
    return {
      date,
      reviewDirExists: existsSync(abs(`public/data/reviews/${date}`)),
      reviewIndexEntryExists: indexed.length > 0,
      reviewFileCount: reviews.allFiles.length,
      reviewPredictionCount: reviews.prediction.fileCount,
      reviewResultCount: reviews.result.fileCount,
      reviewSummaryCount: reviews.summary.fileCount,
      reviewVenueCount: new Set(reviews.allFiles.map(venueFromFilename)).size,
      reviewRaceCount: raceCount,
      reviewSourceStatus:
        reviews.allFiles.length > 0 && indexed.length > 0
          ? "READY"
          : reviews.allFiles.length > 0
            ? "PARTIAL"
            : "MISSING",
    };
  });

  const startersSourceAvailabilityByDate = await Promise.all(
    TARGET_DATES.map(async (date) => {
      const file = startersPath(date);
      const read = await readJson(file);
      const races = array(read.payload?.races);
      const starters = races.flatMap((race) => array(race.starters));
      const indexEntryExists =
        startersIndexItems.filter((item) => item?.date === date).length === 1;
      const duplicateJoinKeyCount = countDuplicates(
        races.map((race) => `${race.date}::${race.venueName}::${race.raceNumber}`),
      );
      const missingRegistrationNoCount =
        starters.filter((starter) => !text(starter.registrationNo)).length;
      const ready =
        read.exists
        && read.parseStatus === "ok"
        && races.length > 0
        && races.every(
          (race) =>
            text(race.date)
            && text(race.venueName)
            && Number(race.raceNumber) > 0,
        )
        && missingRegistrationNoCount === 0
        && duplicateJoinKeyCount === 0
        && indexEntryExists;
      return {
        date,
        startersSourcePath: file,
        startersSourceExists: read.exists,
        startersSourceIndexEntryExists: indexEntryExists,
        parseStatus: read.parseStatus,
        sourceRaceCount: races.length,
        sourceVenueCount:
          new Set(races.map((race) => race.venueName).filter(Boolean)).size,
        sourceStarterTotalCount: starters.length,
        missingRegistrationNoCount,
        missingNameCount:
          starters.filter((starter) => !text(starter.name)).length,
        missingCarNoCount:
          starters.filter((starter) => !text(starter.carNo)).length,
        duplicateJoinKeyCount,
        duplicateCarNoWithinRaceCount: races.filter(
          (race) =>
            countDuplicates(array(race.starters).map((starter) => starter.carNo)) > 0,
        ).length,
        duplicateRegistrationNoWithinRaceCount: races.filter(
          (race) =>
            countDuplicates(
              array(race.starters).map((starter) => starter.registrationNo),
            ) > 0,
        ).length,
        raceKeyAvailableCount:
          races.filter((race) => text(race.raceKey)).length,
        venueKeyAvailableCount:
          races.filter((race) => text(race.venueKey)).length,
        dateVenueNameRaceNumberJoinKeyAvailableCount:
          races.filter(
            (race) =>
              text(race.date)
              && text(race.venueName)
              && Number(race.raceNumber) > 0,
          ).length,
        startersSourceStatus: ready
          ? "READY_EXACT_SAME_DATE_SOURCE"
          : read.exists && read.parseStatus === "ok" ? "PARTIAL" : "MISSING",
      };
    }),
  );

  const entriesSnapshotAvailabilityByDate = await Promise.all(
    TARGET_DATES.map(async (date) => {
      const file = entriesPath(date);
      const read = await readJson(file);
      const races = array(read.payload?.races);
      const entries = races.flatMap((race) => array(race.entries));
      const indexEntryExists =
        entriesIndexItems.filter((item) => item?.date === date).length === 1;
      const duplicateJoinKeyCount = countDuplicates(
        races.map((race) => `${race.date}::${race.venueName}::${race.raceNumber}`),
      );
      const ready =
        read.exists
        && read.parseStatus === "ok"
        && races.length > 0
        && entries.every((entry) => text(entry.registrationNo))
        && duplicateJoinKeyCount === 0
        && indexEntryExists;
      return {
        date,
        entriesSnapshotPath: file,
        entriesSnapshotExists: read.exists,
        entriesIndexEntryExists: indexEntryExists,
        parseStatus: read.parseStatus,
        entryRaceCount: races.length,
        entryVenueCount:
          new Set(races.map((race) => race.venueName).filter(Boolean)).size,
        entryStarterTotalCount: entries.length,
        missingRegistrationNoCount:
          entries.filter((entry) => !text(entry.registrationNo)).length,
        duplicateRaceKeyCount:
          countDuplicates(races.map((race) => race.raceKey).filter(Boolean)),
        duplicateJoinKeyCount,
        entriesSnapshotStatus: ready
          ? "READY"
          : read.exists && read.parseStatus === "ok" ? "PARTIAL" : "MISSING",
      };
    }),
  );

  const sameDateJoinFeasibilityByDate = TARGET_DATES.map((date) => {
    const result =
      resultSourceAvailabilityByDate.find((item) => item.date === date);
    const prediction =
      predictionSourceAvailabilityByDate.find((item) => item.date === date);
    const starters =
      startersSourceAvailabilityByDate.find((item) => item.date === date);
    const entries =
      entriesSnapshotAvailabilityByDate.find((item) => item.date === date);
    const requiredPresent =
      result.resultRaceCount > 0
      && starters.sourceRaceCount > 0
      && entries.entryRaceCount > 0;
    const nameJoinCount = requiredPresent
      ? Math.min(
        result.resultRaceCount,
        starters.dateVenueNameRaceNumberJoinKeyAvailableCount,
        entries.entryRaceCount,
      )
      : 0;
    return {
      date,
      resultRaceCount: result.resultRaceCount,
      predictionRaceCount: prediction.raceCount,
      startersSourceRaceCount: starters.sourceRaceCount,
      entriesSnapshotRaceCount: entries.entryRaceCount,
      candidateJoinMethod:
        requiredPresent ? "dateVenueNameRaceNumber" : null,
      raceKeyDirectJoinPossibleCount: 0,
      dateVenueKeyRaceNumberJoinPossibleCount: 0,
      dateVenueNameRaceNumberJoinPossibleCount: nameJoinCount,
      estimatedMatchedRaceCount: nameJoinCount,
      estimatedUnmatchedResultRaceCount:
        Math.max(0, result.resultRaceCount - nameJoinCount),
      estimatedUnmatchedStarterRaceCount:
        Math.max(0, starters.sourceRaceCount - nameJoinCount),
      estimatedBridgeEligibleRaceCount: nameJoinCount,
      estimatedBridgeBlockedRaceCount:
        Math.max(result.resultRaceCount, starters.sourceRaceCount) - nameJoinCount,
      joinFeasibilityStatus: requiredPresent
        ? nameJoinCount === result.resultRaceCount
          && nameJoinCount === starters.sourceRaceCount
          && nameJoinCount === entries.entryRaceCount
          ? "READY_FOR_DRY_RUN"
          : "PARTIAL"
        : "MISSING_REQUIRED_SOURCE",
    };
  });

  const perDateReadiness = TARGET_DATES.map((date) => {
    const daily =
      historyDailyExistingCheckByDate.find((item) => item.date === date);
    const result =
      resultSourceAvailabilityByDate.find((item) => item.date === date);
    const prediction =
      predictionSourceAvailabilityByDate.find((item) => item.date === date);
    const review =
      reviewSourceAvailabilityByDate.find((item) => item.date === date);
    const starters =
      startersSourceAvailabilityByDate.find((item) => item.date === date);
    const entries =
      entriesSnapshotAvailabilityByDate.find((item) => item.date === date);
    const join =
      sameDateJoinFeasibilityByDate.find((item) => item.date === date);
    const index =
      targetDateCoverage.find((item) => item.date === date);
    const shouldSkipBecauseAlreadyExists =
      daily.dailyStatus !== "ABSENT_READY_TO_CREATE" || index.indexEntryExists;
    const resultReady =
      ["READY_WITH_PRIVATE_RAW_SOURCE", "READY_WITH_PUBLIC_RESULT_SOURCE"]
        .includes(result.resultSourceStatus);
    const predictionReady = prediction.predictionSourceStatus === "READY";
    let readiness = "MISSING_REQUIRED_SOURCE";
    if (shouldSkipBecauseAlreadyExists) {
      readiness = "ALREADY_EXISTS_NEEDS_VERIFY";
    } else if (resultReady && predictionReady) {
      readiness = "READY_FOR_PRIVATE_RAW_MAPPING_DRY_RUN";
    } else if (
      result.resultSourceStatus === "PARTIAL_RESULT_SOURCE"
      || prediction.predictionSourceStatus === "PARTIAL"
      || review.reviewSourceStatus === "PARTIAL"
    ) {
      readiness = "PARTIAL_NEEDS_SOURCE_REVIEW";
    }
    return {
      date,
      historyIndexStatus: index.indexEntryExists ? "EXISTS_PROTECT" : "ABSENT",
      historyDailyExistingStatus: daily.dailyStatus,
      resultSourceStatus: result.resultSourceStatus,
      predictionSourceStatus: prediction.predictionSourceStatus,
      reviewSourceStatus: review.reviewSourceStatus,
      startersSourceStatus: starters.startersSourceStatus,
      entriesSnapshotStatus: entries.entriesSnapshotStatus,
      sameDateJoinFeasibilityStatus: join.joinFeasibilityStatus,
      expectedHistoryRaceCount: result.resultRaceCount || null,
      expectedVenueCount: result.venueCount || null,
      expectedStarterTotalCount:
        starters.sourceStarterTotalCount || null,
      canCreateHistoryDaily:
        !shouldSkipBecauseAlreadyExists && resultReady && predictionReady,
      canLinkPrediction: predictionReady,
      canBridgeStartersSameDate:
        join.joinFeasibilityStatus === "READY_FOR_DRY_RUN",
      needsPrivateRawMapping:
        !shouldSkipBecauseAlreadyExists && resultReady,
      needsResultSourceFix: !resultReady,
      needsPredictionSourceFix: !predictionReady,
      needsStartersSourceFix:
        starters.startersSourceStatus !== "READY_EXACT_SAME_DATE_SOURCE",
      needsEntriesSnapshotFix: entries.entriesSnapshotStatus !== "READY",
      needsReviewSourceFix: review.reviewSourceStatus !== "READY",
      shouldSkipBecauseAlreadyExists,
      readiness,
    };
  });

  const readinessCount = (status) =>
    perDateReadiness.filter((item) => item.readiness === status).length;
  const readyForPrivateRawMappingDryRunCount =
    readinessCount("READY_FOR_PRIVATE_RAW_MAPPING_DRY_RUN");
  const readyForHistoryDailyWriteSafetyAuditCount =
    readinessCount("READY_FOR_HISTORY_DAILY_WRITE_SAFETY_AUDIT");
  const readyForSameDateBridgeDryRunCount =
    readinessCount("READY_FOR_SAME_DATE_BRIDGE_DRY_RUN");
  const partialNeedsSourceReviewCount =
    readinessCount("PARTIAL_NEEDS_SOURCE_REVIEW");
  const missingRequiredSourceCount =
    readinessCount("MISSING_REQUIRED_SOURCE");
  const alreadyExistsNeedsVerifyCount =
    readinessCount("ALREADY_EXISTS_NEEDS_VERIFY");
  const blockedCount = readinessCount("BLOCKED");
  const recommendedProcessingOrder = perDateReadiness
    .filter((item) => item.readiness === "READY_FOR_PRIVATE_RAW_MAPPING_DRY_RUN")
    .map((item) => item.date);
  const bestNextDate = recommendedProcessingOrder[0] ?? null;
  let rangeStatus = "PARTIAL";
  if (readyForPrivateRawMappingDryRunCount === TARGET_DATES.length) {
    rangeStatus = "READY_TO_PROCESS_ALL_DATES";
  } else if (readyForPrivateRawMappingDryRunCount > 0) {
    rangeStatus = "READY_TO_PROCESS_SOME_DATES";
  } else if (blockedCount === TARGET_DATES.length) {
    rangeStatus = "BLOCKED";
  }
  const rangeAvailabilitySummary = {
    targetDateCount: TARGET_DATES.length,
    readyForPrivateRawMappingDryRunCount,
    readyForHistoryDailyWriteSafetyAuditCount,
    readyForSameDateBridgeDryRunCount,
    partialNeedsSourceReviewCount,
    missingRequiredSourceCount,
    alreadyExistsNeedsVerifyCount,
    blockedCount,
    bestNextDate,
    recommendedProcessingOrder,
    recommendedNextStep: bestNextDate
      ? `${bestNextDate} private raw mapping dry-run`
      : "required source acquisition",
    rangeStatus,
  };

  const targetDatesSummary = {
    targetDateCount: TARGET_DATES.length,
    fromDate: TARGET_DATES[0],
    toDate: TARGET_DATES.at(-1),
    dateList: TARGET_DATES,
    alreadyInHistoryIndexCount:
      targetDateCoverage.filter((item) => item.indexEntryExists).length,
    missingFromHistoryIndexCount:
      targetDateCoverage.filter((item) => !item.indexEntryExists).length,
    alreadyHasDailyCount:
      historyDailyExistingCheckByDate.filter((item) => item.dailyExists).length,
    missingDailyCount:
      historyDailyExistingCheckByDate.filter((item) => !item.dailyExists).length,
    availabilityAuditStatus:
      readyForPrivateRawMappingDryRunCount === TARGET_DATES.length
        ? "OK"
        : readyForPrivateRawMappingDryRunCount > 0 ? "PARTIAL" : "FAIL",
  };

  const blockReasonCounts = Object.fromEntries(
    BLOCK_REASON_KEYS.map((key) => [key, 0]),
  );
  if (!historyIndexRead.exists) {
    increment(blockReasonCounts, "HISTORY_INDEX_MISSING");
  }
  if (historyIndexRead.parseStatus === "failed") {
    increment(blockReasonCounts, "HISTORY_INDEX_PARSE_FAILED");
  }
  for (const date of TARGET_DATES) {
    const daily =
      historyDailyExistingCheckByDate.find((item) => item.date === date);
    const result =
      resultSourceAvailabilityByDate.find((item) => item.date === date);
    const prediction =
      predictionSourceAvailabilityByDate.find((item) => item.date === date);
    const review =
      reviewSourceAvailabilityByDate.find((item) => item.date === date);
    const starters =
      startersSourceAvailabilityByDate.find((item) => item.date === date);
    const entries =
      entriesSnapshotAvailabilityByDate.find((item) => item.date === date);
    const join =
      sameDateJoinFeasibilityByDate.find((item) => item.date === date);
    if (daily.dailyExists) increment(blockReasonCounts, "HISTORY_DAILY_ALREADY_EXISTS");
    if (daily.parseStatus === "failed") {
      increment(blockReasonCounts, "HISTORY_DAILY_PARSE_FAILED");
    }
    if (result.resultSourceStatus === "MISSING_RESULT_SOURCE") {
      increment(blockReasonCounts, "RESULT_SOURCE_MISSING");
    } else if (result.resultSourceStatus === "PARTIAL_RESULT_SOURCE") {
      increment(blockReasonCounts, "RESULT_SOURCE_PARTIAL");
    }
    if (prediction.predictionSourceStatus === "MISSING") {
      increment(blockReasonCounts, "PREDICTION_SOURCE_MISSING");
    } else if (prediction.predictionSourceStatus === "PARTIAL") {
      increment(blockReasonCounts, "PREDICTION_SOURCE_PARTIAL");
    }
    if (review.reviewSourceStatus === "MISSING") {
      increment(blockReasonCounts, "REVIEW_SOURCE_MISSING");
    } else if (review.reviewSourceStatus === "PARTIAL") {
      increment(blockReasonCounts, "REVIEW_SOURCE_PARTIAL");
    }
    if (starters.startersSourceStatus === "MISSING") {
      increment(blockReasonCounts, "STARTERS_SOURCE_MISSING");
    } else if (starters.startersSourceStatus === "PARTIAL") {
      increment(blockReasonCounts, "STARTERS_SOURCE_PARTIAL");
    }
    if (starters.missingRegistrationNoCount) {
      increment(
        blockReasonCounts,
        "STARTERS_SOURCE_REGISTRATION_NO_MISSING",
        starters.missingRegistrationNoCount,
      );
    }
    if (entries.entriesSnapshotStatus === "MISSING") {
      increment(blockReasonCounts, "ENTRIES_SNAPSHOT_MISSING");
    } else if (entries.entriesSnapshotStatus === "PARTIAL") {
      increment(blockReasonCounts, "ENTRIES_SNAPSHOT_PARTIAL");
    }
    if (join.joinFeasibilityStatus === "MISSING_REQUIRED_SOURCE") {
      increment(blockReasonCounts, "EXACT_JOIN_NOT_AVAILABLE");
    }
  }

  const afterHashes = Object.fromEntries(await Promise.all(
    watchedFiles.map(async (file) => {
      const read = await readJson(file);
      return [file, read.hash];
    }),
  ));
  const changedDuringAudit = watchedFiles.filter(
    (file) => beforeHashes[file] !== afterHashes[file],
  );
  if (changedDuringAudit.length) {
    increment(blockReasonCounts, "WRITE_PERFORMED_IN_AUDIT", changedDuringAudit.length);
  }
  const guard = protectedGuard();
  for (const [field, reason] of [
    ["publicAnalyticsModified", "PUBLIC_ANALYTICS_MODIFIED"],
    ["publicRacesModified", "PUBLIC_RACES_MODIFIED"],
    ["publicReviewsTouchedByThisStep", "PUBLIC_REVIEWS_MODIFIED_BY_THIS_STEP"],
    ["privateInputModified", "PRIVATE_INPUT_MODIFIED"],
    ["srcModified", "SRC_MODIFIED"],
    ["packageModified", "PACKAGE_MODIFIED"],
    ["existingScriptModified", "EXISTING_SCRIPT_MODIFIED"],
    ["docsModified", "DOCS_MODIFIED"],
  ]) {
    if (guard[field]) increment(blockReasonCounts, reason);
  }
  if (guard.stagedFiles.length) {
    increment(blockReasonCounts, "UNEXPECTED_FILE_STAGED", guard.stagedFiles.length);
  }

  const summary = {
    targetDateRange: `${TARGET_DATES[0]}..${TARGET_DATES.at(-1)}`,
    targetDateCount: TARGET_DATES.length,
    rangeStatus,
    bestNextDate,
    recommendedProcessingOrder,
    readyForPrivateRawMappingDryRunCount,
    readyForHistoryDailyWriteSafetyAuditCount,
    readyForSameDateBridgeDryRunCount,
    partialNeedsSourceReviewCount,
    missingRequiredSourceCount,
    alreadyExistsNeedsVerifyCount,
    blockedCount,
    writePerformed: false,
    publicAnalyticsModified: changedDuringAudit.some((file) =>
      file.startsWith("public/data/analytics/")),
    publicRacesModified: changedDuringAudit.some((file) =>
      file.startsWith("public/data/races/")),
    publicReviewsTouchedByThisStep: guard.publicReviewsTouchedByThisStep,
    privateInputModified: guard.privateInputModified,
    srcModified: guard.srcModified,
    packageModified: guard.packageModified,
    docsModified: guard.docsModified,
    existingScriptModified: guard.existingScriptModified,
    fakeCompletionPerformed: false,
    fuzzyMatchingPerformed: false,
    predictionUsedAsResultSource: false,
    generatedRegistrationNo: false,
    blockReasonCounts: Object.fromEntries(
      Object.entries(blockReasonCounts).filter(([, count]) => count > 0),
    ),
  };
  return {
    summary,
    targetDatesSummary,
    historyIndexCoverage,
    historyDailyExistingCheckByDate,
    resultSourceAvailabilityByDate,
    predictionSourceAvailabilityByDate,
    reviewSourceAvailabilityByDate,
    startersSourceAvailabilityByDate,
    entriesSnapshotAvailabilityByDate,
    sameDateJoinFeasibilityByDate,
    perDateReadiness,
    rangeAvailabilitySummary,
    protectedModificationGuard: guard,
    nextActionPlan: nextActionPlan(
      bestNextDate,
      rangeStatus === "READY_TO_PROCESS_SOME_DATES"
        || rangeStatus === "READY_TO_PROCESS_ALL_DATES",
    ),
    jsonSummary: {
      ...summary,
      perDateReadiness,
      allBlockReasonCounts: blockReasonCounts,
    },
  };
}

async function main() {
  const result = await auditHistoryAvailability();
  printSection("summary", result.summary);
  printSection("targetDatesSummary", result.targetDatesSummary);
  printSection("historyIndexCoverage", result.historyIndexCoverage);
  printSection(
    "historyDailyExistingCheckByDate",
    result.historyDailyExistingCheckByDate,
  );
  printSection(
    "resultSourceAvailabilityByDate",
    result.resultSourceAvailabilityByDate,
  );
  printSection(
    "predictionSourceAvailabilityByDate",
    result.predictionSourceAvailabilityByDate,
  );
  printSection(
    "reviewSourceAvailabilityByDate",
    result.reviewSourceAvailabilityByDate,
  );
  printSection(
    "startersSourceAvailabilityByDate",
    result.startersSourceAvailabilityByDate,
  );
  printSection(
    "entriesSnapshotAvailabilityByDate",
    result.entriesSnapshotAvailabilityByDate,
  );
  printSection(
    "sameDateJoinFeasibilityByDate",
    result.sameDateJoinFeasibilityByDate,
  );
  printSection("perDateReadiness", result.perDateReadiness);
  printSection("rangeAvailabilitySummary", result.rangeAvailabilitySummary);
  printSection("protectedModificationGuard", result.protectedModificationGuard);
  printSection("nextActionPlan", result.nextActionPlan);
  printSection("jsonSummary", result.jsonSummary);
  if (
    !["READY_TO_PROCESS_SOME_DATES", "READY_TO_PROCESS_ALL_DATES", "PARTIAL"]
      .includes(result.summary.rangeStatus)
    || result.protectedModificationGuard.guardStatus !== "pass"
  ) {
    process.exitCode = 1;
  }
}

const isMain =
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  main().catch((error) => {
    console.error("[kurari-ex history availability 2026-06-25..28] failed");
    console.error(error);
    process.exitCode = 1;
  });
}
