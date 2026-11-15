# Earth Fire Calendar

## Project Purpose

**Earth Fire Calendar** *(provisional title, subject to reconsideration later)* is an independent entry built for the **2026 NASA Space Apps Challenge — [Harmonization of MODIS and VIIRS Hot Spots](https://www.spaceappschallenge.org/2026/challenges/modis-and-viirs-hot-spots/?tab=details)**. It is not affiliated with, endorsed by, or an official product of NASA, and does not use NASA branding or logos. Our **Earth-first** visualization uses **MapLibre GL JS** to compare live **MODIS** (~1 km) and **VIIRS** (375 m) active-fire detections side by side and to attach viewing geometry, land cover, and weather at acquisition to each detection, as evidence for harmonizing the two records. It attributes **NASA FIRMS**, **CelesTrak**, and **EOX/Copernicus** data sources; the full list is in the app's **Sources and credits**.

- [doc/README.md](doc/README.md) — Challenge background, application purpose (what works now and what is exploratory), target users, and NASA FIRMS data sources.
- [doc/architecture-and-harmonization.md](doc/architecture-and-harmonization.md) — MapLibre two-tier CSS Grid layout, UI/backend split, and harmonization pipeline design notes.
- [doc/cloud-run-and-credits.md](doc/cloud-run-and-credits.md) — Google Cloud Run scaling/hibernation modes, Vertex AI & Secret Manager setup, and Google AI Ultra credits guide.

## Public Availability

- **Live Web UI (GitHub Pages)**: [https://avbelkin.github.io/nasa-space-apps-sg](https://avbelkin.github.io/nasa-space-apps-sg) — publicly accessible React + MapLibre 3D globe SPA deployed automatically from `main` via [`.github/workflows/deploy-ui.yml`](.github/workflows/deploy-ui.yml).
- **Backend API (Google Cloud Run, `asia-southeast1`)**: `https://earth-fire-calendar-api-354cntvldq-as.a.run.app` (`/health`, `/api/status`, `/api/firms/status`, `/api/fires/spots`, `/api/fires/spots.geojson`, `/api/hotspots`, `/api/nasa/status`, `/api/nasa/epic`, `/api/nasa/wildfires`, `/api/satellites/orbits`).

## Stack

- **`ui/`** — Pure React + TypeScript + Vite + **MapLibre GL JS** (`maplibre-gl`) static SPA published to **GitHub Pages**, defaulting to a **3D Globe** view over **EOX Sentinel-2 Cloudless** imagery inside an outer CSS Grid wrapper and nested CSS Grid map stage with over-map controls, live 24h NASA FIRMS WebGL pulsing active-fire spots, and CelesTrak satellite orbits.
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
- `GET /api/status` — Service metadata plus safe `FIRMS_MAP_KEY` & `NASA_API_KEY` configuration/format diagnostics (reads env vars / configuration / Windows User env in Development)
- `GET /api/firms/status` — Cached NASA FIRMS `mapkey_status` quota check & `data_availability` windows
- `GET /api/fires/spots?hours=1..48&sensor=harmonized|modis|viirs&bbox=w,s,e,n` — Cached 20-minute rolling 24h (`MODIS_NRT`, `VIIRS_NOAA20_NRT`, `VIIRS_NOAA21_NRT`) compact fire spot feed queried directly from NASA FIRMS Area API (`api/area/csv`)
- `GET /api/fires/spots.geojson?hours=1..48&sensor=harmonized|modis|viirs&bbox=w,s,e,n` — GeoJSON FeatureCollection variant of the cached NASA FIRMS active-fire Area API feed
- `GET /api/hotspots?bbox=west,south,east,north&days=1..5&sensor=all|modis|viirs` — Cached live MODIS & VIIRS active-fire detections from NASA FIRMS
- `GET /api/nasa/status` — Cached `api.nasa.gov` (`NASA_API_KEY`) reachability, `X-RateLimit-Limit` / `Remaining` quota, and latest DSCOVR EPIC observation check
- `GET /api/nasa/epic` — Cached latest DSCOVR EPIC natural-color Earth imagery metadata & archive PNG URLs via `api.nasa.gov`
- `GET /api/nasa/wildfires?status=open|closed|all&days=1..90&limit=1..200` — Cached NASA EONET v3 global wildfire event metadata
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

The built static site is publicly published at [https://avbelkin.github.io/nasa-space-apps-sg](https://avbelkin.github.io/nasa-space-apps-sg).

Repository variables under **Settings -> Secrets and variables -> Actions -> Variables**:

| Variable | Description | Example |
| :--- | :--- | :--- |
| `VITE_API_BASE_URL` | Public HTTPS URL of the Cloud Run backend service | `https://earth-fire-calendar-api-354cntvldq-as.a.run.app` |
| `VITE_BASE_PATH` | Optional base path override (defaults to `/<repo-name>/` in workflow) | `/nasa-space-apps-sg/` |
| `VITE_SITE_URL` | Optional canonical public site URL for Open Graph / X link preview tags (defaults to GitHub Pages `base_url`) | `https://avbelkin.github.io/nasa-space-apps-sg` |

### Backend (`deploy-backend.yml` -> Google Cloud Run)

Always runs a `.NET 10` Release build check on pushes to `backend/**`. See [doc/cloud-run-and-credits.md](doc/cloud-run-and-credits.md) for scaling details, Vertex AI setup, and credit management.

#### One-Shot Google Cloud Bootstrap (Google AI Ultra / Cloud Credits)

Run [scripts/bootstrap-gcp-cloudrun.ps1](scripts/bootstrap-gcp-cloudrun.ps1) against a Google Cloud project linked to the Cloud Billing account holding your Google AI Ultra / Google Developer Program monthly credits (or pass `-BillingAccountId <ACCOUNT_ID>` and optionally `-CreateProject`):

```powershell
.\scripts\bootstrap-gcp-cloudrun.ps1 `
  -PromptForSecrets `
  -CreateStorageBucket `
  -EnableVertexAi `
  -MonthlyBudgetAmount 100 `
  -SyncGitHubVars
```

This idempotently enables required GCP APIs (including Vertex AI when `-EnableVertexAi` is passed), creates the Artifact Registry Docker repository and optional GCS bucket, provisions Workload Identity Federation (GitHub OIDC) and least-privilege deployer/runtime service accounts, sets up Secret Manager (`firms-map-key`, `nasa-api-key`, `gemini-api-key`), optionally creates a monthly billing budget alert, and syncs the `GCP_*` variables below to GitHub Actions.

#### Switching Cloud Run Between Warm & Hibernate Modes

```powershell
# After hackathon submission (scales to zero when idle; $0 idle cost before final checks):
.\scripts\set-cloudrun-mode.ps1 -Mode hibernate

# Before final checks or live demos (keeps 1 warm instance & in-memory TLE/FIRMS caches):
.\scripts\set-cloudrun-mode.ps1 -Mode warm
```

#### GitHub Actions Variables

The Cloud Run deployment job runs once the required `GCP_*` repository variables are configured:

| Variable | Description | Default / Example |
| :--- | :--- | :--- |
| `GCP_PROJECT_ID` | Target Google Cloud project ID | `earth-fire-calendar-sg` |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Full Workload Identity Provider resource name for GitHub OIDC | `projects/<num>/locations/global/workloadIdentityPools/github-pool/providers/github-provider` |
| `GCP_SERVICE_ACCOUNT` | Service account email used by GitHub Actions | `github-deployer@<project>.iam.gserviceaccount.com` |
| `GCP_RUNTIME_SERVICE_ACCOUNT` | Optional least-privilege runtime service account for Cloud Run | `nasa-api-runtime@<project>.iam.gserviceaccount.com` |
| `GCP_CLOUDRUN_SECRETS` | Optional Secret Manager env bindings (`ENV=secret:version,...`) | `FIRMS_MAP_KEY=firms-map-key:latest,NASA_API_KEY=nasa-api-key:latest` |
| `GCP_REGION` | Optional Artifact Registry & Cloud Run region | `asia-southeast1` |
| `GCP_ARTIFACT_REPO` | Optional Artifact Registry Docker repository name | `cloud-run-source-deploy` |
| `GCP_SERVICE_NAME` | Optional Cloud Run service name | `earth-fire-calendar-api` |
| `GCP_MIN_INSTANCES` | Optional minimum warm instances (`1` during judging keeps CelesTrak/FIRMS caches warm; set `0` afterward to scale to zero) | `1` |
| `GCP_MAX_INSTANCES` | Optional maximum instance cap to protect monthly credits | `4` |
| `GCP_CPU` | Optional vCPU allocation per instance | `1` |
| `GCP_MEMORY` | Optional memory allocation per instance | `1Gi` |
| `GCP_CONCURRENCY` | Optional max concurrent requests per instance | `80` |
