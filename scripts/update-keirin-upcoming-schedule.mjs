import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

export const SOURCE_URL = "https://www.keirin.jp/sp/raceschedule";
export const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Official headings observed on 2026-11-19; unexpected layout changes fail closed.
export const VENUES = Object.freeze({
  11: "函館", 12: "青森", 13: "いわき平", 21: "弥彦", 22: "前橋", 23: "取手",
  24: "宇都宮", 25: "大宮", 26: "西武園", 27: "京王閣", 28: "立川", 31: "松戸",
  34: "川崎", 35: "平塚", 36: "小田原", 37: "伊東", 38: "静岡", 42: "名古屋",
  43: "岐阜", 44: "大垣", 45: "豊橋", 46: "富山", 47: "松阪", 48: "四日市",
  51: "福井", 53: "奈良", 54: "向日町", 55: "和歌山", 56: "岸和田", 61: "玉野",
  62: "広島", 63: "防府", 71: "高松", 73: "小松島", 74: "高知", 75: "松山",
  81: "小倉", 83: "久留米", 84: "武雄", 85: "佐世保", 86: "別府", 87: "熊本",
});
const REGIONS = ["kitanihon", "kanto", "minamikanto", "tyubu", "kinki", "tyugoku", "sikoku", "kyusyu"];
const GRADES = { GP: "GP", G1: "GI", G2: "GII", G3: "GIII", F1: "F1", F2: "F2" };
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const clean = (value) => String(value ?? "").replace(/\s+/gu, " ").trim();
const normalize = (value) => clean(value).normalize("NFKC").replace(/\s+/gu, "");
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
function check(condition, message) { if (!condition) throw new Error(message); }
function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
export function scheduleUrl(month) {
  check(/^\d{4}-(0[1-9]|1[0-2])$/.test(month), "INVALID_MONTH");
  const url = new URL(SOURCE_URL);
  url.searchParams.set("scyy", month.slice(0, 4));
  url.searchParams.set("scym", month.slice(5));
  return url.href;
}
export function buildRange(date) {
  check(validDate(date), "INVALID_AS_OF_DATE");
  const end = new Date(`${date}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 60);
  const first = new Date(`${date.slice(0, 7)}-01T00:00:00Z`);
  first.setUTCMonth(first.getUTCMonth() - 1);
  const to = end.toISOString().slice(0, 10), months = [];
  for (let cursor = first; cursor.toISOString().slice(0, 7) <= to.slice(0, 7); cursor.setUTCMonth(cursor.getUTCMonth() + 1)) {
    months.push(cursor.toISOString().slice(0, 7));
  }
  return { from: date, to, offsetDays: 60, inclusiveDays: 61, months };
}
function parsePeriod(text, month) {
  const match = clean(text).match(/^(\d{2})\/(\d{2})\([^)]*\)～(\d{2})\/(\d{2})\([^)]*\)$/u);
  check(match, "INVALID_PERIOD");
  const [, sm, sd, em, ed] = match;
  const year = Number(month.slice(0, 4));
  const last = new Date(Date.UTC(year, Number(month.slice(5)), 0)).toISOString().slice(0, 10);
  const candidates = [year - 1, year, year + 1].map((y) => ({
    startDate: `${y}-${sm}-${sd}`, endDate: `${Number(em) < Number(sm) ? y + 1 : y}-${em}-${ed}`,
  })).filter((x) => validDate(x.startDate) && validDate(x.endDate)
    && x.startDate <= x.endDate && x.startDate <= last && x.endDate >= `${month}-01`);
  check(candidates.length === 1, "PERIOD_YEAR_OR_MONTH_AMBIGUOUS");
  return candidates[0];
}
function imageToken(image, prefix) {
  if (!image.length) return null;
  check(image.length === 1, "DUPLICATE_ICON");
  const token = (image.attr("src") ?? "").match(new RegExp(`^/sp/static/img/icon/${prefix}([^/]+)\\.png$`))?.[1];
  check(token && token.toUpperCase() === image.attr("alt")?.toUpperCase(), "ICON_PATH_ALT_MISMATCH");
  return token;
}
export function parseScheduleMonth(raw, meta, month) {
  check(meta.kind === "official-http", "UNVERIFIED_PROVENANCE");
  check(meta.requestedUrl === scheduleUrl(month) && meta.finalUrl === scheduleUrl(month), "SOURCE_URL_MISMATCH");
  check(meta.httpStatus === 200, `HTTP_${meta.httpStatus}`);
  check(/^text\/html\b/i.test(meta.contentType ?? ""), "NOT_HTML");
  check(Number.isFinite(Date.parse(meta.fetchedAt)), "MISSING_FETCH_TIME");
  check(meta.sha256 === sha256(raw) && meta.bytes === raw.length, "RAW_SHA_OR_LENGTH_MISMATCH");
  check(raw.length > 0 && raw.length <= MAX_BODY_BYTES, "INVALID_BODY_LENGTH");
  const html = new TextDecoder("utf-8", { fatal: true }).decode(raw);
  check(/<\/body>\s*<\/html>\s*$/i.test(html), "TRUNCATED_HTML");
  const $ = cheerio.load(html);
  check($("#dispYearData").length === 1 && $("#dispDayData").length === 1
    && $("#dispYearData").val() === month.slice(0, 4)
    && Number($("#dispDayData").val()) === Number(month.slice(5)), "RESPONSE_MONTH_MISMATCH");
  check(REGIONS.every((region) => $(`#t_${region}`).length === 1), "INCOMPLETE_REGIONS");
  const headings = $("[onclick*='jocd=']"), seenCodes = new Set();
  check(headings.length === Object.keys(VENUES).length, "INCOMPLETE_VENUE_HEADINGS");
  headings.each((_, element) => {
    const heading = $(element), code = heading.attr("onclick")?.match(/jocd=(\d{2})'/)?.[1];
    check(code && !seenCodes.has(code) && VENUES[code]
      && clean(heading.find("p").first().text()) === VENUES[code], "VENUE_CODE_NAME_MISMATCH");
    seenCodes.add(code);
  });
  const items = [], holds = [], warnings = [];
  const rawRowCount = $("table.race_tbl").length;
  check(rawRowCount > 0, "EMPTY_MONTH_UNVERIFIED");
  $(".dayDataDiv0201").each((_, container) => {
    const panel = $(container), heading = panel.prev().find("[onclick*='jocd=']");
    check(heading.length === 1, "VENUE_PANEL_SCOPE_MISSING");
    const venueCode = heading.attr("onclick").match(/jocd=(\d{2})'/)?.[1];
    check(seenCodes.has(venueCode), "UNMAPPED_VENUE_PANEL");
    check(panel.find("table.race_tbl").length > 0, "EMPTY_VENUE_PANEL");
    panel.find("table.race_tbl").each((__, element) => {
      const table = $(element), venue = VENUES[venueCode];
      const evidence = { provider: "KEIRIN.JP", url: meta.finalUrl, requestedMonth: month,
        fetchedAt: meta.fetchedAt, rawSha256: meta.sha256, rawBytes: meta.bytes };
      try {
        check(table.find(".kikan").length === 1, "PERIOD_MISSING_OR_DUPLICATE");
        const period = parsePeriod(table.find(".kikan").text(), month);
        const gradeToken = imageToken(table.find(".grade img"), "grade/ico_");
        check(GRADES[gradeToken?.toUpperCase()], "UNKNOWN_GRADE");
        const grade = GRADES[gradeToken.toUpperCase()];
        const sessionToken = imageToken(table.find(".holding img[src]"), "KaisaiIcon/ico_kaisai_");
        const session = ({ 8: "morning", 3: "night", 5: "midnight" })[sessionToken] ?? "unknown";
        if (session === "unknown") warnings.push({ venueCode, ...period, reason: "SESSION_UNCONFIRMED", rawIcon: sessionToken });
        const flags = [];
        table.find(".add_info img[src]").each((___, flag) => {
          const token = imageToken($(flag), "KaisaiIcon/ico_kaisaihuka_");
          check(["01", "02", "03", "04"].includes(token), "UNKNOWN_ADDITIONAL_ICON");
          flags.push(token);
        });
        check(new Set(flags).size === flags.length, "DUPLICATE_ADDITIONAL_ICON");
        const titleCells = table.find("tr").last().find("td");
        check(titleCells.length === 1, "TITLE_STRUCTURE_MISSING");
        const title = clean(titleCells.first().text());
        if (!title) warnings.push({ venueCode, ...period, reason: "TITLE_UNPUBLISHED" });
        check(!/(中止|順延|変更)/u.test(table.text())
          && !/(cancel|postpon|tyusi|henko)/i.test(table.attr("class") ?? ""), "OPERATION_CHANGE_REQUIRES_REVIEW");
        const sourceRef = table.attr("onclick")?.match(/^lnk\.formlnk\('\/sp\/(?:racelist|racescheduledetail)','([^']+)'\)$/)?.[1];
        check(sourceRef, "OFFICIAL_EVENT_REFERENCE_MISSING");
        items.push({ id: `keirin-jp-${venueCode}-${period.startDate}-${period.endDate}`,
          date: period.startDate, ...period, venue, venueName: venue, venueCode, title,
          titleStatus: title ? "published" : "unpublished", grade, session, hasGirls: flags.includes("02"),
          source: "keirin-jp", operationStatus: "unverified", sourceEventReference: sourceRef,
          rawSessionIcon: sessionToken, rawAdditionalIcons: flags.sort(), provenance: [evidence] });
      } catch (error) {
        holds.push({ venueCode, venue, rowText: clean(table.text()), reason: error.message, provenance: [evidence] });
      }
    });
  });
  check(items.length + holds.length === rawRowCount, "UNSCOPED_OR_MISSING_ROWS");
  return { month, rawRowCount, items, holds, warnings, provenance: meta,
    coverage: "published-html-only; cancellation and unpublished meetings not independently verified" };
}
function identity(item) { return `${item.venueCode}|${item.startDate}|${item.endDate}`; }
function payload(item) {
  return JSON.stringify([item.venue, item.grade, item.title, item.session, item.hasGirls,
    item.operationStatus, item.rawSessionIcon, item.rawAdditionalIcons]);
}
export function mergeScheduleMonths(months, range) {
  const groups = new Map(), holds = months.flatMap((month) => month.holds), invalid = new Set();
  for (const item of months.flatMap((month) => month.items)) {
    const key = identity(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  for (const [key, rows] of groups) if (new Set(rows.map(payload)).size > 1) invalid.add(key);
  const keys = [...groups.keys()];
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
    const a = groups.get(keys[i])[0], b = groups.get(keys[j])[0];
    if (a.venueCode === b.venueCode && ((a.startDate <= b.endDate && b.startDate <= a.endDate)
      || a.sourceEventReference === b.sourceEventReference)) {
      invalid.add(keys[i]); invalid.add(keys[j]);
    }
  }
  const merged = [];
  for (const [key, rows] of groups) {
    if (invalid.has(key)) { holds.push({ reason: "CONFLICTING_MEETING", identity: key, observations: rows }); continue; }
    const provenance = [...new Map(rows.flatMap((item) => item.provenance)
      .map((p) => [`${p.url}|${p.rawSha256}`, p])).values()];
    merged.push({ ...rows[0], provenance,
      sourceEventReferences: [...new Set(rows.map((item) => item.sourceEventReference))] });
  }
  return { items: merged.filter((item) => item.endDate >= range.from && item.startDate <= range.to)
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.venueCode.localeCompare(b.venueCode)),
    holds, rawRowCount: months.reduce((sum, month) => sum + month.rawRowCount, 0),
    deduplicatedCount: months.reduce((sum, month) => sum + month.items.length, 0) - groups.size,
    uniqueBeforeRangeFilter: merged.length };
}
export function compareCtc(items, ctc, range) {
  check(ctc.source === "https://ctc.gr.jp/schedule/" && Array.isArray(ctc.items), "INVALID_CTC_COMPARISON_INPUT");
  const rows = ctc.items.filter((old) => old.endDate >= range.from && old.startDate <= range.to);
  const matches = [], missing = [];
  for (const old of rows) {
    const item = items.find((x) => normalize(x.venue) === normalize(old.venueName ?? old.venue)
      && x.startDate === old.startDate && x.endDate === old.endDate);
    if (!item) { missing.push(old.id); continue; }
    matches.push({ venue: item.venue, startDate: item.startDate,
      gradeEqual: item.grade === old.grade, girlsEqual: item.hasGirls === old.hasGirls,
      titleEqual: normalize(item.title) === normalize(old.title), oldTitle: old.title, officialTitle: item.title,
      oldSession: old.session, officialSession: item.session, oldNote: old.note ?? "" });
  }
  return { comparisonOnly: true, oldGeneratedAt: ctc.generatedAt, oldCount: rows.length,
    matches, missing, newOnlyCount: items.length - matches.length };
}
async function exists(file) { return fs.access(file).then(() => true, () => false); }
export async function validateOutputDirectory(outputDir, { diagnosticRoot } = {}) {
  check(typeof outputDir === "string" && path.isAbsolute(outputDir), "EXPLICIT_ABSOLUTE_TEMP_OUTPUT_REQUIRED");
  const target = path.resolve(outputDir), parent = await fs.realpath(path.dirname(target));
  check(!await exists(target), "OUTPUT_ALREADY_EXISTS");
  if (diagnosticRoot !== undefined) {
    const expected = path.join(await fs.realpath(REPOSITORY_ROOT), ".tmp", "keirin-schedule-diagnostics");
    check(path.isAbsolute(diagnosticRoot) && path.resolve(diagnosticRoot) === expected
      && await fs.realpath(diagnosticRoot) === expected, "INVALID_DIAGNOSTIC_ROOT");
    const relative = path.relative(expected, parent);
    check(relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative)), "OUTPUT_OUTSIDE_DIAGNOSTIC_ROOT");
    for (let cursor = parent; ; cursor = path.dirname(cursor)) {
      check(!await exists(path.join(cursor, ".git")), "NESTED_REPOSITORY_FORBIDDEN");
      if (cursor === expected) break;
    }
    return path.join(parent, path.basename(target));
  }
  const temp = await fs.realpath(os.tmpdir()), relative = path.relative(temp, parent);
  check(relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative)), "OUTPUT_MUST_BE_IN_TEMP");
  for (let cursor = parent; ; cursor = path.dirname(cursor)) {
    check(!await exists(path.join(cursor, ".git")), "OUTPUT_INSIDE_REPOSITORY_FORBIDDEN");
    if (path.dirname(cursor) === cursor) break;
  }
  return path.join(parent, path.basename(target));
}
async function writeJson(file, value) { await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" }); }
export async function updateUpcomingSchedule({ outputDir, asOf, replayDir, ctcPath, diagnosticRoot,
  fetchImpl = fetch, clock = () => new Date() } = {}) {
  const today = asOf ?? new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(clock());
  const range = buildRange(today), destination = await validateOutputDirectory(outputDir, { diagnosticRoot });
  await fs.mkdir(destination);
  await fs.mkdir(path.join(destination, "raw"));
  const months = [], failures = [];
  for (const month of range.months) {
    let raw, meta;
    try {
      if (replayDir) {
        raw = await fs.readFile(path.join(replayDir, `${month}.html`));
        meta = JSON.parse(await fs.readFile(path.join(replayDir, `${month}.meta.json`), "utf8"));
      } else {
        const url = scheduleUrl(month);
        const response = await fetchImpl(url, { redirect: "manual", signal: AbortSignal.timeout(20000), headers: { Accept: "text/html" } });
        meta = { kind: "official-http", requestedUrl: url, finalUrl: response.url,
          httpStatus: response.status, contentType: response.headers.get("content-type"),
          fetchedAt: clock().toISOString(), sha256: null, bytes: 0 };
        const declared = Number(response.headers.get("content-length"));
        check(!declared || declared <= MAX_BODY_BYTES, "BODY_TOO_LARGE");
        const chunks = [];
        let bytes = 0;
        for await (const chunk of response.body ?? []) {
          bytes += chunk.length;
          check(bytes <= MAX_BODY_BYTES, "BODY_TOO_LARGE");
          chunks.push(chunk);
        }
        raw = Buffer.concat(chunks);
        meta = { ...meta, sha256: sha256(raw), bytes: raw.length };
      }
      await fs.writeFile(path.join(destination, "raw", `${month}.html`), raw, { flag: "wx" });
      await writeJson(path.join(destination, "raw", `${month}.meta.json`), meta);
      months.push(parseScheduleMonth(raw, meta, month));
    } catch (error) {
      failures.push({ month, message: error.message, stack: error.stack,
        requestedUrl: scheduleUrl(month), httpStatus: meta?.httpStatus ?? null, rawSha256: meta?.sha256 ?? null });
    }
  }
  const merged = mergeScheduleMonths(months, range);
  if (merged.items.length === 0) failures.push({ stage: "range", message: "NO_MEETINGS_IN_TARGET_RANGE" });
  let comparison = null;
  if (ctcPath) {
    try { comparison = compareCtc(merged.items, JSON.parse(await fs.readFile(ctcPath, "utf8")), range); }
    catch (error) { failures.push({ stage: "comparison", message: error.message, stack: error.stack }); }
  }
  const dataValidationPassed = failures.length === 0 && months.length === range.months.length && merged.holds.length === 0;
  const candidate = { schemaVersion: "keirin-jp-schedule-candidate-v1", candidateOnly: true,
    publicationAllowed: false, productionIntegrationVerified: false, dataValidationPassed,
    generatedAt: clock().toISOString(), timeZone: "Asia/Tokyo", range, source: SOURCE_URL,
    provider: "KEIRIN.JP", items: merged.items };
  const report = { status: dataValidationPassed ? "CANDIDATE_VALIDATED" : "CANDIDATE_BLOCKED",
    publicationAllowed: false, dataValidationPassed, outputDir: destination,
    implementationSha256: sha256(await fs.readFile(fileURLToPath(import.meta.url))),
    successfulMonths: months.map((x) => ({ month: x.month, rawRows: x.rawRowCount,
      parsed: x.items.length, held: x.holds.length, sha256: x.provenance.sha256 })),
    requiredMonths: range.months, failures, holds: merged.holds,
    warnings: months.flatMap((x) => x.warnings), rawRowCount: merged.rawRowCount,
    candidateCount: merged.items.length, deduplicatedCount: merged.deduplicatedCount,
    uniqueBeforeRangeFilter: merged.uniqueBeforeRangeFilter, comparison,
    limitations: ["published HTML coverage only", "unmarked sessions remain unknown",
      "cancellation/postponement display contract unverified", "UI and Actions migration not performed"] };
  await writeJson(path.join(destination, dataValidationPassed ? "candidate.json" : "candidate-blocked.json"), candidate);
  await writeJson(path.join(destination, "run-result.json"), report);
  return { candidate, report };
}

export async function runScheduledUpcomingSchedule({ outputFile, asOf, replayDir, fetchImpl = fetch,
  clock = () => new Date() } = {}) {
  const publicFile = path.join(REPOSITORY_ROOT, "public/data/races/upcoming-schedule.generated.json");
  const target = path.resolve(outputFile ?? publicFile);
  const isPublic = target === publicFile;
  check(!isPublic || process.env.GITHUB_ACTIONS === "true", "PUBLIC_WRITE_REQUIRES_ACTIONS");
  check(!isPublic || !replayDir, "REPLAY_CANNOT_UPDATE_PUBLIC_DATA");
  const parent = await fs.realpath(path.dirname(target));
  if (!isPublic) {
    const temp = await fs.realpath(os.tmpdir()), relative = path.relative(temp, parent);
    check(relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative)), "TEST_OUTPUT_MUST_BE_IN_TEMP");
    const publicRoot = await fs.realpath(path.join(REPOSITORY_ROOT, "public"));
    check(!path.join(parent, path.basename(target)).startsWith(publicRoot + path.sep), "UNRELATED_PUBLIC_OUTPUT_FORBIDDEN");
    for (let cursor = parent; ; cursor = path.dirname(cursor)) {
      check(!await exists(path.join(cursor, ".git")), "CUSTOM_OUTPUT_INSIDE_REPOSITORY_FORBIDDEN");
      if (path.dirname(cursor) === cursor) break;
    }
  }
  const previous = await fs.readFile(target).catch(error => { if (error.code === "ENOENT") return null; throw error; });
  const diagnosticRoot = path.join(REPOSITORY_ROOT, ".tmp/keirin-schedule-diagnostics");
  await fs.mkdir(diagnosticRoot, { recursive: true });
  const outputDir = path.join(diagnosticRoot, `scheduled-${randomUUID()}`);
  const { candidate, report } = await updateUpcomingSchedule({ outputDir, diagnosticRoot, asOf, replayDir, fetchImpl, clock });
  check(report.dataValidationPassed, `OFFICIAL_SCHEDULE_FETCH_FAILED: ${JSON.stringify(report.failures)}`);
  const { checkUpcomingPublication } = await import("./check-keirin-upcoming-publication.mjs");
  const acceptance = await checkUpcomingPublication({ runDir: outputDir, asOf: candidate.range.from,
    now: clock(), acquisitionMode: replayDir ? "replay" : "live" });
  await writeJson(path.join(outputDir, "acceptance-result.json"), acceptance);
  check(acceptance.acceptancePassed, `OFFICIAL_SCHEDULE_ACCEPTANCE_FAILED: ${JSON.stringify(acceptance.issues)}`);
  check(sha256(await fs.readFile(path.join(outputDir, "candidate.json"))) === acceptance.candidateSha256, "CANDIDATE_CHANGED_AFTER_ACCEPTANCE");
  for (const month of acceptance.months) {
    check(sha256(await fs.readFile(path.join(outputDir, "raw", `${month.month}.html`))) === month.actualSha256, "RAW_CHANGED_AFTER_ACCEPTANCE");
  }
  const currentDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(clock());
  check(candidate.range.from === currentDate, "SCHEDULE_DATE_CHANGED_BEFORE_WRITE");
  const { productionIntegrationVerified: _unverified, ...data } = candidate;
  const published = { ...data, schemaVersion: "keirin-jp-schedule-v1", candidateOnly: false,
    publicationAllowed: true, acceptancePassed: true,
    acceptance: { checkedAt: acceptance.checkedAt, candidateSha256: acceptance.candidateSha256 } };
  if (previous) await fs.writeFile(path.join(outputDir, "previous-schedule.json"), previous, { flag: "wx" });
  const bytes = Buffer.from(`${JSON.stringify(published, null, 2)}\n`);
  const temporary = path.join(parent, `.${path.basename(target)}.${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporary, bytes, { flag: "wx" });
    const current = await fs.readFile(target).catch(error => { if (error.code === "ENOENT") return null; throw error; });
    check(current === null ? previous === null : previous !== null && current.equals(previous), "SCHEDULE_CONCURRENT_UPDATE_DETECTED");
    check(new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(clock()) === candidate.range.from,
      "SCHEDULE_DATE_CHANGED_BEFORE_WRITE");
    await fs.rename(temporary, target);
  } finally {
    await fs.unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; });
  }
  return { status: "OFFICIAL_SCHEDULE_UPDATED", provider: "KEIRIN.JP", output: target,
    count: published.items.length, sha256: sha256(bytes), diagnostics: outputDir };
}

async function main() {
  const args = process.argv.slice(2), options = {};
  const names = { "--candidate-dir": "outputDir", "--as-of": "asOf", "--replay": "replayDir", "--compare-ctc": "ctcPath", "--diagnostic-root": "diagnosticRoot" };
  try {
    if (args.length === 0 && process.env.GITHUB_ACTIONS === "true") {
      console.log(JSON.stringify(await runScheduledUpcomingSchedule({ outputFile: process.env.KEIRIN_SCHEDULE_OUTPUT_FILE,
        replayDir: process.env.KEIRIN_SCHEDULE_REPLAY_DIR, asOf: process.env.KEIRIN_SCHEDULE_AS_OF })));
      return;
    }
    for (let i = 0; i < args.length; i += 2) {
      check(names[args[i]] && args[i + 1] && !args[i + 1].startsWith("--") && !options[names[args[i]]], "INVALID_CLI_ARGUMENTS");
      options[names[args[i]]] = args[i + 1];
    }
    check(options.outputDir, "CANDIDATE_ONLY: --candidate-dir is required; public JSON writes are disabled");
    const { report } = await updateUpcomingSchedule(options);
    console.log(JSON.stringify({ status: report.status, publicationAllowed: false,
      reportPath: path.join(report.outputDir, "run-result.json"), candidateCount: report.candidateCount }));
    if (!report.dataValidationPassed) process.exitCode = 1;
  } catch (error) { console.error(error.stack); process.exitCode = 1; }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main();
