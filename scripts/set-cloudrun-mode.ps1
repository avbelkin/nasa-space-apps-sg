<#
.SYNOPSIS
Toggles the Earth Fire Calendar Cloud Run backend between warm (min-instances=1) and
hibernate (min-instances=0) modes and syncs GCP_MIN_INSTANCES in GitHub Actions.

.DESCRIPTION
Use 'warm' during active hackathon development and final judging checks to keep an instance
warm (zero cold starts, persistent 12-hour in-memory CelesTrak TLE and FIRMS caches).
Use 'hibernate' between hackathon submission and final checks so idle compute drops to zero
while keeping the HTTPS endpoint live on demand (--cpu-boost).

.PARAMETER Mode
Target Cloud Run scaling mode: 'warm' (min-instances=1) or 'hibernate' (min-instances=0).

.PARAMETER ProjectId
Target Google Cloud Project ID. Defaults to earth-fire-calendar-sg.

.PARAMETER Region
Cloud Run region. Defaults to asia-southeast1.

.PARAMETER ServiceName
Cloud Run service name. Defaults to earth-fire-calendar-api.

.PARAMETER GitHubRepo
GitHub repository in owner/repo format where GCP_MIN_INSTANCES is synced.
Defaults to avbelkin/nasa-space-apps-sg.

.PARAMETER SkipGitHubVarSync
Updates the live Cloud Run service only without updating GCP_MIN_INSTANCES on GitHub.

.EXAMPLE
.\scripts\set-cloudrun-mode.ps1 -Mode hibernate

.EXAMPLE
.\scripts\set-cloudrun-mode.ps1 -Mode warm
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("warm", "hibernate")]
    [string]$Mode,

    [ValidateNotNullOrEmpty()]
    [string]$ProjectId = "earth-fire-calendar-sg",

    [ValidateNotNullOrEmpty()]
    [string]$Region = "asia-southeast1",

    [ValidateNotNullOrEmpty()]
    [string]$ServiceName = "earth-fire-calendar-api",

    [ValidateNotNullOrEmpty()]
    [string]$GitHubRepo = "avbelkin/nasa-space-apps-sg",

    [switch]$SkipGitHubVarSync
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Resolve-CliExecutable {
    param(
        [Parameter(Mandatory = $true)]
        [string]$CommandName,
        [string[]]$FallbackPaths = @()
    )

    $existing = Get-Command $CommandName -ErrorAction SilentlyContinue
    if ($null -ne $existing) {
        return $existing.Source
    }

    $candidates = New-Object System.Collections.Generic.List[string]
    foreach ($scope in @("User", "Machine")) {
        $scopePath = [Environment]::GetEnvironmentVariable("Path", $scope)
        if (-not [string]::IsNullOrWhiteSpace($scopePath)) {
            foreach ($dir in ($scopePath -split ';')) {
                $trimmedDir = $dir.Trim().Trim('"')
                if (-not [string]::IsNullOrWhiteSpace($trimmedDir)) {
                    foreach ($suffix in @(".exe", ".cmd", ".bat", "")) {
                        $candidates.Add((Join-Path $trimmedDir "$CommandName$suffix"))
                    }
                }
            }
        }
    }

    foreach ($fallback in $FallbackPaths) {
        if (-not [string]::IsNullOrWhiteSpace($fallback)) {
            $candidates.Add($fallback)
        }
    }

    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            $parentDir = Split-Path -Path $candidate -Parent
            $currentEntries = ($env:PATH -split ';') | ForEach-Object { $_.Trim().TrimEnd('\').ToLowerInvariant() }
            if ($currentEntries -notcontains $parentDir.TrimEnd('\').ToLowerInvariant()) {
                $env:PATH = "$parentDir;$env:PATH"
            }
            return $candidate
        }
    }

    return $null
}

function Invoke-CheckedCli {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Executable,
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    # Temporarily keep native stderr non-terminating in Windows PowerShell 5.1.
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $stdout = & $Executable @Arguments
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousPreference
    }

    if ($exitCode -ne 0) {
        throw "$Executable $($Arguments -join ' ') failed with exit code $exitCode."
    }

    return $stdout
}

$minInstances = if ($Mode -eq "warm") { "1" } else { "0" }

Write-Step "Resolving CLI tools"
$resolvedGcloud = Resolve-CliExecutable -CommandName "gcloud" -FallbackPaths @(
    "C:\Program Files (x86)\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd",
    "C:\Program Files\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd",
    "$env:LOCALAPPDATA\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
)
if ([string]::IsNullOrWhiteSpace($resolvedGcloud)) {
    throw "Google Cloud CLI ('gcloud') was not found on PATH or standard install directories."
}
Write-Host "    Using gcloud: $resolvedGcloud" -ForegroundColor DarkGray

Write-Step "Switching Cloud Run service '$ServiceName' ($ProjectId / $Region) to '$Mode' (min-instances=$minInstances)"
$null = Invoke-CheckedCli -Executable "gcloud" -Arguments @(
    "run", "services", "update", $ServiceName,
    "--project=$ProjectId",
    "--region=$Region",
    "--min-instances=$minInstances",
    "--quiet"
)

if (-not $SkipGitHubVarSync) {
    if ($GitHubRepo -notmatch '^[^/\s]+/[^/\s]+$') {
        throw "GitHubRepo '$GitHubRepo' must be in 'owner/repo' format."
    }

    Write-Step "Syncing GCP_MIN_INSTANCES=$minInstances to GitHub Actions ($GitHubRepo)"
    $resolvedGh = Resolve-CliExecutable -CommandName "gh" -FallbackPaths @(
        "C:\Program Files\GitHub CLI\gh.exe",
        "C:\Program Files (x86)\GitHub CLI\gh.exe"
    )
    if ([string]::IsNullOrWhiteSpace($resolvedGh)) {
        throw "GitHub CLI ('gh') was not found on PATH or standard install directories."
    }

    $null = Invoke-CheckedCli -Executable "gh" -Arguments @("auth", "status")
    $null = Invoke-CheckedCli -Executable "gh" -Arguments @("variable", "set", "GCP_MIN_INSTANCES", "--body", $minInstances, "--repo", $GitHubRepo)
}

Write-Step "Verifying Cloud Run endpoint health"
$serviceUrlRaw = Invoke-CheckedCli -Executable "gcloud" -Arguments @(
    "run", "services", "describe", $ServiceName,
    "--project=$ProjectId",
    "--region=$Region",
    "--format=value(status.url)",
    "--quiet"
)
$serviceUrl = ($serviceUrlRaw | Out-String).Trim()
if ([string]::IsNullOrWhiteSpace($serviceUrl)) {
    throw "Could not resolve Cloud Run URL for service '$ServiceName'."
}

$healthUrl = "$serviceUrl/health"
Write-Host "    Probing $healthUrl"
$healthResponse = Invoke-WebRequest -Uri $healthUrl -Method Get -UseBasicParsing -TimeoutSec 30
Write-Host "    HTTP $($healthResponse.StatusCode): $($healthResponse.Content)" -ForegroundColor Green

Write-Host ""
Write-Host "Done: '$ServiceName' is now in '$Mode' mode (min-instances=$minInstances)." -ForegroundColor Green
if ($Mode -eq "hibernate") {
    Write-Host "Idle compute cost is now zero; the first request after idle triggers an on-demand wake-up (~1-3s with cpu-boost)." -ForegroundColor DarkGray
    Write-Host "Run '.\scripts\set-cloudrun-mode.ps1 -Mode warm' before final judging checks." -ForegroundColor DarkGray
}
