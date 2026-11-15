[CmdletBinding()]
param(
    [string]$Project = 'earth-fire-calendar-sg',
    [string]$Database = 'weather-cache'
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($env:FIRMS_MAP_KEY)) {
    $userFirmsKey = [Environment]::GetEnvironmentVariable('FIRMS_MAP_KEY', 'User')
    if (![string]::IsNullOrWhiteSpace($userFirmsKey)) {
        $env:FIRMS_MAP_KEY = $userFirmsKey
    }
}

$gcloud = Get-Command gcloud -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -First 1
if (!$gcloud) {
    $candidates = @(
        'C:\Program Files (x86)\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd',
        (Join-Path $env:LOCALAPPDATA 'Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd')
    )
    $gcloud = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}
if (!$gcloud) {
    throw 'Google Cloud CLI (gcloud) was not found on PATH or in standard installation folders.'
}

$workerAssembly = Join-Path $PSScriptRoot '../backend/NasaSpaceApps.Api/bin/Release/net10.0/NasaSpaceApps.Api.dll'
if (!(Test-Path -LiteralPath $workerAssembly)) {
    throw 'Build the backend in Release mode before starting the local worker.'
}

$dotnet = (Get-Command dotnet -ErrorAction Stop).Source
$resolvedAssembly = (Resolve-Path -LiteralPath $workerAssembly).ProviderPath

$firstToken = (& $gcloud auth print-access-token --quiet | Select-Object -First 1)
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($firstToken)) {
    throw 'Sign in to Google Cloud with an account that can read and write the weather-cache database.'
}

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $dotnet
$psi.Arguments = ('"{0}" weather-worker "{1}" "{2}"' -f $resolvedAssembly, $Project, $Database)
$psi.UseShellExecute = $false
$psi.RedirectStandardInput = $true

# Stream refreshed tokens via StandardInput so both Windows PowerShell 5.1 and PowerShell 7 launch dotnet immediately.
$process = [System.Diagnostics.Process]::Start($psi)
try {
    $process.StandardInput.WriteLine($firstToken.Trim())
    $process.StandardInput.Flush()
    while (!$process.WaitForExit(600000)) {
        $nextToken = (& $gcloud auth print-access-token --quiet | Select-Object -First 1)
        if ($LASTEXITCODE -eq 0 -and ![string]::IsNullOrWhiteSpace($nextToken)) {
            $process.StandardInput.WriteLine($nextToken.Trim())
            $process.StandardInput.Flush()
        }
        else {
            Write-Warning 'Google access-token refresh failed. The launcher will retry.'
        }
    }
}
finally {
    if (!$process.HasExited) {
        try { $process.StandardInput.Close() } catch {}
        if (!$process.WaitForExit(5000)) {
            $process.Kill()
        }
    }
}
exit $process.ExitCode
