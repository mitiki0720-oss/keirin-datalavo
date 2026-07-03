# 29-02 旧 Venues / Players ページ削除後の未使用 assets / data / import 監査

## 目的

29-01で旧 Venues / Players ページ、ナビゲーションタブ、route/hash分岐、ページコンポーネントを削除した。

29-02では、旧ページ削除により未使用になった可能性がある assets / data / parser / import を dry-run で洗い出す。監査は `scripts/audit-legacy-pages-unused-assets.mjs` で実行し、ファイル削除やデータ更新は行わない。

## 監査方法

- `src/**/*.ts` と `src/**/*.tsx` を走査する。
- source import、明示的な public URL、テンプレートリテラルによる動的URL候補を確認する。
- 旧ページに関連する public assets、player data、venue parser、`venueSpotlightData.ts` を分類する。
- 保護領域は参照状況より保護指定を優先し、削除候補にしない。
- `public/players/` は現在存在しないため、missing path として記録する。

実行コマンド:

```powershell
node scripts/audit-legacy-pages-unused-assets.mjs
```

正常終了時の `finalStatus`:

```text
LEGACY_PAGES_UNUSED_ASSETS_AUDIT_COMPLETED
```

## 監査結果

| 分類 | 件数 | 判断 |
| --- | ---: | --- |
| still-referenced | 3 | 現在のsrcから参照されているため削除禁止 |
| delete-candidate | 227 | 次タスクで人間が確認した後に削除可否を判断 |
| manual-review | 216 | 動的参照またはruntime index経由の可能性があるため削除禁止 |
| protected | 5652 | 29-02の保護指定により監査対象外・削除禁止 |

分類対象は合計6098ファイル。監査時の `deletionPerformed` は `false`。

### still-referenced

- `public/data/player-cards/index.json`
  - `src/lib/playerCards.ts` から明示参照されている。
- `src/pages/venueFeatures/venueFeatureParsers.ts`
  - `src/pages/PageImplementations.tsx` からimportされている。
- `src/pages/venueFeatures/venueFeatureTypes.ts`
  - `src/pages/PageImplementations.tsx` と `venueFeatureParsers.ts` からimportされている。

これら3ファイルは削除禁止。

### delete-candidate

内訳:

| 対象 | 件数 |
| --- | ---: |
| `public/players-page/**` | 1 |
| `public/venue-features-page/**` | 1 |
| `public/venue-features/**` | 5 |
| `public/data/player-images/**` | 218 |
| `public/data/player-cards-index.json` | 1 |
| `src/data/venueSpotlightData.ts` | 1 |
| 合計 | 227 |

現在のsrc import、明示public URL、認識可能な動的URL参照は見つからなかった。ただし、この分類は削除承認ではない。次タスクで人間が利用経路、運用スクリプト、外部参照を確認してから判断する。

### manual-review

`public/data/player-cards/*.md` の216ファイルを分類した。

`src/lib/playerCards.ts` が `/data/player-cards/${registrationNo}.md` を動的に組み立て、runtime indexの `file` も読み込むため、自動削除は禁止する。

### protected

以下は29-02の保護領域として削除候補から除外した。

| 保護領域 | ファイル数 |
| --- | ---: |
| `public/data/reviews/**` | 1396 |
| `public/data/analytics/**` | 4114 |
| `public/data/races/**` | 6 |
| `public/data/venues/**` | 94 |
| `public/venues/**` | 42 |
| 合計 | 5652 |

保護領域は参照の有無にかかわらず削除禁止。監査スクリプトは読み取りのみで、これらのファイルを変更しない。

## 次タスクへの引き継ぎ

- still-referenced は削除しない。
- delete-candidate は人間確認後に削除可否を判断する。
- manual-review は動的参照監査が完了するまで削除しない。
- protected は対象外とし、削除しない。
- 29-02では実ファイルを一切削除していない。
