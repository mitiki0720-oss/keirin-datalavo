import fs from "node:fs/promises";
import path from "node:path";

const ROOT_DIR = process.cwd();

const PREDICTIONS_FILE = path.join(
  ROOT_DIR,
  "public",
  "data",
  "predictions",
  "saved-predictions.generated.json"
);

const TODAY_RACES_FILE = path.join(
  ROOT_DIR,
  "public",
  "data",
  "races",
  "today.generated.json"
);

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const SITE_URL = "https://mitiki0720-oss.github.io/keirin-datalavo/#mobile-dashboard";

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[＞>→]/g, "-")
    .replace(/[－ー―‐]/g, "-")
    .replace(/\s+/g, "")
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

function getResultOrder(race) {
  const finishOrder = race?.result?.finishOrder?.filter(Boolean) ?? [];
  if (finishOrder.length >= 3) return finishOrder.join("-");

  const topRows = race?.resultTop3?.map((item) => item.carNo).filter(Boolean) ?? [];
  if (topRows.length >= 3) return topRows.join("-");

  return "";
}

function parsePayoutAmount(value) {
  const normalized = String(value ?? "").replace(/[^\d]/g, "");
  if (!normalized) return undefined;

  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : undefined;
}

function formatYen(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (value === 0) return "0円";
  return `${value > 0 ? "+" : "-"}${Math.abs(value).toLocaleString("ja-JP")}円`;
}

