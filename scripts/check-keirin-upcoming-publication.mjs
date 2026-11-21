import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import { SOURCE_URL, VENUES, buildRange, scheduleUrl, sha256, validateOutputDirectory } from "./update-keirin-upcoming-schedule.mjs";
import { inspectUpcomingScheduleFreshness } from "./lib/today-update-plan.mjs";

const object = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const check = (ok, code) => { if (!ok) throw new Error(code); };
const clean = (x) => String(x ?? "").replace(/\s+/gu, " ").trim();
const regions = ["kitanihon", "kanto", "minamikanto", "tyubu", "kinki", "tyugoku", "sikoku", "kyusyu"];
const grades = { GP: "GP", G1: "GI", G2: "GII", G3: "GIII", F1: "F1", F2: "F2" };
const jst = (time) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date(time));
function validDate(s) { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s; }
function time(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(s) || !validDate(s.slice(0, 10))) return NaN;
  if (Number(s.slice(11, 13)) > 23 || Number(s.slice(14, 16)) > 59 || Number(s.slice(17, 19)) > 59) return NaN;
  return Date.parse(s);
}
const stable = (x) => JSON.stringify(canonical(x));
function canonical(x) {
  if (Array.isArray(x)) return x.map(canonical);
  if (object(x)) return Object.fromEntries(Object.keys(x).sort().map((k) => [k, canonical(x[k])]));
  return x;
}
async function json(file) { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await fs.readFile(file)).replace(/^\uFEFF/, "")); }
function period(text, month) {
  const parts = clean(text).match(/^(\d{2})\/(\d{2})\([^)]*\)～(\d{2})\/(\d{2})\([^)]*\)$/);
  check(parts, "RAW_INVALID_PERIOD");
  const y = Number(month.slice(0, 4)), last = new Date(Date.UTC(y, Number(month.slice(5)), 0)).toISOString().slice(0, 10);
  const choices = [y - 1, y, y + 1].map((year) => ({ startDate: `${year}-${parts[1]}-${parts[2]}`,
    endDate: `${Number(parts[3]) < Number(parts[1]) ? year + 1 : year}-${parts[3]}-${parts[4]}` }))
    .filter((x) => validDate(x.startDate) && validDate(x.endDate) && x.startDate <= x.endDate && x.startDate <= last && x.endDate >= `${month}-01`);
  check(choices.length === 1, "RAW_PERIOD_MONTH_AMBIGUOUS"); return choices[0];
}
function token(image, prefix, optional = false) {
  if (optional && image.length === 0) return null;
  check(image.length === 1, "RAW_ICON_STRUCTURE_INVALID");
  const result = (image.attr("src") ?? "").match(new RegExp(`^/sp/static/img/icon/${prefix}([^/]+)\\.png$`))?.[1];
  check(result && result.toUpperCase() === image.attr("alt")?.toUpperCase(), "RAW_ICON_PATH_ALT_MISMATCH"); return result;
}

