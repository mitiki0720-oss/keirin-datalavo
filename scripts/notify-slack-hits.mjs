import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

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
const MAX_BLOCKS_PER_MESSAGE = 45;
const SLACK_RESERVED_BLOCKS_PER_MESSAGE = 3;
const MAX_HITS_PER_CHUNK = Math.min(40, MAX_BLOCKS_PER_MESSAGE - SLACK_RESERVED_BLOCKS_PER_MESSAGE);
const MAX_SECTION_TEXT_LENGTH = 2800;
const MAX_FALLBACK_TEXT_LENGTH = 35000;
const DEFAULT_RETRY_AFTER_SECONDS = 60;
const MAX_429_RETRY_COUNT = 1;

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

function normalizeVenueCode(value) {
  const code = String(value ?? "").normalize("NFKC").trim();
  return /^\d{2}$/.test(code) ? code : "";
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

function truncateText(value, maxLength = MAX_SECTION_TEXT_LENGTH) {
  const text = String(value ?? "");
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

function chunkArray(values, chunkSize) {
  const chunks = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }
  return chunks;
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

function makeVenueCode(venue) {
  return normalizeVenueCode(venue?.venueCode ?? venue?.venue_code ?? venue?.code);
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
      const venueCode = makeVenueCode(venue);
      const raceInfo = { venue, race, date, raceId, venueName, venueCode, raceNo };

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
    venueCode: raceInfo.venueCode,
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

function buildResultDedupeKey(result) {
  return buildDedupeKey(result);
}

function buildHitDedupeKey(result) {
  return [
    result.date,
    normalizeVenueName(result.venue),
    result.raceNo,
    normalizeRaceId(result.raceId),
    "hit",
    normalizeBetTypeLabel(result.betType),
    normalizePredictionCombination(result.combination),
    normalizeText(result.resultOrder),
    "v3",
  ].join(":");
}

function buildRaceNotificationKey(result) {
  const date = String(result?.date ?? "").trim();
  const raceNo = Number(result?.raceNo);
  const venueIdentity = normalizeVenueCode(result?.venueCode) || normalizeVenueName(result?.venue);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !venueIdentity || !Number.isInteger(raceNo) || raceNo < 1) {
    return "";
  }
  return `${date}:${venueIdentity}:${raceNo}:slack-hit-race:v1`;
}

function prepareNotificationResult(result) {
  const resultKey = buildResultDedupeKey(result);
  const hitKey = result.status === "hit" ? buildHitDedupeKey(result) : "";
  return {
    ...result,
    dedupeKey: resultKey,
    resultKey,
    hitKey,
    legacyKey: buildDedupeKey(result),
    raceNotificationKey: result.status === "hit" ? buildRaceNotificationKey(result) : "",
  };
}

function classifyHitNotification(result, notifiedKeys) {
  const legacyRacePrefix = [
    result.date,
    normalizeVenueName(result.venue),
    result.raceNo,
  ].join(":") + ":";
  const legacyHitForSameRace = Array.from(notifiedKeys.hit).some(
    (key) => String(key).startsWith(legacyRacePrefix),
  );
  const alreadyRaceNotified = Boolean(
    result.raceNotificationKey
    && notifiedKeys.race.has(result.raceNotificationKey)
  );
  const alreadyLegacyNotified = (
    notifiedKeys.hit.has(result.hitKey)
    || notifiedKeys.hit.has(result.legacyKey)
    || notifiedKeys.result.has(result.legacyKey)
    || legacyHitForSameRace
  );
  return {
    alreadyNotified: alreadyRaceNotified || alreadyLegacyNotified,
    alreadyRaceNotified,
    alreadyLegacyNotified,
    migrateRaceNotificationKey: !alreadyRaceNotified && alreadyLegacyNotified
      ? result.raceNotificationKey
      : "",
  };
}

function keepTodayDedupeKeys(keys, todayDate) {
  if (!todayDate) return [];
  return Array.from(new Set(
    (Array.isArray(keys) ? keys : [])
      .map((key) => String(key ?? "").trim())
      .filter((key) => key.startsWith(`${todayDate}:`)),
  ));
}

function buildNextNotificationState({
  todayDate,
  retainedResultKeys,
  retainedHitKeys,
  retainedRaceKeys,
  missResults,
  hitResults,
  successfulHitKeys,
  migratedRaceKeys,
}) {
  const successfulHitKeySet = new Set(successfulHitKeys);
  const successfulHitResults = hitResults.filter((result) => successfulHitKeySet.has(result.hitKey));
  const processedResultKeys = [
    ...missResults.map((result) => result.resultKey),
    ...successfulHitResults.map((result) => result.resultKey),
  ];
  const successfulRaceKeys = successfulHitResults
    .map((result) => result.raceNotificationKey)
    .filter(Boolean);

  return {
    resultKeys: keepTodayDedupeKeys([...retainedResultKeys, ...processedResultKeys], todayDate),
    hitKeys: keepTodayDedupeKeys([...retainedHitKeys, ...successfulHitKeys], todayDate),
    raceKeys: keepTodayDedupeKeys(
      [...retainedRaceKeys, ...migratedRaceKeys, ...successfulRaceKeys],
      todayDate,
    ),
    processedResultKeys,
    successfulRaceKeys,
  };
}

async function loadJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch {
    return fallback;
  }
}

async function writePayloadWithNotifiedKeys(predictionsPayload, resultKeys, hitKeys, raceKeys) {
  await fs.writeFile(
    PREDICTIONS_FILE,
    `${JSON.stringify({
      ...predictionsPayload,
      notifiedSlackResultKeys: resultKeys,
      notifiedSlackHitKeys: hitKeys,
      notifiedSlackRaceKeys: raceKeys,
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

async function postToSlackLegacy(results) {
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

function buildSlackBlockPayload(hitResults, meta) {
  const title = `KURARI keirin hits ${meta.chunkIndex}/${meta.chunkCount}`;
  const summary = `hit ${meta.hitCount} / chunk ${hitResults.length}`;
  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: truncateText(title, 150),
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: truncateText(`*Today's hit results*\n${summary}`),
      },
    },
    ...hitResults.map((result) => ({
      type: "section",
      text: {
        type: "mrkdwn",
        text: truncateText(buildSlackHitMessage(result)),
      },
    })),
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `<${SITE_URL}|Open KURARI DATA LAVO mobile dashboard>`,
      },
    },
  ];

  if (blocks.length > MAX_BLOCKS_PER_MESSAGE) {
    throw new Error(`Slack payload block count exceeds limit: ${blocks.length}`);
  }

  return {
    text: truncateText(`${title}: ${summary}`, MAX_FALLBACK_TEXT_LENGTH),
    blocks,
  };
}

