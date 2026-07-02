# KURARI EX Player Identity Duplicate / Collision Audit: 2026-05-01 to 2026-07-01

## Status

- `PLAYER_IDENTITY_COLLISION_AUDIT_OK_WITH_WARNINGS`
- Checked history daily files: `58`
- Checked races: `4373`
- Checked starters: `8025`

## Collision Results

| Check | Count | Result |
| --- | ---: | --- |
| Duplicate `carNo` in the same race | 0 | OK |
| Duplicate `registrationNo` in the same race | 0 | OK |
| Duplicate normalized player name in the same race | 0 | OK |
| Same registration number with different normalized names | 0 | OK |
| Same normalized name with multiple registrations | 3 | WARN |
| Cross-date starter mapping | 0 | OK |
| Cross-venue starter mapping | 0 | OK |
| Cross-race starter mapping | 0 | OK |
| Generated identity suspicion | 0 | OK |
| Fake-like registration number | 0 | OK |
| Unknown player name | 0 | OK |
| Missing/unknown registration number | 2480 | WARN |
| Raw-name whitespace variants for one registration | 329 | WARN |

No automatic identity merge or data correction was performed.

## Same-Name / Multiple-Registration Candidates

| Normalized name | Registration numbers | Assessment |
| --- | --- | --- |
| 石井貴子 | `014962`, `015023` | Same-name candidate; do not merge automatically |
| 山中貴雄 | `013264`, `014108` | Same-name candidate; do not merge automatically |
| 山口貴弘 | `013615`, `014268` | Same-name candidate; do not merge automatically |

## Warning Interpretation

- The 329 raw-name variants normalize to the same name and differ primarily by whitespace.
- The 2480 missing registration numbers remain unresolved; no number was generated.
- Same-name candidates are retained separately because their registration numbers differ.
- There are no cases where one registration number maps to multiple normalized names.

## Recent Batch Integrity

- 2026-06-29 starter total: `464`
- 2026-06-29 daily unchanged from `HEAD`: true
- Recent `NO_STARTERS` dates:
  - 2026-06-25
  - 2026-06-27
  - 2026-06-28
  - 2026-06-30
  - 2026-07-01
- Recent `NO_STARTERS` dates created player identity: false

## Conclusion

No player was duplicated within a race, no registration/name contradiction was found,
and no cross-date, cross-venue, generated, or fake identity was detected. The audit is
`OK_WITH_WARNINGS` because unresolved registration numbers and same-name candidates
require source-backed review.
