import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import {
  classifyInputFile,
  extractLabeledValue,
  normalizeVenueName,
  parseDate,
  parseResultBlock,
  splitRaceBlocks,
} from "./kurari-ex-history-common.mjs";

const rawRoot = process.argv.find((arg) => arg.startsWith("--raw-root="))?.slice(11);
const showDetails = process.argv.includes("--details");
if (!rawRoot) {
  console.error("Usage: node scripts/check-kurari-ex-review-result-evidence.mjs --raw-root=<path> [--details]");
  process.exit(2);
}

const resultFeed = JSON.parse(await readFile(
  new URL("../public/data/races/keirin-jp-results.generated.json", import.meta.url), "utf8",
));
const officialRaces = new Map();
if (resultFeed.source?.provider === "KEIRIN.JP" && Number.isFinite(Date.parse(resultFeed.generatedAt))) {
  for (const venue of resultFeed.venues ?? []) {
    for (const race of venue.races ?? []) {
      const key = `${venue.date}:${normalizeVenueName(venue.venueName)}:${race.raceNumber}`;
      if (officialRaces.has(key)) throw new Error(`duplicate official race: ${key}`);
      officialRaces.set(key, race);
    }
  }
}

const rows = [];
for (let day = 4; day <= 12; day += 1) {
  const date = `2026-10-${String(day).padStart(2, "0")}`;
  const directory = path.join(rawRoot, date);
  const files = (await readdir(directory)).filter((file) => /-results?\d*\.txt$/iu.test(file)).sort();
  for (const file of files) {
    const filename = path.join(directory, file);
    const source = classifyInputFile(filename, rawRoot);
    if (!source.classified || source.type !== "result" || !source.venueName || source.date !== date) {
      throw new Error(`unclassified result file: ${filename}`);
    }
    const content = await readFile(filename, "utf8");
    for (const block of splitRaceBlocks(content, "result")) {
      const bodyDate = parseDate(extractLabeledValue(block.text, ["日付"]));
      const bodyVenue = extractLabeledValue(block.text, ["会場"]);
      const bodyRace = extractLabeledValue(block.text, ["R"]);
      const identityMatches = bodyDate === date
        && normalizeVenueName(bodyVenue) === normalizeVenueName(source.venueName)
        && (bodyRace === String(block.raceNumber) || bodyRace === `${block.raceNumber}R`);
      const result = parseResultBlock(block.text);
      const status = extractLabeledValue(block.text, ["結果確定ステータス", "結果確定"]);
      const sourceName = extractLabeledValue(block.text, ["source名"]);
      const sourceType = extractLabeledValue(block.text, ["source種別"]);
      const sourceFetchedAt = extractLabeledValue(block.text, ["source取得日時"]);
      const officialSource = extractLabeledValue(block.text, ["official source"]);
      const placementAvailable = Boolean(result.first.carNo && result.second.carNo && result.third.carNo);
      const payoutAvailable = result.trifecta.payoutYen != null && Boolean(result.trifecta.combination);
      const contentReady = identityMatches && /^(?:confirmed|確定|結果確定)$/iu.test(status ?? "")
        && placementAvailable && payoutAvailable
        && result.trifecta.combination === [result.first.carNo, result.second.carNo, result.third.carNo].join("-");
      const official = officialRaces.get(`${date}:${normalizeVenueName(source.venueName)}:${block.raceNumber}`);
      const officialOrder = official?.finishOrder?.slice(0, 3).map((rider) => Number(rider.carNo)).join("-");
      const officialPayout = official?.payouts?.trifecta?.find(
        (entry) => entry.combination === result.trifecta.combination,
      );
      const officialExact = identityMatches && official?.resultStatus === "confirmed"
        && official?.operationStatus === "finished"
        && officialOrder === [result.first.carNo, result.second.carNo, result.third.carNo].join("-")
        && officialPayout?.payoutYen === result.trifecta.payoutYen;
      const txtProvenance = Boolean(officialSource && !/^(?:未取得|unknown|--)$/iu.test(officialSource)
        && /^(?:official|official-derived)$/iu.test(sourceType ?? "")
        && sourceFetchedAt && Number.isFinite(Date.parse(sourceFetchedAt)));
      const officialEvidenceStatus = officialExact ? "official-feed-exact"
        : txtProvenance ? "txt-official-claim-unverified" : "missing";
      const exclusionReason = !identityMatches ? "filename-body-identity-mismatch"
        : officialExact ? "sidecar-not-connected-to-normalizer"
          : !/^(?:confirmed|確定|結果確定)$/iu.test(status ?? "") ? "result-not-final-or-status-unclear"
            : !placementAvailable || !payoutAvailable ? "incomplete-placement-or-payout"
              : !txtProvenance ? "official-source-missing"
                : "txt-provenance-not-independently-verified";
      rows.push({
        filename: source.relativePath,
        date,
        venue: source.venueName,
        raceNo: block.raceNumber,
        raceKey: identityMatches ? `${date}:${source.venueKey}:${block.raceNumber}` : null,
        bodyDate,
        bodyVenue,
        bodyRace,
        sourceName,
        sourceType,
        sourceFetchedAt,
        resultStatus: status,
        parsedStatus: result.status,
        placementAvailable,
        payoutAvailable,
        contentReady,
        officialEvidenceStatus,
        historicalEligibility: officialExact && identityMatches && placementAvailable && payoutAvailable
          ? "source-backed-candidate-not-ingested" : "blocked",
        exclusionReason,
      });
    }
  }
}

const counts = (key) => Object.fromEntries([...new Set(rows.map((row) => row[key]))].sort()
  .map((value) => [String(value), rows.filter((row) => row[key] === value).length]));
console.log(JSON.stringify({
  resultFiles: new Set(rows.map((row) => row.filename)).size,
  raceBlocks: rows.length,
  byDate: counts("date"),
  parsedStatus: counts("parsedStatus"),
  contentReady: counts("contentReady"),
  resultStatus: counts("resultStatus"),
  officialEvidenceStatus: counts("officialEvidenceStatus"),
  confirmedWithoutOfficialEvidence: rows.filter((row) => row.resultStatus === "confirmed"
    && row.officialEvidenceStatus === "missing").length,
  officialSidecarVerified: rows.filter((row) => row.officialEvidenceStatus === "official-feed-exact").length,
  normalizerFinished: rows.filter((row) => row.parsedStatus === "finished").length,
  historicalEligibility: counts("historicalEligibility"),
  exclusionReason: counts("exclusionReason"),
  identityMismatchRows: rows.filter((row) => row.exclusionReason === "filename-body-identity-mismatch"),
  kumamotoNumericRaceRows: rows.filter((row) => row.date === "2026-10-12"
    && row.venue === "熊本" && [7, 8, 9].includes(row.raceNo)),
}, null, 2));
if (showDetails) for (const row of rows) console.log(JSON.stringify(row));
