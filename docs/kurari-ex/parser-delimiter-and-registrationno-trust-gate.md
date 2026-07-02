# KURARI EX Parser Delimiter and RegistrationNo Trust Gate

## Purpose

Structured entry rows must be parsed without delimiter-dependent identity corruption, and raw registrationNo must not authorize a history write without authoritative evidence. This gate runs before writer preflight and the dry-run candidate builder. It does not write public data.

## Parser delimiter fix

The shared parser now normalizes and splits starter source rows through:

- `normalizeSourceDelimiterLine(line)`
- `splitStarterSourceRow(line)`

Supported delimiters:

- `／`
- `/`
- `｜`
- `|`

The parsed fields are evaluated independently as date, venue, raceNumber, carNo, playerName, and registrationNo. A registrationNo marker cannot be consumed as part of the playerName column. Broken names or malformed contract rows produce `STOP_CONTRACT_VIOLATION` or a parse warning; they are never repaired by generated values.

## Why this was needed

On 2026-06-29, 49 Sasebo rows used `｜`. The previous comparison split only slash variants and therefore compared `氏名｜府県｜年齢...` as a name. These were identity comparison false positives, not registrationNo mismatches.

After the shared delimiter fix:

- parsed rows: 464
- broken name columns: 0
- row shifts: 0
- race join shifts: 0
- unresolved delimiter false positives: 0
- resolved prior delimiter false positives: 49

## Raw registrationNo trust gate

`registrationNoTrustStatus` is one of:

- `TRUSTED_AUTHORITATIVE_SNAPSHOT_MATCH`
- `TRUSTED_PROVENANCE_HASH_MATCH`
- `TRUSTED_EXISTING_HISTORY_MATCH`
- `RAW_ONLY_NEEDS_TRUST_CONFIRMATION`
- `KNOWN_BAD_RAW_REGISTRATIONNO`
- `CONFLICT_WITH_AUTHORITATIVE_HISTORY`
- `TRUST_BLOCKED_UNKNOWN`

Raw registrationNo alone is not authoritative. Presence and format completeness are necessary but not sufficient for EXACT handling.

## Exact write allowed conditions

Every starter row must contain date, venueName or venueKey, raceNumber, carNo, playerName, and registrationNo. Each row must then match at least one trusted authority:

- same-date authoritative snapshot
- matching provenance path and content hash
- existing authoritative history
- an explicitly trusted source marker

The race must also have zero duplicate carNo and registrationNo values. Fake, fuzzy, generated, name-only, cross-date, cross-venue, and same-name merged identities are prohibited.

## Write blocked conditions

EXACT write is blocked when any row is:

- raw-only
- known-bad
- conflicting with authoritative history or snapshot
- missing authoritative provenance
- malformed or unresolved
- duplicated within a race

Preflight returns `BLOCK_WRITE_TRUST_GATE_REQUIRED` for complete-looking raw rows that lack trust. Partial and manual-review decisions remain blocked under their existing human-confirmation rules.

## Source prohibitions

- no fake identity
- no fuzzy matching
- no generated name, carNo, starter, or registrationNo
- no same-name automatic merge
- no prediction prose as a starter authority
- no result or review starter source

The prediction entry table is only inspected as untrusted input. It cannot independently authorize a public history write.
