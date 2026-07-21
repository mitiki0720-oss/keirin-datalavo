import fs from "node:fs/promises";
import path from "node:path";

const ROOT_DIR = process.cwd();

const PREDICTIONS_FILE = path.join(
  ROOT_DIR,
  "public",
  "data",
  "predictions",
  "saved-predictions.generated.json",
);

const TODAY_RACES_FILE = path.join(
  ROOT_DIR,
  "public",
  "data",
  "races",
  "today.generated.json",
);

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const SITE_URL = "https://mitiki0720-oss.github.io/keirin-datalavo/#mobile-dashboard";
const DRY_RUN = process.argv.includes("--dry-run");
const SELF_TEST_PAYOUT_PARSER = process.argv.includes("--self-test-payout-parser");
const LOG_PREFIX = "[notify-slack-results]";

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[＞>→]/g, "-")
    .replace(/[－ー―‐−–]/g, "-")
    .replace(/\s+/g, "")
    .trim();
}

function normalizeRaceId(value) {
  if (!value) return "";
  return String(value)
    .replace(/^prediction-slot:/, "")
    .replace(/^race:/, "")
    .trim();
}

function normalizeVenueName(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/競輪場|競輪/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function getBetTypeKind(betType) {
  const text = String(betType ?? "");

  if (text.includes("3連単") || text.includes("三連単")) return "3tan";
  if (text.includes("2車単") || text.includes("2連単") || text.includes("二車単")) return "2tan";

  return "other";
}

function normalizeBetTypeLabel(value) {
  const kind = getBetTypeKind(value);
  if (kind === "3tan") return "3連単";
  if (kind === "2tan") return "2車単";
  return String(value ?? "").normalize("NFKC").trim();
}

function getCarNo(value) {
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (!value || typeof value !== "object") return "";
  return String(value.carNo ?? value.number ?? value.no ?? "").trim();
}

function getResultOrder(race) {
  const finishOrder = (race?.result?.finishOrder ?? []).map(getCarNo).filter(Boolean);
  if (finishOrder.length >= 3) return finishOrder.slice(0, 3).join("-");

  const topRows = (race?.resultTop3 ?? []).map((item) => getCarNo(item)).filter(Boolean);
  if (topRows.length >= 3) return topRows.slice(0, 3).join("-");

  return "";
}

function normalizePayoutDigits(value) {
  return String(value)
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[，,]/g, "");
}

function parsePayoutAmountYen(value) {
  if (value == null) return null;

  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }

  if (typeof value === "object") {
    const candidates = [
      value.amountYen,
      value.payoutYen,
      value.yen,
      value.amount,
      value.payout,
      value.value,
      value.text,
      value.label,
    ];

    for (const candidate of candidates) {
      const parsed = parsePayoutAmountYen(candidate);
      if (parsed != null) return parsed;
    }

    return null;
  }

  const text = String(value).trim();
  if (!text) return null;

  const yenMatch = text.match(/([0-9０-９][0-9０-９,，]*)\s*円/);
  if (yenMatch) {
    const amount = Number(normalizePayoutDigits(yenMatch[1]));
    return Number.isFinite(amount) ? amount : null;
  }

  if (/^[0-9０-９,，]+$/.test(text)) {
    const amount = Number(normalizePayoutDigits(text));
    return Number.isFinite(amount) ? amount : null;
  }

  return null;
}

function formatYen(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  if (value === 0) return "0円";
  return `${value > 0 ? "+" : "-"}${Math.abs(value).toLocaleString("ja-JP")}円`;
}

function formatPlainYen(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${value.toLocaleString("ja-JP")}円`;
}

function formatRate(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${value.toFixed(1)}%`;
}

function findSlotRecords(payload) {
  if (payload?.records && typeof payload.records === "object") {
    return Object.values(payload.records);
  }

  if (Array.isArray(payload?.recordList)) {
    return payload.recordList;
  }

  return [];
}

function makeVenueDate(todayFeed, venue) {
  return venue?.date ?? venue?.startDate ?? todayFeed?.date ?? "";
}

function makeVenueName(venue) {
  return venue?.venue ?? venue?.venueName ?? venue?.name ?? venue?.trackName ?? "";
}