// Separate DOM reader: deliberately does not call the acquisition parser or merger.
export function reconstructOfficialMonth(bytes, meta, month) {
  const html = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  check(/<\/body>\s*<\/html>\s*$/i.test(html), "RAW_HTML_TRUNCATED");
  const $ = cheerio.load(html);
  check($("#dispYearData").length === 1 && $("#dispDayData").length === 1 && $("#dispYearData").val() === month.slice(0, 4)
    && Number($("#dispDayData").val()) === Number(month.slice(5)), "RAW_RESPONSE_MONTH_MISMATCH");
  check(regions.every((r) => $(`#t_${r}`).length === 1), "RAW_REGIONS_INCOMPLETE");
  const headings = $("[onclick*='jocd=']"), seen = new Set();
  check(headings.length === Object.keys(VENUES).length, "RAW_VENUES_INCOMPLETE");
  headings.each((_, e) => {
    const code = $(e).attr("onclick")?.match(/jocd=(\d{2})'/)?.[1];
    check(code && !seen.has(code) && VENUES[code] === clean($(e).find("p").first().text()), "RAW_VENUE_IDENTITY_MISMATCH"); seen.add(code);
  });
  const rows = $("table.race_tbl"), items = [];
  check(rows.length > 0, "RAW_EMPTY_MONTH");
  rows.each((_, e) => {
    const row = $(e), panel = row.closest(".dayDataDiv0201"), heading = panel.prev().find("[onclick*='jocd=']");
    check(panel.length === 1 && heading.length === 1, "RAW_ROW_SCOPE_INVALID");
    const venueCode = heading.attr("onclick").match(/jocd=(\d{2})'/)?.[1], venue = VENUES[venueCode];
    check(seen.has(venueCode) && venue, "RAW_ROW_VENUE_UNKNOWN");
    check(row.find(".kikan").length === 1, "RAW_PERIOD_MISSING");
    const dates = period(row.find(".kikan").text(), month);
    const grade = grades[token(row.find(".grade img"), "grade/ico_").toUpperCase()]; check(grade, "RAW_GRADE_UNKNOWN");
    const rawSessionIcon = token(row.find(".holding img[src]"), "KaisaiIcon/ico_kaisai_", true);
    const session = ({ 8: "morning", 3: "night", 5: "midnight" })[rawSessionIcon] ?? "unknown";
    const rawAdditionalIcons = row.find(".add_info img[src]").map((__, el) => token($(el), "KaisaiIcon/ico_kaisaihuka_")).get().sort();
    check(rawAdditionalIcons.every((x) => ["01", "02", "03", "04"].includes(x)) && new Set(rawAdditionalIcons).size === rawAdditionalIcons.length, "RAW_EXTRA_ICON_UNKNOWN");
    const titleCell = row.find("tr").last().children("td"); check(titleCell.length === 1, "RAW_TITLE_MISSING");
    const title = clean(titleCell.text());
    check(!/(中止|順延|変更)/u.test(row.text()) && !/(cancel|postpon|tyusi|henko)/i.test(row.attr("class") ?? ""), "RAW_OPERATION_REQUIRES_REVIEW");
    const ref = row.attr("onclick")?.match(/^lnk\.formlnk\('\/sp\/(?:racelist|racescheduledetail)','([^']+)'\)$/)?.[1]; check(ref, "RAW_EVENT_REFERENCE_INVALID");
    items.push({ id: `keirin-jp-${venueCode}-${dates.startDate}-${dates.endDate}`, date: dates.startDate, ...dates, venue, venueName: venue, venueCode,
      title, titleStatus: title ? "published" : "unpublished", grade, session, hasGirls: rawAdditionalIcons.includes("02"), source: "keirin-jp",
      operationStatus: "unverified", sourceEventReference: ref, rawSessionIcon, rawAdditionalIcons,
      provenance: [{ provider: "KEIRIN.JP", url: meta.finalUrl, requestedMonth: month, fetchedAt: meta.fetchedAt, rawSha256: meta.sha256, rawBytes: meta.bytes }],
      sourceEventReferences: [ref] });
  });
  return items;
}
function reconstructRange(records, range) {
  const groups = new Map();
  for (const record of records) for (const item of record.items) {
    if (!groups.has(item.id)) groups.set(item.id, []); groups.get(item.id).push(item);
  }
  const all = [];
  for (const values of groups.values()) {
    const strip = ({ provenance, sourceEventReference, sourceEventReferences, ...rest }) => rest;
    check(values.every((x) => stable(strip(x)) === stable(strip(values[0]))), "RAW_CONFLICTING_MEETING");
    all.push({ ...values[0], provenance: [...new Map(values.flatMap((x) => x.provenance).map((x) => [`${x.url}|${x.rawSha256}`, x])).values()],
      sourceEventReferences: [...new Set(values.map((x) => x.sourceEventReference))] });
  }
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    if (all[i].venueCode === all[j].venueCode && ((all[i].startDate <= all[j].endDate && all[j].startDate <= all[i].endDate)
      || all[i].sourceEventReferences.some((x) => all[j].sourceEventReferences.includes(x)))) throw new Error("RAW_CONFLICTING_PERIODS");
  }
  return { all, items: all.filter((x) => x.endDate >= range.from && x.startDate <= range.to).sort((a, b) => a.startDate.localeCompare(b.startDate) || a.venueCode.localeCompare(b.venueCode)),
    duplicates: records.reduce((n, r) => n + r.items.length, 0) - all.length };
}

export async function checkUpcomingPublication({ runDir, asOf, now = new Date(), acquisitionMode = "replay" }) {
  const issues = [], months = [], add = (code, detail = {}) => issues.push({ code, ...detail });
  const expectedDate = asOf ?? jst(now), range = buildRange(expectedDate);
  check(["live", "replay", "fixture"].includes(acquisitionMode), "INVALID_ACQUISITION_MODE");
  let acquisition, candidate, candidateFile;
  try { acquisition = await json(path.join(runDir, "run-result.json")); } catch (error) { add("ACQUISITION_REPORT_INVALID", { message: error.message }); }
  if (!object(acquisition)) { add("ACQUISITION_REPORT_STRUCTURE_INVALID"); acquisition = null; }
  const candidates = [];
  for (const name of ["candidate.json", "candidate-blocked.json"]) if (await fs.access(path.join(runDir, name)).then(() => true, () => false)) candidates.push(name);
  if (candidates.length !== 1) add("CANDIDATE_FILE_MISSING_OR_AMBIGUOUS");
  else { candidateFile = candidates[0]; try { candidate = await json(path.join(runDir, candidateFile)); } catch (error) { add("CANDIDATE_JSON_INVALID", { message: error.message }); } }
  if (!object(candidate)) { add("CANDIDATE_STRUCTURE_INVALID"); candidate = null; }
  for (const month of range.months) {
    const entry = { month, transportSucceeded: false, shaMatched: false, reconstructionPassed: false };
    try {
      const meta = await json(path.join(runDir, "raw", `${month}.meta.json`)), bytes = await fs.readFile(path.join(runDir, "raw", `${month}.html`));
      Object.assign(entry, { url: meta.finalUrl, httpStatus: meta.httpStatus, fetchedAt: meta.fetchedAt,
        recordedSha256: meta.sha256, actualSha256: sha256(bytes), bytes: bytes.length });
      check(object(meta) && meta.kind === "official-http" && meta.requestedUrl === scheduleUrl(month) && meta.finalUrl === scheduleUrl(month), "RAW_SOURCE_MISMATCH");
      check(meta.httpStatus === 200 && /^text\/html\b/i.test(meta.contentType ?? "") && bytes.length > 0 && bytes.length <= 2 * 1024 * 1024, "RAW_HTTP_OR_BODY_INVALID");
      check(Number.isFinite(time(meta.fetchedAt)) && time(meta.fetchedAt) <= now.getTime() && jst(meta.fetchedAt) === expectedDate, "RAW_FETCH_TIME_INVALID");
      entry.transportSucceeded = true;
      check(typeof meta.sha256 === "string" && /^[a-f0-9]{64}$/.test(meta.sha256) && entry.actualSha256 === meta.sha256
        && Number.isSafeInteger(meta.bytes) && meta.bytes === bytes.length, "RAW_SHA_OR_BYTES_MISMATCH");
      entry.shaMatched = true;
      entry.items = reconstructOfficialMonth(bytes, meta, month); entry.reconstructionPassed = true;
    } catch (error) { add(error.message.startsWith("RAW_") ? error.message : "RAW_FILE_INVALID_OR_MISSING", { month, message: error.message }); }
    months.push(entry);
  }
  const fetchSucceeded = months.length === range.months.length && months.every((x) => x.transportSucceeded);
  if (acquisition) {
    if (!object(acquisition) || acquisition.status !== "CANDIDATE_VALIDATED" || acquisition.dataValidationPassed !== true || acquisition.publicationAllowed !== false
      || !Array.isArray(acquisition.failures) || acquisition.failures.length || !Array.isArray(acquisition.holds) || acquisition.holds.length) add("ACQUISITION_NOT_COMPLETE");
    if (stable(acquisition.requiredMonths) !== stable(range.months) || !Array.isArray(acquisition.successfulMonths)
      || !acquisition.successfulMonths.every(object)
      || stable(acquisition.successfulMonths.map((x) => x.month)) !== stable(range.months)) add("ACQUISITION_MONTHS_INCOMPLETE");
    if (!/^[a-f0-9]{64}$/.test(acquisition.implementationSha256 ?? "")) add("PRODUCER_HASH_MISSING");
  }
  if (candidate) {
    if (candidate.candidateOnly !== true || candidate.publicationAllowed !== false || candidate.productionIntegrationVerified !== false) add("CANDIDATE_PUBLICATION_CONTRACT_VIOLATION");
    if (candidate.source !== SOURCE_URL || candidate.provider !== "KEIRIN.JP" || candidate.timeZone !== "Asia/Tokyo") add("CANDIDATE_SOURCE_MISMATCH");
    const freshness = inspectUpcomingScheduleFreshness(candidate, now);
    if (!freshness.fresh) add("CANDIDATE_SCHEMA_OR_FRESHNESS_INVALID", { reasons: freshness.reasons });
    if (expectedDate !== jst(now) || stable(candidate.range) !== stable(range)) add("CANDIDATE_RANGE_MISMATCH");
  }
  let reconstructed;
  if (months.every((x) => x.reconstructionPassed)) {
    try {
      reconstructed = reconstructRange(months, range);
      check(reconstructed.items.length > 0, "RAW_TARGET_RANGE_EMPTY");
      if (candidate && stable(candidate.items) !== stable(reconstructed.items)) add("CANDIDATE_DOES_NOT_MATCH_ORIGINALS");
      if (acquisition) {
        for (const month of months) {
          const summary = Array.isArray(acquisition.successfulMonths) ? acquisition.successfulMonths.find((x) => object(x) && x.month === month.month) : null;
          if (!summary || summary.sha256 !== month.actualSha256 || summary.rawRows !== month.items.length || summary.parsed !== month.items.length || summary.held !== 0) add("ACQUISITION_MONTH_SUMMARY_MISMATCH", { month: month.month });
        }
        if (acquisition.rawRowCount !== months.reduce((n, x) => n + x.items.length, 0) || acquisition.candidateCount !== reconstructed.items.length
          || acquisition.uniqueBeforeRangeFilter !== reconstructed.all.length || acquisition.deduplicatedCount !== reconstructed.duplicates) add("ACQUISITION_TOTALS_MISMATCH");
      }
    } catch (error) { add(error.message); }
  }
  const acceptancePassed = fetchSucceeded && issues.length === 0;
  return { schemaVersion: "keirin-jp-schedule-acceptance-v1", diagnosticOnly: true, acquisitionMode,
    status: acceptancePassed ? "ACCEPTANCE_PASSED_DIAGNOSTIC_ONLY" : "ACCEPTANCE_REJECTED", fetchSucceeded, acceptancePassed,
    publicationAllowed: false, candidateOnly: true, checkedAt: now.toISOString(), expectedRange: range, candidateFile,
    candidateSha256: candidateFile ? sha256(await fs.readFile(path.join(runDir, candidateFile))) : null,
    candidateCount: Array.isArray(candidate?.items) ? candidate.items.length : null, reconstructedCount: reconstructed?.items.length ?? null,
    months: months.map(({ items, ...rest }) => ({ ...rest, rawRowCount: items?.length ?? null })), issues,
    limitations: ["transport history is read from the acquisition evidence; SHA is integrity, not a server signature",
      "coverage means all required published monthly HTML was checked, not proof of unpublished or cancellation notices",
      "acceptance is not production permission; no public-ready payload is generated"] };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2), options = {}, names = { "--run-dir": "runDir", "--report-dir": "reportDir", "--diagnostic-root": "diagnosticRoot", "--as-of": "asOf", "--acquisition-mode": "acquisitionMode" };
    for (let i = 0; i < args.length; i += 2) { check(names[args[i]] && args[i + 1] && !options[names[args[i]]], "INVALID_ARGUMENTS"); options[names[args[i]]] = args[i + 1]; }
    check(options.runDir && options.reportDir && options.diagnosticRoot, "EXPLICIT_DIAGNOSTIC_PATHS_REQUIRED");
    const destination = await validateOutputDirectory(options.reportDir, { diagnosticRoot: options.diagnosticRoot });
    const result = await checkUpcomingPublication(options);
    await fs.mkdir(destination);
    await fs.writeFile(path.join(destination, "acceptance-result.json"), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
    console.log(JSON.stringify({ status: result.status, fetchSucceeded: result.fetchSucceeded, acceptancePassed: result.acceptancePassed, publicationAllowed: false, reportPath: path.join(destination, "acceptance-result.json") }));
    if (!result.acceptancePassed) process.exitCode = 1;
  } catch (error) { console.error(error.stack); process.exitCode = 1; }
}
