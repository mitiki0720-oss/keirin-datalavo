import { readFile, unlink } from "node:fs/promises";
import path from "node:path";
import {
  collectFiles,
  exactOutputRoot,
  rateMetric,
  readKurariExRaces,
  relativeProjectPath,
  serializeJson,
  writeJson,
} from "./kurari-ex-history-common.mjs";
import {
  isCompleteStarterArray,
  loadRiderIdentitySources,
  resolveLineupRole,
  resolveRiderIdentity,
  riderExactRoot as defaultRiderExactRoot,
} from "./kurari-ex-rider-common.mjs";

const args = process.argv.slice(2);
const getArg = (name, fallback = "") => (
  args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1)
  ?? fallback
);
const source = getArg("--source", "history");
const riderExactRoot = path.resolve(getArg("--output-root", defaultRiderExactRoot));
const requestedGeneratedAt = getArg("--generated-at");
const riderMasterPath = path.join(exactOutputRoot, "rider-master.generated.json");

function emptyAggregate() {
  return {
    starts: 0,
    wins: 0,
    seconds: 0,
    thirds: 0,
    resultParsedCount: 0,
    escapeWins: 0,
    sprintWins: 0,
    differenceWins: 0,
  };
}

function addObservation(aggregate, observation) {
  aggregate.starts += 1;
  if (observation.resultParsed) aggregate.resultParsedCount += 1;
  if (observation.placement === 1) aggregate.wins += 1;
  if (observation.placement === 2) aggregate.seconds += 1;
  if (observation.placement === 3) aggregate.thirds += 1;
  if (observation.placement === 1 && observation.winningMethod === "逃") {
    aggregate.escapeWins += 1;
  }
  if (observation.placement === 1 && observation.winningMethod === "捲") {
    aggregate.sprintWins += 1;
  }
  if (observation.placement === 1 && observation.winningMethod === "差") {
    aggregate.differenceWins += 1;
  }
}

function unavailableMetric(count) {
  return {
    count,
    total: null,
    rate: null,
    sourceType: "EXACT",
    quality: "unavailable",
  };
}

function summarizeAggregate(aggregate, key = {}) {
  const podiums = aggregate.wins + aggregate.seconds + aggregate.thirds;
  const completeResults = aggregate.resultParsedCount === aggregate.starts;
  const outside = completeResults ? aggregate.starts - podiums : null;
  return {
    ...key,
    starts: aggregate.starts,
    wins: aggregate.wins,
    seconds: aggregate.seconds,
    thirds: aggregate.thirds,
    outside,
    winRate: completeResults
      ? rateMetric([
          ...Array(aggregate.wins).fill(true),
          ...Array(aggregate.starts - aggregate.wins).fill(false),
        ])
      : unavailableMetric(aggregate.wins),
    top2Rate: completeResults
      ? rateMetric([
          ...Array(aggregate.wins + aggregate.seconds).fill(true),
          ...Array(aggregate.starts - aggregate.wins - aggregate.seconds).fill(false),
        ])
      : unavailableMetric(aggregate.wins + aggregate.seconds),
    top3Rate: completeResults
      ? rateMetric([
          ...Array(podiums).fill(true),
          ...Array(outside).fill(false),
        ])
      : unavailableMetric(podiums),
    sourceType: "EXACT",
  };
}

function aggregateBy(observations, selector, keyBuilder) {
  const groups = new Map();
  for (const observation of observations) {
    const key = selector(observation);
    if (!key) continue;
    const aggregate = groups.get(key) ?? emptyAggregate();
    addObservation(aggregate, observation);
    groups.set(key, aggregate);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, aggregate]) => summarizeAggregate(aggregate, keyBuilder(key, observations)));
}

const bankLengthByVenueKey = {
  aomori: 400,
  beppu: 400,
  gifu: 400,
  hakodate: 400,
  hiratsuka: 400,
  hiroshima: 400,
  hofu: 333,
  ito: 333,
  iwakitaira: 400,
  keiokaku: 400,
  kishiwada: 400,
  kochi: 500,
  kokura: 400,
  komatsushima: 400,
  kumamoto: 500,
  kurume: 400,
  maebashi: 333,
  matsudo: 333,
  matsusaka: 400,
  matsuyama: 400,
  nagoya: 400,
  nara: 333,
  odawara: 333,
  ogaki: 400,
  omiya: 500,
  seibuen: 400,
  shizuoka: 400,
  takeo: 400,
  tamano: 400,
  toride: 400,
  toyama: 333,
  toyohashi: 400,
  utsunomiya: 500,
  wakayama: 400,
  yahiko: 400,
};

