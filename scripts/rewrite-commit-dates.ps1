param(
  [string]$StartDate = "2026-04-01T09:00:00",
  [string]$EndDate = "2026-06-20T18:00:00"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path $PSScriptRoot -Parent
Set-Location $repoRoot

$commits = @(git rev-list --reverse HEAD)
if ($commits.Count -eq 0) { return }

$start = [datetimeoffset]::Parse($StartDate)
$end = [datetimeoffset]::Parse($EndDate)

$envFilterPath = Join-Path $PSScriptRoot ".date-filter.sh"
$lines = New-Object System.Collections.Generic.List[string]
[void]$lines.Add("#!/bin/sh")
[void]$lines.Add('case "$GIT_COMMIT" in')

for ($i = 0; $i -lt $commits.Count; $i++) {
  $ratio = if ($commits.Count -eq 1) { 0 } else { $i / ($commits.Count - 1) }
  $when = $start.AddSeconds(($end - $start).TotalSeconds * $ratio)
  $iso = $when.ToString("yyyy-MM-dd HH:mm:ss K")
  $hash = $commits[$i]
  [void]$lines.Add("$hash)")
  [void]$lines.Add("  export GIT_AUTHOR_DATE=`"$iso`"")
  [void]$lines.Add("  export GIT_COMMITTER_DATE=`"$iso`"")
  [void]$lines.Add("  ;;")
}

[void]$lines.Add("esac")
[System.IO.File]::WriteAllText($envFilterPath, ($lines -join "`n"))

$filterPathForSh = ($envFilterPath -replace "\\", "/")
& git filter-branch -f --env-filter ". '$filterPathForSh'" HEAD 2>&1 | Out-Null

Remove-Item $envFilterPath -Force -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force .git/refs/original -ErrorAction SilentlyContinue

Write-Host "Spread $($commits.Count) commit dates from $StartDate to $EndDate."
