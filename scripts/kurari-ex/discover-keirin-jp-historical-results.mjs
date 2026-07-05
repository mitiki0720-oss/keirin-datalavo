import { createHash } from "node:crypto";
import process from "node:process";
import * as cheerio from "cheerio";

const PROVIDER = "KEIRIN.JP";
const PARSER_VERSION = "kurari-ex-keirin-jp-historical-discovery/v1";
const BASE_URL = "https://keirin.jp";
const USER_AGENT = "kurari-ex-historical-endpoint-discovery/1.0";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

function parseArgs(argv) {
  const options = {
    date: "",
    venueCode: "",
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--date") {
      options.date = argv[index + 1] ?? "";
      index += 1;
    } else if (arg === "--venue-code") {
      options.venueCode = argv[index + 1] ?? "";
      index += 1;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  return options;
}

function isValidDate(value) {
  if (!DATE_PATTERN.test(value)) return false;
  return new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function cookiesFrom(response) {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(";", 1)[0])
    .join("; ");
}

async function fetchText(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "user-agent": USER_AGENT,
      ...(init.headers ?? {}),
    },
  });
  return {
    response,
    text: await response.text(),
  };
}

function extractJsonAssignment(html, key) {
  const marker = `jsonData['${key}'] = `;
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) return null;

  const start = markerIndex + marker.length;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < html.length; index += 1) {
    const character = html[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return JSON.parse(html.slice(start, index + 1));
    }
  }
  return null;
}

function discoverScheduleCandidates(html, day) {
  const $ = cheerio.load(html);
  const candidates = [];

  $("table tbody tr").each((_rowIndex, row) => {
    const venueLink = $(row).find('a[href*="/pc/jyosellinfo?jocd="]').first();
    const venue = venueLink.text().trim();
    const venueCode = new URL(
      venueLink.attr("href") ?? "/",
      BASE_URL,
    ).searchParams.get("jocd") ?? "";
    if (!venue || !venueCode) return;

    let cursor = 1;
    $(row).find("td.td_day").each((_cellIndex, cell) => {
      const span = Number($(cell).attr("colspan") ?? 1);
      const link = $(cell).find("a[data-pprm-encp]").first();
      if (link.length > 0 && day >= cursor && day < cursor + span) {
        candidates.push({
          venue,
          venueCode,
          eventStartDay: cursor,
          eventEndDay: cursor + span - 1,
          encp: link.attr("data-pprm-encp") ?? "",
          displayKind: link.attr("data-pprm-dkbn") ?? "",
        });
      }
      cursor += span;
    });
  });

  return candidates;
}

function cleanText(value) {
  return String(value ?? "")
    .replaceAll(/<br\s*\/?>/giu, " ")
    .replaceAll(/\s+/gu, " ")
    .trim();
}

function raceClassesForDay(dayData) {
  const values = [];
  for (const group of dayData?.raceEventDataList ?? []) {
    const count = Number(group.strColspan ?? 0);
    for (let index = 0; index < count; index += 1) {
      values.push(cleanText(group.strRaceEvent) || null);
    }
  }
  return values;
}

function finishRows(detail) {
  return Array.isArray(detail?.tyakujyunItemSubData)
    ? detail.tyakujyunItemSubData
    : [];
}

function trifectaRows(detail) {
  const rows = detail?.haraiGakuSubData?.RT3HaraiGakuDispItemSubData;
  return Array.isArray(rows) ? rows : [];
}

