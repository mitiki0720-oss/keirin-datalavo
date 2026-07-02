# Review Page Result Output Implementation

## Scope

The review page result copy/download output now appends one
`KURARI_EX_RESULT_OUTPUT_V1` block per race. The block is JSON so KURARI EX can
read it without parsing the human-readable review prose.

This implementation changes UI-generated text only. It does not write review
files, race data, KURARI EX history, source data, or private input.

## Output contract

```text
KURARI_EX_RESULT_OUTPUT_V1
{
  "date": "2026-07-03",
  "venueName": "函館",
  "raceNumber": "1",
  "raceStatus": "finished",
  "finishOrder": [
    {
      "rank": "1",
      "carNo": "7",
      "playerName": "選手名",
      "registrationNo": "012345",
      "registrationNoSource": "result",
      "registrationNoTrustStatus": "explicit-result-registration"
    }
  ],
  "payout": {
    "twoExact": {
      "combination": "7-3",
      "payout": "1,240円",
      "popularity": "4番人気"
    },
    "twoQuinella": [],
    "threeExact": null,
    "threeQuinella": null,
    "wide": []
  },
  "source": {
    "officialResultSource": "https://official.example/result",
    "sourceFetchedAt": "2026-07-03T21:30:00+09:00",
    "sourceHash": "sha256:..."
  },
  "links": {
    "linkedPredictionFile": "/data/reviews/2026-07-03/venue-prediction.txt",
    "linkedSummaryFile": "/data/reviews/2026-07-03/venue-summary.txt",
    "linkedReviewFile": "/data/reviews/2026-07-03/venue-result.txt"
  }
}
```

Missing scalar values are JSON `null`. Missing multi-value payouts are empty
arrays. No placeholder identity is generated.

## Race status

- confirmed result: `finished`
- explicit all-refund/cancelled race: `cancelled`
- future explicit postponed source: `postponed`
- otherwise: `unknown`

The current feed has no explicit postponed value, so the implementation does
not infer postponement.

## registrationNo resolution

1. An explicit registration number in the structured result row is used with
   source `result` and status `explicit-result-registration`.
2. Otherwise, a same-race entry may be used only when `carNo` matches and the
   normalized player name matches exactly.
3. An entry registration number is reported as source `entry`. A trusted
   registration already enriched in prediction GPT material is reported as
   `prediction-gpt-material`. Both use status `safe-identity-match`.
4. Missing evidence stays `null` / `none` / `unavailable`.
5. Duplicate car-number entries are `ambiguous-blocked`; name conflicts are
   `conflict-blocked`.

There is no name-only lookup, fuzzy matching, same-name merge, registration
number generation, or result-prose-to-starter conversion.

## Provenance and links

Only explicit structured source values are emitted. `sourceFetchedAt` may use
the race/feed generation timestamp when a more specific result fetch timestamp
is unavailable. `officialResultSource` and `sourceHash` remain `null` when the
feed does not provide them.

Review index paths are passed through as prediction, summary, and review links.
They remain `null` for live/local output without linked files.

