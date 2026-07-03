import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FINAL_STATUS = "LEGACY_PAGES_UNUSED_ASSETS_AUDIT_COMPLETED";

const PROTECTED_ROOTS = [
  "public/data/reviews",
  "public/data/analytics",
  "public/data/races",
  "public/data/venues",
  "public/venues",
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

const DYNAMIC_REVIEW_ROOTS = [
  "public/data/player-cards",
];

function normalizePath(value) {
  return value.split(path.sep).join("/");
}

function relativePath(value) {
  return normalizePath(path.relative(ROOT, value));
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
  const sourceRoot = path.join(ROOT, "src");
  const files = (await listFiles(sourceRoot)).filter((file) =>
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

function buildSourceImportReferences(sourceFiles) {
  const references = new Map();
  for (const source of sourceFiles) {
    for (const specifier of extractImportSpecifiers(source.content)) {
      for (const resolved of resolveSourceImport(source.absolutePath, specifier)) {
        const normalized = path.normalize(resolved);
        if (!references.has(normalized)) references.set(normalized, new Set());
        references.get(normalized).add(source.path);
      }
    }
  }
  return references;
}

function publicUrlFor(file) {
  const relative = relativePath(file);
  if (!relative.startsWith("public/")) return null;
  return `/${relative.slice("public/".length)}`;
}

function findExactPublicReferences(file, sourceFiles) {
  const publicUrl = publicUrlFor(file);
  if (!publicUrl) return [];
  return sourceFiles
    .filter((source) => source.content.includes(publicUrl))
    .map((source) => source.path);
}

function findDynamicPublicReferences(file, sourceFiles) {
  const publicUrl = publicUrlFor(file);
  if (!publicUrl) return [];
  const references = [];
  for (const source of sourceFiles) {
    const prefixes = [...source.content.matchAll(/`([^`\r\n]*?)\$\{/gu)]
      .map((match) => match[1])
      .filter((prefix) => prefix.startsWith("/") && prefix.length >= 4);
    if (prefixes.some((prefix) => publicUrl.startsWith(prefix))) {
      references.push(source.path);
    }
  }
  return references;
}

function isUnder(file, root) {
  return file === root || file.startsWith(`${root}/`);
}

function finding(classification, file, reason, references = []) {
  return {
    path: relativePath(file),
    classification,
    reason,
    references: [...new Set(references)].sort(),
  };
}

async function audit() {
  const sourceFiles = await loadSourceFiles();
  const sourceImportReferences = buildSourceImportReferences(sourceFiles);
  const findings = {
    "still-referenced": [],
    "delete-candidate": [],
    "manual-review": [],
    protected: [],
  };
  const missingPaths = [];

  for (const configuredPath of CANDIDATE_PATHS) {
    const absolute = path.join(ROOT, configuredPath);
    const type = await pathType(absolute);
    if (type === "missing") {
      missingPaths.push(configuredPath);
      continue;
    }

    for (const file of await listFiles(absolute)) {
      const relative = relativePath(file);
      const importReferences = [
        ...(sourceImportReferences.get(path.normalize(file)) ?? []),
      ];
      const exactReferences = findExactPublicReferences(file, sourceFiles);
      const directReferences = [...new Set([
        ...importReferences,
        ...exactReferences,
      ])];

      if (directReferences.length > 0) {
        findings["still-referenced"].push(finding(
          "still-referenced",
          file,
          "Current src import or explicit public URL reference found; deletion is prohibited.",
          directReferences,
        ));
        continue;
      }

      const dynamicReferences = findDynamicPublicReferences(file, sourceFiles);
      const dynamicRoot = DYNAMIC_REVIEW_ROOTS.find((root) =>
        isUnder(relative, root)
      );
      if (dynamicReferences.length > 0 || dynamicRoot) {
        findings["manual-review"].push(finding(
          "manual-review",
          file,
          "Path may be loaded through a dynamically generated URL or runtime index; automatic deletion is prohibited.",
          dynamicReferences,
        ));
        continue;
      }

      findings["delete-candidate"].push(finding(
        "delete-candidate",
        file,
        "No current src import, explicit public URL, or recognized dynamic URL reference was found.",
      ));
    }
  }

  const protectedRoots = [];
  for (const configuredPath of PROTECTED_ROOTS) {
    const absolute = path.join(ROOT, configuredPath);
    const type = await pathType(absolute);
    if (type === "missing") {
      missingPaths.push(configuredPath);
      continue;
    }
    const files = await listFiles(absolute);
    protectedRoots.push({
      path: configuredPath,
      fileCount: files.length,
      reason: "Protected by 29-02 constraints; excluded from deletion candidacy.",
    });
    for (const file of files) {
      findings.protected.push({
        path: relativePath(file),
        classification: "protected",
      });
    }
  }

  const counts = Object.fromEntries(
    Object.entries(findings).map(([key, items]) => [key, items.length]),
  );

  return {
    audit: "29-02 legacy pages unused assets audit",
    mode: "dry-run",
    scannedSourceFileCount: sourceFiles.length,
    scope: {
      candidatePaths: CANDIDATE_PATHS,
      protectedRoots: PROTECTED_ROOTS,
      missingPaths: [...new Set(missingPaths)].sort(),
    },
    summary: {
      counts,
      totalClassifiedFileCount: Object.values(counts)
        .reduce((total, count) => total + count, 0),
      deletionPerformed: false,
    },
    findings: {
      "still-referenced": findings["still-referenced"],
      "delete-candidate": findings["delete-candidate"],
      "manual-review": findings["manual-review"],
      protectedRoots,
    },
    finalStatus: FINAL_STATUS,
  };
}

audit()
  .then((result) => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  })
  .catch((error) => {
    console.error(JSON.stringify({
      finalStatus: "LEGACY_PAGES_UNUSED_ASSETS_AUDIT_FAILED",
      error: error instanceof Error ? error.message : String(error),
    }, null, 2));
    process.exitCode = 1;
  });
