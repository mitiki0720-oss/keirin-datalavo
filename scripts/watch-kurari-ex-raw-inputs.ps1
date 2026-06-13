param(
  [string]$FilePath = "",
  [switch]$Once,
  [switch]$NoPush,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$RawRoot = Join-Path $ProjectRoot "private-input\kurari-ex\raw"
$WatcherRoot = Join-Path $ProjectRoot "private-input\kurari-ex\raw-watcher"
$Logs = Join-Path $WatcherRoot "logs"
$LogFile = Join-Path $Logs "watcher.log"
$ProcessedHashesFile = Join-Path $Logs "processed-hashes.json"
$WatcherLockFile = Join-Path $Logs "watcher.lock"
$LockAcquired = $false
$ProcessingHashes = @{}

@($RawRoot, $Logs) | ForEach-Object {
  New-Item -ItemType Directory -Force -Path $_ | Out-Null
}

function Write-WatcherLog {
  param([string]$Message)
  $line = "$(Get-Date -Format o) $Message"
  Write-Host $line
  Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8
}

function Test-EligibleFile {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
  $name = Split-Path -Leaf $Path
  $extension = [System.IO.Path]::GetExtension($name).ToLowerInvariant()
  return (
    $extension -in @(".txt", ".md") -and
    -not $name.StartsWith("~") -and
    -not $name.EndsWith(".tmp", [System.StringComparison]::OrdinalIgnoreCase)
  )
}

function Wait-FileReady {
  param([string]$Path)
  $previousSignature = ""
  for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
      Start-Sleep -Milliseconds 700
      continue
    }
    $item = Get-Item -LiteralPath $Path
    $signature = "$($item.Length):$($item.LastWriteTimeUtc.Ticks)"
    if ($item.Length -gt 0 -and $signature -eq $previousSignature) { return }
    $previousSignature = $signature
    Start-Sleep -Milliseconds 700
  }
  throw "raw input did not become stable: $Path"
}

