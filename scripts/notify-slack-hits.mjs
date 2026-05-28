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

  if (text.includes("3連単")) return "3tan";
  if (text.includes("2車単") || text.includes("2連単")) return "2tan";

  return "other";
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

function parsePayoutAmount(value) {
  const normalized = String(value ?? "").replace(/[^\d]/g, "");
  if (!normalized) return undefined;

  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : undefined;
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
  const payout =
    hitKind === "2tan"
      ? parsePayoutAmount(raceInfo.race?.result?.payout2tan?.payout)
      : hitKind === "3tan"
        ? parsePayoutAmount(raceInfo.race?.result?.payout3tan?.payout)
        : 0;
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
    betType: hitTicket ? (hitKind === "2tan" ? "2車単" : "3連単") : "",
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

async function loadJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch {
    return fallback;
  }
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

async function main() {
  const predictionsPayload = await loadJson(PREDICTIONS_FILE, {});
  const todayFeed = await loadJson(TODAY_RACES_FILE, null);
  const todayDate = todayFeed?.date ?? "";

  const slots = findSlotRecords(predictionsPayload);
  const raceIndex = buildRaceIndex(todayFeed);
  const notifiedKeys = new Set([
    ...(Array.isArray(predictionsPayload?.notifiedSlackResultKeys)
      ? predictionsPayload.notifiedSlackResultKeys
      : []),
    ...(Array.isArray(predictionsPayload?.notifiedSlackHitKeys)
      ? predictionsPayload.notifiedSlackHitKeys
      : []),
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

  if (results.length === 0) {
    console.log(`${LOG_PREFIX} No new settled prediction results.`);
    return;
  }

  await postToSlack(results);

  if (DRY_RUN || !SLACK_WEBHOOK_URL) return;

  const nextPayload = {
    ...predictionsPayload,
    notifiedSlackResultKeys: Array.from(
      new Set([
        ...(Array.isArray(predictionsPayload?.notifiedSlackResultKeys)
          ? predictionsPayload.notifiedSlackResultKeys
          : []),
        ...results.map((result) => result.dedupeKey),
      ]),
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
