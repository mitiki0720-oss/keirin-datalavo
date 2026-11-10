import fs from "node:fs/promises";

export function notificationAliases(result) {
  const venue = String(result.venue ?? "").normalize("NFKC").replace(/競輪場|競輪|\s/g, "");
  const code = /^\d{2}$/.test(String(result.venueCode ?? "")) ? String(result.venueCode) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result.date) || !Number.isInteger(result.raceNo) || result.raceNo < 1 || !venue) {
    throw new Error("Invalid Slack notification race identity");
  }
  return [...new Set([code, venue].filter(Boolean).map((identity) => `${result.date}:${identity}:${result.raceNo}:slack-hit-race:v1`))];
}

export function validateLedger(ledger) {
  if (ledger?.version !== 1 || !ledger.records || typeof ledger.records !== "object" || Array.isArray(ledger.records)) {
    throw new Error("Invalid Slack notification ledger; refusing to resend");
  }
  for (const [key, entry] of Object.entries(ledger.records)) {
    if (!/^\d{4}-\d{2}-\d{2}:.+:\d+:slack-hit-race:v1$/.test(key)
      || !["reserved", "sent", "uncertain"].includes(entry?.status)) {
      throw new Error("Invalid Slack notification ledger entry; refusing to resend");
    }
  }
  return ledger;
}

export async function loadLedger(file) {
  return validateLedger(JSON.parse((await fs.readFile(file, "utf8")).replace(/^\uFEFF/, "")));
}

export function reserveNotifications(ledger, results, runId, historicalResults = []) {
  validateLedger(ledger);
  if (!runId) throw new Error("Slack reservation run ID is required");
  const next = structuredClone(ledger);
  for (const result of historicalResults) {
    for (const key of notificationAliases(result)) next.records[key] ??= { status: "sent", migrated: true };
  }
  const planned = [];
  for (const result of results) {
    const aliases = notificationAliases(result);
    if (aliases.some((key) => next.records[key])) continue;
    const entry = { status: "reserved", runId, reservedAt: new Date().toISOString() };
    aliases.forEach((key) => { next.records[key] = entry; });
    planned.push(result);
  }
  return { ledger: next, plan: { version: 1, runId, results: planned } };
}

export function eligibleReservations(ledger, plan, runId) {
  validateLedger(ledger);
  if (plan?.version !== 1 || plan.runId !== runId || !Array.isArray(plan.results)) throw new Error("Invalid Slack delivery plan owner");
  const seen = new Set();
  return plan.results.filter((result) => {
    const aliases = notificationAliases(result);
    if (aliases.some((key) => seen.has(key))) throw new Error("Duplicate race in Slack delivery plan");
    aliases.forEach((key) => seen.add(key));
    return aliases.every((key) => ledger.records[key]?.status === "reserved" && ledger.records[key]?.runId === runId);
  });
}

export function completeReservations(ledger, results, successfulHitKeys) {
  const next = structuredClone(validateLedger(ledger));
  const successful = new Set(successfulHitKeys);
  for (const result of results) {
    for (const key of notificationAliases(result)) {
      if (!next.records[key]) throw new Error("Missing Slack delivery reservation");
      next.records[key] = { ...next.records[key], status: successful.has(result.hitKey) ? "sent" : "uncertain", completedAt: new Date().toISOString() };
    }
  }
  return next;
}
