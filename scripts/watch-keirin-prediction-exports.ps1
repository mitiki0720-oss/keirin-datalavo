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
$AutomationLocksRoot = Join-Path $ProjectRoot "private-input\automation-locks"
$RepoWriteLockFile = Join-Path $AutomationLocksRoot "keirin-repo-write.lock"
$LockAcquired = $false
$RepoWriteLockAcquired = $false
$RepoWriteLockToken = ""
$ProcessingHashes = @{}
$DownloadFilePattern = '^(?:keirin-predictions-.+|keirin-johnson-predictions\.generated(?: \(\d+\))?|keirin-johnson-from-browser-\d{4}-\d{2}-\d{2}(?: \(\d+\))?)\.json$'
$TargetPredictionJson = "public/data/predictions/saved-predictions.generated.json"
$MaxPushAttempts = 3

@($Inbox, $Processed, $Rejected, $Logs, $AutomationLocksRoot) | ForEach-Object {
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
    [string]$Date,
    [string]$Signature
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
    signature = $Signature
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
  param(
    [string]$Hash,
    [string]$Signature
  )
  $cutoff = (Get-Date).ToUniversalTime().AddDays(-90)
  return [bool](
    Read-ProcessedHashes |
      Where-Object {
        $processedAt = [DateTimeOffset]::MinValue
        (($_.hash -eq $Hash) -or ($Signature -and $_.signature -eq $Signature)) -and
        [DateTimeOffset]::TryParse([string]$_.processedAt, [ref]$processedAt) -and
        $processedAt.UtcDateTime -ge $cutoff
      } |
      Select-Object -First 1
  )
}

function Get-FileSignature {
  param([System.IO.FileInfo]$File)
  return "$($File.FullName)|$($File.LastWriteTimeUtc.Ticks)|$($File.Length)"
}

function Get-KeirinPredictionDownloadFiles {
  Get-ChildItem -LiteralPath $Downloads -Filter "*.json" -File |
    Where-Object { $_.Name -match $DownloadFilePattern }
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

function Acquire-RepoWriteLock {
  $deadline = (Get-Date).ToUniversalTime().AddMinutes(10)
  $waitingLogged = $false
  while ((Get-Date).ToUniversalTime() -lt $deadline) {
    if (Test-Path -LiteralPath $RepoWriteLockFile) {
      try {
        $existing = Get-Content -LiteralPath $RepoWriteLockFile -Raw -Encoding UTF8 | ConvertFrom-Json
        $existingProcess = Get-Process -Id ([int]$existing.pid) -ErrorAction SilentlyContinue
        $startedAt = [DateTimeOffset]::MinValue
        $validStartedAt = [DateTimeOffset]::TryParse([string]$existing.startedAt, [ref]$startedAt)
        $stale = (
          -not $existingProcess -or
          -not $validStartedAt -or
          $startedAt.UtcDateTime -lt (Get-Date).ToUniversalTime().AddHours(-6)
        )
        if ($stale) {
          Write-WatcherLog "stale repo write lock recovered"
          Remove-Item -LiteralPath $RepoWriteLockFile -Force -ErrorAction SilentlyContinue
          continue
        }
        if (-not $waitingLogged) {
          Write-WatcherLog "waiting for repo write lock: PID $($existing.pid)"
          $waitingLogged = $true
        }
      } catch {
        Write-WatcherLog "invalid repo write lock recovered"
        Remove-Item -LiteralPath $RepoWriteLockFile -Force -ErrorAction SilentlyContinue
        continue
      }
      Start-Sleep -Seconds 2
      continue
    }
    $script:RepoWriteLockToken = "$PID-$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"
    $payload = [PSCustomObject]@{
      schemaVersion = 1
      pid = $PID
      token = $script:RepoWriteLockToken
      owner = "keirin-prediction-export-watcher"
      startedAt = (Get-Date).ToUniversalTime().ToString("o")
    } | ConvertTo-Json -Compress
    try {
      $stream = [System.IO.File]::Open(
        $RepoWriteLockFile,
        [System.IO.FileMode]::CreateNew,
        [System.IO.FileAccess]::Write,
        [System.IO.FileShare]::None
      )
      try {
        $bytes = [System.Text.UTF8Encoding]::new($false).GetBytes($payload)
        $stream.Write($bytes, 0, $bytes.Length)
      } finally {
        $stream.Dispose()
      }
      $script:RepoWriteLockAcquired = $true
      Write-WatcherLog "repo write lock acquired"
      return
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }
  throw "timed out waiting for repo write lock"
}

function Release-RepoWriteLock {
  if (-not $script:RepoWriteLockAcquired) { return }
  try {
    $existing = Get-Content -LiteralPath $RepoWriteLockFile -Raw -Encoding UTF8 | ConvertFrom-Json
    if ([string]$existing.token -eq $script:RepoWriteLockToken) {
      Remove-Item -LiteralPath $RepoWriteLockFile -Force
    }
  } catch {
    Write-WatcherLog "repo write lock release warning: $($_.Exception.Message)"
  }
  $script:RepoWriteLockAcquired = $false
  Write-WatcherLog "repo write lock released"
}

function Invoke-Node {
  param([string[]]$Arguments)
  & node @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "node command failed ($LASTEXITCODE): node $($Arguments -join ' ')"
  }
}

function Invoke-Git {
  param(
    [string[]]$Arguments,
    [string]$WorkingDirectory = $ProjectRoot
  )
  Push-Location $WorkingDirectory
  try {
    & git @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "git command failed ($LASTEXITCODE): git $($Arguments -join ' ')"
    }
  } finally {
    Pop-Location
  }
}

