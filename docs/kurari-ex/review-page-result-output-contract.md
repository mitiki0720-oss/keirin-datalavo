# KURARI EX Review Page / Result Output Contract

## Purpose

Define the structured result block that future result and review pages can emit independently from prose. The block preserves official result provenance and links the related prediction, summary, and review artifacts.

## Block marker

```text
KURARI_EX_RESULT_OUTPUT_V1
```

The following fenced JSON block must conform to `kurari-ex.result-output.v1`.

## Result contract

```json
{
  "schemaVersion": "kurari-ex.result-output.v1",
  "date": "2026-06-30",
  "venueName": "取手",
  "raceNumber": 1,
  "raceStatus": "finished",
  "finishOrder": [
    {
      "rank": 1,
      "carNo": 3,
      "playerName": "選手名",
      "registrationNo": null
    }
  ],
  "payout": {
    "twoExact": [],
    "twoQuinella": [],
    "threeExact": [],
    "threeQuinella": [],
    "wide": []
  },
  "officialResultSource": {
    "sourceName": "official-result-feed",
    "sourceType": "official-race-result",
    "sourceUrl": "https://official.example/result",
    "sourceIdentifier": "stable-result-id"
  },
  "sourceFetchedAt": "2026-06-30T12:00:00+09:00",
  "sourceHash": "sha256:<lowercase-hex>",
  "linkedPredictionFile": "private-input/kurari-ex/raw/2026-06-30/venue-prediction.txt",
  "linkedSummaryFile": "private-input/kurari-ex/raw/2026-06-30/venue-summary.txt",
  "linkedReviewFile": null
}
```

Required top-level fields:

- `date`
- `venueName`
- `raceNumber`
- `raceStatus`
- `finishOrder`
- `payout`
- `officialResultSource`
- `sourceFetchedAt`
- `sourceHash`
- `linkedPredictionFile`
- `linkedSummaryFile`
- `linkedReviewFile`

## Finish order

Each row requires:

- `rank`
- `carNo`
- `playerName`
- `registrationNo`

If registrationNo is absent from the official result source, it remains `null`. The result or review layer must not infer it from the name.

`raceStatus` is one of:

- `scheduled`
- `finished`
- `cancelled`
- `abandoned`
- `unknown`

## Payout

Required payout collections:

- `twoExact`
- `twoQuinella`
- `threeExact`
- `threeQuinella`
- `wide`

Each collection contains explicit official combinations and amounts. Missing payout categories use an empty array, not generated values.

Example item:

```json
{
  "combination": "3-1",
  "amount": 1240,
  "currency": "JPY"
}
```

## Provenance and links

- `officialResultSource` is mandatory even when the race is cancelled.
- `sourceFetchedAt` records when the official result was obtained.
- `sourceHash` identifies the preserved official result bytes.
- Linked file paths are explicit; unavailable files are `null`.
- File links do not imply that prose in those files is trusted starter data.

## Prohibitions

- Do not generate starters from result or review prose.
- Do not infer registrationNo from playerName.
- Do not auto-merge same-name players.
- Do not fill missing payouts or finish positions.
- Do not replace official result provenance with a prediction, summary, or review hash.
