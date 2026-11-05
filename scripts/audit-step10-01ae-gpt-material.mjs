// Non-deploy static regression gate for STEP10-01AE; no network, no writes.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import ts from "typescript";
const read = (p) => readFileSync(p);
const sha = (p) => createHash("sha256").update(read(p)).digest("hex");
const pagePath = "src/pages/PageImplementations.tsx";
const pageBytes = read(pagePath);
const page = pageBytes.toString("utf8");
assert.equal(sha(pagePath), "929613e398630d217f5ebd26db056fd670aa661b64fe7b62870320f713b969a9", "AE source bytes must match the original package");
assert.equal(pageBytes.subarray(0, 3).toString("hex"), "efbbbf", "BOM must stay intact");
const sf = ts.createSourceFile(pagePath, page, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);
assert.equal(sf.parseDiagnostics.length, 0, "AE TypeScript TSX parser diagnostics");
const disallowed = [
  "buildMonthlyPredictionGuidance", "getActiveMonthlyReview",
  "getActiveMonthlyForPrediction", "buildMonthlyGuidanceForPrediction",
  "selectedPredictionMonthlyGuidanceText", "monthlyReviewDigest", "monthlyReviewStatus",
  "monthlyReviewItem", "monthlyReviewStateLabel", "extractPredictionBatchMonthlyMeta",
  "monthlyGuidanceText", "MONTHLY_TICKET_POLICY_VERSION",
  "buildKeirinPredictionOutputFormatContract", "月次振り返り反映済み",
  "3連単8〜14点可変", "2車単は10月運用では新規購入対象外"
];
for (const word of disallowed) assert(!page.includes(word), "legacy instruction or read still present: " + word);
const retained = [
  "【適用ルールの確認（この素材に買い目ルールは含めない）】",
  "【対象と項目構造（買い目の指示は含まない）】",
  "GPT素材：当日情報のみ（旧ルール非同梱）",
  "別途承認された運用ルール",
  "buildPredictionExportText", "buildKeirinPredictionExport",
  "downloadKeirinPredictionExport", "【fake補完禁止ルール】",
  "【共通会場・KURARI EXメモ】", '"#monthly-review-page"'
];
for (const word of retained) assert(page.includes(word), "required safe content missing: " + word);
const frozen = [
  ["src/App.tsx", "6437fa9aeebede9d6a4bdf068d76bd56e3b8e101d9ab48471dc80d656b8148f6"],
  ["src/pages/MonthlyReviewPage.tsx", "5535a6225e3519485a989e4e9ec26b755d8073ba298db8bed558774e4343e4ec"],
  ["src/lib/monthlyReviewInsights.ts", "61b550c1a1c87a2222abc45e6b4d04ea7402a0ccb74ed16d3f6ece07180458a9"]
];
for (const [path, expected] of frozen) assert.equal(sha(path), expected, "legacy viewer/route/source must be unchanged: " + path);
const wf = read(".github/workflows/step10-01ae-nondeploy.yml").toString("utf8");
assert(wf.includes("pull_request:"), "PR-only trigger required");
for (const danger of ["workflow_dispatch:", "workflow_run:", "pull_request_target:", "pages: write", "id-token: write", "deploy-pages@", "upload-pages-artifact@", "branches:\n      - main"]) assert(!wf.includes(danger), "deploy-capable CI token or trigger detected: " + danger);
console.log("STEP10-01AE_SOURCE_AND_POLICY_GUARD_PASS; W source pins retained; Monthly viewer and routes unchanged; no deployment");
