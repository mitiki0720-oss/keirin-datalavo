import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import yaml from "js-yaml";
import { runScheduledUpcomingSchedule } from "./update-keirin-upcoming-schedule.mjs";
import { assertCurrentDayWriteDate } from "./lib/official-today-source.mjs";

const workflow = yaml.load(await readFile(".github/workflows/update-today-race-data.yml", "utf8"));
const steps = workflow.jobs["update-race-data"].steps;
const byName = (name) => steps.find((step) => step.name === name);
const schedule = byName("Update upcoming race schedule");
const report = byName("Report upcoming schedule failure");
const commit = byName("Commit updated race data");
assert.equal(schedule.if, "steps.write_window.outputs.run_update == 'true' && steps.update_plan.outputs.upcoming == 'true'");
assert.match(byName("Plan current-day updates from time and snapshots").run, /today-update-plan/);
assert.equal(schedule["continue-on-error"], true);
assert.match(report.if, /steps\.upcoming_schedule\.outcome == 'failure'/u);
assert.match(report.run, /::warning.*KEIRIN\.JP/u);
assert.match(schedule.run, /set -o pipefail/u);
assert.ok(steps.indexOf(schedule) < steps.indexOf(commit));
assert.ok(steps.indexOf(report) < steps.indexOf(commit));
const reachesCommitAfterFailure = (failedStep) =>
  steps.indexOf(failedStep) < steps.indexOf(commit) && failedStep["continue-on-error"] === true;
assert.ok(steps.indexOf(schedule) < steps.indexOf(commit), "CTC success reaches commit");
assert.equal(reachesCommitAfterFailure(schedule), true, "CTC failure must not block validated today data");
for (const name of [
  "Update today race data",
  "Validate today race data is not empty",
  "Update KEIRIN.JP official entries",
  "Validate KEIRIN.JP official entries",
  "Generate KURARI EX race risk for current day",
  "Update KEIRIN.JP official results",
  "Validate KEIRIN.JP official results",
]) {
  assert.notEqual(byName(name)?.["continue-on-error"], true, `${name} must remain required`);
  assert.ok(steps.indexOf(byName(name)) < steps.indexOf(commit));
  assert.equal(reachesCommitAfterFailure(byName(name)), false, `${name} failure must block commit`);
}
assert.match(commit.run, /assertCurrentDayWriteDate\(feed\.date, jstDate/u);
assert.match(commit.run, /git add public\/data\/races\/today\.generated\.json/u);
assert.throws(() => assertCurrentDayWriteDate("2026-10-23", "2026-10-24", "fixture publish"), /refusing current-day overwrite/u);

const tempRoot = await mkdtemp(path.join(tmpdir(), "keirin-ctc-schedule-audit-"));
const outputPath = path.join(tempRoot, "upcoming-schedule.generated.json");
const sentinel = "unchanged schedule fixture\n";
await writeFile(outputPath, sentinel);
const now = new Date("2026-11-19T07:00:00Z");
const fetchFixture = (body, status = 200) => async (url) => {
  assert.equal(new URL(url).origin, "https://www.keirin.jp");
  const response = new Response(body, { status, headers: { "content-type": "text/html" } });
  Object.defineProperty(response, "url", { value: String(url) }); return response;
};
const run = (fetchImpl) => runScheduledUpcomingSchedule({ fetchImpl, outputFile: outputPath, asOf: "2026-11-19", clock: () => new Date(now) });

await assert.rejects(run(fetchFixture("Forbidden", 403)), /HTTP_403/u);
assert.equal(await readFile(outputPath, "utf8"), sentinel);
await assert.rejects(run(fetchFixture("", 200)), /OFFICIAL_SCHEDULE_FETCH_FAILED/u);
assert.equal(await readFile(outputPath, "utf8"), sentinel);
await assert.rejects(run(fetchFixture("<html><body>maintenance</body></html>")), /OFFICIAL_SCHEDULE_FETCH_FAILED/u);
assert.equal(await readFile(outputPath, "utf8"), sentinel);

assert.ok(process.env.SCHEDULE_RAW_DIR, "saved official monthly originals required");
await run(async url => {
  const query = new URL(url).searchParams, month = `${query.get("scyy")}-${query.get("scym")}`;
  return fetchFixture(await readFile(path.join(process.env.SCHEDULE_RAW_DIR, month + ".html")))(url);
});
const generated = JSON.parse(await readFile(outputPath, "utf8"));
assert.equal(generated.range.from, "2026-11-19");
assert.equal(generated.source, "https://www.keirin.jp/sp/raceschedule");
assert.equal(generated.items.length, 155);
assert.equal(generated.provider, "KEIRIN.JP");
assert.equal(generated.acceptancePassed, true);
const completed = await readFile(outputPath, "utf8");
await assert.rejects(run(fetchFixture("Forbidden", 403)), /HTTP_403/u);
assert.equal(await readFile(outputPath, "utf8"), completed);

console.log(JSON.stringify({
  result: "PASS",
  cases: ["official HTTP 403", "official HTTP 200", "empty response", "changed HTML", "schedule failure reaches commit gate", "required official failure blocks commit", "JST date mismatch"],
  scheduleFailure: "warning, no schedule write, commit gate remains reachable",
  fixtureOutput: outputPath,
}));
