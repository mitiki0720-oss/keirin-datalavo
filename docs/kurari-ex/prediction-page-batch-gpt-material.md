# 31-01 Prediction Page まとめGPT素材

## 目的

Prediction Pageを予想専用の「Prediction Cockpit」として整理し、単独Rに加えて複数RのGPT貼り付け用素材を一括生成・コピーできるようにする。

結果・収支確認はReview PageとRaces Page / 本日のレースページへ集約し、Prediction Pageには予想ワークスペース、素材生成、予想保存、的中通知ログを残す。

## まとめGPT素材

`PREDICTION BATCH MATERIAL / まとめGPT貼り付け用素材` カードを、単独R GPT素材の後へ追加した。

カードには以下を表示する。

- 対象会場
- 日付
- 時間帯
- 対象範囲とR数
- 範囲プリセット
- まとめ素材プレビュー
- まとめてコピーボタン

各Rは既存の単独R素材ビルダーを再利用し、source contract、会場・選手・天気・オッズ、KURARI EX、月次振り返りを含む形で区切って出力する。不明な登録番号などはsource contractを優先し、fake補完しない。

## 範囲ルール

- `1R〜7R`
- `1R〜6R`
- `7R〜最終R`

最終Rは、選択会場・日付のレース一覧にある最大raceNoから自動判定する。

- モーニング / ミッドナイト: `1R〜7R` を推奨
- デイ / ナイター: `1R〜6R` と `7R〜最終R` を推奨

カスタム範囲は31-01では追加しない。

## 月次可変点数ルール

まとめ素材の先頭に共通依頼文と共通ルールを1回出力する。

- 月次振り返り: 反映済み / 可変点数ルール v2026-07
- 1点100円固定
- 標準14点
- 10〜18点可変
- 2車単は原則2点固定
- 追加点は3連単の3着保護・中穴枠へ使用
- 点数を増やす理由を買目設計メモへ記録
- fakeデータ、fake補完、根拠なし高配当寄せは禁止

各R素材には `ticketMode / recommendedPoints / investmentYen / reasonTags` を含む月次guidanceが入る。

## Prediction Pageから外した結果UI

- 上部の `TODAY RESULTS / HIT RATE / ROI / PROFIT` KPIカード
- `RESULT & BALANCE / 実戦結果・収支確認パネル`
- 実着順編集
- 判定上書き
- 投資・払戻・収支・回収率カード
- 結果メモ編集と結果保存UI
- 保存済み結果サマリー

共有の結果型・保存関数は、Review PageやRaces Pageへの影響を避けるため維持する。

## 維持する機能

- 単独R GPT貼り付け用素材
- まとめGPT貼り付け用素材
- レース選択
- GPT予想貼り付け・保存
- KURARI EX反映ステータス
- 月次振り返り反映ステータス
- 素材生成ステータス
- 的中通知ログ
- 当日予想JSON出力

的中通知ログはPrediction Page下部へ移動し、コンパクトなログ表示として残す。

## 結果確認ページ

- Review Pageは結果・収支確認用として維持する。
- Races Page / 本日のレースページの結果表示は維持する。
- 31-01では両ページを変更しない。

## 変更対象外

- `public/data/reviews/**` は変更していない。
- `public/data/analytics/**` は変更していない。
- `public/data/races/**` は変更していない。
- `public/data/venues/**` は変更していない。
- private-inputは変更していない。
- fakeデータ・fake補完は禁止する。
