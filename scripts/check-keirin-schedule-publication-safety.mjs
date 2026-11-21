import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import syncFs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runScheduledUpcomingSchedule, REPOSITORY_ROOT } from "./update-keirin-upcoming-schedule.mjs";
import { inspectUpcomingScheduleFreshness } from "./lib/today-update-plan.mjs";

const rawRoot = process.env.SCHEDULE_RAW_DIR;
assert.ok(rawRoot, "saved official raw directory required");
const now = new Date("2026-11-19T07:00:00Z"), date = "2026-11-19";
const bytes = new Map();
for (const month of ["2026-10", "2026-11", "2026-12", "2027-01"]) bytes.set(month, await fs.readFile(path.join(rawRoot, month + ".html")));
async function officialFetch(url) {
  const u = new URL(url), month = `${u.searchParams.get("scyy")}-${u.searchParams.get("scym")}`;
  const response = new Response(bytes.get(month), { status: 200, headers: { "content-type": "text/html" } });
  Object.defineProperty(response, "url", { value: String(url) });
  return response;
}
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "keirin-schedule-publish-safety-"));
  const file = path.join(root, "upcoming.json"), previous = Buffer.from('{"source":"https://ctc.gr.jp/schedule/","items":[{"id":"keep"}]}\n');
  await fs.writeFile(file, previous);
  return { root, file, previous };
}
const run = (f, options = {}) => runScheduledUpcomingSchedule({ outputFile: f.file, asOf: date,
  fetchImpl: officialFetch, clock: () => new Date(now), ...options });

