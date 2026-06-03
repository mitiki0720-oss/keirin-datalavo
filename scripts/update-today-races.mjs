
import fs from "node:fs/promises";
import path from "node:path";
import { load } from "cheerio";

const KDREAMS_RACECARD_URL = "https://keirin.kdreams.jp/racecard/";
const NETKEIRIN_ENTRY_URL = "https://keirin.netkeiba.com/race/entry/";
const NETKEIRIN_RACE_API_URL = "https://keirin.netkeiba.com/api/race/";
const NETKEIRIN_RESULT_URL = "https://keirin.netkeiba.com/race/result/";
const CHARILOTO_ATHLETES_URL = "https://www.chariloto.com/keirin/athletes";
const ODDSPARK_RACE_LIST_URL = "https://sp.oddspark.com/keirin/SpRaceList.do";
const ODDSPARK_RACE_INFO_URL = "https://sp.oddspark.com/keirin/SpRaceInfo.do";
const ODDSPARK_RACE_RESULT_URL = "https://sp.oddspark.com/keirin/SpRaceResultInfo.do";
const WINTICKET_KEIRIN_URL = "https://www.winticket.jp/keirin";
const PUBLIC_OUTPUT_PATH = path.resolve("public/data/races/today.generated.json");
const LOCAL_DEBUG_OUTPUT_PATH = path.resolve("scripts/debug/today.generated.local.json");
const JAPANESE_PREFECTURES = ["北海道", "青森", "岩手", "宮城", "秋田", "山形", "福島", "茨城", "栃木", "群馬", "埼玉", "千葉", "東京", "神奈川", "新潟", "富山", "石川", "福井", "山梨", "長野", "岐阜", "静岡", "愛知", "三重", "滋賀", "京都", "大阪", "兵庫", "奈良", "和歌山", "鳥取", "島根", "岡山", "広島", "山口", "徳島", "香川", "愛媛", "高知", "福岡", "佐賀", "長崎", "熊本", "大分", "宮崎", "鹿児島", "沖縄"];
const JAPANESE_PREFECTURE_PATTERN = new RegExp(`^(${JAPANESE_PREFECTURES.join("|")})$`);

const args = process.argv.slice(2);
const phaseArgIndex = args.findIndex((arg) => arg === "--phase");
const phaseArgValue = phaseArgIndex >= 0 ? args[phaseArgIndex + 1] : "";
const inlinePhaseArgValue = args.find((arg) => arg.startsWith("--phase="))?.split("=")[1] ?? "";
const requestedPhase = String(phaseArgValue || inlinePhaseArgValue || "auto").trim().toLowerCase();
const probeSources = args.includes("--probe-sources");
const debugKdreamsOdds = args.includes("--debug-kdreams-odds");
const shouldWritePublic =
  process.env.GITHUB_ACTIONS === "true" ||
  args.includes("--write-public");

function getArgValue(name, fallback = "") {
  const index = args.findIndex((arg) => arg === name);
  if (index >= 0) return args[index + 1] ?? fallback;
  return args.find((arg) => arg.startsWith(`${name}=`))?.split("=").slice(1).join("=") ?? fallback;
}

function resolveSourcePolicy(argv) {
  const policy = {
    netkeirin: false,
    kdreams: true,
    chariloto: true,
    oddspark: false,
    winticket: false,
  };

  if (argv.includes("--enable-netkeirin") || probeSources) policy.netkeirin = true;
  if (argv.includes("--enable-oddspark") || probeSources) policy.oddspark = true;
  if (argv.includes("--enable-winticket") || probeSources) policy.winticket = true;

  return policy;
}

const SOURCE_POLICY = resolveSourcePolicy(args);

const OUTPUT_PATH = shouldWritePublic ? PUBLIC_OUTPUT_PATH : LOCAL_DEBUG_OUTPUT_PATH;
const OVERRIDE_PATH = path.resolve("scripts/today-races-overrides.json");
const RACE_SCHEDULE_DATA_PATH = path.resolve("src/data/raceScheduleData.ts");
const UPCOMING_SCHEDULE_DATA_PATH = path.resolve("public/data/races/upcoming-schedule.generated.json");

const DEBUG_DIR = path.resolve("scripts");
const DEBUG_ODDS_DIR = path.join(DEBUG_DIR, "debug");
const KDREAMS_DEBUG_HTML_PATH = path.join(DEBUG_DIR, "kdreams-racecard-debug.html");
const DEBUG_JSON_PATH = path.join(DEBUG_DIR, "aggregate-parse-debug.json");
const NETKEIRIN_SAMPLE_HTML_PATH = path.join(DEBUG_DIR, "netkeirin-race-detail-sample.html");
const NETKEIRIN_SAMPLE_TEXT_PATH = path.join(DEBUG_DIR, "netkeirin-race-detail-sample.txt");
const KDREAMS_RACE_DETAIL_BASE_URL = "https://keirin.kdreams.jp";
const KDREAMS_SAMPLE_DETAIL_HTML_PATH = path.join(DEBUG_DIR, "kdreams-race-detail-sample.html");
const KDREAMS_SAMPLE_DETAIL_TEXT_PATH = path.join(DEBUG_DIR, "kdreams-race-detail-sample.txt");
const NETKEIRIN_RESULT_DEBUG_PREFIX = "result-page";
const NETKEIRIN_TRIFECTA_CANDIDATE_KEYS = ["list_9", "trifecta", "trifecta_list", "odds_3t"];
const GRADE_CHECK_TARGET_VENUES = ["別府", "名古屋", "熊本", "松戸", "奈良", "函館"];
const seenUnknownGradeWarnings = new Set();
let savedKdreamsResultDebugSample = false;
let savedCharilotoProbeDebugSample = false;
let savedOddsParkProbeDebugSample = false;
let savedWinticketProbeDebugSample = false;

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

function getJstNowParts(base = new Date()) {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(base);
  const get = (type) => parts.find((part) => part.type === type)?.value ?? "00";
  return {
    isoDate: `${get("year")}-${get("month")}-${get("day")}`,
    isoDateTime: `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`,
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
  };
}

