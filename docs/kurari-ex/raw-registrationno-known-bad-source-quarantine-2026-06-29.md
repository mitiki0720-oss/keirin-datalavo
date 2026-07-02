# KURARI EX Known-Bad Raw RegistrationNo Quarantine: 2026-06-29

## Purpose

Record and detect the ten 2026-06-29 raw registrationNo values that conflict with the authoritative same-date entry snapshot. Raw files and existing history remain unchanged.

## Known-bad raw rows

| Venue | Race | Car | Player | Raw | Correct |
|---|---:|---:|---|---|---|
| 伊東 | 3R | 4 | 伊藤 翼 | `014376` | `014382` |
| 伊東 | 4R | 5 | 関戸 努 | `013474` | `013454` |
| 伊東 | 7R | 6 | 鈴木 規純 | `013383` | `012938` |
| 高知 | 3R | 6 | 山本 淳 | `014501` | `014385` |
| 高知 | 4R | 3 | 後藤 彰仁 | `014304` | `014245` |
| 高知 | 4R | 6 | 山崎 翼 | `014594` | `014494` |
| 高知 | 5R | 4 | 磯島 康祐 | `014954` | `014981` |
| 高知 | 5R | 5 | 伊藤 世哉 | `013911` | `013864` |
| 取手 | 1R | 5 | 西岡 拓朗 | `014867` | `014617` |
| 取手 | 5R | 5 | 橋本 智昭 | `014694` | `014714` |

## Why raw is not authoritative

The raw rows contain plausible six-digit values, but those values do not match the named starter in the same-date `keirin-jp-entries` snapshot. Format validity cannot establish identity authority.

Existing history matches the snapshot by date, venue, raceNumber, carNo, normalized playerName, and registrationNo for 464 / 464 starters. Its provenance hash also matches the snapshot content hash. Existing history therefore remains authoritative.

## Quarantine behavior

When date, venue, raceNumber, carNo, normalized playerName, and raw registrationNo match one of these records:

- assign `KNOWN_BAD_RAW_REGISTRATIONNO`
- block validation from `PASS_READY_FOR_DAILY_WRITE`
- return `BLOCK_WRITE_TRUST_GATE_REQUIRED` at preflight
- prevent dry-run candidate construction
- preserve the existing authoritative history value
- report raw path, row identity, raw value, and authoritative value

## Prohibitions

- no raw rewrite
- no history daily/index rewrite
- no generated correction
- no name-only registrationNo lookup
- no fuzzy correction
- no same-name merge
- no cross-date or cross-venue replacement

Future validation must detect these rows before any candidate or writer boundary. Removing the quarantine requires new authoritative evidence and a separate audited change.
