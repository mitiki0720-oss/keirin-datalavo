# Prediction Page GPT Material EX Source Contract

## Purpose

Add a KURARI EX source contract block to the existing prediction-page「GPT貼り付け用素材」without changing the surrounding prediction UI or removing existing material sections.

## Output

The block is placed before the existing `[A. レース基本情報]` section:

```text
【EX source contract】
date: 2026-07-03
venue: 会場名
raceNumber: 1
sourceName: source marker or unknown
sourceFetchedAt: ISO/既存時刻 or unknown
sourceType: official | user-entered-from-official | unknown

【出走表】
車番 / 選手名 / 登録番号 / 府県 / 年齢 / 期 / 級班
1 / 選手名 / 012345 / 東京 / 40 / 90 / A1
```

## Field sources

- `date`: selected prediction feed date
- `venue`: selected venue value
- `raceNumber`: selected race number
- `carNo`: rider `carNo`
- `playerName`: rider `fullName`, then explicit rider `name`
- `registrationNo`: explicit `registrationNo`, `registrationNumber`, or `registrationId` only
- `prefecture`: rider `prefecture`
- `age`: rider `age`
- `term`: rider `term`
- `className`: rider `className`, then rider `grade`
- `sourceName`: explicit race/feed source marker
- `sourceFetchedAt`: explicit source update time, then feed generation time
- `sourceType`: validated explicit value or conservative source classification

Player-card name matching and KURARI EX name indexes are not used to populate this block.

## Missing values

Missing starter fields are rendered as `null`. Missing sourceName and sourceFetchedAt are rendered as `unknown`.

No values are padded, generated, inferred from prose, or copied from another same-name player.

## Source type

Allowed values:

- `official`
- `user-entered-from-official`
- `unknown`

An explicit KEIRIN.JP/JKA/official marker may be classified as `official`. A source such as KDreams without an explicit authoritative designation remains `unknown`.

## Safety rules

- no registrationNo generation
- no playerName or carNo generation
- no prefecture/age/term/className inference
- no name-only registrationNo completion
- no same-name automatic merge
- no fuzzy matching
- no public data, review, or history writes