function Invoke-NodeInDirectory {
  param(
    [string]$WorkingDirectory,
    [string[]]$Arguments
  )
  Push-Location $WorkingDirectory
  try {
    Invoke-Node -Arguments $Arguments
  } finally {
    Pop-Location
  }
}

function Get-CheckedPredictionDate {
  param([string]$JsonPath)
  $output = & node "scripts/check-keirin-prediction-json.mjs" "--file" $JsonPath "--print-date" 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "prediction JSON check failed: $($output -join "`n")"
  }
  $dateLine = @($output | Where-Object { $_ -match '^date: \d{4}-\d{2}-\d{2}$' } | Select-Object -Last 1)
  if (-not $dateLine) {
    throw "prediction JSON checker did not report date"
  }
  return ([string]$dateLine).Substring(6).Trim()
}

function Invoke-TempWorktreePredictionPush {
  param(
    [string]$InboxFile,
    [string]$Date
  )

  for ($attempt = 1; $attempt -le $MaxPushAttempts; $attempt += 1) {
    $worktreeRoot = Join-Path $env:TEMP ("keirin-prediction-push-{0}-{1}" -f $Date, ([Guid]::NewGuid().ToString("N")))
    Write-WatcherLog "push attempt $attempt/$MaxPushAttempts using temp worktree: $worktreeRoot"

    try {
      Invoke-Git -Arguments @("fetch", "origin", "main")
      Invoke-Git -Arguments @("worktree", "add", "--detach", $worktreeRoot, "origin/main")

      $targetFile = Join-Path $worktreeRoot $TargetPredictionJson
      Invoke-NodeInDirectory -WorkingDirectory $worktreeRoot -Arguments @("scripts/check-keirin-prediction-json.mjs", "--file", $InboxFile, "--date", $Date)
      Invoke-NodeInDirectory -WorkingDirectory $worktreeRoot -Arguments @("scripts/import-keirin-daily-predictions.mjs", "--file", $InboxFile)
      Invoke-NodeInDirectory -WorkingDirectory $worktreeRoot -Arguments @("scripts/rebuild-keirin-saved-predictions.mjs")
      Invoke-NodeInDirectory -WorkingDirectory $worktreeRoot -Arguments @("scripts/check-keirin-prediction-json.mjs", "--file", $targetFile, "--date", $Date)

      Invoke-Git -WorkingDirectory $worktreeRoot -Arguments @("add", "--", $TargetPredictionJson)
      $staged = @(git -C $worktreeRoot diff --cached --name-only)
      if ($staged.Count -eq 0) {
        Write-WatcherLog "no target JSON changes"
        return
      }
      if ($staged.Count -ne 1 -or [string]$staged[0] -ne $TargetPredictionJson) {
        throw "unexpected staged files: $($staged -join ', ')"
      }
      Invoke-Git -WorkingDirectory $worktreeRoot -Arguments @("diff", "--check", "--cached")
      Invoke-Git -WorkingDirectory $worktreeRoot -Arguments @("commit", "-m", "Update keirin Johnson predictions for $Date")
      Push-Location $worktreeRoot
      try {
        $pushOutput = & git push origin HEAD:main 2>&1
        if ($LASTEXITCODE -ne 0) {
          throw "git push failed ($LASTEXITCODE): $($pushOutput -join "`n")"
        }
      } finally {
        Pop-Location
      }
      Write-WatcherLog "push completed: $Date"
      return
    } catch {
      $message = $_.Exception.Message
      Write-WatcherLog "push attempt failed: $message"
      if ($message -notmatch "remote rejected|non-fast-forward|cannot lock ref|fetch first|stale info") {
        throw
      }
      if ($attempt -eq $MaxPushAttempts) {
        throw "push failed after $MaxPushAttempts attempts: $message"
      }
      Write-WatcherLog "retrying from fresh origin/main worktree"
    } finally {
      try {
        git worktree remove --force $worktreeRoot 2>$null | Out-Null
      } catch {
        Remove-Item -LiteralPath $worktreeRoot -Recurse -Force -ErrorAction SilentlyContinue
      }
      try {
        git worktree prune 2>$null | Out-Null
      } catch {
        # best effort cleanup
      }
    }
  }
}