const raceStageLabels = {
  qualifying: "予選",
  "semi-final": "準決勝",
  final: "決勝",
  consolation: "一般・敗者戦",
  "seed-special": "特選・シード",
  unknown: "不明",
};

const weatherConditionLabels = {
  sunny: "晴れ",
  cloudy: "曇り",
  rain: "雨",
  snow: "雪",
  unknown: "不明",
};

function classifyRaceStage(race) {
  const text = String(`${race?.raceTitle ?? ""} ${race?.raceClass ?? ""} ${race?.grade ?? ""}`).normalize("NFKC");

  if (/決勝/u.test(text)) return "final";
  if (/準決/u.test(text)) return "semi-final";
  if (/一般|特一般|敗者|負け戦/u.test(text)) return "consolation";
  if (/特選|優秀|選抜|シード/u.test(text)) return "seed-special";
  if (/予選|特予選/u.test(text)) return "qualifying";
  return "unknown";
}

function normalizeWeatherCondition(value) {
  const text = String(value ?? "").normalize("NFKC").trim();

  if (!text || /不明|未取得|なし/u.test(text)) return "unknown";
  if (/雪/u.test(text)) return "snow";
  if (/雨|霧雨/u.test(text)) return "rain";
  if (/曇|くもり/u.test(text)) return "cloudy";
  if (/晴|快晴/u.test(text)) return "sunny";
  return "unknown";
}

function buildRoleMetric(observations, role) {
  const roleObservations = observations.filter((item) => item.role === role);
  if (!roleObservations.length) return null;
  const aggregate = emptyAggregate();
  for (const observation of roleObservations) addObservation(aggregate, observation);
  const metric = summarizeAggregate(aggregate);
  if (role === "bante") {
    metric.differenceWinRate = rateMetric(
      roleObservations.map(
        (item) => item.placement === 1 && item.winningMethod === "差",
      ),
    );
  }
  return metric;
}

function qualityFor(observations) {
  if (!observations.length) return "identity-only";
  if (observations.length < 5) return "low-sample";
  const completeResults = observations.every((item) => item.resultParsed);
  const roleEligible = observations.every((item) => item.roleEligible);
  return completeResults && roleEligible ? "complete" : "partial";
}

function normalizeMasterRegistrationNo(value) {
  const text = String(value ?? "").replace(/[^\d]/gu, "");
  return /^\d{6}$/u.test(text) ? text : "";
}

function normalizeMasterNameKey(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/gu, "")
    .trim();
}

