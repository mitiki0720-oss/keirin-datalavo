import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync, execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { slackDeliveryTestApi as api } from "./notify-slack-hits.mjs";
import { reserveNotifications, eligibleReservations, completeReservations, validateLedger, loadLedger } from "./lib/slack-notification-ledger.mjs";

const cases = [];
function test(name, run) { run(); cases.push(name); }
const purchase = ["7-3-2", "7-3-1", "7-2-3", "3-7-1", "3-7-2", "2-7-3", "2-7-4", "2-5-7", "7-3-4", "7-2-1", "2-5-3", "7-3-5"];
const shadow = ["2-7-5", "2-3-7", "3-1-7", "7-3-6", "7-2-5", "5-2-7"];
const labels = ["厚め", "本線", "厚め", "本線逆目", "中穴", "本線", "中穴", "中穴", "本線", "本線", "中穴", "本線"];
function slot(skip = false) {
  const buys = skip ? [] : purchase;
  const shadows = skip ? [...purchase, ...shadow] : shadow;
  const text = ["【2026-11-11 大宮 2R】", "date: 2026-11-11", "venue: 大宮", "race: 2R",
    `raceSelectGrade: ${skip ? "C" : "B"}`, `purchaseDecision: ${skip ? "SKIP" : "VALUE_BUY"}`,
    `purchasePoints: ${buys.length}`, `investmentYen: ${buys.length * 100}`,
    "【出走表】", "【並び】", "【展開】", "【買い目】",
    ...(buys.length ? buys.map((combo, i) => `${String(i + 1).padStart(2, "0")} | 3連単 | ${combo} | ${labels[i]}`) : ["なし"]),
    "【影目】", ...shadows.map((combo, i) => `${String(i + 1).padStart(2, "0")} | 3連単 | ${combo} | 影`), "【設計メモ】"].join("\n");
  return { date: "2026-11-11", venue: "大宮", raceNo: 2, predictionText: text };
}
function race(order = "7-3-2", payout = 1030) {
  return { date: "2026-11-11", venueName: "大宮", venueCode: "25", raceNo: 2, raceId: "test-2",
    race: { result: { status: "confirmed", finishOrder: order.split("-"), payout3tan: { combination: order, payout } } } };
}
const hit = api.prepareNotificationResult(api.resolveSettledResult(slot(), race()));
test("purchase: 12 tickets, not all 18 candidates", () => {
  assert.equal(hit.investment, 1200); assert.equal(hit.payout, 1030); assert.equal(hit.profitLoss, -170);
  assert.deepEqual(hit.hitRoles, ["厚め"]); assert.equal(hit.hitSection, "purchase");
});
test("original labels: main, reverse, longshot", () => {
  for (const [combo, role] of [["7-3-1", "本線"], ["3-7-1", "本線逆目"], ["2-7-4", "中穴"]]) {
    assert.match(api.buildSlackHitMessage(api.resolveSettledResult(slot(), race(combo))), new RegExp(`${role}的中`));
  }
});
test("SKIP: 18 shadow tickets, no actual investment", () => {
  const result = api.resolveSettledResult(slot(true), race("7-3-2", 730));
  assert.equal(result.investment, 0); assert.equal(result.payout, 0); assert.equal(result.profitLoss, 0);
  assert.equal(result.roi, undefined); assert.equal(result.referenceInvestment, 1800);
  assert.match(api.buildSlackHitMessage(result), /影目（18点）・購入なし/);
  assert.match(api.buildSlackHitMessage(result), /参考損益: -1,070円/);
});
test("shadow-only hit with purchased tickets separates actual loss", () => {
  const result = api.resolveSettledResult(slot(), race("2-7-5", 730));
  assert.equal(result.investment, 1200); assert.equal(result.payout, 0); assert.equal(result.profitLoss, -1200);
  assert.equal(result.referenceInvestment, 600); assert.equal(result.referencePayout, 730);
  assert.match(api.buildSlackHitMessage(result), /影目的中/);
});
test("missing official payout is held, not HIT with zero yen", () => assert.equal(api.resolveSettledResult(slot(), race("7-3-2", null)), null));
test("pending result is held", () => {
  const info = race(); info.race.result = { status: "pending", finishOrder: [] };
  assert.equal(api.resolveSettledResult(slot(), info), null);
});
test("complex deadheat purchase settlement remains held", () => {
  const info = race(); info.race.result.reviewSettlementEligible = false;
  assert.equal(api.resolveSettledResult(slot(), info), null);
});
test("unclassified old predictions are not treated as paid tickets", () => assert.deepEqual(api.resolveTickets({ predictionJson: { tickets: [{ betType: "3連単", combination: "7-3-2" }] } }), []));
test("invalid canonical metadata fails closed", () => assert.deepEqual(api.resolveTickets({ ...slot(), predictionText: slot().predictionText.replace("purchasePoints: 12", "purchasePoints: 18") }), []));
test("structured plan unit stake and original role retained", () => {
  const input = { predictionJson: { tickets: [{ index: "01", betType: "3連単", combination: "7-3-2", note: "厚め" }],
    betPlan: { status: "structured", purchaseDecision: "BUY", purchaseTicketIndices: ["01"], shadowTicketIndices: [], unitStakeYen: 200, declaredPurchasePoints: 1, declaredInvestmentYen: 200 } } };
  const result = api.resolveSettledResult(input, race());
  assert.equal(result.investment, 200); assert.equal(result.payout, 2060); assert.deepEqual(result.hitRoles, ["厚め"]);
});
test("same-section duplicate ticket cannot double count", () => {
  const input = { predictionJson: { tickets: [{ index: "01", betType: "3連単", combination: "7-3-2" }, { index: "02", betType: "3連単", combination: "7-3-2" }],
    betPlan: { status: "structured", purchaseTicketIndices: ["01", "02"], shadowTicketIndices: [], purchaseDecision: "BUY" } } };
  assert.deepEqual(api.resolveTickets(input), []);
});
const empty = () => ({ version: 1, records: {} });
test("reserve once before sending; updated payout cannot resend", () => {
  const first = reserveNotifications(empty(), [hit], "run:1");
  assert.equal(first.plan.results.length, 1);
  assert.equal(reserveNotifications(first.ledger, [{ ...hit, payout: 5000 }], "next:1").plan.results.length, 0);
});
test("code/name alias avoids identity change resends", () => {
  const first = reserveNotifications(empty(), [{ ...hit, venueCode: "" }], "run:1");
  assert.equal(reserveNotifications(first.ledger, [hit], "next:1").plan.results.length, 0);
});
test("legacy sent notification migrates without resending", () => {
  const reserved = reserveNotifications(empty(), [hit], "run:1", [hit]);
  assert.equal(reserved.plan.results.length, 0); assert.ok(Object.values(reserved.ledger.records).every((row) => row.status === "sent"));
});
test("next day preserves old ledger while allowing new race", () => {
  const first = reserveNotifications(empty(), [hit], "run:1");
  const next = reserveNotifications(first.ledger, [{ ...hit, date: "2026-11-12" }], "next:1");
  assert.equal(next.plan.results.length, 1); assert.equal(Object.keys(next.ledger.records).length, 4);
});
test("crash/re-run uses a different owner and cannot deliver reservation", () => {
  const first = reserveNotifications(empty(), [hit], "run:1");
  assert.throws(() => eligibleReservations(first.ledger, first.plan, "run:2"), /owner/);
  assert.equal(reserveNotifications(first.ledger, [hit], "run:2").plan.results.length, 0);
});
test("successful delivery becomes sent and cannot repeat", () => {
  const first = reserveNotifications(empty(), [hit], "run:1");
  const sent = completeReservations(first.ledger, [hit], [hit.hitKey]);
  assert.equal(eligibleReservations(sent, first.plan, "run:1").length, 0);
});
test("uncertain delivery is held, never retried automatically", () => {
  const first = reserveNotifications(empty(), [hit], "run:1");
  const failed = completeReservations(first.ledger, [hit], []);
  assert.ok(Object.values(failed.records).every((row) => row.status === "uncertain"));
  assert.equal(reserveNotifications(failed, [hit], "next:1").plan.results.length, 0);
});
test("corrupt ledger refuses reset/resend", () => {
  assert.throws(() => validateLedger({ version: 0, records: {} }));
  assert.throws(() => validateLedger({ version: 1, records: { bad: { status: "sent" } } }));
});
test("duplicate records in same plan collapse to one race", () => assert.equal(reserveNotifications(empty(), [hit, hit], "run:1").plan.results.length, 1));
test("escaped original label cannot inject Slack mentions", () => {
  const message = api.buildSlackHitMessage({ ...hit, hitRoles: ["<@all>"], matchedTickets: [] });
  assert.ok(!message.includes("<@all>"));
});

