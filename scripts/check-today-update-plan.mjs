import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import yaml from "js-yaml";
import { automaticUpdatePhase, buildTodayUpdatePlan, reportUpdateState } from "./lib/today-update-plan.mjs";
import { todayUpdateTestApi as api } from "./update-today-races.mjs";
import { mergeWithExisting } from "./update-keirin-jp-results.mjs";
import { runScheduledUpcomingSchedule, buildRange } from "./update-keirin-upcoming-schedule.mjs";

const cases = [];
async function test(name, callback) { await callback(); cases.push(name); }
const date = "2026-11-19";
const now = (time) => new Date(date + "T" + time + ":00+09:00");
const snapshot = (time, changes = {}) => ({ date, source: { provider: "KEIRIN.JP", fetchCompletedAt: now(time).toISOString() },
  venues: [{ races: [{ entries: [{ carNo: "1", registrationNo: "000001" }], resultStatus: "pending" }] }], ...changes });
for (const [time, phase, session] of [["06:17", "lineup", "day"], ["08:13", "lineup", "day"], ["10:13", "odds", "day"],
  ["11:29", "result", "all"], ["14:13", "odds", "night"], ["17:13", "lineup", "midnight"], ["20:13", "odds", "midnight"], ["23:47", "final", "all"], ["23:53", "backfill", "all"]]) {
  await test("real JST mode " + time + " -> " + phase, () => {
    assert.deepEqual({ phase: automaticUpdatePhase(now(time)).phase, session: automaticUpdatePhase(now(time)).session }, { phase, session });
  });
}
await test("06:17 schedule delayed to 11:29 selects auto/result, not lineup", () => {
  const plan = buildTodayUpdatePlan({ now: now("11:29"), cron: "17 21 * * *", entries: snapshot("06:18"), results: snapshot("06:18") });
  assert.equal(plan.phase, "auto"); assert.equal(plan.effectivePhase, "result"); assert.equal(plan.entries, true); assert.equal(plan.results, true);
});
await test("missing earlier checkpoints catch up on next normal start", () => {
  const plan = buildTodayUpdatePlan({ now: now("14:37"), cron: "37 0-14 * * *", entries: snapshot("08:14"), results: snapshot("09:14") });
  assert.equal(plan.entries, true); assert.equal(plan.results, true); assert.equal(plan.effectivePhase, "odds"); assert.equal(plan.date, date);
});
await test("fresh current snapshots avoid redundant official fetch", () => {
  const plan = buildTodayUpdatePlan({ now: now("11:37"), entries: snapshot("11:30"), results: snapshot("11:30") });
  assert.equal(plan.entries, false); assert.equal(plan.results, false);
});
await test("pending results older than 20 minutes refresh even between checkpoints", () => {
  assert.equal(buildTodayUpdatePlan({ now: now("11:37"), results: snapshot("11:10") }).results, true);
  const results = snapshot("11:10"); results.venues[0].races[0].resultStatus = "confirmed";
  assert.equal(buildTodayUpdatePlan({ now: now("11:37"), results }).results, false);
});
for (const changes of [{ date: "2026-11-18" }, { source: { provider: "unknown" } }, { venues: [] }, { source: { provider: "KEIRIN.JP", fetchCompletedAt: "invalid" } }]) {
  await test("invalid snapshot requires verified refetch " + JSON.stringify(changes), () => {
    const plan = buildTodayUpdatePlan({ now: now("11:29"), entries: snapshot("11:28", changes), results: snapshot("11:28", changes) });
    assert.equal(plan.entries, true); assert.equal(plan.results, true); assert.equal(plan.date, date);
  });
}
await test("future snapshot is not current verified evidence", () => assert.equal(buildTodayUpdatePlan({ now: now("11:29"), results: snapshot("12:30") }).results, true));
await test("registration missing in entries requires refetch", () => {
  const entries = snapshot("11:28"); delete entries.venues[0].races[0].entries[0].registrationNo;
  assert.equal(buildTodayUpdatePlan({ now: now("11:29"), entries }).entries, true);
});
await test("manual phase is retained and backfill does not force entry rewrite", () => {
  for (const phase of ["lineup", "odds", "result", "final", "backfill"]) assert.equal(buildTodayUpdatePlan({ event: "workflow_dispatch", requestedPhase: phase }).phase, phase);
  assert.equal(buildTodayUpdatePlan({ event: "workflow_dispatch", requestedPhase: "backfill" }).entries, false);
  assert.equal(buildTodayUpdatePlan({ event: "workflow_dispatch", requestedPhase: "auto", results: snapshot("08:18"), now: now("11:29") }).results, true);
});
await test("final/backfill cron retains explicit terminal phase", () => {
  assert.equal(buildTodayUpdatePlan({ now: now("23:47"), cron: "47 14 * * *" }).phase, "final");
  assert.equal(buildTodayUpdatePlan({ now: now("23:53"), cron: "53 14 * * *" }).phase, "backfill");
});
await test("auto catches missing lineup/riders outside original session", () => {
  const phase = automaticUpdatePhase(now("11:29"));
  const venue = { session: "midnight", venue: "fixture" };
  assert.equal(api.shouldFetchLineupForRace(null, venue, phase), true);
  assert.equal(api.shouldFetchRiderDetailForRace(null, venue, phase), true);
  assert.equal(api.shouldFetchResultForRace({ resultStatus: "pending" }, venue, phase), true);
});
await test("auto refreshes unsettled odds and reuses complete confirmed odds", () => {
  const phase = automaticUpdatePhase(now("10:13"));
  const odds = { oddsAcquisition: { status: "odds-verified" }, oddsTrifecta: [{ combination: "1-2-3", odds: 5 }] };
  assert.equal(api.shouldFetchOddsForRace({ ...odds, resultStatus: "pending" }, {}, phase), true);
  assert.equal(api.shouldFetchOddsForRace({ ...odds, resultStatus: "confirmed" }, {}, phase), false);
  assert.equal(api.shouldFetchOddsForRace({ resultStatus: "confirmed" }, {}, phase), true);
});
await test("manual session/phase policy remains explicit", () => {
  const phase = api.resolveUpdatePhase(now("11:29"), "odds");
  assert.equal(phase.catchUp, undefined); assert.equal(phase.explicit, true); assert.equal(phase.phase, "odds");
  assert.equal(api.shouldFetchLineupForRace(null, {}, phase), false);
});
const settled = { raceNumber: 1, resultStatus: "confirmed", finishOrder: [{ rank: "1", carNo: "1", registrationNo: "000001" }], payouts: { trifecta: [{ combination: "1-2-3", payoutYen: 500 }] } };
const official = (race) => ({ date, venueCount: 1, raceCount: 1, venues: [{ venueCode: "12", races: [race] }] });
await test("confirmed result/payout cannot regress to pending", () => {
  const old = official(settled); const bytes = JSON.stringify(old);
  const result = mergeWithExisting(old, official({ raceNumber: 1, resultStatus: "pending" }));
  assert.deepEqual(result.payload.venues[0].races[0], settled); assert.equal(JSON.stringify(old), bytes);
});
await test("conflicting settled payout is rejected", () => {
  assert.throws(() => mergeWithExisting(official(settled), official({ ...settled, payouts: { trifecta: [{ combination: "1-2-3", payoutYen: 999 }] } })));
});
await test("official confirmed today result survives pending official overlay", () => {
  const cached = { resultStatus: "confirmed", raceOperationSource: "KEIRIN.JP:JSJ012", result: { status: "confirmed", payout3tan: { combination: "1-2-3", payout: 500 } } };
  assert.deepEqual(api.applyOfficialResultToRace(cached, { resultStatus: "pending" }, null, "fixture"), cached);
});
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "keirin-stability-"));
await test("official HTTP 403 fails each required month and existing schedule stays byte-identical", async () => {
  const file = path.join(temp, "upcoming.json"); const bytes = '{"protected":"fixture"}\n'; await fs.writeFile(file, bytes);
  let calls = 0;
  await assert.rejects(runScheduledUpcomingSchedule({ outputFile: file, asOf: date, clock: () => now("11:29"), fetchImpl: async url => {
    calls++; const response = new Response("Forbidden", { status: 403, headers: { "content-type": "text/html" } });
    Object.defineProperty(response, "url", { value: String(url) }); return response;
  } }), /403/);
  assert.equal(calls, buildRange(date).months.length); assert.equal(await fs.readFile(file, "utf8"), bytes);
});
await test("CTC partial failure is explicit in Summary, with snapshot date and publish result", async () => {
  let text = ""; await reportUpdateState({ append: async (s) => { text += s; }, upcomingOutcome: "failure", upcomingLog: "Failed to fetch CTC schedule: 403", snapshots: { results: snapshot("11:28") }, publishOutcome: "success", publishChanged: "true" });
  for (const value of ["FAILED / not updated", "HTTP 403", date, "Git公開ステップ: success"]) assert.ok(text.includes(value));
});
await test("official fresh data is not fetched again; stale date and CTC remain retry candidates", async () => {
  assert.ok(process.env.SCHEDULE_CANDIDATE_JSON, "saved official candidate required");
  const upcoming = JSON.parse(await fs.readFile(process.env.SCHEDULE_CANDIDATE_JSON, "utf8"));
  const scheduleNow = new Date(Date.parse(upcoming.generatedAt) + 60_000);
  assert.equal(buildTodayUpdatePlan({ now: scheduleNow, upcoming }).upcoming, false);
  assert.equal(buildTodayUpdatePlan({ now: scheduleNow, upcoming: { ...upcoming, generatedAt: "2026-11-18T01:00:00Z" } }).upcoming, true);
  assert.equal(buildTodayUpdatePlan({ now: scheduleNow, upcoming: { ...upcoming, source: "https://ctc.gr.jp/schedule/" } }).upcoming, true);
});
const file = ".github/workflows/update-today-race-data.yml";
const current = yaml.load(await fs.readFile(file, "utf8"));
const previous = yaml.load(execFileSync("git", ["show", "origin/main:" + file], { encoding: "utf8" }));
const steps = current.jobs["update-race-data"].steps;
for (const cron of ["47 14 * * *", "53 14 * * *"]) {
  await test("expired " + cron + " executes no downstream update/commit/report", async () => {
    const outputs = {};
    class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : ["2026-11-18T22:19:24Z"])); } }
    const summary = { addHeading() { return this; }, addTable() { return this; }, addRaw() { return this; }, async write() {} };
    const context = { eventName: "schedule", payload: { schedule: cron }, repo: {}, runId: 1 };
    const github = { rest: { actions: { async getWorkflowRun() { return { data: { created_at: "2026-11-18T22:19:24Z" } }; } } } };
    const core = { setOutput(key, value) { outputs[key] = value; }, notice() {}, summary };
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    await new AsyncFunction("context", "github", "core", "Date", steps[0].with.script)(context, github, core, ClockDate);
    assert.equal(outputs.run_update, "false");
    const state = { execution_window: { outputs }, write_window: { outputs: { run_update: "false" } }, update_plan: { outputs: {}, outcome: "skipped" } };
    for (const step of steps.slice(1)) {
      assert.ok(step.if, step.name);
      const allowed = new Function("steps", "github", "always", "return (" + step.if + ");")(state, { event_name: "schedule", event: { schedule: cron } }, () => true);
      assert.equal(Boolean(allowed), false, step.name);
    }
  });
}
await test("official inputs are validated before today feed, which precedes commit", () => {
  const index = (name) => steps.findIndex((step) => step.name === name);
  for (const name of ["Validate KEIRIN.JP official entries", "Validate KEIRIN.JP official results"]) assert.ok(index(name) < index("Update today race data"));
  assert.ok(index("Update today race data") < index("Commit updated race data"));
});
function values(field) { return field.split(",").flatMap((part) => { if (part.includes("-")) { const [a,b] = part.split("-").map(Number); return Array.from({ length: b-a+1 }, (_, i) => a+i); } return [Number(part)]; }); }
function slots(crons) { return crons.flatMap(({ cron }) => { const [minutes,hours] = cron.split(" "); return values(hours).flatMap((hour) => values(minutes).map((minute) => hour*60+minute)); }); }
await test("cron UTC/JST cadence retained, no 00/30 congestion or duplicate matches", () => {
  const before = new Set(slots(previous.on.schedule)), after = slots(current.on.schedule);
  assert.equal(after.length, new Set(after).size); assert.equal(new Set(after).size, before.size);
  assert.ok(after.every((value) => value%60 !== 0 && value%60 !== 30));
  for (const [h,m] of [[6,17],[8,13],[10,13],[12,17],[15,17],[18,17],[21,17],[23,47],[23,53]]) assert.ok(after.includes(((h+15)%24)*60+m));
});
await test("expiry guards, terminal archives, Pages/Slack and EX workflows untouched", async () => {
  for (const id of ["execution_window", "write_window"]) assert.deepEqual(steps.find((s) => s.id === id), previous.jobs["update-race-data"].steps.find((s) => s.id === id));
  for (const name of ["Archive Review official results", "Generate KURARI EX prediction performance"]) assert.deepEqual(steps.find((s) => s.name === name), previous.jobs["update-race-data"].steps.find((s) => s.name === name));
  const diff = execFileSync("git", ["diff", "--name-only", "--", "public", "src", ".github/workflows/deploy.yml", ".github/workflows/notify-slack-hits.yml", ".github/workflows/update-kurari-ex-nightly.yml", ".github/workflows/check-kurari-ex-nightly-stale.yml"], { encoding: "utf8" });
  const allowed = new Set(["src/types/raceSchedule.ts", "src/pages/PageImplementations.tsx", "src/pages/RacesPage.tsx"]);
  assert.deepEqual(diff.trim().split(/\r?\n/).filter(Boolean).filter(file => !allowed.has(file)), []);
});
await test("partial CTC output is never staged; publish retries are bounded", () => {
  const run = steps.find((s) => s.name === "Commit updated race data").run;
  assert.match(run, /if \[ .*upcoming_schedule.outcome.* = "success" \]; then\n  git add public\/data\/races\/upcoming/);
  assert.match(run, /for attempt in 1 2 3/); assert.ok(!run.includes("--force"));
  assert.match(run, /assertCurrentDayWriteDate\(feed\.date, process\.env\.UPDATE_TARGET_DATE/);
  assert.deepEqual(current.concurrency, previous.concurrency);
});
await test("manual past-date request stops planner before source execution/output", () => {
  const output = path.join(temp, "output");
  const child = spawnSync(process.execPath, ["scripts/lib/today-update-plan.mjs"], { encoding: "utf8", env: { ...process.env, REQUESTED_TARGET_DATE: "2020-01-01", UPDATE_EVENT: "workflow_dispatch", GITHUB_OUTPUT: output } });
  assert.notEqual(child.status, 0); assert.match(child.stderr, /refusing all source updates/);
});
console.log(cases.map((name) => "PASS " + name).join("\n"));
console.log(cases.length + "/" + cases.length + " PASS");
