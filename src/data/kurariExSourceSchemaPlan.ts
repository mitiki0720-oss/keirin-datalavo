export type KurariExSourceSchemaCategory =
  | "grade"
  | "raceType"
  | "venueCondition"
  | "lineup"
  | "position"
  | "samePrefecture"
  | "tacticEvent"
  | "futureIndex";

export type KurariExSourceSchemaStatus =
  | "design-only"
  | "ready-for-script"
  | "blocked-by-source"
  | "fake-prohibited";

export type KurariExSourceSchemaPriority = "high" | "medium" | "low";

export type KurariExSourceSchemaPlanItem = {
  id: string;
  label: string;
  category: KurariExSourceSchemaCategory;
  schemaStatus: KurariExSourceSchemaStatus;
  targetOutput: readonly string[];
  requiredRawFields: readonly string[];
  normalizedFields: readonly string[];
  sourceCandidates: readonly string[];
  validationRules: readonly string[];
  fakeProhibitedRules: readonly string[];
  promotionTarget: string;
  relatedFuturePlanIds: readonly string[];
  relatedAuditIds: readonly string[];
  nextScriptCandidate: string;
  priority: KurariExSourceSchemaPriority;
};

const schema = (
  id: string,
  label: string,
  category: KurariExSourceSchemaCategory,
  schemaStatus: KurariExSourceSchemaStatus,
  targetOutput: readonly string[],
  requiredRawFields: readonly string[],
  normalizedFields: readonly string[],
  sourceCandidates: readonly string[],
  validationRules: readonly string[],
  fakeProhibitedRules: readonly string[],
  promotionTarget: string,
  relatedFuturePlanIds: readonly string[],
  relatedAuditIds: readonly string[],
  nextScriptCandidate: string,
  priority: KurariExSourceSchemaPriority,
): KurariExSourceSchemaPlanItem => ({
  id,
  label,
  category,
  schemaStatus,
  targetOutput,
  requiredRawFields,
  normalizedFields,
  sourceCandidates,
  validationRules,
  fakeProhibitedRules,
  promotionTarget,
  relatedFuturePlanIds,
  relatedAuditIds,
  nextScriptCandidate,
  priority,
});

