# KURARI EX RegistrationNo Backfill Readiness Plan: 2026-05-01 to 2026-07-01

## Status

- `REGISTRATION_NO_BACKFILL_READINESS_PLAN_COMPLETED_WITH_WARNINGS`
- Final recommendation: `SOURCE_COLLECTION_FIRST`
- `READY_EXACT`: `0`
- Proposed writable backfill batches: none

## Readiness

| Readiness | Records |
| --- | ---: |
| Ready exact | 0 |
| Needs source collection | 2471 |
| Needs parser fix | 0 |
| Ambiguous review required | 9 |
| Not safely backfillable | 0 |

The 2471 source-collection records span 17 dates. Their exact normalized race/starter
record also lacks a registration number, so parser changes cannot recover the value.

## Ambiguous Candidate

- Name: 山口貴弘
- Candidate registrations: `013615`, `014268`
- Affected records: `9`
- Affected dates:
  - 2026-06-11
  - 2026-06-12
  - 2026-06-13
  - 2026-06-14
  - 2026-06-19
  - 2026-06-20
  - 2026-06-21

Name-only matching is insufficient; these records require source-backed manual review.

## Blocked Batches

| Batch | Records | Risk | Required action |
| --- | ---: | --- | --- |
| Source registration-number collection | 2471 | HIGH | Obtain exact same-date race/car identity source |
| Same-name manual review | 9 | HIGH | Resolve registration using non-name identity evidence |
| MIXED no-starters source collection | 308 races | HIGH | Obtain race-level starters/entries |
| MIXED partial starters review | 6 races | HIGH | Reconcile declared and present starters |

## Required Guards for a Future Write

- Exact date + venue + race number + car number + normalized name match
- Registration number present in the same source record
- Same-name multi-registration candidates excluded
- No fuzzy or cross-date matching
- Daily and index updated atomically with bytes reconciliation
- Existing entries and unrelated source data unchanged

## Next Step

Do not backfill yet. Collect an authoritative same-date starter/entry source first,
then rerun this audit and create a batch only from records promoted to `READY_EXACT`.
