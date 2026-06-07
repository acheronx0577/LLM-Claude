param(
  [Alias("p")]
  [string]$Prompt,
  [switch]$Interactive,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Rest
)

$bun = Join-Path $env:USERPROFILE ".bun\bin\bun.exe"

if (-not (Test-Path $bun)) {
  Write-Error "Bun not found at $bun. Install from https://bun.sh"
  exit 1
}

Set-Location $PSScriptRoot

if ($Interactive -or ($Rest -contains "-i") -or ($Rest -contains "--chat")) {
  & $bun run "$PSScriptRoot\app\main.ts" -i
  exit $LASTEXITCODE
}

if (-not $Prompt) {
  if ($Rest.Count -ge 2 -and $Rest[0] -eq "-p") {
    $Prompt = ($Rest[1..($Rest.Count - 1)] -join " ").Trim()
  } elseif ($Rest.Count -ge 1) {
    $Prompt = ($Rest -join " ").Trim()
  }
}

if (-not $Prompt) {
  & $bun run "$PSScriptRoot\app\main.ts" -i
  exit $LASTEXITCODE
}

& $bun run "$PSScriptRoot\app\main.ts" -p $Prompt