function resolveUpdatePhase(base = new Date()) {
  const now = getJstNowParts(base);
  const normalizedPhase = ["auto", "lineup", "odds", "result", "final", "backfill"].includes(requestedPhase)
    ? requestedPhase
    : "auto";

  if (normalizedPhase !== "auto") {
    return { phase: normalizedPhase, session: "all", jst: now.isoDateTime, explicit: true };
  }

  if (now.hour === 23 && now.minute >= 40) {
    return { phase: now.minute >= 53 ? "backfill" : "final", session: "all", jst: now.isoDateTime, explicit: false };
  }
  if (now.hour >= 19 && now.hour < 21) {
    return { phase: "odds", session: "midnight", jst: now.isoDateTime, explicit: false };
  }
  if (now.hour >= 16 && now.hour < 18) {
    return { phase: "lineup", session: "midnight", jst: now.isoDateTime, explicit: false };
  }
  if (now.hour >= 13 && now.hour < 15) {
    return { phase: "odds", session: "night", jst: now.isoDateTime, explicit: false };
  }
  if (now.hour >= 9 && now.hour < 11) {
    return { phase: "odds", session: "day", jst: now.isoDateTime, explicit: false };
  }
  if (now.hour >= 7 && now.hour < 9) {
    return { phase: "lineup", session: "day", jst: now.isoDateTime, explicit: false };
  }

  return { phase: "result", session: "all", jst: now.isoDateTime, explicit: false };
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

function normalizeOperationStatus(rawValue, fallbackStatus = "scheduled") {
  const text = String(rawValue ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
  const emptyStatus = fallbackStatus || "unknown";
  if (!text) {
    return { status: emptyStatus, label: emptyStatus === "scheduled" ? "" : "状態未取得", reason: "", raw: "" };
  }

  if (/中止ではありません|未中止|中止なし|中止情報なし/u.test(text)) {
    return { status: "scheduled", label: "", reason: "", raw: text };
  }

  const reason = matchOne(text, [
    /(?:理由|事由|原因)[:：\s]*([^。／\/\n\r]+)/u,
    /(荒天[^。／\/\n\r]*)/u,
    /(悪天候[^。／\/\n\r]*)/u,
    /(強風[^。／\/\n\r]*)/u,
  ]);

  if (/開催中止|発売中止|投票中止|(?:^|[^未])中止/u.test(text)) {
    return {
      status: "cancelled",
      label: text.includes("開催中止") ? "開催中止" : "中止",
      reason,
      raw: text,
    };
  }

  if (/順延|延期/u.test(text)) {
    return { status: "postponed", label: "順延", reason, raw: text };
  }

  if (/打切|打ち切|打切り|打ち切り|一時中断|中断/u.test(text)) {
    return { status: "suspended", label: "打ち切り・中断", reason, raw: text };
  }

  return { status: "scheduled", label: "", reason: "", raw: text };
}

function createOperationFields(prefix, operation, source, updatedAt) {
  return {
    [`${prefix}OperationStatus`]: operation.status,
    [`${prefix}OperationLabel`]: operation.label,
    [`${prefix}OperationReason`]: operation.reason,
    [`${prefix}OperationSource`]: source,
    [`${prefix}OperationUpdatedAt`]: updatedAt,
    [`${prefix}OperationRaw`]: operation.raw,
  };
}

function resolveRaceOperationStatus({ venueOperation, raceOperation, resultStatus }) {
  const venueStatus = venueOperation?.status ?? "unknown";
  const raceStatus = raceOperation?.status ?? "unknown";
  if (["cancelled", "postponed", "suspended"].includes(venueStatus)) return venueOperation;
  if (["cancelled", "postponed", "suspended"].includes(raceStatus)) return raceOperation;
  if (resultStatus === "confirmed") return { status: "finished", label: "結果確定", reason: "", raw: "result confirmed" };
  if (raceStatus === "scheduled" || venueStatus === "scheduled") return { status: "scheduled", label: "", reason: "", raw: "" };
  return { status: "unknown", label: "状態未取得", reason: "", raw: "" };
}

const MOJIBAKE_TOKEN_PATTERN = /�|蟷|譛|譌|繝|繧|髱|髦|蠎|霈|荳|縺/g;

function scoreTextMojibake(value) {
  const text = String(value ?? "");
  if (!text) return 0;

  const tokenMatches = text.match(MOJIBAKE_TOKEN_PATTERN) ?? [];
  const replacementPenalty = (text.match(/�/g) ?? []).length * 8;
  const tokenPenalty = tokenMatches.length * 3;
  const suspiciousDatePenalty = /20\d{2}蟷ｴ|繝ｬ繝ｼ繧ｹ隧ｳ邏ｰ|遶ｶ霈ｪ/.test(text) ? 20 : 0;
  return replacementPenalty + tokenPenalty + suspiciousDatePenalty;
}

function hasMojibakeText(value) {
  return scoreTextMojibake(value) > 0;
}

async function readHtmlResponse(response, options = {}) {
  const bytes = new Uint8Array(await response.arrayBuffer());
  const utf8Head = new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, 4096));
  const declaredCharset = matchOne(utf8Head, [
    /charset=["']?([a-zA-Z0-9_-]+)/i,
    /encoding=["']?([a-zA-Z0-9_-]+)/i,
  ]).toLowerCase();
  const decode = (encoding) => {
    try {
      return new TextDecoder(encoding, { fatal: false }).decode(bytes);
    } catch {
      return "";
    }
  };

  const utf8Text = decode("utf-8");
  const shiftJisText = decode("shift_jis");

  if (declaredCharset.includes("utf")) return utf8Text || shiftJisText;
  if (declaredCharset.includes("shift") || declaredCharset.includes("sjis")) return shiftJisText || utf8Text;

  const utf8Score = scoreTextMojibake(utf8Text);
  const shiftJisScore = scoreTextMojibake(shiftJisText);
  return utf8Score <= shiftJisScore ? utf8Text : shiftJisText;
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

async function readUpcomingScheduleData() {
  try {
    const raw = await fs.readFile(UPCOMING_SCHEDULE_DATA_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    return items
      .map((item) => ({
        ...item,
        venue: item.venueName || item.venue,
      }))
      .filter((item) => item.venue && item.startDate && item.endDate);
  } catch (error) {
    console.warn("[schedule] failed to read upcoming-schedule.generated.json", error);
    return [];
  }
}

function splitNoteParts(note) {
  return String(note ?? "")
    .split(/\s+\/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function joinUniqueNoteParts(parts) {
  return Array.from(new Set(parts.map((part) => String(part ?? "").trim()).filter(Boolean))).join(" / ");
}

function appendNote(currentNote, appendedNote) {
  return joinUniqueNoteParts([...splitNoteParts(currentNote), ...splitNoteParts(appendedNote)]);
}

async function loadExistingTodayFeedForCache(outputPath, todayIso) {
  const candidates = outputPath === PUBLIC_OUTPUT_PATH
    ? [PUBLIC_OUTPUT_PATH, LOCAL_DEBUG_OUTPUT_PATH]
    : [outputPath, PUBLIC_OUTPUT_PATH, LOCAL_DEBUG_OUTPUT_PATH];
  const seenPaths = new Set();
  const feeds = [];
  const feedPaths = [];

  for (const candidatePath of candidates) {
    if (!candidatePath || seenPaths.has(candidatePath)) continue;
    seenPaths.add(candidatePath);

    try {
      const raw = await fs.readFile(candidatePath, "utf-8");
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.venues)) {
        continue;
      }
      if (parsed.date !== todayIso) {
        console.log(
          `[cache] skip existing feed due to date mismatch path=${candidatePath} date=${parsed.date || "(empty)"} target=${todayIso}`,
        );
        continue;
      }
      feeds.push(parsed);
      feedPaths.push(candidatePath);
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      console.warn(`[cache] failed to read existing feed path=${candidatePath}`, error);
    }
  }

  if (feeds.length > 0) {
    return {
      payload: mergeExistingTodayFeedsForCache(feeds),
      path: feedPaths.join(", "),
    };
  }

  return {
    payload: null,
    path: "",
  };
}

function findExistingVenueForCache(venues, targetVenue) {
  const targetVenueName = String(targetVenue?.venue ?? "").trim();
  const targetSlug = String(targetVenue?.slug ?? "").trim();
  const targetCode = String(targetVenue?.venueCode ?? "").trim();
  return venues.find((venue) => {
    if (targetCode && String(venue?.venueCode ?? "").trim() === targetCode) return true;
    if (targetSlug && String(venue?.slug ?? "").trim() === targetSlug) return true;
    return targetVenueName && String(venue?.venue ?? "").trim() === targetVenueName;
  });
}

function mergeExistingVenueForCache(baseVenue, overlayVenue) {
  const merged = {
    ...baseVenue,
    ...Object.fromEntries(
      Object.entries(overlayVenue ?? {}).filter(([, value]) => {
        if (value === null || value === undefined) return false;
        if (typeof value === "string" && !value.trim()) return false;
        if (Array.isArray(value) && !value.length) return false;
        return true;
      }),
    ),
    races: Array.isArray(baseVenue?.races) ? [...baseVenue.races] : [],
  };

  for (const overlayRace of overlayVenue?.races ?? []) {
    const overlayRaceNo = Number(overlayRace?.raceNo);
    const overlayRaceId = String(overlayRace?.raceId ?? overlayRace?.kdreamsRaceId ?? overlayVenue?.raceIds?.[overlayRaceNo - 1] ?? "").trim();
    const raceIndex = merged.races.findIndex((race, index) => {
      const raceNo = Number(race?.raceNo ?? index + 1);
      const raceId = String(race?.raceId ?? race?.kdreamsRaceId ?? merged.raceIds?.[index] ?? "").trim();
      return (overlayRaceId && raceId === overlayRaceId) || (Number.isFinite(overlayRaceNo) && raceNo === overlayRaceNo);
    });
    if (raceIndex >= 0) {
      merged.races[raceIndex] = mergeRaceDetailWithFallback(overlayRace, merged.races[raceIndex]);
    } else {
      merged.races.push(overlayRace);
    }
  }

  merged.races.sort((a, b) => Number(a?.raceNo ?? 0) - Number(b?.raceNo ?? 0));
  return merged;
}

function mergeExistingTodayFeedsForCache(feeds) {
  const [firstFeed, ...restFeeds] = feeds;
  const merged = {
    ...firstFeed,
    venues: Array.isArray(firstFeed?.venues) ? [...firstFeed.venues] : [],
  };

  for (const feed of restFeeds) {
    for (const overlayVenue of feed?.venues ?? []) {
      const existingVenue = findExistingVenueForCache(merged.venues, overlayVenue);
      if (!existingVenue) {
        merged.venues.push(overlayVenue);
        continue;
      }
      const venueIndex = merged.venues.indexOf(existingVenue);
      merged.venues[venueIndex] = mergeExistingVenueForCache(existingVenue, overlayVenue);
    }
  }

  return merged;
}

function buildRaceCacheKey({ venue, raceNo, raceId }) {
  const normalizedRaceId = String(raceId ?? "").trim();
  if (normalizedRaceId) {
    return `raceId:${normalizedRaceId}`;
  }

  const normalizedVenue = String(venue ?? "").trim();
  const normalizedRaceNo = Number(raceNo);
  if (!normalizedVenue || !Number.isFinite(normalizedRaceNo)) {
    return "";
  }

  return `venue:${normalizedVenue}:${normalizedRaceNo}`;
}

function buildExistingRaceCache(existingFeed) {
  const raceCache = new Map();

  for (const venue of existingFeed?.venues ?? []) {
    const raceIds = Array.isArray(venue?.raceIds) ? venue.raceIds : [];
    const races = Array.isArray(venue?.races) ? venue.races : [];

    races.forEach((race, index) => {
      const raceNo = Number(race?.raceNo ?? index + 1);
      const raceId = String(race?.raceId ?? race?.kdreamsRaceId ?? raceIds[index] ?? "").trim();
      const primaryKey = buildRaceCacheKey({
        venue: venue?.venue,
        raceNo,
        raceId,
      });
      const fallbackKey = buildRaceCacheKey({
        venue: venue?.venue,
        raceNo,
      });

      if (primaryKey) {
        raceCache.set(primaryKey, race);
      }
      if (fallbackKey && !raceCache.has(fallbackKey)) {
        raceCache.set(fallbackKey, race);
      }
    });
  }

  return raceCache;
}

function hasLineupValue(race) {
  const riderCount = Array.isArray(race?.riders) ? race.riders.length : 0;
  const isGirls = Boolean(race?.isGirls);

  return Boolean(
    String(race?.lineup ?? "").trim()
      || [
        race?.netkeirinLineupRaw,
        race?.kdreamsLineupRaw,
        race?.charilotoLineupRaw,
        race?.oddsparkLineupRaw,
        race?.winticketLineupRaw,
      ].some((raw) => validateLineupRaw(raw, { riderCount, isGirls }).valid),
  );
}

function hasSubstantiveRiderDetail(rider) {
  if (!rider || typeof rider !== "object") return false;
  return Boolean(
    String(rider.age ?? "").trim()
      || String(rider.grade ?? "").trim()
      || String(rider.style ?? "").trim()
      || String(rider.score ?? "").trim()
      || String(rider.gearRatio ?? "").trim()
      || String(rider.s ?? "").trim()
      || String(rider.b ?? "").trim()
      || String(rider.nige ?? rider.escape ?? "").trim()
      || String(rider.makuri ?? "").trim()
      || String(rider.sashi ?? "").trim()
      || String(rider.mark ?? "").trim()
      || String(rider.comment ?? "").trim(),
  );
}

function hasKdreamsRiderMaterial(rider) {
  if (!rider || typeof rider !== "object") return false;
  return Boolean(
    String(rider.totalScore ?? "").trim()
      || String(rider.starts ?? "").trim()
      || String(rider.previousRaceSummary ?? "").trim()
      || (Array.isArray(rider.previousRaceResults) && rider.previousRaceResults.length)
      || (rider.yearlyStats && typeof rider.yearlyStats === "object" && Object.keys(rider.yearlyStats).length)
      || (rider.sameTrackYearlyStats && typeof rider.sameTrackYearlyStats === "object" && Object.keys(rider.sameTrackYearlyStats).length)
      || (rider.localFiveYearStats && typeof rider.localFiveYearStats === "object" && Object.keys(rider.localFiveYearStats).length)
      || String(rider.kdreamsRiderNote ?? "").trim(),
  );
}

function hasKdreamsRiderIdentity(rider) {
  if (!rider || typeof rider !== "object") return false;

  const fullName = String(rider.fullName ?? rider.name ?? "").replace(/\s+/g, " ").trim();
  const prefecture = String(rider.prefecture ?? "").replace(/\s+/g, "").trim();
  return /.+\s.+/.test(fullName) && JAPANESE_PREFECTURE_PATTERN.test(prefecture);
}

function parseKdreamsRiderMeta(value) {
  const normalize = (text) => String(text ?? "").replace(/\s+/g, " ").trim();
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  const parts = normalized.split("/").map((part) => part.trim());
  if (parts.length < 3) {
    return {
      fullName: normalize(normalized),
      prefecture: "",
      age: "",
      term: "",
    };
  }

  const metaLeft = parts[0] ?? "";
  const compactLeft = metaLeft.replace(/\s+/g, "");
  const prefecture = JAPANESE_PREFECTURES.find((candidate) => compactLeft.endsWith(candidate)) ?? "";
  const prefecturePattern = prefecture
    ? new RegExp(`${prefecture.split("").join("\\s*")}$`)
    : null;
  const fullName = prefecturePattern
    ? normalize(metaLeft.replace(prefecturePattern, "").trim())
    : normalize(metaLeft);

  return {
    fullName,
    prefecture,
    age: parts[1] ?? "",
    term: parts[2] ?? "",
  };
}

function extractLineupCarNos(lineup) {
  return Array.from(new Set(String(lineup ?? "").replace(/[^0-9]/g, "").split("").filter(Boolean)));
}

function getMissingLineupRiderCarNos(race) {
  const lineupCarNos = extractLineupCarNos(race?.lineup);
  if (lineupCarNos.length === 0) return [];
  const riderCarNos = new Set((Array.isArray(race?.riders) ? race.riders : []).map((rider) => String(rider?.carNo ?? "").trim()).filter(Boolean));
  return lineupCarNos.filter((carNo) => !riderCarNos.has(carNo));
}

function hasLineupRiderShortage(race) {
  return getMissingLineupRiderCarNos(race).length > 0;
}

function scoreRiderMaterial(riders) {
  if (!Array.isArray(riders)) return 0;
  return riders.reduce((sum, rider) => {
    if (!rider || typeof rider !== "object") return sum;
    const hasValidIdentity = hasKdreamsRiderIdentity(rider);
    return sum
      + (rider.carNo ? 1 : 0)
      + (rider.name || rider.fullName ? 3 : 0)
      + (hasValidIdentity ? 8 : -6)
      + (rider.prefecture ? 1 : 0)
      + (rider.term ? 1 : 0)
      + (rider.age ? 1 : 0)
      + (rider.grade ? 1 : 0)
      + (rider.style ? 1 : 0)
      + (rider.score || rider.totalScore ? 3 : 0)
      + (rider.gearRatio ? 1 : 0)
      + (rider.s ? 1 : 0)
      + (rider.b ? 1 : 0)
      + (rider.nige || rider.escape ? 1 : 0)
      + (rider.makuri ? 1 : 0)
      + (rider.sashi ? 1 : 0)
      + (rider.mark ? 1 : 0)
      + (Array.isArray(rider.previousRaceResults) && rider.previousRaceResults.length ? 5 : 0)
      + (rider.yearlyStats ? 5 : 0)
      + (rider.sameTrackYearlyStats ? 4 : 0)
      + (rider.localFiveYearStats ? 4 : 0);
  }, 0);
}

function preferBetterRiders(primary, fallback) {
  const primaryRiders = Array.isArray(primary) ? primary : [];
  const fallbackRiders = Array.isArray(fallback) ? fallback : [];
  if (!primaryRiders.length) return fallbackRiders;
  if (!fallbackRiders.length) return primaryRiders;
  const primaryValidIdentityCount = primaryRiders.filter((rider) => hasKdreamsRiderIdentity(rider)).length;
  const fallbackValidIdentityCount = fallbackRiders.filter((rider) => hasKdreamsRiderIdentity(rider)).length;
  if (primaryValidIdentityCount !== fallbackValidIdentityCount) {
    return primaryValidIdentityCount > fallbackValidIdentityCount ? primaryRiders : fallbackRiders;
  }
  const primaryScore = scoreRiderMaterial(primaryRiders);
  const fallbackScore = scoreRiderMaterial(fallbackRiders);
  if (primaryScore !== fallbackScore) return primaryScore > fallbackScore ? primaryRiders : fallbackRiders;
  return primaryRiders.length >= fallbackRiders.length ? primaryRiders : fallbackRiders;
}

function hasKdreamsLineupMaterial(race) {
  if (!race || typeof race !== "object") return false;
  const riderCount = Array.isArray(race.riders) ? race.riders.length : 0;
  return validateLineupRaw(race.kdreamsLineupRaw, {
    riderCount,
    isGirls: Boolean(race.isGirls),
  }).valid;
}

function hasPolicyMismatchSourceNote(note) {
  const normalized = String(note ?? "");
  if (!normalized) return false;

  return Boolean(
    (!SOURCE_POLICY.netkeirin && /netkeirin (?:race_id=|odds fetch failed|result fetch failed|accepted|取得失敗)/i.test(normalized))
      || (!SOURCE_POLICY.oddspark && /oddspark (?:racelist accepted|lineup accepted|accepted|unavailable)/i.test(normalized))
      || (!SOURCE_POLICY.winticket && /winticket (?:probe found public payload markers|probe skipped|unavailable)/i.test(normalized))
  );
}

function hasMojibakeRace(race, venueName = "") {
  if (!race) return false;

  const raceTexts = [venueName, race?.venue, race?.trackName, race?.placeName, race?.title, race?.sourceNote];
  if (raceTexts.some((value) => hasMojibakeText(value))) return true;

  return (race?.riders ?? []).some((rider) => [rider?.name, rider?.prefecture, rider?.style, rider?.comment].some((value) => hasMojibakeText(value)));
}

function hasSparseKdreamsRiderFields(race) {
  const riders = Array.isArray(race?.riders) ? race.riders : [];
  if (!riders.length) return true;

  return riders.every((rider) => ![
    rider?.age,
    rider?.grade,
    rider?.style,
    rider?.score,
    rider?.gearRatio,
    rider?.s,
    rider?.b,
    rider?.comment,
  ].some((value) => String(value ?? "").trim()));
}

function hasUsableRiderMaterial(race) {
  return Array.isArray(race?.riders) && race.riders.some((rider) => hasSubstantiveRiderDetail(rider));
}

function hasLineupOddsButMissingRiders(race) {
  if (!race) return false;
  return hasLineupValue(race)
    && isRaceOddsComplete(race)
    && (!hasUsableRiderMaterial(race) || hasLineupRiderShortage(race));
}

function hasInconsistentAcceptedSource(race) {
  const sourceNote = String(race?.sourceNote ?? "");
  const charilotoAccepted = /chariloto shukai accepted/i.test(sourceNote);
  const charilotoValid = sanitizeExternalLineupRaw(race?.charilotoLineupRaw, {
    riderCount: Array.isArray(race?.riders) ? race.riders.length : 0,
  }).accepted;

  if (charilotoAccepted && !charilotoValid) return true;
  return false;
}

function getCachedRaceRefreshReason(race, venueName = "") {
  if (!race) return "";
  if (hasMojibakeRace(race, venueName)) return "mojibake cached race";
  if (hasPolicyMismatchSourceNote(race?.sourceNote)) return "source policy mismatch";
  if (hasInconsistentAcceptedSource(race)) return "inconsistent accepted source markers";
  if (hasLineupOddsButMissingRiders(race)) return "lineup/odds present but riders missing";
  if (hasLineupRiderShortage(race)) return `lineup riders incomplete (${getMissingLineupRiderCarNos(race).join(",")})`;
  if (SOURCE_POLICY.kdreams && Array.isArray(race?.riders) && race.riders.length && race.riders.some((rider) => !hasKdreamsRiderIdentity(rider))) return "kdreams rider identity incomplete";
  if (SOURCE_POLICY.kdreams && /lineFallback:\s*kdreams lineup unavailable/i.test(String(race?.sourceNote ?? "")) && hasLineupValue(race) && !hasKdreamsLineupMaterial(race)) return "kdreams lineup missing";
  if (SOURCE_POLICY.kdreams && hasSparseKdreamsRiderFields(race)) return "kdreams rider fields sparse";
  return "";
}

function sanitizeSourceNoteForPolicy(note) {
  return splitNoteParts(note)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => {
      if (!SOURCE_POLICY.netkeirin && /(netkeirin|AplRaceOdds)/i.test(part)) return false;
      if (!SOURCE_POLICY.oddspark && /oddspark/i.test(part)) return false;
      if (!SOURCE_POLICY.winticket && /winticket/i.test(part)) return false;
      return true;
    })
    .filter((part, index, parts) => parts.indexOf(part) === index)
    .join(" / ");
}

function sanitizeOddsNoteForPolicy(note) {
  const parts = splitNoteParts(note)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !(!SOURCE_POLICY.netkeirin && /netkeirin odds fetch failed|source=netkeirin|AplRaceOdds/i.test(part)));

  if (!SOURCE_POLICY.netkeirin && !parts.some((part) => /netkeirin odds disabled by source policy/i.test(part))) {
    parts.unshift("netkeirin odds disabled by source policy");
  }

  return joinUniqueNoteParts(parts);
}

function sanitizeResultNote(note) {
  return joinUniqueNoteParts(splitNoteParts(note));
}

function sanitizeRaceForCurrentPolicy(race) {
  if (!race || typeof race !== "object") return race;

  const riderCount = Array.isArray(race.riders) ? race.riders.length : 0;
  const charilotoProbe = sanitizeExternalLineupRaw(race.charilotoLineupRaw, { riderCount });
  const sanitizedSourceParts = splitNoteParts(sanitizeSourceNoteForPolicy(race.sourceNote))
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !( /chariloto shukai accepted/i.test(part) && !charilotoProbe.accepted));

  if (!charilotoProbe.accepted && String(race.charilotoLineupRaw ?? "").trim()) {
    sanitizedSourceParts.push(`lineFallback: chariloto shukai unavailable (${charilotoProbe.reason || "not lineup format"})`);
  }

  return {
    ...race,
    charilotoLineupRaw: charilotoProbe.accepted ? charilotoProbe.rawText : "",
    charilotoLineupRawDiagnostic: charilotoProbe.accepted ? (race.charilotoLineupRawDiagnostic ?? "") : (charilotoProbe.diagnosticRawText || race.charilotoLineupRawDiagnostic || ""),
    sourceNote: joinUniqueNoteParts(sanitizedSourceParts),
    oddsNote: sanitizeOddsNoteForPolicy(race.oddsNote),
    resultNote: sanitizeResultNote(race.resultNote),
  };
}

function getResultFinishOrderItems(race) {
  return Array.isArray(race?.result?.finishOrder) ? race.result.finishOrder.filter(Boolean) : [];
}

function hasStructuredFinishOrderItems(race) {
  return getResultFinishOrderItems(race).some((item) => typeof item === "object" && item && typeof item.carNo === "string" && typeof item.rank === "string");
}

function getFinishOrderCarNos(race) {
  return getResultFinishOrderItems(race)
    .map((item) => {
      if (typeof item === "string") return item;
      return String(item?.carNo ?? "").trim();
    })
    .filter(Boolean);
}

function isRaceResultComplete(race) {
  return Boolean(
    race?.resultStatus === "confirmed"
      && race?.result?.status === "confirmed"
      && Array.isArray(race?.resultTop3)
      && race.resultTop3.length === 3
      && Array.isArray(race?.payouts)
      && race.payouts.length > 0,
  );
}

function isRaceOddsComplete(race) {
  const oddsNote = String(race?.oddsNote ?? "");
  return Boolean(
    (Array.isArray(race?.oddsTrifecta) && race.oddsTrifecta.length > 0)
      || (Array.isArray(race?.oddsPreview) && race.oddsPreview.length > 0)
      || /unavailable|fetch failed|accepted/i.test(oddsNote),
  );
}

function isRaceLineupCheckedOrComplete(race) {
  if (hasLineupValue(race)) return true;

  const note = String(race?.sourceNote ?? "");
  const requiredChecks = [];

  if (SOURCE_POLICY.kdreams) requiredChecks.push(/kdreams lineup unavailable/i);
  if (SOURCE_POLICY.chariloto) requiredChecks.push(/chariloto shukai (accepted|unavailable)/i);
  if (SOURCE_POLICY.oddspark) requiredChecks.push(/oddspark lineup (accepted|unavailable)|oddspark racelist accepted/i);
  if (SOURCE_POLICY.winticket) requiredChecks.push(/winticket probe skipped|winticket .*unavailable/i);

  return requiredChecks.every((pattern) => pattern.test(note));
}

function isRaceRiderDetailCheckedOrComplete(race) {
  if (Array.isArray(race?.riders) && race.riders.some((rider) => hasSubstantiveRiderDetail(rider))) {
    if (
      !SOURCE_POLICY.kdreams
      || (
        race.riders.some((rider) => hasKdreamsRiderMaterial(rider))
        && race.riders.every((rider) => hasKdreamsRiderIdentity(rider))
      )
    ) return true;
  }

  if (hasLineupOddsButMissingRiders(race)) return false;

  const note = `${race?.sourceNote ?? ""} / ${race?.resultNote ?? ""}`;
  const requiredChecks = [];

  if (SOURCE_POLICY.kdreams) requiredChecks.push(/riderFallback:\s*kdreams detail lacks stats/i);
  if (SOURCE_POLICY.chariloto) requiredChecks.push(/riderFallback:\s*chariloto unavailable/i);
  if (SOURCE_POLICY.oddspark) requiredChecks.push(/riderFallback:\s*oddspark unavailable/i);
  if (SOURCE_POLICY.winticket) requiredChecks.push(/riderFallback:\s*winticket skipped/i);

  return requiredChecks.every((pattern) => pattern.test(note));
}

function isRaceFinishOrderCheckedOrComplete(race) {
  const finishOrder = getResultFinishOrderItems(race);
  const riderCount = Array.isArray(race?.riders) ? race.riders.length : 0;
  if (finishOrder.length > 0 && riderCount > 0 && finishOrder.length >= riderCount && hasStructuredFinishOrderItems(race)) return true;

  const note = String(race?.resultNote ?? "");
  return /allFinishOrder:/i.test(note)
    || /kdreams only top3 available/i.test(note)
    || /oddspark unavailable/i.test(note);
}

function isReusableFinalRace(race) {
  return Boolean(
    race
      && !hasMojibakeRace(race)
      && !hasPolicyMismatchSourceNote(race?.sourceNote)
      && !hasInconsistentAcceptedSource(race)
      && !hasSparseKdreamsRiderFields(race)
      && isRaceResultComplete(race)
      && String(race.time ?? "").trim()
      && String(race.title ?? "").trim()
      && Array.isArray(race.riders)
      && race.riders.length >= 1
      && race.riders.some((rider) => hasSubstantiveRiderDetail(rider))
      && !hasLineupRiderShortage(race)
      && hasLineupValue(race)
      && isRaceLineupCheckedOrComplete(race)
      && isRaceRiderDetailCheckedOrComplete(race)
      && isRaceFinishOrderCheckedOrComplete(race)
      && isRaceOddsComplete(race),
  );
}

function getReusableFinalRaceSkipReason(race) {
  if (!race || race.resultStatus !== "confirmed" || race.result?.status !== "confirmed") return "";

  if (hasMojibakeRace(race)) return "mojibake detected";
  if (hasLineupOddsButMissingRiders(race)) return "lineup/odds present but riders missing";
  if (hasLineupRiderShortage(race)) return `lineup riders incomplete (${getMissingLineupRiderCarNos(race).join(",")})`;
  if (hasSparseKdreamsRiderFields(race)) return "rider material empty after kdreams decode fix";
  if (hasPolicyMismatchSourceNote(race?.sourceNote)) return "source policy mismatch note detected";
  if (hasInconsistentAcceptedSource(race)) return "accepted source note inconsistent with saved raw";
  if (!isRaceResultComplete(race)) return "result incomplete";
  if (!hasLineupValue(race)) return "lineup material unavailable";
  if (!Array.isArray(race?.riders) || !race.riders.some((rider) => hasSubstantiveRiderDetail(rider))) return "rider material unavailable";
  if (SOURCE_POLICY.kdreams && race.riders.some((rider) => !hasKdreamsRiderMaterial(rider))) return "kdreams rider material unavailable";
  if (!isRaceLineupCheckedOrComplete(race)) return "lineup not checked by chariloto";
  if (!isRaceRiderDetailCheckedOrComplete(race)) return "rider detail not checked";
  if (!isRaceFinishOrderCheckedOrComplete(race)) {
    const finishOrderCount = getResultFinishOrderItems(race).length;
    const riderCount = Array.isArray(race?.riders) ? race.riders.length : 0;
    return `finishOrder incomplete without note finishOrder=${finishOrderCount} riders=${riderCount}`;
  }
  if (!isRaceOddsComplete(race)) return "odds incomplete";

  return "";
}

function prepareCachedRaceForReuse(cachedRace, raceNo) {
  const cacheNote = "reused finalized race from previous generated feed";
  const cacheMarker = "cache: reused finalized race";
  const sanitizedRace = sanitizeRaceForCurrentPolicy(cachedRace);

  return {
    ...sanitizedRace,
    raceNo,
    sourceNote: appendNote(sanitizedRace?.sourceNote, cacheMarker),
    oddsNote: appendNote(sanitizedRace?.oddsNote, cacheMarker),
    resultNote: appendNote(sanitizedRace?.resultNote, cacheMarker),
    cacheNote: appendNote(sanitizedRace?.cacheNote, cacheNote),
  };
}

function isVenueInPhaseSession(venue, updatePhase) {
  return updatePhase.session === "all" || venue?.session === updatePhase.session;
}

function shouldFetchLineupForRace(race, venue, updatePhase) {
  if (!isVenueInPhaseSession(venue, updatePhase)) return false;
  if (!(["lineup", "backfill", "final"].includes(updatePhase.phase))) return false;
  return !hasLineupValue(race) || !isRaceLineupCheckedOrComplete(race);
}

function shouldFetchRiderDetailForRace(race, venue, updatePhase) {
  if (!isVenueInPhaseSession(venue, updatePhase)) return false;
  const riderMissing =
    !Array.isArray(race?.riders)
    || !race.riders.some((rider) => hasSubstantiveRiderDetail(rider))
    || hasLineupRiderShortage(race)
    || (SOURCE_POLICY.kdreams && race.riders.some((rider) => !hasKdreamsRiderIdentity(rider)))
    || (SOURCE_POLICY.kdreams && race.riders.some((rider) => !hasKdreamsRiderMaterial(rider)))
    || !isRaceRiderDetailCheckedOrComplete(race);
  if (!riderMissing) return false;
  if (["lineup", "backfill", "final"].includes(updatePhase.phase)) return true;
  if (updatePhase.phase === "result") {
    console.log(`[fetch] ${venue?.venue ?? ""} riders missing; kdreams detail/racecard`);
    return true;
  }
  return false;
}

function shouldFetchOddsForRace(race, venue, updatePhase) {
  if (!isVenueInPhaseSession(venue, updatePhase)) return false;
  if (["result", "backfill", "final"].includes(updatePhase.phase)) return true;
  if (isRaceOddsComplete(race)) return false;
  if (updatePhase.phase === "odds") return true;
  return false;
}

function shouldFetchResultForRace(race, venue, updatePhase) {
  if (!["result", "final", "backfill", "odds", "lineup"].includes(updatePhase.phase)) return false;
  if (!isVenueInPhaseSession(venue, updatePhase) && !["final", "backfill", "result"].includes(updatePhase.phase)) return false;
  if (!race) return ["result", "final", "backfill"].includes(updatePhase.phase);
  if (race.resultStatus !== "confirmed" || race.result?.status !== "confirmed") return true;
  return !isRaceFinishOrderCheckedOrComplete(race) || !isRaceResultComplete(race);
}

function normalizeScheduleVenueName(value) {
  const normalized = String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/競輪場|競輪/g, "")
    .trim();

  const aliases = new Map([
    ["伊東温泉", "伊東"],
    ["ito-onsen", "伊東"],
    ["itoonsen", "伊東"],
    ["ito", "伊東"],
    ["iwakitaira", "いわき平"],
    ["iwaki-daira", "いわき平"],
    ["oogaki", "大垣"],
    ["ogaki", "大垣"],
    ["houhu", "防府"],
    ["hofu", "防府"],
  ]);

  return aliases.get(normalized) ?? normalized;
}