function Process-PredictionExport {
  param([string]$SourcePath)
  if (-not (Test-Path -LiteralPath $SourcePath)) {
    Write-WatcherLog "duplicate skipped: $(Split-Path -Leaf $SourcePath)"
    return
  }
  Wait-FileReady -Path $SourcePath
  $sourceItem = Get-Item -LiteralPath $SourcePath
  $signature = Get-FileSignature -File $sourceItem
  $name = Split-Path -Leaf $SourcePath
  $hash = (Get-FileHash -LiteralPath $SourcePath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($ProcessingHashes.ContainsKey($hash) -or (Test-ProcessedHash -Hash $hash -Signature $signature)) {
    Write-WatcherLog "duplicate skipped: $name"
    return
  }
  $ProcessingHashes[$hash] = $true
  $inboxFile = Join-Path $Inbox $name
  Write-WatcherLog "detected: $SourcePath"
  try {
    Copy-Item -LiteralPath $SourcePath -Destination $inboxFile -Force
    Push-Location $ProjectRoot
    try {
      $date = Get-CheckedPredictionDate -JsonPath $inboxFile
    } finally {
      Pop-Location
    }
    if ($DryRun) {
      Push-Location $ProjectRoot
      try {
        Invoke-Node -Arguments @("scripts/import-keirin-daily-predictions.mjs", "--file", $inboxFile, "--dry-run")
      } finally {
        Pop-Location
      }
    } elseif ($NoGit) {
      Acquire-RepoWriteLock
      Push-Location $ProjectRoot
      try {
        Invoke-Node -Arguments @("scripts/import-keirin-daily-predictions.mjs", "--file", $inboxFile)
        Invoke-Node -Arguments @("scripts/rebuild-keirin-saved-predictions.mjs")
        Invoke-Node -Arguments @("scripts/check-keirin-daily-predictions.mjs")
      } finally {
        Pop-Location
        Release-RepoWriteLock
      }
    } else {
      Acquire-RepoWriteLock
      try {
        Invoke-TempWorktreePredictionPush -InboxFile $inboxFile -Date $date
      } finally {
        Release-RepoWriteLock
      }
    }
    if (-not $DryRun) {
      if (Test-Path -LiteralPath $inboxFile) {
        Move-Item -LiteralPath $inboxFile -Destination (Join-Path $Processed $name) -Force
      } else {
        Write-WatcherLog "duplicate skipped: $name"
        return
      }
      Save-ProcessedHash -Hash $hash -Filename $name -Date $date -Signature $signature
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
    $latest = Get-KeirinPredictionDownloadFiles |
      Sort-Object LastWriteTimeUtc -Descending |
      Select-Object -First 1
    if (-not $latest) {
      throw "no keirin prediction export found in $Downloads"
    }
    Process-PredictionExport -SourcePath $latest.FullName
    exit 0
  }

  Write-WatcherLog "watching: $Downloads\keirin prediction JSON exports"
  $seen = @{}
  Get-KeirinPredictionDownloadFiles | ForEach-Object {
    $seen[$_.FullName] = Get-FileSignature -File $_
  }
  while ($true) {
    Get-KeirinPredictionDownloadFiles | ForEach-Object {
      $signature = Get-FileSignature -File $_
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