function makeRaceNumber(race) {
  const raceNo = Number(race?.raceNumber ?? race?.raceNo);
  return Number.isFinite(raceNo) && raceNo > 0 ? raceNo : undefined;
}

function makeRaceLookupKeys(race, venue, todayFeed) {
  const date = race?.date ?? makeVenueDate(todayFeed, venue);
  const venueName = race?.venueName ?? race?.trackName ?? makeVenueName(venue);
  const normalizedVenue = normalizeVenueName(venueName);
  const raceNo = makeRaceNumber(race);
  const raceIdFromVenue = raceNo ? venue?.raceIds?.[raceNo - 1] : "";

  return [
    normalizeRaceId(race?.race_id),
    normalizeRaceId(race?.raceId),
    normalizeRaceId(raceIdFromVenue),
    date && venueName && raceNo ? `${date}:${venueName}:${raceNo}` : "",
    date && normalizedVenue && raceNo ? `${date}:${normalizedVenue}:${raceNo}` : "",
  ].filter(Boolean);
}

function makeSlotLookupKeys(slot) {
  const date = slot?.date ?? "";
  const venueName = slot?.venue ?? slot?.venueName ?? slot?.trackName ?? "";
  const normalizedVenue = normalizeVenueName(venueName);
  const raceNo = Number(slot?.raceNumber ?? slot?.raceNo);

  return [
    normalizeRaceId(slot?.raceId),
    normalizeRaceId(slot?.race_id),
    normalizeRaceId(slot?.raceKey),
    date && venueName && Number.isFinite(raceNo) ? `${date}:${venueName}:${raceNo}` : "",
    date && normalizedVenue && Number.isFinite(raceNo) ? `${date}:${normalizedVenue}:${raceNo}` : "",
  ].filter(Boolean);
}

function buildRaceIndex(todayFeed) {
  const raceMap = new Map();

  for (const venue of todayFeed?.venues ?? []) {
    for (const race of venue.races ?? []) {
      const raceNo = makeRaceNumber(race);
      const raceId = normalizeRaceId(race?.raceId ?? race?.race_id ?? (raceNo ? venue?.raceIds?.[raceNo - 1] : ""));
      const date = race?.date ?? makeVenueDate(todayFeed, venue);
      const venueName = makeVenueName(venue);
      const raceInfo = { venue, race, date, raceId, venueName, raceNo };

      for (const key of makeRaceLookupKeys(race, venue, todayFeed)) {
        if (!raceMap.has(key)) raceMap.set(key, raceInfo);
      }
    }
  }

  return raceMap;
}

