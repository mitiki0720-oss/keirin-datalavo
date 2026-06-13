param(
  [string]$FilePath = "",
  [switch]$Once,
  [switch]$NoGit,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Downloads = Join-Path $env:USERPROFILE "Downloads"
$PrivateRoot = Join-Path $ProjectRoot "private-input\keirin-prediction-exports"
$Inbox = Join-Path $PrivateRoot "inbox"
$Processed = Join-Path $PrivateRoot "processed"
$Rejected = Join-Path $PrivateRoot "rejected"
$Logs = Join-Path $PrivateRoot "logs"
$LogFile = Join-Path $Logs "watcher.log"
$ProcessedHashesFile = Join-Path $Logs "processed-hashes.json"
$WatcherLockFile = Join-Path $Logs "watcher.lock"
$LockAcquired = $false
$ProcessingHashes = @{}

@($Inbox, $Processed, $Rejected, $Logs) | ForEach-Object {
  New-Item -ItemType Directory -Force -Path $_ | Out-Null
}

function Write-WatcherLog {
  param([string]$Message)
  $line = "$(Get-Date -Format o) $Message"
  Write-Host $line
  Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8
}

function Wait-FileReady {
  param([string]$Path)
  $previousSignature = ""
  for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
    if (-not (Test-Path -LiteralPath $Path)) {
      Start-Sleep -Milliseconds 700
      continue
    }
    $item = Get-Item -LiteralPath $Path
    $signature = "$($item.Length):$($item.LastWriteTimeUtc.Ticks)"
    if ($item.Length -gt 0 -and $signature -eq $previousSignature) {
      return
    }
    $previousSignature = $signature
    Start-Sleep -Milliseconds 700
  }
  throw "download did not become stable: $Path"
}

function Read-ProcessedHashes {
  if (-not (Test-Path -LiteralPath $ProcessedHashesFile)) {
    return @()
  }
  try {
    $payload = Get-Content -LiteralPath $ProcessedHashesFile -Raw -Encoding UTF8 | ConvertFrom-Json
    return @($payload.items)
  } catch {
    Write-WatcherLog "processed hash history reset: $($_.Exception.Message)"
    return @()
  }
}

function Save-ProcessedHash {
  param(
    [string]$Hash,
    [string]$Filename,
    [string]$Date
  )
  $cutoff = (Get-Date).ToUniversalTime().AddDays(-90)
  $items = @(
    Read-ProcessedHashes |
      Where-Object {
        if ($_.hash -eq $Hash) {
          return $false
        }
        $processedAt = [DateTimeOffset]::MinValue
        if (-not [DateTimeOffset]::TryParse([string]$_.processedAt, [ref]$processedAt)) {
          return $false
        }
        return $processedAt.UtcDateTime -ge $cutoff
      }
  )
  $items += [PSCustomObject]@{
    hash = $Hash
    filename = $Filename
    processedAt = (Get-Date).ToUniversalTime().ToString("o")
    date = $Date
  }
  $items = @($items | Sort-Object processedAt -Descending | Select-Object -First 500)
  [PSCustomObject]@{
    schemaVersion = 1
    items = $items
  } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $ProcessedHashesFile -Encoding UTF8
}

function Test-ProcessedHash {
  param([string]$Hash)
  $cutoff = (Get-Date).ToUniversalTime().AddDays(-90)
  return [bool](
    Read-ProcessedHashes |
      Where-Object {
        $processedAt = [DateTimeOffset]::MinValue
        $_.hash -eq $Hash -and
        [DateTimeOffset]::TryParse([string]$_.processedAt, [ref]$processedAt) -and
        $processedAt.UtcDateTime -ge $cutoff
      } |
      Select-Object -First 1
  )
}

function Acquire-WatcherLock {
  if (Test-Path -LiteralPath $WatcherLockFile) {
    try {
      $existing = Get-Content -LiteralPath $WatcherLockFile -Raw -Encoding UTF8 | ConvertFrom-Json
      $existingProcess = Get-Process -Id ([int]$existing.pid) -ErrorAction SilentlyContinue
      $sameProcess = $existingProcess -and (
        -not $existing.processStartedAt -or
        $existingProcess.StartTime.ToUniversalTime().ToString("o") -eq [string]$existing.processStartedAt
      )
      if ($sameProcess) {
        Write-WatcherLog "already running: PID $($existing.pid)"
        return $false
      }
      Write-WatcherLog "stale lock recovered: PID $($existing.pid)"
    } catch {
      Write-WatcherLog "invalid stale lock recovered"
    }
    Remove-Item -LiteralPath $WatcherLockFile -Force -ErrorAction SilentlyContinue
  }
  $lockPayload = [PSCustomObject]@{
    pid = $PID
    startedAt = (Get-Date).ToUniversalTime().ToString("o")
    processStartedAt = (Get-Process -Id $PID).StartTime.ToUniversalTime().ToString("o")
  } | ConvertTo-Json -Compress
  try {
    $lockStream = [System.IO.File]::Open(
      $WatcherLockFile,
      [System.IO.FileMode]::CreateNew,
      [System.IO.FileAccess]::Write,
      [System.IO.FileShare]::None
    )
    try {
      $lockBytes = [System.Text.UTF8Encoding]::new($false).GetBytes($lockPayload)
      $lockStream.Write($lockBytes, 0, $lockBytes.Length)
    } finally {
      $lockStream.Dispose()
    }
  } catch {
    Write-WatcherLog "already running: lock acquisition failed"
    return $false
  }
  $script:LockAcquired = $true
  return $true
}

