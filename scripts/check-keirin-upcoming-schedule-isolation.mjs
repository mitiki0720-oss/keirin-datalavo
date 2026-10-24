import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import yaml from "js-yaml";
import { updateUpcomingSchedule } from "./update-keirin-upcoming-schedule.mjs";
import { assertCurrentDayWriteDate } from "./lib/official-today-source.mjs";

const workflow = yaml.load(await readFile(".github/workflows/update-today-race-data.yml", "utf8"));
const steps = workflow.jobs["update-race-data"].steps;
const byName = (name) => steps.find((step) => step.name === name);
const schedule = byName("Update upcoming race schedule");
const report = byName("Report upcoming schedule failure");
const commit = byName("Commit updated race data");
assert.equal(schedule.if, "github.event.schedule == '10 21 * * *'");
assert.equal(schedule["continue-on-error"], true);
assert.match(report.if, /steps\.upcoming_schedule\.outcome == 'failure'/u);
assert.match(report.run, /::warning.*CTC/u);
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
const now = new Date("2026-10-24T00:00:00Z");
const fetchFixture = (body, status = 200) => async (url) => {
  assert.equal(url, "https://ctc.gr.jp/schedule/");
  return new Response(body, { status });
};
const run = (fetchImpl) => updateUpcomingSchedule({ fetchImpl, outputPath, now });

await assert.rejects(run(fetchFixture("Forbidden", 403)), /CTC schedule: 403/u);
assert.equal(await readFile(outputPath, "utf8"), sentinel);
await assert.rejects(run(fetchFixture("", 200)), /No upcoming race schedule items/u);
assert.equal(await readFile(outputPath, "utf8"), sentinel);
await assert.rejects(run(fetchFixture("<html><body>maintenance</body></html>")), /No upcoming race schedule items/u);
assert.equal(await readFile(outputPath, "utf8"), sentinel);

const html = `<!doctype html><div id="racelist"><li class="race">
  <a href="/race?id=53202610240000">
    <div class="place"><p>奈良</p></div>
    <div class="name"><h2><span>F1</span>開催</h2><p>10/24～10/26</p></div>
    <ul class="attr"><li class="night">ナイター</li></ul>
  </a></li></div>`;
const generated = await run(fetchFixture(html));
assert.equal(generated.range.from, "2026-10-24");
assert.equal(generated.source, "https://ctc.gr.jp/schedule/");
assert.equal(generated.items.length, 1);
assert.equal(generated.items[0].venue, "奈良");
assert.equal(JSON.parse(await readFile(outputPath, "utf8")).items.length, 1);
const completed = await readFile(outputPath, "utf8");
await assert.rejects(run(fetchFixture("Forbidden", 403)), /CTC schedule: 403/u);
assert.equal(await readFile(outputPath, "utf8"), completed);

console.log(JSON.stringify({
  result: "PASS",
  cases: ["CTC 403", "CTC 200", "empty response", "changed HTML", "CTC failure reaches commit gate", "required official failure blocks commit", "JST date mismatch"],
  scheduleFailure: "warning, no schedule write, commit gate remains reachable",
  fixtureOutput: outputPath,
}));
