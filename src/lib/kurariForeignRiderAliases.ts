import type { KurariForeignRiderAliasRegistryEntry } from "../types/kurariEx";

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
