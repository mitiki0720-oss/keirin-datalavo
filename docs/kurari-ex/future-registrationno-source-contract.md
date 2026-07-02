# KURARI EX Future RegistrationNo Source Contract

## Purpose

今後の summary / prediction 作成時に、出走表の authoritative registrationNo を同時保存するための契約を定義する。registrationNo 欠損、同姓同名の誤統合、cross-race join、fake identity の再発を防ぐ。

## Future source rule

今後の summary / prediction には、予想本文とは独立した出走表 snapshot を保存する。各 starter row は最低限、次の値を持つ。

- `date`
- `venueName` と正規化済み `venueKey`
- `raceNumber`
- `carNo`
- `playerName`
- `registrationNo`
- `prefecture`（source に存在する場合）
- `age`（source に存在する場合）
- `term`（source に存在する場合）
- `className`（source に存在する場合）

source provenance として `sourcePath`、`sourceHash`、`sourceCapturedAt`、`sourceType`、schema/version も保存する。

## Accepted registrationNo source

registrationNo 付き選手 source として受理するには、すべて満たす必要がある。

1. registrationNo が authoritative な出走表または検証済み entry snapshot に明示されている。
2. `date + venueKey + raceNumber + carNo + playerName` が同一 source row 内にある。
3. date、venue、raceNumber は対象 history race と完全一致する。
4. carNo は同一 race 内で一意であり、history starter と完全一致する。
5. playerName は NFKC・空白正規化後に完全一致する。fuzzy match は使わない。
6. registrationNo は許可形式を満たし、同一 race 内で一意である。
7. source path/hash と取得時刻を監査できる。
8. prediction/result/review 本文から推測した値ではない。

一致しない row は reject または unresolved とし、別日・別会場・別 race から補わない。

## Source without registrationNo

source に registrationNo がない場合:

- starter row 自体は、同日・同会場・同 race の表示素材として保存可能。
- `registrationNo` は `null` のまま維持する。
- `identityStatus` は unresolved/source-missing 相当とする。
- player-level EXACT 集計、cross-day matchup、同姓同名統合には使用しない。
- source collection queue に残す。

氏名と carNo が一致しても registrationNo を補完してはならない。

## Same-name candidates

- registrationNo が異なる同姓同名は別 identity として維持する。
- name-only record を既知 registrationNo 候補へ自動割当しない。
- 候補が複数ある場合は `MANUAL_REVIEW_REQUIRED` とする。
- 石井貴子、山中貴雄は registrationNo 別分離を維持する。
- 山口貴弘の未割当9件は authoritative source を収集し、人手で確認する。
- manual review でも source evidence がない値は確定しない。

## Prohibited operations

- fake completion
- fuzzy matching
- generated registrationNo、playerName、carNo、starter
- 氏名だけによる registrationNo backfill
- same-name automatic merge
- prediction/result/review 本文からの starter identity 生成
- cross-date join
- cross-venue join
- raceNumber または carNo 不一致の join
- 欠損 row の別 race starter による穴埋め

## Daily ingestion validation gate

daily を history/index に追加する前に、次を検証する。

1. target date と source date が一致する。
2. venueKey、raceNumber、carNo の重複・欠落がない。
3. starterCount と starter rows が一致する。
4. registrationNo がある row は形式・race 内一意性を満たす。
5. 同じ registrationNo が同一 race の複数 carNo に存在しない。
6. source path/hash/provenance が保存されている。
7. source のない registrationNo が生成されていない。
8. same-name candidate が name-only で統合されていない。
9. prediction/result/review が starter source として使われていない。
10. writer 後に payload hash、bytes、race count、index latest を checker で再確認する。

gate outcome は `PASS_EXACT`、`PASS_PARTIAL`、`RACE_ONLY`、`BLOCKED_SOURCE_MISSING`、`MANUAL_REVIEW_REQUIRED` を区別する。

## Failure handling

- validation failure 時は history/index を更新しない。
- 既存 daily/index を上書きしない。
- 原因を block reason と source path 付きで記録する。
- registrationNo 欠損は partial として保持し、fake completion しない。
- same-name ambiguity は manual review queue に送る。
- authoritative source を取得後、同じ validation gate を最初から再実行する。
