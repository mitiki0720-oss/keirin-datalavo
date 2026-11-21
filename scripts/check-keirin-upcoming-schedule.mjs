import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  VENUES, REPOSITORY_ROOT, SOURCE_URL, sha256, scheduleUrl, buildRange,
  parseScheduleMonth, mergeScheduleMonths, compareCtc, validateOutputDirectory, updateUpcomingSchedule,
} from "./update-keirin-upcoming-schedule.mjs";

// Synthetic HTML uses the observed venue-panel structure, not live browser storage.
const regions = ["kitanihon", "kanto", "minamikanto", "tyubu", "kinki", "tyugoku", "sikoku", "kyusyu"];
function row({ month = "2026-11", period, title = "fixture meeting", grade = "F2", icon = "3", girls = false, reference = "fixture-1", extra = "" } = {}) {
  const m = month.slice(5);
  return `<table class="race_tbl" onclick="lnk.formlnk('/sp/racelist','${reference}')"><tr>
    <td class="grade"><img src="/sp/static/img/icon/grade/ico_${grade.toLowerCase()}.png" alt="${grade}"></td>
    <td class="holding">${icon === null ? "" : `<img src="/sp/static/img/icon/KaisaiIcon/ico_kaisai_${icon}.png" alt="${icon}">`}</td>
    <td class="add_info">${girls ? '<img src="/sp/static/img/icon/KaisaiIcon/ico_kaisaihuka_02.png" alt="02">' : ""}${extra}</td>
    <td class="kikan">${period ?? `${m}/10(火)～${m}/12(木)`}</td></tr><tr><td colspan="4">${title}</td></tr></table>`;
}
function html(month = "2026-11", options = {}) {
  return `<html><body><input id="dispYearData" value="${month.slice(0, 4)}"><input id="dispDayData" value="${month.slice(5)}">
    ${regions.map((r) => `<div id="t_${r}"></div>`).join("")}
    ${Object.entries(VENUES).map(([code, name]) => `<div><button onclick="location.href='/sp/jyosellinfo?jocd=${code}'"><p>${name}</p></button></div>
      ${code === (options.code ?? "12") ? `<div class="dayDataDiv0201"><div>${row({ month, reference: `fixture-${month}`, ...options })}</div></div>` : ""}`).join("")}
    </body></html>`;
}
function observation(text, month = "2026-11", overrides = {}) {
  const raw = Buffer.from(text);
  return { raw, meta: { kind: "official-http", requestedUrl: scheduleUrl(month), finalUrl: scheduleUrl(month),
    httpStatus: 200, contentType: "text/html;charset=UTF-8", fetchedAt: "2026-11-19T00:00:00.000Z",
    sha256: sha256(raw), bytes: raw.length, syntheticTestFixture: true, ...overrides } };
}
function parse(options = {}, month = "2026-11") {
  const { raw, meta } = observation(html(month, options), month);
  return parseScheduleMonth(raw, meta, month);
}
const broadRange = { from: "2026-10-01", to: "2027-02-01" };
function oneMonth(item) { return { rawRowCount: 1, items: [item], holds: [] }; }