async function loadRiderMasterItems() {
  try {
    const payload = JSON.parse(await readFile(riderMasterPath, "utf8"));
    return Array.isArray(payload?.items) ? payload.items : [];
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

function identityFromRiderMasterItem(item) {
  const registrationNo = normalizeMasterRegistrationNo(item.registrationNo);
  if (!registrationNo) return null;

  const name = item.currentName || item.name || "";
  const nameKey = item.currentNameKey || item.nameKey || normalizeMasterNameKey(name);

  return {
    registrationNo,
    name,
    nameKey,
    status: item.status === "active" ? "rider-master-active" : "rider-master",
    card: {
      registrationNo,
      id: registrationNo,
      name,
      nameKey,
      prefecture: item.currentPrefecture || "",
      class: item.currentClass || "",
      grade: item.currentClass || "",
      style: item.currentStyle || "",
      kana: item.currentKana || "",
      region: item.currentRegion || "",
      source: "rider-master",
      status: item.status || "unknown",
    },
  };
}

function addRiderMasterIdentityOnlyEntries(observationsByRider, riderMasterItems) {
  let added = 0;

  for (const item of riderMasterItems) {
    const identity = identityFromRiderMasterItem(item);
    if (!identity?.registrationNo) continue;
    if (observationsByRider.has(identity.registrationNo)) continue;

    observationsByRider.set(identity.registrationNo, {
      identity,
      observations: [],
    });

    added += 1;
  }

  return added;
}

async function main() {
  const [{ races, errors }, identitySources, riderMasterItems] = await Promise.all([
    readKurariExRaces(source),
    loadRiderIdentitySources(),
    loadRiderMasterItems(),
  ]);
  if (errors.length) {
    throw new Error(`${source} contains ${errors.length} parse errors`);
  }

  const observationsByRider = new Map();
  for (const race of races) {
    if (!isCompleteStarterArray(race)) continue;
    for (const starter of race.starters) {
      const identity = resolveRiderIdentity(starter, identitySources, race);
      if (!identity.registrationNo || ["unresolved", "ambiguous"].includes(identity.status)) {
        continue;
      }
      const placement = ["first", "second", "third"]
        .findIndex((key) => race.result?.[key]?.carNo === starter.carNo) + 1;
      const observations = observationsByRider.get(identity.registrationNo) ?? {
        identity,
        observations: [],
      };
      observations.observations.push({
        date: race.date,
        venueKey: race.venueKey,
        venueName: race.venueName,
        bankLength: bankLengthByVenueKey[race.venueKey] ?? null,
        timeslot: race.timeslot || "unknown",
        raceClass: race.raceClass || "unknown",
        raceStage: classifyRaceStage(race),
        weatherCondition: normalizeWeatherCondition(race.weather?.condition),
        resultParsed: race.quality?.resultParsed === true,
        placement: placement || null,
        winningMethod: placement === 1 ? race.result.first.winningMethod : "",
        carNo: String(starter.carNo || "unknown"),
        role: resolveLineupRole(race, starter.carNo),
        roleEligible: resolveLineupRole(race, starter.carNo) != null,
      });
      observationsByRider.set(identity.registrationNo, observations);
    }
  }

  const identityOnlyRiderCount = addRiderMasterIdentityOnlyEntries(
    observationsByRider,
    riderMasterItems,
  );

  if (!observationsByRider.size) {
    throw new Error("no safely resolved riders or rider-master identities");
  }

  const generatedAt = requestedGeneratedAt || new Date().toISOString();
  const indexItems = [];
  const expectedRiderFiles = new Set();
  const qualityCounts = {
    complete: 0,
    partial: 0,
    "low-sample": 0,
    "identity-only": 0,
  };
  let totalBytes = 0;
  let maxFileBytes = 0;
  let changedDataFileCount = 0;

  for (const [registrationNo, entry] of [...observationsByRider.entries()].sort()) {
    const { identity, observations } = entry;
    const dates = observations.map((item) => item.date).filter(Boolean).sort();
    const overallAggregate = emptyAggregate();
    for (const observation of observations) addObservation(overallAggregate, observation);
    const roleEligibleCount = observations.filter((item) => item.roleEligible).length;
    const quality = qualityFor(observations);
    qualityCounts[quality] += 1;
    const card = identity.card;
    const payload = {
      schemaVersion: 1,
      registrationNo,
      name: card?.name ?? identity.name,
      nameKey: identity.nameKey,
      sourceType: "EXACT",
      generatedAt,
      period: { from: dates[0] ?? null, to: dates.at(-1) ?? null },
      identity: {
        status: identity.status,
        registrationNoResolved: true,
      },
      coverage: {
        observedRaceCount: observations.length,
        confirmedStartCount: observations.length,
        resultParsedCount: observations.filter((item) => item.resultParsed).length,
        roleEligibleCount,
        venueCount: new Set(observations.map((item) => item.venueKey)).size,
      },
      overall: summarizeAggregate(overallAggregate),
      winningMethods: {
        escape: {
          count: overallAggregate.escapeWins,
          total: overallAggregate.wins,
          rate: overallAggregate.wins
            ? Number(((overallAggregate.escapeWins / overallAggregate.wins) * 100).toFixed(1))
            : null,
          sourceType: "EXACT",
        },
        sprint: {
          count: overallAggregate.sprintWins,
          total: overallAggregate.wins,
          rate: overallAggregate.wins
            ? Number(((overallAggregate.sprintWins / overallAggregate.wins) * 100).toFixed(1))
            : null,
          sourceType: "EXACT",
        },
        difference: {
          count: overallAggregate.differenceWins,
          total: overallAggregate.wins,
          rate: overallAggregate.wins
            ? Number(((overallAggregate.differenceWins / overallAggregate.wins) * 100).toFixed(1))
            : null,
          sourceType: "EXACT",
        },
      },
      byVenue: aggregateBy(
        observations,
        (item) => item.venueKey,
        (venueKey, source) => ({
          venueKey,
          venueName: source.find((item) => item.venueKey === venueKey)?.venueName ?? "",
        }),
      ),
      byTimeslot: aggregateBy(
        observations,
        (item) => item.timeslot,
        (timeslot) => ({ timeslot }),
      ),
      byCarNo: aggregateBy(
        observations,
        (item) => item.carNo || "unknown",
        (carNo) => ({
          carNo,
          carNoLabel: carNo === "unknown" ? "未取得" : `${carNo}番車`,
        }),
      ),
      byClass: aggregateBy(
        observations,
        (item) => item.raceClass,
        (raceClass) => ({ raceClass }),
      ),
      byRaceStage: aggregateBy(
        observations,
        (item) => item.raceStage,
        (raceStage) => ({
          raceStage,
          raceStageLabel: raceStageLabels[raceStage] ?? raceStage,
        }),
      ),
      byWeather: aggregateBy(
        observations,
        (item) => item.weatherCondition,
        (weatherCondition) => ({
          weatherCondition,
          weatherLabel: weatherConditionLabels[weatherCondition] ?? weatherCondition,
        }),
      ),
      byBankLength: aggregateBy(
        observations,
        (item) => item.bankLength ? String(item.bankLength) : "unknown",
        (bankLength) => ({
          bankLength: bankLength === "unknown" ? null : Number(bankLength),
          bankLengthLabel: bankLength === "unknown" ? "未取得" : `${bankLength}m`,
        }),
      ),
      byRole: {
        front: buildRoleMetric(observations, "front"),
        bante: buildRoleMetric(observations, "bante"),
        third: buildRoleMetric(observations, "third"),
        single: buildRoleMetric(observations, "single"),
      },
      quality,
      warnings: [
        ...(observations.length < 5 ? ["confirmedStartCount below 5"] : []),
        ...(roleEligibleCount < observations.length ? ["role unavailable for some starts"] : []),
      ],
    };
    const tail = registrationNo.slice(-2);
    const relativeFile = `by-tail/${tail}/${registrationNo}.generated.json`;
    const file = path.join(riderExactRoot, relativeFile);
    expectedRiderFiles.add(path.resolve(file));
    const result = await writeJson(file, payload);
    changedDataFileCount += Number(result.changed);
    const bytes = Buffer.byteLength(serializeJson(result.value));
    totalBytes += bytes;
    maxFileBytes = Math.max(maxFileBytes, bytes);
    indexItems.push({
      registrationNo,
      name: payload.name,
      nameKey: payload.nameKey,
      prefecture: card?.prefecture ?? "",
      class: card?.class ?? card?.grade ?? "",
      file: `/data/analytics/kurari-ex/exact/riders/${relativeFile}`,
      observedRaceCount: observations.length,
      confirmedStartCount: observations.length,
      roleEligibleCount,
      quality,
    });
  }
  const staleRiderFiles = await collectFiles(
    path.join(riderExactRoot, "by-tail"),
    (file) => file.endsWith(".generated.json"),
  );
  for (const file of staleRiderFiles) {
    if (!expectedRiderFiles.has(path.resolve(file))) {
      await unlink(file);
      changedDataFileCount += 1;
    }
  }

  const allDates = [...observationsByRider.values()]
    .flatMap((entry) => entry.observations.map((item) => item.date))
    .filter(Boolean)
    .sort();
  const index = {
    schemaVersion: 1,
    generatedAt,
    sourceType: "EXACT",
    riderCount: indexItems.length,
    riderMasterCount: riderMasterItems.length,
    identityOnlyRiderCount,
    period: { from: allDates[0] ?? null, to: allDates.at(-1) ?? null },
    items: indexItems,
  };
  const indexResult = await writeJson(
    path.join(riderExactRoot, "index.generated.json"),
    index,
    { reuseTimestamps: changedDataFileCount === 0 },
  );
  index.generatedAt = indexResult.value.generatedAt;
  const indexBytes = Buffer.byteLength(serializeJson(indexResult.value));
  totalBytes += indexBytes;

  const status = {
    schemaVersion: 1,
    generatedAt,
    sourceType: "EXACT",
    normalizedRaceCount: races.length,
    riderCount: indexItems.length,
    riderMasterCount: riderMasterItems.length,
    identityOnlyRiderCount,
    qualityCounts,
    outputFileCount: indexItems.length + 2,
    outputBytes: totalBytes,
    maxFileBytes,
    source: `${source}-history`,
  };
  for (let index = 0; index < 3; index += 1) {
    status.outputBytes = totalBytes + Buffer.byteLength(serializeJson(status));
  }
  const statusResult = await writeJson(
    path.join(riderExactRoot, "status.generated.json"),
    status,
    { reuseTimestamps: changedDataFileCount === 0 && !indexResult.changed },
  );

  console.log("[kurari-ex rider exact generate]");
  console.log(`source: ${source}`);
  console.log(`riders: ${indexItems.length}`);
  console.log(`riderMasterCount: ${riderMasterItems.length}`);
  console.log(`identityOnlyRiderCount: ${identityOnlyRiderCount}`);
  console.log(`period: ${index.period.from} to ${index.period.to}`);
  console.log(`quality: ${JSON.stringify(qualityCounts)}`);
  console.log(`files changed: ${
    changedDataFileCount + Number(indexResult.changed) + Number(statusResult.changed)
  }`);
  console.log(`output: ${(status.outputBytes / 1024).toFixed(1)} KB`);
  console.log(`max file: ${(maxFileBytes / 1024).toFixed(1)} KB`);
  console.log(`root: ${relativeProjectPath(riderExactRoot)}`);
}

main().catch((error) => {
  console.error("[kurari-ex rider exact generate] failed");
  console.error(error);
  process.exitCode = 1;
});
