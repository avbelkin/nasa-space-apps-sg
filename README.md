# NASA Space Apps SG

## Project Purpose

Built for the **2026 NASA Space Apps Challenge — [Harmonization of MODIS and VIIRS Hot Spots](https://www.spaceappschallenge.org/2026/challenges/modis-and-viirs-hot-spots/?tab=details)**. Rather than a calendar-first grid, our **Earth-first** visualization uses **MapLibre GL JS** to display seasonal burning dynamics alongside the current situation—showing where fire activity fits typical calendar patterns and where calendar anomalies emerge across harmonized **MODIS** (~1 km, 2000–present) and **VIIRS** (375 m, 2012–present) records.

- [doc/README.md](doc/README.md) — Challenge background, Earth-first seasonal & anomaly approach, target users, and NASA FIRMS data sources.
- [doc/architecture-and-harmonization.md](doc/architecture-and-harmonization.md) — MapLibre two-tier CSS Grid layout, UI/backend split, and harmonization pipeline design notes.

## Stack

- **`ui/`** — Pure React + TypeScript + Vite + **MapLibre GL JS** (`maplibre-gl`) static SPA published to **GitHub Pages**, using an outer CSS Grid wrapper around a nested CSS Grid map stage with over-map controls.
- **`backend/`** — ASP.NET Core (`.NET 10`) Minimal API containerized for **Google Cloud Run**.

## Team Git Workflow

- Commit and push intermediate milestones promptly to `origin/main` so all team members stay synced with the latest working changes (see [AGENTS.md](AGENTS.md)).

## Local Development

### 1. Backend (`http://localhost:5180`)

```powershell
dotnet run --project backend/NasaSpaceApps.Api
```

Endpoints:
- `GET /health`
- `GET /api/status`

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

### Backend (`deploy-backend.yml` -> Google Cloud Run)

Always runs a `.NET 10` Release build check on pushes to `backend/**`. The Cloud Run deployment job runs once these GitHub repository variables are configured:

| Variable | Description | Default / Example |
| :--- | :--- | :--- |
| `GCP_PROJECT_ID` | Target Google Cloud project ID | `nasa-space-apps-sg-2026` |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Full Workload Identity Provider resource name for GitHub OIDC | `projects/<num>/locations/global/workloadIdentityPools/.../providers/...` |
| `GCP_SERVICE_ACCOUNT` | Service account email used by GitHub Actions | `github-deployer@<project>.iam.gserviceaccount.com` |
| `GCP_REGION` | Optional Artifact Registry & Cloud Run region | `asia-southeast1` |
| `GCP_ARTIFACT_REPO` | Optional Artifact Registry Docker repository name | `cloud-run-source-deploy` |
| `GCP_SERVICE_NAME` | Optional Cloud Run service name | `nasa-space-apps-api` |
