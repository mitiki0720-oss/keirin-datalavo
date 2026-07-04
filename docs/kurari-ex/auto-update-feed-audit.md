# 31-06 自動更新・official feed・EXデータ鮮度チェック

## 目的

KURARI EX の次作業へ進む前に、race data、開催日程、KEIRIN.JP official feed、KURARI EX analytics、Slack 的中通知 state、GitHub Pages 配信の現状を読み取り専用で棚卸しする。

今回は修正ではなく監査である。コード、workflow、`public/data/**`、`private-input/**`、package files は変更せず、実装済み・部分実装・未確認・未実装・fake禁止の境界と、31-07 以降の修正候補を記録する。

## 確認日時

- 確認日時: 2026-07-04 16:38 JST
- 基準ブランチ: `main`
- 確認方法: repository 内の workflow、script、source、既存の生成済みJSONを読み取り専用で確認
- 外部サイトへの再取得、workflow実行、Slack送信、データ再生成は未実施
- 作業開始時から `public/data/reviews/2026-06-28/` から `2026-07-03/` が未追跡だった。保護対象として内容変更、stash、削除、退避、stageをしていない

## 対象範囲

- `.github/workflows/**`
- 自動更新、official feed、KURARI EX生成、Slack通知に関係する `scripts/**`
- EXの実体である `src/pages/ExDataPage.tsx`
- EX読込処理である `src/lib/kurariExData.ts`
- `public/data/races/**`
- `public/data/analytics/kurari-ex/**`
- `public/data/predictions/**`
- `public/data/venues/**` と `public/data/reviews/**` は配置と参照関係のみ確認
- `package.json` は手動コマンドの存在確認だけを行い、変更していない

ステータスの意味:

- `implemented`: 自動処理または検証処理がコードと接続先まで確認できた
- `partial`: 処理はあるが、鮮度、coverage、provenance、競合防止などが不十分
- `unknown`: repository内だけでは生成元または運用状態を確定できない
- `not-found`: 対象の自動処理や必須フィールドが見つからない
- `fake-prohibited`: 値を生成・推測して埋めてはいけない
- `future-accumulation`: 正常な蓄積待ちであり、値の捏造で解消してはいけない

## GitHub Actions棚卸し

### Update today race data

- workflow: `.github/workflows/update-today-race-data.yml`
- trigger:
  - schedule: 06:10、08:00、10:00、14:00、17:00、20:00 JST相当のlineup/odds更新
  - schedule: 日中の毎時・毎時30分、12:00、15:00、18:00、21:00、23:47、23:53 JST相当のresult更新
  - `workflow_dispatch`: `auto / lineup / odds / result / final / backfill` と任意の対象日
- script:
  - `npm run update:today-races:write`
  - `npm run update:keirin-jp-entries:write`
  - `npm run check:keirin-jp-entries`
  - `npm run update:keirin-jp-results:write`
  - `npm run check:keirin-jp-results`
  - `npm run update:schedule:upcoming`
  - `node scripts/notify-slack-hits.mjs`
- Node: 22
- output:
  - `public/data/races/today.generated.json`
  - `public/data/races/upcoming-schedule.generated.json`
  - `public/data/races/keirin-jp-entries.generated.json`
  - `public/data/races/keirin-jp-results.generated.json`
  - `public/data/predictions/saved-predictions.generated.json` のSlack通知済みstate
- commit/push: 上記5ファイルだけを明示的にstageし、差分があればcommit、rebase、pushする
- build: 差分がある場合に `npm run build:github` を実行し、GitHub Pagesへdeployする
- Slack: `SLACK_WEBHOOK_URL` secretを使用し、毎回通知判定を行う
- status: `partial`
- risk:
  - 31-06時点では、23:53 JSTのscheduled backfillがtoday feed側で `--phase backfill` になる一方、KEIRIN.JP results更新stepの条件にこのcronが含まれていなかった。31-07で接続済み
  - today feed、official feed、Slack state、build/deployを1 workflowで扱うため、外部feed遅延やpush競合の影響範囲が広い
  - concurrency groupは`pages`で、KURARI EX更新系の`keirin-data-auto-update`とは別。データpush同士の完全な排他ではない
- notes:
  - today feed空配列guard、official entries完全性check、final/backfill時のofficial results完全性checkがある
  - `target_date` はofficial resultsの手動final/backfillに使われる。today feed更新側の対象日固定用途ではない

### Update KURARI EX nightly

- workflow: `.github/workflows/update-kurari-ex-nightly.yml`
- trigger:
  - schedule: `5 15 * * *`、JST換算で毎日00:05
  - `workflow_dispatch`: `today / yesterday / YYYY-MM-DD`
- script: `node scripts/run-kurari-ex-nightly-update.mjs --allow-enrichment-upgrade`
- Node: 22
- output: `public/data/analytics/kurari-ex/**`
- commit/push: analytics配下だけをstageし、差分があればcommit/pushする
- build: workflow内では実行しない。mainへのpush後は通常のdeploy workflowが起動する
- Slack: なし
- status: `implemented`
- risk:
  - 対象日のtoday feedが未確定、日付不一致、結果pendingの場合はexit code 2で安全にskipする
  - 00:05時点で前日最終結果が揃わない場合、既定値`today`では日付境界の運用意図が分かりにくい
  - 全analysisの「最新日が対象日まで進んだこと」をworkflow単体では個別検証しない
- notes: concurrency groupは`keirin-data-auto-update`

### Check KURARI EX nightly stale

- workflow: `.github/workflows/check-kurari-ex-nightly-stale.yml`
- trigger:
  - schedule: `18 0 * * *`、JST換算で毎日09:18
  - `workflow_dispatch`: 既定`yesterday`
- script:
  - `scripts/check-kurari-ex-nightly-stale.mjs`
  - stale時に `scripts/run-kurari-ex-nightly-update.mjs --only-if-missing --allow-enrichment-upgrade`