test("61 inclusive days and previous-month coverage", () => {
  assert.deepEqual(buildRange("2026-11-19"), { from: "2026-11-19", to: "2027-01-18", offsetDays: 60,
    inclusiveDays: 61, months: ["2026-10", "2026-11", "2026-12", "2027-01"] });
});
test("January request includes previous December", () => assert.equal(buildRange("2027-01-01").months[0], "2026-12"));
test("invalid dates and months fail", () => {
  assert.throws(() => buildRange("2026-02-30"), /INVALID_AS_OF/);
  assert.throws(() => scheduleUrl("2026-13"), /INVALID_MONTH/);
});
test("observed URL query parameters", () => assert.equal(scheduleUrl("2027-01"), `${SOURCE_URL}?scyy=2027&scym=01`));
test("venue scope, code, name and empty title are preserved", () => {
  const result = parse({ title: "" });
  assert.equal(result.items[0].venue, "青森"); assert.equal(result.items[0].venueCode, "12");
  assert.equal(result.items[0].title, ""); assert.equal(result.items[0].titleStatus, "unpublished");
});
for (const [token, expected] of [["8", "morning"], ["3", "night"], ["5", "midnight"], ["1", "unknown"], ["9", "unknown"], [null, "unknown"]]) {
  test(`session ${token} -> ${expected}, never inferred day`, () => assert.equal(parse({ icon: token }).items[0].session, expected));
}
for (const [grade, expected] of [["GP", "GP"], ["G1", "GI"], ["G2", "GII"], ["G3", "GIII"], ["F1", "F1"], ["F2", "F2"]]) {
  test(`official grade ${grade}`, () => assert.equal(parse({ grade }).items[0].grade, expected));
}
test("girls flag remains independent of session", () => {
  assert.equal(parse({ girls: true, icon: "1" }).items[0].hasGirls, true);
  assert.equal(parse({ girls: false }).items[0].hasGirls, false);
});
test("month crossing is not split", () => {
  const result = parse({ period: "10/30(金)～11/01(日)" }, "2026-10").items[0];
  assert.equal(result.startDate, "2026-10-30"); assert.equal(result.endDate, "2026-11-01");
});
test("year crossing from both adjacent month views", () => {
  for (const month of ["2026-12", "2027-01"]) {
    const result = parse({ period: "12/30(水)～01/01(金)" }, month).items[0];
    assert.equal(result.startDate, "2026-12-30"); assert.equal(result.endDate, "2027-01-01");
  }
});
for (const [name, options, reason] of [
  ["unknown grade", { grade: "F9" }, "UNKNOWN_GRADE"],
  ["impossible date", { period: "11/31(火)～12/02(木)" }, "PERIOD_YEAR_OR_MONTH_AMBIGUOUS"],
  ["missing period", { period: "" }, "INVALID_PERIOD"],
  ["cancellation notice", { title: "開催中止" }, "OPERATION_CHANGE_REQUIRES_REVIEW"],
  ["postponement notice", { title: "順延" }, "OPERATION_CHANGE_REQUIRES_REVIEW"],
  ["schedule change notice", { title: "日程変更" }, "OPERATION_CHANGE_REQUIRES_REVIEW"],
  ["unknown supplemental flag", { extra: '<img src="/sp/static/img/icon/KaisaiIcon/ico_kaisaihuka_99.png" alt="99">' }, "UNKNOWN_ADDITIONAL_ICON"],
]) {
  test(`${name} held rather than fabricated`, () => {
    const result = parse(options);
    assert.equal(result.items.length, 0); assert.equal(result.holds.length, 1); assert.equal(result.holds[0].reason, reason);
  });
}
for (const [name, mutate, reason] of [
  ["month mismatch", (s) => s.replace('id="dispDayData" value="11"', 'id="dispDayData" value="12"'), "RESPONSE_MONTH_MISMATCH"],
  ["truncated document", (s) => s.replace("</body></html>", ""), "TRUNCATED_HTML"],
  ["missing region", (s) => s.replace('id="t_kyusyu"', 'id="removed"'), "INCOMPLETE_REGIONS"],
  ["missing venue heading", (s) => s.replace("jocd=87", "other=87"), "INCOMPLETE_VENUE_HEADINGS"],
  ["venue identity mismatch", (s) => s.replace("<p>青森</p>", "<p>熊本</p>"), "VENUE_CODE_NAME_MISMATCH"],
  ["panel outside venue scope", (s) => s.replace('<div class="dayDataDiv0201">', '<aside></aside><div class="dayDataDiv0201">'), "VENUE_PANEL_SCOPE_MISSING"],
]) {
  test(`${name} blocks the entire month`, () => {
    const { raw, meta } = observation(mutate(html()));
    assert.throws(() => parseScheduleMonth(raw, meta, "2026-11"), new RegExp(reason));
  });
}
for (const [name, overrides, reason] of [
  ["403", { httpStatus: 403 }, "HTTP_403"],
  ["redirect", { httpStatus: 302 }, "HTTP_302"],
  ["wrong final URL", { finalUrl: "https://ctc.gr.jp/schedule/" }, "SOURCE_URL_MISMATCH"],
  ["unverified source", { kind: "third-party" }, "UNVERIFIED_PROVENANCE"],
  ["non-HTML", { contentType: "application/json" }, "NOT_HTML"],
  ["SHA mismatch", { sha256: "0".repeat(64) }, "RAW_SHA_OR_LENGTH_MISMATCH"],
  ["missing timestamp", { fetchedAt: "unknown" }, "MISSING_FETCH_TIME"],
]) {
  test(`${name} cannot become verified official input`, () => {
    const { raw, meta } = observation(html(), "2026-11", overrides);
    assert.throws(() => parseScheduleMonth(raw, meta, "2026-11"), new RegExp(reason));
  });
}
test("raw icon path/alt mismatch is held", () => {
  const { raw, meta } = observation(html().replace('ico_kaisai_3.png" alt="3"', 'ico_kaisai_3.png" alt="8"'));
  assert.equal(parseScheduleMonth(raw, meta, "2026-11").holds[0].reason, "ICON_PATH_ALT_MISMATCH");
});
test("missing title element is not confused with an unpublished blank title", () => {
  const { raw, meta } = observation(html().replace('<td colspan="4">fixture meeting</td>', ""));
  assert.equal(parseScheduleMonth(raw, meta, "2026-11").holds[0].reason, "TITLE_STRUCTURE_MISSING");
});
test("an unscoped extra row blocks the entire month", () => {
  const { raw, meta } = observation(html().replace("</body>", `${row()}</body>`));
  assert.throws(() => parseScheduleMonth(raw, meta, "2026-11"), /UNSCOPED_OR_MISSING_ROWS/);
});
test("exact duplicates merge with both provenance records", () => {
  const a = parse().items[0], b = structuredClone(a);
  b.provenance[0].rawSha256 = "b".repeat(64);
  const result = mergeScheduleMonths([oneMonth(a), oneMonth(b)], broadRange);
  assert.equal(result.items.length, 1); assert.equal(result.deduplicatedCount, 1);
  assert.equal(result.items[0].provenance.length, 2);
});
for (const [field, value] of [["grade", "F1"], ["title", "different"], ["session", "morning"], ["hasGirls", true]]) {
  test(`conflicting ${field} holds all observations`, () => {
    const a = parse().items[0], b = { ...a, [field]: value };
    const result = mergeScheduleMonths([oneMonth(a), oneMonth(b)], broadRange);
    assert.equal(result.items.length, 0); assert.equal(result.holds.length, 1);
  });
}
test("overlapping changed periods do not become two meetings", () => {
  const a = parse().items[0], b = { ...a, endDate: "2026-11-13", sourceEventReference: "changed" };
  const result = mergeScheduleMonths([oneMonth(a), oneMonth(b)], broadRange);
  assert.equal(result.items.length, 0); assert.equal(result.holds.length, 2);
});
test("different raw unknown icons remain conflicting observations", () => {
  const a = parse({ icon: "1" }).items[0], b = { ...a, rawSessionIcon: "9" };
  const result = mergeScheduleMonths([oneMonth(a), oneMonth(b)], broadRange);
  assert.equal(result.items.length, 0); assert.equal(result.holds.length, 1);
});
test("same venue and period merge without discarding different official references", () => {
  const a = parse().items[0], b = { ...a, sourceEventReference: "different" };
  const result = mergeScheduleMonths([oneMonth(a), oneMonth(b)], broadRange);
  assert.equal(result.holds.length, 0); assert.equal(result.items.length, 1);
  assert.deepEqual(result.items[0].sourceEventReferences, [a.sourceEventReference, "different"]);
});
test("CTC comparison never injects stale rows into new items", () => {
  const item = parse().items[0], before = JSON.stringify(item);
  const result = compareCtc([item], { source: "https://ctc.gr.jp/schedule/", generatedAt: "2026-10-23", items: [
    { ...item, id: "old", source: "ctc", session: "day" },
    { ...item, id: "unmatched", venue: "熊本", venueName: "熊本" },
  ] }, broadRange);
  assert.equal(result.matches.length, 1); assert.equal(result.missing.length, 1);
  assert.equal(JSON.stringify(item), before); assert.equal(item.source, "keirin-jp");
});
test("repository/public output rejected before any request", async () => {
  let calls = 0;
  await assert.rejects(updateUpcomingSchedule({ outputDir: path.join(REPOSITORY_ROOT, "public", "candidate-never-created"),
    asOf: "2026-11-19", fetchImpl: async () => { calls++; } }), /OUTPUT_INSIDE_REPOSITORY_FORBIDDEN/);
  assert.equal(calls, 0);
});
test("implicit or reused output directories are rejected", async () => {
  await assert.rejects(validateOutputDirectory(), /EXPLICIT_ABSOLUTE_TEMP_OUTPUT_REQUIRED/);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "keirin-schedule-test-existing-"));
  await assert.rejects(validateOutputDirectory(root), /OUTPUT_ALREADY_EXISTS/);
});
test("output below a repository marker is forbidden", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "keirin-schedule-test-repository-"));
  await fs.mkdir(path.join(root, ".git"));
  await assert.rejects(validateOutputDirectory(path.join(root, "output")), /OUTPUT_INSIDE_REPOSITORY_FORBIDDEN/);
});
test("legacy no-argument CLI cannot write production JSON", () => {
  const result = spawnSync(process.execPath, [path.join(REPOSITORY_ROOT, "scripts/update-keirin-upcoming-schedule.mjs")], {
    encoding: "utf8", env: { ...process.env, GITHUB_ACTIONS: "false" },
  });
  assert.equal(result.status, 1); assert.match(result.stderr, /CANDIDATE_ONLY/);
});
async function mockRun(mode) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `keirin-schedule-test-${mode}-`));
  let calls = 0;
  const result = await updateUpcomingSchedule({ outputDir: path.join(root, "run"), asOf: "2026-11-19",
    fetchImpl: async (url, options) => {
      calls++; assert.equal(options.redirect, "manual"); assert.ok(options.signal);
      assert.deepEqual(options.headers, { Accept: "text/html" });
      const query = new URL(url).searchParams, month = `${query.get("scyy")}-${query.get("scym")}`;
      if (month === "2026-12" && mode === "network-failure") throw new Error("fixture network failure");
      const text = mode === "oversized" && month === "2026-12" ? "x".repeat(2 * 1024 * 1024 + 1)
        : html(mode === "mismatch" && month === "2026-12" ? "2026-11" : month);
      const response = new Response(text, { status: mode === "http-failure" && month === "2026-12" ? 403 : 200,
        headers: { "content-type": "text/html" } });
      Object.defineProperty(response, "url", { value: url });
      return response;
    } });
  assert.equal(calls, 4);
  assert.equal(result.report.publicationAllowed, false);
  assert.equal(result.candidate.productionIntegrationVerified, false);
  return result;
}
test("successful synthetic fetch remains candidate-only and bounded", async () => {
  const { report, candidate } = await mockRun("success");
  assert.equal(report.status, "CANDIDATE_VALIDATED"); assert.equal(report.successfulMonths.length, 4);
  assert.equal(candidate.items.every((x) => x.provenance[0].rawSha256.length === 64), true);
});
for (const mode of ["network-failure", "http-failure", "mismatch", "oversized"]) {
  test(`${mode}: partial months never produce an eligible candidate`, async () => {
    const { report } = await mockRun(mode);
    assert.equal(report.status, "CANDIDATE_BLOCKED"); assert.equal(report.dataValidationPassed, false);
    assert.equal(report.successfulMonths.length, 3); assert.equal(report.failures.length, 1);
    if (mode === "oversized") {
      assert.equal(report.failures[0].httpStatus, 200);
      assert.equal(report.failures[0].message, "BODY_TOO_LARGE");
    }
    await assert.rejects(fs.access(path.join(report.outputDir, "candidate.json")));
    await fs.access(path.join(report.outputDir, "candidate-blocked.json"));
  });
}
test("missing replay month blocks candidate without fetching", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "keirin-schedule-test-missing-"));
  const { report } = await updateUpcomingSchedule({ asOf: "2026-11-19", replayDir: root, outputDir: path.join(root, "run"),
    fetchImpl: () => { throw new Error("must not fetch"); } });
  assert.equal(report.failures.length, 5);
  assert.deepEqual(report.failures.filter((x) => x.month).map((x) => x.month), buildRange("2026-11-19").months);
  assert.deepEqual(report.failures.filter((x) => x.stage === "range"), [{ stage: "range", message: "NO_MEETINGS_IN_TARGET_RANGE" }]);
  assert.equal(report.dataValidationPassed, false);
});

