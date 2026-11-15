[CmdletBinding()]
param(
    [string]$Project = 'earth-fire-calendar-sg',
    [string]$Database = 'weather-cache'
)

$ErrorActionPreference = 'Stop'
$workerAssembly = Join-Path $PSScriptRoot '../backend/NasaSpaceApps.Api/bin/Release/net10.0/NasaSpaceApps.Api.dll'
if (!(Test-Path -LiteralPath $workerAssembly)) {
    throw 'Build the backend in Release mode before starting the local worker.'
}

$firstToken = gcloud auth print-access-token --quiet
if ($LASTEXITCODE -ne 0 -or !$firstToken) {
    throw 'Sign in to Google Cloud with an account that can read and write the weather-cache database.'
}

# Send refreshed tokens via a private pipe to the worker.
& {
    $firstToken
    while ($true) {
        Start-Sleep -Seconds 600
        $nextToken = gcloud auth print-access-token --quiet
        if ($LASTEXITCODE -eq 0 -and $nextToken) { $nextToken }
        else { Write-Warning 'Google access-token refresh failed. The launcher will retry.' }
    }
} | & dotnet $workerAssembly weather-worker $Project $Database
exit $LASTEXITCODE
