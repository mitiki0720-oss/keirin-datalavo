import type {
  KurariForeignRiderAliasAdoptionAssessment,
  KurariForeignRiderAliasRegistryEntry,
  KurariForeignRiderAliasStrictCondition,
} from "../types/kurariEx";

export const KURARI_FOREIGN_RIDER_ALIAS_REGISTRY = [
  {
    registryId: "foreign-aomori-20260704-andrews-130134",
    category: "foreign-rider-alias",
    todayGeneratedName: "アンドルーズ 外国",
    officialEntryName: "アンドルーズ",
    registrationNo: "130134",
    sourceType: "official-candidate",
    trustStatus: "source-backed-manual",
    matchMethod: "exact-alias-pair",
    allowedMatchScope: "foreign-rider-name-variant",
    provenance: [
      "KEIRIN.JP official entries",
      "31-09診断でdate + venueCode + raceNumber + carNo一致",
      "playerName完全一致ではないため31-10では本採用しない",
    ],
    createdBy: "31-10",
    note: "外国人選手表記。today.generated側に「外国」が付与され、official entries側は短縮表記。",
  },
  {
    registryId: "foreign-aomori-20260704-van-der-wouw-130135",
    category: "foreign-rider-alias",
    todayGeneratedName: "ファンデルワウ 外国",
    officialEntryName: "ファンデルワ",
    registrationNo: "130135",
    sourceType: "official-candidate",
    trustStatus: "source-backed-manual",
    matchMethod: "exact-alias-pair",
    allowedMatchScope: "foreign-rider-name-variant",
    provenance: [
      "KEIRIN.JP official entries",
      "31-09診断でdate + venueCode + raceNumber + carNo一致",
      "playerName完全一致ではないため31-10では本採用しない",
    ],
    createdBy: "31-10",
    note: "外国人選手表記。today.generated側に「外国」が付与され、official entries側は短縮表記。",
  },
  {
    registryId: "foreign-aomori-20260704-truman-130127",
    category: "foreign-rider-alias",
    todayGeneratedName: "トゥルーマン 外国",
    officialEntryName: "トゥルーマン",
    registrationNo: "130127",
    sourceType: "official-candidate",
    trustStatus: "source-backed-manual",
    matchMethod: "exact-alias-pair",
    allowedMatchScope: "foreign-rider-name-variant",
    provenance: [
      "KEIRIN.JP official entries",
      "31-09診断でdate + venueCode + raceNumber + carNo一致",
      "playerName完全一致ではないため31-10では本採用しない",
    ],
    createdBy: "31-10",
    note: "外国人選手表記。today.generated側に「外国」が付与され、official entries側は短縮表記。",
  },
  {
    registryId: "foreign-aomori-20260704-richardson-130133",
    category: "foreign-rider-alias",
    todayGeneratedName: "リチャードソン 外国",
    officialEntryName: "リチャードソ",
    registrationNo: "130133",
    sourceType: "official-candidate",
    trustStatus: "source-backed-manual",
    matchMethod: "exact-alias-pair",
    allowedMatchScope: "foreign-rider-name-variant",
    provenance: [
      "KEIRIN.JP official entries",
      "31-09診断でdate + venueCode + raceNumber + carNo一致",
      "playerName完全一致ではないため31-10では本採用しない",
    ],
    createdBy: "31-10",
    note: "外国人選手表記。today.generated側に「外国」が付与され、official entries側は短縮表記。",
  },
] as const satisfies readonly KurariForeignRiderAliasRegistryEntry[];

export function findKurariForeignRiderAlias(
  todayGeneratedName: string,
  officialEntryName: string,
  registrationNo: string | null,
) {
  if (!registrationNo) return null;
  return KURARI_FOREIGN_RIDER_ALIAS_REGISTRY.find((entry) =>
    entry.todayGeneratedName === todayGeneratedName
    && entry.officialEntryName === officialEntryName
    && entry.registrationNo === registrationNo
  ) ?? null;
}

type KurariForeignRiderAliasStrictAdoptionInput = {
  today: {
    date: string;
    venueCode: string;
    raceNumber: number;
    carNo: string;
    name: string;
  };
  officialCandidate: {
    date: string;
    venueCode: string;
    raceNumber: number;
    carNo: string;
    name: string;
    registrationNo: string | null;
  };
  detectedByMismatchAudit: boolean;
  fuzzyMatchingUsed: false;
  nameOnlyMatchingUsed: false;
};