const VENUE_SCHEDULE_RANGE_OVERRIDES = [
  { targetDate: "2026-05-22", venue: "大宮", grade: "F2", startDate: "2026-05-22", endDate: "2026-05-24" },
  { targetDate: "2026-05-22", venue: "宇都宮", grade: "F1", startDate: "2026-05-21", endDate: "2026-05-23" },
  { targetDate: "2026-05-22", venue: "大垣", grade: "F1", startDate: "2026-05-20", endDate: "2026-05-22" },
  { targetDate: "2026-05-22", venue: "奈良", grade: "F2", startDate: "2026-05-20", endDate: "2026-05-22" },
  { targetDate: "2026-05-22", venue: "松山", grade: "F1", startDate: "2026-05-20", endDate: "2026-05-22" },
  { targetDate: "2026-05-22", venue: "平塚", grade: "F2", startDate: "2026-05-22", endDate: "2026-05-24" },
  { targetDate: "2026-05-22", venue: "岐阜", grade: "F2", startDate: "2026-05-22", endDate: "2026-05-24" },
  { targetDate: "2026-05-22", venue: "広島", grade: "F2", startDate: "2026-05-22", endDate: "2026-05-24" },
];

function normalizeVenueScheduleGrade(value) {
  const normalized = String(value ?? "").normalize("NFKC").replace(/\s+/g, "").toUpperCase();
  if (normalized === "G1") return "GI";
  if (normalized === "G2") return "GII";
  if (normalized === "G3") return "GIII";
  return normalized;
}

function resolveVenueScheduleRangeOverride(venueName, grade, todayIso) {
  const normalizedVenue = normalizeScheduleVenueName(venueName);
  const normalizedGrade = normalizeVenueScheduleGrade(grade);

  return VENUE_SCHEDULE_RANGE_OVERRIDES.find((item) =>
    item.targetDate === todayIso &&
    normalizeScheduleVenueName(item.venue) === normalizedVenue &&
    (!normalizedGrade || normalizeVenueScheduleGrade(item.grade) === normalizedGrade)
  ) ?? null;
}

function resolveVenueScheduleRange(scheduleData, venueName, todayIso, grade = "") {
  const normalizedVenue = normalizeScheduleVenueName(venueName);
  const normalizedGrade = normalizeVenueScheduleGrade(grade);

  const candidates = scheduleData
    .filter((item) => normalizeScheduleVenueName(item.venue) === normalizedVenue)
    .filter((item) => item.startDate <= todayIso && item.endDate >= todayIso)
    .sort((a, b) => {
      const aGradeMatches = normalizedGrade && normalizeVenueScheduleGrade(a.grade) === normalizedGrade ? 1 : 0;
      const bGradeMatches = normalizedGrade && normalizeVenueScheduleGrade(b.grade) === normalizedGrade ? 1 : 0;
      if (aGradeMatches !== bGradeMatches) return bGradeMatches - aGradeMatches;
      const aLength = (new Date(`${a.endDate}T00:00:00+09:00`).getTime() - new Date(`${a.startDate}T00:00:00+09:00`).getTime());
      const bLength = (new Date(`${b.endDate}T00:00:00+09:00`).getTime() - new Date(`${b.startDate}T00:00:00+09:00`).getTime());
      return bLength - aLength || b.startDate.localeCompare(a.startDate);
    });

  const matched = candidates[0] ?? null;
  const override = matched ? null : resolveVenueScheduleRangeOverride(venueName, grade, todayIso);

  return {
    startDate: matched?.startDate ?? override?.startDate ?? "",
    endDate: matched?.endDate ?? override?.endDate ?? "",
  };
}

function resolveRaceEventDay({ feedDate, startDate, endDate }) {
  const start = new Date(`${startDate}T00:00:00+09:00`);
  const end = new Date(`${endDate}T00:00:00+09:00`);
  const target = new Date(`${feedDate}T00:00:00+09:00`);
  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    Number.isNaN(target.getTime()) ||
    end.getTime() < start.getTime()
  ) {
    return { dayNumber: null, isFinalDay: false, label: null };
  }

  const dayNumber = Math.floor((target.getTime() - start.getTime()) / 86400000) + 1;
  const totalDays = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  if (dayNumber < 1 || dayNumber > totalDays) {
    return { dayNumber: null, isFinalDay: false, label: null };
  }

  const isFinalDay = feedDate === endDate;
  const label = dayNumber === 1
    ? isFinalDay
      ? "初日・最終日"
      : "初日"
    : isFinalDay
      ? `${dayNumber}日目・最終日`
      : `${dayNumber}日目`;

  return { dayNumber, isFinalDay, label };
}

function parseKdreamsTodayVenues(html, todayIso, scheduleData, operationUpdatedAt) {
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
    const rowText = cleanCellText(rowHtml);

    const venueText = stripTags(venueCell).replace(/競輪$/, "").trim();
    const venueOperation = normalizeOperationStatus(rowText, "scheduled");
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
      racecardOperationStatus: "scheduled",
      racecardOperationLabel: "",
      racecardOperationReason: "",
      racecardOperationSource: "kdreams:racecard",
      racecardOperationUpdatedAt: operationUpdatedAt,
    }));

    const listLink = linksCell.match(/href="https:\/\/keirin\.kdreams\.jp\/([^/]+)\/racecard\/(\d+)\/"[^>]*>一覧<\/a>/i);
    const slug = listLink?.[1] ?? detailLinks[0]?.slug ?? "";
    const cardId = listLink?.[2] ?? "";
    const venueCode = detailLinks[0]?.raceId?.slice(0, 2) ?? cardId.slice(0, 2) ?? venueCodeFromLinks;
    const { startDate: resolvedStartDate, endDate: resolvedEndDate } =
      resolveVenueScheduleRange(scheduleData, venueText, todayIso, grade);
    const eventDay = resolveRaceEventDay({
      feedDate: todayIso,
      startDate: resolvedStartDate,
      endDate: resolvedEndDate,
    });

    parseRows.push({
      venue: venueText,
      slug,
      venueCode,
      grade,
      session,
      hasGirls,
      venueOperationStatus: venueOperation.status,
      venueOperationLabel: venueOperation.label,
      venueOperationReason: venueOperation.reason,
      venueOperationSource: "kdreams:racecard",
      venueOperationUpdatedAt: operationUpdatedAt,
      venueOperationRaw: venueOperation.raw,
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
      eventStartDate: resolvedStartDate,
      eventEndDate: resolvedEndDate,
      eventDayNumber: eventDay.dayNumber,
      eventDayLabel: eventDay.label,
      session,
      hasGirls,
      note: "Kドリームス出走表一覧から自動生成",
      raceNos: detailLinks.map((item) => item.raceNo),
      venueOperationStatus: venueOperation.status,
      venueOperationLabel: venueOperation.label,
      venueOperationReason: venueOperation.reason,
      venueOperationSource: "kdreams:racecard",
      venueOperationUpdatedAt: operationUpdatedAt,
      venueOperationRaw: venueOperation.raw,
      raceIds: detailLinks.map((item) => item.raceId),
      raceDetailLinks: detailLinks,
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

function getExternalLineupMinCars(riderCount = 0) {
  if (riderCount >= 9) return 7;
  if (riderCount >= 7) return 5;
  if (riderCount >= 5) return 4;
  if (riderCount >= 3) return 3;
  return 5;
}

function sanitizeExternalLineupRaw(rawText, options = {}) {
  const normalizedRawText = normalizeLineupRawText(rawText);
  const riderCount = Number.isFinite(options.riderCount) ? Number(options.riderCount) : 0;
  const cars = Array.from(new Set(extractLineupRawCars(normalizedRawText)));
  const minCars = getExternalLineupMinCars(riderCount);

  if (!normalizedRawText) {
    return {
      accepted: false,
      rawText: "",
      diagnosticRawText: "",
      reason: "empty",
    };
  }

  if (cars.length < minCars) {
    return {
      accepted: false,
      rawText: "",
      diagnosticRawText: normalizedRawText,
      reason: `too short raw=${normalizedRawText}`,
    };
  }

  return {
    accepted: true,
    rawText: normalizedRawText,
    diagnosticRawText: "",
    reason: "",
  };
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

function isStrictTrifectaCombination(combination) {
  return /^[1-9]-[1-9]-[1-9]$/.test(String(combination ?? ""));
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

async function writeKdreamsResultSampleDebugFiles(kdreamsRaceId, html, payload) {
  await fs.mkdir(DEBUG_ODDS_DIR, { recursive: true });
  await fs.writeFile(path.join(DEBUG_ODDS_DIR, `kdreams-result-sample-${kdreamsRaceId}.html`), html, "utf-8");
  await fs.writeFile(path.join(DEBUG_ODDS_DIR, `kdreams-result-sample-${kdreamsRaceId}.txt`), `${stripTags(html)}\n`, "utf-8");
  await fs.writeFile(path.join(DEBUG_ODDS_DIR, `kdreams-result-sample-${kdreamsRaceId}.json`), `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

async function writeExternalProbeDebugFiles(prefix, key, html, payload) {
  await fs.mkdir(DEBUG_ODDS_DIR, { recursive: true });
  await fs.writeFile(path.join(DEBUG_ODDS_DIR, `${prefix}-${key}.html`), html, "utf-8");
  await fs.writeFile(path.join(DEBUG_ODDS_DIR, `${prefix}-${key}.txt`), `${stripTags(html)}\n`, "utf-8");
  await fs.writeFile(path.join(DEBUG_ODDS_DIR, `${prefix}-${key}.json`), `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
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

function createPendingRaceResultData(resultNote = "") {
  return {
    resultStatus: "pending",
    resultNote,
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
}

function createEmptyRaceOddsData() {
  return {
    oddsPreview: [],
    oddsTrifecta: [],
    finalTrifectaFavorite: null,
    topOdds: null,
    topTrifectaOdds: null,
    favoriteOdds: null,
    favoriteCombination: "",
    oddsNote: "",
  };
}

function createFinishOrderItem(entry, overrides = {}) {
  const rank = String(overrides.rank ?? entry?.place ?? "").trim();
  const status = String(overrides.status ?? (/失格|落車|欠車|棄権|失/i.test(rank) ? rank : "")).trim();
  return {
    rank,
    carNo: String(overrides.carNo ?? entry?.carNo ?? "").trim(),
    name: String(overrides.name ?? entry?.name ?? "").trim(),
    agari: String(overrides.agari ?? entry?.agari ?? "").trim(),
    gap: String(overrides.gap ?? entry?.margin ?? "").trim(),
    kimarite: String(overrides.kimarite ?? entry?.kimarite ?? "").trim(),
    mark: String(overrides.mark ?? "").trim(),
    status,
  };
}

function buildTop3FromFinishOrderItems(items) {
  return (items ?? [])
    .filter((item) => item?.carNo && /^[0-9]+$/.test(String(item.rank ?? "")))
    .slice(0, 3)
    .map((item, index) => ({
      place: String(index + 1),
      carNo: item.carNo,
      name: item.name,
      margin: item.gap,
      agari: item.agari,
      kimarite: item.kimarite,
      sMark: String(item.mark ?? "").includes("S"),
      hMark: String(item.mark ?? "").includes("H"),
      bMark: String(item.mark ?? "").includes("B"),
    }));
}

function appendUniqueNote(base, note) {
  return joinUniqueNoteParts([...splitNoteParts(base), ...splitNoteParts(note)]);
}

function createExternalRaceProbeResult(source, url, note = "") {
  return {
    source,
    ok: false,
    url,
    lineupRaw: "",
    lineupRawDiagnostic: "",
    lineupNote: "",
    riders: [],
    finishOrder: [],
    payouts: [],
    oddsTrifecta: [],
    note,
  };
}

function buildCharilotoRaceDetailUrl(date, venueCode, raceNo) {
  return `${CHARILOTO_ATHLETES_URL}/${date}/${venueCode}/${raceNo}`;
}

function extractCharilotoLineupRaw(html) {
  const sectionHtml = matchOne(html, [
    /<th[^>]*>周回予想<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/i,
  ]);

  if (!sectionHtml) return "";

  const squares = Array.from(sectionHtml.matchAll(/square-slim bg-([1-9])/gi)).map((match) => match[1]);
  if (squares.length > 0) return squares.join(" ");

  return stripTags(sectionHtml)
    .replace(/[←→]/g, " ")
    .replace(/[・/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchCharilotoRaceDetailFallback({ date, venueCode, raceNo, venueName = "" }) {
  const url = buildCharilotoRaceDetailUrl(date, venueCode, raceNo);

  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0",
        "accept-language": "ja-JP,ja;q=0.9,en;q=0.8",
      },
    });

    if (!response.ok) {
      const note = `lineFallback: chariloto shukai unavailable (${response.status})`;
      console.log(`[source-probe] chariloto ${venueName || venueCode} ${raceNo}R lineup unavailable status=${response.status}`);
      return createExternalRaceProbeResult("chariloto", url, note);
    }

    const html = await response.text();
    const lineupProbe = sanitizeExternalLineupRaw(extractCharilotoLineupRaw(html));
    const note = lineupProbe.accepted
      ? "lineFallback: chariloto shukai accepted"
      : `lineFallback: chariloto shukai unavailable (${lineupProbe.reason || "not lineup format"})`;

    if (!savedCharilotoProbeDebugSample) {
      savedCharilotoProbeDebugSample = true;
      await writeExternalProbeDebugFiles("chariloto-probe", `${date}-${venueCode}-${raceNo}`, html, {
        source: "chariloto",
        url,
        lineupRaw: lineupProbe.rawText,
        lineupRawDiagnostic: lineupProbe.diagnosticRawText,
        note,
      });
    }

    console.log(`[source-probe] chariloto ${venueName || venueCode} ${raceNo}R lineup ${lineupProbe.accepted ? "accepted" : "unavailable"}`);
    return {
      source: "chariloto",
      ok: lineupProbe.accepted,
      url,
      lineupRaw: lineupProbe.rawText,
      lineupRawDiagnostic: lineupProbe.diagnosticRawText,
      lineupNote: note,
      riders: [],
      finishOrder: [],
      payouts: [],
      oddsTrifecta: [],
      note,
    };
  } catch (error) {
    const note = `lineFallback: chariloto shukai unavailable (${error instanceof Error ? error.message : String(error)})`;
    console.log(`[source-probe] chariloto ${venueName || venueCode} ${raceNo}R lineup unavailable`);
    return createExternalRaceProbeResult("chariloto", url, note);
  }
}

function buildOddsParkRaceInfoUrl(date, venueCode, raceNo) {
  const compact = compactDate(date);
  return `${ODDSPARK_RACE_INFO_URL}?kaisaiBi=${compact}&joCode=${venueCode}&joCd=${venueCode}&raceNo=${raceNo}`;
}

function buildOddsParkRaceResultUrl(date, venueCode, raceNo) {
  const compact = compactDate(date);
  return `${ODDSPARK_RACE_RESULT_URL}?kaisaiBi=${compact}&joCode=${venueCode}&joCd=${venueCode}&raceNo=${raceNo}`;
}

function extractOddsParkLineupRaw(html) {
  const tableHtml = matchOne(html, [
    /<h4[^>]*>並び予想<\/h4>\s*<table[^>]*class="narabi-table"[^>]*>([\s\S]*?)<\/table>/i,
  ]);
  if (!tableHtml) return "";

  const rows = Array.from(tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)).map((match) => match[1]);
  const groups = rows
    .map((rowHtml) => [...rowHtml.matchAll(/num0?([1-9])\.svg/gi)].map((match) => match[1]).join(""))
    .filter(Boolean);

  return groups.join(" ").trim();
}

function extractOddsParkRiders(html) {
  const tableHtml = matchOne(html, [
    /<table[^>]*class="raceTable01[^"]*"[^>]*>([\s\S]*?)<\/table>/i,
  ]);
  if (!tableHtml) return [];

  const rows = Array.from(tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)).map((match) => match[1]);
  const riders = [];

  for (const rowHtml of rows) {
    const cells = Array.from(rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)).map((match) => stripTags(match[1]));
    if (cells.length < 13 || !/^\d+$/.test(cells[1] ?? "")) continue;

    const carNo = (cells[1] ?? "").trim();
    const nameCell = (cells[2] ?? "").replace(/\s+/g, " ").trim();
    const name = nameCell.replace(/\s*\([0-9]{1,2}歳\).*$/, "").trim();
    const age = matchOne(nameCell, [/\(([0-9]{1,2})歳\)/]);
    const meta = nameCell.split(")")[1] ?? "";
    const prefecture = matchOne(meta, [/^\s*([^/]+?)\s*\//]);
    const term = matchOne(meta, [/\/\s*([0-9]{1,3})期\s*\//]);
    const grade = matchOne(meta, [/\/\s*([^/]+)$/]);

    riders.push({
      carNo,
      name,
      prefecture: prefecture.replace(/\s+/g, ""),
      age,
      term,
      grade: grade.replace(/\s+/g, ""),
      style: "",
      score: (cells[3] ?? "").trim(),
      s: (cells[11] ?? "").trim(),
      b: (cells[13] ?? "").trim(),
      nige: (cells[7] ?? "").trim(),
      escape: (cells[7] ?? "").trim(),
      makuri: (cells[8] ?? "").trim(),
      sashi: (cells[9] ?? "").trim(),
      mark: (cells[10] ?? "").trim(),
      wins: "",
      seconds: "",
      thirds: "",
      loses: "",
      winRate: "",
      quinellaRate: "",
      trifectaRate: "",
      gearRatio: "",
      comment: "",
    });
  }

  return riders;
}

function extractOddsParkPayouts(html) {
  const tableHtml = matchOne(html, [
    /<table[^>]*class="payTable01[^"]*"[^>]*>([\s\S]*?)<\/table>/i,
    /<table[\s\S]*?<th[^>]*>2車単<\/th>[\s\S]*?<\/table>/i,
  ]);
  if (!tableHtml) return [];

  const rows = Array.from(tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)).map((match) => match[1]);
  const payouts = [];
  let currentBetType = "";

  for (const rowHtml of rows) {
    const thText = normalizeNetkeirinBetType(stripTags(matchOne(rowHtml, [/<th[^>]*>([\s\S]*?)<\/th>/i])));
    if (thText) currentBetType = thText;

    const cells = Array.from(rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)).map((match) => stripTags(match[1]).replace(/\s+/g, " ").trim());
    const combination = normalizeNetkeirinPayoutCombination(cells[0] ?? "");
    const payout = (cells[1] ?? "").trim();
    const popularity = (cells[2] ?? "").trim();
    if (!currentBetType || !combination || !payout) continue;
    payouts.push({ betType: currentBetType, combination, payout, popularity });
  }

  return payouts;
}

function extractOddsParkResultRows(html) {
  const tableHtml = matchOne(html, [
    /<table[\s\S]*?<th>着順<\/th>[\s\S]*?<\/table>/i,
  ]);
  if (!tableHtml) return [];

  const rows = Array.from(tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)).map((match) => match[1]);
  const resultRows = [];

  for (const rowHtml of rows) {
    const cells = Array.from(rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)).map((match) => stripTags(match[1]).replace(/\s+/g, " ").trim());
    if (cells.length < 5 || !/^\d+$/.test(cells[0] ?? "")) continue;

    const place = (cells[0] ?? "").trim();
    const carNo = (cells[2] ?? "").trim();
    const nameCell = (cells[3] ?? "").trim();
    const detailCell = (cells[4] ?? "").trim();
    const agari = matchOne(detailCell, [/([0-9]{1,2}\.[0-9])/]);
    const beforeAgari = agari ? detailCell.split(agari)[0].replace(/\s+/g, "") : detailCell.replace(/\s+/g, "");
    const marks = matchOne(detailCell, [/\(([BS]+)\)$/i]).toUpperCase();

    resultRows.push({
      place,
      carNo,
      name: nameCell.replace(/\s*\([0-9]{1,2}歳\).*$/, "").trim(),
      margin: place === "1" ? "" : beforeAgari,
      agari,
      kimarite: place === "1" ? beforeAgari : "",
      sMark: marks.includes("S"),
      hMark: false,
      bMark: marks.includes("B"),
    });
  }

  return resultRows;
}

function extractOddsParkResultData(html) {
  const rows = extractOddsParkResultRows(html);
  const payouts = extractOddsParkPayouts(html);
  const finishOrder = rows.map((item) => createFinishOrderItem(item, {
    rank: item.place,
    gap: item.margin,
    mark: `${item.sMark ? "S" : ""}${item.hMark ? "H" : ""}${item.bMark ? "B" : ""}`,
  }));
  const top3 = rows.slice(0, 3);
  const result = {
    ...createPendingRaceResultData().result,
    status: top3.length >= 3 && payouts.length > 0 ? "confirmed" : "pending",
    finishOrder,
    kimarite: top3[0]?.kimarite ?? "",
    secondKimarite: "",
    sLeaderCarNo: rows.find((item) => item.sMark)?.carNo ?? "",
    hLeaderCarNo: "",
    bLeaderCarNo: rows.find((item) => item.bMark)?.carNo ?? "",
    payout2tan: pickNetkeirinPayoutItem(payouts, ["2車単", "二車単"]),
    payout2fuku: pickNetkeirinPayoutItem(payouts, ["2車複", "二車複"], true),
    payout3tan: pickNetkeirinPayoutItem(payouts, ["3連単", "三連単"]),
    payout3fuku: pickNetkeirinPayoutItem(payouts, ["3連複", "三連複"]),
    payoutWide: pickNetkeirinPayoutItem(payouts, ["ワイド"], true),
    finalizedAt: "",
  };

  return {
    resultTop3: top3,
    finishOrder,
    payouts,
    result,
  };
}

async function fetchOddsParkRaceListFallback({ date, venueCode, venueName = "" }) {
  const url = `${ODDSPARK_RACE_LIST_URL}?joCd=${venueCode}&kaisaiBi=${compactDate(date)}`;

  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0",
        "accept-language": "ja-JP,ja;q=0.9,en;q=0.8",
      },
    });

    if (!response.ok) {
      return createExternalRaceProbeResult("oddspark", url, `resultFallback: oddspark unavailable (${response.status})`);
    }

    const html = await response.text();
    const raceBlocks = Array.from(html.matchAll(/<div class="raceListPart" id="no(\d+)">([\s\S]*?)<\/div><!-- \/\/raceListPart -->/gi)).map((match) => ({
      raceNo: Number(match[1]),
      html: match[2],
      hasResult: /KRList_toPay/.test(match[2]),
      hasCard: /KRList_toEnt/.test(match[2]),
      hasOdds: /KRList_toOdd/.test(match[2]),
    }));

    if (!savedOddsParkProbeDebugSample) {
      savedOddsParkProbeDebugSample = true;
      await writeExternalProbeDebugFiles("oddspark-racelist-probe", `${compactDate(date)}-${venueCode}`, html, {
        source: "oddspark",
        url,
        raceBlocks,
      });
    }

    return {
      source: "oddspark",
      ok: raceBlocks.length > 0,
      url,
      lineupRaw: "",
      riders: [],
      finishOrder: [],
      payouts: [],
      oddsTrifecta: [],
      note: raceBlocks.length > 0 ? "oddspark racelist accepted" : "oddspark racelist unavailable",
      raceBlocks,
    };
  } catch (error) {
    return createExternalRaceProbeResult("oddspark", url, `resultFallback: oddspark unavailable (${error instanceof Error ? error.message : String(error)})`);
  }
}

