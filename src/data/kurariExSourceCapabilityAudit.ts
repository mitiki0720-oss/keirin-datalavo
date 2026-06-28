export type KurariExSourceCapabilityStatus =
  | "available"
  | "partial"
  | "unavailable"
  | "fake-prohibited";

export type KurariExSourceCapabilityAuditItem = {
  id: string;
  label: string;
  targetInventoryIds: readonly string[];
  capabilityStatus: KurariExSourceCapabilityStatus;
  confirmedSourceKeys: readonly string[];
  missingSourceKeys: readonly string[];
  checkedFiles: readonly string[];
  implementationNote: string;
  nextAction: string;
};

const EXACT_RIDER_FILES = "exact/riders/by-tail/*/*.generated.json";
const EXACT_MATCHUP_FILES = "exact/matchups/by-rider-tail/*/*.generated.json";
const EXACT_VENUE_FILES = "exact/venues/*.generated.json";
const HISTORY_DAILY_FILES = "history/daily/*/*.generated.json";
const RIDER_CATEGORY_FILE = "analysis/rider-category-analysis.generated.json";

const audit = (
  id: string,
  label: string,
  targetInventoryIds: readonly string[],
  capabilityStatus: KurariExSourceCapabilityStatus,
  confirmedSourceKeys: readonly string[],
  missingSourceKeys: readonly string[],
  checkedFiles: readonly string[],
  implementationNote: string,
  nextAction: string,
): KurariExSourceCapabilityAuditItem => ({
  id,
  label,
  targetInventoryIds,
  capabilityStatus,
  confirmedSourceKeys,
  missingSourceKeys,
  checkedFiles,
  implementationNote,
  nextAction,
});

export const KURARI_EX_SOURCE_CAPABILITY_STATUS_META: Record<
  KurariExSourceCapabilityStatus,
  { label: string; description: string }
> = {
  available: {
    label: "AVAILABLE",
    description: "保存済みJSONに根拠フィールドと集計があり、現在の範囲で利用可能。",
  },
  partial: {
    label: "PARTIAL",
    description: "一部の根拠はあるが、欠損・曖昧値・専用集計不足があり限定利用。",
  },
  unavailable: {
    label: "UNAVAILABLE",
    description: "監査対象JSONに専用の根拠フィールドがなく、現時点では未蓄積。",
  },
  "fake-prohibited": {
    label: "FAKE PROHIBITED",
    description: "生イベント根拠がないため、率・回数・成否を生成してはいけない。",
  },
};

