param(
  [Alias("p")]
  [string]$Prompt,
  [switch]$Interactive,
  [switch]$Plain,
  [switch]$Tui,
  [switch]$Acp,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Rest
)

$bun = Join-Path $env:USERPROFILE ".bun\bin\bun.exe"

if (-not (Test-Path $bun)) {
  Write-Error "Bun not found at $bun. Install from https://bun.sh"
  exit 1
}

Set-Location $PSScriptRoot

if ($Acp -or ($Rest -contains "--acp")) {
  & $bun "$PSScriptRoot\app\main.ts" --acp
  exit $LASTEXITCODE
}

if ($Interactive -or ($Rest -contains "-i") -or ($Rest -contains "--chat")) {
  if ($Plain -or ($Rest -contains "--plain")) {
    & $bun "$PSScriptRoot\app\main.ts" -i --plain
  } else {
    & $bun "$PSScriptRoot\app\main.ts" -i --tui
  }
  exit $LASTEXITCODE
}

if (-not $Prompt) {
  if ($Rest.Count -ge 2 -and $Rest[0] -eq "-p") {
    $Prompt = ($Rest[1..($Rest.Count - 1)] -join " ").Trim()
  } elseif ($Rest.Count -ge 1) {
    $Prompt = ($Rest -join " ").Trim()
  }