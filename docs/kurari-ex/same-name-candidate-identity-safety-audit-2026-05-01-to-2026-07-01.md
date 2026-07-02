# KURARI EX Same-Name Candidate Identity Safety Audit: 2026-05-01 to 2026-07-01

## Status

- `SAME_NAME_CANDIDATE_IDENTITY_SAFETY_PASS_WITH_MANUAL_REVIEW`
- Candidate names checked: `3`
- Candidate registration numbers checked: `6`
- Records with registration number: `12`
- Records without registration number: `9`
- Automatic merges: `0`
- Suspected wrong merges: `0`
- Same-race conflicts: `0`
- Manual-review candidates: `1` name / `9` records

## Candidate Summary

| Normalized name | Candidate registration numbers | Registered records | Unassigned records | Action |
| --- | --- | ---: | ---: | --- |
| 石井貴子 | `014962`, `015023` | 5 | 0 | `SAFE_KEEP_SEPARATED` |
| 山中貴雄 | `013264`, `014108` | 5 | 0 | `SAFE_KEEP_SEPARATED` |
| 山口貴弘 | `013615`, `014268` | 2 | 9 | `MANUAL_REVIEW_REQUIRED` |

### 石井貴子

- `014962`: 1 record
- `015023`: 4 records
- Dates: 2026-06-10, 2026-06-11, 2026-06-12, 2026-06-24, 2026-06-29
- Venues: keiokaku, tamano, yahiko
- No unassigned record exists.
- Existing registrations remain separated and do not conflict within a race.

### 山中貴雄

- `013264`: 4 records
- `014108`: 1 record
- Dates: 2026-06-15, 2026-06-17, 2026-06-18, 2026-06-29
- Venues: beppu, kochi, toyama
- No unassigned record exists.
- Existing registrations remain separated and do not conflict within a race.

### 山口貴弘

- `013615`: 1 registered record
- `014268`: 1 registered record
- Unassigned records: 9
- Registered-date observation: 2026-06-29
- Unassigned race keys:
  - `2026-06-11:gifu:11`
  - `2026-06-12:gifu:10`
  - `2026-06-13:gifu:8`
  - `2026-06-13:yahiko:4`
  - `2026-06-14:gifu:6`
  - `2026-06-14:yahiko:5`
  - `2026-06-19:hiratsuka:11`
  - `2026-06-20:hiratsuka:11`
  - `2026-06-21:hiratsuka:9`

The nine unassigned records remain null. Their same-date race sources do not contain a
registration number, and the normalized name points to two candidates. Assigning either
number from the name alone would be unsafe.

## Conclusion

- Registration-bearing records remain assigned to their original candidate number.
- Registration-missing records were not assigned to either same-name candidate.
- No same-name candidate was automatically merged.
- No same-race or same-date/venue/race conflict was detected.
- The EX page can continue to display unassigned records using the player name while
  retaining a null registration number.
- The nine 山口貴弘 records require authoritative source collection and manual review.
