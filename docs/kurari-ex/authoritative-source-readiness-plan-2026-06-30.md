# KURARI EX Authoritative Source Readiness Plan: 2026-06-30

## Current decision

2026-06-30 remains blocked:

`BLOCKED_RAW_ONLY_NEEDS_TRUST_CONFIRMATION`

The raw entry tables contain 76 races and 551 registrationNo-bearing rows, but all 551 rows lack authoritative same-date snapshot or provenance confirmation.

## Required authoritative evidence

Before another backfill dry-run is allowed, obtain a read-only, immutable 2026-06-30 entry snapshot with:

- date
- venueName or venueKey
- raceNumber
- carNo
- playerName
- registrationNo
- authoritative source marker
- source path
- content hash

The snapshot must cover all 76 races and 551 starters.

## Required comparison

Join only on the same:

- date
- venue
- raceNumber
- carNo

Then require normalized playerName and registrationNo equality for 551 / 551 rows. The comparison must also prove:

- duplicate carNo: 0
- duplicate registrationNo: 0
- known-bad raw registrationNo: 0
- authoritative conflicts: 0
- unresolved same-name candidates: 0
- malformed rows: 0

Raw file hashes may be retained for reproducibility, but they cannot replace an authoritative snapshot hash.

## Decision after evidence is available

If an authoritative snapshot exists and all 551 rows match:

- set `canProceedToBackfillDryRun=true`
- keep `canProceedToBackfillWrite=false`
- rerun the trust-gated candidate builder in a separate task
- perform a new immutable-manifest and write-safety audit

If any row is missing or conflicting:

- retain `BLOCKED_RAW_ONLY_NEEDS_TRUST_CONFIRMATION`
- quarantine the conflicting row
- do not generate or infer a correction

## Prohibitions

- no raw rewrite
- no history daily/index rewrite
- no source/public data rewrite
- no name-only registrationNo completion
- no fuzzy matching
- no same-name automatic merge
- no cross-date or cross-venue join
- no 2026-06-30 backfill in this audit

## Next recommended task

Acquire or reconstruct an authoritative 2026-06-30 entry snapshot from a permitted official source, record its provenance and content hash, then rerun this readiness audit. Snapshot creation and any later writer execution must remain separate reviewed tasks.
