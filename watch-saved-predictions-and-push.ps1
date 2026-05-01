$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$DownloadDir = Join-Path $env:USERPROFILE "Downloads"
$TargetDir = Join-Path $ProjectRoot "public\data\predictions"
$TargetFile = Join-Path $TargetDir "saved-predictions.generated.json"
$LogFile = Join-Path $ProjectRoot "scripts\saved-predictions-auto-push-log.txt"

function Write-Log {
  param([string]$Message)

  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  $line = "[$timestamp] $Message"

  Write-Host $line

  $logDir = Split-Path -Parent $LogFile
  if (!(Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir | Out-Null
  }

  Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

function Wait-FileReady {
  param([string]$Path)

  for ($i = 0; $i -lt 20; $i++) {
    try {
      $stream = [System.IO.File]::Open($Path, "Open", "Read", "None")
      $stream.Close()
      return $true
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }

  return $false
}

function Publish-PredictionJson {
  param([string]$SourceFile)

  if (!(Test-Path $SourceFile)) {
    Write-Log "Source file not found: $SourceFile"
    return
  }

  if (!(Wait-FileReady -Path $SourceFile)) {
    Write-Log "File is not ready: $SourceFile"
    return
  }

  if (!(Test-Path $TargetDir)) {
    New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
    Write-Log "Created target directory: $TargetDir"
  }

  Copy-Item -Path $SourceFile -Destination $TargetFile -Force
  Write-Log "Copied json to target file."

  Set-Location $ProjectRoot

  git add "public/data/predictions/saved-predictions.generated.json"

  git diff --cached --quiet
  if ($LASTEXITCODE -eq 0) {
    Write-Log "No git changes. Skip commit and push."
    return
  }

  $commitTime = Get-Date -Format "yyyy-MM-dd HH:mm"
  git commit -m "Update saved prediction public data $commitTime"

  if ($LASTEXITCODE -ne 0) {
    Write-Log "git commit failed."
    return
  }

  git push

  if ($LASTEXITCODE -eq 0) {
    Write-Log "git push completed. Reload iPhone page after a short wait."
  } else {
    Write-Log "git push failed."
  }
}

Write-Log "Watcher started."
Write-Log "Download directory: $DownloadDir"
Write-Log "Target file: $TargetFile"
Write-Log "Watching saved-predictions.generated*.json"
Write-Log "Press Ctrl + C to stop."

$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $DownloadDir
$watcher.Filter = "saved-predictions.generated*.json"
$watcher.IncludeSubdirectories = $false
$watcher.EnableRaisingEvents = $true

$script:lastHandledPath = ""
$script:lastHandledAt = Get-Date "2000-01-01"

$action = {
  $path = $Event.SourceEventArgs.FullPath

  $now = Get-Date
  if ($path -eq $script:lastHandledPath -and (($now - $script:lastHandledAt).TotalSeconds -lt 3)) {
    return
  }

  $script:lastHandledPath = $path
  $script:lastHandledAt = $now

  Start-Sleep -Seconds 1

  Write-Log "Detected json: $path"
  Publish-PredictionJson -SourceFile $path
}

Register-ObjectEvent $watcher Created -Action $action | Out-Null
Register-ObjectEvent $watcher Changed -Action $action | Out-Null
Register-ObjectEvent $watcher Renamed -Action $action | Out-Null

while ($true) {
  Start-Sleep -Seconds 2
}