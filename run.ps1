param(
  [Alias("p")]
  [string]$Prompt,
  [switch]$Interactive,
  [switch]$Plain,
  [switch]$Tui,
  [switch]$Acp,
  [Parameter(ValueFromRemainingArguments = $true)]