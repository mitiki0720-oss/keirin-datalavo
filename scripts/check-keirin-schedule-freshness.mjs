import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { inspectUpcomingScheduleFreshness as inspect, buildTodayUpdatePlan } from "./lib/today-update-plan.mjs";
import { buildRange, updateUpcomingSchedule, sha256 } from "./update-keirin-upcoming-schedule.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const candidatePath = process.env.SCHEDULE_CANDIDATE_JSON;
assert.ok(candidatePath, "SCHEDULE_CANDIDATE_JSON is required");
const originalBytes = await fs.readFile(candidatePath), originalHash = sha256(originalBytes);
const original = JSON.parse(originalBytes), clone = () => structuredClone(original);
const now = new Date("2026-11-19T08:00:00Z");
const ctcPath = path.join(root, "public/data/races/upcoming-schedule.generated.json");
const ctcBytes = await fs.readFile(ctcPath), ctcHash = sha256(ctcBytes), ctc = JSON.parse(ctcBytes);
const baselineText = execFileSync("git", ["show", "HEAD:scripts/lib/today-update-plan.mjs"], { cwd: root, encoding: "utf8" });
const baseline = await import(`data:text/javascript;base64,${Buffer.from(baselineText).toString("base64")}`);

function assertStale(feed, reason) {
  const result = inspect(feed, now);
  assert.equal(result.fresh, false);
  assert.equal(result.publicationAllowed, false);
  if (reason) assert.deepEqual(result.reasons, [reason]);
  assert.equal(buildTodayUpdatePlan({ now, upcoming: feed }).upcoming, true);
}
function changed(mutate) { const feed = clone(); mutate(feed); return feed; }

