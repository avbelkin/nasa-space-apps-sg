<#
.SYNOPSIS
Bootstraps Google Cloud Run, Artifact Registry, GitHub Actions OIDC, Secret Manager,
and optional Cloud Storage / Billing Budget alerts for Earth Fire Calendar.

.DESCRIPTION
Idempotently provisions the GCP infrastructure required by .github/workflows/deploy-backend.yml
on a Google Cloud project linked to a Cloud Billing account (such as one carrying
Google AI Ultra / Google Developer Program monthly credits).

.PARAMETER ProjectId
Target Google Cloud Project ID. Defaults to earth-fire-calendar-sg.

.PARAMETER BillingAccountId
Optional Cloud Billing Account ID (XXXXXX-XXXXXX-XXXXXX) holding your Google AI Ultra /
Google Developer Program monthly credits. Links the project to this billing account if provided.

.PARAMETER GitHubRepo
GitHub repository in owner/repo format allowed to authenticate via Workload Identity Federation.
Defaults to avbelkin/nasa-space-apps-sg.

.PARAMETER Region
Artifact Registry, Cloud Run, and optional Cloud Storage region. Defaults to asia-southeast1.

.PARAMETER ArtifactRepo
Artifact Registry Docker repository name. Defaults to cloud-run-source-deploy.

.PARAMETER ServiceName
Cloud Run service name. Defaults to earth-fire-calendar-api.

.PARAMETER DeployerServiceAccountName
CI/CD service account name impersonated by GitHub Actions. Defaults to github-deployer.

.PARAMETER RuntimeServiceAccountName
Dedicated least-privilege runtime service account name for the Cloud Run service.
Defaults to nasa-api-runtime.

.PARAMETER WorkloadPoolId
Workload Identity Pool ID in global location. Defaults to github-pool.

.PARAMETER WorkloadProviderId
Workload Identity OIDC Provider ID. Defaults to github-provider.

.PARAMETER FirmsMapKey
Optional NASA FIRMS API MAP_KEY value to upload as a new enabled version of secret firms-map-key.

.PARAMETER GeminiApiKey
Optional Gemini API key value to upload as a new enabled version of secret gemini-api-key.

.PARAMETER PromptForSecrets
Prompts interactively (masked input) for FIRMS_MAP_KEY and GEMINI_API_KEY so values never
enter shell history. Press Enter to skip either secret.

.PARAMETER CreateProject
Creates ProjectId if it does not already exist.

.PARAMETER CreateStorageBucket
Creates a regional Cloud Storage bucket (<ProjectId>-fire-harmonization) with uniform
bucket-level access and grants objectViewer to the Cloud Run runtime service account.

.PARAMETER EnableVertexAi
Enables aiplatform.googleapis.com (Vertex AI) and grants roles/aiplatform.user to the
Cloud Run runtime service account so Gemini models can be called via IAM without API keys.

.PARAMETER MonthlyBudgetAmount
Optional monthly Cloud Billing budget alert amount in the billing account's currency
(creates alerts at 50%, 80%, 100%). Alias: MonthlyBudgetUsd.

.PARAMETER SyncGitHubVars
Pushes the computed GCP_* repository variables directly to GitHubRepo using the gh CLI.

.EXAMPLE
.\scripts\bootstrap-gcp-cloudrun.ps1 -PromptForSecrets -CreateStorageBucket -EnableVertexAi -MonthlyBudgetAmount 100 -SyncGitHubVars

