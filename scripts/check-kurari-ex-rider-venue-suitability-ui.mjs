import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pagePath = path.join(projectRoot, "src", "pages", "ExDataPage.tsx");
const dataModulePath = path.join(projectRoot, "src", "lib", "kurariExData.ts");
const riderRoot = path.join(projectRoot, "public", "data", "analytics", "kurari-ex", "exact", "riders", "by-tail");
const sampleRiders = [
  { registrationNo: "014418", qualities: ["limited", "low-sample", "unavailable"] },
  { registrationNo: "014524", qualities: ["limited", "low-sample"] },
  { registrationNo: "014867", qualities: ["unavailable"], expectsConflict: true },
  { registrationNo: "130134", qualities: ["low-sample", "unavailable"] },
];

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

function riderRelativePath(registrationNo) {
  return `data/analytics/kurari-ex/exact/riders/by-tail/${registrationNo.slice(-2)}/${registrationNo}.generated.json`;
}

async function readRider(registrationNo) {
  return JSON.parse(await readFile(path.join(riderRoot, registrationNo.slice(-2), `${registrationNo}.generated.json`), "utf8"));
}

function validateRider(payload, sample, label, errors) {
  const suitability = payload?.venueSuitability;
  assert(payload?.registrationNo === sample.registrationNo, `${label}: registrationNo mismatch`, errors);
  assert(payload?.identity?.registrationNoResolved === true, `${label}: registration identity is not exact-resolved`, errors);
  assert(suitability?.schemaVersion === 1, `${label}: venueSuitability schemaVersion missing`, errors);
  assert(suitability?.identityKey === "registrationNo", `${label}: identityKey is not registrationNo`, errors);
  assert(suitability?.sourceType === "EXACT", `${label}: sourceType is not EXACT`, errors);
  assert(Array.isArray(suitability?.items), `${label}: venueSuitability.items is not an array`, errors);
  const qualities = new Set((suitability?.items ?? []).map((item) => item.sampleQuality));
  for (const quality of sample.qualities) {
    assert(qualities.has(quality), `${label}: expected ${quality} sample is missing`, errors);
  }
  if (sample.expectsConflict) {
    assert(suitability?.excludedIdentityConflictCount > 0, `${label}: identity conflict exclusion is missing`, errors);
    assert(suitability?.excludedSettledIdentityConflictCount > 0, `${label}: settled identity conflict exclusion is missing`, errors);
  }
}

async function validatePublicBase(baseUrl, errors) {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const htmlResponse = await fetch(normalizedBase, { cache: "no-store" });
  assert(htmlResponse.ok, `public HTML returned ${htmlResponse.status}`, errors);
  const html = await htmlResponse.text();
  const assetMatch = html.match(/<script[^>]+src=["']([^"']+\.js)["']/u);
  assert(Boolean(assetMatch), "public HTML module asset was not found", errors);
  if (assetMatch) {
    const assetUrl = new URL(assetMatch[1], normalizedBase);
    const assetResponse = await fetch(assetUrl, { cache: "no-store" });
    assert(assetResponse.ok, `public asset returned ${assetResponse.status}: ${assetUrl.pathname}`, errors);
    console.log(`publicAsset=${assetUrl.pathname}`);
  }

  for (const sample of sampleRiders) {
    const url = new URL(riderRelativePath(sample.registrationNo), normalizedBase);
    const response = await fetch(url, { cache: "no-store" });
    assert(response.ok, `public rider ${sample.registrationNo} returned ${response.status}`, errors);
    if (!response.ok) continue;
    const payload = await response.json();
    validateRider(payload, sample, `public/${sample.registrationNo}`, errors);
  }
}

async function main() {
  const errors = [];
  const [pageSource, dataSource] = await Promise.all([
    readFile(pagePath, "utf8"),
    readFile(dataModulePath, "utf8"),
  ]);

  for (const marker of [
    "const openRiderDetail =",
    "setActiveView(\"player\")",
    "ex-player-detail",
    "ex-player-venue-suitability",
    "会場別適性を見る",
    "<RiderVenueSuitability rider={selectedRider} />",
    "LOW SAMPLE / 判定保留",
    "excludedIdentityConflictCount",
  ]) {
    assert(pageSource.includes(marker), `PLAYER EX UI marker missing: ${marker}`, errors);
  }
  assert(dataSource.includes("import.meta.env.BASE_URL"), "KURARI EX asset loader does not use Vite BASE_URL", errors);
  assert(!dataSource.includes('fetch("/data/analytics/kurari-ex'), "root-relative KURARI EX fetch found", errors);

  for (const sample of sampleRiders) {
    validateRider(await readRider(sample.registrationNo), sample, `local/${sample.registrationNo}`, errors);
  }

  const publicArg = process.argv.find((arg) => arg.startsWith("--base-url="));
  if (publicArg) await validatePublicBase(publicArg.slice("--base-url=".length), errors);

  if (errors.length) {
    console.error(`PLAYER venue suitability UI check failed (${errors.length})`);
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(`PLAYER venue suitability UI check passed (${sampleRiders.length} rider fixtures)`);
}

await main();