- Node: 22
- output: recoveryが必要な場合の `public/data/analytics/kurari-ex/**`
- commit/push: analytics配下だけをstageし、差分があればcommit/pushする
- build: workflow内ではなし。push後のdeploy workflowに委ねる
- Slack: なし
- status: `implemented`
- risk:
  - check対象は日次FACTSの存在、race確定、history index収録、prediction coverage警告である
  - rider、matchup、venue、today recommendationなど個別analysisの生成日時・periodまではstale判定していない

### Notify Slack Hits

- workflow: `.github/workflows/notify-slack-hits.yml`
- trigger: mainへのpushで、saved predictions、today feed、通知script、workflow自身に差分がある場合
- script: `node scripts/notify-slack-hits.mjs`
- Node: 22
- output: `public/data/predictions/saved-predictions.generated.json` の通知済みkeyと通知時刻
- commit/push: stateに差分がある場合だけ対象ファイルをcommit/pushする
- build: なし。ただしstate commitはmain pushなので通常のdeploy workflowを起動し得る
- Slack: `SLACK_WEBHOOK_URL` secretを使用
- status: `partial`
- risk:
  - Update today race data workflow内でも同じ通知scriptを実行するため、2つのworkflowが近接して動く
  - 通知済みstateによる通常の重複防止はあるが、両runが同じ古いstateをcheckoutして同時送信する競合を防ぐlock/concurrencyはない
  - stateは最後の1000 keyに切り詰められる。scriptはtoday feedと同日の予想だけを対象にするため通常運用では直ちに問題にならないが、長期的な再実行耐性は1000件上限に依存する

### Deploy KURARI DATA LAVO to GitHub Pages

- workflow: `.github/workflows/deploy.yml`
- trigger: mainへのpush、`workflow_dispatch`
- script: `npm ci`、`npm run build:github`
- Node: 22
- output: `dist` artifactとGitHub Pages
- commit/push: なし
- Slack: なし
- status: `implemented`
- risk:
  - Update today race data workflow自身もdeployするため、そのworkflowのpushで通常deployも起動し、同じ`pages` concurrency group上で連続deployになり得る

## scripts棚卸し

| script | purpose | input | output | source / sourceType | EX接続 | status | risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `scripts/update-today-races.mjs` | 当日開催、出走情報、並び、オッズ、結果を更新 | 既存today cache、upcoming schedule、KEIRIN.JP results、手動override | public write時は`public/data/races/today.generated.json`、通常はdebug local | KDreamsを既定、netkeirinはpolicyで制御、結果fallbackあり。統一`sourceType`なし | 日次FACTS生成の入力 | `partial` | riderに`registrationNo`がなく、field単位の`sourceFetchedAt/sourceType`もない。手動overrideをmergeする |
| `scripts/update-keirin-upcoming-schedule.mjs` | 今後60日程度の開催日程を更新 | CTC開催日程ページ | `public/data/races/upcoming-schedule.generated.json` | CTC URL、ISO `generatedAt` | today feedの開催補助 | `implemented` | official entry/resultとは別source。開催内容の真正性はCTCページ解析に依存 |
| `scripts/updateRaceSchedule.mjs` | legacy開催日程TSを更新 | CTC開催日程ページ | `src/data/raceScheduleData.ts` | CTC | today updaterの入力候補 | `partial` | 手動commandは存在するが現行workflowから呼ばれていない。コード生成物でありpublic scheduleと二重系統 |
| `scripts/update-keirin-jp-entries.mjs` | KEIRIN.JP出走表・並びを取得 | KEIRIN.JP `JSJ048 / JSJ006 / JSJ005` | public write時は`keirin-jp-entries.generated.json`、通常はdebug local | providerとendpointをtop-level sourceに保持。entry sourceは`KEIRIN.JP:JSJ006` | official rider supplement、identity source候補 | `implemented` | `sourceType`、`sourceFetchedAt`、`registrationNoSource`、`registrationNoTrustStatus`という統一fieldはない |
| `scripts/update-keirin-jp-results.mjs` | KEIRIN.JP結果・払戻を取得 | KEIRIN.JP `JSJ048`と結果detail | public write時は`keirin-jp-results.generated.json`、通常はdebug local | providerとendpointをtop-level sourceに保持 | history/Review系とrider identity source候補 | `implemented` | 日中はpendingが正常。scheduled 23:53 backfillへのworkflow接続は31-07で修正済み |
| `scripts/archive-kurari-ex-daily-facts.mjs` | 確定済みtoday feedと保存予想を日次FACTS化 | today feed、saved predictions | `analytics/kurari-ex/history/daily/**`とindex/status | FACTS archive。未確定・日付不一致をskip | EX履歴、venue/rider/matchup分析の基盤 | `implemented` | today riderに登録番号がない場合は別identity sourceに依存。pending日は蓄積しない |
| `scripts/run-kurari-ex-nightly-update.mjs` | archive後にEX成果物を一括再生成 | daily FACTS、official feeds、player cards、identity mappings | `analytics/kurari-ex/**` | `EXACT`、`OFFICIAL_ENTRY`、`SEED*`など複数契約 | EXページの主要生成元 | `implemented` | 一部identity解決にexact-name、manual overrideを使う。全成果物が同じ最新periodとは限らない |
| `scripts/check-kurari-ex-nightly-stale.mjs` | 対象日の日次FACTS蓄積漏れを検出 | daily FACTS、history index | 標準出力とexit code | source生成なし | recovery workflowのgate | `implemented` | analysis別鮮度は検査対象外 |
| `scripts/update-kurari-ex-official-rider-supplement.mjs` | official entry由来の選手identityを蓄積 | KEIRIN.JP entriesと既存supplement | `exact/official-rider-identity.generated.json` | `OFFICIAL_ENTRY`、`KEIRIN.JP:JSJ006` | rider master/exact | `implemented` | ローカルsnapshotは2026-06-14生成で、現行entryより古い |
| `scripts/update-kurari-ex-rider-master.mjs` | 登録番号単位の選手masterを生成 | history、official supplement、player cards、公式feed、mapping | `exact/rider-master.generated.json`等 | source混在 | rider exact/score/category | `partial` | exact-name解決とmanual mappingを含む。直接official値と推論値をconsumer側で常に分離できるとは限らない |
| `scripts/generate-kurari-ex-venue-exact.mjs` | 会場別exact集計 | compact history | `exact/global/**`、`exact/venues/**` | `EXACT` | EX会場分析 | `implemented` | ローカル成果物のperiodは2026-06-24まで |
| `scripts/generate-kurari-ex-rider-exact.mjs` | 登録番号単位の選手集計 | historyとrider identity | `exact/riders/**` | `EXACT` | EX選手分析 | `partial` | qualityはcompleteだけでなくpartial、low-sample、identity-onlyを含む |
| `scripts/generate-kurari-ex-matchup-exact.mjs` | 選手間対戦集計 | historyと解決済みidentity | `exact/matchups/**` | `EXACT` | EX対戦分析 | `partial` | low-sample、partial、unknown order/lineを含む。将来蓄積が必要 |
| `scripts/generate-kurari-ex-analysis.mjs`ほか | venue/rider/category/tags/today recommendation生成 | exact/history/seed | `analysis/**` | `SEED_ANALYSIS`、`EXACT`等 | EX分析表示 | `partial` | 個別生成物のperiodが揃っておらず、today recommendationは名称に対して鮮度が古い |
| `scripts/notify-slack-hits.mjs` | 確定結果からhit/miss、払戻、収支を通知 | saved predictions、today feed | Slackとsaved predictions内state | today feed結果 | EX直接接続なし | `partial` | state commit前の並行runに対するatomic lockがない |

