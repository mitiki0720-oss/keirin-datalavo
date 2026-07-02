# KURARI EX Daily Ingestion Validation Gate

## Purpose

future history daily を書く前に、authoritative source、registrationNo source contract、identity uniqueness、prohibited source use を read-only で検査する。validation gate 自体は public data、history daily/index、private input を変更しない。

## Validation input

CLI:

```text
--date YYYY-MM-DD
--source-dir private-input/kurari-ex/raw/YYYY-MM-DD
--history-index public/data/analytics/kurari-ex/history/index.generated.json
```

引数なしでは 2026-06-29、2026-07-01、2026-06-30、2026-06-21 を代表ケースとして検査する。

source は同一 venue の `*-prediction.txt` にある構造化された `【出走表】` block を優先する。prediction prose は使用しない。prediction file がない場合のみ summary の構造化 entry table を候補にする。result/review は starter source にしない。

## Validation output

各日について `dailyIngestionValidationResult` を返す。

- target date、source/history の存在
- source files と採用した entry-table files
- source/starter rows
- registrationNo あり・なし
- exact contract rows / invalid rows
- race 内 duplicate carNo / registrationNo
- same-name candidate / manual-review rows
- NO_STARTERS / race-only availability
- fake/generated/fuzzy detection
- prohibited source use
- decision、block reasons、warnings、next action

集計は `dailyIngestionValidationSummary` に decision 別件数と final status を返す。

## RegistrationNo source contract

EXACT row は同じ構造化 source context から以下を得られる場合だけ認める。

- date
- venueKey
- raceNumber
- carNo
- playerName
- registrationNo
- source file
- source hash

registrationNo は数値形式を満たし、同一 race 内で一意でなければならない。date/venue/race/car/name の別 source join、氏名だけの補完、fuzzy matching は禁止する。

`predictionUsedAsStarterSource=false` は prediction 本文を使用していないことを示す。採用対象は prediction file 内の独立した構造化 `【出走表】` block に限定する。

## Validation decisions

### PASS_READY_FOR_DAILY_WRITE

- source directory と構造化 entry rows がある
- 全 row が exact source contract を満たす
- 全 starter に registrationNo がある
- duplicate、fake、fuzzy、prohibited source use がない

gate 通過後も直接書かず、別タスクの guarded writer と post-write checker を使用する。

### PASS_RACE_ONLY_NO_STARTERS

- history/race data は利用可能
- structured starter source がなく、NO_STARTERS として明示的に扱う
- player-level EXACT は作らない

NO_STARTERS は正常な race-only 状態であり、starter や registrationNo を生成しない。

### WARN_PARTIAL_REGISTRATION_NO

- starter rows はある
- registrationNo 付き row と欠損 row が混在、または全 row で欠損
- 欠損 row を EXACT player analysis に入れない

partial write を行う場合は warning を保持し、name-based backfill を禁止する。

### WARN_MANUAL_REVIEW_REQUIRED

- registrationNo のない same-name candidate row がある
- 既知 registrationNo 候補への自動割当は禁止

authoritative source を収集し、unresolved のまま manual review queue に残す。

### STOP_SOURCE_MISSING

- source directory がない
- または構造化 entry table がなく、race-only としても明示できない

daily/index を書かない。

### STOP_DUPLICATE_IDENTITY

- 同一 race 内の duplicate carNo
- 同一 race 内の duplicate registrationNo

重複を authoritative source で解決するまで停止する。

### STOP_FAKE_OR_GENERATED_IDENTITY

- fake/generated identity marker
- fuzzy matching
- source にない registrationNo/name/carNo/starter の生成

入力を reject する。

### STOP_PROHIBITED_SOURCE_USE

- result または review を starter source に使用
- prediction prose から starter identity を推測

構造化された authoritative entry table を再収集する。

### STOP_CONTRACT_VIOLATION

- date/venue/raceNumber/carNo/playerName が不完全
- registrationNo marker が malformed
- source row contract を満たさない

row を修正または reject し、writer を開始しない。

## Representative result

| Date | Source rows | Exact rows | Missing registrationNo | Decision |
|---|---:|---:|---:|---|
| 2026-06-29 | 464 | 464 | 0 | PASS_READY_FOR_DAILY_WRITE |
| 2026-07-01 | 577 | 394 | 183 | WARN_PARTIAL_REGISTRATION_NO |
| 2026-06-30 | 551 | 551 | 0 | PASS_READY_FOR_DAILY_WRITE |
| 2026-06-21 | 423 | 0 | 423 | WARN_MANUAL_REVIEW_REQUIRED |

全代表日で duplicate identity、fake/generated/fuzzy、result/review source use、contract violation は0件。
future registrationNo contract は 2026-06-29 / 06-30 が `PASS`、2026-07-01 が `PARTIAL`、2026-06-21 が `NOT_READY`。

## When daily write is allowed

- `PASS_READY_FOR_DAILY_WRITE`: guarded writer へ進める。
- `PASS_RACE_ONLY_NO_STARTERS`: race-only writer へ進めるが starter/player data は生成しない。
- `WARN_PARTIAL_REGISTRATION_NO`: warning を保持する partial writer に限り条件付きで進める。
- `WARN_MANUAL_REVIEW_REQUIRED`: ambiguous row を unresolved のまま除外できる場合だけ partial 処理を検討する。

## When daily write is blocked

すべての `STOP_*` decision では daily/index を変更しない。原因を解消して gate を再実行する。

## Safety

- fake completion: none
- fuzzy matching: none
- generated identity: none
- same-name automatic merge: none
- prediction prose/result/review starter source: none
- write performed by gate: false