export const KURARI_FOREIGN_RIDER_ALIAS_PLANNED_SOURCE_DESIGN = {
  registrationNoSource: "foreign-rider-alias-registry",
  registrationNoTrustStatus: "source-backed-alias",
  sourceType: "source-backed-alias",
  matchMethod: "exact-alias-pair",
  provenance: "KEIRIN.JP official entries + alias registry + strict keys matched",
} as const;

export function evaluateKurariForeignRiderAliasStrictAdoption(
  input: KurariForeignRiderAliasStrictAdoptionInput,
): {
  registryEntry: KurariForeignRiderAliasRegistryEntry | null;
  assessment: KurariForeignRiderAliasAdoptionAssessment;
} {
  const registryEntry = findKurariForeignRiderAlias(
    input.today.name,
    input.officialCandidate.name,
    input.officialCandidate.registrationNo,
  );
  const conditions: KurariForeignRiderAliasStrictCondition[] = [
    { id: 1, key: "date", label: "today / official candidate date完全一致", passed: input.today.date === input.officialCandidate.date },
    { id: 2, key: "venueCode", label: "today / official candidate venueCode完全一致", passed: input.today.venueCode === input.officialCandidate.venueCode },
    { id: 3, key: "raceNumber", label: "today / official candidate raceNumber完全一致", passed: input.today.raceNumber === input.officialCandidate.raceNumber },
    { id: 4, key: "carNo", label: "today / official candidate carNo完全一致", passed: input.today.carNo === input.officialCandidate.carNo },
    { id: 5, key: "todayGeneratedName", label: "today.generated名とregistry値が完全一致", passed: registryEntry?.todayGeneratedName === input.today.name },
    { id: 6, key: "officialEntryName", label: "official entries名とregistry値が完全一致", passed: registryEntry?.officialEntryName === input.officialCandidate.name },
    { id: 7, key: "registrationNo", label: "official candidate登録番号とregistry値が完全一致", passed: registryEntry?.registrationNo === input.officialCandidate.registrationNo },
    { id: 8, key: "category", label: "categoryがforeign-rider-alias", passed: registryEntry?.category === "foreign-rider-alias" },
    { id: 9, key: "matchMethod", label: "matchMethodがexact-alias-pair", passed: registryEntry?.matchMethod === "exact-alias-pair" },
    { id: 10, key: "trustStatus", label: "trustStatusがsource-backed-manual", passed: registryEntry?.trustStatus === "source-backed-manual" },
    { id: 11, key: "sourceType", label: "sourceTypeがofficial-candidate", passed: registryEntry?.sourceType === "official-candidate" },
    { id: 12, key: "mismatchAudit", label: "31-09 mismatch auditのofficial candidate", passed: input.detectedByMismatchAudit },
    { id: 13, key: "fuzzyMatching", label: "fuzzy matching未使用", passed: input.fuzzyMatchingUsed === false },
    { id: 14, key: "nameOnlyMatching", label: "名前だけの照合ではない", passed: input.nameOnlyMatchingUsed === false },
    { id: 15, key: "provenance", label: "registry provenanceが存在", passed: Boolean(registryEntry?.provenance.length) },
  ];
  const failedConditions = conditions.filter((condition) => !condition.passed);
  const allStrictConditionsPassed = failedConditions.length === 0;
  return {
    registryEntry,
    assessment: {
      adoptionEligibility: allStrictConditionsPassed
        ? "strict-adoption-eligible"
        : "not-eligible",
      adoptionStatus: allStrictConditionsPassed ? "not-adopted-yet" : "not-adopted",
      eligibilityReason: allStrictConditionsPassed
        ? "15件のstrict採用条件をすべて満たす診断候補。31-11では未採用。"
        : `未通過条件: ${failedConditions.map((condition) => `${condition.id}.${condition.key}`).join(" / ")}`,
      requiredKeys: {
        date: input.today.date,
        venueCode: input.today.venueCode,
        raceNumber: input.today.raceNumber,
        carNo: input.today.carNo,
        todayGeneratedName: input.today.name,
        officialEntryName: input.officialCandidate.name,
        registrationNo: input.officialCandidate.registrationNo,
      },
      strictConditions: conditions,
      allStrictConditionsPassed,
      nextAction: allStrictConditionsPassed
        ? "31-12でsource-backed-aliasとして本採用検討"
        : "条件不一致を確認し未採用を維持",
      plannedSourceDesign: KURARI_FOREIGN_RIDER_ALIAS_PLANNED_SOURCE_DESIGN,
    },
  };
}
