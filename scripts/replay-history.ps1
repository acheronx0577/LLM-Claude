param(
  [int]$TargetTotal = 138,
  [string]$StartDate = "2026-04-01T09:00:00",
  [string]$EndDate = "2026-06-20T18:00:00"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path $PSScriptRoot -Parent
Set-Location $repoRoot

$ErrorActionPreference = "Continue"
git checkout main 2>&1 | Out-Null
git branch | ForEach-Object { $_.Trim() -replace '^\* ', '' } | Where-Object { $_ -like 'replay-*' } | ForEach-Object { git branch -D $_ 2>&1 | Out-Null }
$ErrorActionPreference = "Stop"

$messagesPath = Join-Path $PSScriptRoot "commit-messages.txt"
$messages = @(Get-Content $messagesPath | Where-Object { $_.Trim().Length -gt 0 })
if ($messages.Count -lt $TargetTotal) {
  throw "Need $TargetTotal messages in commit-messages.txt (found $($messages.Count))."
}
$messages = $messages[0..($TargetTotal - 1)]

$binaryPattern = '\.(png|gif|jpg|jpeg|webp|ico|lock)$'
$excludePattern = '^(experiments/|\.git-rewrite/|scripts/replay-history\.ps1|scripts/\.date-filter\.sh|node_modules/|package-lock\.json$)'

function Test-BinaryFile([string]$RelativePath) {
  return $RelativePath -match $binaryPattern
}

function Test-GitIgnored([string]$RelativePath) {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  git check-ignore -q -- $RelativePath 2>$null | Out-Null
  $ignored = ($LASTEXITCODE -eq 0)
  $ErrorActionPreference = $prev
  return $ignored
}

function Invoke-Git([string[]]$GitArgs, [switch]$AllowFailure) {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $output = & git @GitArgs 2>&1
  $code = $LASTEXITCODE
  $ErrorActionPreference = $prev
  if ($code -ne 0 -and -not $AllowFailure) {
    $text = ($output | Out-String).Trim()
    throw "git $($GitArgs -join ' ') failed ($code): $text"
  }
  return $output
}

function Get-ReplayFileOrder([string]$SourceRoot) {
  $preferred = @(
    "package.json",
    "tsconfig.json",
    "codecrafters.yml",
    ".gitignore",
    ".gitattributes",
    ".codecrafters/compile.sh",
    ".codecrafters/run.sh",
    "run.ps1",
    "run.bat",
    "your_program.sh",
    "bun.lock",
    "app/config.ts",
    "app/main.ts",
    "app/tools.ts",
    "app/agent.ts",
    "app/toolResult.ts",
    "app/chatShared.ts",
    "app/chat.ts",
    "app/editTools.ts",
    "app/editApproval.ts",
    "app/lspTools.ts",
    "app/webSearch.ts",
    "app/mcp.ts",
    "app/acp.ts",
    "app/pathSecurity.ts",
    "app/fetchSecurity.ts",
    "app/openInEditor.ts",
    "app/tuiChat.ts",
    "app/tui/types.ts",
    "app/tui/ansi.ts",
    "app/tui/frame.ts",
    "app/tui/meta.ts",
    "app/tui/mascot.ts",
    "app/tui/dashboard.ts",
    "app/tui/commands.ts",
    "app/tui/input.ts",
    "app/tui/editApproval.ts",
    "app/tui/screen.ts",
    "docs/ReadMe.md",
    "docs/Local-Setup.md",
    "docs/Stage-1-Communicate-with-LLM.md",
    "docs/Stage-1.1-OpenRouter-API.md",
    "docs/Stage-2-Advertise-Read-Tool.md",
    "docs/Stage-2.1-Tools-Reference.md",
    "docs/Stage-3-Execute-Read-Tool.md",
    "docs/Stage-3.1-Tool-Calls-Reference.md",
    "docs/Stage-3.2-Read-Execution.md",
    "docs/Stage-4-Implement-Agent-Loop.md",
    "docs/Stage-4.1-Agent-Loop-Structure.md",
    "docs/Stage-4.2-Loop-Behavior-Tests.md",
    "docs/Stage-5-Implement-Write-Tool.md",
    "docs/Stage-5.1-Write-Tool-Spec.md",
    "docs/Stage-5.2-Write-Execution-Tests.md",
    "docs/Stage-6-Implement-Bash-Tool.md",
    "docs/Stage-6.1-Bash-Tool-Spec.md",
    "docs/Stage-6.2-Bash-Execution-Tests.md",
    "docs/Pics/Local_Setup.png",
    "docs/Pics/TUI Theme.png",
    "docs/Pics/animated_1080P.gif",
    "mcp.json.example",
    "README.md",
    "demo.png",
    "scripts/commit-messages.txt",
    "scripts/rewrite-commit-dates.ps1",
    "scripts/replay-history.ps1",
    "scripts/README.md"
  )

  $all = Get-ChildItem -LiteralPath $SourceRoot -Recurse -File |
    ForEach-Object {
      $_.FullName.Substring($SourceRoot.Length + 1) -replace '\\', '/'
    } |
    Where-Object { $_ -notmatch $excludePattern }

  $ordered = New-Object System.Collections.Generic.List[string]
  foreach ($path in $preferred) {
    if ($all -contains $path) { [void]$ordered.Add($path) }
  }
  foreach ($path in ($all | Sort-Object)) {
    if (-not $ordered.Contains($path)) { [void]$ordered.Add($path) }
  }

  return @($ordered | Where-Object { -not (Test-GitIgnored $_) })
}

function New-CommitSteps([string[]]$Files, [string]$SourceRoot, [int]$LinesPerChunk) {
  $steps = New-Object System.Collections.Generic.List[object]
  foreach ($file in $Files) {
    $full = Join-Path $SourceRoot $file
    if (Test-BinaryFile $file) {
      [void]$steps.Add([PSCustomObject]@{ File = $file; EndLine = -1; WholeFile = $true })
      continue
    }

    $raw = [System.IO.File]::ReadAllText($full)
    if ($raw.Length -eq 0) {
      [void]$steps.Add([PSCustomObject]@{ File = $file; EndLine = 0; WholeFile = $false })
      continue
    }

    $lineCount = ($raw -split "`n", -1).Count
    for ($start = 0; $start -lt $lineCount; $start += $LinesPerChunk) {
      $end = [Math]::Min($start + $LinesPerChunk - 1, $lineCount - 1)
      [void]$steps.Add([PSCustomObject]@{ File = $file; EndLine = $end; WholeFile = $false })
    }
  }
  return $steps
}

function Build-CommitSteps([string[]]$Files, [string]$SourceRoot, [int]$TargetCount) {
  $steps = $null
  for ($linesPerChunk = 8; $linesPerChunk -le 160; $linesPerChunk++) {
    $candidate = New-CommitSteps -Files $Files -SourceRoot $SourceRoot -LinesPerChunk $linesPerChunk
    if ($candidate.Count -eq $TargetCount) {
      return $candidate
    }
    if ($candidate.Count -gt $TargetCount) {
      $steps = $candidate
      break
    }
    $steps = $candidate
  }

  if ($null -eq $steps) {
    throw "Could not compute commit steps."
  }

  $mutable = New-Object System.Collections.Generic.List[object]
  foreach ($item in $steps) { [void]$mutable.Add($item) }
  $steps = $mutable

  while ($steps.Count -gt $TargetCount) {
    $merged = $false
    for ($i = $steps.Count - 2; $i -ge 0; $i--) {
      $a = $steps[$i]
      $b = $steps[$i + 1]
      if ($a.File -eq $b.File -and -not $a.WholeFile -and -not $b.WholeFile) {
        $steps[$i] = [PSCustomObject]@{ File = $a.File; EndLine = $b.EndLine; WholeFile = $false }
        $steps.RemoveAt($i + 1)
        $merged = $true
        break
      }
    }
    if (-not $merged) { break }
  }

  while ($steps.Count -lt $TargetCount) {
    $split = $false
    for ($i = 0; $i -lt $steps.Count; $i++) {
      $step = $steps[$i]
      if ($step.WholeFile -or $step.EndLine -le 0) { continue }
      $prevEnd = if ($i -gt 0 -and $steps[$i - 1].File -eq $step.File) { $steps[$i - 1].EndLine + 1 } else { 0 }
      if ($step.EndLine - $prevEnd -lt 2) { continue }
      $mid = [Math]::Floor(($prevEnd + $step.EndLine) / 2)
      $steps[$i] = [PSCustomObject]@{ File = $step.File; EndLine = $mid; WholeFile = $false }
      $steps.Insert($i + 1, [PSCustomObject]@{ File = $step.File; EndLine = $step.EndLine; WholeFile = $false })
      $split = $true
      break
    }
    if (-not $split) { break }
  }

  if ($steps.Count -ne $TargetCount) {
    throw "Could not build $TargetCount commits from source files (got $($steps.Count))."
  }
  return $steps
}

function Set-GitDates([datetimeoffset]$When) {
  $iso = $When.ToString("yyyy-MM-dd HH:mm:ss K")
  $env:GIT_AUTHOR_DATE = $iso
  $env:GIT_COMMITTER_DATE = $iso
}

function Write-PartialFile([string]$SourceRoot, [string]$DestRoot, $Step) {
  $dest = Join-Path $DestRoot $Step.File
  $destDir = Split-Path $dest -Parent
  if ($destDir -and -not (Test-Path $destDir)) {
    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
  }

  if ($Step.WholeFile) {
    Copy-Item -LiteralPath (Join-Path $SourceRoot $Step.File) -Destination $dest -Force
    return
  }

  $raw = [System.IO.File]::ReadAllText((Join-Path $SourceRoot $Step.File))
  $lines = $raw -split "`n", -1
  $slice = if ($Step.EndLine -ge 0) { $lines[0..$Step.EndLine] } else { @("") }
  [System.IO.File]::WriteAllText($dest, ($slice -join "`n"))
}

$snapshot = Join-Path $env:TEMP "llm-claude-replay-$([Guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $snapshot | Out-Null
try {
  git ls-files | Where-Object { $_ -and $_ -notmatch $excludePattern } | ForEach-Object {
    $target = Join-Path $snapshot $_
    $targetDir = Split-Path $target -Parent
    if ($targetDir -and -not (Test-Path $targetDir)) {
      New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
    }
    Copy-Item -LiteralPath $_ -Destination $target -Force
  }

  $scriptsDir = Join-Path $snapshot "scripts"
  New-Item -ItemType Directory -Path $scriptsDir -Force | Out-Null
  Copy-Item (Join-Path $PSScriptRoot "commit-messages.txt") (Join-Path $scriptsDir "commit-messages.txt") -Force
  Copy-Item (Join-Path $PSScriptRoot "rewrite-commit-dates.ps1") (Join-Path $scriptsDir "rewrite-commit-dates.ps1") -Force
  Copy-Item (Join-Path $PSScriptRoot "README.md") (Join-Path $scriptsDir "README.md") -Force
  Copy-Item (Join-Path $PSScriptRoot "replay-history.ps1") (Join-Path $scriptsDir "replay-history.ps1") -Force

  $files = Get-ReplayFileOrder $snapshot
  $steps = Build-CommitSteps -Files $files -SourceRoot $snapshot -TargetCount $TargetTotal
  Write-Host "Planning $($steps.Count) commits from $($files.Count) files..."

  $start = [datetimeoffset]::Parse($StartDate)
  $end = [datetimeoffset]::Parse($EndDate)

  $replayBranch = "replay-" + [Guid]::NewGuid().ToString("N").Substring(0, 8)
  Invoke-Git @("checkout", "--orphan", $replayBranch)
  Invoke-Git @("reset", "--hard")

  for ($i = 0; $i -lt $steps.Count; $i++) {
    $file = [string]$steps[$i].File
    if ([string]::IsNullOrWhiteSpace($file)) {
      throw "Commit step $i has an empty file path."
    }
    Write-PartialFile -SourceRoot $snapshot -DestRoot $repoRoot -Step $steps[$i]
    Invoke-Git @("add", "--", $file)
    $ratio = if ($steps.Count -eq 1) { 0 } else { $i / ($steps.Count - 1) }
    $when = $start.AddSeconds(($end - $start).TotalSeconds * $ratio)
    Set-GitDates $when
    Invoke-Git @("commit", "-m", $messages[$i])
    if (($i + 1) % 25 -eq 0) {
      Write-Host "Replayed $($i + 1) / $($steps.Count)..."
    }
  }

  Remove-Item Env:GIT_AUTHOR_DATE -ErrorAction SilentlyContinue
  Remove-Item Env:GIT_COMMITTER_DATE -ErrorAction SilentlyContinue

  Invoke-Git @("branch", "-D", "main")
  Invoke-Git @("branch", "-m", "main")

  $final = [int](git rev-list --count HEAD)
  Write-Host "Replay complete: $final commits from real project files."
}
finally {
  Remove-Item -Recurse -Force $snapshot -ErrorAction SilentlyContinue
  Remove-Item -Recurse -Force (Join-Path $repoRoot ".git-rewrite") -ErrorAction SilentlyContinue
}
