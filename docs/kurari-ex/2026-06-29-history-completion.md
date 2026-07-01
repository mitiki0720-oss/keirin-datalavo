# KURARI EX 2026-06-29 History Completion Memo

## Status

- Status:
  - `PHASE_COMPLETE_2026_06_29`
- Final consistency:
  - `FINAL_CONSISTENCY_PASS_2026_06_29`
- UI/API smoke:
  - `UI_API_CONSUMPTION_SMOKE_PASS_2026_06_29`
- Latest verified commit:
  - `a71b4c3cb Add KURARI EX UI API consumption smoke audit for 2026-06-29`

## Scope

- 2026-06-29 の KURARI EX history daily、index、starters bridge、UI/API smokeまで完了。
- 2026-06-25〜2026-06-28のhistory追加は別工程。
- `public/data/reviews/**` は今回のスコープ外。

## Final Data Paths

- History index:
  - `public/data/analytics/kurari-ex/history/index.generated.json`
- History daily:
  - `public/data/analytics/kurari-ex/history/daily/2026-06/2026-06-29.generated.json`
- Public daily path:
  - `/data/analytics/kurari-ex/history/daily/2026-06/2026-06-29.generated.json`
- Starters source:
  - `public/data/analytics/kurari-ex/source/starters/2026-06-29/today-registration-starters.generated.json`
- Entries snapshot:
  - `public/data/races/entries-history/2026-06-29/keirin-jp-entries.generated.json`

## Final Verified Metrics

- Daily hash:
  - `sha256:21b9c6a425c6207c2995d434486957d264f83b3f8ea2b336ec92749376652c46`
- Daily bytes:
  - `441362`
- Index hash:
  - `sha256:d506eaf1f4765636d3196048843c6375049f0b964a2b1298fecb18d14ecb1d74`
- Index `totalBytes`:
  - `11009372`
- Target-date index bytes:
  - `441362`
- `sourceCount / dayCount / raceCount`:
  - `53 / 53 / 3997`
- Latest date:
  - `2026-06-29`
- Latest path:
  - `/data/analytics/kurari-ex/history/daily/2026-06/2026-06-29.generated.json`
- Daily race count:
  - `64`
- Venue count:
  - `7`
- Starters:
  - `464`
- Starters coverage:
  - `complete`
- Missing `registrationNo`:
  - `0`
- Exact rejoin:
  - `64/64R`

## Completed Chain Summary

| stepId | purpose | resultStatus | commit | importantOutput |
| --- | --- | --- | --- | --- |
| 23-21 | Target-date result source audit | 完了 | not listed in recent git log / see git history | 2026-06-29のresult source利用可否を固定 |
| 23-22 | Private raw mapping dry run | 完了 | not listed in recent git log / see git history | private rawからdaily候補へのmappingをdry-run検証 |
| 23-23 | History daily write safety audit | 完了 | not listed in recent git log / see git history | daily書込み前のhash・schema・差分条件を固定 |
| 23-24 | History daily writer/checker | 完了 | not listed in recent git log / see git history | 64Rのdaily writer/checker経路を確立 |
| 23-25 | History index update dry run | 完了 | not listed in recent git log / see git history | target entryとindex集計値の更新候補を検証 |
| 23-26 | History index write safety audit | 完了 | not listed in recent git log / see git history | index書込み前条件と保護範囲を固定 |
| 23-27 | History index writer/checker | 完了 | not listed in recent git log / see git history | dailyを指すindex entryと集計値を検証 |
| 23-28 | Same-date starters bridge dry run | 完了 | not listed in recent git log / see git history | `date + venueName + raceNumber`で64/64R exact join |
| 23-29 | Starters bridge write safety audit | 完了 | not listed in recent git log / see git history | 464 starters、欠損0、非starter差分0を確認 |
| 23-30 | Writer policy guard | 完了 | `67fcd0919 Add KURARI EX history starters bridge writer policy guard` | daily単独更新ではindex bytesがstaleになるため安全停止 |
| 23-31 | Index refresh policy audit | 完了 | `4f8f85cf5 Add KURARI EX history starters bridge index refresh policy audit` | `totalBytes`とtarget-date `bytes`の同時refresh方針を固定 |
| 23-32 | Combined write safety audit | 完了 | `228ce2a78 Add KURARI EX combined history starters bridge write safety audit` | daily/index両candidate hashと変更パスを固定 |
| 23-33 | Combined daily + index writer/checker | 完了 | `6d978916d Add KURARI EX combined history starters bridge writer` | dailyとindexを同時更新し、再実行no-opを確認 |
| 23-34 | Final consistency audit | `FINAL_CONSISTENCY_PASS_2026_06_29` | `da85d57d7 Add KURARI EX final history consistency audit for 2026-06-29` | index、daily、source、entries、64/64R rejoinを最終検証 |
| 23-35 | UI/API consumption smoke audit | `UI_API_CONSUMPTION_SMOKE_PASS_2026_06_29` | `a71b4c3cb Add KURARI EX UI API consumption smoke audit for 2026-06-29` | public path解決、payload shape、464 starters coverageを確認 |

## Safety Guarantees

- Fake completion:
  - none
- Fuzzy matching:
  - none
- `registrationNo` generated:
  - none
- Prediction used as starter source:
  - false
- Result used as starter source:
  - false
- Lineup used as starter source:
  - false
- Entries used as generated starter source:
  - false
- Protected source data modified:
  - false
- `public/data/races` modified:
  - false
- `src` modified:
  - false
- `package.json` modified:
  - false
- Existing scripts modified:
  - false

## Known Notes

- Starters source側には`raceKey` / `venueKey`が保存されていない場合がある。Bridge joinは`date + venueName + raceNumber`の完全一致で実施した。
- Fuzzy venue matchingは使用していない。
- 2026-06-29 dailyとindexは同時更新済み。
- Index更新は`totalBytes`と`items[2026-06-29].bytes`のみ。
- `sourceCount / dayCount / raceCount / latestDate / latestPath`は不変。
- 一部の旧audit/checkerは、古いallowlistまたは旧hash前提により新規scriptをunexpectedとしてfailする場合がある。
- 現状態の正判定はfinal consistency auditとUI/API consumption smoke audit。

## Recommended Next Steps

1. 2026-06-25〜2026-06-28のhistory追加へ横展開する。
2. 各対象日のresult source availability auditを実施する。
3. Private raw mapping dry runを実施する。
4. Daily writer、index writer、starters bridgeは2026-06-29で完成した方式を流用する。
5. Reviews差分は別管理・別commitで扱う。

## Out of Scope

- 2026-06-25〜2026-06-28のhistory追加。
- `public/data/reviews/**` の整理。
- UI画面改修。
- `src`側の実装変更。
- Fake metrics / inferred metricsの追加。