async function fetchOddsParkRaceDetailFallback({ date, venueCode, raceNo, venueName = "" }) {
  const infoUrl = buildOddsParkRaceInfoUrl(date, venueCode, raceNo);
  const resultUrl = buildOddsParkRaceResultUrl(date, venueCode, raceNo);

  const result = {
    source: "oddspark",
    ok: false,
    url: resultUrl,
    lineupRaw: "",
    lineupRawDiagnostic: "",
    lineupNote: "",
    riders: [],
    finishOrder: [],
    payouts: [],
    oddsTrifecta: [],
    note: "resultFallback: oddspark unavailable",
  };

  try {
    const raceListProbe = await fetchOddsParkRaceListFallback({ date, venueCode, venueName });
    const targetRaceBlock = Array.isArray(raceListProbe.raceBlocks)
      ? raceListProbe.raceBlocks.find((item) => item.raceNo === raceNo)
      : null;
    if (!targetRaceBlock?.hasResult) {
      return {
        ...result,
        note: appendUniqueNote(raceListProbe.note, "resultFallback: oddspark unavailable"),
      };
    }

    const [infoResponse, resultResponse] = await Promise.all([
      fetch(infoUrl, {
        headers: {
          "user-agent": "Mozilla/5.0",
          "accept-language": "ja-JP,ja;q=0.9,en;q=0.8",
        },
      }),
      fetch(resultUrl, {
        headers: {
          "user-agent": "Mozilla/5.0",
          "accept-language": "ja-JP,ja;q=0.9,en;q=0.8",
        },
      }),
    ]);

    const infoHtml = infoResponse.ok ? await infoResponse.text() : "";
    const resultHtml = resultResponse.ok ? await resultResponse.text() : "";
    const riders = infoHtml ? extractOddsParkRiders(infoHtml) : [];
    const lineupProbe = sanitizeExternalLineupRaw(infoHtml ? extractOddsParkLineupRaw(infoHtml) : "", {
      riderCount: riders.length,
    });
    const resultData = resultHtml ? extractOddsParkResultData(resultHtml) : { resultTop3: [], finishOrder: [], payouts: [], result: createPendingRaceResultData().result };
    const ok = resultData.finishOrder.length >= 3 && resultData.payouts.length > 0;
    const note = ok
      ? `resultFallback: oddspark accepted / allFinishOrder: oddspark full order accepted count=${resultData.finishOrder.length}`
      : "resultFallback: oddspark unavailable";
    const lineupNote = lineupProbe.accepted
      ? "lineFallback: oddspark lineup accepted"
      : `lineFallback: oddspark lineup unavailable (${lineupProbe.reason || "not lineup format"})`;

    if (!savedOddsParkProbeDebugSample && resultHtml) {
      savedOddsParkProbeDebugSample = true;
      await writeExternalProbeDebugFiles("oddspark-race-probe", `${compactDate(date)}-${venueCode}-${raceNo}`, resultHtml, {
        source: "oddspark",
        infoUrl,
        resultUrl,
        lineupRaw: lineupProbe.rawText,
        lineupRawDiagnostic: lineupProbe.diagnosticRawText,
        riderCount: riders.length,
        finishOrder: resultData.finishOrder,
        payoutCount: resultData.payouts.length,
      });
    }

    console.log(`[source-probe] oddspark ${venueName || venueCode} ${raceNo}R result ${ok ? "accepted" : "unavailable"}`);
    return {
      source: "oddspark",
      ok,
      url: resultUrl,
      infoUrl,
      lineupRaw: lineupProbe.rawText,
      lineupRawDiagnostic: lineupProbe.diagnosticRawText,
      lineupNote,
      riders,
      finishOrder: resultData.finishOrder,
      payouts: resultData.payouts,
      oddsTrifecta: [],
      note,
      resultTop3: resultData.resultTop3,
      result: resultData.result,
    };
  } catch (error) {
    console.log(`[source-probe] oddspark ${venueName || venueCode} ${raceNo}R result unavailable`);
    return {
      ...result,
      note: `resultFallback: oddspark unavailable (${error instanceof Error ? error.message : String(error)})`,
    };
  }
}

