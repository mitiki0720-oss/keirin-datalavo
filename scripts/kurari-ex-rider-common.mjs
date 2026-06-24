import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  privateRoot,
  projectRoot,
} from "./kurari-ex-history-common.mjs";

export const playerCardIndexPath = path.join(
  projectRoot,
  "public",
  "data",
  "player-cards",
  "index.json",
);
export const riderOverridePath = path.join(
  privateRoot,
  "mappings",
  "rider-registration-overrides.json",
);
export const riderRaceOverridePath = path.join(
  projectRoot,
  "scripts",
  "kurari-ex-rider-race-overrides.json",
);
export const officialRiderSupplementPath = path.join(
  projectRoot,
  "public",
  "data",
  "analytics",
  "kurari-ex",
  "exact",
  "official-rider-identity.generated.json",
);
export const riderExactRoot = path.join(
  projectRoot,
  "public",
  "data",
  "analytics",
  "kurari-ex",
  "exact",
  "riders",
);
export const keirinJpEntriesPath = path.join(
  projectRoot,
  "public",
  "data",
  "races",
  "keirin-jp-entries.generated.json",
);
export const keirinJpResultsPath = path.join(
  projectRoot,
  "public",
  "data",
  "races",
  "keirin-jp-results.generated.json",
);

export function normalizeRiderName(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\s\u3000・･.．]/gu, "")
    .trim();
}

export function normalizeRegistrationNo(value) {
  const digits = String(value ?? "").replace(/\D/gu, "");
  return /^\d{6}$/u.test(digits) ? digits : null;
}

