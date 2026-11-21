import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { SOURCE_URL as OFFICIAL_SCHEDULE_URL, VENUES, buildRange } from "../update-keirin-upcoming-schedule.mjs";

export function jstNow(now = new Date()) {
  const local = new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString();
  return { date: local.slice(0, 10), hour: Number(local.slice(11, 13)), minute: Number(local.slice(14, 16)), iso: local.slice(0, 19) };
}

export function automaticUpdatePhase(now = new Date()) {
  const jst = jstNow(now);
  let phase = "result";
  let session = "all";
  if (jst.hour === 23 && jst.minute >= 40) phase = jst.minute >= 53 ? "backfill" : "final";
  else if (jst.hour >= 19 && jst.hour < 21) { phase = "odds"; session = "midnight"; }
  else if (jst.hour >= 16 && jst.hour < 18) { phase = "lineup"; session = "midnight"; }
  else if (jst.hour >= 13 && jst.hour < 15) { phase = "odds"; session = "night"; }
  else if (jst.hour >= 9 && jst.hour < 11) { phase = "odds"; session = "day"; }
  else if (jst.hour >= 6 && jst.hour < 9) { phase = "lineup"; session = "day"; }
  return { phase, session, jst: jst.iso, explicit: false, catchUp: true };
}

const entryCheckpoints = ["06:17", "08:13", "10:13", "12:17", "14:13", "15:17", "17:13", "18:17", "20:13", "21:17", "23:47"];
const resultCheckpoints = ["09:13", "12:17", "15:17", "18:17", "21:17", "23:47", "23:53"];
function snapshotDue(snapshot, today, checkpoints, now) {
  if (snapshot?.date !== today || snapshot?.source?.provider !== "KEIRIN.JP" || !snapshot.venues?.length) return true;
  const fetched = Date.parse(snapshot.source.fetchCompletedAt ?? snapshot.generatedAt);
  if (!Number.isFinite(fetched) || fetched > now.getTime()) return true;
  const due = checkpoints.map((time) => Date.parse(today + "T" + time + ":00+09:00")).filter((time) => time <= now.getTime()).at(-1);
  return due !== undefined && fetched < due;
}

const SCHEDULE_SCHEMA = "keirin-jp-schedule-candidate-v1";
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
function validIsoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
function timestamp(value) {
  if (typeof value !== "string") return NaN;
  const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/);
  if (!match || !validIsoDate(match[1]) || Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59) return NaN;
  return Date.parse(value);
}

