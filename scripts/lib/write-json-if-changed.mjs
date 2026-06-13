import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function normalizeLf(value) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

function withSingleTrailingLf(value) {
  return `${normalizeLf(value).replace(/\n*$/u, "")}\n`;
}

export function stableStringify(value) {
  return withSingleTrailingLf(JSON.stringify(value, null, 2));
}

function withoutFields(value, ignoredFields) {
  if (Array.isArray(value)) {
    return value.map((item) => withoutFields(item, ignoredFields));
  }
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !ignoredFields.has(key))
      .map(([key, child]) => [key, withoutFields(child, ignoredFields)]),
  );
}

export function reuseGeneratedAtIfSemanticallyEqual(
  previousValue,
  nextValue,
  timestampFields = ["generatedAt"],
) {
  if (!previousValue || !nextValue) return nextValue;
  const ignoredFields = new Set(timestampFields);
  const previousSemantic = JSON.stringify(withoutFields(previousValue, ignoredFields));
  const nextSemantic = JSON.stringify(withoutFields(nextValue, ignoredFields));
  if (previousSemantic !== nextSemantic) return nextValue;
  const reused = { ...nextValue };
  for (const field of timestampFields) {
    if (previousValue[field] != null) reused[field] = previousValue[field];
  }
  return reused;
}

export function readJsonIfPresent(filePath) {
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf8").replace(/^\uFEFF/u, ""));
}

export function writeTextIfChanged(filePath, nextText) {
  const normalizedNext = withSingleTrailingLf(nextText);
  const previous = existsSync(filePath)
    ? withSingleTrailingLf(readFileSync(filePath, "utf8"))
    : null;
  if (previous === normalizedNext) return { changed: false, filePath };
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, normalizedNext, "utf8");
  return { changed: true, filePath };
}

export function writeJsonIfChanged(filePath, nextValue, options = {}) {
  const timestampFields = options.timestampFields ?? ["generatedAt"];
  const previousValue = readJsonIfPresent(filePath);
  const value = options.reuseTimestamps === false
    ? nextValue
    : reuseGeneratedAtIfSemanticallyEqual(previousValue, nextValue, timestampFields);
  return {
    ...writeTextIfChanged(filePath, stableStringify(value)),
    value,
  };
}
