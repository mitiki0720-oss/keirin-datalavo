param(
  [Parameter(Mandatory = $true)]
  [string]$ArchivePath,

  [Parameter(Mandatory = $true)]
  [string]$DestinationPath,

  [Parameter(Mandatory = $true)]
  [string]$AllowedRoot
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Get-NormalizedFullPath([string]$PathValue) {
  return [System.IO.Path]::GetFullPath($PathValue)
}

function Test-IsWithin([string]$Candidate, [string]$Root) {
  $normalizedRoot = (Get-NormalizedFullPath $Root).TrimEnd(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
  ) + [System.IO.Path]::DirectorySeparatorChar
  $normalizedCandidate = Get-NormalizedFullPath $Candidate
  return $normalizedCandidate.StartsWith(
    $normalizedRoot,
    [System.StringComparison]::OrdinalIgnoreCase
  )
}

$archiveFullPath = Get-NormalizedFullPath $ArchivePath
$destinationFullPath = Get-NormalizedFullPath $DestinationPath
$allowedFullPath = Get-NormalizedFullPath $AllowedRoot

if (-not (Test-Path -LiteralPath $archiveFullPath -PathType Leaf)) {
  throw "ZIP archive not found: $archiveFullPath"
}
if ([System.IO.Path]::GetExtension($archiveFullPath) -ne '.zip') {
  throw "Archive must use the .zip extension: $archiveFullPath"
}
if (-not (Test-IsWithin $archiveFullPath $allowedFullPath)) {
  throw "ZIP archive must remain under private-input/kurari-ex: $archiveFullPath"
}
if (-not (Test-IsWithin $destinationFullPath $allowedFullPath)) {
  throw "ZIP destination must remain under private-input/kurari-ex: $destinationFullPath"
}

$archive = [System.IO.Compression.ZipFile]::OpenRead($archiveFullPath)
try {
  $validatedEntries = [System.Collections.Generic.List[object]]::new()
  $targetPaths = [System.Collections.Generic.HashSet[string]]::new(
    [System.StringComparer]::OrdinalIgnoreCase
  )
  $ignoredEntryCount = 0
  $eligibleEntries = @(
    $archive.Entries | Where-Object {
      -not [string]::IsNullOrWhiteSpace($_.Name) -and
      [System.IO.Path]::GetExtension($_.FullName).ToLowerInvariant() -in @('.txt', '.md')
    }
  )
  $topSegments = @(
    $eligibleEntries | ForEach-Object {
      $_.FullName.Replace('\', '/').Split('/')[0]
    } | Sort-Object -Unique
  )
  $stripTopSegment = (
    $topSegments.Count -eq 1 -and
    $eligibleEntries.Count -gt 0 -and
    @(
      $eligibleEntries | Where-Object {
        $parts = $_.FullName.Replace('\', '/').Split('/')
        $parts.Count -lt 3 -or $parts[1] -notmatch '^\d{4}-\d{2}-\d{2}$'
      }
    ).Count -eq 0
  )

  foreach ($entry in $archive.Entries) {
    $entryName = $entry.FullName.Replace('\', '/')
    if ([string]::IsNullOrWhiteSpace($entryName) -or $entryName.EndsWith('/')) {
      continue
    }
    if (
      $entryName.StartsWith('/') -or
      $entryName.StartsWith('\') -or
      $entryName -match '^[A-Za-z]:' -or
      $entryName.IndexOf([char]0) -ge 0
    ) {
      throw "Unsafe ZIP entry path: $entryName"
    }

    $segments = $entryName.Split(
      [char[]]@('/', '\'),
      [System.StringSplitOptions]::RemoveEmptyEntries
    )
    if ($segments -contains '..') {
      throw "ZIP slip entry rejected: $entryName"
    }

    $extension = [System.IO.Path]::GetExtension($entryName).ToLowerInvariant()
    if ($extension -notin @('.txt', '.md')) {
      $ignoredEntryCount += 1
      continue
    }

    $normalizedEntryName = if ($stripTopSegment) {
      $entryName.Substring($entryName.IndexOf('/') + 1)
    } else {
      $entryName
    }
    $relativePlatformPath = $normalizedEntryName.Replace(
      '/',
      [System.IO.Path]::DirectorySeparatorChar
    )
    $targetPath = Get-NormalizedFullPath (
      [System.IO.Path]::Combine($destinationFullPath, $relativePlatformPath)
    )
    if (-not (Test-IsWithin $targetPath $destinationFullPath)) {
      throw "ZIP slip target rejected: $entryName"
    }
    if (-not $targetPaths.Add($targetPath)) {
      throw "Duplicate ZIP target rejected: $entryName"
    }

    $validatedEntries.Add([pscustomobject]@{
      Entry = $entry
      EntryName = $entryName
      NormalizedEntryName = $normalizedEntryName
      TargetPath = $targetPath
    })
  }

  [System.IO.Directory]::CreateDirectory($destinationFullPath) | Out-Null
  $utf8Validator = [System.Text.UTF8Encoding]::new($false, $true)
  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  try {
    $writtenCount = 0
    $unchangedCount = 0

    foreach ($item in $validatedEntries) {
      $memory = [System.IO.MemoryStream]::new()
      try {
        $entryStream = $item.Entry.Open()
        try {
          $entryStream.CopyTo($memory)
        } finally {
          $entryStream.Dispose()
        }
        $bytes = $memory.ToArray()
        $null = $utf8Validator.GetString($bytes)

        $shouldWrite = $true
        if ([System.IO.File]::Exists($item.TargetPath)) {
          $existingBytes = [System.IO.File]::ReadAllBytes($item.TargetPath)
          $incomingHash = [System.BitConverter]::ToString($sha256.ComputeHash($bytes))
          $existingHash = [System.BitConverter]::ToString($sha256.ComputeHash($existingBytes))
          if ($incomingHash -eq $existingHash) {
            $shouldWrite = $false
          }
        }

        if ($shouldWrite) {
          $parent = [System.IO.Path]::GetDirectoryName($item.TargetPath)
          [System.IO.Directory]::CreateDirectory($parent) | Out-Null
          [System.IO.File]::WriteAllBytes($item.TargetPath, $bytes)
          $writtenCount += 1
        } else {
          $unchangedCount += 1
        }
      } finally {
        $memory.Dispose()
      }
    }
  } finally {
    $sha256.Dispose()
  }

  [pscustomobject]@{
    archivePath = $archiveFullPath
    destinationPath = $destinationFullPath
    eligibleEntryCount = $validatedEntries.Count
    ignoredEntryCount = $ignoredEntryCount
    writtenCount = $writtenCount
    unchangedCount = $unchangedCount
    strippedTopDirectory = if ($stripTopSegment) { $topSegments[0] } else { $null }
  } | ConvertTo-Json -Compress
} finally {
  $archive.Dispose()
}