### 手動更新コマンド

`package.json`には次の手動入口がある。今回は存在確認だけで実行・変更していない。

- `update:today-races:local` / `update:today-races:write`
- `update:keirin-jp-entries:local` / `update:keirin-jp-entries:write`
- `update:keirin-jp-results:local` / `update:keirin-jp-results:write`
- `update:schedule` / `update:schedule:upcoming`
- `update:kurari-ex-nightly`
- `check:kurari-ex-nightly-stale`
- `update:kurari-ex-official-rider-supplement`
- `update:kurari-ex-rider-master`
- 各種`generate:*`、`check:*`、`audit:*`

`scripts/watch-kurari-ex-raw-inputs.ps1`、Windows task登録用bat、raw refresh scriptも存在するが、GitHub Actionsには接続されていない。ローカル手動運用の状態はrepositoryだけでは確定できないため`unknown`とする。

## public/data接続

確認日時点のローカルsnapshotを記録する。時刻はJSONにある値をそのまま記載し、推測で補完しない。

| data path | purpose | generated/manual/unknown | source fields | registrationNo coverage | EX接続 | status |
| --- | --- | --- | --- | --- | --- | --- |
| `public/data/races/today.generated.json` | 当日レース・出走表・並び・オッズ・結果 | 自動生成 | top-level `source`と`generatedAt`あり。`sourceType/sourceFetchedAt`なし | rider 463人相当のレコードに`registrationNo` fieldなし | daily archive入力。Prediction/Races系でも利用 | `partial` |
| `public/data/races/upcoming-schedule.generated.json` | 今後の開催日程 | 自動生成 | CTC source URL、ISO `generatedAt` | 対象外 | today feedの開催補助 | `implemented` |
| `public/data/races/keirin-jp-entries.generated.json` | KEIRIN.JP official出走表・並び | 自動生成 | provider、list/entry/lineup type、endpoint、expected dateあり | 2026-07-04は63/63 race、463/463 entryに登録番号あり、error 0 | official supplementとidentity source | `implemented` |
| `public/data/races/keirin-jp-results.generated.json` | KEIRIN.JP official結果・払戻 | 自動生成 | provider、list type、endpointあり | 確認時点で結果内130件に登録番号あり。全出走者coverageではなく確定結果分 | history/result補助とidentity source | `partial` |
| `public/data/races/entries-history/**` | 過去official entry snapshot | 自動または手動蓄積 | snapshotごとのsource | 日付ごとに異なる | starters bridgeの根拠 | `future-accumulation` |
| `public/data/analytics/kurari-ex/history/**` | 日次FACTSとcompact history | nightly生成 | status source=`compact-history-daily-archive` | status上のresolved starter累計は5,545。ただし全raceのstarter coverageとは同義でない | EX履歴・全analysisの基盤 | `partial` |
| `public/data/analytics/kurari-ex/source/starters/**` | 保存済みexact starter source | bridge生成 | source、snapshot hash、quality contractあり | 2026-06-29は464/464、blocked 0、metadata 464/464、PASS | EX source coverageカード | `implemented`（鮮度は`partial`） |
| `public/data/analytics/kurari-ex/exact/**` | venue/rider/matchup exact | nightly/manual生成 | `sourceType=EXACT`等 | rider exactは登録番号key | EX主要表示 | `partial` |
| `public/data/analytics/kurari-ex/analysis/**` | score/category/tag/recommendation | generator生成 | 生成物ごとのsource/sourceType | rider分析は登録番号を持つものあり | EX分析表示 | `partial` |
| `public/data/analytics/kurari-ex/venues/**` | seed venue analytics | seed import | `sourceType=SEED` | 対象外 | EX会場seed表示 | `implemented`（静的seed） |
| `public/data/venues/**` | 会場bank insight markdownとindex | 手動・同期の混在。自動workflowは見つからない | indexに存在するファイルだけconsumerが参照 | 対象外 | Prediction会場メモ。EX主要analyticsとは別 | `partial` |
| `public/data/predictions/saved-predictions.generated.json` | 保存予想とSlack通知済みstate | UI/再構築/通知script更新 | `updatedAt`、record内sourceあり | 主目的ではない | daily FACTSのprediction入力 | `partial` |
| `public/data/reviews/**` | review archive | 手動・生成済みarchive | index/TXT/SUMMARYごと | 日付ごとに異なる | compact historyにreview有無が記録され得るが、EXページが直接fetchする主入力ではない | `protected` |

