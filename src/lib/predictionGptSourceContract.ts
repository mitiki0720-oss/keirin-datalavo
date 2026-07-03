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
  prefecture?: unknown;
  age?: unknown;
  term?: unknown;
  grade?: unknown;
  className?: unknown;
};

export type PredictionRegistrationNoSource =
  | "entry"
  | "kurari-ex-rider-exact"
  | "kurari-ex-rider-identity"
  | "material-registered-player-card"
  | "material-player-exact-detail"
  | "none";

export type PredictionRegistrationNoTrustStatus =
  | "explicit-entry-registration"
  | "safe-identity-match"
  | "safe-material-match"
  | "unavailable"
  | "ambiguous-blocked"
  | "conflict-blocked";

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

const contractValue = (value: unknown) => {
  if (value === null || value === undefined) return "null";
  const normalized = String(value).normalize("NFKC").trim();
  return normalized || "null";
};

const firstContractValue = (...values: unknown[]) => {
  for (const value of values) {
    const normalized = contractValue(value);
    if (normalized !== "null") return normalized;
  }
  return "unknown";
};

const explicitRegistrationNo = (rider: PredictionGptRiderLike) => {
  for (const value of [
    rider.registrationNo,
    rider.registration,
    rider.registrationNumber,
    rider.registrationId,
  ]) {
    const normalized = contractValue(value);
    if (normalized !== "null") return normalized;
  }
  return "null";
};

const normalizeIdentityText = (value: unknown) =>
  String(value ?? "").normalize("NFKC").replace(/[\s　・]/gu, "").trim();

const normalizeIdentityPrefecture = (value: unknown) =>
  String(value ?? "")
    .normalize("NFKC")
    .replace(/[\s　]/gu, "")
    .replace(/[都道府県]$/u, "")
    .trim();

const normalizeIdentityTerm = (value: unknown) =>
  String(value ?? "").normalize("NFKC").replace(/\s|期/gu, "").trim();

const normalizeIdentityClass = (value: unknown) =>
  String(value ?? "")
    .normalize("NFKC")
    .toUpperCase()
    .replace(/\s|級|班/gu, "")
    .trim();

const resolveRegistrationNo = (
  rider: PredictionGptRiderLike,
  candidates: PredictionRegistrationIdentityCandidate[],
): {
  registrationNo: string;
  source: PredictionRegistrationNoSource;
  status: PredictionRegistrationNoTrustStatus;
} => {
  const explicit = explicitRegistrationNo(rider);
  if (explicit !== "null") {
    return {
      registrationNo: explicit,
      source: "entry",
      status: "explicit-entry-registration",
    };
  }

  const playerName = normalizeIdentityText(rider.fullName || rider.name);
  if (!playerName) {
    return { registrationNo: "null", source: "none", status: "unavailable" };
  }
  const sameNameCandidates = candidates.filter(
    (candidate) => normalizeIdentityText(candidate.playerName) === playerName,
  );
  if (sameNameCandidates.length === 0) {
    return { registrationNo: "null", source: "none", status: "unavailable" };
  }
  if (
    sameNameCandidates.some((candidate) =>
      candidate.ambiguous
      || candidate.sameNameCandidate
      || candidate.fuzzyMatched
    )
  ) {
    return {
      registrationNo: "null",
      source: "none",
      status: "ambiguous-blocked",
    };
  }

  const distinctNameRegistrationNos = new Set(
    sameNameCandidates
      .map((candidate) => contractValue(candidate.registrationNo))
      .filter((registrationNo) => registrationNo !== "null"),
  );
  if (distinctNameRegistrationNos.size > 1) {
    return {
      registrationNo: "null",
      source: "none",
      status: "ambiguous-blocked",
    };
  }

  const riderPrefecture = normalizeIdentityPrefecture(rider.prefecture);
  const riderTerm = normalizeIdentityTerm(rider.term);
  const riderClass = normalizeIdentityClass(rider.className || rider.grade);
  const riderCarNo = contractValue(rider.carNo);
  let conflictDetected = false;
  const safeCandidates = sameNameCandidates.filter((candidate) => {
    const registrationNo = contractValue(candidate.registrationNo);
    const candidatePrefecture = normalizeIdentityPrefecture(candidate.prefecture);
    const candidateTerm = normalizeIdentityTerm(candidate.term);
    const candidateClass = normalizeIdentityClass(candidate.className);
    const materialCandidate =
      candidate.source === "material-registered-player-card"
      || candidate.source === "material-player-exact-detail";
    if (materialCandidate) {
      const candidateCarNo = contractValue(candidate.carNo);
      if (
        registrationNo === "null"
        || riderCarNo === "null"
        || candidateCarNo === "null"
        || candidateCarNo !== riderCarNo
      ) {
        conflictDetected =
          candidateCarNo !== "null" && candidateCarNo !== riderCarNo;
        return false;
      }
      if (
        candidatePrefecture
        && riderPrefecture
        && candidatePrefecture !== riderPrefecture
      ) {
        conflictDetected = true;
        return false;
      }
      if (candidateTerm && riderTerm && candidateTerm !== riderTerm) {
        conflictDetected = true;
        return false;
      }
      if (candidateClass && riderClass && candidateClass !== riderClass) {
        conflictDetected = true;
        return false;
      }
      return true;
    }
    if (
      registrationNo === "null"
      || !candidatePrefecture
      || !candidateTerm
      || !riderPrefecture
      || !riderTerm
    ) {
      return false;
    }
    if (
      candidatePrefecture !== riderPrefecture
      || candidateTerm !== riderTerm
      || (candidateClass && riderClass && candidateClass !== riderClass)
    ) {
      conflictDetected = true;
      return false;
    }
    return true;
  });
  const safeRegistrationNos = new Set(
    safeCandidates.map((candidate) => contractValue(candidate.registrationNo)),
  );
  if (safeRegistrationNos.size > 1) {
    return {
      registrationNo: "null",
      source: "none",
      status: "ambiguous-blocked",
    };
  }
  if (safeRegistrationNos.size === 0) {
    return {
      registrationNo: "null",
      source: "none",
      status: conflictDetected ? "conflict-blocked" : "unavailable",
    };
  }
  const registrationNo = [...safeRegistrationNos][0];
  const preferredCandidate =
    safeCandidates.find(
      (candidate) => candidate.source === "kurari-ex-rider-identity",
    )
    ?? safeCandidates.find(
      (candidate) => candidate.source === "kurari-ex-rider-exact",
    )
    ?? safeCandidates[0];
  const materialMatch =
    preferredCandidate.source === "material-registered-player-card"
    || preferredCandidate.source === "material-player-exact-detail";
  return {
    registrationNo,
    source: preferredCandidate.source,
    status: materialMatch ? "safe-material-match" : "safe-identity-match",
  };
};