export const KURARI_EX_SOURCE_CAPABILITY_AUDIT = [
  audit("by-grade", "byGrade", ["grade"], "partial", ["history.items[].grade"], ["byGrade"], [HISTORY_DAILY_FILES, EXACT_RIDER_FILES], "履歴のgradeは存在するが、推定・想定・不明を含み、選手別byGrade集計は存在しない。", "明示gradeだけを識別するルールと専用集計を整備する。"),
  audit("by-race-type", "byRaceType", ["race-type", "grade-race-type"], "partial", ["byRaceStage", "byClass", "history.items[].raceClass"], ["byRaceType"], [EXACT_RIDER_FILES, RIDER_CATEGORY_FILE, HISTORY_DAILY_FILES], "専用byRaceTypeはない。byRaceStageは安全なステージ分類、byClassは級班・番組名が混在する別軸。", "専用分類を作る場合もbyRaceStageを置換せず、安全な種目だけ分離する。"),
  audit("by-car-no", "byCarNo", ["car-no"], "available", ["byCarNo[].carNo", "byCarNo[].starts", "byCarNo[].winRate", "dimensions.carNo"], [], [EXACT_RIDER_FILES, RIDER_CATEGORY_FILE], "複数の選手EXACTサンプルとカテゴリ分析に、車番別の着順・率・母数が保存済み。", "既存PLAYER CATEGORY ANALYSISを利用し、別集計を作らない。"),
  audit("by-venue", "byVenue", ["venue"], "available", ["byVenue", "dimensions.venue"], [], [EXACT_RIDER_FILES, RIDER_CATEGORY_FILE], "選手別EXACTとカテゴリ分析の両方に保存済み。", "既存会場分析を利用する。"),
  audit("by-bank-length", "byBankLength", ["bank-length", "bank-333-result", "bank-400-result", "bank-500-result"], "available", ["byBankLength", "dimensions.bankLength"], [], [EXACT_RIDER_FILES, RIDER_CATEGORY_FILE], "333m・400m・500mの保存済み集計あり。", "既存条件別データを利用する。"),
  audit("by-timeslot", "byTimeslot", ["timeslot", "morning-result", "day-result", "night-result", "midnight-result"], "available", ["byTimeslot", "dimensions.timeslot"], [], [EXACT_RIDER_FILES, RIDER_CATEGORY_FILE], "時間帯別の保存済み集計あり。", "不明時間帯を除き既存表示を利用する。"),
  audit("by-race-stage", "byRaceStage", ["race-type", "schedule-stage", "qualifying-result", "final-result", "consolation-result", "seed-result"], "available", ["byRaceStage", "dimensions.raceStage"], [], [EXACT_RIDER_FILES, RIDER_CATEGORY_FILE], "安全分類済みの予選・決勝・一般/敗者・特選/シード集計あり。", "準決勝は別途安全分類できるまで混ぜない。"),
  audit("by-role", "byRole", ["position", "front-role-result", "bante-role-result", "third-role-result", "single-role-result"], "available", ["byRole.front", "byRole.bante", "byRole.third", "byRole.single", "dimensions.role"], [], [EXACT_RIDER_FILES, RIDER_CATEGORY_FILE], "安全に解釈できた並びだけを使う役割別集計あり。", "脚質による役割補完をしない。"),
  audit("by-weather", "byWeather", ["sunny-result", "cloudy-result", "rain-result", "snow-result"], "available", ["byWeather", "dimensions.weather"], [], [EXACT_RIDER_FILES, RIDER_CATEGORY_FILE], "晴れ・曇り・雨を含む保存済み集計あり。雪は実績がある場合だけ利用する。", "未保存天候を補完しない。"),
  audit("same-line", "sameLine", ["same-line"], "available", ["matchups[].sameLine"], [], [EXACT_MATCHUP_FILES], "保存済み対戦ペアに同一ライン時の比較母数・先着数・率がある。", "既存MATCHUPだけを利用する。"),
  audit("other-line", "otherLine", ["other-line"], "available", ["matchups[].otherLine"], [], [EXACT_MATCHUP_FILES], "保存済み対戦ペアに別ライン時の比較母数・先着数・率がある。", "ライン不明レースを混ぜない。"),
  audit("same-prefecture", "samePrefecture", ["same-prefecture-start", "same-prefecture-adjustment"], "unavailable", [], ["samePrefecture"], [EXACT_RIDER_FILES, EXACT_MATCHUP_FILES, HISTORY_DAILY_FILES], "専用キー・専用集計は存在しない。選手属性だけで連携を断定できない。", "登録番号一致・府県・同走記録を明示的に蓄積する。"),
  audit("straight-length", "straightLength", ["home-stretch"], "unavailable", [], ["straightLength"], [EXACT_VENUE_FILES, RIDER_CATEGORY_FILE, HISTORY_DAILY_FILES], "会場EXACT・履歴・カテゴリ分析に見なし直線長の保存値がない。", "信頼できる会場マスタを追加するまで未蓄積とする。"),
  audit("home-stretch", "homeStretch", ["home-stretch"], "unavailable", [], ["homeStretch"], [EXACT_VENUE_FILES, RIDER_CATEGORY_FILE, HISTORY_DAILY_FILES], "見なし直線を示す別名キーも存在しない。", "straightLengthと同じ会場マスタへ統一する。"),
  audit("tactic-raw", "tactic event raw data", ["tactic-management"], "fake-prohibited", [], ["tactic", "tacticEvents"], ["exact/global/prediction-kpi.generated.json", RIDER_CATEGORY_FILE, HISTORY_DAILY_FILES], "戦法イベントの生発生記録・当事者・成否フィールドはない。unsupportedExactMetricsは未生成理由であり実績ではない。", "明示タグと展開記録を新規蓄積するまで率・回数を生成しない。"),
  audit("kamashi", "kamashi", ["kamashi-rate"], "fake-prohibited", [], ["kamashi"], [RIDER_CATEGORY_FILE, HISTORY_DAILY_FILES], "文字列は未生成指標名にだけ現れ、生イベント記録は存在しない。", "明示された発生・成功記録を蓄積する。"),
  audit("tsuppari", "tsuppari", ["tsuppari-rate"], "fake-prohibited", [], ["tsuppari"], [RIDER_CATEGORY_FILE, HISTORY_DAILY_FILES], "文字列は未生成指標名にだけ現れ、生イベント記録は存在しない。", "明示された発生・成功記録を蓄積する。"),
  audit("chigiri", "chigiri", ["chigiri-rate"], "fake-prohibited", [], ["chigiri"], [RIDER_CATEGORY_FILE, HISTORY_DAILY_FILES], "生イベント記録が存在しない。", "着差や1着から後付け分類しない。"),
  audit("chigirare", "chigirare", ["chigirare-rate"], "fake-prohibited", [], ["chigirare"], [RIDER_CATEGORY_FILE, HISTORY_DAILY_FILES], "生イベント記録が存在しない。", "着外から後付け分類しない。"),
  audit("tobitsuki", "tobitsuki", ["tobitsuki-rate"], "fake-prohibited", [], ["tobitsuki"], [RIDER_CATEGORY_FILE, HISTORY_DAILY_FILES], "生イベント記録が存在しない。", "位置結果から後付け分類しない。"),
  audit("seri", "seri", ["seri-win-rate", "seri-result"], "fake-prohibited", [], ["seri"], [RIDER_CATEGORY_FILE, HISTORY_DAILY_FILES], "文字列は未生成指標名にだけ現れ、競り発生・当事者・勝敗の生記録はない。", "明示された競りイベントを蓄積する。"),
  audit("line-size", "lineSize", ["line-monopoly-expectation"], "partial", ["history.items[].lineup.lines"], ["lineSize"], [HISTORY_DAILY_FILES], "専用lineSizeはないが、lineupParsedのレースでは保存済みlines配列からライン人数を確認できる。", "解析可能レースだけを対象に正式定義する。"),
  audit("position", "position", ["position"], "partial", ["byRole", "history.items[].lineup.lines"], ["position"], [EXACT_RIDER_FILES, HISTORY_DAILY_FILES], "汎用positionキーはないが、安全判定済みbyRoleと並び配列がある。", "既存byRoleを利用し、脚質から補完しない。"),
  audit("car-no-raw", "carNo", ["car-no"], "available", ["history.items[].starters[].carNo", "byCarNo[].carNo"], [], [HISTORY_DAILY_FILES, EXACT_RIDER_FILES], "履歴の出走選手と選手別集計の両方に車番がある。", "保存済み車番だけを使う。"),
  audit("grade-raw", "grade", ["grade"], "partial", ["history.items[].grade"], ["byGrade"], [HISTORY_DAILY_FILES, EXACT_RIDER_FILES], "履歴にgradeはあるが、推定・想定・不明を含むため無条件集計できない。", "明示値だけを選別し、推定値を除外する。"),
  audit("race-type-raw", "raceType", ["race-type", "grade-race-type"], "partial", ["history.items[].prediction.raceType", "history.items[].raceClass", "byRaceStage"], ["byRaceType"], [HISTORY_DAILY_FILES, EXACT_RIDER_FILES], "prediction.raceTypeは予想タイプ文でありレース種目ではない。raceClassは番組名が混在し、安全な種目はbyRaceStageに限定される。", "専用raceTypeを定義する場合は予想タイプと分離する。"),
  audit("race-kind", "raceKind", ["race-type"], "unavailable", [], ["raceKind"], [HISTORY_DAILY_FILES, EXACT_RIDER_FILES], "raceKindキーは存在しない。", "byRaceStageで足りない分類だけ、明示ソースから将来蓄積する。"),
  audit("weather-raw", "weather", ["sunny-result", "cloudy-result", "rain-result", "snow-result"], "available", ["history.items[].weather.condition", "byWeather"], [], [HISTORY_DAILY_FILES, EXACT_RIDER_FILES], "履歴の天候条件と選手別集計が保存済み。", "実結果天候を優先し、未取得を補完しない。"),
  audit("timeslot-raw", "timeslot", ["timeslot"], "available", ["history.items[].timeslot", "byTimeslot"], [], [HISTORY_DAILY_FILES, EXACT_RIDER_FILES], "履歴と選手別集計に時間帯が保存済み。", "不明値を除外する。"),
  audit("bank-length-raw", "bankLength", ["bank-length"], "available", ["byBankLength", "dimensions.bankLength"], [], [EXACT_RIDER_FILES, RIDER_CATEGORY_FILE], "履歴レース直下にはないが、選手別EXACTとカテゴリ分析に確定周長が保存済み。", "既存集計を利用する。"),
  audit("venue-raw", "venue", ["venue"], "available", ["history.items[].venueKey", "history.items[].venueName", "byVenue"], [], [HISTORY_DAILY_FILES, EXACT_RIDER_FILES, EXACT_VENUE_FILES], "履歴・選手別・会場別EXACTに会場識別子が保存済み。", "既存会場分析を利用する。"),
] as const satisfies readonly KurariExSourceCapabilityAuditItem[];

export const KURARI_EX_SOURCE_CAPABILITY_STATUSES = Object.keys(
  KURARI_EX_SOURCE_CAPABILITY_STATUS_META,
) as KurariExSourceCapabilityStatus[];

export const KURARI_EX_SOURCE_CAPABILITY_AUDIT_SUMMARY =
  KURARI_EX_SOURCE_CAPABILITY_AUDIT.reduce(
    (summary, auditItem) => {
      summary[auditItem.capabilityStatus] += 1;
      return summary;
    },
    {
      available: 0,
      partial: 0,
      unavailable: 0,
      "fake-prohibited": 0,
    } satisfies Record<KurariExSourceCapabilityStatus, number>,
  );

export const KURARI_EX_SOURCE_CAPABILITY_FOCUS_IDS = [
  "by-grade",
  "by-race-type",
  "by-car-no",
  "straight-length",
  "same-prefecture",
  "tactic-raw",
  "kamashi",
  "tsuppari",
  "chigiri",
  "chigirare",
  "tobitsuki",
  "seri",
] as const;
