# KURARI EX Result Trend Lab data availability audit

## 32-01の目的

Result Trend Labで将来扱う出目ランキング、荒れ指数、レース連鎖、風速×決まり手、会場クセ、今日の流れについて、既存データだけで安全に実装できる範囲を棚卸しする。32-01では集計engine、ランキング、架空の分析数値を生成しない。

基本方針:

- official result only
- fake補完禁止
- 保存されていない値を推測しない
- LOW SAMPLEを主根拠にしない
- `unknown`、`unavailable`を`implemented`扱いしない
- `public/data/**`は読み取り専用

## 調査対象

- `public/data/races/keirin-jp-results.generated.json`
- `public/data/races/today.generated.json`
- `public/data/analytics/kurari-ex/history/index.generated.json`
- `public/data/analytics/kurari-ex/history/daily/**/*.generated.json`
- `public/data/analytics/kurari-ex/**`
- `public/data/reviews/index.json`と既存result contract
- `scripts/update-keirin-jp-results.mjs`
- `scripts/check-keirin-jp-results.mjs`
- `scripts/archive-kurari-ex-daily-facts.mjs`
- `scripts/kurari-ex-history-common.mjs`
- `.github/workflows/update-today-race-data.yml`
- `.github/workflows/update-kurari-ex-nightly.yml`
- `src/lib/reviewResultOutputContract.ts`
- `src/pages/ExDataPage.tsx`

調査は読み取りだけで行い、データ生成scriptは実行していない。

## snapshot

監査日: 2026-07-04

### KEIRIN.JP当日official result

`public/data/races/keirin-jp-results.generated.json`:

- schemaVersion: 1
- source: KEIRIN.JP / JSJ048
- generatedAt: `2026-07-04T10:53:48.260Z`
- 7会場、63R
- 監査時点でconfirmed 38R、pending 25R
- 3連単combination・払戻を持つrace: 39R
- 3連単的中組のpopularityを持つrace: 39R
- 3着までのfinishOrderを持つrace: 38R
- kimarite、天候、風速を持つrace: 各38R
- venue grade: 63R
- 風向: 0R

当日途中のsnapshotであるため、pendingを欠損レースとしてランキングへ混ぜてはいけない。`resultStatus === confirmed`を必須にする。

### KURARI EX history

`public/data/analytics/kurari-ex/history/index.generated.json`:

- period: 2026-05-01〜2026-07-01
- 58日
- 4,373R
- settled 4,365R
- 36会場

daily item coverage:

| 項目 | 保存件数 / 4,373 | status | 注記 |
| --- | ---: | --- | --- |
| 3連単combination | 4,365 | partial | 8Rは未取得 |
| 3連単payoutYen | 4,358 | partial | combinationより7R少ない |
| 1〜3着車番 | 4,093 | partial | 全raceではない |
| 1着winningMethod | 3,991 | partial | 表記正規化も必要 |
| weather condition | 4,146 | partial | 未取得あり |
| wind direction | 4,127 | partial | 当日official feedには風向がない |
| wind speed | 4,136 | partial | 未取得あり |
| grade | 3,599 | partial | 未取得あり |
| raceClass | 4,097 | partial | A級/S級等を分類可能だが未取得あり |
| starterCount > 0 | 3,749 | partial | 624Rが0 |
| favoriteTrifecta combination | 4,162 | partial | history由来 |
| favoriteTrifecta odds | 4,149 | partial | official-only provenance確認が必要 |
| raceId | 0 | unavailable | raceKeyでのみ識別 |
| race単位source/sourceFetchedAt | 0 | unavailable | official result only判定の阻害要因 |

starterCount分布は7車3,136R、9車387R、その他・未取得850R。A級表記2,076R、S級表記1,146R、G1/G2/G3 grade 384Rを確認した。ただし全件coverageではない。

## coverage status定義

- `implemented`: 保存schemaと読み取り経路があり、値の存在条件をコードで判定できる
- `partial`: schemaはあるが、日付・会場・raceごとに未取得、またはprovenance不足がある
- `not-generated/fake-prohibited`: 保存値がなく、生成・推測してはいけない
- `future-accumulation`: source contractや履歴蓄積後に実装する
- `unavailable`: 現在の対象sourceには存在しない
- `unknown`: 調査だけでは意味・取得元を確定できない

