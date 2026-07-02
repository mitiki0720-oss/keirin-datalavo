# KURARI EX Page Production Smoke Audit

## Audit status

- Production smoke: `EX_PAGE_PRODUCTION_SMOKE_PASS`
- Scope checker: `EX_PAGE_PRODUCTION_SMOKE_CHECK_PASS_WITH_WARNINGS`
- Checker warning: 作業前から存在する `public/data/reviews/**` 94ファイルのみ
- Audit date: 2026-07-02 JST
- Source commit: `517e84760 Add KURARI EX history consumer to EX page`

## Production endpoints

- Page URL: `https://mitiki0720-oss.github.io/keirin-datalavo/#ex-data-page`
- Index URL: `https://mitiki0720-oss.github.io/keirin-datalavo/data/analytics/kurari-ex/history/index.generated.json`
- Latest daily URL: `https://mitiki0720-oss.github.io/keirin-datalavo/data/analytics/kurari-ex/history/daily/2026-07/2026-07-01.generated.json`

ページ、index、latest daily は HTTP 200 で到達できた。production bundle に History Overview、日付 selector、identity safety notes が含まれ、`/keirin-datalavo/` の GitHub Pages BASE_URL 配下から JSON を取得できた。

## Index result

- Payload hash: `sha256:683fd01dea2e0e5f272d35eff42bde236ba326954e857feaa9dec04f77cb3acb`
- Bytes: 14079
- Source/index items: 58
- Registered days: 58
- Race count: 4373
- Latest date: 2026-07-01
- Latest path: `/data/analytics/kurari-ex/history/daily/2026-07/2026-07-01.generated.json`

## Representative daily checks

| Date | Races | Mode | Starters | Result |
|---|---:|---|---:|---|
| 2026-07-01 | 83 | NO_STARTERS | 0 | PASS |
| 2026-06-29 | 64 | STARTERS_PARSED | 464 | PASS |
| 2026-06-30 | 76 | NO_STARTERS | 0 | PASS |
| 2026-06-21 | 61 | STARTERS_PARSED | 451 | PASS |

本番画面の日付 selector を 2026-06-29 に変更し、`STARTERS_PARSED` と starters 464 の表示更新も確認した。NO_STARTERS はエラーではなく正常な履歴状態として表示された。

## Identity safety

- registrationNo 欠損を生成・補完しない。
- `identityStatus` に generated / fake / fuzzy の痕跡なし。
- 同姓同名候補を自動統合しない production policy marker を確認。
- 石井貴子の登録番号 014962 / 015023 を分離維持。
- 山中貴雄の登録番号 013264 / 014108 を分離維持。
- 山口貴弘の未割当9件を手動確認対象として表示。

## Warnings

Production smoke 自体に warning はない。GitHub Pages は commit `517e84760` の history consumer を配信しており、stale deployment warning は発生しなかった。

Checker の `PASS_WITH_WARNINGS` は、この作業以前から存在する review 差分を保持したためである。この作業では review、history、races、private-input、package.json、src を変更していない。

## Limitations

- 本監査は production endpoint と代表4日を対象にした smoke test で、58日全 payload の再監査ではない。
- GitHub Pages の反映遅延が発生した場合、production bundle が旧版なら warning、index/daily が期待値と不一致または到達不能なら fail とする。

## Next steps

- history index 更新後に同じ production smoke を再実行する。
- daily automation 実装時に、production latest date と source availability の継続監視を追加する。
