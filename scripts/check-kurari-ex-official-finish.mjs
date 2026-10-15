import assert from "node:assert/strict";
import { canonicalWinningMethod, compareExplicitFinishOrder, explicitFinishRank, officialFinishForStarter } from "./kurari-ex-official-finish.mjs";

const starters = [
  { carNo: 1, registrationNo: "012345", name: "選手 一" },
  { carNo: 2, registrationNo: "012346", name: "選手 二" },
  { carNo: 3, registrationNo: "012347", name: "選手 三" },
];
const tied = { finishOrder: [
  { rank: "1", carNo: "1", registrationNo: "012345", name: "選手 一" },
  { rank: "1", carNo: "2", registrationNo: "012346", name: "選手 二" },
  { rank: "3", carNo: "3", registrationNo: "012347", name: "選手 三" },
] };
assert.deepEqual(starters.map((starter) => officialFinishForStarter(tied, starter)?.rank), [1, 1, 3]);
assert.equal(compareExplicitFinishOrder({ ...tied, status: "finished" }, 1, 2), "unknown-order");
assert.equal(compareExplicitFinishOrder({ ...tied, status: "finished" }, 1, 3), "a-ahead");
assert.equal(explicitFinishRank({ rank: "" }), null);
assert.equal(explicitFinishRank({ rank: "失" }), null);
assert.equal(explicitFinishRank({ rank: "4" }), 4);
assert.equal(canonicalWinningMethod("捲り"), "捲");
assert.equal(canonicalWinningMethod("差し"), "差");
assert.equal(canonicalWinningMethod("逃げ"), "逃");
const missing = { finishOrder: tied.finishOrder.map((row, index) => (
  index === 2 ? { ...row, rank: "", status: "落車" } : row
)) };
assert.equal(officialFinishForStarter(missing, starters[2]).rank, null);
assert.equal(compareExplicitFinishOrder({ ...missing, status: "finished" }, 1, 3), "unknown-order");
assert.equal(compareExplicitFinishOrder({ ...tied, status: "cancelled" }, 1, 3), "unknown-order");
assert.equal(officialFinishForStarter(missing, { ...starters[0], registrationNo: "999999" }).observed, false);
assert.equal(officialFinishForStarter(missing, { ...starters[0], name: "別人" }).observed, false);
assert.equal(officialFinishForStarter({ finishOrder: [] }, starters[0]).observed, false);
assert.equal(officialFinishForStarter(null, starters[0]), null);
console.log("official finish fixture: PASS");