## field availability

| 分析フィールド | current official | EX history | 判定 |
| --- | --- | --- | --- |
| 日付・会場・R | あり | あり | implemented |
| 3連単結果 | confirmed raceにあり | 4,365R | partial |
| 3連単払戻金 | confirmed raceにあり | 4,358R | partial |
| 1〜3着車番 | finishOrderにあり | 4,093R | partial |
| 全着順 | あり | first/second/third中心 | partial |
| 車立て | finishOrderから当日確定可能 | starterCount欠損あり | partial |
| grade | venue単位であり | 3,599R | partial |
| A級 / S級 | current result単独ではraceClass不足 | raceClass 4,097R | partial |
| Gレース | gradeから分類可能 | G grade 384R | partial |
| 決まり手 | kimariteあり | winningMethod 3,991R | partial |
| 天候 | あり | 4,146R | partial |
| 風速 | あり | 4,136R | partial |
| 風向 | current officialにはなし | 4,127R | partial |
| レース区分 | operation/result statusあり | raceClassあり | partial |
| 開催日数 | 明示field未確認 | 明示field未確認 | unavailable |
| official source名 | top-level sourceあり | race itemにはなし | partial |
| source取得日時 | top-level generatedAtあり | race itemにはなし | partial |
| 的中組の人気順 | payout popularityあり | 一貫したfieldなし | partial |
| 1番人気3連単オッズ | current resultにはなし | favoriteTrifecta.odds 4,149R | partial |
| 最低3連単オッズ | 明示fieldなし | 明示fieldなし | not-generated/fake-prohibited |
| 締切直前オッズ | なし | なし | future-accumulation |
| 全組み合わせ人気順 | なし | なし | future-accumulation |
| オッズ変動 | なし | なし | future-accumulation |
| 直前気象変化 | 単一snapshotのみ | 時系列なし | future-accumulation |
| 並び確定後の展開タグ | official resultにはなし | prediction由来が混在 | future-accumulation |
| 展示相当の直前補正 | なし | なし | future-accumulation |

`favoriteTrifecta.odds`を、契約確認なしに「最低オッズ」と読み替えてはいけない。実配当÷最低オッズは現時点では生成禁止とする。

## 分析メニュー

### 1. 3連単出目ランキング

予定項目:

- top 3連単出目
- 1着、2着、3着車番ランキング
- 3着内率
- 7車 / 9車
- A級 / S級 / Gレース
- 会場別
- R別
- LOW SAMPLE警告

判定: `partial`。

当日official result schemaだけならconfirmed raceの出目を正確に数えられる。ただし現在のofficial fileは当日snapshotで、長期EX historyはrace単位のofficial source名・source取得日時を持たない。official result onlyの長期ランキングには、official result履歴とprovenanceの蓄積が必要。32-01では数値を表示しない。

### 2. 荒れ指数 v1

3連単実払戻だけを使う暫定分類:

- 堅め: 0〜2,999円
- 中穴: 3,000〜9,999円
- 荒れ: 10,000〜29,999円
- 大荒れ: 30,000〜99,999円
- 超荒れ: 100,000円以上

判定: `partial`。

confirmed official resultのpayoutYenがあれば分類ロジック自体は実装可能。閾値は暫定で、将来ユーザー調整可能にする。返還・中止・未発売・同着等の除外contractとofficial履歴蓄積が必要。

### 3. 荒れ指数 v2 / 最低オッズ比

予定項目:

- 実配当 ÷ 最低オッズ
- 1番人気からの乖離
- オッズ人気とのズレ

判定: `future-accumulation`かつ最低オッズは`not-generated/fake-prohibited`。

current official resultには最低オッズ、締切直前odds matrix、全組み合わせ人気順がない。historyの`favoriteTrifecta.odds`はpartialで、race単位official provenanceもない。最低オッズと同一視しない。

### 4. レース連鎖分析

予定項目:

- 前Rが荒れた後の次R傾向
- 前Rが堅い後の次R傾向
- 荒れ連鎖
- 本命戻り
- 中穴継続
- 波乱加速

判定: `partial`。

