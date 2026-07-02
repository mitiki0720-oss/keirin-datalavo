# KURARI EX Daily Ingestion Validation Runbook

## Purpose

future registrationNo-ready daily を安全に追加するための、source collection から writer 前判定までの運用手順。validation gate は read-only であり、PASS でも自動的には書き込まない。

## Daily workflow

### Step 1: Collect authoritative source

対象日の directory に、venue ごとの source を保存する。

```text
private-input/kurari-ex/raw/YYYY-MM-DD/
```

future prediction/summary には本文と独立した `【出走表】` block を含め、date、venue、raceNumber、carNo、playerName、registrationNo を同一 source context で保存する。

### Step 2: Validate source contract

- source date と target date が一致
- venueKey と raceNumber が確定
- carNo と playerName が同じ row
- registrationNo がある場合は同じ row
- source file/hash を監査可能
- race 内 carNo / registrationNo が一意
- result/review や prediction prose 由来ではない

registrationNo がない row を exact row として扱わない。

### Step 3: Run validation gate

既定の代表日:

```powershell
node scripts/audit-kurari-ex-daily-ingestion-validation-gate.mjs
```

対象日:

```powershell
node scripts/audit-kurari-ex-daily-ingestion-validation-gate.mjs `
  --date YYYY-MM-DD `
  --source-dir private-input/kurari-ex/raw/YYYY-MM-DD `
  --history-index public/data/analytics/kurari-ex/history/index.generated.json
```

scope checker:

```powershell
node scripts/check-kurari-ex-daily-ingestion-validation-gate.mjs
```

### Step 4: If PASS, proceed to a daily writer

`PASS_READY_FOR_DAILY_WRITE` の場合のみ、別途用意した guarded writer を使用する。writer は以下を再確認する。

- dry-run output を入力に固定
- same date/venue/race/car exact join
- payload hash/bytes/race count
- atomic write
- index latest/path/count
- post-write checker

validation script 自体に write 機能を追加しない。

### Step 5: If WARN, classify partial/manual review

`WARN_PARTIAL_REGISTRATION_NO`:

- registrationNo 付き row だけ exact identity
- 欠損 row は null/unresolved
- name-based backfill なし
- partial warning を daily quality に保持

`WARN_MANUAL_REVIEW_REQUIRED`:

- same-name candidate を自動統合しない
- candidate registrationNo を推測しない
- authoritative source collection と manual review を先に行う

### Step 6: If STOP, do not write

`STOP_*` decision では daily/index writer を実行しない。既存 public data を変更せず、block reason を解消して再検証する。

## RegistrationNo missing

- `null` のまま保持
- EXACT player analysis から除外
- 氏名や carNo だけで補完しない
- 別日・別会場・別 race source を join しない
- source collection queue に残す

## NO_STARTERS

- race/result/prediction/review の race-level data は利用可能
- player-level analysis は unavailable
- explicit race-only workflow でのみ `PASS_RACE_ONLY_NO_STARTERS`
- starterCount、starter、registrationNo を生成しない

## Same-name candidates

- 石井貴子: 014962 / 015023 を分離
- 山中貴雄: 013264 / 014108 を分離
- 山口貴弘: 013615 / 014268、未割当9件は manual review
- name-only record はいずれの candidate にも割り当てない

## Source missing

- source directory missing: `STOP_SOURCE_MISSING`
- structured entry table missing: 原則 `STOP_SOURCE_MISSING`
- history が明示的 NO_STARTERS で race-only を選択する場合のみ race-only decision
- source missing を fake rows で埋めない

## Future summary/prediction with registrationNo

entry table は prediction prose と区別できる block にする。推奨形式:

```text
■ 会場 1R
【出走表】
1 選手名／府県／年齢／期／級班／車番1／登録番号015000
```

各 file は target date/venue を明示し、保存後の file hash を provenance として gate が記録できる状態にする。

## Validation status commands

```powershell
node --check scripts/audit-kurari-ex-daily-ingestion-validation-gate.mjs
node --check scripts/check-kurari-ex-daily-ingestion-validation-gate.mjs
node scripts/audit-kurari-ex-daily-ingestion-validation-gate.mjs
node scripts/check-kurari-ex-daily-ingestion-validation-gate.mjs
```

Node 22:

```powershell
npx -y -p node@22 node --check scripts/audit-kurari-ex-daily-ingestion-validation-gate.mjs
npx -y -p node@22 node --check scripts/check-kurari-ex-daily-ingestion-validation-gate.mjs
npx -y -p node@22 node scripts/audit-kurari-ex-daily-ingestion-validation-gate.mjs
npx -y -p node@22 node scripts/check-kurari-ex-daily-ingestion-validation-gate.mjs
```

## Next recommended task

`KURARI EX guarded daily writer dry-run using daily ingestion validation result`

最初は write なしで、PASS_READY、PASS_RACE_ONLY、WARN_PARTIAL、WARN_MANUAL、各 STOP case の fixture/representative validation を固定する。実書込は dry-run と checker が安定した後の別タスクにする。
