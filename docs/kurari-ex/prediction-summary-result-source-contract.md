# KURARI EX Prediction / Summary / Result Structured Source Contract

## Purpose

Define a machine-readable block, separate from prose, for future prediction and summary documents. Only values explicitly present in this block may enter validation. Prose remains display content and is never a starter source.

## Block marker

Each prediction or summary document may contain one fenced JSON block preceded by:

```text
KURARI_EX_STRUCTURED_SOURCE_V1
```

The block must conform to `kurari-ex.structured-source.v1`.

## Document contract

```json
{
  "schemaVersion": "kurari-ex.structured-source.v1",
  "documentType": "prediction",
  "date": "2026-06-30",
  "venueName": "取手",
  "sourceName": "official-entry-feed",
  "sourceType": "official-entries-snapshot",
  "sourceFetchedAt": "2026-06-30T00:00:00+09:00",
  "sourceHash": "sha256:<lowercase-hex>",
  "races": []
}
```

`documentType` is `prediction` or `summary`. A result/review output uses the separate result output contract.

## Race and starter contract

```json
{
  "date": "2026-06-30",
  "venueName": "取手",
  "raceNumber": 1,
  "starters": [
    {
      "date": "2026-06-30",
      "venueName": "取手",
      "raceNumber": 1,
      "carNo": 1,
      "playerName": "選手名",
      "registrationNo": "012345",
      "prefecture": "東京",
      "age": 40,
      "term": "90",
      "className": "A1",
      "sourceName": "official-entry-feed",
      "sourceType": "official-entries-snapshot",
      "sourceFetchedAt": "2026-06-30T00:00:00+09:00",
      "sourceHash": "sha256:<lowercase-hex>"
    }
  ]
}
```

Required starter fields:

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

## Null and validation rules

- Missing registrationNo is `null`.
- Missing prefecture, age, term, or className is `null`.
- Empty strings do not replace `null`.
- `carNo` and `raceNumber` are integers.
- `sourceFetchedAt` is ISO 8601 with timezone.
- `sourceHash` uses SHA-256 and identifies the preserved source bytes.
- Row-level source metadata must agree with the enclosing document metadata.
- Duplicate carNo or registrationNo within a race blocks the contract.

## Trust rules

The presence of this block does not itself make the source authoritative.

Permitted trust states require:

- authoritative snapshot match
- matching trusted provenance/hash
- existing authoritative history match
- explicitly approved trusted source marker

Raw prediction or summary data without one of these remains `RAW_ONLY_NEEDS_TRUST_CONFIRMATION`.

## Prohibitions

- Do not infer registrationNo from prose.
- Do not generate name, carNo, starter, or registrationNo.
- Do not merge same-name players without registrationNo evidence.
- Do not use prediction, summary, result, or review prose as a starter source.
- Do not join across dates or venues.
