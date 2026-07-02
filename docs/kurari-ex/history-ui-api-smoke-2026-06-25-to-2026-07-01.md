# KURARI EX UI/API Smoke: 2026-06-25 to 2026-07-01

## Status

- `UI_API_SMOKE_RANGE_PASS_WITH_WARNINGS`
- Index fetch simulation: `OK`
- Daily fetch simulation: `OK`
- Consumer shape compatibility: `OK_WITH_WARNINGS`
- Mixed `NO_STARTERS` / parsed-starters handling: safe

## Checked Dates

- 2026-06-25
- 2026-06-27
- 2026-06-28
- 2026-06-29
- 2026-06-30
- 2026-07-01

All index and daily public paths resolve locally, are readable, and parse as JSON.
Result and prediction display fields are available for every checked race. Empty
starter arrays on `NO_STARTERS` dates are explicit and safe; 2026-06-29 retains
464 parsed starters.

## Warnings

- No direct history-index runtime consumer was found in the inspected `src` files.
- No direct history-daily runtime consumer was found; local fetch simulation was used.
- 2026-06-29 has no `reviewEnrichment` field. Its result, prediction, and starter display remain available.

No source file or data file was modified by this smoke check.
