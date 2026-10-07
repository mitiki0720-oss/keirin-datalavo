export type ReviewRaceSourceRef = {
  venueKey: string;
  raceNumber: number;
};

export type ReviewRaceSourceValue<T> = ReviewRaceSourceRef & {
  value: T;
};

export type ReviewRaceSourceUnionEntry<TPrediction, TFeed, TResult> = ReviewRaceSourceRef & {
  prediction?: TPrediction;
  feed?: TFeed;
  result?: TResult;
  hasReviewPrediction: boolean;
  hasReviewResult: boolean;
};

type ReviewRaceSourceUnionInput<TPrediction, TFeed, TResult> = {
  predictions: Array<ReviewRaceSourceValue<TPrediction>>;
  feedRaces: Array<ReviewRaceSourceValue<TFeed>>;
  results: Array<ReviewRaceSourceValue<TResult>>;
  reviewPredictions?: ReviewRaceSourceRef[];
  reviewResults?: ReviewRaceSourceRef[];
};

function buildReviewRaceSourceKey(venueKey: string, raceNumber: number) {
  return `${venueKey}:${raceNumber}`;
}

export function buildReviewRaceSourceUnion<TPrediction, TFeed, TResult>({
  predictions,
  feedRaces,
  results,
  reviewPredictions = [],
  reviewResults = [],
}: ReviewRaceSourceUnionInput<TPrediction, TFeed, TResult>) {
  const entries = new Map<string, ReviewRaceSourceUnionEntry<TPrediction, TFeed, TResult>>();

  const getEntry = (venueKey: string, raceNumber: number) => {
    const key = buildReviewRaceSourceKey(venueKey, raceNumber);
    const current = entries.get(key) ?? {
      venueKey,
      raceNumber,
      hasReviewPrediction: false,
      hasReviewResult: false,
    };
    entries.set(key, current);
    return current;
  };

  for (const item of feedRaces) getEntry(item.venueKey, item.raceNumber).feed = item.value;
  for (const item of predictions) getEntry(item.venueKey, item.raceNumber).prediction = item.value;
  for (const item of results) getEntry(item.venueKey, item.raceNumber).result = item.value;
  for (const item of reviewPredictions) {
    getEntry(item.venueKey, item.raceNumber).hasReviewPrediction = true;
  }
  for (const item of reviewResults) {
    getEntry(item.venueKey, item.raceNumber).hasReviewResult = true;
  }

  return [...entries.values()].sort(
    (a, b) => a.venueKey.localeCompare(b.venueKey) || a.raceNumber - b.raceNumber,
  );
}