async function loadOfficialRiderSupplement() {
  try {
    const payload = JSON.parse(await readFile(officialRiderSupplementPath, "utf8"));
    return Array.isArray(payload?.items) ? payload.items : [];
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function loadKeirinJpFeedIdentityCards() {
  const files = [
    { file: keirinJpEntriesPath, source: "keirin-jp-entries" },
    { file: keirinJpResultsPath, source: "keirin-jp-results" },
  ];

  const byNameKey = new Map();

  function addRecord(raw, source) {
    const name = String(raw?.name ?? raw?.riderName ?? raw?.playerName ?? "").trim();
    const registrationNo = normalizeRegistrationNo(raw?.registrationNo ?? raw?.registrationNumber ?? raw?.regNo);
    const nameKey = normalizeRiderName(name);

    if (!name || !nameKey || !registrationNo) return;

    const group = byNameKey.get(nameKey) ?? {
      nameKey,
      displayName: name,
      registrations: new Map(),
      sources: new Set(),
    };

    if (!group.registrations.has(registrationNo)) {
      group.registrations.set(registrationNo, {
        id: registrationNo,
        registrationNo,
        name,
        source,
        identitySource: "keirin-jp-feed",
      });
    }

    group.sources.add(source);
    byNameKey.set(nameKey, group);
  }

  function visit(value, source, depth = 0) {
    if (depth > 12) return;

    if (Array.isArray(value)) {
      for (const item of value) visit(item, source, depth + 1);
      return;
    }

    if (!value || typeof value !== "object") return;

    addRecord(value, source);

    for (const child of Object.values(value)) {
      visit(child, source, depth + 1);
    }
  }

  for (const { file, source } of files) {
    try {
      const payload = JSON.parse(await readFile(file, "utf8"));
      visit(payload, source);
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
  }

  return [...byNameKey.values()]
    .filter((group) => group.registrations.size === 1)
    .map((group) => {
      const card = [...group.registrations.values()][0];
      return {
        ...card,
        name: card.name || group.displayName,
        nameKey: group.nameKey,
        sources: [...group.sources].sort(),
      };
    });
}

export async function loadRiderIdentitySources() {
  const playerCards = JSON.parse(await readFile(playerCardIndexPath, "utf8"));
  const officialSupplementCards = await loadOfficialRiderSupplement();
  const keirinJpFeedCards = await loadKeirinJpFeedIdentityCards();
  let overrides = {};
  try {
    overrides = JSON.parse(await readFile(riderOverridePath, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  let raceOverrides = {};
  try {
    raceOverrides = JSON.parse(await readFile(riderRaceOverridePath, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const cardsByRegistrationNo = new Map();
  const cardsByNameKey = new Map();
  const addIdentityCard = (card) => {
    const registrationNo = normalizeRegistrationNo(card.registrationNo ?? card.id);
    const nameKey = normalizeRiderName(card.name);
    if (!registrationNo || !nameKey) return null;

    const normalizedCard = { ...card, registrationNo, nameKey };
    cardsByRegistrationNo.set(registrationNo, normalizedCard);

    const current = cardsByNameKey.get(nameKey) ?? [];
    current.push(normalizedCard);
    cardsByNameKey.set(nameKey, current);

    return normalizedCard;
  };

  for (const card of [...officialSupplementCards, ...playerCards]) {
    addIdentityCard(card);
  }

  for (const card of keirinJpFeedCards) {
    const registrationNo = normalizeRegistrationNo(card.registrationNo ?? card.id);
    const nameKey = normalizeRiderName(card.name);
    if (!registrationNo || !nameKey) continue;

    const current = cardsByNameKey.get(nameKey) ?? [];
    if (current.length > 0) continue;

    addIdentityCard(card);
  }

  const normalizedOverrides = new Map();
  for (const [name, registrationNoValue] of Object.entries(overrides)) {
    const nameKey = normalizeRiderName(name);
    const registrationNo = normalizeRegistrationNo(registrationNoValue);
    if (nameKey && registrationNo) normalizedOverrides.set(nameKey, registrationNo);
  }

  const normalizedRaceOverrides = new Map();
  for (const [key, registrationNoValue] of Object.entries(raceOverrides)) {
    const registrationNo = normalizeRegistrationNo(registrationNoValue);
    if (key && registrationNo) normalizedRaceOverrides.set(String(key), registrationNo);
  }

  return {
    playerCards,
    keirinJpFeedCards,
    cardsByRegistrationNo,
    cardsByNameKey,
    overrides: normalizedOverrides,
    raceOverrides: normalizedRaceOverrides,
  };
}

export function resolveRiderIdentity(starter, sources, race = null) {
  const name = String(starter?.name ?? "").trim();
  const nameKey = normalizeRiderName(starter?.nameKey ?? name);
  const directRegistrationNo = normalizeRegistrationNo(starter?.registrationNo);
  const raceOverrideKey = race?.raceKey && starter?.carNo != null
    ? `${race.raceKey}#${starter.carNo}`
    : null;
  const raceOverrideRegistrationNo = raceOverrideKey
    ? sources.raceOverrides?.get(raceOverrideKey)
    : null;

  if (raceOverrideRegistrationNo) {
    const card = sources.cardsByRegistrationNo.get(raceOverrideRegistrationNo) ?? null;
    return {
      registrationNo: raceOverrideRegistrationNo,
      name: name || card?.name || "",
      nameKey: nameKey || card?.nameKey || "",
      status: "race-manual-override",
      card,
      overrideKey: raceOverrideKey,
    };
  }

  if (directRegistrationNo) {
    const card = sources.cardsByRegistrationNo.get(directRegistrationNo) ?? null;
    const recordedStatus = [
      "registration-no",
      "unique-player-card-name",
      "manual-override",
    ].includes(starter?.identityStatus)
      ? starter.identityStatus
      : "registration-no";
    return {
      registrationNo: directRegistrationNo,
      name: name || card?.name || "",
      nameKey: nameKey || card?.nameKey || "",
      status: recordedStatus,
      card,
    };
  }

  const nameMatches = sources.cardsByNameKey.get(nameKey) ?? [];
  if (nameMatches.length === 1) {
    return {
      registrationNo: nameMatches[0].registrationNo,
      name: name || nameMatches[0].name,
      nameKey,
      status: "unique-player-card-name",
      card: nameMatches[0],
    };
  }
  if (nameMatches.length > 1) {
    const registrationNos = [
      ...new Set(
        nameMatches
          .map((card) => normalizeRegistrationNo(card.registrationNo))
          .filter(Boolean),
      ),
    ];

    if (registrationNos.length === 1) {
      return {
        registrationNo: registrationNos[0],
        name: name || nameMatches[0].name,
        nameKey,
        status: "same-registration-name",
        card: nameMatches[0],
      };
    }

    return {
      registrationNo: null,
      name,
      nameKey,
      status: "ambiguous",
      card: null,
      candidates: nameMatches.map((card) => card.registrationNo),
    };
  }

  const overrideRegistrationNo = sources.overrides.get(nameKey);
  if (overrideRegistrationNo) {
    const card = sources.cardsByRegistrationNo.get(overrideRegistrationNo) ?? null;
    return {
      registrationNo: overrideRegistrationNo,
      name: name || card?.name || "",
      nameKey,
      status: "manual-override",
      card,
    };
  }

  return {
    registrationNo: null,
    name,
    nameKey,
    status: "unresolved",
    card: null,
  };
}

function parseStarterLine(line) {
  const matches = [];
  const pattern = /(?:^|\s)([1-9])\s*(?:番車?|車)?[\s　:：|｜]+(.+?)(?=\s+[1-9]\s*(?:番車?|車)?[\s　:：|｜]+|$)/gu;
  for (const match of line.matchAll(pattern)) {
    const name = match[2]
      .replace(/[（(].*$/u, "")
      .replace(/\s+(?:\d{2,3}期|[ASL]級\S*|[逃追両])(?:\s.*)?$/u, "")
      .trim();
    if (name) matches.push({ carNo: Number(match[1]), name });
  }
  return matches;
}

export function parseExplicitStarterTable(text) {
  const lines = String(text ?? "").normalize("NFKC").split(/\r?\n/u);
  const headingIndex = lines.findIndex((line) => (
    /^\s*[【[]?出走表[】\]]?\s*$/u.test(line)
  ));
  if (headingIndex < 0) return [];

  const starters = [];
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    if (
      /^(?:【|\[|展開予想|想定並び|想定ライン|並び|周回予想|買い目|軸と相手)/u.test(line)
    ) {
      break;
    }
    starters.push(...parseStarterLine(line));
  }

  const uniqueCars = new Set(starters.map((starter) => starter.carNo));
  const expectedCars = Array.from(
    { length: starters.length },
    (_, index) => index + 1,
  );
  const complete = starters.length >= 5
    && starters.length <= 9
    && uniqueCars.size === starters.length
    && expectedCars.every((carNo) => uniqueCars.has(carNo));
  return complete ? starters : [];
}

export function isCompleteStarterArray(race) {
  if (!Array.isArray(race?.starters) || race.starters.length < 5) return false;
  const carNos = race.starters.map((starter) => starter.carNo);
  const uniqueCars = new Set(carNos);
  const expectedCount = Number.isInteger(race.starterCount)
    ? race.starterCount
    : race.starters.length;
  return race.starters.length === expectedCount
    && uniqueCars.size === expectedCount
    && Array.from({ length: expectedCount }, (_, index) => index + 1)
      .every((carNo) => uniqueCars.has(carNo));
}

export function lineupCoversStarters(race) {
  if (!isCompleteStarterArray(race) || race?.lineup?.status !== "parsed") {
    return false;
  }
  const starterCars = [...race.starters.map((starter) => starter.carNo)].sort();
  const lineupCars = [...race.lineup.lines.flat()].sort();
  return starterCars.length === lineupCars.length
    && starterCars.every((carNo, index) => carNo === lineupCars[index]);
}

export function resolveLineupRole(race, carNo) {
  if (!lineupCoversStarters(race)) return null;
  const line = race.lineup.lines.find((candidate) => candidate.includes(carNo));
  if (!line) return null;
  if (line.length === 1) return "single";
  const position = line.indexOf(carNo);
  if (position === 0) return "front";
  if (position === 1) return "bante";
  if (position === 2) return "third";
  return null;
}
