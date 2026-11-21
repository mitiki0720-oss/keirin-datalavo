import fs from "node:fs/promises";
import vm from "node:vm";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { buildTodayUpdatePlan } from "./lib/today-update-plan.mjs";

export async function checkCurrentMainCompatibility(candidate, now = new Date()) {
  const source = await fs.readFile("src/pages/PageImplementations.tsx", "utf8");
  const ast = ts.createSourceFile("PageImplementations.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names = ["readString", "normalizeScheduleSession", "normalizeScheduleSource", "getSessionLabel"];
  const declarations = new Map();
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && names.includes(node.name.text)) {
      declarations.set(node.name.text, `const ${node.name.text} = ${node.initializer.getText(ast)};`);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (names.some(name => !declarations.has(name))) throw new Error("actual UI contract function missing");
  const javascript = ts.transpileModule(names.map(name => declarations.get(name)).join("\n")
    + `\n({ ${names.join(", ")} });`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const api = vm.runInNewContext(javascript);
  const plan = buildTodayUpdatePlan({ now, event: "schedule", upcoming: candidate });
  const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), "keirin-schedule-cli-compatibility-"));
  const outputFile = path.join(outputRoot, "upcoming.json");
  const publicFile = "public/data/races/upcoming-schedule.generated.json";
  const previous = await fs.readFile(publicFile);
  const bare = spawnSync(process.execPath, ["scripts/update-keirin-upcoming-schedule.mjs"], {
    encoding: "utf8", timeout: 120_000, env: { ...process.env, GITHUB_ACTIONS: "true",
      KEIRIN_SCHEDULE_OUTPUT_FILE: outputFile, KEIRIN_SCHEDULE_REPLAY_DIR: process.env.SCHEDULE_COMPATIBILITY_REPLAY_DIR ?? "" },
  });
  if (!(await fs.readFile(publicFile)).equals(previous)) throw new Error("compatibility test changed public JSON");
  const cliOutput = bare.status === 0 ? JSON.parse(await fs.readFile(outputFile, "utf8")) : null;
  if (cliOutput && (cliOutput.provider !== "KEIRIN.JP" || cliOutput.schemaVersion !== "keirin-jp-schedule-v1"
    || cliOutput.acceptancePassed !== true || cliOutput.candidateOnly !== false)) throw new Error("CLI result is not an accepted official feed");
  const checks = [
    { contract: "official unknown session is preserved", expected: "unknown", actual: api.normalizeScheduleSession("unknown") },
    { contract: "official morning session is preserved", expected: "morning", actual: api.normalizeScheduleSession("morning") },
    { contract: "official provenance is not relabelled CTC", expected: "keirin-jp", actual: api.normalizeScheduleSource("keirin-jp") },
    { contract: "unknown session is not rendered midnight", expected: "時間帯未確認", actual: api.getSessionLabel("unknown") },
    { contract: "fresh official data is not repeatedly requested", expected: false, actual: plan.upcoming },
    { contract: "existing bare workflow invocation is supported", expected: 0, actual: bare.status },
  ].map(item => ({ ...item, pass: item.actual === item.expected }));
  return { diagnosticOnly: true, productionIntegrationAllowed: checks.every(item => item.pass), checks,
    failures: checks.filter(item => !item.pass).length,
    candidateFlags: { candidateOnly: candidate.candidateOnly, publicationAllowed: candidate.publicationAllowed },
    cliEvidence: { outputFile, publicUnchanged: true, provider: cliOutput?.provider, stderr: bare.stderr },
    note: "Assertions are unchanged. Actions-context CLI uses a temporary output, never the public file." };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) throw new Error("candidate JSON path required");
  const report = await checkCurrentMainCompatibility(JSON.parse(await fs.readFile(file, "utf8")));
  console.log(JSON.stringify(report, null, 2));
  if (!report.productionIntegrationAllowed) process.exitCode = 1;
}
