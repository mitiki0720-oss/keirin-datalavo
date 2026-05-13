
import fs from "node:fs/promises";
import path from "node:path";

const KDREAMS_RACECARD_URL = "https://keirin.kdreams.jp/racecard/";
const NETKEIRIN_ENTRY_URL = "https://keirin.netkeiba.com/race/entry/";
const NETKEIRIN_RACE_API_URL = "https://keirin.netkeiba.com/api/race/";
const NETKEIRIN_RESULT_URL = "https://keirin.netkeiba.com/race/result/";
const OUTPUT_PATH = path.resolve("public/data/races/today.generated.json");
const OVERRIDE_PATH = path.resolve("scripts/today-races-overrides.json");
const RACE_SCHEDULE_DATA_PATH = path.resolve("src/data/raceScheduleData.ts");

const DEBUG_DIR = path.resolve("scripts");
const DEBUG_ODDS_DIR = path.join(DEBUG_DIR, "debug");
const KDREAMS_DEBUG_HTML_PATH = path.join(DEBUG_DIR, "kdreams-racecard-debug.html");
const DEBUG_JSON_PATH = path.join(DEBUG_DIR, "aggregate-parse-debug.json");
const NETKEIRIN_SAMPLE_HTML_PATH = path.join(DEBUG_DIR, "netkeirin-race-detail-sample.html");
const NETKEIRIN_SAMPLE_TEXT_PATH = path.join(DEBUG_DIR, "netkeirin-race-detail-sample.txt");
const NETKEIRIN_RESULT_DEBUG_PREFIX = "result-page";
const NETKEIRIN_TRIFECTA_CANDIDATE_KEYS = ["list_9", "trifecta", "trifecta_list", "odds_3t"];
const GRADE_CHECK_TARGET_VENUES = ["別府", "名古屋", "熊本", "松戸", "奈良", "函館"];
const seenUnknownGradeWarnings = new Set();

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getJstTodayIso() {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(new Date());
}

function compactDate(dateIso) {
  return dateIso.replaceAll("-", "");
}