### 鮮度スナップショット

- today feed:
  - date: `2026-07-04`
  - generatedAt: `2026/7/4 7:01:49`
  - 7会場、63race
  - 日時にtimezone offsetがなく、ISO形式でもない
- upcoming schedule:
  - generatedAt: `2026-07-04T07:02:27.457Z`
  - source: CTC
- KEIRIN.JP entries:
  - date: `2026-07-04`
  - generatedAt: `2026-07-04T07:02:26.114Z`
  - 7会場、63race、463 entry、missing/error 0
- KEIRIN.JP results:
  - date: `2026-07-04`
  - generatedAt: `2026-07-04T06:11:31.654Z`
  - 63race中 confirmed 16、pending 47、error 0
  - 16:38 JST監査時点で日中開催中のためpending自体は異常と断定しない
- KURARI EX compact history:
  - index generatedAt: `2026-07-02T03:35:39.373Z`
  - period: `2026-05-01`から`2026-07-01`
  - 58日、4,373race
  - status generatedAtは`2026-07-03T09:31:56.266Z`だが、最後のarchive attemptは34race pendingでskip。`lastArchiveSuccessAt`と`lastArchiveDate`はnull
- KURARI EX starter source:
  - 最新日: `2026-06-29`
  - 64race、464 starter、登録番号464/464、PASS
  - 7月4日時点で5日分進んでいない。完全性は高いが鮮度は不足
- venue exact:
  - generatedAt: `2026-06-25`
  - source periodは2026-06-24まで
- rider exact:
  - generatedAt: `2026-06-27`
  - source periodは2026-06-24まで
  - 1,989 riders。qualityはcomplete 89、partial 592、low-sample 1,257、identity-only 51
- matchup exact:
  - generatedAt: `2026-06-27`
  - source periodは2026-06-24まで
  - sufficient 1,699、low-sample 127、partial 110
- today recommendation:
  - generatedAt: `2026-06-25T05:30:19.780Z`
  - periodは2026-06-23まで
  - 7月4日の「today」として自動更新済みとは扱えない
- Slack state:
  - saved predictions updatedAt: `2026-06-28T23:50:24.461Z`
  - `notifiedSlackResultKeys`: 472件
  - `slackResultNotifiedAt`: `2026-06-29T14:48:10.259Z`

### source fieldsの結論

- KEIRIN.JP feedsはtop-level source objectとentry単位sourceを持ち、provider/endpointを追跡できる
- today feedはtop-level sourceと一部race fieldのsource/sourceNoteを持つが、全field共通の`sourceType`、`sourceFetchedAt`はない
- `officialResultSource`、`registrationNoSource`、`registrationNoTrustStatus`という名前の統一fieldは、監査対象のcurrent race feedsでは見つからない
- KURARI EX生成物には`sourceType`があるが、値は`EXACT / OFFICIAL_ENTRY / SEED / SEED_ANALYSIS / predictionGuidance`など用途別であり、Prediction素材の`official / user-entered-from-official / unknown`契約とは別体系
- source不明をofficialへ変換する処理は今回追加していない。既存データのprovenance粒度が不足する部分は`partial`または`unknown`のまま扱う

## EXページ接続

### component/file

- 実体: `src/pages/ExDataPage.tsx`
- 共通loader/整形: `src/lib/kurariExData.ts`
- 今回は両ファイルとも変更していない

### read data

EXページは主に次を`cache: no-store`でfetchする。

- `public/data/analytics/kurari-ex/index.generated.json`
- `public/data/analytics/kurari-ex/status.generated.json`
- `global/prediction-kpi.generated.json`
- `venues/*.generated.json`
- `exact/index.generated.json`
- `exact/status.generated.json`
- `exact/global/*.generated.json`
- `exact/venues/*.generated.json`
- `exact/riders/index.generated.json`、status、選手別file
- `exact/matchups/index.generated.json`、status、選手別file
- `history/index.generated.json`、日別file
- `source/starters/index.generated.json`とlatest source
- `analysis/venue-score.generated.json`
- `analysis/rider-score.generated.json`
- `analysis/rider-category-analysis.generated.json`
- `analysis/today-recommendation.generated.json`
- `audit/rider-coverage-audit.generated.json`
- `exact/shb-name-index.generated.json`

current `today.generated.json`をEX主要sourceとして直接再生成するのではなく、保存済みEX成果物を読み取る設計である。starter source表示もcurrent todayとは分離され、compatibilityは`SAVED_SOURCE_SEPARATED_FROM_CURRENT_TODAY`として非ブロッキングに扱う。

### source coverage

- starter source index/sourceはschema version、PASS、race/starter件数、blocked race、登録番号完全性、fake completion、fuzzy matching、result/lineup/predictionのstarter source転用をloaderで検証する
- historyでは`STARTERS_PARSED / NO_STARTERS / PARTIAL_REGISTRATION_NO`等の状態を区別する
- low sample、partial、identity-onlyをUI上のqualityとして残し、実データ相当に見せる一律complete変換は見つからない
- 一方、analysis別の鮮度をcurrent dateと比較してblockingする統一checkはない
- status: `partial`

### registrationNo handling

- 保存済みstarter sourceは登録番号464/464で、欠損があればloaderがerrorにする。ここではfake completionとfuzzy matchingを明示的に拒否している
- rider exact/matchupは登録番号をprimary keyとしている
- historical identity生成では次の既存経路がある:
  - starter自身の直接登録番号
  - race単位manual override
  - uniqueなexact-name player card/official supplement match
  - public/private name-to-registration mapping
  - ambiguous時はnull
