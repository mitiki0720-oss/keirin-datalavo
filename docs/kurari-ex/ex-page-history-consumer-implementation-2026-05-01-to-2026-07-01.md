# KURARI EX Page History Consumer Implementation

## Purpose

KURARI EX ページから保存済み history index と日別 payload を読み取り、coverage、race preview、identity の欠損状態を確認できる最小 consumer を実装した。

## Implemented files

- `src/types/kurariEx.ts`: index、daily、race、starter、mode、registrationNo status、同姓同名警告の型
- `src/lib/kurariExData.ts`: GitHub Pages 対応 path 解決、index/daily loader、日別集計
- `src/pages/ExDataPage.tsx`: overview、日付選択、daily summary、preview、identity safety notes
- `src/data/kurariExAnalysisInventory.ts`: consumer と未実装領域の実態に沿った inventory
- `scripts/audit-kurari-ex-page-history-consumer-implementation.mjs`: 実装・index hash/bytes・保護 path 監査
- `scripts/check-kurari-ex-page-history-consumer-implementation.mjs`: 変更 scope checker

## Loaded data and supported range

- Index: `/data/analytics/kurari-ex/history/index.generated.json`
- Daily: index の `items[].file` を使用して日付または path から取得
- Range: 2026-05-01 to 2026-07-01
- Registered days: 58
- Race count: 4373
- Latest date: 2026-07-01
- Latest path: `/data/analytics/kurari-ex/history/daily/2026-07/2026-07-01.generated.json`

`getKurariExAssetPath` は `import.meta.env.BASE_URL` を適用するため、GitHub Pages の `/keirin-datalavo/` 配下でも `/data/...` を正しい asset URL に解決する。

## UI sections

- KURARI EX History Overview
- History Date Selector
- Selected Daily Summary
- Venue / Race Preview（先頭20R）
- Identity Safety Notes

## Handling and safety

- `STARTERS_PARSED`: 全 race に保存済み starters がある。
- `NO_STARTERS`: starters がない正常な履歴状態。エラー扱いしない。
- `MIXED`: 同日内で starters あり・なしが混在する。
- registrationNo 欠損は `MISSING_REGISTRATION_NO` のまま表示し、生成・削除しない。
- NO_STARTERS race は `NO_STARTERS` と表示する。
- 同姓同名候補は registrationNo ごとに分離を維持し、自動統合しない。
- 山口貴弘の未割当9件は手動確認対象として表示する。
- prediction、result、review を starter source に使用しない。
- fake completion、fuzzy matching、選手名・carNo・registrationNo の生成を行わない。

## Limitations

- 古い履歴の registrationNo 欠損2480件は欠損のまま残る。
- automatic registrationNo backfill は source missing / not-generated / fake-prohibited。
- daily automation は planned / not implemented。
- player-level の高度な履歴分析は今回の最小 consumer の範囲外。

## Next steps

- 検証付き daily automation
- registrationNo 欠損日に対する正規 source collection
- registrationNo を identity key とする richer player-level analysis
