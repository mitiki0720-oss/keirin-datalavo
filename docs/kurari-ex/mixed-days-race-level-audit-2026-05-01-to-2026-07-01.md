# KURARI EX MIXED Days Race-Level Audit: 2026-05-01 to 2026-07-01

## Status

- `MIXED_DAYS_RACE_LEVEL_AUDIT_COMPLETED_WITH_WARNINGS`
- Mixed dates: `14`
- Mixed-date races: `1054`
- Fully parsed starter races: `740`
- No-starter races: `308`
- Partial-starter races: `6`
- Missing registration numbers in mixed dates: `1571`

## Per-Date Breakdown

| Date | Races | Parsed | No starters | Partial | Missing regNo |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2026-05-09 | 83 | 10 | 73 | 0 | 28 |
| 2026-05-10 | 67 | 12 | 55 | 0 | 32 |
| 2026-05-14 | 56 | 2 | 54 | 0 | 8 |
| 2026-06-09 | 81 | 65 | 16 | 0 | 235 |
| 2026-06-12 | 71 | 62 | 9 | 0 | 103 |
| 2026-06-13 | 72 | 61 | 11 | 0 | 10 |
| 2026-06-14 | 90 | 76 | 11 | 3 | 2 |
| 2026-06-15 | 78 | 65 | 11 | 2 | 149 |
| 2026-06-18 | 71 | 62 | 9 | 0 | 153 |
| 2026-06-19 | 79 | 70 | 9 | 0 | 132 |
| 2026-06-20 | 72 | 63 | 9 | 0 | 127 |
| 2026-06-22 | 72 | 61 | 11 | 0 | 232 |
| 2026-06-23 | 90 | 71 | 18 | 1 | 213 |
| 2026-06-24 | 72 | 60 | 12 | 0 | 147 |

## Reason and Action

| Reason / action | Races |
| --- | ---: |
| Some races have starters and some do not | 308 |
| Registration number missing only | 483 |
| Parsed race requiring no identity action | 257 |
| Partial starters in race | 6 |
| Needs starters source collection | 308 |
| Needs race-level review | 489 |
| No action required | 257 |
| Ready for exact registration-number backfill | 0 |

## Partial Starter Races

- `2026-06-14:gifu:1` — declared 9, present 6
- `2026-06-14:gifu:2` — declared 9, present 7
- `2026-06-14:gifu:3` — declared 9, present 7
- `2026-06-15:odawara:1` — declared 7, present 6
- `2026-06-15:odawara:2` — declared 7, present 6
- `2026-06-23:odawara:6` — declared 7, present 6

## Next Action

Collect same-date race-level starters/entries sources for the 308 no-starter races.
Review the six partial races before any write. Registration-number gaps must follow the
separate source-backed readiness plan.