function isRaceResultConfirmed(race) {
  const resultOrder = getResultOrder(race);
  if (!resultOrder) return false;

  const result = race?.result ?? {};
  const statusConfirmed = result.status === "confirmed" || race?.resultStatus === "confirmed";
  const hasPayouts =
    Boolean(result.payout2tan?.payout) ||
    Boolean(result.payout3tan?.payout) ||
    Boolean(result.payout3fuku?.payout) ||
    (Array.isArray(result.payout2fuku) && result.payout2fuku.length > 0) ||
    (Array.isArray(result.payoutWide) && result.payoutWide.length > 0) ||
    (Array.isArray(race?.payouts) && race.payouts.length > 0);

  return statusConfirmed || hasPayouts;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizePayoutItem(payout, betType) {
  if (!payout) return null;
  if (typeof payout === "string" || typeof payout === "number") {
    return { betType, payout };
  }
  if (typeof payout !== "object") return null;
  return { ...payout, betType: payout.betType ?? payout.type ?? payout.ticketType ?? payout.kind ?? payout.name ?? payout.label ?? betType };
}

function collectRacePayoutItems(race) {
  const result = race?.result ?? {};
  const items = [
    normalizePayoutItem(result.payout2tan, "2車単"),
    normalizePayoutItem(result.payout3tan, "3連単"),
    normalizePayoutItem(result.payout3fuku, "3連複"),
    ...asArray(result.payouts),
    ...asArray(race?.payouts),
    ...asArray(result.payoffs),
    ...asArray(race?.payoffs),
    ...asArray(result.refunds),
    ...asArray(race?.refunds),
  ];

  return items.filter(Boolean);
}

function getPayoutItemBetType(item) {
  if (!item || typeof item !== "object") return "";
  return normalizeBetTypeLabel(item.betType ?? item.type ?? item.ticketType ?? item.kind ?? item.name ?? item.label);
}

function getPayoutItemCombination(item) {
  if (!item || typeof item !== "object") return "";
  return normalizePredictionCombination(
    item.combination ?? item.numbers ?? item.result ?? item.combo ?? item.line ?? item.ticket,
  );
}

function findRacePayoutForHit(race, betType, combination) {
  const targetBetType = normalizeBetTypeLabel(betType);
  const targetCombination = normalizePredictionCombination(combination);
  if (!race || !targetBetType || !targetCombination) return null;

  const sameBetTypeItems = collectRacePayoutItems(race)
    .map((item) => normalizePayoutItem(item, ""))
    .filter((item) => item && getPayoutItemBetType(item) === targetBetType);

  const exactItem = sameBetTypeItems.find((item) => getPayoutItemCombination(item) === targetCombination);
  if (exactItem) return exactItem;

  const fallbackItem = sameBetTypeItems.find((item) => {
    const itemCombination = getPayoutItemCombination(item);
    return !itemCombination || itemCombination === targetCombination;
  });

  return fallbackItem ?? null;
}

function normalizePredictionCombination(value) {
  return normalizeText(value);
}

function extractPredictionBetEntries(predictionText) {
  const normalizedText = String(predictionText ?? "").replace(/\r\n/g, "\n").normalize("NFKC");
  const blockLines = [];
  let inBetBlock = false;

  for (const rawLine of normalizedText.split("\n")) {
    const line = rawLine.trim();
    const normalizedLine = line.replace(/[【】]/g, "").trim();

    if (!inBetBlock) {
      if (/^買い目/.test(normalizedLine)) inBetBlock = true;
      continue;
    }

    if (/^(タグ|結果|メモ|振り返り)/.test(normalizedLine)) break;
    blockLines.push(line);
  }

  const lines = blockLines.map((line) => line.replace(/（[^）]*）|\([^)]*\)/g, " ").trim());
  const entries = [];
  const seen = new Set();
  let currentBetType = "3連単";

  for (const line of lines) {
    if (!line) continue;

    const lineWithoutBrackets = line.replace(/[【】]/g, "").trim();
    if (/3連単/.test(lineWithoutBrackets) && !/^\d{1,2}\s/.test(lineWithoutBrackets)) {
      currentBetType = "3連単";
      continue;
    }
    if (/2車単/.test(lineWithoutBrackets) && !/^\d{1,2}\s/.test(lineWithoutBrackets)) {
      currentBetType = "2車単";
      continue;
    }

    const withType = line.match(/^(\d{1,2})\s+(3連単|2車単)\s+([1-9]\s*[-→＞ー−–]\s*[1-9](?:\s*[-→＞ー−–]\s*[1-9])?)(?:\s|$)/);
    const noType = line.match(/^(\d{1,2})\s+([1-9]\s*[-→＞ー−–]\s*[1-9](?:\s*[-→＞ー−–]\s*[1-9])?)(?:\s|$)/);
    const match = withType ?? noType;
    if (!match) continue;

    const index = match[1].padStart(2, "0");
    const betType = withType ? match[2] : currentBetType;
    const combination = normalizePredictionCombination(withType ? match[3] : match[2]);
    const key = `${index}:${betType}:${combination}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ index, betType, combination });
  }

  if (entries.length > 0) return entries;

  const fallbackMatches = normalizedText.replace(/[→＞ー−–]/g, "-").match(/\b[1-9]\s*-\s*[1-9]\s*-\s*[1-9]\b/g) ?? [];
  return Array.from(new Set(fallbackMatches.map(normalizePredictionCombination).filter(Boolean))).map((combination, index) => ({
    index: String(index + 1).padStart(2, "0"),
    betType: "3連単",
    combination,
  }));
}

function resolveTickets(slot) {
  const structuredTickets = slot?.predictionJson?.tickets;
  if (Array.isArray(structuredTickets) && structuredTickets.length > 0) {
    return structuredTickets
      .map((ticket, index) => ({
        index: ticket.index ?? String(index + 1).padStart(2, "0"),
        betType: ticket.betType,
        combination: normalizePredictionCombination(ticket.combination),
      }))
      .filter((ticket) => ticket.combination);
  }

  return extractPredictionBetEntries(slot?.predictionText);
}

function summarizeTickets(tickets) {
  const trifectaCount = tickets.filter((ticket) => getBetTypeKind(ticket.betType) === "3tan").length;
  const exactaCount = tickets.filter((ticket) => getBetTypeKind(ticket.betType) === "2tan").length;
  return [
    trifectaCount ? `3連単${trifectaCount}点` : "",
    exactaCount ? `2車単${exactaCount}点` : "",
  ].filter(Boolean).join(" / ") || `${tickets.length}点`;
}

function resolveSettledResult(slot, raceInfo) {
  const tickets = resolveTickets(slot);
  if (!Array.isArray(tickets) || tickets.length === 0) return null;

  const resultOrder = getResultOrder(raceInfo.race);
  if (!resultOrder || !isRaceResultConfirmed(raceInfo.race)) return null;

  const resultParts = normalizeText(resultOrder).split("-").filter(Boolean);
  const resultTop3 = resultParts.slice(0, 3).join("-");
  const resultTop2 = resultParts.slice(0, 2).join("-");

  const hitTicket = tickets.find((ticket) => {
    const ticketCombination = normalizePredictionCombination(ticket.combination);
    const kind = getBetTypeKind(ticket.betType);

    if (kind === "3tan") return ticketCombination === resultTop3;
    if (kind === "2tan") return ticketCombination === resultTop2;

    return false;
  });

  const hitKind = getBetTypeKind(hitTicket?.betType);
  const hitBetType = hitKind === "2tan" ? "2車単" : hitKind === "3tan" ? "3連単" : "";
  const payoutItem = hitTicket ? findRacePayoutForHit(raceInfo.race, hitBetType, hitTicket.combination) : null;
  const payout = hitTicket ? parsePayoutAmountYen(payoutItem) : 0;
  const investment = tickets.length > 0 ? tickets.length * 100 : undefined;
  const resolvedPayout = hitTicket ? (payout ?? 0) : 0;
  const profitLoss =
    typeof investment === "number" && typeof resolvedPayout === "number"
      ? resolvedPayout - investment
      : undefined;
  const roi =
    typeof investment === "number" && investment > 0
      ? (resolvedPayout / investment) * 100
      : undefined;

  return {
    status: hitTicket ? "hit" : "miss",
    venue: raceInfo.venueName,
    raceNo: raceInfo.raceNo,
    date: raceInfo.date,
    raceId: raceInfo.raceId,
    resultOrder: resultTop3,
    betType: hitTicket ? hitBetType : "",
    combination: hitTicket?.combination ?? "",
    ticketSummary: summarizeTickets(tickets),
    ticketCount: tickets.length,
    payout: resolvedPayout,
    investment,
    profitLoss,
    roi,
  };
}

function buildDedupeKey(result) {
  return [
    result.date,
    normalizeVenueName(result.venue),
    result.raceNo,
    normalizeText(result.resultOrder),
    "settled",
    "v2",
  ].join(":");
}

function keepTodayDedupeKeys(keys, todayDate) {
  if (!todayDate) return [];
  return Array.from(new Set(
    (Array.isArray(keys) ? keys : [])
      .map((key) => String(key ?? "").trim())
      .filter((key) => key.startsWith(`${todayDate}:`)),
  ));
}

async function loadJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch {
    return fallback;
  }
}

async function writePayloadWithNotifiedKeys(predictionsPayload, resultKeys, hitKeys) {
  await fs.writeFile(
    PREDICTIONS_FILE,
    `${JSON.stringify({
      ...predictionsPayload,
      notifiedSlackResultKeys: resultKeys,
      ...(Array.isArray(predictionsPayload?.notifiedSlackHitKeys)
        ? { notifiedSlackHitKeys: hitKeys }
        : {}),
    }, null, 2)}\n`,
    "utf-8",
  );
}

function buildSlackMessage(result) {
  if (result.status === "hit") {
    return [
      `🎯 的中｜${result.venue} ${result.raceNo}R`,
      `結果：${result.resultOrder}`,
      `的中：${result.betType} ${result.combination}`,
      `払戻：${formatPlainYen(result.payout)}`,
      `投資：${formatPlainYen(result.investment)}`,
      `収支：${formatYen(result.profitLoss)}`,
      `回収率：${formatRate(result.roi)}`,
    ].join("\n");
  }

  return [
    `😿 不的中｜${result.venue} ${result.raceNo}R`,
    `結果：${result.resultOrder}`,
    `買い目：${result.ticketSummary}`,
    `投資：${formatPlainYen(result.investment)}`,
    "払戻：0円",
    `収支：${formatYen(result.profitLoss)}`,
  ].join("\n");
}

async function postToSlack(results) {
  if (results.length === 0) {
    console.log(`${LOG_PREFIX} No new settled prediction results.`);
    return;
  }

  if (DRY_RUN) {
    console.log(`${LOG_PREFIX} dry-run: would notify ${results.length} result(s)`);
    for (const result of results) {
      console.log("---");
      console.log(buildSlackMessage(result));
    }
    return;
  }

  if (!SLACK_WEBHOOK_URL) {
    console.warn(`${LOG_PREFIX} SLACK_WEBHOOK_URL is missing; skip send`);
    return;
  }

  const hitCount = results.filter((result) => result.status === "hit").length;
  const missCount = results.filter((result) => result.status === "miss").length;
  const payload = {
    text: `競輪予想結果通知 的中${hitCount}件 / 不的中${missCount}件`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `競輪予想結果通知 的中${hitCount}件 / 不的中${missCount}件`,
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: results.map(buildSlackMessage).join("\n\n---\n\n"),
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `<${SITE_URL}|KURARI DATA LAVO モバイルページを開く>`,
        },
      },
    ],
  };

  const response = await fetch(SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Slack webhook failed: ${response.status} ${text}`);
  }

  console.log(`${LOG_PREFIX} Sent ${results.length} result(s) to Slack.`);
}

