import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { getArgValue, resolveJstDate } from "./kurari-ex-daily-common.mjs";
import { projectRoot } from "./kurari-ex-history-common.mjs";

const execFileAsync = promisify(execFile);
const feedPath = "public/data/races/today.generated.json";

function parseFeed(text, source) {
  const payload = JSON.parse(String(text).replace(/^\uFEFF/u, ""));
  const date = String(payload?.date ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) {
    throw new Error(`feed date is missing or invalid: ${source}`);
  }
  return { payload, date };
}

async function readCurrentFeed() {
  try {
    const text = await readFile(path.join(projectRoot, feedPath), "utf8");
    return { text, ...parseFeed(text, "worktree") };
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function gitOutput(args) {
  const { stdout } = await execFileAsync("git", args, {
    cwd: projectRoot,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });
  return stdout;
}

export async function extractFeedFromHistory(options = {}) {
  const targetDate = resolveJstDate(options.date ?? "yesterday");
  const outputPath = path.resolve(
    options.output
      || path.join(projectRoot, ".tmp", "kurari-ex-stale", `${targetDate}.today.generated.json`),
  );
  const tempRoot = path.join(projectRoot, ".tmp");
  const relativeOutput = path.relative(tempRoot, outputPath);
  if (relativeOutput.startsWith("..") || path.isAbsolute(relativeOutput)) {
    throw new Error(`output must remain inside ${tempRoot}`);
  }

  let source = "";
  let text = "";
  const current = await readCurrentFeed();
  if (current?.date === targetDate) {
    source = "worktree";
    text = current.text;
  } else {
    const history = await gitOutput([
      "log",
      "--format=%H",
      "--",
      feedPath,
    ]);
    const commits = history.split(/\r?\n/u).map((value) => value.trim()).filter(Boolean);
    for (const commit of commits) {
      let candidateText;
      try {
        candidateText = await gitOutput(["show", `${commit}:${feedPath}`]);
      } catch {
        continue;
      }
      let candidate;
      try {
        candidate = parseFeed(candidateText, commit);
      } catch {
        continue;
      }
      if (candidate.date !== targetDate) continue;
      source = commit;
      text = candidateText;
      break;
    }
  }

  if (!source) {
    throw new Error(`no ${feedPath} snapshot matches ${targetDate}`);
  }
  const selected = parseFeed(text, source);
  if (selected.date !== targetDate) {
    throw new Error(`selected feed date ${selected.date} does not match ${targetDate}`);
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, text, "utf8");
  const written = parseFeed(await readFile(outputPath, "utf8"), outputPath);
  if (written.date !== targetDate) {
    throw new Error(`written feed date ${written.date} does not match ${targetDate}`);
  }

  return {
    targetDate,
    outputPath,
    source,
    raceCount: (selected.payload.venues ?? []).reduce(
      (sum, venue) => sum + (Array.isArray(venue?.races) ? venue.races.length : 0),
      0,
    ),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const result = await extractFeedFromHistory({
    date: getArgValue(args, "--date", "yesterday"),
    output: getArgValue(args, "--output", ""),
  });
  console.log("[kurari-ex historical feed extraction]");
  console.log(`targetDate: ${result.targetDate}`);
  console.log(`source: ${result.source}`);
  console.log(`raceCount: ${result.raceCount}`);
  console.log(`output: ${result.outputPath}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("[kurari-ex historical feed extraction] failed");
    console.error(error);
    process.exitCode = 1;
  });
}
