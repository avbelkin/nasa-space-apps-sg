# Earth Fire Calendar

## Project Purpose

**Earth Fire Calendar** *(provisional title, subject to reconsideration later)* is an independent entry built for the **2026 NASA Space Apps Challenge — [Harmonization of MODIS and VIIRS Hot Spots](https://www.spaceappschallenge.org/2026/challenges/modis-and-viirs-hot-spots/?tab=details)**. It is not affiliated with, endorsed by, or an official product of NASA, and does not use NASA branding or logos. Rather than a calendar-first grid, our **Earth-first** visualization uses **MapLibre GL JS** to display seasonal burning dynamics alongside the current situation—showing where fire activity fits typical calendar patterns and where calendar anomalies emerge across harmonized **MODIS** (~1 km, 2000–present) and **VIIRS** (375 m, 2012–present) records, attributing **NASA FIRMS**, **CelesTrak**, and **EOX/Copernicus** data sources.

- [doc/README.md](doc/README.md) — Challenge background, Earth-first seasonal & anomaly approach, target users, and NASA FIRMS data sources.
- [doc/architecture-and-harmonization.md](doc/architecture-and-harmonization.md) — MapLibre two-tier CSS Grid layout, UI/backend split, and harmonization pipeline design notes.

## Stack

- **`ui/`** — Pure React + TypeScript + Vite + **MapLibre GL JS** (`maplibre-gl`) static SPA published to **GitHub Pages**, defaulting to a **3D Globe** view over **EOX Sentinel-2 Cloudless** imagery inside an outer CSS Grid wrapper and nested CSS Grid map stage with over-map controls.
- **`backend/`** — ASP.NET Core (`.NET 10`) Minimal API containerized for **Google Cloud Run**.

## Team Git Workflow

- Commit and push intermediate milestones promptly to `origin/main` so all team members stay synced with the latest working changes (see [AGENTS.md](AGENTS.md)).

### Parallel Development with Git Worktrees

Start independent features in separate sibling worktrees so multiple tasks (or team/agent sessions) can be edited, built, and verified in parallel:

```powershell
# Create an isolated sibling worktree on a new feature branch
git worktree add ..\nasa-space-apps-sg-wt-<feature> -b feat/<feature> main

# List active worktrees
git worktree list

# Remove the worktree after merging into main
git worktree remove ..\nasa-space-apps-sg-wt-<feature>
```

## Local Development

### 1. Backend (`http://localhost:5180`)

```powershell
dotnet run --project backend/NasaSpaceApps.Api
```

Endpoints:
- `GET /health`
- `GET /api/status`
- `GET /api/satellites/orbits` — Cached CelesTrak TLE orbits & sensor swath parameters for MODIS (`Terra`, `Aqua`) and VIIRS (`NOAA-20`, `NOAA-21`)

### 2. Frontend (`http://localhost:5173`)

```powershell
cd ui
npm install
npm run dev
```

During local development, Vite proxies `/api` and `/health` requests to `http://localhost:5180`.

## GitHub Actions Deployment Configuration

### UI (`deploy-ui.yml` -> GitHub Pages)

Repository variables under **Settings -> Secrets and variables -> Actions -> Variables**:

| Variable | Description | Example |
| :--- | :--- | :--- |
| `VITE_API_BASE_URL` | Public HTTPS URL of the Cloud Run backend service | `https://nasa-space-apps-api-xxxx.asia-southeast1.run.app` |
| `VITE_BASE_PATH` | Optional base path override (defaults to `/<repo-name>/` in workflow) | `/nasa-space-apps-sg/` |
| `VITE_SITE_URL` | Optional canonical public site URL for Open Graph / X link preview tags (defaults to GitHub Pages `base_url`) | `https://avbelkin.github.io/nasa-space-apps-sg` |

### Backend (`deploy-backend.yml` -> Google Cloud Run)

Always runs a `.NET 10` Release build check on pushes to `backend/**`.

#### One-Shot Google Cloud Bootstrap (Google AI Ultra / Cloud Credits)

Run [scripts/bootstrap-gcp-cloudrun.ps1](scripts/bootstrap-gcp-cloudrun.ps1) against a Google Cloud project linked to the Cloud Billing account holding your Google AI Ultra / Google Developer Program monthly credits (or pass `-BillingAccountId <ACCOUNT_ID>` and optionally `-CreateProject` / `-CreateStorageBucket`):

```powershell
.\scripts\bootstrap-gcp-cloudrun.ps1 `
  -ProjectId nasa-space-apps-sg-2026 `
  -PromptForSecrets `
  -MonthlyBudgetUsd 80 `
  -SyncGitHubVars
```

This idempotently enables required GCP APIs, creates the Artifact Registry Docker repository, provisions Workload Identity Federation (GitHub OIDC) and least-privilege deployer/runtime service accounts, sets up Secret Manager (`firms-map-key`, `gemini-api-key`), optionally creates a monthly billing budget alert, and syncs the `GCP_*` variables below to GitHub Actions.

#### GitHub Actions Variables

The Cloud Run deployment job runs once the required `GCP_*` repository variables are configured:

| Variable | Description | Default / Example |
| :--- | :--- | :--- |
| `GCP_PROJECT_ID` | Target Google Cloud project ID | `nasa-space-apps-sg-2026` |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Full Workload Identity Provider resource name for GitHub OIDC | `projects/<num>/locations/global/workloadIdentityPools/.../providers/...` |
| `GCP_SERVICE_ACCOUNT` | Service account email used by GitHub Actions | `github-deployer@<project>.iam.gserviceaccount.com` |
| `GCP_RUNTIME_SERVICE_ACCOUNT` | Optional least-privilege runtime service account for Cloud Run | `nasa-api-runtime@<project>.iam.gserviceaccount.com` |
| `GCP_CLOUDRUN_SECRETS` | Optional Secret Manager env bindings (`ENV=secret:version,...`) | `FIRMS_MAP_KEY=firms-map-key:latest` |
| `GCP_REGION` | Optional Artifact Registry & Cloud Run region | `asia-southeast1` |
| `GCP_ARTIFACT_REPO` | Optional Artifact Registry Docker repository name | `cloud-run-source-deploy` |
| `GCP_SERVICE_NAME` | Optional Cloud Run service name | `nasa-space-apps-api` |
| `GCP_MIN_INSTANCES` | Optional minimum warm instances (`1` during judging keeps CelesTrak/FIRMS caches warm; set `0` afterward to scale to zero) | `1` |
| `GCP_MAX_INSTANCES` | Optional maximum instance cap to protect monthly credits | `4` |
| `GCP_CPU` | Optional vCPU allocation per instance | `1` |
| `GCP_MEMORY` | Optional memory allocation per instance | `1Gi` |
| `GCP_CONCURRENCY` | Optional max concurrent requests per instance | `80` |
