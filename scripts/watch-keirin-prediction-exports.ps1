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
  $previousLength = -1
  for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
    if (Test-Path -LiteralPath $Path) {
      $item = Get-Item -LiteralPath $Path
      if ($item.Length -gt 0 -and $item.Length -eq $previousLength) {
        return
      }
      $previousLength = $item.Length
    }
    Start-Sleep -Milliseconds 500
  }
  throw "download did not become stable: $Path"
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
  Wait-FileReady -Path $SourcePath
  $name = Split-Path -Leaf $SourcePath
  $inboxFile = Join-Path $Inbox $name
  Copy-Item -LiteralPath $SourcePath -Destination $inboxFile -Force
  Write-WatcherLog "detected: $SourcePath"
  try {
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
      Move-Item -LiteralPath $inboxFile -Destination (Join-Path $Processed $name) -Force
    }
    Write-WatcherLog "processed: $name"
  } catch {
    if (Test-Path -LiteralPath $inboxFile) {
      Move-Item -LiteralPath $inboxFile -Destination (Join-Path $Rejected $name) -Force
    }
    Write-WatcherLog "rejected: $name / $($_.Exception.Message)"
    throw
  }
}

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
