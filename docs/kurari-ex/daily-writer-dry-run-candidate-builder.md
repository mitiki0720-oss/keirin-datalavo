# KURARI EX Daily Writer Dry-Run Candidate Builder

## Purpose

validation gate と writer preflight を通過した日だけ、writer が生成する予定の history daily JSON をメモリ内で構築・検査する。candidate file、public history、index は書き込まない。

## Relation to validation and preflight

処理順:

1. daily ingestion validation gate
2. daily writer preflight bridge
3. dry-run candidate builder

candidate builder は preflight decision を拡張解釈しない。

- `ALLOW_EXACT_DAILY_WRITE`: exact candidate を構築可能
- `ALLOW_RACE_ONLY_NO_STARTERS_WRITE`: race-only candidate を構築可能
- partial / manual-review / STOP: candidate を構築しない

## Dry-run only policy

- `writePerformed=false`
- `outputPath=null`
- public history daily/index を変更しない
- candidate JSON はメモリ内だけ
- CLI の `--dry-run` は明示用であり、flag がなくても書込み機能は存在しない

## CLI

```text
--date YYYY-MM-DD
--source-dir private-input/kurari-ex/raw/YYYY-MM-DD
--writer-mode exact | race-only | partial
--dry-run
```

引数なしでは 2026-06-29、2026-06-30、2026-07-01、2026-06-21 を検査する。

## Exact candidate

1. preflight が exact を許可している。
2. source rows/races が preflight contract 件数と一致する。
3. source の全 starter に registrationNo がある。
4. source race と existing history race を date/venueKey/raceNumber で完全対応させる。
5. starter は carNo 順で race 内一意。
6. result、prediction、review、lineup、weather など非starter field を変更しない。
7. quality 変更は starterParsed、starterSource、NO_STARTERS marker/warnings の除去だけ。

既存 history が既に registrationNo 完全な STARTERS_PARSED の場合、raw source と conflict があっても既存 authoritative identity を置換しない。不変 candidate を返し、refresh は source reconciliation まで停止する。

## Race-only candidate

- preflight が race-only を許可
- existing history が NO_STARTERS
- candidate は既存 daily の不変 clone
- starterCount/starter/registrationNo を生成しない

## Partial block

`BLOCK_EXACT_WRITE_ALLOW_PARTIAL_WITH_HUMAN_CONFIRMATION` では candidate を作らない。partial candidate は人間確認を含む別タスクで扱う。

## Manual-review block

`BLOCK_WRITE_MANUAL_REVIEW_REQUIRED` では candidate を作らない。同姓同名候補を registrationNo へ自動割当しない。

## Candidate validation

各 in-memory candidate で確認する。

- race count
- starter total
- registrationNo present/missing
- duplicate carNo / registrationNo
- nonstarter field changes
- fake/generated/fuzzy
- prohibited source use
- payload hash
- pretty-printed JSON bytes
- existing history mode と candidate mode
- change type

## Change types

- `NO_CHANGE`: existing history と byte-equivalent な payload candidate
- `EXACT_REFRESH`: starter-related fieldだけを安全に更新する候補
- `NO_STARTERS_TO_STARTERS_BACKFILL`: existing NO_STARTERS を exact starters へ移行する候補
- `BLOCKED`: candidate 非生成

## Identity safety

- 氏名だけで registrationNo を補完しない
- cross-date / cross-venue join なし
- same-name automatic merge なし
- prediction prose/result/review を starter source にしない
- missing registrationNo の exact candidate なし
- duplicate identity の candidate なし

## Public data write prohibition

この step では public data、history daily/index、reviews、races、private-input、src を変更しない。candidate の実書込は immutable manifest と post-write checker を備えた別タスクでのみ検討する。
