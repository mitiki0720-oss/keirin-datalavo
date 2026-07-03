# Prediction Page GPT Material RegistrationNo Material Enrichment

## Purpose

The first `【出走表】` block in prediction-page GPT material may enrich a
missing registrationNo from structured data already rendered later in the same
material.

Eligible material sections:

- `【D. 登録選手特徴メモ】`
- `【PLAYER EX / 選手別EXACT】`
- `【実戦根拠選手の詳細】`

The rendered prose is not parsed to create identity data. Candidates are built
from the structured player-card and KURARI EX objects that produced those
sections, and only when their registrationNo is actually present in the
rendered section.

## Output

```text
車番 / 選手名 / 登録番号 / 登録番号source / 登録番号status / 府県 / 年齢 / 期 / 級班
1 / 選手名 / 012345 / material-registered-player-card / safe-material-match / 徳島 / 30 / 100 / S1
```

Sources:

- `entry`
- `kurari-ex-rider-exact`
- `kurari-ex-rider-identity`
- `material-registered-player-card`
- `material-player-exact-detail`
- `none`

Trust statuses:

- `explicit-entry-registration`
- `safe-identity-match`
- `safe-material-match`
- `unavailable`
- `ambiguous-blocked`
- `conflict-blocked`

## Resolution priority

1. Explicit entry registrationNo
2. Existing safe KURARI EX rider identity/rider exact candidate
3. Same-material registered-player card or player EXACT detail
4. `null`

If several eligible sections contain the same registrationNo, it remains one
distinct candidate value. Different registrationNo values for the same exact
player name are blocked as ambiguous.

## Material safety gate

A material candidate is accepted only when:

- carNo matches exactly
- playerName matches exactly after existing NFKC/spacing canonicalization
- prefecture does not conflict
- term does not conflict
- className does not conflict
- exactly one distinct registrationNo remains
- candidate is not ambiguous
- candidate is not a same-name candidate
- candidate was not fuzzy matched

Prefecture normalization removes whitespace and one trailing administrative
suffix (`都`, `道`, `府`, or `県`). No other prefecture alias conversion is
performed. Missing optional demographic evidence is not invented; a value is
used only to detect a conflict when both sides provide it.

Registered player-card candidates come only from an already unique or
registration-number-linked player context. Player EXACT candidates come only
from entries selected by the existing duplicate-name-blocking EXACT matcher.

## Prohibitions

- no name-only registrationNo completion
- no fuzzy matching
- no same-name automatic merge
- no registrationNo generation
- no parsing prose into riders
- no public data, history, review, or private-input writes

