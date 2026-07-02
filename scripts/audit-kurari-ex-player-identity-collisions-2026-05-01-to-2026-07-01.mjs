import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();
const INDEX_PATH = "public/data/analytics/kurari-ex/history/index.generated.json";
const FROM_DATE = "2026-05-01";
const TO_DATE = "2026-07-01";
const RECENT_NO_STARTERS = [
  "2026-06-25",
  "2026-06-27",
  "2026-06-28",
  "2026-06-30",
  "2026-07-01",
];
const UNKNOWN_NAMES =
  new Set(["不明", "不詳", "unknown", "tbd", "未取得", "選手不明"]);
const UNKNOWN_REGISTRATIONS =
  new Set(["", "000000", "999999", "登録番号不明"]);

function abs(file) {
  return path.isAbsolute(file) ? file : path.resolve(ROOT, file);
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/[\s　・･.]/gu, "")
    .toLowerCase();
}

function text(value) {
  return String(value ?? "").normalize("NFKC").trim();
}

function duplicateCount(values) {
  const filtered = values.filter((value) => value !== null && value !== "");
  return filtered.length - new Set(filtered).size;
}

function addMapSet(map, key, value) {
  if (!key) return;
  if (!map.has(key)) map.set(key, new Set());
  if (value !== null && value !== "") map.get(key).add(value);
}

function setValues(value) {
  return [...value].sort();
}

function hashBuffer(buffer) {
  return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
}

function print(label, value) {
  console.log(`[${label}]`);
  console.log(JSON.stringify(value, null, 2));
}

