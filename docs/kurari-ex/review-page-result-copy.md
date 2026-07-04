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
