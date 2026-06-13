import { execFile } from "node:child_process";
import { cp, mkdir, open, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const noPush = args.has("--no-push");
const allowedArgs = new Set(["--dry-run", "--no-push"]);
const unknownArgs = [...args].filter((argument) => !allowedArgs.has(argument));
if (unknownArgs.length) throw new Error(`unknown arguments: ${unknownArgs.join(", ")}`);
if (dryRun && noPush) throw new Error("--dry-run and --no-push cannot be combined");

const publicRoot = path.join(projectRoot, "public", "data", "analytics", "kurari-ex");
const historyIndexPath = path.join(publicRoot, "history", "index.generated.json");
const privateKurariRoot = path.join(projectRoot, "private-input", "kurari-ex");
const dryRunBackupRoot = path.join(projectRoot, ".tmp", `kurari-ex-raw-refresh-${process.pid}`);
const automationLocksRoot = path.join(projectRoot, "private-input", "automation-locks");
const repoWriteLockPath = path.join(automationLocksRoot, "keirin-repo-write.lock");
const publicGitPaths = [
  "public/data/analytics/kurari-ex/index.generated.json",
  "public/data/analytics/kurari-ex/status.generated.json",
  "public/data/analytics/kurari-ex/global/",
  "public/data/analytics/kurari-ex/venues/",
  "public/data/analytics/kurari-ex/guidance/",
  "public/data/analytics/kurari-ex/history/",
  "public/data/analytics/kurari-ex/exact/",
];
let lockHandle = null;
let lockToken = null;

function outputText(value) {
  const text = String(value ?? "").trim();
  if (text) console.log(text);
}

async function run(command, commandArgs, options = {}) {
  console.log(`[raw-refresh] run: ${command} ${commandArgs.join(" ")}`);
  const { stdout, stderr } = await execFileAsync(command, commandArgs, {
    cwd: projectRoot,
    maxBuffer: 30 * 1024 * 1024,
    ...options,
  });
  outputText(stdout);
  if (String(stderr ?? "").trim()) console.error(String(stderr).trim());
  return stdout;
}

async function runNode(script, scriptArgs = []) {
  return run(process.execPath, [path.join(scriptDirectory, script), ...scriptArgs]);
}

async function git(gitArgs, options = {}) {
  return run("git", gitArgs, options);
}

async function countGeneratedJsonFiles(directory) {
  let count = 0;
  async function visit(current) {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(target);
      if (entry.isFile() && entry.name.endsWith(".generated.json")) count += 1;
    }
  }
  await visit(directory);
  return count;
}

async function summarizePublicChanges() {
  const status = await git(["status", "--short", "--", ...publicGitPaths]);
  const paths = status
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => line.slice(3).replaceAll("\\", "/"));
  const checked = await countGeneratedJsonFiles(publicRoot);
  const count = (predicate) => paths.filter(predicate).length;
  const summary = {
    checked,
    semanticChanges: paths.length,
    unchangedSkipped: Math.max(0, checked - paths.length),
    daily: count((file) => file.includes("/history/daily/")),
    venueExact: count((file) =>
      file.includes("/exact/")
      && !file.includes("/exact/riders/")
      && !file.includes("/exact/matchups/")
    ),
    matchupExact: count((file) => file.includes("/exact/matchups/")),
    riderExact: count((file) => file.includes("/exact/riders/")),
    guidance: count((file) => file.includes("/guidance/")),
    seed: count((file) =>
      /kurari-ex\/(?:venues|global)\//u.test(file)
      || /kurari-ex\/(?:index|status)\.generated\.json$/u.test(file)
    ),
  };
  console.log(`[raw-refresh] generated files checked: ${summary.checked}`);
  console.log(`[raw-refresh] semantic changes: ${summary.semanticChanges}`);
  console.log(`[raw-refresh] unchanged skipped: ${summary.unchangedSkipped}`);
  console.log(`[raw-refresh] daily files changed: ${summary.daily}`);
  console.log(`[raw-refresh] venue exact files changed: ${summary.venueExact}`);
  console.log(`[raw-refresh] matchup exact files changed: ${summary.matchupExact}`);
  console.log(`[raw-refresh] rider exact files changed: ${summary.riderExact}`);
  console.log(`[raw-refresh] seed files changed: ${summary.seed}`);
  console.log(`[raw-refresh] guidance files changed: ${summary.guidance}`);
  return summary;
}