async function fetchWinticketRaceFallback({ date, venueCode, raceNo, venueName = "" }) {
  const url = WINTICKET_KEIRIN_URL;

  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0",
        "accept-language": "ja-JP,ja;q=0.9,en;q=0.8",
      },
    });

    if (!response.ok) {
      console.log(`[source-probe] winticket ${venueName || venueCode} ${raceNo}R riders unavailable`);
      return createExternalRaceProbeResult("winticket", url, `winticket probe skipped: status ${response.status}`);
    }

    const html = await response.text();
    const hasPublicPayload = /__NEXT_DATA__|\/api\//.test(html);
    const note = hasPublicPayload
      ? "winticket probe found public payload markers"
      : "winticket probe skipped: js app no public payload";

    if (!savedWinticketProbeDebugSample) {
      savedWinticketProbeDebugSample = true;
      await writeExternalProbeDebugFiles("winticket-probe", `${compactDate(date)}-${venueCode}-${raceNo}`, html, {
        source: "winticket",
        url,
        hasPublicPayload,
        note,
      });
    }

    console.log(`[source-probe] winticket ${venueName || venueCode} ${raceNo}R riders ${hasPublicPayload ? "accepted" : "unavailable"}`);
    return createExternalRaceProbeResult("winticket", url, note);
  } catch (error) {
    console.log(`[source-probe] winticket ${venueName || venueCode} ${raceNo}R riders unavailable`);
    return createExternalRaceProbeResult("winticket", url, `winticket probe skipped: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function convertExternalProbeToRaceDetail(raceNo, probe) {
  const base = createEmptyRaceDetail(raceNo, probe.note || `${probe.source} unavailable`);
  const lineupValidation = validateLineupRaw(probe.lineupRaw, {
    riderCount: Array.isArray(probe.riders) ? probe.riders.length : 0,
  });

  return {
    ...base,
    lineup: lineupValidation.valid ? lineupValidation.normalizedRawText : "",
    charilotoLineupRaw: probe.source === "chariloto" ? probe.lineupRaw || "" : "",
    charilotoLineupRawDiagnostic: probe.source === "chariloto" ? probe.lineupRawDiagnostic || "" : "",
    oddsparkLineupRaw: probe.source === "oddspark" ? probe.lineupRaw || "" : "",
    oddsparkLineupRawDiagnostic: probe.source === "oddspark" ? probe.lineupRawDiagnostic || "" : "",
    winticketLineupRaw: probe.source === "winticket" ? probe.lineupRaw || "" : "",
    riders: Array.isArray(probe.riders) ? probe.riders : [],
  };
}

function extractNetkeirinResultData(html) {
  const resultRows = extractNetkeirinResultTop3(html);
  const resultTop3 = resultRows.slice(0, 3);
  const payoutExtraction = extractNetkeirinPayouts(html);
  const payouts = payoutExtraction.payouts;
  const isConfirmed = resultTop3.length > 0 || payouts.length > 0 || /レースが確定しました/.test(html);
  const finishOrder = resultRows.map((item) => createFinishOrderItem(item, {
    rank: item.place,
    gap: item.margin,
    mark: `${item.sMark ? "S" : ""}${item.hMark ? "H" : ""}${item.bMark ? "B" : ""}`,
  }));
  const sLeaderCarNo = getNetkeirinLeaderCarNoFromRows(resultRows, "sMark");
  const hLeaderCarNo = getNetkeirinLeaderCarNoFromRows(resultRows, "hMark");
  const bLeaderCarNo = getNetkeirinLeaderCarNoFromRows(resultRows, "bMark");
const result = {
  status: isConfirmed ? "confirmed" : "pending",
  finishOrder,
  kimarite: resultTop3[0]?.kimarite ?? "",
  secondKimarite: resultTop3[1]?.kimarite ?? "",
  sLeaderCarNo,
  hLeaderCarNo,
  bLeaderCarNo,
  payout2tan: pickNetkeirinPayoutItem(payouts, ["2車単", "二車単"]),
  payout2fuku: pickNetkeirinPayoutItem(payouts, ["2車複", "二車複"], true),
  payout3tan: pickNetkeirinPayoutItem(payouts, ["3連単", "三連単"]),
  payout3fuku: pickNetkeirinPayoutItem(payouts, ["3連複", "三連複"]),
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

function extractKdreamsRaceTime(html) {
  return matchOne(html, [
    /<dt[^>]*class="start"[^>]*>\s*発走予定\s*<\/dt>\s*<dd[^>]*>([0-9]{1,2}:[0-9]{2})<\/dd>/i,
    /発走予定[\s\S]{0,80}?([0-9]{1,2}:[0-9]{2})/i,
  ]);
}

function extractKdreamsRaceTitle(html) {
  const headline = cleanCellText(matchOne(html, [
    /<h2[^>]*>([\s\S]*?)<\/h2>/i,
  ]));

  const raceType = cleanCellText(matchOne(html, [
    /<title>[\s\S]*?\d{1,2}R\s+([^|]+?)\s+\|\s+\d{4}年/i,
    /<meta[^>]+property="og:title"[^>]+content="[^"]*?\d{1,2}R\s+([^"|]+?)\s+\|\s+\d{4}年/i,
  ])).normalize("NFKC");

  if (headline && raceType && !headline.includes(raceType) && !raceType.includes(headline)) {
    return `${headline} ${raceType}`.trim();
  }

  return headline || raceType;
}

function extractKdreamsLineupFromForecast(html, raceNo, isGirls = false) {
  const linePositionHtml = matchOne(html, [
    /<dt>並び予想<\/dt>\s*<dd>\s*<div class="line_position">([\s\S]*?)<\/div>/i,
  ]);
  if (linePositionHtml) {
    const $ = load(`<div class="line_position-root">${linePositionHtml}</div>`);
    const explicitGroups = [];
    let currentGroup = "";

    $(".icon_p").each((_, element) => {
      const token = $(element);
      if (token.hasClass("space")) {
        if (currentGroup) {
          explicitGroups.push(currentGroup);
          currentGroup = "";
        }
        return;
      }

      const carNo = token.find("span").toArray()
        .map((span) => cleanCellText($(span).text()).normalize("NFKC"))
        .find((value) => /^[1-9]$/.test(value));
      if (!carNo) return;
      currentGroup += carNo;
    });

    if (currentGroup) explicitGroups.push(currentGroup);

    const riderCount = explicitGroups.join("").length;
    if (explicitGroups.length > 0) {
      const candidate = explicitGroups.join(" ");
      const validation = validateLineupRaw(candidate, {
        source: "kdreams",
        raceNo,
        isGirls,
        riderCount,
      });
      if (validation.valid) {
        return {
          lineup: validation.normalizedRawText,
          rawText: validation.normalizedRawText,
          reason: "accepted",
        };
      }
    }
  }

  const forecastRaw = cleanCellText(matchOne(html, [
    /並び予想[\s:：-]*([←→\s\S]*?)(?:レース評|天候|投票|<|$)/i,
  ])).normalize("NFKC");

  if (!forecastRaw) {
    return { lineup: "", rawText: "", reason: "forecast missing" };
  }

  const compactForecast = forecastRaw
    .replace(/並び予想/g, "")
    .replace(/[←→]/g, " ")
    .replace(/\s+/g, "")
    .trim();
  const tokens = Array.from(compactForecast.matchAll(/([1-9])([^1-9]*)/g)).map((match) => ({
    carNo: match[1],
    note: String(match[2] ?? ""),
  }));

  if (!tokens.length) {
    return { lineup: "", rawText: forecastRaw, reason: "forecast parse empty" };
  }

  const groupStartPattern = /(先行|押え先|押先|追上|追い上げ|自在|捲|まくり|単騎)/;
  const groups = [];
  let currentGroup = "";

  tokens.forEach((token, index) => {
    if (index > 0 && groupStartPattern.test(token.note) && currentGroup) {
      groups.push(currentGroup);
      currentGroup = "";
    }
    currentGroup += token.carNo;
  });

  if (currentGroup) groups.push(currentGroup);
  const candidate = groups.join(" ");
  const validation = validateLineupRaw(candidate, {
    source: "kdreams",
    raceNo,
    isGirls,
    riderCount: tokens.length,
  });

  if (!validation.valid) {
    return {
      lineup: "",
      rawText: forecastRaw,
      reason: validation.reason || "forecast invalid",
    };
  }

  return {
    lineup: validation.normalizedRawText,
    rawText: validation.normalizedRawText,
    reason: "accepted",
  };
}

function sumKdreamsNumericCells(values) {
  const numbers = values
    .map((value) => Number.parseInt(String(value ?? "").replace(/[^0-9-]/g, ""), 10))
    .filter((value) => Number.isFinite(value));
  if (numbers.length === 0) return "";
  return String(numbers.reduce((total, value) => total + value, 0));
}

function extractKdreamsRacecardRows(tableHtml) {
  const normalizedTableHtml = String(tableHtml ?? "");
  if (!normalizedTableHtml.trim()) return [];

  const dom = load(`<table>${normalizedTableHtml}</table>`);
  const resolveCarNo = (row, cells) => {
    const rowClass = String(dom(row).attr("class") ?? "");
    const classMatch = rowClass.match(/(?:^|\s)n([1-9])(?:\s|$)/i);
    if (classMatch?.[1]) return classMatch[1];

    const nameCellIndex = cells.findIndex((cell) => {
      const text = String(cell ?? "").replace(/\s+/g, " ").trim();
      const slashCount = (text.match(/\//g) ?? []).length;
      return slashCount >= 2 || /\d+期/.test(text);
    });
    if (nameCellIndex > 0) {
      for (let index = nameCellIndex - 1; index >= 0; index -= 1) {
        const candidate = String(cells[index] ?? "").replace(/\s+/g, "").trim();
        if (/^[1-9]$/.test(candidate)) return candidate;
      }
    }

    const tdClassMatch = dom(row)
      .find("td")
      .toArray()
      .map((cell) => String(dom(cell).attr("class") ?? ""))
      .map((value) => value.match(/(?:^|\s)n([1-9])(?:\s|$)/i)?.[1] ?? "")
      .find(Boolean);
    return tdClassMatch ?? "";
  };

  return dom("tr").toArray().map((row) => {
    const rowHtml = dom.html(row) ?? "";
    const cells = dom(row)
      .find("td")
      .toArray()
      .map((cell) => cleanCellText(dom.html(cell) ?? "").normalize("NFKC"));
    return {
      carNo: resolveCarNo(row, cells),
      rowHtml,
      cells,
    };
  }).filter((row) => Boolean(row.carNo) && row.cells.length > 0);
}

function buildKdreamsStatsSummary(parts) {
  const starts = parts.starts || sumKdreamsNumericCells([parts.wins, parts.seconds, parts.thirds, parts.losses]);
  const summaryParts = [
    starts ? `出走${starts}` : "",
    parts.wins ? `1着${parts.wins}` : "",
    parts.seconds ? `2着${parts.seconds}` : "",
    parts.thirds ? `3着${parts.thirds}` : "",
    parts.losses ? `着外${parts.losses}` : "",
  ].filter(Boolean);

  return {
    ...parts,
    starts,
    summary: summaryParts.join(" / "),
  };
}

function extractKdreamsPreviousRaceResultsMap(html) {
  const tableHtml = matchOne(html, [
    /(<table[^>]*class="racecard_table past_racecard_table none"[^>]*>[\s\S]*?<\/table>)/i,
  ]);
  const resultMap = new Map();

  extractKdreamsRacecardRows(tableHtml).forEach(({ carNo, rowHtml, cells }) => {
    const venueCells = Array.from(rowHtml.matchAll(/<td[^>]*>\s*(<p class="stadium">[\s\S]*?<\/td>)/gi)).map((match) => match[1]);
    const score = cells[3] ?? "";
    const results = [];

    venueCells.forEach((cellHtml) => {
      const venueName = cleanCellText(matchOne(cellHtml, [
        /<p class="stadium">([\s\S]*?)<\/p>/i,
      ])).normalize("NFKC");
      Array.from(cellHtml.matchAll(/<li>([\s\S]*?)<\/li>/gi)).forEach((liMatch) => {
        const spans = Array.from((liMatch[1] ?? "").matchAll(/<span[^>]*>([\s\S]*?)<\/span>/gi)).map((spanMatch) => cleanCellText(spanMatch[1]).normalize("NFKC"));
        if (spans.length === 0) return;
        results.push({
          venue: venueName,
          date: spans[0] ?? "",
          raceName: spans[1] ?? "",
          place: spans[2] ?? "",
          agari: spans[3] ?? "",
        });
      });
    });

    resultMap.set(carNo, {
      score,
      results,
      summary: results.slice(0, 3).map((item) => [item.venue, item.date, item.raceName, item.place, item.agari ? `上がり${item.agari}` : ""].filter(Boolean).join(" / ")).join(" | "),
    });
  });

  return resultMap;
}

function extractKdreamsYearlyStatsMap(html) {
  const tableHtml = matchOne(html, [
    /(<table[^>]*class="racecard_table none"[^>]*>[\s\S]*?<th colspan="16">\s*年間勝利度数\s*<\/th>[\s\S]*?<\/table>)/i,
  ]);
  const statsMap = new Map();
  const stageLabels = ["決勝", "一般", "予2", "予1"];

  extractKdreamsRacecardRows(tableHtml).forEach(({ carNo, cells }) => {
    if (cells.length < 26) return;
    const stageStats = {};
    stageLabels.forEach((label, index) => {
      const offset = 10 + (index * 4);
      stageStats[label] = {
        wins: cells[offset] ?? "",
        seconds: cells[offset + 1] ?? "",
        thirds: cells[offset + 2] ?? "",
        losses: cells[offset + 3] ?? "",
      };
    });

    statsMap.set(carNo, buildKdreamsStatsSummary({
      score: cells[9] ?? "",
      wins: sumKdreamsNumericCells(stageLabels.map((label) => stageStats[label].wins)),
      seconds: sumKdreamsNumericCells(stageLabels.map((label) => stageStats[label].seconds)),
      thirds: sumKdreamsNumericCells(stageLabels.map((label) => stageStats[label].thirds)),
      losses: sumKdreamsNumericCells(stageLabels.map((label) => stageStats[label].losses)),
      categories: stageStats,
    }));
  });

  return statsMap;
}

function extractKdreamsSameTrackYearlyStatsMap(html) {
  const tableHtml = matchOne(html, [
    /(<table[^>]*class="racecard_table none"[^>]*>[\s\S]*?<th colspan="4">同走路年間勝利度数【([^】]+)】<\/th>[\s\S]*?<\/table>)/i,
  ]);
  const trackLength = matchOne(tableHtml, [/同走路年間勝利度数【([^】]+)】/i]);
  const statsMap = new Map();

  extractKdreamsRacecardRows(tableHtml).forEach(({ carNo, cells }) => {
    if (cells.length < 14) return;
    statsMap.set(carNo, buildKdreamsStatsSummary({
      trackLength,
      score: cells[9] ?? "",
      wins: cells[10] ?? "",
      seconds: cells[11] ?? "",
      thirds: cells[12] ?? "",
      losses: cells[13] ?? "",
    }));
  });

  return statsMap;
}

function extractKdreamsLocalFiveYearStatsMap(html) {
  const tableHtml = matchOne(html, [
    /(<table[^>]*class="racecard_table none"[^>]*>[\s\S]*?<th colspan="4">当所5年<\/th>[\s\S]*?<\/table>)/i,
  ]);
  const statsMap = new Map();

  extractKdreamsRacecardRows(tableHtml).forEach(({ carNo, cells }) => {
    if (cells.length < 14) return;
    statsMap.set(carNo, buildKdreamsStatsSummary({
      score: cells[9] ?? "",
      wins: cells[10] ?? "",
      seconds: cells[11] ?? "",
      thirds: cells[12] ?? "",
      losses: cells[13] ?? "",
    }));
  });

  return statsMap;
}

function extractKdreamsRiders(html) {
  const statsTableHtml = matchOne(html, [
    /(<table[^>]*class="racecard_table[^\"]*"[^>]*>[\s\S]*?<th colspan="14">直近4ヶ月の成績<\/th>[\s\S]*?<\/table>)/i,
  ]);
  const commentTableHtml = matchOne(html, [
    /(<table[^>]*class="racecard_table none"[^>]*>[\s\S]*?<th class="bdr_r">選手コメント<\/th>[\s\S]*?<\/table>)/i,
  ]);
  const riders = [];
  const commentByCarNo = new Map();
  const previousRaceResultsByCarNo = extractKdreamsPreviousRaceResultsMap(html);
  const yearlyStatsByCarNo = extractKdreamsYearlyStatsMap(html);
  const sameTrackYearlyStatsByCarNo = extractKdreamsSameTrackYearlyStatsMap(html);
  const localFiveYearStatsByCarNo = extractKdreamsLocalFiveYearStatsMap(html);

  const normalizeKdreamsFullName = (value) => {
    const parts = cleanCellText(value).normalize("NFKC").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
    if (parts.length <= 1) return parts[0] ?? "";
    const givenNameParts = parts.slice(1);
    const givenName = givenNameParts.every((part) => part.length <= 2)
      ? givenNameParts.join("")
      : givenNameParts.join(" ");
    return `${parts[0]} ${givenName}`.trim();
  };

  extractKdreamsRacecardRows(commentTableHtml).forEach(({ carNo, rowHtml }) => {
    const comment = cleanCellText(matchOne(rowHtml, [
      /<td[^>]*class="comment[^\"]*"[^>]*>([\s\S]*?)<\/td>/i,
    ])).normalize("NFKC");
    if (carNo && comment) commentByCarNo.set(carNo, comment);
  });

  for (const { carNo, rowHtml } of extractKdreamsRacecardRows(statsTableHtml)) {
    const rawCells = Array.from(String(rowHtml ?? "").matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)).map((cellMatch) => cellMatch[1] ?? "");
    const cells = rawCells.map((cellHtml) => cleanCellText(cellHtml).normalize("NFKC"));
    const riderMetaIndex = cells.findIndex((cell) => /\/\d+\/\d+/.test(String(cell ?? "").replace(/\s+/g, "")));
    if (!carNo || riderMetaIndex < 0 || cells.length < riderMetaIndex + 18) continue;

    const riderMetaText = cells[riderMetaIndex] ?? "";
    const riderMeta = parseKdreamsRiderMeta(riderMetaText);
    const fullName = normalizeKdreamsFullName(riderMeta.fullName);
    const prefecture = riderMeta.prefecture;
    const age = riderMeta.age;
    const term = riderMeta.term;
    const name = fullName ?? "";
    if (!name) continue;

    const gradeIndex = riderMetaIndex + 1;
    const styleIndex = riderMetaIndex + 2;
    const gearRatioIndex = riderMetaIndex + 3;
    const scoreIndex = riderMetaIndex + 4;
    const sIndex = riderMetaIndex + 5;
    const bIndex = riderMetaIndex + 6;
    const nigeIndex = riderMetaIndex + 7;
    const makuriIndex = riderMetaIndex + 8;
    const sashiIndex = riderMetaIndex + 9;
    const markIndex = riderMetaIndex + 10;
    const winsIndex = riderMetaIndex + 11;
    const secondsIndex = riderMetaIndex + 12;
    const thirdsIndex = riderMetaIndex + 13;
    const losesIndex = riderMetaIndex + 14;
    const winRateIndex = riderMetaIndex + 15;
    const quinellaRateIndex = riderMetaIndex + 16;
    const trifectaRateIndex = riderMetaIndex + 17;

    const yearlyStats = yearlyStatsByCarNo.get(carNo);
    const sameTrackYearlyStats = sameTrackYearlyStatsByCarNo.get(carNo);
    const localFiveYearStats = localFiveYearStatsByCarNo.get(carNo);
    const previousRaceData = previousRaceResultsByCarNo.get(carNo);
    const starts = sumKdreamsNumericCells([cells[winsIndex], cells[secondsIndex], cells[thirdsIndex], cells[losesIndex]]);
    const kdreamsRiderNote = [
      previousRaceData?.results?.length ? "" : "前回出走レース成績未取得",
      yearlyStats ? "" : "年間勝利度数未取得",
      sameTrackYearlyStats ? "" : "同走路年間勝利度数未取得",
      localFiveYearStats ? "" : "当所5年未取得",
    ].filter(Boolean).join(" / ");

    riders.push({
      carNo,
      name,
      fullName: name,
      prefecture,
      age,
      term,
      grade: cells[gradeIndex] ?? "",
      style: cells[styleIndex] ?? "",
      score: cells[scoreIndex] ?? "",
      s: cells[sIndex] ?? "",
      b: cells[bIndex] ?? "",
      nige: cells[nigeIndex] ?? "",
      escape: cells[nigeIndex] ?? "",
      makuri: cells[makuriIndex] ?? "",
      sashi: cells[sashiIndex] ?? "",
      mark: cells[markIndex] ?? "",
      wins: cells[winsIndex] ?? "",
      seconds: cells[secondsIndex] ?? "",
      thirds: cells[thirdsIndex] ?? "",
      loses: cells[losesIndex] ?? "",
      starts,
      winRate: cells[winRateIndex] ?? "",
      quinellaRate: cells[quinellaRateIndex] ?? "",
      trifectaRate: cells[trifectaRateIndex] ?? "",
      gearRatio: cells[gearRatioIndex] ?? "",
      totalScore: cells[scoreIndex] ?? "",
      comment: commentByCarNo.get(carNo) ?? "",
      previousRaceSummary: previousRaceData?.summary ?? "",
      previousRaceResults: previousRaceData?.results ?? [],
      yearlyStats: yearlyStats ?? null,
      sameTrackYearlyStats: sameTrackYearlyStats ?? null,
      localFiveYearStats: localFiveYearStats ?? null,
      kdreamsRiderNote,
    });
  }

  return riders;
}

function createEmptyRaceDetail(raceNo, sourceNote) {
  return {
    raceNo,
    time: "",
    title: "",
    lineup: "",
    charilotoLineupRaw: "",
    charilotoLineupRawDiagnostic: "",
    oddsparkLineupRaw: "",
    oddsparkLineupRawDiagnostic: "",
    winticketLineupRaw: "",
    netkeirinLineupRaw: "",
    kdreamsLineupRaw: "",
    raceOperationStatus: "unknown",
    raceOperationLabel: "状態未取得",
    raceOperationReason: "",
    raceOperationSource: "",
    raceOperationUpdatedAt: "",
    raceOperationRaw: "",
    isGirls: false,
    sourceNote,
    lead: "",
    ...createEmptyRaceOddsData(),
    ...createPendingRaceResultData(),
    riders: [],
  };
}

async function fetchKdreamsRaceDetail(slug, kdreamsRaceId, raceNo, saveSample = false) {
  if (!slug || !kdreamsRaceId) {
    return createEmptyRaceDetail(raceNo, "kdreams racedetail unavailable");
  }

  const url = `${KDREAMS_RACE_DETAIL_BASE_URL}/${slug}/racedetail/${kdreamsRaceId}/`;
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0",
      "accept-language": "ja-JP,ja;q=0.9,en;q=0.8",
    },
  });

  if (!response.ok) {
    return createEmptyRaceDetail(raceNo, `kdreams取得失敗: ${response.status} racedetail=${url}`);
  }

  const html = await readHtmlResponse(response);

  if (saveSample) {
    await fs.writeFile(KDREAMS_SAMPLE_DETAIL_HTML_PATH, html, "utf-8");
    await fs.writeFile(KDREAMS_SAMPLE_DETAIL_TEXT_PATH, stripTags(html), "utf-8");
  }

  const title = extractKdreamsRaceTitle(html);
  const riders = extractKdreamsRiders(html);
  const isGirls = /ガールズ|女子|L級|Ｌ級/i.test(title) || riders.some((rider) => /^L[12]$/i.test(rider.grade));
  const lineupData = extractKdreamsLineupFromForecast(html, raceNo, isGirls);
  const raceOperation = normalizeOperationStatus(`${title} ${stripTags(html).slice(0, 3000)}`, "scheduled");
  const baseSourceNote = lineupData.lineup
    ? `kdreams racedetail=${url} / lineFallback: kdreams lineup accepted`
    : `kdreams racedetail=${url} / lineFallback: kdreams lineup unavailable${lineupData.reason ? ` (${lineupData.reason})` : ""}`;
  const riderFallbackNote = riders.some((rider) => hasSubstantiveRiderDetail(rider))
    ? ""
    : "riderFallback: kdreams detail lacks stats";
  const missingRiderCarNos = getMissingLineupRiderCarNos({ lineup: lineupData.lineup, riders });
  const missingRiderNote = missingRiderCarNos.length > 0
    ? `riderMissingCarNos=${missingRiderCarNos.join(",")}`
    : "";

  if (lineupData.rawText && !lineupData.lineup) {
    logInvalidLineupSource({
      venue: slug,
      raceNo,
      source: "kdreams",
      rawText: lineupData.rawText,
      reason: lineupData.reason,
    });
  }

  return {
    ...createEmptyRaceDetail(raceNo, baseSourceNote),
    time: extractKdreamsRaceTime(html),
    title,
    lineup: lineupData.lineup,
    kdreamsLineupRaw: lineupData.rawText,
    ...createOperationFields("race", raceOperation, "kdreams:racedetail", `${getJstNowParts().isoDateTime}+09:00`),
    isGirls,
    sourceNote: appendUniqueNote(appendUniqueNote(baseSourceNote, riderFallbackNote), missingRiderNote),
    riders,
  };
}

function hasMeaningfulRaceData(race) {
  if (!race) return false;

  return Boolean(
    race.time ||
      race.title ||
      race.lineup ||
      race.lead ||
      (Array.isArray(race.riders) && race.riders.length) ||
      (Array.isArray(race.oddsPreview) && race.oddsPreview.length) ||
      (Array.isArray(race.oddsTrifecta) && race.oddsTrifecta.length) ||
      (Array.isArray(race.resultTop3) && race.resultTop3.length) ||
      (Array.isArray(race.payouts) && race.payouts.length) ||
      (race.resultStatus && race.resultStatus !== "pending") ||
      (Array.isArray(race.result?.finishOrder) && race.result.finishOrder.length),
  );
}

function hasMeaningfulRaceResult(race) {
  if (!race) return false;

  return Boolean(
    (race.resultStatus && race.resultStatus !== "pending") ||
      (Array.isArray(race.resultTop3) && race.resultTop3.length) ||
      (Array.isArray(race.payouts) && race.payouts.length) ||
      (Array.isArray(race.result?.finishOrder) && race.result.finishOrder.length),
  );
}

function hasConfirmedRaceResult(race) {
  if (!race) return false;

  return Boolean(
    race.resultStatus === "confirmed"
      && Array.isArray(race.resultTop3)
      && race.resultTop3.length >= 3
      && Array.isArray(race.payouts)
      && race.payouts.length > 0
      && Array.isArray(race.result?.finishOrder)
      && race.result.finishOrder.length >= 3,
  );
}

function hasMeaningfulRaceOdds(race) {
  if (!race) return false;

  return Boolean(
    (Array.isArray(race.oddsPreview) && race.oddsPreview.length) ||
      (Array.isArray(race.oddsTrifecta) && race.oddsTrifecta.length),
  );
}

function buildNetkeirinRaceId(todayIso, venueCode, raceNo) {
  return `${compactDate(todayIso)}${venueCode}${String(raceNo).padStart(2, "0")}`;
}

function buildKdreamsRaceResultDetailUrl(slug, kdreamsRaceId) {
  if (!slug || !kdreamsRaceId) return "";
  return `${KDREAMS_RACE_DETAIL_BASE_URL}/${slug}/racedetail/${kdreamsRaceId}/?pageType=result`;
}

function buildKdreamsRaceOddsDetailUrl(slug, kdreamsRaceId) {
  if (!slug || !kdreamsRaceId) return "";
  return `${KDREAMS_RACE_DETAIL_BASE_URL}/${slug}/racedetail/${kdreamsRaceId}/?pageType=odds&kakeshikiType=3rentan`;
}

function extractKdreamsTrifectaOddsSection(html) {
  const start = html.search(/<div class="odds_contents none" id="JS_ODDSCONTENTS_3rentan">/i);
  if (start < 0) return "";

  const nextSection = html.slice(start + 1).search(/<div class="odds_contents none" id="JS_ODDSCONTENTS_/i);
  if (nextSection >= 0) {
    return html.slice(start, start + 1 + nextSection);
  }

  const end = html.indexOf("<!-- 3連複 Start -->", start);
  return end >= 0 ? html.slice(start, end) : html.slice(start);
}

function extractKdreamsTrifectaPopularityRows(sectionHtml) {
  const tableHtml = sectionHtml.match(/<p class="header">人気順<\/p>[\s\S]*?<table>([\s\S]*?)<\/table>/i)?.[1] ?? "";
  if (!tableHtml) return [];

  return Array.from(tableHtml.matchAll(/<tr>[\s\S]*?<th>(\d+)<\/th>[\s\S]*?<span class="num">([0-9\-]+)<\/span>[\s\S]*?<span class="odds">([0-9.,]+)<\/span>[\s\S]*?<\/tr>/gi))
    .map((match) => ({
      popularity: Number(match[1]),
      combination: normalizeNetkeirinOddsCombination(match[2]),
      odds: getNetkeirinNumberValue(match[3]),
    }))
    .filter((item) => isStrictTrifectaCombination(item.combination) && Number.isFinite(item.odds) && item.odds > 0);
}

function extractKdreamsTrifectaOddsFromMatrix(sectionHtml) {
  const tables = Array.from(sectionHtml.matchAll(/<table class="odds_table bt5(?: none)?">([\s\S]*?)<\/table>/gi)).map((match) => match[1]);
  const items = [];

  for (const tableHtml of tables) {
    const rowHtmlList = Array.from(tableHtml.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)).map((match) => match[1]);
    if (rowHtmlList.length < 4) continue;

    const firstCar = cleanCellText(matchOne(rowHtmlList[0], [
      /<span class="number">(\d+)<\/span>/i,
    ]));
    if (!firstCar) continue;

    const thirdCars = Array.from(rowHtmlList[1].matchAll(/<th[^>]*class="n(\d+)"[^>]*>\d+<\/th>/gi)).map((match) => match[1]);
    if (!thirdCars.length) continue;

    for (const rowHtml of rowHtmlList.slice(3)) {
      const secondCar = cleanCellText(matchOne(rowHtml, [
        /<th[^>]*class="n(\d+)"[^>]*>\d+<\/th>/i,
      ]));
      if (!secondCar) continue;

      const cells = Array.from(rowHtml.matchAll(/<(td|th)[^>]*>([\s\S]*?)<\/\1>/gi)).map((match) => match[2]);
      const valueCells = cells.slice(1, 1 + thirdCars.length);
      valueCells.forEach((cellHtml, index) => {
        const thirdCar = thirdCars[index] ?? "";
        const odds = getNetkeirinNumberValue(cleanCellText(cellHtml));
        if (!thirdCar || !Number.isFinite(odds) || odds <= 0) return;
        items.push({
          combination: `${firstCar}-${thirdCar}-${secondCar}`,
          odds,
          source: "kdreams",
        });
      });
    }
  }

  return items.filter((item) => isStrictTrifectaCombination(item.combination));
}

function extractKdreamsTrifectaOddsData(html) {
  const sectionHtml = extractKdreamsTrifectaOddsSection(html);
  if (!sectionHtml) {
    return {
      oddsTrifecta: [],
      oddsPreview: [],
      reason: "no trifecta section",
      matrixCount: 0,
      popularityCount: 0,
    };
  }

  const popularityRows = extractKdreamsTrifectaPopularityRows(sectionHtml);
  const popularityMap = new Map(popularityRows.map((item) => [item.combination, item.popularity]));
  const matrixItems = extractKdreamsTrifectaOddsFromMatrix(sectionHtml);
  const matrixMergedItems = (matrixItems.length ? matrixItems : popularityRows.map((item) => ({
    combination: item.combination,
    odds: item.odds,
    source: "kdreams",
  })))
    .map((item) => ({
      ...item,
      popularity: popularityMap.get(item.combination),
    }))
    .sort((a, b) => (a.popularity ?? Number.MAX_SAFE_INTEGER) - (b.popularity ?? Number.MAX_SAFE_INTEGER) || a.odds - b.odds);
  const popularItems = popularityRows
    .map((item) => ({
      combination: item.combination,
      odds: item.odds,
      popularity: item.popularity,
      source: "kdreams",
    }))
    .sort((a, b) => a.popularity - b.popularity || a.odds - b.odds);
  const mergedItems = [...popularItems, ...matrixMergedItems]
    .filter((item, index, array) => array.findIndex((candidate) => candidate.combination === item.combination) === index);

  const oddsPreview = popularityRows.slice(0, 3).map((item) => ({
    combo: item.combination,
    odds: `${item.odds.toFixed(1)}倍`,
    tag: `3連単人気${item.popularity}`,
  }));

  const favorite = mergedItems.find((item) => item.popularity === 1) ?? null;
  const capturedAt = getJstNowParts().isoDateTime;
  const finalTrifectaFavorite = favorite
    ? {
        combination: favorite.combination,
        odds: favorite.odds,
        oddsText: `${favorite.odds.toFixed(1)}倍`,
        popularity: 1,
        source: "kdreams",
        sort: "popular",
        capturedAt,
      }
    : null;

  return {
    oddsTrifecta: mergedItems,
    oddsPreview,
    finalTrifectaFavorite,
    topOdds: favorite?.odds ?? null,
    topTrifectaOdds: favorite?.odds ?? null,
    favoriteOdds: favorite?.odds ?? null,
    favoriteCombination: favorite?.combination ?? "",
    reason: mergedItems.length ? "accepted" : popularityRows.length ? "popular-table-only" : "no trifecta table",
    matrixCount: matrixItems.length,
    popularityCount: popularityRows.length,
  };
}

async function fetchKdreamsTrifectaOdds(slug, kdreamsRaceId) {
  const url = buildKdreamsRaceOddsDetailUrl(slug, kdreamsRaceId);
  if (!url) {
    return {
      ...createEmptyRaceOddsData(),
      source: "kdreams",
      reason: "url unavailable",
      oddsNote: "kdreams odds skipped: url unavailable",
      matrixCount: 0,
      popularityCount: 0,
    };
  }

  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0",
        "accept-language": "ja-JP,ja;q=0.9,en;q=0.8",
      },
    });

    if (!response.ok) {
      return {
        ...createEmptyRaceOddsData(),
        source: "kdreams",
        reason: `fetch failed: ${response.status}`,
        oddsNote: `kdreams odds fetch failed: ${response.status}`,
        matrixCount: 0,
        popularityCount: 0,
      };
    }

    const html = await readHtmlResponse(response);
    const oddsData = extractKdreamsTrifectaOddsData(html);
    return {
      oddsPreview: oddsData.oddsPreview,
      oddsTrifecta: oddsData.oddsTrifecta,
      finalTrifectaFavorite: oddsData.finalTrifectaFavorite,
      topOdds: oddsData.topOdds,
      topTrifectaOdds: oddsData.topTrifectaOdds,
      favoriteOdds: oddsData.favoriteOdds,
      favoriteCombination: oddsData.favoriteCombination,
      oddsNote: oddsData.oddsTrifecta.length
        ? `kdreams odds accepted: count=${oddsData.oddsTrifecta.length} matrix=${oddsData.matrixCount} popular=${oddsData.popularityCount}`
        : `kdreams odds unavailable: ${oddsData.reason} matrix=${oddsData.matrixCount} popular=${oddsData.popularityCount}`,
      source: "kdreams",
      reason: oddsData.reason,
      matrixCount: oddsData.matrixCount,
      popularityCount: oddsData.popularityCount,
      url,
    };
  } catch (error) {
    return {
      ...createEmptyRaceOddsData(),
      source: "kdreams",
      reason: error instanceof Error ? error.message : String(error),
      oddsNote: `kdreams odds fetch failed: ${error instanceof Error ? error.message : String(error)}`,
      matrixCount: 0,
      popularityCount: 0,
    };
  }
}

function mergeRaceDetailWithFallback(primary, fallback) {
  const safePrimary = primary ?? createEmptyRaceDetail(fallback?.raceNo ?? 0, "primary unavailable");
  const safeFallback = fallback ?? createEmptyRaceDetail(primary?.raceNo ?? 0, "fallback unavailable");
  const primaryHasData = hasMeaningfulRaceData(safePrimary);
  const fallbackHasData = hasMeaningfulRaceData(safeFallback);

  const merged = {
    raceNo: safePrimary.raceNo ?? safeFallback.raceNo,
    time: safePrimary.time || safeFallback.time,
    title: safePrimary.title || safeFallback.title,
    lineup: safePrimary.lineup || safeFallback.lineup,
    charilotoLineupRaw: safePrimary.charilotoLineupRaw || safeFallback.charilotoLineupRaw,
    charilotoLineupRawDiagnostic: safePrimary.charilotoLineupRawDiagnostic || safeFallback.charilotoLineupRawDiagnostic,
    oddsparkLineupRaw: safePrimary.oddsparkLineupRaw || safeFallback.oddsparkLineupRaw,
    oddsparkLineupRawDiagnostic: safePrimary.oddsparkLineupRawDiagnostic || safeFallback.oddsparkLineupRawDiagnostic,
    winticketLineupRaw: safePrimary.winticketLineupRaw || safeFallback.winticketLineupRaw,
    netkeirinLineupRaw: safePrimary.netkeirinLineupRaw || safeFallback.netkeirinLineupRaw,
    kdreamsLineupRaw: safePrimary.kdreamsLineupRaw || safeFallback.kdreamsLineupRaw,
    raceOperationStatus: safePrimary.raceOperationStatus || safeFallback.raceOperationStatus || "unknown",
    raceOperationLabel: safePrimary.raceOperationLabel || safeFallback.raceOperationLabel || "",
    raceOperationReason: safePrimary.raceOperationReason || safeFallback.raceOperationReason || "",
    raceOperationSource: safePrimary.raceOperationSource || safeFallback.raceOperationSource || "",
    raceOperationUpdatedAt: safePrimary.raceOperationUpdatedAt || safeFallback.raceOperationUpdatedAt || "",
    raceOperationRaw: safePrimary.raceOperationRaw || safeFallback.raceOperationRaw || "",
    isGirls: Boolean(safePrimary.isGirls || safeFallback.isGirls),
    sourceNote: safePrimary.sourceNote,
    lead: safePrimary.lead || safeFallback.lead,
    oddsPreview:
      Array.isArray(safePrimary.oddsPreview) && safePrimary.oddsPreview.length
        ? safePrimary.oddsPreview
        : safeFallback.oddsPreview,
    oddsTrifecta:
      Array.isArray(safePrimary.oddsTrifecta) && safePrimary.oddsTrifecta.length
        ? safePrimary.oddsTrifecta
        : safeFallback.oddsTrifecta,
    topOdds: safePrimary.topOdds ?? safeFallback.topOdds ?? null,
    topTrifectaOdds: safePrimary.topTrifectaOdds ?? safeFallback.topTrifectaOdds ?? null,
    favoriteOdds: safePrimary.favoriteOdds ?? safeFallback.favoriteOdds ?? null,
    favoriteCombination: safePrimary.favoriteCombination || safeFallback.favoriteCombination || "",
    oddsNote: safePrimary.oddsNote || safeFallback.oddsNote,
    resultNote: safePrimary.resultNote || safeFallback.resultNote || "",
    resultStatus: hasMeaningfulRaceResult(safePrimary) ? safePrimary.resultStatus : safeFallback.resultStatus,
    resultTop3:
      Array.isArray(safePrimary.resultTop3) && safePrimary.resultTop3.length
        ? safePrimary.resultTop3
        : safeFallback.resultTop3,
    payouts:
      Array.isArray(safePrimary.payouts) && safePrimary.payouts.length
        ? safePrimary.payouts
        : safeFallback.payouts,
    result: hasMeaningfulRaceResult(safePrimary) ? safePrimary.result : safeFallback.result,
    riders: preferBetterRiders(safePrimary.riders, safeFallback.riders),
  };

  const fallbackFields = [];
  if (!safePrimary.time && safeFallback.time) fallbackFields.push("time");
  if (!safePrimary.title && safeFallback.title) fallbackFields.push("title");
  if ((!Array.isArray(safePrimary.riders) || !safePrimary.riders.length) && Array.isArray(safeFallback.riders) && safeFallback.riders.length) {
    fallbackFields.push("riders");
  }
  if (!safePrimary.isGirls && safeFallback.isGirls) fallbackFields.push("isGirls");
  if (!safePrimary.lineup && safeFallback.lineup) fallbackFields.push("lineup");
  if (!hasMeaningfulRaceResult(safePrimary) && hasMeaningfulRaceResult(safeFallback)) fallbackFields.push("result");
  if ((!Array.isArray(safePrimary.oddsPreview) || !safePrimary.oddsPreview.length) && Array.isArray(safeFallback.oddsPreview) && safeFallback.oddsPreview.length) {
    fallbackFields.push("oddsPreview");
  }
  if ((!Array.isArray(safePrimary.oddsTrifecta) || !safePrimary.oddsTrifecta.length) && Array.isArray(safeFallback.oddsTrifecta) && safeFallback.oddsTrifecta.length) {
    fallbackFields.push("oddsTrifecta");
  }

  if (!fallbackHasData) {
    merged.sourceNote = safePrimary.sourceNote;
  } else if (!primaryHasData) {
    merged.sourceNote = `${safePrimary.sourceNote} / fallback: ${safeFallback.sourceNote}`;
  } else if (fallbackFields.length) {
    merged.sourceNote = `${safePrimary.sourceNote} / fallback補完(${fallbackFields.join(",")}): ${safeFallback.sourceNote}`;
  } else {
    merged.sourceNote = safePrimary.sourceNote;
  }

  return merged;
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
      nige: detailCells[4] || "",
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
  const raceId = buildNetkeirinRaceId(todayIso, venueCode, raceNo);
  const url = `${NETKEIRIN_ENTRY_URL}?race_id=${raceId}&rf=racetoplive`;

  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0",
      "accept-language": "ja-JP,ja;q=0.9,en;q=0.8",
    },
  });

  if (!response.ok) {
    return createEmptyRaceDetail(raceNo, `netkeirin取得失敗: ${response.status}`);
  }

  const html = await response.text();

  if (saveSample) {
    await fs.writeFile(NETKEIRIN_SAMPLE_HTML_PATH, html, "utf-8");
    await fs.writeFile(NETKEIRIN_SAMPLE_TEXT_PATH, stripTags(html), "utf-8");
  }

  const title = extractNetkeirinRaceTitle(html);
  const riders = extractNetkeirinRiders(html);
  const isGirls = /ガールズ|女子|L級|Ｌ級/i.test(title);
  const netkeirinLineupCandidate = extractNetkeirinLineupRaw(html);
  const netkeirinLineupValidation = validateLineupRaw(netkeirinLineupCandidate, {
    isGirls,
    riderCount: riders.length,
  });

  if (netkeirinLineupCandidate && !netkeirinLineupValidation.valid) {
    logInvalidLineupSource({
      venue: venueCode,
      raceNo,
      source: "netkeirin",
      rawText: netkeirinLineupCandidate,
      reason: netkeirinLineupValidation.reason,
    });
  }

  return {
    raceNo,
    time: extractNetkeirinRaceTime(html),
    title,
    lineup: netkeirinLineupValidation.valid ? netkeirinLineupValidation.normalizedRawText : "",
    charilotoLineupRaw: "",
    oddsparkLineupRaw: "",
    winticketLineupRaw: "",
    netkeirinLineupRaw: netkeirinLineupValidation.valid ? netkeirinLineupValidation.normalizedRawText : "",
    kdreamsLineupRaw: "",
    isGirls,
    sourceNote: `netkeirin race_id=${raceId}`,
    lead: extractNetkeirinLead(html),
    riders,
  };
}

async function fetchNetkeirinTrifectaOddsForRaceId(raceId) {
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

  return {
    ...createEmptyRaceOddsData(),
    oddsTrifecta,
    oddsNote: oddsTrifecta.length ? `netkeirin odds accepted: count=${oddsTrifecta.length} source=AplRaceOdds` : "",
    source: "netkeirin:AplRaceOdds",
    reason: oddsTrifectaReason,
    usedKey: oddsTrifectaUsedKey,
    rawRows: oddsTrifectaRawRows,
    normalizedRows: oddsTrifectaNormalizedRows,
  };
}

async function fetchNetkeirinRaceResult(raceId) {
  try {
    const response = await fetch(`${NETKEIRIN_RESULT_URL}?race_id=${raceId}`, {
      headers: {
        "user-agent": "Mozilla/5.0",
        "accept-language": "ja-JP,ja;q=0.9,en;q=0.8",
      },
    });

    if (!response.ok) {
      return {
        ...createPendingRaceResultData(`netkeirin result fetch failed: ${response.status}`),
        source: "netkeirin:result",
        sourceNote: `netkeirin result取得失敗: ${response.status}`,
        debug: { finishOrderCount: 0, payoutTableFound: false, payoutRowCount: 0, payoutCount: 0, sLeaderCarNo: "", hLeaderCarNo: "", bLeaderCarNo: "" },
      };
    }

    const html = await readHtmlResponse(response);
    const resultData = extractNetkeirinResultData(html);
    if (resultData.resultStatus === "confirmed" && resultData.debug.payoutCount === 0) {
      await writeNetkeirinResultDebugFiles(raceId, "payout-missing", html, {
        raceId,
        resultStatus: resultData.resultStatus,
        finishOrderCount: resultData.debug.finishOrderCount,
        payoutTableFound: resultData.debug.payoutTableFound,
        payoutRowCount: resultData.debug.payoutRowCount,
        payoutCount: resultData.debug.payoutCount,
      });
    }

    return {
      ...resultData,
      source: "netkeirin:result",
      sourceNote: `netkeirin result race_id=${raceId}`,
      resultNote:
        resultData.resultStatus === "confirmed"
          ? `netkeirin result accepted: race_id=${raceId} / allFinishOrder: netkeirin full order accepted count=${resultData.result.finishOrder.length}`
          : `netkeirin result pending: no finish order race_id=${raceId}`,
    };
  } catch (error) {
    return {
      ...createPendingRaceResultData(`netkeirin result fetch failed: ${error instanceof Error ? error.message : String(error)}`),
      source: "netkeirin:result",
      sourceNote: `netkeirin result取得失敗: ${error instanceof Error ? error.message : String(error)}`,
      debug: { finishOrderCount: 0, payoutTableFound: false, payoutRowCount: 0, payoutCount: 0, sLeaderCarNo: "", hLeaderCarNo: "", bLeaderCarNo: "" },
    };
  }
}

function normalizeKdreamsPayoutBetType(mainLabel, unitLabel) {
  const main = cleanCellText(mainLabel).replace(/\s+/g, "");
  const unit = cleanCellText(unitLabel).replace(/\s+/g, "");

  if (!main) return "";
  if (main.includes("ワイド")) return "ワイド";
  if (main.includes("2枠連")) return unit === "単" ? "2枠単" : "2枠複";
  if (main.includes("2車連")) return unit === "単" ? "2車単" : "2車複";
  if (main.includes("3連勝")) return unit === "単" ? "3連単" : "3連複";
  return `${main}${unit}`;
}

function normalizeKdreamsNameForComparison(value) {
  return cleanCellText(String(value ?? ""))
    .normalize("NFKC")
    .replace(/[\s　]+/g, "")
    .replace(/[・･]/g, "")
    .trim();
}

function isKdreamsResultNameCompatible(resultName, riderName) {
  const normalizedResultName = normalizeKdreamsNameForComparison(resultName);
  const normalizedRiderName = normalizeKdreamsNameForComparison(riderName);
  if (!normalizedResultName || !normalizedRiderName) return false;
  return normalizedResultName === normalizedRiderName
    || normalizedResultName.includes(normalizedRiderName)
    || normalizedRiderName.includes(normalizedResultName);
}

function extractKdreamsResultRows(html) {
  const tableHtml = html.match(/<table[^>]*class="[^"]*result_table[^"]*"[^>]*>([\s\S]*?)<\/table>/i)?.[1] ?? "";
  if (!tableHtml) return [];

  const rows = Array.from(tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)).map((match) => match[1]);
  return rows.slice(1).map((rowHtml) => {
    const cells = Array.from(rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)).map((match) => match[1]);
    if (cells.length < 8) return null;

    const shbText = cleanCellText(cells[7]).normalize("NFKC");
    return {
      place: cleanCellText(cells[1]),
      carNo: cleanCellText(matchOne(cells[2], [
        /<span[^>]*>([0-9]{1,2})<\/span>/i,
      ])),
      name: cleanCellText(cells[3]),
      margin: cleanCellText(cells[4]),
      agari: cleanCellText(cells[5]),
      kimarite: cleanCellText(cells[6]),
      sMark: shbText.includes("S"),
      hMark: shbText.includes("H"),
      bMark: shbText.includes("B"),
    };
  }).filter((item) => item?.place && item?.carNo && item?.name);
}

function extractKdreamsPayouts(html) {
  const tableHtml = html.match(/<table[^>]*class="[^"]*refund_table[^"]*"[^>]*>([\s\S]*?)<\/table>/i)?.[1] ?? "";
  if (!tableHtml) {
    return { payouts: [], debug: { tableFound: false, rowCount: 0 } };
  }

  const rows = Array.from(tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)).map((match) => match[1]);
  const payouts = [];
  let carriedMainQueue = [];

  for (const rowHtml of rows) {
    let currentMain = "";
    let currentUnit = "";
    const rowMainQueue = [...carriedMainQueue];
    carriedMainQueue = [];
    const cells = Array.from(rowHtml.matchAll(/<(th|td)([^>]*)>([\s\S]*?)<\/\1>/gi)).map((match) => ({
      tag: match[1].toLowerCase(),
      attrs: match[2] ?? "",
      html: match[3] ?? "",
    }));

    for (const cell of cells) {
      if (cell.tag === "th") {
        currentMain = cleanCellText(cell.html);
        currentUnit = "";
        const rowspan = Number.parseInt(matchOne(cell.attrs, [/rowspan="(\d+)"/i]) || "1", 10);
        if (Number.isFinite(rowspan) && rowspan > 1) {
          for (let index = 1; index < rowspan; index += 1) {
            carriedMainQueue.push(currentMain);
          }
        }
        continue;
      }

      if (!currentMain && rowMainQueue.length) {
        currentMain = rowMainQueue.shift() ?? "";
      }

      if (!/<dl/i.test(cell.html)) {
        currentUnit = cleanCellText(cell.html);
        continue;
      }

      const betType = normalizeKdreamsPayoutBetType(currentMain, currentUnit);
      const entries = Array.from(cell.html.matchAll(/<dl[^>]*>([\s\S]*?)<\/dl>/gi)).map((match) => match[1]);
      for (const entry of entries) {
        const combination = cleanCellText(matchOne(entry, [
          /<dt[^>]*>([\s\S]*?)<\/dt>/i,
        ])).replace(/\s+/g, "");
        const payout = cleanCellText(matchOne(entry, [
          /<dd[^>]*>([\s\S]*?)<\/dd>/i,
        ])).replace(/\s+/g, " ").trim();
        const popularity = cleanCellText(matchOne(entry, [
          /<span[^>]*>\((\d+)\)<\/span>/i,
        ]));

        if (!betType || !combination || combination === "未発売" || !payout) continue;
        payouts.push({
          betType,
          combination,
          payout,
          popularity,
        });
      }

      currentMain = "";
      currentUnit = "";
    }
  }

  return {
    payouts,
    debug: {
      tableFound: true,
      rowCount: rows.length,
    },
  };
}

function extractKdreamsResultFinalizedAt(html) {
  const text = stripTags(html).replace(/\s+/g, " ").trim();
  const match = text.match(/(20\d{2})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})\s*更新/);
  if (!match) return "";
  const [, year, month, day, hour, minute] = match;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")} ${String(hour).padStart(2, "0")}:${minute}:00`;
}

function extractKdreamsResultScope(html, resultUrl, raceNo, kdreamsRaceId) {
  const escapedRaceId = String(kdreamsRaceId).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedRaceNo = String(raceNo).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const strippedHtml = stripTags(html);
  return {
    exactUrl: typeof resultUrl === "string" && resultUrl.includes(`/racedetail/${kdreamsRaceId}/`) && resultUrl.includes("pageType=result"),
    htmlHasRaceId: new RegExp(escapedRaceId, "i").test(html),
    htmlHasRaceNo: new RegExp(`(?:^|[^0-9])${escapedRaceNo}R(?:[^0-9]|$)`, "i").test(strippedHtml),
  };
}

function evaluateKdreamsResultCompatibility(resultData, riders) {
  const ridersByCarNo = new Map((Array.isArray(riders) ? riders : []).map((rider) => [String(rider?.carNo ?? ""), rider]));
  let top3CarNosMatchRiders = true;
  let top3NamesMatchRiders = true;
  let reason = "";

  for (const item of resultData.resultTop3.slice(0, 3)) {
    const rider = ridersByCarNo.get(String(item.carNo ?? ""));
    if (!rider) {
      top3CarNosMatchRiders = false;
      reason = `carNo mismatch ${item.carNo}`;
      break;
    }
    if (!isKdreamsResultNameCompatible(item.name, rider.name)) {
      top3NamesMatchRiders = false;
      reason = `name mismatch ${item.carNo}:${item.name} vs ${rider.name}`;
      break;
    }
  }

  return {
    top3CarNosMatchRiders,
    top3NamesMatchRiders,
    ok: top3CarNosMatchRiders && top3NamesMatchRiders,
    reason,
  };
}

function formatKdreamsResultDiagnostics(prefix, details) {
  return `${prefix} top3=${details.top3Count} payouts=${details.payoutCount} exactUrl=${details.exactUrl} htmlRaceId=${details.htmlHasRaceId} htmlRaceNo=${details.htmlHasRaceNo} result=${details.resultUrl}`;
}

function extractKdreamsResultData(html, resultUrl, raceNo, kdreamsRaceId) {
  const resultRows = extractKdreamsResultRows(html);
  const top3Rows = resultRows.slice(0, 3);
  const payoutExtraction = extractKdreamsPayouts(html);
  const payouts = payoutExtraction.payouts;
  const scope = extractKdreamsResultScope(html, resultUrl, raceNo, kdreamsRaceId);
  const isConfirmed = top3Rows.length >= 3 && payouts.length > 0;
  let pendingReason = "parse empty";
  if (top3Rows.length < 3) {
    pendingReason = "no finish order";
  } else if (payouts.length === 0) {
    pendingReason = "payout missing";
  } else if (!scope.exactUrl) {
    pendingReason = "exact url mismatch";
  }
  const finishOrder = resultRows.map((item) => createFinishOrderItem(item, {
    rank: item.place,
    gap: item.margin,
    mark: `${item.sMark ? "S" : ""}${item.hMark ? "H" : ""}${item.bMark ? "B" : ""}`,
  }));
  const sLeaderCarNo = getNetkeirinLeaderCarNoFromRows(resultRows, "sMark");
  const hLeaderCarNo = getNetkeirinLeaderCarNoFromRows(resultRows, "hMark");
  const bLeaderCarNo = getNetkeirinLeaderCarNoFromRows(resultRows, "bMark");
  const result = {
    ...createPendingRaceResultData().result,
    status: isConfirmed ? "confirmed" : "pending",
    finishOrder,
    kimarite: top3Rows[0]?.kimarite ?? "",
    secondKimarite: top3Rows[1]?.kimarite ?? "",
    sLeaderCarNo,
    hLeaderCarNo,
    bLeaderCarNo,
    payout2tan: pickNetkeirinPayoutItem(payouts, ["2車単", "二車単"]),
    payout2fuku: pickNetkeirinPayoutItem(payouts, ["2車複", "二車複"], true),
    payout3tan: pickNetkeirinPayoutItem(payouts, ["3連単", "三連単"]),
    payout3fuku: pickNetkeirinPayoutItem(payouts, ["3連複", "三連複"]),
    payoutWide: pickNetkeirinPayoutItem(payouts, ["ワイド"], true),
    finalizedAt: isConfirmed ? extractKdreamsResultFinalizedAt(html) : "",
  };

  return {
    resultStatus: result.status,
    resultNote: isConfirmed ? "" : formatKdreamsResultDiagnostics(`kdreams result pending: ${pendingReason}`, {
      top3Count: top3Rows.length,
      payoutCount: payouts.length,
      exactUrl: scope.exactUrl,
      htmlHasRaceId: scope.htmlHasRaceId,
      htmlHasRaceNo: scope.htmlHasRaceNo,
      resultUrl,
    }),
    resultTop3: top3Rows,
    payouts,
    result,
    pendingReason,
    scope,
    debug: {
      finishOrderCount: finishOrder.length,
      payoutTableFound: payoutExtraction.debug.tableFound,
      payoutRowCount: payoutExtraction.debug.rowCount,
      payoutCount: payouts.length,
      resultRowCount: resultRows.length,
      sLeaderCarNo,
      hLeaderCarNo,
      bLeaderCarNo,
    },
  };
}

async function fetchKdreamsRaceResult(slug, kdreamsRaceId, raceNo, riders) {
  const url = buildKdreamsRaceResultDetailUrl(slug, kdreamsRaceId);
  if (!url) {
    return {
      ...createPendingRaceResultData("kdreams result skipped: url unavailable"),
      source: "kdreams:result",
      sourceNote: "kdreams result unavailable",
      debug: { finishOrderCount: 0, payoutTableFound: false, payoutRowCount: 0, payoutCount: 0, sLeaderCarNo: "", hLeaderCarNo: "", bLeaderCarNo: "" },
    };
  }

  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0",
        "accept-language": "ja-JP,ja;q=0.9,en;q=0.8",
      },
    });

    if (!response.ok) {
      return {
        ...createPendingRaceResultData(`kdreams result fetch failed: ${response.status}`),
        source: "kdreams:result",
        sourceNote: `kdreams result取得失敗: ${response.status} result=${url}`,
        debug: { finishOrderCount: 0, payoutTableFound: false, payoutRowCount: 0, payoutCount: 0, sLeaderCarNo: "", hLeaderCarNo: "", bLeaderCarNo: "" },
      };
    }

    const html = await response.text();
    const resultData = extractKdreamsResultData(html, url, raceNo, kdreamsRaceId);
    const diagnostics = {
      top3Count: resultData.resultTop3.length,
      payoutCount: resultData.payouts.length,
      exactUrl: resultData.scope.exactUrl,
      htmlHasRaceId: resultData.scope.htmlHasRaceId,
      htmlHasRaceNo: resultData.scope.htmlHasRaceNo,
      resultUrl: url,
    };

    if (!savedKdreamsResultDebugSample && (!resultData.scope.exactUrl || !hasConfirmedRaceResult(resultData))) {
      savedKdreamsResultDebugSample = true;
      await writeKdreamsResultSampleDebugFiles(kdreamsRaceId, html, {
        raceNo,
        resultUrl: url,
        scope: resultData.scope,
        top3Count: resultData.resultTop3.length,
        payoutCount: resultData.payouts.length,
        resultTop3: resultData.resultTop3,
        payouts: resultData.payouts,
      });
    }

    if (!resultData.scope.exactUrl) {
      return {
        ...createPendingRaceResultData(formatKdreamsResultDiagnostics("kdreams result pending: exact url mismatch", diagnostics)),
        source: "kdreams:result",
        sourceNote: `kdreams result pending result=${url}`,
        debug: {
          finishOrderCount: resultData.debug.finishOrderCount,
          payoutTableFound: resultData.debug.payoutTableFound,
          payoutRowCount: resultData.debug.payoutRowCount,
          payoutCount: resultData.debug.payoutCount,
          sLeaderCarNo: resultData.debug.sLeaderCarNo,
          hLeaderCarNo: resultData.debug.hLeaderCarNo,
          bLeaderCarNo: resultData.debug.bLeaderCarNo,
        },
      };
    }

    if (resultData.resultTop3.length < 3 || resultData.payouts.length === 0) {
      return {
        ...createPendingRaceResultData(formatKdreamsResultDiagnostics(`kdreams result pending: ${resultData.pendingReason || "parse empty"}`, diagnostics)),
        source: "kdreams:result",
        sourceNote: `kdreams result pending result=${url}`,
        debug: {
          finishOrderCount: resultData.debug.finishOrderCount,
          payoutTableFound: resultData.debug.payoutTableFound,
          payoutRowCount: resultData.debug.payoutRowCount,
          payoutCount: resultData.debug.payoutCount,
          sLeaderCarNo: resultData.debug.sLeaderCarNo,
          hLeaderCarNo: resultData.debug.hLeaderCarNo,
          bLeaderCarNo: resultData.debug.bLeaderCarNo,
        },
      };
    }

    const compatibility = evaluateKdreamsResultCompatibility(resultData, riders);
    if (!compatibility.ok) {
      return {
        ...createPendingRaceResultData(formatKdreamsResultDiagnostics(`kdreams result rejected: ${compatibility.reason}`, diagnostics)),
        source: "kdreams:result",
        sourceNote: `kdreams result rejected: ${compatibility.reason} result=${url}`,
        debug: {
          finishOrderCount: resultData.debug.finishOrderCount,
          payoutTableFound: resultData.debug.payoutTableFound,
          payoutRowCount: resultData.debug.payoutRowCount,
          payoutCount: resultData.debug.payoutCount,
          sLeaderCarNo: resultData.debug.sLeaderCarNo,
          hLeaderCarNo: resultData.debug.hLeaderCarNo,
          bLeaderCarNo: resultData.debug.bLeaderCarNo,
        },
      };
    }

    const resultScopeNote = Array.isArray(riders) && riders.length > resultData.result.finishOrder.length && resultData.resultTop3.length > 0
      ? `KDreamsでは3着まで / allFinishOrder: kdreams only top3 available`
      : "";

    return {
      ...resultData,
      source: "kdreams:result",
      sourceNote: resultScopeNote ? `kdreams result=${url} / ${resultScopeNote}` : `kdreams result=${url}`,
      resultNote: resultScopeNote
        ? `${formatKdreamsResultDiagnostics("kdreams result accepted:", diagnostics)} / ${resultScopeNote}`
        : formatKdreamsResultDiagnostics("kdreams result accepted:", diagnostics),
    };
  } catch (error) {
    return {
      ...createPendingRaceResultData(`kdreams result fetch failed: ${error instanceof Error ? error.message : String(error)}`),
      source: "kdreams:result",
      sourceNote: `kdreams result取得失敗: ${error instanceof Error ? error.message : String(error)} result=${url}`,
      debug: { finishOrderCount: 0, payoutTableFound: false, payoutRowCount: 0, payoutCount: 0, sLeaderCarNo: "", hLeaderCarNo: "", bLeaderCarNo: "" },
    };
  }
}

