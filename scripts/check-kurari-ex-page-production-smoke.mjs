import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const INDEX_PATH = "public/data/analytics/kurari-ex/history/index.generated.json";
const EXPECTED_INDEX_HASH = "sha256:683fd01dea2e0e5f272d35eff42bde236ba326954e857feaa9dec04f77cb3acb";
const EXPECTED_INDEX_BYTES = 14079;
const ALLOWED_NEW = new Set([
  "docs/kurari-ex/ex-page-production-smoke-audit-2026-05-01-to-2026-07-01.md",
  "scripts/audit-kurari-ex-page-production-smoke.mjs",
  "scripts/check-kurari-ex-page-production-smoke.mjs",
]);
const KNOWN_REVIEW_PATHS = [
  "public/data/reviews/index.json",
  "public/data/reviews/2026-06-28/",
  "public/data/reviews/2026-06-29/",
  "public/data/reviews/2026-06-30/",
  "public/data/reviews/2026-07-01/",
];

function hashPayload(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function git(args) {
  return spawnSync("git", args, { encoding: "utf8" });
}

export function checkKurariExPageProductionSmoke({ printOutput = true } = {}) {
  const failures = [];
  const warnings = [];
  for (const file of ALLOWED_NEW) {
    if (!existsSync(file)) failures.push(`missing required file: ${file}`);
  }

  if (!existsSync(INDEX_PATH)) {
    failures.push(`missing history index: ${INDEX_PATH}`);
  } else {
    const buffer = readFileSync(INDEX_PATH);
    const index = JSON.parse(buffer.toString("utf8"));
    if (hashPayload(index) !== EXPECTED_INDEX_HASH) failures.push(`local index payload hash changed: ${hashPayload(index)}`);
    if (statSync(INDEX_PATH).size !== EXPECTED_INDEX_BYTES) failures.push(`local index bytes changed: ${statSync(INDEX_PATH).size}`);
    if (index.items?.length !== 58) failures.push(`local index source count changed: ${index.items?.length}`);
    if (index.dayCount !== 58) failures.push(`local index day count changed: ${index.dayCount}`);
    if (index.raceCount !== 4373) failures.push(`local index race count changed: ${index.raceCount}`);
    const latest = index.items?.find((item) => item.date === "2026-07-01");
    if (latest?.file !== "/data/analytics/kurari-ex/history/daily/2026-07/2026-07-01.generated.json") {
      failures.push(`local latest path changed: ${latest?.file ?? "missing"}`);
    }
  }

  const srcDiff = git(["diff", "--quiet", "HEAD", "--", "src"]);
  if (srcDiff.status !== 0) failures.push("src changed from HEAD");

  const status = git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  if (status.status !== 0) {
    failures.push(`git status failed: ${status.stderr.trim()}`);
  } else {
    const changed = status.stdout.split("\0").filter(Boolean).map((entry) => entry.slice(3));
    const reviewChanges = [];
    for (const file of changed) {
      if (ALLOWED_NEW.has(file)) continue;
      if (KNOWN_REVIEW_PATHS.some((known) => file === known || (known.endsWith("/") && file.startsWith(known)))) {
        reviewChanges.push(file);
        continue;
      }
      failures.push(`changed file is outside this audit scope: ${file}`);
    }
    if (reviewChanges.length) warnings.push(`pre-existing review changes retained: ${reviewChanges.length} file(s)`);

    const protectedChanges = changed.filter((file) =>
      file.startsWith("src/")
      || file.startsWith("public/data/analytics/kurari-ex/history/")
      || file.startsWith("public/data/analytics/kurari-ex/source/")
      || file.startsWith("public/data/races/")
      || file.startsWith("private-input/")
      || file.startsWith("dog/reviews/")
      || file.startsWith("scripts/debug/")
      || file.startsWith(".github/")
      || file === "package.json"
    );
    for (const file of protectedChanges) failures.push(`protected path changed: ${file}`);
  }

  for (const script of [
    "scripts/audit-kurari-ex-page-production-smoke.mjs",
    "scripts/check-kurari-ex-page-production-smoke.mjs",
  ]) {
    if (!existsSync(script)) continue;
    const source = readFileSync(script, "utf8");
    if (/\b(writeFile|appendFile|rm|unlink|rename|copyFile)\s*\(/u.test(source)) {
      failures.push(`write-capable filesystem operation found in ${script}`);
    }
  }

  const finalStatus = failures.length
    ? "EX_PAGE_PRODUCTION_SMOKE_CHECK_FAIL"
    : warnings.length
      ? "EX_PAGE_PRODUCTION_SMOKE_CHECK_PASS_WITH_WARNINGS"
      : "EX_PAGE_PRODUCTION_SMOKE_CHECK_PASS";
  const result = { failures, warnings, finalStatus };
  if (printOutput) {
    console.log(JSON.stringify(result, null, 2));
    console.log(finalStatus);
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = checkKurariExPageProductionSmoke();
  if (result.failures.length) process.exitCode = 1;
}
