import path from "node:path";
import {
  normalizedRoot,
  readNormalizedRaces,
  writeJson,
} from "./kurari-ex-history-common.mjs";
import {
  isCompleteStarterArray,
  lineupCoversStarters,
  loadRiderIdentitySources,
  normalizeRiderName,
  resolveRiderIdentity,
} from "./kurari-ex-rider-common.mjs";

function uniqueExamples(values, limit = 30) {
  const seen = new Set();
  const examples = [];
  for (const value of values) {
    const key = JSON.stringify(value);
    if (seen.has(key)) continue;
    seen.add(key);
    examples.push(value);
    if (examples.length >= limit) break;
  }
  return examples;
}


function groupUnresolvedNames(values) {
  const grouped = new Map();

  for (const item of values) {
    const nameKey = item.nameKey || normalizeRiderName(item.name);
    if (!nameKey) continue;

    if (!grouped.has(nameKey)) {
      grouped.set(nameKey, {
        nameKey,
        displayName: item.name || nameKey,
        observationCount: 0,
        raceKeys: new Set(),
        carNos: new Set(),
        examples: [],
      });
    }

    const entry = grouped.get(nameKey);
    entry.observationCount += 1;
    if (item.raceKey) entry.raceKeys.add(item.raceKey);
    if (item.carNo !== undefined && item.carNo !== null) {
      entry.carNos.add(String(item.carNo));
    }
    if (entry.examples.length < 5) {
      entry.examples.push({
        raceKey: item.raceKey,
        carNo: item.carNo,
        name: item.name,
      });
    }
  }

  return Array.from(grouped.values())
    .map((entry) => ({
      nameKey: entry.nameKey,
      displayName: entry.displayName,
      observationCount: entry.observationCount,
      raceCount: entry.raceKeys.size,
      carNos: Array.from(entry.carNos).sort((a, b) => Number(a) - Number(b)),
      sampleRaceKeys: Array.from(entry.raceKeys).sort().slice(0, 10),
      examples: entry.examples,
      coverageStatus: "unresolved-registration-no",
      sourceType: "AUDIT_EXACT",
    }))
    .sort((left, right) => {
      if (right.observationCount !== left.observationCount) {
        return right.observationCount - left.observationCount;
      }
      return left.nameKey.localeCompare(right.nameKey, "ja");
    });
}

function groupAmbiguousNames(values) {
  const grouped = new Map();

  for (const item of values) {
    const nameKey = item.nameKey || normalizeRiderName(item.name);
    if (!nameKey) continue;

    if (!grouped.has(nameKey)) {
      grouped.set(nameKey, {
        nameKey,
        displayName: item.name || nameKey,
        observationCount: 0,
        candidates: new Set(),
        observations: [],
      });
    }

    const entry = grouped.get(nameKey);
    entry.observationCount += 1;
    for (const candidate of item.candidates || []) {
      entry.candidates.add(candidate);
    }
    entry.observations.push({
      raceKey: item.raceKey,
      carNo: item.carNo,
      name: item.name,
      candidates: item.candidates || [],
    });
  }

  return Array.from(grouped.values())
    .map((entry) => ({
      nameKey: entry.nameKey,
      displayName: entry.displayName,
      observationCount: entry.observationCount,
      candidates: Array.from(entry.candidates).sort(),
      observations: entry.observations,
      coverageStatus: "ambiguous-registration-no",
      sourceType: "AUDIT_EXACT",
    }))
    .sort((left, right) => {
      if (right.observationCount !== left.observationCount) {
        return right.observationCount - left.observationCount;
      }
      return left.nameKey.localeCompare(right.nameKey, "ja");
    });
}

function normalizePodiumName(value) {
  return normalizeRiderName(
    String(value ?? "")
      .replace(/^着\s*[:：]\s*/u, "")
      .replace(/^\d+\s*(?:SB|S|B)?\s*/u, "")
      .replace(/^(?:SB|S|B)\s+/u, ""),
  );
}

