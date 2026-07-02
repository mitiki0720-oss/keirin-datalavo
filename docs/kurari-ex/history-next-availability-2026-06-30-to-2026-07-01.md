# KURARI EX Next History Availability: 2026-06-30 to 2026-07-01

## Audit Baseline

- Audit script:
  - `scripts/audit-kurari-ex-history-availability-next-batch-2026-06-30-to-2026-07-01.mjs`
- Checked dates:
  - `2026-06-30`
  - `2026-07-01`
- Index hash before audit:
  - `sha256:d04711a5f5fda9a0082b2cf962138394a3c23aaa02c899393a04ea6a2258e180`
- Index bytes:
  - `13603`
- Latest date:
  - `2026-06-29`

## Availability Summary

- 2026-06-30:
  - Result: `READY_WITH_PRIVATE_RAW_SOURCE`
  - Prediction: `READY`
  - Review: `READY`
  - Starters: `MISSING`
  - Entries: `MISSING`
  - Exact mapping risk: `LOW`
  - Measured result races: `76`
  - Prediction linked: `76`
  - Review linked: `76`
  - Recommended action: `READY_FOR_NO_STARTERS_HISTORY_BATCH`
- 2026-07-01:
  - Result: `READY_WITH_PRIVATE_RAW_SOURCE`
  - Prediction: `READY`
  - Review: `READY`
  - Starters: `MISSING`
  - Entries: `MISSING`
  - Exact mapping risk: `LOW`
  - Measured result races: `83`
  - Prediction linked: `83`
  - Review linked: `83`
  - Recommended action: `READY_FOR_NO_STARTERS_HISTORY_BATCH`

## Recommended Order

1. `2026-06-30`
2. `2026-07-01`

No date requires source collection or a starters bridge at this time. Race counts and
link coverage are recorded from parser output by the audit script; no values are inferred.

## Policy

- No history daily or index write was performed.
- Fake completion, fuzzy matching, and generated identity are prohibited.
- Existing reviews working-tree differences were read only and remain outside this change.