- EX表示用のrace rider matchingにも、入力riderに登録番号がない場合だけunique normalized name matchへfallbackする箇所がある。候補名が複数登録番号に対応する場合は除外されるが、これは直接official registrationNoではなく名前一致による関連付けである
- status: 直接starter sourceは`implemented`、historical/name fallbackは`partial`

### unknown/unavailable handling

- fetchまたはcontract check失敗時はerror/unavailable表示になる
- no starterは正常な`NO_STARTERS`として区別される
- sample不足はlow-sample/partial/identity-onlyとして残る
- current todayとの差異や古さは保存sourceカードでは警告文付きの非ブロッキング
- `unknown`や`unavailable`を自動的にofficialへ変える処理は確認できない

### fake補完リスク

- 保存済みstarter source contract:
  - `fakeCompletionPerformed: false`
  - `fuzzyMatchingPerformed: false`
  - `resultLineupPredictionUsedAsStarterSource: false`
  - loaderでもtrueを拒否
- リスク:
  - historical rider identityは登録番号欠損時にunique exact-nameを使う
  - `scripts/kurari-ex-rider-registration-overrides.json`とrace overrideが存在する
  - private mapping pathもloaderに定義されているが、今回`private-input/**`は確認・変更していない
  - これらは値のランダム生成ではないが、「official feedからそのraceの登録番号を直接取得した値」と同一ではない。source/trust statusをconsumerに明示しない場合はfake補完と誤認される余地がある
- 結論: random/fuzzy fake completionは防止されている。current出走表は31-08でofficial/starter/today provenanceを明示し、historicalの名前一致・manual mapping provenanceは31-09以降の課題として残す

### 低サンプル・未実装指標

- rider exactの大半はlow-sampleであり、将来蓄積対象
- matchupにはunknown order/line observationがある
- historyにstarterなしの日が存在しても、実在starterを作って埋めてはいけない
- missing/partial/identity-only/low-sampleは`future-accumulation`または`fake-prohibited`として表示を維持する
- 未生成の指標を0またはcompleteとして扱う処理は追加していない

## Slack通知state

- script/file:
  - `scripts/notify-slack-hits.mjs`
  - `.github/workflows/notify-slack-hits.yml`
  - `.github/workflows/update-today-race-data.yml`
- 通知条件:
  - saved predictionの日付がtoday feedの日付と一致
  - 買い目が存在
  - raceをtoday feed内で特定可能
  - 結果がconfirmed
  - hit/miss、払戻、投資、収支を解決可能
- state path: `public/data/predictions/saved-predictions.generated.json`
- duplicate prevention:
  - `date:normalizedVenue:raceNo:resultOrder:settled:v2`をkey化
  - `notifiedSlackResultKeys`とlegacy `notifiedSlackHitKeys`のunionを既通知集合にする
  - Slack POST成功後だけ新keyと`slackResultNotifiedAt`を書き込む
  - webhook未設定またはdry-runではstateを書き換えない
- result / hit / miss / payout:
  - confirmed raceだけを処理
  - hitとmissの両方を通知対象にする
  - hitは該当券種の払戻を使い、投資・収支・回収率を計算する
- status: `partial`
- risk:
  - stateはpublic data内にあり、自動更新workflowがcommit/pushする
  - 同時runのcheckoutからPOSTまでを排他する仕組みがないため、理論上は二重送信競合が残る
  - state keyは最大1000件
  - notification workflow自身のstate commitが再度push triggerを起こすが、次runは既通知keyでskipする設計
- 今回、Slack送信、state変更、ログ削除は行っていない

## 現在の結論

### implemented

- today race dataの定期更新と空feed guard
- CTC upcoming scheduleの定期更新
- KEIRIN.JP entries/results取得とvalidation
- KEIRIN.JP entriesの2026-07-04登録番号coverage 463/463
- KURARI EX nightly archive/generation workflow
- stale checkと翌朝recovery
- EX starter sourceの厳格contract check
- GitHub Pages build/deploy
- Slack hit/miss/payout通知と永続dedupe key

### partial

- today feedとofficial entriesは別ファイルでtoday rider自体には登録番号がない。31-08のEX read-only接続で安全に照合する
- current race feed自体には統一`sourceType/sourceFetchedAt/registrationNoSource/registrationNoTrustStatus`がない。31-08のEX接続viewで派生provenanceを明示する
- KURARI EX historyは2026-07-01まで、starter sourceは2026-06-29まで
- exact/analysisのperiodが2026-06-23または24付近で止まり、today recommendationもcurrent dateではない
- historical rider identityでunique-name/manual mappingを使用
- Slackはstate dedupe済みだがworkflow間のatomicな二重送信防止がない
- scheduled 23:53 backfillのKEIRIN.JP results接続漏れは31-07で解消
- data更新workflowと通常deploy workflowが重複deployし得る

### unknown

- Windows raw watcher/taskが実運用環境で有効か
- private mappingの内容と更新手順。保護対象のため今回未確認
- bank insight markdownの人手更新頻度
- GitHub Actions上の直近run成功率とsecret設定状態。repository静的監査では確定不能

### not-found

- 全race feedに共通する`sourceFetchedAt`
- registrationNoごとの`registrationNoSource`と`registrationNoTrustStatus`
- analysis全体をcurrent date/periodと照合する単一の鮮度gate
- 2つのSlack呼出元をまたぐ送信lock
- scheduled 23:53 backfillからKEIRIN.JP results updaterへの接続は31-07で実装済み

### fake-prohibited

- today riderにない登録番号の推測補完
- unknown sourceTypeのofficial化
- unavailable/nullの実装済み扱い
- no-starters履歴への選手生成
- low-sample/partial/identity-onlyのcomplete化
- 未生成analysisをcurrent dataのように表示

### future-accumulation

- 2026-07-02以降のcompact history
- 2026-06-30以降のexact starter snapshots
- low-sample rider/matchup
- starter未収録の過去日
- prediction coverageがpartial/missingの日