date + venueKey + raceNumberで同日同会場内を昇順にできる。前後Rがともにconfirmedかつ3連単払戻ありの場合だけpairを作れる。欠番、未確定、中止、source provenance不足を跨いではいけない。

### 5. 風速×決まり手分析

予定bucket:

- 0〜1m
- 1〜3m
- 3〜5m
- 5m以上

決まり手:

- 逃げ
- 捲り
- 差し
- マーク

会場別・級班別とLOW SAMPLE警告を付ける。

判定: `partial`。

current official resultはconfirmed 38Rで風速と決まり手を保持するが、長期historyは風速4,136R、決まり手3,991Rで欠損があり、表記正規化とofficial provenanceが必要。bucket境界は実装時に片側を重複させず、例として`0以上1以下 / 1超3以下 / 3超5未満 / 5以上`等を明文化する。

### 6. 会場クセ分析

予定項目:

- 内枠決着率
- 外枠絡み率
- 1番車飛び率
- 逃げ決着率
- 捲り決着率
- 平均3連単配当
- 万車券率

判定: `partial`。

出目・払戻・決まり手の保存値から候補集計は可能。ただし車立て、grade/raceClass、source provenance、会場別sampleを同時に検証する必要がある。

### 7. 今日の流れメーター

予定表示:

- ここまで堅い日
- ここまで荒れている日
- 中穴が続いている日
- 外枠絡みが多い日
- 1番車が飛び気味の日

判定: `future-accumulation`。

当日confirmed raceだけなら途中経過を計算できるが、基準値とsample policyが未実装。pending raceを母数へ含めず、ランキング風の断定をしない設計が必要。

## LOW SAMPLE policy

暫定基準:

- sampleSize 30未満: `LOW SAMPLE / reference only`
- sampleSize 30〜99: `caution`
- sampleSize 100以上: `usable trend`

この閾値は暫定で将来調整可能にする。LOW SAMPLEは予想の主根拠にせず、展開予想の補助情報に限定する。フィルターを細分化した結果sampleが閾値未満になった場合も警告を外さない。

## fake-prohibited

次は保存済みsource値なしに作らない。

- 最低オッズ、人気順、オッズ変動
- 風速、風向、天候
- 決まり手
- grade、級班、車立て、開催日数
- source名、source取得日時、official source扱い
- 登録番号、選手名
- 的中率、回収率、ランキング順位、荒れ指数

欠損raceを0や平均値で埋めず、集計対象外件数とcoverageを併記する。

## 32-02候補

- KEIRIN.JP official resultだけを対象にした3連単出目ランキングv1
- 7車/9車、A級/S級/G、会場、R別フィルター
- LOW SAMPLE表示
- official result履歴の保存期間とrace単位provenance contractの設計
- `public/data/**`を書き換えず、既存official resultを読み取り集計するconsumerの検討

## 32-02 3連単出目ランキング v1

32-01のavailability監査を実装へ進め、EXページのResult Trend Labに読み取り専用の3連単出目ランキングv1を追加した。表示値は`public/data/races/keirin-jp-results.generated.json`から画面表示時に動的集計し、ランキング数字をハードコードしない。

### official result only条件

次をすべて満たすraceだけをeligibleとする。

- source providerが`KEIRIN.JP`
- listTypeが`JSJ048`
- source dateとsource取得日時が妥当
- `date + venueCode + raceNumber`から一意なrace keyを構成でき、同じkeyが重複しない
- `resultStatus: confirmed`
- cancelled / no-raceではない
- 1〜3着の車番が1〜9の異なる整数として揃う
- 1〜3着から構成した出目と保存済み`payout3tan.combination`が一致する
- 3連単払戻値が欠損していない

eligible raceから、3連単出目、1着車番、2着車番、3着車番、車番別3着内率を算出する。車番別3着内率の分母は、eligible raceのofficial `finishOrder`にその車番が記録された出走数とする。

### excluded

official source不成立、race key欠損・重複、中止・不成立、未確定、1〜3着不足、不正・重複車番、3連単欠損・着順との不一致は集計対象外とし、件数を理由別に表示する。eligibleが0件なら架空ランキングを作らず`No eligible official result data`を表示する。

件数はfeed更新に追随する動的値であり、EXページ上でeligible / excluded / totalと除外理由を同時に確認する。

