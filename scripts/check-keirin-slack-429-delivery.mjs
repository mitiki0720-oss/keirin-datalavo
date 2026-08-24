import { slackDeliveryTestApi } from "./notify-slack-hits.mjs";

function makeHit(index) {
  return {
    status: "hit",
    hitKey: `2026-08-24:hit:${index}`,
    venue: "函館",
    raceNo: (index % 12) + 1,
    resultOrder: "1-2-3",
    betType: "3連単",
    combination: "1-2-3",
    payout: 1200 + index,
    investment: 100,
    profitLoss: 1100 + index,
    roi: 1200 + index,
  };
}

function makeHits(count) {
  return Array.from({ length: count }, (_, index) => makeHit(index + 1));
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
        return headers[String(name).toLowerCase()] ?? headers[String(name)] ?? null;
      },
    },
  };
}

function makeFetchMock(responses) {
  const calls = [];
  const queue = [...responses];
  const fetchImpl = async (url, init) => {
    calls.push({
      url,
      body: JSON.parse(init.body),
    });
    if (queue.length === 0) throw new Error("fetch mock response exhausted");
    const next = queue.shift();
    return typeof next === "function" ? next(calls.at(-1), calls.length) : next;
  };
  return { fetchImpl, calls };
}

async function runPostToSlack(hits, responses) {
  const sleeps = [];
  const { fetchImpl, calls } = makeFetchMock(responses);
  const result = await slackDeliveryTestApi.postToSlack(hits, {
    dryRun: false,
    webhookUrl: "https://example.invalid/slack-webhook",
    fetchImpl,
    sleepImpl: async (ms) => {
      sleeps.push(ms);
    },
  });
  return { result, calls, sleeps };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`);
}

async function main() {
  const cases = [];

  {
    const { result, calls } = await runPostToSlack(makeHits(2), [makeResponse(200)]);
    assertEqual(calls.length, 1, "2 hit should use 1 Slack POST");
    assertEqual(result.successfulHitKeys.length, 2, "2 hit success keys");
    cases.push("2 hit -> 1 POST");
  }

  {
    const { calls } = await runPostToSlack(makeHits(12), [makeResponse(200)]);
    assertEqual(calls.length, 1, "12 hit should use 1 Slack POST");
    cases.push("12 hit -> 1 POST");
  }

  {
    const { calls } = await runPostToSlack(makeHits(30), [makeResponse(200)]);
    assertEqual(calls.length, 1, "30 hit should use 1 Slack POST");
    assert(calls[0].body.blocks.length <= slackDeliveryTestApi.MAX_BLOCKS_PER_MESSAGE, "30 hit block limit");
    cases.push("30 hit -> 1 POST");
  }

  {
    const hitCount = slackDeliveryTestApi.MAX_HITS_PER_CHUNK + 1;
    const { calls } = await runPostToSlack(makeHits(hitCount), [makeResponse(200), makeResponse(200)]);
    assertEqual(calls.length, 2, "over chunk limit should split safely");
    assert(calls.every((call) => call.body.blocks.length <= slackDeliveryTestApi.MAX_BLOCKS_PER_MESSAGE), "chunk block limit");
    cases.push("block limit chunking");
  }

  {
    const { result, calls, sleeps } = await runPostToSlack(makeHits(1), [
      makeResponse(429, "message_limit_exceeded", { "retry-after": "3" }),
      makeResponse(200),
    ]);
    assertEqual(calls.length, 2, "429 then success should use initial + 1 retry");
    assertEqual(sleeps[0], 3000, "Retry-After 3 seconds sleep mock");
    assertEqual(result.successfulHitKeys.length, 1, "429 retry success key");
    assert(!calls.some((call) => !Array.isArray(call.body.blocks)), "429 must not use plain text fallback");
    cases.push("429 Retry-After retry success");
  }

  {
    const { result, calls, sleeps } = await runPostToSlack(makeHits(1), [
      makeResponse(429, "message_limit_exceeded"),
      makeResponse(429, "message_limit_exceeded"),
    ]);
    assertEqual(calls.length, 2, "429 retry failure should use 2 POSTs");
    assertEqual(sleeps[0], slackDeliveryTestApi.DEFAULT_RETRY_AFTER_SECONDS * 1000, "default Retry-After sleep mock");
    assertEqual(result.successfulHitKeys.length, 0, "429 retry failure successful keys");
    assertEqual(result.failedHitKeys.length, 1, "429 retry failure failed keys");
    assert(!calls.some((call) => !Array.isArray(call.body.blocks)), "429 failure must not use fallback");
    cases.push("429 retry failure no fallback");
  }

  {
    const { result, calls } = await runPostToSlack(makeHits(1), [
      makeResponse(400, "invalid_blocks"),
      makeResponse(200),
    ]);
    assertEqual(calls.length, 2, "400 invalid_blocks should use fallback POST");
    assert(Array.isArray(calls[0].body.blocks), "first 400 call should be blocks");
    assert(!Array.isArray(calls[1].body.blocks), "fallback call should be plain text");
    assertEqual(result.successfulHitKeys.length, 1, "fallback success keys");
    cases.push("400 invalid_blocks fallback success");
  }

  {
    const { result, calls } = await runPostToSlack(makeHits(1), [
      makeResponse(400, "invalid_blocks"),
      makeResponse(400, "invalid_payload"),
    ]);
    assertEqual(calls.length, 2, "fallback failure should use 2 POSTs");
    assertEqual(result.successfulHitKeys.length, 0, "fallback failure successful keys");
    assertEqual(result.failedHitKeys.length, 1, "fallback failure failed keys");
    cases.push("fallback failure keeps hit unnotified");
  }

  {
    const dryRun = await slackDeliveryTestApi.postToSlack(makeHits(2), {
      dryRun: true,
      webhookUrl: "https://example.invalid/slack-webhook",
      fetchImpl: async () => {
        throw new Error("dry-run should not fetch");
      },
    });
    assertEqual(dryRun.successfulHitKeys.length, 0, "dry-run successful keys");
    assertEqual(dryRun.failedHitKeys.length, 0, "dry-run failed keys");
    cases.push("dry-run no POST");
  }

  console.log("[keirin slack 429 delivery check]");
  console.log(`MAX_BLOCKS_PER_MESSAGE=${slackDeliveryTestApi.MAX_BLOCKS_PER_MESSAGE}`);
  console.log(`MAX_HITS_PER_CHUNK=${slackDeliveryTestApi.MAX_HITS_PER_CHUNK}`);
  console.log(`MAX_429_RETRY_COUNT=${slackDeliveryTestApi.MAX_429_RETRY_COUNT}`);
  for (const name of cases) console.log(`PASS ${name}`);
  console.log("status: PASS");
}

main().catch((error) => {
  console.error("[keirin slack 429 delivery check] failed");
  console.error(error);
  process.exitCode = 1;
});