async function fetchRaceOddsWithFallback({ raceId, venue, raceNo, detailLink }) {
  if (SOURCE_POLICY.kdreams) {
    const kdreamsOdds = await fetchKdreamsTrifectaOdds(detailLink?.slug ?? venue.slug, detailLink?.raceId);
    if (hasMeaningfulRaceOdds(kdreamsOdds)) {
      console.log(
        `[odds] ${venue.venue} ${raceNo}R kdreams=accepted count=${kdreamsOdds.oddsTrifecta.length} matrix=${kdreamsOdds.matrixCount} popular=${kdreamsOdds.popularityCount}`,
      );
      return kdreamsOdds;
    }

    if (!SOURCE_POLICY.netkeirin) {
      console.log(`[odds] ${venue.venue} ${raceNo}R kdreams=${kdreamsOdds.reason}`);
      return {
        ...createEmptyRaceOddsData(),
        source: "pending",
        oddsNote: kdreamsOdds.oddsNote,
      };
    }
  }

  const netkeirinOdds = SOURCE_POLICY.netkeirin
    ? await fetchNetkeirinTrifectaOddsForRaceId(raceId)
    : { ...createEmptyRaceOddsData(), source: "netkeirin:disabled", reason: "disabled by source policy", oddsNote: "netkeirin odds disabled by source policy" };
  if (hasMeaningfulRaceOdds(netkeirinOdds)) {
    console.log(
      `[odds] ${venue.venue} ${raceNo}R source=${netkeirinOdds.source} count=${netkeirinOdds.oddsTrifecta.length} reason=${netkeirinOdds.reason} usedKey=${netkeirinOdds.usedKey} rawRows=${netkeirinOdds.rawRows} normalizedRows=${netkeirinOdds.normalizedRows}`,
    );
    return netkeirinOdds;
  }

  const netkeirinFailureNote = `netkeirin odds fetch failed: ${netkeirinOdds.reason}`;
  const kdreamsOdds = await fetchKdreamsTrifectaOdds(detailLink?.slug ?? venue.slug, detailLink?.raceId);
  if (hasMeaningfulRaceOdds(kdreamsOdds)) {
    console.log(
      `[odds] ${venue.venue} ${raceNo}R netkeirin=${netkeirinOdds.reason} kdreams=accepted count=${kdreamsOdds.oddsTrifecta.length} matrix=${kdreamsOdds.matrixCount} popular=${kdreamsOdds.popularityCount}`,
    );
    return {
      ...kdreamsOdds,
      oddsNote: `${netkeirinFailureNote} / ${kdreamsOdds.oddsNote}`,
    };
  }

  // TODO: Probe WINTICKET / OddsPark odds pages if KDreams odds become unavailable or structurally unstable.
  console.log(
    `[odds] ${venue.venue} ${raceNo}R netkeirin=${netkeirinOdds.reason} kdreams=${kdreamsOdds.reason}`,
  );

  return {
    ...createEmptyRaceOddsData(),
    source: "pending",
    oddsNote: `${netkeirinFailureNote} / ${kdreamsOdds.oddsNote}`,
  };
}