### LOW SAMPLEとfilter readiness

- 30R未満: `LOW SAMPLE / reference only`（参考のみ）
- 30〜99R: `caution`（傾向注意）
- 100R以上: `usable trend`（予想の主根拠ではなく補助）

filter foundationはall、7車、9車、A級、S級、Gレース、会場、Rを定義した。現行schemaで安全に判定できるものだけ`ready`または`partial`とし、raceClass等がないA級・S級は`future-accumulation`のままにする。不明値を推測して分類しない。

### レイアウト・保護・次段階

EX専用main wrapperを`100%`基準、`max-width: 1600px`、`margin-inline: auto`へ変更し、`100vw`由来のずれを避けた。子要素へ`min-width: 0`と`max-width: 100%`を付け、100%表示での中央寄せとページ横overflow抑止を行った。

- fakeランキング、fake補完、架空オッズ、架空風速、架空決まり手は生成しない
- 荒れ指数、最低オッズ比、レース連鎖、風速×決まり手は未実装
- 最低オッズ比はsource取得後まで`future-accumulation`
- `public/data/**`は読み取りのみで生成・変更・削除していない
- `public/data/reviews/**`は変更、stash、削除、退避、stageしていない

32-03候補は、3連単払戻金をsource値のまま使う荒れ指数v1、堅め / 中穴 / 荒れ / 大荒れ / 超荒れ分類、R別 / 会場別 / 級班別傾向とする。最低オッズ比は必要なsourceが蓄積されるまで実装しない。

## 32-03 荒れ指数 v1

Result Trend Labへ、保存済みKEIRIN.JP official resultの3連単実払戻金だけを使う荒れ指数v1を追加した。平均・中央値・最大値、最高配当race、分類別件数・割合を画面表示時に動的算出し、払戻金や集計数字をハードコードしない。

### eligible / excluded

32-02と同じofficial result only条件を再利用する。

- providerが`KEIRIN.JP`、listTypeが`JSJ048`
- source date / source取得日時が妥当
- `date + venueCode + raceNumber`が一意
- confirmedかつcancelled / no-raceではない
- 1〜3着車番が妥当で重複しない
- 保存済み3連単出目と1〜3着が一致する
- 3連単払戻金が実在し、カンマ、空白、円記号を安全に除去した後も正の安全な整数になる

欠損、unknown、不正値、0円以下の払戻金は除外する。最低オッズからの逆算や推測補完はしない。除外理由はsource不成立、race key欠損・重複、中止、未確定、着順不足、不正車番、3連単不一致、払戻金欠損・不正に分けて表示する。

### 暫定分類

- 堅め: 1〜2,999円（仕様上の0円は不正値として除外）
- 中穴: 3,000〜9,999円
- 荒れ: 10,000〜29,999円
- 大荒れ: 30,000〜99,999円
- 超荒れ: 100,000円以上

この境界値はv1の暫定値であり、将来ユーザー調整可能にする候補とする。

### LOW SAMPLE / breakdown

32-02と同じ基準を全体、R別、会場別、Gレース別へ適用する。

- 30R未満: `LOW SAMPLE / reference only`
- 30〜99R: `caution / 傾向注意`
- 100R以上: `usable trend / 予想の補助`

R別は保存済みraceNumber、会場別はvenueCode / venueNameから平均・中央値・最大・sample数を算出する。会場またはRが不明なraceを推測分類しない。

A級 / S級はcurrent official resultにraceClassがないため`future-accumulation`。Gレースはvenue gradeが`G1`〜`G3`等と明示されたraceだけを`partial`集計する。F1/F2からA級・S級を推測しない。

### 未実装・保護

- 最低3連単オッズ、1番人気オッズ、人気順、締切直前オッズ、オッズ変動、実配当÷最低オッズは未実装
- 最低オッズ比は安定したsourceが蓄積されるまで`future-accumulation`
- fake払戻金、fakeオッズ、架空荒れ指数を生成しない
- 荒れ指数は予想の主根拠ではなく補助傾向として表示する
- `public/data/**`は読み取りのみで、生成・変更・削除していない
- `public/data/reviews/**`は変更、stash、削除、退避、stageしていない

