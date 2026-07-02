# KURARI EX Authoritative Source Readiness Audit: 2026-06-30

## Purpose

Determine whether the 76 races and 551 starter rows for 2026-06-30 are supported by an authoritative same-date snapshot, provenance, and content hash. This audit is read-only and does not perform the history backfill.

## Audit status

- Final status: `AUTHORITATIVE_SOURCE_READINESS_AUDIT_COMPLETED_WITH_WARNINGS`
- Conclusion: `BLOCKED_RAW_ONLY_NEEDS_TRUST_CONFIRMATION`
- `writePerformed=false`

## Existing history

- Mode: `NO_STARTERS`
- Expected races: 76
- Existing races: 76
- Existing starters: 0
- History daily remains unchanged.

## Raw source contract

- Selected structured entry files: 8
- Raw starter rows: 551
- Rows with registrationNo: 551 / 551
- Raw source aggregate hash:
  `sha256:46010feb509b0186dbfa9b2d51a44ea967f46cd20a117b1f0e6d561292301e57`
- Duplicate carNo in race: 0
- Duplicate registrationNo in race: 0
- Known-bad raw registrationNo: 0
- Conflict with authoritative source: 0
- Same-name manual review: 0

The aggregate hash identifies the inspected raw files but does not make them authoritative.

## Authoritative evidence

- Expected snapshot:
  `public/data/races/entries-history/2026-06-30/keirin-jp-entries.generated.json`
- Authoritative snapshot exists: false
- Authoritative snapshot hash matched: false
- Provenance hash matched: false
- Trusted rows: 0
- `RAW_ONLY_NEEDS_TRUST_CONFIRMATION`: 551
- Untrusted rows: 551

No same-date authoritative snapshot or equivalent trusted provenance exists in the repository. Therefore there is no authoritative source against which the 551 names and registrationNo values can be confirmed.

## Readiness decision

- `canProceedToBackfillDryRun=false`
- `canProceedToBackfillWrite=false`
- Validation: `STOP_REGISTRATIONNO_TRUST_GATE`
- Preflight: `BLOCK_WRITE_TRUST_GATE_REQUIRED`

Structural completeness is not authority. The 551/551 registrationNo coverage cannot authorize candidate construction or a write while every row remains raw-only.

## Safety result

- No fake or fuzzy matching
- No generated name, carNo, starter, or registrationNo
- No name-only identity completion
- No same-name automatic merge
- No prediction/result/review prose used as a starter authority
- No public history change
- No 2026-06-30 backfill