function runPayoutParserSelfTest() {
  const cases = [
    ["5,920円（22人気）", 5920],
    ["5,920円 (22)", 5920],
    ["18,000円 / 4人気", 18000],
    ["1,110円（3人気）", 1110],
    ["1,730円（2人気）", 1730],
    ["960円（4人気）", 960],
    ["2,120円 (6)", 2120],
  ];

  let failed = 0;
  for (const [input, expected] of cases) {
    const actual = parsePayoutAmountYen(input);
    const ok = actual === expected;
    if (!ok) failed += 1;
    console.log(`${LOG_PREFIX} payout parser ${ok ? "ok" : "ng"}: ${input} => ${actual}`);
  }

  if (failed > 0) {
    throw new Error(`payout parser self-test failed: ${failed}`);
  }
}

async function main() {
  if (SELF_TEST_PAYOUT_PARSER) {
    runPayoutParserSelfTest();
    return;
  }

  const predictionsPayload = await loadJson(PREDICTIONS_FILE, {});
  const todayFeed = await loadJson(TODAY_RACES_FILE, null);
  const todayDate = todayFeed?.date ?? "";
  const retainedNotifiedSlackResultKeys = keepTodayDedupeKeys(
    predictionsPayload?.notifiedSlackResultKeys,
    todayDate,
  );
  const retainedNotifiedSlackHitKeys = keepTodayDedupeKeys(
    predictionsPayload?.notifiedSlackHitKeys,
    todayDate,
  );

  const slots = findSlotRecords(predictionsPayload);
  const raceIndex = buildRaceIndex(todayFeed);
  const notifiedKeys = new Set([
    ...retainedNotifiedSlackResultKeys,
    ...retainedNotifiedSlackHitKeys,
  ]);
  const stats = {
    predictionRecordCount: slots.length,
    todayVenueCount: todayFeed?.venues?.length ?? 0,
    raceIndexCount: raceIndex.size,
    hasNotifiedKeys: notifiedKeys.size > 0,
    skippedOldPredictions: 0,
    unmatchedTodayPredictions: 0,
    matchedPredictions: 0,
    pendingResults: 0,
    alreadyNotified: 0,
    notifiedHit: 0,
    notifiedMiss: 0,
    noTicketPredictions: 0,
    slackWebhookConfigured: Boolean(SLACK_WEBHOOK_URL),
    dryRun: DRY_RUN,
  };

  const results = [];

  for (const slot of slots) {
    if (todayDate && slot?.date !== todayDate) {
      stats.skippedOldPredictions += 1;
      continue;
    }

    const tickets = resolveTickets(slot);
    if (tickets.length === 0) {
      stats.noTicketPredictions += 1;
      continue;
    }

    const raceInfo = makeSlotLookupKeys(slot).map((key) => raceIndex.get(key)).find(Boolean);

    if (!raceInfo) {
      stats.unmatchedTodayPredictions += 1;
      continue;
    }

    stats.matchedPredictions += 1;

    if (!isRaceResultConfirmed(raceInfo.race)) {
      stats.pendingResults += 1;
      continue;
    }

    const result = resolveSettledResult(slot, raceInfo);
    if (!result) {
      stats.pendingResults += 1;
      continue;
    }

    const dedupeKey = buildDedupeKey(result);
    if (notifiedKeys.has(dedupeKey)) {
      stats.alreadyNotified += 1;
      continue;
    }

    if (result.status === "hit") stats.notifiedHit += 1;
    if (result.status === "miss") stats.notifiedMiss += 1;
    results.push({ ...result, dedupeKey });
  }

  console.log(`${LOG_PREFIX} loaded`, {
    predictionRecordCount: stats.predictionRecordCount,
    todayDate,
    todayVenueCount: stats.todayVenueCount,
    raceIndexCount: stats.raceIndexCount,
    hasNotifiedKeys: stats.hasNotifiedKeys,
    slackWebhookConfigured: stats.slackWebhookConfigured,
    dryRun: stats.dryRun,
  });
  console.log(`${LOG_PREFIX} skipped old predictions: ${stats.skippedOldPredictions}`);
  console.log(`${LOG_PREFIX} matched predictions: ${stats.matchedPredictions}`);
  console.log(`${LOG_PREFIX} unmatched today predictions: ${stats.unmatchedTodayPredictions}`);
  console.log(`${LOG_PREFIX} no-ticket predictions: ${stats.noTicketPredictions}`);
  console.log(`${LOG_PREFIX} pending results: ${stats.pendingResults}`);
  console.log(`${LOG_PREFIX} already notified: ${stats.alreadyNotified}`);
  console.log(`${LOG_PREFIX} notified hit: ${stats.notifiedHit}`);
  console.log(`${LOG_PREFIX} notified miss: ${stats.notifiedMiss}`);

  const shouldPruneStoredKeys =
    retainedNotifiedSlackResultKeys.length !== (
      Array.isArray(predictionsPayload?.notifiedSlackResultKeys)
        ? predictionsPayload.notifiedSlackResultKeys.length
        : 0
    )
    || retainedNotifiedSlackHitKeys.length !== (
      Array.isArray(predictionsPayload?.notifiedSlackHitKeys)
        ? predictionsPayload.notifiedSlackHitKeys.length
        : 0
    );

  if (results.length === 0) {
    if (shouldPruneStoredKeys && !DRY_RUN) {
      await writePayloadWithNotifiedKeys(
        predictionsPayload,
        retainedNotifiedSlackResultKeys,
        retainedNotifiedSlackHitKeys,
      );
      console.log(`${LOG_PREFIX} Pruned notified result keys to today-only.`);
    }
    console.log(`${LOG_PREFIX} No new settled prediction results.`);
    return;
  }

  await postToSlack(results);

  if (DRY_RUN || !SLACK_WEBHOOK_URL) {
    if (shouldPruneStoredKeys && !DRY_RUN) {
      await writePayloadWithNotifiedKeys(
        predictionsPayload,
        retainedNotifiedSlackResultKeys,
        retainedNotifiedSlackHitKeys,
      );
      console.log(`${LOG_PREFIX} Pruned notified result keys to today-only.`);
    }
    return;
  }

  const nextPayload = {
    ...predictionsPayload,
    notifiedSlackResultKeys: keepTodayDedupeKeys(
      [
        ...retainedNotifiedSlackResultKeys,
        ...results.map((result) => result.dedupeKey),
      ],
      todayDate,
    ).slice(-1000),
    slackResultNotifiedAt: new Date().toISOString(),
  };

  await fs.writeFile(PREDICTIONS_FILE, `${JSON.stringify(nextPayload, null, 2)}\n`, "utf-8");

  console.log(`${LOG_PREFIX} Updated notified result keys: ${results.length}`);
}

main().catch((error) => {
  console.error(`${LOG_PREFIX} failed`, error);
  process.exit(1);
});