export const KURARI_EX_SOURCE_SCHEMA_PLAN = [
  schema(
    "schema-grade",
    "grade正規化",
    "grade",
    "design-only",
    ["race grade fact", "選手別byGrade候補"],
    [
      "raceId",
      "sourceText",
      "rawGrade",
      "gradeKey",
      "gradeLabel",
      "gradeSource",
      "gradeConfidence",
      "isEstimated",
      "isUnknown",
      "normalizedAt",
    ],
    ["gradeKey", "gradeLabel", "gradeSource", "gradeConfidence", "gradeStatus"],
    ["公式開催情報", "履歴に保存済みのgrade原文", "出典を確認できる手動監査"],
    [
      "rawGradeとgradeKeyの許可対応表を版管理する。",
      "official / confirmed / estimated / unknownを別状態で保存する。",
      "不明・推定gradeを確定gradeの集計対象へ入れない。",
      "byGradeはofficialまたはconfirmedだけで生成する。",
    ],
    [
      "履歴内の曖昧なgradeをそのまま専用byGradeへ使わない。",
      "開催名・級班構成・見た目からgradeを推測しない。",
    ],
    "gradeKeyの確定率とunknown分離を監査後、partialからavailableを検討。",
    ["plan-by-grade"],
    ["by-grade", "grade-raw"],
    "scripts/generate-kurari-ex-grade-normalization.mjs（候補・未実装）",
    "high",
  ),
  schema(
    "schema-race-type",
    "raceType正規化",
    "raceType",
    "design-only",
    ["race type fact", "選手別byRaceType候補"],
    [
      "raceId",
      "sourceText",
      "rawRaceType",
      "raceTypeKey",
      "raceTypeLabel",
      "raceClass",
      "raceStageKey",
      "gradeKey",
      "raceTypeSource",
      "raceTypeConfidence",
    ],
    ["raceTypeKey", "raceTypeLabel", "raceStageKey", "raceTypeSource", "raceTypeConfidence"],
    ["公式番組名", "履歴のraceClass原文", "結果側の正式レース名称"],
    [
      "raceStageとraceTypeを別軸で保存する。",
      "prediction.raceTypeを公式raceTypeへ使用しない。",
      "byRaceStageとbyRaceTypeのキー空間を分離する。",
      "チャレンジ予選・A級特選・S級準決勝などを原文付きで正規化する。",
    ],
    [
      "byRaceStageをraceTypeへ読み替えない。",
      "予想文のタイプやTYPE-A/B/C/Dを公式種目として扱わない。",
      "準決勝を決勝へ、一般戦を特選へ混ぜない。",
    ],
    "raceStageとraceTypeを独立保存し、安全分類不能をunknownへ分離後にavailableを検討。",
    ["plan-by-race-type"],
    ["by-race-type", "race-type-raw", "race-kind"],
    "scripts/generate-kurari-ex-race-type-normalization.mjs（候補・未実装）",
    "high",
  ),
  schema(
    "schema-venue-condition",
    "venueCondition / 見なし直線",
    "venueCondition",
    "blocked-by-source",
    ["venueConditionMaster"],
    [
      "venueKey",
      "venueName",
      "bankLength",
      "straightLengthM",
      "sourceName",
      "sourceUrlLabel",
      "verifiedAt",
      "confidence",
      "note",
    ],
    ["venueKey", "bankLength", "straightLengthM", "sourceName", "verifiedAt", "confidence"],
    ["競輪場公式情報", "出典を固定した信頼できる会場資料", "出典付き手動マスター"],
    [
      "venueKeyとstraightLengthMを一対一で管理する。",
      "値・単位・出典・確認日を同時に保存する。",
      "bankLengthとstraightLengthMを別フィールドとして扱う。",
      "未確認会場はunknownのまま残す。",
    ],
    [
      "333m・400m・500mの周長から直線長を推測しない。",
      "会場名だけで直線長を補完しない。",
      "出典のない値を保存しない。",
    ],
    "対象会場の出典付きstraightLengthMが揃い、履歴venueKeyと結合検証後にavailableを検討。",
    ["plan-straight-length"],
    ["straight-length", "home-stretch"],
    "scripts/import-kurari-ex-venue-condition-master.mjs（候補・source確定まで未実装）",
    "medium",
  ),
  schema(
    "schema-lineup",
    "lineup / lineSize",
    "lineup",
    "ready-for-script",
    ["race lineup fact", "lineSize fact"],
    [
      "raceId",
      "lineupSourceText",
      "lineId",
      "lineOrder",
      "lineSize",
      "memberRegistrationNos",
      "unknownLine",
      "parseConfidence",
      "parsedAt",
    ],
    ["lineId", "lineOrder", "lineSize", "memberRegistrationNos", "unknownLine", "parseStatus"],
    ["履歴のlineup.lines", "登録番号解決済み出走表", "保存済み並び原文"],
    [
      "memberRegistrationNos.lengthとlineSizeを一致させる。",
      "出走表の登録番号に重複・欠落がないことを検査する。",
      "unknownLineを通常ラインへ混ぜない。",
      "単騎はlineSize=1かつ独立lineIdとして保存する。",
    ],
    [
      "曖昧な並びを無理に人数化しない。",
      "欠落選手を既存ラインへ推測で追加しない。",
      "車番だけから登録番号やlineIdを補完しない。",
    ],
    "完全性チェックを通過したlineupだけ保存し、unknownLineを分離後にavailableを検討。",
    ["plan-line-size"],
    ["line-size"],
    "scripts/generate-kurari-ex-lineup-facts.mjs（候補・未実装）",
    "high",
  ),
  schema(
    "schema-position",
    "position / role",
    "position",
    "ready-for-script",
    ["race rider position fact"],
    [
      "raceId",
      "registrationNo",
      "lineId",
      "positionInLine",
      "roleKey",
      "roleSource",
      "roleConfidence",
      "isSingle",
      "parsedAt",
    ],
    ["positionInLine", "roleKey", "isSingle", "roleConfidence", "roleStatus"],
    ["検証済みlineup fact", "登録番号解決済み出走表", "保存済み並び原文"],
    [
      "lineSizeとpositionInLineの範囲を一致させる。",
      "positionInLine=1はfront、2はbante、3以上はthirdとする。",
      "lineSize=1の場合だけsingleとする。",
      "roleKeyは当該レースの検証済み並びから決定する。",
    ],
    [
      "脚質・車番・過去傾向から位置を推測しない。",
      "過去byRoleを今回レースのroleKeyへ流用しない。",
      "解析不能選手を単騎へ補完しない。",
    ],
    "lineup完全性と全選手のposition整合を検証し、unknownを分離後にavailableを検討。",
    ["plan-position"],
    ["position", "by-role"],
    "scripts/generate-kurari-ex-position-facts.mjs（候補・lineup fact依存）",
    "high",
  ),
  schema(
    "schema-same-prefecture",
    "samePrefecture / 同県同乗",
    "samePrefecture",
    "design-only",
    ["race rider same-prefecture fact"],
    [
      "raceId",
      "registrationNo",
      "prefecture",
      "samePrefectureRegistrationNos",
      "samePrefectureCount",
      "sameLineFlag",
      "prefectureSource",
      "identityConfidence",
    ],
    [
      "prefecture",
      "samePrefectureRegistrationNos",
      "samePrefectureCount",
      "sameLineFlag",
      "identityConfidence",
    ],
    ["公式登録番号と府県情報", "登録番号解決済みrider master", "検証済みlineup fact"],
    [
      "登録番号ベースで府県が確定した選手だけを対象にする。",
      "同県同乗と同一ラインを別フィールドで保存する。",
      "府県未解決・登録番号未解決をunknownへ分離する。",
      "samePrefectureCountとregistrationNos件数を一致させる。",
    ],
    [
      "同県を同ライン・連携あり・有利と断定しない。",
      "選手名だけから府県を推測しない。",
      "未解決選手を同県なしとして数えない。",
    ],
    "登録番号ベースの府県coverageとsameLine分離を監査後にavailableを検討。",
    ["plan-same-prefecture"],
    ["same-prefecture"],
    "scripts/generate-kurari-ex-same-prefecture-facts.mjs（候補・未実装）",
    "medium",
  ),
  schema(
    "schema-tactic-event",
    "tacticEvent / 戦法イベント生データ",
    "tacticEvent",
    "blocked-by-source",
    ["race tactic event fact", "eventType別監査ログ"],
    [
      "raceId",
      "eventId",
      "eventType",
      "lapPoint",
      "actorRegistrationNo",
      "targetRegistrationNo",
      "relatedLineId",
      "relatedPosition",
      "eventOccurred",
      "result",
      "successFlag",
      "confidence",
      "evidenceText",
      "source",
      "judgedAt",
      "ruleVersion",
    ],
    [
      "eventType",
      "eventOccurred",
      "result",
      "successFlag",
      "actorRegistrationNo",
      "targetRegistrationNo",
      "confidence",
      "ruleVersion",
    ],
    ["レース映像の確認記録", "公式または信頼できる展開テキスト", "根拠文付き手動Review"],
    [
      "eventTypeごとに認定・非認定条件を版管理する。",
      "イベント発生と成功を別フィールドで保存する。",
      "actor・target・lineId・positionの整合を検査する。",
      "evidenceText・source・ruleVersionを必須にする。",
      "LOW SAMPLEを分離し、非発生を保存する場合も確認根拠を必須にする。",
    ],
    [
      "着順だけでかまし・つっぱり成功率を作らない。",
      "番手成績だけで競り勝率を作らない。",
      "ライン分断だけでちぎり・ちぎられを推測しない。",
      "競り記録がないことを番手無風として扱わない。",
      "明示根拠のない過去レースへイベントを後付けしない。",
    ],
    "根拠source、共通スキーマ、eventType別ルール、二重判定可能な監査ログが揃ってからpartialを検討。",
    [
      "plan-tactic-event-raw",
      "plan-kamashi",
      "plan-tsuppari",
      "plan-chigiri",
      "plan-chigirare",
      "plan-tobitsuki",
      "plan-seri",
    ],
    ["tactic-raw", "kamashi", "tsuppari", "chigiri", "chigirare", "tobitsuki", "seri"],
    "scripts/import-kurari-ex-tactic-events.mjs（候補・source確定まで未実装）",
    "high",
  ),
  schema(
    "schema-future-index",
    "futureIndex / 将来指数",
    "futureIndex",
    "fake-prohibited",
    ["versioned index input snapshot", "監査可能な指数出力候補"],
    [
      "ruleVersion",
      "inputSnapshot",
      "sourceMetricRefs",
      "missingPolicy",
      "lowSamplePolicy",
      "weightConfig",
      "outputReason",
      "backtestWindow",
      "validationLog",
    ],
    [
      "ruleVersion",
      "sourceMetricRefs",
      "missingPolicy",
      "lowSamplePolicy",
      "weightConfig",
      "outputReason",
      "validationStatus",
    ],
    ["availableへ昇格済みの元指標", "予想時点の固定input snapshot", "再現可能なbacktestと監査ログ"],
    [
      "全sourceMetricRefsがavailableであることを確認する。",
      "重み・欠損処理・LOW SAMPLE処理をruleVersionで固定する。",
      "予想時点の入力だけを使用し、結果後情報の混入を検査する。",
      "backtestWindowとvalidationLogを保存する。",
    ],
    [
      "根拠未定のスコア・重み・閾値を作らない。",
      "結果後データで指数を後付けしない。",
      "LOW SAMPLEやidentity-onlyを勝手に強さ・弱さへ点数化しない。",
      "既存推奨メモを数値へ読み替えない。",
    ],
    "元指標・重み・時点固定・backtest・監査ログが揃うまでfake-prohibitedを維持。",
    [
      "plan-axis-index",
      "plan-opponent-index",
      "plan-third-guard-index",
      "plan-longshot-index",
      "plan-exclude-index",
      "plan-development-dependence",
      "plan-line-monopoly",
      "plan-other-line-alert",
    ],
    [],
    "スクリプト候補なし（元指標available化と検証設計完了後に判断）",
    "low",
  ),
] as const satisfies readonly KurariExSourceSchemaPlanItem[];

