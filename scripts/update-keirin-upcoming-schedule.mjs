import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_URL = "https://ctc.gr.jp/schedule/";
const OUTPUT_PATH = path.resolve(__dirname, "../public/data/races/upcoming-schedule.generated.json");
const JST_TIME_ZONE = "Asia/Tokyo";
const RANGE_DAYS = 60;

const jstDateFormatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: JST_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function getJstTodayIso() {
  return jstDateFormatter.format(new Date());
}

function addDaysIso(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00+09:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return jstDateFormatter.format(date);
}

function normalizeText(text) {
  return String(text ?? "")
    .replace(/\u3000/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeGrade(value) {
  const text = normalizeText(value);
  if (/GP/i.test(text)) return "GP";
  if (/G[ⅠI]$|G1|GI/i.test(text)) return "GI";
  if (/G[ⅡII]$|G2|GII/i.test(text)) return "GII";
  if (/G[ⅢIII]$|G3|GIII/i.test(text)) return "GIII";
  if (/F[ⅠI]$|F1|FI/i.test(text)) return "F1";
  return "F2";
}

function normalizeSession(attrTexts) {
  const text = attrTexts.join(" ");
  if (text.includes("ミッドナイト")) return "midnight";
  if (text.includes("ナイター")) return "night";
  return "day";
}

function sessionNoteParts(attrTexts) {
  const parts = [];
  for (const attr of attrTexts) {
    if (attr === "mid") parts.push("ミッドナイト");
    else if (attr === "night") parts.push("ナイター");
    else if (attr === "morning") parts.push("モーニング");
    else if (attr === "girl") parts.push("ガールズ");
    else if (attr === "dokanto") parts.push("Dokanto");
    else if (attr) parts.push(attr);
  }
  return Array.from(new Set(parts));
}

function createId({ venueCode, startDate, venue, grade, title }) {
  const titlePart = title
    ? title.toLowerCase().replace(/\s+/g, "-").replace(/[^\p{L}\p{N}-]/gu, "").slice(0, 32)
    : "untitled";
  return `${startDate}-${venueCode || venue}-${grade.toLowerCase()}-${titlePart}`;
}

function parseDateRange(text, startYear) {
  const match = normalizeText(text).match(/(?<sm>\d{2})\/(?<sd>\d{2}).*?[～~-].*?(?<em>\d{2})\/(?<ed>\d{2})/);
  if (!match?.groups) return null;

  const startMonth = Number(match.groups.sm);
  const startDay = Number(match.groups.sd);
  const endMonth = Number(match.groups.em);
  const endDay = Number(match.groups.ed);
  const endYear = endMonth < startMonth ? startYear + 1 : startYear;

  return {
    startDate: `${startYear}-${String(startMonth).padStart(2, "0")}-${String(startDay).padStart(2, "0")}`,
    endDate: `${endYear}-${String(endMonth).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`,
  };
}

async function fetchHtml() {
  const response = await fetch(SOURCE_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
      "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
      "Cache-Control": "no-cache",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch CTC schedule: ${response.status}`);
  }

  return response.text();
}

function parseScheduleItems(html, rangeFrom, rangeTo) {
  const $ = cheerio.load(html);
  const items = [];
  const seen = new Set();

  $("#racelist li.race").each((_, element) => {
    const race = $(element);
    const href = race.find("a").attr("href") ?? "";
    const idMatch = href.match(/id=(?<venueCode>\d{2})(?<startYear>\d{4})\d{4}/);
    const venueCode = idMatch?.groups?.venueCode ?? "";
    const startYear = Number(idMatch?.groups?.startYear);
    if (!startYear) return;

    const venue = normalizeText(race.find(".place p").first().text());
    const titleNode = race.find(".name h2").clone();
    const gradeText = normalizeText(titleNode.find("span").first().text());
    titleNode.find("span").remove();
    const title = normalizeText(titleNode.text()) || `${venue}開催`;
    const grade = normalizeGrade(gradeText);
    const dateRange = parseDateRange(race.find(".name p").first().text(), startYear);
    if (!venue || !dateRange) return;
    if (dateRange.endDate < rangeFrom || dateRange.startDate > rangeTo) return;

    const attrClasses = race.find(".attr li").map((__, attr) => normalizeText($(attr).attr("class"))).get();
    const attrLabels = race.find(".attr li").map((__, attr) => normalizeText($(attr).text())).get();
    const noteParts = sessionNoteParts([...attrClasses, ...attrLabels]);
    const session = normalizeSession(attrLabels);
    const id = createId({ venueCode, startDate: dateRange.startDate, venue, grade, title });
    if (seen.has(id)) return;
    seen.add(id);

    items.push({
      id,
      date: dateRange.startDate,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      venue,
      venueName: venue,
      title,
      grade,
      session,
      hasGirls: noteParts.includes("ガールズ"),
      source: "ctc",
      ...(noteParts.length ? { note: noteParts.join("・") } : {}),
    });
  });

  return items.sort((a, b) => {
    if (a.startDate !== b.startDate) return a.startDate.localeCompare(b.startDate);
    const gradeOrder = { GP: 0, GI: 1, GII: 2, GIII: 3, F1: 4, F2: 5 };
    const gradeDiff = (gradeOrder[a.grade] ?? 99) - (gradeOrder[b.grade] ?? 99);
    if (gradeDiff !== 0) return gradeDiff;
    return a.venue.localeCompare(b.venue, "ja");
  });
}

async function main() {
  const rangeFrom = getJstTodayIso();
  const rangeTo = addDaysIso(rangeFrom, RANGE_DAYS);
  const html = await fetchHtml();
  const items = parseScheduleItems(html, rangeFrom, rangeTo);

  if (items.length === 0) {
    throw new Error(`No upcoming race schedule items found for ${rangeFrom} to ${rangeTo}`);
  }

  const output = {
    generatedAt: new Date().toISOString(),
    timeZone: JST_TIME_ZONE,
    range: {
      from: rangeFrom,
      to: rangeTo,
      days: RANGE_DAYS,
    },
    source: SOURCE_URL,
    items,
  };

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`Wrote ${items.length} upcoming schedule items to ${OUTPUT_PATH}`);
  console.log(`Range: ${rangeFrom} to ${rangeTo}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
