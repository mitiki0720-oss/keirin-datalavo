export const KURARI_EX_RESULT_OUTPUT_MARKER = "KURARI_EX_RESULT_OUTPUT_V1";

export type KurariExResultRaceStatus =
  | "finished"
  | "cancelled"
  | "postponed"
  | "unknown";

type ResultRegistrationSource =
  | "result"
  | "entry"
  | "prediction-gpt-material"
  | "none";

type ResultRegistrationTrustStatus =
  | "explicit-result-registration"
  | "safe-identity-match"
  | "unavailable"
  | "ambiguous-blocked"
  | "conflict-blocked";

export type ReviewResultFinishLike = {
  rank?: unknown;
  place?: unknown;
  status?: unknown;
  carNo?: unknown;
  playerName?: unknown;
  name?: unknown;
  registrationNo?: unknown;
  registration?: unknown;
  registrationNumber?: unknown;
  registrationNoSource?: unknown;
  registrationNoTrustStatus?: unknown;
};

export type ReviewResultEntryLike = {
  carNo?: unknown;
  playerName?: unknown;
  name?: unknown;
  fullName?: unknown;
  registrationNo?: unknown;
  registration?: unknown;
  registrationNumber?: unknown;
  registrationId?: unknown;
  registrationNoSource?: unknown;
  registrationNoTrustStatus?: unknown;
};

type ReviewResultPayoutLike = {
  combination?: unknown;
  payout?: unknown;
  popularity?: unknown;
};

const nullableText = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const normalized = String(value).normalize("NFKC").trim();
  return normalized || null;
};

const firstText = (...values: unknown[]): string | null => {
  for (const value of values) {
    const normalized = nullableText(value);
    if (normalized !== null) return normalized;
  }
  return null;
};

const exactIdentityText = (value: unknown) =>
  String(value ?? "").normalize("NFKC").replace(/[\s\u3000]/gu, "").trim();

const explicitResultRegistration = (finish: ReviewResultFinishLike) =>
  firstText(
    finish.registrationNo,
    finish.registration,
    finish.registrationNumber,
  );

const explicitEntryRegistration = (entry: ReviewResultEntryLike) =>
  firstText(
    entry.registrationNo,
    entry.registration,
    entry.registrationNumber,
    entry.registrationId,
  );

const resolveRegistration = (
  finish: ReviewResultFinishLike,
  entries: ReviewResultEntryLike[],
): {
  registrationNo: string | null;
  registrationNoSource: ResultRegistrationSource;
  registrationNoTrustStatus: ResultRegistrationTrustStatus;
} => {
  const explicit = explicitResultRegistration(finish);
  if (explicit) {
    return {
      registrationNo: explicit,
      registrationNoSource: "result",
      registrationNoTrustStatus: "explicit-result-registration",
    };
  }

  const carNo = nullableText(finish.carNo);
  const playerName = exactIdentityText(finish.playerName ?? finish.name);
  if (!carNo || !playerName) {
    return {
      registrationNo: null,
      registrationNoSource: "none",
      registrationNoTrustStatus: "unavailable",
    };
  }

  // Same-race carNo is the primary join key. Name is then required to match
  // exactly; a name-only lookup is intentionally never performed.
  const carEntries = entries.filter(
    (entry) => nullableText(entry.carNo) === carNo,
  );
  if (carEntries.length > 1) {
    return {
      registrationNo: null,
      registrationNoSource: "none",
      registrationNoTrustStatus: "ambiguous-blocked",
    };
  }
  if (carEntries.length === 0) {
    return {
      registrationNo: null,
      registrationNoSource: "none",
      registrationNoTrustStatus: "unavailable",
    };
  }

  const entry = carEntries[0];
  const entryName = exactIdentityText(entry.fullName ?? entry.playerName ?? entry.name);
  if (!entryName || entryName !== playerName) {
    return {
      registrationNo: null,
      registrationNoSource: "none",
      registrationNoTrustStatus: "conflict-blocked",
    };
  }

  const registrationNo = explicitEntryRegistration(entry);
  if (!registrationNo) {
    return {
      registrationNo: null,
      registrationNoSource: "none",
      registrationNoTrustStatus: "unavailable",
    };
  }

  const trustedPredictionMaterial =
    entry.registrationNoTrustStatus === "safe-identity-match"
    && (
      entry.registrationNoSource === "kurari-ex-rider-exact"
      || entry.registrationNoSource === "kurari-ex-rider-identity"
    );
  const explicitEntry =
    !entry.registrationNoTrustStatus
    || entry.registrationNoTrustStatus === "explicit-entry-registration";
  if (!trustedPredictionMaterial && !explicitEntry) {
    return {
      registrationNo: null,
      registrationNoSource: "none",
      registrationNoTrustStatus: "unavailable",
    };
  }

  return {
    registrationNo,
    registrationNoSource: trustedPredictionMaterial
      ? "prediction-gpt-material"
      : "entry",
    registrationNoTrustStatus: "safe-identity-match",
  };
};

