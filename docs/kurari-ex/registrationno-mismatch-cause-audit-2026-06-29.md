# KURARI EX RegistrationNo Mismatch Cause Audit: 2026-06-29

## Purpose

2026-06-29 の dry-run candidate 比較で報告された59件の identity mismatch を、raw entry table、既存 history、同日の `keirin-jp-entries` snapshot の間で再検査する。監査は読み取り専用であり、history daily/index、raw、source、races を書き換えない。

## Audit status

- Final status: `REGISTRATIONNO_MISMATCH_CAUSE_AUDIT_COMPLETED_WITH_WARNINGS`
- Total history starters: 464
- Originally reported mismatches: 59
- Parser delimiter comparison false positives: 49
- Actual wrong raw registrationNo rows: 10
- `writePerformed=false`

## Cause classification

佐世保の49行は、raw entry table が全角縦線 `｜` で区切られている。従来比較は氏名フィールドを `[／/]` だけで分割したため、氏名として `氏名｜府県｜年齢｜期別...` の行全体を取り込んだ。登録番号抽出用の明示的な `登録番号` pattern は正しい列を取得しているため、この49件は registrationNo の不一致ではない。

delimiter-aware 比較を `[／/｜|]` で行うと、464行すべてが同一日・同一場・同一race・同一車番の history starter に結合し、氏名差分は0件、registrationNo 差分は次の10件だけになる。

## Actual mismatch table

| Venue | Race | Car | Player | Raw registrationNo | Authoritative registrationNo |
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

10件は race、車番、氏名、府県、年齢、期別で対象選手が特定できる一方、raw registrationNo だけが authoritative snapshot と異なる。raw番号の多くは別選手に割り当てられた実在番号であり、古い同一選手番号として扱えない。

## Join and identity safety

- Row shift suspected: 0
- Race join shift suspected: 0
- Same-name automatic merge: 0
- Same-name candidate involvement in actual mismatch: 0
- Cross-date join: none
- Cross-venue join: none
- Generated name/carNo/starter/registrationNo: none
- Fake or fuzzy identity resolution: none

2026-06-29 内には同一 name key の候補が存在するが、実不一致10件には含まれず、date・venue・raceNumber・carNo による結合を変更していない。

## Existing history evidence

- Existing history starters: 464
- `keirin-jp-entries` snapshot matched: 464 / 464
- Name mismatch: 0
- registrationNo mismatch: 0
- History provenance label: `entries-history-snapshot`
- Snapshot path: `public/data/races/entries-history/2026-06-29/keirin-jp-entries.generated.json`
- Snapshot content hash and every history starter provenance hash:
  `sha256:3cd6ac2f4b41692aa32e7c46e0841ea6ef49ebb2adfbea667ae6e3f2ded97843`

## Conclusion

- Existing 2026-06-29 history remains authoritative.
- Raw prediction entry tables contain 10 incorrect registrationNo rows.
- The reported 59 count must not be described as 59 registrationNo mismatches.
- 2026-06-29 refresh is not required and must not run.
- 2026-06-30 backfill must not run until the delimiter fix and raw registrationNo trust gate are implemented and checked.
- No public data or source data was changed by this audit.
