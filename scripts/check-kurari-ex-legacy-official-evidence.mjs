import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadLegacyOfficialFinishByRace } from "./kurari-ex-legacy-official-evidence.mjs";
import { readCompactHistoryRaces } from "./kurari-ex-history-common.mjs";
import { compareExplicitFinishOrder, officialFinishForStarter } from "./kurari-ex-official-finish.mjs";

const readDaily = async (date) => JSON.parse(await readFile(path.join(
  "public/data/analytics/kurari-ex/history/daily", date.slice(0, 7),
  `${date}.generated.json`,
), "utf8"));
const dates = ["2026-05-22", "2026-07-12", "2026-07-13", "2026-07-15"];
const races = (await Promise.all(dates.map(readDaily))).flatMap((day) => day.items);
const { evidence } = loadLegacyOfficialFinishByRace(races);
const byKey = new Map(races.map((race) => [race.raceKey, race]));

const winner = evidence.get("2026-07-15:utsunomiya:9");
assert.ok(winner?.sourceCommit && winner.sourceBlob && winner.sourceSnapshotSha256);
assert.equal(winner.sourceFetchedAt, null);
assert.equal(officialFinishForStarter(winner,
  byKey.get("2026-07-15:utsunomiya:9").starters.find((row) => row.carNo === 1)).rank, 1);

const conflict = evidence.get("2026-07-13:utsunomiya:2");
assert.equal(officialFinishForStarter(conflict,
  byKey.get("2026-07-13:utsunomiya:2").starters.find((row) => row.carNo === 2)).rank, 1);
assert.equal(officialFinishForStarter(conflict,
  byKey.get("2026-07-13:utsunomiya:2").starters.find((row) => row.carNo === 5)).observed, false);

const tied = evidence.get("2026-07-12:odawara:3");
assert.equal(compareExplicitFinishOrder(tied, 1, 3), "unknown-order");
assert.equal([...evidence.keys()].some((key) => key.startsWith("2026-05-22:")), false);
const history = await readCompactHistoryRaces();
assert.equal(history.errors.length, 0);
assert.equal(history.races.length, 11201);
const baselineRaces = history.races.filter((race) => race.date <= "2026-10-03");
assert.equal(baselineRaces.length, 10490);
assert.throws(() => loadLegacyOfficialFinishByRace(baselineRaces,
  { manifestPath: path.join(".tmp", "nonexistent-legacy-evidence.json") }), /manifest is missing/u);
const stored = loadLegacyOfficialFinishByRace(baselineRaces);
const gitHistory = loadLegacyOfficialFinishByRace(baselineRaces, { fromGitHistory: true });
assert.equal(stored.candidateCount, 102);
assert.equal(stored.evidence.size, 101);
assert.equal(gitHistory.evidence.size, 101);
for (const [raceKey, source] of gitHistory.evidence) {
  assert.deepEqual(stored.evidence.get(raceKey), source, `legacy evidence drift: ${raceKey}`);
}
console.log(`legacy official evidence fixture: PASS (${stored.evidence.size}/102 verified old races)`);
