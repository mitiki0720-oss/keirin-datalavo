export type KurariExAnalysisInventoryStatus =
  | "existing"
  | "extend-existing"
  | "available-not-rendered"
  | "partial"
  | "low-sample"
  | "future-accumulation"
  | "not-generated/fake-prohibited";

export type KurariExAnalysisInventoryItem = {
  id: string;
  category: string;
  label: string;
  status: KurariExAnalysisInventoryStatus;
  currentSection: string;
  sourceKeys: readonly string[];
  duplicateOf: string | null;
  displayPlan: string;
  dataRequirement: string;
  note: string;
};

const item = (
  id: string,
  category: string,
  label: string,
  status: KurariExAnalysisInventoryStatus,
  currentSection: string,
  sourceKeys: readonly string[],
  duplicateOf: string | null,
  displayPlan: string,
  dataRequirement: string,
  note: string,
): KurariExAnalysisInventoryItem => ({
  id,
  category,
  label,
  status,
  currentSection,
  sourceKeys,
  duplicateOf,
  displayPlan,
  dataRequirement,
  note,
});

export const KURARI_EX_ANALYSIS_STATUS_META: Record<
  KurariExAnalysisInventoryStatus,
  { label: string; description: string }
> = {
  existing: {
    label: "EXISTING",
    description: "既存セクションまたは保存済み分析として利用中。別名で新規実装しない。",
  },
  "extend-existing": {
    label: "EXTEND EXISTING",
    description: "既存分析の表示・分類を安全に拡張する候補。新しい重複セクションは作らない。",
  },
  "available-not-rendered": {
    label: "AVAILABLE / NOT RENDERED",
    description: "保存済みソースはあるが、専用表示がない項目。",
  },
  partial: {
    label: "PARTIAL",
    description: "一部の安全な分類だけ利用中。曖昧なデータは混ぜない。",
  },
  "low-sample": {
    label: "LOW SAMPLE",
    description: "保存値はあるが母数不足。参考扱いのまま維持する。",
  },
  "future-accumulation": {
    label: "FUTURE ACCUMULATION",
    description: "根拠データや安全な分類ルールを今後蓄積してから実装する。",
  },
  "not-generated/fake-prohibited": {
    label: "NOT GENERATED / FAKE PROHIBITED",
    description: "根拠がないため数値を生成しない。推測・後付け分類は禁止。",
  },
};

