import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FINAL_STATUS = "LEGACY_PAGES_DELETE_CANDIDATE_RISK_AUDIT_COMPLETED";

const CATEGORIES = [
  "safe-delete-candidate",
  "hold-future-use",
  "manual-review-required",
  "keep-protected",
  "code-delete-candidate",
];

const CANDIDATE_PATHS = [
  "public/players",
  "public/players-page",
  "public/venue-features-page",
  "public/venue-features",
  "public/data/player-cards",
  "public/data/player-images",
  "public/data/player-cards-index.json",
  "src/pages/venueFeatures",
  "src/data/venueSpotlightData.ts",
];

const PROTECTED_ROOTS = [
  "public/data/reviews",
  "public/data/analytics",
  "public/data/races",
  "public/data/venues",
  "public/venues",
];

const SAFE_ASSET_ROOTS = [
  "public/players-page",
  "public/venue-features-page",
  "public/venue-features",
];

const MANUAL_REVIEW_ROOTS = [
  "public/data/player-cards",
];

const MANUAL_REVIEW_FILES = new Set([
  "public/data/player-cards-index.json",
]);

const HOLD_ROOTS = [
  "public/data/player-images",
];

const KEEP_SOURCE_FILES = new Set([
  "src/pages/venueFeatures/venueFeatureParsers.ts",
  "src/pages/venueFeatures/venueFeatureTypes.ts",
]);

const CODE_CANDIDATE_FILE = "src/data/venueSpotlightData.ts";

function normalizePath(value) {
  return value.split(path.sep).join("/");
}

function relativePath(value) {
  return normalizePath(path.relative(ROOT, value));
}

function isUnder(value, root) {
  return value === root || value.startsWith(`${root}/`);
}

async function pathType(target) {
  try {
    const details = await stat(target);
    if (details.isDirectory()) return "directory";
    if (details.isFile()) return "file";
    return "other";
  } catch (error) {
    if (error?.code === "ENOENT") return "missing";
    throw error;
  }
}

async function listFiles(target) {
  const type = await pathType(target);
  if (type === "missing") return [];
  if (type === "file") return [target];
  if (type !== "directory") return [];

  const entries = await readdir(target, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const child = path.join(target, entry.name);
    return entry.isDirectory() ? listFiles(child) : entry.isFile() ? [child] : [];
  }));
  return nested.flat().sort((left, right) =>
    relativePath(left).localeCompare(relativePath(right), "en")
  );
}

async function loadSourceFiles() {
  const files = (await listFiles(path.join(ROOT, "src"))).filter((file) =>
    /\.(?:ts|tsx)$/u.test(file)
  );
  return Promise.all(files.map(async (file) => ({
    absolutePath: file,
    path: relativePath(file),
    content: await readFile(file, "utf8"),
  })));
}

function extractImportSpecifiers(content) {
  const specifiers = [];
  const patterns = [
    /\bfrom\s*["']([^"']+)["']/gu,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu,
    /\bimport\s*["']([^"']+)["']/gu,
  ];
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) specifiers.push(match[1]);
  }
  return specifiers;
}

function resolveSourceImport(importer, specifier) {
  if (!specifier.startsWith(".")) return [];
  const base = path.resolve(path.dirname(importer), specifier);
  return [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ].map((item) => path.normalize(item));
}

function buildImportReferences(sourceFiles) {
  const references = new Map();
  for (const source of sourceFiles) {
    for (const specifier of extractImportSpecifiers(source.content)) {
      for (const resolved of resolveSourceImport(source.absolutePath, specifier)) {
        if (!references.has(resolved)) references.set(resolved, new Set());
        references.get(resolved).add(source.path);
      }
    }
  }
  return references;
}

function publicUrlFor(file) {
  const relative = relativePath(file);
  return relative.startsWith("public/")
    ? `/${relative.slice("public/".length)}`
    : null;
}

function findPublicReferences(file, sourceFiles) {
  const publicUrl = publicUrlFor(file);
  if (!publicUrl) return { exact: [], dynamic: [] };

  const exact = [];
  const dynamic = [];
  for (const source of sourceFiles) {
    if (source.content.includes(publicUrl)) exact.push(source.path);
    const prefixes = [...source.content.matchAll(/`([^`\r\n]*?)\$\{/gu)]
      .map((match) => match[1])
      .filter((prefix) => prefix.startsWith("/") && prefix.length >= 4);
    if (prefixes.some((prefix) => publicUrl.startsWith(prefix))) {
      dynamic.push(source.path);
    }
  }
  return {
    exact: [...new Set(exact)].sort(),
    dynamic: [...new Set(dynamic)].sort(),
  };
}

