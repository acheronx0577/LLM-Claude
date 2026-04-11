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