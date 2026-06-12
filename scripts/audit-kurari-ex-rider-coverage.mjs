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
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
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
    warnings: [
      ...(racesWithStarterArray === 0 ? ["no starter arrays found"] : []),
      ...(unresolved.length ? [`${unresolved.length} starter observations unresolved`] : []),
      ...(ambiguous.length ? [`${ambiguous.length} starter observations ambiguous`] : []),
    ],
    unresolvedExamples: uniqueExamples(unresolved),
    ambiguousExamples: uniqueExamples(ambiguous),
  };
  await writeJson(
    path.join(normalizedRoot, "rider-coverage-audit.generated.json"),
    report,
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
