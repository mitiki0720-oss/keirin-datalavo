# KURARI EX Data Completion Next Actions

## Current status

- 対象: 2026-05-01 to 2026-07-01、62日
- History: 58日、4373R
- EXACT player-ready: 1日
- PARTIAL player-ready: 11日
- RACE_ONLY: 39日
- SOURCE_MISSING: 4日
- MANUAL_REVIEW: 7日、山口貴弘の未割当9件
- Starters: 8025
- registrationNo present / missing: 5545 / 2480
- Backfill recommendation: `SOURCE_COLLECTION_FIRST`

## What is already safe

- history index/daily の race-level consumer
- STARTERS_PARSED / MIXED / NO_STARTERS / SOURCE_MISSING の区別
- registrationNo 付き starter の同一 race 内 identity
- duplicate carNo / registrationNo が0件
- same-name candidate の registrationNo 別分離
- fake/fuzzy/generated identity を行わない運用
- 2026-06-29 の64R・464 starters・registrationNo完全 coverage

## What remains incomplete

- registrationNo 欠損2480件
- NO_STARTERS 39日
- indexed history/source がない4日
- 山口貴弘の未割当9件
- future daily ingestion の自動 validation/writer/checker
- 正規 source に基づく古い欠損日の再収集

## Priority order

### 1. Future registrationNo source contract adoption

今後の summary / prediction 作成時に、date、venue、raceNumber、carNo、playerName、registrationNo と source provenance を持つ出走表 snapshot を必須化する。

### 2. Daily ingestion validation gate

writer 前に exact/partial/race-only/source-missing/manual-review を判定し、duplicate、cross-date、same-name merge、generated identity を block する。

### 3. Source collection for old missing registrationNo

2480件は `READY_EXACT 0` のため一括 backfill を開始しない。同日・同会場・同 race・同 carNo・同 playerName・registrationNo を同一 authoritative row で確認できる source を収集する。

### 4. 山口貴弘9件の manual review

対象日は 2026-06-11、06-12、06-13、06-14、06-19、06-20、06-21。013615 / 014268 のどちらかへ name-only で割り当てない。

### 5. Source-missing 4日の取扱い

2026-05-18、05-19、06-16、06-26。authoritative source が取得できない場合は `EX_SOURCE_MISSING` を維持し、race/starter を生成しない。

### 6. Design/UI after data gate stability

EXACT/PARTIAL/RACE_ONLY の基準、future source contract、daily validation が継続運用できる状態になってから、player-level UI や追加カードを設計する。

## Do not start yet

- 欠損2480件の name-based bulk backfill
- 同姓同名候補の自動統合
- prediction/result/review 由来の starter 作成
- source-missing 日の推測生成
- データ readiness を隠す UI 表現

## Next recommended Codex task

`KURARI EX future registrationNo entry snapshot schema + daily ingestion validation gate dry-run`

範囲は schema、read-only dry-run、audit/checker に限定し、writer は dry-run が全 representative case で安定してから別タスクにする。
