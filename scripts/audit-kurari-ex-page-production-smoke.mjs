import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";

const ORIGIN = "https://mitiki0720-oss.github.io";
const BASE_PATH = "/keirin-datalavo/";
const PAGE_URL = `${ORIGIN}${BASE_PATH}#ex-data-page`;
const INDEX_PUBLIC_PATH = `${BASE_PATH}data/analytics/kurari-ex/history/index.generated.json`;
const INDEX_URL = `${ORIGIN}${INDEX_PUBLIC_PATH}`;
const LOCAL_INDEX_PATH = "public/data/analytics/kurari-ex/history/index.generated.json";
const EXPECTED_INDEX_HASH = "sha256:683fd01dea2e0e5f272d35eff42bde236ba326954e857feaa9dec04f77cb3acb";
const EXPECTED_INDEX_BYTES = 14079;
const EXPECTED_LATEST_DATE = "2026-07-01";
const EXPECTED_LATEST_PATH =
  "/data/analytics/kurari-ex/history/daily/2026-07/2026-07-01.generated.json";
const TARGETS = [
  { date: "2026-07-01", raceCount: 83, mode: "NO_STARTERS", starterTotal: 0 },
  { date: "2026-06-29", raceCount: 64, mode: "STARTERS_PARSED", starterTotal: 464 },
  { date: "2026-06-30", raceCount: 76, mode: "NO_STARTERS", starterTotal: 0 },
  { date: "2026-06-21", raceCount: 61, mode: "STARTERS_PARSED", starterTotal: 451 },
];

