export type MonthlyReviewIndexItem = {
  id: string;
  month: string;
  title: string;
  subtitle?: string;
  file: string;
  createdAt: string;
  status: "active" | "archive" | "draft";
  scope?: string;
  source?: string;
};

export type MonthlyReviewDigest = {
  stableCohort?: string;
  hitRateAny?: string;
  hitRate3tan?: string;
  hitRate2tan?: string;
  thirdOnlyMiss?: string;
  headMiss?: string;
  targetHitRateAny?: string;
  targetHitRate3tan?: string;
  targetHitRate2tan?: string;
  targetRecoveryRate?: string;
  targetThirdOnlyMiss?: string;
  fixedFormat?: string;
  mission?: string;
  rawText: string;
};