async function main() {
  const [{ races, errors }, identitySources] = await Promise.all([
    readNormalizedRaces(),
    loadRiderIdentitySources(),
  ]);
  if (errors.length) {
    throw new Error(`normalized JSONL contains ${errors.length} parse errors`);
  }

  const starterNames = new Set();
  const podiumNames = new Set();
  const resolvedRegistrationNos = new Set();
  const unresolved = [];
  const ambiguous = [];
  const directRegistrationMatches = new Set();
  const uniqueNameFallbackMatches = new Set();
  const manualOverrideMatches = new Set();

  for (const race of races) {
    for (const starter of Array.isArray(race.starters) ? race.starters : []) {
      const nameKey = normalizeRiderName(starter.nameKey ?? starter.name);
      if (nameKey) starterNames.add(nameKey);
      const identity = resolveRiderIdentity(starter, identitySources);
      if (identity.status === "registration-no") directRegistrationMatches.add(nameKey);
      if (identity.status === "unique-player-card-name") {
        uniqueNameFallbackMatches.add(nameKey);
      }
      if (identity.status === "manual-override") manualOverrideMatches.add(nameKey);
      if (identity.registrationNo) resolvedRegistrationNos.add(identity.registrationNo);
      if (identity.status === "unresolved") {
        unresolved.push({
          raceKey: race.raceKey,
          carNo: starter.carNo,
          name: starter.name,
          nameKey,
        });
      }
      if (identity.status === "ambiguous") {
        ambiguous.push({
          raceKey: race.raceKey,
          carNo: starter.carNo,
          name: starter.name,
          nameKey,
          candidates: identity.candidates,
        });
      }
    }
    for (const placement of ["first", "second", "third"]) {
      const nameKey = normalizePodiumName(race.result?.[placement]?.name);
      if (nameKey) podiumNames.add(nameKey);
    }
  }

  const racesWithStarterArray = races.filter(
    (race) => Array.isArray(race.starters) && race.starters.length > 0,
  ).length;
  const racesWithCompleteStarterArray = races.filter(isCompleteStarterArray).length;
  const unresolvedNames = groupUnresolvedNames(unresolved);
  const ambiguousNames = groupAmbiguousNames(ambiguous);

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceType: "AUDIT_EXACT",
    coverageStatus: "audit-only-fake-prohibited",
    normalizedRaceCount: races.length,
    racesWithStarterArray,
    racesWithCompleteStarterArray,
    racesWithAnyRegistrationNo: races.filter(
      (race) => Array.isArray(race.starters)
        && race.starters.some((starter) => Boolean(starter.registrationNo)),
    ).length,
    racesWithCompleteRegistrationNo: races.filter(
      (race) => isCompleteStarterArray(race)
        && race.starters.every((starter) => Boolean(starter.registrationNo)),
    ).length,
    racesWithParsedLineup: races.filter(
      (race) => race.lineup?.status === "parsed",
    ).length,
    roleEligibleRaceCount: races.filter(lineupCoversStarters).length,
    distinctStarterNameCount: starterNames.size,
    distinctPodiumNameCount: podiumNames.size,
    playerCardIndexCount: identitySources.playerCards.length,
    directRegistrationMatchCount: directRegistrationMatches.size,
    uniqueNameFallbackMatchCount: uniqueNameFallbackMatches.size,
    manualOverrideMatchCount: manualOverrideMatches.size,
    unresolvedNameCount: new Set(unresolved.map((item) => item.nameKey)).size,
    ambiguousNameCount: new Set(ambiguous.map((item) => item.nameKey)).size,
    eligiblePublicRiderCount: resolvedRegistrationNos.size,
    unresolvedObservationCount: unresolved.length,
    ambiguousObservationCount: ambiguous.length,
    registrationNoCoverage: {
      totalRaceCount: races.length,
      racesWithAnyRegistrationNo: races.filter(
        (race) => Array.isArray(race.starters)
          && race.starters.some((starter) => Boolean(starter.registrationNo)),
      ).length,
      racesWithCompleteRegistrationNo: races.filter(
        (race) => isCompleteStarterArray(race)
          && race.starters.every((starter) => Boolean(starter.registrationNo)),
      ).length,
    },
    topUnresolvedNames: unresolvedNames.slice(0, 50),
    unresolvedNames,
    ambiguousNames,
    policy: {
      fakeProhibited: true,
      unresolvedHandling: "do-not-infer-registration-no",
      note: "登録番号を一意に確認できない選手は推定補完せず、監査対象として保持する。",
    },
    warnings: [
      ...(racesWithStarterArray === 0 ? ["no starter arrays found"] : []),
      ...(unresolved.length ? [`${unresolved.length} starter observations unresolved`] : []),
      ...(ambiguous.length ? [`${ambiguous.length} starter observations ambiguous`] : []),
    ],
    unresolvedExamples: uniqueExamples(unresolved),
    ambiguousExamples: uniqueExamples(ambiguous),
  };
  const publicReport = {
    schemaVersion: report.schemaVersion,
    generatedAt: report.generatedAt,
    sourceType: report.sourceType,
    coverageStatus: report.coverageStatus,
    normalizedRaceCount: report.normalizedRaceCount,
    racesWithStarterArray: report.racesWithStarterArray,
    racesWithCompleteStarterArray: report.racesWithCompleteStarterArray,
    racesWithAnyRegistrationNo: report.racesWithAnyRegistrationNo,
    racesWithCompleteRegistrationNo: report.racesWithCompleteRegistrationNo,
    racesWithParsedLineup: report.racesWithParsedLineup,
    roleEligibleRaceCount: report.roleEligibleRaceCount,
    distinctStarterNameCount: report.distinctStarterNameCount,
    distinctPodiumNameCount: report.distinctPodiumNameCount,
    playerCardIndexCount: report.playerCardIndexCount,
    directRegistrationMatchCount: report.directRegistrationMatchCount,
    uniqueNameFallbackMatchCount: report.uniqueNameFallbackMatchCount,
    manualOverrideMatchCount: report.manualOverrideMatchCount,
    unresolvedNameCount: report.unresolvedNameCount,
    unresolvedObservationCount: report.unresolvedObservationCount,
    ambiguousNameCount: report.ambiguousNameCount,
    ambiguousObservationCount: report.ambiguousObservationCount,
    eligiblePublicRiderCount: report.eligiblePublicRiderCount,
    registrationNoCoverage: report.registrationNoCoverage,
    warnings: report.warnings,
    topUnresolvedNames: report.topUnresolvedNames,
    unresolvedNames: report.unresolvedNames,
    ambiguousNames: report.ambiguousNames,
    unresolvedExamples: report.unresolvedExamples,
    ambiguousExamples: report.ambiguousExamples,
    policy: report.policy,
  };

  await writeJson(
    path.join(normalizedRoot, "rider-coverage-audit.generated.json"),
    report,
  );
  await writeJson(
    path.join(
      process.cwd(),
      "public",
      "data",
      "analytics",
      "kurari-ex",
      "audit",
      "rider-coverage-audit.generated.json",
    ),
    publicReport,
  );

  console.log("[kurari-ex rider coverage audit]");
  for (const key of [
    "normalizedRaceCount",
    "racesWithStarterArray",
    "racesWithCompleteStarterArray",
    "racesWithAnyRegistrationNo",
    "racesWithCompleteRegistrationNo",
    "racesWithParsedLineup",
    "roleEligibleRaceCount",
    "distinctStarterNameCount",
    "distinctPodiumNameCount",
    "playerCardIndexCount",
    "directRegistrationMatchCount",
    "uniqueNameFallbackMatchCount",
    "manualOverrideMatchCount",
    "unresolvedNameCount",
    "ambiguousNameCount",
    "eligiblePublicRiderCount",
  ]) {
    console.log(`${key}: ${report[key]}`);
  }
  console.log(`warnings: ${report.warnings.length}`);
}

main().catch((error) => {
  console.error("[kurari-ex rider coverage audit] failed");
  console.error(error);
  process.exitCode = 1;
});