function classify(relative, references) {
  if (PROTECTED_ROOTS.some((root) => isUnder(relative, root))) {
    return "keep-protected";
  }

  if (
    MANUAL_REVIEW_FILES.has(relative)
    || MANUAL_REVIEW_ROOTS.some((root) => isUnder(relative, root))
  ) {
    return "manual-review-required";
  }

  if (
    KEEP_SOURCE_FILES.has(relative)
    || references.imports.length > 0
    || references.exact.length > 0
  ) {
    return "keep-protected";
  }

  if (HOLD_ROOTS.some((root) => isUnder(relative, root))) {
    return "hold-future-use";
  }

  if (SAFE_ASSET_ROOTS.some((root) => isUnder(relative, root))) {
    return references.dynamic.length === 0
      ? "safe-delete-candidate"
      : "manual-review-required";
  }

  if (relative === CODE_CANDIDATE_FILE) {
    return references.dynamic.length === 0
      ? "code-delete-candidate"
      : "manual-review-required";
  }

  return "manual-review-required";
}

async function audit() {
  const sourceFiles = await loadSourceFiles();
  const importReferences = buildImportReferences(sourceFiles);
  const missingPaths = [];
  const fileSet = new Set();

  for (const configuredPath of [...CANDIDATE_PATHS, ...PROTECTED_ROOTS]) {
    const absolute = path.join(ROOT, configuredPath);
    if (await pathType(absolute) === "missing") {
      missingPaths.push(configuredPath);
      continue;
    }
    for (const file of await listFiles(absolute)) fileSet.add(file);
  }

  const classified = Object.fromEntries(
    CATEGORIES.map((category) => [category, []]),
  );
  const referenceEvidence = [];

  for (const file of [...fileSet].sort((left, right) =>
    relativePath(left).localeCompare(relativePath(right), "en")
  )) {
    const details = await stat(file);
    const imports = [
      ...(importReferences.get(path.normalize(file)) ?? []),
    ].sort();
    const publicReferences = findPublicReferences(file, sourceFiles);
    const references = {
      imports,
      exact: publicReferences.exact,
      dynamic: publicReferences.dynamic,
    };
    const category = classify(relativePath(file), references);
    classified[category].push({
      path: relativePath(file),
      bytes: details.size,
    });
    if (
      references.imports.length > 0
      || references.exact.length > 0
      || references.dynamic.length > 0
    ) {
      referenceEvidence.push({
        path: relativePath(file),
        ...references,
      });
    }
  }

  const classifications = Object.fromEntries(CATEGORIES.map((category) => {
    const entries = classified[category];
    return [category, {
      count: entries.length,
      totalBytes: entries.reduce((total, entry) => total + entry.bytes, 0),
      paths: entries.map((entry) => entry.path),
    }];
  }));

  return {
    audit: "29-03 legacy pages delete-candidate risk audit",
    mode: "dry-run",
    scannedSourceFileCount: sourceFiles.length,
    scope: {
      candidatePaths: CANDIDATE_PATHS,
      protectedRoots: PROTECTED_ROOTS,
      missingPaths: [...new Set(missingPaths)].sort(),
    },
    summary: {
      classifications: Object.fromEntries(CATEGORIES.map((category) => [
        category,
        {
          count: classifications[category].count,
          totalBytes: classifications[category].totalBytes,
        },
      ])),
      totalClassifiedFileCount: CATEGORIES.reduce(
        (total, category) => total + classifications[category].count,
        0,
      ),
      totalClassifiedBytes: CATEGORIES.reduce(
        (total, category) => total + classifications[category].totalBytes,
        0,
      ),
    },
    classifications,
    referenceEvidence,
    deletionPerformed: false,
    finalStatus: FINAL_STATUS,
  };
}

audit()
  .then((result) => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  })
  .catch((error) => {
    console.error(JSON.stringify({
      deletionPerformed: false,
      finalStatus: "LEGACY_PAGES_DELETE_CANDIDATE_RISK_AUDIT_FAILED",
      error: error instanceof Error ? error.message : String(error),
    }, null, 2));
    process.exitCode = 1;
  });