const explicitNullableValue = (...values: unknown[]) => {
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
  if (
    explicit === "official"
    || explicit === "user-entered-from-official"
    || explicit === "unknown"
  ) {
    return explicit;
  }
  if (/(?:keirin-jp|keirin\.jp|\bjka\b|official)/iu.test(sourceName)) {
    return "official";
  }
  return "unknown";
};

export const resolvePredictionGptSourceMetadata = ({
  feed,
  venue,
  race,
}: {
  feed?: PredictionGptFeedLike | null;
  venue?: PredictionGptVenueLike | null;
  race?: PredictionGptRaceLike | null;
}) => {
  const sourceName = firstContractValue(
    race?.sourceName,
    race?.raceOperationSource,
    venue?.sourceName,
    venue?.venueOperationSource,
    feed?.sourceName,
  );
  const explicitSourceType =
    race?.sourceType ?? venue?.sourceType ?? feed?.sourceType;
  return {
    sourceName,
    sourceFetchedAt: firstContractValue(
      race?.sourceFetchedAt,
      race?.raceOperationUpdatedAt,
      venue?.sourceFetchedAt,
      venue?.venueOperationUpdatedAt,
      feed?.sourceFetchedAt,
      feed?.generatedAt,
    ),
    sourceType: normalizeSourceType(explicitSourceType, sourceName),
  };
};

export const buildPredictionGptMaterialSourceContract = ({
  date,
  feed,
  venue,
  race,
  riders,
  registrationCandidates = [],
}: {
  date: unknown;
  feed?: PredictionGptFeedLike | null;
  venue: PredictionGptVenueLike;
  race: PredictionGptRaceLike;
  riders: PredictionGptRiderLike[];
  registrationCandidates?: PredictionRegistrationIdentityCandidate[];
}) => {
  const source = resolvePredictionGptSourceMetadata({ feed, venue, race });
  const rows = riders.map((rider) => {
    const registration = resolveRegistrationNo(rider, registrationCandidates);
    return [
      contractValue(rider.carNo),
      explicitNullableValue(rider.fullName, rider.name),
      registration.registrationNo,
      registration.source,
      registration.status,
      contractValue(rider.prefecture),
      contractValue(rider.age),
      contractValue(rider.term),
      explicitNullableValue(rider.className, rider.grade),
    ].join(" / ");
  });

  return [
    "【EX source contract】",
    `date: ${contractValue(date)}`,
    `venue: ${contractValue(venue.venue)}`,
    `raceNumber: ${contractValue(race.raceNo)}`,
    `sourceName: ${source.sourceName}`,
    `sourceFetchedAt: ${source.sourceFetchedAt}`,
    `sourceType: ${source.sourceType}`,
    "",
    "【出走表】",
    "車番 / 選手名 / 登録番号 / 登録番号source / 登録番号status / 府県 / 年齢 / 期 / 級班",
    ...(rows.length > 0
      ? rows
      : ["null / null / null / none / unavailable / null / null / null / null"]),
  ].join("\n");
};
