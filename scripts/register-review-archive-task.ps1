param(
  [string]$TaskName = 'KeirinReviewArchivePublish',
  [string]$Time = '08:33'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$publishScriptPath = Join-Path $projectRoot 'scripts\publish-review-archives.ps1'

if (-not (Test-Path $publishScriptPath)) {
  throw "Publish script not found: $publishScriptPath"
}

$triggerTime = [DateTime]::ParseExact($Time, 'HH:mm', [System.Globalization.CultureInfo]::InvariantCulture)
$userId = if ($env:USERDOMAIN) {
  "$($env:USERDOMAIN)\$($env:USERNAME)"
}
else {
  $env:USERNAME
}

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$publishScriptPath`""
$trigger = New-ScheduledTaskTrigger -Daily -At $triggerTime
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable
$description = 'Publishes review TXT archives and review index.json to GitHub Pages.'

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description $description -User $userId -Force | Out-Null

Write-Host "Registered scheduled task '$TaskName' for daily $Time."