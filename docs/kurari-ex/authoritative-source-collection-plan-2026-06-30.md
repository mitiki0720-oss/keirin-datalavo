# KURARI EX Authoritative Source Collection Plan: 2026-06-30

## Purpose

Collect the authoritative evidence required to decide whether the 2026-06-30 `NO_STARTERS` history may advance to a separate backfill dry-run. This plan does not create a snapshot, modify history, or run the backfill.

## Current state

- Existing history: 76 races, 0 starters, `NO_STARTERS`
- Raw structured entry rows: 551
- Raw registrationNo coverage: 551 / 551
- Trusted rows: 0
- `RAW_ONLY_NEEDS_TRUST_CONFIRMATION`: 551
- Same-date authoritative snapshot: absent
- `canProceedToBackfillDryRun=false`
- `canProceedToBackfillWrite=false`

The existing prediction files are reproducible raw inputs, but neither their registrationNo values nor their file hashes establish authority.

## Required authoritative source

Preferred source:

- official entry snapshot obtained from KEIRIN.JP or an equivalent permitted official feed
- repository shape equivalent to `keirin-jp-entries.generated.json`
- immutable capture for `2026-06-30`
- complete coverage of 76 races and 551 starters

Snapshot-level metadata:

- `schemaVersion`
- `date`
- `sourceName`
- `sourceType`
- `sourceUrl` or stable official source identifier
- `sourceFetchedAt` as an ISO 8601 timestamp with timezone
- `sourceHash` as `sha256:<lowercase hex>`
- `raceCount`
- `starterCount`

Required row fields:

- `date`
- `venueName`
- `raceNumber`
- `carNo`
- `playerName`
- `registrationNo`
- `prefecture`
- `age`
- `term`
- `className`
- `sourceName`
- `sourceType`
- `sourceFetchedAt`
- `sourceHash`

## Collection procedure

1. Fetch the official 2026-06-30 entry data without using prediction, summary, result, or review prose.
2. Preserve the response bytes before transformation.
3. Record the official source identifier and fetch timestamp.
4. Calculate SHA-256 over the preserved bytes.
5. Parse only explicit structured fields.
6. Keep unavailable values as `null`; do not infer them from names or prose.
7. Produce an immutable candidate snapshot in a separate authorized task.
8. Validate snapshot counts and row-level provenance before it is consumed.

## Required comparison

Join the snapshot to the 551 raw rows only by:

- same date
- same venue
- same raceNumber
- same carNo

After the positional join, require normalized `playerName` and exact `registrationNo` agreement.

Acceptance criteria:

- race coverage: 76 / 76
- starter coverage: 551 / 551
- registrationNo agreement: 551 / 551
- duplicate carNo in race: 0
- duplicate registrationNo in race: 0
- missing registrationNo: 0
- known-bad registrationNo: 0
- authoritative conflicts: 0
- same-name unresolved rows: 0
- source hash and row provenance present: 551 / 551

## Decision

If no authoritative snapshot is collected, retain `NO_STARTERS` and keep the backfill blocked.

If the snapshot exists and all 551 rows match:

- set `canProceedToBackfillDryRun=true`
- keep `canProceedToBackfillWrite=false`
- rerun the trust-gated candidate builder
- perform immutable-manifest, write-safety, rollback, and post-write checker audits

Any missing or conflicting row keeps the date blocked. No registrationNo may be generated or repaired by name.
