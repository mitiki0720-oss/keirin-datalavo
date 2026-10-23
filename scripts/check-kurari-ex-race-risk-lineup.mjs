import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { verifiedLineupForRace } from "./kurari-ex/verified-lineup.mjs";

const entries = ["1", "2", "3", "4", "5", "6", "7"].map((carNo) => ({ carNo, raceClass: "A1" }));
const identity = { date: "2026-10-23", venueCode: "25", raceNo: 1 };
const base = { race: { lineup: "1 7 5 3 4 6 2" }, entryRace: null, entries, ...identity };
const verified = {
  status: "verified", boundaryEvidence: "explicit-source-groups", source: "venue-official:lineup",
  ...identity, groups: [["1", "7"], ["5"], ["3", "4"], ["6", "2"]],
};

assert.equal(verifiedLineupForRace(base).groups, null, "flat JSJ005 order is not seven lines");
assert.equal(verifiedLineupForRace(base).carOrder, "1 7 5 3 4 6 2");
assert.equal(verifiedLineupForRace({ ...base, entryRace: { officialLineup: { positions: [{ position: 1, carNo: "1" }] } } }).groups, null);
assert.equal(verifiedLineupForRace({ ...base, race: { ...base.race, verifiedLineup: { ...verified, groups: [["1", "7"], ["5"], ["3", "4"], ["6", "6"]] } } }).groups, null, "duplicate car rejected");
assert.equal(verifiedLineupForRace({ ...base, race: { ...base.race, verifiedLineup: { ...verified, groups: [["1", "7"], ["5"], ["3", "4"], ["6", "8"]] } } }).groups, null, "missing/foreign car rejected");
assert.equal(verifiedLineupForRace({ ...base, race: { ...base.race, verifiedLineup: { ...verified, date: "2026-10-22" } } }).groups, null, "wrong date rejected");
assert.equal(verifiedLineupForRace({ ...base, race: { ...base.race, verifiedLineup: { ...verified, source: "KEIRIN.JP:JSJ005:narabiyoso" } } }).groups, null, "position-only source rejected");
assert.equal(verifiedLineupForRace({ ...base, race: { ...base.race, verifiedLineup: { ...verified, boundaryEvidence: undefined } } }).groups, null, "unverified boundaries rejected");
assert.equal(verifiedLineupForRace({ ...base, entries: entries.map((entry) => ({ ...entry, raceClass: "L1" })), race: { ...base.race, verifiedLineup: verified } }).reason, "not-applicable-girls");
const accepted = verifiedLineupForRace({ ...base, race: { ...base.race, verifiedLineup: verified } });
assert.equal(accepted.groups.length, 4);
assert.equal(accepted.groups.filter((group) => group.length === 1).length, 1);

const file = process.argv.find((arg) => arg.startsWith("--file="))?.slice(7);
if (file) {
  const data = JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
  const rows = data.records ?? [];
  assert.equal(rows.length, data.raceCount);
  for (const row of rows) {
    if (row.line.groupingStatus === "verified") continue;
    assert.equal(row.line.lineCount, null, row.raceKey);
    assert.equal(row.line.singleCount, null, row.raceKey);
    assert.equal(row.sourceAvailability.officialLineup, false, row.raceKey);
    assert.equal(row.riskLevel, "INSUFFICIENT", row.raceKey);
    assert.equal(row.confidence, "low", row.raceKey);
    assert.equal(row.signals.find((signal) => signal.key === "line-count")?.contribution ?? 0, 0, row.raceKey);
    assert.equal(row.signals.some((signal) => signal.key === "single-line"), false, row.raceKey);
  }
  console.log(JSON.stringify({ ok: true, fixtureCount: 11, checkedRaces: rows.length, verifiedLineupRaces: rows.filter((row) => row.line.groupingStatus === "verified").length }));
} else {
  console.log(JSON.stringify({ ok: true, fixtureCount: 11 }));
}