function Read-ProcessedHashes {
  if (-not (Test-Path -LiteralPath $ProcessedHashesFile)) { return @() }
  try {
    $payload = Get-Content -LiteralPath $ProcessedHashesFile -Raw -Encoding UTF8 | ConvertFrom-Json
    return @($payload.items)
  } catch {
    Write-WatcherLog "processed hash history reset: $($_.Exception.Message)"
    return @()
  }
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

function Save-ProcessedHash {
  param(
    [string]$Hash,
    [string]$Filename
  )
  $cutoff = (Get-Date).ToUniversalTime().AddDays(-90)
  $items = @(
    Read-ProcessedHashes |
      Where-Object {
        if ($_.hash -eq $Hash) { return $false }
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
  }
  [PSCustomObject]@{
    schemaVersion = 1
    items = @($items | Sort-Object processedAt -Descending | Select-Object -First 500)
  } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $ProcessedHashesFile -Encoding UTF8
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
  $payload = [PSCustomObject]@{
    pid = $PID
    startedAt = (Get-Date).ToUniversalTime().ToString("o")
    processStartedAt = (Get-Process -Id $PID).StartTime.ToUniversalTime().ToString("o")
  } | ConvertTo-Json -Compress
  try {
    $stream = [System.IO.File]::Open(
      $WatcherLockFile,
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
  } catch {
    Write-WatcherLog "already running: lock acquisition failed"
    return $false
  }
  $script:LockAcquired = $true
  return $true
}

function Release-WatcherLock {
  if (-not $script:LockAcquired) { return }
  try {
    $existing = Get-Content -LiteralPath $WatcherLockFile -Raw -Encoding UTF8 | ConvertFrom-Json
    if ([int]$existing.pid -eq $PID) {
      Remove-Item -LiteralPath $WatcherLockFile -Force
    }
  } catch {
    Remove-Item -LiteralPath $WatcherLockFile -Force -ErrorAction SilentlyContinue
  }
}

function Invoke-RawRefresh {
  $arguments = @("scripts/run-kurari-ex-raw-refresh.mjs")
  if ($DryRun) { $arguments += "--dry-run" }
  if ($NoPush) { $arguments += "--no-push" }
  Write-WatcherLog "refresh started"
  Push-Location $ProjectRoot
  try {
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
      $output = & node @arguments 2>&1
      $exitCode = $LASTEXITCODE
    } finally {
      $ErrorActionPreference = $previousErrorActionPreference
    }
    $output | ForEach-Object { Write-WatcherLog ([string]$_) }
    if ($exitCode -ne 0) {
      throw "raw refresh failed with exit code $exitCode"
    }
  } finally {
    Pop-Location
  }
  Write-WatcherLog "audit passed"
}

function Process-RawInput {
  param([string]$SourcePath)
  if (-not (Test-EligibleFile -Path $SourcePath)) { return }
  Wait-FileReady -Path $SourcePath
  $name = Split-Path -Leaf $SourcePath
  $hash = (Get-FileHash -LiteralPath $SourcePath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($ProcessingHashes.ContainsKey($hash) -or (Test-ProcessedHash -Hash $hash)) {
    Write-WatcherLog "duplicate skipped: $name"
    return
  }
  $ProcessingHashes[$hash] = $true
  Write-WatcherLog "detected: $SourcePath"
  Write-WatcherLog "hash: $hash"
  try {
    Invoke-RawRefresh
    if (-not $DryRun) { Save-ProcessedHash -Hash $hash -Filename $name }
    Write-WatcherLog "processed: $name"
  } catch {
    Write-WatcherLog "failed: $name / $($_.Exception.Message)"
    throw
  } finally {
    $ProcessingHashes.Remove($hash)
  }
}

if (-not (Acquire-WatcherLock)) { exit 0 }

$watcher = $null
$subscriptions = @()
try {
  if ($FilePath) {
    Process-RawInput -SourcePath (Resolve-Path -LiteralPath $FilePath)
    exit 0
  }
  if ($Once) {
    $latest = Get-ChildItem -LiteralPath $RawRoot -Recurse -File |
      Where-Object { Test-EligibleFile -Path $_.FullName } |
      Sort-Object LastWriteTimeUtc -Descending |
      Select-Object -First 1
    if (-not $latest) { throw "no TXT or MD raw input found in $RawRoot" }
    Process-RawInput -SourcePath $latest.FullName
    exit 0
  }

  $queue = [System.Collections.Concurrent.ConcurrentQueue[string]]::new()
  $watcher = [System.IO.FileSystemWatcher]::new($RawRoot)
  $watcher.IncludeSubdirectories = $true
  $watcher.NotifyFilter = (
    [System.IO.NotifyFilters]::FileName -bor
    [System.IO.NotifyFilters]::LastWrite -bor
    [System.IO.NotifyFilters]::Size
  )
  $watcher.EnableRaisingEvents = $true
  foreach ($eventName in @("Created", "Changed", "Renamed")) {
    $subscriptions += Register-ObjectEvent -InputObject $watcher -EventName $eventName -MessageData $queue -Action {
      $event.MessageData.Enqueue($event.SourceEventArgs.FullPath)
    }
  }
  Write-WatcherLog "watching: $RawRoot\**\*.txt,*.md"
  while ($true) {
    $path = $null
    if ($queue.TryDequeue([ref]$path)) {
      try {
        Process-RawInput -SourcePath $path
      } catch {
        Write-WatcherLog "processing failed; watcher continues"
      }
      continue
    }
    Start-Sleep -Milliseconds 250
  }
} finally {
  foreach ($subscription in $subscriptions) {
    Unregister-Event -SubscriptionId $subscription.Id -ErrorAction SilentlyContinue
    Remove-Job -Id $subscription.Id -Force -ErrorAction SilentlyContinue
  }
  if ($watcher) { $watcher.Dispose() }
  Release-WatcherLock
}