// This is an in-memory freshness check, not a publisher or a re-verification of raw bytes.
export function inspectUpcomingScheduleFreshness(upcoming, now = new Date()) {
  const provider = upcoming?.provider === "KEIRIN.JP" && upcoming?.source === OFFICIAL_SCHEDULE_URL
    ? "KEIRIN.JP" : upcoming?.source === "https://ctc.gr.jp/schedule/" ? "CTC" : "unknown";
  const result = { fresh: false, provider, candidateOnly: upcoming?.candidateOnly === true,
    publicationAllowed: false, reasons: [] };
  const fail = (reason) => ({ ...result, reasons: [reason] });
  if (!Number.isFinite(now.getTime())) return fail("INVALID_NOW");
  if (!isObject(upcoming) || provider !== "KEIRIN.JP") return fail("NOT_OFFICIAL_SCHEDULE_SOURCE");
  const candidateSchema = upcoming.schemaVersion === SCHEDULE_SCHEMA && upcoming.candidateOnly === true && upcoming.publicationAllowed === false;
  const publishedSchema = upcoming.schemaVersion === "keirin-jp-schedule-v1" && upcoming.candidateOnly === false
    && upcoming.publicationAllowed === true && upcoming.acceptancePassed === true
    && /^[a-f0-9]{64}$/.test(upcoming.acceptance?.candidateSha256 ?? "") && Number.isFinite(timestamp(upcoming.acceptance?.checkedAt))
    && timestamp(upcoming.acceptance.checkedAt) <= now.getTime();
  if ((!candidateSchema && !publishedSchema) || upcoming.dataValidationPassed !== true
    || typeof upcoming.candidateOnly !== "boolean" || typeof upcoming.publicationAllowed !== "boolean"
    || (upcoming.candidateOnly && upcoming.publicationAllowed)) return fail("UNVALIDATED_SCHEDULE_SCHEMA");
  if (!Array.isArray(upcoming.items) || upcoming.items.length === 0) return fail("EMPTY_SCHEDULE");
  const today = jstNow(now).date, expected = buildRange(today), range = upcoming.range;
  if (!isObject(range) || !validIsoDate(range.from) || !validIsoDate(range.to) || range.from !== expected.from || range.to !== expected.to
    || range.offsetDays !== 60 || range.inclusiveDays !== 61 || !Array.isArray(range.months)
    || JSON.stringify(range.months) !== JSON.stringify(expected.months)) return fail("INCOMPLETE_OR_STALE_SCHEDULE_RANGE");
  const generated = timestamp(upcoming.generatedAt);
  if (!Number.isFinite(generated) || generated > now.getTime() || jstNow(new Date(generated)).date !== today) return fail("STALE_OR_INVALID_GENERATION_TIME");
  const meetings = new Set(), ids = new Set(), rawByMonth = new Map(), observations = [];
  for (const item of upcoming.items) {
    if (!isObject(item) || item.source !== "keirin-jp" || typeof item.venueCode !== "string" || !/^\d{2}$/.test(item.venueCode)
      || VENUES[item.venueCode] !== item.venue || item.venueName !== item.venue) return fail("ITEM_SOURCE_OR_VENUE_MISMATCH");
    if (!validIsoDate(item.startDate) || !validIsoDate(item.endDate) || item.startDate > item.endDate
      || item.date !== item.startDate || item.endDate < range.from || item.startDate > range.to) return fail("INVALID_MEETING_PERIOD");
    if (item.id !== `keirin-jp-${item.venueCode}-${item.startDate}-${item.endDate}`) return fail("ITEM_IDENTITY_MISMATCH");
    const key = `${item.venueCode}|${item.startDate}|${item.endDate}`;
    if (meetings.has(key) || ids.has(item.id)) return fail("DUPLICATE_MEETING");
    meetings.add(key); ids.add(item.id);
    if (!["GP", "GI", "GII", "GIII", "F1", "F2"].includes(item.grade)
      || !["morning", "day", "night", "midnight", "unknown"].includes(item.session)
      || typeof item.title !== "string" || item.titleStatus !== (item.title ? "published" : "unpublished")
      || typeof item.hasGirls !== "boolean" || !["unverified", "scheduled"].includes(item.operationStatus)
      || ["conflict", "held", "unknown"].includes(item.periodStatus)
      || ["conflict", "held"].includes(item.validationStatus)) return fail("INVALID_OR_HELD_MEETING_FIELDS");
    const expectedSession = ({ 8: "morning", 3: "night", 5: "midnight" })[item.rawSessionIcon] ?? "unknown";
    if ((item.rawSessionIcon !== null && typeof item.rawSessionIcon !== "string")
      || item.session !== expectedSession || !Array.isArray(item.rawAdditionalIcons)
      || item.rawAdditionalIcons.some((flag) => !["01", "02", "03", "04"].includes(flag))
      || new Set(item.rawAdditionalIcons).size !== item.rawAdditionalIcons.length
      || item.hasGirls !== item.rawAdditionalIcons.includes("02")) return fail("MEETING_ICON_CLASSIFICATION_MISMATCH");
    if (typeof item.sourceEventReference !== "string" || !item.sourceEventReference
      || !Array.isArray(item.sourceEventReferences) || item.sourceEventReferences.length === 0
      || item.sourceEventReferences.some((ref) => typeof ref !== "string" || !ref)
      || !item.sourceEventReferences.includes(item.sourceEventReference)) return fail("MISSING_OFFICIAL_EVENT_REFERENCE");
    if (!Array.isArray(item.provenance) || item.provenance.length === 0) return fail("MISSING_RAW_PROVENANCE");
    for (const evidence of item.provenance) {
      if (!isObject(evidence) || evidence.provider !== "KEIRIN.JP"
        || !/^\d{4}-(0[1-9]|1[0-2])$/.test(evidence.requestedMonth ?? "")
        || !range.months.includes(evidence.requestedMonth)) return fail("RAW_SOURCE_MONTH_MISMATCH");
      const expectedUrl = `${OFFICIAL_SCHEDULE_URL}?scyy=${evidence.requestedMonth.slice(0, 4)}&scym=${evidence.requestedMonth.slice(5)}`;
      if (evidence.url !== expectedUrl || !/^[a-f0-9]{64}$/.test(evidence.rawSha256 ?? "")
        || !Number.isSafeInteger(evidence.rawBytes) || evidence.rawBytes <= 0 || evidence.rawBytes > 2 * 1024 * 1024) return fail("INVALID_RAW_PROVENANCE");
      const year = Number(evidence.requestedMonth.slice(0, 4)), month = Number(evidence.requestedMonth.slice(5));
      const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
      if (item.startDate > monthEnd || item.endDate < `${evidence.requestedMonth}-01`) return fail("RAW_MONTH_PERIOD_MISMATCH");
      const fetched = timestamp(evidence.fetchedAt);
      if (!Number.isFinite(fetched) || fetched > now.getTime() || fetched > generated
        || jstNow(new Date(fetched)).date !== today) return fail("STALE_OR_INVALID_RAW_FETCH_TIME");
      const rawKey = JSON.stringify([evidence.rawSha256, evidence.rawBytes, fetched]);
      if (rawByMonth.has(evidence.requestedMonth) && rawByMonth.get(evidence.requestedMonth) !== rawKey) return fail("CONFLICTING_MONTHLY_ORIGINALS");
      rawByMonth.set(evidence.requestedMonth, rawKey);
    }
    observations.push(item);
  }
  for (let i = 0; i < observations.length; i++) for (let j = i + 1; j < observations.length; j++) {
    const a = observations[i], b = observations[j];
    if (a.venueCode === b.venueCode && ((a.startDate <= b.endDate && b.startDate <= a.endDate)
      || a.sourceEventReferences.some((ref) => b.sourceEventReferences.includes(ref)))) return fail("CONFLICTING_MEETING_PERIODS");
  }
  return { ...result, fresh: true, reasons: [] };
}