function positiveInteger(value) {
  const parsed = Number(String(value ?? "").replaceAll(",", ""));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function present(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function availability(count, total) {
  if (count <= 0) return "unavailable";
  if (count === total) return "available";
  return "partial";
}

function summarizeFields(probes) {
  const accepted = probes.filter((probe) => probe.accepted);
  const total = accepted.length;
  const count = (predicate) => accepted.filter(predicate).length;
  const anyFinishMark = (probe, mark) =>
    probe.finishRows.some((row) => String(row.BH ?? "").includes(mark));

  if (total === 0) return {};
  return {
    basic: {
      date: "available",
      venue: "available",
      venueCode: "available",
      raceNumber: "available",
      raceKey: "available",
      status: "available",
      sourceProvider: "available",
      sourceUrl: "available",
      fetchedAt: "available",
      sourceDate: "available",
      responseHash: "available",
      parserVersion: "available",
    },
    result: {
      firstCarNo: availability(count((probe) => probe.topThree[0]), total),
      secondCarNo: availability(count((probe) => probe.topThree[1]), total),
      thirdCarNo: availability(count((probe) => probe.topThree[2]), total),
      trifecta: availability(count((probe) => present(probe.trifecta?.kumiBan)), total),
      trifectaPayoutYen: availability(
        count((probe) => positiveInteger(probe.trifecta?.haraiGaku)),
        total,
      ),
      winningCombinationPopularity: availability(
        count((probe) => present(probe.trifecta?.ninki)),
        total,
      ),
      firstFavoriteInformation: "unavailable",
      closingOdds: "unavailable",
      oddsMovement: "unavailable",
    },
    kimarite: {
      first: availability(count((probe) => present(probe.topThree[0]?.kimarite)), total),
      second: availability(count((probe) => present(probe.topThree[1]?.kimarite)), total),
      source: "available (JSJ012.tyakujyunItemSubData)",
    },
    weather: {
      weather: availability(count((probe) => present(probe.detail.tenki)), total),
      windSpeed: availability(count((probe) => present(probe.detail.husoku)), total),
      windDirection: "unavailable",
      backstretchVector: "unavailable",
    },
    category: {
      grade: availability(count((probe) => present(probe.grade)), total),
      raceClass: availability(count((probe) => present(probe.raceClass)), total),
      carCount: "partial (official finish-row count; DNS semantics require validation)",
      timeBand: "unavailable",
    },
    development: {
      entries: availability(
        count((probe) =>
          Array.isArray(probe.entries?.sensyuTypeInfo)
          && probe.entries.sensyuTypeInfo.length > 0
        ),
        total,
      ),
      lineup: availability(
        count((probe) =>
          Array.isArray(probe.lineup?.narabiyoso?.shaban)
          && probe.lineup.narabiyoso.shaban.length > 0
        ),
        total,
      ),
      lineStructure: "unavailable",
      B: availability(count((probe) => anyFinishMark(probe, "B")), total),
      SB: "unavailable (no separate SB field)",
      SHB: availability(
        count((probe) => ["S", "H", "B"].some((mark) => anyFinishMark(probe, mark))),
        total,
      ),
    },
  };
}

async function discover(options) {
  const [year, month, day] = options.date.split("-").map(Number);
  const scheduleUrl =
    `${BASE_URL}/pc/raceschedule?scyy=${year}&scym=${String(month).padStart(2, "0")}`;
  const scheduleFetch = await fetchText(scheduleUrl);
  if (!scheduleFetch.response.ok) {
    throw new Error(`schedule HTTP ${scheduleFetch.response.status}`);
  }

  const cookie = cookiesFrom(scheduleFetch.response);
  let candidates = discoverScheduleCandidates(scheduleFetch.text, day);
  if (options.venueCode) {
    candidates = candidates.filter((candidate) => candidate.venueCode === options.venueCode);
  }
  candidates.sort((left, right) =>
    Number(left.displayKind !== "1") - Number(right.displayKind !== "1")
  );
  const candidate = candidates[0];
  if (!candidate) {
    throw new Error("official schedule has no matching event");
  }

  const raceListUrl = `${BASE_URL}/pc/racelist`;
  const display = candidate.displayKind === "1" ? "PJ0301" : "PJ0302";
  const raceListFetch = await fetchText(raceListUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie,
      referer: scheduleUrl,
    },
    body: new URLSearchParams({ encp: candidate.encp, disp: display }),
  });
  if (!raceListFetch.response.ok) {
    throw new Error(`race list HTTP ${raceListFetch.response.status}`);
  }

  const common = extractJsonAssignment(raceListFetch.text, "PC0201")?.C0201data;
  const resultList = extractJsonAssignment(raceListFetch.text, "PJ0301");
  if (!common || !resultList) {
    throw new Error("historical result list was not exposed for the selected event");
  }

  const monthDay = `${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`;
  const dayIndex = common.C0201kaisai?.findIndex(
    (entry) => entry.txtEventDate === monthDay,
  );
  const dayData = resultList.raceDayDataList?.[dayIndex];
  if (!Number.isInteger(dayIndex) || dayIndex < 0 || !dayData) {
    throw new Error("official race list source date did not match requested date");
  }

  const raceClasses = raceClassesForDay(dayData);
  const fetchedAt = new Date().toISOString();
  const probes = [];
  for (let index = 0; index < dayData.raceNoDataList.length; index += 1) {
    const race = dayData.raceNoDataList[index];
    const raceNumber = positiveInteger(String(race.strRaceNo).replace("R", ""));
    const sourceUrl =
      `${BASE_URL}/pc/json?encp=${encodeURIComponent(race.strLnkPrm)}&type=JSJ012`;
    const detailFetch = await fetchText(sourceUrl, {
      headers: { cookie, referer: raceListUrl },
    });
    let detail = null;
    try {
      detail = JSON.parse(detailFetch.text);
    } catch {
      // Validation below rejects malformed official responses.
    }

    const rows = finishRows(detail);
    const topThree = [1, 2, 3].map((rank) =>
      rows.find((row) => positiveInteger(row.tyaku) === rank) ?? null
    );
    const trifecta = trifectaRows(detail)[0] ?? null;
    const entryUrl = sourceUrl.replace("type=JSJ012", "type=JSJ006");
    const entryFetch = await fetchText(entryUrl, {
      headers: { cookie, referer: raceListUrl },
    });
    const lineupUrl = sourceUrl.replace("type=JSJ012", "type=JSJ005");
    const lineupFetch = await fetchText(lineupUrl, {
      headers: { cookie, referer: raceListUrl },
    });
    let entries = null;
    let lineup = null;
    try {
      entries = JSON.parse(entryFetch.text);
    } catch {
      // Availability remains unavailable for malformed responses.
    }
    try {
      lineup = JSON.parse(lineupFetch.text);
    } catch {
      // Availability remains unavailable for malformed responses.
    }
    const accepted = detailFetch.response.ok
      && detail?.resultCd === 0
      && topThree.every(Boolean)
      && present(trifecta?.kumiBan)
      && positiveInteger(trifecta?.haraiGaku);

    probes.push({
      raceNumber,
      raceKey: `${options.date}|${candidate.venueCode}|${raceNumber}`,
      accepted: Boolean(accepted),
      rejectionReason: accepted ? null : "confirmed result/payout validation failed",
      sourceUrl,
      responseHash: sha256(detailFetch.text),
      httpStatus: detailFetch.response.status,
      resultCd: detail?.resultCd ?? null,
      grade: common.imgGradeAlt ?? null,
      raceClass: raceClasses[index] ?? null,
      detail,
      entries,
      lineup,
      finishRows: rows,
      topThree,
      trifecta,
    });
  }

  const accepted = probes.filter((probe) => probe.accepted);
  const rejected = probes.filter((probe) => !probe.accepted);
  return {
    mode: "dry-run",
    writePerformed: false,
    provider: PROVIDER,
    parserVersion: PARSER_VERSION,
    requestedDate: options.date,
    sourceDate: options.date,
    fetchedAt,
    venue: candidate.venue,
    venueCode: candidate.venueCode,
    endpoints: {
      scheduleUrl,
      raceListUrl: `${raceListUrl} (POST; session cookie required)`,
      listType: "official raceschedule/racelist",
      detailType: "JSJ012 (result), JSJ006 (entries), JSJ005 (lineup probe)",
    },
    responseHashStrategy: "SHA-256 of each raw JSJ012 response body",
    acceptedCount: accepted.length,
    rejectedCount: rejected.length,
    probes: probes.map((probe) => ({
      raceNumber: probe.raceNumber,
      raceKey: probe.raceKey,
      accepted: probe.accepted,
      rejectionReason: probe.rejectionReason,
      sourceUrl: probe.sourceUrl,
      responseHash: probe.responseHash,
      httpStatus: probe.httpStatus,
      resultCd: probe.resultCd,
    })),
    fieldAvailability: summarizeFields(probes),
    schemaMissingFields: [
      "odds.firstFavoriteCombination",
      "odds.closingOddsAvailable",
      "odds.oddsMovementAvailable",
      "weather.windDirection",
      "weather.windDirectionBackstretchVector",
      "category.timeBand",
      "lineup.raw",
      "lineup.structured",
      "lineup.lineCount",
      "bSb.sbAvailable",
    ],
    adoption:
      accepted.length > 0
        ? "partial only: official confirmed result core is adoptable; unavailable fields must remain null"
        : "not-adoptable",
  };
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
    return;
  }

  if (!options.dryRun || !isValidDate(options.date)) {
    console.error("--dry-run and a valid --date YYYY-MM-DD are required");
    process.exitCode = 2;
    return;
  }
  if (options.venueCode && !/^\d{2}$/u.test(options.venueCode)) {
    console.error("--venue-code must be a two-digit KEIRIN.JP venue code");
    process.exitCode = 2;
    return;
  }

  try {
    const report = await discover(options);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.acceptedCount > 0 ? 0 : 1;
  } catch (error) {
    console.error(JSON.stringify({
      mode: "dry-run",
      writePerformed: false,
      requestedDate: options.date,
      result: "endpoint confirmation unavailable",
      reason: error instanceof Error ? error.message : String(error),
    }, null, 2));
    process.exitCode = 1;
  }
}

await main();
