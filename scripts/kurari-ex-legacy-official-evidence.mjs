import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { normalizeVenueName, venueMap } from "./kurari-ex-history-common.mjs";

const sourcePath = "public/data/races/keirin-jp-results.generated.json";
export const legacyEvidencePath = fileURLToPath(new URL(
  "./kurari-ex/legacy-official-evidence.generated.json", import.meta.url,
));

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function podiumMatches(result, race) {
  if (race.raceKey !== `${race.date}:${race.venueKey}:${race.raceNumber}`) return false;
  if (!Array.isArray(result.finishOrder)) return false;
  for (const [rank, key] of [[1, "first"], [2, "second"], [3, "third"]]) {
    const legacy = race.result?.[key];
    if (!Number.isInteger(legacy?.carNo)) continue;
    const rows = result.finishOrder.filter(
      (row) => Number(row.rank) === rank && Number(row.carNo) === legacy.carNo,
    );
    if (rows.length !== 1) return false;
  }
  return true;
}

function matchingOfficialRace(snapshot, race) {
  if (snapshot?.date !== race.date || snapshot?.source?.provider !== "KEIRIN.JP") return null;
  const venueName = venueMap[race.venueKey];
  if (!venueName) return null;
  const venues = snapshot.venues?.filter(
    (item) => normalizeVenueName(item.venueName) === normalizeVenueName(venueName),
  ) ?? [];
  if (venues.length !== 1) return null;
  const matches = venues[0].races?.filter(
    (item) => Number(item.raceNumber) === race.raceNumber,
  ) ?? [];
  if (matches.length !== 1) return null;
  const result = matches[0];
  if (result.resultStatus !== "confirmed" || result.operationStatus !== "finished"
    || !podiumMatches(result, race)) return null;
  return result;
}

export function loadLegacyOfficialFinishByRace(races, {
  fromGitHistory = false, manifestPath = legacyEvidencePath,
} = {}) {
  const candidates = races.filter((race) => race.quality?.resultParsed !== true
    && race.result?.status !== "cancelled"
    && !Array.isArray(race.result?.finishOrder)
    && ["first", "second", "third"].some((key) => Number.isInteger(race.result?.[key]?.carNo)));
  if (!fromGitHistory) {
    const evidence = new Map();
    if (!existsSync(manifestPath)) {
      if (candidates.length) throw new Error("legacy official evidence manifest is missing");
      return { evidence, candidateCount: 0 };
    }
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (manifest.schemaVersion !== 1 || manifest.sourcePath !== sourcePath
      || !Array.isArray(manifest.items)) throw new Error("invalid legacy official evidence manifest");
    const stored = new Map();
    for (const item of manifest.items) {
      if (stored.has(item.raceKey)) throw new Error(`duplicate legacy evidence: ${item.raceKey}`);
      stored.set(item.raceKey, item);
    }
    for (const race of candidates) {
      const item = stored.get(race.raceKey);
      if (!item) continue;
      if (item.date !== race.date || item.venueKey !== race.venueKey
        || item.raceNumber !== race.raceNumber || item.provider !== "KEIRIN.JP"
        || item.status !== "finished"
        || !/^[a-f0-9]{40}$/u.test(item.sourceCommit ?? "")
        || !/^[a-f0-9]{40}$/u.test(item.sourceBlob ?? "")
        || !/^[a-f0-9]{64}$/u.test(item.sourceSnapshotSha256 ?? "")
        || item.sourceFetchedAt !== null || !podiumMatches(item, race)) {
        throw new Error(`legacy official evidence mismatch: ${race.raceKey}`);
      }
      evidence.set(race.raceKey, item);
    }
    return { evidence, candidateCount: candidates.length };
  }
  const byDate = new Map();
  for (const race of candidates) {
    const list = byDate.get(race.date) ?? [];
    list.push(race);
    byDate.set(race.date, list);
  }
  const evidence = new Map();
  for (const [date, dateRaces] of byDate) {
    const since = new Date(Date.parse(`${date}T00:00:00Z`) - 86400000)
      .toISOString().slice(0, 10);
    const until = new Date(Date.parse(`${date}T00:00:00Z`) + 4 * 86400000)
      .toISOString().slice(0, 10);
    const commits = git("log", "HEAD", "--format=%H", `--since-as-filter=${since}`,
      `--until=${until}`, "--", sourcePath).trim().split(/\s+/u).filter(Boolean);
    for (const commit of commits) {
      const sourceText = git("show", `${commit}:${sourcePath}`);
      const snapshot = JSON.parse(sourceText);
      const sourceBlob = git("rev-parse", `${commit}:${sourcePath}`).trim();
      const sourceSnapshotSha256 = createHash("sha256").update(sourceText).digest("hex");
      for (const race of dateRaces) {
        if (evidence.has(race.raceKey)) continue;
        const official = matchingOfficialRace(snapshot, race);
        if (!official) continue;
        evidence.set(race.raceKey, {
          status: "finished",
          finishOrder: official.finishOrder,
          sourceCommit: commit,
          sourceBlob,
          sourceSnapshotSha256,
          sourceFetchedAt: null,
          raceKey: race.raceKey,
          date: race.date,
          venueKey: race.venueKey,
          raceNumber: race.raceNumber,
          provider: "KEIRIN.JP",
        });
      }
    }
  }
  return { evidence, candidateCount: candidates.length };
}