export async function auditKurariExPlayerIdentityCollisions20260501To20260701(
  { printOutput = true } = {},
) {
  const index = JSON.parse(await readFile(abs(INDEX_PATH), "utf8"));
  const historyItems =
    array(index.items).filter((item) => item.date >= FROM_DATE && item.date <= TO_DATE);
  const perRaceDuplicateCheck = [];
  const raceMappingIntegrityCheck = [];
  const registrationNames = new Map();
  const registrationRawNames = new Map();
  const registrationDates = new Map();
  const registrationVenues = new Map();
  const registrationRaceKeys = new Map();
  const normalizedNameRegistrations = new Map();
  const normalizedNameRawNames = new Map();
  let checkedStarterCount = 0;
  let unknownPlayerCount = 0;
  let unknownRegistrationNoCount = 0;
  let placeholderNameCount = 0;
  let fakeLikeRegistrationNoCount = 0;
  let generatedIdentitySuspicionCount = 0;
  let crossDateStarterDetectedCount = 0;
  let crossVenueStarterDetectedCount = 0;
  let crossRaceStarterDetectedCount = 0;

  for (const historyItem of historyItems) {
    const file = `public${historyItem.file}`;
    const daily = JSON.parse(await readFile(abs(file), "utf8"));
    for (const race of array(daily.items)) {
      const starters = array(race.starters);
      checkedStarterCount += starters.length;
      const cars = starters.map((starter) => starter.carNo ?? null);
      const registrations =
        starters.map((starter) => text(starter.registrationNo));
      const normalizedNames =
        starters.map((starter) => normalizeName(starter.name));
      const carRegistrations = new Map();
      const registrationCars = new Map();
      for (const starter of starters) {
        const car = starter.carNo == null ? "" : String(starter.carNo);
        const registration = text(starter.registrationNo);
        addMapSet(carRegistrations, car, registration);
        addMapSet(registrationCars, registration, car);
        const rawName = text(starter.name);
        const normalizedName = normalizeName(rawName);
        if (!rawName || UNKNOWN_NAMES.has(normalizedName)) {
          unknownPlayerCount += 1;
          placeholderNameCount += 1;
        }
        if (!registration || UNKNOWN_REGISTRATIONS.has(registration.toLowerCase())) {
          unknownRegistrationNoCount += 1;
        }
        if (["000000", "999999"].includes(registration)) {
          fakeLikeRegistrationNoCount += 1;
        }
        if (/generated|inferred|synthetic|fake/iu.test(text(starter.identityStatus))) {
          generatedIdentitySuspicionCount += 1;
        }
        if (registration) {
          addMapSet(registrationNames, registration, normalizedName);
          addMapSet(registrationRawNames, registration, rawName);
          addMapSet(registrationDates, registration, race.date);
          addMapSet(registrationVenues, registration, race.venueKey || race.venueName);
          addMapSet(registrationRaceKeys, registration, race.raceKey);
        }
        if (normalizedName && registration) {
          addMapSet(normalizedNameRegistrations, normalizedName, registration);
          addMapSet(normalizedNameRawNames, normalizedName, rawName);
        }
      }
      const duplicateCarNoCount = duplicateCount(cars);
      const duplicateRegistrationNoCount = duplicateCount(registrations);
      const duplicatePlayerNameCount = duplicateCount(normalizedNames);
      const carMapsToMultipleRegistrations =
        [...carRegistrations.values()].filter((values) => values.size > 1).length;
      const registrationMapsToMultipleCars =
        [...registrationCars.values()].filter((values) => values.size > 1).length;
      const raceFail = [
        duplicateCarNoCount,
        duplicateRegistrationNoCount,
        carMapsToMultipleRegistrations,
        registrationMapsToMultipleCars,
      ].some((count) => count > 0);
      perRaceDuplicateCheck.push({
        date: race.date,
        venueKey: race.venueKey,
        venueName: race.venueName,
        raceNumber: race.raceNumber,
        raceKey: race.raceKey,
        starterCount: starters.length,
        duplicateCarNoCount,
        duplicateRegistrationNoCount,
        duplicatePlayerNameCount,
        missingCarNoCount: cars.filter((value) => value == null).length,
        missingRegistrationNoCount: registrations.filter((value) => !value).length,
        missingPlayerNameCount: normalizedNames.filter((value) => !value).length,
        carMapsToMultipleRegistrations,
        registrationMapsToMultipleCars,
        status: raceFail ? "FAIL" : "OK",
      });

      let crossDateStarterDetected = false;
      let crossVenueStarterDetected = false;
      let crossRaceStarterDetected = false;
      for (const starter of starters) {
        if (starter.date != null && text(starter.date) !== text(race.date)) {
          crossDateStarterDetected = true;
        }
        if (
          starter.venueKey != null
          && text(starter.venueKey) !== text(race.venueKey)
        ) crossVenueStarterDetected = true;
        if (
          starter.venueName != null
          && text(starter.venueName) !== text(race.venueName)
        ) crossVenueStarterDetected = true;
        if (
          starter.raceNumber != null
          && Number(starter.raceNumber) !== Number(race.raceNumber)
        ) crossRaceStarterDetected = true;
      }
      if (crossDateStarterDetected) crossDateStarterDetectedCount += 1;
      if (crossVenueStarterDetected) crossVenueStarterDetectedCount += 1;
      if (crossRaceStarterDetected) crossRaceStarterDetectedCount += 1;
      raceMappingIntegrityCheck.push({
        date: race.date,
        venueKey: race.venueKey,
        raceNumber: race.raceNumber,
        raceKey: race.raceKey,
        allStartersDateMatched: !crossDateStarterDetected,
        allStartersVenueMatched: !crossVenueStarterDetected,
        allStartersRaceNumberMatched: !crossRaceStarterDetected,
        crossDateStarterDetected,
        crossVenueStarterDetected,
        crossRaceStarterDetected,
        status:
          crossDateStarterDetected || crossVenueStarterDetected || crossRaceStarterDetected
            ? "FAIL"
            : "OK",
      });
    }
  }

  const registrationIdentityCollisionCheck = [];
  for (const [registrationNo, normalizedNames] of registrationNames) {
    const rawNames = registrationRawNames.get(registrationNo) ?? new Set();
    const normalizedCollision = normalizedNames.size > 1;
    const rawVariantOnly = !normalizedCollision && rawNames.size > 1;
    registrationIdentityCollisionCheck.push({
      registrationNo,
      normalizedNames: setValues(normalizedNames),
      rawNames: setValues(rawNames),
      dates: setValues(registrationDates.get(registrationNo) ?? new Set()),
      venues: setValues(registrationVenues.get(registrationNo) ?? new Set()),
      raceKeys: setValues(registrationRaceKeys.get(registrationNo) ?? new Set()),
      collisionType:
        normalizedCollision ? "SAME_REGISTRATION_MULTIPLE_NAMES" : "NONE",
      status: normalizedCollision ? "FAIL" : rawVariantOnly ? "WARN" : "OK",
    });
  }
  const normalizedNameCollisionCandidates = [];
  for (const [normalizedName, registrations] of normalizedNameRegistrations) {
    if (registrations.size <= 1) continue;
    normalizedNameCollisionCandidates.push({
      normalizedName,
      rawNames: setValues(normalizedNameRawNames.get(normalizedName) ?? new Set()),
      registrationNos: setValues(registrations),
      collisionType: "SAME_NORMALIZED_NAME_MULTIPLE_REGISTRATIONS",
      status: "WARN",
    });
  }
  const sameRegistrationMultipleNames =
    registrationIdentityCollisionCheck.filter(
      (item) => item.collisionType === "SAME_REGISTRATION_MULTIPLE_NAMES",
    );
  const rawNameVariantWarnings =
    registrationIdentityCollisionCheck.filter((item) => item.status === "WARN");
  const generatedIdentitySuspicionCheck = {
    generatedRegistrationNoFound: generatedIdentitySuspicionCount > 0,
    generatedNameFound: generatedIdentitySuspicionCount > 0,
    generatedCarNoFound: generatedIdentitySuspicionCount > 0,
    placeholderNameFound: placeholderNameCount > 0,
    unknownPlayerNameFound: unknownPlayerCount > 0,
    unknownRegistrationNoFound: unknownRegistrationNoCount > 0,
    fakeLikeRegistrationNoFound: fakeLikeRegistrationNoCount > 0,
    generatedIdentitySuspicionCount,
    placeholderNameCount,
    unknownPlayerCount,
    unknownRegistrationNoCount,
    fakeLikeRegistrationNoCount,
    status:
      generatedIdentitySuspicionCount || fakeLikeRegistrationNoCount
        ? "FAIL"
        : unknownPlayerCount || unknownRegistrationNoCount
          ? "WARN"
          : "OK",
  };
  const duplicateCarNoInSameRaceCount =
    perRaceDuplicateCheck.reduce((sum, item) => sum + item.duplicateCarNoCount, 0);
  const duplicateRegistrationNoInSameRaceCount =
    perRaceDuplicateCheck.reduce(
      (sum, item) => sum + item.duplicateRegistrationNoCount,
      0,
    );
  const duplicatePlayerNameInSameRaceCount =
    perRaceDuplicateCheck.reduce(
      (sum, item) => sum + item.duplicatePlayerNameCount,
      0,
    );
  const date20260629File =
    "public/data/analytics/kurari-ex/history/daily/2026-06/2026-06-29.generated.json";
  const date20260629 = JSON.parse(await readFile(abs(date20260629File), "utf8"));
  const date20260629StarterTotal =
    array(date20260629.items).flatMap((race) => array(race.starters)).length;
  const current20260629 = await readFile(abs(date20260629File));
  const head20260629 = Buffer.from(execFileSync(
    "git",
    ["show", `HEAD:${date20260629File}`],
    { cwd: ROOT, encoding: "buffer", maxBuffer: 5 * 1024 * 1024 },
  ));
  const recentNoStartersHaveNoStarters = RECENT_NO_STARTERS.every((date) => {
    const check = perRaceDuplicateCheck.filter((item) => item.date === date);
    return check.length > 0 && check.every((item) => item.starterCount === 0);
  });
  const recentBatchCollisionCheck = {
    recentNoStartersDates: RECENT_NO_STARTERS,
    recentNoStartersHaveNoStarters,
    recentNoStartersCreatedPlayerIdentity: !recentNoStartersHaveNoStarters,
    date20260629StarterTotal,
    date20260629Unchanged: hashBuffer(current20260629) === hashBuffer(head20260629),
  };
  recentBatchCollisionCheck.status = [
    recentBatchCollisionCheck.recentNoStartersHaveNoStarters,
    !recentBatchCollisionCheck.recentNoStartersCreatedPlayerIdentity,
    date20260629StarterTotal === 464,
    recentBatchCollisionCheck.date20260629Unchanged,
  ].every(Boolean) ? "OK" : "FAIL";

  const fail = [
    duplicateCarNoInSameRaceCount,
    duplicateRegistrationNoInSameRaceCount,
    sameRegistrationMultipleNames.length,
    crossDateStarterDetectedCount,
    crossVenueStarterDetectedCount,
    crossRaceStarterDetectedCount,
    generatedIdentitySuspicionCount,
    fakeLikeRegistrationNoCount,
    recentBatchCollisionCheck.status === "FAIL" ? 1 : 0,
  ].some((count) => count > 0);
  const warningCount =
    rawNameVariantWarnings.length
    + normalizedNameCollisionCandidates.length
    + unknownPlayerCount
    + unknownRegistrationNoCount
    + duplicatePlayerNameInSameRaceCount;
  const summary = {
    auditStatus: fail
      ? "PLAYER_IDENTITY_COLLISION_AUDIT_FAIL"
      : warningCount > 0
        ? "PLAYER_IDENTITY_COLLISION_AUDIT_OK_WITH_WARNINGS"
        : "PLAYER_IDENTITY_COLLISION_AUDIT_OK",
    checkedHistoryDailyCount: historyItems.length,
    checkedRaceCount: perRaceDuplicateCheck.length,
    checkedStarterCount,
    duplicateCarNoInSameRaceCount,
    duplicateRegistrationNoInSameRaceCount,
    duplicatePlayerNameInSameRaceCount,
    registrationNoNameCollisionCount: sameRegistrationMultipleNames.length,
    normalizedNameMultipleRegistrationCandidateCount:
      normalizedNameCollisionCandidates.length,
    rawNameVariantWarningCount: rawNameVariantWarnings.length,
    crossDateStarterDetectedCount,
    crossVenueStarterDetectedCount,
    crossRaceStarterDetectedCount,
    generatedIdentitySuspicionCount,
    unknownPlayerCount,
    unknownRegistrationNoCount,
    fakeLikeRegistrationNoCount,
    date20260629StarterTotal,
    date20260629Unchanged: recentBatchCollisionCheck.date20260629Unchanged,
    recentNoStartersCreatedPlayerIdentity:
      recentBatchCollisionCheck.recentNoStartersCreatedPlayerIdentity,
    warningCount,
    writePerformed: false,
  };
  const jsonSummary = {
    auditStatus: summary.auditStatus,
    checkedStarterCount,
    failCollisionCount:
      duplicateCarNoInSameRaceCount
      + duplicateRegistrationNoInSameRaceCount
      + sameRegistrationMultipleNames.length,
    warningCount,
    writePerformed: false,
  };
  if (printOutput) {
    print("summary", summary);
    print("perRaceDuplicateCheck", perRaceDuplicateCheck);
    print("registrationIdentityCollisionCheck", registrationIdentityCollisionCheck);
    print("normalizedNameCollisionCandidates", normalizedNameCollisionCandidates);
    print("raceMappingIntegrityCheck", raceMappingIntegrityCheck);
    print("generatedIdentitySuspicionCheck", generatedIdentitySuspicionCheck);
    print("recentBatchCollisionCheck", recentBatchCollisionCheck);
    print("jsonSummary", jsonSummary);
  }
  if (fail && printOutput) process.exitCode = 1;
  return {
    summary,
    perRaceDuplicateCheck,
    registrationIdentityCollisionCheck,
    normalizedNameCollisionCandidates,
    raceMappingIntegrityCheck,
    generatedIdentitySuspicionCheck,
    recentBatchCollisionCheck,
    jsonSummary,
  };
}

const isMain =
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  auditKurariExPlayerIdentityCollisions20260501To20260701().catch((error) => {
    console.error("[kurari-ex player identity collision audit] failed");
    console.error(error);
    process.exitCode = 1;
  });
}
