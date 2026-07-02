# KURARI EX Daily Writer Preflight Runbook

## Purpose

authoritative source の収集後、validation gate と writer preflight を順番に実行し、writer を開始できる mode を確定する。preflight の `ALLOW_*` は権限判定であり、このタスクでは実際に書き込まない。

## Daily workflow

### Step 1: Collect source

対象日・会場・race ごとに、構造化 `【出走表】` block を含む authoritative source を保存する。

```text
private-input/kurari-ex/raw/YYYY-MM-DD/
```

date、venue、raceNumber、carNo、playerName、registrationNo を同じ source context に保持し、result/review や prediction prose から identity を作らない。

### Step 2: Run daily ingestion validation gate

```powershell
node scripts/audit-kurari-ex-daily-ingestion-validation-gate.mjs `
  --date YYYY-MM-DD `
  --source-dir private-input/kurari-ex/raw/YYYY-MM-DD `
  --history-index public/data/analytics/kurari-ex/history/index.generated.json
```

duplicate、source contract、registrationNo coverage、same-name ambiguity、fake/generated/fuzzy、prohibited source use を解消する。

### Step 3: Run daily writer preflight bridge

read-only:

```powershell
node scripts/audit-kurari-ex-daily-writer-preflight-bridge.mjs `
  --date YYYY-MM-DD `
  --source-dir private-input/kurari-ex/raw/YYYY-MM-DD `
  --writer-mode no-write
```

exact mode の適合確認:

```powershell
node scripts/audit-kurari-ex-daily-writer-preflight-bridge.mjs `
  --date YYYY-MM-DD `
  --source-dir private-input/kurari-ex/raw/YYYY-MM-DD `
  --writer-mode exact
```

保存済み validation JSON を渡す場合:

```powershell
node scripts/audit-kurari-ex-daily-writer-preflight-bridge.mjs `
  --validation-result path/to/validation-result.json `
  --writer-mode no-write
```

### Step 4: ALLOW_EXACT_DAILY_WRITE

- `writerModeAllowed=exact`
- immutable source hash と validated rows を writer へ渡す
- writer は source hash を再確認
- atomic write と post-write checker を必須化
- preflight に含まれない row は使用しない

このタスクでは writer を実行しない。

### Step 5: ALLOW_RACE_ONLY_NO_STARTERS_WRITE

- race-only writer だけを許可
- startersDetected は0
- starter/player identity を生成しない
- race/result/prediction/review summary の保存済み race-level data のみ

### Step 6: Partial requires human confirmation

`BLOCK_EXACT_WRITE_ALLOW_PARTIAL_WITH_HUMAN_CONFIRMATION`:

- exact writer は禁止
- missing registrationNo は null/unresolved
- name-based backfill 禁止
- partial warning を保持
- 別 write step で人間が対象日・欠損数・source hash を確認するまで実行しない

`--writer-mode partial` は mode 適合を確認するだけで、人間確認を代替しない。

### Step 7: Manual review or STOP

`BLOCK_WRITE_MANUAL_REVIEW_REQUIRED` または `BLOCK_WRITE`:

- writer を実行しない
- history daily/index を変更しない
- same-name candidate を割り当てない
- STOP/block reason を authoritative source で解消
- validation gate から再実行

## Representative behavior

- 2026-06-29: exact 464 rows、`ALLOW_EXACT_DAILY_WRITE`
- 2026-06-30: exact 551 rows、`ALLOW_EXACT_DAILY_WRITE`
- 2026-07-01: 577 rows中183件欠損、exact block、partial は人間確認待ち
- 2026-06-21: registrationNo 0/423、same-name manual review、全 writer block
- STOP decisions: 0

## Required checks

```powershell
node --check scripts/audit-kurari-ex-daily-writer-preflight-bridge.mjs
node --check scripts/check-kurari-ex-daily-writer-preflight-bridge.mjs
node scripts/audit-kurari-ex-daily-writer-preflight-bridge.mjs
node scripts/check-kurari-ex-daily-writer-preflight-bridge.mjs
```

Node 22:

```powershell
npx -y -p node@22 node --check scripts/audit-kurari-ex-daily-writer-preflight-bridge.mjs
npx -y -p node@22 node --check scripts/check-kurari-ex-daily-writer-preflight-bridge.mjs
npx -y -p node@22 node scripts/audit-kurari-ex-daily-writer-preflight-bridge.mjs
npx -y -p node@22 node scripts/check-kurari-ex-daily-writer-preflight-bridge.mjs
```

## Next recommended task

`KURARI EX immutable writer input manifest + exact/race-only/partial writer dry-run`

source hash、validated row counts、writer mode、target path、expected payload hash を manifest に固定する。最初は write なしで exact、race-only、partial、manual、STOP の各 case を検証する。