export function buildTodayUpdatePlan({ now = new Date(), event = "schedule", cron = "", requestedPhase = "auto", entries, results, upcoming } = {}) {
  const jst = jstNow(now);
  const scheduledFinal = event === "schedule" && ["47 14 * * *", "53 14 * * *"].includes(cron);
  const phase = event === "schedule" ? scheduledFinal ? cron.startsWith("47 ") ? "final" : "backfill" : "auto" : requestedPhase;
  if (!["auto", "lineup", "odds", "result", "final", "backfill"].includes(phase)) throw new Error("Invalid update phase");
  const explicit = event !== "schedule";
  const entryRows = entries?.venues?.flatMap((venue) => venue.races ?? []) ?? [];
  const missingEntries = !entryRows.length || entryRows.some((race) => !race.entries?.length || race.entries.some((rider) => !/^\d{5,6}$/.test(String(rider.registrationNo ?? ""))));
  const resultRows = results?.venues?.flatMap((venue) => venue.races ?? []) ?? [];
  const unsettledResultStale = resultRows.some((race) => race.resultStatus !== "confirmed")
    && now.getTime() - Date.parse(results?.source?.fetchCompletedAt ?? results?.generatedAt) > 20 * 60 * 1000;
  const upcomingFresh = inspectUpcomingScheduleFreshness(upcoming, now).fresh;
  return {
    date: jst.date, phase, effectivePhase: phase === "auto" ? automaticUpdatePhase(now).phase : phase,
    entries: phase !== "backfill" && (explicit || missingEntries || snapshotDue(entries, jst.date, entryCheckpoints, now)),
    results: ["final", "backfill"].includes(phase) || ((event === "schedule" || phase === "auto") && (unsettledResultStale || snapshotDue(results, jst.date, resultCheckpoints, now))),
    upcoming: event === "schedule" && jst.hour >= 6 && !upcomingFresh,
    jst: jst.iso,
  };
}