function hashPayload(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function classifyMode(daily) {
  if (!Array.isArray(daily?.items) || daily.items.length === 0) return "UNKNOWN";
  const withStarters = daily.items.filter(
    (race) => Array.isArray(race.starters) && race.starters.length > 0,
  ).length;
  if (withStarters === daily.items.length) return "STARTERS_PARSED";
  if (withStarters === 0) return "NO_STARTERS";
  return "MIXED";
}

function dailyPublicUrl(publicPath) {
  const normalized = String(publicPath).replace(/^\/+/, "");
  return `${ORIGIN}${BASE_PATH}${normalized}`;
}

async function fetchResource(url) {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    return {
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get("content-type"),
      bytes,
      text: bytes.toString("utf8"),
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      contentType: null,
      bytes: Buffer.alloc(0),
      text: "",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function parseJson(resource, label, failures) {
  if (!resource.ok) return null;
  try {
    return JSON.parse(resource.text);
  } catch (error) {
    failures.push(`${label} returned invalid JSON: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

export async function auditKurariExPageProductionSmoke({ printOutput = true } = {}) {
  const failures = [];
  const warnings = [];

  const [pageResponse, indexResponse] = await Promise.all([
    fetchResource(PAGE_URL),
    fetchResource(INDEX_URL),
  ]);
  const index = parseJson(indexResponse, "history index", failures);
  const latest = index?.items?.find((item) => item.date === EXPECTED_LATEST_DATE) ?? null;
  const latestDailyUrl = latest?.file ? dailyPublicUrl(latest.file) : null;

  if (!pageResponse.ok) failures.push(`page unreachable: ${pageResponse.status ?? pageResponse.error}`);
  if (!indexResponse.ok) failures.push(`index unreachable: ${indexResponse.status ?? indexResponse.error}`);
  if (index && hashPayload(index) !== EXPECTED_INDEX_HASH) {
    failures.push(`production index payload hash mismatch: ${hashPayload(index)}`);
  }
  if (indexResponse.ok && indexResponse.bytes.length !== EXPECTED_INDEX_BYTES) {
    failures.push(`production index bytes mismatch: ${indexResponse.bytes.length}`);
  }
  if (index && index.items?.length !== 58) failures.push(`production index source count mismatch: ${index.items?.length}`);
  if (index && index.dayCount !== 58) failures.push(`production index day count mismatch: ${index.dayCount}`);
  if (index && index.raceCount !== 4373) failures.push(`production index race count mismatch: ${index.raceCount}`);
  if (latest?.date !== EXPECTED_LATEST_DATE) failures.push(`production latest date mismatch: ${latest?.date ?? "missing"}`);
  if (latest?.file !== EXPECTED_LATEST_PATH) failures.push(`production latest path mismatch: ${latest?.file ?? "missing"}`);

  const scriptMatch = pageResponse.text.match(/<script[^>]+src="([^"]+)"[^>]*>/u);
  const bundleUrl = scriptMatch?.[1] ? new URL(scriptMatch[1], `${ORIGIN}${BASE_PATH}`).href : null;
  const bundleResponse = bundleUrl ? await fetchResource(bundleUrl) : null;
  const deployedConsumerMarkers = Boolean(
    bundleResponse?.ok
    && bundleResponse.text.includes("KURARI EX History Overview")
    && bundleResponse.text.includes("HISTORY DATE SELECTOR"),
  );
  const localConsumerMarkers = existsSync("src/pages/ExDataPage.tsx")
    && readFileSync("src/pages/ExDataPage.tsx", "utf8").includes("KURARI EX History Overview");
  if (!deployedConsumerMarkers && localConsumerMarkers) {
    warnings.push("GitHub Pages page bundle appears stale; local history consumer markers are present");
  } else if (!deployedConsumerMarkers) {
    failures.push("history consumer markers are missing from the production bundle");
  }

  const targetDailyChecks = [];
  let noGeneratedIdentityDetected = true;
  for (const target of TARGETS) {
    const item = index?.items?.find((entry) => entry.date === target.date) ?? null;
    const url = item?.file ? dailyPublicUrl(item.file) : null;
    const response = url ? await fetchResource(url) : {
      ok: false, status: null, error: "index item missing", bytes: Buffer.alloc(0), text: "",
    };
    const daily = parseJson(response, `${target.date} daily`, failures);
    const starterTotal = daily?.items?.reduce(
      (total, race) => total + (Array.isArray(race.starters) ? race.starters.length : 0),
      0,
    ) ?? null;
    const declaredStarterCount = daily?.items?.reduce(
      (total, race) => total + (Number.isFinite(race.starterCount) ? race.starterCount : 0),
      0,
    ) ?? null;
    const mode = daily ? classifyMode(daily) : null;
    const suspiciousIdentityCount = daily?.items?.flatMap((race) => race.starters ?? [])
      .filter((starter) => /generated|fake|fuzzy/iu.test(String(starter.identityStatus ?? ""))).length ?? null;
    if ((suspiciousIdentityCount ?? 0) > 0) noGeneratedIdentityDetected = false;
    const passed = Boolean(
      response.ok
      && daily?.date === target.date
      && daily?.raceCount === target.raceCount
      && daily?.items?.length === target.raceCount
      && mode === target.mode
      && starterTotal === target.starterTotal
      && declaredStarterCount === target.starterTotal
      && suspiciousIdentityCount === 0,
    );
    if (!passed) failures.push(`${target.date} production daily check failed`);
    targetDailyChecks.push({
      date: target.date,
      url,
      reachable: response.ok,
      status: response.status,
      raceCount: daily?.raceCount ?? null,
      mode,
      starterTotal,
      starterCount: declaredStarterCount,
      suspiciousIdentityCount,
      passed,
    });
  }

  const latestCheck = targetDailyChecks.find((check) => check.date === EXPECTED_LATEST_DATE) ?? null;
  const noAutoMergeDetected = Boolean(
    bundleResponse?.ok
    && bundleResponse.text.includes("同姓同名候補の自動統合なし")
    && bundleResponse.text.includes("山口貴弘")
    && bundleResponse.text.includes("014962")
    && bundleResponse.text.includes("015023"),
  );
  if (!noGeneratedIdentityDetected) failures.push("generated/fake/fuzzy identity marker detected");
  if (!noAutoMergeDetected) failures.push("same-name non-merge production markers are missing");

  const baseUrlResolvedCorrectly = Boolean(
    scriptMatch?.[1]?.startsWith(BASE_PATH)
    && INDEX_PUBLIC_PATH.startsWith(BASE_PATH)
    && latestDailyUrl === `${ORIGIN}${BASE_PATH}${EXPECTED_LATEST_PATH.replace(/^\/+/, "")}`,
  );
  if (!baseUrlResolvedCorrectly) failures.push("GitHub Pages BASE_URL resolution failed");

  const finalStatus = failures.length
    ? "EX_PAGE_PRODUCTION_SMOKE_FAIL"
    : warnings.length
      ? "EX_PAGE_PRODUCTION_SMOKE_PASS_WITH_WARNINGS"
      : "EX_PAGE_PRODUCTION_SMOKE_PASS";

  const productionSmokeResult = {
    pageUrl: PAGE_URL,
    pageReachable: pageResponse.ok,
    pageStatus: pageResponse.status,
    pageConsumerDeployed: deployedConsumerMarkers,
    indexUrl: INDEX_URL,
    indexReachable: indexResponse.ok,
    indexStatus: indexResponse.status,
    indexHash: index ? hashPayload(index) : null,
    indexBytes: indexResponse.bytes.length,
    indexSourceCount: index?.items?.length ?? null,
    indexDays: index?.dayCount ?? null,
    indexRaceCount: index?.raceCount ?? null,
    indexLatestDate: latest?.date ?? null,
    indexLatestPath: latest?.file ?? null,
    latestDailyUrl,
    latestDailyReachable: latestCheck?.reachable ?? false,
    latestDailyDate: latestCheck?.date ?? null,
    latestDailyRaceCount: latestCheck?.raceCount ?? null,
    latestDailyMode: latestCheck?.mode ?? null,
    targetDailyChecks,
    baseUrlResolvedCorrectly,
    noGeneratedIdentityDetected,
    noAutoMergeDetected,
    warnings,
    failures,
    finalStatus,
  };
  if (printOutput) {
    console.log(JSON.stringify({ productionSmokeResult }, null, 2));
    console.log(finalStatus);
  }
  return productionSmokeResult;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await auditKurariExPageProductionSmoke();
  if (result.failures.length) process.exitCode = 1;
}
