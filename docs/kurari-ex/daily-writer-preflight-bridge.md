# KURARI EX Daily Writer Preflight Bridge

## Purpose

daily ingestion validation gate の判定を、daily writer が実行可能な mode へ変換する。preflight bridge は dry-run 専用で、history daily/index、public data、private input を変更しない。

## Relationship with validation gate

preflight は `audit-kurari-ex-daily-ingestion-validation-gate.mjs` の `dailyIngestionValidationResult` を唯一の判定元とする。validation decision だけで許可せず、duplicate、registrationNo coverage、contract status、same-name manual review、source hash/race rows を再確認する。

引数なしでは 2026-06-29、2026-06-30、2026-07-01、2026-06-21 の validation を read-only で再実行する。

## CLI input

```text
--date YYYY-MM-DD
--source-dir private-input/kurari-ex/raw/YYYY-MM-DD
--validation-result path/to/validation-result.json
--writer-mode exact | partial | race-only | no-write
```

既定 `writer-mode` は `no-write`。`--validation-result` は単一 validation record、record 配列、または `dailyIngestionValidationResult` 配列を持つ JSON object を受理する。

## Writer decisions

### ALLOW_EXACT_DAILY_WRITE

元 decision: `PASS_READY_FOR_DAILY_WRITE`

追加条件:

- duplicate carNo / registrationNo が0
- fake/generated/fuzzy が0
- prohibited source use が0
- invalid source contract row が0
- `startersWithRegistrationNo === startersDetected`
- registrationNo 欠損が0
- same-name manual review が0
- future registrationNo contract が `PASS`
- validated race rows と source hash が存在

許可 mode は `exact`。

### ALLOW_RACE_ONLY_NO_STARTERS_WRITE

元 decision: `PASS_RACE_ONLY_NO_STARTERS`

追加条件:

- startersDetected が0
- noStartersAllowed が true
- validated race rows が存在
- identity safety violation が0

許可 mode は `race-only`。starter、carNo、playerName、registrationNo を生成しない。

### BLOCK_EXACT_WRITE_ALLOW_PARTIAL_WITH_HUMAN_CONFIRMATION

元 decision: `WARN_PARTIAL_REGISTRATION_NO`

- exact writer は block
- registrationNo 欠損 row は null/unresolved のまま
- partial writer は別 write step で人間が明示確認した場合だけ候補
- preflight 自体には確認・write 機能を持たせない

許可 mode は `partial-with-confirmation`。`dailyWriteAllowed` は確認前なので false。

### BLOCK_WRITE_MANUAL_REVIEW_REQUIRED

元 decision: `WARN_MANUAL_REVIEW_REQUIRED`

same-name candidate を自動割当せず、すべての writer mode を block する。authoritative evidence による manual review 後、validation gate から再実行する。

### BLOCK_WRITE

元 decision が `STOP_*`、未知 decision、または validation/preflight invariant 不一致の場合。

daily/index は変更しない。STOP reason または invariant failure を解消する。

## Representative result

| Date | Validation | Writer decision | Validated starters | Validated races |
|---|---|---|---:|---:|
| 2026-06-29 | PASS_READY_FOR_DAILY_WRITE | ALLOW_EXACT_DAILY_WRITE | 464 | 64 |
| 2026-06-30 | PASS_READY_FOR_DAILY_WRITE | ALLOW_EXACT_DAILY_WRITE | 551 | 76 |
| 2026-07-01 | WARN_PARTIAL_REGISTRATION_NO | BLOCK_EXACT_WRITE_ALLOW_PARTIAL_WITH_HUMAN_CONFIRMATION | 577 | 83 |
| 2026-06-21 | WARN_MANUAL_REVIEW_REQUIRED | BLOCK_WRITE_MANUAL_REVIEW_REQUIRED | 423 | 57 |

2026-06-30 の現在の history は NO_STARTERS だが、将来の guarded backfill/write 候補として exact preflight を通過したという意味である。この監査では既存 daily を変更していない。

## Writer preflight record

各 record は以下を返す。

- date
- validationDecision
- writerDecision
- writerModeAllowed
- requestedWriterMode / requestedWriterModeAllowed
- daily/exact/race-only/partial permissions
- blocked / requiredHumanConfirmation
- blockReasons / warnings
- expectedWriterInputContract
- nextAction
- writePerformed

## Expected writer input contract

writer に渡せる情報は preflight が固定した次の値だけ。

- `date`
- `sourceDir`
- `sourceHash`
- `sourceFiles`
- `validatedStarterRows`
- `validatedRaceRows`
- `validationDecision`
- `writerDecision`

writer は source file/hash を再確認し、preflight 後に source が変化していれば停止する。未検証 row や別日・別会場・別 race のデータを追加しない。

## Writer block conditions

- validation decision が manual-review または STOP
- requested writer mode が許可 mode と不一致
- registrationNo 欠損を exact writer に渡そうとした
- duplicate identity
- fake/generated/fuzzy identity
- result/review または prediction prose の starter source 使用
- same-name automatic merge
- source hash/race rows 不足
- validation/preflight invariant mismatch

## Safety

- fake completion: none
- fuzzy matching: none
- generated identity: none
- same-name automatic merge: none
- prediction prose/result/review starter source: none
- public data write: none
- history daily/index write: none
