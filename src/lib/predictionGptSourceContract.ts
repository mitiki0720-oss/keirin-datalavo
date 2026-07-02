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
  registrationNumber?: unknown;
  registrationId?: unknown;
  prefecture?: unknown;
  age?: unknown;
  term?: unknown;
  grade?: unknown;
  className?: unknown;
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
    rider.registrationNumber,
    rider.registrationId,
  ]) {
    const normalized = contractValue(value);
    if (normalized !== "null") return normalized;
  }
  return "null";
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
}: {
  date: unknown;
  feed?: PredictionGptFeedLike | null;
  venue: PredictionGptVenueLike;
  race: PredictionGptRaceLike;
  riders: PredictionGptRiderLike[];
}) => {
  const source = resolvePredictionGptSourceMetadata({ feed, venue, race });
  const rows = riders.map((rider) => [
    contractValue(rider.carNo),
    explicitNullableValue(rider.fullName, rider.name),
    explicitRegistrationNo(rider),
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
    "",
    "【出走表】",
    "車番 / 選手名 / 登録番号 / 府県 / 年齢 / 期 / 級班",
    ...(rows.length > 0
      ? rows
      : ["null / null / null / null / null / null / null"]),
  ].join("\n");
};