## 次回修正候補

31-07以降で、次の順に小さく分けて対応する。

1. scheduled 23:53 backfillのofficial results条件修正は31-07で完了。GitHub Actions実runで対象日とcomplete checkの運用結果を確認する。
2. EX用の鮮度manifestまたはcheckを追加し、history latest、starter latest、venue/rider/matchup/analysis periodを一括で比較する。古いtoday recommendationをcurrent扱いしない。
3. today feedとKEIRIN.JP entriesの安全なread-only joinは31-08で実装。日付、会場code、race、carNo、選手名一致をgateにし、不一致時は未取得のままにする。
4. current EX接続のregistrationNo provenanceは31-08で実装。historical側の`exact-name-reference / manual-override / unresolved`明示は引き続き候補とする。
5. EXのname fallbackをUIで明示するか、direct registrationNoがないraceでは自動関連付けをしない方針を決める。
6. Slack通知を1つのworkflowへ集約するか、共通concurrencyとclaim/state更新方式を導入して並行POSTを防ぐ。
7. today feedの`generatedAt`をtimezone付きISOへ統一し、field単位またはrace単位の`sourceFetchedAt/sourceType`契約を設計する。
8. Update today workflow内deployとpush起点deployの二重経路を整理する。
9. raw watcher、manual mappings、bank insightsの運用責任者・更新手順を別docsに明記する。

上記は候補記録のみで、31-06では修正していない。

## 31-07 scheduled 23:53 backfill接続修正

### 確認内容

- workflow: `.github/workflows/update-today-race-data.yml`
- scheduled backfill: cron `53 14 * * *`、JST 23:53相当
- today race更新: cron判定で既に`--phase backfill`を指定していた
- KEIRIN.JP results更新script: `scripts/update-keirin-jp-results.mjs`が既存
- 手動command: `npm run update:keirin-jp-results:write -- --expect-date="$KEIRIN_JP_EXPECT_DATE"`
- public output: `public/data/races/keirin-jp-results.generated.json`
- 更新scriptはKEIRIN.JP source-backedの既存実装であり、fake result生成や登録番号推測を行う新規scriptは不要

### 接続漏れの原因

23:53 cronはtoday feed更新のcase文とresults完全性check内部には記載されていたが、次の3 stepの実行条件に含まれていなかった。

1. `Resolve KEIRIN.JP expected result date`
2. `Update KEIRIN.JP official results`
3. `Validate KEIRIN.JP official results`

そのため、scheduled 23:53 runではresults検証内部へ到達せず、既に書かれていた23:53用`--require-complete`分岐も実行されなかった。

### 修正内容

上記3 stepの`if`条件へ、同じscheduled event判定を追加した。

```yaml
github.event.schedule == '53 14 * * *'
```

workflow_dispatchの`final / backfill`条件、23:47 final、日中のofficial result checkpointは変更していない。既存のsource、sourceType、登録番号、結果parser、出力schemaも変更していない。

### 実行順序

23:53 scheduled backfillでは、次の順序になる。

1. checkout、Node 22 setup、`npm ci`
2. today race dataを`--phase backfill`で更新
3. today race dataの空feed guard
4. `KEIRIN_JP_EXPECT_DATE`をscheduled runの日付で解決
5. 既存のKEIRIN.JP results updaterを`--write-public`相当で実行
6. `--require-complete`でofficial resultsを検証
7. upcoming schedule stepは条件外のためskip
8. official results反映後にSlack hit/miss判定
9. 明示されたrace data、official feeds、Slack stateだけをstageし、差分がある場合だけcommit/push
10. 差分がある場合だけbuild/deploy

Slack通知はresults更新・検証より後である。通知済みstateと通知script自体は31-07で変更していない。

### commit/push対象

既存workflowは`git add .`を使わず、次だけを明示stageする。

- `public/data/races/today.generated.json`
- `public/data/races/upcoming-schedule.generated.json`
- `public/data/predictions/saved-predictions.generated.json`
- `public/data/races/keirin-jp-results.generated.json`
- `public/data/races/keirin-jp-entries.generated.json`

`public/data/reviews/**`、`public/data/analytics/**`、`public/data/venues/**`、`private-input/**`はcommit対象に含まれない。

### 31-07で実施していないこと

- ローカルでresults updaterを実行していない
- `public/data/**`を変更していない
- fake data、fake result、登録番号、source情報を生成・推測していない
- Slack通知stateを変更していない
- EX、Prediction、Review、RacesのUIを変更していない
- `git add .`、commit、pushを実行していない

### 31-08以降の候補

- GitHub Actionsの実runで23:53 backfillの対象日、official result complete check、commit対象を確認する
- 31-06で記録したEX鮮度manifest、registrationNo provenance、Slack並行送信lockは別タスクのまま維持する

## 31-08 EX identity/source接続整理

### 対応内容

KURARI EXページへ、official entries、保存済みstarter source、today.generated、EX historyの役割と鮮度を分けて表示するread-onlyのidentity source connectionを追加した。

- 実装ファイル:
  - `src/pages/ExDataPage.tsx`
  - `src/lib/kurariExData.ts`
  - `src/types/kurariEx.ts`
- 読み取りsource:
  - `/data/races/today.generated.json`
  - `/data/races/keirin-jp-entries.generated.json`
  - `/data/analytics/kurari-ex/source/starters/index.generated.json`
  - indexが指す保存済みstarter source
  - 既存のEX history index
- `public/data/**`は生成・変更・削除していない

### sourceの役割と優先順位

1. KEIRIN.JP official entries
   - current出走選手の登録番号、府県、年齢、期、級班の最優先source
   - `date + venueCode + R + carNo`で候補を特定し、選手名のNFKC・空白除去後の完全一致も必須とする
   - 登録番号が6桁である場合だけ使用する
   - `sourceType: official`
   - `registrationNoTrustStatus: direct-official-entry`
