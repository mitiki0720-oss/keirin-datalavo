import { slackDeliveryTestApi } from "./notify-slack-hits.mjs";
import { buildSavedPredictionsPayload } from "./rebuild-keirin-saved-predictions.mjs";

const ACTIVE_DATE = "2026-08-27";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`);
}

function makeHit(raceNo, overrides = {}) {
  return slackDeliveryTestApi.prepareNotificationResult({
    status: "hit",
    date: ACTIVE_DATE,
    venue: "前橋",
    venueCode: "22",
    raceNo,
    raceId: `22202608270100${String(raceNo).padStart(2, "0")}`,
    resultOrder: "1-2-3",
    betType: "3連単",
    combination: "1-2-3",
    payout: 12340,
    investment: 800,
    profitLoss: 11540,
    roi: 1542.5,
    ...overrides,
  });
}

function makeResponse(status, body = "", headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return body;
    },
    headers: {
      get(name) {
        return headers[String(name).toLowerCase()] ?? null;
      },
    },
  };
}

function makeFetchMock(responses) {
  const calls = [];
  const queue = [...responses];
  return {
    calls,
    fetchImpl: async (_url, init) => {
      calls.push(JSON.parse(init.body));
      if (queue.length === 0) throw new Error("fetch mock response exhausted");
      return queue.shift();
    },
  };
}

function emptyState() {
  return { resultKeys: [], hitKeys: [], raceKeys: [] };
}

function selectTargets(hits, state) {
  const notified = {
    result: new Set(state.resultKeys),
    hit: new Set(state.hitKeys),
    race: new Set(state.raceKeys),
  };
  const targets = [];
  const migratedRaceKeys = [];
  const plannedRaceKeys = new Set();
  let skipped = 0;

  for (const hit of hits) {
    const classification = slackDeliveryTestApi.classifyHitNotification(hit, notified);
    if (classification.alreadyNotified) {
      skipped += 1;
      if (classification.migrateRaceNotificationKey) {
        migratedRaceKeys.push(classification.migrateRaceNotificationKey);
      }
      continue;
    }
    if (plannedRaceKeys.has(hit.raceNotificationKey)) {
      skipped += 1;
      continue;
    }
    plannedRaceKeys.add(hit.raceNotificationKey);
    targets.push(hit);
  }

  return { targets, migratedRaceKeys, skipped };
}

async function runNotification(hits, state, responses) {
  const selection = selectTargets(hits, state);
  const { calls, fetchImpl } = makeFetchMock(responses);
  const delivery = await slackDeliveryTestApi.postToSlack(selection.targets, {
    dryRun: false,
    webhookUrl: "https://example.invalid/slack-webhook",
    fetchImpl,
    sleepImpl: async () => {},
  });
  const next = slackDeliveryTestApi.buildNextNotificationState({
    todayDate: ACTIVE_DATE,
    retainedResultKeys: state.resultKeys,
    retainedHitKeys: state.hitKeys,
    retainedRaceKeys: state.raceKeys,
    missResults: [],
    hitResults: selection.targets,
    successfulHitKeys: delivery.successfulHitKeys,
    migratedRaceKeys: selection.migratedRaceKeys,
  });
  return {
    selection,
    delivery,
    calls,
    state: {
      resultKeys: next.resultKeys,
      hitKeys: next.hitKeys,
      raceKeys: next.raceKeys,
    },
  };
}

async function main() {
  const firstRace = makeHit(1);
  const fifthRace = makeHit(5);

  const firstRun = await runNotification([firstRace], emptyState(), [makeResponse(200)]);
  assertEqual(firstRun.selection.targets.length, 1, "first run target count");
  assertEqual(firstRun.calls.length, 1, "first run Slack POST count");
  assertEqual(firstRun.state.raceKeys.length, 1, "first run race key count");

  const sameRunDuplicate = await runNotification(
    [firstRace, makeHit(1, { payout: 15000, resultOrder: "1-3-2", combination: "1-3-2" })],
    emptyState(),
    [makeResponse(200)],
  );
  assertEqual(sameRunDuplicate.selection.targets.length, 1, "same-run duplicate target count");
  assertEqual(sameRunDuplicate.calls.length, 1, "same-run duplicate Slack POST count");

  const secondRun = await runNotification(
    [firstRace, fifthRace],
    firstRun.state,
    [makeResponse(200)],
  );
  assertEqual(secondRun.selection.skipped, 1, "second run old race skip count");
  assertEqual(secondRun.selection.targets.length, 1, "second run new target count");
  assertEqual(secondRun.selection.targets[0].raceNo, 5, "second run target race");
  assertEqual(secondRun.calls.length, 1, "second run Slack POST count");
  assertEqual(secondRun.state.raceKeys.length, 2, "second run race key count");

  const thirdRun = await runNotification([firstRace, fifthRace], secondRun.state, []);
  assertEqual(thirdRun.selection.targets.length, 0, "third run target count");
  assertEqual(thirdRun.calls.length, 0, "third run Slack POST count");

  const changedFirstRace = makeHit(1, {
    raceId: "race:representation-changed",
    resultOrder: "1-3-2",
    combination: "1-3-2",
    payout: 19870,
    profitLoss: 19070,
    roi: 2483.75,
  });
  assertEqual(
    changedFirstRace.raceNotificationKey,
    firstRace.raceNotificationKey,
    "race notification key must ignore mutable result metadata",
  );
  assert(changedFirstRace.hitKey !== firstRace.hitKey, "legacy hit key should demonstrate metadata change");
  const changedResultRun = await runNotification([changedFirstRace], secondRun.state, []);
  assertEqual(changedResultRun.selection.targets.length, 0, "changed result target count");
  assertEqual(changedResultRun.calls.length, 0, "changed result Slack POST count");

  const failedRun = await runNotification(
    [firstRace],
    emptyState(),
    [
      makeResponse(429, "message_limit_exceeded", { "retry-after": "1" }),
      makeResponse(429, "message_limit_exceeded", { "retry-after": "1" }),
    ],
  );
  assertEqual(failedRun.calls.length, 2, "429 initial plus bounded retry POST count");
  assertEqual(failedRun.delivery.successfulHitKeys.length, 0, "429 successful hit keys");
  assertEqual(failedRun.state.raceKeys.length, 0, "429 must not persist race key");
  const retrySelection = selectTargets([firstRace], failedRun.state);
  assertEqual(retrySelection.targets.length, 1, "failed hit must remain retryable");

  const legacyState = {
    resultKeys: [firstRace.resultKey],
    hitKeys: [firstRace.hitKey],
    raceKeys: [],
  };
  const legacySelection = selectTargets([firstRace], legacyState);
  assertEqual(legacySelection.targets.length, 0, "legacy exact hit must not resend");
  assertEqual(legacySelection.migratedRaceKeys.length, 1, "legacy exact hit race key migration");

  const changedLegacySelection = selectTargets([changedFirstRace], {
    resultKeys: [],
    hitKeys: [firstRace.hitKey],
    raceKeys: [],
  });
  assertEqual(changedLegacySelection.targets.length, 0, "changed legacy hit must not resend same race");
  assertEqual(changedLegacySelection.migratedRaceKeys.length, 1, "changed legacy hit race key migration");

  const rebuilt = buildSavedPredictionsPayload({
    entries: [],
    activeDate: ACTIVE_DATE,
    now: new Date("2026-08-27T12:00:00.000Z"),
    previous: {
      notifiedSlackResultKeys: [firstRace.resultKey, "2026-08-26:old-result"],
      notifiedSlackHitKeys: [firstRace.hitKey, "2026-08-26:old-hit"],
      notifiedSlackRaceKeys: [firstRace.raceNotificationKey, "2026-08-26:old-race"],
      slackResultNotifiedAt: "2026-08-27T11:00:00.000Z",
    },
  }).payload;
  assertEqual(rebuilt.notifiedSlackResultKeys.length, 1, "rebuild result key preservation");
  assertEqual(rebuilt.notifiedSlackHitKeys.length, 1, "rebuild hit key preservation");
  assertEqual(rebuilt.notifiedSlackRaceKeys.length, 1, "rebuild race key preservation");
  assertEqual(
    rebuilt.slackResultNotifiedAt,
    "2026-08-27T11:00:00.000Z",
    "rebuild notification timestamp preservation",
  );

  const legacyRebuild = buildSavedPredictionsPayload({
    entries: [],
    activeDate: ACTIVE_DATE,
    previous: {},
    now: new Date("2026-08-27T12:00:00.000Z"),
  }).payload;
  assertEqual(legacyRebuild.notifiedSlackRaceKeys.length, 0, "missing race key schema compatibility");

  console.log("[keirin slack exactly-once check]");
  console.log(`raceKey=${firstRace.raceNotificationKey}`);
  console.log("PASS first hit -> 1 POST and 1 race key");
  console.log("PASS same-run duplicate race -> 1 target");
  console.log("PASS old + new hit -> new race only");
  console.log("PASS third unchanged run -> 0 POST");
  console.log("PASS changed result metadata -> 0 POST");
  console.log("PASS 429 retry failure -> race remains retryable");
  console.log("PASS exact legacy key -> no resend and safe race-key migration");
  console.log("PASS changed legacy hit metadata -> same-race migration without resend");
  console.log("PASS rebuild preserves result/hit/race keys and timestamp");
  console.log("PASS missing notifiedSlackRaceKeys -> empty-array compatibility");
  console.log("status: PASS");
}

main().catch((error) => {
  console.error("[keirin slack exactly-once check] failed");
  console.error(error);
  process.exitCode = 1;
});
