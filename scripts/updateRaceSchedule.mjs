import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_URL = "https://ctc.gr.jp/schedule/";
const OUTPUT_PATH = path.resolve(__dirname, "../src/data/raceScheduleData.ts");
const DEBUG_PATH = path.resolve(__dirname, "./ctc-schedule-debug.txt");
const JST_OFFSET_MINUTES = 9 * 60;

function getJstNow() {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
  return new Date(utcMs + JST_OFFSET_MINUTES * 60 * 1000);
}

function normalizeText(text) {
  return text
    .replace(/\u3000/g, " ")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeGrade(text) {
  if (/GP/.test(text)) return "GP";
  if (/GⅠ|GI\b/.test(text)) return "GI";
  if (/GⅡ|GII\b/.test(text)) return "GII";
  if (/GⅢ|GIII\b/.test(text)) return "GIII";
  if (/FⅠ|F1\b/.test(text)) return "F1";
  if (/FⅡ|F2\b/.test(text)) return "F2";
  return "F2";
}

function normalizeSession(text) {
  if (text.includes("ミッドナイト")) return "midnight";
  if (text.includes("ナイター")) return "night";
  if (text.includes("モーニング")) return "day";
  if (text.includes("デイ")) return "day";
  return "day";
}

function toIsoDate(year, month, day) {
  return `${String(year)}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function resolveDateRange(startMmdd, endMmdd) {
  const now = getJstNow();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const [startMonth, startDay] = startMmdd.split("/").map(Number);
  const [endMonth, endDay] = endMmdd.split("/").map(Number);

  let startYear = currentYear;
  let endYear = currentYear;

  if (currentMonth === 12 && startMonth === 1) startYear = currentYear + 1;
  if (currentMonth === 12 && endMonth === 1) endYear = currentYear + 1;

  if (currentMonth === 1 && startMonth === 12) startYear = currentYear - 1;
  if (currentMonth === 1 && endMonth === 12) endYear = currentYear - 1;

  if (startMonth === 12 && endMonth === 1) {
    endYear = startYear + 1;
  }

  return {
    startDate: toIsoDate(startYear, startMonth, startDay),
    endDate: toIsoDate(endYear, endMonth, endDay),
  };
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}\-]/gu, "")
    .replace(/\-+/g, "-")
    .replace(/^\-|\-$/g, "");
}

function createId({ startDate, venue, grade, title }) {
  return `${startDate}-${slugify(venue)}-${grade.toLowerCase()}-${slugify(title).slice(0, 28)}`;
}

function buildOutput(items) {
  return `import type { RaceScheduleItem } from "../types/raceSchedule";

export const raceScheduleData: RaceScheduleItem[] = ${JSON.stringify(items, null, 2)};
`;
}

async function fetchHtml() {
  const response = await fetch(SOURCE_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
      "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
    },
  });

  if (!response.ok) {
    throw new Error(`CTCの開催ページ取得に失敗しました: ${response.status}`);
  }

  return response.text();
}

function parseBlock(blockText) {
  const lines = normalizeText(blockText)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return null;

  const firstLine = lines[0];
  const secondLine = lines[1];
  const flagsLine = lines.slice(2).join(" ");

  const venueMatch = firstLine.match(/^(.*?)(\d{1,2})#$/);
  if (!venueMatch) return null;
  const venue = normalizeText(venueMatch[1]);
  if (!venue) return null;

  const infoMatch = secondLine.match(
    /^(?<title>.+?)(?<grade>GP|GⅠ|GⅡ|GⅢ|GI|GII|GIII|FⅠ|FⅡ|F1|F2)(?<start>\d{2}\/\d{2})\([^)]+\)～(?<end>\d{2}\/\d{2})\([^)]+\)$/
  );
  if (!infoMatch?.groups) return null;

  const title = normalizeText(infoMatch.groups.title);
  const grade = normalizeGrade(infoMatch.groups.grade);
  const { startDate, endDate } = resolveDateRange(infoMatch.groups.start, infoMatch.groups.end);

  const flags = normalizeText(flagsLine);
  const hasGirls = flags.includes("ガールズ");
  const session = normalizeSession(flags);

  const noteParts = [];
  if (flags.includes("モーニング")) noteParts.push("モーニング");
  if (flags.includes("デイ")) noteParts.push("デイ");
  if (flags.includes("ナイター")) noteParts.push("ナイター");
  if (flags.includes("ミッドナイト")) noteParts.push("ミッドナイト");
  if (hasGirls) noteParts.push("ガールズ");
  if (flags.includes("Dokanto")) noteParts.push("Dokanto");

  return {
    id: createId({ startDate, venue, grade, title }),
    venue,
    title,
    grade,
    startDate,
    endDate,
    session,
    hasGirls,
    source: "ctc",
    ...(noteParts.length ? { note: noteParts.join("・") } : {}),
  };
}

function extractScheduleBlocks(bodyText) {
  const normalized = normalizeText(bodyText);
  const blocks = normalized
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .filter((block) => /\d{1,2}#$/.test(block.split("\n")[0] || ""))
    .filter((block) => /\d{2}\/\d{2}\([^)]+\)～\d{2}\/\d{2}\([^)]+\)/.test(block));

  return blocks;
}

async function main() {
  const html = await fetchHtml();
  const $ = cheerio.load(html);

  const bodyText = $("body").text();
  const blocks = extractScheduleBlocks(bodyText);

  await fs.writeFile(DEBUG_PATH, blocks.slice(0, 120).join("\n\n"), "utf8");

  const seen = new Set();
  const items = [];

  for (const block of blocks) {
    const parsed = parseBlock(block);
    if (!parsed) continue;
    if (seen.has(parsed.id)) continue;
    seen.add(parsed.id);
    items.push(parsed);
  }

  items.sort((a, b) => {
    if (a.startDate !== b.startDate) return a.startDate.localeCompare(b.startDate);
    const gradeOrder = { GP: 0, GI: 1, GII: 2, GIII: 3, F1: 4, F2: 5 };
    const diff = (gradeOrder[a.grade] ?? 99) - (gradeOrder[b.grade] ?? 99);
    if (diff !== 0) return diff;
    return a.venue.localeCompare(b.venue, "ja");
  });

  if (items.length === 0) {
    throw new Error("CTCから開催データを抽出できませんでした。scripts/ctc-schedule-debug.txt を確認してください。");
  }

  await fs.writeFile(OUTPUT_PATH, buildOutput(items), "utf8");
  console.log(`raceScheduleData.ts を更新しました: ${items.length}件`);
  console.log(`debug出力: ${DEBUG_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