async function readSnapshot(name) {
  try { return JSON.parse((await fs.readFile(path.join("public/data/races", name + ".generated.json"), "utf8")).replace(/^\uFEFF/, "")); }
  catch (error) { console.warn("[update-plan] unavailable snapshot", name, error.code ?? error.name); return null; }
}
export async function reportUpdateState({ append, upcomingOutcome = "skipped", upcomingLog = "", snapshots, publishOutcome = "not-run", publishChanged = "" } = {}) {
  const rows = Object.entries(snapshots).map(([name, data]) => {
    const races = data?.venues?.flatMap((venue) => venue.races ?? []) ?? [];
    const confirmed = races.filter((race) => race.resultStatus === "confirmed").length;
    return "| " + [name, data?.date ?? data?.range?.from ?? "unavailable", races.length || data?.items?.length || 0,
      confirmed, data?.source?.fetchCompletedAt ?? data?.generatedAt ?? "unavailable"].join(" | ") + " |";
  });
  const http = upcomingLog.match(/(?:CTC schedule: |HTTP_)(\d{3})/)?.[1];
  const retainedProvider = snapshots.upcoming?.provider === "KEIRIN.JP" ? "KEIRIN.JP"
    : snapshots.upcoming?.source === "https://ctc.gr.jp/schedule/" ? "CTC (retained legacy data)" : "unknown";
  const ctc = upcomingOutcome === "failure" ? "FAILED / not updated" : upcomingOutcome === "success" ? "FETCHED" : "NOT REQUESTED (existing snapshot retained)";
  await append("### 自動更新の実測状態\n| データ | 対象日/範囲開始 | 件数 | 確定R | 取得/生成日時 |\n|---|---|---:|---:|---|\n" + rows.join("\n")
    + "\n\n開催予定 (KEIRIN.JP取得 / 保持データ出典: " + retainedProvider + "): **" + ctc + "**" + (http ? " / HTTP " + http : "")
    + "。取得失敗時は既存値を保持し、成功取得とは扱いません。確定R数と、更新処理の成否は別です。\n"
    + "\nGit公開ステップ: " + publishOutcome + " / 変更あり: " + (publishChanged || "unknown") + "。Pages反映は別workflowで確認が必要です。\n");
}

async function main() {
  const snapshots = {
    today: await readSnapshot("today"), entries: await readSnapshot("keirin-jp-entries"),
    results: await readSnapshot("keirin-jp-results"), upcoming: await readSnapshot("upcoming-schedule"),
  };
  const append = async (text) => { if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, text); else console.log(text); };
  if (process.argv.includes("--report")) {
    const upcomingLog = await fs.readFile(".tmp/keirin-schedule-upcoming.log", "utf8")
      .catch(() => fs.readFile(".tmp/ctc-upcoming.log", "utf8").catch(() => ""));
    await reportUpdateState({ append, upcomingOutcome: process.env.UPCOMING_OUTCOME, upcomingLog, snapshots,
      publishOutcome: process.env.PUBLISH_OUTCOME, publishChanged: process.env.PUBLISH_CHANGED });
    return;
  }
  const plan = buildTodayUpdatePlan({ event: process.env.UPDATE_EVENT, cron: process.env.UPDATE_CRON,
    requestedPhase: process.env.REQUESTED_PHASE || "auto", ...snapshots });
  if (process.env.REQUESTED_TARGET_DATE && process.env.REQUESTED_TARGET_DATE !== plan.date) {
    throw new Error("Requested date is not the current JST date; refusing all source updates");
  }
  const output = Object.entries(plan).map(([key, value]) => key + "=" + value).join("\n") + "\n";
  if (process.env.GITHUB_OUTPUT) await fs.appendFile(process.env.GITHUB_OUTPUT, output);
  console.log("[update-plan]", plan);
  await append("### 更新計画\n実行時刻 (JST): " + plan.jst + " / phase: " + plan.phase + " / 実時刻モード: " + plan.effectivePhase
    + "\n\n公式出走表=" + plan.entries + "、公式結果=" + plan.results + "、公式開催予定=" + plan.upcoming
    + "。未実行のチェックポイントは現在日の不足分のみ補完し、過去日を当日へ混入させません。\n");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { console.error(error); process.exitCode = 1; });
