# KURARI EX Daily Writer Dry-Run Results: 2026-06-29 / 2026-06-30

## Audit status

- Final status: `DAILY_WRITER_DRY_RUN_CANDIDATE_BUILDER_COMPLETED_WITH_WARNINGS`
- Checked dates: 4
- Candidate allowed: 2
- Candidate blocked: 2
- Exact candidates: 2
- Race-only candidates: 0
- NO_STARTERS → STARTERS backfill candidates: 1
- duplicate identity: 0
- fake/generated/fuzzy: 0
- prohibited source use: 0
- `writePerformed=false`

## 2026-06-29

- Preflight: `ALLOW_EXACT_DAILY_WRITE`
- Existing mode: `STARTERS_PARSED`
- Candidate mode: `STARTERS_PARSED`
- Races: 64
- Starters: 464
- registrationNo: 464 / 464
- Change type: `NO_CHANGE`
- Candidate would change history: false
- Candidate payload hash: `sha256:21b9c6a425c6207c2995d434486957d264f83b3f8ea2b336ec92749376652c46`
- Candidate bytes: 441362

raw prediction entry と既存 authoritative history の registrationNo に59件の identity conflict が検出された。これは安全差分ではないため、raw source による EXACT_REFRESH は行わず、既存 history をそのまま candidate とした。

source conflict を authoritative evidence で解消するまで、06-29 の identity refresh は禁止する。既存 history の置換・書換えは行っていない。

## 2026-06-30

- Preflight: `ALLOW_EXACT_DAILY_WRITE`
- Existing mode: `NO_STARTERS`
- Candidate mode: `STARTERS_PARSED`
- Existing races/starters: 76 / 0
- Candidate races/starters: 76 / 551
- registrationNo: 551 / 551
- Change type: `NO_STARTERS_TO_STARTERS_BACKFILL`
- Candidate would change history: true
- Candidate payload hash: `sha256:f917c9ed24db315cc4b85a8d031046a5e77b6005a826df8ef23ad41f655c9a7f`
- Candidate bytes: 527456
- Nonstarter field changes: 0

06-30 は将来の exact backfill candidate としてのみ記録した。public history daily/index には書き込んでいない。実書込前に immutable source manifest、payload hash/bytes、index refresh policy、post-write checker が必要。

## 2026-07-01

- Preflight: `BLOCK_EXACT_WRITE_ALLOW_PARTIAL_WITH_HUMAN_CONFIRMATION`
- Existing mode: `NO_STARTERS`
- Candidate build: blocked
- Candidate mode/change type: `BLOCKED`
- Reason: partial candidate は今回の権限外

registrationNo 欠損183件があるため exact candidate を作らない。partial candidate は人間確認付きの別タスクに限定する。

## 2026-06-21

- Preflight: `BLOCK_WRITE_MANUAL_REVIEW_REQUIRED`
- Existing mode: `STARTERS_PARSED`
- Candidate build: blocked
- Candidate mode/change type: `BLOCKED`
- Same-name manual review rows: 1

山口貴弘候補を自動統合せず、candidate を生成しない。

## Safety result

- duplicate carNo in candidate: 0
- duplicate registrationNo in candidate: 0
- missing registrationNo in allowed exact candidates: 0
- nonstarter field changes: 0
- fake/generated/fuzzy identity: 0
- result/review/prediction prose starter source: 0
- output file: none
- public data write: none

## Next recommended task

`KURARI EX immutable candidate manifest + 2026-06-30 write-safety audit`

06-30 candidate の source files/hash、candidate hash/bytes、race/starter counts、target daily preimage hash、index dependent bytes を固定する。まだ writer は実行せず、rollback と checker を含む write-safety audit を先に行う。
