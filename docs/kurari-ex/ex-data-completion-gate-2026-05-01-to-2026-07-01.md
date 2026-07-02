# KURARI EX Data Completion Gate: 2026-05-01 to 2026-07-01

## Purpose

EX ページで利用する history data を、画面設計の前にデータ完成度で分類する。保存済みデータを表示できることと、選手単位の EXACT 分析が可能であることを分離し、欠損 identity を生成しない。

## Audit status

- Final status: `EX_DATA_COMPLETION_GATE_COMPLETED_WITH_WARNINGS`
- Target period: 2026-05-01 to 2026-07-01
- Total target days: 62
- History days: 58
- History races: 4373
- Index hash: `sha256:683fd01dea2e0e5f272d35eff42bde236ba326954e857feaa9dec04f77cb3acb`
- Index bytes: 14079
- Integrity failures: 0

Warning は、partial、NO_STARTERS、source missing、manual review の対象が残っていることを示す。監査失敗ではない。

## History modes

| Mode | Days | Meaning |
|---|---:|---|
| STARTERS_PARSED | 5 | 全 race に保存済み starters がある |
| NO_STARTERS | 39 | race data はあるが starters はない |
| MIXED | 14 | 同日内に starters あり・なしの race が混在 |
| SOURCE_MISSING | 4 | 対象日に indexed history daily がない |

STARTERS_PARSED の日付は 2026-06-10、06-11、06-17、06-21、06-29。

SOURCE_MISSING は 2026-05-18、05-19、06-16、06-26。推測による race/starter 生成は禁止する。

## Completion categories

判定順序は `MANUAL_REVIEW` → `SOURCE_MISSING` → `RACE_ONLY` → `PARTIAL` → `EXACT` とする。1日は必ず1 category に所属する。

| Completion category | Days | Gate |
|---|---:|---|
| EX_READY_EXACT_PLAYERS | 1 | 全 race に starters があり、全 starter に registrationNo がある |
| EX_READY_PARTIAL_PLAYERS | 11 | starters は利用可能だが registrationNo 欠損または NO_STARTERS race が混在 |
| EX_READY_RACE_ONLY | 39 | NO_STARTERS。race/result/prediction/review 表示のみ |
| EX_SOURCE_MISSING | 4 | authoritative source 収集まで block |
| EX_MANUAL_REVIEW_REQUIRED | 7 | 同姓同名の未割当 record があり自動統合禁止 |

EX_READY_EXACT_PLAYERS は 2026-06-29 の1日。64R、464 starters、registrationNo 464/464。

EX_MANUAL_REVIEW_REQUIRED は 2026-06-11、06-12、06-13、06-14、06-19、06-20、06-21。

## Display readiness

| Display readiness | Days |
|---|---:|
| READY | 1 |
| READY_WITH_WARNINGS | 11 |
| RACE_ONLY | 39 |
| BLOCKED_SOURCE_MISSING | 4 |
| MANUAL_REVIEW | 7 |

NO_STARTERS はデータ読込エラーではない。選手別分析は不可だが、保存済み race、venue、result、prediction、review summary は利用できる。

## Player analysis readiness

| Player analysis readiness | Days |
|---|---:|
| EXACT_AVAILABLE | 1 |
| PARTIAL_AVAILABLE | 11 |
| UNAVAILABLE_NO_STARTERS | 39 |
| BLOCKED | 4 |
| MANUAL_REVIEW_REQUIRED | 7 |

PARTIAL_AVAILABLE では registrationNo 付き starter だけを exact identity として利用できる。registrationNo のない starter は選手名ベース参考に限定し、別日・別会場・別 race へ join しない。

## RegistrationNo coverage

- Total starters: 8025
- registrationNo present: 5545
- registrationNo missing: 2480
- NO_STARTERS races: 3258
- Backfill READY_EXACT: 0
- Recommendation: `SOURCE_COLLECTION_FIRST`

欠損2480件は保存状態のまま維持する。氏名、車番、prediction、result、review から registrationNo を生成しない。

## Same-name candidate handling

- 石井貴子: 014962 / 015023 を分離維持
- 山中貴雄: 013264 / 014108 を分離維持
- 山口貴弘: 013615 / 014268 の候補があり、registrationNo 未割当9件は manual review
- Manual review records: 9
- Manual review days: 7
- Automatic merge: 0

未割当 record は authoritative registrationNo source が得られるまでどちらにも割り当てない。

## Safety result

- duplicate carNo in same race: 0
- duplicate registrationNo in same race: 0
- cross-date/venue/race mix: 0
- fake completion: 0
- fuzzy matching: 0
- generated identity: 0
- same-name automatic merge: 0

## Conclusion

EX の race-level 表示は58 history daysで利用できる。一方、選手単位で完全な EXACT 分析が可能なのは現在1日だけである。UI拡張より先に future registrationNo source contract、daily ingestion validation、古い欠損 source collection を安定させる。