.EXAMPLE
.\scripts\bootstrap-gcp-cloudrun.ps1 -ProjectId earth-fire-calendar-sg -BillingAccountId 012345-6789AB-CDEF01 -CreateProject -CreateStorageBucket -SyncGitHubVars
#>
[CmdletBinding()]
param(
    [ValidateNotNullOrEmpty()]
    [string]$ProjectId = "earth-fire-calendar-sg",

    [string]$BillingAccountId = "",

    [string]$GitHubRepo = "avbelkin/nasa-space-apps-sg",

    [string]$Region = "asia-southeast1",

    [string]$ArtifactRepo = "cloud-run-source-deploy",

    [string]$ServiceName = "earth-fire-calendar-api",

    [string]$DeployerServiceAccountName = "github-deployer",

    [string]$RuntimeServiceAccountName = "nasa-api-runtime",

    [string]$WorkloadPoolId = "github-pool",

    [string]$WorkloadProviderId = "github-provider",

    [string]$FirmsMapKey = "",

    [string]$GeminiApiKey = "",

    [switch]$PromptForSecrets,

    [switch]$CreateProject,

    [switch]$CreateStorageBucket,

    [switch]$EnableVertexAi,

    [Alias("MonthlyBudgetUsd")]
    [ValidateRange(0, 1000000)]
    [int]$MonthlyBudgetAmount = 0,

    [switch]$SyncGitHubVars
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

function Invoke-NativeCli {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Executable,
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments,
        [switch]$SuppressAllOutput
    )

    # Temporarily allow native stderr status lines without triggering PS 5.1 NativeCommandError.
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        if ($SuppressAllOutput) {
            & $Executable @Arguments *> $null
            $stdout = $null
        }
        else {
            $stdout = & $Executable @Arguments
        }
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousPreference
    }

    return [PSCustomObject]@{
        ExitCode = $exitCode
        Stdout   = $stdout
    }
}

function Invoke-CheckedCli {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Executable,
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    $result = Invoke-NativeCli -Executable $Executable -Arguments $Arguments
    if ($result.ExitCode -ne 0) {
        throw "$Executable $($Arguments -join ' ') failed with exit code $($result.ExitCode)."
    }

    return $result.Stdout
}

function Invoke-Gcloud {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    return (Invoke-CheckedCli -Executable "gcloud" -Arguments $Arguments)
}

function Get-GcloudValue {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    $output = Invoke-Gcloud -Arguments $Arguments
    if ($null -eq $output) {
        return ""
    }

    return (($output | Out-String).Trim())
}

function Test-GcloudResource {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    $result = Invoke-NativeCli -Executable "gcloud" -Arguments $Arguments -SuppressAllOutput
    return ($result.ExitCode -eq 0)
}

function Invoke-GcloudWithRetry {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments,
        [int]$MaxAttempts = 3,
        [int]$DelaySeconds = 3
    )

    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
        try {
            return (Invoke-Gcloud -Arguments $Arguments)
        }
        catch {
            if ($attempt -ge $MaxAttempts) {
                throw
            }
            Write-Host "    IAM propagation retry ($attempt/$MaxAttempts) in ${DelaySeconds}s..." -ForegroundColor Yellow
            Start-Sleep -Seconds $DelaySeconds
        }
    }
}