function buildSlackPlainTextPayload(hitResults, meta) {
  return {
    text: truncateText([
      `KURARI keirin hits ${meta.chunkIndex}/${meta.chunkCount}`,
      `hit ${meta.hitCount} / chunk ${hitResults.length}`,
      ...hitResults.map(buildSlackHitMessage),
      SITE_URL,
    ].join("\n\n---\n\n"), MAX_FALLBACK_TEXT_LENGTH),
  };
}

function buildSlackHitMessage(result) {
  return [
    `*HIT* ${result.venue} ${result.raceNo}R`,
    `result: ${result.resultOrder}`,
    `ticket: ${result.betType} ${result.combination}`,
    `payout: ${formatPlainYen(result.payout)}`,
    `investment: ${formatPlainYen(result.investment)}`,
    `profit: ${formatYen(result.profitLoss)}`,
    `roi: ${formatRate(result.roi)}`,
  ].join("\n");
}

function parseRetryAfterSeconds(headers) {
  const raw = headers?.get?.("retry-after") ?? headers?.get?.("Retry-After") ?? "";
  const seconds = Number.parseInt(String(raw).trim(), 10);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_RETRY_AFTER_SECONDS;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isPayloadFallbackEligible(status, body) {
  if (status === 429) return false;
  if (typeof status !== "number") return false;
  if (status < 400 || status >= 500) return false;
  const text = String(body ?? "");
  if (!text) return true;
  return /invalid_blocks|invalid_payload|invalid_json|bad_payload|bad_request/iu.test(text);
}

async function sendSlackPayload(payload, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const webhookUrl = options.webhookUrl ?? SLACK_WEBHOOK_URL;
  const response = await fetchImpl(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(payload),
  });
  const responseBody = response.ok ? "" : await response.text();
  return {
    ok: response.ok,
    status: response.status,
    body: responseBody,
    retryAfterSeconds: response.status === 429 ? parseRetryAfterSeconds(response.headers) : null,
  };
}

