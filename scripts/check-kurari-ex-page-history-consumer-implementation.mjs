import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";

const INDEX_PATH = "public/data/analytics/kurari-ex/history/index.generated.json";
const EXPECTED_INDEX_HASH = "683fd01dea2e0e5f272d35eff42bde236ba326954e857feaa9dec04f77cb3acb";
const EXPECTED_INDEX_BYTES = 14079;
const allowedFiles = new Set([
  "src/lib/kurariExData.ts",
  "src/types/kurariEx.ts",
  "src/pages/ExDataPage.tsx",
  "src/pages/PageImplementations.tsx",
  "src/data/kurariExAnalysisInventory.ts",
  "docs/kurari-ex/ex-page-history-consumer-implementation-2026-05-01-to-2026-07-01.md",
  "scripts/audit-kurari-ex-page-history-consumer-implementation.mjs",
  "scripts/check-kurari-ex-page-history-consumer-implementation.mjs",
]);
const knownReviewPrefixes = [
  "public/data/reviews/index.json",
  "public/data/reviews/2026-06-28/",
  "public/data/reviews/2026-06-29/",
  "public/data/reviews/2026-06-30/",
  "public/data/reviews/2026-07-01/",
];
const requiredFiles = [...allowedFiles].filter((file) => file !== "src/pages/PageImplementations.tsx");
const requiredMarkers = {
  "src/lib/kurariExData.ts": [
    "getKurariExAssetPath",
    "loadKurariExHistoryIndex",
    "loadKurariExHistoryDailyByPath",
    "loadKurariExHistoryDailyByDate",
    "summarizeKurariExHistoryDaily",
    "getSameNameCandidateWarnings",
  ],
  "src/pages/ExDataPage.tsx": [
    "KURARI EX History Overview",
    "HISTORY DATE SELECTOR",
    "SELECTED DAILY SUMMARY",
    "Identity Safety Notes",
  ],
};

const failures = [];
const warnings = [];
for (const file of requiredFiles) {
  if (!existsSync(file)) failures.push(`missing required file: ${file}`);
}
for (const [file, markers] of Object.entries(requiredMarkers)) {
  if (!existsSync(file)) continue;
  const source = readFileSync(file, "utf8");
  for (const marker of markers) {
    if (!source.includes(marker)) failures.push(`missing marker ${marker} in ${file}`);
  }
}

if (existsSync(INDEX_PATH)) {
  const indexBytes = readFileSync(INDEX_PATH);
  const indexHash = createHash("sha256")
    .update(JSON.stringify(JSON.parse(indexBytes.toString("utf8"))))
    .digest("hex");
  if (indexHash !== EXPECTED_INDEX_HASH) failures.push(`history index hash changed: ${indexHash}`);
  if (statSync(INDEX_PATH).size !== EXPECTED_INDEX_BYTES) failures.push("history index byte size changed");
} else {
  failures.push(`missing index: ${INDEX_PATH}`);
}

const git = spawnSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], {
  encoding: "utf8",
});
if (git.status !== 0) {
  failures.push(`git status failed: ${git.stderr.trim()}`);
} else {
  const changed = git.stdout.split("\0").filter(Boolean).map((entry) => entry.slice(3));
  for (const file of changed) {
    if (allowedFiles.has(file)) continue;
    if (knownReviewPrefixes.some((prefix) => file === prefix || file.startsWith(prefix))) {
      warnings.push(file);
      continue;
    }
    failures.push(`changed file is outside the allowed scope: ${file}`);
  }
  const protectedChanges = changed.filter((file) =>
    file.startsWith("public/data/analytics/kurari-ex/history/")
    || file.startsWith("public/data/analytics/kurari-ex/source/")
    || file.startsWith("public/data/races/")
    || file.startsWith("private-input/")
    || file.startsWith("dog/reviews/")
    || file.startsWith(".github/")
    || file === "package.json"
  );
  for (const file of protectedChanges) failures.push(`protected path changed: ${file}`);
}

const finalStatus = failures.length
  ? "EX_PAGE_HISTORY_CONSUMER_IMPLEMENTATION_CHECK_FAIL"
  : warnings.length
    ? "EX_PAGE_HISTORY_CONSUMER_IMPLEMENTATION_CHECK_PASS_WITH_WARNINGS"
    : "EX_PAGE_HISTORY_CONSUMER_IMPLEMENTATION_CHECK_PASS";

const warningSummary = warnings.length
  ? [`known pre-existing review changes retained: ${warnings.length} file(s)`]
  : [];
console.log(JSON.stringify({ failures, warnings: warningSummary, finalStatus }, null, 2));
console.log(finalStatus);
if (failures.length) process.exitCode = 1;
