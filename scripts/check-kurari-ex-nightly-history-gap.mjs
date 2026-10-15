import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkNightlyHistoryContinuity,
  runNightly,
} from "./run-kurari-ex-nightly-update.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const indexPath = path.join(root, "public/data/analytics/kurari-ex/history/index.generated.json");
const before = await readFile(indexPath);
const historyTo = JSON.parse(before).period.to;
const addDays = (date, days) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

assert.equal(checkNightlyHistoryContinuity(historyTo, historyTo).safe, true);
assert.equal(checkNightlyHistoryContinuity(historyTo, addDays(historyTo, 1)).safe, true);
assert.equal(checkNightlyHistoryContinuity(historyTo, addDays(historyTo, 2)).safe, false);
assert.throws(() => checkNightlyHistoryContinuity(null, historyTo));

const report = await runNightly({ date: addDays(historyTo, 2), dryRun: true });
assert.equal(report.status, "skipped");
assert.match(report.archive.message, /backfill/u);
assert.deepEqual(await readFile(indexPath), before);
console.log(`nightly history gap guard PASS: historyTo=${historyTo}, blocked=${addDays(historyTo, 2)}`);