const rawDir = process.env.SCHEDULE_RAW_DIR;
test("saved official originals: four months, 302 rows, target meetings and CTC parity", { skip: !rawDir }, async () => {
  const months = [];
  for (const [month, count] of [["2026-10", 78], ["2026-11", 73], ["2026-12", 75], ["2027-01", 76]]) {
    const raw = await fs.readFile(path.join(rawDir, `${month}.html`));
    const meta = JSON.parse(await fs.readFile(path.join(rawDir, `${month}.meta.json`), "utf8"));
    const result = parseScheduleMonth(raw, meta, month);
    assert.equal(result.rawRowCount, count); assert.equal(result.items.length, count); assert.equal(result.holds.length, 0);
    months.push(result);
  }
  const merged = mergeScheduleMonths(months, broadRange);
  assert.equal(merged.items.length, 302); assert.equal(merged.holds.length, 0);
  for (const code of ["21", "24", "26", "31", "42"]) {
    assert.equal(merged.items.filter((x) => x.venueCode === code && x.startDate === "2026-10-30" && x.endDate === "2026-11-01").length, 1);
  }
  for (const code of ["35", "42", "61"]) {
    assert.equal(merged.items.filter((x) => x.venueCode === code && x.startDate === "2026-12-30" && x.endDate === "2027-01-01").length, 1);
  }
  const december = months.find((x) => x.month === "2026-12").items;
  assert.deepEqual(december.filter((x) => x.title === "").map((x) => x.venueCode).sort(), ["42", "45", "86"]);
  assert.equal(merged.items.filter((x) => x.rawSessionIcon === "1").every((x) => x.session === "unknown"), true);
  assert.equal(mergeScheduleMonths(months, buildRange("2026-11-19")).items.length, 155);
  const ctc = JSON.parse(await fs.readFile(path.join(REPOSITORY_ROOT, "public/data/races/upcoming-schedule.generated.json"), "utf8"));
  const comparison = compareCtc(merged.items, ctc, { from: "2026-11-01", to: "2026-12-22" });
  assert.equal(comparison.oldCount, 78); assert.equal(comparison.matches.length, 78); assert.equal(comparison.missing.length, 0);
  assert.equal(comparison.matches.every((x) => x.gradeEqual && x.girlsEqual), true);
  assert.equal(comparison.matches.filter((x) => !x.titleEqual).length, 1);
});