function decodeHtml(value) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(value) {
  return decodeHtml(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanCellText(value) {
  return stripTags(value).replace(/\s+/g, " ").trim();
}

function cleanNetkeirinRiderName(value) {
  return cleanCellText(value)
    .replace(/お気に入り選手\s*-->/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeNetkeirinBetType(value) {
  return decodeHtml(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .trim();
}

function normalizeNetkeirinPayoutCombination(value) {
  return decodeHtml(value ?? "")
    .normalize("NFKC")
    .replace(/[＞→ー−–]/g, ">")
    .replace(/\s+/g, "")
    .trim();
}

function inferSessionFromTypeHtml(typeHtml) {
  if (/icon_status s3|ミッドナイト/i.test(typeHtml)) return "midnight";
  if (/icon_status s2|ナイター/i.test(typeHtml)) return "night";
  return "day";
}

function inferGirlsFromTypeHtml(typeHtml) {
  return /icon_girls|ガールズ/i.test(typeHtml);
}

function extractGradeClassName(gradeHtml) {
  const classNames = Array.from(String(gradeHtml ?? "").matchAll(/class="([^"]+)"/gi))
    .flatMap((match) => match[1].split(/\s+/))
    .map((value) => value.trim())
    .filter(Boolean);
  return classNames.find((value) => /^gr\d+$/i.test(value) || /^icon_grade$/i.test(value)) ?? classNames.join(" ");
}

function compactGradeHtmlSnippet(gradeHtml) {
  return String(gradeHtml ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

// Kドリームス racecard grade class mapping
// gr1 -> F2
// gr2 -> F1
// gr3 -> G3
// gr4 -> G2
// gr5 -> G1
// gr6 -> GP
function inferGradeFromGradeHtml(gradeHtml, context = {}) {
  const normalized = String(gradeHtml ?? "").normalize("NFKC");

  if (/icon_grade\s+gr6|\bgr6\b|\bgp\b/i.test(normalized)) return "GP";
  if (/icon_grade\s+gr5|\bgr5\b/i.test(normalized)) return "G1";
  if (/icon_grade\s+gr4|\bgr4\b/i.test(normalized)) return "G2";
  if (/icon_grade\s+gr3|\bgr3\b/i.test(normalized)) return "G3";
  if (/icon_grade\s+gr2|\bgr2\b/i.test(normalized)) return "F1";
  if (/icon_grade\s+gr1|\bgr1\b/i.test(normalized)) return "F2";

  const className = extractGradeClassName(gradeHtml) || "class-not-found";
  const snippet = compactGradeHtmlSnippet(gradeHtml) || "snippet-empty";
  const warningKey = JSON.stringify([context.venue ?? "", context.venueCode ?? "", className, snippet]);
  if (!seenUnknownGradeWarnings.has(warningKey)) {
    seenUnknownGradeWarnings.add(warningKey);
    console.warn("[grade] unknown KDreams grade class", {
      venue: context.venue ?? "",
      venueCode: context.venueCode ?? "",
      venueId: context.venueId ?? "",
      gradeClass: className,
      htmlSnippet: snippet,
      result: "",
    });
  }

  return "";
}

async function readOverrides() {
  try {
    const raw = await fs.readFile(OVERRIDE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function readRaceScheduleData() {
  try {
    const raw = await fs.readFile(RACE_SCHEDULE_DATA_PATH, "utf-8");
    const match = raw.match(/export const raceScheduleData:\s*RaceScheduleItem\[\]\s*=\s*(\[[\s\S]*\]);\s*$/);
    if (!match?.[1]) return [];
    return JSON.parse(match[1]);
  } catch (error) {
    console.warn("[schedule] failed to read raceScheduleData.ts", error);
    return [];
  }
}

function normalizeScheduleVenueName(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/競輪$/g, "")
    .trim();
}

function resolveVenueScheduleRange(scheduleData, venueName, todayIso) {
  const normalizedVenue = normalizeScheduleVenueName(venueName);

  const candidates = scheduleData
    .filter((item) => normalizeScheduleVenueName(item.venue) === normalizedVenue)
    .filter((item) => item.startDate <= todayIso && item.endDate >= todayIso)
    .sort((a, b) => {
      const aLength = (new Date(`${a.endDate}T00:00:00+09:00`).getTime() - new Date(`${a.startDate}T00:00:00+09:00`).getTime());
      const bLength = (new Date(`${b.endDate}T00:00:00+09:00`).getTime() - new Date(`${b.startDate}T00:00:00+09:00`).getTime());
      return bLength - aLength || b.startDate.localeCompare(a.startDate);
    });

  const matched = candidates[0] ?? null;

  return {
    startDate: matched?.startDate ?? todayIso,
    endDate: matched?.endDate ?? todayIso,
  };
}

function parseKdreamsTodayVenues(html, todayIso, scheduleData) {
  const tableMatch = html.match(/<div class="raceinfo_table">[\s\S]*?<table>([\s\S]*?)<\/table>/i);
  if (!tableMatch) {
    return { venues: [], debug: { tableFound: false } };
  }

  const tableHtml = tableMatch[1];
  const rowMatches = Array.from(tableHtml.matchAll(/<tr>([\s\S]*?)<\/tr>/gi));
  const venues = [];
  const parseRows = [];

  for (const row of rowMatches) {
    const rowHtml = row[1];
    if (!/racedetail/i.test(rowHtml)) continue;

    const cells = Array.from(rowHtml.matchAll(/<td>([\s\S]*?)<\/td>/gi)).map((m) => m[1]);
    if (cells.length < 4) continue;

    const venueCell = cells[0];
    const gradeCell = cells[1];
    const typeCell = cells[2];
    const linksCell = cells[3];

    const venueText = stripTags(venueCell).replace(/競輪$/, "").trim();
    const venueCodeFromLinks = linksCell.match(/\/racecard\/(\d{2})\d+\//i)?.[1] ?? "";
    const venueId = `live-${compactDate(todayIso)}${venueCodeFromLinks || venueText}`;
    const grade = inferGradeFromGradeHtml(gradeCell, {
      venue: venueText,
      venueCode: venueCodeFromLinks,
      venueId,
    });
    const session = inferSessionFromTypeHtml(typeCell);
    const hasGirls = inferGirlsFromTypeHtml(typeCell);

    const detailLinks = Array.from(
      linksCell.matchAll(/href="https:\/\/keirin\.kdreams\.jp\/([^/]+)\/racedetail\/(\d+)\/"[^>]*>(\d{1,2})R<\/a>/gi)
    ).map((m) => ({
      slug: m[1],
      raceId: m[2],
      raceNo: Number(m[3]),
    }));

    const listLink = linksCell.match(/href="https:\/\/keirin\.kdreams\.jp\/([^/]+)\/racecard\/(\d+)\/"[^>]*>一覧<\/a>/i);
    const slug = listLink?.[1] ?? detailLinks[0]?.slug ?? "";
    const cardId = listLink?.[2] ?? "";
    const venueCode = detailLinks[0]?.raceId?.slice(0, 2) ?? cardId.slice(0, 2) ?? venueCodeFromLinks;
    const { startDate: resolvedStartDate, endDate: resolvedEndDate } =
      resolveVenueScheduleRange(scheduleData, venueText, todayIso);

    parseRows.push({
      venue: venueText,
      slug,
      venueCode,
      grade,
      session,
      hasGirls,
      raceCount: detailLinks.length,
      raceNos: detailLinks.map((item) => item.raceNo),
    });

    venues.push({
      id: venueId,
      venue: venueText,
      venueCode,
      slug,
      title: `${venueText} 出走表一覧`,
      grade,
      startDate: resolvedStartDate,
      endDate: resolvedEndDate,
      session,
      hasGirls,
      note: "Kドリームス出走表一覧から自動生成",
      raceNos: detailLinks.map((item) => item.raceNo),
      raceIds: detailLinks.map((item) => item.raceId),
      races: [],
    });
  }

  return { venues, debug: { tableFound: true, parseRows } };
}

function matchOne(value, patterns) {
  for (const pattern of patterns) {
    const m = value.match(pattern);
    if (m?.[1]) return m[1].trim();
  }
  return "";
}

function extractNetkeirinRaceTime(html) {
  return matchOne(html, [
    /<div class="Race_Data">[\s\S]*?発走\s*([0-9]{1,2}:[0-9]{2})/i,
    /発走\s*([0-9]{1,2}:[0-9]{2})/i,
  ]);
}

function extractNetkeirinRaceTitle(html) {
  const raceName = matchOne(html, [
    /<div class="Race_Name">([\s\S]*?)<span class="jsSwitchArrow/i,
    /<div class="Race_Name">([\s\S]*?)<\/div>/i,
  ]);
  if (raceName) return stripTags(raceName).replace(/\s+/g, " ").trim();

  const title = stripTags(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  return title.match(/\d{1,2}R\s*([^\|]+?)\s*出走表/)?.[1]?.trim() ?? "";
}

const LINEUP_RAW_SEPARATOR_PATTERN = /[\s・/／|｜\-－ー―]+/;
const LINEUP_RAW_NAME_PATTERN = /[A-Za-z\u3040-\u30ff\u3400-\u9fff]/;

function normalizeLineupRawText(value) {
  return (value ?? "")
    .normalize("NFKC")
    .replace(/\u3000/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitLineupRawGroups(value) {
  return normalizeLineupRawText(value)
    .split(LINEUP_RAW_SEPARATOR_PATTERN)
    .map((segment) => segment.replace(/[^1-9]/g, ""))
    .filter(Boolean);
}

function extractLineupRawCars(value) {
  return [...normalizeLineupRawText(value).matchAll(/[1-9]/g)].map((match) => match[0]);
}

function validateLineupRaw(rawText, options = {}) {
  const normalizedRawText = normalizeLineupRawText(rawText);
  const groups = splitLineupRawGroups(normalizedRawText);
  const cars = extractLineupRawCars(normalizedRawText);
  const isGirls = Boolean(options.isGirls);
  const riderCount = Number.isFinite(options.riderCount) ? Number(options.riderCount) : 0;

  if (!normalizedRawText) {
    return { valid: false, normalizedRawText: "", groups: [], normalizedLineup: "", reason: "not lineup format" };
  }

  if (LINEUP_RAW_NAME_PATTERN.test(normalizedRawText)) {
    return { valid: false, normalizedRawText, groups: [], normalizedLineup: "", reason: "name heavy" };
  }

  if (isGirls) {
    if (cars.length >= 2 && (!riderCount || cars.length === riderCount) && new Set(cars).size === cars.length) {
      return { valid: true, normalizedRawText, groups: cars, normalizedLineup: cars.join("-") };
    }
    return { valid: false, normalizedRawText, groups: [], normalizedLineup: "", reason: "not lineup format" };
  }

  if (groups.length < 2) {
    return {
      valid: false,
      normalizedRawText,
      groups,
      normalizedLineup: "",
      reason: LINEUP_RAW_SEPARATOR_PATTERN.test(normalizedRawText) ? "not lineup format" : "no separator",
    };
  }

  if (groups.every((group) => group.length === 1)) {
    return { valid: false, normalizedRawText, groups, normalizedLineup: "", reason: "extracted only flat order" };
  }

  return { valid: true, normalizedRawText, groups, normalizedLineup: groups.join("-") };
}

function logInvalidLineupSource(options) {
  console.warn("source exists but invalid", {
    venue: options.venue,
    raceNo: options.raceNo,
    source: options.source,
    rawText: options.rawText,
    reason: options.reason,
  });
}

function extractNetkeirinLineupRaw(html) {
  const sectionHtml = html.match(/<section class="Contents_Box DeployYoso">[\s\S]*?<\/section>/i)?.[0] ?? "";
  if (!sectionHtml) return "";

  const blocks = Array.from(sectionHtml.matchAll(/<div class="DeployInBox">([\s\S]*?)<\/div><!-- \/\.DeployInBox -->/gi)).map((match) => match[1]);
  if (!blocks.length) return "";

  const groups = [];
  let currentGroup = "";

  for (const blockHtml of blocks) {
    if (/WakuSeparat/.test(blockHtml) && !/Shaban_Num/.test(blockHtml)) {
      if (currentGroup) {
        groups.push(currentGroup);
        currentGroup = "";
      }
      continue;
    }

    const carNo = blockHtml.match(/<span class="Waku[1-9]\s+Shaban_Num">([1-9])<\/span>/i)?.[1] ?? "";
    if (!carNo) continue;
    currentGroup += carNo;
  }

  if (currentGroup) groups.push(currentGroup);
  return groups.join(" ");
}

function parseNetkeirinOddsPreviewCombo(numHtml) {
  const normalizedHtml = numHtml.replace(/\s+/g, " ");
  const otherMatch = normalizedHtml.match(/<div class="Shaban_Other">([\s\S]*?)<\/div>/i);
  const baseHtml = otherMatch ? normalizedHtml.slice(0, otherMatch.index) : normalizedHtml;
  const baseCars = Array.from(baseHtml.matchAll(/<span class="Wakuban Waku[1-9]">([1-9])<\/span>/gi)).map((match) => match[1]);
  const otherCars = otherMatch
    ? Array.from(otherMatch[1].matchAll(/<span class="Wakuban Waku[1-9]">([1-9])<\/span>/gi)).map((match) => match[1])
    : [];

  if (!baseCars.length) return "";
  if (otherCars.length) return `${baseCars.join(">")}>${otherCars.join("")}`;
  if (/Kaime_Arrow/.test(baseHtml)) return baseCars.join(">");
  if (/Hyphen/.test(baseHtml)) return baseCars.join("-");
  return baseCars.join("-");
}

function extractNetkeirinOddsPreview(html) {
  const sectionHtml = html.match(/<div class="OddsWrap">([\s\S]*?)<\/div>\s*<a href="javascript:void\(0\);"/i)?.[1] ?? "";
  if (!sectionHtml) return [];

  const items = [];
  const blocks = Array.from(sectionHtml.matchAll(/<dl(?: class="[^"]*")?>([\s\S]*?)<\/dl>/gi)).map((match) => match[1]);

  for (const blockHtml of blocks) {
    const tag = stripTags(blockHtml.match(/<dt>([\s\S]*?)<\/dt>/i)?.[1] ?? "").replace(/\s+/g, " ").trim();
    const ddBlocks = Array.from(blockHtml.matchAll(/<dd\b[^>]*>([\s\S]*?)<\/dd>/gi)).map((match) => match[1]);

    for (const ddHtml of ddBlocks) {
      const odds = stripTags(ddHtml.match(/<span class="OddsData01">([\s\S]*?)<\/span>/i)?.[1] ?? "").replace(/\s+/g, " ").trim();
      const oddsMarker = ddHtml.indexOf('<span class="OddsData01">');
      const comboHtml = oddsMarker >= 0 ? ddHtml.slice(0, oddsMarker) : ddHtml;
      const combo = parseNetkeirinOddsPreviewCombo(comboHtml);
      if (!combo || !odds) continue;
      items.push({ combo, odds, tag });
    }
  }

  return items;
}

async function fetchNetkeirinRaceApi(className, params) {
  const body = new URLSearchParams({
    class: className,
    method: "get",
    compress: "0",
  });

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      body.set(key, String(value));
    }
  });

  const response = await fetch(NETKEIRIN_RACE_API_URL, {
    method: "POST",
    headers: {
      "user-agent": "Mozilla/5.0",
      "accept-language": "ja-JP,ja;q=0.9,en;q=0.8",
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`${className} fetch failed: ${response.status}`);
  }

  const payload = await response.json();
  const data = payload?.data;
  if (!data || typeof data !== "object") {
    throw new Error(`${className} payload missing data`);
  }

  const dataKey = Object.keys(data).find((key) => !key.endsWith("_last_dt"));
  if (!dataKey) {
    throw new Error(`${className} payload missing body key`);
  }

  return {
    className,
    params: { ...params },
    payload,
    data,
    dataKey,
    body: data[dataKey],
  };
}

function normalizeNetkeirinOddsCombination(rawCombination) {
  if (rawCombination === undefined || rawCombination === null) return "";

  const normalized = String(rawCombination).trim();
  if (!normalized) return "";

  const pairParts = normalized.match(/^\d{6,}$/) && normalized.length % 2 === 0 ? normalized.match(/\d{2}/g) : null;
  if (pairParts && pairParts.length >= 3) {
    return pairParts.slice(0, 3).map((part) => String(Number(part))).join("-");
  }

  const numberParts = normalized.match(/\d+/g);
  if (!numberParts || numberParts.length < 3) return "";
  return numberParts.slice(0, 3).map((part) => String(Number(part))).join("-");
}

function getNetkeirinNumberValue(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;

  const normalized = value.replace(/,/g, "").trim();
  if (!normalized) return null;
  const match = normalized.match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function getNetkeirinObjectValue(source, keys) {
  if (!source || typeof source !== "object") return undefined;
  for (const key of keys) {
    if (key in source && source[key] !== undefined && source[key] !== null && source[key] !== "") {
      return source[key];
    }
  }
  return undefined;
}

function unwrapNetkeirinRowsCandidate(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value.value)) return value.value;
  if (Array.isArray(value.rows)) return value.rows;
  if (Array.isArray(value.list)) return value.list;
  if (Array.isArray(value.data)) return value.data;
  return null;
}

function findNetkeirinTrifectaCandidateRows(oddsData) {
  const root = oddsData?.body ?? oddsData;
  if (!root || typeof root !== "object") {
    return { usedKey: null, rows: [] };
  }

  const visited = new Set();
  const queue = [{ value: root, path: "body" }];

  while (queue.length) {
    const current = queue.shift();
    if (!current || !current.value || typeof current.value !== "object") continue;
    if (visited.has(current.value)) continue;
    visited.add(current.value);

    for (const key of NETKEIRIN_TRIFECTA_CANDIDATE_KEYS) {
      const candidateRows = unwrapNetkeirinRowsCandidate(current.value[key]);
      if (candidateRows) {
        return { usedKey: `${current.path}.${key}`, rows: candidateRows };
      }
    }

    for (const [key, child] of Object.entries(current.value)) {
      if (child && typeof child === "object") {
        queue.push({ value: child, path: `${current.path}.${key}` });
      }
    }
  }

  return { usedKey: null, rows: [] };
}

function normalizeNetkeirinTrifectaRow(row) {
  const baseRow = Array.isArray(row?.value) || (row?.value && typeof row.value === "object") ? row.value : row;

  if (Array.isArray(baseRow)) {
    const combination = normalizeNetkeirinOddsCombination(baseRow[0]);
    const odds = getNetkeirinNumberValue(baseRow[1]);
    const popularity = getNetkeirinNumberValue(baseRow[3]);
    if (!combination || !Number.isFinite(odds) || odds <= 0) return null;
    return {
      combination,
      odds,
      popularity: Number.isFinite(popularity) && popularity > 0 ? popularity : undefined,
      source: "netkeirin:AplRaceOdds",
    };
  }

  if (!baseRow || typeof baseRow !== "object") return null;

  const combination = normalizeNetkeirinOddsCombination(
    getNetkeirinObjectValue(baseRow, ["combination", "combo", "kumiawase", "kaime", "buy", "pattern"]),
  );
  const odds = getNetkeirinNumberValue(
    getNetkeirinObjectValue(baseRow, ["odds", "odds_value", "rate", "price", "magnification"]),
  );
  const popularity = getNetkeirinNumberValue(
    getNetkeirinObjectValue(baseRow, ["popularity", "rank", "ninki", "popular", "favorite"]),
  );

  if (!combination || !Number.isFinite(odds) || odds <= 0) return null;

  return {
    combination,
    odds,
    popularity: Number.isFinite(popularity) && popularity > 0 ? popularity : undefined,
    source: "netkeirin:AplRaceOdds",
  };
}

function extractNetkeirinTrifectaOdds(oddsData) {
  const candidate = findNetkeirinTrifectaCandidateRows(oddsData);
  const items = candidate.rows
    .map((row) => normalizeNetkeirinTrifectaRow(row))
    .filter(Boolean)
    .sort((a, b) => {
      if ((a.popularity ?? Number.MAX_SAFE_INTEGER) !== (b.popularity ?? Number.MAX_SAFE_INTEGER)) {
        return (a.popularity ?? Number.MAX_SAFE_INTEGER) - (b.popularity ?? Number.MAX_SAFE_INTEGER);
      }
      return a.odds - b.odds;
    });

  return {
    items,
    usedKey: candidate.usedKey,
    rawRows: candidate.rows.length,
    normalizedRows: items.length,
  };
}

async function writeNetkeirinOddsDebugJson(fileName, data) {
  await fs.mkdir(DEBUG_ODDS_DIR, { recursive: true });
  await fs.writeFile(path.join(DEBUG_ODDS_DIR, fileName), `${JSON.stringify(data, null, 2)}\n`, "utf-8");
}

async function writeNetkeirinResultDebugFiles(raceId, suffix, html, payload) {
  await fs.mkdir(DEBUG_ODDS_DIR, { recursive: true });
  await fs.writeFile(path.join(DEBUG_ODDS_DIR, `${NETKEIRIN_RESULT_DEBUG_PREFIX}-${raceId}-${suffix}.html`), html, "utf-8");
  await fs.writeFile(path.join(DEBUG_ODDS_DIR, `${NETKEIRIN_RESULT_DEBUG_PREFIX}-${raceId}-${suffix}.txt`), `${stripTags(html)}\n`, "utf-8");
  await fs.writeFile(path.join(DEBUG_ODDS_DIR, `${NETKEIRIN_RESULT_DEBUG_PREFIX}-${raceId}-${suffix}.json`), `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

function normalizeNetkeirinResultSbText(value) {
  return decodeHtml(String(value ?? ""))
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[Ｓ]/g, "S")
    .replace(/[Ｈ]/g, "H")
    .replace(/[Ｂ]/g, "B")
    .toUpperCase()
    .trim();
}

function parseNetkeirinResultShbMarks(value) {
  const text = normalizeNetkeirinResultSbText(value);

  return {
    sMark: text.includes("S"),
    hMark: text.includes("H"),
    bMark: text.includes("B"),
  };
}

function getNetkeirinLeaderCarNoFromRows(rows, key) {
  const row = rows.find((item) => item?.[key]);
  return row?.carNo ? String(row.carNo) : "";
}

function extractNetkeirinResultTop3(html) {
  const tableHtml = html.match(/<table summary="全着順" class="RaceCard_Table RaceCard_Simple_Table ResultRefund" id="All_Result_Table">([\s\S]*?)<\/table>/i)?.[1] ?? "";
  if (!tableHtml) return [];

  const rows = Array.from(tableHtml.matchAll(/<tr class="PlayerList">([\s\S]*?)<\/tr>/gi)).map((match) => match[1]);

  return rows.map((rowHtml) => {
    const cells = Array.from(rowHtml.matchAll(/<td class="[^"]*RaceCardCell01[^"]*">([\s\S]*?)<\/td>/gi)).map((match) =>
      stripTags(match[1]).replace(/\s+/g, " ").trim()
    );

    const name = cleanNetkeirinRiderName(rowHtml.match(/<dt class="PlayerName">([\s\S]*?)<\/dt>/i)?.[1] ?? "");

    const sbText = cells[6] ?? "";
    const shbMarks = parseNetkeirinResultShbMarks(sbText);

    return {
      place: cells[0] ?? "",
      carNo: cells[2] ?? "",
      name,
      margin: cells[3] ?? "",
      agari: cells[4] ?? "",
      kimarite: cells[5] ?? "",
      sMark: shbMarks.sMark,
      hMark: shbMarks.hMark,
      bMark: shbMarks.bMark,
    };
  }).filter((item) => item.place && item.carNo && item.name);
}

function extractNetkeirinPayouts(html) {
  const sectionHtml = html.match(/<div class="Result_Pay_Back"[\s\S]*?<table[^>]*class="[^"]*Payout_Detail_Table[^"]*"[^>]*>([\s\S]*?)<\/table>/i)?.[1]
    ?? html.match(/<table[^>]*summary="払戻し"[^>]*class="[^"]*Payout_Detail_Table[^"]*"[^>]*>([\s\S]*?)<\/table>/i)?.[1]
    ?? "";
  if (!sectionHtml) {
    return { payouts: [], debug: { tableFound: false, rowCount: 0 } };
  }

  const rows = Array.from(sectionHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)).map((match) => match[1]);
  const payouts = [];
  let currentBetType = "";

  for (const rowHtml of rows) {
    const betType = normalizeNetkeirinBetType(rowHtml.match(/<th[^>]*>([\s\S]*?)<\/th>/i)?.[1] ?? "");
    if (betType) currentBetType = betType;

    const combination = normalizeNetkeirinPayoutCombination(rowHtml.match(/<td[^>]*class="[^"]*Result[^"]*"[^>]*>([\s\S]*?)<\/td>/i)?.[1] ?? "");
    const payout = stripTags(rowHtml.match(/<td[^>]*class="[^"]*Payout[^"]*"[^>]*>([\s\S]*?)<\/td>/i)?.[1] ?? "").replace(/\s+/g, " ").trim();
    const popularity = stripTags(rowHtml.match(/<td[^>]*class="[^"]*Ninki[^"]*"[^>]*>([\s\S]*?)<\/td>/i)?.[1] ?? "").replace(/\s+/g, " ").trim();

    if (!currentBetType || !combination || !payout) continue;
    payouts.push({ betType: currentBetType, combination, payout, popularity });
  }

  return {
    payouts,
    debug: {
      tableFound: true,
      rowCount: rows.length,
    },
  };
}

function extractNetkeirinResultFinalizedAt(html) {
  const text = stripTags(html).replace(/\s+/g, " ").trim();
  const match = text.match(/(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日\s*(\d{1,2}):(\d{2})/);
  if (!match) return "";
  const [, year, month, day, hour, minute] = match;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")} ${String(hour).padStart(2, "0")}:${minute}:00`;
}

function pickNetkeirinPayoutItem(payouts, betTypes, multiple = false) {
  const normalizedBetTypes = betTypes.map((item) => normalizeNetkeirinBetType(item));
  const matched = payouts.filter((item) => normalizedBetTypes.includes(normalizeNetkeirinBetType(item.betType)));
  if (multiple) return matched;
  return matched[0] ?? null;
}

function extractNetkeirinResultData(html) {
  const resultTop3 = extractNetkeirinResultTop3(html);
  const payoutExtraction = extractNetkeirinPayouts(html);
  const payouts = payoutExtraction.payouts;
  const isConfirmed = resultTop3.length > 0 || payouts.length > 0 || /レースが確定しました/.test(html);
  const finishOrder = resultTop3.map((item) => item.carNo).filter(Boolean);
  const sLeaderCarNo = getNetkeirinLeaderCarNoFromRows(resultTop3, "sMark");
  const hLeaderCarNo = getNetkeirinLeaderCarNoFromRows(resultTop3, "hMark");
  const bLeaderCarNo = getNetkeirinLeaderCarNoFromRows(resultTop3, "bMark");
const result = {
  status: isConfirmed ? "confirmed" : "pending",
  finishOrder,
  kimarite: resultTop3[0]?.kimarite ?? "",
  secondKimarite: resultTop3[1]?.kimarite ?? "",
  sLeaderCarNo,
  hLeaderCarNo,
  bLeaderCarNo,
  payout2tan: pickNetkeirinPayoutItem(payouts, ["2車単"]),
  payout2fuku: pickNetkeirinPayoutItem(payouts, ["2車複", "二車複"], true),
  payout3tan: pickNetkeirinPayoutItem(payouts, ["3連単"]),
  payout3fuku: pickNetkeirinPayoutItem(payouts, ["3連複"]),
  payoutWide: pickNetkeirinPayoutItem(payouts, ["ワイド"], true),
  finalizedAt: isConfirmed ? extractNetkeirinResultFinalizedAt(html) : "",
};

  return {
    resultStatus: result.status,
    resultTop3,
    payouts,
    result,
debug: {
  finishOrderCount: finishOrder.length,
  payoutTableFound: payoutExtraction.debug.tableFound,
  payoutRowCount: payoutExtraction.debug.rowCount,
  payoutCount: payouts.length,
  markRows: resultTop3
    .filter((row) => row.sMark || row.hMark || row.bMark)
    .map((row) => ({
      place: row.place,
      carNo: row.carNo,
      name: row.name,
      sMark: row.sMark,
      hMark: row.hMark,
      bMark: row.bMark,
    })),
  sLeaderCarNo,
  hLeaderCarNo,
  bLeaderCarNo,
},
  };
}

function extractNetkeirinLead(html) {
  const text = stripTags(html);
  return text.match(/netkeirin本紙の競輪予想\s*見解\s*(.+?)\s*ワイド/)?.[1]?.trim() ?? "";
}

function extractNetkeirinRiders(html) {
  const riders = [];

  const rows = Array.from(html.matchAll(/<tr class="PlayerList[\s\S]*?<\/tr>/gi));
  for (const row of rows) {
    const rowHtml = row[0];

    const playerFrom = cleanCellText(matchOne(rowHtml, [
      /<dd class="PlayerFrom">([\s\S]*?)<\/dd>/i,
    ]));

    const playerClass = cleanCellText(matchOne(rowHtml, [
      /<dd class="PlayerClass">([\s\S]*?)<\/dd>/i,
    ]));

    const detailsSection = matchOne(rowHtml, [
      /<td class="Player_Info">[\s\S]*?<\/td>([\s\S]*)$/i,
    ]);

    const detailCells = Array.from(String(detailsSection ?? "").matchAll(/<td class="[^"]*">([\s\S]*?)<\/td>/gi))
      .map((match) => cleanCellText(match[1]));

    const carNo = matchOne(rowHtml, [
      /<td class="RaceCardCell01 Waku[1-9]">([1-9])<\/td>/i,
    ]);

    const name = cleanNetkeirinRiderName(matchOne(rowHtml, [
  /<dt class="PlayerName">([\s\S]*?)<span id="Fvn_/i,
  /<dt class="PlayerName">([\s\S]*?)<\/dt>/i,
]));

    const score = detailCells[0] || matchOne(rowHtml, [
      /<td class="RaceCardCell01 GroupLeft"><span[^>]*>([0-9]{2}\.[0-9]{2})<\/span><\/td>/i,
    ]);

    const style = detailCells[1] || matchOne(rowHtml, [
      /<td class="RaceCardCell01 GroupLeft"><span style="display: none;">[0-9]+<\/span>(逃|追|両)<\/td>/i,
    ]);

    const comment = detailCells[16] || stripTags(matchOne(rowHtml, [
      /<td class="RaceCardCell01 GroupLeft Txt_L RaceCardCell01__comment">([\s\S]*?)<\/td>/i,
      /<td class="SortSyncData GroupLeft Txt_L">([\s\S]*?)<\/td>/i,
    ])).replace(/\s+/g, " ").trim();

    const prefecture = matchOne(playerFrom, [
      /^(.+?)\s+[0-9]{1,2}歳$/,
    ]);

    const age = matchOne(playerFrom, [
      /([0-9]{1,2})歳$/,
    ]);

    const term = matchOne(playerClass, [
      /^([0-9]{1,3})期(?:\s|$)/,
    ]);

    const grade = decodeHtml(matchOne(playerClass, [
      /^[0-9]{1,3}期\s+(.+)$/,
    ])).normalize("NFKC").replace(/\s+/g, " ").trim();

    if (!carNo || !name) continue;

    riders.push({
      carNo,
      name,
      prefecture,
      age,
      term,
      grade,
      style,
      score,
      s: detailCells[2] || "",
      b: detailCells[3] || "",
      escape: detailCells[4] || "",
      makuri: detailCells[5] || "",
      sashi: detailCells[6] || "",
      mark: detailCells[7] || "",
      wins: detailCells[8] || "",
      seconds: detailCells[9] || "",
      thirds: detailCells[10] || "",
      loses: detailCells[11] || "",
      winRate: detailCells[12] || "",
      quinellaRate: detailCells[13] || "",
      trifectaRate: detailCells[14] || "",
      gearRatio: detailCells[15] || "",
      comment,
    });
  }

  return riders;
}

async function fetchNetkeirinRaceDetail(todayIso, venueCode, raceNo, saveSample = false) {
  const raceId = `${compactDate(todayIso)}${venueCode}${String(raceNo).padStart(2, "0")}`;
  const url = `${NETKEIRIN_ENTRY_URL}?race_id=${raceId}&rf=racetoplive`;

  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0",
      "accept-language": "ja-JP,ja;q=0.9,en;q=0.8",
    },
  });

  if (!response.ok) {
    return {
      raceNo,
      time: "",
      title: "",
      lineup: "",
      winticketLineupRaw: "",
      netkeirinLineupRaw: "",
      kdreamsLineupRaw: "",
      sourceNote: `netkeirin取得失敗: ${response.status}`,
      lead: "",
      isGirls: false,
      riders: [],
    };
  }

  const html = await response.text();

  if (saveSample) {
    await fs.writeFile(NETKEIRIN_SAMPLE_HTML_PATH, html, "utf-8");
    await fs.writeFile(NETKEIRIN_SAMPLE_TEXT_PATH, stripTags(html), "utf-8");
  }

  const title = extractNetkeirinRaceTitle(html);
  const riders = extractNetkeirinRiders(html);
  const isGirls = /ガールズ|女子|L級|Ｌ級/i.test(title);
  const oddsPreview = extractNetkeirinOddsPreview(html);
  let oddsTrifecta = [];
  let oddsTrifectaReason = "not-requested";
  let oddsTrifectaUsedKey = "-";
  let oddsTrifectaRawRows = 0;
  let oddsTrifectaNormalizedRows = 0;
  try {
    const oddsData = await fetchNetkeirinRaceApi("AplRaceOdds", { race_id: raceId });
    const trifectaExtraction = extractNetkeirinTrifectaOdds(oddsData);
    oddsTrifecta = trifectaExtraction.items;
    oddsTrifectaUsedKey = trifectaExtraction.usedKey ?? "-";
    oddsTrifectaRawRows = trifectaExtraction.rawRows;
    oddsTrifectaNormalizedRows = trifectaExtraction.normalizedRows;
    oddsTrifectaReason = oddsTrifecta.length ? "api-hit" : trifectaExtraction.usedKey ? "api-empty" : "api-no-candidate";
    if (!oddsTrifecta.length) {
      await writeNetkeirinOddsDebugJson(`odds-api-${raceId}.json`, oddsData);
    }
  } catch (error) {
    oddsTrifectaReason = error instanceof Error ? error.message : "api-fetch-failed";
    await writeNetkeirinOddsDebugJson(`odds-api-${raceId}-error.json`, {
      raceId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  const netkeirinLineupCandidate = extractNetkeirinLineupRaw(html);
  const netkeirinLineupValidation = validateLineupRaw(netkeirinLineupCandidate, {
    isGirls,
    riderCount: riders.length,
  });

  let resultData = {
  resultStatus: "pending",
  resultTop3: [],
  payouts: [],
  result: {
    status: "pending",
    finishOrder: [],
    kimarite: "",
    secondKimarite: "",
    sLeaderCarNo: "",
    hLeaderCarNo: "",
    bLeaderCarNo: "",
    payout2tan: null,
    payout2fuku: [],
    payout3tan: null,
    payout3fuku: null,
    payoutWide: [],
    finalizedAt: "",
  },
};
  try {
    const resultResponse = await fetch(`${NETKEIRIN_RESULT_URL}?race_id=${raceId}`, {
      headers: {
        "user-agent": "Mozilla/5.0",
        "accept-language": "ja-JP,ja;q=0.9,en;q=0.8",
      },
    });
    if (resultResponse.ok) {
      const resultHtml = await resultResponse.text();
      resultData = extractNetkeirinResultData(resultHtml);
      console.log(
  `[result] race_id=${raceId} status=${resultData.resultStatus} finishOrder=${resultData.debug.finishOrderCount} payoutTable=${resultData.debug.payoutTableFound ? "found" : "missing"} payoutRows=${resultData.debug.payoutRowCount} payoutCount=${resultData.debug.payoutCount} SHB=${resultData.debug.sLeaderCarNo || "-"}:${resultData.debug.hLeaderCarNo || "-"}:${resultData.debug.bLeaderCarNo || "-"}`,
);

if (resultData.debug.markRows?.length) {
  console.log("[netkeirin full result SHB debug]", {
    raceId,
    markRows: resultData.debug.markRows,
    resultLeaderCarNos: {
      s: resultData.debug.sLeaderCarNo,
      h: resultData.debug.hLeaderCarNo,
      b: resultData.debug.bLeaderCarNo,
    },
  });
}
      if (resultData.resultStatus === "confirmed" && resultData.debug.payoutCount === 0) {
        await writeNetkeirinResultDebugFiles(raceId, "payout-missing", resultHtml, {
          raceId,
          resultStatus: resultData.resultStatus,
          finishOrderCount: resultData.debug.finishOrderCount,
          payoutTableFound: resultData.debug.payoutTableFound,
          payoutRowCount: resultData.debug.payoutRowCount,
          payoutCount: resultData.debug.payoutCount,
        });
      }
    }
  } catch {
    // ended-race result fetch failure should not block base race generation
  }

  if (netkeirinLineupCandidate && !netkeirinLineupValidation.valid) {
    logInvalidLineupSource({
      venue: venueCode,
      raceNo,
      source: "netkeirin",
      rawText: netkeirinLineupCandidate,
      reason: netkeirinLineupValidation.reason,
    });
  }

  console.log(
    `[odds] race_id=${raceId} trifecta=${oddsTrifecta.length} preview=${oddsPreview.filter((item) => item.tag === "3連単").length} reason=${oddsTrifectaReason} usedKey=${oddsTrifectaUsedKey} rawRows=${oddsTrifectaRawRows} normalizedRows=${oddsTrifectaNormalizedRows}${oddsTrifecta.length ? "" : " fallback=summary"}`,
  );

  return {
    raceNo,
    time: extractNetkeirinRaceTime(html),
    title,
    lineup: netkeirinLineupValidation.valid ? netkeirinLineupValidation.normalizedRawText : "",
    winticketLineupRaw: "",
    netkeirinLineupRaw: netkeirinLineupValidation.valid ? netkeirinLineupValidation.normalizedRawText : "",
    kdreamsLineupRaw: "",
    isGirls,
    sourceNote: `netkeirin race_id=${raceId}`,
    lead: extractNetkeirinLead(html),
    oddsPreview,
    oddsTrifecta,
    oddsNote: oddsPreview.length ? "netkeirin本紙の表示オッズを要約" : "",
    resultStatus: resultData.resultStatus,
    resultTop3: resultData.resultTop3,
    payouts: resultData.payouts,
    result: resultData.result,
    riders,
  };
}

async function main() {
  const todayIso = getJstTodayIso();
  const overrides = await readOverrides();
  const scheduleData = await readRaceScheduleData();

  await fs.mkdir(DEBUG_DIR, { recursive: true });
  await fs.mkdir(DEBUG_ODDS_DIR, { recursive: true });

  const response = await fetch(KDREAMS_RACECARD_URL, {
    headers: {
      "user-agent": "Mozilla/5.0",
      "accept-language": "ja-JP,ja;q=0.9,en;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Kドリームス racecard: ${response.status}`);
  }

  const html = await response.text();
  await fs.writeFile(KDREAMS_DEBUG_HTML_PATH, html, "utf-8");

  const { venues: todayVenues, debug } = parseKdreamsTodayVenues(html, todayIso, scheduleData);
  await fs.writeFile(
    DEBUG_JSON_PATH,
    JSON.stringify({ todayIso, matchedCount: todayVenues.length, debug }, null, 2),
    "utf-8"
  );

  let savedSample = false;

  for (const venue of todayVenues) {
    const override = overrides[venue.venue] ?? {};
    const overrideRaces = Array.isArray(override.races) ? override.races : [];
    const raceNos = Array.isArray(venue.raceNos) ? venue.raceNos : [];

    const fetchedRaces = [];
    for (const raceNo of raceNos) {
      const race = await fetchNetkeirinRaceDetail(todayIso, venue.venueCode, raceNo, !savedSample);
      savedSample = true;
      const extra = overrideRaces.find((item) => item.raceNo === race.raceNo) ?? {};
      fetchedRaces.push({
        ...race,
        ...extra,
        riders: Array.isArray(extra.riders) && extra.riders.length ? extra.riders : race.riders,
      });
    }

    venue.races = fetchedRaces;
  }

  const venues = todayVenues.map((venue) => {
    const override = overrides[venue.venue] ?? {};
    return {
      ...venue,
      ...override,
      races: venue.races,
    };
  });

  const payload = {
    generatedAt: new Date().toLocaleString("ja-JP", { hour12: false }),
    source: {
      racecard: KDREAMS_RACECARD_URL,
      detailPrimary: `${NETKEIRIN_ENTRY_URL}?race_id=[YYYYMMDD][venueCode][raceNo]&rf=racetoplive`,
    },
    date: todayIso,
    venues,
  };

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2), "utf-8");

  const parseRowByVenue = new Map((debug.parseRows ?? []).map((row) => [row.venue, row]));
  const validGrades = new Set(["GP", "G1", "G2", "G3", "F1", "F2"]);

  console.log("[grade] venue summary start");
  venues.forEach((venue) => {
    console.log(`[grade] ${venue.venue} -> ${venue.grade || "(empty)"}`);
  });
  console.log("[grade] venue summary end");

  venues.forEach((venue) => {
    if (venue.grade) return;
    const parseRow = parseRowByVenue.get(venue.venue);
    console.warn("[grade] empty venue grade detected", {
      venue: venue.venue,
      title: venue.title,
      venueId: venue.id,
      venueCode: venue.venueCode,
      parseRow: parseRow
        ? {
            grade: parseRow.grade,
            session: parseRow.session,
            hasGirls: parseRow.hasGirls,
            raceCount: parseRow.raceCount,
          }
        : null,
    });
  });

  GRADE_CHECK_TARGET_VENUES.forEach((venueName) => {
    const venue = venues.find((item) => item.venue === venueName);
    if (!venue) {
      console.warn("[grade] target venue missing from generated payload", { venue: venueName });
      return;
    }
    if (!venue.grade || !validGrades.has(venue.grade)) {
      console.warn("[grade] target venue grade check warning", {
        venue: venue.venue,
        grade: venue.grade,
        title: venue.title,
        venueId: venue.id,
      });
      return;
    }
    console.log(`[grade-check] ${venue.venue} -> ${venue.grade}`);
  });

  venues.forEach((venue) => {
    venue.races.forEach((race) => {
      const missingMetadataRiders = (race.riders ?? []).flatMap((rider) => {
        const missingFields = ["prefecture", "age", "term", "grade"].filter((field) => !String(rider?.[field] ?? "").trim());
        if (!missingFields.length) return [];
        return [{
          carNo: rider?.carNo ?? "",
          name: rider?.name ?? "",
          missingFields,
        }];
      });

      if (!missingMetadataRiders.length) return;

      console.warn("[rider] missing metadata", {
        venue: venue.venue,
        raceNo: race.raceNo,
        title: race.title,
        missingCount: missingMetadataRiders.length,
        missingFields: Array.from(new Set(missingMetadataRiders.flatMap((item) => item.missingFields))),
        riders: missingMetadataRiders.map((item) => `${item.carNo}:${item.name}`),
      });
    });
  });

  const sampleRace = venues
    .flatMap((venue) => (venue.races ?? []).map((race) => ({ venue: venue.venue, race })))
    .find((item) => Array.isArray(item.race?.riders) && item.race.riders.length > 0);

  if (sampleRace) {
    console.log("[rider-sample]", {
      venue: sampleRace.venue,
      raceNo: sampleRace.race.raceNo,
      title: sampleRace.race.title,
      riders: sampleRace.race.riders.map((rider) => ({
        carNo: rider.carNo ?? "",
        name: rider.name ?? "",
        prefecture: rider.prefecture ?? "",
        age: rider.age ?? "",
        term: rider.term ?? "",
        grade: rider.grade ?? "",
      })),
    });
  }

  console.log(`todayIso=${todayIso}`);
  console.log(`matched venues=${todayVenues.length}`);
  console.log(`Generated ${venues.length} venues with race details -> ${OUTPUT_PATH}`);
  console.log(`parse debug -> ${DEBUG_JSON_PATH}`);
  console.log(`netkeirin sample html -> ${NETKEIRIN_SAMPLE_HTML_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
