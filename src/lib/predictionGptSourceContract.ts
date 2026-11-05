/**
 * GPT race-source metadata and legacy export compatibility.
 * Registration IDs are NEVER resolved in this helper: it has no race-level
 * JSJ001/JSJ006 attestation or paired raw-bytes SHA256 evidence.
 * The actual export path MUST use strictOfficialRegistrationMaterial.
 *
 * Provenance rule: sourceType=official here describes the race metadata only.
 * It is NOT proof of any rider registration number.
 */
export type PredictionGptSourceType =
  | "official"
  | "user-entered-from-official"
  | "unknown";

type PredictionGptFeedLike = {
  generatedAt?: unknown;
  sourceName?: unknown;
  sourceFetchedAt?: unknown;
  sourceType?: unknown;
};
type PredictionGptVenueLike = {
  venue?: unknown;
  sourceName?: unknown;
  sourceFetchedAt?: unknown;
  sourceType?: unknown;
  venueOperationSource?: unknown;
  venueOperationUpdatedAt?: unknown;
};
type PredictionGptRaceLike = {
  raceNo?: unknown;
  sourceName?: unknown;
  sourceFetchedAt?: unknown;
  sourceType?: unknown;
  raceOperationSource?: unknown;
  raceOperationUpdatedAt?: unknown;
};
type PredictionGptRiderLike = {
  carNo?: unknown;
  name?: unknown;
  fullName?: unknown;
  registrationNo?: unknown;
  registration?: unknown;
  registrationNumber?: unknown;
  registrationId?: unknown;
  registrationNoSource?: unknown;
  registrationNoStatus?: unknown;
  registrationNoTrustStatus?: unknown;
  prefecture?: unknown;
  age?: unknown;
  term?: unknown;
  grade?: unknown;
  className?: unknown;
};

// Preserve previous exported TYPES while migrating the old enrichment audits.
// These historic candidate kinds are NOT sources of verified registration IDs.
export type PredictionRegistrationNoSource =
  | "none"
  | "KEIRIN.JP:JSJ006";
export type PredictionRegistrationNoTrustStatus =
  | "unverified-blocked"
  | "unavailable";
export type PredictionRegistrationIdentityCandidate = {
  carNo?: unknown;
  registrationNo?: unknown;
  playerName?: unknown;
  prefecture?: unknown;
  term?: unknown;
  className?: unknown;
  source:
    | "kurari-ex-rider-exact"
    | "kurari-ex-rider-identity"
    | "material-registered-player-card"
    | "material-player-exact-detail";
  ambiguous?: boolean;
  sameNameCandidate?: boolean;
  fuzzyMatched?: boolean;
};

const contractValue = (value: unknown): string => {
  if (value === null || value === undefined) return "null";
  const normalized = String(value).normalize("NFKC").trim();
  return normalized || "null";
};
const firstContractValue = (...values: unknown[]): string => {
  for (const value of values) {
    const normalized = contractValue(value);
    if (normalized !== "null") return normalized;
  }
  return "unknown";
};
const explicitNullableValue = (...values: unknown[]): string => {
  for (const value of values) {
    const normalized = contractValue(value);
    if (normalized !== "null") return normalized;
  }
  return "null";
};
const normalizeSourceType = (
  explicitSourceType: unknown,
  sourceName: string,
): PredictionGptSourceType => {
  const explicit = String(explicitSourceType ?? "").trim();
  if (explicit === "official" || explicit === "user-entered-from-official" || explicit === "unknown") {
    return explicit;
  }
  return /(?:keirin-jp|keirin\.jp|\bjka\b|official)/iu.test(sourceName)
    ? "official"
    : "unknown";
};

export const resolvePredictionGptSourceMetadata = ({
  feed, venue, race,
}: {
  feed?: PredictionGptFeedLike | null;
  venue?: PredictionGptVenueLike | null;
  race?: PredictionGptRaceLike | null;
}) => {
  const sourceName = firstContractValue(
    race?.sourceName, race?.raceOperationSource, venue?.sourceName,
    venue?.venueOperationSource, feed?.sourceName,
  );
  const sourceType = normalizeSourceType(
    race?.sourceType ?? venue?.sourceType ?? feed?.sourceType,
    sourceName,
  );
  return {
    sourceName,
    sourceFetchedAt: firstContractValue(
      race?.sourceFetchedAt, venue?.sourceFetchedAt, feed?.sourceFetchedAt,
    ),
    sourceType,
  };
};

/**
 * COMPATIBILITY ONLY. There is no verified-rider-evidence argument here.
 * We deliberately redact even an explicitly populated registrationNo: a
 * string by itself does not establish its provenance or match to a race.
 * Passing name/identity/material candidates is always ignored.
 */
export const buildPredictionGptMaterialSourceContract = ({
  date, feed, venue, race, riders, registrationCandidates = [],
}: {
  date: unknown;
  feed?: PredictionGptFeedLike | null;
  venue: PredictionGptVenueLike;
  race: PredictionGptRaceLike;
  riders: PredictionGptRiderLike[];
  registrationCandidates?: PredictionRegistrationIdentityCandidate[];
}): string => {
  void registrationCandidates;
  const source = resolvePredictionGptSourceMetadata({ feed, venue, race });
  const rows = riders.map((rider) => [
    contractValue(rider.carNo),
    explicitNullableValue(rider.fullName, rider.name),
    "null",  // NO registration ID without 4-key + recorded official proof.
    "none",
    "unverified-blocked",
    contractValue(rider.prefecture),
    contractValue(rider.age),
    contractValue(rider.term),
    explicitNullableValue(rider.className, rider.grade),
  ].join(" / "));
  return [
    "【EX source contract】",
    `date: ${contractValue(date)}`,
    `venue: ${contractValue(venue.venue)}`,
    `raceNumber: ${contractValue(race.raceNo)}`,
    `sourceName: ${source.sourceName}`,
    `sourceFetchedAt: ${source.sourceFetchedAt}`,
    `sourceType: ${source.sourceType}`,
    "registrationNoProof: unverified; this legacy helper does not authenticate riders",
    "",
    "【出走表】",
    "車番 / 選手名 / 登録番号 / 登録番号source / 登録番号status / 府県 / 年齢 / 期 / 級班",
    ...(rows.length ? rows : ["null / null / null / none / unavailable / null / null / null / null"]),
  ].join("\n");
};
