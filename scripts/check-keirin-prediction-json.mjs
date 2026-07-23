import { readFile } from "node:fs/promises";
import path from "node:path";

const MOJIBAKE_PATTERN = /\u8373|\u7E3A|\u8B41|\u83A0|\u95D5\uFF73|\u90B5\uFF7A|\u96B4\uFF0D\u95D4\uF8F0/u;
const CONFLICT_MARKER_PATTERN = /<<<<<<<|=======|>>>>>>>/u;

const JST_OPERATION_DATE_FORMATTER = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hour12: false,
});

function getArgValue(args, name, fallback = "") {
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(name);
  if (index >= 0 && index + 1 < args.length) return args[index + 1];
  return fallback;
}

function shiftIsoDateByDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getJstOperationalDate(base = new Date()) {
  const parts = JST_OPERATION_DATE_FORMATTER.formatToParts(base);
  const get = (type) => parts.find((part) => part.type === type)?.value ?? "00";
  const isoDate = `${get("year")}-${get("month")}-${get("day")}`;
  return Number(get("hour")) >= 6 ? isoDate : shiftIsoDateByDays(isoDate, -1);
}

function parseJsonText(raw, file) {
  const text = String(raw).replace(/^\uFEFF/u, "");
  if (CONFLICT_MARKER_PATTERN.test(text)) {
    throw new Error(`${file}: conflict marker detected`);
  }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(text)) {
    throw new Error(`${file}: invalid control character detected`);
  }
  return JSON.parse(text);
}

function recordsFromPayload(payload) {
  if (Array.isArray(payload?.records)) return payload.records;
  if (payload?.records && typeof payload.records === "object") return Object.values(payload.records);
  if (Array.isArray(payload?.recordList)) return payload.recordList;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

function recordsSourceFromPayload(payload) {
  if (Array.isArray(payload?.records)) return "records";
  if (payload?.records && typeof payload.records === "object") return "records-object";
  if (Array.isArray(payload?.recordList)) return "recordList";
  if (Array.isArray(payload?.items)) return "items";
  return "none";
}

function getRecordDate(record, fallbackDate) {
  return String(record?.date ?? fallbackDate ?? "").trim();
}

function findPredictionText(record) {
  return String(
    record?.predictionText
      ?? record?.text
      ?? record?.summary?.title
      ?? record?.raceTitle
      ?? record?.venueName
      ?? record?.venue
      ?? "",
  ).trim();
}

function collectHumanText(records) {
  return records.flatMap((record) => [
    record?.predictionText,
    record?.text,
    record?.raceTitle,
    record?.venueName,
    record?.venue,
    record?.confidence,
    record?.raceType,
    record?.summary?.title,
    record?.summary?.scenario,
    record?.summary?.memo,
  ]).map((value) => String(value ?? "").trim()).filter(Boolean);
}

async function checkFile(file, options) {
  const raw = await readFile(file, "utf8");
  const payload = parseJsonText(raw, file);
  const records = recordsFromPayload(payload);
  const recordSource = recordsSourceFromPayload(payload);
  if (!Array.isArray(records)) throw new Error(`${file}: records must be an array`);
  if (records.length === 0) throw new Error(`${file}: records must not be empty`);

  const expectedDate = options.date || getJstOperationalDate();
  const dates = records.map((record) => getRecordDate(record, payload?.date));
  const uniqueDates = [...new Set(dates)].sort();
  const invalidDates = dates.filter((date) => date !== expectedDate);
  if (invalidDates.length > 0) {
    throw new Error(`${file}: records must be JST operation date only (${expectedDate})`);
  }

  const firstPredictionText = findPredictionText(records[0]);
  const joinedText = collectHumanText(records).join("\n");
  if (MOJIBAKE_PATTERN.test(joinedText)) {
    throw new Error(`${file}: suspected mojibake marker detected`);
  }

  return {
    file,
    expectedDate,
    recordSource,
    recordCount: records.length,
    dates: uniqueDates,
    firstPredictionText,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const fileArg = getArgValue(args, "--file") || args.find((arg) => !arg.startsWith("--"));
  const file = path.resolve(fileArg ?? "");
  if (!file) throw new Error("--file is required");

  const result = await checkFile(file, {
    date: getArgValue(args, "--date"),
  });

  console.log("[keirin prediction json check]");
  console.log(`file: ${result.file}`);
  console.log(`date: ${result.expectedDate}`);
  console.log(`${result.recordSource}: ${result.recordCount}`);
  console.log(`dates: ${result.dates.join(", ")}`);
  console.log(`first predictionText: ${result.firstPredictionText || "(empty)"}`);
  if (args.includes("--print-date")) console.log(result.expectedDate);
}

main().catch((error) => {
  console.error("[keirin prediction json check] failed");
  console.error(error.message);
  process.exitCode = 1;
});
