# 31-04 Review Page 結果まとめコピー

## 目的

Review Pageの「結果まとめをコピー」を、GPTへそのまま貼れるsummary作成用素材として整形する。

## 出力内容

会場・日付・対象Rの共通ヘッダーに続けて、各Rを区切って以下を出力する。

- 結果確定ステータス、最終判定、的中券種、的中組み合わせ
- 投資、払戻、収支、回収率
- 実際の着順、1〜3着、決まり手、S / H / B / SB
- 全着順と各選手の車番、氏名、登録番号、府県、年齢、期、級班、上がり、着差、決まり手
- 2車単、2車複、3連単、3連複、重複を除いたワイド払戻
- WEATHER ACTUALの天候、気温、風速、風向、降水、基準時刻、採用情報
- source名、source取得日時、source種別、official result source
- 最終オッズ参考と結果メモ

登録番号やsource情報がない場合は「未取得」、source種別がない場合は`unknown`として扱い、推測補完しない。

## 除外内容

`KURARI_EX_RESULT_OUTPUT_V1`のJSON全文、生JSON、空配列、空オブジェクト、null中心の内部管理フィールドは結果まとめコピーへ出力しない。結果情報の表示に必要な未取得登録番号は削除せず、「登録番号 未取得」と表示する。

## 変更対象外

- Prediction Pageの単独R・まとめGPT素材は変更していない。
- Races Page / 本日のレースページ、EXページは変更していない。
- `public/data/reviews/**`、`public/data/analytics/**`、`public/data/races/**`、`public/data/venues/**`は変更していない。
- fakeデータ・fake補完は行わない。

## 31-05 Review Workbench

Review Page右側の`REVIEW CALENDAR / レビュー日付を選ぶ`と月移動・日付選択ボタンを廃止し、`REVIEW WORKBENCH / 今日の結果整理`へ置き換えた。Review Pageは過去日付を画面で選択する運用を行わず、当日の結果整理とsummary作成用素材の確認に集中する。

Workbenchでは対象日、読込モード、読込件数、対象会場数、結果あり件数、summaryあり件数、未取得件数を表示する。結果まとめコピーが払戻・全着順・上がり・着差・決まり手・天気・source情報を保持することと、予想差分確認・summary作成に使うことも明示する。

`FILE ARCHIVE`、`INDEX JSON + TXT + SUMMARY`、reviews indexとTXT/SUMMARYの読込処理は維持する。`public/data/reviews/**`は削除・変更・退避禁止の保護対象であり、過去レビュー日付フォルダも削除しない。fake補完は禁止し、source不明値は`unknown`または「未取得」のまま扱う。