function logSlackFailure({ payloadType, chunkIndex, itemCount, blockCount, textLength, status, body }) {
  console.warn(`${LOG_PREFIX} Slack webhook warning`, {
    payloadType,
    chunkIndex,
    itemCount,
    blockCount,
    textLength,
    status,
    body,
  });
}

async function sendSlackPayloadWithFallback(payload, hitResults, meta, options = {}) {
  const blockCount = Array.isArray(payload.blocks) ? payload.blocks.length : 0;
  const sleepImpl = options.sleepImpl ?? sleep;
  let first;
  try {
    first = await sendSlackPayload(payload, options);
  } catch (error) {
    first = {
      ok: false,
      status: "network-error",
      body: error instanceof Error ? error.message : String(error),
    };
  }
  if (first.ok) return true;

  logSlackFailure({
    payloadType: "blocks",
    chunkIndex: meta.chunkIndex,
    itemCount: hitResults.length,
    blockCount,
    textLength: payload.text.length,
    status: first.status,
    body: first.body,
  });

  if (first.status === 429) {
    const retryAfterSeconds = first.retryAfterSeconds ?? DEFAULT_RETRY_AFTER_SECONDS;
    console.warn(`${LOG_PREFIX} Slack 429 ${first.body || "rate_limited"}`, {
      chunkIndex: meta.chunkIndex,
      itemCount: hitResults.length,
      retryAfterSeconds,
      retryCount: MAX_429_RETRY_COUNT,
    });
    await sleepImpl(retryAfterSeconds * 1000);
    let retry;
    try {
      retry = await sendSlackPayload(payload, options);
    } catch (error) {
      retry = {
        ok: false,
        status: "network-error",
        body: error instanceof Error ? error.message : String(error),
      };
    }
    if (retry.ok) {
      console.warn(`${LOG_PREFIX} Slack 429 retry succeeded`, {
        chunkIndex: meta.chunkIndex,
        itemCount: hitResults.length,
        retryAfterSeconds,
      });
      return true;
    }
    logSlackFailure({
      payloadType: "blocks_429_retry",
      chunkIndex: meta.chunkIndex,
      itemCount: hitResults.length,
      blockCount,
      textLength: payload.text.length,
      status: retry.status,
      body: retry.body,
    });
    return false;
  }

  if (!isPayloadFallbackEligible(first.status, first.body)) return false;

  const fallbackPayload = buildSlackPlainTextPayload(hitResults, meta);
  let fallback;
  try {
    fallback = await sendSlackPayload(fallbackPayload, options);
  } catch (error) {
    fallback = {
      ok: false,
      status: "network-error",
      body: error instanceof Error ? error.message : String(error),
    };
  }
  if (fallback.ok) {
    console.warn(`${LOG_PREFIX} Slack plain text fallback succeeded`, {
      chunkIndex: meta.chunkIndex,
      itemCount: hitResults.length,
      textLength: fallbackPayload.text.length,
    });
    return true;
  }

  logSlackFailure({
    payloadType: "plain_text_fallback",
    chunkIndex: meta.chunkIndex,
    itemCount: hitResults.length,
    blockCount: 0,
    textLength: fallbackPayload.text.length,
    status: fallback.status,
    body: fallback.body,
  });
  return false;
}

