# 29-04 legacy pages safe-delete 実施記録

## 目的

29-03で `safe-delete-candidate` に分類された旧 Venues / Players ページ専用画像7件だけを削除する。

player-images、player-cards、reviews、analytics、races、venue data、venue hero assets、`venueSpotlightData.ts` は削除対象に含めない。

## 削除前確認

`scripts/audit-legacy-pages-delete-candidate-risk.mjs` の削除前結果:

```text
safe-delete-candidate: 7
totalBytes: 14,336,266
deletionPerformed: false
finalStatus: LEGACY_PAGES_DELETE_CANDIDATE_RISK_AUDIT_COMPLETED
```

## 削除したファイル

| path | bytes |
| --- | ---: |
| `public/players-page/players-page-bg-sky-green-bank.png` | 1,804,171 |
| `public/venue-features-page/venue-features-bg-bank-intelligence.png` | 1,804,171 |
| `public/venue-features/venue-features-area-map-kurari-wide.png` | 2,679,453 |
| `public/venue-features/venue-features-bg-bank-intelligence.png` | 1,804,171 |
| `public/venue-features/venue-features-hero-bg-lavender-bloom.png` | 1,597,551 |
| `public/venue-features/venue-features-map-side-kurari-charigon.png` | 3,478,818 |
| `public/venue-features/venue-features-map-side-select-bubble.png` | 1,167,931 |
| 合計 | 14,336,266 |

削除対象は29-03のpath一覧と照合し、ワークスペース配下の上記7ファイルだけに限定した。

## 削除後監査

29-03 risk auditの削除後結果:

| 分類 | 件数 | 合計サイズ |
| --- | ---: | ---: |
| safe-delete-candidate | 0 | 0 bytes |
| hold-future-use | 218 | 40,130,312 bytes |
| manual-review-required | 218 | 4,331,208 bytes |
| keep-protected | 5656 | 239,114,933 bytes |
| code-delete-candidate | 1 | 23,360 bytes |

`deletionPerformed: false` はrisk auditスクリプト自体が読み取り専用であることを示す。29-04の実削除は、事前監査で確定した7件だけを明示指定して実施した。

29-02 unused assets auditの削除後結果:

```text
still-referenced: 3
delete-candidate: 220
manual-review: 216
protected: 5654
deletionPerformed: false
```

保護件数は監査実行時点の `public/data/reviews/**` の既存ファイル増分を含む。29-04では保護領域を変更していない。

## 保持確認

- `public/data/player-images/**` は218件すべて保持した。
- `public/data/player-cards/**` と `public/data/player-cards-index.json` は保持した。
- `public/data/reviews/**` は変更していない。
- `public/data/analytics/**` は変更していない。
- `public/data/races/**` は変更していない。
- `public/data/venues/**` は変更していない。
- `public/venues/**` は変更していない。
- `src/data/venueSpotlightData.ts` は削除していない。
- `package.json` は変更していない。
