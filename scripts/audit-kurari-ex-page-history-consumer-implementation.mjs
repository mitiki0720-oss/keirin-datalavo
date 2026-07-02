import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";

const EXPECTED_INDEX_HASH = "683fd01dea2e0e5f272d35eff42bde236ba326954e857feaa9dec04f77cb3acb";
const EXPECTED_INDEX_BYTES = 14079;
const INDEX_PATH = "public/data/analytics/kurari-ex/history/index.generated.json";

const requiredFiles = [
  "src/lib/kurariExData.ts",
  "src/types/kurariEx.ts",
  "src/pages/ExDataPage.tsx",
  "src/data/kurariExAnalysisInventory.ts",
  "docs/kurari-ex/ex-page-history-consumer-implementation-2026-05-01-to-2026-07-01.md",
  "scripts/audit-kurari-ex-page-history-consumer-implementation.mjs",
  "scripts/check-kurari-ex-page-history-consumer-implementation.mjs",
];
const requiredLoaderMarkers = [
  "getKurariExAssetPath",
  "loadKurariExHistoryIndex",
  "loadKurariExHistoryDailyByPath",
  "loadKurariExHistoryDailyByDate",
  "summarizeKurariExHistoryIndex",
  "summarizeKurariExHistoryDaily",
  "classifyKurariExHistoryDailyMode",
  "summarizeRegistrationNoCoverage",
  "getSameNameCandidateWarnings",
];
const requiredUiMarkers = [
  "KURARI EX History Overview",
  "HISTORY DATE SELECTOR",
  "SELECTED DAILY SUMMARY",
  "Venue / Race Preview",
  "Identity Safety Notes",
  "NO_STARTERS",
  "MIXED",
  "registrationNo",
];

const failures = [];
const warnings = [];
for (const file of requiredFiles) {
  if (!existsSync(file)) failures.push(`missing required file: ${file}`);
}

if (existsSync("src/lib/kurariExData.ts")) {
  const source = readFileSync("src/lib/kurariExData.ts", "utf8");
  for (const marker of requiredLoaderMarkers) {
    if (!source.includes(marker)) failures.push(`missing loader marker: ${marker}`);
  }
  if (!source.includes("import.meta.env.BASE_URL")) failures.push("GitHub Pages BASE_URL support is missing");
}
if (existsSync("src/pages/ExDataPage.tsx")) {
  const page = readFileSync("src/pages/ExDataPage.tsx", "utf8");
  for (const marker of requiredUiMarkers) {
    if (!page.includes(marker)) failures.push(`missing UI marker: ${marker}`);
  }
  if (!page.includes("同姓同名候補の自動統合なし")) failures.push("same-name non-merge policy is missing");
  if (!page.includes("registrationNo・選手名・carNo の生成なし")) failures.push("generated identity prohibition is missing");
}

if (!existsSync(INDEX_PATH)) {
  failures.push(`missing index: ${INDEX_PATH}`);
} else {
  const bytes = readFileSync(INDEX_PATH);
  const hash = createHash("sha256").update(JSON.stringify(JSON.parse(bytes.toString("utf8")))).digest("hex");
  if (hash !== EXPECTED_INDEX_HASH) failures.push(`history index hash changed: ${hash}`);
  if (statSync(INDEX_PATH).size !== EXPECTED_INDEX_BYTES) {
    failures.push(`history index bytes changed: ${statSync(INDEX_PATH).size}`);
  }
}

const status = spawnSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], {
  encoding: "utf8",
});
if (status.status !== 0) {
  failures.push(`git status failed: ${status.stderr.trim()}`);
} else {
  const changed = status.stdout.split("\0").filter(Boolean).map((entry) => entry.slice(3));
  const protectedPrefixes = [
    "public/data/analytics/kurari-ex/history/",
    "public/data/analytics/kurari-ex/source/",
    "public/data/races/",
    "private-input/",
    "dog/reviews/",
    ".github/",
  ];
  for (const file of changed) {
    if (protectedPrefixes.some((prefix) => file.startsWith(prefix))) {
      failures.push(`protected data changed: ${file}`);
    }
    if (file === "package.json") failures.push("package.json changed");
  }
  const reviewChanges = changed.filter((file) => file.startsWith("public/data/reviews/"));
  if (reviewChanges.length) warnings.push(`pre-existing review changes retained: ${reviewChanges.length} file(s)`);
}

const finalStatus = failures.length
  ? "EX_PAGE_HISTORY_CONSUMER_IMPLEMENTATION_AUDIT_FAIL"
  : warnings.length
    ? "EX_PAGE_HISTORY_CONSUMER_IMPLEMENTATION_AUDIT_PASS_WITH_WARNINGS"
    : "EX_PAGE_HISTORY_CONSUMER_IMPLEMENTATION_AUDIT_PASS";

console.log(JSON.stringify({
  indexHash: `sha256:${EXPECTED_INDEX_HASH}`,
  indexBytes: EXPECTED_INDEX_BYTES,
  failures,
  warnings,
  finalStatus,
}, null, 2));
console.log(finalStatus);
if (failures.length) process.exitCode = 1;
