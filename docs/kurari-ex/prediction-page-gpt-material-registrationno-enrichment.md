# Prediction Page GPT Material RegistrationNo Enrichment

## Purpose

Safely enrich the prediction-page GPT material registrationNo when the displayed entry does not contain one. This feature does not generate identity data and does not write public data.

## Output columns

```text
車番 / 選手名 / 登録番号 / 登録番号source / 登録番号status / 府県 / 年齢 / 期 / 級班
```

`registrationNoSource` values:

- `entry`
- `kurari-ex-rider-exact`
- `kurari-ex-rider-identity`
- `none`

`registrationNoTrustStatus` values:

- `explicit-entry-registration`
- `safe-identity-match`
- `unavailable`
- `ambiguous-blocked`
- `conflict-blocked`

## Resolution priority

1. Explicit entry fields:
   - `entry.registrationNo`
   - `entry.registration`
   - `entry.registrationNumber`
   - `entry.registrationId`
2. Safe KURARI EX identity/rider exact match
3. `null`

Entry registrationNo is always reported with source `entry` and status `explicit-entry-registration`.

## Safe identity match

An enrichment candidate is accepted only when:

- normalized playerName matches exactly
- prefecture matches exactly
- term matches exactly
- className does not conflict
- exactly one distinct candidate registrationNo exists
- candidate source is `kurari-ex-rider-exact` or `kurari-ex-rider-identity`
- candidate is not flagged same-name or ambiguous
- candidate was not fuzzy matched

The current authoritative identity candidates are loaded from the KURARI EX starter source index. Only source files with `PASS`, matching snapshot hash, no fake completion, no fuzzy matching, and no result/prediction lineup starter generation are consumed.

The rider exact index is also available as a candidate source. Because its current index does not include term, it cannot independently satisfy the safe match contract.

## Block behavior

- Multiple registrationNo values for the same exact name:
  `ambiguous-blocked`
- Same-name or explicitly ambiguous candidate:
  `ambiguous-blocked`
- Prefecture, term, or class conflict:
  `conflict-blocked`
- Missing candidate evidence or required attributes:
  `unavailable`

All blocked/unavailable results keep registrationNo as `null` and source as `none`.

## Prohibitions

- no name-only registrationNo completion
- no same-name automatic merge
- no fuzzy matching
- no registrationNo generation or padding
- no playerName/carNo/demographic generation
- no public history, race, or review writes