function Release-WatcherLock {
  if ($script:LockAcquired -and (Test-Path -LiteralPath $WatcherLockFile)) {
    try {
      $existing = Get-Content -LiteralPath $WatcherLockFile -Raw -Encoding UTF8 | ConvertFrom-Json
      if ([int]$existing.pid -eq $PID) {
        Remove-Item -LiteralPath $WatcherLockFile -Force
      }
    } catch {
      Remove-Item -LiteralPath $WatcherLockFile -Force -ErrorAction SilentlyContinue
    }
  }
}

function Invoke-Node {
  param([string[]]$Arguments)
  & node @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "node command failed ($LASTEXITCODE): node $($Arguments -join ' ')"
  }
}

function Process-PredictionExport {
  param([string]$SourcePath)
  if (-not (Test-Path -LiteralPath $SourcePath)) {
    Write-WatcherLog "duplicate skipped: $(Split-Path -Leaf $SourcePath)"
    return
  }
  Wait-FileReady -Path $SourcePath
  $name = Split-Path -Leaf $SourcePath
  $hash = (Get-FileHash -LiteralPath $SourcePath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($ProcessingHashes.ContainsKey($hash) -or (Test-ProcessedHash -Hash $hash)) {
    Write-WatcherLog "duplicate skipped: $name"
    return
  }
  $ProcessingHashes[$hash] = $true
  $inboxFile = Join-Path $Inbox $name
  Write-WatcherLog "detected: $SourcePath"
  try {
    Copy-Item -LiteralPath $SourcePath -Destination $inboxFile -Force
    $payload = Get-Content -LiteralPath $inboxFile -Raw -Encoding UTF8 | ConvertFrom-Json
    $date = [string]$payload.date
    if ($date -notmatch '^\d{4}-\d{2}-\d{2}$') {
      throw "invalid export date"
    }
    $importArgs = @("scripts/import-keirin-daily-predictions.mjs", "--file", $inboxFile)
    if ($DryRun) { $importArgs += "--dry-run" }
    Push-Location $ProjectRoot
    try {
      Invoke-Node -Arguments $importArgs
      if (-not $DryRun) {
        Invoke-Node -Arguments @("scripts/rebuild-keirin-saved-predictions.mjs")
        Invoke-Node -Arguments @("scripts/check-keirin-daily-predictions.mjs")
        $historyFile = Join-Path $ProjectRoot "public\data\analytics\kurari-ex\history\daily\$($date.Substring(0,7))\$date.generated.json"
        if (Test-Path -LiteralPath $historyFile) {
          Invoke-Node -Arguments @(
            "scripts/run-kurari-ex-nightly-update.mjs",
            "--date=$date",
            "--allow-enrichment-upgrade"
          )
        } else {
          Write-WatcherLog "enrichment skipped: FACTS missing for $date"
        }
        $today = Get-Content -LiteralPath (Join-Path $ProjectRoot "public\data\races\today.generated.json") -Raw -Encoding UTF8 | ConvertFrom-Json
        if ([string]$today.date -eq $date) {
          Invoke-Node -Arguments @("scripts/audit-keirin-saved-predictions-coverage.mjs")
        }
        if (-not $NoGit) {
          $gitPaths = @(
            "public/data/predictions/daily/"
            "public/data/predictions/saved-predictions.generated.json"
            "public/data/analytics/kurari-ex/history/"
            "public/data/analytics/kurari-ex/exact/"
          )
          $changed = git status --short -- $gitPaths
          if ($changed) {
            git add -- $gitPaths
            git commit --only -m "Import keirin predictions $date" -- $gitPaths
            git pull --rebase --autostash origin main
            git push origin main
          } else {
            Write-WatcherLog "no public data changes"
          }
        }
      }
    } finally {
      Pop-Location
    }
    if (-not $DryRun) {
      if (Test-Path -LiteralPath $inboxFile) {
        Move-Item -LiteralPath $inboxFile -Destination (Join-Path $Processed $name) -Force
      } else {
        Write-WatcherLog "duplicate skipped: $name"
        return
      }
      Save-ProcessedHash -Hash $hash -Filename $name -Date $date
    }
    Write-WatcherLog "processed: $name"
  } catch {
    if (Test-Path -LiteralPath $inboxFile) {
      Move-Item -LiteralPath $inboxFile -Destination (Join-Path $Rejected $name) -Force
      Write-WatcherLog "rejected: $name / $($_.Exception.Message)"
      throw
    }
    Write-WatcherLog "duplicate skipped: $name"
    return
  } finally {
    $ProcessingHashes.Remove($hash)
  }
}

if (-not (Acquire-WatcherLock)) {
  exit 0
}

try {
  if ($FilePath) {
    Process-PredictionExport -SourcePath (Resolve-Path -LiteralPath $FilePath)
    exit 0
  }

  if ($Once) {
    $latest = Get-ChildItem -LiteralPath $Downloads -Filter "keirin-predictions-*.json" -File |
      Sort-Object LastWriteTimeUtc -Descending |
      Select-Object -First 1
    if (-not $latest) {
      throw "no keirin prediction export found in $Downloads"
    }
    Process-PredictionExport -SourcePath $latest.FullName
    exit 0
  }

  Write-WatcherLog "watching: $Downloads\keirin-predictions-*.json"
  $seen = @{}
  while ($true) {
    Get-ChildItem -LiteralPath $Downloads -Filter "keirin-predictions-*.json" -File | ForEach-Object {
      $signature = "$($_.Length):$($_.LastWriteTimeUtc.Ticks)"
      if ($seen[$_.FullName] -ne $signature) {
        $seen[$_.FullName] = $signature
        try {
          Process-PredictionExport -SourcePath $_.FullName
        } catch {
          Write-WatcherLog "processing failed; watcher continues"
        }
      }
    }
    Start-Sleep -Seconds 2
  }
} finally {
  Release-WatcherLock
}