async function runKdreamsOddsDebug() {
  const slug = getArgValue("--slug", "matsuyama");
  const raceId = getArgValue("--race-id", "7520260526030001");
  const venueName = getArgValue("--venue", "松山");
  const raceNo = getArgValue("--race-no", "1");
  const oddsData = await fetchKdreamsTrifectaOdds(slug, raceId);
  console.log(`[odds-debug] ${venueName} ${raceNo}R 3連単 人気順 top15`);
  oddsData.oddsTrifecta.slice(0, 15).forEach((item, index) => {
    console.log(`${item.popularity ?? index + 1} ${item.combination} ${Number(item.odds).toFixed(1)}`);
  });
  console.log("[odds-debug] finalTrifectaFavorite", JSON.stringify(oddsData.finalTrifectaFavorite, null, 2));
}

async function fetchRaceResultWithFallback({ raceId, date, venue, raceNo, detailLink, riders }) {
  const kdreamsResult = SOURCE_POLICY.kdreams
    ? await fetchKdreamsRaceResult(detailLink?.slug ?? venue.slug, detailLink?.raceId, raceNo, riders)
    : { ...createPendingRaceResultData("kdreams result disabled by source policy"), source: "kdreams:disabled", sourceNote: "kdreams result disabled by source policy" };
  if (hasConfirmedRaceResult(kdreamsResult)) {
    console.log(
      `[result] ${venue.venue} ${raceNo}R kdreams=accepted top3=${kdreamsResult.resultTop3.length} payouts=${kdreamsResult.payouts.length}`,
    );
    return kdreamsResult;
  }

  const netkeirinResult = SOURCE_POLICY.netkeirin
    ? await fetchNetkeirinRaceResult(raceId)
    : { ...createPendingRaceResultData("netkeirin result disabled by source policy"), source: "netkeirin:disabled", sourceNote: "netkeirin result disabled by source policy" };
  if (hasConfirmedRaceResult(netkeirinResult)) {
    console.log(
      `[result] ${venue.venue} ${raceNo}R kdreams=${kdreamsResult.resultNote || kdreamsResult.sourceNote} netkeirin=accepted top3=${netkeirinResult.resultTop3.length} payouts=${netkeirinResult.payouts.length}`,
    );
    return netkeirinResult;
  }

  const oddsparkResult = SOURCE_POLICY.oddspark
    ? await fetchOddsParkRaceDetailFallback({
        date,
        venueCode: venue.venueCode,
        raceNo,
        venueName: venue.venue,
      })
    : createExternalRaceProbeResult("oddspark", "", "resultFallback: oddspark disabled by source policy");
  if (oddsparkResult.ok) {
    console.log(
      `[result] ${venue.venue} ${raceNo}R kdreams=${kdreamsResult.resultNote || kdreamsResult.sourceNote} netkeirin=${netkeirinResult.resultNote || netkeirinResult.sourceNote} oddspark=accepted finish=${oddsparkResult.finishOrder.length} payouts=${oddsparkResult.payouts.length}`,
    );
    return {
      resultStatus: oddsparkResult.result?.status ?? "confirmed",
      resultNote: oddsparkResult.note,
      resultTop3: oddsparkResult.resultTop3 ?? [],
      payouts: oddsparkResult.payouts,
      result: oddsparkResult.result,
      source: "oddspark:result",
      sourceNote: `${oddsparkResult.note} result=${oddsparkResult.url}`,
    };
  }

  console.log(
    `[result] ${venue.venue} ${raceNo}R kdreams=${kdreamsResult.resultNote || kdreamsResult.sourceNote} netkeirin=${netkeirinResult.resultNote || netkeirinResult.sourceNote} oddspark=${oddsparkResult.note}`,
  );

  return {
    ...createPendingRaceResultData(`${netkeirinResult.resultNote || netkeirinResult.sourceNote} / ${kdreamsResult.resultNote || kdreamsResult.sourceNote} / ${oddsparkResult.note}`),
    source: "pending",
    sourceNote: kdreamsResult.sourceNote || netkeirinResult.sourceNote,
  };
}

