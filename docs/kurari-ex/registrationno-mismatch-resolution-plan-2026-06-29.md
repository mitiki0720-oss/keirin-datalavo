# KURARI EX RegistrationNo Mismatch Resolution Plan: 2026-06-29

## Current finding

The original 59 identity mismatches consist of:

- 49 parser/comparison false positives caused by unsupported `｜` delimiters
- 10 actual raw registrationNo errors

There is no row shift, race join shift, same-name automatic merge, cross-date join, or cross-venue join.

## Why existing history remains authoritative

The existing history has 464 starters. All 464 match the same-date `keirin-jp-entries` snapshot by venue, raceNumber, carNo, normalized name, and registrationNo. Every history starter also points to that snapshot path and its matching content hash.

The raw prediction entry tables do not have equivalent authority. Ten rows contain registrationNo values assigned to identities other than the named starter. Existing history therefore remains unchanged.

## Ten known-bad raw rows

| Race key | Car | Player | Raw | Authoritative |
|---|---:|---|---|---|
| `2026-06-29:ito:3` | 4 | 伊藤 翼 | `014376` | `014382` |
| `2026-06-29:ito:4` | 5 | 関戸 努 | `013474` | `013454` |
| `2026-06-29:ito:7` | 6 | 鈴木 規純 | `013383` | `012938` |
| `2026-06-29:kochi:3` | 6 | 山本 淳 | `014501` | `014385` |
| `2026-06-29:kochi:4` | 3 | 後藤 彰仁 | `014304` | `014245` |
| `2026-06-29:kochi:4` | 6 | 山崎 翼 | `014594` | `014494` |
| `2026-06-29:kochi:5` | 4 | 磯島 康祐 | `014954` | `014981` |
| `2026-06-29:kochi:5` | 5 | 伊藤 世哉 | `013911` | `013864` |
| `2026-06-29:toride:1` | 5 | 西岡 拓朗 | `014867` | `014617` |
| `2026-06-29:toride:5` | 5 | 橋本 智昭 | `014694` | `014714` |

## Parser delimiter fix

Entry fields must accept slash and vertical-line variants:

```js
rowBody.split(/[／/｜|]/u)
```

The fix must be applied consistently to validation, preflight, and candidate comparison parsing. Tests must include both slash-delimited and `｜`-delimited entry tables. The registrationNo extractor must remain restricted to the explicit `登録番号` marker.

## Raw registrationNo trust gate

Raw registrationNo alone is not authoritative and must not authorize a write.

Before a registrationNo-bearing candidate can proceed:

1. Join only by the same date, venue, raceNumber, and carNo.
2. Require an authoritative same-date entry snapshot.
3. Require normalized player name and registrationNo agreement with that snapshot.
4. Require the snapshot path and content hash to be recorded in provenance.
5. Block on missing, mismatched, duplicate, malformed, or unproven registrationNo.
6. Never repair a mismatch using name-only lookup, fuzzy matching, generated identity, cross-date data, or cross-venue data.

## Quarantine and known-bad source handling

- Treat the ten listed raw rows as `KNOWN_BAD_RAW_REGISTRATIONNO`.
- Do not copy their raw registrationNo into a candidate.
- Do not silently replace the raw files during this task.
- Preserve the mismatch record with raw path, line number, raw value, authoritative value, and snapshot hash.
- A future writer must stop if one of these rows reaches the write boundary without authoritative reconciliation.

## 2026-06-30 backfill decision

`BLOCKED`

The 2026-06-30 backfill remains blocked until both conditions are implemented and independently checked:

- parser delimiter fix `[／/｜|]`
- raw registrationNo trust gate with authoritative snapshot/provenance/hash comparison

Passing row counts or registrationNo completeness alone is insufficient to permit the backfill.

## Write prohibition

Do not run a 2026-06-29 refresh or 2026-06-30 backfill while this plan is unresolved. Do not change history daily/index, raw, source, races, reviews, src, UI, or package configuration as part of the cause audit.

## Next recommended task

`26-08 parser delimiter fix + raw registrationNo trust gate`

That task should change parser/gate code only after defining fixtures and post-change checks. A later write-safety audit must pass before any history write is considered.