export const KURARI_EX_ANALYSIS_INVENTORY = [
  item("exact-starters-source", "既存セクション", "正確出走選手ソース", "existing", "Exact starters source", ["source/starters/index.generated.json", "source/starters/latest", "registrationNo"], null, "保存済みsourceを読み取り専用で表示", "2026-06-29 source: 64 races / 464 starters / identityKey registrationNo", "current todayとは分離した保存済みsource。fake補完・fuzzy matching・result/lineup/prediction source由来のidentity生成は禁止。"),
  item("current-position", "既存セクション", "KURARI EX 現在地", "existing", "KURARI EX 現在地", ["coverage", "quality"], null, "現行表示を維持", "既存集計のみ", "EX全体の実装状況を示す既存セクション。"),
  item("rider-exact-list", "既存セクション", "選手別EXACT一覧", "existing", "選手別EXACT一覧", ["exact/riders", "quality", "coverage"], null, "現行表示を維持", "保存済み選手EXACT", "新しい選手一覧を重複追加しない。"),
  item("search-filter", "既存セクション", "検索・フィルタ", "existing", "選手別EXACT一覧", ["exact/riders/index", "exact/matchups/index"], "rider-exact-list", "既存一覧を絞り込む", "保存済みindexと個別EXACT", "独立した検索ページを重複実装しない。"),
  item("condition-data", "既存セクション", "条件別データ", "existing", "条件別データ", ["byBankLength", "byTimeslot", "byRaceStage", "byWeather"], null, "現行タブを維持", "保存済み条件別EXACT", "条件軸はこの既存セクションへ追加する。"),
  item("role-data", "既存セクション", "位置・役割別成績", "existing", "位置・役割別成績", ["byRole"], null, "現行タブを維持", "安全に判定済みの並び", "脚質だけで役割を補完しない。"),
  item("matchup-list", "既存セクション", "MATCHUP / 相性データ一覧", "existing", "MATCHUP / 相性データ一覧", ["matchup", "sameLine", "otherLine"], null, "現行一覧を維持", "保存済み対戦ペア", "存在しない対戦ペアを作らない。"),
  item("relationship-notes", "既存セクション", "ライン・関係性メモ", "existing", "ライン・関係性メモ", ["matchup", "byRole", "sameLine", "otherLine"], null, "現行表示を維持", "保存済み関係性材料", "同県・脚質だけでは関係性を断定しない。"),
  item("tactic-management", "既存セクション", "戦法イベント管理欄", "existing", "戦法イベント管理欄", ["tactic", "KURARI_EX_TACTIC_EVENT_RULES"], null, "ルール固定状況だけ表示", "明示タグ・展開メモ", "成功率や発生回数は未生成。"),
  item("public-data-health", "既存セクション", "公開データの生成状態", "existing", "公開データの生成状態", ["coverage", "status.generated.json"], null, "現行表示を維持", "生成済みstatus", "生成ファイル自体は今回変更しない。"),
  item("analysis-checklist", "既存セクション", "分析項目チェックリスト", "existing", "分析項目チェックリスト", ["KURARI_EX_DATA_INVENTORY"], null, "概要チェックリストとして維持", "既存棚卸し定義", "本マップは詳細台帳であり、既存チェックリストを置換しない。"),
  item("quality-legend", "既存セクション", "データ品質の4段階", "existing", "データ品質の4段階", ["sourceType", "quality"], null, "現行凡例を維持", "SEED / EXACT / PROXY / MANUAL", "品質の意味を示す既存表示。"),
  item("global-trends", "既存セクション", "全体傾向", "existing", "全体傾向", ["predictionKpi", "racePattern"], null, "現行表示を維持", "SummaryとEXACTの保存値", "未保存指標を追加しない。"),
  item("today-recommendation-section", "既存セクション", "今日の推奨メモ", "existing", "今日の推奨メモ", ["today-recommendation", "predictionMemo"], null, "現行表示を維持", "保存済み推奨JSON", "買い目ロジックの変更対象ではない。"),

  item("low-sample-display", "品質・監査", "LOW SAMPLE表示", "existing", "複数セクション", ["quality", "confirmedStartCount"], null, "既存バッジを共通利用", "保存済み母数とquality", "強い根拠へ格上げしない。"),
  item("identity-only-display", "品質・監査", "identity-only表示", "existing", "選手別EXACT一覧", ["quality", "identity"], null, "素材蓄積中として表示", "保存済みidentity", "成績根拠には使わない。"),
  item("fake-prohibition-display", "品質・監査", "fake禁止表示", "existing", "複数セクション", ["fake", "warnings"], null, "既存注意文を維持", "固定運用ルール", "未取得値を補完しない。"),
  item("coverage-display", "品質・監査", "coverage表示", "existing", "KURARI EX 現在地 / 公開データの生成状態", ["coverage"], null, "既存件数を表示", "生成済みcoverage", "観測・解析可能範囲を区別する。"),
  item("quality-display", "品質・監査", "quality表示", "existing", "複数セクション", ["quality"], null, "既存品質バッジを表示", "生成済みquality", "セクションごとの意味を維持する。"),
  item("low-sample-warning", "品質・監査", "LOW SAMPLE警告", "existing", "複数セクション", ["quality", "confirmedStartCount"], "low-sample-display", "既存バッジ・注意文を利用", "母数閾値と保存済みquality", "新しい指数ではない。"),
  item("data-shortage-warning", "品質・監査", "データ不足警告", "existing", "複数セクション", ["coverage", "warnings", "identity-only"], "coverage-display", "既存warningを利用", "保存済みcoverageとwarnings", "欠損値を推測で埋めない。"),
  item("fake-prohibition-status", "品質・監査", "fake禁止ステータス", "existing", "分析項目マップ / 戦法イベント管理欄", ["fake", "unsupportedExactMetrics"], "fake-prohibition-display", "生成禁止項目を明示", "固定運用ルール", "数値ではなく管理状態。"),

  item("rider-score", "公開済み分析", "rider-score", "existing", "選手カルテランキング", ["rider-score.generated.json"], null, "現行ランキングを維持", "保存済み分析JSON", "再計算・再生成は今回行わない。"),
  item("rider-tags", "公開済み分析", "rider-tags", "existing", "選手カルテランキング", ["rider-score.items.tags"], "rider-score", "既存タグ表示を利用", "保存済みrider tags", "別タグ体系を重複作成しない。"),
  item("rider-category-analysis", "公開済み分析", "rider-category-analysis", "existing", "PLAYER CATEGORY ANALYSIS", ["rider-category-analysis.generated.json"], null, "現行カテゴリ分析を維持", "保存済み分析JSON", "条件別データの集約ソース。"),
  item("venue-score", "公開済み分析", "venue-score", "existing", "会場カルテランキング", ["venue-score.generated.json"], null, "現行ランキングを維持", "保存済み分析JSON", "新しい会場スコアを重複生成しない。"),
  item("insight-tags", "公開済み分析", "insight-tags", "existing", "会場カルテランキング / 今日の推奨メモ", ["topInsights", "globalTags"], null, "既存タグを表示", "保存済みinsight tags", "タグ内容を推測で追加しない。"),
  item("next-guidance", "公開済み分析", "next-guidance", "existing", "会場詳細 / 今日の推奨メモ", ["actions", "predictionMemo"], null, "既存ガイダンスを利用", "保存済みactionsとmemo", "買い目を自動変更しない。"),
  item("today-recommendation-data", "公開済み分析", "today-recommendation", "existing", "今日の推奨メモ", ["today-recommendation.generated.json"], "today-recommendation-section", "既存セクションへ表示", "保存済み推奨JSON", "同名セクションを追加しない。"),

  item("race-type", "条件別", "レース種目別", "partial", "条件別データ / PLAYER CATEGORY ANALYSIS", ["byRaceStage", "byClass", "history.items[].raceClass"], "condition-data", "安全分類済みの種目だけ既存条件別へ集約", "専用byRaceTypeと安全な分類ルール", "専用byRaceTypeは存在しない。prediction.raceTypeは予想タイプ文であり、レース種目として使わない。"),
  item("bank-length", "条件別", "周長", "existing", "条件別データ", ["byBankLength"], "condition-data", "既存周長タブを利用", "保存済み会場周長", "333m / 400m / 500mを二重実装しない。"),
  item("home-stretch", "条件別", "見なし直線", "future-accumulation", "未表示", [], null, "会場条件へ将来追加", "信頼できる会場マスタと定義", "現行EXACTに保存軸がない。"),
  item("venue", "条件別", "競輪場別", "existing", "PLAYER CATEGORY ANALYSIS / 会場カルテランキング", ["byVenue", "venue-score"], null, "既存会場分析を利用", "保存済みbyVenue", "別の会場別集計を作らない。"),
  item("position", "条件別", "位置別", "existing", "位置・役割別成績", ["byRole"], "role-data", "既存役割タブを利用", "安全に解析済みの並び", "脚質による代用は禁止。"),
  item("timeslot", "条件別", "時間帯別", "existing", "条件別データ", ["byTimeslot"], "condition-data", "既存時間帯タブを利用", "保存済み時間帯", "未取得時間帯を補完しない。"),
  item("schedule-stage", "条件別", "日程別", "partial", "条件別データ / PLAYER CATEGORY ANALYSIS", ["byRaceStage", "byClass"], "race-type", "安全なステージだけ既存表示", "準決勝を分離できる確定分類", "現状は予選・一般・特選・決勝中心。"),
  item("grade", "条件別", "グレード別", "partial", "履歴JSONにraw値あり / 専用表示なし", ["history.items[].grade"], null, "明示gradeだけを使う既存条件別の拡張候補", "推定・想定・不明を除外したbyGrade", "履歴にgradeはあるが推定・想定・不明が混在し、専用byGrade集計は存在しない。"),
  item("grade-race-type", "条件別", "グレード×レース種目", "future-accumulation", "未表示", [], "grade", "条件別データの将来拡張", "確定gradeと安全なrace type", "どちらか不明なレースは除外する。"),
  item("car-no", "条件別", "車番別", "existing", "PLAYER CATEGORY ANALYSIS", ["byCarNo"], null, "既存カテゴリ分析を利用", "保存済みbyCarNo", "選手indexの固定車番とは別物。"),
  item("same-prefecture-start", "関係性", "同県選手同乗時", "future-accumulation", "ライン・関係性メモへ将来追加", [], null, "既存関係性セクションを拡張", "登録番号一致・府県・同走記録", "同県だけで連携を断定しない。"),
  item("same-line", "関係性", "同一ライン", "existing", "MATCHUP / 相性データ一覧", ["sameLine", "matchup"], "matchup-list", "既存MATCHUPを利用", "安全に分類済みのライン", "存在しないペアを生成しない。"),
  item("other-line", "関係性", "別ライン", "existing", "MATCHUP / 相性データ一覧", ["otherLine", "matchup"], "matchup-list", "既存MATCHUPを利用", "安全に分類済みのライン", "ライン不明レースを混ぜない。"),

  item("kamashi-rate", "戦法イベント", "かまし成功率", "not-generated/fake-prohibited", "戦法イベント管理欄", ["tactic", "unsupportedExactMetrics.kamashiSuccessRate"], "tactic-management", "未蓄積のまま表示", "明示イベントと成功判定", "順位・脚質・役割だけで生成しない。"),
  item("tsuppari-rate", "戦法イベント", "つっぱり成功率", "not-generated/fake-prohibited", "戦法イベント管理欄", ["tactic", "unsupportedExactMetrics.tsuppariSuccessRate"], "tactic-management", "未蓄積のまま表示", "明示イベントと成功判定", "後付け分類しない。"),
  item("chigiri-rate", "戦法イベント", "ちぎり率", "not-generated/fake-prohibited", "戦法イベント管理欄", ["tactic"], "tactic-management", "未蓄積のまま表示", "明示イベント記録", "着差や1着だけで生成しない。"),
  item("chigirare-rate", "戦法イベント", "ちぎられ率", "not-generated/fake-prohibited", "戦法イベント管理欄", ["tactic"], "tactic-management", "未蓄積のまま表示", "明示イベント記録", "着外だけで生成しない。"),
  item("tobitsuki-rate", "戦法イベント", "飛びつき成功率", "not-generated/fake-prohibited", "戦法イベント管理欄", ["tactic"], "tactic-management", "未蓄積のまま表示", "明示イベントと位置確保", "位置結果だけで生成しない。"),
  item("seri-win-rate", "戦法イベント", "競りの勝率", "not-generated/fake-prohibited", "戦法イベント管理欄", ["tactic", "unsupportedExactMetrics.seriWinRate"], "tactic-management", "未蓄積のまま表示", "競り発生・当事者・勝敗タグ", "順位だけで生成しない。"),
  item("front-role-result", "役割別", "ラインの先頭の成績", "existing", "位置・役割別成績", ["byRole.front"], "role-data", "既存役割タブを利用", "安全に解析済みの並び", "脚質だけで先頭にしない。"),
  item("bante-role-result", "役割別", "番手の成績", "existing", "位置・役割別成績", ["byRole.bante"], "role-data", "既存役割タブを利用", "安全に解析済みの並び", "追込脚質を番手扱いしない。"),
  item("third-role-result", "役割別", "3番手以降の成績", "existing", "位置・役割別成績", ["byRole.third"], "role-data", "既存役割タブを利用", "安全に解析済みの並び", "4番手以降を別分類へ補完しない。"),
  item("single-role-result", "役割別", "単騎の成績", "existing", "位置・役割別成績", ["byRole.single"], "role-data", "既存役割タブを利用", "安全に解析済みの並び", "ライン不明を単騎扱いしない。"),
  item("seri-result", "役割別", "競りの成績", "not-generated/fake-prohibited", "戦法イベント管理欄", ["tactic"], "seri-win-rate", "未蓄積のまま表示", "競り発生・当事者の明示タグ", "番手成績から競りを推測しない。"),

  item("qualifying-result", "ステージ別", "予選の成績", "existing", "条件別データ", ["byRaceStage.qualifying"], "race-type", "既存レース種目タブを利用", "保存済み安全分類", "分類不能レースを除外。"),
  item("semifinal-result", "ステージ別", "準決勝の成績", "partial", "PLAYER CATEGORY ANALYSIS", ["byClass"], "schedule-stage", "安全分類の拡張候補", "準決勝専用の確定分類", "決勝へ混入させない。"),
  item("final-result", "ステージ別", "決勝の成績", "existing", "条件別データ", ["byRaceStage.final"], "race-type", "既存レース種目タブを利用", "保存済み安全分類", "準決勝を含めない。"),
  item("consolation-result", "ステージ別", "敗者戦の成績", "existing", "条件別データ", ["byRaceStage.consolation"], "race-type", "既存レース種目タブを利用", "保存済み安全分類", "一般・敗者戦の既存分類を維持。"),
  item("seed-result", "ステージ別", "シード戦の成績", "existing", "条件別データ", ["byRaceStage.seed-special"], "race-type", "既存レース種目タブを利用", "保存済み安全分類", "特選・シードの既存分類を維持。"),

  item("bank-400-result", "バンク別", "400mバンクの成績", "existing", "条件別データ", ["byBankLength.400"], "bank-length", "既存周長タブを利用", "保存済みbyBankLength", "周長の重複項目。"),
  item("bank-333-result", "バンク別", "333mバンクの成績", "existing", "条件別データ", ["byBankLength.333"], "bank-length", "既存周長タブを利用", "保存済みbyBankLength", "周長の重複項目。"),
  item("bank-500-result", "バンク別", "500mバンクの成績", "existing", "条件別データ", ["byBankLength.500"], "bank-length", "既存周長タブを利用", "保存済みbyBankLength", "周長の重複項目。"),

  item("sunny-result", "天候別", "晴れの成績", "existing", "条件別データ", ["byWeather.sunny"], "condition-data", "既存天候タブを利用", "保存済みbyWeather", "実結果天候を優先。"),
  item("cloudy-result", "天候別", "曇りの成績", "existing", "条件別データ", ["byWeather.cloudy"], "condition-data", "既存天候タブを利用", "保存済みbyWeather", "未取得天候を補完しない。"),
  item("rain-result", "天候別", "雨の成績", "existing", "条件別データ", ["byWeather.rain"], "condition-data", "既存天候タブを利用", "保存済みbyWeather", "取得済み値だけ使用。"),
  item("snow-result", "天候別", "雪の成績", "future-accumulation", "条件別データ", ["byWeather.snow"], "condition-data", "未蓄積表示を維持", "保存済み雪天候の実績", "実績がない限り生成しない。"),

  item("morning-result", "時間帯別", "モーニングの成績", "existing", "条件別データ", ["byTimeslot.morning"], "timeslot", "既存時間帯タブを利用", "保存済みbyTimeslot", "不明時間帯を混ぜない。"),
  item("day-result", "時間帯別", "デイの成績", "existing", "条件別データ", ["byTimeslot.day"], "timeslot", "既存時間帯タブを利用", "保存済みbyTimeslot", "不明時間帯を混ぜない。"),
  item("night-result", "時間帯別", "ナイターの成績", "existing", "条件別データ", ["byTimeslot.night"], "timeslot", "既存時間帯タブを利用", "保存済みbyTimeslot", "不明時間帯を混ぜない。"),
  item("midnight-result", "時間帯別", "ミッドナイトの成績", "existing", "条件別データ", ["byTimeslot.midnight"], "timeslot", "既存時間帯タブを利用", "保存済みbyTimeslot", "不明時間帯を混ぜない。"),

  item("first-place", "着順分布", "1着", "existing", "選手別EXACT一覧 / PLAYER CATEGORY ANALYSIS", ["overall.wins"], null, "既存集計を利用", "保存済み着順", "別集計を作らない。"),
  item("second-place", "着順分布", "2着", "existing", "選手別EXACT一覧 / PLAYER CATEGORY ANALYSIS", ["overall.seconds"], null, "既存集計を利用", "保存済み着順", "別集計を作らない。"),
  item("third-place", "着順分布", "3着", "existing", "選手別EXACT一覧 / PLAYER CATEGORY ANALYSIS", ["overall.thirds"], null, "既存集計を利用", "保存済み着順", "別集計を作らない。"),
  item("outside-place", "着順分布", "着外", "existing", "選手別EXACT一覧 / PLAYER CATEGORY ANALYSIS", ["overall.outside"], null, "既存集計を利用", "保存済み着順", "別集計を作らない。"),
  item("win-rate", "着順分布", "勝率", "existing", "選手別EXACT一覧 / PLAYER CATEGORY ANALYSIS", ["overall.winRate"], null, "既存集計を利用", "保存済み率", "再計算指標を作らない。"),
  item("top2-rate", "着順分布", "連対率", "existing", "選手別EXACT一覧 / PLAYER CATEGORY ANALYSIS", ["overall.top2Rate"], null, "既存集計を利用", "保存済み率", "2連対率と同義。"),
  item("top3-rate", "着順分布", "3連対率", "existing", "選手別EXACT一覧 / PLAYER CATEGORY ANALYSIS", ["overall.top3Rate"], null, "既存集計を利用", "保存済み率", "3着以内率と同義。"),
  item("outside-rate", "着順分布", "着外率", "extend-existing", "選手別EXACT一覧", ["overall.outside", "overall.starts"], "outside-place", "既存着順分布の拡張候補", "保存済み着外数と出走数の正式定義", "今回数値は生成しない。"),

  item("axis-candidate-index", "将来指数", "軸候補指数", "not-generated/fake-prohibited", "未表示", [], null, "根拠設計後に検討", "検証済み定義・入力・閾値", "現時点で数値を作らない。"),
  item("opponent-candidate-index", "将来指数", "相手候補指数", "not-generated/fake-prohibited", "未表示", [], null, "根拠設計後に検討", "検証済み定義・入力・閾値", "現時点で数値を作らない。"),
  item("third-guard-index", "将来指数", "3着保護指数", "not-generated/fake-prohibited", "未表示", [], null, "根拠設計後に検討", "検証済み定義・入力・閾値", "today-recommendationの文言を指数へ読み替えない。"),
  item("longshot-index", "将来指数", "穴候補指数", "not-generated/fake-prohibited", "未表示", [], null, "根拠設計後に検討", "オッズ・結果・検証済み定義", "人気や名前だけで生成しない。"),
  item("exclude-index", "将来指数", "消し候補指数", "not-generated/fake-prohibited", "未表示", [], null, "根拠設計後に検討", "検証済み除外ルール", "欠損やLOW SAMPLEを消し根拠にしない。"),
  item("low-payout-risk", "将来指数", "低配当危険度", "not-generated/fake-prohibited", "未表示", [], null, "根拠設計後に検討", "保存済みオッズ・払戻・検証", "現在の成績率から推測しない。"),
  item("development-dependence", "将来指数", "展開依存度", "not-generated/fake-prohibited", "未表示", [], null, "イベント蓄積後に検討", "明示された展開イベント", "脚質・役割だけで生成しない。"),
  item("single-alert", "将来指数", "単騎警戒度", "not-generated/fake-prohibited", "未表示", ["byRole.single"], "single-role-result", "既存単騎成績の将来拡張", "十分な単騎母数と検証済み定義", "単騎成績を警戒指数へ自動変換しない。"),
  item("bante-sashi-expectation", "将来指数", "番手差し期待度", "not-generated/fake-prohibited", "未表示", ["byRole.bante"], "bante-role-result", "既存番手成績の将来拡張", "番手差しイベントと十分な母数", "番手1着だけで差しと断定しない。"),
  item("front-survival-expectation", "将来指数", "先行残り期待度", "not-generated/fake-prohibited", "未表示", ["byRole.front"], "front-role-result", "既存先頭成績の将来拡張", "先行イベントと十分な母数", "ライン先頭を先行戦法へ読み替えない。"),
  item("makuri-arrival-expectation", "将来指数", "捲り届き期待度", "not-generated/fake-prohibited", "未表示", ["winningMethods.sprint"], null, "根拠設計後に検討", "捲り発生母数と成否定義", "捲り決まり手数だけで期待度を作らない。"),
  item("line-monopoly-expectation", "将来指数", "ライン独占期待度", "not-generated/fake-prohibited", "未表示", ["sameLine"], "same-line", "既存同ライン比較の将来拡張", "ライン構成と着順の確定記録", "MATCHUP先着率を独占率へ読み替えない。"),
  item("other-line-settlement-alert", "将来指数", "別線決着警戒度", "not-generated/fake-prohibited", "未表示", ["otherLine"], "other-line", "既存別線比較の将来拡張", "別線決着の正式定義と母数", "順位だけで因果を作らない。"),
  item("bante-uncontested-rate", "将来指数", "番手無風率", "not-generated/fake-prohibited", "未表示", [], null, "競りイベント蓄積後に検討", "番手・競り有無の明示記録", "競りタグなしで無風と断定しない。"),
  item("third-line-survival-index", "将来指数", "ライン3番手残り目指数", "not-generated/fake-prohibited", "未表示", ["byRole.third"], "third-role-result", "既存3番手成績の将来拡張", "十分な母数と検証済み定義", "3番手成績を指数へ自動変換しない。"),
  item("same-prefecture-adjustment", "将来指数", "同県連携補正", "not-generated/fake-prohibited", "未表示", [], "same-prefecture-start", "同県同乗データ蓄積後に検討", "登録番号一致・同走・連携の明示根拠", "同県だけで補正しない。"),
  item("local-area-adjustment", "将来指数", "地元/地区補正", "not-generated/fake-prohibited", "未表示", [], null, "会場・地区定義後に検討", "登録番号一致・所属・会場・検証", "府県名だけで有利不利を作らない。"),
  item("recent-form-adjustment", "将来指数", "直近調子補正", "future-accumulation", "未表示", [], null, "時系列分析として将来追加", "日付順の確定結果と期間定義", "現時点では補正値を生成しない。"),
  item("history-index-consumer", "History consumer", "History index consumer", "existing", "KURARI EX History Overview", ["history/index.generated.json", "items[].file"], null, "58日・4373R・latest path を読み取り専用表示", "保存済み history index", "implemented。index の値を生成・変更しない。"),
  item("history-daily-consumer", "History consumer", "History daily consumer", "existing", "Selected Daily Summary / Venue / Race Preview", ["history/daily/YYYY-MM/YYYY-MM-DD.generated.json"], null, "index item の file path から選択日を表示", "保存済み daily payload", "implemented。STARTERS_PARSED / NO_STARTERS / MIXED を欠損補完なしで分類する。"),
  item("history-registration-no-coverage", "Identity safety", "History registrationNo coverage", "partial", "Selected Daily Summary", ["items[].starters[].registrationNo"], null, "あり・なし・NO_STARTERS を区別して表示", "保存済み registrationNo のみ", "2480件の欠損は missing のまま扱う。"),
  item("history-same-name-warning", "Identity safety", "Same-name candidate warning", "existing", "Identity Safety Notes", ["starters[].name", "starters[].registrationNo"], null, "既知候補を注意表示し自動統合しない", "registrationNo と同姓同名候補監査", "implemented。山口貴弘の未割当9件は手動確認対象。"),
  item("history-registration-no-auto-backfill", "Identity safety", "Automatic registrationNo backfill", "not-generated/fake-prohibited", "Identity Safety Notes", ["starters[].registrationNo"], null, "source 不足は欠損として維持", "正規 source が必要", "source-missing。名前・予測・結果・review から生成しない。"),
  item("history-daily-automation", "History consumer", "History daily automation", "future-accumulation", "未実装", [], null, "将来の収集・検証・index 更新ジョブとして計画", "安全な source collection と writer/checker", "planned / not implemented。今回の page consumer には含めない。"),
] as const satisfies readonly KurariExAnalysisInventoryItem[];

export const KURARI_EX_ANALYSIS_INVENTORY_STATUSES = Object.keys(
  KURARI_EX_ANALYSIS_STATUS_META,
) as KurariExAnalysisInventoryStatus[];

export const KURARI_EX_ANALYSIS_INVENTORY_SUMMARY = KURARI_EX_ANALYSIS_INVENTORY.reduce(
  (summary, inventoryItem) => {
    summary[inventoryItem.status] += 1;
    return summary;
  },
  {
    existing: 0,
    "extend-existing": 0,
    "available-not-rendered": 0,
    partial: 0,
    "low-sample": 0,
    "future-accumulation": 0,
    "not-generated/fake-prohibited": 0,
  } satisfies Record<KurariExAnalysisInventoryStatus, number>,
);