async function main() {
  const updatePhase = resolveUpdatePhase();
  const todayIso = getJstTodayIso();
  if (!shouldWritePublic) {
    console.log("[mode] local debug output");
    console.log(`[mode] writing generated data to ${OUTPUT_PATH}`);
  }
  const activeSources = [
    SOURCE_POLICY.kdreams ? "kdreams" : "",
    SOURCE_POLICY.chariloto && ["lineup", "backfill", "final"].includes(updatePhase.phase) ? "chariloto" : "",
    SOURCE_POLICY.netkeirin ? "netkeirin" : "",
    SOURCE_POLICY.oddspark ? "oddspark" : "",
    SOURCE_POLICY.winticket ? "winticket" : "",
  ].filter(Boolean).join(",");
  console.log(`[phase] ${updatePhase.explicit ? "manual" : "auto"} jst=${updatePhase.jst} phase=${updatePhase.phase} session=${updatePhase.session} sources=${activeSources}`);
  const existingTodayFeed = await loadExistingTodayFeedForCache(OUTPUT_PATH, todayIso);
  const existingRaceCache = buildExistingRaceCache(existingTodayFeed.payload);
  if (existingTodayFeed.path) {
    console.log(`[cache] using existing feed ${existingTodayFeed.path}`);
  } else {
    console.log(`[cache] no reusable existing feed for ${todayIso}`);
  }
  const overrides = await readOverrides();
  const scheduleData = [
    ...(await readUpcomingScheduleData()),
    ...(await readRaceScheduleData()),
  ];
  let cacheReusedCount = 0;
  let cacheSkippedIncompleteCount = 0;
  let cacheFetchedCount = 0;

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

  const html = await readHtmlResponse(response);
  await fs.writeFile(KDREAMS_DEBUG_HTML_PATH, html, "utf-8");

  const operationUpdatedAt = `${getJstNowParts().isoDateTime}+09:00`;
  const { venues: todayVenues, debug } = parseKdreamsTodayVenues(html, todayIso, scheduleData, operationUpdatedAt);
  await fs.writeFile(
    DEBUG_JSON_PATH,
    JSON.stringify({ todayIso, matchedCount: todayVenues.length, debug }, null, 2),
    "utf-8"
  );

  let savedSample = false;
  let savedKdreamsSample = false;

  for (const venue of todayVenues) {
    const override = overrides[venue.venue] ?? {};
    const overrideRaces = Array.isArray(override.races) ? override.races : [];
    const raceNos = Array.isArray(venue.raceNos) ? venue.raceNos : [];

    const fetchedRaces = [];
    for (const raceNo of raceNos) {
      const extra = overrideRaces.find((item) => item.raceNo === raceNo) ?? {};
      const detailLink = Array.isArray(venue.raceDetailLinks)
        ? venue.raceDetailLinks.find((item) => item.raceNo === raceNo)
        : undefined;
      const kdreamsRaceId = detailLink?.raceId ?? venue.raceIds?.[raceNos.indexOf(raceNo)] ?? "";
      const cachedRace = existingRaceCache.get(buildRaceCacheKey({
        venue: venue.venue,
        raceNo,
        raceId: kdreamsRaceId,
      })) ?? existingRaceCache.get(buildRaceCacheKey({
        venue: venue.venue,
        raceNo,
      }));
      const cachedRaceRefreshReason = getCachedRaceRefreshReason(cachedRace, venue.venue);
      const canUseStaleRaceAsFallback = cachedRaceRefreshReason
        && /rider fields sparse|rider identity incomplete|kdreams lineup missing/i.test(cachedRaceRefreshReason)
        && !hasMojibakeRace(cachedRace, venue.venue)
        && !hasPolicyMismatchSourceNote(cachedRace?.sourceNote);
      const effectiveCachedRace = cachedRaceRefreshReason && !canUseStaleRaceAsFallback ? null : cachedRace;
      const incompleteCacheReason = getReusableFinalRaceSkipReason(cachedRace);

      if (!cachedRaceRefreshReason && isReusableFinalRace(cachedRace) && !shouldFetchOddsForRace(cachedRace, venue, updatePhase)) {
        const reusableRace = prepareCachedRaceForReuse(cachedRace, raceNo);
        const venueOperation = {
          status: venue.venueOperationStatus ?? "scheduled",
          label: venue.venueOperationLabel ?? "",
          reason: venue.venueOperationReason ?? "",
          raw: venue.venueOperationRaw ?? "",
        };
        const racecardOperation = {
          status: detailLink?.racecardOperationStatus ?? "scheduled",
          label: detailLink?.racecardOperationLabel ?? "",
          reason: detailLink?.racecardOperationReason ?? "",
          raw: "",
        };
        const resolvedOperation = resolveRaceOperationStatus({
          venueOperation,
          raceOperation: normalizeOperationStatus(reusableRace.raceOperationRaw || racecardOperation.raw, racecardOperation.status),
          resultStatus: reusableRace.resultStatus,
        });
        const resolvedOperationSource = ["cancelled", "postponed", "suspended"].includes(venueOperation.status)
          ? venue.venueOperationSource || "kdreams:racecard"
          : reusableRace.raceOperationSource || "kdreams:racecard";
        fetchedRaces.push({
          ...reusableRace,
          ...createOperationFields("race", resolvedOperation, resolvedOperationSource, operationUpdatedAt),
          ...extra,
          riders: Array.isArray(extra.riders) && extra.riders.length ? extra.riders : reusableRace.riders,
        });
        cacheReusedCount += 1;
        console.log(`[skip] ${venue.venue} ${raceNo}R finalized complete; skip all fetch`);
        continue;
      }

      if (incompleteCacheReason) {
        cacheSkippedIncompleteCount += 1;
        console.log(`[cache] skip finalized race because ${incompleteCacheReason} ${venue.venue} ${raceNo}R`);
      }

      if (cachedRaceRefreshReason) {
        console.log(`[cache] ignore stale race because ${cachedRaceRefreshReason} ${venue.venue} ${raceNo}R`);
      }

      cacheFetchedCount += 1;
      const netkeirinRaceId = buildNetkeirinRaceId(todayIso, venue.venueCode, raceNo);
      const needsSeedDetail = !effectiveCachedRace || !String(effectiveCachedRace.time ?? "").trim() || !String(effectiveCachedRace.title ?? "").trim();
      const fetchLineup = shouldFetchLineupForRace(effectiveCachedRace, venue, updatePhase);
      const fetchRiderDetail = shouldFetchRiderDetailForRace(effectiveCachedRace, venue, updatePhase);
      const fetchOdds = shouldFetchOddsForRace(effectiveCachedRace, venue, updatePhase);
      const fetchResult = shouldFetchResultForRace(effectiveCachedRace, venue, updatePhase);

      let detailRace = effectiveCachedRace
        ? { ...effectiveCachedRace, raceNo }
        : createEmptyRaceDetail(raceNo, "cache missing");
      detailRace = sanitizeRaceForCurrentPolicy(detailRace);

      if (needsSeedDetail || fetchLineup || fetchRiderDetail) {
        console.log(`[fetch] ${venue.venue} ${raceNo}R detail ${needsSeedDetail ? "seed" : "phase-driven"}`);
        const kdreamsRace = SOURCE_POLICY.kdreams
          ? await fetchKdreamsRaceDetail(
              detailLink?.slug ?? venue.slug,
              detailLink?.raceId,
              raceNo,
              !savedKdreamsSample,
            )
          : createEmptyRaceDetail(raceNo, "kdreams racedetail disabled by source policy");
        const netkeirinRace = SOURCE_POLICY.netkeirin
          ? await fetchNetkeirinRaceDetail(todayIso, venue.venueCode, raceNo, !savedSample)
          : createEmptyRaceDetail(raceNo, "netkeirin racedetail disabled by source policy");
        if (/^netkeirin race_id=/.test(netkeirinRace.sourceNote)) {
          savedSample = true;
        }
        if (/^kdreams racedetail=/.test(kdreamsRace.sourceNote)) {
          savedKdreamsSample = true;
        }
        detailRace = mergeRaceDetailWithFallback(mergeRaceDetailWithFallback(kdreamsRace, netkeirinRace), detailRace);
      } else {
        console.log(`[skip] ${venue.venue} ${raceNo}R detail skipped outside lineup/detail window`);
      }

      if (SOURCE_POLICY.chariloto && fetchLineup && !hasLineupValue(detailRace)) {
        const charilotoRace = await fetchCharilotoRaceDetailFallback({
          date: todayIso,
          venueCode: venue.venueCode,
          raceNo,
          venueName: venue.venue,
        });
        detailRace = mergeRaceDetailWithFallback(detailRace, convertExternalProbeToRaceDetail(raceNo, charilotoRace));
        detailRace.sourceNote = appendUniqueNote(detailRace.sourceNote, charilotoRace.note);
        detailRace.sourceNote = appendUniqueNote(detailRace.sourceNote, "riderFallback: chariloto unavailable");
      }

      if (SOURCE_POLICY.oddspark && (fetchLineup || fetchRiderDetail) && (!hasLineupValue(detailRace) || !isRaceRiderDetailCheckedOrComplete(detailRace))) {
        const oddsparkDetail = await fetchOddsParkRaceDetailFallback({
          date: todayIso,
          venueCode: venue.venueCode,
          raceNo,
          venueName: venue.venue,
        });
        detailRace = mergeRaceDetailWithFallback(detailRace, convertExternalProbeToRaceDetail(raceNo, oddsparkDetail));
        detailRace.sourceNote = appendUniqueNote(detailRace.sourceNote, oddsparkDetail.note);
        detailRace.sourceNote = appendUniqueNote(
          detailRace.sourceNote,
          oddsparkDetail.lineupNote || (oddsparkDetail.lineupRaw ? "lineFallback: oddspark lineup accepted" : "lineFallback: oddspark lineup unavailable"),
        );
        if (!Array.isArray(oddsparkDetail.riders) || oddsparkDetail.riders.length === 0) {
          detailRace.sourceNote = appendUniqueNote(detailRace.sourceNote, "riderFallback: oddspark unavailable");
        }
      }

      if (SOURCE_POLICY.winticket && (fetchLineup || fetchRiderDetail) && !String(detailRace.winticketLineupRaw ?? "").trim()) {
        const winticketRace = await fetchWinticketRaceFallback({
          date: todayIso,
          venueCode: venue.venueCode,
          raceNo,
          venueName: venue.venue,
        });
        detailRace = mergeRaceDetailWithFallback(detailRace, convertExternalProbeToRaceDetail(raceNo, winticketRace));
        detailRace.sourceNote = appendUniqueNote(detailRace.sourceNote, winticketRace.note);
        detailRace.sourceNote = appendUniqueNote(detailRace.sourceNote, "riderFallback: winticket skipped");
      }

      if (!Array.isArray(detailRace.riders) || !detailRace.riders.some((rider) => hasSubstantiveRiderDetail(rider))) {
        if (/kdreams racedetail=/i.test(String(detailRace.sourceNote ?? ""))) {
          detailRace.sourceNote = appendUniqueNote(detailRace.sourceNote, "riderFallback: kdreams detail lacks stats");
        }
      }

      detailRace.sourceNote = sanitizeSourceNoteForPolicy(detailRace.sourceNote);

      if (detailRace.sourceNote.includes("fallback")) {
        console.log(`[fallback] ${venue.venue} ${raceNo}R detail fallback used`);
      }
      const oddsData = fetchOdds
        ? await fetchRaceOddsWithFallback({
            raceId: netkeirinRaceId,
            venue,
            raceNo,
            detailLink,
          })
        : {
            ...createEmptyRaceOddsData(),
            oddsNote: appendUniqueNote(detailRace.oddsNote, `odds skipped outside ${updatePhase.phase} window`),
          };
      if (!fetchOdds) {
        console.log(`[skip] ${venue.venue} ${raceNo}R odds skipped outside odds window`);
      }

      const resultData = fetchResult
        ? await fetchRaceResultWithFallback({
            raceId: netkeirinRaceId,
            date: todayIso,
            venue,
            raceNo,
            detailLink,
            riders: detailRace.riders,
          })
        : {
            ...createPendingRaceResultData(detailRace.resultNote || "result skipped in current phase"),
            resultStatus: detailRace.resultStatus,
            resultTop3: detailRace.resultTop3,
            payouts: detailRace.payouts,
            result: detailRace.result,
          };
      if (!fetchResult) {
        console.log(`[skip] ${venue.venue} ${raceNo}R result skipped in ${updatePhase.phase} phase`);
      } else if (effectiveCachedRace && (effectiveCachedRace.resultStatus !== "confirmed" || effectiveCachedRace.result?.status !== "confirmed")) {
        console.log(`[fetch] ${venue.venue} ${raceNo}R pending; result only`);
      }
      const hasFreshOdds =
        Boolean(oddsData.finalTrifectaFavorite) &&
        Array.isArray(oddsData.oddsTrifecta) &&
        oddsData.oddsTrifecta.length > 0;
      const venueOperation = {
        status: venue.venueOperationStatus ?? "scheduled",
        label: venue.venueOperationLabel ?? "",
        reason: venue.venueOperationReason ?? "",
        raw: venue.venueOperationRaw ?? "",
      };
      const raceDetailOperation = {
        status: detailRace.raceOperationStatus ?? detailLink?.racecardOperationStatus ?? "unknown",
        label: detailRace.raceOperationLabel ?? detailLink?.racecardOperationLabel ?? "",
        reason: detailRace.raceOperationReason ?? detailLink?.racecardOperationReason ?? "",
        raw: detailRace.raceOperationRaw ?? "",
      };
      const resolvedRaceOperation = resolveRaceOperationStatus({
        venueOperation,
        raceOperation: raceDetailOperation,
        resultStatus: hasConfirmedRaceResult(resultData) ? resultData.resultStatus : detailRace.resultStatus,
      });
      const resolvedRaceOperationSource = ["cancelled", "postponed", "suspended"].includes(venueOperation.status)
        ? venue.venueOperationSource || "kdreams:racecard"
        : detailRace.raceOperationSource || detailLink?.racecardOperationSource || "kdreams:racecard";
      const race = sanitizeRaceForCurrentPolicy({
        ...detailRace,
        ...createOperationFields("race", resolvedRaceOperation, resolvedRaceOperationSource, operationUpdatedAt),
        oddsPreview:
          hasFreshOdds
            ? oddsData.oddsPreview
            : Array.isArray(detailRace.oddsPreview) && detailRace.oddsPreview.length
              ? detailRace.oddsPreview
              : oddsData.oddsPreview,
        oddsTrifecta:
          hasFreshOdds
            ? oddsData.oddsTrifecta
            : Array.isArray(detailRace.oddsTrifecta) && detailRace.oddsTrifecta.length
              ? detailRace.oddsTrifecta
              : oddsData.oddsTrifecta,
        topOdds: hasFreshOdds ? oddsData.topOdds ?? null : detailRace.topOdds ?? oddsData.topOdds ?? null,
        topTrifectaOdds: hasFreshOdds ? oddsData.topTrifectaOdds ?? null : detailRace.topTrifectaOdds ?? oddsData.topTrifectaOdds ?? null,
        favoriteOdds: hasFreshOdds ? oddsData.favoriteOdds ?? null : detailRace.favoriteOdds ?? oddsData.favoriteOdds ?? null,
        favoriteCombination: hasFreshOdds ? oddsData.favoriteCombination || "" : detailRace.favoriteCombination || oddsData.favoriteCombination || "",
        finalTrifectaFavorite: hasFreshOdds ? oddsData.finalTrifectaFavorite : detailRace.finalTrifectaFavorite ?? oddsData.finalTrifectaFavorite ?? null,
        oddsNote: oddsData.oddsNote || detailRace.oddsNote || "",
        resultNote: resultData.resultNote || detailRace.resultNote || "",
        resultStatus: hasConfirmedRaceResult(resultData) ? resultData.resultStatus : detailRace.resultStatus,
        resultTop3:
          hasConfirmedRaceResult(resultData) && Array.isArray(resultData.resultTop3) && resultData.resultTop3.length
            ? resultData.resultTop3
            : detailRace.resultTop3,
        payouts:
          hasConfirmedRaceResult(resultData) && Array.isArray(resultData.payouts) && resultData.payouts.length
            ? resultData.payouts
            : detailRace.payouts,
        result: hasConfirmedRaceResult(resultData) ? resultData.result : detailRace.result,
        sourceNote:
          resultData.source && resultData.source.startsWith("kdreams:") && hasConfirmedRaceResult(resultData)
            ? `${detailRace.sourceNote} / resultFallback: ${resultData.sourceNote}`
            : resultData.source && resultData.source.startsWith("oddspark:") && hasConfirmedRaceResult(resultData)
              ? `${detailRace.sourceNote} / resultFallback: ${resultData.sourceNote}`
            : detailRace.sourceNote,
      });
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
    const { raceDetailLinks, ...publicVenue } = venue;

    return {
      ...publicVenue,
      ...override,
      races: venue.races,
    };
  });

  const payload = {
    generatedAt: new Date().toLocaleString("ja-JP", { hour12: false }),
    source: {
      racecard: KDREAMS_RACECARD_URL,
      detailPrimary: `${NETKEIRIN_ENTRY_URL}?race_id=[YYYYMMDD][venueCode][raceNo]&rf=racetoplive`,
      detailFallback: `${KDREAMS_RACE_DETAIL_BASE_URL}/[slug]/racedetail/[kdreamsRaceId]/`,
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
  console.log(`[cache] finalized reused=${cacheReusedCount}, skippedIncomplete=${cacheSkippedIncompleteCount}, fetched=${cacheFetchedCount}`);
  console.log(`matched venues=${todayVenues.length}`);
  console.log(`Generated ${venues.length} venues with race details -> ${OUTPUT_PATH}`);
  console.log(`parse debug -> ${DEBUG_JSON_PATH}`);
  console.log(`netkeirin sample html -> ${NETKEIRIN_SAMPLE_HTML_PATH}`);
  console.log(`kdreams sample html -> ${KDREAMS_SAMPLE_DETAIL_HTML_PATH}`);
}

const entrypoint = debugKdreamsOdds ? runKdreamsOddsDebug : main;

entrypoint().catch((error) => {
  console.error(error);
  process.exit(1);
});