function processExists(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

async function readLock() {
  try {
    return JSON.parse((await readFile(repoWriteLockPath, "utf8")).replace(/^\uFEFF/u, ""));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    return { invalid: true };
  }
}

async function acquireRepoWriteLock() {
  await mkdir(automationLocksRoot, { recursive: true });
  const deadline = Date.now() + 10 * 60 * 1000;
  let waitingLogged = false;
  while (Date.now() < deadline) {
    const existing = await readLock();
    if (existing) {
      const ageMs = Date.now() - Date.parse(existing.startedAt ?? 0);
      if (existing.invalid || !processExists(Number(existing.pid)) || ageMs > 6 * 60 * 60 * 1000) {
        console.log("[raw-refresh] stale repo write lock recovered");
        await rm(repoWriteLockPath, { force: true });
        continue;
      }
      if (!waitingLogged) {
        console.log(`[raw-refresh] waiting for repo write lock: PID ${existing.pid}`);
        waitingLogged = true;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
      continue;
    }
    try {
      lockHandle = await open(repoWriteLockPath, "wx");
      lockToken = `${process.pid}-${Date.now()}`;
      await lockHandle.writeFile(JSON.stringify({
        schemaVersion: 1,
        pid: process.pid,
        token: lockToken,
        owner: "kurari-ex-raw-refresh",
        startedAt: new Date().toISOString(),
      }));
      console.log("[raw-refresh] repo write lock acquired");
      return;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
  }
  throw new Error("timed out waiting for repo write lock");
}

async function releaseRepoWriteLock() {
  if (lockHandle) {
    await lockHandle.close();
    lockHandle = null;
  }
  const existing = await readLock();
  if (existing?.token === lockToken) {
    await rm(repoWriteLockPath, { force: true });
    console.log("[raw-refresh] repo write lock released");
  }
}

async function runPrivatePreparation() {
  await runNode("audit-kurari-ex-raw-formats.mjs");
  await runNode("normalize-kurari-ex-history.mjs");
  await runNode("check-kurari-ex-normalized.mjs");
}

async function copyIfPresent(source, destination) {
  try {
    await cp(source, destination, { recursive: true });
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function snapshotDryRunPrivateOutputs() {
  await rm(dryRunBackupRoot, { recursive: true, force: true });
  await mkdir(dryRunBackupRoot, { recursive: true });
  const present = {};
  for (const directory of ["audit", "normalized"]) {
    present[directory] = await copyIfPresent(
      path.join(privateKurariRoot, directory),
      path.join(dryRunBackupRoot, directory),
    );
  }
  return present;
}

async function restoreDryRunPrivateOutputs(present) {
  for (const directory of ["audit", "normalized"]) {
    const target = path.join(privateKurariRoot, directory);
    await rm(target, { recursive: true, force: true });
    if (present[directory]) {
      await cp(path.join(dryRunBackupRoot, directory), target, { recursive: true });
    }
  }
  await rm(dryRunBackupRoot, { recursive: true, force: true });
}

async function runCurrentPublicAudits() {
  await runNode("check-kurari-ex-compact-history.mjs");
  await runNode("check-kurari-ex-compact-history-replay.mjs");
  await runNode("check-kurari-ex-rider-exact.mjs");
  await runNode("check-kurari-ex-matchup-exact.mjs");
  await runNode("check-kurari-ex-size.mjs");
  console.log("[raw-refresh] parity audits deferred until public regeneration");
}

async function regeneratePublicData() {
  await runNode("import-kurari-ex-seeds.mjs");
  await runNode("export-kurari-ex-compact-history.mjs");
  await runNode("check-kurari-ex-compact-history.mjs");
  const historyIndex = JSON.parse(await readFile(historyIndexPath, "utf8"));
  const generatedAt = historyIndex.generatedAt;
  await runNode("generate-kurari-ex-venue-exact.mjs", [
    "--source=history",
    `--generated-at=${generatedAt}`,
  ]);
  await runNode("check-kurari-ex-compact-history-replay.mjs");
  await runNode("check-kurari-ex-venue-exact-history-parity.mjs");
  await runNode("generate-kurari-ex-rider-exact.mjs", [
    "--source=history",
    `--generated-at=${generatedAt}`,
  ]);
  await runNode("check-kurari-ex-rider-exact-history-parity.mjs");
  await runNode("check-kurari-ex-rider-exact.mjs");
  await runNode("generate-kurari-ex-matchup-exact.mjs");
  await runNode("check-kurari-ex-matchup-exact.mjs");
  await runNode("check-kurari-ex-size.mjs");
}

async function commitAndPush() {
  const changeSummary = await summarizePublicChanges();
  const changedFileCount = changeSummary.semanticChanges;
  if (!changedFileCount) {
    console.log("[raw-refresh] no semantic public changes");
    console.log("[raw-refresh] commit skipped");
    console.log("[raw-refresh] push skipped");
    return { changedFileCount, committed: false, pushed: false };
  }
  await git(["add", "--", ...publicGitPaths]);
  try {
    await git(["diff", "--cached", "--quiet", "--", ...publicGitPaths]);
    console.log("[raw-refresh] no staged public changes");
    return { changedFileCount, committed: false, pushed: false };
  } catch (error) {
    if (error?.code !== 1) throw error;
  }
  const date = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  await git([
    "commit",
    "--only",
    "-m",
    `Refresh KURARI EX from raw inputs ${date}`,
    "--",
    ...publicGitPaths,
  ]);
  const commitHash = (await git(["rev-parse", "HEAD"])).trim();
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await git(["pull", "--rebase", "origin", "main"]);
      await git(["push", "origin", "main"]);
      console.log(`[raw-refresh] push succeeded: ${commitHash}`);
      return { changedFileCount, committed: true, pushed: true, commitHash };
    } catch (error) {
      try {
        await git(["rebase", "--abort"]);
      } catch {
        // No rebase may be active when push alone failed.
      }
      console.error(`[raw-refresh] push attempt ${attempt} failed`);
      if (attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
  throw new Error("unreachable push state");
}

async function main() {
  console.log("[kurari-ex raw refresh]");
  console.log(`mode: ${dryRun ? "dry-run" : noPush ? "no-push" : "write-and-push"}`);
  if (dryRun) {
    const snapshot = await snapshotDryRunPrivateOutputs();
    try {
      await runPrivatePreparation();
      await runNode("import-kurari-ex-seeds.mjs", ["--dry-run"]);
      await runCurrentPublicAudits();
      console.log("[raw-refresh] dry-run completed; generated files were restored");
    } finally {
      await restoreDryRunPrivateOutputs(snapshot);
    }
    return;
  }
  await runPrivatePreparation();
  await acquireRepoWriteLock();
  try {
    await regeneratePublicData();
    if (noPush) {
      const changeSummary = await summarizePublicChanges();
      if (!changeSummary.semanticChanges) {
        console.log("[raw-refresh] no semantic public changes");
      }
      console.log("[raw-refresh] commit skipped");
      console.log("[raw-refresh] push skipped");
      console.log("[raw-refresh] no-push completed; git add/commit/push skipped");
      return;
    }
    await commitAndPush();
  } finally {
    await releaseRepoWriteLock();
  }
}

main().catch(async (error) => {
  console.error("[kurari-ex raw refresh] failed");
  console.error(error);
  await releaseRepoWriteLock();
  process.exitCode = 1;
});