test("accepted official feed replaces only the isolated target and preserves the source candidate", async () => {
  const f = await fixture(), result = await run(f);
  const feed = JSON.parse(await fs.readFile(f.file, "utf8"));
  assert.equal(feed.provider, "KEIRIN.JP"); assert.equal(feed.schemaVersion, "keirin-jp-schedule-v1");
  assert.equal(feed.items.length, 155); assert.equal(feed.candidateOnly, false); assert.equal(feed.acceptancePassed, true);
  assert.equal(inspectUpcomingScheduleFreshness(feed, now).fresh, true);
  assert.equal(inspectUpcomingScheduleFreshness(feed, now).publicationAllowed, false);
  const candidate = JSON.parse(await fs.readFile(path.join(result.diagnostics, "candidate.json"), "utf8"));
  assert.equal(candidate.candidateOnly, true); assert.equal(candidate.publicationAllowed, false);
  assert.deepEqual(await fs.readFile(path.join(result.diagnostics, "previous-schedule.json")), f.previous);
  assert.equal(feed.items.filter(item => item.title === "").length, 13);
  assert(feed.items.some(item => item.session === "unknown"));
});
for (const status of [403, 404, 500]) test(`HTTP ${status} preserves the existing bytes`, async () => {
  const f = await fixture(); let calls = 0;
  await assert.rejects(run(f, { fetchImpl: async url => {
    calls++; const response = new Response("failure", { status, headers: { "content-type": "text/html" } });
    Object.defineProperty(response, "url", { value: String(url) }); return response;
  } }), /OFFICIAL_SCHEDULE_FETCH_FAILED/u);
  assert.equal(calls, 4); assert.deepEqual(await fs.readFile(f.file), f.previous);
});
for (const reason of ["timeout", "network unavailable"]) test(`${reason} is an error, not successful empty data`, async () => {
  const f = await fixture();
  await assert.rejects(run(f, { fetchImpl: async () => { throw new Error(reason); } }), /OFFICIAL_SCHEDULE_FETCH_FAILED/u);
  assert.deepEqual(await fs.readFile(f.file), f.previous);
});
test("one missing month blocks the entire schedule without blocking other updater code", async () => {
  const f = await fixture();
  await assert.rejects(run(f, { fetchImpl: async url => {
    if (new URL(url).searchParams.get("scym") === "12") throw new Error("missing December");
    return officialFetch(url);
  } }), /OFFICIAL_SCHEDULE_FETCH_FAILED/u);
  assert.deepEqual(await fs.readFile(f.file), f.previous);
});
test("independent original SHA verification blocks tampering after acquisition", async () => {
  const f = await fixture(), diagnostic = path.join(REPOSITORY_ROOT, ".tmp/keirin-schedule-diagnostics");
  const previousDirs = new Set(await fs.readdir(diagnostic)); let calls = 0;
  await assert.rejects(run(f, { clock: () => {
    if (++calls === 6) {
      const dir = syncFs.readdirSync(diagnostic).find(name => !previousDirs.has(name));
      syncFs.appendFileSync(path.join(diagnostic, dir, "raw/2026-11.html"), "tampered fixture");
    }
    return new Date(now);
  } }), /OFFICIAL_SCHEDULE_ACCEPTANCE_FAILED/u);
  assert.deepEqual(await fs.readFile(f.file), f.previous);
});
test("failed atomic rename retains existing data and reports failure", async () => {
  const f = await fixture(), rename = fs.rename;
  try {
    fs.rename = async () => { throw Object.assign(new Error("fixture write denied"), { code: "EACCES" }); };
    await assert.rejects(run(f), /fixture write denied/u);
  } finally { fs.rename = rename; }
  assert.deepEqual(await fs.readFile(f.file), f.previous);
  assert.deepEqual(await fs.readdir(f.root), ["upcoming.json"]);
});
test("concurrent target update is not overwritten or rolled back", async () => {
  const f = await fixture(), newer = Buffer.from("other writer's newer value"); let changed = false;
  await assert.rejects(run(f, { fetchImpl: async url => {
    if (!changed) { changed = true; await fs.writeFile(f.file, newer); }
    return officialFetch(url);
  } }), /SCHEDULE_CONCURRENT_UPDATE_DETECTED/u);
  assert.deepEqual(await fs.readFile(f.file), newer);
});
test("JST date crossover before publication preserves existing data", async () => {
  const f = await fixture(); let calls = 0;
  await assert.rejects(run(f, { clock: () => ++calls < 7 ? new Date(now) : new Date("2026-11-20T00:01:00+09:00") }), /SCHEDULE_DATE_CHANGED_BEFORE_WRITE/u);
  assert.deepEqual(await fs.readFile(f.file), f.previous);
});
test("source permission flags alone never make a candidate a published feed", async () => {
  const f = await fixture(), result = await run(f);
  const candidate = JSON.parse(await fs.readFile(path.join(result.diagnostics, "candidate.json"), "utf8"));
  candidate.candidateOnly = false; candidate.publicationAllowed = true;
  assert.equal(inspectUpcomingScheduleFreshness(candidate, now).fresh, false);
});
test("unapproved local execution cannot write the public file", async () => {
  const old = process.env.GITHUB_ACTIONS;
  try { process.env.GITHUB_ACTIONS = "false"; await assert.rejects(runScheduledUpcomingSchedule(), /PUBLIC_WRITE_REQUIRES_ACTIONS/u); }
  finally { if (old === undefined) delete process.env.GITHUB_ACTIONS; else process.env.GITHUB_ACTIONS = old; }
});
test("saved replay is never allowed to update the public target", async () => {
  const old = process.env.GITHUB_ACTIONS;
  try { process.env.GITHUB_ACTIONS = "true"; await assert.rejects(runScheduledUpcomingSchedule({ replayDir: rawRoot }), /REPLAY_CANNOT_UPDATE_PUBLIC_DATA/u); }
  finally { if (old === undefined) delete process.env.GITHUB_ACTIONS; else process.env.GITHUB_ACTIONS = old; }
});
test("a custom output cannot overwrite another repository file", async () => {
  await assert.rejects(runScheduledUpcomingSchedule({ outputFile: path.join(REPOSITORY_ROOT, "src/types/raceSchedule.ts") }), /CUSTOM_OUTPUT_INSIDE_REPOSITORY_FORBIDDEN/u);
});