async function postToSlack(results, options = {}) {
  const emptyResult = { successfulHitKeys: [], failedHitKeys: [], failureCount: 0 };
  const hitResults = results.filter((result) => result.status === "hit");
  const chunks = chunkArray(hitResults, MAX_HITS_PER_CHUNK);
  const dryRun = options.dryRun ?? DRY_RUN;
  const webhookUrl = options.webhookUrl ?? SLACK_WEBHOOK_URL;

  if (dryRun) {
    console.log(`${LOG_PREFIX} dry-run slack chunks`, {
      chunkCount: chunks.length,
      hitCount: hitResults.length,
      maxHitsPerChunk: MAX_HITS_PER_CHUNK,
      maxBlocksPerMessage: MAX_BLOCKS_PER_MESSAGE,
    });
    chunks.forEach((chunk, index) => {
      const payload = buildSlackBlockPayload(chunk, {
        chunkIndex: index + 1,
        chunkCount: chunks.length,
        hitCount: hitResults.length,
      });
      console.log(`${LOG_PREFIX} dry-run slack chunk`, {
        chunkIndex: index + 1,
        itemCount: chunk.length,
        blockCount: payload.blocks.length,
        textLength: payload.text.length,
      });
    });
    return emptyResult;
  }

  if (hitResults.length === 0) {
    console.log(`${LOG_PREFIX} No new hit prediction results to send to Slack.`);
    return emptyResult;
  }

  if (!webhookUrl) {
    console.warn(`${LOG_PREFIX} SLACK_WEBHOOK_URL is missing; skip hit send`);
    return {
      successfulHitKeys: [],
      failedHitKeys: hitResults.map((result) => result.hitKey),
      failureCount: chunks.length,
    };
  }

  const successfulHitKeys = [];
  const failedHitKeys = [];
  let failureCount = 0;

  for (const [index, chunk] of chunks.entries()) {
    const meta = {
      chunkIndex: index + 1,
      chunkCount: chunks.length,
      hitCount: hitResults.length,
    };
    const payload = buildSlackBlockPayload(chunk, meta);
    const sent = await sendSlackPayloadWithFallback(payload, chunk, meta, {
      ...options,
      webhookUrl,
    });
    if (sent) {
      successfulHitKeys.push(...chunk.map((result) => result.hitKey));
    } else {
      failureCount += 1;
      failedHitKeys.push(...chunk.map((result) => result.hitKey));
    }
  }

  console.log(`${LOG_PREFIX} Slack hit notify result`, {
    chunkCount: chunks.length,
    successfulHitCount: successfulHitKeys.length,
    failedHitCount: failedHitKeys.length,
    failureCount,
  });
  return { successfulHitKeys, failedHitKeys, failureCount };
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
  const retainedNotifiedSlackRaceKeys = keepTodayDedupeKeys(
    predictionsPayload?.notifiedSlackRaceKeys,
    todayDate,
  );

  const slots = findSlotRecords(predictionsPayload);
  const raceIndex = buildRaceIndex(todayFeed);
  const notifiedResultKeys = new Set(retainedNotifiedSlackResultKeys);
  const notifiedHitKeys = new Set(retainedNotifiedSlackHitKeys);
  const notifiedRaceKeys = new Set(retainedNotifiedSlackRaceKeys);
  const stats = {
    predictionRecordCount: slots.length,
    todayVenueCount: todayFeed?.venues?.length ?? 0,
    raceIndexCount: raceIndex.size,
    hasNotifiedKeys: notifiedResultKeys.size > 0 || notifiedHitKeys.size > 0 || notifiedRaceKeys.size > 0,
    skippedOldPredictions: 0,
    unmatchedTodayPredictions: 0,
    matchedPredictions: 0,
    pendingResults: 0,
    missingStableRaceIdentity: 0,
    alreadyNotified: 0,
    skippedAlreadyNotifiedHits: 0,
    skippedDuplicateRaceHits: 0,
    skippedAlreadyProcessedResults: 0,
    notifiedHit: 0,
    notifiedMiss: 0,
    noTicketPredictions: 0,
    slackWebhookConfigured: Boolean(SLACK_WEBHOOK_URL),
    dryRun: DRY_RUN,
  };

  const results = [];
  const migratedRaceKeys = [];
  const plannedRaceNotificationKeys = new Set();

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

    const preparedResult = prepareNotificationResult(result);
    if (result.status === "hit" && !preparedResult.raceNotificationKey) {
      stats.missingStableRaceIdentity += 1;
      console.warn(`${LOG_PREFIX} skip hit without stable race identity`, {
        date: result.date,
        venue: result.venue,
        venueCode: result.venueCode,
        raceNo: result.raceNo,
      });
      continue;
    }
    const hitNotificationState = result.status === "hit"
      ? classifyHitNotification(preparedResult, {
        result: notifiedResultKeys,
        hit: notifiedHitKeys,
        race: notifiedRaceKeys,
      })
      : null;
    const alreadyHitNotified = hitNotificationState?.alreadyNotified ?? false;
    const alreadyResultProcessed = result.status !== "hit"
      && notifiedResultKeys.has(preparedResult.resultKey);

    if (alreadyHitNotified || alreadyResultProcessed) {
      stats.alreadyNotified += 1;
      if (alreadyHitNotified) {
        stats.skippedAlreadyNotifiedHits += 1;
        if (hitNotificationState.migrateRaceNotificationKey) {
          migratedRaceKeys.push(hitNotificationState.migrateRaceNotificationKey);
        }
      }
      if (alreadyResultProcessed) stats.skippedAlreadyProcessedResults += 1;
      continue;
    }

    if (result.status === "hit" && plannedRaceNotificationKeys.has(preparedResult.raceNotificationKey)) {
      stats.skippedDuplicateRaceHits += 1;
      continue;
    }

    if (result.status === "hit") {
      plannedRaceNotificationKeys.add(preparedResult.raceNotificationKey);
      stats.notifiedHit += 1;
    }
    if (result.status === "miss") stats.notifiedMiss += 1;
    results.push(preparedResult);
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
  console.log(`${LOG_PREFIX} missing stable race identity: ${stats.missingStableRaceIdentity}`);
  console.log(`${LOG_PREFIX} already notified: ${stats.alreadyNotified}`);
  console.log(`${LOG_PREFIX} skipped already-notified hits: ${stats.skippedAlreadyNotifiedHits}`);
  console.log(`${LOG_PREFIX} skipped duplicate same-run hits: ${stats.skippedDuplicateRaceHits}`);
  console.log(`${LOG_PREFIX} skipped already-processed results: ${stats.skippedAlreadyProcessedResults}`);
  console.log(`${LOG_PREFIX} notified hit: ${stats.notifiedHit}`);
  console.log(`${LOG_PREFIX} notified miss: ${stats.notifiedMiss}`);

  const hitResults = results.filter((result) => result.status === "hit");
  const missResults = results.filter((result) => result.status === "miss");
  console.log(`${LOG_PREFIX} slack send target hit only`, {
    hitNotificationTargetCount: hitResults.length,
    newHitNotificationCount: hitResults.length,
    skippedAlreadyNotifiedHits: stats.skippedAlreadyNotifiedHits,
    missCount: missResults.length,
    missProcessedOnlyCount: missResults.length,
  });

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
    )
    || retainedNotifiedSlackRaceKeys.length !== (
      Array.isArray(predictionsPayload?.notifiedSlackRaceKeys)
        ? predictionsPayload.notifiedSlackRaceKeys.length
        : 0
    );

  const slackResult = await postToSlack(hitResults);
  const nextState = buildNextNotificationState({
    todayDate,
    retainedResultKeys: retainedNotifiedSlackResultKeys,
    retainedHitKeys: retainedNotifiedSlackHitKeys,
    retainedRaceKeys: retainedNotifiedSlackRaceKeys,
    missResults,
    hitResults,
    successfulHitKeys: slackResult.successfulHitKeys,
    migratedRaceKeys,
  });

  console.log(`${LOG_PREFIX} processed key plan`, {
    processedResultKeyCount: nextState.processedResultKeys.length,
    successfulHitKeyCount: slackResult.successfulHitKeys.length,
    successfulRaceKeyCount: nextState.successfulRaceKeys.length,
    migratedRaceKeyCount: migratedRaceKeys.length,
    failedHitKeyCount: slackResult.failedHitKeys.length,
    dryRun: DRY_RUN,
  });

  if (DRY_RUN) {
    console.log(`${LOG_PREFIX} dry-run: skip notified key write`);
    return;
  }

  if (
    shouldPruneStoredKeys
    || nextState.processedResultKeys.length > 0
    || slackResult.successfulHitKeys.length > 0
    || migratedRaceKeys.length > 0
  ) {
    await writePayloadWithNotifiedKeys(
      predictionsPayload,
      nextState.resultKeys,
      nextState.hitKeys,
      nextState.raceKeys,
    );
    console.log(`${LOG_PREFIX} Updated notified keys`, {
      resultKeyCount: nextState.resultKeys.length,
      hitKeyCount: nextState.hitKeys.length,
      raceKeyCount: nextState.raceKeys.length,
      processedResultKeyCount: nextState.processedResultKeys.length,
      failedHitKeyCount: slackResult.failedHitKeys.length,
    });
  } else {
    console.log(`${LOG_PREFIX} No notified key update needed.`);
  }
}

export const slackDeliveryTestApi = {
  MAX_BLOCKS_PER_MESSAGE,
  MAX_HITS_PER_CHUNK,
  MAX_SECTION_TEXT_LENGTH,
  MAX_FALLBACK_TEXT_LENGTH,
  DEFAULT_RETRY_AFTER_SECONDS,
  MAX_429_RETRY_COUNT,
  buildSlackBlockPayload,
  buildSlackPlainTextPayload,
  buildRaceNotificationKey,
  prepareNotificationResult,
  classifyHitNotification,
  buildNextNotificationState,
  keepTodayDedupeKeys,
  parseRetryAfterSeconds,
  postToSlack,
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`${LOG_PREFIX} failed`, error);
    process.exit(1);
  });
}