function ConvertFrom-SecureInput {
    param([System.Security.SecureString]$SecureValue)

    if ($null -eq $SecureValue -or $SecureValue.Length -eq 0) {
        return ""
    }

    $bstr = [System.IntPtr]::Zero
    try {
        $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
        return [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    }
    finally {
        if ($bstr -ne [System.IntPtr]::Zero) {
            [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
        }
    }
}

function Initialize-ServiceAccount {
    param(
        [Parameter(Mandatory = $true)]
        [string]$AccountName,
        [Parameter(Mandatory = $true)]
        [string]$DisplayName
    )

    $email = "$AccountName@$ProjectId.iam.gserviceaccount.com"
    if (Test-GcloudResource -Arguments @("iam", "service-accounts", "describe", $email, "--project=$ProjectId", "--quiet")) {
        Write-Host "    Exists: $email" -ForegroundColor DarkGray
    }
    else {
        Write-Host "    Creating: $email"
        $null = Invoke-Gcloud -Arguments @(
            "iam", "service-accounts", "create", $AccountName,
            "--project=$ProjectId",
            "--display-name=$DisplayName",
            "--quiet"
        )
    }

    return $email
}

function Initialize-SecretBinding {
    param(
        [Parameter(Mandatory = $true)]
        [string]$SecretName,
        [Parameter(Mandatory = $true)]
        [string]$EnvVarName,
        [string]$SecretValue,
        [Parameter(Mandatory = $true)]
        [string]$RuntimeSaEmail
    )

    if (Test-GcloudResource -Arguments @("secrets", "describe", $SecretName, "--project=$ProjectId", "--quiet")) {
        Write-Host "    Secret container exists: $SecretName" -ForegroundColor DarkGray
    }
    else {
        Write-Host "    Creating secret container: $SecretName"
        $null = Invoke-Gcloud -Arguments @(
            "secrets", "create", $SecretName,
            "--project=$ProjectId",
            "--replication-policy=automatic",
            "--quiet"
        )
    }

    $null = Invoke-GcloudWithRetry -Arguments @(
        "secrets", "add-iam-policy-binding", $SecretName,
        "--project=$ProjectId",
        "--member=serviceAccount:$RuntimeSaEmail",
        "--role=roles/secretmanager.secretAccessor",
        "--condition=None",
        "--quiet"
    )

    $trimmedValue = if ($null -ne $SecretValue) { $SecretValue.Trim() } else { "" }
    if (-not [string]::IsNullOrEmpty($trimmedValue)) {
        $tmpFile = Join-Path ([System.IO.Path]::GetTempPath()) ("efc-secret-" + [System.Guid]::NewGuid().ToString("N") + ".tmp")
        try {
            # Write exact UTF-8 bytes without BOM or trailing newline so API keys match verbatim.
            $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
            [System.IO.File]::WriteAllBytes($tmpFile, $utf8NoBom.GetBytes($trimmedValue))
            Write-Host "    Adding new secret version to $SecretName"
            $null = Invoke-Gcloud -Arguments @(
                "secrets", "versions", "add", $SecretName,
                "--project=$ProjectId",
                "--data-file=$tmpFile",
                "--quiet"
            )
        }
        finally {
            if (Test-Path -LiteralPath $tmpFile) {
                Remove-Item -LiteralPath $tmpFile -Force -ErrorAction SilentlyContinue
            }
        }
    }

    $enabledVersion = Get-GcloudValue -Arguments @(
        "secrets", "versions", "list", $SecretName,
        "--project=$ProjectId",
        "--filter=state=ENABLED",
        "--limit=1",
        "--format=value(name)",
        "--quiet"
    )

    if (-not [string]::IsNullOrWhiteSpace($enabledVersion)) {
        return "${EnvVarName}=${SecretName}:latest"
    }

    return $null
}

# 1. Pre-flight checks & billing verification
Write-Step "Running pre-flight checks"

if ($GitHubRepo -notmatch '^[^/\s]+/[^/\s]+$') {
    throw "GitHubRepo '$GitHubRepo' must be in 'owner/repo' format."
}

$gcloudFallbacks = @(
    "C:\Program Files (x86)\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd",
    "C:\Program Files\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd",
    "$env:LOCALAPPDATA\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
)
$resolvedGcloud = Resolve-CliExecutable -CommandName "gcloud" -FallbackPaths $gcloudFallbacks
if ([string]::IsNullOrWhiteSpace($resolvedGcloud)) {
    throw "Google Cloud CLI ('gcloud') was not found on PATH or standard install directories. Install it from https://cloud.google.com/sdk/docs/install and retry."
}
Write-Host "    Using gcloud: $resolvedGcloud" -ForegroundColor DarkGray

$activeAccount = Get-GcloudValue -Arguments @("auth", "list", "--filter=status:ACTIVE", "--format=value(account)", "--quiet")
if ([string]::IsNullOrWhiteSpace($activeAccount)) {
    Write-Host "No active gcloud account found. Run 'gcloud auth login' first, then re-run this script." -ForegroundColor Red
    exit 1
}
Write-Host "    Active gcloud account: $activeAccount"

if (Test-GcloudResource -Arguments @("projects", "describe", $ProjectId, "--quiet")) {
    Write-Host "    Project exists: $ProjectId" -ForegroundColor DarkGray
}
elseif ($CreateProject) {
    Write-Host "    Creating project: $ProjectId"
    $null = Invoke-Gcloud -Arguments @("projects", "create", $ProjectId, "--quiet")
}
else {
    throw "Project '$ProjectId' does not exist or is inaccessible. Create it or pass -CreateProject."
}

if (-not [string]::IsNullOrWhiteSpace($BillingAccountId)) {
    Write-Host "    Linking billing account $BillingAccountId to $ProjectId"
    $null = Invoke-Gcloud -Arguments @(
        "billing", "projects", "link", $ProjectId,
        "--billing-account=$BillingAccountId",
        "--quiet"
    )
}

$billingEnabled = Get-GcloudValue -Arguments @(
    "billing", "projects", "describe", $ProjectId,
    "--format=value(billingEnabled)",
    "--quiet"
)

if ($billingEnabled -ne "True") {
    Write-Host ""
    Write-Host "Cloud Billing is NOT enabled on project '$ProjectId'." -ForegroundColor Yellow
    Write-Host "To apply your Google AI Ultra / Google Developer Program monthly Cloud credits:" -ForegroundColor Yellow
    Write-Host "  1. Claim your developer credits at https://aistudio.google.com or https://developers.google.com/program"
    Write-Host "  2. Locate the Billing Account ID carrying those credits below:"
    Write-Host ""

    $null = Invoke-NativeCli -Executable "gcloud" -Arguments @("billing", "accounts", "list")

    Write-Host ""
    Write-Host "  3. Re-run this script with -BillingAccountId <ACCOUNT_ID> (or link the project in Cloud Console)." -ForegroundColor Yellow
    exit 1
}

Write-Host "    Cloud Billing enabled on $ProjectId"

# 2. Enable required GCP APIs
Write-Step "Enabling required Google Cloud APIs on $ProjectId"
$apisToEnable = @(
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "sts.googleapis.com",
    "secretmanager.googleapis.com",
    "cloudresourcemanager.googleapis.com"
)
if ($CreateStorageBucket) {
    $apisToEnable += "storage.googleapis.com"
}
if ($EnableVertexAi) {
    $apisToEnable += "aiplatform.googleapis.com"
}
if ($MonthlyBudgetAmount -gt 0) {
    $apisToEnable += "billingbudgets.googleapis.com"
}

$null = Invoke-Gcloud -Arguments (@("services", "enable", "--project=$ProjectId", "--quiet") + $apisToEnable)
Write-Host "    Enabled $($apisToEnable.Count) APIs"

# 3. Artifact Registry repository
Write-Step "Ensuring Artifact Registry Docker repository '$ArtifactRepo' in $Region"
if (Test-GcloudResource -Arguments @("artifacts", "repositories", "describe", $ArtifactRepo, "--project=$ProjectId", "--location=$Region", "--quiet")) {
    Write-Host "    Exists: $Region-docker.pkg.dev/$ProjectId/$ArtifactRepo" -ForegroundColor DarkGray
}
else {
    Write-Host "    Creating: $Region-docker.pkg.dev/$ProjectId/$ArtifactRepo"
    $null = Invoke-Gcloud -Arguments @(
        "artifacts", "repositories", "create", $ArtifactRepo,
        "--project=$ProjectId",
        "--location=$Region",
        "--repository-format=docker",
        "--description=Earth-Fire-Calendar-containers",
        "--quiet"
    )
}

# 4. Service accounts & least-privilege IAM
Write-Step "Provisioning service accounts and IAM bindings"
$runtimeSaEmail = Initialize-ServiceAccount -AccountName $RuntimeServiceAccountName -DisplayName "Earth-Fire-Calendar-API-Runtime"
$deployerSaEmail = Initialize-ServiceAccount -AccountName $DeployerServiceAccountName -DisplayName "GitHub-Actions-Cloud-Run-Deployer"

$deployerProjectRoles = @(
    "roles/run.admin",
    "roles/artifactregistry.writer",
    "roles/iam.serviceAccountUser"
)

foreach ($role in $deployerProjectRoles) {
    Write-Host "    Granting $role to $deployerSaEmail on $ProjectId"
    $null = Invoke-GcloudWithRetry -Arguments @(
        "projects", "add-iam-policy-binding", $ProjectId,
        "--member=serviceAccount:$deployerSaEmail",
        "--role=$role",
        "--condition=None",
        "--quiet"
    )
}

Write-Host "    Granting roles/iam.serviceAccountUser on $runtimeSaEmail to $deployerSaEmail"
$null = Invoke-GcloudWithRetry -Arguments @(
    "iam", "service-accounts", "add-iam-policy-binding", $runtimeSaEmail,
    "--project=$ProjectId",
    "--member=serviceAccount:$deployerSaEmail",
    "--role=roles/iam.serviceAccountUser",
    "--condition=None",
    "--quiet"
)

if ($EnableVertexAi) {
    Write-Host "    Granting roles/aiplatform.user to $runtimeSaEmail on $ProjectId"
    $null = Invoke-GcloudWithRetry -Arguments @(
        "projects", "add-iam-policy-binding", $ProjectId,
        "--member=serviceAccount:$runtimeSaEmail",
        "--role=roles/aiplatform.user",
        "--condition=None",
        "--quiet"
    )
}

# 5. Workload Identity Pool & GitHub OIDC Provider
Write-Step "Configuring GitHub Actions Workload Identity Federation (OIDC)"
if (Test-GcloudResource -Arguments @("iam", "workload-identity-pools", "describe", $WorkloadPoolId, "--project=$ProjectId", "--location=global", "--quiet")) {
    $poolState = Get-GcloudValue -Arguments @(
        "iam", "workload-identity-pools", "describe", $WorkloadPoolId,
        "--project=$ProjectId",
        "--location=global",
        "--format=value(state)",
        "--quiet"
    )
    if ($poolState -eq "DELETED") {
        Write-Host "    Undeleting pool: $WorkloadPoolId"
        $null = Invoke-Gcloud -Arguments @(
            "iam", "workload-identity-pools", "undelete", $WorkloadPoolId,
            "--project=$ProjectId",
            "--location=global",
            "--quiet"
        )
    }
    else {
        Write-Host "    Pool exists: $WorkloadPoolId" -ForegroundColor DarkGray
    }
}
else {
    Write-Host "    Creating pool: $WorkloadPoolId"
    $null = Invoke-Gcloud -Arguments @(
        "iam", "workload-identity-pools", "create", $WorkloadPoolId,
        "--project=$ProjectId",
        "--location=global",
        "--display-name=GitHub-Actions-Pool",
        "--quiet"
    )
}

$poolResourceName = Get-GcloudValue -Arguments @(
    "iam", "workload-identity-pools", "describe", $WorkloadPoolId,
    "--project=$ProjectId",
    "--location=global",
    "--format=value(name)",
    "--quiet"
)

$attrMapping = "google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner"
# Keep the CEL condition free of spaces so cmd.exe batch forwarding inside gcloud.cmd never splits it.
$attrCondition = "assertion.repository=='$GitHubRepo'"

if (Test-GcloudResource -Arguments @(
    "iam", "workload-identity-pools", "providers", "describe", $WorkloadProviderId,
    "--project=$ProjectId",
    "--location=global",
    "--workload-identity-pool=$WorkloadPoolId",
    "--quiet"
)) {
    $providerState = Get-GcloudValue -Arguments @(
        "iam", "workload-identity-pools", "providers", "describe", $WorkloadProviderId,
        "--project=$ProjectId",
        "--location=global",
        "--workload-identity-pool=$WorkloadPoolId",
        "--format=value(state)",
        "--quiet"
    )
    if ($providerState -eq "DELETED") {
        Write-Host "    Undeleting OIDC provider: $WorkloadProviderId"
        $null = Invoke-Gcloud -Arguments @(
            "iam", "workload-identity-pools", "providers", "undelete", $WorkloadProviderId,
            "--project=$ProjectId",
            "--location=global",
            "--workload-identity-pool=$WorkloadPoolId",
            "--quiet"
        )
    }
    Write-Host "    Updating OIDC provider condition for repository $GitHubRepo"
    $null = Invoke-Gcloud -Arguments @(
        "iam", "workload-identity-pools", "providers", "update-oidc", $WorkloadProviderId,
        "--project=$ProjectId",
        "--location=global",
        "--workload-identity-pool=$WorkloadPoolId",
        "--issuer-uri=https://token.actions.githubusercontent.com",
        "--attribute-mapping=$attrMapping",
        "--attribute-condition=$attrCondition",
        "--quiet"
    )
}
else {
    Write-Host "    Creating OIDC provider: $WorkloadProviderId"
    $null = Invoke-Gcloud -Arguments @(
        "iam", "workload-identity-pools", "providers", "create-oidc", $WorkloadProviderId,
        "--project=$ProjectId",
        "--location=global",
        "--workload-identity-pool=$WorkloadPoolId",
        "--display-name=GitHub-Actions-OIDC",
        "--issuer-uri=https://token.actions.githubusercontent.com",
        "--attribute-mapping=$attrMapping",
        "--attribute-condition=$attrCondition",
        "--quiet"
    )
}

$providerResourceName = Get-GcloudValue -Arguments @(
    "iam", "workload-identity-pools", "providers", "describe", $WorkloadProviderId,
    "--project=$ProjectId",
    "--location=global",
    "--workload-identity-pool=$WorkloadPoolId",
    "--format=value(name)",
    "--quiet"
)

Write-Host "    Binding roles/iam.workloadIdentityUser for $GitHubRepo"
$null = Invoke-GcloudWithRetry -Arguments @(
    "iam", "service-accounts", "add-iam-policy-binding", $deployerSaEmail,
    "--project=$ProjectId",
    "--role=roles/iam.workloadIdentityUser",
    "--member=principalSet://iam.googleapis.com/$poolResourceName/attribute.repository/$GitHubRepo",
    "--condition=None",
    "--quiet"
)

# 6. Secret Manager containers & optional key versions
Write-Step "Configuring Google Secret Manager for API keys"
if ($PromptForSecrets) {
    if ([string]::IsNullOrWhiteSpace($FirmsMapKey)) {
        $secureFirms = Read-Host -Prompt "Enter NASA FIRMS MAP_KEY (press Enter to skip)" -AsSecureString
        $FirmsMapKey = ConvertFrom-SecureInput -SecureValue $secureFirms
    }
    if ([string]::IsNullOrWhiteSpace($GeminiApiKey)) {
        $secureGemini = Read-Host -Prompt "Enter Gemini API key (press Enter to skip)" -AsSecureString
        $GeminiApiKey = ConvertFrom-SecureInput -SecureValue $secureGemini
    }
}

if (-not [string]::IsNullOrWhiteSpace($FirmsMapKey)) {
    $trimmedFirmsKey = $FirmsMapKey.Trim()
    if ($trimmedFirmsKey -notmatch '^[0-9a-fA-F]{32}$') {
        throw "Invalid NASA FIRMS MAP_KEY format (received $($trimmedFirmsKey.Length) chars; expected 32 hexadecimal characters). Check your clipboard and re-run."
    }
    $FirmsMapKey = $trimmedFirmsKey
}

$secretSpecs = @(
    @{ Name = "firms-map-key"; EnvVar = "FIRMS_MAP_KEY"; Value = $FirmsMapKey },
    @{ Name = "gemini-api-key"; EnvVar = "GEMINI_API_KEY"; Value = $GeminiApiKey }
)

$cloudRunSecretBindings = New-Object System.Collections.Generic.List[string]
foreach ($spec in $secretSpecs) {
    $binding = Initialize-SecretBinding `
        -SecretName $spec.Name `
        -EnvVarName $spec.EnvVar `
        -SecretValue $spec.Value `
        -RuntimeSaEmail $runtimeSaEmail

    if (-not [string]::IsNullOrWhiteSpace($binding)) {
        $cloudRunSecretBindings.Add($binding)
    }
}
$cloudRunSecretsSpec = $cloudRunSecretBindings -join ","

# 7. Optional Cloud Storage bucket for harmonized baselines
if ($CreateStorageBucket) {
    Write-Step "Configuring Cloud Storage bucket for harmonized MODIS/VIIRS baselines"
    $bucketName = "$ProjectId-fire-harmonization"
    $bucketUri = "gs://$bucketName"

    if (Test-GcloudResource -Arguments @("storage", "buckets", "describe", $bucketUri, "--project=$ProjectId", "--quiet")) {
        Write-Host "    Bucket exists: $bucketUri" -ForegroundColor DarkGray
    }
    else {
        Write-Host "    Creating bucket: $bucketUri ($Region)"
        $null = Invoke-Gcloud -Arguments @(
            "storage", "buckets", "create", $bucketUri,
            "--project=$ProjectId",
            "--location=$Region",
            "--uniform-bucket-level-access",
            "--quiet"
        )
    }

    Write-Host "    Granting roles/storage.objectViewer on $bucketUri to $runtimeSaEmail"
    $null = Invoke-GcloudWithRetry -Arguments @(
        "storage", "buckets", "add-iam-policy-binding", $bucketUri,
        "--member=serviceAccount:$runtimeSaEmail",
        "--role=roles/storage.objectViewer",
        "--condition=None",
        "--quiet"
    )
}

# 8. Optional Cloud Billing monthly budget alert
if ($MonthlyBudgetAmount -gt 0) {
    Write-Step "Configuring Cloud Billing budget alert ($MonthlyBudgetAmount/month)"
    try {
        $billingAccountName = Get-GcloudValue -Arguments @(
            "billing", "projects", "describe", $ProjectId,
            "--format=value(billingAccountName)",
            "--quiet"
        )
        $resolvedBillingAccountId = $billingAccountName -replace '^billingAccounts/', ''
        $currencyCode = Get-GcloudValue -Arguments @(
            "billing", "accounts", "describe", $resolvedBillingAccountId,
            "--format=value(currencyCode)",
            "--quiet"
        )
        if ([string]::IsNullOrWhiteSpace($currencyCode)) {
            $currencyCode = "USD"
        }
        $budgetDisplayName = "earth-fire-calendar-budget"

        $existingBudgetsRaw = Get-GcloudValue -Arguments @(
            "billing", "budgets", "list",
            "--billing-account=$resolvedBillingAccountId",
            "--billing-project=$ProjectId",
            "--format=value(displayName)",
            "--quiet"
        )
        $existingBudgetNames = $existingBudgetsRaw -split "`r?`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" }

        if ($existingBudgetNames -contains $budgetDisplayName) {
            Write-Host "    Budget exists: $budgetDisplayName" -ForegroundColor DarkGray
        }
        else {
            Write-Host "    Creating budget '$budgetDisplayName' ($MonthlyBudgetAmount $currencyCode, thresholds 50%/80%/100%)"
            $null = Invoke-Gcloud -Arguments @(
                "billing", "budgets", "create",
                "--billing-account=$resolvedBillingAccountId",
                "--billing-project=$ProjectId",
                "--display-name=$budgetDisplayName",
                "--filter-projects=projects/$ProjectId",
                "--budget-amount=${MonthlyBudgetAmount}${currencyCode}",
                "--threshold-rule=percent=0.5",
                "--threshold-rule=percent=0.8",
                "--threshold-rule=percent=1.0",
                "--quiet"
            )
        }
    }
    catch {
        Write-Warning "Could not create Cloud Billing budget automatically ($($_.Exception.Message)). Ensure you have Billing Account Administrator or Costs Manager permissions, or configure the alert in Cloud Console Billing."
    }
}

# 9. GitHub Actions variable output & optional gh sync
$repoVars = [ordered]@{
    GCP_PROJECT_ID                 = $ProjectId
    GCP_WORKLOAD_IDENTITY_PROVIDER = $providerResourceName
    GCP_SERVICE_ACCOUNT            = $deployerSaEmail
    GCP_RUNTIME_SERVICE_ACCOUNT    = $runtimeSaEmail
    GCP_REGION                     = $Region
    GCP_ARTIFACT_REPO              = $ArtifactRepo
    GCP_SERVICE_NAME               = $ServiceName
    GCP_MIN_INSTANCES              = "1"
    GCP_MAX_INSTANCES              = "4"
    GCP_CPU                        = "1"
    GCP_MEMORY                     = "1Gi"
    GCP_CONCURRENCY                = "80"
}

if (-not [string]::IsNullOrWhiteSpace($cloudRunSecretsSpec)) {
    $repoVars["GCP_CLOUDRUN_SECRETS"] = $cloudRunSecretsSpec
}

Write-Step "Bootstrap complete! GitHub Actions Repository Variables for $GitHubRepo"
foreach ($entry in $repoVars.GetEnumerator()) {
    Write-Host ("  {0,-32} = {1}" -f $entry.Key, $entry.Value)
}

if ([string]::IsNullOrWhiteSpace($cloudRunSecretsSpec)) {
    Write-Host ""
    Write-Host "  Note: No enabled secret versions were detected yet for firms-map-key or gemini-api-key." -ForegroundColor Yellow
    Write-Host "        Once you add a key version in Secret Manager (or re-run with -PromptForSecrets)," -ForegroundColor Yellow
    Write-Host "        set GCP_CLOUDRUN_SECRETS accordingly." -ForegroundColor Yellow
}

if ($SyncGitHubVars) {
    Write-Step "Syncing repository variables to $GitHubRepo via GitHub CLI"
    $ghFallbacks = @(
        "C:\Program Files\GitHub CLI\gh.exe",
        "C:\Program Files (x86)\GitHub CLI\gh.exe"
    )
    $resolvedGh = Resolve-CliExecutable -CommandName "gh" -FallbackPaths $ghFallbacks
    if ([string]::IsNullOrWhiteSpace($resolvedGh)) {
        throw "GitHub CLI ('gh') was not found on PATH or standard install directories. Install it from https://cli.github.com/ or set the variables above in GitHub Settings."
    }

    $null = Invoke-CheckedCli -Executable "gh" -Arguments @("auth", "status")
    foreach ($entry in $repoVars.GetEnumerator()) {
        Write-Host "    Setting $($entry.Key)"
        $null = Invoke-CheckedCli -Executable "gh" -Arguments @("variable", "set", $entry.Key, "--body", $entry.Value, "--repo", $GitHubRepo)
    }
    Write-Host "    Synced $($repoVars.Count) GitHub repository variables."
}
else {
    Write-Host ""
    Write-Host "Tip: Re-run with -SyncGitHubVars (requires 'gh auth login') to push these variables to GitHub automatically." -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "Next steps:" -ForegroundColor Green
Write-Host "  1. Run the 'Build and Deploy Backend to Cloud Run' workflow (or push to backend/**)."
Write-Host "  2. Copy the deployed Cloud Run URL from the workflow summary and set GitHub variable VITE_API_BASE_URL."
Write-Host "  3. After hackathon judging, set GCP_MIN_INSTANCES=0 if you want Cloud Run to scale back to zero."
