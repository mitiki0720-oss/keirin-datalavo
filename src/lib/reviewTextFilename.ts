export type ReviewTextFilenameType = "predictions" | "results";

const REVIEW_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const REVIEW_VENUE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const REVIEW_SOURCE_FILE_PATTERN = /(?:^|\/)([a-z0-9-]+)-(?:prediction|result|summary)\.(?:txt|md)$/iu;

export function normalizeReviewTextDate(value: string) {
  const date = value.trim();
  if (!REVIEW_DATE_PATTERN.test(date)) {
    throw new Error(`Invalid review date: ${value}`);
  }
  return date;
}

export function normalizeReviewVenueSlug(value: string) {
  const slug = value.normalize("NFKC").trim().toLowerCase();
  if (!REVIEW_VENUE_SLUG_PATTERN.test(slug)) {
    throw new Error(`Invalid review venue slug: ${value}`);
  }
  return slug;
}

export function getReviewVenueSlugFromSourceFiles(...sourceFiles: Array<string | null | undefined>) {
  for (const sourceFile of sourceFiles) {
    const normalizedPath = sourceFile?.trim().replaceAll("\\", "/");
    const matchedSlug = normalizedPath?.match(REVIEW_SOURCE_FILE_PATTERN)?.[1];
    if (matchedSlug) return normalizeReviewVenueSlug(matchedSlug);
  }
  return null;
}

export function buildReviewTextFilename({
  date,
  venueSlug,
  type,
}: {
  date: string;
  venueSlug: string;
  type: ReviewTextFilenameType;
}) {
  return `${normalizeReviewTextDate(date)}-${normalizeReviewVenueSlug(venueSlug)}-${type}.txt`;
}