2. EX starter source
   - official entriesで接続できない場合の次順位
   - source index/sourceがPASS、登録番号complete、blocked race 0、fake補完なし、fuzzy matchingなしであることを既存assertで検証
   - todayとsourceの日付が一致し、`date + venueName + R + carNo`と選手名完全一致の場合だけ使用する
   - `sourceType: source-backed`
   - `registrationNoTrustStatus: validated-starter-source`
3. today.generated
   - currentレース、会場、R、車番、選手名の基礎roster
   - 登録番号sourceとしては使用しない
   - 接続できない登録番号は`null`、画面では「未取得」
   - `sourceType: today-generated-only`
   - `registrationNoSource: none`
   - `registrationNoTrustStatus: unavailable`
4. historical identity
   - 31-08のcurrent出走表接続では使用しない
   - unique-name matchやmanual overrideをofficial扱いしない
   - 将来利用する場合は`historical-identity / manual-override / partial`等のprovenanceを必須にする

### registrationNo coverage表示

EXページの既存カードデザイン内へ次を追加した。

- 登録番号あり人数 / current starter総数
- 登録番号未取得人数
- official entries由来人数
- starter source由来人数
- today-generated-only人数
- historical identity人数
- manual override人数
- unknown人数
- unavailable人数
- safe key候補があっても選手名不一致で接続を止めた人数

2026-07-04のローカルsnapshotでは463人中459人がofficial entriesへ安全に接続された。4人はtodayとofficialで外国人名表記が異なったため接続を止め、登録番号未取得のtoday-generated-onlyとして表示した。名前を部分一致・fuzzy matchingして補完していない。

### source coverage表示

各preview rowに次を表示する。

- 車番
- 選手名
- 登録番号
- 府県
- 年齢
- 期
- 級班
- source名
- source取得日時
- source種別
- `registrationNoSource`
- `registrationNoTrustStatus`

不明値は空欄にせず「未取得」、`unknown`、`unavailable`の契約を維持する。`unknown`やmanual overrideをofficialに変換しない。

### data freshness表示

- today.generatedの日付とgeneratedAt
- official entriesの日付とgeneratedAt
- starter sourceの日付とsourceGeneratedAt
- EX history indexの最新日

sourceごとの日付を別々に表示し、古いstarter sourceやhistoryをcurrent official dataのように見せない。

### fake補完防止

- 登録番号を選手名だけで決定しない
- 選手名の部分一致・fuzzy matchingをしない
- safe keyまたは日付が一致しないsourceを接続しない
- registrationNoが欠けるtoday riderは未取得のまま残す
- historical unique-name matchとmanual overrideはcurrent接続に使用しない
- source不明値をofficial扱いしない

### 31-09以降の候補

- historical identity側のunique-name/manual override provenanceを個別成果物まで伝播する
- current official entriesとstarter sourceの鮮度差を日数・警告レベルで表示する
- current接続のsafe-key表記不一致理由は31-09で会場・race単位の診断表示を実装。欠落・重複・key mismatchの詳細化は継続候補

## 31-09 official entries表記不一致診断

### 対応内容

31-08で`date + venueCode + R + carNo`は一致したものの、選手名完全一致を満たさずofficial entries接続を停止した4人について、原因とofficial candidateをEXページ上で診断表示するようにした。

- 表示タイトル: `IDENTITY MISMATCH AUDIT / 表記不一致チェック`
- 対象件数は実データから動的集計
- official candidateの登録番号は診断用の未採用値としてのみ表示
- current出走表本体のregistrationNoは未取得のまま
- fuzzy matching、unique-name match、manual overrideによる自動接続は行わない

### 接続キーと停止条件

- raw key: `date | venueCode | raceNumber | carNo`
- safe key:
  - date一致
  - venueCode一致
  - R一致
  - carNo一致
  - NFKC・空白除去後のplayerName完全一致
- 最初の4項目で候補を特定できてもplayerName完全一致に失敗した場合:
  - `safeKeyStatus: key-fields-matched-name-mismatch`
  - `sourceType: official-candidate`
  - `processingResult: not-connected-registration-unavailable`
  - official candidate登録番号は本体に採用しない

### 原因分類

診断用に次のreason型を定義した。分類だけで接続許可はしない。

- `playerName-exact-mismatch`
- `whitespace-only-difference`
- `fullwidth-halfwidth-difference`
- `old-new-kanji-difference`
- `middle-dot-or-symbol-difference`
- `missing-official-entry`
- `duplicate-candidate`
- `key-mismatch`
- `unknown`

2026-07-04 snapshotの4人はすべて`playerName-exact-mismatch`である。空白・全角半角・旧新漢字だけの差ではない。

### 対象4人

| 会場 / R / 車番 | race_id | today.generated名 | official candidate名 | official candidate登録番号 | 診断 |
| --- | --- | --- | --- | --- | --- |
| 青森 6R 4番車 | `1220260703020006` | アンドルーズ 外国 | アンドルーズ | `130134` | today側に「外国」ラベルあり |
| 青森 7R 3番車 | `1220260703020007` | ファンデルワウ 外国 | ファンデルワ | `130135` | 「外国」ラベル差に加えofficial candidate名が短い |
| 青森 10R 4番車 | `1220260703020010` | トゥルーマン 外国 | トゥルーマン | `130127` | today側に「外国」ラベルあり |
| 青森 11R 6番車 | `1220260703020011` | リチャードソン 外国 | リチャードソ | `130133` | 「外国」ラベル差に加えofficial candidate名が短い |

上表の登録番号は`official candidate / 未採用`である。診断欄へ表示するが、31-09ではcurrent starterのregistrationNoへ接続していない。

### EX表示

- mismatch stopped人数
- mismatch candidate人数
- fake completionなし
- fuzzy matchingなし
- 会場、R、車番
- date、venueCode、race_id
- raw keyとsafe key状態
- today.generated名
- official candidate名
- official candidate登録番号、府県、年齢、期、級班
- 停止理由
- 差分診断
- sourceFetchedAt
- 処理結果「未接続 / registrationNo未取得のまま」