const normalizePayoutItem = (item?: ReviewResultPayoutLike | null) => {
  if (!item) return null;
  return {
    combination: nullableText(item.combination),
    payout: nullableText(item.payout),
    popularity: nullableText(item.popularity),
  };
};

const normalizePayoutList = (items?: ReviewResultPayoutLike[] | null) =>
  (items ?? []).map(normalizePayoutItem).filter((item) => item !== null);

export function buildKurariExResultOutputBlock({
  date,
  venueName,
  raceNumber,
  raceStatus,
  finishOrder,
  entries = [],
  payout,
  source,
  links,
}: {
  date: unknown;
  venueName: unknown;
  raceNumber: unknown;
  raceStatus: KurariExResultRaceStatus;
  finishOrder: ReviewResultFinishLike[];
  entries?: ReviewResultEntryLike[];
  payout?: {
    twoExact?: ReviewResultPayoutLike | null;
    twoQuinella?: ReviewResultPayoutLike[] | null;
    threeExact?: ReviewResultPayoutLike | null;
    threeQuinella?: ReviewResultPayoutLike | null;
    wide?: ReviewResultPayoutLike[] | null;
  };
  source?: {
    officialResultSource?: unknown;
    sourceFetchedAt?: unknown;
    sourceHash?: unknown;
  };
  links?: {
    linkedPredictionFile?: unknown;
    linkedSummaryFile?: unknown;
    linkedReviewFile?: unknown;
  };
}) {
  const payload = {
    date: nullableText(date),
    venueName: nullableText(venueName),
    raceNumber: nullableText(raceNumber),
    raceStatus,
    finishOrder: finishOrder.map((finish) => ({
      rank: firstText(finish.rank, finish.place, finish.status),
      carNo: nullableText(finish.carNo),
      playerName: firstText(finish.playerName, finish.name),
      ...resolveRegistration(finish, entries),
    })),
    payout: {
      twoExact: normalizePayoutItem(payout?.twoExact),
      twoQuinella: normalizePayoutList(payout?.twoQuinella),
      threeExact: normalizePayoutItem(payout?.threeExact),
      threeQuinella: normalizePayoutItem(payout?.threeQuinella),
      wide: normalizePayoutList(payout?.wide),
    },
    source: {
      officialResultSource: nullableText(source?.officialResultSource),
      sourceFetchedAt: nullableText(source?.sourceFetchedAt),
      sourceHash: nullableText(source?.sourceHash),
    },
    links: {
      linkedPredictionFile: nullableText(links?.linkedPredictionFile),
      linkedSummaryFile: nullableText(links?.linkedSummaryFile),
      linkedReviewFile: nullableText(links?.linkedReviewFile),
    },
  };

  return `${KURARI_EX_RESULT_OUTPUT_MARKER}\n${JSON.stringify(payload, null, 2)}`;
}