function formatPlainYen(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("ja-JP")}円`;
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

function buildRaceIndex(todayFeed) {
  const raceMap = new Map();

  for (const venue of todayFeed?.venues ?? []) {
    for (const race of venue.races ?? []) {
      const raceId = venue.raceIds?.[race.raceNo - 1] ?? "";
      const date = todayFeed.date ?? venue.startDate ?? "";
      const venueName = venue.venue;
      const normalizedVenue = normalizeVenueName(venueName);

      const keys = [
        raceId ? `prediction-slot:${raceId}` : "",
        date && normalizedVenue ? `prediction-slot:${date}:${normalizedVenue}:${race.raceNo}` : "",
        date && venueName ? `prediction-slot:${date}:${venueName}:${race.raceNo}` : "",
      ].filter(Boolean);

      keys.forEach((key) => {
        raceMap.set(key, { venue, race, date, raceId });
      });
    }
  }

  return raceMap;
}

function resolveHit(slot, raceInfo) {
  const tickets = slot?.predictionJson?.tickets ?? [];
  if (!Array.isArray(tickets) || tickets.length === 0) return null;

  const resultOrder = getResultOrder(raceInfo.race);
  if (!resultOrder) return null;

  const resultTop3 = normalizeText(resultOrder).split("-").slice(0, 3).join("-");
  const resultTop2 = normalizeText(resultOrder).split("-").slice(0, 2).join("-");

  const hitTicket = tickets.find((ticket) => {
    const ticketCombination = normalizeText(ticket.combination);
    const kind = getBetTypeKind(ticket.betType);

    if (kind === "3tan") return ticketCombination === resultTop3;
    if (kind === "2tan") return ticketCombination === resultTop2;

    return false;
  });

  if (!hitTicket) return null;

  const hitKind = getBetTypeKind(hitTicket.betType);

  const payout =
    hitKind === "2tan"
      ? parsePayoutAmount(raceInfo.race?.result?.payout2tan?.payout)
      : parsePayoutAmount(raceInfo.race?.result?.payout3tan?.payout);

  const ticketCount = tickets.length;
  const investment = ticketCount > 0 ? ticketCount * 100 : undefined;

  const profitLoss =
    typeof investment === "number" && typeof payout === "number"
      ? payout - investment
      : undefined;

  return {
    venue: raceInfo.venue.venue,
    raceNo: raceInfo.race.raceNo,
    date: raceInfo.date,
    raceId: raceInfo.raceId,
    resultOrder: resultTop3,
    betType: hitKind === "2tan" ? "2車単" : "3連単",
    combination: hitTicket.combination,
    payout,
    investment,
    profitLoss,
  };
}

function buildDedupeKey(hit) {
  return [
    hit.date,
    hit.venue,
    `${hit.raceNo}R`,
    hit.betType,
    normalizeText(hit.combination),
    hit.payout ?? "",
  ].join(":");
}

async function loadJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function postToSlack(hits) {
  if (!SLACK_WEBHOOK_URL) {
    throw new Error("SLACK_WEBHOOK_URL is not set.");
  }

  if (hits.length === 0) {
    console.log("[notify-slack-hits] No new hits.");
    return;
  }

  const hitLines = hits.map((hit) => {
    return [
      `*${hit.venue} ${hit.raceNo}R*`,
      `券種: ${hit.betType}`,
      `買い目: ${hit.combination}`,
      `結果: ${hit.resultOrder}`,
      `払戻: ${formatPlainYen(hit.payout)}`,
      `投資: ${formatPlainYen(hit.investment)}`,
      `収支: ${formatYen(hit.profitLoss)}`,
    ].join("\n");
  });

  const payload = {
    text: `🎯 的中通知 ${hits.length}件`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `🎯 的中通知 ${hits.length}件`,
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: hitLines.join("\n\n---\n\n"),
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

  console.log(`[notify-slack-hits] Sent ${hits.length} hit(s) to Slack.`);
}

async function main() {
  const predictionsPayload = await loadJson(PREDICTIONS_FILE, {});
  const todayFeed = await loadJson(TODAY_RACES_FILE, null);

  const slots = findSlotRecords(predictionsPayload);
  const raceIndex = buildRaceIndex(todayFeed);
  console.log("[notify-slack-hits] loaded", {
  predictionRecordCount: slots.length,
  todayVenueCount: todayFeed?.venues?.length ?? 0,
  raceIndexCount: raceIndex.size,
  hasNotifiedKeys: Array.isArray(predictionsPayload?.notifiedSlackHitKeys),
});

  const notifiedKeys = new Set(
    Array.isArray(predictionsPayload?.notifiedSlackHitKeys)
      ? predictionsPayload.notifiedSlackHitKeys
      : []
  );

  const hits = [];

  for (const slot of slots) {
  const raceInfo = raceIndex.get(slot.raceKey);

  if (!raceInfo) {
    console.log("[notify-slack-hits] race key not matched", {
      raceKey: slot.raceKey,
      venue: slot.venue,
      date: slot.date,
      raceNumber: slot.raceNumber,
    });
    continue;
  }

  const hit = resolveHit(slot, raceInfo);

  if (!hit) {
    console.log("[notify-slack-hits] no hit", {
      raceKey: slot.raceKey,
      venue: slot.venue,
      raceNumber: slot.raceNumber,
      resultOrder: getResultOrder(raceInfo.race),
      ticketCount: Array.isArray(slot?.predictionJson?.tickets)
        ? slot.predictionJson.tickets.length
        : 0,
    });
    continue;
  }

  const dedupeKey = buildDedupeKey(hit);

  if (notifiedKeys.has(dedupeKey)) {
    console.log("[notify-slack-hits] already notified", {
      dedupeKey,
      venue: hit.venue,
      raceNo: hit.raceNo,
    });
    continue;
  }

  console.log("[notify-slack-hits] hit detected", {
    venue: hit.venue,
    raceNo: hit.raceNo,
    betType: hit.betType,
    combination: hit.combination,
    payout: hit.payout,
  });

  hits.push({ ...hit, dedupeKey });
}

  if (hits.length === 0) {
    console.log("[notify-slack-hits] No new hits.");
    return;
  }

  await postToSlack(hits);

  const nextPayload = {
    ...predictionsPayload,
    notifiedSlackHitKeys: Array.from(
      new Set([
        ...(Array.isArray(predictionsPayload?.notifiedSlackHitKeys)
          ? predictionsPayload.notifiedSlackHitKeys
          : []),
        ...hits.map((hit) => hit.dedupeKey),
      ])
    ).slice(-500),
    slackNotifiedAt: new Date().toISOString(),
  };

  await fs.writeFile(PREDICTIONS_FILE, `${JSON.stringify(nextPayload, null, 2)}\n`, "utf-8");

  console.log(`[notify-slack-hits] Updated notified keys: ${hits.length}`);
}

main().catch((error) => {
  console.error("[notify-slack-hits] failed", error);
  process.exit(1);
});