### coverage更新

2026-07-04 snapshot:

- official entries接続済み: 459人
- today-generated-only（mismatch以外）: 0人
- 表記不一致で接続停止: 4人
- mismatch candidate: 4人
- starter source: 0人
- historical identity: 0人
- registrationNo unavailable: 4人

上記はJSONの人数から動的に算出し、固定値をUIへハードコードしていない。

### fake補完防止

- whitespace差だけでも31-09では自動接続しない
- NFKC正規化だけで一致しても新しい許可ルールにはしない
- old/new漢字候補を自動で同一人物扱いしない
- official candidate名が短くても前方一致で採用しない
- 「外国」ラベルを除去して登録番号を採用しない
- official candidate登録番号を診断用表示から本体へコピーしない
- manual overrideをofficial扱いしない

### 31-10以降の候補

- strict-safe normalization policyを別タスクで設計する
- whitespace-only差をsource-backed接続対象にできるか個別検討する
- NFKC正規化の採用可否を判定し、採用する場合もprovenanceを残す
- old/new漢字差はmanual reviewとprovenanceを必須にする
- 名前差分だけで登録番号を自動接続しない原則を維持する

## 31-10 外国人選手identity alias registry

### 目的と扱い

31-09で表記不一致停止した外国人選手4人について、official candidateを人間確認した記録を`src/lib/kurariForeignRiderAliases.ts`のidentity alias registryへ登録した。registryは今後のstrict採用条件を検討するための診断情報であり、31-10ではcurrent出走表・starter本体のregistrationNoへ接続しない。

- category: `foreign-rider-alias`
- sourceType: `official-candidate`
- trustStatus: `source-backed-manual`
- matchMethod: `exact-alias-pair`
- allowedMatchScope: `foreign-rider-name-variant`
- createdBy: `31-10`
- provenanceには`KEIRIN.JP official entries`、31-09での`date + venueCode + raceNumber + carNo`一致、playerName完全一致ではないため未採用であることを保持
- sourceTypeを`official`、trustStatusを`confirmed`として扱わない

### 登録した4件

| registryId | today.generated名 | official entry名 | official candidate registrationNo |
| --- | --- | --- | --- |
| `foreign-aomori-20260704-andrews-130134` | アンドルーズ 外国 | アンドルーズ | `130134` |
| `foreign-aomori-20260704-van-der-wouw-130135` | ファンデルワウ 外国 | ファンデルワ | `130135` |
| `foreign-aomori-20260704-truman-130127` | トゥルーマン 外国 | トゥルーマン | `130127` |
| `foreign-aomori-20260704-richardson-130133` | リチャードソン 外国 | リチャードソ | `130133` |

### registry照合

31-09のmismatch audit内だけで、次の3項目がregistry値と文字列完全一致した場合に限り`alias registry: 登録済み`とする。

1. todayGeneratedName
2. officialEntryName
3. official candidate registrationNo

名前の部分一致、NFKC・空白除去だけの一致、registrationNoだけの一致、today名だけの一致、official名だけの一致、fuzzy matchingではregistry登録済みにしない。照合結果は診断表示にだけ付与し、registrationNo採用判断には使用しない。

### EX表示とcoverage

IDENTITY MISMATCH AUDITへ次を追加した。

- alias registry registered件数
- foreign rider alias registered件数
- registryId、category、sourceType、matchMethod、trustStatus、provenance
- official candidate registrationNoは引き続き`未採用`
- 処理結果は`未採用 / registrationNo本体へ未接続`
- fake completionなし
- fuzzy matchingなし
- 出走表本体へのregistrationNo反映なし
- 31-11以降でstrict採用条件を検討

registrationNo coverage / source coverageの件数はcurrent mismatch dataとregistryの完全一致照合から動的に算出する。2026-07-04 snapshotは次のとおり。

- official entries接続済み: 459人
- today generated only: 0人
- mismatch stopped: 4人
- alias registry registered: 4人
- foreign rider alias registered: 4人
- official candidate not adopted: 4人
- unavailable: 4人

registry自体の4件は人間確認済みの固定データだが、coverageへ4を直接ハードコードしていない。starter.registrationNo、registrationNoSource、registrationNoTrustStatus、sourceTypeは変更せず、official entries接続済み459人とunavailable 4人を維持する。

### fake補完防止と31-11候補

- official candidateは診断用途のまま
- fakeデータ追加・fake補完をしていない
- fuzzy matchingをしていない
- 名前だけ、unique-name、manual overrideで登録番号を補完していない
- source-backed manual aliasをofficial扱いしていない
- `public/data/**`は生成・変更・削除していない
- `public/data/reviews/**`は変更、stash、削除、退避、stageしていない

31-11以降は、`date + venueCode + R + carNo + exact-alias-pair + registrationNo`一致の場合だけ本採用するか、採用時のsourceType名、official entriesとは別の`source-backed-alias`として表示するかを検討する。

## 触っていないもの

- `public/data/reviews/**` は触っていない
- `public/data/reviews/**` はstashしていない
- `public/data/reviews/**` は削除していない
- `public/data/reviews/**` は退避していない
- `public/data/reviews/**` はstageしていない
- `public/data/analytics/**` は触っていない
- `public/data/races/**` は触っていない
- `public/data/venues/**` は触っていない
- `private-input/**` は触っていない
- `package.json` / `package-lock.json` は触っていない
- Prediction Page、ReviewPage、RacesPageは触っていない。EXページは31-08のidentity/source接続表示、31-09の表記不一致診断、31-10のalias registry診断表示だけを変更した
- 的中通知ログとSlack通知stateは触っていない
- fakeデータ追加、fake補完、source推測補完、登録番号推測補完はしていない
- `git add .`、git commit、git pushは実行していない