export const KURARI_EX_SOURCE_SCHEMA_PRIORITIES = ["high", "medium", "low"] as const;
export const KURARI_EX_SOURCE_SCHEMA_STATUSES = [
  "design-only",
  "ready-for-script",
  "blocked-by-source",
  "fake-prohibited",
] as const;
export const KURARI_EX_SOURCE_SCHEMA_CATEGORIES = [
  "grade",
  "raceType",
  "venueCondition",
  "lineup",
  "position",
  "samePrefecture",
  "tacticEvent",
  "futureIndex",
] as const;

export const KURARI_EX_SOURCE_SCHEMA_PRIORITY_SUMMARY =
  KURARI_EX_SOURCE_SCHEMA_PLAN.reduce(
    (summary, item) => {
      summary[item.priority] += 1;
      return summary;
    },
    { high: 0, medium: 0, low: 0 } satisfies Record<KurariExSourceSchemaPriority, number>,
  );

export const KURARI_EX_SOURCE_SCHEMA_STATUS_SUMMARY =
  KURARI_EX_SOURCE_SCHEMA_PLAN.reduce(
    (summary, item) => {
      summary[item.schemaStatus] += 1;
      return summary;
    },
    {
      "design-only": 0,
      "ready-for-script": 0,
      "blocked-by-source": 0,
      "fake-prohibited": 0,
    } satisfies Record<KurariExSourceSchemaStatus, number>,
  );

export const KURARI_EX_SOURCE_SCHEMA_CATEGORY_SUMMARY =
  KURARI_EX_SOURCE_SCHEMA_PLAN.reduce(
    (summary, item) => {
      summary[item.category] += 1;
      return summary;
    },
    {
      grade: 0,
      raceType: 0,
      venueCondition: 0,
      lineup: 0,
      position: 0,
      samePrefecture: 0,
      tacticEvent: 0,
      futureIndex: 0,
    } satisfies Record<KurariExSourceSchemaCategory, number>,
  );