test("saved official candidate is fresh while publication remains prohibited", () => {
  assert.equal(original.items.length, 155);
  const result = inspect(original, now);
  assert.deepEqual(result, { fresh: true, provider: "KEIRIN.JP", candidateOnly: true, publicationAllowed: false, reasons: [] });
  assert.equal(original.publicationAllowed, false);
  assert.equal(buildTodayUpdatePlan({ now, upcoming: original }).upcoming, false);
});
test("normal same-day schedule does not repeatedly fetch", () => {
  for (const time of ["07:00", "08:00", "10:00", "12:00", "14:59"]) {
    assert.equal(buildTodayUpdatePlan({ now: new Date(`2026-11-19T${time}:00Z`), upcoming: original }).upcoming, false);
  }
});
test("legacy CTC is never considered the completed official migration", () => {
  const result = inspect(ctc, now);
  assert.equal(result.provider, "CTC"); assertStale(ctc, "NOT_OFFICIAL_SCHEDULE_SOURCE");
  assertStale({ ...ctc, generatedAt: now.toISOString() }, "NOT_OFFICIAL_SCHEDULE_SOURCE");
});
for (const [name, mutate, reason] of [
  ["unknown provider", (x) => { x.provider = "unknown"; }, "NOT_OFFICIAL_SCHEDULE_SOURCE"],
  ["unknown source URL", (x) => { x.source = "https://example.invalid/schedule"; }, "NOT_OFFICIAL_SCHEDULE_SOURCE"],
  ["CTC URL under official provider label", (x) => { x.source = "https://ctc.gr.jp/schedule/"; }, "NOT_OFFICIAL_SCHEDULE_SOURCE"],
  ["unknown schema", (x) => { x.schemaVersion = "unknown"; }, "UNVALIDATED_SCHEDULE_SCHEMA"],
  ["failed acquisition validation", (x) => { x.dataValidationPassed = false; }, "UNVALIDATED_SCHEDULE_SCHEMA"],
  ["missing validation", (x) => { delete x.dataValidationPassed; }, "UNVALIDATED_SCHEDULE_SCHEMA"],
  ["contradictory publication flags", (x) => { x.publicationAllowed = true; }, "UNVALIDATED_SCHEDULE_SCHEMA"],
  ["empty items", (x) => { x.items = []; }, "EMPTY_SCHEDULE"],
  ["non-array items", (x) => { x.items = {}; }, "EMPTY_SCHEDULE"],
  ["previous-day generation", (x) => { x.generatedAt = "2026-11-18T06:34:18Z"; }, "STALE_OR_INVALID_GENERATION_TIME"],
  ["future generation", (x) => { x.generatedAt = "2026-11-19T08:00:01Z"; }, "STALE_OR_INVALID_GENERATION_TIME"],
  ["invalid generation", (x) => { x.generatedAt = "invalid"; }, "STALE_OR_INVALID_GENERATION_TIME"],
  ["timezone-less generation", (x) => { x.generatedAt = "2026-11-19T06:34:18"; }, "STALE_OR_INVALID_GENERATION_TIME"],
  ["date-only generation", (x) => { x.generatedAt = "2026-11-19"; }, "STALE_OR_INVALID_GENERATION_TIME"],
  ["impossible timestamp date", (x) => { x.generatedAt = "2026-11-31T06:34:18Z"; }, "STALE_OR_INVALID_GENERATION_TIME"],
  ["24-hour timestamp rollover", (x) => { x.generatedAt = "2026-11-19T24:00:00Z"; }, "STALE_OR_INVALID_GENERATION_TIME"],
  ["missing prior-month coverage", (x) => { x.range.months.shift(); }, "INCOMPLETE_OR_STALE_SCHEDULE_RANGE"],
  ["missing January coverage", (x) => { x.range.months.pop(); }, "INCOMPLETE_OR_STALE_SCHEDULE_RANGE"],
  ["short end date", (x) => { x.range.to = "2027-01-17"; }, "INCOMPLETE_OR_STALE_SCHEDULE_RANGE"],
  ["stale range with fresh generation", (x) => { x.range.from = "2026-11-18"; }, "INCOMPLETE_OR_STALE_SCHEDULE_RANGE"],
  ["wrong inclusive day count", (x) => { x.range.inclusiveDays = 60; }, "INCOMPLETE_OR_STALE_SCHEDULE_RANGE"],
  ["CTC item mixed into official feed", (x) => { x.items[0].source = "ctc"; }, "ITEM_SOURCE_OR_VENUE_MISMATCH"],
  ["numeric venue code", (x) => { x.items[0].venueCode = Number(x.items[0].venueCode); }, "ITEM_SOURCE_OR_VENUE_MISMATCH"],
  ["conflicting venue labels", (x) => { x.items[0].venueName = "not-the-venue"; }, "ITEM_SOURCE_OR_VENUE_MISMATCH"],
  ["unrecognized venue code", (x) => { x.items[0].venueCode = "99"; x.items[0].venue = "unverified"; x.items[0].venueName = "unverified"; }, "ITEM_SOURCE_OR_VENUE_MISMATCH"],
  ["known code assigned to a different venue", (x) => { x.items[0].venue = "熊本"; x.items[0].venueName = "熊本"; }, "ITEM_SOURCE_OR_VENUE_MISMATCH"],
  ["reversed meeting period", (x) => { x.items[0].endDate = "2026-01-01"; }, "INVALID_MEETING_PERIOD"],
  ["impossible meeting date", (x) => { x.items[0].startDate = "2026-02-30"; }, "INVALID_MEETING_PERIOD"],
  ["foreign race identity", (x) => { x.items[0].id = "ctc-old-id"; }, "ITEM_IDENTITY_MISMATCH"],
  ["duplicate meeting", (x) => { x.items.push(structuredClone(x.items[0])); }, "DUPLICATE_MEETING"],
  ["unknown grade", (x) => { x.items[0].grade = "unconfirmed"; }, "INVALID_OR_HELD_MEETING_FIELDS"],
  ["missing title-status", (x) => { delete x.items[0].titleStatus; }, "INVALID_OR_HELD_MEETING_FIELDS"],
  ["explicitly held period", (x) => { x.items[0].periodStatus = "conflict"; }, "INVALID_OR_HELD_MEETING_FIELDS"],
  ["operation change awaiting review", (x) => { x.items[0].operationStatus = "changed"; }, "INVALID_OR_HELD_MEETING_FIELDS"],
  ["girl classification mismatch", (x) => { x.items[0].hasGirls = !x.items[0].hasGirls; }, "MEETING_ICON_CLASSIFICATION_MISMATCH"],
  ["unmarked icon incorrectly promoted to day", (x) => { const item = x.items.find((i) => i.rawSessionIcon === "1"); item.session = "day"; }, "MEETING_ICON_CLASSIFICATION_MISMATCH"],
  ["event reference missing", (x) => { x.items[0].sourceEventReferences = []; }, "MISSING_OFFICIAL_EVENT_REFERENCE"],
  ["raw provenance missing", (x) => { x.items[0].provenance = []; }, "MISSING_RAW_PROVENANCE"],
  ["CTC raw evidence", (x) => { x.items[0].provenance[0].provider = "CTC"; }, "RAW_SOURCE_MONTH_MISMATCH"],
  ["raw evidence outside required months", (x) => { x.items[0].provenance[0].requestedMonth = "2026-09"; }, "RAW_SOURCE_MONTH_MISMATCH"],
  ["raw URL mismatch", (x) => { x.items[0].provenance[0].url = "https://ctc.gr.jp/schedule/"; }, "INVALID_RAW_PROVENANCE"],
  ["raw SHA absent", (x) => { delete x.items[0].provenance[0].rawSha256; }, "INVALID_RAW_PROVENANCE"],
  ["raw length invalid", (x) => { x.items[0].provenance[0].rawBytes = 0; }, "INVALID_RAW_PROVENANCE"],
  ["old raw acquisition under fresh generation", (x) => { x.items[0].provenance[0].fetchedAt = "2026-11-18T06:20:00Z"; }, "STALE_OR_INVALID_RAW_FETCH_TIME"],
  ["future raw acquisition", (x) => { x.items[0].provenance[0].fetchedAt = "2026-11-19T08:00:01Z"; }, "STALE_OR_INVALID_RAW_FETCH_TIME"],
  ["generation predates raw acquisition", (x) => { x.items[0].provenance[0].fetchedAt = "2026-11-19T07:00:00Z"; }, "STALE_OR_INVALID_RAW_FETCH_TIME"],
  ["raw time invalid", (x) => { x.items[0].provenance[0].fetchedAt = "unknown"; }, "STALE_OR_INVALID_RAW_FETCH_TIME"],
  ["conflicting originals for the same month", (x) => { x.items[1].provenance[0].rawSha256 = "f".repeat(64); }, "CONFLICTING_MONTHLY_ORIGINALS"],
]) test(name, () => assertStale(changed(mutate), reason));

