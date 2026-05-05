$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$script:LogPath = Join-Path $PSScriptRoot 'publish-review-archives-log.txt'

function Write-Log {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Message
  )

  $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  $line = "[$timestamp] $Message"
  Write-Host $line
  [System.IO.File]::AppendAllText($script:LogPath, $line + [Environment]::NewLine, [System.Text.Encoding]::UTF8)
}

function Invoke-ExternalCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,
    [string[]]$Arguments = @(),
    [switch]$AllowFailure
  )

  $commandText = (@($FilePath) + $Arguments) -join ' '
  Write-Log "COMMAND: $commandText"
  $output = & $FilePath @Arguments 2>&1
  $exitCode = $LASTEXITCODE
  if ($output) {
    foreach ($line in $output) {
      Write-Log "$line"
    }
  }

  if (-not $AllowFailure -and $exitCode -ne 0) {
    throw "Command failed with exit code ${exitCode}: $commandText"
  }

  return @($output)
}

function Get-AllowedReviewPaths {
  $paths = New-Object System.Collections.Generic.List[string]

  $indexPath = 'public/data/reviews/index.json'
  if (Test-Path $indexPath) {
    $paths.Add($indexPath)
  }

  $reviewFiles = Get-ChildItem -Path 'public/data/reviews' -Recurse -File |
    Where-Object {
      $_.Extension -eq '.txt' -and
      $_.FullName -notmatch '\.txt\.txt$' -and
      $_.Directory.Name -match '^\d{4}-\d{2}-\d{2}$'
    } |
    ForEach-Object {
      (Resolve-Path -LiteralPath $_.FullName -Relative).Replace('.\\', '').Replace('\\', '/')
    }

  foreach ($path in $reviewFiles) {
    $paths.Add($path)
  }

  return $paths.ToArray()
}

function Test-AllowedStagedPath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  if ($Path -eq 'public/data/reviews/index.json') {
    return $true
  }

  return $Path -match '^public/data/reviews/\d{4}-\d{2}-\d{2}/[^/]+\.(txt)$' -and $Path -notmatch '\.txt\.txt$'
}

function Assert-NoUnexpectedStagedFiles {
  $stagedFiles = git diff --cached --name-only
  if ($LASTEXITCODE -ne 0) {
    throw 'Failed to inspect staged files.'
  }

  $stagedFiles = @($stagedFiles | Where-Object { $_ -and $_.Trim() -ne '' })
  if (@($stagedFiles).Count -eq 0) {
    return @($stagedFiles)
  }

  $unexpected = @($stagedFiles | Where-Object { -not (Test-AllowedStagedPath $_) })
  if (@($unexpected).Count -gt 0) {
    foreach ($path in $unexpected) {
      Write-Log "UNEXPECTED STAGED FILE: $path"
    }
    throw 'Unexpected staged files detected. Stopping before commit.'
  }

  return @($stagedFiles)
}

function Stage-AllowedFiles {
  $allowedExisting = Get-AllowedReviewPaths
  if (@($allowedExisting).Count -gt 0) {
    & git add -- $allowedExisting
    if ($LASTEXITCODE -ne 0) {
      throw 'Failed to stage allowed review files.'
    }
  }

  $deletedCandidates = git ls-files --deleted -- 'public/data/reviews'
  if ($LASTEXITCODE -ne 0) {
    throw 'Failed to inspect deleted review files.'
  }

  $deletedAllowed = @($deletedCandidates | Where-Object { $_ -and (Test-AllowedStagedPath $_) })
  if (@($deletedAllowed).Count -gt 0) {
    & git add -u -- $deletedAllowed
    if ($LASTEXITCODE -ne 0) {
      throw 'Failed to stage deleted review files.'
    }
  }
}

function Main {
  $projectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
  Set-Location $projectRoot

  Write-Log '=== Review archive publish start ==='
  Write-Log "Project root: $($projectRoot.Path)"

  Assert-NoUnexpectedStagedFiles | Out-Null

  Invoke-ExternalCommand -FilePath 'node' -Arguments @('scripts/generate-review-index.mjs') | Out-Null

  $jsonRaw = Get-Content -Path 'public/data/reviews/index.json' -Raw -Encoding UTF8
  $json = $jsonRaw | ConvertFrom-Json
  $itemsCount = @($json.items).Count
  Write-Log "index.json JSON check: OK"
  Write-Log "index.json items: $itemsCount"

  $statusOutput = git status --short
  if ($LASTEXITCODE -ne 0) {
    throw 'Failed to read git status.'
  }
  if ($statusOutput) {
    foreach ($line in $statusOutput) {
      Write-Log "git status: $line"
    }
  }

  Stage-AllowedFiles
  $stagedFiles = @(Assert-NoUnexpectedStagedFiles)

  if (@($stagedFiles).Count -eq 0) {
    Write-Log 'No review archive changes.'
    return
  }

  Write-Log 'Staged files:'
  foreach ($path in $stagedFiles) {
    Write-Log "- $path"
  }

  $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm'
  $commitMessage = "Publish review archive files $timestamp"
  Invoke-ExternalCommand -FilePath 'git' -Arguments @('commit', '-m', $commitMessage) | Out-Null

  $commitHash = (git rev-parse HEAD).Trim()
  if ($LASTEXITCODE -ne 0) {
    throw 'Failed to read commit hash.'
  }
  Write-Log "Commit hash: $commitHash"

  Invoke-ExternalCommand -FilePath 'git' -Arguments @('pull', '--rebase', '--autostash', 'origin', 'main') | Out-Null

  Invoke-ExternalCommand -FilePath 'git' -Arguments @('push') | Out-Null

  Write-Log 'Review archive publish completed successfully.'
}

try {
  Main
  exit 0
}
catch {
  Write-Log "ERROR: $($_.Exception.Message)"
  exit 1
}