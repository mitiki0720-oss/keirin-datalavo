# KURARI EX RegistrationNo Missing Deep Audit: 2026-05-01 to 2026-07-01

## Status

- `REGISTRATION_NO_MISSING_DEEP_AUDIT_COMPLETED_WITH_WARNINGS`
- Missing registration numbers: `2480`
- Generated or inferred registration numbers: `0`

## Missing Reason and Readiness

| Classification | Records |
| --- | ---: |
| Source race/starter exists but source also lacks registration number | 2471 |
| Same normalized name maps to multiple registration candidates | 9 |
| Exact source has registration number but history was not backfilled | 0 |
| Parser fix required | 0 |
| Source record not found | 0 |
| `READY_EXACT` | 0 |
| `NEEDS_SOURCE_COLLECTION` | 2471 |
| `AMBIGUOUS_REVIEW_REQUIRED` | 9 |
| `NOT_BACKFILLABLE_SAFELY` | 0 |

All 2480 records were resolved to the same date, venue, race, car number, and player
name in the normalized race source. For 2471 records that exact source still has a
null registration number. The remaining 9 records are ambiguous because name-only
candidates point to multiple registrations.

## By Date

| Date | Missing |
| --- | ---: |
| 2026-05-09 | 28 |
| 2026-05-10 | 32 |
| 2026-05-14 | 8 |
| 2026-06-09 | 235 |
| 2026-06-10 | 300 |
| 2026-06-11 | 208 |
| 2026-06-12 | 103 |
| 2026-06-13 | 10 |
| 2026-06-14 | 2 |
| 2026-06-15 | 149 |
| 2026-06-17 | 243 |
| 2026-06-18 | 153 |
| 2026-06-19 | 132 |
| 2026-06-20 | 127 |
| 2026-06-21 | 158 |
| 2026-06-22 | 232 |
| 2026-06-23 | 213 |
| 2026-06-24 | 147 |

## Top Venues

| Venue key | Missing |
| --- | ---: |
| keiokaku | 227 |
| beppu | 199 |
| matsusaka | 186 |
| utsunomiya | 179 |
| hakodate | 135 |
| maebashi | 124 |
| takeo | 121 |
| shizuoka | 120 |
| gifu | 113 |
| kurume | 111 |
| odawara | 110 |
| matsudo | 97 |
| kokura | 89 |
| iwakitaira | 80 |
| aomori | 78 |

## Important Notes

- `MIXED` dates account for `1571` missing records.
- Fully `STARTERS_PARSED` dates account for `909` missing records.
- A player-name match alone is never classified as `READY_EXACT`.
- No fuzzy match, same-name automatic merge, or registration-number generation was performed.