test("overlapping or shifted meetings remain unverified", () => {
  const feed = clone(), second = structuredClone(feed.items[0]);
  second.startDate = "2026-11-18"; second.date = second.startDate; second.endDate = "2026-11-20";
  second.id = `keirin-jp-${second.venueCode}-${second.startDate}-${second.endDate}`;
  second.sourceEventReference = "synthetic-shift"; second.sourceEventReferences = ["synthetic-shift"];
  feed.items.push(second);
  assertStale(feed, "CONFLICTING_MEETING_PERIODS");
});
test("valid time-zone offset encodings are equivalent", () => {
  const feed = clone();
  const offset = (time) => new Date(Date.parse(time) + 9 * 3600000).toISOString().replace(/Z$/, "+09:00");
  feed.generatedAt = offset(feed.generatedAt);
  for (const item of feed.items) for (const p of item.provenance) p.fetchedAt = offset(p.fetchedAt);
  assert.equal(inspect(feed, now).fresh, true);
});
test("JST midnight expires the old snapshot, not UTC midnight", () => {
  const feed = clone();
  feed.generatedAt = "2026-11-19T14:59:30Z";
  for (const item of feed.items) for (const p of item.provenance) p.fetchedAt = "2026-11-19T14:59:00Z";
  assert.equal(inspect(feed, new Date("2026-11-19T14:59:59Z")).fresh, true);
  assert.equal(inspect(feed, new Date("2026-11-19T15:00:00Z")).fresh, false);
  assert.equal(buildTodayUpdatePlan({ now: new Date("2026-11-19T15:00:00Z"), upcoming: feed }).upcoming, false);
  assert.equal(buildTodayUpdatePlan({ now: new Date("2026-11-19T21:00:00Z"), upcoming: feed }).upcoming, true);
});
test("UTC previous date is accepted when the acquisition date is today in JST", () => {
  const feed = clone();
  feed.generatedAt = "2026-11-18T15:10:00Z";
  for (const item of feed.items) for (const p of item.provenance) p.fetchedAt = "2026-11-18T15:05:00Z";
  assert.equal(inspect(feed, new Date("2026-11-18T15:11:00Z")).fresh, true);
});
test("unknown sessions and unpublished titles do not cause endless refetch", () => {
  assert.equal(original.items.filter((x) => x.title === "").length, 13);
  assert.equal(original.items.filter((x) => x.session === "unknown").length, 40);
  assert.equal(inspect(original, now).fresh, true);
});
test("year-crossing meetings remain one each, with full periods", () => {
  for (const venueCode of ["35", "42", "61"]) {
    assert.equal(original.items.filter((x) => x.venueCode === venueCode && x.startDate === "2026-12-30" && x.endDate === "2027-01-01").length, 1);
  }
  assert.equal(inspect(original, now).fresh, true);
});
test("month-crossing meetings keep their full dates and stay fresh", () => {
  const meetings = original.items.filter((x) => x.startDate === "2026-11-29" && x.endDate === "2026-12-01");
  assert.equal(meetings.length, 2);
  assert.equal(inspect(original, now).fresh, true);
});
test("invalid clock is never fresh", () => assert.equal(inspect(original, new Date("invalid")).fresh, false));
test("freshness never grants publication permission", () => {
  const feed = changed((x) => { x.schemaVersion = "keirin-jp-schedule-v1"; x.candidateOnly = false; x.publicationAllowed = true;
    x.acceptancePassed = true; x.acceptance = { checkedAt: now.toISOString(), candidateSha256: originalHash }; });
  assert.equal(inspect(feed, now).fresh, true); assert.equal(inspect(feed, now).publicationAllowed, false);
});
test("entry/result planning remains byte-equivalent to the pre-change function", () => {
  const fixture = (date, time, changes = {}) => ({ date, source: { provider: "KEIRIN.JP", fetchCompletedAt: `${date}T${time}:00+09:00` },
    venues: [{ races: [{ entries: [{ registrationNo: "010900" }], resultStatus: "confirmed" }] }], ...changes });
  const dates = ["2026-11-19T00:01:00+09:00", "2026-11-19T06:17:00+09:00", "2026-11-19T11:29:00+09:00", "2026-11-19T23:47:00+09:00", "2026-11-19T23:53:00+09:00"];
  const snapshots = [undefined, fixture("2026-11-19", "06:18"), fixture("2026-11-19", "23:55"), fixture("2026-11-18", "06:18"), fixture("2026-11-19", "11:28", { venues: [] })];
  let compared = 0;
  for (const time of dates) for (const entries of snapshots) for (const results of snapshots)
    for (const event of ["schedule", "workflow_dispatch"]) for (const requestedPhase of ["auto", "lineup", "odds", "result", "final", "backfill"]) {
      const input = { now: new Date(time), entries, results, event, requestedPhase, cron: "47 14 * * *", upcoming: original };
      const before = baseline.buildTodayUpdatePlan(input), after = buildTodayUpdatePlan(input);
      delete before.upcoming; delete after.upcoming;
      assert.deepEqual(after, before); compared++;
    }
  assert.equal(compared, 1500);
});
test("current manual dispatch still cannot request a schedule-only update", () => {
  for (const requestedPhase of ["auto", "lineup", "odds", "result", "final", "backfill"]) {
    assert.equal(buildTodayUpdatePlan({ event: "workflow_dispatch", requestedPhase, now, upcoming: ctc }).upcoming, false);
  }
});
test("pending result timing and incomplete entry identity remain unchanged", () => {
  for (const fetchedAt of ["2026-11-19T07:50:00Z", "2026-11-19T07:00:00Z"]) {
    const input = { now, upcoming: original,
      entries: { date: "2026-11-19", source: { provider: "KEIRIN.JP", fetchCompletedAt: fetchedAt },
        venues: [{ races: [{ entries: [{ registrationNo: "" }] }] }] },
      results: { date: "2026-11-19", source: { provider: "KEIRIN.JP", fetchCompletedAt: fetchedAt },
        venues: [{ races: [{ resultStatus: "pending" }] }] } };
    const before = baseline.buildTodayUpdatePlan(input), after = buildTodayUpdatePlan(input);
    assert.equal(after.entries, before.entries); assert.equal(after.results, before.results);
  }
});
test("sequential schedule invocations recheck newly acquired data", () => {
  assert.equal(buildTodayUpdatePlan({ now, upcoming: ctc }).upcoming, true);
  assert.equal(buildTodayUpdatePlan({ now, upcoming: original }).upcoming, false);
});
test("failed acquisition yields a blocked candidate without overwriting the previous snapshot", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "keirin-freshness-failure-test-"));
  const previous = path.join(temp, "previous.json"); await fs.writeFile(previous, originalBytes, { flag: "wx" });
  let calls = 0;
  const { candidate, report } = await updateUpcomingSchedule({ outputDir: path.join(temp, "failed-run"), asOf: "2026-11-19", fetchImpl: async (url) => {
    calls++; const response = new Response("Forbidden fixture", { status: 403, headers: { "content-type": "text/html" } });
    Object.defineProperty(response, "url", { value: url }); return response;
  } });
  assert.equal(calls, buildRange("2026-11-19").months.length);
  assert.equal(report.dataValidationPassed, false); assert.equal(report.publicationAllowed, false);
  assert.equal(inspect(candidate, now).fresh, false);
  assert.equal(sha256(await fs.readFile(previous)), originalHash);
});
test("actual monthly originals and acquisition report remain consistent", async () => {
  const directory = path.dirname(candidatePath), report = JSON.parse(await fs.readFile(path.join(directory, "run-result.json"), "utf8"));
  assert.equal(report.dataValidationPassed, true); assert.equal(report.failures.length, 0); assert.equal(report.holds.length, 0);
  assert.deepEqual(report.successfulMonths.map((x) => x.month), original.range.months);
  for (const month of report.successfulMonths) {
    const bytes = await fs.readFile(path.join(directory, "raw", month.month + ".html"));
    assert.equal(sha256(bytes), month.sha256);
  }
});
const workflowText = await fs.readFile(path.join(root, ".github/workflows/update-today-race-data.yml"), "utf8");
const workflow = yaml.load(workflowText), steps = workflow.jobs["update-race-data"].steps;
test("workflow only changes schedule diagnostics, not triggers, serialization or other steps", () => {
  const baseline = yaml.load(execFileSync("git", ["show", "HEAD:.github/workflows/update-today-race-data.yml"], { cwd: root, encoding: "utf8" }));
  const normalized = structuredClone(workflow);
  for (const name of ["Update upcoming race schedule", "Report upcoming schedule failure"]) {
    normalized.jobs["update-race-data"].steps.find(step => step.name === name).run = baseline.jobs["update-race-data"].steps.find(step => step.name === name).run;
  }
  assert.deepEqual(normalized, baseline);
  assert.equal(workflow.concurrency.group, "keirin-today-race-data"); assert.equal(workflow.concurrency["cancel-in-progress"], false);
  assert.equal(workflow.permissions.contents, "write");
  assert.deepEqual(Object.keys(workflow.on.workflow_dispatch.inputs), ["phase", "target_date"]);
});
test("upcoming failure cannot pass its current staging condition", () => {
  const commit = steps.find((x) => x.name === "Commit updated race data");
  assert.match(commit.run, /if \[ "\$\{\{ steps\.upcoming_schedule\.outcome \}\}" = "success" \]; then\n\s+git add public\/data\/races\/upcoming-schedule/);
  const update = steps.find((x) => x.id === "upcoming_schedule");
  assert.equal(update["continue-on-error"], true);
  assert.match(update.if, /steps\.update_plan\.outputs\.upcoming == 'true'/);
  assert.ok(steps.some((x) => x.name === "Update today race data" && x.if === "steps.write_window.outputs.run_update == 'true'"));
});
test("official schedule errors retain a visible provider-specific warning and failed pipeline", () => {
  assert.match(workflowText, /\.tmp\/keirin-schedule-upcoming\.log/);
  assert.match(workflowText, /KEIRIN\.JP schedule unavailable/);
  assert.match(steps.find((x) => x.id === "upcoming_schedule").run, /set -o pipefail/);
  assert.match(steps.find((x) => x.id === "upcoming_schedule").run, /npm run update:schedule:upcoming/);
});
test("normal updater dispatch is not safe as a no-write schedule diagnostic", () => {
  assert.match(steps.find((x) => x.name === "Update today race data").run, /update:today-races:write/);
  assert.match(steps.find((x) => x.name === "Commit updated race data").run, /git commit/);
  assert.equal(steps.find((x) => x.name === "Generate KURARI EX race risk for current day").if.includes("steps.update_plan.outputs.entries"), true);
});
test("public snapshot and saved candidate remain byte-identical", async () => {
  assert.equal(sha256(await fs.readFile(candidatePath)), originalHash);
  assert.equal(sha256(await fs.readFile(ctcPath)), ctcHash);
});
