# 29-03 legacy pages delete-candidate 安全ランク監査

## 目的

29-02で検出した旧 Venues / Players ページ関連の `delete-candidate` を、実削除前に用途と参照リスクで再分類する。

`scripts/audit-legacy-pages-delete-candidate-risk.mjs` は29-02と同じ候補・保護領域を走査し、`src/**/*.ts` と `src/**/*.tsx` のimport、明示public URL、動的URL候補を再確認する。スクリプトは読み取り専用で、ファイル削除やデータ更新を行わない。

## 分類ルール

### A. safe-delete-candidate

- `public/players-page/**`
- `public/venue-features-page/**`
- `public/venue-features/**`
- 現在のsrcから参照がない旧ページ専用画像
- EX / Prediction / playerCards の動的参照候補ではないもの

### B. hold-future-use

- `public/data/player-images/**`
- 現在はsrc参照がなくても、将来EXや選手カルテで利用する可能性がある選手画像
- 削除せず保留する

### C. manual-review-required

- `public/data/player-cards/**`
- `public/data/player-cards/index.json`
- `public/data/player-cards-index.json`
- `src/lib/playerCards.ts` の動的URL生成またはruntime index経由で利用される可能性があるもの
- 自動削除は禁止する

`public/data/player-cards/index.json` は29-02で `still-referenced` だったが、29-03では明示されたCのルールを優先して `manual-review-required` に分類する。

### D. keep-protected

- `public/data/reviews/**`
- `public/data/analytics/**`
- `public/data/races/**`
- `public/data/venues/**`
- `public/venues/**`
- `src/pages/venueFeatures/venueFeatureParsers.ts`
- `src/pages/venueFeatures/venueFeatureTypes.ts`
- 現在のsrcから直接参照されるもの

### E. code-delete-candidate

- `src/data/venueSpotlightData.ts`
- 現在のsrcから参照がない場合だけ候補とする
- 29-03では削除せず、次タスクで個別判断する

## 監査結果

実行時点の結果:

| 分類 | 件数 | 合計サイズ |
| --- | ---: | ---: |
| safe-delete-candidate | 7 | 14,336,266 bytes（13.67 MiB） |
| hold-future-use | 218 | 40,130,312 bytes（38.27 MiB） |
| manual-review-required | 218 | 4,331,208 bytes（4.13 MiB） |
| keep-protected | 5655 | 239,107,649 bytes（228.03 MiB） |
| code-delete-candidate | 1 | 23,360 bytes（約22.81 KiB） |
| 合計 | 6099 | 297,928,795 bytes（284.13 MiB） |

29-02記録時の `protected: 5652` から、現在の再実行では `protected: 5653` へ1件増えている。これは保護領域 `public/data/reviews/**` の既存ファイル増分であり、29-03は保護領域を変更していない。29-03の `keep-protected` は現在の保護5653件とstill-referenced parser 2件の合計。

正常終了時:

```text
finalStatus: LEGACY_PAGES_DELETE_CANDIDATE_RISK_AUDIT_COMPLETED
deletionPerformed: false
```

### safe-delete-candidate

7件すべてが旧ページ名のディレクトリにある画像で、現在のsrc参照と認識可能な動的参照は見つからなかった。

- `public/players-page/players-page-bg-sky-green-bank.png`
- `public/venue-features-page/venue-features-bg-bank-intelligence.png`
- `public/venue-features/venue-features-area-map-kurari-wide.png`
- `public/venue-features/venue-features-bg-bank-intelligence.png`
- `public/venue-features/venue-features-hero-bg-lavender-bloom.png`
- `public/venue-features/venue-features-map-side-kurari-charigon.png`
- `public/venue-features/venue-features-map-side-select-bubble.png`

### hold-future-use

`public/data/player-images/**` の218件。現在のsrc参照はないが、選手画像は将来EXや選手カルテで利用する可能性があるため削除しない。

### manual-review-required

選手カード関連218件。`src/lib/playerCards.ts` は `/data/player-cards/${registrationNo}.md` を動的生成し、`public/data/player-cards/index.json` の `file` も利用するため削除禁止。

### keep-protected

指定された保護領域5653件と、現在もimportされるvenue parser/type 2件。参照や保護指定があるため削除禁止。

### code-delete-candidate

`src/data/venueSpotlightData.ts` 1件、23,360 bytes。現在のsrc参照は見つからなかったが、コード削除は影響確認を分けるため次タスクで個別判断する。

## 次に削除できそうな最小範囲

最小の意味的スコープは `public/players-page/**` の1ファイル、1,804,171 bytes。

旧Playersページ名に閉じた画像で、現在のsrc参照も動的参照候補も見つかっていない。ただし29-03では削除せず、次タスクで明示承認を得てから扱う。

## 結論

- player-images は将来EX利用の可能性があるため保留する。
- player-cards は動的参照とindex経由参照の可能性があるため削除禁止。
- protected とstill-referenced parserは削除禁止。
- code-delete-candidate は個別確認まで削除しない。
- 29-03では実削除を実行しておらず、`deletionPerformed` は `false`。