const root = await fs.mkdtemp(path.join(os.tmpdir(), "kurari-slack-fixture-"));
const script = fileURLToPath(new URL("./notify-slack-hits.mjs", import.meta.url));
const write = async (relative, value) => { const file = path.join(root, relative); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, JSON.stringify(value)); };
const ledgerPath = path.join(root, ".github/state/slack-hit-notifications.json");
const planPath = path.join(root, "plan.json");
await write(".github/state/slack-hit-notifications.json", empty());
await write("public/data/predictions/saved-predictions.generated.json", { records: { test: slot() } });
await write("public/data/races/today.generated.json", { date: "2026-11-11", venues: [{ venue: "大宮", venueName: "大宮", venueCode: "25", races: [{ raceNo: 2, ...race().race }] }] });
const originalPredictions = await fs.readFile(path.join(root, "public/data/predictions/saved-predictions.generated.json"), "utf8");
const invoke = (args, env = {}) => spawnSync(process.execPath, [script, ...args], { cwd: root, env: { ...process.env, GITHUB_RUN_ID: "test", GITHUB_RUN_ATTEMPT: "1", SLACK_WEBHOOK_URL: "https://example.invalid/not-used", ...env }, encoding: "utf8" });
test("CLI dry-run has no writes and no delivery", () => {
  const result = invoke(["--dry-run"]); assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /notified hit: 1/);
});
test("CLI direct send refuses unpersisted state", () => assert.notEqual(invoke([]).status, 0));
test("CLI prepare reserves without POST", () => {
  const result = invoke(["--prepare", "--plan-path", planPath]); assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /reserved 1 new race/);
});
test("CLI delivery blocked unless persisted reservation acknowledged", () => assert.notEqual(invoke(["--deliver", "--plan-path", planPath]).status, 0));
await fs.access(planPath);
assert.equal(await fs.readFile(path.join(root, "public/data/predictions/saved-predictions.generated.json"), "utf8"), originalPredictions);
cases.push("prediction input JSON stays byte-identical");
const before = await fs.readFile(ledgerPath, "utf8");
test("CLI data rebuild without notified keys does not resend", () => {
  const result = invoke(["--prepare", "--plan-path", path.join(root, "second-plan.json")], { GITHUB_RUN_ID: "second" });
  assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /reserved 0 new race/);
});
assert.equal(await fs.readFile(ledgerPath, "utf8"), before);
const payloads = [];
let responseStatus = 200;
const server = createServer(async (request, response) => {
  let body = "";
  for await (const chunk of request) body += chunk;
  payloads.push(JSON.parse(body));
  response.writeHead(responseStatus); response.end(responseStatus === 200 ? "ok" : "artificial failure");
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
try {
  const url = `http://127.0.0.1:${server.address().port}/artificial-slack`;
  await promisify(execFile)(process.execPath, [script, "--deliver", "--plan-path", planPath], {
    cwd: root, env: { ...process.env, GITHUB_RUN_ID: "test", GITHUB_RUN_ATTEMPT: "1", SLACK_WEBHOOK_URL: url, SLACK_RESERVATION_PERSISTED: "true" },
    timeout: 10000,
  });
  assert.equal(payloads.length, 1);
  assert.match(JSON.stringify(payloads[0]), /厚め的中/);
  assert.ok(Object.values((await loadLedger(ledgerPath)).records).every((row) => row.status === "sent"));
  cases.push("CLI delivery to artificial localhost webhook records sent state");
  const repeated = invoke(["--deliver", "--plan-path", planPath], { SLACK_RESERVATION_PERSISTED: "true", SLACK_WEBHOOK_URL: url });
  assert.equal(repeated.status, 0, repeated.stderr);
  assert.equal(payloads.length, 1);
  cases.push("CLI repeated delivery sends no second POST");
  responseStatus = 500;
  const secondHit = api.prepareNotificationResult({ ...hit, raceNo: 3 });
  const failedPlan = reserveNotifications(await loadLedger(ledgerPath), [secondHit], "test:1");
  await fs.writeFile(ledgerPath, JSON.stringify(failedPlan.ledger));
  await fs.writeFile(planPath, JSON.stringify(failedPlan.plan));
  await assert.rejects(promisify(execFile)(process.execPath, [script, "--deliver", "--plan-path", planPath], {
    cwd: root, env: { ...process.env, GITHUB_RUN_ID: "test", GITHUB_RUN_ATTEMPT: "1", SLACK_WEBHOOK_URL: url, SLACK_RESERVATION_PERSISTED: "true" }, timeout: 10000,
  }));
  assert.equal(payloads.length, 2);
  const failedLedger = await loadLedger(ledgerPath);
  assert.equal(failedLedger.records[secondHit.raceNotificationKey].status, "uncertain");
  assert.equal(reserveNotifications(failedLedger, [secondHit], "next:1").plan.results.length, 0);
  cases.push("CLI HTTP 500 records uncertain state, fails, and never auto-resends");
} finally {
  await new Promise((resolve) => server.close(resolve));
}
await fs.writeFile(ledgerPath, "{broken");
test("CLI corrupt ledger stops before POST", () => assert.notEqual(invoke(["--prepare", "--plan-path", planPath]).status, 0));
await assert.rejects(loadLedger(path.join(root, "missing.json")));
cases.push("missing ledger fails closed");
console.log(cases.map((name) => `PASS ${name}`).join("\n"));
console.log(`Slack labels and durable ledger: ${cases.length}/${cases.length} PASS`);
console.log(`Artificial fixture evidence: ${root}`);