32-04候補はレース連鎖分析とする。`date + venue + raceNumber`のrace keyで同日同会場を並べ、前Rが荒れた後の次R傾向、荒れ連鎖、本命戻り、中穴継続を、前後ともeligibleなofficial resultの場合だけ集計しLOW SAMPLEを表示する。

## 32-04 EX情報棚卸し / 内部タブ / レース連鎖 v1

既存EXページの表示を削除せず棚卸しし、1画面の縦積みから内部タブ切替へ整理した。指定8カテゴリに加え、既存の会場・選手・対戦・条件・役割分析を保持するため`EX ANALYSIS`を追加した。

### 内部タブと既存表示の割当

1. `OVERVIEW`: registrationNo coverage、official entries、source-backed-alias、fake/fuzzy方針、自動更新簡易状態、Result Trend Lab要約、KURARI EX現在地、品質legend、GLOBAL KPI
2. `IDENTITY`: official entries接続、starter source fallback、source-backed-alias、foreign rider alias、mismatch audit、registrationNo source、provenance、fake/fuzzyなし
3. `DATA COVERAGE`: today.generated、official entries、starter source、EX history、official results、取得日時、公開EX import、Slack専用stateのavailability、DATA HEALTH、RAW STATUS
4. `TREND LAB`: data availability、analysis coverage / inventory、source capability、available focus、future accumulation、raw field schema、LOW SAMPLE / fake禁止roadmap
5. `出目ランキング`: 3連単出目、1着 / 2着 / 3着車番、車番別3着内率、filter readiness
6. `荒れ指数`: 実払戻金分類、平均 / 中央値 / 最大、R別 / 会場別 / Gレース別、最低オッズ比future
7. `レース連鎖`: 32-04 official transition分析
8. `WEATHER`: 風速bucket、決まり手、会場別、級班別のpartial / future-accumulation
9. `EX ANALYSIS`: 会場カルテ、PLAYER EXACT、条件別、位置・役割、MATCHUP、関係性、戦法イベント、today recommendation、VENUE / PLAYER / MATCHUP個別画面

非アクティブpanelはEX専用`[hidden]`ルールで非表示にし、既存component・fetch・集計を削除していない。全ページ共通CSSは変更していない。

### レース連鎖 v1 eligible

transition candidateは同一date・同一venueCode内のraceをraceNumber昇順に並べた隣接source recordとする。次をすべて満たすpairだけをeligibleとする。

- feedがKEIRIN.JP / JSJ048でsource date・source取得日時が妥当
- 前後race keyが一意
- 前後ともconfirmedでcancelled / no-raceではない
- raceNumberが正の整数で、次R = 前R + 1
- 前後とも妥当な1〜3着と保存済み3連単が一致
- 前後とも正の3連単実払戻金があり、荒れカテゴリを確定できる
- dateまたぎ、会場またぎをpairとして形成しない

raceNumber欠損・非連続、重複race key、未confirmed、中止、着順・3連単不正、払戻金・カテゴリ欠損は理由別にexcludedとする。推測補完やmissing raceを跨ぐ接続はしない。

### 連鎖分類

- 本命戻り: 前Rが荒れ / 大荒れ / 超荒れ、次Rが堅め
- 荒れ連鎖: 前後とも荒れ / 大荒れ / 超荒れ
- 中穴継続: 前後とも中穴
- 波乱加速: 前Rが堅め / 中穴、次Rが荒れ / 大荒れ / 超荒れ
- 堅め継続: 前後とも堅め
- その他: 上記以外

件数・割合、5×5 category transition matrix、前R荒れ以上からの本命戻り率 / 荒れ連鎖率、実払戻金が大きい代表例最大5件を動的算出する。LOW SAMPLEは既存基準をpair数にも適用し、予想の主根拠にしない。

2026-07-04 official result snapshotの画面検証値はcandidate 56組、eligible 45組、excluded 11組。主な除外は未confirmed 9組、着順・3連単結果不正または未取得2組。これはハードコード値ではなくfeed更新に追随する。

### 保護

