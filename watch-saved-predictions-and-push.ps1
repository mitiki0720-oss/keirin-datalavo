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
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
  }

  Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

function Invoke-GitCommand {
  param([string]$Command)

  Set-Location $ProjectRoot

  Write-Log "RUN: git $Command"

  $output = cmd /c "git $Command 2>&1"
  $exitCode = $LASTEXITCODE

  if ($output) {
    $output | ForEach-Object {
      Write-Log "GIT: $_"
    }
  }

  Write-Log "EXIT: $exitCode"

  return $exitCode
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

  try {
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

    $addExit = Invoke-GitCommand "add public/data/predictions/saved-predictions.generated.json"
    if ($addExit -ne 0) {
      Write-Log "git add failed."
      return
    }

    $diffExit = Invoke-GitCommand "diff --cached --quiet"

    if ($diffExit -eq 0) {
      Write-Log "No git changes. Skip commit and push."
      return
    }

    $commitTime = Get-Date -Format "yyyy-MM-dd HH:mm"
    $commitExit = Invoke-GitCommand "commit -m `"Update saved prediction public data $commitTime`""

    if ($commitExit -ne 0) {
      Write-Log "git commit failed."
      return
    }

        $pullExit = Invoke-GitCommand "pull --rebase --autostash origin main"

    if ($pullExit -ne 0) {
      Write-Log "git pull --rebase failed. Skip push."
      return
    }

    $pushExit = Invoke-GitCommand "push"

    if ($pushExit -eq 0) {
      Write-Log "git push completed. Reload iPhone page after a short wait."
    } else {
      Write-Log "git push failed."
    }
  } catch {
    Write-Log "ERROR: $($_.Exception.Message)"
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