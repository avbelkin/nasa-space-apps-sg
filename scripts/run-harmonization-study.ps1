[CmdletBinding()]
param(
    [ValidateSet("export", "train", "all")]
    [string]$Command = "all",
    [int]$Days = 5,
    [string]$DataDir = "",
    [string]$ReportJson = "",
    [string]$UpdateUiModelsDir = "",
    [switch]$RefreshFirms,
    [switch]$RefreshTles
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if ([string]::IsNullOrWhiteSpace($DataDir)) {
    $DataDir = Join-Path $RepoRoot "artifacts\harmonization-dataset"
}
if ([string]::IsNullOrWhiteSpace($ReportJson)) {
    $ReportJson = Join-Path $RepoRoot "submission\working\weather-harmonization-study-2026-11-15.json"
}

$cliArgs = @(
    "run", "--project", (Join-Path $RepoRoot "backend\NasaSpaceApps.Harmonization"),
    "-c", "Release", "--", $Command,
    "--days", $Days,
    "--output-dir", $DataDir,
    "--data-dir", $DataDir,
    "--report-json", $ReportJson
)

if (-not [string]::IsNullOrWhiteSpace($UpdateUiModelsDir)) {
    $cliArgs += @("--update-ui-models", $UpdateUiModelsDir)
}
elseif ($Command -eq "all") {
    $cliArgs += @("--update-ui-models", (Join-Path $RepoRoot "ui\src\data"))
}

if ($RefreshFirms) { $cliArgs += "--refresh-firms" }
if ($RefreshTles) { $cliArgs += "--refresh-tles" }

Write-Host "Running: dotnet $($cliArgs -join ' ')"
& dotnet @cliArgs
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