- registrationNo coverage 463 / 463、official entries 459人、source-backed-alias 4人を維持
- 3連単ランキングv1、荒れ指数v1、既存identity/source/会場/選手/対戦分析を維持
- unknown / unavailableをimplementedへ昇格しない
- fakeデータ、fake払戻、fake source、fuzzy matchingを追加しない
- `public/data/**`は読み取りのみ
- `public/data/reviews/**`は変更、stash、削除、退避、stageしていない

## 32-05 風速×決まり手分析 v1

WEATHERタブをfuture placeholderからofficial result onlyの実集計へ更新した。KEIRIN.JP / JSJ048のsource情報と取得日時が妥当で、date、venueCodeまたはvenueName、raceNumberから一意race keyを作れ、confirmedかつ中止でないraceだけを候補にする。

- 風速は保存済み`weatherActual.windSpeedMps`のみ使用し、欠損、非数値、負数、異常値を除外する
- 決まり手は保存済みraceまたは1着行の`kimarite`のみ使用する
- 逃 / 逃げ、捲 / 捲り、差 / 差し、マ / マークの明確な表記だけを4カテゴリへ正規化する
- raceと1着行の決まり手が不一致の場合は推測せず除外する
- 風速bucketは0〜1m、1〜3m、3〜5m、5m以上
- bucket別件数、bucket×決まり手の件数・bucket内割合、決まり手全体件数、会場別傾向、除外理由、代表例最大5件を動的算出する
- 級班別はraceClassを安定取得できないため`future-accumulation`
- 30R未満はLOW SAMPLE、30〜99Rはcaution、100R以上も予想の補助に限定する
- fake風速、fake決まり手、着順や3連単からの決まり手推測は行わない

EX wrapperは`width: min(1880px, calc(100% - 40px))`相当へ広げ、各panel / grid childへ`min-width: 0`と長文折返しを適用した。横長tableはdocumentではなくcard内だけでscroll可能とする。

## 32-06 会場クセ分析 v1

独立した`会場クセ / venue bias v1`タブを追加し、KEIRIN.JP / JSJ048のconfirmed official resultだけから全体・会場別傾向を動的算出する。date、venueCodeまたはvenueName、raceNumberによるrace keyが一意で、1〜3着車番、保存済み3連単、正の実払戻金が一致するraceをeligibleとする。未confirmed、race key欠損・重複、着順不正、3連単不一致、払戻金欠損・不正はreason別にexcludedとする。

### v1集計定義

- 内枠決着率: 1〜3着がすべて1〜3番車のrace割合。4番車以上が1台でも入れば対象外
- 外枠絡み率: 1〜3着のどこかに5番車以上が入るrace割合。4番車は中枠
- 1番車飛び率: resultの出走行で1番車を確認できたraceのうち、3連単1〜3着に1番車を含まない割合。欠車・出走確認の厳密化はfuture refinement
- 逃げ / 捲り決着率: raceまたは1着行の決まり手が、逃 / 逃げ、捲 / 捲りへ明確に正規化できるraceだけを分母にする
- 平均3連単配当: eligible official payoutの算術平均
- 万車券率: 3連単実払戻金が10,000円以上のeligible race割合

決まり手欠損、不明表記、raceと1着行の不一致は、車番・配当系のeligibleからは外さず決まり手系分母だけから除外する。3連単結果や着順から決まり手を推測しない。

### 特徴ラベルとLOW SAMPLE

特徴ラベルの固定閾値は、内枠35%以上、外枠70%以上、1番車飛び60%以上、逃げ25%以上、捲り35%以上、平均3連単20,000円以上または万車券25%以上。閾値は表示文言とコードに明記し、実集計率からだけ判定する。

30R未満は`LOW SAMPLE / 参考のみ`、30〜99Rは`caution / 傾向注意`、100R以上も予想の補助に限定する。会場別LOW SAMPLEでは特徴ラベルへ`LOW SAMPLE / 参考`を付け、断定根拠にしない。級班別、7車 / 9車別、欠車を含む1番車出走確認の厳密化は`future-accumulation / future refinement`とする。

fake車番、fake払戻金、fake決まり手、推測補完は行わず、eligible / excluded / reason / 会場別数値は保存済みfeedから毎回再計算する。

2026-07-05の画面検証snapshotでは全63R、eligible 62R、excluded 1Rで、除外理由は1〜3着車番不足1R。これはUI固定値ではなく、feed更新に追随する監査記録である。

