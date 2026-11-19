import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

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
  const upcomingFresh = upcoming?.source === "https://ctc.gr.jp/schedule/" && upcoming.items?.length > 0
    && upcoming.range?.from <= jst.date && upcoming.range?.to >= jst.date
    && Number.isFinite(Date.parse(upcoming.generatedAt)) && Date.parse(upcoming.generatedAt) <= now.getTime()
    && jstNow(new Date(upcoming.generatedAt)).date === jst.date;
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
  const http = upcomingLog.match(/Failed to fetch CTC schedule: (\d+)/)?.[1];
  const ctc = upcomingOutcome === "failure" ? "FAILED / not updated" : upcomingOutcome === "success" ? "FETCHED" : "NOT REQUESTED (existing snapshot retained)";
  await append("### 自動更新の実測状態\n| データ | 対象日/範囲開始 | 件数 | 確定R | 取得/生成日時 |\n|---|---|---:|---:|---|\n" + rows.join("\n")
    + "\n\nCTC開催予定: **" + ctc + "**" + (http ? " / HTTP " + http : "")
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
    const upcomingLog = await fs.readFile(".tmp/ctc-upcoming.log", "utf8").catch(() => "");
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
    + "\n\n公式出走表=" + plan.entries + "、公式結果=" + plan.results + "、CTC開催予定=" + plan.upcoming
    + "。未実行のチェックポイントは現在日の不足分のみ補完し、過去日を当日へ混入させません。\n");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { console.error(error); process.exitCode = 1; });
