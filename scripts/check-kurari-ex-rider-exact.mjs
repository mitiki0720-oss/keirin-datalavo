import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  collectFiles,
  relativeProjectPath,
} from "./kurari-ex-history-common.mjs";
import {
  normalizeRegistrationNo,
  riderExactRoot,
} from "./kurari-ex-rider-common.mjs";

const individualLimit = 20 * 1024;
const indexLimit = 300 * 1024;
const totalLimit = 5 * 1024 * 1024;
const prohibitedKeys = new Set([
  "raw",
  "rawText",
  "html",
  "summary",
  "comment",
  "comments",
  "kamashiSuccessRate",
  "tsuppariSuccessRate",
  "chigiriRate",
  "chigirareRate",
  "tobitsukiSuccessRate",
  "seriWinRate",
]);
const winticketTerms = [
  "WINTICKET",
  "かまし成功率",
  "つっぱり成功率",
  "ちぎり率",
  "ちぎられ率",
  "飛びつき成功率",
  "競りの勝率",
];

function hasProhibitedKey(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasProhibitedKey);
  return Object.entries(value).some(
    ([key, child]) => prohibitedKeys.has(key) || hasProhibitedKey(child),
  );
}

async function main() {
  const indexPath = path.join(riderExactRoot, "index.generated.json");
  const index = JSON.parse(await readFile(indexPath, "utf8"));
  const files = await collectFiles(riderExactRoot);
  const riderFiles = files.filter(
    (file) => /by-tail[/\\]\d{2}[/\\]\d{6}\.generated\.json$/u.test(file),
  );
  const registrationNos = new Set();
  const duplicateRegistrationNos = new Set();
  const publishedFiles = new Set(
    index.items.map((item) => path.resolve(
      riderExactRoot,
      item.file.replace(/^\/data\/analytics\/kurari-ex\/exact\/riders\//u, ""),
    )),
  );
  let invalidRegistrationNoCount = 0;
  let ambiguousIdentityCount = 0;
  let unresolvedPublishedRiderCount = 0;
  let filesOver20KbCount = 0;
  let totalBytes = 0;
  let maxFileBytes = 0;
  let rawTextDetected = false;
  let htmlDetected = false;
  let winticketDerivedFieldDetected = false;
  let jsonlDetected = false;
  const warnings = [];

  for (const file of files) {
    const { size } = await stat(file);
    totalBytes += size;
    const extension = path.extname(file).toLowerCase();
    if (extension === ".jsonl") jsonlDetected = true;
    if (extension === ".txt" || extension === ".md") rawTextDetected = true;
    if (extension === ".html" || extension === ".htm") htmlDetected = true;
    const text = await readFile(file, "utf8");
    if (/<(?:html|body|script|div|table)\b/iu.test(text)) htmlDetected = true;
    if (winticketTerms.some((term) => text.includes(term))) {
      winticketDerivedFieldDetected = true;
    }
    if (extension !== ".json") continue;
    const payload = JSON.parse(text);
    if (hasProhibitedKey(payload)) rawTextDetected = true;
    if (!file.includes(`${path.sep}by-tail${path.sep}`)) continue;
    maxFileBytes = Math.max(maxFileBytes, size);
    if (size > individualLimit) {
      filesOver20KbCount += 1;
      warnings.push(`${relativeProjectPath(file)} exceeds 20 KB`);
    }
    const registrationNo = normalizeRegistrationNo(payload.registrationNo);
    if (!registrationNo) invalidRegistrationNoCount += 1;
    if (registrationNos.has(registrationNo)) duplicateRegistrationNos.add(registrationNo);
    registrationNos.add(registrationNo);
    if (payload.identity?.status === "ambiguous") ambiguousIdentityCount += 1;
    if (
      !payload.identity?.registrationNoResolved
      || payload.identity?.status === "unresolved"
    ) {
      unresolvedPublishedRiderCount += 1;
    }
  }

  const missingRiderFileCount = [...publishedFiles].filter(
    (file) => !files.some((candidate) => path.resolve(candidate) === file),
  ).length;
  const indexBytes = (await stat(indexPath)).size;
  if (indexBytes > indexLimit) warnings.push("rider index exceeds 300 KB");
  if (totalBytes > totalLimit) warnings.push("rider exact output exceeds 5 MB");
  const report = {
    riderIndexCount: index.items.length,
    riderFileCount: riderFiles.length,
    duplicateRegistrationNoCount: duplicateRegistrationNos.size,
    missingRiderFileCount,
    invalidRegistrationNoCount,
    ambiguousIdentityCount,
    unresolvedPublishedRiderCount,
    filesOver20KbCount,
    totalBytes,
    maxFileBytes,
    rawTextDetected,
    htmlDetected,
    winticketDerivedFieldDetected,
    jsonlDetected,
    warningCount: warnings.length,
  };

  console.log("[kurari-ex rider exact check]");
  for (const [key, value] of Object.entries(report)) {
    console.log(`${key}: ${value}`);
  }
  for (const warning of warnings) console.warn(`WARNING: ${warning}`);

  const hasError = report.duplicateRegistrationNoCount > 0
    || report.missingRiderFileCount > 0
    || report.invalidRegistrationNoCount > 0
    || report.ambiguousIdentityCount > 0
    || report.unresolvedPublishedRiderCount > 0
    || report.rawTextDetected
    || report.htmlDetected
    || report.winticketDerivedFieldDetected
    || report.jsonlDetected;
  if (hasError) process.exitCode = 1;
}

main().catch((error) => {
  console.error("[kurari-ex rider exact check] failed");
  console.error(error);
  process.exitCode = 1;
});
