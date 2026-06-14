import { readFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();

const riderMasterPath = path.join(
  projectRoot,
  "public",
  "data",
  "analytics",
  "kurari-ex",
  "exact",
  "rider-master.generated.json",
);

function normalizeRegistrationNo(value) {
  const text = String(value ?? "").replace(/[^\d]/gu, "");
  return /^\d{6}$/u.test(text) ? text : "";
}

function countBy(items, fn) {
  const counts = {};
  for (const item of items) {
    const key = fn(item) || "(empty)";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function validateHistoryList(rider, field, currentValue, errors) {
  const history = rider[field];

  if (!Array.isArray(history)) {
    errors.push(`${rider.registrationNo}: ${field} is not an array`);
    return;
  }

  const values = new Set();

  for (const item of history) {
    if (!item || typeof item !== "object") {
      errors.push(`${rider.registrationNo}: ${field} contains non-object item`);
      continue;
    }

    if (!item.value) {
      errors.push(`${rider.registrationNo}: ${field} contains empty value`);
      continue;
    }

    if (values.has(item.value)) {
      errors.push(`${rider.registrationNo}: ${field} duplicate value ${item.value}`);
    }

    values.add(item.value);
  }

  if (currentValue && !values.has(currentValue)) {
    errors.push(`${rider.registrationNo}: current value missing from ${field}`);
  }
}

async function main() {
  const payload = JSON.parse(await readFile(riderMasterPath, "utf8"));
  const items = payload.items ?? [];

  const errors = [];
  const warnings = [];

  if (payload.schemaVersion !== 1) {
    errors.push("schemaVersion must be 1");
  }

  if (!Array.isArray(items)) {
    errors.push("items must be an array");
  }

  const registrationNos = new Set();

  for (const rider of items) {
    const registrationNo = normalizeRegistrationNo(rider.registrationNo);

    if (!registrationNo) {
      errors.push(`invalid registrationNo: ${rider.registrationNo}`);
      continue;
    }

    if (registrationNos.has(registrationNo)) {
      errors.push(`duplicate registrationNo: ${registrationNo}`);
    }

    registrationNos.add(registrationNo);

    if (rider.id !== registrationNo) {
      errors.push(`${registrationNo}: id must equal registrationNo`);
    }

    if (!rider.currentName) {
      warnings.push(`${registrationNo}: currentName is empty`);
    }

    if (!Array.isArray(rider.nameAliases)) {
      errors.push(`${registrationNo}: nameAliases is not an array`);
    } else if (rider.currentNameKey) {
      const aliasKeys = new Set(rider.nameAliases.map((item) => item.nameKey).filter(Boolean));
      if (!aliasKeys.has(rider.currentNameKey)) {
        errors.push(`${registrationNo}: currentNameKey missing from nameAliases`);
      }
    }

    validateHistoryList(rider, "classHistory", rider.currentClass, errors);
    validateHistoryList(rider, "prefectureHistory", rider.currentPrefecture, errors);
    validateHistoryList(rider, "styleHistory", rider.currentStyle, errors);
    validateHistoryList(rider, "kanaHistory", rider.currentKana, errors);
    validateHistoryList(rider, "regionHistory", rider.currentRegion, errors);

    if (!["active", "unknown", "retiredCandidate", "retired"].includes(rider.status)) {
      errors.push(`${registrationNo}: invalid status ${rider.status}`);
    }

    if (!Array.isArray(rider.sources)) {
      errors.push(`${registrationNo}: sources is not an array`);
    }
  }

  const text = await readFile(riderMasterPath, "utf8");

  console.log("");
  console.log("[KURARI EX RIDER MASTER AUDIT]");
  console.log(`riderCount: ${items.length}`);
  console.log(`payloadRiderCount: ${payload.riderCount}`);
  console.log(`activeCount: ${payload.activeCount}`);
  console.log(`seenInLatestOfficialImportCount: ${payload.seenInLatestOfficialImportCount}`);
  console.log(`statusCounts: ${JSON.stringify(countBy(items, (item) => item.status))}`);
  console.log(`sourceCounts: ${JSON.stringify(payload.sourceCounts ?? {})}`);
  console.log(`duplicateRegistrationNoCount: ${items.length - registrationNos.size}`);
  console.log(`fileBytes: ${Buffer.byteLength(text, "utf8")}`);
  console.log(`warningCount: ${warnings.length}`);
  console.log(`errorCount: ${errors.length}`);

  if (warnings.length) {
    console.log("");
    console.log("[warnings]");
    for (const warning of warnings.slice(0, 30)) console.log(`- ${warning}`);
    if (warnings.length > 30) console.log(`... and ${warnings.length - 30} more`);
  }

  if (errors.length) {
    console.log("");
    console.log("[errors]");
    for (const error of errors.slice(0, 50)) console.log(`- ${error}`);
    if (errors.length > 50) console.log(`... and ${errors.length - 50} more`);
    process.exitCode = 1;
    return;
  }

  console.log("");
  console.log("audit passed");
}

main().catch((error) => {
  console.error("[KURARI EX RIDER MASTER AUDIT] failed");
  console.error(error);
  process.exitCode = 1;
});