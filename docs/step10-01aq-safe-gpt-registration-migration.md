# STEP10-01AQ — Safe default GPT registration contract (NONDEPLOY)

## Historical reason

Before AQ, `buildPredictionGptMaterialSourceContract` accepted registration candidates based on name/prefecture/term or material memo text, and some official source labels were shortened to `entry`. This must not be treated as independent proof of the current event's rider ID. The three previous audit scripts contradicted one another: one banned name completion while two required it.

## AQ contract

1. **Default AND preview GPT exports** use `buildStrictOfficialRegistrationMaterial` and `resolveStrictRegistration`. There is no environment-flag fallback to the name-derived contract.
2. The old public helper remains for API compatibility but **always writes `registrationNo=null / source=none / status=unverified-blocked`**, including when an explicit ID was supplied. It lacks the necessary evidence parameters and cannot authenticate a rider.
3. A current-day identity is presented only after an exact `(date, venueCode, raceNo, carNo)` lookup, 5–6 digit explicit registration number and demographic cross-check, recorded JSJ001/JSJ006 exact race evidence, and byte-for-byte official snapshot SHA256 agreement with `today.source.officialEntriesSha256`.
4. Missing proof, missing riders and even one conflicted rider **hold that entire R**. A held R in a batch **holds the full batch**, including appended KURARI EX material. Copy and download buttons reject holds; UI shows registration verification pending.
5. The historical name and material candidate state is not deleted from stored predictions, player card data, or archives. Candidates are **not used as ID proof** by GPT export.
6. KEIRIN.JP race `sourceName` / `sourceType=official` and the rider's `registrationNo` provenance must remain independent claims.
7. A 5-digit official registration number remains five digits; **never pad leading zeroes or strip arbitrary characters** from a candidate.

## Audit migration

`audit-prediction-page-gpt-material-source-contract.mjs`, `...registrationno-enrichment.mjs`, and `...registrationno-material-enrichment.mjs` keep their CLI and exported audit names but delegate to the **same fail-closed behavioral tests** in `audit-step10-01aq-safe-material.mjs`. A deliberate regression detector, `tests/test-aq-audit-negative.mjs`, verifies that restoring an unsafe default, leaking raw IDs, disabling batch hold, or disabling a download guard makes the safety audit fail. Previous audit source remains available in the Git history at PR#6 head `64108c8d99034637df5a9661df18d8420d82b0bc`.

## Important limitation

AQ does **not** deploy. Historic snapshots (including 2026-11-05) lack official per-race proofs and paired SHA and therefore **cannot produce full usable GPT material** under the stricter default. This is a deliberate user-facing regression to be evaluated before any release. It is **not** a successful end-to-end production workflow test.

No live external JSJ001 was fetched for AQ. No HTTPS browser/OS clipboard/mobile-device E2E, full site release, original Monthly raw/EX backup audit, or rollback rehearsal. Preserve all release HOLD gates until independently passed. Existing full-repository lint errors remain separately visible; do not hide them by broad eslint disable.
